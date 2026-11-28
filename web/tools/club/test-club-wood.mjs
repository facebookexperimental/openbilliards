// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-wood.mjs — node arm for the wood part's pure logic (web/scene/club/mat/wood/): the finish decision, the rail band
// read from mesh boxes, the lamp rectangle, the lamp's lit face (pinned against the luminaire's and the app's own pattern),
// the room's light on the table body (pinned against the room's emitter law), the floor's view of the lamp past the table
// top against a brute-force ray test, the edge profile, and the shape of the shader patch (anchors, modes, uniforms, sampler
// count).
// Run: node web/tools/club/test-club-wood.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyPatchText } from '../../scene/club/patchtext.js';
import * as G from '../../scene/club/mat/wood/glsl.js';
import { finishOf, finishParams, railBand, lampRect, floorVis, edgeSlope, innerEdgeSlope, rampStats, lampRollRange, rayToSegment, SCANS, luma,
  ggxD, scanPlacement, LAMP_FACE, TUBE_WHITE, appFaceModel, faceModel, lampHasTubes, roomIrradiance, roomAmbient, bodyLight } from '../../scene/club/mat/wood/layout.js';
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const count = (s, re) => (s.match(re) ?? []).length;
const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

// ---- finish decision (the colours are the app's own per-style literals, mirrored here for the test only) ----
ok('finish: a dark neutral colour is a black table; with a map it is a stained wood', () => {
  assert.equal(finishOf(lin(0x2e2e30), true), 'black-stain');      // the default table's rail (stained oak)
  assert.equal(finishOf(lin(0x151517), true), 'black-stain');      // its apron
  assert.equal(finishOf(lin(0x1f1f21), false), 'black-laminate');  // the map-less charcoal rail
  assert.equal(finishOf(lin(0x111214), false), 'black-laminate');
  assert.equal(finishOf([0, 0, 0], false), 'black-laminate');
});
ok('finish: any other colour is wood under clear lacquer', () => {
  for (const hex of [0xbfb0a6, 0xa89388, 0x6f7a72, 0xa78070, 0xc3cbc8, 0x97837a]) assert.equal(finishOf(lin(hex), true), 'wood', hex.toString(16));
  assert.equal(finishOf([0.05, 0.012, 0.004], true), 'wood'); // dark but saturated: a dark wood, not a black table
});
ok('finish numbers: every finish has a known scan, a coat inside [0, 1], and pores only where there is wood to have them', () => {
  for (const f of ['wood', 'black-stain', 'black-laminate']) for (const k of ['rail', 'body']) {
    const p = finishParams(f, k);
    assert.ok(SCANS[p.scan], `${f}/${k} scan`);
    assert.equal(p.coat.length, 4);
    for (const v of p.coat) assert.ok(v >= 0 && v <= 1);
    assert.ok(p.coat[1] >= 0.05, 'the LTC fit is not used below roughness 0.05');
    assert.equal(p.haze.length, 4);
    assert.equal(p.brush.length, 3);
    assert.ok(p.haze[0] > p.coat[1] && p.haze[0] <= 0.6, 'the haze is the wider lobe');
    assert.ok(p.haze[1] >= 0 && p.haze[1] + p.brush[0] <= 0.6, 'the narrow lobe keeps at least 40 % of the coat');
    assert.ok(p.brush[1] > 0 && p.brush[2] > p.brush[1], 'the scratch fan is narrow along the grain and wide across it');
    assert.ok(p.matte >= 0 && p.matte <= 0.06, 'the matte pedestal is a few per cent at most');
    assert.ok(p.contrast >= 0 && p.contrast <= 1 && p.chroma >= 0 && p.chroma <= 1 && p.scale > 0);
    assert.equal(p.pore.length, 4);
    for (const v of p.pore) assert.ok(v >= 0 && v <= 1);
    if (k === 'body' || f === 'black-laminate') assert.deepEqual(p.pore, [0, 0, 0, 0], `${f}/${k}: no open pores`);
  }
  // round 3: a rail cap is lacquered. Its narrow lobe is glossy enough for the reflection service's cube to be an image in it
  // (three's cube-UV level for a roughness r is -2 log2(1.16 r): a face of 2^level pixels; the lit shelves are 13 degrees
  // high from a rail, so they need a face of at least 64 pixels, level 6, to be more than two texels)
  for (const f of ['wood', 'black-stain', 'black-laminate']) {
    const p = finishParams(f, 'rail');
    assert.ok(-2 * Math.log2(1.16 * p.coat[1]) >= 6.5, `${f}: the room is an image in the rail's coat`);
    assert.ok(p.haze[1] + p.brush[0] <= 0.3, `${f}: three quarters of the coat is the narrow lobe`);
  }
  assert.ok(finishParams('black-stain', 'rail').pore[1] > 0 && finishParams('wood', 'rail').pore[1] > 0, 'wood under a coat has open pores');
  assert.equal(finishParams('black-laminate', 'rail').contrast, 0, 'a laminate shows no grain');
  assert.ok(finishParams('black-stain', 'rail').chroma <= 0.2, 'a black stain keeps little of the wood\'s hue');
  for (const s of Object.values(SCANS)) { assert.ok(luma(s.mean) > 0.01); assert.ok(s.metres[0] >= 1 && s.metres[1] >= 1); }
});

ok('two lobes: why a coat needs them (the numbers the finish comment argues with)', () => {
  const deg = Math.PI / 180;
  const one = ggxD(0.16 ** 2, 20 * deg), wide = ggxD(0.42 ** 2, 20 * deg);
  assert.ok(Math.abs(one - 0.0151) < 2e-4 && Math.abs(wide - 0.4747) < 2e-3, `${one} ${wide}`);
  assert.ok(wide / one > 30 && wide / one < 33);                       // 31 times more light 20 degrees off the mirror normal
  assert.ok(ggxD(0.16 ** 2, 0) / one > 30000);                         // round 1b's single lobe: 1 / 32000 of its peak there
  // the narrow lobe still resolves the lamp's tubes: its half-maximum half-angle (alpha x 0.64, doubled on reflection) is
  // under the tubes' spacing seen from a rail (0.167 m at 1.2 m = 8 degrees); the haze's is far over it
  const half = (r) => 2 * Math.atan(r * r * Math.sqrt(Math.SQRT2 - 1)) / deg;
  assert.ok(half(finishParams('black-stain', 'rail').coat[1]) < 2.5 && half(finishParams('black-stain', 'rail').haze[0]) > 10);
  assert.ok(finishParams('black-stain', 'rail').haze[1] >= finishParams('wood', 'rail').haze[1], 'a rubbed black has no less haze than a clear lacquer');
});
ok('scan strips: a rail reads a 0.3 m band of the veneer, and the band holds a cap, its inner strip and its outer face', () => {
  const v = scanPlacement(SCANS['veneer.color'], 1, true);
  assert.deepEqual(v.metres, [2.43 / 8, 2.43]);
  assert.deepEqual(v.perRail, [0, 0.61]);                               // rails differ along the grain only
  // across the grain: -0.012 m (the inner strip beside the cap) to 0.127 + 0.06 m (the cap and its outer face), plus the margin
  const u0 = -0.012 / v.metres[0] + v.margin[0], u1 = 0.187 / v.metres[0] + v.margin[0];
  assert.ok(u0 > 0.02 && u1 < 0.98, `${u0} .. ${u1}`);
  const whole = scanPlacement(SCANS['wood_dark.color'], 0.6, true);     // a scan without a strip stays whole
  assert.deepEqual(whole.metres, [1.2, 1.2]);
  assert.deepEqual(whole.perRail, [0.37, 0.61]);
  assert.deepEqual(scanPlacement(SCANS['veneer.color'], 1, false).metres, [2.43, 2.43]);
  // GPU bytes with mips: the strip against the whole scan (2048 px colour, 1024 px relief)
  const bytes = (w, h) => w * h * 4 * 4 / 3;
  const before = bytes(2048, 2048) + bytes(1024, 1024), after = bytes(2048 / 8, 2048) + bytes(1024 / 8, 1024);
  assert.ok(Math.round(before / 1e5) / 10 === 28 && after < 3.6e6, `${before} -> ${after}`);
});

