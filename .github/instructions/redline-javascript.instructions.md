---
applyTo: "**/*.js,**/*.jsx,**/*.mjs,**/*.cjs,**/*.vue,**/*.svelte"
---

<!-- Redline v0.0.4 · profile: tooling · stacks: javascript -->

# JavaScript Review Rules

Applies to untyped and loosely-typed JS (`.js`, `.jsx`, `.mjs`, `.cjs`), including build
scripts, config files, serverless handlers, and legacy app code. TypeScript rules in the
core standard apply wherever the file is typed.

## BLOCKER — request changes

- `javascript/prototype-pollution` — **Prototype pollution sinks.** Recursive merge/`Object.assign` over external input
  without rejecting `__proto__`, `constructor`, `prototype` keys.
- `javascript/dynamic-code-execution` — **`eval`, `new Function`, `setTimeout("string")`** on anything derived from external input.
- `javascript/floating-promises` — **Floating promises.** Every promise is `await`ed, returned, or `.catch`-handled. An
  unhandled rejection terminates the process on modern Node.
- `javascript/loose-equality-coercion` — **`==` against `null`/`undefined`/`0`/`''` where coercion changes the branch** — use
  `===`, or `== null` only as a deliberate nullish check with a comment.
- `javascript/shared-module-state-mutation` — **Mutating a shared module-scope object/array** used across requests or components.
- `javascript/unvalidated-boundary-input` — **Missing input validation at the boundary** — `JSON.parse` of external payloads without
  try/catch and a size limit; `req.body` fields consumed without a schema check.
- `javascript/scattered-env-access` — **Secrets read ad hoc from `process.env` scattered across modules** — one validated
  config module, fail fast at startup.
- `javascript/shell-injection` — **`child_process.exec` with an interpolated string** — use `execFile`/`spawn` with argv.

## HIGH

- `javascript/var-in-new-code` — `var` in new code — `const` by default, `let` when reassigned.
- `javascript/for-in-over-arrays` — `for...in` over arrays, or without `hasOwnProperty` filtering over objects.
- `javascript/unchecked-index-access` — Array index access assumed defined (`arr[0].x`) without a length or nullish check.
- `javascript/unsafe-numeric-coercion` — `parseInt` without radix; `Number()`/`+` coercion of user input without `Number.isFinite`.
- `javascript/async-callback-ignored-promise` — `async` callbacks passed to APIs that ignore the returned promise (`array.forEach`,
  most event emitters) — rejections vanish.
- `javascript/hand-rolled-deep-clone` — Deep-equality or deep-clone hand-rolled instead of `structuredClone`/a maintained util.
- `javascript/unsafe-date-arithmetic` — Date arithmetic on `Date` objects across DST boundaries or with implicit local timezone.
- `javascript/try-catch-whole-function` — `try`/`catch` around a whole function body instead of the failing boundary call.
- `javascript/redos` — Regexes built from external input (ReDoS), or catastrophic backtracking patterns
  (nested quantifiers over user-controlled length).

## SUGGESTION

- `javascript/prefer-optional-chaining` — Optional chaining and nullish coalescing over `&&`/`||` ladders.
- `javascript/prefer-named-exports` — Named exports over default exports for tree-shaking and refactor safety.
- `javascript/jsdoc-on-exports` — JSDoc types on exported functions in files that will not be converted to TS soon.
- `javascript/array-at-negative-index` — `Array.prototype.at(-1)` over `arr[arr.length - 1]`.
