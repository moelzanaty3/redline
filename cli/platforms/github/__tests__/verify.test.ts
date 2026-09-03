import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGitHubVerify } from '../verify.ts';
import { createGitHubPlatform } from '../index.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import { REQUIRED_CHECK } from '../install.ts';
import { isPending, type RepoRef } from '../../types.ts';

const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web', defaultBranch: 'main' };

test('readPolicy maps a blocking ruleset back to a MergePolicy', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: {
        rules: [
          {
            type: 'pull_request',
            parameters: {
              required_approving_review_count: 2,
              dismiss_stale_reviews_on_push: true,
              require_code_owner_review: true,
              required_review_thread_resolution: true,
            },
          },
          {
            type: 'required_status_checks',
            parameters: { required_status_checks: [{ context: REQUIRED_CHECK }] },
          },
        ],
      },
    },
  });

  const policy = await createGitHubVerify(client).readPolicy(ref);
  assert.equal(policy?.requiredApprovals, 2);
  assert.equal(policy?.blocking, true);
  assert.deepEqual(policy?.requiredChecks, [REQUIRED_CHECK]);
});

test('a ruleset with no status-check rule reads back as advisory', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: { rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 1 } }] },
    },
  });
  const policy = await createGitHubVerify(client).readPolicy(ref);
  assert.equal(policy?.blocking, false);
  assert.deepEqual(policy?.requiredChecks, []);
});

test('no Redline ruleset reads back as null, not as an empty policy', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  assert.equal(await createGitHubVerify(client).readPolicy(ref), null);
});

test('a required_status_checks rule with a non-array value is a host-shape error, not an empty policy', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: {
        rules: [{ type: 'required_status_checks', parameters: { required_status_checks: 'oops' } }],
      },
    },
  });
  await assert.rejects(
    createGitHubVerify(client).readPolicy(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('readReportedCheckNames resolves the head sha then lists check runs', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/pulls/12': { status: 200, body: { head: { sha: 'abc123' } } },
    'GET /repos/acme/web/commits/abc123/check-runs?per_page=100': {
      status: 200,
      body: { check_runs: [{ name: 'redline-gate / gate' }, { name: 'build' }] },
    },
  });
  const names = await createGitHubVerify(client).readReportedCheckNames(ref, 12);
  assert.deepEqual(names.sort(), ['build', 'redline-gate / gate']);
});

// This is the failure that matters: if the caller job or the aggregate job in
// workflows/redline-gate.yml is ever renamed, the reported context drifts away
// from `redline-gate / gate` and a required-status-check branch rule becomes
// unsatisfiable — every PR in the repo sits blocked forever, silently. This
// method's whole job is to expose that drift as-is, not to mask it.
test('readReportedCheckNames returns the raw names even when the required check is not among them', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/pulls/12': { status: 200, body: { head: { sha: 'def456' } } },
    'GET /repos/acme/web/commits/def456/check-runs?per_page=100': {
      status: 200,
      body: { check_runs: [{ name: 'redline-check / gate' }, { name: 'build' }] },
    },
  });
  const names = await createGitHubVerify(client).readReportedCheckNames(ref, 12);
  assert.deepEqual(names.sort(), ['build', 'redline-check / gate']);
  assert.ok(
    !names.includes(REQUIRED_CHECK),
    'a renamed caller/aggregate job must not silently satisfy the required check'
  );
});

test('a check run reported without a name is a host-shape error, not a silently dropped entry', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/pulls/12': { status: 200, body: { head: { sha: 'abc123' } } },
    'GET /repos/acme/web/commits/abc123/check-runs?per_page=100': {
      status: 200,
      body: { check_runs: [{}] },
    },
  });
  await assert.rejects(
    createGitHubVerify(client).readReportedCheckNames(ref, 12),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('readSecurityState reports each capability from security_and_analysis', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': {
      status: 200,
      body: {
        security_and_analysis: {
          secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'disabled' },
        },
      },
    },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);
  assert.equal(state.outcomes.find((o) => o.capability === 'secret-scanning')?.status, 'applied');
  assert.equal(state.outcomes.find((o) => o.capability === 'push-protection')?.status, 'denied');
});

