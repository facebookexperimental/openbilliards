// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-arena-shell.mjs — the node arm of the arena's shell (arena/shell.js, arena/shell/*; CONTRACT.md 13.4, 14.2).
// Pure checks, no browser and no GL: the plan and its signature, the light-map chart layout, the floor mesh (flat, alone,
// the room light's floor material), the emitter share, the carpet patch against three's shader text and the other floor
// patches, the canvases (means, scallops), and that nothing in the shell draws a word.
// Run: node web/tools/club/test-club-arena-shell.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../..');
const read = (rel) => fs.readFileSync(path.join(web, rel), 'utf8');
let passed = 0;
const failures = [];
const ok = (name, fn) => { try { fn(); passed += 1; console.log(`ok   ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}\n     ${String(e?.message ?? e).split('\n').join('\n     ')}`); } };

const { ARENA, PALETTE, ALBEDO, inCameraVolume } = await import('../../scene/club/arena/layout.js');
const { PLAN, PLEATS, shellPlan, shellSignature, drapePleats, SHELL_VERSION, DOOR_KIT, PELMET } = await import('../../scene/club/arena/shell/plan.js');
const GLSL = await import('../../scene/club/arena/shell/glsl.js');
const { applyPatchText } = await import('../../scene/club/patchtext.js');

// the light-map atlas as declared in scratch/shell/GEOMETRY-STABLE.md (x, y, w, h, rotated; texels per metre)
const DECLARED_CHARTS = [[1, 1, 694, 700, false], [697, 563, 311, 134, false], [1, 703, 555, 156, false], [697, 1, 156, 560, true], [1, 861, 555, 156, false], [855, 1, 156, 560, true]];
const DECLARED_SCALE = 27.75;
// (round A6: the roof's lid, two half charts of the kind `roof` (0.43): 11.9 texels per metre)
const DECLARED_ROOF_CHARTS = [[558, 703, 299, 151, false], [558, 861, 299, 151, false]];
const FILES = ['scene/club/arena/shell.js', 'scene/club/arena/shell/plan.js', 'scene/club/arena/shell/tex.js', 'scene/club/arena/shell/glsl.js'];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// ---- 1. the plan ---------------------------------------------------------------------------------------------------------
ok('plan: four emitters on every tier (the shell\'s share), all tubes, inside the hall, above the floor', () => {
  for (const d of [0, 1, 2]) {
    const p = shellPlan(ARENA, d);
    assert.deepEqual(p.emitters.map((e) => e.id), ['hall.wash.0', 'hall.house.north', 'hall.house.south', 'hall.house.east']);
    assert.ok(p.emitters.length <= (ARENA.emitters.shell ?? 4));
    for (const e of p.emitters) {
      assert.equal(e.type, 'tube');
      assert.ok(e.p[0] > ARENA.hall.x0 && e.p[0] < ARENA.hall.x1 && e.p[2] > ARENA.hall.z0 && e.p[2] < ARENA.hall.z1 && e.p[1] > 0 && e.p[1] < ARENA.hall.height, `${e.id} is outside the hall`);
      assert.ok(e.size[0] >= 1 && e.size[1] > 0);
    }
    // the wash: one tube along the row of floor lights, between the cloth and the boards, as long as the row
    const w = p.emitters[0], bd = ARENA.backdrop;
    assert.ok(w.p[0] > bd.x + 0.3 && w.p[0] < ARENA.island.x0 - 1 && Math.abs(w.p[2] - (bd.z0 + bd.z1) / 2) < 1e-9);
    assert.ok(w.size[0] <= bd.z1 - bd.z0 && w.size[0] >= 0.8 * (bd.z1 - bd.z0));
    assert.ok(p.lights.length >= 5 && p.lights.every((u) => u.z - p.light.length / 2 >= bd.z0 && u.z + p.light.length / 2 <= bd.z1));
    // the drape lights: on the wall behind a block, under its top row's deck, too far from the island to light its carpet
    const topDeck = ARENA.seating.firstRowH + (ARENA.seating.rows - 1) * ARENA.seating.rise;
    for (const e of p.emitters.slice(1)) {
      assert.ok(e.p[1] < topDeck - 0.5);
      const toWall = Math.min(e.p[0] - ARENA.hall.x0, ARENA.hall.x1 - e.p[0], e.p[2] - ARENA.hall.z0, ARENA.hall.z1 - e.p[2]);
      assert.ok(toWall > 0.15 && toWall < 0.4, `${e.id} is ${toWall} m off its wall`);
      const toIsland = Math.max(ARENA.island.x0 - e.p[0], e.p[0] - ARENA.island.x1, ARENA.island.z0 - e.p[2], e.p[2] - ARENA.island.z1);
      assert.ok(toIsland > 7.65, `${e.id}: the island is ${toIsland} m away`);
    }
  }
});

ok('plan: every wall is covered by its pleats exactly; pleats are uneven; a drape width ends in a join', () => {
  for (const d of [0, 1, 2]) {
    const p = shellPlan(ARENA, d);
    for (const w of p.walls) {
      const list = p.pleats[w.id];
      assert.ok(Math.abs(list[0].s) < 1e-9);
      for (let i = 1; i < list.length; i++) assert.ok(Math.abs(list[i].s - (list[i - 1].s + list[i - 1].w)) < 2e-4, `${w.id}: a gap between pleats ${i - 1} and ${i}`);
      const last = list[list.length - 1];
      assert.ok(Math.abs(last.s + last.w - w.L) < 2e-4, `${w.id}: the pleats end at ${last.s + last.w}, the wall is ${w.L}`);
      // (the `over` pleats are a door bay's header: a width of its own that spans exactly the wall's bay, without a join)
      const cloth = list;
      const headers = []; list.forEach((q, i) => { if (!q.over) return; if (i > 0 && list[i - 1].over) headers[headers.length - 1][1] = +(q.s + q.w).toFixed(4); else headers.push([q.s, +(q.s + q.w).toFixed(4)]); });
      assert.deepEqual(headers, w.gaps, `${w.id}: the headers are not over the wall's bays`);
      assert.ok(list.every((q) => !(q.over && q.join)), `${w.id}: a join inside a header`);
      assert.ok(cloth.every((q) => q.w > 0.3 * PLEATS[d].pitch - 1e-9 && q.A > 0.02 && q.valley >= 0.08 && q.valley <= 1 && q.tone > 0.5 && q.tone < 1.3 && q.A <= (q.join ? 0.7 : 1.1) * q.w + 1e-4 && q.A <= PLAN.drape.maxDepth + 1e-9));
      // the head sags between its ties, never more than the plan says, and a pleat's end hangs where the next one starts
      for (let i = 0; i < list.length; i++) {
        const q = list[i];
        assert.ok(q.drop.length === 2 && q.drop.every((v) => v >= 0 && v <= PLAN.drape.sag[1] + 1e-9), `${w.id}: pleat ${i} drops ${q.drop}`);
        if (i > 0) assert.ok(Math.abs(q.drop[0] - list[i - 1].drop[1]) < 2e-4, `${w.id}: the head breaks between pleats ${i - 1} and ${i}`);
      }
      assert.ok(Math.max(...cloth.map((q) => Math.max(...q.drop))) > 0.02, `${w.id}: the head does not sag`);
      // the wander is smooth: a fold never crosses its neighbour (the next fold's start stays ahead of this one's)
      for (let i = 1; i < list.length; i++) for (const k of ['lean', 'mid', 'sway']) assert.ok(Math.abs(list[i][k] - list[i - 1][k]) < 0.25 * Math.min(list[i].w, list[i - 1].w) + 0.012, `${w.id}: folds ${i - 1} and ${i} cross (${k})`);
      const ws = cloth.map((q) => q.w), mean = ws.reduce((a, b) => a + b, 0) / ws.length;
      const sd = Math.sqrt(ws.reduce((a, b) => a + (b - mean) ** 2, 0) / ws.length);
      assert.ok(sd / mean > 0.25, `${w.id}: pleat widths vary by ${(sd / mean).toFixed(2)} of their mean (regular bars)`);
      // joins: a hung width covers at most bay[1] x width of the wall; a join is a lap (the next fold in its shadow)
      const clothLen = cloth.reduce((a, q) => a + q.w, 0);
      if (d > 0) assert.ok(cloth.filter((q) => q.join).length >= Math.floor(clothLen / (PLAN.drape.width * PLAN.drape.bay[1])) - 3, `${w.id}: too few joins`);
      for (let i = 0; i + 1 < list.length; i++) if (list[i].join && !list[i + 1].over) assert.ok(list[i + 1].valley <= 0.2, `${w.id}: the fold behind lap ${i} is not in its shadow`);
      // no two bays alike (d > 0): between two joins the mean fold depth differs from bay to bay
      if (d > 0) {
        const bays = []; let cur = [];
        for (const q of cloth) { cur.push(q.A); if (q.join) { bays.push(cur); cur = []; } }
        const means = bays.filter((b) => b.length >= 3).map((b) => b.reduce((a, v) => a + v, 0) / b.length);
        assert.ok(means.length >= 4 && Math.max(...means) / Math.min(...means) > 1.35, `${w.id}: the bays' mean fold depths ${means.map((v) => v.toFixed(3))} are alike`);
      }
      // a wall's foot shows only beside the seating block / the backdrop
      assert.ok(w.foot.length >= 1 && w.foot.every(([a, b]) => a >= 0 && b <= w.L && b - a > 0.3));
    }
    assert.deepEqual(drapePleats(10, { pitch: 0.4, depth: 0.1, seed: 5 }), drapePleats(10, { pitch: 0.4, depth: 0.1, seed: 5 }), 'seeded: the same pleats on every load');
  }
});

ok('plan: the signature is a short string, the same on every call, its own per detail, and holds no level', () => {
  const sigs = [0, 1, 2].map((d) => shellSignature(shellPlan(ARENA, d)));
  for (const s of sigs) assert.match(s, new RegExp(`^shell-v${SHELL_VERSION}\\.d[012]\\.g[0-9a-f]{8}\\.e[0-9a-f]{8}$`));
  assert.equal(new Set(sigs).size, 3);
  assert.deepEqual(sigs, [0, 1, 2].map((d) => shellSignature(shellPlan(ARENA, d))));
  // a moved emitter or a moved wall moves it
  const moved = JSON.parse(JSON.stringify(ARENA)); moved.backdrop.x += 0.1;
  assert.notEqual(shellSignature(shellPlan(moved, 1)), sigs[1]);
  const src = stripComments(read('scene/club/arena/shell/plan.js'));
  assert.ok(!/intensity|levels\.|PALETTE|color/i.test(src.slice(src.indexOf('export function shellSignature'))), 'the signature reads a level or a colour');
  console.log(`   signatures: ${sigs.join('  ')}`);
});

ok('plan: heights the rig shares the roof with (deck, ducts) stay inside the hall and above the camera', () => {
  const p = shellPlan(ARENA, 2), top = ARENA.keepOut.cameraVolume.h1;
  assert.ok(p.drape.height > 5 && p.drape.height < ARENA.hall.height - 1);
  assert.ok(ARENA.hall.height - p.roof.ribDepth > top);
  const dk = p.ducts;
  assert.ok(dk.h - dk.r - 0.2 > top && dk.h + dk.r < ARENA.hall.height - p.roof.ribDepth, 'the ducts hang between the camera\'s top and the deck');
  assert.ok(dk.z.every((z) => Math.abs(z) + dk.r < ARENA.hall.z1) && dk.cross.x + dk.cross.w / 2 < ARENA.hall.x1);
  // the ducts run over the seating blocks' upper rows, outside the rig's footprint
  assert.ok(dk.z.every((z) => Math.abs(z) > ARENA.rig.width / 2 + 3));
});

// ---- 2. the carpet patch against three's own shader text --------------------------------------------------------------------
const { registerHooks } = await import('node:module');
const threeUrl = pathToFileURL(path.join(web, 'vendor/three.module.min.js')).href;
registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
const THREE = await import('three');
// a stub 2D canvas that keeps what was put (the canvases are pixel loops into an ImageData; anything else is a no-op)
const canvases = [];
const hadDocument = 'document' in globalThis;
if (!hadDocument) {
  globalThis.document = { createElement: () => {
    const cv = { width: 0, height: 0, calls: [], image: null };
    const ctx = new Proxy({
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img) => { cv.image = img; },
    }, { get: (t, k) => (k in t ? t[k] : (...a) => { cv.calls.push(String(k)); return undefined; }), set: (t, k, v) => { t[k] = v; return true; } });
    cv.getContext = () => ctx;
    canvases.push(cv);
    return cv;
  } };
}
const { buildShell, HALL, SCANS, SIGN, PILE, lumaOf, scanColour, foldRow, rectShare } = await import('../../scene/club/arena/shell.js');
const TEX = await import('../../scene/club/arena/shell/tex.js');
const { roomLight } = await import('../../scene/club/room/light.js');
const { roofPlan, outerPlan, tableKeyShutter, tableKeyFoot, tableKeySides, HALL: RIG_HALL } = await import('../../scene/club/arena/rig/plan.js');
const { TIERS } = await import('../../scene/club/tiers.js');

