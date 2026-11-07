// Copyright (c) Meta Platforms, Inc. and affiliates.

// touch.js — canvas gesture classifier LEAF module (feature 014, lane T).
// Loaded ONLY via the feature-detected dynamic import in main.js startLoop
// (coarse-pointer media query), per the cache-poison contract in
// the ownership ledger (internal) — never a static import on the boot path; its
// absence leaves the desktop app fully functional.
//
// Contract (FROZEN): the touch-input contract (feature 014, internal).
// The FSM here implements data-model.md §2 in full — states S0–S5 with the
// reclassification law (a gesture is only (re)classified out of a NEUTRAL
// state S0/S1; S2/S3/S4 are terminal until every finger lifts through the
// S5 drain) and the neutral-tap law (pointerdown mutates nothing; a missed
// tap is a strict no-op):
//   S1→S2 relative aim drag (row 4/10): setPhi(phi − dx·G0·m(v)) in BOTH
//        camera views, coalesced samples integrated one by one, lastX
//        re-baselined at the slop-crossing point (no accumulated-slop pop);
//   S1→S3 ball-in-hand ghost placement (rows 3/13–15): grab zone
//        max(3R world, 22 pt), placement point GHOST_OFFSET_PX up-screen,
//        every move applied immediately through the LATE-BOUND
//        game.placeCue (flow.js wraps supply kitchen/D/carom rights), so
//        up AND cancel are lossless by construction;
//   S1→S4 two-finger orbit + pinch (rows 5/16–20): centroid → theta/phi at
//        ORBIT_GAIN through the ctx.orbit rig fields + apply() (clamps come
//        free), span ratio → radius; in aim view the first move is the
//        GESTURE BREAKOUT (issue #56): disengage via the __aim seam and
//        continue orbit/pinch from the CURRENT pose (single-pose law);
//        a 3rd finger upgrades the row to PAN — orbit.pan() translates the
//        clamped orbit target (row 18 amended);
//   S1 tap-up nomination (rows 6–8): raycast-free screen-distance test on
//        enlarged pocket discs / legal call targets, resolved through the
//        existing __aim seams (nominatePocket/selectCallBall); a call-
//        target tap ALSO coarse-aims at the tapped ball unless the aim
//        ray's first ball already is it (issue #84, §8.2 amendment); a
//        tap the nomination surfaces do NOT consume falls through to the
//        quick-aim row (issue #46, touch-input.md §8.1): an object-ball
//        hit routes to the additive __aim.aimAtBall seam (camera never
//        written);
//   rows 1–2 (amended, issue #69 — camera in every state): a press ARMS in
//        EVERY machine state; aim/place/tap rights latch at press time
//        (AIM/BALL_IN_HAND only; a machine-state exit demotes them) so the
//        S4 camera rows work during PLAYBACK/replay too, while a
//        camera-only single-finger press stays inert (tap-up = strict
//        no-op) and leaving the aiming states preserves S1/S4/S5 (S2/S3
//        die with their surfaces through the S5 drain);
//   row 23 hard reset on visibilitychange(hidden)/pagehide/blur — the shot
//        NEVER fires implicitly (this module holds no fire path at all).
//
// ctx shape (frozen, touch-input.md §2):
//   { dom, game, machine, hud, orbit, camera } — game.placeCue/placeCueInD
//   are accessed LATE-BOUND only (property lookup at call time; flow.js
//   wraps supply kitchen/D/carom placement rights). ctx.replayActive is
//   read from the existing settings.js ctx export exactly as aim.js does.
import * as THREE from 'three';
import { R } from './ballset.js';
import { threePosToK } from './coords.js';
import { ctx as settingsCtx } from './settings.js';
// t: LONG-EXISTING i18n export (touchwidgets.js imports the same name), so
// this edge cannot hit the just-added-export cache-poison class (OWNERSHIP
// rule 5 corollary); touch.js is a coarse-pointer-only dynamic-import leaf,
// never on the boot graph. Used by the GH-145 zoom watchdog hint only.
import { t } from './i18n.js';

// ---- frozen constants (touch-input.md §3 / data-model.md §5) ---------------
const TOUCH_SLOP_PX = 10;      // tap-vs-drag displacement threshold (S1)
const FINE_MIN = 0.1;          // desktop shift-fine factor, reused
const V_LO = 60;               // fine-curve ramp start [px/s]
const V_HI = 480;              // fine-curve ramp end [px/s]
const V_EMA_MS = 80;           // pointer-speed EMA time constant [ms]
const NUDGE_STEP_DEG = 0.05;   // keyboard-nudge parity step (SC-005)
const POCKET_TAP_MIN_PT = 22;  // 44 pt HIG diameter on the disc center
const BIH_GRAB_MIN_PT = 22;    // grab-zone screen floor over 3R world
const GHOST_OFFSET_PX = 56;    // S3 finger-occlusion up-screen offset
const ORBIT_GAIN = 0.005;      // orbit.js drag gain, reused verbatim

/** m(v) = FINE_MIN + (1 − FINE_MIN)·smoothstep(V_LO, V_HI, v) — §2.4. */
function fineOf(v) {
  const t = Math.min(1, Math.max(0, (v - V_LO) / (V_HI - V_LO)));
  return FINE_MIN + (1 - FINE_MIN) * t * t * (3 - 2 * t);
}

/**
 * Install the touch input layer. The module's only consumed export.
 * Returns { installed: true } on success, undefined on failure — NEVER
 * throws across the seam (touch-input.md §2).
 */
export function installTouch(appCtx) {
  try {
    return install(appCtx);
  } catch (e) {
    try { console.warn('[touch] install failed — desktop input untouched:', e); } catch { /* noop */ }
    return undefined;
  }
}

