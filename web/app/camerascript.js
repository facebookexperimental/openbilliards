// Copyright (c) Meta Platforms, Inc. and affiliates.

// camerascript.js — deterministic scripted camera rig for offline capture
// (issue #154 render hooks; the cameratrack.js capture-module precedent).
// Exposed by main.js as `__test.cameraPose` / `__test.cameraScript`.
// Originally a HARNESS surface only (record.mjs-style tools drive it
// through CDP); since GH-275 the playback player's POV preset and
// offline-render.js's per-segment `{ script }` directive arm it too —
// same hooks, same purity law. Nothing here runs until one of those hooks
// is invoked (the 'frame' listener early-returns while no script is armed).
//
// Determinism doctrine (issue #14): a scripted pose is a PURE function of
// the playback clock t. The rig re-poses on every machine 'frame' emission
// — each `__test.renderAt(t)` emits exactly one — using only t (never dt,
// never wall clock, no damping state), so the same record + the same script
// steps a byte-identical frame sequence on every run.
//
// Coordinates are KERNEL-frame [kx, ky, h] arrays (the record.mjs camJs /
// cameratrack.js directive convention: three.x = k.y, three.y = h,
// three.z = k.x). Azimuths use the orbit.js theta convention
// (eye.x = c.x + r·sin(az), eye.z = c.z + r·cos(az), three frame).
//
// Script spec (`cameraScript(spec)`; `cameraScript(null)` clears):
//   { moves: [
//     { t0, t1, kind: 'pose',  cam, look, fov? }
//     { t0, t1, kind: 'orbit', center?, radius|radius0/radius1,
//       height|height0/height1, az0, az1, look?, fov?, ease? }
//     { t0, t1, kind: 'dolly', path: [{cam, look, fov?}, …≥2], ease? }
//     { t0, t1, kind: 'crane', cam, look, rise: [dkx, dky, dh], ease? }
//     { t0, t1, kind: 'overhead', center?, height|height0/height1?, fov?,
//       margin?, ease? }
//   ] }
// ease: 'linear' (default) | 'smooth' (smoothstep) | 'smoother' (the C2
// smootherstep u³(6u²−15u+10) — GH-275's owner-signed rise math; a stale
// cached rig without it degrades that move to linear, consistently in the
// live player and the export). Moves are sorted by t0
// and must not overlap; between/outside move windows the pose holds at the
// nearest boundary (before the first move: its start pose; after a move
// ends: its end pose) — still a pure function of t.
//
// FOV resolution law (review P2, PR #175): every move's effective FOV is
// resolved STATICALLY at cameraScript() set time, in script order — a move
// omitting `fov` inherits the PREVIOUS move's resolved end-FOV (the first
// move defaults to DEFAULT_FOV, the main.js boot-camera literal mirror);
// dolly waypoints resolve the same way through the path. An overhead move
// without an explicit fov resolves its FIT PARAMETERS (active table half
// span × margin, camera aspect) at set time and evaluates the fitted fov
// from them + h(t) alone — and hands its END fov (fitted at height1) to
// the next move as the carry. After normalization, evaluating any t
// touches only that move's resolved values, so pose(t) is identical under
// chronological stepping and random access (fresh boot → renderAt(t)).
//
// 'overhead' is the straight-down orthographic-feel pose (footage-matched
// top view): the look target is the FULL `center` [kx, ky, h] (height
// component honored — default the bed center [0, 0, 0]) and the eye sits
// `height` (default 6 m) ABOVE it, so `height` is the camera-to-target
// distance the fitted long-lens fov uses (ACTIVE table long axis +
// `margin`); ball-height parallax is ≲ 0.5 % of position. The canopy light fixture
// hangs over the table center (scene/room.js LIGHT_POS) and would occlude
// a straight-down view, so overhead frames hide the canopy MESHES
// (lampFace/hood/rods via room.js activeRoom.lightRefs) — visual only: the
// RectAreaLight is a separate non-mesh object, and every env-cube bake shows
// the meshes again for its duration (scene/lampfade.js suspendForBake,
// GH-972), so illumination and ball-crown reflections are unchanged.
// Visibility is itself a pure function of t (hidden exactly while the
// active move is an overhead), restored on clear/pose.
//
// Cache-poison contract (the ownership ledger rule 5): this file is loaded via a
// guarded dynamic import from main.js, and reaches its two dependencies
// through NAMESPACE imports + feature detection — a stale cached coords.js/
// room.js still links, degrading gracefully instead of killing the boot.
import * as THREE from 'three';
import * as coords from './coords.js';
import * as roomMod from '../scene/room.js';

