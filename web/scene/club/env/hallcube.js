// Copyright (c) Meta Platforms, Inc. and affiliates.

// env/hallcube.js — the hall's baked reflection as a service (CONTRACT.md 19.1; the arena venue only). Loaded by env.js
// through a literal dynamic import behind the venue test: under the club venue this module is never requested.
//
// One handle (`club.env.hall`) for every arena material that mirrors the hall: the floor's props, the surround's metal
// (the table's body gloss can read it too, as a tool: mat/wood/layout.js HALL_GLOSS).
//   - the cube: the light role's baked file (ids `arena.env`, `arena.env.lite` on the lite tier), fetched with the look's
//     other assets, decoded once (env/hall.js) into ONE half-float cube texture whose mip levels are the file's own
//     roughness chain. Nothing is rendered or convolved at run time. Until the file is in (and for good when it fails or
//     belongs to another hall) the same texture object holds a stand-in: six smooth lobes made from the room light's
//     baked ambient at the cube's place, with the floor as the room's baked map holds it where a texel looks down.
//   - the lookup: env/hall.js HALL_GLSL: the hall's box as the local (parallax) correction, the level by roughness.
//   - the readers: a material carries a plain tag, `material.userData.clubHall = { share, keep }` (the room's parts are
//     built before this service exists, so they cannot call it); the service walks the room group for tags at its start,
//     at every rebuild and while late parts arrive, and patches each tagged standard material once (env/hall.js
//     HALL_PATCH). `apply(material, { share, keep })` does the same for a tool or a late material.
// Units: the texture holds scene-linear radiance; `exposure` (uClubHallPar.x) is 1 for a file in the bake's units.
import * as THREE from 'three';
import { HALL_ENV, decodeHallEnv, hallStandIn, hallPatchShader, hallTag, HALL_GLSL } from './hall.js';
import { decodePng } from '../room/lightmap.js';

