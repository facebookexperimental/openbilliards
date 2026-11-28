// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-dust.mjs - node arm for the chalk dust part of the club look (CONTRACT.md section 12; motion/dust.js and
// motion/dust/*). It checks the laws of round 4 for this part:
//   - the strike's geometry against the cue pose it mirrors (cuestick.js poseCue with the contact pull of cuestrike.js);
//   - purity in time: the cloud at t is the same numbers whatever was evaluated before, and the same for a rebuilt cloud;
//   - nothing before the strike, nothing after the cloud's life, nothing once a short shot has ended;
//   - particle count bounds for every ceiling; the amount law (soft: nothing, hard: a full puff, off-centre: more);
//   - readability: how opaque the cloud can get in front of the cue ball, as a number;
//   - no Math.random, no clock, no listener, no write to the game, no depth texture, no instanced mesh (text and run time);
//   - the part's contract toward motion.js: update never throws, hides on anything it cannot draw, switches itself off
//     on an internal error; the same buffer for the same t in any order;
//   - law 4: the ball return's furniture walk does not take the mesh, and the app's env-bake rule hides it.
// Run: node web/tools/club/test-club-dust.mjs   (add --stats to print the opacity table)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  strikeOf, buildCloud, evalCloud, makeOut, aliveAt, dustAmount, liveCount, stream,
  LIFE_MAX, AMOUNT_MIN, COUNT_MAX, COUNT_REF, STRIDE, ALPHA_MIN, ALPHA_CAP, BED_CLEAR, V_SOFT, V_HARD, DUST_LAW_VERSION,
} from '../../scene/club/motion/dust/law.js';
import { polygonFormFactor, lightAt, dustColour, FALLBACK_LIGHT, DUST_ALBEDO, LIT_MAX } from '../../scene/club/motion/dust/light.js';
import { createWarm, lightSetSignature } from '../../scene/club/motion/dust/warm.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const okAsync = async (name, fn) => { await fn(); n += 1; console.log(`OK ${name}`); };
const STATS = process.argv.includes('--stats');
const here = fileURLToPath(new URL('.', import.meta.url));
const web = `${here}../../`;
const read = (rel) => fs.readFileSync(`${web}${rel}`, 'utf8');

const R = 0.028575;
function record({ v0 = 6, a = 0, b = 0, theta = 0.03, phi = Math.PI / 2, seed = 7, x = 0.1, y = -0.55, dur = 6, t0 = 0, id = 0 } = {}) {
  return {
    kernel_version: 'test', format_version: 1,
    shot: { v0, phi, theta, a, b, seed },
    initial: { balls: [{ id: 3, params: { r: R }, state: { pos: { x: 0.4, y: 0.4, z: R } } }, { id, params: { r: R }, state: { pos: { x, y, z: R } } }] },
    events: [{ t: t0, kind: { Strike: { ball: id } }, post: [] }, { t: t0 + 0.2, kind: { Transition: { ball: id, from: 'Sliding', to: 'Rolling' } }, post: [] }, { t: t0 + dur, kind: 'Rest', post: [] }],
  };
}
const CASES = {
  hard: { v0: 7.5 }, medium: { v0: 3.5 }, softish: { v0: 2 }, side: { v0: 7.5, a: 0.45 }, draw: { v0: 5.5, b: -0.45 }, follow: { v0: 5.5, b: 0.4 },
  brk: { v0: 11, b: 0.05 }, jack: { v0: 6, a: 0.2, b: -0.3, theta: 0.5 }, max: { v0: 15, a: 0.35, b: -0.35 },
};
const snapshot = (out, m) => ({ m, pos: Float32Array.from(out.pos.subarray(0, m * 3)), data: Float32Array.from(out.data.subarray(0, m * 4)) });
const same = (a, b) => a.m === b.m && a.pos.every((v, i) => Object.is(v, b.pos[i])) && a.data.every((v, i) => Object.is(v, b.data[i]));

// composite opacity along a view direction: the particles projected on the plane across `view`, 1 mm cells, each a soft
// disc alpha * (1 - r^2)^2 (the shader's blob is this disc with its rim pulled in by a noise, so never more), composited "over"
function composite(out, m, view, centre, half = 0.14, cell = 0.001) {
  const up0 = Math.abs(view[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const rx = [view[1] * up0[2] - view[2] * up0[1], view[2] * up0[0] - view[0] * up0[2], view[0] * up0[1] - view[1] * up0[0]];
  const rl = Math.hypot(...rx); for (let k = 0; k < 3; k++) rx[k] /= rl;
  const uy = [rx[1] * view[2] - rx[2] * view[1], rx[2] * view[0] - rx[0] * view[2], rx[0] * view[1] - rx[1] * view[0]];
  const N = Math.round(2 * half / cell);
  const T = new Float32Array(N * N).fill(1);
  for (let i = 0; i < m; i++) {
    const d = [out.pos[i * 3] - centre[0], out.pos[i * 3 + 1] - centre[1], out.pos[i * 3 + 2] - centre[2]];
    const px = d[0] * rx[0] + d[1] * rx[1] + d[2] * rx[2], py = d[0] * uy[0] + d[1] * uy[1] + d[2] * uy[2];
    const r = out.data[i * 4], a = out.data[i * 4 + 1];
    const x0 = Math.max(0, Math.floor((px - r + half) / cell)), x1 = Math.min(N - 1, Math.ceil((px + r + half) / cell));
    const y0 = Math.max(0, Math.floor((py - r + half) / cell)), y1 = Math.min(N - 1, Math.ceil((py + r + half) / cell));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ux = ((x + 0.5) * cell - half - px) / r, vy = ((y + 0.5) * cell - half - py) / r;
      const r2 = ux * ux + vy * vy; if (r2 >= 1) continue;
      T[y * N + x] *= 1 - a * (1 - r2) * (1 - r2);
    }
  }
  let max = 0, over10 = 0, mass = 0;
  for (let k = 0; k < T.length; k++) { const o = 1 - T[k]; if (o > max) max = o; if (o > 0.1) over10 += 1; mass += o; }
  return { max, area10: over10 * cell * cell * 1e4, mass: mass * cell * cell * 1e4 };
}

// ---- the strike ------------------------------------------------------------------------------------------------------------------
ok('strike: the contact point is the tip face of the cue pose (poseCue + the contact pull), for centre, side, draw and an elevated cue', () => {
  const TIP_GAP = 0.010;
  for (const s of [{}, { a: 0.4 }, { b: -0.45 }, { a: -0.3, b: 0.35, theta: 0.6 }, { phi: 2.1, a: 0.2, b: 0.1, theta: 0.2 }, { phi: -0.7 }]) {
    const rec = record({ v0: 5, ...s });
    const sk = strikeOf(rec);
    const { phi, theta, a, b } = rec.shot;
    // poseCue, line by line: dirV, axis = dirV x up, the group position at pull = pC (the tip face)
    const d = [Math.sin(phi), 0, Math.cos(phi)];
    const axis = [-d[2], 0, d[0]];
    const pC = -(TIP_GAP + (1 - Math.sqrt(1 - a * a - b * b)) * R);
    const gap = TIP_GAP + pC, cosT = Math.cos(theta), sinT = Math.sin(theta);
    const c = [rec.initial.balls[1].state.pos.y, R, rec.initial.balls[1].state.pos.x];
    const tipFace = [0, 1, 2].map((k) => c[k] - d[k] * (R + gap) * cosT + (k === 1 ? 1 : 0) * (R + gap) * sinT + axis[k] * a * R + (k === 1 ? 1 : 0) * b * R * cosT + d[k] * b * R * sinT);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(sk.p[k] - tipFace[k]) < 1e-12, `contact ${k}: ${sk.p[k]} against the pose ${tipFace[k]}`);
    // on the ball's surface, and the normal is unit and points from the centre to the contact
    assert.ok(Math.abs(Math.hypot(sk.p[0] - c[0], sk.p[1] - c[1], sk.p[2] - c[2]) - R) < 1e-12);
    assert.ok(Math.abs(Math.hypot(...sk.n) - 1) < 1e-12);
    // the tangent frame is orthonormal and across n; the skid lies in it and points to the side of the offset
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    assert.ok(Math.abs(dot(sk.e1, sk.n)) < 1e-12 && Math.abs(dot(sk.e2, sk.n)) < 1e-12 && Math.abs(dot(sk.e1, sk.e2)) < 1e-12);
    if (a || b) { assert.ok(Math.abs(dot(sk.skid, sk.n)) < 1e-9); assert.ok(dot(sk.skid, [0, 1, 2].map((k) => sk.right[k] * a + sk.up[k] * b)) > 0); } else assert.deepEqual([...sk.skid], [0, 0, 0]);
  }
});

