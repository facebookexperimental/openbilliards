// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoController — the obSaveVideo bridge endpoint (issue GH-225;
// the 030 Phase C playback destination card). PhotosController precedent:
// message validation (SaveVideoMessage.decode, ShareMessage laws by
// delegation) is ShellCore logic, unit-gated there — this file owns only
// the WKScriptMessageHandler plumbing, the temp-file write, the two
// destination legs, and the ob:save-video-result page callback.
//
// Wire contract (GH-225; ShellCore/SaveVideoMessage.swift documents the
// full shape): playback.js posts ONE message per save —
// {v: 1, name, mime: 'video/mp4'|'video/webm', b64, dest: 'photos'|'files'}
// — pre-flighting the 384 MiB cap page-side, expecting no acknowledgement.
//
// Laws:
// - decode -> temp file -> destination leg; MALFORMED payloads drop
//   silently (FR-011 regime), but a VALID payload's attempt always reports
//   back — success AND failure — via the ob:save-video-result CustomEvent
//   (the PhotosController honesty law; the page does not listen today but
//   the event is the documented adoption point).
// - ONE save in flight (review P1): the slot is reserved on the
//   MAIN thread from the cheap header decode — BEFORE the full base64
//   decode is even queued — so a burst of near-cap posts can never stack
//   multiple ~400 MiB bodies; losers report "busy". The GH-225 RESIDUAL
//   ("WebKit materializes each posted message.body before ANY shell code
//   runs, so only the PAGE can stop a near-cap transfer at the source") is
//   CLOSED by the chunked bridge below (GH-256): the v1 whole-string post
//   survives only as the stale-page degrade, and the page prefers
//   obSaveVideoStream whenever the capability hint advertises `chunk`.
// - dest 'photos': PHPhotoLibrary(.addOnly) add, exactly the obPhotos
//   permission flow (limited counts as authorized; denied/restricted
//   reports "denied"). webm is not Photos-importable and the page runs no
//   transcode tier before this bridge → honest "unsupported-container"
//   rejection, never a fake save.
// - dest 'files': UIDocumentPickerViewController(forExporting:asCopy:) —
//   the user picks the folder; cancel reports "cancelled".
// - dest 'share' (GH-256 follow-up): UIActivityViewController presented
//   FROM the assembled temp file — the ShareController presentation,
//   verbatim, but fed by the CHUNKED transfer instead of the measured v1
//   whole-string obShare post (which survives only for stale pages).
//   Sheet dismissed without an activity reports "cancelled".
// - Bytes are written under a fresh temporaryDirectory subdirectory with
//   the SANITIZED leaf name; the directory is removed after every attempt,
//   and the escaping continuation closures carry only name/URLs — never
//   the payload bytes (review P2: the whole message pinned up to
//   384 MiB across the authorization prompt + PhotoKit transaction).
// - SC-001 untouched: the payload rides the message channel; no request
//   leaves app://local.
import Foundation
import Photos
import UIKit
import WebKit
import ShellCore

final class SaveVideoController: NSObject, WKScriptMessageHandler {

    /// The bridge name: window.webkit.messageHandlers.obSaveVideo.
    static let messageName = "obSaveVideo"

    /// The CHUNKED bridge name (issue GH-256):
    /// window.webkit.messageHandlers.obSaveVideoStream — a
    /// WKScriptMessageHandlerWithReply endpoint, so every op the page posts
    /// is AWAITED and the transfer carries backpressure. The v1
    /// whole-string handler above stays registered for the recorded
    /// stale-page degrade; the page prefers this one whenever the
    /// capability hint advertises `chunk`.
    static let streamMessageName = "obSaveVideoStream"

    /// The destinations this shell honors (the capability hint the page
    /// gates tiles on — SaveVideoCapability, GH-225). `share` (GH-256
    /// follow-up) is the page's signal that the Share tile may ride the
    /// chunked bridge instead of the v1 obShare whole-string post.
    static let dests: [SaveVideoMessage.Dest] = [.photos, .files, .share]

    /// The result-callback channel (the host game web view; weak — set by
    /// GameViewController once the web view exists).
    weak var webView: WKWebView?

