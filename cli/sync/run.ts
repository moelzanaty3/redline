import { isRedlineError } from '../core/errors.ts';
import type { Registry } from '../registry/types.ts';
import type { RepoRef } from '../platforms/types.ts';
import { planSync, type PlanOptions, type SyncPlan, type SyncTarget } from './plan.ts';
import { managedPaths, renderForTarget } from './render.ts';

export type SyncOutcome =
  | { kind: 'opened'; number: number; url: string }
  | { kind: 'updated'; number: number; url: string }
  | { kind: 'current' }
  | { kind: 'not-onboarded' }
  | { kind: 'failed'; detail: string };

export interface SyncReport {
  plan: SyncPlan;
  results: { repo: string; outcome: SyncOutcome }[];
  // A run that could not reach some repositories still succeeded for the rest.
  // The exit code is driven by this, not by the first failure.
  failures: number;
}

// Everything sync needs from a host, small enough that both adapters implement
// it and a test can fake it without a network.
export interface SyncHost {
  readRemoteConfig(ref: RepoRef): Promise<{ config: { profile: string; vendors: string[] } | null }>;
  readRemoteFile(ref: RepoRef, path: string): Promise<{ content: string } | null>;
  pushFiles(
    ref: RepoRef,
    push: { branch: string; message: string; files: { path: string; content: string }[] }
  ): Promise<{ commit: string | null }>;
  openPullRequest(
    ref: RepoRef,
    pr: { branch: string; title: string; body: string; labels: string[] }
  ): Promise<{ number: number; url: string; created: boolean }>;
}

export interface SyncRunOptions extends PlanOptions {
  root: string;
  standardsVersion: string;
  // Print the plan and touch no host for writes. The default is NOT dry: a
  // command whose whole job is distribution should do it when asked, and every
  // caller here passes the flag explicitly.
  dryRun?: boolean;
  // Injected so the generated exemption's expiry is testable, and so a rerun of
  // the same sync reaches the same verdict about the same pull request.
  now?: Date;
}

export const SYNC_BRANCH = 'redline/sync';
export const SYNC_LABEL = 'redline-sync';

// How long a sync pull request may sit before its own gate starts failing it.
// A sync pull request nobody merges is drift, and drift that fails nothing is
// drift nobody sees. Thirty days is long enough for a team to schedule the merge
// and short enough that "we'll get to it" has to be said out loud again.
export const SYNC_EXEMPTION_DAYS = 30;

const body = (target: SyncTarget, version: string, files: string[], now: Date): string => {
  const until = new Date(now.getTime() + SYNC_EXEMPTION_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  return [
    `Redline standards **v${version}** — this repository was on v${target.from}.`,
    '',
    'Rendered from the organisation standard. Everything in this diff is generated:',
    '',
    ...files.map((f) => `- \`${f}\``),
    '',
    'Content above each `<!-- REDLINE:BEGIN -->` marker is yours and is untouched.',
    '',
    'Merging keeps this repository current. Not merging is a decision the estate',
    'dashboard records as drift — it is not a silent one, which is the point.',
    '',
    // A generated pull request carries its own exemption rather than being a
    // special case in the gate. One rule for everyone is worth more than a
    // convenience for the tool that wrote the rule — and it means this pull
    // request starts failing its own gate if it is left unmerged, which is
    // exactly what should happen to standards a repository is quietly refusing.
    '## Redline exemption',
    '',
    `- reason: generated standards sync to v${version}; the launch-readiness checklist does not apply to a diff no human wrote`,
    `- until: ${until}`,
    '- scope: checklist, adr',
  ].join('\n');
};

async function syncTarget(
  host: SyncHost,
  target: SyncTarget,
  opts: SyncRunOptions
): Promise<SyncOutcome> {
  const entry = target.entry;
  const ref: RepoRef = {
    host: entry.host,
    org: entry.org,
    repo: entry.repo,
    defaultBranch: entry.defaultBranch,
    ...(entry.project ? { project: entry.project } : {}),
  };

  // The register records a profile, but vendors and the current selections live
  // in the repository's own file. Reading it live means sync cannot render the
  // wrong thing for a repository that changed since the register was derived.
  const { config } = await host.readRemoteConfig(ref);
  if (!config) return { kind: 'not-onboarded' };

  const paths = managedPaths(opts.root, config.profile, config.vendors);
  const existing = new Map<string, string>();
  for (const path of paths) {
    const file = await host.readRemoteFile(ref, path);
    if (file) existing.set(path, file.content);
  }

  const rendered = renderForTarget({
    root: opts.root,
    profile: config.profile,
    vendors: config.vendors,
    existing,
  });

  // A render that would delete a file is reported and not pushed. Removal is a
  // vendor being turned off or a stack leaving the profile — a decision the
  // repository makes by re-running init, not something a scheduled sync should
  // do to it from the outside.
  if (rendered.files.length === 0) return { kind: 'current' };

  if (opts.dryRun) {
    return { kind: 'opened', number: 0, url: `(dry run) ${rendered.files.length} file(s)` };
  }

  const pushed = await host.pushFiles(ref, {
    branch: SYNC_BRANCH,
    message: `chore(redline): standards v${opts.standardsVersion}`,
    files: rendered.files,
  });
  if (pushed.commit === null) return { kind: 'current' };

  const pr = await host.openPullRequest(ref, {
    branch: SYNC_BRANCH,
    title: `Redline: standards v${opts.standardsVersion}`,
    body: body(target, opts.standardsVersion, rendered.files.map((f) => f.path), opts.now ?? new Date()),
    labels: [SYNC_LABEL],
  });

  return pr.created
    ? { kind: 'opened', number: pr.number, url: pr.url }
    : { kind: 'updated', number: pr.number, url: pr.url };
}

// Sync the estate. One repository failing never stops the others: an estate-wide
// distribution that aborts on the first unreachable repository is a distribution
// that never completes, and the whole point of Phase 0 is that it does.
export async function runSync(
  host: SyncHost,
  registry: Registry,
  opts: SyncRunOptions
): Promise<SyncReport> {
  const plan = planSync(registry, opts.standardsVersion, opts);
  const results: SyncReport['results'] = [];
  let failures = 0;

  for (const target of plan.targets) {
    const repo = `${target.entry.org}/${target.entry.repo}`;
    try {
      results.push({ repo, outcome: await syncTarget(host, target, opts) });
    } catch (error) {
      failures += 1;
      const detail = isRedlineError(error) ? error.message : String(error);
      results.push({ repo, outcome: { kind: 'failed', detail } });
    }
  }

  return { plan, results, failures };
}
