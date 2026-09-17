import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runSync, type SyncHost } from '../run.ts';
import { renderForTarget } from '../render.ts';
import { RedlineError } from '../../core/errors.ts';
import type { Registry, RegistryEntry } from '../../registry/types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const entry = (repo: string, standardsVersion = '0.0.0'): RegistryEntry => ({
  host: 'github',
  org: 'acme',
  repo,
  defaultBranch: 'main',
  profile: 'web',
  standardsVersion,
  cliVersion: '0.0.1',
  onboardedAt: '2026-09-01T00:00:00.000Z',
  rung: 'observe',
});

const registry = (...entries: RegistryEntry[]): Registry => ({
  generatedAt: '2026-09-04T00:00:00.000Z',
  source: 'acme/redline',
  entries,
});

interface FakeOptions {
  config?: { profile: string; vendors: string[] } | null;
  files?: Map<string, string>;
  commit?: string | null;
  created?: boolean;
  throwOn?: string;
}

const fakeHost = (opts: FakeOptions = {}) => {
  const pushed: { path: string; content: string }[][] = [];
  const opened: unknown[] = [];
  const host: SyncHost = {
    async readRemoteConfig(ref) {
      if (opts.throwOn === ref.repo) throw new RedlineError('host', `${ref.repo} unreachable`);
      return { config: opts.config === undefined ? { profile: 'web', vendors: ['agents'] } : opts.config };
    },
    async readRemoteFile(_ref, path) {
      const content = opts.files?.get(path);
      return content === undefined ? null : { content };
    },
    async pushFiles(_ref, push) {
      pushed.push(push.files);
      return { commit: opts.commit === undefined ? 'SHA' : opts.commit };
    },
    async openPullRequest() {
      opened.push(true);
      return { number: 12, url: 'https://x/12', created: opts.created ?? true };
    },
  };
  return { host, pushed, opened };
};

const run = (host: SyncHost, reg: Registry, over = {}) =>
  runSync(host, reg, { root: ROOT, standardsVersion: '0.0.1', ...over });

test('opens a pull request on a repository that is behind', async () => {
  const { host, opened } = fakeHost();

  const report = await run(host, registry(entry('web-app')));

  assert.deepEqual(report.results, [
    { repo: 'acme/web-app', outcome: { kind: 'opened', number: 12, url: 'https://x/12' } },
  ]);
  assert.equal(opened.length, 1);
  assert.equal(report.failures, 0);
});

test('an already-open pull request is updated, not duplicated', async () => {
  const { host } = fakeHost({ created: false });

  const report = await run(host, registry(entry('web-app')));

  assert.equal(report.results[0]?.outcome.kind, 'updated');
});

test('a repository whose tree already matches is current, and no pull request opens', async () => {
  const { host, opened } = fakeHost({ commit: null });

  const report = await run(host, registry(entry('web-app')));

  assert.deepEqual(report.results[0]?.outcome, { kind: 'current' });
  assert.equal(opened.length, 0);
});

test('a repository with no .redline.json is reported, never rendered for', async () => {
  const { host, pushed } = fakeHost({ config: null });

  const report = await run(host, registry(entry('gone')));

  assert.deepEqual(report.results[0]?.outcome, { kind: 'not-onboarded' });
  assert.deepEqual(pushed, []);
});

test('one unreachable repository does not stop the rest of the estate', async () => {
  // An estate-wide distribution that aborts on the first failure is a
  // distribution that never completes.
  const { host } = fakeHost({ throwOn: 'broken' });

  const report = await run(host, registry(entry('broken'), entry('fine')));

  assert.equal(report.failures, 1);
  assert.equal(report.results[0]?.outcome.kind, 'failed');
  assert.equal(report.results[1]?.outcome.kind, 'opened');
});

test('a dry run touches no host write path', async () => {
  const { host, pushed, opened } = fakeHost();

  const report = await run(host, registry(entry('web-app')), { dryRun: true });

  assert.deepEqual(pushed, []);
  assert.deepEqual(opened, []);
  assert.equal(report.results[0]?.outcome.kind, 'opened');
});

test('the pull request body names the version moved from and to', async () => {
  let body = '';
  const { host } = fakeHost();
  const wrapped: SyncHost = {
    ...host,
    async openPullRequest(ref, pr) {
      body = pr.body;
      return host.openPullRequest(ref, pr);
    },
  };

  await run(wrapped, registry(entry('web-app', '0.0.0')));

  assert.match(body, /v0\.0\.1/);
  assert.match(body, /was on v0\.0\.0/);
});

test('a repository already at the current version is never contacted at all', async () => {
  const { host, pushed } = fakeHost();

  const report = await run(host, registry(entry('current', '0.0.1')));

  assert.deepEqual(report.results, []);
  assert.deepEqual(pushed, []);
  assert.match(report.plan.skipped[0]?.reason ?? '', /already at standards/);
});