ok('strike: the mirrored source lines are still in cuestick.js and cuestrike.js (a change there must be read again)', () => {
  const stick = read('scene/cuestick.js'), strike = read('app/cuestrike.js'), coords = read('app/coords.js');
  for (const line of ['.addScaledVector(dirV, -(ballR + gap) * cosT)', '.addScaledVector(up, (ballR + gap) * sinT)', '.addScaledVector(axis, a * ballR)', '.addScaledVector(up, b * ballR * cosT)', '.addScaledVector(dirV, b * ballR * sinT);', 'axis.copy(dirV).cross(up).normalize();', 'const TIP_GAP = 0.010;']) assert.ok(stick.includes(line), `cuestick.js no longer has: ${line}`);
  assert.ok(strike.includes('const pC = -(TIP_GAP + sOff);') && strike.includes('const sOff = (1 - Math.sqrt(1 - off2)) * BALL_R;'));
  assert.ok(coords.includes('return out.set(ky, kz, kx);') && coords.includes('return { x: Math.sin(phi), z: Math.cos(phi) };'));
});

ok('strike: a record that cannot be drawn gives null (no strike event, a missing ball, a number that is not finite, an offset outside the ball)', () => {
  assert.equal(strikeOf(null), null); assert.equal(strikeOf({}), null); assert.equal(strikeOf({ events: [], shot: {} }), null);
  const r = record();
  assert.ok(strikeOf(r));
  for (const edit of [
    (q) => { q.events[0].kind = 'Rest'; }, (q) => { q.events[0].kind = { Strike: { ball: 9 } }; }, (q) => { q.shot.v0 = NaN; }, (q) => { q.shot.v0 = 0; },
    (q) => { q.shot.a = 0.8; q.shot.b = 0.7; }, (q) => { q.shot.theta = 2; }, (q) => { q.events[0].t = Infinity; }, (q) => { q.initial.balls[1].state.pos.x = NaN; },
    (q) => { q.initial.balls[1].params.r = 0; }, (q) => { delete q.initial; }, (q) => { q.shot = null; }, (q) => { q.events = 'x'; },
  ]) { const q = record(); edit(q); assert.equal(strikeOf(q), null); }
  // the strike is looked for among the first events only, and its own time is used (not zero)
  const late = record({ t0: 0.5 });
  assert.equal(strikeOf(late).t0, 0.5);
});

// ---- the amount law --------------------------------------------------------------------------------------------------------------
ok('amount: nothing for a soft touch, a full puff at a break, monotonic in the speed, more off centre', () => {
  assert.equal(dustAmount(V_SOFT, 0, 0), 0);
  assert.ok(dustAmount(1.0, 0, 0) < AMOUNT_MIN, 'a 1 m/s touch sheds nothing that is drawn');
  assert.equal(buildCloud(strikeOf(record({ v0: 1.0 })), 160), null);
  assert.ok(dustAmount(1.5, 0, 0) < 0.08);
  assert.equal(dustAmount(V_HARD, 0, 0), 1); assert.equal(dustAmount(15, 0, 0), 1);
  let last = -1;
  for (let v = 0.1; v <= 15; v += 0.1) { const a = dustAmount(v, 0, 0); assert.ok(a >= last); last = a; }
  for (const v of [2, 3.5, 5, 7]) { assert.ok(dustAmount(v, 0.45, 0) > 1.8 * dustAmount(v, 0, 0) || dustAmount(v, 0.45, 0) === 1); const lo = dustAmount(v, 0, -0.2), hi = dustAmount(v, 0, -0.45); assert.ok(hi > lo || (hi === 1 && lo === 1)); }
  for (const bad of [NaN, Infinity, undefined]) assert.equal(dustAmount(bad, 0, 0), 0);
  // what reaches the eye: the opacity mass (sum of alpha x disc area) at 0.1 s
  const massOf = (s) => { const c = buildCloud(strikeOf(record(s)), 160); if (!c) return 0; const out = makeOut(160); const m = evalCloud(c, 0.1, out); let k = 0; for (let i = 0; i < m; i++) k += out.data[i * 4 + 1] * out.data[i * 4] ** 2; return k; };
  const hard = massOf({ v0: 7.5 }), medium = massOf({ v0: 3.5 }), softish = massOf({ v0: 1.5 }), side = massOf({ v0: 3.5, a: 0.45 });
  assert.ok(hard > 3 * medium && medium > 4 * softish && softish > 0, `hard ${hard}, medium ${medium}, 1.5 m/s ${softish}`);
  assert.ok(hard > 25 * softish, 'a hard hit sheds at least 25 times a 1.5 m/s one');
  assert.ok(side > 1.6 * medium, 'the same speed with side sheds more');
});

// ---- counts ----------------------------------------------------------------------------------------------------------------------
ok('counts: never more particles than the ceiling, never more than COUNT_MAX, none for a ceiling of 0; fewer for a weaker strike', () => {
  for (const count of [0, 1, 24, 64, 160, 400, 1000, -5, NaN]) {
    for (const s of Object.values(CASES)) {
      const sk = strikeOf(record(s));
      const cloud = buildCloud(sk, count);
      const cap = Math.max(0, Math.min(COUNT_MAX, Math.floor(Number(count) || 0)));
      if (cap === 0) { assert.equal(cloud, null); continue; }
      assert.ok(cloud.n >= 1 && cloud.n <= cap, `${cloud.n} of ${cap}`);
      assert.equal(cloud.n, liveCount(sk.amount, count));
      assert.equal(cloud.params.length, cloud.n * STRIDE);
      const out = makeOut(count);
      assert.ok(out.cap <= COUNT_MAX);
      for (const tau of [0.004, 0.03, 0.2, 0.6, 1.0]) assert.ok(evalCloud(cloud, tau, out) <= cloud.n);
    }
  }
  assert.ok(liveCount(1, 160) === 160 && liveCount(0.3, 160) < 64 && liveCount(AMOUNT_MIN / 2, 160) === 0);
  assert.ok(COUNT_REF <= COUNT_MAX && COUNT_MAX <= 400, 'a few hundred particles at most');
  // a smaller buffer than the cloud: only what fits is written
  const cloud = buildCloud(strikeOf(record({ v0: 8 })), 160), small = makeOut(10);
  assert.ok(evalCloud(cloud, 0.1, small) <= 10);
});

ok('counts: a lower ceiling shows the same motion with fewer particles (particle i has its own stream)', () => {
  const sk = strikeOf(record({ v0: 8, a: 0.2 }));
  const a = buildCloud(sk, 64), b = buildCloud(sk, 160);
  assert.ok(a.n < b.n);
  // direction, reach, time constant, drift, swirl, wake, life, delay, seed, start: the same; size and opacity are scaled
  for (let i = 0; i < a.n; i++) for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 23]) assert.equal(a.params[i * STRIDE + k], b.params[i * STRIDE + k]);
  assert.ok(a.params[14] > b.params[14] && a.params[16] > b.params[16], 'fewer particles are each a little larger and denser');
});

// ---- time ------------------------------------------------------------------------------------------------------------------------
ok('time: nothing before the strike or at it, nothing from LIFE_MAX after it, for every strike and a strike that is not at zero', () => {
  for (const t0 of [0, 0.5, 12.25]) for (const s of Object.values(CASES)) {
    const sk = strikeOf(record({ ...s, t0 }));
    const cloud = buildCloud(sk, 160), out = makeOut(160);
    for (const t of [t0 - 1e9, t0 - 5, t0 - 0.02, t0 - 1e-9, t0, t0 + LIFE_MAX, t0 + LIFE_MAX + 1e-9, t0 + 3, t0 + 1e9, NaN, Infinity, -Infinity]) {
      assert.equal(evalCloud(cloud, t, out), 0, `t = ${t}`);
      // the cheap test agrees, except within rounding of the last instant (t0 + LIFE_MAX - t0 may round under LIFE_MAX)
      if (!(Math.abs(t - t0 - LIFE_MAX) < 1e-6)) assert.equal(aliveAt(sk, t), false, `aliveAt(${t})`);
    }
    assert.ok(evalCloud(cloud, t0 + 0.05, out) > 0);
    assert.ok(aliveAt(sk, t0 + 0.05));
    // the cloud is gone in about a second: nothing of note is left at 0.9 s, and nothing at all at 1.1 s
    const late = evalCloud(cloud, t0 + 0.9, out);
    let a = 0; for (let i = 0; i < late; i++) a = Math.max(a, out.data[i * 4 + 1]);
    assert.ok(a < 0.012, `largest opacity at 0.9 s is ${a}`);
    assert.equal(evalCloud(cloud, t0 + 1.1, out), 0);
    // and it is there for a fraction of a second: at 0.4 s a third of its particles at least are still in the air (a
    // draw shot's plume goes down into the cloth and lands: the fewest)
    assert.ok(evalCloud(cloud, t0 + 0.4, out) >= 0.33 * cloud.n);
  }
});

