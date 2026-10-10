# Swift (iOS) Review Rules

## BLOCKER — request changes

- `swift/force-operations` — **Force operations in production paths**: `!` force-unwrap, `try!`, `as!` — restructure with `guard let`, `if let`, `try?` + handling, or fix the optionality.
- `swift/retain-cycle` — **Retain cycles**: `self` captured strongly in `@escaping` closures stored by the object (handlers, subscriptions, timers) — require `[weak self]` and early-return pattern.
- `swift/ui-off-main-actor` — **UI mutation off the main actor** — UIKit/SwiftUI state must be touched on `@MainActor` / main queue; no fire-and-forget background completion touching views.
- `swift/blocking-main-thread` — **Blocking the main thread**: synchronous network/disk on main, `DispatchQueue.main.sync` from the main queue (deadlock).
- `swift/uncancelled-task` — **Unstructured `Task {}` in views without cancellation** — tie to `.task {}` modifier or store and cancel; leaked tasks outlive the screen.
- `swift/sensitive-data-in-userdefaults` — **Sensitive data in `UserDefaults`** — tokens/credentials belong in Keychain.

## HIGH

- `swift/unconfined-singleton-state` — Singletons with mutable state and no actor/queue confinement — convert to `actor` or confine.
- `swift/completion-handler-in-new-code` — Completion-handler APIs in new code where async/await is available.
- `swift/missing-mainactor` — Missing `@MainActor` on ObservableObject/ViewModel classes driving UI.
- `swift/unremoved-observer` — `NotificationCenter` observers without removal (pre-iOS 9-style APIs) or Combine subscriptions without `cancellables` storage.
- `swift/oversized-view` — Massive view controllers / SwiftUI views over ~300 lines — extract subviews and view models.
- `swift/stringly-typed-identifiers` — Stringly-typed identifiers (segues, notification names, userInfo keys) — use enums/constants.
- `swift/swallowed-decode-failure` — `Codable` decode failures swallowed with `try?` where the failure matters.
- `swift/concurrency-checking-opt-out` — **Concurrency checking switched off to silence the compiler** —
  `@unchecked Sendable`, `nonisolated(unsafe)`, `@preconcurrency import`, `MainActor.assumeIsolated`. Each
  removes data-race checking, so `final class Cache: @unchecked Sendable { var items = [Key: Value]() }`
  corrupts its dictionary under concurrent writes and crashes intermittently. Name the lock, queue or invariant
  that makes it safe, inline, with a ticket. Not when every mutable member really is guarded — say by what.
- `swift/unowned-capture` — **`unowned` in a closure capture list.** `[unowned self]` in an escaping closure
  crashes when the closure runs after its owner is deallocated ("Attempted to read an unowned reference…"), and
  `unowned(unsafe)` is undefined behaviour. Use `[weak self]` with `guard let self else { return }`. Not in a
  non-escaping closure or a `lazy var` initialiser.
- `swift/strong-delegate` — **A delegate held strongly.** A stored `var delegate: SomeDelegate?` without `weak`
  forms a cycle with the owner that sets itself as delegate, so every push and pop of the screen leaks the
  controller and it keeps receiving callbacks. Declare it `weak var` and constrain the protocol to `AnyObject`.
- `swift/implicitly-unwrapped-declaration` — **An implicitly unwrapped optional outside `@IBOutlet`.** `var
  viewModel: ProfileViewModel!` force-unwraps on every read with no `!` at the use site, so a navigation path
  that forgets to set it crashes far from the cause. Inject a non-optional through `init`, or use a real
  optional and handle it. Not for `@IBOutlet` or XCTest fixtures set in `setUp`.
- `swift/copying-reduce-accumulator` — **`reduce` with a copy-on-write accumulator** — `reduce([]) { $0 + [$1]
  }`, `reduce("") { $0 + … }`, `reduce([K: V]())`. Each element copies the whole accumulator, so the loop is
  quadratic: hex-encoding a 1 MB payload stalls the main thread. Use `reduce(into:)`, `flatMap`, `joined()` or
  `Dictionary(grouping:)`.

## SUGGESTION

- `swift/prefer-value-types` — Prefer `struct` value types; classes only for identity or reference semantics.
- `swift/prefer-typed-throws` — `Result` grab-bags where typed `throws` is clearer.
- `swift/prefer-guard-early-exit` — Prefer `guard` early-exit over nested `if let` pyramids.
