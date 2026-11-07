// Copyright (c) Meta Platforms, Inc. and affiliates.

// GestureDriver.swift — L3 gesture-synthesis runner (feature 016, T022;
// contracts/test-pyramid.md §3, research R14, FR-013). Class name pinned by
// ios/TestPlans/GestureDriver.xctestplan (selectedTests: GestureDriver);
// invoked by ios/tools/e2e-ios.mjs via `xcodebuild test-without-building`
// with the scenario name in the test environment.
//
// EXECUTION [BLOCKED: local Xcode install]; CI arm T038. Authored +
// syntax-gated today.
//
// Transport law (test-pyramid §3): scenario steps are viewport-normalized
// `{kind: drag|tap|twoFinger|hold, from, to, ms}` rows mapped onto
// XCUICoordinate drags/taps/two-finger gestures, MIRRORING the
// web/tools/touch-cdp.mjs synthesis timing semantics:
//   tap   -> press(forDuration: ms/1000)            (tap pressMs default 40)
//   drag  -> press+drag with velocity = distance/ms  (drag steps*stepMs
//            default 24*16 = 384 ms; explicit ms rows override — the risk-
//            register mitigation carries timings IN the tables)
//   hold  -> press(forDuration: ms/1000)
//   twoFinger -> pinch (spanFrom→spanTo, fixed centroid) via
//            XCUIElement.pinch(withScale:velocity:). RECORDED FIDELITY GAP:
//            public XCUITest cannot synthesize a centroid-TRANSLATION
//            two-finger drag or an asymmetric second-finger stream; rows
//            marked `"transport": "unavailable"` in the tables are logged
//            as recorded-blocked (never silently skipped: the run report
//            counts them) — the classification laws they pin remain
//            asserted through the in-shell status seam where a synthesizable
//            gesture (pinch) exercises the same S4 classifier state
//            (plan.md risk register row "XCUITest gesture fidelity").
//
// Closed-loop pilot steps (aimTo/gaugeTo/spinTo/fire/tapBall/tapPocket/
// bihDragTo) transcribe the e2e-touch.mjs shared pilots 1:1 — same
// constants (G0, FINE_MIN, ORBIT_GAIN, SLOP, NUDGE_RAD, GHOST_OFFSET_PX),
// same fast/slow/ratchet handover at 0.06 rad, same bounded-round budgets —
// reading page state through the ShellSeams eval channel and locating the
// frozen widgets through the 014 __tp finders (PAGE_HELPERS_JS is passed in
// verbatim via OB_PAGE_HELPERS; never copied).
//
// Element-anchored steps (T023 transcription completeness): `tapEl` and
// `dragEl` take a page-side rect getter (`el` js returning {found, cx, cy}
// / {found, x, y, w, h}) so scenario rows can tap/drag runtime-located
// widgets the pilots do not wrap (decision-prompt options, picker rows, the
// popup elevation range) — the exact analogue of the 014 drivers' pattern
// of eval-located rects fed to tap()/drag(). `bihDragTo` takes optional
// `expectKx`/`expectKy` for placements whose LAW is a snap/clamp away from
// the drag target (disciplines driver: carom Art 23.2 spot snap).

import XCTest

final class GestureDriver: XCTestCase {

  // ---- frozen gesture constants (contracts/touch-input.md §3, mirrored
  // from web/tools/e2e-touch.mjs) ------------------------------------------
  private static let FINE_MIN = 0.1
  private static let SLOP = 10.0
  private static let NUDGE_RAD = 0.05 * Double.pi / 180.0
  private static let GHOST_OFFSET_PX = 56.0

  private var app: XCUIApplication!
  private var seam: StatusSeamClient!
  private var pageW = 844.0
  private var pageH = 390.0
  private var unavailableTransportRows: [String] = []

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  // ---- coordinate + gesture primitives ------------------------------------

  private func coord(_ nx: Double, _ ny: Double) -> XCUICoordinate {
    app.windows.firstMatch.coordinate(
      withNormalizedOffset: CGVector(dx: nx, dy: ny))
  }

  /// Page CSS px (the __tp finders' space) -> normalized window offset.
  /// The web view fills the window edge-to-edge (shell-app.md §4), so CSS px
  /// map 1:1 onto points.
  private func pxCoord(_ x: Double, _ y: Double) -> XCUICoordinate {
    coord(x / pageW, y / pageH)
  }

  private func tapAt(_ c: XCUICoordinate, pressMs: Double = 40) {
    c.press(forDuration: pressMs / 1000.0)
  }

  private func dragBetween(_ from: XCUICoordinate, _ to: XCUICoordinate, ms: Double) {
    let f = from.screenPoint
    let t = to.screenPoint
    let dist = Double(hypot(t.x - f.x, t.y - f.y))
    let seconds = max(0.05, ms / 1000.0)
    let velocity = XCUIGestureVelocity(rawValue: CGFloat(max(50.0, dist / seconds)))
    from.press(forDuration: 0.05, thenDragTo: to,
               withVelocity: velocity, thenHoldForDuration: 0.05)
  }

  // ---- eval helpers --------------------------------------------------------

  /// PRE-EXECUTION seam guard for scenario-authored js (review GH-446 r1+r2
  /// P2): a retry is exactly-once safe only when the first attempt provably
  /// never STARTED the body. An error-text match cannot prove that
  /// (`mutate(); window.__test.missing()` errors on the __test member AFTER
  /// mutating), so the guard runs INSIDE the same eval, ahead of the body —
  /// a sentinel answer means the body was never entered. The body rides an
  /// inner (0, eval) of the JSON-quoted source, preserving multi-statement
  /// completion semantics and promise bubbling (the shell awaits). Errors
  /// and timeouts are NEVER retried: a mid-body throw may sit after a side
  /// effect, and a timed-out eval may have executed with its res landing
  /// late.
  private static let seamLostSentinel = "__OB_SEAM_LOST__"

  private static func seamGuarded(_ js: String) -> String {
    let encoded = (try? JSONSerialization.data(withJSONObject: [js]))
      .flatMap { String(data: $0, encoding: .utf8) } ?? "[\"false\"]"
    let literal = String(encoded.dropFirst().dropLast()) // ["…"] -> "…"
    return "(() => { if (typeof window.__test?.state !== 'function'"
      + " || typeof window.__tp?.findGauge !== 'function')"
      + " return '\(seamLostSentinel)';"
      + " return (0, eval)(\(literal)); })()"
  }

  /// Scenario-authored js (arbitrary side effects): guarded exactly-once.
  @discardableResult
  private func evalOrFail(_ js: String, saveAs: String? = nil, _ what: String) -> Any? {
    var outcome = seam.evalOutcome(Self.seamGuarded(js), saveAs: saveAs)
    if case .ok(let v) = outcome, v as? String == Self.seamLostSentinel,
       recoverSeamIfLost(what) { // body never entered: retry is safe
      outcome = seam.evalOutcome(Self.seamGuarded(js), saveAs: saveAs)
    }
    switch outcome {
    case .ok(let v):
      if v as? String == Self.seamLostSentinel {
        XCTFail("eval channel failed: \(what) — seam lost and the rendezvous "
          + "could not restore it")
        return nil
      }
      XCTAssertNotNil(v, "eval channel failed: \(what)")
      return v
    case .errored(let msg):
      XCTFail("eval channel failed: \(what) — \(msg)")
      return nil
    case .timedOut:
      XCTFail("eval channel failed: \(what) — timed out (never retried: "
        + "the eval may have executed; review GH-446 r1 P2)")
      return nil
    }
  }

