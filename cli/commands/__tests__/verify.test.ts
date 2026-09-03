import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  assert.match(find(report, 'onboarded')?.detail ?? '', /npx redline-cli init/);
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

// `unknown` (Task 17) is the indeterminate case: nothing was observed, and
// unlike `unsupported` (genuinely unlicensed) a differently-scoped token
// could still answer it. Neither is evidence the floor is on.
test('an indeterminate capability is never reported as an enabled floor', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: 'on' },
      { capability: 'push-protection', status: 'unknown', detail: 'not visible to this token' },
    ],
  });
  const report = await verify(() => platform, { cwd, root });
  const floor = find(report, 'security-floor');
  assert.equal(floor?.ok, false, JSON.stringify(report.findings, null, 2));
  assert.ok(!/enabled/.test(floor?.detail ?? ''), 'no positive claim without evidence');
  assert.match(floor?.detail ?? '', /push-protection/, 'and it names what could not be checked');
});

// The core Task 17 fix: a repository whose Advanced Security is genuinely
// unlicensed — a DEFINITE answer, not an indeterminate one — must not fail a
// plain `redline verify` forever with no operator remedy.
test('a genuinely unlicensed capability no longer fails a plain verify', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: 'on' },
      { capability: 'push-protection', status: 'unsupported', detail: 'Advanced Security unlicensed' },
    ],
  });
  const report = await verify(() => platform, { cwd, root });
  const floor = find(report, 'security-floor');
  assert.equal(floor?.ok, true, JSON.stringify(report.findings, null, 2));
  assert.ok(!/enabled/.test(floor?.detail ?? ''), 'no positive claim without evidence');
  assert.match(floor?.detail ?? '', /push-protection/, 'and it still names what is unavailable');
});

// The Azure gate and the fleet re-verification job both run with a token that
// is documented as read-only. A gate that always fails is a gate nobody keeps,
// so an indeterminate capability is reported there without failing the run.
test('an indeterminate capability does not fail --gate, and still says so', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'unknown', detail: 'not visible to this token' },
      { capability: 'push-protection', status: 'unknown', detail: 'not visible to this token' },
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

// A plain `redline init` never retries a capability nothing reads back — that
// is exactly the "settled by design" verdict `--repair` exists to bypass. The
// remedy printed here must name it, not the plain command that would not help.
test('a capability nothing reads back names --repair as the remedy, not a plain redline init', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['labels'] });
  const platform = fakePlatform({ securityState: [] });

  const report = await verify(() => platform, { cwd, root });
  const detail = find(report, 'pending-admin')?.detail ?? '';
  assert.match(detail, /not verifiable with this token: labels/);
  assert.match(detail, /redline init --repair/);
});

// --- merge policy: the settings init applied, not just the blocking flag ----

// A repository refused admin rights at onboarding never got a ruleset —
// `readPolicy` reads back null forever, and a plain `redline init` treats
// that as settled by design (policySettled's null branch) so it never
// retries. `--repair` is the only thing that does.
test('the merge-policy finding names --repair as the remedy when no ruleset is on the host', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform();
  platform.lastPolicy = null;

  const finding = find(await verify(() => platform, { cwd, root }), 'merge-policy');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /redline init --repair/);
});

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

// --- round 2: the gate machinery itself ------------------------------------

// The softened "no gate run observed yet" path swallowed the outage it was
// meant to leave room for: a blocking repository whose gate workflow someone
// deleted reported fully green and exited 0, while every pull request in it
// waits forever on a check nothing will publish.
test('a blocking repository whose gate workflow was deleted fails instead of being called un-run', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = await withPolicy(cwd, policyOf({ requiredChecks: ['redline-gate / gate'], blocking: true }));
  platform.readReportedCheckNames = async () => ['build', 'unit tests'];
  platform.readGateMachinery = () => ({
    path: '.github/workflows/redline.yml',
    present: false,
    publishes: null,
    expected: 'redline-gate / gate',
  });

  const report = await verify(() => platform, { cwd, root });
  assert.equal(report.ok, false, JSON.stringify(report.findings, null, 2));
  const machinery = find(report, 'gate-machinery');
  assert.equal(machinery?.ok, false, machinery?.detail);
  assert.match(machinery?.detail ?? '', /\.github\/workflows\/redline\.yml/);
  assert.ok(
    !/open or update a pull request/.test(find(report, 'check-name-reported')?.detail ?? ''),
    'a repository with no gate must not be told to open a pull request'
  );
});

// templates/redline.yml carries a DO NOT RENAME THE JOB warning because the
// required check name is built from the caller job id. A rename publishes
// nothing the policy requires, and no reported name starts with `redline`, so
// it took the soft path too.
test('a caller job renamed away from the required check name fails', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = await withPolicy(cwd, policyOf({ requiredChecks: ['redline-gate / gate'], blocking: true }));
  platform.readReportedCheckNames = async () => ['build'];
  platform.readGateMachinery = () => ({
    path: '.github/workflows/redline.yml',
    present: true,
    publishes: 'ci-gate / gate',
    expected: 'redline-gate / gate',
  });

  const report = await verify(() => platform, { cwd, root });
  const machinery = find(report, 'gate-machinery');
  assert.equal(machinery?.ok, false, machinery?.detail);
  assert.match(machinery?.detail ?? '', /ci-gate \/ gate/);
  assert.match(machinery?.detail ?? '', /redline-gate \/ gate/);
});

