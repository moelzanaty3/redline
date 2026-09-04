import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costPerBlocker, readSpend } from '../spend.mjs';

test('a supplied figure carries its grain and its source', () => {
  const spend = readSpend({ total: 1200, currency: 'GBP', grain: 'org', source: 'vendor console' });

  assert.equal(spend.available, true);
  assert.equal(spend.grain, 'org');
  assert.equal(spend.currency, 'GBP');
  assert.equal(spend.source, 'vendor console');
});

test('an unrecognised grain becomes "unknown" rather than being trusted', () => {
  assert.equal(readSpend({ total: 10, grain: 'per-seat' }).grain, 'unknown');
});

test('no figure is unavailable with a reason, never zero', () => {
  const spend = readSpend(null);

  assert.equal(spend.available, false);
  assert.match(spend.reason, /usage reporting/);
});

test('a negative figure is refused', () => {
  assert.equal(readSpend({ total: -5 }).available, false);
});

test('cost per BLOCKER divides spend by what was actually caught', () => {
  const result = costPerBlocker(readSpend({ total: 400, grain: 'org' }), 20);

  assert.equal(result.value, 20);
  assert.equal(result.blockersCaught, 20);
});

test('no BLOCKERs is a refusal, not an infinity', () => {
  const result = costPerBlocker(readSpend({ total: 400, grain: 'org' }), 0);

  assert.equal(result.value, null);
  assert.match(result.reason, /nothing to divide by/);
});

test('an org-level figure cannot answer a per-repository question', () => {
  // The failure this prevents: org spend divided by repo count, presented as
  // per-repository cost. It looks precise, is invented, and is the number a
  // stakeholder will act on.
  const result = costPerBlocker(readSpend({ total: 400, grain: 'org' }), 20, { scope: 'repo' });

  assert.equal(result.value, null);
  assert.match(result.reason, /cannot be attributed per repository/);
  assert.match(result.reason, /org-level figure against org-level value/);
});

test('a per-repo figure answers a per-repo question', () => {
  const result = costPerBlocker(readSpend({ total: 40, grain: 'repo' }), 4, { scope: 'repo' });

  assert.equal(result.value, 10);
});

test('missing spend propagates its own reason rather than a generic one', () => {
  const result = costPerBlocker(readSpend(null), 20);

  assert.match(result.reason, /usage reporting/);
});
