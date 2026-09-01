# Node.js (NestJS) Service Review Rules

**Scope:** server-side TypeScript in a NestJS service. Do not apply these rules to
`.tsx` files, test specs, or front-end code; if you see React in the file, this rule
set does not apply.

## BLOCKER — request changes

- `nodejs/floating-promises` — **Floating promises.** Every promise is `await`ed, returned, or explicitly handled with `.catch` — an unhandled rejection crashes the process on modern Node.
- `nodejs/blocking-event-loop` — **Blocking the event loop.** Sync APIs in request paths (`fs.*Sync`, `child_process.execSync`, `crypto.pbkdf2Sync`), or CPU-heavy loops/JSON parsing of large payloads without worker threads.
- `nodejs/missing-dto-validation` — **Missing validation at the boundary.** Request DTOs must use `class-validator` decorators with a global `ValidationPipe` (`whitelist: true`); no raw `@Body() body: any`.
- `nodejs/request-state-on-singleton` — **Request-scoped data in singleton providers.** NestJS providers are singletons by default — storing per-request state on `this` bleeds data across users. Use `REQUEST` scope deliberately or AsyncLocalStorage.
- `nodejs/await-in-loop` — **`await` in a loop for independent operations** — require `Promise.all` / `Promise.allSettled` with a bounded batch size.
- `nodejs/config-outside-configservice` — **Secrets/config read via `process.env` scattered through code** — access only through the typed `ConfigService`/config module, validated at startup (fail fast on missing).
- `nodejs/error-detail-swallowed` — **Errors caught and converted to generic 500 with details swallowed** — use exception filters; preserve cause in logs (structured), never in the response body.

## HIGH

- `nodejs/logic-in-controller` — Business logic in controllers — controllers translate HTTP only; logic lives in providers/services.
- `nodejs/forwardref-circular-dependency` — Circular module dependencies "solved" with `forwardRef` where extraction of a shared module is possible.
- `nodejs/raw-http-client` — Raw `axios`/`fetch` calls without timeout, and without going through the service's shared HTTP client (interceptors carry auth, tracing, retries).
- `nodejs/missing-guard` — New endpoint missing guard coverage (authn/authz) — verify global guard applies or explicit guard present.
- `nodejs/orm-n-plus-one` — TypeORM/Prisma queries inside loops (N+1) — batch with `In()`/`findMany`.
- `nodejs/transaction-spans-remote-call` — Transactions spanning external HTTP calls or message publishes.
- `nodejs/json-parse-external-input` — `JSON.parse` on external input without size limits or try/catch at the boundary.
- `nodejs/missing-listener-teardown` — Event emitter / interval / stream listeners registered without teardown in `onModuleDestroy`.
- `nodejs/console-logging` — Logging via `console.*` instead of the injected structured logger.

## SUGGESTION

- `nodejs/dto-input-output-shared` — DTO classes reused for both input and output — split; output shape is a contract.
- `nodejs/lazy-import-heavy-modules` — Heavy modules imported at top level but used in one rarely-hit path — lazy import.
- `nodejs/magic-values` — Magic status codes/strings — use `HttpStatus` and shared enums.
- `nodejs/hot-loop-allocation` — Repeated `Date.now()` / `new Intl.*` in hot loops — hoist.
