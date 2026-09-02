import { RedlineError } from '../../core/errors.ts';
import { createGit, type Git } from '../../core/git.ts';
import { parseRemote } from '../detect.ts';
import { isNonNullObject } from '../shape.ts';
import type { Platform, RepoRef } from '../types.ts';
import type { AzureClient } from './client.ts';
import { createAzureInstall } from './install.ts';
import { createAzureVerify } from './verify.ts';

export interface AzurePlatformOptions {
  client: AzureClient;
  gitFor?: (cwd: string) => Git;
}

export function createAzurePlatform(opts: AzurePlatformOptions): Platform {
  const gitFor = opts.gitFor ?? ((cwd: string) => createGit(cwd));
  const install = createAzureInstall(opts.client, gitFor);
  const verify = createAzureVerify(opts.client);

  return {
    host: 'azure',
    async repoRef(cwd: string): Promise<RepoRef> {
      const identity = parseRemote(gitFor(cwd).remoteUrl());
      if (!identity.project) {
        throw new RedlineError('usage', 'could not read the Azure DevOps project from the git remote');
      }
      const path = `/${identity.project}/_apis/git/repositories/${identity.repo}`;
      const repo = await opts.client.request<unknown>('GET', path);
      if (repo.status === 401 || repo.status === 403) {
        // Same decision as the GitHub adapter: a token-scope failure exits 3,
        // a host failure exits 4.
        throw new RedlineError(
          'permission',
          `Azure DevOps returned HTTP ${repo.status} reading ${path}`,
          'check the AZURE_DEVOPS_EXT_PAT scopes, or run: az login'
        );
      }
      if (repo.status < 200 || repo.status >= 300) {
        throw new RedlineError('host', `Azure DevOps returned HTTP ${repo.status} reading ${path}`);
      }
      if (!isNonNullObject(repo.body) || typeof repo.body['id'] !== 'string') {
        throw new RedlineError('host', `Azure DevOps returned an unexpected shape for ${path}`);
      }
      const defaultBranch = repo.body['defaultBranch'];
      if (defaultBranch !== undefined && typeof defaultBranch !== 'string') {
        throw new RedlineError('host', `Azure DevOps returned an unexpected shape for ${path}`);
      }
      return {
        host: 'azure',
        org: identity.org,
        project: identity.project,
        repo: identity.repo,
        repoId: repo.body['id'],
        defaultBranch: (defaultBranch ?? 'refs/heads/main').replace('refs/heads/', ''),
      };
    },
    ...install,
    ...verify,
  };
}
