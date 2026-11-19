// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-occ.mjs — node arm for the occlusion service's pure logic: the closed-form cue (tapered capsule) shadow under the
// rectangular lamp against a brute-force ray test, its culling rectangle, and the shape of the shader patches.
// Run: node web/tools/club/test-club-occ.mjs   (--stats prints the error table, --physics the reference numbers: what the lamp
// leaves under a cushion nose, around a ball and under the cue, --full the finer brute-force grid: about 9 s instead of 3)
import assert from 'node:assert/strict';
import { cueShadow, cueShadowBounds, CUE_SHADOW_GLSL } from '../../scene/club/occ/capsule.js';
import { applyPatchText } from '../../scene/club/patchtext.js';
import { occPatchSpec, occRails, OCC_PATCH_VERSION, OCC_GLSL, OCC_TABLE_GLSL } from '../../scene/club/occ/glsl.js';
import { SKY, OCC_K, OCC_CONTACT, OCC_AMBIENT, FLOOR_K, FLOOR_AMBIENT_STRENGTH, FLOOR_AMBIENT_REACH } from '../../scene/club/occ/model.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const STATS = process.argv.includes('--stats');
const PHYSICS = process.argv.includes('--physics');
const FULL = process.argv.includes('--full'); // the brute-force lamp grid of round 1 (96 x 40, about 9 s); the default grid is 48 x 20

// deterministic rng (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the floor beside the table: what the floor bake holds (a solid block: it is made from a height map) against the table
// as it stands (a body on legs, room light passing under it), for a horizontal receiver under the room's radiance profile ----
function floorAmbient(P, boxes, reach, NA = 360, NE = 90) {
  const L = (el) => (el <= SKY[0] ? 1 : el >= SKY[1] ? SKY[2] : 1 + (SKY[2] - 1) * (el - SKY[0]) / (SKY[1] - SKY[0]));
  const hit = (d, b) => {
    let t0 = 0, t1 = reach;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-12) { if (P[i] < b[0][i] || P[i] > b[1][i]) return false; continue; }
      let x = (b[0][i] - P[i]) / d[i], y = (b[1][i] - P[i]) / d[i]; if (x > y) [x, y] = [y, x];
      t0 = Math.max(t0, x); t1 = Math.min(t1, y); if (t0 > t1) return false;
    }
    return true;
  };
  let num = 0, den = 0;
  for (let i = 0; i < NA; i++) {
    const az = (i + 0.5) / NA * 2 * Math.PI;
    for (let j = 0; j < NE; j++) {
      const el = (j + 0.5) / NE * Math.PI / 2;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const w = L(el) * Math.sin(el) * Math.cos(el);
      den += w; if (!boxes.some((b) => hit(d, b))) num += w;
    }
  }
  return num / den;
}
const TABLE = { hx: 1.45, hz: 0.85, top: 0.79, body: 0.49 };
const tableSolid = [[[-TABLE.hx, 0, -TABLE.hz], [TABLE.hx, TABLE.top, TABLE.hz]]];
const tableOpen = [[[-TABLE.hx, TABLE.body, -TABLE.hz], [TABLE.hx, TABLE.top, TABLE.hz]]];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) tableOpen.push([[sx * (TABLE.hx - 0.27) - 0.08, 0, sz * (TABLE.hz - 0.27) - 0.08], [sx * (TABLE.hx - 0.27) + 0.08, TABLE.body, sz * (TABLE.hz - 0.27) + 0.08]]);

ok('floor: the ambient strength makes the solid block of the bake read as the table on its legs, from the rail out to 1.5 m', () => {
  assert.equal(FLOOR_K[1], FLOOR_AMBIENT_STRENGTH); assert.equal(FLOOR_K.length, 4); assert.ok(Object.isFrozen(FLOOR_K) && Object.isFrozen(OCC_K));
  const rows = [];
  for (const d of [0.1, 0.25, 0.5, 0.75, 1.0, 1.5]) {
    const P = [0, 0.004, TABLE.hz + d];
    const solid = floorAmbient(P, tableSolid, FLOOR_AMBIENT_REACH), open = floorAmbient(P, tableOpen, FLOOR_AMBIENT_REACH);
    const shown = 1 - FLOOR_AMBIENT_STRENGTH * (1 - solid);
    rows.push({ d, solid, open, shown });
    assert.ok(open > solid, `light passes under the body at ${d} m`);
    assert.ok(Math.abs(shown - open) < 0.02, `${d} m: the strength shows ${shown.toFixed(3)}, the table on its legs is ${open.toFixed(3)}`);
  }
  // the numbers the comment in occ/model.js quotes
  const near = (k, want) => rows.forEach((r, i) => assert.ok(Math.abs(r[k] - want[i]) < 0.008, `${k} at ${r.d} m: ${r[k].toFixed(3)} against ${want[i]}`));
  near('solid', [0.54, 0.60, 0.69, 0.755, 0.815, 0.91]);
  near('open', [0.60, 0.655, 0.73, 0.795, 0.85, 0.94]);
  near('shown', [0.61, 0.66, 0.735, 0.79, 0.845, 0.925]);
  // no other strength in steps of 0.05 fits the ring better (worst error over the six distances)
  const worst = (k) => Math.max(...rows.map((r) => Math.abs(1 - k * (1 - r.solid) - r.open)));
  for (const k of [0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 0.95, 1.0]) assert.ok(worst(k) > worst(FLOOR_AMBIENT_STRENGTH), `strength ${k}: worst error ${worst(k).toFixed(3)} against ${worst(FLOOR_AMBIENT_STRENGTH).toFixed(3)}`);
  // without the strength (the bare solid block) the ring would be 3 to 6 % of the floor's ambient light too dark
  for (const r of rows) assert.ok(r.open - r.solid > 0.025 && r.open - r.solid < 0.065, `${r.d} m: ${(r.open - r.solid).toFixed(3)}`);
  if (PHYSICS) { console.log('\nphysics 5: ambient visibility of the floor beside the long rail: distance | solid block (the bake) | body on legs | shown at strength ' + FLOOR_AMBIENT_STRENGTH); for (const r of rows) console.log(`    ${r.d.toFixed(2)} m  ${r.solid.toFixed(3)}  ${r.open.toFixed(3)}  ${r.shown.toFixed(3)}`); }
});

