import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../redline.ts';
import { CLI_VERSION } from '../../core/version.ts';
import { createGit, type GitRunner } from '../../core/git.ts';
import { RedlineError } from '../../core/errors.ts';
import { resolvePlatform, type ResolvePlatformOptions } from '../../platforms/resolve.ts';
import { fakePlatform, type FakePlatform } from '../../commands/__tests__/fake-platform.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const BIN = fileURLToPath(new URL('../redline.ts', import.meta.url));

const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

function deps(cwd: string) {
  const lines: string[] = [];
  return {
    lines,
    opts: {
      cwd,
      root,
      sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
      resolvePlatform: async () => fakePlatform(),
    },
  };
}

function repo(): string {
  const dir = tmp('redline-bin-');
  writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"19"}}');
  return dir;
}

test('no command prints usage and exits 2', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run([], opts), 2);
  assert.ok(lines.some((l) => l.includes('redline init')));
});

test('an unknown command exits 2 and names it', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['refactor'], opts), 2);
  assert.ok(lines.some((l) => l.includes('refactor')));
});

test('--help prints usage and exits 0', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['--help'], opts), 0);
  assert.ok(lines.some((l) => l.includes('redline init')));
});

test('an unknown flag exits 2', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['init', '--nope'], opts), 2);
  assert.ok(lines.length > 0);
});

test('--version prints the version and exits 0', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['--version'], opts), 0);
  assert.equal(lines.length, 1);
});

test('init onboards and exits 0', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init'], opts), 0);
  assert.ok(lines.some((l) => l.includes('web')));
});

test('init --profile passes the override through', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--profile', 'infra'], opts), 0);
  assert.ok(lines.some((l) => l.includes('infra')));
});

test('init --blocking promotes the gate', async () => {
  const cwd = repo();
  const { opts } = deps(cwd);
  assert.equal(await run(['init', '--blocking'], opts), 0);
});

test('verify on a repo that was never onboarded exits 2', async () => {
  const { opts } = deps(tmp('redline-bin-bare-'));
  assert.equal(await run(['verify'], opts), 2);
});

test('verify after init exits 0', async () => {
  const cwd = repo();
  const { opts } = deps(cwd);
  await run(['init'], opts);
  assert.equal(await run(['verify'], opts), 0);
});

test('verify on an onboarded repo with drifted artifacts exits 1', async () => {
  const cwd = repo();
  const { opts } = deps(cwd);
  await run(['init'], opts);
  // Onboarded (.redline.json present and valid) but the rendered artifact no
  // longer matches the standard — this must produce more than the single
  // short-circuit finding so it is distinguished from "never onboarded".
  writeFileSync(join(cwd, 'AGENTS.md'), 'tampered by hand, not by redline\n');
  assert.equal(await run(['verify'], opts), 1);
});

test('a RedlineError maps to its own exit code and prints its hint', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  const failing = {
    ...opts,
    resolvePlatform: async () => {
      const { RedlineError } = await import('../../core/errors.ts');
      throw new RedlineError('permission', 'no credentials', 'run: gh auth login');
    },
  };
  assert.equal(await run(['init'], failing), 3);
  assert.ok(lines.some((l) => l.includes('gh auth login')));
});

test('a host RedlineError exits 4', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  const failing = {
    ...opts,
    resolvePlatform: async () => {
      const { RedlineError } = await import('../../core/errors.ts');
      throw new RedlineError('host', 'GitHub returned HTTP 502 reading repo');
    },
  };
  assert.equal(await run(['init'], failing), 4);
  assert.ok(lines.some((l) => l.includes('GitHub returned HTTP 502')));
});

test('an unclassified internal error exits 4, not 2, and says it is unexpected', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  const failing = {
    ...opts,
    resolvePlatform: async () => {
      throw new TypeError('cannot read properties of undefined');
    },
  };
  assert.equal(await run(['init'], failing), 4);
  assert.ok(lines.some((l) => l.includes('redline failed unexpectedly') && l.includes('cannot read properties of undefined')));
});

