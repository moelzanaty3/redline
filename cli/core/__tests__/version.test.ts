import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLI_VERSION, parseVersion } from '../version.ts';
import { isRedlineError } from '../errors.ts';

test('CLI_VERSION matches package.json', () => {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.ok(typeof pkg === 'object' && pkg !== null && 'version' in pkg);
  assert.equal(CLI_VERSION, (pkg as { version: string }).version);
});

test('parseVersion throws a RedlineError for a non-object payload', () => {
  assert.throws(
    () => parseVersion(null),
    (err: unknown) => isRedlineError(err) && err.kind === 'failed',
  );
  assert.throws(
    () => parseVersion('not an object'),
    (err: unknown) => isRedlineError(err) && err.kind === 'failed',
  );
});

test('parseVersion throws a RedlineError when "version" is missing or not a string', () => {
  assert.throws(
    () => parseVersion({}),
    (err: unknown) => isRedlineError(err) && err.kind === 'failed',
  );
  assert.throws(
    () => parseVersion({ version: 123 }),
    (err: unknown) => isRedlineError(err) && err.kind === 'failed',
  );
});
