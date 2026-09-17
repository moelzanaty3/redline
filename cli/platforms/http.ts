import { RedlineError } from '../core/errors.ts';
import { hostHint } from '../core/host-hint.ts';

export type FetchLike = typeof globalThis.fetch;

export interface HttpResponse<T> {
  status: number;
  body: T | null;
}

export interface HttpOptions {
  fetch?: FetchLike;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface Http {
  request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>;
}

const IDEMPOTENT = new Set(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

// 429 is pre-execution (rate limiting), so any method may retry; a 5xx may have
// committed the request server-side, so only idempotent methods retry — a retried
// POST would duplicate the PR/policy it created.
const RETRYABLE = (method: string, status: number): boolean =>
  status === 429 || (status >= 500 && IDEMPOTENT.has(method.toUpperCase()));

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// `Retry-After` in seconds, or GitHub's `x-ratelimit-reset` as an absolute unix
// second. Capped: a header asking for an hour is not something to sit through
// inside a command, and failing with a rate-limit hint beats a process that
// looks hung.
const MAX_RETRY_WAIT_MS = 60_000;

// Per attempt. A connection that never completes — a proxy or firewall that
// drops rather than refuses — otherwise hangs the command, and `sync` across an
// estate looks stuck with nothing to report.
const DEFAULT_TIMEOUT_MS = 30_000;

function retryAfterMs(response: Response, now: number = Date.now()): number | null {
  const after = response.headers.get('retry-after');
  if (after !== null) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
    }
  }
  const reset = response.headers.get('x-ratelimit-reset');
  if (reset !== null) {
    const at = Number(reset);
    if (Number.isFinite(at) && at > 0) {
      const wait = at * 1000 - now;
      if (wait > 0) return Math.min(wait, MAX_RETRY_WAIT_MS);
      // Already past: retry immediately rather than treating a stale header as
      // a reason to wait at all.
      return 0;
    }
  }
  return null;
}

export function createHttp(
  baseUrl: string,
  headers: Record<string, string>,
  opts: HttpOptions = {}
): Http {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
      const init: RequestInit = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = { ...headers, 'content-type': 'application/json' };
      }

      let lastStatus = 0;
      for (let attempt = 0; attempt < retries; attempt += 1) {
        let response: Response;
        try {
          response = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        } catch (cause) {
          const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
          // A timed-out write may still have committed server-side, the same
          // reason a 5xx POST is not retried above.
          if (attempt === retries - 1 || (timedOut && !IDEMPOTENT.has(method.toUpperCase()))) {
            throw new RedlineError(
              'host',
              timedOut
                ? `request to ${url} timed out after ${timeoutMs / 1000}s`
                : `request to ${url} failed: ${String(cause)}`
            );
          }
          await sleep(2 ** attempt * 200);
          continue;
        }

        if (RETRYABLE(method, response.status)) {
          lastStatus = response.status;
          if (attempt === retries - 1) break;
          // Exponential backoff answers a blip; a rate limit is not a blip. A
          // 429 comes with the host's own answer to "how long", and 200ms then
          // 400ms then 800ms against a window that wants sixty seconds burns
          // all three attempts and fails — which is exactly what an estate sync
          // across 200 repositories provokes.
          await sleep(retryAfterMs(response) ?? 2 ** attempt * 200);
          continue;
        }

        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return { status: response.status, body: null };
        }
        const text = await response.text();
        if (text === '') {
          return { status: response.status, body: null };
        }
        try {
          return { status: response.status, body: JSON.parse(text) as T };
        } catch {
          throw new RedlineError(
            'host',
            `request to ${url} returned ${response.status} with a body that was not JSON`
          );
        }
      }

      throw new RedlineError(
        'host',
        `request to ${url} kept returning ${lastStatus}`,
        hostHint(lastStatus)
      );
    },
  };
}
