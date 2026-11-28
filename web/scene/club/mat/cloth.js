// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/cloth.js — the cloth of the club look (CONTRACT.md 9.1, owner: cloth). Reached only through mat/index.js.
//
// The app's cloth material (table.js clothMat: one MeshPhysicalMaterial on the bed, the cushions and the pocket cuts, shaded
// through shading.js injectAnalytic) is kept and extended from the outside through club.adopt.patch. Nothing in its constructor
// values is changed: the look lives in the patch text (cloth/glsl.js) and in the uniforms below.
//
// Why the cloth was flat (measured in the app, round 1b, plan view, scene-linear blue): under the lamp the RectAreaLight gives
// 0.54 and the environment probe 0.98; in a corner 0.20 and 0.87. The lamp term has the physical falloff (corner / centre 0.36,
// the rectangle's form factor); the probe is one cube taken 11 cm over the bed centre, it holds the lamp panel's own image, the
// renderer applies it at scene.environmentIntensity 1, and every point of the bed gets the centre's value.
//
//   pool    the cloth's diffuse light is the lamp term x a gain x the lamp's throw (the fixture sends more of its light
//           straight down than a bare diffuser) plus what a room returns: the reflection service's ambient cube
//           (club.env.ambient: the room without the lamp's own face) when it is delivered, a flat share of the centre's lamp
//           light, and a floor under the corner tips. The probe's diffuse light is not used: the cloth's level no longer moves
//           with what the capture happens to hold. A neutral veil (the fibre surface) runs against the pool and is scaled to
//           the dye: none under the lamp (the deepest, most saturated cloth), the most at the dim ends (they keep their hue).
//   colour  level and saturation of the albedo, the white dielectric lobe turned down
//   sheen   amount and colour of the sheen lobe: a share of it takes the dye's colour, and on the bed it is cut at a grazing
//           view (the app's lamp sheen is what washes the low views pale)
//   cush    the same cloth stretched over the rubber: a tighter and stronger sheen, a slightly deeper colour
//   face    cushion faces that do not look up are lit by the bed in front of them (a share of the lamp pool at that place)
//   weave   OFF unless asked for (`clothWeave: true` in the tier knobs, or ?clubcloth=weave): `felt.normal` at the scan's true
//           thread scale, faded by the pixel footprint (ONE added sampler). No fixed view of a 1280 x 720 frame resolves it
//           beyond the app's own close-up twill; it is for large frames.
//   level   the lamp's level on this cloth (tune.js CLOTH_LEVEL, by the look, the app's bed-match key and the applied fixture,
//           both read from window.__lighting.state()). The default look levels each lamp's light together with the probe's;
//           this cloth keeps the lamp's legs only, so each lamp's whole-bed mean is brought to the table's reference lamp's
//           here (issue #1390). The lamp and its level are read again at the first render a fixture swap or a table change
//           shows, before its draw list is built.
// Round 1's nap term (the sheen scaled by the angle between the threads and the half vector) is gone: it changed no fixed view
// by more than 2.5 %, and a worsted cloth has next to no nap to show.
//
// Tool knobs on the boot URL: ?clubcloth=off (the part is not built), ?clubcloth=nopool,nocolor,nosheen,nocush,noface,noweave
// (the named groups stay at the identity), ?clubcloth=weave (the sampler variant), ?clubcloth=noenv (ignore club.env.ambient).
// Under the arena venue only: ?clubcloth=app (the part is not built: the app's own cloth, for comparison frames; see below)
// and ?clubcloth=novenue (the club venue's ambient values in the hall).
// At run time: club.mat.parts.cloth.set({ pool: 0 | 1, ... }); a tool may write a row into club.mat.parts.cloth.levels (the
// live copy of tune.js CLOTH_LEVEL), then call set().
import * as THREE from 'three';
import { clothPatchSpec, CLOTH_PATCH_VERSION } from './cloth/glsl.js';
import { lampBounds, rectFormFactorUp, lampRadiance } from './cloth/pool.js';
import { weaveNormalData, WEAVE_FALLBACK_THREAD_M } from './cloth/weave.js';
import { CLOTH_TUNE, CLOTH_LEVEL, levelUnderLamp } from './cloth/tune.js';
import { isArena, venueKnobsOf } from '../tiers.js';