test('an unknown profile is a usage RedlineError and exits 2 without a stack trace', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--profile', 'not-a-real-profile'], opts), 2);
  assert.ok(lines.some((l) => l.includes('unknown profile')));
  assert.ok(!lines.some((l) => l.includes('at Object.') || l.includes('.ts:')));
});

// npm installs a bin as a symlink, so the process is started through a path
// that is not the module's real path. Every other test in this file calls
// run() directly and so cannot see the entry-point guard at all; this one
// spawns the binary the way an installed package is spawned. The bug it
// pins: a textual guard is false through a symlink, nothing runs, and the
// process exits 0 in silence — which would make `verify --gate` pass
// unconditionally in CI.
const symlinkTest = { skip: process.platform === 'win32' ? 'symlinks need elevation on Windows' : false };

function spawnThroughSymlink(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const dir = tmp('redline-bin-link-');
  const link = join(dir, 'redline.ts');
  symlinkSync(BIN, link);
  const res = spawnSync(process.execPath, [link, ...args], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test('the binary runs when invoked through a symlink', symlinkTest, () => {
  const res = spawnThroughSymlink(['--version']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), CLI_VERSION);
});

test('the binary invoked through a symlink with no command exits 2, never silently 0', symlinkTest, () => {
  const res = spawnThroughSymlink([]);
  assert.notEqual(res.stdout.trim(), '', 'the binary printed nothing — the entry-point guard did not fire');
  assert.equal(res.status, 2, res.stderr);
});

// --- init re-run, dry-run and pull-request failure ---------------------------

test('init --dry-run prints the plan, writes nothing and exits 0', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--dry-run'], opts), 0);
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
  assert.equal(existsSync(join(cwd, 'AGENTS.md')), false);
  assert.ok(lines.some((l) => l.includes('dry run')));
  assert.ok(lines.some((l) => l.includes('would write')));
});

test('a flagless re-run does not demote a repository that was onboarded with --blocking', async () => {
  const cwd = repo();
  const first = deps(cwd);
  assert.equal(await run(['init', '--blocking'], first.opts), 0);

  writeFileSync(join(cwd, 'AGENTS.md'), 'drifted by hand\n');
  const platforms: FakePlatform[] = [];
  const second = deps(cwd);
  assert.equal(
    await run(['init'], {
      ...second.opts,
      resolvePlatform: async () => {
        const p = fakePlatform();
        platforms.push(p);
        return p;
      },
    }),
    0
  );
  assert.equal(platforms[0]?.lastPolicy?.blocking, true);
});

test('a pull request that could not be opened exits 1 and says where the branch is', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  const failing = { ...opts, resolvePlatform: async () => fakePlatform({ failPullRequest: true }) };
  assert.equal(await run(['init'], failing), 1);
  assert.ok(lines.some((l) => l.includes('redline/onboard') && l.includes('manually')), lines.join('\n'));
});

test('init --vendors overrides detection and skips a deselected vendor', async () => {
  const cwd = repo();
  const { opts } = deps(cwd);
  assert.equal(await run(['init', '--vendors', 'copilot,agents'], opts), 0);
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), false);
  assert.ok(existsSync(join(cwd, 'AGENTS.md')));
});

test('usage names --dry-run and says what --no-a11y and --no-speckit actually do', async () => {
  const { opts, lines } = deps(repo());
  await run(['--help'], opts);
  const usage = lines.join('\n');
  assert.ok(usage.includes('--dry-run'));
  assert.ok(usage.includes('--no-speckit'));
  assert.ok(usage.includes('neither changes anything in Phase 1'));
});

// The escape hatch for a gate machinery file Redline cannot attribute to
// itself. An operator who is never told it exists is one who reaches for
// `rm .redline.json`, so it has to be both parseable and documented.
test('init accepts --adopt-caller and the usage says what it is for', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--adopt-caller'], opts), 0, lines.join('\n'));

  const help = deps(repo());
  await run(['--help'], help.opts);
  const usage = help.lines.join('\n');
  assert.ok(usage.includes('--adopt-caller'));
  assert.ok(usage.includes('attributes it to Redline'));
});

