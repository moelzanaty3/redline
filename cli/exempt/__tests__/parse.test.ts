import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { covers, parseExemption, MAX_DAYS } from '../parse.ts';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const iso = (daysFromNow: number) =>
  new Date(NOW.getTime() + daysFromNow * 86400000).toISOString().slice(0, 10);

const body = (fields: string) => `## Summary\n\nSomething.\n\n## Redline exemption\n\n${fields}\n\n## Notes\n\nrest\n`;

test('parses a complete exemption', () => {
  const result = parseExemption(
    body(`- reason: the upstream fix lands in v4 and we are pinned to v3 until the migration\n- until: ${iso(14)}\n- scope: checklist`),
    NOW
  );

  assert.equal(result.problems.length, 0);
  assert.equal(result.exemption?.until, iso(14));
  assert.deepEqual(result.exemption?.scope, ['checklist']);
  assert.match(result.exemption?.reason ?? '', /upstream fix lands/);
});

test('no exemption block at all is the failure a bare label now produces', () => {
  const result = parseExemption('## Summary\n\nnothing here\n', NOW);

  assert.equal(result.exemption, null);
  assert.equal(result.problems[0]?.problem, 'no-block');
  assert.match(result.problems[0]?.detail ?? '', /a label alone no longer exempts/);
});

test('a missing reason is refused', () => {
  const result = parseExemption(body(`- until: ${iso(10)}`), NOW);

  assert.equal(result.problems[0]?.problem, 'no-reason');
});

test('a reason too short to tell a later reader anything is refused', () => {
  const result = parseExemption(body(`- reason: needed\n- until: ${iso(10)}`), NOW);

  assert.equal(result.problems[0]?.problem, 'reason-too-short');
});

test('a missing until is refused — an exemption with no end is permanent by accident', () => {
  const result = parseExemption(body('- reason: this is a long enough reason to pass the length check'), NOW);

  assert.equal(result.problems[0]?.problem, 'no-until');
});

test('an expired exemption stops exempting', () => {
  const result = parseExemption(
    body(`- reason: this is a long enough reason to pass the length check\n- until: ${iso(-1)}`),
    NOW
  );

  assert.equal(result.exemption, null);
  assert.equal(result.problems[0]?.problem, 'until-past');
  assert.match(result.problems[0]?.detail ?? '', /renew it deliberately/);
});

test('an exemption expiring today is still valid — the day it names is inclusive', () => {
  const result = parseExemption(
    body(`- reason: this is a long enough reason to pass the length check\n- until: ${iso(0)}`),
    NOW
  );

  assert.notEqual(result.exemption, null);
});

test(`an exemption beyond ${MAX_DAYS} days is a standards change, not an exemption`, () => {
  const result = parseExemption(
    body(`- reason: this is a long enough reason to pass the length check\n- until: ${iso(MAX_DAYS + 5)}`),
    NOW
  );

  assert.equal(result.problems[0]?.problem, 'until-too-far');
});

test('an unparseable date is named rather than silently treated as absent', () => {
  const result = parseExemption(
    body('- reason: this is a long enough reason to pass the length check\n- until: next tuesday'),
    NOW
  );

  assert.equal(result.problems[0]?.problem, 'until-unparseable');
});

test('an omitted scope means every soft-failing check, as the bare label meant implicitly', () => {
  const result = parseExemption(
    body(`- reason: this is a long enough reason to pass the length check\n- until: ${iso(5)}`),
    NOW
  );

  assert.deepEqual(result.exemption?.scope, ['*']);
  assert.equal(covers(result.exemption!, 'checklist'), true);
});

test('a scoped exemption does not cover a check it does not name', () => {
  const result = parseExemption(
    body(`- reason: this is a long enough reason to pass the length check\n- until: ${iso(5)}\n- scope: adr`),
    NOW
  );

  assert.equal(covers(result.exemption!, 'adr'), true);
  assert.equal(covers(result.exemption!, 'checklist'), false);
});

test('the reason stops at the next heading rather than swallowing the body', () => {
  const result = parseExemption(
    `## Redline exemption\n\n- reason: this is a long enough reason to pass the length check\n- until: ${iso(5)}\n\n## Rollback\n\n- until: 2099-01-01\n`,
    NOW
  );

  // The `until` in the later section must not be picked up: it would silently
  // extend every exemption to whatever a rollback note happened to mention.
  assert.equal(result.exemption?.until, iso(5));
});

test('the heading is matched case-insensitively', () => {
  const result = parseExemption(
    `## REDLINE EXEMPTION\n- reason: this is a long enough reason to pass the length check\n- until: ${iso(5)}`,
    NOW
  );

  assert.notEqual(result.exemption, null);
});

test('fields parse without list markers too', () => {
  const result = parseExemption(
    `## Redline exemption\n\nreason: this is a long enough reason to pass the length check\nuntil: ${iso(5)}\n`,
    NOW
  );

  assert.notEqual(result.exemption, null);
});

// --- regressions -------------------------------------------------------------

test('the shipped template, filled in as documented, actually parses', () => {
  // It did not. The template explains each field in an HTML comment that
  // necessarily contains the words `reason:`, `until:` and `scope:`, so the
  // parser read the instructions and rejected every real exemption. Reading the
  // real file rather than a fixture is the point: a fixture would have passed.
  const template = readFileSync(
    fileURLToPath(new URL('../../../.github/pull_request_template.md', import.meta.url)),
    'utf8'
  );
  const filled = template
    .replace(/^- reason:\s*$/m, '- reason: the upstream fix lands in v4 and we are pinned until then')
    .replace(/^- until:\s*$/m, `- until: ${iso(20)}`)
    .replace(/^- scope:\s*$/m, '- scope: checklist');

  const result = parseExemption(filled, NOW);

  assert.deepEqual(result.problems, []);
  assert.equal(result.exemption?.scope[0], 'checklist');
});

test('the template left untouched exempts nothing', () => {
  const template = readFileSync(
    fileURLToPath(new URL('../../../.github/pull_request_template.md', import.meta.url)),
    'utf8'
  );

  assert.equal(parseExemption(template, NOW).exemption, null);
});

test('an exemption exactly at the maximum is allowed, not refused as one over', () => {
  const at = (d: number) =>
    `## Redline exemption\n- reason: a reason long enough to pass the length check\n- until: ${iso(d)}`;

  assert.notEqual(parseExemption(at(MAX_DAYS), NOW).exemption, null);
  assert.equal(parseExemption(at(MAX_DAYS + 1), NOW).exemption, null);
});
