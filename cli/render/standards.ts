import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadManifest } from './manifest.ts';
import { resolveProfile } from './profile.ts';
import { END, findBlock, wrapBlock } from './markers.ts';
import { readLocalRules, VENDORS, type PruneRule, type RenderedFile } from './vendors.ts';
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

// The rest of a shared file once its Redline block is cut out, or `null` when
// nothing survives but whitespace, so the caller deletes the file rather than
// writing back a blank one. Mirrors wrapBlock's own contract in the other
// direction: `before` is kept byte-for-byte, and `after` only ever loses the
// single newline that trails the block itself (the append path's own
// `${END}\n`, or none at all on the replace path's `block.trimEnd()`) — never
// a byte the human wrote. Because that trailing newline is indistinguishable
// on disk from a separator wrapBlock itself inserted, stripping a block back
// out is not always the exact inverse of wrapping it in — see the round-trip
// tests. `findBlock` (markers.ts) owns the marker scan and its refusal on an
// ambiguous marker state; this only decides the byte range to keep, reusing
// that scan rather than re-parsing the file itself. Returns `existing`
// unchanged when there is no block to find, so a caller can tell "nothing
// here was ever Redline's" from "the block was removed" by identity.
export function stripBlock(existing: string, label: string): string | null {
  const span = findBlock(existing, label);
  if (span === null) return existing;
  const before = existing.slice(0, span.start);
  const rest = existing.slice(span.stop + END.length);
  const after = rest.startsWith('\n') ? rest.slice(1) : rest;
  if (before.trim() === '' && after.trim() === '') return null;
  return before + after;
}

export function render(opts: RenderOptions): RenderResult {
  const { root, out, check = false } = opts;
  const manifest = loadManifest(root);
  const resolved = resolveProfile(manifest, opts.profile);

  const requested =
    opts.vendors ??
    Object.entries(manifest.vendors)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
  for (const name of requested) {
    if (!VENDORS[name]) {
      throw new RedlineError('usage', `unknown vendor "${name}". Known: ${Object.keys(VENDORS).join(', ')}`);
    }
  }
  // The org manifest is the ceiling, enforced here rather than by whoever
  // built `opts.vendors`: a repository's recorded selection can predate an
  // org-wide disablement, and a stale record must not resurrect a vendor the
  // org has since switched off.
  const orgEnabled = new Set(
    Object.entries(manifest.vendors)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k)
  );
  const selected = requested.filter((name) => orgEnabled.has(name));

  // Read from `out`, the tree being rendered into: the repository's own rules
  // live in the repository, and every vendor renderer gets the same bytes.
  const ctx = {
    manifest,
    root,
    profile: resolved.profile,
    stacks: resolved.stacks,
    local: readLocalRules(out),
  };
  const planned = new Map<string, RenderedFile>();
  const prunes: PruneRule[] = [];
  // A shared (`merge: true`) file belonging to a vendor that is not currently
  // selected — by repository choice or because the org ceiling just dropped
  // it. Only the block inside it is Redline's, so it needs the removal path
  // below rather than the directory-scan PruneRule uses for owned files.
  const deselectedMergeFiles: string[] = [];

  // Every vendor's renderer runs, not just the selected ones: a PruneRule's
  // directory scan is how a vendor's own generated files get cleaned up once
  // it is no longer selected at all, and that only happens if its rule is in
  // `prunes` regardless of selection.
  for (const name of Object.keys(VENDORS)) {
    const renderer = VENDORS[name]!;
    const result = renderer(ctx);
    prunes.push(...result.prune);
    if (selected.includes(name)) {
      for (const [path, file] of result.files) planned.set(path, file);
    } else {
      for (const [path, file] of result.files) {
        if (file.merge) deselectedMergeFiles.push(path);
      }
    }
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

  // Deselected vendors' shared files: strip the block, deleting the file
  // outright when nothing else is left. Always a removal, never a write — a
  // deselect is not content Redline is choosing to keep.
  for (const relPath of deselectedMergeFiles) {
    const target = join(out, relPath);
    if (!existsSync(target)) continue;
    const current = readFileSync(target, 'utf8');
    const stripped = stripBlock(current, relPath);
    if (stripped === current) continue; // no Redline block here — brownfield rule
    if (check) {
      staleRemovals.push(relPath);
      continue;
    }
    if (stripped === null) rmSync(target);
    else writeFileSync(target, stripped);
    removed.push(relPath);
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
