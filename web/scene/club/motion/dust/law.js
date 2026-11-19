// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/dust/law.js - the closed-form law of the chalk puff at the cue tip (CONTRACT.md section 12). Owner: dust.
//
// No imports and no three: the same file runs in the browser and in the node arm (web/tools/club/test-club-dust.mjs).
// Everything here is a pure function of its arguments. The cloud drawn at playback time t is
//     evalCloud(buildCloud(strikeOf(record), count), t)
// and nothing else: no frame-to-frame integration, no Math.random, no clock. `buildCloud` depends on the record alone (it
// is a cache, not a state: building it again gives the same numbers), `evalCloud` on the cloud and t.
//
// This is a garnish on the picture, not game physics: nothing here is read back by the game, and no ball is moved by it.
//
// What it imitates (a slow-motion film of a tip meeting a chalked ball, as remembered; no film was consulted for this
// file): chalk is shed at the contact in about a millisecond. The grains are fine, so the air stops them within
// centimetres and in a few hundredths of a second: the puff jumps out and then HANGS. Three parts are seen:
//   ring  - dust squeezed out sideways between tip and ball: a shallow cone round the cue's line, opening away from the
//           ball; with an off-centre tip (side, draw, follow) the tip skids outward over the ball and the ring becomes a
//           one-sided plume in the direction of the skid;
//   wake  - dust knocked off the rim of the tip that keeps going forward along the cue's line, behind the leaving ball
//           and round the following shaft;
//   core  - a slow haze that stays where the contact was.
// After the jump the cloud drifts a few centimetres a second, sinks slowly (coarse grains first), spreads, thins, and is
// gone in about a second. Amount: almost nothing below about 1.5 m/s, a full puff at a break; more off centre.
//
// Frame: world metres, y up, the bed plane at y = bedY (0), three.x = kernel y, three.y = kernel z, three.z = kernel x
// (web/app/coords.js). The tip's geometry at contact is the cue pose of web/scene/cuestick.js poseCue with the contact
// pull of web/app/cuestrike.js: tip face on the ball at C + right*a*R + up'*b*R - forward*R*sqrt(1 - a^2 - b^2).

export const DUST_LAW_VERSION = 1;

/** Longest life of any particle, seconds after the strike: nothing is drawn at or after this. */
export const LIFE_MAX = 1.2;
/** Below this amount (0..1) a strike sheds nothing that could be seen: no cloud is built. */
export const AMOUNT_MIN = 0.02;
/** Tip speed below which nothing is shed, and the speed of a full puff (m/s). */
export const V_SOFT = 0.7;
export const V_HARD = 8.0;
/** Tip offset (units of R) at which the skid term is full (the miscue limit of a standard tip). */
export const OFF_FULL = 0.5;
/** Reference particle count: the per-particle opacity is written for this many; fewer particles are a little larger and denser. */
export const COUNT_REF = 160;
/** Hard ceiling on the particle count, whatever the tier asks for. */
export const COUNT_MAX = 400;
/** The fingers of the ring, and the share of the ring's particles that ride one. */
export const WISPS = 9;
export const WISP_SHARE = 0.55;
/** Floats per particle in `cloud.params`. */
export const STRIDE = 24;
/** An alpha below this is not drawn (the particle is skipped). */
export const ALPHA_MIN = 1 / 512;
/** No single sprite is more opaque than this at its centre (readability of the cue ball at the strike). */
export const ALPHA_CAP = 0.14;
/** A particle's centre is kept at least this far above the bed (plus a share of its radius). */
export const BED_CLEAR = 0.004;
/** A particle whose free path would be this far under its resting height has landed and is no longer drawn. */
export const LAND_DEPTH = 0.022;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const fin = Number.isFinite;

