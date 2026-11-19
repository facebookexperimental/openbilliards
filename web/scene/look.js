// Copyright (c) Meta Platforms, Inc. and affiliates.

// look.js — named render "looks". 'tournament' (legacy id: sp) regrades the
// scene the modules build toward the reference demo-video grade (provenance in
// the internal grade-provenance record): light warm-gray simonis-style
// cloth, deep red-mahogany rails, near-black room, slightly punchier lamp.
//
// WHERE IT APPLIES. `tournament` is the SHIPPED app default — web/app/settings.js
// sets `look: 'tournament'`, and web/app/settings.js:613 keeps any other stored value
// from surviving a reload. It is reached two ways: the interactive app through
// that setting, and the offline renderer through `__test.setLook`
// (web/tools/record.mjs --look tournament). This header used to end "so the
// interactive app default stays unchanged", which stopped being true when the
// app-perf wave moved the default; the numbers below are therefore on the
// default path, not on a capture-only path. Their provenance is inventoried
// number by number in the internal grade-provenance record.
import * as THREE from 'three';
import * as shadingMod from './shading.js';
// namespace import ON PURPOSE (cache-poison contract, the ownership ledger): a
// returning user's stale table.js without the newer exports must degrade
// (optional-chained below), never fail the module graph.
import * as tableMod from './table.js';
import { makeWoodMap } from './table.js';
import { applyClothVisual } from './clothvisuals.js';
// namespace import ON PURPOSE (cache-poison contract, the ownership ledger rule 5):
// a stale room.js without the newer `activeRoom` export must degrade to the
// scene-traverse fallback below, never fail the module graph (issue #89
// explicit-refs refactor).
import * as roomMod from './room.js';

export const LOOKS = ['default', 'tournament'];
// ORDER-LIGHT-FIX6 (review r10 P2 — look.js:150-153, the stale-look case): the ONE handshake value every participating venue leaf
// exports. A cached pre-change look.js has no VENUE_PROTOCOL, so main.js keeps the room on the LEGACY dressing for it — the old
// look's wall / floor multipliers then grade the near-black room they were authored against, never the class-albedo room.
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)

// Tournament grade numbers (eyeballed against the reference demo frames; iterated in
// the framing rounds — see the internal verification records). The cloth
// itself now comes from the catalog-keyed visual variant table
// (clothvisuals.js): the reference demo replica plays on pool_worsted_new's
// 'steel_gray' visual option.
const TOURNAMENT = {
  cloth: { id: 'pool_worsted_new', variant: 'steel_gray' },
  frameWood: { seed: 9001, r: 84, g: 28, b: 22, color: 0x8a6c58 },
  apronWood: { seed: 9002, r: 60, g: 20, b: 16, color: 0x7a5c48 },
  // wall multiplier stacks on room.js's already-dark wallTexture (the
  // original 0xcabfae room reads ~luma 20-40): 0x2e2a24 bottomed the set out
  // at ~0.001 effective albedo — true void. 0x554e44 keeps the reference near-black
  // mood while the weave stays readable (pre-grade luma ~8-40 band).
  wall: { color: 0xd2c8b8, envMapIntensity: 0.15 },
  floorColor: 0x383838,
  // room ambient/fill — retuned 2026-07 (crushed-blacks review fix): the old
  // hemi 0.07 / fill 0.3 let everything beyond the rails bottom out at
  // 8-bit 0 after the grade (the reference keeps dim readable set detail everywhere,
  // measured luma<2 area 0.0-0.5% vs our 13-33%). Levels lifted so wall/
  // floor detail lands in the reference's pre-grade band (~luma 8-40), and the colors
  // are near-NEUTRAL grays: the room.js sky/ground (0x38301f/0x1c2a1c — the
  // ground is the old green-cloth bounce stand-in) plus the warm 0xffdcae
  // fill were the residual G>B sage cast on the gray cloth (the reference measures
  // R=G=B; ours ran G ~3-6 levels over B).
  hemi: { intensity: 1.25, sky: 0x3a3a3e, ground: 0x2a2a2c },
  fill: { intensity: 2.2, color: 0xd9dcdf },
  // near-neutral lamp (2026-07-05 GI-wave forensics): the reference cloth measures
  // dead-neutral gray ON SCREEN while its balls stay warm ivory — that is a
  // neutral KEY over warm ball albedos, not a warm key over cool cloth (the
  // old 0xfff7ec lamp kept rendering the gray cloth +20 warm no matter how
  // cool its albedo was pushed). Exposure trimmed toward the reference's 148-gray pool.
  lamp: { color: 0xf6f7f9, intensity: 7.8 },
  exposure: 0.85,
};

