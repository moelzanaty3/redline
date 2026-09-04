import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegistry, standardsVersion, sync } from '../sync.ts';
import { isRedlineError } from '../../core/errors.ts';
import type { SyncHost } from '../../sync/run.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const register = (entries: unknown[]) =>
  JSON.stringify({ generatedAt: 'x', source: 'acme/redline', entries });

const entry = (repo: string, standardsVersion = '0.0.0') => ({
  host: 'github',
  org: 'acme',
  repo,
  defaultBranch: 'main',
  profile: 'web',
  standardsVersion,
  cliVersion: '0.0.1',
  onboardedAt: '2026-09-01T00:00:00.000Z',
});

const host: SyncHost = {
  async readRemoteConfig() {
    return { config: { profile: 'web', vendors: ['agents'] } };
  },
  async readRemoteFile() {
    return null;
  },
  async pushFiles() {
    return { commit: 'SHA' };
  },
  async openPullRequest() {
    return { number: 1, url: 'https://x/1', created: true };
  },
};

test('reads the real standards version from the manifest', () => {
  assert.match(standardsVersion(ROOT), /^\d+\.\d+\.\d+$/);
});

test('a missing register is a usage error that says how to build one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-sync-cmd-'));
  try {
    assert.throws(
      () => readRegistry(dir),
      (err: unknown) =>
        isRedlineError(err) && err.kind === 'usage' && /build-registry/.test(err.hint ?? '')
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('syncs the estate described by the register on disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-sync-cmd-'));
  try {
    // The register lives in the source repo; standards/ is read from the real
    // root so the render is the real one.
    mkdirSync(join(dir, 'standards'), { recursive: true });
    writeFileSync(join(dir, 'registry.json'), register([entry('web-app')]));

    const report = await sync(host, { root: ROOT, cwd: dir });

    assert.equal(report.plan.targets.length, 1);
    assert.equal(report.results[0]?.outcome.kind, 'opened');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a malformed register is refused rather than syncing a partial estate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-sync-cmd-'));
  try {
    writeFileSync(join(dir, 'registry.json'), '{ not json');
    assert.throws(() => readRegistry(dir), /registry\.json is invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
