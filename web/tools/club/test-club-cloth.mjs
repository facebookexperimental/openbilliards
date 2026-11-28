// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-cloth.mjs — node arm for the cloth part's pure logic (CONTRACT.md 9.1): the lamp pool's closed form against a
// brute-force sum, the emitter bounds and radiance, the level law of the light piece, the saturation form, the stand-in weave,
// and the shape of the shader patch (anchors, composition with the occlusion patch in either order, the sampler count).
// Run: node web/tools/club/test-club-cloth.mjs   (add --stats to print the pool table and the tone table)
import assert from 'node:assert/strict';
import { rectFormFactorUp, rectFormFactorUpBrute, lampBounds, lampRadiance, poolAt, clothLevel, clothVeil, clothSaturation, weaveKeep, bedFootprint, weaveCoord } from '../../scene/club/mat/cloth/pool.js';
import { weaveNormalData, WEAVE_FALLBACK_THREAD_M } from '../../scene/club/mat/cloth/weave.js';
import {
  clothPatchSpec, clothUniformNames, CLOTH_PATCH_VERSION, SPIKE_RAIL, SPIKE_SHEEN_RAIL, ANCHOR_COLOUR, ANCHOR_FRAME, ANCHOR_SHEEN, ANCHOR_LIGHT, KEEP,
  APP_TONE,
} from '../../scene/club/mat/cloth/glsl.js';
import { CLOTH_TUNE, CLOTH_LEVEL, LEVEL_RANGE, levelUnderLamp } from '../../scene/club/mat/cloth/tune.js';
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

// a stand-in for the app's cloth fragment shader: the anchors in the order three and shading.js injectAnalytic leave them.
// SPIKE_APPLY ends with the app's sheen rails, copied from shading.js (pinned there below)
const SHEEN_RAILS = ['  #ifdef USE_SHEEN', `    ${SPIKE_SHEEN_RAIL}`, '    sheenSpecularIndirect *= spikeOcc;', '  #endif'];
const VS = 'void main() {\n#include <common>\n#include <project_vertex>\n}';
const FS = [
  '#include <common>', 'void main() {', '#include <map_fragment>', 'SPIKE_WEAR_MAP;', '#include <normal_fragment_begin>',
  '#include <normal_fragment_maps>', 'SPIKE_NAPAA; SPIKE_DETAIL; SPIKE_DIMPLE;', '#include <clearcoat_normal_fragment_begin>',
  '#include <lights_physical_fragment>', 'SPIKE_WEAR_SHEEN;', '#include <lights_fragment_begin>', '#include <lights_fragment_end>',
  '{', '      spikeShadow *= mix( 1.0, gi.a, uGiShadow );', `  ${SPIKE_RAIL}`, '  reflectedLight.indirectDiffuse *= spikeOcc;',
  // the app's lamp sheen (three gives a rect light none) and the line that finishes it
  '  #if defined( USE_SHEEN ) && ( NUM_RECT_AREA_LIGHTS > 0 ) && !defined( SPIKE_NOLAMPSHEEN )',
  '      sheenSpecularDirect += spikeLamp.color * material.sheenColor * spikeLtc.z;', '  #endif', ...SHEEN_RAILS,
  '}', '}',
].join('\n');