// GH-1202 (ruling 741c231d): a pick made inside cinelight's studio window (the window.__cinelight seam, no import edge) parks the
// whole regrade — the traverse, gi.setLook and the lighting compose. The rig snapshotted the colours, lights and exposure it found and
// its revert restores exactly them, so a regrade there would only light the export and be undone with it. The parked pick applies in a
// microtask after the revert, through applyLook itself, so the window is checked again there: a second installCineLight can open
// synchronously after the revert, and the pick then parks again until that window's close. Only the newest pick applies — a later one
// replaces it, inside the window or outside it (a pick made after the revert, before that microtask, supersedes it). Default is no pick
// here: it regrades nothing (looks are one-way per page load) and never reaches gi (gi's requestedLook stays), so it neither parks nor
// replaces a parked Tournament — main.js has already written the tournament vignette and bloom on that pick's true, and the regrade
// must still land under them.
let parked = null; // the newest pick made inside the window: { name, refs }
let parkedArmed = false;
function onParkedClose() {
  if (window.__cinelight === true) return;
  window.removeEventListener('ob:cinelight', onParkedClose); parkedArmed = false;
  queueMicrotask(() => {
    const p = parked; parked = null;
    if (!p) return;
    try { applyLook(p.name, p.refs); } catch (e) { console.warn('[look] the parked regrade failed:', e); }
  });
}
function armParked() {
  if (parkedArmed) return;
  parkedArmed = true; window.addEventListener('ob:cinelight', onParkedClose);
}
/** Inside the studio window: park this pick (the newest) and return true. Outside it: drop any parked pick and return false */
function parkLook(name, refs) {
  if (window.__cinelight !== true) { parked = null; return false; }
  parked = { name, refs }; armParked(); return true;
}

/**
 * Apply a named look. `refs` = { renderer, scene, clothMat, woodMat,
 * apronMat, rebakeEnv } (main.js wires them). Returns true when applied
 * (or, inside cinelight's studio window, parked until its close — GH-1202),
 * false for an unknown name. 'default' is only valid before any switch —
 * looks are a one-way regrade per page load (offline capture usage).
 */