    /// The view controller the document picker presents from (the host
    /// game view controller; weak — the ShareController.presenter pattern).
    weak var presenter: UIViewController?

    /// Decode + temp-file write ride ONE SERIAL utility queue
    /// (ShareController review F1 precedent: base64-decoding a
    /// hundreds-of-MB payload on the main thread freezes the UI/JS
    /// bridge). message.body is a plist-bridged value — queue-hop safe.
    private let saveQueue = DispatchQueue(label: "ob-save-video", qos: .utility)

    /// The single in-flight save slot (review P1) — MAIN-thread confined:
    /// taken in userContentController(_:didReceive:), released by the
    /// attempt's terminal report.
    private var inFlight = false

    /// GH-362 layer 3: the newest PRESERVED partial transfer this process
    /// knows of — the crash-grade resume candidate. Set by the launch scan
    /// below and by pageDidReset's preserve; consumed by the v3 `resume`
    /// op; superseded by a fresh v3 `begin`; discarded by an `abort`
    /// naming it. MAIN-confined after init (init runs before any WebKit
    /// callback can).
    private var resumeCandidate: (dir: URL, manifest: SaveVideoStreamManifest)?

    /// The `window.__obResume` documentStart hint for the current
    /// candidate (nil = nothing to offer). GameViewController installs it
    /// at configuration time and re-installs it on every recovery reload —
    /// its presence is ALSO the page's only signal that this shell decodes
    /// the `resume` op, so offer and wire agree by construction.
    func resumeHintScriptSource() -> String? {
        resumeCandidate.map { SaveVideoResume.hintScript($0.manifest) } ?? nil
    }

    override init() {
        super.init()
        // Orphan sweep at launch (review re-gate round 2 P2): iOS can
        // terminate the process while Photos authorization / the picker
        // is outstanding — no completion ever reaches report(), stranding
        // a near-cap clip under temporaryDirectory (whose purging the
        // system does not guarantee). ob-save-video-* names are
        // exclusively ours (the macOS cleanupForTermination precedent).
        //
        // GH-362 layer 3: the sweep learned to PRESERVE — a dir carrying a
        // valid resume manifest younger than 24 h (clip file ≥ extent —
        // SaveVideoResume.candidate) is a crash checkpoint, and the NEWEST
        // one becomes the resume candidate the documentStart hint
        // advertises. The candidate scan is SYNCHRONOUS (a dir listing +
        // tiny JSON reads — the hint must exist before the web view's
        // configuration is built); only the deletions ride saveQueue.
        let fm = FileManager.default
        var keep: (dir: URL, manifest: SaveVideoStreamManifest)?
        var doomed: [URL] = []
        if let entries = try? fm.contentsOfDirectory(
                at: fm.temporaryDirectory, includingPropertiesForKeys: nil) {
            for entry in entries
            where entry.lastPathComponent.hasPrefix("ob-save-video-") {
                guard let m = SaveVideoResume.candidate(inDir: entry) else {
                    doomed.append(entry)
                    continue
                }
                if let cur = keep, cur.manifest.updatedAt >= m.updatedAt {
                    doomed.append(entry)
                } else {
                    if let cur = keep { doomed.append(cur.dir) }
                    keep = (entry, m)
                }
            }
        }
        resumeCandidate = keep
        saveQueue.async {
            for dir in doomed { try? fm.removeItem(at: dir) }
        }
    }

    /// The live document picker's temp directory + payload identity
    /// (MAIN-thread confined; single-valued under the in-flight slot).
    private var pendingPicker: (picker: UIDocumentPickerViewController,
                                dir: URL, name: String)?

    /// The live CHUNKED transfer (GH-256) — MAIN-thread confined, held
    /// under the same single in-flight slot as a v1 post. Its writer's
    /// append/finish run on saveQueue; the page awaits every op, so the
    /// two never overlap.
    private var stream: SaveVideoStreamWriter?

    /// GH-362 layer 3: MAIN-confined mirror of the live writer's resume
    /// manifest, copied in appendChunk's main completion (which runs
    /// strictly AFTER the saveQueue append that wrote it — the reply
    /// ordering law). pageDidReset reads THIS, never writer.manifest,
    /// because a dying page can leave an append mid-flight on saveQueue.
    private var liveManifest: SaveVideoStreamManifest?

