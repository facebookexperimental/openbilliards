// Copyright (c) Meta Platforms, Inc. and affiliates.

// BundleSchemeHandler — the WKURLSchemeTask adapter over ShellCore's
// SchemeResolver (feature 016 T006; contracts/shell-app.md 3, research
// R2/R4). Thin adapter: EVERY decidable behavior (path normalization,
// traversal rejection, MIME pairing, manifest membership) lives in
// ShellCore and is unit-gated there — this file owns only the
// WKURLSchemeTask plumbing.
//
// Task discipline (shell-app.md 3, normative):
// - Per task, strictly: didReceive(URLResponse) -> didReceive(Data)
//   (one shot, whole file) -> didFinish; on rejection didFailWithError
//   only.
// - A synchronized pending-task set: registered in webView(_:start:),
//   removed in webView(_:stop:) AND on completion; NO callback is ever
//   invoked on a task absent from the set — the
//   NSInternalInconsistencyException crash class (research R4) is
//   structurally impossible.
// - Responses carry Content-Length; custom schemes bypass the HTTP cache
//   so no caching headers are needed.
// - File reads are bundle-local, OFF the main thread; the handler never
//   touches the network (FR-001 — there is no network code path).
import Foundation
import WebKit
import ShellCore

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    /// The custom scheme (origin app://local — shell-app.md 1).
    static let scheme = "app"

    private let resolver: SchemeResolver
    /// Root of the synced verbatim game bundle (folder reference
    /// App/Resources/web — game-bundle.md 2).
    private let bundleRootURL: URL

    /// Pending-task set (shell-app.md 3). WKURLSchemeHandler callbacks
    /// arrive on the main thread, but the set is lock-guarded anyway so
    /// the discipline holds even if WebKit changes delivery queues.
    private let lock = NSLock()
    private var pendingTasks = Set<ObjectIdentifier>()

    /// Bundle-local file reads happen here, off the main thread
    /// (shell-app.md 3).
    private let readQueue = DispatchQueue(
        label: "org.openbilliards.bundle-scheme-read",
        qos: .userInitiated,
        attributes: .concurrent)

    init(resolver: SchemeResolver, bundleRootURL: URL) {
        self.resolver = resolver
        self.bundleRootURL = bundleRootURL
        super.init()
    }

    /// Recovery re-arm (shell-app.md 5): entering `recovering` clears any
    /// stale pending tasks so the reload starts from a clean set.
    func resetPendingTasks() {
        lock.lock()
        #if DEBUG && os(iOS)
        let dropped = logsTasks ? pendingTasks.count : 0
        #endif
        pendingTasks.removeAll()
        lock.unlock()
        #if DEBUG && os(iOS)
        if logsTasks { debugWrite("reset: \(dropped) pending task(s) dropped") }
        #endif
    }

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        register(urlSchemeTask)

        guard let url = urlSchemeTask.request.url else {
            #if DEBUG && os(iOS)
            if logsTasks { debugLog(urlSchemeTask, "start", "(no URL)") }
            #endif
            complete(urlSchemeTask, error: Self.error(for: .badURL))
            return
        }

        switch resolver.resolve(url) {
        case .rejected(let reason):
            #if DEBUG && os(iOS)
            if logsTasks {
                debugLog(urlSchemeTask, "start", "\(url.absoluteString) -> rejected (\(reason))")
            }
            #endif
            complete(urlSchemeTask, error: Self.error(for: reason))

        case .file(let relPath, let mime):
            #if DEBUG && os(iOS)
            if logsTasks {
                debugLog(urlSchemeTask, "start", "\(url.absoluteString) -> \(relPath) (\(mime))")
            }
            #endif
            // relPath is normalized and manifest-verified by ShellCore —
            // appending it to the bundle root cannot escape it.
            let fileURL = bundleRootURL.appendingPathComponent(relPath)
            readQueue.async { [weak self] in
                let data = try? Data(contentsOf: fileURL, options: .mappedIfSafe)
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard let data else {
                        // In the manifest but unreadable on disk: the
                        // build-phase verify gate should make this
                        // unreachable; fail the task, never crash.
                        self.complete(urlSchemeTask,
                                      error: Self.error(for: .notFound))
                        return
                    }
                    self.finish(urlSchemeTask, url: url, mime: mime, data: data)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        #if DEBUG && os(iOS)
        // A task that is no longer pending finished, failed or was dropped
        // by a reset (the reset line before it tells which).
        if logsTasks {
            debugLog(urlSchemeTask, "stop",
                     "\(urlSchemeTask.request.url?.absoluteString ?? "(no URL)") "
                     + (isPending(urlSchemeTask) ? "while pending" : "not pending"))
        }
        #endif
        // After this, no callback may touch the task (research R4).
        unregister(urlSchemeTask)
    }

    // MARK: - task completion (membership-guarded)

    /// Success path: response -> one-shot data -> finish, atomically on
    /// the main queue. webView(_:stop:) also runs on main, so membership
    /// checked at entry cannot be revoked mid-sequence.
    private func finish(_ task: WKURLSchemeTask, url: URL, mime: String, data: Data) {
        guard isPending(task) else {
            #if DEBUG && os(iOS)
            if logsTasks {
                debugLog(task, "finish", "dropped, no longer pending (\(data.count) B read)",
                         last: true)
            }
            #endif
            return
        }
        guard let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                // WebKit runs fetch()/module-script requests over custom
                // schemes through the CORS access check (the app://local
                // origin serializes opaquely there), so EVERY fetch —
                // including the game's own wasm fetch — fails with
                // "TypeError: Load failed" without this header. The shell
                // serves exactly one bundle-local origin and has no
                // network code path, so the wildcard grants nothing
                // beyond the bundle (T038 CI evidence: run 29132509800,
                // L1 testSchemeServedWasmMimeAndBytes).
                "Access-Control-Allow-Origin": "*",
            ]) else {
            complete(task, error: Self.error(for: .badURL))
            return
        }
        task.didReceive(response)
        task.didReceive(data) // one shot, whole file (shell-app.md 3)
        task.didFinish()
        unregister(task)
        #if DEBUG && os(iOS)
        if logsTasks { debugLog(task, "finish", "\(data.count) B", last: true) }
        #endif
    }

    /// Rejection path: didFailWithError only (shell-app.md 3).
    private func complete(_ task: WKURLSchemeTask, error: Error) {
        guard isPending(task) else {
            #if DEBUG && os(iOS)
            if logsTasks {
                debugLog(task, "fail", "dropped, no longer pending (\(Self.debugText(error)))",
                         last: true)
            }
            #endif
            return
        }
        task.didFailWithError(error)
        unregister(task)
        #if DEBUG && os(iOS)
        if logsTasks { debugLog(task, "fail", Self.debugText(error), last: true) }
        #endif
    }

    // MARK: - pending-task set

    private func register(_ task: WKURLSchemeTask) {
        lock.lock()
        pendingTasks.insert(ObjectIdentifier(task))
        lock.unlock()
    }

    private func unregister(_ task: WKURLSchemeTask) {
        lock.lock()
        pendingTasks.remove(ObjectIdentifier(task))
        lock.unlock()
    }

    private func isPending(_ task: WKURLSchemeTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return pendingTasks.contains(ObjectIdentifier(task))
    }

    // MARK: - errors

    /// 404-equivalent NSURLError mapping (research R4): rejections fail
    /// the request; they never surface as page-level exceptions.
    private static func error(for reason: RejectReason) -> Error {
        let code: Int
        switch reason {
        case .traversal, .notFound:
            code = NSURLErrorFileDoesNotExist
        case .badURL:
            code = NSURLErrorBadURL
        }
        return NSError(domain: NSURLErrorDomain, code: code, userInfo: nil)
    }

    #if DEBUG && os(iOS)
    // MARK: - dead-boot diagnostics (#1315; DEBUG builds on iOS only)

    // One log line per task event (start, finish, fail, stop) and per reset,
    // through NSLog like the shell's other "shell:" lines (standard error and
    // the unified log), so a dead boot's evidence shows whether the app://
    // subresource requests reached this handler and how each one ended.
    // Release builds and the macOS app (it compiles this file too) carry none
    // of it. Tasks are numbered per process; a number is released at the
    // task's last event.

    /// -OBDeadBootDiag YES (only L3 and the failure postmortem pass it).
    /// GameViewController sets it once, right after init and before any
    /// task. Off, no call above reaches the lines below and the handler
    /// runs as it did before #1315 (#1377: with them on the L2 path, the
    /// contentKill recovery test wedged in 2 of 13 walks).
    var logsTasks = false

    private let debugLock = NSLock()
    private var debugSeq = 0
    private var debugNumbers: [ObjectIdentifier: Int] = [:]

    private func debugLog(_ task: WKURLSchemeTask, _ event: String, _ detail: String,
                          last: Bool = false) {
        let id = ObjectIdentifier(task)
        debugLock.lock()
        var number = debugNumbers[id]
        if number == nil && event == "start" {
            debugSeq += 1
            number = debugSeq
            debugNumbers[id] = debugSeq
        }
        if last { debugNumbers[id] = nil }
        debugLock.unlock()
        debugWrite("#\(number.map { String($0) } ?? "?") \(event) \(detail)")
    }

    private func debugWrite(_ text: String) {
        NSLog("shell: scheme %@", text) // NSLog stamps the time; a URL never reaches the format
    }

    private static func debugText(_ error: Error) -> String {
        let e = error as NSError
        return "\(e.domain) \(e.code)"
    }
    #endif
}