// A 404 (typo'd repo, deleted repo, insufficient token scope) must not read as
// "both capabilities are off" — `denied` is exactly the status that files
// pending-admin work, so a transient host error would send an administrator
// looking for a problem that does not exist.
test('readSecurityState surfaces a non-2xx response as a host error, not as capabilities being denied', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': {
      status: 404,
      body: { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' },
    },
  });
  await assert.rejects(
    createGitHubVerify(client).readSecurityState(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('readSecurityState rejects a malformed (non-object) repository body instead of reading it as "nothing enabled"', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web': { status: 200, body: [] } });
  await assert.rejects(
    createGitHubVerify(client).readSecurityState(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

test('latestPullRequestNumber returns null on a repo with no pull requests', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/pulls?state=all&per_page=1': { status: 200, body: [] },
  });
  assert.equal(await createGitHubVerify(client).latestPullRequestNumber(ref), null);
});

test('repoRef derives org, repo and default branch from the remote plus one api call', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { default_branch: 'trunk' } },
  });
  const gitFor: (cwd: string) => ReturnType<typeof createGit> = (cwd) => {
    const run: GitRunner = (args) =>
      args[0] === 'remote' ? 'git@github.com:acme/web.git' : args[0] === 'rev-parse' ? 'true' : '';
    return createGit(cwd, run);
  };
  const platform = createGitHubPlatform({ client, gitFor });
  assert.deepEqual(await platform.repoRef('/anywhere'), {
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'trunk',
  });
  assert.equal(platform.host, 'github');
});

// A typo'd remote, a deleted repository, or a token missing a scope must not
// silently resolve to defaultBranch: 'main' — every install and verify call
// depends on this RepoRef, so masking the failure sends everything downstream
// against a branch that may not exist.
test('repoRef surfaces a non-2xx response as a host error instead of defaulting to "main"', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': {
      status: 404,
      body: { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' },
    },
  });
  const gitFor: (cwd: string) => ReturnType<typeof createGit> = (cwd) => {
    const run: GitRunner = (args) =>
      args[0] === 'remote' ? 'git@github.com:acme/web.git' : args[0] === 'rev-parse' ? 'true' : '';
    return createGit(cwd, run);
  };
  const platform = createGitHubPlatform({ client, gitFor });
  await assert.rejects(
    platform.repoRef('/anywhere'),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

// "token lacks scope" and "GitHub is down" must exit differently (3 vs 4) so
// CI can tell an operator problem from a host problem.
test('repoRef maps a 401/403 to a permission error with a token hint, not a host error', async () => {
  for (const status of [401, 403]) {
    const client = fakeGitHubClient({
      'GET /repos/acme/web': { status, body: { message: 'Forbidden' } },
    });
    const gitFor: (cwd: string) => ReturnType<typeof createGit> = (cwd) => {
      const run: GitRunner = (args) =>
        args[0] === 'remote' ? 'git@github.com:acme/web.git' : args[0] === 'rev-parse' ? 'true' : '';
      return createGit(cwd, run);
    };
    await assert.rejects(
      createGitHubPlatform({ client, gitFor }).repoRef('/anywhere'),
      (err: unknown) =>
        isRedlineError(err) &&
        err.kind === 'permission' &&
        err.exitCode === 3 &&
        /GH_TOKEN/.test(err.hint ?? '')
    );
  }
});

// A 403 on the rulesets list used to be parsed as a body and reported as
// "GitHub returned an unexpected shape", sending the operator after a host
// bug when the real problem is a token scope.
test('a 403 on a verify read is reported as an HTTP status, not a shape error', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 403, body: { message: 'Forbidden' } },
    'GET /repos/acme/web/pulls?state=all&per_page=1': { status: 403, body: { message: 'Forbidden' } },
  });
  const verify = createGitHubVerify(client);
  for (const call of [() => verify.readPolicy(ref), () => verify.latestPullRequestNumber(ref)]) {
    await assert.rejects(
      call,
      (err: unknown) => isRedlineError(err) && err.kind === 'host' && err.message.includes('HTTP 403'),
    );
  }
});

// GitHub omits `security_and_analysis` entirely for a requester without admin
// permission. "This token cannot see it" is not "it is off": `denied` is the
// status that files pending-admin work and rewrites `.redline.json`, so
// reading an invisible setting as a refusal let a write-but-not-admin re-run
// overwrite a correct record with a false one.
test('a security block the token cannot see reads as unsupported, never as denied', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { name: 'web', default_branch: 'main' } },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);

  assert.deepEqual(
    state.outcomes.filter((o) => o.capability !== 'dependency-alerts').map((o) => o.status),
    ['unsupported', 'unsupported']
  );
  assert.ok(!state.outcomes.some(isPending), 'an unobservable setting must never become pending admin work');
  assert.match(state.outcomes[0]?.detail ?? '', /not visible/);
});

test('a security block that is present but off still reads as denied', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': {
      status: 200,
      body: { security_and_analysis: { secret_scanning: { status: 'disabled' } } },
    },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);
  assert.equal(state.outcomes.find((o) => o.capability === 'secret-scanning')?.status, 'denied');
});

