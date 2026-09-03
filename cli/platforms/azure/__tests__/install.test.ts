import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import { BEGIN, END } from '../../../render/markers.ts';
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
        { id: 'build-id', displayName: 'Build' },
      ],
    },
  },
};

// Redline definitions live in their own `\Redline` folder: definition names
// are unique per folder, which is what keeps two repositories in the same
// project from colliding on the name `redline-gate`.
const BUILD_DEFS_PATH =
  '/Payments/_apis/build/definitions?name=redline-gate&path=%5CRedline&includeAllProperties=true';

const gateDefinition = (over: Record<string, unknown> = {}) => ({
  id: 42,
  name: 'redline-gate',
  path: '\\Redline',
  process: { type: 2, yamlFilename: '.azuredevops/redline-gate.yml' },
  repository: { id: 'repo-guid' },
  ...over,
});

// installGate's registration path: no definition yet, creation succeeds.
const registrationRoutes = {
  [`GET ${BUILD_DEFS_PATH}`]: { status: 200, body: { value: [] } },
  'POST /Payments/_apis/build/definitions': { status: 200, body: { id: 42 } },
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

test('installGate writes the azure pipeline and PR template', async () => {
  const cwd = tmp();
  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(ref, cwd, gateOpts);
  assert.deepEqual(result.files, ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md']);
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /ADR_DIFF_THRESHOLD: 300/);
  assert.match(yml, /genre[^\n]*redline/);

  // Regression guard: Azure Repos ignores YAML `pr:` triggers (GitHub-only
  // feature) — the Build Validation policy is what queues this pipeline, so
  // a `pr:` block in the template is dead code that misleads readers.
  assert.doesNotMatch(yml, /^pr:/m);
  assert.match(yml, /Build Validation/);

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
  await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(ref, cwd, opts);
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /FAIL_ON_DEPENDENCY_SEVERITY: critical/);
});

// --- gate build definition + Build Validation policy. Azure Repos ignores
// YAML `pr:` triggers, so without a registered pipeline definition and a
// Build Validation branch policy the gate never runs and `redline/gate` is
// never published — a blocking Status policy would then block every pull
// request in the repository forever.

test('installGate registers the gate pipeline definition when none exists', async () => {
  const client = fakeAzure(registrationRoutes);
  const result = await createAzureInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  const create = client.calls.find(
    (c) => c.method === 'POST' && c.path === '/Payments/_apis/build/definitions'
  );
  assert.deepEqual(create?.body, {
    name: 'redline-gate',
    // Definition names are unique per folder, so registering in `\Redline`
    // removes the cross-repository name collision at its source.
    path: '\\Redline',
    process: { type: 2, yamlFilename: '.azuredevops/redline-gate.yml' },
    repository: { id: 'repo-guid', type: 'TfsGit' },
  });
  assert.equal(result.outcomes.find((o) => o.capability === 'gate')?.status, 'applied');
});

test('installGate reuses a definition matching name, folder, repository and yamlFilename', async () => {
  const client = fakeAzure({
    [`GET ${BUILD_DEFS_PATH}`]: { status: 200, body: { value: [gateDefinition({ id: 7 })] } },
  });
  const result = await createAzureInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.ok(!client.calls.some((c) => c.method === 'POST' && c.path === '/Payments/_apis/build/definitions'));
  assert.equal(result.outcomes.find((o) => o.capability === 'gate')?.status, 'already');
});

// The `name=` filter is project-wide, so a sibling repository onboarded first
// comes back from this GET. Adopting its definition id would point this
// repository's Build Validation policy at a pipeline that checks out the
// sibling and publishes redline/gate against the sibling's id — with
// --blocking, every pull request here would sit blocked forever.
test('a definition of the same name bound to another repository is never adopted', async () => {
  const client = fakeAzure({
    [`GET ${BUILD_DEFS_PATH}`]: {
      status: 200,
      body: { value: [gateDefinition({ id: 7, repository: { id: 'other-repo-guid' } })] },
    },
  });
  const result = await createAzureInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.ok(
    !client.calls.some((c) => c.method === 'POST' && c.path === '/Payments/_apis/build/definitions'),
    'the name is taken in this folder — POSTing would fail or duplicate'
  );
  const gate = result.outcomes.find((o) => o.capability === 'gate');
  assert.equal(gate?.status, 'denied');
  assert.match(gate?.detail ?? '', /id 7/);
  assert.match(gate?.detail ?? '', /other-repo-guid/);
});