function install({ dom, game, machine, hud, orbit, camera }) {
  if (!dom || window.__touch?.installed) return window.__touch ? { installed: true } : undefined;

  // ---- failure containment (touch-input.md §7): any exception inside a
  // classifier handler is caught per-event, surfaced through the app's
  // standard error reporter ONCE per distinct message (main.js frame-hook
  // precedent — main.js listens on window 'error'), and resets the
  // classifier to S0. A touch failure must never break the rAF loop,
  // desktop input, or DOM controls.
  const reported = new Set();
  function contain(err) {
    const msg = 'touch: ' + (err?.message ?? String(err));
    if (!reported.has(msg)) {
      reported.add(msg);
      try { window.dispatchEvent(new ErrorEvent('error', { message: msg })); } catch { /* reporting must never throw */ }
    }
    hardReset();
  }
  const guarded = (fn) => (e) => { try { fn(e); } catch (err) { contain(err); } };

  // ---- classifier state (data-model.md §2.1) --------------------------------
  let state = 'S0';
  const active = new Map(); // pointerId → { x, y } (drain bookkeeping)
  let press = null;         // S1: { id, x0, y0 } — nothing mutated yet
  let aim = null;           // S2: { id, lastX }
  let place = null;         // S3: { id }
  let cam = null;           // S4: { a, b, cx, cy, span0, radius0 }
  let fineFactor = 1;       // last m(v) applied (SC-005 e2e surface)
  let vEma = 0;             // EMA-smoothed pointer speed [px/s]
  let vT = 0;               // last velocity-sample timestamp [ms]
  let vX = 0, vY = 0;       // last velocity-sample position

  // replay lock, read exactly as aim.js reads it (touch-input.md §2)
  const replayActive = () => !!settingsCtx.replayActive?.();
  /** Kernel ball radius of THIS rack (template truth; render R fallback). */
  const ballR = () => game.template?.system?.balls?.[0]?.params?.r ?? R;
  // issue #68 playground sandbox: mode read through the SAME settings ctx
  // export (zero new import edges); the placement seam is feature-detected
  // per call (a stale flow.js degrades to the classic cue-only S3).
  const playgroundOn = () => !replayActive()
    && settingsCtx.settings?.get?.()?.mode === 'playground'
    && typeof window.__playground?.placeBall === 'function';

  // ---- projection helpers (camera is read-only: raycasts/projections) ------
  const rayc = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R); // y = ball center
  const hitV = new THREE.Vector3();
  const pv = new THREE.Vector3();

  /** World point → CSS-px screen point (null when behind the camera). */
  function projectPx(wx, wy, wz, rect) {
    pv.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
    if (pv.z >= 0) return null;
    pv.applyMatrix4(camera.projectionMatrix);
    return {
      x: rect.left + (pv.x + 1) / 2 * rect.width,
      y: rect.top + (1 - pv.y) / 2 * rect.height,
    };
  }

  /** Screen-px length of a world radius around center c (max over axes). */
  function radiusPx(c, rWorld, rect) {
    const s0 = projectPx(c.x, c.y, c.z, rect);
    if (!s0) return 0;
    let r = 0;
    const sx = projectPx(c.x + rWorld, c.y, c.z, rect);
    if (sx) r = Math.hypot(sx.x - s0.x, sx.y - s0.y);
    const sz = projectPx(c.x, c.y, c.z + rWorld, rect);
    if (sz) r = Math.max(r, Math.hypot(sz.x - s0.x, sz.y - s0.y));
    return r;
  }

  /** Screen point → table-plane (y = ball radius) intersection, or null. */
  function tablePoint(x, y, rect) {
    plane.constant = -ballR();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1);
    rayc.setFromCamera(ndc, camera);
    return rayc.ray.intersectPlane(plane, hitV) ? hitV : null;
  }

  // ---- S3 ghost ring (data-model.md §2.3; DOM owned by this module) ---------
  let ghostEl = null;
  const ghost = { x: 0, y: 0, valid: false };
  let ghostShown = false;
  function showGhost() {
    if (!ghostEl) {
      ghostEl = document.createElement('div');
      ghostEl.id = 'ob-touch-ghost';
      ghostEl.setAttribute('aria-hidden', 'true');
      // kit tokens only (CI grep-gates hardcoded colors); geometry inline —
      // the ghost is classifier-owned, not a lane-H layout surface
      Object.assign(ghostEl.style, {
        position: 'fixed', left: '0', top: '0', width: '44px', height: '44px',
        border: '2px solid var(--ob-accent)', borderRadius: '50%',
        boxSizing: 'border-box', transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', zIndex: '30', display: 'none',
      });
      document.body.append(ghostEl);
    }
    ghostShown = true;
    ghostEl.style.display = 'block';
  }
  function hideGhost() {
    ghostShown = false;
    if (ghostEl) ghostEl.style.display = 'none';
  }

  /** Ghost ring at the CURRENT VALID position (= the grabbed ball: every
   * valid move was applied immediately, a rejected one left it untouched).
   * Issue #68: the ring paints on WHICHEVER ball the S3 gesture grabbed —
   * the cue in the classic BALL_IN_HAND row, any ball in playground.
   * Issue GH-150 (owner build5: the ring sat off the ball): project the
   * RENDERED center, not the input-time mesh. Every successful placement
   * re-seats mesh y at cloth level and the GH-143 drag-lift frame hook
   * re-raises it to rest + 0.75R AFTER input, before render — so a
   * projection taken inside the pointermove sat a lifted-ball-height
   * below the ball the player sees. While the grabbed ball's lift is in
   * its 'up' phase the projection uses the lift seam's render height
   * (rest + dragLift.height, feature-detected: a stale aim.js without
   * the additive `height` member degrades to the old cloth-level
   * projection); the per-frame repaint hook below keeps the ring honest
   * through the settle ease-out, camera moves and a stationary finger. */
  function paintGhost(rect) {
    const ball = place?.ball !== undefined
      ? game.ballSet?.balls?.find((x) => x.id === place.ball)
      : game.cueBall?.();
    const b = ball?.mesh?.position;
    if (!b || !ghostEl) return;
    const dl = window.__aim?.dragLift;
    const st = dl?.state?.();
    const rest = ball.r ?? ballR();
    const y = (st && st.id === (place?.ball ?? game.cueBall?.()?.id ?? 0)
      && st.phase === 'up'
      && typeof dl.height === 'number')
      ? Math.max(b.y, rest + dl.height) : b.y;
    const s = projectPx(b.x, y, b.z, rect);
    if (!s) return;
    ghost.x = s.x;
    ghost.y = s.y;
    const r = Math.max(12, radiusPx({ x: b.x, y, z: b.z }, ballR() * 1.4, rect));
    ghostEl.style.width = ghostEl.style.height = `${2 * r}px`;
    ghostEl.style.left = `${s.x}px`;
    ghostEl.style.top = `${s.y}px`;
    ghostEl.style.borderColor = ghost.valid
      ? 'var(--ob-accent)' : 'var(--ob-danger)';
  }

  /** Row 13: place at the GHOST_OFFSET_PX up-screen point via the LATE-BOUND
   * game.placeCue (property lookup at call time — flow.js wraps route
   * kitchen/D/carom rights). false keeps the last valid spot + danger tint.
   * Issue #68: a playground grab (place.ball latched) routes through the
   * flow-lane window.__playground.placeBall seam instead — bed clamp +
   * overlap nudge for EVERY ball, same validity tint. */
  function placeAt(x, y, rect) {
    const p = tablePoint(x, y - GHOST_OFFSET_PX, rect);
    if (!p) return;
    const k = threePosToK(p);
    ghost.valid = (place?.ball !== undefined
      ? window.__playground?.placeBall?.(place.ball, k.x, k.y)
      : game.placeCue(k.x, k.y)) === true;
    paintGhost(rect);
  }

  // ---- S1 helpers -----------------------------------------------------------
  /** Row 3 guard: press began inside max(3R world projected, 22 pt screen)
   * of the cue ball. */
  function inGrabZone(x, y, rect) {
    const b = game.cueBall?.()?.mesh?.position;
    if (!b) return false;
    const s = projectPx(b.x, b.y, b.z, rect);
    if (!s) return false;
    const zone = Math.max(radiusPx(b, 3 * ballR(), rect), BIH_GRAB_MIN_PT);
    return Math.hypot(x - s.x, y - s.y) <= zone;
  }

  /** Issue #68 playground: NEAREST active ball whose grab zone (the row-3
   * law per ball: max(3R world projected, 22 pt screen)) contains the
   * press point — the S3 classification generalized to every ball. */
  function grabBallAt(x, y, rect) {
    let best = null;
    for (const b of game.activeBalls?.() ?? []) {
      const pos = b.mesh.position;
      const s = projectPx(pos.x, pos.y, pos.z, rect);
      if (!s) continue;
      const zone = Math.max(radiusPx(pos, 3 * ballR(), rect), BIH_GRAB_MIN_PT);
      const d = Math.hypot(x - s.x, y - s.y);
      if (d <= zone && (!best || d < best.d)) best = { d, id: b.id };
    }
    return best ? best.id : null;
  }

  /** Rows 6–8 + the quick-aim row (issue #46, touch-input.md §8.1): tap-up
   * resolution through the existing __aim seams. Enlarged zones:
   * max(radius·1.05 world projected, POCKET_TAP_MIN_PT screen). The
   * nomination surfaces get FIRST claim on the tap; a POCKET-consumed tap
   * never also quick-aims, and a TARGET-BALL-consumed tap additionally
   * coarse-aims at the tapped ball per the §8.2 amendment (issue #84 —
   * unless the aim ray's first ball already is it); an unconsumed tap on
   * an OBJECT ball routes to the additive __aim.aimAtBall seam; a tap
   * that resolves nothing stays the row-8 strict no-op. */
  function resolveTap(x, y) {
    const A = window.__aim;
    const rect = dom.getBoundingClientRect();
    const marks = A?.nominationRequired?.() ? (A.pocketMarks?.() ?? []) : [];
    if (marks.length && marks[0].visible) { // call surfaces live
      // row 6: enlarged pocket discs (kernel table truth — the same
      // Table.pockets index the __aim marks carry). Snooker colour
      // nomination calls no pocket (its discs are hidden per-mesh): the
      // __aim.callMode seam skips the pocket zones there (T033 — closes the
      // T014 NOTE; an older aim.js without the seam degrades to the old
      // pocket-tap path, verified harmless: the composed nominate call
      // never reads call8.pocket).
      const table = game.template?.system?.table;
      let pocket = null;
      if (A.callMode?.() !== 'nominate' && Array.isArray(table?.pockets)) {
        table.pockets.forEach((p, i) => {
          // kernel → three basis (coords.js): (kx, ky) → (ky, h, kx); the
          // 0.049 disc height matches the aim.js marks the player sees
          const c = { x: p.center.y, y: 0.049, z: p.center.x };
          const s = projectPx(c.x, c.y, c.z, rect);
          if (!s) return;
          const zone = Math.max(radiusPx(c, p.radius * 1.05, rect), POCKET_TAP_MIN_PT);
          const d = Math.hypot(x - s.x, y - s.y);
          if (d <= zone && (!pocket || d < pocket.d)) pocket = { d, i };
        });
      }
      if (pocket) {
        A.nominatePocket?.(pocket.i);
        return;
      }
      // row 7: legal call-target balls, same enlarged-zone law
      const targets = A.legalTargets?.() ?? [];
      const rBall = ballR() * 1.05;
      let ball = null;
      for (const b of game.activeBalls?.() ?? []) {
        if (!targets.includes(b.id)) continue;
        const pos = b.mesh.position;
        const s = projectPx(pos.x, pos.y, pos.z, rect);
        if (!s) continue;
        const zone = Math.max(radiusPx(pos, rBall, rect), POCKET_TAP_MIN_PT);
        const d = Math.hypot(x - s.x, y - s.y);
        if (d <= zone && (!ball || d < ball.d)) ball = { d, id: b.id };
      }
      if (ball) {
        A.selectCallBall?.(ball.id);
        // issue #84 (touch-input.md §8.2): the call tap ALSO coarse-aims
        // at the tapped ball — EXCEPT when the current aim ray's
        // first-ball intersection (ghost-ball window, aim.js predicate)
        // already IS this ball, so a fine-tuned cut on it is never
        // overridden by a re-tap (the call refresh above happens either
        // way). SEAM-PRESENCE detection, not return value: a null
        // predicate (the ray hits no ball — e.g. a kick aim) still aims,
        // while a stale aim.js WITHOUT the predicate seam degrades to
        // the old call-only tap (never a wrong un-guarded aim). The
        // camera is NEVER written (§8.1 camera law unchanged).
        if (typeof A.aimLineBall === 'function'
          && A.aimLineBall() !== ball.id) A.aimAtBall?.(ball.id);
        return;
      }
    }
    // quick-aim row (issue #46, §8.1): an unconsumed tap on an OBJECT ball
    // aims the cue at its center. Same enlarged-zone nearest-hit law as
    // row 7; the cue ball is never a target, and in BALL_IN_HAND a tap
    // inside the row-3 grab zone stays inert (placement owns that surface,
    // same gate as the S3 classification). Resolution ROUTES to aim.js
    // (the phi owner) through the additive __aim.aimAtBall seam —
    // feature-detected, so a stale aim.js degrades to the old no-op. The
    // camera is NEVER written (the View pill owns view switching).
    if (machine.is('BALL_IN_HAND') && !replayActive()
      && inGrabZone(x, y, rect)) return;
    // issue GH-152 (retires the #68 sandbox tap inertness): playground taps
    // fall through to the quick-aim row exactly like play mode. Placement
    // still claims every DRAG — the S3 classification only engages past
    // TOUCH_SLOP_PX, so tap-vs-drag is already disambiguated by the FSM —
    // and the cue ball keeps placement-side semantics: it competes in the
    // nearest-hit loop below as the NO-OP claimant (aiming at the cue is
    // meaningless under the #46 first-ball routing; recorded decision:
    // a sandbox cue TAP is a strict no-op, a cue DRAG places).
    const rBall = ballR() * 1.05;
    // cue-ball claim (review finding, amended): the cue COMPETES in the
    // nearest-hit loop below as a NO-OP claimant — when the cue is the
    // nearest hit the tap is a strict no-op (the 22pt screen floor
    // otherwise lets a nearby object ball steal a tap aimed at the cue
    // ball itself), but an object ball whose zone claim is NEARER wins
    // and aims (§8.1 zone law: an absolute cue pre-empt deadened taps on
    // object balls visibly in front of the cue). ONLY in third-person: in
    // aim view the cue dominates center screen and the claim would
    // swallow legitimate quick-aim taps (e2e-aim lesson).
    const cue = window.__aim?.getAimView?.() ? null : game.cueBall?.();
    const cueId = game.cueBall?.()?.id ?? 0; // GH-383: carom two-cue aware
    let hit = null;
    for (const b of game.activeBalls?.() ?? []) {
      if (b.id === cueId && !cue) continue; // aim view: cue never competes
      const pos = b.mesh.position;
      const s = projectPx(pos.x, pos.y, pos.z, rect);
      if (!s) continue;
      const zone = Math.max(radiusPx(pos, rBall, rect), POCKET_TAP_MIN_PT);
      const d = Math.hypot(x - s.x, y - s.y);
      if (d <= zone && (!hit || d < hit.d)) hit = { d, id: b.id };
    }
    if (hit && hit.id !== cueId) { A?.aimAtBall?.(hit.id); return; }
    // row 8: no hit (or the cue's no-op claim) → strict no-op — EXCEPT
    // (GH-462, recorded §8.1 amendment): while a colour nomination is
    // live, a resolved-NOTHING tap re-raises the instructive copy through
    // the additive __aim.callNudge seam (transient hint channel). This is
    // FEEDBACK only — no call state, no camera write; the tap stays a
    // rules no-op. Rationale: near-miss taps past the 22 pt zone were
    // fully silent exactly in the mode whose picker-opener pill is the
    // sanctioned fallback (phone-hud.md item 8). The cue's deliberate
    // no-op claim stays silent (the player tapped the cue, not a target);
    // a stale aim.js without the seam degrades to the old silence.
    if (!hit && A?.callMode?.() === 'nominate'
      && A?.nominationRequired?.() === true) {
      A.callNudge?.();
    }
  }

  // ---- S2 velocity model (§2.4) ---------------------------------------------
  function velSample(s) {
    const dt = s.timeStamp - vT;
    if (dt > 0) {
      const inst = Math.hypot(s.clientX - vX, s.clientY - vY) / dt * 1000;
      vEma += (inst - vEma) * (1 - Math.exp(-dt / V_EMA_MS));
      vT = s.timeStamp;
      vX = s.clientX;
      vY = s.clientY;
    }
  }

  /** Coalesced samples when available, the event itself otherwise (§4.5). */
  function samplesOf(e) {
    const c = e.getCoalescedEvents?.();
    return c && c.length ? c : [e];
  }

  /** One S1/S2/S3 sample step (S1 may reclassify mid-event — remaining
   * samples of the same pointermove then integrate under the new state). */
  function stepSample(id, s, rect) {
    if (state === 'S1') {
      if (id !== press.id) return;
      velSample(s);
      if (Math.hypot(s.clientX - press.x0, s.clientY - press.y0) < TOUCH_SLOP_PX) return;
      // aim/place classification stays state-scoped (issue #69): a
      // camera-only press (born outside AIM/BALL_IN_HAND, or demoted by a
      // state exit) NEVER reclassifies — it stays S1 so a 2nd finger can
      // still upgrade to the S4 camera rows, and its tap-up is a strict
      // no-op. game.setPhi is ungated, so an S2 drag outside the aiming
      // states would silently steer the NEXT shot's azimuth.
      if (!press.aimable || !machine.is('AIM', 'BALL_IN_HAND')) return;
      const x0 = press.x0, y0 = press.y0;
      press = null;
      // issue #68 playground: any active ball's grab zone claims the S3
      // classification (row 3 generalized) — the classic cue-only row
      // stays byte-identical outside the sandbox
      const pgBall = playgroundOn() && machine.is('AIM', 'BALL_IN_HAND')
        ? grabBallAt(x0, y0, rect) : null;
      if (pgBall !== null) {
        place = { id, ball: pgBall };
        window.__playground?.beginDrag?.(pgBall);
        // issue GH-143: lift the grabbed ball for the drag (feature-detected
        // aim.js seam — a stale aim.js degrades to no-lift, shadows still
        // synced by the placement paths; no new import edge, rule 5)
        window.__aim?.dragLift?.begin?.(pgBall);
        state = 'S3';
        showGhost();
        placeAt(s.clientX, s.clientY, rect);
      } else if (machine.is('BALL_IN_HAND') && !replayActive() && inGrabZone(x0, y0, rect)) {
        place = { id };            // row 3 → S3 (ghost placement)
        // issue GH-143: lift the cue too (GH-383: the live cue id)
        window.__aim?.dragLift?.begin?.(game.cueBall?.()?.id ?? 0);
        state = 'S3';
        showGhost();
        placeAt(s.clientX, s.clientY, rect);
      } else {
        aim = { id, lastX: s.clientX }; // row 4 → S2; re-baseline at the
        state = 'S2';                   // crossing point (no slop pop)
      }
      return;
    }
    if (state === 'S2') {
      if (id !== aim.id) return;   // row 11: extra fingers never steer aim
      velSample(s);
      const dx = s.clientX - aim.lastX;
      aim.lastX = s.clientX;
      const m = fineOf(vEma);
      fineFactor = m;
      if (dx !== 0) {
        // row 10: the desktop aim-view gain, camera-feedback-free in
        // BOTH views (aim.js relative branch)
        const g0 = 1.2 * Math.PI / Math.max(1, rect.width);
        game.setPhi(game.phi - dx * g0 * m);
      }
      return;
    }
    if (state === 'S3' && id === place.id) placeAt(s.clientX, s.clientY, rect);
  }

  /** Rows 16–17 + pan (issue #56): two-finger centroid/span → orbit rig;
   * three-finger drag pans the orbit target through orbit.pan() (the rig
   * clamps to the active table + margin). In aim view the FIRST camera move
   * is the GESTURE BREAKOUT: disengage the aim view via the __aim seam
   * (the View pill tracks it), re-baseline at the breakout point, and let
   * the same gesture continue from the CURRENT pose — the rig held the aim
   * pose all along (single-pose law), so there is nothing to jump back to. */
  function moveS4() {
    if (cam.pan) { // issue #56 three-finger pan (data-model §2 row 18)
      const pts = cam.pan.ids.map((id) => active.get(id));
      if (pts.some((p) => !p)) return;
      const ncx = (pts[0].x + pts[1].x + pts[2].x) / 3;
      const ncy = (pts[0].y + pts[1].y + pts[2].y) / 3;
      if (window.__aim?.getAimView?.() === true) {
        // breakout composes with pan: disengage first, re-baseline
        window.__aim.setAimView?.(false);
        cam.pan.cx = ncx;
        cam.pan.cy = ncy;
        return;
      }
      orbit.pan(ncx - cam.pan.cx, ncy - cam.pan.cy); // rig clamps the target
      cam.pan.cx = ncx;
      cam.pan.cy = ncy;
      return;
    }
    const a = active.get(cam.a);
    const b = active.get(cam.b);
    if (!a || !b) return;
    const ncx = (a.x + b.x) / 2;
    const ncy = (a.y + b.y) / 2;
    const span = Math.max(1e-3, Math.hypot(a.x - b.x, a.y - b.y));
    if (window.__aim?.getAimView?.() === true) {
      // row 17 GESTURE BREAKOUT (issue #56): the first two-finger move
      // disengages the aim view IN PLACE and re-baselines centroid/span/
      // radius at the breakout instant; the next moves run the normal
      // orbit/pinch rows below from the current pose — zero jump.
      window.__aim.setAimView?.(false);
      cam.cx = ncx;
      cam.cy = ncy;
      cam.span0 = span;
      cam.radius0 = orbit.state.radius;
      return;
    }
    const dcx = ncx - cam.cx;
    const dcy = ncy - cam.cy;
    cam.cx = ncx;
    cam.cy = ncy;
    orbit.state.theta -= dcx * ORBIT_GAIN;
    orbit.state.phi -= dcy * ORBIT_GAIN;
    orbit.state.radius = cam.radius0 * (cam.span0 / span);
    orbit.apply(); // rig phi/radius clamps carry over (issue #56; the pan
    // bounds clamp lives in orbit.pan() — this path never writes target)
  }

  /** Row 23 hard reset: release captures, drop every tracked pointer, hide
   * the ghost, back to S0. NEVER fires a shot (fire is exclusively the
   * explicit fire control; this module holds no fire path). aim.js's
   * strokePull is untouched by touch input — power lives in the plane-B
   * widgets — so its `strokePull = 0` clause holds by construction. */
  function hardReset() {
    for (const id of active.keys()) {
      try { dom.releasePointerCapture?.(id); } catch { /* not captured */ }
    }
    active.clear();
    if (place?.ball !== undefined) window.__playground?.endDrag?.(); // F3
    if (place) window.__aim?.dragLift?.end?.(); // issue GH-143: settle the lift
    press = aim = place = cam = null;
    hideGhost();
    state = 'S0';
  }

  // ---- install side effects (touch-input.md §2) ----------------------------
  document.documentElement.classList.add('ob-touch');

  // phone CSS: link injection — ui/touch.css is loaded ONLY here, never from
  // app.html (phone-hud.md §1). data-optional: a missing/stale stylesheet
  // degrades to unstyled, and app.html's boot guard ignores it.
  // ?v= cache-bust (stale-CSS poisoning class, 2026-07-13 owner bug on the
  // settings modal skin): the version rides in the module that BUILDS the
  // touch DOM, so skin and DOM never drift. Bump on every touch.css change.
  if (!document.querySelector('link[data-ob-touch-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // v031: §3.12 record-dock seams deleted and its two unconditionally-live
    //       caps (chip strips, #banner) re-homed as plain §3.11 rules
    //       (GH-225 Phase D)
    // v032: §3.2 keeps the #ob-record hide selector as an annotated
    //       STALE-GRAPH GUARD (record.js is an unversioned static import, so
    //       an old record.js can pair with this sheet and paint a 5th pill
    //       into the 4-pill corner slot); §3.11/§3.12 comments corrected —
    //       the re-homed caps still apply, and the #banner cap's new
    //       specificity deliberately yields the drill-complete landscape
    //       composition to drills.css (measured, GH-225 Phase D review)
    // v033: GH-245 (deferred item A3) — the FIRE pill's :focus-visible ring,
    //       restated at the pill's own (1,2,1) specificity: its §3.4
    //       box-shadow el-2 silently outranked the kit's (0,2,0) ring
    // v034: GH-316 — the §3.11 call-pill retreat tracks the measured
    //       --ob-corner-r-live token (dead-slot reclaim) and the strip's
    //       chip crop moves from glyph-blind pixels to WHOLE chips via the
    //       .ob-band-tight / .ob-band-drop squeeze-ladder rules (the
    //       owner's clipped "P2 · 45" defect class)
    // v036: GH-449 — the §3.11 squeeze ladder's stage-3 rules-chip
    //       compaction (.ob-band-mini label swap): standing referee calls
    //       compact instead of dropping first
    // v037: GH-447 — #hud-decision re-anchors from the 22%-top park (it
    //       covered the racked balls) to a COMPACT band-x row (buttons
    //       only; title/chooser collapse — the status strip + badge carry
    //       the context) clear of BOTH the rack band and the opening
    //       cue-ball address (review r3/r4). The bump keeps the fresh
    //       sheet's anchor pair atomic for returning clients (review r1
    //       P1: a cached top-22% sheet beside the fresh hud.js bottom
    //       anchor would otherwise stretch the panel)
    // v039: GH-699 review r1 P2 — the 44 pt pointer-law block (decision
    //       answers / kit confirm / export card / toolbar pills / HUD select
    //       on every coarse register) shipped WITHOUT a bump: a returning
    //       client kept its cached 038 sheet and never received the rules.
    //       The sheet now declares its PIN in its header and e2e-touch's
    //       static pin check fails any drift between the two (+ sw.js).
    // v040: GH-668 B-K16 (S5 kit) — the gear's coarse 44 circle moved to
    //       the kit toolbar part and the 64px thumb literals became
    //       --ob-h-thumb; the kit branch and main both pinned 039 against
    //       different bytes, so the merge moves the pin past both
    link.href = new URL('./ui/touch.css?v=041', import.meta.url).href;
    link.setAttribute('data-ob-touch-css', '1');
    link.setAttribute('data-optional', '');
    document.head.append(link);
  }

  // rotate prompt node (phone-hud.md §3.1): injected by the touch leaf,
  // shown purely by CSS at (orientation: portrait) and (pointer: coarse) —
  // lane H owns its styling.
  if (!document.getElementById('ob-rotate')) {
    const rotate = document.createElement('div');
    rotate.id = 'ob-rotate';
    document.body.append(rotate);
  }

  // ---- §3.11 band metrics (build-4 QA wave) ---------------------------------
  // Content-aware band tokens the sheet cannot derive on its own, measured
  // at the presentation layer and consumed by ui/touch.css §3.11 (each rule
  // keeps a fallback = the pre-QA fixed geometry, so a stale JS/CSS pairing
  // degrades to the old lanes, never breaks):
  //   --ob-band-s-strip-h   the mode strip's REAL border-box height. The
  //                         GH-140 5-chip playground strip legally wraps to
  //                         a second row at 667-class widths in de/ja under
  //                         the §3.12 record-dock cap; the one-row band-S
  //                         reservation let band-X transients paint through
  //                         row 2.
  //   --ob-band-x-banner-h  the visible banner's REAL border-box height.
  //                         The #81 lane split assumed the ≤72px one-line
  //                         forced copy; real cited de/ja foul judgments
  //                         wrap to 3 lines (~120px) and crossed the
  //                         warn/hint lanes.
  //   --ob-corner-l-live    (uiaudit F37) the toolbar cluster's REAL width;
  //                         #hud's left edge takes max(--ob-corner-l,
  //                         live + 2 sp-2) so the status strip can never
  //                         start under a toolbar pill.
  //   --ob-corner-r-live    (GH-316) the call pill's REAL border-box WIDTH.
  //                         §3.11's :has() retreat pulls the status strip's
  //                         crop edge to the actual pill instead of the
  //                         --ob-corner-r worst-case cap — the fixed-cap
  //                         retreat parked a dead reserved gap while the
  //                         active snooker score chip was cropped mid-digit
  //                         (the owner's build-15 "P2 · 45" report).
  // ResizeObserver keeps them honest across re-renders, locale switches and
  // register changes; offsetHeight/offsetWidth are transform-independent
  // (motion.js owns el.style.transform during tweens) and read 0 while
  // display:none, which clears the token. The callback only writes <html>
  // style tokens — they move/resize OTHER surfaces' fixed boxes, never an
  // observed element (the pill is fixed right-anchored and content-sized
  // under its cap; the strip's width does not feed back into it), so the
  // observer cannot loop. #ob-mode-chips is built by flow.js (module init,
  // ahead of this dynamic leaf) — the MutationObserver is the belt for a
  // slow-loading pairing.
  // (GH-316) the whole-chip fit pass below registers its scheduler here so
  // the band RO can re-fit after a token write moves #hud's crop edge —
  // rAF-deferred, never a second RO on #hud (see the fit-pass comment).
  let scheduleBandFit = () => {};
  if (typeof ResizeObserver === 'function') {
    const rootStyle = document.documentElement.style;
    const BAND_TOKENS = {
      'ob-mode-chips': { token: '--ob-band-s-strip-h', dim: 'offsetHeight' },
      banner: { token: '--ob-band-x-banner-h', dim: 'offsetHeight' },
      'hud-call': { token: '--ob-corner-r-live', dim: 'offsetWidth' },
      // uiaudit F37: the toolbar cluster's REAL width — band T's left corner
      // follows the pills actually present (the hall pill made it five)
      'ob-toolbar': { token: '--ob-corner-l-live', dim: 'offsetWidth' },
    };
    const bandRo = new ResizeObserver((entries) => {
      for (const en of entries) {
        const spec = BAND_TOKENS[en.target.id];
        if (!spec) continue;
        const v = en.target[spec.dim];
        if (v > 0) rootStyle.setProperty(spec.token, `${v}px`);
        else rootStyle.removeProperty(spec.token);
      }
      scheduleBandFit(); // GH-316: --ob-corner-r-live moved the crop edge
    });
    const seen = new Set();
    const hookBandTargets = () => {
      for (const id of Object.keys(BAND_TOKENS)) {
        const el = document.getElementById(id);
        if (el && !seen.has(el)) { seen.add(el); bandRo.observe(el); }
      }
      return seen.size === Object.keys(BAND_TOKENS).length;
    };
    if (!hookBandTargets()) {
      const mo = new MutationObserver(() => {
        if (hookBandTargets()) mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ---- GH-316: band-T whole-chip crop (no partial clip) ---------------------
  // The §3.11 status strip is overflow:hidden with a single-ended crop
  // (justify-content: safe center) — a crop line that was GLYPH-BLIND: on
  // the owner's build-15 phone it sliced the ACTIVE snooker score chip
  // mid-digit ("P2 · 45") while the reserved-but-unused call-pill slot sat
  // empty to its right. The no-truncation law extends to HUD chips: a badge
  // either paints WHOLE or not at all. This pass enforces it with the
  // squeeze ladder documented at the touch.css §3.11 chip rules:
  //   1. .ob-band-tight on #hud — spacing compression first (gaps
  //      sp-3→sp-1 / sp-1→2px, state-pill floor 16ch→8ch);
  //   2. .ob-band-drop per badge — whole-chip drops in the deliberate
  //      casualty order: the mode badge first (collapse rule 1, chrome-diet
  //      SPEC §3), then WARN badges right-to-left (owed/foul/penalty — that
  //      truth also rides the band-X foul banner), then plain badges
  //      right-to-left, so both players' SCORE chips are the last standing.
  // Loop safety: a geometry+content signature latch makes converged passes
  // mutation-free (the observers see our own class flips, re-enter, hit the
  // latch and stop); the signature treats our own drops as present so it is
  // stable across the pass's mutations. hud.js re-renders chips as FRESH
  // nodes (replaceChildren), so content changes self-clear stale drops.
  // Measurement is TRANSFORM-NEUTRAL: motion.js pulses the chip hosts
  // (inline scale 1→1.04→1) exactly when hud.js re-renders, and
  // getBoundingClientRect includes transforms — a mid-pulse decision read
  // every rect ~4% wide and over-dropped chips (found in GH-316 bring-up),
  // so the pass stashes/neutralizes inline transforms around its reads
  // (the offsetHeight doctrine of the band tokens above, applied to boxes
  // that need sub-pixel fidelity).
  // Triggers: #hud subtree mutations + the register media query + window
  // resize + the band ResizeObserver above (the --ob-corner-r-live write
  // moves #hud's crop edge; observing #hud with a second RO instead made
  // that synchronous token write trip 'ResizeObserver loop completed with
  // undelivered notifications' into the zero-error e2e gates).
  // Stale-CSS pairing: the ladder classes match no rule and the sanctioned
  // pre-316 pixel crop remains the degrade.
  {
    const hudEl = document.getElementById('hud');
    const phoneMq = window.matchMedia(
      '(pointer: coarse) and (max-width: 1023.98px)');
    if (hudEl && typeof MutationObserver === 'function') {
      let fitSig = null;
      let fitQueued = false;
      /** Run `fn` with every inline transform under #hud neutralized
       * (in-flight motion.js pulses restored — and re-driven by the tween engine's
       * next tick — right after). */
      const transformNeutral = (fn) => {
        const touched = [];
        for (const el of hudEl.querySelectorAll('*')) {
          const s = el.style;
          if (s.transform || s.scale || s.translate || s.rotate) {
            touched.push([el, s.cssText]);
            s.transform = 'none';
            s.scale = s.translate = s.rotate = 'none';
          }
        }
        try { return fn(); } finally {
          for (const [el, css] of touched) el.style.cssText = css;
        }
      };
      /** #hud flex members in PAINT order (CSS order, then DOM — the flex
       * paint rule), flattened to their .ob-badge chips. Fixed surfaces
       * (#shoot, the #hud-call pill, the band-S #ob-mode-chips strip)
       * never join — the belt also walks ancestors so a badge inside a
       * fixed descendant can never be judged against the strip's box.
       * `all` includes badges we dropped ourselves (signature stability
       * across the pass's own mutations); painted-only consumers filter
       * by getClientRects(). */
      const bandBadges = (all) => {
        const kids = [...hudEl.children];
        const members = kids.filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.display === 'contents') return false;
          return cs.display !== 'none'
            || (all && el.classList.contains('ob-band-drop'));
        }).sort((a, b) => ((Number(getComputedStyle(a).order) || 0) * 10000
          + kids.indexOf(a))
          - ((Number(getComputedStyle(b).order) || 0) * 10000
            + kids.indexOf(b)));
        const badges = [];
        for (const m of members) {
          if (m.classList.contains('ob-badge')) badges.push(m);
          else badges.push(...m.querySelectorAll('.ob-badge'));
        }
        return badges.filter((el) => {
          for (let n = el; n && n !== hudEl; n = n.parentElement) {
            if (getComputedStyle(n).position === 'fixed') return false;
          }
          return true;
        });
      };
      /** True while any PAINTED badge crosses the strip's crop edges. The
       * elastic #state pill is deliberately excluded — its sanctioned
       * ellipsis (and, below every floor, the old strip-box crop) is the
       * terminal fallback, not a chip clip. */
      const bandClipped = () => {
        const h = hudEl.getBoundingClientRect();
        return bandBadges(false).some((el) => {
          if (!el.getClientRects().length) return false;
          const r = el.getBoundingClientRect();
          return r.right > h.right + 0.5 || r.left < h.left - 0.5;
        });
      };
      const fitPass = () => {
        fitQueued = false;
        const on = phoneMq.matches
          && document.documentElement.classList.contains('ob-touch');
        // input signature: register + slot width + member content AND
        // per-badge layout width (review r1 P2: a late guarded import —
        // icons.js dressing #ob-mode-ind with an SVG — grows a badge
        // without touching any text, and a text-only signature waved the
        // re-fit off while the grown badge crossed the crop edge).
        // offsetWidth, not gBCR: transform-independent (stable across
        // motion.js pulses) and 0 for our own drops, so converged passes
        // still exit here without touching the DOM.
        const sig = (on ? 'p' : 'd') + '|'
          + hudEl.getBoundingClientRect().width.toFixed(1) + '|'
          + (document.getElementById('state')?.textContent ?? '') + '|'
          + bandBadges(true).map((el) =>
            (el.id || '') + ':' + el.offsetWidth + ':' + el.textContent)
            .join('¦');
        if (sig === fitSig) return;
        fitSig = sig;
        transformNeutral(() => {
          // reset to the untouched register, then re-derive from scratch
          hudEl.classList.remove('ob-band-tight');
          for (const el of hudEl.querySelectorAll(
            '.ob-band-drop, .ob-band-mini')) {
            el.classList.remove('ob-band-drop', 'ob-band-mini');
          }
          if (!on || !bandClipped()) return;
          hudEl.classList.add('ob-band-tight'); // ladder 1: compress
          if (!bandClipped()) return;
          // ladder 2: whole-chip drops in casualty order — mode badge, then
          // warn badges right-to-left, then plain badges right-to-left, and
          // the ACTIVE-register accent chips (the shooter's score chip —
          // exactly what GH-316's owner report was about) dead last: the de
          // one-pocket register proved a slot that cannot hold BOTH ~240px
          // pocket/tally chips, and plain right-to-left dropped the
          // shooter's chip while the idle player's survived — inverted
          // truth priority (the idle tally is stable context; the active
          // chip is live truth, and its aim-line twin also rides #state).
          const row = bandBadges(false)
            .filter((el) => el.getClientRects().length);
          // review r1 P1: 'accent' alone is NOT score truth — the drill
          // strip's name chip (drills.js, inside #ob-drill-chips) wears
          // ob-badge--accent too, and a flat accent category let the
          // shooter's score chip drop while drill CHROME survived (the
          // strip is order:-1, so right-to-left inside one category kills
          // the score first). Score accents live under the hud.js chip
          // hosts (.hm-chips/.hc-chips) — only those die dead last.
          // GH-449: RULES-STATE chips (ob-badge--rule — standing referee
          // calls: touching ball / free ball / miss warning) outrank every
          // decorative chip. The old flat warn category dropped the
          // touching-ball chip FIRST (rightmost warn) while BREAK 0 /
          // ON: RED survived — a silent push-stroke trap: unlike the
          // owed/foul/penalty warns, a standing call's truth rides NO
          // band-X banner (the hint is transient and any pointerdown
          // kills it). Ladder for them: compact (.ob-band-mini, stage 3)
          // before scores drop; whole-chip drop only past even that
          // (absurd slots — the same terminal the state pill's crop
          // covers).
          const casualty = (el) => (el.id === 'ob-mode-ind' ? 0
            : el.classList.contains('ob-badge--rule') ? 5
              : el.classList.contains('ob-badge--warn') ? 1
                : !el.classList.contains('ob-badge--accent') ? 2
                  : el.closest('.hm-chips, .hc-chips') ? 4 : 3);
          const order = row.map((el, i) => [el, casualty(el) * 1000 - i])
            .sort((a, b) => a[1] - b[1]).map(([el]) => el);
          for (const el of order.filter((el) => casualty(el) < 4)) {
            el.classList.add('ob-band-drop');
            if (!bandClipped()) return;
          }
          // GH-449 ladder stage 3: compact the rules chips right-to-left
          // (the .ob-band-mini label swap — touch.css §3.11) BEFORE any
          // truth chip drops. Chips without a compact form skip the rung
          // (nothing to swap); stale touch.css matches no rule and the
          // fit check simply fails through to the drops below.
          for (const el of order.filter((el) => casualty(el) === 5
            && el.querySelector('.bd-mini'))) {
            el.classList.add('ob-band-mini');
            if (!bandClipped()) return;
          }
          // score accents, then — absurd slots only — the compacted
          // rules chips themselves.
          for (const el of order.filter((el) => casualty(el) >= 4)) {
            el.classList.add('ob-band-drop');
            if (!bandClipped()) return;
          }
        });
      };
      scheduleBandFit = () => {
        if (fitQueued) return;
        fitQueued = true;
        requestAnimationFrame(fitPass);
      };
      // review r6 P2: the #hud MUTATION path fits SYNCHRONOUSLY — MO
      // delivery is a microtask, so a fit completed here lands before the
      // next paint, and a score that grew inside aim.js's own rAF can
      // never FLASH one un-fitted (clipped) frame the way an rAF-deferred
      // fit allowed. Re-entry is bounded, not recursive: our own class
      // flips queue a fresh microtask that hits the sig latch (one extra
      // derive at most while the drop-widths settle to 0). Every OTHER
      // trigger stays rAF-deferred via scheduleBandFit — bandRo MUST NOT
      // mutate synchronously (RO delivery-loop law), and resize/media/
      // font/sheet arrivals repaint anyway. A pending deferred pass after
      // a sync fit is a latch-guarded no-op.
      new MutationObserver(() => fitPass()).observe(hudEl, {
        subtree: true, childList: true,
        attributes: true, attributeFilter: ['class', 'style'],
      });
      phoneMq.addEventListener?.('change', scheduleBandFit);
      window.addEventListener('resize', scheduleBandFit);
      // review r2/r4: LATE STYLESHEETS — on an uncached coarse boot this
      // module's own ?v= touch.css link (and any other HUD-affecting leaf sheet:
      // drills.css re-lays #ob-drill-chips, modes.css the indicator) can
      // finish loading after the initial rAF below. CSS arrival mutates
      // nothing under #hud and resizes no observed band target, so no
      // observer re-arms the pass and badges could sit clipped in the
      // freshly acquired geometry until the next HUD update. One capture-
      // phase listener covers EVERY link (load doesn't bubble; capture
      // reaches the document); the geometry-aware sig latch (hud width +
      // per-badge offsetWidth) makes no-op wakes mutation-free.
      // NOTE a schedule-only ResizeObserver on the strip members is NOT a
      // legal alternative here: #state's box is width-coupled to #hud, and
      // bandRo's synchronous corner-r-live write resizes #hud mid-delivery
      // — observing any coupled member replays the round-1 'ResizeObserver
      // loop completed with undelivered notifications' storm into the
      // zero-error gates (measured: battery-5 ui-audit, 27 hits).
      document.addEventListener('load', (e) => {
        if (e.target?.tagName === 'LINK') scheduleBandFit();
      }, true);
      // review r4 P2: the replay bar leaving <body> restores the
      // body:has(> #ob-replay)-hidden score members with no #hud mutation,
      // media flip or resize — a body-level childList observer (schedule-
      // only, never part of any RO delivery loop) re-arms the pass for
      // both the bar's arrival and its animated Exit/Continue departure.
      new MutationObserver(scheduleBandFit)
        .observe(document.body, { childList: true });
      // review r3 P2: same gap, FONT edition — the display faces land with
      // font-display:swap on cold/slow boots (and locale switches can pull
      // new subsets), re-metricizing every badge with no subtree mutation,
      // media flip or resize. loadingdone re-fits after each font batch;
      // ready covers the initial swarm. Loop-safe: a no-op batch hits the
      // geometry-aware sig latch and never mutates.
      document.fonts?.addEventListener?.('loadingdone', scheduleBandFit);
      document.fonts?.ready?.then?.(scheduleBandFit, () => {});
      scheduleBandFit();
    }
  }

  // phone control surfaces: feature-detected dynamic import with graceful
  // absence (same cache-poison pattern as this module's own load).
  import('./touchwidgets.js')
    .then((m) => m.installTouchWidgets?.({ dom, game, machine, hud, orbit, camera }))
    .catch(() => { /* widgets absent/stale — classifier still functional */ });

  // ---- classifier listeners (plane A, data-model.md §1): all touch
  // pointers on the canvas belong to this FSM. Mouse/pen pointers are never
  // touched — aim.js/orbit.js own them (aim.js's §5.2 guards yield touch).
  function track(e) {
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { dom.setPointerCapture?.(e.pointerId); } catch { /* already up */ }
  }

  const onDown = guarded((e) => {
    if (e.pointerType !== 'touch') return;
    if (state === 'S0') {
      // rows 1–2 (amended, issue #69): a press ARMS in EVERY machine state
      // and NOTHING mutates on down (neutral-tap law). Aim/place/tap rights
      // latch HERE — only a press born in AIM/BALL_IN_HAND may classify to
      // S2/S3 or resolve a tap, and a machine-state exit demotes it (the
      // scoped stateChange hook below); outside the aiming states the press
      // is CAMERA-ONLY: single-finger stays inert, a 2nd/3rd finger reaches
      // the S4 camera rows (orbit/pinch/pan live during PLAYBACK/replay)
      track(e);
      press = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY,
        aimable: machine.is('AIM', 'BALL_IN_HAND'),
      };
      vEma = 0;
      vT = e.timeStamp;
      vX = e.clientX;
      vY = e.clientY;
      state = 'S1';
      return;
    }
    if (state === 'S1') {
      // row 5: second finger voids tap candidacy → S4 (inert in aim view);
      // baseline centroid + span + radius0
      track(e);
      const a = active.get(press.id);
      const b = active.get(e.pointerId);
      cam = {
        a: press.id,
        b: e.pointerId,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        span0: Math.max(1e-3, Math.hypot(a.x - b.x, a.y - b.y)),
        radius0: orbit.state.radius,
      };
      press = null;
      state = 'S4';
      return;
    }
    if (state === 'S4' && !cam.pan && active.size === 2) {
      // issue #56 (row 18 amended): a 3rd finger upgrades the camera row to
      // PAN — the three-finger centroid drives orbit.pan() (target clamped
      // to the active table + margin by the rig). Baseline at the landing.
      track(e);
      const ids = [cam.a, cam.b, e.pointerId];
      const pts = ids.map((id) => active.get(id));
      cam.pan = {
        ids,
        cx: (pts[0].x + pts[1].x + pts[2].x) / 3,
        cy: (pts[0].y + pts[1].y + pts[2].y) / 3,
      };
      return;
    }
    // rows 11/14/21 (+ 4th finger onward in S4): terminal states + the drain
    // ignore extra fingers — they only join the tracked set (all must lift
    // before S0)
    track(e);
  });

  const onMove = guarded((e) => {
    if (e.pointerType !== 'touch') return;
    const p = active.get(e.pointerId);
    if (!p) return; // untracked (post-reset survivor)
    if (state === 'S1' || state === 'S2' || state === 'S3') {
      const rect = dom.getBoundingClientRect();
      for (const s of samplesOf(e)) stepSample(e.pointerId, s, rect);
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (state === 'S4') moveS4();
    // S5 (row 21): everything ignored until zero touch pointers remain
  });

  const finish = (canceled) => guarded((e) => {
    if (e.pointerType !== 'touch' || !active.has(e.pointerId)) return;
    active.delete(e.pointerId);
    try { dom.releasePointerCapture?.(e.pointerId); } catch { /* released */ }
    const drained = active.size === 0;
    if (state === 'S1') {
      // rows 6–9: tap resolves on UP; pointercancel is a strict no-op —
      // and so is the tap-up of a camera-only press (issue #69 row 2)
      const p = press;
      press = null;
      state = 'S0'; // S1 tracks exactly one pointer by construction
      // Live-state re-check mirrors the S1→S2/S3 classification gate (review
      // 2026-07, defense in depth): a stale-aimable press must never steer
      // the azimuth mid-PLAYBACK even if a broken listener skipped demotion.
      if (!canceled && p?.aimable && machine.is('AIM', 'BALL_IN_HAND')) resolveTap(p.x0, p.y0);
    } else if (state === 'S2') {
      if (e.pointerId === aim.id) { // row 12: end drag (extra fingers drain)
        aim = null;
        state = drained ? 'S0' : 'S5';
      }
    } else if (state === 'S3') {
      if (e.pointerId === place.id) {
        // row 15: commit = last valid position (already continuously
        // applied — cancel-safe by construction); hide ghost. A playground
        // grab that never landed a valid placement disarms flow.js's
        // pendingGrab with the gesture (review F3 — an armed leftover
        // would corrupt a later undo; additive seam, stale flow.js inert)
        if (place.ball !== undefined) window.__playground?.endDrag?.();
        // issue GH-143: release settles the lifted ball back to cloth level
        window.__aim?.dragLift?.end?.();
        place = null;
        hideGhost();
        state = drained ? 'S0' : 'S5';
      }
    } else if (state === 'S4') { // rows 19–20: camera writes stop at once
      cam = null;
      state = drained ? 'S0' : 'S5';
    } else if (state === 'S5' && drained) { // row 22
      state = 'S0';
    }
  });
  const onUp = finish(false);
  const onCancel = finish(true); // capture hygiene (§4 law 4)

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onCancel);
  dom.addEventListener('lostpointercapture', onCancel);

  // row 23: gesture interruption sources hard-reset to S0 — the shot never
  // fires implicitly (fire is exclusively the explicit fire control).
  document.addEventListener('visibilitychange',
    guarded(() => { if (document.visibilityState === 'hidden') hardReset(); }));
  window.addEventListener('pagehide', guarded(hardReset));
  window.addEventListener('blur', guarded(hardReset));

  // leaving the aiming states mid-gesture (e.g. a shot fired with a finger
  // down) SCOPES the reset (issue #69 — was an unconditional hardReset):
  // S2 aim / S3 place die with their AIM/BALL_IN_HAND surfaces and drain
  // through S5 (captures release on lift, like every drain); an armed S1
  // press is DEMOTED to camera-only; S4/S5 are PRESERVED — a camera
  // gesture straddling AIM→SIMULATING→PLAYBACK keeps orbiting (camera
  // writes are rig-only, never kernel state — constitution P-II). Row 23
  // (visibilitychange/pagehide/blur) above stays the absolute hardReset.
  // (§4 law 6 amended; ADDITIVE machine registration only)
  machine.on('stateChange', guarded((next) => {
    if (next === 'AIM' || next === 'BALL_IN_HAND') return;
    if (press) press.aimable = false;
    if (state === 'S2' || state === 'S3') {
      if (place?.ball !== undefined) window.__playground?.endDrag?.(); // F3
      if (place) window.__aim?.dragLift?.end?.(); // issue GH-143 (the lift's
      // own frame hook also self-retires on the state exit — belt+braces)
      aim = place = null;
      hideGhost();
      state = active.size ? 'S5' : 'S0';
    }
  }));

  // issue GH-150: per-frame ghost repaint while an S3 gesture is live —
  // the ring must enclose the RENDERED ball with a stationary finger too
  // (the GH-143 lift raises the mesh with no pointermove to repaint on)
  // and through the settle ease-out / camera moves. Registered at install
  // time, AFTER aim.js's module-init lift hook (state.js runs frame hooks
  // in registration order), so the mesh y read here is this frame's
  // rendered height. Inert when no ghost is up (one boolean, the #88
  // per-frame allocation norm); ADDITIVE machine registration (rule 2).
  machine.on('frame', guarded(() => {
    if (ghostShown && state === 'S3') paintGhost(dom.getBoundingClientRect());
  }));

  // ---- page-zoom lockdown + recovery watchdog (issue GH-145) ------------------
  // The ZOOM channel specifically (#60 owns selection; the touch-action
  // matrix owns pan/double-tap): an accidental pinch/double-tap that engages
  // BROWSER page zoom leaves the game a cropped view with no way back — the
  // classifier owns every subsequent gesture, so the user cannot un-zoom
  // by pinching back in.
  // Three web-layer guards, all scoped to this coarse-pointer-only leaf
  // (fine-pointer boots never load this module — that IS the desktop gate;
  // e2e-touch --desktop-inert pins it):
  //
  // (a) Safari GestureEvent guard. gesturestart/gesturechange/gestureend
  //     are Safari-proprietary ZOOM-channel events (Chrome never fires
  //     them); Safari ignores `user-scalable=no` (accessibility, iOS 10+)
  //     and ignores touch-action for window-crossing pinches — a pinch
  //     STARTING on chrome escapes the canvas's touch-action:none scope —
  //     so preventDefault here is the only path that closes Safari-class
  //     pinch zoom on the LAN/browser serve. This is the ONE sanctioned
  //     preventDefault exception to the §4 "no global preventDefault" law
  //     (ui/touch.css defense-matrix header): it cancels exclusively the
  //     proprietary zoom GestureEvents, which no game surface consumes and
  //     the declarative touch-action matrix cannot reach. Desktop trackpad
  //     pinch (DevTools zoom etc.) is unaffected — this module never loads
  //     on fine-pointer boots.
  const killZoomGesture = guarded((e) => { e.preventDefault(); });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(type, killZoomGesture, { passive: false });
  }

  // (b + c) visualViewport watchdog (feature-detected): when page zoom
  //     nonetheless engages (scale > ZOOM_EPS, debounced — iOS reports
  //     transient scale wobble during rotation/safe-area changes),
  //     - post {v: 1, scale} on the obViewport bridge, capability-detected
  //       PER CALL (haptics.js:62 precedent; fire-and-forget; a throwing
  //       bridge disables for the session; zero behavior off-shell) — in
  //       the iOS shell the native side forces zoomScale back to 1, so
  //       recovery is AUTOMATIC (GH-145);
  //     - show a localized hint banner (hud.setBanner, passive chrome) —
  //       the honest fallback on browser serves, where JS cannot reset
  //       zoom: it tells the user to pinch in (bring two fingers together).
  //     BANNER COORDINATION (review 2026-07, findings 2a–2c): the hint
  //     SHARES the #banner surface with flow.js (foul/win/call banners,
  //     1800/2600 ms banterTimer clears) and drills.js (completion hold) —
  //     no new chrome — under three rules:
  //       1. GAME INFO WINS: the hint is painted only when the surface is
  //          free (empty, or already showing this watchdog's own hint) —
  //          it never overwrites a live game banner (was finding 2a);
  //       2. RE-ASSERT ON A TIMER: while scale > ZOOM_EPS a low-frequency
  //          interval (ZOOM_REASSERT_MS) re-runs the rule-1 paint, so a
  //          flow timer-clear or tap-dismiss can never strand a zoomed
  //          user hintless (the old resize-only re-assert never fired
  //          while the viewport sat static — finding 2c); the game banner
  //          that displaced the hint shows for its full flow-owned window
  //          and the next tick restores the hint;
  //       3. SELECTIVE CLEAR on un-zoom: clear ONLY if #banner still shows
  //          the exact string this watchdog last painted (read back from
  //          the DOM, the same surface drills.js reads) — never a blind
  //          setBanner('') that could wipe a fresh game banner (was
  //          finding 2b). Contract note: the ownership ledger (internal) GH-145 entry.
  const ZOOM_EPS = 1.01;         // rotation/safe-area scale wobble tolerance
  const ZOOM_DEBOUNCE_MS = 250;  // settle window before report/hint
  const ZOOM_REASSERT_MS = 2000; // zoomed-state hint re-assert cadence
  let zoomTimer = 0;
  let zoomHintShown = '';        // exact hint string last painted ('' = none)
  let zoomReassertTimer = 0;     // interval id, live only while scale > EPS
  let zoomBridgeBroken = false;
  let zoomReports = 0;           // scripted diagnostics (__viewport.reports)
  function postZoomReport(scale) {
    if (zoomBridgeBroken) return;
    const bridge = window.webkit?.messageHandlers?.obViewport;
    if (!bridge || typeof bridge.postMessage !== 'function') return;
    try {
      bridge.postMessage({ v: 1, scale });
      zoomReports += 1;
    } catch {
      zoomBridgeBroken = true; // haptics.js law: a throwing bridge is dead
    }
  }
  function bannerText() {
    return document.getElementById('banner')?.textContent ?? '';
  }
  function assertZoomHint() {
    const cur = bannerText();
    if (cur !== '' && cur !== zoomHintShown) return; // rule 1: game info wins
    const hint = t('touch.zoomHint');
    if (cur === hint) return; // already up — no motion.enter re-trigger
    hud?.setBanner?.(hint);   // also repaints ours on a mid-zoom locale switch
    zoomHintShown = hint;
  }
  function onZoomScale(scale) {
    if (typeof scale !== 'number' || !Number.isFinite(scale)) return;
    if (scale > ZOOM_EPS) {
      postZoomReport(scale);
      assertZoomHint();
      if (!zoomReassertTimer) { // rule 2: re-assert while zoomed
        zoomReassertTimer = setInterval(guarded(assertZoomHint), ZOOM_REASSERT_MS);
      }
    } else {
      if (zoomReassertTimer) {
        clearInterval(zoomReassertTimer);
        zoomReassertTimer = 0;
      }
      // rule 3: selective clear — only our own hint, never a game banner
      if (zoomHintShown && bannerText() === zoomHintShown) hud?.setBanner?.('');
      zoomHintShown = '';
    }
  }
  const vv = window.visualViewport;
  if (vv && typeof vv.addEventListener === 'function') {
    vv.addEventListener('resize', guarded(() => {
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(guarded(() => onZoomScale(vv.scale)), ZOOM_DEBOUNCE_MS);
    }));
  }
  // scripted surface (additive, __touch precedent): check(fake) drives the
  // WHOLE watchdog path synchronously (bridge post + banner coordination,
  // including arming/disarming the real re-assert interval) without
  // producing real page zoom — e2e-touch S22 unit-tests the seam with a
  // mock obViewport collector; the L3 shell arm reads scale()/reports.
  // reassertMs lets S22 size its re-assert-window wait off the live value.
  window.__viewport = {
    installed: true,
    scale: () => window.visualViewport?.scale ?? 1,
    reports: () => zoomReports,
    reassertMs: ZOOM_REASSERT_MS,
    check: (fake) => { try { onZoomScale(fake); } catch (err) { contain(err); } },
  };

  /** Ratchet step: EXACTLY the aim.js ArrowLeft/Right arithmetic (SC-005) —
   * same step constant, same setPhi expression shape, same gate. */
  function nudge(sign) {
    if (!machine.is('AIM', 'BALL_IN_HAND')) return;
    const s = (sign < 0 ? -1 : 1) * NUDGE_STEP_DEG * Math.PI / 180;
    game.setPhi(game.phi + s);
  }

  // ---- scripted-test surface (touch-input.md §6, additive only) -------------
  window.__touch = {
    installed: true,
    state: () => state,             // 'S0'…'S5'
    pointers: () => active.size,    // tracked touch-pointer count
    fineFactor: () => fineFactor,   // last m(v) applied (SC-005 e2e)
    nudge: (sign) => { try { nudge(sign); } catch (err) { contain(err); } },
    ghost: () => (ghostShown ? { ...ghost } : null), // PLACE_DRAG ghost state
  };

  return { installed: true };
}
