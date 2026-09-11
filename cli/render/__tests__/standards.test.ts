import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, stripBlock } from '../standards.ts';
import { BEGIN, BEGIN_PREFIX, END, wrapBlock } from '../markers.ts';
import { loadManifest } from '../manifest.ts';
import { VENDORS } from '../vendors.ts';

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
  assert.ok(r.managed.some((p) => p.startsWith('.cursor/')));
});

// Codex reads AGENTS.md, so it renders the same file the agents vendor does.
// Selecting both must write it once and identically — two vendors racing over
// one path would otherwise produce a diff that flips on every render.
test('codex and agents render the same AGENTS.md, once', (t) => {
  const both = render({ root, profile: 'web', out: tmp(t), vendors: ['agents', 'codex'] });
  assert.equal(both.managed.filter((p) => p === 'AGENTS.md').length, 1);

  const codexOnly = tmp(t);
  render({ root, profile: 'web', out: codexOnly, vendors: ['codex'] });
  const agentsOnly = tmp(t);
  render({ root, profile: 'web', out: agentsOnly, vendors: ['agents'] });
  assert.equal(
    readFileSync(join(codexOnly, 'AGENTS.md'), 'utf8'),
    readFileSync(join(agentsOnly, 'AGENTS.md'), 'utf8')
  );
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
    /unknown vendor "nope"\. Known: copilot, agents, codex, claude, cursor/
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

// --- Task 14: per-repository vendor selection --------------------------------

// The org manifest is the ceiling at render time, not merely at selection time:
// a caller asking for a vendor the organisation has switched off — standing in
// for a stale .redline.json recorded before the disablement — must still get
// nothing. An implementation that filtered only at the CLI layer
// (cli/commands/init.ts) rather than inside render() would let this through.
//
// Every vendor ships enabled today, so the disabled one is built here rather
// than borrowed from the shipped manifest: the invariant is about the ceiling,
// not about which vendor happens to be off this month.
test('a vendor the org manifest has disabled is dropped even when explicitly requested', (t) => {
  const orgRoot = tmp(t);
  cpSync(join(root, 'standards'), join(orgRoot, 'standards'), { recursive: true });
  const manifestPath = join(orgRoot, 'standards/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.vendors.cursor.enabled = false;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const out = tmp(t);
  const r = render({ root: orgRoot, profile: 'web', out, vendors: ['copilot', 'cursor'] });
  assert.ok(!r.managed.some((p) => p.startsWith('.cursor/')));
  assert.equal(existsSync(join(out, '.cursor/rules')), false);
});

// Prune rules used to be collected only from the currently *selected*
// vendors, so a vendor dropped from the selection entirely (as opposed to
// merely losing a stack within an active vendor) left its own generated
// files behind forever — nothing ever asked to remove them again. Planting
// the leftover by hand stands in for a repository whose config once selected
// a vendor the org has since disabled.
test('artifacts left over from a vendor no longer selected at all are pruned on the next render', (t) => {
  const out = tmp(t);
  mkdirSync(join(out, '.cursor/rules'), { recursive: true });
  writeFileSync(join(out, '.cursor/rules/redline-core.mdc'), 'stale cursor content\n');

  const r = render({ root, profile: 'web', out, vendors: ['copilot'] });

  assert.ok(r.removed.includes(join('.cursor/rules', 'redline-core.mdc')));
  assert.equal(existsSync(join(out, '.cursor/rules/redline-core.mdc')), false);
});

test('deselecting a vendor deletes a shared file that holds nothing but the Redline block', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out, vendors: ['claude'] });
  assert.ok(existsSync(join(out, 'CLAUDE.md')));

  const r = render({ root, profile: 'web', out, vendors: [] });

  assert.ok(r.removed.includes('CLAUDE.md'));
  assert.equal(existsSync(join(out, 'CLAUDE.md')), false);
});

