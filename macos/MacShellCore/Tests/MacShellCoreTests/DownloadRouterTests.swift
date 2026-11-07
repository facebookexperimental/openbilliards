// Copyright (c) Meta Platforms, Inc. and affiliates.

// DownloadRouterTests — T016 (lane D): every DownloadRouter law of
// the macos-shell contract §3, FR-015 "download routing decisions".
// Pure-logic gates; the WKDownload adapter rides these in
// DownloadController (T017) and is gated by MacAppTests (T018).
import XCTest
@testable import MacShellCore

final class DownloadRouterTests: XCTestCase {

    // MARK: - policy: shouldPerformDownload == true → .download

    func testDownloadAttributeNavigationAlwaysRoutesToDownload() {
        // The web side's anchor `download` attribute (record.js stop(),
        // export.js download()) surfaces as shouldPerformDownload — it
        // wins over every scheme/frame combination.
        for isMainFrame in [true, false] {
            for scheme in ["blob", "app", "about", "https", "file", nil] as [String?] {
                XCTAssertEqual(
                    DownloadRouter.policy(shouldPerformDownload: true,
                                          isMainFrame: isMainFrame,
                                          scheme: scheme),
                    .download,
                    "download-attribute navigation must route to .download " +
                    "(scheme=\(scheme ?? "nil"), isMainFrame=\(isMainFrame))")
            }
        }
    }

    // MARK: - policy: app:// | blob: | about: → .allow

    func testAppInternalSchemesAllow() {
        for scheme in ["app", "blob", "about"] {
            for isMainFrame in [true, false] {
                XCTAssertEqual(
                    DownloadRouter.policy(shouldPerformDownload: false,
                                          isMainFrame: isMainFrame,
                                          scheme: scheme),
                    .allow,
                    "\(scheme): non-download navigation must load normally")
            }
        }
    }

    func testSchemeComparisonIsCaseInsensitive() {
        // RFC 3986 §3.1: schemes are case-insensitive.
        for scheme in ["APP", "Blob", "About"] {
            XCTAssertEqual(
                DownloadRouter.policy(shouldPerformDownload: false,
                                      isMainFrame: true,
                                      scheme: scheme),
                .allow)
        }
    }

    // MARK: - policy: any other main-frame scheme → .cancel (offline belt)

    func testOtherMainFrameSchemesCancel() {
        for scheme in ["https", "http", "file", "ftp", "ws", "data", "javascript"] {
            XCTAssertEqual(
                DownloadRouter.policy(shouldPerformDownload: false,
                                      isMainFrame: true,
                                      scheme: scheme),
                .cancel,
                "\(scheme): main-frame non-app scheme must be cancelled")
        }
    }

    func testNilSchemeCancels() {
        XCTAssertEqual(
            DownloadRouter.policy(shouldPerformDownload: false,
                                  isMainFrame: true,
                                  scheme: nil),
            .cancel)
        XCTAssertEqual(
            DownloadRouter.policy(shouldPerformDownload: false,
                                  isMainFrame: false,
                                  scheme: nil),
            .cancel)
    }

    func testOtherSubFrameSchemesCancelToo() {
        // Implementation pin, STRICTER than the gated main-frame law
        // (never weaker): the offline belt cancels non-app schemes from
        // every frame — no request may leave the app.
        for scheme in ["https", "http", "file"] {
            XCTAssertEqual(
                DownloadRouter.policy(shouldPerformDownload: false,
                                      isMainFrame: false,
                                      scheme: scheme),
                .cancel,
                "\(scheme): sub-frame non-app scheme must be cancelled")
        }
    }

    // MARK: - destinationDirectives (the downloads contract §2.3)

    func testNoDestinationCancels() {
        // Panel cancelled → the route dies silently: [.cancel] exactly,
        // regardless of what sits on disk.
        XCTAssertEqual(
            DownloadRouter.destinationDirectives(choseDestination: false,
                                                 fileExists: false),
            [.cancel])
        XCTAssertEqual(
            DownloadRouter.destinationDirectives(choseDestination: false,
                                                 fileExists: true),
            [.cancel])
    }

    func testFreshDestinationSetsWithoutRemoval() {
        XCTAssertEqual(
            DownloadRouter.destinationDirectives(choseDestination: true,
                                                 fileExists: false),
            [.setDestination])
    }

    func testExistingDestinationRemovesThenSets() {
        // Replace consent came from the panel's standard replace flow;
        // WKDownload refuses to overwrite, so pre-delete MUST precede
        // setDestination — the order is load-bearing.
        XCTAssertEqual(
            DownloadRouter.destinationDirectives(choseDestination: true,
                                                 fileExists: true),
            [.removeExisting, .setDestination])
    }

    // MARK: - never-remove-without-consent (exhaustive invariant)

    func testRemoveExistingNeverFiresWithoutConsent() {
        // Exhaustive over the input space: .removeExisting appears ONLY
        // in the one consented cell (choseDestination && fileExists).
        for choseDestination in [true, false] {
            for fileExists in [true, false] {
                let directives = DownloadRouter.destinationDirectives(
                    choseDestination: choseDestination,
                    fileExists: fileExists)
                let consented = choseDestination && fileExists
                XCTAssertEqual(
                    directives.contains(.removeExisting), consented,
                    ".removeExisting without panel replace consent is " +
                    "forbidden (choseDestination=\(choseDestination), " +
                    "fileExists=\(fileExists))")
            }
        }
    }

    func testDirectiveListsAreTerminalAndMinimal() {
        // Every list ends in exactly one terminal directive (.cancel or
        // .setDestination) and contains no duplicates — the adapter
        // executes it as a straight-line program.
        for choseDestination in [true, false] {
            for fileExists in [true, false] {
                let directives = DownloadRouter.destinationDirectives(
                    choseDestination: choseDestination,
                    fileExists: fileExists)
                let terminals = directives.filter { $0 == .cancel || $0 == .setDestination }
                XCTAssertEqual(terminals.count, 1,
                               "exactly one terminal directive")
                XCTAssertEqual(directives.last, terminals.first,
                               "the terminal directive closes the list")
                XCTAssertEqual(Array(Set(directives)).count, directives.count,
                               "no duplicate directives")
            }
        }
    }
}