ok('patch: before / after anchors only, every anchor is found, the five pieces land where they must', () => {
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
    const lampSheen = at('sheenSpecularDirect *= 1.0 + uClubClothLevel.x;');
    assert.ok(lampSheen > at('sheenSpecularDirect += spikeLamp.color') && lampSheen < at(SPIKE_SHEEN_RAIL), 'lamp sheen: after the app adds the lamp\'s sheen, right before the line that finishes it');
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
  for (const id of ['reflectedLight.indirectSpecular +=', 'reflectedLight.indirectDiffuse +=', 'sheenSpecularIndirect +=', 'sheenSpecularDirect +=', 'reflectedLight.directDiffuse +=', 'reflectedLight.directSpecular +=']) assert.ok(phys.includes(id), `three: ${id}`);
  // three's rect-light path gives no sheen (so at the light piece the variable holds no lamp sheen: the app adds it later)
  const rectArea = phys.indexOf('void RE_Direct_RectArea_Physical('), direct = phys.indexOf('void RE_Direct_Physical(');
  assert.ok(rectArea >= 0 && direct > rectArea && !phys.slice(rectArea, direct).includes('sheen'), 'three: RE_Direct_RectArea_Physical adds no sheen');
  const shading = readFileSync(new URL('../../scene/shading.js', import.meta.url), 'utf8');
  // the app replaces <lights_fragment_end> by itself plus its rail block: the include is still there, once, before the rails
  assert.ok(count(shading, `const SPIKE_APPLY = /* glsl */\`\n${ANCHOR_LIGHT}\n{`) === 1, 'shading.js: SPIKE_APPLY starts with the include');
  assert.ok(count(shading, `  ${SPIKE_RAIL}\n  reflectedLight.directSpecular *= spikeShadow;`) === 1, 'the shadow rail line of SPIKE_APPLY');
  // the lamp's sheen: the app adds it in SPIKE_APPLY after the rails, and finishes it on one line after that block, the lamp
  // sheen piece's anchor (so the level lands on the lamp's sheen, not on material.sheenColor, which other legs read)
  assert.equal(count(shading, SPIKE_SHEEN_RAIL), 1, `shading.js: ${SPIKE_SHEEN_RAIL} once`);
  assert.equal(count(shading, SHEEN_RAILS.join('\n')), 1, 'shading.js: the sheen rails of SPIKE_APPLY, as the stand-in copies them');
  // every cloth program carries the anchor once: SPIKE_APPLY's own text holds the sheen rails, and no text spliced into it, nor
  // the several-emitter apply's replacements (SPIKE_APPLY_MULTI), holds the line
  const constText = (name) => { const m = shading.match(new RegExp(`const ${name} = (?:/\\* glsl \\*/ ?)?\`([\\s\\S]*?)\`;`)); assert.ok(m, `shading.js: const ${name}`); return m[1]; };
  const applyText = constText('SPIKE_APPLY');
  assert.equal(count(applyText, SHEEN_RAILS.join('\n')), 1, 'shading.js: the sheen rails are in SPIKE_APPLY');
  const spliced = new Set([...applyText.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]));
  for (const name of ['SPIKE_SHADOW_MULTI', 'SPIKE_SHEEN_OPEN_MULTI', 'SPIKE_SHEEN_CLOSE_MULTI']) spliced.add(name);
  for (const name of spliced) assert.ok(!constText(name).includes(SPIKE_SHEEN_RAIL), `shading.js: ${name} holds no ${SPIKE_SHEEN_RAIL}`);
  assert.equal(count(shading, 's = surgical(s, '), 3, 'shading.js: SPIKE_APPLY_MULTI replaces three texts');
  const sheenRail = shading.indexOf(SPIKE_SHEEN_RAIL), lampSheenAdds = [...shading.matchAll(/sheenSpecularDirect \+= spikeLamp\.color \* material\.sheenColor/g)].map((m) => m.index);
  assert.ok(lampSheenAdds.length >= 1 && lampSheenAdds.every((i) => i > shading.indexOf(`  ${SPIKE_RAIL}\n`) && i < sheenRail), 'shading.js: the lamp sheen is added after the rails, before the line that finishes it');
  assert.equal(count(shading, 'sheenSpecularDirect +='), lampSheenAdds.length, 'shading.js: no other addition to the direct sheen');
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

// ---- the lamp's level on this cloth (issue #1390): tune.js CLOTH_LEVEL, the patch's uClubClothLevel, cloth.js's read ----
ok('level: a missing look, key or lamp reads 1, a row gives its k, an unusable row reads 1; every shipped row is frozen and reads as written', () => {
  const t = { arena: { pool_pro_9ft: { perimeter_ring: 0.31, pendant_bar: 0, carom_luminaire: NaN, snooker_luminaire: '0.4' } }, club: {} };
  assert.deepEqual(levelUnderLamp(t, 'arena', 'pool_pro_9ft', 'perimeter_ring'), { k: 0.31, found: true });
  for (const [look, key, fixture] of [['arena', 'pool_pro_9ft', 'canopy_panel'], ['arena', 'pool_pro_8ft', 'perimeter_ring'], ['club', 'pool_pro_9ft', 'perimeter_ring'],
    ['default', 'pool_pro_9ft', 'perimeter_ring'], ['arena', null, 'perimeter_ring'], ['arena', 'pool_pro_9ft', null], ['arena', '__proto__', 'toString'],
    ['arena', 'pool_pro_9ft', 'pendant_bar'], ['arena', 'pool_pro_9ft', 'carom_luminaire'], ['arena', 'pool_pro_9ft', 'snooker_luminaire']]) {
    assert.deepEqual(levelUnderLamp(t, look, key, fixture), { k: 1, found: false }, `${look} ${key} ${fixture}`);
  }
  assert.deepEqual(levelUnderLamp(null, 'arena', 'pool_pro_9ft', 'perimeter_ring'), { k: 1, found: false });
  // own members only: a member of a prototype is no row ('constructor' and 'hasOwnProperty' are on every object; the first
  // triple read through the chain is 'Object'.length, a "row" of 6)
  for (const [look, key, fixture] of [['constructor', 'name', 'length'], ['arena', 'constructor', 'name'], ['arena', 'hasOwnProperty', 'length'],
    ['arena', 'pool_pro_9ft', 'constructor'], ['arena', 'pool_pro_9ft', 'hasOwnProperty']]) {
    assert.deepEqual(levelUnderLamp(t, look, key, fixture), { k: 1, found: false }, `${look} ${key} ${fixture}`);
  }
  assert.deepEqual(levelUnderLamp({ arena: { pool_pro_9ft: Object.create({ perimeter_ring: 0.31 }) } }, 'arena', 'pool_pro_9ft', 'perimeter_ring'), { k: 1, found: false }, 'an inherited row');
  // the range: its ends are rows, past them (and below zero) a k reads 1
  const [lo, hi] = LEVEL_RANGE;
  assert.ok(Object.isFrozen(LEVEL_RANGE) && lo > 0 && lo <= 0.2 && hi >= 5);
  for (const [k, found] of [[lo, true], [hi, true], [lo * 0.999, false], [hi * 1.001, false], [Infinity, false], [-0.31, false]]) {
    assert.deepEqual(levelUnderLamp({ arena: { t: { f: k } } }, 'arena', 't', 'f'), found ? { k, found } : { k: 1, found: false }, `k ${k}`);
  }
  assert.ok(Object.isFrozen(CLOTH_LEVEL) && Object.isFrozen(CLOTH_LEVEL.arena) && Object.isFrozen(CLOTH_LEVEL.club));
  assert.deepEqual(Object.keys(CLOTH_LEVEL).sort(), ['arena', 'club']);
  for (const look of ['arena', 'club']) for (const [key, row] of Object.entries(CLOTH_LEVEL[look])) {
    assert.ok(Object.isFrozen(row), `${look} ${key}: frozen`);
    for (const [fixture, k] of Object.entries(row)) assert.deepEqual(levelUnderLamp(CLOTH_LEVEL, look, key, fixture), { k, found: true }, `${look} ${key} ${fixture}`);
  }
});

ok('level: the light piece takes it on every leg whose source is the app\'s lamp, after their gains, and on no environment leg; the lamp\'s sheen where the app adds it', () => {
  for (const weave of [false, true]) {
    const spec = clothPatchSpec({ weave, uniforms: {} });
    assert.ok(spec.pars.includes('uniform vec4 uClubClothLevel;'), 'declared in both variants');
    assert.ok(clothUniformNames(weave).includes('uClubClothLevel'));
  }
  const spec = clothPatchSpec({ uniforms: {} });
  const light = spec.apply.find((a) => a.anchor === ANCHOR_LIGHT).code;
  const at = (s) => { const i = light.indexOf(s); assert.ok(i >= 0, `missing: ${s}`); assert.equal(light.indexOf(s, i + 1), -1, `twice: ${s}`); return i; };
  // the uniform holds k - 1: unset (0) is the look as tuned, whatever cloth.js does
  const lv = at('float clubLevel = 1.0 + uClubClothLevel.x;');
  // the indirect legs carry the environment's share (the app's probe x uClubClothPool.w, its specular x uClubClothVeil.w) beside
  // the club's own terms: the level adds (k - 1) of the club's terms, the same expressions the legs were written with
  const clubDiffuse = 'material.diffuseColor * ( clubAmb + clubBounce ) * clubEven', clubSpecular = 'clubVeil + clubBounce * uClubClothFace.y';
  at(`reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * uClubClothPool.w + ${clubDiffuse};`);
  at(`reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * uClubClothVeil.w + ${clubSpecular};`);
  const legs = ['reflectedLight.directDiffuse *= clubLevel;', 'reflectedLight.directSpecular *= clubLevel;',
    `reflectedLight.indirectDiffuse += ${clubDiffuse} * uClubClothLevel.x;`, `reflectedLight.indirectSpecular += ( ${clubSpecular} ) * uClubClothLevel.x;`];
  // after every gain the piece writes on those legs (the level scales the finished leg; at 1 it multiplies by one and adds zero)
  for (const g of ['reflectedLight.directDiffuse *= uClubClothPool.x', 'reflectedLight.directSpecular *= clubClothThrow', 'reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * uClubClothPool.w',
    'reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * uClubClothVeil.w', 'sheenSpecularIndirect *= uClubClothVeil.w;']) assert.ok(at(g) < lv, `gain before the level: ${g}`);
  for (const l of legs) assert.ok(at(l) > lv, `the level on: ${l}`);
  // the environment's legs keep their own gain only, and the light piece leaves the direct sheen alone: it holds no lamp sheen
  // there (the app adds it later, in SPIKE_APPLY)
  assert.equal(light.match(/clubLevel/g).length, 1 + legs.reduce((s, l) => s + (l.match(/clubLevel/g) ?? []).length, 0), 'no other use of the level');
  assert.equal(light.match(/uClubClothLevel/g).length, 3, 'the uniform: the level and the two indirect legs');
  assert.ok(!/(indirectDiffuse|indirectSpecular|sheenSpecularIndirect)\s*\*=\s*clubLevel/.test(light));
  assert.ok(!light.includes('sheenSpecularDirect'), 'the light piece does not touch the direct sheen');
  // the lamp sheen piece: once, right before the app's line that finishes the lamp's sheen, the level and nothing else
  const sheenPieces = spec.apply.filter((a) => a.code.includes('sheenSpecularDirect'));
  assert.deepEqual(sheenPieces.map((a) => [a.anchor, a.mode, a.code]), [[SPIKE_SHEEN_RAIL, 'before', 'sheenSpecularDirect *= 1.0 + uClubClothLevel.x;']]);
  assert.equal(CLOTH_PATCH_VERSION, 4);
});

{
  // the cloth part itself (cloth.js) on stand-ins: its level by key, and at the first render a fixture swap or a table change
  // shows, ahead of its draw list (scene.onBeforeRender, and the frame hook). Needs node:module registerHooks to load three
  // (node 22.15 or later; the CI's setup-node 22 has it): without it these arms FAIL by name, they never skip green.
  const nodeModule = await import('node:module');
  if (typeof nodeModule.registerHooks !== 'function') {
    console.log('FAIL the cloth part arms need node:module registerHooks (node 22.15 or later): the cloth part is not built here');
    process.exitCode = 1;
  } else {
    const threeUrl = new URL('../../vendor/three.module.min.js', import.meta.url).href;
    nodeModule.registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : next(specifier, context); } });
    const { applyCloth } = await import('../../scene/club/mat/cloth.js');
    // stand-ins for two of the app's lamps over the 9 ft bed, a canopy and a four-bar ring: the RectAreaLight members the part
    // reads (world metres; any sizes that light a pool do)
    const rect = (x, y, z, w, h, intensity) => ({ isRectAreaLight: true, visible: true, intensity, width: w, height: h, color: { r: 1, g: 0.96, b: 0.9 },
      getWorldPosition: (v) => v.set(x, y, z) });
    const canopy = [rect(0, 1.02, 0, 2.05, 0.66, 7.6)];
    const ring = [rect(0, 1.143, -0.6382, 2.4613, 0.0698, 103.73), rect(0, 1.143, 0.6382, 2.4613, 0.0698, 103.73),
      rect(-1.2656, 1.143, 0, 0.0698, 1.3462, 103.73), rect(1.2656, 1.143, 0, 0.0698, 1.3462, 103.73)];
    const lightRefs = { rectLights: canopy };
    const app = { matchKey: 'pool_pro_9ft', fixture: 'canopy_panel' };
    // the table handle (table.js buildTable: tableId() names the built table) and the scene (three calls its onBeforeRender at
    // the start of every render of it, a cube camera's included); the app's own handler is kept and runs after the part's check
    let tableId = 'pool_pro_9ft';
    const before = [];
    const scene = { onBeforeRender(r, s, cam, rt) { before.push([this, r, s, cam, rt]); } };
    const hadWindow = 'window' in globalThis, oldWindow = globalThis.window;
    globalThis.window = { __lighting: { state: () => ({ ...app }) } };
    const hooks = [];
    try {
      const part = await applyCloth({ ctx: { room: { lightRefs }, table: { tableId: () => tableId }, query: { get: () => null }, renderer: null, gi: null, scene },
        adopt: { patch: () => true, find: () => [] }, onFrame: (fn) => hooks.push(fn), knobs: {}, venue: 'arena', assets: null, env: null });
      const bare = await applyCloth({ ctx: { query: { get: () => null } }, adopt: { patch: () => true, find: () => [] }, onFrame: () => {}, knobs: {}, venue: 'arena', assets: null, env: null });
      // a part with the room's lights and no scene: only its frame hook checks
      const lights2 = { rectLights: canopy }, hooks2 = [];
      const hookOnly = await applyCloth({ ctx: { room: { lightRefs: lights2 }, table: { tableId: () => tableId }, query: { get: () => null }, renderer: null, gi: null, scene: null },
        adopt: { patch: () => true, find: () => [] }, onFrame: (fn) => hooks2.push(fn), knobs: {}, venue: 'arena', assets: null, env: null });
      // hookCalls is the part's frame counter: its 30-frame tick reads the lamp at the hook calls whose index is a multiple of
      // 30, so an event placed there proves nothing; the by-frames arms place theirs off it, and say so if a change moves them
      let hookCalls = 0;
      const hook = () => { for (const fn of hooks) fn(0, 1 / 60); hookCalls += 1; };
      const offTick = (what) => assert.notEqual(hookCalls % 30, 0, `${what} lands on the 30-frame tick: move it one frame`);
      const render = () => { scene.onBeforeRender('renderer', scene, 'camera', null); return part.uniforms.uClubClothLevel.value.toArray(); };
      // one frame as main.js runs it: the frame hooks (the club's among them), then the render
      const frame = () => { hook(); return render(); };
      // what the uniform holds for a level k: k - 1, and whether a row gave it
      const at = (k, found) => [k - 1, found ? 1 : 0, 0, 0];
      const K = 0.31, K8 = 0.4;
      // the app swaps its rect lights and its applied fixture in one synchronous step (lightingvisuals.js; its revert() too)
      const swap = (lights, fixture) => { lightRefs.rectLights = lights; app.fixture = fixture; };
      ok('level: the cloth part reads its row by key; 1 under the reference lamp, a missing row and no lamp', () => {
        assert.equal(part.enabled, true);
        assert.equal(hooks.length, 1, 'one frame hook');
        // the level table is a live copy beside the tune: state().tune keeps the look table's members (test-club-core.mjs reads it)
        assert.deepEqual(part.levels, JSON.parse(JSON.stringify(CLOTH_LEVEL)));
        assert.deepEqual(Object.keys(part.state().tune).sort(), Object.keys(CLOTH_TUNE).sort(), 'the tune holds the look\'s groups only');
        assert.deepEqual(part.uniforms.uClubClothLevel.value.toArray(), [0, 0, 0, 0], 'the look as tuned, as an unset uniform reads');
        // the arms' own rows in place of the shipped ones (those hold a ring row for the 8 ft, this arm's table without a row)
        part.levels.arena = { pool_pro_9ft: { perimeter_ring: K } };
        part.levels.club.pool_pro_9ft = { canopy_panel: 2 };
        part.set();
        assert.deepEqual(frame(), at(1, false), 'the canopy: the reference lamp has no row');
        assert.deepEqual({ ...part.state().level }, { look: 'arena', key: 'pool_pro_9ft', fixture: 'canopy_panel', k: 1, found: false, watch: { lights: true, table: true, render: true } });
        swap(ring, 'perimeter_ring');
        assert.deepEqual(frame(), at(K, true), 'the ring row');
        app.matchKey = 'pool_pro_8ft'; part.rebuild('table');
        assert.deepEqual(frame(), at(1, false), 'a table without a row');
        app.matchKey = 'pool_pro_9ft'; part.rebuild('table');
        assert.deepEqual(frame(), at(K, true));
        swap([], 'perimeter_ring');
        assert.deepEqual(frame(), at(1, false), 'no lamp: the cloth keeps the app\'s light');
        swap(canopy, 'canopy_panel'); frame();
        // the app's own handler ran at every render, after the check, with its arguments and the scene as `this`
        assert.equal(before.length, 6, 'the app\'s own onBeforeRender ran at each of the six renders');
        assert.deepEqual(before.at(-1), [scene, 'renderer', scene, 'camera', null]);
      });
      ok('level: a swap and its revert take the new level on the frame they land, never one frame late, across the 30-frame tick', () => {
        for (let i = 0; i < 31; i++) assert.deepEqual(frame(), at(1, false));
        const seen = [];
        for (let i = 0; i < 70; i++) {
          if (i === 5 || i === 47) { offTick(`the swap at frame ${i}`); swap(ring, 'perimeter_ring'); }
          if (i === 6 || i === 60) { offTick(`the revert at frame ${i}`); swap(canopy, 'canopy_panel'); } // a swap reverted on the next frame, and a later one held
          seen.push(frame()[0]);
        }
        const want = seen.map((_, i) => ((i === 5) || (i >= 47 && i < 60) ? K - 1 : 0));
        assert.deepEqual(seen, want, 'every frame at the level of the lights it draws');
        assert.equal(part.state().lamp.lights, 1, 'the lamp read again: the canopy');
      });
      ok('level: a swap that lands after the frame hook, or between two frames, is drawn at its level: the check runs ahead of every render', () => {
        hook(); swap(ring, 'perimeter_ring'); // a later frame hook swaps: the club's hook has run already
        assert.deepEqual(render(), at(K, true), 'the render after the hook');
        swap(canopy, 'canopy_panel'); // between two frames, then a cube capture: six renders and no frame hook
        for (let face = 0; face < 6; face++) assert.deepEqual(render(), at(1, false), `capture face ${face}`);
        assert.deepEqual(frame(), at(1, false));
      });
      ok('level: a table change that keeps the lamp moves the key, and the level follows at its first render, not on the 30-frame tick', () => {
        part.levels.arena.pool_pro_8ft = { perimeter_ring: K8 };
        swap(ring, 'perimeter_ring');
        assert.deepEqual(frame(), at(K, true));
        const seen = [];
        for (let i = 0; i < 70; i++) {
          // table.js rebuilds the table in one synchronous run (rebuildAfterDetach): the active id the bed-match key reads and
          // the built id move together, the rect lights stay
          if (i === 3 || i === 41) { offTick(`the table change at frame ${i}`); tableId = 'pool_pro_8ft'; app.matchKey = 'pool_pro_8ft'; }
          if (i === 4 || i === 55) { offTick(`the table change back at frame ${i}`); tableId = 'pool_pro_9ft'; app.matchKey = 'pool_pro_9ft'; }
          seen.push(frame()[0]);
        }
        const want = seen.map((_, i) => ((i === 3) || (i >= 41 && i < 55) ? K8 - 1 : K - 1));
        assert.deepEqual(seen, want, 'every frame at the level of the table it draws');
        tableId = 'pool_pro_8ft'; app.matchKey = 'pool_pro_8ft'; // and between two frames: a capture reads the new table's level
        assert.deepEqual(render(), at(K8, true));
        tableId = 'pool_pro_9ft'; app.matchKey = 'pool_pro_9ft';
        swap(canopy, 'canopy_panel'); frame();
      });
      ok('level: the frame hook\'s check alone (a room and no scene) takes a swap and its revert on the frames they land, off the tick', () => {
        hookOnly.levels.arena.pool_pro_9ft = { perimeter_ring: K };
        hookOnly.set();
        let calls = 0;
        const frame2 = () => { for (const fn of hooks2) fn(0, 1 / 60); calls += 1; return hookOnly.uniforms.uClubClothLevel.value.toArray(); };
        assert.deepEqual(frame2(), at(1, false));
        assert.deepEqual(frame2(), at(1, false));
        assert.notEqual(calls % 30, 0); lights2.rectLights = ring; app.fixture = 'perimeter_ring';
        assert.deepEqual(frame2(), at(K, true), 'the swap, at its frame hook');
        assert.notEqual(calls % 30, 0); lights2.rectLights = canopy; app.fixture = 'canopy_panel';
        assert.deepEqual(frame2(), at(1, false), 'the revert, at its frame hook');
      });
      ok('level: state().level.watch says which checks have a source (a missing room, table or scene shows here, not as late frames); render is read live', () => {
        assert.deepEqual(part.state().level.watch, { lights: true, table: true, render: true });
        assert.deepEqual(hookOnly.state().level.watch, { lights: true, table: true, render: false });
        assert.deepEqual(bare.state().level.watch, { lights: false, table: false, render: false });
        // a service that puts an older handler back without chaining: the render-time check stops, and the flag says so
        const mine = scene.onBeforeRender;
        scene.onBeforeRender = function stranger() {};
        frame(); frame();
        assert.equal(part.state().level.watch.render, false, 'the render-time check no longer runs');
        scene.onBeforeRender = mine; frame();
        assert.equal(part.state().level.watch.render, true);
      });
    } finally {
      if (hadWindow) globalThis.window = oldWindow; else delete globalThis.window;
    }
    // the shipped table against the app's own lamps (lightingvisuals.js loads three, so these arms stand behind the hook too)
    const { MATCH_GAINS, lightingProfile } = await import('../../scene/lightingvisuals.js');
    const { VENUE_DEFAULT } = await import('../lib/lighting-judge.mjs');
    const refOf = (key) => VENUE_DEFAULT[key] ?? 'canopy_panel'; // a key's reference lamp: the canopy, or its table's venue luminaire
    ok('level: the census: in both looks each lamp the app offers on a key (MATCH_GAINS) has its row, the key\'s reference lamp none, and no row names another key or lamp', () => {
      for (const look of ['arena', 'club']) {
        for (const [key, gains] of Object.entries(MATCH_GAINS)) {
          for (const fixture of Object.keys(gains)) assert.equal(levelUnderLamp(CLOTH_LEVEL, look, key, fixture).found, fixture !== refOf(key), `${look} ${key} ${fixture}`);
        }
        for (const [key, row] of Object.entries(CLOTH_LEVEL[look])) {
          for (const fixture of Object.keys(row)) assert.ok(Object.hasOwn(MATCH_GAINS, key) && Object.hasOwn(MATCH_GAINS[key], fixture), `${look} ${key} ${fixture}: no lamp the app offers there`);
        }
      }
    });
    // the band: a row's k against its two lamps' own light on the 9 ft bed: the app's emitters (lightingProfile; no table is
    // built here, so its own bed-match gain reads 1) at the key's bed-match gains, each a Lambertian rectangle over a grid on
    // the bed. The cloth does not answer two lamps alike (why k is solved from renders), so k is not that ratio, but a row
    // under the wrong key or lamp lands far from it
    const BAND = 3;
    const light = new Map();
    const lampLight = (fixture) => {
      if (light.has(fixture)) return light.get(fixture);
      const p = lightingProfile(fixture, 1);
      assert.equal(p.fixture, fixture, `the app's own emitters for ${fixture}`);
      const NX = 25, NZ = 13;
      let s = 0;
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        const at = [-BED.hx + (2 * BED.hx * (i + 0.5)) / NX, 0, -BED.hz + (2 * BED.hz * (j + 0.5)) / NZ];
        for (const e of p.emitters) s += e.intensity * rectFormFactorUp(at, { cx: e.x, cz: e.z, hx: e.w / 2, hz: e.d / 2, y: e.y });
      }
      assert.ok(Number.isFinite(s) && s > 0, `${fixture}: its light on the bed (${s})`);
      light.set(fixture, s / (NX * NZ));
      return light.get(fixture);
    };
    const model = (key, fixture) => (MATCH_GAINS[key][refOf(key)] * lampLight(refOf(key))) / (MATCH_GAINS[key][fixture] * lampLight(fixture));
    ok(`level: the band: each row's k is within ${BAND}x of its two lamps' light ratio on the bed (E_ref / E_lamp at the key's gains), and a row under the wrong key is not`, () => {
      let lo = Infinity, hi = 0;
      for (const look of ['arena', 'club']) for (const [key, row] of Object.entries(CLOTH_LEVEL[look])) for (const [fixture, k] of Object.entries(row)) {
        const r = k / model(key, fixture);
        lo = Math.min(lo, r); hi = Math.max(hi, r);
        assert.ok(r >= 1 / BAND && r <= BAND, `${look} ${key} ${fixture}: k ${k} is ${r.toFixed(2)}x its model value ${model(key, fixture).toFixed(4)}`);
      }
      // the carom table's canopy row read as the 9 ft's ring row, and the 9 ft's ring row read as the carom table's canopy row
      for (const [k, key, fixture] of [[CLOTH_LEVEL.arena.umb_carom_284.canopy_panel, 'pool_pro_9ft', 'perimeter_ring'], [CLOTH_LEVEL.arena.pool_pro_9ft.perimeter_ring, 'umb_carom_284', 'canopy_panel']]) {
        const r = k / model(key, fixture);
        assert.ok(r < 1 / BAND || r > BAND, `a row under the wrong key: k ${k} as ${key} ${fixture} reads ${r.toFixed(2)}x`);
      }
      if (STATS) console.log(`   band: k over its model value ${lo.toFixed(3)} .. ${hi.toFixed(3)}`);
    });
  }
}

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

// the number of checks this file holds: a check that did not run (a skipped block) fails the run by count
const CHECKS = 25;
if (n !== CHECKS) { console.log(`FAIL ${n} checks ran, this file holds ${CHECKS}`); process.exitCode = 1; }
console.log(process.exitCode ? `\n${n} checks passed, and the run FAILED (above)` : `\n${n} checks passed`);
