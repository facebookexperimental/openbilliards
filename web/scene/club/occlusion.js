// Copyright (c) Meta Platforms, Inc. and affiliates.

// occlusion.js — the occlusion-and-shadow service of the club look (CONTRACT.md sections 4.2 and 8.4). Owner: integrator
// (CONTRACT.md section 10; rounds 1 and 1b: occ).
//
// Three things, all without a shadow-casting light, a shadow map or a per-frame render:
//   table map   a top-down RGBA8 atlas of the bed, cushions and rail tops, baked once per table and fixture on the GPU in
//               slices (occ/baker.js): the visible share of the rectangular lamp(s) with rails, cushions and pocket castings as
//               blockers, and the visible share of the room's ambient light (a room lit along its walls: the rails take most
//               of it near a cushion and a few percent 20 cm out). RG = a point at bed level, BA = a point on the top surface.
//   floor map   the same baker with the whole table as the blocker: the wide soft table shadow on the floor.
//   cue shadow  the cue as a tapered capsule under the rectangular lamp, in closed form in the receiver's shader
//               (occ/capsule.js); its pose is read every frame from the scene object named obCueStick.
// The terms reach the app's cloth, rail wood and aprons through club.adopt.patch (occ/glsl.js) as two visibilities, never as
// fixed darkening amounts: lamp visibility scales the direct light and the share of the indirect light that stands in for lamp
// light, ambient visibility scales the rest of the indirect light (and, as a look knob, a little of the direct). The club
// floor gets the floor map when the room service provides it.
//
// The lamp rectangle is read from the app's shared emitter uniforms (shading.js setEmitters: uLightPos / uLightHalf and their
// per-emitter arrays, reached through the GI handle's `uniforms`); nothing here carries a lamp number. Importing this module
// does nothing; everything starts in createOcclusion().
import * as THREE from 'three';
import { createBaker, bakeQuality } from './occ/baker.js';
import { occPatchSpec, OCC_GLSL, OCC_TABLE_GLSL, OCC_FLOOR_GLSL, OCC_PATCH_VERSION } from './occ/glsl.js';
import { cueShadowBounds } from './occ/capsule.js';
import { SKY, AMBIENT_REACH, FLOOR_AMBIENT_REACH, OCC_K, OCC_AMBIENT, OCC_LAMP_SHARE, UNDER_TABLE_AO, UNDER_TABLE_DIRECT, FLOOR_K, FEET, feetOf } from './occ/model.js';
import { isArena } from './tiers.js';

const BED_Y = 0;                 // the bed plane (CONTRACT.md section 1)
const TABLE_MARGIN = 0.03;       // open texels around the table outline, metres
const STABLE_FRAMES = 12;        // a table or fixture change must hold this long before a re-bake starts
const FADE_SECONDS = 0.5;        // the terms come in over this time after a bake that ends in plain sight
// The light model's numbers (strengths, the look knob CONTACT, the true-ambient share, the room's radiance profile, the
// under-table constants, the floor strengths) live in occ/model.js, where the node arm reads them.

const stub = (reason) => ({ enabled: false, reason });

