#!/usr/bin/env node
// Builds the Redline dashboard: one static, dependency-free page summarising whether the
// review layer is actually working. Deployed to GitHub Pages from the metrics repo.
//
// The page answers four questions, in order:
//   1. Is review being acted on, or ignored?  (the hero number)
//   2. Is that trending the right way?         (weekly lines)
//   3. Does review still catch known defects?  (seed recall history)
//   4. Which rules should be tuned or cut?     (noisiest rules)
//
// Colour follows the validated categorical palette; both modes are selected steps, and
// every charted value is also present in a table because three light-mode slots sit
// below 3:1 contrast (the relief rule).
//
// Env: DATA_DIR (default data), ORG, [DAYS=90], [OUT=dist], [SEED_SCORES=data/seed-scores.jsonl],
//      [ONBOARDED] (repo count, for coverage), [STANDARDS_VERSION], [REGISTRY=registry.json]

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadRecords, aggregate, weekly, noisiestRules, mostValuableRules, pct } from './lib/metrics.mjs';

const {
  DATA_DIR = 'data',
  ORG = 'org',
  DAYS = '90',
  OUT = 'dist',
  SEED_SCORES = 'data/seed-scores.jsonl',
  ONBOARDED = '',
  STANDARDS_VERSION = '',
} = process.env;

const since = new Date(Date.now() - Number(DAYS) * 86400000).toISOString();
const { records, problems } = loadRecords(DATA_DIR, since);
const agg = aggregate(records);
const weeks = weekly(records);
const noisy = noisiestRules(agg, { minFired: 3, minIgnoredRate: 0.25, limit: 8 });
const valuable = mostValuableRules(agg, { minFired: 3, limit: 5 });

// --- seed score history -------------------------------------------------------
const seedRuns = [];
if (existsSync(SEED_SCORES)) {
  for (const line of readFileSync(SEED_SCORES, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      seedRuns.push(JSON.parse(line));
    } catch {
      problems.push('seed-scores.jsonl has an unparseable line');
    }
  }
}
seedRuns.sort((a, b) => (a.scored_at ?? '').localeCompare(b.scored_at ?? ''));

const seedRepos = [...new Set(seedRuns.map((r) => r.repo))].slice(0, 5);
const seedSeries = seedRepos.map((repo) => ({
  name: repo.split('/').pop(),
  points: seedRuns
    .filter((r) => r.repo === repo)
    .map((r) => ({ x: r.scored_at.slice(0, 10), y: r.totals.blocker_recall * 100 })),
}));
const latestByRepo = new Map();
for (const run of seedRuns) latestByRepo.set(run.repo, run);
const latestSeeds = [...latestByRepo.values()];
const worstRecall = latestSeeds.length
  ? Math.min(...latestSeeds.map((s) => s.totals.blocker_recall))
  : null;
const totalFalsePositives = latestSeeds.reduce((n, s) => n + s.totals.false_positives_on_clean, 0);

// --- freshness ----------------------------------------------------------------
const newest = records.at(-1)?.collected_at ?? records.at(-1)?.merged_at ?? null;
const staleHours = newest ? Math.floor((Date.now() - new Date(newest)) / 3600000) : null;

const warnings = [...problems];
if (!records.length) warnings.push('No telemetry in this window — the collector is not running, or the token lost access.');
if (staleHours !== null && staleHours > 48) warnings.push(`Newest record is ${staleHours}h old. This page is stale.`);
if (agg.withoutRuleId > 0) warnings.push(`${agg.withoutRuleId} finding(s) carried no rule id — those repos are invisible to per-rule tuning.`);
if (agg.unknownRuleIds > 0) warnings.push(`${agg.unknownRuleIds} finding(s) cited a rule id outside the catalogue.`);
if (agg.untagged > 0) warnings.push(`${agg.untagged} finding(s) ignored the output contract; their severity is inferred.`);
if (worstRecall !== null && worstRecall < 1) warnings.push(`Seed BLOCKER recall is below 100% on at least one pilot repo (${Math.round(worstRecall * 100)}%). Do not widen the rollout.`);
if (totalFalsePositives > 0) warnings.push(`${totalFalsePositives} false positive(s) on the clean corpus at the last scoring.`);

// --- rendering ----------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

