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

## SUGGESTION

- `swift/prefer-value-types` — Prefer `struct` value types; classes only for identity or reference semantics.
- `swift/prefer-typed-throws` — `Result` grab-bags where typed `throws` is clearer.
- `swift/prefer-guard-early-exit` — Prefer `guard` early-exit over nested `if let` pyramids.
