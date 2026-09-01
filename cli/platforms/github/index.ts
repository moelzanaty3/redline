import { RedlineError } from '../../core/errors.ts';
import { createGit, type Git } from '../../core/git.ts';
import { parseRemote } from '../detect.ts';
import type { Platform, RepoRef } from '../types.ts';
import type { GitHubClient } from './client.ts';
import { createGitHubInstall } from './install.ts';
import { createGitHubVerify } from './verify.ts';

export interface GitHubPlatformOptions {
  client: GitHubClient;
  gitFor?: (cwd: string) => Git;
}

// Same untrusted-input posture as verify.ts: the repository body is typed
// unknown and narrowed explicitly, never asserted with `as`.
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createGitHubPlatform(opts: GitHubPlatformOptions): Platform {
  const gitFor = opts.gitFor ?? ((cwd: string) => createGit(cwd));
  const install = createGitHubInstall(opts.client, gitFor);
  const verify = createGitHubVerify(opts.client);

  return {
    host: 'github',
    async repoRef(cwd: string): Promise<RepoRef> {
      const identity = parseRemote(gitFor(cwd).remoteUrl());
      const path = `/repos/${identity.org}/${identity.repo}`;
      const repo = await opts.client.rest<unknown>('GET', path);
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
