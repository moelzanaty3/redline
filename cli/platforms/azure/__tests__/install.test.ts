import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import { createAzureInstall } from '../install.ts';
import { AZURE_STATUS_GENRE, AZURE_STATUS_NAME, POLICY_TYPE_FALLBACK } from '../policy-types.ts';
import type { AzureClient } from '../client.ts';
import type { HttpResponse } from '../../http.ts';
import type { GateOptions, MergePolicy, RepoRef } from '../../types.ts';

const ref: RepoRef = {
  host: 'azure',
  org: 'acme',
  project: 'Payments',
  repo: 'web',
  repoId: 'repo-guid',
  defaultBranch: 'main',
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function fakeAzure(routes: Record<string, { status: number; body?: unknown }> = {}): AzureClient & {
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    async request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      calls.push({ method, path, body });
      const route = routes[`${method} ${path}`] ?? { status: 200, body: {} };
      return { status: route.status, body: (route.body ?? null) as T | null };
    },
  };
}

const typesRoute = {
  'GET /Payments/_apis/policy/types': {
    status: 200,
    body: {
      value: [
        { id: 'min-rev-id', displayName: 'Minimum number of reviewers' },
        { id: 'comments-id', displayName: 'Comment requirements' },
        { id: 'status-id', displayName: 'Status' },
        { id: 'required-rev-id', displayName: 'Required reviewers' },
      ],
    },
  },
};

const advisory: MergePolicy = {
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [`${AZURE_STATUS_GENRE}/${AZURE_STATUS_NAME}`],
  blocking: false,
};

const gateOpts: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt'],
};

const noopGit: GitRunner = () => '';
const gitFor = (cwd: string) => createGit(cwd, noopGit);
const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-azure-'));
  createdDirs.push(dir);
  return dir;
};

