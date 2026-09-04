// Build-time access to the real rule catalogue. Reuses scripts/lib/rules.mjs — the same
// parser telemetry, seed scoring, the digest and the dashboard all agree on — rather than
// re-deriving rule ids and counts from standards/ by hand.
import { loadRules } from "../../scripts/lib/rules.mjs";

export type Severity = "BLOCKER" | "HIGH" | "SUGGESTION";

export type RuleEntry = {
  id: string;
  stack: string;
  severity: Severity;
  text: string;
  source: string;
  line: number;
};

let cached: RuleEntry[] | null = null;

export function getRules(): RuleEntry[] {
  if (!cached) {
    const rules: RuleEntry[] = [];
    for (const rule of loadRules().values()) {
      rules.push({
        id: rule.id,
        stack: rule.stack,
        severity: rule.severity,
        text: rule.text,
        source: rule.source,
        line: rule.line,
      });
    }
    cached = rules;
  }
  return cached;
}

export function rulesForStack(stack: string): RuleEntry[] {
  return getRules().filter((r) => r.stack === stack);
}

export function findRule(id: string): RuleEntry | undefined {
  return getRules().find((r) => r.id === id);
}

const SEVERITY_RANK: Record<Severity, number> = { BLOCKER: 3, HIGH: 2, SUGGESTION: 1 };

export function bySeverityDesc(rules: RuleEntry[]): RuleEntry[] {
  return [...rules].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
