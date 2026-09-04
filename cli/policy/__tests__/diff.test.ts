import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../diff.ts';

const diff = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,4 @@ function x() {
 const keep = 1;
-const gone = 2;
+const added = 3;
+const also = 4;
 const tail = 5;
`;

test('reports added lines with their file and line number', () => {
  assert.deepEqual(parseDiff(diff), [
    { file: 'src/a.ts', line: 11, text: 'const added = 3;' },
    { file: 'src/a.ts', line: 12, text: 'const also = 4;' },
  ]);
});

test('a removed line does not advance the new-file line counter', () => {
  // Off-by-one here points every finding at the wrong line, which is worse than
  // no finding: a reviewer opens the file, sees nothing wrong, and stops trusting it.
  const lines = parseDiff(diff);
  assert.equal(lines[0]?.line, 11);
});

test('multiple files keep their own paths', () => {
  const two = `--- a/one.ts
+++ b/one.ts
@@ -1 +1,2 @@
 x
+first
--- a/two.ts
+++ b/two.ts
@@ -1 +1,2 @@
 y
+second
`;
  assert.deepEqual(
    parseDiff(two).map((l) => `${l.file}:${l.line}`),
    ['one.ts:2', 'two.ts:2']
  );
});

test('a deletion contributes nothing and does not attribute lines to /dev/null', () => {
  const deletion = `--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
`;
  assert.deepEqual(parseDiff(deletion), []);
});

test('a new file starts at line 1', () => {
  const created = `--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+one
+two
`;
  assert.deepEqual(parseDiff(created), [
    { file: 'new.ts', line: 1, text: 'one' },
    { file: 'new.ts', line: 2, text: 'two' },
  ]);
});

test('diff metadata is not mistaken for content', () => {
  const noisy = `diff --git a/a.ts b/a.ts
new file mode 100644
index 000..111
--- /dev/null
+++ b/a.ts
@@ -0,0 +1 @@
+real
\\ No newline at end of file
`;
  assert.deepEqual(parseDiff(noisy), [{ file: 'a.ts', line: 1, text: 'real' }]);
});

test('an empty diff is empty, not an error', () => {
  assert.deepEqual(parseDiff(''), []);
});

test('several hunks in one file each reset the line counter', () => {
  const hunks = `--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,2 @@
 x
+near-top
@@ -50,1 +51,2 @@
 y
+near-bottom
`;
  assert.deepEqual(
    parseDiff(hunks).map((l) => l.line),
    [2, 52]
  );
});

test('a deleted file contributes nothing and does not leak onto the previous file', () => {
  // `+++ /dev/null` did not match the file header, fell through to the
  // added-line branch, and became a phantom line of content attributed to the
  // file before it — so deleting a file could raise a finding on a file the
  // change never touched.
  const mixed = `--- a/keep.ts
+++ b/keep.ts
@@ -1,1 +1,2 @@
 x
+real line
--- a/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-was here
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+created
`;

  assert.deepEqual(parseDiff(mixed), [
    { file: 'keep.ts', line: 2, text: 'real line' },
    { file: 'new.ts', line: 1, text: 'created' },
  ]);
});
