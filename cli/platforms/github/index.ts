import { RedlineError } from '../../core/errors.ts';
import { createGit, type Git } from '../../core/git.ts';
import { parseRemote } from '../detect.ts';
import { isNonNullObject } from '../shape.ts';
import type { Platform, RepoRef } from '../types.ts';
import type { GitHubClient } from './client.ts';
import { createGitHubInstall } from './install.ts';
import { createGitHubVerify } from './verify.ts';

export interface GitHubPlatformOptions {
  client: GitHubClient;
  gitFor?: (cwd: string) => Git;
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
        throw new RedlineError(
          repo.status === 404 ? 'host' : 'permission',
          `GitHub returned HTTP ${repo.status} reading ${path}`,
          `${identity.org}/${identity.repo} is what "git remote get-url origin" resolves to here ` +
            `(${remoteUrl}). If that is not the repository you meant, fix the remote; ` +
            'if it is, check the GH_TOKEN scopes or run: gh auth login'
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
