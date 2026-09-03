import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import { BEGIN, END, findBlock } from '../../../render/markers.ts';
import { createGitHubInstall, REQUIRED_CHECK, RULESET_NAME } from '../install.ts';
import { isPending, type GateOptions, type MergePolicy, type RepoRef } from '../../types.ts';

const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web', defaultBranch: 'main' };
const gateOpts: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt', 'redline-sync'],
};
const advisory: MergePolicy = {
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [REQUIRED_CHECK],
  blocking: false,
};

const noopGit: GitRunner = () => '';
const gitFor = (cwd: string) => createGit(cwd, noopGit);
const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-install-'));
  createdDirs.push(dir);
  return dir;
};

test('the security floor makes three calls and reports each applied', async () => {
  const client = fakeGitHubClient();
  const install = createGitHubInstall(client, gitFor);
  const result = await install.enableSecurityFloor(ref);

  assert.deepEqual(
    client.calls.map((c) => `${c.method} ${c.path}`),
    [
      'PATCH /repos/acme/web',
      'PUT /repos/acme/web/vulnerability-alerts',
      'PUT /repos/acme/web/automated-security-fixes',
    ]
  );
  assert.deepEqual(
    result.outcomes.map((o) => [o.capability, o.status]),
    [
      ['secret-scanning', 'applied'],
      ['push-protection', 'applied'],
      ['dependency-alerts', 'applied'],
    ]
  );
});

test('a 403 on the security floor is denied, not thrown, and the later calls still run', async () => {
  const client = fakeGitHubClient({ 'PATCH /repos/acme/web': { status: 403 } });
  const result = await createGitHubInstall(client, gitFor).enableSecurityFloor(ref);
  assert.equal(result.outcomes[0]?.status, 'denied');
  assert.equal(result.outcomes[2]?.status, 'applied');
  assert.equal(client.calls.length, 3);
});

test('a 422 from an unlicensed org is unsupported, so it never becomes pending admin', async () => {
  const client = fakeGitHubClient({ 'PATCH /repos/acme/web': { status: 422 } });
  const result = await createGitHubInstall(client, gitFor).enableSecurityFloor(ref);
  assert.equal(result.outcomes[0]?.status, 'unsupported');
});

// GitHub answers 404, not 403, on these admin write endpoints when a
// fine-grained token lacks the administration scope on a repository it can
// otherwise read — so a write-404 is a permission denial that must reach
// pendingAdmin, never a "not available on this repository".
test('a 404 on a security-floor write is denied and pending admin, not unsupported', async () => {
  const client = fakeGitHubClient({
    'PATCH /repos/acme/web': { status: 404 },
    'PUT /repos/acme/web/vulnerability-alerts': { status: 404 },
    'PUT /repos/acme/web/automated-security-fixes': { status: 404 },
  });
  const result = await createGitHubInstall(client, gitFor).enableSecurityFloor(ref);
  assert.deepEqual(
    result.outcomes.map((o) => [o.capability, o.status]),
    [
      ['secret-scanning', 'denied'],
      ['push-protection', 'denied'],
      ['dependency-alerts', 'denied'],
    ]
  );
  assert.ok(result.outcomes.every(isPending), 'a write-404 must appear in pendingAdmin');
});

test('a 404 on the ruleset write is denied, not unsupported', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [] },
    'POST /repos/acme/web/rulesets': { status: 404, body: { message: 'Not Found' } },
  });
  const result = await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  const mergePolicy = result.outcomes.find((o) => o.capability === 'merge-policy');
  assert.equal(mergePolicy?.status, 'denied');
  assert.equal(result.policy, null);
});

// A 422 from the ruleset write means GitHub rejected the payload — a Redline
// bug or a repo-settings conflict. Recording it as "unsupported" would leave
// the repository silently policy-less with exit 0.
test('a 422 from the ruleset create throws a host error naming the endpoint', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [] },
    'POST /repos/acme/web/rulesets': { status: 422, body: { message: 'Invalid rules' } },
  });
  await assert.rejects(
    createGitHubInstall(client, gitFor).applyPolicy(ref, advisory),
    (err: unknown) =>
      isRedlineError(err) && err.kind === 'host' && err.message.includes('POST /repos/acme/web/rulesets')
  );
});

test('a 422 from the ruleset update throws a host error naming the endpoint', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'PUT /repos/acme/web/rulesets/42': { status: 422, body: { message: 'Invalid rules' } },
  });
  await assert.rejects(
    createGitHubInstall(client, gitFor).applyPolicy(ref, advisory),
    (err: unknown) =>
      isRedlineError(err) && err.kind === 'host' && err.message.includes('PUT /repos/acme/web/rulesets/42')
  );
});

test('a denied vulnerability-alerts call is not masked by an unsupported automated-security-fixes call', async () => {
  const client = fakeGitHubClient({
    'PUT /repos/acme/web/vulnerability-alerts': { status: 403 },
    'PUT /repos/acme/web/automated-security-fixes': { status: 404 },
  });
  const result = await createGitHubInstall(client, gitFor).enableSecurityFloor(ref);
  const dependencyAlerts = result.outcomes.find((o) => o.capability === 'dependency-alerts');
  assert.equal(dependencyAlerts?.status, 'denied');
});

