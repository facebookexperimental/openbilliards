// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-pocket.mjs — node arm for the pocket part's pure logic (CONTRACT.md 10.1): the circle fit, the description of a
// pocket from its fall lip and its cup, the folded frame, the JS twins of the shader's depth laws, and the shape of the
// shader text (anchors, composition with the occlusion and cloth patches in either order, sampler counts).
// Run: node web/tools/club/test-club-pocket.mjs   (add --stats to print the depth tables)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fitCircle, pocketAxis, describeLip, describeCup, foldPockets, shaftSky, discFactor, mouthDistance, lampShare, lampBounds, hungPoint,
} from '../../scene/club/mat/pocket/geom.js';
import {
  collarPatchSpec, lipPatchSpec, cupPatchSpec, collarUniformNames, lipUniformNames, cupUniformNames,
  POCKET_PATCH_VERSION, SPIKE_RAIL, ANCHOR_NORMAL_DONE, ANCHOR_LIGHTS, ANCHOR_CUP_VERTEX, ANCHOR_CUP_OUT, LAMP_GRID,
} from '../../scene/club/mat/pocket/glsl.js';
import { applyPatchText } from '../../scene/club/patchtext.js';
import { occPatchSpec } from '../../scene/club/occ/glsl.js';
import { clothPatchSpec } from '../../scene/club/mat/cloth/glsl.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const STATS = process.argv.includes('--stats');

// ---- a synthetic pocket with the numbers measured on pool_pro_9ft (corner): a vertical cloth return round an opening made of
// a front arc (25.4 mm deep), two straight legs and a rear arch (14.2 mm deep) ----
const S = Math.SQRT1_2;
function cornerLip({ sx = 1, sz = 1, cx = 1.2947, cz = 0.6597, rf = 0.0572, rr = 0.0557, front = 0.0254, rear = 0.0142 } = {}) {
  const ux = sx * S, uz = sz * S;
  const positions = [], normals = [];
  const put = (u, w, depth) => {
    const x = cx + u * ux - w * uz, z = cz + u * uz + w * ux;
    const l = Math.hypot(u, w) || 1;
    const nx = -(u * ux - w * uz) / l, nz = -(u * uz + w * ux) / l;
    positions.push([x, 0, z], [x, -depth, z]);
    normals.push([nx, 0, nz], [nx, 0, nz]);
  };
  for (let i = 0; i <= 64; i++) { const a = Math.PI - 0.95 + (1.9 * i) / 64; put(0.0009 + rf * Math.cos(a), rf * Math.sin(a), front); }
  put(0.005, -0.0438, rear);
  for (let i = 0; i <= 64; i++) { const a = -0.85 + (1.7 * i) / 64; put(rr * Math.cos(a), rr * Math.sin(a), rear); }
  put(0.005, 0.0438, rear);
  positions.push(positions[0], positions[1]); normals.push(normals[0], normals[1]); // the builder closes the loop on its first pair
  return { positions, normals, ux, uz, cx, cz };
}
function sideLip({ sz = 1 } = {}) {
  const positions = [], normals = [];
  const put = (x, z, depth) => { positions.push([x, 0, z * sz], [x, -depth, z * sz]); normals.push([0, 0, -sz], [0, 0, -sz]); };
  for (let i = 0; i <= 64; i++) { const a = Math.PI + 0.57 + ((Math.PI - 1.14) * i) / 64; put(0.0556 * Math.cos(a), 0.6906 + 0.0556 * Math.sin(a), 0.0048); }
  put(0.0467, 0.6837, 0.0048);
  for (let i = 0; i <= 64; i++) { const a = 0.5 + ((Math.PI - 1.0) * i) / 64; put(0.0531 * Math.cos(a), 0.6797 + 0.0531 * Math.sin(a), 0.0048); }
  put(-0.0467, 0.6837, 0.0048);
  return { positions, normals };
}
function cupWalls(p, { rc = 0.0744, run = 0.1223, top = -0.0071, bottom = -0.1319, u0 = 0 } = {}) {
  const out = [];
  const put = (u, w) => { const x = p.front.x + u * p.ux - w * p.uz, z = p.front.z + u * p.uz + w * p.ux; out.push([x, top, z], [x, bottom, z]); };
  for (let i = 0; i <= 28; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 28; put(u0 + rc * Math.cos(a), rc * Math.sin(a)); }
  put(u0 - run, rc); put(u0 - run, -rc);
  return out;
}