test('a gate that is installed and simply has not run yet keeps the soft report', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = await withPolicy(cwd, policyOf({ requiredChecks: ['redline-gate / gate'], blocking: true }));
  platform.readReportedCheckNames = async () => ['build', 'unit tests'];

  const report = await verify(() => platform, { cwd, root });
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
  assert.equal(find(report, 'gate-machinery')?.ok, true);
  assert.match(find(report, 'check-name-reported')?.detail ?? '', /no gate run observed yet/);
});

// --- round 2: pendingAdmin against what a read can actually answer ----------

// An administrator cannot enable Advanced Security on a tenant that is not
// licensed for it. `unsupported` is this codebase's "nothing was observed",
// and filing it as administrator work is the same false positive the rest of
// this command exists to remove.
test('a capability the host does not offer is never filed as work an administrator must do', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['secret-scanning'] });
  const platform = fakePlatform({
    securityState: [
      { capability: 'secret-scanning', status: 'unsupported', detail: 'Advanced Security unlicensed' },
      { capability: 'push-protection', status: 'applied', detail: 'on' },
    ],
  });

  const detail = find(await verify(() => platform, { cwd, root }), 'pending-admin')?.detail ?? '';
  assert.ok(!/must still enable/.test(detail), detail);
  assert.match(detail, /secret-scanning/);
});

// Same shape as security-floor: the Azure gate runs as the build service
// identity, so a record nothing there can act on must not block every pull
// request in the repository forever.
test('--gate reports pendingAdmin nobody there can act on without failing, and names it', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['labels'] });

  const plain = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(find(plain, 'pending-admin')?.ok, false, 'an operator asking must still be told no');

  const gated = await verify(() => fakePlatform(), { cwd, root, gate: true });
  const finding = find(gated, 'pending-admin');
  assert.equal(finding?.ok, true, finding?.detail);
  assert.match(finding?.detail ?? '', /labels/);

  // The other half of the ruling, in the same test so neither direction can
  // be satisfied alone: a capability the host reports as off is work someone
  // can actually do, and keeps failing in both modes.
  writeConfig(cwd, { ...config, pendingAdmin: ['secret-scanning'] });
  const denied = fakePlatform({
    securityState: [
      { capability: 'secret-scanning', status: 'denied', detail: 'off' },
      { capability: 'push-protection', status: 'applied', detail: 'on' },
    ],
  });
  const stillFails = await verify(() => denied, { cwd, root, gate: true });
  assert.equal(find(stillFails, 'pending-admin')?.ok, false, 'observed and off is work someone can do');
});

// --- round 2: an older CLI is not local drift either ------------------------

test('a CLI rendering an older standards version than the repository recorded says so, and does not fail', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, standardsVersion: '99.0.0' });
  writeFileSync(join(cwd, 'AGENTS.md'), 'rendered from a newer version\n');

  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'artifacts-current');
  assert.equal(finding?.ok, true, finding?.detail);
  assert.ok(!/updated upstream/.test(finding?.detail ?? ''), finding?.detail);
  assert.match(finding?.detail ?? '', /older/);
});

// The fourth setting `init` applies (init.ts: dismissStaleReviews true) and the
// one the first round left uncompared. Turning it off lets an approval given
// before the last push carry the merge, which is the same shape of loosening as
// the other three and has the same one-click path on both hosts.
test('a policy that no longer dismisses stale approvals on push is drift', async () => {
  const cwd = await onboarded();
  const platform = await withPolicy(cwd, policyOf({ dismissStaleReviews: false }));
  const finding = find(await verify(() => platform, { cwd, root }), 'merge-policy');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /dismissed when new commits are pushed/);
});

// --- round 3: a finding whose own text says the repository is broken --------

// The Azure state the adapter already diagnoses in full: a blocking Status
// policy with no Build Validation policy to queue the pipeline. `blocking`
// reads false, so on an advisory-configured repository the flag comparison
// matches and every finding passed — while the detail of the passing finding
// said, in plain English, that every pull request will sit blocked.
test('a policy whose own detail says pull requests are blocked does not pass', async () => {
  const cwd = await onboarded();
  const platform = await withPolicy(
    cwd,
    policyOf({
      blocking: false,
      requiredChecks: [],
      advisoryReason:
        'the redline/gate status policy is blocking, but no "Redline: gate build" Build Validation ' +
        'policy queues the gate pipeline, so every pull request will sit blocked',
    })
  );

  const report = await verify(() => platform, { cwd, root });
  const finding = find(report, 'merge-policy');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /will sit blocked/);
  assert.equal(report.ok, false);

  const gated = await verify(() => platform, { cwd, root, gate: true });
  assert.equal(find(gated, 'merge-policy')?.ok, false, 'and it blocks nothing that was not already blocked');
});

