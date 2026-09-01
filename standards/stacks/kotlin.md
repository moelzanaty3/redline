# Kotlin Review Rules (Android + backend)

## BLOCKER — request changes

- `kotlin/force-unwrap` — **`!!` non-null assertions** in production paths — restructure with `?.`, `?:`, `requireNotNull` with a message, or fix the type.
- `kotlin/globalscope` — **`GlobalScope.launch`** — coroutines must live in a structured scope (`viewModelScope`, `lifecycleScope`, injected `CoroutineScope`); GlobalScope leaks work past the owner's lifetime.
- `kotlin/blocking-in-coroutine` — **Blocking inside coroutines**: `Thread.sleep`, blocking IO, or `runBlocking` on `Dispatchers.Main` / inside `suspend` functions — use `delay`, suspending clients, or `withContext(Dispatchers.IO)`.
- `kotlin/context-leak` — **Android `Context` held by singletons / companion objects** — activity context leaks the whole view tree; application context only, and only when unavoidable.
- `kotlin/broad-catch-cancellation` — **Catching `Exception`/`Throwable` broadly and continuing** — also swallows `CancellationException`, breaking coroutine cancellation; catch specific types and rethrow `CancellationException`.
- `kotlin/unconfined-shared-state` — **Mutable shared state across coroutines without confinement** — use `Mutex`, `StateFlow`, or single-thread confinement.
- `kotlin/lateinit-misuse` — **`lateinit` used to dodge nullability logic** — acceptable only for framework-injected fields (DI, Android lifecycle).

## HIGH

- `kotlin/public-mutable-state` — Public `MutableStateFlow` / `MutableLiveData` — expose read-only `StateFlow`/`LiveData`, mutate privately.
- `kotlin/lifecycle-unaware-collection` — Flow collection in UI without `repeatOnLifecycle` / `collectAsStateWithLifecycle` — collects while backgrounded.
- `kotlin/hardcoded-dispatcher` — Hardcoded `Dispatchers.*` in classes — inject dispatchers for testability.
- `kotlin/data-class-var` — `data class` with `var` properties — copy/equality semantics break; use `val` + `copy`.
- `kotlin/companion-mutable-state` — Companion-object mutable state (global by another name).
- `kotlin/runcatching-silent-default` — `runCatching` chains that map failure to a default silently.
- `kotlin/force-unwrap-in-tests` — `!!` in tests hiding what the test actually asserts — use `assertNotNull` semantics.

## SUGGESTION

- `kotlin/prefer-sealed-state` — Sealed interfaces/classes for UI and result states instead of nullable-field combinations.
- `kotlin/value-class-identifiers` — `value class` for domain identifiers (MSISDN, AccountId) instead of raw `String`.
- `kotlin/deep-scope-function-nesting` — Nested `let`/`apply`/`run` chains more than two deep — extract a function.
