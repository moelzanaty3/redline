# Project context

<!--
TEMPLATE. Copy the content of this file to the TOP of the target repo's AGENTS.md,
above the `<!-- REDLINE:BEGIN -->` marker, and fill the bracketed sections.

Everything above the marker is owned by your team and is never overwritten by
Redline sync. Everything inside the marker block is generated — do not edit it.

Why this file matters: review quality is bounded by context. A reviewer that does
not know FlashList is the standard cannot flag FlatList.
-->

## What this repo is

[One paragraph: product name, what it does, who uses it, which market. e.g. "Customer
self-care app for <market>, React Native (Expo) plus shared web components."]

## Architecture

- **App shell:** [Expo SDK NN / Next.js NN / Spring Boot N.N / NestJS NN]
- **State:** server state via [TanStack Query]; client UI state via [Zustand]. No Redux.
- **Navigation:** [expo-router / react-navigation native-stack]
- **Styling:** [StyleSheet.create / Nativewind / styled-components]
- **API layer:** [BFF at `src/api/`; types generated from OpenAPI into `src/api/types/`]
- **Persistence:** [Postgres via Prisma / JPA + Flyway]
- **Messaging:** [Kafka topics owned: ...]
- **Lists:** [FlashList is the standard; FlatList only for legacy screens.]
- **Images:** [expo-image everywhere.]

## Directory map

```
src/
  api/          # BFF client + generated types — do not hand-edit generated files
  components/   # shared UI, design-system components
  screens/      # one folder per screen
  hooks/        # shared hooks
  utils/        # pure functions only, no framework imports
```

## Team conventions

- [TypeScript strict mode; `noUncheckedIndexedAccess` on.]
- Error handling only at boundaries (API calls, storage, native modules, user input).
- Comments only for non-obvious WHY, never WHAT.
- Minimal diffs; no drive-by refactors in feature PRs.
- Architecture decisions recorded as ADRs in `docs/adr/NNNN-title.md`.

## Deliberate deviations from Redline

<!--
List rules this repo knowingly does not follow, with the reason. Reviewers should not
re-raise these. If the list grows past a few entries, the standard is wrong — raise it
in the Redline source repo instead of accumulating exceptions here.
-->

- [e.g. "`any` permitted in `src/legacy/**` until MIG-4412 completes."]

## Review context

- PRs may be authored by AI coding agents or contractors — review with the same rigour.
- Merge requires one human approval plus green required checks. Automated review is
  advisory input to the human reviewer; it never approves.