test('an advisory policy omits the required status check rule', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);

  const create = client.calls.find((c) => c.method === 'POST' && c.path === '/repos/acme/web/rulesets');
  const rules = (create?.body as { rules: { type: string }[] }).rules;
  assert.ok(!rules.some((r) => r.type === 'required_status_checks'));
  assert.ok(rules.some((r) => r.type === 'pull_request'));
});

test('a blocking policy requires exactly the reported check name', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, { ...advisory, blocking: true });

  const create = client.calls.find((c) => c.method === 'POST')!;
  const rules = (create.body as { name: string; rules: { type: string; parameters?: unknown }[] });
  assert.equal(rules.name, RULESET_NAME);
  const checks = rules.rules.find((r) => r.type === 'required_status_checks');
  assert.deepEqual((checks?.parameters as { required_status_checks: { context: string }[] }).required_status_checks, [
    { context: 'redline-gate / gate' },
  ]);
});

test('an existing Redline ruleset is updated in place, never duplicated', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
  });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.ok(client.calls.some((c) => c.method === 'PUT' && c.path === '/repos/acme/web/rulesets/42'));
  assert.ok(!client.calls.some((c) => c.method === 'POST' && c.path === '/repos/acme/web/rulesets'));
});

test('a denied ruleset write is reported, and the custom property is still attempted', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [] },
    'POST /repos/acme/web/rulesets': { status: 403 },
  });
  const result = await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.equal(result.outcomes.find((o) => o.capability === 'merge-policy')?.status, 'denied');
  assert.ok(client.calls.some((c) => c.path === '/repos/acme/web/properties/values'));
});

test('a 403 on the rulesets read does not crash applyPolicy, and the custom property is still attempted', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': {
      status: 403,
      body: { message: 'Resource not accessible by integration' },
    },
  });
  const result = await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.equal(result.outcomes.find((o) => o.capability === 'merge-policy')?.status, 'denied');
  assert.equal(result.policy, null);
  assert.ok(client.calls.some((c) => c.path === '/repos/acme/web/properties/values'));
  assert.ok(!client.calls.some((c) => c.method === 'POST' && c.path === '/repos/acme/web/rulesets'));
  assert.ok(!client.calls.some((c) => c.method === 'PUT' && c.path.startsWith('/repos/acme/web/rulesets/')));
});

test('a 404 on the rulesets read is unsupported, not pending admin, and does not crash', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 404, body: { message: 'Not Found' } },
  });
  const result = await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.equal(result.outcomes.find((o) => o.capability === 'merge-policy')?.status, 'unsupported');
});

test('a malformed 200 rulesets body is a host error, not a silent corruption', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: { not: 'an array' } },
  });
  await assert.rejects(
    createGitHubInstall(client, gitFor).applyPolicy(ref, advisory),
    /unexpected shape/
  );
});

test('installGate writes the caller workflow and the PR template into the working tree', async () => {
  const cwd = tmp();
  const client = fakeGitHubClient();
  const result = await createGitHubInstall(client, gitFor).installGate(ref, cwd, gateOpts);

  assert.ok(result.files.includes('.github/workflows/redline.yml'));
  assert.ok(result.files.includes('.github/pull_request_template.md'));
  const yml = readFileSync(join(cwd, '.github/workflows/redline.yml'), 'utf8');
  assert.match(yml, /^ {2}redline-gate:$/m, 'the caller job id must be redline-gate');
  assert.match(yml, /uses: acme\/\.github\/\.github\/workflows\/redline-gate\.yml@main/);
  assert.match(yml, /adr-diff-threshold: 300/);
  assert.match(yml, /soft-fail-labels: redline-exempt,redline-sync/);
  assert.ok(!yml.includes('<org>'), 'the org placeholder must be substituted');
});

test('installGate renders a non-default soft-fail-labels list into the caller workflow', async () => {
  const cwd = tmp();
  const client = fakeGitHubClient();
  await createGitHubInstall(client, gitFor).installGate(ref, cwd, {
    ...gateOpts,
    softFailLabels: ['needs-security-review'],
  });
  const yml = readFileSync(join(cwd, '.github/workflows/redline.yml'), 'utf8');
  assert.match(yml, /soft-fail-labels: needs-security-review/);
  assert.ok(!yml.includes('redline-exempt,redline-sync'), 'the template default must be replaced, not appended');
});

test('installGate creates the three labels the gate depends on', async () => {
  const client = fakeGitHubClient();
  await createGitHubInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  const created = client.calls
    .filter((c) => c.path === '/repos/acme/web/labels')
    .map((c) => (c.body as { name: string }).name);
  assert.deepEqual(created, ['no-adr', 'redline-exempt', 'redline-sync']);
});

test('a label that already exists is not an error', async () => {
  const client = fakeGitHubClient({ 'POST /repos/acme/web/labels': { status: 422 } });
  const result = await createGitHubInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.equal(result.outcomes.find((o) => o.capability === 'labels')?.status, 'already');
});

test('a 403 on label creation is denied, not already', async () => {
  const client = fakeGitHubClient({ 'POST /repos/acme/web/labels': { status: 403 } });
  const result = await createGitHubInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.equal(result.outcomes.find((o) => o.capability === 'labels')?.status, 'denied');
});