/** `mode`: 'file' (the default) | 'standin' (a tool: never ask for the file). */
export function createHallEnv(club, { mode = 'file', note = () => {} } = {}) {
  const lite = club?.tier === 'lite';
  const id = lite ? HALL_ENV.idLite : HALL_ENV.id;
  const now = () => { try { return performance.now(); } catch { return 0; } };
  const st = {
    source: 'none', reason: null, size: 0, levels: 0, rough: [], fileBytes: 0, gpuBytes: 0, ms: { fetch: null, decode: null, standIn: null },
    record: null, peak: null, walks: 0, tagged: 0, refused: [], standInMakes: 0, fileState: mode === 'standin' ? 'not asked (tool)' : 'loading',
  };

  // ---- the texture: one stable object; its texels are replaced when the file lands ---------------------------------------
  const tex = new THREE.CubeTexture();
  tex.name = 'club-hall-env';
  tex.format = THREE.RGBAFormat; tex.type = THREE.HalfFloatType; tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  const box = { min: new THREE.Vector3(-50, -50, -50), max: new THREE.Vector3(50, 50, 50) };
  const pos = new THREE.Vector3();
  const uniforms = {
    uClubHallEnv: { value: tex },
    uClubHallBoxMin: { value: box.min },
    uClubHallBoxMax: { value: box.max },
    uClubHallPos: { value: pos },
    uClubHallPar: { value: new THREE.Vector4(1, 0, 0, 1) },
    uClubHallRough: { value: new Array(HALL_ENV.maxLevels).fill(1) },
  };
  const face = (L, f) => { const t = new THREE.DataTexture(L.data[f], L.s, L.s, THREE.RGBAFormat, THREE.HalfFloatType); t.flipY = false; return t; };
  function setLevels(levels, source) {
    tex.dispose(); // the storage is immutable: the next draw allocates it at the new size
    tex.image = [0, 1, 2, 3, 4, 5].map((f) => face(levels[0], f));
    tex.mipmaps = levels.slice(1).map((L) => ({ image: [0, 1, 2, 3, 4, 5].map((f) => face(L, f)) }));
    tex.needsUpdate = true;
    const r = uniforms.uClubHallRough.value;
    for (let i = 0; i < r.length; i++) r[i] = levels[Math.min(i, levels.length - 1)].rough;
    uniforms.uClubHallPar.value.y = levels.length - 1;
    uniforms.uClubHallPar.value.z = 1;
    st.source = source; st.size = levels[0].s; st.levels = levels.length; st.rough = levels.map((L) => L.rough);
    st.gpuBytes = levels.reduce((sum, L) => sum + 6 * L.s * L.s * 8, 0);
  }

  // ---- where the cube sits: the hall's box and the cube's place (heights of the record are over the floor) ---------------
  let recBox = null, recProbe = null;
  const floorY = () => { const y = club.room?.floorY; return Number.isFinite(y) ? y : (club.room?.box?.min?.y ?? 0); };
  function place() {
    const fy = floorY();
    if (recBox && recProbe) {
      box.min.set(recBox.min[0], recBox.min[1] + fy, recBox.min[2]); box.max.set(recBox.max[0], recBox.max[1] + fy, recBox.max[2]);
      pos.set(recProbe[0], recProbe[1] + fy, recProbe[2]);
    } else {
      const b = club.room?.enabled === true ? club.room.box : null;
      if (b?.min?.isVector3 && b?.max?.isVector3) { box.min.copy(b.min); box.max.copy(b.max); }
      const p = HALL_ENV.standIn.probe;
      pos.set(p[0], p[1] + fy, p[2]);
    }
  }

  // ---- the stand-in ----------------------------------------------------------------------------------------------------------
  const roomSerial = () => { try { const s = club.room?.light?.serial; return Number.isFinite(s) ? s : null; } catch { return null; } };
  let standInSerial = null, standInFrame = 0;
  function standIn(why) {
    const t0 = now();
    place();
    standInSerial = roomSerial(); st.standInMakes += 1;
    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let lobes = null, from = 'a constant';
    try {
      const ia = club.room?.light?.irradianceAt;
      if (typeof ia === 'function') {
        const p = [pos.x, pos.y, pos.z];
        const vals = axes.map((n) => ia.call(club.room.light, p, n, { baked: true }));
        if (vals.every((v) => Array.isArray(v) && v.length >= 3 && v.every((x) => Number.isFinite(x)))) { lobes = vals.map((v) => v.slice(0, 3).map((x) => Math.max(0, x) * HALL_ENV.unit)); from = 'club.room.light.irradianceAt at the cube\'s place'; }
      }
    } catch { lobes = null; }
    if (!lobes) lobes = axes.map((n) => { const v = 0.02 + 0.03 * Math.max(0, n[1]); return [v, v, v]; });
    // the floor as the room's own baked map holds it (the lit island where it lies): the carpet's albedo x the map's
    // irradiance at the point a downward texel meets. Without the map or the albedo record the lobes stand alone.
    let floor = null;
    try {
      const lm = club.room?.lightmap, fi = lm?.floorIrradiance, alb = club.room?.floor?.albedo;
      const ok3 = (v) => Array.isArray(v) && v.length >= 3 && v.every((x) => Number.isFinite(x));
      if (typeof fi === 'function' && ok3(alb) && ok3(fi.call(lm, pos.x, pos.z))) {
        floor = { y: box.min.y, probe: [pos.x, pos.y, pos.z], min: [box.min.x, box.min.z], max: [box.max.x, box.max.z],
          at: (x, z) => { const e = fi.call(lm, x, z); return ok3(e) ? [e[0] * alb[0] * HALL_ENV.unit, e[1] * alb[1] * HALL_ENV.unit, e[2] * alb[2] * HALL_ENV.unit] : null; } };
        from += ' + the floor from club.room.lightmap.floorIrradiance x club.room.floor.albedo';
      }
    } catch { floor = null; }
    setLevels(hallStandIn(lobes, floor ? { floor } : {}), 'stand-in');
    st.reason = why; st.standInFrom = from; st.ms.standIn = Math.round((now() - t0) * 10) / 10;
  }

  // ---- the file ----------------------------------------------------------------------------------------------------------------
  const lightSig = () => { try { return club.room?.lightmap?.state?.()?.file?.sig ?? null; } catch { return null; } };
  async function load() {
    if (mode === 'standin') return;
    const fetchBytes = club?.assets?.bytes;
    if (typeof fetchBytes !== 'function') { st.fileState = 'no asset service'; return; }
    const t0 = now();
    let buf = null;
    try { buf = await fetchBytes(id); } catch { buf = null; }
    st.ms.fetch = Math.round(now() - t0);
    if (!buf) { st.fileState = 'missing (not in the manifest, or the request failed): the stand-in stays'; return; }
    const t1 = now();
    try {
      const d = decodeHallEnv(await decodePng(buf));
      if (!d.ok) { st.fileState = `refused: ${d.reason}`; note(`hall cube: ${d.reason}`); return; }
      // a cube belongs to one bake: one made for another hall is not shown
      const sig = lightSig();
      if (sig && d.record.sig && d.record.sig !== sig) { st.fileState = `refused: baked for another hall (cube ${d.record.sig}, light file ${sig})`; note('hall cube: baked for another hall; the stand-in stays'); return; }
      recBox = d.box; recProbe = d.probe;
      place();
      setLevels(d.levels, 'file');
      st.fileBytes = buf.byteLength ?? 0; st.peak = +d.peak.toFixed(3); st.reason = null;
      st.record = { v: d.record.v, n: d.n, sig: d.record.sig ?? null, soft: d.record.soft ?? null, probe: d.probe, box: d.box, hidden: d.record.hidden ?? null, check: d.record.check ?? null, tier: d.record.tier ?? null };
      st.fileState = 'loaded';
      st.ms.decode = Math.round((now() - t1) * 10) / 10;
    } catch (e) { st.fileState = `failed: ${e?.message ?? e}`; note(`hall cube: ${e?.message ?? e}`); }
  }

  // ---- the readers -------------------------------------------------------------------------------------------------------------
  const readers = new Map(); // material -> { name, share: { value: Vector4 }, shader, ok, reason }
  function apply(material, opts = null) {
    const t = hallTag(opts ?? material?.userData?.clubHall ?? true);
    if (!material || !t) return false;
    const have = readers.get(material);
    if (have) { have.share.value.set(t.share, t.keep, 0, 0); return have.ok !== false; }
    if (!(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) { if (!st.refused.includes(material.name || material.type)) st.refused.push(material.name || material.type); return false; }
    const rec = { name: material.name || material.type, share: { value: new THREE.Vector4(t.share, t.keep, 0, 0) }, shader: null, ok: null, reason: null };
    const prevCompile = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
    material.onBeforeCompile = function clubHallCompile(shader, renderer) {
      if (typeof prevCompile === 'function') prevCompile.call(this, shader, renderer);
      const r = hallPatchShader(shader);
      rec.ok = r.ok; rec.reason = r.reason;
      if (!r.ok) return; // the material keeps what it had
      Object.assign(shader.uniforms, uniforms, { uClubHallShare: rec.share });
      rec.shader = shader;
    };
    material.customProgramCacheKey = function clubHallKey() {
      const k = typeof prevKey === 'function' ? prevKey.call(this) : '';
      return `${k}|${HALL_ENV.key}`;
    };
    material.needsUpdate = true;
    readers.set(material, rec);
    return true;
  }
  /** Live change of a patched material's two numbers (a pair inside one boot). */
  function share(material, s = 1, keep = 0) {
    const rec = readers.get(material);
    if (!rec) return false;
    rec.share.value.set(Number.isFinite(s) ? Math.max(0, s) : 1, Number.isFinite(keep) ? Math.max(0, keep) : 0, 0, 0);
    return true;
  }
  /** Walk the room group for tagged materials (cheap: a traversal that only reads `userData`). */
  function walk() {
    const g = club.room?.enabled === true ? club.room.group : null;
    if (!g?.traverse) return 0;
    let found = 0;
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m?.userData || m.userData.clubHall === undefined || m.userData.clubHall === null || m.userData.clubHall === false) continue;
        found += 1;
        if (!readers.has(m)) apply(m);
      }
    });
    st.walks += 1; st.tagged = found;
    return found;
  }
  // per frame: the seat can move (the app re-seats its floor per table class); late parts are found by a walk now and then
  let frames = 0;
  function frame() {
    frames += 1;
    place();
    if (frames <= 600 ? frames % 30 === 1 : frames % 600 === 1) walk();
    // the stand-in is made of the room light's answers: made again when they may have changed (a map that lands late)
    // (not more often than every 90 frames and not more than 12 times a page: a room whose light moves all the time
    // keeps the picture it has)
    if (st.source === 'stand-in' && st.standInMakes < 12 && frames - standInFrame >= 90 && roomSerial() !== standInSerial) {
      const why = st.reason; standInFrame = frames;
      try { standIn(why); } catch { standInSerial = roomSerial(); }
    }
  }

  // what a compiled reader binds: every texture among its uniforms now (three sets `envMap` and the maps at render time)
  const samplersOf = (rec) => {
    const u = rec.shader?.uniforms;
    if (!u) return null;
    let n = 0;
    for (const k of Object.keys(u)) { const v = u[k]?.value; if (v?.isTexture) n += 1; }
    return n;
  };
  function state() {
    return {
      enabled: handle.enabled, source: st.source, reason: st.reason, id, file: st.fileState, size: st.size, levels: st.levels, rough: st.rough.slice(),
      bytes: { file: st.fileBytes, gpu: st.gpuBytes }, ms: { ...st.ms }, peak: st.peak, record: st.record, standInFrom: st.standInFrom ?? null, standInMakes: st.standInMakes,
      exposure: uniforms.uClubHallPar.value.x, boxCorrection: uniforms.uClubHallPar.value.w,
      box: { min: box.min.toArray(), max: box.max.toArray() }, pos: pos.toArray(),
      walks: st.walks, tagged: st.tagged, refused: st.refused.slice(),
      readers: [...readers.values()].map((r) => ({ name: r.name, share: r.share.value.x, keep: r.share.value.y, compiled: r.ok, reason: r.reason, samplers: samplersOf(r) })),
    };
  }

  const handle = {
    enabled: false, reason: 'no cube yet',
    get source() { return st.source; },
    texture: tex, uniforms, glsl: HALL_GLSL, box, pos,
    get exposure() { return uniforms.uClubHallPar.value.x; },
    ready: Promise.resolve(),
    apply, share, walk, frame, state,
    /** Tools: exposure, the box correction on / off, the whole term on / off (pairs inside one boot). */
    tool: {
      exposure(v) { if (Number.isFinite(v) && v >= 0) uniforms.uClubHallPar.value.x = v; return uniforms.uClubHallPar.value.x; },
      box(on) { uniforms.uClubHallPar.value.w = on === false ? 0 : 1; return uniforms.uClubHallPar.value.w; },
      on(on) { uniforms.uClubHallPar.value.z = on === false ? 0 : 1; return uniforms.uClubHallPar.value.z; },
    },
    dispose() { try { tex.dispose(); } catch { /* nothing to free */ } },
  };
  try { standIn('the file is not in yet'); handle.enabled = true; handle.reason = null; } catch (e) { handle.enabled = false; handle.reason = String(e?.message ?? e); }
  handle.ready = load().then(() => { if (st.source !== 'file' && handle.enabled) st.reason = `the stand-in stays (${st.fileState})`; }, () => {});
  try { walk(); } catch { /* the next frame walks again */ }
  return handle;
}
