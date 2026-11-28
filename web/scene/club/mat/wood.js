// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/wood.js — the club look's wood part (CONTRACT.md 9.1): rail caps (`railwood`), the table body (`apron`: aprons, skirts,
// legs) and the rail sights. Owner: wood. The shader text and what each piece does are in wood/glsl.js; the numbers of each
// finish and the pure geometry are in wood/layout.js.
//
// What this module does at run time:
//   - finds the materials through club.adopt.find and reads, from the scene, what the patch needs to know about the table:
//     the rail band (boxes of the rail-cap meshes), the floor height, the room's extent, the lamp (the scene's rectangular
//     lights). Nothing is copied from table.js; a table change is followed by rebuild(reason);
//   - decides a finish per material from the material's own colour (wood/layout.js finishOf): a dark neutral colour is a
//     black table and gets a rubbed gloss lacquer on its rail caps (over open pores and a showing figure when the app's
//     material is a stained wood, i.e. carries a map; a satin coat on the body); any other colour is wood under clear lacquer;
//   - patches each material once through club.adopt.patch (key `mat-wood-v<N>:…`, before / after anchors only). The patch adds
//     ONE sampler per material (the colour scan); the scan's normal map takes the material's existing normal-map slot. A
//     program that has no texture unit to spare gets the variant without the scan;
//   - keeps the lamp uniforms current every frame (three numbers per light; no read-back), and with them what the coat
//     mirrors: the luminaire's lit underside. Its structure (panels, cross bars, tube strips, the glare cut-off) is the lamp
//     role's own published data, read from the built lamp (`club.room.parts.lamp.face()`, club/room/lamp/face.js); its
//     radiance is the face mesh's colour. Without the club luminaire it is the app's own face (wood/layout.js LAMP_FACE,
//     which the node arm pins against scene/room.js);
//   - reads the room's light at the table on the CPU (nothing is sampled on the GPU) and turns it into six irradiance values
//     for the body's faces and four floor radiances beside the table (wood/layout.js bodyLight). The room answers itself
//     where it can: `club.room.light.irradianceAt` (its baked light volume with the room's shadows and bounces while the
//     bake is in use, its analytic emitters and ambient otherwise), `club.room.lightmap.floorIrradiance` and
//     `club.room.floor.albedo`. A room without those calls is read through its packed emitter uniforms with this part's
//     mirror of the emitter law (wood/layout.js roomIrradiance). Re-read when the room's light changes.
// Round A2, the arena venue only: the table's body takes the hall form of that light (hard light from the rig's heads past
// the table's own overhangs, the lit carpet's light coming back up, a lacquer finish on a black table; wood/glsl.js
// COAT_BODY_HALL, wood/layout.js HALL_BODY). `?clubwood=nohall` there = the club room's form (the off arm of a pair).
// Round A3, the arena venue only: the second hall model (wood/layout.js HALL_BODY2, wood/glsl.js COAT_BODY_HALL2 and
// woodFnHall): the body's lacquer mirrors the hall's floor as the room holds it, through a small map this part builds on
// the CPU from the room's own floor irradiance and the carpet's albedo (the one sampler it adds to a black body, in place
// of the scan), and takes the carpet's bounce from the same map. `?clubwood=hallA2` = round A2's model, `hall2` = the
// second one; `part.debug({ floorMap: 0 })` mirrors the floor's four sides instead of the map.
// Round A4, the arena venue only: the third hall model, the default (wood/layout.js HALL_OWN, wood/glsl.js COAT_BODY_HALL3
// and WOOD_FN_OWN): every body part keeps what the app's material gives it (colour and map, roughness as its one lobe,
// environment gain) under the finish table's own matt pedestal, and the hall lights it through round A3's floor map and
// two lights per side. No scan is bound on the body, no lamp lobe is evaluated on it. `?clubwood=hall3` = this model
// whatever the default is; `?clubwood=ownbare` = without the pedestal; `part.debug({ own: { gain, direct } })`.
// `?clubwood=off` on the boot URL leaves the part out (the frame it must beat). `part.debug({ on, edges, grain, scratches, lamp,
// room, floor, aa, cue, tubes, cut, bodyRoom, bodyOcc, bodyBounce })` switches single terms for on/off pictures in one boot
// (`on: 0` also puts the app's own normal maps back, so it is the same picture as `?clubwood=off`).
import * as THREE from 'three';
import { woodPatchParts, WOOD_PATCH_VERSION } from './wood/glsl.js';
import { finishOf, finishParams, railBand, lampRect, SCANS, scanPlacement, faceModel, appFaceModel, lampHasTubes, bodyLight, HALL_BODY, hallBodyParams, hallTan,
  HALL_MODEL, HALL_BODY2, HALL_RAIL_STRIP, hallTans, hallSides, hallBodyParams2, hallMatte, hallFloorRect, hallFloorField, hallFloorAt, hallTableShade, hallBounceShare,
  HALL_OWN, hallOwnParams, ownEnvGain, skirtFootInset, HALL_KEYS, hallKeyRecords, hallKeySides, hallKeyShares, hallKeysInBake, HALL_GLOSS, luma } from './wood/layout.js';
import { isArena, venueKnobsOf } from '../tiers.js';

const EDGE_OUTER = 0.009, EDGE_INNER = 0.006;       // edge radii of the rail cap (m)
const EDGE_INNER_SLOPE = 2.2;                       // slope of the inner edge's normal at the edge (65 degrees: it must pass 62 to reach the lamp)
// a varnished plank floor (linear): what the body mirrors and what bounces the lamp's spill. The club room publishes its
// own (`club.room.floor.albedo`); this is the stand-in for a room that does not (a dev page, the app's room)
const FLOOR_ALBEDO = [0.2, 0.11, 0.055];
// How much of the diffuser's glare cut-off the coat's image of the lamp takes (0..1). The law (club/room/lamp.js) is what a
// camera sees of the face; the light on the table has none and the balls mirror the face without it. With it the far rails'
// lamp line fell to 7 % of the face. `part.debug({ cut })` sets it for a picture pair.
const CUT_SHARE = 0;
// The LEVEL of the lamp's lit face in the coat. The face mesh's colour (about 20 units on the default rig) is a display
// value: the app draws its lamp face 2.7 times brighter than the rectangle of light that lights the table (radiance 7.2),
// so that it blooms. A coat that mirrored that value showed the lamp on the near rail of the standing view as a flat near
// white band (200 to 244 of 255 over 3,900 pixels, the panels lost in the tone map's shoulder: shots/wood/r3a4-V1-new.jpg).
// FACE_NORM = 1: the face's PATTERN (panels, bars, strips: the lamp role's data) at the LIGHT's level, i.e. its mean
// radiance is the light's own, the same number three's area-light lobe under the coat uses. 0 = the face mesh's colour
// (round 2). FACE_GAIN: a plain factor on top. `part.debug({ faceNorm, faceGain })` set them for a picture pair.
const FACE_NORM = 1, FACE_GAIN = 1;
// irradiance on the floor beside the table when there is no club room to read (a dev page, a failed room): round 1b's number
const ROOM_FLOOR_E = [0.1, 0.06, 0.03];
const CUE_RADIANCE = [1.1, 0.8, 0.45];              // a maple shaft's lit side under the lamp (albedo x lamp irradiance / pi)
// share of a material's own specular lobe that survives under the coat. Rail caps: little (coat and wood have nearly the same
// index, so the wood under a coat is not an air interface). Body: all of it, because on this app's tables that lobe is not a
// surface property but the calibrated stand-in for the room's fill on the cabinet (table.js: the apron's environment gain)
const UNDER_COAT = 0.3, UNDER_COAT_BODY = 1.0;
// The body's light comes from the room (readRoom below). BODY_FILL_E is what stands in when there is no club room at all
// (a dev page without one, a room that failed to build): round 1b's designed fill, irradiance. With a room it is zero.
const BODY_FILL_E = [1.8, 1.65, 1.45];
const BRUSH_STREAK = 0.8;                           // how far the streaks move the scratch fan's share
const LAMP_IMAGE_CAP = 0.35;                        // radiance left of the lamp's own image in the cube under the area-light lobe
const SIGHT = { seam: 0.75, nacre: 1.0, wall: 0.7 };   // glue line darkening, nacre strength, slope of the recess wall at the rim

const text = (e) => String(e?.message ?? e);

// procedural stand-ins while a scan loads, or when it never arrives
function fallbackColor() {
  try {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(96,46,24)'; g.fillRect(0, 0, 256, 64);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) {
      const v = 0.72 + rnd() * 0.5;
      g.fillStyle = `rgba(${Math.round(96 * v)},${Math.round(46 * v)},${Math.round(24 * v)},0.5)`;
      g.fillRect(rnd() * 256, rnd() * 64, 40 + rnd() * 160, 1 + rnd() * 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch { return null; }
}
function fallbackNormal() {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255]), 2, 2);
  t.needsUpdate = true;
  return t;
}
const FALLBACK_MEAN = [0.12, 0.028, 0.009]; // rgb(96,46,24) in linear

