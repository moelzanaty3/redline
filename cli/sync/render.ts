import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { render } from '../render/standards.ts';
import type { RemoteFile } from '../platforms/github/push.ts';

export interface RenderForTargetOptions {
  // The source repository — where standards/ and the manifest live.
  root: string;
  profile: string;
  vendors: string[];
  // The target's current content for each managed path, so the marker merge
  // preserves whatever the repository owns. A path absent here does not exist
  // on the target yet.
  existing: Map<string, string>;
}

export interface TargetRender {
  files: RemoteFile[];
  // Paths the render would delete — a vendor turned off, a stack dropped from
  // the profile. Reported, not pushed: see the note in syncTarget.
  removed: string[];
}

// Which paths a profile's render manages, without needing the target's content.
// Sync asks this first so it knows what to fetch: fetching the whole repository
// to find out would be absurd, and rendering into an empty directory to find out
// is exactly what this does, once, cheaply.
export function managedPaths(root: string, profile: string, vendors: string[]): string[] {
  const scratch = mkdtempSync(join(tmpdir(), 'redline-sync-probe-'));
  try {
    return render({ root, profile, out: scratch, vendors, check: true }).managed;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Render a target's artifacts and hand back their content.
//
// The renderer writes to a directory and merges into whatever is already there —
// AGENTS.md keeps everything above the REDLINE:BEGIN marker, which is the
// repository's own context and the single most valuable thing on the page. So
// the target's current files are staged into a scratch directory first and the
// real renderer runs against them. Rendering into an empty directory instead
// would produce a correct-looking AGENTS.md that silently deletes the team's own
// section on every sync.
export function renderForTarget(opts: RenderForTargetOptions): TargetRender {
  const scratch = mkdtempSync(join(tmpdir(), 'redline-sync-'));
  try {
    for (const [path, content] of opts.existing) {
      const full = join(scratch, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }

    const result = render({
      root: opts.root,
      profile: opts.profile,
      out: scratch,
      vendors: opts.vendors,
    });

    const files: RemoteFile[] = [];
    for (const path of result.written) {
      const content = readFileSync(join(scratch, path), 'utf8');
      // Unchanged files are dropped here rather than pushed: the tree API would
      // accept them, but a diff listing every managed file on every sync makes
      // the one that actually changed impossible to see.
      if (opts.existing.get(path) === content) continue;
      files.push({ path, content });
    }

    return { files, removed: result.removed };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
