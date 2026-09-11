import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Controls Redline can actually set up, as opposed to merely notice.
//
// The bar for appearing here is deliberately high: ticking a row must produce a
// working control, with no account to create and no secret to paste. SonarQube,
// Snyk and Mend all fail it — each needs a server or a token, and a workflow
// that runs red until somebody supplies one is worse than no workflow, because a
// failing check on a fresh onboarding is how a team learns to ignore checks.
// Those three stay in the detection list (cli/detect/existing.ts), where knowing
// a repository already runs one is still worth something: it stands a Redline
// gate job down.
//
// Nothing here duplicates the security floor. Redline already switches on secret
// scanning, push protection and dependency ALERTS, which is why gitleaks and
// TruffleHog are absent and why Dependabot appears only as version updates —
// the part of it the floor does not already cover.

export interface SetupFile {
  readonly path: string;
  readonly contents: string;
}

export interface Installable {
  readonly id: string;
  readonly label: string;
  /** What ticking it actually writes, said in the row itself. */
  readonly hint: string;
  /** Hosts where this means anything. An Azure repo is offered none of it. */
  readonly hosts: readonly ('github' | 'azure')[];
  /** Absent when the repository gives nothing to configure. */
  readonly plan: (cwd: string, stacks: readonly string[]) => SetupFile | null;
}

// Dependabot's ecosystem ids, keyed by the file that proves the ecosystem is
// used here. A manifest is the only evidence taken: guessing an ecosystem from a
// file extension produces a config that opens pull requests against nothing.
const ECOSYSTEMS: readonly (readonly [string, string, string])[] = [
  ['package.json', 'npm', '/'],
  ['requirements.txt', 'pip', '/'],
  ['pyproject.toml', 'pip', '/'],
  ['go.mod', 'gomod', '/'],
  ['pom.xml', 'maven', '/'],
  ['build.gradle', 'gradle', '/'],
  ['build.gradle.kts', 'gradle', '/'],
  ['Gemfile', 'bundler', '/'],
  ['Cargo.toml', 'cargo', '/'],
  ['composer.json', 'composer', '/'],
  ['Dockerfile', 'docker', '/'],
];

function ecosystemsIn(cwd: string): { ecosystem: string; directory: string }[] {
  const found = new Map<string, string>();
  for (const [marker, ecosystem, directory] of ECOSYSTEMS) {
    if (existsSync(join(cwd, marker))) found.set(ecosystem, directory);
  }
  // Always present on a repository Redline gates: it installs the workflow that
  // the gate runs on, and an unpatched action is as much a dependency as a
  // package is.
  if (existsSync(join(cwd, '.github', 'workflows'))) found.set('github-actions', '/');
  return [...found].map(([ecosystem, directory]) => ({ ecosystem, directory }));
}

// CodeQL's language ids, from the stacks the chosen profile renders. Derived
// from the profile rather than from a file walk so it matches what the standards
// are actually reviewing.
const CODEQL_LANGUAGES: Record<string, string> = {
  javascript: 'javascript-typescript',
  react: 'javascript-typescript',
  'react-native': 'javascript-typescript',
  angular: 'javascript-typescript',
  vue: 'javascript-typescript',
  svelte: 'javascript-typescript',
  dom: 'javascript-typescript',
  nodejs: 'javascript-typescript',
  python: 'python',
  go: 'go',
  java: 'java-kotlin',
  kotlin: 'java-kotlin',
  csharp: 'csharp',
  swift: 'swift',
};