ok('time: a shot shorter than the cloud ends with no cloud (the clock stops at the last event)', () => {
  const sk = strikeOf(record({ v0: 7, dur: 0.5 }));
  assert.equal(sk.span, 0.5);
  const cloud = buildCloud(sk, 160), out = makeOut(160);
  assert.ok(evalCloud(cloud, 0.1, out) > 0);
  assert.equal(evalCloud(cloud, 0.5, out), 0); assert.equal(evalCloud(cloud, 0.7, out), 0);
  let prev = Infinity;
  for (const t of [0.3, 0.4, 0.45, 0.49]) { const m = evalCloud(cloud, t, out); let a = 0; for (let i = 0; i < m; i++) a += out.data[i * 4 + 1]; assert.ok(a <= prev); prev = a; }
  assert.ok(prev < 0.02, 'almost nothing just before the end');
  assert.equal(evalCloud(buildCloud(strikeOf(record({ v0: 7, dur: 0 })), 160), 0.01, out), 0);
});

ok('time: pure in t. Any order, any history, a rebuilt cloud: the same numbers, bit for bit', () => {
  const rnd = stream(12345);
  for (const s of [CASES.hard, CASES.side, CASES.jack]) {
    const rec = record({ ...s, t0: 0.25 });
    const cloud = buildCloud(strikeOf(rec), 160), out = makeOut(160);
    const times = [];
    for (let i = 0; i < 40; i++) times.push(0.25 + rnd() * 1.3 - 0.05);
    const first = times.map((t) => snapshot(out, evalCloud(cloud, t, out)));
    // backwards
    for (let i = times.length - 1; i >= 0; i--) assert.ok(same(first[i], snapshot(out, evalCloud(cloud, times[i], out))));
    // shuffled, with other times in between, the same time twice in a row
    for (let k = 0; k < 200; k++) {
      const i = Math.floor(rnd() * times.length);
      evalCloud(cloud, 0.25 + rnd() * 2 - 0.5, out);
      assert.ok(same(first[i], snapshot(out, evalCloud(cloud, times[i], out))));
      assert.ok(same(first[i], snapshot(out, evalCloud(cloud, times[i], out))));
    }
    // a cloud built again from a copy of the record, into another buffer
    const again = buildCloud(strikeOf(JSON.parse(JSON.stringify(rec))), 160), out2 = makeOut(160);
    assert.deepEqual(again.params, cloud.params);
    for (let i = 0; i < times.length; i++) assert.ok(same(first[i], snapshot(out2, evalCloud(again, times[i], out2))));
    // the cloud is not changed by being evaluated
    assert.deepEqual(buildCloud(strikeOf(rec), 160).params, cloud.params);
  }
});

ok('seed: fixed per shot; another shot is another cloud, the same shot the same cloud', () => {
  const a = strikeOf(record({ v0: 6 })), b = strikeOf(record({ v0: 6 })), c = strikeOf(record({ v0: 6, seed: 8 })), d = strikeOf(record({ v0: 6.0001 })), e = strikeOf(record({ v0: 6, x: 0.11 }));
  assert.equal(a.seed, b.seed); assert.equal(a.key, b.key);
  assert.ok(a.seed !== c.seed && a.seed !== d.seed && a.seed !== e.seed);
  assert.ok(Number.isInteger(a.seed) && a.seed >= 0 && a.seed <= 0xffffffff);
  assert.notDeepEqual(buildCloud(a, 64).params, buildCloud(c, 64).params);
  const s1 = stream(42), s2 = stream(42);
  for (let i = 0; i < 100; i++) { const v = s1(); assert.equal(v, s2()); assert.ok(v >= 0 && v < 1); }
});

// ---- shape -----------------------------------------------------------------------------------------------------------------------
ok('shape: every number finite; above the bed; a few centimetres wide; opacities under the cap; the cloud leaves away from the ball', () => {
  for (const [name, s] of Object.entries(CASES)) {
    const sk = strikeOf(record(s));
    const cloud = buildCloud(sk, 160), out = makeOut(160);
    for (const v of cloud.params) assert.ok(Number.isFinite(v));
    for (const tau of [0.0005, 0.003, 0.01, 0.02, 0.05, 0.08, 0.2, 0.35, 0.5, 0.8, 1.0, 1.19]) {
      const m = evalCloud(cloud, tau, out);
      const dist = [];
      for (let i = 0; i < m; i++) {
        const x = out.pos[i * 3], y = out.pos[i * 3 + 1], z = out.pos[i * 3 + 2], r = out.data[i * 4], a = out.data[i * 4 + 1], sh = out.data[i * 4 + 2];
        for (const v of [x, y, z, r, a, sh]) assert.ok(Number.isFinite(v), `${name} tau ${tau}`);
        assert.ok(y >= sk.bedY + BED_CLEAR - 1e-6, `${name}: a particle at height ${y}`);
        assert.ok(a >= ALPHA_MIN && a <= ALPHA_CAP + 1e-6, `${name}: opacity ${a}`);
        assert.ok(r > 0.0015 && r < 0.06, `${name}: radius ${r}`);
        assert.ok(sh >= 0.8 - 1e-6 && sh <= 1 + 1e-6);
        dist.push(Math.hypot(x - sk.p[0], y - sk.p[1], z - sk.p[2]));
      }
      dist.sort((p, q2) => p - q2);
      if (m) {
        assert.ok(dist[m - 1] < 0.2, `${name}: the farthest particle is ${dist[m - 1]} m from the contact at ${tau} s`);
        assert.ok(dist[Math.floor(0.9 * (m - 1))] < 0.10, `${name}: nine in ten within 10 cm (${dist[Math.floor(0.9 * (m - 1))]})`);
      }
      // at the very start no particle is inside the cue ball: all of them sit on the outer side of the contact's tangent plane
      if (tau <= 0.0005) for (let i = 0; i < m; i++) {
        const d = (out.pos[i * 3] - sk.c[0]) ** 2 + (out.pos[i * 3 + 1] - sk.c[1]) ** 2 + (out.pos[i * 3 + 2] - sk.c[2]) ** 2;
        assert.ok(Math.sqrt(d) >= sk.R - 1e-5, `${name}: a particle starts inside the cue ball`);
      }
    }
    // the wake never outruns half the tip speed (the ball leaves faster than that)
    for (let i = 0; i < cloud.n; i++) if (cloud.params[i * STRIDE + 23] === 1) assert.ok(cloud.params[i * STRIDE + 3] / cloud.params[i * STRIDE + 4] <= 0.5 * sk.v0 + 1e-6);
  }
});

ok('shape: a hard hit grows to a few centimetres within 0.1 s and then hangs (it moves less than 2 cm between 0.2 s and 0.5 s)', () => {
  const sk = strikeOf(record(CASES.hard));
  const cloud = buildCloud(sk, 160);
  const spread = (tau) => { const out = makeOut(160); const m = evalCloud(cloud, tau, out); let s = 0; for (let i = 0; i < m; i++) s += Math.hypot(out.pos[i * 3] - sk.p[0], out.pos[i * 3 + 1] - sk.p[1], out.pos[i * 3 + 2] - sk.p[2]); return s / m; };
  const a = spread(0.005), b = spread(0.1), c = spread(0.2), d = spread(0.5);
  assert.ok(a < 0.012 && b > 0.018 && b < 0.06, `mean distance ${a} at 5 ms, ${b} at 0.1 s`);
  assert.ok(Math.abs(d - c) < 0.02 && c >= b - 1e-4, `${c} at 0.2 s, ${d} at 0.5 s`);
  // off centre: the plume leans to the side of the skid
  const side = strikeOf(record(CASES.side)), sc = buildCloud(side, 160), out = makeOut(160);
  const m = evalCloud(sc, 0.1, out);
  let lean = 0; for (let i = 0; i < m; i++) lean += (out.pos[i * 3] - side.p[0]) * side.skid[0] + (out.pos[i * 3 + 1] - side.p[1]) * side.skid[1] + (out.pos[i * 3 + 2] - side.p[2]) * side.skid[2];
  assert.ok(lean / m > 0.006, `the side hit's cloud leans ${lean / m} m into the skid`);
});

