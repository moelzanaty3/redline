import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('loads the real manifest', () => {
  const m = loadManifest(ROOT);
  assert.equal(typeof m.version, 'string');
  assert.equal(m.core.source, 'standards/core.md');
  assert.ok(m.stacks['react']);
  assert.deepEqual(m.stacks['react-native']?.extends, ['react']);
  assert.deepEqual(m.profiles['web'], ['javascript', 'react']);
  assert.equal(m.profileAliases['mobile'], 'mobile-rn');
  assert.equal(m.vendors['cursor']?.enabled, false);
});

test('a missing manifest is a host-independent usage failure', () => {
  assert.throws(() => loadManifest('/nonexistent-root'), /manifest/i);
});
