#!/usr/bin/env node
// Builds the one page a finance stakeholder can read: what AI review cost, and
// what it caught. Sourced entirely from collected data — nothing on it is typed
// by hand except the spend figure, which no script can read from a vendor for you.
//
// The number that matters is cost per BLOCKER caught. A cost-management tool
// knows spend and has no findings, so it cannot compute value. A DORA tool has
// neither. Redline knows which findings were acted on, and joining the two is the
// entire argument — which is also why every figure here refuses rather than
// approximates: a made-up number in a finance conversation is not a small error.
//
// Env: [DATA_DIR=data], [DAYS=90], [OUT=roi.json], [HTML=roi.html],
//      [SPEND_TOTAL, SPEND_CURRENCY=USD, SPEND_GRAIN=org, SPEND_SOURCE, SPEND_PERIOD]

import { writeFileSync } from 'node:fs';
import { aggregate, loadRecords } from './lib/metrics.mjs';
import { dora } from './lib/dora.mjs';
import { costPerBlocker, readSpend } from './lib/spend.mjs';

const {
  DATA_DIR = 'data',
  DAYS = '90',
  OUT = 'roi.json',
  HTML = 'roi.html',
  SPEND_TOTAL,
  SPEND_CURRENCY = 'USD',
  SPEND_GRAIN = 'org',
  SPEND_SOURCE,
  SPEND_PERIOD,
} = process.env;

const windowDays = Number(DAYS);
const since = new Date(Date.now() - windowDays * 86400000).toISOString();

const { records, problems } = loadRecords(DATA_DIR, since);
for (const problem of problems) console.warn(`  ${problem}`);

const agg = aggregate(records);
const delivery = dora(records, { windowDays });
const spend = readSpend(
  SPEND_TOTAL
    ? {
        total: Number(SPEND_TOTAL),
        currency: SPEND_CURRENCY,
        grain: SPEND_GRAIN,
        source: SPEND_SOURCE,
        period: SPEND_PERIOD,
      }
    : null
);

// Value is what was ACTED ON, not what was reported. A finding nobody acted on
// caught nothing, and counting it would let the return be inflated by producing
// more noise — the exact behaviour the guardrails exist to prevent.
const blockersActedOn = agg.byRule
  .filter((r) => r.severity === 'BLOCKER')
  .reduce((n, r) => n + r.resolved, 0);

const cost = costPerBlocker(spend, blockersActedOn, { scope: spend.grain === 'repo' ? 'repo' : 'org' });

const roi = {
  generatedAt: new Date().toISOString(),
  windowDays,
  review: {
    pullRequests: agg.prs,
    repositories: agg.repos,
    findings: agg.findings,
    blockerFindings: agg.blocker,
    blockersActedOn,
    actedOnRate: agg.findings > 0 ? agg.resolved / agg.findings : null,
  },
  delivery,
  spend,
  costPerBlockerCaught: cost,
};

writeFileSync(OUT, `${JSON.stringify(roi, null, 2)}\n`);

const show = (label, value, reason) =>
  console.log(value === null || value === undefined
    ? `  ${label.padEnd(32)} not available — ${reason}`
    : `  ${label.padEnd(32)} ${value}`);
const pct = (v) => (v === null ? null : `${(v * 100).toFixed(1)}%`);

console.log(`Redline ROI — ${windowDays}-day window\n`);
console.log('WHAT REVIEW CAUGHT');
show('pull requests reviewed', agg.prs);
show('BLOCKER findings raised', agg.blocker);
show('BLOCKER findings acted on', blockersActedOn);
show('acted-on rate, all severities', pct(roi.review.actedOnRate), 'no findings in the window');

console.log('\nWHAT IT COST');
show('AI spend', spend.available ? `${spend.total} ${spend.currency} (${spend.grain} grain, ${spend.source})` : null, spend.reason);
show('cost per BLOCKER caught', cost.value === null ? null : `${cost.value.toFixed(2)} ${cost.currency}`, cost.reason);

console.log('\nDELIVERY (DORA)');
show('lead time, median hours', delivery.leadTimeHours.median?.toFixed(1) ?? null, delivery.leadTimeHours.reason);
show('change failure rate', pct(delivery.changeFailureRate.rate), delivery.changeFailureRate.reason);
show('deployment frequency, per day', delivery.deploymentFrequency.perDay?.toFixed(2) ?? null, delivery.deploymentFrequency.reason);
show('mean time to restore', null, delivery.meanTimeToRestore.reason);

if (delivery.changeFailureRate.caveat) console.log(`\n  note: ${delivery.changeFailureRate.caveat}`);