const F = -0.79;
// The levels the arm builds with: the hall's own table. Round A6 (CONTRACT 18.3: a step lands dark, then is switched in):
// `SHELL_ARM_LEVELS=key:value,...` in the environment overrides numbers of the table for ONE run, so a step that is
// still switched off in the tree is checked by this arm before the one edit that switches it in. Without the variable
// the arm checks the tree as it is.
const LV = Object.freeze({ ...HALL, ...Object.fromEntries((process.env.SHELL_ARM_LEVELS ?? '').split(',').map((kv) => kv.split(':')).filter(([k, v]) => typeof HALL[k] === 'number' && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) });
if (process.env.SHELL_ARM_LEVELS) console.log(`   (levels overridden for this run: ${process.env.SHELL_ARM_LEVELS})`);
/** The plan as the builder builds it: with the geometry options it hands over from its level table (round A6). */
const planOf = (d) => shellPlan(ARENA, d, { doorBack: LV.doorBack, roofChart: LV.roofChart > 0, washAim: LV.washAim, doorKit: LV.doorKit > 0, pelmet: LV.pelmet > 0, foldOpen: LV.foldOpen > 0 });
const built = {};
for (const tier of ['lite', 'base', 'high']) {
  roomLight.reset();
  const club = { tier, knobs: TIERS[tier] };
  roomLight.init({ club, envMap: null, tableBlock: true });
  const box = { min: new THREE.Vector3(ARENA.hall.x0, F, ARENA.hall.z0), max: new THREE.Vector3(ARENA.hall.x1, F + ARENA.hall.height, ARENA.hall.z1) };
  const shell = buildShell({ club, roomLight, box, detail: TIERS[tier].roomDetail, levels: LV, layout: ARENA });
  built[tier] = { shell, club, emitters: roomLight.emitters.map((e) => ({ id: e.id, type: e.type, p: e.position.toArray(), size: e.size, radius: e.radius, intensity: e.intensity })), key: shell.floor.material.customProgramCacheKey(), room: shell.floor.material.userData.clubRoom };
}

// (round A6: the level `carpetV4` chooses the carpet patch: v4's text under its own names, or v3's)
const V4 = LV.carpetV4 > 0;
const CP = V4
  ? { key: GLSL.CARPET_PATCH_KEY_4, pars: GLSL.CARPET_PARS_4, color: GLSL.CARPET_COLOR_4, rough: GLSL.CARPET_ROUGH_4, spec: (u) => GLSL.carpetPatchSpec4(u), uniforms: (p, o) => GLSL.carpetUniforms4(p, o) }
  : { key: GLSL.CARPET_PATCH_KEY, pars: GLSL.CARPET_PARS, color: GLSL.CARPET_COLOR, rough: GLSL.CARPET_ROUGH, spec: (u) => GLSL.carpetPatchSpec(u), uniforms: (p, o) => GLSL.carpetUniforms(p, o) };

ok('patch: every anchor is a standard include, hit once, after-only; the room light\'s and the occlusion service\'s floor text still land', () => {
  const spec = CP.spec(CP.uniforms(shellPlan(ARENA, 1), { gaps: ARENA.boards.gaps }));
  assert.equal(spec.key, CP.key);
  for (const a of spec.apply) { assert.equal(a.mode, 'after'); assert.match(a.anchor, /^#include <[a-z_]+>$/); assert.ok(!a.stage, 'a fragment patch'); }
  const std = THREE.ShaderLib.standard;
  for (const a of spec.apply) assert.equal(std.fragmentShader.split(a.anchor).length - 1, 1, `${a.anchor} is not in three's standard fragment shader exactly once`);
  // the floor material as the app compiles it: the room light's hook, then the carpet patch, then the occlusion service's
  const m = built.base.shell.floor.material;
  const shader = { uniforms: {}, defines: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
  m.onBeforeCompile(shader, null);
  for (const text of ['arenaTapeK', 'uArenaIsl', 'uRoomTableBlock', 'clubRoomLampPool', 'vRoomWP']) assert.ok(shader.fragmentShader.includes(text), `the compiled floor text lacks ${text}`);
  assert.equal(shader.fragmentShader.split('float arenaTapeK = 0.0;').length - 1, 1);
  assert.ok(shader.fragmentShader.includes('varying vec3 vColor;') || /varying vec3 vColor/.test(THREE.ShaderChunk.color_pars_fragment), 'the contrast law reads vColor');
  for (const u of Object.keys(spec.uniforms)) assert.ok(shader.uniforms[u], `uniform ${u} is not handed to the program`);
  // declared before use: the patch's pars come before main, its code after the varying it reads
  assert.ok(shader.fragmentShader.indexOf('varying vec3 vRoomWP;') < shader.fragmentShader.indexOf('vec2 aw = vRoomWP.xz;'));
  assert.ok(shader.fragmentShader.indexOf('float arenaLine(') < shader.fragmentShader.indexOf('void main()'));
  // the anchors of the two other floor patches are still there, unmoved
  for (const anchor of ['#include <lights_fragment_begin>', '#include <lights_fragment_end>', '#include <lights_fragment_maps>']) assert.equal(shader.fragmentShader.split(anchor).length - 1, 1, anchor);
  assert.ok(shader.vertexShader.includes('#include <project_vertex>'));
  // every uniform the text reads is declared in the pars and handed over, and nothing is declared twice
  const used = new Set([...`${CP.color}${CP.rough}`.matchAll(/\buArena[A-Za-z]+/g)].map((x) => x[0]));
  for (const u of used) { assert.ok(new RegExp(`uniform vec4 ${u}[; \\[]`).test(CP.pars), `${u} is not declared`); assert.ok(u in spec.uniforms, `${u} has no value`); }
  assert.deepEqual([...used].sort(), Object.keys(spec.uniforms).sort(), 'a uniform is handed over and never read, or read and never handed over');
  // nothing in the patch adds light: it scales the albedo and the roughness only (no flat term on the carpet)
  // (both versions' text, whichever is switched in)
  for (const text of [`${GLSL.CARPET_COLOR}${GLSL.CARPET_ROUGH}`, `${GLSL.CARPET_COLOR_4}${GLSL.CARPET_ROUGH_4}`]) assert.ok(!/reflectedLight|totalEmissiveRadiance|outgoingLight|gl_FragColor|diffuseColor\.rgb\s*\+=/.test(text));
  // the scan's contrast law is the one tex.js computes its scale for: about the mean, two slopes, one scale
  assert.match(CP.color, /aMean \+ \( diffuseColor\.rgb - aMean \) \* aCon/);
  assert.match(CP.color, /aRel < 1\.0 \? uArenaCon\.x : uArenaCon\.y/);
  // before a scan is measured the law is the identity (the code-drawn canvas keeps its own contrast, its mean is exact)
  assert.deepEqual(spec.uniforms.uArenaCon.value, [1, 1, 1, 0]);
  assert.deepEqual(CP.uniforms(shellPlan(ARENA, 1), { mean: TEX.CARPET_MEAN }).uArenaMean.value, [TEX.CARPET_MEAN, TEX.CARPET_MEAN, TEX.CARPET_MEAN, 0]);
  // the lite tier's floor carries no patch; base and high carry it once, and the room light's own key stays in front
  assert.ok(!built.lite.key.includes('arena-carpet') && !(built.lite.shell.floor.material.userData.clubKeys ?? []).some((k) => String(k).startsWith('arena-carpet')));
  // (round A6: with the keys' side blades in its light model the floor carries the variant `arena-carpet-v4s`)
  for (const t of ['base', 'high']) {
    // (round A7: with the hand's row beside the side blades it is `arena-carpet-v5`)
    const bu = built[t].shell.floor.material.userData.arenaCarpet, sidedNow = V4 && !!bu?.uArenaKeyA;
    const fk = sidedNow ? (bu.uArenaHand ? GLSL.CARPET_PATCH_KEY_5 : GLSL.CARPET_PATCH_KEY_4S) : CP.key;
    assert.equal(sidedNow, V4 && LV.carpetSides > 0 && (LV.carpetSides >= 2 || RIG_HALL.tableKeys.legs?.on === true) && typeof tableKeySides === 'function', `${t}: the side blades' switch`);
    assert.equal(!!bu?.uArenaHand, sidedNow && LV.carpetV5 > 0, `${t}: the v5 switch`);
    assert.ok(built[t].key.endsWith(`|club:${fk}`) && built[t].key.startsWith('club-room-light'), `${t}: ${built[t].key}`);
    assert.deepEqual(built[t].shell.floor.material.userData.clubKeys, [fk]);
  }
});

// ---- 3. the build ----------------------------------------------------------------------------------------------------------
ok('floor: one flat mesh at the floor height over the whole hall, alone on its material, the room light\'s floor material', () => {
  for (const [tier, b] of Object.entries(built)) {
    const s = b.shell, fm = s.floor.mesh, pos = fm.geometry.attributes.position, nor = fm.geometry.attributes.normal;
    assert.equal(fm.name, 'arenaHallCarpet');
    for (let i = 0; i < pos.count; i++) { assert.equal(pos.getY(i), Math.fround(F), `${tier}: a floor vertex at y ${pos.getY(i)}`); assert.ok(nor.getY(i) > 0.999999, `${tier}: a floor normal is not straight up`); }
    fm.geometry.computeBoundingBox();
    const bb = fm.geometry.boundingBox;
    assert.deepEqual([bb.min.x, bb.max.x, bb.min.z, bb.max.z], [ARENA.hall.x0, ARENA.hall.x1, ARENA.hall.z0, ARENA.hall.z1].map(Math.fround));
    // its triangles cover the hall exactly once (no overlap, no hole): the area adds up
    const ix = fm.geometry.index; let area = 0;
    for (let i = 0; i < ix.count; i += 3) {
      const [a, c, d] = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)];
      area += Math.abs((pos.getX(c) - pos.getX(a)) * (pos.getZ(d) - pos.getZ(a)) - (pos.getX(d) - pos.getX(a)) * (pos.getZ(c) - pos.getZ(a))) / 2;
    }
    assert.ok(Math.abs(area - (ARENA.hall.x1 - ARENA.hall.x0) * (ARENA.hall.z1 - ARENA.hall.z0)) < 1e-3, `${tier}: the floor's area is ${area}`);
    assert.equal(ix.count / 3, tier === 'lite' ? 18 : 10, `${tier}: floor triangles`);
    const all = []; s.group.traverse((o) => { if (o.isMesh) all.push(o); });
    assert.equal(all.length, 5 + (LV.roofChart > 0 ? 1 : 0), `${tier}: ${all.length} meshes`);
    assert.deepEqual(all.filter((o) => o.material === s.floor.material), [fm], `${tier}: another mesh uses the floor's material`);
    assert.ok(s.floor.material.isMeshStandardMaterial && /\|ts\|/.test(b.room) && b.room.endsWith('|tb'), `${tier}: ${b.room}`);
    // the table-block switch and the floor terms are the carpet's alone
    for (const m of [s.materials.drape, s.materials.matt, s.materials.backdrop]) assert.ok(!/\|ts\||\|tb/.test(m.userData.clubRoom), `${tier}: ${m.name} carries a floor switch (${m.userData.clubRoom})`);
    assert.ok(fm.geometry.attributes.lm && s.meshes.backdrop.geometry.attributes.lm && s.meshes.drape.geometry.attributes.lm && !s.meshes.matt.geometry.attributes.lm);
    assert.ok(s.floor.albedo.every((v) => v > 0.02 && v < 0.3), `${tier}: floor albedo ${s.floor.albedo}`);
    // the island's level is the albedo table's (CONTRACT 15.2); its hue is the palette's
    const want = new THREE.Color(PALETTE.island), a = s.floor.albedo;
    assert.ok(Math.abs(lumaOf(a) - ALBEDO.island) < 1e-6, `${tier}: the island's albedo ${lumaOf(a)} is not the table's ${ALBEDO.island}`);
    assert.ok(Math.abs(a[0] / a[1] - want.r / want.g) < 1e-6 && Math.abs(a[2] / a[1] - want.b / want.g) < 1e-6, `${tier}: the island's hue left the palette`);
  }
});

// ---- 3b. the albedo law (CONTRACT 15.2): the MEAN of every colour the shell lays lands on the layout's table ---------------
const lin8 = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const canvasMean = (cv) => { const d = cv.image.data; let s = 0; for (let i = 0; i < d.length; i += 4) s += lin8(d[i]); return s / (d.length / 4); };
/** The area-weighted mean luminance of a mesh's vertex colours over the triangles `keep(centroid)` accepts. */
function vertexMean(mesh, keep = () => true) {
  const g = mesh.geometry, pos = g.attributes.position, col = g.attributes.color, ix = g.index;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  let area = 0, sum = 0;
  for (let i = 0; i < ix.count; i += 3) {
    const [a, b, c] = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)];
    A.fromBufferAttribute(pos, a); B.fromBufferAttribute(pos, b); C.fromBufferAttribute(pos, c);
    const cen = [(A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3, (A.z + B.z + C.z) / 3];
    if (!keep(cen)) continue;
    const ar = B.sub(A).cross(C.sub(A)).length() / 2;
    const l = [a, b, c].reduce((s, k) => s + lumaOf([col.getX(k), col.getY(k), col.getZ(k)]), 0) / 3;
    area += ar; sum += ar * l;
  }
  return { area, mean: area ? sum / area : 0 };
}

ok('albedo law: the carpets, the drape and the backdrop state the table\'s values; the levels of HALL are the table itself', () => {
  assert.deepEqual([HALL.island, HALL.carpet, HALL.drape, HALL.backdrop], [ALBEDO.island, ALBEDO.carpet, ALBEDO.drape, ALBEDO.backdrop]);
  assert.deepEqual([ALBEDO.island, ALBEDO.carpet, ALBEDO.drape, ALBEDO.backdrop], [0.13, 0.10, 0.035, 0.18], 'CONTRACT 15.2');
  for (const [tier, b] of Object.entries(built)) {
    const al = b.shell.albedos(), st = b.shell.state().albedo;
    assert.deepEqual(al, st);
    for (const k of ['island', 'carpet', 'drape', 'backdrop']) assert.ok(Math.abs(al[k] - ALBEDO[k]) < 2e-5, `${tier}: ${k} states ${al[k]}, the table says ${ALBEDO[k]}`);
    // the painted fold shade only takes light away, and not most of it
    assert.ok(al.drapePaint < al.drape && al.drapePaint > 0.5 * al.drape, `${tier}: the drape's paint mean ${al.drapePaint} against its cloth ${al.drape}`);
    // the edging profile: an aluminium ramp edge (round A4), a matt stand-in at 0.45
    assert.ok(Math.abs(al.trim - HALL.trim) < 1e-4 && HALL.trim > 0.3 && HALL.trim <= 0.5);
  }
});

ok('albedo law, measured: vertex colours x the canvases\' own means (carpet island and outer, backdrop), the drape\'s painted mean', () => {
  if (hadDocument) return;
  const isl = shellPlan(ARENA, 1).island;
  const inIsland = (c) => c[0] > isl.x0 && c[0] < isl.x1 && c[2] > isl.z0 && c[2] < isl.z1;
  const out = [];
  for (const [tier, b] of Object.entries(built)) {
    const s = b.shell, d = TIERS[tier].roomDetail;
    // the carpet: the canvas the shell drew for this tier (measured) x the floor's vertex colours, by region
    const cm = canvasMean(TEX.carpetColor(PILE.px[d], PILE.loops[d]));
    assert.ok(Math.abs(cm - TEX.CARPET_MEAN) < 0.004, `${tier}: carpet canvas mean ${cm}`);
    const e = d === 0 ? PLAN.carpet.trim.width / 2 + PLAN.carpet.trim.foot : 0;       // (lite: leave the dark band on the joint out of both regions)
    const vi = vertexMean(s.meshes.floor, (c) => inIsland(c) && Math.min(c[0] - isl.x0, isl.x1 - c[0], c[2] - isl.z0, isl.z1 - c[2]) > e - 1e-6);
    const vo = vertexMean(s.meshes.floor, (c) => !inIsland(c) && Math.max(isl.x0 - c[0], c[0] - isl.x1, isl.z0 - c[2], c[2] - isl.z1) > e - 1e-6);
    const island = vi.mean * cm, outer = vo.mean * cm;
    assert.ok(Math.abs(island - ALBEDO.island) < 0.005 * ALBEDO.island + 0.0007, `${tier}: the island's carpet measures ${island}`);
    assert.ok(Math.abs(outer - ALBEDO.carpet) < 0.005 * ALBEDO.carpet + 0.0007, `${tier}: the outer carpet measures ${outer}`);
    assert.ok(Math.abs(vi.area - (isl.x1 - isl.x0 - 2 * e) * (isl.z1 - isl.z0 - 2 * e)) < 1e-3, `${tier}: the island's carpet covers ${vi.area} m2`);
    // the backdrop: its canvas (measured, at this tier's size) x its one vertex colour
    const bd = ARENA.backdrop, p = s.plan, px = d === 0 ? [512, 256] : d === 1 ? [1024, 512] : [2048, 1024];
    const bm = canvasMean(TEX.backdropColor(px[0], px[1], { length: bd.z1 - bd.z0, height: bd.height, modules: p.backdrop.modules, rails: p.backdrop.rails, lights: p.lights.map((u) => ({ s: bd.z1 - u.z })), light: p.light }));
    assert.ok(Math.abs(bm - TEX.BACKDROP_MEAN) < 0.003, `${tier}: backdrop canvas mean ${bm}`);
    // (round A7: with a pelmet the stretched cloth is the part of the mesh ON the backdrop's plane; the pelmet, a
    // hand proud of it, is black serge: the drape's albedo)
    const backdrop = vertexMean(s.meshes.backdrop, (c) => c[0] < bd.x + 0.01).mean * bm;
    assert.ok(Math.abs(backdrop - ALBEDO.backdrop) < 0.01 * ALBEDO.backdrop, `${tier}: the backdrop measures ${backdrop}`);
    if (p.backdrop.pelmet) {
      const pel = vertexMean(s.meshes.backdrop, (c) => c[0] > bd.x + 0.01);
      assert.ok(Math.abs(pel.mean * bm - ALBEDO.drape) < 0.06 * ALBEDO.drape, `${tier}: the pelmet measures ${pel.mean * bm} (black serge: ${ALBEDO.drape})`);
      assert.ok(Math.abs(pel.area - (bd.z1 - bd.z0) * (bd.height - p.backdrop.pelmet.hem)) < 1e-3, `${tier}: the pelmet covers ${pel.area} m2`);
    }
    // the drape: what its vertex colours hold (cloth x painted fold shade), against the stated paint mean
    // (lite, round A5: flat cloth; the fold shade is in its map, the vertex colours hold the cloth x the map's scale:
    // the paint is the vertex mean x the map's mean, each wall's row weighted alike, to a few per cent)
    const al = s.albedos();
    const dp = d === 0 ? vertexMean(s.meshes.drape).mean * canvasMean(s.materials.drape.map.image) : vertexMean(s.meshes.drape).mean;
    assert.ok(Math.abs(dp - al.drapePaint) < (d === 0 ? 0.06 : 0.03) * al.drapePaint, `${tier}: the drape's vertex colours measure ${dp}, stated ${al.drapePaint}`);
    out.push(`${tier}: island ${island.toFixed(4)} outer ${outer.toFixed(4)} backdrop ${backdrop.toFixed(4)} drape cloth ${al.drape.toFixed(4)} (painted ${dp.toFixed(4)})`);
  }
  console.log(`   albedo means: ${out.join(' | ')}`);
});

ok('albedo law under a scan: the material colour takes the scan\'s mean out exactly; the contrast law keeps the mean', () => {
  const s = built.high.shell, fm = s.meshes.floor, col = fm.geometry.attributes.color;
  const vIsland = [col.getX(0), col.getY(0), col.getZ(0)];                 // (the first quad is the island)
  for (const mean of [[0.4413, 0.4413, 0.4413], [0.52, 0.44, 0.39], [0.08, 0.09, 0.12], [0.9, 0.88, 0.8]]) {
    const sc = scanColour(mean, vIsland, ALBEDO.island);
    assert.ok(Math.abs(lumaOf(vIsland.map((v, i) => v * sc.product[i])) - ALBEDO.island) < 1e-9, `scan mean ${mean}: the island lands on ${lumaOf(vIsland.map((v, i) => v * sc.product[i]))}`);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(sc.product[i] - mean[i] * sc.color[i]) < 1e-12);
    // the outer carpet (another hue of the palette) under the same material colour stays within half a per cent
    const vOuter = (() => { const want = new THREE.Color(PALETTE.carpet), k = ALBEDO.carpet / TEX.CARPET_MEAN / lumaOf([want.r, want.g, want.b]); return [want.r * k, want.g * k, want.b * k]; })();
    assert.ok(Math.abs(lumaOf(vOuter.map((v, i) => v * sc.product[i])) - ALBEDO.carpet) < 0.005 * ALBEDO.carpet, `scan mean ${mean}: the outer carpet lands on ${lumaOf(vOuter.map((v, i) => v * sc.product[i]))}`);
    // half of the scan's tint stays, never more
    assert.ok(Math.abs(sc.product[0] / sc.product[1] - 1) <= Math.abs(mean[0] / mean[1] - 1) + 1e-9);
  }
  // the contrast law: a speckled field (5 % dark specks at a fifth of the mean, light fibres)
  const lum = Float32Array.from({ length: 4096 }, (_, i) => (TEX.hash2(i, 3, 77) < 0.05 ? 0.09 : 0.42 + 0.1 * TEX.hash2(i, 5, 78)));
  const id = TEX.scanTransfer(lum, 1, 1);
  assert.ok(Math.abs(id.norm - 1) < 1e-6 && Math.abs(id.spread - id.spreadOut) < 1e-6, 'the identity moves something');
  const tr = TEX.scanTransfer(lum, GLSL.CARPET.conLow, GLSL.CARPET.conHigh);
  let m = 0; for (const l of lum) { const r = l / tr.mean; m += tr.mean * (1 + (r - 1) * (r < 1 ? GLSL.CARPET.conLow : GLSL.CARPET.conHigh)) * tr.norm; }
  assert.ok(Math.abs(m / lum.length - tr.mean) < 1e-6 * tr.mean, `the law moved the mean: ${m / lum.length} against ${tr.mean}`);
  assert.ok(tr.spreadOut < 0.6 * tr.spread && tr.norm < 1 && tr.norm > 0.9, `spread ${tr.spread} -> ${tr.spreadOut}, norm ${tr.norm}`);
  assert.ok(GLSL.CARPET.conLow > 0 && GLSL.CARPET.conLow < GLSL.CARPET.conHigh && GLSL.CARPET.conHigh <= 1);
});

// (the floor role's plan, read only: where its furniture stands; without it the furniture clearance is not checked)
let floorPlan = null;
try { floorPlan = await import('../../scene/club/arena/floor/plan.js'); if (typeof floorPlan.planFloor !== 'function') floorPlan = null; } catch { floorPlan = null; }
if (!floorPlan) console.log('   note: arena/floor/plan.js planFloor() not readable: the furniture clearance of the island\'s joint is NOT checked');

const edgeNotes = new Set();
ok('island edge: the play carpet ends inside the boards\' line; an edging profile stands on the joint all the way round, clear of the cable runs', () => {
  const tr = PLAN.carpet.trim, ins = PLAN.carpet.inset;
  for (const [tier, b] of Object.entries(built)) {
    const s = b.shell, isl = s.plan.island, ring = s.plan.ring;
    assert.deepEqual(ring, { x0: ARENA.island.x0, x1: ARENA.island.x1, z0: ARENA.island.z0, z1: ARENA.island.z1 });
    for (const [k, sign] of [['x0', 1], ['x1', -1], ['z0', 1], ['z1', -1]]) assert.ok(Math.abs(isl[k] - (ring[k] + sign * ins)) < 1e-9);
    // between the joint's profile and the boards' line a strip of the hall's carpet shows, and the profile lies clear of
    // the boards' feet (they reach footDepth / 2 inside the line)
    assert.ok(ins - tr.width / 2 >= ARENA.boards.footDepth / 2 + 0.015 && ins <= 0.4, `the joint is ${ins} m inside the board line`);
    // the profile: every matt vertex between the floor and the profile's top, near the floor, lies on the joint's band
    const pos = s.meshes.matt.geometry.attributes.position, nor = s.meshes.matt.geometry.attributes.normal;
    let n = 0, top = 0; const seen = { n: 0, s: 0, e: 0, w: 0 };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) - F, z = pos.getZ(i);
      const inside = x > ring.x0 && x < ring.x1 && z > ring.z0 && z < ring.z1;
      if (!inside || y > 0.05) continue;
      n += 1; top = Math.max(top, y);
      const d = Math.max(isl.x0 - x, x - isl.x1, isl.z0 - z, z - isl.z1);     // signed distance to the joint (outside positive)
      assert.ok(Math.abs(d) <= tr.width / 2 + 1e-6, `${tier}: a low matt vertex ${d} m off the joint`);
      assert.ok(y > 0 && y <= tr.height + 1e-6 && nor.getY(i) > 0.5, `${tier}: profile vertex at h ${y}, normal y ${nor.getY(i)}`);
      if (Math.abs(z - isl.z0) < tr.width) seen.n += 1; if (Math.abs(z - isl.z1) < tr.width) seen.s += 1;
      if (Math.abs(x - isl.x1) < tr.width) seen.e += 1; if (Math.abs(x - isl.x0) < tr.width) seen.w += 1;
    }
    assert.ok(Math.abs(top - tr.height) < 1e-6 && n >= 4 * 12, `${tier}: ${n} profile vertices, top at ${top}`);
    assert.ok(seen.n >= 12 && seen.s >= 12 && seen.e >= 12 && seen.w >= 12, `${tier}: a side of the joint has no profile (${JSON.stringify(seen)})`);
    // the taped cable runs inside the boards (the floor role's, layout.floor.cables) do not lie on the joint
    const half = (ARENA.floor.cableWidth ?? 0.1) / 2;
    for (const c of ARENA.floor.cables) for (let k = 0; k + 1 < c.path.length; k++) {
      const [ax, az] = c.path[k], [bx, bz] = c.path[k + 1];
      // a run ALONG a side of the joint must keep clear of it; a run that crosses it (out through a walk-in) may
      const along = (ax === bx && Math.min(Math.abs(ax - isl.x0), Math.abs(ax - isl.x1)) < tr.width / 2 + half + 0.01 && Math.max(az, bz) > isl.z0 && Math.min(az, bz) < isl.z1)
        || (az === bz && Math.min(Math.abs(az - isl.z0), Math.abs(az - isl.z1)) < tr.width / 2 + half + 0.01 && Math.max(ax, bx) > isl.x0 && Math.min(ax, bx) < isl.x1);
      assert.ok(!along, `${tier}: cable ${c.id} segment ${k} runs along the joint`);
    }
    // nothing the floor part stands inside the boards (chairs, side tables, the desk) stands on the joint's profile
    if (floorPlan) {
      const fp = floorPlan.planFloor(ARENA, TIERS[tier].roomDetail);
      for (const it of fp.items ?? []) {
        const bx = it.box; if (!bx || it.kind === 'threshold' || it.kind === 'cable') continue;
        if (!(bx.x1 > ring.x0 && bx.x0 < ring.x1 && bx.z1 > ring.z0 && bx.z0 < ring.z1)) continue;
        const clear = Math.min(bx.x0 - ring.x0, ring.x1 - bx.x1, bx.z0 - ring.z0, ring.z1 - bx.z1) - (ins + tr.width / 2);
        // Round A4: the plain rule for everything, the desk's cloth included (its planned box holds the hem that lies
        // on the carpet). In round A3 the hem's two back corners lay 44 mm over the profile; the desk moved 7 cm toward
        // the table at 06:13Z (scratch/shell/NEED-FROM-floor.md: nothing stands or lies nearer the boards than the
        // 0.370 m line, the profile's contact shade included).
        // (round A5: the floor role's low camera stands exactly 1.5 cm clear: the line itself counts, to a micrometre)
        assert.ok(clear >= 0.015 - 1e-6, `${tier}: ${it.kind} ${it.id} stands ${clear.toFixed(4)} m from the joint's profile (1.5 cm at least)`);
        if (it.kind === 'desk') edgeNotes.add(`the desk's cloth hem lies ${(clear * 1000).toFixed(0)} mm clear of the joint's profile`);
      }
    }
    // the carpet patch draws the contact shade on the same line
    if (tier !== 'lite') { assert.deepEqual(s.uniforms.uArenaIsl.value, [isl.x0, isl.z0, isl.x1, isl.z1]); assert.ok(Math.abs(s.uniforms.uArenaRoll.value[3] - (tr.width / 2 + tr.foot)) < 1e-12); }
  }
  for (const n of edgeNotes) console.log(`   note: ${n}`);
});