  private func evalDouble(_ js: String) -> Double? {
    if let n = seam.eval(js) as? NSNumber { return n.doubleValue }
    guard recoverSeamIfLost("evalDouble") else { return nil }
    return (seam.eval(js) as? NSNumber)?.doubleValue
  }

  private func evalRect(_ js: String) -> [String: Double]? {
    var raw = seam.eval(js)
    if raw == nil, recoverSeamIfLost("evalRect") {
      // nil is an ERRORED eval (a found:false miss is a dictionary) — the
      // GH-446 storm shape, e.g. "undefined is not an object (evaluating
      // 'window.__tp.findScrim')" on a wiped context; retry post-rendezvous
      raw = seam.eval(js)
    }
    guard let d = raw as? [String: Any] else { return nil }
    guard (d["found"] as? Bool) != false else { return nil }
    var out: [String: Double] = [:]
    for (k, v) in d { if let n = v as? NSNumber { out[k] = n.doubleValue } }
    return out
  }

  /// evalRect's recovery shape for the driver's READ-ONLY dictionary
  /// finders that carry no found-gate (readTip / findChevrons): an errored
  /// eval (nil) triggers the GH-446 seam recovery once, then a single
  /// re-read. Safe per the r1+r2 retry discipline — driver-owned read-only
  /// finders may re-evaluate on ANY nil (GH-514: these two sites were the
  /// last bare one-shot `window.__tp` evals, so a WebContent recycle at
  /// exactly their beat failed the scenario instead of re-installing).
  private func evalDict(_ js: String, _ what: String) -> [String: Any]? {
    var raw = seam.eval(js)
    if raw == nil, recoverSeamIfLost(what) { raw = seam.eval(js) }
    return raw as? [String: Any]
  }

  /// seam.waitEval with the GH-446 lazy gate folded into each iteration: a
  /// nil sample (errored eval — never a plain falsy) triggers the seam
  /// recovery probe, so a bounded wait survives a context wipe instead of
  /// spinning its budget out against a missing __tp.
  private func waitEvalRecovering(_ js: String, tries: Int,
                                  pollMs: UInt32 = 150) -> Any? {
    for _ in 0..<tries {
      let v = seam.eval(js)
      if let b = v as? Bool { if b { return v } }
      else if let n = v as? NSNumber { if n != 0 { return v } }
      else if v != nil, !(v is NSNull) { return v }
      if v == nil { _ = recoverSeamIfLost("waitEval") }
      usleep(pollMs * 1000)
    }
    return nil
  }

  private func gameState() -> String {
    (seam.eval("window.__test.state()") as? String) ?? "?"
  }

  // ---- GH-446 page-seam rendezvous ----------------------------------------
  // Four hosted storm reds (disjoint scenarios, one shape) probed __tp/
  // __test at page clock 0: the boot (or a mid-scenario content-process
  // reload) replaced the JS context under the driver's feet ("undefined is
  // not an object (evaluating 'window.__tp.findScrim')", "Can't find
  // variable: __test"). No probe assumes availability anymore: the install
  // rendezvous below is awaited at launch + at every phase start, and every
  // lower-level eval helper carries the LAZY recovery gate
  // (recoverSeamIfLost) — an errored eval triggers one probe, an actually
  // lost seam waits out the reload and re-installs PAGE_HELPERS_JS.
  // Bounded but generous: hosted cold boots reach interactive in 45-60+ s
  // (ShellLaunch's 180 s budget precedent).

  private var pageHelpersJS: String?
  /// GH-514 review r1 P2: total recovered context wipes — compound gestures
  /// compare snapshots of this to learn a wipe landed MID-SEQUENCE (their
  /// cached page geometry is stale even though the seam recovered).
  private var contextWipes = 0

  private static let seamProbeJS =
    "(() => ({ test: typeof window.__test?.state === 'function',"
    + " tp: typeof window.__tp?.findGauge === 'function',"
    + " ready: document.readyState, href: location.href }))()"

  @discardableResult
  private func awaitPageSeam(_ what: String, deadline: TimeInterval = 90) -> Bool {
    let until = Date().addingTimeInterval(deadline)
    var last: Any? = nil
    var reinstalls = 0
    repeat {
      last = seam.eval(Self.seamProbeJS)
      if let d = last as? [String: Any] {
        if d["test"] as? Bool == true, d["tp"] as? Bool == true {
          if reinstalls > 0 {
            contextWipes += 1
            // decisive triage note: the run crossed a context wipe (page
            // reload) — later game-state asserts judge a REBOOTED game
            XCTContext.runActivity(named: "\(what): page context wipe "
              + "recovered (__tp reinstalled x\(reinstalls))") { _ in }
          }
          return true
        }
        if d["test"] as? Bool == true, let js = pageHelpersJS {
          // page booted, helpers gone (fresh context): re-install and
          // re-probe — the install is idempotent (touch-cdp.mjs IIFE)
          reinstalls += 1
          _ = seam.eval(js)
          continue
        }
      }
      usleep(250_000)
    } while Date() < until
    XCTFail("\(what): __tp/__test rendezvous never satisfied within "
      + "\(Int(deadline)) s (helper reinstalls \(reinstalls)) — last probe: "
      + Self.jsonText(last))
    return false
  }

  /// LAZY per-probe gate (GH-446): a nil eval result is EITHER a real page
  /// error or the seam surfaces missing (page-clock-0 boot / a mid-scenario
  /// content-process reload wiping the JS context). One cheap probe decides;
  /// only an actually-lost seam pays the full rendezvous. Steady-state cost
  /// is ZERO extra round trips — a naive probe-before-every-step gate adds
  /// ~0.5-1 s of eval-channel latency per step and blows real product
  /// windows (measured: flow.js's 2600 ms WIN auto re-rack cleared the
  /// judgment ledger before fullrack's S12 terminal assert).
  /// RETRY DISCIPLINE (review r1+r2 P2): only the driver's own READ-ONLY
  /// finders (evalRect/evalDouble/waitEvalRecovering predicates) may
  /// re-evaluate after this recovery on ANY nil; scenario-authored js
  /// (evalOrFail / assertEval) retries solely on the seamGuarded sentinel —
  /// a pre-execution signal proving the body was never entered.
  private func recoverSeamIfLost(_ what: String) -> Bool {
    if let d = seam.eval(Self.seamProbeJS) as? [String: Any],
       d["test"] as? Bool == true, d["tp"] as? Bool == true {
      return true // seam healthy: the nil was a real answer, not a race
    }
    return awaitPageSeam(what)
  }

