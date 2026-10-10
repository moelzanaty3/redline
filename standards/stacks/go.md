# Go Review Rules

## BLOCKER — request changes

- `go/ignored-errors` — **Ignored errors.** `_ = err`, unchecked returns, or `err` shadowed and never handled. Every error is handled, returned wrapped (`fmt.Errorf("...: %w", err)`), or explicitly justified.
- `go/goroutine-leaks` — **Goroutine leaks.** Goroutine started without a way to stop: missing context cancellation, blocked forever on channel send/receive, no `WaitGroup`/errgroup ownership.
- `go/missing-ctx-propagation` — **Missing `ctx` propagation.** Outbound calls (HTTP, DB, gRPC) must take the request's `context.Context`; no `context.Background()` inside request handling.
- `go/data-races` — **Data races.** Shared map/slice/struct written from multiple goroutines without mutex or channel ownership; loop variable captured by reference in goroutine (pre-1.22 semantics or when version unknown).
- `go/writing-nil-map` — **Writing to a nil map.**
- `go/copying-sync-primitive` — **Copying a struct containing `sync.Mutex`/`sync.WaitGroup`** (passing by value, range over slice of them).
- `go/defer-in-loop` — **`defer` in a loop for per-iteration resources** (files, rows, locks) — defers pile up until function exit; extract loop body into a function.
- `go/panic-for-expected-failure` — **Panics for expected failures** — panic only for programmer errors; return errors otherwise.
- `go/error-laundered-to-nil` — **An error checked, then laundered to success** — `if err != nil { return nil }`
  (or `return x, nil`), or the inverse `if err == nil { return err }`. The caller sees success and carries on
  with a zero or partial result: the write failed and the handler answers 200. Return the error wrapped, or say
  in a comment why this failure is success.
- `go/typed-nil-in-interface` — **A typed nil returned as an interface.** A nil `*MyError` returned through
  `error` is a non-nil interface, so every `err != nil` upstream fires and a successful request fails. Return
  the literal `nil` on success and declare the variable as `error`, not `*MyError`.
- `go/sql-rows-lifecycle` — **`sql.Rows` not closed, or `rows.Err()` not checked.** `rows.Next()` returns false
  on a mid-iteration failure too, so without `rows.Err()` 40 of 1000 rows are returned as complete; without
  `defer rows.Close()` the connection is never released and the pool runs dry. Defer `Close` after the error
  check and check `rows.Err()` after the loop.
- `go/nil-check-after-deref` — **A pointer dereferenced before its own nil check.** The check shows the author
  expected nil, and the earlier dereference panics in exactly that case. Check first and return early; in tests
  use `t.Fatalf`, since `t.Errorf` does not stop the test.

## HIGH

- `go/missing-client-server-timeout` — `http.Client`/`http.Server` without timeouts (`Timeout`, `ReadTimeout`, `WriteTimeout`) — zero values mean infinite.
- `go/response-body-not-drained` — Response body not closed, or closed without being drained (breaks connection reuse).
- `go/errors-is-as` — `errors.Is`/`errors.As` not used where sentinel/typed errors are compared with `==` or type assertion.
- `go/interface-at-implementation` — Interfaces defined next to the implementation instead of the consumer; interfaces with one implementation and no test need.
- `go/waitgroup-add-inside-goroutine` — `sync.WaitGroup.Add` inside the goroutine instead of before starting it.
- `go/unbuffered-channel-blocks-producer` — Unbuffered channel used where the producer must never block, or buffer sizes chosen arbitrarily without comment.
- `go/time-after-in-loop` — `time.After` in a loop (leaks timers until fire) — use `time.NewTimer`/`Ticker` with Stop.
- `go/package-level-mutable-state` — Package-level mutable state in new code.
- `go/nil-nil-return` — **`return nil, nil` from a `(pointer, error)` function.** Callers assume no error means
  a usable value, so `u.Name` panics when the user is missing. Return a sentinel (`ErrNotFound`) checked with
  `errors.Is`. Not when the contract documents nil as valid and every caller checks it.
- `go/error-wrap-verb` — **An error formatted with `%v`/`%s` instead of `%w`.** `fmt.Errorf("find: %v", err)`
  flattens the cause to text, so `errors.Is(err, sql.ErrNoRows)` upstream is false and a 404 becomes a 500. Use
  `%w`. Not when deliberately hiding an internal error from the API contract — say so on the line.
- `go/fatal-in-test-goroutine` — **`t.Fatal`/`t.FailNow`/`t.Skip` from a goroutine the test started.** `FailNow`
  exits only the calling goroutine, so the test keeps running and can pass or hang on `wg.Wait()` until the run
  times out. Send the error back on a channel or use `errgroup`, and fail from the test goroutine.
- `go/context-grown-in-loop` — **A context reassigned to a child of itself in a loop.** `ctx =
  context.WithValue(ctx, …)` per iteration chains contexts, so lookups walk every parent and
  `WithCancel`/`WithTimeout` keep every cancel func and timer alive. Derive a loop-scoped `ctx :=` and
  `cancel()` each iteration.
- `go/non-exhaustive-enum-switch` — **A `switch` over an enum-like const type that misses members and has no
  `default`.** A value added later falls through silently — refunds restore no stock. List every member, or add
  a `default` that returns an error. Not when a comment says the subset is deliberate.
- `go/untagged-wire-struct` — **A struct (un)marshalled to JSON/YAML/XML without field tags.** The wire contract
  follows the Go field names, so renaming `UserID` to `UserId` silently changes the key and consumers decode a
  zero value. Tag every exported field.

## SUGGESTION

- `go/naked-returns` — Naked returns in functions longer than a few lines.
- `go/any-over-concrete-type` — `interface{}`/`any` where a concrete type or generic works.
- `go/error-string-style` — Error strings capitalized or ending with punctuation (Go convention: lowercase, no period).
- `go/receiver-consistency` — Struct field alignment/pointer-vs-value receiver inconsistency within a type.