ok('readability: the cloud never hides the cue ball. Composite opacity stays under 0.55 seen from behind the cue (the aim view), under 0.78 from the side, under 0.3 in the first 5 ms', () => {
  const rows = [];
  for (const count of [160, 64]) for (const [name, s] of Object.entries(CASES)) {
    const sk = strikeOf(record(s));
    const cloud = buildCloud(sk, count), out = makeOut(count);
    let worst = 0, worstSide = 0, early = 0;
    for (const tau of [0.002, 0.005, 0.01, 0.02, 0.04, 0.08, 0.14, 0.2, 0.35, 0.5]) {
      const m = evalCloud(cloud, tau, out);
      const behind = composite(out, m, sk.fwd, sk.p), across = composite(out, m, sk.right, sk.p);
      worst = Math.max(worst, behind.max); worstSide = Math.max(worstSide, across.max);
      if (tau <= 0.005) early = Math.max(early, behind.max, across.max);
    }
    rows.push(`${name}/${count}: behind ${worst.toFixed(2)}, across ${worstSide.toFixed(2)}, first 5 ms ${early.toFixed(2)}`);
    assert.ok(worst < 0.55, `${name}/${count}: ${worst} from behind the cue`);
    assert.ok(worstSide < 0.78, `${name}/${count}: ${worstSide} from the side`);
    assert.ok(early < 0.3, `${name}/${count}: ${early} in the first 5 ms`);
  }
  if (STATS) for (const r of rows) console.log(`   ${r}`);
});

// ---- light -----------------------------------------------------------------------------------------------------------------------
ok('light: the form factor of a rectangle matches the closed form under its centre and a brute-force sum off centre; nothing from below or behind', () => {
  const rect = (cx, cy, cz, A, B) => [[cx - A, cy, cz - B], [cx + A, cy, cz - B], [cx + A, cy, cz + B], [cx - A, cy, cz + B]];
  const up = [0, 1, 0];
  for (const [A, B, h] of [[1.025, 0.33, 0.8], [0.5, 0.5, 1], [3, 2, 0.5]]) {
    const exact = (2 / Math.PI) * (A / Math.hypot(A, h) * Math.atan(B / Math.hypot(A, h)) + B / Math.hypot(B, h) * Math.atan(A / Math.hypot(B, h)));
    const f = polygonFormFactor([0, 0, 0], up, rect(0, h, 0, A, B));
    assert.ok(Math.abs(f - exact) < 1e-9, `${f} against ${exact}`);
    assert.ok(Math.abs(polygonFormFactor([0, 0, 0], up, rect(0, h, 0, A, B).reverse()) - exact) < 1e-9, 'either winding');
  }
  // off centre: sum of cos cos / (pi d^2) over small patches
  const p = [-0.55, 0.03, 0.1], A = 1.025, B = 0.33, h = 0.82;
  let sum = 0; const N = 400;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = -A + (i + 0.5) * 2 * A / N - p[0], z = -B + (j + 0.5) * 2 * B / N - p[2], y = h - p[1]; const d2 = x * x + y * y + z * z; sum += (y * y / d2) / (Math.PI * d2) * (4 * A * B / (N * N)); }
  const f = polygonFormFactor(p, up, rect(0, h, 0, A, B));
  assert.ok(Math.abs(f - sum) < 2e-4, `${f} against the sum ${sum}`);
  assert.ok(f > 0.15 && f < 0.4, 'the app lamp fills a quarter to a third of the sky over the cue ball');
  assert.equal(polygonFormFactor([0, 0, 0], up, rect(0, -1, 0, 1, 1)), 0);
  assert.equal(polygonFormFactor([0, 0, 0], up, [[0, 1, 0], [1, 1, 0]]), 0);
  const big = polygonFormFactor([0, 0, 0], up, rect(0, 0.01, 0, 100, 100));
  assert.ok(big > 0.999 && big <= 1);
  // half below the horizon: a vertical wall from the ground up
  const wall = polygonFormFactor([0, 0, 0], up, [[-50, -50, 1], [50, -50, 1], [50, 50, 1], [-50, 50, 1]]);
  assert.ok(Math.abs(wall - 0.5 * (1 - Math.cos(Math.atan2(50, 1)))) < 2e-3, `a tall wall: ${wall}`);
});

ok('light: the lamp row gives the dust the light of a matt surface; a lamp facing away gives none; no light gives the fallback colour path', () => {
  const corners = [[-1.025, 0.82, -0.33], [1.025, 0.82, -0.33], [1.025, 0.82, 0.33], [-1.025, 0.82, 0.33]];
  const row = { kind: 'rect', color: [7.6, 7.2, 6.5], corners, facing: [0, -1, 0] };
  const p = [-0.55, 0.03, 0.1];
  const l = lightAt([row, { kind: 'hemi', color: [0.05, 0.04, 0.03], ground: [0.02, 0.04, 0.02] }], p);
  const f = polygonFormFactor(p, [0, 1, 0], corners);
  assert.ok(Math.abs(l.lamp[0] - 7.6 * f) < 1e-9 && l.rects === 1);
  assert.ok(Math.abs(l.amb[0] - 0.035 / Math.PI) < 1e-12);
  assert.deepEqual(lightAt([{ ...row, facing: [0, 1, 0] }], p).lamp, [0, 0, 0]);
  assert.deepEqual(lightAt([], p).lamp, [0, 0, 0]); assert.deepEqual(lightAt(null, p).amb, [0, 0, 0]);
  assert.ok(lightAt([{ kind: 'point', color: [10, 10, 10], pos: [0, 1, 0] }], [0, 0, 0]).lamp[0] > 3);
  assert.equal(lightAt([{ kind: 'point', color: [10, 10, 10], pos: [0, -1, 0] }], [0, 0, 0]).lamp[0], 0);
  // three's falloff: a cut-off distance, a decay; a spot lights only inside its cone
  assert.equal(lightAt([{ kind: 'point', color: [10, 10, 10], pos: [0, 1, 0], distance: 0.9 }], [0, 0, 0]).lamp[0], 0);
  const near = lightAt([{ kind: 'point', color: [10, 10, 10], pos: [0, 1, 0], distance: 4, decay: 2 }], [0, 0, 0]).lamp[0];
  assert.ok(near > 3 && near < 10 / Math.PI);
  const spot = (target) => ({ kind: 'spot', color: [10, 10, 10], pos: [0, 2, 0], decay: 2, distance: 0, axis: (() => { const v = [0 - target[0], 2 - target[1], 0 - target[2]]; const n = Math.hypot(...v); return v.map((x) => x / n); })(), coneCos: Math.cos(0.3), penumbraCos: Math.cos(0.3 * 0.8) });
  assert.ok(Math.abs(lightAt([spot([0, 0, 0])], [0, 0, 0]).lamp[0] - 10 / (4 * Math.PI)) < 1e-9, 'on the axis of a spot: the point-light value');
  assert.equal(lightAt([spot([3, 0, 0])], [0, 0, 0]).lamp[0], 0, 'a spot aimed elsewhere gives nothing');
  const edge = lightAt([spot([0, 0, 0])], [2 * Math.tan(0.27), 0, 0]).lamp[0];
  assert.ok(edge > 0 && edge < 10 / (4 * Math.PI), 'in the penumbra: something, less than the axis');
  // a light that is misread or very close cannot make the puff glow: the level is held, the hue kept
  const hot = dustColour({ lamp: [40, 30, 20], amb: [9, 9, 9] });
  assert.equal(hot.held, true);
  assert.ok(Math.abs(Math.max(...hot.lamp.map((v, i) => v / DUST_ALBEDO[i])) - LIT_MAX * 0.9) < 1e-9);
  assert.ok(Math.abs(hot.lamp[0] / DUST_ALBEDO[0] / (hot.lamp[2] / DUST_ALBEDO[2]) - 2) < 1e-9);
  assert.equal(dustColour(l).held, false);
  const c = dustColour(l), fb = dustColour(FALLBACK_LIGHT);
  // pale blue-grey under a warm lamp: blue is the largest channel, red the smallest, and no channel is far from the others
  assert.ok(c.lamp[2] > c.lamp[1] && c.lamp[1] > c.lamp[0] && c.lamp[0] > 0.55 * c.lamp[2], `dust colour ${c.lamp}`);
  for (const v of [...c.lamp, ...c.amb, ...fb.lamp, ...fb.amb]) assert.ok(Number.isFinite(v) && v >= 0);
  assert.ok(DUST_ALBEDO.every((v) => v > 0.3 && v < 0.8), 'a pale dust, not a pigment');
});

