// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/pocket.js — the pockets of the club look (CONTRACT.md 10.1, owner: pocket). Reached only through mat/index.js.
//
// What a pocket of the app is made of (measured on pool_pro_9ft; the same parts are looked for on any table):
//   fall lip   the cloth's return down the edge of the hole (the cloth material; a vertical wall under a sharp bed edge)
//   boot       the casting / collar: flange on the rail, throat sleeve from 56 mm over the bed to 14 mm under it (MeshPhysical
//              #161617, 0.8 % reflectance, specularIntensity 0.24: it stays at 6 / 255 under any light)
//   cup        the drop: an UNLIT box (MeshBasic #030303, floor #010101) from 7 mm to 132 / 146 mm under the bed
// and why it read as a black hole with a blue arc: nothing below the bed is lit at all, the boot is too black to show the
// light it receives, the bed ends at the hole in a hard edge, and on the casting side the cloth's return stands 6 mm proud
// of the boot's hem (the hem curls outward behind it) as a band of fully lit cloth across the far wall.
//
//   collar   patch on the boot material: leather albedo from the `leather.color` scan (ONE added sampler), the F0 of a real
//            dielectric so the lamp's own lobe gives the broad highlight on the top lip, a stitched seam, ambient light that
//            falls off down the throat
//   lip      patch on the cloth material: the cloth turns over the slate edge (normals), the turned lip loses the room's
//            ambient light, and the band under the casting is shaded as the liner it stands in for (no sampler)
//   cup      patch on the app's unlit cup materials (the `liner` group): the drop becomes a liner lit by the lamp through the
//            mouth and by ambient light as a shaft lets it in, with a broad soft highlight, a cylinder's shading on its
//            faceted round end and a fillet's shading where wall meets floor (ONE added sampler: the scan's normal).
// No mesh is added, hidden or moved, so there is nothing to remove on rebuild('table'): a rebuilt table brings new materials,
// which are found and patched again. (A first build hung a club-owned bag in the drop and hid the app's cup. The ball-return
// system reads every visible mesh of the scene as furniture, web/scene/ballreturn/furniture.js, and a new solid in the path
// of a pocketed ball can refuse its track; the bag was taken out before it was ever run with a ball in motion.)
// The shader text is in pocket/glsl.js, the geometry in pocket/geom.js. Pockets are described in a folded frame (one corner,
// one side): a table that is not mirror-symmetric in x and z within a millimetre does not take the part.
//
// Tool knobs on the boot URL: ?clubpocket=off (the part is not built), ?clubpocket=nocollar,noliner,nolip,noarc,nostitch,
// nothroat (the named groups stay at the identity). At run time: club.mat.parts.pocket.set({ on: 0 | 1, collar: 0 | 1, ... }).
import * as THREE from 'three';
import { collarPatchSpec, lipPatchSpec, cupPatchSpec, POCKET_PATCH_VERSION } from './pocket/glsl.js';
import { describeLip, describeCup, foldPockets, lampBounds } from './pocket/geom.js';

const BED_Y = 0; // the bed plane (CONTRACT.md section 1)
const GROUPS = ['on', 'collar', 'liner', 'lip', 'arc', 'stitch', 'throat'];
const SYMMETRY_LIMIT_M = 0.001;
// the `leather.color` scan (web/assets/club/CREDITS.md): its mean colour (sRGB bytes) and the mean luminance of that colour in
// linear light. The stand-in for a missing file is painted in the mean colour, so one normalisation serves both.
const SCAN_MEAN_SRGB = [95, 50, 28];
const SCAN_MEAN_LUMA = 0.048;