test('a human-owned redline-gate definition with a different yamlFilename is reported and left untouched', async () => {
  const client = fakeAzure({
    [`GET ${BUILD_DEFS_PATH}`]: {
      status: 200,
      body: { value: [gateDefinition({ id: 7, process: { type: 2, yamlFilename: 'pipelines/ci.yml' } })] },
    },
  });
  const result = await createAzureInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.ok(
    !client.calls.some(
      (c) => c.method !== 'GET' && c.path.startsWith('/Payments/_apis/build/definitions')
    ),
    'must neither create nor update a human-owned definition'
  );
  const gate = result.outcomes.find((o) => o.capability === 'gate');
  assert.equal(gate?.status, 'denied');
  assert.match(gate?.detail ?? '', /id 7/);
  assert.match(gate?.detail ?? '', /left untouched/);
});

test('missing Build Administrator degrades the gate capability to denied, never throws', async () => {
  const client = fakeAzure({
    [`GET ${BUILD_DEFS_PATH}`]: { status: 200, body: { value: [] } },
    'POST /Payments/_apis/build/definitions': {
      status: 403,
      body: { message: 'TF400813: The user is not authorized to access this resource.' },
    },
  });
  const result = await createAzureInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  const gate = result.outcomes.find((o) => o.capability === 'gate');
  assert.equal(gate?.status, 'denied');
  assert.match(gate?.detail ?? '', /build administrator/i);
});

test('a project without Azure Pipelines reads as unsupported, not pending admin', async () => {
  const client = fakeAzure({ [`GET ${BUILD_DEFS_PATH}`]: { status: 404 } });
  const result = await createAzureInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.equal(result.outcomes.find((o) => o.capability === 'gate')?.status, 'unsupported');
});

