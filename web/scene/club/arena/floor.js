// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/floor.js — the furniture of an event on the arena's playing floor, with no people (CONTRACT.md 14.2). Owner: floor.
// Called by arena/room.js, which owns the hall and the carpet.
//
//   buildFloor(club, { box, floorY, tableBounds, roomLight, layout }) -> { group, emissives, setTier(tier), counts(), state(), signature(), dispose() }
//
// What is built (every place from arena/layout.js through floor/plan.js; every shape in floor/items.js):
//   cameras     broadcast cameras on wheeled pedestals at FULL height (lens 1.5 m over the deck), unmanned: a skirt, a
//               telescoping column, a steering ring, a pan and tilt unit, the housing with a large box lens and its hood,
//               a coated front element, a finder, pan bars with zoom and focus demands, two tally lamps (lit on the first
//               camera only: the one small emissive of the part, drawn by the hard material through its emissive map), a
//               cable down to the deck. They stand OUTSIDE the volume the app's camera can reach, in the hall's corners
//               (plan.js planCamera proves each place with the layout's test): nothing is hidden or switched by view
//               (CONTRACT 15.3). No maker's name anywhere, a label is a blank plate;
//   platforms   under each camera: a deck of painted board on a steel frame, a kick rail, a pale nosing on the step-up
//               side, the cable's drop, a folding stool beside the pedestal. Empty: no operator, nothing person-shaped;
//   chairs      the two players' chairs (low, upholstered in leather), each with a side table: a steel bottle, a folded
//               towel, a cube of chalk. Nothing lies on a seat;
//   desk        the table by the boards: a dark cloth to the floor, a ball tray, a rack triangle, the rest leaning on its end;
//   thresholds  a flat aluminium strip across each walk-in of the boards;
//   cables      the taped cable runs of the layout: a ribbon of tape with the cable's ridge under it;
//   shadows     contact-size and cast-size multiply overlays on the carpet under every item, under the material names
//               `arena.floor.contactshadow` / `arena.floor.castshadow` (the club props' split: a bake keeps the first and
//               replaces the second).
//
// Detail (`club.knobs.roomDetail`): 0 = one camera, the chairs and their tables as simple forms (no bevels, no bars, no
// cable, nothing on the tables); 1 = every item at moderate detail; 2 = everything, with the small parts (wheels, vents,
// switches, seams) and rounder rounds. The lite and base rooms upholster the chairs from a 256 px canvas; the high room
// takes the club's `leather.color` and `leather.normal`.
//
// Cost model: one merged batch per material and per side of the stroke room (plan.js groupOf: no mesh's box may hold the
// table, because the ball return's furniture walk reads every scene mesh whose box holds a station under it): the hard
// surfaces (one material for paint, rubber, metal, glass and the lit tally: roughness, metalness and the emissive mask
// come from a data canvas), the leather, the two overlays. What stands inside the boards stays under the app camera's
// cone; the cameras and their platforms stand outside the camera's plan reach: on the hall's floor, or (round A4) on a
// scaffold platform ON a seating block. Nothing of this part is shown, hidden or switched by a rule of its own (CONTRACT
// 15.3). THE HALL'S CUT (the cut-away walls 15.3 carries from the club look): the hall drops a seating block while the
// app's camera is behind that side's plane, and what stands ON a block has to leave with it, or a tower would float in
// the air. So the hard material is made with `hide: true` and every vertex carries `roomSide`: the block's side for a
// platform on a block, its camera and its cable (plan.js planTower `side`), 0 (never dropped) for everything else.
// The albedo law (15.2): the finishes of a class of the layout's ALBEDO table are scaled so the built mean lands on the
// value (floor/paint.js; counts().albedo is the ledger over what was built, the arm pins it).
// Light: every lit material comes from roomLight.material(), the overlays from roomLight.emissive(); without the service
// (null: a dev page) the same numbers go into plain three materials. No three light is created or changed, no shadow flag
// is touched, nothing is registered with the room light (share: 3 emitters, used: 0). Importing this module does nothing.
import * as THREE from 'three';
import { TIERS } from '../tiers.js';
import { Batch, createKit } from '../room/props/kit.js';
import { ARENA, VIEWS } from './layout.js';
import { planFloor, planBoxes, planSignature, checkPlan, checkPeople, PARTS, FLOOR_DRESS_DEFAULT, LOW_CAMERA_PROPOSED, FLOOR_A6_DEFAULT, WORK_LIGHTS_PROPOSED, FLOOR_A7_DEFAULT, FLOOR_A8_DEFAULT } from './floor/plan.js';
import { SWATCHES, SWATCH_CLASS, CLASS_ALBEDO, CLASS_SHADE, LEATHER_FILE_MEAN, albedoOf, swatchAt, paintColour, paintData, paintGlow, paintLeather, swatchUV, regionUV } from './floor/paint.js';
import { tvCamera, platform, stool, chair, sideTable, desk, threshold, cableRun, remoteCamera, floorMonitor, wasteBin, cueStand, workLight, roadCase, trolley, spot } from './floor/items.js';

// which items carry which class of the albedo table (the ledger's means are taken over these)
const ALBEDO_ITEMS = Object.freeze({ black: ['camera'], cloth: ['desk'], leather: ['chair'], deck: ['platform'], nosing: ['platform'] });

