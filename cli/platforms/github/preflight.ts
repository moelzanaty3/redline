import type { GitHubClient } from './client.ts';

// Does the reusable workflow the caller is about to reference actually exist?
//
// This check is here because it did not exist, and its absence wrote a broken
// workflow into a real repository: `redline init` rendered
// `.github/workflows/redline.yml` pointing at
// `<org>/.github/.github/workflows/redline-gate.yml@main`, committed it, opened
// a pull request, and reported `applied gate`. The organisation had no
// `.github` repository. Every pull request in that repo now fails to start the
// workflow with "Unable to find reusable workflow", and Redline had told the
// operator it succeeded.
//
// A gate that cannot resolve is worse than no gate: no gate is a known absence,
// while this is a red X that looks like Redline working and is not. So the
// check runs before the write, and a failure is reported as a capability that
// could not be applied rather than one that was.

export type GatePreflight =
  | { readonly ok: true }
  | {
      readonly ok: false;
      // Separated because the fix differs: a missing `.github` repository is an
      // org-level setup step, a missing workflow inside an existing one is a
      // file to add, and an unreadable answer is a credential or outage and
      // must not be reported as "does not exist".
      readonly reason: 'no-dot-github-repo' | 'no-workflow' | 'unreadable';
      readonly detail: string;
      readonly hint: string;
    };

export const REUSABLE_PATH = '.github/workflows/redline-gate.yml';

/**
 * Confirm `<org>/.github` publishes the reusable gate workflow at `ref`.
 *
 * Read-only, and never throws: a preflight that threw would turn a soft
 * "your org has not published the gate yet" into a failed onboarding, when
 * everything else Redline installs — the standards, the artifacts, the config —
 * is still worth having.
 */
export async function checkReusableGate(
  client: GitHubClient,
  org: string,
  ref = 'main'
): Promise<GatePreflight> {
  const path = `/repos/${org}/.github/contents/${REUSABLE_PATH}?ref=${encodeURIComponent(ref)}`;
  let status: number;
  try {
    const res = await client.rest<unknown>('GET', path);
    status = res.status;
  } catch (error) {
    return {
      ok: false,
      reason: 'unreadable',
      detail: `could not read ${org}/.github: ${error instanceof Error ? error.message : String(error)}`,
      hint: 'the gate was not installed — re-run once the host is reachable',
    };
  }

  if (status >= 200 && status < 300) return { ok: true };

  if (status === 404) {
    // A 404 on the contents endpoint cannot tell "no such repository" from "no
    // such file in it", so ask the repository directly rather than guessing —
    // the two have different fixes and telling the operator the wrong one
    // costs them the afternoon.
    let repoStatus: number;
    try {
      repoStatus = (await client.rest<unknown>('GET', `/repos/${org}/.github`)).status;
    } catch {
      repoStatus = 0;
    }
    if (repoStatus === 404) {
      return {
        ok: false,
        reason: 'no-dot-github-repo',
        detail: `${org}/.github does not exist, so the gate workflow has nowhere to be published`,
        hint: `create ${org}/.github and add ${REUSABLE_PATH} to it, then re-run redline init`,
      };
    }
    return {
      ok: false,
      reason: 'no-workflow',
      detail: `${org}/.github exists but has no ${REUSABLE_PATH} on ${ref}`,
      hint: `add ${REUSABLE_PATH} to ${org}/.github, then re-run redline init`,
    };
  }

  return {
    ok: false,
    reason: 'unreadable',
    detail: `GitHub returned HTTP ${status} reading ${org}/.github/${REUSABLE_PATH}`,
    hint:
      status === 401 || status === 403
        ? 'the token cannot read the organisation .github repository — check its scopes'
        : 'the gate was not installed — re-run once the host is reachable',
  };
}