// ---- the lamp's lit face ----
const lin8 = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
ok('lamp face (app): the tube layout is the app\'s own pattern (scene/room.js pinned)', () => {
  const F = LAMP_FACE;
  const src = read('../../scene/room.js');
  assert.ok(src.includes(`for (const cy of [${F.tubes.join(', ')}])`), 'tube rows');
  assert.ok(src.includes(`cv.width = ${F.size[0]}; cv.height = ${F.size[1]};`), 'canvas size');
  assert.ok(src.includes(`cy - ${F.tubeHeight / 2}, 0, cy + ${F.tubeHeight / 2}`), 'tube height');
  assert.ok(src.includes(`addColorStop(${F.ramp}, 'rgba(${F.core.join(',')},${F.alpha})')`) && src.includes(`addColorStop(${1 - F.ramp}, 'rgba(${F.core.join(',')},${F.alpha})')`), 'ramp');
  assert.ok(src.includes(`'rgba(${F.edge.join(',')},0.0)'`), 'edge colour');
  assert.ok(src.includes(`fillRect(${F.ends[0]}, cy - ${F.tubeHeight / 2}, ${F.ends[1] - F.ends[0]}, ${F.tubeHeight})`), 'tube ends');
  assert.ok(src.includes(`fillRect(10, ${F.panelRows[0]}, 492, ${F.panelRows[1] - F.panelRows[0]})`) && src.includes('#3a3426'), 'diffuser panel');
  assert.deepEqual(F.panel, [0x3a, 0x34, 0x26]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(TUBE_WHITE[i] - lin8(F.core[i])) < 5e-4);
  assert.equal(lampHasTubes([{ w: 2.05, d: 0.66 }]), true);
  assert.equal(lampHasTubes([{ w: 2.05, d: 0.3 }]), false);
  assert.equal(lampHasTubes([{ w: 0.3, d: 0.3 }, { w: 0.3, d: 0.3 }, { w: 0.3, d: 0.3 }]), false);
  assert.equal(lampHasTubes([]), false);
});
ok('lamp face (app): one panel, three strips over a dim diffuser, and the model keeps the pattern\'s mean', () => {
  const k = appFaceModel();
  assert.equal(k.tubes, 3); assert.equal(k.panels, 1);
  assert.ok(Math.abs(k.tubeOffset - 86 / 170) < 1e-9);                  // the outer strips' axes, as a share of the half depth
  assert.ok(k.tubeHalf > 0.12 && k.tubeHalf < 0.17, `strip half width ${k.tubeHalf}`);
  assert.ok(k.tubeOffset - 2 * k.tubeHalf > 0.15, 'a dark gap is left between two strips');
  assert.ok(Math.abs(k.tubeLen - 242 / 256) < 1e-9 && k.padLen === k.tubeLen);
  assert.ok(luma(k.tube) > 0.8 && luma(k.panel) < 0.2 * luma(k.tube), 'the face between the strips is under a fifth of a strip');
  // the model's mean across the lamp (panel level + three strip rectangles) against the mean of the pattern itself, row by row
  const F = LAMP_FACE, mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  let sum = 0;
  for (let y = 0; y < F.size[1]; y++) {
    let c = F.panel;
    for (const cy of F.tubes) { const t = (y + 0.5 - (cy - 24)) / 48; if (t > 0 && t < 1) { const kk = t < 0.35 ? t / 0.35 : t > 0.65 ? (1 - t) / 0.35 : 1; c = mix(c, mix(F.edge, F.core, kk), 0.95 * kk); } }
    sum += luma(c.map(lin8));
  }
  const rows = sum / F.size[1];
  const model = luma(k.panel) + (luma(k.tube) - luma(k.panel)) * 3 * k.tubeHalf;
  assert.ok(Math.abs(model / rows - 1) < 0.08, `model ${model} rows ${rows}`);
});
// the club luminaire's own data (owned by the lamp role): present from round 2 on; the part reads it at run time through the
// built lamp, this arm reads the module
let lampFaceMod = null;
try { lampFaceMod = await import('../../scene/club/room/lamp/face.js'); } catch { lampFaceMod = null; }
ok('lamp face (club): the luminaire\'s published face gives lit pads between cross bars and strips inside them', () => {
  assert.ok(typeof lampFaceMod?.lampFace === 'function', 'club/room/lamp/face.js exports lampFace (the wood part mirrors it)');
  const f = lampFaceMod.lampFace([{ x: 0, y: 1.02, z: 0, w: 2.05, d: 0.66 }]);
  assert.equal(f.faces.length, 1);
  const k = faceModel(f.faces[0]);
  assert.ok(k, 'the canopy\'s face is a rectangle with panels');
  assert.equal(k.along, 'x');
  assert.ok(k.panels >= 2 && k.panels <= 6, `${k.panels} panels`);
  // pads tile the lamp with a dark gap between them (the cross bar and the strips' dim ends), wide enough to survive the narrow lobe
  const gap = (k.pitch - 2 * k.padLen) * 1.025;
  assert.ok(gap > 0.04 && gap < 0.2, `gap between two lit pads ${gap} m`);
  assert.ok(Math.abs((k.panels - 1) * k.pitch / 2 + k.padLen - 1) < 0.08, 'the outer pads end near the rectangle\'s ends');
  assert.ok(k.padAcross > 0.9 && k.padAcross <= 1);
  assert.ok(k.tubes === 3 || k.tubes === 1);
  assert.ok(luma(k.tube) > luma(k.panel) && luma(k.panel) > 0.05, 'strips over a glowing panel');
  assert.ok(k.tubes * k.tubeHalf < 1 && k.tubeOffset + k.tubeHalf <= 1.001);
  for (let i = 0; i < 3; i++) assert.ok(k.mean[i] > 0 && k.mean[i] < k.tube[i]);
  // the built lamp hands the same data out, and its cut-off law is where the part reads it
  const lamp = read('../../scene/club/room/lamp.js');
  assert.ok(/face\(\) \{\s*(?:return|const f =) lampFace\(readEmitters\(\)\);/.test(lamp), 'the built lamp\'s face()'); // the lamp's getter may add live values (law, color) to the same data
  // (the law's three numbers [low, c0, c1]; since round 3 the lamp also has a display peak for cameras, which the lacquer does not take)
  assert.ok(/law: (?:uLaw\.value\.toArray\(\)|\[uLaw\.value\.x, uLaw\.value\.y, uLaw\.value\.z\])/.test(lamp), 'state().face.law');
  assert.ok(lamp.includes("mesh.name = `clubLamp.${k}`"), 'the face mesh is found by its name clubLamp.face');
  assert.ok(/diffuseColor\.rgb \*= mix\( uClubLampLaw\.x, (?:1\.0|uClubLampLaw\.w), smoothstep\( uClubLampLaw\.y, uClubLampLaw\.z, lampC \) \);/.test(lamp), 'the cut-off law');
  // the law is the picture a CAMERA is shown; by default the coat's image of the lamp takes none of it (wood.js CUT_SHARE)
  const share = Number(read('../../scene/club/mat/wood.js').match(/const CUT_SHARE = ([\d.]+);/)?.[1]);
  assert.ok(share >= 0 && share <= 1, 'CUT_SHARE');
  assert.ok(G.WOOD_FN.includes('uClubWoodLampC.w );'), 'the share is the mix weight of the law in the coat');
  // the LEVEL of the face in the coat is the light's own radiance (the face mesh's colour is a display value, 2.7 times
  // the light's on the default rig); the pattern is the lamp's. With the default numbers the factor is about 0.6
  const wjs = read('../../scene/club/mat/wood.js');
  assert.ok(wjs.includes('faceLevel = faceGain * (1 + (meanFace > 1e-6 ? lum(lamp.radiance) / meanFace - 1 : 0) * faceNorm);'));
  assert.ok(/const FACE_NORM = [01], FACE_GAIN = [\d.]+;/.test(wjs));
  const meanFace = luma([19.691 * k.mean[0], 20.858 * k.mean[1], 25.127 * k.mean[2]]);
  assert.ok(luma([7.188, 7.255, 7.389]) / meanFace > 0.5 && luma([7.188, 7.255, 7.389]) / meanFace < 0.7, `level ${luma([7.188, 7.255, 7.389]) / meanFace}`);
  assert.ok(G.WOOD_FN.includes('mix( uClubWoodLampC.x, 1.0, smoothstep( uClubWoodLampC.y, uClubWoodLampC.z, abs( c ) ) )'));
  assert.ok(read('../../scene/club/room.js').includes('parts: { get props() { return props.api; }, get lamp() { return lamp.api; } },'), 'club.room.parts.lamp');
  // a face that is not a rectangle with panels gives no model (the light's own rectangle is used)
  assert.equal(faceModel(null), null);
  assert.equal(faceModel({ shape: 'disc', panels: [{ centre: [0, 0], radius: 0.2 }] }), null);
  assert.equal(faceModel({ ...f.faces[0], panelSize: [NaN, 0.6] }), null);
});

// ---- the room's light on the table body ----
ok('room light: the mirror follows the room\'s emitter law (the law\'s lines are pinned in room/light.js)', () => {
  const src = read('../../scene/club/room/light.js');
  for (const line of [
    'uniform vec4 uRoomEmP[ ROOM_EMITTERS ];   // xyz position (world), w window radius',
    'uniform vec4 uRoomEmC[ ROOM_EMITTERS ];   // rgb colour x intensity (x area for rect), w type 0 point | 1 rect | 2 tube',
    'float soft = eN.w * eN.w; // near-field cap (m^2)',
    'float a = clamp( dot( rel, eA.xyz ), - eA.w, eA.w );', 'soft = eA.w * distance( vRoomWP, q ) + eN.w * eN.w;',
    'vec3 eV = cross( eN.xyz, eA.xyz );', 'q += ( eA.xyz * a + eV * b ) * 0.6;', 'soft = 4.0 * eN.w * eA.w * RECIPROCAL_PI;',
    'float w = d2 / ( eP.w * eP.w );', 'w = 1.0 - w * w; w *= w;', 'if ( dot( eN.xyz, eN.xyz ) > 0.25 ) {', 'emit = dot( eN.xyz, - Lw );',
    'if ( eC.w < 0.5 ) emit = smoothstep( 0.0, 0.35, emit );', 'emit *= ( 1.0 - eA.w ) + eA.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );',
    'roomLight.color = eC.rgb * ( emit * w / ( d2 + soft ) );',
    'irradiance += ( mix( uRoomAmbGround, uRoomAmbSky, 0.5 + 0.5 * roomN.y ) + uRoomAmbSide * ( 1.0 - roomN.y * roomN.y ) ) * roomAO * roomAmb;',
    'get uniforms() { return ensure(); }',
  ]) assert.ok(src.includes(line), `room/light.js no longer has: ${line}`);
  assert.ok(read('../../scene/club/room.js').includes('layout: shell.layout, light: roomLight,'), 'club.room.light is how the part reaches the service');
});
ok('room light: point, rectangle and tube against hand numbers; the bar side of a table is brighter and warmer', () => {
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
  // an omni point, 2 cd, 2 m straight ahead, window 10 m, source radius 0.05: E = I w / (d^2 + r^2)
  const pt = [{ P: [0, 0, 2, 10], C: [2, 1, 0.5, 0], N: [0, 0, 0, 0.05], A: [0, 1, 0, 0] }];
  const w = (1 - (4 / 100) ** 2) ** 2;
  let e = roomIrradiance(pt, [0, 0, 0], [0, 0, 1]);
  assert.ok(near(e[0], 2 * w / (4 + 0.0025)) && near(e[1], e[0] / 2) && near(e[2], e[0] / 4));
  assert.deepEqual(roomIrradiance(pt, [0, 0, 0], [0, 0, -1]), [0, 0, 0]);          // behind the face
  assert.deepEqual(roomIrradiance([{ ...pt[0], P: [0, 0, 2, 1.9] }], [0, 0, 0], [0, 0, 1]), [0, 0, 0]);   // outside its window
  e = roomIrradiance(pt, [0, 0, 0], [0, Math.SQRT1_2, Math.SQRT1_2]);
  assert.ok(near(e[0], 2 * w / 4.0025 * Math.SQRT1_2, 1e-12));                     // Lambert
  // a one-sided rectangle 1.44 x 1.15 m facing -x (a lit shelf), 3.6 m away on its axis: colour is radiance x area
  const area = 1.44 * 1.15;
  const rect = [{ P: [3.6, 0, 0, 8], C: [1.2 * area, 0.9 * area, 0.6 * area, 1], N: [-1, 0, 0, 0.72], A: [0, 0, 1, 0.575] }];
  e = roomIrradiance(rect, [0, 0, 0], [1, 0, 0]);
  const wr = (1 - (12.96 / 64) ** 2) ** 2;
  assert.ok(near(e[0], 1.2 * area * wr / (12.96 + 4 * 0.72 * 0.575 / Math.PI), 1e-12));
  assert.deepEqual(roomIrradiance(rect, [7, 0, 0], [-1, 0, 0]), [0, 0, 0]);        // behind the shelf
  // a tube: the nearest point of the segment is the source, and the near field falls as 1 / d
  const tube = [{ P: [0, 1, 0, 6], C: [1, 1, 1, 2], N: [0, 0, 0, 0.02], A: [1, 0, 0, 2] }];
  e = roomIrradiance(tube, [1.5, 0, 0], [0, 1, 0]);
  assert.ok(near(e[0], (1 - (1 / 36) ** 2) ** 2 / (1 + 2 * 1 + 0.0004), 1e-12));
  // ambient: sky up, ground down, their mean plus side on a wall
  const amb = { sky: [0.4, 0.3, 0.2], ground: [0.2, 0.2, 0.2], side: [0.1, 0.1, 0.1] };
  assert.deepEqual(roomAmbient(amb, [0, 1, 0]), [0.4, 0.3, 0.2]);
  assert.deepEqual(roomAmbient(amb, [0, -1, 0]), [0.2, 0.2, 0.2]);
  assert.ok(near(roomAmbient(amb, [1, 0, 0])[0], 0.4, 1e-12) && near(roomAmbient(amb, [1, 0, 0])[1], 0.35, 1e-12));
  // a table with a warm bar on +x and nothing else: +x is the lit face, the floor on that side is lit, the underside is dim
  const T = { centre: [0, 0], outer: [1.45, 0.81], top: 0.045, floorY: -0.79 };
  const bar = [-1.44, 0, 1.44].map((z) => ({ P: [5.03, 0.77, z, 8], C: [1.99, 1.51, 0.95, 1], N: [-1, 0, 0, 0.72], A: [0, 0, 1, 0.575] }));
  const b = bodyLight(bar, amb, T);
  assert.equal(b.faces.length, 6); assert.equal(b.floor.length, 4);
  assert.ok(b.faces[0][0] > b.faces[1][0] + 0.25, `bar side ${b.faces[0]} against wall side ${b.faces[1]}`);
  assert.ok(b.faces[0][0] / b.faces[0][2] > b.faces[1][0] / b.faces[1][2], 'and warmer');
  assert.ok(near(b.faces[1][0], 0.4, 1e-9), 'the far side has the ambient only');
  assert.ok(b.floor[0][0] > b.floor[1][0] && b.floor[2][0] > b.floor[1][0]);
  assert.ok(near(b.faces[3][0], 0.2 * 0.35, 1e-12), 'the underside sees the floor in the table\'s shadow');
});

// ---- rail band ----
const box = (x0, x1, z0, z1, y0 = 0.006, y1 = 0.047) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
ok('rail band: six caps and four corner blocks (long rails split at the side pockets)', () => {
  const X0 = 1.3208, X1 = 1.4475, Z0 = 0.6858, Z1 = 0.8075, cut = 0.07;
  const boxes = [
    box(-1.2, -cut, Z0, Z1), box(cut, 1.2, Z0, Z1), box(-1.2, -cut, -Z1, -Z0), box(cut, 1.2, -Z1, -Z0),   // long halves
    box(X0, X1, -0.56, 0.56), box(-X1, -X0, -0.56, 0.56),                                                // end rails
    box(1.2, X1, 0.56, Z1), box(1.2, X1, -Z1, -0.56), box(-X1, -1.2, 0.56, Z1), box(-X1, -1.2, -Z1, -0.56), // corner blocks
    box(-1.3, 1.3, 0.7, 0.75, -0.03, 0.0),                                                                // a beam under the caps
    // narrow sub-rails of the same wood beside the caps, 0.3 mm under the cap top (the default table has six of them)
    box(-1.2, -cut, 0.6742, Z0, 0, 0.0467), box(cut, 1.2, 0.6742, Z0, 0, 0.0467), box(-1.2, -cut, -Z0, -0.6742, 0, 0.0467), box(cut, 1.2, -Z0, -0.6742, 0, 0.0467),
    box(1.3092, X0, -0.56, 0.56, 0, 0.0467), box(-X0, -1.3092, -0.56, 0.56, 0, 0.0467),
  ];
  const b = railBand(boxes);
  assert.equal(b.pieces, 16);
  assert.ok(Math.abs(b.centre[0]) < 1e-9 && Math.abs(b.centre[1]) < 1e-9);
  assert.ok(Math.abs(b.outer[0] - X1) < 1e-9 && Math.abs(b.outer[1] - Z1) < 1e-9);
  assert.ok(Math.abs(b.inner[0] - X0) < 1e-9 && Math.abs(b.inner[1] - Z0) < 1e-9);
  assert.ok(Math.abs(b.top - 0.047) < 1e-12);
  assert.deepEqual(b.measured, [true, true]);
});
ok('rail band: four mitred planks, off-centre table', () => {
  const dx = 0.4, dz = -0.2;
  const boxes = [box(-1.465 + dx, 1.465 + dx, 0.686 + dz, 0.831 + dz), box(-1.465 + dx, 1.465 + dx, -0.831 + dz, -0.686 + dz),
    box(1.32 + dx, 1.465 + dx, -0.831 + dz, 0.831 + dz), box(-1.465 + dx, -1.32 + dx, -0.831 + dz, 0.831 + dz)];
  const b = railBand(boxes);
  assert.ok(Math.abs(b.centre[0] - dx) < 1e-9 && Math.abs(b.centre[1] - dz) < 1e-9);
  assert.ok(Math.abs(b.inner[1] - 0.686) < 1e-9, 'long planks give the inner half z');
  assert.ok(Math.abs(b.inner[0] - 1.32) < 1e-9, 'end planks give the inner half x');
});
ok('rail band: one merged mesh falls back to a band of the given width; no mesh gives null', () => {
  const b = railBand([box(-1.45, 1.45, -0.81, 0.81)], { fallbackWidth: 0.12 });
  assert.deepEqual(b.measured, [false, false]);
  assert.ok(Math.abs(b.inner[0] - 1.33) < 1e-9 && Math.abs(b.inner[1] - 0.69) < 1e-9);
  assert.equal(railBand([]), null);
  assert.equal(railBand(null), null);
});

// ---- lamp rectangle ----
ok('lamp: one rectangle, three tubes, and what is left out', () => {
  const one = lampRect([{ pos: [0, 1.02, 0], ex: [1.025, 0, 0], ey: [0, 0, 0.33], radiance: [7.6, 7.2, 6.5], down: true }]);
  assert.ok(Math.abs(one.half[0] - 1.025) < 1e-9 && Math.abs(one.half[1] - 0.33) < 1e-9 && Math.abs(one.area - 2.05 * 0.66) < 1e-9);
  assert.deepEqual(one.radiance, [7.6, 7.2, 6.5]);
  const tubes = [-0.7, 0, 0.7].map((x) => ({ pos: [x, 0.95, 0], ex: [0.25, 0, 0], ey: [0, 0, 0.1], radiance: [10, 10, 10], down: true }));
  const three = lampRect([...tubes,
    { pos: [3, 2, 0], ex: [0.2, 0, 0], ey: [0, 0.2, 0], radiance: [5, 5, 5], down: false },      // a wall light
    { pos: [0, -0.5, 0], ex: [0.2, 0, 0], ey: [0, 0, 0.2], radiance: [5, 5, 5], down: true },    // under the table
    { pos: [0, 1, 0], ex: [0.2, 0, 0], ey: [0, 0, 0.2], radiance: [0, 0, 0], down: true },       // dark
  ], { minY: 0.3 });
  assert.equal(three.count, 3);
  assert.ok(Math.abs(three.half[0] - 0.95) < 1e-9 && Math.abs(three.half[1] - 0.1) < 1e-9 && Math.abs(three.centre[1] - 0.95) < 1e-9);
  assert.ok(Math.abs(three.area - 3 * 0.5 * 0.2) < 1e-9);
  assert.equal(lampRect([]), null);
});

// ---- the floor's view of the lamp past the table top: closed form against rays ----
ok('floor visibility: the closed form equals a brute-force ray count', () => {
  const T = { centre: [0.1, -0.05], outer: [1.4475, 0.8075], top: 0.045, floorY: -0.79, lamp: { centre: [0.1, 1.02, -0.05], half: [1.025, 0.33] } };
  const brute = (qp) => {
    let free = 0; const NX = 160, NZ = 80;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const lx = T.lamp.centre[0] + T.lamp.half[0] * (2 * (i + 0.5) / NX - 1), lz = T.lamp.centre[2] + T.lamp.half[1] * (2 * (j + 0.5) / NZ - 1);
      const t = (T.top - T.floorY) / (T.lamp.centre[1] - T.floorY); // where the ray crosses the table-top plane
      const x = qp[0] + (lx - qp[0]) * t, z = qp[1] + (lz - qp[1]) * t;
      if (!(Math.abs(x - T.centre[0]) < T.outer[0] && Math.abs(z - T.centre[1]) < T.outer[1])) free += 1;
    }
    return free / (NX * NZ);
  };
  let worst = 0;
  for (const qp of [[0.1, -0.05], [0.1, 0.9], [0.1, 1.2], [0.1, 1.5], [0.1, 1.9], [0.1, 2.5], [1.8, -0.05], [2.4, -0.05], [3.2, 0.5], [1.7, 1.3], [2.2, 1.6], [-2.0, -1.4], [0.6, -1.45]]) {
    const a = floorVis(qp, T), b = brute(qp);
    worst = Math.max(worst, Math.abs(a - b));
  }
  assert.ok(worst < 0.012, `worst error ${worst}`);
  assert.equal(floorVis([0.1, -0.05], T), 0, 'under the table the lamp is hidden');
  assert.equal(floorVis([0.1, 2.6], T), 1, 'far from the table the whole lamp is seen');
  const mid = floorVis([0.1, 1.5], T);
  assert.ok(mid > 0.2 && mid < 0.8, 'a penumbra beside the table');
});
ok('floor visibility in the shader is the same closed form', () => {
  const fn = G.WOOD_FN;
  assert.ok(fn.includes('float clubWoodFloorVis( vec2 q )'));
  assert.ok(fn.includes('( uClubWoodLampP.y - uClubWoodTop.w ) / max( uClubWoodTop.x - uClubWoodTop.w, 1e-3 )'));
  assert.ok(fn.includes('return 1.0 - ov.x * ov.y;'));
});

