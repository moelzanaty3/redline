import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, parseManifest } from '../manifest.ts';
import { isRedlineError } from '../../core/errors.ts';
import { SKIP_WITHOUT_PERMISSION_ENFORCEMENT } from '../../core/__tests__/fs-permissions.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('loads the real manifest', () => {
  const m = loadManifest(ROOT);
  assert.equal(typeof m.version, 'string');
  assert.equal(m.core.source, 'standards/core.md');
  assert.ok(m.stacks['react']);
  assert.deepEqual(m.stacks['react-native']?.extends, ['react']);
  assert.deepEqual(m.profiles['web-react'], ['javascript', 'react']);
  assert.deepEqual(m.profiles['web-angular'], ['javascript', 'angular']);
  assert.equal(m.profileAliases['web'], 'web-react');
  assert.equal(m.profileAliases['mobile'], 'mobile-rn');
  assert.equal(m.vendors['cursor']?.enabled, true);
  assert.equal(m.vendors['codex']?.enabled, true);
  assert.equal(m.vendors['skills'], undefined);
});

test('a missing manifest is a host-independent usage failure', () => {
  assert.throws(
    () => loadManifest('/nonexistent-root'),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage' && /manifest/i.test(err.message),
  );
});

test('a manifest that cannot be read for permission reasons is a "permission" RedlineError', { skip: SKIP_WITHOUT_PERMISSION_ENFORCEMENT }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-manifest-'));
  t.after(() => {
    chmodSync(join(dir, 'standards', 'manifest.json'), 0o644);
    rmSync(dir, { recursive: true, force: true });
  });
  mkdirSync(join(dir, 'standards'), { recursive: true });
  const path = join(dir, 'standards', 'manifest.json');
  writeFileSync(path, '{}');
  chmodSync(path, 0o000);

  assert.throws(
    () => loadManifest(dir),
    (err: unknown) => isRedlineError(err) && err.kind === 'permission' && /permission/i.test(err.message),
  );
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

test('a "core" missing "source" throws a RedlineError', () => {
  assert.throws(
    () =>
      parseManifest({
        version: '0.0.1',
        core: { title: 'Core' },
        stacks: {},
        profiles: {},
        vendors: {},
      }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage' && /"core"/.test(err.message),
  );
});

test('a manifest with no "profileAliases" at all succeeds and yields {}', () => {
  const m = parseManifest({
    version: '0.0.1',
    core: { title: 'Core', source: 'standards/core.md' },
    stacks: {},
    profiles: {},
    vendors: {},
  });
  assert.deepEqual(m.profileAliases, {});
});

test('a manifest with a non-object "profileAliases" throws a RedlineError', () => {
  assert.throws(
    () =>
      parseManifest({
        version: '0.0.1',
        core: { title: 'Core', source: 'standards/core.md' },
        stacks: {},
        profiles: {},
        profileAliases: 'nope',
        vendors: {},
      }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage' && /"profileAliases"/.test(err.message),
  );
});
