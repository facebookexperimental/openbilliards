// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-cloth.mjs — node arm for the cloth part's pure logic (CONTRACT.md 9.1): the lamp pool's closed form against a
// brute-force sum, the emitter bounds and radiance, the level law of the light piece, the saturation form, the stand-in weave,
// and the shape of the shader patch (anchors, composition with the occlusion patch in either order, the sampler count).
// Run: node web/tools/club/test-club-cloth.mjs   (add --stats to print the pool table and the tone table)
import assert from 'node:assert/strict';
import { rectFormFactorUp, rectFormFactorUpBrute, lampBounds, lampRadiance, poolAt, clothLevel, clothVeil, clothSaturation, weaveKeep, bedFootprint, weaveCoord } from '../../scene/club/mat/cloth/pool.js';
import { weaveNormalData, WEAVE_FALLBACK_THREAD_M } from '../../scene/club/mat/cloth/weave.js';
import {
  clothPatchSpec, clothUniformNames, CLOTH_PATCH_VERSION, SPIKE_RAIL, ANCHOR_COLOUR, ANCHOR_FRAME, ANCHOR_SHEEN, ANCHOR_LIGHT, KEEP, APP_TONE,
} from '../../scene/club/mat/cloth/glsl.js';
import { CLOTH_TUNE } from '../../scene/club/mat/cloth/tune.js';
import { applyPatchText } from '../../scene/club/patchtext.js';
import { occPatchSpec } from '../../scene/club/occ/glsl.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const STATS = process.argv.includes('--stats');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the app's canopy lamp over the 9 ft bed (room.js / the shared emitter uniforms as read in the app)
const LAMP = { cx: 0, cz: 0, hx: 1.025, hz: 0.33, y: 1.02 };
const BED = { hx: 1.27, hz: 0.635 };
const POINTS = {
  centre: [0, 0, 0], midLength: [0.6, 0, 0], endRail: [1.27, 0, 0], sideRail: [0, 0, 0.635], quarter: [0.63, 0, 0.3],
  corner: [1.15, 0, 0.52], cornerTip: [1.27, 0, 0.635],
};

ok('pool: the closed form equals the brute-force sum (random lamps and points)', () => {
  const r = rng(22);
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    const lamp = { cx: (r() - 0.5) * 0.6, cz: (r() - 0.5) * 0.4, hx: 0.2 + r() * 1.1, hz: 0.1 + r() * 0.5, y: 0.6 + r() * 0.9 };
    const p = [(r() - 0.5) * 2.6, r() * 0.04, (r() - 0.5) * 1.3];
    const a = rectFormFactorUp(p, lamp), b = rectFormFactorUpBrute(p, lamp, 120);
    worst = Math.max(worst, Math.abs(a - b));
    assert.ok(a >= 0 && a <= 1, `form factor in range (${a})`);
  }
  assert.ok(worst < 5e-4, `closed form vs brute force: worst error ${worst}`);
});

ok('pool: the app lamp gives a clear centre-to-corner falloff on the 9 ft bed', () => {
  const at = (k) => poolAt(POINTS[k], LAMP);
  assert.ok(Math.abs(rectFormFactorUp(POINTS.centre, LAMP) - 0.2508) < 2e-3, 'form factor under the lamp');
  assert.ok(Math.abs(at('centre') - 1) < 1e-9);
  assert.ok(at('midLength') > 0.8 && at('midLength') < 0.9);
  assert.ok(at('sideRail') > 0.55 && at('sideRail') < 0.68);
  assert.ok(at('endRail') > 0.36 && at('endRail') < 0.47);
  assert.ok(at('corner') > 0.32 && at('corner') < 0.42);
  assert.ok(at('cornerTip') > 0.24 && at('cornerTip') < 0.32);
  // symmetric in both axes, and monotone from the centre along the long axis
  assert.ok(Math.abs(poolAt([0.7, 0, 0.3], LAMP) - poolAt([-0.7, 0, -0.3], LAMP)) < 1e-9);
  let prev = Infinity;
  for (let x = 0; x <= BED.hx + 1e-9; x += 0.05) { const v = poolAt([x, 0, 0], LAMP); assert.ok(v <= prev + 1e-12, 'monotone along x'); prev = v; }
  if (STATS) for (const k of Object.keys(POINTS)) console.log(`   ${k.padEnd(10)} form factor ${rectFormFactorUp(POINTS[k], LAMP).toFixed(4)}  pool ${at(k).toFixed(3)}`);
});

