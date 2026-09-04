import type { Severity } from '../core/severity.ts';
import type { AddedLine } from './diff.ts';

// The deterministic tier: rules a checker can decide, evaluated without a model.
//
// Why this exists. A share of what the standard asserts needs no judgement — a
// ticket reference is present or it is not, a suppression carries a comment or it
// does not. Sending those to an LLM costs tokens and invites a false positive on
// a fact, which is the worst kind: an author cannot argue with a model about
// whether the word TODO appears.
//
// Two constraints, both from the roadmap, both absolute:
//
//   - **Rule ids are untouched.** A deterministic rule keeps the id it has always
//     had. Every historical telemetry record is keyed on it, and reclassification
//     that renamed one would orphan the lot.
//   - **No rule changes meaning.** A check implements what the rule already says,
//     narrower where it must be. Where a check cannot decide the whole rule, it
//     decides the part it can and the model still sees the rule — that is why the
//     classification lives in the manifest and not in the markdown, so nothing is
//     removed from what a reviewer is asked to consider.

export interface PolicyFinding {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  problem: string;
}

export interface CheckContext {
  added: AddedLine[];
  // Files the change touched, for checks about the change rather than its lines.
  files: string[];
  // The pull request body, for the process facts.
  body: string;
}

export type DeterministicCheck = (ctx: CheckContext) => PolicyFinding[];

// A ticket reference: ABC-123, #123, or a URL to an issue tracker. Deliberately
// broad — the rule asks for a reference, not for a particular tracker, and a
// narrow pattern would fail a team whose tickets do not look like ours.
const TICKET = /([A-Z][A-Z0-9]+-\d+|#\d+|https?:\/\/\S*(issue|ticket|jira|linear|browse)\S*)/i;

const JS_LIKE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;

const finding = (
  line: AddedLine,
  ruleId: string,
  severity: Severity,
  problem: string
): PolicyFinding => ({ ruleId, severity, file: line.file, line: line.line, problem });

// `core/untracked-todo` — a TODO or FIXME with no ticket reference.
//
// Decidable in full: the rule asks whether a reference is present on the line,
// which is a fact about the text. The model is not asked about it at all.
const untrackedTodo: DeterministicCheck = ({ added }) =>
  added
    .filter((l) => /\b(TODO|FIXME|HACK|XXX)\b/.test(l.text) && !TICKET.test(l.text))
    .map((l) =>
      finding(
        l,
        'core/untracked-todo',
        'HIGH',
        'this TODO carries no ticket reference, so nothing will bring anyone back to it. ' +
          'Add the ticket id on the same line, or do the work now.'
      )
    );

// `core/type-checker-suppression` — a suppression with no comment AND no ticket.
//
// The rule requires both. A suppression with an explanation but no ticket is
// still a violation, and this decides that without a model: the presence of a
// ticket reference on the line is a fact.
const SUPPRESSIONS = [
  '@ts-ignore',
  '@ts-expect-error',
  '# type: ignore',
  '@SuppressWarnings',
  'eslint-disable',
  '// nolint',
  '# noqa',
];

const typeCheckerSuppression: DeterministicCheck = ({ added }) =>
  added
    .filter((l) => SUPPRESSIONS.some((s) => l.text.includes(s)) && !TICKET.test(l.text))
    .map((l) =>
      finding(
        l,
        'core/type-checker-suppression',
        'BLOCKER',
        'a type-checker suppression needs an inline explanation AND a ticket reference on the ' +
          'same line. Without one, nobody knows what it hides or when it can go.'
      )
    );

// `javascript/var-in-new-code` — `var` on a line this change added.
//
// Added lines only. Flagging `var` in a legacy file the author merely moved is
// exactly the noise the standard's "what NOT to flag" section forbids.
const varInNewCode: DeterministicCheck = ({ added }) =>
  added
    .filter((l) => JS_LIKE.test(l.file) && /(^|[^.\w])var\s+[A-Za-z_$]/.test(l.text))
    .map((l) =>
      finding(
        l,
        'javascript/var-in-new-code',
        'HIGH',
        '`var` is function-scoped and hoisted. Use `const`, or `let` where the binding is reassigned.'
      )
    );

// `javascript/unsafe-numeric-coercion` — `parseInt` with no radix.
//
// Only the radix half. The rest of the rule ("Number() coercion of user input
// without Number.isFinite") needs to know what is user input, which is judgement,
// and the model still sees the whole rule.
const parseIntWithoutRadix: DeterministicCheck = ({ added }) =>
  added
    .filter((l) => JS_LIKE.test(l.file) && /\bparseInt\s*\([^,)]*\)/.test(l.text))
    .map((l) =>
      finding(
        l,
        'javascript/unsafe-numeric-coercion',
        'HIGH',
        '`parseInt` without a radix. Pass 10 explicitly: an input like "08" or "0x10" is otherwise ' +
          'parsed by a rule most readers do not have in mind.'
      )
    );

// `core/hardcoded-secrets` — deliberately NOT here. A regex over added lines is
// how a secret scanner earns a reputation for false positives, and the gate
// already runs a real one against verified secrets only. The model keeps the rule
// for the cases a scanner misses, like a credential in a comment.

export const CHECKS: Record<string, DeterministicCheck> = {
  'core/untracked-todo': untrackedTodo,
  'core/type-checker-suppression': typeCheckerSuppression,
  'javascript/var-in-new-code': varInNewCode,
  'javascript/unsafe-numeric-coercion': parseIntWithoutRadix,
};

export interface PolicyResult {
  findings: PolicyFinding[];
  // Which rules were evaluated deterministically, so a reviewer prompt can say
  // so and a reader can tell "no finding" from "not checked".
  evaluated: string[];
}

export function runChecks(ctx: CheckContext, only?: string[]): PolicyResult {
  const ids = only ?? Object.keys(CHECKS);
  const findings: PolicyFinding[] = [];
  const evaluated: string[] = [];

  for (const id of ids) {
    const check = CHECKS[id];
    if (!check) continue;
    evaluated.push(id);
    findings.push(...check(ctx));
  }

  // Stable order: a gate whose output reorders between runs on the same diff
  // makes every re-run look like a change.
  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId)
  );
  return { findings, evaluated };
}

/** The output contract, rendered by code — never free-typed. */
export function formatFinding(finding: PolicyFinding): string {
  return `Redline/${finding.severity} [${finding.ruleId}]: ${finding.problem}`;
}