// The enforcement ladder, read from the register. This is the question the ladder
// exists to answer and no per-repository view can: how much of the estate is
// actually enforcing anything, as opposed to watching.
let ladder = null;
try {
  const registryPath = process.env.REGISTRY ?? 'registry.json';
  if (existsSync(registryPath)) {
    const entries = JSON.parse(readFileSync(registryPath, 'utf8')).entries ?? [];
    const counts = { observe: 0, warn: 0, 'block-blocker': 0, 'block-high': 0 };
    for (const entry of entries) {
      const rung = entry.rung ?? 'observe';
      if (rung in counts) counts[rung] += 1;
    }
    const total = entries.length;
    ladder = { counts, total, blocking: counts['block-blocker'] + counts['block-high'] };
  }
} catch {
  // A register that cannot be read leaves the ladder absent, not zeroed. Zero
  // blocking repositories and an unreadable register look nothing alike to
  // whoever has to act on the number.
}

const tiles = [
  { label: 'PRs merged', value: compact(agg.prs), sub: `${agg.repos} repo(s)${ONBOARDED ? ` of ${ONBOARDED} onboarded` : ''}` },
  { label: 'Findings', value: compact(agg.findings), sub: `${agg.blocker} BLOCKER · ${agg.high} HIGH · Redline only` },
  { label: 'PRs with findings', value: pct(agg.prsWithFindings, agg.prs), sub: `${agg.prsWithFindings} of ${agg.prs}` },
  { label: 'Ignored', value: pct(agg.stale, agg.findings), sub: `${agg.stale} left stale and outdated` },
  { label: 'Gate exemptions', value: pct(agg.exempted, agg.prs), sub: `${agg.exempted} PR(s) used a soft-fail label` },
  {
    // Ingested, not produced. The label says so, because a tile reading
    // "Findings 900" that silently included another tool's output would make
    // Redline look nine times more productive than it is.
    label: 'Scanner findings (ingested)',
    value: compact(agg.scanner.findings),
    sub:
      agg.scanner.findings === 0
        ? 'no repository in this window emits any'
        : `${agg.scanner.repos} repo(s) · ${agg.scanner.byTool.map((t) => t.tool).join(', ')}`,
  },
  {
    label: 'Enforcing',
    value: ladder === null ? '—' : pct(ladder.blocking, ladder.total),
    sub:
      ladder === null
        ? 'register unreadable — not zero, unknown'
        : `${ladder.blocking} of ${ladder.total} repo(s) block a merge on a finding`,
    status: ladder === null ? 'unknown' : undefined,
  },
  {
    label: 'Seed BLOCKER recall',
    value: worstRecall === null ? '—' : `${Math.round(worstRecall * 100)}%`,
    sub: worstRecall === null ? 'never scored' : `worst of ${latestSeeds.length} pilot repo(s)`,
    status: worstRecall === null ? 'unknown' : worstRecall < 1 ? 'critical' : 'good',
  },
];