// `dependency-alerts` had no read-back at all, so a repository whose alerts an
// administrator switched off after onboarding verified clean, and a
// `dependency-alerts` entry recorded in `.redline.json` could never clear.
test('dependency alerts GitHub reports as off read back as denied', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { security_and_analysis: {} } },
    'GET /repos/acme/web/vulnerability-alerts': { status: 404, body: { message: 'Not Found' } },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);
  const alerts = state.outcomes.find((o) => o.capability === 'dependency-alerts');
  assert.equal(alerts?.status, 'denied');
});

test('dependency alerts GitHub reports as on read back as applied', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { security_and_analysis: {} } },
    'GET /repos/acme/web/vulnerability-alerts': { status: 204 },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);
  assert.equal(state.outcomes.find((o) => o.capability === 'dependency-alerts')?.status, 'applied');
});

// An indeterminate read is not an answer: a token refused the endpoint has
// learned nothing about the repository, and `denied` is the status that files
// work against an administrator.
test('a token refused the vulnerability-alerts endpoint leaves dependency alerts unobserved, not denied', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { security_and_analysis: {} } },
    'GET /repos/acme/web/vulnerability-alerts': { status: 403, body: { message: 'Forbidden' } },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);
  const alerts = state.outcomes.find((o) => o.capability === 'dependency-alerts');
  assert.equal(alerts?.status, 'unsupported');
  assert.ok(alerts !== undefined && !isPending(alerts));
});

test('a 500 from the vulnerability-alerts endpoint is a host error, not a disabled capability', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { security_and_analysis: {} } },
    'GET /repos/acme/web/vulnerability-alerts': { status: 500, body: { message: 'server error' } },
  });
  await assert.rejects(
    createGitHubVerify(client).readSecurityState(ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

// --- the gate machinery on disk --------------------------------------------

// The required check name is built from the caller job id plus the aggregate
// job id in the reusable workflow, which is why templates/redline.yml carries
// a DO NOT RENAME THE JOB warning. Reading the installed file back is the only
// local evidence that distinguishes "the gate has not run yet" from "nothing
// will ever run it".
const CALLER = [
  'name: Redline',
  'on:',
  '  pull_request:',
  'jobs:',
  '  redline-gate:',
  '    uses: acme/.github/.github/workflows/redline-gate.yml@main',
  '    with:',
  '      adr-diff-threshold: 300',
  '',
].join('\n');

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-gate-'));
  gateDirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

const gateDirs: string[] = [];
after(() => {
  for (const dir of gateDirs) rmSync(dir, { recursive: true, force: true });
});

test('readGateMachinery names the check the installed caller workflow would publish', () => {
  const cwd = repoWith({ '.github/workflows/redline.yml': CALLER });
  const machinery = createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd);
  assert.equal(machinery.present, true);
  assert.equal(machinery.publishes, REQUIRED_CHECK);
});

test('a caller workflow whose job was renamed reports the check it would actually publish', () => {
  const cwd = repoWith({ '.github/workflows/redline.yml': CALLER.replace('redline-gate:', 'ci-gate:') });
  const machinery = createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd);
  assert.equal(machinery.publishes, 'ci-gate / gate');
});

test('a deleted caller workflow reports absent, not a renamed job', () => {
  const cwd = repoWith({ 'README.md': '# web\n' });
  const machinery = createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd);
  assert.equal(machinery.present, false);
  assert.equal(machinery.publishes, null);
  assert.equal(machinery.path, '.github/workflows/redline.yml');
});

test('a caller workflow that no longer calls the reusable gate publishes nothing', () => {
  const cwd = repoWith({
    '.github/workflows/redline.yml': CALLER.replace(/uses: .*/, 'runs-on: ubuntu-latest'),
  });
  assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).publishes, null);
});

// The cheapest loosening available on GitHub: flip the ruleset to Disabled or
// Evaluate in the UI and every rule Redline installed stops applying, while
// every field this adapter reads back stays identical.
test('a ruleset switched out of active enforcement is reported as not in force', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: {
        enforcement: 'evaluate',
        rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 1 } }],
      },
    },
  });
  const policy = await createGitHubVerify(client).readPolicy(ref);
  assert.match(policy?.notEnforcedReason ?? '', /evaluate/);

  const active = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: { enforcement: 'active', rules: [{ type: 'pull_request', parameters: {} }] },
    },
  });
  assert.equal(
    (await createGitHubVerify(active).readPolicy(ref))?.notEnforcedReason,
    undefined,
    'an active ruleset is in force and must carry no reason'
  );
});

