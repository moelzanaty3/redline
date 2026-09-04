import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReview, renderFinding } from '../schema.ts';

const known = new Set(['react/effect-derived-state', 'core/hardcoded-secrets']);

const good = {
  findings: [
    {
      rule: 'react/effect-derived-state',
      severity: 'BLOCKER',
      file: 'src/App.tsx',
      line: 42,
      problem: 'state is synced in an effect instead of computed during render.',
      fix: 'Compute it during render.',
    },
  ],
};

test('a well-formed finding parses', () => {
  const result = parseReview(JSON.stringify(good), known);

  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.rejected, []);
});

test('a fenced response parses, because a model will fence more often than not', () => {
  const result = parseReview('```json\n' + JSON.stringify(good) + '\n```', known);

  assert.equal(result.findings.length, 1);
});

test('a finding citing a rule the prompt did not contain is rejected, not corrected', () => {
  // A model citing a rule the prompt did not carry has not applied the standard,
  // it has recalled one — and the id is what every measurement is keyed on.
  const result = parseReview(
    JSON.stringify({ findings: [{ ...good.findings[0], rule: 'go/ignored-error' }] }),
    known
  );

  assert.deepEqual(result.findings, []);
  assert.match(result.rejected[0]?.reason ?? '', /not one of the rules this review was given/);
});

test('an invented severity is rejected', () => {
  const result = parseReview(
    JSON.stringify({ findings: [{ ...good.findings[0], severity: 'CRITICAL' }] }),
    known
  );

  assert.deepEqual(result.findings, []);
  assert.match(result.rejected[0]?.reason ?? '', /not BLOCKER, HIGH or SUGGESTION/);
});

test('a finding with no problem statement is rejected', () => {
  const result = parseReview(
    JSON.stringify({ findings: [{ ...good.findings[0], problem: '  ' }] }),
    known
  );

  assert.match(result.rejected[0]?.reason ?? '', /nobody can act on/);
});

test('a bad line number is rejected rather than pointing at nothing', () => {
  const result = parseReview(
    JSON.stringify({ findings: [{ ...good.findings[0], line: 'somewhere' }] }),
    known
  );

  assert.match(result.rejected[0]?.reason ?? '', /is not a line number/);
});

test('a numeric string line is accepted, because models emit both', () => {
  const result = parseReview(JSON.stringify({ findings: [{ ...good.findings[0], line: '42' }] }), known);

  assert.equal(result.findings[0]?.line, 42);
});

test('one bad finding does not cost the good ones beside it', () => {
  const result = parseReview(
    JSON.stringify({ findings: [{ ...good.findings[0], rule: 'nope/nope' }, good.findings[0]] }),
    known
  );

  assert.equal(result.findings.length, 1);
  assert.equal(result.rejected.length, 1);
});

test('unparseable output is reported, not thrown', () => {
  const result = parseReview('I think the code looks fine!', known);

  assert.deepEqual(result.findings, []);
  assert.match(result.rejected[0]?.reason ?? '', /not valid JSON/);
});

test('an empty review is valid and produces nothing', () => {
  const result = parseReview(JSON.stringify({ findings: [] }), known);

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.rejected, []);
});

test('the output contract is rendered by code, never taken from the model', () => {
  // A model that writes the prefix itself will eventually write a severity that
  // does not exist, and every aggregate keyed on that line becomes fiction.
  const [finding] = parseReview(JSON.stringify(good), known).findings;

  assert.equal(
    renderFinding(finding!),
    'Redline/BLOCKER [react/effect-derived-state]: state is synced in an effect instead of computed during render. Compute it during render.'
  );
});

test('a model that pastes its own prefix cannot smuggle it through', () => {
  const result = parseReview(
    JSON.stringify({
      findings: [{ ...good.findings[0], problem: 'Redline/BLOCKER [made/up]: something' }],
    }),
    known
  );

  // The text is data. The prefix comes from the validated rule and severity.
  assert.match(renderFinding(result.findings[0]!), /^Redline\/BLOCKER \[react\/effect-derived-state\]:/);
});
