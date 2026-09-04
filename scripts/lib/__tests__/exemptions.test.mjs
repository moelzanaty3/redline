import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readExemption, standingExemptions } from '../exemptions.mjs';

const block = (until, scope = 'checklist') =>
  `## Summary\n\nx\n\n## Redline exemption\n\n- reason: a reason long enough to be useful to a later reader\n- until: ${until}\n- scope: ${scope}\n`;

test('reads a structured exemption out of a pull request body', () => {
  const exemption = readExemption(block('2026-10-01'));

  assert.equal(exemption?.until, '2026-10-01');
  assert.deepEqual(exemption?.scope, ['checklist']);
});

test('a body with no block reads as no exemption, not as an empty one', () => {
  assert.equal(readExemption('## Summary\n\nnothing\n'), null);
  assert.equal(readExemption(''), null);
  assert.equal(readExemption(null), null);
});

test('a block missing a required field is not an exemption', () => {
  assert.equal(readExemption('## Redline exemption\n- reason: something long enough to count\n'), null);
  assert.equal(readExemption('## Redline exemption\n- until: 2026-10-01\n'), null);
});

test('an omitted scope reads as everything, matching the CLI', () => {
  const exemption = readExemption(
    '## Redline exemption\n- reason: a reason long enough to be useful\n- until: 2026-10-01\n'
  );

  assert.deepEqual(exemption?.scope, ['*']);
});

test('the reason stops at the next heading', () => {
  const exemption = readExemption(
    '## Redline exemption\n- reason: a reason long enough to be useful\n- until: 2026-10-01\n\n## Rollback\n- until: 2099-01-01\n'
  );

  assert.equal(exemption?.until, '2026-10-01');
});

const record = (repo, until, scope = ['checklist']) => ({
  repo,
  exemption: { reason: 'r', until, scope },
});

test('standing exemptions group by scope and count the repositories using each', () => {
  const standing = standingExemptions(
    [
      record('acme/web', '2026-10-01'),
      record('acme/api', '2026-10-05'),
      record('acme/web', '2026-10-09'),
      record('acme/infra', '2026-10-02', ['adr']),
    ],
    new Date('2026-09-04T00:00:00.000Z')
  );

  assert.deepEqual(standing[0], { scope: 'checklist', count: 3, repos: 2, soonest: '2026-10-01' });
  assert.deepEqual(standing[1], { scope: 'adr', count: 1, repos: 1, soonest: '2026-10-02' });
});

test('an expired exemption is history, not a standing one', () => {
  // Counting it would make a resolved problem look permanent.
  const standing = standingExemptions(
    [record('acme/web', '2026-01-01'), record('acme/api', '2026-10-01')],
    new Date('2026-09-04T00:00:00.000Z')
  );

  assert.equal(standing.length, 1);
  assert.equal(standing[0]?.count, 1);
});

test('a pull request with no exemption contributes nothing', () => {
  const standing = standingExemptions([{ repo: 'acme/web' }], new Date('2026-09-04T00:00:00.000Z'));

  assert.deepEqual(standing, []);
});

test('a wildcard scope is reported as itself, not expanded', () => {
  // Expanding it would invent checks the author never named and make the trend
  // unreadable.
  const standing = standingExemptions([record('acme/web', '2026-10-01', ['*'])], new Date('2026-09-04'));

  assert.equal(standing[0]?.scope, '*');
});
