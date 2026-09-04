import { minimatch } from './glob.ts';
import type { Manifest } from '../render/manifest.ts';
import { resolveProfile } from '../render/profile.ts';

// Which rules apply to a change, and nothing else.
//
// The whole point of this command over "ask an assistant to review my diff" is
// the bound: a model handed the composed standard for a twelve-stack profile
// spends most of its attention on rules for languages the diff does not touch,
// and the findings get worse, not better. This resolves the applicable set from
// the changed files, and the prompt carries only that.

export interface Scope {
  profile: string;
  // Stacks whose globs match at least one changed file, plus core, which always
  // applies.
  stacks: string[];
  // Changed files that matched no stack. Reported rather than dropped: a file
  // nothing covers is a gap in the standard, and silently reviewing it against
  // core alone hides that.
  uncovered: string[];
}

export function resolveScope(manifest: Manifest, profile: string, files: string[]): Scope {
  const resolved = resolveProfile(manifest, profile);
  const matched = new Set<string>();
  const uncovered: string[] = [];

  for (const file of files) {
    let any = false;
    for (const id of resolved.stacks) {
      const globs = manifest.stacks[id]?.globs ?? [];
      if (globs.some((glob) => minimatch(file, glob))) {
        matched.add(id);
        any = true;
      }
    }
    if (!any) uncovered.push(file);
  }

  // The profile's own order, not insertion order: a stack that extends another
  // must come after it, and the manifest already encodes that ordering.
  return {
    profile: resolved.profile,
    stacks: resolved.stacks.filter((id) => matched.has(id)),
    uncovered,
  };
}
