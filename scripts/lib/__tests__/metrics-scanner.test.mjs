import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../metrics.mjs';

const record = (over = {}) => ({
  repo: 'acme/web',
  merged_at: '2026-08-01T00:00:00Z',
  findings: { total: 4, blocker: 1, high: 2, suggestion: 1 },
  outcomes: { resolved: 3, stale_by_severity: {} },
  rules: { 'react/effect-derived-state': { severity: 'BLOCKER', fired: 1, resolved: 1, stale: 0 } },
  reviewers: ['copilot'],
  ...over,
});

test('scanner findings are aggregated alongside Redline’s, never into them', () => {
  // Folding another tool's rule ids into byRule would tune Redline's rules on
  // that tool's noise — the one way ingestion makes things worse.
  const agg = aggregate([
    record({ scanner: { findings: 3, by_tool: { CodeQL: 3 }, by_severity: { blocker: 2, high: 1 } } }),
  ]);

  assert.equal(agg.findings, 4, "Redline's own total is untouched");
  assert.deepEqual(Object.keys(Object.fromEntries(agg.byRule.map((r) => [r.id, r]))), [
    'react/effect-derived-state',
  ]);
  assert.equal(agg.scanner.findings, 3);
  assert.deepEqual(agg.scanner.bySeverity, { blocker: 2, high: 1, suggestion: 0 });
});

test('per-tool totals identify one noisy scanner across the estate', () => {
  const agg = aggregate([
    record({ scanner: { findings: 3, by_tool: { CodeQL: 3 }, by_severity: {} } }),
    record({ repo: 'acme/api', scanner: { findings: 5, by_tool: { Semgrep: 5 }, by_severity: {} } }),
  ]);

  assert.deepEqual(agg.scanner.byTool, [
    { tool: 'Semgrep', findings: 5 },
    { tool: 'CodeQL', findings: 3 },
  ]);
});

test('the count of repositories emitting anything answers the roadmap’s open question 1', () => {
  const agg = aggregate([
    record({ scanner: { findings: 3, by_tool: {}, by_severity: {} } }),
    record({ repo: 'acme/api', scanner: { findings: 0, by_tool: {}, by_severity: {} } }),
    record({ repo: 'acme/infra' }),
  ]);

  assert.equal(agg.scanner.repos, 1);
});

test('records from before ingestion existed aggregate to zero, not to NaN', () => {
  const agg = aggregate([record()]);

  assert.equal(agg.scanner.findings, 0);
  assert.equal(agg.scanner.repos, 0);
});

test('an unknown severity from a scanner is ignored rather than inventing a bucket', () => {
  const agg = aggregate([
    record({ scanner: { findings: 1, by_tool: {}, by_severity: { catastrophic: 1 } } }),
  ]);

  assert.deepEqual(agg.scanner.bySeverity, { blocker: 0, high: 0, suggestion: 0 });
});