    /// Reset generation (GH-362 review r6 P2): bumped by pageDidReset so a
    /// `begin` whose saveQueue work was already in flight when the page
    /// died cannot install an ORPHAN stream afterwards — its main-thread
    /// completion checks the generation it was born under. Main-confined.
    private var resetGen = 0

    /// Abandoned-transfer watchdog: a page that reloads (or is killed)
    /// mid-stream sends no `abort`, and the slot it holds would refuse
    /// every later save for the life of the process. Re-armed by each op.
    private var streamWatchdog: DispatchWorkItem?
    private static let streamIdleTimeout: TimeInterval = 30

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName else { return }
        // Header gate on the MAIN thread (WebKit delivers here): malformed
        // drops silently (FR-011) and a second valid save while one is in
        // flight reports "busy" — both WITHOUT touching the base64 body.
        guard let header = SaveVideoMessage.decodeHeader(message.body) else {
            return
        }
        guard !inFlight else {
            report(name: header.name, dest: header.dest, ok: false,
                   error: "busy", cleaning: nil, releasingSlot: false)
            return
        }
        inFlight = true
        let body = message.body // plist values only — queue-hop safe
        saveQueue.async { [weak self] in
            self?.route(header: header, body: body)
        }
    }

    /// Runs on saveQueue (the write must never block the UI/JS bridge).
    /// The base64 body streams STRAIGHT to disk in bounded chunks
    /// (SaveVideoMessage.decodeBody — review re-gate round 7 P1: the old
    /// full decode held the clip twice, ~900 MiB native peak at cap);
    /// the destination legs receive name + file URLs only (review P2).
    private func route(header: SaveVideoMessage.Header, body: Any) {
        // Container honesty gate BEFORE any disk work: Photos cannot
        // import webm and the page ran no transcode tier (header law).
        if header.dest == .photos && !header.photosImportable {
            report(name: header.name, dest: header.dest, ok: false,
                   error: "unsupported-container", cleaning: nil)
            return
        }
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ob-save-video-\(UUID().uuidString)",
                                    isDirectory: true)
        let file = dir.appendingPathComponent(header.name)
        do {
            try FileManager.default.createDirectory(at: dir,
                                                    withIntermediateDirectories: true)
        } catch {
            report(name: header.name, dest: header.dest, ok: false,
                   error: "write-failed", cleaning: dir)
            return
        }
        switch SaveVideoMessage.decodeBody(body, to: file) {
        case .malformed:
            // header-valid but body-invalid (bad/oversized base64):
            // malformed wire traffic — silent drop, slot freed (FR-011).
            try? FileManager.default.removeItem(at: dir)
            releaseSlot()
            return
        case .writeFailed:
            report(name: header.name, dest: header.dest, ok: false,
                   error: "write-failed", cleaning: dir)
            return
        case .ok:
            break
        }
        switch header.dest {
        case .photos: addToPhotos(name: header.name, file: file, cleaning: dir)
        case .files: exportToFiles(name: header.name, file: file, cleaning: dir)
        case .share: presentShareSheet(name: header.name, file: file, cleaning: dir)
        }
    }

    // MARK: - dest 'photos' (the obPhotos permission flow, verbatim)

    private func addToPhotos(name: String, file: URL, cleaning dir: URL) {
        // .addOnly (photos-bridge contract §4): write-only grant — first save
        // prompts (NSPhotoLibraryAddUsageDescription), later saves reuse
        // the answer. Denied/restricted reports "denied" so the page can
        // point the user at Settings.
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self else { return }
            guard status == .authorized || status == .limited else {
                self.report(name: name, dest: .photos, ok: false,
                            error: "denied", cleaning: dir)
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = name
                request.addResource(with: .video, fileURL: file, options: options)
            }) { ok, error in
                self.report(name: name, dest: .photos, ok: ok,
                            error: ok ? nil
                                : (error.map { String(describing: $0) } ?? "save-failed"),
                            cleaning: dir)
            }
        }
    }

    // MARK: - dest 'share' (activity sheet from the assembled file)

    /// GH-256 follow-up: the Share tile's terminal leg. The
    /// ShareController presentation, verbatim (popover anchor for iPad,
    /// modal-collision guard) — but the file arrives over the CHUNKED
    /// bridge, so the page never builds the whole-clip string the v1
    /// obShare wire required. The completion handler is the ONE report:
    /// completed → ok, dismissed → "cancelled" (the user's own decision),
    /// an activity error → "save-failed".
    private func presentShareSheet(name: String, file: URL, cleaning dir: URL) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let presenter = self.presenter,
                  // another modal already up: refuse rather than fail
                  // silently mid-present, but REPORT it (the files-leg law).
                  presenter.presentedViewController == nil else {
                self.report(name: name, dest: .share, ok: false,
                            error: "busy", cleaning: dir)
                return
            }
            let sheet = UIActivityViewController(activityItems: [file],
                                                 applicationActivities: nil)
            // iPad (TARGETED_DEVICE_FAMILY 1,2): popover anchor required.
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX,
                                            y: presenter.view.bounds.midY,
                                            width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
                let ok = completed && error == nil
                self?.report(name: name, dest: .share, ok: ok,
                             error: ok ? nil
                                 : (error != nil ? "save-failed" : "cancelled"),
                             cleaning: dir)
            }
            presenter.present(sheet, animated: true)
        }
    }

    // MARK: - dest 'files' (document picker export)

    private func exportToFiles(name: String, file: URL, cleaning dir: URL) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let presenter = self.presenter,
                  // another modal already up (share sheet, picker...):
                  // refuse rather than fail silently mid-present (the
                  // ShareController guard), but REPORT it — this payload
                  // was valid.
                  presenter.presentedViewController == nil else {
                self.report(name: name, dest: .files, ok: false,
                            error: "busy", cleaning: dir)
                return
            }
            // asCopy: the system copies the file to the picked folder; the
            // temp directory stays ours to clean in the delegate callbacks.
            let picker = UIDocumentPickerViewController(forExporting: [file],
                                                        asCopy: true)
            picker.delegate = self
            self.pendingPicker = (picker, dir, name)
            presenter.present(picker, animated: true)
        }
    }

    /// Every valid attempt reports exactly once: clean the temp directory
    /// (PhotoKit/the picker copied the resource), free the in-flight slot,
    /// then dispatch the result CustomEvent into the page on the main
    /// thread (SaveVideoResult JSON-encodes the detail — unit-gated
    /// escaping). The "busy" rejection of a CONCURRENT save passes
    /// releasingSlot: false — it must not free the slot the live attempt
    /// holds.
    private func report(name: String, dest: SaveVideoMessage.Dest, ok: Bool,
                        error: String?, cleaning dir: URL?,
                        releasingSlot: Bool = true) {
        if let dir { try? FileManager.default.removeItem(at: dir) }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if releasingSlot { self.inFlight = false }
            self.webView?.evaluateJavaScript(
                SaveVideoResult.script(ok: ok, name: name, dest: dest,
                                       error: error),
                completionHandler: nil)
        }
    }

    /// Silent slot release for the header-valid/body-invalid drop (no
    /// report — FR-011).
    private func releaseSlot() {
        DispatchQueue.main.async { [weak self] in
            self?.inFlight = false
        }
    }
}

