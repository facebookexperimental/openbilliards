// Copyright (c) Meta Platforms, Inc. and affiliates.

// ReplayLinkRoutingTests.swift — GH-1023 hosted MacAppTests arm: a share
// link minted INSIDE the shell must be one the shell (and a recipient's
// shell) can open. Before the fix share.js minted every link on
// location.href, so the shell copied app://local/app.html#r=…, which no
// browser, no other app and not the app itself can open.
//
// One end-to-end walk on REAL WebViewHosts (production configuration, real
// game boot, each mounted in a visible window so the page renders):
//   1. play one scripted shot on a live shell table, then mint the link
//      through share.js's own encoder (the toolbar button's and the DVR
//      pill's entry point): it must be openbilliards://replay#r=…;
//   2. ShellCore ReplayLink must accept it and map it onto
//      app://local/app.html#r=…;
//   3. warm route: the running shell opens it (WebViewHost.openReplay) and
//      replays that one shot;
//   4. cold route: a fresh shell boots straight into it
//      (WebViewHost.boot(replay:)) and replays that one shot;
//   5. a link opened before any document is live (right after boot) is
//      parked and opens once the boot load finishes;
//   6. the app delegate's LaunchServices entry (application(_:open:))
//      ignores hostile/malformed URLs — the live page never moves — and
//      routes a well-formed link into the running shell.
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`.

import XCTest
import WebKit
import ShellCore
@testable import OpenBilliards

final class ReplayLinkRoutingTests: XCTestCase {

  /// Generous: a full game boot (wasm + module graph) beside the hosted
  /// app's own window, and one shot's real-time playback.
  private static let budget: TimeInterval = 300

  private var windows: [NSWindow] = []

  override func tearDown() {
    for window in windows { window.orderOut(nil) }
    windows.removeAll()
    super.tearDown()
  }

  // MARK: - fixture

  /// The MacAppDelegate wiring in a window of its own. The game's
  /// readiness and shot playback run on animation frames, and WebKit stops
  /// delivering them to an occluded window — the hosted app is rarely the
  /// frontmost one, so the window floats above every normal window (and
  /// the app activates) for the walk.
  @MainActor
  private func mount(replay: URL?) -> WebViewHost {
    let host = WebViewHost()
    let lifecycle = LifecycleController(host: host)
    host.lifecycle = lifecycle
    // staggered, so a later window never fully covers an earlier one
    let offset = CGFloat(40 + 80 * windows.count)
    let window = NSWindow(contentRect: NSRect(x: offset, y: offset, width: 1280, height: 800),
                          styleMask: [.titled], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.level = .floating
    window.contentView = host.containerView
    NSApp.activate(ignoringOtherApps: true)
    window.orderFrontRegardless()
    windows.append(window)
    lifecycle.markLaunched()
    host.boot(replay: replay)
    return host
  }

  @MainActor
  private func js(_ host: WebViewHost, _ body: String) async -> Any? {
    try? await host.webView.callAsyncJavaScript(
      body, arguments: [:], in: nil, contentWorld: .page)
  }

  /// Bounded poll of a page predicate (a JS expression returning a bool).
  @MainActor
  private func waitFor(_ host: WebViewHost, _ predicate: String,
                       _ timeout: TimeInterval = budget) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if (await js(host, "try { return !!(\(predicate)); } catch (e) { return false; }")) as? Bool == true {
        return true
      }
      try? await Task.sleep(nanoseconds: 250_000_000)
    }
    return false
  }

  @MainActor
  private func describe(_ host: WebViewHost) async -> String {
    let state = await js(host, """
      return JSON.stringify({ href: location.href, ready: window.__test?.ready ?? null,
        state: window.__test?.state?.() ?? null, replay: window.__share?.replay?.() ?? null,
        errors: (window.__test?.errors ?? []).slice(-3) });
      """) as? String
    return state ?? "url=\(host.webView.url?.absoluteString ?? "nil") (page unreachable)"
  }

  // MARK: - mint in the shell → map → warm + cold replay

  @MainActor
  func testShellMintedLinkOpensWarmAndCold() async throws {
    // 1. a live shell table with one recorded shot
    let sender = mount(replay: nil)
    let booted = await waitFor(sender, "window.__test?.ready === true")
    if !booted { XCTFail("the shell never became ready: \(await describe(sender))") }
    let shotError = await js(sender,
      "return __test.shoot({ v0: 2.2, phi: 1.35, theta: 0, a: 0, b: 0 }) ?? null;")
    XCTAssertTrue(shotError == nil || shotError is NSNull,
                  "scripted shot rejected: \(String(describing: shotError))")
    let settled = await waitFor(sender,
      "__share.log().shots === 1 && !['PLAYBACK', 'SIMULATING'].includes(__test.state())")
    if !settled { XCTFail("the shot never settled into the share log: \(await describe(sender))") }

    // the link share.js mints in the shell (toolbar button + DVR pill path)
    let minted = await js(sender, "return String(await window.__share.encode());") as? String
    if minted == nil { XCTFail("encode() failed: \(await describe(sender))") }
    let link = try XCTUnwrap(minted)
    XCTAssertTrue(link.hasPrefix("openbilliards://replay#r="),
                  "a shell share link must be the app link, got: \(link.prefix(64))")
    XCTAssertFalse(link.hasPrefix("app:"), "a shell link must never keep the app://local origin")

    // 2. the shells' input boundary accepts exactly that link
    let target = try XCTUnwrap(ReplayLink.bootURL(for: try XCTUnwrap(URL(string: link))),
                               "ReplayLink rejected a link share.js minted: \(link.prefix(64))")
    let fragment = String(link.dropFirst("openbilliards://replay#".count))
    XCTAssertEqual(target.absoluteString, "app://local/app.html#" + fragment)

    // 3. warm: the running shell reloads its boot document into the replay
    sender.openReplay(target)
    let warm = await waitFor(sender,
      "location.hash.startsWith('#r=') && __share.replay().n === 1")
    if !warm { XCTFail("the running shell did not open the replay: \(await describe(sender))") }

    // 4. cold: a fresh shell boots straight into the replay
    let recipient = mount(replay: target)
    let cold = await waitFor(recipient, "location.hash.startsWith('#r=') && __share.replay().n === 1")
    if !cold { XCTFail("a cold shell did not boot into the replay: \(await describe(recipient))") }

    // 5. a link opened before any document is live is parked, then opened
    let early = mount(replay: nil)
    early.openReplay(target)
    let parked = await waitFor(early, "location.hash.startsWith('#r=') && __share.replay().n === 1")
    if !parked { XCTFail("a link opened during boot was lost: \(await describe(early))") }
  }

  // MARK: - the LaunchServices entry point is an input boundary

  @MainActor
  func testAppDelegateIgnoresHostileLinksAndRoutesAReplayLink() async throws {
    let delegate = try XCTUnwrap(NSApp.delegate as? MacAppDelegate)
    let host = try XCTUnwrap(delegate.webViewHost, "the hosted app has no shell host")
    let ready = await waitFor(host, "document.readyState === 'complete'")
    if !ready { XCTFail("the app's own page never loaded: \(await describe(host))") }
    let before = host.webView.url
    let hostile = [
      "https://evil.example/app.html#r=AAAA",
      "openbilliards://evil.example#r=AAAA",
      "openbilliards://replay?next=https://evil.example#r=AAAA",
      "openbilliards://replay#r=AA%22%3E%3Cscript%3E",
      "openbilliards://replay#r=AAAA&x=1",
      "javascript:alert(1)//openbilliards://replay#r=AAAA",
    ].compactMap(URL.init(string:))
    XCTAssertNil(MacAppDelegate.replayTarget(hostile))
    delegate.application(NSApp, open: hostile)
    try await Task.sleep(nanoseconds: 2_000_000_000)
    // The page must not move. (Not "not loading": the hosted app's own page
    // can be in a recovery reload of its own on a loaded host.)
    XCTAssertEqual(host.webView.url, before, "a hostile link must never move the page")

    // a well-formed link (any base64url payload: the page's decoder judges
    // its content, as for a browser recipient) opens in the running shell
    let link = try XCTUnwrap(URL(string: "openbilliards://replay#r=AAAA"))
    XCTAssertEqual(MacAppDelegate.replayTarget(hostile + [link])?.absoluteString,
                   "app://local/app.html#r=AAAA")
    delegate.application(NSApp, open: [link])
    let routed = await waitFor(host, "location.hash === '#r=AAAA' && document.readyState === 'complete'")
    if !routed { XCTFail("the delegate did not route the replay link: \(await describe(host))") }
  }
}
