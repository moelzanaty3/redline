import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands, renderCommands } from '../commands.ts';

// Anchored: `commands/redline-init.md` quotes the marker inline, and an
// inline mention is exactly what markers.ts does not treat as a block either.
const HAS_BLOCK = /^<!-- REDLINE:BEGIN/m;

const root = fileURLToPath(new URL('../../../', import.meta.url));
const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-commands-'));
  createdDirs.push(dir);
  return dir;
};

test('both command sources load with a name and description', () => {
  const commands = loadCommands(root).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(
    commands.map((c) => c.name),
    ['redline-init', 'redline-verify']
  );
  assert.ok(commands[0]!.description.length > 0);
  assert.ok(!commands[0]!.body.startsWith('---'), 'frontmatter must be stripped from the body');
});

test('copilot prompts land in .github/prompts with agent mode', () => {
  const out = tmp();
  const { written } = renderCommands({ root, out, hosts: ['copilot'] });
  assert.ok(written.includes('.github/prompts/redline-init.prompt.md'));
  const body = readFileSync(join(out, '.github/prompts/redline-init.prompt.md'), 'utf8');
  assert.ok(body.startsWith('---\nmode: agent\ndescription: '));
});

test('claude, opencode and cursor each get their own layout', () => {
  const out = tmp();
  const { written } = renderCommands({ root, out, hosts: ['claude', 'opencode', 'cursor'] });
  assert.ok(written.includes('.claude/commands/redline-verify.md'));
  assert.ok(written.includes('.opencode/command/redline-verify.md'));
  assert.ok(written.includes('.cursor/commands/redline-verify.md'));
  assert.ok(!readFileSync(join(out, '.cursor/commands/redline-verify.md'), 'utf8').startsWith('---'));
});

test('every rendered command body is identical across hosts', () => {
  const out = tmp();
  renderCommands({ root, out, hosts: ['claude', 'cursor'] });
  const strip = (s: string): string => s.replace(/^---\n[\s\S]*?\n---\n\n/, '');
  assert.equal(
    strip(readFileSync(join(out, '.claude/commands/redline-init.md'), 'utf8')),
    strip(readFileSync(join(out, '.cursor/commands/redline-init.md'), 'utf8'))
  );
});

test('an unknown host is rejected by name', () => {
  assert.throws(() => renderCommands({ root, out: tmp(), hosts: ['emacs'] }), /unknown command host "emacs"/);
});

test('a second render of an unchanged tree writes nothing', () => {
  const out = tmp();
  renderCommands({ root, out, hosts: ['claude'] });
  const second = renderCommands({ root, out, hosts: ['claude'] });
  assert.deepEqual(second, { written: [], removed: [] });
});

// Bytes at that path that carry no Redline block are a human's, whoever put
// them there — Redline appends its own block and keeps them.
test('a file with no Redline block at a command path is kept and merged into, not overwritten', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  renderCommands({ root, out, hosts: ['claude'] });
  writeFileSync(join(out, relPath), 'a body someone put here by hand\n');
  const second = renderCommands({ root, out, hosts: ['claude'] });
  assert.ok(second.written.includes(relPath));
  const body = readFileSync(join(out, relPath), 'utf8');
  assert.ok(body.includes('a body someone put here by hand'));
  assert.match(body, HAS_BLOCK);
});

// --- brownfield command files ------------------------------------------------
//
// `<name>` is the filename in `commands/`, and nothing reserves that name in a
// consumer repository: `commands/review-pr.md` here would land on a team's own
// `.claude/commands/review-pr.md`. Redline's block is merged into whatever is
// already there instead of replacing it, which keeps the team's prompt and
// leaves Redline's half removable and re-renderable.

test("a command file the repository already owns keeps every byte and gains a Redline block", () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const ours = '---\ndescription: our own runbook\n---\n\nRun the internal onboarding script.\n';
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), ours);

  const { written } = renderCommands({ root, out, hosts: ['claude'] });

  const merged = readFileSync(join(out, relPath), 'utf8');
  assert.ok(written.includes(relPath));
  assert.ok(merged.startsWith(ours), "the repository's own prompt must survive verbatim");
  assert.match(merged, HAS_BLOCK);
  assert.match(merged, /Run the internal onboarding script\./);
});

test('a command file Redline created carries its block and is re-rendered in place', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  renderCommands({ root, out, hosts: ['claude'] });
  const created = readFileSync(join(out, relPath), 'utf8');
  assert.ok(created.startsWith('---\ndescription: '), 'the tool reads frontmatter at byte zero');
  assert.match(created, HAS_BLOCK);

  writeFileSync(
    join(out, relPath),
    created.replace(/^description: .*$/m, 'description: stale description from an older CLI')
  );
  const second = renderCommands({ root, out, hosts: ['claude'] });

  assert.deepEqual(second.written, [relPath]);
  const refreshed = readFileSync(join(out, relPath), 'utf8');
  assert.equal(refreshed, created, 'a file whose only content outside the block is Redline\'s own header is refreshed whole');
});

test('deselecting a command host strips only Redline\'s block from the repository\'s file', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const ours = 'Run the internal onboarding script.\n\n';
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), ours);
  renderCommands({ root, out, hosts: ['claude'] });

  const result = renderCommands({ root, out, hosts: [] });

  assert.ok(result.removed.includes(relPath));
  assert.equal(readFileSync(join(out, relPath), 'utf8'), ours);
});

test('deselecting a command host deletes a command file that was only ever Redline\'s', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  renderCommands({ root, out, hosts: ['claude'] });

  const result = renderCommands({ root, out, hosts: [] });

  assert.ok(result.removed.includes(relPath));
  assert.equal(existsSync(join(out, relPath)), false);
});