ok('model: the contact knob is one number, a share between the physical band (0) and the whole ambient rail (1)', () => {
  assert.equal(OCC_K[0], OCC_CONTACT); assert.ok(OCC_CONTACT >= 0 && OCC_CONTACT <= 1);
  assert.equal(OCC_CONTACT, 0.25, 'the round-2 retune (occ/model.js has the measurements); a change here needs a new pair at V4 and V7');
  assert.equal(occRails({ D: 1, I: 2, ambVis: 0.5 }).total, occRails({ D: 1, I: 2, ambVis: 0.5, kx: OCC_CONTACT }).total, 'the JS twin takes the knob from the model');
  assert.deepEqual(OCC_K.slice(1), [1, 1, 1], 'the physical terms stand at full strength');
  assert.equal(OCC_AMBIENT, 0.2);
  // what the knob does to the cloth 1 cm in front of a nose (ambient visibility 0.61) and at 5 cm (0.80), D : I = 1 : 2
  const at = (ambVis, kx) => occRails({ D: 1, I: 2, ambVis, kx }).total / 3;
  assert.ok(at(0.61, OCC_CONTACT) < at(0.61, 0), 'the knob deepens the band');
  assert.ok(at(0.8, OCC_CONTACT) > at(0.61, OCC_CONTACT), 'and keeps its falloff');
});

// ---- brute force: the share of lamp points whose ray to the receiver misses the sphere-swept tapered capsule ----
// distance from point x to the segment p -> s
function distPointSeg(x, p, s) {
  const dx = s[0] - p[0], dy = s[1] - p[1], dz = s[2] - p[2];
  const wx = x[0] - p[0], wy = x[1] - p[1], wz = x[2] - p[2];
  const t = Math.max(0, Math.min(1, (wx * dx + wy * dy + wz * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(wx - dx * t, wy - dy * t, wz - dz * t);
}
// the ray p -> s is blocked when some axis station u has dist(axis(u), ray) <= r(u); that gap is convex in u (a norm of an
// affine map minus a linear radius), so a ternary search finds its minimum
function blocked(p, s, a, b, ra, rb) {
  const gap = (u) => distPointSeg([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], p, s) - (ra + (rb - ra) * u);
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (gap(m1) < gap(m2)) hi = m2; else lo = m1;
  }
  return gap((lo + hi) / 2) <= 0;
}
function bruteVisibility(p, a, b, ra, rb, lp, lh, nx = FULL ? 96 : 48, nz = FULL ? 40 : 20) {
  let free = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const s = [lp[0] + lh[0] * (2 * (i + 0.5) / nx - 1), lp[1], lp[2] + lh[1] * (2 * (j + 0.5) / nz - 1)];
      if (!blocked(p, s, a, b, ra, rb)) free += 1;
    }
  }
  return free / (nx * nz);
}

// the app's canopy lamp and cue (numbers mirrored from web/scene/room.js LIGHT_POS / LIGHT_W / LIGHT_D and web/scene/cuestick.js
// for this test only; the service reads the live values)
const LAMP = [0, 1.02, 0], HALF = [1.025, 0.33];
const R_TIP = 0.00625, R_BUTT = 0.0146, CUE_LEN = 1.477;

function cueAt(tip, azimuth, elevation) {
  const c = Math.cos(elevation), s = Math.sin(elevation);
  return [tip, [tip[0] + Math.cos(azimuth) * c * CUE_LEN, tip[1] + s * CUE_LEN, tip[2] + Math.sin(azimuth) * c * CUE_LEN]];
}