const trendFindings = weeks.map((w) => ({ x: w.week, y: w.findings }));
const trendActed = weeks.map((w) => ({ x: w.week, y: w.findings ? Math.round((w.resolved / w.findings) * 100) : 0 }));

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redline Dashboard — ${esc(ORG)}</title>
<style>
  :root {
    color-scheme: light;
    --plane: #f9f9f7;
    --surface: #fcfcfb;
    --ink: #0b0b0b;
    --ink-2: #52514e;
    --muted: #898781;
    --grid: #e1e0d9;
    --axis: #c3c2b7;
    --ring: rgba(11,11,11,0.10);
    --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4;
    --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --plane: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
      --muted: #898781; --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
      --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --plane: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
    --muted: #898781; --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.5rem 4rem;
    background: var(--plane); color: var(--ink);
    font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: .75rem 1.25rem; margin-bottom: .35rem; }
  h1 { font-size: 1.35rem; margin: 0; font-weight: 600; }
  h1 span { color: var(--critical); }
  h2 { font-size: .95rem; font-weight: 600; margin: 0 0 .9rem; }
  .meta { color: var(--muted); font-size: .82rem; margin: 0 0 1.5rem; }

  .hero { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px;
          padding: 1.4rem 1.5rem; margin-bottom: 1rem; }
  .hero .label { color: var(--ink-2); font-size: .85rem; }
  .hero .figure { font-size: 3.4rem; line-height: 1.05; font-weight: 600; margin: .1rem 0 .25rem; }
  .hero .sub { color: var(--muted); font-size: .85rem; max-width: 62ch; }

  .tiles { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 1.5rem; }
  .tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: .85rem 1rem; }
  .tile .label { color: var(--ink-2); font-size: .78rem; }
  .tile .value { font-size: 1.75rem; font-weight: 600; line-height: 1.2; }
  .tile .sub { color: var(--muted); font-size: .76rem; }
  .tile.good .value { color: var(--good); }
  .tile.critical .value { color: var(--critical); }

  .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); margin-bottom: 1.5rem; }
  .card { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 1.1rem 1.2rem 1.2rem; }
  .card.full { grid-column: 1 / -1; }
  figure { margin: 0; }
  figcaption { color: var(--muted); font-size: .78rem; margin-top: .55rem; }
  .note { color: var(--ink-2); font-size: .82rem; margin: -.2rem 0 .9rem; max-width: 62ch; line-height: 1.55; }
  td.muted { color: var(--muted); }
  svg { display: block; width: 100%; height: auto; overflow: visible; }

  .legend { display: flex; flex-wrap: wrap; gap: .35rem .9rem; margin: .1rem 0 .6rem; font-size: .78rem; color: var(--ink-2); }
  .legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; margin-right: .35rem; vertical-align: -1px; }

  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .82rem; }
  th, td { padding: .42rem .6rem; text-align: left; border-bottom: 1px solid var(--grid); white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; font-size: .74rem; text-transform: uppercase; letter-spacing: .04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .95em; }

  .warn { background: color-mix(in srgb, var(--critical) 14%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--critical) 40%, transparent);
          border-radius: 10px; padding: .85rem 1.1rem; margin-bottom: 1.5rem; }
  .warn h2 { color: var(--critical); }
  .warn ul { margin: 0; padding-left: 1.1rem; }
  .warn li { margin: .2rem 0; }

  .tip { position: fixed; pointer-events: none; opacity: 0; transition: opacity .1s;
         background: var(--surface); color: var(--ink); border: 1px solid var(--ring);
         border-radius: 8px; padding: .4rem .6rem; font-size: .78rem; box-shadow: 0 6px 20px rgba(0,0,0,.25);
         z-index: 10; white-space: nowrap; }
  details { margin-top: .8rem; }
  summary { cursor: pointer; color: var(--ink-2); font-size: .8rem; }
</style>

<div class="wrap">
<header>
  <h1><span>Redline</span> Dashboard — ${esc(ORG)}</h1>
</header>
<p class="meta">
  Last ${esc(DAYS)} days · generated ${new Date().toISOString().slice(0, 16)}Z${
    STANDARDS_VERSION ? ` · standards v${esc(STANDARDS_VERSION)}` : ''
  }${staleHours !== null ? ` · newest record ${staleHours}h old` : ''}
</p>

${
  warnings.length
    ? `<section class="warn"><h2>Needs attention</h2><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`
    : ''
}

<section class="hero">
  <div class="label">Findings acted on</div>
  <div class="figure">${pct(agg.resolved, agg.findings)}</div>
  <div class="sub">${agg.resolved} of ${agg.findings} automated findings ended in a resolved review thread.
  This is the number the standards are tuned against: review nobody acts on is noise, however much of it there is.</div>
</section>

<section class="tiles">
${tiles
  .map(
    (t) => `  <div class="tile${t.status ? ` ${esc(t.status)}` : ''}">
    <div class="label">${esc(t.label)}</div>
    <div class="value">${esc(t.value)}</div>
    <div class="sub">${esc(t.sub)}</div>
  </div>`
  )
  .join('\n')}
</section>

<section class="grid">
  <div class="card">
    <h2>Findings per week</h2>
    <figure><svg id="c-findings" role="img" aria-label="Automated findings per week"></svg>
    <figcaption>Volume alone says nothing about value — read it beside the panel on the right.</figcaption></figure>
  </div>
  <div class="card">
    <h2>Acted-on rate per week</h2>
    <figure><svg id="c-acted" role="img" aria-label="Share of findings resolved, per week"></svg>
    <figcaption>Share of that week's findings that ended in a resolved thread.</figcaption></figure>
  </div>

  <div class="card full">
    <h2>Seed BLOCKER recall over time</h2>
    <div class="legend" id="l-seeds"></div>
    <figure><svg id="c-seeds" role="img" aria-label="Seed corpus BLOCKER recall per pilot repo over time"></svg>
    <figcaption>Percentage of seeded BLOCKER defects the reviewer flagged. Anything under 100% blocks a wider rollout.</figcaption></figure>
  </div>

  <div class="card full">
    <h2>Noisiest rules — the tuning queue</h2>
    <figure><svg id="c-noisy" role="img" aria-label="Rules by share of findings ignored"></svg>
    <figcaption>Rules that fire often and are rarely acted on. Cut, narrow, or downgrade these before adding new rules.</figcaption></figure>
  </div>
