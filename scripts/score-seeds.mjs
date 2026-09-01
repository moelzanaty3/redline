#!/usr/bin/env node
// Scores an automated reviewer against the seeded corpus.
//
//   GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12
//   GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12 --json
//   GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12 \
//     --history data/seed-scores.jsonl --baseline
//
// Three numbers, because a review system fails in three ways:
//   recall     — seeded defects flagged at the expected severity or higher
//   precision  — comments on seeded/clean/**, which should never happen
//   attribution— flagged defects that cited the correct rule id
//
// Vendor-neutral: findings are attributed by reviewer login, so the same command scores
// Copilot, Claude or Codex on identical input.

import { readFileSync, readdirSync, statSync, appendFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, RANK, loadRules, parseFinding, isReviewBot, RESERVED_RULE_IDS } from './lib/rules.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const REPO = arg('repo');
const PR = arg('pr');
const AS_JSON = args.includes('--json');
const HISTORY = arg('history');
const BASELINE = args.includes('--baseline');
// A finding rarely lands on the exact marker line; accept the surrounding block.
const WINDOW = Number(arg('window') ?? 4);
const { GH_TOKEN } = process.env;

if (!REPO || !PR || !GH_TOKEN) {
  console.error(
    'usage: GH_TOKEN=... score-seeds.mjs --repo <org>/<repo> --pr <number> [--json] [--window 4] [--history <file>] [--baseline]'
  );
  process.exit(2);
}

const rules = loadRules();
const SEED_MARKER = /SEED\s+(\d+)\s*\[(BLOCKER|HIGH|SUGGESTION)\]\s*(?:\(([^)]+)\))?\s*(.*)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (!entry.endsWith('.md')) out.push(full);
  }
  return out;
}

// --- expected findings, read straight out of the corpus ---------------------
const expected = [];
const cleanFiles = new Set();
for (const file of walk(join(ROOT, 'seeded'))) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('seeded/clean/')) {
    cleanFiles.add(rel);
    continue;
  }
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = SEED_MARKER.exec(line);
      if (!m) return;
      expected.push({
        file: rel,
        stack: rel.split('/')[1],
        line: i + 1,
        id: Number(m[1]),
        severity: m[2],
        ruleId: m[3] ?? null,
        note: m[4].trim(),
      });
    });
}

for (const seed of expected) {
  if (seed.ruleId && !rules.has(seed.ruleId) && !RESERVED_RULE_IDS.has(seed.ruleId)) {
    console.error(`FAIL ${seed.file}:${seed.line} cites unknown rule id "${seed.ruleId}"`);
    process.exit(2);
  }
}

