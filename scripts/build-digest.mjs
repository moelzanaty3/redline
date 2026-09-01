#!/usr/bin/env node
// Builds the weekly stakeholder digest from collected telemetry and writes an Adaptive
// Card payload to stdout (or --out <file>).
//
// Microsoft retired Office 365 connectors, so the old `{"text": "..."}` webhook shape no
// longer delivers. The target is a Power Automate "When a Teams webhook request is
// received" flow, which expects an Adaptive Card.
//
// Env: DATA_DIR (default data), DAYS (default 7), ORG, [OPEN_PRS], [STALE_PRS], [CAPPED],
//      [DASHBOARD_URL], [SEED_SCORES=data/seed-scores.jsonl]

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { loadRecords, aggregate, noisiestRules, pct } from './lib/metrics.mjs';

const {
  DATA_DIR = 'data',
  DAYS = '7',
  ORG = 'org',
  OPEN_PRS = '',
  STALE_PRS = '',
  CAPPED = '',
  DASHBOARD_URL = '',
  SEED_SCORES = 'data/seed-scores.jsonl',
} = process.env;

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];

const since = new Date(Date.now() - Number(DAYS) * 86400000).toISOString();
const { records, problems } = loadRecords(DATA_DIR, since);
const agg = aggregate(records);
const noisy = noisiestRules(agg);

// Latest seed score per repo, so the digest reports whether review quality is verified
// rather than assumed.
const seedScores = [];
if (existsSync(SEED_SCORES)) {
  const latest = new Map();
  for (const line of readFileSync(SEED_SCORES, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const score = JSON.parse(line);
      latest.set(score.repo, score);
    } catch {
      problems.push('seed-scores.jsonl has an unparseable line');
    }
  }
  seedScores.push(...latest.values());
}

const facts = [
  { title: 'PRs merged (instrumented)', value: `${agg.prs} across ${agg.repos} repo(s)` },
  { title: 'PRs with findings', value: `${agg.prsWithFindings} (${pct(agg.prsWithFindings, agg.prs)})` },
  { title: 'Findings', value: `${agg.findings} — ${agg.blocker} BLOCKER, ${agg.high} HIGH` },
  { title: 'Acted on (thread resolved)', value: `${agg.resolved} (${pct(agg.resolved, agg.findings)})` },
  { title: 'Ignored (stale + outdated)', value: `${agg.stale} (${pct(agg.stale, agg.findings)})` },
  { title: 'Gate exemptions used', value: `${agg.exempted} (${pct(agg.exempted, agg.prs)})` },
];
if (OPEN_PRS) {
  facts.push({
    title: 'Open PRs',
    value: OPEN_PRS + (STALE_PRS ? ` — ${STALE_PRS} idle over 7 days` : ''),
  });
}
if (seedScores.length) {
  const worst = seedScores.reduce((a, b) =>
    a.totals.blocker_recall <= b.totals.blocker_recall ? a : b
  );
  facts.push({
    title: 'Seed validation (worst repo)',
    value: `${worst.repo}: BLOCKER recall ${Math.round(worst.totals.blocker_recall * 100)}%, ${worst.totals.false_positives_on_clean} false positive(s)`,
  });
}

const topRepos = agg.byRepo.slice(0, 5);

const warnings = [];
if (agg.prs === 0) warnings.push('No telemetry for this window. The collector may be failing — check redline-collect.');
if (agg.withoutRuleId > 0) {
  warnings.push(
    `${agg.withoutRuleId} finding(s) carried no rule id — per-rule tuning is blind for those repos until the current standards land.`
  );
}
if (agg.unknownRuleIds > 0) warnings.push(`${agg.unknownRuleIds} finding(s) cited a rule id that is not in the catalogue.`);
if (agg.untagged > 0) warnings.push(`${agg.untagged} finding(s) ignored the output contract entirely — severity is a guess for those.`);
if (agg.findings > 0 && agg.stale / agg.findings > 0.3) {
  warnings.push('Over 30% of findings are being ignored. Tune the noisiest rules below before adding new ones.');
}
if (seedScores.some((s) => s.totals.blocker_recall < 1)) {
  warnings.push('At least one pilot repo is below 100% BLOCKER recall on the seed corpus. Do not widen the rollout.');
}
if (CAPPED) warnings.push('Search result cap was hit during collection — counts are a lower bound.');
warnings.push(...problems);

const bullets = (rows) => rows.join('\n');

const card = {
  type: 'message',
  attachments: [
    {
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: `Redline weekly — ${ORG}` },
          {
            type: 'TextBlock',
            isSubtle: true,
            spacing: 'None',
            text: `Last ${DAYS} days · generated ${new Date().toISOString().slice(0, 16)}Z`,
          },
          { type: 'FactSet', facts },
          ...(noisy.length
            ? [
                { type: 'TextBlock', weight: 'Bolder', text: 'Noisiest rules (tuning queue)', spacing: 'Medium' },
                {
                  type: 'TextBlock',
                  wrap: true,
                  text: bullets(
                    noisy.map(
                      (r) =>
                        `- \`${r.id}\` — fired ${r.fired}× across ${r.repos} repo(s), ${Math.round(r.ignoredRate * 100)}% ignored`
                    )
                  ),
                },
              ]
            : []),
          ...(topRepos.length
            ? [
                { type: 'TextBlock', weight: 'Bolder', text: 'Most findings', spacing: 'Medium' },
                {
                  type: 'TextBlock',
                  wrap: true,
                  text: bullets(
                    topRepos.map((r) => `- ${r.repo}: ${r.findings} (${r.blocker} BLOCKER, ${r.stale} ignored)`)
                  ),
                },
              ]
            : []),
          ...(warnings.length
            ? [
                { type: 'TextBlock', weight: 'Bolder', color: 'Attention', text: 'Needs attention', spacing: 'Medium' },
                { type: 'TextBlock', wrap: true, color: 'Attention', text: bullets(warnings.map((w) => `- ${w}`)) },
              ]
            : []),
        ],
        ...(DASHBOARD_URL
          ? { actions: [{ type: 'Action.OpenUrl', title: 'Open dashboard', url: DASHBOARD_URL }] }
          : {}),
      },
    },
  ],
};

const payload = JSON.stringify(card);
if (outFile) {
  writeFileSync(outFile, payload);
  console.error(`digest written to ${outFile} (${agg.prs} PRs, ${agg.findings} findings, ${warnings.length} warning(s))`);
} else {
  process.stdout.write(payload);
}
