// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoController (macOS) — the obSaveVideo bridge endpoint (issue
// GH-225; the 030 Phase C playback destination card). The iOS
// SaveVideoController's AppKit sibling (the LifecycleController /
// RecoverySurface same-name-per-shell convention): validation is the
// SHARED ShellCore/SaveVideoMessage (unit-gated there); this file owns the
// WKScriptMessageHandler plumbing, the temp-file write, the NSSavePanel
// leg, and the ob:save-video-result page callback.
//
// Wire contract (GH-225; ShellCore/SaveVideoMessage.swift documents the
// full shape): playback.js posts ONE message per save —
// {v: 1, name, mime: 'video/mp4'|'video/webm', b64, dest: 'photos'|'files'}
// — pre-flighting the 384 MiB cap page-side, expecting no acknowledgement.
//
// Destination posture on THIS shell:
// - dest 'files': decode -> temp file -> ONE NSSavePanel with the
//   sanitized name verbatim (the DownloadController §2.3 panel law) ->
//   ATOMIC replace at the Powerbox-granted URL (stage on the destination
//   volume, swap last — review P1: pre-deleting before a
//   cross-volume move destroyed the user's old file when the move
//   failed). The existing user-selected read-write entitlement is the
//   ONLY write permission — no entitlement change.
// - dest 'photos': HONESTLY REJECTED ("photos-unavailable"). The mac
//   wrapper's entitlements are the pinned three-key FR-014 posture
//   (App/OpenBilliards.entitlements; CI exact-content lint) — no Photos
//   library access, and adding it is a recorded FR-014 deviation this
//   feature does not take. The SaveVideoCapability hint (dests: files
//   only) is the page's documented tile gate.
// Concurrency: ONE save in flight (review P1) — the slot is
// reserved on the MAIN thread from the cheap header decode, BEFORE the
// full base64 decode is queued; losers report "busy". Escaping
// continuations carry only name/URLs, never the payload bytes (review
// P2). Every VALID payload's attempt reports back — success AND failure —
// via the ob:save-video-result CustomEvent (the PhotosController honesty
// law); malformed payloads drop silently (FR-011 regime).
import AppKit
import WebKit
import ShellCore

final class SaveVideoController: NSObject, WKScriptMessageHandler {

    /// The bridge name: window.webkit.messageHandlers.obSaveVideo.
    static let messageName = "obSaveVideo"

    /// The CHUNKED bridge name (issue GH-256 — the iOS sibling's law): a
    /// WKScriptMessageHandlerWithReply endpoint whose awaited ops bound the
    /// transfer's transient memory to ONE chunk. The hazard is the same
    /// class on this shell (WebKit materializes the whole posted body in
    /// the UI process before any shell code runs); the wrapper is not
    /// memory-starved like a phone, but the v1 peak is ~13x the clip size
    /// across three processes here too.
    static let streamMessageName = "obSaveVideoStream"

    /// This shell honors 'files' only (see the header posture note).
    static let dests: [SaveVideoMessage.Dest] = [.files]

    /// The result-callback channel (the host game web view; weak — set by
    /// WebViewHost once the web view exists).
    weak var webView: WKWebView?

    /// The window save panels anchor to (the game window; the
    /// DownloadController.anchorWindow pattern). Set by the boot wiring;
    /// nil falls back to app-modal.
    weak var anchorWindow: NSWindow?

    /// Decode + temp-file write ride ONE SERIAL utility queue (the iOS
    /// ShareController review F1 precedent: base64-decoding a
    /// hundreds-of-MB payload on the main thread freezes the UI/JS
    /// bridge). message.body is a plist-bridged value — queue-hop safe.
    private let saveQueue = DispatchQueue(label: "ob-save-video", qos: .utility)

    /// The single in-flight save slot (review P1) — MAIN-thread confined:
    /// taken in userContentController(_:didReceive:), released by the
    /// attempt's terminal report. Also enforces the ONE-panel-at-a-time
    /// route law (DownloadController §2.3).
    private var inFlight = false

    /// The live CHUNKED transfer (GH-256) — MAIN-thread confined, held
    /// under the same single in-flight slot as a v1 post.
    private var stream: SaveVideoStreamWriter?

