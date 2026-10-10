# Kotlin Review Rules (Android + backend)

## BLOCKER — request changes

- `kotlin/force-unwrap` — **`!!` non-null assertions** in production paths — restructure with `?.`, `?:`, `requireNotNull` with a message, or fix the type.
- `kotlin/globalscope` — **`GlobalScope.launch`** — coroutines must live in a structured scope (`viewModelScope`, `lifecycleScope`, injected `CoroutineScope`); GlobalScope leaks work past the owner's lifetime.
- `kotlin/blocking-in-coroutine` — **Blocking inside coroutines**: `Thread.sleep`, blocking IO, or `runBlocking` on `Dispatchers.Main` / inside `suspend` functions — use `delay`, suspending clients, or `withContext(Dispatchers.IO)`.
- `kotlin/context-leak` — **Android `Context` held by singletons / companion objects** — activity context leaks the whole view tree; application context only, and only when unavoidable.
- `kotlin/broad-catch-cancellation` — **Catching `Exception`/`Throwable` broadly and continuing** — also swallows `CancellationException`, breaking coroutine cancellation; catch specific types and rethrow `CancellationException`.
- `kotlin/unconfined-shared-state` — **Mutable shared state across coroutines without confinement** — use `Mutex`, `StateFlow`, or single-thread confinement.
- `kotlin/lateinit-misuse` — **`lateinit` used to dodge nullability logic** — acceptable only for framework-injected fields (DI, Android lifecycle).
- `kotlin/todo-stub` — **`TODO()` / `throw NotImplementedError()` in production code.** The IDE's placeholder
  compiles and ships, and `NotImplementedError` is an `Error`, so `catch (e: Exception)` does not stop it — the
  first refund request crashes the app or the request thread. Implement it, or throw
  `UnsupportedOperationException("why")` for a deliberately unsupported operation. Not in test fakes.

## HIGH

- `kotlin/public-mutable-state` — Public `MutableStateFlow` / `MutableLiveData` — expose read-only `StateFlow`/`LiveData`, mutate privately.
- `kotlin/lifecycle-unaware-collection` — Flow collection in UI without `repeatOnLifecycle` / `collectAsStateWithLifecycle` — collects while backgrounded.
- `kotlin/hardcoded-dispatcher` — Hardcoded `Dispatchers.*` in classes — inject dispatchers for testability.
- `kotlin/data-class-var` — `data class` with `var` properties — copy/equality semantics break; use `val` + `copy`.
- `kotlin/companion-mutable-state` — Companion-object mutable state (global by another name).
- `kotlin/runcatching-silent-default` — `runCatching` chains that map failure to a default silently.
- `kotlin/force-unwrap-in-tests` — `!!` in tests hiding what the test actually asserts — use `assertNotNull` semantics.
- `kotlin/dropped-exception-cause` — **A new exception thrown with only `e.message`.** `throw
  RepositoryException(e.message)` loses the original type and trace, so a certificate-expiry outage is diagnosed
  as an app bug. Pass the cause: `throw RepositoryException("context", e)`.
- `kotlin/downcast-readonly-collection` — **A read-only `List`/`Set`/`Map` cast to `Mutable*` to mutate it.** It
  throws `UnsupportedOperationException` on `listOf`/`emptyList`, or silently mutates a collection the caller
  thinks is immutable — mutating a `StateFlow` value in place so `distinctUntilChanged` never emits. Copy with
  `toMutableList()`, or expose a mutable type honestly.
- `kotlin/else-on-exhaustive-when` — **An `else ->` branch in a `when` over a sealed type, enum or Boolean.** It
  switches off the compiler's exhaustiveness check, so a variant added later silently takes the default —
  `Refunded` landing in `else -> showSuccess()`. List every case and let the build fail on new ones.
- `kotlin/suspend-in-finally` — **Suspending cleanup in `finally` without `withContext(NonCancellable)`.** On
  cancellation the first suspension point in `finally` throws immediately, so the cleanup never runs and the
  server-side lock or upload session leaks. Wrap it: `finally { withContext(NonCancellable) { release() } }`.
- `kotlin/launch-in-test-without-runtest` — **`launch`/`async` in a `@Test` outside `runTest`.** The test
  returns before the coroutine runs, so its assertions never execute or fail an unrelated later test. Wrap the
  body in `runTest { }` and use the test dispatcher.
- `kotlin/implicit-default-locale` — **`String.format` / `"…".format()` / `uppercase()`-style calls producing
  machine-read text without an explicit `Locale`.** On a German device `"%.2f".format(amount)` sends `12,50` and
  the payment API rejects it. Pass `Locale.ROOT` for anything parsed, signed, hashed or sent. Not for display
  text.
- `kotlin/print-stack-trace` — **`e.printStackTrace()` in a catch.** It goes to stderr or logcat, past the
  logger and crash reporting, so a production-wide failure never reaches Crashlytics. Log it with context
  through the logger or crash reporter, then rethrow or surface the failure.

## SUGGESTION

- `kotlin/prefer-sealed-state` — Sealed interfaces/classes for UI and result states instead of nullable-field combinations.
- `kotlin/value-class-identifiers` — `value class` for domain identifiers (MSISDN, AccountId) instead of raw `String`.
- `kotlin/deep-scope-function-nesting` — Nested `let`/`apply`/`run` chains more than two deep — extract a function.
