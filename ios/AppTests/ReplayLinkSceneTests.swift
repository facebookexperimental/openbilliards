// Copyright (c) Meta Platforms, Inc. and affiliates.

// ReplayLinkSceneTests.swift — GH-1023 L1 arm for the iOS replay-link entry
// points. SceneDelegate hands every URL UIKit delivers (cold:
// connectionOptions.urlContexts, warm: scene(_:openURLContexts:)) to
// replayTarget, which keeps only well-formed openbilliards://replay links
// (ShellCore ReplayLink, unit-gated in ShellCoreTests) and maps them onto
// the fixed boot document. The live-host leg: the running shell's
// GameViewController opens such a target (the warm path) — the boot
// document swaps its fragment and reloads into the replay.
//
// EXECUTION: injects into the running app on an iOS Simulator
// (`xcodebuild test … -only-testing AppTests`; the ios.yml simulator job).

import XCTest
import WebKit
@testable import OpenBilliards

final class ReplayLinkSceneTests: XCTestCase {

  func testSceneFilterKeepsOnlyReplayLinks() {
    let hostile = [
      "https://evil.example/app.html#r=AAAA",
      "openbilliards://evil.example#r=AAAA",
      "openbilliards://replay?next=https://evil.example#r=AAAA",
      "openbilliards://replay#r=AA%22%3E%3Cscript%3E",
      "openbilliards://replay#r=AAAA&x=1",
    ].compactMap(URL.init(string:))
    XCTAssertNil(SceneDelegate.replayTarget(hostile))
    let link = URL(string: "openbilliards://replay#r=AAAA&cp=BBBB")!
    XCTAssertEqual(SceneDelegate.replayTarget(hostile + [link])?.absoluteString,
                   "app://local/app.html#r=AAAA&cp=BBBB")
  }

  /// The running shell's game controller (the warm route's receiver).
  @MainActor
  private func liveGame() -> GameViewController? {
    UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.windows.first?.rootViewController }
      .compactMap { $0 as? GameViewController }
      .first
  }

  @MainActor
  private func pageHash(_ webView: WKWebView) async -> String? {
    try? await webView.callAsyncJavaScript(
      "return document.readyState === 'complete' ? location.hash : null;",
      arguments: [:], in: nil, contentWorld: .page) as? String
  }

  @MainActor
  func testRunningShellOpensAReplayTarget() async throws {
    let game = try XCTUnwrap(liveGame(), "no running GameViewController")
    let target = try XCTUnwrap(SceneDelegate.replayTarget(
      [URL(string: "openbilliards://replay#r=AAAA")!]))
    // wait for the app's own boot document, then route the link (any
    // base64url payload: the page's decoder judges its content)
    let deadline = Date().addingTimeInterval(240)
    while Date() < deadline, await pageHash(game.webView) == nil {
      try await Task.sleep(nanoseconds: 250_000_000)
    }
    game.openReplay(target)
    var hash: String?
    while Date() < deadline {
      hash = await pageHash(game.webView)
      if hash == "#r=AAAA" { break }
      try await Task.sleep(nanoseconds: 250_000_000)
    }
    XCTAssertEqual(hash, "#r=AAAA", "the running shell did not open the replay target")
  }
}