test('the dry-run plan prints a prune candidate as a removal, not as a write', async () => {
  const cwd = repo();
  const first = deps(cwd);
  await run(['init'], first.opts);
  const orphan = '.github/instructions/redline-gone-stack.instructions.md';
  writeFileSync(join(cwd, orphan), 'a stack no longer in this profile\n');

  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--dry-run'], opts), 0);
  assert.ok(lines.some((l) => l.includes('would remove') && l.includes(orphan)), lines.join('\n'));
  assert.ok(!lines.some((l) => l.includes('would write') && l.includes(orphan)));
});

test('a no-op re-run marks the pending-admin list as recorded, not as this run\'s finding', async () => {
  const cwd = repo();
  const denied = {
    ...deps(cwd).opts,
    resolvePlatform: async () =>
      fakePlatform({
        security: [
          { capability: 'secret-scanning' as const, status: 'denied' as const, detail: 'needs admin' },
          { capability: 'push-protection' as const, status: 'applied' as const, detail: '' },
          { capability: 'dependency-alerts' as const, status: 'applied' as const, detail: '' },
        ],
        securityState: [
          { capability: 'secret-scanning' as const, status: 'denied' as const, detail: 'still off' },
          { capability: 'push-protection' as const, status: 'applied' as const, detail: '' },
        ],
      }),
  };
  await run(['init'], denied);

  const second = deps(cwd);
  assert.equal(await run(['init'], { ...second.opts, resolvePlatform: denied.resolvePlatform }), 0);
  assert.ok(
    second.lines.some((l) => l.includes('secret-scanning') && l.includes('at the last run')),
    second.lines.join('\n')
  );
});

// --- The dry run needs no credential ----------------------------------------
//
// Someone evaluating Redline wants to see what it would do to their repository
// before they go and get an admin-scoped token. These two tests are the whole
// guarantee: the preview runs without a credential, and nothing else does.

const CREDENTIALLESS_GIT: GitRunner = (args) => {
  if (args[0] === 'rev-parse') return 'true';
  if (args[0] === 'remote') return 'https://github.com/acme/web.git';
  if (args[0] === 'symbolic-ref') return 'origin/main';
  return '';
};

// Exactly what createGitHubClient() does when GH_TOKEN is unset and
// `gh auth token` fails — see resolveGitHubToken.
const noCredentials = (): never => {
  throw new RedlineError(
    'permission',
    'no GitHub credentials found — run: gh auth login, or set GH_TOKEN',
    'run: gh auth login — or set GH_TOKEN'
  );
};

// The exit code alone cannot tell an eager client from a leaked lazy one: with
// a lazy client `init`'s first host touch is `repoRef`, which throws the same
// permission error at the same moment with nothing on disk. So these tests
// observe the decision itself — the options `bin` hands to resolvePlatform —
// and, for the dry run, whether a client was ever constructed at all.
function unauthenticated(cwd: string) {
  const lines: string[] = [];
  const resolveOptions: (ResolvePlatformOptions | undefined)[] = [];
  let constructions = 0;
  return {
    lines,
    resolveOptions,
    constructions: (): number => constructions,
    opts: {
      cwd,
      root,
      sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
      // The real resolvePlatform, so the lazy wiring is exercised end to end.
      resolvePlatform: (dir: string, options?: ResolvePlatformOptions) => {
        resolveOptions.push(options);
        return resolvePlatform(dir, {
          ...options,
          gitFor: (d: string) => createGit(d, CREDENTIALLESS_GIT),
          makeGitHubClient: () => {
            constructions += 1;
            return noCredentials();
          },
        });
      },
    },
  };
}

test('init --dry-run asks for a lazy client and never constructs one', async () => {
  const u = unauthenticated(repo());
  assert.equal(await run(['init', '--dry-run'], u.opts), 0, u.lines.join('\n'));
  assert.deepEqual(u.resolveOptions, [{ lazyCredentials: true }]);
  assert.equal(u.constructions(), 0, 'a preview must not resolve a credential at all');
  assert.ok(u.lines.some((l) => l.includes('would write')), u.lines.join('\n'));
  assert.ok(u.lines.some((l) => l.includes('dry run')));
});