// The counterpart: a shared file that carries the team's own content around
// the block keeps that content byte-for-byte, and only the block (plus the
// separator wrapBlock inserted before it) disappears.
test("deselecting a vendor strips only its own block, leaving the team's content byte-identical", (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out, vendors: ['agents'] });
  const withOwnContent =
    'Team-owned intro.\n\n' + readFileSync(join(out, 'AGENTS.md'), 'utf8') + '\n## Repo notes\n\nkeep me\n';
  writeFileSync(join(out, 'AGENTS.md'), withOwnContent);

  const r = render({ root, profile: 'web', out, vendors: [] });

  assert.ok(r.removed.includes('AGENTS.md'));
  // Byte-for-byte, not the canonical-looking `\n\n` the old trimming behaviour
  // produced: the human's own blank line before the block (2 newlines) plus
  // the one newline they typed right after it survive untouched, and only the
  // block's own trailing newline is the one byte stripBlock ever removes.
  assert.equal(readFileSync(join(out, 'AGENTS.md'), 'utf8'), 'Team-owned intro.\n\n\n## Repo notes\n\nkeep me\n');
});

test('deselecting copilot removes both its per-stack instruction files and its merged file', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out, vendors: ['copilot'] });
  assert.ok(existsSync(join(out, '.github/copilot-instructions.md')));
  assert.ok(existsSync(join(out, '.github/instructions/redline-react.instructions.md')));

  const r = render({ root, profile: 'web', out, vendors: [] });

  assert.equal(existsSync(join(out, '.github/copilot-instructions.md')), false);
  assert.equal(existsSync(join(out, '.github/instructions/redline-react.instructions.md')), false);
  assert.ok(r.removed.includes('.github/copilot-instructions.md'));
  assert.ok(r.removed.includes(join('.github/instructions', 'redline-react.instructions.md')));
});

// A file Redline never wrote for this vendor — no block to find — is left
// alone. The brownfield rule applies to a deselected vendor's file exactly as
// it does to any other file Redline did not generate.
test('a hand-written file with no Redline block is never touched by a deselect', (t) => {
  const out = tmp(t);
  writeFileSync(join(out, 'CLAUDE.md'), "# Our own CLAUDE.md\n\nWe never ran redline init for Claude.\n");

  const r = render({ root, profile: 'web', out, vendors: ['agents'] });

  assert.equal(readFileSync(join(out, 'CLAUDE.md'), 'utf8'), "# Our own CLAUDE.md\n\nWe never ran redline init for Claude.\n");
  assert.ok(!r.removed.includes('CLAUDE.md'));
});

test('check mode reports a deselected vendor block as a removal, not a write, and deletes nothing', (t) => {
  const out = tmp(t);
  render({ root, profile: 'web', out, vendors: ['claude'] });

  const r = render({ root, profile: 'web', out, vendors: [], check: true });

  assert.deepEqual(r.staleWritten, []);
  assert.ok(r.staleRemovals.includes('CLAUDE.md'));
  assert.ok(existsSync(join(out, 'CLAUDE.md')), 'check mode must delete nothing');
});

// --- stripBlock byte-identity ------------------------------------------------
//
// The brief required, three times, that everything outside the block survive
// byte-identical. Every assertion below is a single exact-string equality
// against a literal, not `includes` — `includes` is what let a reformatting
// bug (trimming the human's trailing whitespace, collapsing blank lines,
// always rejoining with a canonical `\n\n`) through undetected, because the
// content it deleted lived entirely in whitespace that `includes` cannot see.

test('stripBlock reproduces the human bytes exactly around irregular whitespace on both sides', () => {
  const before = 'MY INTRO.   \n\n\n\n';
  const block = `${BEGIN}\nSOME GENERATED CONTENT\n${END}`;
  const after = '\n\n\n\ntrailing content...\n';
  const existing = before + block + after;

  const result = stripBlock(existing, 'test.md');

  // `after` loses only the one newline that belongs to a block written by
  // wrapBlock's append path (its own trailing `${END}\n`) — never a byte the
  // human put there themselves.
  const expected = 'MY INTRO.   \n\n\n\n' + '\n\n\ntrailing content...\n';
  assert.equal(result, expected);
});

