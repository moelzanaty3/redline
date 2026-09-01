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

## HIGH

- `go/missing-client-server-timeout` — `http.Client`/`http.Server` without timeouts (`Timeout`, `ReadTimeout`, `WriteTimeout`) — zero values mean infinite.
- `go/response-body-not-drained` — Response body not closed, or closed without being drained (breaks connection reuse).
- `go/errors-is-as` — `errors.Is`/`errors.As` not used where sentinel/typed errors are compared with `==` or type assertion.
- `go/interface-at-implementation` — Interfaces defined next to the implementation instead of the consumer; interfaces with one implementation and no test need.
- `go/waitgroup-add-inside-goroutine` — `sync.WaitGroup.Add` inside the goroutine instead of before starting it.
- `go/unbuffered-channel-blocks-producer` — Unbuffered channel used where the producer must never block, or buffer sizes chosen arbitrarily without comment.
- `go/time-after-in-loop` — `time.After` in a loop (leaks timers until fire) — use `time.NewTimer`/`Ticker` with Stop.
- `go/package-level-mutable-state` — Package-level mutable state in new code.

## SUGGESTION

- `go/naked-returns` — Naked returns in functions longer than a few lines.
- `go/any-over-concrete-type` — `interface{}`/`any` where a concrete type or generic works.
- `go/error-string-style` — Error strings capitalized or ending with punctuation (Go convention: lowercase, no period).
- `go/receiver-consistency` — Struct field alignment/pointer-vs-value receiver inconsistency within a type.