export const INSTALLABLE: readonly Installable[] = [
  {
    id: 'dependabot',
    label: 'Dependabot version updates',
    hint: 'writes .github/dependabot.yml — weekly, minor and patch grouped into one PR',
    hosts: ['github'],
    plan: (cwd) => {
      const ecosystems = ecosystemsIn(cwd);
      if (ecosystems.length === 0) return null;
      const blocks = ecosystems
        .map(({ ecosystem, directory }) =>
          [
            `  - package-ecosystem: "${ecosystem}"`,
            `    directory: "${directory}"`,
            '    schedule:',
            '      interval: "weekly"',
            '    open-pull-requests-limit: 5',
            '    groups:',
            // One pull request a week for the routine bumps. Ungrouped, a repo
            // with a real dependency tree gets a dozen, which is how a team
            // learns to close Dependabot pull requests without reading them.
            '      minor-and-patch:',
            '        update-types:',
            '          - "minor"',
            '          - "patch"',
          ].join('\n')
        )
        .join('\n\n');
      return {
        path: '.github/dependabot.yml',
        contents: [
          '# Managed by Redline. Security alerts are enabled separately, by the',
          '# security floor — this file is the version updates the floor does not cover.',
          'version: 2',
          'updates:',
          blocks,
          '',
        ].join('\n'),
      };
    },
  },
  {
    id: 'renovate',
    label: 'Renovate',
    hint: 'writes renovate.json — needs the Renovate app installed on the organisation',
    hosts: ['github'],
    plan: () => ({
      path: 'renovate.json',
      contents:
        JSON.stringify(
          {
            $schema: 'https://docs.renovatebot.com/renovate-schema.json',
            extends: ['config:recommended'],
            schedule: ['before 9am on monday'],
            packageRules: [
              {
                matchUpdateTypes: ['minor', 'patch'],
                groupName: 'minor and patch',
              },
            ],
          },
          null,
          2
        ) + '\n',
    }),
  },
  {
    id: 'codeql',
    label: 'CodeQL',
    hint: 'writes .github/workflows/codeql.yml — needs Advanced Security on a private repo',
    hosts: ['github'],
    plan: (_cwd, stacks) => {
      const languages = [
        ...new Set(stacks.flatMap((stack) => CODEQL_LANGUAGES[stack] ?? [])),
      ];
      if (languages.length === 0) return null;
      return {
        path: '.github/workflows/codeql.yml',
        contents: [
          '# Managed by Redline.',
          'name: CodeQL',
          '',
          'on:',
          '  push:',
          '    branches: [main, master]',
          '  pull_request:',
          '  schedule:',
          "    - cron: '0 3 * * 1'",
          '',
          'permissions:',
          '  contents: read',
          '  security-events: write',
          '',
          'jobs:',
          '  analyze:',
          '    runs-on: ubuntu-latest',
          '    strategy:',
          '      fail-fast: false',
          '      matrix:',
          `        language: [${languages.join(', ')}]`,
          '    steps:',
          // Pinned to the major tag, which is what GitHub's own documented
          // workflow uses: a floating v3 takes security fixes to the scanner
          // without a pull request, and a SHA pin here would go stale silently
          // in every onboarded repository at once.
          '      - uses: actions/checkout@v4',
          '      - uses: github/codeql-action/init@v3',
          '        with:',
          '          languages: ${{ matrix.language }}',
          '      - uses: github/codeql-action/autobuild@v3',
          '      - uses: github/codeql-action/analyze@v3',
          '',
        ].join('\n'),
      };
    },
  },
];

/** What this host and this checkout can actually be offered. */
export function offerable(
  cwd: string,
  host: 'github' | 'azure',
  stacks: readonly string[]
): { integration: Installable; file: SetupFile }[] {
  return INSTALLABLE.flatMap((integration) => {
    if (!integration.hosts.includes(host)) return [];
    const file = integration.plan(cwd, stacks);
    return file === null ? [] : [{ integration, file }];
  });
}

/**
 * Write the chosen files, skipping any that already exist.
 *
 * Never overwrites: a repository with its own `renovate.json` has a considered
 * one, and replacing it with a generated default is the kind of "help" that
 * loses a team a week of tuning. The caller reports what was skipped.
 */
export function applySetup(
  cwd: string,
  chosen: readonly { integration: Installable; file: SetupFile }[],
  dryRun: boolean
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const { file } of chosen) {
    const absolute = join(cwd, file.path);
    if (existsSync(absolute)) {
      // Identical content is not a conflict, it is a no-op — a re-run must not
      // report work it is not doing.
      const current = readFileSync(absolute, 'utf8');
      if (current !== file.contents) skipped.push(file.path);
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.contents, 'utf8');
    }
    written.push(file.path);
  }
  return { written, skipped };
}
