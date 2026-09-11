#!/usr/bin/env node
/**
 * Refreshes web/lib/github-stars.json.
 *
 * Star counts drift. Rather than pretend otherwise we snapshot them, record the
 * date the snapshot was taken, and render that date next to the number. The
 * build never calls the network: if this file is stale, the site says so; if a
 * repo is missing from it, the site omits the count for that repo rather than
 * guessing.
 *
 * Run: node scripts/fetch-stars.mjs   (needs an authenticated `gh`)
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const SOURCE = new URL("../web/lib/skills-catalog.ts", import.meta.url);
const OUT = new URL("../web/lib/github-stars.json", import.meta.url);

/** Pull every `owner`/`repo` pair out of the PUBLISHERS table. */
function repoSlugs(src) {
  const re = /owner:\s*"([^"]+)",\s*\n\s*repo:\s*"([^"]+)"/g;
  const slugs = new Set();
  for (const m of src.matchAll(re)) slugs.add(`${m[1]}/${m[2]}`);
  return [...slugs].sort();
}

async function stars(slug) {
  // execFile, not exec: `slug` goes in as one argv entry, never through a shell.
  const { stdout } = await run("gh", [
    "api",
    `repos/${slug}`,
    "--jq",
    ".stargazers_count",
  ]);
  const n = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`unparseable count for ${slug}`);
  return n;
}

const src = await readFile(SOURCE, "utf8");
const slugs = repoSlugs(src);
if (slugs.length === 0) {
  console.error("No owner/repo pairs found — did PUBLISHERS move?");
  process.exit(1);
}

const previous = await readFile(OUT, "utf8").then(
  (t) => JSON.parse(t).stars ?? {},
  () => ({}),
);

const next = {};
let failed = 0;
for (const slug of slugs) {
  try {
    next[slug] = await stars(slug);
    console.log(`  ${String(next[slug]).padStart(7)}  ${slug}`);
  } catch (err) {
    failed += 1;
    // Drop the repo rather than carry the previous run's number forward. Every
    // value in this file is stamped with one shared fetchedAt, so a carried
    // number would be published under a date on which nobody counted it —
    // the exact misstatement the dated snapshot exists to prevent. A repo with
    // no number simply renders without the stars fact, which is honest.
    console.warn(`  failed: ${slug} — ${err.message.split("\n")[0]}`);
  }
}

if (failed === slugs.length) {
  console.error("Every request failed; leaving the existing snapshot alone.");
  process.exit(1);
}

const payload = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  stars: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
};

const dropped = Object.keys(previous).filter((slug) => !(slug in next));
if (dropped.length) {
  console.warn(
    `\n${dropped.length} repo(s) in the previous snapshot have no number this run ` +
      `and were dropped rather than re-dated: ${dropped.join(", ")}.\n` +
      `Re-run to restore them; their pages render without a stars fact meanwhile.`,
  );
}

await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`\nWrote ${Object.keys(payload.stars).length} repos to lib/github-stars.json`);
