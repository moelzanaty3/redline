import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRedlineError } from '../core/errors.ts';
import { findBlock } from '../render/markers.ts';
import type { Host } from './types.ts';

// What `redline verify` needs to see about a pull request template, and the
// only place outside the install adapters that resolves one.
//
// CONTRACT with cli/platforms/github/install.ts and
// cli/platforms/azure/install.ts: the candidate folders, the served filenames
// and the branch-template layout below must stay the same as the ones those
// two resolve when they write. A verify that looked at a different file than
// init writes to would report on a template the host never serves. The two
// adapters keep their own private copies for the write side; when one changes,
// change this with it.
const TEMPLATE_NAMES: Record<Host, string[]> = {
  // GitHub documents only `pull_request_template.md`.
  github: ['pull_request_template.md'],
  // Azure DevOps documents both extensions, case-insensitively.
  azure: ['pull_request_template.md', 'pull_request_template.txt'],
};

const TEMPLATE_DIRS: Record<Host, string[]> = {
  github: ['.github', '', 'docs'],
  azure: ['.azuredevops', '.vsts', 'docs', ''],
};

// Azure serves a branch-specific template in preference to the default, so one
// added after onboarding replaces everything `redline init` merged. GitHub's
// `PULL_REQUEST_TEMPLATE/` directory is the opt-in kind, reachable only through
// a `?template=` link, and is deliberately not observed here.
const BRANCH_TEMPLATES: Record<Host, boolean> = { github: false, azure: true };
const BRANCH_TEMPLATE_EXTENSIONS = ['.md', '.txt'];
const MAX_BRANCH_DEPTH = 10;

// CONTRACT with workflows/redline-gate.yml: the `checklist` job fails a pull
// request whose body has no `## Launch readiness` heading (matched by prefix,
// so `## Launch readiness checklist` satisfies it), and the `adr` job fails a
// large diff whose body carries no `docs/adr/` link. A template that answers
// both is one no pull request can be failed by, whoever wrote it.
const GATED_SECTIONS = [
  { heading: '## Launch readiness', satisfied: (body: string): boolean => /^##[ \t]+Launch readiness/m.test(body) },
  { heading: '## Architecture decision', satisfied: (body: string): boolean => body.includes('docs/adr/') },
];

export type TemplateState =
  // Carries Redline's marker block: whatever else the file says, the gated
  // sections inside the block are Redline's and are refreshed by `init`.
  | 'managed'
  // No marker block, but the file answers both gate jobs on its own. This is
  // where a repository onboarded before the packaged template carried markers
  // lands, and `redline init` leaves it exactly as it is.
  | 'satisfied'
  // No marker block and a gate job it cannot answer.
  | 'incomplete'
  // A half-edited marker pair. `redline init` refuses the whole run on it.
  | 'mangled';

export interface TemplateObservation {
  path: string;
  // Azure only: served in preference to the default for its branch.
  branch: boolean;
  state: TemplateState;
  // The gated sections the file cannot answer, for `incomplete`.
  missing: string[];
}

interface Candidate {
  abs: string;
  rel: string;
}

// Listed rather than probed with existsSync: both hosts treat these folder
// names as case-insensitive, and existsSync is case-insensitive on macOS but
// not on Linux. isDirectory() is also what stops a plain file named `docs`
// from throwing ENOTDIR.
function candidateDirs(cwd: string, dirs: string[]): Candidate[] {
  const entries = readdirSync(cwd, { withFileTypes: true });
  const found: Candidate[] = [];
  for (const wanted of dirs) {
    if (wanted === '') {
      found.push({ abs: cwd, rel: '' });
      continue;
    }
    const dir = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === wanted);
    if (dir) found.push({ abs: join(cwd, dir.name), rel: dir.name });
  }
  return found;
}

const under = (candidate: Candidate, name: string): string =>
  candidate.rel === '' ? name : `${candidate.rel}/${name}`;

function findDefaultTemplate(cwd: string, host: Host): string | null {
  const names = TEMPLATE_NAMES[host];
  for (const candidate of candidateDirs(cwd, TEMPLATE_DIRS[host])) {
    const hits = readdirSync(candidate.abs, { withFileTypes: true })
      .filter((entry) => entry.isFile() && names.includes(entry.name.toLowerCase()))
      .map((entry) => entry.name);
    hits.sort((a, b) => {
      const byName = names.indexOf(a.toLowerCase()) - names.indexOf(b.toLowerCase());
      if (byName !== 0) return byName;
      if (a === b.toLowerCase()) return -1;
      if (b === a.toLowerCase()) return 1;
      return a < b ? -1 : 1;
    });
    const hit = hits[0];
    if (hit !== undefined) return under(candidate, hit);
  }
  return null;
}

function childDir(abs: string, name: string): string | null {
  const entry = readdirSync(abs, { withFileTypes: true }).find(
    (candidate) => candidate.isDirectory() && candidate.name.toLowerCase() === name
  );
  return entry ? join(abs, entry.name) : null;
}

function collectBranchTemplates(abs: string, rel: string, depth: number, into: string[]): void {
  if (depth > MAX_BRANCH_DEPTH) return;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) collectBranchTemplates(join(abs, entry.name), childRel, depth + 1, into);
    else if (
      entry.isFile() &&
      BRANCH_TEMPLATE_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))
    ) {
      into.push(childRel);
    }
  }
}

function findBranchTemplates(cwd: string, host: Host): string[] {
  if (!BRANCH_TEMPLATES[host]) return [];
  const found: string[] = [];
  for (const candidate of candidateDirs(cwd, TEMPLATE_DIRS[host])) {
    const folder = childDir(candidate.abs, 'pull_request_template');
    const branches = folder === null ? null : childDir(folder, 'branches');
    if (branches === null) continue;
    collectBranchTemplates(branches, under(candidate, 'pull_request_template/branches'), 1, found);
  }
  return found.sort();
}

function classify(cwd: string, relPath: string, branch: boolean): TemplateObservation {
  const body = readFileSync(join(cwd, relPath), 'utf8');
  try {
    if (findBlock(body, relPath) !== null) return { path: relPath, branch, state: 'managed', missing: [] };
  } catch (error) {
    // findBlock refuses a half-edited pair with RedlineError('failed'). That
    // is a finding about this repository, not a reason for `verify` to abort
    // before it has reported anything else.
    if (!isRedlineError(error)) throw error;
    return { path: relPath, branch, state: 'mangled', missing: [] };
  }
  const missing = GATED_SECTIONS.filter((section) => !section.satisfied(body)).map((s) => s.heading);
  return {
    path: relPath,
    branch,
    state: missing.length === 0 ? 'satisfied' : 'incomplete',
    missing,
  };
}

/**
 * Every pull request template this host would actually serve, in the order it
 * resolves them: the default first, then Azure's branch-specific ones. Empty
 * when the host would serve none — for an onboarded repository that means the
 * template `redline init` wrote is gone.
 */
export function observePullRequestTemplates(host: Host, cwd: string): TemplateObservation[] {
  const observed: TemplateObservation[] = [];
  const defaultPath = findDefaultTemplate(cwd, host);
  if (defaultPath !== null) observed.push(classify(cwd, defaultPath, false));
  for (const branchPath of findBranchTemplates(cwd, host)) {
    observed.push(classify(cwd, branchPath, true));
  }
  return observed;
}