// MARK: - the CHUNKED transfer (GH-256) — WKScriptMessageHandlerWithReply

// Why a reply bridge: the v1 wire hands WebKit the whole clip as one
// base64 string, and the app process pays ~4.1x the file size for it
// (measured in real WebKit — SaveVideoStream.swift header). Chunks alone
// are not enough: without an ack the page could queue the whole clip as
// dozens of messages and WebKit would materialize them all. The awaited
// reply IS the backpressure — at most ONE chunk exists anywhere in the
// pipeline, so the transient cost of ANY clip is one chunk.
//
// Laws on top of the v1 ones:
// - the SAME single in-flight slot: `begin` takes it, the terminal report
//   (or an abort/watchdog) frees it, so a v1 post and a stream can never
//   run together.
// - malformed ops REJECT the promise with a short machine token instead of
//   dropping silently: with an awaited wire, a silent drop is a page wedge.
//   The tokens are the ob:save-video-result vocabulary the page already
//   localizes (busy / unsupported-container / write-failed), so a refused
//   transfer says the honest thing without a wire change.
// - exactly ONE ob:save-video-result per COMPLETED transfer (a refused or
//   aborted transfer never became an attempt): the terminal legs are the
//   v1 legs, verbatim.
extension SaveVideoController: WKScriptMessageHandlerWithReply {

