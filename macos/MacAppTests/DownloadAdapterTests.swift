// Copyright (c) Meta Platforms, Inc. and affiliates.

// DownloadAdapterTests — T018 (lane D): the DownloadController adapter
// against the scripted panel seam (downloads contract §5 — DEBUG injection;
// no real NSSavePanel, no disk writes, no WKDownload in unit runs).
// Coded against the downloads contract §2 flow: route decision for
// a web-triggered download, silent cancel (no partial file anywhere,
// no page-level error), suggested-filename passthrough verbatim,
// consent-guarded removeExisting ordering, cleanup on failure and
// terminate. Runs hosted under xcodebuild test -destination
// 'platform=macOS' (T024's wall).
import XCTest
import WebKit
@testable import OpenBilliards

final class DownloadAdapterTests: XCTestCase {

    /// One scripted controller per case: every seam records into an
    /// ordered event log so call ORDER (pre-delete before destination
    /// hand-off) is assertable, and nothing touches disk or UI.
    private struct Scripted {
        let controller: DownloadController
        let events: Events
    }

    private final class Events {
        var log: [String] = []
        var panelNames: [String] = []
        var removedURLs: [URL] = []
        var failureCount = 0
    }

    private func makeScripted(panelResult: @escaping (String) -> URL?,
                              fileExists: @escaping (URL) -> Bool) -> Scripted {
        let controller = DownloadController()
        let events = Events()
        controller.scriptPanel { name, completion in
            events.log.append("panel(\(name))")
            events.panelNames.append(name)
            completion(panelResult(name))
        }
        controller.scriptFileExists(fileExists)
        controller.scriptRemoveItem { url in
            events.log.append("remove(\(url.lastPathComponent))")
            events.removedURLs.append(url)
        }
        controller.scriptFailureSurface {
            events.log.append("failure")
            events.failureCount += 1
        }
        return Scripted(controller: controller, events: events)
    }

    private let freshURL = URL(fileURLWithPath: "/tmp/ob-tests/openbilliards-1734000000000.webm")

    // MARK: - Route decision for a web-triggered download (§2.1)

    func testWebTriggeredDownloadRoutesToDownloadPolicy() {
        // The blob-anchor `download` attribute navigation (record.js /
        // export.js) surfaces as shouldPerformDownload → .download.
        XCTAssertEqual(
            DownloadController.actionPolicy(shouldPerformDownload: true,
                                            isMainFrame: true,
                                            scheme: "blob"),
            .download)
    }

    func testNonDownloadNavigationsAreUntouchedOrCancelled() {
        // App-internal navigation loads normally; foreign main-frame
        // schemes are cancelled (the offline belt).
        XCTAssertEqual(
            DownloadController.actionPolicy(shouldPerformDownload: false,
                                            isMainFrame: true,
                                            scheme: "app"),
            .allow)
        XCTAssertEqual(
            DownloadController.actionPolicy(shouldPerformDownload: false,
                                            isMainFrame: true,
                                            scheme: "about"),
            .allow)
        XCTAssertEqual(
            DownloadController.actionPolicy(shouldPerformDownload: false,
                                            isMainFrame: true,
                                            scheme: "https"),
            .cancel)
    }

    func testResponseFallbackRungMapsUnshowableToDownload() {
        // Fallback 1 of the FROZEN §4 ladder (inert unless T025 engages
        // it as a recorded deviation): unshowable response → .download;
        // showable responses ride the same scheme belt.
        XCTAssertEqual(
            DownloadController.responsePolicy(canShowMIMEType: false,
                                              isMainFrame: true,
                                              scheme: "blob"),
            .download)
        XCTAssertEqual(
            DownloadController.responsePolicy(canShowMIMEType: true,
                                              isMainFrame: true,
                                              scheme: "app"),
            .allow)
        XCTAssertEqual(
            DownloadController.responsePolicy(canShowMIMEType: true,
                                              isMainFrame: true,
                                              scheme: "https"),
            .cancel)
    }

    // MARK: - Suggested-filename passthrough (§2.3, US3.1)

    func testSuggestedFilenameReachesThePanelVerbatim() {
        let suggested = "openbilliards-1734000000000.webm"
        let scripted = makeScripted(panelResult: { _ in nil },
                                    fileExists: { _ in false })
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: suggested) { _ in }
        XCTAssertEqual(scripted.events.panelNames, [suggested],
                       "the anchor's filename is pass-through, never re-derived")

