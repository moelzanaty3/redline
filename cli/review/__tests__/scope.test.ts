import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../../render/manifest.ts';
import { minimatch } from '../glob.ts';
import { resolveScope } from '../scope.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = loadManifest(ROOT);

test('only the stacks whose globs match a changed file are in scope', () => {
  // The whole point over "ask an assistant to review my diff": a model handed
  // twelve stacks spends most of its attention on languages the diff never touches.
  const scope = resolveScope(manifest, 'web', ['src/App.tsx']);

  assert.ok(scope.stacks.includes('react'));
  assert.equal(scope.stacks.includes('terraform'), false);
});

test('a change touching two stacks brings both', () => {
  const scope = resolveScope(manifest, 'web', ['src/App.tsx', 'scripts/build.mjs']);

  assert.ok(scope.stacks.includes('react'));
  assert.ok(scope.stacks.includes('javascript'));
});

test('a file no stack covers is reported, not silently dropped', () => {
  // A file nothing covers is a gap in the standard, and reviewing it against
  // core alone while saying nothing hides that.
  const scope = resolveScope(manifest, 'web', ['README.md']);

  assert.deepEqual(scope.uncovered, ['README.md']);
  assert.deepEqual(scope.stacks, []);
});

test('the profile order is preserved, so a stack comes after the one it extends', () => {
  const scope = resolveScope(manifest, 'mobile-rn', ['src/App.native.tsx', 'src/util.ts']);

  const react = scope.stacks.indexOf('react');
  const rn = scope.stacks.indexOf('react-native');
  if (react !== -1 && rn !== -1) assert.ok(react < rn, 'react must precede react-native');
});

test('an empty change has an empty scope rather than every stack', () => {
  assert.deepEqual(resolveScope(manifest, 'web', []).stacks, []);
});

// --- the glob subset ---------------------------------------------------------

test('** crosses directories and * does not', () => {
  assert.equal(minimatch('src/deep/a.ts', '**/*.ts'), true);
  assert.equal(minimatch('a.ts', '**/*.ts'), true, 'the zero-directory case');
  assert.equal(minimatch('src/deep/a.ts', 'src/*.ts'), false);
  assert.equal(minimatch('src/a.ts', 'src/*.ts'), true);
});

test('a dot in a pattern is a literal dot, not any character', () => {
  // Without escaping, **/*.ts would match "atsx" and quietly widen every stack.
  assert.equal(minimatch('srcXts', '**/*.ts'), false);
});

test('? matches one character but never a slash', () => {
  assert.equal(minimatch('a.ts', '?.ts'), true);
  assert.equal(minimatch('a/b.ts', '?/b.ts'), true);
  assert.equal(minimatch('ab.ts', '?.ts'), false);
});

test('every glob in the shipped manifest is expressible by this subset', () => {
  // validate.mjs already refuses negation, braces and commas at build time, so
  // this asserts the two agree rather than trusting that they do.
  for (const [id, stack] of Object.entries(manifest.stacks)) {
    for (const glob of stack.globs) {
      assert.equal(glob.startsWith('!'), false, `${id}: ${glob}`);
      assert.equal(glob.includes('{'), false, `${id}: ${glob}`);
      assert.equal(glob.includes(','), false, `${id}: ${glob}`);
      assert.doesNotThrow(() => minimatch('a/b.ts', glob), `${id}: ${glob}`);
    }
  }
});