// ---- the cue in the coat: closest approach of the reflected ray to the cue's axis, against a sampled ray ----
ok('cue reflection: the closed-form closest approach equals a sampled one', () => {
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const len = (a) => Math.hypot(...a);
  let worst = 0, n = 0;
  for (let i = 0; i < 1500; i++) {
    const A = [rnd() * 2 - 1, 0.05 + rnd() * 0.1, rnd() * 2 - 1], B = [A[0] + rnd() * 1.4 - 0.7, A[1] + rnd() * 0.2, A[2] + rnd() * 1.4 - 0.7];
    const P = [rnd() * 2 - 1, 0.045, rnd() * 2 - 1];
    let d = [rnd() * 2 - 1, rnd() * 0.9 + 0.05, rnd() * 2 - 1];
    const l = len(d); d = d.map((v) => v / l);
    const f = rayToSegment(P, d, A, B);
    if (!f) continue;
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], abab = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    let best = Infinity;
    for (let k = 0; k <= 4000; k++) {
      const x = [P[0] + d[0] * k * 0.001, P[1] + d[1] * k * 0.001, P[2] + d[2] * k * 0.001];
      const s = Math.min(1, Math.max(0, ((x[0] - A[0]) * ab[0] + (x[1] - A[1]) * ab[1] + (x[2] - A[2]) * ab[2]) / abab));
      best = Math.min(best, len([x[0] - A[0] - ab[0] * s, x[1] - A[1] - ab[1] * s, x[2] - A[2] - ab[2] * s]));
    }
    worst = Math.max(worst, Math.abs(f.dist - best)); n += 1;
  }
  assert.ok(n > 500 && worst < 2e-4, `n ${n}, worst ${worst}`);
  assert.equal(rayToSegment([0, 0, 0], [0, 1, 0], [0, -1, -1], [0, -1, 1]), null, 'a cue behind the ray is not seen');
  assert.ok(G.WOOD_FN.includes('float s = den > 1e-8 ? clamp( ( dot( ao, ab ) - dot( ao, d ) * abd ) / den, 0.0, 1.0 ) : 0.0;'));
});