test('a registered definition gets a Build Validation policy whose isBlocking mirrors the menu', async () => {
  const client = fakeAzure({
    ...typesRoute,
    ...registrationRoutes,
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  const install = createAzureInstall(client, gitFor);
  await install.installGate(ref, tmp(), gateOpts);
  const result = await install.applyPolicy(ref, { ...advisory, blocking: true });
  const buildPolicy = client.calls.find(
    (c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations' &&
      (c.body as { type: { id: string } }).type.id === 'build-id'
  );
  assert.ok(buildPolicy, 'a Build Validation policy must be created');
  const body = buildPolicy?.body as {
    isBlocking: boolean;
    settings: Record<string, unknown>;
  };
  assert.equal(body.isBlocking, true);
  assert.equal(body.settings['buildDefinitionId'], 42);
  assert.equal(body.settings['displayName'], 'Redline: gate build');
  assert.equal(body.settings['validDuration'], 0);
  assert.equal(body.settings['queueOnSourceUpdateOnly'], true);
  assert.deepEqual(body.settings['scope'], [
    { repositoryId: 'repo-guid', refName: 'refs/heads/main', matchKind: 'exact' },
  ]);
  assert.equal(result.policy?.blocking, true);
});

// Security property: a blocking redline/gate Status policy with no pipeline
// to publish the status blocks every pull request forever. A failed
// registration must force the whole gate advisory.
test('when the definition could not be registered the status policy is written advisory, never blocking', async () => {
  const client = fakeAzure({
    ...typesRoute,
    [`GET ${BUILD_DEFS_PATH}`]: { status: 200, body: { value: [] } },
    'POST /Payments/_apis/build/definitions': { status: 403 },
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  const install = createAzureInstall(client, gitFor);
  const gateResult = await install.installGate(ref, tmp(), gateOpts);
  const result = await install.applyPolicy(ref, { ...advisory, blocking: true });

  const statusPolicy = client.calls.find(
    (c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations' &&
      (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  assert.equal((statusPolicy?.body as { isBlocking: boolean }).isBlocking, false);
  assert.ok(
    !client.calls.some(
      (c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations' &&
        (c.body as { type: { id: string } }).type.id === 'build-id'
    ),
    'no Build Validation policy may reference a definition that does not exist'
  );
  assert.equal(result.policy?.blocking, false, 'the applied policy must report itself advisory');
  const gate = gateResult.outcomes.find((o) => o.capability === 'gate');
  assert.equal(gate?.status, 'denied');
  assert.match(gate?.detail ?? '', /advisory/);
});

// Realistic split: a PAT with Edit-policies but no build read registers the
// definition, then has its Build Validation policy write rejected. If the
// Status policy had already gone out blocking, the repository would be left
// requiring redline/gate with nothing queuing the pipeline.
test('a rejected Build Validation policy write leaves the status policy advisory', async () => {
  // Routes key on method+path, and both policy writes share a path — the
  // Build Validation policy is identified by the type id in its body.
  const base = fakeAzure({
    ...typesRoute,
    ...registrationRoutes,
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  const client = {
    calls: base.calls,
    async request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      const res = await base.request<T>(method, path, body);
      const isBuildPolicy = (body as { type?: { id: string } } | undefined)?.type?.id === 'build-id';
      return isBuildPolicy ? { status: 403, body: null } : res;
    },
  };

  const install = createAzureInstall(client, gitFor);
  await install.installGate(ref, tmp(), gateOpts);
  const result = await install.applyPolicy(ref, { ...advisory, blocking: true });

  const statusPolicy = client.calls.find(
    (c) => c.path === '/Payments/_apis/policy/configurations' &&
      (c.body as { type?: { id: string } } | undefined)?.type?.id === 'status-id'
  );
  assert.equal((statusPolicy?.body as { isBlocking: boolean }).isBlocking, false);
  // A partially rejected write reports no applied policy at all.
  assert.equal(result.policy, null);
});

// A working, enforcing repository must not be silently downgraded because
// this run's token cannot read build definitions.
test('an existing Redline build policy keeps the gate blocking when the definitions lookup is denied', async () => {
  const scope = [{ repositoryId: 'repo-guid' }];
  const client = fakeAzure({
    ...typesRoute,
    [`GET ${BUILD_DEFS_PATH}`]: { status: 403, body: { message: 'Forbidden' } },
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 60,
            type: { id: 'status-id' },
            settings: { statusGenre: 'redline', statusName: 'gate', scope },
          },
          {
            id: 61,
            type: { id: 'build-id' },
            settings: { buildDefinitionId: 42, displayName: 'Redline: gate build', scope },
          },
        ],
      },
    },
  });
  const install = createAzureInstall(client, gitFor);
  const gateResult = await install.installGate(ref, tmp(), gateOpts);
  const result = await install.applyPolicy(ref, { ...advisory, blocking: true });

  const statusPolicy = client.calls.find((c) => c.path === '/Payments/_apis/policy/configurations/60');
  assert.equal((statusPolicy?.body as { isBlocking: boolean }).isBlocking, true);
  assert.equal(result.policy?.blocking, true);
  assert.ok(
    !client.calls.some((c) => c.path === '/Payments/_apis/policy/configurations/61'),
    'the existing build policy is left alone — this run never learned its definition id'
  );
  assert.equal(gateResult.outcomes.find((o) => o.capability === 'gate')?.status, 'denied');
});

test('an existing Redline-marked build policy is updated in place; human build policies coexist untouched', async () => {
  const scope = [{ repositoryId: 'repo-guid' }];
  const client = fakeAzure({
    ...typesRoute,
    [`GET ${BUILD_DEFS_PATH}`]: { status: 200, body: { value: [gateDefinition()] } },
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 50,
            type: { id: 'build-id' },
            settings: { buildDefinitionId: 9, displayName: 'Nightly CI', scope },
          },
          {
            id: 51,
            type: { id: 'build-id' },
            settings: { buildDefinitionId: 42, displayName: 'Redline: gate build', scope },
          },
        ],
      },
    },
  });
  const install = createAzureInstall(client, gitFor);
  await install.installGate(ref, tmp(), gateOpts);
  await install.applyPolicy(ref, advisory);
  assert.ok(
    client.calls.some((c) => c.method === 'PUT' && c.path === '/Payments/_apis/policy/configurations/51'),
    'the Redline-marked build policy is updated in place'
  );
  assert.ok(
    !client.calls.some((c) => c.path === '/Payments/_apis/policy/configurations/50'),
    'a build policy without the Redline: marker is human-owned and never written to'
  );
});

// Brownfield: an onboarded repository already has branch policies a human
// configured. Azure models "minimum number of reviewers" as one setting per
// branch, so an unmarked policy of that type on the default branch IS the
// human's own — PUTting Redline's settings over it silently rewrites how the
// team reviews code.
test('a human-owned minimum-reviewers policy on the default branch is reported and never written to', async () => {
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 50,
            type: { id: 'min-rev-id' },
            settings: {
              minimumApproverCount: 3,
              displayName: 'Two seniors on main',
              scope: [{ repositoryId: 'repo-guid', refName: 'refs/heads/main', matchKind: 'exact' }],
            },
          },
        ],
      },
    },
  });
  const result = await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);

  assert.ok(
    !client.calls.some((c) => c.path === '/Payments/_apis/policy/configurations/50'),
    'a policy without the Redline: marker is human-owned and is never PUT over'
  );
  assert.ok(
    !client.calls.some(
      (c) => c.method === 'POST' && (c.body as { type?: { id: string } } | undefined)?.type?.id === 'min-rev-id'
    ),
    'nor is a second, conflicting minimum-reviewers policy stacked on the same branch'
  );
  const mergePolicy = result.outcomes.find((o) => o.capability === 'merge-policy');
  assert.equal(mergePolicy?.status, 'already');
  assert.match(mergePolicy?.detail ?? '', /Two seniors on main/);
  assert.match(mergePolicy?.detail ?? '', /left untouched/);
  // An `already` outcome means the branch is governed, not that the run
  // failed: it must not zero the applied policy.
  assert.equal(result.policy?.requiredApprovals, advisory.requiredApprovals);
});