ok('pool: a point at or above the lamp plane gets nothing; the pool is clamped', () => {
  assert.equal(rectFormFactorUp([0, 1.02, 0], LAMP), 0);
  assert.equal(rectFormFactorUp([0, 1.5, 0], LAMP), 0);
  assert.ok(poolAt([0, 0.9, 0], LAMP) <= 1.25);
});

ok('lamp bounds: one emitter is itself, several give their bounding rectangle, bad rows are dropped', () => {
  assert.deepEqual(lampBounds([{ pos: [0.1, 1.02, -0.2], half: [1.025, 0.33] }]), { cx: 0.1, cz: -0.2, hx: 1.025, hz: 0.33, y: 1.02, emitters: 1 });
  const three = lampBounds([-0.75, 0, 0.75].map((x) => ({ pos: [x, 0.92, 0], half: [0.22, 0.12] })));
  assert.ok(Math.abs(three.hx - 0.97) < 1e-9 && Math.abs(three.hz - 0.12) < 1e-9 && three.cx === 0 && three.y === 0.92 && three.emitters === 3);
  assert.equal(lampBounds([]), null);
  assert.equal(lampBounds([{ pos: [0, NaN, 0], half: [1, 1] }, { pos: [0, 1, 0], half: [0, 1] }]), null);
  assert.equal(lampBounds(null), null);
});

ok('lamp radiance: one light is itself; several spread their flux over the bounding rectangle', () => {
  const one = lampRadiance([{ color: [0.9, 1, 0.8], intensity: 7.8, area: 2.05 * 0.66 }], LAMP);
  for (const [i, v] of [0.9 * 7.8, 7.8, 0.8 * 7.8].entries()) assert.ok(Math.abs(one[i] - v) < 1e-9);
  const rect = lampBounds([-0.75, 0, 0.75].map((x) => ({ pos: [x, 0.92, 0], half: [0.22, 0.12] })));
  const three = lampRadiance([0, 1, 2].map(() => ({ color: [1, 1, 1], intensity: 10, area: 0.44 * 0.24 })), rect);
  assert.ok(Math.abs(three[0] - 10 * 3 * 0.44 * 0.24 / (4 * rect.hx * rect.hz)) < 1e-9 && three[0] < 10, 'the flux is kept, the mean radiance is lower');
  assert.deepEqual(lampRadiance([], LAMP), [0, 0, 0]);
  assert.deepEqual(lampRadiance([{ color: [1, 1, 1], intensity: NaN, area: 1 }], LAMP), [0, 0, 0]);
});

ok('level law: identity values change nothing; the look\'s values give a clear pool whose darkest played cloth keeps the floor share of the centre', () => {
  const id = clothLevel(0.37, { direct: 1, ambient: 0, floor: 0 });
  assert.equal(id.up, 0.37); assert.equal(id.fill, 0); assert.equal(id.bounce, 0);
  const k = CLOTH_TUNE.pool;
  const lvl = (name) => clothLevel(poolAt(POINTS[name], LAMP), k).up;
  const centre = lvl('centre');
  assert.ok(Math.abs(centre - (k.direct + k.ambient)) < 1e-9);
  // monotone from the centre to the corner tip, and the tip sits on the floor (or just above it)
  const order = ['centre', 'midLength', 'quarter', 'sideRail', 'endRail', 'corner', 'cornerTip'].map(lvl);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] <= order[i - 1] + 0.05, `falls toward the tip (${order.map((v) => v.toFixed(2)).join(' ')})`);
  for (const name of Object.keys(POINTS)) assert.ok(lvl(name) / centre >= k.floor - 1e-9, `${name} is not under the floor`);
  assert.ok(lvl('cornerTip') / centre < k.floor + 0.06, 'the tip is the darkest played cloth');
  assert.ok(lvl('endRail') / centre > 0.28 && lvl('endRail') / centre < 0.5, `end rail / centre ${lvl('endRail') / centre}`);
  assert.ok(lvl('midLength') / centre > 0.78, 'the plateau under the lamp');
  // the ambient share of the centre's light: what a ball's lamp shadow keeps (the occlusion service reads this balance)
  assert.ok(k.ambient / centre > 0.05 && k.ambient / centre < 0.25, `ambient share ${k.ambient / centre}`);
  // a face under a cushion nose (normal 33 degrees under the horizon): the bed fills three quarters of its hemisphere
  const face = clothLevel(poolAt(POINTS.sideRail, LAMP), k, -0.54, 1);
  assert.ok(Math.abs(face.bedFF - 0.77) < 1e-9 && face.fill * 0 === 0);
  assert.ok(Math.abs(face.bounce - face.up * 0.77) < 1e-9 && face.ambient < k.ambient * 0.25);
  // a top face takes the bed's law whole
  const top = clothLevel(0.6, k, 0.97, 0);
  assert.equal(top.bedFF, 0); assert.equal(top.bounce, 0);
  if (STATS) for (const name of Object.keys(POINTS)) console.log(`   ${name.padEnd(10)} level / centre ${(lvl(name) / centre).toFixed(3)}`);
});

