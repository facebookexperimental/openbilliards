// Copyright (c) Meta Platforms, Inc. and affiliates.

// DownloadController — the WKDownload adapter (the downloads contract §2
// normative flow): navigation download policy via
// MacShellCore.DownloadRouter, WKDownloadDelegate, ONE NSSavePanel per
// route with the game's suggested filename verbatim, user-selected
// Powerbox grant as the only write permission, silent cancel,
// temporary-file cleanup on every failure/terminate/eject path.
// T017 (lane D). Unit-gated by MacAppTests/DownloadAdapterTests (T018)
// through the DEBUG scripted seams — no real NSSavePanel in unit runs
// (downloads contract §5).
//
// All state is main-thread confined: WebKit delivers navigation and
// WKDownloadDelegate callbacks on the main thread, and the seams are
// exercised synchronously from the main test thread.
import AppKit
import WebKit
import MacShellCore

final class DownloadController: NSObject {

    // MARK: - Seams (real by default; DEBUG-scripted in unit runs)

    /// Presents the save panel for one route and calls back with the
    /// chosen URL, or nil when the user cancelled.
    typealias PanelPresenter = (_ suggestedFilename: String,
                                _ completion: @escaping (URL?) -> Void) -> Void

    private lazy var presentPanel: PanelPresenter = { [weak self] name, completion in
        self?.presentSavePanel(suggestedFilename: name, completion: completion)
    }
    private var fileExists: (URL) -> Bool = {
        FileManager.default.fileExists(atPath: $0.path)
    }
    private var removeItem: (URL) throws -> Void = {
        try FileManager.default.removeItem(at: $0)
    }
    private lazy var presentFailure: () -> Void = { [weak self] in
        self?.presentFailureAlert()
    }

    #if DEBUG
    // Scripted-seam injection (downloads contract §5): panel result forced to
    // cancel / fresh path / existing path; filesystem + failure surface
    // observed without touching disk or UI. DEBUG-only by contract.
    func scriptPanel(_ presenter: @escaping PanelPresenter) { presentPanel = presenter }
    func scriptFileExists(_ check: @escaping (URL) -> Bool) { fileExists = check }
    func scriptRemoveItem(_ remove: @escaping (URL) throws -> Void) { removeItem = remove }
    func scriptFailureSurface(_ surface: @escaping () -> Void) { presentFailure = surface }
    #endif

    // MARK: - Route state (concurrent routes are independent — keyed)

    /// The window save panels and failure alerts anchor to (the game
    /// window). Set by the boot wiring; nil falls back to app-modal.
    weak var anchorWindow: NSWindow?

    private var pendingPanels: Set<AnyHashable> = []
    private var destinations: [AnyHashable: URL] = [:]
    private var liveDownloads: [AnyHashable: WKDownload] = [:]

    // MARK: - Navigation download policy (downloads contract §2.1)

    /// Maps the router's frozen policy law onto WebKit's action policy.
    /// Lane S's navigation delegate consults this from
    /// `webView(_:decidePolicyFor:navigationAction:preferences:)`.
    static func actionPolicy(shouldPerformDownload: Bool,
                             isMainFrame: Bool,
                             scheme: String?) -> WKNavigationActionPolicy {
        switch DownloadRouter.policy(shouldPerformDownload: shouldPerformDownload,
                                     isMainFrame: isMainFrame,
                                     scheme: scheme) {
        case .download: return .download
        case .allow: return .allow
        case .cancel: return .cancel
        }
    }

    /// Convenience over the live navigation action (blob-anchor
    /// `shouldPerformDownload` is the primary route — downloads contract §4).
    func navigationActionPolicy(for action: WKNavigationAction) -> WKNavigationActionPolicy {
        Self.actionPolicy(shouldPerformDownload: action.shouldPerformDownload,
                          isMainFrame: action.targetFrame?.isMainFrame ?? true,
                          scheme: action.request.url?.scheme)
    }

    /// Fallback 1 of the FROZEN ladder (downloads contract §4): the
    /// response-side rung, consulted from
    /// `webView(_:decidePolicyFor:navigationResponse:)` ONLY if the
    /// Wave-2 register (T025) finds the action-side hook missing —
    /// engaging it is a recorded deviation, never silent. A response
    /// WebKit cannot show routes to WKDownload; showable responses ride
    /// the same scheme belt as actions. (Fallback 2 — a web-visible
    /// seam — is NOT authored, per contract.)
    static func responsePolicy(canShowMIMEType: Bool,
                               isMainFrame: Bool,
                               scheme: String?) -> WKNavigationResponsePolicy {
        if !canShowMIMEType { return .download }
        switch DownloadRouter.policy(shouldPerformDownload: false,
                                     isMainFrame: isMainFrame,
                                     scheme: scheme) {
        case .download: return .download
        case .allow: return .allow
        case .cancel: return .cancel
        }
    }

    /// Wires one WKDownload onto this controller (downloads contract §2.2) —
    /// called from `webView(_:navigationAction:didBecomeDownload:)`
    /// (and the response-side twin if fallback 1 ever engages).
    func attach(to download: WKDownload) {
        download.delegate = self
        liveDownloads[routeKey(for: download)] = download
    }