    func userContentController(_ userContentController: WKUserContentController,
                              didReceive message: WKScriptMessage,
                              replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.name == Self.streamMessageName else {
            replyHandler(nil, "unknown-bridge")
            return
        }
        guard let op = SaveVideoStreamMessage.decode(message.body) else {
            replyHandler(nil, "malformed")
            return
        }
        switch op {
        case .begin(let begin): beginStream(begin, reply: replyHandler)
        case .chunk(let chunk): appendChunk(chunk, reply: replyHandler)
        case .end(let end): finishStream(end, reply: replyHandler)
        case .abort(let name):
            if stream?.begin.name == name { discardStream() }
            // GH-362 layer 3: an abort naming the PRESERVED candidate is
            // the page's "discard" decision — delete the partial now.
            else if resumeCandidate?.manifest.name == name {
                discardResumeCandidate()
            }
            replyHandler(["ok": true], nil)
        case .resume(let name): resumeStream(name, reply: replyHandler)
        }
    }

    private func beginStream(_ begin: SaveVideoStreamMessage.Begin,
                             reply: @escaping (Any?, String?) -> Void) {
        guard !inFlight else { reply(nil, "busy"); return }
        // Container honesty BEFORE any disk work (the v1 route law).
        guard !(begin.dest == .photos && !begin.photosImportable) else {
            reply(nil, "unsupported-container")
            return
        }
        // Slot taken on the MAIN thread first (the v1 law); directory +
        // writer creation ride saveQueue (review round-3 P2): the launch
        // orphan sweep enumerates ob-save-video-* on that queue, and a
        // main-thread create here could hand the sweep a LIVE transfer to
        // unlink — the writer's open handle would keep accepting chunks
        // while the destination leg later received a nonexistent file.
        // Serialized behind the sweep the race is structurally gone; the
        // page awaits this reply, so no chunk can arrive before `stream`
        // is set on the main thread below.
        inFlight = true
        let gen = resetGen // main-thread read (review r6 P2)
        saveQueue.async { [weak self] in
            let fm = FileManager.default
            let dir = fm.temporaryDirectory
                .appendingPathComponent("ob-save-video-\(UUID().uuidString)",
                                        isDirectory: true)
            let created = (try? fm.createDirectory(
                    at: dir, withIntermediateDirectories: true)) != nil
            let writer = created
                ? SaveVideoStreamWriter(begin: begin, dir: dir) : nil
            if writer == nil { try? fm.removeItem(at: dir) }
            DispatchQueue.main.async {
                guard let self else { reply(nil, "write-failed"); return }
                guard let writer else {
                    self.inFlight = false
                    reply(nil, "write-failed")
                    return
                }
                guard gen == self.resetGen else {
                    // the page died between the slot take and this install
                    // (review r6 P2): an orphan stream here would hold the
                    // slot for the whole reaper window — drop it now.
                    self.inFlight = false
                    self.saveQueue.async {
                        writer.close()
                        try? fm.removeItem(at: writer.dir)
                    }
                    reply(nil, "no-stream")
                    return
                }
                self.stream = writer
                self.liveManifest = nil
                // GH-362 layer 3: a fresh v3 begin supersedes any preserved
                // partial — the page moved on (its own restart offer posts
                // begin too); the checkpoint must not linger as disk debt.
                if begin.bytes == nil { self.discardResumeCandidate() }
                self.armStreamWatchdog()
                reply(["ok": true], nil)
            }
        }
    }