test('a denied label is not masked by an already-exists label on a different call', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/labels': [{ status: 422 }, { status: 403 }, { status: 422 }],
  });
  const result = await createGitHubInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.equal(result.outcomes.find((o) => o.capability === 'labels')?.status, 'denied');
  assert.equal(client.calls.filter((c) => c.path === '/repos/acme/web/labels').length, 3);
});

test('ensureReviewOwnership seeds CODEOWNERS once and never overwrites an existing one', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  const rules = [{ pattern: '/.github/workflows/', owners: ['@acme/platform-engineering'] }];

  const first = await install.ensureReviewOwnership(ref, cwd, rules);
  assert.deepEqual(first.files, ['.github/CODEOWNERS']);
  assert.match(readFileSync(join(cwd, '.github/CODEOWNERS'), 'utf8'), /@acme\/platform-engineering/);

  const second = await install.ensureReviewOwnership(ref, cwd, rules);
  assert.deepEqual(second.files, []);
});

// Models a real index: `add` stages, `commit` clears, `diff --cached --quiet`
// exits 1 (throws) only while something is staged. `preStaged` starts with an
// unrelated user file already in the index.
function fakeRepoGit(branch = 'main', preStaged = false): { gitFor: (cwd: string) => ReturnType<typeof createGit>; calls: string[][] } {
  const calls: string[][] = [];
  let staged = preStaged;
  const run: GitRunner = (args) => {
    calls.push(args);
    if (args[0] === 'add') staged = true;
    if (args[0] === 'commit') staged = false;
    if (args[0] === 'diff' && staged) throw new Error('exit 1: staged changes exist');
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return branch;
    return '';
  };
  return { gitFor: (cwd: string) => createGit(cwd, run), calls };
}

test('openPullRequest commits, pushes and opens a PR against the default branch', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 201, body: { number: 7, html_url: 'https://x/7' } },
  });
  const repo = fakeRepoGit();

  const pr = await createGitHubInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: ['redline-sync'],
    files: ['.github/workflows/redline.yml', '.github/pull_request_template.md'],
  });

  assert.deepEqual(pr, { number: 7, url: 'https://x/7' });
  assert.ok(repo.calls.some((c) => c[0] === 'checkout' && c[1] === '-B' && c[2] === 'redline/onboard'));
  assert.deepEqual(repo.calls.find((c) => c[0] === 'add'), [
    'add',
    '--',
    '.github/workflows/redline.yml',
    '.github/pull_request_template.md',
  ]);
  const create = client.calls.find((c) => c.path === '/repos/acme/web/pulls')!;
  assert.deepEqual(create.body, {
    title: 'chore(redline): onboard',
    body: 'body',
    head: 'redline/onboard',
    base: 'main',
  });
  assert.ok(client.calls.some((c) => c.path === '/repos/acme/web/issues/7/labels'));
});

test('openPullRequest stages only the files Redline wrote, never a dirty unrelated file', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 201, body: { number: 1, html_url: 'https://x/1' } },
  });
  const repo = fakeRepoGit();

  await createGitHubInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: [],
    files: ['.github/CODEOWNERS'],
  });

  assert.ok(!repo.calls.some((c) => c[0] === 'add' && c.includes('-A')), 'must never stage the whole tree');
  assert.deepEqual(
    repo.calls.find((c) => c[0] === 'add'),
    ['add', '--', '.github/CODEOWNERS']
  );
});

test('an unrelated pre-staged file refuses onboarding before any branch is created', async () => {
  const client = fakeGitHubClient();
  const repo = fakeRepoGit('main', true);

  await assert.rejects(
    createGitHubInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 't',
      body: 'b',
      labels: [],
      files: ['.github/CODEOWNERS'],
    }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage',
  );
  assert.ok(!repo.calls.some((c) => c[0] === 'checkout'), 'must refuse before creating a branch');
  assert.ok(!repo.calls.some((c) => c[0] === 'commit'));
  assert.equal(client.calls.length, 0);
});

test('nothing to commit is a null-PR no-op that ends on the original branch', async () => {
  const client = fakeGitHubClient();
  // Staging never dirties the index: the rendered files are already committed.
  const calls: string[][] = [];
  const clean = (cwd: string) =>
    createGit(cwd, (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main';
      return '';
    });

  const pr = await createGitHubInstall(client, clean).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 't',
    body: 'b',
    labels: [],
    files: ['.github/CODEOWNERS'],
  });

  assert.equal(pr, null);
  assert.ok(!calls.some((c) => c[0] === 'commit'));
  assert.ok(!calls.some((c) => c[0] === 'push'));
  assert.deepEqual(calls.at(-1), ['checkout', 'main']);
  assert.equal(client.calls.length, 0);
});

test('a successful run ends on the original branch, not on redline/onboard', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 201, body: { number: 9, html_url: 'https://x/9' } },
  });
  const repo = fakeRepoGit('feature/payments');

  await createGitHubInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: [],
    files: ['.github/CODEOWNERS'],
  });

  const pushIndex = repo.calls.findIndex((c) => c[0] === 'push');
  assert.ok(pushIndex >= 0);
  assert.deepEqual(repo.calls.at(-1), ['checkout', 'feature/payments']);
  assert.ok(repo.calls.length - 1 > pushIndex, 'the restore happens after the push');
});

