// Copyright (c) Meta Platforms, Inc. and affiliates.

// ShellSeams.swift — shared seam constants + container/eval plumbing for the
// AppUITests targets (feature 016 lane V: ComponentTree L2 + GestureDriver
// L3 transport). EXECUTION [BLOCKED: local Xcode install]; CI arm T038.
//
// Frozen seams consumed verbatim:
//   - shell-app contract §1 boot policy: DEBUG launch arguments `-OBBootQuery`,
//     `-OBEphemeralStore YES`, `-OBStatusSeam YES`, `-OBInjectFailure
//     <contentKill|reloadFail>`; real users boot unstamped.
//   - test-pyramid contract §3 / data-model §6 status seam: DEBUG builds mirror
//     `status.json` {state, touchInstalled, clock, seed, gameId},
//     `record-<n>.json`, `haptics-log.json` to `Documents/e2e/` in the app
//     data container.
//   - shell-app contract §7 strings: `shell.recovery.title|body|retry` are the only
//     shell-native strings; T015 pins "stable accessibility identifiers for
//     L2" — the identifier convention below (identifier == localization key)
//     is lane V's coded-against seam, RECORDED for the integrator to align
//     with lane S's RecoverySurface (kernel-api defect-routing regime).
//
// Seam addendum (RECORDED DEVIATION REQUEST, routed to integration): the
// frozen contract words the status seam as mirror-only. Closed-loop gesture
// pilots (the 014 aimTo/gaugeTo pilots transcribed by GestureDriver) and
// scene shaping (the 014 scene8/__rules seams) need an EVAL channel. Lane V
// codes against this file-based protocol in the same DEBUG-only directory:
//   request : Documents/e2e/cmd-<seq>.json  {"id": <seq>, "js": "<expr>",
//             "saveAs": "<optional artifact filename>"}
//   response: Documents/e2e/res-<seq>.json  {"id": <seq>, "ok": bool,
//             "value": <JSON-encoded result>}
// The shell's StatusSeam (T025, lane S) polls for cmd files, evaluates `js`
// via evaluateJavaScript (awaiting promises), writes the res file, and when
// `saveAs` is present also writes the raw value to that filename. Release
// binaries carry none of this (#if DEBUG — test-pyramid §3).
//
// Driver environment (set by ios/tools/e2e-ios.mjs via xcodebuild
// TEST_RUNNER_ prefixed variables):
//   OB_SCENARIO       scenario name (test-pyramid §3)
//   OB_SCENARIO_JSON  full scenario table text (ios/tools/scenarios/<n>.json)
//   OB_CONTAINER      app data container path (simctl get_app_container)
//   OB_PAGE_HELPERS   web/tools/touch-cdp.mjs PAGE_HELPERS_JS, base64 — the
//                     014 __tp finders stay the single source (never copied)
// Without OB_CONTAINER (plain `xcodebuild test`) the seam-dependent waits
// degrade to accessibility-only waits and seam asserts are skipped loudly.

import Foundation
import XCTest

enum ShellSeam {
  static let bundleID = "org.openbilliards.app"

  // Accessibility identifiers (identifier == xcstrings key, see header).
  static let recoveryTitleID = "shell.recovery.title"
  static let recoveryBodyID = "shell.recovery.body"
  static let recoveryRetryID = "shell.recovery.retry"

  // Rotate-prompt copy (web/app/locales/en.json `touch.rotateTitle`): the
  // 014 portrait prompt must structurally never render in the landscape-
  // locked shell (FR-006/FR-012). Asserted as absence of this static text.
  static let rotatePromptEN = "Rotate to play"

  // shell-app contract §1 launch arguments
  static func launchArgs(bootQuery: String?, ephemeral: Bool = true,
                         statusSeam: Bool = true,
                         injectFailures: [String] = []) -> [String] {
    var args: [String] = []
    if let q = bootQuery { args += ["-OBBootQuery", q] }
    if ephemeral { args += ["-OBEphemeralStore", "YES"] }
    if statusSeam { args += ["-OBStatusSeam", "YES"] }
    for kind in injectFailures { args += ["-OBInjectFailure", kind] }
    // pin the shell strings to a deterministic locale unless a test
    // overrides (localization delta checks relaunch with another language)
    if !args.contains("-AppleLanguages") {
      args += ["-AppleLanguages", "(en)"]
    }
    return args
  }
}

/// Status-seam client: reads the mirrored artifacts and drives the eval
/// channel over the app data container (simulator runners share the host
/// filesystem with the app sandbox — the standard XCUITest artifact trick).
struct StatusSeamClient {
  let e2eDir: URL
  private static var seq = 0

  init?(environment: [String: String] = ProcessInfo.processInfo.environment) {
    // OB_SEAM_DIR (fixed host path) is authoritative: xcodebuild
    // reinstalls the app per test-without-building run and every install
    // MOVES the data container, so a pre-resolved container path is
    // stale by the time the app writes (T038 CI evidence: new container
    // UUID per scenario, run 29135590139). OB_CONTAINER stays as the
    // legacy fallback for local drivers that install once.
    if let dir = environment["OB_SEAM_DIR"], !dir.isEmpty {
      self.e2eDir = URL(fileURLWithPath: dir, isDirectory: true)
    } else if let container = environment["OB_CONTAINER"], !container.isEmpty {
      self.e2eDir = URL(fileURLWithPath: container)
        .appendingPathComponent("Documents").appendingPathComponent("e2e")
    } else {
      return nil
    }
  }

  func artifactURL(_ name: String) -> URL { e2eDir.appendingPathComponent(name) }

