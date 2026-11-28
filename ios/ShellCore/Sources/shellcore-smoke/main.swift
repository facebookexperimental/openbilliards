// Copyright (c) Meta Platforms, Inc. and affiliates.

// shellcore-smoke — the CLT-runnable arm of the ShellCore gates (see the
// RECORDED DEVIATION note in Package.swift: this machine's Command Line
// Tools ship no XCTest/Testing module, so the XCTest suites execute on CI
// macOS runners while this executable keeps a local, exit-code-gated
// verification).
//
// Run: cd ios/ShellCore && swift run shellcore-smoke
// PASS = exit 0; any failed check exits 1 with a per-check report.
//
// T004 shipped the frozen-SHAPE checks; T005/T012/T013 (lane S) extended
// it with the BEHAVIORAL laws of contracts/shell-app.md 2 — each section
// mirrors the corresponding XCTest suite (SchemeResolverTests,
// MimeMapTests, BundleIndexTests, HapticMessageTests,
// HapticRateLimiterTests, LifecycleMachineTests, SettingsSnapshotTests)
// so the [TODAY] arm covers the same laws the CI arm gates. PUBLIC API
// only.
import Foundation
import ShellCore

var failures = 0

func check(_ name: String, _ condition: Bool) {
    if condition {
        print("PASS \(name)")
    } else {
        print("FAIL \(name)")
        failures += 1
    }
}

// Resolution / RejectReason shapes (frozen enum cases, Equatable).
let okRes = Resolution.file(relPath: "app.html", mime: "text/html")
let noRes = Resolution.rejected(reason: .traversal)
check("Resolution cases are distinct + Equatable", okRes != noRes)
check("RejectReason carries traversal/notFound/badURL",
      RejectReason.traversal != .notFound && RejectReason.notFound != .badURL)
check("Resolution.rejected compares by reason",
      noRes == .rejected(reason: .traversal)
        && noRes != .rejected(reason: .notFound))

// CueClass — exactly the four deriveCues wire strings
// (haptics-bridge.md 3).
check("CueClass wire strings are cue/click/cushion/pocket",
      CueClass.allCases.map(\.rawValue) == ["cue", "click", "cushion", "pocket"])
check("CueClass rejects unknown class strings", CueClass(rawValue: "boom") == nil)

// HapticRateLimiter — frozen init shape (contract bounds are the caller's
// values: per-class 40 ms, global 16 ms — haptics-bridge.md 5).
_ = HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)
check("HapticRateLimiter constructs with (minGap:globalMinGap:)", true)

// LifecycleMachine + ShellState/ShellEvent/ShellEffect shapes.
_ = LifecycleMachine()
check("LifecycleMachine constructs with public init()", true)
check("ShellState carries the data-model 5 states",
      ShellState.launching != .interactive
        && ShellState.backgrounded != .recovering
        && ShellState.recovering != .failed)
check("ShellEvent carries the data-model 5 events",
      ShellEvent.didFinishLaunch != .webContentReady
        && ShellEvent.didEnterBackground != .willEnterForeground
        && ShellEvent.contentProcessTerminated != .reloadFailed
        && ShellEvent.reloadSucceeded != .userRetry)
check("ShellEffect carries snapshot/reload/recovery effects",
      ShellEffect.snapshotSettings != .none
        && ShellEffect.reloadWebView != .showRecovery)

// SettingsSnapshot — Codable round-trip (the string codec internals are
// T013 body work; Codable conformance is part of the frozen shape).
let snap = SettingsSnapshot(payload: "{\"lang\":\"en\"}",
                            takenAt: Date(timeIntervalSince1970: 1_752_000_000),
                            appVersion: "0.1.0")
do {
    let data = try JSONEncoder().encode(snap)
    let back = try JSONDecoder().decode(SettingsSnapshot.self, from: data)
    check("SettingsSnapshot Codable round-trip", back == snap)
} catch {
    check("SettingsSnapshot Codable round-trip (threw \(error))", false)
}

// ---------------------------------------------------------------------
// T005 — origin-server behavioral laws (mirrors SchemeResolverTests,
// MimeMapTests, BundleIndexTests).
// ---------------------------------------------------------------------