// ---- edge profile ----
ok('edge profile: flat at the radius, 45 degrees at the edge, monotone; the two faces meet', () => {
  const r = 0.009;
  assert.equal(edgeSlope(r, r), 0);
  assert.equal(edgeSlope(2 * r, r), 0);
  assert.equal(edgeSlope(0, r), 1);            // slope 1 = 45 degrees: the top face and the outer face use the same profile, so they meet
  let prev = 2;
  for (let d = 0; d <= r; d += r / 50) { const s = edgeSlope(d, r); assert.ok(s <= prev + 1e-12); prev = s; }
});
ok('inner edge: the far rails mirror the lamp only on a lean of 40 to 62 degrees, and the shipped edge rolls past it', () => {
  // the fixed review views (camera positions) against the default table's inner edges and the tournament lamp
  const lamp = { centre: [0, 1.02, 0], half: [1.025, 0.33] };
  const cams = { V1: [-2.3, 1.05, 1.35], V2: [-1.35, 0.32, 0.22], V4: [0.85, 0.28, 0.25], V5: [0.25, 0.22, 0.25], V9: [-4.0, 1.6, 2.6] };
  let lo = 90, hi = 0, flat = 0, n = 0;
  for (const cam of Object.values(cams)) for (const x of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]) {
    const r = lampRollRange([x, 0.0447, -0.6858], [0, 0, 1], cam, lamp);   // the long rail across the table from every one of these cameras
    if (!r) continue;
    n += 1; lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]);
    if (r[0] < 39) flat += 1;
  }
  assert.ok(n >= 15, `${n} edge points mirror the lamp`);
  assert.equal(flat, 0);                        // never on a lean under 39 degrees: a 45-degree chamfer-like ease misses most of it
  assert.ok(lo >= 40 && hi <= 62, `lean ${lo}..${hi}`);
  const js = fs.readFileSync(fileURLToPath(new URL('../../scene/club/mat/wood.js', import.meta.url)), 'utf8');
  const gain = Number(js.match(/const EDGE_INNER_SLOPE = ([\d.]+);/)?.[1]);
  assert.ok(Math.atan(gain) * 180 / Math.PI > hi, `the edge rolls to ${(Math.atan(gain) * 180 / Math.PI).toFixed(1)} degrees`);
  assert.equal(innerEdgeSlope(0, 0.006, gain), gain);
  assert.equal(innerEdgeSlope(0.006, 0.006, gain), 0);
  assert.ok(Math.abs(innerEdgeSlope(0.003, 0.006, gain) - gain / 2) < 1e-12);
});