/** The look's pocket values. */
export const POCKET_TUNE = Object.freeze({
  albedo: 0.06,          // reflectance of the leather (linear luminance): dyed black leather and moulded rubber return 4-8 %
  tintR: 1.0, tintG: 0.93, tintB: 0.86, // its hue: a warm black
  tile: 0.14,            // metres per repeat of the scan (the source hide is 0.6 m per repeat: upholstery grain; a boot's is finer)
  contrast: 0.7,         // exponent on the scan's light and dark
  hue: 0.1,              // share of the scan's own brown that shows
  f0: 0.018,             // normal-incidence reflectance of the leather's surface (the app's boot has 0.0096; smooth leather 0.045)
  roughScale: 1.0, roughAdd: 0.0,  // on the boot's zoned roughness (rolls 0.34, pad 0.5-0.6)
  clearcoat: 1.0,        // gain on the boot's thin wax coat (0.10 at roughness 0.42)
  seamOffset: 0.0165,    // the seam's station along the boot's section, metres past its crest (the foot of the padded roll)
  threadHalf: 0.00045,   // half-width of the thread (m)
  threadR: 0.16, threadG: 0.135, threadB: 0.1, // thread albedo
  hole: 0.35,            // albedo scale in the needle holes between dashes
  band: 0.008,           // width of the cloth's roll over the slate edge (m), on the bed and down the return
  edgeTilt: 0.9,         // how far the cloth has turned at the bed edge (radians)
  lipAmbient: 0.3,       // ambient light left on the fully turned lip (it looks at the liner, not at the room)
  lipSheen: 0.9,         // share of the cloth's sheen lobe the fully turned lip loses (its fibres are seen end-on)
  filmEdge: 0.36,        // light left on the bed between the hole and the inner edge of the app's occlusion film (the level of
                         // the film's own inner edge with the contact band, measured in the app at V5: 0.24 of the open bed
                         // against 0.67 on the ring)
  arcAmbient: 0.6,       // ambient light left on the band under the casting (the throat's value at the bed plane)
  jaw: 0.35,             // share of the ambient light the throat's top lost that comes back between the jaws, above the bed
  // the light the cloth part puts on the bed (mat/cloth/tune.js pool: direct 1.7, flat ambient 0.34 of the centre's lamp
  // light, the probe dropped), restated here because the casting's and the liner's programs do not carry the cloth's uniforms:
  direct: 1.7,           // gain of the lamp term
  ambient: 0.085,        // ambient light on an open upward face, in units of the lamp's form factor (0.34 x 0.25 under the lamp)
  probeKeep: 0.1,        // share of the app's environment probe kept on the casting (the probe gives about 0.45 in the same
                         // units; at 0.2 the pad read 95-110/255 from above beside cloth at 107: grey suede, not dark leather)
  bounce: 0.035,         // fill inside the drop, same units: a DESIGNED level (about 8 / 255 on the unlit side; the physical
                         // second bounce off black leather is about 0.002 and ends at 0 / 255 under the tone curve's toe)
  linerAlbedo: 0.8,      // the liner's albedo as a share of the casting's leather
  linerF0: 0.02, linerRough: 0.55, linerNormal: 1.2,
  pen0: 0.004, pen1: 0.12, // penumbra of one lamp point at the mouth (m) and per metre of depth
  belly: 0.5,            // largest slope of the liner's wall, half way down (a bag's belly, shaded, not built)
  fillet: 0.03,          // radius of the fillet that is shaded where the cup's wall meets its floor (m)
});

const stub = (reason) => ({ enabled: false, reason, rebuild() {}, state: () => ({ enabled: false, reason }) });
const SAMPLER_TYPES = new Set([0x8B5E, 0x8B60, 0x8B5F, 0x8B62, 0x8DC1, 0x8DC4, 0x8DC5, 0x8DCA, 0x8DCB, 0x8DCC, 0x8DCF, 0x8DD2, 0x8DD3, 0x8DD4, 0x8DD7]);
const text = (e) => String(e?.message ?? e);
const V4 = (x = 0, y = 0, z = 0, w = 0) => ({ value: new THREE.Vector4(x, y, z, w) });