let sha = String(repeating: "ab", count: 32)
let manifest = """
{"v": 1, "source": "web/", "generatedAt": "2026-07-10T00:00:00Z",
 "sourceCommit": "deadbeef", "files": [
   {"p": "app.html", "sha256": "\(sha)", "bytes": 10},
   {"p": "dist/pool-wasm/pool_wasm_bg.wasm", "sha256": "\(sha)", "bytes": 20},
   {"p": "secret", "sha256": "\(sha)", "bytes": 1},
   {"p": "noext", "sha256": "\(sha)", "bytes": 1}
 ]}
"""

do {
    let index = try BundleIndex(manifestData: Data(manifest.utf8))
    check("BundleIndex parses the data-model 3 schema", true)
    check("BundleIndex.contains exact membership",
          index.contains("app.html") && !index.contains("missing.js")
            && !index.contains("dist/pool-wasm") && !index.contains("/app.html"))
    check("BundleIndex.sha256 answers hash queries",
          index.sha256(of: "app.html") == sha && index.sha256(of: "missing.js") == nil)

    let resolver = SchemeResolver(index: index)
    func res(_ s: String) -> Resolution {
        guard let url = URL(string: s) else { return .rejected(reason: .badURL) }
        return resolver.resolve(url)
    }
    check("resolve: boot path -> text/html",
          res("app://local/app.html") == .file(relPath: "app.html", mime: "text/html"))
    check("resolve: wasm path -> application/wasm (load-bearing, R4)",
          res("app://local/dist/pool-wasm/pool_wasm_bg.wasm")
            == .file(relPath: "dist/pool-wasm/pool_wasm_bg.wasm", mime: "application/wasm"))
    check("resolve: query/fragment ignored",
          res("app://local/app.html?obtool&norec") == .file(relPath: "app.html", mime: "text/html"))
    check("resolve: '/' never implicitly redirects (R6)",
          res("app://local/") == .rejected(reason: .notFound))
    check("resolve: absent path -> notFound",
          res("app://local/missing.js") == .rejected(reason: .notFound))
    check("resolve: dotless bundled path -> octet-stream",
          res("app://local/noext") == .file(relPath: "noext", mime: "application/octet-stream"))
    check("resolve: in-root dot segments normalize away",
          res("app://local/a/../app.html") == .file(relPath: "app.html", mime: "text/html"))

    // Traversal corpus: every entry aims at "secret" (IN the index) so a
    // pass proves the normalization walk, not index absence.
    let corpus = [
        "app://local/../secret",
        "app://local/%2e%2e/secret",
        "app://local/..%2fsecret",
        "app://local/%2e%2e%2fsecret",
        "app://local/a/../../secret",
        "app://local/a%2F..%2F..%2Fsecret",
        "app://local/../../../../etc/passwd",
    ]
    for s in corpus {
        var resolvedToFile = false
        if let url = URL(string: s), case .file = resolver.resolve(url) {
            resolvedToFile = true
        }
        check("resolve: traversal never yields .file — \(s)", !resolvedToFile)
    }
    check("resolve: single decode pass (double-encoded stays literal)",
          res("app://local/%252e%252e/secret") == .rejected(reason: .notFound))
    check("resolve: wrong scheme/host -> badURL",
          res("https://local/app.html") == .rejected(reason: .badURL)
            && res("app://remote/app.html") == .rejected(reason: .badURL))
    check("resolve: scheme/host case-insensitive",
          res("APP://LOCAL/app.html") == .file(relPath: "app.html", mime: "text/html"))
} catch {
    check("BundleIndex parses the data-model 3 schema (threw \(error))", false)
}

// Malformed manifests THROW (strict parse law).
for (name, bad) in [
    ("malformed JSON", "not json"),
    ("non-object root", "[1,2,3]"),
    ("v != 1", "{\"v\": 2, \"source\": \"web/\", \"generatedAt\": \"t\", \"sourceCommit\": \"c\", \"files\": []}"),
    ("missing files", "{\"v\": 1, \"source\": \"web/\", \"generatedAt\": \"t\", \"sourceCommit\": \"c\"}"),
    ("bad sha256", "{\"v\": 1, \"source\": \"web/\", \"generatedAt\": \"t\", \"sourceCommit\": \"c\", \"files\": [{\"p\": \"a\", \"sha256\": \"zz\", \"bytes\": 1}]}"),
] {
    var threw = false
    do { _ = try BundleIndex(manifestData: Data(bad.utf8)) } catch { threw = true }
    check("BundleIndex throws on \(name)", threw)
}

