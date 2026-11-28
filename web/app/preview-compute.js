// Copyright (c) Meta Platforms, Inc. and affiliates.

// preview-compute.js — the aim-preview kernel computation shared by the
// preview worker (preview-worker.js, the normal path) and preview.js's
// synchronous fallback (worker construction failure). Pure kernel-frame
// numbers in and out — no three.js, no DOM — so the two paths are the SAME
// code and the physics-exactness contract (ghost === the shot record's
// first BallBall event, bit-for-bit) holds on either.
import { recordDuration } from '../dist/pool-sdk/index.js';

// Motion states in which a ball's POSITION changes (GH-317 practice-path
// windows). Spinning spins in place; Stationary and Pocketed are parked.
const MOVING_STATES = new Set(['Sliding', 'Rolling', 'Airborne']);

/**
 * Simulate `scenarioJson` on `engine` and derive the preview payload:
 * cue path to first contact, ghost/contact/stub, optional practice paths.
 * All positions are kernel-frame. Throws whatever the engine throws.
 */
export function computePreview(engine, { scenarioJson, maxPts, practice, cuePost: wantCuePost, tableLength }) {
  const t0 = performance.now();
  const json = engine.simulateJson(scenarioJson); // throws on reject
  const t1 = performance.now();
  const rec = JSON.parse(json);
  const t2 = performance.now();
  const duration = recordDuration(rec);
  // GH-383: the CUE is the record's own struck ball (Strike event truth —
  // ball 1 for the carom second seat under two-cue; 0 everywhere else)
  const cueId = rec.events?.[0]?.kind?.Strike?.ball ?? 0;
  // first cue-ball ↔ object-ball contact in the REAL event stream
  const ev = rec.events.find((e) => typeof e.kind === 'object'
    && 'BallBall' in e.kind
    && (e.kind.BallBall.b1 === cueId || e.kind.BallBall.b2 === cueId));
  const tCue = ev ? ev.t : duration;
  const sampler = engine.sampler(json);
  const t3 = performance.now();
  const ci = sampler.ballIds.indexOf(cueId);
  const buf = sampler.data;

  // cue-ball path polyline, 0 → first contact (kernel-sampled, so it bends
  // for massé/elevated shots and shows jump arcs)
  const cuePts = new Float64Array(maxPts * 3);
  for (let i = 0; i < maxPts; i++) {
    sampler.sampleAt((tCue * i) / (maxPts - 1));
    const o = 8 * ci;
    cuePts[i * 3] = buf[o];
    cuePts[i * 3 + 1] = buf[o + 1];
    cuePts[i * 3 + 2] = buf[o + 2];
  }
  let ghost = null, stub = null, contact = null;
  if (ev) {
    const cuePost = ev.post.find(([bid]) => bid === cueId)?.[1];
    const obId = ev.kind.BallBall.b1 === cueId
      ? ev.kind.BallBall.b2 : ev.kind.BallBall.b1;
    contact = { t: ev.t, ball: obId };
    const obPost = ev.post.find(([bid]) => bid === obId)?.[1];
    if (cuePost) {
      ghost = cuePost.pos; // exact kernel contact position (event truth)
      cuePts[(maxPts - 1) * 3] = ghost.x;
      cuePts[(maxPts - 1) * 3 + 1] = ghost.y;
      cuePts[(maxPts - 1) * 3 + 2] = ghost.z;
    }
    if (obPost) {
      const v = obPost.vel, m = Math.hypot(v.x, v.y);
      if (m > 1e-9) {
        const len = tableLength / 16; // 0.5 diamond
        stub = {
          from: obPost.pos,
          to: { x: obPost.pos.x + (v.x / m) * len, y: obPost.pos.y + (v.y / m) * len },
        };
      }
    }
  }
  // cue-ball POST-contact path (feature 007): kernel-sampled from the first
  // contact, so draw-back curves / follow arcs / tangent deflection are the
  // record's own trajectory. Capped at 1.5 diamonds of path length or 2.5 s.
  let cuePost = null;
  if (wantCuePost && ev && duration - tCue > 1e-6) {
    const windowEnd = Math.min(tCue + 2.5, duration);
    const cap = (tableLength * 3) / 16; // 1.5 diamonds of path length
    const cueXY = (t) => {
      sampler.sampleAt(t);
      const o = 8 * ci;
      return [buf[o], buf[o + 1], buf[o + 2]];
    };
    // pass 1: coarse walk to find the time at which the path-length cap is
    // reached (or the window end), so pass 2 spends the FULL point budget on
    // exactly the drawn segment — a time-uniform single pass wasted ~90% of
    // the points past the cap and left the draw-back curve 5-6 points coarse
    let tCap = windowEnd, acc = 0;
    let prev = cueXY(tCue);
    for (let i = 1; i < maxPts; i++) {
      const t = tCue + ((windowEnd - tCue) * i) / (maxPts - 1);
      const cur = cueXY(t);
      acc += Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
      prev = cur;
      if (acc >= cap) { tCap = t; break; }
    }
    if (acc > 0.01) { // degenerate stop shot (dead stun) draws nothing
      const raw = new Float64Array(maxPts * 3);
      for (let i = 0; i < maxPts; i++) {
        const [x, y, z] = cueXY(tCue + ((tCap - tCue) * i) / (maxPts - 1));
        raw[i * 3] = x; raw[i * 3 + 1] = y; raw[i * 3 + 2] = z;
      }
      // anchor point 0 at the exact contact position (event truth)
      if (ghost) { raw[0] = ghost.x; raw[1] = ghost.y; raw[2] = ghost.z; }
      cuePost = { pts: raw, n: maxPts };
    }
  }

  // practice level: full (dimmed) paths of every ball. GH-317: each ball's
  // point budget covers its OWN motion window (first motion → rest/capture)
  // instead of the whole record duration — the old whole-record uniform pass
  // under-resolved long records (96 points across 20 s = one vertex every
  // 0.21 s) and, for pocketed balls, parked every post-capture sample at the
  // kernel's below-bed terminal position (resolve/pocket.rs z = −0.1,
  // depth-occluded), so the visible line stopped up to duration/95 s of
  // travel BEFORE the pocket mouth. Windows come from the event stream
  // (event truth, no physics re-derivation): a ball's position changes only
  // while its motion state is in MOVING_STATES.
  let prac = null;
  if (practice) {
    const n = sampler.ballCount;
    const pts = new Float64Array(n * maxPts * 3);
    const win = new Map(); // ball id → { t0, t1, moving, captured }
    for (const b of rec.initial.balls) {
      const moving = MOVING_STATES.has(b.state.motion);
      win.set(b.id, { t0: moving ? 0 : -1, t1: -1, moving, captured: false });
    }
    for (const e of rec.events) {
      for (const [bid, st] of e.post) {
        const w = win.get(bid);
        if (!w || w.captured) continue;
        if (MOVING_STATES.has(st.motion)) {
          if (w.t0 < 0) w.t0 = e.t;
          w.moving = true;
          w.t1 = -1; // still moving (a stopped ball can be bumped again)
        } else if (w.moving) {
          w.moving = false;
          w.t1 = e.t;
          if (st.motion === 'Pocketed') w.captured = true;
        }
      }
    }
    let restSampled = false; // one shared t=0 pass serves ALL never-movers
    for (let b = 0; b < n; b++) {
      const w = win.get(sampler.ballIds[b]);
      const o = 8 * b, base = b * maxPts * 3;
      if (!w || w.t0 < 0) {
        // never moves: keep drawing nothing — the degenerate all-one-point
        // polyline (every vertex at the rest pose) that the whole-duration
        // pass produced for stationary balls, byte-identically
        if (!restSampled) { sampler.sampleAt(0); restSampled = true; }
        for (let i = 0; i < maxPts; i++) {
          const p = base + i * 3;
          pts[p] = buf[o];
          pts[p + 1] = buf[o + 1];
          pts[p + 2] = buf[o + 2];
        }
        continue;
      }
      restSampled = false; // the moving-ball loop below overwrites buf
      // review r1 P2: start on the PRE-event leg too (one ulp before the
      // first-motion event) — the CompliantChain cluster resolver advances
      // member POSITIONS through its compliant window (cluster_compliant.rs
      // `s.pos += s.vel·dt`), so a frozen-rack ball's first post state sits
      // millimetres past its rack pose and sampling exactly AT t0 would
      // clip the path start. On the ordinary resolvers (positions
      // continuous across the event) this is byte-identical to sampling at
      // t0: the pre-leg of a resting ball evaluates to its rest pose.
      let tStart = w.t0;
      if (tStart > 0) tStart -= tStart * Number.EPSILON;
      let tEnd = w.t1 < 0 ? duration : w.t1;
      // Pocket (or off-table) capture: terminate the polyline with the
      // EVENT-EXACT capture vertex — the on-cloth position at the pocket
      // mouth. Sampling exactly AT the capture time returns the event's
      // POST state (the parked below-bed terminal), so pin the last sample
      // one ulp BEFORE it: the sampler then anchors on the last pre-capture
      // event and evaluates the kernel's own closed form at the capture
      // instant to within one representable double — the pocket-capture
      // mirror of the cue approach line's exact-contact snap above (which
      // can use ev.post directly only because BallBall positions are
      // continuous across the event; a capture's post position is not).
      if (w.captured) tEnd -= Math.max(Number.MIN_VALUE, tEnd * Number.EPSILON);
      // GH-1048: "Cue path after contact" Off removes EVERY after-contact
      // route of the struck ball — this Full-level path included — so its
      // window ends at the first contact (the approach stays drawn).
      // BallBall positions are continuous across the event, so sampling AT
      // ev.t lands on the contact; the vertex is pinned to the exact ghost
      // below (the cue approach line's event-truth snap).
      const clipAtContact = !wantCuePost && ev && sampler.ballIds[b] === cueId
        && ev.t < tEnd;
      if (clipAtContact) tEnd = ev.t;
      for (let i = 0; i < maxPts; i++) {
        // review r2 P1: the last index samples tEnd DIRECTLY — the lerp form
        // `tStart + (tEnd − tStart)` can round one ulp UP, reconstructing
        // the exact capture time and returning the parked below-bed post
        // state the backoff exists to avoid (verified: tStart 0.16192…,
        // capture 4.0436247488893870 → lerp end == capture exactly).
        sampler.sampleAt(i === maxPts - 1
          ? tEnd : tStart + ((tEnd - tStart) * i) / (maxPts - 1));
        const p = base + i * 3;
        pts[p] = buf[o];
        pts[p + 1] = buf[o + 1];
        pts[p + 2] = buf[o + 2];
      }
      if (clipAtContact && ghost) {
        const p = base + (maxPts - 1) * 3;
        pts[p] = ghost.x; pts[p + 1] = ghost.y; pts[p + 2] = ghost.z;
      }
    }
    prac = { ids: [...sampler.ballIds], pts };
  }
  sampler.free();
  const t4 = performance.now(); // sampling loops (cuePts + cuePost + practice)
  return { ok: true, duration, contact, ghost, stub, cuePts, cuePost, practice: prac,
    stats: { simMs: t1 - t0, parseMs: t2 - t1, samplerMs: t3 - t2,
      sampleMs: t4 - t3, bytes: json.length } };
}
