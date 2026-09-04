import { RedlineError } from '../../core/errors.ts';
import { parseRemoteConfig, type RemoteConfigResult } from '../remote.ts';
import type { RepoRef } from '../types.ts';
import type { GitHubClient } from './client.ts';

const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

interface ContentResponse {
  content?: string;
  encoding?: string;
  sha?: string;
}

// A file read at a ref, or null when the repository does not carry it. The
// distinction matters everywhere this is used: "no .redline.json" means not
// onboarded, and reporting that as a read failure would turn every un-onboarded
// repository in the estate into an error.
export async function readRemoteFile(
  client: Pick<GitHubClient, 'rest'>,
  ref: RepoRef,
  path: string
): Promise<{ content: string; sha: string } | null> {
  const response = await client.rest<ContentResponse>(
    'GET',
    `${repoPath(ref)}/contents/${path}?ref=${encodeURIComponent(ref.defaultBranch)}`
  );
  if (response.status === 404) return null;
  if (response.status >= 400) {
    throw new RedlineError(
      'host',
      `${ref.org}/${ref.repo}: reading ${path} returned ${response.status}`
    );
  }
  const body = response.body;
  if (!body?.content || body.encoding !== 'base64') {
    // A path that resolves to a directory comes back as an array, and a file
    // over 1MB comes back with an empty content field. Both are real states
    // that would otherwise decode to an empty string and parse as invalid.
    throw new RedlineError(
      'host',
      `${ref.org}/${ref.repo}: ${path} is not a readable file (no base64 content)`
    );
  }
  return {
    content: Buffer.from(body.content, 'base64').toString('utf8'),
    sha: body.sha ?? '',
  };
}

export async function readRemoteConfig(
  client: Pick<GitHubClient, 'rest'>,
  ref: RepoRef
): Promise<RemoteConfigResult> {
  const file = await readRemoteFile(client, ref, '.redline.json');
  if (!file) return { config: null, ref: ref.defaultBranch };
  return {
    config: parseRemoteConfig(file.content, `${ref.org}/${ref.repo}`),
    ref: ref.defaultBranch,
  };
}