ok('throw and veil: a throw of 1 is the app\'s lamp term; the throw steepens the pool and keeps the centre; the veil is `lit` under the lamp and `dim` where the pool is gone', () => {
  const base = { direct: 2, ambient: 0.2, floor: 0 };
  for (const p of [1, 0.8, 0.44, 0.3]) assert.ok(Math.abs(clothLevel(p, { ...base, throw: 1 }).up - clothLevel(p, base).up) < 1e-12);
  assert.ok(Math.abs(clothLevel(1, { ...base, throw: 1.4 }).up - clothLevel(1, base).up) < 1e-12, 'the centre keeps its level');
  let prev = Infinity;
  for (const t of [1, 1.2, 1.5, 2]) { const v = clothLevel(0.44, { ...base, throw: t }).up; assert.ok(v < prev, 'a longer throw darkens the end'); prev = v; }
  const v = { lit: 0.02, dim: 0.3 }, k = { throw: 1.2 };
  assert.ok(Math.abs(clothVeil(1, k, v) - v.lit) < 1e-12 && Math.abs(clothVeil(1.2, k, v) - v.lit) < 1e-12 && Math.abs(clothVeil(0, k, v) - v.dim) < 1e-3);
  let last = -Infinity;
  for (const p of [1, 0.85, 0.6, 0.44, 0.3]) { const x = clothVeil(p, k, v); assert.ok(x > last, 'the veil grows as the pool falls'); last = x; }
  // with the look's values: none under the lamp, the same over the whole end zone (end rail and corner tip)
  const tv = CLOTH_TUNE.veil, tk = CLOTH_TUNE.pool;
  assert.ok(Math.abs(clothVeil(poolAt(POINTS.centre, LAMP), tk, tv) - tv.lit) < 1e-9);
  assert.ok(Math.abs(clothVeil(poolAt(POINTS.endRail, LAMP), tk, tv) - clothVeil(poolAt(POINTS.cornerTip, LAMP), tk, tv)) < 0.02 * tv.dim + 1e-9, 'one veil over the end zone');
  assert.ok(clothVeil(poolAt(POINTS.midLength, LAMP), tk, tv) < 0.5 * tv.dim, 'the plateau under the lamp is nearly unveiled');
});

ok('saturation: identity at 1, zero stays zero, the luminance is kept, a blue cloth gets deeper', () => {
  const W = [0.2126, 0.7152, 0.0722];
  const lum = (c) => W[0] * c[0] + W[1] * c[1] + W[2] * c[2];
  const blue = [0.0037, 0.1022, 0.3325];
  const same = clothSaturation(blue, 1);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(same[i] - blue[i]) < 1e-9);
  const deep = clothSaturation(blue, 1.15);
  assert.ok(Math.abs(lum(deep) - lum(blue)) < 1e-9, 'luminance kept');
  assert.ok(deep[2] > blue[2] && deep[0] < blue[0] && deep[1] / deep[2] < blue[1] / blue[2], 'deeper blue');
  const z = clothSaturation([0, 0.2, 0.1], 1.3);
  assert.ok(z[0] < 1e-6, 'a zero channel stays zero');
  const grey = clothSaturation([0.2, 0.2, 0.2], 1.4);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(grey[i] - 0.2) < 1e-9, 'grey is a fixed point');
});