</section>

${
  ladder === null
    ? ''
    : `<section class="card full" style="margin-bottom:1rem">
  <h2>Enforcement ladder</h2>
  <p class="note">A repository climbs on recorded evidence, not on assertion, and steps back
  whenever it wants — the safe direction never needs permission. The security floor is not on
  this ladder: dependency review and the secret scan block at every rung, including observe.</p>
  <div class="scroll">
  <table>
    <thead><tr><th>Rung</th><th>Blocks on</th><th class="num">Repositories</th><th class="num">Share</th></tr></thead>
    <tbody>
${[
  ['observe', 'nothing — reported and recorded'],
  ['warn', 'nothing — reported in the merge box'],
  ['block-blocker', 'a BLOCKER finding'],
  ['block-high', 'a BLOCKER or a HIGH'],
]
  .map(
    ([rung, blocks]) =>
      `      <tr><td><code>${rung}</code></td><td>${blocks}</td><td class="num">${ladder.counts[rung]}</td><td class="num">${pct(ladder.counts[rung], ladder.total)}</td></tr>`
  )
  .join('\n')}
    </tbody>
  </table>
  </div>
</section>

`
}<section class="card full" style="margin-bottom:1rem">
  <h2>Finding sources</h2>
  <p class="note">Two catalogues, deliberately not merged. Redline's findings drive rule tuning;
  a scanner's rule ids belong to that scanner, and folding them together would tune Redline's
  rules on another tool's noise. Ingested findings are measured only — they never gate a merge,
  because gating on another tool's output makes Redline responsible for its false positives.</p>
  <div class="scroll">
  <table>
    <thead><tr><th>Source</th><th>Tool</th><th class="num">Findings</th><th class="num">BLOCKER</th><th class="num">HIGH</th></tr></thead>
    <tbody>
      <tr><td>Redline</td><td>LLM review</td><td class="num">${agg.findings}</td><td class="num">${agg.blocker}</td><td class="num">${agg.high}</td></tr>
${
  agg.scanner.byTool.length === 0
    ? '      <tr><td colspan="5" class="muted">No repository in this window emits code-scanning alerts. Roadmap open question 1 is answered by this row: if it stays empty, SARIF ingestion is not where the next effort belongs.</td></tr>'
    : agg.scanner.byTool
        .map(
          (t) =>
            `      <tr><td>Ingested</td><td>${esc(t.tool)}</td><td class="num">${t.findings}</td><td class="num">—</td><td class="num">—</td></tr>`
        )
        .join('\n')
}
    </tbody>
  </table>
  </div>
</section>

<section class="card full" style="margin-bottom:1rem">
  <h2>Rules by volume</h2>
  <div class="scroll">
  <table>
    <thead><tr><th>Rule</th><th>Severity</th><th class="num">Fired</th><th class="num">Repos</th><th class="num">Acted on</th><th class="num">Ignored</th></tr></thead>
    <tbody>
${agg.byRule
  .slice(0, 30)
  .map(
    (r) => `      <tr><td><code>${esc(r.id)}</code></td><td>${esc(r.severity ?? '—')}</td>
        <td class="num">${r.fired}</td><td class="num">${r.repos}</td>
        <td class="num">${Math.round(r.actedRate * 100)}%</td><td class="num">${Math.round(r.ignoredRate * 100)}%</td></tr>`
  )
  .join('\n')}
    </tbody>
  </table>
  </div>
  ${
    valuable.length
      ? `<details><summary>Rules earning their place (highest acted-on rate)</summary>
  <div class="scroll"><table><thead><tr><th>Rule</th><th class="num">Fired</th><th class="num">Acted on</th></tr></thead><tbody>
${valuable.map((r) => `    <tr><td><code>${esc(r.id)}</code></td><td class="num">${r.fired}</td><td class="num">${Math.round(r.actedRate * 100)}%</td></tr>`).join('\n')}
  </tbody></table></div></details>`
      : ''
  }
</section>

<section class="card full">
  <h2>Repositories</h2>
  <div class="scroll">
  <table>
    <thead><tr><th>Repo</th><th class="num">PRs</th><th class="num">Findings</th><th class="num">BLOCKER</th><th class="num">Ignored</th><th class="num">Exemptions</th></tr></thead>
    <tbody>