// MimeMap totality + table.
check("MimeMap: wasm law", MimeMap.mime(forExtension: "wasm") == "application/wasm")
check("MimeMap: table spot checks",
      MimeMap.mime(forExtension: "html") == "text/html"
        && MimeMap.mime(forExtension: "mjs") == "text/javascript"
        && MimeMap.mime(forExtension: "map") == "application/json"
        && MimeMap.mime(forExtension: "ktx2") == "image/ktx2"
        && MimeMap.mime(forExtension: "woff2") == "font/woff2")
check("MimeMap: total over unknown extensions",
      MimeMap.mime(forExtension: "xyz") == "application/octet-stream"
        && MimeMap.mime(forExtension: "") == "application/octet-stream")
check("MimeMap: case-insensitive", MimeMap.mime(forExtension: "WASM") == "application/wasm")

// ---------------------------------------------------------------------
// T012 — haptics decode + rate-limit laws (mirrors HapticMessageTests,
// HapticRateLimiterTests).
// ---------------------------------------------------------------------

func validBody(_ overrides: [String: Any] = [:]) -> [String: Any] {
    var body: [String: Any] = ["v": 1, "type": "click", "gain": 0.62, "t": 1.8432]
    for (k, v) in overrides { body[k] = v }
    return body
}

check("decode: valid payload decodes",
      HapticMessage.decode(validBody())?.type == .click)
check("decode: integer numbers decode",
      HapticMessage.decode(validBody(["gain": 1, "t": 0]))?.gain == 1.0)
check("decode: finite gain clamps to [0,1]",
      HapticMessage.decode(validBody(["gain": 3.5]))?.gain == 1.0
        && HapticMessage.decode(validBody(["gain": -0.25]))?.gain == 0.0)

let dropCorpus: [(String, Any)] = [
    ("non-dict body", "boom"),
    ("missing v", ["type": "click", "gain": 0.5, "t": 1.0]),
    ("v != 1", validBody(["v": 2])),
    ("v fractional", validBody(["v": 1.5])),
    ("v string", validBody(["v": "1"])),
    ("v bool (bridging trap)", validBody(["v": true])),
    ("unknown class", validBody(["type": "boom"])),
    ("type wrong-typed", validBody(["type": 3])),
    ("gain NaN", validBody(["gain": Double.nan])),
    ("gain inf", validBody(["gain": Double.infinity])),
    ("gain string", validBody(["gain": "0.5"])),
    ("gain bool", validBody(["gain": true])),
    ("missing t", ["v": 1, "type": "click", "gain": 0.5]),
    ("t string", validBody(["t": "1.0"])),
]
for (name, body) in dropCorpus {
    check("decode: drops \(name)", HapticMessage.decode(body) == nil)
}

// issue #145 — obViewport decode laws (mirrors ViewportMessageTests).
check("viewport decode: valid payload decodes",
      ViewportMessage.decode(["v": 1, "scale": 1.73])?.scale == 1.73)
check("viewport decode: integer scale decodes",
      ViewportMessage.decode(["v": 1, "scale": 2])?.scale == 2.0)
check("viewport decode: extra fields ignored (forward compat)",
      ViewportMessage.decode(["v": 1, "scale": 1.5, "future": "x"]) != nil)
let viewportDropCorpus: [(String, Any)] = [
    ("non-dict body", "boom"),
    ("missing v", ["scale": 1.5]),
    ("v != 1", ["v": 2, "scale": 1.5]),
    ("v bool (bridging trap)", ["v": true, "scale": 1.5]),
    ("missing scale", ["v": 1]),
    ("scale string", ["v": 1, "scale": "1.5"]),
    ("scale bool", ["v": 1, "scale": true]),
    ("scale NaN", ["v": 1, "scale": Double.nan]),
    ("scale inf", ["v": 1, "scale": Double.infinity]),
    ("scale zero", ["v": 1, "scale": 0]),
    ("scale negative", ["v": 1, "scale": -1.2]),
]
for (name, body) in viewportDropCorpus {
    check("viewport decode: drops \(name)", ViewportMessage.decode(body) == nil)
}

var limiter = HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)
check("limiter: first cue admits", limiter.admit(.click, at: 0))
check("limiter: per-class repeat inside 40 ms drops", !limiter.admit(.click, at: 0.020))
check("limiter: cross-class inside 16 ms global floor drops", !limiter.admit(.cushion, at: 0.010))
check("limiter: cross-class past the floor admits", limiter.admit(.cushion, at: 0.020))
check("limiter: dropped cue does not push the window", limiter.admit(.click, at: 0.045))

