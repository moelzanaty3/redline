#!/usr/bin/env node
// Assigns a stable `<stack>/<slug>` id to every normative rule in standards/ that does
// not already have one, and rewrites the source file in place.
//
//   node scripts/assign-rule-ids.mjs            # assign missing ids
//   node scripts/assign-rule-ids.mjs --check    # fail if any rule is missing an id
//
// Ids are written into the source markdown, not derived at render time, because a
// derived id changes whenever someone rewords the rule — and then every historical
// telemetry record for that rule silently orphans. Once written, an id is permanent:
// edit the prose freely, never the id.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const manifest = JSON.parse(readFileSync(join(ROOT, 'standards/manifest.json'), 'utf8'));

// Headings whose bullets are normative rules. "What NOT to flag" is deliberately absent:
// those are anti-rules and are never reported as findings.
const RULE_HEADING = /^#{2,3}\s+(BLOCKER|HIGH|SUGGESTION|Security|Type safety|Error handling|General correctness|Scope discipline)\b/i;
const ANY_HEADING = /^#{1,6}\s/;
const HAS_ID = /^-\s+`[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*`\s+—\s/;
const BULLET = /^-\s+(.*)$/;

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'without',
  'that', 'this', 'is', 'are', 'be', 'no', 'not', 'new', 'code', 'inside', 'from',
  'where', 'when', 'must', 'any', 'all', 'its', 'it', 'as', 'at', 'by',
]);

function slugFor(text) {
  // Prefer the bold lead-in — it is the rule's name. Fall back to the first sentence.
  const bold = /^\*\*(.+?)\*\*/s.exec(text);
  const source = bold ? bold[1] : text.split(/[.—:]/)[0];
  const words = source
    .replace(/`([^`]*)`/g, ' $1 ')
    .replace(/[^A-Za-z0-9\s.+#-]/g, ' ')
    .replace(/\./g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/^-+|-+$/g, ''))
    .filter(Boolean);

  const kept = [];
  for (const word of words) {
    if (kept.length >= 4) break;
    if (STOP.has(word) && kept.length) continue;
    if (STOP.has(word) && !kept.length && words.length > 1) continue;
    kept.push(word.replace(/\+\+/g, 'pp').replace(/#/g, 'sharp').replace(/[^a-z0-9-]/g, ''));
  }
  const slug = kept.filter(Boolean).join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || 'rule';
}

const targets = [
  ['core', 'standards/core.md'],
  ...Object.entries(manifest.stacks).map(([id, s]) => [id, s.source]),
];

const seen = new Map(); // id -> "file:line"
const missing = [];
let assigned = 0;

for (const [prefix, relPath] of targets) {
  const path = join(ROOT, relPath);
  const lines = readFileSync(path, 'utf8').split('\n');
  const used = new Set();
  let inRules = false;
  let inFence = false;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;

    if (ANY_HEADING.test(line)) {
      inRules = RULE_HEADING.test(line);
      continue;
    }
    if (!inRules) continue;

    const bullet = BULLET.exec(line);
    if (!bullet) continue;

    if (HAS_ID.test(line)) {
      const id = /^-\s+`([^`]+)`/.exec(line)[1];
      if (seen.has(id)) {
        console.error(`FAIL duplicate rule id "${id}" at ${relPath}:${i + 1} and ${seen.get(id)}`);
        process.exitCode = 1;
      }
      seen.set(id, `${relPath}:${i + 1}`);
      used.add(id);
      continue;
    }

    if (CHECK) {
      missing.push(`${relPath}:${i + 1}  ${bullet[1].slice(0, 70)}`);
      continue;
    }

    let slug = slugFor(bullet[1]);
    let id = `${prefix}/${slug}`;
    let n = 2;
    while (used.has(id) || seen.has(id)) id = `${prefix}/${slug}-${n++}`;
    used.add(id);
    seen.set(id, `${relPath}:${i + 1}`);

    lines[i] = `- \`${id}\` — ${bullet[1]}`;
    changed = true;
    assigned += 1;
  }

  if (changed) writeFileSync(path, lines.join('\n'));
}

if (CHECK) {
  if (missing.length) {
    console.error(`${missing.length} rule(s) missing an id:`);
    missing.forEach((m) => console.error(`  ${m}`));
    process.exit(1);
  }
  console.log(`all ${seen.size} rules have ids`);
} else {
  console.log(`assigned ${assigned} new id(s); ${seen.size} rules total`);
}
