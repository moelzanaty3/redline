import { RedlineError } from '../core/errors.ts';

export type FetchLike = typeof globalThis.fetch;

export interface HttpResponse<T> {
  status: number;
  body: T | null;
}

export interface HttpOptions {
  fetch?: FetchLike;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Http {
  request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>;
}

const RETRYABLE = (status: number): boolean => status === 429 || status >= 500;

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createHttp(
  baseUrl: string,
  headers: Record<string, string>,
  opts: HttpOptions = {}
): Http {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;

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
          response = await doFetch(url, init);
        } catch (cause) {
          if (attempt === retries - 1) {
            throw new RedlineError('host', `request to ${url} failed: ${String(cause)}`);
          }
          await sleep(2 ** attempt * 200);
          continue;
        }

        if (RETRYABLE(response.status)) {
          lastStatus = response.status;
          if (attempt === retries - 1) break;
          await sleep(2 ** attempt * 200);
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

      throw new RedlineError('host', `request to ${url} kept returning ${lastStatus}`);
    },
  };
}
