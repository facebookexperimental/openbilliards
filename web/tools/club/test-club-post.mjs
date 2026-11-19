// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-post.mjs — node arm for the pure logic of the club post chain: the readability invariant (post/guard.js: the table
// volume, its visible depth range against a brute-force reference, the guard), the lens model and its gates (post/focus.js),
// the grade table against the analytic grade it tabulates (post/gradelut.js), and the chain itself on a renderer that draws
// nothing (pass lists, draws per tier at rest and moving, the taps, the app's own lens).
// Run: node web/tools/club/test-club-post.mjs   (add --plan to print the per-tier table of what a frame draws)
import assert from 'node:assert/strict';
import {
  DOF_DEFAULTS, viewAperture, cocGain, farGain, apertureJitter, axisBedDepth, farCoc, createMotion, createGate, ease, smoothstep, dissolve,
} from '../../scene/club/post/focus.js';
import { GUARD_DEFAULTS, CLASSES, tableBox, growBox, visibleDepth, guardZone, guardWeight, classify } from '../../scene/club/post/guard.js';
import {
  LUT_SIZE, LOG_MIN, LOG_RANGE, GRADE_DEFAULTS, GRADE_IDENTITY, gradeColor, buildGradeLut, applyGradeLut,
} from '../../scene/club/post/gradelut.js';
import { CLUB_TUNE, toneMap } from '../../scene/club/post/tune.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const pitch = (cam, target) => { const d = [target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]; return Math.asin(-d[1] / Math.hypot(...d)); };
const VIEWS = { // the lane's fixed review views (world metres)
  V1: [[-2.3, 1.05, 1.35], [0.1, 0, 0]], V2: [[-1.35, 0.32, 0.22], [0.2, 0, 0]], V3: [[-2.15, 0.62, 0], [0.6, 0, 0]],
  V7: [[-0.85, 0.2, 0.42], [0.05, 0.02, -0.02]], V9: [[-4.0, 1.6, 2.6], [0, 0.3, 0]], TOP: [[0, 3.3, 0.001], [0, 0, 0]],
};
const lens = (id) => viewAperture(VIEWS[id][0][1], pitch(...VIEWS[id]));