        // The export chain's other shape survives verbatim too.
        let exportName = "openbilliards-shot-1734000000001.mp4"
        scripted.controller.decideDestination(routeKey: "route-2",
                                              suggestedFilename: exportName) { _ in }
        XCTAssertEqual(scripted.events.panelNames, [suggested, exportName])
    }

    // MARK: - Cancel path (§2.3, US3 scenario 3)

    func testCancelIsSilentNoPartialFileNoError() {
        let scripted = makeScripted(panelResult: { _ in nil },
                                    fileExists: { _ in false })
        var received: [URL?] = []
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: "a.webm") {
            received.append($0)
        }
        XCTAssertEqual(received.count, 1)
        XCTAssertNil(received[0], "WKDownload discards on nil")
        XCTAssertTrue(scripted.events.removedURLs.isEmpty,
                      "cancel never touches the filesystem")
        XCTAssertEqual(scripted.events.failureCount, 0,
                       "cancel is silent — no dialog, no page error")
        // A later terminate finds nothing to clean for this route.
        scripted.controller.cancelAllRoutesForTermination()
        XCTAssertTrue(scripted.events.removedURLs.isEmpty)
    }

    // MARK: - Consent-guarded removeExisting (§2.3, route law)

    func testFreshDestinationNeverRemoves() {
        let scripted = makeScripted(panelResult: { [freshURL] _ in freshURL },
                                    fileExists: { _ in false })
        var received: [URL?] = []
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: "a.webm") {
            received.append($0)
        }
        XCTAssertEqual(received, [freshURL])
        XCTAssertTrue(scripted.events.removedURLs.isEmpty,
                      ".removeExisting must not fire without an existing file")
    }

    func testExistingDestinationPreDeletesBeforeHandOff() {
        var chosenExists = true
        let scripted = makeScripted(panelResult: { [freshURL] _ in freshURL },
                                    fileExists: { _ in chosenExists })
        var received: [URL?] = []
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: "a.webm") { url in
            // Consume the seam's view at hand-off time: the pre-delete
            // already happened when WKDownload gets the URL.
            chosenExists = false
            received.append(url)
        }
        XCTAssertEqual(received, [freshURL])
        XCTAssertEqual(scripted.events.removedURLs, [freshURL],
                       "panel replace consent + existing file → exactly one pre-delete")
        // ORDER is load-bearing: remove strictly before the destination
        // hand-off (WKDownload refuses to overwrite).
        XCTAssertEqual(scripted.events.log,
                       ["panel(a.webm)", "remove(\(freshURL.lastPathComponent))"])
    }

    // MARK: - Cleanup on failure (§2.5 — fail / eject mid-stream)

    func testFailureDeletesPartialAndShowsLocalizedSurfaceOnce() {
        var partialOnDisk = false
        let scripted = makeScripted(panelResult: { [freshURL] _ in freshURL },
                                    fileExists: { _ in partialOnDisk })
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: "a.webm") { _ in
            partialOnDisk = true // WKDownload started streaming
        }
        scripted.controller.routeDidFail(routeKey: "route-1")
        XCTAssertEqual(scripted.events.removedURLs, [freshURL],
                       "the partial at the destination is deleted")
        XCTAssertEqual(scripted.events.failureCount, 1,
                       "one localized failure surface, never a crash")
        // The route is closed: failing again cleans nothing twice.
        scripted.controller.routeDidFail(routeKey: "route-1")
        XCTAssertEqual(scripted.events.removedURLs, [freshURL])
    }

    func testFinishClosesTheRouteWithoutTouchingTheFile() {
        var fileOnDisk = false
        let scripted = makeScripted(panelResult: { [freshURL] _ in freshURL },
                                    fileExists: { _ in fileOnDisk })
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: "a.webm") { _ in
            fileOnDisk = true
        }
        scripted.controller.routeDidFinish(routeKey: "route-1")
        XCTAssertTrue(scripted.events.removedURLs.isEmpty,
                      "the finished file stays at the chosen path ONLY")
        XCTAssertEqual(scripted.events.failureCount, 0)
        // Terminate after a clean finish finds no orphans.
        scripted.controller.cancelAllRoutesForTermination()
        XCTAssertTrue(scripted.events.removedURLs.isEmpty)
    }

    // MARK: - Quit-during-write (route law)

    func testTerminateDeletesInFlightPartials() {
        var partialOnDisk = false
        let scripted = makeScripted(panelResult: { [freshURL] _ in freshURL },
                                    fileExists: { _ in partialOnDisk })
        scripted.controller.decideDestination(routeKey: "route-1",
                                              suggestedFilename: "a.webm") { _ in
            partialOnDisk = true // mid-write at quit time
        }
        scripted.controller.cancelAllRoutesForTermination()
        XCTAssertEqual(scripted.events.removedURLs, [freshURL],
                       "a relaunch finds no orphans")
        XCTAssertEqual(scripted.events.failureCount, 0,
                       "terminate cleanup is not a failure surface")
    }

    // MARK: - One panel per route; concurrent routes independent

    func testOnePanelPerRoute() {
        var panelCompletions: [(URL?) -> Void] = []
        let controller = DownloadController()
        let events = Events()
        controller.scriptPanel { name, completion in
            events.panelNames.append(name)
            panelCompletions.append(completion) // hold the panel open
        }
        controller.scriptFileExists { _ in false }
        controller.scriptRemoveItem { events.removedURLs.append($0) }
        controller.scriptFailureSurface { events.failureCount += 1 }

        var second: [URL?] = []
        controller.decideDestination(routeKey: "route-1",
                                     suggestedFilename: "a.webm") { _ in }
        controller.decideDestination(routeKey: "route-1",
                                     suggestedFilename: "a.webm") {
            second.append($0)
        }
        XCTAssertEqual(events.panelNames, ["a.webm"],
                       "a route whose panel is up never grows a second panel")
        XCTAssertEqual(second.count, 1)
        XCTAssertNil(second[0], "the duplicate ask is refused outright")
    }

    func testConcurrentRoutesDoNotCrossWires() {
        // An export finishing while a recording panel is up must not
        // cross wires (route law). Two routes, interleaved lifecycles.
        let recordingURL = URL(fileURLWithPath: "/tmp/ob-tests/openbilliards-111.webm")
        let exportURL = URL(fileURLWithPath: "/tmp/ob-tests/openbilliards-shot-222.mp4")
        var pendingRecordingPanel: ((URL?) -> Void)?
        var partials: Set<URL> = []

        let controller = DownloadController()
        let events = Events()
        controller.scriptPanel { name, completion in
            events.panelNames.append(name)
            if name.hasSuffix(".webm") {
                pendingRecordingPanel = completion // recording panel stays up
            } else {
                completion(exportURL) // export confirms immediately
            }
        }
        controller.scriptFileExists { partials.contains($0) }
        controller.scriptRemoveItem { url in
            events.removedURLs.append(url)
            partials.remove(url)
        }
        controller.scriptFailureSurface { events.failureCount += 1 }

        var recordingDest: [URL?] = []
        var exportDest: [URL?] = []
        controller.decideDestination(routeKey: "recording",
                                     suggestedFilename: "openbilliards-111.webm") {
            recordingDest.append($0)
        }
        controller.decideDestination(routeKey: "export",
                                     suggestedFilename: "openbilliards-shot-222.mp4") {
            exportDest.append($0)
            if $0 != nil { partials.insert(exportURL) }
        }
        // The export route finishes while the recording panel is up.
        controller.routeDidFinish(routeKey: "export")
        XCTAssertEqual(exportDest, [exportURL])
        XCTAssertTrue(recordingDest.isEmpty, "recording panel still up")
        XCTAssertTrue(events.removedURLs.isEmpty)

        // Now the recording panel confirms — its own destination, no
        // bleed from the closed export route.
        pendingRecordingPanel?(recordingURL)
        XCTAssertEqual(recordingDest, [recordingURL])
        partials.insert(recordingURL)

        // The recording route fails mid-write: ONLY its partial dies.
        controller.routeDidFail(routeKey: "recording")
        XCTAssertEqual(events.removedURLs, [recordingURL])
        XCTAssertEqual(events.failureCount, 1)
        XCTAssertTrue(partials.contains(exportURL),
                      "the finished export file is untouched")
    }
}