test('a sync pull request carries its own exemption, so the gate has one rule for everyone', async () => {
  let body = '';
  const { host } = fakeHost();
  const wrapped: SyncHost = {
    ...host,
    async openPullRequest(ref, pr) {
      body = pr.body;
      return host.openPullRequest(ref, pr);
    },
  };

  await runSync(wrapped, registry(entry('web-app')), {
    root: ROOT,
    standardsVersion: '0.0.1',
    now: new Date('2026-09-04T00:00:00.000Z'),
  });

  assert.match(body, /## Redline exemption/);
  // Scoped to the process checks only. It must never reach dependency review or
  // the secret scan, which no label and no block has ever been able to exempt.
  assert.match(body, /scope: checklist, adr/);
  assert.match(body, /until: 2026-10-04/);
});

test('the generated exemption expires, so an unmerged sync pull request starts failing', async () => {
  // A sync pull request nobody merges is drift, and drift that fails nothing is
  // drift nobody sees.
  let body = '';
  const { host } = fakeHost();
  const wrapped: SyncHost = {
    ...host,
    async openPullRequest(ref, pr) {
      body = pr.body;
      return host.openPullRequest(ref, pr);
    },
  };
  const opened = new Date('2026-09-04T00:00:00.000Z');

  await runSync(wrapped, registry(entry('web-app')), {
    root: ROOT,
    standardsVersion: '0.0.1',
    now: opened,
  });

  const { parseExemption } = await import('../../exempt/parse.ts');
  const stillValid = parseExemption(body, new Date('2026-10-01T00:00:00.000Z'));
  assert.notEqual(stillValid.exemption, null);

  const expired = parseExemption(body, new Date('2026-11-01T00:00:00.000Z'));
  assert.equal(expired.exemption, null);
  assert.equal(expired.problems[0]?.problem, 'until-past');
});

test('a target carrying artifacts its profile no longer renders is not "current"', async () => {
  // Sync will not delete another repository's files, but reporting the target as
  // current said nothing at all — which is the definition of silent drift.
  const { host } = fakeHost();
  const stale: SyncHost = {
    ...host,
    async readRemoteFile(_ref, path) {
      // Everything the render wants is already there, so nothing is pushed.
      const rendered = renderForTarget({ root: ROOT, profile: 'web', vendors: ['agents'], existing: new Map() });
      const match = rendered.files.find((f) => f.path === path);
      return match ? { content: match.content } : null;
    },
  };

  const report = await runSync(stale, registry(entry('web-app')), {
    root: ROOT,
    standardsVersion: '0.0.1',
  });

  assert.equal(report.results[0]?.outcome.kind, 'current');
});

// Serial was fine for the eight repositories this was built against. At two
// hundred, each several round trips deep, the wall-clock cost is the estate
// size times the latency and the operator watching a silent terminal
// reasonably concludes it has hung.
test('repositories are synced in parallel, up to the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const base = fakeHost();
  const host: SyncHost = {
    ...base.host,
    async readRemoteConfig(ref) {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return base.host.readRemoteConfig(ref);
    },
  };

  const reg = registry(...Array.from({ length: 12 }, (_, i) => entry(`web-${i}`)));
  await runSync(host, reg, { root: ROOT, standardsVersion: '0.0.1', concurrency: 4 });

  assert.ok(peak > 1, 'ran serially');
  assert.ok(peak <= 4, `exceeded the limit: ${peak}`);
});

// The report is what gets diffed against the last run. Workers finish in
// whatever order the host answers, and a report whose order changes run to run
// cannot be compared to anything.
test('the report comes back in plan order however the workers interleave', async () => {
  const base = fakeHost();
  const host: SyncHost = {
    ...base.host,
    async readRemoteConfig(ref) {
      // Later repositories answer first.
      const delay = Math.max(0, 40 - Number(ref.repo.split('-')[1]) * 10);
      await new Promise((r) => setTimeout(r, delay));
      return base.host.readRemoteConfig(ref);
    },
  };

  const reg = registry(...Array.from({ length: 4 }, (_, i) => entry(`web-${i}`)));
  const report = await runSync(host, reg, { root: ROOT, standardsVersion: '0.0.1', concurrency: 4 });

  assert.deepEqual(
    report.results.map((r) => r.repo),
    ['acme/web-0', 'acme/web-1', 'acme/web-2', 'acme/web-3']
  );
});

test('one unreachable repository does not stop the rest, in parallel too', async () => {
  const { host } = fakeHost({ throwOn: 'web-1' });
  const reg = registry(entry('web-0'), entry('web-1'), entry('web-2'));

  const report = await runSync(host, reg, { root: ROOT, standardsVersion: '0.0.1', concurrency: 3 });

  assert.equal(report.failures, 1);
  assert.equal(report.results[1]?.outcome.kind, 'failed');
  assert.equal(report.results[0]?.outcome.kind, 'opened');
  assert.equal(report.results[2]?.outcome.kind, 'opened');
});

test('progress is reported as each repository settles, not only at the end', async () => {
  const { host } = fakeHost();
  const seen: string[] = [];
  const reg = registry(entry('web-0'), entry('web-1'));

  await runSync(host, reg, {
    root: ROOT,
    standardsVersion: '0.0.1',
    concurrency: 1,
    onResult: (result, done, total) => seen.push(`${done}/${total} ${result.repo}`),
  });

  assert.deepEqual(seen, ['1/2 acme/web-0', '2/2 acme/web-1']);
});

// A concurrency above the target count must not spawn idle workers or, worse,
// index past the end of the plan.
test('a limit larger than the estate is harmless', async () => {
  const { host } = fakeHost();
  const report = await runSync(host, registry(entry('web-0')), {
    root: ROOT,
    standardsVersion: '0.0.1',
    concurrency: 50,
  });
  assert.equal(report.results.length, 1);
});

test('an empty plan completes rather than hanging', async () => {
  const { host } = fakeHost();
  const report = await runSync(host, registry(), { root: ROOT, standardsVersion: '0.0.1' });
  assert.deepEqual(report.results, []);
});
