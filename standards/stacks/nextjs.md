# Next.js Review Rules

**Scope:** Next.js App Router. These extend the React rules — they do not replace
them. Written for the App Router and Server Components, because that is what new
code starts on; a Pages Router rule appears here only where the two disagree about
whether something is a bug. Do not apply these to plain React or React Native
files.

The framework's defining hazard is that the server/client boundary is invisible in
the source. A file is server code until a `'use client'` somewhere above it says
otherwise, and nothing in the syntax of an import tells a reader which side they
are on. Most rules below are that boundary, seen from a different angle.

## BLOCKER — request changes

- `nextjs/server-action-missing-auth` — **Server Action with no authorisation check.** A Server Action compiles to a public HTTP endpoint with a generated id. Being defined in a protected page, imported only by an authenticated component, or hidden behind a rendered condition proves nothing — the endpoint is callable directly, forever, by anyone who has seen the id. Every action re-checks session and ownership in its own body.

  ```tsx
  // WRONG — the page checked, the action did not
  export async function deleteInvoice(id: string) {
    'use server';
    await db.invoice.delete({ where: { id } });
  }
  // RIGHT
  export async function deleteInvoice(id: string) {
    'use server';
    const session = await auth();
    if (!session) throw new Error('unauthorised');
    await db.invoice.delete({ where: { id, userId: session.user.id } });
  }
  ```

- `nextjs/secret-in-public-env` — **A secret read from a `NEXT_PUBLIC_`-prefixed variable.** The prefix inlines the literal value into the client bundle at build time. It is not a runtime lookup and cannot be rotated out of an already-shipped bundle. Anything that is not safe on a billboard uses an unprefixed name and is read on the server.
- `nextjs/server-only-leak` — **Server-only code reachable from a client component.** A module that touches the database, a private SDK, or a server environment variable, imported (directly or transitively) beneath a `'use client'` boundary, ships its source to the browser. Mark such modules `import 'server-only'` so the build fails instead of the secret shipping.
- `nextjs/route-handler-unvalidated-input` — **Route handler consuming `request.json()`, `formData()` or search params without a schema check.** A route handler is an external boundary in the sense core.md means it. Parse into a validated shape before the value reaches a query, a file path, or a response.
- `nextjs/middleware-as-sole-auth` — **Middleware as the only authorisation.** `middleware.ts` runs on a matcher, not on every code path — Server Actions, route handlers invoked directly, and paths the matcher does not cover all bypass it. Treat it as a redirect for humans, never as the enforcement point.
- `nextjs/user-data-in-cached-render` — **Request-specific data rendered in a cached path.** A segment that is statically rendered or wrapped in `unstable_cache` serves one response to everybody. Rendering the signed-in user's name, balance or permissions into it hands the first visitor's data to the second. Opt the segment out, or move the per-user part behind its own dynamic boundary.
- `nextjs/unsanitised-redirect` — **`redirect()` given a user-controlled destination.** A `?next=` or `?returnTo=` parameter passed through unchecked is an open redirect, and in an auth callback it is a token-forwarding gadget. Allow-list the path, or accept a relative path only.
- `nextjs/client-side-authorisation` — **Authorisation decided in client code.** Hiding a control with `session?.role === 'admin'` in a client component is presentation. The same check belongs in the action or handler behind it; without it the bundle simply documents which request to forge.

## HIGH

- `nextjs/unbounded-revalidate` — Mutable data fetched without a `revalidate` window or `cache: 'no-store'`, leaving it cached until the next deploy.
- `nextjs/client-boundary-too-high` — `'use client'` on a layout or page root, pulling its whole subtree into the client bundle when a leaf needed it.
- `nextjs/sequential-server-fetches` — Independent `await`s in one Server Component, serialising requests that `Promise.all` would overlap.
- `nextjs/missing-suspense-boundary` — An async Server Component with no `loading.tsx` or `<Suspense>` above it — the whole route waits on its slowest fetch.
- `nextjs/missing-error-boundary` — A route segment that fetches or can throw, with no `error.tsx`.
- `nextjs/dynamic-api-in-layout` — `cookies()`, `headers()` or `searchParams` read in a root layout, opting every route beneath it out of static rendering as a side effect.
- `nextjs/raw-img-element` — `<img>` where `next/image` applies — no sizing, no format negotiation, and a layout shift on every load.
- `nextjs/route-handler-no-cache-intent` — A `GET` route handler with neither an explicit `dynamic` nor a cache directive, whose behaviour then changes silently between Next versions.
- `nextjs/action-returns-internal-error` — A Server Action returning a caught error's `message` or `stack` to the client, putting the query, path or driver detail on the page.

## SUGGESTION

- `nextjs/prefer-server-component` — A client component whose only reason to be one is data fetching — fetch it on the server and pass the result down.
- `nextjs/prefer-link-navigation` — `router.push` in an `onClick` where `<Link>` expresses the same navigation and prefetches.
- `nextjs/prefer-next-font` — Fonts loaded via a stylesheet `@import` rather than `next/font`, costing a round trip and a layout shift.
- `nextjs/missing-route-metadata` — A public route exporting no `metadata` or `generateMetadata`.
