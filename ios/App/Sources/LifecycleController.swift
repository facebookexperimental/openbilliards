// Copyright (c) Meta Platforms, Inc. and affiliates.

// LifecycleController — the adapter between UIKit/WebKit lifecycle
// callbacks and ShellCore's LifecycleMachine (feature 016 T015;
// contracts/shell-app.md 5, data-model.md 5, research R7/R10). All
// transition DECISIONS live in the machine (unit-gated); this file only
// translates callbacks to events and dispatches the returned effects.
//
// Settings durability (research R7):
// - sceneDidEnterBackground -> evaluateJavaScript read of
//   localStorage['ob-settings-v1'] -> SettingsSnapshot -> UserDefaults
//   key shell.settings.snapshot. Best-effort: failures are logged,
//   NEVER fatal.
// - At-document-start WKUserScript on every navigation restores ONLY
//   when absent — localStorage stays authoritative while alive. The
//   script is registered before any navigation (GameViewController
//   config) and refreshed on every reload (performReload).
//
// Recovery (shell-app.md 5, research R10):
// - webViewWebContentProcessDidTerminate -> .contentProcessTerminated ->
//   reload() <= 2 automatic attempts -> RecoverySurface; recovering
//   re-arms the scheme-handler pending-task set (host.performReload).
//   A death before the first didFinish (.launching) opens the same
//   episode (GH-1045).
// - NO shell-side pause/clamp injection: the game's own frame-loop
//   dt = min(0.1, wallDelta) clamp is the resume mechanism; the shell
//   only verifies it (L3).
import Foundation
import WebKit
import ShellCore

/// What the lifecycle effects need from the hosting VC.
protocol LifecycleHost: AnyObject {
    var hostedWebView: WKWebView? { get }
    func performReload()
    func presentRecoverySurface()
    func dismissRecoverySurface()
}

#if DEBUG
/// -OBInjectFailure kinds (shell-app.md 1; L2/L3 recovery tests).
enum FailureInjection: String {
    /// Simulate a content-process death after every load completion
    /// (and suppress the success signal), so the machine walks
    /// kill -> reload x2 -> terminal failed: three kill events total —
    /// the ComponentTree "contentKill x3" recovery-surface path.
    case contentKill
    /// Simulate reload failure: the first load triggers one death, and
    /// every subsequent reload request fails instead of navigating.
    case reloadFail
    /// Simulate exactly ONE content-process death after the first load
    /// completion; every later completion behaves like the uninjected
    /// world, so the machine walks kill -> reload (attempt 1) ->
    /// reloadSucceeded -> interactive with NO recovery surface — the
    /// successful-auto-recovery path (SC-006; L3 lifecycle
    /// kill-recovery + the L4 `background-resume/recovered`
    /// expectation). Added 2026-07-11 as the recorded honest fix from
    /// the T034 local acceptance run: under `contentKill` the kill
    /// repeats after EVERY load, so the frozen `recovered` expectation
    /// (no recovery surface) was unreachable by design.
    case killOnce
    /// GH-1045: simulate ONE content-process death on the boot
    /// navigation's first commit, BEFORE any load completion (the machine
    /// is still in .launching). Later navigations take the uninjected
    /// path, so the automatic reload reaches the game.
    case contentKillBeforeReady
    /// GH-1045: simulate a content-process death on EVERY commit and
    /// suppress every completion, so no boot attempt ever finishes: the
    /// machine walks launch kill -> reload x2 -> terminal failed ->
    /// recovery surface (never a permanently blank window).
    case contentKillBeforeReadyAlways
    /// GH-1045: simulate ONE death when the boot navigation STARTS, before
    /// anything commits: the in-flight load is dropped (as WebKit drops a
    /// dead process's navigations) and no history item exists, so the
    /// recovery reload must load the boot document — reload() would have
    /// nothing to reload.
    case contentKillBeforeCommit
    /// GH-1073: the boot navigation is dropped when it STARTS and nothing
    /// reports it (no termination, no commit) — only the first-commit
    /// watchdog can notice; it must open the recovery episode.
    case stallBeforeCommit
    /// GH-1023 (review s3 P2-2): simulate a death when each of the first
    /// TWO navigations starts, before anything commits — a cold replay
    /// boot and its first automatic reload both die, so only the second
    /// reload lands; the replay target must survive both.
    case contentKillBeforeCommitTwice
}
#endif

