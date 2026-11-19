// Copyright (c) Meta Platforms, Inc. and affiliates.

// RecoverySurface — the native minimal recovery view (feature 016 T015;
// the shell-app contract 5/7, FR-008). Shown ONLY when automatic reload
// has failed twice (terminal .failed state): a short message + one retry
// button, localized x7 via Localizable.xcstrings (T017), on the design
// register (Slate Void canvas, Ball Ivory type) so the failure world
// stays visually continuous with the game.
//
// Accessibility identifiers are STABLE — the L2 ComponentTree suite
// (test-pyramid contract 2) asserts labeled, localized elements by these ids:
//   shell.recovery.surface / .title / .body / .retry
import UIKit

final class RecoverySurface: UIView {

    /// GameViewController routes this to LifecycleController.userRetry.
    var onRetry: (() -> Void)?

    // Design-register palette: Slate Void canvas, Ball Ivory type.
    private static let slateVoid = UIColor(red: 0x0b / 255.0, green: 0x10 / 255.0,
                                           blue: 0x0c / 255.0, alpha: 1)
    private static let ballIvory = UIColor(red: 0xef / 255.0, green: 0xe9 / 255.0,
                                           blue: 0xd8 / 255.0, alpha: 1)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Self.slateVoid
        accessibilityIdentifier = "shell.recovery.surface"

        let title = UILabel()
        title.text = NSLocalizedString("shell.recovery.title",
                                       comment: "Recovery surface title")
        title.font = .preferredFont(forTextStyle: .title2)
        title.adjustsFontForContentSizeCategory = true
        title.textColor = Self.ballIvory
        title.textAlignment = .center
        title.numberOfLines = 0
        title.accessibilityIdentifier = "shell.recovery.title"

        let body = UILabel()
        body.text = NSLocalizedString("shell.recovery.body",
                                      comment: "Recovery surface body")
        body.font = .preferredFont(forTextStyle: .body)
        body.adjustsFontForContentSizeCategory = true
        body.textColor = Self.ballIvory.withAlphaComponent(0.62) // Ivory Muted
        body.textAlignment = .center
        body.numberOfLines = 0
        body.accessibilityIdentifier = "shell.recovery.body"

        var retryConfig = UIButton.Configuration.bordered()
        retryConfig.title = NSLocalizedString("shell.recovery.retry",
                                              comment: "Recovery retry button")
        retryConfig.baseForegroundColor = Self.slateVoid
        retryConfig.baseBackgroundColor = Self.ballIvory
        retryConfig.cornerStyle = .capsule
        retryConfig.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 28,
                                                            bottom: 12, trailing: 28)
        let retry = UIButton(configuration: retryConfig,
                             primaryAction: UIAction { [weak self] _ in
            self?.onRetry?()
        })
        retry.accessibilityIdentifier = "shell.recovery.retry"

        let stack = UIStackView(arrangedSubviews: [title, body, retry])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.setCustomSpacing(28, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor,
                                           constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor,
                                            constant: -32),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("RecoverySurface is code-only")
    }
}