  private func shotsLogged() -> Int {
    ((seam.eval("((window.__share?.log?.() ?? {}).shots ?? 0)") as? NSNumber)?.intValue) ?? 0
  }

  // ---- 014 pilot transcriptions -------------------------------------------

  /// e2e-touch.mjs aimTo(target) 1:1: fast S2 drags (m≈1) for coarse error,
  /// slow sub-V_LO drags (m = FINE_MIN) for the mid band, chevron-ratchet
  /// taps (exact ±NUDGE_STEP_DEG) for the last steps. Bounded 14 rounds.
  private func aimTo(_ target: Double) -> Bool {
    let g0 = 1.2 * Double.pi / pageW
    let yPx = pageH * 0.46
    var best = Double.infinity
    var stale = 0
    var chevSign = 0.0
    let phiErr = { () -> Double? in
      self.evalDouble("""
      (() => {
        const p = window.__aim?.getPhi?.();
        if (typeof p !== 'number') return null;
        let d = (\(target) - p) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        return d;
      })()
      """)
    }
    for _ in 0..<14 {
      guard let e = phiErr() else { XCTFail("aimTo: __aim.getPhi unavailable"); return false }
      if abs(e) <= Self.NUDGE_RAD * 0.6 { return true }
      if abs(e) >= best - 1e-6 {
        stale += 1
        if stale >= 4 { logAimStall(e); return false }
      } else { stale = 0 }
      best = min(best, abs(e))
      if abs(e) > 0.06 {
        // fast leg (lane-H recorded handover 0.06): m(v) -> 1 at high speed.
        // The drag START must hit the bare renderer canvas — the 0.12/0.88
        // rail anchors can land on left-rail chrome (power gauge / view
        // chevrons) where the whole drag is consumed with ZERO aim
        // contribution (run 29145125984 fullrack/called-pot: five
        // identical phi errors, stale-abort).
        var dx = -e / g0
        dx = max(-pageW * 0.38, min(pageW * 0.38, dx))
        dx += (dx > 0 ? Self.SLOP : -Self.SLOP)
        let x0 = clearDragStartX(dxPositive: dx > 0, yPx: yPx)
          ?? (dx > 0 ? pageW * 0.12 : pageW * 0.88)
        let ms = max(3.0, abs(dx) / 14.0) * 8.0 // steps * stepMs (014 pacing)
        dragBetween(pxCoord(x0, yPx), pxCoord(x0 + dx, yPx), ms: ms)
        usleep(120_000)
      } else if abs(e) > Self.NUDGE_RAD * 3 {
        // slow leg: 1.5 px / 33 ms ≈ 45 px/s < V_LO -> m = FINE_MIN exactly
        var dx = -e / (g0 * Self.FINE_MIN)
        dx = max(-140.0, min(140.0, dx))
        dx += (dx > 0 ? Self.SLOP : -Self.SLOP)
        let x0 = dx > 0 ? pageW * 0.30 : pageW * 0.70
        let ms = max(4.0, abs(dx) / 1.5) * 33.0
        dragBetween(pxCoord(x0, yPx), pxCoord(x0 + dx, yPx), ms: ms)
        usleep(120_000)
      } else {
        // ratchet leg: one exact ±NUDGE_STEP_DEG per chevron tap (SC-005 law)
        // Review r1 P2: after a recovered context wipe the touch widgets
        // re-import asynchronously, so findChevrons can answer a truthful
        // {found:false} for a beat — bounded poll instead of a one-sample
        // verdict (steady-state cost zero: the first sample hits; a
        // persistent miss stays the same loud failure).
        var chPoll: [String: Any]? = nil
        for _ in 0..<12 {
          chPoll = evalDict("window.__tp.findChevrons()", "aimTo chevrons")
          if chPoll?["found"] as? Bool == true { break }
          usleep(250_000)
        }
        guard let ch = chPoll,
              ch["found"] as? Bool == true,
              let left = ch["left"] as? [String: Any],
              let right = ch["right"] as? [String: Any],
              let lcx = (left["cx"] as? NSNumber)?.doubleValue,
              let lcy = (left["cy"] as? NSNumber)?.doubleValue,
              let rcx = (right["cx"] as? NSNumber)?.doubleValue,
              let rcy = (right["cy"] as? NSNumber)?.doubleValue else {
          XCTFail("aimTo: nudge chevrons not found"); return false
        }
        if chevSign == 0 { // one-tap sign calibration, then re-loop
          guard let p0 = evalDouble("window.__aim.getPhi()") else { return false }
          tapAt(pxCoord(lcx, lcy), pressMs: 30)
          usleep(140_000)
          guard let p1 = evalDouble("window.__aim.getPhi()") else { return false }
          chevSign = (p1 - p0) > 0 ? 1 : -1
          continue
        }
        let useLeft = (e > 0) == (chevSign > 0)
        let cx = useLeft ? lcx : rcx
        let cy = useLeft ? lcy : rcy
        let n = max(1, min(6, Int((abs(e) / Self.NUDGE_RAD).rounded())))
        for _ in 0..<n {
          tapAt(pxCoord(cx, cy), pressMs: 30)
          usleep(100_000) // < NUDGE_REPEAT_DELAY_MS: exactly one step per tap
        }
      }
    }
    guard let e = phiErr() else { return false }
    if abs(e) > Self.NUDGE_RAD * 0.6 { logAimStall(e); return false }
    return true
  }

  /// Failure forensics for a non-converging aim loop: classifier state,
  /// tracked pointers, live phi (T038 triage — tune on MEASURED values).
  private func logAimStall(_ e: Double) {
    let diag = seam.eval("JSON.stringify({ touch: window.__touch?.state?.(), "
      + "pointers: window.__touch?.pointers?.(), "
      + "phi: window.__aim?.getPhi?.() })")
    XCTContext.runActivity(
      named: "aimTo stalled: err=\(e) rad, diag=\(Self.jsonText(diag))") { _ in }
  }

  /// First fast-leg drag-start x whose point hits the bare renderer canvas
  /// (chrome-clear probe; see the fast-leg comment in aimTo).
  private func clearDragStartX(dxPositive: Bool, yPx: Double) -> Double? {
    let fracs = dxPositive ? [0.12, 0.18, 0.24, 0.30] : [0.88, 0.82, 0.76, 0.70]
    for f in fracs {
      let x = pageW * f
      let clear = seam.eval(
        "(() => { const el = document.elementFromPoint(\(x), \(yPx)); "
        + "return !!el && el.tagName === 'CANVAS' "
        + "&& el.parentElement === document.body; })()") as? Bool
      if clear == true { return x }
    }
    return nil
  }

  // ---- power-response curve mirror (GH-142/GH-184) -------------------------
  // settings.js powerCurve / e2e-touch.mjs curveX, mirrored under the same
  // owner-retune law as the frozen gesture constants above (a curve retune
  // is a settings.js + e2e-touch.mjs + here change).
  private static let POWER_GAMMA = 2.0
  private static let POWER_MIN = 0.5
  private static let POWER_MAX = 12.0

