import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { render } from '../standards.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = loadManifest(root);
const VENDORS = ['copilot', 'agents', 'claude', 'cursor'];

function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const abs = join(current, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.set(relative(dir, abs).split(sep).join('/'), readFileSync(abs, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

for (const profile of Object.keys(manifest.profiles)) {
  test(`profile ${profile} renders byte-identically to scripts/render.mjs`, (t) => {
    const oracle = mkdtempSync(join(tmpdir(), 'redline-oracle-'));
    const ported = mkdtempSync(join(tmpdir(), 'redline-ported-'));
    t.after(() => {
      rmSync(oracle, { recursive: true, force: true });
      rmSync(ported, { recursive: true, force: true });
    });

    execFileSync(
      process.execPath,
      ['scripts/render.mjs', '--profile', profile, '--out', oracle, '--vendors', VENDORS.join(',')],
      { cwd: root, stdio: 'pipe' }
    );
    render({ root, profile, out: ported, vendors: VENDORS });

    const a = snapshot(oracle);
    const b = snapshot(ported);
    assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort(), `file set differs for ${profile}`);
    for (const [path, contents] of a) {
      assert.equal(b.get(path), contents, `contents differ for ${profile} → ${path}`);
    }
  });
}
