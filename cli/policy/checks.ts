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
  /#\s*pyright:\s*ignore/, // pyright
  /#\s*noqa/, // flake8, ruff
  /#\s*pylint:\s*disable/, // pylint
  /@SuppressWarnings/, // Java
  /@Suppress\s*\(/, // Kotlin
  /swiftlint:disable/, // SwiftLint
  /\/\/\s*nolint/, // golangci-lint — matches the canonical `//nolint` and the spaced form
  /#\s*pragma\s+warning\s+disable/i, // C#
];

// A suppression only suppresses in a file a checker reads. No type-checker or
// linter reads Markdown, so `@ts-ignore` in a `.md` file is prose ABOUT a
// suppression, not one.
//
// Redline found this against itself. `redline init` renders the standard into
// `.github/instructions/redline-react.instructions.md`, and the text of
// `react/exhaustive-deps-disabled` necessarily spells out the thing it bans —
// so the onboarding pull request, whose whole diff is Redline's own artifacts,
// was reported as a BLOCKER by Redline's own policy check. The rule cannot
// state what it forbids without tripping itself.
//
// `.mdc` is Cursor's rules file, which is Markdown with frontmatter and carries
// the same rendered text.
const PROSE = /\.(md|mdx|mdc|markdown|rst|txt|adoc)$/i;

const typeCheckerSuppression: DeterministicCheck = ({ added }) =>
  added
    .filter(
      (l) => !PROSE.test(l.file) && SUPPRESSIONS.some((s) => s.test(l.text)) && !hasTicket(l.text)
    )
    .map((l) =>
      finding(
        l,
        'core/type-checker-suppression',
        'BLOCKER',
        'a type-checker suppression needs an inline explanation AND a ticket reference on the ' +
          'same line. Without one, nobody knows what it hides or when it can go.'
      )
    );

// A line whose content begins a comment. Not a parser — a checker that reported
// "use const" on the sentence "avoid var declarations here" is worse than one
// that misses a `var` on the same line as a trailing comment, and this is the
// cheap way to avoid the embarrassing half.
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#)/;

