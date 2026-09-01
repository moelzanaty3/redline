import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadManifest } from './manifest.ts';
import { resolveProfile } from './profile.ts';
import { wrapBlock } from './markers.ts';
import { VENDORS, type PruneRule, type RenderedFile } from './vendors.ts';

export interface RenderOptions {
  root: string;
  profile: string;
  out: string;
  vendors?: string[];
  check?: boolean;
}

export interface RenderResult {
  profile: string;
  stacks: string[];
  written: string[];
  removed: string[];
  stale: string[];
  managed: string[];
}

export function render(opts: RenderOptions): RenderResult {
  const { root, out, check = false } = opts;
  const manifest = loadManifest(root);
  const resolved = resolveProfile(manifest, opts.profile);

  const selected =
    opts.vendors ??
    Object.entries(manifest.vendors)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);

  const planned = new Map<string, RenderedFile>();
  const prunes: PruneRule[] = [];
  for (const name of selected) {
    const renderer = VENDORS[name];
    if (!renderer) {
      throw new Error(`unknown vendor "${name}". Known: ${Object.keys(VENDORS).join(', ')}`);
    }
    const result = renderer({ manifest, root, profile: resolved.profile, stacks: resolved.stacks });
    for (const [path, file] of result.files) planned.set(path, file);
    prunes.push(...result.prune);
  }

  const written: string[] = [];
  const removed: string[] = [];
  const stale: string[] = [];

  for (const [relPath, spec] of planned) {
    const target = join(out, relPath);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const next = spec.merge ? wrapBlock(current, spec.body) : `${spec.body.trimEnd()}\n`;
    if (current === next) continue;
    if (check) {
      stale.push(relPath);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
    written.push(relPath);
  }

  for (const rule of prunes) {
    const abs = join(out, rule.dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!rule.matches(file)) continue;
      const relPath = join(rule.dir, file);
      if (planned.has(relPath)) continue;
      if (check) {
        stale.push(`${relPath} (stale, should be removed)`);
        continue;
      }
      rmSync(join(abs, file));
      removed.push(relPath);
    }
  }

  return { ...resolved, written, removed, stale, managed: [...planned.keys()] };
}
