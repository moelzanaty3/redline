// The three severities of the output contract, and their order.
//
// The contract itself lives in standards/core.md and is what every finding —
// Redline's own or one ingested from another tool — is expressed in. There are
// exactly three, deliberately: "do not invent severities" is a rule in the
// standard, and a fourth would make every historical aggregate incomparable.
export const SEVERITIES = ['BLOCKER', 'HIGH', 'SUGGESTION'] as const;
export type Severity = (typeof SEVERITIES)[number];

// Higher is more serious. Used to pick the most severe of a set, never to
// average them: an average severity is not a thing.
export const SEVERITY_RANK: Record<Severity, number> = {
  BLOCKER: 3,
  HIGH: 2,
  SUGGESTION: 1,
};

export const isSeverity = (value: unknown): value is Severity =>
  typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