    /// Reset generation (GH-362 review r6 P2): bumped by pageDidReset so a
    /// `begin` whose saveQueue work was already in flight when the page
    /// died cannot install an ORPHAN stream afterwards — its main-thread
    /// completion checks the generation it was born under. Main-confined.
    private var resetGen = 0

    /// Abandoned-transfer watchdog: a page that reloads mid-stream sends no
    /// `abort`, and the slot it holds would refuse every later save for the
    /// life of the process. Re-armed by each op.
    private var streamWatchdog: DispatchWorkItem?
    private static let streamIdleTimeout: TimeInterval = 30

    /// GH-362 layer 3: the newest PRESERVED partial transfer — the
    /// crash-grade resume candidate (the iOS sibling's law, verbatim).
    /// MAIN-confined after init.
    private var resumeCandidate: (dir: URL, manifest: SaveVideoStreamManifest)?

    /// GH-362 layer 3: MAIN-confined mirror of the live writer's resume
    /// manifest (copied in appendChunk's main completion — which runs
    /// strictly after the saveQueue append that wrote it). pageDidReset
    /// preserves from THIS, never from writer state a dying page may have
    /// left mid-append.
    private var liveManifest: SaveVideoStreamManifest?

    /// The `window.__obResume` documentStart hint for the current
    /// candidate (nil = nothing to offer). WebViewHost installs it at
    /// configuration time and re-derives it on every recovery reload.
    func resumeHintScriptSource() -> String? {
        resumeCandidate.map { SaveVideoResume.hintScript($0.manifest) } ?? nil
    }

    override init() {
        super.init()
        // Orphan sweep at launch (re-gate round 5 P2, the iOS sibling's
        // sweep): cleanupForTermination runs only on a GRACEFUL quit — a
        // crash/force-quit strands ob-save-video-* temp dirs (up to 384
        // MiB each) until some later clean exit. The prefix is exclusively
        // ours. (Destination-volume staging orphans stay untouchable here
        // — no Powerbox grant exists at launch.)
        //
        // GH-362 layer 3: the sweep PRESERVES manifest-bearing dirs
        // younger than 24 h (SaveVideoResume.candidate — the crash
        // checkpoints) and promotes the newest to the resume candidate.
        // The candidate scan is SYNCHRONOUS (the documentStart hint must
        // exist before the web view's configuration is built); only the
        // deletions ride saveQueue, serialized before any save this
        // process creates.
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
    /// (SaveVideoMessage.decodeBody — review re-gate round 7 P1, the iOS
    /// sibling law: the old full decode held the clip twice in native
    /// memory); the panel leg receives name + file URLs only (review P2).
    private func route(header: SaveVideoMessage.Header, body: Any) {
        guard !isTerminating() else { return } // nothing on disk yet
        guard header.dest == .files else {
            // dest 'photos' on the mac shell: honestly unavailable (the
            // pinned FR-014 entitlement posture — header note). dest
            // 'share' (GH-256 follow-up) is not advertised here either —
            // the capability hint (dests: files only) keeps the page from
            // ever routing it, so this leg is a wire-honesty backstop.
            report(name: header.name, dest: header.dest, ok: false,
                   error: header.dest == .photos
                       ? "photos-unavailable" : "save-failed",
                   cleaning: nil)
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
            // header-valid but body-invalid: malformed wire traffic —
            // silent drop, slot freed (FR-011).
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
        presentPanel(name: header.name, file: file, cleaning: dir)
    }

    private func presentPanel(name: String, file: URL, cleaning dir: URL) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let panel = NSSavePanel()
            // Verbatim passthrough (the DownloadController panel law: no
            // path invention) — no allowedContentTypes, so the page's
            // extension is preserved.
            panel.nameFieldStringValue = name
            panel.isExtensionHidden = false
            panel.canCreateDirectories = true
            let completion: (NSApplication.ModalResponse) -> Void = { [weak self] response in
                guard let self else { return }
                let chosen = response == .OK ? panel.url : nil
                // Replace consent is bound to the occupant read HERE —
                // the first instant the sandbox's Powerbox grant exists
                // (re-gate round 3 P1: any earlier read returns nil in a
                // signed build and voided every legitimate replacement;
                // re-gate round 4 P1: no pre-grant signal can bind the
                // alert-time item either — creation dates survive a
                // rename-into-place). This completion-time read is the
                // platform's floor, and BECAUSE it is only a floor the
                // publish never destroys what it displaces: the round-6
                // re-verify pins this identity across staging, and the
                // displaced item is TRASHED or kept as a .bak, never
                // deleted (the deliver() backup law).
                let consentedID = chosen.flatMap {
                    Self.resourceIdentifier(of: URL(fileURLWithPath: $0.path))
                }
                self.deliver(name: name, from: file, to: chosen,
                             consentedID: consentedID, cleaning: dir)
            }
            if let window = self.anchorWindow {
                panel.beginSheetModal(for: window, completionHandler: completion)
            } else {
                completion(panel.runModal())
            }
        }
    }