ok('weave stand-in: a tileable tangent-space normal map with no mean tilt', () => {
  const { data, size } = weaveNormalData(64);
  assert.equal(size, 64); assert.equal(data.length, 64 * 64 * 4);
  let sx = 0, sy = 0, minZ = 255, varX = 0;
  for (let i = 0; i < size * size; i++) { sx += data[i * 4] - 127.5; sy += data[i * 4 + 1] - 127.5; minZ = Math.min(minZ, data[i * 4 + 2]); varX += (data[i * 4] - 127.5) ** 2; assert.equal(data[i * 4 + 3], 255); }
  assert.ok(Math.abs(sx / (size * size)) < 1.0 && Math.abs(sy / (size * size)) < 1.0, 'no mean tilt');
  assert.ok(minZ > 160, 'normals point out of the surface');
  assert.ok(Math.sqrt(varX / (size * size)) > 8, 'there is relief');
  assert.equal(weaveNormalData(60).size % 8, 0, 'the size is rounded to the pattern period');
  assert.ok(WEAVE_FALLBACK_THREAD_M > 1e-4 && WEAVE_FALLBACK_THREAD_M < 1e-3);
});

// a stand-in for the app's cloth fragment shader: the anchors in the order three and shading.js injectAnalytic leave them
const VS = 'void main() {\n#include <common>\n#include <project_vertex>\n}';
const FS = [
  '#include <common>', 'void main() {', '#include <map_fragment>', 'SPIKE_WEAR_MAP;', '#include <normal_fragment_begin>',
  '#include <normal_fragment_maps>', 'SPIKE_NAPAA; SPIKE_DETAIL; SPIKE_DIMPLE;', '#include <clearcoat_normal_fragment_begin>',
  '#include <lights_physical_fragment>', 'SPIKE_WEAR_SHEEN;', '#include <lights_fragment_begin>', '#include <lights_fragment_end>',
  '{', '      spikeShadow *= mix( 1.0, gi.a, uGiShadow );', `  ${SPIKE_RAIL}`, '  reflectedLight.indirectDiffuse *= spikeOcc;', '}', '}',
].join('\n');

ok('patch: before / after anchors only, every anchor is found, the four pieces land where they must', () => {
  for (const weave of [true, false]) {
    const spec = clothPatchSpec({ weave, uniforms: {} });
    assert.equal(spec.key, `mat-cloth-v${CLOTH_PATCH_VERSION}${weave ? '-w' : ''}`);
    for (const a of spec.apply) assert.ok(a.mode === 'before' || a.mode === 'after', `mode ${a.mode}`);
    const r = applyPatchText(VS, FS, spec);
    assert.equal(r.ok, true, 'the patch applies');
    assert.equal(r.vs, VS, 'the vertex shader is untouched (the app already carries the world position)');
    const f = r.fs;
    const at = (s) => { const i = f.indexOf(s); assert.ok(i >= 0, `missing: ${s}`); return i; };
    assert.ok(at('uniform vec4 uClubClothPool;') > at('#include <common>') && at('uniform vec4 uClubClothPool;') < at('void main()'));
    assert.ok(at('clubClothSat( diffuseColor.rgb') > at(ANCHOR_COLOUR) && at('clubClothSat( diffuseColor.rgb') < at('SPIKE_WEAR_MAP'), 'colour: right after the map, before the wear deposit');
    assert.ok(at('clubClothCushW = uClubClothCush.w') > at('SPIKE_DIMPLE') && at('clubClothCushW = uClubClothCush.w') < at(ANCHOR_FRAME), 'frame: after the app normal stage');
    assert.ok(at('material.sheenColor = clubClothSat') > at(ANCHOR_SHEEN) && at('material.sheenColor = clubClothSat') < at('SPIKE_WEAR_SHEEN'), 'sheen: right after the material is set up');
    assert.ok(at('float clubRel = uClubClothPool.x') > at(ANCHOR_LIGHT) && at('float clubRel = uClubClothPool.x') < at('gi.a, uGiShadow') && at('float clubRel = uClubClothPool.x') < at(SPIKE_RAIL), 'light: on the finished light terms, before the rails');
    assert.equal((f.match(/uniform\s+sampler2D/g) ?? []).length, weave ? 1 : 0, 'at most one added sampler');
    assert.equal(f.includes('textureGrad( uClubClothWeave'), weave);
    assert.equal(f.includes('clubSt'), false, 'the stretched second tap of round 1 is gone');
    // every uniform the text declares is one the part supplies, and nothing else
    const declared = [...f.matchAll(/uniform\s+\w+\s+(uClub\w+)(?:\[\s*\d+\s*\])?\s*;/g)].map((m) => m[1]).sort();
    assert.deepEqual(declared, clothUniformNames(weave).slice().sort());
    // a missing anchor skips the whole patch
    const broken = applyPatchText(VS, FS.replace(ANCHOR_LIGHT, 'something else;'), spec);
    assert.equal(broken.ok, false); assert.equal(broken.fs, FS.replace(ANCHOR_LIGHT, 'something else;'));
  }
});