ok('cue shadow: far from the cue the lamp is fully visible; right under the shaft it is mostly hidden', () => {
  const [a, b] = cueAt([0.2, 0.03, 0.1], 0.4, 0.08);
  assert.equal(cueShadow([-1.0, 0, -0.5], a, b, R_TIP, R_BUTT, LAMP, HALF), 1);
  // a receiver 3 mm under the lower surface of the shaft, 0.3 m up the cue
  const u = 0.3 / CUE_LEN;
  const x = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const r = R_TIP + (R_BUTT - R_TIP) * u;
  const v = cueShadow([x[0], x[1] - r - 0.003, x[2]], a, b, R_TIP, R_BUTT, LAMP, HALF);
  assert.ok(v < 0.2, `visibility right under the shaft ${v}`);
  // a receiver above the whole cue is never shadowed by it
  assert.equal(cueShadow([0.5, 0.9, 0.2], a, b, R_TIP, R_BUTT, LAMP, HALF), 1);
});

ok('cue shadow: the closed form matches the brute-force ray test over play poses', () => {
  const rand = rng(20261113);
  let worst = 0, sum = 0, count = 0, shadowed = 0, worstCase = null;
  const rows = [];
  for (let c = 0; c < 140; c++) {
    const tip = [-0.9 + 1.8 * rand(), 0.012 + 0.05 * rand(), -0.45 + 0.9 * rand()];
    const az = rand() * Math.PI * 2;
    const el = (1.5 + 38 * rand() * rand()) * Math.PI / 180; // mostly low, some jacked up
    const [a, b] = cueAt(tip, az, el);
    for (let k = 0; k < 6; k++) {
      // receivers on the cloth (y = 0) or a rail top (y = 0.045 when the cue clears it), near the cue's ground track
      const u = rand() * 0.55;
      const side = (rand() - 0.5) * 0.24;
      const along = (rand() - 0.5) * 0.06 - (k === 0 ? 0.03 : 0);
      const dirx = Math.cos(az), dirz = Math.sin(az);
      const gx = a[0] + (b[0] - a[0]) * u + dirx * along - dirz * side;
      const gz = a[2] + (b[2] - a[2]) * u + dirz * along + dirx * side;
      const cueY = a[1] + (b[1] - a[1]) * u;
      const y = (k === 5 && cueY > 0.07) ? 0.045 : 0;
      const p = [gx, y, gz];
      const model = cueShadow(p, a, b, R_TIP, R_BUTT, LAMP, HALF);
      const brute = bruteVisibility(p, a, b, R_TIP, R_BUTT, LAMP, HALF);
      const err = Math.abs(model - brute);
      if (brute < 0.995) shadowed += 1;
      if (err > worst) { worst = err; worstCase = { p, a, b, model, brute }; }
      sum += err; count += 1;
      rows.push([err, model, brute]);
    }
  }
  if (STATS) {
    rows.sort((x, y) => y[0] - x[0]);
    console.log(`  cases ${count}, shadowed ${shadowed}, mean |err| ${(sum / count).toFixed(4)}, worst ${worst.toFixed(4)}`);
    console.log('  worst five (err, model, brute):', rows.slice(0, 5).map((r) => r.map((v) => +v.toFixed(3))));
    console.log('  worst case:', JSON.stringify(worstCase));
  }
  assert.ok(shadowed > count * 0.4, `the sample must exercise shadowed receivers (${shadowed} of ${count})`);
  assert.ok(sum / count < 0.001, `mean |error| ${sum / count}`);
  assert.ok(worst < 0.02, `worst |error| ${worst}`);
});

ok('cue shadow: an off-centre lamp and a lamp turned 90 degrees keep the same accuracy', () => {
  const rand = rng(77);
  let worst = 0;
  for (const [lp, lh] of [[[0.4, 1.3, -0.2], [0.3, 0.9]], [[-0.6, 0.85, 0.1], [0.5, 0.5]]]) {
    for (let c = 0; c < 40; c++) {
      const tip = [-0.7 + 1.4 * rand(), 0.015 + 0.04 * rand(), -0.4 + 0.8 * rand()];
      const [a, b] = cueAt(tip, rand() * Math.PI * 2, (2 + 20 * rand()) * Math.PI / 180);
      const u = rand() * 0.4, side = (rand() - 0.5) * 0.2;
      const p = [a[0] + (b[0] - a[0]) * u + side, 0, a[2] + (b[2] - a[2]) * u - side * 0.5];
      worst = Math.max(worst, Math.abs(cueShadow(p, a, b, R_TIP, R_BUTT, lp, lh) - bruteVisibility(p, a, b, R_TIP, R_BUTT, lp, lh)));
    }
  }
  if (STATS) console.log(`  worst ${worst.toFixed(4)}`);
  assert.ok(worst < 0.02, `worst |error| ${worst}`);
});