ok('circle fit: an arc of 110 degrees with 0.05 mm of noise gives centre and radius within 0.1 mm', () => {
  const pts = [];
  for (let i = 0; i < 40; i++) { const a = 2.1 + (1.9 * i) / 39; const e = 0.00005 * Math.sin(i * 12.9898); pts.push([0.3 + (0.057 + e) * Math.cos(a), -0.2 + (0.057 + e) * Math.sin(a)]); }
  const c = fitCircle(pts);
  assert.ok(Math.abs(c.x - 0.3) < 1e-4 && Math.abs(c.z + 0.2) < 1e-4 && Math.abs(c.r - 0.057) < 1e-4, JSON.stringify(c));
  assert.ok(c.rms < 1e-4);
  assert.equal(fitCircle([[0, 0], [1, 1]]), null);
  assert.equal(fitCircle([[0, 0], [1, 1], [2, 2]]), null, 'collinear points have no circle');
});

ok('axis: corner pockets lie on the diagonal, side pockets across the table', () => {
  assert.deepEqual(pocketAxis(0, 0.69), { side: true, ux: 0, uz: 1 });
  assert.deepEqual(pocketAxis(0.002, -0.69), { side: true, ux: 0, uz: -1 });
  const a = pocketAxis(-1.29, 0.66);
  assert.ok(!a.side && Math.abs(a.ux + S) < 1e-12 && Math.abs(a.uz - S) < 1e-12);
});

let corner = null, side = null;
ok('lip: the corner return of pool_pro_9ft is read as a sharp lip with a short return under the casting', () => {
  const l = cornerLip();
  corner = describeLip(l.positions, l.normals);
  assert.ok(corner && !corner.side && corner.sharp);
  assert.ok(Math.abs(corner.front.r - 0.0572) < 2e-4 && corner.front.rms < 1e-4, `front radius ${corner.front.r}`);
  assert.ok(Math.abs(corner.rear.r - 0.0557) < 2e-4, `rear radius ${corner.rear.r}`);
  assert.ok(Math.abs(corner.frontDepth - 0.0254) < 1e-6 && Math.abs(corner.rearDepth - 0.0142) < 1e-6);
  assert.ok(Math.abs(corner.halfWidth - 0.0438) < 0.004, `half width ${corner.halfWidth}`);
  // the deep part ends where the front arc ends: 0.95 rad off the inboard axis, about 33 mm inboard of the centre
  assert.ok(corner.arcU > -0.036 && corner.arcU < -0.026, `arc station ${corner.arcU}`);
  // every mirror image gives the same numbers
  for (const [sx, sz] of [[-1, 1], [1, -1], [-1, -1]]) {
    const m = cornerLip({ sx, sz, cx: sx * 1.2947, cz: sz * 0.6597 });
    const d = describeLip(m.positions, m.normals);
    assert.ok(Math.abs(d.front.r - corner.front.r) < 1e-9 && Math.abs(d.arcU - corner.arcU) < 1e-9 && Math.abs(Math.abs(d.front.x) - corner.front.x) < 1e-9);
  }
});

ok('lip: the side return has one depth all round; its bed-side arc still ends where the legs begin', () => {
  const l = sideLip();
  side = describeLip(l.positions, l.normals);
  assert.ok(side && side.side && side.sharp);
  assert.ok(Math.abs(side.front.z - 0.6906) < 3e-4 && Math.abs(side.front.r - 0.0556) < 3e-4, JSON.stringify(side.front));
  assert.ok(Math.abs(side.rear.z - 0.6797) < 3e-4 && Math.abs(side.rear.r - 0.0531) < 3e-4, JSON.stringify(side.rear));
  // the front arc ends 0.57 rad off the lateral axis: sin( 0.57 ) x 55.6 mm = 30 mm inboard of the centre
  assert.ok(side.arcU > -0.031 && side.arcU < -0.025, `arc station ${side.arcU}`);
  assert.ok(Math.abs(side.halfWidth - 0.0467) < 0.004, `half width ${side.halfWidth}`);
});

