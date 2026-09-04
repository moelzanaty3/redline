import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform } from './fake-platform.ts';
import { init, sensitivePathRules } from '../init.ts';
import { capabilitySelection } from '../../config/redline-json.ts';
import { contentId } from '../../render/commands.ts';
import { isRedlineError, RedlineError } from '../../core/errors.ts';
import { readConfig } from '../../config/redline-json.ts';
import type { AdminCapability, CapabilityOutcome, RepoRef } from '../../platforms/types.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = (): Date => new Date('2026-09-01T00:00:00.000Z');

const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string> = { 'package.json': '{"dependencies":{"react":"19"}}' }): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-init-'));
  createdDirs.push(dir);
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

test('a re-run whose only change is a rewritten command file still opens a pull request', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  // Command sources ship with the CLI and version independently of
  // standards/manifest.json — simulate a CLI upgrade that changed a command
  // body without touching any rendered standards file. The edit goes INSIDE
  // the REDLINE block, which is the half Redline owns; bytes outside it belong
  // to whoever wrote them and are never rewritten.
  const commandFile = join(cwd, '.claude/commands/redline-init.md');
  writeFileSync(
    commandFile,
    readFileSync(commandFile, 'utf8').replace(
      '\n\n<!-- REDLINE:END -->',
      '\n\nstale body from an older CLI version\n\n<!-- REDLINE:END -->'
    )
  );

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, false);
  assert.ok(report.pullRequest !== null, 'a genuinely changed command file must still carry a PR');
  assert.ok(second.applied.includes('openPullRequest'));
  assert.ok(report.files.includes('.claude/commands/redline-init.md'));
  assert.ok(!readFileSync(commandFile, 'utf8').includes('stale body from an older CLI version'));
});

test('.redline.json records the versions that produced it', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  const config = readConfig(cwd);
  assert.ok(config);
  assert.equal(config.host, 'github');
  assert.equal(config.onboardedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(typeof config.standardsVersion, 'string');
  assert.equal(typeof config.cliVersion, 'string');
});

test('pruned stale vendor files are staged for deletion, not left orphaned out of the pull request', async () => {
  const stale = '.github/instructions/redline-stale-stack.instructions.md';
  const cwd = repo({
    'package.json': '{"dependencies":{"react":"19"}}',
    [stale]: 'stale content from a stack no longer in this profile\n',
  });

  const report = await init(fakePlatform(), { cwd, root, now });

  assert.ok(!existsSync(join(cwd, stale)), 'render() must have pruned the stale file from disk');
  assert.ok(report.files.includes(stale), 'the pruned deletion must ride along in the committed file list');
});

test('a second init on an unchanged repo leaves .redline.json byte-identical (real clock)', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root });
  const before = readFileSync(join(cwd, '.redline.json'), 'utf8');

  const second = await init(fakePlatform(), { cwd, root });
  const after = readFileSync(join(cwd, '.redline.json'), 'utf8');

  assert.equal(after, before, 'a no-op re-run must not rewrite .redline.json with a fresh onboardedAt');
  assert.equal(second.alreadyOnboarded, true);
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

// The generated CODEOWNERS is the only thing standing between a contributor
// and the standards their own pull request is reviewed against. Two ways it
// silently fails: it omits the rendered artifacts, or it names a bare
// `@platform-engineering`, which GitHub reads as a user — a user that does
// not exist makes the file erroneous and require_code_owner_review a no-op.
test('sensitive-path owners are org-scoped teams, never bare slugs', () => {
  for (const rule of sensitivePathRules('acme')) {
    assert.deepEqual(rule.owners, ['@acme/platform-engineering'], rule.pattern);
  }
});

test('sensitive paths cover every path templates/CODEOWNERS protects', () => {
  const template = readFileSync(join(root, 'templates/CODEOWNERS'), 'utf8');
  const templatePatterns = template
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/)[0])
    // `*` is the default-owner placeholder; the CLI cannot know a
    // repository's owning team, so it deliberately emits no default owner.
    .filter((pattern): pattern is string => pattern !== undefined && pattern !== '*');

  const generated = sensitivePathRules('acme').map((r) => r.pattern);
  const missing = templatePatterns.filter((p) => !generated.includes(p));
  assert.deepEqual(missing, [], 'templates/CODEOWNERS protects paths redline init does not');
});

// --- Re-run, repair and dry-run --------------------------------------------
//
// `redline init` is run again far more often than it is run once: a standards
// bump, a CLI upgrade, an operator repairing a deleted file. Every scenario
// below is a second run, and each pins one way the second run used to be
// dishonest about what it did.

test('a plain re-run preserves the blocking gate the repository already chose', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now, menu: { blockingGate: true } });

  // A standards drift makes the second run a real one, so the menu it sends
  // to the host is observable.
  writeFileSync(join(cwd, 'AGENTS.md'), 'drifted by hand\n');
  const second = fakePlatform();
  await init(second, { cwd, root, now });

  assert.equal(second.lastPolicy?.blocking, true, 'a flagless re-run must not demote the gate to advisory');
  assert.equal(readConfig(cwd)?.menu.blockingGate, true);
});

test('an explicit flag on a re-run still overrides what the config recorded', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now, menu: { blockingGate: true } });

  const second = fakePlatform();
  await init(second, { cwd, root, now, menu: { blockingGate: false } });

  assert.equal(second.lastPolicy?.blocking, false);
  assert.equal(readConfig(cwd)?.menu.blockingGate, false);
});

test('promoting a settled repository to blocking is a real run, not an already-onboarded no-op', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now, menu: { blockingGate: true } });

  assert.equal(report.alreadyOnboarded, false, 'a menu change must not be swallowed as "nothing to change"');
  assert.equal(second.lastPolicy?.blocking, true);
  assert.ok(second.applied.includes('openPullRequest'));
});

test('a no-op re-run makes zero platform calls', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, true);
  assert.deepEqual(second.applied, [], 'a settled repository must not have a single host setting rewritten');
  assert.ok(second.planned.includes('installGate'), 'the file diff is still computed, without writing');
});

