// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuestrike.js — deterministic scripted cue-stick strike animation for
// offline playback capture (issue #154 render hooks, showcase v2; the
// camerascript.js precedent). Exposed by main.js as `__test.cueStrike` — a
// HARNESS surface only (showcase-render.mjs-style tools drive it through
// CDP): no player-facing UI, and nothing here runs until a spec is armed
// (the 'frame' listener early-returns while disarmed). The aiming-mode cue
// (aim.js, STREAM-A) is a SEPARATE instance whose frame handler pins it
// hidden during PLAYBACK — this module builds its OWN cue via buildCue()
// and never touches aim state.
//
// Determinism doctrine (issue #14, the camerascript purity law): the posed
// cue is a PURE function of the playback clock t and the ARMED spec. Every
// number the pose needs is resolved STATICALLY at cueStrike() set time (the
// camerascript FOV-resolution lesson): the cue-ball anchor position (the
// loaded record's t<=0 rest pose), the geometric elevation floor, the whole
// stroke profile (phase boundaries, contact speed, follow-through duration)
// and the post-impact flex amplitudes — so evaluating any t touches only
// resolved values and the same record + spec steps a byte-identical frame
// sequence under chronological stepping AND random access. No dt, no wall
// clock, no damping state: poseCue is called with dt = 0, which freezes
// cuestick.js's stateful render flex (updateFlex's smoothing never
// integrates at dt 0), and the strike flex we DO want — thrust bow +
// post-impact first-mode ring — is evaluated in CLOSED FORM from t and
// written to the shared flex uniforms every armed frame instead
// (stateless re-assert; the mirrored constants below).
//
// Spec (`cueStrike(spec)`; `cueStrike(null)` disarms and hides the cue):
//   {
//     shot: { phi, theta, a, b },   // the record's shot params: aim azimuth
//                                   // (kernel rad), elevation (rad), tip
//                                   // offsets in units of R (poseCue frame)
//     t_contact,                    // playback time of tip-ball contact [s]
//                                   // (0 for a whole-shot record)
//     approach: { from_s,           // stroke start (< t_contact; the cue
//                                   //   holds the address pose before it)
//                 pullback_m,       // max pull-back distance [m]
//                 ease? },          // pullback ease: 'smooth' (default) |
//                                   //   'linear'
//     follow_through_m,             // forward travel past contact [m] (>= 0)
//     retract: { until_s },         // retract completes (cue hidden) at this
//                                   //   playback time (> follow-through end)
//     visible_window?: [t0, t1],    // cue mesh EXISTS only inside [t0, t1]
//                                   //   (default [from_s, until_s]) — passes
//                                   //   use it to keep the cue out of tight
//                                   //   camera poses; outside it the mesh is
//                                   //   invisible, re-asserted per frame
//                                   //   (the canopy statelessness lesson)
//     practice?: {                  // GH-363 v2 DESIGN PROTOTYPE — practice
//                                   // strokes (feathers) BEFORE the final
//                                   // stroke; occupies
//                                   // [from_s - practiceDur, from_s]:
//       count,                      //   feathers (forward-back cycles), 1..12
//       amp_m,                      //   median tip travel per feather [m]
//       period_s,                   //   median per-feather period [s]
//       hold_s,                     //   front pause at address AFTER the last
//                                   //   feather, before the final backswing
//       taper?,                     //   last/first amp ratio (default 1.0)
//       jitter?,                    //   ± fractional per-feather amp/period
//                                   //   variation (default 0.10)
//       seed?,                      //   uint32 PRNG seed (default 1) — the
//                                   //   jitter stream is DETERMINISTIC in
//                                   //   (seed, count): same spec = byte-
//                                   //   identical frames (kernel replay law)
//     }
//   }
//
// Practice waveform: each feather is one raised-cosine pull cycle
// 0 -> amp_i -> 0 (pull is positive away from the ball, so a feather is a
// partial backswing and return; C1-smooth at both ends, which is also what
// the issue-#5 owner-footage traces show — quasi-sinusoidal cycles, e.g.
// set-D break d4285: 3 feathers, 0.73-0.78 s period, 170-230 mm p2p).
// Shape provenance: raised cosine chosen by fit against those traces (see
// docs/research/practice-stroke-calibration-363.md), not authored.
//
// Stroke model (all boundaries resolved at arm; pull is poseCue's axial
// slide, positive = away from the ball):
//   address    t < from_s                    pull = 0 (tip at the rest gap)
//   pullback   [from_s .. +durPull]          0 -> pullback_m, eased
//   pause      [.. +PAUSE_FRAC*W]            hold at pullback_m (back pause)
//   thrust     [.. t_contact]                constant acceleration from rest:
//                                            pull = P - stroke*u^2, so the
//                                            tip speed peaks AT contact
//                                            (v_c = 2*stroke/durThrust);
//                                            durThrust = min(0.35*W, 0.12 s)
//                                            keeps long windups (break) from
//                                            diluting the strike itself
//   contact    t = t_contact                 tip face ON the ball at the
//                                            commanded offset: pull_c =
//                                            -(TIP_GAP + (1-sqrt(1-a^2-b^2))*R)
//                                            (poseCue rests the tip TIP_GAP
//                                            behind the R standoff; the sqrt
//                                            term closes onto the sphere at
//                                            the offset contact point)
//   follow     [t_contact .. +2F/v_c]        constant deceleration v_c -> 0
//                                            over follow_through_m
//   hold       [.. 25% of what remains]      rest at full extension
//   retract    [.. until_s]                  smooth ease back to pullback_m,
//                                            then hidden for t >= until_s
// Elevation: theta is floored by the geometric rail floor
// (cueMinElevationDeg, resolved at arm — a level break cue would otherwise
// clip through the rail behind the head spot; render-only garnish, the
// kernel never sees it, and ball obstacles are deliberately omitted: the
// harness owns the framing).
//
// Validation discipline (the camerascript validate-before-disarm law):
// every numeric is checked fail-closed (finite, range, window ordering) and
// an invalid spec rejects WHOLE — console diagnostic + return false — with
// any previously armed spec (and the scene) untouched.
//
// Cache-poison contract (the ownership ledger rule 5): loaded via a guarded dynamic
// import from main.js, and reaches cuestick.js through a NAMESPACE import +
// feature detection — a stale cached cuestick.js without the exports makes
// arm() reject (fail-closed diagnostic), never a module-graph error. The
// scalar constants below are LITERAL mirrors of cuestick.js internals on
// purpose (the camerascript DEFAULT_FOV precedent): importing them by name
// would poison a returning user's mixed cache, and drift is cosmetic-only.
import * as THREE from 'three';
import * as coords from './coords.js';
import * as cueMod from '../scene/cuestick.js';