  /// e2e-touch.mjs curveX 1:1: v0 -> rail-travel fraction under a
  /// power-response mode. In linear mode this reduces exactly to the
  /// original (v - 0.5) / 11.5.
  private func curveX(_ v: Double, _ mode: String) -> Double {
    let f = (min(Self.POWER_MAX, max(Self.POWER_MIN, v)) - Self.POWER_MIN)
      / (Self.POWER_MAX - Self.POWER_MIN)
    return mode == "linear" ? f : pow(f, 1.0 / Self.POWER_GAMMA)
  }

  /// e2e-touch.mjs gaugeTo(target) 1:1 (closed loop on the #power chain).
  /// GH-270: the thumb guess and the per-round travel ride the ACTIVE
  /// power-response curve, mirroring the #142 web-pilot amendment — GH-142
  /// shipped 'perceptual' as the default and the old fixed 11.5-per-rail
  /// Newton step (slope ~2x too shallow near the rail top, where a 0.1
  /// correction realizes ~0.2 on the GH-184 release grid) limit-cycled
  /// 8.4 <-> 8.6 around gaugeTo(8.5) — the deterministic hosted-lane red
  /// on every main run since 2026-07-24 (fullrack/break#3 +
  /// gestures/explicit-fire-only#13).
  ///
  /// GH-446 hosted-runner hardening: (a) the gauge chain is RENDEZVOUSED —
  /// findGauge().found + the #power input polled until present (the storm
  /// reds mirrored "TypeError: null is not an object (evaluating
  /// 'document.getElementById('power').value')" when a relaunch phase's
  /// gaugeTo probed at page clock 0); (b) the value read is NULL-SAFE (a
  /// missing #power reads null, never a thrown TypeError the seam mirrors
  /// as a failed eval); (c) the closed loop RETRIES WITH SETTLE, bounded,
  /// instead of asserting the first 12-round attempt — an XCUITest drag on
  /// a slow runner can land its value change after the 140 ms settle read
  /// (the miss shape is runner slowness, not app behavior).
  private func readPower() -> Double? {
    (seam.eval("(() => { const el = document.getElementById('power'); "
      + "return el ? Number(el.value) : null; })()") as? NSNumber)?.doubleValue
  }

  private func gaugeTo(_ target: Double) -> Bool {
    // rendezvous: poll-until-defined, never assume page-clock-0 presence.
    // The __tp leg is DELIBERATELY non-optional-chained: on a wiped context
    // it ERRORS (nil sample) so waitEvalRecovering's lazy gate reinstalls
    // the helpers, instead of polling a plain false out to the deadline.
    if waitEvalRecovering("!!(window.__tp.findGauge().found"
      + " && document.getElementById('power'))", tries: 120, pollMs: 250) == nil {
      XCTFail("gaugeTo: gauge/#power never appeared (120-poll rendezvous)")
      return false
    }
    for attempt in 0..<3 {
      if gaugeAttempt(target) { return true }
      // late-landing drag: bounded settle re-reads before a fresh attempt
      var lastRead: Double? = nil
      for _ in 0..<8 {
        usleep(250_000)
        if let v = readPower() {
          lastRead = v
          if v == target { return true }
        }
      }
      XCTContext.runActivity(named: "gaugeTo(\(target)): attempt \(attempt + 1) "
        + "missed — read \(lastRead.map { String($0) } ?? "nil") after settle, "
        + "retrying") { _ in }
    }
    let diag = seam.eval("JSON.stringify({ power: (() => { const el = "
      + "document.getElementById('power'); return el ? el.value : null; })(), "
      + "gauge: window.__tp?.findGauge?.(), "
      + "mode: window.__settings?.get?.().powerResponse })")
    XCTContext.runActivity(
      named: "gaugeTo(\(target)) exhausted 3 attempts — diag=\(Self.jsonText(diag))") { _ in }
    return false
  }

  /// One 12-round closed-loop pass (the pre-GH-446 gaugeTo body verbatim).
  private func gaugeAttempt(_ target: Double) -> Bool {
    guard let g = evalRect("window.__tp.findGauge()"),
          let gx = g["cx"], let gy = g["y"], let gh = g["h"] else {
      return false // rendezvous passed, so a vanished gauge retries upstream
    }
    let top = gy + 4, bot = gy + gh - 4
    let mode = (seam.eval(
      "window.__settings?.get?.().powerResponse ?? 'linear'") as? String) ?? "linear"
    guard var cur = readPower() else { return false }
    var yPos = bot - curveX(cur, mode) * (bot - top)
    for _ in 0..<12 {
      if cur == target { break }
      let dy = -(curveX(target, mode) - curveX(cur, mode)) * (bot - top)
      let fromY = min(bot, max(top, yPos))
      let toY = min(bot, max(top, yPos + dy))
      let ms = max(4.0, abs(toY - fromY) / 6.0) * 12.0
      dragBetween(pxCoord(gx, fromY), pxCoord(gx, toY), ms: ms)
      usleep(140_000)
      yPos = toY
      guard let c = readPower() else { return false }
      cur = c
    }
    return cur == target
  }

  /// e2e-touch.mjs spinPadSet(ta, tb) 1:1 (closed loop on the #tip decode).
  /// GH-514: pad ACQUISITION is a bounded self-healing loop, not a one-shot
  /// — the hosted storm shape wipes the JS context between the spin-button
  /// tap and the findPad re-read ("TypeError: undefined is not an object
  /// (evaluating 'window.__tp.findPad')", touchInstalled true, clock 0),
  /// so the single re-read landed on a rebooted page whose dialog is
  /// closed. Each round's evalRect carries the GH-446 lazy recovery gate
  /// (reinstalls __tp on a wiped context); the NEXT round then re-finds and
  /// re-taps the button on the rebooted page instead of dying on the stale
  /// one-shot. Fail messages stay verbatim (CI triage greps them).
  /// Review r1 P2: a wipe recovered MID-LOOP invalidates the pad geometry —
  /// the rebooted page's modal is closed, so the cached pcx/pcy would drag
  /// the wrong surface (and a (0,0) target could falsely succeed on the
  /// freshly centered #tip). spinAttempt reports the wipe; this shell
  /// restarts acquisition with fresh geometry, bounded.
  private func spinTo(_ ta: Double, _ tb: Double, tol: Double = 0.05) -> Bool {
    for _ in 0..<2 {
      switch spinAttempt(ta, tb, tol: tol) {
      case .done(let ok): return ok
      case .wiped: continue // re-acquire the pad on the rebooted page
      }
    }
    XCTFail("spinTo: context wiped repeatedly mid-gesture — pad geometry "
      + "never stabilized")
    return false
  }

  private enum SpinOutcome { case done(Bool), wiped }

