import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function repoRoot(): string {
  const parent = resolve(process.cwd(), "..");
  if (existsSync(join(parent, "standards", "manifest.json"))) return parent;
  return process.cwd();
}

export function readRepoFile(relPath: string): string {
  return readFileSync(join(repoRoot(), relPath), "utf8");
}

export function fileStats(content: string): { lines: number; kb: string } {
  return {
    lines: content.split("\n").length,
    kb: (Buffer.byteLength(content, "utf8") / 1024).toFixed(1),
  };
}
