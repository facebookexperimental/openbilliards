// Copyright (c) Meta Platforms, Inc. and affiliates.

// StatusSeam — DEBUG-only L3 container status seam (feature 016 T025;
// the test-pyramid contract 3, data-model 6, research R14). Active
// only under -OBStatusSeam YES. Mirrors the page's scripted-test surfaces
// to Documents/e2e/ in the app container, where the L3 driver
// (ios/tools/e2e-ios.mjs) reads them via simctl get_app_container:
//
//   status.json       {state, touchInstalled, clock, seed, gameId}
//   record-<n>.json   verbatim ShotRecord JSON (SC-003 byte-compare)
//   haptics-log.json  post-rate-bound cue log (SC-005 in-shell compare)
//
// The ENTIRE file is #if DEBUG: release binaries carry ZERO test plumbing
// (FR-011 test-pyramid law).
#if DEBUG
import Foundation
import WebKit

final class StatusSeam {

    /// Poll cadence: bounded, cheap page reads (the L3 driver polls the
    /// files on its own schedule; 500 ms keeps the seam fresher than any
    /// driver assertion window).
    private static let pollInterval: TimeInterval = 0.5

    private weak var webView: WKWebView?
    private weak var haptics: HapticsController?
    private weak var share: ShareController?
    private weak var photos: PhotosController?
    private var timer: Timer?
    private var recordCounter = 0
    private var hapticsLog: [[String: Any]] = []
    private var shareLog: [[String: Any]] = []
    private var photosLog: [[String: Any]] = []
    private let seamDirectory: URL

    /// The page probe. Defensive optional reads over the ?obtool scripted
    /// surfaces (window.__test / window.__touch / window.__aim — the same
    /// globals the 014 web drivers consume); absent surfaces mirror as
    /// null, never as errors. The record is mirrored ONLY when it changes
    /// (the page-side marker window.__obSeamLastRecord is DEBUG/scripted
    /// state, invisible to real users — the seam never runs unstamped).
    private static let probeScript = """
    (() => {
      const t = window.__test;
      const status = {
        state: (t && typeof t.state === 'function') ? t.state() : null,
        touchInstalled: !!(window.__touch && window.__touch.installed),
        clock: (t && typeof t.clock === 'function') ? t.clock()
             : (t && typeof t.duration === 'function') ? t.duration() : null,
        seed: (t && t.seed !== undefined) ? t.seed : null,
        gameId: (t && t.gameId !== undefined) ? t.gameId : null,
        // Root-cause channel for boots that never reach interactive:
        // page errors + unhandled rejections captured by the DEBUG
        // at-document-start seam script, plus the page URL/readyState so
        // a stalled navigation is distinguishable from a stalled boot.
        errors: window.__obErrors || null,
        href: location.href,
        readyState: document.readyState,
      };
      let record = null;
      try {
        const rec = (window.__aim && typeof window.__aim.record === 'function')
          ? window.__aim.record() : null;
        if (rec) {
          const s = JSON.stringify(rec);
          if (s !== window.__obSeamLastRecord) {
            window.__obSeamLastRecord = s;
            record = s;
          }
        }
      } catch (e) { /* record surface absent mid-boot: mirror nothing */ }
      return JSON.stringify({ status: status, record: record });
    })()
    """

