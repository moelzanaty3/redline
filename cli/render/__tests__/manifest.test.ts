import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest, parseManifest } from '../manifest.ts';
import { isRedlineError } from '../../core/errors.ts';

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

test('a manifest missing "profiles" throws a RedlineError instead of returning a half-typed object', () => {
  assert.throws(
    () =>
      parseManifest({
        version: '0.0.1',
        core: { title: 'Core', source: 'standards/core.md' },
        stacks: {},
        vendors: {},
      }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage' && /"profiles"/.test(err.message),
  );
});

test('a manifest with a non-string "version" throws a RedlineError', () => {
  assert.throws(
    () =>
      parseManifest({
        version: 1,
        core: { title: 'Core', source: 'standards/core.md' },
        stacks: {},
        profiles: {},
        vendors: {},
      }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage' && /"version"/.test(err.message),
  );
});