test('a failed push still returns the operator to the original branch', async () => {
  const client = fakeGitHubClient();
  const calls: string[][] = [];
  let staged = false;
  const failingPush = (cwd: string) =>
    createGit(cwd, (args) => {
      calls.push(args);
      if (args[0] === 'add') staged = true;
      if (args[0] === 'commit') staged = false;
      if (args[0] === 'diff' && staged) throw new Error('exit 1: staged changes exist');
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'feature/payments';
      if (args[0] === 'push') throw Object.assign(new Error('Command failed'), {
        stderr: 'remote: Permission to acme/web.git denied.\n',
      });
      return '';
    });

  await assert.rejects(
    createGitHubInstall(client, failingPush).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 'chore(redline): onboard',
      body: 'body',
      labels: [],
      files: ['.github/CODEOWNERS'],
    }),
    (err: unknown) => isRedlineError(err) && err.kind === 'permission',
  );
  assert.deepEqual(calls.at(-1), ['checkout', 'feature/payments']);
  assert.equal(client.calls.length, 0);
});

test('a denied pull request creation throws, instead of returning a fabricated PullRequestRef', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 403, body: { message: 'Resource not accessible by integration' } },
  });
  const repo = fakeRepoGit();

  await assert.rejects(
    createGitHubInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 'chore(redline): onboard',
      body: 'body',
      labels: [],
      files: ['.github/CODEOWNERS'],
    }),
    /could not open a pull request/
  );
  assert.ok(!client.calls.some((c) => c.path.includes('/issues/')));
});

// `redline init --blocking` passes requiredChecks: [] — a blocking ruleset
// that requires nothing is indistinguishable from an advisory one.
test('a blocking ruleset requires the gate check even when the caller names none', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, {
    requiredApprovals: 1,
    dismissStaleReviews: true,
    requireCodeOwnerReview: true,
    requireThreadResolution: true,
    requiredChecks: [],
    blocking: true,
  });
  const create = client.calls.find((c) => c.method === 'POST' && c.path === '/repos/acme/web/rulesets');
  const rules = (create?.body as { rules: { type: string; parameters?: Record<string, unknown> }[] }).rules;
  const checks = rules.find((r) => r.type === 'required_status_checks');
  assert.deepEqual(checks?.parameters?.['required_status_checks'], [{ context: REQUIRED_CHECK }]);
});

// A re-run must leave a matching file alone. `redline init` folds installGate's
// file list into its already-onboarded decision, so a file reported as written
// when its bytes did not change means a modified tracked file left behind with
// no pull request to carry it.
test('installGate rewrites nothing and reports no file when the workflow already matches', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  await install.installGate(ref, cwd, gateOpts);
  const stamp = statSync(join(cwd, '.github/workflows/redline.yml')).mtimeMs;

  const second = await install.installGate(ref, cwd, gateOpts);

  assert.deepEqual(second.files, []);
  assert.equal(statSync(join(cwd, '.github/workflows/redline.yml')).mtimeMs, stamp);
});

test('installGate reports only the file whose content actually changed', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  await install.installGate(ref, cwd, gateOpts);
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), 'name: Redline\n# left over from an older CLI\n');

  const second = await install.installGate(ref, cwd, gateOpts);
  assert.deepEqual(second.files, ['.github/workflows/redline.yml']);
});

test('installGate in check mode writes nothing and makes no host call', async () => {
  const cwd = tmp();
  const client = fakeGitHubClient();
  const result = await createGitHubInstall(client, gitFor).installGate(ref, cwd, gateOpts, true);

  assert.deepEqual(result.files, ['.github/workflows/redline.yml', '.github/pull_request_template.md']);
  assert.deepEqual(result.outcomes, [], 'a plan must not report work that was never done');
  assert.deepEqual(client.calls, []);
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
});

test('ensureReviewOwnership in check mode reports the file it would seed without writing it', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  const result = await install.ensureReviewOwnership(ref, cwd, [{ pattern: '/AGENTS.md', owners: ['@acme/team'] }], true);

  assert.deepEqual(result.files, ['.github/CODEOWNERS']);
  assert.equal(existsSync(join(cwd, '.github/CODEOWNERS')), false);
});

// --- brownfield pull request template. A repository that already has a
// template must not lose it, and must not be left with a template the gate
// rejects: workflows/redline-gate.yml fails any pull request whose body has
// no `## Launch readiness` section.

const PACKAGED_TEMPLATE = readFileSync(
  fileURLToPath(new URL('../../../../templates/github/pull_request_template.md', import.meta.url)),
  'utf8'
);

const HUMAN_TEMPLATE = `# What changed

Describe it here.

## Our own checklist

- [ ] Ran the smoke suite
`;

const templateAt = (cwd: string): string =>
  readFileSync(join(cwd, '.github/pull_request_template.md'), 'utf8');

const seedTemplate = (cwd: string, body: string): void => {
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/pull_request_template.md'), body);
};

test('installGate writes the packaged PR template whole when the repository has none', async () => {
  const cwd = tmp();
  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);
  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.ok(result.files.includes('.github/pull_request_template.md'));
});

