// Copyright (c) Meta Platforms, Inc. and affiliates.

// ShareController — the obShare bridge endpoint (issue #51;
// the share-bridge contract). HapticsController precedent: message
// validation/sanitation (ShareMessage.decode) is ShellCore logic,
// unit-gated there — this file owns only the WKScriptMessageHandler
// plumbing, the temp-file write, and the UIActivityViewController
// presentation.
//
// Why a native seam at all: WKWebView wires no download/UI delegate, so an
// anchor blob click (the browser download path record.js/export.js use)
// dead-ends silently in the shell. The page feature-detects
// window.webkit.messageHandlers.obShare (capability, never UA sniffing)
// and posts {v: 1, name, mime, b64}; without the bridge the anchor path
// runs unchanged in browsers.
//
// Laws (share-bridge contract §4):
// - decode -> temp file -> share sheet; malformed payloads drop silently,
//   never surfacing to the page (FR-011 regime).
// - Bytes are written under a fresh directory in temporaryDirectory with
//   the SANITIZED leaf name (ShareMessage law), so the payload can never
//   escape the sandboxed temp tree.
// - Failures (write/present) degrade to a silent no-op — the page cannot
//   observe them and must not break (the recording itself already
//   succeeded; the file simply is not offered).
// - SC-001 is untouched: the payload rides the message channel; no request
//   leaves app://local.
import Foundation
import UIKit
import WebKit
import ShellCore

final class ShareController: NSObject, WKScriptMessageHandler {

    /// The bridge name: window.webkit.messageHandlers.obShare.
    static let messageName = "obShare"

    /// The view controller the share sheet presents from (the host game
    /// view controller; weak — the web view outlives presentations).
    weak var presenter: UIViewController?

    /// Decode + temp-file write ride ONE SERIAL utility queue (review F1):
    /// ShareMessage.decode base64-decodes payloads that can run to
    /// hundreds of MB — decoding on the main thread (where
    /// WKScriptMessageHandler delivers) froze the UI/JS bridge for the
    /// whole decode. `message.body` is a plist-bridged value (dictionary
    /// of NSString/NSNumber — safe to carry across threads); a serial
    /// queue keeps the DEBUG counters/seam race-free.
    private let shareQueue = DispatchQueue(label: "ob-share", qos: .utility)

    #if DEBUG
    /// DEBUG diagnostics (HapticsController precedent): decoded/dropped
    /// counters + the status-seam mirror hooks. onDecodedShare fires (on
    /// shareQueue) for every DECODED payload; onPresentedShare fires on
    /// the MAIN thread only after presenter.present actually ran (review
    /// F6: decode-only was oversold as end-to-end) — together the L3
    /// capabilities scenario can assert the whole handoff without
    /// scraping native UI.
    private(set) var decodedCount = 0
    private(set) var droppedCount = 0
    var onDecodedShare: ((ShareMessage) -> Void)?
    var onPresentedShare: ((String) -> Void)?
    #endif

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName else { return }
        let body = message.body // plist values only — queue-hop safe
        shareQueue.async { [weak self] in
            guard let self else { return }
            guard let share = ShareMessage.decode(body) else {
                #if DEBUG
                self.droppedCount += 1
                #endif
                return // FR-011: malformed payloads drop silently
            }
            #if DEBUG
            self.decodedCount += 1
            self.onDecodedShare?(share)
            #endif
            self.present(share)
        }
    }

    /// Runs on shareQueue (the write must never block the UI/JS bridge).
    private func present(_ share: ShareMessage) {
        // Fresh per-share directory: two exports with the same timestamp
        // name never collide, and the sanitized leaf name stays the one
        // the share sheet displays/saves.
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ob-share-\(UUID().uuidString)", isDirectory: true)
        let file = dir.appendingPathComponent(share.name)
        do {
            try FileManager.default.createDirectory(at: dir,
                                                    withIntermediateDirectories: true)
            try share.data.write(to: file, options: .atomic)
        } catch {
            return // silent no-op law
        }
        presentSheet(for: file, cleaning: dir)
    }

    private func presentSheet(for file: URL, cleaning dir: URL) {
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.presenter,
                  // a share sheet (or any modal) already up: drop this
                  // handoff rather than fail silently mid-present, and
                  // clean the orphaned temp dir (review 2026-07)
                  presenter.presentedViewController == nil else {
                try? FileManager.default.removeItem(at: dir)
                return
            }
            let sheet = UIActivityViewController(activityItems: [file],
                                                 applicationActivities: nil)
            // iPad (TARGETED_DEVICE_FAMILY 1,2): popover anchor required.
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX,
                                            y: presenter.view.bounds.midY,
                                            width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            sheet.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: dir)
            }
            presenter.present(sheet, animated: true)
            #if DEBUG
            // presented stage (review F6): the sheet is actually up — the
            // seam can now claim end-to-end, not decode-only.
            self?.onPresentedShare?(file.lastPathComponent)
            #endif
        }
    }
}
