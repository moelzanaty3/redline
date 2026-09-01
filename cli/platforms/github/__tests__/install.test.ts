import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { createGitHubInstall, REQUIRED_CHECK, RULESET_NAME } from '../install.ts';
import type { GateOptions, MergePolicy, RepoRef } from '../../types.ts';

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
const tmp = (): string => mkdtempSync(join(tmpdir(), 'redline-install-'));

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

test('openPullRequest commits, pushes and opens a PR against the default branch', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 201, body: { number: 7, html_url: 'https://x/7' } },
  });
  const gitCalls: string[][] = [];
  const recording = (cwd: string) =>
    createGit(cwd, (args) => {
      gitCalls.push(args);
      if (args[0] === 'diff') throw new Error('staged changes exist');
      return '';
    });

  const pr = await createGitHubInstall(client, recording).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: ['redline-sync'],
    files: ['.github/workflows/redline.yml', '.github/pull_request_template.md'],
  });

  assert.deepEqual(pr, { number: 7, url: 'https://x/7' });
  assert.deepEqual(gitCalls[0], ['checkout', '-B', 'redline/onboard']);
  assert.deepEqual(gitCalls[1], [
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
  const gitCalls: string[][] = [];
  const recording = (cwd: string) =>
    createGit(cwd, (args) => {
      gitCalls.push(args);
      if (args[0] === 'diff') throw new Error('staged changes exist');
      return '';
    });

  await createGitHubInstall(client, recording).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: [],
    files: ['.github/CODEOWNERS'],
  });

  assert.ok(!gitCalls.some((c) => c[0] === 'add' && c.includes('-A')), 'must never stage the whole tree');
  assert.deepEqual(
    gitCalls.find((c) => c[0] === 'add'),
    ['add', '--', '.github/CODEOWNERS']
  );
});

test('nothing to commit means no push and no pull request', async () => {
  const client = fakeGitHubClient();
  const clean = (cwd: string) => createGit(cwd, () => '');
  await assert.rejects(
    createGitHubInstall(client, clean).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 't',
      body: 'b',
      labels: [],
      files: ['.github/CODEOWNERS'],
    }),
    /nothing to commit/
  );
  assert.equal(client.calls.length, 0);
});

test('a denied pull request creation throws, instead of returning a fabricated PullRequestRef', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 403, body: { message: 'Resource not accessible by integration' } },
  });
  const recording = (cwd: string) =>
    createGit(cwd, (args) => {
      if (args[0] === 'diff') throw new Error('staged changes exist');
      return '';
    });

  await assert.rejects(
    createGitHubInstall(client, recording).openPullRequest(ref, tmp(), {
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