ok('drape: the base tier hangs the high tier\'s folds (one pleat list: the full light map is baked on detail 2 and holds light at the scale of a pleat)', () => {
  const p1 = shellPlan(ARENA, 1), p2 = shellPlan(ARENA, 2);
  assert.deepEqual(p1.pleats, p2.pleats, 'the base tier\'s pleats are not the high tier\'s');
  // the same folds at the same heights (a fold wanders on its way up: the bands are part of where it stands); the base
  // tier saves in columns only
  assert.ok(PLEATS[1].steps < PLEATS[2].steps && PLEATS[1].bands === PLEATS[2].bands && PLEATS[1].steps >= 2 && PLEATS[1].hem === PLEATS[2].hem, 'the base tier saves in columns only');
  const t = (tier) => built[tier].shell.meshes.drape.geometry.index.count / 3;
  assert.ok(Math.abs(t('base') / t('high') - PLEATS[1].steps / PLEATS[2].steps) < 0.01, `drape triangles base ${t('base')}, high ${t('high')}`);
  // a base ridge stands where the high tier's ridge stands, on every band: the ridge vertices of the two meshes coincide
  const ridges = (tier) => { const g = built[tier].shell.meshes.drape.geometry, pos = g.attributes.position, side = g.attributes.roomSide; const s = new Set(); for (let i = 0; i < pos.count; i++) if (side.getX(i) === 0.25) s.add(`${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`); return s; };
  const rb = ridges('base'), rh = ridges('high');
  let shared = 0; for (const k of rb) if (rh.has(k)) shared += 1;
  // (to the millimetre; a handful round the other way at the third decimal)
  assert.ok(rb.size > 500 && shared >= 0.99 * rb.size, `${shared} of the base tier's ${rb.size} valley vertices lie on the high tier's valleys`);
  console.log(`   drape: base ${t('base')} triangles, high ${t('high')}; ${shared} of ${rb.size} base valley vertices on the high tier's`);
  console.log(`   drape triangles: base ${t('base')}, high ${t('high')}`);
  // the lite tier (round A5): FLAT cloth that carries the same pleat list as a map along each wall (round A4: wide
  // pleats of its own, which read as flat panels and stood 13 levels over the high tier's wall)
  const p0 = shellPlan(ARENA, 0);
  assert.deepEqual(p0.pleats, p2.pleats, 'the lite tier\'s fold list is not the high tier\'s');
  assert.ok(PLEATS[0].flat === true && !PLEATS[1].flat && !PLEATS[2].flat);
  const lite = built.lite.shell, lg = lite.meshes.drape.geometry, lpos = lg.attributes.position, luv = lg.attributes.uv;
  // one quad per stretch of cloth: a wall's runs between its door bays, and the header over each bay
  const quads = p0.walls.reduce((n, w) => n + 1 + 2 * w.gaps.length, 0);
  assert.equal(lg.index.count / 6, quads, `lite: ${lg.index.count / 6} drape quads for ${quads} stretches`);
  assert.ok(lite.materials.drape.map && lite.materials.drape.map.name === 'arena.hall.drape.folds' && !built.base.shell.materials.drape.map && !built.high.shell.materials.drape.map, 'the fold map is the lite tier\'s alone');
  assert.equal(lite.materials.drape.map.generateMipmaps, false);
  // the bake does not read the map: the lite drape names its bounce albedo itself, the cloth's painted mean; the
  // full tiers hold the paint in their vertex colours and name nothing
  const ba = lite.materials.drape.userData.bakeAlbedo;
  assert.ok(Array.isArray(ba) && ba.length === 3 && Math.abs(lumaOf(ba) - lite.albedos().drapePaint) < 2e-5, `lite: the drape's bake albedo ${ba} against its painted mean ${lite.albedos().drapePaint}`);
  assert.ok(!built.base.shell.materials.drape.userData.bakeAlbedo && !built.high.shell.materials.drape.userData.bakeAlbedo);
  // every vertex reads its own wall's row of the map, on the line between the row's two pixel rows
  const chart = lg.userData.lm.chart;
  for (let i = 0; i < lpos.count; i++) {
    assert.ok(Math.abs(luv.getY(i) - (chart[i] - 2 + 0.5) / 4) < 1e-6 && luv.getX(i) >= -1e-6 && luv.getX(i) <= 1 + 1e-6, `lite: drape vertex ${i} reads (${luv.getX(i)}, ${luv.getY(i)}) on chart ${chart[i]}`);
  }
  // the map's rows are the fold shade of the high tier's list: a ridge's tone over a valley's shade, laps near black
  const row = foldRow(p2.pleats.north, p2.walls[0].L, 1024);
  let lo = 1, hi = 0; for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(lo < 0.15 && hi > 0.9 && hi <= TEX.FOLD_MAP_SCALE, `the fold row spans ${lo.toFixed(3)}..${hi.toFixed(3)}`);
});

ok('lite drape, round A7: the fold map\'s toe lifts the valleys out of the black, holds every row\'s mean and the order of its texels', () => {
  const p0 = planOf(0), K = TEX.FOLD_TOE;
  assert.ok((K.on === 0 || K.on === 1) && K.lift >= 0.3 && K.lift <= 0.8, `FOLD_TOE ${JSON.stringify(K)}`);
  const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
  const all0 = [], all1 = [];
  for (const w of p0.walls) {
    const row = foldRow(p0.pleats[w.id], w.L, 1024).map((v) => Math.min(1, v / TEX.FOLD_MAP_SCALE));
    const toe = TEX.foldToe(row);
    const mean = (r) => r.reduce((a, b) => a + b, 0) / r.length;
    // the paint's mean is held (the albedo law's sum and the lite bake's bounce albedo do not see the toe)
    assert.ok(Math.abs(mean(toe) - mean(row)) < 2e-6, `${w.id}: the row's mean ${mean(row)} became ${mean(toe)}`);
    let lo0 = 1, lo1 = 1, hi0 = 0, hi1 = 0;
    for (let i = 0; i < row.length; i++) { lo0 = Math.min(lo0, row[i]); lo1 = Math.min(lo1, toe[i]); hi0 = Math.max(hi0, row[i]); hi1 = Math.max(hi1, toe[i]); all0.push(row[i]); all1.push(toe[i]); }
    // a valley rises, no ridge does (it ends within a tenth under where it was)
    assert.ok(lo1 > 2.5 * lo0 && hi1 < hi0 && hi1 > 0.9 * hi0, `${w.id}: ${lo0.toFixed(3)}..${hi0.toFixed(3)} became ${lo1.toFixed(3)}..${hi1.toFixed(3)}`);
    // the order of any two texels is kept (the folds stand where they stood: sorted by the row, the toe's values never fall)
    const idx = Array.from(row.keys()).sort((a, b) => row[a] - row[b]);
    for (let k = 1; k < idx.length; k++) assert.ok(toe[idx[k]] >= toe[idx[k - 1]] - 1e-7, `${w.id}: texels ${idx[k - 1]} and ${idx[k]} changed their order`);
    // lift 0 is the row itself
    const same = TEX.foldToe(row, 0);
    for (let i = 0; i < row.length; i += 37) assert.ok(Math.abs(same[i] - row[i]) < 1e-7);
  }
  all0.sort((a, b) => a - b); all1.sort((a, b) => a - b);
  const r0 = pct(all0, 0.1) / pct(all0, 0.9), r1 = pct(all1, 0.1) / pct(all1, 0.9);
  const under = (a) => a.filter((v) => v < 0.36 * pct(a, 0.9)).length / a.length;
  // measured at V10 under the A6b map: the base tier's drape p10 / p90 = 0.64 (7 / 11), lite 0.45 (5 / 11); a ridge at
  // level 11 puts every texel under 0.36 x p90 at or under level 4
  assert.ok(r0 < 0.45 && r1 > 0.55 && r1 < 0.70, `p10 / p90 ${r0.toFixed(3)} without the toe, ${r1.toFixed(3)} with it`);
  assert.ok(under(all0) > 0.04 && under(all1) === 0, `texels under 0.36 x p90: ${under(all0)} without, ${under(all1)} with the toe`);
  console.log(`   lite fold map: p10 / p90 ${r0.toFixed(3)} -> ${r1.toFixed(3)} under the toe (lift ${K.lift}, ${K.on ? 'ON' : 'off'}); texels under 0.36 x p90: ${(100 * under(all0)).toFixed(1)} % -> ${(100 * under(all1)).toFixed(1)} %`);
  // what the tree ships: the map's pixels are the toe's row when it is on, the plain row when it is off
  const row = foldRow(p0.pleats.north, p0.walls[0].L, 1024).map((v) => Math.min(1, v / TEX.FOLD_MAP_SCALE));
  const want = K.on > 0 ? TEX.foldToe(row) : row;
  const s8 = (l) => Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055));
  const cv = TEX.foldsMap([row]);
  for (let x = 0; x < 1024; x += 13) assert.equal(cv.image.data[4 * x], s8(want[x]), `the map's texel ${x}`);
});

ok('hall: five draw calls, named materials, every vertex inside the hall, no NaN; triangles per detail', () => {
  const tri = {};
  for (const [tier, b] of Object.entries(built)) {
    const s = b.shell;
    // (round A6: with the level `roofChart` the roof's lid is a sixth mesh on the light map)
    const lid = LV.roofChart > 0;
    assert.deepEqual(Object.values(s.meshes).map((m) => m.name), ['arenaHallCarpet', 'arenaHallDrape', 'arenaHallMatt', 'arenaHallBackdrop', 'arenaHallWashLenses', ...(lid ? ['arenaHallRoof'] : [])]);
    assert.deepEqual(Object.values(s.materials).map((m) => m.name), ['arena.hall.carpet', 'arena.hall.drape', 'arena.hall.matt', 'arena.hall.backdrop', 'arena.hall.washlens', ...(lid ? ['arena.hall.roof'] : [])]);
    for (const m of Object.values(s.meshes)) {
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal;
      for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]) && Number.isFinite(nor.array[i]), `${tier}: ${m.name} has a NaN`);
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox, e = 1e-6;
      // (round A6: the exit doors' deeper reveal is a lobby that stands INTO the hall; the hall's own arm pins every
      // mesh inside the hall's box, and so does this one)
      assert.ok(bb.min.x >= ARENA.hall.x0 - e && bb.max.x <= ARENA.hall.x1 + e && bb.min.z >= ARENA.hall.z0 - e && bb.max.z <= ARENA.hall.z1 + e && bb.min.y >= F - e && bb.max.y <= F + ARENA.hall.height + e,
        `${tier}: ${m.name} leaves the hall (${bb.min.toArray().map((v) => v.toFixed(3))} .. ${bb.max.toArray().map((v) => v.toFixed(3))})`);
      for (let i = 0; i < nor.count; i++) { const l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)); assert.ok(Math.abs(l - 1) < 1e-3, `${tier}: ${m.name} normal ${i} has length ${l}`); }
    }
    tri[tier] = s.counts().triangles;
    assert.equal(s.counts().meshes, lid ? 6 : 5);
    // nothing but the carpet is where the app's camera can be (the exact reach, vertex by vertex: the drape stands on the
    // walls beyond it, the ducts and the lid over it, the floor lights under it beyond the boards)
    const v = ARENA.keepOut.cameraVolume, bb = s.meshes.backdrop.geometry.boundingBox;
    assert.ok(bb.max.x < v.x0, `${tier}: the backdrop reaches into the camera volume`);
    for (const key of ['drape', 'matt', 'backdrop', 'lenses']) {
      const pos = s.meshes[key].geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) assert.ok(!inCameraVolume(pos.getX(i), pos.getY(i) - F, pos.getZ(i)), `${tier}: ${key} vertex ${i} (${pos.getX(i).toFixed(2)}, ${(pos.getY(i) - F).toFixed(2)}, ${pos.getZ(i).toFixed(2)}) is where the camera can be`);
    }
  }
  assert.ok(tri.lite < 700 && tri.lite < tri.base && tri.base < tri.high && tri.high < 12000, `triangles lite ${tri.lite}, base ${tri.base}, high ${tri.high}`);
  // round A4's budget: the base tier's new geometry (doors, rail, trays, beams) fits inside what the round freed
  // (the door bays' cloth): never more than round A3's 5,612; the lite tier never more than its 630
  assert.ok(tri.base <= 5612 && tri.lite <= 630, `the base shell has ${tri.base} triangles (round A3: 5,612), lite ${tri.lite} (630)`);
  console.log(`   shell triangles: lite ${tri.lite}, base ${tri.base}, high ${tri.high}`);
});

// ---- 3c. round A4: the exit doors, the pipe-and-base rail, the roof's trays and beams, the backdrop's light ---------------
/** A wall's frame as ../shell.js walks it: a point's distance along the wall's tangent and out of the wall. */
const wallFrame = (w) => {
  const tan = [w.a[1], -w.a[0]];                               // cross(up, a) = (a_z, 0, -a_x) for the inward normal a = (a_x, 0, a_z)
  return { s: (x, z) => (x - w.o[0]) * tan[0] + (z - w.o[1]) * tan[1], d: (x, z) => (x - w.o[0]) * w.a[0] + (z - w.o[1]) * w.a[1] };
};

// (round A7: what says "door", the pelmet, folds that are never painted closed)
ok('round A7: a door pair in a frame with kick plates and a slot of light; a pelmet of black serge on the backdrop\'s chart; no fold painted closed', () => {
  // the options are dark by default: the plan without them is round A6's
  const p0 = shellPlan(ARENA, 2, { doorBack: 0.9, roofChart: true, washAim: 8 });
  assert.ok(!p0.doors.kit && !p0.backdrop.pelmet, 'the kit or the pelmet is in the plan without its option');
  const pk = shellPlan(ARENA, 2, { doorBack: 0.9, roofChart: true, washAim: 8, doorKit: true, pelmet: true, foldOpen: true });
  assert.deepEqual(pk.doors.kit, DOOR_KIT); assert.deepEqual(pk.backdrop.pelmet, PELMET);
  assert.notEqual(shellSignature(pk), shellSignature(p0), 'the kit and the pelmet are geometry: the signature moves');
  // the fold law is paint: the same folds, the same signature; no valley under 0.2, an open fold's never under 0.41
  const pf = shellPlan(ARENA, 2, { doorBack: 0.9, roofChart: true, washAim: 8, foldOpen: true });
  assert.equal(shellSignature(pf), shellSignature(p0), 'the open-fold law moved the signature');
  for (const w of pf.walls) {
    const a = p0.pleats[w.id], b = pf.pleats[w.id];
    assert.equal(a.length, b.length);
    b.forEach((q, i) => {
      assert.ok(q.s === a[i].s && q.w === a[i].w && q.A === a[i].A && q.tone === a[i].tone, `${w.id}: fold ${i} moved under the open-fold law`);
      const groove = (0.5 * q.w) / Math.hypot(0.5 * q.w, q.A), lapped = i > 0 && a[i - 1].join;
      assert.ok(q.valley >= a[i].valley - 1e-9 && q.valley <= 1 && q.valley >= (lapped ? 0.5 : 1) * groove - 1e-3, `${w.id}: fold ${i} valley ${q.valley} (was ${a[i].valley}; its mouth ${groove.toFixed(3)})`);
      assert.ok(q.valley >= (lapped ? 0.2 : 0.41), `${w.id}: fold ${i} is painted closed (${q.valley})`);
    });
  }
  assert.ok(DOOR_KIT.frame >= 0.04 && DOOR_KIT.frame <= 0.1 && DOOR_KIT.gap[1] - DOOR_KIT.gap[0] >= 0.003 && DOOR_KIT.gap[1] - DOOR_KIT.gap[0] <= 0.02 && DOOR_KIT.kick[1] <= 0.4);
  assert.ok(PELMET.hem > ARENA.backdrop.scoreboard.centerH + ARENA.backdrop.scoreboard.height / 2 + 0.1 && PELMET.hem < ARENA.backdrop.height - 1 && PELMET.proud >= 0.14 && PELMET.proud <= 0.3, 'the pelmet hangs over the scoreboard and clear of its cabinet');
  for (const [tier, b] of Object.entries(built)) {
    const s = b.shell, p = s.plan, bd = ARENA.backdrop;
    assert.equal(!!p.doors.kit, LV.doorKit > 0); assert.equal(!!p.backdrop.pelmet, LV.pelmet > 0);
    // the backdrop's mesh: the cloth on its plane up to the hem, the pelmet proud of it from the hem to the top; both
    // on the backdrop's chart (chart 1), no texel twice (the two parts meet at the hem's height)
    const g = s.meshes.backdrop.geometry, pos = g.attributes.position, lm = g.userData.lm;
    let clothTop = -1, pelLow = 1e9, pelN = 0;
    for (let i = 0; i < pos.count; i++) {
      assert.equal(lm.chart[i], 1, `${tier}: a backdrop vertex is off the backdrop's chart`);
      const h = pos.getY(i) - F, proud = pos.getX(i) - bd.x;
      if (proud < 1e-6) clothTop = Math.max(clothTop, h); else { pelN += 1; pelLow = Math.min(pelLow, h); assert.ok(Math.abs(proud - PELMET.proud) < 1e-6 && h <= bd.height + 1e-6); }
    }
    if (p.backdrop.pelmet) assert.ok(pelN >= 4 && Math.abs(clothTop - PELMET.hem) < 1e-6 && Math.abs(pelLow - PELMET.hem) < 1e-6, `${tier}: the cloth ends at ${clothTop}, the pelmet's hem hangs at ${pelLow}`);
    else assert.ok(pelN === 0 && Math.abs(clothTop - bd.height) < 1e-6, `${tier}: the cloth ends at ${clothTop} without a pelmet`);
    if (!p.doors.kit) continue;
    // the kit, per door: a frame (two jambs and a head) and two kick plates in the matt mesh, proud of the leaves, each
    // lighter than the leaf beside it and far under white; on base and high the slot of light is the kit's height
    const mp = s.meshes.matt.geometry.attributes.position, mc = s.meshes.matt.geometry.attributes.color;
    for (const w of p.walls) {
      const fr = wallFrame(w);
      for (const q of w.doors) {
        let frame = 0, kick = 0, fMin = 1, fMax = 0, kMin = 1, kMax = 0;
        for (let i = 0; i < mp.count; i++) {
          const at = fr.s(mp.getX(i), mp.getZ(i)), d = fr.d(mp.getX(i), mp.getZ(i)), h = mp.getY(i) - F, l = lumaOf([mc.getX(i), mc.getY(i), mc.getZ(i)]);
          if (Math.abs(at - q.s) > PLAN.doors.width / 2 + 1e-4 || h > PLAN.doors.height + 1e-4) continue;
          if (Math.abs(d - (PLAN.doors.leaf + DOOR_KIT.proud)) < 1e-5) { frame += 1; fMin = Math.min(fMin, l); fMax = Math.max(fMax, l); }
          if (Math.abs(d - (PLAN.doors.leaf + DOOR_KIT.kickProud)) < 1e-5 && h > 0.01 && h < DOOR_KIT.kick[1] + 1e-5) { kick += 1; kMin = Math.min(kMin, l); kMax = Math.max(kMax, l); }
        }
        assert.equal(frame, 12, `${tier}: the ${w.id} door's frame has ${frame} vertices`); assert.equal(kick, 8, `${tier}: the ${w.id} door's kick plates have ${kick} vertices`);
        assert.ok(fMin > 0.22 * 0.25 && fMax < 0.22 * 0.75 && kMin > 0.20 * 0.25 && kMax < 0.20 * 0.75, `${tier}: frame ${fMin.toFixed(3)}..${fMax.toFixed(3)}, kick plates ${kMin.toFixed(3)}..${kMax.toFixed(3)}`);
      }
    }
  }
  const t = Object.fromEntries(Object.entries(built).map(([k, b]) => [k, b.shell.counts().triangles]));
  console.log(`   round A7: kit ${LV.doorKit > 0 ? 'on' : 'off'}, pelmet ${LV.pelmet > 0 ? 'on' : 'off'}, open folds ${LV.foldOpen > 0 ? 'on' : 'off'}; drape paint mean ${built.high.shell.albedos().drapeShade.paint} (high), ${built.lite.shell.albedos().drapeShade.paint} (lite); triangles ${t.lite} / ${t.base} / ${t.high}`);
});