  private func spinAttempt(_ ta: Double, _ tb: Double, tol: Double) -> SpinOutcome {
    var pad = evalRect("window.__tp.findPad()")
    var buttonSeen = false
    for round in 0..<3 {
      if pad != nil { break }
      if round > 0 {
        // late dialog motion or mid-reboot chrome (recovery already ran
        // inside evalRect): settle and re-probe BEFORE re-tapping — a
        // re-tap on a dialog that opened late would toggle it shut
        usleep(500_000)
        pad = evalRect("window.__tp.findPad()")
        if pad != nil { break }
      }
      guard let btn = evalRect("window.__tp.findSpinButton()"),
            let bcx = btn["cx"], let bcy = btn["cy"] else { continue }
      buttonSeen = true
      tapAt(pxCoord(bcx, bcy))
      usleep(600_000) // kit dialog motion
      pad = evalRect("window.__tp.findPad()")
    }
    guard let p = pad, let pcx = p["cx"], let pcy = p["cy"],
          let px0 = p["x"], let py0 = p["y"], let pw = p["w"], let ph = p["h"] else {
      XCTFail(buttonSeen ? "spinTo: spin pad not found"
        : "spinTo: spin button not found")
      return .done(false)
    }
    // wipes recovered DURING acquisition are already healed (each round
    // re-reads geometry) — only a wipe past this point stales the rects
    let wipes0 = contextWipes
    let k = pw
    var px = pcx + ta * k
    var py = pcy - tb * k
    var cur: (a: Double, b: Double)? = nil
    for _ in 0..<8 {
      px = min(px0 + pw - 2, max(px0 + 2, px))
      py = min(py0 + ph - 2, max(py0 + 2, py))
      dragBetween(pxCoord(pcx, pcy), pxCoord(px, py), ms: 8 * 12)
      usleep(160_000)
      guard let t = evalDict("window.__tp.readTip()", "spinTo readTip") else {
        XCTFail("spinTo: tip canvas unreadable"); return .done(false)
      }
      if contextWipes != wipes0 { return .wiped } // stale pad geometry
      let n = (t["n"] as? NSNumber)?.doubleValue ?? 0
      let a = n > 0 ? ((t["a"] as? NSNumber)?.doubleValue ?? 0) : 0
      let b = n > 0 ? ((t["b"] as? NSNumber)?.doubleValue ?? 0) : 0
      cur = (a, b)
      if hypot(a - ta, b - tb) <= tol { return .done(true) }
      px += (ta - a) * k * 0.8
      py -= (tb - b) * k * 0.8
    }
    guard let c = cur else { return .done(false) }
    // readTip decodes at ±0.06
    return .done(hypot(c.a - ta, c.b - tb) <= tol * 1.5)
  }

  /// Dismiss an open kit dialog by tapping its scrim (.ob-backdrop click
  /// closes per web/app/ui/dialog.js). The tap point must be clear of the
  /// screen edges AND hit the backdrop itself: the previous corner tap at
  /// CSS (4,4) landed in the iPhone sensor-housing/system-gesture region
  /// where synthesized presses are swallowed, so the dialog silently stayed
  /// open and the later FIRE tap was consumed light-dismissing it (T038 CI
  /// evidence: run 29141124173 fullrack-break-aimed.png + run 15 diag
  /// elementAt=ob-backdrop). Closure is VERIFIED via findScrim with bounded
  /// retries — an undismissable dialog fails loudly, never silently.
  private func closePopup() {
    for _ in 0..<3 {
      guard evalRect("window.__tp.findScrim()") != nil else { return }
      // In-page probe: first candidate point >= 40 px from every screen
      // edge where elementFromPoint hits the backdrop (not the dialog
      // panel stacked above it).
      let probe = """
      (() => {
        const bd = [...document.querySelectorAll('.ob-backdrop')]
          .find((el) => el.getClientRects().length > 0
            && getComputedStyle(el).visibility !== 'hidden');
        if (!bd) return { found: false };
        const r = bd.getBoundingClientRect();
        const mx = Math.max(40, r.width * 0.06);
        const my = Math.max(40, r.height * 0.12);
        const cands = [
          [r.x + mx, r.y + r.height / 2],
          [r.x + r.width - mx, r.y + r.height / 2],
          [r.x + r.width / 2, r.y + my],
          [r.x + mx, r.y + my],
          [r.x + r.width - mx, r.y + r.height - my],
        ];
        for (const [x, y] of cands) {
          if (document.elementFromPoint(x, y) === bd) {
            return { found: true, cx: x, cy: y };
          }
        }
        return { found: false };
      })()
      """
      guard let p = evalRect(probe), let cx = p["cx"], let cy = p["cy"] else {
        XCTFail("closePopup: no scrim point clear of the dialog panel and "
          + "screen edges — dialog cannot be dismissed by backdrop tap")
        return
      }
      tapAt(pxCoord(cx, cy))
      usleep(450_000)
      if evalRect("window.__tp.findScrim()") == nil { return }
    }
    XCTFail("closePopup: dialog scrim still present after 3 backdrop taps")
  }

  /// e2e-touch.mjs fireAndSettle 1:1: FIRE tap -> AIM->SIMULATING/PLAYBACK
  /// transition -> bounded settle; exactly one shot logged.
  private func fireAndSettle(_ tag: String) -> Bool {
    // Defensive pre-check: a still-open dialog's scrim would consume the
    // FIRE tap as a light-dismiss (run 15 diag; closePopup header). Close
    // it loudly before aiming at #shoot.
    if evalRect("window.__tp.findScrim()") != nil {
      XCTContext.runActivity(
        named: "\(tag): dialog scrim open at fire time — dismissing") { _ in }
      closePopup()
    }
    guard let fire = evalRect("window.__tp.el('#shoot')"),
          let cx = fire["cx"], let cy = fire["cy"] else {
      XCTFail("\(tag): #shoot not visible"); return false
    }
    let shots0 = shotsLogged()
    tapAt(pxCoord(cx, cy))
    var transition: String? = nil
    for _ in 0..<130 {
      let s = gameState()
      if s == "SIMULATING" || s == "PLAYBACK" { transition = s; break }
      usleep(60_000)
    }
    guard transition != nil else {
      // Landing diagnostics: what the page sees at the intended tap
      // point + live state, so a calibration miss is distinguishable
      // from a game-side rejection (T038 CI triage).
      let under = seam.eval(
        "(() => { const el = document.elementFromPoint(\(cx), \(cy)); "
        + "return el ? (el.id || el.className || el.tagName) : 'none'; })()")
        as? String ?? "?"
      XCTFail("\(tag): no AIM->SIMULATING/PLAYBACK transition after the "
        + "FIRE tap — state=\(gameState() ?? "?") shots=\(shotsLogged()) "
        + "elementAt(\(cx),\(cy))=\(under)")
      return false
    }
    var state = transition!
    for i in 0..<260 {
      if state != "SIMULATING" && state != "PLAYBACK" { break }
      usleep(350_000)
      state = gameState()
      if i % 40 == 39 { XCTContext.runActivity(named: "\(tag): playback running (\(state))") { _ in } }
    }
    let shots = shotsLogged() - shots0
    return shots == 1 && state != "SIMULATING" && state != "PLAYBACK"
  }

  private func tapBall(_ id: Int) -> Bool {
    guard let b = evalRect("window.__tp.ballScreen(\(id))"), let x = b["x"], let y = b["y"] else {
      return false
    }
    tapAt(pxCoord(x, y))
    usleep(300_000)
    return true
  }