test('a command file with no Redline block anywhere is never deleted by a deselect', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), 'entirely ours\n');

  assert.deepEqual(renderCommands({ root, out, hosts: [] }), { written: [], removed: [] });
  assert.equal(readFileSync(join(out, relPath), 'utf8'), 'entirely ours\n');
});

test('check mode reports the command files it would merge and writes none of them', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), 'ours\n');

  const planned = renderCommands({ root, out, hosts: ['claude'], check: true });

  assert.ok(planned.written.includes(relPath));
  assert.equal(readFileSync(join(out, relPath), 'utf8'), 'ours\n');
});

// The reviewer's Critical 2 input. Every repository already onboarded has a
// marker-less command file that Redline itself wrote. Merge-or-create is the
// right answer for a HUMAN's file and the wrong one for Redline's own earlier
// output: appending a block carrying the same body makes `/<name>` run the
// prompt twice.
const legacyRendering = (name: string, header: string): string => {
  const command = loadCommands(root).find((c) => c.name === name)!;
  const composed = header === '' ? command.body : `${header}\n${command.body}`;
  return `${composed.trimEnd()}\n`;
};

test('a command file left by an earlier CLI is replaced, not appended to, so the prompt is not doubled', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const command = loadCommands(root).find((c) => c.name === 'redline-init')!;
  const legacy = legacyRendering('redline-init', `---\ndescription: ${command.description}\n---\n`);
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), legacy);

  const result = renderCommands({ root, out, hosts: ['claude'] });

  const merged = readFileSync(join(out, relPath), 'utf8');
  const phrase = command.body.split('\n').find((line) => line.trim().length > 40)!.trim();
  assert.ok(result.written.includes(relPath));
  assert.equal(merged.split(phrase).length - 1, 1, 'the body must appear exactly once');
  assert.ok(merged.length < legacy.length * 1.8, `${merged.length} vs legacy ${legacy.length}: doubled`);
  assert.match(merged, HAS_BLOCK);
});

test('a copilot prompt left by an earlier CLI is replaced rather than doubled', () => {
  const out = tmp();
  const relPath = '.github/prompts/redline-verify.prompt.md';
  const command = loadCommands(root).find((c) => c.name === 'redline-verify')!;
  const legacy = legacyRendering(
    'redline-verify',
    `---\nmode: agent\ndescription: ${command.description}\n---\n`
  );
  mkdirSync(join(out, '.github/prompts'), { recursive: true });
  writeFileSync(join(out, relPath), legacy);

  renderCommands({ root, out, hosts: ['copilot'] });

  const merged = readFileSync(join(out, relPath), 'utf8');
  const phrase = command.body.split('\n').find((line) => line.trim().length > 40)!.trim();
  assert.equal(merged.split(phrase).length - 1, 1, 'the body must appear exactly once');
});

// The migration is a one-off: once the block owns the file, the next run is a
// no-op, and the file is a normal marker-managed one from then on.
test('the migrated command file is stable on the very next render', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const command = loadCommands(root).find((c) => c.name === 'redline-init')!;
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(
    join(out, relPath),
    legacyRendering('redline-init', `---\ndescription: ${command.description}\n---\n`)
  );

  renderCommands({ root, out, hosts: ['claude'] });
  const second = renderCommands({ root, out, hosts: ['claude'] });

  assert.deepEqual(second, { written: [], removed: [] });
});

// A team's own command file can carry a lone `description:` key, which is
// shape-identical to the header Redline writes. Shape is therefore not an
// answer: only Redline's own attribution line in the header is.
test("a repository's own frontmatter is not claimed as Redline's, even once its prose is gone", () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const theirs = "---\ndescription: our team's PR review\n---\n\nOur own prompt.\n";
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), theirs);
  renderCommands({ root, out, hosts: ['claude'] });

  // They keep the frontmatter and drop their prose, leaving a remainder that
  // looks exactly like a header Redline could have written.
  const merged = readFileSync(join(out, relPath), 'utf8');
  writeFileSync(join(out, relPath), merged.replace('Our own prompt.\n', ''));
  renderCommands({ root, out, hosts: ['claude'] });

  assert.match(readFileSync(join(out, relPath), 'utf8'), /description: our team's PR review/);
});

// The exact round trip, pinned rather than described. `wrapBlock` inserts a
// paragraph separator on the append path, and once written those bytes sit on
// disk exactly like anything the human typed — `stripBlock` documents that it
// keeps them rather than guessing which newline was whose, so a deselect
// returns a human's file plus at most that one separator newline and never
// less than what they wrote.
test('a deselect returns the human bytes plus at most the separator newline wrapBlock added', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const ours = 'Run the internal onboarding script.\n';
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), ours);

  renderCommands({ root, out, hosts: ['claude'] });
  renderCommands({ root, out, hosts: [] });

  const back = readFileSync(join(out, relPath), 'utf8');
  assert.equal(back, `${ours}\n`);
  assert.ok(back.startsWith(ours), 'not one byte the human wrote may be lost');
});

test('a file that already ended in a blank line round-trips a deselect byte-for-byte', () => {
  const out = tmp();
  const relPath = '.claude/commands/redline-init.md';
  const ours = 'Run the internal onboarding script.\n\n';
  mkdirSync(join(out, '.claude/commands'), { recursive: true });
  writeFileSync(join(out, relPath), ours);

  renderCommands({ root, out, hosts: ['claude'] });
  renderCommands({ root, out, hosts: [] });

  assert.equal(readFileSync(join(out, relPath), 'utf8'), ours);
});
