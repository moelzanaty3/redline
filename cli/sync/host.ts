import { RedlineError } from '../core/errors.ts';
import type { Host, RepoRef } from '../platforms/types.ts';
import { createGitHubClient, type GitHubClient } from '../platforms/github/client.ts';
import { readRemoteConfig, readRemoteFile } from '../platforms/github/remote.ts';
import { openOrUpdatePullRequest, pushRemoteFiles } from '../platforms/github/push.ts';
import type { SyncHost } from './run.ts';

// The estate spans both hosts, so one sync run needs a client per host rather
// than the single resolved platform every other command works with — those all
// act on one repository, which has exactly one host.
export function createSyncHost(clients: { github?: Pick<GitHubClient, 'rest'> } = {}): SyncHost {
  const github = clients.github ?? createGitHubClient();

  const unsupported = (host: Host): never => {
    throw new RedlineError(
      'host',
      `sync does not support ${host} yet`,
      'Azure DevOps discovery and sync are outstanding — see the roadmap Phase 0'
    );
  };

  const forHost = (ref: RepoRef): Pick<GitHubClient, 'rest'> =>
    ref.host === 'github' ? github : unsupported(ref.host);

  return {
    readRemoteConfig: (ref) => readRemoteConfig(forHost(ref), ref),
    readRemoteFile: (ref, path) => readRemoteFile(forHost(ref), ref, path),
    pushFiles: (ref, push) => pushRemoteFiles(forHost(ref), ref, push),
    openPullRequest: (ref, pr) => openOrUpdatePullRequest(forHost(ref), ref, pr),
  };
}