ok('lip: a modelled round (a quarter-round ring) is not sharp, and junk is refused', () => {
  const positions = [], normals = [];
  for (let j = 0; j <= 10; j++) {
    const phi = Math.PI / 2 + (Math.PI / 2) * (j / 10);
    const r = 0.06 + 0.0048 + 0.0048 * Math.cos(phi), y = -0.0048 + 0.0048 * Math.sin(phi);
    for (let i = 0; i < 40; i++) { const a = (2 * Math.PI * i) / 40; positions.push([1.2 + r * Math.cos(a), y, 0.6 + r * Math.sin(a)]); normals.push([-Math.cos(a) * -Math.cos(phi), Math.sin(phi), -Math.sin(a) * -Math.cos(phi)]); }
  }
  const d = describeLip(positions, normals);
  assert.ok(d && !d.sharp && d.arcU === 1e3);
  assert.ok(Math.abs(d.front.r - 0.0648) < 2e-4 && Math.abs(d.rear.r - 0.0648) < 2e-4);
  assert.equal(describeLip([[0, 0, 0]]), null);
  assert.equal(describeLip(Array.from({ length: 20 }, (_, i) => [i, 0, 0])), null, 'a mesh 20 m wide is no lip');
});

ok('cup: radius, station and reach of the app\'s cup come back from its vertices', () => {
  const c = describeCup(cupWalls(corner), corner);
  assert.ok(Math.abs(c.rc - 0.0744) < 1e-6 && Math.abs(c.u0) < 1e-6 && Math.abs(c.run - 0.1223) < 1e-6, JSON.stringify(c));
  assert.ok(Math.abs(c.top + 0.0071) < 1e-9 && Math.abs(c.bottom + 0.1319) < 1e-9);
  assert.equal(describeCup([], corner), null);
});

let folded = null;
ok('fold: six mirror-image pockets fold onto one corner and one side; a moved pocket shows as a deviation', () => {
  const list = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = cornerLip({ sx, sz, cx: sx * 1.2947, cz: sz * 0.6597 }); list.push(describeLip(l.positions, l.normals)); }
  for (const sz of [1, -1]) { const l = sideLip({ sz }); list.push(describeLip(l.positions, l.normals)); }
  folded = foldPockets(list);
  assert.equal(folded.corners, 4); assert.equal(folded.sides, 2);
  assert.ok(folded.maxDeviation < 1e-9, `deviation ${folded.maxDeviation}`);
  assert.ok(folded.corner.A[0] > 1.2 && folded.corner.A[1] > 0.6 && folded.side.A[1] > 0.68 && Math.abs(folded.side.A[0]) < 1e-3);
  const moved = cornerLip({ cx: 1.2947 + 0.004 });
  const bad = foldPockets([...list.slice(1), describeLip(moved.positions, moved.normals)]);
  assert.ok(bad.maxDeviation > 0.002, 'a pocket 4 mm out of place is seen');
  const none = foldPockets(list.slice(0, 4));
  assert.equal(none.side, null);
});

ok('depth laws: the shaft and disc factors have their limits and fall with depth', () => {
  assert.ok(Math.abs(shaftSky(0) - 1) < 1e-12);
  let last = 1;
  for (let d = 0.005; d < 0.2; d += 0.005) { const s = shaftSky(d / (2 * 0.0566)); assert.ok(s < last && s > 0); last = s; }
  // the numbers the occlusion service quotes for a 56.6 mm mouth: 0.63 at 25 mm, 0.39 at 50 mm, 0.15 at 100 mm
  assert.ok(Math.abs(shaftSky(0.025 / 0.1132) - 0.63) < 0.02 && Math.abs(shaftSky(0.05 / 0.1132) - 0.39) < 0.02 && Math.abs(shaftSky(0.1 / 0.1132) - 0.15) < 0.02);
  for (const d of [0.01, 0.05, 0.13]) assert.ok(Math.abs(discFactor(0, d, 0.0566) - 0.0566 ** 2 / (0.0566 ** 2 + d * d)) < 1e-12);
  assert.ok(discFactor(0.05, 0.13, 0.0566) < discFactor(0, 0.13, 0.0566));
  assert.ok(discFactor(0, 1e-6, 0.0566) > 0.999);
  if (STATS) for (const d of [0, 0.014, 0.03, 0.05, 0.08, 0.132]) console.log(`   depth ${(d * 1000).toFixed(0).padStart(3)} mm: wall ${shaftSky((d + 0.05) / 0.1132).toFixed(3)} (from the top lip)  floor ${discFactor(0, d + 0.05, 0.0566).toFixed(3)} (share of its hemisphere the mouth fills)`);
});