ok('lens: full in the low aim view, almost none standing, none wide or top-down', () => {
  assert.equal(lens('V2'), 1);
  assert.ok(lens('V7') > 0.95, `V7 ${lens('V7')}`);
  assert.ok(lens('V3') > 0.6 && lens('V3') < 1, `V3 ${lens('V3')}`);
  assert.ok(lens('V1') < 0.05, `V1 ${lens('V1')}`);
  assert.equal(lens('V9'), 0);
  assert.equal(lens('TOP'), 0);
});
ok('lens: monotone in height and in pitch', () => {
  let prev = 2;
  for (let h = 0.1; h <= 1.4; h += 0.05) { const v = viewAperture(h, 0.2); assert.ok(v <= prev + 1e-12); prev = v; }
  prev = 2;
  for (let p = 0; p <= 1.5; p += 0.05) { const v = viewAperture(0.3, p); assert.ok(v <= prev + 1e-12); prev = v; }
});
ok('lens: blur gain is linear in aperture and frame height, and zero for bad input', () => {
  const g = cocGain(0.06, Math.tan(16 * Math.PI / 180), 720);
  assert.ok(Math.abs(g - 0.5 * 0.06 * 720 / (2 * Math.tan(16 * Math.PI / 180))) < 1e-9);
  assert.ok(Math.abs(cocGain(0.12, Math.tan(16 * Math.PI / 180), 1440) - 4 * g) < 1e-9);
  assert.equal(cocGain(0, 0.3, 720), 0); assert.equal(cocGain(0.06, 0, 720), 0); assert.equal(cocGain(0.06, 0.3, NaN), 0);
});
ok('control lens: the camera axis meets the bed only when it looks down onto a table', () => {
  const d = (cam, target) => { const v = [target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]; const l = Math.hypot(...v); return axisBedDepth(cam, v.map((x) => x / l)); };
  const t = d(...VIEWS.V2);
  assert.ok(Math.abs(t - Math.hypot(1.55, 0.32, 0.22)) < 1e-9, `V2 axis depth ${t}`);
  assert.equal(d([0, 1, 0], [0, 2, 3]), null);         // looking up
  assert.equal(d([-6, 1.6, 0], [-5.5, 1.55, 0]), null); // the axis lands far outside any table
  assert.equal(d([0, 1, 0], [1, 1, 0]), null);         // level
});
ok('blur radius: zero up to the far end of the sharp range (no near field at all), monotone behind it, never above the cap', () => {
  const zoneFar = 2.85, gain = 22.6, cap = 12;
  for (const d of [0.01, 0.05, 0.3, 0.7, 1, 2, 2.85]) assert.equal(farCoc(d, zoneFar, gain, cap), 0, `depth ${d}`);
  let prev = 0;
  for (let d = zoneFar; d < 60; d += 0.1) { const c = farCoc(d, zoneFar, gain, cap); assert.ok(c >= prev - 1e-12 && c <= cap); prev = c; }
  assert.ok(Math.abs(farCoc(1e9, zoneFar, gain, cap) - gain / zoneFar) < 1e-6);
  assert.equal(farCoc(1e9, 0.2, gain, cap), cap);
  assert.equal(farCoc(0, zoneFar, gain, cap), 0); assert.equal(farCoc(3, 0, gain, cap), 0);
});
// ---- the readability invariant (post/guard.js) -----------------------------------------------------------------------------------
const FOV = { V1: 40, V2: 32, V3: 38, V7: 28, V9: 50, TOP: 40 };
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
// the camera of a view as post.js hands it to the guard (three's lookAt basis)
function camOf(pos, target, fov, aspect = 16 / 9, near = 0.01) {
  const fwd = vnorm(vsub(target, pos));
  const right = vnorm(vcross(fwd, Math.abs(fwd[1]) > 0.9999 ? [0, 0, -1] : [0, 1, 0]));
  const up = vcross(right, fwd);
  const tanY = Math.tan((fov * Math.PI) / 360);
  return { pos, right, up, fwd, tanX: tanY * aspect, tanY, near };
}
const viewCam = (id) => camOf(VIEWS[id][0], VIEWS[id][1], FOV[id]);
// brute force: the box's depth range seen along a grid of rays through the frame (slab test per ray)
function bruteDepth(box, cam, nx = 241, ny = 137) {
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i / (nx - 1)) * 2 - 1, y = (j / (ny - 1)) * 2 - 1;
    const dir = [0, 1, 2].map((k) => cam.fwd[k] + cam.right[k] * x * cam.tanX + cam.up[k] * y * cam.tanY); // depth = t
    let t0 = cam.near, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dir[k]) < 1e-12) { if (cam.pos[k] < box.min[k] || cam.pos[k] > box.max[k]) { t0 = 1; t1 = 0; break; } continue; }
      let a = (box.min[k] - cam.pos[k]) / dir[k], b = (box.max[k] - cam.pos[k]) / dir[k];
      if (a > b) [a, b] = [b, a];
      if (a > t0) t0 = a; if (b < t1) t1 = b;
    }
    if (t1 >= t0) { if (t0 < lo) lo = t0; if (t1 > hi) hi = t1; }
  }
  return hi >= lo ? { near: lo, far: hi } : null;
}
const BOX = tableBox({});
ok('guard: the table volume comes from the cloth and rail bounds, wraps them, and refuses implausible ones', () => {
  assert.equal(BOX.from, 'default');
  assert.ok(BOX.max[0] > 1.27 + 0.19 && BOX.max[2] > 0.635 + 0.19 && BOX.min[1] <= -0.1 && BOX.max[1] >= 2 * GUARD_DEFAULTS.ballR + 0.015);
  const cloth = { min: [-1.32, -0.03, -0.685], max: [1.32, 0.037, 0.685] }, rail = { min: [-1.45, -0.013, -0.815], max: [1.45, 0.041, 0.815] };
  const b = tableBox({ cloth, rail });
  assert.equal(b.from, 'rail');
  assert.ok(Math.abs(b.max[0] - (1.45 + GUARD_DEFAULTS.pad)) < 1e-12 && Math.abs(b.min[2] + 0.815 + GUARD_DEFAULTS.pad) < 1e-12);
  assert.ok(Math.abs(b.cloth.x1 - 1.32) < 1e-12 && b.clothTop === 0.037);
  const c = tableBox({ cloth });
  assert.equal(c.from, 'cloth'); assert.ok(c.max[0] > 1.32 + 0.1);
  // a 12 ft table: larger bounds are taken as they are
  const big = tableBox({ cloth: { min: [-1.84, -0.03, -0.95], max: [1.84, 0.04, 0.95] }, rail: { min: [-1.99, 0, -1.1], max: [1.99, 0.045, 1.1] } });
  assert.equal(big.from, 'rail'); assert.ok(big.max[0] > 1.99);
  // refused: a "rail" class that reaches the floor plan of a room, a cloth the size of a coaster, NaN
  assert.equal(tableBox({ cloth, rail: { min: [-4, 0, -3], max: [4, 0.04, 3] } }).from, 'cloth');
  assert.equal(tableBox({ cloth: { min: [-0.1, 0, -0.1], max: [0.1, 0.01, 0.1] } }).from, 'default');
  assert.equal(tableBox({ cloth: { min: [NaN, 0, 0], max: [1, 1, 1] } }).from, 'default');
  // a ball in the air or off the table grows the box, a ball on the bed does not
  const R = GUARD_DEFAULTS.ballR;
  assert.deepEqual(growBox(BOX, [0.3, R, 0.2]).max, BOX.max);
  const g = growBox(BOX, [0.3, 0.4, 0.2, 2.0, R, 0]);
  assert.ok(g.max[1] > 0.4 + R && g.max[0] > 2.0 + R && g.min[0] === BOX.min[0]);
  assert.equal(g.cloth, BOX.cloth);
});
ok('guard: the visible depth range of the box is exact (against a brute-force ray grid) at the fixed views and at 300 random poses', () => {
  const check = (cam, name) => {
    const a = visibleDepth(BOX, cam), b = bruteDepth(BOX, cam);
    if (b === null) { if (a !== null) assert.ok(a.far - a.near < 0.2, `${name}: analytic sees a sliver the grid misses (${JSON.stringify(a)})`); return 0; }
    assert.ok(a !== null, `${name}: the grid sees the box, the clip does not`);
    // the clip is the exact hull: never inside the sampled range, and close to it
    assert.ok(a.near <= b.near + 1e-9 && a.far >= b.far - 1e-9, `${name}: clip ${JSON.stringify(a)} inside grid ${JSON.stringify(b)}`);
    assert.ok(b.near - a.near < 0.03 + 0.02 * b.near && a.far - b.far < 0.03 + 0.02 * b.far, `${name}: clip ${JSON.stringify(a)} far from grid ${JSON.stringify(b)}`);
    return 1;
  };
  for (const id of Object.keys(VIEWS)) assert.equal(check(viewCam(id), id), 1, `${id} sees the table`);
  let seed = 4242, seenN = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 300; i++) {
    const pos = [(rnd() - 0.5) * 6, 0.03 + rnd() * 1.6, (rnd() - 0.5) * 4];
    const target = [(rnd() - 0.5) * 3.4, rnd() * 0.3, (rnd() - 0.5) * 2];
    seenN += check(camOf(pos, target, 20 + rnd() * 40, 0.6 + rnd() * 1.6, 0.01), `random ${i}`);
  }
  assert.ok(seenN > 200, `${seenN} of 300 random poses see the table`);
  // the camera inside the volume (a ball's eye view): the range starts at the near plane
  const inside = visibleDepth(BOX, camOf([0, 0.03, 0], [1, 0.03, 0.2], 40));
  assert.ok(inside && Math.abs(inside.near - 0.01) < 1e-9 && inside.far > 1.4);
  // looking away from the table: nothing visible, and the whole box in front of the camera stands in; behind the camera: null
  const away = camOf([-1.6, 0.3, 0], [-3, 0.3, 0], 32);
  assert.equal(visibleDepth(BOX, away), null);
  assert.equal(guardZone(BOX, away), null);
  const beside = camOf([-1.6, 0.3, 1.6], [0.5, 0.3, 4], 32);
  assert.equal(visibleDepth(BOX, beside), null);
  const z = guardZone(BOX, beside);
  assert.ok(z && z.visible === false && z.far > 0.5);
});
ok('guard, the invariant: at every pose every point of the table volume that is in the frame has blur radius 0, by the range alone and by the guard alone', () => {
  let seed = 99, tested = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const cams = Object.keys(VIEWS).map(viewCam);
  for (let i = 0; i < 120; i++) cams.push(camOf([(rnd() - 0.5) * 5, 0.05 + rnd() * 1.2, (rnd() - 0.5) * 3.4], [(rnd() - 0.5) * 2.6, 0, (rnd() - 0.5) * 1.3], 24 + rnd() * 30));
  for (const cam of cams) {
    const zone = guardZone(BOX, cam);
    if (!zone || !zone.visible) continue;
    const gain = farGain(cocGain(DOF_DEFAULTS.aperture, cam.tanY, 720), zone.far, DOF_DEFAULTS.farMax * 720);
    for (let k = 0; k < 400; k++) {
      // a point of the volume: corners and edges first, then random
      const p = [0, 1, 2].map((a) => (k < 8 ? ((k >> a) & 1 ? BOX.max[a] : BOX.min[a]) : BOX.min[a] + rnd() * (BOX.max[a] - BOX.min[a])));
      const r = vsub(p, cam.pos);
      const d = vdot(r, cam.fwd);
      if (d < cam.near || Math.abs(vdot(r, cam.right)) > d * cam.tanX || Math.abs(vdot(r, cam.up)) > d * cam.tanY) continue; // not in the frame
      tested += 1;
      assert.ok(d <= zone.far, 'inside the sharp range');
      assert.equal(farCoc(d, zone.far, gain, 14.4), 0, 'the range alone');
      assert.equal(guardWeight(p, BOX), 1, 'the guard alone');
      // a depth sample is one of four per pixel: 2 cm off along the ray is still sharp to under a tenth of a pixel
      assert.ok(farCoc(d + 0.02, zone.far, gain, 14.4) * (1 - guardWeight(p.map((v, a) => v + 0.02 * r[a] / Math.hypot(...r)), BOX)) < 0.1);
    }
    // and the room is NOT guarded: what lies behind the table blurs
    assert.ok(farCoc(zone.far + 3, zone.far, gain, 14.4) > 0.3, 'the room behind blurs');
  }
  for (const id of ['V2', 'V7', 'V3']) {
    const cam = viewCam(id), zone = guardZone(BOX, cam);
    const gain = farGain(cocGain(DOF_DEFAULTS.aperture * lens(id), cam.tanY, 720), zone.far, DOF_DEFAULTS.farMax * 720 * lens(id));
    assert.ok(farCoc(6.5, zone.far, gain, 14.4) > 2.5, `${id}: the bar wall blurs by ${farCoc(6.5, zone.far, gain, 14.4).toFixed(2)} px`);
  }
  assert.ok(tested > 20000, `${tested} points tested`);
  assert.equal(guardWeight([0, 0.03, 0], BOX), 1);
  assert.equal(guardWeight([BOX.max[0] + GUARD_DEFAULTS.soft, 0, 0], BOX), 0);
  const half = guardWeight([BOX.max[0] + GUARD_DEFAULTS.soft / 2, 0, 0], BOX);
  assert.ok(Math.abs(half - 0.5) < 1e-9, 'smooth fall-off outside the box');
  assert.equal(guardWeight([0, 1.0, 0], BOX), 0, 'the lamp over the table is not in the volume');
});
ok('guard: the sharp range at the fixed views ends just behind the far end of the table, and the control lens ends far short of it', () => {
  const z2 = guardZone(BOX, viewCam('V2')), z7 = guardZone(BOX, viewCam('V7')), z3 = guardZone(BOX, viewCam('V3'));
  assert.ok(z2.visible && z2.far > 2.75 && z2.far < 3.05, `V2 ${z2.far}`);
  assert.ok(z3.visible && z3.far > 3.5 && z3.far < 3.9, `V3 ${z3.far}`);
  assert.ok(z7.visible && z7.far > 1.8 && z7.far < 2.9, `V7 ${z7.far}`);
  // what the rule prevents: a plain lens focused where the camera looks (V2: the axis meets the bed 1.6 m away) blurs the
  // far balls; the farthest ball of the review layout is 2.45 m from the V2 camera
  const cam = viewCam('V2');
  const focus = axisBedDepth(cam.pos, cam.fwd);
  const gain = farGain(cocGain(DOF_DEFAULTS.aperture, cam.tanY, 720), focus, DOF_DEFAULTS.farMax * 720);
  assert.ok(farCoc(2.45, focus, gain, 14.4) > 2.5, `the control blurs the far ball by ${farCoc(2.45, focus, gain, 14.4).toFixed(2)} px`);
  assert.equal(farCoc(2.45, z2.far, farGain(cocGain(DOF_DEFAULTS.aperture, cam.tanY, 720), z2.far, DOF_DEFAULTS.farMax * 720), 14.4), 0);
});
ok('guard: the proof\'s classes (bed, ball, cushion, pocket, rail, outside) by world position', () => {
  const R = GUARD_DEFAULTS.ballR;
  const geo = { box: tableBox({ cloth: { min: [-1.32, -0.03, -0.685], max: [1.32, 0.037, 0.685] }, rail: { min: [-1.45, -0.013, -0.815], max: [1.45, 0.041, 0.815] } }), balls: [0.3, R, 0.1], R };
  const name = (p) => CLASSES[classify(p, geo)];
  assert.equal(name([0, 0, 0]), 'bed'); assert.equal(name([-1.2, 0.003, 0.6]), 'bed');
  assert.equal(name([0.3, 2 * R, 0.1]), 'ball'); assert.equal(name([0.3 + R, R, 0.1]), 'ball');
  assert.equal(name([0, 0.03, 0.66]), 'cushion'); assert.equal(name([1.3, 0.02, 0]), 'cushion');
  assert.equal(name([1.29, -0.05, 0.65]), 'pocket');
  assert.equal(name([0, 0.04, 0.75]), 'rail'); assert.equal(name([1.4, 0.03, 0]), 'rail');
  assert.equal(name([0, 0.3, 0]), 'outside');           // the cue above the table, the lamp
  assert.equal(name([0, -0.5, 0]), 'outside');          // the floor under the table
  assert.equal(name([2.0, 0.02, 0]), 'outside'); assert.equal(name([0, 0.02, 1.2]), 'outside');
});
const pose = (x, y, z, yaw = 0, fov = 32) => [x, y, z, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2), fov];
ok('motion: first frame and a jump are cuts; a flight is a speed; still is zero', () => {
  const m = createMotion();
  assert.equal(m.step(pose(0, 0.3, 0), [0, 0, 0], 1 / 60).cut, true);
  let r = m.step(pose(0, 0.3, 0), [0, 0, 0], 1 / 60);
  assert.deepEqual([r.cut, r.speed, r.ballsMoving], [false, 0, false]);
  r = m.step(pose(0.02, 0.3, 0), [0, 0, 0], 1 / 60);
  assert.equal(r.cut, false); assert.ok(Math.abs(r.speed - 1.2) < 1e-9);
  r = m.step(pose(1.5, 0.3, 0), [0, 0, 0], 1 / 60);         // 1.5 m in one frame
  assert.equal(r.cut, true);
  r = m.step(pose(1.5, 0.3, 0, 1.0), [0, 0, 0], 1 / 60);    // 1 rad in one frame
  assert.equal(r.cut, true);
  r = m.step(pose(2.0, 0.3, 0, 1.0), [0, 0, 0], 0.1);       // 0.5 m in a 100 ms frame = a 5 m/s flight at a low frame rate
  assert.equal(r.cut, false); assert.ok(Math.abs(r.speed - 5) < 1e-9);
  r = m.step(pose(2.0, 0.3, 0, 1.0), [0.001, 0, 0], 1 / 60);
  assert.equal(r.ballsMoving, true);
  r = m.step(pose(2.0, 0.3, 0, 1.0), [0.001, 0, 0, 1, 0, 0], 1 / 60); // a ball appeared
  assert.equal(r.ballsMoving, true);
  r = m.step(pose(2.0, 0.3, 0.001, 1.0), [0.001, 0, 0, 1, 0, 0], 0); // moved with no clock step
  assert.equal(r.speed, Infinity);
});
ok('gate live: on, fades out with camera speed, eases back; a cut snaps on', () => {
  const g = createGate('live');
  assert.equal(g.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false }), 1);
  let a = 1;
  for (let i = 0; i < 30; i++) a = g.step({ dt: 1 / 60, speed: 4, cut: false, ballsMoving: true });
  assert.equal(a, 0);
  a = g.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: true });
  assert.ok(a > 0 && a < 0.2, 'eases in, does not pop');
  for (let i = 0; i < 120; i++) a = g.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: true });
  assert.equal(a, 1);
  assert.ok(g.step({ dt: 1 / 60, speed: 1.4, cut: false, ballsMoving: false }) < 1); // partial fade at a medium speed
  const steady = createGate('live', { fade: false });
  steady.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
  for (let i = 0; i < 30; i++) a = steady.step({ dt: 1 / 60, speed: 9, cut: false, ballsMoving: true });
  assert.equal(a, 1, 'fade: false ignores camera speed');
});
ok('gate still: only after camera and balls rest for restHold; any motion takes it out on a ramp of stillOut seconds, or at once with stillOut 0', () => {
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  const g = createGate('still');
  g.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
  // the ramp: 4 lens frames at 60 Hz, the fifth moving frame has none, and it never comes back while anything moves
  const ramp = [];
  for (let i = 0; i < 6; i++) ramp.push(g.step({ dt: 1 / 60, speed: 0.5, cut: false, ballsMoving: false }));
  assert.equal(DOF_DEFAULTS.stillOut, 0.08);
  [1 - 1 / 4.8, 1 - 2 / 4.8, 1 - 3 / 4.8, 1 - 4 / 4.8, 0, 0].forEach((v, i) => assert.ok(near(ramp[i], v), `moving frame ${i + 1}: ${ramp[i]}`));
  let a = 1;
  for (let i = 0; i < 20; i++) a = g.step({ dt: 1 / 60, speed: 0.5, cut: false, ballsMoving: false });
  assert.equal(a, 0);
  assert.equal(g.target, 0, 'while anything moves the gate is heading for 0 (the frame hook arms no depth once the amount is 0)');
  // bounded in time, not in frames: 2 lens frames at 30 Hz, 9 at 120 Hz; and the ramp ends even if the motion stops inside it
  for (const [hz, lensFrames] of [[30, 2], [60, 4], [120, 9]]) {
    const h = createGate('still'); h.step({ dt: 1 / hz, speed: 0, cut: true, ballsMoving: false });
    let n = 0; for (let i = 0; i < 40; i++) { if (h.step({ dt: 1 / hz, speed: 3, cut: false, ballsMoving: false }) > 0.02) n += 1; }
    assert.equal(n, lensFrames, `${hz} Hz: ${n} lens frames in a move`);
  }
  {
    const h = createGate('still'); h.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
    const one = h.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: true });          // one frame of motion (a nudge)
    assert.ok(near(one, 1 - 1 / 4.8));
    // a frame drawn again with no clock step (a tool's read-back) moves nothing along the ramp
    assert.equal(h.step({ dt: 0, speed: 0, cut: false, ballsMoving: false }), one);
    let n = 0, v = one; while (v > 0 && n < 99) { v = h.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: false }); n += 1; }
    assert.equal(n, 4, 'the lens is gone 5 frames after a one-frame nudge (the rest time has not passed: it keeps leaving)');
    // a move with no clock step (a tool's jump under the cut distance) cuts
    const j = createGate('still'); j.step({ dt: 0, speed: 0, cut: true, ballsMoving: false });
    assert.equal(j.step({ dt: 0, speed: Infinity, cut: false, ballsMoving: false }), 0);
  }
  // stillOut 0 is round 2's cut: no lens in the first moving frame
  {
    const c = createGate('still', { fade: true }, { ...DOF_DEFAULTS, stillOut: 0 });
    c.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
    assert.equal(c.step({ dt: 1 / 60, speed: 0.5, cut: false, ballsMoving: false }), 0, 'the cut: the first moving frame has no lens');
    c.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
    assert.equal(c.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: true }), 0, 'the cut: a rolling ball turns it off in its first frame');
  }
  let t = 0;
  while (t < DOF_DEFAULTS.restHold - 1 / 60) { a = g.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: false }); t += 1 / 60; }
  assert.equal(a, 0, 'still held off inside restHold');
  for (let i = 0; i < 120; i++) a = g.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: false });
  assert.equal(a, 1);
  // the way back: nothing for restHold, then an exponential approach (time constant tauIn), never a jump
  {
    const h = createGate('still'); h.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
    for (let i = 0; i < 10; i++) h.step({ dt: 1 / 60, speed: 3, cut: false, ballsMoving: false });
    const back = []; for (let i = 0; i < 90; i++) back.push(h.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: false }));
    const first = back.findIndex((v) => v > 0);
    assert.equal(first, 7, 'the first frame with any lens is the 8th resting frame at 60 Hz (0.12 s of rest)');
    assert.ok(back[first] < 0.08 && back[first + 1] - back[first] < 0.08, 'it comes in by less than 8 % of its strength per frame');
    assert.ok(back[first + 9] > 0.5 && back[first + 9] < 0.56 && back[first + 30] > 0.89 && back[89] === 1, 'half in after 10 frames, 90 % after half a second, whole inside 1.4 s');
    for (let i = 1; i < back.length; i++) assert.ok(back[i] >= back[i - 1] && back[i] - back[i - 1] < 0.08);
  }
  a = g.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: true });
  assert.ok(near(a, 1 - 1 / 4.8), 'a rolling ball starts the same ramp in its first frame');
  for (let i = 0; i < 4; i++) a = g.step({ dt: 1 / 60, speed: 0, cut: false, ballsMoving: i < 2 });
  assert.equal(a, 0, 'and it is off until the rest time has passed again');
  assert.equal(createGate('off').step({ dt: 1, speed: 0, cut: true, ballsMoving: false }), 0);
  assert.equal(createGate('bogus').step({ dt: 1, speed: 0, cut: true, ballsMoving: false }), 0);
});
ok('eased lens: the dissolve fades a lamp\'s disc as evenly as the wall; the linear mix keeps it white and then jumps', () => {
  // a pixel of a lamp's disc (level 5 in the lens's picture) over a wall of 0.3, and a wall pixel the lens changes by a third:
  // the displayed level (the app's tone map, 0..255) along the base tier's ramp of 4 lens frames, then the sharp frame
  const shown = (c) => Math.round(toneMap(c)[1] * 255);
  const steps = (sharp, lens, linear) => {
    const lv = [1, 1 - 1 / 4.8, 1 - 2 / 4.8, 1 - 3 / 4.8, 1 - 4 / 4.8, 0].map((a) => shown(dissolve(sharp, lens, a, linear)));
    return { lv, worst: Math.max(...lv.slice(1).map((v, i) => Math.abs(v - lv[i]))) };
  };
  const wall = [0.3, 0.3, 0.3], disc = [5, 5, 5];
  const d = steps(wall, disc, false), l = steps(wall, disc, true);
  assert.equal(d.lv[0], l.lv[0]); assert.equal(d.lv[5], l.lv[5]);
  const whole = d.lv[0] - d.lv[5];
  assert.ok(d.worst < 0.26 * whole, `dissolve: the largest of the 5 steps is ${d.worst} of ${whole} levels (${d.lv})`);
  // the same for a brighter lamp over a dark wall, and a dark thing the lens brightens
  for (const [sh, le] of [[[0.05, 0.05, 0.05], [20, 20, 20]], [[0.6, 0.6, 0.6], [0.1, 0.1, 0.1]], [[0.3, 0.3, 0.3], [2, 2, 2]]]) {
    const x = steps(sh, le, false);
    assert.ok(x.worst < 0.27 * Math.abs(x.lv[0] - x.lv[5]), `dissolve ${sh[0]} -> ${le[0]}: ${x.lv}`);
  }
  assert.ok(l.worst > 0.6 * whole, `linear mix: the last step alone is ${l.worst} of ${whole} levels (${l.lv})`);
  // the ends are the two pictures (to rounding: the lens is not drawn at all at 0, and takes the plain path at 1), and a dim
  // pixel is the same in both to a few levels
  dissolve(wall, disc, 0).forEach((v) => assert.ok(Math.abs(v - 0.3) < 1e-9));
  dissolve(wall, disc, 1).forEach((v) => assert.ok(Math.abs(v - 5) < 1e-9));
  const dim = steps([0.20, 0.20, 0.20], [0.30, 0.30, 0.30], false), dimL = steps([0.20, 0.20, 0.20], [0.30, 0.30, 0.30], true);
  dim.lv.forEach((v, i) => assert.ok(Math.abs(v - dimL.lv[i]) <= 2, `a dim pixel: ${dim.lv} against ${dimL.lv}`));
  for (const c of [[0, 0, 0], [64, 64, 64], [3, 0.1, 0.02]]) dissolve(c, [0.5, 0.4, 0.3], 0.5).forEach((v) => assert.ok(Number.isFinite(v) && v >= 0));
});
ok('gate: no clock step, no change (a repaint between frames does not advance the easing)', () => {
  const g = createGate('live');
  g.step({ dt: 1 / 60, speed: 0, cut: true, ballsMoving: false });
  for (let i = 0; i < 5; i++) g.step({ dt: 1 / 60, speed: 9, cut: false, ballsMoving: false });
  const a = g.amount;
  assert.equal(g.step({ dt: 0, speed: 0, cut: false, ballsMoving: false }), a);
  assert.equal(ease(0.3, 1, 0, 0.2), 0.3); assert.equal(ease(0.3, 1, 1, 0), 1);
  assert.equal(smoothstep(1, 1, 0.5), 0); assert.equal(smoothstep(1, 1, 2), 1);
});
// ---- the grade table ----------------------------------------------------------------------------------------------------------
const lut = buildGradeLut();
const stops = (a, b) => Math.abs(Math.log2(a / b));
ok('grade: identity parameters build an all-zero table, and strength 0 is the input exactly', () => {
  const id = buildGradeLut(GRADE_IDENTITY);
  assert.ok(id.every((v) => v === 0));
  for (const c of [[0.18, 0.18, 0.18], [3, 0.2, 0.01], [0, 0, 0], [1e-7, 50, 400]]) {
    assert.deepEqual(applyGradeLut(lut, LUT_SIZE, c, 0), c);
  }
  assert.equal(lut.length, LUT_SIZE ** 3 * 4);
});
ok('grade: black stays black, every output is finite and positive for positive input', () => {
  assert.deepEqual(applyGradeLut(lut, LUT_SIZE, [0, 0, 0], 1), [0, 0, 0]);
  for (let i = 0; i < lut.length; i++) assert.ok(Number.isFinite(lut[i]) && Math.abs(lut[i]) <= 6);
  for (const c of [[1e-6, 1e-6, 1e-6], [1e-4, 5, 0.3], [200, 200, 200], [64, 0.001, 0.001]]) {
    for (const v of applyGradeLut(lut, LUT_SIZE, c, 1)) assert.ok(Number.isFinite(v) && v > 0);
  }
});
ok('grade: the table reproduces the analytic grade (trilinear lookup in log space)', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  let worstAny = 0, worstReal = 0, worstLum = 0;
  for (let i = 0; i < 6000; i++) {
    const c = [0, 1, 2].map(() => 2 ** (LOG_MIN + 1 + rnd() * (LOG_RANGE - 2)));
    const real = i % 2 === 1; // every second colour is one a renderer produces: channels within 6 stops of each other
    if (real) { const hi = Math.max(...c); for (let k = 0; k < 3; k++) c[k] = Math.max(c[k], hi / 64); }
    const a = gradeColor(c), b = applyGradeLut(lut, LUT_SIZE, c, 1);
    for (let k = 0; k < 3; k++) { const e = stops(a[k], b[k]); worstAny = Math.max(worstAny, e); if (real) worstReal = Math.max(worstReal, e); }
    worstLum = Math.max(worstLum, stops(Y(a), Y(b)));
  }
  assert.ok(worstLum < 0.01, `worst luminance error ${worstLum.toFixed(4)} stops`);       // 0.7 % anywhere in the cube
  assert.ok(worstReal < 0.02, `worst channel error ${worstReal.toFixed(4)} stops`);       // 1.4 % for real colours
  assert.ok(worstAny < 0.05, `worst channel error anywhere ${worstAny.toFixed(4)} stops`); // a channel 14 stops under the others
});
ok('grade: a grey ramp stays monotone and smooth (no banding from the table), deep blacks are not crushed', () => {
  let prev = 0, prevStep = null, worstJump = 0;
  for (let e = -10; e <= 6; e += 1 / 64) {
    const g = 2 ** e;
    const out = applyGradeLut(lut, LUT_SIZE, [g, g, g], 1);
    const y = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
    assert.ok(y > prev, `monotone at 2^${e}`);
    const step = Math.log2(y / (prev || y));
    if (prevStep !== null && prev > 0) worstJump = Math.max(worstJump, Math.abs(step - prevStep));
    prevStep = prev > 0 ? step : null; prev = y;
  }
  assert.ok(worstJump < 0.004, `slope jump between neighbours ${worstJump.toFixed(5)} stops`);
  // contrast: darker below the pivot, brighter above, and the push dies out in the deep blacks (slope back to ~1)
  const y = (g) => { const o = gradeColor([g, g, g]); return 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2]; };
  assert.ok(y(0.18) > 0.179 && y(0.18) < 0.181, 'the pivot does not move');
  assert.ok(y(0.02) < 0.02 && y(1.5) > 1.5);
  assert.ok(Math.log2(0.0005 / y(0.0005)) < Math.log2(0.01 / y(0.01)), 'deep blacks are pushed less than shadows');
  assert.ok(Math.log2(0.01 / y(0.01)) < 0.4, 'shadows lose less than 0.4 stop');
});
ok('grade: cloth-like colours gain saturation, highlights lean warm, shadows lean cool, luminance near the pivot is kept', () => {
  const sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  const cloth = [0.05, 0.22, 0.34];
  const out = gradeColor(cloth);
  assert.ok(sat(out) > sat(cloth));
  const hi = gradeColor([4, 4, 4]); assert.ok(hi[0] > hi[1] && hi[1] > hi[2]);
  const lo = gradeColor([0.004, 0.004, 0.004]); assert.ok(lo[2] > lo[1] && lo[1] > lo[0]);
  const mid = gradeColor([0.18, 0.18, 0.18]);
  assert.ok(Math.abs(mid[0] - mid[2]) < 0.004, 'mid grey stays neutral');
  assert.deepEqual(Object.keys(GRADE_DEFAULTS).sort(), Object.keys(GRADE_IDENTITY).sort());
});