    /// File ops back off the main thread (staging copies up to 384 MiB).
    /// nil destination = user cancelled.
    ///
    /// Publish laws (review rounds 1–3):
    /// - The clip is STAGED on the destination volume (the
    ///   itemReplacementDirectory mechanism NSDocument safe-saves use with
    ///   Powerbox URLs), so publishing is a same-volume operation —
    ///   quitting/ejecting/ENOSPC mid-copy can never leave a truncated
    ///   file at the chosen path (round 2 P2); the partial dies hidden in
    ///   staging.
    /// - Replacing an existing file is ONE atomic
    ///   FileManager.replaceItemAt step (round 3 P1: a hand-rolled
    ///   two-move swap left a crash window with the chosen path empty);
    ///   Foundation's safe-save machinery keeps either the original or
    ///   the completed clip at `chosen` throughout.
    /// - If replaceItemAt throws, the original may have been displaced —
    ///   possibly with the staged clip already at `chosen` (round 6 P1):
    ///   the recovery law trusts the error's documented
    ///   "NSFileOriginalItemLocationKey" userInfo entry (NSFileManager.h)
    ///   over any path probe. A reported original is restored to a FREE
    ///   `chosen`; in every other displaced state staging (which may hold
    ///   it) is deliberately LEFT on disk — this code never deletes a
    ///   URL it did not create (rounds 2+6 P1).
    /// - `consentedID` is the panel-time occupant's file resource
    ///   identifier (rounds 5+6 P1): the replace leg runs only when the
    ///   CURRENT occupant still carries it; otherwise the publish is a
    ///   moveItem, which refuses to overwrite — an unconsented or swapped
    ///   occupant fails "write-failed", never a silent overwrite.
    private func deliver(name: String, from file: URL, to chosen: URL?,
                         consentedID: NSObject?, cleaning dir: URL) {
        saveQueue.async { [weak self] in
            guard let self else { return }
            guard !self.isTerminating() else {
                try? FileManager.default.removeItem(at: dir)
                return
            }
            guard let chosen else {
                self.report(name: name, dest: .files, ok: false,
                            error: "cancelled", cleaning: dir)
                return
            }
            // Publish pre-flight (re-gate round 2 P1, scoped by round 4
            // P2 to the FRESH publish only): the no-replace publish
            // needs an atomic primitive — renamex_np(RENAME_EXCL) or
            // link(2). A volume POSITIVELY known to offer neither is
            // rejected HERE, before the up-to-384 MiB staging copy
            // (round 9's "reject before copying" arm): every emulation
            // on such a volume can overwrite or unlink an unconsented
            // occupant. A CONSENTED replacement needs neither primitive
            // (replaceItemAt is its own atomic step) and proceeds; if
            // its occupant is swapped mid-staging it falls to the
            // exclusive move, which then fails honestly. Unknown
            // capabilities proceed the same way.
            if consentedID == nil {
                let volCaps = try? chosen.deletingLastPathComponent()
                    .resourceValues(forKeys: [.volumeSupportsExclusiveRenamingKey,
                                              .volumeSupportsHardLinksKey])
                if volCaps?.volumeSupportsExclusiveRenaming == false,
                   volCaps?.volumeSupportsHardLinks == false {
                    self.report(name: name, dest: .files, ok: false,
                                error: "write-failed", cleaning: dir)
                    return
                }
            }
            let fm = FileManager.default
            var staging: URL?
            var originalSafe = true // false ⇒ staging may hold the only copy
            do {
                let stagingDir = try fm.url(for: .itemReplacementDirectory,
                                            in: .userDomainMask,
                                            appropriateFor: chosen, create: true)
                staging = stagingDir
                self.trackStaging(stagingDir)
                let staged = stagingDir.appendingPathComponent(name)
                try fm.copyItem(at: file, to: staged)
                // Publish window: from here staging may transiently hold
                // Foundation's tombstone of the ORIGINAL — termination
                // cleanup must leave it alone (untrackStaging).
                self.untrackStaging(stagingDir)
                if let consentedID,
                   let currentID = Self.resourceIdentifier(
                        of: URL(fileURLWithPath: chosen.path)),
                   consentedID.isEqual(currentID) {
                    // The occupant is still the ITEM the panel's replace
                    // flow confirmed (rounds 5+6 P1); one atomic
                    // safe-save replacement (round 3 P1). Until the
                    // outcome is POSITIVELY known safe, staging is not
                    // disposable (round 7 P1).
                    originalSafe = false
                    // The displaced occupant is PRESERVED as an explicit
                    // backup (round 7 P1: an occupant swapped in between
                    // the identity read and the replace would otherwise
                    // be destroyed) and at most TRASHED after its
                    // identity verifies as the consented item (re-gate
                    // round 4 P1 — nothing displaced is ever deleted); a
                    // raced-in occupant survives on disk — preservation
                    // over tidiness, this code never deletes what it
                    // cannot identify.
                    let backupName = "\(name).ob-replaced-\(UUID().uuidString).bak"
                    do {
                        _ = try fm.replaceItemAt(chosen, withItemAt: staged,
                                                 backupItemName: backupName,
                                                 options: .withoutDeletingBackupItem)
                        originalSafe = true // displaced item is the backup
                        let backup = chosen.deletingLastPathComponent()
                            .appendingPathComponent(backupName)
                        if let backupID = Self.resourceIdentifier(of: backup),
                           backupID.isEqual(consentedID) {
                            // The replaced occupant matches the consent
                            // read — but that read is the sandbox's
                            // completion-time FLOOR (re-gate rounds 3+4
                            // P1: no pre-grant signal can bind the
                            // alert-time item), so the displaced item is
                            // TRASHED, never deleted: a swap inside the
                            // unclosable confirmation→completion window
                            // stays user-recoverable. No trash on the
                            // volume ⇒ the .bak stays put (preservation
                            // over tidiness).
                            try? fm.trashItem(at: backup,
                                              resultingItemURL: nil)
                        }
                    } catch {
                        // Rounds 2+6+7 P1 recovery law: the reported
                        // location outranks any path probe — a failed
                        // replace may leave the staged clip at `chosen`
                        // with the original displaced elsewhere, and an
                        // OMITTED key can mean "still in a temporary
                        // location" (NSFileManager.h). originalSafe flips
                        // back only on positive knowledge.
                        let ns = error as NSError
                        if let relocated = ns
                            .userInfo["NSFileOriginalItemLocationKey"] as? URL {
                            // Displaced original reported: restore it to a
                            // FREE chosen — atomically no-replace (round 8
                            // P1), so a concurrently created occupant is
                            // never destroyed (the relocated copy is never
                            // deleted in any other state).
                            if (try? Self.moveItemExclusive(at: relocated,
                                                            to: chosen)) != nil {
                                originalSafe = true // restored
                            }
                        } else if let occupantID = Self.resourceIdentifier(
                                        of: URL(fileURLWithPath: chosen.path)),
                                  occupantID.isEqual(consentedID) {
                            originalSafe = true // original still at chosen
                        } else if let rescued = Self.recoverDisplacedOriginal(
                                        in: stagingDir, matching: consentedID,
                                        restoringTo: chosen) {
                            // Re-gate round 2 P1: an unreported displaced
                            // original may sit tombstoned INSIDE the
                            // item-replacement staging, which Foundation
                            // does not guarantee survives app exit —
                            // identity-verified, it now lives in durable
                            // Application Support storage instead.
                            originalSafe = true
                            NSLog("[obSaveVideo] replace failed; the displaced"
                                + " original was preserved at %@", rescued.path)
                        }
                        // every other state is ambiguous: staging (which
                        // may hold the only original) stays on disk
                        throw error
                    }
                } else {
                    // No consent, consented file vanished, or the occupant
                    // was SWAPPED mid-save (round 6 P1): publish with the
                    // atomic no-replace rename (round 8 P1 — moveItem is
                    // check-then-rename and the rename replaces), so ANY
                    // occupant — even one created this instant — fails
                    // write-failed instead of being overwritten.
                    try Self.moveItemExclusive(at: staged, to: chosen)
                }
                if let staging { try? fm.removeItem(at: staging) }
                self.report(name: name, dest: .files, ok: true,
                            error: nil, cleaning: dir)
            } catch {
                if let staging {
                    self.untrackStaging(staging)
                    if originalSafe { try? fm.removeItem(at: staging) }
                }
                self.report(name: name, dest: .files, ok: false,
                            error: "write-failed", cleaning: dir)
            }
        }
    }