test('policy type ids come from the live lookup when it succeeds', async () => {
  const client = fakeAzure({ ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const created = client.calls.filter((c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations');
  const typeIds = created.map((c) => (c.body as { type: { id: string } }).type.id);
  assert.ok(typeIds.includes('status-id'));
  assert.ok(typeIds.includes('min-rev-id'));
});

test('a failed type lookup falls back to the well-known guids', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 403 },
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const created = client.calls.filter((c) => c.method === 'POST');
  const typeIds = created.map((c) => (c.body as { type: { id: string } }).type.id);
  assert.ok(typeIds.includes(POLICY_TYPE_FALLBACK['Status']!));
});

test('advisory sets isBlocking false on the status policy; blocking sets it true', async () => {
  const routes = { ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } };

  const a = fakeAzure(routes);
  await createAzureInstall(a, gitFor).applyPolicy(ref, advisory);
  const advisoryStatus = a.calls.find(
    (c) => c.method === 'POST' && (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  assert.equal((advisoryStatus?.body as { isBlocking: boolean }).isBlocking, false);

  const b = fakeAzure(routes);
  await createAzureInstall(b, gitFor).applyPolicy(ref, { ...advisory, blocking: true });
  const blockingStatus = b.calls.find(
    (c) => c.method === 'POST' && (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  assert.equal((blockingStatus?.body as { isBlocking: boolean }).isBlocking, true);
});

test('the status policy names exactly the genre and name the pipeline publishes', async () => {
  const client = fakeAzure({ ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const statusPolicy = client.calls.find(
    (c) => c.method === 'POST' && (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  const settings = (statusPolicy?.body as { settings: Record<string, unknown> }).settings;
  assert.equal(settings['statusGenre'], 'redline');
  assert.equal(settings['statusName'], 'gate');
});

test('an existing redline policy is updated in place rather than duplicated', async () => {
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 99,
            type: { id: 'status-id' },
            settings: { statusGenre: 'redline', statusName: 'gate', scope: [{ repositoryId: 'repo-guid' }] },
          },
        ],
      },
    },
  });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.ok(client.calls.some((c) => c.method === 'PUT' && c.path === '/Payments/_apis/policy/configurations/99'));
});

test('the repository property capability is unsupported on azure, never denied', async () => {
  const client = fakeAzure({ ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } });
  const result = await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const property = result.outcomes.find((o) => o.capability === 'repo-property');
  assert.equal(property?.status, 'unsupported');
});

test('advanced security not licensed reads as unsupported, so it never becomes pending admin', async () => {
  const client = fakeAzure({
    'PATCH /Payments/_apis/management/repositories/repo-guid/enablement': { status: 404 },
  });
  const result = await createAzureInstall(client, gitFor).enableSecurityFloor(ref);
  assert.ok(result.outcomes.every((o) => o.status === 'unsupported'));
});

test('advanced security denied by permissions is denied, so it does become pending admin', async () => {
  const client = fakeAzure({
    'PATCH /Payments/_apis/management/repositories/repo-guid/enablement': { status: 403 },
  });
  const result = await createAzureInstall(client, gitFor).enableSecurityFloor(ref);
  assert.ok(result.outcomes.every((o) => o.status === 'denied'));
});

test('installGate writes the azure pipeline and PR template, and labels are unsupported', async () => {
  const cwd = tmp();
  const result = await createAzureInstall(fakeAzure(), gitFor).installGate(ref, cwd, gateOpts);
  assert.deepEqual(result.files, ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md']);
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /ADR_DIFF_THRESHOLD: 300/);
  assert.match(yml, /genre[^\n]*redline/);
  assert.equal(result.outcomes.find((o) => o.capability === 'labels')?.status, 'unsupported');

  // Regression guard: `redline` alone is a different, unrelated package on
  // the public registry. The gate must pin npx to redline-cli explicitly,
  // never resolve `redline@<version>` directly.
  assert.doesNotMatch(yml, /npx --yes redline@/);
  assert.match(yml, /npx --yes --package=redline-cli@latest redline verify --gate/);

  // Regression guard: the access token must never be interpolated into a
  // curl argv (visible to `ps`/`/proc/<pid>/cmdline`) — it is passed via a
  // -K stdin config instead.
  assert.doesNotMatch(yml, /-H "Authorization: Bearer \$SYSTEM_ACCESSTOKEN"/);
  assert.match(yml, /curl -K -/);

  // Regression guard: $SYSTEM_TEAMPROJECT is encoded before it is
  // interpolated into the JSON body / URL, not used raw.
  assert.match(yml, /@uri/);
});

test('installGate threads a non-default dependency severity into the rendered pipeline', async () => {
  const cwd = tmp();
  const opts: GateOptions = { ...gateOpts, failOnDependencySeverity: 'critical' };
  await createAzureInstall(fakeAzure(), gitFor).installGate(ref, cwd, opts);
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /FAIL_ON_DEPENDENCY_SEVERITY: critical/);
});

test('a non-2xx truthy error body on policy/configurations degrades to denied, never throws', async () => {
  // Azure error bodies are truthy objects, not arrays — `?? []` would never
  // fire on this shape. This drives that exact path.
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': {
      status: 403,
      body: { message: 'TF401027: You need Contribute permission to perform this action.' },
    },
  });
  const result = await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const mergePolicy = result.outcomes.find((o) => o.capability === 'merge-policy');
  assert.equal(mergePolicy?.status, 'denied');
  assert.equal(result.policy, null);
  assert.ok(
    !client.calls.some((c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations')
  );
});

test('a malformed 200 body from the policy types lookup falls back rather than throwing', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 200, body: { value: 'not-an-array' } },
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const created = client.calls.filter((c) => c.method === 'POST');
  const typeIds = created.map((c) => (c.body as { type: { id: string } }).type.id);
  assert.ok(typeIds.includes(POLICY_TYPE_FALLBACK['Status']!));
});

test('a malformed 200 body from policy/configurations reports a host error rather than silently succeeding', async () => {
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [{ id: 'not-a-number' }] } },
  });
  await assert.rejects(
    createAzureInstall(client, gitFor).applyPolicy(ref, advisory),
    /unexpected shape/
  );
});