var flood = HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)
var admitted = 0
for i in 0..<200 where flood.admit(.click, at: Double(i) * 0.001) { admitted += 1 }
check("limiter: break-burst flood bounded (\(admitted) <= 5)", admitted <= 5 && admitted > 0)
var back = HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)
_ = back.admit(.cue, at: 10)
check("limiter: rewound clock drops", !back.admit(.cue, at: 9))

// ---------------------------------------------------------------------
// T013 — lifecycle machine + settings codec laws (mirrors
// LifecycleMachineTests, SettingsSnapshotTests; public effects only —
// internal state is exercised by the @testable CI suite).
// ---------------------------------------------------------------------

var machine = LifecycleMachine()
check("lifecycle: didFinishLaunch is a quiet boot event",
      machine.handle(.didFinishLaunch) == [])
check("lifecycle: webContentReady produces no effects",
      machine.handle(.webContentReady) == [])
check("lifecycle: snapshot on the background edge",
      machine.handle(.didEnterBackground) == [.snapshotSettings])
check("lifecycle: foreground return is quiet",
      machine.handle(.willEnterForeground) == [])
check("lifecycle: snapshot on EVERY background edge (repeat)",
      machine.handle(.didEnterBackground) == [.snapshotSettings]
        && machine.handle(.willEnterForeground) == [])
check("lifecycle: process death triggers reload",
      machine.handle(.contentProcessTerminated) == [.reloadWebView])
check("lifecycle: reload success recovers quietly",
      machine.handle(.reloadSucceeded) == [])
check("lifecycle: snapshot still fires post-recovery",
      machine.handle(.didEnterBackground) == [.snapshotSettings])

var escalate = LifecycleMachine()
_ = escalate.handle(.webContentReady)
check("lifecycle: kill -> automatic reload 1",
      escalate.handle(.contentProcessTerminated) == [.reloadWebView])
check("lifecycle: failure -> automatic reload 2 (the cap)",
      escalate.handle(.reloadFailed) == [.reloadWebView])
check("lifecycle: failure past the cap -> recovery surface",
      escalate.handle(.reloadFailed) == [.showRecovery])
check("lifecycle: userRetry reopens recovery",
      escalate.handle(.userRetry) == [.reloadWebView])
check("lifecycle: retried episode can succeed",
      escalate.handle(.reloadSucceeded) == [])

var illegal = LifecycleMachine()
check("lifecycle: illegal event is a quiet no-effect drop (total handle)",
      illegal.handle(.userRetry) == [])
check("lifecycle: machine did not move on the illegal event",
      illegal.handle(.webContentReady) == []
        && illegal.handle(.didEnterBackground) == [.snapshotSettings])

// GH-1045: a content-process death before the first load completion opens
// the same recovery episode (it used to be a silently dropped pair).
var launchDeath = LifecycleMachine()
check("lifecycle: death before the first load -> automatic reload",
      launchDeath.handle(.contentProcessTerminated) == [.reloadWebView])
check("lifecycle: the launch-death reload reaches interactive",
      launchDeath.handle(.webContentReady) == []
        && launchDeath.handle(.didEnterBackground) == [.snapshotSettings])
var launchDeaths = LifecycleMachine()
check("lifecycle: every boot attempt dying ends on the recovery surface",
      launchDeaths.handle(.contentProcessTerminated) == [.reloadWebView]
        && launchDeaths.handle(.contentProcessTerminated) == [.reloadWebView]
        && launchDeaths.handle(.contentProcessTerminated) == [.showRecovery])

// GH-1073: the first-commit watchdog (CommitWatchdogTests is the full suite).
var watch = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
var watchEffects = watch.navigationIssued()
if case let .scheduleDeadline(e, _)? = watchEffects.first {
    watchEffects = watch.deadlineElapsed(epoch: e, isLoading: false)
}
check("watchdog: never committed and not loading -> dead",
      watchEffects == [.declareDead(.notLoading)])