ok('exit doors: four door bays in the hall\'s corners where the drape opens; a door pair and a plain green sign in each; a sign is no emitter', () => {
  const DR = PLAN.doors;
  for (const [tier, b] of Object.entries(built)) {
    const s = b.shell, p = s.plan;
    const doors = p.walls.flatMap((w) => w.doors.map((q) => [w.id, q.s]));
    assert.equal(doors.length, 4, `${tier}: ${doors.length} doors`);
    assert.deepEqual(p.walls.map((w) => w.doors.length), [0, 2, 0, 2], `${tier}: doors per wall (north, east, south, west)`);
    for (const w of p.walls) {
      const fr = wallFrame(w);
      // a door stands where a camera sees the wall's foot (no seating block, no backdrop in front), its bay inside the wall
      for (const q of w.doors) {
        assert.ok(w.foot.some(([a, c]) => q.s - DR.bay / 2 >= a && q.s + DR.bay / 2 <= c), `${tier}: the ${w.id} door at ${q.s} stands behind a block or the backdrop`);
        // round A5: the bay's wall is a pier built out into the hall, narrower than the bay (the rail's uprights stand
        // free beside it), with a flank of wall on either side of the opening, its top just under the header's hem
        assert.ok(DR.bay - 2 * DR.pier.inset - DR.width >= 2 * 0.15, 'the pier leaves no flank beside the opening');
        assert.ok(DR.pier.top < DR.header && DR.pier.top > DR.sign.at + DR.sign.h / 2 + 0.2 && DR.pier.depth - DR.leaf >= 0.2 && DR.pier.depth <= 0.4, 'the pier and its reveal');
      }
      assert.deepEqual(w.gaps, w.doors.map((q) => [+(q.s - DR.bay / 2).toFixed(4), +(q.s + DR.bay / 2).toFixed(4)]));
      // in a bay the cloth is a header: no drape vertex of this wall hangs there under the header's hem (a hand's
      // breadth of unevenness), and the header is there (the drape goes on over the door, up to the pipe)
      const g = s.meshes.drape.geometry, pos = g.attributes.position, chart = g.userData.lm.chart, ci = 2 + p.walls.indexOf(w);
      const over = w.gaps.map(() => 0);
      for (let i = 0; i < pos.count; i++) {
        if (chart[i] !== ci) continue;
        const at = fr.s(pos.getX(i), pos.getZ(i)), h = pos.getY(i) - F;
        w.gaps.forEach(([a, c], k) => {
          // (lite: flat cloth, the header is one quad whose corners stand ON the bay's edges at the header's hem)
          if (tier === 'lite' && (Math.abs(at - a) < 1e-3 || Math.abs(at - c) < 1e-3) && Math.abs(h - DR.header) < 1e-5) over[k] += 2;
          if (at <= a + 1e-3 || at >= c - 1e-3) return;
          assert.ok(h >= DR.header - 0.03, `${tier}: a drape vertex of the ${w.id} wall at ${at.toFixed(3)} hangs ${h.toFixed(3)} m over the floor in the door bay ${a}..${c}`);
          if (h > p.drape.height - 0.2) over[k] += 1;
        });
      }
      assert.ok(over.every((n) => n >= 3), `${tier}: a door bay of the ${w.id} wall has no header (${over})`);
      assert.ok(DR.header > DR.sign.at + DR.sign.h / 2 + 0.25 && DR.header < 0.5 * p.drape.height);
    }
    // the world places: the east pair behind the two camera corners, the west pair beside the backdrop's ends
    const world = s.layout.doors.map((q) => { const w = p.walls.find((x) => x.id === q.wall); return [q.wall, +(w.o[1] + q.s * (-w.a[0])).toFixed(3)]; });
    assert.deepEqual(world, [['east', -10.7], ['east', 10.7], ['west', 9.1], ['west', -9.1]], `${tier}: ${JSON.stringify(world)}`);
    for (const [, z] of world.slice(2)) assert.ok(Math.abs(z) - DR.bay / 2 > ARENA.backdrop.z1 + 0.5, 'a west door stands behind the backdrop');
    // the lens mesh: the wash bars' lenses and the four signs' faces, nothing else
    const lg = s.meshes.lenses.geometry, lp = lg.attributes.position, lc = lg.attributes.color, lu = lg.attributes.uv;
    // (round A5: on base and high a sign is three lit rectangles: its face, a hot band in the face, a window in the
    // box's underside; on lite the face alone)
    // (round A6: with a passage and `HALL.doorGap` on, base and high add the line of light under each door pair)
    const back = p.doors.back ?? 0, gapLines = tier !== 'lite' && back > 0 && LV.doorGap > 0 ? 4 : 0;
    assert.equal(lg.index.count / 6, p.lights.length + (tier === 'lite' ? 4 : 12) + gapLines, `${tier}: quads in the lens mesh`);
    assert.equal(s.materials.lens.vertexColors, true);
    const mat = s.materials.lens.color;                       // (the unlit material's colour: the wash's amber x the lens level)
    const seen = { face: 0, core: 0, down: 0 };
    let gapSeen = 0;
    for (let v = 0; v < lp.count; v += 4) {
      const ys = [0, 1, 2, 3].map((k) => lp.getY(v + k) - F), span = Math.max(...ys) - Math.min(...ys);
      if (Math.max(...ys) < 0.03) {
        // the line of light under a door pair: a slot a finger high at the leaves' foot (a hand in front of the east or
        // the west wall, at the end of the lobby), as wide as the door at the most; warm white (no green, no amber),
        // under the bloom threshold: a faint line, no source
        gapSeen += 1;
        const out = [lc.getX(v) * mat.r, lc.getY(v) * mat.g, lc.getZ(v) * mat.b];
        assert.ok(span > 0.004 && span < 0.02, `${tier}: the line under a door is ${span} m high`);
        assert.ok(lumaOf(out) > 0.05 && lumaOf(out) < 1.0 && out[0] >= out[1] && out[1] >= out[2] && out[2] > 0.4 * out[0], `${tier}: the line under a door shows ${out.map((x) => x.toFixed(3))}`);
        const xs = [0, 1, 2, 3].map((k) => lp.getX(v + k));
        assert.ok(Math.min(...xs) > ARENA.hall.x1 - 0.06 || Math.max(...xs) < ARENA.hall.x0 + 0.06, `${tier}: the line under a door is not at the leaves' foot`);
        continue;
      }
      if (lp.getY(v) - F < 1) { for (let k = 0; k < 4; k++) assert.deepEqual([lc.getX(v + k), lc.getY(v + k), lc.getZ(v + k)], [1, 1, 1], `${tier}: a wash lens is tinted`); continue; }
      const kind = span < 1e-5 ? 'down' : Math.abs(span - DR.sign.h) < 1e-5 ? 'face' : 'core';
      seen[kind] += 1;
      if (kind === 'face') assert.ok(Math.abs(Math.min(...ys) - (DR.sign.at - DR.sign.h / 2)) < 1e-5 && Math.abs(Math.max(...ys) - (DR.sign.at + DR.sign.h / 2)) < 1e-5, `${tier}: a sign's face spans ${Math.min(...ys)}..${Math.max(...ys)}`);
      if (kind === 'core') assert.ok(Math.abs(span - DR.sign.core[1]) < 1e-5 && DR.sign.core[1] < 0.3 * DR.sign.h && DR.sign.core[0] < DR.sign.w, `${tier}: a sign's hot band spans ${span}`);
      assert.ok(Math.min(...ys) > DR.height + 0.15 && Math.max(...ys) < DR.pier.top, 'the sign hangs on the pier over the opening\'s head');
      // a PLAIN rectangle: one texel of the lens map on all four corners (no cell pattern, no mark, no word)
      for (let k = 1; k < 4; k++) assert.ok(lu.getX(v + k) === lu.getX(v) && lu.getY(v + k) === lu.getY(v), `${tier}: a sign's face is not plain`);
      // its radiance (vertex colour x the material's colour): the sign's own green at the level of its kind
      const level = kind === 'face' ? HALL.sign : kind === 'core' ? HALL.signCore : HALL.signDown;
      const out = [lc.getX(v) * mat.r, lc.getY(v) * mat.g, lc.getZ(v) * mat.b];
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(out[k] - SIGN.color[k] * level) < 1e-4 * Math.max(1, level), `${tier}: a sign's ${kind} shows ${out.map((x) => x.toFixed(3))}`);
      assert.ok(out[1] > 8 * out[0] && out[1] > 2.5 * out[2], `${tier}: the sign is not green: ${out.map((x) => x.toFixed(3))}`);
      // the face stays under the tone curve's shoulder (a saturated green); the band and the window are sources
      // (CONTRACT 17.4): over the post chain's bloom threshold of 1.35 in luminance
      if (kind === 'face') assert.ok(out[1] < 1, `${tier}: the sign's face is over the shoulder`);
      else assert.ok(lumaOf(out) > 1.35, `${tier}: the sign's ${kind} is no source: luminance ${lumaOf(out)}`);
    }
    assert.deepEqual(seen, tier === 'lite' ? { face: 4, core: 0, down: 0 } : { face: 4, core: 4, down: 4 }, `${tier}: sign rectangles ${JSON.stringify(seen)}`);
    assert.equal(gapSeen, gapLines, `${tier}: ${gapSeen} lines of light under the doors`);
    // the recess (base and high): in each bay the pier's face stands `pier.depth` into the hall and the leaves stand
    // back in it at `leaf`; a leaf is the dark paint of the table (0.04) times what it sees of the hall, never lighter.
    // Round A6: with `doors.back` the pier is a door lobby that stands 0.30 m + `back` into the hall (the built plan's
    // `pier.depth`), the leaves at the end of it: a dark satin paint (0.035) times what a leaf sees of the hall from
    // the end of a reveal 1.17 m deep.
    if (tier !== 'lite') {
      const mp = s.meshes.matt.geometry.attributes.position, mc = s.meshes.matt.geometry.attributes.color;
      const PD = p.doors.pier.depth;
      assert.ok(Math.abs(PD - (DR.pier.depth + back)) < 1e-9 && PD - DR.leaf >= 0.2 && PD <= 1.5, `${tier}: the pier stands ${PD} m into the hall`);
      for (const w of p.walls) {
        const fr = wallFrame(w);
        for (const q of w.doors) {
          let leaves = 0, pier = 0, leafMax = 0, leafMin = 1;
          for (let i = 0; i < mp.count; i++) {
            const at = fr.s(mp.getX(i), mp.getZ(i)), d = fr.d(mp.getX(i), mp.getZ(i)), h = mp.getY(i) - F;
            if (Math.abs(at - q.s) > DR.bay / 2 - DR.pier.inset + 1e-4 || h > DR.pier.top + 1e-4 || d > PD + 0.5 || d < -1e-4) continue;
            const l = lumaOf([mc.getX(i), mc.getY(i), mc.getZ(i)]);
            assert.ok(d <= PD + DR.sign.box + 1e-4, `${tier}: a matt vertex of the ${w.id} door stands ${d} m into the hall`);
            if (Math.abs(d - PD) < 1e-4 && h < 0.01 || Math.abs(d - PD) < 1e-4 && Math.abs(h - DR.pier.top) < 1e-4) pier += 1;
            // (round A7: with the kit the leaves stand inside the frame, `kit.frame` narrower and lower)
            const fwk = p.doors.kit ? p.doors.kit.frame : 0;
            if (Math.abs(d - DR.leaf) < 1e-4 && Math.abs(at - q.s) <= DR.width / 2 - fwk + 1e-4 && h <= DR.height + 1e-4 && (h < 0.003 || Math.abs(h - (DR.height - fwk)) < 1e-4) && l < 0.1) { leaves += 1; leafMax = Math.max(leafMax, l); leafMin = Math.min(leafMin, l); }
          }
          assert.ok(pier >= 8 && leaves >= 8, `${tier}: the ${w.id} door at ${q.s}: ${pier} pier vertices, ${leaves} leaf vertices`);
          // (round A7, the kit: leaves in a dark paint x what they see of the hall from the end of their reveal;
          // round A8: the paint is the albedo table's matt black, 0.04)
          if (p.doors.kit) assert.ok(leafMax <= 0.04 * 1.1 * 0.72 && leafMin >= 0.04 * 0.81 * 0.3, `${tier}: the ${w.id} door's leaves hold ${leafMin.toFixed(4)}..${leafMax.toFixed(4)} (a black painted door, 0.04, in its frame)`);
          else if (back > 0) assert.ok(leafMax <= 0.0185 && leafMin >= 0.004, `${tier}: the ${w.id} door's leaves hold ${leafMin.toFixed(4)}..${leafMax.toFixed(4)} (a dark satin door, 0.035, at the end of its lobby)`);
          else assert.ok(leafMax <= 0.0545 && leafMin >= 0.012, `${tier}: the ${w.id} door's leaves hold ${leafMin.toFixed(4)}..${leafMax.toFixed(4)} (a dark painted door, 0.05, in its reveal)`);
        }
      }
    }
    // (a sign is a lit FACE: the emitter arm below pins that the shell registers its four emitters and nothing else)
    assert.equal(s.emitterIds.length, 4);
    assert.equal(s.counts().doors, 4);
  }
});

ok('pipe-and-base rail: an upright at every join and at both ends of every stretch of cloth; one in a door bay stands clear of the cloth and of the portal', () => {
  const DR = PLAN.doors, D = PLAN.drape;
  for (const d of [0, 1, 2]) {
    const p = shellPlan(ARENA, d);
    for (const w of p.walls) {
      const list = p.pleats[w.id], cloth = list.filter((q) => !q.over), ups = p.uprights[w.id];
      const stretches = 1 + w.gaps.length;                   // (the runs of cloth beside and between the door bays)
      // (a stretch's first pleat has the stretch's own end upright, whether or not it is a join)
      const joins = list.filter((q, i) => q.join && !(i === 0 || list[i - 1].over)).length;
      assert.equal(ups.length, joins + 2 * stretches, `${w.id}: ${ups.length} uprights for ${joins} joins and ${stretches} stretches`);
      for (let i = 1; i < ups.length; i++) assert.ok(ups[i].s > ups[i - 1].s - 1e-9, `${w.id}: uprights out of order`);
      const open = ups.filter((u) => u.open);
      assert.equal(open.length, 2 * w.gaps.length, `${w.id}: ${open.length} uprights in door bays`);
      for (const u of open) {
        const bay = w.gaps.find(([a, c]) => u.s > a && u.s < c);
        assert.ok(bay, `${w.id}: the open upright at ${u.s} is not in a bay`);
        const edge = u.open < 0 ? bay[1] : bay[0];             // the cloth's free edge beside it (open -1: the bay on its lower side)
        assert.ok(Math.abs(Math.abs(u.s - edge) - 0.07) < 1e-3, `${w.id}: the upright stands ${Math.abs(u.s - edge)} m from the cloth's edge`);
        // the pier's return on that side (round A5) is further into the bay than the upright and its base plate
        const jamb = u.open < 0 ? bay[1] - DR.pier.inset : bay[0] + DR.pier.inset;
        const plateEdge = u.s + u.open * 0.09;                 // (the builder pushes the plate under the cloth's edge: 9 cm of it toward the door)
        assert.ok(u.open < 0 ? plateEdge >= jamb + 0.005 : plateEdge <= jamb - 0.005, `${w.id}: the base plate at ${u.s} reaches under the pier at ${jamb}`);
        assert.ok(u.foot, 'a door bay is where a camera sees the wall\'s foot');
      }
      assert.ok(cloth.length > 0 && D.base > D.baseShow && D.upright > 0.03 && D.over > 0.05);
    }
  }
  // built: the rail's metal is in the matt mesh (no new draw call); the crossbar lies at the drape's height on every full tier
  for (const tier of ['base', 'high']) {
    const s = built[tier].shell, pos = s.meshes.matt.geometry.attributes.position;
    let over = 0; for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - F - (s.plan.drape.height + D.over)) < 1e-5) over += 1;
    assert.ok(over >= 2 * s.counts().uprights, `${tier}: ${over} vertices at the uprights' heads for ${s.counts().uprights} uprights`);
  }
});

