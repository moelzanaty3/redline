# Express Review Rules

**Scope:** an Express HTTP service — routers, middleware, handlers. The NestJS
rules (`nodejs`) do not apply here and these do not apply there; a Nest service
runs on Express underneath, but its boundary, validation and error handling are
Nest's, and reviewing it against these rules would flag the framework for doing
its job.

Written for Express 5. Where Express 4 behaves differently in a way that changes
whether something is a bug, the rule says so — an unhandled rejection is the main
one, and a repository pinned to 4 is still common enough that the distinction has
to be made rather than assumed away.

## BLOCKER — request changes

- `express/async-handler-unhandled-rejection` — **An `async` handler whose rejection nothing catches.** Express 4 does not forward a rejected promise to the error middleware: the response is never written, the client waits until it times out, and the connection leaks. Express 5 forwards it, which makes the error middleware mandatory rather than optional. Either wrap the handler or `try`/`catch` and call `next(err)`.

  ```js
  // WRONG — on Express 4 this request hangs forever
  app.get('/orders/:id', async (req, res) => {
    const order = await db.orders.find(req.params.id);
    res.json(order);
  });
  // RIGHT
  app.get('/orders/:id', async (req, res, next) => {
    try {
      res.json(await db.orders.find(req.params.id));
    } catch (err) {
      next(err);
    }
  });
  ```

- `express/missing-error-middleware` — **No error-handling middleware.** Express recognises one only by its four-argument shape `(err, req, res, next)`, and only when it is registered last. Without it the default handler answers, which returns the stack trace whenever `NODE_ENV` is not `production` — including on every staging box someone forgot to set it on.
- `express/unvalidated-request-input` — **`req.body`, `req.params`, `req.query` or `req.headers` consumed without a schema check.** This is the boundary core.md means. Validate into a typed shape before the value reaches a query, a file path, a shell command or a template.
- `express/cors-wildcard-with-credentials` — **`cors({ origin: '*' })` together with `credentials: true`.** Browsers refuse that pair, so it is usually "fixed" by reflecting the request's own `Origin` header — which grants every site on the internet authenticated access. Allow-list the origins.
- `express/route-missing-auth` — **A route registered with no authentication or authorisation middleware**, where sibling routes on the same router have it. A router-level guard counts; a guard on the gateway in front does not, per `core/missing-auth-check`.
- `express/user-path-to-filesystem` — **A user-controlled segment reaching `res.sendFile`, `express.static` or `fs`.** `../` traversal reads whatever the process can. Resolve the path and verify it stays under the intended root.
- `express/error-detail-in-response` — **An error's `message` or `stack` written into the response body.** It hands out the query, the file path and the driver version. Log the cause, return an opaque reference.
- `express/unbounded-body-limit` — **`express.json()` or `urlencoded()` with no `limit`.** The default is 100kb for the built-ins, but a hand-rolled parser or a raised limit with no ceiling turns one request into an out-of-memory kill.

## HIGH

- `express/missing-security-headers` — No `helmet()` or equivalent — the service answers with none of the headers a browser needs to isolate it.
- `express/route-order-shadowing` — A parameterised route registered before a literal one it swallows (`/users/:id` before `/users/new`) — the first match wins and the literal route is dead.
- `express/sync-work-in-handler` — `fs.*Sync`, `execSync`, or a CPU-bound loop inside a handler, blocking the event loop for every other connection.
- `express/outbound-call-no-timeout` — An outbound HTTP call with no timeout — Node's default is none, so one slow dependency exhausts the pool.
- `express/trust-proxy-unset` — Rate limiting, IP logging or protocol checks behind a load balancer without `app.set('trust proxy', …)`, so every client looks like the proxy.
- `express/missing-rate-limit` — Authentication, password-reset or token endpoints with no rate limiter in front.
- `express/next-not-returned` — `next(err)` called without `return`, so the handler keeps running and a second response is attempted on a request already answered.
- `express/config-scattered-process-env` — `process.env` read ad hoc across route modules rather than through one config module validated at startup.
- `express/middleware-order-after-routes` — Body parsing, session or auth middleware registered after the routes that need it, so it silently never runs for them.

## SUGGESTION

- `express/prefer-router-modules` — Routes declared directly on `app` where an `express.Router()` per resource would keep the surface readable.
- `express/prefer-async-await` — Callback-style handlers in new code where `async`/`await` reads plainly.
- `express/prefer-structured-logging` — `console.log` in request paths rather than a structured logger carrying the request id.