    /// GH-362 layer 3: reopen the preserved partial transfer (the v3
    /// `resume` op). The reply carries { ok, extent, hash } — the flushed
    /// extent and the FNV-1a of the disk prefix [0, extent), which the
    /// page's deterministic re-render must reproduce at the boundary
    /// before a single tail byte posts. Any validation failure deletes
    /// the debt and answers "no-stream" (the page's honest restart offer).
    private func resumeStream(_ name: String,
                              reply: @escaping (Any?, String?) -> Void) {
        guard !inFlight else { reply(nil, "busy"); return }
        guard let cand = resumeCandidate, cand.manifest.name == name else {
            reply(nil, "no-stream")
            return
        }
        inFlight = true
        let gen = resetGen // main-thread read (the begin law)
        saveQueue.async { [weak self] in
            // Re-validate on the queue (the manifest aged since launch;
            // the file may have vanished under storage pressure), then
            // reopen + truncate + hash — bounded reads, nothing clip-sized
            // resident (SaveVideoResume.hashOfFile).
            let manifest = SaveVideoResume.candidate(inDir: cand.dir)
            let writer = manifest.flatMap {
                SaveVideoStreamWriter(resuming: $0, dir: cand.dir)
            }
            let hash = writer.flatMap {
                SaveVideoResume.hashOfFile($0.file, upTo: $0.written)
            }
            DispatchQueue.main.async {
                guard let self else { reply(nil, "no-stream"); return }
                guard let writer, let hash else {
                    // unreopenable/unhashable debt: refuse AND sweep it —
                    // a candidate that cannot resume once never will.
                    self.saveQueue.async { writer?.close() }
                    self.inFlight = false
                    self.discardResumeCandidate()
                    reply(nil, "no-stream")
                    return
                }
                guard gen == self.resetGen else {
                    // the page died between the slot take and this install
                    // (the begin r6 P2 law) — the checkpoint STAYS (it is
                    // still valid; the next boot re-offers it).
                    self.inFlight = false
                    self.saveQueue.async { writer.close() }
                    reply(nil, "no-stream")
                    return
                }
                self.resumeCandidate = nil // it is the live stream now
                self.stream = writer
                self.liveManifest = writer.manifest // pre-crash sidecar —
                // preserves the checkpoint if the page dies AGAIN before
                // its first plan-carrying chunk of this session
                self.armStreamWatchdog() // v3: no-op by design
                reply(["ok": true, "extent": writer.written, "hash": hash],
                      nil)
            }
        }
    }

    /// GH-362 layer 3 (review r18+r19 P2): push a LATE-promoted candidate's
    /// hint into the live page — assignment + the 'ob:resume-hint' event
    /// the page's offer check listens for. The recovery reload can still
    /// be mid-navigation when the promotion lands, so the push retries on
    /// a short backoff (each attempt is idempotent; the guard stands down
    /// once the candidate is consumed or superseded). Main-confined.
    private func pushResumeHint(_ m: SaveVideoStreamManifest, attempt: Int) {
        guard resumeCandidate?.manifest == m,
              let hint = SaveVideoResume.hintScript(m) else { return }
        webView?.evaluateJavaScript(hint
            + " window.dispatchEvent(new Event('ob:resume-hint'));",
            completionHandler: nil)
        guard attempt < 2 else { return }
        DispatchQueue.main.asyncAfter(
            deadline: .now() + (attempt == 0 ? 2 : 6)) { [weak self] in
            self?.pushResumeHint(m, attempt: attempt + 1)
        }
    }

    /// GH-362 layer 3: delete the preserved partial (page discard, begin
    /// supersede, or unreopenable debt). Main-confined like the candidate.
    private func discardResumeCandidate() {
        guard let cand = resumeCandidate else { return }
        resumeCandidate = nil
        saveQueue.async {
            try? FileManager.default.removeItem(at: cand.dir)
        }
    }

    private func appendChunk(_ chunk: SaveVideoStreamMessage.Chunk,
                             reply: @escaping (Any?, String?) -> Void) {
        guard let writer = stream, writer.begin.name == chunk.name else {
            reply(nil, "no-stream")
            return
        }
        armStreamWatchdog()
        // The write rides saveQueue (the v1 law: disk work never blocks the
        // UI/JS bridge); the page awaits this reply, so ordering is exact.
        saveQueue.async { [weak self] in
            let outcome = writer.append(chunk)
            DispatchQueue.main.async {
                guard let self, self.stream === writer else {
                    reply(nil, "no-stream")
                    return
                }
                switch outcome {
                case .ok:
                    // GH-362 layer 3: mirror the writer's sidecar into the
                    // MAIN-confined copy pageDidReset preserves from (this
                    // block runs strictly after the append that wrote it).
                    self.liveManifest = writer.manifest
                    reply(["ok": true], nil)
                case .malformed:
                    self.discardStream()
                    reply(nil, "malformed")
                case .writeFailed:
                    self.discardStream()
                    reply(nil, "write-failed")
                }
            }
        }
    }

