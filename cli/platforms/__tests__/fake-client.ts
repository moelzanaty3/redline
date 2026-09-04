import type { HttpResponse } from '../http.ts';
import type { GitHubClient } from '../github/client.ts';

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeClient extends GitHubClient {
  calls: RecordedCall[];
}

export interface RouteResponse {
  status: number;
  body?: unknown;
}

function pickResponse(
  route: RouteResponse | RouteResponse[] | undefined,
  key: string,
  cursor: Record<string, number>
): RouteResponse {
  if (route === undefined) return { status: 200, body: {} };
  if (!Array.isArray(route)) return route;
  const index = cursor[key] ?? 0;
  cursor[key] = index + 1;
  return route[Math.min(index, route.length - 1)] ?? { status: 200, body: {} };
}

/**
 * Scripted GitHub client. `routes` maps "METHOD /path" to a status and body.
 * An unlisted route answers 200 with an empty object, so a test only declares
 * the calls it actually cares about.
 *
 * A route may also be an array of responses, consumed in order across repeated
 * calls to the same "METHOD /path" — the last entry repeats once exhausted.
 * This is for endpoints called more than once with the same path (e.g. the
 * three label-creation POSTs in installGate) where a test needs to script a
 * different status per call.
 */
export function fakeGitHubClient(
  routes: Record<string, RouteResponse | RouteResponse[]> = {}
): FakeClient {
  const calls: RecordedCall[] = [];
  const cursor: Record<string, number> = {};
  return {
    calls,
    async rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      calls.push({ method, path, body });
      const key = `${method} ${path}`;
      const response = pickResponse(routes[key], key, cursor);
      return { status: response.status, body: (response.body ?? null) as T | null };
    },
    async graphql<T>(): Promise<T> {
      throw new Error('graphql not used by these tests');
    },
  };
}