// ---- the room rule of the far field ------------------------------------------------------------------------------------------
ok('far field: the blur at infinity is bounded by the cap, the lens law is kept below it, depth gradation is kept', () => {
  const H = 720, cap = DOF_DEFAULTS.farMax * H;
  const blurAt = (d, zoneFar, fov) => { const g = farGain(cocGain(DOF_DEFAULTS.aperture, Math.tan((fov * Math.PI) / 360), H), zoneFar, cap); return g * (1 / zoneFar - 1 / d); };
  for (const [zoneFar, fov] of [[0.6, 28], [1.2, 28], [2.4, 32], [3.5, 38]]) {
    assert.ok(blurAt(1e9, zoneFar, fov) <= cap + 1e-9, `infinity at zone ${zoneFar}`);
    let prev = -1;
    for (const d of [zoneFar, zoneFar + 0.5, 3, 4.5, 6.5, 9, 1e6]) { if (d < zoneFar) continue; const r = blurAt(d, zoneFar, fov); assert.ok(r >= prev - 1e-12, 'monotone in depth'); prev = r; }
    assert.ok(blurAt(zoneFar, zoneFar, fov) === 0);
  }
  // the back bar in the aim view and in a ball close-up, with the sharp range ending behind the table (post/guard.js): the same
  // order of blur, 3 to 5.5 px at 720p (a bottle on the shelf is 15 px wide there, on a 19 px pitch: a disc under 6.5 px
  // keeps half the contrast of the row), not the 14 px clamp
  const aim = blurAt(6.5, guardZone(BOX, viewCam('V2')).far, 32), close = blurAt(6.0, guardZone(BOX, viewCam('V7')).far, 28);
  assert.ok(aim > 3 && aim < 5.5, `aim view ${aim.toFixed(2)} px`);
  assert.ok(close > 3 && close < 6.5, `close-up ${close.toFixed(2)} px`);
  assert.ok(Math.abs(close - aim) < 2, 'a close-up does not blur the room much more than the aim view');
  // a focus far away is under the cap: the plain lens law
  const g = cocGain(DOF_DEFAULTS.aperture, Math.tan((32 * Math.PI) / 360), H);
  assert.equal(farGain(g, 50, cap), g);
  assert.equal(farGain(g, 2, 0), g, 'cap 0 = the plain lens law');
  assert.equal(farGain(0, 2, cap), 0); assert.equal(farGain(g, 0, cap), 0);
});

