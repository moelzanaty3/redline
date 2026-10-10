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
- `react/set-state-in-render` — **A state setter called during render** — unconditionally in the component body,
  or called instead of passed in a handler prop (`onClick={setOpen(true)}`). It schedules a render from inside
  render and loops until React throws "Too many re-renders". Derive the value during render, or pass a function
  (`onClick={() => setOpen(true)}`). Not the documented guarded pattern (`if (items !== prevItems) {
  setPrevItems(items); … }`).
- `react/javascript-url` — **A `javascript:` URL, or an unvalidated user-supplied URL, in
  `href`/`src`/`action`/`formAction`.** Before React 19 a stored `javascript:` profile link runs in the viewer's
  session; React 19 blocks it and a literal `javascript:void(0)` throws on click. Use `<button type="button"
  onClick>` for actions and allow-list `http:`/`https:`/relative URLs for user links.

## HIGH

- `react/incomplete-dependency-array` — Incomplete dependency arrays (stale closures).
- `react/sequential-awaits` — Sequential `await`s for independent operations — require `Promise.all`.
- `react/barrel-file-imports` — Barrel-file imports (`import { X } from '@/components'`) — require direct imports; barrels bloat bundles and cause circular deps.
- `react/heavy-component-static-import` — Heavy components (charts, editors, modals) imported statically — require `next/dynamic` / `React.lazy`.
- `react/uncontrolled-to-controlled` — `useState(undefined)` for controlled inputs — uncontrolled→controlled warning; use `''`.
- `react/missing-error-boundary` — Missing Error Boundary around subtrees that fetch or can throw.
- `react/falsy-and-rendering` — `&&` conditional rendering with a possibly-falsy non-boolean left side (`count && <X/>` renders `0`) — require ternary or explicit boolean.
- `react/async-effect-callback` — **An `async` function passed straight to `useEffect`/`useLayoutEffect`.** The
  effect returns a Promise where React expects a cleanup, so nothing can cancel it: the slower "hell" response
  lands after "hello" and overwrites its results. Declare the async function inside, call it, and return a
  cleanup that sets an `ignore` flag or aborts.
- `react/impure-render` — **A non-deterministic value or global write during render** — `Math.random()`,
  `Date.now()`/`new Date()`, `crypto.randomUUID()` read in the body, or a module/`window` variable assigned.
  Output differs between renders and between server and client; a random `key` remounts the subtree every
  render, dropping focus and state. Use `useId` or a lazy `useState(() => …)`, and move clock reads and writes
  into effects or handlers.
- `react/ref-access-in-render` — **`ref.current` read or written during render.** A ref change does not
  re-render, so a value shown from it is stale, and a write from a render React discards still sticks. Use refs
  in effects and handlers and state for anything on screen. Not the lazy-init guard `if (ref.current === null)
  ref.current = …`.
- `react/try-catch-around-jsx` — **`try`/`catch` around returned JSX as error handling for children.** Children
  render after the parent returns, so the catch never sees their errors and the fallback never shows — the page
  goes blank. Wrap the subtree in an Error Boundary. Not when the `try` wraps a computation this component
  really runs.
- `react/unstable-context-value` — **An object, array or function literal as a context provider `value`.** It
  gets a new identity every render, so every consumer re-renders — at the app root, on every keystroke anywhere
  in root state. Memoise it (`useMemo`/`useCallback`) or hoist it. Not where React Compiler is enabled for the
  file.
- `react/object-default-prop` — **An array, object or function literal as a destructured prop default** (`{
  items = [] }`). Each render gets a new identity, so a dependent hook re-runs every render — and loops forever
  if it sets state. Hoist a module constant (`const EMPTY: Item[] = []`).

## SUGGESTION

- `react/trivial-memoisation` — `useMemo`/`useCallback` wrapping trivial primitives — remove.
- `react/missing-lazy-initialiser` — Expensive `useState` initializer without lazy init — pass a function.
- `react/starttransition-for-non-urgent` — `startTransition` for non-urgent updates driving expensive renders.
- `react/oversized-component` — Component over ~300 lines — suggest split.
- `react/prop-drilling` — Prop drilling beyond 2–3 levels — suggest composition or context.
- `react/prefer-ref-over-state` — Interaction state read only inside callbacks — use a ref, not state, to avoid re-renders.