test('a deleted gate workflow and CODEOWNERS are repaired in a pull request, not reported as nothing to change', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  rmSync(join(cwd, '.github/workflows/redline.yml'));
  rmSync(join(cwd, '.github/CODEOWNERS'));

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, false);
  assert.ok(report.pullRequest !== null, 'a repaired file must ride out in a pull request');
  assert.ok(report.files.includes('.github/workflows/redline.yml'));
  assert.ok(report.files.includes('.github/CODEOWNERS'));
  assert.ok(existsSync(join(cwd, '.github/workflows/redline.yml')));
});

test('a gate file rewritten by a CLI upgrade opens a pull request instead of dirtying the tree silently', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  // What a version-pinned gate template looks like after a CLI bump: same
  // path, different bytes. The old alreadyOnboarded ignored gate.files
  // entirely and left this modified tracked file behind with no PR.
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), 'pinned to an older redline-cli\n');

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, false);
  assert.ok(report.files.includes('.github/workflows/redline.yml'));
  assert.ok(second.applied.includes('openPullRequest'));
});

test('onboardedAt survives a re-run while lastRunAt moves', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  assert.equal(readConfig(cwd)?.onboardedAt, '2026-09-01T00:00:00.000Z');

  writeFileSync(join(cwd, 'AGENTS.md'), 'drifted by hand\n');
  const later = (): Date => new Date('2026-10-05T12:00:00.000Z');
  await init(fakePlatform(), { cwd, root, now: later });

  const config = readConfig(cwd);
  assert.equal(config?.onboardedAt, '2026-09-01T00:00:00.000Z', 'onboardedAt is when the repo joined, once');
  assert.equal(config?.lastRunAt, '2026-10-05T12:00:00.000Z');
});

test('--dry-run writes nothing, touches no host setting, and still reports the full plan', async () => {
  const cwd = repo();
  const platform = fakePlatform();
  const report = await init(platform, { cwd, root, now, dryRun: true });

  assert.deepEqual(platform.applied, [], 'a dry run must not change a single repository setting');
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
  assert.equal(existsSync(join(cwd, 'AGENTS.md')), false);
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
  assert.equal(report.dryRun, true);
  assert.ok(report.files.length > 0, 'the plan must name the files it would write');
  assert.ok(report.files.includes('.redline.json'));
  assert.ok(report.hostPlan.length > 0, 'the plan must name the host settings it would change');
});

test('--dry-run on a settled repository reports it as already onboarded and writes nothing', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  const before = readFileSync(join(cwd, '.redline.json'), 'utf8');

  const platform = fakePlatform();
  const report = await init(platform, { cwd, root, now, dryRun: true });

  assert.equal(report.alreadyOnboarded, true);
  assert.deepEqual(platform.applied, []);
  assert.equal(readFileSync(join(cwd, '.redline.json'), 'utf8'), before);
});

test('accessibility defaults on for a web profile and off for one with no user interface', async () => {
  const web = repo();
  await init(fakePlatform(), { cwd: web, root, now });
  assert.equal(readConfig(web)?.menu.accessibility, true);

  const infra = repo();
  await init(fakePlatform(), { cwd: infra, root, now, profile: 'infra' });
  assert.equal(readConfig(infra)?.menu.accessibility, false, 'terraform has no accessibility rules to record');
});

test('a 2.1 migration stages the removal of the 2.1-era sync workflow and scripts', async () => {
  const cwd = repo({
    'package.json': '{"dependencies":{"react":"19"}}',
    '.github/workflows/redline.yml': 'name: Redline 2.1\n',
    '.github/workflows/redline-sync.yml': 'name: Redline sync 2.1\n',
    'scripts/redline-install.sh': '#!/bin/sh\n# Generated by Redline 2.1\n',
    'scripts/deploy.sh': '#!/bin/sh\n',
  });

  const report = await init(fakePlatform(), { cwd, root, now });

  assert.equal(report.migratedFrom, '2.1');
  assert.equal(existsSync(join(cwd, '.github/workflows/redline-sync.yml')), false);
  assert.equal(existsSync(join(cwd, 'scripts/redline-install.sh')), false);
  assert.ok(existsSync(join(cwd, 'scripts/deploy.sh')), 'a script that is not Redline 2.1 is never touched');
  assert.ok(report.files.includes('.github/workflows/redline-sync.yml'));
  assert.ok(report.files.includes('scripts/redline-install.sh'));
});

test('a pull request that cannot be opened is reported, not thrown, and the config still records onboarding', async () => {
  const cwd = repo();
  const platform = fakePlatform({ failPullRequest: true });
  const report = await init(platform, { cwd, root, now });

  assert.equal(report.pullRequest, null);
  assert.match(report.pullRequestError ?? '', /nothing to commit/);
  assert.equal(report.alreadyOnboarded, false);
  assert.ok(existsSync(join(cwd, '.redline.json')), 'the host mutations were real — the config must record them');
});

test('a label refused after the pull request exists is reported but never becomes pending admin work', async () => {
  const cwd = repo();
  const platform = fakePlatform({
    pullRequestOutcomes: [
      { capability: 'labels', status: 'denied', detail: 'pull request label "redline-sync" (needs admin)' },
    ],
  });
  const report = await init(platform, { cwd, root, now });

  assert.ok(
    report.outcomes.some((o) => o.capability === 'labels' && o.status === 'denied'),
    'post-PR work must reach the report an operator reads'
  );
  assert.ok(
    !report.pendingAdmin.includes('labels'),
    '.redline.json is written before the PR exists, so this can never be recorded as pending'
  );
  assert.ok(!readConfig(cwd)?.pendingAdmin.includes('labels'));
});

// --- Host drift, offline dry run and brownfield migration -------------------

test('a loosened ruleset is re-applied on a plain re-run instead of being short-circuited', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now, menu: { blockingGate: true } });

  // The repository is onboarded and every file matches; the only thing wrong
  // is on the host, where someone dropped the required check.
  const second = fakePlatform();
  second.lastPolicy = { ...second.lastPolicy!, blocking: false };
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, false, 'a drifted ruleset is not "nothing to change"');
  assert.ok(second.applied.includes('applyPolicy'));
  assert.equal(second.lastPolicy?.blocking, true, 'the blocking gate the config records is restored');
});