ok('patch: composes with the occlusion patches in either order (no shared identifier; the light piece lands before the occlusion terms read the light)', () => {
  const cloth = clothPatchSpec({ weave: true, uniforms: {} });
  const occ = occPatchSpec('table', { uniforms: {} }), gi = occPatchSpec('gi', { uniforms: {} });
  const run = (specs) => { let v = VS, f = FS; for (const s of specs) { const r = applyPatchText(v, f, s); assert.equal(r.ok, true, `${s.key} applies`); v = r.vs; f = r.fs; } return f; };
  const a = run([occ, gi, cloth]), b = run([cloth, occ, gi]);
  for (const f of [a, b]) {
    const light = f.indexOf('float clubRel = uClubClothPool.x'), vis = f.indexOf('clubVisibility3( vSpikeWorldPos');
    assert.ok(light > 0 && vis > 0 && light < vis && vis < f.indexOf(SPIKE_RAIL), 'light piece, then the occlusion terms, then the rails');
    assert.equal((f.match(/uniform\s+sampler2D\s+uClubClothWeave/g) ?? []).length, 1);
  }
  // identifiers: everything this patch declares at file scope starts with clubCloth / uClubCloth, the occlusion text never does
  const own = [...cloth.pars.matchAll(/^(?:uniform\s+)?(?:vec[234]|float|sampler2D)\s+(\w+)/gm)].map((m) => m[1]);
  assert.ok(own.length >= 12);
  for (const id of own) assert.ok(/^(uClubCloth|clubCloth)/.test(id), `prefix: ${id}`);
  assert.equal(/clubCloth|uClubCloth/.test(occ.pars + occ.apply.map((x) => x.code).join('')), false);
  // every local of the pieces is prefixed too (they share main() with the app's and the other services' locals)
  for (const piece of cloth.apply) for (const m of piece.code.matchAll(/^\s*(?:const\s+)?(?:vec[234]|float|mat3)\s+(\w+)/gm)) assert.ok(/^club/.test(m[1]), `local ${m[1]}`);
});

