import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepo } from '../scan.ts';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'node_modules/react'), { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '19.0.0' } }));
  writeFileSync(join(dir, 'src/App.tsx'), 'export {}');
  writeFileSync(join(dir, 'node_modules/react/index.js'), '');
  writeFileSync(join(dir, '.git/config'), '');
  return dir;
}

test('returns repo-relative posix paths', () => {
  const { paths } = scanRepo(fixture());
  assert.ok(paths.includes('src/App.tsx'));
  assert.ok(paths.includes('package.json'));
});

test('skips node_modules and .git', () => {
  const { paths } = scanRepo(fixture());
  assert.ok(!paths.some((p) => p.startsWith('node_modules/')));
  assert.ok(!paths.some((p) => p.startsWith('.git/')));
});

test('reads package.json when present', () => {
  const { packageJson } = scanRepo(fixture());
  assert.equal(packageJson?.dependencies?.['react'], '19.0.0');
});

test('a malformed package.json is ignored rather than fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-bad-'));
  writeFileSync(join(dir, 'package.json'), '{ not json');
  assert.equal(scanRepo(dir).packageJson, undefined);
});

test('a package.json with dependencies as a string degrades rather than crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-strdeps-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: 'not-an-object' }));
  assert.equal(scanRepo(dir).packageJson, undefined);
});

test('a package.json with dependencies as an array degrades rather than crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-arrdeps-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: ['react'] }));
  assert.equal(scanRepo(dir).packageJson, undefined);
});

test('an unreadable subdirectory is skipped rather than fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-unreadable-'));
  const blocked = join(dir, 'blocked');
  mkdirSync(blocked);
  writeFileSync(join(blocked, 'secret.txt'), '');
  writeFileSync(join(dir, 'visible.txt'), '');
  chmodSync(blocked, 0o000);
  try {
    const { paths } = scanRepo(dir);
    assert.ok(paths.includes('visible.txt'));
    assert.ok(!paths.some((p) => p.startsWith('blocked/')));
  } finally {
    chmodSync(blocked, 0o755);
  }
});
