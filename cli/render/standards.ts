import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadManifest } from './manifest.ts';
import { resolveProfile } from './profile.ts';
import { wrapBlock } from './markers.ts';
import { VENDORS, type PruneRule, type RenderedFile } from './vendors.ts';
import { RedlineError } from '../core/errors.ts';

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
  // Check-mode answer, in one list for a human to read: every stale path, with
  // the prune candidates suffixed. Split across the two lists below for a
  // caller that has to act on the difference — `redline init --dry-run` prints
  // a deletion as a deletion, not as a write.
  stale: string[];
  staleWritten: string[];
  staleRemovals: string[];
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
      throw new RedlineError('usage', `unknown vendor "${name}". Known: ${Object.keys(VENDORS).join(', ')}`);
    }
    const result = renderer({ manifest, root, profile: resolved.profile, stacks: resolved.stacks });
    for (const [path, file] of result.files) planned.set(path, file);
    prunes.push(...result.prune);
  }

  const written: string[] = [];
  const removed: string[] = [];
  const staleWritten: string[] = [];
  const staleRemovals: string[] = [];

  for (const [relPath, spec] of planned) {
    const target = join(out, relPath);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const next = spec.merge ? wrapBlock(current, spec.body, relPath) : `${spec.body.trimEnd()}\n`;
    if (current === next) continue;
    if (check) {
      staleWritten.push(relPath);
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
        staleRemovals.push(relPath);
        continue;
      }
      rmSync(join(abs, file));
      removed.push(relPath);
    }
  }

  const stale = [
    ...staleWritten,
    ...staleRemovals.map((relPath) => `${relPath} (stale, should be removed)`),
  ];
  return {
    ...resolved,
    written,
    removed,
    stale,
    staleWritten,
    staleRemovals,
    managed: [...planned.keys()],
  };
}
