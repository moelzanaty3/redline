import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, resolveGitHubToken } from '../client.ts';
import type { FetchLike } from '../../http.ts';

test('token precedence is GH_TOKEN, GITHUB_TOKEN, then gh auth token', () => {
  assert.equal(resolveGitHubToken({ GH_TOKEN: 'a', GITHUB_TOKEN: 'b' }, () => 'c'), 'a');
  assert.equal(resolveGitHubToken({ GITHUB_TOKEN: 'b' }, () => 'c'), 'b');
  assert.equal(resolveGitHubToken({}, () => 'c'), 'c');
});

test('no token anywhere is a permission error with an actionable hint', () => {
  assert.throws(
    () =>
      resolveGitHubToken({}, () => {
        throw new Error('gh not installed');
      }),
    /gh auth login/
  );
});

test('rest calls carry the api version and bearer token', async () => {
  const seen: Request[] = [];
  const fetch: FetchLike = async (input, init) => {
    seen.push(new Request(input, init));
    return new Response(JSON.stringify({ default_branch: 'main' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createGitHubClient({ token: 'tok', fetch, sleep: async () => {} });
  const res = await client.rest<{ default_branch: string }>('GET', '/repos/acme/web');
  assert.equal(res.body?.default_branch, 'main');
  const req = seen[0]!;
  assert.equal(req.url, 'https://api.github.com/repos/acme/web');
  assert.equal(req.headers.get('authorization'), 'Bearer tok');
  assert.equal(req.headers.get('x-github-api-version'), '2022-11-28');
  assert.equal(req.headers.get('accept'), 'application/vnd.github+json');
});

test('graphql unwraps data and turns errors into a host failure', async () => {
  const ok: FetchLike = async () =>
    new Response(JSON.stringify({ data: { viewer: { login: 'x' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const client = createGitHubClient({ token: 'tok', fetch: ok, sleep: async () => {} });
  assert.deepEqual(await client.graphql('query{viewer{login}}', {}), { viewer: { login: 'x' } });

  const bad: FetchLike = async () =>
    new Response(JSON.stringify({ errors: [{ message: 'Bad credentials' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const failing = createGitHubClient({ token: 'tok', fetch: bad, sleep: async () => {} });
  await assert.rejects(failing.graphql('query{x}', {}), /Bad credentials/);
});

test('GITHUB_API_URL overrides the base url for enterprise', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createGitHubClient({
    token: 'tok',
    fetch,
    sleep: async () => {},
    env: { GITHUB_API_URL: 'https://github.acme-corp.net/api/v3' },
  });
  await client.rest('GET', '/repos/acme/web');
  assert.equal(seen[0], 'https://github.acme-corp.net/api/v3/repos/acme/web');
});