final class LifecycleController {

    /// UserDefaults key for the snapshot record (shell-app.md 5).
    static let snapshotDefaultsKey = "shell.settings.snapshot"
    /// The game's settings key in localStorage (research R7).
    static let settingsStorageKey = "ob-settings-v1"

    private weak var host: LifecycleHost?
    private var machine = LifecycleMachine()
    /// Set when a .reloadWebView effect was dispatched: the next
    /// navigation outcome reports reloadSucceeded/reloadFailed instead of
    /// webContentReady (the machine tolerates either — unit-gated).
    private var expectingReload = false
    /// GH-1073: the first-commit watchdog (decisions in ShellCore
    /// CommitWatchdog; this adapter owns its timers and the page ping).
    /// Internal so the hosted arms can shorten the deadline.
    var watchdog = CommitWatchdog()

    #if DEBUG
    var failureInjection: FailureInjection?
    private var reportedReadyOnce = false
    private var injectedBeforeReady = false
    private var killsBeforeCommit = 0
    /// Dead verdicts the watchdog reached, by reason (hosted-arm
    /// diagnostics).
    private(set) var watchdogVerdicts: [CommitWatchdog.Reason] = []
    /// Hosted-arm seam: this many next pings are never sent, so they
    /// never answer (the measured silent-death signature).
    var debugSwallowPings = 0
    #endif

    init(host: LifecycleHost) {
        self.host = host
    }

    // MARK: - events in (adapter surface)

    func markLaunched() {
        dispatch(machine.handle(.didFinishLaunch))
    }

    /// A main-frame navigation started (nothing committed yet). No machine
    /// event; DEBUG builds hang the before-commit injection here (GH-1045).
    func navigationDidStartProvisional() {
        watchdog.provisionalStarted() // GH-1073: its content process is up
        #if DEBUG
        if failureInjection == .contentKillBeforeCommit, !injectedBeforeReady {
            injectedBeforeReady = true
            host?.hostedWebView?.stopLoading()
            contentProcessDidTerminate()
        }
        if failureInjection == .stallBeforeCommit, !injectedBeforeReady {
            injectedBeforeReady = true
            host?.hostedWebView?.stopLoading() // and report nothing
        }
        if failureInjection == .contentKillBeforeCommitTwice, killsBeforeCommit < 2 {
            killsBeforeCommit += 1
            host?.hostedWebView?.stopLoading()
            contentProcessDidTerminate()
        }
        #endif
    }

    /// GH-1073: the host issued a navigation (boot, recovery reload) —
    /// watch for its commit.
    func navigationIssued() {
        runWatchdog(watchdog.navigationIssued())
    }

    /// The main-frame navigation committed. No machine event (readiness
    /// is the completion); DEBUG builds hang the before-ready failure
    /// injections here (GH-1045).
    func navigationDidCommit() {
        watchdog.committed()
        #if DEBUG
        if let injection = failureInjection {
            injectOnCommit(injection)
        }
        #endif
    }

    func navigationDidFinish() {
        #if DEBUG
        if let injection = failureInjection,
           injectOnLoadCompletion(injection) {
            return
        }
        #endif
        if expectingReload {
            expectingReload = false
            dispatch(machine.handle(.reloadSucceeded))
        } else {
            dispatch(machine.handle(.webContentReady))
        }
    }

    func navigationDidFail(_ error: Error) {
        // GH-1073: a CANCELLED navigation is not a failed reload — the
        // watchdog's stopLoading (and any superseded load) reports
        // NSURLErrorCancelled, possibly after the recovery reload already
        // started; counting it would burn a second automatic attempt.
        if (error as NSError).domain == NSURLErrorDomain,
           (error as NSError).code == NSURLErrorCancelled {
            return
        }
        if expectingReload {
            expectingReload = false
            dispatch(machine.handle(.reloadFailed))
        }
        // A failed non-reload navigation on a bundle-local origin means a
        // broken bundle; the build-phase verify gate makes it
        // unreachable — nothing sensible to do beyond not crashing.
    }