test('a ruleset that vanished from the host is re-applied on a plain re-run', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const second = fakePlatform();
  second.lastPolicy = null;
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, false);
  assert.ok(second.applied.includes('applyPolicy'));
});

// `redline verify` tells the operator to run `redline init --repair` for a
// capability the host now reports enabled. That instruction has to be true:
// only a run that retries the write can clear a record of a refused write.
test('a capability granted since the last run is cleared from .redline.json by --repair', async () => {
  const cwd = repo();
  await init(
    fakePlatform({
      security: [
        { capability: 'secret-scanning', status: 'denied', detail: 'needs admin' },
        { capability: 'push-protection', status: 'applied', detail: '' },
        { capability: 'dependency-alerts', status: 'applied', detail: '' },
      ],
    }),
    { cwd, root, now }
  );
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['secret-scanning']);

  const plain = fakePlatform();
  const settled = await init(plain, { cwd, root, now });
  assert.equal(settled.alreadyOnboarded, true, 'a read that the setting is on is not work to do');
  assert.deepEqual(plain.applied, []);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['secret-scanning']);

  const granted = fakePlatform();
  const report = await init(granted, { cwd, root, now, repair: true });

  assert.ok(granted.applied.includes('enableSecurityFloor'), 'only a retried write answers the record');
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, []);
  assert.deepEqual(report.pendingAdmin, []);
});

test('a capability the host still denies keeps the repository settled and is reported from the record', async () => {
  const cwd = repo();
  const denied: CapabilityOutcome[] = [
    { capability: 'secret-scanning', status: 'denied', detail: 'needs admin' },
    { capability: 'push-protection', status: 'applied', detail: '' },
    { capability: 'dependency-alerts', status: 'applied', detail: '' },
  ];
  await init(fakePlatform({ security: denied }), { cwd, root, now });

  const second = fakePlatform({
    securityState: [
      { capability: 'secret-scanning', status: 'denied', detail: 'still not enabled' },
      { capability: 'push-protection', status: 'applied', detail: '' },
    ],
  });
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, true);
  assert.deepEqual(second.applied, [], 'reading the host is not mutating it');
  // repoRef is the identity read every real run needs; the plan phase adds
  // exactly one more, and no more. A second would go unnoticed without this —
  // and readSecurityState is not it: nothing it can say revises the record.
  assert.deepEqual(second.reads, ['repoRef', 'readPolicy']);
  assert.deepEqual(report.pendingAdmin, ['secret-scanning']);
});

test('--dry-run reads nothing from the host at all, not even the repository', async () => {
  const cwd = repo();
  const platform = fakePlatform();
  const report = await init(platform, { cwd, root, now, dryRun: true });

  assert.deepEqual(platform.reads, [], 'a dry run must work offline and with an unscoped token');
  assert.deepEqual(platform.applied, []);
  assert.ok(report.files.length > 0);
});

test('--dry-run lists the files it would delete separately from the ones it would write', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  const orphan = '.github/instructions/redline-gone-stack.instructions.md';
  writeFileSync(join(cwd, orphan), 'a stack no longer in this profile\n');

  const report = await init(fakePlatform(), { cwd, root, now, dryRun: true });

  assert.ok(report.removals.includes(orphan), 'a prune candidate is a deletion, not a write');
  assert.ok(report.files.includes(orphan), 'and it still has to be staged into the pull request');
  assert.ok(
    !report.files.some((f) => f.includes('(stale, should be removed)')),
    "the plan must not carry render()'s human-readable suffix as if it were a path"
  );
  assert.ok(existsSync(join(cwd, orphan)), 'a dry run deletes nothing');
});

// `.github/workflows/redline.yml` is the 2.1 marker, but v3 writes the same
// path. A v3 repository whose .redline.json was deleted must not be mistaken
// for a 2.1 one and have its scripts removed.
test('a v3 repository whose config was deleted is not mistaken for a 2.1 migration', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  writeFileSync(join(cwd, 'scripts/redline-deploy.sh'), '#!/bin/sh\n# Generated by Redline\n');
  rmSync(join(cwd, '.redline.json'));

  const report = await init(fakePlatform(), { cwd, root, now });

  assert.equal(report.migratedFrom, null, "the caller workflow on disk is v3's own");
  assert.ok(existsSync(join(cwd, 'scripts/redline-deploy.sh')));
});

test('a hand-written redline-named script is never deleted by the 2.1 migration', async () => {
  const cwd = repo({
    'package.json': '{"dependencies":{"react":"19"}}',
    '.github/workflows/redline.yml': 'name: Redline 2.1\n',
    'scripts/redline-deploy.sh': '#!/bin/sh\necho "our own deploy script"\n',
    'scripts/redline-install.sh': '#!/bin/sh\n# Generated by Redline 2.1\n',
  });

  const report = await init(fakePlatform(), { cwd, root, now });

  assert.equal(report.migratedFrom, '2.1');
  assert.ok(
    existsSync(join(cwd, 'scripts/redline-deploy.sh')),
    'no Redline marker means it belongs to a human — brownfield rule'
  );
  assert.equal(existsSync(join(cwd, 'scripts/redline-install.sh')), false);
  assert.ok(!report.files.includes('scripts/redline-deploy.sh'));
});

// --- Partial permission is the normal path, and must converge ---------------

test('a repository onboarded without admin rights settles instead of re-running forever', async () => {
  const noAdmin = {
    policy: [
      { capability: 'merge-policy' as const, status: 'denied' as const, detail: 'needs repository admin' },
      { capability: 'repo-property' as const, status: 'applied' as const, detail: '' },
    ],
  };
  const cwd = repo();
  await init(fakePlatform(noAdmin), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['merge-policy']);

  // A refused ruleset was never created, so the host has none to read back.
  // That is the recorded state, not drift.
  const second = fakePlatform(noAdmin);
  second.lastPolicy = null;
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, true, 'the normal partial-permission path must converge');
  assert.deepEqual(second.applied, [], 'and must not rewrite four host settings on every re-run');
  assert.deepEqual(report.pendingAdmin, ['merge-policy']);
});

