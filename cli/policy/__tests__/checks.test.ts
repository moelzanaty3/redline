import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, formatFinding, runChecks } from '../checks.ts';
import type { AddedLine } from '../diff.ts';

const line = (text: string, file = 'src/a.ts', n = 1): AddedLine => ({ file, line: n, text });
const ctx = (added: AddedLine[]) => ({ added, files: [...new Set(added.map((a) => a.file))], body: '' });
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);

// --- core/untracked-todo -----------------------------------------------------

test('a TODO with no ticket reference is flagged', () => {
  const result = runChecks(ctx([line('// TODO: fix the retry logic')]));

  assert.deepEqual(ids(result), ['core/untracked-todo']);
  assert.match(result.findings[0]?.problem ?? '', /no ticket reference/);
});

test('a TODO carrying a ticket is not flagged', () => {
  assert.deepEqual(ids(runChecks(ctx([line('// TODO(ABC-123): fix the retry logic')]))), []);
  assert.deepEqual(ids(runChecks(ctx([line('// TODO: fix this, see #482')]))), []);
  assert.deepEqual(
    ids(runChecks(ctx([line('// TODO https://linear.app/x/issue/ENG-9')]))),
    []
  );
});

test('FIXME, HACK and XXX count as TODOs, because they are', () => {
  for (const word of ['FIXME', 'HACK', 'XXX']) {
    assert.deepEqual(ids(runChecks(ctx([line(`// ${word}: later`)]))), ['core/untracked-todo'], word);
  }
});

test('a word merely containing "todo" is not a TODO', () => {
  assert.deepEqual(ids(runChecks(ctx([line('const todoList = [];')]))), []);
});

// --- core/type-checker-suppression -------------------------------------------

test('a suppression with no ticket is a BLOCKER', () => {
  const result = runChecks(ctx([line('// @ts-ignore because the types are wrong')]));

  assert.deepEqual(ids(result), ['core/type-checker-suppression']);
  assert.equal(result.findings[0]?.severity, 'BLOCKER');
});

test('a suppression with a ticket is allowed — the rule asks for both', () => {
  assert.deepEqual(
    ids(runChecks(ctx([line('// @ts-expect-error upstream types are wrong, ENG-441')]))),
    []
  );
});

// One case per stack Redline renders rules for. A dialect missing from here is
// a stack where this BLOCKER installs and can never fire, which reads in the
// gate exactly like a repository that has no suppressions in it.
test('every suppression dialect is covered, not just TypeScript', () => {
  const dialects = [
    ['# type: ignore', 'src/a.py'],
    ['# noqa', 'src/a.py'],
    ['# pylint: disable=no-member', 'src/a.py'],
    ['@SuppressWarnings("unchecked")', 'src/A.java'],
    ['@Suppress("UNCHECKED_CAST")', 'src/A.kt'],
    ['eslint-disable-next-line', 'src/a.js'],
    ['// @ts-nocheck', 'src/a.ts'],
    ['// swiftlint:disable force_cast', 'Sources/A.swift'],
    ['#pragma warning disable CS0168', 'src/A.cs'],
  ] as const;

  for (const [s, file] of dialects) {
    assert.deepEqual(
      ids(runChecks(ctx([line(`code ${s}`, file)]))),
      ['core/type-checker-suppression'],
      s
    );
  }
});

// The spacing bug this list shipped with, pinned so it cannot come back.
// golangci-lint only honours a directive written `//nolint` with no space; the
// checker looked for `// nolint` with one, so the only Go form it recognised
// was the form Go itself ignores.
test('the Go directive is matched as golangci-lint actually writes it', () => {
  assert.deepEqual(
    ids(runChecks(ctx([line('x := unsafe() //nolint:errcheck', 'main.go')]))),
    ['core/type-checker-suppression']
  );
});

test('a suppression in any dialect is allowed once it carries a ticket', () => {
  for (const s of [
    '// swiftlint:disable force_cast — ENG-812',
    '@Suppress("UNCHECKED_CAST") // ENG-812',
    'x := unsafe() //nolint:errcheck // ENG-812',
    '#pragma warning disable CS0168 // ENG-812',
  ]) {
    assert.deepEqual(ids(runChecks(ctx([line(s, 'src/a.kt')]))), [], s);
  }
});

