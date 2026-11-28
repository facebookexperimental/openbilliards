// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/marks/model.js — which marks one shot leaves on the cloth, and what of them is on the cloth at playback time t
// (CONTRACT.md section 12, owner: marks). Pure: no three import, no clock, no random source; the node arm
// (web/tools/club/test-club-marks.mjs) runs every function here.
//
// What a played worsted cloth shows under a lamp, and what is drawn for it:
//   chalk   a speck of chalk dust under the tip and a short smear in front of where the struck ball sat (tip -> ball ->
//           cloth), at every Strike event
//   burn    the pale track a ball leaves where it SKIDDED hard: friction at the contact point glazes the fibre ends. The
//           stretch is read from the record: from an event whose post state has the ball on the cloth and not rolling
//           (`Sliding`, or the millimetre skips of a ball struck with a slightly raised cue: `Airborne` with a vertical
//           speed under MARKS_TUNE.skip) to the ball's next event; consecutive stretches join into one track. How hard it
//           marks is the speed of the ball's contact point over the cloth at the start of the stretch (the slip: a break
//           at speed and a draw shot's backspin both give 10 m/s and more, a soft roll under 2). A slide that ends by
//           rolling has no slip left at its end: the track fades out before the ball rolls
//   landing a small pale dot where a ball came down on the bed (`BallTable`) after a real flight: scaled by how fast it
//           came down (the vertical speed in the ball's previous recorded state: a ball that left the bed and returns to
//           it lands as fast as it left; a ball the cue drove into the bed lands with the speed the strike gave it) and
//           by how fast its contact point scuffs the cloth as it lands. The grazing hops of a break cluster leave no dot
//   nothing for a ball that rolls.
//
// No motion law is evaluated here. A stretch's path between two recorded states is the one parabola through the recorded
// start position, start velocity and end position (an interpolation of the record; it stays within a few millimetres of
// where the kernel's sampler puts the ball, the node arm measures it); everything else is read off the post states.
//
// Law 2 of the round (pure in time): `marksAt(model, t, cap)` depends on the model (built from the record alone) and t.
// A mark is absent while t is before its event, a track is drawn as far as the ball had come at t.

/** Record kinds as the shader reads them (integer part of the last float of a record). */
export const MARK_BURN = 0;
export const MARK_CHALK = 1;
/** Floats per drawn record: a.x, a.z, b.x, b.z (world metres), half width (m), strength at a, strength at b, kind + seed. */
export const RECORD_FLOATS = 8;