const TIP_GAP = 0.010;    // cuestick.js TIP_GAP (tip rest gap, poseCue)
const BALL_R = 0.028575;  // scene/balls.js R — poseCue's own tip-offset scale
// flex tuning mirrors (cuestick.js header citations: first-mode ring
// ~250 Hz, tau 10 ms, a-few-mm amplitude scaled by speed and offset)
const RING_F = 250, RING_TAU = 0.010, RING_LIFE = 0.06;
const RING_REF_A = 0.004, RING_REF_V = 8, RING_MAX_A = 0.005;
const BOW_PER_MPS = 0.0004, BOW_MAX = 0.003;
// visible-window edge tolerance (seconds) — the cuepost.js twin constant
// (leaf-parity law); float dust only, never a frame (1/60 apart).
const VW_EPS_S = 1e-9;
// stroke phase split of the approach window W = t_contact - from_s
const PAUSE_FRAC = 0.08;    // back-pause share of W
const THRUST_FRAC = 0.35;   // thrust share of W ...
const THRUST_MAX_S = 0.12;  // ... capped: real strokes finish in ~0.1 s even
                            // when the windup (break) is long
const HOLD_FRAC = 0.25;     // full-extension hold share of the retract room
const DEG = Math.PI / 180;

const smooth = (u) => u * u * (3 - 2 * u);

