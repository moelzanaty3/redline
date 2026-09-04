import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBaseline, formatBaseline, measured, unavailable } from '../baseline.mjs';

const agg = (over = {}) => ({
  findings: 100,
  resolved: 70,
  blocker: 20,
  repos: 8,
  untagged: 3,
  exempted: 2,
  ...over,
});

const input = (over = {}) => ({
  aggregate: agg(),
  windowDays: 90,
  registry: { entries: new Array(10).fill({}) },
  ...over,
});

test('the primary metric is resolved over fired', () => {
  const baseline = buildBaseline(input());

  assert.equal(baseline.primary.actedOnRate.value, 0.7);
  assert.equal(baseline.primary.actedOnRate.available, true);
});

test('an unmeasurable figure is null with a reason, never zero', () => {
  // A zero that means "nobody measured this" reads as a finding, and makes every
  // later comparison look like progress that did not happen.
  const baseline = buildBaseline(input({ registry: null }));

  assert.equal(baseline.guardrails.coverage.onboarded.value, null);
  assert.equal(baseline.guardrails.coverage.onboarded.available, false);
  assert.match(baseline.guardrails.coverage.onboarded.reason, /registry\.json/);
});

test('coverage has no denominator when the register is unreadable', () => {
  const baseline = buildBaseline(input({ registry: null }));

  assert.equal(baseline.guardrails.coverage.ratio.available, false);
});

test('coverage is instrumented over onboarded, so partial coverage cannot read as health', () => {
  const baseline = buildBaseline(input());

  assert.equal(baseline.guardrails.coverage.ratio.value, 0.8);
});

test('an empty estate has no coverage ratio rather than a divide by zero', () => {
  const baseline = buildBaseline(input({ registry: { entries: [] } }));

  assert.equal(baseline.guardrails.coverage.ratio.available, false);
  assert.match(baseline.guardrails.coverage.ratio.reason, /no meaning yet/);
});

test('acted-on rate is absent, not zero, when nothing fired', () => {
  const baseline = buildBaseline(input({ aggregate: agg({ findings: 0, resolved: 0 }) }));

  assert.equal(baseline.primary.actedOnRate.available, false);
});

test("Redline's own merge rate is absent until its pull requests are surveyed", () => {
  const baseline = buildBaseline(input());

  assert.equal(baseline.guardrails.ownPullRequestMergeRate.available, false);
  assert.match(baseline.guardrails.ownPullRequestMergeRate.reason, /org read access/);
});

test("Redline's own merge rate is computed once its pull requests are known", () => {
  const baseline = buildBaseline(
    input({ ownPullRequests: [{ merged: true }, { merged: true }, { merged: false }, { merged: false }] })
  );

  assert.equal(baseline.guardrails.ownPullRequestMergeRate.value, 0.5);
});

test('no pull requests opened yet is absent, not a 0% merge rate', () => {
  // 0% would say the estate is refusing Redline's changes. Nothing has been
  // offered to it.
  const baseline = buildBaseline(input({ ownPullRequests: [] }));

  assert.equal(baseline.guardrails.ownPullRequestMergeRate.available, false);
  assert.match(baseline.guardrails.ownPullRequestMergeRate.reason, /opened no pull requests/);
});

test('findings per week is derived from the window, not assumed weekly', () => {
  const baseline = buildBaseline(input({ windowDays: 90 }));

  assert.equal(Math.round(baseline.findings.perWeek.value * 100) / 100, 7.78);
});

test('SARIF producers are counted per tool once surveyed', () => {
  const baseline = buildBaseline(
    input({ sarifProducers: { 'a/one': ['CodeQL'], 'a/two': ['CodeQL', 'Semgrep'] } })
  );

  assert.deepEqual(baseline.sarifProducers.value, { CodeQL: 2, Semgrep: 1 });
});

test('cost per BLOCKER needs both halves and says which one is missing', () => {
  const noSpend = buildBaseline(input());
  assert.equal(noSpend.costPerBlockerCaught.available, false);
  assert.match(noSpend.costPerBlockerCaught.reason, /spend unavailable/);

  const noBlockers = buildBaseline(
    input({ aggregate: agg({ blocker: 0 }), spend: { total: 100, currency: 'USD', grain: 'org' } })
  );
  assert.equal(noBlockers.costPerBlockerCaught.available, false);
  assert.match(noBlockers.costPerBlockerCaught.reason, /nothing to divide/);
});

test('cost per BLOCKER is computed when both halves exist', () => {
  const baseline = buildBaseline(
    input({ spend: { total: 400, currency: 'USD', grain: 'org' } })
  );

  assert.equal(baseline.costPerBlockerCaught.value, 20);
});

test('the summary prints a reason for every absent figure, never a dash', () => {
  const text = formatBaseline(buildBaseline(input({ registry: null })));

  assert.match(text, /repositories onboarded\s+not available — .*registry\.json/);
  assert.equal(text.includes(' — \n'), false);
});

test('measured and unavailable are the only two shapes', () => {
  assert.deepEqual(measured(3), { value: 3, available: true });
  assert.deepEqual(unavailable('why'), { value: null, available: false, reason: 'why' });
});