// ---- the source text --------------------------------------------------------------------------------------------------------------
const SOURCES = ['scene/club/motion/dust.js', 'scene/club/motion/dust/law.js', 'scene/club/motion/dust/light.js', 'scene/club/motion/dust/warm.js'];
ok('text: no Math.random, no clock, no listener, no sampler call, no depth texture, no instanced mesh, no read-back, literal imports only', () => {
  for (const rel of SOURCES) {
    const src = read(rel);
    const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes('glsl') ? m : ''));
    for (const [what, re] of [
      ['Math.random', /Math\s*\.\s*random/], ['performance.now', /performance\s*\.\s*now/], ['Date', /\bDate\s*[.(]/], ['a timer', /\bset(Timeout|Interval)\b|requestAnimationFrame/],
      ['sampleAt', /sampleAt|\.sampler\b|game\.buf\b/], ['a listener', /\.on\s*\(|addEventListener|\.emit\s*\(/], ['the depth texture', /depthTexture/],
      ['an instanced mesh', /InstancedMesh|InstancedBufferGeometry/], ['a GPU read-back', /readRenderTargetPixels|getBufferSubData|readPixels/],
      ['a write to the game', /\bgame\s*\.\s*\w+\s*=[^=]|\.slowmo\s*=|\.clock\s*=[^=]/], ['window or document', /\bwindow\b|\bdocument\b|globalThis/],
      ['a new light or a shadow switched on', /new THREE\.\w*Light\b|castShadow\s*=\s*true|shadowMap\s*\.\s*\w+\s*=[^=]/], ['a texture', /new THREE\.\w*Texture\b|sampler2D/],
    ]) assert.ok(!re.test(code), `${rel} uses ${what}`);
    for (const m of code.matchAll(/import\s*\(([^)]*)\)/g)) assert.ok(/^\s*'[^']+'\s*$/.test(m[1]), `${rel}: a dynamic import that is not a literal`);
    assert.ok(!/[^\x00-\x7f]/.test(src), `${rel}: a character outside ASCII`);
  }
  const law = read('scene/club/motion/dust/law.js'), light = read('scene/club/motion/dust/light.js'), dust = read('scene/club/motion/dust.js');
  assert.ok(!/^\s*import\b/m.test(law) && !/^\s*import\b/m.test(light) && !/^\s*import\b/m.test(read('scene/club/motion/dust/warm.js')), 'the law, the light math and the warm-up import nothing');
  const imports = [...dust.matchAll(/^\s*import\b.*from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['./dust/law.js', './dust/light.js', './dust/warm.js', 'three']);
  // the warm-up compiles and never draws: no render call, no draw of its own in any of the files
  for (const rel of SOURCES) assert.ok(!/\.render\s*\(|drawArrays|drawElements/.test(read(rel).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), `${rel} draws`);
  assert.ok(dust.includes('depthWrite: false') && dust.includes('transparent: true') && dust.includes("name: 'club.motion.dust'"));
  assert.ok(dust.includes('#include <tonemapping_fragment>') && dust.includes('#include <colorspace_fragment>'));
  assert.ok(!/AdditiveBlending/.test(dust), 'no additive glow');
});

ok('run time: with Math.random, performance.now and Date.now booby-trapped the law still runs', () => {
  const saved = { random: Math.random, now: Date.now, perf: globalThis.performance?.now };
  Math.random = () => { throw new Error('Math.random was called'); };
  Date.now = () => { throw new Error('Date.now was called'); };
  if (globalThis.performance) globalThis.performance.now = () => { throw new Error('performance.now was called'); };
  try {
    const cloud = buildCloud(strikeOf(record(CASES.side)), 160), out = makeOut(160);
    for (const t of [0.01, 0.3, 0.02, 1.1]) evalCloud(cloud, t, out);
  } finally { Math.random = saved.random; Date.now = saved.now; if (globalThis.performance) globalThis.performance.now = saved.perf; }
});

// ---- the warm-up (the program is linked before any strike) ----------------------------------------------------------------------
// stand-ins: a renderer that records what it is asked, keeps a program list like three's `info.programs`, and "links" one
// program per (material, drawn to a target or the screen, light set) the way three keys them
function fakeRenderer({ withAsync = true, fail = 0, lightsOf = () => 0 } = {}) {
  const calls = [];
  let target = null, failures = fail;
  const r = {
    toneMapping: 4, outputColorSpace: 'srgb', shadowMap: { enabled: false, type: 1 }, info: { programs: [] }, calls,
    getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
    setRenderTarget(t, face, mip) { calls.push({ op: 'target', to: t, face, mip }); target = t; },
    compile(obj, cam, scn) {
      calls.push({ op: 'compile', obj, cam, scn, target, visible: obj.visible });
      if (failures > 0) { failures -= 1; throw new Error('compile blew up'); }
      const key = `${obj.material.name}|${target ? 'target' : 'screen'}|${lightsOf()}`;
      if (!r.info.programs.some((p) => p.key === key)) r.info.programs.push({ name: obj.material.name, key, used: [], getUniforms() { this.used.push('u'); }, getAttributes() { this.used.push('a'); } });
      return new Set([obj.material]);
    },
    render() { calls.push({ op: 'render' }); },
  };
  if (withAsync) r.compileAsync = (o, c, s) => { r.compile(o, c, s); return Promise.resolve(o); };
  return r;
}
const plainLight = (kind, extra = {}) => ({ [kind]: true, visible: true, parent: null, castShadow: false, layers: { test: () => true }, ...extra });

ok('warm-up: the signature follows what three keys a program by (lights the camera sees by kind, fog, target or screen), nothing else', () => {
  const cam = { layers: {} }, scene = { fog: null }, r = { toneMapping: 4, outputColorSpace: 'srgb', shadowMap: { enabled: false } };
  const lamp = plainLight('isRectAreaLight'), fill = plainLight('isPointLight'), hemi = plainLight('isHemisphereLight');
  const base = lightSetSignature([lamp, fill, hemi], cam, scene, r, true);
  assert.equal(lightSetSignature([hemi, lamp, fill], cam, scene, r, true), base, 'the order does not matter');
  assert.equal(lightSetSignature([lamp, fill, hemi, plainLight('isAmbientLight')], cam, scene, r, true), base, 'an ambient light is not in the key');
  assert.equal(lightSetSignature([{ ...lamp, intensity: 99, color: 'x' }, fill, hemi], cam, scene, r, true), base, 'a level or a colour is not in the key');
  const differs = (sig, what) => assert.notEqual(sig, base, what);
  differs(lightSetSignature([lamp, hemi], cam, scene, r, true), 'a light less');
  differs(lightSetSignature([lamp, { ...fill, visible: false }, hemi], cam, scene, r, true), 'a hidden light');
  differs(lightSetSignature([lamp, { ...fill, parent: { visible: false, parent: null } }, hemi], cam, scene, r, true), 'a light under a hidden group');
  differs(lightSetSignature([lamp, { ...fill, layers: { test: () => false } }, hemi], cam, scene, r, true), 'a light on a layer the camera does not see');
  differs(lightSetSignature([lamp, plainLight('isSpotLight'), hemi], cam, scene, r, true), 'another kind');
  differs(lightSetSignature([lamp, { ...fill, castShadow: true }, hemi], cam, scene, r, true), 'a shadow caster');
  differs(lightSetSignature([lamp, fill, hemi], cam, { fog: {} }, r, true), 'fog');
  differs(lightSetSignature([lamp, fill, hemi], cam, scene, r, false), 'drawn to the screen');
  // the renderer's tone map is in the key only when the scene is drawn to the screen
  assert.equal(lightSetSignature([lamp, fill, hemi], cam, scene, { ...r, toneMapping: 6 }, true), base);
  assert.notEqual(lightSetSignature([lamp, fill, hemi], cam, scene, { ...r, toneMapping: 6 }, false), lightSetSignature([lamp, fill, hemi], cam, scene, r, false));
  for (const bad of [null, undefined, 'x', [null, {}]]) assert.ok(Number.isFinite(lightSetSignature(bad, null, null, null, true)));
});

await okAsync('warm-up: one link at the build under a throw-away target, nothing drawn, what was bound is put back; a later check links again only when the light set changed', async () => {
  const lights = [plainLight('isRectAreaLight'), plainLight('isPointLight')];
  const r = fakeRenderer({ lightsOf: () => lights.filter((l) => l.visible).length });
  const object = { visible: false, material: { name: 'club.motion.dust' } }, camera = { layers: {} }, scene = { fog: null };
  const made = [];
  const warm = createWarm({ renderer: r, camera, scene, object, name: 'club.motion.dust', toTarget: true, makeTarget: () => { const t = { disposed: 0, dispose() { this.disposed += 1; } }; made.push(t); return t; } });
  assert.equal(r.info.programs.length, 0);
  assert.equal(warm.check(lights, 'build'), true);
  assert.equal(r.info.programs.length, 1, 'the program exists after the build, before any strike');
  assert.deepEqual(r.calls.map((c) => c.op), ['target', 'compile', 'target']);
  assert.equal(r.calls[0].to, made[0]);
  assert.ok(r.calls[1].obj === object && r.calls[1].cam === camera && r.calls[1].scn === scene && r.calls[1].target === made[0], 'compiled with the hidden mesh, the camera and the app scene, under the target');
  assert.equal(r.calls[1].visible, false, 'the mesh is hidden while it is compiled');
  assert.deepEqual([r.calls[2].to, r.calls[2].face, r.calls[2].mip], [null, 2, 1], 'the render target, the cube face and the mip that were bound are put back');
  assert.equal(made[0].disposed, 1);
  assert.equal(object.visible, false);
  // the first-use work is done as soon as the program is ready
  assert.equal(warm.state().ready, 0);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(warm.state().ready, 1);
  assert.deepEqual(r.info.programs[0].used, ['u', 'a']);
  // every later frame: one check, no link, no call to the renderer
  for (let i = 0; i < 500; i++) assert.equal(warm.check(lights, 'frame'), false);
  assert.equal(r.calls.length, 3); assert.equal(warm.state().links, 1); assert.equal(warm.state().checks, 501);
  // the look hides a lamp between the build and the first strike: linked again at the next check (still before the strike)
  lights[1].visible = false;
  assert.equal(warm.check(lights, 'frame'), true);
  assert.equal(r.info.programs.length, 2);
  assert.equal(warm.check(lights, 'frame'), false);
  // back to the first set: three's cache has that program, no new one
  lights[1].visible = true;
  assert.equal(warm.check(lights, 'state'), true);
  assert.equal(r.info.programs.length, 2);
  const st = warm.state();
  assert.deepEqual([st.links, st.failures, st.mine, st.lastReason, st.usable, st.toTarget], [3, 0, 2, 'state', true, true]);
  assert.ok(!r.calls.some((c) => c.op === 'render'), 'nothing was drawn');
  assert.ok(made.every((t) => t.disposed === 1) && made.length === 3);
  // once the mesh is drawn three has its program: no warm-up call while it is visible
  object.visible = true; lights[0].visible = false;
  assert.equal(warm.check(lights, 'frame'), false);
  assert.doesNotThrow(() => JSON.stringify(warm.state()));
});

await okAsync('warm-up: a page that draws to the screen compiles with no target bound; a renderer without compileAsync, a failing compile and no renderer at all', async () => {
  const lights = [plainLight('isRectAreaLight')];
  const object = { visible: false, material: { name: 'm' } }, camera = { layers: {} }, scene = { fog: null };
  // straight to the screen, nothing bound: no target call at all
  const a = fakeRenderer();
  const wa = createWarm({ renderer: a, camera, scene, object, name: 'm', toTarget: false, makeTarget: () => { throw new Error('not asked for'); } });
  assert.equal(wa.check(lights, 'build'), true);
  assert.deepEqual(a.calls.map((c) => c.op), ['compile']);
  assert.equal(a.calls[0].target, null);
  // straight to the screen while a target happens to be bound: unbound for the compile, bound again after it
  const b = fakeRenderer(); const other = { tag: 'other' };
  b.setRenderTarget(other, 0, 0); b.calls.length = 0;
  const wb = createWarm({ renderer: b, camera, scene, object, name: 'm', toTarget: false });
  assert.equal(wb.check(lights, 'build'), true);
  assert.deepEqual(b.calls.map((c) => [c.op, c.op === 'target' ? c.to : c.target]), [['target', null], ['compile', null], ['target', other]]);
  // no compileAsync: the plain compile, and the first-use work at once
  const c = fakeRenderer({ withAsync: false });
  const wc = createWarm({ renderer: c, camera, scene, object, name: 'm', toTarget: true, makeTarget: () => ({ dispose() {} }) });
  assert.equal(wc.check(lights, 'build'), true);
  assert.equal(wc.state().ready, 1); assert.deepEqual(c.info.programs[0].used, ['u', 'a']);
  // a compile that throws: no throw from check, the target is put back and disposed, three tries and then it stands down
  const notes = []; let disposed = 0;
  const d = fakeRenderer({ fail: 99 });
  const wd = createWarm({ renderer: d, camera, scene, object, name: 'm', toTarget: true, makeTarget: () => ({ dispose() { disposed += 1; } }), note: (x) => notes.push(x) });
  for (let i = 0; i < 10; i++) assert.equal(wd.check(lights, 'frame'), false);
  assert.equal(d.calls.filter((x) => x.op === 'compile').length, 3, 'three tries');
  assert.equal(d.getRenderTarget(), null); assert.equal(disposed, 3);
  assert.equal(wd.state().failures, 3); assert.match(wd.state().error, /compile blew up/); assert.equal(notes.length, 3);
  // one failure, then it works
  const e = fakeRenderer({ fail: 1 });
  const we = createWarm({ renderer: e, camera, scene, object, name: 'm', toTarget: true, makeTarget: () => ({ dispose() {} }) });
  assert.equal(we.check(lights, 'build'), false); assert.equal(we.check(lights, 'frame'), true); assert.equal(we.check(lights, 'frame'), false);
  assert.equal(e.info.programs.length, 1);
  // nothing to compile with: it stands down and says so, and never throws
  for (const args of [{}, { renderer: null, camera, scene, object }, { renderer: {}, camera, scene, object }, { renderer: fakeRenderer(), camera: null, scene, object }, undefined]) {
    const w = createWarm(args);
    assert.equal(w.check(lights, 'build'), false);
    assert.equal(w.state().usable, false); assert.equal(typeof w.state().reason, 'string');
  }
  // a target factory that is missing or throws
  const f = fakeRenderer();
  const wf = createWarm({ renderer: f, camera, scene, object, name: 'm', toTarget: true });
  assert.equal(wf.check(lights, 'build'), false); assert.equal(f.calls.length, 0); assert.match(wf.state().error, /no target factory/);
  await Promise.resolve();
});

// ---- the part, with three ----------------------------------------------------------------------------------------------------------
const nodeModule = await import('node:module');
if (typeof nodeModule.registerHooks === 'function') {
  const threeUrl = pathToFileURL(`${web}vendor/three.module.min.js`).href;
  nodeModule.registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : next(specifier, context); } });
  const THREE = await import('three');
  const { applyDust, DUST_GROUP_NAME } = await import('../../scene/club/motion/dust.js');

  // a stand-in scene: a lamp, a bed, two balls in a group, and the group motion.js would hand over
  function stage({ count = 160, withKit = true, gameOver = null, renderer = null } = {}) {
    const scene = new THREE.Scene();
    const lamp = new THREE.RectAreaLight(0xfff1da, 7.6, 2.05, 0.66); lamp.position.set(0, 0.82, 0); lamp.lookAt(0, 0, 0); scene.add(lamp);
    scene.add(new THREE.HemisphereLight(0x38301f, 0x1c2a1c, 0.22));
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.04, 1.27), new THREE.MeshBasicMaterial()); bed.position.y = -0.02; bed.name = 'bed'; scene.add(bed);
    const ballGroup = new THREE.Group(); scene.add(ballGroup);
    const geo = new THREE.SphereGeometry(R, 8, 6);
    const balls = [0, 1].map((id) => { const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); ballGroup.add(mesh); return { id, mesh, pocketed: false }; });
    balls[0].mesh.position.set(-0.55, R, 0.1); balls[1].mesh.position.set(-0.45, R, 0.1);
    scene.updateMatrixWorld(true);
    const writes = [], listens = [];
    const target = { record: null, clock: 0, duration: 6, ballSet: { balls, group: ballGroup }, cueBall: () => balls[0], activeBalls: () => balls };
    if (gameOver) Object.defineProperties(target, Object.getOwnPropertyDescriptors(gameOver)); // getters stay getters
    const game = new Proxy(target, {
      set(_t, k) { writes.push(String(k)); throw new TypeError(`write of ${String(k)}`); },
      defineProperty(_t, k) { writes.push(String(k)); throw new TypeError(`define of ${String(k)}`); },
      deleteProperty(_t, k) { writes.push(String(k)); throw new TypeError(`delete of ${String(k)}`); },
    });
    const machine = { state: 'PLAYBACK', on(ev) { listens.push(ev); return () => {}; }, emit() { listens.push('emit'); } };
    const root = new THREE.Group(); root.name = 'obAimClubMotion';
    const group = new THREE.Group(); group.name = 'obAimClubMotion.dust'; root.add(group);
    if (withKit) scene.add(root); // as motion.js does; without a kit the part makes its own group
    const notes = [];
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 60);
    const club = { tier: 'high', knobs: { motion: 'full', motionDust: count }, ctx: renderer ? { scene, machine, game, renderer, camera, composer: {} } : { scene, machine, game } };
    const kit = withKit ? Object.freeze({ key: 'dust', root: group, scene, game, machine: Object.freeze({ state: 'PLAYBACK', is: () => true }), table: () => null, knobs: club.knobs, tier: 'high', note: (s) => notes.push(s) }) : null;
    return { THREE, scene, club, kit, group, root, writes, listens, notes, balls, ballGroup, target, lamp, camera };
  }
  const meshOf = (s) => s.scene.getObjectByName('clubMotionDust');
  const play = { state: 'PLAYBACK', playback: true, tEvent: 0, duration: 6, entry: null, twoClock: false };

  await okAsync('part: one mesh under the group it is handed, hidden until a strike; nothing drawn before the strike, a cloud after it, nothing after its life', async () => {
    const s = stage();
    const part = await applyDust(s.club, s.kit);
    assert.equal(part.enabled, true);
    for (const fn of ['update', 'state', 'dispose', 'clear']) assert.equal(typeof part[fn], 'function');
    const mesh = meshOf(s);
    assert.ok(mesh && mesh.parent === s.group && s.group.children.length === 1);
    assert.equal(mesh.visible, false);
    assert.ok(mesh.isMesh && !mesh.isInstancedMesh && mesh.material.depthWrite === false && mesh.material.transparent === true && mesh.material.depthTest === true);
    assert.equal(mesh.material.blending, THREE.NormalBlending);
    assert.equal(mesh.castShadow, false);
    const rec = record({ v0: 7.5, t0: 0.5 });
    part.update(0.48, rec, play); assert.equal(mesh.visible, false); assert.equal(part.state().alive, 0);
    part.update(0.5, rec, play); assert.equal(mesh.visible, false);
    part.update(0.58, rec, play);
    assert.equal(mesh.visible, true);
    const st = part.state();
    assert.ok(st.alive > 100 && st.alive <= 160 && st.drawCalls === 1 && st.triangles === st.alive * 2 && st.samplers === 0 && st.textures === 0);
    assert.equal(mesh.geometry.drawRange.count, st.alive * 6);
    assert.equal(st.light.from, '1 rect, 0 other');
    assert.equal(st.ballsFaded, 2);
    assert.ok(st.bufferBytes < 40000);
    assert.doesNotThrow(() => JSON.stringify(st));
    part.update(0.5 + LIFE_MAX, rec, play); assert.equal(mesh.visible, false);
    part.update(0.3, rec, play); assert.equal(mesh.visible, false);     // a scrub back before the strike
    part.update(0.6, rec, play); assert.equal(mesh.visible, true);
    // outside PLAYBACK the clock stands still: no frozen cloud
    part.update(0.6, rec, { ...play, state: 'AIM', playback: false }); assert.equal(mesh.visible, false);
    // no info (a dev page): taken as playing
    part.update(0.6, rec); assert.equal(mesh.visible, true);
    part.clear(); assert.equal(mesh.visible, false);
    assert.deepEqual(s.writes, []); assert.deepEqual(s.listens, []);
  });

  await okAsync('part: the vertex buffer at t is the same bytes in any order of calls (forward, backward, with other records between)', async () => {
    const s = stage();
    const part = await applyDust(s.club, s.kit);
    const mesh = meshOf(s);
    const rec = record({ v0: 8, a: 0.3, t0: 0 }), other = record({ v0: 5, b: -0.3, t0: 0, seed: 99 });
    const grab = (t, r = rec) => {
      part.update(t, r, play);
      const cnt = mesh.geometry.drawRange.count / 6 * 4;
      if (!mesh.visible) { assert.equal(cnt, 0, 'a hidden mesh has an empty draw range'); return { vis: false }; } // nothing is drawn: nothing to compare
      return { vis: true, cnt, pos: Float32Array.from(mesh.geometry.attributes.position.array.subarray(0, cnt * 3)), data: Float32Array.from(mesh.geometry.attributes.aData.array.subarray(0, cnt * 4)),
        lamp: mesh.material.uniforms.uLamp.value.toArray(), balls: mesh.material.uniforms.uBalls.value.map((v) => v.toArray()) };
    };
    const times = [0.01, 0.02, 0.08, 0.2, 0.5, 1.0, 1.15];
    const first = times.map((t) => grab(t));
    const check = (i) => { const g = grab(times[i]); assert.deepEqual(g, first[i], `t = ${times[i]}`); };
    for (let i = times.length - 1; i >= 0; i--) check(i);
    for (const i of [3, 0, 5, 3, 3, 6, 1, 4, 2]) { grab(2.5); grab(0.07, other); grab(-1); check(i); }
    // a fresh part gives the same bytes
    const s2 = stage(), part2 = await applyDust(s2.club, s2.kit), mesh2 = meshOf(s2);
    part2.update(0.08, rec, play);
    const cnt = mesh2.geometry.drawRange.count / 6 * 4;
    assert.ok(first[2].vis && first[0].vis && first[4].vis && cnt === first[2].cnt);
    assert.deepEqual(Float32Array.from(mesh2.geometry.attributes.position.array.subarray(0, cnt * 3)), first[2].pos);
    // every vertex of a quad carries the same centre, and the four corners differ
    const pos = mesh.geometry.attributes.position.array, corner = mesh.geometry.attributes.aCorner.array;
    grab(0.08);
    for (let k = 1; k < 4; k++) for (let c = 0; c < 3; c++) assert.equal(pos[k * 3 + c], pos[c]);
    assert.deepEqual([...corner.subarray(0, 8)], [-1, -1, 1, -1, 1, 1, -1, 1]);
  });

  await okAsync('part: update never throws and never draws on what it cannot draw; an internal error switches the part off, hidden', async () => {
    const s = stage();
    const part = await applyDust(s.club, s.kit);
    const mesh = meshOf(s);
    const good = record({ v0: 7 });
    const bad = [undefined, null, {}, [], 'x', 5, { events: [] }, { events: [{}], shot: {} }, { events: null, shot: null }, (() => { const r = record(); r.shot.v0 = NaN; return r; })(),
      (() => { const r = record(); r.events[0].kind = { Strike: {} }; return r; })(), (() => { const r = record(); r.initial.balls = null; return r; })(),
      new Proxy({}, { get() { throw new Error('a record that throws on every read'); } })];
    for (const r of bad) for (const t of [0.05, NaN, undefined, -1, 1e12, '0.05', null]) {
      assert.doesNotThrow(() => part.update(t, r, play));
      assert.equal(mesh.visible, false);
    }
    for (const t of [NaN, undefined, Infinity, -Infinity, null, {}, 'abc']) { assert.doesNotThrow(() => part.update(t, good, play)); assert.equal(mesh.visible, false); }
    for (const info of [null, undefined, {}, 7, 'x', { playback: 'yes' }]) assert.doesNotThrow(() => part.update(0.05, good, info));
    assert.equal(part.enabled, true, 'bad input is not an error of the part');
    part.update(0.05, good, play); assert.equal(mesh.visible, true);
    // a soft touch: a record that is fine and sheds nothing
    part.update(0.05, record({ v0: 0.9 }), play); assert.equal(mesh.visible, false);
    assert.equal(part.state().errors, 0);

    // an internal error: the ball list throws when read. The part goes off without a throw and says why
    const t = stage({ gameOver: { get ballSet() { throw new Error('ball set unreadable'); } } });
    const p2 = await applyDust(t.club, t.kit);
    assert.doesNotThrow(() => p2.update(0.05, good, play));
    assert.equal(p2.enabled, false);
    assert.match(String(p2.reason), /update: ball set unreadable/);
    assert.equal(meshOf(t).visible, false);
    assert.ok(t.notes.some((x) => /switched off/.test(x)));
    assert.doesNotThrow(() => { p2.update(0.06, good, play); p2.clear(); p2.state(); p2.dispose(); p2.dispose(); });
    assert.equal(meshOf(t), undefined);
  });

  await okAsync('part: no dust on a tier with a ceiling of 0; a missing scene or kit is a stub, never a throw; dispose removes the mesh', async () => {
    const z = stage({ count: 0 });
    const off = await applyDust(z.club, z.kit);
    assert.equal(off.enabled, false); assert.match(off.reason, /motionDust is 0/);
    assert.equal(z.group.children.length, 0);
    for (const args of [[], [null], [{}], [{ ctx: {} }, null], [{ ctx: { scene: {} } }]]) { const p = await applyDust(...args); assert.equal(p.enabled, false); assert.equal(typeof p.reason, 'string'); }
    // without a kit (a dev page) the part makes the group itself, with the same obAim name
    const d = stage({ withKit: false });
    const part = await applyDust(d.club);
    assert.equal(part.enabled, true);
    const mesh = meshOf(d);
    assert.equal(mesh.parent.name, DUST_GROUP_NAME); assert.ok(DUST_GROUP_NAME.startsWith('obAim'));
    part.update(0.05, record({ v0: 7 }));
    assert.equal(mesh.visible, true);
    part.dispose();
    assert.equal(meshOf(d), undefined); assert.equal(d.scene.getObjectByName(DUST_GROUP_NAME), undefined);
    assert.equal(part.enabled, false);
    assert.doesNotThrow(() => part.update(0.05, record({ v0: 7 })));
    // the ceiling is clamped
    const big = stage({ count: 5000 }); const pb = await applyDust(big.club, big.kit);
    assert.equal(pb.state().count, COUNT_MAX);
  });

  await okAsync('part: the program is linked while the part is built, with the mesh hidden and nothing drawn; no link at the strike; a changed light set links again before it', async () => {
    const lightCount = { n: 0 };
    const r = fakeRenderer({ lightsOf: () => lightCount.n });
    const s = stage({ renderer: r });
    lightCount.n = 2;
    const part = await applyDust(s.club, s.kit);
    const mesh = meshOf(s);
    assert.equal(part.enabled, true);
    for (const fn of ['onState', 'rebuild']) assert.equal(typeof part[fn], 'function');
    // built: one program, made under a 1 x 1 target (the app draws the scene into its composer), then nothing bound
    assert.equal(r.info.programs.length, 1);
    assert.equal(r.info.programs[0].name, 'club.motion.dust');
    assert.deepEqual(r.calls.map((c) => c.op), ['target', 'compile', 'target']);
    const t = r.calls[0].to;
    assert.ok(t.isWebGLRenderTarget && t.width === 1 && t.height === 1 && t.depthBuffer === false);
    assert.ok(r.calls[1].obj === mesh && r.calls[1].cam === s.camera && r.calls[1].scn === s.scene && r.calls[1].visible === false);
    assert.equal(r.calls[2].to, null);
    assert.equal(mesh.visible, false); assert.equal(mesh.geometry.drawRange.count, 0);
    assert.equal(part.state().warm.links, 1); assert.equal(part.state().warm.mine, 1); assert.equal(part.state().warm.toTarget, true);
    // frames before the first shot (no record: clear), then the shot: state changes, the strike's frames. No new link
    for (let i = 0; i < 30; i++) part.clear();
    part.onState('SIMULATING', 'AIM', null, null); part.onState('PLAYBACK', 'SIMULATING', { strike: true }, null);
    const rec = record({ v0: 7.5 });
    part.update(0, rec, play); part.update(0.016, rec, play); part.update(0.08, rec, play);
    assert.equal(mesh.visible, true);
    assert.equal(r.info.programs.length, 1, 'the program count does not change across the first strike');
    assert.equal(r.calls.length, 3); assert.equal(part.state().warm.links, 1);
    assert.ok(!r.calls.some((c) => c.op === 'render'));
    // after the shot the player aims: the lamp set changes (a fixture change): linked again on the next call, not at the next strike
    part.update(5, rec, { ...play, state: 'AIM', playback: false });
    assert.equal(mesh.visible, false);
    s.lamp.visible = false; lightCount.n = 1;
    part.update(5, rec, { ...play, state: 'AIM', playback: false });
    assert.equal(r.info.programs.length, 2); assert.equal(part.state().warm.links, 2); assert.equal(part.state().warm.lastReason, 'frame');
    // a light added to the scene after the build is seen at the next state change or rebuild (the lights are listed again)
    s.scene.add(new THREE.PointLight(0xffffff, 1)); lightCount.n = 2;
    part.update(5, rec, { ...play, state: 'AIM', playback: false });
    assert.equal(part.state().warm.links, 2, 'not seen by the per-frame check: the list is from the build');
    part.onState('AIM', 'SETTLED', null, rec);
    assert.equal(part.state().warm.links, 3); assert.equal(part.state().warm.lastReason, 'state');
    s.scene.add(new THREE.SpotLight(0xffffff, 1)); lightCount.n = 3;
    part.rebuild('fixture');
    assert.equal(part.state().warm.links, 4); assert.equal(part.state().warm.lastReason, 'rebuild');
    assert.deepEqual(s.writes, []); assert.deepEqual(s.listens, []);
    // a renderer whose compile throws does not cost the part: it is built, it draws, and says what happened
    const bad = fakeRenderer({ fail: 99 });
    const s2 = stage({ renderer: bad });
    const p2 = await applyDust(s2.club, s2.kit);
    assert.equal(p2.enabled, true);
    p2.update(0.05, rec, play);
    assert.equal(meshOf(s2).visible, true);
    assert.match(p2.state().warm.error, /compile blew up/);
    assert.ok(s2.notes.some((x) => /warm-up failed/.test(x)));
    // without a renderer (a page that hands none): the part works, the warm-up stands down
    const s3 = stage();
    const p3 = await applyDust(s3.club, s3.kit);
    assert.equal(p3.state().warm.usable, false);
    p3.update(0.05, rec, play); assert.equal(meshOf(s3).visible, true);
    part.dispose(); assert.doesNotThrow(() => { part.onState('AIM'); part.rebuild('x'); part.clear(); });
  });

  await okAsync('law 4: the ball return\'s furniture walk does not take the dust mesh (and takes the same mesh once it is outside its obAim group)', async () => {
    const { furnitureOf } = await import('../../scene/ballreturn/furniture.js');
    const s = stage();
    const part = await applyDust(s.club, s.kit);
    part.update(0.08, record({ v0: 8 }), play);
    const mesh = meshOf(s);
    assert.equal(mesh.visible, true);
    const f = furnitureOf(THREE, s.scene, { excludeGroup: s.ballGroup });
    assert.ok(f.some((x) => x.name === 'bed'), 'the walk sees the scene');
    assert.ok(!f.some((x) => x.mesh === mesh), 'the dust is not furniture');
    assert.ok(!(f.skipped ?? []).some((x) => /Dust/i.test(x.name)), 'and it is not in the skipped list either');
    s.scene.add(mesh);
    assert.ok(furnitureOf(THREE, s.scene, { excludeGroup: s.ballGroup }).some((x) => x.mesh === mesh), 'the check bites: outside its group the same mesh is taken');
  });

  await okAsync('law 4: the app\'s env-bake rule (lifted from main.js) hides the dust for a capture and shows it again', async () => {
    const main = read('app/main.js');
    const a = main.indexOf('// >>> env-bake gameplay visuals'), b = main.indexOf('// <<< env-bake gameplay visuals');
    assert.ok(a > 0 && b > a, 'the marked block is in main.js');
    const hideGameplayVisualsForBake = new Function(`${main.slice(a, b)}\n return hideGameplayVisualsForBake;`)();
    const s = stage();
    const part = await applyDust(s.club, s.kit);
    part.update(0.08, record({ v0: 8 }), play);
    const mesh = meshOf(s);
    const drawn = () => { for (let p = mesh; p; p = p.parent) if (!p.visible) return false; return true; };
    assert.equal(drawn(), true);
    const restore = hideGameplayVisualsForBake(s.scene);
    assert.equal(drawn(), false, 'not drawn in the bake');
    restore();
    assert.equal(drawn(), true);
    // the other readers of the name rule: the studio bake, the venue probe, the club's own reflection service
    assert.ok(read('app/cinelight.js').includes("nm.startsWith('obAim')"));
    assert.ok(/\^obAim\|\^obCueStick/.test(read('scene/lightingvisuals.js')));
    assert.ok(read('scene/club/env.js').includes("n.startsWith('obAim')"));
    assert.ok(/EXCLUDE_NAME = \/\^\(obBallReturnDebug\|obAim\|obCueStick\)\//.test(read('scene/ballreturn/furniture.js')));
  });
} else {
  console.log('SKIP the part arms: node:module registerHooks is not available in this node (22.15 or later has it)');
}

console.log(`\n${n} arms passed (dust law v${DUST_LAW_VERSION})`);
