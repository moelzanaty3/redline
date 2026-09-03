import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import { BEGIN, END } from '../../../render/markers.ts';
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
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), 'left over from an older CLI\n');

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

test('a repository template that already has its own Launch readiness section is left untouched', async () => {
  const cwd = tmp();
  const own = `# Ours\n\n## Launch readiness\n\n- [ ] our own gate item\n`;
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(join(cwd, '.github/pull_request_template.md'), own);

  const result = await createGitHubInstall(fakeGitHubClient(), gitFor).installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), own);
  assert.ok(!result.files.includes('.github/pull_request_template.md'));
  assert.equal(
    result.outcomes.find((o) => o.detail.includes('pull_request_template.md'))?.status,
    'already'
  );
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
