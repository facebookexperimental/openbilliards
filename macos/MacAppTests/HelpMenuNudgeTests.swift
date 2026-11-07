// Copyright (c) Meta Platforms, Inc. and affiliates.

// HelpMenuNudgeTests.swift — T023 MacAppTests cases (feature 024, US5,
// lane D; the shell-nudge contract §2/§5).
//
// Contract seams (FROZEN, coded against verbatim):
//   - shell-nudge contract §2: the frozen evaluated snippet. Degradation-matrix
//     row "old bundle (no `window.__help`) × new shell" → the snippet
//     returns `false` with ZERO page errors (never crashes, never
//     alerts); row "new bundle × new shell" → returns `true` and calls
//     `__help.open('shell')` exactly once with the frozen source tag.
//   - shell-nudge contract §4: `menu.help.title` + `menu.help.item` resolve
//     from the COMPILED catalog in all 7 locales (the StringsMirror
//     pattern — per-locale .lproj sub-bundles so lookups cannot fall back
//     to another language silently).
//   - shell-nudge contract §3: the Help menu hangs off NSApp.helpMenu with ONE
//     item whose key equivalent is ⌘-modified or none (023 FR-008 law —
//     the game's plain `?` inside the web view is never shadowed).
//
// The web-view cases run against STUB PAGES (`loadHTMLString`, no scheme
// handler, no bundled web tree) — the seam is optional-chained on both
// sides, so this suite carries NO web-bundle dependency.
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`
// (lane D exit gate; rides T026's wall).

import XCTest
import WebKit
@testable import OpenBilliards

final class HelpMenuNudgeTests: XCTestCase {

  // MARK: - stub-page plumbing (no web-bundle dependency)

  /// Loads an inline stub document and waits for readiness. The page
  /// carries its own uncaught-error trap so "zero page errors" is a
  /// readable assertion, not a hope.
  @MainActor
  private func makeStubWebView(bodyScript: String) async throws -> WKWebView {
    let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 480))
    let html = """
    <!doctype html><html><head><meta charset="utf-8"><script>
      window.__pageErrors = [];
      window.onerror = function (message) {
        window.__pageErrors.push(String(message));
        return false;
      };
      \(bodyScript)
    </script></head><body>shell-nudge stub page</body></html>
    """
    webView.loadHTMLString(html, baseURL: nil)
    let deadline = Date().addingTimeInterval(30)
    while Date() < deadline {
      if let ready = try? await webView.callAsyncJavaScript(
        "return document.readyState === 'complete' && Array.isArray(window.__pageErrors);",
        arguments: [:], in: nil, contentWorld: .page) as? Bool, ready {
        return webView
      }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    XCTFail("stub page never became ready")
    throw NSError(domain: "HelpMenuNudgeTests.stubReady", code: 1)
  }

  /// Evaluates the FROZEN snippet exactly the way production does
  /// (`evaluateJavaScript(_:completionHandler:)`) and hands back BOTH
  /// halves of the completion so the test can assert what production
  /// deliberately ignores.
  @MainActor
  private func evaluateSnippet(on webView: WKWebView) async -> (result: Any?, error: Error?) {
    await withCheckedContinuation { continuation in
      webView.evaluateJavaScript(HelpNudge.snippet) { result, error in
        continuation.resume(returning: (result, error))
      }
    }
  }

  @MainActor
  private func pageErrorCount(of webView: WKWebView) async throws -> Int {
    let count = try await webView.callAsyncJavaScript(
      "return window.__pageErrors.length;",
      arguments: [:], in: nil, contentWorld: .page)
    return try XCTUnwrap(count as? Int, "error-trap counter unreadable")
  }

  // MARK: - 1. degradation matrix: old bundle × new shell (SC-010)

  @MainActor
  func testSnippetReturnsFalseWithZeroPageErrorsWithoutHelpSurface() async throws {
    let webView = try await makeStubWebView(bodyScript: "/* no window.__help here */")

    // Preflight the matrix premise: the surface is really absent.
    let absent = try await webView.callAsyncJavaScript(
      "return typeof window.__help === 'undefined';",
      arguments: [:], in: nil, contentWorld: .page)
    XCTAssertEqual(absent as? Bool, true, "stub must NOT carry window.__help")

    let outcome = await evaluateSnippet(on: webView)
    XCTAssertNil(outcome.error,
                 "snippet must not throw on a __help-less page, got "
                 + String(describing: outcome.error))
    XCTAssertEqual(outcome.result as? Bool, false,
                   "shell-nudge contract §2: old-bundle row returns false, got "
                   + String(describing: outcome.result))
    let errors = try await pageErrorCount(of: webView)
    XCTAssertEqual(errors, 0, "old-bundle row must raise ZERO page errors")
  }

  /// Belt for the matrix's truthiness edge: a PRESENT `__help` whose
  /// `open` is not a function still lands on the `false` arm (the
  /// `typeof` guard, not a crash).
  @MainActor
  func testSnippetReturnsFalseWhenOpenIsNotAFunction() async throws {
    let webView = try await makeStubWebView(
      bodyScript: "window.__help = { open: 'not-a-function' };")
    let outcome = await evaluateSnippet(on: webView)
    XCTAssertNil(outcome.error)
    XCTAssertEqual(outcome.result as? Bool, false,
                   "typeof guard must reject a non-function open")
    let errors = try await pageErrorCount(of: webView)
    XCTAssertEqual(errors, 0)
  }

  // MARK: - 2. degradation matrix: new bundle × new shell

  @MainActor
  func testSnippetOpensHelpSurfaceWithFrozenSourceTag() async throws {
    let webView = try await makeStubWebView(bodyScript: """
      window.__helpCalls = [];
      window.__help = {
        open: function (source) { window.__helpCalls.push(String(source)); }
      };
      """)
    let outcome = await evaluateSnippet(on: webView)
    XCTAssertNil(outcome.error)
    XCTAssertEqual(outcome.result as? Bool, true,
                   "new-bundle row returns true, got "
                   + String(describing: outcome.result))
    let calls = try await webView.callAsyncJavaScript(
      "return window.__helpCalls.join(',');",
      arguments: [:], in: nil, contentWorld: .page)
    XCTAssertEqual(calls as? String, "shell",
                   "the seam's event name is __help.open('shell') — exactly "
                   + "one call with the frozen source tag")
    let errors = try await pageErrorCount(of: webView)
    XCTAssertEqual(errors, 0)
  }

  // MARK: - 3. menu titles resolve from the catalog (StringsMirror pattern)

  private static let locales = ["en", "de", "es", "fr", "ja", "ko", "zh-Hans"]
  private static let newKeys = ["menu.help.title", "menu.help.item"]
  private static let missing = "\u{1}__MISSING__"

  private func localeBundle(_ locale: String) throws -> Bundle {
    let path = try XCTUnwrap(
      Bundle.main.path(forResource: locale, ofType: "lproj"),
      "\(locale).lproj missing from the built app (menu-i18n contract §2)")
    return try XCTUnwrap(Bundle(path: path), "cannot open \(locale).lproj as a bundle")
  }

  private func resolve(_ key: String, in bundle: Bundle) -> String? {
    let value = bundle.localizedString(forKey: key, value: Self.missing, table: nil)
    return value == Self.missing ? nil : value
  }

  func testHelpMenuKeysResolveInAllSevenLocales() throws {
    var gaps: [String] = []
    for locale in Self.locales {
      let bundle = try localeBundle(locale)
      for key in Self.newKeys {
        guard let value = resolve(key, in: bundle) else {
          gaps.append("\(key) [\(locale)]: unresolved (falls back to key)")
          continue
        }
        if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          gaps.append("\(key) [\(locale)]: empty value")
        }
        if value == key {
          gaps.append("\(key) [\(locale)]: value echoes the key — placeholder leaked")
        }
      }
    }
    XCTAssertTrue(gaps.isEmpty,
                  "19-key catalog gaps for the two US5 keys "
                  + "(shell-nudge contract §4):\n" + gaps.joined(separator: "\n"))
  }

  func testHelpMenuEnglishReferenceValuesAreExact() throws {
    // shell-nudge contract §4 en reference, verbatim.
    let en = try localeBundle("en")
    XCTAssertEqual(resolve("menu.help.title", in: en), "Help")
    XCTAssertEqual(resolve("menu.help.item", in: en), "OpenBilliards Help")
  }

  func testHelpMenuItemEmbedsBrandNameUnlocalized() throws {
    // menu-i18n contract §1: the product name is brand, not localized.
    for locale in Self.locales {
      let bundle = try localeBundle(locale)
      let value = try XCTUnwrap(resolve("menu.help.item", in: bundle))
      XCTAssertTrue(value.contains("OpenBilliards"),
                    "menu.help.item [\(locale)] must embed the unlocalized "
                    + "brand name: \(value)")
    }
  }

  func testZhHansHelpArmIsSimplifiedChineseNotEnglishFallback() throws {
    // Spec edge case (StringsMirror precedent): zh-Hans IS the game's
    // zh-CN arm — it must carry Chinese values, not silently mirror en.
    let zh = try localeBundle("zh-Hans")
    let en = try localeBundle("en")
    for key in Self.newKeys {
      let zhValue = try XCTUnwrap(resolve(key, in: zh))
      let enValue = try XCTUnwrap(resolve(key, in: en))
      XCTAssertNotEqual(zhValue, enValue,
                        "\(key): zh-Hans arm mirrors en — the required "
                        + "Simplified Chinese arm is missing in effect")
    }
  }

  // MARK: - 4. menu shape (shell-nudge contract §3; hosted app already ran
  // MainMenu.install at applicationWillFinishLaunching)

  @MainActor
  func testHelpMenuInstalledOnNSAppHelpMenuWithOneNudgeItem() throws {
    let helpMenu = try XCTUnwrap(NSApp.helpMenu,
                                 "MainMenu.install must assign NSApp.helpMenu")
    // Our constructed menu carries exactly ONE item (macOS adds its
    // native search field at display time, not to this NSMenu's items).
    XCTAssertEqual(helpMenu.items.count, 1,
                   "Help menu carries exactly one item: "
                   + helpMenu.items.map(\.title).joined(separator: " / "))
    let item = helpMenu.items[0]
    XCTAssertEqual(item.title,
                   NSLocalizedString("menu.help.item",
                                     comment: "Help menu: OpenBilliards Help"),
                   "item title must resolve from menu.help.item")
    XCTAssertEqual(item.action, #selector(HelpNudge.openHelp(_:)))
    XCTAssertTrue(item.target === HelpNudge.shared,
                  "the nudge target must be the retained shared instance "
                  + "(NSMenuItem.target is weak)")
    // The Help menu is actually in the menu bar, not just assigned.
    let mainMenu = try XCTUnwrap(NSApp.mainMenu)
    XCTAssertTrue(mainMenu.items.contains { $0.submenu === helpMenu },
                  "Help menu missing from the installed menu bar")
  }

  @MainActor
  func testHelpItemKeyEquivalentIsCommandModifiedOrNone() throws {
    let helpMenu = try XCTUnwrap(NSApp.helpMenu)
    for item in helpMenu.items {
      if item.keyEquivalent.isEmpty { continue } // NONE is lawful
      XCTAssertTrue(item.keyEquivalentModifierMask.contains(.command),
                    "023 FR-008 law: a non-empty shell key equivalent must "
                    + "be ⌘-modified — '\(item.keyEquivalent)' on "
                    + "'\(item.title)' has mask \(item.keyEquivalentModifierMask)")
    }
  }

  // MARK: - 5. the frozen snippet text itself (tripwire against a silent
  // rewording — the contract calls the §2 text the seam's "event name")

  func testSnippetTextMatchesFrozenContractVerbatim() {
    XCTAssertEqual(HelpNudge.snippet, """
      window.__help && typeof window.__help.open === 'function'
        ? (window.__help.open('shell'), true) : false
      """,
      "the shell-nudge contract §2 snippet drifted — FROZEN during "
      + "implementation; route changes through the integrator")
  }
}