test('installGate does not destroy a pull request template the repository already had', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/pull_request_template.md'), HUMAN_TEMPLATE);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);
  const merged = templateAt(cwd);

  assert.ok(merged.startsWith(HUMAN_TEMPLATE.trimEnd()), 'the human template must survive verbatim');
  assert.match(merged, /## Our own checklist/);
  assert.ok(merged.includes(BEGIN) && merged.includes(END), 'the gated content must be marked');
  assert.match(merged, /## Launch readiness/);
  assert.ok(!merged.includes('## Change type'), 'the gate does not read Change type — do not append it');
  assert.equal(
    (merged.match(/^# /gm) ?? []).length,
    1,
    'appending the whole packaged template would duplicate the top-level heading'
  );
  const templateOutcome = result.outcomes.find((o) => o.detail.includes('pull_request_template.md'));
  assert.equal(templateOutcome?.status, 'applied');
  assert.match(templateOutcome?.detail ?? '', /append/i);
});

test('installGate replaces only the Redline block in a template that already has one', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/pull_request_template.md'), HUMAN_TEMPLATE);
  await install.installGate(ref, cwd, gateOpts);

  const merged = templateAt(cwd);
  const stale = merged.replace(/## Launch readiness/, '## Launch readiness\n\n- [ ] stale item');
  writeFileSync(join(cwd, '.github/pull_request_template.md'), stale);

  const result = await install.installGate(ref, cwd, gateOpts);
  const after = templateAt(cwd);

  assert.equal(after, merged, 'the block is regenerated, everything outside it is untouched');
  assert.ok(!after.includes('stale item'));
  assert.ok(after.startsWith(HUMAN_TEMPLATE.trimEnd()));
  assert.ok(result.files.includes('.github/pull_request_template.md'));
});

test('a second run over an already-merged pull request template changes nothing', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/pull_request_template.md'), HUMAN_TEMPLATE);
  await install.installGate(ref, cwd, gateOpts);
  const merged = templateAt(cwd);
  assert.match(merged, /## Our own checklist/, 'the merge must have preserved the human template');
  const stamp = statSync(join(cwd, '.github/pull_request_template.md')).mtimeMs;

  const second = await install.installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), merged);
  assert.equal(statSync(join(cwd, '.github/pull_request_template.md')).mtimeMs, stamp);
  assert.ok(!second.files.includes('.github/pull_request_template.md'));
});

// The greenfield template Redline itself wrote carries no markers. Appending a
// block to it would give the pull request body two `## Launch readiness`
// sections, and the gate's awk reads both.
test('a second run never appends a second Launch readiness section to the template Redline wrote', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  await install.installGate(ref, cwd, gateOpts);

  const second = await install.installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.equal((templateAt(cwd).match(/^## Launch readiness$/gm) ?? []).length, 1);
  assert.ok(!second.files.includes('.github/pull_request_template.md'));
});

// The `adr` job reads the pull request body for a `docs/adr/` link, so a
// template carrying its own Launch readiness section but no ADR affordance
// would fail a large diff with no line to fill in. Append what is missing, not
// all-or-nothing.
test('a template with its own Launch readiness but no ADR affordance gets only the ADR section appended', async () => {
  const cwd = tmp();
  const own = `# Ours\n\n## Launch readiness\n\n- [ ] our own gate item\n`;
  seedTemplate(cwd, own);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);
  const merged = templateAt(cwd);

  assert.ok(merged.startsWith(own), 'the human section must survive byte for byte');
  assert.equal((merged.match(/^## Launch readiness$/gm) ?? []).length, 1, 'no second gated checklist');
  assert.match(merged, /## Architecture decision/);
  assert.match(merged, /docs\/adr\//);
  assert.ok(result.files.includes('.github/pull_request_template.md'));
  const detail = result.outcomes.find((o) => o.detail.includes('pull_request_template.md'))?.detail ?? '';
  assert.match(detail, /Architecture decision/);
  assert.ok(!detail.includes('Launch readiness'), 'the detail must name only what was appended');
});

test('a template that already satisfies both gate jobs is left untouched', async () => {
  const cwd = tmp();
  const own = `# Ours\n\n## Launch readiness\n\n- [ ] our own gate item\n\nADR: docs/adr/0001-x.md\n`;
  seedTemplate(cwd, own);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), own);
  assert.ok(!result.files.includes('.github/pull_request_template.md'));
  assert.equal(
    result.outcomes.find((o) => o.detail.includes('pull_request_template.md'))?.status,
    'already'
  );
});

// workflows/redline-gate.yml matches the heading by prefix, so this template
// already satisfies the checklist job. Appending would give the job's awk two
// sections to enforce and the author twice the boxes, with no explanation.
test('a heading the gate matches by prefix is not given a second Launch readiness section', async () => {
  const cwd = tmp();
  seedTemplate(cwd, `# Ours\n\n## Launch readiness checklist\n\n- [ ] ours\n\nADR: docs/adr/0001-x.md\n`);

  await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.equal((templateAt(cwd).match(/^## Launch readiness/gm) ?? []).length, 1);
});

test('a dry run writes no pull request template, whatever the repository already has', async () => {
  const greenfield = tmp();
  const brownfield = tmp();
  const merged = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  for (const dir of [brownfield, merged]) {
    mkdirSync(join(dir, '.github'), { recursive: true });
    writeFileSync(join(dir, '.github/pull_request_template.md'), HUMAN_TEMPLATE);
  }
  await install.installGate(ref, merged, gateOpts);
  const alreadyMerged = templateAt(merged);

  const plans = await Promise.all(
    [greenfield, brownfield, merged].map((dir) => install.installGate(ref, dir, gateOpts, true))
  );

  assert.ok(!existsSync(join(greenfield, '.github/pull_request_template.md')));
  assert.equal(templateAt(brownfield), HUMAN_TEMPLATE);
  assert.equal(templateAt(merged), alreadyMerged);
  assert.ok(plans[0]?.files.includes('.github/pull_request_template.md'));
  assert.ok(plans[1]?.files.includes('.github/pull_request_template.md'));
  assert.ok(!plans[2]?.files.includes('.github/pull_request_template.md'));
});

// GitHub resolves the pull request template from the repository root, `docs/`
// and `.github/`, and the filename is not case sensitive. Writing the default
// path beside a human's template at any other candidate leaves two templates
// with ambiguous precedence: if the host serves theirs, the Redline block is
// invisible and the gate blocks every one of their pull requests.

test('a template at a non-default candidate path is the file merged into, and no second one appears', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'docs/pull_request_template.md'), HUMAN_TEMPLATE);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  const merged = readFileSync(join(cwd, 'docs/pull_request_template.md'), 'utf8');
  assert.ok(merged.startsWith(HUMAN_TEMPLATE.trimEnd()));
  assert.match(merged, /## Launch readiness/);
  assert.ok(
    !existsSync(join(cwd, '.github/pull_request_template.md')),
    'no second template may be created beside the one the host resolves'
  );
  assert.deepEqual(result.files, ['.github/workflows/redline.yml', 'docs/pull_request_template.md']);
});

test('a template whose filename differs only in case is the one merged into', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/PULL_REQUEST_TEMPLATE.md'), HUMAN_TEMPLATE);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  const merged = readFileSync(join(cwd, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8');
  assert.ok(merged.startsWith(HUMAN_TEMPLATE.trimEnd()), 'the human template must survive verbatim');
  assert.match(merged, /## Launch readiness/);
  assert.ok(result.files.includes('.github/PULL_REQUEST_TEMPLATE.md'));
  assert.equal(
    readdirSync(join(cwd, '.github')).filter((n) => n.toLowerCase() === 'pull_request_template.md').length,
    1
  );
});

// A `PULL_REQUEST_TEMPLATE/` directory holds alternate templates reachable only
// through a `?template=` link; it is not the default body. Redline must not
// rewrite the files inside it, and the repository still needs a default
// template or every plain pull request opens with an empty body and fails the gate.
test('a PULL_REQUEST_TEMPLATE directory is never mistaken for the template and is left alone', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github/PULL_REQUEST_TEMPLATE'), { recursive: true });
  writeFileSync(join(cwd, '.github/PULL_REQUEST_TEMPLATE/bugfix.md'), HUMAN_TEMPLATE);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.equal(readFileSync(join(cwd, '.github/PULL_REQUEST_TEMPLATE/bugfix.md'), 'utf8'), HUMAN_TEMPLATE);
  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.ok(result.files.includes('.github/pull_request_template.md'));
});

test('the greenfield template is written with the gated sections inside the markers', () => {
  const block = PACKAGED_TEMPLATE.slice(
    PACKAGED_TEMPLATE.indexOf(BEGIN),
    PACKAGED_TEMPLATE.indexOf(END) + END.length
  );
  // The one write path that does not go through wrapBlock: the packaged file is
  // written whole. It has to parse to exactly one well-formed block on its own,
  // or the run that writes it leaves a file no later run can maintain.
  assert.deepEqual(findBlock(PACKAGED_TEMPLATE, 'packaged'), {
    start: PACKAGED_TEMPLATE.indexOf(BEGIN),
    stop: PACKAGED_TEMPLATE.indexOf(END),
  });
  assert.ok(PACKAGED_TEMPLATE.includes(BEGIN) && PACKAGED_TEMPLATE.includes(END));
  assert.match(block, /## Launch readiness/);
  assert.match(block, /## Architecture decision/);
  for (const outside of ['# Summary', '## Change type', '## Automated review']) {
    assert.ok(!block.includes(outside), `${outside} is the team's to edit and belongs outside the block`);
  }
});

// Without markers on the greenfield file, Redline could never update the gated
// sections in a repository it created the template in — and `redline verify`
// does not observe the template at all, so the drift would be silent.
test('Redline updates its own block in a template it wrote, and keeps what the team added around it', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  await install.installGate(ref, cwd, gateOpts);
  const edited = templateAt(cwd)
    .replace(/- \[ \] No unrelated changes in the diff/, '- [ ] hand-edited inside the block')
    .replace(/## Automated review/, '## Our own section\n\n- [ ] our item\n\n## Automated review');
  writeFileSync(join(cwd, '.github/pull_request_template.md'), edited);

  const result = await install.installGate(ref, cwd, gateOpts);
  const after = templateAt(cwd);

  assert.match(after, /- \[ \] No unrelated changes in the diff/, 'the block is Redline-owned and restored');
  assert.ok(!after.includes('hand-edited inside the block'));
  assert.match(after, /## Our own section/, 'content outside the block is the team\'s and survives');
  assert.match(after, /- \[ \] our item/);
  assert.ok(result.files.includes('.github/pull_request_template.md'));
});

// --- malformed markers in a human-owned template. Redline cannot tell which
// span it owns, so it must not guess: no silent repair, no second block, no
// deletion. wrapBlock also writes CLAUDE.md, AGENTS.md and
// .github/copilot-instructions.md in every onboarded repository.

test('a template whose markers are in the wrong order is refused, naming the file, with nothing written', async () => {
  const cwd = tmp();
  const mangled = `# Ours\n\n${END}\n\nmiddle\n\n${BEGIN}\n\ntail\n`;
  seedTemplate(cwd, mangled);

  await assert.rejects(
    () => createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts),
    (error: unknown) => {
      assert.ok(isRedlineError(error));
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /pull_request_template\.md/);
      return true;
    }
  );
  assert.equal(templateAt(cwd), mangled, 'a refused file must be left exactly as it was');
});

test('a template with a BEGIN marker and no END is refused rather than losing the content below it', async () => {
  const cwd = tmp();
  const mangled = `# Ours\n\n${BEGIN}\n\nUSER STUFF\n`;
  seedTemplate(cwd, mangled);

  await assert.rejects(() => createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts), isRedlineError);
  assert.equal(templateAt(cwd), mangled);
});

// --- candidate resolution edges.

test('a candidate directory whose name differs in case is still the one searched', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, 'DOCS'), { recursive: true });
  writeFileSync(join(cwd, 'DOCS/pull_request_template.md'), HUMAN_TEMPLATE);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.match(readFileSync(join(cwd, 'DOCS/pull_request_template.md'), 'utf8'), /## Launch readiness/);
  assert.ok(!existsSync(join(cwd, '.github/pull_request_template.md')), 'no second template beside the served one');
  assert.ok(result.files.includes('DOCS/pull_request_template.md'));
});

// Foreign filesystem contents are a real system boundary: readdirSync throws
// ENOTDIR on a path that exists as a file, and it would throw after the gate
// workflow had already been written.
test('a plain file sitting where a candidate directory would be does not crash the run', async () => {
  const cwd = tmp();
  writeFileSync(join(cwd, 'docs'), 'not a directory\n');

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.ok(result.files.includes('.github/pull_request_template.md'));
});

// The host picks one and does not document which, so the least Redline can do
// is be deterministic instead of following whatever order the filesystem lists.
test('two case variants of the template in one directory resolve to the canonical name, not filesystem order', async (t) => {
  const cwd = tmp();
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'docs/PULL_REQUEST_TEMPLATE.md'), '# Upper\n');
  writeFileSync(join(cwd, 'docs/pull_request_template.md'), HUMAN_TEMPLATE);
  if (readdirSync(join(cwd, 'docs')).length < 2) {
    t.skip('this filesystem folds filename case, so the two variants cannot coexist here');
    return;
  }

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.deepEqual(
    result.files.filter((f) => f.toLowerCase().includes('pull_request_template')),
    ['docs/pull_request_template.md']
  );
  assert.equal(readFileSync(join(cwd, 'docs/PULL_REQUEST_TEMPLATE.md'), 'utf8'), '# Upper\n');
});

