# Effect Review Rules

**Scope:** TypeScript in a repository built on the `effect` library. These rules extend the
TypeScript rules; they exist because Effect already ships the typed operator for each of
these jobs, and hand-rolling it discards what the type system was tracking. Do not apply
them to a repository that does not depend on `effect`.

## HIGH

- `effect/manual-error-tag-in-catch` — Branching on `error._tag` (or `switch (error._tag)`) inside a broad
  `Effect.catch`/`catchAll`/`catchIf` handler. The error channel is not narrowed, so the handled error stays in the
  effect's type and every caller still has to handle it. Use `Effect.catchTag`/`catchTags` (or
  `catchReason`/`catchReasons` for a tagged `reason`).
- `effect/manual-tagged-construction` — An object literal with a literal `_tag` (`{ _tag: "NotFound", id }`) where a
  tagged constructor exists. It skips the Schema's validation and the class's identity — `instanceof`, `Equal` and
  the error's stack trace — while looking identical to the type checker. Use the Schema `.make`, the tagged
  class or error constructor, or the `Data.taggedEnum` variant constructor. Not a pattern passed to `Match.when`.
- `effect/service-constructor-import` — Runtime code importing a service's `make…` constructor from a relative
  path (`import { makeIssueService } from "./issue-service"`). The service's own requirements stop propagating to
  the composition root, and a test can no longer provide a different implementation. Import the owning `Layer`
  and yield the service from context. Test files are exempt.

## SUGGESTION

- `effect/manual-tag-comparison` — Comparing `value._tag` to a string literal, or switching on it, outside a catch
  handler. `Match.tag`/`Match.tags` with `Match.exhaustive` makes a variant added later a compile error instead of a
  silent fall-through; `Predicate.isTagged` for a single reusable check.
- `effect/prefer-match` — A chained ternary comparing one value against two or more literals
  (`kind === "a" ? x : kind === "b" ? y : z`). Use `Match.value(kind).pipe(Match.when(…), …)`.