// the real texts the anchors must exist in: three's physical fragment shader (vendored build) and the app's shading.js
const THREE = await import('../../vendor/three.module.min.js');
const { readFileSync } = await import('node:fs');
ok('patch: every anchor exists once in the vendored three physical shader / in shading.js, in the order the patch assumes', () => {
  const f = THREE.ShaderLib.physical.fragmentShader;
  const count = (text, s) => text.split(s).length - 1;
  for (const a of [ANCHOR_COLOUR, ANCHOR_FRAME, ANCHOR_SHEEN, ANCHOR_LIGHT, '#include <common>']) assert.equal(count(f, a), 1, `${a} once in the physical fragment shader`);
  const order = ['#include <common>', ANCHOR_COLOUR, '#include <normal_fragment_begin>', '#include <normal_fragment_maps>', ANCHOR_FRAME, ANCHOR_SHEEN, '#include <lights_fragment_begin>', ANCHOR_LIGHT].map((a) => f.indexOf(a));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1] && order[i - 1] >= 0, 'chunk order');
  // what the patch text reads from three's chunks
  assert.ok(THREE.ShaderChunk.normal_fragment_begin.includes('vec3 nonPerturbedNormal = normal;'));
  assert.ok(THREE.ShaderChunk.lights_physical_fragment.includes('material.sheenColor = sheenColor;') && THREE.ShaderChunk.lights_physical_fragment.includes('material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );'));
  assert.ok(THREE.ShaderChunk.lights_physical_fragment.includes('material.diffuseColor = diffuseColor.rgb') && THREE.ShaderChunk.lights_physical_fragment.includes('material.specularF90'));
  assert.ok(THREE.ShaderChunk.common.includes('vec3 inverseTransformDirection('));
  // the light piece rewrites the finished terms: they must be complete at <lights_fragment_end> and named as the text names them
  const end = THREE.ShaderChunk.lights_fragment_end, phys = THREE.ShaderChunk.lights_physical_pars_fragment;
  assert.ok(end.includes('RE_IndirectDiffuse( irradiance') && end.includes('RE_IndirectSpecular( radiance, iblIrradiance'));
  for (const id of ['reflectedLight.indirectSpecular +=', 'reflectedLight.indirectDiffuse +=', 'sheenSpecularIndirect +=', 'reflectedLight.directDiffuse +=', 'reflectedLight.directSpecular +=']) assert.ok(phys.includes(id), `three: ${id}`);
  const shading = readFileSync(new URL('../../scene/shading.js', import.meta.url), 'utf8');
  // the app replaces <lights_fragment_end> by itself plus its rail block: the include is still there, once, before the rails
  assert.ok(count(shading, `const SPIKE_APPLY = /* glsl */\`\n${ANCHOR_LIGHT}\n{`) === 1, 'shading.js: SPIKE_APPLY starts with the include');
  assert.ok(count(shading, `  ${SPIKE_RAIL}\n  reflectedLight.directSpecular *= spikeShadow;`) === 1, 'the shadow rail line of SPIKE_APPLY');
  // the view-distance fade the light piece divides out: the app's lines are as the patch copies them, inside the SPIKE_CLOTH
  // block, after the rail line (so the piece lands before them), and the define is the one the patch tests
  for (const line of Object.values(APP_TONE)) assert.equal(count(shading, line), 1, `shading.js: ${line}`);
  assert.ok(shading.indexOf(APP_TONE.tone) > shading.indexOf(`  ${SPIKE_RAIL}\n`) && shading.includes("fs = '#define SPIKE_CLOTH\\n' + fs;"));
  for (const use of ['reflectedLight.directDiffuse *= spikeTone;', 'reflectedLight.indirectDiffuse *= spikeTone;', 'reflectedLight.directSpecular *= spikeTone;']) assert.equal(count(shading, use), 1, `shading.js: ${use}`);
  const light = clothPatchSpec({ uniforms: {} }).apply.find((x) => x.anchor === ANCHOR_LIGHT).code;
  assert.ok(light.includes('smoothstep( 0.55, 3.0, length( vViewPosition ) )') && light.includes('( 0.20 + 0.14 * ( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ) ) )') && light.includes('#ifdef SPIKE_CLOTH'));
  for (const id of ['float spikeShadow = 1.0;', 'float spikeOcc = 1.0;', 'varying vec3 vSpikeWorldPos;', "'#include <map_fragment>' + SPIKE_WEAR_MAP", "'#include <lights_physical_fragment>' + SPIKE_WEAR_SHEEN"]) assert.ok(shading.includes(id), `shading.js: ${id}`);
});