// levels and surface numbers (colours are floor/paint.js SWATCHES: the albedo law's classes and the free colours)
export const FLOOR_LEVELS = Object.freeze({
  tally: 1.3,                 // the lit tally lamps: scene-linear red (the hard material's emissive colour; higher and the tone map turns it orange)
  // the cube's share on the hard surfaces. The cube is taken at the table, where the lamp fills the sky; metres away an
  // upward black surface must not mirror it as if it hung overhead (at 0.6 the pedestals' skirts stood at 63 of 255 in the
  // app, shots/floor/a2-CAM.jpg). The glass swatch is a mirror with a bright tint, so the lens still shows the table.
  hardEnv: 0.25,
  // the hard material's mean diffuse reflectance over everything it draws on the high room (about 19 m2 of deck at 0.10,
  // 12 m2 of camera black and 3 m2 of cloth at 0.04, steel as the layout's METAL_BOUNCE): the bake's bounce number
  hardBounce: 0.07,
  // the leather: a dielectric; `roughness` where no roughness map is loaded (the club's file has a mean of 0.51).
  // (round A5: 0.5 -> 0.6. The base room has no roughness map and no normal map, so a chair's flat arm top mirrored
  // the east key as one sheen at 244 on 7 px at V10, AT the bed's peak there, shots/floor/k7-V10.jpg; the high room,
  // whose maps break the sheen up, stood at 228)
  // (round A7: 0.6 -> 0.75, and `roughScale` 1.45 on the high room's roughness map (mean 0.51 -> 0.74; three multiplies
  // the map by the material's scalar and clamps the product at 1). A chair's flat arm top still stood as a WHITE SLAB
  // at V10 on base and high, as bright as the bed: 127.5 with a peak of 210 on base, 132.6 with a peak of 227 on high,
  // box [1167,366 20x6], shots/floor/a7a9-V10.jpg, a7a8-V10.jpg; brown, 28, on lite, where the room light draws no
  // highlight. It is the room light's highlight of one emitter on a face that is flat over 20 px: at the poses'
  // distances, 4 to 9 m, the leather's normal map is under a pixel and what it scattered must be in the roughness.)
  leather: Object.freeze({ roughness: 0.75, roughScale: 1.45, env: 0.2, repeat: 0.5 }),
  // ROUND A6: the cube's share on the high room's BLENDED material (`arena.floor.bright`: steel and glass, about a
  // third of a square metre in all). FULL: a metal has no other term, and at the hard material's quarter share the
  // bucket stood black. The cube is the app's one cube, bound by the room light as on every material of the part
  // (the table role's answer of 12:35Z: no new cube, no capture, no sampler); the room light's own fade under the
  // cube's horizon keeps the bed out of it.
  brightEnv: 1.0,
  // ROUND A7 (CONTRACT 19.1): the share of the HALL's baked cube on every lit material of the part (the env service's
  // tag, `userData.clubHall = { share, keep }`: makeMaterials). FULL, and nothing kept of the app's cube: a
  // metal has no other term, and a dielectric's four per cent are of the hall it stands in. The three shares above
  // are what a material falls back to where the service is not there (a dev page, `?clubenv=hall:0`).
  hallShare: 1.0,
});

/**
 * The tool switches of the floor part, from the boot URL: `?clubfloor=key:value,...` (on / off pictures of the same tree;
 * the app never sets one). cameras:0, chairs:0, desk:0, thresholds:0, cables:0 leave an item kind out (cameras:0 takes
 * the platforms, the stools and the cables with them; cables:0 takes the tape, each camera's lead and each platform's
 * drop); contact:0 / cast:0 leave a shadow overlay out (shadow:0 = both); tally:0 = no lit lamp.
 * Round A5: dress:0 | dress:1 = the dress of the playing floor off / on (floor/plan.js: the one switch with a default
 * of its own, FLOOR_DRESS_DEFAULT; off = round A4's geometry); low:1 = stand the floor role's PROPOSED low camera in
 * while the layout carries no `floor.lowCamera` (a tool's stand-in for pictures: the default build never reads it).
 * Round A6: a6:0 | a6:1 = the round's set off / on (floor/plan.js FLOOR_A6_DEFAULT: the work lamps at the camera
 * platforms, the blended steel and glass, the head end's case and cart, the camera spots; off = round A5's geometry).
 * Round A7: a7:0 | a7:1 = the round's geometry off / on (floor/plan.js FLOOR_A7_DEFAULT: no camera spots, spike tape
 * at the chairs and the low camera, the west corner; off = round A6's geometry). The readers of the hall's
 * reflection are NOT a switch: every lit material carries the env service's tag (makeMaterials). To see the part
 * without the hall's cube turn the SERVICE off, `?clubenv=hall:0`.
 * Round A8: a8:0 | a8:1 = the round's geometry off / on (floor/plan.js FLOOR_A8_DEFAULT: the monitor position on the
 * west floor of the base and the high room; off = round A7's geometry).
 */
export function readLook(query) {
  const look = { cameras: true, chairs: true, desk: true, thresholds: true, cables: true, contact: true, cast: true, tally: true, dress: FLOOR_DRESS_DEFAULT === true, low: false, a6: FLOOR_A6_DEFAULT === true,
    a7: FLOOR_A7_DEFAULT === true, a8: FLOOR_A8_DEFAULT === true };
  let text = '';
  try { text = String(query?.get?.('clubfloor') ?? ''); } catch { text = ''; }
  for (const part of text.split(',')) {
    const [k, v = ''] = part.trim().split(':');
    const off = v === '0' || v === 'off', on = v === '1' || v === 'on';
    if (k === 'dress' || k === 'low' || k === 'a6' || k === 'a7' || k === 'a8') { if (on) look[k] = true; else if (off) look[k] = false; }
    else if (k === 'shadow' && off) { look.contact = false; look.cast = false; } else if (k in look && off) look[k] = false;
  }
  return look;
}