export async function createOcclusion(club) {
  const ctx = club?.ctx ?? {};
  const renderer = ctx.renderer, scene = ctx.scene;
  if (!renderer?.isWebGLRenderer || !scene?.isObject3D) return stub('no renderer or scene');
  if (renderer.capabilities?.isWebGL2 === false) return stub('WebGL2 is required');
  const tier = club.tier ?? 'base';
  const quality = bakeQuality(tier);
  const atlasW = [256, 512, 1024, 2048].includes(club.knobs?.atlas) ? club.knobs.atlas : 1024;
  const atlasH = atlasW / 2;                      // the table is about 1.8 : 1
  const floorW = Math.max(256, atlasW / 2), floorH = floorW / 2;
  const floorQuality = { ...quality, steps: quality.steps * 2, rows: Math.max(8, quality.rows) };
  const baker = createBaker(renderer);
  const errors = [];

  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.name = 'club-occ-open';
  white.needsUpdate = true;

  // ---- shared uniform objects ----
  const lampU = {
    uClubLampPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, 1, 0)) },
    uClubLampHalf: { value: [0, 1, 2, 3].map(() => new THREE.Vector2(1, 0.3)) },
    uClubLampCount: { value: 0 },
    uClubLampRect: { value: new THREE.Vector4(0, 0, 1, 0.3) },
    uClubLampY: { value: 1 },
  };
  const tableU = {
    uClubVisMap: { value: white },
    uClubVisRect: { value: new THREE.Vector4(0, 0, 1, 1) },       // minX, minZ, 1 / sizeX, 1 / sizeZ
    uClubVisH: { value: new THREE.Vector4(BED_Y, 0.003, 0.028, 0.055) }, // bed y, blend start, blend end (above the bed), mouth radius
    uClubTableBox: { value: new THREE.Vector4(0, 0, 1.5, 0.8) },  // outline centre x, z, half x, half z
    uClubTableTop: { value: new THREE.Vector4(0.05, 0, UNDER_TABLE_AO, UNDER_TABLE_DIRECT) }, // rail-top y, on, ambient, direct floor
    uClubOccK: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClubOccLamp: { value: 0 },
    uClubOccAmbient: { value: OCC_AMBIENT },
  };
  const cueU = {
    uClubCueA: { value: new THREE.Vector3() },
    uClubCueB: { value: new THREE.Vector3(0, 0, 1) },
    uClubCueR: { value: new THREE.Vector2(0.006, 0.015) },
    uClubCueOn: { value: 0 },
    uClubCueBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const floorU = {
    uClubFloorMap: { value: white },
    uClubFloorRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uClubFloorK: { value: new THREE.Vector4(FLOOR_K[0], FLOOR_K[1], FLOOR_K[2], 0) },
  };
  // Round A6, the arena venue only (occ/model.js FEET): the contact line of the table's soles on the carpet. `feetOn` is
  // false under the club venue and while the switch is off: then nothing below builds, patches or reports anything of it.
  // Tools under arena: `?cluboccon=feet` = on whatever the default is; `?cluboccoff=feet` = off (the off arm of a pair).
  let feetOn = false;
  try {
    const onList = String(ctx.query?.get?.('cluboccon') ?? '').split(','), offList = String(ctx.query?.get?.('cluboccoff') ?? '').split(',');
    feetOn = isArena(club) && !offList.includes('feet') && (FEET.on === true || onList.includes('feet'));
  } catch { feetOn = false; }
  const feetU = feetOn ? { uClubFeet: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0.05, 0.05)) }, uClubFeetK: { value: new THREE.Vector4(0, FEET.depth, FEET.reach, 0) } } : null;
  const feetState = { list: [], depth: FEET.depth, reach: FEET.reach, floorY: null };
  const tablePatchU = { ...lampU, ...tableU, ...cueU };
  const facesOn = { value: 1 }, facesOff = { value: 0 }, facesPocket = { value: 2 };
  const giU = { uClubOccGi: { value: 0 } }; // how much of the app's baked lamp visibility is taken back out (0..1, follows the fade)

  // ---- the lamp(s), read live from the app ----
  let lampSource = 'none';
  let lampCache = [], lampScan = -1e9;
  const _v = new THREE.Vector3();
  function readLamps(frame) {
    const sh = ctx.gi?.uniforms ?? globalThis.__gi?.uniforms ?? null;
    if (sh?.uLightPos?.value?.isVector3 && sh?.uLightHalf?.value?.isVector2) {
      lampSource = 'shared emitter uniforms';
      const n = Math.max(1, Math.min(4, Math.round(Number(sh.uLightCount?.value) || 1)));
      const posN = sh.uLightPosN?.value, halfN = sh.uLightHalfN?.value;
      if (n === 1 || !Array.isArray(posN)) return [{ pos: sh.uLightPos.value, half: sh.uLightHalf.value }];
      const out = [];
      for (let i = 0; i < n; i++) out.push({ pos: posN[i] ?? sh.uLightPos.value, half: halfN?.[i] ?? sh.uLightHalf.value });
      return out;
    }
    // no shared uniforms (a dev page without the app's shading set): the visible RectAreaLights of the scene, re-read now and then
    if (frame - lampScan > 60) {
      lampScan = frame;
      lampCache = [];
      scene.traverseVisible((o) => {
        if (o.isRectAreaLight && lampCache.length < 4) lampCache.push({ pos: o.getWorldPosition(new THREE.Vector3()), half: new THREE.Vector2(o.width / 2, o.height / 2) });
      });
      lampSource = lampCache.length ? 'scene rect lights' : 'none';
    }
    return lampCache;
  }
  let lamps = [], lampPlain = [], lampPlainSig = null; // lampPlain: the same lamps as plain arrays, for the cue's culling rectangle
  function syncLamps(frame) {
    lamps = readLamps(frame).filter((l) => Number.isFinite(l.pos.x + l.pos.y + l.pos.z + l.half.x + l.half.y) && l.half.x > 0 && l.half.y > 0);
    const n = lamps.length;
    lampU.uClubLampCount.value = n;
    if (!n) return -1;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = Infinity, sig = n * 1000;
    for (let i = 0; i < 4; i++) {
      const l = lamps[Math.min(i, n - 1)];
      lampU.uClubLampPos.value[i].copy(l.pos);
      lampU.uClubLampHalf.value[i].copy(l.half);
      if (i >= n) continue;
      x0 = Math.min(x0, l.pos.x - l.half.x); x1 = Math.max(x1, l.pos.x + l.half.x);
      z0 = Math.min(z0, l.pos.z - l.half.y); z1 = Math.max(z1, l.pos.z + l.half.y);
      y = Math.min(y, l.pos.y);
      // a number rather than a string: this runs every frame
      sig += (i + 1) * (Math.round(l.pos.x * 1000) * 1.3 + Math.round(l.pos.y * 1000) * 2.9 + Math.round(l.pos.z * 1000) * 5.1 + Math.round(l.half.x * 1000) * 7.7 + Math.round(l.half.y * 1000) * 11.3);
    }
    lampU.uClubLampRect.value.set((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2);
    lampU.uClubLampY.value = y;
    if (sig !== lampPlainSig) { lampPlainSig = sig; lampPlain = lamps.map((l) => ({ pos: [l.pos.x, l.pos.y, l.pos.z], half: [l.half.x, l.half.y] })); }
    return sig;
  }

  // ---- the table and the floor plane ----
  const tableRoot = () => (ctx.table?.group?.isObject3D ? ctx.table.group : (scene.getObjectByName?.('obTable') ?? null));
  // a counter that moves when the table is rebuilt: another id, or other children under the same group
  const tableSeen = { root: null, id: null, n: -1, first: null, last: null, gen: 0 };
  function tableSignature() {
    const root = tableRoot();
    const ch = root?.children ?? [];
    const id = root?.userData?.tableId ?? null, first = ch[0] ?? null, last = ch[ch.length - 1] ?? null;
    const t = tableSeen;
    if (t.root !== root || t.id !== id || t.n !== ch.length || t.first !== first || t.last !== last) {
      t.root = root; t.id = id; t.n = ch.length; t.first = first; t.last = last; t.gen += 1;
    }
    return t.gen;
  }
  // lamps and table in one number
  const signature = (f) => syncLamps(f) * 4096 + tableSignature();
  const _box = new THREE.Box3();
  function readFloorY(tableBox) {
    const r = club.room;
    for (const v of [r?.floorY, r?.FLOOR_Y]) if (Number.isFinite(v)) return v;
    const mesh = (r?.enabled === true ? r.floor?.mesh : null) ?? ctx.room?.lightRefs?.floor ?? ctx.room?.giRefs?.floor ?? null;
    if (mesh?.isObject3D) {
      try { _box.setFromObject(mesh); if (Number.isFinite(_box.max.y)) return _box.max.y; } catch { /* fall through */ }
    }
    return tableBox.min.y; // the table stands on the floor
  }

  // ---- bakes ----
  const info = { bakes: 0, skipped: 0, lastReason: null, tableReady: false, floorReady: false, tableRect: null, floorRect: null, floorY: null, blockers: null, lampsAtBake: 0, heightRange: null };
  let job = null, raf = 0, tableFinal = null, floorFinal = null, fadeTarget = 0, keptScratch = [];
  let resolveTable, resolveFloor;
  const tableReady = new Promise((r) => { resolveTable = r; });
  const floorReady = new Promise((r) => { resolveFloor = r; });
  let bakedSig = null, wantSig = null, stable = 0, frame = 0, lastTableBox = null;
  let fade = 0;

  // tools only: fixed strengths and / or a constant map, to read one term at a time in a picture
  const debug = { k: null, map: null, lamp: null, ambient: null, off: [] };
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  black.needsUpdate = true;
  function writeStrengths() {
    const k = [...(debug.k ?? OCC_K)];
    const off = debug.off;
    // 'all': every term off and the app's baked lamp visibility back in: the frame of ?cluboff=occ without a rebuild
    const all = off.includes('all');
    if (all || off.includes('ao')) k[0] = k[1] = 0;
    if (off.includes('contact')) k[0] = 0;
    if (all || off.includes('lamp')) k[2] = 0;
    if (all || off.includes('cue')) k[3] = 0;
    const f = debug.k || debug.lamp !== null ? 1 : fade;
    tableU.uClubOccK.value.set(k[0] * f, k[1] * f, k[2] * f, k[3] * f);
    tableU.uClubOccLamp.value = all || off.includes('share') ? 0 : (debug.lamp ?? OCC_LAMP_SHARE) * f;
    tableU.uClubOccAmbient.value = debug.ambient ?? OCC_AMBIENT;
    // the app's baked lamp visibility stays out while one term is switched off for a picture: the pair then shows that term only
    giU.uClubOccGi.value = all ? 0 : fade;
    floorU.uClubFloorK.value.w = info.floorReady && !all && !off.includes('floor') ? FLOOR_K[3] * fade : 0;
    if (feetOn) feetU.uClubFeetK.value.set(feetState.list.length, all || off.includes('feet') ? 0 : feetState.depth, feetState.reach, 0);
    if (debug.map) tableU.uClubVisMap.value = debug.map === 'black' ? black : white;
    else if (tableFinal && fadeTarget > 0) tableU.uClubVisMap.value = tableFinal.texture;
  }
  /**
   * Tools only: one term at a time in a picture. setDebug({ off: ['lamp' | 'ao' | 'contact' | 'cue' | 'share' | 'floor' | 'all', ...],
   * k: [a, b, c, d] | null, lamp: cap of the lamp share | null, ambient: true-ambient share | null, map: 'black' | 'open' | null });
   * setDebug() clears it. The same `off` list comes from the query ?cluboccoff=lamp,ao,... (read once at start).
   */
  function setDebug({ k = null, map = null, lamp = null, ambient = null, off = [], feet = null } = {}) {
    // (round A6, with `feetOn` only: feet: [depth, reach in metres] holds the contact line's two numbers; anything else puts the model's back)
    if (feetOn) { feetState.depth = Array.isArray(feet) && Number.isFinite(feet[0]) ? feet[0] : FEET.depth; feetState.reach = Array.isArray(feet) && Number.isFinite(feet[1]) ? feet[1] : FEET.reach; }
    debug.k = Array.isArray(k) && k.length === 4 ? k.map(Number) : null;
    debug.lamp = Number.isFinite(lamp) ? lamp : null;
    debug.ambient = Number.isFinite(ambient) ? ambient : null;
    debug.off = (Array.isArray(off) ? off : String(off ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);
    debug.map = map === 'black' || map === 'open' ? map : null;
    writeStrengths();
    return { ...debug };
  }
  function cancelJob() {
    if (!job) return;
    // scratch targets go; a final map that is already bound (the table map of a bake dropped before its floor map) stays
    for (const p of job.plans) { const rt = p.result(); p.dispose(!!rt && (rt === tableFinal || rt === floorFinal)); }
    job = null;
  }
  function shaderFailed() {
    // no read-back: a broken bake shader shows only in the program diagnostics three keeps
    try {
      for (const p of renderer.info.programs ?? []) {
        if (/^club-occ-/.test(p.name ?? '') && p.diagnostics && p.diagnostics.runnable === false) return p.name;
      }
    } catch { /* unreadable */ }
    return null;
  }
  // Round A6, with `feetOn` only: the soles' footprints, from the table's own meshes (occ/model.js feetOf: the pieces whose
  // lowest points lie on the floor). Read with every bake start (a rebuilt table, a moved floor); a table that does not
  // stand on this floor (a gap over FEET.slab) has no sole and gets no line.
  function readFeet(root, floorY) {
    if (!feetOn) return;
    try {
      const pieces = [];
      root.updateWorldMatrix(true, true);
      root.traverse((o) => {
        const pos = o.isMesh && !o.isInstancedMesh && o.visible !== false ? o.geometry?.attributes?.position : null;
        if (!pos || !(pos.count > 0)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (!(_box.min.y <= floorY + FEET.slab) || _box.max.y < floorY - FEET.slab) return;
        const points = [];
        for (let i = 0; i < pos.count; i += 1) { _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); points.push([_v.x, _v.y, _v.z]); }
        pieces.push({ points });
      });
      const list = feetOf(pieces, floorY);
      list.forEach((f, i) => feetU.uClubFeet.value[i].set(f.x, f.z, f.hx, f.hz));
      feetState.list = list.map((f) => ({ x: +f.x.toFixed(4), z: +f.z.toFixed(4), hx: +f.hx.toFixed(4), hz: +f.hz.toFixed(4) }));
      feetState.floorY = +floorY.toFixed(4);
    } catch (e) { feetState.list = []; errors.push(`feet: ${e?.message ?? e}`); }
    writeStrengths();
  }
  function startBake(reason) {
    cancelJob();
    const root = tableRoot();
    if (!root || !lamps.length) { info.lastReason = `${reason}: skipped (${root ? 'no lamp' : 'no table'})`; return false; }
    const blockers = baker.collectBlockers(root);
    const box = blockers.box;
    if (box.isEmpty() || !(box.max.x - box.min.x > 0.2)) { info.lastReason = `${reason}: skipped (empty table)`; return false; }
    lastTableBox = box.clone();
    readFeet(root, readFloorY(box));
    applyPatches(); // a rebuilt table can carry new material instances
    const bakeLamps = lamps.map((l) => ({ pos: l.pos.clone(), half: l.half.clone() }));
    const lampY = Math.min(...bakeLamps.map((l) => l.pos.y));
    const top = Math.min(box.max.y, lampY - 0.05);
    const yTop = top + 0.004;
    info.heightRange = [BED_Y - 0.12, yTop + 0.01]; // the 16-bit height range of the table bake (tools read the scratch maps with it)
    const rect = { minX: box.min.x - TABLE_MARGIN, minZ: box.min.z - TABLE_MARGIN, sizeX: box.max.x - box.min.x + 2 * TABLE_MARGIN, sizeZ: box.max.z - box.min.z + 2 * TABLE_MARGIN };
    const tablePlan = baker.plan({
      blockers, rect, size: [atlasW, atlasH], lamps: bakeLamps, quality,
      y: { lo: BED_Y - 0.12, hi: yTop + 0.01, base: BED_Y + 0.0015, start: BED_Y + 0.001, top: yTop },
      raisedAbove: BED_Y + 0.003, ao: { reach: AMBIENT_REACH, sky: SKY },
      outline: { cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, hx: (box.max.x - box.min.x) / 2, hz: (box.max.z - box.min.z) / 2 },
    });
    // the floor rectangle: the table outline pushed out to where the lamp's far edge still grazes the table top
    const floorY = readFloorY(box);
    const k = (lampY - floorY) / Math.max(lampY - top, 0.05);
    let fx0 = box.min.x, fx1 = box.max.x, fz0 = box.min.z, fz1 = box.max.z;
    for (const l of bakeLamps) {
      fx1 = Math.max(fx1, l.pos.x - l.half.x + (box.max.x - (l.pos.x - l.half.x)) * k);
      fx0 = Math.min(fx0, l.pos.x + l.half.x + (box.min.x - (l.pos.x + l.half.x)) * k);
      fz1 = Math.max(fz1, l.pos.z - l.half.y + (box.max.z - (l.pos.z - l.half.y)) * k);
      fz0 = Math.min(fz0, l.pos.z + l.half.y + (box.min.z - (l.pos.z + l.half.y)) * k);
    }
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    fx0 = Math.max(fx0 - 0.3, cx - 6); fx1 = Math.min(fx1 + 0.3, cx + 6); fz0 = Math.max(fz0 - 0.3, cz - 6); fz1 = Math.min(fz1 + 0.3, cz + 6);
    const frect = { minX: fx0, minZ: fz0, sizeX: fx1 - fx0, sizeZ: fz1 - fz0 };
    const floorPlan = baker.plan({
      blockers, rect: frect, size: [floorW, floorH], lamps: bakeLamps, quality: floorQuality,
      y: { lo: floorY - 0.01, hi: yTop + 0.01, base: floorY + 0.004, start: floorY + 0.003, top: yTop },
      // the ambient term must have faded out before the edge of the floor map: its reach is the narrowest margin around the table
      raisedAbove: Infinity, ao: { reach: Math.max(0.6, Math.min(FLOOR_AMBIENT_REACH, box.min.x - fx0, fx1 - box.max.x, box.min.z - fz0, fz1 - box.max.z)), sky: SKY },
    });
    const finishTable = () => {
      const rt = tablePlan.result();
      rt.texture.name = 'club-occ-table';
      tableU.uClubVisMap.value = rt.texture;
      tableU.uClubVisRect.value.set(rect.minX, rect.minZ, 1 / rect.sizeX, 1 / rect.sizeZ);
      tableU.uClubTableBox.value.set(cx, cz, (box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2);
      tableU.uClubTableTop.value.set(top, 1, UNDER_TABLE_AO, UNDER_TABLE_DIRECT);
      if (tableFinal && tableFinal !== rt) baker.release(tableFinal);
      tableFinal = rt;
      info.tableReady = true; info.tableRect = rect;
      resolveTable();
    };
    const finishFloor = () => {
      const rt = floorPlan.result();
      rt.texture.name = 'club-occ-floor';
      floorU.uClubFloorMap.value = rt.texture;
      floorU.uClubFloorRect.value.set(frect.minX, frect.minZ, 1 / frect.sizeX, 1 / frect.sizeZ);
      floorU.uClubFloorK.value.w = FLOOR_K[3];
      if (floorFinal && floorFinal !== rt) baker.release(floorFinal);
      floorFinal = rt;
      info.floorReady = true; info.floorRect = frect; info.floorY = floorY;
      resolveFloor();
      const bad = shaderFailed();
      if (bad) {
        // a bake program did not link: the maps hold nothing useful, so the service shows the open (unshadowed) state
        errors.push(`bake shader failed: ${bad}`);
        tableU.uClubVisMap.value = white; floorU.uClubFloorMap.value = white; fadeTarget = 0;
        console.warn(`[club] occ: the bake shader '${bad}' failed — table and floor stay unshadowed`);
      } else if (isRevealed()) fadeTarget = 1;
      if (baker.plan.keepScratch) keptScratch = [tablePlan.scratch(), floorPlan.scratch()];
      baker.releasePrograms(); // nothing of the baker stays resident but the two maps
    };
    job = { plans: [tablePlan, floorPlan], steps: [...tablePlan.steps, finishTable, ...floorPlan.steps, finishFloor], i: 0, reason };
    info.bakes += 1; info.lastReason = reason; info.blockers = { meshes: blockers.meshes, triangles: blockers.triangles }; info.lampsAtBake = bakeLamps.length;
    schedule();
    return true;
  }
  function stepJob() {
    if (!job) return false;
    const fn = job.steps[job.i];
    job.i += 1;
    try { fn(); } catch (e) {
      errors.push(`bake: ${e?.message ?? e}`);
      console.warn('[club] occ: a bake step threw — the bake is dropped:', e);
      cancelJob();
      resolveTable(); resolveFloor();
      return false;
    }
    if (job && job.i >= job.steps.length) job = null;
    return !!job;
  }
  function pump() { raf = 0; if (!job) return; stepJob(); schedule(); }
  function schedule() { if (job && !raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(pump); }
  /**
   * Lifecycle hook of club/index.js, called once behind the curtain right after show(): take the finished state NOW.
   * With the maps ready the terms stand at full strength at once (no fade-in after the curtain drops). It never bakes in
   * this task: a bake that is still running goes on in its slices and its terms come in over FADE_SECONDS when it ends,
   * as one late arrival. Returns whether the finished state was taken.
   */
  function settle() {
    revealed = true;
    const ready = info.tableReady && info.floorReady && !job && !errors.length;
    if (ready) { fadeTarget = 1; fade = 1; }
    writeStrengths();
    settled = { ready, at: frame };
    return ready;
  }
  /** Tools and capture packs: finish the running bake now, in this task (it blocks for the whole bake). */
  function flush() {
    while (job) stepJob();
    if (info.floorReady && !errors.some((e) => e.startsWith('bake'))) fadeTarget = 1;
    fade = fadeTarget; // a tool wants the finished state, not the fade
    writeStrengths();
    return state();
  }
  /** Table, fixture or brightness changed: recompute both maps in slices. (Brightness alone changes nothing: the maps hold visibility.) */
  function rebuild(reason = 'rebuild', { force = false } = {}) {
    const sig = signature(frame);
    // the maps hold visibility: a refresh for brightness, look or cloth colour, or one that arrives with the same lamps over the
    // same table build, has nothing to recompute
    if (!force && sig === bakedSig && (job || info.tableReady)) { info.skipped += 1; return false; }
    bakedSig = wantSig = sig; stable = 0;
    return startBake(String(reason));
  }
  /** The reveal of the look (index.js calls it once, with the other services): the terms fade in from here. */
  let revealed = false, settled = null;
  function show() { revealed = true; if (info.tableReady && !errors.length) fadeTarget = 1; }
  const isRevealed = () => revealed || club.shown === true || club.shown === undefined;

  // ---- patches on adopted materials ----
  const patched = { cloth: 0, railwood: 0, apron: 0, pocket: 0, plain: 0, gi: 0, floor: 0, skipped: [] };
  const isAnalytic = (m) => { try { return typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).startsWith('spike'); } catch { return false; } };
  let floorMat = null;

  // ---- pockets: where they are, and what stands in them ----
  // A pocket is recognised by its fall lip: a small piece of cloth that exists only at and just below the bed plane (the
  // table builder rounds the cloth over the edge of every hole). Its bounds give the mouth centre and radius; a table
  // without such pieces has no pocket class and loses nothing else. The parts of a pocket (casting, collar, leather boot)
  // carry no surface class of their own: a part is a small mesh with a standard material on the app's shadow rail whose
  // bounds sit inside a mouth, above the return shaft.
  let pockets = [], pocketGen = -1, pocketClassified = false;
  const pocketPartOf = new WeakMap(); // mesh -> generation it was judged in (positive: is a part, negative: is not)
  function findPockets() {
    const root = tableRoot();
    pockets = [];
    if (!root) return;
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (pockets.length >= 12 || !o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m?.userData?.obClass !== 'cloth') return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      const w = Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z);
      if (_box.max.y > BED_Y + 0.003 || _box.min.y < BED_Y - 0.04 || _box.min.y > BED_Y - 0.002 || w > 0.3 || w < 0.05) return;
      pockets.push({ x: +((_box.min.x + _box.max.x) / 2).toFixed(4), z: +((_box.min.z + _box.max.z) / 2).toFixed(4), r: +(w / 2).toFixed(4) });
    });
  }
  function isPocketPart(o, m) {
    if (!pockets.length) return false;
    // judged once per mesh and table build (this runs for every mesh of the scene whenever the class is looked up)
    const seen = pocketPartOf.get(o);
    if (seen === pocketGen) return true;
    if (seen === -pocketGen) return false;
    let is = false;
    const root = tableRoot();
    let under = false;
    for (let q = o; q; q = q.parent) if (q === root) { under = true; break; }
    if (under && m?.isMeshStandardMaterial && !m.userData?.obClass && isAnalytic(m) && !o.isInstancedMesh && o.geometry?.attributes?.position) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      const cx = (_box.min.x + _box.max.x) / 2, cz = (_box.min.z + _box.max.z) / 2;
      const w = Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z);
      const top = lastTableBox ? lastTableBox.max.y : BED_Y + 0.06;
      if (w < 0.4 && _box.max.y < top + 0.02 && _box.min.y > BED_Y - 0.25) {
        is = pockets.some((p) => Math.hypot(cx - p.x, cz - p.z) < p.r + 0.05);
      }
    }
    pocketPartOf.set(o, is ? pocketGen : -pocketGen);
    return is;
  }
  function applyPatches() {
    const adopt = club.adopt;
    if (!adopt?.patch || !adopt?.find) return;
    if (pocketGen !== tableSeen.gen) { pocketGen = tableSeen.gen; findPockets(); }
    if (!pocketClassified && typeof adopt.classify === 'function') { pocketClassified = true; adopt.classify('pocket', isPocketPart); }
    for (const cls of ['cloth', 'railwood', 'apron']) {
      for (const m of adopt.find(cls)) {
        if (!m?.isMeshStandardMaterial) { const nm = `${cls}:${m?.name || m?.type}`; if (!patched.skipped.includes(nm)) patched.skipped.push(nm); continue; }
        const kind = isAnalytic(m) ? 'table' : 'plain';
        // uClubOccFaces is per class: wood and apron faces that do not look up leave the atlas (occ/glsl.js clubVisibility3)
        const u = { ...tablePatchU, uClubOccFaces: cls === 'cloth' ? facesOff : facesOn };
        if (adopt.patch(m, occPatchSpec(kind, { uniforms: u }))) { patched[cls] += 1; if (kind === 'plain') patched.plain += 1; }
        if (kind === 'table' && adopt.patch(m, occPatchSpec('gi', { uniforms: giU }))) patched.gi += 1;
      }
    }
    // pocket parts: the atlas where they look up (castings), depth under the mouth where they hang into the hole; never the box
    // model of the table (uClubOccFaces 2)
    for (const m of (pockets.length ? adopt.find('pocket') : [])) {
      if (adopt.patch(m, occPatchSpec('table', { uniforms: { ...tablePatchU, uClubOccFaces: facesPocket } }))) patched.pocket += 1;
      if (adopt.patch(m, occPatchSpec('gi', { uniforms: giU }))) patched.gi += 1;
    }
    // the club floor, when the room service has built it (services build in order room -> env -> occ; a late floor is picked up here)
    const fm = club.room?.enabled === true ? club.room.floor?.material : null;
    if (fm && fm !== floorMat) {
      floorMat = fm;
      for (const m of Array.isArray(fm) ? fm : [fm]) {
        if (!m?.isMeshStandardMaterial) { const nm = `floor:${m?.name || m?.type}`; if (!patched.skipped.includes(nm)) patched.skipped.push(nm); continue; }
        if (adopt.patch(m, occPatchSpec('floor', { uniforms: floorU }))) patched.floor += 1;
        // (round A6, with `feetOn` only: the soles' contact line, on top of the floor patch whose varying it reads)
        if (feetOn && adopt.patch(m, occPatchSpec('feet', { uniforms: feetU }))) patched.feet = (patched.feet ?? 0) + 1;
      }
    }
  }

  // ---- the cue ----
  const cueDims = new WeakMap();
  let cues = [], cueScan = -1e9;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function dimsOf(g) {
    if (cueDims.has(g)) return cueDims.get(g);
    let zTip = -Infinity, zButt = Infinity, rTip = 0, rButt = 0;
    for (const ch of g.children) {
      if (!ch.isMesh || !ch.geometry?.attributes?.position) continue;
      if (!ch.geometry.boundingBox) ch.geometry.computeBoundingBox();
      ch.updateMatrix();
      _box.copy(ch.geometry.boundingBox).applyMatrix4(ch.matrix);
      const r = Math.max(_box.max.x, -_box.min.x, _box.max.y, -_box.min.y);
      if (_box.max.z > zTip) { zTip = _box.max.z; rTip = r; }
      zButt = Math.min(zButt, _box.min.z);
      rButt = Math.max(rButt, r);
    }
    // the cue runs from its tip face at local z = 0 back along -z (web/scene/cuestick.js); anything else is not a cue
    const d = (zTip - zButt > 0.3 && rButt > 0 && rButt < 0.05) ? { zTip, zButt, rTip: Math.min(rTip, rButt), rButt } : null;
    cueDims.set(g, d);
    return d;
  }
  const shown = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; };
  function updateCue() {
    if (frame - cueScan > 45 || cues.some((c) => !c.parent)) {
      cueScan = frame;
      cues = [];
      scene.traverse((o) => { if (o.name === 'obCueStick') cues.push(o); });
    }
    let g = null, d = null;
    for (const c of cues) { if (shown(c) && (d = dimsOf(c))) { g = c; break; } }
    if (!g || !lamps.length) { cueU.uClubCueOn.value = 0; return; }
    g.updateWorldMatrix(true, false);
    _a.set(0, 0, d.zTip).applyMatrix4(g.matrixWorld);
    _b.set(0, 0, d.zButt).applyMatrix4(g.matrixWorld);
    if (!Number.isFinite(_a.x + _a.y + _a.z + _b.x + _b.y + _b.z)) { cueU.uClubCueOn.value = 0; return; }
    cueU.uClubCueA.value.copy(_a);
    cueU.uClubCueB.value.copy(_b);
    cueU.uClubCueR.value.set(d.rTip, d.rButt);
    const box = cueShadowBounds([_a.x, _a.y, _a.z], [_b.x, _b.y, _b.z], d.rTip, d.rButt, lampPlain, BED_Y - 0.02);
    cueU.uClubCueBox.value.set(box[0], box[1], box[2], box[3]);
    cueU.uClubCueOn.value = 1;
  }

  // ---- per frame ----
  function update(_clock, dt) {
    frame += 1;
    const sig = signature(frame);
    if (sig !== wantSig) { wantSig = sig; stable = 0; } else if (sig !== bakedSig && ++stable >= STABLE_FRAMES) {
      bakedSig = sig;
      // nothing to bake from yet (no lamp, an empty table): look again in a few seconds
      if (!startBake(info.bakes ? 'table or fixture changed' : 'install')) { bakedSig = null; stable = -240; }
    }
    if (frame % 90 === 2) {
      applyPatches();
      if (info.floorReady && !job && lastTableBox && Math.abs(readFloorY(lastTableBox) - info.floorY) > 0.002) startBake('floor moved');
    }
    updateCue();
    if (!fadeTarget && info.floorReady && !errors.length && isRevealed()) fadeTarget = 1;
    const step = (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60) / FADE_SECONDS;
    fade = fadeTarget > fade ? Math.min(fadeTarget, fade + step) : Math.max(fadeTarget, fade - step);
    writeStrengths();
  }

  function state() {
    return {
      enabled: true, tier, patch: `occ-v${OCC_PATCH_VERSION}`, atlas: [atlasW, atlasH], floorMap: [floorW, floorH], quality,
      baking: !!job, step: job ? job.i : null, steps: job ? job.steps.length : null,
      ...info, fade, settled: settled ? { ...settled } : null, lampSource,
      model: { k: OCC_K.slice(), floorK: FLOOR_K.slice(), ambient: tableU.uClubOccAmbient.value, shareCap: tableU.uClubOccLamp.value, off: debug.off.slice(), ambientReach: AMBIENT_REACH, sky: SKY.map((v) => +v.toFixed(3)) },
      lamps: lamps.map((l) => ({ pos: [l.pos.x, l.pos.y, l.pos.z].map((v) => +v.toFixed(3)), half: [+l.half.x.toFixed(3), +l.half.y.toFixed(3)] })),
      patched: { ...patched, skipped: patched.skipped.slice() },
      pockets: pockets.map((q) => ({ ...q })),
      cue: { on: cueU.uClubCueOn.value === 1, a: cueU.uClubCueA.value.toArray().map((v) => +v.toFixed(3)), b: cueU.uClubCueB.value.toArray().map((v) => +v.toFixed(3)), r: cueU.uClubCueR.value.toArray() },
      bytes: { table: tableFinal ? atlasW * atlasH * 4 : 0, floor: floorFinal ? floorW * floorH * 4 : 0, live: baker.bytes() },
      // (round A6, with `feetOn` only: the soles found, the line's depth and reach, the uniform as it stands)
      ...(feetOn ? { feet: { on: true, soles: feetState.list.slice(), floorY: feetState.floorY, depth: feetState.depth, reach: feetState.reach, uniform: feetU.uClubFeetK.value.toArray().map((v) => +v.toFixed(4)) } } : {}),
      errors: errors.slice(),
    };
  }

  // ---- start ----
  if (ctx.query?.get?.('cluboccdebug') === '1') baker.plan.keepScratch = true; // dev pages: keep the height and raw maps
  try {
    // pictures of one term at a time (on/off pairs): ?cluboccoff=lamp,ao,contact,cue,share,floor   ?cluboccambient=0.2
    const off = ctx.query?.get?.('cluboccoff'), amb = ctx.query?.get?.('cluboccambient');
    if (off || amb) setDebug({ off: off ?? [], ambient: amb === null || amb === undefined ? null : Number(amb) });
  } catch { /* unreadable query: no switch */ }
  try {
    wantSig = bakedSig = signature(0);
    applyPatches();
    if (!startBake('install')) bakedSig = null;
    updateCue();
  } catch (e) {
    errors.push(`start: ${e?.message ?? e}`);
    console.warn('[club] occ: start failed — the service stays open (unshadowed):', e);
  }
  club.onFrame?.(update);

  return {
    enabled: true,
    table: { get texture() { return tableU.uClubVisMap.value; }, uniforms: tableU, ready: tableReady },
    floor: { get texture() { return floorU.uClubFloorMap.value; }, uniforms: floorU, ready: floorReady },
    cue: { uniforms: cueU },
    lamp: { uniforms: lampU },
    uniforms: { ...lampU, ...tableU, ...cueU, ...floorU, uClubOccFaces: facesOff }, // everything OCC_GLSL declares
    glsl: OCC_GLSL, glslTable: OCC_TABLE_GLSL, glslFloor: OCC_FLOOR_GLSL,
    rebuild, show, settle, update, flush, state, setDebug,
    scratch: () => keptScratch,
  };
}