export async function applyWood(club) {
  const off = (reason) => ({ enabled: false, reason, rebuild() {}, state: () => ({ enabled: false, reason }) });
  let sw = null;
  try { sw = club?.ctx?.query?.get?.('clubwood') ?? null; } catch { /* unreadable query: build */ }
  if (sw === 'off') return off('off by ?clubwood=off');
  const adopt = club?.adopt;
  const scene = club?.ctx?.scene;
  if (typeof adopt?.find !== 'function' || typeof adopt?.patch !== 'function') return off('club.adopt is missing');
  // a direct write on a material the app draws: at once, or queued with the wraps while the look is built off stage (adopt.js write)
  const write = (apply, revert) => { if (typeof adopt.write === 'function') adopt.write(apply, revert); else apply(); };
  if (typeof scene?.traverse !== 'function') return off('no scene');

  const notes = [];
  const note = (m) => { if (notes.length < 32 && !notes.includes(m)) notes.push(m); };
  const v4 = (x, y, z, w) => ({ value: new THREE.Vector4(x, y, z, w) });
  const lite = club.tier === 'lite';
  // Round A1 (CONTRACT.md 13.3): what this part assumes of the room when the room does not answer. The floor's stand-in
  // reflectance is the venue's (the arena's carpet instead of a varnished plank floor), and the venue's luminaire (the
  // arena's rig, CONTRACT.md 13.4) is read as the club luminaire is even when it does not say `enabled: true` (its
  // contract lists no such member). Under the club venue both are what they were: FLOOR_ALBEDO and `enabled === true`.
  let arena = false, floorStandIn = FLOOR_ALBEDO;
  try {
    arena = isArena(club);
    const a = arena ? venueKnobsOf(club)?.floorAlbedo : null;
    if (Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every((x) => Number.isFinite(x) && x >= 0)) floorStandIn = a.slice(0, 3);
  } catch { arena = false; floorStandIn = FLOOR_ALBEDO; }
  // Round A2 (CONTRACT.md section 14): the table body in the hall's light. Under the arena venue the body materials
  // (class `apron`: aprons, skirts, legs) take the hall variant of the coat (wood/glsl.js COAT_BODY_HALL: its own patch
  // key and text), a black table's body takes a lacquer finish, and the app's own flat specular fill on the body is
  // turned down (wood/layout.js HALL_BODY has the numbers and the measurement behind them). The rail caps and the sights
  // keep the club variant: their text and key are the same in both venues. Under the club venue `hall` is false and
  // nothing below takes another path. Tools: `?clubwood=nohall` under arena = the club room's body model and finish in
  // the hall (the off arm of a pair; it does nothing under the club venue).
  // Round A3 (CONTRACT.md section 15): the hall body has a second model (wood/layout.js HALL_BODY2: the lacquer mirrors
  // the hall's floor as the room holds it, through a small map this part builds from the room's own floor irradiance;
  // the carpet's bounce is read from the same map). `hallModel`: 0 under the club venue and with `nohall`, else
  // wood/layout.js HALL_MODEL; tools under arena: `?clubwood=hallA2` = round A2's model (the off arm of an A2 | A3 pair
  // on one tree), `?clubwood=hall2` = the second model whatever the default is.
  // Round A4 (CONTRACT.md 16.3): the third model, the body BY ITS OWN MATERIAL (wood/layout.js HALL_OWN: the app's colour
  // and map as the albedo, the material's own roughness as its one lobe, its own environment gain; the hall lights it
  // through round A3's floor map and two lights per side). Tools under arena: `?clubwood=hall3` = this model whatever the
  // default is; `hall2` and `hallA2` stay the off arms. `hall2` below = "the floor map and the per-side lights are built"
  // (models 2 and 3 share them); `hall3` = the third model alone. All three are false under the club venue.
  // `?clubwood=ownbare` (a tool, the third model only): no matt pedestal, the app's colour alone as the albedo.
  let hall = false, hallModel = 0, ownBare = false;
  try {
    const toks = String(sw ?? '').split(',');
    hall = arena && !toks.includes('nohall');
    hallModel = hall ? (toks.includes('hallA2') ? 1 : (toks.includes('hall2') ? 2 : (toks.includes('hall3') ? 3 : (HALL_MODEL === 3 ? 3 : (HALL_MODEL === 2 ? 2 : 1))))) : 0;
    ownBare = hall && hallModel === 3 && toks.includes('ownbare');
  } catch { hall = false; hallModel = 0; ownBare = false; }
  const hall3 = hall && hallModel === 3;
  const hall2 = hall && (hallModel === 2 || hallModel === 3);
  // Round A6 (CONTRACT.md 18.1), the third hall model only: the hall's key lights evaluated by themselves, each from where
  // it stands (wood/layout.js HALL_KEYS). False under the club venue and in every other model. Tools under arena:
  // `?clubwood=keys` = on whatever the default is, `?clubwood=nokeys` = round A5's body (the off arm of a pair).
  let keysOn = false;
  try { const toks = String(sw ?? '').split(','); keysOn = hall3 && !toks.includes('nokeys') && (HALL_KEYS.on === true || toks.includes('keys')); } catch { keysOn = false; }
  // Round A7 (CONTRACT.md 19.1), the third hall model with the keys only: the hall's baked cube in the body's own lobe
  // (wood/layout.js HALL_GLOSS; the env service's handle `club.env.hall`, which exists under the arena venue alone).
  // `hallEnv` is that handle or null; null under the club venue, in every other model and when the service is off. Tools
  // under arena: `?clubwood=henv` = on whatever the default is, `?clubwood=nohenv` = round A6's body (the off arm).
  let hallEnv = null;
  try {
    const toks = String(sw ?? '').split(','), h = club.env?.enabled === true ? club.env.hall : null;
    if (keysOn && !toks.includes('nohenv') && (HALL_GLOSS.on === true || toks.includes('henv')) && h?.enabled === true && typeof h.glsl === 'string' && h.uniforms?.uClubHallEnv) hallEnv = h;
  } catch { hallEnv = null; }
  const hallEnvU = hallEnv ? { ...hallEnv.uniforms, uClubWoodHallEnv: v4(HALL_GLOSS.cube, HALL_GLOSS.carpet, 0, 0) } : null;
  const cueU =club.occ?.enabled === true ? club.occ.cue?.uniforms : null;
  // table-level uniforms, shared by every patched material
  const U = {
    uClubWoodSw: v4(1, 1, 1, lite ? 0 : 1), uClubWoodSw2: v4(1, 1, 1, 1), // (no hairline scratches on the lite tier: a phone never resolves them)
    uClubWoodBand: v4(1.32, 0.686, 1.45, 0.81), uClubWoodTop: v4(0.047, EDGE_OUTER, EDGE_INNER, -0.79),
    uClubWoodRoom: v4(0, 0, 4.5, 3.0),
    uClubWoodLampP: v4(0, 1.0, 0, 1.35), uClubWoodLampH: v4(1.0, 0.33, 0, LAMP_IMAGE_CAP), uClubWoodLampL: { value: new THREE.Vector3(0, 0, 0) },
    uClubWoodLampM: { value: new THREE.Vector3(0, 0, 0) }, uClubWoodLampT: v4(0, 0.14, 0.5, 0.9), uClubWoodLampS: v4(1, 0, 1, 1),
    uClubWoodLampF: v4(0, 0, 0, 1), uClubWoodLampG: v4(0, 0, 0, 3), uClubWoodLampC: v4(1, 0.5, 0.95, 0),
    uClubWoodFloor: v4(FLOOR_ALBEDO[0], FLOOR_ALBEDO[1], FLOOR_ALBEDO[2], 1),
    uClubWoodFloorR: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, 0, 0)) },
    uClubWoodAmb: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3(0, 0, 0)) },
    uClubWoodBody: v4(1, 1, 1, 0),
    uClubWoodCueC: v4(CUE_RADIANCE[0], CUE_RADIANCE[1], CUE_RADIANCE[2], 1),
    // the cue capsule: the occlusion service's shared uniform objects (CONTRACT.md 4.2) when it is there, else an absent cue
    uClubWoodCueA: cueU?.uClubCueA?.value?.isVector3 ? cueU.uClubCueA : { value: new THREE.Vector3() },
    uClubWoodCueB: cueU?.uClubCueB?.value?.isVector3 ? cueU.uClubCueB : { value: new THREE.Vector3(0, 0, 1) },
    uClubWoodCueR: cueU?.uClubCueR?.value?.isVector2 ? cueU.uClubCueR : { value: new THREE.Vector2(0.006, 0.015) },
    uClubWoodCueOn: cueU?.uClubCueOn && typeof cueU.uClubCueOn.value === 'number' ? cueU.uClubCueOn : { value: 0 },
  };
  // the hall variant's one uniform (declared only in that variant's text; absent from the table under the club venue):
  // tangent of the heads' elevation (read from the room in readRoom), the diffuse share, the foot's level and height
  const hallState = { tan: null, from: 'default' };
  if (hall) U.uClubWoodHall = hall3 ? v4(2.4, 0, HALL_OWN.foot, HALL_OWN.footHeight) : (hall2 ? v4(2.4, 0, HALL_BODY2.foot, HALL_BODY2.footHeight) : v4(2.4, HALL_BODY.ambient, HALL_BODY.foot, HALL_BODY.footHeight));
  // the second hall model's floor (absent otherwise): the rectangle, the map's numbers, the ring of boards, the map itself
  // (a 1 x 1 stand-in until the room answered; `on` 0 = the floor's four sides, as the club variant has them)
  const hallFloor = { tex: null, size: 0, rect: null, scale: 0, from: 'not built', holes: 0, mean: null, builds: 0, on: 1, share: 0, shareOverride: null, sig: NaN, stations: null };
  if (hall2) {
    const one = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    one.name = 'club.wood.hallfloor.standin'; one.needsUpdate = true;
    U.uClubWoodFloorBox = v4(0, 0, 5, 4); U.uClubWoodFloorLv = v4(1, 0, 0.1, 0); U.uClubWoodRing = v4(0, 0, HALL_BODY2.floor.outer, 0);
    U.uClubWoodHallT = v4(2.4, 2.4, 2.4, 2.4); U.uClubWoodHallK = v4(2.4, 2.4, 2.4, 2.4); U.uClubWoodHallW = v4(0, 0, 0, 0);
    U.uClubWoodFloorMap = { value: one };
  }
  // round A6, with the keys only (absent otherwise): the key lights as the room light packs an emitter, how many, the
  // per-side share that comes out of the side's own number; and the contact at the carpet as this model has it
  const keyState = { ids: [], skipped: [], from: 'not read', lift: 0, sides: null, shares: null, on: 1, sig: 0 };
  if (keysOn) {
    U.uClubWoodKeyP = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 10, 0, 1)) };
    U.uClubWoodKeyC = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 1)) };
    U.uClubWoodKeyA = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -1, 0, 0)) };
    U.uClubWoodKeyS = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };
    U.uClubWoodKeyF = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };
    U.uClubWoodKeyD = { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector4(0, 0, 0, 0)) };
    U.uClubWoodKeyN = v4(0, 1, 1, HALL_KEYS.edge);
    U.uClubWoodKeyW = v4(0, 0, 0, 0);
    U.uClubWoodHall.value.z = HALL_KEYS.foot; U.uClubWoodHall.value.w = HALL_KEYS.footHeight;
  }
  const cueShared = U.uClubWoodCueOn === cueU?.uClubCueOn;
  const records = new Map();   // material -> record
  let innerSlope = EDGE_INNER_SLOPE;
  const fill = [0, 0, 0];      // an extra fill on body parts, irradiance / pi (zero while the room lights the body)
  const table = { band: null, floorY: null, skirt: null, lamp: null, room: null, sights: 0, face: null, light: null };
  let rectLights = [], hemi = null, rebuilds = 0, lastReason = null, ambientOverride = null, tubesWanted = true, cutShare = CUT_SHARE;
  let bounceSwitch = 1, bounceGain = 1, partOn = 1, rollSharp = 1, faceGain = FACE_GAIN, faceNorm = FACE_NORM, faceLevel = 1;
  const ownHold = { gain: null, direct: null };   // round A4, tools only: a held environment gain / lights' factor of the third hall model (null = the material's, HALL_OWN's)
  const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();

  // ---- what the scene says about the table --------------------------------------------------------------------------------------
  function usage() {
    const by = new Map();
    scene.traverse((o) => {
      if (!o.isMesh || !o.material || !o.geometry) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!by.has(m)) by.set(m, []); by.get(m).push(o); }
    });
    return by;
  }
  const worldBox = (mesh) => {
    try {
      mesh.updateWorldMatrix?.(true, false);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      tmpBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      return tmpBox.isEmpty() ? null : { min: tmpBox.min.toArray(), max: tmpBox.max.toArray() };
    } catch { return null; }
  };
  function readTable(by, railMats, bodyMats) {
    const railBoxes = [];
    let lowest = Infinity;
    for (const m of railMats) for (const o of by.get(m) ?? []) { const b = worldBox(o); if (b) railBoxes.push(b); }
    const bodyBoxes = new Map();
    for (const m of bodyMats) {
      const list = [];
      for (const o of by.get(m) ?? []) { const b = worldBox(o); if (b) { list.push(b); lowest = Math.min(lowest, b.min[1]); } }
      bodyBoxes.set(m, list);
    }
    const band = railBand(railBoxes);
    if (band) {
      table.band = band;
      U.uClubWoodBand.value.set(band.inner[0], band.inner[1], band.outer[0], band.outer[1]);
      U.uClubWoodTop.value.x = band.top;
      if (!band.measured[0] || !band.measured[1]) note('rail band: an inner edge was not measured from a rail piece; a 13 cm band is assumed there');
    } else note('no rail-cap mesh was found: the rail band keeps its default');
    // the skirt: a body piece that runs around the table's outline under the rail (a band, not the whole cabinet). Its lower
    // edge is the overhang that shades what stands behind it; without such a piece the rail's own level stands in
    const o = U.uClubWoodBand.value, top = U.uClubWoodTop.value.x;
    let skirt = top - 0.045;
    table.skirt = null;
    if (band) {
      for (const list of bodyBoxes.values()) for (const b of list) {
        const reaches = b.max[0] - band.centre[0] > o.z - 0.03 && band.centre[0] - b.min[0] > o.z - 0.03 && b.max[2] - band.centre[1] > o.w - 0.03 && band.centre[1] - b.min[2] > o.w - 0.03;
        if (reaches && b.max[1] > top - 0.12 && b.max[1] - b.min[1] < 0.3 && b.min[1] < skirt) { skirt = b.min[1]; table.skirt = +skirt.toFixed(4); }
      }
    }
    U.uClubWoodBody.value.w = skirt;
    // round A4, the third hall model only (never run under the club venue): how far the skirt's FOOT stands inside the
    // outline, from the skirt piece's own vertices (the default table's skirt is a slanted blind: 7 mm inside at its top,
    // more at its foot). What hangs below the skirt is shaded by that edge (wood/layout.js ownShade)
    table.skirtInset = null;
    if (hall3 && band && table.skirt !== null) {
      try {
        let piece = null;
        for (const m of bodyMats) for (const mesh of by.get(m) ?? []) { const b = worldBox(mesh); if (b && Math.abs(b.min[1] - skirt) < 1e-6 && b.max[1] > top - 0.12) piece = mesh; }
        const pos = piece?.geometry?.attributes?.position;
        if (pos?.count > 0) {
          const pts = [];
          for (let i = 0; i < pos.count; i += 1) { tmpV.fromBufferAttribute(pos, i).applyMatrix4(piece.matrixWorld); pts.push([tmpV.x, tmpV.y, tmpV.z]); }
          table.skirtInset = +skirtFootInset(pts, { centre: band.centre, outer: band.outer }).toFixed(4);
        }
      } catch (e) { note(`skirt foot: ${text(e)}`); }
    }
    // floor: the club room's floor mesh when there is one, else the lowest point of the body (legs stand on the floor)
    let floorY = null;
    try {
      const fm = club.room?.enabled === true ? club.room.floor?.mesh : null;
      if (fm?.isObject3D) { tmpBox.setFromObject(fm); if (!tmpBox.isEmpty()) floorY = tmpBox.max.y; }
    } catch { /* no floor mesh */ }
    if (!Number.isFinite(floorY)) floorY = Number.isFinite(lowest) ? lowest : -0.79;
    table.floorY = floorY;
    U.uClubWoodTop.value.w = floorY;
    // room: the reflection service's box, else the club room's, about the table centre
    const c = band ? band.centre : [0, 0];
    let hx = 4.5, hz = 3.0, from = 'default';
    try {
      const b = (club.env?.enabled === true && club.env.box?.min?.isVector3) ? club.env.box : (club.room?.enabled === true ? club.room.box : null);
      if (b?.min && b?.max) { hx = Math.min(c[0] - b.min.x, b.max.x - c[0]); hz = Math.min(c[1] - b.min.z, b.max.z - c[1]); from = 'box'; }
    } catch { /* keep the default */ }
    table.room = { half: [hx, hz], from };
    U.uClubWoodRoom.value.set(c[0], c[1], Math.max(hx, 0.5), Math.max(hz, 0.5));
    return { bodyBoxes, floorY };
  }
  function findLights() {
    rectLights = []; hemi = null;
    scene.traverse((o) => {
      if (o.isRectAreaLight) rectLights.push(o);
      else if (o.isHemisphereLight && !hemi) hemi = o;
    });
  }
  // visible, and still in the scene (a fixture swap takes the old lights out of the graph)
  const shown = (o) => { let p = o; for (; p; p = p.parent) { if (p.visible === false) return false; if (p === scene) return true; } return false; };
  let lampSig = NaN;
  function readLamp(force = false) {
    // nothing is recomputed while the lights stand still (this runs every frame)
    let sig = hemi ? hemi.intensity * 3.1 + hemi.color.r + hemi.color.g * 1.7 + hemi.color.b * 2.3 + (shown(hemi) ? 0 : 97) : 0;
    for (const l of rectLights) {
      const e = l.matrixWorld.elements;
      sig += (l.intensity * (1 + l.color.r + 1.3 * l.color.g + 1.7 * l.color.b) + l.width * 5.1 + l.height * 7.3 + e[12] * 11 + e[13] * 13 + e[14] * 17 + e[0] + e[5] * 3) * (shown(l) ? 1 : 0.37);
    }
    // (the luminaire may be built after this part on a slow boot, and a fixture swap replaces it: look again now and then)
    if (force || faceTick % 120 === 0) findFace();
    faceTick += 1;
    sig += faceSig() * 0.731 + (tubesWanted ? 0 : 0.37) + cutShare * 0.193 + faceGain * 0.417 + faceNorm * 0.289;
    if (!force && sig === lampSig) { if (faceTick % 64 === 1) readRoom(); return; }
    lampSig = sig;
    const list = [];
    for (const l of rectLights) {
      if (!(l.intensity > 0) || !shown(l)) continue;
      l.matrixWorld.decompose(tmpV, tmpQ, tmpS);
      const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(tmpQ).multiplyScalar(0.5 * l.width * tmpS.x);
      const ey = new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ).multiplyScalar(0.5 * l.height * tmpS.y);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQ);
      list.push({ pos: tmpV.toArray(), ex: ex.toArray(), ey: ey.toArray(), radiance: [l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity], down: dir.y < -0.5 });
    }
    const lamp = lampRect(list, { minY: U.uClubWoodTop.value.x + 0.25 });
    table.lamp = lamp;
    if (lamp) {
      U.uClubWoodLampP.value.set(lamp.centre[0], lamp.centre[1], lamp.centre[2], lamp.area);
      U.uClubWoodLampH.value.set(Math.max(lamp.half[0], 1e-3), Math.max(lamp.half[1], 1e-3), 1, U.uClubWoodLampH.value.w);
      U.uClubWoodLampL.value.set(lamp.radiance[0], lamp.radiance[1], lamp.radiance[2]);
    } else {
      U.uClubWoodLampH.value.z = 0;
      U.uClubWoodLampL.value.set(0, 0, 0);
    }
    // what the coat mirrors: the luminaire's lit underside, as the frame shows it (structure from the lamp role's data, radiance
    // from the face mesh's colour). A fixture without a structured face is each light's own rectangle at its own radiance
    const face = readFace(list);
    table.face = face;
    const k = face.model;
    if (lamp && k) {
      // the lite tier draws the panels without the strips inside them (three rectangle integrals fewer per fragment)
      U.uClubWoodLampT.value.set(tubesWanted ? (lite || !k.tubes ? 0.5 : 1) : 0, k.tubeHalf, k.tubeOffset, k.tubeLen);
      U.uClubWoodLampS.value.set(k.panels, k.pitch, k.padLen, k.padAcross);
      const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const meanFace = lum([face.color[0] * k.mean[0], face.color[1] * k.mean[1], face.color[2] * k.mean[2]]);
      faceLevel = faceGain * (1 + (meanFace > 1e-6 ? lum(lamp.radiance) / meanFace - 1 : 0) * faceNorm);
      const fc = face.color.map((v) => v * faceLevel);
      U.uClubWoodLampF.value.set(fc[0] * k.tube[0], fc[1] * k.tube[1], fc[2] * k.tube[2], face.alongWidth ? 1 : 0);
      U.uClubWoodLampG.value.set(fc[0] * k.panel[0], fc[1] * k.panel[1], fc[2] * k.panel[2], k.tubes);
      U.uClubWoodLampM.value.set(fc[0] * k.mean[0], fc[1] * k.mean[1], fc[2] * k.mean[2]);
      if (face.law) U.uClubWoodLampC.value.set(face.law[0], face.law[1], face.law[2], cutShare); else U.uClubWoodLampC.value.w = 0;
    } else {
      U.uClubWoodLampT.value.x = 0;
      U.uClubWoodLampC.value.w = 0;
      const m = lamp ? lamp.radiance : [0, 0, 0];
      U.uClubWoodLampM.value.set(m[0], m[1], m[2]);
    }
    readRoom(true);
  }
  // The lit face of the luminaire. With the club luminaire built: its own data (`face()`: room/lamp/face.js lampFace for the
  // live emitters), its cut-off law (`state().face.law`) and its face mesh's colour (`clubLamp.face`, which follows the app's
  // lamp-face colour every frame). Without it: the app's face mesh (the room's lightRefs.lampFace) and the app's pattern.
  let faceMesh = null, faceTick = 0, faceData = null, faceLaw = null;
  function findFace() {
    faceData = null; faceLaw = null;
    let m = null;
    try {
      const api = club.room?.enabled === true ? club.room.parts?.lamp : null;
      if ((api?.enabled === true || (arena && !!api && api.enabled !== false)) && typeof api.face === 'function') {
        const f = api.face();
        if (Array.isArray(f?.faces) && f.faces.length === 1) faceData = faceModel(f.faces[0]);
        const law = api.state?.()?.face?.law;
        if (Array.isArray(law) && law.length >= 3 && law.every(Number.isFinite)) faceLaw = law.slice(0, 3);
        m = scene.getObjectByName('clubLamp.face') ?? null;
        if (!(m?.isMesh && m.material?.color?.isColor)) { m = null; faceData = null; faceLaw = null; }
      }
    } catch { m = null; faceData = null; faceLaw = null; }
    if (!m) {
      const app = club.ctx?.room?.lightRefs?.lampFace;
      m = app?.isMesh && app.material?.color?.isColor ? app : null;
    }
    faceMesh = m;
  }
  const faceSig = () => {
    const c = faceMesh?.material?.color;
    return c ? c.r * 1.3 + c.g * 2.1 + c.b * 3.7 + (faceMesh.material.map ? 0.5 : 0) + (faceData ? faceData.panels * 0.9 + faceData.padLen : 0) + (faceLaw ? faceLaw[0] : 0) : 0;
  };
  function readFace(list) {
    const out = { from: 'the light', model: null, color: null, law: null, alongWidth: true };
    const down = list.filter((l) => l.down);
    const mat = faceMesh?.material;
    if (!mat?.color?.isColor || down.length !== 1) return out;
    out.color = [mat.color.r, mat.color.g, mat.color.b];
    if (faceMesh.name === 'clubLamp.face') {
      out.from = 'the club luminaire';
      out.model = faceData;
      out.law = faceData ? faceLaw : null;
    } else {
      out.from = 'the app luminaire';
      const rects = down.map((l) => ({ w: 2 * (Math.abs(l.ex[0]) + Math.abs(l.ey[0])), d: 2 * (Math.abs(l.ex[2]) + Math.abs(l.ey[2])) }));
      if (mat.map && lampHasTubes(rects)) out.model = appFaceModel();
    }
    // the lamp's long axis in the light's own frame (its width or its height)
    if (out.model) out.alongWidth = (out.model.along === 'x') === (Math.abs(down[0].ex[0]) >= Math.abs(down[0].ey[0]));
    return out;
  }

  // ---- the room's light at the table ----------------------------------------------------------------------------------------------
  // First choice: the room's own answers (club.room.light.irradianceAt, club.room.lightmap.floorIrradiance,
  // club.room.floor.albedo: the room role's answers to this part's round-2 requests). While the room's bake is in use,
  // irradianceAt reads its baked light volume: the fixed emitters with their shadows, three bounces, and the main lamp's
  // bounce off the floor and the cloth; this part's own floor bounce is then left out (it would count the floor twice).
  // Second: the room light service's packed emitter uniforms and ambient colours through this part's mirror of the emitter
  // law. Everything is feature-detected; without a room the body takes round 1b's fill and says so.
  let roomSig = NaN;
  function roomApi() {
    try {
      const R = club.room?.enabled === true ? club.room : null;
      const L = R?.light;
      if (typeof L?.irradianceAt !== 'function') return null;
      const alb = R.floor?.albedo;
      const lm = R.lightmap;
      return {
        at: (p, n, baked) => L.irradianceAt(p, n, { baked }),
        // (the bake in use AND its light volume: a map without a volume leaves irradianceAt on the analytic light)
        baked: !!lm?.texture && L.volume?.enabled !== false,
        floorAt: typeof lm?.floorIrradiance === 'function' ? (x, z) => lm.floorIrradiance(x, z) : null,
        albedo: Array.isArray(alb) && alb.length >= 3 && alb.slice(0, 3).every((v) => Number.isFinite(v) && v >= 0) ? alb.slice(0, 3) : null,
      };
    } catch { return null; }
  }
  function roomSource() {
    const L = club.room?.enabled === true ? club.room.light : null;
    const u = L?.uniforms;
    const n = Number(u?.uRoomEmCount?.value);
    if (!u || !Array.isArray(u.uRoomEmP?.value) || !Array.isArray(u.uRoomEmC?.value) || !Array.isArray(u.uRoomEmN?.value) || !Array.isArray(u.uRoomEmA?.value) || !(n >= 0)) return null;
    if (!u.uRoomAmbSky?.value?.isColor || !u.uRoomAmbGround?.value?.isColor || !u.uRoomAmbSide?.value?.isColor) return null;
    return { u, n: Math.min(n, u.uRoomEmP.value.length) };
  }
  function roomSignature(src) {
    if (!src) return -1;
    let h = src.n * 7.7 + U.uClubWoodTop.value.x * 3.1 + U.uClubWoodTop.value.w * 5.3 + U.uClubWoodBand.value.z + U.uClubWoodBand.value.w * 1.7;
    for (let i = 0; i < src.n; i++) { const c = src.u.uRoomEmC.value[i], p = src.u.uRoomEmP.value[i]; h += (c.x + 1.3 * c.y + 1.7 * c.z) * (i + 1) + p.x * 0.11 + p.y * 0.13 + p.z * 0.17; }
    const a = src.u.uRoomAmbSky.value, g = src.u.uRoomAmbGround.value, sd = src.u.uRoomAmbSide.value;
    return h + a.r * 11 + a.g * 13 + a.b * 17 + g.r * 19 + g.g * 23 + g.b * 29 + sd.r * 31 + sd.g * 37 + sd.b * 41;
  }
  // the hall variant (round A2): the heads' elevation as the room's own numbers give it (never called under the club venue)
  let hallTanOverride = null;
  function setHall(res, from, resAnalytic = null, albedo = null) {
    if (!hall) return;
    let t = hallTan(res?.faces, res?.floor);
    hallState.tan = +t.toFixed(3); hallState.from = from;
    if (Number.isFinite(hallTanOverride)) t = hallTanOverride;
    U.uClubWoodHall.value.x = t;
    // (round A3, the second model: per side of the table a steep light and a low one, wood/layout.js hallSides: told
    // apart by the room's analytic answer beside its baked one, `resAnalytic`; a tool's tangent stands for all of them)
    if (hall2) {
      hallState.tans = hallTans(res?.faces, res?.floor).map((v) => +v.toFixed(3));
      const share = resAnalytic && albedo ? hallBounceShare(res?.faces, res?.floor, albedo) : 0;
      const s = Number.isFinite(hallTanOverride) ? { steep: [t, t, t, t], low: [t, t, t, t], lowShare: [0, 0, 0, 0] }
        : hallSides({ baked: resAnalytic ? res : null, analytic: resAnalytic ?? res, share });
      const r3 = (a) => a.map((v) => +v.toFixed(3));
      hallState.sides = { steep: r3(s.steep), low: r3(s.low), lowShare: r3(s.lowShare) };
      U.uClubWoodHallT.value.set(s.steep[0], s.steep[1], s.steep[2], s.steep[3]);
      U.uClubWoodHallK.value.set(s.low[0], s.low[1], s.low[2], s.low[3]);
      U.uClubWoodHallW.value.set(s.lowShare[0], s.lowShare[1], s.lowShare[2], s.lowShare[3]);
    }
  }
  // Round A3, the second hall model only (never called otherwise): the floor the body's lacquer mirrors and takes the
  // carpet's bounce from. A small map of the carpet's radiance over the island (wood/layout.js hallFloorRect,
  // hallFloorField): the room's baked floor irradiance where the bake is in use (it holds the table's shadow, the pool
  // and the fall toward the boards), else its analytic light with a stand-in for the table's shadow; plus the app's sky
  // light, which the carpet takes like every scene material. The main lamp's spill is added in the shader (it follows
  // the lamp every frame). Built on the CPU from the room's own accessors (nothing is read back from the GPU), and
  // again only when the room's light, the carpet's albedo or the sky changed. Without a room answer the map is off and
  // the shader mirrors the floor's four sides, as the club variant does.
  // The bounce share: how much of a side face's light in the room's baked volume is the carpet's bounce (the volume
  // holds it as a face mean; the shader reads it per fragment from the map instead and takes this share out).
  const bounceK = () => bounceSwitch * (hall2 ? 1 : bounceGain);
  function setHallFloor(api, res, albedo, sky) {
    if (!hall2) return;
    const lv = U.uClubWoodFloorLv.value;
    try {
      const r = U.uClubWoodRoom.value, b = U.uClubWoodBand.value, floorY = U.uClubWoodTop.value.w;
      const R = club.room?.enabled === true ? club.room : null;
      const rect = hallFloorRect({ layout: R?.layout ?? null, box: R?.box ?? null, centre: [r.x, r.y], floorY });
      U.uClubWoodFloorBox.value.set(rect.centre[0], rect.centre[1], rect.half[0], rect.half[1]);
      // (.w, round A4, the third model only: the skirt's inset at its lower edge; round A3's text does not read it)
      U.uClubWoodRing.value.set(rect.boardTop ?? 0, rect.boardTop === null ? 0 : 1, HALL_BODY2.floor.outer, hall3 ? (table.skirtInset ?? 0) : 0);
      hallFloor.rect = rect;
      hallFloor.share = api?.baked ? hallBounceShare(res?.faces, res?.floor, albedo) : 0;
      U.uClubWoodHall.value.y = Number.isFinite(hallFloor.shareOverride) ? hallFloor.shareOverride : hallFloor.share;
      if (!api) { lv.w = 0; hallFloor.from = 'no room answer: the floor\'s four sides'; return; }
      const baked = !!(api.baked && api.floorAt);
      const size = lite || !baked ? HALL_BODY2.floor.sizeLite : HALL_BODY2.floor.size;
      const sig = roomSig + size * 0.37 + (sky[0] + 1.3 * sky[1] + 1.7 * sky[2]) * 2.9 + rect.half[0] * 0.71 + rect.half[1] * 0.53 + rect.centre[0] * 0.19 + rect.centre[1] * 0.23 + b.z * 0.41 + b.w * 0.43 + floorY * 0.59;
      if (sig !== hallFloor.sig || !hallFloor.tex) {
        const geo = { centre: [r.x, r.y], outer: [b.z, b.w] };
        const sample = baked
          ? (x, z) => { const e = api.floorAt(x, z); if (!e) return null; const k = hallTableShade([x, z], geo); return [e[0] + sky[0] * k, e[1] + sky[1] * k, e[2] + sky[2] * k]; }
          : (x, z) => { const e = api.at([x, floorY, z], [0, 1, 0], false); const k = hallTableShade([x, z], geo); return [(e[0] + sky[0]) * k, (e[1] + sky[1]) * k, (e[2] + sky[2]) * k]; };
        const field = hallFloorField({ rect, size, sample, albedo });
        if (field.holes >= field.size * field.size) { lv.w = 0; hallFloor.from = 'the room gave no floor light: the floor\'s four sides'; return; }
        if (!hallFloor.tex || hallFloor.size !== field.size) {
          try { hallFloor.tex?.dispose?.(); } catch { /* a texture that was never uploaded */ }
          const t = new THREE.DataTexture(field.data, field.size, field.size, THREE.RGBAFormat, THREE.UnsignedByteType);
          t.name = 'club.wood.hallfloor'; t.colorSpace = THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
          hallFloor.tex = t;
        } else hallFloor.tex.image.data.set(field.data);
        hallFloor.tex.needsUpdate = true;
        U.uClubWoodFloorMap.value = hallFloor.tex;
        const r4 = (e) => e.map((v) => +v.toFixed(4));
        const hx = b.z, hz = b.w;
        Object.assign(hallFloor, { size: field.size, scale: field.scale, holes: field.holes, mean: r4(field.mean), builds: hallFloor.builds + 1, sig,
          from: baked ? 'the room\'s baked floor map' : 'the room\'s analytic light with a stand-in for the table\'s shadow',
          // radiance at four stations (linear): 1 m off the long side, 1 m off the head end, under the table, at the boards' foot
          stations: { longSide: r4(hallFloorAt(field, rect, r.x, r.y + hz + 1)), headEnd: r4(hallFloorAt(field, rect, r.x - hx - 1, r.y)), under: r4(hallFloorAt(field, rect, r.x, r.y)), boardsFoot: r4(hallFloorAt(field, rect, r.x, rect.centre[1] + rect.half[1] - 0.2)) } });
      }
      lv.set(hallFloor.scale, Math.max(0, Math.log2(hallFloor.size) - 2), (rect.half[0] + rect.half[1]) / hallFloor.size, hallFloor.on);
    } catch (e) { lv.w = 0; hallFloor.from = 'failed: the floor\'s four sides'; note(`hall floor: ${text(e)}; the floor's four sides are mirrored instead`); }
  }
  // Round A6, with the keys only (`keysOn`; neither function does anything otherwise): the hall's key lights from the
  // room's own records (`club.room.bakeEmitters`, ids `key.*`: what arena/room.js hands the bake), packed as the room
  // light packs an emitter, lifted with the hall's seat; and how each side's own number is shared once the keys are
  // evaluated by themselves (wood/layout.js hallKeyShares: under a bake the room's volume holds the keys too, so their
  // share at the same stations comes out of the side's number; the analytic light holds no key and keeps all of it).
  const keyRecordsOf = () => { const R = club.room?.enabled === true ? club.room : null; return Array.isArray(R?.bakeEmitters) ? R.bakeEmitters : []; };
  function keySignature() {
    if (!keysOn) return 0;
    try {
      let h = 0, i = 0;
      for (const e of keyRecordsOf()) {
        if (typeof e?.id !== 'string' || !e.id.startsWith(HALL_KEYS.prefix)) continue;
        i += 1;
        h += ((e.intensity ?? 0) * 1.37 + (e.position?.x ?? 0) * 0.31 + (e.position?.y ?? 0) * 0.37 + (e.position?.z ?? 0) * 0.41 + (e.axis?.x ?? 0) * 0.43 + (e.axis?.y ?? 0) * 0.47 + (e.axis?.z ?? 0) * 0.53 + (e.cone ?? 0) * 0.059 + (e.radius ?? 0) * 0.061
          + (e.bell ? 0.83 : 0) + (e.shutter?.[1] ?? 0) * 0.67 + (e.foot?.[1] ?? 0) * 0.71 + (e.sides?.[0]?.[0] ?? 0) * 0.73 + (e.sides?.[0]?.[2] ?? 0) * 0.79 + (e.sides?.[1]?.[0] ?? 0) * 0.89 + (e.sides?.[1]?.[2] ?? 0) * 0.97) * i;
      }
      return h + i * 97.3;
    } catch { return 0; }
  }
  function setKeys(api, res) {
    if (!keysOn) return;
    const P = U.uClubWoodKeyP.value, C = U.uClubWoodKeyC.value, A = U.uClubWoodKeyA.value;
    try {
      const R = club.room?.enabled === true ? club.room : null;
      let lift = 0;
      try { const seat = R?.state?.()?.seat; if (Number.isFinite(R?.floorY) && Number.isFinite(seat?.appFloor)) lift = R.floorY - seat.appFloor; } catch { lift = 0; }
      const { keys, skipped } = hallKeyRecords(keyRecordsOf(), { lift });
      keys.forEach((k, i) => { P[i].set(k.P[0], k.P[1], k.P[2], k.P[3]); C[i].set(k.C[0], k.C[1], k.C[2], k.C[3]); A[i].set(k.A[0], k.A[1], k.A[2], k.A[3]); U.uClubWoodKeyS.value[i].set(k.S[0], k.S[1], k.S[2], k.S[3]); U.uClubWoodKeyF.value[i].set(k.F[0], k.F[1], k.F[2], k.F[3]); for (let j = 0; j < 2; j++) U.uClubWoodKeyD.value[2 * i + j].set(k.D[j][0], k.D[j][1], k.D[j][2], k.D[j][3]); });
      U.uClubWoodKeyN.value.x = keys.length;
      U.uClubWoodKeyN.value.y = keyState.on;
      const b = U.uClubWoodBand.value, r = U.uClubWoodRoom.value;
      const keyE = hallKeySides(keys, { centre: [r.x, r.y], outer: [b.z, b.w], top: U.uClubWoodTop.value.x, floorY: U.uClubWoodTop.value.w });
      const low0 = U.uClubWoodHallW.value.toArray();
      let shares = { key: [0, 0, 0, 0], low: low0 };
      // (round A6b: keys the room's bake leaves out, `club.room.bakeRules.skip`, are not in the baked sides: nothing is taken out)
      const inBake = hallKeysInBake(R?.bakeRules);
      if (api?.baked && inBake && Array.isArray(res?.faces) && keys.length && keyState.on > 0) {
        const bounce = Math.min(0.8, Math.max(0, U.uClubWoodHall.value.y));
        shares = hallKeyShares([0, 1, 4, 5].map((fi) => luma(res.faces[fi] ?? [0, 0, 0]) * (1 - bounce)), keyE, low0);
        U.uClubWoodHallW.value.set(shares.low[0], shares.low[1], shares.low[2], shares.low[3]);
      }
      U.uClubWoodKeyW.value.set(shares.key[0], shares.key[1], shares.key[2], shares.key[3]);
      const r3 = (a) => a.map((v) => +v.toFixed(3));
      Object.assign(keyState, { ids: keys.map((k) => k.id), skipped, lift: +lift.toFixed(4), from: keys.length ? `club.room.bakeEmitters (${api?.baked ? (inBake ? 'their share taken out of the baked sides' : 'not in the bake: added to the baked sides, which hold no key') : 'added to the analytic sides, which hold no key'})` : 'no key record in club.room.bakeEmitters',
        sides: keyE.map(r3), shares: { key: r3(shares.key), low: r3(shares.low), lowBefore: r3(low0) },
        keys: keys.map((k) => ({ id: k.id, position: r3(k.P.slice(0, 3)), reach: k.P[3], candela: r3(k.C.slice(0, 3)), source: k.source, axis: r3(k.A.slice(0, 3)), cone: +k.A[3].toFixed(4), shutter: k.S[3] > 0.5 ? r3(k.S.slice(0, 3)) : null, foot: k.F[3] > 0.5 ? r3(k.F.slice(0, 3)) : null, sides: k.D.filter((d) => d[3] > 0.5).map((d) => r3(d.slice(0, 3))) })) });
    } catch (e) {
      U.uClubWoodKeyN.value.x = 0; U.uClubWoodKeyW.value.set(0, 0, 0, 0);
      keyState.from = 'failed'; keyState.ids = [];
      note(`hall keys: ${text(e)}; the body keeps its sides' own numbers`);
    }
  }
  function readRoom(force = false) {
    const src = roomSource();
    const api = roomApi();
    const sig = roomSignature(src) + (api ? (api.baked ? 1000.5 : 500.25) + (api.albedo ? api.albedo[0] * 3.3 + api.albedo[1] * 5.7 + api.albedo[2] * 7.9 : 0) : 0) + keySignature();
    if (!force && sig === roomSig) return;
    roomSig = sig;
    const amb = U.uClubWoodAmb.value, fl = U.uClubWoodFloorR.value;
    const sky = hemi && shown(hemi) ? [hemi.color.r * hemi.intensity, hemi.color.g * hemi.intensity, hemi.color.b * hemi.intensity] : [0, 0, 0];
    const r3 = (e) => e.map((v) => +v.toFixed(3));
    const albedo = api?.albedo ?? floorStandIn;
    U.uClubWoodFloor.value.set(albedo[0], albedo[1], albedo[2], U.uClubWoodFloor.value.w);
    bounceGain = 1;
    if (api) {
      try {
        const b = U.uClubWoodBand.value, r = U.uClubWoodRoom.value;
        const res = bodyLight(null, null, { centre: [r.x, r.y], outer: [b.z, b.w], top: U.uClubWoodTop.value.x, floorY: U.uClubWoodTop.value.w },
          { sample: (p, n) => api.at(p, n, api.baked), floorSample: api.baked ? api.floorAt : null });
        res.faces.forEach((e, i) => amb[i].set(e[0] / Math.PI, e[1] / Math.PI, e[2] / Math.PI));
        res.floor.forEach((e, i) => {
          const a = ambientOverride ?? [0, 1, 2].map((k) => albedo[k] * (e[k] + sky[k]) / Math.PI);
          fl[i].set(a[0], a[1], a[2]);
        });
        bounceGain = api.baked ? 0 : 1;
        U.uClubWoodBody.value.z = bounceK();
        // (round A3, the second hall model under a bake: the room's analytic answer at the same stations, to tell the
        // run-time lights from what only the bake holds)
        let resA = null;
        if (hall2 && api.baked) {
          try {
            resA = bodyLight(null, null, { centre: [r.x, r.y], outer: [b.z, b.w], top: U.uClubWoodTop.value.x, floorY: U.uClubWoodTop.value.w },
              { sample: (p, n) => api.at(p, n, false), floorSample: (x, z) => api.at([x, U.uClubWoodTop.value.w, z], [0, 1, 0], false) });
          } catch { resA = null; }
        }
        setHall(res, api.baked ? 'the baked light volume and floor map' : 'the analytic room light', resA, albedo);
        setHallFloor(api, res, albedo, sky);
        setKeys(api, res);
        table.light = { from: `club.room.light.irradianceAt (${api.baked ? 'the baked light volume; the floor from the baked map; no bounce of this part' : 'analytic emitters and ambient'})`,
          baked: api.baked, floorAlbedo: r3(albedo), albedoFrom: api.albedo ? 'club.room.floor.albedo' : 'the stand-in', faces: res.faces.map(r3), floor: res.floor.map(r3) };
        return;
      } catch (e) { note(`room light: ${text(e)}; the packed emitter uniforms are read instead`); bounceGain = 1; }
    }
    U.uClubWoodBody.value.z = bounceK();
    setHallFloor(null, null, albedo, sky);
    setKeys(null, null);
    if (!src) {
      // no club room: round 1b's designed fill on every face, its floor constant on every side
      for (const v of amb) v.set(BODY_FILL_E[0] / Math.PI, BODY_FILL_E[1] / Math.PI, BODY_FILL_E[2] / Math.PI);
      const a = ambientOverride ?? [0, 1, 2].map((i) => albedo[i] * (sky[i] + ROOM_FLOOR_E[i]) / Math.PI);
      for (const v of fl) v.set(a[0], a[1], a[2]);
      table.light = { from: 'no club room light: the round-1b fill', faces: null, floor: null };
      return;
    }
    const arr = (v) => [v.x, v.y, v.z, v.w];
    const packed = [];
    for (let i = 0; i < src.n; i++) packed.push({ P: arr(src.u.uRoomEmP.value[i]), C: arr(src.u.uRoomEmC.value[i]), N: arr(src.u.uRoomEmN.value[i]), A: arr(src.u.uRoomEmA.value[i]) });
    const col = (c) => [c.r, c.g, c.b];
    const ambient = { sky: col(src.u.uRoomAmbSky.value), ground: col(src.u.uRoomAmbGround.value), side: col(src.u.uRoomAmbSide.value) };
    const b = U.uClubWoodBand.value, r = U.uClubWoodRoom.value;
    const res = bodyLight(packed, ambient, { centre: [r.x, r.y], outer: [b.z, b.w], top: U.uClubWoodTop.value.x, floorY: U.uClubWoodTop.value.w });
    res.faces.forEach((e, i) => amb[i].set(e[0] / Math.PI, e[1] / Math.PI, e[2] / Math.PI));
    res.floor.forEach((e, i) => {
      const a = ambientOverride ?? [0, 1, 2].map((k) => albedo[k] * (e[k] + sky[k]) / Math.PI);
      fl[i].set(a[0], a[1], a[2]);
    });
    setHall(res, 'the packed emitter uniforms');
    table.light = { from: 'club.room.light (packed emitter uniforms, this part\'s mirror of the law)', emitters: src.n, faces: res.faces.map(r3), floor: res.floor.map(r3), ambient: { sky: r3(ambient.sky), ground: r3(ambient.ground), side: r3(ambient.side) } };
  }

  // ---- textures ---------------------------------------------------------------------------------------------------------------------
  const scans = new Map(); // scan id -> { color, normal, mean: uniform-ready array, loaded, strip }
  // (round A3: what a material without a scan reads in style(): a black hall body that carries the floor map instead)
  const NO_SCAN = Object.freeze({ id: null, key: null, info: null, color: null, normal: null, mean: Object.freeze(FALLBACK_MEAN.slice()), loaded: false, strip: false, bytes: 0 });
  // One strip of a scan (wood/layout.js SCANS `strip`): the first 1 / div of the image across the grain, copied 1 : 1 onto a
  // canvas (a CPU copy; nothing is read back from the GPU). The whole image is never uploaded.
  function stripOf(tex, info, srgb) {
    const img = tex?.image;
    const w = img?.naturalWidth || img?.width || 0, h = img?.naturalHeight || img?.height || 0;
    if (!(w >= 64 && h >= 64)) return null;
    const c = document.createElement('canvas');
    c.width = info.alongV ? Math.max(16, Math.round(w / info.strip)) : w;
    c.height = info.alongV ? h : Math.max(16, Math.round(h / info.strip));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = lite ? 4 : 8;
    t.name = `club.wood.strip.${srgb ? 'color' : 'normal'}`;
    return t;
  }
  // (round A3: `railStrip` is true only under the arena venue, for a rail cap: a scan whose row says "whole" is then cut
  // to a strip as well, wood/layout.js HALL_RAIL_STRIP, under its own entry `<id>|strip<n>`. Without it the entry's key
  // is the id and its row is the table's own object, as before.)
  function scanOf(id, railStrip = false) {
    const row = SCANS[id];
    const info = railStrip && !(row.strip > 1) ? { ...row, strip: HALL_RAIL_STRIP } : row;
    const key = info === row ? id : `${id}|strip${info.strip}`;
    let s = scans.get(key);
    if (s) return s;
    const strip = info.strip > 1;
    s = { id, key, info, color: null, normal: null, mean: FALLBACK_MEAN.slice(), loaded: false, users: [], strip: false, bytes: 0 };
    const fc = fallbackColor(), fn = fallbackNormal();
    let holdColor = null, holdNormal = null;
    try {
      if (strip) {
        // the files load through the asset service (one request per id), but the objects it hands back are never put on
        // a material: only the strips cut from them are drawn
        holdColor = club.assets?.texture?.(id, { srgb: true, anisotropy: 1 }) ?? null;
        holdNormal = club.assets?.texture?.(info.normal, { srgb: false, anisotropy: 1 }) ?? null;
        s.color = fc; s.normal = fn;
      } else {
        s.color = club.assets?.texture?.(id, { srgb: true, anisotropy: lite ? 4 : 8, fallback: fc }) ?? fc;
        // (anisotropy 4 on the normal map: the options the room's furniture asks with, so the two share one upload)
        s.normal = club.assets?.texture?.(info.normal, { srgb: false, anisotropy: 4, fallback: fn }) ?? fn;
      }
    } catch (e) { note(`assets: ${text(e)}`); s.color = fc; s.normal = fn; }
    for (const t of [s.color, s.normal]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    const settle = () => {
      let st = null;
      try { st = club.assets?.state?.()?.ids?.[id] ?? null; } catch { /* no state */ }
      if (st === 'loaded') {
        if (strip && !s.strip) {
          try {
            const sc = stripOf(holdColor, info, true), sn = stripOf(holdNormal, info, false);
            if (sc) {
              s.color = sc; s.strip = true;
              s.bytes = Math.round(sc.image.width * sc.image.height * 4 * 4 / 3);
              if (sn) { s.normal = sn; s.bytes += Math.round(sn.image.width * sn.image.height * 4 * 4 / 3); }
            } else note(`${id}: the scan's image could not be read for a strip; the procedural stand-in is shown`);
          } catch (e) { note(`${id}: strip: ${text(e)}`); }
        }
        s.loaded = !strip || s.strip; s.mean = info.mean.slice();
        if (s.loaded) for (const rec of records.values()) if (rec.scan === id && !rec.skipped && rec.kind !== 'sight') { try { style(rec); } catch (e) { note(`restyle: ${text(e)}`); } }
      } else if (st === 'fallback') note(`${id}: the scan did not load; the procedural stand-in is shown`);
    };
    try { club.assets?.ready?.([id, info.normal])?.then?.(settle, () => {}); } catch { /* stays on the stand-in */ }
    settle();
    scans.set(key, s);
    return s;
  }

  // ---- one material -------------------------------------------------------------------------------------------------------------
  const renderer = club?.ctx?.renderer ?? null;
  function samplers(material) {
    try {
      const gl = renderer.getContext();
      const prog = renderer.properties.get(material)?.currentProgram?.program;
      if (!prog) return null;
      const kinds = new Set([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_3D, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_CUBE_SHADOW,
        gl.SAMPLER_2D_ARRAY_SHADOW, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D]);
      const names = [];
      let units = 0;
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); if (u && kinds.has(u.type)) { names.push(u.name); units += u.size; } }
      return { units, names, key: String(renderer.properties.get(material).currentProgram.cacheKey ?? '') };
    } catch { return null; }
  }
  const maxUnits = (() => { try { return renderer.capabilities.maxTextures; } catch { return 16; } })();

  function style(rec) {
    const m = rec.material;
    const col = m.color?.isColor ? [m.color.r, m.color.g, m.color.b] : [0.5, 0.5, 0.5];
    const finish = finishOf(col, !!m.map);
    const p0 = finishParams(finish, rec.kind === 'rail' ? 'rail' : 'body');
    const inHall = hall && rec.cls === 'apron'; // round A2: the body of the table in the arena (false under the club venue)
    // round A4: the body by its own material (the third hall model; false under the club venue and in every other model)
    const own = hall3 && inHall;
    const p = inHall ? (own ? hallOwnParams(p0, { roughness: m.roughness, bare: ownBare }) :(hall2 ? hallBodyParams2(p0, finish) : hallBodyParams(p0, finish))) : p0;
    // Round A3, the arena venue only (both lines are inert under the club venue: `hall2` and `arena` are false there):
    //   - a BLACK body in the second hall model takes the hall's floor map as this part's one sampler, in place of the
    //     scan, which a black lacquer does not show: decided once, before the material is patched, and such a material
    //     asks for no scan at all (round A4: in the third model EVERY body does, whatever its finish: its albedo is the
    //     app's own colour and map, so it never binds a scan);
    //   - a rail cap's scan is uploaded as a strip (wood/layout.js HALL_RAIL_STRIP).
    if (hall2 && inHall && rec.key === null && rec.floorMap === null) rec.floorMap = rec.withMap && (own || finish === 'black-stain' || finish === 'black-laminate');
    const scan = rec.floorMap === true || own ? NO_SCAN : scanOf(p.scan, arena && rec.kind === 'rail');
    const info = scan.info ?? SCANS[p.scan];
    rec.finish = finish; rec.scan = p.scan; rec.scanKey = scan.key; rec.params = p;
    const u = rec.uniforms;
    u.uClubWoodMap.value = scan.color;
    u.uClubWoodCoat.value.set(p.coat[0], p.coat[1], p.coat[2], p.coat[3]);
    u.uClubWoodHaze.value.set(p.haze[0], p.haze[1], p.haze[2], p.haze[3]);
    u.uClubWoodScr.value.set(p.brush[0], p.brush[1], p.brush[2], BRUSH_STREAK);
    u.uClubWoodPore.value.set(p.pore[0], p.pore[1], p.pore[2], p.pore[3]);
    // the scan's normal map rides the material's own normal-map slot when it has one (no sampler added)
    let relief = 0;
    if ('normalMap' in m && m.normalMap && scan.normal) {
      if (rec.normalSwaps === 0 && m.normalMap !== scan.normal) rec.normalOwn = m.normalMap;
      // (a tool that switched the part off keeps the app's own map until it switches the part on again)
      // (through adopt.write: at once, or, while the look is built off stage, with the queued wraps at its swap)
      if (partOn > 0.5 && m.normalMap !== scan.normal) { const to = scan.normal, own = rec.normalOwn; write(() => { m.normalMap = to; }, () => { m.normalMap = own; }); rec.normalSwaps += 1; }
      else if (partOn <= 0.5 && rec.normalSwaps === 0) rec.normalSwaps = 1;
      rec.normalScan = scan.normal;
      relief = p.relief;
    }
    // a rail cap reads one strip of a scan that is uploaded as a strip; everything else the whole scan
    const place = scanPlacement(info, p.scale, scan.strip && rec.kind === 'rail');
    u.uClubWoodGrain.value.set(place.metres[0], place.metres[1], info.alongV ? 1 : 0, relief);
    u.uClubWoodPlace.value.set(place.perRail[0], place.perRail[1], place.margin[0], place.margin[1]);
    u.uClubWoodTone.value.set(scan.mean[0], scan.mean[1], scan.mean[2], p.contrast);
    u.uClubWoodBase.value.set(p.depth, rollSharp, 0, innerSlope);
    u.uClubWoodFill.value.set(fill[0], fill[1], fill[2], p.matte);
    u.uClubWoodMode.value.set(p.chroma, rec.kind === 'rail' ? 0 : 1, rec.kind === 'rail' ? UNDER_COAT : (inHall ? (own ? HALL_OWN.under : (hall2 ? HALL_BODY2.under : HALL_BODY.under)) : UNDER_COAT_BODY), rec.kind === 'leg' ? 1 : 0);
    // (round A4, the third hall model: what the app's material gives this part, read here and nowhere copied: its own
    // environment gain, and for the record its colour and roughness; tools may hold the gain and the lights' factor)
    if (own && u.uClubWoodOwn) {
      const gain = ownEnvGain(m);
      u.uClubWoodOwn.value.set(Number.isFinite(ownHold.gain) ? ownHold.gain : gain, Number.isFinite(ownHold.direct) ? ownHold.direct : HALL_OWN.direct, HALL_OWN.spread, HALL_OWN.sample);
      rec.own = { color: col.map((v) => +v.toFixed(4)), roughness: p.coat[1], gain, map: !!m.map };
    }
    // (round A3: a body that was patched with the floor map in place of the scan and is no longer black shows no figure)
    if (rec.floorMap === true && finish === 'wood' && !own) note(`${rec.cls}: '${rec.name}' turned to a wood finish after it took the hall's floor map in place of the scan; its figure is not drawn until a reload`);
  }

  function adoptOne(material, cls, kind, rail = null) {
    let rec = records.get(material);
    if (rec) { rec.kind = kind; rec.cls = cls; rec.live = true; return rec; }
    rec = {
      material, cls, kind, name: material.name || material.userData?.obClass || material.type,
      finish: null, scan: null, scanKey: null, floorMap: null, params: null, frag: null, variant: null, withMap: true, key: null, normalSwaps: 0, normalOwn: null, normalScan: null, before: null, skipped: null, live: true,
      uniforms: {
        // a sight shares the coat uniform OBJECTS of the rail it is let into (one finish over both)
        ...U, uClubWoodMap: { value: null }, uClubWoodCoat: rail?.uClubWoodCoat ?? v4(1, 0.2, 0, 0.3), uClubWoodHaze: rail?.uClubWoodHaze ?? v4(0.4, 0, 0, 0),
        uClubWoodScr: rail?.uClubWoodScr ?? v4(0, 0.12, 0.5, 0), uClubWoodPore: v4(0, 0, 0, 0), uClubWoodGrain: v4(2, 2, 0, 0), uClubWoodPlace: v4(0.37, 0.61, 0, 0),
        uClubWoodTone: v4(FALLBACK_MEAN[0], FALLBACK_MEAN[1], FALLBACK_MEAN[2], 1), uClubWoodMode: v4(0, 0, 1, 0), // (a sight keeps its own lobe: nacre)
        uClubWoodBase: v4(1, rollSharp, 0, innerSlope), uClubWoodFill: v4(fill[0], fill[1], fill[2], 0),
        ...(kind === 'sight' ? { uClubSight: v4(0, SIGHT.seam, SIGHT.nacre, SIGHT.wall) } : {}),
        // (round A4, the third hall model only: one uniform per body material, set in style(); absent everywhere else)
        ...(hall3 && cls === 'apron' ? { uClubWoodOwn: v4(1, HALL_OWN.direct, HALL_OWN.spread, HALL_OWN.sample) } : {}),
        // (round A7, with the hall cube only: the env service's shared uniform objects and this part's two shares; absent everywhere else)
        ...(hallEnvU && cls === 'apron' ? hallEnvU : {}),
      },
    };
    records.set(material, rec);
    // The app disposes a table build's own materials when its table cache evicts the build (table.js disposeChildren), and
    // never draws them again: the record goes then. This map is iterated, so it cannot hold its keys weakly; without this
    // every evicted build's materials stayed reachable from here for the life of the page.
    try { material.addEventListener?.('dispose', () => { records.delete(material); }); } catch { /* no events on this object: its record stays */ }
    if (!material.isMeshStandardMaterial) { rec.skipped = 'not a standard material'; note(`${cls}: '${rec.name}' is not a standard material; left as it is`); return rec; }
    // the texture budget: one unit is added; a program already at the limit gets the variant without the scan
    // (club patches of other services that this program has not compiled yet may add one unit each: counted as if they do)
    rec.before = samplers(material);
    const pending = rec.before ? (material.userData?.clubKeys ?? []).filter((k) => !rec.before.key.includes(`|club:${k}`)).length : 0;
    if (rec.before && rec.before.units + pending + 1 > maxUnits) { rec.withMap = false; note(`${cls}: '${rec.name}' binds ${rec.before.units} of ${maxUnits} texture units; patched without the scan`); }
    if (kind !== 'sight') style(rec);
    // a tap in front of the patch: it changes nothing and records the fragment text the earlier hooks produced, from which
    // the coat's anchor is picked (the app's shadow rail when it is there)
    let prev = null;
    const tap = function clubWoodTap(shader, r) {
      if (typeof prev === 'function') prev.call(this, shader, r);
      rec.frag = shader.fragmentShader;
    };
    write(() => { if (material.onBeforeCompile !== tap) { prev = material.onBeforeCompile; material.onBeforeCompile = tap; } }, () => { if (material.onBeforeCompile === tap) material.onBeforeCompile = prev; });
    // (round A2: under the arena venue a body material takes the hall variant of the coat; `partOpts` is `{ map }` alone
    // under the club venue and for rail caps and sights in every venue, so their key and text are the ones they always had)
    // (round A3, the second hall model: a BLACK body takes the hall's floor map as the one sampler of this part, in
    // place of the scan, which it does not show; a wood body keeps its scan and mirrors the floor's four sides)
    let partOpts = { map: rec.withMap };
    // (round A4, the third hall model: every body takes the floor map as the one sampler and binds no scan)
    if (hall && cls === 'apron') {
      if (hall3) partOpts = { map: false, hall: 3, floor: rec.floorMap === true, keys: keysOn, ...(hallEnv ? { henv: hallEnv.glsl } : {}) };   // (round A6, `keys`: false = the text and key of round A4; round A7, `henv`: absent = round A6's)
      else if (hall2) partOpts = { map: rec.withMap, hall: 2, floor: rec.floorMap === true };   // (rec.floorMap: decided in style())
      else partOpts = { map: rec.withMap, hall: true };
    }
    const parts0 = woodPatchParts(kind === 'sight' ? 'sight' : 'wood', null, partOpts);
    rec.key = parts0.key;
    const spec = {
      key: parts0.key, uniforms: rec.uniforms, vertexPars: parts0.vertexPars, pars: parts0.pars,
      get apply() { const p = woodPatchParts(kind === 'sight' ? 'sight' : 'wood', rec.frag, partOpts); rec.variant = p.variant; return p.apply; },
    };
    if (adopt.patch(material, spec) !== true) note(`${cls}: '${rec.name}' already carried ${parts0.key}`);
    return rec;
  }

  // ---- sights -------------------------------------------------------------------------------------------------------------------
  // A sight is a small flat disc (three CircleGeometry; 4 segments = a rhombus) lying on the rail band at the rail top.
  const isSight = (o) => {
    const g = o?.geometry;
    if (g?.type !== 'CircleGeometry' || !(g.parameters?.radius <= 0.03)) return false;
    if (/sight/i.test(o.name || '')) return true;
    const b = table.band;
    if (!b) return false;
    o.getWorldPosition(tmpV);
    const qx = Math.abs(tmpV.x - b.centre[0]), qz = Math.abs(tmpV.z - b.centre[1]);
    const onBand = (qx > b.inner[0] - 0.01 || qz > b.inner[1] - 0.01) && qx < b.outer[0] && qz < b.outer[1];
    return onBand && Math.abs(tmpV.y - b.top) < 0.006;
  };
  try { adopt.classify?.('sight', (o) => isSight(o)); } catch (e) { note(`classify: ${text(e)}`); }

  function build(reason) {
    rebuilds += 1; lastReason = reason;
    for (const rec of records.values()) rec.live = false;
    const by = usage();
    const railMats = adopt.find('railwood'), apronMats = adopt.find('apron');
    const { bodyBoxes, floorY } = readTable(by, railMats, apronMats);
    findLights();
    readLamp(true);
    for (const m of railMats) { const rec = adoptOne(m, 'railwood', 'rail'); if (!rec.skipped) style(rec); }
    for (const m of apronMats) {
      // a part that stands on the floor is a leg: its grain is upright
      const boxes = bodyBoxes.get(m) ?? [];
      const onFloor = boxes.filter((b) => b.min[1] < floorY + 0.12);
      const legs = boxes.length > 0 && onFloor.length * 2 > boxes.length
        && onFloor.some((b) => (b.max[1] - b.min[1]) > 1.2 * Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]));
      const rec = adoptOne(m, 'apron', legs ? 'leg' : 'body');
      if (!rec.skipped) style(rec);
    }
    // sights: their material must serve nothing but sights (the patch reads the disc's own uv)
    let sightMeshes = 0;
    const sightMats = new Map();
    for (const [m, list] of by) {
      const n = list.filter(isSight).length;
      if (n) sightMats.set(m, { n, all: n === list.length, round: list.some((o) => isSight(o) && (o.geometry.parameters?.segments ?? 0) > 8) });
    }
    for (const [m, s] of sightMats) {
      if (records.has(m) && records.get(m).kind !== 'sight') continue;
      if (!s.all) { note(`sights: material '${m.name || m.type}' also serves other meshes; left as it is`); continue; }
      const railRec = [...records.values()].find((r) => r.kind === 'rail' && !r.skipped);
      const rec = adoptOne(m, 'sight', 'sight', railRec?.uniforms ?? null);
      if (rec.skipped) continue;
      sightMeshes += s.n;
      rec.finish = 'nacre under the rail coat';
      rec.uniforms.uClubSight.value.x = s.round ? 1 : 0;
    }
    table.sights = sightMeshes;
  }

  try { build('install'); } catch (e) { return off(`build failed: ${text(e)}`); }
  // the lamp follows the scene every frame (brightness slides, a fixture swap that reuses its lights): a few numbers, no read-back
  const onFrame = () => { readLamp(); };
  try { club.onFrame?.(onFrame); } catch { /* no frame hook: the lamp is read on rebuild only */ }
  // the room's bake may land after this part: read the room again then (the signature check also catches it, later)
  try { club.room?.lightmap?.ready?.then?.(() => { try { readRoom(true); } catch { /* keeps the last values */ } }, () => {}); } catch { /* no promise */ }

  const SWITCHES = { on: ['uClubWoodSw', 'x'], edges: ['uClubWoodSw', 'y'], grain: ['uClubWoodSw', 'z'], scratches: ['uClubWoodSw', 'w'],
    lamp: ['uClubWoodSw2', 'x'], room: ['uClubWoodSw2', 'y'], floor: ['uClubWoodSw2', 'z'], aa: ['uClubWoodSw2', 'w'], cue: ['uClubWoodCueC', 'w'],
    bodyRoom: ['uClubWoodBody', 'x'], bodyOcc: ['uClubWoodBody', 'y'], bodyBounce: ['uClubWoodBody', 'z'] };
  function state() {
    const mats = [];
    for (const rec of records.values()) {
      const now = samplers(rec.material);
      mats.push({
        name: rec.name, cls: rec.cls, kind: rec.kind, inScene: rec.live, finish: rec.finish, key: rec.key, variant: rec.variant, skipped: rec.skipped,
        scan: rec.withMap && rec.floorMap !== true ? rec.scan : null, scanLoaded: rec.scan && rec.floorMap !== true ? scans.get(rec.scanKey)?.loaded === true : null,
        normalSlot: rec.normalSwaps > 0 ? 'scan normal' : 'unchanged',
        coat: rec.uniforms.uClubWoodCoat.value.toArray().map((v) => +v.toFixed(3)),
        haze: rec.uniforms.uClubWoodHaze.value.toArray().map((v) => +v.toFixed(3)), brush: rec.uniforms.uClubWoodScr.value.toArray().map((v) => +v.toFixed(3)),
        pore: rec.uniforms.uClubWoodPore.value.toArray().map((v) => +v.toFixed(3)),
        strip: rec.scan ? scans.get(rec.scanKey)?.strip === true && rec.kind === 'rail' : null, stripBytes: rec.scan ? scans.get(rec.scanKey)?.bytes ?? 0 : 0,
        samplersBefore: rec.before?.units ?? null, samplers: now?.units ?? null, maxSamplers: maxUnits, samplerNames: now?.names ?? null,
        // round A3, the second hall model only: the floor map took the scan's place on this material; its diffuse reflectance
        ...(hall2 && rec.cls === 'apron' ? { floorMap: rec.floorMap === true, matte: +rec.uniforms.uClubWoodFill.value.w.toFixed(4), depth: rec.uniforms.uClubWoodBase.value.x, under: rec.uniforms.uClubWoodMode.value.z } : {}),
        // round A4, the third hall model only: what the app's material gave this part (colour as three holds it, roughness,
        // environment gain) and the uniform as it stands (gain, lights' factor, the lobe's half width per alpha, sample share)
        ...(hall3 && rec.cls === 'apron' && rec.own ? { own: { ...rec.own, uniform: rec.uniforms.uClubWoodOwn?.value?.toArray?.().map((v) => +v.toFixed(4)) ?? null } } : {}),
      });
    }
    const sws = {};
    for (const [k, [u, c]] of Object.entries(SWITCHES)) sws[k] = U[u].value[c];
    sws.bodyBounce = bounceSwitch; sws.cut = cutShare; sws.roll = rollSharp; sws.faceGain = faceGain; sws.faceNorm = faceNorm;
    return {
      enabled: true, version: WOOD_PATCH_VERSION, rebuilds, lastReason, switches: sws, cue: cueShared ? 'the occlusion service\'s capsule' : 'absent (no occlusion service)',
      table: {
        band: table.band, floorY: table.floorY, skirtBottom: table.skirt, room: table.room, sights: table.sights,
        lamp: table.lamp ? { centre: table.lamp.centre.map((v) => +v.toFixed(3)), half: table.lamp.half.map((v) => +v.toFixed(3)), area: +table.lamp.area.toFixed(3), radiance: table.lamp.radiance.map((v) => +v.toFixed(3)), lights: table.lamp.count } : null,
        edge: [U.uClubWoodTop.value.y, U.uClubWoodTop.value.z], edgeInnerSlope: innerSlope,
        // what the coat mirrors of the lamp: where it comes from, its structure, its radiance (a strip, a panel between strips, the mean)
        face: table.face ? { from: table.face.from, structure: U.uClubWoodLampT.value.x, color: table.face.color?.map((v) => +v.toFixed(3)) ?? null,
          strip: table.face.model ? U.uClubWoodLampF.value.toArray().slice(0, 3).map((v) => +v.toFixed(3)) : null,
          panel: table.face.model ? U.uClubWoodLampG.value.toArray().slice(0, 3).map((v) => +v.toFixed(3)) : null,
          mean: U.uClubWoodLampM.value.toArray().map((v) => +v.toFixed(3)), cutOff: table.face.law ? table.face.law.map((v) => +v.toFixed(3)) : null,
          cutShare, level: table.face.model ? +faceLevel.toFixed(4) : null,
          model: table.face.model ? Object.fromEntries(Object.entries(table.face.model).filter(([, v]) => typeof v !== 'object').map(([key, v]) => [key, typeof v === 'number' ? +v.toFixed(4) : v])) : null } : null,
        // the room's light on the body (irradiance per face: +x, -x, +y, -y, +z, -z) and on the floor beside it (+x, -x, +z, -z)
        light: table.light,
        floorRadiance: U.uClubWoodFloorR.value.map((v) => v.toArray().map((c) => +c.toFixed(4))),
        bodySwitches: U.uClubWoodBody.value.toArray().slice(0, 3), bodyFill: fill.map((v) => +v.toFixed(4)), bodyBounceGain: bounceGain,
        // round A2: the hall variant of the body (absent under the club venue): the uniform as it stands, where the
        // heads' elevation came from, the finish numbers
        ...(hall && !hall2 ? { hall: { uniform: U.uClubWoodHall.value.toArray().map((v) => +v.toFixed(4)), tanFromRoom: hallState.tan, from: hallState.from, tanOverride: hallTanOverride, under: HALL_BODY.under, black: { ...HALL_BODY.black, haze: HALL_BODY.black.haze.slice() } } } : {}),
        // round A3: the second hall model: the uniform (tangent, bounce share, foot level, foot height), the finish, and the
        // floor the lacquer mirrors (the map's source, size, bytes with its mip chain, radiance at four stations)
        ...(hall2 ? { hall: { model: hall3 ? 3 : 2, uniform: U.uClubWoodHall.value.toArray().map((v) => +v.toFixed(4)), tanFromRoom: hallState.tan, tansBySide: hallState.tans ?? null, sides: hallState.sides ?? null, from: hallState.from, tanOverride: hallTanOverride, under: hall3 ? HALL_OWN.under : HALL_BODY2.under,
          // (round A4: the third model has no finish of its own: `own` = its numbers; the parts' own values are in `materials`)
          // (round A6, with the keys only: the key lights as read, their per-side shares, the uniforms as they stand)
          ...(keysOn ? { keys: { on: U.uClubWoodKeyN.value.y, count: U.uClubWoodKeyN.value.x, edge: [U.uClubWoodKeyN.value.z, U.uClubWoodKeyN.value.w], ids: keyState.ids.slice(), skipped: keyState.skipped.slice(), from: keyState.from, lift: keyState.lift,
            list: keyState.keys ?? [], sides: keyState.sides, shares: keyState.shares, shareUniform: U.uClubWoodKeyW.value.toArray().map((v) => +v.toFixed(4)), lowUniform: U.uClubWoodHallW.value.toArray().map((v) => +v.toFixed(4)) } } : {}),
          // (round A7, with the hall cube only: the env service's baked cube in the body's lobe, its two shares as they stand)
          ...(hallEnvU ? { hallEnv: { from: 'club.env.hall', source: hallEnv.source ?? null, share: [hallEnvU.uClubWoodHallEnv.value.x, hallEnvU.uClubWoodHallEnv.value.y] } } : {}),
          ...(hall3 ? { own: { spread: HALL_OWN.spread, sample: HALL_OWN.sample, upRough: HALL_OWN.upRough, direct: HALL_OWN.direct, figure: HALL_OWN.figure, pedestalFigure: HALL_OWN.pedestalFigure, bare: ownBare, skirtFootInset: table.skirtInset, held: { ...ownHold } } }
            : { black: { ...HALL_BODY2.black, haze: HALL_BODY2.black.haze.slice(), matte: +hallMatte().toFixed(4) } }), bounceShare: +hallFloor.share.toFixed(4),
          floor: { on: U.uClubWoodFloorLv.value.w, from: hallFloor.from, size: hallFloor.size, bytes: Math.round(hallFloor.size * hallFloor.size * 4 * 4 / 3), builds: hallFloor.builds, holes: hallFloor.holes,
            rect: hallFloor.rect ? { centre: hallFloor.rect.centre, half: hallFloor.rect.half, from: hallFloor.rect.from } : null,
            boards: U.uClubWoodRing.value.y > 0.5 ? { top: +U.uClubWoodRing.value.x.toFixed(4) } : null, outer: U.uClubWoodRing.value.z,
            scale: +hallFloor.scale.toFixed(5), mean: hallFloor.mean, stations: hallFloor.stations, texelMetres: +U.uClubWoodFloorLv.value.z.toFixed(4), coarsestLevel: U.uClubWoodFloorLv.value.y } } } : {}),
      },
      materials: mats, notes: notes.slice(),
    };
  }

  return {
    enabled: true,
    /** table / fixture / brightness / look changed: read the table again, restyle, patch what is new */
    rebuild(reason) { try { build(typeof reason === 'string' ? reason : 'rebuild'); } catch (e) { note(`rebuild: ${text(e)}`); } },
    state,
    /**
     * Tools only. Switches (0..1): on (0 also puts the app's own normal maps back: the picture of `?clubwood=off`), edges,
     * grain, scratches (the coat's waviness and its scratch fan), lamp, room, floor, aa (1 = from the edge profile, 2 = round 2's
     * screen-derivative form, 0 = none), cue, bodyRoom, bodyOcc, bodyBounce; tubes (0 = the lamp as each light's own plain
     * rectangle, as in round 1b); cut (0..1: how much of the diffuser's glare cut-off the lamp's image takes); roll (0 = the
     * lamp's image on a roll thinner than a pixel is averaged along the rail too); faceNorm (0 = the lamp's face at the face
     * mesh's colour, 1 = at the light's own radiance), faceGain (a factor on the face's radiance in the coat). Numbers:
     * pore: { rail | body | leg: [mirror share, cover, darkening, figure] },
     * edge: [outer, inner] (m), edgeInnerSlope, floorAmbient: [r, g, b] (floor radiance on every side), bodyFill: [r, g, b]
     * (an extra fill, irradiance / pi), matte: { rail | body | leg: n }, lampCap, coat / haze / brush: { rail | body | leg: [...] } (the finish
     * numbers of wood/layout.js finishParams; a sight follows its rail), figure: { rail | body | leg: { contrast, relief,
     * metres, chroma, depth } }, sight: [seam, nacre, wall]. Returns state().
     */
    debug(o = {}) {
      for (const [k, [u, c]] of Object.entries(SWITCHES)) if (Number.isFinite(o[k])) U[u].value[c] = o[k];
      if (Number.isFinite(o.bodyBounce)) bounceSwitch = o.bodyBounce;
      U.uClubWoodBody.value.z = bounceK();
      if (Number.isFinite(o.on) && (o.on > 0.5) !== (partOn > 0.5)) {
        // the scan's relief rides the material's own normal-map slot: with the part switched off the app's map goes back
        partOn = o.on > 0.5 ? 1 : 0;
        for (const rec of records.values()) {
          if (!rec.normalSwaps || !rec.normalOwn || !rec.normalScan) continue;
          rec.material.normalMap = partOn ? rec.normalScan : rec.normalOwn;
        }
      }
      if (Number.isFinite(o.cut)) { cutShare = Math.min(1, Math.max(0, o.cut)); readLamp(true); }
      if (Number.isFinite(o.faceGain)) { faceGain = Math.max(0, o.faceGain); readLamp(true); }
      if (Number.isFinite(o.faceNorm)) { faceNorm = Math.min(1, Math.max(0, o.faceNorm)); readLamp(true); }
      if (Number.isFinite(o.roll)) { rollSharp = Math.min(1, Math.max(0, o.roll)); for (const rec of records.values()) rec.uniforms.uClubWoodBase.value.y = rollSharp; }
      if (Number.isFinite(o.tubes)) { tubesWanted = o.tubes > 0.5; readLamp(true); }
      if (Array.isArray(o.edge)) { U.uClubWoodTop.value.y = o.edge[0]; U.uClubWoodTop.value.z = o.edge[1] ?? U.uClubWoodTop.value.z; }
      if (Array.isArray(o.floorAmbient)) { ambientOverride = o.floorAmbient.slice(0, 3); readRoom(true); }
      if (Number.isFinite(o.lampCap)) U.uClubWoodLampH.value.w = o.lampCap;
      // round A2, the arena venue only: hall: [tangent of the heads' elevation (null = the room's), diffuse share, foot level, foot height]
      // (round A3, the second model: the second number is the bounce share; null puts the room's back. `floorMap`: 0 = the
      // lacquer mirrors the floor's four sides instead of the map, 1 = the map)
      if (hall2 && Number.isFinite(o.floorMap)) { hallFloor.on = o.floorMap > 0.5 ? 1 : 0; readRoom(true); }
      if (hall && Array.isArray(o.hall)) {
        const h = U.uClubWoodHall.value;
        hallTanOverride = Number.isFinite(o.hall[0]) ? o.hall[0] : null;
        if (hall2) hallFloor.shareOverride = Number.isFinite(o.hall[1]) ? o.hall[1] : null;
        else if (Number.isFinite(o.hall[1])) h.y = o.hall[1];
        if (Number.isFinite(o.hall[2])) h.z = o.hall[2];
        if (Number.isFinite(o.hall[3])) h.w = o.hall[3];
        readRoom(true);
      }
      // round A4, the third hall model only: own: { gain, direct } = a held environment gain / factor on the hall's lights
      // through the lobe (null puts the material's own gain / HALL_OWN.direct back). The body materials are restyled, so
      // give `under`, `depth`, `matte`, `coat` in the same call or after it.
      if (hall3 && o.own && typeof o.own === 'object') {
        if ('gain' in o.own) ownHold.gain = Number.isFinite(o.own.gain) ? o.own.gain : null;
        if ('direct' in o.own) ownHold.direct = Number.isFinite(o.own.direct) ? o.own.direct : null;
        for (const rec of records.values()) if (rec.cls === 'apron' && !rec.skipped) { try { style(rec); } catch (e) { note(`restyle: ${text(e)}`); } }
      }
      // round A6, with the keys only: keys: 0 | 1 = the key lights off (the sides keep their whole number: round A5's body
      // on this text) | on; keyEdge: [factor on the source size in a key's shadow edge, half width at the casting edge (m)]
      if (keysOn && Number.isFinite(o.keys)) { keyState.on = o.keys > 0.5 ? 1 : 0; readRoom(true); }
      // (round A7, a tool's pair: the hall cube's two shares in the body's lobe)
      if (hallEnvU && Array.isArray(o.hallEnv)) { if (Number.isFinite(o.hallEnv[0])) hallEnvU.uClubWoodHallEnv.value.x = Math.min(1, Math.max(0, o.hallEnv[0])); if (Number.isFinite(o.hallEnv[1])) hallEnvU.uClubWoodHallEnv.value.y = Math.min(1, Math.max(0, o.hallEnv[1])); }
      if (keysOn && Array.isArray(o.keyEdge)) { if (Number.isFinite(o.keyEdge[0])) U.uClubWoodKeyN.value.z = o.keyEdge[0]; if (Number.isFinite(o.keyEdge[1])) U.uClubWoodKeyN.value.w = o.keyEdge[1]; }
      if (hall && Number.isFinite(o.under)) for (const rec of records.values()) if (rec.cls === 'apron') rec.uniforms.uClubWoodMode.value.z = o.under;
      if (hall && Number.isFinite(o.depth)) for (const rec of records.values()) if (rec.cls === 'apron') rec.uniforms.uClubWoodBase.value.x = o.depth;
      if (Array.isArray(o.bodyFill)) {
        for (let i = 0; i < 3; i++) fill[i] = o.bodyFill[i] ?? o.bodyFill[0];
        for (const rec of records.values()) { const f = rec.uniforms.uClubWoodFill.value; f.x = fill[0]; f.y = fill[1]; f.z = fill[2]; }
      }
      for (const rec of records.values()) if (rec.kind !== 'sight' && Number.isFinite(o.matte?.[rec.kind])) rec.uniforms.uClubWoodFill.value.w = o.matte[rec.kind];
      if (Number.isFinite(o.edgeInnerSlope)) innerSlope = o.edgeInnerSlope;
      for (const rec of records.values()) rec.uniforms.uClubWoodBase.value.w = innerSlope;
      for (const rec of records.values()) {
        if (rec.kind === 'sight') {
          if (Array.isArray(o.sight)) { const sv = rec.uniforms.uClubSight.value; sv.y = o.sight[0]; sv.z = o.sight[1] ?? sv.z; sv.w = o.sight[2] ?? sv.w; }
          continue;
        }
        const c = o.coat?.[rec.kind];
        if (Array.isArray(c)) rec.uniforms.uClubWoodCoat.value.set(c[0], c[1], c[2] ?? 0, c[3] ?? 0);
        const hz = o.haze?.[rec.kind];
        if (Array.isArray(hz)) rec.uniforms.uClubWoodHaze.value.set(hz[0], hz[1], hz[2] ?? 0, hz[3] ?? 0);
        const br = o.brush?.[rec.kind];
        if (Array.isArray(br)) rec.uniforms.uClubWoodScr.value.set(br[0], br[1] ?? 0.12, br[2] ?? 0.5, br[3] ?? BRUSH_STREAK);
        const po = o.pore?.[rec.kind];
        if (Array.isArray(po)) rec.uniforms.uClubWoodPore.value.set(po[0], po[1] ?? 0, po[2] ?? 0, po[3] ?? 0);
        const g = o.figure?.[rec.kind];
        if (g) {
          if (Number.isFinite(g.contrast)) rec.uniforms.uClubWoodTone.value.w = g.contrast;
          if (Number.isFinite(g.relief)) rec.uniforms.uClubWoodGrain.value.w = g.relief;
          if (Number.isFinite(g.metres)) { rec.uniforms.uClubWoodGrain.value.x = g.metres; rec.uniforms.uClubWoodGrain.value.y = g.metres; }
          if (Number.isFinite(g.chroma)) rec.uniforms.uClubWoodMode.value.x = g.chroma;
          if (Number.isFinite(g.depth)) rec.uniforms.uClubWoodBase.value.x = g.depth;
        }
      }
      return state();
    },
    uniforms: U,
  };
}
