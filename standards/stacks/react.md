# React Review Rules

**Scope:** web React. Where a file is also matched by the React Native rules, the
React Native rules extend these — they do not replace them. Do not flag web-only
concerns (DOM, `next/dynamic`, bundle splitting) on React Native files.

## BLOCKER — request changes

- `react/effect-derived-state` — **`useEffect` for derived state.** State computable from existing props/state must be computed during render, never synced via effect.

  ```tsx
  // WRONG
  useEffect(() => { setFullName(first + ' ' + last); }, [first, last]);
  // RIGHT
  const fullName = first + ' ' + last;
  ```

- `react/effect-for-event-logic` — **`useEffect` for event logic.** Notifications, analytics, navigation triggered by a user action belong in the event handler, not an effect watching state.
- `react/missing-effect-cleanup` — **Missing `useEffect` cleanup** for subscriptions, timers, listeners, and in-flight requests (AbortController).
- `react/direct-state-mutation` — **Direct state mutation** (`arr.push`, `obj.x =`, `.splice`) followed by `setState` — silent update failure.
- `react/conditional-hook-calls` — **Conditional hook calls** — hooks inside `if`, loops, or early returns.
- `react/key-is-index` — **`key={index}`** on lists that reorder, insert, or delete.
- `react/server-data-in-local-state` — **Server data copied into local state.** With TanStack Query / SWR, the query result IS the source of truth — never `useEffect(() => setLocal(data))`.
- `react/nested-component-definition` — **Component defined inside another component** — remounts every render, loses state.
- `react/useformstatus-placement` — **`useFormStatus` in the same component that renders the `<form>`** — always returns `pending: false`; must be in a child.
- `react/promise-in-render` — **Promise created during render passed to `use()`** — infinite loop; promise must come from props, state, or cache.
- `react/exhaustive-deps-disabled` — **`eslint-disable react-hooks/exhaustive-deps`** — hides stale-closure bugs; require refactor instead.

## HIGH

- `react/incomplete-dependency-array` — Incomplete dependency arrays (stale closures).
- `react/sequential-awaits` — Sequential `await`s for independent operations — require `Promise.all`.
- `react/barrel-file-imports` — Barrel-file imports (`import { X } from '@/components'`) — require direct imports; barrels bloat bundles and cause circular deps.
- `react/heavy-component-static-import` — Heavy components (charts, editors, modals) imported statically — require `next/dynamic` / `React.lazy`.
- `react/uncontrolled-to-controlled` — `useState(undefined)` for controlled inputs — uncontrolled→controlled warning; use `''`.
- `react/missing-error-boundary` — Missing Error Boundary around subtrees that fetch or can throw.
- `react/falsy-and-rendering` — `&&` conditional rendering with a possibly-falsy non-boolean left side (`count && <X/>` renders `0`) — require ternary or explicit boolean.

## SUGGESTION

- `react/trivial-memoisation` — `useMemo`/`useCallback` wrapping trivial primitives — remove.
- `react/missing-lazy-initialiser` — Expensive `useState` initializer without lazy init — pass a function.
- `react/starttransition-for-non-urgent` — `startTransition` for non-urgent updates driving expensive renders.
- `react/oversized-component` — Component over ~300 lines — suggest split.
- `react/prop-drilling` — Prop drilling beyond 2–3 levels — suggest composition or context.
- `react/prefer-ref-over-state` — Interaction state read only inside callbacks — use a ref, not state, to avoid re-renders.
