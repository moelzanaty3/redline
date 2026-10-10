# Java (Spring Boot) Review Rules

## BLOCKER — request changes

- `java/entity-in-controller-response` — **JPA entities returned from controllers.** Endpoints return DTOs; entities leak lazy-loading proxies, internal fields, and cause serialization surprises.
- `java/n-plus-one-queries` — **N+1 queries.** Lazy association accessed in a loop or during serialization — require fetch join, `@EntityGraph`, or a projection.
- `java/transactional-self-invocation` — **`@Transactional` on private/self-invoked methods** — proxy is bypassed, annotation silently does nothing.
- `java/broad-catch` — **Catching `Exception`/`Throwable` broadly and continuing** — catch specific types; rethrow or fail the operation.
- `java/field-injection` — **Field injection (`@Autowired` on fields)** in new code — constructor injection only; field injection breaks testability and hides dependencies.
- `java/mutable-singleton-state` — **Mutable shared state in singleton beans** without synchronization — services/components are singletons; instance fields must be immutable or thread-safe.
- `java/blocking-in-reactive` — **Blocking calls inside reactive pipelines** (WebFlux: `block()`, JDBC, `RestTemplate` inside `Mono`/`Flux` chains).
- `java/jpql-string-concatenation` — **String-concatenated JPQL/SQL with external input** — parameterized queries / criteria API only.
- `java/reference-equality` — **`==`/`!=` on `String`, boxed numbers or other value objects.** It compares
  identity, so it passes in tests on interned literals and cached small boxes and fails in production — `status
  == "ACTIVE"` is false for a deserialised value, `Long` 128 `==` 128 is false. Use `equals`/`Objects.equals`,
  or unbox. Not for enums or a deliberate identity check against a sentinel.
- `java/bigdecimal-value-semantics` — **`new BigDecimal(double)` or `BigDecimal.equals` for amounts.** The
  double constructor captures binary rounding error (`new BigDecimal(0.1)` is `0.1000000000000000055…`), and
  `equals` compares scale, so `10.0` is not `10.00`. Use `new BigDecimal("0.1")` or `BigDecimal.valueOf(d)`, and
  `compareTo(…) == 0`.

## HIGH

- `java/optional-misuse` — `Optional` misuse: `Optional.get()` without presence check, `Optional` as field or method parameter.
- `java/entity-equals-hashcode` — `equals`/`hashCode` on JPA entities using generated IDs incorrectly (breaks in sets before persist) — or missing entirely on value objects.
- `java/missing-bean-validation` — Missing `@Valid` + Bean Validation on request DTOs at controller boundary.
- `java/transaction-scope-too-wide` — Transaction scope too wide: external HTTP calls or message publishing inside `@Transactional` — holds connections, couples commit to remote latency.
- `java/async-without-executor` — `@Async`/`CompletableFuture` work without dedicated executor — default pool starvation.
- `java/exception-detail-in-response` — Exception details (stack traces, SQL) returned in API error responses — map to problem-detail responses.
- `java/legacy-date-api` — New Date/`Calendar`/`SimpleDateFormat` in new code — `java.time` only; `SimpleDateFormat` is not thread-safe.
- `java/stream-side-effects` — Streams with side effects (`forEach` mutating external collections) — collect instead.
- `java/dropped-exception-cause` — **A new exception rethrown without the caught one as its cause.** `throw new
  ServiceException(e.getMessage())` cuts the trace at the catch, so a pool timeout and a network fault look
  identical in the log. Pass the original: `throw new ServiceException("context", e)`. Not when the parameter is
  named `unused`/`ignored` and the drop is deliberate.
- `java/swallowed-interrupt` — **`InterruptedException` caught — directly or via `catch (Exception)` — without
  restoring the interrupt.** The cancellation signal is erased, so `shutdownNow()` cannot stop the worker and
  the pod hangs until SIGKILL, dropping in-flight work. Call `Thread.currentThread().interrupt()` and stop, or
  rethrow.
- `java/unclosed-resource` — **An `AutoCloseable` (stream, `Connection`, `Statement`, `ResultSet`, HTTP
  response) not opened in try-with-resources.** An exception between open and `close()` leaks it — a pooled
  connection per bad row until every endpoint times out. Use `try (var rs = …)`. Not when ownership passes to
  the caller or a framework.
- `java/test-without-assertion` — **A test that cannot fail** — no assertion or verify on the production result,
  an expected-exception `try` with no `fail()`/`assertThrows`, a `catch (Throwable|AssertionError)` that
  swallows the assertion, or mocks stubbed but never handed to the code under test. Assert on the real output;
  use `assertThrows`.
- `java/print-stack-trace` — **`e.printStackTrace()` in a catch.** It writes to stderr outside the logging
  pipeline — no level, correlation id or alert — and almost always marks a swallowed failure, so the request
  returns 200 with partial data. Log through the logger with context, then rethrow or fail the operation.
- `java/ignored-pure-result` — **The result of a method on an immutable value discarded** — `s.trim();`,
  `s.toLowerCase();`, `bd.add(x);`, `date.plusDays(1);`, `stream.filter(…);`. The call does nothing and the
  unchanged value is used: `email.toLowerCase();` then `findByEmail(email)` misses `User@X.com`. Assign or
  return the result.

## SUGGESTION

- `java/lombok-data-on-entity` — Lombok `@Data` on entities (equals/hashCode/toString pitfalls) — prefer `@Getter` + explicit methods, or records for DTOs.
- `java/records-for-dtos` — Records for immutable DTOs where Java version allows.
- `java/var-usage` — `var` for obviously-typed locals; explicit types where inference hurts readability.
- `java/magic-values` — Magic numbers/strings for business values — extract named constants.
