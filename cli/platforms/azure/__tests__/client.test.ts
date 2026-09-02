import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAzureClient, resolveAzureCredential } from '../client.ts';
import type { FetchLike } from '../../http.ts';

test('a PAT becomes basic auth with an empty username', () => {
  const cred = resolveAzureCredential({ AZURE_DEVOPS_EXT_PAT: 'secret-pat' });
  assert.equal(cred.scheme, 'Basic');
  assert.equal(Buffer.from(cred.value, 'base64').toString('utf8'), ':secret-pat');
});

test('a pipeline system access token becomes bearer auth', () => {
  const cred = resolveAzureCredential({ SYSTEM_ACCESSTOKEN: 'pipeline-token' });
  assert.deepEqual(cred, { scheme: 'Bearer', value: 'pipeline-token' });
});

test('the PAT wins over the pipeline token', () => {
  const cred = resolveAzureCredential({ AZURE_DEVOPS_EXT_PAT: 'pat', SYSTEM_ACCESSTOKEN: 'sys' });
  assert.equal(cred.scheme, 'Basic');
});

test('falling back to az yields a bearer token', () => {
  assert.deepEqual(resolveAzureCredential({}, () => 'az-token'), {
    scheme: 'Bearer',
    value: 'az-token',
  });
});

test('no credential at all is a permission error naming both options', () => {
  assert.throws(
    () =>
      resolveAzureCredential({}, () => {
        throw new Error('az not installed');
      }),
    /AZURE_DEVOPS_EXT_PAT|az login/
  );
});

test('the az-not-installed failure is never echoed into the thrown error', () => {
  try {
    resolveAzureCredential({}, () => {
      throw new Error('az not installed at /usr/local/bin/az, exit code 127');
    });
    assert.fail('expected resolveAzureCredential to throw');
  } catch (err) {
    assert.match(String(err), /AZURE_DEVOPS_EXT_PAT|az login/);
    assert.doesNotMatch(String(err), /not installed/);
    assert.doesNotMatch(String(err), /exit code 127/);
  }
});

test('every request carries the api-version and the org in the path', async () => {
  const seen: Request[] = [];
  const fetch: FetchLike = async (input, init) => {
    seen.push(new Request(input, init));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  await client.request('GET', '/Payments/_apis/git/repositories/web');
  assert.equal(
    seen[0]?.url,
    'https://dev.azure.com/acme/Payments/_apis/git/repositories/web?api-version=7.1'
  );
  assert.equal(seen[0]?.headers.get('authorization'), 'Bearer tok');
});

test('an existing query string gets the api-version appended with an ampersand', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  await client.request('GET', '/_apis/policy/configurations?scope=x');
  assert.equal(seen[0], 'https://dev.azure.com/acme/_apis/policy/configurations?scope=x&api-version=7.1');
});

test('the advsec host is used for advanced security calls', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  await client.request('PATCH', '/Payments/_apis/management/repositories/web/enablement', {}, {
    host: 'advsec',
    apiVersion: '7.2-preview.1',
  });
  assert.equal(
    seen[0],
    'https://advsec.dev.azure.com/acme/Payments/_apis/management/repositories/web/enablement?api-version=7.2-preview.1'
  );
});

test('a non-2xx Azure error body is returned intact with its status, not thrown or swallowed', async () => {
  // Realistic Azure DevOps error shape: a truthy object, never an array — a
  // caller that does `(res.body ?? []).find(...)` gets a TypeError here, and
  // a caller that does `if (!res.body)` treats this as success. The client
  // must hand back both the status and the body so the caller checks status
  // explicitly before trusting the body.
  const errorBody = {
    $id: '1',
    innerException: null,
    message: 'TF401019: The Git repository with name or identifier web does not exist.',
    typeName: 'Microsoft.TeamFoundation.Git.Server.GitRepositoryNotFoundException, Microsoft.TeamFoundation.Git.Server',
    typeKey: 'GitRepositoryNotFoundException',
    errorCode: 0,
    eventId: 3000,
  };
  const fetch: FetchLike = async () =>
    new Response(JSON.stringify(errorBody), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  const res = await client.request<{ message: string }>(
    'GET',
    '/Payments/_apis/git/repositories/missing'
  );
  assert.equal(res.status, 404);
  assert.equal(Array.isArray(res.body), false);
  assert.equal(res.body?.message, errorBody.message);
});