export async function applyPocket(club) {
  const ctx = club?.ctx ?? {};
  const adopt = club?.adopt;
  if (typeof adopt?.patch !== 'function' || typeof adopt?.find !== 'function') return stub('no adoption service');
  let asked = '';
  try { asked = String(ctx.query?.get?.('clubpocket') ?? ''); } catch { /* unreadable query: build all */ }
  if (asked === 'off') return stub('off by ?clubpocket');
  const tune = { ...POCKET_TUNE }; // a live copy: tools may write it, then call set()
  const flags = Object.fromEntries(GROUPS.map((g) => [g, asked.split(',').includes(`no${g}`) ? 0 : 1]));
  const useTex = typeof club.knobs?.pocketLeather === 'boolean' ? club.knobs.pocketLeather : club.tier !== 'lite';
  const notes = [];
  const note = (s) => { if (!notes.includes(s) && notes.length < 12) notes.push(s); };

  // ---- uniforms (shared objects: one set for the collar patch, the lip patch and the liner material) ----
  const U = {
    uClubPktCA: V4(1e3, 1e3, 1, 1), uClubPktCB: V4(1e3, 1e3, 1, 0), uClubPktCC: V4(1e3, 0.05, 0, 0),
    uClubPktSA: V4(0, 1e3, 1, 1), uClubPktSB: V4(0, 1e3, 1, 0), uClubPktSC: V4(1e3, 0.05, 0, 0),
    uClubPktK: V4(0, 0, 0, 0), uClubPktK2: V4(0, 0, 0, 0),
    uClubPktTone: V4(0.06, 0.06, 0.06, 4), uClubPktTex: V4(1 / SCAN_MEAN_LUMA, 1, 0, 0), uClubPktLip: V4(0.008, 0.3, 0.6, 0.35),
    uClubPktSpec: V4(0.045, 1, 0, 1), uClubPktThread: V4(0.2, 0.17, 0.13, 0.35),
    uClubPktLamp: V4(0, 0, 1, 0.33), uClubPktLampC: V4(5, 5, 5, 1),
    uClubPktAmb: V4(1, 0.085, 1, 0),
    uClubPktLin: V4(0.006, 0.045, 0.55, 0.7), uClubPktLin2: V4(0.004, 0.12, 0.03, 1), uClubPktLip2: V4(0, 0, 0, 0),
    uClubPktCup: V4(-0.13, -0.146, 0, 0),
    uClubPktLeather: { value: null }, uClubPktLeatherN: { value: null },
  };

  // ---- textures ----
  const tex = { color: null, normal: null };
  function flatTexture(rgb, srgb, name) {
    let t = null;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const g = c.getContext('2d');
      g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      g.fillRect(0, 0, 4, 4);
      t = new THREE.CanvasTexture(c);
    } catch {
      const d = new Uint8Array(16);
      for (let i = 0; i < 4; i++) d.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
      t = new THREE.DataTexture(d, 2, 2);
    }
    t.name = name;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }
  function ensureTextures(withNormal) {
    if (!tex.color) {
      const fb = flatTexture(SCAN_MEAN_SRGB, true, 'club-pocket-leather-standin');
      try { tex.color = club.assets?.texture?.('leather.color', { srgb: true, anisotropy: 8, fallback: fb }) ?? fb; } catch { tex.color = fb; }
      U.uClubPktLeather.value = tex.color;
    }
    if (withNormal && !tex.normal) {
      const fb = flatTexture([128, 128, 255], false, 'club-pocket-leather-normal-standin');
      try { tex.normal = club.assets?.texture?.('leather.normal', { srgb: false, anisotropy: 8, fallback: fb }) ?? fb; } catch { tex.normal = fb; }
      U.uClubPktLeatherN.value = tex.normal;
    }
  }

  // ---- the lamp, read from the app (shading.js setEmitters keeps the shared emitter uniforms) ----
  const lamp = { source: 'none', rect: null, radiance: [5, 5, 5], radianceSource: 'default' };
  const _p = new THREE.Vector3();
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
    ctx.scene?.traverseVisible?.((o) => {
      if (o.isRectAreaLight && out.length < 4) { o.getWorldPosition(_p); out.push({ pos: [_p.x, _p.y, _p.z], half: [o.width / 2, o.height / 2] }); }
    });
    lamp.source = out.length ? 'scene rect lights' : 'none';
    return out;
  }
  function syncLamp() {
    let rect = null;
    try { rect = lampBounds(readEmitters()); } catch { rect = null; }
    if (rect && !(rect.y > BED_Y + 0.05)) rect = null;
    lamp.rect = rect;
    if (rect) { U.uClubPktLamp.value.set(rect.cx, rect.cz, rect.hx, rect.hz); U.uClubPktLampC.value.w = rect.y; }
    // the lamp's radiance: the rectangular lights of the scene (colour x intensity; several lights share the rectangle)
    let r = 0, g = 0, b = 0, area = 0;
    try {
      ctx.scene?.traverseVisible?.((o) => {
        if (!o.isRectAreaLight) return;
        const a = Math.max(o.width * o.height, 1e-6);
        r += o.color.r * o.intensity * a; g += o.color.g * o.intensity * a; b += o.color.b * o.intensity * a; area += a;
      });
    } catch { area = 0; }
    if (area > 0) { lamp.radiance = [r / area, g / area, b / area]; lamp.radianceSource = 'scene rect lights'; } else { lamp.radiance = [5, 5, 5]; lamp.radianceSource = 'default'; }
    const c = U.uClubPktLampC.value;
    c.x = lamp.radiance[0]; c.y = lamp.radiance[1]; c.z = lamp.radiance[2];
  }

  // ---- the table's pockets ----
  const _box = new THREE.Box3(), _v = new THREE.Vector3();
  const tableRoot = () => ctx.table?.group ?? ctx.scene ?? null;
  const worldBox = (o) => {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    return _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
  };
  const worldPositions = (o, max = 60000) => {
    const p = o.geometry.attributes.position, out = [];
    const step = Math.max(1, Math.ceil(p.count / max));
    for (let i = 0; i < p.count; i += step) { _v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); out.push([_v.x, _v.y, _v.z]); }
    return out;
  };
  const worldNormals = (o) => {
    const n = o.geometry.attributes.normal;
    if (!n) return null;
    const out = [];
    for (let i = 0; i < n.count; i++) { _v.fromBufferAttribute(n, i).transformDirection(o.matrixWorld); out.push([_v.x, _v.y, _v.z]); }
    return out;
  };
  const isAnalytic = (m) => { try { return typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).startsWith('spike'); } catch { return false; } };
  const luma = (c) => (c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 1);

  // found: { pockets: [{ ...describeLip, lip, cup, cupMeshes, top }], folded, signature }
  let found = { pockets: [], folded: null, signature: '', reason: 'not looked for yet' };
  let fits = false; // the folded description is usable
  function discover() {
    const root = tableRoot();
    const out = { pockets: [], folded: null, signature: '', reason: null };
    if (!root?.traverse) { out.reason = 'no table in the scene'; return out; }
    root.updateWorldMatrix?.(true, true);
    const basics = [], films = [], pocketMats = new Set();
    try { for (const m of adopt.find('pocket')) pocketMats.add(m); } catch { /* no class: no casting top is read */ }
    const collars = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return;
      if (m.userData?.obClass === 'cloth') {
        const b = worldBox(o);
        const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
        if (b.max.y > BED_Y + 0.003 || b.min.y < BED_Y - 0.04 || b.min.y > BED_Y - 0.002 || w > 0.3 || w < 0.05) return;
        if (out.pockets.length >= 12) return;
        const wp = worldPositions(o);
        const d = describeLip(wp, worldNormals(o));
        if (d) out.pockets.push({ ...d, lip: o, cup: null, cupMeshes: [], top: 0.05 });
      } else if (m.isMeshBasicMaterial && !m.transparent && luma(m.color) < 0.03) {
        basics.push(o);
      } else if (m.isMeshBasicMaterial && m.transparent && m.map) {
        films.push(o);
      } else if (pocketMats.has(m)) {
        collars.push(o);
      }
    });
    if (!out.pockets.length) { out.reason = 'no fall lip found (a table without pockets, or one built another way)'; return out; }
    const nearest = (x, z) => {
      let best = null, bd = Infinity;
      for (const p of out.pockets) { const d = Math.hypot(x - p.cx, z - p.cz); if (d < bd) { bd = d; best = p; } }
      return bd < (best?.r0 ?? 0) + 0.1 ? best : null;
    };
    // the cup of each pocket: a dark unlit wall that starts just under the bed and goes well down, and a flat floor at its foot
    const floors = [];
    for (const o of basics) {
      const b = worldBox(o);
      const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      if (w > 0.4 || b.max.y > BED_Y + 0.001) continue;
      const p = nearest((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
      if (!p) continue;
      if (b.max.y > BED_Y - 0.03 && b.min.y < BED_Y - 0.05) {
        if (p.cup) continue;
        const c = describeCup(worldPositions(o), p);
        if (c) { p.cup = c; p.cupMeshes.push(o); }
      } else if (b.max.y - b.min.y < 0.002) floors.push({ o, y: b.min.y, p });
    }
    for (const f of floors) if (f.p.cup && Math.abs(f.y - f.p.cup.bottom) < 0.002) f.p.cupMeshes.push(f.o);
    // the app's occlusion film on the bed in front of each mouth: a flat transparent sheet a fraction of a millimetre over the
    // bed; its inner radius from the pocket's front centre
    for (const o of films) {
      const b = worldBox(o);
      if (b.min.y < BED_Y - 0.0001 || b.max.y > BED_Y + 0.001) continue;
      const p = nearest((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
      if (!p) continue;
      let r = Infinity;
      for (const [x, , z] of worldPositions(o, 4000)) r = Math.min(r, Math.hypot(x - p.front.x, z - p.front.z));
      if (Number.isFinite(r)) p.film = Math.min(p.film ?? Infinity, r);
    }
    // the casting's top lip over each pocket
    for (const o of collars) {
      const b = worldBox(o);
      const p = nearest((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
      if (p && b.max.y > BED_Y + 0.01 && b.max.y < BED_Y + 0.12) p.top = Math.max(p.top === 0.05 ? 0 : p.top, b.max.y - 0.006);
    }
    out.folded = foldPockets(out.pockets);
    const topOf = (side) => { const l = out.pockets.filter((p) => p.side === side); return l.length ? l.reduce((s, p) => s + p.top, 0) / l.length : 0.05; };
    const filmOf = (side) => { const l = out.pockets.filter((p) => p.side === side && Number.isFinite(p.film)); return l.length ? l.reduce((s, p) => s + p.film, 0) / l.length : 0; };
    const cupOf = (side) => {
      const l = out.pockets.filter((p) => p.side === side && p.cup);
      return l.length ? { rc: l.reduce((s, p) => s + p.cup.rc, 0) / l.length, bottom: l.reduce((s, p) => s + p.cup.bottom, 0) / l.length, top: l[0].cup.top, run: l[0].cup.run, n: l.length } : null;
    };
    if (out.folded.corner) { out.folded.corner.top = topOf(false); out.folded.corner.film = filmOf(false); out.folded.corner.cup = cupOf(false); }
    if (out.folded.side) { out.folded.side.top = topOf(true); out.folded.side.film = filmOf(true); out.folded.side.cup = cupOf(true); }
    out.signature = out.pockets.map((p) => `${p.lip.geometry.uuid}:${p.cupMeshes.map((c) => c.uuid).join('+')}`).join('|');
    return out;
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
      let units = 0;
      for (let i = 0; i < n; i++) {
        const a = gl.getActiveUniform(prog.program, i);
        if (!a || !SAMPLER_TYPES.has(a.type)) continue;
        units += a.size; names.push(a.size > 1 ? `${a.name}x${a.size}` : a.name);
      }
      return { units, names, patched: String(prog.cacheKey ?? '').includes(`mat-pocket-v${POCKET_PATCH_VERSION}`) };
    } catch { return null; }
  }

  // ---- patches ----
  const done = new WeakSet(); // a material takes ONE variant of a patch for its whole life
  const cups = { materials: 0 };
  const patched = []; // { ref, name, kind, tex, seam }
  const skipped = [];
  const remember = (m, name, kind, extra) => { try { patched.push({ ref: new WeakRef(m), name, kind, ...extra }); } catch { patched.push({ ref: null, name, kind, ...extra }); } };
  // without the occlusion service nobody has said what a pocket part is: the same rule, registered once
  let classified = false;
  function ensureClass() {
    if (classified || typeof adopt.classify !== 'function') return;
    classified = true;
    let any = false;
    try { any = adopt.find('pocket').length > 0; } catch { any = false; }
    if (any) return;
    adopt.classify('pocket', (o, m) => {
      if (!found.pockets.length || !m?.isMeshStandardMaterial || m.userData?.obClass || !isAnalytic(m) || o.isInstancedMesh || !o.geometry?.attributes?.position) return false;
      const b = worldBox(o);
      const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      if (w > 0.4 || b.max.y > BED_Y + 0.12 || b.min.y < BED_Y - 0.25) return false;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      return found.pockets.some((p) => Math.hypot(cx - p.cx, cz - p.cz) < p.r0 + 0.05);
    });
  }
  // the seam's station on a boot: metres along its section (the v of its uv) from the vertex that stands highest
  function seamOf(material) {
    const none = { on: 0, station: 0, inv: 1 };
    if (!material.normalMap) return none;
    let mesh = null;
    tableRoot()?.traverse?.((o) => { if (!mesh && o.isMesh && (o.material === material || (Array.isArray(o.material) && o.material.includes(material)))) mesh = o; });
    const uv = mesh?.geometry?.attributes?.uv, p = mesh?.geometry?.attributes?.position;
    if (!uv || !p) return none;
    let top = -Infinity, vTop = 0, vMax = -Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), v = uv.getY(i); if (y > top) { top = y; vTop = v; } if (v > vMax) vMax = v; }
    const station = vTop + tune.seamOffset;
    const rep = Number(material.normalMap.repeat?.y) || 1;
    // the section must be in metres and long enough to hold the seam (a crest some centimetres along, a pad after it), and the
    // part must be a casting that stands on the rail (a crest well over the bed), not a bowl or a skirt inside the drop
    if (!(vTop > 0.02 && vTop < 0.3 && vMax > station + 0.004 && vMax < 0.6) || !(worldBox(mesh).max.y > BED_Y + 0.03)) return none;
    return { on: 1, station, inv: 1 / rep };
  }
  function patchAll() {
    if (!fits) return 0;
    ensureClass();
    let n = 0;
    for (const m of adopt.find('pocket')) {
      if (done.has(m)) continue;
      const name = m?.name || m?.type || 'pocket';
      if (!m?.isMeshStandardMaterial || !isAnalytic(m)) { if (!skipped.includes(name)) skipped.push(name); continue; }
      // the sampler budget: what the live program binds now, plus this patch's one, plus one for a patch that is installed but
      // not compiled yet, must fit the limit; otherwise this material takes the variant without the scan
      const live = samplersOf(m);
      const withTex = useTex && (!live || live.units + 2 <= unitLimit);
      if (withTex) ensureTextures(false);
      const seam = seamOf(m);
      const uSeam = V4(seam.station, seam.inv, tune.threadHalf, seam.on);
      if (adopt.patch(m, collarPatchSpec({ tex: withTex, uniforms: { ...U, uClubPktSeam: uSeam } }))) {
        done.add(m); n += 1;
        remember(m, name, 'collar', { tex: withTex, seam, uSeam });
      }
    }
    for (const m of adopt.find('cloth')) {
      if (done.has(m)) continue;
      const name = m?.name || m?.userData?.obClass || m?.type || 'cloth';
      if (!m?.isMeshStandardMaterial || !isAnalytic(m)) { if (!skipped.includes(`cloth:${name}`)) skipped.push(`cloth:${name}`); continue; }
      if (adopt.patch(m, lipPatchSpec({ uniforms: U }))) { done.add(m); n += 1; remember(m, name, 'lip', { tex: false }); }
    }
    // the cups: the app's own unlit materials (one per mesh), found with the pockets; they carry no sampler, the patch adds one
    for (const p of found.pockets) {
      for (const o of p.cupMeshes) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m?.isMeshBasicMaterial || done.has(m)) continue;
          if (useTex) ensureTextures(true);
          if (adopt.patch(m, cupPatchSpec({ tex: useTex, uniforms: U }))) { done.add(m); n += 1; cups.materials += 1; remember(m, o.name || 'cup', 'cup', { tex: useTex }); }
        }
      }
    }
    return n;
  }

  // ---- strengths ----
  function write() {
    const t = tune, f = flags, on = fits ? f.on : 0;
    U.uClubPktK.value.set(on, f.collar, f.lip, f.arc);
    U.uClubPktK2.value.set(f.liner, f.stitch, f.throat, 0);
    const tl = 0.2126 * t.tintR + 0.7152 * t.tintG + 0.0722 * t.tintB || 1;
    U.uClubPktTone.value.set(t.albedo * t.tintR / tl, t.albedo * t.tintG / tl, t.albedo * t.tintB / tl, 1 / Math.max(t.tile, 0.01));
    U.uClubPktTex.value.set(1 / SCAN_MEAN_LUMA, t.contrast, t.hue, 0);
    U.uClubPktLip.value.set(t.band, t.lipAmbient, t.arcAmbient, t.jaw);
    U.uClubPktSpec.value.set(t.f0, t.roughScale, t.roughAdd, t.clearcoat);
    U.uClubPktThread.value.set(t.threadR, t.threadG, t.threadB, t.hole);
    U.uClubPktAmb.value.set(t.direct, t.ambient, t.probeKeep, 0);
    U.uClubPktLin.value.set(t.bounce, t.linerF0, t.linerRough, t.linerNormal);
    U.uClubPktLin2.value.set(t.pen0, t.pen1, t.fillet, t.linerAlbedo);
    U.uClubPktLip2.value.set(t.lipSheen, t.filmEdge, 0, 0);
    const fd = found.folded;
    const put = (A, B, C, d, x0) => {
      if (!d) { A.value.set(x0, 1e3, 1, 1); B.value.set(x0, 1e3, 1, 0); C.value.set(1e3, 0.05, 0, 0); return; }
      A.value.set(d.A[0], d.A[1], d.A[2], d.A[3]);
      B.value.set(d.B[0], d.B[1], d.B[2], d.sharp ? t.edgeTilt : 0);
      C.value.set(d.arcU, d.top ?? 0.05, d.film > d.A[2] + 0.0008 && d.film < d.A[2] + 0.02 ? d.film : 0, d.cup?.rc ?? d.A[2]);
    };
    put(U.uClubPktCA, U.uClubPktCB, U.uClubPktCC, fits ? fd?.corner : null, 1e3);
    put(U.uClubPktSA, U.uClubPktSB, U.uClubPktSC, fits ? fd?.side : null, 0);
    for (const p of patched) if (p.uSeam) p.uSeam.value.z = t.threadHalf;
    U.uClubPktCup.value.set(fd?.corner?.cup?.bottom ?? -0.13, fd?.side?.cup?.bottom ?? fd?.corner?.cup?.bottom ?? -0.13, t.belly, fd?.corner?.cup?.top ?? fd?.side?.cup?.top ?? -0.007);
  }
  /** Tools: set({ on, collar, liner, lip, arc, stitch, throat }) with 0..1 per group; set() only rewrites the uniforms from `tune`. */
  function set(next = {}) {
    for (const g of GROUPS) {
      const v = next?.[g];
      if (typeof v === 'number' || typeof v === 'boolean') flags[g] = Math.min(1, Math.max(0, Number(v)));
    }
    write();
    return { ...flags };
  }

  function look(reason) {
    let next;
    try { next = discover(); } catch (e) { next = { pockets: [], folded: null, signature: '', reason: `discovery failed: ${text(e)}` }; }
    const changed = next.signature !== found.signature;
    found = next;
    fits = !!found.folded && found.pockets.length > 0 && found.folded.maxDeviation <= SYMMETRY_LIMIT_M;
    if (found.folded && !fits) note(`the pockets are not mirror images of each other within ${SYMMETRY_LIMIT_M * 1000} mm (${(found.folded.maxDeviation * 1000).toFixed(2)} mm): the part stays off on this table`);
    return changed;
  }

  let frame = 0;
  const onFrame = () => {
    if ((frame++ % 30) !== 0) return;
    syncLamp(); // a fixture swap moves the emitters without an event of ours
    // a table rebuilt without a word: the lip this part read is no longer in the scene
    const lip = found.pockets[0]?.lip;
    if (lip && !lip.parent) rebuild('table (the lip left the scene)');
  };
  function rebuild(reason) {
    look(reason);
    patchAll();
    syncLamp();
    write();
    return true;
  }
  function state() {
    const mats = [];
    for (const p of patched) {
      const m = p.ref?.deref?.();
      if (p.ref && !m) continue; // collected
      const s = m ? samplersOf(m) : null;
      mats.push({ name: p.name, kind: p.kind, leather: p.tex, seam: p.seam ? { on: p.seam.on, station: +p.seam.station.toFixed(4) } : null, samplers: s ? s.units : null, samplerNames: s ? s.names : null, compiledWithPatch: s ? s.patched : null });
    }
    const r4 = (v) => +Number(v).toFixed(4);
    const fd = found.folded;
    const one = (d) => (d ? { front: d.A.map(r4), rear: d.B.slice(0, 3).map(r4), arcU: r4(d.arcU), frontDepth: r4(d.frontDepth), rearDepth: r4(d.rearDepth), sharp: d.sharp, top: r4(d.top ?? 0.05), film: r4(d.film ?? 0) } : null);
    let assets = null;
    try { const ids = club.assets?.state?.().ids ?? {}; assets = { color: ids['leather.color'] ?? null, normal: ids['leather.normal'] ?? null }; } catch { assets = null; }
    return {
      enabled: true, key: `mat-pocket-v${POCKET_PATCH_VERSION}`, fits, reason: found.reason,
      pockets: found.pockets.length, corners: fd?.corners ?? 0, sides: fd?.sides ?? 0, symmetryDeviationMm: fd ? +(fd.maxDeviation * 1000).toFixed(3) : null,
      corner: one(fd?.corner), side: one(fd?.side),
      cups: {
        found: found.pockets.filter((p) => p.cup).length, materials: cups.materials, addedMeshes: 0, hiddenMeshes: 0,
        corner: fd?.corner?.cup ? { rc: r4(fd.corner.cup.rc), run: r4(fd.corner.cup.run), top: r4(fd.corner.cup.top), bottom: r4(fd.corner.cup.bottom) } : null,
        side: fd?.side?.cup ? { rc: r4(fd.side.cup.rc), run: r4(fd.side.cup.run), top: r4(fd.side.cup.top), bottom: r4(fd.side.cup.bottom) } : null,
        reason: found.pockets.some((p) => p.cup) ? null : 'no unlit cup under the pockets of this table (its drop is built from lit parts)',
      },
      patched: mats.length, materials: mats, skipped: skipped.slice(),
      samplerLimit: unitLimit, addedSamplersPerMaterial: { collar: useTex ? 1 : 0, lip: 0, cup: useTex ? 1 : 0 },
      leather: { wanted: useTex, assets },
      lamp: { source: lamp.source, rect: lamp.rect ? { ...lamp.rect } : null, radiance: lamp.radiance.map(r4), radianceSource: lamp.radianceSource },
      groups: { ...flags }, tune: { ...tune }, notes: notes.slice(),
      uniforms: Object.fromEntries(Object.entries(U).filter(([, u]) => u.value?.isVector4).map(([k, u]) => [k, u.value.toArray().map(r4)])),
    };
  }

  rebuild('install');
  try { club.onFrame?.(onFrame); } catch { /* no frame hook (a dev page): rebuild() re-reads the lamp */ }
  if (!found.pockets.length) note(found.reason ?? 'no pocket found');
  return { enabled: true, reason: null, rebuild, state, set, tune, uniforms: U };
}
