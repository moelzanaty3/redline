import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openOrUpdatePullRequest, pushRemoteFiles } from '../push.ts';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { isRedlineError } from '../../../core/errors.ts';
import type { RepoRef } from '../../types.ts';

const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web-app', defaultBranch: 'main' };
const base = '/repos/acme/web-app';

const routes = (over: Record<string, { status: number; body?: unknown }> = {}) => ({
  [`GET ${base}/git/ref/heads/main`]: { status: 200, body: { object: { sha: 'BASE' } } },
  [`GET ${base}/git/commits/BASE`]: { status: 200, body: { tree: { sha: 'BASETREE' } } },
  [`POST ${base}/git/trees`]: { status: 201, body: { sha: 'NEWTREE' } },
  [`POST ${base}/git/commits`]: { status: 201, body: { sha: 'NEWCOMMIT' } },
  [`POST ${base}/git/refs`]: { status: 201, body: {} },
  ...over,
});

const push = { branch: 'redline/sync', message: 'sync', files: [{ path: 'AGENTS.md', content: '# x' }] };

test('builds a tree, commits it and creates the branch', async () => {
  const client = fakeGitHubClient(routes());

  const result = await pushRemoteFiles(client, ref, push);

  assert.equal(result.commit, 'NEWCOMMIT');
  const tree = client.calls.find((c) => c.path === `${base}/git/trees`);
  assert.deepEqual((tree?.body as { tree: unknown[] }).tree, [
    { path: 'AGENTS.md', mode: '100644', type: 'blob', content: '# x' },
  ]);
  const created = client.calls.find((c) => c.path === `${base}/git/refs`);
  assert.equal((created?.body as { ref: string }).ref, 'refs/heads/redline/sync');
});

test('an unchanged tree commits nothing rather than opening an empty pull request', async () => {
  // The target already carries exactly what this run would push. Without this,
  // every scheduled run would open a no-op pull request on every current repo.
  const client = fakeGitHubClient(routes({ [`POST ${base}/git/trees`]: { status: 201, body: { sha: 'BASETREE' } } }));

  const result = await pushRemoteFiles(client, ref, push);

  assert.equal(result.commit, null);
  assert.equal(
    client.calls.some((c) => c.path === `${base}/git/commits` && c.method === 'POST'),
    false
  );
});

test('a branch left by a previous run is moved onto the new commit', async () => {
  const client = fakeGitHubClient(routes({ [`POST ${base}/git/refs`]: { status: 422 } }));

  await pushRemoteFiles(client, ref, push);

  const patched = client.calls.find((c) => c.path === `${base}/git/refs/heads/redline/sync`);
  assert.equal(patched?.method, 'PATCH');
  assert.deepEqual(patched?.body, { sha: 'NEWCOMMIT', force: true });
});

test('the branch is always rebuilt from the default branch, never from itself', async () => {
  // A sync branch left over from a previous standards version must not carry
  // its old changes forward: the base read is heads/main, not heads/the branch.
  const client = fakeGitHubClient(routes());

  await pushRemoteFiles(client, ref, push);

  assert.equal(client.calls[0]?.path, `${base}/git/ref/heads/main`);
});

test('a host failure reading the base is a host error, not a silent skip', async () => {
  const client = fakeGitHubClient(routes({ [`GET ${base}/git/ref/heads/main`]: { status: 403 } }));

  await assert.rejects(
    () => pushRemoteFiles(client, ref, push),
    (err: unknown) => isRedlineError(err) && err.kind === 'host'
  );
});

const pr = { branch: 'redline/sync', title: 'Redline: standards v0.0.2', body: 'body', labels: ['redline-sync'] };

test('opens a pull request and applies its labels', async () => {
  const client = fakeGitHubClient({
    [`GET ${base}/pulls?state=open&head=acme:redline/sync`]: { status: 200, body: [] },
    [`POST ${base}/pulls`]: { status: 201, body: { number: 7, html_url: 'https://x/7' } },
  });

  const result = await openOrUpdatePullRequest(client, ref, pr);

  assert.deepEqual(result, { number: 7, url: 'https://x/7', created: true });
  const labelled = client.calls.find((c) => c.path === `${base}/issues/7/labels`);
  assert.deepEqual(labelled?.body, { labels: ['redline-sync'] });
});

test('an open pull request for the branch is updated, never duplicated', async () => {
  const client = fakeGitHubClient({
    [`GET ${base}/pulls?state=open&head=acme:redline/sync`]: {
      status: 200,
      body: [{ number: 4, html_url: 'https://x/4' }],
    },
  });

  const result = await openOrUpdatePullRequest(client, ref, pr);

  assert.deepEqual(result, { number: 4, url: 'https://x/4', created: false });
  assert.equal(client.calls.some((c) => c.method === 'POST' && c.path === `${base}/pulls`), false);
  const patched = client.calls.find((c) => c.path === `${base}/pulls/4`);
  assert.equal((patched?.body as { title: string }).title, 'Redline: standards v0.0.2');
});
