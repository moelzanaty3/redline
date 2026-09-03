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
