import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedlineError, exitCodeFor, isRedlineError } from '../errors.ts';

test('each kind maps to its documented exit code', () => {
  assert.equal(exitCodeFor('failed'), 1);
  assert.equal(exitCodeFor('usage'), 2);
  assert.equal(exitCodeFor('permission'), 3);
  assert.equal(exitCodeFor('host'), 4);
});

test('the error carries its own exit code and hint', () => {
  const err = new RedlineError('usage', 'unknown profile "nope"', 'run redline init --help');
  assert.equal(err.exitCode, 2);
  assert.equal(err.kind, 'usage');
  assert.equal(err.message, 'unknown profile "nope"');
  assert.equal(err.hint, 'run redline init --help');
  assert.equal(err.name, 'RedlineError');
});

test('isRedlineError narrows and rejects a plain Error', () => {
  assert.equal(isRedlineError(new RedlineError('host', 'boom')), true);
  assert.equal(isRedlineError(new Error('boom')), false);
  assert.equal(isRedlineError('boom'), false);
});