ok('mouth: the opening is the two circles and the band; the lamp reaches the far wall in a band of depths', () => {
  const c = folded.corner;
  assert.ok(mouthDistance([c.A[0], c.A[1]], c) < -0.04, 'the centre is well inside');
  assert.ok(mouthDistance([c.A[0] + 0.08 * S, c.A[1] + 0.08 * S], c) > 0.02, 'past the casting is outside');
  assert.ok(mouthDistance([c.A[0] - 0.05 * S + 0.05 * S, c.A[1] - 0.05 * S - 0.05 * S], c) > 0, 'beside the legs is outside (the band)');
  const sd = folded.side;
  assert.ok(mouthDistance([0, sd.A[1]], sd) < -0.03 && mouthDistance([0, sd.A[1] + 0.05], sd) > 0, 'the side mouth ends at its rear arch');
  // under the app's lamp: the far wall of the cup (74.4 mm from the centre, 18 mm behind the opening's edge) starts in the
  // slate's shadow, takes the lamp lower down and loses it again toward the floor; the wall under the bed never sees it
  const lamp = { cx: 0, cz: 0, hx: 1.025, hz: 0.33, y: 1.02 };
  const far = [c.A[0] + 0.0744 * S, c.A[1] + 0.0744 * S], near = [c.A[0] - 0.074 * S, c.A[1] - 0.074 * S];
  const at = (d) => lampShare(far, d, lamp, c, LAMP_GRID);
  assert.equal(at(0.008), 0, 'just under the slate the cup wall is in its shadow');
  assert.ok(at(0.05) >= 0.5, `the lamp reaches the wall 50 mm down (${at(0.05)})`);
  assert.ok(at(0.132) <= at(0.05), 'and no more of it at the floor');
  for (const d of [0.03, 0.06, 0.1]) assert.equal(lampShare(near, d, lamp, c, LAMP_GRID), 0, 'the wall under the bed edge is in its shadow');
  if (STATS) for (const d of [0.008, 0.02, 0.035, 0.05, 0.07, 0.09, 0.11, 0.132]) console.log(`   far wall ${(d * 1000).toFixed(0).padStart(3)} mm down: ${(at(d) * 6).toFixed(0)} of 6 lamp points`);
  // the liner's light is taken where it would hang: 2 mm inside the opening's edge, straight inward of the cup's wall. There
  // the far wall sees the whole lamp from its top and loses it with depth (the look the part draws)
  for (const [fd, r] of [[c, 0.0744], [sd, 0.0744]]) {
    const ax = fd.side ? [0, 1] : [S, S];
    for (const ang of [-1.4, -0.7, 0, 0.7, 1.4]) {
      const q = [fd.A[0] + r * (ax[0] * Math.cos(ang) - ax[1] * Math.sin(ang)), fd.A[1] + r * (ax[1] * Math.cos(ang) + ax[0] * Math.sin(ang))];
      const h = hungPoint(q, fd);
      const m = mouthDistance(h, fd);
      assert.ok(m < -0.0015 && m > -0.0025, `the hung point lies 2 mm inside the edge (${m})`);
      // on the ray from the front centre through the wall point
      assert.ok(Math.abs((h[0] - fd.A[0]) * (q[1] - fd.A[1]) - (h[1] - fd.A[1]) * (q[0] - fd.A[0])) < 1e-12);
    }
    const inside = [fd.A[0] + 0.01 * ax[0], fd.A[1] + 0.01 * ax[1]];
    assert.deepEqual(hungPoint(inside, fd), inside);
  }
  const hung = hungPoint(far, c);
  assert.equal(lampShare(hung, 0.02, lamp, c, LAMP_GRID), 1, 'a liner hung from the hem sees the whole lamp at its top');
  assert.ok(lampShare(hung, 0.132, lamp, c, LAMP_GRID) < 0.5, 'and less than half of it at the floor');
  if (STATS) for (const d of [0.014, 0.03, 0.05, 0.07, 0.09, 0.11, 0.132]) console.log(`   hung liner ${(d * 1000).toFixed(0).padStart(3)} mm down: ${(lampShare(hung, d, lamp, c, LAMP_GRID) * 6).toFixed(0)} of 6 lamp points`);
  assert.deepEqual(lampBounds([{ pos: [0, 1.02, 0], half: [1.025, 0.33] }]), { cx: 0, cz: 0, hx: 1.025, hz: 0.33, y: 1.02 });
  assert.equal(lampBounds([]), null);
});

// ---- the shader text ----
const count = (s, re) => (s.match(re) ?? []).length;
const balanced = (s) => count(s, /\{/g) === count(s, /\}/g) && count(s, /\(/g) === count(s, /\)/g);
const declared = (s) => new Set([...s.matchAll(/uniform\s+\w+\s+(uClubPkt\w+)/g)].map((m) => m[1]));
const used = (s) => new Set([...s.matchAll(/\b(uClubPkt\w+)\b/g)].map((m) => m[1]));

