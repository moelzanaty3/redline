#!/usr/bin/env node
// Central telemetry collector. Runs in the redline-metrics repo on a schedule and pulls
// review outcomes for merged PRs across the org.
//
// This replaces the previous per-repo telemetry workflow, which required a cross-repo
// write token to be stored as a secret in every onboarded repo. One central read token
// in one repo has a far smaller blast radius.
//
// Vendor-neutral by design: findings are attributed by reviewer login, so Copilot,
// Claude, Codex or a human reviewer are all measured the same way.
//
// SARIF ingestion: where a repository already runs a scanner, its code-scanning
// alerts are ingested alongside Redline's own findings and put through the same
// severity contract. Ingested findings are ALWAYS tagged `source: "sarif"` with the
// producing tool — a view that cannot tell them apart would tune Redline's rules on
// another tool's noise, which is the one way this makes things worse than not doing
// it. Redline never runs a scanner and never asks a repository to change which ones
// it runs; and per the roadmap's open question 4, ingested findings are MEASURED
// ONLY. They never gate a merge: gating on another tool's output makes Redline
// responsible for that tool's false positives.
//
// Env: GH_TOKEN (read access to org repos + PRs), ORG, [SINCE=YYYY-MM-DD], [DAYS=8],
//      [OUT=data], [DRY_RUN=1], [SKIP_SARIF=1]

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEVERITIES,
  loadRules,
  parseFinding,
  isReviewBot,
  emptyBySeverity,
  RESERVED_RULE_IDS,
} from './lib/rules.mjs';
import { readExemption } from './lib/exemptions.mjs';
import { ingestAlerts } from './lib/sarif.mjs';

const { GH_TOKEN, ORG, SINCE, DAYS = '8', OUT = 'data', DRY_RUN } = process.env;
if (!GH_TOKEN || !ORG) throw new Error('GH_TOKEN and ORG are required');

const since = SINCE ?? new Date(Date.now() - Number(DAYS) * 86400000).toISOString().slice(0, 10);

// The catalogue is optional here: the collector may run in the metrics repo, which has
// the scripts but not necessarily the standards. Without it, rule ids are still recorded,
// just not validated.
let rules = new Map();
try {
  rules = loadRules();
} catch {
  console.warn('standards/ not present — rule ids will be recorded without validation');
}

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`graphql ${res.status}: ${await res.text()}`);
  const body = await res.json();
  // Partial errors are common (a repo the token cannot see); only a total failure is fatal.
  if (body.errors?.length && !body.data) throw new Error(JSON.stringify(body.errors));
  if (body.errors?.length) console.warn(`  ${body.errors.length} partial GraphQL error(s)`);
  return body.data;
}

const QUERY = `
query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 25, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        mergedAt
        additions
        deletions
        changedFiles
        repository { nameWithOwner }
        author { login }
        title
        body
        # Lead time is first commit to merge. The first commit, not the branch
        # creation: a branch that sat unused for a week did not take a week of
        # lead time, and reporting that it did makes every team look slower than
        # it is.
        commits(first: 1) { nodes { commit { committedDate } } }
        labels(first: 30) { nodes { name } }
        reviewThreads(first: 100) {
          nodes {
            isResolved
            isOutdated
            comments(first: 1) { nodes { body author { login } path } }
          }
        }
      }
    }
  }
}`;

function summarise(pr) {
  const findings = emptyBySeverity();
  const resolved = emptyBySeverity();
  const stale = emptyBySeverity();
  const reviewers = new Set();
  // Per-rule outcomes are the point of the rule-id contract: a rule that fires a lot and
  // is never acted on is noise, and that is only visible per rule, not per severity.
  const byRule = new Map();
  let untagged = 0;
  let withoutRuleId = 0;
  let unknownRuleId = 0;
  let human = 0;

  for (const thread of pr.reviewThreads?.nodes ?? []) {
    const comment = thread.comments?.nodes?.[0];
    if (!comment) continue;
    const login = comment.author?.login ?? '';
    if (!isReviewBot(login)) {
      human += 1;
      continue;
    }
    reviewers.add(login);

    const parsed = parseFinding(comment.body ?? '');
    if (!parsed.tagged) untagged += 1;
    if (!parsed.hasRuleId) withoutRuleId += 1;
    if (parsed.hasRuleId && rules.size && !rules.has(parsed.ruleId) && !RESERVED_RULE_IDS.has(parsed.ruleId)) {
      unknownRuleId += 1;
    }

    const severity = parsed.severity.toLowerCase();
    findings[severity] += 1;
    if (thread.isResolved) resolved[severity] += 1;
    // Unresolved and outdated: the author changed the code around it and nobody closed
    // the thread. The strongest signal available that the finding was not worth acting on.
    const ignored = !thread.isResolved && thread.isOutdated;
    if (ignored) stale[severity] += 1;

    const ruleId = parsed.ruleId ?? '(untagged)';
    const entry = byRule.get(ruleId) ?? { fired: 0, resolved: 0, stale: 0, severity: parsed.severity };
    entry.fired += 1;
    if (thread.isResolved) entry.resolved += 1;
    if (ignored) entry.stale += 1;
    byRule.set(ruleId, entry);
  }

  const total = SEVERITIES.reduce((n, s) => n + findings[s.toLowerCase()], 0);
  const totalResolved = SEVERITIES.reduce((n, s) => n + resolved[s.toLowerCase()], 0);

  return {
    repo: pr.repository.nameWithOwner,
    pr: pr.number,
    title: pr.title ?? '',
    merged_at: pr.mergedAt,
    // Absent where the API did not return it. Left absent rather than defaulted
    // to the merge time, which would report a lead time of zero for every one of
    // them and drag the median toward a number no team achieved.
    first_commit_at: pr.commits?.nodes?.[0]?.commit?.committedDate ?? null,
    author: pr.author?.login ?? null,
    reviewers: [...reviewers],
    labels: (pr.labels?.nodes ?? []).map((l) => l.name),
    exempted: (pr.labels?.nodes ?? []).some((l) => ['redline-exempt', 'no-adr'].includes(l.name)),
    // The structured exemption, when the pull request carried one. A label says
    // a check was waived; this says who accepted what, why, and until when — the
    // difference between an exemption and an opt-out, and the only version of it
    // that can be audited or trended.
    exemption: readExemption(pr.body),
    size: { additions: pr.additions, deletions: pr.deletions, files: pr.changedFiles },
    findings: { total, ...findings },
    // Acted-on rate. total > 0 and acted_on near 0 means the review is being ignored,
    // which is the noise signal the standards are tuned against.
    outcomes: { resolved: totalResolved, resolved_by_severity: resolved, stale_by_severity: stale },
    rules: Object.fromEntries(byRule),
    human_review_threads: human,
    untagged_findings: untagged,
    findings_without_rule_id: withoutRuleId,
    unknown_rule_ids: unknownRuleId,
    collected_at: new Date().toISOString(),
  };
}

