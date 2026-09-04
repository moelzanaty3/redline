import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeRegistry, parseRegistry } from '../serialize.ts';
import type { Registry, RegistryEntry } from '../types.ts';

const entry = (org: string, repo: string): RegistryEntry => ({
  host: 'github',
  org,
  repo,
  defaultBranch: 'main',
  profile: 'web',
  standardsVersion: '0.0.1',
  cliVersion: '0.0.1',
  onboardedAt: '2026-09-01T00:00:00.000Z',
});

test('serialize orders entries by org then repo, regardless of input order', () => {
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'zebra'), entry('acme', 'alpha'), entry('abc', 'thing')],
  };
  const names = parseRegistry(serializeRegistry(registry)).entries.map((e) => `${e.org}/${e.repo}`);
  assert.deepEqual(names, ['abc/thing', 'acme/alpha', 'acme/zebra']);
});

test('serialize is byte-stable across differently ordered inputs', () => {
  const a: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'alpha'), entry('acme', 'zebra')],
  };
  const b: Registry = { ...a, entries: [entry('acme', 'zebra'), entry('acme', 'alpha')] };
  assert.equal(serializeRegistry(a), serializeRegistry(b));
});

test('serialize ends with a trailing newline', () => {
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'alpha')],
  };
  assert.equal(serializeRegistry(registry).endsWith('\n'), true);
});

test('serialize does not mutate the caller’s entry array', () => {
  const entries = [entry('acme', 'zebra'), entry('acme', 'alpha')];
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries,
  };
  serializeRegistry(registry);
  assert.deepEqual(
    entries.map((e) => e.repo),
    ['zebra', 'alpha'],
  );
});

test('parseRegistry round-trips what serializeRegistry produced', () => {
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'alpha')],
  };
  assert.deepEqual(parseRegistry(serializeRegistry(registry)), registry);
});

test('parseRegistry rejects a non-object payload', () => {
  assert.throws(() => parseRegistry('[]'), /registry\.json is invalid/);
});

test('parseRegistry rejects entries that are not an array', () => {
  assert.throws(
    () => parseRegistry('{"generatedAt":"x","source":"y","entries":{}}'),
    /registry\.json is invalid/,
  );
});

test('parseRegistry rejects text that is not JSON at all', () => {
  assert.throws(() => parseRegistry('{ not json'), /registry\.json is invalid: not valid JSON/);
});