test('a read that cannot see a capability leaves the recorded state exactly as recorded', async () => {
  const cwd = repo();
  await init(
    fakePlatform({
      security: [
        { capability: 'secret-scanning', status: 'denied', detail: 'needs admin' },
        { capability: 'push-protection', status: 'applied', detail: '' },
        { capability: 'dependency-alerts', status: 'applied', detail: '' },
      ],
    }),
    { cwd, root, now }
  );
  const before = readFileSync(join(cwd, '.redline.json'), 'utf8');
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['secret-scanning']);

  // What a write-but-not-admin token sees: GitHub omits the security block
  // entirely, so the adapter reports `unsupported`. That is not an answer
  // about whether an administrator still has to act, in either direction — it
  // must neither clear the recorded entry nor add one.
  const second = fakePlatform({
    securityState: [
      { capability: 'secret-scanning', status: 'unsupported', detail: 'secret scanning (not visible to this token)' },
      { capability: 'push-protection', status: 'unsupported', detail: 'push protection (not visible to this token)' },
    ],
  });
  const report = await init(second, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, true);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(report.pendingAdmin, ['secret-scanning']);
  assert.equal(readFileSync(join(cwd, '.redline.json'), 'utf8'), before, 'a correct record must not be overwritten');
});

test('a run that already has work to do never reads the host', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  writeFileSync(join(cwd, 'AGENTS.md'), 'drifted by hand\n');

  const second = fakePlatform();
  await init(second, { cwd, root, now });

  assert.deepEqual(
    second.reads,
    ['repoRef'],
    'the drift reads only decide a run with nothing else to do — a read-side outage must not abort a real run'
  );
});

// `readPolicy` answers "a ruleset exists", never "this token may write one".
// On GitHub the two split along GET /rulesets (read) and PUT /rulesets/{id}
// (admin), which is exactly the write-but-not-admin actor this whole area is
// about: the ruleset an administrator created reads back fine while every
// write to it is refused.
test('a ruleset the token can read but not write settles instead of re-applying forever', async () => {
  const cwd = repo();
  const platform = fakePlatform({
    policy: [
      { capability: 'merge-policy', status: 'denied', detail: 'needs repository admin' },
      { capability: 'repo-property', status: 'applied', detail: '' },
    ],
  });

  await init(platform, { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['merge-policy']);
  assert.notEqual(platform.lastPolicy, null, 'the ruleset an administrator created is still on the host');

  for (const run of [2, 3, 4]) {
    const before = platform.applied.length;
    const report = await init(platform, { cwd, root, now });

    assert.equal(report.alreadyOnboarded, true, `run ${run} must not treat a refused write as drift`);
    assert.deepEqual(
      platform.applied.slice(before),
      [],
      `run ${run} re-applied host settings, so run ${run + 1} will read the same refusal again`
    );
    assert.deepEqual(report.pendingAdmin, ['merge-policy'], `run ${run} lost the recorded refusal`);
  }
});

// C1. `pendingAdmin` records what a WRITE was refused; `readSecurityState`
// answers a different question ("is the setting on?"). Where the two answers
// disagree the old settled path cleared or created the record from the read,
// the apply path re-derived it from the write, and the repository never
// converged: four host mutations and another commit on the onboarding pull
// request, on every run, exiting 0 throughout.
//
// GitHub reaches this with a fine-grained token holding `administration: read`
// but not `write`: GET /vulnerability-alerts answers 204 (`applied`) while
// PUT /automated-security-fixes answers 403 (`denied`), and `worstOutcome`
// folds the pair into a denied `dependency-alerts`.
const READ_ON: CapabilityOutcome[] = [
  { capability: 'secret-scanning', status: 'applied', detail: '' },
  { capability: 'push-protection', status: 'applied', detail: '' },
  { capability: 'dependency-alerts', status: 'applied', detail: '' },
];

async function settledPerRun(
  cwd: string,
  opts: { security: CapabilityOutcome[]; securityState: CapabilityOutcome[]; ref?: RepoRef }
): Promise<boolean[]> {
  const settled: boolean[] = [];
  for (const _run of [1, 2, 3, 4]) {
    const report = await init(fakePlatform(opts), { cwd, root, now });
    settled.push(report.alreadyOnboarded);
  }
  return settled;
}

test('a security write the host refuses while the read reports it on settles on the second run', async () => {
  const cwd = repo();
  const settled = await settledPerRun(cwd, {
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: '' },
      { capability: 'push-protection', status: 'applied', detail: '' },
      { capability: 'dependency-alerts', status: 'denied', detail: 'automated security fixes' },
    ],
    securityState: READ_ON,
  });

  assert.deepEqual(settled, [false, true, true, true]);
  assert.deepEqual(
    readConfig(cwd)?.pendingAdmin,
    ['dependency-alerts'],
    'a read that the setting is on is no evidence about whether this token may write it'
  );
});

test('a security write the host accepts while the read reports it off settles on the second run', async () => {
  const cwd = repo();
  const settled = await settledPerRun(cwd, {
    security: READ_ON,
    securityState: [
      { capability: 'secret-scanning', status: 'applied', detail: '' },
      { capability: 'push-protection', status: 'applied', detail: '' },
      { capability: 'dependency-alerts', status: 'denied', detail: 'not enabled' },
    ],
  });

  assert.deepEqual(settled, [false, true, true, true]);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, [], 'a read never files work against an administrator');
});

// Azure reads all three capabilities off the single `advSecEnabled` flag and
// writes all three through one PATCH, so a PAT with `vso.advsec` but no
// Project Administrator role oscillates every capability at once.
const AZURE_REF: RepoRef = { host: 'azure', org: 'acme', repo: 'web', defaultBranch: 'main' };
const AZURE_DENIED: CapabilityOutcome[] = [
  { capability: 'secret-scanning', status: 'denied', detail: 'needs Project Administrator' },
  { capability: 'push-protection', status: 'denied', detail: 'needs Project Administrator' },
  { capability: 'dependency-alerts', status: 'denied', detail: 'needs Project Administrator' },
];

test('an Azure PAT that can read Advanced Security but not write it settles on the second run', async () => {
  const cwd = repo();
  const settled = await settledPerRun(cwd, {
    ref: AZURE_REF,
    security: AZURE_DENIED,
    securityState: READ_ON,
  });

  assert.deepEqual(settled, [false, true, true, true]);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, [
    'secret-scanning',
    'push-protection',
    'dependency-alerts',
  ]);
});

