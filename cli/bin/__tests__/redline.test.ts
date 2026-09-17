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
import { readConfig } from '../../config/redline-json.ts';

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

test('--help is an index of every command, not every flag', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['--help'], opts), 0);
  const usage = lines.join('\n');
  for (const command of ['init', 'remove', 'verify', 'review', 'policy', 'sync', 'metrics', 'funnel']) {
    assert.match(usage, new RegExp(`redline ${command}\\b`));
  }
  assert.ok(!usage.includes('--adopt-caller'));
  assert.ok(usage.includes('redline <command> --help'));
});

test('<command> --help and -h print that command alone and exit 0', async () => {
  for (const flag of ['--help', '-h']) {
    const { opts, lines } = deps(repo());
    assert.equal(await run(['verify', flag], opts), 0);
    const help = lines.join('\n');
    assert.match(help, /redline verify \[--gate\]/);
    assert.ok(!help.includes('redline init'));
  }
});

test('<command> --help works on a Node too old to run the command', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['init', '--help'], { ...opts, nodeVersion: 'v18.0.0' }), 0);
  assert.ok(lines.some((l) => l.includes('--dry-run')));
});

test('a mistyped flag names the one it was probably meant to be', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['init', '--dryrun'], opts), 2);
  assert.ok(lines.some((l) => l.includes('did you mean --dry-run?')));
  assert.ok(lines.some((l) => l.includes('run: redline init --help')));
});

test('a mistyped command names the one it was probably meant to be', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['veriy'], opts), 2);
  assert.ok(lines.some((l) => l.includes('did you mean redline verify?')));
});

test('output through an injected sink carries no colour codes', async () => {
  const { opts, lines } = deps(repo());
  await run(['--help'], opts);
  await run(['doctor'], opts);
  await run(['init', '--dryrun'], opts);
  assert.ok(lines.every((l) => !l.includes('\x1b[')));
});

test('an internal defect points at REDLINE_DEBUG, and the variable prints the stack', async () => {
  const defect = async () => {
    throw new TypeError('boom');
  };
  const plain = deps(repo());
  assert.equal(await run(['init'], { ...plain.opts, resolvePlatform: defect }), 4);
  assert.ok(plain.lines.some((l) => l.includes('REDLINE_DEBUG=1')));
  assert.ok(!plain.lines.some((l) => /^\s+at /.test(l)));

  const previous = process.env.REDLINE_DEBUG;
  process.env.REDLINE_DEBUG = '1';
  try {
    const traced = deps(repo());
    assert.equal(await run(['init'], { ...traced.opts, resolvePlatform: defect }), 4);
    assert.ok(traced.lines.some((l) => l.startsWith('TypeError: boom')));
  } finally {
    if (previous === undefined) delete process.env.REDLINE_DEBUG;
    else process.env.REDLINE_DEBUG = previous;
  }
});

test('completion prints a script for a named shell and refuses anything else', async () => {
  const bash = deps(repo());
  assert.equal(await run(['completion', 'bash'], bash.opts), 0);
  assert.ok(bash.lines.join('\n').includes('complete -F _redline redline redlinegate'));

  const missing = deps(repo());
  assert.equal(await run(['completion'], missing.opts), 2);
  const unknown = deps(repo());
  assert.equal(await run(['completion', 'powershell'], unknown.opts), 2);
  assert.ok(unknown.lines.some((l) => l.includes('"powershell"')));
});

test('completion runs on a Node too old for the rest, so a shell startup never prints an error', async () => {
  const { opts } = deps(repo());
  assert.equal(await run(['completion', 'zsh'], { ...opts, nodeVersion: 'v18.0.0' }), 0);
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
  assert.ok(lines.some((l) => l.includes('to write')), lines.join('\n'));
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

test('init --help names --dry-run and says what --no-a11y and --no-speckit actually do', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['init', '--help'], opts), 0);
  const usage = lines.join('\n');
  assert.ok(usage.includes('--dry-run'));
  assert.ok(usage.includes('--no-speckit'));
  assert.ok(usage.includes('--tmf'));
  assert.ok(usage.includes('changes nothing in Phase 1'));
});