    init(webView: WKWebView, haptics: HapticsController?,
         share: ShareController? = nil, photos: PhotosController? = nil) {
        self.webView = webView
        self.haptics = haptics
        self.share = share
        self.photos = photos
        // Seam directory: OB_SEAM_DIR (launch environment, test driver/
        // UITest handoff) overrides the sandbox default. xcodebuild
        // test-without-building REINSTALLS the app per run and every
        // install moves the data container (T038 CI evidence: a new
        // container UUID per scenario, run 29135590139), so a container-
        // relative path is stale the moment the driver resolves it. On
        // the simulator both processes share the host filesystem — a
        // fixed host path is the standard rendezvous. DEBUG-only file.
        if let dir = ProcessInfo.processInfo.environment["OB_SEAM_DIR"],
           !dir.isEmpty {
            self.seamDirectory = URL(fileURLWithPath: dir, isDirectory: true)
        } else {
            let documents = FileManager.default.urls(for: .documentDirectory,
                                                     in: .userDomainMask)[0]
            self.seamDirectory = documents.appendingPathComponent("e2e", isDirectory: true)
        }

        // Post-rate-bound cue log (SC-005): every ADMITTED cue appends in
        // admission order, re-serialized in the wire shape.
        haptics?.onAdmittedCue = { [weak self] cue in
            guard let self else { return }
            self.hapticsLog.append([
                "v": 1,
                "type": cue.type.rawValue,
                "gain": cue.gain,
                "t": cue.t,
            ])
            self.write(json: self.hapticsLog, to: "haptics-log.json")
            self.writeHapticsStats()
        }

        // obShare mirror (issue #51): every DECODED share payload appends
        // {name, mime, bytes, presented:false}; presented flips true when
        // ShareController reports presenter.present actually ran (review
        // F6 — decode-only entries no longer masquerade as end-to-end).
        // Both hooks hop to main: onDecodedShare fires on the controller's
        // serial share queue, onPresentedShare on main — one thread owns
        // shareLog. Main-queue FIFO preserves decode-before-present order.
        share?.onDecodedShare = { [weak self] msg in
            DispatchQueue.main.async {
                guard let self else { return }
                self.shareLog.append([
                    "name": msg.name,
                    "mime": msg.mime,
                    "bytes": msg.data.count,
                    "presented": false,
                ])
                self.write(json: self.shareLog, to: "share-log.json")
            }
        }
        share?.onPresentedShare = { [weak self] name in
            DispatchQueue.main.async {
                guard let self else { return }
                if let i = self.shareLog.lastIndex(where: {
                    ($0["name"] as? String) == name
                        && ($0["presented"] as? Bool) == false
                }) {
                    self.shareLog[i]["presented"] = true
                    self.write(json: self.shareLog, to: "share-log.json")
                }
            }
        }

        // obPhotos mirror (issue #139, the share-log anatomy): every
        // DECODED payload appends {name, mime, bytes, saved: false};
        // saved flips (or the error token lands) when the PHPhotoLibrary
        // attempt reports. Both hooks hop to main — one thread owns
        // photosLog; main-queue FIFO preserves decode-before-result order.
        // The L3 seam can thereby prove "bridge invoked with a valid MP4"
        // without scraping native UI.
        photos?.onDecodedPhotos = { [weak self] msg in
            DispatchQueue.main.async {
                guard let self else { return }
                self.photosLog.append([
                    "name": msg.name,
                    "mime": msg.mime,
                    "bytes": msg.data.count,
                    "saved": false,
                ])
                self.write(json: self.photosLog, to: "photos-log.json")
            }
        }
        photos?.onSaveResult = { [weak self] name, ok, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let i = self.photosLog.lastIndex(where: {
                    ($0["name"] as? String) == name
                        && ($0["saved"] as? Bool) == false
                        && $0["error"] == nil
                }) {
                    self.photosLog[i]["saved"] = ok
                    if let error { self.photosLog[i]["error"] = error }
                    self.write(json: self.photosLog, to: "photos-log.json")
                }
            }
        }
    }

    /// Gate-counter mirror (SC-005 reconciliation arm, 016 L3 round 1c):
    /// {validated, droppedDecode, admitted} — validated - admitted is BY
    /// CONSTRUCTION the rate-limiter drop count (the limiter is the only
    /// gate between the two counters), so the comparator can reconcile the
    /// cue log against the derivation without modeling message-delivery
    /// wall times (which page-side data cannot observe).
    private var lastHapticsStats: [Int] = [-1, -1, -1]

    private func writeHapticsStats() {
        guard let h = haptics else { return }
        let now = [h.validatedCount, h.droppedCount, h.admittedCount]
        guard now != lastHapticsStats else { return }
        lastHapticsStats = now
        write(json: ["validated": now[0], "droppedDecode": now[1], "admitted": now[2]],
              to: "haptics-stats.json")
    }

    func start() {
        try? FileManager.default.createDirectory(at: seamDirectory,
                                                 withIntermediateDirectories: true)
        // Empty log up front so the driver can distinguish "seam alive,
        // zero cues" from "seam absent".
        write(json: hapticsLog, to: "haptics-log.json")
        write(json: shareLog, to: "share-log.json")
        write(json: photosLog, to: "photos-log.json")
        writeHapticsStats()

        let timer = Timer.scheduledTimer(withTimeInterval: Self.pollInterval,
                                         repeats: true) { [weak self] _ in
            self?.tick()
        }
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - poll

    private func tick() {
        guard let webView else { stop(); return }
        writeHapticsStats() // validated/dropped move without an admit
        processCommands()
        webView.evaluateJavaScript(Self.probeScript) { [weak self] result, error in
            guard let self, error == nil,
                  let payload = result as? String,
                  let data = payload.data(using: .utf8),
                  let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }

            if let status = root["status"] as? [String: Any] {
                self.write(json: status, to: "status.json")
            }
            if let record = root["record"] as? String {
                // VERBATIM ShotRecord JSON: the page's JSON.stringify
                // output is written byte-for-byte (SC-003 byte-compare —
                // no native re-serialization).
                self.recordCounter += 1
                self.write(raw: Data(record.utf8),
                           to: "record-\(self.recordCounter).json")
            }
        }
    }

    // MARK: - eval channel (ShellSeams.swift protocol; recorded lane-V
    // deviation reconciled here per its spec: the driver writes
    // cmd-<seq>.json {"id", "js", "saveAs"?}, the shell evaluates js at
    // GLOBAL scope awaiting promises (CDP Runtime.evaluate semantics via
    // indirect eval) and answers res-<seq>.json {"id", "ok", "value":
    // <JSON-encoded result>}; with saveAs the raw value text is also
    // written verbatim to that artifact (record-<n>.json byte fidelity).
    // DEBUG-only like the whole file.

    private var inFlightCmds = Set<Int>()

    private func processCommands() {
        guard let webView else { return }
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: seamDirectory.path) else { return }
        for n in names where n.hasPrefix("cmd-") && n.hasSuffix(".json") {
            guard let id = Int(n.dropFirst(4).dropLast(5)),
                  !inFlightCmds.contains(id) else { continue }
            let resName = "res-\(id).json"
            if fm.fileExists(atPath: seamDirectory.appendingPathComponent(resName).path) {
                continue
            }
            guard let data = try? Data(contentsOf: seamDirectory.appendingPathComponent(n)),
                  let cmd = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let js = cmd["js"] as? String else { continue }
            inFlightCmds.insert(id)
            let saveAs = cmd["saveAs"] as? String
            webView.callAsyncJavaScript(
                """
                const v = await Promise.resolve((0, eval)(js));
                if (v === undefined || v === null) return null;
                // Strings pass through RAW: pre-stringified payloads
                // (resume-probe, derived-cues) stay byte-verbatim in
                // saveAs artifacts and decode to objects client-side —
                // double-encoding made every field read undefined
                // (T038 CI evidence: run 29137238254 lifecycle).
                return typeof v === 'string' ? v : JSON.stringify(v);
                """,
                arguments: ["js": js], in: nil, in: .page) { [weak self] result in
                guard let self else { return }
                self.inFlightCmds.remove(id)
                switch result {
                case .success(let value):
                    var res: [String: Any] = ["id": id, "ok": true]
                    if let text = value as? String {
                        res["value"] = text
                        if let saveAs {
                            self.write(raw: Data(text.utf8), to: saveAs)
                        }
                    } else {
                        res["value"] = NSNull()
                    }
                    self.write(json: res, to: resName)
                case .failure(let error):
                    self.write(json: ["id": id, "ok": false,
                                      "error": String(describing: error)],
                               to: resName)
                }
            }
        }
    }

    // MARK: - atomic writes

    private func write(json object: Any, to name: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: object,
                                                     options: [.sortedKeys]) else { return }
        write(raw: data, to: name)
    }

    private func write(raw data: Data, to name: String) {
        try? data.write(to: seamDirectory.appendingPathComponent(name),
                        options: .atomic)
    }
}
#endif