// --- what the reviewer actually posted --------------------------------------
async function api(path) {
  const results = [];
  let url = `https://api.github.com${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
    results.push(...(await res.json()));
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '');
    url = next?.[1] ?? null;
  }
  return results;
}

const comments = (await api(`/repos/${REPO}/pulls/${PR}/comments`)).filter((c) =>
  isReviewBot(c.user?.login ?? '')
);

const findings = comments.map((c) => {
  const parsed = parseFinding(c.body ?? '');
  return {
    path: c.path,
    line: c.line ?? c.original_line ?? 0,
    ...parsed,
    reviewer: c.user?.login,
    body: (c.body ?? '').split('\n')[0].slice(0, 120),
  };
});

// --- match ------------------------------------------------------------------
const used = new Set();
const caught = [];
const missed = [];

for (const seed of expected) {
  // Prefer a finding that cites the right rule; fall back to position + severity, which
  // still counts as caught. Attribution is scored separately so a reviewer that finds
  // the bug but names the wrong rule is not marked as having missed it.
  const candidates = findings
    .map((f, i) => ({ f, i }))
    .filter(
      ({ f, i }) =>
        !used.has(i) &&
        seed.file.endsWith(f.path) &&
        Math.abs(f.line - seed.line) <= WINDOW &&
        RANK[f.severity] >= RANK[seed.severity]
    );

  const exact = candidates.find(({ f }) => seed.ruleId && f.ruleId === seed.ruleId);
  const hit = exact ?? candidates[0];

  if (!hit) {
    missed.push(seed);
    continue;
  }
  used.add(hit.i);
  caught.push({
    ...seed,
    got: hit.f.severity,
    gotRuleId: hit.f.ruleId,
    ruleMatch: Boolean(seed.ruleId && hit.f.ruleId === seed.ruleId),
    reviewer: hit.f.reviewer,
  });
}

const falsePositives = findings.filter(
  (f, i) => !used.has(i) && [...cleanFiles].some((c) => c.endsWith(f.path))
);
const fpSet = new Set(falsePositives);
const unmatched = findings.filter((f, i) => !used.has(i) && !fpSet.has(f));

// Findings citing a rule id that is not in the catalogue: the reviewer invented one.
const invalidRuleIds = findings.filter(
  (f) => f.hasRuleId && !rules.has(f.ruleId) && !RESERVED_RULE_IDS.has(f.ruleId)
);

const byStack = new Map();
for (const seed of expected) {
  const entry = byStack.get(seed.stack) ?? { total: 0, caught: 0, ruleMatched: 0 };
  entry.total += 1;
  const hit = caught.find((c) => c.file === seed.file && c.id === seed.id);
  if (hit) {
    entry.caught += 1;
    if (hit.ruleMatch) entry.ruleMatched += 1;
  }
  byStack.set(seed.stack, entry);
}

const blockers = expected.filter((s) => s.severity === 'BLOCKER');
const blockersCaught = caught.filter((s) => s.severity === 'BLOCKER');
const ruleMatched = caught.filter((c) => c.ruleMatch);
const withRuleId = findings.filter((f) => f.hasRuleId).length;
const untagged = findings.filter((f) => !f.tagged).length;

const ratio = (n, d) => (d ? +(n / d).toFixed(3) : 0);

const report = {
  repo: REPO,
  pr: Number(PR),
  scored_at: new Date().toISOString(),
  standards_version: JSON.parse(readFileSync(join(ROOT, 'standards/manifest.json'), 'utf8')).version,
  reviewers: [...new Set(findings.map((f) => f.reviewer))],
  totals: {
    seeded: expected.length,
    caught: caught.length,
    recall: ratio(caught.length, expected.length),
    blocker_seeded: blockers.length,
    blocker_caught: blockersCaught.length,
    blocker_recall: ratio(blockersCaught.length, blockers.length),
    rule_attribution: ratio(ruleMatched.length, caught.length),
    comments_posted: findings.length,
    findings_with_rule_id: withRuleId,
    invalid_rule_ids: invalidRuleIds.length,
    false_positives_on_clean: falsePositives.length,
    unmatched_findings: unmatched.length,
    untagged_findings: untagged,
  },
  by_stack: Object.fromEntries(
    [...byStack].map(([k, v]) => [
      k,
      { ...v, recall: ratio(v.caught, v.total), rule_attribution: ratio(v.ruleMatched, v.caught) },
    ])
  ),
  missed: missed.map((m) => ({ file: m.file, line: m.line, severity: m.severity, rule: m.ruleId, note: m.note })),
  misattributed: caught
    .filter((c) => c.ruleId && !c.ruleMatch)
    .map((c) => ({ file: c.file, line: c.line, expected: c.ruleId, got: c.gotRuleId })),
  false_positives: falsePositives.map((f) => ({ path: f.path, line: f.line, severity: f.severity, body: f.body })),
  invalid_rule_ids: invalidRuleIds.map((f) => ({ path: f.path, line: f.line, ruleId: f.ruleId })),
};

if (HISTORY) {
  appendFileSync(HISTORY, JSON.stringify(report) + '\n');
  console.error(`appended to ${HISTORY}`);
}

// --- regression check against the previous run ------------------------------
let regression = null;
if (BASELINE && HISTORY && existsSync(HISTORY)) {
  const previous = readFileSync(HISTORY, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.repo === REPO && r.scored_at !== report.scored_at)
    .pop();
  if (previous) {
    const drops = [];
    if (report.totals.blocker_recall < previous.totals.blocker_recall)
      drops.push(`BLOCKER recall ${previous.totals.blocker_recall} → ${report.totals.blocker_recall}`);
    if (report.totals.false_positives_on_clean > previous.totals.false_positives_on_clean)
      drops.push(`false positives ${previous.totals.false_positives_on_clean} → ${report.totals.false_positives_on_clean}`);
    if (report.totals.rule_attribution < previous.totals.rule_attribution - 0.05)
      drops.push(`rule attribution ${previous.totals.rule_attribution} → ${report.totals.rule_attribution}`);
    regression = { since: previous.scored_at, drops };
    report.regression = regression;
  }
}

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const t = report.totals;
  const pct = (n) => `${Math.round(n * 100)}%`;
  console.log(`\nRedline seed score — ${REPO}#${PR} (standards v${report.standards_version})`);
  console.log(`reviewers: ${report.reviewers.join(', ') || 'none — no bot comments found'}\n`);
  console.log(`  BLOCKER recall     ${t.blocker_caught}/${t.blocker_seeded}  (${pct(t.blocker_recall)})`);
  console.log(`  overall recall     ${t.caught}/${t.seeded}  (${pct(t.recall)})`);
  console.log(`  rule attribution   ${pct(t.rule_attribution)} of caught seeds cited the right rule`);
  console.log(`  comments posted    ${t.comments_posted} (${t.findings_with_rule_id} carried a rule id)`);
  console.log(`  false positives    ${t.false_positives_on_clean} on seeded/clean/**`);
  console.log(`  unmatched          ${t.unmatched_findings} on a seed file but not near a marker`);
  console.log(`  untagged           ${t.untagged_findings} missing the Redline/<SEVERITY> prefix`);
  console.log(`  invalid rule ids   ${t.invalid_rule_ids}\n`);
  console.log('  by stack:');
  for (const [stack, s] of Object.entries(report.by_stack)) {
    console.log(
      `    ${stack.padEnd(16)} ${String(s.caught).padStart(2)}/${String(s.total).padEnd(3)} recall ${pct(s.recall).padStart(4)}   attribution ${pct(s.rule_attribution).padStart(4)}`
    );
  }
  if (report.missed.length) {
    console.log('\n  missed:');
    for (const m of report.missed) console.log(`    ${m.file}:${m.line} [${m.severity}] ${m.rule ?? '?'} — ${m.note}`);
  }
  if (report.misattributed.length) {
    console.log('\n  found but wrong rule cited:');
    for (const m of report.misattributed) console.log(`    ${m.file}:${m.line} expected ${m.expected}, got ${m.got ?? 'none'}`);
  }
  if (report.false_positives.length) {
    console.log('\n  false positives on clean code:');
    for (const f of report.false_positives) console.log(`    ${f.path}:${f.line} [${f.severity}] ${f.body}`);
  }
  if (regression?.drops.length) {
    console.log(`\n  REGRESSION against ${regression.since}:`);
    for (const d of regression.drops) console.log(`    ${d}`);
  }
}

// A pilot that cannot flag its own BLOCKER seeds is not ready to widen, and a regression
// against the last recorded run must stop the rollout.
const failed =
  report.totals.blocker_recall < 1 ||
  report.totals.false_positives_on_clean > 0 ||
  Boolean(regression?.drops.length);
process.exit(failed ? 1 : 0);