// A Redline-marked policy an operator deliberately scoped to a release branch
// must not be matched by the default-branch write and silently rescoped.
test('a Redline-marked policy scoped to another branch is neither matched nor rescoped', async () => {
  const client = fakeAzure({
    ...typesRoute,
    [`GET ${BUILD_DEFS_PATH}`]: { status: 200, body: { value: [gateDefinition()] } },
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 70,
            type: { id: 'build-id' },
            settings: {
              buildDefinitionId: 42,
              displayName: 'Redline: gate build',
              scope: [{ repositoryId: 'repo-guid', refName: 'refs/heads/release', matchKind: 'exact' }],
            },
          },
        ],
      },
    },
  });
  const install = createAzureInstall(client, gitFor);
  await install.installGate(ref, tmp(), gateOpts);
  await install.applyPolicy(ref, advisory);

  assert.ok(
    !client.calls.some((c) => c.path === '/Payments/_apis/policy/configurations/70'),
    'refs/heads/release is not this run’s branch — that policy is untouched'
  );
  const created = client.calls.find(
    (c) => c.method === 'POST' && (c.body as { type?: { id: string } } | undefined)?.type?.id === 'build-id'
  );
  assert.ok(created, 'the default branch still gets its own Build Validation policy');
  assert.deepEqual((created?.body as { settings: Record<string, unknown> }).settings['scope'], [
    { repositoryId: 'repo-guid', refName: 'refs/heads/main', matchKind: 'exact' },
  ]);
});

// A status policy is identified by the genre/name pair it requires, which is
// the marker the gate pipeline publishes against. A human status policy
// requiring a different status is a different object: Azure runs several on
// one branch, so Redline coexists with it instead of backing off and leaving
// the repository with no gate at all.
test('a human status policy requiring a different status is left alone and Redline adds its own', async () => {
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 80,
            type: { id: 'status-id' },
            settings: {
              statusGenre: 'sonarqube',
              statusName: 'quality-gate',
              scope: [{ repositoryId: 'repo-guid', refName: 'refs/heads/main', matchKind: 'exact' }],
            },
          },
        ],
      },
    },
  });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.ok(!client.calls.some((c) => c.path === '/Payments/_apis/policy/configurations/80'));
  const created = client.calls.find(
    (c) => c.method === 'POST' && (c.body as { type?: { id: string } } | undefined)?.type?.id === 'status-id'
  );
  const settings = (created?.body as { settings: Record<string, unknown> }).settings;
  assert.equal(settings['statusGenre'], 'redline');
  assert.equal(settings['statusName'], 'gate');
});

