import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, type FetchLike } from '../http.ts';

const noSleep = async (): Promise<void> => {};

function stub(responses: Response[]): { fetch: FetchLike; seen: Request[] } {
  const seen: Request[] = [];
  let i = 0;
  const fetch: FetchLike = async (input, init) => {
    seen.push(new Request(input, init));
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return next.clone();
  };
  return { fetch, seen };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('returns the parsed body and status on success', async () => {
  const { fetch } = stub([json(200, { name: 'web' })]);
  const http = createHttp('https://api.example', { authorization: 'token x' }, { fetch, sleep: noSleep });
  const res = await http.request<{ name: string }>('GET', '/repos/acme/web');
  assert.equal(res.status, 200);
  assert.equal(res.body?.name, 'web');
});

test('sends the configured headers and a JSON body', async () => {
  const { fetch, seen } = stub([json(201, {})]);
  const http = createHttp('https://api.example', { authorization: 'token x' }, { fetch, sleep: noSleep });
  await http.request('POST', '/repos/acme/web/labels', { name: 'no-adr' });
  const req = seen[0]!;
  assert.equal(req.method, 'POST');
  assert.equal(req.url, 'https://api.example/repos/acme/web/labels');
  assert.equal(req.headers.get('authorization'), 'token x');
  assert.equal(req.headers.get('content-type'), 'application/json');
  assert.equal(await req.text(), '{"name":"no-adr"}');
});

test('a 403 is returned, not thrown', async () => {
  const { fetch } = stub([json(403, { message: 'Resource not accessible' })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep });
  const res = await http.request('PUT', '/repos/acme/web/rulesets/1');
  assert.equal(res.status, 403);
});

test('a 204 yields a null body', async () => {
  const { fetch } = stub([new Response(null, { status: 204 })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep });
  const res = await http.request('PUT', '/repos/acme/web/vulnerability-alerts');
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
});

test('retries a 429 and succeeds', async () => {
  const { fetch, seen } = stub([json(429, {}), json(200, { ok: true })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 2 });
  const res = await http.request<{ ok: boolean }>('GET', '/x');
  assert.equal(res.status, 200);
  assert.equal(seen.length, 2);
});

test('an exhausted retry budget on 500 is a host error', async () => {
  const { fetch } = stub([json(500, {})]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 2 });
  await assert.rejects(http.request('GET', '/x'), /500/);
});

test('a transport failure is a host error naming the url', async () => {
  const fetch: FetchLike = async () => {
    throw new TypeError('fetch failed');
  };
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 1 });
  await assert.rejects(http.request('GET', '/x'), /api\.example/);
});
