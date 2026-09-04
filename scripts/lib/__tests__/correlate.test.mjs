import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlate, MIN_SAMPLE } from '../correlate.mjs';

const day = (n) => new Date(Date.UTC(2026, 7, n)).toISOString();

const pr = (over = {}) => ({
  repo: 'acme/web',
  title: 'feat: something',
  merged_at: day(1),
  rules: {},
  ...over,
});

const ignoring = (ruleId, count, over = {}) =>
  pr({ rules: { [ruleId]: { severity: 'BLOCKER', fired: count, resolved: 0, stale: count } }, ...over });

test('an ignored finding followed by a revert in the same repo is counted', () => {
  const result = correlate([
    ignoring('react/effect-derived-state', MIN_SAMPLE, { merged_at: day(1) }),
    pr({ merged_at: day(2), title: 'Revert "feat: something"' }),
  ]);

  const rule = result.rules.find((r) => r.ruleId === 'react/effect-derived-state');
  assert.equal(rule?.followedByRemediation, MIN_SAMPLE);
  assert.equal(rule?.rate, 1);
});

test('a revert outside the window does not attach', () => {
  const result = correlate(
    [ignoring('react/x', MIN_SAMPLE, { merged_at: day(1) }), pr({ merged_at: day(28), title: 'Revert "x"' })],
    { windowDays: 7 }
  );

  assert.equal(result.rules[0]?.rate, 0);
});

test('a revert in another repository does not attach', () => {
  const result = correlate([
    ignoring('react/x', MIN_SAMPLE, { merged_at: day(1) }),
    pr({ repo: 'acme/api', merged_at: day(2), title: 'Revert "x"' }),
  ]);

  assert.equal(result.rules[0]?.rate, 0);
});

test('a rule below the sample threshold gets no rate, and says why', () => {
  // The rate exists arithmetically and means nothing. Publishing it anyway is how
  // a coincidence becomes a rule nobody can argue with.
  const result = correlate([
    ignoring('react/x', 3, { merged_at: day(1) }),
    pr({ merged_at: day(2), title: 'Revert "x"' }),
  ]);

  assert.equal(result.rules[0]?.rate, null);
  assert.equal(result.rules[0]?.reportable, false);
  assert.match(result.rules[0]?.reason ?? '', /at least 10 are needed/);
});

test("a remediation's own ignored findings are not evidence about what it remedied", () => {
  // Counting them would let one incident inflate every rule that fired on the fix.
  const result = correlate([
    pr({ merged_at: day(1), title: 'hotfix: patch', rules: { 'react/x': { severity: 'HIGH', stale: 5 } } }),
  ]);

  assert.deepEqual(result.rules, []);
  assert.equal(result.unattributable, 5);
});

test('the verdict refuses when no rule reaches the threshold', () => {
  // The honest output of a weak experiment is "we cannot say".
  const result = correlate([ignoring('react/x', 2, { merged_at: day(1) })]);

  assert.equal(result.verdict.reportable, false);
  assert.match(result.verdict.reason, /too weak to report/);
});

test('nothing ignored is a good result, not a failed experiment', () => {
  const result = correlate([pr()]);

  assert.equal(result.verdict.reportable, false);
  assert.match(result.verdict.reason, /good result, not a failed experiment/);
});

test('a reportable verdict carries its caveat and says what was withheld', () => {
  const result = correlate([
    ignoring('react/reported', MIN_SAMPLE, { merged_at: day(1) }),
    ignoring('react/withheld', 2, { merged_at: day(3) }),
    pr({ merged_at: day(2), title: 'Revert "x"' }),
  ]);

  assert.equal(result.verdict.reportable, true);
  assert.equal(result.verdict.rulesReported, 1);
  assert.equal(result.verdict.rulesWithheld, 1);
  assert.match(result.verdict.caveat, /Correlation, not causation/);
});

test('rules are ordered with the strongest signal first', () => {
  // A five-day window puts the revert inside `strong`'s window and outside
  // `weak`'s, so the two genuinely differ rather than tying at 1.
  const result = correlate(
    [
      ignoring('react/weak', MIN_SAMPLE, { merged_at: day(1) }),
      ignoring('react/strong', MIN_SAMPLE, { merged_at: day(10) }),
      pr({ merged_at: day(11), title: 'Revert "x"' }),
    ],
    { windowDays: 5 }
  );

  assert.equal(result.rules[0]?.ruleId, 'react/strong');
  assert.equal(result.rules[0]?.rate, 1);
  assert.equal(result.rules[1]?.rate, 0);
});

test('an unreportable rule sorts below every reportable one, whatever its arithmetic rate', () => {
  const result = correlate([
    ignoring('react/tiny-but-perfect', 2, { merged_at: day(1) }),
    ignoring('react/real', MIN_SAMPLE, { merged_at: day(1) }),
    pr({ merged_at: day(2), title: 'Revert "x"' }),
  ]);

  assert.equal(result.rules[0]?.ruleId, 'react/real');
  assert.equal(result.rules[1]?.reportable, false);
});

test('an empty history correlates nothing rather than dividing by zero', () => {
  const result = correlate([]);

  assert.deepEqual(result.rules, []);
  assert.equal(result.verdict.reportable, false);
});