    // MARK: - Route core (WKDownload-free so unit runs can drive it)

    /// §2.3: ONE panel per route, suggested filename verbatim (extension
    /// preserved), then the router's directives executed in order —
    /// pre-delete strictly before handing WKDownload the destination.
    /// `completion` is the WKDownload destination completion handler:
    /// nil = discard (silent cancel), URL = stream to it.
    func decideDestination(routeKey: AnyHashable,
                           suggestedFilename: String,
                           completion: @escaping (URL?) -> Void) {
        guard pendingPanels.insert(routeKey).inserted else {
            // One panel per route (route law): a second destination ask
            // on a route whose panel is still up is refused outright.
            completion(nil)
            return
        }
        presentPanel(suggestedFilename) { [weak self] chosen in
            guard let self else {
                completion(nil)
                return
            }
            self.pendingPanels.remove(routeKey)
            let directives = DownloadRouter.destinationDirectives(
                choseDestination: chosen != nil,
                fileExists: chosen.map { self.fileExists($0) } ?? false)
            self.perform(directives, routeKey: routeKey,
                         destination: chosen, completion: completion)
        }
    }

    private func perform(_ directives: [DownloadDirective],
                         routeKey: AnyHashable,
                         destination: URL?,
                         completion: (URL?) -> Void) {
        for directive in directives {
            switch directive {
            case .cancel:
                // Silent (route law): no file anywhere, no dialog, the
                // page stays interactive — WKDownload discards on nil.
                destinations[routeKey] = nil
                liveDownloads[routeKey] = nil
                completion(nil)
                return
            case .removeExisting:
                // Consent came from the panel's standard replace flow —
                // the ONLY consent surface (route law). WKDownload
                // refuses to overwrite, so pre-delete first; if this
                // fails the download fails and §2.5 cleans up.
                if let url = destination { try? removeItem(url) }
            case .setDestination:
                guard let url = destination else {
                    completion(nil)
                    return
                }
                destinations[routeKey] = url
                completion(url)
                return
            }
        }
    }

    /// §2.4: route closed — the file exists at the chosen path ONLY.
    func routeDidFinish(routeKey: AnyHashable) {
        destinations[routeKey] = nil
        liveDownloads[routeKey] = nil
    }

    /// §2.5: failure (incl. volume eject / write failure mid-stream) —
    /// delete any partial file at the destination, show the localized
    /// failure surface, never a crash, never a wedged page.
    func routeDidFail(routeKey: AnyHashable) {
        removePartial(routeKey: routeKey)
        presentFailure()
    }

    /// Quit-during-write (route law): cancel in-flight WKDownloads and
    /// delete partials — a relaunch finds no orphans. Wired from
    /// `applicationWillTerminate` (and window close → quit).
    func cancelAllRoutesForTermination() {
        for download in liveDownloads.values {
            download.cancel { _ in }
        }
        for key in Array(destinations.keys) {
            removePartial(routeKey: key)
        }
        pendingPanels.removeAll()
        liveDownloads.removeAll()
    }

    private func removePartial(routeKey: AnyHashable) {
        if let url = destinations.removeValue(forKey: routeKey),
           fileExists(url) {
            try? removeItem(url)
        }
        liveDownloads[routeKey] = nil
        pendingPanels.remove(routeKey)
    }

    private func routeKey(for download: WKDownload) -> AnyHashable {
        ObjectIdentifier(download)
    }

    // MARK: - Real surfaces (never reached by unit runs)

    private func presentSavePanel(suggestedFilename: String,
                                  completion: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        // Verbatim passthrough (route law: no path invention) — and no
        // allowedContentTypes, so the anchor's extension is preserved.
        panel.nameFieldStringValue = suggestedFilename
        panel.isExtensionHidden = false
        panel.canCreateDirectories = true
        if let window = anchorWindow {
            panel.beginSheetModal(for: window) { response in
                completion(response == .OK ? panel.url : nil)
            }
        } else {
            let response = panel.runModal()
            completion(response == .OK ? panel.url : nil)
        }
    }

    private func presentFailureAlert() {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = NSLocalizedString(
            "shell.download.failed.title",
            comment: "Title of the download-failure alert")
        alert.informativeText = NSLocalizedString(
            "shell.download.failed.body",
            comment: "Body of the download-failure alert")
        if let window = anchorWindow {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }
}

// MARK: - WKDownloadDelegate (downloads contract §2.2–§2.5)

extension DownloadController: WKDownloadDelegate {

    func download(_ download: WKDownload,
                  decideDestinationUsing response: URLResponse,
                  suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        decideDestination(routeKey: routeKey(for: download),
                          suggestedFilename: suggestedFilename,
                          completion: completionHandler)
    }

    func downloadDidFinish(_ download: WKDownload) {
        routeDidFinish(routeKey: routeKey(for: download))
    }

    func download(_ download: WKDownload,
                  didFailWithError error: Error,
                  resumeData: Data?) {
        routeDidFail(routeKey: routeKey(for: download))
    }
}
