// Copyright (c) Meta Platforms, Inc. and affiliates.

// PhotosController — the obPhotos bridge endpoint (issue #139;
// the photos-bridge contract). ShareController precedent: message
// validation (PhotosMessage.decode, ShareMessage laws by delegation) is
// ShellCore logic, unit-gated there — this file owns only the
// WKScriptMessageHandler plumbing, the temp-file write, the PhotoKit add,
// and the ob:photos-result page callback.
//
// Why a native seam: "save to Photos on stop" is the standard
// screen-recorder expectation, and only PHPhotoLibrary can grant it —
// WKWebView has no path into the photo library. The page feature-detects
// window.webkit.messageHandlers.obPhotos (capability, never UA sniffing)
// and posts the finished MP4; browsers/macOS never see the bridge and keep
// their download/share paths.
//
// Laws (photos-bridge contract §4/§5):
// - decode -> temp file -> PHPhotoLibrary(.addOnly) add; MALFORMED payloads
//   drop silently (FR-011 regime), but a VALID payload's save attempt
//   always reports back — success AND failure — via the ob:photos-result
//   CustomEvent (the one shell→page direction; the page owns the banner +
//   the share-sheet rescue). This is deliberately NOT the share bridge's
//   silent-no-op regime: a fake "saved" would violate the issue #139
//   honesty requirement.
// - Bytes are written under a fresh temporaryDirectory subdirectory with
//   the SANITIZED leaf name; the directory is removed after every attempt.
// - .addOnly scope only — the app can never read the user's library.
// - SC-001 untouched: the payload rides the message channel; no request
//   leaves app://local.
import Foundation
import Photos
import WebKit
import ShellCore

final class PhotosController: NSObject, WKScriptMessageHandler {

    /// The bridge name: window.webkit.messageHandlers.obPhotos.
    static let messageName = "obPhotos"

    /// The result-callback channel (the host game web view; weak — set by
    /// GameViewController once the web view exists).
    weak var webView: WKWebView?

    /// Decode + temp-file write ride ONE SERIAL utility queue
    /// (ShareController review F1 precedent: base64-decoding a
    /// hundreds-of-MB payload on the main thread freezes the UI/JS
    /// bridge). message.body is a plist-bridged value — queue-hop safe.
    private let photosQueue = DispatchQueue(label: "ob-photos", qos: .utility)

    #if DEBUG
    /// DEBUG diagnostics (ShareController precedent): decoded/dropped
    /// counters + the status-seam mirror hooks. onDecodedPhotos fires (on
    /// photosQueue) for every DECODED payload; onSaveResult fires on the
    /// MAIN thread with the attempt's outcome — together the L3
    /// capabilities scenario can assert "bridge invoked with a valid MP4"
    /// without scraping native UI (photos-log.json via StatusSeam).
    private(set) var decodedCount = 0
    private(set) var droppedCount = 0
    var onDecodedPhotos: ((PhotosMessage) -> Void)?
    var onSaveResult: ((String, Bool, String?) -> Void)?
    #endif

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName else { return }
        let body = message.body // plist values only — queue-hop safe
        photosQueue.async { [weak self] in
            guard let self else { return }
            guard let photos = PhotosMessage.decode(body) else {
                #if DEBUG
                self.droppedCount += 1
                #endif
                return // FR-011: malformed payloads drop silently
            }
            #if DEBUG
            self.decodedCount += 1
            self.onDecodedPhotos?(photos)
            #endif
            self.save(photos)
        }
    }

    /// Runs on photosQueue (the write must never block the UI/JS bridge).
    private func save(_ photos: PhotosMessage) {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ob-photos-\(UUID().uuidString)", isDirectory: true)
        let file = dir.appendingPathComponent(photos.name)
        do {
            try FileManager.default.createDirectory(at: dir,
                                                    withIntermediateDirectories: true)
            try photos.data.write(to: file, options: .atomic)
        } catch {
            report(name: photos.name, ok: false, error: "write-failed",
                   cleaning: dir)
            return
        }
        // .addOnly (photos-bridge contract §4): write-only grant — first save
        // prompts (NSPhotoLibraryAddUsageDescription), later saves reuse
        // the answer. Denied/restricted reports "denied" so the page can
        // point the user at Settings and re-offer the share sheet.
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self else { return }
            guard status == .authorized || status == .limited else {
                self.report(name: photos.name, ok: false, error: "denied",
                            cleaning: dir)
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = photos.name
                request.addResource(with: .video, fileURL: file, options: options)
            }) { ok, error in
                self.report(name: photos.name, ok: ok,
                            error: ok ? nil
                                : (error.map { String(describing: $0) } ?? "save-failed"),
                            cleaning: dir)
            }
        }
    }

    /// Every valid attempt reports exactly once: clean the temp directory
    /// (PhotoKit copied the resource inside performChanges), then dispatch
    /// the result CustomEvent into the page on the main thread
    /// (PhotosResult.script JSON-encodes the detail — unit-gated escaping).
    private func report(name: String, ok: Bool, error: String?,
                        cleaning dir: URL) {
        try? FileManager.default.removeItem(at: dir)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            #if DEBUG
            self.onSaveResult?(name, ok, error)
            #endif
            self.webView?.evaluateJavaScript(
                PhotosResult.script(ok: ok, name: name, error: error),
                completionHandler: nil)
        }
    }
}
