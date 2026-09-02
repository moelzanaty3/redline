import { createGit, type Git } from '../core/git.ts';
import { RedlineError } from '../core/errors.ts';
import { parseRemote } from './detect.ts';
import { createGitHubClient, type GitHubClient } from './github/client.ts';
import { createGitHubPlatform } from './github/index.ts';
import { createAzureClient, type AzureClient } from './azure/client.ts';
import { createAzurePlatform } from './azure/index.ts';
import type { Platform } from './types.ts';

export interface ResolveDeps {
  gitFor?: (cwd: string) => Git;
  makeGitHubClient?: () => GitHubClient;
  makeAzureClient?: (org: string) => AzureClient;
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
  if (identity.host === 'github') {
    const client = (deps.makeGitHubClient ?? (() => createGitHubClient()))();
    return createGitHubPlatform({ client, gitFor });
  }
  const client = (deps.makeAzureClient ?? ((org: string) => createAzureClient(org)))(identity.org);
  return createAzurePlatform({ client, gitFor });
}
