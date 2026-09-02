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
      const identity = parseRemote(gitFor(cwd).remoteUrl());
      const path = `/repos/${identity.org}/${identity.repo}`;
      const repo = await opts.client.rest<unknown>('GET', path);
      if (repo.status === 401 || repo.status === 403) {
        // "Token lacks scope" and "GitHub is down" must exit differently
        // (3 vs 4) so CI can tell an operator problem from a host problem.
        throw new RedlineError(
          'permission',
          `GitHub returned HTTP ${repo.status} reading ${path}`,
          'check the GH_TOKEN scopes, or run: gh auth login'
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
