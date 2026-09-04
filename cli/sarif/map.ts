import { SEVERITY_RANK, isSeverity, type Severity } from '../core/severity.ts';

// Mapping a foreign severity vocabulary onto Redline's three.
//
// The roadmap names this as the risk in Phase 1, and it is right: this is a
// judgement call that will be wrong somewhere, so it is configurable and it is
// visible. Every ingested finding carries both the mapping's answer and the
// producer's own word, so a disagreement is arguable from the record rather than
// requiring the ingest to be re-run.
//
// The defaults are deliberately conservative in one direction: an unrecognised
// severity maps to SUGGESTION, never BLOCKER. A wrong BLOCKER blocks a merge and
// teaches people the gate is noise; a wrong SUGGESTION is a line in a report.
export type SeverityMap = Record<string, Severity>;

// SARIF 2.1.0's own `level` vocabulary, plus the ones the common producers
// actually emit in `properties.security-severity` bands and vendor fields.
export const DEFAULT_SEVERITY_MAP: SeverityMap = {
  // SARIF levels
  error: 'BLOCKER',
  warning: 'HIGH',
  note: 'SUGGESTION',
  none: 'SUGGESTION',
  // Common vendor words
  critical: 'BLOCKER',
  high: 'BLOCKER',
  medium: 'HIGH',
  moderate: 'HIGH',
  low: 'SUGGESTION',
  info: 'SUGGESTION',
  informational: 'SUGGESTION',
};

export const FALLBACK_SEVERITY: Severity = 'SUGGESTION';

export interface MappedSeverity {
  severity: Severity;
  // The producer's own word, verbatim.
  native: string;
  // Whether the map had an entry, or the fallback was used. A dashboard that
  // shows how many findings landed on the fallback is how a bad mapping gets
  // noticed instead of quietly skewing a quarter of the estate's severities.
  matched: boolean;
}

export function mapSeverity(native: string | undefined, map: SeverityMap): MappedSeverity {
  const word = (native ?? '').trim();
  const key = word.toLowerCase();
  const mapped = map[key];
  if (mapped) return { severity: mapped, native: word, matched: true };
  return { severity: FALLBACK_SEVERITY, native: word, matched: false };
}

/**
 * A repository's override, merged over the defaults.
 *
 * Overrides are validated rather than trusted: `.redline.json` is a file a
 * repository edits, and a typo like `"error": "CRITICAL"` must be refused at the
 * boundary with a message naming it — not silently ignored, which would leave a
 * repository believing it had raised a severity it had not.
 */
export function resolveSeverityMap(override: unknown): { map: SeverityMap; problems: string[] } {
  const problems: string[] = [];
  const map: SeverityMap = { ...DEFAULT_SEVERITY_MAP };

  if (override === undefined || override === null) return { map, problems };
  if (typeof override !== 'object' || Array.isArray(override)) {
    problems.push('severityMap must be an object of {"<their word>": "BLOCKER|HIGH|SUGGESTION"}');
    return { map, problems };
  }

  for (const [word, value] of Object.entries(override as Record<string, unknown>)) {
    if (!isSeverity(value)) {
      problems.push(
        `severityMap["${word}"] is ${JSON.stringify(value)} — it must be one of BLOCKER, HIGH or SUGGESTION`
      );
      continue;
    }
    map[word.toLowerCase()] = value;
  }

  return { map, problems };
}

/** The most severe of a set. Never an average — an average severity is not a thing. */
export function mostSevere(severities: Severity[]): Severity | null {
  return severities.reduce<Severity | null>(
    (worst, s) => (worst === null || SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst),
    null
  );
}