// ---- the app's accumulation lens (main.js renderAccum with opts.dof), reproduced with plain arithmetic ------------------------
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; },
};
// camera.lookAt: z = eye - target, x = up x z, y = z x x; then the quaternion of that rotation matrix
function lookQuat(eye, target, up = [0, 1, 0]) {
  const z = V.norm(V.sub(eye, target)), x = V.norm(V.cross(up, z)), y = V.cross(z, x);
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return { q, right: x, up: y, view: V.mul(z, -1) };
}
const poseOf = (eye, target) => [...eye, ...lookQuat(eye, target).q];
function jittered(eye, target, focus, i, N, r) {
  const { right, up, view } = lookQuat(eye, target);
  const th = i * 2.399963229728653, rr = r * Math.sqrt((i + 0.5) / N);
  const fd = Math.max(0.01, V.dot(view, V.sub(focus, eye)));
  const aim = V.add(eye, V.mul(view, fd));
  const p = V.add(V.add(eye, V.mul(right, rr * Math.cos(th))), V.mul(up, rr * Math.sin(th)));
  return poseOf(p, aim);
}
ok('app lens: every sub-frame of the app\'s aperture jitter is recognised, at every fixed view, aperture and focus', () => {
  for (const id of Object.keys(VIEWS)) {
    const [eye, target] = VIEWS[id];
    for (const r of [0.002, 0.012, 0.05]) for (const N of [4, 8, 16]) for (const focus of [[-0.55, 0.0286, 0.1], [1.1, 0.0286, -0.5]]) {
      for (let i = 0; i < N; i++) assert.ok(apertureJitter(poseOf(eye, target), jittered(eye, target, focus, i, N, r)), `${id} r=${r} N=${N} i=${i}`);
    }
  }
});
ok('app lens: a camera that rests, orbits, dollies, trucks or pans between the hook and the render is not taken for it', () => {
  const [eye, target] = VIEWS.V2;
  const hookPose = poseOf(eye, target);
  assert.equal(apertureJitter(hookPose, hookPose.slice()), false, 'no motion');
  // an orbit about the target, from a crawl to a fast flight (step per sub-frame)
  for (const step of [2e-5, 1e-4, 1e-3, 0.01, 0.05]) {
    const d = V.sub(eye, target), a = step / Math.hypot(d[0], d[2]);
    const e2 = [target[0] + d[0] * Math.cos(a) - d[2] * Math.sin(a), eye[1], target[2] + d[0] * Math.sin(a) + d[2] * Math.cos(a)];
    assert.equal(apertureJitter(hookPose, poseOf(e2, target)), false, `orbit step ${step}`);
    const e3 = [eye[0], eye[1] + step, eye[2]]; // a crane move that keeps the target
    assert.equal(apertureJitter(hookPose, poseOf(e3, target)), false, `crane step ${step}`);
  }
  const { view, right } = lookQuat(eye, target);
  assert.equal(apertureJitter(hookPose, poseOf(V.add(eye, V.mul(view, 0.01)), V.add(target, V.mul(view, 0.01)))), false, 'dolly');
  assert.equal(apertureJitter(hookPose, [...V.add(eye, V.mul(right, 0.01)), ...hookPose.slice(3)]), false, 'truck with a fixed heading');
  assert.equal(apertureJitter(hookPose, poseOf(eye, [target[0], target[1], target[2] + 0.05])), false, 'pan in place');
  assert.equal(apertureJitter(hookPose, poseOf(V.add(eye, V.mul(right, 0.5)), target)), false, 'farther than any aperture');
});
ok('app lens: recognised on a moving camera whose world matrix still holds the frame before (the app reads its aperture plane from it)', () => {
  const target = VIEWS.V2[1], focus = [-0.55, 0.0286, 0.1];
  const eyePrev = VIEWS.V2[0], eyeNow = [eyePrev[0] + 0.004, eyePrev[1] + 0.001, eyePrev[2] - 0.006];
  const stale = lookQuat(eyePrev, target), now = lookQuat(eyeNow, target);
  for (let i = 0; i < 8; i++) {
    const th = i * 2.399963229728653, rr = 0.012 * Math.sqrt((i + 0.5) / 8);
    const fd = V.dot(now.view, V.sub(focus, eyeNow));
    const aim = V.add(eyeNow, V.mul(now.view, fd));
    const p = V.add(V.add(eyeNow, V.mul(stale.right, rr * Math.cos(th))), V.mul(stale.up, rr * Math.sin(th))); // the stale basis
    const render = poseOf(p, aim);
    assert.equal(apertureJitter(poseOf(eyeNow, target), render), false, 'not inside the plane of the current axis');
    assert.ok(apertureJitter(poseOf(eyeNow, target), render, stale.view), `i=${i}: inside the plane of the matrix read at the hook`);
  }
});
ok('app lens: the gate snaps (no easing) and the lens returns at once', () => {
  const g = createGate('live', { fade: true });
  g.step({ dt: 0, speed: 0, cut: true, ballsMoving: false });
  assert.equal(g.amount, 1);
  g.snap(0); assert.equal(g.amount, 0);
  const still = createGate('still', { fade: true });
  still.snap(1); assert.equal(still.amount, 1);
  still.snap(0); assert.equal(still.amount, 0);
  // after a snap to 0 the `still` gate waits for its rest time again
  assert.equal(still.step({ dt: 0.05, speed: 0, cut: false, ballsMoving: false }), 0);
});

