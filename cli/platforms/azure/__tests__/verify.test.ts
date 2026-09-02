import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAzurePlatform } from '../index.ts';
import { createAzureVerify } from '../verify.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import type { AzureClient } from '../client.ts';
import type { HttpResponse } from '../../http.ts';
import type { RepoRef } from '../../types.ts';

const ref: RepoRef = {
  host: 'azure',
  org: 'acme',
  project: 'Payments',
  repo: 'web',
  repoId: 'repo-guid',
  defaultBranch: 'main',
};

function fakeAzure(routes: Record<string, { status: number; body?: unknown }>): AzureClient {
  return {
    async request<T>(method: string, path: string): Promise<HttpResponse<T>> {
      const route = routes[`${method} ${path}`] ?? { status: 200, body: {} };
      return { status: route.status, body: (route.body ?? null) as T | null };
    },
  };
}

const configurations = (isBlocking: boolean) => ({
  'GET /Payments/_apis/policy/types': {
    status: 200,
    body: {
      value: [
        { id: 'min-rev-id', displayName: 'Minimum number of reviewers' },
        { id: 'comments-id', displayName: 'Comment requirements' },
        { id: 'status-id', displayName: 'Status' },
      ],
    },
  },
  'GET /Payments/_apis/policy/configurations': {
    status: 200,
    body: {
      value: [
        {
          id: 1,
          isEnabled: true,
          isBlocking: true,
          type: { id: 'min-rev-id' },
          settings: {
            minimumApproverCount: 2,
            resetOnSourcePush: true,
            scope: [{ repositoryId: 'repo-guid' }],
          },
        },
        {
          id: 2,
          isEnabled: true,
          isBlocking: true,
          type: { id: 'comments-id' },
          settings: { scope: [{ repositoryId: 'repo-guid' }] },
        },
        {
          id: 3,
          isEnabled: true,
          isBlocking,
          type: { id: 'status-id' },
          settings: {
            statusGenre: 'redline',
            statusName: 'gate',
            scope: [{ repositoryId: 'repo-guid' }],
          },
        },
      ],
    },
  },
});

test('readPolicy maps branch policies back to a MergePolicy', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(true))).readPolicy(ref);
  assert.equal(policy?.requiredApprovals, 2);
  assert.equal(policy?.dismissStaleReviews, true);
  assert.equal(policy?.requireThreadResolution, true);
  assert.equal(policy?.blocking, true);
  assert.deepEqual(policy?.requiredChecks, ['redline/gate']);
});

test('a non-blocking status policy reads back as advisory', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(false))).readPolicy(ref);
  assert.equal(policy?.blocking, false);
});

test('no policies scoped to this repository reads back as null', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 200, body: { value: [] } },
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  assert.equal(await createAzureVerify(client).readPolicy(ref), null);
});

test('reported status names are genre/name, matching the pipeline contract', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/git/repositories/repo-guid/pullRequests/31/statuses': {
      status: 200,
      body: { value: [{ context: { genre: 'redline', name: 'gate' } }, { context: { name: 'build' } }] },
    },
  });
  const names = await createAzureVerify(client).readReportedCheckNames(ref, 31);
  assert.deepEqual(names, ['redline/gate', 'build']);
});

test('security state reflects advanced security enablement', async () => {
  const enabled = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 200,
      body: { advSecEnabled: true, blockPushes: true },
    },
  });
  const state = await createAzureVerify(enabled).readSecurityState(ref);
  assert.ok(state.outcomes.every((o) => o.status === 'applied'));

  const unlicensed = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': { status: 404 },
  });
  const off = await createAzureVerify(unlicensed).readSecurityState(ref);
  assert.ok(off.outcomes.every((o) => o.status === 'unsupported'));
});

// --- error-path coverage: a truthy Azure error body must never read as a
// valid empty/absent result. Every method below is driven with a realistic
// non-2xx response and must surface a host error, not degrade silently.

test('readPolicy surfaces a non-2xx policy-configurations response as a host error, not as "no policy"', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 200, body: { value: [] } },
    'GET /Payments/_apis/policy/configurations': {
      status: 403,
      body: { message: 'Forbidden', typeKey: 'UnauthorizedRequestException' },
    },
  });
  await assert.rejects(
    createAzureVerify(client).readPolicy(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('readPolicy rejects a policy-configurations body without a value array instead of reading it as empty', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 200, body: { value: [] } },
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: { message: 'Forbidden' },
    },
  });
  await assert.rejects(
    createAzureVerify(client).readPolicy(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('readReportedCheckNames surfaces a non-2xx statuses response as a host error, not an empty list', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/git/repositories/repo-guid/pullRequests/31/statuses': {
      status: 500,
      body: { message: 'internal error' },
    },
  });
  await assert.rejects(
    createAzureVerify(client).readReportedCheckNames(ref, 31),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('readSecurityState treats an explicit 403 as denied, not unsupported', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 403,
      body: { message: 'Forbidden' },
    },
  });
  const state = await createAzureVerify(client).readSecurityState(ref);
  assert.ok(state.outcomes.every((o) => o.status === 'denied'));
});

// A transient host error (500, a gateway timeout) must not read as "an
// administrator turned this off" — `denied` is exactly the status that
// files pending admin work, so mapping a 500 to it would send an
// administrator looking for a problem that does not exist.
test('readSecurityState surfaces a 500 as a host error, not as capabilities being denied', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 500,
      body: { message: 'internal error' },
    },
  });
  await assert.rejects(
    createAzureVerify(client).readSecurityState(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('latestPullRequestNumber returns null when the repository has no pull requests', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/git/repositories/repo-guid/pullrequests?searchCriteria.status=all&$top=1': {
      status: 200,
      body: { value: [] },
    },
  });
  assert.equal(await createAzureVerify(client).latestPullRequestNumber(ref), null);
});

// Same decision as the GitHub adapter: "token lacks scope" and "the host is
// down" must exit differently (3 vs 4) so CI can tell them apart.
test('repoRef maps a 401/403 to a permission error with a token hint, not a host error', async () => {
  for (const status of [401, 403]) {
    const client = fakeAzure({
      'GET /Payments/_apis/git/repositories/web': { status, body: { message: 'Forbidden' } },
    });
    const gitFor: (cwd: string) => ReturnType<typeof createGit> = (cwd) => {
      const run: GitRunner = (args) =>
        args[0] === 'remote'
          ? 'git@ssh.dev.azure.com:v3/acme/Payments/web'
          : args[0] === 'rev-parse'
            ? 'true'
            : '';
      return createGit(cwd, run);
    };
    await assert.rejects(
      createAzurePlatform({ client, gitFor }).repoRef('/anywhere'),
      (err: unknown) =>
        isRedlineError(err) &&
        err.kind === 'permission' &&
        err.exitCode === 3 &&
        /AZURE_DEVOPS_EXT_PAT/.test(err.hint ?? '')
    );
  }
});

test('latestPullRequestNumber surfaces a non-2xx response as a host error, not null', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/git/repositories/repo-guid/pullrequests?searchCriteria.status=all&$top=1': {
      status: 404,
      body: { message: 'project not found' },
    },
  });
  await assert.rejects(
    createAzureVerify(client).latestPullRequestNumber(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});
