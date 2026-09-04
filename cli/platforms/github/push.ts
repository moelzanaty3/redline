import { RedlineError } from '../../core/errors.ts';
import type { RepoRef } from '../types.ts';
import type { GitHubClient } from './client.ts';

const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

export interface RemoteFile {
  path: string;
  content: string;
}

export interface RemotePush {
  branch: string;
  message: string;
  files: RemoteFile[];
}

export interface RemotePullRequest {
  branch: string;
  title: string;
  body: string;
  labels: string[];
}

export interface PushResult {
  // null when the tree already matches: nothing to commit is a legitimate
  // no-op, not a failure, and it must not open an empty pull request.
  commit: string | null;
  branch: string;
}

interface RefResponse {
  object?: { sha?: string };
}

const ok = <T>(status: number, body: T | null, what: string): T => {
  if (status >= 400 || body === null) {
    throw new RedlineError('host', `${what} returned ${status}`);
  }
  return body;
};

// Commit a set of files onto a branch without a working copy.
//
// Sync runs against hundreds of repositories from one workflow. Cloning each to
// commit a handful of rendered files would dominate the run and needs write
// access to a checkout this process does not have, so the git data API does the
// work: one tree built from the files, one commit, one ref update. It is also
// atomic in a way a file-at-a-time contents API is not — a run that dies halfway
// leaves the branch untouched rather than half-updated.
export async function pushRemoteFiles(
  client: Pick<GitHubClient, 'rest'>,
  ref: RepoRef,
  push: RemotePush
): Promise<PushResult> {
  // The base is always the default branch, never whatever the sync branch
  // already points at: a stale sync branch must be re-based onto current main,
  // or it would re-propose changes the repository already merged.
  const baseRef = await client.rest<RefResponse>(
    'GET',
    `${repoPath(ref)}/git/ref/heads/${ref.defaultBranch}`
  );
  const baseSha = ok(baseRef.status, baseRef.body, `reading heads/${ref.defaultBranch}`).object?.sha;
  if (!baseSha) throw new RedlineError('host', `${ref.defaultBranch} has no commit sha`);

  const baseCommit = await client.rest<{ tree?: { sha?: string } }>(
    'GET',
    `${repoPath(ref)}/git/commits/${baseSha}`
  );
  const baseTree = ok(baseCommit.status, baseCommit.body, 'reading the base commit').tree?.sha;
  if (!baseTree) throw new RedlineError('host', 'base commit has no tree');

  const tree = await client.rest<{ sha?: string }>('POST', `${repoPath(ref)}/git/trees`, {
    base_tree: baseTree,
    tree: push.files.map((file) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      content: file.content,
    })),
  });
  const treeSha = ok(tree.status, tree.body, 'creating the tree').sha;
  if (!treeSha) throw new RedlineError('host', 'tree creation returned no sha');

  // An identical tree means the repository already carries exactly what this
  // run would push. Committing it anyway would open a pull request with an
  // empty diff on every scheduled run, on every already-current repository.
  if (treeSha === baseTree) return { commit: null, branch: push.branch };

  const commit = await client.rest<{ sha?: string }>('POST', `${repoPath(ref)}/git/commits`, {
    message: push.message,
    tree: treeSha,
    parents: [baseSha],
  });
  const commitSha = ok(commit.status, commit.body, 'creating the commit').sha;
  if (!commitSha) throw new RedlineError('host', 'commit creation returned no sha');

  // Create the branch, or force it onto the new commit when a previous run left
  // one. Force is safe here and only here: the branch is Redline's own, named
  // by Redline, and its only content is a re-render of the same files.
  const created = await client.rest<unknown>('POST', `${repoPath(ref)}/git/refs`, {
    ref: `refs/heads/${push.branch}`,
    sha: commitSha,
  });
  if (created.status === 422) {
    const updated = await client.rest<unknown>(
      'PATCH',
      `${repoPath(ref)}/git/refs/heads/${push.branch}`,
      { sha: commitSha, force: true }
    );
    ok(updated.status, updated.body ?? {}, `updating ${push.branch}`);
  } else {
    ok(created.status, created.body ?? {}, `creating ${push.branch}`);
  }

  return { commit: commitSha, branch: push.branch };
}

export interface OpenedPullRequest {
  number: number;
  url: string;
  // Whether this run created the pull request or updated one already open.
  created: boolean;
}

// Open a pull request for a branch, or return the one already open for it.
//
// Idempotence is the whole requirement: sync runs on a schedule, and a target
// whose previous pull request is still unmerged must get an updated branch, not
// a second pull request competing with the first.
export async function openOrUpdatePullRequest(
  client: Pick<GitHubClient, 'rest'>,
  ref: RepoRef,
  pr: RemotePullRequest
): Promise<OpenedPullRequest> {
  const existing = await client.rest<{ number: number; html_url: string }[]>(
    'GET',
    `${repoPath(ref)}/pulls?state=open&head=${ref.org}:${pr.branch}`
  );
  const open = existing.status < 400 ? (existing.body ?? []) : [];
  if (open.length > 0 && open[0]) {
    const found = open[0];
    // The branch already carries the new commit; refresh the body so a reader
    // sees the version this run proposes rather than the one it replaced.
    await client.rest<unknown>('PATCH', `${repoPath(ref)}/pulls/${found.number}`, {
      title: pr.title,
      body: pr.body,
    });
    return { number: found.number, url: found.html_url, created: false };
  }

  const created = await client.rest<{ number?: number; html_url?: string }>(
    'POST',
    `${repoPath(ref)}/pulls`,
    { title: pr.title, body: pr.body, head: pr.branch, base: ref.defaultBranch }
  );
  const body = ok(created.status, created.body, 'opening the pull request');
  if (typeof body.number !== 'number') {
    throw new RedlineError('host', 'pull request creation returned no number');
  }

  if (pr.labels.length > 0) {
    // Labels are a nicety. A repository that has not created them yet must not
    // cost the pull request that carries the standards change.
    await client.rest<unknown>(`POST`, `${repoPath(ref)}/issues/${body.number}/labels`, {
      labels: pr.labels,
    });
  }

  return { number: body.number, url: body.html_url ?? '', created: true };
}