  private func tapPocket(_ i: Int) -> Bool {
    guard let p = evalRect("window.__tp.pocketScreen(\(i))"), let x = p["x"], let y = p["y"] else {
      return false
    }
    tapAt(pxCoord(x, y))
    usleep(300_000)
    return true
  }

  /// Disciplines-driver BIH drag, one-shot XCUITest form (recorded fidelity
  /// note: the 014 probe keeps the finger down across candidate presses;
  /// XCUICoordinate drags are one-shot, so failed placements retry with a
  /// fresh grab — identical placement semantics, coarser probing).
  /// `expectKx`/`expectKy` override the landing assert for snap/clamp laws
  /// (carom Art 23.2 spot snap) where the LAW moves the ball away from the
  /// drag target.
  private func bihDragTo(kx: Double, ky: Double,
                         expectKx: Double? = nil, expectKy: Double? = nil) -> Bool {
    let ex = expectKx ?? kx
    let ey = expectKy ?? ky
    var lastD: Double? = nil
    for attempt in 0..<4 {
      guard let cue = evalRect("window.__tp.ballScreen(0)"),
            let cxv = cue["x"], let cyv = cue["y"],
            let target = evalRect("window.__tp.projectK(\(kx), \(ky))"),
            let tx = target["x"], let ty = target["y"] else { return false }
      // Reachability gate (016 L3 round 2, runs 29148551834 + 29151867325):
      // XCUITest clamps any press/drag point to the window, so BOTH the
      // grab point (the cue ball's projection) and the finger endpoint
      // (target + GHOST_OFFSET_PX below the ghost) must be on-screen —
      // measured failures: (0.2, -0.5) -> finger y 454.5 on a 390 px page
      // (ball parked 0.1188 m short x4), and the carom cue projecting to
      // y 512 after the session's orbit/pinch phases (ball never grabbed,
      // distance 0.365 m = the full spot gap). CDP can synthesize beyond
      // the viewport, so such geometries stay on the web arm — or the
      // table resets the camera first. Loud, not a silent retry burn.
      let fingerY = ty + Self.GHOST_OFFSET_PX
      if cxv < 4 || cxv > pageW - 4 || cyv < 4 || cyv > pageH - 4
        || tx < 4 || tx > pageW - 4 || fingerY < 4 || fingerY > pageH - 4 {
        XCTFail("bihDragTo (\(kx), \(ky)): grab (\(cxv), \(cyv)) or finger "
          + "endpoint (\(tx), \(fingerY)) is off-window on the \(pageW)x\(pageH) "
          + "page — camera framing leaves the drag transport-unreachable "
          + "(reset the camera in the table or keep the target on the web arm)")
        return false
      }
      let jitter = Double(attempt) * 6.0
      let ms = 12.0 * 16.0
      dragBetween(pxCoord(cxv + jitter, cyv),
                  pxCoord(tx, ty + Self.GHOST_OFFSET_PX), ms: ms)
      usleep(300_000)
      if let d = evalDouble("""
        (() => {
          const b = window.__test.balls().find((x) => x.id === 0);
          return Math.hypot(b.pos[2] - (\(ex)), b.pos[0] - (\(ey)));
        })()
        """) {
        lastD = d
        if d <= 0.035 { return true }
      }
    }
    XCTFail("bihDragTo (\(kx), \(ky)) expect (\(ex), \(ey)): 4 attempts, "
      + "final distance \(lastD.map { String($0) } ?? "unmeasured") m (tolerance 0.035)")
    return false
  }

  // ---- scenario execution ---------------------------------------------------

  func testScenario() throws {
    let env = ProcessInfo.processInfo.environment
    guard let name = env["OB_SCENARIO"], let jsonText = env["OB_SCENARIO_JSON"],
          let data = jsonText.data(using: .utf8),
          let scenario = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      throw XCTSkip("GestureDriver runs under ios/tools/e2e-ios.mjs "
        + "(OB_SCENARIO / OB_SCENARIO_JSON unset) — recorded, not silent: "
        + "the test driver is the sanctioned entry (test-pyramid §3)")
    }
    guard let seamClient = StatusSeamClient() else {
      XCTFail("OB_CONTAINER unset — the test driver must pass the app data container path")
      return
    }
    seam = seamClient
    app = XCUIApplication()

    let boot = scenario["boot"] as? [String: Any] ?? [:]
    let phases = scenario["phases"] as? [[String: Any]] ?? []
    XCTAssertFalse(phases.isEmpty, "scenario \(name) carries no phases")