// GitHub documents only `pull_request_template.md`; `.txt` and extension-less
// forms are not in the documentation, so adopting one as the merge target would
// risk merging into a file the host never serves and creating no `.md` at all.
test('a .txt template is not adopted as the merge target on GitHub, and the served .md is created', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/pull_request_template.txt'), HUMAN_TEMPLATE);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.equal(readFileSync(join(cwd, '.github/pull_request_template.txt'), 'utf8'), HUMAN_TEMPLATE);
  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.ok(result.files.includes('.github/pull_request_template.md'));
});

// N2: `mergeTemplate` decides the marked branch first, and refreshing it with
// every gated section would put Redline's own `## Launch readiness` inside the
// block while the repository's stayed outside — and the gate's awk enforces
// both, so run 2 would break a repository run 1 merged correctly. Every other
// second-run test in this file starts from a greenfield or fully-marked
// template, which is why this went unseen.
test('a brownfield template with its own Launch readiness never gains a second one on a later run', async () => {
  const cwd = tmp();
  const own = `# Ours\n\n## Launch readiness\n\n- [ ] our own gate item\n`;
  seedTemplate(cwd, own);
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);

  await install.installGate(ref, cwd, gateOpts);
  const afterFirst = templateAt(cwd);
  const second = await install.installGate(ref, cwd, gateOpts);
  const third = await install.installGate(ref, cwd, gateOpts);

  assert.equal(
    (templateAt(cwd).match(/^## Launch readiness/gm) ?? []).length,
    1,
    'the repository must not be made to tick two checklists to pass its own gate'
  );
  assert.equal(templateAt(cwd), afterFirst, 'the merge must be stable from the first run');
  assert.ok(!second.files.includes('.github/pull_request_template.md'), 'a stable run must not open a second onboarding PR');
  assert.ok(!third.files.includes('.github/pull_request_template.md'));
  assert.ok(templateAt(cwd).startsWith(own));
});

test('a marked template whose own content later satisfies both gate jobs is left alone', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  seedTemplate(cwd, `# Ours\n\n## Launch readiness\n\n- [ ] ours\n`);
  await install.installGate(ref, cwd, gateOpts);

  // The team adds their own ADR line outside the block, which is what the adr
  // job actually greps for. Redline's block has nothing left to contribute.
  const withAdr = templateAt(cwd).replace('# Ours', '# Ours\n\nADR: docs/adr/0007-x.md');
  seedTemplate(cwd, withAdr);

  const result = await install.installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), withAdr);
  assert.ok(!result.files.includes('.github/pull_request_template.md'));
});

