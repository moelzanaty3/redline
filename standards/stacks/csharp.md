# C# (.NET) Review Rules

## BLOCKER — request changes

- `csharp/async-void` — **`async void`** anywhere except event handlers — exceptions escape the caller and crash the process; return `Task`.
- `csharp/sync-over-async` — **Sync-over-async**: `.Result`, `.Wait()`, `.GetAwaiter().GetResult()` on async calls — deadlock and thread-pool starvation; async all the way.
- `csharp/httpclient-per-request` — **`HttpClient` instantiated per request** — socket exhaustion; use `IHttpClientFactory`.
- `csharp/captive-dependencies` — **Captive dependencies**: scoped services (DbContext) injected into singletons — cross-request state bleed; inject `IServiceScopeFactory` or restructure.
- `csharp/sql-string-concatenation` — **String-concatenated SQL with external input** — parameterized queries / EF LINQ only.
- `csharp/swallowed-exceptions` — **Swallowed exceptions**: `catch { }` or catch-log-continue treating failure as success.
- `csharp/missing-cancellation-token` — **Missing `CancellationToken` propagation** on new async endpoints and outbound calls.

## HIGH

- `csharp/ef-n-plus-one` — EF Core N+1: navigation properties accessed in loops — `.Include`/projection; and unbounded queries without paging.
- `csharp/multiple-enumeration` — `IEnumerable` multiple enumeration of LINQ-to-entities queries — materialize once with `ToListAsync`.
- `csharp/datetime-now` — DateTime.Now in new code — `DateTimeOffset.UtcNow` / `TimeProvider`.
- `csharp/entity-in-controller-response` — Entities returned from controllers — DTOs/records only; entities leak lazy-nav and internal fields.
- `csharp/missing-model-validation` — Missing model validation at the boundary (`[ApiController]` + data annotations or FluentValidation).
- `csharp/lock-over-async` — `lock` over async operations (can't await inside lock) — `SemaphoreSlim`.
- `csharp/fire-and-forget-task-run` — Fire-and-forget `Task.Run` without exception observation — use hosted services / background queues.
- `csharp/exception-detail-in-response` — Exception details in API responses — ProblemDetails mapping.

## SUGGESTION

- `csharp/records-for-dtos` — Records for immutable DTOs; `required`/init-only properties over constructors with many args.
- `csharp/nullable-reference-types` — Nullable reference types enabled and respected in new projects — no `!` dammit-operator without comment.
- `csharp/structured-logging` — `ILogger<T>` structured logging with message templates, not string interpolation.
- `csharp/api-style-consistency` — Minimal APIs vs controllers — follow whichever the service already uses.
