import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// What this repository already runs.
//
// Redline onboards two very different kinds of repository. One has nothing —
// no scanner, no gate, no ownership — and wants the whole setup. The other has
// a mature pipeline that already runs SonarQube, Mend and a linter, and wants
// exactly one thing Redline provides and nobody else does: the standards the
// AI reviews against, and a check that they were applied.
//
// Installing the first repository's answer into the second is the failure this
// module exists to prevent. A second secret scanner beside the one already
// wired is not defence in depth, it is two sets of findings, two exemption
// paths and two things to silence at 3am — and the team reads it as Redline
// not having looked. So detection runs BEFORE the menu is resolved, and what
// it finds deselects rather than duplicates.
//
// The rule for adding to this registry: a marker must be evidence the tool is
// WIRED, not merely present. A `sonar-project.properties` nobody references
// from a pipeline proves an intention, not a running scan — but it is still
// the strongest signal available from a checkout alone, so it is treated as
// evidence and the report says which marker matched. The operator can see the
// path Redline believed and override it with a flag; a silent guess is what
// would earn the mistrust.

// A Redline gate job that a tool already in the repository makes redundant.
// `null` means the finding is reported but stands nothing down: knowing that
// the repository builds on Azure Pipelines changes what Redline installs, it
// does not remove one of Redline's own checks.
export type StandsDown = 'secrets' | 'dependencies' | 'policy' | null;

export interface ToolProbe {
  // Stable id, recorded in `.redline.json` and quoted in the init report.
  readonly id: string;
  readonly label: string;
  // Paths that prove it, relative to the repository root. A directory matches
  // when it exists; a file when it exists.
  readonly paths?: readonly string[];
  // Substrings looked for inside CI definition files. Cheaper than parsing
  // YAML, and robust to the many shapes a task reference takes across Azure
  // Pipelines, GitHub Actions and the shared-template indirection both use.
  readonly inCi?: readonly string[];
  readonly standsDown: StandsDown;
}

export const TOOL_PROBES: readonly ToolProbe[] = [
  {
    id: 'sonarqube',
    label: 'SonarQube',
    paths: ['sonar-project.properties', 'sonar-project-enterprise.properties'],
    inCi: ['sonarqube', 'sonarcloud', 'SonarQubePrepare', 'sonar-scanner'],
    // SonarQube is a static analyser: it overlaps Redline's deterministic
    // policy tier, not its secret or dependency scanning.
    standsDown: 'policy',
  },
  {
    id: 'mend',
    label: 'Mend',
    paths: ['.whitesource', '.mend', 'mend.config.json'],
    inCi: ['mend', 'whitesource'],
    standsDown: 'dependencies',
  },
  {
    id: 'snyk',
    label: 'Snyk',
    paths: ['.snyk'],
    inCi: ['snyk'],
    standsDown: 'dependencies',
  },
  {
    id: 'dependabot',
    label: 'Dependabot',
    paths: ['.github/dependabot.yml', '.github/dependabot.yaml'],
    standsDown: 'dependencies',
  },
  {
    id: 'renovate',
    label: 'Renovate',
    paths: ['renovate.json', '.renovaterc', '.renovaterc.json', '.github/renovate.json'],
    inCi: ['renovate'],
    // Renovate raises upgrade pull requests; it does not fail a build on a
    // vulnerable dependency entering one. It is reported so the operator knows
    // Redline saw it, and stands nothing down.
    standsDown: null,
  },
  {
    id: 'gitleaks',
    label: 'gitleaks',
    paths: ['.gitleaks.toml', '.gitleaksignore'],
    inCi: ['gitleaks'],
    standsDown: 'secrets',
  },
  {
    id: 'trufflehog',
    label: 'trufflehog',
    inCi: ['trufflehog', 'trufflesecurity'],
    standsDown: 'secrets',
  },
  {
    id: 'codeql',
    label: 'CodeQL',
    inCi: ['github/codeql-action', 'codeql'],
    standsDown: 'policy',
  },
];

// Where CI definitions live. Azure Pipelines has no fixed location — VOXI keeps
// its stages under `cicd/` and its pull request template under `.vsts/` — so
// this is a list of the conventional homes rather than a spec. A repository
// that keeps its pipelines somewhere else is not detected, reports nothing, and
// gets the full install: the safe direction, because an undetected tool means
// Redline offers a check the repository may already have, which the operator
// can decline, rather than skipping one it does not.
const CI_DIRS = ['.github/workflows', 'cicd', '.azuredevops', '.vsts', '.pipelines', 'ci'];
const CI_ROOT_FILES = ['azure-pipelines.yml', 'azure-pipelines.yaml', '.gitlab-ci.yml'];

// A pipeline definition is YAML and small. The cap is here so that a repository
// with a generated or vendored file under one of these directories cannot turn
// onboarding into a full-tree read.
const MAX_CI_BYTES = 256 * 1024;

function readCiText(cwd: string): string {
  const parts: string[] = [];
  const readFile = (abs: string): void => {
    try {
      if (statSync(abs).size > MAX_CI_BYTES) return;
      parts.push(readFileSync(abs, 'utf8').toLowerCase());
    } catch {
      // Unreadable is not a finding about the repository: a probe that cannot
      // read a file reports nothing rather than claiming the tool is absent.
    }
  };

  for (const dir of CI_DIRS) {
    const abs = join(cwd, dir);
    if (!existsSync(abs)) continue;
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!/\.ya?ml$/i.test(name)) continue;
      readFile(join(abs, name));
    }
  }
  for (const name of CI_ROOT_FILES) {
    const abs = join(cwd, name);
    if (existsSync(abs)) readFile(abs);
  }
  return parts.join('\n');
}

export interface DetectedTool {
  readonly id: string;
  readonly label: string;
  // The marker that matched, quoted back so the operator can check Redline's
  // reasoning rather than trust it.
  readonly evidence: string;
  readonly standsDown: StandsDown;
}

export interface RepoSurvey {
  readonly tools: readonly DetectedTool[];
  // The Redline gate jobs a tool already covers. Empty on a bare repository.
  readonly standDown: readonly Exclude<StandsDown, null>[];
}

/**
 * What the repository already runs, from the checkout alone.
 *
 * Deliberately no host calls: this decides what `redline init --dry-run` offers,
 * and dry-run contacts no host and needs no credential. A survey that needed a
 * token would make the safest way to preview onboarding the one that requires
 * the most trust.
 */
export function surveyRepo(cwd: string): RepoSurvey {
  const ci = readCiText(cwd);
  const tools: DetectedTool[] = [];

  for (const probe of TOOL_PROBES) {
    let evidence: string | null = null;
    for (const path of probe.paths ?? []) {
      if (existsSync(join(cwd, path))) {
        evidence = path;
        break;
      }
    }
    if (evidence === null && ci !== '') {
      for (const needle of probe.inCi ?? []) {
        if (ci.includes(needle.toLowerCase())) {
          evidence = `"${needle}" in this repository's CI definitions`;
          break;
        }
      }
    }
    if (evidence === null) continue;
    tools.push({ id: probe.id, label: probe.label, evidence, standsDown: probe.standsDown });
  }

  const standDown = [
    ...new Set(
      tools
        .map((tool) => tool.standsDown)
        .filter((job): job is Exclude<StandsDown, null> => job !== null)
    ),
  ];
  return { tools, standDown };
}
