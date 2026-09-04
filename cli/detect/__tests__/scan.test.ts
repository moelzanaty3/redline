import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepo } from '../scan.ts';

const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

function fixture(): string {
  const dir = tempDir('redline-scan-');
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
  const dir = tempDir('redline-scan-bad-');
  writeFileSync(join(dir, 'package.json'), '{ not json');
  assert.equal(scanRepo(dir).packageJson, undefined);
});

test('a package.json with dependencies as a string degrades rather than crashing', () => {
  const dir = tempDir('redline-scan-strdeps-');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: 'not-an-object' }));
  assert.equal(scanRepo(dir).packageJson, undefined);
});

test('a package.json with dependencies as an array degrades rather than crashing', () => {
  const dir = tempDir('redline-scan-arrdeps-');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: ['react'] }));
  assert.equal(scanRepo(dir).packageJson, undefined);
});

test('a huge first subtree does not starve root-level manifests of the file budget', () => {
  const dir = tempDir('redline-scan-monorepo-');
  const big = join(dir, 'aaa-big');
  mkdirSync(big);
  for (let i = 0; i < 5001; i++) writeFileSync(join(big, `f${i}.txt`), '');
  writeFileSync(join(dir, 'go.mod'), 'module acme');
  writeFileSync(join(dir, 'pom.xml'), '<project/>');
  const { paths } = scanRepo(dir);
  assert.ok(paths.includes('go.mod'));
  assert.ok(paths.includes('pom.xml'));
});

test('files of a directory are emitted before any of its subdirectories are descended', () => {
  const dir = tempDir('redline-scan-bfs-');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub/nested.txt'), '');
  writeFileSync(join(dir, 'root-a.txt'), '');
  writeFileSync(join(dir, 'root-b.txt'), '');
  const { paths } = scanRepo(dir);
  const nested = paths.indexOf('sub/nested.txt');
  assert.ok(paths.indexOf('root-a.txt') < nested);
  assert.ok(paths.indexOf('root-b.txt') < nested);
});

test('an .xcodeproj directory is emitted as a path marker', () => {
  const dir = tempDir('redline-scan-xcodeproj-');
  mkdirSync(join(dir, 'App.xcodeproj'));
  writeFileSync(join(dir, 'App.xcodeproj/project.pbxproj'), '');
  const { paths } = scanRepo(dir);
  assert.ok(paths.includes('App.xcodeproj'));
});

test('an unreadable subdirectory is skipped rather than fatal', () => {
  const dir = tempDir('redline-scan-unreadable-');
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