    var launched = false
    for phase in phases {
      let phaseName = phase["name"] as? String ?? "?"
      try XCTContext.runActivity(named: "phase \(phaseName)") { _ in
        // (re)launch when requested or on first phase
        let launchSpec = phase["launch"] as? [String: Any]
        if !launched || launchSpec != nil {
          let spec = launchSpec ?? boot
          let query = spec["query"] as? String ?? boot["query"] as? String
          let injects = spec["injectFailures"] as? [String] ?? []
          XCTAssertTrue(
            ShellLaunch.launch(app: app, seam: seam, bootQuery: query,
                               injectFailures: injects),
            "phase \(phaseName): shell never reached interactive")
          launched = true
          installHelpers(env: env)
        }
        // GH-446: the setup evals ride the eval channel too — rendezvous
        // before the phase's first probe (a non-launch phase's page can
        // still have been wiped by a navigation since the last step).
        awaitPageSeam("phase \(phaseName) rendezvous")
        // setup evals (the 014 scene/match shaping seams — test setup only;
        // player inputs below stay synthesized gestures)
        for js in phase["setup"] as? [String] ?? [] {
          evalOrFail(js, "phase \(phaseName) setup")
          usleep(250_000)
        }
        for (i, step) in (phase["steps"] as? [[String: Any]] ?? []).enumerated() {
          try run(step: step, tag: "\(name)/\(phaseName)#\(i)")
        }
        if let settleMs = (phase["settleMs"] as? NSNumber)?.doubleValue {
          usleep(UInt32(settleMs * 1000))
        }
      }
    }
    // run report: recorded-blocked transport rows are surfaced, never silent
    if !unavailableTransportRows.isEmpty {
      let report = ["unavailableTransportRows": unavailableTransportRows]
      if let d = try? JSONSerialization.data(withJSONObject: report) {
        try? d.write(to: seam.artifactURL("driver-report.json"))
      }
      XCTContext.runActivity(
        named: "recorded-blocked transports: \(unavailableTransportRows.joined(separator: ", "))") { _ in }
    }
  }

  /// Install the 014 page helpers (PAGE_HELPERS_JS passed base64 by the
  /// test driver from web/tools/touch-cdp.mjs — single source, never copied).
  /// GH-446: the first install is NOT hard-asserted — a mid-boot/navigating
  /// page can eat it (the exact storm shape) — the rendezvous below owns
  /// convergence, re-installing on a fresh context until __tp answers.
  private func installHelpers(env: [String: String]) {
    guard let b64 = env["OB_PAGE_HELPERS"],
          let data = Data(base64Encoded: b64),
          let js = String(data: data, encoding: .utf8) else {
      XCTFail("OB_PAGE_HELPERS unset/undecodable — the test driver must pass touch-cdp.mjs PAGE_HELPERS_JS")
      return
    }
    pageHelpersJS = js
    _ = seam.eval(js)
    guard awaitPageSeam("PAGE_HELPERS_JS install") else { return }
    // read the CSS viewport once: page px -> normalized window offsets
    if let dims = seam.eval("[innerWidth, innerHeight]") as? [NSNumber], dims.count == 2 {
      pageW = dims[0].doubleValue
      pageH = dims[1].doubleValue
    }
  }

  /// Render an eval-channel result for a failure message: strings pass
  /// through, decoded JSON containers re-serialize, nil prints "?".
  private static func jsonText(_ v: Any?) -> String {
    guard let v, !(v is NSNull) else { return "?" }
    if let s = v as? String { return s }
    if JSONSerialization.isValidJSONObject(v),
       let d = try? JSONSerialization.data(withJSONObject: v),
       let s = String(data: d, encoding: .utf8) {
      return s
    }
    return "\(v)"
  }

  private func num(_ step: [String: Any], _ key: String, _ fallback: Double) -> Double {
    ((step[key] as? NSNumber)?.doubleValue) ?? fallback
  }

  /// Failure message suffix from the table's optional diag payload
  /// (step.diag js) — bands then tune on MEASURED values instead of blind
  /// re-runs (T038 CI triage). The seam JSON-decodes string results
  /// (ShellSeams eval), so a JSON.stringify'd diag arrives as a dictionary
  /// — read it as Any and re-serialize for the message (run 15 printed "?"
  /// and lost the measured pinch ratio).
  private func diagSuffix(_ step: [String: Any]) -> String {
    guard let diagJS = step["diag"] as? String else { return "" }
    return " — diag: \(Self.jsonText(seam.eval("JSON.stringify(\(diagJS))")))"
  }

  private func point(_ step: [String: Any], _ key: String) -> (Double, Double)? {
    guard let p = step[key] as? [String: Any],
          let x = (p["x"] as? NSNumber)?.doubleValue,
          let y = (p["y"] as? NSNumber)?.doubleValue else { return nil }
    return (x, y)
  }

  private func run(step: [String: Any], tag: String) throws {
    let kind = step["kind"] as? String ?? "?"
    if step["transport"] as? String == "unavailable" {
      // recorded-blocked row (see header): counted in driver-report.json
      unavailableTransportRows.append("\(tag) [\(kind)] \(step["note"] as? String ?? "")")
      return
    }
    switch kind {
    case "tap":
      guard let (x, y) = point(step, "from") else { XCTFail("\(tag): tap.from"); return }
      tapAt(coord(x, y), pressMs: num(step, "ms", 40))
    case "hold":
      guard let (x, y) = point(step, "from") else { XCTFail("\(tag): hold.from"); return }
      coord(x, y).press(forDuration: num(step, "ms", 400) / 1000.0)
    case "drag":
      guard let (fx, fy) = point(step, "from"), let (tx, ty) = point(step, "to") else {
        XCTFail("\(tag): drag.from/to"); return
      }
      dragBetween(coord(fx, fy), coord(tx, ty), ms: num(step, "ms", 24 * 16))
    case "twoFinger":
      // pinch form: fixed centroid, spanFrom -> spanTo (normalized fractions
      // of the viewport height); scale = spanTo/spanFrom (see header law)
      let spanFrom = num(step, "spanFrom", 0.36)
      let spanTo = num(step, "spanTo", 0.45)
      let scale = CGFloat(spanTo / max(0.001, spanFrom))
      let ms = num(step, "ms", 16 * 16)
      let velocity = CGFloat(abs(Double(scale) - 1.0) / max(0.05, ms / 1000.0))
      app.webViews.firstMatch.pinch(withScale: scale, velocity: scale >= 1 ? velocity : -velocity)
    case "aimTo":
      XCTAssertTrue(aimTo(num(step, "phi", 0)), "\(tag): aimTo did not converge")
    case "gaugeTo":
      XCTAssertTrue(gaugeTo(num(step, "power", 0)), "\(tag): gaugeTo missed the target")
    case "spinTo":
      XCTAssertTrue(spinTo(num(step, "a", 0), num(step, "b", 0)), "\(tag): spinTo missed")
    case "closePopup":
      closePopup()
    case "fire":
      XCTAssertTrue(fireAndSettle(tag), "\(tag): fire/settle failed")
    case "tapBall":
      XCTAssertTrue(tapBall(Int(num(step, "ball", -1))), "\(tag): ball not projectable")
    case "tapPocket":
      XCTAssertTrue(tapPocket(Int(num(step, "pocket", -1))), "\(tag): pocket not projectable")
    case "tapEl":
      // 014 pattern: eval-located rect fed to tap() — `el` js must return
      // {found, cx, cy} (the __tp finder shape); `minPt` optionally gates
      // the 44 pt touch-target law before the tap
      guard let js = step["el"] as? String else { XCTFail("\(tag): tapEl.el"); return }
      guard let r = evalRect(js), let cx = r["cx"], let cy = r["cy"] else {
        XCTFail("\(tag): tapEl rect not found — js: \(js)"); return
      }
      if let minPt = (step["minPt"] as? NSNumber)?.doubleValue,
         let w = r["w"], let h = r["h"] {
        XCTAssertGreaterThanOrEqual(min(w, h), minPt - 0.5,
                                    "\(tag): tapEl target under \(minPt) pt")
      }
      tapAt(pxCoord(cx, cy), pressMs: num(step, "ms", 40))
      usleep(300_000)
    case "tapElUntil":
      // Transient-tap net (016 L3 round 2, run 29147309968): a synthesized
      // press on this runner can be swallowed even at a point verified by
      // elementFromPoint — the #hud-call strip-center tap produced no click
      // while run 29146277678's accidental tap 71 px away on the SAME strip
      // opened the picker. Re-locate + re-tap bounded times until `until`
      // is truthy; fail loudly with the table's diag payload so the next
      // red is decisive. Single-tap LAW steps stay on plain tapEl.
      guard let js = step["el"] as? String else { XCTFail("\(tag): tapElUntil.el"); return }
      guard let untilJS = step["until"] as? String else {
        XCTFail("\(tag): tapElUntil.until"); return
      }
      let attempts = max(1, Int(num(step, "tries", 3)))
      var satisfied = false
      for attempt in 0..<attempts {
        // a slow previous tap may have landed after its poll window — and
        // its effect (an open sheet) can legitimately cover the target, so
        // re-check before re-locating
        if attempt > 0, waitEvalRecovering(untilJS, tries: 2) != nil { satisfied = true; break }
        guard let r = evalRect(js), let cx = r["cx"], let cy = r["cy"] else {
          XCTFail("\(tag): tapElUntil rect not found (attempt \(attempt + 1))"
            + " — js: \(js)\(diagSuffix(step))")
          return
        }
        if attempt == 0, let minPt = (step["minPt"] as? NSNumber)?.doubleValue,
           let w = r["w"], let h = r["h"] {
          XCTAssertGreaterThanOrEqual(min(w, h), minPt - 0.5,
                                      "\(tag): tapElUntil target under \(minPt) pt")
        }
        tapAt(pxCoord(cx, cy), pressMs: num(step, "ms", 40))
        if waitEvalRecovering(untilJS, tries: Int(num(step, "waitTries", 10))) != nil {
          satisfied = true
          break
        }
      }
      if !satisfied {
        XCTFail("\(tag): tapElUntil never satisfied after \(attempts) taps"
          + " — until: \(untilJS)\(diagSuffix(step))")
      }
    case "dragEl":
      // eval-located rect + from/to as 0..1 fractions of the rect (the 014
      // popup-range drag pattern: rng.x + 4 .. rng.x + rng.w - 2)
      guard let js = step["el"] as? String else { XCTFail("\(tag): dragEl.el"); return }
      guard let r = evalRect(js), let rx = r["x"], let ry = r["y"],
            let rw = r["w"], let rh = r["h"] else {
        XCTFail("\(tag): dragEl rect not found — js: \(js)"); return
      }
      guard let (ffx, ffy) = point(step, "from"), let (ttx, tty) = point(step, "to") else {
        XCTFail("\(tag): dragEl.from/to"); return
      }
      dragBetween(pxCoord(rx + rw * ffx, ry + rh * ffy),
                  pxCoord(rx + rw * ttx, ry + rh * tty),
                  ms: num(step, "ms", 12 * 16))
      usleep(200_000)
    case "bihDragTo":
      XCTAssertTrue(
        bihDragTo(kx: num(step, "kx", 0), ky: num(step, "ky", 0),
                  expectKx: (step["expectKx"] as? NSNumber)?.doubleValue,
                  expectKy: (step["expectKy"] as? NSNumber)?.doubleValue),
        "\(tag): BIH placement missed (±0.035 m)")
    case "eval":
      guard let js = step["js"] as? String else { XCTFail("\(tag): eval.js"); return }
      evalOrFail(js, saveAs: step["saveAs"] as? String, tag)
    case "waitEval":
      guard let js = step["js"] as? String else { XCTFail("\(tag): waitEval.js"); return }
      let tries = Int(num(step, "tries", 40))
      if waitEvalRecovering(js, tries: tries) == nil {
        XCTFail("\(tag): waitEval never truthy: \(js)\(diagSuffix(step))")
      }
    case "assertEval":
      guard let js = step["js"] as? String else { XCTFail("\(tag): assertEval.js"); return }
      // scenario-authored js: the pre-execution seam guard (seamGuarded)
      var outcome = seam.evalOutcome(Self.seamGuarded(js))
      if case .ok(let x) = outcome, x as? String == Self.seamLostSentinel,
         recoverSeamIfLost("\(tag) assertEval") { // body never entered
        outcome = seam.evalOutcome(Self.seamGuarded(js))
      }
      var v: Any? = nil
      if case .ok(let x) = outcome, x as? String != Self.seamLostSentinel { v = x }
      let name = step["name"] as? String ?? tag
      if let expected = step["equals"] {
        let got = v.map { "\($0)" } ?? "nil"
        XCTAssertEqual(got, "\(expected)", "\(name) — js: \(js)")
      } else if (v as? Bool) != true {
        XCTAssertEqual(v as? Bool, true, "\(name) — js: \(js)\(diagSuffix(step))")
      }
    case "waitState":
      let target = step["state"] as? String ?? "AIM"
      let tries = Int(num(step, "tries", 220))
      var ok = false
      for _ in 0..<tries {
        let s = gameState()
        if s == target { ok = true; break }
        if s == "?" { _ = recoverSeamIfLost("\(tag) waitState") } // errored read
        usleep(350_000)
      }
      XCTAssertTrue(ok, "\(tag): state never reached \(target) (now \(gameState()))")
    case "background":
      // SC-006 resume arm: home -> bounded background dwell -> reactivate.
      // The hosted simulator does NOT reliably suspend the page on Home
      // (016 L3 round 2, run 29147309968: max rAF gap 1378 ms across a 3 s
      // dwell — the WKWebView kept rendering, so the 9 s replay ran out in
      // real time under XCUITest orchestration overhead). When the table
      // names verifyJs (its own suspension proof, e.g. max rAF gap >=
      // 1.5 s), retry the whole cycle bounded times and fail loudly with
      // the diag payload if the OS never suspends.
      let cycles = max(1, Int(num(step, "retries", 0)) + 1)
      var suspended = false
      for cycle in 0..<cycles {
        XCUIDevice.shared.press(.home)
        usleep(UInt32(num(step, "ms", 3000) * 1000))
        app.activate()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15),
                      "\(tag): web view gone after resume (cycle \(cycle + 1))")
        guard let verifyJS = step["verifyJs"] as? String else { suspended = true; break }
        // the suspension gap lands in the page's probe on the FIRST
        // post-resume rAF — bounded poll instead of a blind sleep
        if waitEvalRecovering(verifyJS, tries: 8) != nil { suspended = true; break }
      }
      if !suspended {
        XCTFail("\(tag): page never suspended across \(cycles) background cycles"
          + " (verifyJs stayed falsy)\(diagSuffix(step))")
      }
    case "checkpoint":
      // L4 rendezvous (acceptance.mjs): write the checkpoint marker, wait
      // (bounded) for the host ack; e2e-ios.mjs auto-acks instantly.
      guard let cpName = step["name"] as? String else { XCTFail("\(tag): checkpoint.name"); return }
      // Driver-side PNG at the checkpoint instant: simctl io screenshot
      // costs ~45 s PER capture on the hosted image (run 29145125984: two
      // captures ate the whole replay while the app stayed foreground);
      // XCUIScreen captures in ~1 s and the test driver just files it
      // (falling back to simctl io only when this PNG is absent).
      let shotData = XCUIScreen.main.screenshot().pngRepresentation
      try? shotData.write(to: seam.artifactURL("checkpoint-\(cpName).png"))
      let marker = seam.artifactURL("checkpoint-\(cpName).json")
      let ack = seam.artifactURL("checkpoint-\(cpName).ack.json")
      let payload = ["name": cpName, "tag": tag]
      if let d = try? JSONSerialization.data(withJSONObject: payload) { try? d.write(to: marker) }
      // 180 s: the ack follows the test driver's checkpoint screenshot,
      // and the FIRST simctl io screenshot on a freshly-booted simulator
      // can take ~60 s cold (T038 CI evidence: run 29138064733 — the ack
      // landed 30 ms after the old 60 s deadline). Bounded still.
      let deadline = Date().addingTimeInterval(180)
      while Date() < deadline && !FileManager.default.fileExists(atPath: ack.path) {
        usleep(150_000)
      }
      XCTAssertTrue(FileManager.default.fileExists(atPath: ack.path),
                    "\(tag): checkpoint \(cpName) never acked by the test driver")
    case "sleep":
      usleep(UInt32(num(step, "ms", 500) * 1000))
    default:
      XCTFail("\(tag): unknown step kind '\(kind)'")
    }
  }
}
