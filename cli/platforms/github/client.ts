import { execFileSync } from 'node:child_process';
import { RedlineError } from '../../core/errors.ts';
import { createHttp, type FetchLike, type HttpResponse } from '../http.ts';

export interface GitHubClientOptions {
  token?: string;
  // Hostname of the `origin` remote. Absent means github.com, which is what a
  // caller that has no remote in hand (a test, a fixture) should get.
  hostname?: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface GitHubClient {
  rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  // Where a human goes, as opposed to where the API lives. Derived from the
  // same hostname as the API base and exposed for the same reason: a settings
  // link assembled anywhere else would say github.com to somebody on an
  // Enterprise Server instance, and a link to the wrong host is worse than no
  // link — it looks authoritative and goes nowhere they can act.
  readonly webBaseUrl: string;
}

const DOT_COM = 'github.com';

// GitHub Enterprise Server serves its REST API under /api/v3 on the same
// origin that hosts the repository, so the remote hostname is all it takes to
// address the right instance. Deriving it removes the step nobody knew they
// had to take: before this, an Enterprise remote was queried against
// api.github.com, where the repository does not exist, and the 404 that came
// back read as "no such repository" rather than "wrong API".
//
// GITHUB_API_URL still wins. It is what GitHub Actions sets on every runner,
// and an operator who exports it has stated something the remote cannot.
export function gitHubWebBaseUrl(hostname?: string): string {
  return `https://${hostname ?? DOT_COM}`;
}

export function gitHubApiBaseUrl(env: NodeJS.ProcessEnv, hostname?: string): string {
  const override = env['GITHUB_API_URL'];
  if (override) return override;
  if (hostname === undefined || hostname === DOT_COM) return 'https://api.github.com';
  return `https://${hostname}/api/v3`;
}

const readGhTokenFromCli = (hostname?: string): string =>
  execFileSync('gh', ['auth', 'token', ...(hostname === undefined ? [] : ['--hostname', hostname])], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

export function resolveGitHubToken(
  env: NodeJS.ProcessEnv,
  readGhToken: (hostname?: string) => string = readGhTokenFromCli,
  hostname?: string
): string {
  const fromEnv = env['GH_TOKEN'] ?? env['GITHUB_TOKEN'];
  if (fromEnv) return fromEnv;
  try {
    // Asked for BY HOSTNAME. `gh auth token` with no --hostname answers for
    // gh's default host, so someone logged into both github.com and an
    // Enterprise instance got their github.com token sent to the Enterprise
    // API — authentication that fails as a 404, because a token that cannot
    // see a repository and a repository that does not exist look identical.
    const token = readGhToken(hostname);
    if (token) return token;
  } catch {
    // fall through to the error below
  }
  const where = hostname === undefined ? '' : ` for ${hostname}`;
  throw new RedlineError(
    'permission',
    `no GitHub credentials found${where} — run: gh auth login, or set GH_TOKEN`,
    hostname === undefined || hostname === DOT_COM
      ? 'run: gh auth login — or set GH_TOKEN'
      : `run: gh auth login --hostname ${hostname} — or set GH_TOKEN`
  );
}

export function createGitHubClient(opts: GitHubClientOptions = {}): GitHubClient {
  const env = opts.env ?? process.env;
  const token = opts.token ?? resolveGitHubToken(env, readGhTokenFromCli, opts.hostname);
  const baseUrl = gitHubApiBaseUrl(env, opts.hostname);
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'redlinegate',
  };
  const httpOptions = {
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  };
  const http = createHttp(baseUrl, headers, httpOptions);
  const graphqlUrl = `${baseUrl.replace(/\/api\/v3$/, '/api')}/graphql`;

  return {
    webBaseUrl: gitHubWebBaseUrl(opts.hostname),
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