export function applyLook(name, refs) {
  if (name === 'default') return true;
  if (name === 'sp') name = 'tournament'; if (name !== 'tournament') return false; // 'sp': the legacy look id (GH-973)
  if (parkLook(name, refs)) return true;
  // GH-489 W15 (review r2 P2, adjudicated by measurement): the under-frame
  // warm-room correction STAYS ACTIVE under the tournament look. The correction models
  // CONTENT — under-frame metal mirrors the room floor (warm wood), which
  // the tournament regrade keeps ("the tournament regrade keeps its ROOM grade") — while
  // the below-horizon env content is the table's own cloth in BOTH looks.
  // An identity tint here was tried and REVERTED: with the app's default
  // look being 'tournament', it reintroduced the exact r18 P1 class on the pack
  // captures (S4 gold mask medRGB 85/108/43, G/R 1.27 — measured, W15
  // shoot 3). A future genuinely neutral-content look can call
  // shadingMod.setSpikeWarmTint(1, 1, 1) — identity now bypasses the
  // projection entirely (the review r4 mix).
  const { renderer, scene, clothMat, woodMat, apronMat, rebakeEnv, gi } = refs;

  // Feature 009 branded table entries (diamond_proam_9ft / predator_apex_9ft)
  // carry their OWN factory cloth/rail/apron materials (scene/table.js
  // styleMaterials — charcoal Dymondwood + Tournament Blue, matte black
  // Apex): the tournament regrade keeps its ROOM grade (lamp/walls/floor/exposure/GI)
  // but must not repaint the table itself into the tournament mahogany/steel-gray.
  const branded =
    (tableMod.specFor?.(tableMod.activeTableId?.())?.render.style ?? 'generic')
      !== 'generic';
  if (!branded) {
    // GH-229 cloth-color hand-off (feature-detected on the existing
    // namespace import — cache-poison contract): table.js records this
    // look's cloth base and, when a user color override is active, re-runs
    // its own cloth leg composed over it (the override survives the tournament
    // regrade). Absent seam (stale table.js) or no override → today's
    // steel_gray call, byte-identical.
    if (tableMod.applyLookCloth?.(TOURNAMENT.cloth.id, TOURNAMENT.cloth.variant) !== true) {
      applyClothVisual(clothMat, TOURNAMENT.cloth.id, TOURNAMENT.cloth.variant);
    }

    const fw = TOURNAMENT.frameWood, aw = TOURNAMENT.apronWood;
    woodMat.map = makeWoodMap(fw.seed, fw.r, fw.g, fw.b);
    woodMat.color.setHex(fw.color);
    apronMat.map = makeWoodMap(aw.seed, aw.r, aw.g, aw.b);
    apronMat.color.setHex(aw.color);
  }

  // ---- room regrade (issue #89 explicit-refs refactor) ---------------------
  // Preferred path: the explicit lightRefs handles room.js publishes on
  // `activeRoom` — same writes as the historical traverse, no magnitude-band
  // heuristics, and correct for ANY emitter topology (a multi-emitter
  // lighting fixture regrades every rect light; lightingvisuals.js then
  // re-scales from these look bases — compose order, issue #89 law).
  // Fallback: the pre-#89 scene traverse, kept verbatim for a stale room.js
  // without the export (cache-poison degrade path).
  const lampFaceRGB = () =>
    // the main lamp's emissive FACE (room.js color 10/9/7.1): it feeds the
    // env cubemap that lights the cloth (envMapIntensity) and every crown
    // reflection — left warm it kept the gray cloth +20 warm even under a
    // neutral RectAreaLight. Neutral key, same energy.
    // 2026-07 cast fix: a flat 19.4/19.4/19.6 multiplier is NOT neutral —
    // the lamp-face TEXTURE tubes are warm sRGB(255,246,226), linear
    // 1 : 0.930 : 0.761, and that env-fed warmth kept the cloth G ~5-6
    // levels over B on screen (the reference measures R=G=B). Fold the inverse tube
    // tint into the multiplier so the effective tube radiance is neutral.
    // (+1.5% R / −1.5% B trim: measured screen cloth after the inverse
    // tint alone was R 177.8 G 180.5 B 181.9 — the trim lands R≈G≈B ±1)
    [19.4 * 1.015, 19.4 / 0.9301, 19.4 / 0.7605 * 0.985];
  let hemiRef = null;
  const lr = roomMod.activeRoom?.instance?.lightRefs;
  if (lr) {
    hemiRef = lr.hemi;
    lr.hemi.intensity = TOURNAMENT.hemi.intensity;
    lr.hemi.color.setHex(TOURNAMENT.hemi.sky);
    lr.hemi.groundColor.setHex(TOURNAMENT.hemi.ground);
    lr.fill.intensity = TOURNAMENT.fill.intensity;
    lr.fill.color.setHex(TOURNAMENT.fill.color);
    for (const rl of lr.rectLights) {
      rl.color.setHex(TOURNAMENT.lamp.color);
      rl.intensity = TOURNAMENT.lamp.intensity;
    }
    // ORDER-LIGHT-5 R3 (venue-lighting lane, one hunk): the tournament wall / floor
    // multipliers below were look-authoring against the room's OLD authored
    // albedo (0.012 linear — comment above: "stacks on room.js's already-
    // dark wallTexture"). Under the class-albedo dressing they no longer
    // grade a near-black room, they blacken a real one (floor × 0x383838 =
    // 0.0395 → a black floor under lit walls). They now apply ONLY when the
    // room is the legacy dressing (`?venue=off`, main-identical); the class
    // room reads its own albedo under the tournament exposure/key like every other
    // material. Feature-detected: a stale room.js has no `dressing` → legacy.
    const legacyRoom = (roomMod.activeRoom?.instance?.dressing?.mode ?? 'legacy') !== 'class';
    if (legacyRoom) {
      lr.walls.material.color.setHex(TOURNAMENT.wall.color);
      lr.walls.material.envMapIntensity = TOURNAMENT.wall.envMapIntensity;
    }
    // LEGACY far-table regrade (cache-poison contract): a STALE room.js
    // still builds the removed far prop table and points these refs at it —
    // keep dimming it there. A FRESH room.js routes all three at its
    // detached legacyFarMat stand-in, so these writes are no-ops (the wall
    // props that replaced the table are lit standard materials and follow
    // the room regrade on their own — no explicit writes needed).
    lr.farCloth?.material?.color.setHex(0x0a0c0b); // far cloth: green -> gray
    if (lr.farSlabMat) {
      lr.farSlabMat.color.setHex(0x140e09); // far slab: darker + no sheen
      lr.farSlabMat.envMapIntensity = 0.05;
    }
    lr.farLamp?.material?.color.multiplyScalar(0.35); // far table lamp: dim
    lr.lampFace.material.color.setRGB(...lampFaceRGB());
    if (legacyRoom) lr.floor.material.color.setHex(TOURNAMENT.floorColor);
  } else {
    scene.traverse((o) => {
      if (o.isHemisphereLight) {
        hemiRef = o;
        o.intensity = TOURNAMENT.hemi.intensity;
        o.color.setHex(TOURNAMENT.hemi.sky);
        o.groundColor.setHex(TOURNAMENT.hemi.ground);
      } else if (o.isPointLight) {
        o.intensity = TOURNAMENT.fill.intensity;
        o.color.setHex(TOURNAMENT.fill.color);
      } else if (o.isRectAreaLight) {
        o.color.setHex(TOURNAMENT.lamp.color);
        o.intensity = TOURNAMENT.lamp.intensity;
      } else if (o.isMesh && o.material?.side === THREE.BackSide
          && o.geometry?.type === 'BoxGeometry') {
        // the room wall box (room.js builds exactly one BackSide box)
        o.material.color.setHex(TOURNAMENT.wall.color);
        o.material.envMapIntensity = TOURNAMENT.wall.envMapIntensity;
      } else if (o.isMesh && o.material?.color?.getHex?.() === 0x02130a) {
        // three LEGACY branches: only a stale pre-#89 room.js (the ONLY
        // graph that reaches this traverse) still builds the far prop
        // table these hexes/bands match; the fresh wall-prop materials
        // match none of them (verified against room.js prop palette).
        o.material.color.setHex(0x0a0c0b); // far table cloth: green -> gray
      } else if (o.isMesh && o.material?.color?.getHex?.() === 0x241b12) {
        o.material.color.setHex(0x140e09); // far table slab: darker + no sheen
        o.material.envMapIntensity = 0.05;
      } else if (o.isMesh && o.material?.isMeshBasicMaterial
          && o.material.color.r > 1.5 && o.material.color.r < 5) {
        o.material.color.multiplyScalar(0.35); // far table lamp: dim it
      } else if (o.isMesh && o.material?.isMeshBasicMaterial
          && o.material.color.r >= 5) {
        o.material.color.setRGB(...lampFaceRGB());
      }
    });
    // darken the plank floor without rebuilding its texture
    const floor = scene.children
      .flatMap((c) => c.children ?? [])
      .find((o) => o.isMesh && o.geometry?.type === 'PlaneGeometry'
        && o.material?.map && o.rotation.x < 0 && o.position.y < -0.5);
    if (floor) floor.material.color.setHex(TOURNAMENT.floorColor);
  }

  // baked GI: swap the lightmaps/probes to the tournament bake (gray-cloth bounce,
  // punchier lamp) — async, but capture flows hold >1 s before frames.
  // Runs AFTER the traverse and re-asserts the hemi level on resolve:
  // gi.js applyLookAssets dims the hemi to hemiBase*0.5 (its bounce
  // stand-in trim for the DEFAULT look) and used to overwrite this look's
  // intended intensity because the async load landed after the traverse.
  // GH-1202 (#1276): never inside cinelight's studio window (the window.__cinelight seam, no import edge). setLook can resolve there
  // (the maps arrive, or a staged bind lands, during an export); the rig owns the hemi in the window, and its revert restores its own
  // snapshot, so a write there would only light the export. GH-1202 batch 2: the re-assert then waits for the window's close (a
  // microtask after the revert restored that snapshot; gi.js keeps the bind for after the window and writes no hemi for this look),
  // unless another look was asked for meanwhile. Ruling 741c231d: a pick made INSIDE a window is parked whole (parkLook), so this path
  // is a pick made before a window whose setLook resolves inside it. That window's snapshot can still hold a hemi other than this
  // look's: an earlier window's close re-bound gi.js's kept default bake, its dim with it, while these maps loaded. GH-1202 batch 3
  // (review P2 on debcecb4): the microtask checks the window again — a second installCineLight can open synchronously after the
  // revert — and then waits for that window's close. It stands down only for a Default asked for meanwhile (a cached pre-rename gi.js
  // keeps the legacy id as its requested look).
  gi?.setLook('tournament')
    ?.catch?.(() => gi?.setLook?.('sp')) // a cached pre-rename gi.js over its pre-rename manifest knows only 'sp' (GH-973)
    ?.then?.(() => {
      if (!hemiRef) return;
      const reassert = () => { hemiRef.intensity = TOURNAMENT.hemi.intensity; };
      if (window.__cinelight !== true) { reassert(); return; }
      const onClose = () => {
        if (window.__cinelight === true) return;
        window.removeEventListener('ob:cinelight', onClose);
        queueMicrotask(() => {
          if (window.__cinelight === true) { window.addEventListener('ob:cinelight', onClose); return; }
          if (gi?.state?.requestedLook !== 'default') reassert();
        });
      };
      window.addEventListener('ob:cinelight', onClose);
    })?.catch?.(() => {});

  // issue #89 compose order: lighting applies AFTER a look regrade, scaling
  // from the look's bases just written above. Feature-detected window seam
  // (zero import edges — the ownership ledger rule-5 corollary): without the
  // lightingvisuals.js module, or on the identity default
  // (canopy_panel × 1.0), this is a no-op and the exact tournament writes stand.
  // Synchronous by contract — the rebakeEnv below captures the re-scale.
  window.__lighting?.regrade?.('sp'); // the legacy id on the wire: a cached pre-rename lightingvisuals.js knows only 'sp' (GH-973)
  renderer.toneMappingExposure = TOURNAMENT.exposure;
  rebakeEnv?.(); // cloth/wall tint feeds ball + rail reflections
  return true;
}