ok('cue shadow: the shadow is deeper and narrower toward the tip (it sharpens as the cue nears the cloth)', () => {
  const [a, b] = cueAt([0, 0.02, 0], 0, 6 * Math.PI / 180); // along +x, the lamp's long axis
  const profile = (u) => {
    const x = a[0] + (b[0] - a[0]) * u;
    const centre = cueShadow([x, 0, 0], a, b, R_TIP, R_BUTT, LAMP, HALF);
    let half = 0; // half-width at half depth
    for (let z = 0; z < 0.2; z += 0.0005) {
      if (1 - cueShadow([x, 0, z], a, b, R_TIP, R_BUTT, LAMP, HALF) < (1 - centre) / 2) { half = z; break; }
    }
    return { centre, half };
  };
  const near = profile(0.05), far = profile(0.5);
  assert.ok(near.centre < far.centre - 0.1, `darker near the tip: ${near.centre} vs ${far.centre}`);
  assert.ok(near.half < far.half, `narrower near the tip: ${near.half} vs ${far.half}`);
});

ok('cue shadow: nothing outside the culling rectangle is shadowed', () => {
  const rand = rng(5);
  for (let c = 0; c < 60; c++) {
    const tip = [-0.9 + 1.8 * rand(), 0.012 + 0.05 * rand(), -0.45 + 0.9 * rand()];
    const [a, b] = cueAt(tip, rand() * Math.PI * 2, (1.5 + 60 * rand() * rand()) * Math.PI / 180);
    const box = cueShadowBounds(a, b, R_TIP, R_BUTT, [{ pos: LAMP, half: HALF }], -0.01);
    for (let k = 0; k < 200; k++) {
      const p = [-2 + 4 * rand(), rand() < 0.7 ? 0 : 0.045, -1.2 + 2.4 * rand()];
      if (p[0] >= box[0] && p[0] <= box[2] && p[2] >= box[1] && p[2] <= box[3]) continue;
      const v = cueShadow(p, a, b, R_TIP, R_BUTT, LAMP, HALF);
      assert.ok(v > 0.999, `a receiver outside the rectangle is shadowed: v=${v} p=${p} box=${box}`);
    }
  }
});