export const MARKS_TUNE = Object.freeze({
  // slip speed of the contact point (m/s) at which a skid starts to mark, and at which it marks fully
  slip: Object.freeze({ from: 3.0, full: 11.0 }),
  // an `Airborne` ball whose vertical speed is under this (m/s) is skipping over the cloth, not flying: it marks like a slide
  skip: 0.25,
  // marks weaker than this are not kept (they could not be seen and would spend a record)
  minStrength: 0.1,
  // half width (m); shortest track kept; how far (m) a drawn segment may leave the path; the most segments one stretch
  // is cut into; how far the strength along a segment may leave a straight ramp
  track: Object.freeze({ half: 0.005, minLength: 0.004, curveTol: 0.0015, maxParts: 4, strengthTol: 0.08 }),
  // downward speed (m/s) at which a landing starts to mark / marks fully; the share of a full slip's strength a landing
  // scuff gets; dot radius (m) at strength 0 and 1
  land: Object.freeze({ from: 0.5, full: 3.0, scuff: 0.6, half: 0.0055, halfFull: 0.0075 }),
  chalk: Object.freeze({
    speck: 0.009, smear: 0.0045,           // half widths (m): the dust settles as a soft patch two to three centimetres across
    back: 0.92,                            // the speck lies this share of the ball radius behind the ball's centre (under the tip)
    lengthSlow: 0.014, lengthFast: 0.05,   // length of the smear (m) at a soft and at a hard strike
    speedSlow: 1.0, speedFast: 8.0,        // ball speed after the strike (m/s) for the two lengths
    level: 0.55, levelFast: 1.0,           // strength at a soft and at a hard strike
    fadeFrom: 0.02, fadeTo: 0.3,           // seconds after the strike over which the dust settles into view
  }),
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (x, a, b) => clamp01((x - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const finVec = (v) => v && fin(v.x) && fin(v.y) && fin(v.z);

/** The kind of an event as a string ('Strike', 'BallTable', 'Transition', 'Rest', ...), or null. */
export function eventKind(ev) {
  const k = ev?.kind;
  if (typeof k === 'string') return k;
  if (k && typeof k === 'object') { for (const key in k) return key; }
  return null;
}

/** A seed in [0, 1) from the shot seed, an event index and a salt (integer hash; no random source). */
export function seed01(shotSeed, index, salt = 0) {
  let h = (Math.floor(Number(shotSeed) || 0) ^ Math.imul((index | 0) + 1, 0x9E3779B1) ^ Math.imul((salt | 0) + 1, 0x85EBCA6B)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846CA68B) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Speed of a ball's contact point over the cloth (m/s) in a recorded state: | v + w x (0, 0, -R) | in the bed plane (kernel axes, z up). */
export function slipSpeed(state, ballR) {
  const v = state?.vel, w = state?.avel;
  if (!finVec(v) || !finVec(w) || !(ballR > 0)) return 0;
  return Math.hypot(v.x - ballR * w.y, v.y + ballR * w.x);
}

/** Is the ball of this recorded state skidding on the cloth (sliding, or skipping in hops too low to count as a flight)? */
export function onCloth(state, tune = MARKS_TUNE) {
  if (!state || !finVec(state.vel)) return false;
  return state.motion === 'Sliding' || (state.motion === 'Airborne' && Math.abs(state.vel.z) < tune.skip);
}

/** Where the ball was `tau` seconds into one stretch (world x, z): the parabola through the stretch's recorded states. */
export function legPoint(leg, tau) {
  const q = leg.T > 0 ? tau / leg.T : 0;
  return [leg.a[0] + leg.va[0] * tau + leg.c[0] * q * q, leg.a[1] + leg.va[1] * tau + leg.c[1] * q * q];
}
const legStrength = (leg, tau) => leg.s0 + (leg.s1 - leg.s0) * (leg.te > 0 ? Math.min(1, tau / leg.te) : 0);

/** Where the ball was at playback time t along a track (world x, z), or null when t is outside the track's time. */
export function trackPointAt(mark, t) {
  for (const leg of mark.legs ?? []) if (t >= leg.t0 && t <= leg.t0 + leg.te) return legPoint(leg, t - leg.t0);
  return null;
}

/**
 * The marks of one shot. `record` is the parsed ShotRecord (read only); `opts`: `{ ballR, halfL, halfW, tune }` (metres; the
 * half extents of the playing surface along world x and z; marks outside it are dropped). Returns
 * `{ marks, counts, seed }`; a mark is one of
 *   { kind: 'track', index, ball, t0, t1, legs: [{ t0, T, te, a, va, c, s0, s1, parts }], length, half, s0, seed }
 *   { kind: 'land' | 'speck' | 'smear', index, ball, t0, a: [x, z], b: [x, z], half, s0, s1, seed, fade?: [from, to] }
 * in WORLD metres (x = kernel y, z = kernel x). Never throws on a malformed record: what cannot be read is skipped.
 */
export function shotMarks(record, opts = {}) {
  const tune = opts.tune ?? MARKS_TUNE;
  const R = opts.ballR > 0 ? opts.ballR : 0.028575;
  const halfL = opts.halfL > 0 ? opts.halfL + R : Infinity, halfW = opts.halfW > 0 ? opts.halfW + R : Infinity;
  const marks = [];
  const counts = { events: 0, strikes: 0, stretches: 0, skips: 0, tracks: 0, landings: 0, dots: 0, chalk: 0, dropped: 0 };
  const events = Array.isArray(record?.events) ? record.events : [];
  const shotSeed = Number(record?.shot?.seed) || 0;
  const inside = (x, z) => Math.abs(x) <= halfL && Math.abs(z) <= halfW;
  const open = new Map();   // ball id -> the stretch that is open: { index, t, pos, vel, slip, skip }
  const chain = new Map();  // ball id -> the track its next stretch may join: { mark, tEnd }
  const last = new Map();   // ball id -> the ball's previous recorded state
  counts.events = events.length;

  const closeStretch = (id, tb, pos, rolled) => {
    const s = open.get(id);
    if (!s) return;
    open.delete(id);
    counts.stretches += 1;
    if (s.skip) counts.skips += 1;
    const joined = chain.get(id);
    chain.delete(id);
    const T = tb - s.t;
    if (!(T > 1e-5) || !finVec(pos)) { if (joined && T >= 0 && T <= 1e-5) chain.set(id, joined); return; } // an instant: the track goes on
    const strength = ramp(s.slip, tune.slip.from, tune.slip.full);
    if (strength < tune.minStrength) return;
    // world axes: x = kernel y, z = kernel x
    const a = [s.pos.y, s.pos.x], b = [pos.y, pos.x], va = [s.vel.y, s.vel.x];
    // a slide that ends by rolling has lost all its slip there (linearly in time): it stops marking where the slip falls
    // under the threshold; a stretch cut short by a contact still slips as it started
    const share = rolled ? clamp01((s.slip - tune.slip.from) / s.slip) : 1;
    const te = T * share;
    // the parabola through (a, va) and b over T; a record whose numbers do not fit one is drawn as its chord
    let c = [b[0] - a[0] - va[0] * T, b[1] - a[1] - va[1] * T];
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let v = va;
    if (!(Math.hypot(c[0], c[1]) <= 2 * chord + 0.05)) { c = [0, 0]; v = [(b[0] - a[0]) / T, (b[1] - a[1]) / T]; }
    const leg = { t0: s.t, T, te, a, va: v, c, s0: strength, s1: rolled ? 0 : strength, parts: 1 };
    const end = legPoint(leg, te);
    const length = Math.hypot(end[0] - a[0], end[1] - a[1]);
    if (!inside(a[0], a[1]) || !inside(end[0], end[1])) { counts.dropped += 1; return; }
    // how far the parabola's middle lies from the chord LINE: one straight part while that is under the tolerance
    // (a straight slide that slows down is one part)
    if (length > 1e-6) {
      const mid = legPoint(leg, te / 2);
      const dev = Math.abs((mid[0] - a[0]) * (end[1] - a[1]) - (mid[1] - a[1]) * (end[0] - a[0])) / length;
      leg.parts = dev <= tune.track.curveTol ? 1 : Math.min(tune.track.maxParts, Math.ceil(Math.sqrt(dev / tune.track.curveTol)));
    }
    let mark = joined && Math.abs(joined.tEnd - s.t) <= 1e-9 ? joined.mark : null;
    if (!mark) {
      mark = { kind: 'track', index: s.index, ball: id, t0: s.t, t1: s.t, legs: [], length: 0, half: tune.track.half, s0: 0, seed: seed01(shotSeed, s.index, 11 + id) };
      marks.push(mark);
      counts.tracks += 1;
    }
    mark.legs.push(leg); mark.t1 = s.t + te; mark.length += length; mark.s0 = Math.max(mark.s0, strength);
    // the next stretch joins this track when it starts at this very event and this one did not fade out by rolling
    if (!rolled) chain.set(id, { mark, tEnd: tb });
  };

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const t = Number(ev?.t);
    if (!fin(t) || !Array.isArray(ev?.post)) continue;
    const kind = eventKind(ev);
    const body = kind && typeof ev.kind === 'object' ? ev.kind[kind] : null;
    for (const row of ev.post) {
      const id = Array.isArray(row) ? row[0] : null, st = Array.isArray(row) ? row[1] : null;
      if (id === null || id === undefined || !st || !finVec(st.pos)) continue;
      // the ball's position is continuous through an event: this state closes the stretch that was open
      closeStretch(id, t, st.pos, kind === 'Transition' && body?.ball === id && body?.from === 'Sliding');
      const prev = last.get(id);
      // a landing after a real flight: how fast the ball came down is the vertical speed of its previous recorded state;
      // how hard it scuffs is the slip it lands with
      if (kind === 'BallTable' && body?.ball === id && prev && prev.motion === 'Airborne' && finVec(prev.vel) && Math.abs(prev.vel.z) >= tune.skip) {
        counts.landings += 1;
        const s = Math.max(ramp(Math.abs(prev.vel.z), tune.land.from, tune.land.full), tune.land.scuff * ramp(slipSpeed(st, R), tune.slip.from, tune.slip.full));
        const x = st.pos.y, z = st.pos.x;
        if (s >= tune.minStrength && inside(x, z)) {
          marks.push({ kind: 'land', index: i, ball: id, t0: t, t1: t, a: [x, z], b: [x, z], half: tune.land.half + (tune.land.halfFull - tune.land.half) * s, s0: s, s1: s, seed: seed01(shotSeed, i, 23 + id) });
          counts.dots += 1;
        }
      }
      if (kind === 'Strike' && body?.ball === id && finVec(st.vel)) {
        counts.strikes += 1;
        const x = st.pos.y, z = st.pos.x;
        const speed = Math.hypot(st.vel.x, st.vel.y, st.vel.z);
        const horiz = Math.hypot(st.vel.x, st.vel.y);
        const k = tune.chalk;
        const hard = ramp(speed, k.speedSlow, k.speedFast);
        // an off-centre hit sheds more chalk (the tip slides on the ball)
        const off = clamp01(Math.hypot(Number(record?.shot?.a) || 0, Number(record?.shot?.b) || 0) / 0.5);
        const level = clamp01((k.level + (k.levelFast - k.level) * hard) * (0.8 + 0.4 * off));
        if (inside(x, z) && level >= tune.minStrength) {
          const fade = [t + k.fadeFrom, t + k.fadeTo];
          if (horiz > 1e-3) {
            const dx = st.vel.y / horiz, dz = st.vel.x / horiz; // the direction of travel, world axes
            const rx = -dz, rz = dx;                             // its right-hand side seen from above (kernel +x for a shot along +y)
            const a = clamp01(Math.abs(Number(record?.shot?.a) || 0)) * Math.sign(Number(record?.shot?.a) || 0);
            const sx = x - dx * R * k.back + rx * R * a * 0.8, sz = z - dz * R * k.back + rz * R * a * 0.8;
            if (inside(sx, sz)) { marks.push({ kind: 'speck', index: i, ball: id, t0: t, t1: fade[1], a: [sx, sz], b: [sx, sz], half: k.speck, s0: level, s1: level, seed: seed01(shotSeed, i, 31), fade }); counts.chalk += 1; }
            const len = k.lengthSlow + (k.lengthFast - k.lengthSlow) * hard;
            const ex = x + dx * len, ez = z + dz * len;
            if (inside(ex, ez)) { marks.push({ kind: 'smear', index: i, ball: id, t0: t, t1: fade[1], a: [x, z], b: [ex, ez], half: k.smear, s0: level * 0.85, s1: 0, seed: seed01(shotSeed, i, 37), fade }); counts.chalk += 1; }
          } else {
            marks.push({ kind: 'speck', index: i, ball: id, t0: t, t1: fade[1], a: [x, z], b: [x, z], half: k.speck, s0: level, s1: level, seed: seed01(shotSeed, i, 31), fade });
            counts.chalk += 1;
          }
        }
      }
      if (onCloth(st, tune)) open.set(id, { index: i, t, pos: st.pos, vel: st.vel, slip: slipSpeed(st, R), skip: st.motion !== 'Sliding' });
      else chain.delete(id);
      last.set(id, st);
    }
  }
  // a stretch still open at the end of the record never reached a recorded end: nothing is drawn for it.
  // tracks too short to see are dropped
  const kept = marks.filter((m) => m.kind !== 'track' || m.length >= tune.track.minLength);
  counts.dropped += marks.length - kept.length;
  counts.tracks -= marks.length - kept.length;
  return { marks: kept, counts, seed: shotSeed, tune };
}

/**
 * The points of a track as far as the ball had come at time t: [[x, z, strength arriving, strength leaving], ...] along its
 * stretches. Where two stretches meet, the point arrives with the first one's strength and leaves with the second one's.
 * Points under two millimetres apart are one point (the skips of a ball that has just been stopped go nowhere).
 */
function trackPoints(mark, t) {
  const pts = [];
  const push = (p, s) => { const q = pts[pts.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 2e-3) pts.push([p[0], p[1], s, s]); else q[3] = s; };
  for (const leg of mark.legs) {
    if (!(t > leg.t0)) break;
    const head = Math.min(t - leg.t0, leg.te);
    for (let j = 0; j <= leg.parts; j++) {
      const tau = leg.te * j / leg.parts;
      if (tau >= head) { push(legPoint(leg, head), legStrength(leg, head)); break; }
      push(legPoint(leg, tau), legStrength(leg, tau));
    }
    if (head < leg.te) break;
  }
  return pts;
}

/** Straight runs of a point list: a run goes on while every point it passes stays within `tol` of its chord and `sTol` of its strength ramp. */
function runsOf(pts, tol, sTol) {
  const runs = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    for (let k = j + 1; k < pts.length; k++) {
      const a = pts[i], b = pts[k];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let fits = len > 1e-9;
      for (let m = i + 1; m < k && fits; m++) {
        const p = pts[m];
        const u = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len);
        const d = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / len;
        const want = a[3] + (b[2] - a[3]) * u;
        if (d > tol || u < -1e-6 || u > 1 + 1e-6 || Math.abs(p[2] - want) > sTol || Math.abs(p[3] - want) > sTol) fits = false;
      }
      if (!fits) break;
      j = k;
    }
    runs.push([pts[i][0], pts[i][1], pts[i][3], pts[j][0], pts[j][1], pts[j][2]]); // a.x, a.z, strength at a, b.x, b.z, strength at b
    i = j;
  }
  return runs;
}

const KIND_CODE = { track: MARK_BURN, land: MARK_BURN, speck: MARK_CHALK, smear: MARK_CHALK };

/**
 * What is on the cloth at playback time t: an array of records (each RECORD_FLOATS numbers, see above), at most `cap`.
 * Depends on `model` and `t` only. When a shot has more than `cap` records the strongest are kept (ties: the later event),
 * and the kept ones are returned in the record's own order.
 */
export function marksAt(model, t, cap = 32) {
  const out = [];
  if (!model || !Array.isArray(model.marks) || !fin(t) || !(cap > 0)) return out;
  const tune = model.tune ?? MARKS_TUNE;
  for (const m of model.marks) {
    if (!(t >= m.t0)) continue; // not yet (a time before the event shows no mark)
    const code = KIND_CODE[m.kind] + Math.min(0.999, Math.max(0, m.seed));
    if (m.kind === 'track') {
      for (const [ax, az, sa, bx, bz, sb] of runsOf(trackPoints(m, t), tune.track.curveTol, tune.track.strengthTol)) {
        out.push({ w: Math.max(sa, sb), i: m.index, r: [ax, az, bx, bz, m.half, sa, sb, code] });
      }
    } else {
      let k = 1;
      if (m.fade) { const x = ramp(t, m.fade[0], m.fade[1]); k = smooth(x); }
      if (!(k > 0)) continue;
      out.push({ w: Math.max(m.s0, m.s1) * k, i: m.index, r: [m.a[0], m.a[1], m.b[0], m.b[1], m.half, m.s0 * k, m.s1 * k, code] });
    }
  }
  if (out.length > cap) {
    const order = out.map((o, n) => n).sort((p, q) => (out[q].w - out[p].w) || (out[q].i - out[p].i) || (q - p)).slice(0, cap).sort((p, q) => p - q);
    return order.map((n) => out[n].r);
  }
  return out.map((o) => o.r);
}

/** Every record of a shot once it has played out (t past the last event). */
export function marksAtEnd(model, cap = 32) {
  return marksAt(model, Number.MAX_VALUE, cap);
}

/**
 * Marks of EARLIER shots of a session: a bounded list. `push(key, records)` adds a played shot (the same key twice is one
 * entry), the oldest entry leaves when there are more than `shots`, and an entry's records fade with its age (the newest at
 * 1, the oldest at 1 / shots). `list(cap)` returns the records, newest shot first, at most `cap`. `clear()` is a re-rack.
 * Plain data, no clock: the list changes only when a shot is pushed or the table is cleared.
 */
export function createSession({ shots = 6, perShot = 10 } = {}) {
  const max = Math.max(1, shots | 0);
  let entries = []; // newest first: { key, records }
  return {
    get size() { return entries.length; },
    has(key) { return entries.some((e) => e.key === key); },
    push(key, records) {
      if (!Array.isArray(records)) return false;
      entries = entries.filter((e) => e.key !== key);
      const kept = records.slice().map((r, n) => ({ r, n })).sort((p, q) => (Math.max(q.r[5], q.r[6]) - Math.max(p.r[5], p.r[6])) || (p.n - q.n)).slice(0, Math.max(0, perShot | 0)).sort((p, q) => p.n - q.n).map((x) => x.r.slice());
      entries.unshift({ key, records: kept });
      if (entries.length > max) entries.length = max;
      return true;
    },
    clear() { const n = entries.length; entries = []; return n; },
    list(cap = 32) {
      const out = [];
      for (let age = 0; age < entries.length && out.length < cap; age++) {
        const w = 1 - age / max;
        for (const r of entries[age].records) {
          if (out.length >= cap) break;
          const c = r.slice(); c[5] *= w; c[6] *= w; out.push(c);
        }
      }
      return out;
    },
  };
}

/** The bounding box of a list of records in the bed plane, grown by their widths: [minX, minZ, maxX, maxZ] (empty: zeros). */
export function recordsBox(records, grow = 0) {
  if (!records?.length) return [0, 0, 0, 0];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of records) {
    const h = r[4] * 2 + grow;
    x0 = Math.min(x0, r[0] - h, r[2] - h); x1 = Math.max(x1, r[0] + h, r[2] + h);
    z0 = Math.min(z0, r[1] - h, r[3] - h); z1 = Math.max(z1, r[1] + h, r[3] + h);
  }
  return [x0, z0, x1, z1];
}
