import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../standards.ts';

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
