# Svelte Review Rules

**Scope:** Svelte 4 and 5 components, stores, runes, and SvelteKit routes. Rules that
name a rune (`$state`, `$derived`, `$effect`) apply to Svelte 5 files; the store and
`$:` rules apply to Svelte 4 files and to Svelte 5 files still using them.

SvelteKit's load functions are the sharpest edge here: a file's name decides whether its
code runs only on the server or also in the browser, and nothing about the code says so.

## BLOCKER — request changes

- `svelte/html-tag-sink` — **`{@html}` with a value that was not sanitised server-side.** Svelte does no escaping inside it. Markdown output, a CMS field and a translation string are all attacker-reachable often enough to count.
- `svelte/private-env-in-shared-code` — **`$env/static/private` or `$env/dynamic/private` imported from a component, a universal `+page.js`, or anything under `$lib` that a component imports.** The build fails when it notices; when it does not notice, the secret ships to the browser.
- `svelte/secret-in-universal-load` — **A secret, a database handle or an internal-only URL used in `+page.js` / `+layout.js`.** Universal load runs on the server *and* again in the browser. Server-only work belongs in `+page.server.js`.

  ```js
  // WRONG — +page.js, also runs in the browser
  export const load = async () => db.query('select * from orders');
  // RIGHT — +page.server.js
  export const load = async () => ({ orders: await db.query('select * from orders') });
  ```

- `svelte/module-context-shared-state` — **Mutable state in `<script context="module">` (Svelte 5: `<script module>`), or at the top level of a `$lib` module.** It is shared by every component instance, and on the server by every request — one user's data in another user's page.
- `svelte/endpoint-missing-auth` — **A form action or `+server.js` handler with no authorisation check.** The route being reachable only from a guarded page is not a check; the endpoint is a public URL.
- `svelte/unvalidated-form-data` — **`await request.formData()` fields consumed without validation.** A form action is an HTTP endpoint: field presence, type and length are all attacker-chosen.

## HIGH

- `svelte/reactive-statement-side-effect` — A `$:` block performing a fetch, a mutation or navigation. Its dependencies are inferred from what it reads, so an unrelated assignment re-runs it — and a value it writes can re-trigger it.
- `svelte/store-not-unsubscribed` — `store.subscribe()` called manually without keeping and calling the returned unsubscriber. The `$store` auto-subscription form handles this; hand-rolled subscriptions in `onMount` usually do not.
- `svelte/effect-for-derived-state` — `$effect` writing a `$state` that is computable from other state. `$derived` cannot go stale, cannot loop, and needs no cleanup.
- `svelte/effect-missing-cleanup` — `$effect` (or `onMount`) starting a timer, listener, observer or request with no teardown returned — it survives the component.
- `svelte/each-missing-key` — `{#each}` over a list that reorders or filters, with no `(item.id)` key — Svelte reuses nodes positionally and component state follows position.
- `svelte/load-waterfall` — Sequential `await`s in `load` for independent data. They serialise the whole page's time-to-first-byte; use `Promise.all`, or return the promises and stream them.
- `svelte/global-fetch-in-load` — `load` using global `fetch` instead of the `fetch` from its event argument. The event's version forwards cookies, resolves relative URLs on the server and lets the SSR response be reused on hydration — the global one silently does none of that.
- `svelte/error-swallowed-in-load` — `load` catching a failure and returning empty data instead of `error(status, …)`. The page renders as if there were no orders, rather than as an error.
- `svelte/state-mutation-across-boundary` — Mutating a `$state` object passed into a child, or a prop object, from that child. Ownership is the parent's; with `$props()` the write is not propagated back.
- `svelte/unvalidated-url-param` — `params` / `url.searchParams` consumed as a typed value with no validation.

## SUGGESTION

- `svelte/prefer-runes` — Runes (`$state`, `$derived`, `$props`) over `export let` and `$:` in new Svelte 5 components — the dependency graph stops being positional.
- `svelte/prefer-snippets-over-slots` — Snippets over slots in new Svelte 5 code; they are typed and can take parameters.
- `svelte/prefer-derived-by` — `$derived.by` for multi-statement derivations instead of an effect plus a `$state`.
- `svelte/oversized-component` — Component beyond ~300 lines — suggest extracting a child or a `.svelte.js` module.
