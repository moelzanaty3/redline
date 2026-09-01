import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';

const manifest = loadManifest(fileURLToPath(new URL('../../../', import.meta.url)));

test('resolves a plain profile in manifest order', () => {
  assert.deepEqual(resolveProfile(manifest, 'web'), { profile: 'web', stacks: ['javascript', 'react'] });
});

test('resolves an alias to its target key', () => {
  const r = resolveProfile(manifest, 'mobile');
  assert.equal(r.profile, 'mobile-rn');
});

test('a parent stack always precedes the child that extends it', () => {
  const { stacks } = resolveProfile(manifest, 'mobile-rn');
  assert.deepEqual(stacks, ['javascript', 'react', 'react-native']);
});

test('a stack is listed once even when reached twice', () => {
  const { stacks } = resolveProfile(manifest, 'fullstack-node');
  assert.equal(new Set(stacks).size, stacks.length);
});

test('an unknown profile names the known ones', () => {
  assert.throws(
    () => resolveProfile(manifest, 'nope'),
    /^Error: unknown profile "nope"\. Known: tooling, web, /
  );
});
