import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SEVERITY_MAP,
  FALLBACK_SEVERITY,
  mapSeverity,
  mostSevere,
  resolveSeverityMap,
} from '../map.ts';

test('SARIF levels map to the three Redline severities', () => {
  assert.equal(mapSeverity('error', DEFAULT_SEVERITY_MAP).severity, 'BLOCKER');
  assert.equal(mapSeverity('warning', DEFAULT_SEVERITY_MAP).severity, 'HIGH');
  assert.equal(mapSeverity('note', DEFAULT_SEVERITY_MAP).severity, 'SUGGESTION');
});

test('mapping is case-insensitive, because producers disagree about case', () => {
  assert.equal(mapSeverity('ERROR', DEFAULT_SEVERITY_MAP).severity, 'BLOCKER');
  assert.equal(mapSeverity(' Critical ', DEFAULT_SEVERITY_MAP).severity, 'BLOCKER');
});

test('an unrecognised severity falls back to SUGGESTION, never BLOCKER', () => {
  // A wrong BLOCKER blocks a merge and teaches people the gate is noise. A wrong
  // SUGGESTION is a line in a report.
  const mapped = mapSeverity('catastrophic', DEFAULT_SEVERITY_MAP);

  assert.equal(mapped.severity, FALLBACK_SEVERITY);
  assert.equal(mapped.matched, false);
});

test('the producer’s own word is kept beside the mapped one', () => {
  // So a disagreement about the mapping is arguable from the record instead of
  // needing the ingest re-run.
  assert.equal(mapSeverity('moderate', DEFAULT_SEVERITY_MAP).native, 'moderate');
});

test('a missing severity is not matched, and does not claim a native word', () => {
  const mapped = mapSeverity(undefined, DEFAULT_SEVERITY_MAP);

  assert.equal(mapped.matched, false);
  assert.equal(mapped.native, '');
});

test('a repository override wins over the default', () => {
  const { map, problems } = resolveSeverityMap({ warning: 'BLOCKER' });

  assert.deepEqual(problems, []);
  assert.equal(mapSeverity('warning', map).severity, 'BLOCKER');
  assert.equal(mapSeverity('note', map).severity, 'SUGGESTION', 'unrelated entries survive');
});

test('an invalid override is refused by name, not silently ignored', () => {
  // Silently ignoring it leaves a repository believing it raised a severity it
  // did not.
  const { map, problems } = resolveSeverityMap({ error: 'CRITICAL' });

  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? '', /severityMap\["error"\]/);
  assert.equal(mapSeverity('error', map).severity, 'BLOCKER', 'the default still applies');
});

test('an override that is not an object is refused', () => {
  assert.match(resolveSeverityMap(['error']).problems[0] ?? '', /must be an object/);
  assert.match(resolveSeverityMap('error').problems[0] ?? '', /must be an object/);
});

test('no override is not an error', () => {
  assert.deepEqual(resolveSeverityMap(undefined).problems, []);
  assert.deepEqual(resolveSeverityMap(null).problems, []);
});

test('mostSevere picks the worst, and null from nothing', () => {
  assert.equal(mostSevere(['SUGGESTION', 'BLOCKER', 'HIGH']), 'BLOCKER');
  assert.equal(mostSevere(['SUGGESTION']), 'SUGGESTION');
  assert.equal(mostSevere([]), null);
});