// Code-scanning alerts per repository, fetched once and cached: several merged
// pull requests share a repository, and the alerts API is per-repo not per-PR.
const alertCache = new Map();
async function scannerFindings(repo) {
  if (process.env.SKIP_SARIF) return { findings: [], problems: [] };
  if (alertCache.has(repo)) return alertCache.get(repo);

  let result = { findings: [], problems: [] };
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/code-scanning/alerts?per_page=100&state=open`,
      { headers: { authorization: `Bearer ${GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'redline' } }
    );
    // 404 means code scanning is not enabled here, which is a fact about the
    // repository and not a failure of this run. 403 usually means the token
    // cannot see security data — also not a failure worth stopping for.
    if (response.ok) {
      result = ingestAlerts(await response.json(), { where: repo });
    } else if (response.status !== 404 && response.status !== 403) {
      result = { findings: [], problems: [`${repo}: code-scanning alerts returned ${response.status}`] };
    }
  } catch (error) {
    result = { findings: [], problems: [`${repo}: could not read code-scanning alerts (${error.message})`] };
  }

  alertCache.set(repo, result);
  return result;
}

const records = [];
let cursor = null;
let page = 0;
do {
  const data = await graphql(QUERY, { q: `org:${ORG} is:pr is:merged merged:>=${since}`, cursor });
  const search = data.search;
  for (const pr of search.nodes) {
    if (!pr?.repository) continue;
    const record = summarise(pr);
    const scanner = await scannerFindings(record.repo);
    for (const problem of scanner.problems) console.warn(`  ${problem}`);
    // Kept as its own key, never folded into `findings` or `rules`. Those two are
    // Redline's own catalogue and drive rule tuning; mixing a scanner's rule ids
    // into them is exactly the distortion this design exists to prevent.
    //
    // `repo_scoped` says what this number is: code-scanning alerts are a fact
    // about the REPOSITORY, not about this pull request. Stamping the same count
    // on every merged PR and then summing them multiplied the estate's ingested
    // findings by the number of pull requests per repo — a repo with 12 alerts
    // and 40 merges reported 480. The aggregate counts each repository once.
    record.scanner = {
      repo_scoped: true,
      findings: scanner.findings.length,
      by_tool: scanner.findings.reduce((acc, f) => {
        acc[f.tool] = (acc[f.tool] ?? 0) + 1;
        return acc;
      }, {}),
      by_severity: scanner.findings.reduce((acc, f) => {
        acc[f.severity.toLowerCase()] = (acc[f.severity.toLowerCase()] ?? 0) + 1;
        return acc;
      }, {}),
    };
    records.push(record);
  }
  cursor = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
  page += 1;
  console.log(`page ${page}: ${records.length} PRs so far`);
  // GitHub search caps at 1000 results per query. Past that the window is too wide;
  // shorten DAYS rather than silently under-reporting.
  if (records.length >= 1000) {
    console.warn(`search result cap reached at ${records.length} PRs — narrow DAYS/SINCE, numbers are truncated`);
    break;
  }
} while (cursor);

if (DRY_RUN) {
  console.log(JSON.stringify(records.slice(0, 3), null, 2));
  console.log(`dry run: ${records.length} records, nothing written`);
  process.exit(0);
}

// Append idempotently: re-running for an overlapping window must not double-count.
mkdirSync(OUT, { recursive: true });
const byMonth = new Map();
for (const record of records) {
  const month = (record.merged_at ?? '').slice(0, 7);
  if (!month) continue;
  if (!byMonth.has(month)) byMonth.set(month, []);
  byMonth.get(month).push(record);
}

let written = 0;
for (const [month, monthRecords] of byMonth) {
  const file = join(OUT, `${month}.jsonl`);
  const existing = new Map();
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        existing.set(`${parsed.repo}#${parsed.pr}`, parsed);
      } catch {
        console.warn(`  skipping unparseable line in ${file}`);
      }
    }
  }
  for (const record of monthRecords) existing.set(`${record.repo}#${record.pr}`, record);

  const sorted = [...existing.values()].sort((a, b) =>
    (a.merged_at ?? '').localeCompare(b.merged_at ?? '')
  );
  writeFileSync(file, sorted.map((r) => JSON.stringify(r)).join('\n') + '\n');
  written += monthRecords.length;
  console.log(`${file}: ${sorted.length} total records (${monthRecords.length} from this run)`);
}

console.log(`collected ${written} records since ${since}`);
