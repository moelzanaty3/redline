// Shared telemetry aggregation. The digest and the dashboard must not disagree about
// what "acted on" means, so both read their numbers from here.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads telemetry records, optionally filtered to those merged since an ISO timestamp.
 */
export function loadRecords(dataDir = 'data', sinceIso = null) {
  const records = [];
  const problems = [];
  if (!existsSync(dataDir)) return { records, problems: ['data directory is missing'] };

  for (const file of readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f))) {
    const lines = readFileSync(join(dataDir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const record = JSON.parse(line);
        if (sinceIso && (record.merged_at ?? '') < sinceIso) return;
        records.push(record);
      } catch {
        // One malformed line must not silence the whole report.
        problems.push(`${file}:${i + 1} is not valid JSON`);
      }
    });
  }
  records.sort((a, b) => (a.merged_at ?? '').localeCompare(b.merged_at ?? ''));
  return { records, problems };
}

const staleOf = (record) =>
  Object.values(record.outcomes?.stale_by_severity ?? {}).reduce((a, b) => a + b, 0);

export function aggregate(records) {
  const sum = (fn) => records.reduce((n, r) => n + (fn(r) ?? 0), 0);

  const byRule = new Map();
  const byRepo = new Map();
  const reviewers = new Set();

  for (const record of records) {
    for (const [ruleId, stats] of Object.entries(record.rules ?? {})) {
      const entry = byRule.get(ruleId) ?? { fired: 0, resolved: 0, stale: 0, repos: new Set(), severity: stats.severity };
      entry.fired += stats.fired ?? 0;
      entry.resolved += stats.resolved ?? 0;
      entry.stale += stats.stale ?? 0;
      entry.repos.add(record.repo);
      byRule.set(ruleId, entry);
    }
    const repo = byRepo.get(record.repo) ?? { prs: 0, findings: 0, blocker: 0, stale: 0, exempted: 0 };
    repo.prs += 1;
    repo.findings += record.findings?.total ?? 0;
    repo.blocker += record.findings?.blocker ?? 0;
    repo.stale += staleOf(record);
    repo.exempted += record.exempted ? 1 : 0;
    byRepo.set(record.repo, repo);
    for (const reviewer of record.reviewers ?? []) reviewers.add(reviewer);
  }

  const findings = sum((r) => r.findings?.total);

  // Ingested scanner findings, aggregated ALONGSIDE Redline's own and never into
  // them. Every number above this line describes Redline's own catalogue and is
  // what rule tuning reads; folding another tool's rule ids in would tune
  // Redline's rules on that tool's noise. Reported separately, they answer a
  // question neither tool can answer alone: what the estate's whole finding
  // surface looks like under one severity contract.
  const scannerByTool = new Map();
  const scannerBySeverity = { blocker: 0, high: 0, suggestion: 0 };
  let scannerTotal = 0;
  for (const record of records) {
    scannerTotal += record.scanner?.findings ?? 0;
    for (const [tool, n] of Object.entries(record.scanner?.by_tool ?? {})) {
      scannerByTool.set(tool, (scannerByTool.get(tool) ?? 0) + n);
    }
    for (const [severity, n] of Object.entries(record.scanner?.by_severity ?? {})) {
      if (severity in scannerBySeverity) scannerBySeverity[severity] += n;
    }
  }

  return {
    scanner: {
      findings: scannerTotal,
      bySeverity: scannerBySeverity,
      byTool: [...scannerByTool.entries()]
        .map(([tool, findings]) => ({ tool, findings }))
        .sort((a, b) => b.findings - a.findings),
      // How many repositories in this window emit anything at all. This is the
      // number that decides whether Phase 1 was worth doing, and the roadmap's
      // open question 1 asks for exactly it.
      repos: new Set(records.filter((r) => (r.scanner?.findings ?? 0) > 0).map((r) => r.repo)).size,
    },
    prs: records.length,
    prsWithFindings: records.filter((r) => (r.findings?.total ?? 0) > 0).length,
    findings,
    blocker: sum((r) => r.findings?.blocker),
    high: sum((r) => r.findings?.high),
    suggestion: sum((r) => r.findings?.suggestion),
    resolved: sum((r) => r.outcomes?.resolved),
    stale: sum(staleOf),
    untagged: sum((r) => r.untagged_findings),
    withoutRuleId: sum((r) => r.findings_without_rule_id),
    unknownRuleIds: sum((r) => r.unknown_rule_ids),
    exempted: records.filter((r) => r.exempted).length,
    humanThreads: sum((r) => r.human_review_threads),
    reviewers: [...reviewers],
    repos: byRepo.size,
    byRepo: [...byRepo.entries()]
      .map(([repo, s]) => ({ repo, ...s }))
      .sort((a, b) => b.blocker - a.blocker || b.findings - a.findings),
    byRule: [...byRule.entries()]
      .map(([id, s]) => ({
        id,
        severity: s.severity,
        fired: s.fired,
        resolved: s.resolved,
        stale: s.stale,
        repos: s.repos.size,
        // Ignored rate is the noise metric: fired a lot, acted on rarely.
        ignoredRate: s.fired ? s.stale / s.fired : 0,
        actedRate: s.fired ? s.resolved / s.fired : 0,
      }))
      .sort((a, b) => b.fired - a.fired),
  };
}

/** Rules that fire often and are acted on rarely — the tuning queue. */
export function noisiestRules(agg, { minFired = 5, minIgnoredRate = 0.3, limit = 5 } = {}) {
  return agg.byRule
    .filter((r) => r.id !== '(untagged)' && r.fired >= minFired && r.ignoredRate >= minIgnoredRate)
    .sort((a, b) => b.ignoredRate - a.ignoredRate || b.fired - a.fired)
    .slice(0, limit);
}

/** Rules that fire often and are almost always acted on — evidence they earn their place. */
export function mostValuableRules(agg, { minFired = 5, limit = 5 } = {}) {
  return agg.byRule
    .filter((r) => r.id !== '(untagged)' && r.fired >= minFired)
    .sort((a, b) => b.actedRate - a.actedRate || b.fired - a.fired)
    .slice(0, limit);
}

/** Buckets records into calendar weeks for trend lines. */
export function weekly(records) {
  const weeks = new Map();
  for (const record of records) {
    const date = new Date(record.merged_at ?? Date.now());
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(record);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, rows]) => ({ week, ...aggregate(rows) }));
}

export const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
