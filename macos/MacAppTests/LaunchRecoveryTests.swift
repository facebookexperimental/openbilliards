// Copyright (c) Meta Platforms, Inc. and affiliates.

// LaunchRecoveryTests.swift — GH-1045 hosted MacAppTests arm: a web-
// content process death BEFORE the boot page's first didFinish must open
// the shared recovery episode (contracts/macos-shell.md §6: ≤ 2 automatic
// reloads, then the native recovery surface), never leave a permanently
// blank window. Before the fix the shared LifecycleMachine treated
// (.launching, .contentProcessTerminated) as an illegal pair: the event
// was recorded on lastError and swallowed, so no reload was ever issued.
//
// Each case drives a REAL WebViewHost (production configuration: shared
// scheme handler, user scripts, navigation delegate) + LifecycleController
// inside the hosted app process, booting the unstamped app://local/app.html:
//
//   1. contentKillBeforeReady — one simulated death on the boot
//      navigation's first commit (machine still .launching): exactly one
//      automatic reload, then readiness; no recovery surface.
//   2. contentKillBeforeReadyAlways — every attempt dies on commit:
//      reload, reload, then the recovery surface (the terminal state is
//      the surface, not a blank view).
//   3. contentKillBeforeCommit — one simulated death when the boot
//      navigation STARTS (the in-flight load dropped, nothing committed,
//      no history item): the recovery reload must load the boot document
//      and reach readiness on the live page — a reload() would have
//      nothing to reload.
//
//   4. stallBeforeCommit (GH-1073) — the boot navigation is dropped when
//      it starts and NOTHING is reported (no termination, no commit): only
//      the first-commit watchdog can notice (not-loading verdict), and it
//      must open the same recovery episode;
//   5. a slow but ALIVE boot (GH-1073 hard requirement) — the boot document
//      is held unanswered, so the page stays loading for more than one full
//      ping bound after the first ping while answering every ping (a ping
//      completion must reach the watchdog): no verdict, ever; released, it
//      boots;
//   6. the measured silent death (GH-1073) — the boot document is held
//      (still loading, nothing commits) AND the ping never answers: the
//      ping-bound verdict opens the recovery episode and the reload boots.
//
//   7. a warm replay navigation that stalls before its commit (GH-1023,
//      review s3 P2-1) — openReplay arms the first-commit watchdog like a
//      boot: the not-loading verdict opens the recovery episode and the
//      reload lands on the replay, not on the old document;
//   8. two deaths before commit on a cold replay boot (GH-1023, review s3
//      P2-2) — the boot and its first automatic reload both die as they
//      start: the replay target survives both, and the second reload
//      lands on the replay, never on the plain boot document.
//
// (A REAL content-process kill is not reachable from this hosted process:
// WebKit's testing SPI fails with "Could not signal service
// com.apple.WebKit.WebContent: Operation not permitted" under the app's
// hardened runtime, so the arms go through the same entry the real
// WKNavigationDelegate termination callback uses.)
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`.

import XCTest
import WebKit
import ShellCore
@testable import OpenBilliards

final class LaunchRecoveryTests: XCTestCase {

  /// Generous: the hosted app boots its own game window beside the host
  /// built here, and a full game boot is wasm + module graph.
  private static let bootBudget: TimeInterval = 240

  // MARK: - fixture

  private struct Booted {
    let host: WebViewHost
    let lifecycle: LifecycleController
  }

  /// The MacAppDelegate wiring, minus the window: host + adapter, the
  /// launch event, then the unstamped boot navigation.
  @MainActor
  private func boot(injection: FailureInjection?,
                    watchdog: CommitWatchdog? = nil,
                    holdBootDocument: Bool = false,
                    replay: URL? = nil) -> Booted {
    WebViewHost.debugHoldFirstBootDocument = holdBootDocument
    let host = WebViewHost()
    WebViewHost.debugHoldFirstBootDocument = false
    let lifecycle = LifecycleController(host: host)
    lifecycle.failureInjection = injection
    if let watchdog { lifecycle.watchdog = watchdog }
    host.lifecycle = lifecycle
    lifecycle.markLaunched()
    host.boot(replay: replay)
    return Booted(host: host, lifecycle: lifecycle)
  }

  @MainActor
  private func recoverySurfaceShown(_ host: WebViewHost) -> Bool {
    host.containerView.subviews.contains {
      $0.accessibilityIdentifier() == "shell.recovery.surface"
    }
  }

  /// Bounded poll on the main actor; returns whether `condition` held.
  @MainActor
  private func waitUntil(_ timeout: TimeInterval,
                         _ condition: () -> Bool) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if condition() { return true }
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
    return condition()
  }

  /// The page itself is alive and fully loaded on the boot document (the
  /// "hall reached" half of the acceptance: a live web area, not a blank).
  /// Polled briefly: the JS bridge answers a beat after didFinish under
  /// load. Returns nil when live, else what the page reported.
  @MainActor
  private func pageNotLive(_ webView: WKWebView) async -> String? {
    let js = "return location.href.split(/[?#]/)[0] + ' ' + document.readyState;"
    var last = "no answer"
    for _ in 0..<120 {
      do {
        let got = try await webView.callAsyncJavaScript(
          js, arguments: [:], in: nil, contentWorld: .page)
        last = String(describing: got)
        if (got as? String) == "app://local/app.html complete" { return nil }
      } catch {
        last = "error: \(error)"
      }
      try? await Task.sleep(nanoseconds: 250_000_000)
    }
    return last
  }

  private func describe(_ booted: Booted) -> String {
    "effects=\(booted.lifecycle.dispatchedEffects) "
      + "readyReports=\(booted.lifecycle.readyReports) "
      + "watchdogVerdicts=\(booted.lifecycle.watchdogVerdicts) "
      + "pings=\(booted.lifecycle.debugPingsSent)/\(booted.lifecycle.debugPingsAnswered) "
      + "url=\(booted.host.webView.url?.absoluteString ?? "nil") "
      + "isLoading=\(booted.host.webView.isLoading)"
  }

  // MARK: - 1. one death before readiness → automatic reload → ready

  @MainActor
  func testDeathBeforeFirstLoadRecoversByReload() async throws {
    let booted = boot(injection: .contentKillBeforeReady)
    // The planted-red discriminator: without the launching edge the death
    // is swallowed (no .reloadWebView ever dispatched).
    let reloaded = await waitUntil(Self.bootBudget) {
      booted.lifecycle.dispatchedEffects == [.reloadWebView]
    }
    XCTAssertTrue(reloaded, "a death in .launching must dispatch exactly one automatic reload: \(describe(booted))")
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the automatic reload must reach readiness: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.dispatchedEffects, [.reloadWebView],
                   "one reload, no recovery surface: \(describe(booted))")
    XCTAssertFalse(recoverySurfaceShown(booted.host))
    let notLive = await pageNotLive(booted.host.webView)
    XCTAssertNil(notLive, "the reloaded boot document must be live: \(describe(booted))")
  }

  // MARK: - 2. every attempt dies → recovery surface, never blank

  @MainActor
  func testRepeatedDeathBeforeFirstLoadEndsOnRecoverySurface() async throws {
    let booted = boot(injection: .contentKillBeforeReadyAlways)
    let surfaced = await waitUntil(Self.bootBudget) { self.recoverySurfaceShown(booted.host) }
    XCTAssertTrue(surfaced, "every boot attempt dying must end on the recovery surface: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.dispatchedEffects,
                   [.reloadWebView, .reloadWebView, .showRecovery],
                   "≤ 2 automatic reloads, then the surface: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.readyReports, 0)
  }

  // MARK: - 3. one death before anything commits → load the boot document

  @MainActor
  func testDeathBeforeFirstCommitLoadsTheBootDocument() async throws {
    let booted = boot(injection: .contentKillBeforeCommit)
    let reloaded = await waitUntil(Self.bootBudget) {
      booted.lifecycle.dispatchedEffects == [.reloadWebView]
    }
    XCTAssertTrue(reloaded, "a death before the first commit must dispatch exactly one automatic reload: \(describe(booted))")
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the recovery reload must reach readiness: \(describe(booted))")
    XCTAssertFalse(recoverySurfaceShown(booted.host), describe(booted))
    let notLive = await pageNotLive(booted.host.webView)
    XCTAssertNil(notLive, "recovery must load the boot document (no history item to reload): \(describe(booted))")
  }

  // MARK: - 4. a stalled boot nothing reports → the watchdog recovers it

  @MainActor
  func testStalledBootWithNoCallbackRecoversThroughTheWatchdog() async throws {
    // Short deadline for the arm; the shipped default is 30 s (+ the
    // liveness ping while a page is still loading).
    let booted = boot(injection: .stallBeforeCommit,
                      watchdog: CommitWatchdog(deadline: 5, pingBound: 60, startBudget: 10))
    let reloaded = await waitUntil(Self.bootBudget) {
      booted.lifecycle.dispatchedEffects == [.reloadWebView]
    }
    XCTAssertTrue(reloaded, "the watchdog must turn a silently stalled boot into one automatic reload: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [.notLoading], describe(booted))
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the recovery reload must reach readiness: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.dispatchedEffects, [.reloadWebView],
                   "exactly one reload (the stopped load's cancellation is no reload failure): \(describe(booted))")
    XCTAssertFalse(recoverySurfaceShown(booted.host), describe(booted))
    let notLive = await pageNotLive(booted.host.webView)
    XCTAssertNil(notLive, "the recovered boot document must be live: \(describe(booted))")
  }

  // MARK: - 5. a slow but alive boot is never declared dead

  @MainActor
  func testSlowButAliveBootIsNeverDeclaredDead() async throws {
    // Short deadlines (many checks in the window) but the shipped 30 s
    // ping bound: under heavy load a live page can take seconds to answer.
    // The watchdog's own verdicts are what this arm gates — a real WebKit
    // termination under load may still add a recovery reload that is not
    // the watchdog's doing.
    let bound: TimeInterval = 30
    let booted = boot(injection: nil,
                      watchdog: CommitWatchdog(deadline: 2, pingBound: bound, startBudget: 4),
                      holdBootDocument: true)
    let holding = try XCTUnwrap(booted.host.holdingSchemeHandler)
    let held = await waitUntil(Self.bootBudget) { holding.isHolding }
    XCTAssertTrue(held, "the boot document never reached the scheme handler: \(describe(booted))")
    // Stay held (loading) for more than one full ping bound after the
    // first ping: an adapter that dropped ping completions would draw a
    // pingUnanswered verdict inside this window.
    let pinged = await waitUntil(Self.bootBudget) { booted.lifecycle.debugPingsSent >= 1 }
    XCTAssertTrue(pinged, "no ping went out while the boot was held: \(describe(booted))")
    let firstPing = Date()
    let releaseAt = firstPing.addingTimeInterval(bound + 10)
    while Date() < releaseAt { try await Task.sleep(nanoseconds: 250_000_000) }
    XCTAssertGreaterThanOrEqual(booted.lifecycle.debugPingsAnswered, 1,
                                "a ping completion must reach the watchdog during the hold: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [], "a page answering its pings is alive: \(describe(booted))")
    if booted.lifecycle.dispatchedEffects.isEmpty {
      XCTAssertTrue(booted.host.webView.isLoading, "the held boot must still be loading: \(describe(booted))")
    }
    // the slow boot finishes on its own
    holding.release()
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the released boot must reach readiness: \(describe(booted))")
    try await Task.sleep(nanoseconds: 5_000_000_000) // past two more deadlines
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [], "the commit disarms the watch: \(describe(booted))")
    let notLive = await pageNotLive(booted.host.webView)
    XCTAssertNil(notLive, describe(booted))
  }

  // MARK: - 6. loading + unanswered ping (the measured silent death)

  @MainActor
  func testLoadingBootWhosePingNeverAnswersRecovers() async throws {
    // Pings are answered until the boot document is really parked — a
    // loaded host can take many seconds to reach the scheme handler, and a
    // verdict before that would cancel the navigation the hold is meant
    // for. Only then does the next ping go unanswered.
    // The shipped 30 s ping bound: a live page under heavy load can take
    // seconds to answer, and a short test bound fired on it (false verdict).
    let booted = boot(injection: nil,
                      watchdog: CommitWatchdog(deadline: 2, pingBound: 30, startBudget: 4),
                      holdBootDocument: true)
    let holding = try XCTUnwrap(booted.host.holdingSchemeHandler)
    let held = await waitUntil(Self.bootBudget) { holding.isHolding }
    XCTAssertTrue(held, "the boot document never reached the scheme handler: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [], "no verdict while the page answers: \(describe(booted))")
    booted.lifecycle.debugSwallowPings = 1
    let reloaded = await waitUntil(Self.bootBudget) {
      booted.lifecycle.watchdogVerdicts == [.pingUnanswered]
        && booted.lifecycle.dispatchedEffects.first == .reloadWebView
    }
    XCTAssertTrue(reloaded, "an unanswered ping on a loading boot must open the recovery episode: \(describe(booted))")
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the recovery reload must reach readiness: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [.pingUnanswered], "one verdict: \(describe(booted))")
    XCTAssertFalse(recoverySurfaceShown(booted.host), describe(booted))
    let notLive = await pageNotLive(booted.host.webView)
    XCTAssertNil(notLive, describe(booted))
  }

  // MARK: - 7. a warm replay navigation stalls before its commit

  /// A well-formed replay boot URL (any base64url payload: the page's
  /// decoder judges its content — the navigation is what is under test).
  private static let replayTarget = URL(string: "app://local/app.html#r=AAAA")!

  @MainActor
  private func pageHash(_ webView: WKWebView) async -> String? {
    try? await webView.callAsyncJavaScript(
      "return document.readyState === 'complete' ? location.hash : null;",
      arguments: [:], in: nil, contentWorld: .page) as? String
  }

  @MainActor
  func testWarmReplayStalledBeforeCommitRecoversOntoTheReplay() async throws {
    // Short deadline for the arm (as arm 4); the liveness ping keeps a slow
    // but alive boot from a verdict (arm 5).
    let booted = boot(injection: nil,
                      watchdog: CommitWatchdog(deadline: 5, pingBound: 60, startBudget: 10))
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the boot never reached readiness: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [], "no verdict on the live boot: \(describe(booted))")
    // the NEXT navigation (the replay's own reload) is dropped as it starts
    // and nothing reports it — only the watchdog can notice
    booted.lifecycle.failureInjection = .stallBeforeCommit
    booted.host.openReplay(Self.replayTarget)
    let recovered = await waitUntil(Self.bootBudget) {
      booted.lifecycle.watchdogVerdicts == [.notLoading]
        && booted.lifecycle.dispatchedEffects.first == .reloadWebView
    }
    XCTAssertTrue(recovered, "a warm replay navigation that stalls before its commit must open the recovery episode: \(describe(booted))")
    let reloaded = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 2 }
    XCTAssertTrue(reloaded, "the recovery reload must reach readiness: \(describe(booted))")
    var hash: String?
    for _ in 0..<120 {
      hash = await pageHash(booted.host.webView)
      if hash == "#r=AAAA" { break }
      try await Task.sleep(nanoseconds: 250_000_000)
    }
    XCTAssertEqual(hash, "#r=AAAA", "the recovery must land on the replay: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.watchdogVerdicts, [.notLoading], "one verdict: \(describe(booted))")
    XCTAssertFalse(recoverySurfaceShown(booted.host), describe(booted))
  }

  // MARK: - 8. two deaths before commit on a cold replay boot

  @MainActor
  func testColdReplayBootSurvivesTwoDeathsBeforeCommit() async throws {
    let booted = boot(injection: .contentKillBeforeCommitTwice, replay: Self.replayTarget)
    let reloaded = await waitUntil(Self.bootBudget) {
      booted.lifecycle.dispatchedEffects == [.reloadWebView, .reloadWebView]
    }
    XCTAssertTrue(reloaded, "two deaths before commit must dispatch two automatic reloads: \(describe(booted))")
    let ready = await waitUntil(Self.bootBudget) { booted.lifecycle.readyReports >= 1 }
    XCTAssertTrue(ready, "the second reload must reach readiness: \(describe(booted))")
    var hash: String?
    for _ in 0..<120 {
      hash = await pageHash(booted.host.webView)
      if hash == "#r=AAAA" { break }
      try await Task.sleep(nanoseconds: 250_000_000)
    }
    XCTAssertEqual(hash, "#r=AAAA", "the replay target must survive both deaths — the final document is the replay: \(describe(booted))")
    XCTAssertEqual(booted.lifecycle.dispatchedEffects, [.reloadWebView, .reloadWebView], describe(booted))
    XCTAssertFalse(recoverySurfaceShown(booted.host), describe(booted))
  }
}
