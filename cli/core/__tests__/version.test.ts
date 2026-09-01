import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLI_VERSION } from '../version.ts';

test('CLI_VERSION matches package.json', () => {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.ok(typeof pkg === 'object' && pkg !== null && 'version' in pkg);
  assert.equal(CLI_VERSION, (pkg as { version: string }).version);
});