export { CLOTH_TUNE };

const BED_Y = 0; // the bed plane (CONTRACT.md section 1)
const WEAVE_ID = 'felt.normal';
const WEAVE_TILE_M = 0.266; // one repeat of the scan in metres (web/assets/club/CREDITS.md)
const GROUPS = ['pool', 'color', 'sheen', 'cush', 'face', 'weave'];
const DEFAULT_ON = true;

const stub = (reason) => ({ enabled: false, reason, rebuild() {}, state: () => ({ enabled: false, reason }) });
const mix = (a, b, t) => a + (b - a) * t;
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const SAMPLER_TYPES = new Set([0x8B5E, 0x8B60, 0x8B5F, 0x8B62, 0x8DC1, 0x8DC4, 0x8DC5, 0x8DCA, 0x8DCB, 0x8DCC, 0x8DCF, 0x8DD2, 0x8DD3, 0x8DD4, 0x8DD7]);

export async function applyCloth(club) {
  const ctx = club?.ctx ?? {};
  const adopt = club?.adopt;
  if (typeof adopt?.patch !== 'function' || typeof adopt?.find !== 'function') return stub('no adoption service');
  let asked = '';
  try { asked = String(ctx.query?.get?.('clubcloth') ?? ''); } catch { /* unreadable query: build all */ }
  const tokens = asked.split(',');
  if (asked === 'off') return stub('off by ?clubcloth');
  // Round A2 (CONTRACT.md 14.2): `?clubcloth=app`, a TOOL switch that is looked at under the arena venue only (the left
  // operand decides: under the club venue the token is never examined and the part is built as it always was). It leaves
  // the cloth class as the tournament look has it: this part is not built, so the cloth takes no patch of this part, keeps
  // the app's own maps, its own light (the lamp term and the probe) and its own colour response. What stays on the cloth
  // class is the other services' and is decided where they live: the occlusion service's rails (the table's and the cue's
  // shadow and the contact darkening; both rails are 1 on open cloth, so they move no level there), the pocket part's
  // rolled lip at the holes, and the marks term (nothing is drawn before a shot). It exists for the owner's comparison
  // frames (the arena with the club cloth beside the arena with the tournament cloth) and is to be removed, or turned into
  // a setting, before any default changes.
  let appCloth = false;
  try { appCloth = isArena(club) && tokens.includes('app'); } catch { appCloth = false; }
  if (appCloth) {
    const reason = 'the app\'s own cloth (?clubcloth=app: a tool switch of the arena venue)';
    return { ...stub(reason), appCloth: true, state: () => ({ enabled: false, reason, appCloth: true }) };
  }
  if (!DEFAULT_ON && !tokens.includes('on')) return stub('not switched on yet (ask with ?clubcloth=on)');
  const tune = JSON.parse(JSON.stringify(CLOTH_TUNE)); // a live copy: tools may write it, then call set()
  const levels = JSON.parse(JSON.stringify(CLOTH_LEVEL)); // the level table, a live copy beside it (state().tune stays the look's table)
  const win = typeof window !== 'undefined' ? window : null;
  // the lamp's level: the look's row, and the keys the app's lighting state names (read with the lamp: syncLamp)
  let levelLook = 'club';
  try { levelLook = isArena(club) ? 'arena' : 'club'; } catch { levelLook = 'club'; }
  const level = { look: levelLook, key: null, fixture: null, k: 1, found: false };
  // Round A1 (CONTRACT.md 13.3): the venue's values of the room-ambient term. The LEVEL of the cloth's ambient light is
  // `pool.ambient` in every venue (a share of the lamp's light: a dark hall does not darken the bed). Two things are the
  // room's: the gain on the ambient cube (`env.gain` x the venue's `ambient`) and the colour of the flat part the cube
  // does not carry (`pool.tint`: the club room's warm fill; the venue's `ambientTint` when it gives one). Under the club
  // venue nothing is written: the copy above is the table. Tools: `?clubcloth=novenue` under arena = the club's values in the
  // hall (the off arm of a pair; it does nothing under the club venue).
  let venueNote = null;
  try {
    if (isArena(club) && !tokens.includes('novenue')) {
      const v = venueKnobsOf(club);
      if (Number.isFinite(v?.ambient) && v.ambient >= 0) tune.env.gain *= v.ambient;
      const tint = v?.ambientTint;
      if (Array.isArray(tint) && tint.length >= 3 && tint.slice(0, 3).every((x) => Number.isFinite(x) && x >= 0)) tune.pool.tint = tint.slice(0, 3);
      venueNote = { venue: 'arena', envGain: tune.env.gain, flatTint: tune.pool.tint.slice() };
    }
  } catch { venueNote = null; }
  const flags = Object.fromEntries(GROUPS.map((g) => [g, tokens.includes(`no${g}`) ? 0 : 1]));
  const envWanted = !tokens.includes('noenv');

  // ---- uniforms (shared objects: one set for every cloth material) ----
  const ownAmb = Array.from({ length: 6 }, () => new THREE.Vector3());
  const U = {
    uClubClothLamp: { value: new THREE.Vector4(0, 0, 1, 0.33) },
    uClubClothLampK: { value: new THREE.Vector4(1, 1, BED_Y, 0) },
    uClubClothLampL: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClubClothPool: { value: new THREE.Vector4(1, 0, 0, 1) },
    uClubClothAmbTint: { value: new THREE.Vector4(1, 1, 1, 0) },
    uClubClothVeil: { value: new THREE.Vector4(0, 0, 0, 1) },
    uClubClothShape: { value: new THREE.Vector4(1, 0, 0, 0) },
    uClubClothGraze: { value: new THREE.Vector4(1, 0, 1, 0) },
    uClubClothEven: { value: new THREE.Vector4(1, 1, 0, 1) },
    uClubClothFace: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClubClothAmb: { value: ownAmb },
    uClubClothTone: { value: new THREE.Vector4(1, 1, 1, 1) },
    uClubClothCush: { value: new THREE.Vector4(1, 1, 1, 0) },
    uClubClothNear: { value: new THREE.Vector4(0.32, 0.52, 0, 1) },
    uClubClothGrain: { value: new THREE.Vector4(0, 0.0003, 0.0008, 0) },
    uClubClothLevel: { value: new THREE.Vector4(0, 0, 0, 0) }, // k - 1: 0 is the look as tuned (and what an unset uniform reads)
    uClubClothWeaveK: { value: new THREE.Vector4(1, 0, 64, 0) },
    uClubClothNap: { value: new THREE.Vector4(1, 0, 0, 0) },
    uClubClothWeave: { value: null },
  };

  // ---- the lamp, read from the app: its rectangle (shading.js setEmitters keeps the shared emitter uniforms) and its
  // radiance (the RectAreaLights of the app room; the look never changes them) ----
  const lamp = { source: 'none', rect: null, ref: 0, lights: [], radiance: [0, 0, 0], white: [0, 0, 0] };
  function findLights() {
    const out = [];
    const take = (l) => { if (l?.isRectAreaLight && !out.includes(l)) out.push(l); };
    try { for (const l of ctx.room?.lightRefs?.rectLights ?? []) take(l); } catch { /* no light refs: the scene is searched */ }
    if (!out.length) { try { ctx.scene?.traverse?.((o) => take(o)); } catch { /* no scene: no lamp */ } }
    lamp.lights = out.slice(0, 8);
  }
  const litLights = () => lamp.lights.filter((l) => l.visible !== false && l.intensity > 0 && l.width > 0 && l.height > 0);
  function readEmitters() {
    const sh = ctx.gi?.uniforms ?? globalThis.__gi?.uniforms ?? null;
    if (sh?.uLightPos?.value?.isVector3 && sh?.uLightHalf?.value?.isVector2) {
      lamp.source = 'shared emitter uniforms';
      const n = Math.max(1, Math.min(4, Math.round(Number(sh.uLightCount?.value) || 1)));
      const posN = sh.uLightPosN?.value, halfN = sh.uLightHalfN?.value;
      const one = (p, h) => ({ pos: [p.x, p.y, p.z], half: [h.x, h.y] });
      if (n === 1 || !Array.isArray(posN)) return [one(sh.uLightPos.value, sh.uLightHalf.value)];
      const out = [];
      for (let i = 0; i < n; i++) out.push(one(posN[i] ?? sh.uLightPos.value, halfN?.[i] ?? sh.uLightHalf.value));
      return out;
    }
    const out = [];
    const p = new THREE.Vector3();
    for (const l of litLights().slice(0, 4)) { l.getWorldPosition(p); out.push({ pos: [p.x, p.y, p.z], half: [l.width / 2, l.height / 2] }); }
    lamp.source = out.length ? 'scene rect lights' : 'none';
    return out;
  }
  function syncLamp() {
    let rect = null;
    try { rect = lampBounds(readEmitters()); } catch { rect = null; }
    if (rect && !(rect.y > BED_Y + 0.05)) rect = null; // a lamp at or under the bed plane lights no pool
    lamp.rect = rect;
    lamp.ref = rect ? rectFormFactorUp([rect.cx, BED_Y, rect.cz], rect) : 0;
    // the lamp's radiance over the bounding rectangle (several emitters: the same flux spread over their bounds)
    let rad = [0, 0, 0];
    try { rad = rect ? lampRadiance(litLights().map((l) => ({ color: [l.color.r, l.color.g, l.color.b], intensity: l.intensity, area: l.width * l.height })), rect) : [0, 0, 0]; } catch { rad = [0, 0, 0]; }
    lamp.radiance = rad;
    if (rect && lamp.ref > 1e-4 && rad[0] + rad[1] + rad[2] > 1e-6) {
      lamp.white = rad.map((v) => v * lamp.ref);
      U.uClubClothLamp.value.set(rect.cx, rect.cz, rect.hx, rect.hz);
      U.uClubClothLampK.value.set(rect.y, 1 / lamp.ref, BED_Y, 0);
      U.uClubClothLampL.value.set(lamp.white[0], lamp.white[1], lamp.white[2], 0);
    } else { lamp.ref = 0; lamp.white = [0, 0, 0]; }
    // the keys of the lamp's level: the app swaps its rect lights and its applied fixture in one step, so what it names now is
    // the lamp just read
    let ls = null;
    try { ls = win?.__lighting?.state?.() ?? null; } catch { ls = null; }
    level.key = typeof ls?.matchKey === 'string' ? ls.matchKey : null;
    level.fixture = typeof ls?.fixture === 'string' ? ls.fixture : null;
    write();
  }

  // ---- the room's ambient cube (club.env.ambient, feature-detected; the reflection service may deliver it after the first frames) ----
  const env = { source: 'fallback', on: false, serial: null, raw: 0, share: 0, gain: 0 };
  function syncEnv() {
    let arr = null, serial = null;
    try {
      const a = envWanted ? club.env?.ambient : null;
      const v = a?.enabled === true ? a.uniforms?.uClubEnvAmb?.value : null;
      if (Array.isArray(v) && v.length >= 6 && v.slice(0, 6).every((x) => x?.isVector3 && Number.isFinite(x.x + x.y + x.z))) { arr = v; serial = a.serial ?? null; }
    } catch { arr = null; }
    const on = !!arr;
    if (on) { if (U.uClubClothAmb.value !== arr) U.uClubClothAmb.value = arr; } else if (U.uClubClothAmb.value !== ownAmb) U.uClubClothAmb.value = ownAmb;
    // the six values are rewritten in place: a new serial means new values, and the gain on them is derived from them
    if (on !== env.on || serial !== env.serial) { env.on = on; env.serial = serial; env.source = on ? 'env.ambient' : 'fallback'; write(); }
  }

  // ---- the weave texture (the sampler variant only) ----
  const weave = { wanted: false, on: false, status: 'off', size: 0, tilesPerM: 0, texture: null };
  function fallbackWeave() {
    const { data, size } = weaveNormalData(64);
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.name = 'club-cloth-weave-standin';
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
  function syncWeave() {
    const t = weave.texture;
    if (!weave.on || !t) return;
    let status = 'standin';
    try { if (club.assets?.state?.().ids?.[WEAVE_ID] === 'loaded') status = 'file'; } catch { /* no loader state: the stand-in scale */ }
    const size = Number(t.image?.width) || 64;
    if (status === 'file' && size >= 256) { weave.size = size; weave.tilesPerM = 1 / WEAVE_TILE_M; } else { status = 'standin'; weave.size = size; weave.tilesPerM = 1 / (size * WEAVE_FALLBACK_THREAD_M); }
    weave.status = status;
    write();
  }

  // ---- strengths ----
  function write() {
    const f = flags, t = tune;
    const poolOn = lamp.ref > 0 ? f.pool : 0; // without a lamp the cloth keeps the app's light
    // the ambient level of an upward patch is the look's (t.pool.ambient, a share of the centre's lamp light on white). The
    // room's ambient cube carries as much of it as it holds, up to t.env.share of it; the rest is the flat warm term.
    const amb = t.pool.ambient * poolOn;
    const lampLuma = luma(lamp.white);
    let envGain = 0;
    env.share = 0; env.gain = 0; env.raw = 0;
    if (env.on && poolOn > 0 && lampLuma > 1e-6) {
      const up = U.uClubClothAmb.value[2];
      const upLuma = up?.isVector3 ? luma([up.x, up.y, up.z]) : 0;
      env.raw = upLuma / lampLuma; // what the cube would give an upward patch, as a share of the centre's lamp light
      if (upLuma > 1e-6) {
        env.share = Math.min(Math.max(0, t.env.gain) * env.raw, amb * Math.min(1, Math.max(0, t.env.share)));
        envGain = env.share * lampLuma / upLuma;
        env.gain = envGain;
      }
    }
    const flat = Math.max(0, amb - env.share);
    U.uClubClothPool.value.set(mix(1, t.pool.direct, poolOn), amb, t.pool.floor * poolOn, mix(1, t.pool.probe, poolOn));
    U.uClubClothAmbTint.value.set(t.pool.tint[0] * flat, t.pool.tint[1] * flat, t.pool.tint[2] * flat, 0);
    U.uClubClothVeil.value.set(t.veil.tint[0] * poolOn, t.veil.tint[1] * poolOn, t.veil.tint[2] * poolOn, mix(1, t.veil.ibl, poolOn));
    U.uClubClothShape.value.set(mix(1, Math.max(1, t.pool.throw), poolOn), Math.max(0, t.veil.lit), Math.max(0, t.veil.dim), Math.min(1, Math.max(0, t.tone.sheenDye)) * f.sheen);
    U.uClubClothGraze.value.set(mix(1, t.tone.sheenGraze, f.sheen), t.tone.grazeFrom, Math.max(t.tone.grazeTo, t.tone.grazeFrom + 1e-4), Math.min(1, Math.max(0, t.even.share)) * poolOn);
    U.uClubClothEven.value.set(Math.min(1, Math.max(0.5, t.even.level)), mix(1, Math.max(0, t.tone.lampSpecular), f.color), t.veil.from, Math.max(t.veil.to, t.veil.from + 1e-4));
    U.uClubClothFace.value.set(t.face.level * poolOn * f.face * f.cush, t.face.veil, envGain, 0);
    U.uClubClothTone.value.set(mix(1, t.tone.albedo, f.color), mix(1, t.tone.saturation, f.color), mix(1, t.tone.sheen, f.sheen), mix(1, t.tone.sheenSaturation, f.sheen));
    U.uClubClothCush.value.set(mix(1, t.cush.sheen, f.sheen), mix(1, t.cush.sheenRoughness, f.sheen), mix(1, t.cush.albedo, f.color), f.cush);
    U.uClubClothGrain.value.set(t.grain.napFlatten * poolOn, t.grain.footFrom, Math.max(t.grain.footTo, t.grain.footFrom + 1e-5), t.grain.footMax * poolOn);
    U.uClubClothNear.value.set(t.weave.handoverFrom, t.weave.handoverTo, appTwill ? t.weave.handover : 0, mix(1, t.tone.specular, f.color));
    const dl = Math.hypot(t.weave.dir[0], t.weave.dir[1]) || 1;
    U.uClubClothNap.value.set(t.weave.dir[0] / dl, t.weave.dir[1] / dl, 0, 0);
    U.uClubClothWeaveK.value.set(weave.tilesPerM || 1, weave.on ? t.weave.strength * f.weave : 0, weave.size || 64, 0);
    // the lamp's level on this cloth: 1 without a lamp or with the pool group off (the cloth then keeps the app's light). The
    // uniform takes k - 1 (cloth/glsl.js: an unset uniform is then the look as tuned)
    const lv = levelUnderLamp(levels, level.look, level.key, level.fixture);
    level.k = poolOn > 0 ? lv.k : 1;
    level.found = poolOn > 0 && lv.found;
    U.uClubClothLevel.value.set(level.k - 1, level.found ? 1 : 0, 0, 0);
  }
  // the app's close-up twill (table.js clothDetail.uClothDetailOn) as the compiled program sees it; false until it is known
  let appTwill = false;
  function syncAppTwill() {
    let on = false;
    for (const p of patched) {
      try { const m = p.ref?.deref?.(); if (m && Number(ctx.renderer?.properties?.get?.(m)?.uniforms?.uClothDetailOn?.value) > 0) on = true; } catch { /* unreadable: no hand-over */ }
    }
    if (on !== appTwill) { appTwill = on; write(); }
  }
  /** Tools: set({ pool, color, sheen, cush, face, weave }) with 0..1 per group (0 = the identity); set() only rewrites the uniforms from `tune` and `levels`. */
  function set(next = {}) {
    for (const g of GROUPS) {
      const v = next?.[g];
      if (typeof v === 'number' || typeof v === 'boolean') flags[g] = Math.min(1, Math.max(0, Number(v)));
    }
    write();
    return { ...flags };
  }

  // ---- programs: sampler units of a material's live program (tools and state() only; never per frame) ----
  const gl = (() => { try { return ctx.renderer?.getContext?.() ?? null; } catch { return null; } })();
  const unitLimit = (() => { try { return gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : 16; } catch { return 16; } })();
  function samplersOf(material) {
    try {
      const prog = ctx.renderer?.properties?.get?.(material)?.currentProgram;
      if (!gl || !prog?.program) return null;
      const n = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
      const names = [];
      let units = 0, weaveBound = false;
      for (let i = 0; i < n; i++) {
        const a = gl.getActiveUniform(prog.program, i);
        if (!a || !SAMPLER_TYPES.has(a.type)) continue;
        units += a.size; names.push(a.size > 1 ? `${a.name}x${a.size}` : a.name);
        if (a.name === 'uClubClothWeave') weaveBound = true;
      }
      return { units, names, weaveBound, patched: String(prog.cacheKey ?? '').includes(`mat-cloth-v${CLOTH_PATCH_VERSION}`) };
    } catch { return null; }
  }

  // ---- patches ----
  const done = new WeakSet(); // a material takes ONE variant of the patch for its whole life
  const patched = []; // { ref, name, weave }
  const skipped = [];
  const isAnalytic = (m) => { try { return typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).startsWith('spike'); } catch { return false; } };
  // the sampler variant is asked for, never the default (tiers.js owns the knob table; a tool asks with ?clubcloth=weave)
  weave.wanted = club.knobs?.clothWeave === true || tokens.includes('weave');
  function ensureWeaveTexture() {
    if (weave.texture) return weave.texture;
    const fb = fallbackWeave();
    let t = fb;
    try { t = club.assets?.texture?.(WEAVE_ID, { repeat: [1 / WEAVE_TILE_M, 1 / WEAVE_TILE_M], anisotropy: 8, fallback: fb }) ?? fb; } catch { t = fb; }
    weave.texture = t;
    U.uClubClothWeave.value = t;
    weave.on = true;
    syncWeave();
    try { club.assets?.ready?.([WEAVE_ID])?.then?.(syncWeave, () => {}); } catch { /* the stand-in stays */ }
    return t;
  }
  let rebuilds = 0;
  function patchAll() {
    let n = 0;
    for (const m of adopt.find('cloth')) {
      if (done.has(m)) continue;
      const name = m?.name || m?.userData?.obClass || m?.type || 'cloth';
      if (!m?.isMeshPhysicalMaterial || !isAnalytic(m)) { if (!skipped.includes(name)) skipped.push(name); continue; }
      // the sampler budget: what the live program binds now, plus this patch's one, plus one for a patch that is installed but
      // not compiled yet, must fit the limit; otherwise this material takes the variant without the weave
      const live = samplersOf(m);
      const useWeave = weave.wanted && (!live || live.units + 2 <= unitLimit);
      if (useWeave) ensureWeaveTexture();
      // the variant without the sampler declares no weave uniforms: hand it only the ones its text names
      const { uClubClothWeaveK, uClubClothNap, uClubClothWeave, ...plain } = U;
      if (adopt.patch(m, clothPatchSpec({ weave: useWeave, uniforms: useWeave ? U : plain }))) {
        done.add(m); n += 1;
        try { patched.push({ ref: new WeakRef(m), name, weave: useWeave }); } catch { patched.push({ ref: null, name, weave: useWeave }); }
      }
    }
    return n;
  }

  let frame = 0;
  // a fixture swap moves the emitters, a brightness setting changes the lamp, the ambient cube arrives late: none is an event of
  // ours. A swap replaces the room's rect lights (and the applied fixture with them, in one step), and a table change moves the
  // bed-match key even where it keeps the lamp. Both are checked ahead of EVERY render of the scene (scene.onBeforeRender,
  // chained as the occlusion service chains it, below) and in the frame hook, and the lamp and its level are read again when
  // one of them moved: a swap that lands in a later frame hook, or between two frames before a cube capture, is drawn at its
  // own level, and no render draws one lamp's light, or one table's bed, at another's level. The rest follows on the 30-frame
  // tick. The check is two reads and two compares.
  let lightsSeen = null, tableSeen = null, renderSeen = null; // renderSeen: the frame of the render-time check's last run
  let renderHookOn = false; // the render-time check's handler is on the scene (built off stage: from the swap on; see below)
  const roomLights = () => { try { return ctx.room?.lightRefs?.rectLights ?? null; } catch { return null; } };
  const tableNow = () => { try { return ctx.table?.tableId?.() ?? null; } catch { return null; } };
  const seen = () => { lightsSeen = roomLights(); tableSeen = tableNow(); };
  const check = () => {
    const rl = roomLights(), tb = tableNow();
    if (rl !== lightsSeen) { lightsSeen = rl; tableSeen = tb; findLights(); syncLamp(); }
    else if (tb !== tableSeen) { tableSeen = tb; syncLamp(); }
  };
  // (the arena venue: the ambient values are followed in the frame they change. Read every 30th frame,
  // the bed kept the values of the hall's FIRST capture, which hold a residue of the room the cube was baked from before,
  // for up to 30 frames after the reflection service had made the settled ones: two boots, two tints. One serial compare
  // per frame; under the club venue `follow` is false and the line is what it was.)
  let follow = false;
  try { follow = isArena(club); } catch { follow = false; }
  const ambientSerial = () => { try { const a = envWanted ? club.env?.ambient : null; return a?.enabled === true ? (a.serial ?? null) : null; } catch { return null; } };
  const onFrame = () => {
    if (!renderHookOn && club?.offStage !== true) installRenderCheck(); // (built off stage: the swap has been; see below)
    check();
    if ((frame++ % 30) === 0) { syncLamp(); syncEnv(); syncAppTwill(); } else if (follow && ambientSerial() !== env.serial) syncEnv();
  };
  // (the arena venue: the reflection service says so in the task that made new values, so a bake that follows in the same
  // task, the walk of env.js, already sees the bed at their gain)
  if (follow) { try { club.env?.ambient?.onChange?.(() => syncEnv()); } catch { /* an older reflection service: the frame hook follows */ } }
  function rebuild(_reason) {
    rebuilds += 1;
    if (!renderHookOn && club?.offStage !== true) installRenderCheck(); // (built off stage: the swap's rebuild, ahead of its capture)
    const added = patchAll();
    findLights();
    seen();
    syncLamp();
    syncEnv();
    syncWeave();
    syncAppTwill();
    return added;
  }
  function state() {
    const mats = [];
    for (const p of patched) {
      const m = p.ref?.deref?.();
      if (p.ref && !m) continue; // collected
      const s = m ? samplersOf(m) : null;
      mats.push({ name: p.name, weave: p.weave, samplers: s ? s.units : null, samplerNames: s ? s.names : null, compiledWithPatch: s ? s.patched : null });
    }
    let asset = null;
    try { asset = club.assets?.state?.().ids?.[WEAVE_ID] ?? null; } catch { asset = null; }
    const r4 = (v) => +Number(v).toFixed(4);
    return {
      enabled: true, key: `mat-cloth-v${CLOTH_PATCH_VERSION}`, patched: mats.length, materials: mats, skipped: skipped.slice(), rebuilds,
      samplerLimit: unitLimit, addedSamplers: weave.on ? 1 : 0,
      weave: { wanted: weave.wanted, on: weave.on, status: weave.status, asset, size: weave.size, tilesPerM: +weave.tilesPerM.toFixed(3), appTwill },
      lamp: { source: lamp.source, rect: lamp.rect ? { ...lamp.rect } : null, formFactorUnderLamp: r4(lamp.ref), lights: lamp.lights.length, radiance: lamp.radiance.map(r4), onWhiteUnderLamp: lamp.white.map(r4) },
      ambient: { source: lamp.ref > 0 ? env.source : 'none (no lamp: the app\'s light)', wanted: envWanted, serial: env.serial, level: tune.pool.ambient,
        // cubeUp: what the cube alone would give an upward patch; fromCube: what is taken from it; both as shares of the centre's lamp light
        cubeUp: r4(env.raw), fromCube: r4(env.share), cubeGain: r4(env.gain), cube: env.on ? U.uClubClothAmb.value.slice(0, 6).map((v) => v.toArray().map(r4)) : null },
      // level.watch: what the swap and table checks read (false: that check has no source here, and only the tick reads it).
      // render is read live: the render-time check ran at this frame's or the last frame's render (a service that puts an
      // older scene.onBeforeRender back without chaining turns it false). hook (the stage flow only): the handler is on the scene
      level: { ...level, watch: { lights: roomLights() !== null, table: tableNow() !== null, render: renderSeen !== null && renderSeen >= frame - 1, ...(renderBuiltOffStage ? { hook: renderHookOn } : {}) } },
      groups: { ...flags }, tune: JSON.parse(JSON.stringify(tune)),
      ...(venueNote ? { venue: { ...venueNote, flatTint: venueNote.flatTint.slice() } } : {}), // round A1: absent under the club venue
      uniforms: Object.fromEntries(Object.entries(U).filter(([, u]) => u.value?.isVector4).map(([k, u]) => [k, u.value.toArray().map(r4)])),
    };
  }

  patchAll();
  findLights();
  seen();
  syncLamp();
  syncEnv();
  try { club.onFrame?.(onFrame); } catch { /* no frame hook (a dev page): rebuild() re-reads the lamp */ }
  // the render-time check (above), chained and never thrown out of: three calls scene.onBeforeRender before it builds the
  // draw list of every render of the scene, a cube camera's included.
  // Built OFF STAGE (the stage flow of club/index.js, CONTRACT.md section 21; `club.offStage` is absent without it) the
  // handler does not go in when the part is built: the game is live on the app's stage, no render of it passes through the
  // look, and a stage that fails (always before the swap) leaves the scene's handler as the app had it. It goes in at the
  // swap: the swap's show pass rebuilds every service before its one capture (rebuild(), above), and the first frame hook
  // after the swap puts it in if no rebuild came. Until then the frame hook's check stands alone, as on a page without a
  // scene. Without the stage flow the handler goes in here, at once, as before.
  const renderBuiltOffStage = club?.offStage === true;
  function installRenderCheck() {
    if (renderHookOn) return;
    renderHookOn = true;
    try {
      const sc = ctx.scene;
      if (sc && typeof sc === 'object') {
        const prevBefore = sc.onBeforeRender;
        sc.onBeforeRender = function clubClothBefore(r, s, cam, rt) {
          renderSeen = frame;
          try { check(); } catch { /* the frame hook and its tick read the lamp again */ }
          if (typeof prevBefore === 'function') prevBefore.call(this, r, s, cam, rt);
        };
      }
    } catch { /* a sealed scene stand-in: the frame hook checks */ }
  }
  if (!renderBuiltOffStage) installRenderCheck();
  return { enabled: true, reason: null, rebuild, state, set, tune, levels, uniforms: U, ...(follow ? { ambientSynced: () => ambientSerial() === env.serial } : {}) }; // (`ambientSynced`: the arena venue, read by the installer's quiet rule)
}