test('every policy Redline creates carries the Redline: ownership marker', async () => {
  const client = fakeAzure({
    ...typesRoute,
    ...registrationRoutes,
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  const install = createAzureInstall(client, gitFor);
  await install.installGate(ref, tmp(), gateOpts);
  await install.applyPolicy(ref, advisory);
  const written = client.calls.filter(
    (c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations'
  );
  assert.equal(written.length, 4);
  for (const call of written) {
    const settings = (call.body as { settings: Record<string, unknown> }).settings;
    assert.match(
      String(settings['displayName']),
      /^Redline: /,
      'without the marker a later run cannot tell its own policy from a human’s'
    );
  }
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

// The gate template exempts a pull request carrying a soft-fail label, and it
// reads those labels off the pull request — so the onboarding PR must actually
// carry `redline-sync`, or the very first gate run fails on a repository that
// has not adopted the standard yet.
test('openPullRequest applies the change labels to the created pull request', async () => {
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
    labels: ['redline-sync'],
    files: ['.azuredevops/redline-gate.yml'],
  });
  const labelCall = client.calls.find(
    (c) => c.path === '/Payments/_apis/git/repositories/repo-guid/pullRequests/31/labels'
  );
  assert.equal(labelCall?.method, 'POST');
  assert.deepEqual(labelCall?.body, { name: 'redline-sync' });
  assert.equal(pr?.outcomes?.find((o) => o.capability === 'labels')?.status, 'applied');
});

test('a rejected label write degrades to a labels outcome and still returns the pull request', async () => {
  const client = fakeAzure({
    'POST /Payments/_apis/git/repositories/repo-guid/pullrequests': {
      status: 201,
      body: { pullRequestId: 31 },
    },
    'POST /Payments/_apis/git/repositories/repo-guid/pullRequests/31/labels': {
      status: 403,
      body: { message: 'TF401027: You need Contribute permission to perform this action.' },
    },
  });
  const repo = fakeRepoGit();
  const pr = await createAzureInstall(client, repo.gitFor).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: ['redline-sync'],
    files: ['.azuredevops/redline-gate.yml'],
  });
  assert.equal(pr?.number, 31, 'the pull request is open — a label is not worth losing it over');
  assert.equal(pr?.outcomes?.find((o) => o.capability === 'labels')?.status, 'denied');
});

// `redline-cli@latest` in a template installed into hundreds of repositories
// means any npm publish changes org-wide gate behaviour without a pull
// request anywhere. The version is pinned at install time instead.
test('installGate pins the npx version in the rendered pipeline', async () => {
  const cwd = tmp();
  await createAzureInstall(fakeAzure(registrationRoutes), gitFor, '3.1.4').installGate(ref, cwd, gateOpts);
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /--package=redline-cli@3\.1\.4 redline verify --gate/);
  assert.doesNotMatch(yml, /redline-cli@latest/);
});

test('an unpublished development build leaves @latest in place rather than pinning a version npm has never seen', async () => {
  const cwd = tmp();
  await createAzureInstall(fakeAzure(registrationRoutes), gitFor, '0.0.0-development').installGate(
    ref,
    cwd,
    gateOpts
  );
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /--package=redline-cli@latest redline verify --gate/);
});