test('a template carrying two Redline blocks is refused rather than one of them silently winning', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  await install.installGate(ref, cwd, gateOpts);
  const doubled = templateAt(cwd).repeat(2);
  seedTemplate(cwd, doubled);

  await assert.rejects(
    () => install.installGate(ref, cwd, gateOpts),
    (error: unknown) => {
      assert.ok(isRedlineError(error));
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /pull_request_template\.md/);
      return true;
    }
  );
  assert.equal(templateAt(cwd), doubled);
});

test('a template hidden below an unclosed code fence is refused, not appended to on every run', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  await install.installGate(ref, cwd, gateOpts);
  const fenced = `# Ours\n\n\`\`\`md\nnever closed\n${templateAt(cwd)}`;
  seedTemplate(cwd, fenced);

  await assert.rejects(() => install.installGate(ref, cwd, gateOpts), isRedlineError);
  assert.equal(templateAt(cwd), fenced);
});

// The counterexample that reopened this: a five-line brownfield template ending
// in an open fence for the author to paste logs into — valid CommonMark, and a
// common idiom. Run 1 used to write Redline's block INSIDE that code block, and
// every run after it refused in the plan pass, so `redline init` and even
// `--dry-run` stopped working on a repository that was fine before Redline
// touched it.
test('a template ending in an open code fence is refused, never written into the fence', async () => {
  const cwd = tmp();
  const human = '# PR\n\nPaste your logs:\n\n```\n';
  seedTemplate(cwd, human);
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);

  for (let run = 1; run <= 3; run += 1) {
    await assert.rejects(
      () => install.installGate(ref, cwd, gateOpts),
      (error: unknown) => {
        assert.ok(isRedlineError(error));
        assert.equal(error.exitCode, 1);
        assert.match(error.message, /pull_request_template\.md/);
        return true;
      },
      `run ${run} must refuse`
    );
    assert.equal(templateAt(cwd), human, `run ${run} must not change a byte`);
  }
});

