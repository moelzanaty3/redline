// Build-time count of the seeded validation corpus. The marker convention is documented
// in seeded/README.md and parsed authoritatively by scripts/score-seeds.mjs; that script
// is a CLI entry point that exits on import, so the marker pattern and the file selection
// (no .md, no seeded/clean/) are mirrored here rather than imported. Any change to the
// convention must land in both places — scripts/validate.mjs is what fails CI if a marker
// stops parsing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./content";

const SEED_MARKER = /SEED\s+(\d+)\s*\[(BLOCKER|HIGH|SUGGESTION)\]\s*\(([^)]+)\)\s*(.*)$/;

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

export type SeededDefect = {
  n: number;
  severity: "BLOCKER" | "HIGH" | "SUGGESTION";
  ruleId: string;
  description: string;
};

export type SeedCorpus = {
  slug: string;
  // Relative to the repository root, so FileViewer can read it.
  files: string[];
  defects: SeededDefect[];
};

let corpora: Map<string, SeedCorpus> | null = null;

// One corpus per directory under seeded/, defects parsed from the markers in the
// files themselves. seeded/clean/ is deliberately included with zero defects:
// it is half the measurement — a reviewer that flags everything scores perfect
// recall and is useless — and a page that omitted it would describe only the
// half that is easy to pass.
export function seedCorpora(): Map<string, SeedCorpus> {
  if (corpora) return corpora;
  const root = repoRoot();
  const out = new Map<string, SeedCorpus>();

  for (const dir of readdirSync(join(root, "seeded"))) {
    const full = join(root, "seeded", dir);
    if (!statSync(full).isDirectory()) continue;

    const files: string[] = [];
    const defects: SeededDefect[] = [];
    for (const file of walk(full)) {
      files.push(relative(root, file));
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = SEED_MARKER.exec(line);
        if (!match) continue;
        defects.push({
          n: Number(match[1]),
          severity: match[2] as SeededDefect["severity"],
          ruleId: (match[3] ?? "").trim(),
          description: (match[4] ?? "").trim(),
        });
      }
    }
    out.set(dir, { slug: dir, files: files.sort(), defects });
  }

  corpora = out;
  return out;
}

export function seedCorpus(slug: string): SeedCorpus | undefined {
  return seedCorpora().get(slug);
}
