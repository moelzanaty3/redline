import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands, renderCommands } from '../commands.ts';

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

// m3. `redline init` writes these files into every onboarded repository and
// nothing pinned their bytes: the frontmatter prefix and cross-host body
// equality were asserted, the assembly and the trailing shape were not, so a
// renderer emitting a stray blank line or dropping the final newline changed
// every repository in the estate without failing a test.
test('a rendered command file is exactly its frontmatter, one blank line, the body, and one final newline', () => {
  const out = tmp();
  renderCommands({ root, out, hosts: ['claude', 'copilot', 'opencode', 'cursor'] });
  const source = loadCommands(root).find((c) => c.name === 'redline-init');
  assert.ok(source);
  const body = `${source.body.trimEnd()}\n`;

  const files: [string, string][] = [
    ['.claude/commands/redline-init.md', `---\ndescription: ${source.description}\n---\n\n${body}`],
    ['.opencode/command/redline-init.md', `---\ndescription: ${source.description}\n---\n\n${body}`],
    [
      '.github/prompts/redline-init.prompt.md',
      `---\nmode: agent\ndescription: ${source.description}\n---\n\n${body}`,
    ],
    ['.cursor/commands/redline-init.md', body],
  ];
  for (const [path, expected] of files) {
    const actual = readFileSync(join(out, path), 'utf8');
    assert.equal(actual, expected, path);
    // Independent of the source file's own trailing whitespace, so a renderer
    // that simply passed the body through cannot ride on it happening to match.
    assert.ok(actual.endsWith('\n'), `${path} must end with a newline`);
    assert.ok(!actual.endsWith('\n\n'), `${path} must end with exactly one newline`);
  }
});

test('an unknown host is rejected by name', () => {
  assert.throws(() => renderCommands({ root, out: tmp(), hosts: ['emacs'] }), /unknown command host "emacs"/);
});

test('a second render of an unchanged tree writes nothing', () => {
  const out = tmp();
  renderCommands({ root, out, hosts: ['claude'] });
  const second = renderCommands({ root, out, hosts: ['claude'] });
  assert.deepEqual(second, []);
});

test('a changed file on disk is rewritten and reported as written', () => {
  const out = tmp();
  renderCommands({ root, out, hosts: ['claude'] });
  writeFileSync(join(out, '.claude/commands/redline-init.md'), 'stale body from an older CLI version\n');
  const second = renderCommands({ root, out, hosts: ['claude'] });
  assert.ok(second.includes('.claude/commands/redline-init.md'));
  const body = readFileSync(join(out, '.claude/commands/redline-init.md'), 'utf8');
  assert.ok(!body.includes('stale body from an older CLI version'));
});