// --- javascript/var-in-new-code ----------------------------------------------

test('var on an added line in a JS-like file is flagged', () => {
  assert.deepEqual(ids(runChecks(ctx([line('  var total = 0;')]))), ['javascript/var-in-new-code']);
});

test('var is not flagged in a file the rule does not apply to', () => {
  assert.deepEqual(ids(runChecks(ctx([line('var x = 1', 'notes.md')]))), []);
});

test('a word ending in var is not a var declaration', () => {
  assert.deepEqual(ids(runChecks(ctx([line('const myvar = 1;'), line('obj.var = 2;')]))), []);
});

// --- javascript/unsafe-numeric-coercion --------------------------------------

test('parseInt without a radix is flagged', () => {
  assert.deepEqual(ids(runChecks(ctx([line('const n = parseInt(input);')]))), [
    'javascript/unsafe-numeric-coercion',
  ]);
});

test('parseInt with a radix is not', () => {
  assert.deepEqual(ids(runChecks(ctx([line('const n = parseInt(input, 10);')]))), []);
});

// --- the contract ------------------------------------------------------------

test('findings are ordered by file then line, so a re-run does not look like a change', () => {
  const result = runChecks(
    ctx([
      line('// TODO: b', 'src/b.ts', 9),
      line('// TODO: a', 'src/a.ts', 40),
      line('// TODO: a-early', 'src/a.ts', 2),
    ])
  );

  assert.deepEqual(
    result.findings.map((f) => `${f.file}:${f.line}`),
    ['src/a.ts:2', 'src/a.ts:40', 'src/b.ts:9']
  );
});

test('the output contract is rendered by code, never free-typed', () => {
  const [first] = runChecks(ctx([line('// TODO: x')])).findings;

  assert.match(formatFinding(first!), /^Redline\/HIGH \[core\/untracked-todo\]: /);
});

test('every check reports the rule id it implements, unchanged', () => {
  // Rule ids are permanent. A reclassification that renamed one would orphan
  // every historical telemetry record keyed on it.
  for (const [id, check] of Object.entries(CHECKS)) {
    const findings = check(ctx([line('// TODO x'), line('var a = parseInt(b);'), line('// @ts-ignore')]));
    for (const f of findings) assert.equal(f.ruleId, id);
  }
});

test('evaluated names what ran, so "no finding" is distinguishable from "not checked"', () => {
  const result = runChecks(ctx([]));

  assert.deepEqual(result.evaluated.sort(), Object.keys(CHECKS).sort());
  assert.deepEqual(result.findings, []);
});

test('an unknown rule id in the selection is skipped rather than crashing the gate', () => {
  const result = runChecks(ctx([line('// TODO: x')]), ['core/untracked-todo', 'core/does-not-exist']);

  assert.deepEqual(result.evaluated, ['core/untracked-todo']);
  assert.equal(result.findings.length, 1);
});

test('a clean diff produces nothing', () => {
  assert.deepEqual(
    runChecks(ctx([line('const total = parseInt(raw, 10); // ENG-1 tracked')])).findings,
    []
  );
});

// --- regressions -------------------------------------------------------------

test('a correctly written parseInt with a nested call is not flagged', () => {
  // The old pattern scanned for a comma with [^,)]*, which a nested call hid —
  // so the checker flagged its own source.
  assert.deepEqual(ids(runChecks(ctx([line('const n = parseInt(String(x), 10);')]))), []);
  assert.deepEqual(ids(runChecks(ctx([line('const n = parseInt(raw.trim(), 10);')]))), []);
});

test('a missing radix is still caught, nested call or not', () => {
  assert.deepEqual(ids(runChecks(ctx([line('const n = parseInt(String(x));')]))), [
    'javascript/unsafe-numeric-coercion',
  ]);
});

test('prose about var is not a var declaration', () => {
  // Reporting "use const" on the sentence "avoid var declarations here" is the
  // kind of finding that teaches a team the checker is noise.
  assert.deepEqual(ids(runChecks(ctx([line('// avoid var declarations here')]))), []);
  assert.deepEqual(ids(runChecks(ctx([line(' * var is function-scoped')]))), []);
  assert.deepEqual(ids(runChecks(ctx([line('# var in a python comment', 'a.js')]))), []);
});
