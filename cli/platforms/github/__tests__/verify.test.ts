import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGitHubVerify } from '../verify.ts';
import { createGitHubPlatform } from '../index.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { isRedlineError } from '../../../core/errors.ts';
import { REQUIRED_CHECK } from '../install.ts';
import type { RepoRef } from '../../types.ts';

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