test('an Azure enablement write that reports success while the read reports it off settles on the second run', async () => {
  const cwd = repo();
  const settled = await settledPerRun(cwd, {
    ref: AZURE_REF,
    security: READ_ON,
    securityState: AZURE_DENIED,
  });

  assert.deepEqual(settled, [false, true, true, true]);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, []);
});

test('a refused policy write leaves the host without the ruleset it was refused', async () => {
  const cwd = repo();
  const platform = fakePlatform({
    policy: [
      { capability: 'merge-policy', status: 'denied', detail: 'needs repository admin' },
      { capability: 'repo-property', status: 'applied', detail: '' },
    ],
  });
  // A repository with no Redline ruleset yet, whose install is then refused.
  platform.lastPolicy = null;

  await init(platform, { cwd, root, now });

  assert.equal(platform.lastPolicy, null, 'a write the host refused created nothing to read back');
});

test('a granted merge-policy clears from the record on the next run that has a policy to write', async () => {
  const cwd = repo();
  await init(
    fakePlatform({
      policy: [
        { capability: 'merge-policy', status: 'denied', detail: 'needs repository admin' },
        { capability: 'repo-property', status: 'applied', detail: '' },
      ],
    }),
    { cwd, root, now }
  );
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['merge-policy']);

  // The administrator granted the rights. Nothing reads write-permission back,
  // so the record clears when a run actually writes the policy — here because
  // the live advisory ruleset no longer matches the requested menu.
  const second = fakePlatform();
  const report = await init(second, { cwd, root, now, menu: { blockingGate: true } });

  assert.equal(report.alreadyOnboarded, false);
  assert.ok(second.applied.includes('applyPolicy'));
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, []);
});

// --- --repair: closes the last onboarding path that never converges on its own ---

const laterNow = (): Date => new Date('2026-10-01T00:00:00.000Z');

// The sibling test above ("a repository onboarded without admin rights
// settles instead of re-running forever") proves a plain re-run must never
// retry this state — reintroducing that would bring back the infinite re-run
// round 3 fixed. --repair is the only sanctioned way out of it.
test('a repository with no ruleset and a recorded merge-policy refusal converges under --repair once an administrator grants rights', async () => {
  const noAdmin = {
    policy: [
      { capability: 'merge-policy' as const, status: 'denied' as const, detail: 'needs repository admin' },
      { capability: 'repo-property' as const, status: 'applied' as const, detail: '' },
    ],
  };
  const cwd = repo();
  await init(fakePlatform(noAdmin), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['merge-policy']);

  // Pin: --repair is not `rm .redline.json && redline init` — it must not
  // fabricate a 2.1 migration out of a script a human wrote, because it never
  // stops reading the config that is already there.
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  writeFileSync(join(cwd, 'scripts/redline-deploy.sh'), '#!/bin/sh\n# Generated by Redline\necho deploy\n');

  // The grant itself: given the chance to write, applyPolicy now succeeds.
  // `lastPolicy` stays null until that write happens — modelling a host that
  // still has no ruleset going into this run.
  const granted = fakePlatform();
  granted.lastPolicy = null;
  const report = await init(granted, { cwd, root, now: laterNow, repair: true });

  assert.ok(
    !report.pendingAdmin.includes('merge-policy'),
    'the grant must clear once --repair actually retries the write'
  );
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, []);
  assert.ok(granted.applied.includes('applyPolicy'), 'a plain re-run would never even attempt the write here');
  assert.notEqual(granted.lastPolicy, null, 'the ruleset now exists on the host');

  // onboardedAt and the recorded menu survive even though the run took the
  // full apply path.
  assert.equal(readConfig(cwd)?.onboardedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(readConfig(cwd)?.menu.blockingGate, false);

  assert.equal(report.migratedFrom, null, "a config that already exists is never re-read as a 2.1 migration");
  assert.ok(
    existsSync(join(cwd, 'scripts/redline-deploy.sh')),
    'removeLegacyArtifacts must never run against a repository --repair never treated as migrating'
  );
});

// --- Task 14: per-repository vendor selection --------------------------------

test('detects copilot from an existing .github/copilot-instructions.md', async () => {
  const cwd = repo({
    'package.json': '{"dependencies":{"react":"19"}}',
    '.github/copilot-instructions.md': 'ours\n',
  });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['copilot']);
});

test('detects copilot from an existing .github/instructions directory alone', async () => {
  const cwd = repo({
    'package.json': '{"dependencies":{"react":"19"}}',
    '.github/instructions/team.instructions.md': 'ours\n',
  });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['copilot']);
});

test('detects claude from an existing CLAUDE.md', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', 'CLAUDE.md': 'ours\n' });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['claude']);
});

test('detects claude from an existing .claude directory alone', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', '.claude/settings.json': '{}' });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['claude']);
});

test('detects agents from an existing AGENTS.md', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', 'AGENTS.md': 'ours\n' });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['agents']);
});

test('detects cursor from an existing .cursor/rules directory', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', '.cursor/rules/team.mdc': 'ours\n' });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['cursor']);
});

test('detects every vendor whose markers are present at once', async () => {
  const cwd = repo({
    'package.json': '{"dependencies":{"react":"19"}}',
    '.github/copilot-instructions.md': 'ours\n',
    'CLAUDE.md': 'ours\n',
  });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['copilot', 'claude']);
});

test('a repository with none of the markers gets the org default, every enabled vendor', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['copilot', 'agents', 'claude']);
});

test('an explicit vendor selection overrides detection', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', 'CLAUDE.md': 'ours\n' });
  await init(fakePlatform(), { cwd, root, now, vendors: ['agents'] });
  assert.deepEqual(readConfig(cwd)?.vendors, ['agents']);
});

test('a re-run preserves the recorded vendor selection rather than re-detecting', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', 'CLAUDE.md': 'ours\n' });
  await init(fakePlatform(), { cwd, root, now, vendors: ['agents'] });

  // Force a real second run so the precedence logic is actually exercised
  // rather than short-circuited before it runs.
  writeFileSync(join(cwd, 'AGENTS.md'), 'drifted by hand\n');
  await init(fakePlatform(), { cwd, root, now });

  assert.deepEqual(readConfig(cwd)?.vendors, ['agents'], 'CLAUDE.md on disk must not re-trigger detection');
});