let rigPlan = null;
try { rigPlan = await import('../../scene/club/arena/rig/plan.js'); if (typeof rigPlan.roofPlan !== 'function') rigPlan = null; } catch { rigPlan = null; }
if (!rigPlan) console.log('   note: arena/rig/plan.js roofPlan() not readable: the trays and beams are NOT checked against the rig\'s roof steel');
ok('roof: the cable trays lie on the rig\'s roof trusses between two purlin rows, the cross tray passes under the purlins, the eaves beams over the trusses; nothing crosses a fixture\'s rod', () => {
  const p = shellPlan(ARENA, 2), T = p.trays, E = p.eaves, dk = p.ducts;
  assert.ok(T && E && shellPlan(ARENA, 0).trays === null && shellPlan(ARENA, 0).eaves === null, 'lite: a flat lid, no tray, no beam');
  assert.deepEqual(shellPlan(ARENA, 1).trays, T);
  const deck = ARENA.hall.height - p.roof.ribDepth;
  assert.ok(T.y > ARENA.keepOut.cameraVolume.h1 + 0.5 && T.cross.y >= T.y + T.h - 1e-9 && T.cross.y + T.h < deck && E.y0 < deck && E.y0 > T.cross.y + T.h);
  // the cross tray ends short of the round ducts; the long trays end short of the cross duct
  assert.ok(Math.max(Math.abs(T.cross.z0), Math.abs(T.cross.z1)) < Math.min(...dk.z.map(Math.abs)) - dk.r - 0.3 && T.x1 < dk.cross.x - dk.cross.w / 2 - 0.1 && T.x0 > ARENA.hall.x0 + E.d);
  if (!rigPlan) return;
  const roof = rigPlan.roofPlan(ARENA, { floorY: F }), H = (y) => y - F;
  // a long tray's underside is the trusses' top (their top chords' upper side), and it crosses at least four of them
  const tops = roof.trusses.map((t) => Math.max(...t.chords.map((c) => H(c.a[1]) + c.h / 2)));
  for (const top of tops) assert.ok(Math.abs(top - T.y) < 1e-6, `a roof truss's top is at ${top}, the trays lie at ${T.y}`);
  assert.ok(roof.trusses.filter((t) => t.x > T.x0 && t.x < T.x1).length >= 4);
  // between two purlin rows, clear of them and of every stub post (a stub stands on a truss under a purlin)
  const pz = roof.purlins.map((q) => q.a[2]), pw = roof.purlins[0].w, pBottom = Math.min(...roof.purlins.map((q) => H(q.a[1]) - q.h / 2));
  for (const z of T.z) assert.ok(Math.min(...pz.map((v) => Math.abs(v - z))) > pw / 2 + T.w / 2 + 0.5, `the tray at z ${z} runs under a purlin`);
  // the cross tray: over the long trays, under the purlins, between two trusses
  assert.ok(T.cross.y + T.h < pBottom - 0.1, `the cross tray's top ${T.cross.y + T.h} against the purlins' underside ${pBottom}`);
  assert.ok(Math.min(...roof.trusses.map((t) => Math.abs(t.x - T.cross.x))) > 1, 'the cross tray runs over a truss');
  // the eaves beams: over the trusses' ends, the purlins bear on the west one
  assert.ok(E.y0 > Math.max(...tops) + 0.2 && E.y0 < pBottom);
  // no fixture's drop rod passes through a tray (a rod hangs from a purlin's row down to its bell)
  for (const fx of roof.fixtures.filter((q) => q.kind === 'roof')) {
    for (const z of T.z) assert.ok(Math.abs(fx.z - z) > T.w / 2 + 0.3, `the fixture at (${fx.x}, ${fx.z}) hangs through the tray at z ${z}`);
    assert.ok(Math.abs(fx.x - T.cross.x) > T.w / 2 + 0.3, `the fixture at (${fx.x}, ${fx.z}) hangs through the cross tray`);
  }
  // the rigging beams over the table (the hoists' chains end on them) stay under the long trays
  for (const q of roof.rigBeams) assert.ok(H(q.a[1]) + q.h / 2 < T.y, 'a rigging beam reaches the trays');
  console.log(`   roof: trays at ${T.y}..${(T.y + T.h).toFixed(2)} m on trusses whose tops are at ${tops[0].toFixed(2)}; cross tray ${T.cross.y}..${(T.cross.y + T.h).toFixed(2)} under purlins from ${pBottom.toFixed(2)}; eaves beams from ${E.y0}`);
});

ok('backdrop: the floor lights\' scallops are light (a patch after one standard include), zero in every row\'s mean, on the room light\'s own tube law', () => {
  const p = planOf(1), bd = ARENA.backdrop, e = p.emitters[0];
  // (round A5: the wash is a one-sided tube aimed up the cloth: its normal looks at the cloth and up)
  assert.ok(Array.isArray(e.normal) && e.normal[0] < -0.1 && e.normal[1] > 0.8 && e.normal[2] === 0 && Math.abs(Math.hypot(...e.normal) - 1) < 1e-3, `the wash's normal ${e.normal}`);
  const tube = { off: e.p[0] - bd.x, h: e.p[1], centre: bd.z1 - e.p[2], half: e.size[0] / 2, radius: e.size[1], window: LV.washReach, aim: [e.normal[1], e.normal[0]] };
  for (const [tier, b] of Object.entries(built)) {
    assert.deepEqual(b.shell.materials.backdrop.userData.arenaBackdrop.uArenaWashA.value, [e.normal[1], e.normal[0], 1, 0], `${tier}: the patch's aim`);
    const m = b.shell.materials.backdrop, u = m.userData.arenaBackdrop;
    assert.deepEqual(m.userData.clubKeys, [GLSL.BACKDROP_PATCH_KEY], `${tier}: the backdrop's patch`);
    assert.ok(m.customProgramCacheKey().endsWith(`|club:${GLSL.BACKDROP_PATCH_KEY}`));
    assert.deepEqual(u.uArenaWashG.value, [bd.z1 - bd.z0, bd.height, tube.off, tube.h]);
    assert.deepEqual(u.uArenaWashT.value, [tube.centre, tube.half, tube.radius, tube.window]);
    // colour x intensity: the palette's wash at the hall's level, as the emitter itself is registered
    const c = new THREE.Color(PALETTE.wash);
    for (const [k, v] of [c.r, c.g, c.b].entries()) assert.ok(Math.abs(u.uArenaWashC.value[k] - v * LV.wash) < 1e-6);
    assert.equal(u.uArenaWashC.value[3], 1);
    assert.ok(Math.abs(u.uArenaWashS.value[0] - b.shell.state().backdrop.share) < 1e-4 && u.uArenaWashS.value[1] === TEX.SCALLOP_ALPHA.offset && u.uArenaWashS.value[2] === TEX.SCALLOP_ALPHA.scale);
    assert.ok(['adopt', 'local'].includes(b.shell.state().backdrop.patch));
  }
  const spec = GLSL.backdropPatchSpec(built.base.shell.materials.backdrop.userData.arenaBackdrop);
  assert.equal(spec.apply.length, 1);
  assert.equal(spec.apply[0].mode, 'after'); assert.equal(spec.apply[0].anchor, '#include <lights_fragment_end>');
  const std = THREE.ShaderLib.standard;
  const shader = { uniforms: {}, defines: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
  built.base.shell.materials.backdrop.onBeforeCompile(shader, null);
  for (const text of ['uArenaWashG', 'sampledDiffuseColor.a', 'vRoomWP']) assert.ok(shader.fragmentShader.includes(text), `the compiled backdrop text lacks ${text}`);
  assert.equal(shader.fragmentShader.split('#include <lights_fragment_end>').length - 1, 1);
  assert.ok(shader.fragmentShader.indexOf('#include <lights_fragment_end>') < shader.fragmentShader.indexOf('uArenaWashS.x * wRel - 1.0'), 'the scallop term runs before the lights are summed');
  for (const k of Object.keys(spec.uniforms)) assert.ok(shader.uniforms[k], `uniform ${k} is not handed to the program`);
  const used = new Set([...GLSL.BACKDROP_LIGHT.matchAll(/\buArenaWash[A-Z]\b/g)].map((x) => x[0]));
  assert.deepEqual([...used].sort(), Object.keys(spec.uniforms).sort());
  // the term is light on the cloth's own diffuse colour, zero-mean (S / share - 1), and never leaves the sum negative
  // (round A5: x the cloth's relief against the wash's direction, a factor on the wash's own light and nothing else)
  assert.match(GLSL.BACKDROP_LIGHT, /\( wS \/ uArenaWashS\.x \* wRel - 1\.0 \) \* uArenaWashC\.w \* BRDF_Lambert\( material\.diffuseColor \)/);
  assert.match(GLSL.BACKDROP_LIGHT, /float wRel = mix\( 1\.0, clamp\( 1\.0 - wSy \* wL\.y \/ max\( wL\.z, 0\.05 \), 0\.0, 3\.0 \), uArenaWashB\.z \)/);
  for (const [tier, b] of Object.entries(built)) {
    const u = b.shell.materials.backdrop.userData.arenaBackdrop, R = GLSL.BACKDROP_RELIEF;
    assert.deepEqual(u.uArenaWashR.value, [b.shell.plan.backdrop.rails[0], b.shell.plan.backdrop.rails[1], R.proud, R.half], `${tier}: the rails`);
    assert.deepEqual(u.uArenaWashB.value, [R.bow, R.ripple, 1, 0], `${tier}: the relief is on`);
    // a rail's ridge stands a centimetre proud at the most, the bow and the ripples less than a hand's thickness
    assert.ok(R.proud > 0 && R.proud <= 0.015 && R.half >= 0.03 && R.bow <= 0.02 && R.ripple <= 0.006);
  }
  assert.match(GLSL.BACKDROP_LIGHT, /max\( reflectedLight\.indirectDiffuse, - reflectedLight\.directDiffuse \)/);
  assert.ok(!/diffuseColor\.rgb\s*[*+]?=|totalEmissiveRadiance|gl_FragColor/.test(GLSL.BACKDROP_LIGHT), 'the patch paints the cloth');
  // the tube law in the patch is the room light's own: one emitter (the wash, white, 1 candela) on a fresh room light,
  // read back on the cloth by the service's CPU reader, against washOnCloth()
  // (`cone: true`: the arena's switch, as arena/room.js sets it: a tube that carries a normal is one-sided)
  roomLight.reset(); roomLight.init({ club: { tier: 'high', knobs: TIERS.high }, envMap: null, tableBlock: true, cone: true });
  const at = (s, h) => [bd.x + 1e-4, F + h, bd.z1 - s];
  const before = [[3, 0.3], [7, 1], [1, 2.5], [12.5, 4], [7, 5.5]].map(([s, h]) => roomLight.irradianceAt(new THREE.Vector3(...at(s, h)), new THREE.Vector3(1, 0, 0), { baked: false })[0]);
  roomLight.addEmitter({ id: 'hall.wash.0', type: 'tube', position: new THREE.Vector3(e.p[0], F + e.p[1], e.p[2]), axis: new THREE.Vector3(...e.axis), normal: new THREE.Vector3(...e.normal), size: e.size.slice(), color: new THREE.Color(1, 1, 1), intensity: 1, radius: LV.washReach });
  roomLight.commit();
  [[3, 0.3], [7, 1], [1, 2.5], [12.5, 4], [7, 5.5]].forEach(([s, h], i) => {
    const room = roomLight.irradianceAt(new THREE.Vector3(...at(s, h)), new THREE.Vector3(1, 0, 0), { baked: false })[0] - before[i];
    const mine = GLSL.washOnCloth(s, h, tube);
    assert.ok(Math.abs(room - mine) < 2e-3 * mine + 1e-7, `the tube law at (${s}, ${h}): the room light gives ${room}, the patch's law ${mine}`);
  });
  console.log(`   backdrop: the wash's own light on the cloth per candela: foot ${GLSL.washOnCloth(7, 0.3, tube).toFixed(4)}, 2 m ${GLSL.washOnCloth(7, 2, tube).toFixed(4)}, 5.5 m ${GLSL.washOnCloth(7, 5.5, tube).toFixed(4)} (x ${LV.wash} x the palette's amber)`);
});

// ---- 3d. round A5: the exit signs as sources, the carpet's tiles and lay, shader locals -----------------------------------
/** The names a GLSL text declares as locals (float / vec2 / vec3 / vec4 / int), in order. */
const glslLocals = (text) => [...text.replace(/\/\/[^\n]*/g, '').matchAll(/\b(?:float|int|vec[234])\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=|\s*;|\s*,)/g)].map((m) => m[1]);

