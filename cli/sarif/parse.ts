import { mapSeverity, type SeverityMap } from './map.ts';
import type { NormalisedFinding, SarifIngest } from './types.ts';

// SARIF 2.1.0, parsed tolerantly.
//
// Every producer emits a different subset. CodeQL puts its severity in
// `properties.security-severity`, Semgrep in `level`, Snyk in both. A result may
// carry no location at all. A ruleId may not appear in the run's rule table.
// None of that is a reason to reject the file: a parser that only accepts
// perfect SARIF ingests nothing from the estate it was built for.
//
// What it will not do is guess. A result with no usable rule id is reported as a
// problem rather than given a synthetic one, because a synthetic id aggregates
// with every other synthetic id and produces a "rule" that means nothing.

interface SarifLocation {
  physicalLocation?: {
    artifactLocation?: { uri?: string };
    region?: { startLine?: number };
  };
}

interface SarifResult {
  ruleId?: string;
  level?: string;
  message?: { text?: string };
  locations?: SarifLocation[];
  properties?: Record<string, unknown>;
}

interface SarifRule {
  id?: string;
  defaultConfiguration?: { level?: string };
  properties?: Record<string, unknown>;
}

interface SarifRun {
  tool?: { driver?: { name?: string; rules?: SarifRule[] } };
  results?: SarifResult[];
}

interface SarifLog {
  version?: string;
  runs?: SarifRun[];
}

// CodeQL and several others carry a 0-10 CVSS-ish band here rather than a word.
// Read as a band, not a number: the point is which of three buckets it lands in,
// and inventing precision the producer did not have would be worse than the
// coarse answer.
function securitySeverityBand(properties: Record<string, unknown> | undefined): string | undefined {
  const raw = properties?.['security-severity'];
  const value = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (Number.isNaN(value)) return undefined;
  if (value >= 9) return 'critical';
  if (value >= 7) return 'high';
  if (value >= 4) return 'medium';
  return 'low';
}

export function parseSarif(raw: string, map: SeverityMap, where = 'sarif'): SarifIngest {
  const findings: NormalisedFinding[] = [];
  const problems: string[] = [];

  let log: SarifLog;
  try {
    log = JSON.parse(raw) as SarifLog;
  } catch (error) {
    return {
      findings,
      problems: [`${where}: not valid JSON (${error instanceof Error ? error.message : String(error)})`],
    };
  }
  if (typeof log !== 'object' || log === null || !Array.isArray(log.runs)) {
    return { findings, problems: [`${where}: not a SARIF log — no "runs" array`] };
  }

  log.runs.forEach((run, runIndex) => {
    const tool = run.tool?.driver?.name?.trim() || 'unknown';
    const ruleTable = new Map<string, SarifRule>();
    for (const rule of run.tool?.driver?.rules ?? []) {
      if (rule.id) ruleTable.set(rule.id, rule);
    }

    const results = run.results;
    if (!Array.isArray(results)) {
      // A run with no results is a scanner that found nothing — a fact worth
      // ingesting as silence, not a malformed file.
      return;
    }

    results.forEach((result, i) => {
      const ruleId = result.ruleId?.trim();
      if (!ruleId) {
        problems.push(`${where}: run ${runIndex} result ${i} has no ruleId — skipped`);
        return;
      }

      const rule = ruleTable.get(ruleId);
      // Precedence: the result's own level, then the rule's default, then the
      // security-severity band. The result is most specific and the band is the
      // least, which is the order a reader would expect.
      const native =
        result.level ??
        rule?.defaultConfiguration?.level ??
        securitySeverityBand(result.properties) ??
        securitySeverityBand(rule?.properties);

      const mapped = mapSeverity(native, map);
      if (!mapped.matched && native) {
        problems.push(
          `${where}: ${tool} severity "${native}" is not in the severity map — ${ruleId} ingested as ${mapped.severity}`
        );
      }

      const location = result.locations?.[0]?.physicalLocation;
      findings.push({
        source: 'sarif',
        tool,
        ruleId,
        severity: mapped.severity,
        nativeSeverity: mapped.native,
        message: result.message?.text?.trim() ?? '',
        file: location?.artifactLocation?.uri ?? null,
        line: location?.region?.startLine ?? null,
      });
    });
  });

  return { findings, problems };
}

/** Per-tool counts, for a view that must never merge two rule catalogues. */
export function byTool(findings: NormalisedFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.tool] = (counts[finding.tool] ?? 0) + 1;
  return counts;
}