ok('tune: the default is the variant without a sampler; every group has an identity', () => {
  assert.equal(clothPatchSpec({ uniforms: {} }).key, `mat-cloth-v${CLOTH_PATCH_VERSION}`);
  assert.ok(CLOTH_TUNE.pool.direct >= 1 && CLOTH_TUNE.pool.floor >= 0.2 && CLOTH_TUNE.pool.floor < 0.6 && CLOTH_TUNE.pool.probe === 0);
  assert.ok(CLOTH_TUNE.veil.lit >= 0 && CLOTH_TUNE.veil.lit <= CLOTH_TUNE.veil.dim && CLOTH_TUNE.veil.dim < 0.6, 'the veil runs against the pool');
  assert.ok(CLOTH_TUNE.pool.throw >= 1 && CLOTH_TUNE.pool.throw <= 2 && CLOTH_TUNE.tone.sheenDye >= 0 && CLOTH_TUNE.tone.sheenDye <= 1 && CLOTH_TUNE.tone.sheenGraze > 0 && CLOTH_TUNE.tone.sheenGraze <= 1 && CLOTH_TUNE.tone.grazeFrom < CLOTH_TUNE.tone.grazeTo);
  assert.ok(CLOTH_TUNE.face.level > 0 && CLOTH_TUNE.face.level <= 2 && CLOTH_TUNE.face.veil >= 0 && CLOTH_TUNE.face.veil < 0.2);
});

// the lane's fixed views (tools/views.json of the lane, copied: world metres)
const VIEWS = {
  V1: { cam: [-2.3, 1.05, 1.35], target: [0.1, 0, 0], fovDeg: 40 }, V2: { cam: [-1.35, 0.32, 0.22], target: [0.2, 0, 0], fovDeg: 32 },
  V3: { cam: [-2.15, 0.62, 0], target: [0.6, 0, 0], fovDeg: 38 }, V6: { cam: [0.05, 0.115, 0.75], target: [0.5, 0.045, 0.6], fovDeg: 26 },
  V7: { cam: [-0.85, 0.2, 0.42], target: [0.05, 0.02, -0.02], fovDeg: 28 }, V9: { cam: [-4.0, 1.6, 2.6], target: [0, 0.3, 0], fovDeg: 50 },
};
const FILE = { tilesPerM: 1 / 0.266, size: 1024 };
const keepAt = (view, px, py) => {
  const fp = bedFootprint(VIEWS[view], px, py, FILE.tilesPerM);
  if (!fp) return null;
  return { ...weaveKeep(fp.dx, fp.dy, FILE.size, KEEP), distance: fp.distance, point: fp.point };
};

ok('weave fade (sampler variant): nothing on the bed at the standing, break and wide views; on only where a pixel resolves a thread', () => {
  // no weave anywhere on the bed at V1, V3 and V9: nothing there can shimmer
  for (const v of ['V1', 'V3', 'V9']) {
    for (let py = 40; py < 720; py += 40) for (let px = 40; px < 1280; px += 80) {
      const fine = keepAt(v, px, py);
      if (!fine) continue;
      if (Math.abs(fine.point[0]) > 1.27 || Math.abs(fine.point[2]) > 0.635) continue; // off the bed
      assert.ok(fine.keep === 0, `${v} at ${px},${py}: ${fine.keep}`);
    }
  }
  // the close-up at 1280 x 720: at the resolution limit, off; a 4K frame resolves it
  assert.ok(keepAt('V7', 640, 700).keep < 0.1);
  const fp4k = bedFootprint({ ...VIEWS.V7, w: 3840, h: 2160 }, 1920, 2100, FILE.tilesPerM);
  assert.ok(weaveKeep(fp4k.dx, fp4k.dy, FILE.size, KEEP).keep > 0.5, 'on in the close-up at 4K');
  // the footprint math: an isotropic footprint of one texel keeps all, of three texels nothing; a 30 x 1 footprint is cut
  assert.equal(weaveKeep([0.5 / 64, 0], [0, 0.5 / 64], 64).keep, 1);
  assert.equal(weaveKeep([3 / 64, 0], [0, 3 / 64], 64).keep, 0);
  assert.equal(weaveKeep([30 / 64, 0], [0, 0.5 / 64], 64).keep, 0);
  const rot = weaveKeep([0.6 / 64, 0.6 / 64], [-0.6 / 64, 0.6 / 64], 64); // the same square pixel turned 45 degrees
  assert.ok(Math.abs(rot.narrow - rot.wide) < 1e-9 && Math.abs(rot.narrow - 0.6 * Math.SQRT2) < 1e-9);
  if (STATS) for (const v of Object.keys(VIEWS)) for (const py of [700, 540, 400]) {
    const a = keepAt(v, 640, py);
    if (a) console.log(`   ${v} pixel 640,${py}: ${a.distance.toFixed(2)} m, ${a.narrow.toFixed(2)} x ${a.wide.toFixed(1)} texels keep ${a.keep.toFixed(2)}`);
  }
});