// `core/unsafe-assertion` — a TypeScript double assertion with no `SAFETY:` comment.
//
// Only the double assertion. `as unknown as X` and `as any as X` exist for one
// purpose — to make the compiler accept a conversion it has refused — so the
// pattern is the violation and no judgement is needed. A single `as X`, Swift's
// `as!` and Kotlin's `!!` are often legitimate; the model still sees the rule.
//
// The justification may sit on the line above, which a diff only shows when that
// line was added too. When it was not, the check cannot see it and says nothing:
// a BLOCKER on a fact the author can disprove by scrolling up is the false
// positive this tier exists to avoid.
const DOUBLE_ASSERTION = /\bas\s+(unknown|any)\s+as\s+[A-Za-z_$({[]/;
// A marker with nothing after it is not a justification.
const SAFETY = /\bSAFETY:\s*\S/;

const unsafeAssertion: DeterministicCheck = ({ added }) => {
  const byPosition = new Map(added.map((l) => [`${l.file}:${l.line}`, l]));
  return added
    .filter((l) => {
      if (!JS_LIKE.test(l.file) || COMMENT_LINE.test(l.text) || !DOUBLE_ASSERTION.test(l.text)) {
        return false;
      }
      if (SAFETY.test(l.text)) return false;
      if (l.line === 1) return true;
      const above = byPosition.get(`${l.file}:${l.line - 1}`);
      return above !== undefined && !SAFETY.test(above.text);
    })
    .map((l) =>
      finding(
        l,
        'core/unsafe-assertion',
        'BLOCKER',
        'a double assertion overrides the type checker with no stated reason. Fix the types, or ' +
          'add a `// SAFETY: <why this holds>` comment on this line or the line above.'
      )
    );
};

// `javascript/var-in-new-code` — `var` on a line this change added.
//
// Added lines only. Flagging `var` in a legacy file the author merely moved is
// exactly the noise the standard's "what NOT to flag" section forbids.

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

// The anti-slop rules a single line can decide. Each pattern is the direct
// spelling only — an alias, a multi-line signature or a value threaded through
// a variable needs a parser, and the model still sees the whole rule for those.
const TS_ONLY = /\.(ts|tsx|mts|cts)$/;

const patternCheck =
  (
    ruleId: string,
    files: RegExp,
    pattern: RegExp,
    problem: string,
    { exempt, severity = 'HIGH' }: { exempt?: RegExp; severity?: Severity } = {}
  ): DeterministicCheck =>
  ({ added }) =>
    added
      .filter(
        (l) =>
          files.test(l.file) &&
          !COMMENT_LINE.test(l.text) &&
          pattern.test(l.text) &&
          !exempt?.test(l.text)
      )
      .map((l) => finding(l, ruleId, severity, problem));

// `typescript/unknown-return` — a function declared to return `unknown`.
// Only a declaration's own annotation, `): unknown` — not a callback type such
// as `() => unknown`, which is the idiomatic way to say "the result is ignored".
const unknownReturn = patternCheck(
  'typescript/unknown-return',
  TS_ONLY,
  /\)\s*:\s*(?:Promise(?:Like)?<\s*unknown\s*>|unknown)\s*(?:\{|=>|;|$)/,
  'this function hands `unknown` to every caller, so each one has to parse or assert the result. ' +
    'Parse it once here and return the domain type.'
);

// `typescript/unknown-type-alias` — `type X = unknown`, or a union carrying it.
const unknownTypeAlias = patternCheck(
  'typescript/unknown-type-alias',
  TS_ONLY,
  /^\s*(?:export\s+)?(?:declare\s+)?type\s+\w+(?:<[^=]*>)?\s*=\s*(?:[^;]*\|\s*)?unknown\s*(?:\|[^;]*)?;?\s*$/,
  'this alias names `unknown`, so it reads as a contract it is not. Use the parsed type, or keep ' +
    '`unknown` visible at the boundary that parses it.'
);

// `typescript/open-dictionary-value` is deliberately NOT here. A type predicate
// (`value is Record<string, unknown>`) is the boundary parser itself, and SARIF
// `properties` or GraphQL `variables` are open by specification — whether a
// dictionary sits at a boundary is judgement, so the model keeps the rule.

// `typescript/object-parameter` — a parameter annotated `object`.
const objectParameter = patternCheck(
  'typescript/object-parameter',
  TS_ONLY,
  /[(,]\s*\w+\??\s*:\s*object\s*[,)=]/,
  '`object` accepts arrays, functions and class instances and allows no property access without an ' +
    'assertion. Accept a named type, or a generic `<T extends object>`.'
);

// `typescript/reflect-dynamic-access` — `Reflect.apply` / `Reflect.get`.
const reflectDynamicAccess = patternCheck(
  'typescript/reflect-dynamic-access',
  TS_ONLY,
  /\bReflect\s*(?:\.\s*(?:apply|get)|\[\s*['"](?:apply|get)['"]\s*\])\s*\(/,
  '`Reflect.apply`/`Reflect.get` take untyped arguments and return `any`, so the call escapes type ' +
    'checking. Use a typed call or property access.'
);

// `typescript/module-mocking` — `vi.mock`, `jest.mock` and their variants. The
// direct global only: an aliased import (`import { vi as t }`) needs scope
// analysis, and the model still sees the rule.
const moduleMocking = patternCheck(
  'typescript/module-mocking',
  TS_ONLY,
  /\b(?:vi|jest)\s*\.\s*(?:mock|doMock|unstable_mockModule)\s*\(/,
  'module mocking replaces the import graph, so this test keeps passing when the real module changes ' +
    'or its wiring breaks. Inject the dependency and pass a faithful test implementation.'
);

// --- The anti-slop rules for the other stacks -------------------------------
//
// Each pattern comes from the community linter that owns the rule (ruff,
// Error Prone, detekt, SwiftLint, the .NET analyzers, golangci-lint, tflint)
// and was tested against lines it must flag and near-misses it must not. As
// above: the direct single-line spelling only; the model sees the whole rule.

const PY = /\.pyi?$/;
const PY_SOURCE = /\.py$/;
const JAVA = /\.java$/;
const KOTLIN = /\.kts?$/;
const SWIFT = /\.swift$/;
const CSHARP = /\.cs$/;
const GO = /\.go$/;
const HCL = /\.(tf|hcl)$/;

// Source files outside test code, where a stub, a fixture or a deliberately
// generic exception is the point rather than the defect.
const nonTest = (ext: string): RegExp =>
  new RegExp(
    String.raw`^(?!.*(?:^|/)(?:tests?|androidTest|testFixtures|[^/]*\.tests?)/)(?!.*(?:Tests?|_test)\.\w+$).*\.(?:${ext})$`,
    'i'
  );

const python: Record<string, DeterministicCheck> = {
  'python/blanket-suppression': patternCheck(
    'python/blanket-suppression',
    PY,
    /#\s*(?:type|pyright):\s*ignore(?!\s*\[)|#\s*noqa(?!\s*:\s*[A-Z]+\d)/i,
    'a suppression with no error code silences every error on the line, including ones added later. ' +
      'Name the code: `# type: ignore[import-untyped]`, `# noqa: F401`.'
  ),
  'python/broad-exception-assertion': patternCheck(
    'python/broad-exception-assertion',
    PY_SOURCE,
    /\b(?:pytest\s*\.\s*raises|assertRaises)\s*\(\s*(?:builtins\.)?(?:Base)?Exception\s*[,)]/,
    'this passes on any error, a typo included, so it proves nothing. Assert the specific exception ' +
      'type, or add a `match=`.',
    { exempt: /\bmatch\s*=\s*[rbuf]*(?:"[^"]+"|'[^']+')/ }
  ),
  'python/module-patching': patternCheck(
    'python/module-patching',
    PY_SOURCE,
    /(?:(?:^|[^\w.])(?:mock\s*\.\s*)?patch|\bmocker\s*\.\s*patch|\bmonkeypatch\s*\.\s*setattr)\s*\(\s*[rf]?["']\w+(?:\.\w+)+["']/,
    'patching by import path keeps this test green when the real wiring breaks. Inject the ' +
      'dependency and pass a faithful test implementation.'
  ),
  'python/quadratic-accumulation': patternCheck(
    'python/quadratic-accumulation',
    PY,
    /\bsum\s*\((?:[^()]|\([^()]*\))*,\s*(?:start\s*=\s*)?(?:\[\s*\]|\(\s*\)|list\(\s*\))\s*\)/,
    '`sum(..., [])` copies the accumulated list at every step, so it is quadratic. Use ' +
      '`itertools.chain.from_iterable` or a comprehension.'
  ),
};

const java: Record<string, DeterministicCheck> = {
  // The string-literal form only: the boxed-number form needs types.
  'java/reference-equality': patternCheck(
    'java/reference-equality',
    JAVA,
    /^(?:[^"'\\]|\\.|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")*?(?:[\w)\]]\s*[!=]=\s*"|"(?:[^"\\]|\\.)*"\s*[!=]=\s*[\w(])/,
    '`==` on a String compares identity, so it passes on interned literals and fails on a value read ' +
      'at runtime. Use `equals` / `Objects.equals`.',
    { exempt: /"""/, severity: 'BLOCKER' }
  ),
  'java/bigdecimal-value-semantics': patternCheck(
    'java/bigdecimal-value-semantics',
    JAVA,
    /\bnew\s+BigDecimal\s*\(\s*[-+]?(?:\d+\.\d*|\.\d+|\d+(?:\.\d*)?[eE][-+]?\d+|\d+[dDfF])[dDfF]?\s*[,)]/,
    '`new BigDecimal(double)` captures binary rounding error into the amount. Use ' +
      '`new BigDecimal("0.1")` or `BigDecimal.valueOf(d)`.',
    { severity: 'BLOCKER' }
  ),
  'java/dropped-exception-cause': patternCheck(
    'java/dropped-exception-cause',
    JAVA,
    /\bthrow\s+new\s+[\w.]+\(\s*(?:"[^"]*"\s*\+\s*)?\w+\.get(?:Localized)?Message\(\)\s*\)/,
    'only the message survives, so the original type and stack trace are lost. Pass the caught ' +
      'exception as the cause: `throw new X("context", e)`.'
  ),
  'java/print-stack-trace': patternCheck(
    'java/print-stack-trace',
    JAVA,
    /\.printStackTrace\s*\(\s*\)/,
    '`printStackTrace()` writes to stderr, outside logging and alerting. Log it with context, then ' +
      'rethrow or fail the operation.'
  ),
  // String methods only: BigDecimal and java.time names collide with mutators
  // such as `list.add`, so those stay with the model.
  'java/ignored-pure-result': patternCheck(
    'java/ignored-pure-result',
    JAVA,
    /^\s*[A-Za-z_]\w*(?:\.\w+(?:\(\))?)*\.(?:trim|strip|toUpperCase|toLowerCase|concat)\([^;]*\)\s*;\s*$/,
    'Strings are immutable, so this call does nothing and the unchanged value is used. Assign or ' +
      'return the result.'
  ),
};

const kotlin: Record<string, DeterministicCheck> = {
  'kotlin/todo-stub': patternCheck(
    'kotlin/todo-stub',
    nonTest('kts?'),
    /(?<![\w.])TODO\s*\(/,
    '`TODO()` throws `NotImplementedError`, which `catch (e: Exception)` does not stop, so the first ' +
      'call crashes. Implement it, or throw `UnsupportedOperationException("why")`.',
    { severity: 'BLOCKER' }
  ),
  'kotlin/dropped-exception-cause': patternCheck(
    'kotlin/dropped-exception-cause',
    KOTLIN,
    /\bthrow\s+[\w.]+\(\s*(?:"[^"]*"\s*\+\s*)?\w+\.(?:message|localizedMessage)\s*(?:\?:\s*"[^"]*"\s*)?\)/,
    'only the message survives, so the original type and stack trace are lost. Pass the cause: ' +
      '`throw X("context", e)`.'
  ),
  'kotlin/downcast-readonly-collection': patternCheck(
    'kotlin/downcast-readonly-collection',
    KOTLIN,
    /\bas\??\s+Mutable(?:List|Set|Map|Collection|Iterable)\b/,
    'casting a read-only collection to `Mutable*` throws on `listOf`/`emptyList`, or mutates state ' +
      'the caller thinks is immutable. Copy with `toMutableList()`.'
  ),
  'kotlin/print-stack-trace': patternCheck(
    'kotlin/print-stack-trace',
    KOTLIN,
    /\.printStackTrace\s*\(\s*\)/,
    '`printStackTrace()` bypasses the logger and crash reporting. Log it with context, then rethrow ' +
      'or surface the failure.'
  ),
};

const swift: Record<string, DeterministicCheck> = {
  // The justification often sits in a doc comment above, which a single line
  // cannot see — so this is HIGH, and a ticket on the line is accepted.
  'swift/concurrency-checking-opt-out': patternCheck(
    'swift/concurrency-checking-opt-out',
    SWIFT,
    /@unchecked\s+Sendable\b|\bnonisolated\(unsafe\)|^\s*@preconcurrency\s+import\b/,
    'this switches off data-race checking. Name the lock, queue or invariant that makes it safe, ' +
      'inline, with a ticket.',
    { exempt: /\/\/.*\b(?:[A-Z][A-Z0-9]+-\d+|#\d+)\b/ }
  ),
  'swift/unowned-capture': patternCheck(
    'swift/unowned-capture',
    SWIFT,
    /\{\s*\[[^\]"]*\bunowned\b[^\]"]*\]/,
    '`unowned` crashes if the closure outlives its owner. Capture `[weak self]` and ' +
      '`guard let self else { return }`.',
    { exempt: /\blazy\s+var\b/ }
  ),
  'swift/implicitly-unwrapped-declaration': patternCheck(
    'swift/implicitly-unwrapped-declaration',
    nonTest('swift'),
    /\b(?:var|let)\s+[A-Za-z_]\w*\s*:\s*[A-Za-z_][\w.]*(?:<[^<>]*>)?!(?!=)/,
    'an implicitly unwrapped optional force-unwraps on every read, far from where it was left nil. ' +
      'Inject a non-optional through `init`, or handle a real optional.',
    { exempt: /@IBOutlet/ }
  ),
  'swift/copying-reduce-accumulator': patternCheck(
    'swift/copying-reduce-accumulator',
    SWIFT,
    /\breduce\(\s*(?:""|\[\]|\[:\]|\[[\w.]+(?:\s*:\s*[\w.]+)?\]\(\)|(?:Array|Set|Dictionary|String)(?:<[^<>]*>)?(?:\.init)?\(\))\s*[,)]/,
    '`reduce` with a collection or string accumulator copies it for every element, so it is ' +
      'quadratic. Use `reduce(into:)`, `flatMap` or `joined()`.'
  ),
};

const csharp: Record<string, DeterministicCheck> = {
  'csharp/rethrow-loses-stack': patternCheck(
    'csharp/rethrow-loses-stack',
    CSHARP,
    /(?:^\s*|[;{]\s*)throw\s+(?:ex|e|exc|exception)\s*;/,
    '`throw ex;` restarts the stack trace here, so the frames back to the fault are lost. Use `throw;`.'
  ),
  'csharp/reserved-exception-type': patternCheck(
    'csharp/reserved-exception-type',
    nonTest('cs'),
    /\bthrow\s+new\s+(?:global::)?(?:System\.)?(?:Exception|ApplicationException|SystemException|NullReferenceException|IndexOutOfRangeException|AccessViolationException|OutOfMemoryException|StackOverflowException|ExecutionEngineException)\s*\(/,
    'a caller can only handle this with `catch (Exception)`, which also swallows real bugs. Throw a ' +
      'specific framework or domain exception.'
  ),
  // Single-argument Parse closed on the line; formatting and nested calls stay
  // with the model.
  'csharp/culture-implicit-parse-format': patternCheck(
    'csharp/culture-implicit-parse-format',
    CSHARP,
    /\b(?:double|float|decimal|Double|Single|Decimal|DateTime|DateTimeOffset)\.Parse\(\s*[^,()]+\)/,
    "this parses with the server's culture: on a de-DE host \"1.50\" is 150. Pass " +
      '`CultureInfo.InvariantCulture` for machine-readable values.'
  ),
  'csharp/ef-inmemory-test-double': patternCheck(
    'csharp/ef-inmemory-test-double',
    CSHARP,
    /\.UseInMemoryDatabase\s*[<(]/,
    'the in-memory provider has no transactions, constraints or SQL translation, so tests pass on ' +
      'queries that fail in production. Test against the real provider.'
  ),
};

const go: Record<string, DeterministicCheck> = {
  // Only when the wrapped value is named `err`, and a comment saying the error
  // is deliberately opaque exempts the line.
  'go/error-wrap-verb': patternCheck(
    'go/error-wrap-verb',
    GO,
    /\bfmt\.Errorf\(\s*"(?:(?!%w)[^"\\]|\\.)*%[+#]?[vs](?:(?!%w)[^"\\]|\\.)*"\s*,(?:[^;]*,)?\s*err\s*\)/,
    '`%v` flattens the error to text, so `errors.Is`/`errors.As` upstream stop matching. Wrap with `%w`.',
    { exempt: /\/\/.*\b(?:nolint:errorlint|opaque)\b/ }
  ),
  // The package-level function always builds a server with no timeouts.
  'go/missing-client-server-timeout': patternCheck(
    'go/missing-client-server-timeout',
    nonTest('go'),
    /\bhttp\.ListenAndServe(?:TLS)?\(/,
    '`http.ListenAndServe` runs a server with no read or write timeouts, so slow clients hold ' +
      'connections forever. Build an `http.Server` with `ReadHeaderTimeout` and friends.'
  ),
};

const terraform: Record<string, DeterministicCheck> = {
  'terraform/empty-list-equality': patternCheck(
    'terraform/empty-list-equality',
    HCL,
    /(?:[!=]=\s*\[\s*\](?![\w.[])|\[\s*\]\s*[!=]=)/,
    '`== []` is always false in Terraform (`[]` is an empty tuple), so this condition never changes. ' +
      'Use `length(x) == 0`.'
  ),
  'terraform/ignore-changes-all': patternCheck(
    'terraform/ignore-changes-all',
    HCL,
    /^\s*ignore_changes\s*=\s*all\b/,
    'Terraform will never apply another change to this resource. List only the attributes something ' +
      'outside Terraform owns, with a comment naming it.'
  ),
};

const JSX = /\.(jsx|tsx)$/;
const JS_TS = /\.(jsx?|tsx?|mjs|cjs|mts|cts)$/;

const react: Record<string, DeterministicCheck> = {
  // The handler-prop form only; an unconditional call in the body needs scope.
  'react/set-state-in-render': patternCheck(
    'react/set-state-in-render',
    JSX,
    /\bon[A-Z]\w*\s*=\s*\{\s*set[A-Z]\w*\s*\(/,
    'the setter runs during render instead of on the event, so this loops until React throws "Too many ' +
      're-renders". Pass a function: `onClick={() => setOpen(true)}`.',
    { severity: 'BLOCKER' }
  ),
  // The literal form only; a user-supplied URL needs the model.
  'react/javascript-url': patternCheck(
    'react/javascript-url',
    JSX,
    /\b(?:href|src|action|formAction|to)\s*=\s*\{?\s*["'`]\s*javascript:/i,
    'React 19 blocks `javascript:` URLs and this throws on click; earlier versions execute it. Use a ' +
      '`<button type="button" onClick>` for actions.',
    { severity: 'BLOCKER' }
  ),
  'react/async-effect-callback': patternCheck(
    'react/async-effect-callback',
    JS_TS,
    /\b(?:React\.)?use(?:Layout|Insertion)?Effect\s*\(\s*async\b/,
    'an async effect returns a Promise where React expects a cleanup, so a slow response can land ' +
      'after newer ones. Declare the async function inside and return a cleanup.'
  ),
  // The random-`key` form only.
  'react/impure-render': patternCheck(
    'react/impure-render',
    JSX,
    /\bkey\s*=\s*\{\s*(?:Math\.random\s*\(|Date\.now\s*\(|crypto\.randomUUID\s*\(|(?:uuid\.)?(?:uuid|uuidv4|nanoid|v4)\s*\(|performance\.now\s*\(|new Date\s*\()/,
    'a key that changes every render remounts the element each time, dropping focus and local ' +
      'state. Key on a stable id from the data.'
  ),
};

const reactNative: Record<string, DeterministicCheck> = {
  'react-native/deep-import': patternCheck(
    'react-native/deep-import',
    JS_TS,
    /(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)['"]react-native\/(?!(?:asset-registry|react-private-interface|setup-env|unstable-internals-do-not-use|package\.json)['"]|jest\/)/,
    "a private React Native path with no stability contract; an upgrade moves it and the bundle " +
      "stops resolving. Import the public symbol from 'react-native'.",
    { exempt: /\bjest\s*\.\s*(?:mock|requireActual)\s*\(/ }
  ),
  // Column-0 declarations only, which are module scope by construction.
  'react-native/cached-window-dimensions': patternCheck(
    'react-native/cached-window-dimensions',
    JS_TS,
    /^(?:export\s+)?(?:const|let|var)\b.*\bDimensions\s*\.\s*get\s*\(/,
    'read once at import, so the layout keeps the old size after rotation or unfolding. Use ' +
      '`useWindowDimensions()` in the component.'
  ),
};

const vue: Record<string, DeterministicCheck> = {
  // `.vue` only: Angular also has a `computed()`.
  'vue/async-computed': patternCheck(
    'vue/async-computed',
    /\.vue$/,
    /(?<![\w$.])computed\(\s*async\b/,
    'an async computed holds the Promise, which is always truthy and never re-resolves. Use ' +
      '`computedAsync`, or a ref filled by a watcher.'
  ),
  'vue/shared-mutable-default': patternCheck(
    'vue/shared-mutable-default',
    /\.vue$/,
    /^\s*default\s*:\s*(\[[^\]]*\]|\{[^{}]*\})\s*,?\s*$/,
    'one literal default is shared by every instance of the component. Use a factory: ' +
      '`default: () => []`.'
  ),
};

const angular: Record<string, DeterministicCheck> = {
  'angular/async-lifecycle-hook': patternCheck(
    'angular/async-lifecycle-hook',
    /\.ts$/,
    /\basync\s+ng(?:OnInit|OnChanges|DoCheck|AfterContentInit|AfterContentChecked|AfterViewInit|AfterViewChecked|OnDestroy)\s*\(/,
    'Angular never awaits a lifecycle hook, so the template renders the unloaded state and a ' +
      'rejection floats. Use the async pipe, a resolver or `resource()`.'
  ),
  'angular/output-native-event-name': patternCheck(
    'angular/output-native-event-name',
    /\.ts$/,
    /@Output\(\s*['"](?:click|dblclick|change|input|submit|keydown|keyup|keypress|mousedown|mouseup|pointerdown|pointerup|select|reset|paste|copy|cut|contextmenu|drop|wheel)['"]\s*\)|@Output\(\s*\)\s*(?:(?:public|readonly)\s+)*(?:click|dblclick|change|input|submit|keydown|keyup|keypress|mousedown|mouseup|pointerdown|pointerup|select|reset|paste|copy|cut|contextmenu|drop|wheel)\b(?!\$)|(?<![\w$.])(?:click|dblclick|change|input|submit|keydown|keyup|keypress|mousedown|mouseup|pointerdown|pointerup|select|reset|paste|copy|cut|contextmenu|drop|wheel)\s*=\s*output(?:<[^>]*>)?\(/,
    'an output named after a bubbling DOM event fires the parent handler twice, once with a native ' +
      '`Event`. Name it for the domain event: `valueChange`.'
  ),
  'angular/banana-out-of-box': patternCheck(
    'angular/banana-out-of-box',
    /\.(html|ts)$/,
    /\(\[[\w.$-]+\]\)\s*=(?![>=])/,
    '`([x])` is parsed as an event binding, so the field never syncs. Two-way binding is `[(x)]`.'
  ),
  'angular/manual-lifecycle-call': patternCheck(
    'angular/manual-lifecycle-call',
    /^(?!.*\.(spec|test)\.ts$).*\.ts$/,
    /\bthis\.ng(?:OnInit|OnChanges|DoCheck|AfterContentInit|AfterContentChecked|AfterViewInit|AfterViewChecked|OnDestroy)\s*\(/,
    'calling a hook by hand re-runs every subscription it sets up. Extract the shared work into a ' +
      'method.'
  ),
  'angular/impure-pipe': patternCheck(
    'angular/impure-pipe',
    /\.pipe\.ts$/,
    /\bpure\s*:\s*false\b/,
    'an impure pipe re-runs on every change-detection cycle for every binding. Use a pure pipe ' +
      'over immutable inputs, or a `computed` signal.'
  ),
};

const svelte: Record<string, DeterministicCheck> = {
  'svelte/async-store-start': patternCheck(
    'svelte/async-store-start',
    /\.svelte(\.[jt]s)?$|(^|\/)stores?(\.[jt]s$|\/.*\.[jt]s$)/,
    /(?<![\w$.])(?:readable|writable|derived)\((?:[^()]|\([^()]*\))*,\s*async\b/,
    'Svelte calls the start function\'s return value to stop the store; a Promise is not callable, ' +
      'so the last unsubscribe throws. Do the async work inside and `set` on resolve.',
    { severity: 'BLOCKER' }
  ),
  'svelte/load-in-page-component': patternCheck(
    'svelte/load-in-page-component',
    /\+(page|layout)\.svelte$/,
    /\bexport\s+(?:async\s+)?(?:function\s+(?:load|preload)\b|(?:const|let)\s+(?:load|preload)\b)/,
    'SvelteKit never calls `load` from a `.svelte` file, so `data` is undefined. Move it to ' +
      '`+page.js` or `+page.server.js`.'
  ),
  'svelte/double-brace-mustache': patternCheck(
    'svelte/double-brace-mustache',
    /\.svelte$/,
    /(?<![=\w$])\{\{\s*[\w$.]+(?:\(\))?\s*\}\}/,
    'Svelte reads `{{ x }}` as an object literal and renders `[object Object]`. Use `{x}`.',
    { exempt: /(['"`])[^'"`]*\{\{[^'"`]*\1/ }
  ),
};

const dom: Record<string, DeterministicCheck> = {
  'dom/remove-listener-fresh-function': patternCheck(
    'dom/remove-listener-fresh-function',
    /\.(m|c)?[jt]sx?$|\.(vue|svelte)$/,
    /\.removeEventListener\(\s*[^,]+,\s*(?:(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>|(?:async\s+)?function\b|[\w$.]+\.bind\()/,
    'this is a new function, never the one that was added, so nothing is removed. Keep the ' +
      'reference, or pass `{ signal }` from an `AbortController`.'
  ),
  'dom/on-property-clobbers-handler': patternCheck(
    'dom/on-property-clobbers-handler',
    /\.(m|c)?[jt]sx?$|\.html$/,
    /(?<![\w$.])(?:window|document|document\.body)\.on[a-z]+\s*=(?!=)/,
    'assigning an `on*` property replaces any handler another script set. Use `addEventListener`.'
  ),
};

// `core/hardcoded-secrets` — deliberately NOT here. A regex over added lines is
// how a secret scanner earns a reputation for false positives, and the gate
// already runs a real one against verified secrets only. The model keeps the rule
// for the cases a scanner misses, like a credential in a comment.

export const CHECKS: Record<string, DeterministicCheck> = {
  'core/untracked-todo': untrackedTodo,
  'core/type-checker-suppression': typeCheckerSuppression,
  'core/unsafe-assertion': unsafeAssertion,
  'javascript/var-in-new-code': varInNewCode,
  'javascript/unsafe-numeric-coercion': parseIntWithoutRadix,
  'typescript/module-mocking': moduleMocking,
  'typescript/unknown-return': unknownReturn,
  'typescript/unknown-type-alias': unknownTypeAlias,
  'typescript/object-parameter': objectParameter,
  'typescript/reflect-dynamic-access': reflectDynamicAccess,
  ...python,
  ...java,
  ...kotlin,
  ...swift,
  ...csharp,
  ...go,
  ...terraform,
  ...react,
  ...reactNative,
  ...vue,
  ...angular,
  ...svelte,
  ...dom,
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
