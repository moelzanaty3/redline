#!/usr/bin/env node
// Computes the Phase 0 baseline: the numbers every later phase in the roadmap is
// judged against.
//
// Run once, by the owner, with org credentials. Every figure it cannot source is
// reported as unavailable WITH ITS REASON rather than as zero — a zero that means
// "nobody measured this" reads as a finding, and makes every later comparison
// look like progress that did not happen.
//
// The roadmap's Phase 0 acceptance list, and where each figure comes from:
//   repositories onboarded ......... registry.json (the derived register)
//   today's acted-on rate .......... collected telemetry under data/
//   findings per week .............. collected telemetry
//   merge rate on Redline's own PRs  the GitHub search API (needs ORG + token)
//   SARIF producers in use ......... a scan of each repo's workflows (needs token)
//   token spend per review ......... the AI vendor's own usage reporting, which
//                                    this script cannot read — supply it with
//                                    SPEND_TOTAL/SPEND_CURRENCY/SPEND_GRAIN
//
// Env: [DATA_DIR=data], [REGISTRY=registry.json], [DAYS=90], [OUT=baseline.json],
//      [GH_TOKEN + ORG] to survey Redline's own PRs and SARIF producers,
//      [SPEND_TOTAL, SPEND_CURRENCY=USD, SPEND_GRAIN=org]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadRecords, aggregate } from './lib/metrics.mjs';
import { buildBaseline, formatBaseline } from './lib/baseline.mjs';

const {
  DATA_DIR = 'data',
  REGISTRY = 'registry.json',
  DAYS = '90',
  OUT = 'baseline.json',
  GH_TOKEN,
  ORG,
  SPEND_TOTAL,
  SPEND_CURRENCY = 'USD',
  SPEND_GRAIN = 'org',
} = process.env;

const windowDays = Number(DAYS);
const since = new Date(Date.now() - windowDays * 86400000).toISOString();

const { records, problems } = loadRecords(DATA_DIR, since);
for (const problem of problems) console.warn(`  ${problem}`);

const registry = existsSync(REGISTRY)
  ? JSON.parse(readFileSync(REGISTRY, 'utf8'))
  : null;

async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${GH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'redline-cli',
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} returned ${response.status}`);
  return response.json();
}

// Redline's own pull requests across the estate — the guardrail that catches the
// estate quietly declining while every other number looks fine.
let ownPullRequests = null;
if (GH_TOKEN && ORG) {
  try {
    const query = encodeURIComponent(`org:${ORG} is:pr head:redline/ created:>${since.slice(0, 10)}`);
    const result = await gh(`/search/issues?q=${query}&per_page=100`);
    ownPullRequests = (result.items ?? []).map((pr) => ({ merged: Boolean(pr.pull_request?.merged_at) }));
  } catch (error) {
    console.warn(`  could not survey Redline's own pull requests: ${error.message}`);
  }
}

// Which SARIF producers the estate already runs — roadmap open question 1, and
// the input that decides whether Phase 1 is the right first move at all.
let sarifProducers = null;
if (GH_TOKEN && ORG && registry) {
  sarifProducers = {};
  const KNOWN = [
    ['codeql-action', 'CodeQL'],
    ['snyk', 'Snyk'],
    ['semgrep', 'Semgrep'],
    ['sonarsource', 'SonarQube'],
    ['trivy', 'Trivy'],
    ['checkmarx', 'Checkmarx'],
    ['upload-sarif', 'other (uploads SARIF)'],
  ];
  for (const entry of registry.entries ?? []) {
    const repo = `${entry.org}/${entry.repo}`;
    try {
      const listing = await gh(`/repos/${repo}/contents/.github/workflows`);
      const tools = new Set();
      for (const file of listing) {
        if (!/\.ya?ml$/.test(file.name)) continue;
        const body = await gh(`/repos/${repo}/contents/${file.path}`);
        const text = Buffer.from(body.content ?? '', 'base64').toString('utf8').toLowerCase();
        for (const [needle, name] of KNOWN) if (text.includes(needle)) tools.add(name);
      }
      if (tools.size > 0) sarifProducers[repo] = [...tools];
    } catch {
      // A repository whose workflows this token cannot list is not evidence that
      // it runs no scanner. Skipping it undercounts; claiming zero would be a
      // stronger and wronger statement.
    }
  }
}

const spend = SPEND_TOTAL
  ? { total: Number(SPEND_TOTAL), currency: SPEND_CURRENCY, grain: SPEND_GRAIN }
  : null;

const baseline = buildBaseline({
  aggregate: aggregate(records),
  windowDays,
  registry,
  ownPullRequests,
  sarifProducers,
  spend,
});

writeFileSync(OUT, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(formatBaseline(baseline));
console.log(`\nWritten to ${OUT}.`);