// GitHub implements the redline-exempt / redline-sync escape hatch in the
// gate workflow's shell (workflows/redline-gate.yml). Without the same thing
// on Azure a blocking gate has no reviewer-accepted override at all.
test('the gate template exempts a pull request carrying a soft-fail label', async () => {
  const cwd = tmp();
  await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(ref, cwd, {
    ...gateOpts,
    softFailLabels: ['redline-exempt', 'redline-sync'],
  });
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /SOFT_FAIL_LABELS: redline-exempt,redline-sync/);
  assert.match(yml, /pullRequests\/\$SYSTEM_PULLREQUEST_PULLREQUESTID/);
  assert.match(yml, /curl_authed -sS "\$pr_url\/labels/, 'the labels come off the pull request itself');
  assert.match(yml, /SOFT_FAIL_LABELS\/\/,\/ /, 'the configured labels are what the shell loops over');
  // The exemption may only ever turn a failure into a success, never the
  // reverse — and the token still stays out of argv on the extra call.
  assert.match(yml, /state="succeeded"/);
  assert.doesNotMatch(yml, /Authorization: Bearer \$SYSTEM_ACCESSTOKEN/);
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

// A re-run must leave a matching file alone. The gate yml carries a pinned
// `redline-cli@<version>`, so under a published CLI every re-run rewrote it
// and `redline init` — which reads installGate's file list — could not tell a
// real change from a rewrite of identical bytes.
test('installGate rewrites nothing and reports no file when the pinned pipeline already matches', async () => {
  const cwd = tmp();
  const install = createAzureInstall(fakeAzure(registrationRoutes), gitFor, '3.1.4');
  const first = await install.installGate(ref, cwd, gateOpts);
  assert.deepEqual(first.files, ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md']);

  const second = await install.installGate(ref, cwd, gateOpts);
  assert.deepEqual(second.files, [], 'an identical pinned pipeline is not a change');
});

test('a CLI version bump reports the gate pipeline as changed', async () => {
  const cwd = tmp();
  await createAzureInstall(fakeAzure(registrationRoutes), gitFor, '3.1.4').installGate(ref, cwd, gateOpts);
  const bumped = await createAzureInstall(fakeAzure(registrationRoutes), gitFor, '3.2.0').installGate(
    ref,
    cwd,
    gateOpts
  );
  assert.deepEqual(bumped.files, ['.azuredevops/redline-gate.yml']);
  assert.match(readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8'), /redline-cli@3\.2\.0/);
});

test('installGate in check mode writes nothing and registers no build definition', async () => {
  const cwd = tmp();
  const client = fakeAzure(registrationRoutes);
  const result = await createAzureInstall(client, gitFor, '3.1.4').installGate(ref, cwd, gateOpts, true);

  assert.deepEqual(result.files, ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md']);
  assert.deepEqual(result.outcomes, []);
  assert.deepEqual(client.calls, []);
  assert.equal(existsSync(join(cwd, '.azuredevops/redline-gate.yml')), false);
});

// Azure echoes matchKind back with the casing the object was created with: a
// policy made in the portal comes back as 'Prefix'. Read case-sensitively, a
// human's `refs/heads/` prefix policy stops looking like it covers `main`,
// and Redline stacks a second minimum-reviewers policy beside it.
test('a human prefix-scoped policy is recognised whatever case Azure echoes matchKind in', async () => {
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 51,
            type: { id: 'min-rev-id' },
            settings: {
              minimumApproverCount: 3,
              displayName: 'Two seniors on every branch',
              scope: [{ repositoryId: 'repo-guid', refName: 'refs/heads/', matchKind: 'Prefix' }],
            },
          },
        ],
      },
    },
  });
  const result = await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);

  assert.ok(
    !client.calls.some(
      (c) => c.method === 'POST' && (c.body as { type?: { id: string } } | undefined)?.type?.id === 'min-rev-id'
    ),
    'a Prefix-scoped human policy already governs main — Redline must not stack a second one'
  );
  const mergePolicy = result.outcomes.find((o) => o.capability === 'merge-policy');
  assert.match(mergePolicy?.detail ?? '', /Two seniors on every branch/);
});

// --- brownfield pull request template. Identical semantics to the GitHub
// adapter: never destroy a template the repository already had, and never
// leave one the gate rejects for want of a `## Launch readiness` section.

const PACKAGED_TEMPLATE = readFileSync(
  fileURLToPath(new URL('../../../../templates/azure/pull_request_template.md', import.meta.url)),
  'utf8'
);

const HUMAN_TEMPLATE = `# What changed

Describe it here.

## Our own checklist

- [ ] Ran the smoke suite
`;

const templateAt = (cwd: string): string =>
  readFileSync(join(cwd, '.azuredevops/pull_request_template.md'), 'utf8');

const seedTemplate = (cwd: string, body: string): void => {
  mkdirSync(join(cwd, '.azuredevops'), { recursive: true });
  writeFileSync(join(cwd, '.azuredevops/pull_request_template.md'), body);
};

test('installGate writes the packaged PR template whole when the repository has none', async () => {
  const cwd = tmp();
  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(
    ref,
    cwd,
    gateOpts
  );
  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.ok(result.files.includes('.azuredevops/pull_request_template.md'));
});