test('advanced security denial carries a realistic azure error body without throwing', async () => {
  const client = fakeAzure({
    'PATCH /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 403,
      body: {
        $id: '1',
        innerException: null,
        message: 'TF400813: The user is not authorized to access this resource.',
        typeName: 'Microsoft.TeamFoundation.Framework.Server.UnauthorizedRequestException',
      },
    },
  });
  const result = await createAzureInstall(client, gitFor).enableSecurityFloor(ref);
  assert.ok(result.outcomes.every((o) => o.status === 'denied'));
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

test('openPullRequest reports a host error, not a false success, on a truthy non-2xx error body', async () => {
  const client = fakeAzure({
    'POST /Payments/_apis/git/repositories/repo-guid/pullrequests': {
      status: 409,
      body: {
        message: 'TF401398: An active pull request for the source and target branch already exists.',
      },
    },
  });
  const repo = fakeRepoGit();
  await assert.rejects(
    createAzureInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 'chore(redline): onboard',
      body: 'body',
      labels: [],
      files: ['.azuredevops/redline-gate.yml'],
    }),
    /could not open a pull request/
  );
});

test('openPullRequest uses full ref names and returns the azure pull request id', async () => {
  const client = fakeAzure({
    'POST /Payments/_apis/git/repositories/repo-guid/pullrequests': {
      status: 201,
      body: { pullRequestId: 31 },
    },
  });
  const repo = fakeRepoGit();
  const pr = await createAzureInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: [],
    files: ['.azuredevops/redline-gate.yml'],
  });
  assert.ok(pr);
  assert.equal(pr.number, 31);
  assert.equal(pr.url, 'https://dev.azure.com/acme/Payments/_git/web/pullrequest/31');
  const create = client.calls.find((c) => c.method === 'POST')!;
  assert.deepEqual(create.body, {
    sourceRefName: 'refs/heads/redline/onboard',
    targetRefName: 'refs/heads/main',
    title: 'chore(redline): onboard',
    description: 'body',
  });
});

test('an unrelated pre-staged file refuses onboarding before any branch is created', async () => {
  const client = fakeAzure();
  const repo = fakeRepoGit('main', true);
  await assert.rejects(
    createAzureInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 't',
      body: 'b',
      labels: [],
      files: ['.azuredevops/redline-gate.yml'],
    }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage',
  );
  assert.ok(!repo.calls.some((c) => c[0] === 'checkout'), 'must refuse before creating a branch');
  assert.deepEqual(client.calls, []);
});

test('nothing to commit is a null-PR no-op that ends on the original branch', async () => {
  const client = fakeAzure();
  const calls: string[][] = [];
  const clean = (cwd: string) =>
    createGit(cwd, (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main';
      return '';
    });
  const pr = await createAzureInstall(client, clean).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 't',
    body: 'b',
    labels: [],
    files: ['.azuredevops/redline-gate.yml'],
  });
  assert.equal(pr, null);
  assert.ok(!calls.some((c) => c[0] === 'commit'));
  assert.ok(!calls.some((c) => c[0] === 'push'));
  assert.deepEqual(calls.at(-1), ['checkout', 'main']);
  assert.deepEqual(client.calls, []);
});

test('a successful run ends on the original branch, not on redline/onboard', async () => {
  const client = fakeAzure({
    'POST /Payments/_apis/git/repositories/repo-guid/pullrequests': {
      status: 201,
      body: { pullRequestId: 5 },
    },
  });
  const repo = fakeRepoGit('feature/payments');
  await createAzureInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: [],
    files: ['.azuredevops/redline-gate.yml'],
  });
  const pushIndex = repo.calls.findIndex((c) => c[0] === 'push');
  assert.ok(pushIndex >= 0);
  assert.deepEqual(repo.calls.at(-1), ['checkout', 'feature/payments']);
});

// It used to POST one blocking required-reviewer policy per rule, every run,
// with no filter on the existing configurations — five more blocking
// policies on every re-run of `redline init` — and it named GitHub team
// slugs where Azure requires identity GUIDs.
test('ensureReviewOwnership reports unsupported on Azure and writes no policy', async () => {
  const client = fakeAzure();
  const result = await createAzureInstall(client, gitFor).ensureReviewOwnership(ref, tmp(), [
    { pattern: '/AGENTS.md', owners: ['@acme/platform-engineering'] },
    { pattern: '/infra/', owners: ['@acme/platform-engineering'] },
  ]);
  assert.deepEqual(result.files, []);
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0]?.status, 'unsupported');
  assert.deepEqual(client.calls, [], 'no host call, so nothing accumulates across re-runs');
});