function makeMaterials(club, roomLight, detail, look = null) {
  const lit = !!roomLight && typeof roomLight.material === 'function' && typeof roomLight.emissive === 'function';
  const aniso = Number(club?.knobs?.anisotropy) > 0 ? Number(club.knobs.anisotropy) : 4;
  const colour = paintColour(), data = paintData();
  const canvasTex = (p, name, srgb) => {
    const t = new THREE.CanvasTexture(p.canvas);
    t.name = name; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  const colourTex = canvasTex(colour, 'arena.floor.colour', true), dataTex = canvasTex(data, 'arena.floor.data', false);
  // (round A5: what glows, per cell of the atlas: the lit tally's red and the dress's two dim screen cells; 64 px, read
  // unfiltered at a cell's middle, no mip levels)
  const glow = paintGlow(), glowTex = canvasTex(glow, 'arena.floor.glow', false);
  glowTex.generateMipmaps = false; glowTex.minFilter = THREE.NearestFilter; glowTex.magFilter = THREE.NearestFilter;
  const own = [{ name: colourTex.name, texture: colourTex, w: colour.w, h: colour.h, bytes: colour.bytes }, { name: dataTex.name, texture: dataTex, w: data.w, h: data.h, bytes: data.bytes },
    { name: glowTex.name, texture: glowTex, w: glow.w, h: glow.h, bytes: glow.bytes }];
  // the upholstery. TIER LINE (owner: floor, CONTRACT 14.2): the high room asks the asset service for the club's leather
  // maps (shared objects: never disposed here); the default tier paints a 256 px stand-in and makes no request
  // THE ALBEDO LAW: the stand-in's pixels are painted with their mean on ALBEDO.leather (paint.js leatherPixels), so its
  // tint is white. The club's file has another mean (paint.js LEATHER_FILE_MEAN): once the service has swapped the file
  // in, the material's colour becomes ALBEDO.leather / (the file's mean x the baked shade) (applyLeatherFile below).
  let leatherMap = null, leatherNormal = null, leatherRough = null, shared = [], standInImage = null;
  if (detail >= 1) {
    const standIn = paintLeather(256);
    const standInTex = canvasTex(standIn, 'arena.floor.leather', true);
    standInTex.wrapS = standInTex.wrapT = THREE.RepeatWrapping; standInTex.anisotropy = aniso;
    leatherMap = standInTex; standInImage = standIn.canvas;
    if (detail >= 2 && typeof club?.assets?.texture === 'function') {
      try {
        leatherMap = club.assets.texture('leather.color', { srgb: true, anisotropy: 4, fallback: standInTex }) ?? standInTex;
        const flatOf = (rgb, name) => {
          const flat = document.createElement('canvas'); flat.width = flat.height = 4;
          const g = flat.getContext('2d'); g.fillStyle = rgb; g.fillRect(0, 0, 4, 4);
          const t = canvasTex({ canvas: flat }, name, false);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          return t;
        };
        leatherNormal = club.assets.texture('leather.normal', { srgb: false, anisotropy: 4, fallback: flatOf('rgb(128,128,255)', 'arena.floor.leather.flatnormal') }) ?? null;
        // (three reads a roughness map's green channel; the stand-in is the leather's scalar roughness as a flat grey)
        const v = Math.round(255 * FLOOR_LEVELS.leather.roughness / (FLOOR_LEVELS.leather.roughScale ?? 1));
        leatherRough = club.assets.texture('leather.rough', { srgb: false, anisotropy: 4, fallback: flatOf(`rgb(${v},${v},${v})`, 'arena.floor.leather.flatrough') }) ?? null;
        shared = ['leather.color', 'leather.normal', 'leather.rough'];
      } catch { leatherMap = standInTex; leatherNormal = null; leatherRough = null; shared = []; }
    }
    // (the stand-in stays owned here even when the service swaps the file's image into it)
    own.push({ name: standInTex.name, texture: standInTex, w: standIn.w, h: standIn.h, bytes: standIn.bytes });
  }
  const standard = (p) => {
    let m;
    if (lit) m = roomLight.material({ ...p, vertexColors: true });
    else {
      // (the fallback: a plain three material; it ignores `hide`, so a dev page without the room light never cuts)
      m = new THREE.MeshStandardMaterial({ color: p.color ?? 0xffffff, roughness: p.roughness ?? 0.7, metalness: p.metalness ?? 0 });
      if (p.map) m.map = p.map;
      if (p.roughnessMap) m.roughnessMap = p.roughnessMap;
      if (p.normalMap) m.normalMap = p.normalMap;
      if (p.emissive) m.emissive.copy(p.emissive);
      if (p.emissiveMap) m.emissiveMap = p.emissiveMap;
      if (Number.isFinite(p.envMapIntensity)) m.envMapIntensity = p.envMapIntensity;
      m.name = p.name;
    }
    if (m.vertexColors !== true) { m.vertexColors = true; m.needsUpdate = true; }
    return m;
  };
  const emissive = (p) => {
    let m;
    if (lit) m = roomLight.emissive(p);
    else {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color ?? 0xffffff).multiplyScalar(p.intensity ?? 1) });
      if (p.map) m.map = p.map;
      m.name = p.name;
    }
    return m;
  };
  // Shadow overlays: multiplied over the carpet. The NAMES are the agreement with the hall (arena/room.js reads them, the
  // club props' split): `arena.floor.castshadow` is the wide soft darkening a bake holds itself (hidden under the bake),
  // `arena.floor.contactshadow` is smaller than a bake texel (kept always).
  const overlay = (name) => {
    const m = emissive({ color: 0xffffff, intensity: 1, map: colourTex, name });
    m.blending = THREE.MultiplyBlending; m.transparent = true; m.depthWrite = false; m.toneMapped = false;
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
    return m;
  };
  // the hard surfaces: roughness and metalness per swatch from the data canvas (three reads green and blue), and what
  // glows: the emissive colour is white at the tally's level and the emissive map is the glow canvas (paint.js GLOW: the
  // lit tally's two cells pure red, as round A4's mask had them; the dress's two screen cells dim and neutral; every
  // other cell black)
  // (`hide: true`: the hall's cut. A vertex whose `roomSide` names a seating block's side leaves with that block; see the header)
  const hard = standard({ color: 0xffffff, map: colourTex, roughnessMap: dataTex, roughness: 1, metalness: 1, emissive: new THREE.Color(FLOOR_LEVELS.tally, FLOOR_LEVELS.tally, FLOOR_LEVELS.tally), emissiveMap: glowTex,
    envMapIntensity: FLOOR_LEVELS.hardEnv, hide: true, name: 'arena.floor.hard' });
  hard.metalnessMap = dataTex;
  const mats = {
    hard,
    // the leather: a dielectric with the file's roughness map on the high room (mean 0.51) and a scalar below it
    soft: detail >= 1 ? standard({ color: 0xffffff, map: leatherMap, normalMap: leatherNormal, roughnessMap: leatherRough, roughness: leatherRough ? (FLOOR_LEVELS.leather.roughScale ?? 1) : FLOOR_LEVELS.leather.roughness, metalness: 0,
      envMapIntensity: FLOOR_LEVELS.leather.env, name: 'arena.floor.leather' }) : null,
    contact: overlay('arena.floor.contactshadow'),
    cast: overlay('arena.floor.castshadow'),
    bright: null,
  };
  // ROUND A6 (the high room, under the round's set): ONE blended material for the steel and the glass of the floor's
  // small things. The same atlas and data canvas as the hard material (no texture of its own); the cube at full
  // share; blended as source + (1 - alpha) x what is behind it, with the alpha of the atlas's cell: a steel cell is
  // opaque (alpha 1), a glass cell lets the scene through and adds its own highlight and mirror image on top. It
  // writes depth (the post chain's lens blur reads a bottle at the bottle's distance). No `hide`: nothing it draws
  // stands on a seating block.
  if (detail >= 2 && look?.a6 === true) {
    const bright = standard({ color: 0xffffff, map: colourTex, roughnessMap: dataTex, roughness: 1, metalness: 1, envMapIntensity: FLOOR_LEVELS.brightEnv, name: 'arena.floor.bright' });
    bright.metalnessMap = dataTex;
    bright.transparent = true; bright.depthWrite = true;
    bright.blending = THREE.CustomBlending; bright.blendEquation = THREE.AddEquation; bright.blendSrc = THREE.OneFactor; bright.blendDst = THREE.OneMinusSrcAlphaFactor;
    bright.userData.bakeAlbedo = FLOOR_LEVELS.hardBounce;
    mats.bright = bright;
  }
  // what the bake's bounce counts for the two lit materials (the light role's tool reads `userData.bakeAlbedo`): the hard
  // material is ONE material for decks (0.10), camera black and cloth (0.04) and steel: its area mean; the leather its class
  mats.hard.userData.bakeAlbedo = FLOOR_LEVELS.hardBounce;
  if (mats.soft) mats.soft.userData.bakeAlbedo = CLASS_ALBEDO.leather;
  // ROUND A7 (CONTRACT 19.1): THE HALL'S REFLECTION. The env service owns the hall's baked cube; a reader asks for it
  // with a TAG on its material, plain data (`userData.clubHall = { share, keep }`: the service's interface,
  // scratch note ENV-SERVICE of the table role). The service is built AFTER the room, walks the room's group for the
  // tag and patches what it finds, behind the look's curtain; where there is no service the tag is unread and the
  // material keeps the app's cube at its own share. Every lit material of the part is a reader, at FULL share.
  for (const m of [mats.hard, mats.soft, mats.bright]) if (m) m.userData.clubHall = { share: FLOOR_LEVELS.hallShare, keep: 0 };
  // the leather's albedo record (state().albedo.leather): which map is shown and what the material multiplies it by
  const leather = { map: detail >= 1 ? 'stand-in' : 'swatch', tint: 1, mean: CLASS_ALBEDO.leather };
  const applyLeatherFile = () => {
    // the file is shown when the texture's image is no longer the stand-in's canvas
    if (!mats.soft || !shared.length || !leatherMap?.image || leatherMap.image === standInImage) return false;
    const k = CLASS_ALBEDO.leather / (LEATHER_FILE_MEAN.luminance * CLASS_SHADE.leather);
    mats.soft.color.setRGB(k, k, k);
    leather.map = 'leather.color'; leather.tint = Math.round(k * 1e4) / 1e4;
    return true;
  };
  if (shared.length && !applyLeatherFile()) {
    try { Promise.resolve(club?.assets?.ready?.(['leather.color'])).then(applyLeatherFile, () => {}); } catch { /* the stand-in stays, at its own mean */ }
  }
  return { mats, lit, textures: own, shared, leather };
}

