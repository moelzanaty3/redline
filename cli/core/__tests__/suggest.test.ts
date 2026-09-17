import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closest } from '../suggest.ts';

test('a near miss suggests the name it was meant to be', () => {
  assert.equal(closest('--dryrun', ['--dry-run', '--json']), '--dry-run');
  assert.equal(closest('veriy', ['init', 'verify', 'review']), 'verify');
});

test('nothing close enough suggests nothing', () => {
  assert.equal(closest('refactor', ['init', 'verify', 'remove']), undefined);
  assert.equal(closest('--nope', ['--dry-run', '--json']), undefined);
});
