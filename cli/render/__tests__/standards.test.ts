import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../standards.ts';
import { BEGIN_PREFIX } from '../markers.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tmp = (t: TestContext): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-render-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('defaults to the manifest-enabled vendors only', (t) => {
  const out = tmp(t);
  const r = render({ root, profile: 'web', out });
  assert.ok(r.managed.includes('AGENTS.md'));
  assert.ok(r.managed.includes('CLAUDE.md'));
  assert.ok(r.managed.includes('.github/copilot-instructions.md'));
  assert.ok(!r.managed.some((p) => p.startsWith('.cursor/')));
});

test('a second render of an unchanged tree writes nothing', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out });
  const again = render({ root, profile: 'web', out });
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.removed, []);
});

test('check mode reports stale paths and writes nothing', (t) => {
  const out = tmp(t);
  const r = render({ root, profile: 'web', out, check: true });
  assert.ok(r.stale.length > 0);
  assert.deepEqual(r.written, []);
  assert.equal(existsSync(join(out, 'AGENTS.md')), false);
});

test('narrowing a profile prunes the stack file it no longer includes', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out, vendors: ['copilot'] });
  const orphan = '.github/instructions/redline-react.instructions.md';
  assert.ok(existsSync(join(out, orphan)));
  const r = render({ root, profile: 'tooling', out, vendors: ['copilot'] });
  assert.ok(r.removed.includes(orphan));
  assert.equal(existsSync(join(out, orphan)), false);
});

test('a repo-owned instruction file is never pruned', (t) => {
  const out = tmp(t);
  mkdirSync(join(out, '.github/instructions'), { recursive: true });
  writeFileSync(join(out, '.github/instructions/team.instructions.md'), 'ours\n');
  render({ root, profile: 'tooling', out, vendors: ['copilot'] });
  assert.equal(readFileSync(join(out, '.github/instructions/team.instructions.md'), 'utf8'), 'ours\n');
});

test('content outside the markers is preserved across a re-render', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out, vendors: ['agents'] });
  const withTail = readFileSync(join(out, 'AGENTS.md'), 'utf8') + '\n## Repo notes\n\nkeep me\n';
  writeFileSync(join(out, 'AGENTS.md'), withTail);
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  assert.match(readFileSync(join(out, 'AGENTS.md'), 'utf8'), /## Repo notes\n\nkeep me\n$/);
});

test('an unknown vendor is rejected by name', (t) => {
  assert.throws(
    () => render({ root, profile: 'web', out: tmp(t), vendors: ['copilot', 'nope'] }),
    /unknown vendor "nope"\. Known: copilot, agents, claude, cursor/
  );
});

// The dry-run plan prints writes and deletions differently, so check mode has
// to say which is which: `stale` alone reads back as
// "<path> (stale, should be removed)" and printed as a write it is a lie.
test('check mode separates the files it would remove from the ones it would write', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out });
  const orphan = '.github/instructions/redline-gone-stack.instructions.md';
  writeFileSync(join(out, orphan), 'a stack no longer in this profile\n');

  const r = render({ root, profile: 'web', out, check: true });

  assert.deepEqual(r.staleRemovals, [orphan]);
  assert.deepEqual(r.staleWritten, []);
  assert.ok(r.stale.includes(`${orphan} (stale, should be removed)`), 'the combined list is unchanged');
  assert.ok(existsSync(join(out, orphan)), 'check mode still writes and deletes nothing');
});

// render() writes AGENTS.md, CLAUDE.md and .github/copilot-instructions.md in
// every onboarded repository through wrapBlock, so a file whose markers cannot
// be located unambiguously is an estate-wide corruption, not a local one. These
// drive the real renderer rather than wrapBlock, because that is the path the
// growth was observed on.

const humanFileWith = (tail: string): string =>
  `# Our repo\n\nHand-written guidance the team owns.\n\n${tail}`;

test('an unclosed code fence above the block refuses instead of appending a second block on every render', (t) => {
  const out = tmp(t);
  render({ root, profile: 'tooling', out });
  const target = join(out, 'AGENTS.md');
  const withFence = `${humanFileWith('```md\nan illustration whose fence was never closed\n')}${readFileSync(target, 'utf8')}`;
  writeFileSync(target, withFence);

  for (let run = 1; run <= 3; run += 1) {
    assert.throws(
      () => render({ root, profile: 'tooling', out }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /AGENTS\.md/);
        assert.match(error.message, /unclosed code fence/);
        return true;
      },
      `render ${run} must refuse`
    );
    assert.equal(readFileSync(target, 'utf8'), withFence, `render ${run} must not change a byte`);
  }
});

test('a file carrying two marker pairs refuses the render rather than picking one', (t) => {
  const out = tmp(t);
  render({ root, profile: 'tooling', out });
  const target = join(out, 'AGENTS.md');
  const doubled = readFileSync(target, 'utf8').repeat(2);
  writeFileSync(target, doubled);

  assert.throws(() => render({ root, profile: 'tooling', out }), /AGENTS\.md/);
  assert.equal(readFileSync(target, 'utf8'), doubled);
});

// The append shape of the same defect: with no block present yet, an
// unterminated fence made findBlock report "nothing here", which wrapBlock read
// as "append at end of file" — and end of file was inside the fence. Run 1 wrote
// the block into a code block; every run after that refused, so the repository
// was left less onboardable than before Redline touched it.
test('an unclosed fence with no markers refuses the render instead of writing the block into the code block', (t) => {
  const out = tmp(t);
  const target = join(out, 'AGENTS.md');
  const human = '# Team notes\n\n```sh\nnpm test\n';
  mkdirSync(out, { recursive: true });
  writeFileSync(target, human);

  for (let run = 1; run <= 3; run += 1) {
    assert.throws(
      () => render({ root, profile: 'tooling', out }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /AGENTS\.md/);
        return true;
      },
      `render ${run} must refuse rather than write into the fence`
    );
    assert.equal(readFileSync(target, 'utf8'), human, `render ${run} must not change a byte`);
  }
});

test('a well-formed file still renders and is byte-stable across three runs', (t) => {
  const out = tmp(t);
  const target = join(out, 'AGENTS.md');
  mkdirSync(out, { recursive: true });
  writeFileSync(target, '# Team notes\n\n```sh\nnpm test\n```\n');

  render({ root, profile: 'tooling', out });
  const first = readFileSync(target, 'utf8');
  render({ root, profile: 'tooling', out });
  render({ root, profile: 'tooling', out });

  assert.equal(readFileSync(target, 'utf8'), first);
  assert.match(first, /^# Team notes/);
  assert.equal(first.split(BEGIN_PREFIX).length - 1, 1);
});