ok('glsl: the cue shadow source is GLSL ES 3.00 text with the same constants as the JS twin', () => {
  assert.ok(CUE_SHADOW_GLSL.includes('float clubCueShadowOne( vec3 p, vec3 a, vec3 b, float ra, float rb, vec3 lp, vec2 lh )'));
  assert.ok(CUE_SHADOW_GLSL.includes('0.7853981633974483') && CUE_SHADOW_GLSL.includes('0.0015'));
  assert.ok(!/\$\{/.test(CUE_SHADOW_GLSL), 'no unexpanded template');
});

// ---- the shader patches: text only (compiling them is the dev page's job) ----
const SPIKE_FS = '#include <common>\nvarying vec3 vSpikeWorldPos;\nvoid main() {\n#include <lights_fragment_end>\n{\n  vec3 spikeWn = vec3( 0.0 );\n  float spikeShadow = 1.0;\n  float spikeOcc = 1.0;\n  reflectedLight.directDiffuse *= spikeShadow;\n}\n}';
const PLAIN_VS = '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n#include <fog_vertex>\n}';
const PLAIN_FS = '#include <common>\nvoid main() {\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}';

ok('patch: the table patch lands on the analytic-shadow rail with before/after anchors only', () => {
  const spec = occPatchSpec('table', { uniforms: {} });
  assert.equal(spec.key, `occ-v${OCC_PATCH_VERSION}`);
  for (const a of spec.apply) assert.ok(a.mode === 'before' || a.mode === 'after', `mode ${a.mode}`);
  const r = applyPatchText('void main() {\n#include <common>\n}', SPIKE_FS, spec);
  assert.equal(r.ok, true);
  assert.ok(r.fs.indexOf('clubVisibility3( vSpikeWorldPos') < r.fs.indexOf('reflectedLight.directDiffuse *= spikeShadow;'), 'the club terms land before the rail multiply');
  assert.ok(r.fs.indexOf('vec2 clubVisibility(') < r.fs.indexOf('void main()'), 'the functions are declared ahead of main');
  // a material that never went through the analytic injection misses the anchor: the whole patch is refused
  const miss = applyPatchText(PLAIN_VS, PLAIN_FS, spec);
  assert.equal(miss.ok, false);
  assert.equal(miss.fs, PLAIN_FS);
});

ok('patch: the baked-visibility correction is its own patch, anchored on the app line it undoes', () => {
  const spec = occPatchSpec('gi', { uniforms: {} });
  assert.equal(spec.key, `occ-v${OCC_PATCH_VERSION}-gi`);
  const fs = SPIKE_FS.replace('  float spikeOcc = 1.0;', '  float spikeOcc = 1.0;\n  vec4 gi = vec4( 1.0 );\n      spikeShadow *= mix( 1.0, gi.a, uGiShadow );');
  const r = applyPatchText('void main() {\n#include <common>\n}', fs, spec);
  assert.equal(r.ok, true);
  const at = (t) => r.fs.indexOf(t);
  assert.ok(at('float clubOccRail = spikeShadow;') > 0 && at('float clubOccRail = spikeShadow;') < at('spikeShadow *= mix( 1.0, gi.a, uGiShadow );'), 'the rail is kept before the app line');
  assert.ok(at('spikeShadow *= mix( 1.0, gi.a, uGiShadow );') < at('spikeShadow = mix( spikeShadow, clubOccRail, uClubOccGi );'), 'and put back after it');
  assert.equal(r.fs.split('spikeShadow *= mix( 1.0, gi.a, uGiShadow );').length - 1, 1, 'the app line itself is untouched');
  assert.equal(applyPatchText('void main() {\n#include <common>\n}', SPIKE_FS, spec).ok, false, 'without the app line the correction is refused whole');
  assert.equal((r.fs.match(/uniform\s+sampler2D/g) ?? []).length, 0, 'no sampler');
});

ok('patch: the plain and floor patches carry their own world position and use one sampler', () => {
  for (const kind of ['plain', 'floor']) {
    const spec = occPatchSpec(kind, { uniforms: {} });
    for (const a of spec.apply) assert.ok(a.mode === 'before' || a.mode === 'after', `mode ${a.mode}`);
    const r = applyPatchText(PLAIN_VS, PLAIN_FS, spec);
    assert.equal(r.ok, true, `${kind} patch applies to a standard material`);
    assert.ok(r.vs.includes('varying vec3 vClubOccWp;') && r.fs.includes('varying vec3 vClubOccWp;'));
    assert.equal((r.fs.match(/uniform\s+sampler2D/g) ?? []).length, 1, `${kind}: one sampler`);
  }
  assert.equal((OCC_GLSL.match(/uniform\s+sampler2D/g) ?? []).length, 2, 'the service text declares the table and the floor sampler');
});

ok('rails: a full lamp shadow in open air leaves the true-ambient share, whatever the balance of direct and indirect', () => {
  for (const [D, I] of [[1, 2], [1, 1], [2, 1], [0.2, 1]]) {
    const open = occRails({ D, I });
    assert.ok(Math.abs(open.total - (D + I)) < 1e-9, 'nothing in the way: nothing changes');
    const umbra = occRails({ D, I, S: 0 });
    // (the contact knob does not change an umbra in open air: the ambient rail is 1 there)
    assert.ok(Math.abs(umbra.total - 0.2 * (D + I)) < 1e-9, `umbra keeps a.(D+I): ${umbra.total} of ${D + I}`);
  }
  // the flat ambient lowered until the indirect light IS the true ambient: the split is gone, the rails are the plain ones
  const lean = occRails({ D: 4, I: 1, S: 0.5, ambVis: 0.6, kx: 0 });
  assert.equal(lean.share, 0);
  assert.ok(Math.abs(lean.direct - 2) < 1e-9 && Math.abs(lean.indirect - 0.6) < 1e-9);
  // the physical model (contact knob 0): with the lamp fully visible the indirect light loses only ( 1 - share ) of the ambient loss
  const crease = occRails({ D: 1, I: 2, ambVis: 0.5, kx: 0 });
  assert.ok(Math.abs(crease.indirect - 2 * (crease.share + (1 - crease.share) * 0.5)) < 1e-9 && crease.direct === 1);
  // the contact knob scales the lamp part, direct and stand-in alike, by its share of the ambient rail
  const look = occRails({ D: 1, I: 2, ambVis: 0.5, kx: 0.5 });
  assert.ok(Math.abs(look.direct - 0.75) < 1e-9 && Math.abs(look.indirect - 2 * (look.share * 0.75 + (1 - look.share) * 0.5)) < 1e-9);
  // beside and under the table nothing of the indirect light follows the lamp
  assert.equal(occRails({ D: 1, I: 2, top: 0 }).share, 0);
});

ok('glsl: the rails and the exported visibilities are in the table text', () => {
  for (const t of ['float clubOccLampVis = 1.0;', 'float clubOccAmbVis = 1.0;', 'float clubOccShare = 0.0;', 'uniform float uClubOccAmbient;', 'float clubCueAmbient( vec3 wp )']) {
    assert.ok(OCC_TABLE_GLSL.includes(t), t);
  }
  const fs = applyPatchText('void main() {\n#include <common>\n}', SPIKE_FS, occPatchSpec('table', { uniforms: {} })).fs;
  assert.ok(fs.includes('spikeOcc = mix( clubOccAmbRail, clubOccLampRail, clubOccShare );'));
  assert.ok(!/\$\{/.test(fs), 'no unexpanded template');
});

// ---- the bake's two rules on a synthetic long cushion (JS twins of occ/baker.js lampVisibility() and ambient(); the shader
// itself is compiled and looked at through the dev page) ----
const CUSHION = { zTip: 0.635, rec: 0.022, hN: 0.0363, lo: -0.12, bias: 0.0004, top: 0.0605, reach: 0.6, sky: [25 * Math.PI / 180, 45 * Math.PI / 180, 0.2] };
function cushionHeights(z) { // [T, U]: the highest surface and the lowest underside of the column at z (nose line at zTip, junction behind it)
  const c = CUSHION, zJ = c.zTip + c.rec;
  if (z < c.zTip) return [0, c.lo];
  if (z < zJ) return [c.hN + (z - c.zTip) * 0.2, c.hN * (zJ - z) / c.rec];
  if (z < 0.81) return [0.0445, c.lo];
  return [c.lo, c.lo];
}
const inSolid = (y, z) => { const [T, U] = cushionHeights(z); return y < T - CUSHION.bias && y > U + CUSHION.bias; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const skyWeight = (e) => (1 + (CUSHION.sky[2] - 1) * smooth(CUSHION.sky[0], CUSHION.sky[1], e)) * Math.sin(e) * Math.cos(e);
function twinAmbient(p, NAZ, NSA, rnd) { // the 32-bin elevation mask per azimuth, quadratic steps
  const DE = Math.PI / 2 / 32;
  let open = 0, all = 0;
  for (let i = 0; i < NAZ; i++) {
    const phi = (i + rnd[0]) / NAZ * 2 * Math.PI, jit = (rnd[1] + i * 0.618034) % 1, dith = (rnd[0] * 5 + rnd[1] * 3 + i * 0.7548777) % 1;
    const mask = new Uint8Array(32);
    for (let j = 0; j < NSA; j++) {
      const f = (j + jit) / NSA, t = Math.max(CUSHION.reach * f * f, 1e-5);
      if ((dith * 7 + j * 0.618034) % 1 > 1 - smooth(0.5, 1, f * f)) continue; // the far half of the reach fades out
      const [T, U] = cushionHeights(p[2] + Math.sin(phi) * t);
      if (T > p[1] + CUSHION.bias && T > U + CUSHION.bias) {
        const b0 = Math.min(32, Math.max(0, Math.floor(Math.atan2(Math.max(U - p[1], 0), t) / DE + dith)));
        const b1 = Math.min(32, Math.max(0, Math.floor(Math.atan2(T - p[1], t) / DE + dith)));
        for (let b = b0; b < b1; b++) mask[b] = 1;
      }
    }
    for (let b = 0; b < 32; b++) { const w = skyWeight((b + 0.5) * DE); all += w; if (!mask[b]) open += w; }
  }
  return open / all;
}
function exactAmbient(p) { // rays over azimuth x elevation, fine march
  let open = 0, all = 0;
  const NA = 36, NE = 30;
  for (let i = 0; i < NA; i++) {
    const dz = Math.sin((i + 0.5) / NA * 2 * Math.PI);
    for (let k = 0; k < NE; k++) {
      const e = (k + 0.5) / NE * Math.PI / 2, w = skyWeight(e), te = Math.tan(e);
      all += w;
      let hit = false;
      for (let t = 0.0003; t < CUSHION.reach && !hit; t += Math.max(0.0008, t * 0.06)) { const y = p[1] + t * te; if (y > 0.06) break; hit = inSolid(y, p[2] + dz * t); }
      if (!hit) open += w;
    }
  }
  return open / all;
}
function twinLamp(p, NLA, NLB, NS, rnd) { // stratified lamp samples, an NS-step march up to the top plane
  let sum = 0, ws = 0;
  for (let i = 0; i < NLA; i++) for (let j = 0; j < NLB; j++) {
    const sx = (i + ((rnd[0] + j * 0.618034) % 1)) / NLA * 2 - 1, sz = (j + ((rnd[1] + i * 0.381966) % 1)) / NLB * 2 - 1;
    const d = [LAMP[0] + sx * HALF[0] - p[0], LAMP[1] - p[1], LAMP[2] + sz * HALF[1] - p[2]], l = Math.hypot(...d);
    const w = (d[1] / l) ** 2 / (l * l), tEnd = (CUSHION.top - p[1]) / (d[1] / l), jit = (rnd[0] + rnd[1] + (i * NLB + j) * 0.7548777) % 1;
    let hit = false;
    for (let k = 0; k < NS && !hit; k++) { const t = (k + jit) * tEnd / NS; hit = inSolid(p[1] + d[1] / l * t, p[2] + d[2] / l * t); }
    ws += w; if (!hit) sum += w;
  }
  return sum / ws;
}
const meanOf = (fn, n = 12) => { const r = rng(11); let s = 0; for (let i = 0; i < n; i++) s += fn([r(), r()]); return s / n; };

ok('bake: the ambient rule (elevation mask, quadratic steps) follows a fine ray integration under and in front of a nose', () => {
  const zJ = CUSHION.zTip + CUSHION.rec;
  const rows = [];
  for (const mm of [4, 12, 22, 42, 102, 302]) {
    const p = [0, 0.001, zJ - mm / 1000];
    const exact = exactAmbient(p), base = meanOf((r) => twinAmbient(p, 8, 16, r)), lite = meanOf((r) => twinAmbient(p, 6, 12, r));
    rows.push([mm, exact, base, lite]);
    assert.ok(Math.abs(base - exact) < 0.06, `${mm} mm: base ${base} vs ${exact}`);
    assert.ok(Math.abs(lite - exact) < 0.08, `${mm} mm: lite ${lite} vs ${exact}`);
  }
  // the shape the look depends on: about a third at the junction side, half under the nose tip, nearly open 30 cm out
  assert.ok(rows[0][1] < 0.42 && rows[2][1] > 0.45 && rows[2][1] < 0.56 && rows[5][1] > 0.98);
  if (STATS || PHYSICS) for (const r of rows) console.log(`  ${String(r[0]).padStart(4)} mm in front of the junction: exact ${r[1].toFixed(3)}  base ${r[2].toFixed(3)}  lite ${r[3].toFixed(3)}`);
});

ok('bake: the lamp march finds the band under the overhang (0.47 at the junction, open from 11 mm) and nothing in front of the nose', () => {
  const zJ = CUSHION.zTip + CUSHION.rec;
  const rows = [];
  for (const mm of [1, 5, 9, 13, 30]) {
    const p = [0.4, 0.001, zJ - mm / 1000];
    const exact = twinLamp(p, 16, 60, 120, [0.5, 0.5]), base = meanOf((r) => twinLamp(p, 6, 4, 16, r), 32), lite = meanOf((r) => twinLamp(p, 4, 3, 12, r), 32);
    rows.push([mm, exact, base, lite]);
    assert.ok(Math.abs(base - exact) < 0.05 && Math.abs(lite - exact) < 0.07, `${mm} mm: ${base} / ${lite} vs ${exact}`);
  }
  assert.ok(rows[0][1] > 0.4 && rows[0][1] < 0.55 && rows[3][1] > 0.995 && rows[4][1] > 0.995);
  if (STATS || PHYSICS) for (const r of rows) console.log(`  ${String(r[0]).padStart(4)} mm in front of the junction: exact ${r[1].toFixed(3)}  base ${r[2].toFixed(3)}  lite ${r[3].toFixed(3)}`);
});

// ---- reference numbers (--physics): plain geometry, no renderer ----
if (PHYSICS) {
  const f = (v, d = 2) => v.toFixed(d);
  // (1) a cushion in cross-section: the under-face runs from the junction with the bed (0, 0) up to the nose tip (rec, hN); above
  // the tip the cushion is solid back to the rail. A bed point at s in front of the junction (s < rec: under the overhang).
  // lamp: a strip of half-depth lh at height H whose centre is `dist` from the nose line; kernel cos.cos / d² per unit depth.
  const nose = (rec, hN, dist, lh, H, label) => {
    console.log(`  ${label}: nose ${hN * 1000} mm high, overhang ${rec * 1000} mm`);
    const blockedSlope = (s) => (s >= rec ? Infinity : hN / (rec - s)); // a ray toward the lamp steeper than this hits the under-face
    for (const s of [0, 0.004, 0.008, 0.012, 0.016, 0.022, 0.032, 0.05, 0.1, 0.2]) {
      const x0 = dist - rec + s; // horizontal distance to the lamp centre line
      let vis = 0, all = 0;
      for (let i = 0; i < 400; i++) {
        const dx = x0 - lh + 2 * lh * (i + 0.5) / 400;
        const d2 = dx * dx + H * H, w = H * H / (d2 * d2);
        all += w;
        if (H / dx < blockedSlope(s)) vis += w;
      }
      // ambient, per azimuth (2D slice through the cushion, then the half of the azimuths that face it): elevations closed by
      // the under-face / the block behind the tip; uniform sky (cos-weighted) against the room model of the bake
      const closed = (e) => {
        // toward the cushion: under the overhang a ray is closed when steeper than the tip; in front, when lower than the tip
        if (s < rec) return true;
        return Math.tan(e) < hN / (s - rec) || Math.tan(e) < 0.056 / (s - rec + 0.06);
      };
      const awayClosed = (e) => s < rec && Math.tan(e) > hN / (rec - s); // looking away, the overhang closes the steep rays
      const sky = (e) => 1, room = (e) => { const t = Math.min(1, Math.max(0, (e - 25 * Math.PI / 180) / (20 * Math.PI / 180))); return 1 + (0.2 - 1) * t * t * (3 - 2 * t); };
      const amb = (L) => {
        let o = 0, t = 0;
        for (let i = 0; i < 900; i++) {
          const e = (i + 0.5) / 900 * Math.PI / 2, w = L(e) * Math.sin(e) * Math.cos(e);
          t += 2 * w;
          if (!closed(e)) o += w;
          if (!awayClosed(e)) o += w;
        }
        return o / t;
      };
      console.log(`    ${f(s * 1000, 0).padStart(4)} mm from the junction: lamp ${f(vis / all)}  ambient ${f(amb(sky))} (uniform sky) ${f(amb(room))} (room)`);
    }
  };
  console.log('\nphysics 1: the bed under and in front of a cushion nose (facing azimuth only for the ambient columns)');
  nose(0.022, 0.0363, 0.635, 0.33, 1.02, 'long cushion, lamp 0.66 m deep, centre 0.635 m away');
  nose(0.022, 0.0363, 1.27, 1.025, 1.02, 'end cushion, lamp 2.05 m long, centre 1.27 m away');
  nose(0.010, 0.0363, 0.635, 0.33, 1.02, 'long cushion with a 10 mm overhang');

  // (2) a ball on the bed: the share of the lamp its sphere leaves, by distance from the contact point
  const ballVis = (p, c, R, nx = 120, nz = 48) => {
    let free = 0, all = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const sx = LAMP[0] + HALF[0] * (2 * (i + 0.5) / nx - 1), sz = LAMP[2] + HALF[1] * (2 * (j + 0.5) / nz - 1);
      const d = [sx - p[0], LAMP[1] - p[1], sz - p[2]], l = Math.hypot(...d), w = (d[1] / l) ** 2 / (l * l);
      const m = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
      const t = (m[0] * d[0] + m[1] * d[1] + m[2] * d[2]) / l;
      const miss = Math.hypot(m[0] - d[0] / l * t, m[1] - d[1] / l * t, m[2] - d[2] / l * t) > R || t < 0;
      all += w; if (miss) free += w;
    }
    return free / all;
  };
  console.log('\nphysics 2: lamp visibility on the cloth around a ball (R = 28.6 mm); r = distance from the contact point');
  for (const [cx, cz, label] of [[0, 0, 'ball under the lamp centre'], [0.9, 0.4, 'ball at (0.9, 0.4)']]) {
    const R = 0.028575, c = [cx, R, cz];
    const row = (dx, dz) => [0.2, 0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 3].map((k) => f(ballVis([cx + dx * k * R, 0, cz + dz * k * R], c, R))).join(' ');
    console.log(`  ${label}:  r/R =  0.2  0.4  0.6  0.8  1.0 1.25  1.5  2.0  3.0`);
    console.log(`    along the lamp (+x): ${row(1, 0)}`);
    console.log(`    across it (+z):      ${row(0, 1)}`);
    if (cx) console.log(`    toward the lamp (-x): ${row(-1, 0)}`);
  }

  // (3) the cue: the lamp visibility on the cloth right under the shaft, by height of the shaft
  console.log('\nphysics 3: lamp visibility on the cloth under the cue shaft (closed form), tip 28.6 mm up, cue raised 5 degrees');
  for (const [az, label] of [[Math.PI, 'cue along the lamp (aiming down the table)'], [Math.PI / 2, 'cue across the lamp (aiming across the table)']]) {
    const [a, b] = cueAt([0, 0.028575, 0], az, 5 * Math.PI / 180);
    const cells = [];
    for (const u of [0.0, 0.02, 0.05, 0.1, 0.2, 0.4]) {
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
      let half = 0; const centre = cueShadow([x, 0, z], a, b, R_TIP, R_BUTT, LAMP, HALF);
      const sx = -Math.sin(az), sz = Math.cos(az);
      for (let o = 0; o < 0.3; o += 0.0005) { if (1 - cueShadow([x + sx * o, 0, z + sz * o], a, b, R_TIP, R_BUTT, LAMP, HALF) < (1 - centre) / 2) { half = o; break; } }
      cells.push(`${f(u * CUE_LEN * 100, 0)} cm up the cue (axis ${f(y * 1000, 0)} mm high): ${f(centre)}, half-width ${f(half * 1000, 0)} mm`);
    }
    console.log(`  ${label}:\n    ${cells.join('\n    ')}`);
  }
  // what a shadow of that depth does to the cloth under the light model
  console.log(`\nphysics 4: cloth brightness (1 = open cloth) under the light model, D : I = 1 : 2 (measured), a = 0.2, contact ${OCC_CONTACT} | contact 0 (physical)`);
  for (const [name, o] of [['lamp half hidden (cue near the tip, ball edge)', { S: 0.5 }], ['lamp fully hidden, ambient open', { S: 0 }],
    ['ambient 0.75 (5 cm in front of a nose)', { ambVis: 0.75 }], ['ambient 0.5 (under the nose tip)', { ambVis: 0.5 }],
    ['junction: lamp 0.45, ambient 0.15', { lampVis: 0.45, ambVis: 0.15 }]]) {
    console.log(`    ${name}: ${f(occRails({ D: 1, I: 2, ...o }).total / 3)} | ${f(occRails({ D: 1, I: 2, kx: 0, ...o }).total / 3)}`);
  }
}

console.log(`\n${n} checks passed`);