ok('weave coordinate: world axes on the bed, folded over a cushion profile within a factor 1.42, threads along the rail', () => {
  // the bed: exactly (x, -z), whatever the height of the eye or the noise of a normal
  for (const [x, z] of [[0.1, 0.05], [1.2, 0.6], [-0.7, -0.33]]) assert.deepEqual(weaveCoord([x, 0, z], [0, 1, 0], 0), [x, -z]);
  assert.deepEqual(weaveCoord([0.4, 0, 0.2], [0.001, 0.9999, -0.0007], 0), [0.4, -0.2]);
  // a long cushion (profile in the y-z plane): moving along the rail moves only the first coordinate, one to one
  const a = weaveCoord([0.3, 0.03, 0.66], [0, 0.97, -0.24], 1), b = weaveCoord([0.5, 0.03, 0.66], [0, 0.97, -0.24], 1);
  assert.ok(Math.abs((b[0] - a[0]) - 0.2) < 1e-12 && Math.abs(b[1] - a[1]) < 1e-12);
  // across the profile: the coordinate's rate against true surface distance stays within [1 / 1.42, 1.42] on a top face
  // that falls 15 degrees toward the nose and on an under face that runs back at 45 to 70 degrees
  const rate = (p0, p1, n) => { const d = Math.hypot(p1[1] - p0[1], p1[2] - p0[2]); return Math.abs(weaveCoord(p1, n, 1)[1] - weaveCoord(p0, n, 1)[1]) / d; };
  const top = rate([0, 0.040, 0.70], [0, 0.0363, 0.686], [0, 0.97, -0.26]);
  assert.ok(top > 1 / 1.42 && top < 1.42, `top face rate ${top}`);
  for (const deg of [45, 60, 70]) {
    const t = deg * Math.PI / 180, p0 = [0, 0.0363, 0.635], p1 = [0, 0.0363 - 0.02 * Math.sin(t), 0.635 + 0.02 * Math.cos(t)];
    const r = rate(p0, p1, [0, -Math.cos(t), -Math.sin(t)]);
    assert.ok(r > 1 / 1.42 && r < 1.42, `under face at ${deg} degrees: rate ${r}`);
  }
  // an end cushion: the threads run along z (the rail), the fold uses x
  const e0 = weaveCoord([1.30, 0.03, 0.1], [-0.3, 0.95, 0], 1), e1 = weaveCoord([1.30, 0.03, 0.3], [-0.3, 0.95, 0], 1);
  assert.ok(Math.abs(Math.abs(e1[0] - e0[0]) - 0.2) < 1e-12 && Math.abs(e1[1] - e0[1]) < 1e-12);
});

if (STATS) {
  // the look's colour through the grade and the tone map (the render role's grade table, read only)
  const { gradeColor } = await import('../../scene/club/post/gradelut.js');
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const aces = (c, e) => { const [r, g, b] = c.map((x) => x * e / 0.6);
    const i = [0.59719 * r + 0.35458 * g + 0.04823 * b, 0.076 * r + 0.90834 * g + 0.01566 * b, 0.0284 * r + 0.13383 * g + 0.83777 * b].map(fit);
    return [1.60475 * i[0] - 0.53108 * i[1] - 0.07367 * i[2], -0.10208 * i[0] + 1.10813 * i[1] - 0.00605 * i[2], -0.00327 * i[0] - 0.07276 * i[1] + 1.07602 * i[2]].map((x) => Math.min(1, Math.max(0, x))); };
  const srgb = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  const screen = (c) => aces(gradeColor(c.map((x) => x * 0.92)), 0.85).map(srgb);
  const blue = [0.0037, 0.1022, 0.3325];
  for (const s of [1, 1.12]) for (const E of [1.0, 1.5, 2.0, 2.6, 3.5]) console.log(`   saturation ${s} radiance/albedo ${E}: screen ${screen(clothSaturation(blue, s).map((v) => v * E)).join(',')}`);
}

console.log(`\n${n} checks passed`);