const OVERHEAD_H = 6;      // default straight-down eye height [m]
const OVERHEAD_MARGIN = 1.06; // fov fit margin over the table long axis
// First-move FOV default when the script never sets one: the boot camera's
// fov, duplicated as a LITERAL on purpose (main.js `new
// THREE.PerspectiveCamera(40, …)`) — reading the LIVE camera.fov at set
// time would leak whatever pose ran before the script and break the
// pose(t) purity law above.
const DEFAULT_FOV = 40;

const smooth = (u) => u * u * (3 - 2 * u);
// C2 smootherstep (zero first AND second derivative at both ends) — the
// GH-275 POV rise easing, verbatim from the owner decision comment
const smoother = (u) => u * u * u * (u * (6 * u - 15) + 10);
const lerp = (a, b, u) => a + (b - a) * u;

/** kernel [kx, ky, h] → three Vector3 (feature-detected coords bridge). */
function kToThree(out, k) {
  if (coords.kPosToThree) return coords.kPosToThree(out, k[0], k[1], k[2]);
  return out.set(k[1], k[2], k[0]); // literal mirror fallback (stale coords)
}

function isK(v) {
  return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
}

export function createCameraScript({ machine, game, camera }) {
  let spec = null; // validated, sorted moves — null = rig disarmed
  const eye = new THREE.Vector3(), look = new THREE.Vector3();
  const pA = new THREE.Vector3(), pB = new THREE.Vector3();
  let warnedFixture = false; // one-shot LOG latch only — never gates writes

  /** Hide/show the canopy fixture meshes (overhead occluders). STATELESS
   * by design (review P2 r5): no cached hidden/shown flag — the meshes'
   * own `.visible` is the only state, re-asserted unconditionally on
   * every call (a handful of plain property writes per evaluation; three
   * only reads `visible` at render time, so redundant writes are free).
   * A cached module flag went stale across fixture switches
   * (lightingvisuals.js legitimately rewrites these meshes' visibility on
   * every applyFixture), leaving a visible canopy occluding a later
   * overhead — deriving from live mesh state kills that whole class, and
   * a mid-script fixture round-trip self-heals on the next frame.
   * Only the canopy_panel fixture is handled — scripted boots pin it
   * (the ownership ledger); under a non-canopy fixture the canopy meshes are the
   * fixture layer's property (it keeps them hidden) and hide/restore is a
   * no-op here, with a once-per-session advisory warn (log dedup only —
   * the latch never gates a visibility write). Feature-detected on every
   * handle (a stale room.js without lightRefs degrades to no hiding). */
  function setCanopyHidden(want) {
    const lr = roomMod.activeRoom?.instance?.lightRefs;
    if (!lr) return;
    const fixture = window.__lighting?.state?.()?.fixture ?? 'canopy_panel';
    if (fixture !== 'canopy_panel') {
      if (want && !warnedFixture) {
        warnedFixture = true;
        console.warn(`[camerascript] overhead: active fixture `
          + `'${fixture}' is not the canopy — it may occlude the view`);
      }
      return;
    }
    for (const m of [lr.lampFace, lr.hood, ...(lr.rods ?? [])]) {
      if (m) m.visible = !want;
    }
  }

  function setFov(fov) {
    if (!Number.isFinite(fov) || fov <= 0 || camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  /** Long-lens vertical fov that fits `halfSpan` horizontally at aspect
   * `aspect` from eye height h — pure in its arguments (script moves pass
   * SET-time-resolved halfSpan/aspect, see the FOV resolution law). */
  function fittedFov(halfSpan, aspect, h) {
    const ha = Math.atan(halfSpan / h);
    return 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(ha) / aspect));
  }

  /** SET-time fit parameters for an overhead move / one-off overhead pose:
   * the ACTIVE table's half long axis × margin, and the live aspect. */
  function overheadFit(margin) {
    return {
      halfSpan: ((game.template?.system?.table?.length ?? 2.54) / 2) * margin,
      aspect: Math.max(camera.aspect, 1e-6),
    };
  }

  /** Straight-down pose: look target = the FULL kernel-frame `center`
   * (its height component included — review P2 r4: the old code forced the
   * target onto the bed and treated the eye height as an absolute world
   * coordinate, contradicting the [kx, ky, h] contract), eye exactly `h`
   * ABOVE the center, so `h` IS the camera-to-target distance — which is
   * what every fittedFov() call site passes, keeping the fitted framing
   * exact for raised centers. Table long axis lands horizontal on screen
   * (camera.up is swapped for the lookAt and restored after). `fov` is
   * always finite here — callers resolve it first. */
  function applyOverhead(center, h, fov) {
    kToThree(look, center);
    eye.copy(look);
    eye.y = look.y + h;
    setFov(fov);
    camera.position.copy(eye);
    const up = camera.up.clone();
    camera.up.set(0, 0, -1); // screen-up = -three.z ⇒ long axis horizontal
    camera.lookAt(look);
    camera.up.copy(up);
    camera.updateMatrixWorld();
  }

  function applyPose(cam, lk, fov) {
    kToThree(eye, cam);
    kToThree(look, lk);
    setFov(fov);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }

  /** Evaluate move m at eased progress u ∈ [0, 1]. Reads ONLY the move's
   * SET-time-resolved values (fovR / path[i].fovR / fit — the FOV
   * resolution law): no live camera/game state, so the pose is a pure
   * function of (move, u). */
  function applyMove(m, u) {
    const e = m.ease === 'smoother' ? smoother(u)
      : m.ease === 'smooth' ? smooth(u) : u;
    setCanopyHidden(m.kind === 'overhead');
    if (m.kind === 'pose') {
      applyPose(m.cam, m.look, m.fovR);
    } else if (m.kind === 'orbit') {
      const az = lerp(m.az0, m.az1, e);
      const r = lerp(m.radius0, m.radius1, e);
      const h = lerp(m.height0, m.height1, e);
      kToThree(pA, m.center);
      eye.set(pA.x + r * Math.sin(az), h, pA.z + r * Math.cos(az));
      kToThree(look, m.look ?? m.center);
      setFov(m.fovR);
      camera.position.copy(eye);
      camera.lookAt(look);
      camera.updateMatrixWorld();
    } else if (m.kind === 'dolly') {
      // piecewise-linear over the (eased) window: n waypoints = n−1 legs
      const legs = m.path.length - 1;
      const s = Math.min(legs - 1e-12, e * legs);
      const i = Math.floor(s), w = s - i;
      const a = m.path[i], b = m.path[i + 1];
      kToThree(pA, a.cam); kToThree(pB, b.cam);
      eye.copy(pA).lerp(pB, w);
      kToThree(pA, a.look); kToThree(pB, b.look);
      look.copy(pA).lerp(pB, w);
      setFov(lerp(a.fovR, b.fovR, w));
      camera.position.copy(eye);
      camera.lookAt(look);
      camera.updateMatrixWorld();
    } else if (m.kind === 'crane') {
      applyPose([m.cam[0] + m.rise[0] * e, m.cam[1] + m.rise[1] * e,
        m.cam[2] + m.rise[2] * e], m.look, m.fovR);
    } else if (m.kind === 'overhead') {
      const h = lerp(m.height0, m.height1, e);
      applyOverhead(m.center, h,
        m.fit ? fittedFov(m.fit.halfSpan, m.fit.aspect, h) : m.fovR);
    }
  }

  /** Pose for playback-clock time t: the move containing t, else the
   * nearest boundary pose (pure in t — see the module doc). */
  function applyAt(t) {
    const moves = spec.moves;
    let m = moves[0], u = 0;
    for (const cand of moves) {
      if (t >= cand.t0) { m = cand; u = 1; } else break;
    }
    if (t >= m.t0 && m.t1 > m.t0) u = Math.min(1, (t - m.t0) / (m.t1 - m.t0));
    applyMove(m, u);
  }

  machine.on('frame', (t) => {
    if (spec) applyAt(t);
  });

  const need = (cond, msg) => {
    if (!cond) throw new Error(`cameraScript: ${msg}`);
  };

  /** Explicit-FOV validation (review P2 r2, PR #175): every explicit move/
   * waypoint fov must be finite and STRICTLY inside (0, 180) — setFov()
   * ignores non-finite/non-positive values, which would silently preserve
   * live camera state (the exact session-history leak the FOV resolution
   * law exists to prevent), and fov >= 180 degenerates the projection.
   * Enforced at ARMING time so resolved fovR values are always valid by
   * construction. `undefined`/`null` mean "inherit" (null = absent keeps
   * JSON round-trips of unset fields consistent with resolveFovs' `??`). */
  const needFov = (fov, at) => {
    if (fov === undefined || fov === null) return;
    need(Number.isFinite(fov) && fov > 0 && fov < 180,
      `${at}: fov must be finite and strictly inside (0, 180), got ${fov}`);
  };

  /** Finite-positive validation for overhead numeric knobs (review P2s r3):
   * `Infinity > 0` is true, so the old `> 0` checks let Infinity heights
   * through — the fitted FOV came out invalid and setFov() silently
   * preserved live state (the same leak family as the fov checks). */
  const needPosNum = (v, at) => {
    need(Number.isFinite(v) && v > 0,
      `${at} must be a finite number > 0, got ${v}`);
  };

  /** OPTIONAL kernel-point validation: absent (undefined/null) is fine —
   * defaults apply — but a PROVIDED value must be a finite [kx, ky, h]
   * (silently falling back to the default on a malformed value would hide
   * caller bugs; review P2s r3 "center coords finite too"). */
  const needOptK = (v, at) => {
    if (v === undefined || v === null) return;
    need(isK(v), `${at} must be [kx, ky, h] finite numbers`);
  };

  /** Validate + normalize one move into the internal shape. */
  function normalizeMove(m, i) {
    const at = `moves[${i}]`;
    need(Number.isFinite(m.t0) && Number.isFinite(m.t1) && m.t1 >= m.t0,
      `${at}: t0/t1 must be finite with t1 >= t0`);
    needFov(m.fov, at);
    const out = { t0: m.t0, t1: m.t1, kind: m.kind, ease: m.ease, fov: m.fov };
    if (m.kind === 'pose' || m.kind === 'crane') {
      need(isK(m.cam) && isK(m.look), `${at}: cam/look must be [kx, ky, h]`);
      out.cam = m.cam; out.look = m.look;
      if (m.kind === 'crane') {
        need(isK(m.rise), `${at}: crane needs rise: [dkx, dky, dh]`);
        out.rise = m.rise;
      }
    } else if (m.kind === 'orbit') {
      needOptK(m.center, `${at}: center`);
      out.center = m.center ?? [0, 0, 0];
      out.radius0 = m.radius0 ?? m.radius;
      out.radius1 = m.radius1 ?? m.radius ?? out.radius0;
      out.height0 = m.height0 ?? m.height;
      out.height1 = m.height1 ?? m.height ?? out.height0;
      out.az0 = m.az0; out.az1 = m.az1 ?? m.az0;
      need([out.radius0, out.radius1, out.height0, out.height1, out.az0,
        out.az1].every(Number.isFinite),
      `${at}: orbit needs radius(0/1), height(0/1), az0(/az1)`);
      needOptK(m.look, `${at}: look`);
      if (m.look != null) out.look = m.look;
    } else if (m.kind === 'dolly') {
      need(Array.isArray(m.path) && m.path.length >= 2
        && m.path.every((p) => isK(p.cam) && isK(p.look)),
      `${at}: dolly needs path: [{cam, look}, …] with >= 2 waypoints`);
      m.path.forEach((p, j) => needFov(p.fov, `${at}.path[${j}]`));
      out.path = m.path;
    } else if (m.kind === 'overhead') {
      needOptK(m.center, `${at}: center`);
      out.center = m.center ?? [0, 0, 0];
      out.height0 = m.height0 ?? m.height ?? OVERHEAD_H;
      out.height1 = m.height1 ?? m.height ?? out.height0;
      out.margin = m.margin ?? OVERHEAD_MARGIN;
      // finite-positive (needPosNum), not just > 0: Infinity heights and
      // 0/NaN/Infinity margins made the fitted FOV invalid, which setFov()
      // silently ignored — history-dependent FOV again (review P2s r3)
      needPosNum(out.height0, `${at}: height/height0`);
      needPosNum(out.height1, `${at}: height/height1`);
      needPosNum(out.margin, `${at}: margin`);
    } else {
      need(false, `${at}: unknown kind '${m.kind}'`);
    }
    return out;
  }

  /** SET-time FOV resolution over the SORTED moves (the FOV resolution law
   * in the module doc): each move's effective fov is pinned into fovR /
   * path[i].fovR / fit here, carrying the previous move's resolved end-FOV
   * forward, so applyMove never has to consult live camera state. */
  function resolveFovs(moves) {
    let carry = DEFAULT_FOV;
    for (const m of moves) {
      if (m.kind === 'dolly') {
        m.path = m.path.map((p) => {
          const fovR = p.fov ?? m.fov ?? carry;
          carry = fovR;
          return { ...p, fovR };
        });
      } else if (m.kind === 'overhead') {
        if (Number.isFinite(m.fov)) {
          m.fovR = m.fov;
          carry = m.fov;
        } else {
          // fit parameters pinned NOW; the per-t fitted fov is then a pure
          // function of (fit, h(t)); the carry is the move's END fov
          m.fit = overheadFit(m.margin);
          carry = fittedFov(m.fit.halfSpan, m.fit.aspect, m.height1);
        }
      } else {
        m.fovR = m.fov ?? carry;
        carry = m.fovR;
      }
    }
  }

  return {
    /** One-off exact pose (clears any armed script on SUCCESS):
     * { cam, look, fov? } or { overhead: true, center?, height?, fov?,
     * margin? }. Omitting fov keeps the CURRENT fov (the __test.camera
     * fov=0 semantic) — one-off writes are not pose(t), so the purity law
     * does not apply; scripts resolve their FOVs statically instead.
     * Validate-before-disarm law (review P2s r3): the COMPLETE spec is
     * validated first, and an invalid pose rejects — console diagnostic +
     * return false — leaving the camera, the canopy AND any armed script
     * exactly as they were (the script keeps driving subsequent frames).
     * Bypasses the orbit rig like __test.camera (the ownership ledger
     * scripted-capture note) — re-pose via setCamera before re-engaging
     * interactive camera work. */
    pose(p = {}) {
      const overhead = p.overhead === true;
      const h = p.height ?? OVERHEAD_H;
      const margin = p.margin ?? OVERHEAD_MARGIN;
      try {
        needFov(p.fov, 'pose');
        if (overhead) {
          needPosNum(h, 'pose: height');
          needPosNum(margin, 'pose: margin');
          needOptK(p.center, 'pose: center');
        } else {
          need(isK(p.cam) && isK(p.look), 'pose: cam/look must be [kx, ky, h]');
        }
      } catch (e) {
        console.error(`[camerascript] pose rejected: ${e.message ?? e}`);
        return false;
      }
      // fully valid — NOW disarm the script and apply the pose
      spec = null;
      if (overhead) {
        setCanopyHidden(true);
        // one-off write (not pose(t)) — a live fitted fov is fine here
        const fit = overheadFit(margin);
        applyOverhead(p.center ?? [0, 0, 0], h,
          p.fov ?? fittedFov(fit.halfSpan, fit.aspect, h));
      } else {
        setCanopyHidden(false);
        applyPose(p.cam, p.look, p.fov);
      }
      return true;
    },
    /** Arm a keyframed script (see the module doc), applying its t=0 pose
     * immediately; `script(null)` disarms and restores the canopy. An
     * INVALID spec (shape violations, out-of-range explicit fovs — review
     * P2 r2) rejects the WHOLE script: console diagnostic + return false,
     * with the camera and any previously armed script untouched
     * (validation runs to completion before anything is applied). */
    script(s) {
      if (s === null || s === undefined) {
        spec = null;
        setCanopyHidden(false);
        return true;
      }
      let moves;
      try {
        need(Array.isArray(s.moves) && s.moves.length > 0,
          'spec.moves must be a non-empty array');
        moves = s.moves.map(normalizeMove)
          .sort((a, b) => a.t0 - b.t0);
        for (let i = 1; i < moves.length; i++) {
          need(moves[i].t0 >= moves[i - 1].t1, 'moves must not overlap');
        }
        resolveFovs(moves); // FOV resolution law: pin every move's fov NOW
      } catch (e) {
        console.error(`[camerascript] script rejected: ${e.message ?? e}`);
        return false;
      }
      spec = { moves };
      applyAt(0);
      return true;
    },
    active: () => !!spec,
  };
}