ok('patches: before / after anchors only, versioned keys, balanced text, every uniform declared once and supplied', () => {
  const U = Object.fromEntries([...collarUniformNames(true), ...lipUniformNames(), ...cupUniformNames(true)].map((k) => [k, { value: 0 }]));
  for (const [spec, names] of [[collarPatchSpec({ tex: true, uniforms: U }), collarUniformNames(true)], [collarPatchSpec({ tex: false, uniforms: U }), collarUniformNames(false)], [lipPatchSpec({ uniforms: U }), lipUniformNames()]]) {
    assert.ok(spec.key.startsWith(`mat-pocket-v${POCKET_PATCH_VERSION}:`));
    for (const a of spec.apply) { assert.ok(a.mode === 'before' || a.mode === 'after', `mode ${a.mode}`); assert.ok(balanced(a.code), `unbalanced code at ${a.anchor}`); }
    assert.deepEqual(spec.apply.map((a) => a.anchor), [ANCHOR_NORMAL_DONE, ANCHOR_LIGHTS, SPIKE_RAIL]);
    const textAll = spec.pars + spec.apply.map((a) => a.code).join('\n');
    const dec = declared(spec.pars);
    assert.equal(dec.size, count(spec.pars, /uniform\s+\w+\s+uClubPkt/g), 'a uniform is declared twice');
    for (const u of used(textAll)) assert.ok(dec.has(u), `${u} is used and not declared (${spec.key})`);
    assert.deepEqual([...dec].sort(), [...names].sort());
    assert.deepEqual(Object.keys(spec.uniforms).sort(), [...names].sort(), 'the spec supplies exactly the declared uniforms');
  }
  assert.notEqual(collarPatchSpec({ tex: true }).key, collarPatchSpec({ tex: false }).key);
});

ok('samplers: one on the casting, none on the cloth, one on the cup (none on the variants without the scans)', () => {
  const samplers = (s) => count(s, /uniform\s+sampler\w+\s+\w+/g);
  assert.equal(samplers(collarPatchSpec({ tex: true }).pars), 1);
  assert.equal(samplers(collarPatchSpec({ tex: false }).pars), 0);
  assert.equal(samplers(lipPatchSpec().pars), 0);
  assert.equal(samplers(cupPatchSpec({ tex: true }).pars), 1);
  assert.equal(samplers(cupPatchSpec({ tex: false }).pars), 0);
});

ok('cup: the patch sits on an unlit material, declares what it uses, samples the whole lamp grid and is the identity when off', () => {
  // the anchors of three's basic material, in shader order
  const vs = '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}';
  const fs = '#include <common>\nvoid main() {\nvec3 outgoingLight = reflectedLight.indirectDiffuse;\n#include <envmap_fragment>\n#include <opaque_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
  for (const tex of [true, false]) {
    const spec = cupPatchSpec({ tex, uniforms: Object.fromEntries(cupUniformNames(tex).map((k) => [k, { value: 0 }])) });
    assert.ok(spec.key.startsWith(`mat-pocket-v${POCKET_PATCH_VERSION}:cup`));
    assert.deepEqual(spec.apply.map((a) => [a.stage ?? 'fragment', a.anchor, a.mode]), [['vertex', ANCHOR_CUP_VERTEX, 'after'], ['fragment', ANCHOR_CUP_OUT, 'before']]);
    const textAll = spec.pars + spec.apply.map((a) => a.code).join('\n');
    assert.ok(balanced(textAll));
    const dec = declared(spec.pars);
    for (const u of used(textAll)) assert.ok(dec.has(u), `${u} is used and not declared (cup)`);
    assert.deepEqual([...dec].sort(), [...cupUniformNames(tex)].sort());
    assert.deepEqual(Object.keys(spec.uniforms).sort(), [...cupUniformNames(tex)].sort());
    assert.ok(spec.pars.includes(`i < ${LAMP_GRID[0] * LAMP_GRID[1] + 1};`), 'the grid and the nearest point');
    const r = applyPatchText(vs, fs, spec);
    assert.ok(r.ok, `missed ${r.missed}`);
    // the varyings are declared once in each stage, written after the projection, read before the output chunk
    assert.equal(count(r.vs, /varying vec3 vClubPktWp;/g), 1); assert.equal(count(r.fs, /varying vec3 vClubPktWp;/g), 1);
    assert.ok(r.vs.indexOf('vClubPktWp = ') > r.vs.indexOf(ANCHOR_CUP_VERTEX));
    const mixAt = r.fs.indexOf('outgoingLight = mix( outgoingLight,');
    assert.ok(mixAt > r.fs.indexOf('vec3 outgoingLight =') && mixAt < r.fs.indexOf(ANCHOR_CUP_OUT));
    assert.ok(r.fs.includes('uClubPktK.x * uClubPktK2.x );'), 'the strength scales the whole replacement: 0 returns the app\'s own value');
  }
  assert.equal(applyPatchText(vs, fs.replace(ANCHOR_CUP_OUT, ''), cupPatchSpec()).ok, false, 'a material without the output chunk takes nothing');
});

