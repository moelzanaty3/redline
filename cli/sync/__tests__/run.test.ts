import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runSync, type SyncHost } from '../run.ts';
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
