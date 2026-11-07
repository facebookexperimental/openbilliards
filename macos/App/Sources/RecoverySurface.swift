// Copyright (c) Meta Platforms, Inc. and affiliates.

// RecoverySurface — native localized error/retry surface (T014, lane S;
// the macos-shell contract §6). Shown ONLY when automatic reload has
// failed twice (terminal .failed state): a short message + one retry
// button, localized ×7 via Localizable.xcstrings (recovery wording
// carried from the iOS catalog per the menu-i18n contract §2), on the
// design register (Slate Void canvas, Ball Ivory type) so the failure
// world stays visually continuous with the game. Retry re-drives the
// WebViewHost boot path through LifecycleController.userRetry.
//
// Accessibility identifiers are STABLE (016 convention):
//   shell.recovery.surface / .title / .body / .retry
import AppKit

final class RecoverySurface: NSView {

    /// WebViewHost routes this to LifecycleController.userRetryRequested.
    var onRetry: (() -> Void)?

    // Design-register palette: Slate Void canvas, Ball Ivory type.
    private static let slateVoid = NSColor(srgbRed: 0x0b / 255.0,
                                           green: 0x10 / 255.0,
                                           blue: 0x0c / 255.0, alpha: 1)
    private static let ballIvory = NSColor(srgbRed: 0xef / 255.0,
                                           green: 0xe9 / 255.0,
                                           blue: 0xd8 / 255.0, alpha: 1)

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = Self.slateVoid.cgColor
        setAccessibilityIdentifier("shell.recovery.surface")

        let title = Self.makeLabel(
            text: NSLocalizedString("shell.recovery.title",
                                    comment: "Recovery surface title"),
            font: .systemFont(ofSize: 22, weight: .semibold),
            color: Self.ballIvory)
        title.setAccessibilityIdentifier("shell.recovery.title")

        let body = Self.makeLabel(
            text: NSLocalizedString("shell.recovery.body",
                                    comment: "Recovery surface body"),
            font: .systemFont(ofSize: 13),
            color: Self.ballIvory.withAlphaComponent(0.62)) // Ivory Muted
        body.setAccessibilityIdentifier("shell.recovery.body")

        let retry = NSButton(
            title: NSLocalizedString("shell.recovery.retry",
                                     comment: "Recovery retry button"),
            target: self, action: #selector(retryPressed(_:)))
        retry.bezelStyle = .rounded
        retry.controlSize = .large
        retry.keyEquivalent = "\r" // default button: Return retries
        retry.setAccessibilityIdentifier("shell.recovery.retry")

        let stack = NSStackView(views: [title, body, retry])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.setCustomSpacing(28, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor,
                                           constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor,
                                            constant: -32),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("RecoverySurface is code-only")
    }

    @objc private func retryPressed(_ sender: NSButton) {
        onRetry?()
    }

    private static func makeLabel(text: String, font: NSFont,
                                  color: NSColor) -> NSTextField {
        let label = NSTextField(wrappingLabelWithString: text)
        label.font = font
        label.textColor = color
        label.alignment = .center
        label.isSelectable = false
        return label
    }
}