ok('edge filter: the profile\'s mean and variance over a pixel equal a brute-force average, and the shader uses the same form', () => {
  const brute = (d, w, r, p) => {
    const a = Math.max(d - w / 2, 0), b = Math.max(d + w / 2, a + 1e-5), N = 4000;
    let m1 = 0, m2 = 0;
    for (let i = 0; i < N; i++) { const x = a + (b - a) * (i + 0.5) / N; const u = Math.min(1, Math.max(0, 1 - x / r)) ** p; m1 += u; m2 += u * u; }
    m1 /= N; m2 /= N;
    return [m1, Math.max(m2 - m1 * m1, 0)];
  };
  let worst = 0;
  for (const p of [1, 2]) for (const r of [0.006, 0.009]) for (const w of [1e-4, 0.002, 0.006, 0.02, 0.08]) for (const d of [0, 0.001, 0.004, 0.006, 0.009, 0.03]) {
    const a = rampStats(d, w, r, p), b = brute(d, w, r, p);
    worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  }
  assert.ok(worst < 2e-4, `worst error ${worst}`);
  // a pixel much smaller than the roll: the point value, no variance (round 2's profile)
  // (the window is never thinner than 10 micrometres)
  assert.ok(Math.abs(rampStats(0.003, 0, 0.006, 1)[0] - innerEdgeSlope(0.003, 0.006, 1)) < 2e-3 && rampStats(0.003, 0, 0.006, 1)[1] < 1e-6);
  assert.ok(Math.abs(rampStats(0.0045, 0, 0.009, 2)[0] - edgeSlope(0.0045, 0.009)) < 2e-3);
  // a pixel ten times wider than the roll: a small steady lean (the roll's share of the pixel) and a large variance,
  // whether the pixel's centre lies on the roll or beside it
  const on = rampStats(0.002, 0.06, 0.006, 1), beside = rampStats(0.02, 0.06, 0.006, 1);
  assert.ok(on[0] > 0.05 && on[0] < 0.15 && beside[0] > 0.04 && beside[0] < 0.1, `${on[0]} ${beside[0]}`);
  assert.ok(on[1] > 0.02 && beside[1] > 0.02);
  const fn = G.WOOD_FN;
  assert.ok(fn.includes('return r / ( p + 1.0 ) * ( 1.0 - pow( t, p + 1.0 ) );'));
  assert.ok(fn.includes('float a = max( d - 0.5 * w, 0.0 ), b = max( d + 0.5 * w, a + 1e-5 );'));
  assert.ok(fn.includes('return vec2( m1, max( m2 - m1 * m1, 0.0 ) );'));
  // the lobes are widened by the profile's variance; screen derivatives of the NORMAL are read in the tool arm only
  assert.ok(fn.includes('float k = min( clubWoodVar, 0.35 ) * min( uClubWoodSw2.w, 1.0 );'));
  assert.equal(count(fn + G.WOOD_NORMAL + G.WOOD_ROUGHNESS + G.WOOD_COAT, /dFd[xy]\( n \)/g), 2);
  assert.equal(count(G.WOOD_NORMAL, /clubWoodRamp\(/g), 3);
  // a bent normal is kept 5 degrees inside the horizon of the eye (coat and base alike)
  assert.equal(count(G.WOOD_NORMAL, /\* max\( 0\.09 - dot\( cw[CB]v, cwEye \), 0\.0 \) \);/g), 2);
  assert.ok(Math.asin(0.09) * 180 / Math.PI > 5 && Math.asin(0.09) * 180 / Math.PI < 5.5);
});

