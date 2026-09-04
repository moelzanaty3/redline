import type { Severity } from '../core/severity.ts';

// A finding, whoever produced it.
//
// `source` is not optional and never inferred. Redline's whole claim in Phase 1
// is that it can measure LLM review and static analysis against one severity
// contract without either distorting the other — and rule tuning reads this
// stream. A view that cannot tell a CodeQL finding from a Redline one will tune
// Redline's rules on another tool's noise, which is the single way this piece
// can make things worse than not doing it.
export type FindingSource = 'redline' | 'sarif';

export interface NormalisedFinding {
  source: FindingSource;
  // For SARIF: the tool that produced it, from the run's driver. Redline's own
  // findings carry 'redline'.
  tool: string;
  // The rule id in the producing tool's own vocabulary — CodeQL's
  // `js/sql-injection`, not a Redline rule id. Never rewritten into a Redline
  // id: an ingested finding is another tool's claim, and relabelling it as a
  // Redline rule would make the estate's rule aggregates fiction.
  ruleId: string;
  severity: Severity;
  // The producer's own severity string, kept beside the mapped one so a
  // disagreement about the mapping is arguable from the record rather than
  // requiring a re-run.
  nativeSeverity: string;
  message: string;
  file: string | null;
  line: number | null;
}

export interface SarifIngest {
  findings: NormalisedFinding[];
  // A run this parser could not use, named. Reported and never thrown: one
  // malformed upload must not cost every other repository's findings in the
  // same collection pass.
  problems: string[];
}
