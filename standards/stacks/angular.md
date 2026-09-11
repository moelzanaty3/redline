# Angular Review Rules

**Scope:** Angular 16+ applications and libraries — components, services, guards,
interceptors and templates. Where a rule exists in both the core standard and here,
the core rule wins and this file names only the Angular-specific shape of it.

Templates are reviewable code. A `.component.html` file is where change detection,
injection sinks and dead subscriptions actually become visible.

## BLOCKER — request changes

- `angular/bypass-security-trust` — **`DomSanitizer.bypassSecurityTrust*` on a value derived from external input.** The call exists to switch Angular's sanitiser off; passing a URL, a query param or an API field through it is an injection sink with the guard removed.

  ```ts
  // WRONG
  this.html = this.sanitizer.bypassSecurityTrustHtml(comment.body);
  // RIGHT — leave sanitisation on; bind the raw string
  this.html = comment.body; // [innerHTML] sanitises it
  ```

- `angular/open-redirect-navigation` — **`router.navigateByUrl`, `location.href` or `[routerLink]` fed a user-controlled URL.** An `?next=` param that reaches navigation without an allow-list is an open redirect, and on `location.href` a `javascript:` URL is script execution.
- `angular/dynamic-template-compilation` — **A component, template or `NgModule` compiled from a string that came from outside.** There is no sanitiser on this path — the string is code.
- `angular/guard-as-only-auth` — **A route guard treated as the authorisation check.** Guards decide what gets rendered, never what gets served: every endpoint behind the route re-checks, or the data is one `curl` away.
- `angular/secret-in-environment-file` — **A secret in `environment.ts` / `environment.prod.ts`.** These files are compiled into the browser bundle. Anything in them is public, whatever the filename suggests.
- `angular/unsubscribed-subscription` — **`.subscribe()` with no teardown.** Use the `async` pipe, `takeUntilDestroyed()`, or unsubscribe in `ngOnDestroy` — a long-lived stream holds the component, its template and everything they close over.

  ```ts
  // WRONG
  ngOnInit() { this.socket.messages$.subscribe((m) => this.messages.push(m)); }
  // RIGHT
  private readonly messages$ = this.socket.messages$.pipe(takeUntilDestroyed());
  ```

- `angular/uncancelled-request-race` — **A request per keystroke or per navigation that is not cancelled when it is superseded.** With `mergeMap` the responses land out of order and the slower, older one wins; with `concatMap` they stay ordered but queue, so the view shows an answer to a query the user has already moved on from. `switchMap` cancels the superseded request.
- `angular/timer-not-cleared` — **`setInterval`, `setTimeout` or a manual event listener not torn down in `ngOnDestroy`.** It keeps firing against a destroyed view.

## HIGH

- `angular/function-call-in-template` — Method or getter invoked from a template binding (`{{ total() }}`, `*ngIf="isReady()"`) — it re-runs on every change-detection cycle, including ones triggered by unrelated events. Precompute, or use a signal or `computed`.
- `angular/default-change-detection-hot-component` — A list, table or frequently-updated component left on default change detection. Require `ChangeDetectionStrategy.OnPush` where the inputs are immutable.
- `angular/manual-change-detection` — `detectChanges()` / `markForCheck()` called to make the view update. It is a symptom: the state was mutated in place, or the work escaped the zone. Fix the source.
- `angular/nested-subscribe` — `subscribe()` inside `subscribe()` — no cancellation, no error propagation, no ordering guarantee. Flatten with `switchMap`/`concatMap`.
- `angular/duplicate-http-subscription` — The same cold `HttpClient` observable subscribed twice (two `async` pipes, or a `subscribe` plus a pipe) — that is two identical requests. `shareReplay({ bufferSize: 1, refCount: true })`.
- `angular/input-object-mutation` — A child mutating an object it received as `@Input()`. The parent owns it; with `OnPush` the parent never learns it changed.
- `angular/service-scope-mismatch` — `providedIn: 'root'` for state that must be per-component, or component `providers` for state that must be shared — one gives every consumer the same instance, the other silently gives each a fresh one.
- `angular/effect-writes-own-signal` — An `effect()` writing a signal it also reads, or reaching for `allowSignalWrites` to make that legal. That is a cycle; `computed()` is what derived state is for.
- `angular/missing-trackby` — `*ngFor` / `@for` over a list that reorders or re-fetches without `trackBy` (or `track`) — Angular destroys and rebuilds every row, losing focus and element state.
- `angular/interceptor-swallows-error` — An `HttpInterceptor` or `catchError` returning `of(null)` / `EMPTY` so the caller sees a successful empty response. The failure is now indistinguishable from no data.
- `angular/unvalidated-route-param` — A route param or query param consumed as a typed value (`+id`, `as Status`) with no validation — it is external input and a user types what they like.

## SUGGESTION

- `angular/prefer-async-pipe` — `async` pipe over a manual subscribe with a component field; subscription teardown comes free.
- `angular/prefer-signal-over-behaviorsubject` — Signals for synchronous component state in new code; keep RxJS for streams that are genuinely asynchronous.
- `angular/prefer-standalone-component` — Standalone components for new work rather than a new `NgModule`.
- `angular/prefer-inject-function` — `inject()` over constructor parameter injection in new code — it composes inside functions and base classes.
- `angular/oversized-component` — Component beyond ~300 lines, or a template beyond ~150 — suggest a split.