// --- the page -----------------------------------------------------------------
// The roadmap's exit condition for this piece is a single page a finance
// stakeholder can read, sourced entirely from collected data. Every unavailable
// figure prints its reason in place of the number: a dash invites the reader to
// assume zero, and zero is a claim.
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const row = (label, value, reason, note) =>
  `<tr><th scope="row">${esc(label)}</th><td>${
    value === null || value === undefined
      ? `<span class="absent">not available</span><span class="why">${esc(reason ?? '')}</span>`
      : `<b>${esc(value)}</b>${note ? `<span class="why">${esc(note)}</span>` : ''}`
  }</td></tr>`;

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redline — what AI review cost, and what it caught</title>
<style>
  :root { color-scheme: light dark; --ink:#111; --muted:#666; --line:#e4e4e0; --bg:#fbfbf9; --card:#fff; }
  @media (prefers-color-scheme: dark) { :root { --ink:#eee; --muted:#999; --line:#2a2a2a; --bg:#121211; --card:#1a1a19; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif; padding:2.5rem 1.25rem 4rem; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size:1.5rem; letter-spacing:-.02em; margin:0 0 .3rem; }
  .sub { color:var(--muted); margin:0 0 2rem; }
  h2 { font-size:.78rem; text-transform:uppercase; letter-spacing:.09em; color:var(--muted); margin:2.2rem 0 .6rem; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:.4rem 1.1rem; }
  table { width:100%; border-collapse:collapse; }
  th[scope=row] { text-align:left; font-weight:400; color:var(--muted); padding:.62rem 0; vertical-align:top; }
  td { text-align:right; padding:.62rem 0; border-bottom:1px solid var(--line); }
  tr:last-child td, tr:last-child th { border-bottom:0; }
  th[scope=row] { border-bottom:1px solid var(--line); }
  b { font-variant-numeric: tabular-nums; font-weight:600; }
  .absent { color:var(--muted); font-style:italic; }
  .why { display:block; color:var(--muted); font-size:.76rem; font-style:normal; max-width:26rem; margin-left:auto; line-height:1.45; }
  .lede { border-left:3px solid var(--ink); padding:.1rem 0 .1rem 1rem; margin:0 0 1.6rem; }
  footer { color:var(--muted); font-size:.78rem; margin-top:2.5rem; border-top:1px solid var(--line); padding-top:1rem; }
</style>
<main>
  <h1>What AI review cost, and what it caught</h1>
  <p class="sub">Redline · ${esc(windowDays)}-day window · generated ${esc(roi.generatedAt.slice(0, 10))}</p>

  <p class="lede">Every figure below is computed from collected review outcomes. Where a number
  is not available it says so and why, rather than showing a zero — a zero is a claim, and an
  absence is not.</p>

  <h2>What review caught</h2>
  <section><table>
    ${row('Pull requests reviewed', agg.prs)}
    ${row('BLOCKER findings raised', agg.blocker)}
    ${row('BLOCKER findings acted on', blockersActedOn, null, 'Value is what was acted on, not what was reported. A finding nobody acted on caught nothing.')}
    ${row('Acted-on rate, all severities', pct(roi.review.actedOnRate), 'no findings in the window')}
    ${row('Repositories measured', agg.repos)}
  </table></section>

  <h2>What it cost</h2>
  <section><table>
    ${row('AI spend', spend.available ? `${spend.total} ${spend.currency}` : null, spend.reason, spend.available ? `${spend.grain} grain — ${spend.source}` : null)}
    ${row('Cost per BLOCKER caught', cost.value === null ? null : `${cost.value.toFixed(2)} ${cost.currency}`, cost.reason, cost.value === null ? null : 'Spend divided by BLOCKERs acted on. No cost tool can compute this: it has spend and no findings.')}
  </table></section>

  <h2>Delivery</h2>
  <section><table>
    ${row('Lead time, median hours', delivery.leadTimeHours.median?.toFixed(1) ?? null, delivery.leadTimeHours.reason)}
    ${row('Change failure rate', pct(delivery.changeFailureRate.rate), delivery.changeFailureRate.reason, delivery.changeFailureRate.caveat)}
    ${row('Deployment frequency, per day', delivery.deploymentFrequency.perDay?.toFixed(2) ?? null, delivery.deploymentFrequency.reason)}
    ${row('Mean time to restore', null, delivery.meanTimeToRestore.reason)}
  </table></section>

  <footer>Sourced from <code>${esc(DATA_DIR)}</code>. The spend figure is supplied by the
  operator from the assistant vendor's own usage reporting — no script here can read a
  vendor's billing, and none of it is estimated.</footer>
</main>
`;

writeFileSync(HTML, html);
console.log(`\nWritten to ${OUT} and ${HTML}.`);