${agg.byRepo
  .map(
    (r) => `      <tr><td>${esc(r.repo)}</td><td class="num">${r.prs}</td><td class="num">${r.findings}</td>
        <td class="num">${r.blocker}</td><td class="num">${r.stale}</td><td class="num">${r.exempted}</td></tr>`
  )
  .join('\n')}
    </tbody>
  </table>
  </div>
</section>
</div>

<div class="tip" id="tip"></div>

<script type="application/json" id="data">${json({
  findings: trendFindings,
  acted: trendActed,
  seeds: seedSeries,
  noisy: noisy.map((r) => ({ id: r.id, fired: r.fired, ignored: Math.round(r.ignoredRate * 100) })),
})}</script>
<script>
(() => {
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const tip = document.getElementById('tip');
  const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5'];
  const ink = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const showTip = (evt, text) => {
    tip.textContent = text;
    tip.style.opacity = '1';
    tip.style.left = Math.min(evt.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = (evt.clientY - 34) + 'px';
  };
  const hideTip = () => { tip.style.opacity = '0'; };

  const niceMax = (v) => {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / mag) * mag;
  };

  // Line chart. One or more series; x is a date string, y a number.
  function line(id, series, { unit = '', yMax = null, labelSeries = true, w = 460, h = 230 } = {}) {
    const svg = document.getElementById(id);
    if (!svg) return;
    const W = w, H = h, P = { t: 12, r: labelSeries && series.length > 1 ? 118 : 26, b: 30, l: 40 };
    svg.setAttribute('viewBox', \`0 0 \${W} \${H}\`);
    svg.replaceChildren();

    const points = series.flatMap((s) => s.points);
    if (!points.length) {
      svg.append(el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: ink('--muted'), 'font-size': 12 }));
      svg.lastChild.textContent = 'No data yet';
      return;
    }
    const xs = [...new Set(points.map((p) => p.x))].sort();
    const max = yMax ?? niceMax(Math.max(...points.map((p) => p.y)));
    const px = (x) => P.l + (xs.length < 2 ? (W - P.l - P.r) / 2 : (xs.indexOf(x) / (xs.length - 1)) * (W - P.l - P.r));
    const py = (y) => H - P.b - (y / max) * (H - P.t - P.b);

    // Recessive solid hairline grid, four bands.
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg.append(el('line', { x1: P.l, x2: W - P.r, y1: py(v), y2: py(v), stroke: ink(i ? '--grid' : '--axis'), 'stroke-width': 1 }));
      const t = el('text', { x: P.l - 8, y: py(v) + 4, 'text-anchor': 'end', fill: ink('--muted'), 'font-size': 10, style: 'font-variant-numeric:tabular-nums' });
      t.textContent = Math.round(v) + unit;
      svg.append(t);
    }
    const step = Math.max(1, Math.ceil(xs.length / 6));
    xs.forEach((x, i) => {
      if (i % step && i !== xs.length - 1) return;
      const t = el('text', { x: px(x), y: H - P.b + 16, 'text-anchor': 'middle', fill: ink('--muted'), 'font-size': 10 });
      t.textContent = x.slice(5);
      svg.append(t);
    });

    const endLabels = [];
    series.forEach((s, si) => {
      const colour = ink(SERIES[si % SERIES.length]);
      const pts = s.points.slice().sort((a, b) => a.x.localeCompare(b.x));
      if (pts.length > 1) {
        svg.append(el('polyline', {
          points: pts.map((p) => \`\${px(p.x)},\${py(p.y)}\`).join(' '),
          fill: 'none', stroke: colour, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }));
      }
      pts.forEach((p) => {
        // 2px surface ring so overlapping markers stay separable.
        svg.append(el('circle', { cx: px(p.x), cy: py(p.y), r: 4.5, fill: colour, stroke: ink('--surface'), 'stroke-width': 2 }));
        const hit = el('circle', { cx: px(p.x), cy: py(p.y), r: 13, fill: 'transparent', tabindex: '0' });
        const text = \`\${s.name ? s.name + ' · ' : ''}\${p.x}: \${p.y}\${unit}\`;
        hit.addEventListener('mouseenter', (e) => showTip(e, text));
        hit.addEventListener('mousemove', (e) => showTip(e, text));
        hit.addEventListener('mouseleave', hideTip);
        hit.addEventListener('focus', (e) => showTip({ clientX: hit.getBoundingClientRect().x, clientY: hit.getBoundingClientRect().y }, text));
        hit.addEventListener('blur', hideTip);
        svg.append(hit);
      });
      // Direct-label the endpoint only, and only while the series count stays readable.
      if (labelSeries && series.length > 1 && series.length <= 4 && pts.length) {
        const last = pts[pts.length - 1];
        endLabels.push({ name: s.name, x: px(last.x) + 10, y: py(last.y) + 4, colour });
      }
    });

    // Series that finish at the same value would otherwise print on top of each other.
    endLabels.sort((a, b) => a.y - b.y);
    const MIN_GAP = 13;
    for (let i = 1; i < endLabels.length; i++) {
      if (endLabels[i].y - endLabels[i - 1].y < MIN_GAP) endLabels[i].y = endLabels[i - 1].y + MIN_GAP;
    }
    for (const label of endLabels) {
      const t = el('text', { x: label.x, y: label.y, fill: ink('--ink-2'), 'font-size': 10 });
      t.textContent = label.name;
      svg.append(t);
    }
  }

  // Horizontal bars, magnitude only. Values sit outside the bar end so nothing is clipped.
  function bars(id, rows) {
    const svg = document.getElementById(id);
    if (!svg) return;
    const rowH = 22, W = 1100, P = { t: 6, r: 60, b: 26, l: 300 };
    const H = P.t + P.b + Math.max(rows.length, 1) * rowH;
    svg.setAttribute('viewBox', \`0 0 \${W} \${H}\`);
    svg.replaceChildren();
    if (!rows.length) {
      const t = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: ink('--muted'), 'font-size': 12 });
      t.textContent = 'No rule is being ignored often enough to flag. Nothing to tune.';
      svg.append(t);
      return;
    }
    const max = 100;
    const scale = (v) => (v / max) * (W - P.l - P.r);
    svg.append(el('line', { x1: P.l, x2: P.l, y1: P.t, y2: H - P.b, stroke: ink('--axis'), 'stroke-width': 1 }));

    rows.forEach((row, i) => {
      // 2px surface gap between adjacent bars rather than a border around them.
      const y = P.t + i * rowH + 3;
      const h = rowH - 9;
      const label = el('text', { x: P.l - 10, y: y + h / 2 + 4, 'text-anchor': 'end', fill: ink('--ink-2'), 'font-size': 11 });
      label.textContent = row.id.length > 44 ? row.id.slice(0, 43) + '…' : row.id;
      svg.append(label);

      const bar = el('rect', { x: P.l, y, width: Math.max(scale(row.ignored), 2), height: h, rx: 4, fill: ink('--s2') });
      const text = \`\${row.id} — fired \${row.fired}×, \${row.ignored}% ignored\`;
      bar.addEventListener('mouseenter', (e) => showTip(e, text));
      bar.addEventListener('mousemove', (e) => showTip(e, text));
      bar.addEventListener('mouseleave', hideTip);
      svg.append(bar);

      const value = el('text', { x: P.l + scale(row.ignored) + 8, y: y + h / 2 + 4, fill: ink('--ink-2'), 'font-size': 11, style: 'font-variant-numeric:tabular-nums' });
      value.textContent = row.ignored + '%';
      svg.append(value);
    });

    const axis = el('text', { x: P.l, y: H - 6, fill: ink('--muted'), 'font-size': 10 });
    axis.textContent = 'share of this rule\\u2019s findings left unresolved and outdated';
    svg.append(axis);
  }

  const legend = document.getElementById('l-seeds');
  DATA.seeds.forEach((s, i) => {
    const span = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = ink(SERIES[i % SERIES.length]);
    span.append(swatch, s.name);
    legend.append(span);
  });

  const draw = () => {
    line('c-findings', [{ name: 'Findings', points: DATA.findings }]);
    line('c-acted', [{ name: 'Acted on', points: DATA.acted }], { unit: '%', yMax: 100 });
    // Full-width card: a wider viewBox keeps the plot from stretching into a tall band
    // and keeps tick text at its intended size.
    line('c-seeds', DATA.seeds, { unit: '%', yMax: 100, w: 1100, h: 215 });
    bars('c-noisy', DATA.noisy);
  };
  draw();
  // Marks read their colour from CSS custom properties at draw time, so a theme change
  // has to trigger a redraw — from the OS setting, or from a data-theme stamp.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributeFilter: ['data-theme'] });
})();
</script>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
console.log(
  `dashboard: ${agg.prs} PRs, ${agg.findings} findings, ${agg.byRule.length} rules, ${warnings.length} warning(s) → ${join(OUT, 'index.html')}`
);
