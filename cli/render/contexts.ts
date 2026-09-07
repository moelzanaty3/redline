import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Optional context sections: background a reviewer needs about how this
// repository works, rendered into the same artifacts the rules are.
//
// Context, deliberately not rules. A rule carries a stable `<stack>/<slug>` id
// that telemetry is keyed on for the life of the estate, and these are selected
// per repository rather than by stack — an id that only some repositories can
// ever fire would make the tuning numbers for it mean nothing. A finding that
// needs one of these cites `core/uncatalogued` and says which paragraph, which
// is also how the org finds out a context has earned promotion to real rules.
export interface ContextSection {
  // The `.redline.json` menu key that selects it.
  readonly key: 'speckit' | 'tmf';
  readonly file: string;
  // What `redline init` calls it when reporting the selection.
  readonly label: string;
}

export const CONTEXTS: readonly ContextSection[] = [
  { key: 'speckit', file: 'standards/contexts/speckit.md', label: 'spec-driven development' },
  { key: 'tmf', file: 'standards/contexts/tmf.md', label: 'TM Forum' },
];

/**
 * The bodies of the selected context sections, in the order declared above.
 *
 * A selected context whose file is missing is skipped rather than fatal: the
 * standards package and the CLI version a repository, and a repository that
 * recorded a context an older package does not carry must still render.
 */
export function loadContexts(root: string, selected: readonly string[]): string[] {
  const bodies: string[] = [];
  for (const context of CONTEXTS) {
    if (!selected.includes(context.key)) continue;
    const path = join(root, context.file);
    if (!existsSync(path)) continue;
    bodies.push(readFileSync(path, 'utf8').trim());
  }
  return bodies;
}

// Spec Kit is a separate tool with its own installer, its own templates and its
// own versioning. Redline neither creates nor edits its files — reproducing that
// scaffold would drift from the real one the day it changed — so a repository
// that already runs it keeps what it has, and Redline drops its own section
// rather than adding a second account of how the repository works.
const SPEC_KIT_MARKERS = ['.specify', '.github/prompts/speckit.constitution.prompt.md'];

export function detectSpecKit(cwd: string): string | null {
  for (const marker of SPEC_KIT_MARKERS) {
    if (existsSync(join(cwd, marker))) return marker;
  }
  return null;
}
