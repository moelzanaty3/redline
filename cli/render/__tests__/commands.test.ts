import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands, renderCommands } from '../commands.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tmp = (): string => mkdtempSync(join(tmpdir(), 'redline-commands-'));

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
  const written = renderCommands({ root, out, hosts: ['copilot'] });
  assert.ok(written.includes('.github/prompts/redline-init.prompt.md'));
  const body = readFileSync(join(out, '.github/prompts/redline-init.prompt.md'), 'utf8');
  assert.ok(body.startsWith('---\nmode: agent\ndescription: '));
});

test('claude, opencode and cursor each get their own layout', () => {
  const out = tmp();
  const written = renderCommands({ root, out, hosts: ['claude', 'opencode', 'cursor'] });
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
