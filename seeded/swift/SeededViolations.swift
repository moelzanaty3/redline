// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import Foundation
import UIKit

final class SeededViolations {

    // SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded credential
    private let apiKey = "sk_live_51HxT2mAcmeCorp8f3kPq"

    private var handlers: [() -> Void] = []
    private let label = UILabel()

    func load(msisdn: String) {
        // SEED 2 [BLOCKER] (swift/sensitive-data-in-userdefaults) auth token stored in UserDefaults instead of the Keychain
        UserDefaults.standard.set(apiKey, forKey: "authToken")

        // SEED 3 [BLOCKER] (core/customer-data-in-logs) customer identifier in logs
        print("loading balance for \(msisdn)")

        let url = URL(string: "https://api.internal/balance/\(msisdn)")!
        // SEED 4 [BLOCKER] (swift/force-operations) force-unwrapped optional in a production path

        URLSession.shared.dataTask(with: url) { data, _, _ in
            // SEED 5 [BLOCKER] (swift/retain-cycle) strong self captured in an escaping closure stored by the object
            self.handlers.append { print("done") }

            // SEED 6 [BLOCKER] (swift/force-operations) force try
            let decoded = try! JSONDecoder().decode([String: String].self, from: data!)

            // SEED 7 [BLOCKER] (swift/ui-off-main-actor) UI mutated off the main actor
            self.label.text = decoded["balance"]
        }.resume()

        // SEED 8 [BLOCKER] (swift/blocking-main-thread) synchronous network call on the main thread
        let blocking = try? Data(contentsOf: url)
        _ = blocking
    }

    // SEED 9 [BLOCKER] (swift/uncancelled-task) unstructured Task with no cancellation path
    func refresh() {
        Task {
            while true {
                load(msisdn: "0000")
            }
        }
    }
}

extension SeededViolations {

    // SEED 10 [BLOCKER] (core/type-checker-suppression) linter suppression with no explanation and no ticket
    // swiftlint:disable force_cast
    func coerce(_ value: Any) -> String {
        return value as! String
    }

    // SEED 11 [HIGH] (core/untracked-todo) placeholder with no ticket reference
    // TODO: decide whether the scanner should follow symlinks
    func pending() {}
}
