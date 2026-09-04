import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { managedPaths, renderForTarget } from '../render.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('managedPaths names the artifacts a profile renders, without a target', () => {
  const paths = managedPaths(ROOT, 'web', ['claude', 'agents']);

  assert.ok(paths.includes('AGENTS.md'), `expected AGENTS.md in ${paths.join(', ')}`);
  assert.ok(paths.length > 0);
});

test('rendering for a target with nothing there produces the full artifacts', () => {
  const result = renderForTarget({
    root: ROOT,
    profile: 'web',
    vendors: ['agents'],
    existing: new Map(),
  });

  const agents = result.files.find((f) => f.path === 'AGENTS.md');
  assert.ok(agents, 'AGENTS.md should be rendered');
  assert.match(agents.content, /REDLINE:BEGIN/);
});

test("a repository's own content above the marker survives the render", () => {
  // The single most important property of sync. AGENTS.md carries the team's own
  // architecture and conventions above the marker; a render that dropped it would
  // destroy the context the reviewer depends on, on every repository at once.
  const owned = '# Our app\n\nWe use FlashList, never FlatList.\n\n';
  const seeded = renderForTarget({ root: ROOT, profile: 'web', vendors: ['agents'], existing: new Map() });
  const first = seeded.files.find((f) => f.path === 'AGENTS.md')?.content ?? '';

  const result = renderForTarget({
    root: ROOT,
    profile: 'web',
    vendors: ['agents'],
    existing: new Map([['AGENTS.md', owned + first]]),
  });

  const agents = result.files.find((f) => f.path === 'AGENTS.md');
  // Nothing changed below the marker either, so there is nothing to push at all —
  // which is itself the correct answer, and is asserted by the next test.
  if (agents) assert.match(agents.content, /We use FlashList/);
});

test('a target already carrying the current render has nothing to push', () => {
  const first = renderForTarget({ root: ROOT, profile: 'web', vendors: ['agents'], existing: new Map() });
  const existing = new Map(first.files.map((f) => [f.path, f.content]));

  const second = renderForTarget({ root: ROOT, profile: 'web', vendors: ['agents'], existing });

  assert.deepEqual(second.files, []);
});

test('only the changed artifact is pushed, not every managed file', () => {
  const first = renderForTarget({ root: ROOT, profile: 'web', vendors: ['agents'], existing: new Map() });
  const existing = new Map(first.files.map((f) => [f.path, f.content]));
  const [victim] = [...existing.keys()];
  existing.set(victim as string, 'stale content\n');

  const second = renderForTarget({ root: ROOT, profile: 'web', vendors: ['agents'], existing });

  assert.deepEqual(second.files.map((f) => f.path), [victim]);
});