// --- the caller scan must know what a jobs: block is ------------------------

// Every form below is legal YAML that GitHub Actions accepts and that really
// does publish `redline-gate / gate`. The line scan used to take the last
// two-space key it had seen, which in this file is `  pull_request:` from the
// `on:` block — so each of these failed the gate with a message naming a job
// that exists nowhere, about a job id that was already correct.
const CALLER_FORMS: Record<string, string> = {
  'an inline comment on the job-id line': CALLER.replace(
    '  redline-gate:',
    '  redline-gate: # DO NOT RENAME'
  ),
  'a double-quoted job id': CALLER.replace('  redline-gate:', '  "redline-gate":'),
  'a single-quoted job id': CALLER.replace('  redline-gate:', "  'redline-gate':"),
  'a four-space indented job id': CALLER.replace('  redline-gate:', '    redline-gate:').replace(
    '    uses:',
    '      uses:'
  ),
  'a tab-indented job id': CALLER.replace('  redline-gate:', '\tredline-gate:'),
  'an anchor on the job id': CALLER.replace('  redline-gate:', '  redline-gate: &gate'),
};

for (const [form, body] of Object.entries(CALLER_FORMS)) {
  test(`${form} still reports the job id it actually declares`, () => {
    const cwd = repoWith({ '.github/workflows/redline.yml': body });
    assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).publishes, REQUIRED_CHECK);
  });
}

// Every CALLER_FORMS fixture above puts `uses:` immediately after the job-id
// line, so callerJobId returns before its job-id-column guard
// (`if (indent === jobIdIndent) jobId = name;`) is ever tested against a
// competing key — the guard could be deleted and every test above would still
// pass. Real caller workflows routinely put other keys in the job body first
// (`needs:`, `runs-on:`, `permissions:`, a `with:` block), one of them nested
// deeper than the job id itself. Without the column check, the scan would
// keep overwriting jobId with each of those keys in turn and report the last
// one seen before `uses:` — here `adr-diff-threshold` — instead of the job id.
const CALLER_WITH_JOB_BODY_KEYS = [
  'name: Redline',
  'on:',
  '  pull_request:',
  'jobs:',
  '  redline-gate:',
  '    needs: []',
  '    runs-on: ubuntu-latest',
  '    permissions:',
  '      contents: read',
  '    with:',
  '      adr-diff-threshold: 300',
  '    uses: acme/.github/.github/workflows/redline-gate.yml@main',
  '',
].join('\n');

test('a job body with runs-on, permissions and a with: block before uses: still reports the job id, not a nested key', () => {
  const cwd = repoWith({ '.github/workflows/redline.yml': CALLER_WITH_JOB_BODY_KEYS });
  assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).publishes, REQUIRED_CHECK);
});

// A key from anywhere else in the file is never a job id.
test('a workflow with no jobs block reports no job rather than a key from another block', () => {
  const cwd = repoWith({
    '.github/workflows/redline.yml': [
      'name: Redline',
      'on:',
      '  pull_request:',
      'steps:',
      '  - uses: acme/.github/.github/workflows/redline-gate.yml@main',
      '',
    ].join('\n'),
  });
  assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).publishes, null);
});

// A gate workflow nothing triggers publishes nothing, however correctly its
// job is named — and the ruleset still requires the check it will never send.
test('a caller workflow no longer triggered by pull requests publishes nothing', () => {
  const cwd = repoWith({
    '.github/workflows/redline.yml': CALLER.replace('  pull_request:', '  workflow_dispatch:'),
  });
  assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).publishes, null);
});

test('a workflow triggered by pull_request in list form still publishes', () => {
  const cwd = repoWith({
    '.github/workflows/redline.yml': CALLER.replace('on:\n  pull_request:', 'on: [pull_request]'),
  });
  assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).publishes, REQUIRED_CHECK);
});

test('readGateMachinery names the check a correctly installed gate publishes', () => {
  const cwd = repoWith({ '.github/workflows/redline.yml': CALLER });
  assert.equal(createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd).expected, REQUIRED_CHECK);
});

// A local read that cannot be completed is a finding about this repository,
// not an internal defect: unguarded, EACCES/EISDIR escaped verify() as
// "redline failed unexpectedly" with the host exit code.
test('a gate workflow that cannot be read fails as a Redline error, not an unexpected crash', () => {
  const cwd = repoWith({ '.github/workflows/redline.yml/keep': 'a directory sits where the file should' });
  assert.throws(
    () => createGitHubVerify(fakeGitHubClient()).readGateMachinery(cwd),
    (error: unknown) => isRedlineError(error) && error.kind === 'failed'
  );
});
