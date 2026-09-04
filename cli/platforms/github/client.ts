import { execFileSync } from 'node:child_process';
import { RedlineError } from '../../core/errors.ts';
import { createHttp, type FetchLike, type HttpResponse } from '../http.ts';

export interface GitHubClientOptions {
  token?: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface GitHubClient {
  rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

const readGhTokenFromCli = (): string =>
  execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function resolveGitHubToken(
  env: NodeJS.ProcessEnv,
  readGhToken: () => string = readGhTokenFromCli
): string {
  const fromEnv = env['GH_TOKEN'] ?? env['GITHUB_TOKEN'];
  if (fromEnv) return fromEnv;
  try {
    const token = readGhToken();
    if (token) return token;
  } catch {
    // fall through to the error below
  }
  throw new RedlineError(
    'permission',
    'no GitHub credentials found — run: gh auth login, or set GH_TOKEN',
    'run: gh auth login — or set GH_TOKEN'
  );
}

export function createGitHubClient(opts: GitHubClientOptions = {}): GitHubClient {
  const env = opts.env ?? process.env;
  const token = opts.token ?? resolveGitHubToken(env);
  const baseUrl = env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'redline-cli',
  };
  const httpOptions = {
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  };
  const http = createHttp(baseUrl, headers, httpOptions);
  const graphqlUrl = `${baseUrl.replace(/\/api\/v3$/, '/api')}/graphql`;

  return {
    rest: (method, path, body) => http.request(method, path, body),
    async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const res = await http.request<{ data?: T; errors?: { message: string }[] }>(
        'POST',
        graphqlUrl,
        { query, variables }
      );
      const errors = res.body?.errors;
      if (errors?.length) {
        throw new RedlineError('host', `GitHub GraphQL: ${errors.map((e) => e.message).join('; ')}`);
      }
      if (!res.body?.data) throw new RedlineError('host', 'GitHub GraphQL returned no data');
      return res.body.data;
    },
  };
}