  func readJSON(_ name: String) -> [String: Any]? {
    guard let data = try? Data(contentsOf: artifactURL(name)) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  /// Bounded status.json poll (anti-stall law: every wait carries a budget).
  @discardableResult
  func waitStatus(timeout: TimeInterval = 30, pollMs: UInt32 = 200,
                  until predicate: ([String: Any]) -> Bool) -> [String: Any]? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let s = readJSON("status.json"), predicate(s) { return s }
      usleep(pollMs * 1000)
    }
    return nil
  }

  /// Eval channel outcome (GH-446, review r1 P2): callers deciding whether a
  /// RETRY is safe must distinguish "the js THREW" (the shell answered
  /// ok:false with the error text — for seam-loss shapes nothing executed)
  /// from "the response never arrived" (the js may well have EXECUTED and
  /// its res merely landed after the deadline — re-running a mutating row
  /// like __test.shoot(...) would double-fire it).
  enum EvalOutcome {
    case ok(Any?)
    case errored(String)
    case timedOut
  }

  /// Eval channel round trip (see header protocol), full-fidelity outcome.
  func evalOutcome(_ js: String, saveAs: String? = nil,
                   timeout: TimeInterval = 15) -> EvalOutcome {
    StatusSeamClient.seq += 1
    let id = StatusSeamClient.seq
    var cmd: [String: Any] = ["id": id, "js": js]
    if let saveAs { cmd["saveAs"] = saveAs }
    guard let data = try? JSONSerialization.data(withJSONObject: cmd) else {
      return .errored("cmd not serializable")
    }
    try? FileManager.default.createDirectory(at: e2eDir, withIntermediateDirectories: true)
    do { try data.write(to: artifactURL("cmd-\(id).json")) } catch {
      return .errored("cmd write failed: \(error)")
    }
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let res = readJSON("res-\(id).json"), res["id"] as? Int == id {
        guard res["ok"] as? Bool == true else {
          return .errored(res["error"] as? String ?? "(no error text)")
        }
        guard let valueText = res["value"] as? String else { return .ok(res["value"]) }
        // value is JSON-encoded by the shell; decode fragments too
        if let vd = valueText.data(using: .utf8),
           let decoded = try? JSONSerialization.jsonObject(with: vd, options: [.fragmentsAllowed]) {
          return .ok(decoded)
        }
        return .ok(valueText)
      }
      usleep(100_000)
    }
    return .timedOut
  }

  /// Returns the JSON-decoded `value` on ok, or nil on timeout/failure —
  /// callers assert loudly (or consult evalOutcome for retry decisions).
  func eval(_ js: String, saveAs: String? = nil,
            timeout: TimeInterval = 15) -> Any? {
    if case .ok(let v) = evalOutcome(js, saveAs: saveAs, timeout: timeout) {
      return v
    }
    return nil
  }

  /// Bounded truthy-eval poll (mirrors the 014 drivers' poll() helper).
  func waitEval(_ js: String, tries: Int = 40, pollMs: UInt32 = 150) -> Any? {
    for _ in 0..<tries {
      let v = eval(js)
      if let b = v as? Bool { if b { return v } }
      else if let n = v as? NSNumber { if n != 0 { return v } }
      else if v != nil, !(v is NSNull) { return v }
      usleep(pollMs * 1000)
    }
    return nil
  }
}

/// Shared launch helper: boots the shell app with the frozen DEBUG args and
/// waits for interactivity (seam-gated readiness probe when the container is
/// known; accessibility settle otherwise).
enum ShellLaunch {
  @discardableResult
  static func launch(app: XCUIApplication, seam: StatusSeamClient?,
                     bootQuery: String?, injectFailures: [String] = [],
                     extraArgs: [String] = [],
                     readyTimeout: TimeInterval = 180) -> Bool {
    // 180 s budget: a COLD simulator boot on a loaded CI runner takes
    // 45-60+ s to first render (wasm compile + scene build); the old
    // 60 s expired while boots were healthy (T038 CI evidence: direct
    // simctl boot reached state AIM in ~50 s, run 29135590139). Bounded
    // still — anti-stall law.
    app.launchArguments = ShellSeam.launchArgs(
      bootQuery: bootQuery, injectFailures: injectFailures) + extraArgs
    // Fixed host-side seam rendezvous (see StatusSeamClient.init): the
    // app must write where the driver watches, reinstall-proof.
    if let dir = ProcessInfo.processInfo.environment["OB_SEAM_DIR"],
       !dir.isEmpty {
      app.launchEnvironment["OB_SEAM_DIR"] = dir
    }
    // GH-446: the seam dir persists across a scenario's relaunch phases, so
    // a STALE status.json from the PREVIOUS boot green-lights the readiness
    // gate below while the new page is still at clock 0 — the hosted storm
    // shape (probes hitting undefined __tp/__test mid-boot on slow runners).
    // Terminate the old instance FIRST (its 500 ms seam timer must never
    // re-write status.json between the removal and the fresh boot), then
    // drop the stale file so the gate only ever reads the new boot's state.
    if app.state != .notRunning { app.terminate() }
    if let seam {
      try? FileManager.default.removeItem(at: seam.artifactURL("status.json"))
    }
    app.launch()
    guard app.webViews.firstMatch.waitForExistence(timeout: readyTimeout) else {
      return false
    }
    if let seam {
      // readiness probe behind -OBStatusSeam (test-pyramid §2): the seam's
      // status.json carries the scripted state string once the page is live
      return seam.waitStatus(timeout: readyTimeout) { s in
        (s["state"] as? String).map { !$0.isEmpty } ?? false
      } != nil
    }
    // no driver container: settle on the accessibility surface only
    sleep(3)
    return true
  }
}
