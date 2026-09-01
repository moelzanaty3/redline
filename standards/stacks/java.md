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

## HIGH

- `java/optional-misuse` — `Optional` misuse: `Optional.get()` without presence check, `Optional` as field or method parameter.
- `java/entity-equals-hashcode` — `equals`/`hashCode` on JPA entities using generated IDs incorrectly (breaks in sets before persist) — or missing entirely on value objects.
- `java/missing-bean-validation` — Missing `@Valid` + Bean Validation on request DTOs at controller boundary.
- `java/transaction-scope-too-wide` — Transaction scope too wide: external HTTP calls or message publishing inside `@Transactional` — holds connections, couples commit to remote latency.
- `java/async-without-executor` — `@Async`/`CompletableFuture` work without dedicated executor — default pool starvation.
- `java/exception-detail-in-response` — Exception details (stack traces, SQL) returned in API error responses — map to problem-detail responses.
- `java/legacy-date-api` — New Date/`Calendar`/`SimpleDateFormat` in new code — `java.time` only; `SimpleDateFormat` is not thread-safe.
- `java/stream-side-effects` — Streams with side effects (`forEach` mutating external collections) — collect instead.

## SUGGESTION

- `java/lombok-data-on-entity` — Lombok `@Data` on entities (equals/hashCode/toString pitfalls) — prefer `@Getter` + explicit methods, or records for DTOs.
- `java/records-for-dtos` — Records for immutable DTOs where Java version allows.
- `java/var-usage` — `var` for obviously-typed locals; explicit types where inference hurts readability.
- `java/magic-values` — Magic numbers/strings for business values — extract named constants.
