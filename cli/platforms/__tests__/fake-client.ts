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

/**
 * Scripted GitHub client. `routes` maps "METHOD /path" to a status and body.
 * An unlisted route answers 200 with an empty object, so a test only declares
 * the calls it actually cares about.
 */
export function fakeGitHubClient(
  routes: Record<string, { status: number; body?: unknown }> = {}
): FakeClient {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      calls.push({ method, path, body });
      const route = routes[`${method} ${path}`] ?? { status: 200, body: {} };
      return { status: route.status, body: (route.body ?? null) as T | null };
    },
    async graphql<T>(): Promise<T> {
      throw new Error('graphql not used by these tests');
    },
  };
}
