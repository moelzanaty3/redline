import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatStatus, status } from '../status.ts';
import { sensitivePathRules } from '../init.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const repo = (config?: unknown): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-status-'));
  if (config !== undefined) {
    writeFileSync(join(dir, '.redline.json'), JSON.stringify(config), 'utf8');
  }
  return dir;
};

const CONFIG = {
  standardsVersion: '0.0.2',
  cliVersion: '0.0.2',
  host: 'github',
  profile: 'web-react',
  vendors: ['copilot'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: true,
    speckit: true,
    tmf: false,
    sensitivePathReviewers: true,
  },
  capabilities: { gate: true, mergePolicy: true, labels: false, repoProperty: false },
  integrations: ['sonarqube'],
  pendingAdmin: ['secret-scanning'],
  onboardedAt: '2026-08-02T10:00:00.000Z',
  lastRunAt: '2026-09-10T09:30:00.000Z',
  rung: 'block-blocker',
  localRules: false,
  commandFiles: {},
};

// Not onboarded is the answer somebody ran this to get. Exiting non-zero or
// throwing would break the script that asked, and "no .redline.json" is not a
// failure of anything.
test('a repository that was never onboarded reports that, calmly', () => {
  const report = status(repo(), ROOT);
  assert.equal(report.onboarded, false);
  assert.match(formatStatus(report).join('\n'), /not onboarded/);
  assert.match(formatStatus(report).join('\n'), /redline init --dry-run/);
});

test('an onboarded repository reports what is installed and what is owed', () => {
  const report = status(repo(CONFIG), ROOT);
  assert.equal(report.onboarded, true);
  assert.equal(report.rung, 'block-blocker');
  assert.deepEqual(report.stacks, ['javascript', 'react']);
  assert.deepEqual(report.pendingAdmin, ['secret-scanning']);
  assert.deepEqual(report.integrations, ['sonarqube']);
});

// `mergePolicy` is how the JSON stores it; `merge-policy` is what the CLI
// accepts, so it is what the CLI must say back.
test('capabilities are reported by the name an operator types', () => {
  const out = formatStatus(status(repo(CONFIG), ROOT)).join('\n');
  assert.match(out, /gate, merge-policy/);
  assert.doesNotMatch(out, /mergePolicy/);
});

test('standards behind the CLI are reported as drift, not as breakage', () => {
  const report = status(repo(CONFIG), ROOT);
  assert.equal(report.drifted, true);
  assert.match(formatStatus(report).join('\n'), /behind .* a sync will raise it/);
});

// A profile the manifest has since dropped is exactly the repository somebody
// needs to look at, so the one command that reports state must not crash on it.
test('a profile the manifest no longer defines still reports', () => {
  const report = status(repo({ ...CONFIG, profile: 'gone' }), ROOT);
  assert.equal(report.onboarded, true);
  assert.deepEqual(report.stacks, []);
  assert.match(formatStatus(report).join('\n'), /profile\s+gone/);
});

// CODEOWNERS distinguishes a user from a team by shape. Getting this wrong
// points the file at an owner GitHub cannot resolve, which it ignores silently —
// the file installs and enforces nothing.
test('owners are qualified only where the shape is ambiguous', () => {
  const owners = (given?: string[]): string[] => sensitivePathRules('acme', given)[0]!.owners;

  assert.deepEqual(owners(), ['@acme/platform-engineering']);
  assert.deepEqual(owners(['security-guild']), ['@acme/security-guild']);
  // Already a user — qualifying it would invent a team.
  assert.deepEqual(owners(['@someone']), ['@someone']);
  assert.deepEqual(owners(['@other-org/platform']), ['@other-org/platform']);
  assert.deepEqual(owners(['team@acme.com']), ['team@acme.com']);
});