test('stripBlock deletes a file that holds nothing but the block', () => {
  const block = `${BEGIN}\nSOME GENERATED CONTENT\n${END}`;
  assert.equal(stripBlock(block, 'test.md'), null);
});

test('stripBlock deletes a file whose remainder is whitespace-only on both sides', () => {
  const existing = '   \n\n' + `${BEGIN}\nSOME GENERATED CONTENT\n${END}` + '\n\n  \n';
  assert.equal(stripBlock(existing, 'test.md'), null);
});

test('stripBlock keeps content before the block byte-for-byte when nothing follows it', () => {
  const before = 'Some real content.   \n\n\n';
  const existing = before + `${BEGIN}\nSOME GENERATED CONTENT\n${END}`;
  assert.equal(stripBlock(existing, 'test.md'), before);
});

test('stripBlock keeps content after the block byte-for-byte when nothing precedes it', () => {
  const after = 'trailing stuff.   \n\n\n';
  const existing = `${BEGIN}\nSOME GENERATED CONTENT\n${END}` + '\n' + after;
  assert.equal(stripBlock(existing, 'test.md'), after);
});

// The inverse of wrapBlock's own three-way `gap` decision (markers.ts). Only
// the branch where the file already ended in a blank line (`\n\n`) round-trips
// byte-for-byte: the other two branches make wrapBlock insert a newline or two
// of its own as the paragraph separator, and once written those bytes sit on
// disk exactly like anything the human typed — stripBlock has no way to tell
// them apart from human content, so it correctly keeps them rather than
// guessing. Wrapping then stripping is therefore lossless only starting from a
// file that already ended in a blank line; the other two branches gain the
// separator bytes wrapBlock added, permanently.
test('wrapBlock -> stripBlock round-trips exactly only when the file already ended in a blank line', () => {
  const label = 'test.md';
  const body = 'GENERATED';

  const noNewline = 'Team notes with no trailing newline';
  const oneNewline = 'Team notes with one newline\n';
  const twoNewlines = 'Team notes with two newlines\n\n';

  assert.equal(stripBlock(wrapBlock(noNewline, body, label), label), `${noNewline}\n\n`);
  assert.equal(stripBlock(wrapBlock(oneNewline, body, label), label), `${oneNewline}\n`);
  assert.equal(stripBlock(wrapBlock(twoNewlines, body, label), label), twoNewlines);
});

// --- repository-local rules (.redline/local.md) ------------------------------
//
// A file the repository owns outright: Redline reads it, renders it inside its
// own block so it survives every re-render, and never writes, prunes or fails
// on it.

const LOCAL = '.redline/local.md';

function writeLocal(out: string, body: string): void {
  mkdirSync(join(out, '.redline'), { recursive: true });
  writeFileSync(join(out, LOCAL), body);
}

// Only the vendors the org manifest enables render a file at all, so these are
// the artifacts a repository can actually observe. Cursor is exercised through
// its renderer directly below.
const ARTIFACTS = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'];
const ENABLED = ['agents', 'claude', 'copilot'];

test('a repository with no local rules file gets no local-rules heading anywhere', (t) => {
  const out = tmp(t);
  render({ root, profile: 'tooling', out, vendors: ENABLED });
  for (const relPath of ARTIFACTS) {
    const body = readFileSync(join(out, relPath), 'utf8');
    assert.ok(!/Repository-local rules/.test(body), `${relPath} must carry no empty local-rules section`);
  }
});

test('an empty local rules file renders no local-rules heading either', (t) => {
  const out = tmp(t);
  writeLocal(out, '   \n\n');
  render({ root, profile: 'tooling', out, vendors: ENABLED });
  for (const relPath of ARTIFACTS) {
    assert.ok(!/Repository-local rules/.test(readFileSync(join(out, relPath), 'utf8')), relPath);
  }
});

