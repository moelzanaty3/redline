import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
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
