// Copyright (c) Meta Platforms, Inc. and affiliates.

// ComponentTree.swift — L2 XCUITest component-tree suite (feature 016, T021;
// the test-pyramid contract §2, research R13, FR-012). Class name pinned by
// ios/TestPlans/ComponentTree.xctestplan (selectedTests: ComponentTree).
//
// EXECUTION [BLOCKED: local Xcode install] — runs via
//   xcodebuild test -scheme OpenBilliards … -only-testing AppUITests/ComponentTree
// (quickstart §6; CI arm T038). Authored + syntax-gated today against the
// frozen seams named in ShellSeams.swift.
//
// Asserts (test-pyramid §2, 1:1):
//   1. the web view element exists and fills the safe-area layout;
//   2. launch reaches interactive (readiness probe behind -OBStatusSeam);
//   3. orientation stays landscape under XCUIDevice.shared.orientation
//      flips, and the 014 portrait rotate prompt never renders (FR-006);
//   4. the recovery surface (triggered via -OBInjectFailure contentKill ×3:
//      one injected kill per argument occurrence — initial load + both
//      automatic reload attempts — escalates the LifecycleMachine to
//      `failed` after its <= 2 reload attempts, shell-app contract §5) exposes
//      labeled, LOCALIZED elements with stable accessibility identifiers;
//   5. the unstamped real-user boot look (no scripted pin — research R6).
//
// Mutation smoke hook (test-pyramid §5 L2): masking the recovery retry
// label flips testRecoverySurfaceLabeledAndLocalized red.

import XCTest

final class ComponentTree: XCTestCase {

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  private func window(_ app: XCUIApplication) -> XCUIElement { app.windows.firstMatch }

  // MARK: 1 + 2 — web view fills the layout; launch reaches interactive

  func testWebViewFillsWindowAndReachesInteractive() {
    let app = XCUIApplication()
    let seam = StatusSeamClient()
    XCTAssertTrue(
      ShellLaunch.launch(app: app, seam: seam, bootQuery: "obtool"),
      "shell never reached interactive (webview + status-seam readiness probe)")

    let webView = app.webViews.firstMatch
    XCTAssertTrue(webView.exists, "WKWebView element missing from the accessibility tree")

    // Edge-to-edge full-window layout (shell-app contract §4): the web view frame
    // covers the window; the page's viewport-fit=cover owns the insets, so
    // the NATIVE frame must not be inset by the safe area.
    let w = window(app).frame
    let f = webView.frame
    XCTAssertEqual(f.width, w.width, accuracy: 2.0, "web view narrower than the window")
    XCTAssertEqual(f.height, w.height, accuracy: 2.0, "web view shorter than the window")
    XCTAssertEqual(f.origin.x, w.origin.x, accuracy: 2.0)
    XCTAssertEqual(f.origin.y, w.origin.y, accuracy: 2.0)

    if let seam {
      // touch mode active via the shipped coarse-pointer detection (US1):
      // the seam mirrors touchInstalled once touch.js installs.
      let status = seam.waitStatus(timeout: 30) { $0["touchInstalled"] as? Bool == true }
      XCTAssertNotNil(status, "touch mode never installed (coarse-pointer detection, FR-003)")
    } else {
      XCTContext.runActivity(named: "seam asserts skipped: OB_CONTAINER unset (plain xcodebuild run)") { _ in }
    }
  }

  // MARK: 3 — landscape lock + rotate prompt never renders

  func testOrientationStaysLandscapeUnderFlips() {
    let app = XCUIApplication()
    let seam = StatusSeamClient()
    XCTAssertTrue(ShellLaunch.launch(app: app, seam: seam, bootQuery: "obtool"))

    let device = XCUIDevice.shared
    defer { device.orientation = .landscapeLeft }
    for orientation: UIDeviceOrientation in [.portrait, .portraitUpsideDown, .landscapeRight] {
      device.orientation = orientation
      sleep(2) // rotation settle (bounded)
      let w = window(app).frame
      XCTAssertGreaterThan(w.width, w.height,
        "window left landscape after a \(orientation.rawValue) flip (FR-006)")
      // The 014 rotate prompt is pure CSS `(orientation: portrait)`
      // (web/app/ui/touch.css): landscape-locked, it must never enter the
      // accessibility tree (shell-app contract §4).
      let prompt = app.staticTexts[ShellSeam.rotatePromptEN]
      XCTAssertFalse(prompt.exists, "014 rotate prompt rendered inside the landscape-locked shell")
    }
  }