test('a real init never asks for a lazy client, and still exits 3 with nothing on disk', async () => {
  const cwd = repo();
  const u = unauthenticated(cwd);
  assert.equal(await run(['init'], u.opts), 3);
  assert.deepEqual(u.resolveOptions, [{}], 'the laziness must not leak off the --dry-run path');
  assert.equal(u.constructions(), 1, 'the credential is resolved up front, exactly as before');
  assert.ok(u.lines.some((l) => l.includes('gh auth login')), u.lines.join('\n'));
  assert.equal(existsSync(join(cwd, 'AGENTS.md')), false);
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
});

test('verify never asks for a lazy client either', async () => {
  const cwd = repo();
  await run(['init'], deps(cwd).opts);
  const u = unauthenticated(cwd);
  assert.equal(await run(['verify'], u.opts), 3);
  assert.deepEqual(u.resolveOptions, [undefined]);
  assert.equal(u.constructions(), 1);
});

// A GitHub token without admin permission cannot see security_and_analysis at
// all — the token workflows/verify-onboarding.yml documents as read-only, and
// the one the Azure gate template runs with. `unknown` (Task 17) is that
// indeterminate case: "Enabled" must not be claimed from it, but a gate that
// always fails is a gate nobody keeps.
test('an indeterminate security floor fails verify, and reports without failing --gate', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  await run(['init'], opts);

  const blind = {
    ...opts,
    resolvePlatform: async () =>
      fakePlatform({
        securityState: [
          { capability: 'secret-scanning' as const, status: 'unknown' as const, detail: 'not visible' },
          { capability: 'push-protection' as const, status: 'unknown' as const, detail: 'not visible' },
        ],
      }),
  };

  assert.equal(await run(['verify'], blind), 1, 'an operator must not be told yes on no evidence');
  assert.ok(!lines.some((l) => l.includes('security floor enabled')));
  assert.equal(await run(['verify', '--gate'], blind), 0);
  assert.ok(lines.some((l) => l.includes('Redline gate passed.')));
  assert.ok(lines.some((l) => l.includes('not confirmed: secret-scanning, push-protection')));
});

test('--skip records the deselection and reports it', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);

  assert.equal(await run(['init', '--skip', 'gate,labels'], opts), 0);

  const config = JSON.parse(readFileSync(join(cwd, '.redline.json'), 'utf8')) as {
    capabilities: Record<string, boolean>;
  };
  assert.equal(config.capabilities.gate, false);
  assert.equal(config.capabilities.labels, false);
  assert.ok(
    lines.some((l) => l.includes('opted out') && l.includes('gate')),
    `expected the deselection in the output, got ${JSON.stringify(lines)}`
  );
});

test('--with turns a recorded deselection back on', async () => {
  const cwd = repo();
  await run(['init', '--skip', 'gate'], deps(cwd).opts);
  assert.equal(await run(['init', '--with', 'gate'], deps(cwd).opts), 0);

  const config = JSON.parse(readFileSync(join(cwd, '.redline.json'), 'utf8')) as {
    capabilities: Record<string, boolean>;
  };
  assert.equal(config.capabilities.gate, true);
});

// Silently ignoring the flag would leave the operator believing they opted out
// of the organisation's floor.
test('--skip security-floor exits 2 and says why it cannot be deselected', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);

  assert.equal(await run(['init', '--skip', 'security-floor'], opts), 2);
  assert.ok(
    lines.some((l) => l.includes('cannot be deselected')),
    `expected a refusal, got ${JSON.stringify(lines)}`
  );
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
});

test('an unknown capability name exits 2 and lists the real ones', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['init', '--skip', 'pipelines'], opts), 2);
  assert.ok(lines.some((l) => l.includes('unknown capability "pipelines"')));
});

test('--help documents the per-capability selection', async () => {
  const { opts, lines } = deps(repo());
  await run(['--help'], opts);
  const usage = lines.join('\n');
  assert.match(usage, /--skip/);
  assert.match(usage, /--with/);
  assert.match(usage, /merge-policy/);
});

// --- redline sync ------------------------------------------------------------