    func sceneDidEnterBackground() {
        // GH-1073: a suspended app's watchdog clock keeps running while
        // nothing in the page can — pause the watch until foreground.
        watchdog.suspended()
        dispatch(machine.handle(.didEnterBackground))
    }

    func sceneWillEnterForeground() {
        dispatch(machine.handle(.willEnterForeground))
        runWatchdog(watchdog.resumed())
    }

    func contentProcessDidTerminate() {
        dispatch(machine.handle(.contentProcessTerminated))
    }

    func userRetryRequested() {
        dispatch(machine.handle(.userRetry))
    }

    // MARK: - effects out

    private func dispatch(_ effects: [ShellEffect]) {
        for effect in effects {
            switch effect {
            case .snapshotSettings:
                snapshotSettings()
            case .reloadWebView:
                expectingReload = true
                #if DEBUG
                if failureInjection == .reloadFail {
                    // The injected world: the reload request itself
                    // fails — walk the machine's failure path instead of
                    // navigating (deterministic L2 escalation).
                    expectingReload = false
                    dispatch(machine.handle(.reloadFailed))
                    continue
                }
                #endif
                host?.performReload()
                navigationIssued()
            case .showRecovery:
                host?.presentRecoverySurface()
            case .none:
                continue
            }
        }
    }

    // MARK: - first-commit watchdog (GH-1073)

    /// Carries out the CommitWatchdog's effects. A dead verdict stops the
    /// stuck load and reports a content-process termination, so the shared
    /// machine's recovery edges run (reload ≤ 2, then the surface).
    private func runWatchdog(_ effects: [CommitWatchdog.Effect]) {
        for effect in effects {
            switch effect {
            case .scheduleDeadline(let epoch, let after):
                DispatchQueue.main.asyncAfter(deadline: .now() + after) { [weak self] in
                    guard let self else { return }
                    let loading = self.host?.hostedWebView?.isLoading ?? false
                    self.runWatchdog(self.watchdog.deadlineElapsed(epoch: epoch, isLoading: loading))
                }
            case .ping(let epoch, let bound):
                // Any completion — a value or a script error — proves the
                // content process is alive; a silently dead one never
                // completes (measured, GH-1073).
                #if DEBUG
                let swallow = debugSwallowPings > 0
                if swallow { debugSwallowPings -= 1 }
                #else
                let swallow = false
                #endif
                if !swallow {
                    host?.hostedWebView?.evaluateJavaScript("0") { [weak self] _, _ in
                        guard let self else { return }
                        self.runWatchdog(self.watchdog.pingAnswered(epoch: epoch))
                    }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + bound) { [weak self] in
                    guard let self else { return }
                    self.runWatchdog(self.watchdog.pingBoundElapsed(epoch: epoch))
                }
            case .declareDead(let reason):
                NSLog("shell: a navigation never committed (first-commit watchdog, %@) — treating it as a content-process death",
                      String(describing: reason))
                #if DEBUG
                watchdogVerdicts.append(reason)
                #endif
                host?.hostedWebView?.stopLoading()
                contentProcessDidTerminate()
            }
        }
    }

    // MARK: - settings snapshot (research R7)

