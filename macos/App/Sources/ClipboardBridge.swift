// Copyright (c) Meta Platforms, Inc. and affiliates.

// ClipboardBridge — navigator.clipboard.writeText → NSPasteboard user
// script (T015, lane S; the macos-shell contract §5 v1.1, research R11).
//
// ENGAGED AT BOOT since v1.1 (acceptance deviation D3, run-2026-07-17):
// under `app://local` the platform `navigator.clipboard.writeText` is
// PRESENT but REJECTS at runtime, so the v1.0 define-if-missing polyfill
// could never engage. The user script now covers both failure shapes:
//   - absent  → define-if-missing polyfill (the v1.0 arm, unchanged);
//   - present → wrap with a first-use rejection fallback: the platform
//     call runs first (it stays authoritative wherever it works); if it
//     rejects, the SAME call is retried through the bridge and every
//     later call goes straight to the bridge (present-but-broken is a
//     platform property of the origin, not of one call).
//
// Contract wire shape (WKScriptMessageHandlerWithReply, handler name
// `obClipboard`): request { "v": 1, "text": "<string>" } → native writes
// NSPasteboard.general (clearContents + setString) → the reply resolves
// the page promise on success, rejects on any validation failure
// (v != 1, missing/non-string text). The script touches no other
// surface and changes web/** by exactly zero bytes — share.js's existing
// try/catch + toasts are the UX (FR-010).
import AppKit
import WebKit

final class ClipboardBridge: NSObject {

    /// The contract handler name (the macos-shell contract §5).
    static let messageName = "obClipboard"

    /// The clipboard user script, injected at document start on the main
    /// frame only. Absent platform API → define-if-missing polyfill;
    /// present platform API → rejection-fallback wrapper (§5 v1.1).
    static func makeUserScript() -> WKUserScript {
        return WKUserScript(source: userScriptSource,
                            injectionTime: .atDocumentStart,
                            forMainFrameOnly: true)
    }

    /// Exposed for the hosted MacAppTests (T015 cases): the tests re-run
    /// this source over stubbed platform states on real WebKit.
    static let userScriptSource = """
        (function () {
          try {
            const bridgeWrite = function (text) {
              // WKScriptMessageHandlerWithReply: postMessage returns the
              // promise the native reply resolves/rejects.
              return window.webkit.messageHandlers.\(messageName)
                .postMessage({ v: 1, text: String(text) });
            };
            if (!(navigator.clipboard
                  && typeof navigator.clipboard.writeText === 'function')) {
              // v1.0 arm — platform API absent: define-if-missing.
              if (navigator.clipboard) {
                navigator.clipboard.writeText = bridgeWrite;
              } else {
                Object.defineProperty(navigator, 'clipboard', {
                  value: { writeText: bridgeWrite },
                  configurable: true,
                });
              }
              return;
            }
            // v1.1 arm — platform API present: first-use rejection
            // fallback (D3: present-but-rejecting under app://local).
            const platformWrite =
              navigator.clipboard.writeText.bind(navigator.clipboard);
            let rejected = false;
            navigator.clipboard.writeText = function (text) {
              if (rejected) return bridgeWrite(text);
              return platformWrite(String(text)).catch(function () {
                rejected = true;
                return bridgeWrite(text);
              });
            };
          } catch (e) { /* clipboard stays as-is: share.js toasts the failure */ }
        })();
        """

    /// Boot-time installation point (WebViewHost.makeConfiguration since
    /// v1.1): registers the reply handler and the user script on the
    /// configuration BEFORE any navigation.
    func install(into configuration: WKWebViewConfiguration) {
        configuration.userContentController.addScriptMessageHandler(
            self, contentWorld: .page, name: Self.messageName)
        configuration.userContentController.addUserScript(Self.makeUserScript())
    }
}

// MARK: - WKScriptMessageHandlerWithReply

extension ClipboardBridge: WKScriptMessageHandlerWithReply {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        // Validation law (the macos-shell contract §5): v == 1 and a
        // string text, else the promise rejects. The rejection string is
        // developer-facing diagnostics (surfaced only through share.js's
        // existing try/catch), not UI copy.
        guard let body = message.body as? [String: Any],
              body["v"] as? Int == 1,
              let text = body["text"] as? String else {
            replyHandler(nil, "obClipboard: invalid message (want {v:1, text:string})")
            return
        }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        guard pasteboard.setString(text, forType: .string) else {
            replyHandler(nil, "obClipboard: pasteboard write failed")
            return
        }
        replyHandler(nil, nil) // resolve
    }
}