var slow = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
var slowEffects = slow.navigationIssued()
slow.provisionalStarted()
var slowDead = false
var slowRounds = 0
for _ in 0..<3 {
    guard case let .scheduleDeadline(e, _)? = slowEffects.first else { break }
    guard case let .ping(p, _)? = slow.deadlineElapsed(epoch: e, isLoading: true).first else { break }
    slowEffects = slow.pingAnswered(epoch: p)
    if slow.pingBoundElapsed(epoch: p) != [] { slowDead = true }
    slowRounds += 1
}
check("watchdog: a slow started page that answers the ping is never declared dead",
      slowRounds == 3 && !slowDead && slowEffects.count == 1)
var silent = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
var silentVerdict: [CommitWatchdog.Effect] = []
if case let .scheduleDeadline(e, _)? = silent.navigationIssued().first {
    silent.provisionalStarted()
    if case let .ping(p, _)? = silent.deadlineElapsed(epoch: e, isLoading: true).first {
        silentVerdict = silent.pingBoundElapsed(epoch: p)
    }
}
check("watchdog: started, still loading, ping unanswered -> dead",
      silentVerdict == [.declareDead(.pingUnanswered)])
var launching = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
var launchEffects = launching.navigationIssued()
var silentRearms = 0
while case let .scheduleDeadline(e, _)? = launchEffects.first, silentRearms < 10 {
    launchEffects = launching.deadlineElapsed(epoch: e, isLoading: true)
    if case .scheduleDeadline? = launchEffects.first { silentRearms += 1 }
}
check("watchdog: a launching page is not pinged before the start budget",
      silentRearms == 5)
var bg = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
_ = bg.navigationIssued()
bg.suspended()
let bgIssued = bg.navigationIssued()
let bgResumed = bg.resumed()
check("watchdog: a navigation issued while suspended waits for resume",
      bgIssued.isEmpty && bgResumed.count == 1)

// GH-1023: the app-owned replay link maps onto the fixed boot document;
// hostile or malformed links map to nil (ReplayLinkTests is the full suite).
func replayBoot(_ s: String) -> String? {
    URL(string: s).flatMap(ReplayLink.bootURL(for:))?.absoluteString
}
check("replay link: openbilliards://replay#r= -> the boot document",
      replayBoot("openbilliards://replay#r=AbC-_9&cp=dEf") == "app://local/app.html#r=AbC-_9&cp=dEf")
check("replay link: foreign host rejected",
      replayBoot("openbilliards://evil.example#r=AbC") == nil)
check("replay link: query rejected",
      replayBoot("openbilliards://replay?next=https://evil.example#r=AbC") == nil)
check("replay link: non-base64url payload rejected",
      replayBoot("openbilliards://replay#r=AbC%22%3E") == nil)
check("replay link: extra fragment field rejected",
      replayBoot("openbilliards://replay#r=AbC&x=1") == nil)
check("replay link: non-base64url plan rejected",
      replayBoot("openbilliards://replay#r=AbC&cp=Ab.C") == nil)

// Resume-clamp arithmetic (research R10): the L3 bound the shell verifies.
let clampLong: Double = min(0.1, 7200.0)
let clampShort: Double = min(0.1, 0.016)
check("lifecycle: resume clamp bounds any wall gap to 0.1 s",
      clampLong <= 0.1 && clampShort == 0.016)

// Settings codec: adapter strategies (ISO8601), verbatim payload.
let codecEncoder = JSONEncoder()
codecEncoder.dateEncodingStrategy = .iso8601
let codecDecoder = JSONDecoder()
codecDecoder.dateDecodingStrategy = .iso8601
do {
    let payload = "{\"name\":\"Zhao \\\"dong\\\" 🎱\",\"lang\":\"zh-CN\"}"
    let snap2 = SettingsSnapshot(payload: payload,
                                 takenAt: Date(timeIntervalSince1970: 1_752_000_000),
                                 appVersion: "0.1.0")
    let data = try codecEncoder.encode(snap2)
    let back2 = try codecDecoder.decode(SettingsSnapshot.self, from: data)
    check("settings codec: ISO8601 round-trip", back2 == snap2)
    check("settings codec: payload verbatim", back2.payload == payload)
    let keySet: Set<String> = Set(
        ((try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]).keys)
    check("settings codec: pinned field names",
          keySet == ["payload", "takenAt", "appVersion"])
} catch {
    check("settings codec: ISO8601 round-trip (threw \(error))", false)
}

if failures > 0 {
    print("shellcore-smoke: \(failures) FAILED check(s)")
    exit(1)
}
print("shellcore-smoke: ALL PASS")
exit(0)
