# Vue Review Rules

**Scope:** Vue 3 single-file components, composables, and Nuxt applications. Options-API
files are reviewed against the same rules — the reactivity model is shared even where the
syntax is not.

Losing reactivity is the failure mode this file exists for: nothing throws, nothing logs,
the screen simply stops matching the data.

## BLOCKER — request changes

- `vue/v-html-sink` — **`v-html` bound to anything not sanitised on the server.** Vue does not sanitise it. A comment, a CMS field or a translation string rendered this way is script execution.
- `vue/dynamic-component-from-input` — **`<component :is>` resolved from a user-supplied string.** It selects which component runs; an attacker choosing that is an injection sink.
- `vue/ssr-module-scope-state` — **Mutable state declared at module scope in an SSR app.** On the server the module is shared by every request, so one user's data renders in another user's response. State belongs in `setup()`, a store factory, or `useState()` in Nuxt.

  ```ts
  // WRONG — one `cart` for the whole server process
  const cart = reactive({ items: [] });
  export const useCart = () => cart;
  // RIGHT
  export const useCart = () => useState('cart', () => ({ items: [] }));
  ```

- `vue/public-env-secret` — **A secret read through `import.meta.env.VITE_*` or Nuxt `runtimeConfig.public`.** Both are inlined into the client bundle by design. Server-only values go in `runtimeConfig` without `public`.
- `vue/reactivity-lost-on-destructure` — **A `reactive()` object or `props` destructured into plain variables.** The binding is a one-time copy: the value freezes at its first read and the view silently stops updating. Use `toRefs()`, or keep the object.

  ```ts
  // WRONG
  const { count } = reactive({ count: 0 });
  // RIGHT
  const { count } = toRefs(state);
  ```

- `vue/prop-mutation` — **A child writing to a prop, or mutating an object it received as one.** The parent owns that value; the write is lost on the next parent render and the two trees disagree until then.

## HIGH

- `vue/lifecycle-after-await` — `onMounted`/`onUnmounted` registered after an `await` in `setup()`. Registration is synchronous — past the first await there is no active instance, so the hook never runs and its cleanup never runs either.
- `vue/watcher-missing-cleanup` — A `watch`/`watchEffect` that starts a timer, a listener or a request without `onWatcherCleanup` / `onScopeDispose` — the previous run keeps going and its late response overwrites the current one.
- `vue/watch-instead-of-computed` — A `watch` whose only job is assigning to another ref. That is derived state: `computed()` recomputes correctly, cannot go stale, and needs no cleanup.
- `vue/reactive-reassignment` — Reassigning a whole `reactive()` array or object (`state.items = next`) where callers captured the original reference — they keep the old proxy. Mutate in place, or use `ref()` and assign `.value`.
- `vue/deep-watch-large-object` — `{ deep: true }` over a large structure or an entire store. Every mutation anywhere inside re-runs the handler; watch the specific getter instead.
- `vue/v-for-index-key` — `:key="index"` on a list that reorders, inserts or deletes — Vue reuses the wrong node and component state follows the index, not the item.
- `vue/v-if-with-v-for` — `v-if` and `v-for` on the same element. The precedence is not what it reads like and the filter re-runs per item; filter in a `computed`.
- `vue/async-setup-without-suspense` — `async setup()` in a component not wrapped in `<Suspense>` — it renders nothing, with no error, until the promise settles.
- `vue/composable-called-conditionally` — A composable called inside a condition, a loop or a callback. Like hooks, they bind to the active instance at call time.
- `vue/unvalidated-route-param` — `route.params` / `route.query` consumed as a typed value with no validation — external input, whatever the router's types claim.

## SUGGESTION

- `vue/prefer-script-setup` — `<script setup>` over the options object in new components — less ceremony and better type inference.
- `vue/prefer-typed-defineprops` — Type-based `defineProps<T>()` over the runtime object form where the project is TypeScript.
- `vue/prefer-shallowref` — `shallowRef` for large immutable payloads that are replaced rather than edited — deep proxying them costs on every access.
- `vue/oversized-sfc` — Single-file component beyond ~300 lines — suggest extracting a composable.