export function createCueStrike({ machine, game, scene }) {
  let armed = null; // resolved spec — null = disarmed
  let cue = null;   // lazily built cuestick instance (first successful arm)

  const need = (cond, msg) => {
    if (!cond) throw new Error(`cueStrike: ${msg}`);
  };
  const needNum = (v, at) => {
    need(Number.isFinite(v), `${at} must be a finite number, got ${v}`);
  };

  // per-cue look (feature 032 S2.5 — GH-525 D5): the replay cue renders
  // the RECORD's pinned equipment cue id (the record is the truth for a
  // replay — never the live equipped cue). Rebuild-on-change: a different
  // record's cue id disposes the previous six-segment build and rebuilds
  // through the same seam. A stale cuestick.js ignores opts.cueId
  // harmlessly (rule 5 — the maple default renders, cosmetic only).
  let cueLookId = null;
  function ensureCue(cueId) {
    const id = typeof cueId === 'string' ? cueId : 'standard';
    if (cue && cueLookId === id) return;
    need(typeof cueMod.buildCue === 'function'
      && typeof cueMod.poseCue === 'function',
    'cuestick.js buildCue/poseCue unavailable (stale module)');
    if (cue) {
      scene.remove(cue.group);
      for (const m of cue.group.children) {
        m.geometry.dispose();
        // cache-owned registry maps are never consumer-disposed
        // (cuelooks.js obCueLookCached — GH-525 round-4 latency law)
        if (m.material.map?.obCueLookCached !== true) {
          m.material.map?.dispose();
        }
        m.material.dispose();
      }
    }
    cue = cueMod.buildCue({ cueId: id });
    cue.group.visible = false;
    // GH-967: the 'obCueStick' name is shared — claim the rod so a name
    // walk for the GAMEPLAY cue (shell.js §7.1 fallback) skips it
    cue.group.userData.obCueRole = 'strike';
    scene.add(cue.group);
    cueLookId = id;
  }

  function zeroFlex() {
    const u = cue?.flex?.u;
    if (!u) return;
    u.uFlexA.value.set(0, 0, 0);
    u.uRailA.value.set(0, 0, 0);
  }

  /** Validate + statically resolve a spec into the frozen pose inputs. */
  function resolve(s) {
    need(s && typeof s === 'object', 'spec must be an object');
    const sh = s.shot;
    need(sh && typeof sh === 'object', 'spec.shot is required');
    for (const k of ['phi', 'theta', 'a', 'b']) needNum(sh[k], `shot.${k}`);
    need(sh.theta >= 0 && sh.theta < Math.PI / 2,
      `shot.theta must be in [0, pi/2), got ${sh.theta}`);
    const off2 = sh.a * sh.a + sh.b * sh.b;
    need(off2 < 1, `shot tip offset |(a,b)| must be < 1, got ${Math.sqrt(off2)}`);
    needNum(s.t_contact, 't_contact');
    const ap = s.approach;
    need(ap && typeof ap === 'object', 'spec.approach is required');
    needNum(ap.from_s, 'approach.from_s');
    need(ap.from_s < s.t_contact, 'approach.from_s must be < t_contact');
    needNum(ap.pullback_m, 'approach.pullback_m');
    need(ap.pullback_m > 0 && ap.pullback_m <= 0.6,
      `approach.pullback_m must be in (0, 0.6], got ${ap.pullback_m}`);
    need(ap.ease === undefined || ap.ease === null || ap.ease === 'smooth'
      || ap.ease === 'linear', `approach.ease must be 'smooth'|'linear'`);
    needNum(s.follow_through_m, 'follow_through_m');
    need(s.follow_through_m >= 0 && s.follow_through_m <= 0.5,
      `follow_through_m must be in [0, 0.5], got ${s.follow_through_m}`);
    need(s.retract && typeof s.retract === 'object', 'spec.retract is required');
    needNum(s.retract.until_s, 'retract.until_s');
    need(s.retract.until_s > s.t_contact,
      'retract.until_s must be > t_contact');
    let vw = s.visible_window;
    if (vw === undefined || vw === null) vw = [ap.from_s, s.retract.until_s];
    need(Array.isArray(vw) && vw.length === 2 && vw.every(Number.isFinite)
      && vw[0] < vw[1],
    'visible_window must be [t0, t1] finite with t0 < t1');
    // ---- practice strokes (GH-363 v2 — cuepost.js literal twin) ----
    let practice = null;
    if (s.practice !== undefined && s.practice !== null) {
      const pr = s.practice;
      need(typeof pr === 'object', 'practice must be an object');
      needNum(pr.count, 'practice.count');
      // count 0 = the v1 STATIC ADDRESS HOLD tier in the same vocabulary
      // (no feathers, hold_s of address before the stroke — twin law)
      need(Number.isInteger(pr.count) && pr.count >= 0 && pr.count <= 12,
        `practice.count must be an integer in [0, 12], got ${pr.count}`);
      if (pr.count >= 1) {
        needNum(pr.amp_m, 'practice.amp_m');
        need(pr.amp_m > 0 && pr.amp_m <= 0.4,
          `practice.amp_m must be in (0, 0.4], got ${pr.amp_m}`);
        need(pr.amp_m <= ap.pullback_m,
          `practice.amp_m ${pr.amp_m} must be <= approach.pullback_m `
          + `${ap.pullback_m} (the practice envelope must stay inside the `
          + `certified backswing clearance — design 363 §2; cuepost twin)`);
        needNum(pr.period_s, 'practice.period_s');
        need(pr.period_s >= 0.2 && pr.period_s <= 3.0,
          `practice.period_s must be in [0.2, 3.0], got ${pr.period_s}`);
      }
      needNum(pr.hold_s, 'practice.hold_s');
      need(pr.hold_s >= 0 && pr.hold_s <= 5.0,
        `practice.hold_s must be in [0, 5.0], got ${pr.hold_s}`);
      const taper = pr.taper === undefined ? 1.0 : pr.taper;
      needNum(taper, 'practice.taper');
      need(taper > 0 && taper <= 2.0, 'practice.taper must be in (0, 2]');
      const jitter = pr.jitter === undefined ? 0.10 : pr.jitter;
      needNum(jitter, 'practice.jitter');
      need(jitter >= 0 && jitter <= 0.35, 'practice.jitter must be in [0, 0.35]');
      const seed = pr.seed === undefined ? 1 : pr.seed;
      need(Number.isInteger(seed) && seed >= 0, 'practice.seed must be a uint');
      // deterministic per-feather jitter: mulberry32 stream from the seed —
      // resolved HERE, at arm time (purity: no PRNG at frame time)
      let st = (seed >>> 0) || 1;
      const rand = () => {
        st = (st + 0x6d2b79f5) >>> 0;
        let z = st;
        z = Math.imul(z ^ (z >>> 15), z | 1);
        z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
        return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
      };
      const feathers = [];
      for (let i = 0; i < pr.count; i++) {
        const g = pr.count > 1 ? i / (pr.count - 1) : 0;
        const ampScale = 1 + (taper - 1) * g;
        feathers.push({
          // clamped to the pullback (cuepost.js twin law — review 363 r1
          // P2): the clearance certificate covers pulls in [0, pullback],
          // and taper > 1 or jitter could push a resolved amp past it
          amp: Math.min(pr.amp_m * ampScale * (1 + jitter * (rand() * 2 - 1)),
            ap.pullback_m),
          dur: pr.period_s * (1 + jitter * (rand() * 2 - 1)),
        });
      }
      let tAcc = ap.from_s - pr.hold_s;
      for (let i = feathers.length - 1; i >= 0; i--) {
        tAcc -= feathers[i].dur;
        feathers[i].t0 = tAcc;
      }
      practice = { feathers, start: tAcc, holdFrom: ap.from_s - pr.hold_s };
      // default-window widening (cuepost.js twin law — review 363 r1 P2):
      // the practice phase lives entirely BEFORE from_s, so a spec that
      // gave no visible_window must open at the practice start or the
      // whole new phase renders hidden
      if (s.visible_window === undefined || s.visible_window === null) {
        vw = [practice.start, vw[1]];
      }
    }

    // ---- static resolution (nothing below is re-read at frame time) ----
    // Anchor = the RECORD's initial cue-ball position (kernel frame), NOT
    // the live mesh: a harness that seeked before arming would otherwise
    // freeze a mid-shot pose into the anchor (purity means the armed spec
    // must not depend on seek history).
    // GH-383: the anchor is the record's own STRUCK ball
    const cueId = game.record?.events?.[0]?.kind?.Strike?.ball ?? 0;
    const kp = game.record?.initial?.balls?.find((b) => b?.id === cueId)
      ?.state?.pos;
    need(kp && Number.isFinite(kp.x) && Number.isFinite(kp.y),
      `no loaded record with a cue ball (id ${cueId}) — arm after loadRecord`);
    const h = Number.isFinite(kp.z) ? kp.z : BALL_R;
    const anchor = new THREE.Vector3();
    if (coords.kPosToThree) coords.kPosToThree(anchor, kp.x, kp.y, h);
    else anchor.set(kp.y, h, kp.x); // literal mirror fallback (stale coords)
    // geometric rail floor (feature-detected; a stale cuestick.js keeps the
    // raw shot theta — render-only, same degrade family as aim.js's floor)
    const floorDeg = cueMod.cueMinElevationDeg?.(anchor, sh.phi, sh.a, sh.b);
    const thetaR = Math.max(sh.theta,
      Number.isFinite(floorDeg) ? floorDeg * DEG : 0);
    const sOff = (1 - Math.sqrt(1 - off2)) * BALL_R;
    const pC = -(TIP_GAP + sOff); // pull at contact: tip face ON the ball
    const W = s.t_contact - ap.from_s;
    const durThrust = Math.min(THRUST_FRAC * W, THRUST_MAX_S);
    // GH-363 prototype: optional ABSOLUTE rear pause (measured back-pause
    // vocabulary — the PAUSE_FRAC share under-expresses deliberate strokes)
    let durPause = PAUSE_FRAC * W;
    if (ap.pause_s !== undefined && ap.pause_s !== null) {
      needNum(ap.pause_s, 'approach.pause_s');
      need(ap.pause_s >= 0 && ap.pause_s <= 3.0,
        `approach.pause_s must be in [0, 3.0], got ${ap.pause_s}`);
      durPause = ap.pause_s;
    }
    const durPull = W - durPause - durThrust;
    need(durPull > 0.05, `approach window too tight: pullback needs > 0.05 s `
      + `(W ${W.toFixed(3)} - pause ${durPause.toFixed(3)} - thrust `
      + `${durThrust.toFixed(3)} = ${durPull.toFixed(3)})`);
    const stroke = ap.pullback_m - pC;        // > 0 (pC < 0 < pullback_m)
    const vC = 2 * stroke / durThrust;        // contact speed [m/s], finite>0
    const dFt = s.follow_through_m > 0 ? 2 * s.follow_through_m / vC : 0;
    const tFtEnd = s.t_contact + dFt;
    need(s.retract.until_s > tFtEnd, `retract.until_s ${s.retract.until_s} `
      + `must leave room for the follow-through (ends ${tFtEnd.toFixed(4)})`);
    const tHoldEnd = tFtEnd + HOLD_FRAC * (s.retract.until_s - tFtEnd);
    // post-impact ring: strikeCueFlex's amplitude law, resolved here
    const offN = Math.sqrt(off2);
    const ringA = Math.min(RING_MAX_A,
      RING_REF_A * (vC / RING_REF_V) * (0.4 + 0.6 * Math.min(1, offN / 0.5)));
    const [ringX, ringY] = offN > 0.1
      ? [-sh.a / offN, sh.b / offN] : [0, 1];
    return {
      phi: sh.phi, thetaR, a: sh.a, b: sh.b, anchor,
      // rev-4 review P2: the rail/furniture fold judges the ARMED table —
      // snapshot at resolve time so the scripted lift is pure in (t, spec)
      // (the geom-less fold used the static default 9-ft band: a phantom
      // mid-table rail on the 12-ft snooker; and a live equipment switch
      // mid-replay could change the output). Feature-detected (rule 5): a
      // stale cuestick.js without the export leaves geom null and the
      // fold degrades to its historical form.
      geom: cueMod.railConstraintGeom?.() ?? null,
      tc: s.t_contact, from: ap.from_s,
      ease: ap.ease === 'linear' ? ((u) => u) : smooth,
      P: ap.pullback_m, pC, stroke, durPull, durThrust, vC,
      tPause: ap.from_s + durPull, tThrust: ap.from_s + durPull + durPause,
      F: s.follow_through_m, dFt, tFtEnd, tHoldEnd,
      until: s.retract.until_s, vw0: vw[0], vw1: vw[1],
      ringA, ringX, ringY, practice,
    };
  }

  /** Axial pull at t — pure piecewise closed form over the resolved spec. */
  function pullAt(m, t) {
    if (m.practice && t < m.from) {
      const pr = m.practice;
      if (t < pr.start || t >= pr.holdFrom) return 0; // address / front pause
      for (const f of pr.feathers) {
        if (t < f.t0 + f.dur) {
          const u = (t - f.t0) / f.dur;
          // raised-cosine feather: address -> amp -> address, C1 at both ends
          return u <= 0 ? 0 : f.amp * 0.5 * (1 - Math.cos(2 * Math.PI * u));
        }
      }
      return 0;
    }
    if (t < m.from) return 0;
    if (t < m.tPause) return m.P * m.ease((t - m.from) / m.durPull);
    if (t < m.tThrust) return m.P;
    if (t < m.tc) {
      const u = (t - m.tThrust) / m.durThrust;
      return m.P - m.stroke * u * u;
    }
    if (m.dFt > 0 && t < m.tFtEnd) {
      const tau = t - m.tc;
      return m.pC - (m.vC * tau - (m.vC / (2 * m.dFt)) * tau * tau);
    }
    if (t < m.tHoldEnd) return m.pC - m.F;
    const u = Math.min(1, (t - m.tHoldEnd) / (m.until - m.tHoldEnd));
    return (m.pC - m.F) + (m.P - (m.pC - m.F)) * smooth(u);
  }

  /** Closed-form strike flex (thrust bow + post-impact ring) → the shared
   * shader uniforms, recomputed from t alone every armed frame. poseCue ran
   * with dt = 0 just before, so cuestick's own updateFlex stayed idle and
   * never contests these writes. */
  function writeFlex(m, t) {
    const u = cue.flex?.u;
    if (!u) return;
    let v = 0;
    if (t >= m.tThrust && t < m.tc) {
      v = m.vC * ((t - m.tThrust) / m.durThrust);
    } else if (m.dFt > 0 && t >= m.tc && t < m.tFtEnd) {
      v = m.vC * (1 - (t - m.tc) / m.dFt);
    }
    const bow = Math.min(BOW_MAX, v * BOW_PER_MPS);
    let ring = 0;
    const tau = t - m.tc;
    if (tau >= 0 && tau < RING_LIFE) {
      ring = m.ringA * Math.exp(-tau / RING_TAU)
        * Math.sin(2 * Math.PI * RING_F * tau);
    }
    // cue-local transverse → segment-local (x, ·, −y), cuestick convention
    const fx = m.ringX * ring, fy = m.ringY * ring - bow;
    u.uFlexA.value.set(fx, 0, -fy);
    // GH-489 round-3 review r5: the rail/pocket-furniture backstop applies
    // DETERMINISTICALLY here too (poseCue runs with dt = 0, so the
    // stateful updateFlex bend is frozen — a snooker replay pull-back
    // would otherwise pass through the raised pocket leather). Pure in
    // (t, spec); feature-detected per rule 5 — a stale cuestick.js keeps
    // the old zeroed channel.
    const rl = cueMod.cueRailLift?.(m.anchor, m.phi, m.thetaR,
      pullAt(m, t), m.a, m.b, undefined, m.geom);
    if (rl && rl.lift > 1e-5) {
      u.uRailA.value.set(0, 0, -rl.lift);
      u.uRailS.value = rl.s;
    } else u.uRailA.value.set(0, 0, 0);
  }

  /** Pose for playback-clock time t — pure in (t, armed spec). */
  function applyAt(t) {
    const m = armed;
    // VW_EPS_S: window edges tolerate float dust (the cuepost.js twin —
    // GH-363 landing sweep; see the applyAt comment there). `until` stays
    // STRICT — the cut semantics are unchanged.
    const vis = t >= m.vw0 - VW_EPS_S && t <= m.vw1 + VW_EPS_S && t < m.until;
    cue.group.visible = vis; // stateless re-assert (the canopy lesson)
    if (!vis) { zeroFlex(); return; }
    // dt = 0 on purpose: freezes cuestick's stateful render flex so the
    // group transform is the only (pure) output of the call
    cueMod.poseCue(cue, m.anchor, m.phi, m.thetaR, pullAt(m, t), m.a, m.b, 0);
    writeFlex(m, t);
  }

  machine.on('frame', (t) => {
    if (armed) applyAt(t);
  });

  return {
    /** Arm a strike spec (see the module doc); `arm(null)` disarms and
     * hides the cue. An INVALID spec rejects WHOLE: console diagnostic +
     * return false, with any previously armed spec and the scene untouched
     * (validation and static resolution run to completion first —
     * the camerascript validate-before-disarm law). */
    arm(s) {
      if (s === null || s === undefined) {
        armed = null;
        if (cue) { cue.group.visible = false; zeroFlex(); }
        return true;
      }
      let resolved;
      try {
        resolved = resolve(s);
        // record-pinned cue look (S2.5) + may reject on a stale
        // cuestick.js — before disarm (validate-before-disarm law)
        ensureCue(game.record?.initial?.equipment?.cue_id ?? 'standard');
      } catch (e) {
        console.error(`[cuestrike] spec rejected: ${e.message ?? e}`);
        return false;
      }
      armed = resolved;
      return true;
    },
    active: () => !!armed,
  };
}
