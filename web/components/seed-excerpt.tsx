// The seed corpus, read off disk at build time.
//
// Two places on the home page show code from seeded/javascript/seeded-violations.js:
// the finding panel (section 3), which shows the vulnerable lines as a developer
// would meet them, and the "what we are scored against" claim (section 5), which
// shows the same file's SEED markers. Both slices are located by matching real
// content rather than by line number, and every lookup throws: a home page that
// silently rendered a stale or empty excerpt would be claiming a guarantee —
// "this is the file we publish" — that it was no longer delivering.
import { readRepoFile } from "@/lib/content";

// Relative to the repository root, so it is also the path the caption prints.
export const SEED_FILE = "seeded/javascript/seeded-violations.js";
// The rule the finding panel demonstrates. Validated against the rule catalogue
// by the home page itself, so a rename in standards/ fails the build here too.
export const SEED_RULE_ID = "javascript/shell-injection";

// "ctx" is unchanged context, "add" an added line, "hot" the added line the
// finding is about — the one thing in the panel that carries the accent.
export type DiffLine = { text: string; kind: "ctx" | "add" | "hot" };

function seedLines(): string[] {
  return readRepoFile(SEED_FILE).split("\n");
}

function lineAt(lines: string[], index: number): string {
  const line = lines[index];
  if (line === undefined) {
    throw new Error(`${SEED_FILE} has no line ${index + 1}; the home page renders it verbatim`);
  }
  return line;
}

function findLine(lines: string[], needle: string): number {
  const index = lines.findIndex((line) => line.includes(needle));
  if (index === -1) {
    throw new Error(
      `${SEED_FILE} no longer contains ${JSON.stringify(needle)}; the home page renders that line verbatim`,
    );
  }
  return index;
}

// The handler as it appears in the seed, from its signature down to the shell
// call, with the SEED marker comments stripped: the panel's whole point is that
// the reviewer found it in ordinary-looking code, and a comment naming the rule
// above the line would be giving the answer away.
export function seedDiff(): DiffLine[] {
  const lines = seedLines();
  const importLine = lineAt(lines, findLine(lines, "require('child_process')"));
  const start = findLine(lines, "async function handler(");
  const hot = findLine(lines, "exec(`convert ");
  if (hot < start) {
    throw new Error(`${SEED_FILE}: the exec() call no longer sits inside handler()`);
  }
  const body = lines
    .slice(start, hot + 1)
    .filter((line) => !line.trim().startsWith("// SEED"));

  const out: DiffLine[] = [
    { text: importLine, kind: "ctx" },
    { text: "", kind: "ctx" },
  ];
  body.forEach((text, i) => {
    out.push({ text, kind: i === 0 ? "ctx" : text.includes("exec(`convert ") ? "hot" : "add" });
  });
  return out;
}

// The file's own header — the convention every seed is scored against — plus the
// marker for the rule the finding panel uses, with the line it marks.
export function seedMarkerExcerpt(): string[] {
  const lines = seedLines();
  const header = [0, 1, 2].map((i) => lineAt(lines, i));
  if (!header.every((line) => line.startsWith("//"))) {
    throw new Error(`${SEED_FILE} no longer opens with its marker-convention comment`);
  }
  const marker = findLine(lines, `(${SEED_RULE_ID})`);
  return [...header, "", "  …", lineAt(lines, marker), lineAt(lines, marker + 1)];
}
