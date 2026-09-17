import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, type FetchLike } from '../http.ts';
import { isRedlineError } from '../../core/errors.ts';

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

test('a POST that hits a 502 is not retried and the status surfaces', async () => {
  const { fetch, seen } = stub([json(502, {}), json(201, { ok: true })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 3 });
  const res = await http.request('POST', '/repos/acme/web/pulls', { title: 'x' });
  assert.equal(res.status, 502);
  assert.equal(seen.length, 1);
});

test('a GET that hits a 502 is retried', async () => {
  const { fetch, seen } = stub([json(502, {}), json(200, { ok: true })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 2 });
  const res = await http.request<{ ok: boolean }>('GET', '/x');
  assert.equal(res.status, 200);
  assert.equal(seen.length, 2);
});

test('a POST that hits a 429 is retried', async () => {
  const { fetch, seen } = stub([json(429, {}), json(201, { ok: true })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 2 });
  const res = await http.request('POST', '/repos/acme/web/pulls', { title: 'x' });
  assert.equal(res.status, 201);
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

test('a 200 with a non-JSON body is a host error naming status and url, never the body', async () => {
  // e.g. an SSO/WAF interstitial returning an HTML login page with a 200 status —
  // the ordinary failure mode on a corporate network, not a contrived edge case.
  const interstitial = '<html>session=deadbeef please sign in</html>';
  const { fetch } = stub([
    new Response(interstitial, { status: 200, headers: { 'content-type': 'text/html' } }),
  ]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep });
  await assert.rejects(http.request('GET', '/x'), (err: unknown) => {
    assert.ok(isRedlineError(err));
    assert.equal(err.kind, 'host');
    assert.match(err.message, /200/);
    assert.match(err.message, /api\.example/);
    assert.doesNotMatch(err.message, /session/);
    assert.doesNotMatch(err.message, /deadbeef/);
    return true;
  });
});

// Exponential backoff answers a blip. A rate limit is not a blip: GitHub's
// secondary limit asks for sixty seconds, and 200ms then 400ms then 800ms burns
// all three attempts and fails — which is exactly what an estate sync across
// 200 repositories provokes.
test('a 429 waits as long as the host asked, not the backoff curve', async () => {
  const waits: number[] = [];
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    if (calls === 1) {
      return new Response('{}', { status: 429, headers: { 'retry-after': '30' } });
    }
    return new Response('{"ok":true}', { status: 200 });
  };

  const http = createHttp('https://api.example', {}, {
    fetch: fetch as never,
    sleep: async (ms: number) => { waits.push(ms); },
  });
  const response = await http.request('GET', '/x');

  assert.equal(response.status, 200);
  assert.deepEqual(waits, [30_000]);
});

test('x-ratelimit-reset is honoured when there is no retry-after', async () => {
  const waits: number[] = [];
  let calls = 0;
  const resetAt = Math.floor((Date.now() + 20_000) / 1000);
  const fetch = async (): Promise<Response> => {
    calls += 1;
    if (calls === 1) {
      return new Response('{}', {
        status: 429,
        headers: { 'x-ratelimit-reset': String(resetAt) },
      });
    }
    return new Response('{"ok":true}', { status: 200 });
  };

  const http = createHttp('https://api.example', {}, {
    fetch: fetch as never,
    sleep: async (ms: number) => { waits.push(ms); },
  });
  await http.request('GET', '/x');

  assert.equal(waits.length, 1);
  assert.ok((waits[0] ?? 0) > 15_000 && (waits[0] ?? 0) <= 20_000, `waited ${waits[0]}`);
});

// A header asking for an hour is not something to sit through inside a command:
// a process that looks hung is worse than an error carrying a rate-limit hint.
test('an absurd retry-after is capped rather than obeyed', async () => {
  const waits: number[] = [];
  const fetch = async (): Promise<Response> =>
    new Response('{}', { status: 429, headers: { 'retry-after': '3600' } });

  const http = createHttp('https://api.example', {}, {
    fetch: fetch as never,
    sleep: async (ms: number) => { waits.push(ms); },
    retries: 2,
  });
  await assert.rejects(() => http.request('GET', '/x'));
  assert.deepEqual(waits, [60_000]);
});

test('a stale reset in the past retries at once rather than waiting', async () => {
  const waits: number[] = [];
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    if (calls === 1) {
      return new Response('{}', {
        status: 429,
        headers: { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) - 500) },
      });
    }
    return new Response('{"ok":true}', { status: 200 });
  };

  const http = createHttp('https://api.example', {}, {
    fetch: fetch as never,
    sleep: async (ms: number) => { waits.push(ms); },
  });
  await http.request('GET', '/x');
  assert.deepEqual(waits, [0]);
});

// A 5xx has no Retry-After to read, and the existing curve is the right answer
// for it. This is the regression guard on not applying the new path everywhere.
test('a 5xx still uses exponential backoff', async () => {
  const waits: number[] = [];
  const fetch = async (): Promise<Response> => new Response('{}', { status: 503 });

  const http = createHttp('https://api.example', {}, {
    fetch: fetch as never,
    sleep: async (ms: number) => { waits.push(ms); },
    retries: 3,
  });
  await assert.rejects(() => http.request('GET', '/x'));
  assert.deepEqual(waits, [200, 400]);
});

// A fetch that never settles until its signal fires — the packet-dropping proxy
// that used to hang a command, and an estate sync with it, indefinitely. A real
// socket holds the loop open while it waits; AbortSignal.timeout() uses an
// unref'd timer, so without a ref'd handle here the runner drains the loop and
// cancels the test before the abort ever fires.
const hanging: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    const keepAlive = setInterval(() => {}, 1_000);
    init?.signal?.addEventListener('abort', () => {
      clearInterval(keepAlive);
      reject(init.signal?.reason);
    });
  });

test('a request that never answers times out as a host error', async () => {
  let calls = 0;
  const fetch: FetchLike = (input, init) => {
    calls += 1;
    return hanging(input, init);
  };
  const http = createHttp('https://api.example.com', {}, { fetch, sleep: noSleep, timeoutMs: 5 });

  await assert.rejects(
    () => http.request('GET', '/x'),
    (error: unknown) => isRedlineError(error) && error.kind === 'host' && /timed out/.test(error.message)
  );
  assert.equal(calls, 3, 'an idempotent read is retried after a timeout');
});

// A write that timed out may already have created the pull request or policy.
test('a timed-out POST is not retried', async () => {
  let calls = 0;
  const fetch: FetchLike = (input, init) => {
    calls += 1;
    return hanging(input, init);
  };
  const http = createHttp('https://api.example.com', {}, { fetch, sleep: noSleep, timeoutMs: 5 });

  await assert.rejects(() => http.request('POST', '/x', {}), /timed out/);
  assert.equal(calls, 1);
});