    private func finishStream(_ end: SaveVideoStreamMessage.End,
                              reply: @escaping (Any?, String?) -> Void) {
        guard let writer = stream, writer.begin.name == end.name else {
            reply(nil, "no-stream")
            return
        }
        cancelStreamWatchdog()
        saveQueue.async { [weak self] in
            let outcome = writer.finish(end)
            DispatchQueue.main.async {
                guard let self, self.stream === writer else {
                    reply(nil, "no-stream")
                    return
                }
                guard outcome == .ok else {
                    self.discardStream()
                    reply(nil, outcome == .writeFailed
                          ? "write-failed" : "malformed")
                    return
                }
                // The transfer landed: the slot stays taken and the v1
                // destination legs own the rest — including the ONE
                // ob:save-video-result the page is awaiting. finish()
                // already dropped the resume sidecar (a complete file is
                // never a resume candidate).
                self.stream = nil
                self.liveManifest = nil
                reply(["ok": true], nil)
                self.saveQueue.async {
                    switch writer.begin.dest {
                    case .photos:
                        self.addToPhotos(name: writer.begin.name,
                                         file: writer.file, cleaning: writer.dir)
                    case .files:
                        self.exportToFiles(name: writer.begin.name,
                                           file: writer.file, cleaning: writer.dir)
                    case .share:
                        self.presentShareSheet(name: writer.begin.name,
                                               file: writer.file, cleaning: writer.dir)
                    }
                }
            }
        }
    }

    /// The page that owned a live stream is GONE (recovery reload /
    /// web-content termination) — GH-362 review r5 P1: it can never post
    /// `abort`, and with the 15-minute deferred-total reaper the retained
    /// slot would answer `busy` to the reloaded page's every save for the
    /// whole window. This IS the "genuinely dead page" case the reaper
    /// exists for, known immediately instead of by timeout.
    ///
    /// GH-362 layer 3: a MANIFEST-BEARING stream (the page's chunks carried
    /// plan/frame) is a crash checkpoint, not debt — PRESERVE it: close the
    /// handle, keep the dir + sidecar, and promote it to the resume
    /// candidate so the reloaded page's documentStart hint can offer
    /// "continue export". Everything else keeps the discard law.
    ///
    /// Runs INLINE when already on main (performReload rebuilds the user
    /// scripts synchronously right after this call — the promoted candidate
    /// must be visible to that rebuild); the main-async hop is only the
    /// off-main safety net.
    func pageDidReset() {
        let work = { [weak self] in
            guard let self else { return }
            self.resetGen += 1
            // review r22 P2: the promotion applies the SAME freshness law as
            // the launch sweep (SaveVideoResume.fresh) — a layer-2 pause can
            // hold an export frozen past the 24 h window, and a WebContent
            // death after that must not re-offer the expired checkpoint
            // (expiry belongs to the shell window alone — the single-clock
            // law). Stale falls through to the ordinary discard law below.
            if let writer = self.stream, let m = self.liveManifest,
               m.name == writer.begin.name, m.extent > 0,
               SaveVideoResume.fresh(m) {
                self.cancelStreamWatchdog()
                self.stream = nil
                self.liveManifest = nil
                self.inFlight = false
                let dir = writer.dir
                self.saveQueue.async { writer.close() }
                // one candidate: a previously preserved partial (if any)
                // is superseded by the newer checkpoint
                if self.resumeCandidate?.dir != dir {
                    self.discardResumeCandidate()
                }
                self.resumeCandidate = (dir, m)
                return
            }
            if let writer = self.stream, writer.begin.bytes == nil {
                // GH-362 layer 3 (review r1 P2): the page may have died while
                // its FIRST plan-carrying append was still on saveQueue —
                // the sidecar that append is about to write must not be
                // swept by a racing discard. Decide AFTER the queue drains
                // (writer.manifest is saveQueue-confined truth there): a
                // manifest means preserve — the candidate lands too late
                // for THIS reload's documentStart hint, but the checkpoint
                // survives for the next boot — none means the ordinary
                // discard.
                self.cancelStreamWatchdog()
                self.stream = nil
                self.liveManifest = nil
                self.inFlight = false
                self.saveQueue.async { [weak self] in
                    writer.close()
                    let m = writer.manifest
                    // review r22 P2: same freshness law as the inline
                    // promotion above — an expired checkpoint is debt.
                    if let m, m.extent > 0, SaveVideoResume.fresh(m) {
                        DispatchQueue.main.async {
                            guard let self else { return }
                            if self.resumeCandidate?.dir != writer.dir {
                                self.discardResumeCandidate()
                            }
                            self.resumeCandidate = (writer.dir, m)
                            // review r18 P2: this promotion lands AFTER the
                            // recovery reload rebuilt its documentStart
                            // scripts — push the hint into the recovered
                            // page directly (assignment + event; the page
                            // re-runs its offer check on the event; a
                            // pre-layer-3 page ignores both). r19 P2: the
                            // reload may not have COMMITTED yet, so the
                            // push retries on a short backoff (idempotent)
                            // and the hint also lands as a documentStart
                            // user script for any navigation still to come.
                            if let hint = SaveVideoResume.hintScript(m) {
                                self.webView?.configuration
                                    .userContentController.addUserScript(
                                        WKUserScript(source: hint,
                                            injectionTime: .atDocumentStart,
                                            forMainFrameOnly: true))
                            }
                            self.pushResumeHint(m, attempt: 0)
                        }
                    } else {
                        try? FileManager.default.removeItem(at: writer.dir)
                    }
                }
                return
            }
            self.discardStream()
        }
        if Thread.isMainThread { work() }
        else { DispatchQueue.main.async(execute: work) }
    }

