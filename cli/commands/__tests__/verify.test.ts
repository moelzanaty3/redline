import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform, type FakePlatform } from './fake-platform.ts';
import { init } from '../init.ts';
import { verify } from '../verify.ts';
import { CONFIG_FILE, readConfig, writeConfig } from '../../config/redline-json.ts';
import { RedlineError, isRedlineError } from '../../core/errors.ts';
import type { MergePolicy } from '../../platforms/types.ts';

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

// --- the gate contract: not-yet-run is not the same as reported-wrong -------

const policyOf = (over: Partial<MergePolicy> = {}): MergePolicy => ({
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [],
  blocking: false,
  ...over,
});

async function withPolicy(cwd: string, policy: MergePolicy): Promise<FakePlatform> {
  const platform = fakePlatform();
  await platform.applyPolicy(await platform.repoRef(cwd), policy);
  return platform;
}

// The newest pull request of any state is what the host is asked about, so a
// healthy repository whose newest pull request predates the gate reported the
// required check missing and exited 1 — on the Azure gate, on every pull
// request.
test('a pull request the gate never ran on is reported without being called a broken contract', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = await withPolicy(cwd, policyOf({ requiredChecks: ['redline-gate / gate'], blocking: true }));
  platform.readReportedCheckNames = async () => ['build', 'unit tests'];

  const report = await verify(() => platform, { cwd, root });
  const finding = find(report, 'check-name-reported');
  assert.equal(finding?.ok, true, JSON.stringify(report.findings, null, 2));
  assert.match(finding?.detail ?? '', /no gate run observed yet/);
});

// Both halves in one test: Azure publishes a blocking Status policy whose
// Build Validation policy is missing, so required checks exist while nothing
// blocks on them. Telling that operator every pull request is blocked sends
// them after the wrong thing; not telling the blocking one hides the outage.
test('the "blocks every pull request" warning is claimed only when the policy actually blocks', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });
  const blocking = await withPolicy(cwd, policyOf({ requiredChecks: ['redline-gate / typo'], blocking: true }));
  const blocked = find(await verify(() => blocking, { cwd, root }), 'check-name-reported');
  assert.equal(blocked?.ok, false, blocked?.detail);
  assert.match(blocked?.detail ?? '', /will block every pull request/);

  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: false } });
  const advisory = await withPolicy(cwd, policyOf({ requiredChecks: ['redline/typo'], blocking: false }));
  const reported = find(await verify(() => advisory, { cwd, root }), 'check-name-reported');
  assert.equal(reported?.ok, false, reported?.detail);
  assert.ok(!/block every pull request/.test(reported?.detail ?? ''), reported?.detail);
});

// --- upstream standards versus local drift ----------------------------------

// Publishing any change to standards/** used to fail `verify` in every
// onboarded repository at once, and with it the Azure gate on every open pull
// request. Adopting a new version is work for `redline init`, not drift.
test('artifacts left behind by an upstream standards release are advice, not drift', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, standardsVersion: '0.0.0-older' });
  writeFileSync(join(cwd, 'AGENTS.md'), 'rendered from the previous version\n');

  const report = await verify(() => fakePlatform(), { cwd, root });
  const finding = find(report, 'artifacts-current');
  assert.equal(finding?.ok, true, JSON.stringify(report.findings, null, 2));
  assert.match(finding?.detail ?? '', /standards updated upstream \(v0\.0\.0-older → v/);
  assert.match(finding?.detail ?? '', /redline init/);

  const gated = await verify(() => fakePlatform(), { cwd, root, gate: true });
  assert.equal(find(gated, 'artifacts-current')?.ok, true, 'the gate must not fail on an upstream release');
});

// --- pendingAdmin: only chase an administrator for what a read can answer ---

test('a pendingAdmin capability no read can answer is not reported as work an administrator must do', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['labels', 'secret-scanning'] });
  const platform = fakePlatform({
    securityState: [
      { capability: 'secret-scanning', status: 'denied', detail: 'off' },
      { capability: 'push-protection', status: 'applied', detail: 'on' },
    ],
  });

  const report = await verify(() => platform, { cwd, root });
  const detail = find(report, 'pending-admin')?.detail ?? '';
  assert.match(detail, /must still enable: secret-scanning/);
  assert.match(detail, /not verifiable with this token: labels/);
  assert.ok(!/must still enable: [^.]*labels/.test(detail), detail);
});

// --- merge policy: the settings init applied, not just the blocking flag ----

test('a policy that no longer requires code-owner review is drift even while the gate still matches', async () => {
  const cwd = await onboarded();
  const platform = await withPolicy(cwd, policyOf({ requireCodeOwnerReview: false }));
  const finding = find(await verify(() => platform, { cwd, root }), 'merge-policy');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /code-owner review/);
});

test('a policy that no longer blocks on unresolved threads is drift', async () => {
  const cwd = await onboarded();
  const platform = await withPolicy(cwd, policyOf({ requireThreadResolution: false }));
  const finding = find(await verify(() => platform, { cwd, root }), 'merge-policy');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /thread/);
});

