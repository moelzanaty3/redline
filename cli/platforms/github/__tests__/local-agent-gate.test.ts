import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitHubInstall } from '../install.ts';
import { createGitHubVerify } from '../verify.ts';
import { LOCAL_HOOKS_DIR, LOCAL_HOOK_PATH, readHooksPath, unsetHooksPath } from '../../local-agent.ts';
import type { GitHubClient } from '../client.ts';
import type { GateOptions, RepoRef } from '../../types.ts';

// A gate that runs on the engineer's machine. Everything asserted here is
// local: no host is contacted, no check name exists, and the two ways it
// silently fails to run — a file that is not executable, and a git that is not
// looking at the directory holding it — are both properties of a clone rather
// than of the file's bytes.

const roots: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-local-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  roots.push(dir);
  return dir;
};
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const REF: RepoRef = { host: 'github', org: 'acme', repo: 'checkout', defaultBranch: 'main' };

const OPTS: GateOptions = {
  pipeline: 'local-agent',
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt'],
};

// Nothing on this path may reach a host: there is no build, no app and no
// status to post, and a request here would make the whole option need a
// credential it has no use for.
const refusingClient: GitHubClient = {
  webBaseUrl: 'https://github.com',
  async rest(_method: string, path: string) {
    throw new Error(`no host call expected, got ${path}`);
  },
  async graphql<T>(): Promise<T> {
    throw new Error('no host call expected');
  },
};

const install = createGitHubInstall(refusingClient, () => {
  throw new Error('git not used');
});
const verify = createGitHubVerify(refusingClient);

test('a local agent gate writes a hook and no CI file at all', async () => {
  const cwd = tmp();
  const result = await install.installGate(REF, cwd, OPTS);

  assert.ok(result.files.includes(LOCAL_HOOK_PATH));
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
  assert.equal(existsSync(join(cwd, '.azuredevops/redline-gate.yml')), false);
});

// git skips a non-executable file in the hooks path without a word, so the gate
// would report installed and never run once.
test('the hook is written executable', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  assert.equal((statSync(join(cwd, LOCAL_HOOK_PATH)).mode & 0o111) !== 0, true);
});

test('core.hooksPath is pointed at the hook, or nothing runs it', async () => {
  const cwd = tmp();
  const result = await install.installGate(REF, cwd, OPTS);

  assert.equal(readHooksPath(cwd), LOCAL_HOOKS_DIR);
  assert.equal(result.outcomes[0]?.status, 'applied');
});

// A repository running husky, or one whose team pointed core.hooksPath
// somewhere deliberately, would have those hooks silently stop firing.
// Installing a gate by disabling somebody else's is the failure this product
// exists to catch, not one it may commit.
test('a hooks path somebody else owns is reported, never overwritten', async () => {
  const cwd = tmp();
  execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd });

  const result = await install.installGate(REF, cwd, OPTS);

  assert.equal(readHooksPath(cwd), '.husky');
  assert.equal(result.outcomes[0]?.status, 'denied');
  assert.match(result.outcomes[0]?.detail ?? '', /\.husky/);
  // The file is still written: it is useful the moment somebody points at it.
  assert.equal(existsSync(join(cwd, LOCAL_HOOK_PATH)), true);
});

test('a re-run on an already-pointed clone is applied, not denied', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const again = await install.installGate(REF, cwd, OPTS);

  assert.equal(again.outcomes[0]?.status, 'applied');
  assert.equal(readHooksPath(cwd), LOCAL_HOOKS_DIR);
});

// `publishes` is null and stays null: this gate reports to no host, so there is
// no check name for a ruleset to require and none to read out of the file.
test('verify finds the hook and claims no check name for it', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);

  const machinery = verify.readGateMachinery(cwd, 'local-agent');
  assert.equal(machinery.path, LOCAL_HOOK_PATH);
  assert.equal(machinery.present, true);
  assert.equal(machinery.publishes, null);
  assert.equal(machinery.externallyNamed, true);
});

test('a hook nothing points at is present but not wired', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  unsetHooksPath(cwd);

  const machinery = verify.readGateMachinery(cwd, 'local-agent');
  assert.equal(machinery.present, true);
  assert.equal(machinery.externallyNamed, false);
});

test('a missing hook is reported against its own path, not a workflow', () => {
  const machinery = verify.readGateMachinery(tmp(), 'local-agent');
  assert.equal(machinery.present, false);
  assert.equal(machinery.path, LOCAL_HOOK_PATH);
});