  // MARK: 4 — recovery surface: labeled, localized, stable identifiers

  private func recoveryLabels(languageArg: String) -> (title: String, body: String, retry: String)? {
    let app = XCUIApplication()
    app.launchArguments = ShellSeam.launchArgs(
      bootQuery: "obtool",
      injectFailures: ["contentKill", "contentKill", "contentKill"])
    // replace the default (en) pin from launchArgs with the requested locale
    if let i = app.launchArguments.firstIndex(of: "-AppleLanguages") {
      app.launchArguments[i + 1] = languageArg
    }
    app.launch()
    let retry = app.buttons[ShellSeam.recoveryRetryID]
    guard retry.waitForExistence(timeout: 60) else { return nil }
    let title = app.staticTexts[ShellSeam.recoveryTitleID]
    let body = app.staticTexts[ShellSeam.recoveryBodyID]
    guard title.exists, body.exists else { return nil }
    return (title.label, body.label, retry.label)
  }

  func testRecoverySurfaceLabeledAndLocalized() {
    // ×3 injected kills: initial load + the <= 2 automatic reload attempts
    // all die -> LifecycleMachine escalates to `failed` -> RecoverySurface
    // (shell-app contract §5; data-model §5).
    guard let en = recoveryLabels(languageArg: "(en)") else {
      XCTFail("recovery surface never appeared after contentKill ×3 (identifiers "
        + "\(ShellSeam.recoveryTitleID)/\(ShellSeam.recoveryBodyID)/\(ShellSeam.recoveryRetryID))")
      return
    }
    XCTAssertFalse(en.title.isEmpty, "recovery title unlabeled")
    XCTAssertFalse(en.body.isEmpty, "recovery body unlabeled")
    XCTAssertFalse(en.retry.isEmpty, "recovery retry button unlabeled (L2 mutation-smoke target)")

    // Localization proof (shell-app contract §7, 7 locales): a non-English boot
    // renders DIFFERENT strings for the same stable identifiers. One locale
    // delta suffices for the tree assert; the ×7 completeness gate is the
    // xcstrings file itself (T017).
    guard let fr = recoveryLabels(languageArg: "(fr)") else {
      XCTFail("recovery surface never appeared on the fr boot")
      return
    }
    XCTAssertNotEqual(en.retry, fr.retry,
      "recovery retry label identical across en/fr — strings not localized")

    // The retry control is a real, hittable button (FR-008 user-initiated
    // reload path; recovery -> `recovering` on tap).
    let app = XCUIApplication()
    let retry = app.buttons[ShellSeam.recoveryRetryID]
    if retry.exists {
      XCTAssertTrue(retry.isHittable, "recovery retry button not hittable")
    }
  }

  // MARK: 5 — unstamped real-user boot (research R6)

  func testRealUserBootIsUnstamped() {
    // NO -OBBootQuery, NO status seam: the boot URL law (shell-app contract §1)
    // says this session is app://local/app.html with zero query params.
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(en)"]
    app.launch()
    let webView = app.webViews.firstMatch
    XCTAssertTrue(webView.waitForExistence(timeout: 60),
      "real-user boot never presented the web view")
    // The scripted pin would flip bootLook to 'green'; the accessibility
    // tree cannot read WebGL, so L2 pins the STRUCTURAL half of R6: the app
    // stays alive and interactive with no recovery surface and no scripted
    // debris; the look/table byte-level arm rides L3's status seam
    // (`bootLook` mirrored by __test) in the e2e-ios `fullrack` boot check.
    sleep(5)
    XCTAssertTrue(webView.exists, "web view vanished after the user boot settle")
    XCTAssertFalse(app.buttons[ShellSeam.recoveryRetryID].exists,
      "recovery surface visible on a healthy user boot")
    let w = window(app).frame
    XCTAssertGreaterThan(w.width, w.height, "user boot not landscape")
  }
}