// A vendor the org manifest disables (cursor, in standards/manifest.json)
// must never render even when it is what the repository detected, or typed.
test('an org-disabled vendor is recorded but never rendered', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}', '.cursor/rules/team.mdc': 'ours\n' });
  await init(fakePlatform(), { cwd, root, now });
  assert.deepEqual(readConfig(cwd)?.vendors, ['cursor']);
  assert.equal(existsSync(join(cwd, '.cursor/rules/redline-core.mdc')), false);
});

// I4. The ceiling has to cover both renderers. render() filtered cursor out of
// .cursor/rules/ while renderCommands wrote .cursor/commands/ regardless, so
// the run delivered half of a vendor the org had switched off — and its slash
// commands then went stale in a tool the repository never opted into.
test('an org-disabled vendor gets no command files either', async () => {
  const cwd = repo();
  const report = await init(fakePlatform(), { cwd, root, now, vendors: ['copilot', 'cursor'] });

  assert.equal(existsSync(join(cwd, '.github/prompts/redline-init.prompt.md')), true);
  assert.equal(existsSync(join(cwd, '.cursor/commands/redline-init.md')), false);
  assert.equal(existsSync(join(cwd, '.cursor/commands/redline-verify.md')), false);
  assert.ok(!report.files.some((f) => f.startsWith('.cursor/')), report.files.join(', '));
});

test('deselecting a vendor removes what it wrote and makes a settled repository not settled', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  assert.ok(existsSync(join(cwd, 'CLAUDE.md')));

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now, vendors: ['copilot', 'agents'] });

  assert.equal(report.alreadyOnboarded, false, 'deselecting a vendor is work to do');
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), false);
  assert.ok(report.removals.includes('CLAUDE.md'));
  assert.deepEqual(readConfig(cwd)?.vendors, ['copilot', 'agents']);
  assert.ok(second.applied.includes('openPullRequest'));
});

// A deselect that has nothing left on disk to remove (a human already
// deleted the file) still moves .redline.json — vendorsChanged, not the file
// diff, is what has to catch it. A wrong implementation that folds vendor
// selection into changedFiles alone would report this as already onboarded
// and never update the recorded selection.
test('a vendor deselect with nothing left to remove on disk is still a real run, not a no-op', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  rmSync(join(cwd, 'CLAUDE.md'));

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now, vendors: ['copilot', 'agents'] });

  assert.equal(report.alreadyOnboarded, false, 'a vendor selection change must not be swallowed as nothing to change');
  assert.deepEqual(readConfig(cwd)?.vendors, ['copilot', 'agents']);
  assert.ok(second.applied.includes('openPullRequest'));
});

test('--dry-run reports a deselected vendor as a removal, not a write, and deletes nothing', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  assert.ok(existsSync(join(cwd, 'CLAUDE.md')));

  const report = await init(fakePlatform(), { cwd, root, now, vendors: ['copilot', 'agents'], dryRun: true });

  assert.ok(report.removals.includes('CLAUDE.md'), 'a deselected vendor is a removal, not a write');
  assert.ok(report.files.includes('CLAUDE.md'));
  assert.ok(existsSync(join(cwd, 'CLAUDE.md')), 'a dry run deletes nothing');
});

test(
  'a settled repository under --repair re-applies host settings, reports already everywhere, ' +
    'and changes only lastRunAt in .redline.json',
  async () => {
    const cwd = repo();
    const settled = {
      gate: [{ capability: 'labels' as const, status: 'already' as const, detail: 'label exists' }],
      ownership: [{ capability: 'review-ownership' as const, status: 'already' as const, detail: 'owners match' }],
      security: [
        { capability: 'secret-scanning' as const, status: 'already' as const, detail: 'on' },
        { capability: 'push-protection' as const, status: 'already' as const, detail: 'on' },
        { capability: 'dependency-alerts' as const, status: 'already' as const, detail: 'on' },
      ],
      policy: [
        { capability: 'merge-policy' as const, status: 'already' as const, detail: 'matches' },
        { capability: 'repo-property' as const, status: 'already' as const, detail: 'set' },
      ],
    };
    await init(fakePlatform(settled), { cwd, root, now });
    const before = readConfig(cwd)!;

    const second = fakePlatform(settled);
    const report = await init(second, { cwd, root, now: laterNow, repair: true });

    assert.ok(
      report.outcomes.length > 0 && report.outcomes.every((o) => o.status === 'already'),
      JSON.stringify(report.outcomes)
    );
    assert.deepEqual(second.applied, [
      'installGate',
      'ensureReviewOwnership',
      'enableSecurityFloor',
      'applyPolicy',
      'openPullRequest',
    ]);

    const after = readConfig(cwd)!;
    assert.notEqual(after.lastRunAt, before.lastRunAt, '--repair must actually run, not stay short-circuited');
    assert.equal(after.onboardedAt, before.onboardedAt);
    assert.deepEqual(after.menu, before.menu);
    assert.deepEqual(after.pendingAdmin, before.pendingAdmin);
    assert.equal(after.profile, before.profile);
    assert.deepEqual(after.vendors, before.vendors);
  }
);

test('--repair --dry-run makes zero host mutations and does not report already onboarded', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  const before = readFileSync(join(cwd, '.redline.json'), 'utf8');

  const platform = fakePlatform();
  const report = await init(platform, { cwd, root, now, dryRun: true, repair: true });

  assert.equal(
    report.alreadyOnboarded,
    false,
    '--repair must not report a settled repository as already onboarded, even as a dry run'
  );
  assert.deepEqual(platform.applied, []);
  assert.deepEqual(platform.reads, [], 'a dry run must work offline, repair or not');
  assert.equal(readFileSync(join(cwd, '.redline.json'), 'utf8'), before, 'a dry run writes nothing');
});