test("a local rules file is rendered into every enabled vendor's artifact, inside the marker block", (t) => {
  const out = tmp(t);
  writeLocal(out, '## Our exception\n\nWe allow `any` in generated protobuf types.\n');
  render({ root, profile: 'tooling', out, vendors: ENABLED });

  for (const relPath of ARTIFACTS) {
    const body = readFileSync(join(out, relPath), 'utf8');
    assert.match(body, /We allow `any` in generated protobuf types\./, relPath);
    const start = body.indexOf(BEGIN_PREFIX);
    const stop = body.indexOf(END);
    const rule = body.indexOf('We allow `any`');
    assert.ok(start < rule && rule < stop, `${relPath}: the local rules must sit inside the block`);
  }
});

test('a vendor whose artifact Redline generates whole also carries the local rules', () => {
  const manifest = loadManifest(root);
  const cursor = VENDORS['cursor']!({
    manifest,
    root,
    profile: 'tooling',
    stacks: [],
    contexts: [],
    local: 'We allow console.log in the CLI.',
  });
  const core = cursor.files.get('.cursor/rules/redline-core.mdc');
  assert.match(core?.body ?? '', /We allow console\.log in the CLI\./);
});

test('the local-rules section states that the repository rule wins over the org standard', (t) => {
  const out = tmp(t);
  writeLocal(out, 'We allow console.log in the CLI.\n');
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  const body = readFileSync(join(out, 'AGENTS.md'), 'utf8');
  assert.match(body, /repository's own rules win/i);
});

test('the local rules file is read but never written, rewritten or pruned, including on a vendor deselect', (t) => {
  const out = tmp(t);
  const bytes = '# Ours\n\nkeep every byte   \n';
  writeLocal(out, bytes);

  const first = render({ root, profile: 'tooling', out, vendors: ENABLED });
  assert.match(readFileSync(join(out, 'AGENTS.md'), 'utf8'), /keep every byte/);
  const second = render({ root, profile: 'tooling', out, vendors: [] });

  assert.ok(!first.written.includes(LOCAL) && !first.removed.includes(LOCAL));
  assert.ok(!second.written.includes(LOCAL) && !second.removed.includes(LOCAL));
  assert.ok(!first.managed.includes(LOCAL), 'Redline must not claim the file it only reads');
  assert.equal(existsSync(join(out, LOCAL)), true);
  assert.equal(readFileSync(join(out, LOCAL), 'utf8'), bytes);
});

test('deleting the local rules file removes its section and leaves the rest of the block byte-identical', (t) => {
  const out = tmp(t);
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  const before = readFileSync(join(out, 'AGENTS.md'), 'utf8');

  writeLocal(out, 'Our own rule.\n');
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  assert.notEqual(readFileSync(join(out, 'AGENTS.md'), 'utf8'), before);

  rmSync(join(out, LOCAL));
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  assert.equal(readFileSync(join(out, 'AGENTS.md'), 'utf8'), before);
});

// The two shapes in a human's file that reach markers.ts as structure rather
// than prose. Neither may cost the run: the file is not Redline's to validate.
test('a local rules file with an unclosed code fence still renders, and renders again', (t) => {
  const out = tmp(t);
  writeLocal(out, 'Our rule:\n\n```ts\nconst x = 1;\n');
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  const body = readFileSync(join(out, 'AGENTS.md'), 'utf8');
  assert.match(body, /const x = 1;/);
  // Quoted, because markers.ts cannot read a block back through a fence the
  // human never closed — every byte is still there, and the run did not fail.
  assert.match(body, /^> const x = 1;$/m);
  assert.deepEqual(render({ root, profile: 'tooling', out, vendors: ['agents'] }).written, []);
});

test('a local rules file that quotes a REDLINE marker keeps the text and adds no second marker', (t) => {
  const out = tmp(t);
  writeLocal(out, `Never write this yourself:\n\n${BEGIN}\nhi\n${END}\n`);
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  const body = readFileSync(join(out, 'AGENTS.md'), 'utf8');
  assert.match(body, /Never write this yourself:/);
  assert.equal(body.split(BEGIN_PREFIX).length - 1, 1, 'exactly one REDLINE:BEGIN may survive');
  assert.deepEqual(render({ root, profile: 'tooling', out, vendors: ['agents'] }).written, []);
});
