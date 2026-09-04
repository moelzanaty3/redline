import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createAzurePlatform } from '../index.ts';
import { createAzureVerify } from '../verify.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import type { AzureClient } from '../client.ts';
import type { HttpResponse } from '../../http.ts';
import { isPending, type RepoRef } from '../../types.ts';

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

// The gate's Build Validation policy: it is what actually queues the gate
// pipeline on Azure (YAML `pr:` triggers are ignored by Azure Repos), so the
// blocking read below requires it to exist under the Redline: marker.
const buildValidation = (displayName: string) => ({
  id: 4,
  isEnabled: true,
  isBlocking: true,
  type: { id: 'build-id' },
  settings: {
    buildDefinitionId: 42,
    displayName,
    validDuration: 0,
    queueOnSourceUpdateOnly: true,
    scope: [{ repositoryId: 'repo-guid' }],
  },
});

const configurations = (
  isBlocking: boolean,
  build: unknown = buildValidation('Redline: gate build')
) => ({
  'GET /Payments/_apis/policy/types': {
    status: 200,
    body: {
      value: [
        { id: 'min-rev-id', displayName: 'Minimum number of reviewers' },
        { id: 'comments-id', displayName: 'Comment requirements' },
        { id: 'status-id', displayName: 'Status' },
        { id: 'build-id', displayName: 'Build' },
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
        ...(build === null ? [] : [build]),
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

// Mirrors the GitHub adapter: an advisory gate requires nothing, so a
// non-blocking status policy must not report redline/gate as a required check.
test('a non-blocking status policy derives no required checks', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(false))).readPolicy(ref);
  assert.deepEqual(policy?.requiredChecks, []);
});

test('a blocking status policy without the Build Validation policy reads back as advisory', async () => {
  // Without a Build Validation policy nothing queues the gate pipeline, so
  // the gate is not actually enforcing — blocking must read false.
  const policy = await createAzureVerify(fakeAzure(configurations(true, null))).readPolicy(ref);
  assert.equal(policy?.blocking, false);
});

// "policy is advisory, config says blocking" is the opposite of what an
// operator debugging stuck pull requests needs to read: the Status policy IS
// blocking, and the missing Build Validation policy is why nothing satisfies
// it. That cause has to reach the finding.
test('a blocking status policy with no Build Validation policy names the missing policy as the cause', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(true, null))).readPolicy(ref);
  assert.match(policy?.advisoryReason ?? '', /Build Validation/);
  assert.match(policy?.advisoryReason ?? '', /blocked/);
});

test('an enforcing gate carries no advisory reason', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(true))).readPolicy(ref);
  assert.equal(policy?.advisoryReason, undefined);
});

// Azure has no CODEOWNERS-driven required reviewers, and `applyPolicy` never
// writes one — so a code-owner requirement read off this host says nothing
// about drift. The reviewer and comment policies are the same story whenever a
// human owns them: `redline init` deliberately backs off rather than stacking a
// second copy of a one-setting-per-branch control. `verify` must be told which
// settings it cannot hold this repository to, or it fails every Azure
// repository on every pull request through the gate.
test('settings Redline does not own on Azure are named rather than reported as its own', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(true))).readPolicy(ref);
  assert.deepEqual(
    [...(policy?.unownedSettings ?? [])].sort(),
    ['dismissStaleReviews', 'requireCodeOwnerReview', 'requireThreadResolution', 'requiredApprovals']
  );
});

test('reviewer and comment policies Redline wrote are its own to be held to', async () => {
  const owned = configurations(true);
  const value = (owned['GET /Payments/_apis/policy/configurations'].body as {
    value: { settings: Record<string, unknown> }[];
  }).value;
  value[0]!.settings['displayName'] = 'Redline: minimum reviewers';
  value[1]!.settings['displayName'] = 'Redline: comment resolution';
  const policy = await createAzureVerify(fakeAzure(owned)).readPolicy(ref);
  assert.deepEqual(policy?.unownedSettings, ['requireCodeOwnerReview']);
});

test('a human build policy without the Redline marker does not count as the gate build', async () => {
  const policy = await createAzureVerify(
    fakeAzure(configurations(true, buildValidation('Nightly CI')))
  ).readPolicy(ref);
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

// Azure DevOps does not document this endpoint distinguishing "you lack
// permission to see this" from a well-formed refusal, so a 401/403 here gives
// no answer about the repository — same governing principle as GitHub's
// invisible security_and_analysis block. Reading it as `denied` was the exact
// defect Task 6 closed on GitHub: a token that can WRITE the enablement
// setting but cannot READ it back made a re-run overwrite a correct
// `.redline.json` with a false pendingAdmin list, open a pull request, and
// exit 0. `unsupported` is wrong too — that status means Advanced Security is
// definitely unlicensed, and this token has learned nothing that definite.
test('readSecurityState treats a 401/403 as unknown, never denied and never unsupported', async () => {
  for (const status of [401, 403]) {
    const client = fakeAzure({
      'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
        status,
        body: { message: 'Forbidden' },
      },
    });
    const state = await createAzureVerify(client).readSecurityState(ref);
    assert.ok(
      state.outcomes.every((o) => o.status === 'unknown'),
      `status ${status}: ${JSON.stringify(state.outcomes)}`
    );
    assert.ok(
      !state.outcomes.some(isPending),
      `status ${status}: an indeterminate read must never become pending admin work`
    );
  }
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

// The same enablement flag Advanced Security is switched on with covers
// dependency scanning, and `enableSecurityFloor` records all three from it.
// The read side reported only two, so a `dependency-alerts` entry recorded on
// an Azure repository could never be answered either way.
test('readSecurityState reports advanced security dependency scanning alongside the rest of the floor', async () => {
  const enabled = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 200,
      body: { advSecEnabled: true, blockPushes: true },
    },
  });
  const on = await createAzureVerify(enabled).readSecurityState(ref);
  assert.equal(on.outcomes.find((o) => o.capability === 'dependency-alerts')?.status, 'applied');

  const off = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 200,
      body: { advSecEnabled: false, blockPushes: false },
    },
  });
  const state = await createAzureVerify(off).readSecurityState(ref);
  assert.equal(state.outcomes.find((o) => o.capability === 'dependency-alerts')?.status, 'denied');
});