// `remove` unsets the path it set, and only that one. A clone pointing at
// somebody else's directory is one Redline never owned.
test('removal unsets only the hooks path Redline set', async () => {
  const mine = tmp();
  await install.installGate(REF, mine, OPTS);
  assert.equal(unsetHooksPath(mine), 'unset');
  assert.equal(readHooksPath(mine), null);

  const theirs = tmp();
  execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: theirs });
  assert.equal(unsetHooksPath(theirs), 'not-ours');
  assert.equal(readHooksPath(theirs), '.husky');
});

// The hook is committed to the repository and runs on every engineer's machine,
// so `redlinegate@latest` inside it would let any npm publish change what runs
// locally with no pull request anywhere.
test('the hook pins the CLI it fetches rather than tracking latest', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const body = readFileSync(join(cwd, LOCAL_HOOK_PATH), 'utf8');

  assert.doesNotMatch(body, /REDLINE_CLI_VERSION/);
  assert.match(body, /redlinegate@/);
});

// The placeholder appears twice: the npx invocation, and the `npm install -g`
// line the hook prints when npx is costing a push real time. String-form
// `replace` substitutes the first only, which pinned the thing that runs and
// handed the engineer a literal `redlinegate@REDLINE_CLI_VERSION` to install —
// a command that fails, printed at the exact moment they were being asked to
// trust the tool's advice about its own speed.
test('every pin in the hook is substituted, not just the first', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const body = readFileSync(join(cwd, LOCAL_HOOK_PATH), 'utf8');

  const pins = body.match(/redlinegate@[^\s"']+/g) ?? [];
  assert.ok(pins.length >= 2, `expected the npx pin and the install suggestion, got ${pins.length}`);
  assert.equal(new Set(pins).size, 1, `every pin must name one version, got ${[...new Set(pins)].join(', ')}`);
  assert.match(body, /npm install -g redlinegate@/);
});

// Content already correct but the execute bit lost — a file restored from an
// archive, or a checkout on a filesystem that dropped it. The bytes match, so a
// plain content comparison writes nothing and the gate never runs again.
test('an unexecutable hook with correct content is repaired', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const abs = join(cwd, LOCAL_HOOK_PATH);
  chmodSync(abs, 0o644);
  assert.equal((statSync(abs).mode & 0o111) !== 0, false);

  const result = await install.installGate(REF, cwd, OPTS);

  assert.ok(result.files.includes(LOCAL_HOOK_PATH));
  assert.equal((statSync(abs).mode & 0o111) !== 0, true);
});

// The rung is how a repository earns its way from measured to enforced, and it
// is recorded once in `.redline.json`. A hook that ignored it enforced at every
// rung — so `redline status` said "comments only, the check is always green"
// about a gate that was refusing pushes, and the ladder decided nothing here.
test('the hook gates on the recorded rung rather than always blocking', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const body = readFileSync(join(cwd, LOCAL_HOOK_PATH), 'utf8');

  // Never `policy` with no severity floor: that is the shape that always blocks.
  assert.doesNotMatch(body, /policy --diff-file "\$patch"\s*\n/);
  assert.match(body, /--fail-on "\$fail_on"/);
  // The same four rungs the CI gate recognises, read from the same file.
  for (const rung of ['block-high', 'block-blocker']) {
    assert.ok(body.includes(rung), `${rung} missing from the hook`);
  }
  assert.match(body, /\.redline\.json/);
});

// cli/config reads an unrecognised rung back as `observe`, and the CI gate does
// the same, for one reason: a typo must never make a repository stricter than
// anyone chose. A third implementation that enforced on an unknown value would
// block pushes nobody asked to block.
test('an unrecognised rung is not enforcing, matching the config and the CI gate', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const body = readFileSync(join(cwd, LOCAL_HOOK_PATH), 'utf8');

  const fallback = body.match(/\*\)\s*fail_on=\w+;\s*enforcing=(\w+)\s*;;/);
  assert.equal(fallback?.[1], 'false', `expected the catch-all rung to be non-enforcing: ${fallback?.[0]}`);
});

// husky v4, lefthook and pre-commit install into git's default hooks directory
// and never set core.hooksPath, so the check above cannot see them. Pointing
// core.hooksPath away makes git stop running that hook without a word.
test('a pre-push hook already in the default hooks directory is reported, never orphaned', async () => {
  const cwd = tmp();
  const theirs = join(cwd, '.git/hooks/pre-push');
  writeFileSync(theirs, '#!/bin/sh\nexit 0\n');
  chmodSync(theirs, 0o755);

  const result = await install.installGate(REF, cwd, OPTS);

  assert.equal(readHooksPath(cwd), null);
  assert.equal(result.outcomes[0]?.status, 'denied');
  assert.match(result.outcomes[0]?.detail ?? '', /hooks\/pre-push/);
  assert.equal(existsSync(join(cwd, LOCAL_HOOK_PATH)), true);
});