    /// The occupant's filesystem identity (URLResourceKey
    /// .fileResourceIdentifierKey — stable across renames, distinct
    /// across replacements), read FRESH (URL resource caches are
    /// per-instance; callers pass a new URL for re-checks). nil when
    /// nothing exists at the URL.
    private static func resourceIdentifier(of url: URL) -> NSObject? {
        (try? url.resourceValues(forKeys: [.fileResourceIdentifierKey]))?
            .fileResourceIdentifier as? NSObject
    }

    /// Atomic no-replace move (review round 8 P1):
    /// FileManager.moveItem is check-then-rename, and rename(2) REPLACES
    /// an existing destination — a file created between the check and
    /// the rename would be destroyed without consent.
    /// renamex_np(RENAME_EXCL) fails with EEXIST atomically instead.
    /// Both publish moves stage on the destination volume, so the
    /// same-volume constraint holds by construction (a cross-volume
    /// staging fallback fails EXDEV into the honest write-failed path).
    ///
    /// Volumes WITHOUT VOL_CAP_INT_RENAME_EXCL (network mounts and
    /// non-native formats) return ENOTSUP (review round 9 P2: a valid
    /// Powerbox grant on such a volume always failed write-failed).
    /// The ONE safe emulation is link(2)+unlink — link is an atomic
    /// no-replace publish (EEXIST on any occupant) where hard links
    /// exist. Volumes with NEITHER primitive were already rejected
    /// before the staging copy (the deliver pre-flight): every
    /// claim-then-rename emulation there can overwrite or unlink an
    /// occupant it never got consent for (re-gate round 2 P1 — the
    /// round-9 fopen("wx")+rename leg was itself that race).
    private static func moveItemExclusive(at src: URL, to dst: URL) throws {
        let status = src.withUnsafeFileSystemRepresentation { s in
            dst.withUnsafeFileSystemRepresentation { d in
                renamex_np(s, d, UInt32(RENAME_EXCL))
            }
        }
        if status == 0 { return }
        let renameErrno = errno
        guard renameErrno == ENOTSUP else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(renameErrno),
                          userInfo: [NSFilePathErrorKey: dst.path])
        }
        try moveItemExclusiveEmulated(at: src, to: dst)
    }

    /// The ENOTSUP leg (header doc above). Runs on saveQueue.
    private static func moveItemExclusiveEmulated(at src: URL, to dst: URL) throws {
        let linkStatus = src.withUnsafeFileSystemRepresentation { s in
            dst.withUnsafeFileSystemRepresentation { d in
                link(s, d)
            }
        }
        guard linkStatus == 0 else {
            // EEXIST (an occupant — the honest no-replace refusal) and
            // every other failure surface as write-failed upstream; a
            // link-less volume slipping past the pre-flight lands here
            // too, honestly, instead of any racy claim emulation.
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno),
                          userInfo: [NSFilePathErrorKey: dst.path])
        }
        // Published. Drop the source leg best-effort: the fresh path's
        // staging-dir cleanup would cover it, but the recovery path's
        // src (a displaced original) lives outside staging.
        _ = src.withUnsafeFileSystemRepresentation { s in unlink(s) }
    }

    /// Re-gate round 2 P1: replaceItemAt failed with the original
    /// displaced, unreported, and no longer at `chosen` — Foundation's
    /// safe-save machinery may have tombstoned it INSIDE the
    /// item-replacement staging directory, which is not guaranteed to
    /// survive app exit. Identify it by the consented file resource
    /// identifier, then (re-gate round 5 P1) restore it to a FREE
    /// `chosen` first — the user's file reappears at its own visible
    /// location, atomically no-replace so a raced-in occupant is never
    /// destroyed — and only when that restore is refused move it into
    /// durable Application Support storage (cross-volume: Foundation
    /// copies then removes). Returns the recovery URL only when an
    /// identity-verified copy is now safe; nil touches nothing
    /// (preservation law: never move what cannot be identified).
    private static func recoverDisplacedOriginal(in staging: URL,
                                                 matching consentedID: NSObject,
                                                 restoringTo chosen: URL) -> URL? {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(
                at: staging, includingPropertiesForKeys: nil) else { return nil }
        for entry in entries {
            guard let id = resourceIdentifier(of: entry),
                  id.isEqual(consentedID) else { continue }
            if (try? moveItemExclusive(at: entry, to: chosen)) != nil {
                return chosen // restored where the user expects it
            }
            guard let support = try? fm.url(for: .applicationSupportDirectory,
                                            in: .userDomainMask,
                                            appropriateFor: nil, create: true)
            else { return nil }
            let rescueDir = support.appendingPathComponent(
                "Recovered-\(UUID().uuidString)", isDirectory: true)
            let rescued = rescueDir.appendingPathComponent(
                chosen.lastPathComponent)
            do {
                try fm.createDirectory(at: rescueDir,
                                       withIntermediateDirectories: true)
                try fm.moveItem(at: entry, to: rescued)
                return rescued
            } catch {
                try? fm.removeItem(at: rescueDir)
                return nil
            }
        }
        return nil
    }

    // MARK: - termination cleanup (review round 3 P2)

    /// Staging directories currently safe to delete (they hold only OUR
    /// staged copy — entries are removed before the publish step, when
    /// Foundation's safe-save tombstone could transiently place the
    /// user's ORIGINAL inside). Lock-guarded: saveQueue writes, the main
    /// thread reads at termination. The same lock guards `terminating`.
    private let stagingLock = NSLock()
    private var deletableStaging: Set<URL> = []
    private var terminating = false

    private func isTerminating() -> Bool {
        stagingLock.lock(); defer { stagingLock.unlock() }
        return terminating
    }

    private func trackStaging(_ url: URL) {
        stagingLock.lock(); defer { stagingLock.unlock() }
        deletableStaging.insert(url)
    }

    private func untrackStaging(_ url: URL) {
        stagingLock.lock(); defer { stagingLock.unlock() }
        deletableStaging.remove(url)
    }

    /// Quit-during-save cleanup (the DownloadController
    /// cancelAllRoutesForTermination precedent; review round 3 P2): an
    /// interrupted save can leave a near-cap clip in temporaryDirectory
    /// (panel open, copy running) plus a staged copy. Removes every
    /// ob-save-video temp directory — INCLUDING orphans from prior
    /// crashes — and the tracked (delete-safe) staging directories;
    /// staging possibly holding a tombstoned original is deliberately
    /// left. Wired from applicationWillTerminate (main thread).
    func cleanupForTermination() {
        // Quiesce first (review round 5 P2): mark terminating so queued
        // work aborts at its next gate, then drain the serial queue —
        // otherwise a mid-decode/mid-copy job could create a temp dir
        // AFTER the sweep below and strand a near-cap clip on disk. The
        // drain is BOUNDED (round 7 P2): a copy wedged on slow or
        // disconnected media must not beachball the quit. On timeout the
        // sweep still runs — temp dirs are ours alone (a mid-copy job
        // just fails into its error path), staging deletion stays
        // lock-serialized against the publish window, and anything a
        // wedged job strands is an ob-save-video-* orphan the NEXT
        // termination sweep removes.
        stagingLock.lock()
        terminating = true
        stagingLock.unlock()
        let drained = DispatchWorkItem {}
        saveQueue.async(execute: drained)
        let drainedInTime = drained.wait(timeout: .now() + .seconds(3)) == .success
        let fm = FileManager.default
        let tmp = fm.temporaryDirectory
        if let entries = try? fm.contentsOfDirectory(
                at: tmp, includingPropertiesForKeys: nil) {
            for entry in entries
            where entry.lastPathComponent.hasPrefix("ob-save-video-") {
                // GH-362 layer 3: a quit mid-export leaves a crash
                // checkpoint too — manifest-bearing dirs younger than 24 h
                // survive the termination sweep exactly like the launch
                // sweep, so the NEXT launch can offer "continue export".
                if SaveVideoResume.candidate(inDir: entry) != nil { continue }
                try? fm.removeItem(at: entry)
            }
        }
        // Destination-volume cleanup only after a CLEAN drain (round 8
        // P2): a timed-out drain means that volume is wedged — synchronous
        // removeItem there would hang the quit past the 3 s bound. The
        // stranded staging dirs are hidden safe-save directories, not
        // user-visible files.
        guard drainedInTime else { return }
        // Deletion stays INSIDE the critical section (review round 4 P1):
        // a snapshot-then-delete let untrackStaging() return — and the
        // publish step begin — between the unlock and the removal, so the
        // loop could destroy a directory just as Foundation's safe-save
        // tombstone moved the user's ORIGINAL into it. Under the lock, a
        // dir is either still tracked (holds only OUR copy — deletable;
        // the save's next file op then fails into its write-failed path
        // with the original untouched) or already untracked (left alone).
        stagingLock.lock()
        for url in deletableStaging {
            try? fm.removeItem(at: url)
        }
        deletableStaging.removeAll()
        stagingLock.unlock()
    }

    /// Every valid attempt reports exactly once: clean the temp directory,
    /// free the in-flight slot, then dispatch the result CustomEvent into
    /// the page on the main thread (SaveVideoResult JSON-encodes the
    /// detail — unit-gated escaping in ShellCore). The "busy" rejection of
    /// a CONCURRENT save passes releasingSlot: false — it must not free
    /// the slot the live attempt holds.
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

