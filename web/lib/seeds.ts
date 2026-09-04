// Build-time count of the seeded validation corpus. The marker convention is documented
// in seeded/README.md and parsed authoritatively by scripts/score-seeds.mjs; that script
// is a CLI entry point that exits on import, so the marker pattern and the file selection
// (no .md, no seeded/clean/) are mirrored here rather than imported. Any change to the
// convention must land in both places — scripts/validate.mjs is what fails CI if a marker
// stops parsing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./content";

const SEED_MARKER = /SEED\s+(\d+)\s*\[(BLOCKER|HIGH|SUGGESTION)\]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (!entry.endsWith(".md")) out.push(full);
  }
  return out;
}

let cached: number | null = null;

export function seededFindingCount(): number {
  if (cached === null) {
    const root = repoRoot();
    let count = 0;
    for (const file of walk(join(root, "seeded"))) {
      if (relative(root, file).startsWith(join("seeded", "clean"))) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (SEED_MARKER.test(line)) count += 1;
      }
    }
    cached = count;
  }
  return cached;
}