// The approval count is a floor, not an equality: a team that requires three
// approvals is stricter than the standard, and failing them would fail their
// gate on every pull request.
test('a policy dropped to zero required approvals is drift, while a stricter one is not', async () => {
  const cwd = await onboarded();
  const dropped = await withPolicy(cwd, policyOf({ requiredApprovals: 0 }));
  const finding = find(await verify(() => dropped, { cwd, root }), 'merge-policy');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /approval/);

  const stricter = await withPolicy(cwd, policyOf({ requiredApprovals: 3 }));
  assert.equal(find(await verify(() => stricter, { cwd, root }), 'merge-policy')?.ok, true);
});

// --- the pull request template the host actually serves ---------------------

const GITHUB_TEMPLATE = '.github/pull_request_template.md';
const SATISFYING_TEMPLATE = [
  '# Summary',
  '',
  '## Launch readiness',
  '',
  '- [ ] Tested',
  '',
  '## Architecture decision',
  '',
  'ADR: `docs/adr/0001-thing.md`',
  '',
].join('\n');

test('a pull request template whose markers a human mangled is a failing finding', async () => {
  const cwd = await onboarded();
  writeFileSync(
    join(cwd, GITHUB_TEMPLATE),
    [
      '# Summary',
      '<!-- REDLINE:BEGIN — generated by Redline. Do not edit inside this block. -->',
      '## Launch readiness',
      '<!-- REDLINE:BEGIN — generated by Redline. Do not edit inside this block. -->',
      'ADR: docs/adr/0001-thing.md',
      '<!-- REDLINE:END -->',
      '',
    ].join('\n')
  );
  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'pull-request-template');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /marker/);
});

// A repository onboarded before the packaged template carried markers keeps
// its own file forever — `redline init` leaves it untouched, so verify must
// not send anyone off to run one.
test('a marker-less template that already answers the gate is reported without failing', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, GITHUB_TEMPLATE), SATISFYING_TEMPLATE);
  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'pull-request-template');
  assert.equal(finding?.ok, true, finding?.detail);
  assert.match(finding?.detail ?? '', /pull_request_template\.md/);
});

test('a template with neither gated section fails, because the gate fails every pull request against it', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, GITHUB_TEMPLATE), '# Summary\n\nTicket:\n');
  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'pull-request-template');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /Launch readiness/);
});

test('a deleted pull request template is drift, not silence', async () => {
  const cwd = await onboarded();
  rmSync(join(cwd, GITHUB_TEMPLATE));
  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'pull-request-template');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /no pull request template/);
});

// Azure serves a branch template in preference to the default, so one added
// after onboarding silently replaces everything `redline init` merged.
test('a branch template added to an Azure repository after onboarding is drift', async () => {
  const cwd = tempRepo('redline-verify-azure-');
  writeFileSync(join(cwd, 'package.json'), '{"dependencies":{"react":"19"}}');
  const ref = {
    host: 'azure' as const,
    org: 'contoso',
    project: 'Payments',
    repo: 'web',
    repoId: 'repo-guid',
    defaultBranch: 'main',
  };
  await init(fakePlatform({ ref }), { cwd, root, now });
  mkdirSync(join(cwd, '.azuredevops'), { recursive: true });
  writeFileSync(join(cwd, '.azuredevops/pull_request_template.md'), SATISFYING_TEMPLATE);

  const clean = find(await verify(() => fakePlatform({ ref }), { cwd, root }), 'pull-request-template');
  assert.equal(clean?.ok, true, clean?.detail);

  mkdirSync(join(cwd, '.azuredevops/pull_request_template/branches'), { recursive: true });
  writeFileSync(join(cwd, '.azuredevops/pull_request_template/branches/release.md'), '# Release\n');
  const drifted = find(await verify(() => fakePlatform({ ref }), { cwd, root }), 'pull-request-template');
  assert.equal(drifted?.ok, false, drifted?.detail);
  assert.match(drifted?.detail ?? '', /branches\/release\.md/);
});

// Azure never applies a code-owner requirement, and backs off a reviewer or
// comment policy a human already owns. Holding a repository to a setting the
// host cannot attribute to Redline would fail it forever — through the gate,
// on every pull request — for being in exactly the state init left it in.
test('a policy setting the host cannot attribute to Redline is named, not failed', async () => {
  const cwd = await onboarded();
  const platform = await withPolicy(
    cwd,
    policyOf({
      requireCodeOwnerReview: false,
      requiredApprovals: 0,
      unownedSettings: ['requireCodeOwnerReview', 'requiredApprovals'],
    })
  );
  const finding = find(await verify(() => platform, { cwd, root }), 'merge-policy');
  assert.equal(finding?.ok, true, finding?.detail);
  assert.match(finding?.detail ?? '', /not compared here: requireCodeOwnerReview, requiredApprovals/);
});
