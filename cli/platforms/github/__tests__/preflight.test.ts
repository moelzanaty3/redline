import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReusableGate, REUSABLE_PATH } from '../preflight.ts';
import type { GitHubClient } from '../client.ts';

// Answers keyed by request path, so a test says what the host knows rather than
// what order it was asked.
function client(answers: Record<string, number>, onCall?: (path: string) => void): GitHubClient {
  return {
    async rest<T>(_method: string, path: string) {
      onCall?.(path);
      const status = answers[path] ?? answers[path.split('?')[0]!] ?? 404;
      return { status, body: undefined as T, headers: {} } as never;
    },
    async graphql<T>() {
      throw new Error('not used');
    },
  };
}

const CONTENTS = `/repos/acme/.github/contents/${REUSABLE_PATH}`;
const REPO = '/repos/acme/.github';

test('a published reusable workflow passes', async () => {
  const result = await checkReusableGate(client({ [CONTENTS]: 200 }), 'acme');
  assert.deepEqual(result, { ok: true });
});

// The failure that shipped: the org had no `.github` repository at all, the
// caller was written anyway, and every pull request in the onboarded repository
// failed with "Unable to find reusable workflow" while Redline reported
// `applied gate`.
test('a missing .github repository is reported as the org-level gap it is', async () => {
  const result = await checkReusableGate(client({ [CONTENTS]: 404, [REPO]: 404 }), 'acme');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'no-dot-github-repo');
  assert.match(result.detail, /acme\/\.github does not exist/);
  assert.match(result.hint, /create acme\/\.github/);
});

// Different gap, different fix: the repository exists and someone has to add
// one file to it. Telling that operator to create a repository they already
// have is how a five-minute fix becomes an afternoon.
test('an existing .github repository without the workflow says so precisely', async () => {
  const result = await checkReusableGate(client({ [CONTENTS]: 404, [REPO]: 200 }), 'acme');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'no-workflow');
  assert.match(result.detail, /exists but has no/);
});

// A token that cannot read the org must never be reported as an org that has
// nothing: one is a permissions fix, the other is a setup task, and guessing
// between them sends the operator to the wrong team.
test('a 403 is unreadable, never "does not exist"', async () => {
  const result = await checkReusableGate(client({ [CONTENTS]: 403 }), 'acme');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'unreadable');
  assert.match(result.hint, /scopes/);
});

test('a transport failure is unreadable and never throws', async () => {
  const thrower: GitHubClient = {
    async rest() {
      throw new Error('ECONNREFUSED');
    },
    async graphql<T>(): Promise<T> {
      throw new Error('not used');
    },
  };
  const result = await checkReusableGate(thrower, 'acme');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'unreadable');
  assert.match(result.detail, /ECONNREFUSED/);
});

test('the ref is part of the question, and is url-encoded', async () => {
  const paths: string[] = [];
  await checkReusableGate(client({}, (p) => paths.push(p)), 'acme', 'release/v1');
  assert.ok(paths[0]?.includes('ref=release%2Fv1'), paths[0]);
});

// The second call costs a round trip and only happens on the one status that
// cannot answer the question on its own.
test('a healthy answer asks the host exactly once', async () => {
  const paths: string[] = [];
  await checkReusableGate(client({ [CONTENTS]: 200 }, (p) => paths.push(p)), 'acme');
  assert.equal(paths.length, 1);
});
