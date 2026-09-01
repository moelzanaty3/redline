import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