// A rename is drift on an advisory repository too: the gate reports under a
// name nobody required, and promoting to blocking would break every pull
// request the moment someone flips the menu.
test('a renamed gate job fails even where the policy requires no checks yet', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    gateMachinery: {
      path: '.github/workflows/redline.yml',
      present: true,
      publishes: 'ci-gate / gate',
      expected: 'redline-gate / gate',
    },
  });
  const finding = find(await verify(() => platform, { cwd, root }), 'gate-machinery');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.match(finding?.detail ?? '', /ci-gate \/ gate/);
});

// The mirror image, and the one the old message got wrong: the workflow is
// exactly as init wrote it and the POLICY stopped requiring Redline's check.
// Telling that operator to rename a correct job sends them at a fiction.
test('a policy that no longer requires the gate is not reported as a renamed job', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });
  const platform = await withPolicy(cwd, policyOf({ requiredChecks: ['build'], blocking: true }));

  const finding = find(await verify(() => platform, { cwd, root }), 'gate-machinery');
  assert.equal(finding?.ok, false, finding?.detail);
  assert.ok(!/rename the job back/.test(finding?.detail ?? ''), finding?.detail);
  assert.match(finding?.detail ?? '', /policy/);
});

// MINIMUM_APPROVALS in verify.ts is a copy of a literal in init.ts that cannot
// be imported. A comment naming the contract is not the contract: raising
// init's count left the whole suite green, and a repository sitting at the old
// count would have reported clean.
// --- Task 14: per-repository vendor selection --------------------------------

// Deselecting a vendor must actually clear the drift it leaves behind: the
// `artifacts-current` check compares against the repository's own recorded
// selection, so a vendor no longer selected must not show up as something
// still to remove.
test('verify is clean after a vendor is deselected and its block actually removed', async () => {
  const cwd = await onboarded();
  await init(fakePlatform(), { cwd, root, now, vendors: ['copilot', 'agents'] });
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), false);

  const report = await verify(() => fakePlatform(), { cwd, root });
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
  assert.equal(find(report, 'artifacts-current')?.ok, true);
});

test('the merge policy init applies is the one verify holds a repository to', async () => {
  const cwd = tempRepo('redline-verify-contract-');
  writeFileSync(join(cwd, 'package.json'), '{"dependencies":{"react":"19"}}');
  const platform = fakePlatform();
  await init(platform, { cwd, root, now });

  assert.equal(platform.lastPolicy?.requiredApprovals, 1, 'raise MINIMUM_APPROVALS in verify.ts with it');
  assert.equal(platform.lastPolicy?.dismissStaleReviews, true);
  assert.equal(platform.lastPolicy?.requireCodeOwnerReview, true);
  assert.equal(platform.lastPolicy?.requireThreadResolution, true);
});

// --- repository-local rules --------------------------------------------------
//
// `.redline/local.md` is the repository's own file. Editing it makes the
// rendered artifacts trail it until the next render — that is work to do, and
// the repository is not failing at anything in the meantime.

const LOCAL = '.redline/local.md';

function writeLocal(cwd: string, body: string): void {
  mkdirSync(join(cwd, '.redline'), { recursive: true });
  writeFileSync(join(cwd, LOCAL), body);
}

test('editing the repository-local rules reports the artifacts stale without failing the repository', async () => {
  const cwd = await onboarded();
  writeLocal(cwd, 'We allow console.log in the CLI.\n');

  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'artifacts-current');

  assert.equal(finding?.ok, true, 'a repository that owns its own rules is not failing at anything');
  assert.match(finding?.detail ?? '', /\.redline\/local\.md/);
  assert.match(finding?.detail ?? '', /redline init/);
});

test('deleting the repository-local rules after onboarding is work to do, not drift', async () => {
  const cwd = await onboarded();
  writeLocal(cwd, 'We allow console.log in the CLI.\n');
  await init(fakePlatform(), { cwd, root, now });
  assert.equal(readConfig(cwd)?.localRules, true);

  rmSync(join(cwd, LOCAL));
  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'artifacts-current');

  assert.equal(finding?.ok, true);
  assert.match(finding?.detail ?? '', /\.redline\/local\.md/);
});

// The forgiving branch above must not swallow the check it exists beside: a
// repository with local rules still fails when something else was hand-edited.
test('a hand-edited artifact still fails a repository that has repository-local rules', async () => {
  const cwd = await onboarded();
  writeLocal(cwd, 'We allow console.log in the CLI.\n');
  await init(fakePlatform(), { cwd, root, now });

  const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
  writeFileSync(join(cwd, 'AGENTS.md'), agents.replace('## Output contract (required)', '## Rewritten by hand'));

  const finding = find(await verify(() => fakePlatform(), { cwd, root }), 'artifacts-current');

  assert.equal(finding?.ok, false, 'the local rules are unchanged, so this is drift');
  assert.match(finding?.detail ?? '', /stale: /);
});
