import { createGit, type Git } from '../core/git.ts';
import { RedlineError } from '../core/errors.ts';
import { parseRemote } from './detect.ts';
import { createGitHubClient, type GitHubClient } from './github/client.ts';
import { createGitHubPlatform } from './github/index.ts';
import { createAzureClient, type AzureClient, type AzureRequestOptions } from './azure/client.ts';
import { createAzurePlatform } from './azure/index.ts';
import type { HttpResponse } from './http.ts';
import type { Platform } from './types.ts';

export interface ResolvePlatformOptions {
  // Build the client without resolving a credential, and resolve it on the
  // first host request instead.
  //
  // Only `redline init --dry-run` sets this. A dry run builds a Platform
  // purely to plan against — it derives the repository identity from the
  // local clone (Platform.localRef) and never sends a request — so the eager
  // check below would make a preview demand the one thing the preview exists
  // to avoid: someone evaluating Redline wants to see what it would do to
  // their repository *before* going to get an admin-scoped token.
  //
  // Everything else keeps the fail-fast chokepoint, unchanged and in one
  // place. When a lazy client is eventually used, it throws exactly the error
  // the eager path would have thrown, just later.
  lazyCredentials?: boolean;
}

export interface ResolveDeps extends ResolvePlatformOptions {
  gitFor?: (cwd: string) => Git;
  makeGitHubClient?: () => GitHubClient;
  makeAzureClient?: (org: string) => AzureClient;
}

// One construction per process, success or failure. Memoising the failure
// matters as much as memoising the success: `createGitHubClient()` shells out
// to `gh auth token`, so a client that failed to build would otherwise
// re-spawn it on every single request.
function once<T>(make: () => T): () => T {
  let result: { ok: true; value: T } | { ok: false; error: unknown } | null = null;
  return (): T => {
    if (result === null) {
      try {
        result = { ok: true, value: make() };
      } catch (error) {
        result = { ok: false, error };
      }
    }
    if (!result.ok) throw result.error;
    return result.value;
  };
}

// Deliberately written out per client rather than proxied: `rest`/`request` are
// generic, and a generic proxy cannot forward a type parameter without an
// escape hatch.
function lazyGitHubClient(make: () => GitHubClient): GitHubClient {
  const client = once(make);
  return {
    rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      return client().rest<T>(method, path, body);
    },
    graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      return client().graphql<T>(query, variables);
    },
  };
}

function lazyAzureClient(make: () => AzureClient): AzureClient {
  const client = once(make);
  return {
    request<T>(
      method: string,
      path: string,
      body?: unknown,
      opts?: AzureRequestOptions
    ): Promise<HttpResponse<T>> {
      return client().request<T>(method, path, body, opts);
    },
  };
}

// The one place that turns a working tree into a Platform. Every command
// resolves a platform through this function — no command constructs a
// GitHubClient/AzureClient or a *Platform directly.
export async function resolvePlatform(cwd: string, deps: ResolveDeps = {}): Promise<Platform> {
  const gitFor = deps.gitFor ?? ((dir: string) => createGit(dir));
  const git = gitFor(cwd);
  if (!git.isRepo()) {
    throw new RedlineError('usage', `${cwd} is not a git repository`, 'run redline from inside your repo');
  }

  const identity = parseRemote(git.remoteUrl());
  const lazy = deps.lazyCredentials === true;
  if (identity.host === 'github') {
    const make = deps.makeGitHubClient ?? ((): GitHubClient => createGitHubClient());
    return createGitHubPlatform({ client: lazy ? lazyGitHubClient(make) : make(), gitFor });
  }
  const makeAzure = deps.makeAzureClient ?? ((org: string): AzureClient => createAzureClient(org));
  const make = (): AzureClient => makeAzure(identity.org);
  return createAzurePlatform({ client: lazy ? lazyAzureClient(make) : make(), gitFor });
}