// ---- seeds -------------------------------------------------------------------------------------------------------------------
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
function mix32(h, w) { h ^= w; h = Math.imul(h, 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; }
function mixNumber(h, x) { f64[0] = Number(x) || 0; return mix32(mix32(h, u32[0]), u32[1]); }
/** mulberry32: a fixed stream of numbers in [0, 1) from a 32-bit seed. */
export function stream(seed) {
  let st = seed >>> 0;
  return () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let z = st;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the strike ----------------------------------------------------------------------------------------------------------------
/**
 * The amount of chalk a strike sheds, 0..1, from the tip speed and the tip offset (a, b in units of R). Monotonic in the
 * speed; at a given speed an off-centre tip sheds up to 2.5 times a centre hit.
 */
export function dustAmount(v0, a, b) {
  if (!fin(v0) || !fin(a) || !fin(b)) return 0;
  const sp = clamp((v0 - V_SOFT) / (V_HARD - V_SOFT), 0, 1);
  const slip = clamp(Math.hypot(a, b) / OFF_FULL, 0, 1);
  return clamp(Math.pow(sp, 1.25) * (1 + 1.5 * slip * slip), 0, 1);
}

/**
 * The strike of a shot record as the dust needs it, or null when the record has none that can be drawn (no Strike event
 * among its first events, a ball that is not in the initial state, a number that is not finite, an offset outside the ball).
 * Reads the record only; returns a frozen plain object in world axes.
 */
export function strikeOf(record, { bedY = 0 } = {}) {
  try {
    const events = record?.events;
    const shot = record?.shot;
    if (!Array.isArray(events) || !shot || typeof shot !== 'object') return null;
    let ev = null;
    for (let i = 0; i < events.length && i < 4 && !ev; i++) { const k = events[i]?.kind; if (k && typeof k === 'object' && k.Strike && typeof k.Strike === 'object') ev = events[i]; }
    if (!ev) return null;
    const t0 = Number(ev.t);
    const id = ev.kind.Strike.ball;
    const balls = record?.initial?.balls;
    if (!Array.isArray(balls)) return null;
    const ball = balls.find((q) => q && q.id === id);
    const kp = ball?.state?.pos;
    const R = Number(ball?.params?.r);
    const v0 = Number(shot.v0), phi = Number(shot.phi), theta = Number(shot.theta), a = Number(shot.a), b = Number(shot.b);
    if (!kp || !fin(t0) || !fin(kp.x) || !fin(kp.y) || !(R > 0) || !fin(R)) return null;
    if (!fin(v0) || !fin(phi) || !fin(theta) || !fin(a) || !fin(b) || !(v0 > 0)) return null;
    if (!(theta >= 0 && theta < Math.PI / 2)) return null;
    const off2 = a * a + b * b;
    if (!(off2 < 1)) return null;
    const h = fin(kp.z) ? kp.z : R;
    const c = [kp.y, h, kp.x];                                   // kernel (x, y, z) -> three (y, z, x)
    const dx = Math.sin(phi), dz = Math.cos(phi);                // strike direction on the plane
    const ct = Math.cos(theta), st = Math.sin(theta);
    const right = [-dz, 0, dx];                                  // forward x up: the shooter's right
    const fwd = [dx * ct, -st, dz * ct];                         // tip -> ball along the (elevated) cue
    const up = [dx * st, ct, dz * st];                           // the elevated up of the tip frame
    const depth = Math.sqrt(1 - off2);
    const n = [0, 0, 0], p = [0, 0, 0];
    for (let k = 0; k < 3; k++) { n[k] = right[k] * a + up[k] * b - fwd[k] * depth; p[k] = c[k] + n[k] * R; }
    // tangent frame at the contact: e1 = the shooter's right made perpendicular to n, e2 = n x e1
    let e1 = [0, 0, 0];
    const rn = right[0] * n[0] + right[1] * n[1] + right[2] * n[2];
    for (let k = 0; k < 3; k++) e1[k] = right[k] - n[k] * rn;
    let l = Math.hypot(e1[0], e1[1], e1[2]);
    if (!(l > 1e-6)) { const un = up[0] * n[0] + up[1] * n[1] + up[2] * n[2]; for (let k = 0; k < 3; k++) e1[k] = up[k] - n[k] * un; l = Math.hypot(e1[0], e1[1], e1[2]); }
    e1 = [e1[0] / l, e1[1] / l, e1[2] / l];
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    // the skid: where the tip slides over the ball, outward from the ball's centre line, in the tangent plane
    const off = Math.sqrt(off2);
    const skid = [0, 0, 0];
    if (off > 1e-4) {
      const o = [0, 0, 0];
      let on = 0;
      for (let k = 0; k < 3; k++) { o[k] = right[k] * a + up[k] * b; on += o[k] * n[k]; }
      let sl = 0;
      for (let k = 0; k < 3; k++) { skid[k] = o[k] - n[k] * on; sl += skid[k] * skid[k]; }
      sl = Math.sqrt(sl);
      if (sl > 1e-9) for (let k = 0; k < 3; k++) skid[k] /= sl; else skid.fill(0);
    }
    for (const v of [...c, ...p, ...n, ...e1, ...e2, ...skid]) if (!fin(v)) return null;
    let seed = 0x811c9dc5;
    for (const x of [v0, phi, theta, a, b, shot.seed, kp.x, kp.y, h, id, t0, DUST_LAW_VERSION]) seed = mixNumber(seed, x);
    const last = Number(events[events.length - 1]?.t);
    return Object.freeze({
      t0, ballId: id, R, v0, a, b, theta, phi, off, slip: clamp(off / OFF_FULL, 0, 1), amount: dustAmount(v0, a, b),
      c: Object.freeze(c), p: Object.freeze(p), n: Object.freeze(n), fwd: Object.freeze(fwd), right: Object.freeze(right), up: Object.freeze(up),
      e1: Object.freeze(e1), e2: Object.freeze(e2), skid: Object.freeze(skid),
      seed: seed >>> 0, bedY: fin(bedY) ? bedY : 0,
      // the shot's own length after the strike: the playback clock stops there, so the cloud must be gone by then
      span: fin(last) && last > t0 ? last - t0 : 0,
      // identity of the strike for a cache: two records with the same key give the same cloud
      key: `${seed >>> 0}:${t0}:${id}`,
    });
  } catch { return null; }
}

// ---- the cloud ---------------------------------------------------------------------------------------------------------------
/** How many particles a strike gets out of `count` (the tier's ceiling): 0 for a strike that sheds nothing. */
export function liveCount(amount, count) {
  const cap = clamp(Math.floor(Number(count) || 0), 0, COUNT_MAX);
  if (!(amount >= AMOUNT_MIN) || cap <= 0) return 0;
  return Math.max(1, Math.min(cap, Math.ceil(cap * (0.12 + 0.88 * amount))));
}

/**
 * The per-particle constants of one strike: `{ n, params, strike, ... }`. `count` is the tier's ceiling (tiers.js
 * `motionDust`). Particle i draws its numbers from its own stream (seed, i), so the first k particles of a cloud move
 * the same way for every ceiling >= k: a lower tier shows a subset of the same cloud (each particle a little larger and
 * denser, see `few`), not another cloud.
 */
export function buildCloud(strike, count) {
  if (!strike || typeof strike !== 'object') return null;
  const n = liveCount(strike.amount, count);
  if (n <= 0) return null;
  const { amount, slip, v0, n: N, fwd, e1, e2, skid } = strike;
  const sp = clamp((v0 - V_SOFT) / (V_HARD - V_SOFT), 0, 1);
  const reach = 0.35 + 0.5 * sp;                     // how far the jump carries, by the speed
  // a ceiling under the reference (a lower tier): each particle a little larger and denser. By the ceiling, not by this
  // strike's own count: a weak strike has fewer particles AND is thinner
  const few = clamp(COUNT_REF / clamp(Math.floor(Number(count) || 0), 1, COUNT_MAX), 1, 4);
  const sizeK = Math.pow(few, 0.3), alphaK = Math.pow(few, 0.45);
  const gain = Math.pow(amount, 0.6);
  const params = new Float32Array(n * STRIDE);
  // the ring does not leave evenly: most of it goes out in a few fingers (a burst), the rest fills in between
  const wr = stream(mix32(strike.seed, 0x51ed270b));
  const wisps = [];
  for (let w = 0; w < WISPS; w++) wisps.push({ az: 2 * Math.PI * (w + 0.85 * wr()) / WISPS, beta: 4 + 46 * wr() ** 2, s: 0.5 + 0.5 * wr(), tau: 0.02 + 0.03 * wr() });
  for (let i = 0; i < n; i++) {
    const rnd = stream(mix32(mix32(strike.seed, i + 1), 0x9e3779b9));
    const o = i * STRIDE;
    const fam = rnd();
    const u1 = rnd(), u2 = rnd(), u3 = rnd(), u4 = rnd(), u5 = rnd(), u6 = rnd(), u7 = rnd(), u8 = rnd(), u9 = rnd(), u10 = rnd(), u11 = rnd(), u12 = rnd(), u13 = rnd();
    const u14 = rnd(), u15 = rnd(), u16 = rnd();
    let az = 2 * Math.PI * u1, ca = Math.cos(az), sa = Math.sin(az);
    let d = [0, 0, 0], s = 0, tauD = 0.03, wake = 0, start = [0, 0, 0], family = 0, coarse = u4 * u4;
    let taper = 1, thinEnd = 1;   // a finger thins out toward its end: smaller and fainter particles there
    if (fam < 0.56) {
      // ring: near the tangent plane of the ball at the contact, opening away from the ball; leaning into the skid
      family = 0;
      let beta = 5 + 50 * u2 * u2;
      s = (0.010 + 0.044 * Math.pow(u5, 1.5)) * reach * (1 + 0.4 * slip);
      tauD = 0.018 + 0.04 * u6;
      if (u14 < WISP_SHARE) {
        // one of the fingers: its direction and pace, this particle somewhere along it
        const w = wisps[Math.min(WISPS - 1, Math.floor(u1 * WISPS))];
        az = w.az + 0.5 * (u15 - 0.5); ca = Math.cos(az); sa = Math.sin(az);
        taper = 1 - 0.5 * u5; thinEnd = 1 - 0.6 * u5;
        beta = w.beta + 9 * (u16 - 0.5);
        s = (0.012 + 0.046 * w.s * (0.25 + 0.75 * u5)) * reach * (1 + 0.4 * slip);
        tauD = w.tau * (0.85 + 0.3 * u6);
      }
      const cb = Math.cos(beta * Math.PI / 180), sb = Math.sin(beta * Math.PI / 180);
      const lean = slip * (0.6 + 0.9 * u3);
      for (let k = 0; k < 3; k++) d[k] = cb * (ca * e1[k] + sa * e2[k]) + sb * N[k] + lean * skid[k];
      wake = 0.010 * sp * u7;
      for (let k = 0; k < 3; k++) start[k] = 0.004 * (ca * e1[k] + sa * e2[k]) + 0.001 * N[k];
    } else if (fam < 0.84) {
      // wake: forward along the cue's line, off the rim of the tip, round the shaft that follows through
      family = 1;
      const rim = 0.007 + 0.007 * u2;
      const spread = 0.25 + 0.5 * u3;
      for (let k = 0; k < 3; k++) d[k] = fwd[k] + spread * (ca * e1[k] + sa * e2[k]) + 0.3 * slip * skid[k];
      tauD = 0.03 + 0.05 * u6;
      s = (0.012 + 0.05 * Math.pow(u5, 1.4)) * reach;
      // never faster than half the tip: the ball leaves faster than that, so the wake never runs into it
      s = Math.min(s, 0.5 * v0 * tauD);
      wake = 0.014 * sp * u7;
      for (let k = 0; k < 3; k++) start[k] = rim * (ca * e1[k] + sa * e2[k]) + 0.001 * N[k];
    } else {
      // core: a slow haze on the side of the contact away from the ball
      family = 2;
      const cz = Math.sqrt(u2), sz = Math.sqrt(1 - u2);
      for (let k = 0; k < 3; k++) d[k] = sz * (ca * e1[k] + sa * e2[k]) + cz * N[k] + 0.5 * slip * skid[k];
      s = (0.004 + 0.016 * u5) * (0.6 + 0.4 * reach);
      tauD = 0.03 + 0.06 * u6;
      wake = 0.006 * sp * u7;
      for (let k = 0; k < 3; k++) start[k] = 0.003 * u3 * (ca * e1[k] + sa * e2[k]) + 0.0015 * N[k];
    }
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    params[o] = d[0] / dl; params[o + 1] = d[1] / dl; params[o + 2] = d[2] / dl;
    params[o + 3] = s; params[o + 4] = tauD;
    // drift: a few centimetres a second, mostly level; every grain sinks, the coarse ones faster
    const daz = 2 * Math.PI * u8, dv = 0.006 + 0.02 * u9;
    params[o + 5] = dv * Math.cos(daz);
    params[o + 6] = -(0.004 + 0.03 * coarse) + 0.006 * (u10 - 0.5);
    params[o + 7] = dv * Math.sin(daz);
    // swirl: a slow sideways wander, zero at birth
    const saz = 2 * Math.PI * u11, samp = 0.0015 + 0.004 * u12;
    params[o + 8] = samp * Math.cos(saz); params[o + 9] = samp * 0.4 * (u13 - 0.5); params[o + 10] = samp * Math.sin(saz);
    params[o + 11] = 2.5 + 4.5 * u9;              // rad/s
    params[o + 12] = 2 * Math.PI * u10;
    params[o + 13] = wake;
    // size: born small, spreads with the square root of time; the core is the widest and thinnest
    const wide = family === 2 ? 1.5 : family === 1 ? 0.9 : 1.0;
    params[o + 14] = (0.0045 + 0.0055 * u12) * wide * sizeK * taper;         // m: radius after the jump
    params[o + 15] = (0.008 + 0.012 * u13) * wide * sizeK * (0.5 + 0.5 * taper); // m per sqrt(s)
    params[o + 16] = gain * alphaK * (family === 2 ? 0.040 + 0.030 * u7 : (0.058 + 0.064 * u7) * (1 - 0.5 * u5) * thinEnd) * (1 - 0.35 * coarse) * (1 - 0.36 * slip);
    params[o + 17] = (0.7 + 0.5 * u11) * (1 - 0.4 * coarse);                // s: coarse grains are gone first
    params[o + 18] = 0.004 * u3;                                            // s: birth spread over a few milliseconds
    params[o + 19] = u8;                                                    // the sprite's own noise seed
    params[o + 20] = start[0]; params[o + 21] = start[1]; params[o + 22] = start[2];
    params[o + 23] = family;
  }
  return { n, params, strike, amount, gain, reach, version: DUST_LAW_VERSION };
}

/** Buffers for evalCloud: `pos` (x, y, z per particle) and `data` (radius, alpha, shade, seed per particle). */
export function makeOut(count) {
  const cap = clamp(Math.floor(Number(count) || 0), 0, COUNT_MAX);
  return { pos: new Float32Array(cap * 3), data: new Float32Array(cap * 4), cap };
}

/**
 * The cloud at playback time t: writes the particles that can be seen, packed from index 0, and returns how many.
 * 0 before and at the strike, 0 from LIFE_MAX after it, 0 once the shot's own playback has ended. Pure in (cloud, t).
 */
export function evalCloud(cloud, t, out) {
  if (!cloud || !out) return 0;
  const sk = cloud.strike;
  const tau = Number(t) - sk.t0;
  if (!(tau > 0) || !(tau < LIFE_MAX)) return 0;
  // a shot shorter than the cloud's life: the clock stops at its end, so the cloud leaves with it
  let shot = 1;
  if (sk.span < LIFE_MAX) { if (!(tau < sk.span)) return 0; shot = 1 - smooth(0.5 * sk.span, sk.span, tau); }
  const P = cloud.params, p0 = sk.p, f = sk.fwd, bed = sk.bedY, pos = out.pos, data = out.data;
  const n = Math.min(cloud.n, out.cap);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    const q = tau - P[o + 18];
    const life = P[o + 17];
    if (!(q > 0) || !(q < life)) continue;
    const jump = P[o + 3] * (1 - Math.exp(-q / P[o + 4]));
    const drag = P[o + 13] * (1 - Math.exp(-q / 0.18));
    const sw = Math.sin(P[o + 11] * q + P[o + 12]) - Math.sin(P[o + 12]);
    const rad = P[o + 14] * (0.4 + 0.6 * (1 - Math.exp(-q / 0.025))) + P[o + 15] * Math.sqrt(q);
    // thinning: the same dust over a wider disc
    const thin = Math.pow(P[o + 14] / rad, 1.3);
    // the rise is as slow as the jump: while the cloud is still a centimetre wide it is thin, so it never hides the ball
    let alpha = P[o + 16] * (1 - Math.exp(-q / 0.022)) * (1 - smooth(0.35 * life, life, q)) * Math.min(1, thin) * shot;
    const x = p0[0] + P[o + 20] + P[o] * jump + P[o + 5] * q + f[0] * drag + P[o + 8] * sw;
    let y = p0[1] + P[o + 21] + P[o + 1] * jump + P[o + 6] * q + f[1] * drag + P[o + 9] * sw;
    const z = p0[2] + P[o + 22] + P[o + 2] * jump + P[o + 7] * q + f[2] * drag + P[o + 10] * sw;
    // dust that would be under the cloth has landed on it: it stays just above the bed and leaves the air
    const floor = bed + BED_CLEAR + 0.35 * rad;
    if (y < floor) { alpha *= 1 - smooth(0, LAND_DEPTH, floor - y); y = floor; }
    if (alpha > ALPHA_CAP) alpha = ALPHA_CAP;
    if (!(alpha >= ALPHA_MIN)) continue;
    const k3 = m * 3, k4 = m * 4;
    pos[k3] = x; pos[k3 + 1] = y; pos[k3 + 2] = z;
    data[k4] = rad; data[k4 + 1] = alpha;
    // lit from above: the upper part of the cloud is a little brighter than what hangs under it
    data[k4 + 2] = 0.8 + 0.2 * clamp((y - p0[1]) / 0.05 + 0.5, 0, 1);
    data[k4 + 3] = P[o + 19];
    m += 1;
  }
  return m;
}

/** True when a cloud of this strike has anything to draw at t (the cheap test before evalCloud). */
export function aliveAt(strike, t) {
  if (!strike) return false;
  const tau = Number(t) - strike.t0;
  return tau > 0 && tau < LIFE_MAX && (strike.span >= LIFE_MAX || tau < strike.span);
}
