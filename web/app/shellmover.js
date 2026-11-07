// Copyright (c) Meta Platforms, Inc. and affiliates.

// shellmover.js — the shell camera mover (feature 031, program 525 S1;
// contract: the shell contract (feature 031, internal) §3 — the D6 ruling).
//
// The app's FIRST interactive-path camera animator. Laws implemented here,
// verbatim from the contract:
//   (1) every move ≤ ~1.0 s wall clock, C2 smootherstep ease (the GH-275
//       owner-signed easing FUNCTION from camerascript.js, reused as pure
//       math — the camerascript RIG stays untouched per its determinism law);
//   (2) at most ONE move in flight — a new request cuts the current move to
//       its own end pose first, then starts;
//   (3) ANY user input interrupts to the end pose (cut, never rewind) —
//       shell.js owns the input listeners and calls cutToEnd();
//   (4) `prefers-reduced-motion` ⇒ instant snap;
//   (5) scripted boots never animate — shell.js passes instant:true
//       (`obshell=1` poses are applied instantly);
//   (6) the mover writes through orbit.state + orbit.apply() every frame, so
//       free orbit engages seamlessly at arrival (the camerapresets
//       precedent, camerapresets.js:76-79);
//   (7) aim-view gate: `__aim.setAimView(false)` at move start — orbit.js's
//       auto-disengage is gesture-only (orbit.js:61-108) and aim.js re-poses
//       the camera every frame while engaged (aim.js:2439+); shell.js blocks
//       re-engage while the shell owns the camera;
//   (9) entry-pose capture + instant gameplay-pose restore at exit
//       (FR-007(5); `camera=overhead` re-homes per D15 via the __camhome
//       seam — the D15 composition law).
//
// Per-frame cost: scalar writes into orbit.state + one orbit.apply() while a
// move is in flight; zero allocation per frame; strictly camera state — no
// kernel consumers (constitution P-II/P-V).

// C2 smootherstep u³(6u²−15u+10) — zero first AND second derivative at both
// ends (camerascript.js `smoother`, duplicated as pure math per the
// duplicated-literal law: no new import edge into the scripted rig).
const smoother = (u) => u * u * u * (u * (6 * u - 15) + 10);

// orbit.js boot defaults (duplicated-literal law — change with orbit.js):
// the FALLBACK gameplay pose when no entry pose was captured. Radius scales
// with the active table length like camerapresets 'default' does.
const BOOT_POSE = { tx: 0, ty: 0.05, tz: 0, radius: 2.7, theta: -0.9, phi: 1.05 };
const PLAY_FOV = 40; // main.js PerspectiveCamera(40, …) (duplicated literal)
const MOVE_MS = 900; // ≤ the contract's 1.0 s bound