test('installGate does not destroy a pull request template the repository already had', async () => {
  const cwd = tmp();
  seedTemplate(cwd, HUMAN_TEMPLATE);

  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(
    ref,
    cwd,
    gateOpts
  );
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
  const install = createAzureInstall(fakeAzure(registrationRoutes), gitFor);
  seedTemplate(cwd, HUMAN_TEMPLATE);
  await install.installGate(ref, cwd, gateOpts);

  const merged = templateAt(cwd);
  seedTemplate(cwd, merged.replace(/## Launch readiness/, '## Launch readiness\n\n- [ ] stale item'));

  const result = await install.installGate(ref, cwd, gateOpts);
  const after = templateAt(cwd);

  assert.equal(after, merged, 'the block is regenerated, everything outside it is untouched');
  assert.ok(!after.includes('stale item'));
  assert.ok(after.startsWith(HUMAN_TEMPLATE.trimEnd()));
  assert.ok(result.files.includes('.azuredevops/pull_request_template.md'));
});

test('a second run over an already-merged pull request template changes nothing', async () => {
  const cwd = tmp();
  const install = createAzureInstall(fakeAzure(registrationRoutes), gitFor);
  seedTemplate(cwd, HUMAN_TEMPLATE);
  await install.installGate(ref, cwd, gateOpts);
  const merged = templateAt(cwd);
  assert.match(merged, /## Our own checklist/, 'the merge must have preserved the human template');
  const stamp = statSync(join(cwd, '.azuredevops/pull_request_template.md')).mtimeMs;

  const second = await install.installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), merged);
  assert.equal(statSync(join(cwd, '.azuredevops/pull_request_template.md')).mtimeMs, stamp);
  assert.ok(!second.files.includes('.azuredevops/pull_request_template.md'));
});

test('a second run never appends a second Launch readiness section to the template Redline wrote', async () => {
  const cwd = tmp();
  const install = createAzureInstall(fakeAzure(registrationRoutes), gitFor);
  await install.installGate(ref, cwd, gateOpts);

  const second = await install.installGate(ref, cwd, gateOpts);

  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.equal((templateAt(cwd).match(/^## Launch readiness$/gm) ?? []).length, 1);
  assert.ok(!second.files.includes('.azuredevops/pull_request_template.md'));
});

test('a repository template that already has its own Launch readiness section is left untouched', async () => {
  const cwd = tmp();
  const own = `# Ours\n\n## Launch readiness\n\n- [ ] our own gate item\n`;
  seedTemplate(cwd, own);

  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(
    ref,
    cwd,
    gateOpts
  );

  assert.equal(templateAt(cwd), own);
  assert.ok(!result.files.includes('.azuredevops/pull_request_template.md'));
  assert.equal(
    result.outcomes.find((o) => o.detail.includes('pull_request_template.md'))?.status,
    'already'
  );
});

test('a dry run writes no pull request template, whatever the repository already has', async () => {
  const greenfield = tmp();
  const brownfield = tmp();
  const merged = tmp();
  const install = createAzureInstall(fakeAzure(registrationRoutes), gitFor);
  seedTemplate(brownfield, HUMAN_TEMPLATE);
  seedTemplate(merged, HUMAN_TEMPLATE);
  await install.installGate(ref, merged, gateOpts);
  const alreadyMerged = templateAt(merged);

  const plans = await Promise.all(
    [greenfield, brownfield, merged].map((dir) => install.installGate(ref, dir, gateOpts, true))
  );

  assert.ok(!existsSync(join(greenfield, '.azuredevops/pull_request_template.md')));
  assert.equal(templateAt(brownfield), HUMAN_TEMPLATE);
  assert.equal(templateAt(merged), alreadyMerged);
  assert.ok(plans[0]?.files.includes('.azuredevops/pull_request_template.md'));
  assert.ok(plans[1]?.files.includes('.azuredevops/pull_request_template.md'));
  assert.ok(!plans[2]?.files.includes('.azuredevops/pull_request_template.md'));
});

// Azure DevOps resolves the default template from `.azuredevops/`, the legacy
// `.vsts/` folder, `docs/` and the repository root, matching the filename
// case-insensitively. Same harm as on GitHub if Redline writes beside the one
// the host actually serves.

test('a template at a non-default candidate path is the file merged into, and no second one appears', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'docs/pull_request_template.md'), HUMAN_TEMPLATE);

  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(
    ref,
    cwd,
    gateOpts
  );

  const merged = readFileSync(join(cwd, 'docs/pull_request_template.md'), 'utf8');
  assert.ok(merged.startsWith(HUMAN_TEMPLATE.trimEnd()));
  assert.match(merged, /## Launch readiness/);
  assert.ok(
    !existsSync(join(cwd, '.azuredevops/pull_request_template.md')),
    'no second template may be created beside the one the host resolves'
  );
  assert.deepEqual(result.files, ['.azuredevops/redline-gate.yml', 'docs/pull_request_template.md']);
});

test('a template whose filename differs only in case is the one merged into', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.azuredevops'), { recursive: true });
  writeFileSync(join(cwd, '.azuredevops/PULL_REQUEST_TEMPLATE.md'), HUMAN_TEMPLATE);

  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(
    ref,
    cwd,
    gateOpts
  );

  const merged = readFileSync(join(cwd, '.azuredevops/PULL_REQUEST_TEMPLATE.md'), 'utf8');
  assert.ok(merged.startsWith(HUMAN_TEMPLATE.trimEnd()), 'the human template must survive verbatim');
  assert.match(merged, /## Launch readiness/);
  assert.ok(result.files.includes('.azuredevops/PULL_REQUEST_TEMPLATE.md'));
  assert.equal(
    readdirSync(join(cwd, '.azuredevops')).filter((n) => n.toLowerCase() === 'pull_request_template.md')
      .length,
    1
  );
});

test('a pull_request_template directory is never mistaken for the template and is left alone', async () => {
  const cwd = tmp();
  mkdirSync(join(cwd, '.azuredevops/pull_request_template'), { recursive: true });
  writeFileSync(join(cwd, '.azuredevops/pull_request_template/bugfix.md'), HUMAN_TEMPLATE);

  const result = await createAzureInstall(fakeAzure(registrationRoutes), gitFor).installGate(
    ref,
    cwd,
    gateOpts
  );

  assert.equal(
    readFileSync(join(cwd, '.azuredevops/pull_request_template/bugfix.md'), 'utf8'),
    HUMAN_TEMPLATE
  );
  assert.equal(templateAt(cwd), PACKAGED_TEMPLATE);
  assert.ok(result.files.includes('.azuredevops/pull_request_template.md'));
});

test('the greenfield template is written with the gated sections inside the markers', () => {
  const block = PACKAGED_TEMPLATE.slice(
    PACKAGED_TEMPLATE.indexOf(BEGIN),
    PACKAGED_TEMPLATE.indexOf(END) + END.length
  );
  assert.ok(PACKAGED_TEMPLATE.includes(BEGIN) && PACKAGED_TEMPLATE.includes(END));
  assert.match(block, /## Launch readiness/);
  assert.match(block, /## Architecture decision/);
  for (const outside of ['# Summary', '## Change type', '## Automated review']) {
    assert.ok(!block.includes(outside), `${outside} is the team's to edit and belongs outside the block`);
  }
});

test('Redline updates its own block in a template it wrote, and keeps what the team added around it', async () => {
  const cwd = tmp();
  const install = createAzureInstall(fakeAzure(registrationRoutes), gitFor);
  await install.installGate(ref, cwd, gateOpts);
  seedTemplate(
    cwd,
    templateAt(cwd)
      .replace(/- \[ \] No unrelated changes in the diff/, '- [ ] hand-edited inside the block')
      .replace(/## Automated review/, '## Our own section\n\n- [ ] our item\n\n## Automated review')
  );

  const result = await install.installGate(ref, cwd, gateOpts);
  const after = templateAt(cwd);

  assert.match(after, /- \[ \] No unrelated changes in the diff/, 'the block is Redline-owned and restored');
  assert.ok(!after.includes('hand-edited inside the block'));
  assert.match(after, /## Our own section/, 'content outside the block is the team\'s and survives');
  assert.match(after, /- \[ \] our item/);
  assert.ok(result.files.includes('.azuredevops/pull_request_template.md'));
});