// `unownedSettings` exists for settings Redline never owned — the code-owner
// requirement it does not apply here, and a one-setting-per-branch policy a
// human already owned that `init` backed off from. A Redline-owned policy an
// administrator DELETED is the opposite: it is the most obvious way to loosen
// an Azure repository, and routing it into the same list reported it clean.
test('a deleted Redline reviewer policy is drift, not a setting Redline never owned', async () => {
  const stripped = configurations(true);
  const body = stripped['GET /Payments/_apis/policy/configurations'].body as {
    value: { type: { id: string } }[];
  };
  body.value = body.value.filter((c) => c.type.id !== 'min-rev-id' && c.type.id !== 'comments-id');

  const policy = await createAzureVerify(fakeAzure(stripped)).readPolicy(ref);
  assert.deepEqual(policy?.unownedSettings, ['requireCodeOwnerReview']);
  assert.equal(policy?.requiredApprovals, 0);
  assert.equal(policy?.requireThreadResolution, false);
});

// --- the gate machinery on disk --------------------------------------------

const azureDirs: string[] = [];
after(() => {
  for (const dir of azureDirs) rmSync(dir, { recursive: true, force: true });
});

function azureRepoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-azgate-'));
  azureDirs.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), contents);
  }
  return dir;
}

const PIPELINE = [
  'steps:',
  '  - script: npx --yes --package=redline-cli@latest redline verify --gate',
  '  - script: |',
  '      body=$(jq -n \'{state: $state, context: {name: "gate", genre: "redline"}}\')',
  '',
].join('\n');

test('readGateMachinery names the status the installed pipeline would publish', () => {
  const cwd = azureRepoWith({ '.azuredevops/redline-gate.yml': PIPELINE });
  const machinery = createAzureVerify(fakeAzure({})).readGateMachinery(cwd);
  assert.equal(machinery.present, true);
  assert.equal(machinery.publishes, 'redline/gate');
});

test('a deleted gate pipeline reports absent', () => {
  const cwd = azureRepoWith({ 'README.md': '# web\n' });
  const machinery = createAzureVerify(fakeAzure({})).readGateMachinery(cwd);
  assert.equal(machinery.path, '.azuredevops/redline-gate.yml');
  assert.equal(machinery.present, false);
  assert.equal(machinery.publishes, null);
});

test('a pipeline edited to publish a different status name publishes nothing the policy requires', () => {
  const cwd = azureRepoWith({
    '.azuredevops/redline-gate.yml': PIPELINE.replace('name: "gate"', 'name: "ci"'),
  });
  assert.equal(createAzureVerify(fakeAzure({})).readGateMachinery(cwd).publishes, null);
});

// The status context is what the Status branch policy requires, and whitespace
// or quote style around it changes nothing about what the pipeline publishes.
// A whole-file substring match failed the gate on both.
test('the status contract is read whatever quoting or spacing the file uses', () => {
  for (const variant of ['name:  "gate"', "name: 'gate'", 'name:"gate"']) {
    const cwd = azureRepoWith({
      '.azuredevops/redline-gate.yml': PIPELINE.replace('name: "gate"', variant),
    });
    assert.equal(
      createAzureVerify(fakeAzure({})).readGateMachinery(cwd).publishes,
      'redline/gate',
      variant
    );
  }
});

// The other direction: the publish step deleted and its text left behind in a
// comment is not a pipeline that publishes anything.
test('the status contract surviving only in a comment does not count as publishing', () => {
  const cwd = azureRepoWith({
    '.azuredevops/redline-gate.yml': [
      'steps:',
      '  - script: npx --yes --package=redline-cli@latest redline verify --gate',
      '  # was: context: {name: "gate", genre: "redline"}',
      '',
    ].join('\n'),
  });
  assert.equal(createAzureVerify(fakeAzure({})).readGateMachinery(cwd).publishes, null);
});

test('readGateMachinery names the status a correctly installed pipeline publishes', () => {
  const cwd = azureRepoWith({ '.azuredevops/redline-gate.yml': PIPELINE });
  assert.equal(createAzureVerify(fakeAzure({})).readGateMachinery(cwd).expected, 'redline/gate');
});

test('a gate pipeline that cannot be read fails as a Redline error, not an unexpected crash', () => {
  const cwd = azureRepoWith({ '.azuredevops/redline-gate.yml/keep': 'a directory, not the pipeline' });
  assert.throws(
    () => createAzureVerify(fakeAzure({})).readGateMachinery(cwd),
    (error: unknown) => isRedlineError(error) && error.kind === 'failed'
  );
});
