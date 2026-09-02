import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform } from './fake-platform.ts';
import { init } from '../init.ts';
import { readConfig } from '../../config/redline-json.ts';
import type { AdminCapability, CapabilityOutcome } from '../../platforms/types.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = (): Date => new Date('2026-09-01T00:00:00.000Z');

function repo(files: Record<string, string> = { 'package.json': '{"dependencies":{"react":"19"}}' }): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-init-'));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

test('installs the floor in order and opens a pull request', async () => {
  const platform = fakePlatform();
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.deepEqual(platform.applied, [
    'installGate',
    'ensureReviewOwnership',
    'enableSecurityFloor',
    'applyPolicy',
    'openPullRequest',
  ]);
  assert.equal(report.pullRequest?.number, 1);
});

test('the gate is advisory by default', async () => {
  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now });
  assert.equal(platform.lastPolicy?.blocking, false);
});

test('the menu can promote the gate to blocking', async () => {
  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now, menu: { blockingGate: true } });
  assert.equal(platform.lastPolicy?.blocking, true);
});

test('the detected profile is used and recorded', async () => {
  const cwd = repo();
  const report = await init(fakePlatform(), { cwd, root, now });
  assert.equal(report.profile, 'web');
  assert.equal(readConfig(cwd)?.profile, 'web');
});

test('an explicit profile overrides detection', async () => {
  const cwd = repo();
  const report = await init(fakePlatform(), { cwd, root, now, profile: 'infra' });
  assert.equal(report.profile, 'infra');
});

test('an unknown explicit profile fails before anything is written', async () => {
  const cwd = repo();
  const platform = fakePlatform();
  await assert.rejects(init(platform, { cwd, root, now, profile: 'nope' }), /unknown profile/);
  assert.deepEqual(platform.applied, []);
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
});

test('standards are rendered into the working tree', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  assert.ok(existsSync(join(cwd, 'AGENTS.md')));
  assert.ok(existsSync(join(cwd, 'CLAUDE.md')));
  assert.ok(existsSync(join(cwd, '.github/copilot-instructions.md')));
  assert.match(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), /REDLINE:BEGIN/);
});

test('denied capabilities become pendingAdmin and the run still completes', async () => {
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'denied', detail: 'needs admin' },
      { capability: 'push-protection', status: 'denied', detail: 'needs admin' },
      { capability: 'dependency-alerts', status: 'applied', detail: '' },
    ],
  });
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.deepEqual(report.pendingAdmin, ['secret-scanning', 'push-protection']);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['secret-scanning', 'push-protection']);
  assert.equal(report.pullRequest?.number, 1, 'the PR must still be opened');
});

test('unsupported capabilities never become pendingAdmin', async () => {
  const platform = fakePlatform({
    policy: [
      { capability: 'merge-policy', status: 'applied', detail: '' },
      { capability: 'repo-property', status: 'unsupported', detail: 'azure has none' },
    ],
  });
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });
  assert.ok(!report.pendingAdmin.includes('repo-property'));
});

test('a repo with 2.1 artifacts and no config is reported as a migration', async () => {
  const cwd = repo({
    'package.json': '{}',
    '.github/workflows/redline.yml': 'name: Redline\n',
  });
  const report = await init(fakePlatform(), { cwd, root, now });
  assert.equal(report.migratedFrom, '2.1');
});

test('re-running on an onboarded repo is a no-op report, not a second pull request', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const second = fakePlatform({ failPullRequest: true });
  const report = await init(second, { cwd, root, now });
  assert.equal(report.alreadyOnboarded, true);
  assert.equal(report.pullRequest, null);
  assert.ok(!second.applied.includes('openPullRequest'));
});

test('.redline.json records the versions that produced it', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  const config = readConfig(cwd)!;
  assert.equal(config.host, 'github');
  assert.equal(config.onboardedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(typeof config.standardsVersion, 'string');
  assert.equal(typeof config.cliVersion, 'string');
});

// --- Degradation paths -----------------------------------------------------
//
// Partial permission failure is the NORMAL path for this command (the typical
// caller lacks repo admin). Every one of the seven admin capabilities is
// exercised denied on its own, several together, and all at once — each case
// asserting the run completes (no throw — the functional equivalent of exit
// 0), that pendingAdmin lists exactly the denied capabilities in aggregation
// order, and that the pull request is still opened so file-level work is
// never lost to a host permission failure.

const ALL_CAPABILITIES: AdminCapability[] = [
  'labels',
  'review-ownership',
  'secret-scanning',
  'push-protection',
  'dependency-alerts',
  'merge-policy',
  'repo-property',
];

function outcomeFor(capability: AdminCapability, denied: Set<AdminCapability>): CapabilityOutcome {
  return denied.has(capability)
    ? { capability, status: 'denied', detail: 'needs repository admin' }
    : { capability, status: 'applied', detail: '' };
}

function platformDenying(capabilities: AdminCapability[]) {
  const denied = new Set(capabilities);
  return fakePlatform({
    gate: [outcomeFor('labels', denied)],
    ownership: [outcomeFor('review-ownership', denied)],
    security: [
      outcomeFor('secret-scanning', denied),
      outcomeFor('push-protection', denied),
      outcomeFor('dependency-alerts', denied),
    ],
    policy: [outcomeFor('merge-policy', denied), outcomeFor('repo-property', denied)],
  });
}

for (const capability of ALL_CAPABILITIES) {
  test(`denying only "${capability}" is reported pending and the run still completes (exit 0)`, async () => {
    const platform = platformDenying([capability]);
    const cwd = repo();
    const report = await init(platform, { cwd, root, now });

    assert.deepEqual(report.pendingAdmin, [capability]);
    assert.deepEqual(readConfig(cwd)?.pendingAdmin, [capability]);
    assert.equal(report.pullRequest?.number, 1, 'a single denial must not cost the pull request');
  });
}

test('several capabilities denied at once are all reported pending, run still completes (exit 0)', async () => {
  const platform = platformDenying(['labels', 'secret-scanning', 'merge-policy']);
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.deepEqual(report.pendingAdmin, ['labels', 'secret-scanning', 'merge-policy']);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['labels', 'secret-scanning', 'merge-policy']);
  assert.equal(report.pullRequest?.number, 1);
});

test('every capability denied still completes the run (exit 0), not exit 3', async () => {
  const platform = platformDenying(ALL_CAPABILITIES);
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.deepEqual(report.pendingAdmin, ALL_CAPABILITIES);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ALL_CAPABILITIES);
  assert.equal(report.pullRequest?.number, 1, 'total permission denial must still open the pull request');
  assert.ok(existsSync(join(cwd, '.redline.json')), 'file-level work must survive total permission denial');
});

test('unsupported capabilities are excluded from pendingAdmin even when every other capability is denied', async () => {
  const denied = ALL_CAPABILITIES.filter((c) => c !== 'dependency-alerts');
  const platform = fakePlatform({
    gate: [outcomeFor('labels', new Set(denied))],
    ownership: [outcomeFor('review-ownership', new Set(denied))],
    security: [
      outcomeFor('secret-scanning', new Set(denied)),
      outcomeFor('push-protection', new Set(denied)),
      { capability: 'dependency-alerts', status: 'unsupported', detail: 'not licensed on this repository' },
    ],
    policy: [outcomeFor('merge-policy', new Set(denied)), outcomeFor('repo-property', new Set(denied))],
  });
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.ok(!report.pendingAdmin.includes('dependency-alerts'));
  assert.equal(report.pendingAdmin.length, ALL_CAPABILITIES.length - 1);
  assert.equal(report.pullRequest?.number, 1);
});