ok('composition: with the occlusion and cloth patches in either order every anchor is hit and the terms sit before the rail line', () => {
  // the anchors of a standard material that went through the app's analytic injection, in shader order. SPIKE_APPLY ends with
  // the app's sheen rails, copied from shading.js and pinned there (the cloth patch's lamp sheen piece anchors on the first)
  const SHEEN_RAILS = ['  #ifdef USE_SHEEN', '    sheenSpecularDirect *= spikeShadow;', '    sheenSpecularIndirect *= spikeOcc;', '  #endif'];
  const shading = readFileSync(new URL('../../scene/shading.js', import.meta.url), 'utf8');
  assert.equal(shading.split(SHEEN_RAILS.join('\n')).length - 1, 1, 'shading.js: the sheen rails of SPIKE_APPLY, as the stand-in copies them');
  assert.ok(shading.indexOf(SHEEN_RAILS.join('\n')) > shading.indexOf(`  ${SPIKE_RAIL}\n`), 'shading.js: the sheen rails come after the rail line');
  const fs = ['#include <common>', 'void main() {', '#include <map_fragment>', '#include <normal_fragment_maps>', ANCHOR_NORMAL_DONE, ANCHOR_LIGHTS, '#include <lights_fragment_begin>',
    '#include <lights_fragment_end>', '{', '      spikeShadow *= mix( 1.0, gi.a, uGiShadow );', `  ${SPIKE_RAIL}`, ...SHEEN_RAILS, '}', '}'].join('\n');
  const vs = '#include <common>\nvoid main() {\n#include <project_vertex>\n}';
  const occ = occPatchSpec('table', { uniforms: {} });
  const cloth = clothPatchSpec({ weave: true, uniforms: {} });
  const lip = lipPatchSpec({ uniforms: {} }), collar = collarPatchSpec({ tex: true, uniforms: {} });
  const run = (order) => order.reduce((acc, spec) => { const r = applyPatchText(acc.vs, acc.fs, spec); assert.ok(r.ok, `${spec.key} missed ${r.missed}`); return r; }, { vs, fs });
  // every anchor of the cloth patch is in this stand-in: its compositions always run (a cloth anchor this stand-in lacks fails
  // here, by name, instead of dropping them)
  const clothFits = applyPatchText(vs, fs, cloth);
  assert.equal(clothFits.ok, true, `the cloth patch fits the stand-in (missed ${clothFits.missed})`);
  const orders = [[occ, cloth, lip], [cloth, occ, lip], [lip, occ, cloth]];
  for (const order of orders) {
    const out = run(order).fs;
    const rail = out.indexOf(SPIKE_RAIL);
    assert.ok(out.indexOf('clubPktRoll * clubPktRoll') > 0 && out.indexOf('clubPktRoll * clubPktRoll') < rail, 'the lip term is before the rail line');
    assert.ok(out.indexOf('clubPktNear( vSpikeWorldPos )') < out.indexOf(ANCHOR_NORMAL_DONE), 'the roll is inside the normal stage');
    assert.equal(count(out, /float clubPktNear\(/g), 1);
  }
  for (const order of [[occ, collar], [collar, occ]]) {
    const out = run(order).fs;
    assert.ok(out.indexOf('clubPktWall') > 0 && out.indexOf('clubPktWall') < out.indexOf(SPIKE_RAIL));
    assert.ok(out.indexOf('material.specularF90') > out.indexOf(ANCHOR_LIGHTS));
  }
  // a material without the app's rail line takes nothing of the patch (adopt.js skips it whole)
  assert.equal(applyPatchText(vs, fs.replace(SPIKE_RAIL, ''), collar).ok, false);
});

console.log(`\n${n} checks passed`);
