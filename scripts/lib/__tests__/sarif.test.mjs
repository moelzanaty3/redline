import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateBySource, ingestAlerts, mapSeverity } from '../sarif.mjs';

const alert = (over = {}) => ({
  rule: { id: 'js/sql-injection', security_severity_level: 'critical' },
  tool: { name: 'CodeQL' },
  state: 'open',
  most_recent_instance: { location: { path: 'src/db.ts', start_line: 42 } },
  ...over,
});

test('an alert becomes a finding carrying its tool and its own rule id', () => {
  const { findings, problems } = ingestAlerts([alert()]);

  assert.deepEqual(problems, []);
  assert.deepEqual(findings[0], {
    source: 'sarif',
    tool: 'CodeQL',
    ruleId: 'js/sql-injection',
    severity: 'BLOCKER',
    nativeSeverity: 'critical',
    state: 'open',
    file: 'src/db.ts',
    line: 42,
  });
});

test('security severity wins over the SARIF level when both are present', () => {
  const { findings } = ingestAlerts([
    alert({ rule: { id: 'r', security_severity_level: 'low', severity: 'error' } }),
  ]);

  assert.equal(findings[0]?.severity, 'SUGGESTION');
});

test('the SARIF level is used when there is no security severity', () => {
  const { findings } = ingestAlerts([alert({ rule: { id: 'r', severity: 'warning' } })]);

  assert.equal(findings[0]?.severity, 'HIGH');
});

test('an alert with no rule id is reported and skipped', () => {
  const { findings, problems } = ingestAlerts([alert({ rule: {} })]);

  assert.deepEqual(findings, []);
  assert.match(problems[0] ?? '', /no rule id/);
});

test('an unknown severity falls back to SUGGESTION and says so', () => {
  const { findings, problems } = ingestAlerts([
    alert({ rule: { id: 'r', security_severity_level: 'apocalyptic' } }),
  ]);

  assert.equal(findings[0]?.severity, 'SUGGESTION');
  assert.match(problems[0] ?? '', /not in the severity map/);
});

test('a repository override changes the mapping', () => {
  assert.equal(mapSeverity('warning', { warning: 'BLOCKER' }).severity, 'BLOCKER');
});

test('an alert with no location is still a finding', () => {
  const { findings } = ingestAlerts([alert({ most_recent_instance: undefined })]);

  assert.equal(findings[0]?.file, null);
  assert.equal(findings[0]?.line, null);
});

const finding = (over = {}) => ({
  source: 'sarif',
  tool: 'CodeQL',
  ruleId: 'js/x',
  severity: 'BLOCKER',
  acted: false,
  ...over,
});

test('the two sources are aggregated apart and never merged', () => {
  // The single way this piece can make things worse: tuning Redline's rules on
  // another tool's noise.
  const agg = aggregateBySource([
    finding(),
    finding({ acted: true }),
    finding({ source: 'redline', tool: 'redline', ruleId: 'core/hardcoded-secrets', acted: true }),
  ]);

  assert.equal(agg.sarif.total, 2);
  assert.equal(agg.redline.total, 1);
  assert.deepEqual(Object.keys(agg.redline.byRule), ['core/hardcoded-secrets']);
  assert.deepEqual(Object.keys(agg.sarif.byRule), ['js/x']);
});

test('acted-on rate is computed within each source, never across them', () => {
  // Redline's "acted on" is a resolved review thread; a scanner's is a closed
  // alert. Averaging two different definitions describes neither.
  const agg = aggregateBySource([
    finding({ acted: true }),
    finding({ acted: false }),
    finding({ source: 'redline', acted: true }),
  ]);

  assert.equal(agg.sarif.actedRate, 0.5);
  assert.equal(agg.redline.actedRate, 1);
});

test('a source with nothing in it has a null rate, not a zero one', () => {
  const agg = aggregateBySource([finding()]);

  assert.equal(agg.redline.total, 0);
  assert.equal(agg.redline.actedRate, null);
});

test('a finding with an unknown source is ignored rather than miscounted', () => {
  const agg = aggregateBySource([finding({ source: 'somewhere-else' })]);

  assert.equal(agg.sarif.total, 0);
  assert.equal(agg.redline.total, 0);
});

test('per-tool counts survive aggregation, so one noisy scanner is identifiable', () => {
  const agg = aggregateBySource([finding(), finding({ tool: 'Semgrep' }), finding({ tool: 'Semgrep' })]);

  assert.deepEqual(agg.sarif.byTool, { CodeQL: 1, Semgrep: 2 });
});
