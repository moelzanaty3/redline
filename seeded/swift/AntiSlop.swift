// DO NOT MERGE — Redline validation seed (anti-slop rules).
import UIKit

// SEED 1 [HIGH] (swift/concurrency-checking-opt-out) unchecked Sendable over an unguarded dictionary
final class ImageCache: @unchecked Sendable {
    var images: [URL: UIImage] = [:]
}

final class ProfileViewController: UIViewController {
    // SEED 2 [HIGH] (swift/implicitly-unwrapped-declaration) crashes far from the missing assignment
    var viewModel: ProfileViewModel!

    func load() {
        // SEED 3 [HIGH] (swift/unowned-capture) crashes if the response outlives the screen
        api.fetchProfile { [unowned self] result in
            self.title = try? result.get().name
        }
    }
}

protocol ProfileServiceDelegate { func didLoad(_ p: Profile) }
final class ProfileService {
    // SEED 4 [HIGH] (swift/strong-delegate) delegate retained strongly, leaking the controller
    var delegate: ProfileServiceDelegate?
}

// SEED 5 [HIGH] (swift/copying-reduce-accumulator) quadratic string building
let hex = Data().reduce("") { $0 + String(format: "%02x", $1) }