/**
 * Build the arena's floor furniture. `box` = the hall's interior box, `floorY` the live floor height, `tableBounds` the
 * keep-out rectangle around the table, `roomLight` the room-light service (or null), `layout` the arena layout (the
 * module's exports or its ARENA object; default: arena/layout.js). Never throws: on any error it returns an empty group
 * and says why.
 */
export async function buildFloor(club, { box = null, floorY = -0.79, tableBounds = null, roomLight = null, layout = null } = {}) {
  const group = new THREE.Group();
  group.name = 'arena.floor';
  // the shadow overlays are split by size (makeMaterials): the hall keeps the contact-size ones under its baked light
  group.userData.clubShadowSplit = true;
  const emissives = [];
  const levels = new Map();      // detail -> { group, emissives, counts, signature, plan, problems }
  let current = null, failure = null, made = null, madeDetail = null;
  const A = layout?.ARENA ?? (layout?.island && layout?.boards ? layout : ARENA);
  const views = layout?.VIEWS ?? VIEWS;
  let look = readLook(null);
  try { look = readLook(club?.ctx?.query); } catch { /* no boot query: the shipped look */ }
  const knobDetail = () => { const d = Number(club?.knobs?.roomDetail); return d === 0 || d === 1 || d === 2 ? d : 1; };
  const Y = Number.isFinite(floorY) ? floorY : -0.79;
  const FLAT = -Math.PI / 2;
  // (round A7: what the env service says of this part's materials once it is built (its own record of the readers it
  // patched: source, share, sampler count), for the picture tool's record; null while there is no service)
  const hallRecord = () => {
    try {
      const st = club?.env?.hall?.state?.();
      if (!st) return null;
      return { source: st.source ?? null, readers: (Array.isArray(st.readers) ? st.readers : []).filter((r) => /^arena\.floor\./.test(String(r?.name))).map((r) => ({ ...r })) };
    } catch { return null; }
  };

  function buildLevel(detail) {
    const { mats } = made;
    // (round A5: `dress` = the dress of the playing floor; the tool switch `low:1` stands the PROPOSED low camera in
    // while the layout carries none)
    const AA = look.low && !A.floor?.lowCamera ? { ...A, floor: { ...A.floor, lowCamera: LOW_CAMERA_PROPOSED } } : A;
    // (round A6: `a6` = the round's set. While the default is off, the tool switch `a6:1` stands the agreed lamp places
    // in where the layout carries none; a default build takes them from the layout or builds no lamp)
    const plan = planFloor(AA, detail, tableBounds, { dress: look.dress, a6: look.a6 === true, a7: look.a7 === true, a8: look.a8 === true, workLights: look.a6 === true && FLOOR_A6_DEFAULT !== true ? WORK_LIGHTS_PROPOSED : null, views });
    // an item that breaks a keep-out is not built: the plan's own problems name it, the law check names the rest
    const problems = checkPlan(plan, AA, views);
    const banned = new Set();
    for (const b of planBoxes(plan)) if (problems.some((p) => p.startsWith(`${b.id} `) || p.includes(` ${b.id} `) || p.includes(` ${b.id}`))) banned.add(b.item ?? b.id);
    for (const c of plan.cameras) if (problems.some((p) => p.startsWith(`camera.${c.id}:`))) banned.add(`camera.${c.id}`);
    const K = createKit({ bevels: detail >= 1, minBevel: detail === 1 ? 0.0075 : 0 });
    // TIER LINE (owner: floor): the multiplier on the round parts' segment counts follows the club props' knob
    const segK = Number(club?.knobs?.propSegments) > 0 ? Number(club.knobs.propSegments) : (detail === 0 ? 0.5 : detail === 1 ? 0.75 : 1.4);
    const seg = (n) => Math.max(5, Math.round(n * segK));
    const sets = {};
    const setOf = (g) => {
      if (!sets[g]) {
        const hard = new Batch(`hard.${g}`);
        // (round A7, TIER LINE, owner: floor: the base room's WEST group is the hard batch alone. What stands there
        // (round A7's corner) is upholstered in the flat leather cell and draws no overlay: the base room stays at
        // its eight draw calls, and the chair's shadow on the carpet is the bake's)
        const flat = detail === 1 && g === 'west';
        // (round A6: `bright` = the blended batch of the group where the page has that material; else the hard batch itself)
        sets[g] = { hard, soft: detail >= 1 && !flat ? new Batch(`leather.${g}`) : hard, contact: flat ? null : new Batch(`contactshadow.${g}`), cast: flat ? null : new Batch(`castshadow.${g}`),
          bright: detail >= 2 && mats.bright && plan.a6?.on ? new Batch(`bright.${g}`) : hard };
      }
      return sets[g];
    };
    const R = { blob: regionUV('blob'), touch: regionUV('touch'), cast: regionUV('cast'), box: regionUV('box') };
    const bm = (R.box[0] + R.box[2]) / 2;
    const partLog = new Map();
    // the albedo ledger (CONTRACT 15.2): built area per item kind and swatch, plain and weighted by the baked vertex shade
    const ledger = new Map();
    const book = (kind, b, i0, i1, i2, mapped) => {
      const p = b.pos, ax = p[3 * i0], ay = p[3 * i0 + 1], az = p[3 * i0 + 2];
      const ux = p[3 * i1] - ax, uy = p[3 * i1 + 1] - ay, uz = p[3 * i1 + 2] - az, vx = p[3 * i2] - ax, vy = p[3 * i2 + 1] - ay, vz = p[3 * i2 + 2] - az;
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      const shade = (b.col[3 * i0] + b.col[3 * i1] + b.col[3 * i2]) / 765;
      const key = `${kind}|${mapped ? 'leather.map' : swatchAt(b.uv[2 * i0], b.uv[2 * i0 + 1])}`;
      const rec = ledger.get(key) ?? { area: 0, shaded: 0 };
      rec.area += area; rec.shaded += area * shade;
      ledger.set(key, rec);
    };
    const c = {
      K, B: null, detail, seg, look, item: null, dress: plan.dress?.on === true,
      // (round A6: `a6` = the round's set is being built; `glassy` = the current group has the blended batch)
      a6: plan.a6?.on === true, glassy: false,
      // (round A7: `a7` = the round's geometry is being built (the base room and up); `trim` = the base room under
      // it, which pays for the west corner with trims no pose resolves)
      a7: plan.a7?.floor === true, trim: plan.a7?.floor === true && detail === 1,
      // (round A8: `trim8` = the base room under the round: its three monitors' cases lose their bevel and pay for the third)
      trim8: plan.a8?.floor === true && detail === 1,
      sw: (name) => ({ s: swatchUV(name) }),
      // (the upholstery of the current group: the leather batch's tiling map, or the flat leather cell where the
      // group has no leather batch: the lite room, and the base room's west group)
      leather: () => (c.B && c.B.soft !== c.B.hard ? { w: FLOOR_LEVELS.leather.repeat } : { s: swatchUV('leatherFlat') }),
      /** Everything fn appends to the lit batches is recorded as the part `name` of the current item. */
      part(name, fn) {
        const bs = [...new Set([c.B.hard, c.B.soft, c.B.bright ?? c.B.hard])], before = bs.map((b) => b.count), beforeI = bs.map((b) => b.idx.length);
        fn();
        const key = `${c.item.kind}.${c.item.id}.${name}`;
        const rec = partLog.get(key) ?? { item: c.item.kind, id: c.item.id, part: name, top: -Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, vertices: 0, triangles: 0 };
        bs.forEach((b, i) => {
          for (let v = before[i]; v < b.count; v++) {
            const x = b.pos[3 * v], h = b.pos[3 * v + 1] - Y, z = b.pos[3 * v + 2];
            rec.top = Math.max(rec.top, h); rec.x0 = Math.min(rec.x0, x); rec.x1 = Math.max(rec.x1, x); rec.z0 = Math.min(rec.z0, z); rec.z1 = Math.max(rec.z1, z); rec.vertices += 1;
          }
          const mapped = detail >= 1 && b === c.B.soft && b !== c.B.hard;
          for (let t = beforeI[i]; t + 2 < b.idx.length; t += 3) { book(c.item.kind, b, b.idx[t], b.idx[t + 1], b.idx[t + 2], mapped); rec.triangles += 1; }
        });
        if (rec.vertices) partLog.set(key, rec);
      },
      // CONTACT-size overlays (always drawn): where something meets the carpet. `dark` = a foot, a skirt; else the air under a seat
      // (nothing that stands on a seating block draws an overlay: it is not on the carpet, and an overlay has no cut side)
      touch(w, d, x = 0, z = 0, dark = false) { if (look.contact && !c.item?.side && c.B.contact) K.quad(c.B.contact, w, d, [x, 0.0032, z], { rx: FLAT, uv: { r: dark ? R.blob : R.touch } }); },
      // a box-shaped contact (a cloth to the floor): len x depth, the long side along the local x
      touchBox(len, depth, x = 0, z = 0) {
        if (!look.contact || c.item?.side || !c.B.contact) return;
        const dq = depth * 1.3 + 0.05, e = dq / 2, mid = Math.max(0, len - depth), y = 0.0034;
        if (mid > 0.01) K.quad(c.B.contact, mid, dq, [x, y, z], { rx: FLAT, uv: { r: [bm, R.box[1], bm, R.box[3]] } });
        K.quad(c.B.contact, e, dq, [x - (mid + e) / 2, y, z], { rx: FLAT, uv: { r: [R.box[0], R.box[1], bm, R.box[3]] } });
        K.quad(c.B.contact, e, dq, [x + (mid + e) / 2, y, z], { rx: FLAT, uv: { r: [bm, R.box[1], R.box[2], R.box[3]] } });
      },
      // CAST-size overlay (hidden by the hall while its baked light is in use): the wide soft shadow under the hall's light
      cast(w, d, x = 0, z = 0) { if (look.cast && !c.item?.side && c.B.cast) K.quad(c.B.cast, w, d, [x, 0.0022, z], { rx: FLAT, uv: { r: R.cast } }); },
    };
    const stats = { cameras: 0, platforms: 0, stools: 0, chairs: 0, sideTables: 0, desks: 0, thresholds: 0, cablePieces: 0, tallies: 0, remotes: 0, monitors: 0, bins: 0, cueStands: 0,
      workLights: 0, roadCases: 0, trolleys: 0, spots: 0 };
    // THE HALL'S CUT: which vertices of a hard batch belong to something that stands on a seating block ([from, to, side])
    const cutLog = new Map();
    // `over` = the height of what the item stands on (a camera and a stool stand on their platform's deck)
    const place = (it, fn, over = 0) => {
      if (banned.has(`${it.kind}.${it.id}`) || (it.on && banned.has(it.on))) return false;
      c.B = setOf(it.group); c.item = it; c.glassy = c.B.bright !== c.B.hard;
      const hard = c.B.hard, from = hard.count;
      K.at(it.x, Y + over, it.z, it.ry, fn);
      if (it.side && hard.count > from) { const list = cutLog.get(hard) ?? []; list.push([from, hard.count, it.side]); cutLog.set(hard, list); }
      return true;
    };
    // a platform that breaks a law takes its camera and its stool with it, and a camera its platform
    for (const cam of plan.cameras) if (banned.has(`camera.${cam.id}`) || banned.has(`platform.${cam.id}`)) { banned.add(`camera.${cam.id}`); banned.add(`platform.${cam.id}`); banned.add(`stool.${cam.id}`); }
    if (look.cameras) {
      for (const p of plan.platforms) if (place(p, () => platform(c, p))) stats.platforms += 1;
      for (const cam of plan.cameras) if (place(cam, () => tvCamera(c, look.cables ? cam : { ...cam, lead: null }), cam.deckH)) { stats.cameras += 1; if (cam.tally && look.tally) stats.tallies += 1; }
      for (const st of plan.stools) if (place(st, () => stool(c), st.base)) stats.stools += 1;
      // ROUND A6: the work lamp at each camera platform (it stands on the platform's deck and leaves with it)
      for (const wl of plan.a6?.lamps ?? []) if (place(wl, () => workLight(c, wl), wl.base)) stats.workLights += 1;
    }
    if (look.chairs) {
      for (const ch of plan.chairs) if (place(ch, () => chair(c))) stats.chairs += 1;
      for (const st of plan.sideTables) if (place(st, () => sideTable(c))) stats.sideTables += 1;
    }
    if (look.desk && plan.desk && place(plan.desk, () => desk(c, plan.desk))) stats.desks += 1;
    if (look.thresholds) for (const th of plan.thresholds) if (place(th, () => threshold(c, th))) stats.thresholds += 1;
    // ROUND A5: the dress of the playing floor (the remote camera goes with the cameras' switch, the bin with the desk's,
    // the cue stands with the chairs')
    const D = plan.dress;
    if (D?.on) {
      if (D.remote && look.cameras && place(D.remote, () => remoteCamera(c, D.remote))) stats.remotes += 1;
      for (const m of D.monitors ?? [D.monitor]) if (m && place(m, () => floorMonitor(c, m))) stats.monitors += 1;
      if (D.bin && look.desk && place(D.bin, () => wasteBin(c))) stats.bins += 1;
      if (look.chairs) for (const cs of D.cueStands) if (place(cs, () => cueStand(c))) stats.cueStands += 1;
    }
    // ROUND A6: the rest of the round's set on the dressed floor (the cart goes with the desk's switch)
    const S6 = plan.a6;
    if (S6?.floor) {
      if (S6.roadCase && place(S6.roadCase, () => roadCase(c))) stats.roadCases += 1;
      if (S6.trolley && look.desk && place(S6.trolley, () => trolley(c))) stats.trolleys += 1;
      for (const sp of S6.spots) if (place(sp, () => spot(c, sp))) stats.spots += 1;
    }
    // ROUND A7: the west corner (it goes with the chairs' switch): a chair and its side table
    const S7 = plan.a7;
    if (S7?.floor && look.chairs) {
      if (S7.chair && place(S7.chair, () => chair(c))) stats.chairs += 1;
      if (S7.table && place(S7.table, () => sideTable(c))) stats.sideTables += 1;
    }
    // ROUND A8: the monitor position's screen (its stool is one of `plan.stools`, built with the cameras' above)
    if (plan.a8?.monitor && place(plan.a8.monitor, () => floorMonitor(c, plan.a8.monitor))) stats.monitors += 1;
    if (look.cables && look.cameras) for (const run of plan.cables) {
      if (banned.has(`${run.of ?? 'camera'}.${run.id}`)) continue;
      c.item = run;
      K.at(0, Y, 0, 0, () => {
        run.segments.forEach((s, i) => {
          if (!s.group) return;
          c.B = setOf(s.group);
          cableRun(c, s.a, s.b, i > 0 ? run.segments[i - 1].a : null, i + 1 < run.segments.length ? run.segments[i + 1].b : null, run.width);
          stats.cablePieces += 1;
        });
      });
    }

    // ---- meshes: one per material and group, in a fixed order
    const g = new THREE.Group();
    g.name = `arena.floor.detail${detail}`;
    // (no unlit emitter surface here: the lit tally is nine square centimetres of the hard material's emissive map)
    const out = [];
    const byMaterial = {}, byGroup = {}, cut = {};
    let triangles = 0, drawCalls = 0;
    for (const side of ['north', 'east', 'south', 'west']) {
      const set = sets[side];
      if (!set) continue;
      byGroup[side] = 0;
      for (const key of ['hard', 'soft', 'bright', 'contact', 'cast']) {
        const batch = set[key], mat = mats[key];
        if (!batch || !mat || !batch.count || ((key === 'soft' || key === 'bright') && batch === set.hard)) continue;
        const mesh = batch.toMesh(mat);
        mesh.name = `arena.floor.${batch.name}`;
        // the cut side per vertex (the hard material is made with `hide`): 0 = never dropped
        if (key === 'hard') {
          const sides = new Float32Array(batch.count);
          for (const [from, to, side] of cutLog.get(batch) ?? []) { sides.fill(side, from, to); cut[side] = (cut[side] ?? 0) + (to - from); }
          mesh.geometry.setAttribute('roomSide', new THREE.Float32BufferAttribute(sides, 1));
        }
        // overlays: drawn after the opaque hall, never a ray target
        if (key === 'contact' || key === 'cast') { mesh.renderOrder = 1; mesh.raycast = () => {}; }
        g.add(mesh);
        byMaterial[mat.name] = (byMaterial[mat.name] ?? 0) + batch.triangles; triangles += batch.triangles; drawCalls += 1; byGroup[side] += 1;
      }
    }
    const parts = [...partLog.values()].map((p) => ({ ...p, top: Math.round(p.top * 1e4) / 1e4 }));
    const broken = checkPeople(parts, plan);
    if (broken.length) throw new Error(`the person rule fails: ${broken[0]}`);
    // THE ALBEDO LAW over what was built: per class, the mean diffuse reflectance of the items that carry it (area-weighted,
    // the baked vertex shade included), the mean shade and each finish's share of the area (the arm pins all three)
    const albedo = {};
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    for (const [cls, kinds] of Object.entries(ALBEDO_ITEMS)) {
      let area = 0, shaded = 0, lit = 0;
      const shares = {};
      for (const [key, rec] of ledger) {
        const [kind, finish] = key.split('|'), mapped = finish === 'leather.map';
        if (!kinds.includes(kind) || !(mapped ? cls === 'leather' : SWATCH_CLASS[finish] === cls)) continue;
        const a = mapped ? CLASS_ALBEDO.leather / CLASS_SHADE.leather : albedoOf(finish);
        area += rec.area; shaded += rec.shaded; lit += rec.shaded * a; shares[finish] = (shares[finish] ?? 0) + rec.area;
      }
      if (area > 0) albedo[cls] = { target: CLASS_ALBEDO[cls], mean: r4(lit / area), shade: r4(shaded / area), area: r4(area), shares: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, r4(v / area)])) };
    }
    const counts = {
      detail, drawCalls, drawCallsByGroup: byGroup, triangles, byMaterial, ...stats,
      emitters: [], emitterShare: A.emitters?.floor ?? null, parts, albedo,
      // the hall's cut: vertices per cut side (layout.js SIDE) that leave with the seating block they stand on
      cutVertices: cut,
      cameraHeights: plan.cameras.filter((cam) => !banned.has(`camera.${cam.id}`)).map((cam) => ({ id: cam.id, x: cam.x, z: cam.z, on: cam.block ?? 'floor', side: cam.side ?? 0, deck: cam.deckH, lensOverDeck: cam.lensOverDeck, tilt: cam.tilt, tiltAxis: cam.pivotH, lens: cam.lensH, top: cam.top, outsideReachBy: cam.reachMargin })),
    };
    // what a bake of the hall depends on in this level: the plan's geometry and the switches that remove geometry
    const gone = ['cameras', 'chairs', 'desk', 'thresholds', 'cables', 'contact', 'cast'].filter((k) => !look[k]);
    const signature = `${planSignature(plan)}${gone.length ? `|off:${gone.join('+')}` : ''}${banned.size ? `|banned:${banned.size}` : ''}`;
    return { group: g, emissives: out, counts, signature, plan, problems, banned: [...banned] };
  }

  function show(detail) {
    let level = levels.get(detail);
    if (!level) { level = buildLevel(detail); levels.set(detail, level); group.add(level.group); }
    for (const l of levels.values()) l.group.visible = l === level;
    emissives.length = 0;
    emissives.push(...level.emissives);
    current = level;
  }

  try {
    for (const name of Object.keys(SWATCHES)) swatchUV(name);
    madeDetail = knobDetail();
    made = makeMaterials(club, roomLight, madeDetail, look);
    show(madeDetail);
  } catch (e) {
    failure = String(e?.message ?? e);
    current = null;
    for (const l of levels.values()) group.remove(l.group);
    levels.clear(); emissives.length = 0;
    console.warn('[club] arena floor furniture is unavailable — the hall stands without it:', e);
  }

  const state = () => ({
    enabled: !!current, reason: failure, detail: current?.counts.detail ?? null, texturesFor: madeDetail, lit: made?.lit ?? false, look: { ...look },
    floorY: Y, levelsBuilt: levels.size, signature: current?.signature ?? 'none',
    problems: current?.problems ?? [], notBuilt: current?.banned ?? [],
    cameras: current?.counts.cameraHeights ?? [],
    boxes: current ? planBoxes(current.plan).filter((b) => !(current.banned ?? []).includes(b.item ?? b.id)).map((b) => ({ id: b.id, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: b.h, flat: b.flat })) : [],
    // the albedo law: the built means per class (target, mean, shade, shares) and which leather map is shown at what tint
    albedo: { classes: current?.counts.albedo ?? {}, leather: made?.leather ? { ...made.leather } : null },
    emitters: [], tally: { lit: current?.counts.tallies ?? 0, level: FLOOR_LEVELS.tally, in: 'arena.floor.hard (emissive map)' },
    // round A7: the readers of the hall's reflection: the lit materials that carry the env service's tag, and what
    // the service says of them (null while there is none)
    hallEnv: { tagged: made ? Object.values(made.mats).filter((m) => m?.userData?.clubHall).map((m) => m.name) : [], share: FLOOR_LEVELS.hallShare, service: hallRecord() },
    shadowNames: { contact: 'arena.floor.contactshadow', cast: 'arena.floor.castshadow' },
    partKinds: Object.keys(PARTS), sharedTextures: made?.shared ?? [],
    box: box?.min && box?.max ? { min: box.min.toArray?.() ?? null, max: box.max.toArray?.() ?? null } : null,
    tableBounds: tableBounds ? { ...tableBounds } : null,
  });

  return {
    group,
    emissives,
    /** Switch to another tier's detail level ('lite' | 'base' | 'high'); a level is built the first time it is shown. The
     * upholstery keeps the maps of the page load's tier. */
    setTier(tier) {
      const k = TIERS[tier];
      if (!k || !made) return false;
      const want = k.roomDetail === 0 || k.roomDetail === 2 ? k.roomDetail : 1;
      // (a level with chairs needs the leather material: a page that loaded on lite has none, and keeps its simple chairs)
      try { show(want >= 1 && !made.mats.soft ? 0 : want); return true; } catch (e) { console.warn('[club] arena floor: tier switch failed:', e); return false; }
    },
    counts() {
      if (!current) return { enabled: false, reason: failure ?? 'not built' };
      return {
        enabled: true, lit: made.lit, ...current.counts,
        textures: made.textures.map((t) => ({ name: t.name, w: t.w, h: t.h, bytes: t.bytes })),
        textureBytes: made.textures.reduce((n, t) => n + t.bytes, 0), sharedTextures: made.shared,
        levelsBuilt: levels.size, look: { ...look },
      };
    },
    state,
    /** The bake's signature of the level shown (arena/room.js reads it for the light map's record): geometry only. */
    signature() { return current?.signature ?? 'none'; },
    dispose() {
      try {
        group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
        if (made) { for (const t of made.textures) t.texture.dispose(); for (const m of Object.values(made.mats)) m?.dispose?.(); }
        group.parent?.remove(group);
      } catch (e) { console.warn('[club] arena floor: dispose failed:', e); }
      levels.clear(); current = null; emissives.length = 0;
    },
  };
}