    /// Drop a refused/abandoned transfer: close the handle, remove the temp
    /// directory, free the slot. No result event — the transfer never
    /// became an attempt (the page is the one awaiting, and its op reply
    /// already told it the truth).
    private func discardStream() {
        cancelStreamWatchdog()
        liveManifest = nil
        guard let writer = stream else { return }
        stream = nil
        inFlight = false
        saveQueue.async {
            writer.close()
            try? FileManager.default.removeItem(at: writer.dir)
        }
    }

    private func armStreamWatchdog() {
        cancelStreamWatchdog()
        // GH-305/GH-362 (review r9 P2): a DEFERRED-TOTAL (v3) stream has NO
        // idle reaper at all. Its legitimate idle is unbounded — the wire
        // interleaves with a slower-than-realtime encode, and GH-362's
        // pause machinery parks a backgrounded export for however long
        // the user stays away, resuming exactly where it froze; ANY
        // timeout deterministically kills that resumable export. Every
        // genuinely-dead-page path is covered without a clock now:
        // reload/web-content termination → pageDidReset, page-side
        // failure/cancel → the awaited `abort`, app exit → the launch
        // orphan sweep. v2 keeps its 30 s reaper (that wire never
        // legitimately idles — its page posts back-to-back chunks).
        if stream?.begin.bytes == nil { return }
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.streamWatchdog != nil else { return }
            self.discardStream()
        }
        streamWatchdog = item
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.streamIdleTimeout,
                                      execute: item)
    }

    private func cancelStreamWatchdog() {
        streamWatchdog?.cancel()
        streamWatchdog = nil
    }
}

// MARK: - UIDocumentPickerDelegate (main thread)

extension SaveVideoController: UIDocumentPickerDelegate {

    func documentPicker(_ controller: UIDocumentPickerViewController,
                        didPickDocumentsAt urls: [URL]) {
        finish(controller, ok: !urls.isEmpty,
               error: urls.isEmpty ? "export-failed" : nil)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(controller, ok: false, error: "cancelled")
    }

    private func finish(_ controller: UIDocumentPickerViewController,
                        ok: Bool, error: String?) {
        guard let pending = pendingPicker,
              pending.picker === controller else { return }
        pendingPicker = nil
        report(name: pending.name, dest: .files, ok: ok, error: error,
               cleaning: pending.dir)
    }
}