// The iOS SaveVideoController extension's laws, verbatim (that file's
// header documents WHY the reply bridge is the backpressure): the same
// single in-flight slot, malformed ops REJECT the awaited promise with a
// short machine token instead of dropping silently (a silent drop on an
// awaited wire is a page wedge), and exactly ONE ob:save-video-result per
// COMPLETED transfer — the terminal leg is this shell's NSSavePanel
// publish, unchanged.
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
        guard !isTerminating() else { reply(nil, "busy"); return }
        guard !inFlight else { reply(nil, "busy"); return }
        // dest 'photos'/'share' on the mac shell: honestly refused BEFORE
        // any disk work (the pinned FR-014 entitlement posture — header
        // note; the capability hint advertises files only, so the page
        // never routes either here).
        guard begin.dest == .files else {
            reply(nil, begin.dest == .photos
                  ? "photos-unavailable" : "save-failed")
            return
        }
        // Slot on the MAIN thread first; directory + writer creation ride
        // saveQueue (review round-3 P2, the iOS sibling law): the launch
        // orphan sweep enumerates ob-save-video-* on that queue, and a
        // main-thread create here raced it — the sweep could unlink a LIVE
        // transfer whose open handle kept accepting chunks. The page
        // awaits this reply, so no chunk precedes `stream` being set.
        inFlight = true
        let gen = resetGen // main-thread read (review r6 P2)
        saveQueue.async { [weak self] in
            guard let self, !self.isTerminating() else {
                DispatchQueue.main.async {
                    self?.inFlight = false
                    reply(nil, "busy")
                }
                return
            }
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
                // partial — the page moved on (the iOS sibling's law).
                if begin.bytes == nil { self.discardResumeCandidate() }
                self.armStreamWatchdog()
                reply(["ok": true], nil)
            }
        }
    }

    /// GH-362 layer 3: reopen the preserved partial transfer (the v3
    /// `resume` op) — the iOS sibling's law verbatim: re-validate on the
    /// queue, truncate to the manifest extent, hash the disk prefix, and
    /// reply { ok, extent, hash } for the page's boundary check. Any
    /// validation failure sweeps the debt and answers "no-stream" (the
    /// page's honest restart offer).
    private func resumeStream(_ name: String,
                              reply: @escaping (Any?, String?) -> Void) {
        guard !isTerminating() else { reply(nil, "busy"); return }
        guard !inFlight else { reply(nil, "busy"); return }
        guard let cand = resumeCandidate, cand.manifest.name == name else {
            reply(nil, "no-stream")
            return
        }
        inFlight = true
        let gen = resetGen // main-thread read (the begin law)
        saveQueue.async { [weak self] in
            guard let self, !self.isTerminating() else {
                DispatchQueue.main.async {
                    self?.inFlight = false
                    reply(nil, "busy")
                }
                return
            }
            let manifest = SaveVideoResume.candidate(inDir: cand.dir)
            let writer = manifest.flatMap {
                SaveVideoStreamWriter(resuming: $0, dir: cand.dir)
            }
            let hash = writer.flatMap {
                SaveVideoResume.hashOfFile($0.file, upTo: $0.written)
            }
            DispatchQueue.main.async {
                guard let writer, let hash else {
                    self.saveQueue.async { writer?.close() }
                    self.inFlight = false
                    self.discardResumeCandidate()
                    reply(nil, "no-stream")
                    return
                }
                guard gen == self.resetGen else {
                    // the page died between the slot take and this install
                    // — the checkpoint STAYS (still valid; re-offered).
                    self.inFlight = false
                    self.saveQueue.async { writer.close() }
                    reply(nil, "no-stream")
                    return
                }
                self.resumeCandidate = nil // it is the live stream now
                self.stream = writer
                self.liveManifest = writer.manifest
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
                    // MAIN-confined copy pageDidReset preserves from.
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
                self.stream = nil
                self.liveManifest = nil // finish() dropped the sidecar
                reply(["ok": true], nil)
                self.saveQueue.async {
                    guard !self.isTerminating() else {
                        try? FileManager.default.removeItem(at: writer.dir)
                        return
                    }
                    self.presentPanel(name: writer.begin.name,
                                      file: writer.file, cleaning: writer.dir)
                }
            }
        }
    }

    /// Drop a refused/abandoned transfer (no result event — it never became
    /// an attempt; the op reply already told the page the truth).
    /// The page that owned a live stream is GONE (recovery reload /
    /// web-content termination) — GH-362 review r5 P1: it can never post
    /// `abort`, and with the 15-minute deferred-total reaper the retained
    /// slot would answer `busy` to the reloaded page's every save for the
    /// whole window. This IS the "genuinely dead page" case the reaper
    /// exists for, known immediately instead of by timeout.
    ///
    /// GH-362 layer 3: a MANIFEST-BEARING stream is a crash checkpoint,
    /// not debt — PRESERVE it (close the handle, keep dir + sidecar,
    /// promote to resume candidate). Runs INLINE when already on main so
    /// performReload's script rebuild sees the promotion (the iOS
    /// sibling's law).
    func pageDidReset() {
        let work = { [weak self] in
            guard let self else { return }
            self.resetGen += 1
            // review r22 P2 (the iOS sibling's law): the promotion applies
            // the SAME freshness law as the launch sweep — a layer-2 pause
            // can hold an export frozen past the 24 h window, and a page
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
                if self.resumeCandidate?.dir != dir {
                    self.discardResumeCandidate()
                }
                self.resumeCandidate = (dir, m)
                return
            }
            if let writer = self.stream, writer.begin.bytes == nil {
                // GH-362 layer 3 (review r1 P2, the iOS sibling's law): the
                // page may have died while its FIRST plan-carrying append
                // was still on saveQueue — decide preserve-vs-discard AFTER
                // the queue drains (writer.manifest is saveQueue-confined
                // truth there); a late-promoted candidate misses THIS
                // reload's hint but survives for the next boot.
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
        // GH-305/GH-362 (review r9 P2 — the iOS sibling's law): a
        // DEFERRED-TOTAL (v3) stream has NO idle reaper at all. Its
        // legitimate idle is unbounded (slower-than-realtime encode; the
        // GH-362 pause machinery parks a hidden/App-Napped export for
        // however long), and ANY timeout deterministically kills that
        // resumable export. Every genuinely-dead-page path is covered
        // without a clock: reload/web-content termination → pageDidReset,
        // page-side failure/cancel → the awaited `abort`, app exit → the
        // launch orphan sweep + cleanupForTermination. v2 keeps its 30 s
        // reaper (that wire never legitimately idles).
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