// ---- the chain itself, in node: the app's composer (scene/postfx.js) and the club chain on a renderer that draws nothing ---------
// No GPU and no pixels. three comes from the vendored file; the renderer records which material was drawn into which target.
// What this holds: the chain installs and runs without a thrown error on every tier; which stages run at which view; where the
// finished HDR frame is when a reader that is not the screen takes it (the tap protocol, GH-329); and that the app's own
// accumulation lens (main.js renderAccum with opts.dof, reproduced step for step) switches the club lens off for exactly its
// sub-frames, with the camera still, and with a camera a rig moves before each sub-frame.
{
  const { registerHooks } = await import('node:module');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const here = fileURLToPath(new URL('.', import.meta.url));
  const threeUrl = pathToFileURL(`${here}../../vendor/three.module.min.js`).href;
  registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
  const THREE = await import('three');
  const saved = { window: globalThis.window, Image: globalThis.Image };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.Image = class { set src(v) { this._src = v; } };
  const { createPostFX, createAccumulator } = await import('../../scene/postfx.js');
  const { createPost } = await import('../../scene/club/post.js');
  const { TIERS } = await import('../../scene/club/tiers.js');

  const W = 640, H = 360, BALL_R = 0.028575;
  function fakeRenderer(broken = []) {
    let target = null;
    const log = [];
    const programs = new Map();
    return {
      isWebGLRenderer: true, capabilities: { isWebGL2: true, reverseDepthBuffer: false }, autoClear: true, xr: { enabled: false },
      toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.85, outputColorSpace: THREE.SRGBColorSpace,
      info: { autoReset: true, reset() {} }, state: { buffers: { stencil: { setTest() {}, setFunc() {}, setOp() {}, setLocked() {} } } },
      getPixelRatio: () => 1, getSize: (v) => v.set(W, H), getDrawingBufferSize: (v) => v.set(W, H), getContext: () => ({}),
      setRenderTarget(t) { target = t ?? null; }, getRenderTarget: () => target, getClearColor: (c) => c, getClearAlpha: () => 1,
      getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, setClearColor() {}, setClearAlpha() {}, clear() {}, clearDepth() {},
      // as WebGLRenderer.render: the camera's world matrix is brought up to date; then the draw is only recorded
      render(obj, cam) {
        if (cam?.isCamera && cam.parent === null && cam.matrixWorldAutoUpdate !== false) cam.updateMatrixWorld();
        // `drawn`: false for a material named in `broken` (its program did not link: the draw call draws nothing)
        log.push({ what: obj?.isScene ? 'scene' : (obj?.material?.name || obj?.material?.type || '?'), target, material: obj?.material ?? null, drawn: !broken.includes(obj?.material?.name) });
        if (obj?.material && !programs.has(obj.material)) programs.set(obj.material, { currentProgram: { name: obj.material.name, diagnostics: broken.includes(obj.material.name) ? { runnable: false, programLog: 'stand-in: the program did not link' } : undefined } });
      },
      // as three r170's renderer.properties (WebGLProperties) after a material's first draw: `currentProgram` is its program.
      // three links at that draw and does not throw when the link fails: it logs, sets program.diagnostics.runnable = false
      // and the draw call draws nothing; a program that linked with empty logs has no `diagnostics` at all
      properties: { get: (m) => programs.get(m) ?? {} },
      log,
    };
  }
  const LAYOUT = [[-0.55, 0.1], [0.05, -0.05], [0.42, 0.28], [0.7, -0.38], [-0.15, 0.45], [0.62, -0.15], [-0.35, -0.25], [1.05, 0.52], [1.12, -0.5], [0.95, 0.02]];
  async function rig(tier, query = '', broken = []) {
    const renderer = fakeRenderer(broken);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.01, 50);
    const balls = LAYOUT.map(([x, z], id) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 8, 6), new THREE.MeshBasicMaterial()); mesh.position.set(x, BALL_R, z); mesh.updateMatrixWorld(); scene.add(mesh); return { id, mesh, pocketed: false }; });
    const composer = createPostFX(renderer, scene, camera, W, H, { samples: 4 });
    const frameFns = [];
    const club = {
      enabled: true, tier, knobs: TIERS[tier], time: { value: 0 },
      ctx: { renderer, scene, camera, composer, game: { ballSet: { balls } }, query: new URLSearchParams(query) },
      onFrame(fn) { frameFns.push(fn); return () => { const i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); }; },
    };
    const post = await createPost(club);
    post.show?.();
    let clock = 0;
    const look = (id) => { const [p, t, fov] = [VIEWS[id][0], VIEWS[id][1], { V1: 40, V2: 32, V3: 38, V7: 28, V9: 50, TOP: 40 }[id]]; camera.position.set(...p); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(...t); };
    const hooks = (dt = 1 / 60) => { clock += dt; for (const fn of [...frameFns]) fn(clock, dt); };
    const frame = (dt = 1 / 60) => { hooks(dt); renderer.log.length = 0; composer.render(); return post.counts().frame; };
    return { renderer, scene, camera, composer, post, look, hooks, frame, balls };
  }
  const drawsOf = (r, name) => r.renderer.log.filter((d) => d.what === name);

  const high = await rig('high'), base = await rig('base'), lite = await rig('lite');
  const listOf = (r) => r.post.counts().passes.list;
  const fallOf = (r) => r.composer.passes.find((p) => p.uniforms?.strength && p.uniforms?.tDiffuse);
  ok('chain in node: it installs on every tier in the documented order and runs the documented stages at each view, without an error', () => {
    for (const [tier, r] of [['high', high], ['base', base], ['lite', lite]]) {
      assert.equal(r.post.enabled, true, `${tier}: ${r.post.reason}`);
      assert.deepEqual(r.post.counts().errors, [], tier);
      // the occlusion pass and SMAA are off on every tier, whatever the tier table says
      assert.deepEqual([r.post.config.ao, r.post.config.smaa, r.post.ao.enabled, r.post.smaa.enabled], ['off', false, false, false], tier);
      assert.equal(fallOf(r).enabled, false, `${tier}: the app's falloff pass is folded into the grade's draw`);
      assert.equal(r.post.falloff.folded, true);
    }
    // the lens sits after the app's bloom; the app's falloff pass stays in the list, switched off
    assert.deepEqual(listOf(high).map((x) => x.replace(' (off)', '')), ['RenderPass', 'club.depth', 'UnrealBloomPass', 'club.dof', 'ShaderPass', 'club.grade', 'OutputPass']);
    assert.deepEqual(listOf(lite), ['RenderPass', 'UnrealBloomPass', 'ShaderPass (off)', 'club.grade', 'OutputPass']);
    high.look('V2'); high.frame();
    let f = high.frame();
    assert.deepEqual(f.active, ['dof', 'grade']);
    assert.ok(f.dof === 1 && f.viewAperture === 1 && f.depthValid === true && f.appLens === false && f.accum === false && f.folded === true);
    assert.ok(f.tableInFrame === true && f.zone[1] > 2.75 && f.zone[1] < 3.05, `V2: the sharp range ends at ${f.zone[1]} m`);
    assert.ok(f.farPx > 0 && f.farPx <= DOF_DEFAULTS.farMax * H + 1e-6 && f.scale === 2, `far blur at infinity ${f.farPx} px of ${H}`);
    assert.equal(high.post.dof.guard.from, 'default');
    high.look('V7'); high.frame(); f = high.frame();
    assert.ok(f.dof === 1 && Math.abs(f.farPx - DOF_DEFAULTS.farMax * H * f.viewAperture) < 0.02, `V7: the room rule holds the far blur at ${f.farPx} px`);
    high.look('V1'); high.frame(); f = high.frame();
    assert.deepEqual(f.active, ['grade'], 'standing view: no lens');
    assert.equal(f.dof, 0);
    assert.equal(f.depthValid, false, 'standing view: the scene pass resolves colour only');
    high.look('V9'); high.frame(); f = high.frame();
    assert.equal(f.dof, 0);
    base.look('V2'); f = base.frame();
    assert.deepEqual(f.active, ['dof', 'grade'], 'base: the first frame after a cut has the lens (the depth was armed at the frame hook)');
    lite.look('V2'); lite.frame(); f = lite.frame();
    assert.deepEqual(f.active, ['grade']);
    // the cost of a frame in full-screen draws (the scene is one draw here)
    high.look('V2'); high.frame(); high.frame();
    assert.equal(high.post.counts().frame.draws, 4, 'high, low view: lens 3 + grade 1 (the grade stands in for the app\'s falloff draw)');
    lite.frame(); assert.equal(lite.post.counts().frame.draws, 1);
    assert.equal(drawsOf(high, 'scene').length, 1, 'one scene render: the chain adds none');
    assert.equal(high.renderer.log.filter((d) => d.material === fallOf(high).material).length, 0, 'the app\'s falloff pass does not draw');
  });

  // what a frame draws on each tier, at rest and moving (the report's table; --plan prints it)
  const PLAN = {};
  ok('chain in node, tiers: lite adds no draw to the app chain; base runs the lens only at rest and resolves no depth while anything moves; high keeps it while the camera is slow', () => {
    const clubDraws = (r) => r.renderer.log.filter((d) => String(d.what).startsWith('club.')).map((d) => d.what.replace('club.post.', ''));
    const appDraws = (r) => r.renderer.log.filter((d) => !String(d.what).startsWith('club.') && d.what !== 'scene').length;
    const snapshot = (r) => { const c = r.post.counts(); return { club: clubDraws(r), app: appDraws(r), scene: drawsOf(r, 'scene').length, depth: c.frame.depthValid, lens: c.frame.dof }; };
    const fly = (r, step, n = 20) => { let row = null; for (let i = 0; i < n; i++) { r.camera.position.x += step; r.camera.lookAt(0.2, 0, 0); r.frame(1 / 60); row = snapshot(r); } return row; };
    const rest = (r, n = 40) => { let row = null; for (let i = 0; i < n; i++) { r.frame(1 / 60); row = snapshot(r); } return row; };
    for (const [tier, r] of [['lite', lite], ['base', base], ['high', high]]) {
      r.look('V2'); r.frame(); r.frame();
      const row = { restLow: rest(r), start: [0, 1, 2, 3, 4, 5].map(() => fly(r, 0.05, 1)), moving: fly(r, 0.05, 14), slow: fly(r, 0.004) };   // 3 m/s (20 frames in all), then 0.24 m/s
      row.firstMoving = row.start[0]; row.secondMoving = row.start[1];
      r.look('V2'); r.frame(1 / 60);
      row.afterCut = snapshot(r);
      r.look('V1'); r.frame(); row.restStanding = rest(r);
      const c = r.post.counts();
      row.targets = c.targets.map((t) => `${t.name} ${t.w}x${t.h} ${t.bytes}`); row.bytes = c.bytes;
      PLAN[tier] = row;
      for (const k of ['restLow', 'moving', 'slow', 'afterCut', 'restStanding']) assert.equal(row[k].scene, 1, `${tier} ${k}: one scene render`);
    }
    const tournament = PLAN.lite.restLow.app;   // the app's own draws with its falloff folded away: bloom's and the output's
    // lite: one club draw (falloff + grade) in every state, no depth, no target
    for (const k of ['restLow', 'moving', 'slow', 'afterCut', 'restStanding']) {
      assert.deepEqual(PLAN.lite[k].club, ['grade'], `lite ${k}`);
      assert.equal(PLAN.lite[k].depth, false);
    }
    assert.equal(PLAN.lite.bytes.targets + PLAN.lite.bytes.sceneDepthTextures, 0, 'lite: no render target, no depth texture');
    // base: the lens at rest in a low view and nothing else, anywhere
    assert.deepEqual(PLAN.base.restLow.club, ['dofPre', 'dofGather', 'dofComposite', 'grade']);
    // the start of a move: the lens leaves over 4 frames (0.08 s at 60 Hz), each drawing what the resting frame drew; the
    // fifth moving frame draws no lens (its scene pass still resolved the depth once: the frame hook armed it while the
    // lens was not yet at 0); from the sixth on the resolve is colour only
    const LENS = ['dofPre', 'dofGather', 'dofComposite', 'grade'];
    PLAN.base.start.slice(0, 4).forEach((f, i) => {
      assert.deepEqual(f.club, LENS, `base: moving frame ${i + 1} draws the leaving lens`);
      assert.ok(Math.abs(f.lens - (1 - (i + 1) / 4.8)) < 1e-3, `base: moving frame ${i + 1} has the lens at ${f.lens}`);
    });
    assert.deepEqual(PLAN.base.start[4].club, ['grade'], 'base: no lens in the fifth moving frame');
    assert.equal(PLAN.base.start[4].depth, true, 'base: that one frame resolved its depth (one blit), armed before the ramp ended');
    assert.deepEqual(PLAN.base.start[5].club, ['grade']); assert.equal(PLAN.base.start[5].depth, false, 'base: colour-only resolve from the sixth moving frame');
    assert.deepEqual(PLAN.base.moving.club, ['grade']); assert.equal(PLAN.base.moving.depth, false, 'base moving: colour-only resolve');
    assert.deepEqual(PLAN.base.slow.club, ['grade']); assert.equal(PLAN.base.slow.depth, false, 'base moving slowly: still no lens, no depth');
    assert.deepEqual(PLAN.base.restStanding.club, ['grade']); assert.equal(PLAN.base.restStanding.depth, false);
    assert.deepEqual(PLAN.base.afterCut.club, ['dofPre', 'dofGather', 'dofComposite', 'grade']);
    // high: as base at rest; fast camera: no lens and no depth; slow camera: the lens
    assert.deepEqual(PLAN.high.restLow.club, PLAN.base.restLow.club);
    assert.deepEqual(PLAN.high.moving.club, ['grade']); assert.equal(PLAN.high.moving.depth, false);
    assert.deepEqual(PLAN.high.slow.club, ['dofPre', 'dofGather', 'dofComposite', 'grade']);
    assert.deepEqual(PLAN.high.restStanding.club, ['grade']); assert.equal(PLAN.high.restStanding.depth, false);
    // the lens's targets: two half-float working targets, the same on base and high, and the two depth textures
    assert.equal(PLAN.base.bytes.targets, 2 * (W / 2) * (H / 2) * 8);
    assert.equal(PLAN.high.bytes.total, PLAN.base.bytes.total);
    assert.ok(tournament >= 1);
    if (process.argv.includes('--plan')) console.log(JSON.stringify(PLAN, null, 1));
  });
  const baseCut = await rig('base', 'clubpost=stillout:0');
  ok('chain in node, the cut (clubpost=stillout:0, round 2\'s gate): on base no frame of a move draws the lens, camera or ball', () => {
    const r = baseCut;
    const clubDraws = () => r.renderer.log.filter((d) => String(d.what).startsWith('club.')).map((d) => d.what.replace('club.post.', ''));
    assert.equal(r.post.dof.stillOut, 0); assert.equal(r.post.counts().config.stillOut, 0);
    r.look('V2'); r.frame(); r.frame();
    for (let i = 0; i < 40; i++) r.frame(1 / 60);
    assert.deepEqual(clubDraws(), ['dofPre', 'dofGather', 'dofComposite', 'grade'], 'at rest: the lens');
    const rows = [];
    for (let i = 0; i < 12; i++) { r.camera.position.x += 0.05; r.camera.lookAt(0.2, 0, 0); const f = r.frame(1 / 60); rows.push({ club: clubDraws(), depth: f.depthValid, lens: f.dof }); }
    rows.forEach((f, i) => { assert.deepEqual(f.club, ['grade'], `moving frame ${i + 1}`); assert.equal(f.lens, 0); assert.equal(f.depth, i === 0, `moving frame ${i + 1}: depth resolved ${f.depth}`); });
    // a ball moves, the camera rests
    r.look('V2'); r.post.dof.snap(); r.frame(); r.frame();
    assert.equal(r.post.counts().frame.dof, 1);
    r.balls[2].mesh.position.x += 0.002; r.balls[2].mesh.updateMatrixWorld();
    let f = r.frame(1 / 60);
    assert.deepEqual(clubDraws(), ['grade'], 'the first frame of a rolling ball'); assert.equal(f.dof, 0);
    // the default on the same rig, set at run time: the ramp
    r.post.dof.stillOut = 0.08; r.post.dof.snap(); r.frame(); r.frame();
    r.balls[2].mesh.position.x += 0.002; r.balls[2].mesh.updateMatrixWorld();
    f = r.frame(1 / 60);
    assert.deepEqual(clubDraws(), ['dofPre', 'dofGather', 'dofComposite', 'grade']); assert.ok(Math.abs(f.dof - (1 - 1 / 4.8)) < 1e-3);
  });

  const folded0 = await rig('base', 'clubpost=fold:0'), ctlOff = await rig('high', 'clubpost=guard:off'), ctlMask = await rig('high', 'clubpost=guard:mask'), aoOn = await rig('high', 'clubpost=ao:live');
  ok('chain in node, the switches: fold:0 is round 1\'s chain (the app\'s falloff draws, then the grade); grade strength 0 gives the app\'s falloff back', () => {
    assert.equal(fallOf(folded0).enabled, true);
    folded0.look('V1'); folded0.frame(); folded0.frame();
    assert.equal(folded0.renderer.log.filter((d) => d.material === fallOf(folded0).material).length, 1, 'the app\'s falloff pass draws');
    assert.equal(folded0.post.counts().frame.folded, false);
    // a grade that would change nothing is not drawn, and the app's falloff pass is back on: the frame is the app's frame
    base.look('V1'); base.frame();
    const s0 = base.post.grade.strength, e0 = base.post.grade.exposure;
    base.post.grade.strength = 0; base.post.grade.exposure = 1;
    assert.equal(fallOf(base).enabled, true);
    let f = base.frame();
    assert.deepEqual(f.active, []); assert.equal(f.folded, false);
    base.post.grade.strength = s0; base.post.grade.exposure = e0;
    assert.equal(fallOf(base).enabled, false);
    f = base.frame();
    assert.deepEqual(f.active, ['grade']); assert.equal(f.folded, true);
  });
  ok('chain in node, the proof\'s controls: guard:off and guard:mask focus a plain lens where the camera looks; the tool\'s occlusion pass still runs behind its switch', () => {
    for (const r of [ctlOff, ctlMask]) {
      r.look('V2'); r.frame(); const f = r.frame();
      assert.ok(Math.abs(f.zone[1] - Math.hypot(1.55, 0.32, 0.22)) < 1e-3, `the control's range ends at the axis point (${f.zone[1]})`);
      assert.equal(f.dof, 1);
    }
    assert.equal(ctlOff.post.dof.guard.mode, 'off'); assert.equal(ctlMask.post.dof.guard.mode, 'mask');
    aoOn.look('V2'); aoOn.frame(); const f = aoOn.frame();
    assert.deepEqual(f.active, ['depth', 'ao', 'dof', 'grade']);
    assert.equal(aoOn.post.counts().frame.draws, 8, 'linear depth copy 1 + occlusion 3 + lens 3 + grade 1');
  });
  const { workScale, DOF_GATHER_MAX } = await import('../../scene/club/post/dof.js');
  ok('lens, working resolution: half the frame up to 1440 px, never more than 720 rows; the room\'s largest blur fits the gather at every size; 360 rows is round 2\'s rule', () => {
    const sizes = [360, 720, 900, 1080, 1440, 1441, 1620, 2160, 2880, 4320];
    assert.deepEqual(sizes.map((h) => workScale(h)), [2, 2, 2, 2, 2, 3, 3, 3, 4, 6]);
    assert.deepEqual(sizes.map((h) => workScale(h, 360)), [2, 2, 3, 3, 4, 5, 5, 6, 6, 6], 'the cheaper far field a tier may ask for');
    assert.equal(workScale(1440, 0), 2); assert.equal(workScale(1440, NaN), 2);
    for (const h of [720, 1080, 1440, 2160, 2880]) {
      const s = workScale(h), rows = Math.floor(h / s), far = DOF_DEFAULTS.farMax * h / s;
      assert.ok(rows >= 360 && rows <= 720, `${h}: ${rows} working rows`);
      assert.ok(far <= DOF_GATHER_MAX, `${h}: the room's largest blur is ${far.toFixed(2)} working pixels`);
      // the blur of the bar (0.35 to 0.6 of the far cap) in working texels: under 2.4 at 360 rows, 2.8 to 4.8 at 720
      if (h >= 1440) assert.ok(0.35 * far > 2.7, `${h}: the smallest disc of the room has ${(0.35 * far).toFixed(2)} working texels of radius`);
    }
    assert.equal(DOF_GATHER_MAX, 8);
  });
  ok('chain in node, a ball in the air: the table volume grows to hold it, and so does the sharp range', () => {
    high.look('V2'); high.frame(); const before = high.frame().zone[1];
    const top0 = high.post.dof.guard.max[1];
    const b = high.balls[7]; const y0 = b.mesh.position.y;
    b.mesh.position.y = 0.6; b.mesh.updateMatrixWorld();
    high.frame(); const f = high.frame();
    assert.ok(high.post.dof.guard.max[1] > 0.6 + BALL_R && top0 < 0.2, 'the volume holds the ball');
    assert.ok(f.zone[1] >= before, 'the sharp range did not shrink');
    b.mesh.position.y = y0; b.mesh.updateMatrixWorld(); high.frame();
  });

  ok('chain in node, the taps: the finished HDR frame is in composer.writeBuffer after a frame and in composer.readBuffer inside an accumulate, lens on or off', () => {
    for (const [name, r, view] of [['high V2', high, 'V2'], ['high V1', high, 'V1'], ['base V2', base, 'V2'], ['lite V2', lite, 'V2']]) {
      r.look(view); r.frame(); r.frame();
      const grade = drawsOf(r, 'club.post.grade');
      assert.equal(grade.length, 1, `${name}: one grade draw`);
      assert.equal(grade[0].target, r.composer.writeBuffer, `${name}: after a frame the graded frame is in writeBuffer (the ink sampler's tap)`);
      assert.equal(r.post.hdrTap, r.composer.writeBuffer, `${name}: post.hdrTap`);
      assert.equal(r.renderer.log.at(-1).target, null, `${name}: the last draw of a frame goes to the screen`);
      // the accumulator's sub-frame: the OutputPass off, composer.readBuffer summed (postfx.js createAccumulator.add)
      const acc = createAccumulator(r.composer);
      acc.begin();
      for (let k = 0; k < 3; k++) { // an odd and an even number of buffer swaps behind it
        r.hooks(0.002); r.renderer.log.length = 0;
        acc.add(1 / 3);
        const g = drawsOf(r, 'club.post.grade');
        assert.equal(g.length, 1, `${name}: one grade draw in a sub-frame`);
        assert.equal(g[0].target, r.composer.readBuffer, `${name}, sub-frame ${k}: the graded frame is what the accumulator sums`);
        const sum = r.renderer.log.at(-1);
        assert.ok(sum.target && sum.target !== r.composer.readBuffer && sum.target !== r.composer.writeBuffer, `${name}: the sum goes to the accumulator's own target`);
        assert.equal(r.post.counts().frame.accum, !name.startsWith('lite'), `${name}: the chain knows it is inside an accumulate (the lite chain has no lens and does not look)`);
      }
      acc.resolve(); acc.dispose();
      r.frame();
      assert.equal(drawsOf(r, 'club.post.grade')[0].target, r.composer.writeBuffer, `${name}: and back in writeBuffer on the next frame`);
    }
  });

  // main.js renderAccum(subs, { dof }) step for step: per sub-frame the frame hooks, then the eye on a golden-spiral aperture
  // disc (its plane read from camera.matrixWorld) re-aimed at the focus depth on the view axis, one accumulator sub-frame,
  // the pose restored
  function appAccum(r, N, dof, move = null) {
    const acc = createAccumulator(r.composer);
    const { camera } = r;
    const rows = [];
    acc.begin();
    for (let i = 0; i < N; i++) {
      if (move) move(camera, i);                    // a camera rig, on the frame bus before the club's hook
      r.hooks(i === 0 ? 1 / 60 - (N - 1) * 0.0018 : 0.0018);
      let was = null;
      if (dof) {
        was = { p: camera.position.clone(), q: camera.quaternion.clone() };
        const th = i * 2.399963229728653, rr = dof.r * Math.sqrt((i + 0.5) / N);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const view = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const fd = Math.max(camera.near, view.dot(new THREE.Vector3(...dof.focus).sub(camera.position)));
        const aim = camera.position.clone().addScaledVector(view, fd);
        camera.position.addScaledVector(right, rr * Math.cos(th)).addScaledVector(up, rr * Math.sin(th));
        camera.lookAt(aim); camera.updateMatrixWorld();
      }
      acc.add(1 / N);
      const f = r.post.counts().frame;
      rows.push({ appLens: f.appLens, dof: f.dof, lensDrawn: f.active.includes('dof') });
      if (was) { camera.position.copy(was.p); camera.quaternion.copy(was.q); camera.updateMatrixWorld(); }
    }
    acc.resolve(); acc.dispose();
    return rows;
  }
  const DOF = { r: 0.012, focus: [-0.55, BALL_R, 0.1] };
  ok('chain in node, the app\'s lens: every sub-frame of an accumulate with the app\'s depth of field runs without the club lens, from the first; the next frame has it back', () => {
    for (const [name, r] of [['high', high], ['base', base]]) {
      r.look('V2'); r.frame(); r.frame();
      assert.equal(r.post.counts().frame.dof, 1, `${name}: the club lens is on before the export`);
      const n0 = r.post.dof.appLensFrames;
      for (const N of [8, 16]) {
        const rows = appAccum(r, N, DOF);
        assert.ok(rows.every((x) => x.appLens === true && x.dof === 0 && x.lensDrawn === false), `${name}, ${N} sub-frames: ${JSON.stringify(rows.slice(0, 3))}`);
        const f = r.frame();
        assert.ok(f.dof === 1 && f.appLens === false && f.active.includes('dof'), `${name}: the frame after the accumulate has the club lens at once (${f.dof})`);
      }
      assert.equal(r.post.dof.appLensFrames - n0, 24);
      // a shutter-only accumulate (no app lens): the club lens stays, as on the screen
      const plain = appAccum(r, 8, null);
      assert.ok(plain.every((x) => x.appLens === false && x.dof === 1 && x.lensDrawn === true), `${name}: shutter only ${JSON.stringify(plain.slice(0, 3))}`);
    }
  });
  ok('chain in node, the app\'s lens on a moving camera: recognised on every sub-frame while a rig orbits, dollies or trucks the camera', () => {
    high.look('V2'); high.frame(); high.frame();
    const target = new THREE.Vector3(0.2, 0, 0);
    const moves = {
      // slow moves (under the lens's fade band): the club lens would be fully on without the app's lens
      orbit: (cam, i) => { const a = 0.0004; const d = cam.position.clone().sub(target); cam.position.set(target.x + d.x * Math.cos(a) - d.z * Math.sin(a), cam.position.y, target.z + d.x * Math.sin(a) + d.z * Math.cos(a)); cam.lookAt(target); },
      dolly: (cam) => { cam.position.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), 0.0005); },
      truck: (cam) => { cam.position.x += 0.0003; cam.position.z -= 0.0004; },
    };
    for (const [name, move] of Object.entries(moves)) {
      high.look('V2'); high.frame(); high.frame();
      // the same move without the app's lens: the club lens stays on (the move is slow), nothing is taken for a jitter
      const without = appAccum(high, 8, null, move);
      assert.ok(without.every((x) => x.appLens === false), `${name}: the rig alone is not taken for the app's lens`);
      assert.ok(without.every((x) => x.dof > 0.9), `${name}: a slow move keeps the club lens (${without.map((x) => x.dof)})`);
      const rows = appAccum(high, 8, DOF, move);
      assert.ok(rows.every((x) => x.appLens === true && x.dof === 0), `${name} + app lens: ${JSON.stringify(rows)}`);
      const f = high.frame();
      assert.ok(f.dof > 0.9 && f.appLens === false, `${name}: back at once after the export (${f.dof})`);
    }
    // the switch off (tools): the round-1 behaviour, the club lens overlaps the app's and only eases out
    high.look('V2'); high.frame(); high.frame();
    high.post.dof.detectAppLens = false;
    const old = appAccum(high, 8, DOF);
    high.post.dof.detectAppLens = true;
    assert.ok(old.every((x) => x.appLens === false && x.lensDrawn) && old[0].dof > 0.9 && old.at(-1).dof > 0.5, `detection off: both lenses, the club one only easing out (${old.map((x) => x.dof)})`);
  });
  // A program that does not link. The stand-in presents it the way three does (see fakeRenderer `properties`): the draw
  // returns without a throw, nothing is drawn, the material's program says diagnostics.runnable === false. What this holds:
  // given that presentation, the chain refuses the draw, does not swap the undrawn buffer in, stands down and gives the app's
  // falloff pass back. What it does not hold: that a GPU driver's failed link reaches three that way, and any pixel.
  const noGrade = await rig('lite', '', ['club.post.grade']), noComposite = await rig('high', '', ['club.post.dofComposite']), noPre = await rig('base', '', ['club.post.dofPre']);
  ok('chain in node, a program that does not link: the undrawn buffer is not swapped in, the chain stands down in that frame and the app\'s falloff pass draws again', () => {
    const clubDraws = (r) => r.renderer.log.filter((d) => String(d.what).startsWith('club.')).map((d) => d.what.replace('club.post.', ''));
    const fallDraws = (r) => r.renderer.log.filter((d) => d.material === fallOf(r).material).length;
    const sceneTex = (r) => drawsOf(r, 'scene')[0].target.texture;
    const shownTex = (r) => r.composer.passes.at(-1).uniforms.tDiffuse.value;   // what the OutputPass puts on the screen
    const warned = [], warn = console.warn;
    console.warn = (...a) => { warned.push(String(a[0])); };   // the chain's one warning per failure, kept out of this arm's output
    // the grade (every tier, from the first frame of the look): its draw is refused, the frame on the screen is the scene's
    noGrade.look('V1');
    assert.equal(fallOf(noGrade).enabled, false, 'until the first draw the app\'s falloff is folded into the grade');
    noGrade.frame();
    assert.deepEqual(clubDraws(noGrade), ['grade'], 'the grade was tried once');
    assert.ok(shownTex(noGrade) === sceneTex(noGrade), 'the OutputPass shows the buffer the scene was drawn into, not the one the grade did not draw');
    assert.ok(noGrade.renderer.log.some((d) => d.drawn && d.target?.texture === shownTex(noGrade)), 'a buffer that was drawn this frame');
    assert.equal(noGrade.post.counts().errors.length, 1, `the failed link is reported: ${JSON.stringify(noGrade.post.counts().errors)}`);
    assert.match(noGrade.post.counts().errors[0], /^grade: the program of club\.post\.grade did not link$/);
    assert.equal(fallOf(noGrade).enabled, true, 'the app\'s falloff pass is switched on again');
    assert.equal(noGrade.post.falloff.folded, false);
    for (let i = 0; i < 3; i++) {
      noGrade.frame();
      assert.deepEqual(clubDraws(noGrade), [], 'no club draw after the failure');
      assert.equal(fallDraws(noGrade), 1, 'the app\'s falloff pass draws: the app chain');
      assert.ok(noGrade.renderer.log.some((d) => d.drawn && d.target?.texture === shownTex(noGrade)), 'the frame on the screen was drawn this frame');
    }
    assert.ok(listOf(noGrade).includes('club.grade (off)') && listOf(noGrade).includes('ShaderPass'));
    // the lens (its first draw is the first low view at rest, in plain sight): the composite, and the prefilter before it
    for (const [name, r, tried] of [['dofComposite', noComposite, ['dofPre', 'dofGather', 'dofComposite']], ['dofPre', noPre, ['dofPre']]]) {
      r.look('V2'); r.frame();
      assert.deepEqual(clubDraws(r), tried, `${name}: the lens stops at the program that did not link, and the grade does not draw`);
      assert.equal(r.post.counts().errors.length, 1, `${name}: the failed link is reported: ${JSON.stringify(r.post.counts().errors)}`);
      assert.match(r.post.counts().errors[0], new RegExp(`^dof: the program of club\\.post\\.${name} did not link$`));
      // the app's falloff sits after the lens: it is back in this same frame, and it reads the sharp scene frame
      assert.equal(fallOf(r).enabled, true, `${name}: the app's falloff pass is switched on again`);
      assert.equal(fallDraws(r), 1, `${name}: and it draws in the frame of the failure`);
      assert.ok(fallOf(r).uniforms.tDiffuse.value === sceneTex(r), `${name}: it reads the buffer the scene was drawn into, not the one the lens did not draw`);
      assert.ok(r.renderer.log.some((d) => d.drawn && d.target?.texture === shownTex(r)), `${name}: the frame on the screen was drawn this frame`);
      r.frame();
      assert.deepEqual(clubDraws(r), [], `${name}: no club draw after the failure`);
      assert.equal(fallDraws(r), 1);
    }
    console.warn = warn;
    assert.ok(warned.length === 3 && warned.every((w) => w.startsWith('[club] post: ') && w.includes('the app chain stays')), `one warning per failure: ${JSON.stringify(warned)}`);
    // the controls: a program that linked (no diagnostics), and one that linked with a log (runnable: true), are drawn as before
    lite.look('V1'); lite.frame();
    const prog = lite.renderer.properties.get(drawsOf(lite, 'club.post.grade')[0].material).currentProgram;
    assert.equal(prog.diagnostics, undefined);
    prog.diagnostics = { runnable: true, programLog: 'stand-in: a warning' };
    const f = lite.frame();
    assert.deepEqual(f.active, ['grade']); assert.deepEqual(lite.post.counts().errors, []); assert.equal(fallOf(lite).enabled, false);
    delete prog.diagnostics;
  });
  ok('chain in node: dispose puts the app chain back (pass list, bloom, falloff, the composer targets\' depth)', () => {
    const r = high;
    const bloom = r.composer.__obCine.bloom, fall = r.composer.passes.find((p) => p.uniforms?.strength);
    assert.equal(bloom.threshold, CLUB_TUNE.bloom.threshold);
    assert.equal(fall.uniforms.strength.value, CLUB_TUNE.falloff);
    r.post.dispose();
    assert.deepEqual(r.composer.passes.map((p) => p.constructor.name), ['RenderPass', 'UnrealBloomPass', 'ShaderPass', 'OutputPass']);
    assert.ok(bloom.threshold === 1.1 && bloom.strength === 0.16 && fall.uniforms.strength.value === 0.46, 'the app\'s own values');
    assert.equal(fall.enabled, true, 'the app\'s falloff pass draws again');
    assert.ok(r.composer.renderTarget1.depthTexture == null && r.composer.renderTarget1.resolveDepthBuffer === false);
    r.renderer.log.length = 0; r.composer.render();
    assert.equal(r.renderer.log.filter((d) => String(d.what).startsWith('club.')).length, 0, 'no club draw after dispose');
  });
  globalThis.window = saved.window; globalThis.Image = saved.Image;
  if (saved.window === undefined) delete globalThis.window;
  if (saved.Image === undefined) delete globalThis.Image;
}

console.log(`test-club-post: ${n} arms OK`);