export function createShellMover({ orbit, camera, machine }) {
  const reducedMotion = () => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch { return false; }
  };

  // MoverState (data-model.md): at most one in-flight move; transient only.
  let flight = null; // { from, to, t0, resolve }
  let entryPose = null; // captured at shell entry; consumed by restore

  const snapshot = () => ({
    tx: orbit.state.target.x, ty: orbit.state.target.y, tz: orbit.state.target.z,
    radius: orbit.state.radius, theta: orbit.state.theta, phi: orbit.state.phi,
    fov: camera.fov,
  });

  /** Apply a pose through the rig (exact write; orbit clamps in apply()). */
  function applyPose(p) {
    orbit.state.target.set(p.tx, p.ty, p.tz);
    orbit.state.radius = p.radius;
    orbit.state.theta = p.theta;
    orbit.state.phi = p.phi;
    if (Number.isFinite(p.fov) && camera.fov !== p.fov) {
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
      // a mover pose OWNS the fov it sets — cancel any post-exit aim-view
      // settle (the camerapresets/applyDefaultCamera precedent)
      window.__aim?.fovSettleCancel?.();
    }
    orbit.apply();
    // occluder-fade snap (031 §9 deviation 6; review visual-audit fix): an
    // INSTANT camera jump must not ride the occluder fade's 0.2 s rate
    // limit — a reduced-motion equipment→play cut showed ~12 frames of the
    // canopy blocking the upper frame while the fade caught up. Pin the
    // fade to THIS pose's own target through the existing force seam, then
    // hand control back — force(null) resumes rate-limiting FROM the pin,
    // which already equals the pose target. applyPose runs only at
    // instant/cut/landing moments, so eased flights keep the live ramp.
    // Literals mirror scene/lampfade.js FADE_BAND_LO/HI (duplicated-
    // literal law — change with lampfade.js); the seam is feature-detected
    // (a stale lampfade keeps today's catch-up ramp, never an error).
    const lf = window.__lampfade;
    if (lf?.force && typeof lf.plane === 'function') {
      const u = (camera.position.y - (lf.plane() + 0.02)) / 0.1;
      lf.force(1 - Math.min(1, Math.max(0, u)));
      lf.force(null);
    }
  }

  /** Cut the in-flight move (if any) to ITS OWN end pose — never a rewind. */
  function cutToEnd() {
    if (!flight) return false;
    const f = flight;
    flight = null;
    applyPose(f.to);
    f.resolve('cut');
    return true;
  }

  /** One bounded move to `to` (orbit terms + optional fov). Returns a
   * promise resolving 'landed' (ran to completion), 'cut' (interrupted to
   * end pose — pose-at-interrupt === end pose), or 'instant'. */
  function moveTo(to, { instant = false } = {}) {
    // aim-view gate FIRST (§3(7)) — an engaged chase would fight the move
    // this same frame otherwise
    try { window.__aim?.setAimView?.(false); } catch { /* seam absent */ }
    cutToEnd(); // one-in-flight: the old move terminates at its end pose
    const target = {
      tx: to.tx, ty: to.ty, tz: to.tz,
      radius: to.radius, theta: to.theta, phi: to.phi,
      fov: Number.isFinite(to.fov) ? to.fov : PLAY_FOV,
    };
    if (instant || reducedMotion()) {
      applyPose(target);
      return Promise.resolve('instant');
    }
    const from = snapshot();
    // degenerate same-pose move (owner fix round 2026-08-14, §9 dev 5): a
    // request for the pose ALREADY HELD resolves instantly — a from==to
    // flight would pin the rig against free orbit for the full 900 ms
    // (surfaced by the wider play anchor: a table prop-tap at the play
    // place re-requests the play pose)
    if (Math.abs(target.tx - from.tx) < 1e-9
      && Math.abs(target.ty - from.ty) < 1e-9
      && Math.abs(target.tz - from.tz) < 1e-9
      && Math.abs(target.radius - from.radius) < 1e-9
      && Math.abs(target.theta - from.theta) < 1e-9
      && Math.abs(target.phi - from.phi) < 1e-9
      && Math.abs(target.fov - from.fov) < 1e-9) {
      applyPose(target); // exact write-through (clamps included)
      return Promise.resolve('instant');
    }
    // shortest-path theta (the aim-chase wrap law): ease through the small
    // arc, never the long way around
    let dTh = (target.theta - from.theta) % (2 * Math.PI);
    if (dTh > Math.PI) dTh -= 2 * Math.PI;
    if (dTh < -Math.PI) dTh += 2 * Math.PI;
    return new Promise((resolve) => {
      flight = { from, to: target, dTh, t0: performance.now(), resolve };
    });
  }

  // per-frame stepping rides the machine's frame hook (additive
  // registration, state.js contract) — wall clock, interactive-camera-only
  // (the same class as free orbit input; never a record/replay input).
  machine.on('frame', () => {
    if (!flight) return;
    const f = flight;
    const u = Math.min(1, (performance.now() - f.t0) / MOVE_MS);
    const k = smoother(u);
    orbit.state.target.set(
      f.from.tx + (f.to.tx - f.from.tx) * k,
      f.from.ty + (f.to.ty - f.from.ty) * k,
      f.from.tz + (f.to.tz - f.from.tz) * k);
    orbit.state.radius = f.from.radius + (f.to.radius - f.from.radius) * k;
    orbit.state.theta = f.from.theta + f.dTh * k;
    orbit.state.phi = f.from.phi + (f.to.phi - f.from.phi) * k;
    if (f.to.fov !== f.from.fov) {
      camera.fov = f.from.fov + (f.to.fov - f.from.fov) * k;
      camera.updateProjectionMatrix();
    }
    orbit.apply();
    if (u >= 1) {
      flight = null;
      applyPose(f.to); // exact landing (no float residue at the anchor)
      f.resolve('landed');
    }
  });

  /** Capture the gameplay pose at shell entry (FR-007(5)). */
  function captureEntry() { entryPose = snapshot(); }
  function clearEntry() { entryPose = null; }
  /** GH-1025: replace the captured pose with the one a FRESH entry
   * captures — the orbit.js boot defaults at the play fov, unscaled (orbit
   * mode applies nothing at boot or on a rack, GH-441) — so the exit after
   * a hall commit that changed the game or the bed lands where a fresh
   * boot into that game would, never on the previous table's framing. */
  function freshEntry() {
    entryPose = { ...BOOT_POSE, fov: PLAY_FOV };
  }

  /** Restore a gameplay camera pose INSTANTLY at shell→table exit:
   * `camera=overhead` re-homes per D15 (the __camhome seam — the ruled
   * composition law); `camera=orbit` restores the entry-captured pose
   * (fallback: the orbit boot-default table pose, scaled to the active
   * bed like camerapresets 'default'). Never a wall pose. */
  function restoreGameplayPose({ game } = {}) {
    cutToEnd();
    const mode = window.__settings?.get?.().camera;
    if (mode === 'overhead' && window.__camhome?.apply?.('overhead')) {
      entryPose = null;
      return 'overhead';
    }
    if (entryPose) {
      applyPose(entryPose);
      entryPose = null;
      // When the overhead re-home above refused on a lamp or fixture reason
      // (camHome degrades, and its recovery read the shell's own high-phi
      // pose and stood down), this entry pose can be the overhead register
      // itself, over a fixture that cannot fade (a stale pre-381 lighting
      // layer, mixed cache). main's recovery reads the restored pose now;
      // feature-detected, and a no-op on a fadeable rig, in orbit mode or at
      // an orbit pose.
      window.__camhome?.degradeCheck?.();
      return 'entry';
    }
    const dims = game?.template?.system?.table;
    const scale = dims ? Math.max(1, dims.length / 2.54) : 1; // TABLE.length
    applyPose({ ...BOOT_POSE, radius: BOOT_POSE.radius * scale, fov: PLAY_FOV });
    return 'default';
  }

  return {
    moveTo,
    cutToEnd,
    moving: () => !!flight,
    captureEntry,
    clearEntry,
    freshEntry,
    restoreGameplayPose,
    pose: snapshot,
    applyPose,
  };
}
