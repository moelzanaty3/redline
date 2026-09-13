import { RedlineError } from '../../core/errors.ts';
import { createGit, type Git } from '../../core/git.ts';
import { parseRemote, redactRemote } from '../detect.ts';
import { isNonNullObject } from '../shape.ts';
import type { Platform, RepoRef } from '../types.ts';
import type { GitHubClient } from './client.ts';
import { createGitHubInstall } from './install.ts';
import { createGitHubVerify } from './verify.ts';

export interface GitHubPlatformOptions {
  client: GitHubClient;
  gitFor?: (cwd: string) => Git;
  // Which API this platform is pointed at, for error text only. Passed as
  // data rather than read back off the client because the client may not be
  // built yet — a dry run defers construction until its first request, and
  // reading a URL off it would force the credential resolution that deferral
  // exists to avoid.
  apiBaseUrl?: string;
}

// Best-effort: the caller is already throwing, and a second failure here must
// not replace the error the reader needs with a worse one.
async function authenticatedLogin(client: GitHubClient): Promise<string | null> {
  try {
    const me = await client.rest<unknown>('GET', '/user');
    if (!isNonNullObject(me.body)) return null;
    const login = me.body['login'];
    return typeof login === 'string' ? login : null;
  } catch {
    return null;
  }
}

export function createGitHubPlatform(opts: GitHubPlatformOptions): Platform {
  const gitFor = opts.gitFor ?? ((cwd: string) => createGit(cwd));
  const install = createGitHubInstall(opts.client, gitFor);
  const verify = createGitHubVerify(opts.client);

  return {
    host: 'github',
    // `git.defaultBranch()` falls back to the literal 'main' when
    // refs/remotes/origin/HEAD is not set (a shallow or freshly-created
    // clone), so the branch below is a guess, not a fact. Nothing on the
    // dry-run path reads it today; anything added that does must resolve it
    // properly or report that it could not, rather than inherit the fiction.
    localRef(cwd: string): RepoRef {
      const git = gitFor(cwd);
      const identity = parseRemote(git.remoteUrl());
      return {
        host: 'github',
        org: identity.org,
        repo: identity.repo,
        defaultBranch: git.defaultBranch(),
      };
    },
    async repoRef(cwd: string): Promise<RepoRef> {
      const remoteUrl = gitFor(cwd).remoteUrl();
      const identity = parseRemote(remoteUrl);
      const path = `/repos/${identity.org}/${identity.repo}`;
      const repo = await opts.client.rest<unknown>('GET', path);
      if (repo.status === 401 || repo.status === 403 || repo.status === 404) {
        // "Token lacks scope" and "GitHub is down" must exit differently
        // (3 vs 4) so CI can tell an operator problem from a host problem.
        //
        // The hint names the remote, because the most confusing version of this
        // is not a missing scope: it is Redline reading a repository the user
        // did not think they were in. Every target here is derived from
        // `origin` alone — a clone of somebody else's repository, or a
        // url.insteadOf rewrite, silently points the whole run at their
        // organisation, and until this said so the only clue was an owner the
        // reader did not recognise inside an HTTP error.
        //
        // The identity is asked for only HERE, on the failure path, and only
        // when the reader is already stuck. GitHub answers "you cannot see it"
        // and "it does not exist" with the same 404, so the one fact that
        // separates them is WHICH account asked — and that is the fact the
        // error could never supply. One extra GET buys the difference between
        // "fix your remote" and "switch your account".
        const who = await authenticatedLogin(opts.client);
        throw new RedlineError(
          repo.status === 404 ? 'host' : 'permission',
          `GitHub returned HTTP ${repo.status} reading ${path}`,
          `${identity.org}/${identity.repo} is what "git remote get-url origin" resolves to here ` +
            `(${redactRemote(remoteUrl)}), asked of ${opts.apiBaseUrl ?? 'the GitHub API'}` +
            `${who === null ? ' (could not read the authenticated account)' : ` as ${who}`}. ` +
            'If that is not the repository you meant, fix the remote. If it is, that account ' +
            `cannot see it — switch with: gh auth switch --hostname ${identity.hostname} -u <user>, ` +
            'or set GH_TOKEN to one that can'
        );
      }
      if (repo.status < 200 || repo.status >= 300) {
        throw new RedlineError('host', `GitHub returned HTTP ${repo.status} reading ${path}`);
      }
      if (!isNonNullObject(repo.body) || typeof repo.body['default_branch'] !== 'string') {
        throw new RedlineError('host', `GitHub returned an unexpected shape for ${path}`);
      }
      return {
        host: 'github',
        org: identity.org,
        repo: identity.repo,
        defaultBranch: repo.body['default_branch'],
      };
    },
    ...install,
    ...verify,
  };
}
