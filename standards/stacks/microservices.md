# Microservice Cross-Cutting Review Rules

**Scope:** backend service code in any language. Applies in addition to the
language-specific rules, never instead of them.

Apply to all backend services regardless of language, in addition to the language-specific rules.

## BLOCKER — request changes

- `microservices/missing-timeout` — **Outbound calls without timeouts.** Every HTTP/gRPC/DB/queue call must have an explicit timeout; no infinite defaults.
- `microservices/unversioned-breaking-change` — **Breaking API changes without versioning.** Removing/renaming fields, changing types, or tightening validation on a published API contract requires a version bump or an approved deprecation path. Additive changes only on existing versions.
- `microservices/pii-in-telemetry` — **PII in logs, traces, or metrics labels** — MSISDN, email, account IDs, tokens. Log opaque IDs only.
- `microservices/secrets-in-config` — **Secrets in code, Dockerfiles, compose files, Helm values, or CI YAML** — vault/secret-manager references only.
- `microservices/non-idempotent-consumer` — **Non-idempotent consumers/handlers for at-least-once delivery** (Kafka, SQS, retries on POST). Duplicate delivery must not double-apply.
- `microservices/swallowed-errors` — **Swallowed errors** — catch-and-ignore, error logged then treated as success, or error branch returning 200.

## HIGH

- `microservices/retry-without-backoff` — Retries without backoff + jitter, or retrying non-idempotent operations.
- `microservices/missing-circuit-breaker` — Missing circuit breaker / bulkhead on dependencies known to degrade (peer services, third parties).
- `microservices/unauthenticated-endpoint` — New endpoint without authn/authz middleware — even "internal" services; do not trust the network.
- `microservices/dual-write-no-outbox` — DB work and message publish in one logical step without outbox or equivalent — dual-write inconsistency.
- `microservices/unbounded-work` — Unbounded work from external input: no pagination limits, unbounded batch sizes, unbounded payload accepted.
- `microservices/readiness-liveness-conflated` — Missing health/readiness distinction: readiness must fail when dependencies are down; liveness must not.
- `microservices/missing-trace-propagation` — New external call without propagating trace context / correlation ID.
- `microservices/incompatible-migration` — Migration not backward-compatible with the currently deployed version (rename/drop column while old pods still run).

## SUGGESTION

- `microservices/undocumented-config` — New config value without a sane default and documentation in the service README/values file.
- `microservices/missing-metrics` — Metrics for new critical paths (rate, errors, duration) missing.
- `microservices/missing-dlq-handling` — Consumer lag / DLQ handling absent on new consumers.

## What NOT to flag

- Existing contract shapes the PR does not modify.
- Infrastructure choices (broker, DB engine) already established in the service.
