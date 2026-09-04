// Ingests code-scanning alerts as findings, alongside Redline's own.
//
// Mirrors cli/sarif/ for the collector, which runs in the metrics repo with no
// build step to import dist/ from — the same arrangement as the exemption
// parser, and guarded the same way by scripts/validate.mjs.
//
// The rule this file exists to hold: an ingested finding is ALWAYS distinguishable
// from a Redline one. Redline's claim in Phase 1 is that it can measure LLM review
// and static analysis against one severity contract without either distorting the
// other, and rule tuning reads this stream. A view that cannot tell a CodeQL
// finding from a Redline one tunes Redline's rules on another tool's noise, which
// is the single way this piece can make things worse than not doing it.

export const FALLBACK_SEVERITY = 'SUGGESTION';

export const DEFAULT_SEVERITY_MAP = {
  error: 'BLOCKER',
  warning: 'HIGH',
  note: 'SUGGESTION',
  none: 'SUGGESTION',
  critical: 'BLOCKER',
  high: 'BLOCKER',
  medium: 'HIGH',
  moderate: 'HIGH',
  low: 'SUGGESTION',
  info: 'SUGGESTION',
  informational: 'SUGGESTION',
};

export function mapSeverity(native, map = DEFAULT_SEVERITY_MAP) {
  const word = String(native ?? '').trim();
  const mapped = map[word.toLowerCase()];
  return mapped
    ? { severity: mapped, native: word, matched: true }
    : { severity: FALLBACK_SEVERITY, native: word, matched: false };
}

/**
 * GitHub code-scanning alerts into normalised findings.
 *
 * The alerts API is the practical ingestion point: it is what every SARIF upload
 * on GitHub becomes, it carries the tool name and the rule id already separated,
 * and it does not require the collector to fetch and parse raw SARIF blobs per
 * pull request.
 */
export function ingestAlerts(alerts, { map = DEFAULT_SEVERITY_MAP, where = 'alerts' } = {}) {
  const findings = [];
  const problems = [];

  for (const alert of alerts ?? []) {
    const ruleId = alert?.rule?.id?.trim?.();
    if (!ruleId) {
      problems.push(`${where}: an alert has no rule id — skipped`);
      continue;
    }
    // security_severity_level is present on security rules; severity is the
    // SARIF level for everything else. Security first: it is the more specific
    // statement when both exist.
    const native = alert.rule.security_severity_level ?? alert.rule.severity;
    const mapped = mapSeverity(native, map);
    if (!mapped.matched && native) {
      problems.push(`${where}: severity "${native}" is not in the severity map — ${ruleId} ingested as ${mapped.severity}`);
    }

    findings.push({
      source: 'sarif',
      tool: alert.tool?.name ?? 'unknown',
      ruleId,
      severity: mapped.severity,
      nativeSeverity: mapped.native,
      state: alert.state ?? 'unknown',
      file: alert.most_recent_instance?.location?.path ?? null,
      line: alert.most_recent_instance?.location?.start_line ?? null,
    });
  }

  return { findings, problems };
}

/**
 * Per-source aggregate. Two catalogues, never merged into one.
 *
 * Acted-on is computed within each source, never across them: Redline's is
 * "review thread resolved", a scanner's is "alert closed", and averaging two
 * different definitions produces a number that describes neither.
 */
export function aggregateBySource(findings) {
  const bucket = () => ({ total: 0, blocker: 0, high: 0, suggestion: 0, acted: 0, byTool: {}, byRule: {} });
  const out = { redline: bucket(), sarif: bucket() };

  for (const finding of findings ?? []) {
    const side = out[finding.source];
    if (!side) continue;
    side.total += 1;
    side[finding.severity.toLowerCase()] += 1;
    if (finding.acted) side.acted += 1;
    side.byTool[finding.tool] = (side.byTool[finding.tool] ?? 0) + 1;
    const rule = side.byRule[finding.ruleId] ?? { fired: 0, acted: 0, severity: finding.severity };
    rule.fired += 1;
    if (finding.acted) rule.acted += 1;
    side.byRule[finding.ruleId] = rule;
  }

  for (const side of Object.values(out)) {
    side.actedRate = side.total > 0 ? side.acted / side.total : null;
  }
  return out;
}