// ---- patch shape ----
// A stand-in for a compiled standard material: the anchors in three's order. `rail` adds the app's shadow-rail line.
const fragment = (rail) => `#include <common>
#include <envmap_physical_pars_fragment>
#include <lights_physical_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <map_fragment>
	#include <roughnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
${rail ? '{\n  float spikeShadow = 1.0;\n  reflectedLight.directDiffuse *= spikeShadow;\n  reflectedLight.directSpecular *= spikeShadow;\n}\n' : ''}	#include <opaque_fragment>
}`;
const vertex = '#include <common>\nvoid main() {\n\t#include <begin_vertex>\n\t#include <project_vertex>\n\t#include <fog_vertex>\n}';
const balanced = (s) => { let d = 0; for (const c of s) { if (c === '{') d += 1; else if (c === '}') { d -= 1; if (d < 0) return false; } } return d === 0; };

ok('patch: every anchor is a before / after splice, and every piece is brace-balanced', () => {
  for (const kind of ['wood', 'sight']) for (const rail of [true, false]) for (const map of [true, false]) {
    const p = G.woodPatchParts(kind, fragment(rail), { map });
    assert.equal(p.variant, rail ? 'rail' : 'plain');
    for (const a of p.apply) {
      assert.ok(a.mode === 'before' || a.mode === 'after', `${kind}: mode ${a.mode}`);
      assert.ok(balanced(a.code), `${kind}: unbalanced code at ${a.anchor}`);
      assert.ok(count(a.code, /#if/g) === count(a.code, /#endif/g), `${kind}: #if / #endif at ${a.anchor}`);
    }
    assert.ok(count(p.pars, /#if/g) === count(p.pars, /#endif/g));
    const r = applyPatchText(vertex, fragment(rail), p);
    assert.ok(r.ok, `${kind} rail=${rail}: missed ${r.missed}`);
    assert.ok(balanced(r.fs) && balanced(r.vs));
    // the coat sits in front of the app's shadow rail when there is one, after the lights otherwise
    const coatAt = r.fs.indexOf('clubWoodLampLobe( clubWoodCN');
    assert.ok(coatAt > 0);
    if (rail) assert.ok(coatAt < r.fs.indexOf('reflectedLight.directDiffuse *= spikeShadow;') && coatAt > r.fs.indexOf('float spikeShadow'));
    else assert.ok(coatAt > r.fs.indexOf('#include <lights_fragment_end>') && coatAt < r.fs.indexOf('#include <opaque_fragment>'));
    // order inside main: albedo, normal, roughness, coat
    const at = ['clubWoodSC = ', 'clubWoodCN = ', 'clubWoodCR = clubWoodAA', 'float cwKeep'].map((s) => r.fs.indexOf(s, r.fs.indexOf('void main()')));
    for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1] && at[i - 1] > 0, `${kind}: order ${at}`);
    // functions are declared before main and after three's light declarations
    assert.ok(r.fs.indexOf('vec3 clubWoodLampLobe(') > r.fs.indexOf('#include <lights_physical_pars_fragment>'));
    assert.ok(r.fs.indexOf('vec3 clubWoodLampLobe(') < r.fs.indexOf('void main()'));
  }
});
ok('patch: a missing anchor skips the whole patch', () => {
  const p = G.woodPatchParts('wood', fragment(true));
  const r = applyPatchText(vertex, fragment(true).replace('#include <normal_fragment_maps>', ''), p);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missed, ['#include <normal_fragment_maps>']);
});
ok('patch: keys name the version and the variant; one sampler at most is declared', () => {
  const wood = G.woodPatchParts('wood', null), nomap = G.woodPatchParts('wood', null, { map: false }), sight = G.woodPatchParts('sight', null);
  assert.equal(wood.key, `mat-wood-v${G.WOOD_PATCH_VERSION}:wood`);
  assert.equal(nomap.key, `mat-wood-v${G.WOOD_PATCH_VERSION}:wood-nomap`);
  assert.equal(sight.key, `mat-wood-v${G.WOOD_PATCH_VERSION}:sight`);
  const all = (p) => p.pars + p.apply.map((a) => a.code).join('\n');
  assert.equal(count(all(wood), /uniform\s+sampler\w+/g), 1);
  assert.equal(count(all(nomap), /uniform\s+sampler\w+/g), 0);
  assert.equal(count(all(sight), /uniform\s+sampler\w+/g), 0);
  assert.ok(!all(nomap).includes('uClubWoodMap') && !all(sight).includes('uClubWoodMap'));
  assert.ok(all(wood).includes('textureGrad( uClubWoodMap'));
});
ok('patch: every uniform the text reads is declared, and wood.js feeds every declared uniform', () => {
  const js = fs.readFileSync(fileURLToPath(new URL('../../scene/club/mat/wood.js', import.meta.url)), 'utf8');
  for (const kind of ['wood', 'sight']) {
    const p = G.woodPatchParts(kind, fragment(true));
    const code = p.apply.map((a) => a.code).join('\n');
    const declared = new Set([...p.pars.matchAll(/uniform\s+\w+\s+(uClub\w+)\s*(?:\[\s*\d+\s*\])?\s*;/g)].map((m) => m[1]));
    const used = new Set([...code.matchAll(/\buClub(?:Wood|Sight)\w*/g)].map((m) => m[0]));
    for (const u of used) assert.ok(declared.has(u), `${kind}: ${u} is read but not declared`);
    for (const u of declared) assert.ok(js.includes(u), `${kind}: ${u} is declared but wood.js never sets it`);
  }
});
ok('coat: three lobes that share one reflection; the lamp enters as tubes in the narrow lobe only', () => {
  const coat = G.WOOD_COAT, fn = G.WOOD_FN;
  assert.ok(coat.includes('float cwCore = ( 1.0 - cwHz - cwBr ) * cwFilm;'));
  // an open pore moves part of the narrow lobe's share into the wide one, for the lamp and for the room alike
  assert.ok(coat.includes('float cwHz = clamp( uClubWoodHaze.y * clubWoodHzK + 0.6 * uClubWoodPore.x * clubWoodPore, 0.0, 0.9 );'));
  assert.ok(coat.includes('float cwFilm = 1.0 - uClubWoodPore.w * clamp( 1.0 - clubWoodFig, 0.0, 1.0 );'));
  assert.ok(coat.includes('* cwEnvF * ( ( 1.0 - cwHz ) * cwFilm );'));
  assert.ok(coat.includes('clubWoodLampLobe( clubWoodCN, cwCV, geometryPosition, clubWoodCR, 1.0 ) * cwCore'));
  assert.ok(coat.includes('clubWoodLampLobe( clubWoodCN, cwCV, geometryPosition, clubWoodHR, 0.0 ) * cwHz'));
  assert.ok(coat.includes('clubWoodBrush( vClubWoodPos, cwNw, cwVw, clubWoodAx ) * cwBr'));
  // along the lamp: its lit panels (a loop of at most six); across it: one or three strips; the two profiles are multiplied
  // over the whole rectangle's integral; a light without the pattern keeps its own radiance
  assert.ok(fn.includes('for ( int k = 0; k < 6; k ++ ) {') && fn.includes('if ( float( k ) >= uClubWoodLampS.x ) break;'));
  assert.equal(count(fn, /clubWoodRect\( N, V, P, mInv, c[^;]*uClubWoodLampT\.w, b \* uClubWoodLampT\.y \)/g), 3);
  assert.ok(fn.includes('float along = pads / max( full.x, 1e-5 );') && fn.includes('lobe = across * along;'));
  // a roll thinner than a pixel: the profile along the rail is taken at the fan's normal that mirrors the eye onto the
  // lamp's centre line, with the lobe's unwidened roughness; the widened lobe keeps the amount
  assert.ok(fn.includes('float thin = smoothstep( 0.02, 0.1, clubWoodVar ) * uClubWoodBase.y;'));
  assert.ok(fn.includes('vec3 n2 = normalize( V + sqrt( max( 1.0 - va * va, 0.0 ) ) * normalize( e ) - va * ax );'));
  assert.ok(fn.includes('LTC_Uv( n2, V, clubWoodCR0 )') && fn.includes('along = mix( along, pads2 / full2, thin );'));
  {
    // the construction: a normal n in the plane across the rail's axis A keeps the eye vector's A component (mirrored), so the
    // mirror ray is r = -(V.A) A + sqrt(1 - (V.A)^2) e for a unit e across A; with e toward the lamp's centre line the ray meets it
    const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const P = [0.4, 0.0447, -0.6858], cam = [-2.3, 1.05, 1.35], C = [0, 1.02, 0], A = [1, 0, 0];
    const V = nrm([cam[0] - P[0], cam[1] - P[1], cam[2] - P[2]]);
    const va = dot(V, A), toC = [C[0] - P[0], C[1] - P[1], C[2] - P[2]];
    const e = nrm(toC.map((x, i) => x - A[i] * dot(toC, A)));
    const n2 = nrm(V.map((x, i) => x + Math.sqrt(1 - va * va) * e[i] - va * A[i]));
    assert.ok(Math.abs(dot(n2, A)) < 1e-12, 'the normal lies across the rail');
    const k = dot(n2, V), r = n2.map((x, i) => 2 * k * x - V[i]);
    const t = (C[1] - P[1]) / r[1];
    assert.ok(Math.abs(P[2] + r[2] * t - C[2]) < 1e-9, 'the mirror ray meets the lamp\'s centre line');
    const lean = Math.atan2(n2[2], n2[1]) * 180 / Math.PI;
    assert.ok(lean > 40 && lean < 62, `on the far rail from the standing view that normal leans ${lean.toFixed(1)} degrees toward the table`);
  }
  assert.ok(fn.includes('vec3 lobe = rectAreaLights[ i ].color * full;'));
  // the corner order is three's own (it decides the lit side of the rectangle)
  const three = read('../../vendor/three.module.min.js');
  assert.ok(/rectCoords\[\s*0\s*\]\s*=\s*lightPos \+ halfWidth - halfHeight;/.test(three) && /rectCoords\[\s*3\s*\]\s*=\s*lightPos \+ halfWidth \+ halfHeight;/.test(three));
  assert.ok(fn.includes('rc[ 0 ] = c + a - b;') && fn.includes('rc[ 1 ] = c - a - b;') && fn.includes('rc[ 2 ] = c - a + b;') && fn.includes('rc[ 3 ] = c + a + b;'));
  // the scratch fan never returns more than a mirror
  assert.ok(fn.includes('min( omega * D / ( 4.0 * max( nv, 0.2 ) ), 1.0 )'));
});
ok('body: the room\'s light enters per face direction with the table\'s own occlusion, and only on body parts', () => {
  const coat = G.WOOD_COAT;
  assert.ok(coat.includes('if ( uClubWoodMode.y > 0.5 ) {'));
  assert.ok(coat.includes('cwN2.x * ( cwNw.x > 0.0 ? uClubWoodAmb[ 0 ] : uClubWoodAmb[ 1 ] )'));
  assert.ok(coat.includes('cwN2.z * ( cwNw.z > 0.0 ? uClubWoodAmb[ 4 ] : uClubWoodAmb[ 5 ] )'));
  assert.ok(coat.includes('reflectedLight.indirectDiffuse += cwBody * ( material.diffuseColor + uClubWoodFill.a ) * cwOn;'));
  assert.ok(G.WOOD_ROUGHNESS.includes('material.diffuseColor += vec3( uClubWoodFill.a * uClubWoodSw.x * ( 1.0 - step( 0.5, uClubWoodMode.y ) ) );'), 'on a rail cap the matte pedestal rides the material\'s own diffuse term; on a body part it takes the room\'s light only');
  const js = read('../../scene/club/mat/wood.js');
  assert.equal(count(js, /res\.faces\.forEach\(\(e, i\) => amb\[i\]\.set\(e\[0\] \/ Math\.PI, e\[1\] \/ Math\.PI, e\[2\] \/ Math\.PI\)\);/g), 2, 'irradiance / pi, in the order of bodyLight, on both paths');
});
ok('body: the room answers for its own light where it can (the calls are pinned in the room\'s files)', () => {
  const light = read('../../scene/club/room/light.js'), room = read('../../scene/club/room.js');
  // (names and argument shapes only: the bodies are the room role's and move with its work)
  assert.ok(/function irradianceAt\(position, normal, \{ baked = true \} = \{\}\)/.test(light), 'room/light.js irradianceAt(position, normal, { baked })');
  assert.ok(/floorIrradiance: \(x, z\) =>/.test(room), 'club.room.lightmap.floorIrradiance(x, z)');
  assert.ok(/floor: \{ mesh: shell\.floor\.mesh, material: shell\.floor\.material,[^\n]*\balbedo\b/.test(room), 'club.room.floor.albedo');
  const js = read('../../scene/club/mat/wood.js');
  assert.ok(js.includes('at: (p, n, baked) => L.irradianceAt(p, n, { baked }),') && js.includes('bounceGain = api.baked ? 0 : 1;'));
  // bodyLight with the room's sampler: the packed uniforms are not read, the underside is sampled, the floor comes from the map
  const T = { centre: [0, 0], outer: [1.45, 0.81], top: 0.045, floorY: -0.79 };
  const calls = [];
  const b = bodyLight(null, null, T, { sample: (p, n) => { calls.push([p, n]); return [n[0] > 0 ? 2 : 1, 1, n[1] < 0 ? 0.1 : 0.5]; }, floorSample: (x, z) => (x > 0 ? [3, 2, 1] : null) });
  assert.equal(b.faces.length, 6); assert.equal(b.floor.length, 4);
  assert.deepEqual(b.faces[0], [2, 1, 0.5]); assert.deepEqual(b.faces[1], [1, 1, 0.5]);
  assert.deepEqual(b.faces[3], [1, 1, 0.1], 'the underside is the room\'s own answer');
  assert.deepEqual(b.floor[0], [3, 2, 1], 'the floor beside the table from the map');
  assert.deepEqual(b.floor[1], [1, 1, 0.5], 'and from the sampler where the map has no answer');
  assert.ok(calls.length >= 6 * 4 && calls.every(([p, n]) => p.length === 3 && Math.abs(Math.hypot(...n) - 1) < 1e-9));
});
// ---- against the vendored three itself: the real templates carry every anchor, and the chunks declare what the text calls ----
const THREE = await import('../../vendor/three.module.min.js');
ok('patch: applies to the vendored three standard and physical templates (plain variant)', () => {
  for (const lib of ['standard', 'physical']) for (const kind of ['wood', 'sight']) {
    const { vertexShader, fragmentShader } = THREE.ShaderLib[lib];
    const p = G.woodPatchParts(kind, fragmentShader);
    assert.equal(p.variant, 'plain');
    const r = applyPatchText(vertexShader, fragmentShader, p);
    assert.ok(r.ok, `${lib}/${kind}: missed ${r.missed}`);
  }
});
ok('patch: the vendored three chunks declare what the text relies on', () => {
  const C = THREE.ShaderChunk;
  const need = [
    ['normal_fragment_begin', 'vec3 nonPerturbedNormal = normal;'],
    ['lights_fragment_begin', 'vec3 geometryViewDir = '], ['lights_fragment_begin', 'vec3 geometryPosition = '],
    ['lights_pars_begin', 'uniform sampler2D ltc_1;'], ['lights_pars_begin', 'uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];'],
    ['lights_physical_pars_fragment', 'vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] )'],
    ['lights_physical_pars_fragment', 'vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness )'],
    ['lights_physical_pars_fragment', 'vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness )'],
    ['lights_physical_fragment', 'material.roughness = '], ['lights_physical_fragment', 'material.clearcoat = clearcoat;'],
    ['cube_uv_reflection_fragment', 'vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness )'],
    ['envmap_common_pars_fragment', 'uniform mat3 envMapRotation;'], ['envmap_common_pars_fragment', 'uniform float envMapIntensity;'],
    ['normalmap_pars_fragment', 'uniform sampler2D normalMap;'], ['map_pars_fragment', 'uniform sampler2D map;'],
    ['common', 'vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix )'],
  ];
  for (const [chunk, text] of need) assert.ok(C[chunk]?.includes(text), `${chunk}: ${text}`);
  // the three r170 gap this part fills: the rectangular light has no clearcoat term
  const rect = C.lights_physical_pars_fragment.slice(C.lights_physical_pars_fragment.indexOf('void RE_Direct_RectArea_Physical'), C.lights_physical_pars_fragment.indexOf('void RE_Direct_Physical'));
  assert.ok(rect.length > 200 && !rect.includes('clearcoat') || rect.includes('geometryClearcoatNormal') && !rect.includes('clearcoatSpecularDirect'), 'three now lights the clearcoat from rectangular lights: drop the coat\'s own lamp lobe on physical materials');
});

ok('patch: text rules (no brand or personal names, ASCII only)', () => {
  const src = ['mat/wood.js', 'mat/wood/glsl.js', 'mat/wood/layout.js'].map((f) => fs.readFileSync(fileURLToPath(new URL(`../../scene/club/${f}`, import.meta.url)), 'utf8')).join('\n');
  assert.ok(!/[^\x00-\x7f]/.test(src.replace(/[—…]/g, '')), 'non-ASCII character');
  assert.ok(!/\/Users\/|@[a-z]+\.(com|net)/i.test(src));
});

console.log(`\n${n} checks passed`);