// The two --repair tests above both call a normal (non-repair) `init()` first
// to reach a settled state, and that call's own installGate always stamps a
// V3-matching caller workflow — so `detectMigration`'s '2.1' branch is
// structurally unreachable in either fixture no matter what `onboarded` flag
// it is given. Neither test can see a regression that makes `--repair` pass
// something other than `existing !== null` through to detectMigration. This
// test drives the one scenario that can see it: a config that already exists
// sitting next to a caller workflow that still looks like 2.1's own.
test('--repair does not mistake a stale pre-v3 caller workflow for a migration on an already-onboarded repository', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  // A repository init already onboarded, whose caller workflow a human (or a
  // half-finished 2.1 rollout) left carrying 2.1's own name rather than v3's
  // reusable-workflow reference. `.redline.json` existing is what must decide
  // this is not a migration — the file content alone would say otherwise.
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), 'name: Redline 2.1\n');
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  writeFileSync(join(cwd, 'scripts/redline-deploy.sh'), '#!/bin/sh\n# Generated by Redline\necho deploy\n');

  const report = await init(fakePlatform(), { cwd, root, now: laterNow, repair: true });

  assert.equal(
    report.migratedFrom,
    null,
    'a config that already exists must never be re-read as a 2.1 migration, repair or not'
  );
  assert.ok(
    existsSync(join(cwd, 'scripts/redline-deploy.sh')),
    'removeLegacyArtifacts must never run against a repository --repair never treated as migrating'
  );
});

// The gate machinery file is the one path both adapters refuse rather than
// clobber, and the refusal says "Nothing was written". That has to be true:
// planning happens before the first byte reaches the working tree, which is
// this branch's whole discipline. It used to fire after render() and
// renderCommands() had already written, leaving a half-onboarded tree under a
// message saying nothing had happened.
test('a refused gate file leaves no half-onboarded tree behind', async () => {
  const cwd = repo({ 'package.json': '{"dependencies":{"react":"19"}}' });
  const platform = fakePlatform({ refuseGate: 'the caller workflow is not Redline\'s' });

  await assert.rejects(init(platform, { cwd, root, now }), /not Redline/);

  assert.equal(existsSync(join(cwd, 'AGENTS.md')), false, 'no rendered artifact may survive the refusal');
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), false);
  assert.equal(existsSync(join(cwd, '.claude/commands')), false, 'no command file either');
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
});

// The product owner's question: "where's the part that makes sure I select what
// I need to onboard — and if I already have pipelines wired, so I can ignore
// them?" Brownfield safety stops Redline taking a human's object over; it does
// not stop Redline writing a second gate beside one that already works.
test('a deselected gate is never attempted and writes no workflow', async () => {
  const platform = fakePlatform();
  const cwd = repo();
  await init(platform, { cwd, root, now, capabilities: { gate: false } });

  assert.ok(!platform.applied.includes('installGate'), 'not attempted');
  assert.ok(!platform.planned.includes('installGate'), 'not even planned');
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false, 'and nothing written');
});

test('a deselected merge policy is never applied to the host', async () => {
  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now, capabilities: { mergePolicy: false } });

  assert.ok(!platform.applied.includes('applyPolicy'));
});

test('deselected labels leave the onboarding pull request unlabelled', async () => {
  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now, capabilities: { labels: false } });

  assert.deepEqual(platform.lastChange?.labels, []);
});

// The recorded selection is the whole point: an operator who says "we have our
// own gate" must not have to say it again on every re-run.
test('a deselected capability survives a re-run with no flags', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now, capabilities: { gate: false } });

  const second = fakePlatform();
  await init(second, { cwd, root, now });

  assert.equal(readConfig(cwd)?.capabilities.gate, false);
  assert.ok(!second.applied.includes('installGate'));
});

test('a typed flag turns a deselected capability back on', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now, capabilities: { gate: false } });

  const second = fakePlatform();
  await init(second, { cwd, root, now, capabilities: { gate: true } });

  assert.equal(readConfig(cwd)?.capabilities.gate, true);
  assert.ok(second.applied.includes('installGate'));
});

// This branch has had two non-convergence bugs. A selection change is work to
// do exactly once, and the run after it must settle.
test('a repository settles on the run after a capability is deselected', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  await init(fakePlatform(), { cwd, root, now, capabilities: { gate: false } });

  const third = fakePlatform();
  const report = await init(third, { cwd, root, now });

  assert.equal(report.alreadyOnboarded, true);
  assert.deepEqual(third.applied, []);
});

// Without this the deselection is swallowed as "nothing to change" and
// .redline.json keeps recording a capability the operator just switched off.
test('deselecting a capability on a settled repository is work to do', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const second = fakePlatform();
  const report = await init(second, { cwd, root, now, capabilities: { labels: false } });

  assert.equal(report.alreadyOnboarded, false);
  assert.equal(readConfig(cwd)?.capabilities.labels, false);
});

test('--dry-run names what a deselection changes and writes nothing', async () => {
  const cwd = repo();
  const platform = fakePlatform();
  const report = await init(platform, { cwd, root, now, dryRun: true, capabilities: { gate: false } });

  assert.deepEqual(report.optedOut, ['gate', 'labels']);
  assert.equal(report.capabilities.gate, false);
  assert.deepEqual(platform.applied, []);
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
});

// Review ownership already had a switch — `menu.sensitivePathReviewers`. The
// operator-facing name maps onto it rather than growing a second one.
test('the review-ownership name maps onto the menu switch that already exists', async () => {
  const { menu, capabilities } = capabilitySelection(['review-ownership'], []);
  assert.deepEqual(menu, { sensitivePathReviewers: false });
  assert.deepEqual(capabilities, {});

  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now, menu, capabilities });
  assert.ok(!platform.applied.includes('ensureReviewOwnership'));
});

test('--with turns a capability back on by name', () => {
  assert.deepEqual(capabilitySelection([], ['gate', 'review-ownership']), {
    menu: { sensitivePathReviewers: true },
    capabilities: { gate: true },
  });
});

// The opt-out is the repository's; the floor is the organisation's. Refusing by
// name is the difference between "we will not do that" and quietly doing it
// anyway while the operator believes they opted out.
test('the security floor is refused by name rather than silently ignored', () => {
  assert.throws(() => capabilitySelection(['security-floor'], []), /security floor/);
  assert.throws(() => capabilitySelection(['security-floor'], []), (error: unknown) => {
    assert.equal(isRedlineError(error) && error.kind, 'usage');
    return true;
  });
});