ok('shader text: no local is declared twice in a patch (a redefinition does not compile, and node cannot see it)', () => {
  for (const [name, text] of [['CARPET_COLOR', GLSL.CARPET_COLOR], ['CARPET_COLOR_4', GLSL.CARPET_COLOR_4], ['CARPET_COLOR_4S', GLSL.CARPET_COLOR_4S], ['CARPET_COLOR_5', GLSL.CARPET_COLOR_5], ['BACKDROP_LIGHT', GLSL.BACKDROP_LIGHT], ['SIGN_LIGHT', GLSL.SIGN_LIGHT], ['ROOF_LIGHT', GLSL.ROOF_LIGHT]]) {
    const names = glslLocals(text), twice = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(twice, [], `${name} declares ${twice.join(', ')} twice`);
    assert.ok(names.length >= 5, `${name}: ${names.length} locals found`);
  }
  // (the comma form of a declaration list hides its later names from the pattern: none is used)
  for (const text of [GLSL.CARPET_COLOR, GLSL.CARPET_COLOR_4, GLSL.BACKDROP_LIGHT, GLSL.SIGN_LIGHT]) {
    for (const m of text.replace(/\/\/[^\n]*/g, '').matchAll(/\b(?:float|int|vec[234])\s+[A-Za-z_][A-Za-z0-9_]*\s*=[^;]*?,\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) {
      // a second name after a comma at brace depth 0 of its statement would be a declaration: the patches hold two
      // such lists (aTi / aTf, wR0 / wR1), whose names must be unique as well
      const all = glslLocals(text);
      assert.ok(all.filter((n) => n === m[1]).length <= 1, `${m[1]} is declared twice`);
    }
  }
});

ok('exit signs as sources: a hot band and a down window over the bloom threshold; their light on the pier is a patch on the matt material, no emitter', () => {
  const S = PLAN.doors.sign;
  // the patch: after-only on one standard include, its own key, on base and high; the lite tier has none
  for (const tier of ['base', 'high']) {
    const s = built[tier].shell, m = s.materials.matt, u = m.userData.arenaSign;
    // (the high tier's patch also carries the roof's term while the hall's `bellUp` is on: the arm below)
    assert.deepEqual(m.userData.clubKeys, [tier === 'high' && LV.bellUp > 0 ? `${GLSL.SIGN_PATCH_KEY}.${GLSL.ROOF_PATCH_KEY}` : GLSL.SIGN_PATCH_KEY], `${tier}: the matt material's patch`);
    assert.ok(['adopt', 'local'].includes(s.state().sign.patch));
    assert.equal(u.uArenaSignP.value.length, 16); assert.equal(u.uArenaSignN.value.length, 16);
    // four sources: each at its box's lower front edge (the pier's depth + the box, the sign's underside), lit
    const doors = s.state().doors;
    assert.equal(doors.length, 4);
    doors.forEach((q, i) => {
      const p = u.uArenaSignP.value.slice(4 * i, 4 * i + 4), n = u.uArenaSignN.value.slice(4 * i, 4 * i + 3);
      assert.deepEqual(p.slice(0, 3), q.p); assert.equal(p[3], 1);
      const w = s.plan.walls.find((x) => x.id === q.wall), fr = wallFrame(w);
      assert.ok(Math.abs(fr.d(p[0], p[2]) - (s.plan.doors.pier.depth + S.box)) < 1e-6 && Math.abs(fr.s(p[0], p[2]) - q.s) < 1e-6, `${tier}: the ${q.wall} sign's source stands ${fr.d(p[0], p[2])} m off its wall`);
      assert.ok(Math.abs(p[1] - F - (S.at - S.h / 2 - 0.02)) < 1e-6, `${tier}: the source's height ${p[1] - F}`);
      assert.deepEqual(n, [w.a[0], 0, w.a[1]], `${tier}: the ${q.wall} sign's normal`);
    });
    // intensity = radiance x area: the face with its hot band, the down window
    const faceI = S.w * S.h * HALL.sign + S.core[0] * S.core[1] * (HALL.signCore - HALL.sign), downI = S.w * (S.box - 0.02) * HALL.signDown;
    for (let k = 0; k < 3; k++) { assert.ok(Math.abs(u.uArenaSignF.value[k] - SIGN.color[k] * faceI) < 1e-9); assert.ok(Math.abs(u.uArenaSignD.value[k] - SIGN.color[k] * downI) < 1e-9); }
    assert.ok(u.uArenaSignD.value[3] <= 2 && u.uArenaSignF.value[3] > 0, 'the reach is local, the near field is capped');
  }
  assert.ok(!built.lite.shell.materials.matt.userData.arenaSign && !(built.lite.shell.materials.matt.userData.clubKeys ?? []).length, 'lite: no sign patch');
  const spec = GLSL.signPatchSpec(built.base.shell.materials.matt.userData.arenaSign);
  assert.equal(spec.apply.length, 1); assert.equal(spec.apply[0].mode, 'after'); assert.equal(spec.apply[0].anchor, '#include <lights_fragment_end>');
  const std = THREE.ShaderLib.standard;
  const shader = { uniforms: {}, defines: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
  built.base.shell.materials.matt.onBeforeCompile(shader, null);
  for (const text of ['uArenaSignP', 'vRoomWP - modelMatrix[ 3 ].xyz', 'uniform mat4 modelMatrix;']) assert.ok(shader.fragmentShader.includes(text), `the compiled matt text lacks ${text}`);
  for (const k of Object.keys(spec.uniforms)) assert.ok(shader.uniforms[k], `uniform ${k} is not handed to the program`);
  const used = new Set([...GLSL.SIGN_LIGHT.matchAll(/\buArenaSign[A-Z]\b/g)].map((x) => x[0]));
  assert.deepEqual([...used].sort(), Object.keys(spec.uniforms).sort());
  // light on the fragment's own diffuse colour; nothing painted, nothing read from the camera
  assert.match(GLSL.SIGN_LIGHT, /reflectedLight\.indirectDiffuse \+= sE \* BRDF_Lambert\( material\.diffuseColor \)/);
  assert.ok(!/cameraPosition|geometryViewDir|vViewPosition|diffuseColor\.rgb\s*[*+]?=|totalEmissiveRadiance|gl_FragColor/.test(GLSL.SIGN_LIGHT), 'the sign patch reads the camera or paints');
  // the law (signOn, the same arithmetic): under the box the pier's face takes a few tenths of a unit of green, a
  // leaf's head less, nothing over the box, nothing two metres away; green, never more than a unit
  const u = built.high.shell.materials.matt.userData.arenaSign, q = built.high.shell.state().doors[0];
  const opt = { face: u.uArenaSignF.value.slice(0, 3), down: u.uArenaSignD.value.slice(0, 3), near: Math.sqrt(u.uArenaSignF.value[3]), reach: u.uArenaSignD.value[3] };
  const w = built.high.shell.plan.walls.find((x) => x.id === q.wall), a = [w.a[0], 0, w.a[1]];
  const at = (out, dy) => [q.p[0] + a[0] * out, q.p[1] + dy, q.p[2] + a[2] * out];   // metres out of the source's plane, metres above it
  const PDb = built.high.shell.plan.doors.pier.depth, deepDoor = (built.high.shell.plan.doors.back ?? 0) > 0;
  const under = GLSL.signOn(at(-S.box, -0.15), a, q, opt), leaf = GLSL.signOn(at(-S.box - PDb + PLAN.doors.leaf, -(S.at - S.h / 2 - 0.02 - PLAN.doors.height) - 0.1), a, q, opt);
  const over = GLSL.signOn(at(-S.box, 0.3), a, q, opt), far = GLSL.signOn(at(-S.box, -2.0), a, q, opt);
  assert.ok(under[1] > 0.15 && under[1] < 1.0 && under[1] > 8 * under[0] && under[1] > 2.5 * under[2], `the pier 15 cm under a sign takes ${under.map((v) => v.toFixed(3))}`);
  // (round A6: at the end of the lobby a leaf's head is over a metre from the sign: next to nothing of its green)
  // (round A7: the lobby is 0.6 m deep: a leaf's head takes a little of the sign's green, still far under the pier's)
  if (deepDoor) assert.ok(leaf[1] < (PDb > 1 ? 0.03 : 0.12) && leaf[1] < 0.4 * under[1], `a leaf's head at the end of the lobby takes ${leaf[1]}`);
  else assert.ok(leaf[1] > 0.005 && leaf[1] < under[1], `a leaf's head takes ${leaf[1]}`);
  assert.deepEqual(over, [0, 0, 0]); assert.deepEqual(far, [0, 0, 0]);
  // the form factor behind the reveal's shades
  assert.ok(Math.abs(rectShare(0, 0, 0.001, -50, 50, -50, 50) - 1) < 1e-3 && Math.abs(rectShare(0, 0, 0.3, 0, 50, 0, 50) - 0.25) < 0.01, 'rectShare: a whole hemisphere, a quarter');
  assert.ok(rectShare(0.45, 1.05, 0.27, -0.9, 0.9, 0, 2.1) > rectShare(0.75, 0.3, 0.27, -0.9, 0.9, 0, 2.1), 'a leaf sees more of the hall at its middle than in its corner');
  console.log(`   signs: the pier 15 cm under a sign takes ${under[1].toFixed(2)} units of green, a leaf's head ${leaf[1].toFixed(3)}; intensities face ${u.uArenaSignF.value[1].toFixed(4)}, down ${u.uArenaSignD.value[1].toFixed(4)}`);
});

ok('roof, round A5: the lid reads only where a lit bell of the rig is near: the bells\' own leak as light on the matt material (high tier), no emitter, nothing baked', () => {
  const m = built.high.shell.materials.matt, u = m.userData.arenaRoof, st = built.high.shell.state().roof;
  for (const tier of ['lite', 'base']) assert.ok(!built[tier].shell.materials.matt.userData.arenaRoof && built[tier].shell.state().roof.bells === 0, `${tier}: the roof term is the high tier's`);
  // the text: a loop over a fixed count, light on the fragment's own diffuse colour, nothing painted, no camera
  assert.match(GLSL.ROOF_LIGHT, /reflectedLight\.indirectDiffuse \+= uArenaBellC\.rgb \* bE \* BRDF_Lambert\( material\.diffuseColor \)/);
  assert.ok(!/cameraPosition|geometryViewDir|vViewPosition|diffuseColor\.rgb\s*[*+]?=|totalEmissiveRadiance|gl_FragColor/.test(GLSL.ROOF_LIGHT), 'the roof term reads the camera or paints');
  assert.ok(GLSL.ROOF_PARS.includes(`uArenaBell[ ${GLSL.ROOF_BELLS} ]`) && GLSL.ROOF_LIGHT.includes(`i < ${GLSL.ROOF_BELLS}`));
  assert.ok(!GLSL.ROOF_PARS.includes('modelMatrix'), 'the model matrix is declared twice in the joined patch');
  const both = GLSL.signPatchSpec(built.high.shell.materials.matt.userData.arenaSign, GLSL.roofUniforms({ bells: [], tint: [1, 1, 1], under: 0 }));
  assert.equal(both.key, `${GLSL.SIGN_PATCH_KEY}.${GLSL.ROOF_PATCH_KEY}`); assert.equal(both.apply.length, 1); assert.equal(both.apply[0].mode, 'after');
  assert.ok(both.pars.includes('uArenaSignP') && both.pars.includes('uArenaBellR') && both.apply[0].code.includes('sE') && both.apply[0].code.includes('bE'));
  assert.deepEqual(Object.keys(both.uniforms).sort(), ['uArenaBell', 'uArenaBellC', 'uArenaBellR', 'uArenaSignD', 'uArenaSignF', 'uArenaSignN', 'uArenaSignP']);
  // the law on the rig's own fixture list (bellOn, the same arithmetic), at the level the round settled on
  const fx = roofPlan(ARENA, { floorY: F }).fixtures.filter((f) => f.kind === 'roof');
  assert.ok(fx.length >= 8 && fx.length <= GLSL.ROOF_BELLS, `${fx.length} lit roof bells for ${GLSL.ROOF_BELLS} slots`);
  const top = F + RIG_HALL.roof.mouthH + RIG_HALL.roof.bellH, up = LV.bellUp > 0 ? LV.bellUp : 4.5;
  const bells = fx.map((f) => ({ p: [f.x, f.y + RIG_HALL.roof.bellH, f.z], i: f.level * up }));
  const Y = F + ARENA.hall.height - PLAN.roof.ribDepth, dn = [0, -1, 0];
  const over = bells.map((b) => GLSL.bellOn([b.p[0], Y, b.p[2]], dn, bells));
  assert.ok(Math.min(...over) > 0.9 && Math.max(...over) < 2.6, `the deck over a lit bell takes ${Math.min(...over).toFixed(2)} to ${Math.max(...over).toFixed(2)} units`);
  let dark = 0, n = 0;
  for (let x = ARENA.hall.x0 + 0.1; x < ARENA.hall.x1; x += 0.5) for (let z = ARENA.hall.z0 + 0.1; z < ARENA.hall.z1; z += 0.5) { n += 1; if (GLSL.bellOn([x, Y, z], dn, bells) < 0.1) dark += 1; }
  assert.ok(dark / n > 0.3, `only ${(100 * dark / n).toFixed(0)} % of the lid stays dark: the bells wash the whole roof`);
  assert.equal(GLSL.bellOn([0, Y, 0], dn, bells), 0, 'the lid over the table\'s rig is lit (no bell hangs there)');
  assert.equal(GLSL.bellOn([bells[0].p[0], F + 3, bells[0].p[2]], [0, 1, 0], bells), 0, 'a bell\'s leak lights something under it');
  assert.equal(GLSL.bellOn([bells[0].p[0], top + 0.5, bells[0].p[2]], [0, 1, 0], bells), 0, 'a face turned away from the bell is lit');
  // round A6 (CONTRACT 18.2: the roof by the bake; nothing is lit twice): with the lid on the light map the stand-in
  // is a tool's switch. Off: no patch on the lid's material, the sign patch alone on the matt one. On (a pair's
  // other arm): the lid's material carries the bells' term as a patch of its own.
  for (const tier of ['lite', 'base', 'high']) {
    const sh = built[tier].shell;
    assert.equal(sh.state().roof.chart, LV.roofChart > 0, `${tier}: the lid's chart`);
    if (!sh.materials.roof) continue;
    const want = tier === 'high' && LV.bellUp > 0 ? [GLSL.ROOF_PATCH_KEY] : [];
    assert.deepEqual(sh.materials.roof.userData.clubKeys ?? [], want, `${tier}: the lid's material carries ${JSON.stringify(sh.materials.roof.userData.clubKeys)}`);
  }
  const lidSpec = GLSL.roofPatchSpec(GLSL.roofUniforms({ bells: [], tint: [1, 1, 1], under: 0 }));
  assert.equal(lidSpec.key, GLSL.ROOF_PATCH_KEY); assert.equal(lidSpec.apply.length, 1); assert.equal(lidSpec.apply[0].mode, 'after');
  assert.equal(lidSpec.pars.split('uniform mat4 modelMatrix;').length, 2, 'the lid\'s patch declares the model matrix once');
  if (!(LV.bellUp > 0)) { assert.ok(!u && st.bells === 0, 'bellUp 0: the term is off'); console.log('   roof: the stand-in is OFF (bellUp 0): the lid takes the bake' + (LV.roofChart > 0 ? ' on its two half charts' : '\'s volume')); return; }
  // as built: every lit bell of the rig's plan in a slot (its top, its level x the hall's bellUp), the rest empty;
  // nothing under the bells' tops takes the light (the pipe, the doors, the stands and the floor are far below)
  assert.equal(u.uArenaBell.value.length, 4 * GLSL.ROOF_BELLS); assert.equal(st.bells, fx.length); assert.equal(st.up, LV.bellUp);
  fx.forEach((f, i) => { const v = u.uArenaBell.value.slice(4 * i, 4 * i + 4); assert.deepEqual(v.slice(0, 3), [f.x, f.y + RIG_HALL.roof.bellH, f.z]); assert.ok(Math.abs(v[3] - f.level * LV.bellUp) < 1e-9); });
  for (let i = fx.length; i < GLSL.ROOF_BELLS; i++) assert.equal(u.uArenaBell.value[4 * i + 3], 0);
  assert.ok(Math.abs(u.uArenaBellC.value[3] - (top - 0.02)) < 1e-9 && u.uArenaBellC.value[3] - F > PLAN.drape.height + PLAN.drape.over + 0.1, 'the threshold is not just under the bells\' tops, over the drape\'s rail');
  assert.deepEqual(u.uArenaBellC.value.slice(0, 3), HALL.houseTint); assert.deepEqual(u.uArenaBellR.value.slice(0, 2), [GLSL.ROOF.near ** 2, GLSL.ROOF.reach ** 2]);
  const std = THREE.ShaderLib.standard, shader = { uniforms: {}, defines: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
  m.onBeforeCompile(shader, null);
  for (const text of ['uArenaBell[ i ].xyz - bP', 'uArenaSignP', 'uniform mat4 modelMatrix;']) assert.ok(shader.fragmentShader.includes(text), `the compiled matt text of the high tier lacks ${text}`);
  assert.equal(shader.fragmentShader.split('uniform mat4 modelMatrix;').length, 2, 'the model matrix is declared twice');
  for (const k of ['uArenaBell', 'uArenaBellC', 'uArenaBellR', 'uArenaSignP']) assert.ok(shader.uniforms[k], `uniform ${k} is not handed to the program`);
  console.log(`   roof: ${fx.length} lit bells at ${LV.bellUp}: the deck over a bell ${Math.min(...over).toFixed(2)} to ${Math.max(...over).toFixed(2)} units, ${(100 * dark / n).toFixed(0)} % of the lid under 0.1`);
});

ok('carpet, round A5: the island in quarter-turned tiles; the lay shows against the eye and against the light from the rig; grain; all zero in the mean', () => {
  const u = built.high.shell.uniforms, C = GLSL.CARPET;
  assert.deepEqual(u.uArenaTile.value, [C.tile, C.tileSeam, C.grain, C.grain2]);
  // (round A6: under the patch v4 the fourth number is the sine of the pile's lean; the v3 text below stays as it is)
  // (round A7: under v5 the pile's lean is v5's own row)
  assert.deepEqual(u.uArenaRig.value, [ARENA.rig.length / 2, ARENA.rig.width / 2, ARENA.rig.bottomH, V4 ? (u.uArenaHand ? LV.carpetNap5 : GLSL.CARPET_4.nap) : C.lay]);
  assert.ok(C.tile >= 0.4 && C.tile <= 0.6 && C.lay > 0 && C.lay <= 0.15 && C.grain <= 0.2 && C.grain2 <= 0.1 && C.tileSeam < 1);
  // a whole number of tile rows is not required, but the island holds many tiles in both directions
  const isl = built.high.shell.plan.island;
  assert.ok((isl.x1 - isl.x0) / C.tile > 15 && (isl.z1 - isl.z0) / C.tile > 10);
  const t = GLSL.CARPET_COLOR;
  // quarter-turned: the lay is along x or along z by the parity of the tile's two indices
  assert.match(t, /float aTurn = mod\( aTi\.x \+ aTi\.y, 2\.0 \);/);
  assert.match(t, /aDir = aTurn < 0\.5 \? vec2\( 1\.0, 0\.0 \) : vec2\( 0\.0, 1\.0 \);/);
  // the lay enters only through aLean, which enters only as a dot product with a direction (the eye's, the light's):
  // each term is odd in the lay, so the two lays cancel in the mean
  assert.match(t, /aShade \*= 1\.0 - aView \* uArenaPile\.y \* dot\( aLean, aVh \)/);
  assert.match(t, /aShade \*= 1\.0 \+ aView \* aIn \* uArenaRig\.w \* dot\( aLean, aTo \/ max\( aTl, 1e-4 \) \)/);
  // (its declaration, the cross-lay noise added to it, and the two dot products: nothing else reads it)
  assert.equal([...t.matchAll(/\baLean\b/g)].length, 4, 'aLean is read somewhere else');
  // the grain is noise about its middle
  assert.match(t, /uArenaTile\.z \* \( arenaNoise\( aw \* 61\.0 \+ 2\.0 \) - 0\.5 \)/);
  assert.match(t, /uArenaTile\.w \* \( arenaNoise\( aw \* 23\.0 \+ 9\.0 \) - 0\.5 \)/);
});

ok('carpet, round A6 (patch v4): the nap shows against the island\'s directed light (the rig\'s four table keys and its fill), by a fitter\'s hand; a walked ring; a few pieces of tape; nothing adds light', () => {
  const K4 = GLSL.CARPET_4, t = GLSL.CARPET_COLOR_4;
  // the text: v3's anchors, its own key; the lay enters through aLean alone, as dot products with a direction (the
  // eye's, the directed light's): every term is odd in the lay
  const spec = GLSL.carpetPatchSpec4(GLSL.carpetUniforms4(shellPlan(ARENA, 1), { gaps: ARENA.boards.gaps }));
  assert.equal(spec.key, 'arena-carpet-v4'); assert.notEqual(spec.key, GLSL.CARPET_PATCH_KEY);
  assert.deepEqual(spec.apply.map((a) => [a.anchor, a.mode]), [['#include <color_fragment>', 'after'], ['#include <roughnessmap_fragment>', 'after']]);
  assert.match(t, /aShade \*= 1\.0 - aView \* uArenaPile\.y \* dot\( aLean, aVh \)/);
  assert.match(t, /aShade \*= 1\.0 \+ aView \* aIn \* uArenaRig\.w \* dot\( aLean, aGrad \) \/ max\( aEsum, 1e-3 \);/);
  assert.equal([...t.matchAll(/\baLean\b/g)].length, 4, 'aLean is read somewhere else');
  // the camera is read for the pile's own view dependence (the lean against the eye, the sheen at a low angle) and for
  // nothing else: the light model reads the fragment's place alone
  const lightPart = t.slice(t.indexOf('vec2 aOff = aw - uArenaTab.xy;'), t.indexOf('float aGl = length( aGrad );'));
  assert.ok(lightPart.length > 400 && !/cameraPosition|aV\b|aVh|aGraze/.test(lightPart), 'the light model reads the camera');
  // the fitter's hand: a share turned half round, a share laid like the neighbour, four directions in all
  assert.match(t, /float aTurn = mod\( aTi\.x \+ aTi\.y \+ step\( aH1, uArenaLay\.y \), 2\.0 \);/);
  assert.match(t, /float aFlip = aH2 < uArenaLay\.x \? - 1\.0 : 1\.0;/);
  assert.ok(K4.flip > 0.05 && K4.flip < 0.3 && K4.swap > 0.03 && K4.swap < 0.2 && K4.lot <= 0.05 && K4.nap >= 0.1 && K4.nap <= 0.26, 'the lay');
  // wear soils by four per cent at the most; tape is another material's albedo (a pale cloth tape), a few pieces
  assert.match(t, /aShade \*= 1\.0 - 0\.04 \* uArenaPile\.z \* aWear;/);
  assert.ok(K4.ring - K4.ringHalf >= 0.55 && K4.ring + K4.ringHalf <= 1.65, 'the walked ring is 0.6 to 1.6 m out');
  assert.ok(K4.tapeAlbedo * ALBEDO.island > 0.2 && K4.tapeAlbedo * ALBEDO.island < 0.45, `tape albedo ${K4.tapeAlbedo * ALBEDO.island}`);
  // the model against the rig's own plan: four keys, read from the rig (never typed here)
  const heads = outerPlan(ARENA, { floorY: F }).heads.filter((h) => h.key);
  assert.equal(heads.length, 4);
  // (a key's second blade, at the table's foot, when the rig's plan has one: the key ends half a metre in front of the table)
  const twoBlades = typeof tableKeyFoot === 'function' && !!RIG_HALL.tableKeys.foot;
  const keys = heads.map((h) => { const k = RIG_HALL.tableKeys.keys.find((q) => q.id === h.key); return { id: h.key, rail: k.rail, p: h.lens, d: h.dir, i: k.intensity, cone: k.cone ?? RIG_HALL.tableKeys.cone, n: tableKeyShutter(h.lens, k.rail), ...(twoBlades ? { foot: tableKeyFoot(h.lens, k.rail, F) } : {}) }; });
  const U = GLSL.carpetUniforms4(shellPlan(ARENA, 2), { gaps: ARENA.boards.gaps, keys, floorY: F, chairs: ARENA.floor.chairs });
  const at = (x, z) => GLSL.carpetLightAt(x, z, U, F);
  const iS = keys.findIndex((k) => k.id === 'sw.s'), iW = keys.findIndex((k) => k.id === 'sw.w'), iN = keys.findIndex((k) => k.id === 'ne.n');
  // 1 m beside the south rail: the south-west key carries about half the light and comes from the south-west;
  // nothing of it north of its shutter's line; 1 m behind the head rail: the west key; north of the table the
  // north-east pair at about half the south's level
  const s = at(0, 1.8), w = at(-2.45, 0), n = at(0, -1.8), c = at(0, 0);
  // (the keys' LEVELS are the rig's and move with its plan: the arm pins the model's structure, not their numbers:
  // a key's light is candela x cosine / distance squared; it comes from the key's side; none of it beyond its shutter)
  for (const [q, i, name] of [[s, iS, 'south'], [w, iW, 'west'], [n, iN, 'north']]) {
    const k = keys[i], p = name === 'south' ? [0, 1.8] : name === 'west' ? [-2.45, 0] : [0, -1.8];
    const d = [k.p[0] - p[0], k.p[1] - F, k.p[2] - p[1]], d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    assert.ok(q.keys[i] <= (k.i * d[1]) / d2 ** 1.5 + 1e-9, `${name}: the model gives the key more than candela x cosine / distance squared`);
  }
  assert.ok(s.keys.every((e) => e >= 0) && s.sum > 0 && n.sum > 0 && w.sum > 0);
  // (the rig hangs its keys where it finds best: from the south-west corner, or square to the side: south in both)
  if (s.keys[iS] > 0) assert.ok(s.grad[1] > 0, `south of the table the directed light comes from ${s.grad.map((v) => v.toFixed(2))}`);
  if (w.keys[iW] > 0) assert.ok(w.grad[0] < 0, 'behind the head rail the directed light does not come from the west');
  assert.equal(at(0, -1.8).keys[iS], 0, 'the south key reaches over the table');
  assert.equal(at(2.45, 0).keys[iW], 0, 'the west key reaches over the table');
  // the nap's contrast: two tiles that lean toward and away from the directed light (x-lay or z-lay, one turned half round)
  const contrast = (q) => 2 * K4.nap * Math.abs(q.grad[0]) / q.sum, contrastZ = (q) => 2 * K4.nap * Math.abs(q.grad[1]) / q.sum;
  // with the second blade a key is whole under the skirt and gone from the pool: 1 m beside the rail it leaves nothing
  if (twoBlades) {
    const edge = RIG_HALL.tableKeys.edge;
    assert.ok(at(0, edge.hz + 1.0).keys[iS] < 0.02 && at(-edge.hx - 1.0, 0).keys[iW] < 0.02, `a key lights the pool: ${at(0, edge.hz + 1.0).keys[iS]}, ${at(-edge.hx - 1.0, 0).keys[iW]}`);
    assert.ok(at(0, edge.hz - 0.3).keys[iS] > 0.5, `under the south skirt the key gives ${at(0, edge.hz - 0.3).keys[iS]}`);
    // then the pool's directed light is the rig's own (from over the table): its share grows outward with its angle
    const near = at(0, edge.hz + 1.0), far = at(0, edge.hz + 3.0);
    assert.ok(near.sum > 3.0 && near.sum < 3.8 && far.sum > 1.1 && far.sum < 1.8, `the model's pool: ${near.sum.toFixed(2)} units 1 m beside the rail, ${far.sum.toFixed(2)} at 3 m`);
    assert.ok(contrastZ(far) > 2 * contrastZ(near) && contrastZ(far) > 0.12, `the nap's contrast toward the boards ${contrastZ(far).toFixed(3)} against ${contrastZ(near).toFixed(3)} beside the table`);
  }
  // the keys' SIDE blades (the variant v4s): the v4 text plus two planes per key and nothing else; a key's light is
  // whole between its two legs and gone past the table's corners; without `look4.sides` the uniforms are v4's
  {
    const ts = GLSL.CARPET_COLOR_4S;
    assert.equal(ts.replace(GLSL.CARPET_SIDE_4, ''), t, 'the sided text is not v4 plus the side blades');
    assert.equal(ts.split('uArenaKeyA[ aKn ]').length - 1, 5); assert.equal(ts.split('uArenaKeyB[ aKn ]').length - 1, 5);
    assert.ok(!/uArenaKey[AB]/.test(t) && !/uArenaKey[AB]/.test(GLSL.CARPET_PARS_4) && !('uArenaKeyA' in U));
    assert.ok(!/reflectedLight|totalEmissiveRadiance|outgoingLight|gl_FragColor|diffuseColor\.rgb\s*\+=|cameraPosition/.test(GLSL.CARPET_SIDE_4));
    if (typeof tableKeySides === 'function') {
      const keysS = keys.map((k) => ({ ...k, sides: tableKeySides(k.p, k.rail) }));
      const US = GLSL.carpetUniforms4(shellPlan(ARENA, 2), { gaps: ARENA.boards.gaps, keys: keysS, floorY: F, chairs: ARENA.floor.chairs, look4: { ...K4, sides: 1 } });
      const specS = GLSL.carpetPatchSpec4(US);
      assert.equal(specS.key, 'arena-carpet-v4s'); assert.equal(specS.pars, GLSL.CARPET_PARS_4S); assert.equal(specS.apply[0].code, ts);
      const usedS = new Set([...`${ts}${GLSL.CARPET_ROUGH_4}`.matchAll(/\buArena[A-Za-z]+/g)].map((x) => x[0]));
      for (const name of usedS) assert.ok(new RegExp(`uniform vec4 ${name}[; \\[]`).test(GLSL.CARPET_PARS_4S), `${name} is not declared`);
      assert.deepEqual([...usedS].sort(), Object.keys(US).sort(), 'the sided variant: a uniform is handed over and never read, or read and never handed over');
      assert.equal(US.uArenaKeyA.value.length, 4 * GLSL.CARPET_KEYS); assert.equal(US.uArenaKeyB.value.length, 4 * GLSL.CARPET_KEYS);
      const edge = RIG_HALL.tableKeys.edge, atS = (x, z) => GLSL.carpetLightAt(x, z, US, F);
      // under the south skirt at the table's middle: as without the side blades; past the corners: nothing of the key
      assert.ok(Math.abs(atS(0, edge.hz - 0.3).keys[iS] - at(0, edge.hz - 0.3).keys[iS]) < 1e-9, 'a side blade cuts the key between its legs');
      assert.ok(atS(edge.hx + 0.8, edge.hz - 0.1).keys[iS] < 1e-6 && atS(-edge.hx - 0.8, edge.hz - 0.1).keys[iS] < 1e-6, 'the south key runs on past the corners');
      assert.ok(atS(-edge.hx + 0.3, edge.hz + 0.9).keys[iW] < 1e-6 && atS(-edge.hx + 0.3, -edge.hz - 0.9).keys[iW] < 1e-6, 'the west key runs on past the corners');
      for (let x = -5; x <= 5; x += 0.5) for (let z = -3.5; z <= 3.5; z += 0.5) { const q = atS(x, z), q0 = at(x, z); for (let i = 0; i < 4; i++) assert.ok(q.keys[i] <= q0.keys[i] + 1e-12, 'a side blade adds light'); }
    }
  }
  assert.ok(Math.hypot(...c.grad) < 0.05 * c.sum, 'under the rig the light has a direction');
  // never more than a third of the carpet's level anywhere on the island (a pile, not a mirror)
  for (let x = -5; x <= 5; x += 0.5) for (let z = -3.5; z <= 3.5; z += 0.5) { const q = at(x, z); assert.ok(contrast(q) < 0.34 && contrastZ(q) < 0.34, `the nap's contrast at (${x}, ${z}) is ${Math.max(contrast(q), contrastZ(q)).toFixed(3)}`); }
  // tape and chairs as built: six pieces at the most, each a tape's width across; two worn patches at the chairs
  for (const tier of ['base', 'high']) {
    const bu = built[tier].shell.uniforms;
    if (!V4) { assert.ok(!bu.uArenaMark, `${tier}: v3 carries tape`); continue; }
    assert.equal(bu.uArenaMark.value.length, 4 * GLSL.CARPET_MARKS); assert.equal(bu.uArenaKeyP.value.length, 4 * GLSL.CARPET_KEYS);
    assert.equal(built[tier].shell.floor.material.userData.arenaCarpetKeys, 4, `${tier}: the floor reads ${built[tier].shell.floor.material.userData.arenaCarpetKeys} keys`);
    const isl = built[tier].shell.plan.island;
    for (let i = 0; i < GLSL.CARPET_MARKS; i++) {
      const [mx, mz, hx, hz] = bu.uArenaMark.value.slice(4 * i, 4 * i + 4);
      if (hx === 0 && hz === 0) continue;
      assert.ok(Math.min(hx, hz) <= 0.03 && Math.max(hx, hz) <= 0.25, `${tier}: tape piece ${i} is ${2 * hx} x ${2 * hz} m`);
      assert.ok(mx - hx > isl.x0 && mx + hx < isl.x1 && mz - hz > isl.z0 && mz + hz < isl.z1, `${tier}: tape piece ${i} leaves the island`);
      assert.ok(Math.abs(mx) - hx > 1.4478 || Math.abs(mz) - hz > 0.8128, `${tier}: tape piece ${i} lies under the table`);
    }
    for (let i = 0; i < 2; i++) { const [sx, sz, r] = bu.uArenaSeat.value.slice(4 * i, 4 * i + 3); const ch = ARENA.floor.chairs[i]; assert.ok(Math.hypot(sx - ch.x, sz - ch.z) < 0.8 && Math.hypot(sx, sz) < Math.hypot(ch.x, ch.z) && r <= 0.8, `${tier}: the worn patch ${i}`); }
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(bu.uArenaKeyP.value[4 * i + 3] - keys[i].i) < 1e-9 && Math.abs(bu.uArenaKeyP.value[4 * i] - keys[i].p[0]) < 1e-9, `${tier}: key ${i} is not the rig's`);
  }
  console.log(`   carpet v4: south of the table the key ${s.keys[iS].toFixed(2)} of ${s.sum.toFixed(2)} units, contrast toward / away ${(100 * contrast(s)).toFixed(1)} % (x-lay) ${(100 * contrastZ(s)).toFixed(1)} % (z-lay); behind the head rail ${w.keys[iW].toFixed(2)} of ${w.sum.toFixed(2)}, ${(100 * contrast(w)).toFixed(1)} %; north ${n.keys[iN].toFixed(2)} of ${n.sum.toFixed(2)}, ${(100 * contrast(n)).toFixed(1)} % / ${(100 * contrastZ(n)).toFixed(1)} %`);
});

ok('carpet, round A7 (patch v5): ONE lay by a fitter\'s hand, soft lanes, the pile pressed flat where people walk; the sided v4 text with four lines replaced', () => {
  const K5 = GLSL.CARPET_5;
  // the text: every replaced line was found once; v5 differs from the sided v4 text in those lines and nowhere else
  assert.equal(typeof GLSL.CARPET_COLOR_5, 'string', 'a line v5 replaces was not found in the sided v4 text');
  assert.equal(GLSL.CARPET_SWAPS_5.length, 4);
  let back = GLSL.CARPET_COLOR_5;
  for (const [a, b] of GLSL.CARPET_SWAPS_5) { assert.equal(GLSL.CARPET_COLOR_4S.split(a).length, 2, `not once in v4s: ${a}`); assert.equal(back.split(b).length, 2, `not once in v5: ${b}`); back = back.replace(b, a); }
  assert.equal(back, GLSL.CARPET_COLOR_4S, 'v5 differs from the sided v4 text outside its four lines');
  // no regular checker: a tile's direction no longer depends on the parity of its place
  assert.ok(!/mod\( aTi\.x \+ aTi\.y/.test(GLSL.CARPET_COLOR_5) && /float aTurn = step\( aH1, uArenaLay\.y \);/.test(GLSL.CARPET_COLOR_5));
  // nothing adds light, nothing reads another sampler; the camera is read where v4 reads it and nowhere else
  assert.ok(!/reflectedLight|totalEmissiveRadiance|outgoingLight|gl_FragColor|diffuseColor\.rgb\s*\+=|texture2D|texture\(/.test(GLSL.CARPET_COLOR_5));
  assert.equal(GLSL.CARPET_COLOR_5.split('cameraPosition').length, GLSL.CARPET_COLOR_4S.split('cameraPosition').length);
  // the uniforms: the sided set plus the hand's row, declared, read and handed over
  const keys = outerPlan(ARENA, { floorY: F }).heads.filter((h) => h.key).map((h) => { const k = RIG_HALL.tableKeys.keys.find((q) => q.id === h.key); return { p: h.lens.slice(), d: h.dir.slice(), i: k.intensity, cone: k.cone ?? RIG_HALL.tableKeys.cone, n: tableKeyShutter(h.lens, k.rail), sides: tableKeySides(h.lens, k.rail) }; });
  const hand = { off: K5.off, soft: K5.soft, flat: K5.flat };
  const U5 = GLSL.carpetUniforms4(shellPlan(ARENA, 2), { gaps: ARENA.boards.gaps, keys, floorY: F, chairs: ARENA.floor.chairs, look4: { ...GLSL.CARPET_4, sides: 1, nap: K5.nap, flip: K5.flip, swap: K5.swap, leanSpread: K5.leanSpread, hand } });
  const spec5 = GLSL.carpetPatchSpec4(U5);
  assert.equal(spec5.key, 'arena-carpet-v5'); assert.equal(spec5.pars, GLSL.CARPET_PARS_5); assert.equal(spec5.apply[0].code, GLSL.CARPET_COLOR_5);
  assert.deepEqual(spec5.apply.map((x) => [x.anchor, x.mode]), [['#include <color_fragment>', 'after'], ['#include <roughnessmap_fragment>', 'after']]);
  const used = new Set([...`${GLSL.CARPET_COLOR_5}${GLSL.CARPET_ROUGH_4}`.matchAll(/\buArena[A-Za-z]+/g)].map((x) => x[0]));
  for (const name of used) assert.ok(new RegExp(`uniform vec4 ${name}[; \\[]`).test(GLSL.CARPET_PARS_5), `${name} is not declared`);
  assert.deepEqual([...used].sort(), Object.keys(U5).sort(), 'v5: a uniform is handed over and never read, or read and never handed over');
  assert.deepEqual(U5.uArenaHand.value, [K5.off, K5.soft, K5.flat, 0]);
  assert.deepEqual(U5.uArenaLay.value, [K5.flip, K5.swap, K5.leanSpread, GLSL.CARPET_4.lot]);
  // without the hand's row, or without side blades, the patch is what it was
  const U4s = GLSL.carpetUniforms4(shellPlan(ARENA, 2), { gaps: ARENA.boards.gaps, keys, floorY: F, chairs: ARENA.floor.chairs, look4: { ...GLSL.CARPET_4, sides: 1 } });
  assert.ok(!U4s.uArenaHand && GLSL.carpetPatchSpec4(U4s).key === 'arena-carpet-v4s');
  const U4 = GLSL.carpetUniforms4(shellPlan(ARENA, 2), { gaps: ARENA.boards.gaps, keys: keys.map(({ sides, ...k }) => k), floorY: F, chairs: ARENA.floor.chairs, look4: { ...GLSL.CARPET_4, sides: 1, hand } });
  assert.ok(!U4.uArenaHand && GLSL.carpetPatchSpec4(U4).key === 'arena-carpet-v4');
  // the look: a small share of stray tiles, a tile at most a few degrees off the line, lanes weaker than a tile's
  // lay and soft-edged, the pile pressed nearly flat where people walk; the nap no stronger than v4's
  assert.ok(K5.flip + K5.swap <= 0.2 && K5.off > 0.05 && K5.off <= 0.3 && K5.tracks > GLSL.CARPET.tracks && K5.tracks <= 0.8 && K5.soft >= 0.5 && K5.flat >= 0.45 && K5.flat <= 1 && K5.nap <= 0.24 && K5.eye >= 1 && K5.eye <= 1.6);
  // (the lean against the eye under v5: the hall's row x v5's factor; with the hall's row at 0, the off arm, it is 0)
  assert.ok(Math.abs(U5.uArenaPile.value[1] - GLSL.CARPET.lean * K5.eye) < 1e-12 && U4s.uArenaPile.value[1] === GLSL.CARPET.lean);
  assert.equal(GLSL.carpetUniforms4(shellPlan(ARENA, 2), { gaps: ARENA.boards.gaps, keys, floorY: F, chairs: ARENA.floor.chairs, look: { ...GLSL.CARPET, lean: 0 }, look4: { ...GLSL.CARPET_4, sides: 1, hand } }).uArenaPile.value[1], 0);
  // the compiled floor text with v5: the room light's and the occlusion service's text still land, once
  const std = THREE.ShaderLib.standard;
  const r = applyPatchText(std.vertexShader, std.fragmentShader, spec5);
  assert.ok(r.ok, `v5: anchors missed: ${r.missed}`);
  assert.equal(r.fs.split('float arenaTapeK = 0.0;').length - 1, 1); assert.equal(r.fs.split('uniform vec4 uArenaHand;').length - 1, 1);
  // as built: the levels' switch
  for (const t of ['base', 'high']) {
    const bu = built[t].shell.floor.material.userData.arenaCarpet;
    if (LV.carpetV5 > 0 && bu.uArenaKeyA) { assert.deepEqual(bu.uArenaHand.value, [LV.carpetOff5, LV.carpetSoft5, LV.carpetFlat5, 0]); assert.equal(bu.uArenaWalk.value[3], LV.carpetTracks5); assert.equal(bu.uArenaRig.value[3], LV.carpetNap5); }
    else assert.ok(!bu.uArenaHand, `${t}: the hand's row without the v5 switch`);
  }
  console.log(`   carpet v5: ${LV.carpetV5 > 0 ? 'ON' : 'off (dark)'}; lanes ${K5.tracks} (v4 ${GLSL.CARPET.tracks}), strays ${K5.flip} + ${K5.swap}, off the line ${K5.off}, flat ${K5.flat}`);
});

ok('light map: six charts (the floor, the backdrop, four drape walls) in that order; the layout is the declared one; no pleat face outside its wall\'s chart', () => {
  for (const [tier, b] of Object.entries(built)) {
    const lm = b.shell.lightmap, s = b.shell;
    assert.equal(lm.size, 1024);
    // exactly the six declared charts: a drape face turned more than 80 degrees from its wall would have made a chart of its own
    // (round A6, with the level `roofChart`: two more, the roof's lid in two halves of the kind `roof`, AFTER the six,
    // in the atlas's free corner: the six keep their rectangles and their scale to the texel)
    const lid = LV.roofChart > 0;
    assert.deepEqual(lm.charts.map((c) => [c.kind, c.of]), [['floor', 'floor'], ['wall', 'wall:backdrop'], ['wall', 'wall:north'], ['wall', 'wall:east'], ['wall', 'wall:south'], ['wall', 'wall:west'], ...(lid ? [['roof', 'roof:0'], ['roof', 'roof:1']] : [])], tier);
    // declared in scratch/shell/GEOMETRY-STABLE.md
    assert.deepEqual(lm.charts.map((c) => [c.x, c.y, c.w, c.h, c.rot]), [...DECLARED_CHARTS, ...(lid ? DECLARED_ROOF_CHARTS : [])], `${tier}: the atlas moved: ${JSON.stringify(lm.charts.map((c) => [c.x, c.y, c.w, c.h, c.rot]))} at ${lm.scale} texels per metre`);
    assert.equal(lm.scale, DECLARED_SCALE);
    assert.deepEqual(s.lightmapMeshes.map((m) => m.name), ['arenaHallCarpet', 'arenaHallBackdrop', 'arenaHallDrape', ...(lid ? ['arenaHallRoof'] : [])]);
    if (lid) {
      // the lid's mesh: every vertex on one of the two half charts (6 = north of the hall's centre line, 7 = south), a
      // light-map UV inside that chart's rectangle, at the lid or a rib's depth under it; the lid's plane covers the
      // hall exactly once; nothing of the lid is left in the matt mesh (no matt face in the lid's plane)
      const rg = s.meshes.roof.geometry, rc = rg.userData.lm.chart, ru = rg.attributes.lm, rp = rg.attributes.position, Yl = F + ARENA.hall.height;
      let lidArea = 0;
      for (let i = 0; i < rp.count; i++) {
        assert.ok(rc[i] === 6 || rc[i] === 7, `${tier}: roof vertex ${i} is on chart ${rc[i]}`);
        assert.equal(rc[i], rp.getZ(i) < -1e-6 ? 6 : rp.getZ(i) > 1e-6 ? 7 : rc[i], `${tier}: roof vertex ${i} at z ${rp.getZ(i)} is on chart ${rc[i]}`);
        const c = lm.charts[rc[i]], u = ru.getX(i) * lm.size, v = ru.getY(i) * lm.size;
        assert.ok(u >= c.x - 1e-3 && u <= c.x + c.w + 1e-3 && v >= c.y - 1e-3 && v <= c.y + c.h + 1e-3, `${tier}: roof vertex ${i} leaves its chart (${u.toFixed(1)}, ${v.toFixed(1)})`);
        assert.ok(rp.getY(i) <= Yl + 1e-6 && rp.getY(i) >= Yl - PLAN.roof.ribDepth - 1e-6, `${tier}: roof vertex ${i} at ${rp.getY(i) - F} m`);
      }
      const rix = rg.index;
      for (let i = 0; i < rix.count; i += 3) {
        const [a, c2, d] = [rix.getX(i), rix.getX(i + 1), rix.getX(i + 2)];
        if (Math.abs(rp.getY(a) - Yl) > 1e-6 || Math.abs(rp.getY(c2) - Yl) > 1e-6 || Math.abs(rp.getY(d) - Yl) > 1e-6) continue;
        lidArea += Math.abs((rp.getX(c2) - rp.getX(a)) * (rp.getZ(d) - rp.getZ(a)) - (rp.getX(d) - rp.getX(a)) * (rp.getZ(c2) - rp.getZ(a))) / 2;
      }
      assert.ok(Math.abs(lidArea - (ARENA.hall.x1 - ARENA.hall.x0) * (ARENA.hall.z1 - ARENA.hall.z0)) < 1e-2, `${tier}: the lid's plane covers ${lidArea} m2`);
      const mp = s.meshes.matt.geometry.attributes.position, mi = s.meshes.matt.geometry.index;
      for (let i = 0; i < mi.count; i += 3) assert.ok(![0, 1, 2].every((k) => Math.abs(mp.getY(mi.getX(i + k)) - Yl) < 1e-6 && Math.abs(s.meshes.matt.geometry.attributes.normal.getY(mi.getX(i + k)) + 1) < 1e-6), `${tier}: a matt face lies in the lid's plane`);
      assert.ok(/\|lm/.test(s.materials.roof.userData.clubRoom) || /\|-\|-/.test(s.materials.roof.userData.clubRoom), s.materials.roof.userData.clubRoom);
      assert.ok(!/\|ts\||\|tb|hide/.test(s.materials.roof.userData.clubRoom), `${tier}: the lid's material carries a floor or a cut switch`);
    }
    // every drape vertex has a chart, a light-map UV inside the atlas and a normal that looks into the hall
    const g = s.meshes.drape.geometry, chart = g.userData.lm.chart, lmUv = g.attributes.lm, pos = g.attributes.position, nor = g.attributes.normal, side = g.attributes.roomSide;
    const wallN = { 2: [0, 1], 3: [-1, 0], 4: [0, -1], 5: [1, 0] }; // chart -> its wall's inward normal (x, z)
    let marked = 0;
    for (let i = 0; i < pos.count; i++) {
      assert.ok(chart[i] >= 2 && chart[i] <= 5, `${tier}: drape vertex ${i} is on chart ${chart[i]}`);
      assert.ok(lmUv.getX(i) > 0 && lmUv.getX(i) < 1 && lmUv.getY(i) > 0 && lmUv.getY(i) < 1);
      assert.ok(pos.getY(i) <= F + s.plan.drape.height + 1e-6, `${tier}: the drape rises over its pipe`);
      assert.ok(nor.getX(i) * wallN[chart[i]][0] + nor.getZ(i) * wallN[chart[i]][1] > 0.17, `${tier}: drape normal ${i} looks out of the hall`);
      assert.ok(side.getX(i) === 0 || side.getX(i) === 0.25, `${tier}: roomSide ${side.getX(i)}`);
      if (side.getX(i) === 0.25) marked += 1;
    }
    // (lite, round A5: flat cloth, no painted valley for a map to replace: no mark)
    if (tier === 'lite') assert.equal(marked, 0, 'lite: flat cloth carries a valley mark');
    else assert.ok(marked > 0.15 * pos.count && marked < 0.6 * pos.count, `${tier}: ${marked} of ${pos.count} drape vertices carry the valley mark`);
    assert.ok(/\|lm|\|-\|hide$|hide/.test(s.materials.drape.userData.clubRoom), s.materials.drape.userData.clubRoom);
    // every drape triangle faces within the chart's cone of its wall (the geometric normal, as the atlas classifies it)
    const ix = g.index; let worst = 1;
    const A3 = new THREE.Vector3(), B3 = new THREE.Vector3(), C3 = new THREE.Vector3(), N3 = new THREE.Vector3();
    for (let i = 0; i < ix.count; i += 3) {
      A3.fromBufferAttribute(pos, ix.getX(i)); B3.fromBufferAttribute(pos, ix.getX(i + 1)); C3.fromBufferAttribute(pos, ix.getX(i + 2));
      N3.subVectors(B3, A3).cross(C3.sub(A3));
      if (N3.lengthSq() < 1e-12) continue;
      N3.normalize();
      const n = wallN[chart[ix.getX(i)]];
      worst = Math.min(worst, N3.x * n[0] + N3.z * n[1]);
    }
    assert.ok(worst > 0.17, `${tier}: a drape face is ${(Math.acos(worst) * 180 / Math.PI).toFixed(1)} degrees off its wall (the chart's cone is 80)`);
  }
  console.log(`   atlas: ${JSON.stringify(built.high.shell.lightmap.charts.map((c) => [c.x, c.y, c.w, c.h, c.rot]))} at ${built.high.shell.lightmap.scale} texels per metre (floor), walls x 0.8`);
});

ok('emitters: the shell registers its share (4) and nothing else; the built ones are the plan\'s', () => {
  for (const [tier, b] of Object.entries(built)) {
    const own = b.emitters.filter((e) => e.id.startsWith('hall.'));
    assert.equal(b.emitters.length, own.length, `${tier}: an emitter without the hall's prefix`);
    assert.ok(own.length <= 4, `${tier}: ${own.length} emitters`);
    assert.deepEqual(own.map((e) => e.id), b.shell.emitterIds);
    const plan = b.shell.plan;
    own.forEach((e, i) => { assert.deepEqual([e.p[0], +(e.p[1] - F).toFixed(6), e.p[2]], plan.emitters[i].p); assert.deepEqual(e.size, plan.emitters[i].size); });
    // (round A6: the builder hands the plan its geometry options from its level table: the exit doors' deeper reveal)
    assert.equal(b.shell.signature(), shellSignature(planOf(TIERS[tier].roomDetail)));
    // round A5 (CONTRACT 17.1, 17.2: the walls fall to black): the battens stand on the floor behind their blocks
    // and graze the cloth upward with a SHORT reach: by the room light's tube law on the flat wall plane their light
    // is kept in the wall's lower third and is gone from 6 m up (the hall is 9.3 m high); the wash keeps its long one
    const batten = own.filter((e) => e.id.startsWith('hall.house.'));
    assert.ok(batten.length >= 1 && batten.every((e) => e.radius === HALL.houseReach && e.intensity === HALL.house), `${tier}: a batten's level or reach is not the hall's`);
    assert.equal(own[0].radius, LV.washReach);
    // (round A6: 190 at 5.5 m -> 300 at 5.0 m: more in the lower third, the upper half as it was; the level is bounded
    // by what it leaves in the upper half, below, not by a number of round A5)
    assert.ok(HALL.houseReach <= 5.5 && HALL.house <= 320, 'the battens lift the walls again');
    const pe = plan.emitters.find((e) => e.id === 'hall.house.north'), offW = Math.abs(pe.p[2] - plan.hall.z0);
    const on = (h, reach) => { const ly = h - pe.p[1], d2 = ly * ly + offW * offW, d = Math.sqrt(d2); let w = d2 / (reach * reach); if (w >= 1) return 0; w = (1 - w * w) ** 2; return HALL.house * w * (offW / d) / (d2 + (pe.size[0] / 2) * d + pe.size[1] * pe.size[1]); };
    assert.ok(on(3, HALL.houseReach) > 0.9 * on(3, 9) && on(3, HALL.houseReach) > 0.6, `${tier}: the lower third lost its batten (${on(3, HALL.houseReach)} units at 3 m)`);
    assert.ok(on(plan.hall.height / 2, HALL.houseReach) < 0.18 && on(5, HALL.houseReach) < 0.1 && on(6.2, HALL.houseReach) === 0, `${tier}: the battens reach the upper half (${on(5, HALL.houseReach)} units at 5 m)`);
  }
});

// ---- 4. the canvases -------------------------------------------------------------------------------------------------------
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const meanOf = (cv) => { const d = cv.image.data; let s = 0; for (let i = 0; i < d.length; i += 4) s += lin(d[i]); return s / (d.length / 4); };
ok('canvases: the carpet\'s mean is the stated one; grey; the pile normal is a unit map around straight up', () => {
  if (hadDocument) return;
  for (const [size, loops] of [[256, 80], [512, 160]]) {
    const cv = TEX.carpetColor(size, loops);
    assert.ok(Math.abs(meanOf(cv) - TEX.CARPET_MEAN) < 0.006, `carpet ${size}: mean ${meanOf(cv)}`);
    const d = cv.image.data; for (let i = 0; i < d.length; i += 4096) assert.ok(d[i] === d[i + 1] && d[i] === d[i + 2] && d[i + 3] === 255);
    assert.deepEqual(cv.calls.filter((c) => !['createImageData', 'putImageData'].includes(c)), [], 'a canvas call other than the pixel loop');
  }
  const n = TEX.pileNormal(256, 80), d = n.image.data; let sx = 0, sy = 0, minZ = 255;
  for (let i = 0; i < d.length; i += 4) { sx += d[i] - 127.5; sy += d[i + 1] - 127.5; minZ = Math.min(minZ, d[i + 2]); }
  assert.ok(Math.abs(sx / (d.length / 4)) < 1.5 && Math.abs(sy / (d.length / 4)) < 1.5 && minZ > 140, `pile normal: mean tilt ${sx / (d.length / 4)}, ${sy / (d.length / 4)}, lowest z ${minZ}`);
});

ok('backdrop: every floor light leaves its own scallop at the foot of the cloth; they merge up the wall; the map stays under its peak', () => {
  const p = shellPlan(ARENA, 1), bd = ARENA.backdrop, len = bd.z1 - bd.z0;
  const lights = p.lights.map((u) => ({ s: bd.z1 - u.z }));
  const gw = 256, gh = 128;
  const S = TEX.washScallops(gw, gh, { length: len, height: bd.height, lights, light: p.light });
  const row = (r) => Array.from({ length: gw }, (_, c) => S[r * gw + c]);
  const peaks = (a) => { let n = 0; for (let c = 1; c < gw - 1; c++) if (a[c] > a[c - 1] && a[c] >= a[c + 1] && a[c] > 0.4) n += 1; return n; };
  const low = row(Math.floor((0.35 / bd.height) * gh)), high = row(Math.floor((5.5 / bd.height) * gh));
  // every row holds the same share of light (the fall-off up the cloth is the emitter's); nothing is over 1; one point is 1
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const m0 = mean(row(0)); let top = 0;
  for (let r = 0; r < gh; r++) { const a = row(r); assert.ok(Math.abs(mean(a) - m0) < 1e-5 && Math.max(...a) <= 1 + 1e-6 && Math.min(...a) >= 0, `row ${r}: mean ${mean(a)}`); top = Math.max(top, ...a); }
  assert.ok(Math.abs(top - 1) < 1e-5 && m0 > 0.2 && m0 < 0.6, `peak ${top}, row mean ${m0}`);
  const rel = (a) => { const p = Math.max(...a); return a.map((v) => v / p); };
  const lowR = rel(low), highR = rel(high);
  const peaksOf = (a) => { let n = 0; for (let c = 1; c < gw - 1; c++) if (a[c] > a[c - 1] && a[c] >= a[c + 1] && a[c] > 0.4) n += 1; return n; };
  assert.equal(peaksOf(lowR), lights.length, `scallops at the foot: ${peaksOf(lowR)} for ${lights.length} lights`);
  const inner = (a) => a.slice(Math.floor(gw * 0.15), Math.floor(gw * 0.85));
  assert.ok(Math.min(...inner(lowR)) < 0.55, `between two lights at the foot the cloth is at ${Math.min(...inner(lowR)).toFixed(2)} of the peak (no scallop)`);
  assert.ok(Math.min(...inner(highR)) > 0.6, `at 5.5 m the beams have not merged: ${Math.min(...inner(highR)).toFixed(2)}`);
  // uneven: no two lights are aimed or dimmed alike (their peaks at 1.5 m differ)
  const mid = rel(row(Math.floor((1.5 / bd.height) * gh)));
  const at = lights.map((u) => mid[Math.min(gw - 1, Math.floor((u.s / len) * gw))]);
  assert.ok(Math.max(...at) - Math.min(...at) > 0.08, `the lights are all alike at 1.5 m: ${at.map((v) => v.toFixed(2))}`);
  console.log(`   backdrop: every row's share ${m0.toFixed(3)} of the brightest point; between two lights at the foot ${Math.min(...inner(lowR)).toFixed(2)}, at 5.5 m ${Math.min(...inner(highR)).toFixed(2)} of the row's peak`);
  if (hadDocument) return;
  // every row of the grid sums to zero about the share: the scallops move the wash's light along a row, they add none
  const share = TEX.scallopShare(S, gw);
  assert.ok(Math.abs(share - m0) < 1e-6);
  for (let r = 0; r < gh; r += 9) assert.ok(Math.abs(mean(row(r).map((v) => v / share - 1))) < 1e-4, `row ${r}: the scallop term's mean is not zero`);
  if (hadDocument) return;
  // ROUND A4: the scallops are LIGHT. The canvas's COLOUR is the cloth alone (no fan in it: the columns under a floor
  // light and between two lights are the same cloth to 3 %; no row is lighter than another by more than the rails'
  // ridges), and its ALPHA holds the grid (offset + scale x share), never under the offset.
  const W = 512, Hh = 256;
  const cv = TEX.backdropColor(W, Hh, { length: len, height: bd.height, modules: p.backdrop.modules, rails: p.backdrop.rails, lights, light: p.light });
  const d = cv.image.data;
  let max = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { const v = lin(d[i]); max = Math.max(max, v); sum += v; }
  assert.ok(Math.abs(sum / (W * Hh) - TEX.BACKDROP_MEAN) < 0.003 && max < 1.3 * TEX.BACKDROP_MEAN, `backdrop colour: mean ${sum / (W * Hh)}, peak ${max}`);
  const colMean = (x0c, x1c, y0c, y1c) => { let s = 0, n = 0; for (let y = y0c; y < y1c; y++) for (let x = x0c; x < x1c; x++) { s += lin(d[4 * (y * W + x)]); n += 1; } return s / n; };
  const footRows = [Math.floor(Hh * (1 - 1.0 / bd.height)), Hh - 2];      // the lowest metre of the cloth
  const under = lights.slice(1, -1).map((u) => { const c = Math.floor((u.s / len) * W); return colMean(c - 6, c + 6, footRows[0], footRows[1]); });
  const between = lights.slice(1, -2).map((u, i) => { const c = Math.floor(((u.s + lights[i + 2].s) / 2 / len) * W); return colMean(c - 6, c + 6, footRows[0], footRows[1]); });
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  // (a seam over an upright stands exactly between two lights: 0.90 of the cloth in the 12 px block at most)
  assert.ok(Math.abs(avg(under) / avg(between) - 1) < 0.06, `the colour still holds a fan: under a light ${avg(under).toFixed(4)}, between two ${avg(between).toFixed(4)}`);
  assert.ok(Math.abs(colMean(0, W, 4, 40) / colMean(0, W, Hh - 40, Hh - 4) - 1) < 0.03, 'the colour\'s top is not its foot\'s cloth');
  const A0 = Math.round(255 * TEX.SCALLOP_ALPHA.offset);
  let aMin = 255, aMax = 0, worst = 0;
  for (let y = 0; y < Hh; y += 3) for (let x = 0; x < W; x += 3) {
    const a = d[4 * (y * W + x) + 3]; aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
    // decoded against the grid's nearest cell (the canvas is the grid, bilinear): within two grid steps' change
    const gx = Math.min(gw - 1, Math.floor(((x + 0.5) / W) * gw)), gy = Math.min(gh - 1, Math.floor((1 - (y + 0.5) / Hh) * gh));
    worst = Math.max(worst, Math.abs((a / 255 - TEX.SCALLOP_ALPHA.offset) / TEX.SCALLOP_ALPHA.scale - S[gy * gw + gx]));
  }
  assert.ok(aMin >= A0 && aMax === 255 && worst < 0.06, `backdrop alpha: ${aMin}..${aMax}, worst decode error ${worst}`);
  assert.ok(Math.abs(TEX.SCALLOP_ALPHA.offset + TEX.SCALLOP_ALPHA.scale - 1) < 1e-12 && TEX.SCALLOP_ALPHA.offset >= 0.25);
  assert.deepEqual(cv.calls.filter((c) => !['createImageData', 'putImageData'].includes(c)), []);
  console.log(`   backdrop map: colour mean ${(sum / (W * Hh)).toFixed(4)}, peak ${max.toFixed(3)}; under a light / between two ${(avg(under) / avg(between)).toFixed(3)}; alpha ${aMin}..${aMax}`);
});

// ---- 5. nothing is written, nothing is lit by a three light ------------------------------------------------------------------
ok('legal: no word, no text call, no font, no image file and no figure in any shell source', () => {
  const bad = [];
  for (const rel of FILES) {
    const src = stripComments(read(rel));
    for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      const lit = m[2].trim();
      if (!/^[A-Z0-9][A-Z0-9 \-]*$/.test(lit) || !/[A-Z]{2}|[A-Z][0-9 \-]+[A-Z0-9]|[0-9][ \-]?[A-Z]{2}/.test(lit)) continue;
      bad.push(`${rel}: "${lit}"`);
    }
    if (/\b(fillText|strokeText|measureText|drawText|layoutText)\b|\.font\s*=|TextGeometry|FontLoader/.test(src)) bad.push(`${rel}: a text call`);
    if (/\.(png|jpe?g|webp|svg|gif)['"`]/i.test(src)) bad.push(`${rel}: an image file`);
    if (/crowd|people|person|audience|spectator|silhouette|mannequin/i.test(src)) bad.push(`${rel}: names a person`);
    assert.ok(!/new\s+THREE\.\w*Light\s*\(/.test(src) && !/shadowMap|castShadow\s*=|receiveShadow\s*=/.test(src), `${rel} makes a light or touches shadows`);
    assert.ok(!/Math\.random\s*\(|performance\.now|Date\.now/.test(src), `${rel} is not the same on every load`);
    for (const m of src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) assert.ok(m[1] === 'three' || m[1].startsWith('./') || m[1].startsWith('../'), `${rel} imports ${m[1]}`);
  }
  assert.deepEqual(bad, []);
  // the canvases are filled by pixel loops only: the 2D calls the canvas file makes are these two
  const tex = stripComments(read('scene/club/arena/shell/tex.js'));
  assert.deepEqual([...new Set([...tex.matchAll(/\bc2\.(\w+)\(/g)].map((m) => m[1]))].sort(), ['createImageData', 'putImageData']);
  // materials come from the room light, never from three directly
  const shellSrc = stripComments(read('scene/club/arena/shell.js'));
  assert.ok(!/new\s+THREE\.Mesh\w+Material/.test(shellSrc), 'a material made outside the room light');
  // (five: the carpet, the drape, the matt mesh, the backdrop, and since round A6 the roof's lid on the light map)
  assert.equal((shellSrc.match(/roomLight\.material\(/g) ?? []).length, 5);
  assert.equal((shellSrc.match(/roomLight\.emissive\(/g) ?? []).length, 1);
  assert.ok(/name: 'arena\.hall\.carpet'/.test(shellSrc) && /tableShadow: true/.test(shellSrc));
});

ok('scans: the ids of CONTRACT 14.2, asked for on base and high only, never needed', () => {
  assert.deepEqual([SCANS.carpet.color, SCANS.carpet.normal, SCANS.carpet.rough, SCANS.cloth.normal], ['arena.carpet.color', 'arena.carpet.normal', 'arena.carpet.rough', 'arena.drape.normal']);
  assert.ok(SCANS.carpet.tile > 0 && PILE.tile > 0);
  for (const [tier, b] of Object.entries(built)) {
    assert.deepEqual(b.shell.assetIds, [], `${tier}: no asset service in this arm, no id asked`);
    assert.equal(b.shell.state().carpet.scan.color, 'code');
    assert.ok(b.shell.ready instanceof Promise);
  }
  // with an asset service: none on lite; the carpet's colour and normal and the cloth's normal on base; the roughness
  // scan on high only; a missing file leaves the code-drawn maps
  for (const tier of ['lite', 'base', 'high']) {
    const asked = [];
    const assets = { texture: (id, o) => { asked.push(id); return o?.fallback ?? new THREE.Texture(); }, ready: () => Promise.resolve(), state: () => ({ ids: {} }) };
    roomLight.reset(); roomLight.init({ club: { tier, knobs: TIERS[tier] }, envMap: null, tableBlock: true });
    const box = { min: new THREE.Vector3(ARENA.hall.x0, F, ARENA.hall.z0), max: new THREE.Vector3(ARENA.hall.x1, F + ARENA.hall.height, ARENA.hall.z1) };
    const s = buildShell({ club: { tier, knobs: TIERS[tier], assets }, roomLight, box, detail: TIERS[tier].roomDetail, levels: HALL, layout: ARENA });
    const want = { lite: [], base: ['arena.carpet.color', 'arena.carpet.normal', 'arena.drape.normal'], high: ['arena.carpet.color', 'arena.carpet.normal', 'arena.carpet.rough', 'arena.drape.normal'] }[tier];
    assert.deepEqual(s.assetIds, want, tier);
    assert.deepEqual([...new Set(asked.filter((id) => id.startsWith('arena.')))].sort(), want, `${tier}: ids asked`);
    assert.deepEqual([...new Set(asked.filter((id) => !id.startsWith('arena.')))], tier === 'base' ? ['felt.normal'] : [], `${tier}: club ids asked`);
  }
});

if (!hadDocument) delete globalThis.document;
if (failures.length) { console.log(`\ntest-club-arena-shell: ${failures.length} FAILED of ${passed + failures.length}: ${failures.join('; ')}`); process.exit(1); }
console.log(`\ntest-club-arena-shell: ${passed} arms OK`);
