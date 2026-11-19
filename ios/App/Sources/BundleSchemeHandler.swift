// Copyright (c) Meta Platforms, Inc. and affiliates.

// BundleSchemeHandler — the WKURLSchemeTask adapter over ShellCore's
// SchemeResolver (feature 016 T006; the shell-app contract 3, research
// R2/R4). Thin adapter: EVERY decidable behavior (path normalization,
// traversal rejection, MIME pairing, manifest membership) lives in
// ShellCore and is unit-gated there — this file owns only the
// WKURLSchemeTask plumbing.
//
// Task discipline (shell-app contract 3, normative):
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
    /// The custom scheme (origin app://local — shell-app contract 1).
    static let scheme = "app"

    private let resolver: SchemeResolver
    /// Root of the synced verbatim game bundle (folder reference
    /// App/Resources/web — game-bundle contract 2).
    private let bundleRootURL: URL

    /// Pending-task set (shell-app contract 3). WKURLSchemeHandler callbacks
    /// arrive on the main thread, but the set is lock-guarded anyway so
    /// the discipline holds even if WebKit changes delivery queues.
    private let lock = NSLock()
    private var pendingTasks = Set<ObjectIdentifier>()

    /// Bundle-local file reads happen here, off the main thread
    /// (shell-app contract 3).
    private let readQueue = DispatchQueue(
        label: "org.openbilliards.bundle-scheme-read",
        qos: .userInitiated,
        attributes: .concurrent)

    init(resolver: SchemeResolver, bundleRootURL: URL) {
        self.resolver = resolver
        self.bundleRootURL = bundleRootURL
        super.init()
    }

    /// Recovery re-arm (shell-app contract 5): entering `recovering` clears any
    /// stale pending tasks so the reload starts from a clean set.
    func resetPendingTasks() {
        lock.lock()
        pendingTasks.removeAll()
        lock.unlock()
    }

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        register(urlSchemeTask)

        guard let url = urlSchemeTask.request.url else {
            complete(urlSchemeTask, error: Self.error(for: .badURL))
            return
        }

        switch resolver.resolve(url) {
        case .rejected(let reason):
            complete(urlSchemeTask, error: Self.error(for: reason))

        case .file(let relPath, let mime):
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
        // After this, no callback may touch the task (research R4).
        unregister(urlSchemeTask)
    }

    // MARK: - task completion (membership-guarded)

    /// Success path: response -> one-shot data -> finish, atomically on
    /// the main queue. webView(_:stop:) also runs on main, so membership
    /// checked at entry cannot be revoked mid-sequence.
    private func finish(_ task: WKURLSchemeTask, url: URL, mime: String, data: Data) {
        guard isPending(task) else { return }
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
        task.didReceive(data) // one shot, whole file (shell-app contract 3)
        task.didFinish()
        unregister(task)
    }

    /// Rejection path: didFailWithError only (shell-app contract 3).
    private func complete(_ task: WKURLSchemeTask, error: Error) {
        guard isPending(task) else { return }
        task.didFailWithError(error)
        unregister(task)
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
}