test('an unknown capability name is a usage error that lists the real ones', () => {
  assert.throws(() => capabilitySelection(['pipelines'], []), /unknown capability "pipelines"/);
});

test('a capability named on both sides at once is a usage error', () => {
  assert.throws(() => capabilitySelection(['gate'], ['gate']), /both/);
});

// Nothing publishes the required check once the gate is deselected, so a
// blocking policy would block every pull request in the repository forever.
test('a blocking merge policy with no gate is refused before anything is touched', async () => {
  const platform = fakePlatform();
  const cwd = repo();

  await assert.rejects(
    init(platform, { cwd, root, now, capabilities: { gate: false }, menu: { blockingGate: true } }),
    /blocking/
  );
  assert.deepEqual(platform.applied, []);
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
});

// Detection informs the operator; it does not decide for them.
test('init names the pipelines already in the repository and offers the opt-out', async () => {
  const cwd = repo({
    'package.json': '{}',
    '.github/workflows/ci.yml': 'name: ci\n',
  });
  const platform = fakePlatform({
    gateMachinery: {
      path: '.github/workflows/redline.yml',
      present: false,
      publishes: null,
      expected: 'redline-gate / gate',
    },
  });
  const report = await init(platform, { cwd, root, now, dryRun: true });

  assert.ok(
    report.notes.some((note) => note.includes('.github/workflows/ci.yml') && note.includes('--skip gate')),
    `expected a note naming ci.yml and the opt-out, got ${JSON.stringify(report.notes)}`
  );
});

test('a repository with nothing already wired is told nothing', async () => {
  const platform = fakePlatform({
    gateMachinery: {
      path: '.github/workflows/redline.yml',
      present: false,
      publishes: null,
      expected: 'redline-gate / gate',
    },
  });
  const report = await init(platform, { cwd: repo(), root, now, dryRun: true });

  assert.deepEqual(report.notes, []);
});

// Task 19's residual: the byte-exact match against the installed CLI's command
// text cannot recognise output written under different text. The recorded
// identifier can, and it only exists if init writes it down.
test('the content id of every command file it wrote is recorded', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now, vendors: ['claude'] });

  assert.equal(
    readConfig(cwd)?.commandFiles['.claude/commands/redline-init.md'],
    contentId(readFileSync(join(cwd, '.claude/commands/redline-init.md'), 'utf8'))
  );
});

// Deselecting the gate does not delete the workflow an earlier run installed —
// the brownfield rule holds — but a run that says nothing about a Redline
// workflow still sitting there and still firing on every pull request invites
// the operator to go and delete it by hand.
test('deselecting the gate names the workflow an earlier run left behind', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const report = await init(fakePlatform(), { cwd, root, now, capabilities: { gate: false } });

  assert.ok(
    report.notes.some(
      (note) => note.includes('.github/workflows/redline.yml') && note.includes('still')
    ),
    `expected the leftover workflow to be named, got ${JSON.stringify(report.notes)}`
  );
});

// The two-flag route past the deadlock guard: the guard only refuses a blocking
// policy this run would apply, so deselecting the policy as well walks straight
// past it and leaves a live blocking ruleset requiring a check nothing will
// publish. Not a refusal — the policy is the repository's now — but it cannot
// go unsaid.
test('deselecting the merge policy names the blocking ruleset Redline leaves behind', async () => {
  const cwd = repo();
  const platform = fakePlatform();
  await init(platform, { cwd, root, now, menu: { blockingGate: true } });

  const report = await init(platform, {
    cwd,
    root,
    now,
    capabilities: { gate: false, mergePolicy: false },
  });

  assert.ok(
    report.notes.some((note) => note.includes('blocking')),
    `expected the live blocking policy to be named, got ${JSON.stringify(report.notes)}`
  );
});

// A repository that was never given a blocking policy has nothing to warn about.
test('deselecting an advisory merge policy says nothing about a blocking one', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const report = await init(fakePlatform(), { cwd, root, now, capabilities: { mergePolicy: false } });

  assert.ok(!report.notes.some((note) => note.includes('blocking')), JSON.stringify(report.notes));
});

// GitHub pre-declares the gate's soft-fail labels inside the gate install, so a
// deselected gate takes the labels with it. Recording and reporting `labels` as
// selected while nothing will ever create one is the silence this selection
// exists to end.
test('deselecting the gate reports labels as off with it, and says why', async () => {
  const cwd = repo();
  const report = await init(fakePlatform(), { cwd, root, now, capabilities: { gate: false } });

  assert.deepEqual(report.optedOut, ['gate', 'labels']);
  assert.ok(
    report.notes.some((note) => note.includes('labels')),
    `expected the reason to be given, got ${JSON.stringify(report.notes)}`
  );
  // The operator's own choice is what is recorded, so re-selecting the gate
  // brings the labels back rather than needing a second flag.
  assert.equal(readConfig(cwd)?.capabilities.labels, true);
});

// With the gate deselected `installGate` no longer runs first, so nothing else
// touches that path before this does. What it feeds is two advisory notes.
test('a gate machinery path that cannot be read costs the notes, never the run', async () => {
  const platform = fakePlatform();
  platform.readGateMachinery = () => {
    throw new RedlineError('failed', 'cannot read .github/workflows/redline.yml: EISDIR');
  };

  const report = await init(platform, { cwd: repo(), root, now, capabilities: { gate: false } });

  assert.ok(
    !report.notes.some((note) => note.includes('.github/workflows/redline.yml')),
    'nothing was observed, so nothing is claimed about that path'
  );
  assert.equal(report.alreadyOnboarded, false);
});

test('the mandatory-capability refusal says "cannot be deselected" once', () => {
  assert.throws(capabilitySelectionOnce, (error: unknown) => {
    const message = isRedlineError(error) ? error.message : '';
    assert.equal((message.match(/cannot be deselected/g) ?? []).length, 1, message);
    return true;
  });
});

const capabilitySelectionOnce = (): void => {
  capabilitySelection(['security-floor'], []);
};
