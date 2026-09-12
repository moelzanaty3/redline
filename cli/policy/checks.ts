import type { Severity } from '../core/severity.ts';
import type { AddedLine } from './diff.ts';
import { ruleReference } from '../rules/url.ts';

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
//
// Broad, but not case-blind. These were one pattern under a single `i` flag,
// which made `[A-Z][A-Z0-9]+-\d+` match any word followed by a dash and digits
// — so `utf-8`, `sha-256`, `base-64` and `es-2015` all read as ticket
// references. A TODO that merely mentioned an encoding was recorded as tracked
// work and the rule went quiet on it. It failed OPEN, which is the direction
// that quietly costs findings rather than the one that costs trust, so it
// could sit here indefinitely looking like a corpus with nothing to find.
//
// Every tracker that issues a key renders it upper case, so the key pattern is
// the one that must not be case-insensitive. The URL still is: hosts and paths
// are written either way.
const TICKET_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const ISSUE_NUMBER = /#\d+/;
const TRACKER_URL = /https?:\/\/\S*(issue|ticket|jira|linear|browse)\S*/i;

const hasTicket = (text: string): boolean =>
  TICKET_KEY.test(text) || ISSUE_NUMBER.test(text) || TRACKER_URL.test(text);

// `.vue` and `.svelte` are here because a single-file component keeps all of
// its JavaScript inside one, and the `javascript` stack is rendered into the
// `web-vue` and `web-svelte` profiles — so these rules are shipped to those
// repositories and were then scoped away from every file that could break
// them. Neither stack carries its own `var` or numeric-coercion rule, so the
// exclusion was not a delegation to a better-placed rule; it was a gap.
const JS_LIKE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte)$/;

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
    .filter((l) => /\b(TODO|FIXME|HACK|XXX)\b/.test(l.text) && !hasTicket(l.text))
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

// One entry per suppression dialect Redline ships stack rules for.
//
// Patterns rather than substrings, because whitespace is where the substring
// list went wrong. It carried `// nolint` with a space, and golangci-lint only
// honours `//nolint` written without one — so the single Go spelling the
// checker looked for was the one spelling Go tooling ignores, and the rule
// could not fire on a Go repository at all.
//
// The larger miss was dialects. Redline renders stack rules for Swift, Kotlin,
// C# and Go, and this list held only the JavaScript, TypeScript, Python and
// Java spellings. A `mobile-ios` or `service-dotnet` repository therefore
// installed a BLOCKER rule that no line written in its own language could
// trip — the rule reported clean because it was never able to report anything.
// A Swift repository shipping a `.swiftlint.yml` is precisely the one this rule
// exists for.
//
// `@Suppress(` and `@SuppressWarnings` are deliberately separate: Kotlin's
// annotation is not a prefix of Java's, so one pattern cannot stand for both.
const SUPPRESSIONS: RegExp[] = [
  /@ts-ignore/, // TypeScript
  /@ts-expect-error/, // TypeScript
  /@ts-nocheck/, // TypeScript, whole file
  /eslint-disable/, // ESLint
  /#\s*type:\s*ignore/, // mypy
  /#\s*noqa/, // flake8, ruff
  /#\s*pylint:\s*disable/, // pylint
  /@SuppressWarnings/, // Java
  /@Suppress\s*\(/, // Kotlin
  /swiftlint:disable/, // SwiftLint
  /\/\/\s*nolint/, // golangci-lint — matches the canonical `//nolint` and the spaced form
  /#\s*pragma\s+warning\s+disable/i, // C#
];

const typeCheckerSuppression: DeterministicCheck = ({ added }) =>
  added
    .filter((l) => SUPPRESSIONS.some((s) => s.test(l.text)) && !hasTicket(l.text))
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
// A line whose content begins a comment. Not a parser — a checker that reported
// "use const" on the sentence "avoid var declarations here" is worse than one
// that misses a `var` on the same line as a trailing comment, and this is the
// cheap way to avoid the embarrassing half.
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#)/;

const varInNewCode: DeterministicCheck = ({ added }) =>
  added
    .filter(
      (l) =>
        JS_LIKE.test(l.file) &&
        !COMMENT_LINE.test(l.text) &&
        /(^|[^.\w])var\s+[A-Za-z_$]/.test(l.text)
    )
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
// Nested parentheses in the argument — `parseInt(String(x), 10)` — hid the comma
// from a `[^,)]*` scan, so a correctly-written call was reported as missing its
// radix. This checker flagged its own source, which is the clearest possible
// signal that the pattern was wrong.
const PARSE_INT_NO_RADIX = /\bparseInt\s*\((?:[^(),]|\([^()]*\))*\)/;

const parseIntWithoutRadix: DeterministicCheck = ({ added }) =>
  added
    .filter((l) => JS_LIKE.test(l.file) && PARSE_INT_NO_RADIX.test(l.text))
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

/**
 * The output contract, rendered by code — never free-typed.
 *
 * `docsBaseUrl` is the repository's own `.redline.json` value and is optional
 * everywhere: a repository that has not set one prints exactly what it printed
 * before, and one that has gets the address of the rule on the next line.
 */
export function formatFinding(finding: PolicyFinding, docsBaseUrl = ''): string {
  return (
    `Redline/${finding.severity} [${finding.ruleId}]: ${finding.problem}` +
    ruleReference(finding.ruleId, docsBaseUrl)
  );
}
