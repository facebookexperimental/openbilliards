// Copyright (c) Meta Platforms, Inc. and affiliates.

// HoldingSchemeHandler — DEBUG-only hosted-arm seam (GH-1073). Wraps the
// SHARED BundleSchemeHandler (unedited) and parks the FIRST boot-document
// task without answering it, so the boot navigation stays provisional and
// loading — the state a content process WebKit never reports dead leaves
// behind — until release() hands the task to the real handler. Every other
// task passes straight through. Release builds never contain this type.
#if DEBUG
import WebKit

final class HoldingSchemeHandler: NSObject, WKURLSchemeHandler {

    private let inner: BundleSchemeHandler
    private var holdNext = true
    private var held: (webView: WKWebView, task: WKURLSchemeTask)?

    init(inner: BundleSchemeHandler) {
        self.inner = inner
    }

    /// The boot document is parked right now.
    var isHolding: Bool { held != nil }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        if holdNext, urlSchemeTask.request.url?.path == "/app.html" {
            holdNext = false
            held = (webView, urlSchemeTask)
            return
        }
        inner.webView(webView, start: urlSchemeTask)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        if let parked = held, parked.task === urlSchemeTask {
            held = nil // WebKit dropped it: it must never be answered now
            return
        }
        inner.webView(webView, stop: urlSchemeTask)
    }

    /// Serve the parked boot document now (a slow boot that does finish).
    func release() {
        guard let parked = held else { return }
        held = nil
        inner.webView(parked.webView, start: parked.task)
    }
}
#endif