test('a dry run refuses the same template rather than reporting a write it could not make', async () => {
  const cwd = tmp();
  const human = '# PR\n\nPaste your logs:\n\n```\n';
  seedTemplate(cwd, human);

  await assert.rejects(() => createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts, true), isRedlineError);
  assert.equal(templateAt(cwd), human);
});

test('a template with a balanced fence still merges and is byte-stable across three runs', async () => {
  const cwd = tmp();
  const human = '# PR\n\nPaste your logs:\n\n```\n\n```\n';
  seedTemplate(cwd, human);
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);

  const first = await install.installGate(ref, cwd, gateOpts);
  const merged = templateAt(cwd);
  const second = await install.installGate(ref, cwd, gateOpts);
  await install.installGate(ref, cwd, gateOpts);

  assert.ok(merged.startsWith(human), 'the human template must survive verbatim');
  assert.match(merged, /## Launch readiness/);
  assert.equal(merged.split(BEGIN).length - 1, 1);
  assert.equal(templateAt(cwd), merged, 'byte-stable from the first run');
  assert.ok(first.files.includes('.github/pull_request_template.md'));
  assert.ok(!second.files.includes('.github/pull_request_template.md'));
});

// --- the caller workflow is refused, never merged and never clobbered --------
//
// The shared markdown artifacts take a REDLINE marker block appended to
// whatever a repository already had there. A workflow cannot: appending gives
// the YAML a second `name:` and `on:` key and the file stops running at all.
// So the only two honest answers at this path are "replace Redline's own file"
// and "stop".

const NOT_OURS = 'name: Nightly deploy\non:\n  schedule:\n    - cron: "0 3 * * *"\njobs:\n  go:\n    runs-on: ubuntu-latest\n';

test("a workflow at the caller path that Redline did not write is refused, not overwritten", async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true });
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), NOT_OURS);

  await assert.rejects(
    createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts),
    /\.github\/workflows\/redline\.yml/
  );
  assert.equal(readFileSync(join(cwd, '.github/workflows/redline.yml'), 'utf8'), NOT_OURS);
});

// The plan phase is what `redline init --dry-run` prints and what a re-run
// decides "settled" from, so it has to refuse in the same place — a plan that
// promises a write the real run will refuse is the lie this whole branch has
// been closing.
test('the plan phase refuses the same foreign workflow rather than promising a write', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true });
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), NOT_OURS);

  await assert.rejects(
    createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts, true),
    /\.github\/workflows\/redline\.yml/
  );
});

// The 2.1 rollout wrote its own caller at this path, and migrating it is the
// whole point of `detectMigration`. Attribution is read from the bytes, so
// that file is Redline's and is replaced.
test("the 2.1 caller workflow is Redline's own and is replaced by the v3 one", async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true });
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), 'name: Redline 2.1\non:\n  pull_request:\n');

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.ok(result.files.includes('.github/workflows/redline.yml'));
  assert.match(
    readFileSync(join(cwd, '.github/workflows/redline.yml'), 'utf8'),
    /uses: acme\/\.github\/\.github\/workflows\/redline-gate\.yml@main/
  );
});