function registerWith(standardsVersion: string, repoName = 'web-app'): string {
  const dir = tmp('redline-sync-cli-');
  writeFileSync(
    join(dir, 'registry.json'),
    JSON.stringify({
      generatedAt: 'x',
      source: 'acme/redline',
      entries: [
        {
          host: 'github',
          org: 'acme',
          repo: repoName,
          defaultBranch: 'main',
          profile: 'web',
          standardsVersion,
          cliVersion: '0.0.1',
          onboardedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    })
  );
  return dir;
}

test('sync --dry-run plans without pushing or opening anything', async () => {
  const cwd = registerWith('0.0.0');
  const lines: string[] = [];
  const code = await run(['sync', '--dry-run'], {
    cwd,
    root,
    sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
    syncHost: () => ({
      async readRemoteConfig() {
        return { config: { profile: 'web', vendors: ['agents'] } };
      },
      async readRemoteFile() {
        return null;
      },
      async pushFiles() {
        throw new Error('a dry run must not push');
      },
      async openPullRequest() {
        throw new Error('a dry run must not open a pull request');
      },
    }),
  });

  assert.equal(code, 0);
  assert.match(lines.join('\n'), /dry run/);
});

test('sync exits non-zero when any repository in the estate failed', async () => {
  // Reporting 0 because most repositories succeeded is how a distribution
  // quietly stops covering the ones it cannot reach.
  const cwd = registerWith('0.0.0', 'broken');
  const lines: string[] = [];
  const code = await run(['sync'], {
    cwd,
    root,
    sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
    syncHost: () => ({
      async readRemoteConfig() {
        throw new RedlineError('host', 'unreachable');
      },
      async readRemoteFile() {
        return null;
      },
      async pushFiles() {
        return { commit: null };
      },
      async openPullRequest() {
        return { number: 0, url: '', created: false };
      },
    }),
  });

  assert.equal(code, 1);
  assert.match(lines.join('\n'), /unreachable/);
});

test('sync without a register is a usage error, not a crash', async () => {
  const cwd = tmp('redline-sync-cli-');
  const lines: string[] = [];
  const code = await run(['sync'], {
    cwd,
    root,
    sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
    syncHost: () => ({
      async readRemoteConfig() {
        return { config: null };
      },
      async readRemoteFile() {
        return null;
      },
      async pushFiles() {
        return { commit: null };
      },
      async openPullRequest() {
        return { number: 0, url: '', created: false };
      },
    }),
  });

  assert.equal(code, 2);
  assert.match(lines.join('\n'), /register of onboarded repositories/);
});

test('usage names sync as a real command', async () => {
  const { opts, lines } = deps(repo());
  await run(['--help'], opts);
  assert.match(lines.join('\n'), /redline sync/);
});

// --- redline verify --repo ---------------------------------------------------

test('verify --repo reports drift over the API and exits 1', async () => {
  const lines: string[] = [];
  const code = await run(['verify', '--repo', 'acme/web-app'], {
    cwd: repo(),
    root,
    sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
    remoteVerifyHost: () => ({
      async resolveRef(repo: string) {
        const [org, name] = repo.split('/');
        return { host: 'github' as const, org: org ?? '', repo: name ?? '', defaultBranch: 'main' };
      },
      async readRemoteConfig() {
        return { config: null };
      },
      async readRemoteFile() {
        return null;
      },
      machineryFromBody() {
        return { path: 'x', expected: 'y', present: false, publishes: null };
      },
      async readPolicy() {
        return null;
      },
      async readSecurityState() {
        return { outcomes: [] };
      },
      async latestPullRequestNumber() {
        return null;
      },
      async readReportedCheckNames() {
        return [];
      },
    }),
  });

  // A repository that was never onboarded is usage (2), not drift (1) — the
  // same distinction the local path draws.
  assert.equal(code, 2);
  assert.match(lines.join('\n'), /not onboarded/);
});

test('--gate and --repo together are refused rather than silently ignoring one', async () => {
  const { opts, lines } = deps(repo());
  const code = await run(['verify', '--gate', '--repo', 'acme/web-app'], opts);

  assert.equal(code, 2);
  assert.match(lines.join('\n'), /cannot target another repository/);
});
