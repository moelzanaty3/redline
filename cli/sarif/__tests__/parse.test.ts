import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byTool, parseSarif } from '../parse.ts';
import { DEFAULT_SEVERITY_MAP } from '../map.ts';

const MAP = DEFAULT_SEVERITY_MAP;

const log = (runs: unknown[]) => JSON.stringify({ version: '2.1.0', runs });

const run = (name: string, results: unknown[], rules: unknown[] = []) => ({
  tool: { driver: { name, rules } },
  results,
});

const result = (over: Record<string, unknown> = {}) => ({
  ruleId: 'js/sql-injection',
  level: 'error',
  message: { text: 'user input reaches a query' },
  locations: [
    { physicalLocation: { artifactLocation: { uri: 'src/db.ts' }, region: { startLine: 42 } } },
  ],
  ...over,
});

test('normalises a result into a finding carrying its provenance', () => {
  const ingest = parseSarif(log([run('CodeQL', [result()])]), MAP);

  assert.deepEqual(ingest.problems, []);
  assert.deepEqual(ingest.findings[0], {
    source: 'sarif',
    tool: 'CodeQL',
    ruleId: 'js/sql-injection',
    severity: 'BLOCKER',
    nativeSeverity: 'error',
    message: 'user input reaches a query',
    file: 'src/db.ts',
    line: 42,
  });
});

test("an ingested rule id is never rewritten into a Redline id", () => {
  // Relabelling another tool's claim as a Redline rule would make every rule
  // aggregate in the estate fiction.
  const ingest = parseSarif(log([run('Semgrep', [result({ ruleId: 'python.lang.security.eval' })])]), MAP);

  assert.equal(ingest.findings[0]?.ruleId, 'python.lang.security.eval');
  assert.equal(ingest.findings[0]?.source, 'sarif');
});

test('a result with no location is kept — a finding without a line is still a finding', () => {
  const ingest = parseSarif(log([run('Snyk', [result({ locations: undefined })])]), MAP);

  assert.equal(ingest.findings.length, 1);
  assert.equal(ingest.findings[0]?.file, null);
  assert.equal(ingest.findings[0]?.line, null);
});

test('a result with no ruleId is reported and skipped, never given a synthetic id', () => {
  // A synthetic id aggregates with every other synthetic id and produces a
  // "rule" that means nothing.
  const ingest = parseSarif(log([run('Tool', [result({ ruleId: undefined })])]), MAP);

  assert.deepEqual(ingest.findings, []);
  assert.match(ingest.problems[0] ?? '', /has no ruleId/);
});

test("the rule table's default level is used when the result carries none", () => {
  const ingest = parseSarif(
    log([
      run('CodeQL', [result({ level: undefined })], [
        { id: 'js/sql-injection', defaultConfiguration: { level: 'warning' } },
      ]),
    ]),
    MAP
  );

  assert.equal(ingest.findings[0]?.severity, 'HIGH');
});

test("CodeQL's security-severity band is read when there is no level at all", () => {
  const ingest = parseSarif(
    log([run('CodeQL', [result({ level: undefined, properties: { 'security-severity': '9.3' } })])]),
    MAP
  );

  assert.equal(ingest.findings[0]?.severity, 'BLOCKER');
  assert.equal(ingest.findings[0]?.nativeSeverity, 'critical');
});

test('the security-severity band buckets rather than inventing precision', () => {
  const at = (score: string) =>
    parseSarif(
      log([run('CodeQL', [result({ level: undefined, properties: { 'security-severity': score } })])]),
      MAP
    ).findings[0]?.severity;

  assert.equal(at('9.0'), 'BLOCKER');
  assert.equal(at('7.5'), 'BLOCKER');
  assert.equal(at('5.0'), 'HIGH');
  assert.equal(at('1.0'), 'SUGGESTION');
});

test('a severity the map does not know is reported, so a bad mapping gets noticed', () => {
  const ingest = parseSarif(log([run('Weird', [result({ level: 'catastrophic' })])]), MAP);

  assert.equal(ingest.findings[0]?.severity, 'SUGGESTION');
  assert.match(ingest.problems[0] ?? '', /not in the severity map/);
});

test('a run with no results is silence, not a malformed file', () => {
  const ingest = parseSarif(log([run('CodeQL', [])]), MAP);

  assert.deepEqual(ingest.findings, []);
  assert.deepEqual(ingest.problems, []);
});

test('a run with a null results field is skipped without a problem', () => {
  const ingest = parseSarif(log([{ tool: { driver: { name: 'X' } } }]), MAP);

  assert.deepEqual(ingest.findings, []);
});

test('unparseable JSON is a named problem, never a thrown error', () => {
  // One malformed upload must not cost every other repository's findings in the
  // same collection pass.
  const ingest = parseSarif('{ not json', MAP, 'acme/web');

  assert.deepEqual(ingest.findings, []);
  assert.match(ingest.problems[0] ?? '', /acme\/web: not valid JSON/);
});

test('valid JSON that is not SARIF is refused by name', () => {
  const ingest = parseSarif('{"hello":true}', MAP, 'acme/web');

  assert.match(ingest.problems[0] ?? '', /not a SARIF log/);
});

test('multiple runs in one log keep their own tool attribution', () => {
  const ingest = parseSarif(
    log([run('CodeQL', [result()]), run('Semgrep', [result({ ruleId: 'py/eval' })])]),
    MAP
  );

  assert.deepEqual(byTool(ingest.findings), { CodeQL: 1, Semgrep: 1 });
});

test('a run with no tool name is attributed to "unknown", not to the previous run', () => {
  const ingest = parseSarif(log([{ tool: {}, results: [result()] }]), MAP);

  assert.equal(ingest.findings[0]?.tool, 'unknown');
});

test('one bad result does not cost the good ones beside it', () => {
  const ingest = parseSarif(
    log([run('Tool', [result({ ruleId: undefined }), result({ ruleId: 'js/xss' })])]),
    MAP
  );

  assert.deepEqual(ingest.findings.map((f) => f.ruleId), ['js/xss']);
  assert.equal(ingest.problems.length, 1);
});
