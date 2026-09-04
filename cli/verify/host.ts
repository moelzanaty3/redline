import { RedlineError } from '../core/errors.ts';
import type { Host, RepoRef } from '../platforms/types.ts';
import { createGitHubClient, type GitHubClient } from '../platforms/github/client.ts';
import { createGitHubVerify, machineryFromBody } from '../platforms/github/verify.ts';
import { readRemoteConfig, readRemoteFile } from '../platforms/github/remote.ts';
import type { RemoteVerifyHost } from './remote.ts';

// One client per host, for the same reason sync needs one: a remote verify runs
// across an estate that spans both, where every other command acts on a single
// repository and therefore a single host.
export function createRemoteVerifyHost(clients: { github?: GitHubClient } = {}): RemoteVerifyHost {
  const github = clients.github ?? createGitHubClient();
  const githubVerify = createGitHubVerify(github);

  const unsupported = (host: Host): never => {
    throw new RedlineError(
      'host',
      `remote verify does not support ${host} yet`,
      'Azure DevOps remote verification is outstanding — see the roadmap Phase 0'
    );
  };
  const only = (ref: RepoRef): void => {
    if (ref.host !== 'github') unsupported(ref.host);
  };

  return {
    resolveRef: (repo) => resolveRemoteRef(github, repo),
    readRemoteConfig: (ref) => (only(ref), readRemoteConfig(github, ref)),
    readRemoteFile: (ref, path) => (only(ref), readRemoteFile(github, ref, path)),
    machineryFromBody,
    readPolicy: (ref) => (only(ref), githubVerify.readPolicy(ref)),
    readSecurityState: (ref) => (only(ref), githubVerify.readSecurityState(ref)),
    latestPullRequestNumber: (ref) => (only(ref), githubVerify.latestPullRequestNumber(ref)),
    readReportedCheckNames: (ref, pr) => (only(ref), githubVerify.readReportedCheckNames(ref, pr)),
  };
}

// owner/name into a RepoRef. The default branch is not known until the host is
// asked, and every call below needs it, so it is resolved once here rather than
// guessed as "main" — a repository on `master` or `develop` would otherwise be
// reported as entirely broken.
export async function resolveRemoteRef(
  client: Pick<GitHubClient, 'rest'>,
  repo: string
): Promise<RepoRef> {
  const [org, name] = repo.split('/');
  if (!org || !name || repo.split('/').length !== 2) {
    throw new RedlineError('usage', `--repo must be owner/name, not "${repo}"`);
  }
  const response = await client.rest<{ default_branch?: string }>('GET', `/repos/${org}/${name}`);
  if (response.status === 404) {
    throw new RedlineError('host', `${repo} not found, or this token cannot see it`);
  }
  if (response.status >= 400) {
    throw new RedlineError('host', `reading ${repo} returned ${response.status}`);
  }
  return {
    host: 'github',
    org,
    repo: name,
    defaultBranch: response.body?.default_branch ?? 'main',
  };
}