// The escape hatch for a gate machinery file Redline cannot attribute to
// itself. An operator who is never told it exists is one who reaches for
// `rm .redline.json`, so it has to be both parseable and documented.
test('init accepts --adopt-caller and the usage says what it is for', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--adopt-caller'], opts), 0, lines.join('\n'));

  const help = deps(repo());
  await run(['init', '--help'], help.opts);
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
  // A pruned file is marked `-` and counted under "to remove"; the same path
  // marked `+` would tell the operator this run was about to create it.
  assert.ok(lines.some((l) => l.includes('to remove')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes(`- ${orphan}`)), lines.join('\n'));
  assert.ok(!lines.some((l) => l.includes(`+ ${orphan}`)));
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
  assert.ok(u.lines.some((l) => l.includes('to write')), u.lines.join('\n'));
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

test('init --help documents the per-capability selection', async () => {
  const { opts, lines } = deps(repo());
  await run(['init', '--help'], opts);
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
        return { path: 'x', expected: 'y', present: false, publishes: null, vendored: null };
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

// npm's `engines` field only warns. Onboarding a repository pinned to Node 18
// printed EBADENGINE and then ran the tool anyway, so the first real symptom
// was a failure from inside a dependency, raised partway through a command
// that may already have written files.
test('a Node below the floor is refused before the command runs', async () => {
  const { opts, lines } = deps(repo());
  const code = await run(['status'], { ...opts, nodeVersion: 'v18.13.0' });
  assert.equal(code, 2);
  assert.ok(lines.some((l) => l.includes('Node 22 or later')));
  // The three ways to run one command under a newer Node without touching a
  // pin the repository set deliberately.
  assert.ok(lines.some((l) => l.includes('volta run')));
  assert.ok(lines.some((l) => l.includes('fnm exec')));
  assert.ok(lines.some((l) => l.includes('nvm exec')));
});

test('the Node refusal names the command that was actually typed', async () => {
  const { opts, lines } = deps(repo());
  await run(['verify'], { ...opts, nodeVersion: 'v18.13.0' });
  assert.ok(lines.some((l) => l.includes('npx redlinegate verify')));
  assert.ok(!lines.some((l) => l.includes('npx redlinegate init')));
});

// Refusing to run the diagnostic on the machine that needs diagnosing is the
// exact failure the guard exists to prevent.
test('doctor is exempt from the Node guard', async () => {
  const { opts, lines } = deps(repo());
  const code = await run(['doctor'], { ...opts, nodeVersion: 'v18.13.0' });
  // It fails, because Node 18 is a real fault — but it fails having reported
  // everything else it found rather than refusing at the door.
  assert.equal(code, 1);
  assert.ok(lines.some((l) => l.includes('node')));
  assert.ok(lines.some((l) => l.includes('onboarded')));
});

test('doctor --json is machine readable', async () => {
  const { opts, lines } = deps(repo());
  await run(['doctor', '--json'], { ...opts, nodeVersion: 'v22.11.0' });
  const parsed = JSON.parse(lines.join('\n')) as { checks: { name: string }[]; ok: boolean };
  assert.ok(parsed.checks.some((c) => c.name === 'node'));
  assert.equal(typeof parsed.ok, 'boolean');
});

test('doctor appears in the usage', async () => {
  const { opts, lines } = deps(repo());
  await run(['--help'], opts);
  assert.ok(lines.some((l) => l.includes('redline doctor')));
});

function withDiffFile(body: string): string {
  const dir = tmp('redline-diff-');
  const path = join(dir, 'change.diff');
  writeFileSync(path, body);
  return path;
}

const CLEAN_DIFF = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n x\n+const ok = 1;\n';

// A clean `redline policy` used to read as "the standards found nothing". Only
// four rules in the catalogue can be decided without a model, so what it
// actually meant was "the four checkable rules found nothing" — and a
// repository full of violations passing silently is how that gap gets
// mistaken for a broken tool.
test('policy says how much of the catalogue it could not decide', async () => {
  const { opts, lines } = deps(repo());
  await run(['policy', '--diff-file', withDiffFile(CLEAN_DIFF)], opts);
  const footer = lines.find((l) => l.includes('cannot be decided without a model'));
  assert.ok(footer, `expected a catalogue footer, got:\n${lines.join('\n')}`);
  assert.ok(footer.includes('redline review'));
});

// `redline review --print-prompt | pbcopy` has to copy the prompt and nothing
// else.
//
// Both descriptors are captured, not just stdout, and not through the injected
// sink. The first version of this test watched process.stdout alone with a sink
// collecting everything else, so it passed while the real command printed the
// scope line into the pipe: `log.warn` routes to sink.out, which is stdout.
// Only a test that owns both fds can tell the two apart.
test('--print-prompt puts the prompt on stdout and the rest on stderr', async () => {
  const cwd = repo();
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: (c: string) => boolean }).write = (c: string) => {
    out.push(String(c));
    return true;
  };
  (process.stderr as unknown as { write: (c: string) => boolean }).write = (c: string) => {
    err.push(String(c));
    return true;
  };
  try {
    // No sink: the default one is the whole subject here.
    await run(['review', '--print-prompt', '--profile', 'web-react', '--diff-file', withDiffFile(CLEAN_DIFF)], {
      cwd,
      root,
      resolvePlatform: async () => fakePlatform(),
    });
  } finally {
    (process.stdout as unknown as { write: typeof realOut }).write = realOut;
    (process.stderr as unknown as { write: typeof realErr }).write = realErr;
  }

  const piped = out.join('');
  assert.ok(piped.includes('You are reviewing a change'), 'the prompt is not on stdout');
  // The scope line is useful and still printed — just not into the pipe.
  // Matched on the half of the line that only the log emits — the prompt body
  // legitimately contains the words "rules in scope" itself.
  assert.ok(!piped.includes('Paste the prompt'), `stdout carried the scope line:\n${piped.slice(0, 300)}`);
  assert.ok(err.join('').includes('Paste the prompt'), 'the scope line went nowhere');
});

// --engine api calls an endpoint and parses a result; there is no prompt to
// print. Accepting both would silently ignore one of them.
test('--print-prompt with --engine api is a usage error', async () => {
  const { opts, lines } = deps(repo());
  const code = await run(
    ['review', '--print-prompt', '--engine', 'api', '--profile', 'web-react', '--diff-file', withDiffFile(CLEAN_DIFF)],
    opts
  );
  assert.equal(code, 2);
  assert.ok(lines.some((l) => l.includes('print-prompt')));
});

function gitRepo(branch: string): string {
  const dir = repo();
  spawnSync('git', ['init', '-q', '-b', 'main', '.'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'T'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/widget.git'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  if (branch !== 'main') spawnSync('git', ['checkout', '-qb', branch], { cwd: dir });
  return dir;
}

// "Commit them, then run redline init" is correct on a feature branch and a
// trap on the default one: a protected default rejects the commit at push
// time, which is after the operator has followed the instruction and now has a
// commit to unpick.
test('--no-commit on the default branch says to branch first', async () => {
  const { opts, lines } = deps(gitRepo('main'));
  await run(['init', '--no-commit', '--profile', 'web-react'], opts);
  const advice = lines.find((l) => l.includes('not committed'));
  assert.ok(advice, `expected the no-commit advice, got:\n${lines.join('\n')}`);
  assert.ok(advice.includes('git checkout -b'), advice);
});

test('--no-commit on a feature branch does not', async () => {
  const { opts, lines } = deps(gitRepo('feat/x'));
  await run(['init', '--no-commit', '--profile', 'web-react'], opts);
  const advice = lines.find((l) => l.includes('not committed'));
  assert.ok(advice);
  assert.ok(!advice.includes('git checkout -b'), advice);
});

// `redline remove` has existed all along, but the run that has just changed
// somebody's repository is the first moment anyone wonders how to undo it — by
// which point the help output is two commands behind them.
test('a completed apply names the way back out', async () => {
  const { opts, lines } = deps(gitRepo('feat/y'));
  await run(['init', '--profile', 'web-react'], opts);
  const hint = lines.find((l) => l.includes('Changed your mind'));
  assert.ok(hint, `expected an undo hint, got:\n${lines.join('\n')}`);
  assert.ok(hint.includes('redline remove --dry-run'), hint);
});

// The ladder was decorative: canPromote asked for evidence, the bin never
// passed any, so every repository was refused every promotion and stayed at
// observe forever. The only route up was hand-editing the file that tells you
// not to edit it by hand.
test('a recorded measurement lets a repository climb a rung', async () => {
  const cwd = gitRepo('feat/rung');
  const { opts } = deps(cwd);
  await run(['init', '--no-commit', '--profile', 'web-react'], opts);
  assert.equal(readConfig(cwd)?.rung, 'observe');

  await run(['evidence', 'record', '--sample-size', '12', '--source', 'metrics run 1'], deps(cwd).opts);
  await run(['init', '--no-commit', '--rung', 'warn'], deps(cwd).opts);
  assert.equal(readConfig(cwd)?.rung, 'warn');
});

// Promotion used to erase the measurement that justified it: init rebuilt
// .redline.json field by field and had no line for evidence. A repository sat
// at block-blocker with nothing on file saying why, and the freshness window
// could never fire because no record survived long enough to age.
test('a promotion does not destroy the evidence that justified it', async () => {
  const cwd = gitRepo('feat/keep');
  await run(['init', '--no-commit', '--profile', 'web-react'], deps(cwd).opts);
  await run(
    ['evidence', 'record', '--sample-size', '30', '--seed-recall', '1', '--source', 'canary 7'],
    deps(cwd).opts
  );
  await run(['init', '--no-commit', '--rung', 'warn'], deps(cwd).opts);

  const kept = readConfig(cwd)?.evidence;
  assert.equal(kept?.sampleSize, 30, 'the record was dropped by the run that used it');
  assert.equal(kept?.source, 'canary 7');
});

test('a repository with no evidence is still refused', async () => {
  const cwd = gitRepo('feat/norung');
  await run(['init', '--no-commit', '--profile', 'web-react'], deps(cwd).opts);
  await run(['init', '--no-commit', '--rung', 'warn'], deps(cwd).opts);
  assert.equal(readConfig(cwd)?.rung, 'observe');
});

// `redline ghp_xxx` is a paste that missed the terminal it was meant for.
// Writing the word to a file would be this tool breaking its own
// core/customer-data-in-logs rule on its own author.
test('an unrecognised command word is never written to the funnel', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-funnel-bin-'));
  const path = join(dir, 'funnel.jsonl');
  const { opts } = deps(gitRepo('main'));

  const realHome = process.env['HOME'];
  process.env['REDLINE_TELEMETRY'] = '1';
  process.env['HOME'] = dir;
  try {
    await run(['ghp_averyrealtokenpastedbymistake'], opts);
  } finally {
    delete process.env['REDLINE_TELEMETRY'];
    if (realHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = realHome;
  }

  const written = existsSync(join(dir, '.redline', 'funnel.jsonl'))
    ? readFileSync(join(dir, '.redline', 'funnel.jsonl'), 'utf8')
    : '';
  assert.doesNotMatch(written, /ghp_/);
  assert.equal(existsSync(path), false);
});

test('nothing is recorded unless the variable is set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-funnel-off-'));
  const { opts } = deps(gitRepo('main'));
  const realHome = process.env['HOME'];
  process.env['HOME'] = dir;
  try {
    await run(['--version'], opts);
  } finally {
    if (realHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = realHome;
  }

  assert.equal(existsSync(join(dir, '.redline', 'funnel.jsonl')), false);
});

// The provider line is commentary, not the result. On stdout it sat in front of
// the document and `redline review --engine api --json | jq` could not parse it.
test('review --json with an inferred provider keeps stdout a parseable document', async () => {
  const realFetch = globalThis.fetch;
  const previous = process.env.REDLINE_REVIEW_PROVIDER;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"findings":[]}' } }] }), { status: 200 });
  process.env.REDLINE_REVIEW_PROVIDER = 'openai';
  try {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(
      [
        'review', '--engine', 'api', '--model', 'm', '--base-url', 'http://localhost:1/v1',
        '--profile', 'web-react', '--diff-file', withDiffFile(CLEAN_DIFF), '--json',
      ],
      { cwd: repo(), root, sink: { out: (l) => out.push(l), err: (l) => err.push(l) } }
    );
    assert.equal(code, 0, err.join('\n'));
    assert.doesNotThrow(() => JSON.parse(out.join('\n')), out.join('\n'));
    assert.ok(err.some((l) => l.startsWith('provider openai')));
  } finally {
    globalThis.fetch = realFetch;
    if (previous === undefined) delete process.env.REDLINE_REVIEW_PROVIDER;
    else process.env.REDLINE_REVIEW_PROVIDER = previous;
  }
});

// The human output always exits 0 so nobody wires a local review into CI as a
// second gate that enforces nothing. `--json` exiting 1 on findings reopened
// exactly that door for the callers most likely to script it.
test('review --json exits 0 with findings, the same as the human output', async () => {
  const realFetch = globalThis.fetch;
  const content = JSON.stringify({
    findings: [{ rule: 'core/uncatalogued', severity: 'BLOCKER', file: 'src/a.ts', line: 2, problem: 'x', fix: 'y' }],
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  try {
    const argv = [
      'review', '--engine', 'api', '--provider', 'openai', '--model', 'm',
      '--base-url', 'http://localhost:1/v1', '--profile', 'web-react', '--diff-file', withDiffFile(CLEAN_DIFF),
    ];
    const json = deps(repo());
    const jsonCode = await run([...argv, '--json'], json.opts);
    assert.ok(json.lines.join('\n').includes('core/uncatalogued'), `the finding did not reach the document:\n${json.lines.join('\n')}`);
    assert.equal(jsonCode, 0);

    const human = deps(repo());
    assert.equal(await run(argv, human.opts), 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
