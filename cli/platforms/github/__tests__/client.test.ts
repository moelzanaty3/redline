import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, gitHubApiBaseUrl, resolveGitHubToken } from '../client.ts';
import type { FetchLike } from '../../http.ts';
import { isRedlineError } from '../../../core/errors.ts';

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

test('an enterprise remote addresses its own instance without any configuration', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createGitHubClient({
    token: 'tok',
    fetch,
    sleep: async () => {},
    hostname: 'github.acme-corp.net',
    env: {},
  });
  await client.rest('GET', '/repos/acme/web');
  assert.equal(seen[0], 'https://github.acme-corp.net/api/v3/repos/acme/web');
});

test('the api base comes from the remote hostname, and GITHUB_API_URL still wins', () => {
  assert.equal(gitHubApiBaseUrl({}, 'github.com'), 'https://api.github.com');
  assert.equal(gitHubApiBaseUrl({}, undefined), 'https://api.github.com');
  assert.equal(gitHubApiBaseUrl({}, 'github.acme-corp.net'), 'https://github.acme-corp.net/api/v3');
  assert.equal(
    gitHubApiBaseUrl({ GITHUB_API_URL: 'https://ghe.example/api/v3' }, 'github.acme-corp.net'),
    'https://ghe.example/api/v3'
  );
});

test('graphql keeps working against an instance derived from the remote', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ data: { viewer: { login: 'x' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createGitHubClient({
    token: 'tok',
    fetch,
    sleep: async () => {},
    hostname: 'github.acme-corp.net',
    env: {},
  });
  await client.graphql('query{viewer{login}}', {});
  assert.equal(seen[0], 'https://github.acme-corp.net/api/graphql');
});

test('the token is asked for by hostname, so a multi-host login sends the right one', () => {
  const asked: (string | undefined)[] = [];
  const read = (hostname?: string): string => {
    asked.push(hostname);
    return hostname === 'github.acme-corp.net' ? 'enterprise-token' : 'dot-com-token';
  };
  assert.equal(resolveGitHubToken({}, read, 'github.acme-corp.net'), 'enterprise-token');
  assert.deepEqual(asked, ['github.acme-corp.net']);
});

test('a missing enterprise credential names the host to log into', () => {
  assert.throws(
    () =>
      resolveGitHubToken(
        {},
        () => {
          throw new Error('no token for that host');
        },
        'github.acme-corp.net'
      ),
    (error: unknown) => {
      assert.ok(isRedlineError(error));
      assert.match(error.message, /github\.acme-corp\.net/);
      assert.match(error.hint ?? '', /gh auth login --hostname github\.acme-corp\.net/);
      return true;
    }
  );
});
