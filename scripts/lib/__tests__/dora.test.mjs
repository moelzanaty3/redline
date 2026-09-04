import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeFailureRate, deploymentFrequency, dora, leadTimes, median } from '../dora.mjs';

const at = (iso) => new Date(iso).toISOString();
const pr = (over = {}) => ({
  repo: 'acme/web',
  title: 'feat: something',
  merged_at: at('2026-08-10T12:00:00Z'),
  first_commit_at: at('2026-08-09T12:00:00Z'),
  ...over,
});

test('lead time is first commit to merge, in hours', () => {
  assert.deepEqual(leadTimes([pr()]), [24]);
});

test('a pull request with no first-commit timestamp is skipped, not counted as zero', () => {
  // Zero lead time would drag the median toward a number no team achieved.
  assert.deepEqual(leadTimes([pr({ first_commit_at: undefined })]), []);
});

test('a rebase that moves the commit past the merge is skipped, not reported negative', () => {
  assert.deepEqual(leadTimes([pr({ first_commit_at: at('2026-08-11T12:00:00Z') })]), []);
});

test('the median is reported, because a mean is dragged by one stale branch', () => {
  assert.equal(median([1, 2, 3, 400]), 2.5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([]), null);
});

test('a revert after a merge counts that merge as a failure', () => {
  const result = changeFailureRate([
    pr({ merged_at: at('2026-08-10T00:00:00Z') }),
    pr({ merged_at: at('2026-08-11T00:00:00Z'), title: 'Revert "feat: something"' }),
  ]);

  assert.equal(result.failures, 1);
  assert.equal(result.total, 2);
});

test('the revert itself is not counted as a failure of its own', () => {
  // Otherwise every incident scores twice and the estate looks half-broken.
  const result = changeFailureRate([
    pr({ merged_at: at('2026-08-10T00:00:00Z') }),
    pr({ merged_at: at('2026-08-11T00:00:00Z'), title: 'Revert "feat: something"' }),
    pr({ merged_at: at('2026-08-12T00:00:00Z'), title: 'hotfix: patch it' }),
  ]);

  assert.equal(result.failures, 1);
});

test('a revert outside the window does not attach to the merge', () => {
  const result = changeFailureRate([
    pr({ merged_at: at('2026-08-01T00:00:00Z') }),
    pr({ merged_at: at('2026-08-20T00:00:00Z'), title: 'Revert "feat: something"' }),
  ]);

  assert.equal(result.failures, 0);
});

test('a revert in another repository does not attach', () => {
  const result = changeFailureRate([
    pr({ merged_at: at('2026-08-10T00:00:00Z') }),
    pr({ repo: 'acme/api', merged_at: at('2026-08-11T00:00:00Z'), title: 'Revert "x"' }),
  ]);

  assert.equal(result.failures, 0);
});

test('the rate is null, not zero, when there is nothing to divide', () => {
  const result = changeFailureRate([]);

  assert.equal(result.rate, null);
  assert.match(result.reason, /no merged pull requests/);
});

test('the caveat travels with the number, because the number will be quoted', () => {
  const result = changeFailureRate([pr()]);

  assert.match(result.caveat, /floor, not the true rate/);
});

test('deployment frequency is unknown, not zero, without the deployments API', () => {
  // Assuming one deploy per merge reports a trunk-based team and a
  // quarterly-release team as identical — the exact distinction the metric draws.
  const result = deploymentFrequency(null, 90);

  assert.equal(result.perDay, null);
  assert.match(result.reason, /unknown, not zero/);
});

test('deployment frequency is computed when deployments are supplied', () => {
  assert.equal(deploymentFrequency(new Array(90).fill({}), 90).perDay, 1);
});

test('MTTR is refused by name, so nobody wonders whether it was forgotten', () => {
  const result = dora([pr()]);

  assert.equal(result.meanTimeToRestore.value, null);
  assert.match(result.meanTimeToRestore.reason, /incident feed/);
});

test('lead time reports a reason when nothing in the window carries a timestamp', () => {
  const result = dora([pr({ first_commit_at: undefined })]);

  assert.equal(result.leadTimeHours.median, null);
  assert.match(result.leadTimeHours.reason, /first-commit timestamp/);
});
