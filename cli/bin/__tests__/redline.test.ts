import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../redline.ts';
import { CLI_VERSION } from '../../core/version.ts';
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

test('usage names --dry-run and says what --no-a11y and --speckit actually do', async () => {
  const { opts, lines } = deps(repo());
  await run(['--help'], opts);
  const usage = lines.join('\n');
  assert.ok(usage.includes('--dry-run'));
  assert.ok(usage.includes('changes nothing in Phase 1'));
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
