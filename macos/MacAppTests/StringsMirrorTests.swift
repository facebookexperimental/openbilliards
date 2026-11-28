// Copyright (c) Meta Platforms, Inc. and affiliates.

// StringsMirrorTests.swift — hosted MacAppTests arm (feature 023, T021,
// lane T; quickstart §4).
//
// Contract seams (FROZEN, coded against verbatim):
//   - the menu-i18n contract §2 v1.1: the frozen 19-key list (14 menu +
//     3 recovery + 2 download-failure) × 7 locales
//     (en, de, es, fr, ja, ko, zh-Hans — zh-Hans IS the game's zh-CN arm,
//     spec edge case).
//   - the menu-i18n contract §3: this suite is the runtime MIRROR of
//     `node macos/tools/xcstrings-check.mjs` — menu titles and shell
//     surfaces must RESOLVE from the COMPILED catalog in the built app
//     for every key in every locale (the tool gates the source catalog;
//     this arm gates that the catalog actually shipped and resolves).
//   - the menu-i18n contract §1: "OpenBilliards" is brand, not localized —
//     localized About/Quit values may embed it verbatim.
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`
// (runs in T024's wall).

import XCTest
import Foundation

final class StringsMirrorTests: XCTestCase {

  /// The 7 locale arms (menu-i18n contract §2).
  private static let locales = ["en", "de", "es", "fr", "ja", "ko", "zh-Hans"]

  /// The FROZEN key list (menu-i18n contract §2) — changing it is a contract
  /// amendment routed through the integrator, never a lane edit.
  private static let frozenKeys = [
    "menu.app.about",
    "menu.app.quit",
    "menu.edit.title",
    "menu.edit.cut",
    "menu.edit.copy",
    "menu.edit.paste",
    "menu.edit.selectAll",
    "menu.view.title",
    "menu.view.fullscreen",
    "menu.window.title",
    "menu.window.minimize",
    "menu.window.zoom",
    "menu.help.title",
    "menu.help.item",
    "shell.recovery.title",
    "shell.recovery.body",
    "shell.recovery.retry",
    "shell.download.failed.title",
    "shell.download.failed.body",
  ]

  /// Marker that can never be a legitimate catalog value.
  private static let missing = "\u{1}__MISSING__"

  /// Per-locale resolver: the locale's .lproj as a sub-bundle of the host
  /// app, so lookups CANNOT fall back to another language silently.
  private func localeBundle(_ locale: String) throws -> Bundle {
    let path = try XCTUnwrap(
      Bundle.main.path(forResource: locale, ofType: "lproj"),
      "\(locale).lproj missing from the built app — the compiled string "
      + "catalog lacks the \(locale) arm (menu-i18n contract §2)")
    return try XCTUnwrap(Bundle(path: path), "cannot open \(locale).lproj as a bundle")
  }

  private func resolve(_ key: String, in bundle: Bundle) -> String? {
    let value = bundle.localizedString(forKey: key, value: Self.missing, table: nil)
    return value == Self.missing ? nil : value
  }

  // MARK: - the xcstrings mirror (menu-i18n contract §3)

  func testEveryFrozenKeyResolvesInAllSevenLocales() throws {
    var gaps: [String] = []
    for locale in Self.locales {
      let bundle = try localeBundle(locale)
      for key in Self.frozenKeys {
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
                  "compiled catalog gaps (SC-007 runtime mirror):\n"
                  + gaps.joined(separator: "\n"))
  }

  func testMenuTitlesResolveFromCatalogForEveryKey() throws {
    // The menu subset specifically (tasks T021 wording): every menu
    // title the MainMenu tree consumes resolves in every locale — no
    // hardcoded user-facing literal can hide behind a resolving en arm.
    let menuKeys = Self.frozenKeys.filter { $0.hasPrefix("menu.") }
    XCTAssertEqual(menuKeys.count, 14, "frozen list carries exactly 14 menu keys")
    for locale in Self.locales {
      let bundle = try localeBundle(locale)
      for key in menuKeys {
        XCTAssertNotNil(resolve(key, in: bundle),
                        "menu title \(key) does not resolve in \(locale)")
      }
    }
  }

  func testAboutAndQuitEmbedBrandNameUnlocalized() throws {
    // menu-i18n contract §1: the product name is brand, not localized —
    // localized values embed it verbatim (e.g. ja "OpenBilliards について").
    for locale in Self.locales {
      let bundle = try localeBundle(locale)
      for key in ["menu.app.about", "menu.app.quit"] {
        let value = try XCTUnwrap(resolve(key, in: bundle))
        XCTAssertTrue(value.contains("OpenBilliards"),
                      "\(key) [\(locale)] must embed the unlocalized brand "
                      + "name: \(value)")
      }
    }
  }

  func testZhHansArmIsSimplifiedChineseNotEnglishFallback() throws {
    // Spec edge case: zh-Hans IS the game's zh-CN arm — it must exist AND
    // carry Chinese values, not silently mirror en.
    let zh = try localeBundle("zh-Hans")
    let en = try localeBundle("en")
    for key in ["menu.edit.title", "shell.recovery.title", "shell.download.failed.title"] {
      let zhValue = try XCTUnwrap(resolve(key, in: zh))
      let enValue = try XCTUnwrap(resolve(key, in: en))
      XCTAssertNotEqual(zhValue, enValue,
                        "\(key): zh-Hans arm mirrors en — the required "
                        + "Simplified Chinese arm is missing in effect")
    }
  }

  func testCompiledCatalogCarriesNoUnknownShellKeys() throws {
    // Exact-set mirror of the tool's unknown-key law, when the compiled
    // format is introspectable (.lproj/Localizable.strings). If this SDK
    // compiles catalogs to another container, the source-catalog arm
    // (xcstrings-check.mjs) still owns the exact-set law — skip, never
    // vacuously pass.
    let enLproj = try XCTUnwrap(Bundle.main.path(forResource: "en", ofType: "lproj"))
    let stringsPath = (enLproj as NSString).appendingPathComponent("Localizable.strings")
    guard FileManager.default.fileExists(atPath: stringsPath) else {
      throw XCTSkip("compiled catalog is not .lproj/Localizable.strings on this SDK — "
        + "exact-set law stays with macos/tools/xcstrings-check.mjs")
    }
    let data = try Data(contentsOf: URL(fileURLWithPath: stringsPath))
    let plist = try PropertyListSerialization.propertyList(from: data, format: nil)
    let dict = try XCTUnwrap(plist as? [String: String], "Localizable.strings shape")
    XCTAssertEqual(Set(dict.keys), Set(Self.frozenKeys),
                   "compiled shell catalog must carry exactly the frozen "
                   + "19-key list (menu-i18n contract §2 v1.1)")
  }
}
