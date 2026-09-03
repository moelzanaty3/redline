import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform } from './fake-platform.ts';
import { init } from '../init.ts';
import { verify } from '../verify.ts';
import { CONFIG_FILE, readConfig, writeConfig } from '../../config/redline-json.ts';
import { RedlineError, isRedlineError } from '../../core/errors.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = (): Date => new Date('2026-09-01T00:00:00.000Z');

const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

function tempRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

async function onboarded(): Promise<string> {
  const cwd = tempRepo('redline-verify-');
  writeFileSync(join(cwd, 'package.json'), '{"dependencies":{"react":"19"}}');
  await init(fakePlatform(), { cwd, root, now });
  return cwd;
}

const find = (report: { findings: { check: string; ok: boolean; detail: string }[] }, check: string) =>
  report.findings.find((f) => f.check === check);

test('a freshly onboarded repository verifies clean', async () => {
  const cwd = await onboarded();
  const report = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
});

test('a repository with no .redline.json fails the onboarding check and stops', async () => {
  const cwd = tempRepo('redline-verify-none-');
  const report = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(report.ok, false);
  assert.equal(find(report, 'onboarded')?.ok, false);
  assert.equal(report.findings.length, 1, 'nothing else is worth checking');
});

// Resolving a platform builds a host client, which resolves a credential and
// throws `permission`. A repository whose only problem is that nobody ran
// `redline init` must reach the exit-2 "not onboarded" report without one.
test('a repository with no .redline.json never resolves a platform', async () => {
  const cwd = tempRepo('redline-verify-nocreds-');
  const report = await verify(() => {
    throw new RedlineError('permission', 'no GitHub credentials found');
  }, { cwd, root });
  assert.equal(report.ok, false);
  assert.equal(report.findings.length, 1);
  assert.match(find(report, 'onboarded')?.detail ?? '', /redline init/);
});

test('a required check the host has never reported is a failure', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = fakePlatform();
  await platform.applyPolicy(await platform.repoRef(cwd), {
    requiredApprovals: 1,
    dismissStaleReviews: true,
    requireCodeOwnerReview: true,
    requireThreadResolution: true,
    requiredChecks: ['redline-gate / typo'],
    blocking: true,
  });

  const report = await verify(() => platform, { cwd, root });
  assert.equal(find(report, 'check-name-reported')?.ok, false);
  assert.match(find(report, 'check-name-reported')?.detail ?? '', /never reported/);
});

// A host that knows WHY the gate reads advisory must be able to say so:
// "policy is advisory, config says blocking" alone sends the operator looking
// at the Status policy, which is the one part that is configured correctly.
test('a host-supplied advisory reason reaches the merge-policy finding', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = fakePlatform();
  await platform.applyPolicy(await platform.repoRef(cwd), {
    requiredApprovals: 1,
    dismissStaleReviews: true,
    requireCodeOwnerReview: true,
    requireThreadResolution: true,
    requiredChecks: [],
    blocking: false,
    advisoryReason: 'no "Redline: gate build" Build Validation policy queues the gate pipeline',
  });

  const report = await verify(() => platform, { cwd, root });
  assert.equal(find(report, 'merge-policy')?.ok, false);
  assert.match(find(report, 'merge-policy')?.detail ?? '', /Build Validation policy queues/);
});

test('a repository with no pull request yet skips the check-name check rather than failing', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform();
  platform.latestPullRequestNumber = async () => null;
  const report = await verify(() => platform, { cwd, root });
  assert.equal(report.ok, true);
  assert.match(find(report, 'check-name-reported')?.detail ?? '', /no pull request yet/);
});

test('a disabled security floor is a failure', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: '' },
      { capability: 'push-protection', status: 'denied', detail: 'off' },
    ],
  });
  const report = await verify(() => platform, { cwd, root });
  assert.equal(find(report, 'security-floor')?.ok, false);
});

test('a non-empty pendingAdmin means partially onboarded, not verified', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['secret-scanning'] });
  const report = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(find(report, 'pending-admin')?.ok, false);
  assert.match(find(report, 'pending-admin')?.detail ?? '', /partially onboarded/);
});

test('stale rendered artifacts are drift', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, 'AGENTS.md'), 'someone deleted the block\n');
  const report = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(find(report, 'artifacts-current')?.ok, false);
});

test('a corrupt config surfaces as a failed onboarding check, not a crash', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, CONFIG_FILE), '{ not json');
  const report = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(report.ok, false);
  assert.equal(find(report, 'onboarded')?.ok, false);
});

// `unsupported` is every case where the floor was not observed at all: a
// GitHub token that cannot see security_and_analysis, or Advanced Security
// unlicensed on an Azure repository. Neither is evidence the floor is on.
test('a capability nobody could observe is never reported as an enabled floor', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: 'on' },
      { capability: 'push-protection', status: 'unsupported', detail: 'Advanced Security unlicensed' },
    ],
  });
  const report = await verify(() => platform, { cwd, root });
  const floor = find(report, 'security-floor');
  assert.equal(floor?.ok, false, JSON.stringify(report.findings, null, 2));
  assert.ok(!/enabled/.test(floor?.detail ?? ''), 'no positive claim without evidence');
  assert.match(floor?.detail ?? '', /push-protection/, 'and it names what could not be checked');
});

// The Azure gate and the fleet re-verification job both run with a token that
// is documented as read-only. A gate that always fails is a gate nobody keeps,
// so an unobservable capability is reported there without failing the run.
test('a capability nobody could observe does not fail --gate, and still says so', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'unsupported', detail: 'not visible to this token' },
      { capability: 'push-protection', status: 'unsupported', detail: 'not visible to this token' },
    ],
  });
  const report = await verify(() => platform, { cwd, root, gate: true });
  const floor = find(report, 'security-floor');
  assert.equal(floor?.ok, true, JSON.stringify(report.findings, null, 2));
  assert.ok(!/enabled/.test(floor?.detail ?? ''), 'not failing is not the same as confirmed');
  assert.match(floor?.detail ?? '', /secret-scanning, push-protection/);
});

test('a disabled capability still fails under --gate', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: '' },
      { capability: 'push-protection', status: 'denied', detail: 'off' },
    ],
  });
  const report = await verify(() => platform, { cwd, root, gate: true });
  assert.equal(find(report, 'security-floor')?.ok, false, 'the soft treatment is for unobserved, not for off');
});

test('a host error mid-verify propagates rather than being reported as denied capabilities', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform();
  platform.readSecurityState = async () => {
    throw new RedlineError('host', 'GitHub returned HTTP 404 reading /repos/acme/web');
  };
  await assert.rejects(
    () => verify(() => platform, { cwd, root }),
    (error: unknown) => isRedlineError(error) && error.kind === 'host'
  );
});

test('a pendingAdmin capability that has since been granted is called out distinctly', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['secret-scanning', 'push-protection'] });
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: 'on' },
      { capability: 'push-protection', status: 'denied', detail: 'still off' },
    ],
  });
  const report = await verify(() => platform, { cwd, root });
  const finding = find(report, 'pending-admin');
  assert.equal(finding?.ok, false);
  assert.match(finding?.detail ?? '', /partially onboarded/);
  assert.match(finding?.detail ?? '', /push-protection/);
  assert.match(finding?.detail ?? '', /secret-scanning.*now granted/);
});