// Everything above reads the hook's text. These run it: a real repository, the
// ref lines git feeds on stdin, and a stub `redline` on PATH that records the
// patch it was handed and exits with whatever the test chooses.
const ZERO = '0'.repeat(40);
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

const commit = (cwd: string, file: string, text: string): string => {
  writeFileSync(join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
  return git(cwd, 'rev-parse', 'HEAD');
};

interface HookRun {
  status: number | null;
  stderr: string;
  patch: string;
}

async function runHook(cwd: string, stdin: string, policyExit: number, rung: string | null): Promise<HookRun> {
  await install.installGate(REF, cwd, OPTS);
  if (rung !== null) writeFileSync(join(cwd, '.redline.json'), rung);

  const bin = mkdtempSync(join(tmpdir(), 'redline-stub-'));
  roots.push(bin);
  const log = join(bin, 'patch.log');
  writeFileSync(join(bin, 'redline'), `#!/bin/sh\ncat "$3" >> "${log}"\nexit ${policyExit}\n`);
  chmodSync(join(bin, 'redline'), 0o755);

  const run = spawnSync('sh', [join(cwd, LOCAL_HOOK_PATH), 'origin', 'git@example.com:acme/checkout.git'], {
    cwd,
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
  });
  return { status: run.status, stderr: run.stderr, patch: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

const posixOnly = { skip: process.platform === 'win32' };

// Keeping only the last ref's range reviewed `feature` alone on
// `git push origin main feature` and pushed whatever was new on `main` unchecked.
test('every ref in a multi-ref push is checked, not only the last', posixOnly, async () => {
  const cwd = tmp();
  const root = commit(cwd, 'base.txt', 'base\n');
  git(cwd, 'checkout', '-q', '-b', 'feature');
  const feature = commit(cwd, 'feature.txt', 'from feature\n');
  git(cwd, 'checkout', '-q', '-');
  const main = commit(cwd, 'main.txt', 'from main\n');

  const stdin =
    `refs/heads/main ${main} refs/heads/main ${root}\n` +
    `refs/heads/feature ${feature} refs/heads/feature ${root}\n`;
  const run = await runHook(cwd, stdin, 0, '{"rung":"block-blocker"}');

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.patch, /from main/);
  assert.match(run.patch, /from feature/);
});

test('a finding at an enforcing rung refuses the push', posixOnly, async () => {
  const cwd = tmp();
  const root = commit(cwd, 'a.txt', 'a\n');
  const head = commit(cwd, 'b.txt', 'b\n');
  const run = await runHook(cwd, `refs/heads/main ${head} refs/heads/main ${root}\n`, 1, '{"rung":"block-blocker"}');

  assert.equal(run.status, 1);
  assert.match(run.stderr, /a finding at or above BLOCKER/);
});

// Exit 4 is a host error, 2 a usage error, 127 an npx that could not fetch.
// None of them is a finding, and saying so sent engineers hunting for a problem
// in their change that was not there.
test('a gate that fails to run is not reported as a finding', posixOnly, async () => {
  const cwd = tmp();
  const root = commit(cwd, 'a.txt', 'a\n');
  const head = commit(cwd, 'b.txt', 'b\n');
  const stdin = `refs/heads/main ${head} refs/heads/main ${root}\n`;

  const enforced = await runHook(cwd, stdin, 4, '{"rung":"block-blocker"}');
  assert.equal(enforced.status, 1);
  assert.match(enforced.stderr, /could not run \(redline policy exited 4\)/);
  assert.doesNotMatch(enforced.stderr, /a finding at or above/);

  const observed = await runHook(cwd, stdin, 4, '{"rung":"observe"}');
  assert.equal(observed.status, 0);
  assert.doesNotMatch(observed.stderr, /findings above/);
});

// Falling back to not enforcing is right; doing it silently let a block-high
// repository with a broken .redline.json push anything while looking clean.
test('an unreadable .redline.json is said out loud, not silently observed', posixOnly, async () => {
  const cwd = tmp();
  const root = commit(cwd, 'a.txt', 'a\n');
  const head = commit(cwd, 'b.txt', 'b\n');
  const run = await runHook(cwd, `refs/heads/main ${head} refs/heads/main ${root}\n`, 1, '{"rung": block-high');

  assert.equal(run.status, 0);
  assert.match(run.stderr, /could not read the rung from \.redline\.json/);
});

test('a first push with no remote history diffs from the empty tree', posixOnly, async () => {
  const cwd = tmp();
  const head = commit(cwd, 'first.txt', 'the very first line\n');
  const run = await runHook(cwd, `refs/heads/main ${head} refs/heads/main ${ZERO}\n`, 0, '{"rung":"observe"}');

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.patch, /the very first line/);
});
