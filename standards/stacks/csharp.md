# C# (.NET) Review Rules

## BLOCKER — request changes

- `csharp/async-void` — **`async void`** anywhere except event handlers — exceptions escape the caller and crash the process; return `Task`.
- `csharp/sync-over-async` — **Sync-over-async**: `.Result`, `.Wait()`, `.GetAwaiter().GetResult()` on async calls — deadlock and thread-pool starvation; async all the way.
- `csharp/httpclient-per-request` — **`HttpClient` instantiated per request** — socket exhaustion; use `IHttpClientFactory`.
- `csharp/captive-dependencies` — **Captive dependencies**: scoped services (DbContext) injected into singletons — cross-request state bleed; inject `IServiceScopeFactory` or restructure.
- `csharp/sql-string-concatenation` — **String-concatenated SQL with external input** — parameterized queries / EF LINQ only.
- `csharp/swallowed-exceptions` — **Swallowed exceptions**: `catch { }` or catch-log-continue treating failure as success.
- `csharp/missing-cancellation-token` — **Missing `CancellationToken` propagation** on new async endpoints and outbound calls.
- `csharp/task-returned-from-using` — **A task returned unawaited from inside a `using` scope.** `using var db =
  …; return db.Orders.ToListAsync();` disposes the context before the query finishes, so it fails with
  `ObjectDisposedException` whenever the query does not complete synchronously. Make the method `async` and
  `return await`.
- `csharp/insecure-random` — **`System.Random` / `Random.Shared` for a security-sensitive value** — OTPs, reset
  tokens, API keys, session ids, nonces, salts, invitation codes. Its output is predictable from a few samples.
  Use `RandomNumberGenerator.GetInt32`/`GetBytes`/`GetHexString`. Not for jitter, sampling or shuffling
  non-secret data.

## HIGH

- `csharp/ef-n-plus-one` — EF Core N+1: navigation properties accessed in loops — `.Include`/projection; and unbounded queries without paging.
- `csharp/multiple-enumeration` — `IEnumerable` multiple enumeration of LINQ-to-entities queries — materialize once with `ToListAsync`.
- `csharp/datetime-now` — DateTime.Now in new code — `DateTimeOffset.UtcNow` / `TimeProvider`.
- `csharp/entity-in-controller-response` — Entities returned from controllers — DTOs/records only; entities leak lazy-nav and internal fields.
- `csharp/missing-model-validation` — Missing model validation at the boundary (`[ApiController]` + data annotations or FluentValidation).
- `csharp/lock-over-async` — `lock` over async operations (can't await inside lock) — `SemaphoreSlim`.
- `csharp/fire-and-forget-task-run` — Fire-and-forget `Task.Run` without exception observation — use hosted services / background queues.
- `csharp/exception-detail-in-response` — Exception details in API responses — ProblemDetails mapping.
- `csharp/rethrow-loses-stack` — **`throw ex;` inside a catch.** Rethrowing the variable restarts the stack
  trace at this method, so the frames between the fault and the catch are gone from the incident log. Use bare
  `throw;`, or `ExceptionDispatchInfo.Capture(ex).Throw()` outside the handler.
- `csharp/exception-wrapped-without-inner` — **An exception translated without its cause.** `catch (SqlException
  ex) { throw new OrderException("Could not save"); }` turns a deadlock, a timeout and a constraint violation
  into one message with no cause. Pass `ex` as `innerException`, or rethrow with `throw;`.
- `csharp/reserved-exception-type` — **Throwing `Exception`, `ApplicationException`, `SystemException` or a
  runtime-reserved type** (`NullReferenceException`, `IndexOutOfRangeException`, …). A caller can only handle it
  with `catch (Exception)`, which also swallows real bugs — mapping "not found" to 404 that way turns a null
  dereference into a 404 too. Throw a specific framework or domain exception. Not in test doubles simulating an
  arbitrary failure.
- `csharp/sync-io-in-async` — **A synchronous API inside an async method when an `…Async` overload exists** —
  `File.ReadAllText`, `stream.Read`, `SaveChanges()`, `ToList()`/`First()` on an EF query, `Thread.Sleep`. It
  blocks a pool thread for the whole I/O, so under load the pool starves and unrelated requests time out. Await
  the async overload.
- `csharp/culture-implicit-parse-format` — **Machine-readable values parsed or formatted with the server's
  culture** — `decimal/double/DateTime.Parse(s)`, `ToString()` written to storage or the wire, `ToLower()`
  building a key. On a `de_DE` host `decimal.Parse("1.50")` is `150`. Pass `CultureInfo.InvariantCulture` (or an
  invariant format, `ToLowerInvariant()`); current culture only for text shown to users.
- `csharp/case-compare-via-tolower` — **Case-insensitive comparison via `a.ToUpper() == b.ToUpper()` /
  `.ToLower()`.** It depends on culture — `role.ToUpper() == "ADMIN"` is false for `admin` on a tr-TR host — and
  allocates per comparison. Use `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`. Not inside EF Core
  `IQueryable` predicates, which cannot translate the overload.
- `csharp/ef-inmemory-test-double` — **Query tests against `UseInMemoryDatabase` or a mocked/list-backed
  `DbSet`.** The fake has no transactions, raw SQL, constraints or provider translation, so the suite is green
  on queries that throw or behave differently in production — Microsoft's own testing guidance discourages it.
  Test against the real provider (Testcontainers, LocalDB) or stub a repository boundary.

## SUGGESTION

- `csharp/records-for-dtos` — Records for immutable DTOs; `required`/init-only properties over constructors with many args.
- `csharp/nullable-reference-types` — Nullable reference types enabled and respected in new projects — no `!` dammit-operator without comment.
- `csharp/structured-logging` — `ILogger<T>` structured logging with message templates, not string interpolation.
- `csharp/api-style-consistency` — Minimal APIs vs controllers — follow whichever the service already uses.