    /// Best-effort read of the game's settings string into UserDefaults.
    /// Every failure path is silent-but-logged: the snapshot is a safety
    /// net, never a crash source (shell-app.md 5).
    private func snapshotSettings() {
        guard let webView = host?.hostedWebView else { return }
        let js = "window.localStorage.getItem('\(Self.settingsStorageKey)')"
        webView.evaluateJavaScript(js) { result, error in
            if let error {
                NSLog("shell: settings snapshot read failed (non-fatal): %@",
                      String(describing: error))
                return
            }
            guard let payload = result as? String else { return } // absent: nothing to snapshot
            let snapshot = SettingsSnapshot(
                payload: payload,
                takenAt: Date(),
                appVersion: Bundle.main.object(
                    forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601 // codec discipline (SettingsSnapshot.swift)
            guard let data = try? encoder.encode(snapshot) else {
                NSLog("shell: settings snapshot encode failed (non-fatal)")
                return
            }
            UserDefaults.standard.set(data, forKey: Self.snapshotDefaultsKey)
        }
    }

    /// The at-document-start restore-if-absent script (research R7):
    /// writes the snapshot back ONLY when localStorage has no value —
    /// localStorage stays authoritative while alive. Returns nil when no
    /// snapshot exists (first run).
    static func makeRestoreUserScript() -> WKUserScript? {
        guard let data = UserDefaults.standard.data(forKey: snapshotDefaultsKey) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let snapshot = try? decoder.decode(SettingsSnapshot.self, from: data) else {
            return nil
        }
        // JSON-encode the payload into a JS string literal (handles
        // quotes/unicode/newlines safely).
        guard let literalData = try? JSONSerialization.data(
            withJSONObject: snapshot.payload, options: .fragmentsAllowed),
            let literal = String(data: literalData, encoding: .utf8) else {
            return nil
        }
        let source = """
        (function () {
          try {
            if (window.localStorage.getItem('\(settingsStorageKey)') === null) {
              window.localStorage.setItem('\(settingsStorageKey)', \(literal));
            }
          } catch (e) { /* storage unavailable: the game falls back to defaults */ }
        })();
        """
        return WKUserScript(source: source,
                            injectionTime: .atDocumentStart,
                            forMainFrameOnly: true)
    }

    // MARK: - DEBUG failure injection (shell-app.md 1)

    #if DEBUG
    /// contentKill: first completion reports readiness, then EVERY
    /// completion simulates a content-process death through the same
    /// entry the real WKNavigationDelegate callback uses. The machine
    /// walks: kill#1 -> reload (attempt 1) -> kill#2 -> reload (attempt
    /// 2, the cap) -> kill#3 -> terminal failed + recovery surface.
    /// Returns true when the injection consumed the completion (the
    /// uninjected readiness path must not run).
    private func injectOnLoadCompletion(_ injection: FailureInjection) -> Bool {
        switch injection {
        case .contentKill:
            if !reportedReadyOnce {
                reportedReadyOnce = true
                dispatch(machine.handle(.webContentReady))
            }
            expectingReload = false
            contentProcessDidTerminate()
            return true
        case .reloadFail:
            // One real kill after first readiness; the escalation runs
            // inside dispatch (.reloadWebView is intercepted above).
            if !reportedReadyOnce {
                reportedReadyOnce = true
                dispatch(machine.handle(.webContentReady))
                contentProcessDidTerminate()
            }
            return true
        case .contentKillBeforeReady, .contentKillBeforeCommit, .stallBeforeCommit,
             .contentKillBeforeCommitTwice:
            // The death already happened (at commit / at start); the
            // reload's completion is the uninjected readiness signal.
            return false
        case .contentKillBeforeReadyAlways:
            // Every attempt died at commit: nothing ever finishes (a
            // reload superseding a committed navigation reports no
            // completion for it, so only the last attempt lands here).
            return true
        case .killOnce:
            // Exactly one simulated death after the first readiness;
            // afterwards completions take the uninjected path, so the
            // machine's automatic reload SUCCEEDS (recovering ->
            // interactive, no recovery surface).
            if !reportedReadyOnce {
                reportedReadyOnce = true
                dispatch(machine.handle(.webContentReady))
                expectingReload = false
                contentProcessDidTerminate()
            } else if expectingReload {
                expectingReload = false
                dispatch(machine.handle(.reloadSucceeded))
            } else {
                dispatch(machine.handle(.webContentReady))
            }
            return true
        }
    }

    /// GH-1045: the before-ready kinds die on commit, while the machine
    /// has seen no readiness yet — the window a web-content jetsam during
    /// a memory-heavy boot lands in. The death goes through the same
    /// entry the real WKNavigationDelegate callback uses.
    private func injectOnCommit(_ injection: FailureInjection) {
        switch injection {
        case .contentKillBeforeReady:
            guard !injectedBeforeReady else { return }
            injectedBeforeReady = true
            contentProcessDidTerminate()
        case .contentKillBeforeReadyAlways:
            contentProcessDidTerminate()
        case .contentKill, .reloadFail, .killOnce, .contentKillBeforeCommit,
             .stallBeforeCommit, .contentKillBeforeCommitTwice:
            return
        }
    }
    #endif
}
