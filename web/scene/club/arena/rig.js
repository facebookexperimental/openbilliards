// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig.js — the light rig of the arena: the venue's luminaire (CONTRACT.md 13.4, 13.5, 13.6; 9.2 and 10.3 for the
// luminaire's interface). Owner: rig. Called by arena/room.js.
//
// What hangs over the table of a tournament hall, as it is SEEN. The app's light itself (its RectAreaLights, the shared
// emitter uniforms, the baked maps) is never changed, no three light is added, removed or changed and no shadow map exists:
//
//   housing      the table light: a tournament light box on the app's lamp rectangle, read from the app's lights at run
//                time (arena/rig/housing.js, arena/rig/luminaire.js). It keeps the club luminaire's interface: `face()`
//                (the diffuser as plain data, the shape of room/lamp/face.js lampFace), the one spill emitter `lamp.band`,
//                the treatment of the app's luminaire meshes and their camera fade (solid or absent, never a translucent
//                ghost), cube renders left to the app, and the lamp view rule by import from room/lamp/rule.js.
//   truss        a box truss on `ARENA.rig`: aluminium chord tubes with lattice diagonals, hung from the roof on four
//                chain hoists (arena/rig/plan.js, arena/rig/truss.js). Brushed aluminium, lit by the room light's emitters
//                (the housing's seam among them) and by the lit table below (an analytic term in its own material).
//   heads        eight wash heads on the truss's outer chords, each over its own side of the island and aimed at it (round
//                A2: no beam passes the housing): black cans with barn doors on yokes, a lens that glows with a hot core.
//                They are the room light's emitters that wash the carpet island: one emitter per head, the whole share
//                of 9 with `lamp.band` (`ARENA.emitters.rig`), registered before the room commits its light.
//   second level a larger rectangle of truss around the first, one section higher, with profile heads inside it and a few
//                colour washes outside it (no emitters: what a camera sees of them is the lens), chain hoists with steel
//                safety wires up to the roof's rigging beams, cable looms, a safety bond on every head (round A2).
//   roof steel   trusses across the hall with purlins along it, at the layout's house-light height; every roof lamp hangs
//                in a bell on a drop rod under a purlin. A heavier truss over the upper seating rows of three sides (where
//                the camera cannot come) carries the low house lights in cans, steel wires up to the purlins, and dark
//                screens on standby (arena/rig/steel.js; the places: arena/rig/plan.js roofPlan). A low wash that is no
//                emitter shows the steel (arena/rig/mat.js: a colour per vertex).
//   house lights (rounds A1 to A4) the lamps themselves were one draw call of camera-facing discs at the fixtures' mouths,
//                with small lamps on the walls beside the seating blocks (arena/rig/house.js; the places: arena/rig/plan.js
//                housePlan). ROUND A5 (CONTRACT 17.4: a source is a lens or reflector face with a hot core and a dark
//                body, its glare the post chain's bloom, no sprite that turns to the camera): every bell and can has a lit
//                MOUTH, a disc inside the fixture in the lens mesh (arena/rig/steel.js); the wall lamps are off and not
//                built; the disc mesh is empty and never drawn.
//   screens      five screens on the perimeter truss, LIT since round A5: each a slide of the lens atlas (one of the
//                layout's WORDS on a white ground), the hall's brightest surfaces after the bed (CONTRACT 17.1).
//   haze         soft additive cones in the beams of both rectangles' heads and (round A5) of the six house floods, on
//                the high tier only (arena/rig/haze.js).
//
// The floor-fixed parts stand at or above the hall's top cut (`ARENA.cut.top`): they carry the side mark `SIDE.top` and
// their materials are made with `hide: true`, so the room light drops them while the camera is above that plane (the hall's
// camera note of round A1); the perimeter truss and the roof steel stand where the camera cannot be at all. The housing
// hangs below the plane and follows the lamp view rule. Lite and base: everything above is merged into the first build's
// three draw calls (aluminium, black hardware, lenses), tested per render against group boxes, so a player view that looks
// down at the table draws none of it.
//
// Tool switches on the boot URL: ?clubrig=off (build nothing; the emitters are still registered, so both arms of a pair
// stand in the same room light), ?clubrig=notruss,nohouse,nolens,noouter,nosteel (leave single parts out of the picture),
// ?clubrig=nowash (the heads' eight emitters registered at a level of nothing: the off arm of the island's pool),
// ?clubrig=nowashlight (the steel's wash at nothing), ?clubrig=haze:0 (no haze cones), and the club luminaire's own
// (?clublamp=off|solid|absent, ?clublampview=whole|keep) for the housing. Importing this module does nothing.
import * as THREE from 'three';
import * as LAYOUT from './layout.js';
import { rigPlan, housePlan, keepOut, rigSignature, outerPlan, roofPlan, hallKeepOut, hoistTopH, hazeBeams, floodBeams, floodPlan, keyPlan, wallWashPlan, RIG, HALL, HAZE } from './rig/plan.js';
import { buildHaze } from './rig/haze.js';
import { buildTruss, washArray } from './rig/truss.js';
import { buildSteel, buildHouseLights } from './rig/steel.js';
import { buildHouse } from './rig/house.js';
import { createLuminaire, BAND } from './rig/luminaire.js';
import { lampSpillBaked } from '../room/lamp/face.js';
import { patch, lit, glow, brushedTexture, lensTexture, TEX_BYTES } from './rig/mat.js';

const TIER_DETAIL = { lite: 0, base: 1, high: 2 };
// the lit table as a light from below: the bed's radiosity at brightness 1 (a look value: the app puts about 5.7 units on a
// cloth of albedo 0.3; the same term on the club luminaire's shade is 1.9 at its rim, which is this number times the form
// factor there)
const BOUNCE_M = 2.6;
const LENS_LEVEL = 11;          // radiance of a lens's core on its axis (scene-linear): a bloom and bokeh source
// what a camera is shown of a lens against the angle to its axis: low, c0, c1, peak.
// Round A5 (CONTRACT 17.4: every lit fixture is seen as a source: a core over the post chain's bloom threshold, 1.35 for
// the arena, tiers.js). The low end was 0.12: a lit lens seen from more than 78 degrees off its axis showed a core of
// 11 x 0.8 x 0.12 = 1.06, UNDER the threshold: a grey disc with no glare (every head on the far side of the rig at
// V10). 0.3: the core is 2.6 at the worst angle (a lit lens scatters into every direction in front of it) and 8.8
// square on. A surface's emission against the angle to its own normal; nothing depends on where the camera stands.
const LENS_LAW = [0.3, 0.2, 0.95, 1];
// radiance of a house lamp's disc seen from underneath. Above the post chain's bloom threshold (1.35), and low enough that the
// lamp keeps its warm colour through the tone map (at 8 and at 2.6 every lamp was a white ball: dev frames d4, d5)
const HOUSE_LEVEL = 1.9;
// The wash (arena/rig/mat.js): light on the rig's own steel that is not one of the room light's emitters (the rig's nine are
// the eight wash heads and the lamp's band), in the app's light units per vertex. Bounded by arithmetic before the first
// frame: painted roof steel (albedo 0.05, 4 % specular) answers a wash W with 0.016 W of radiance, which the tone map shows
// at about 22 of 255 for W = 1.4; bare aluminium answers with about 0.5 W where its mirror direction points down, so 0.05
// shows at about 25 and 0.15 (beside a lit can) at about 55. All far below the bed (145).
const WASH = Object.freeze({
  // the hall's house wash on the roof steel: low. Round A4 (CONTRACT 16.1: the house light is neutral to slightly warm; no
  // violet anywhere): it was 1.3, 1.25, 1.62 (toward the palette's violet); the same luminance, warm-neutral
  // Round A5 (CONTRACT 17.2: roof steel near a lit fixture 30 to 45 of 255, away from one 10 to 25): the even 1.36 is a
  // BASE of 0.62 (painted steel 0.05: about 12 of 255) that pools beside every lit bell (arena/rig/steel.js: times
  // 1 + roofPool x level / (d^2 + 0.15); 0.4 m from a bell of level 0.8: x 4.1 = 2.5, about 35 of 255; midway between
  // two bells x 2: about 20). `roofFlat`: base and lite, whose beams have no vertex near a bell: the pools' mean.
  // Round A6 (CONTRACT 18.1: the roof by the bake): the pools are the BAKE's now (arena/room.js ROOF_UP: every lit
  // bell's uplight as a bake emitter, read by the steel from the light volume like any other light): `roofPool` 0 and
  // `roofFlat` 1 (they were 1.2 and 1.5: a stand-in painted on the steel's vertices). The base stays.
  roof: [0.62, 0.585, 0.53], roofPool: 0, roofFlat: 1,
  perimeter: [0.05, 0.048, 0.052],  // the perimeter truss between its cans
  pool: 1.2,                        // ... and what a lit can adds beside itself (times its level over the squared distance)
  outer: [0.035, 0.033, 0.03],      // the second rectangle: the island's glow (it also takes the table's bounce, at 0.4 of the first one's)
  housing: 0.07,                    // the first rectangle: the table light's lit skirt, at the box's outline
});

export async function buildRig(club, { box = null, floorY = null, tableBounds = null, roomLight = null, appRoom = null, layout = null, spill = true } = {}) {
  const ctx = club?.ctx ?? {};
  const win = typeof window !== 'undefined' ? window : null;
  const A = layout?.rig && layout?.hall ? layout : LAYOUT.ARENA;
  const PAL = LAYOUT.PALETTE ?? {};
  const SIDE_TOP = Number.isFinite(LAYOUT.SIDE?.top) ? LAYOUT.SIDE.top : 5;
  const group = new THREE.Group();
  group.name = 'arenaRig';
  const queryOf = (k) => { try { return ctx.query?.get?.(k) ?? null; } catch { return null; } };
  const flags = String(queryOf('clubrig') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const room = appRoom ?? ctx.room ?? null;
  const lr = room?.lightRefs ?? null;
  const floor0 = Number.isFinite(floorY) ? floorY : (Number.isFinite(lr?.floor?.position?.y) ? lr.floor.position.y : -0.79);
  const floorNow = () => (Number.isFinite(lr?.floor?.position?.y) ? lr.floor.position.y : floor0);
  let detail = [0, 1, 2].includes(club?.knobs?.roomDetail) ? club.knobs.roomDetail : 1;

  // ---- the plan, and the heads as emitters of the room light: registered at once (before the first await of the caller's
  // chain can pass), so the room's commit and its bake signature hold them
  const plan = rigPlan(A, { floorY: floor0 });
  const lamps = housePlan(A, { floorY: floor0 });
  const law = keepOut(plan, A, { floorY: floor0, house: lamps });
  // round A2: the second rectangle with its heads (no emitters), the perimeter truss, the roof steel
  // (round A4: the outer rectangle's washes are on standby, dark lenses, no tint from the palette: CONTRACT 16.1)
  const outer = outerPlan(A, { floorY: floor0 });
  const roof = roofPlan(A, { floorY: floor0 });
  // round A4: the house floods on drop pipes under the roof steel and the key lights' profile spots under the perimeter
  // truss (the fixtures; arena/room.js registers the floods as emitters and hands the keys to the bake, from the same plans)
  const floods = floodPlan(A, { floorY: floor0 }), keys = keyPlan(A, { floorY: floor0 });
  // ... and the wall washers: LED battens on the perimeter truss's outer upper chord (the shell's ask; bake-only emitters)
  const wallwash = wallWashPlan(A, { floorY: floor0 });
  const lawHall = hallKeepOut(outer, roof, A, { floorY: floor0, inVolume: typeof LAYOUT.inCameraVolume === 'function' ? LAYOUT.inCameraVolume : null });
  const emitterState = { share: A.emitters?.rig ?? 9, registered: [], error: null };
  try {
    if (typeof roomLight?.addEmitter === 'function') {
      for (const sp of plan.emitters) {
        roomLight.addEmitter({
          id: sp.id, type: sp.type, position: new THREE.Vector3(...sp.position), normal: new THREE.Vector3(...sp.normal), axis: new THREE.Vector3(...sp.axis),
          // (?clubrig=nowash: the same eight emitters at a level of nothing: the off arm of an on / off pair of the island's pool)
          size: sp.size.slice(), color: new THREE.Color(...sp.color), intensity: flags.includes('nowash') ? 1e-5 : sp.intensity, radius: sp.radius,
          // (round A3: the head's beam as a cone of the room light: room/light.js CONE; the room switches it on)
          cone: sp.cone, bell: sp.bell,
        });
        emitterState.registered.push(sp.id);
      }
    }
  } catch (e) { emitterState.error = String(e?.message ?? e); }

  // ---- what every part shares
  const shared = {
    roomLight,
    bed: { minX: -1.27, maxX: 1.27, minZ: -0.635, maxZ: 0.635, from: 'default', version: 0 },
    brightness: { value: 1 },
    bounce: { color: { value: new THREE.Color(1.7, 1.8, 2.1) }, table: { value: new THREE.Vector4(0, 0, 1.03, 0) } },
    log: { done: [], missed: [] },
    floorNow,
    // where the truss carries the housing: two cross pipes on the lower chords (world metres, for the live floor)
    hang() {
      const y0 = floorNow() + A.rig.bottomH, c = plan.chordOffset;
      const zl = A.rig.width / 2 - A.rig.section / 2, xs = A.rig.length / 2 - A.rig.section / 2;
      return {
        y: y0 + 2 * RIG.chordR + 0.024,
        z: { from: -(zl + c + 0.09), to: zl + c + 0.09, clamps: [-(zl + c), -(zl - c), zl - c, zl + c] },
        x: { from: -(xs + c + 0.09), to: xs + c + 0.09, clamps: [-(xs + c), -(xs - c), xs - c, xs + c] },
      };
    },
    cutY: () => (Number.isFinite(A.cut?.top) ? floorNow() + A.cut.top : Infinity),
  };

  if (flags.includes('off')) {
    // the room light is the same in both arms of a pair: the luminaire's spill is registered too
    const lum = createLuminaire({ ...club, ctx: { ...ctx, query: { get: (k) => (k === 'clublamp' ? 'off' : queryOf(k)) } } }, shared, { appRoom: room, spill, detail });
    const reason = 'off by ?clubrig=off';
    return {
      enabled: false, reason, group, emissives: [], update() {}, setTier() { return false; }, face: () => null,
      counts: () => ({ drawCalls: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0 }),
      state: () => ({ enabled: false, reason, emitters: { ...emitterState, registered: emitterState.registered.slice() }, luminaire: lum.state() }), dispose() {},
    };
  }

  // ---- the floor-fixed rig: truss, hardware, lenses, house lights ---------------------------------------------------------------
  const fixed = new THREE.Group();
  fixed.name = 'arenaRig.fixed';
  group.add(fixed);
  // (round A5: the lens texture is an atlas that also holds the screens' slides: only the layout's WORDS are written)
  const brushed = brushedTexture(), lensTex = lensTexture(Array.isArray(LAYOUT.WORDS) ? LAYOUT.WORDS.slice() : [], PAL.board ?? '#0c1a33');
  // black powder coat (cans, yokes, hoists, roof steel's base): the layout's albedo table, a hair toward blue
  const coat = Number.isFinite(LAYOUT.ALBEDO?.seatShell) ? LAYOUT.ALBEDO.seatShell : 0.04;
  const BLACK_COAT = new THREE.Color().setRGB(coat * 0.99, coat, coat * 1.05);
  const uWash = { value: flags.includes('nowashlight') ? 0 : 1 }; // (?clubrig=nowashlight: the off arm of the steel's wash)
  const bounce = (mirror) => ({ color: shared.bounce.color, table: shared.bounce.table, mirror, wash: uWash });
  const uLensLaw = { value: new THREE.Vector4(...LENS_LAW) }, uLensShow = { value: 1 };
  const mats = {
    // mill-finish aluminium: mostly a mirror of what is around it (the lit table below, the emitters' highlights), with a
    // share of diffuse light so it stays grey where it mirrors the dark roof
    alu: patch(lit(roomLight, { color: PAL.truss ?? '#b9bcc2', roughness: 0.6, metalness: 0.8, roughnessMap: brushed, envMapIntensity: 0.55, vertexColors: true, hide: true, name: 'arena.rig.truss' }), { bounce: bounce(5) }, shared.log),
    // (round A3, the albedo law: a black powder coat at the table's value, not the palette's head black, which is 0.0033
    // linear: no real black paint is that dark. The vertex colours are factors on it: rig/truss.js, rig/steel.js)
    dark: patch(lit(roomLight, { color: BLACK_COAT, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.3, vertexColors: true, hide: true, name: 'arena.rig.black' }), { bounce: bounce(0.4) }, shared.log),
    // (the vertex colour is a head's tint, or a standby screen's level)
    lens: patch(glow(roomLight, { color: new THREE.Color(...RIG.wash.color), intensity: LENS_LEVEL, map: lensTex, hide: true, vertexColors: true, name: 'arena.rig.lens' }), { law: { law: uLensLaw, show: uLensShow, axis: 'normal' } }, shared.log),
  };
  const meshes = {};
  for (const k of ['alu', 'dark', 'lens']) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mats[k]);
    mesh.name = `arenaRig.${k}`;
    meshes[k] = mesh;
    fixed.add(mesh);
  }
  // the wall lamps' housings (high tier only): below the hall's top cut, so a mesh of their own (the player views that
  // hold a wall lamp must not draw the truss and the roof for it); the dark material, each wall's own side mark
  const wallMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.dark);
  wallMesh.name = 'arenaRig.wall';
  wallMesh.visible = false;
  fixed.add(wallMesh);
  // Round A5 (CONTRACT 17.1: the walls fall to near black; 17.4: no sprite that turns to the camera). The small lamps
  // on the walls beside the seating are OFF and not built (plan.js RIG.house.wall.lit): they were camera-facing discs
  // with a painted halo that lit nothing (no emitter stood behind them), on walls that are dark now. The roof's bells
  // and the ring's cans are lit faces in the lens mesh (arena/rig/steel.js). So arena/rig/house.js draws nothing.
  const wallLamps = RIG.house.wall.lit === false ? [] : lamps.filter((l) => l.kind === 'wall');
  let trussCounts = null, steelCounts = null, houseCounts = null;
  function buildFixed() {
    // the table light's lit skirt on the truss above it: strongest over the box's long sides, falling with the distance
    // from its outline (the canopy's rectangle: the wash is a look, not a measurement, and need not follow the fixture)
    const housingGlow = (x, _y, z) => {
      const dx = Math.max(0, Math.abs(x) - 1.16), dz = Math.max(0, Math.abs(z) - 0.46), k = WASH.housing / (1 + (dx * dx + dz * dz) / 0.8);
      return [k, k * 0.96, k * 0.9];
    };
    const built = buildTruss(plan, { detail, outer: flags.includes('noouter') ? null : outer, wash: { inner: housingGlow, outer: WASH.outer } });
    const steel = flags.includes('nosteel') ? { wall: null, counts: null } : buildSteel(built.parts, roof, { detail, wash: WASH, wallLamps, lensLevel: LENS_LEVEL });
    // (?clubrig=nofloods leaves the six floods and the three key spots out of the picture; their light is the room's)
    if (!flags.includes('nosteel') && !flags.includes('nofloods')) houseCounts = buildHouseLights(built.parts, wallwash.floods?.length ? [...floods.floods, ...wallwash.floods] : floods.floods, keys.heads, { detail, wash: WASH.roof, color: HALL.floods.color, wallwash: wallwash.runs });
    const swap = (mesh, acc, side) => {
      const g = acc.geometry();
      // the hall's cut: every vertex carries its side mark (room/light.js drops a side while the camera is behind its plane)
      g.setAttribute('roomSide', new THREE.Float32BufferAttribute(typeof side === 'number' ? new Float32Array(g.attributes.position.count).fill(side) : side, 1));
      g.setAttribute('rigWash', new THREE.Float32BufferAttribute(washArray(acc), 3));
      const old = mesh.geometry;
      mesh.geometry = g;
      old.dispose();
    };
    for (const k of Object.keys(meshes)) swap(meshes[k], built.parts[k], SIDE_TOP);
    if (steel.wall && steel.wall.count) {
      // (24 + 2 x 5 vertices per lamp, in the lamps' order)
      const per = steel.wall.count / wallLamps.length, side = new Float32Array(steel.wall.count);
      wallLamps.forEach((l, i) => side.fill(LAYOUT.SIDE?.[l.wall] ?? 0, Math.round(i * per), Math.round((i + 1) * per)));
      swap(wallMesh, steel.wall, side);
      wallMesh.visible = !flags.includes('nohouse');
    } else wallMesh.visible = false;
    trussCounts = built.counts; steelCounts = steel.counts;
  }
  buildFixed();
  // (round A5: only the wall lamps are left to this mesh, and they are off: it is built empty and never drawn. No
  // painted halo in any case: `glare: 0`; a source's glare is the post chain's bloom)
  const house = buildHouse(wallLamps, { color: new THREE.Color(PAL.houseLight ?? '#fff4e0'), level: HOUSE_LEVEL, cutY: shared.cutY(), glare: 0 });
  house.mesh.visible = wallLamps.length > 0;
  fixed.add(house.mesh);
  // ---- haze cones in the beams: the high tier only; ?clubrig=haze:0 leaves them out (the off arm of their pair)
  const hazeOff = flags.includes('haze:0') || flags.includes('nohaze');
  let haze = null, hazeShown = true;
  let hazeTool = (() => { const w = Number((flags.find((f) => f.startsWith('washcone:')) ?? '').slice(9)); return w > 0 ? { wash: w } : null; })();
  function buildHazeNow() {
    if (haze) { fixed.remove(haze.mesh); haze.dispose(); haze = null; }
    if (hazeOff || detail < 2) return;
    // (round A5, CONTRACT 17.4: the house floods' beams show in the haze too: six cards more in the same draw call)
    // (round A7, tools: `?clubrig=washcone:<share>` gives the eight wash heads' cones that share for a pair (round A5 had
    // 0.5); `api.set({ hazeShare: { wash, profile, flood, key } })` sets a kind's share at run time: several arms in one job)
    const beams = hazeBeams(plan, flags.includes('noouter') ? null : outer, { floorY: floor0, ...(hazeTool ? { share: { ...HAZE.share, ...hazeTool } } : {}) });
    if (!flags.includes('nosteel') && !flags.includes('nofloods') && !(hazeTool && hazeTool.flood === 0)) beams.push(...floodBeams(floods));
    haze = buildHaze(beams, { level: HAZE.level, fall: HAZE.fall, cutY: shared.cutY() });
    haze.mesh.visible = hazeShown;
    fixed.add(haze.mesh);
  }
  buildHazeNow();
  if (flags.includes('notruss')) { meshes.alu.visible = false; meshes.dark.visible = false; }
  if (flags.includes('nolens')) meshes.lens.visible = false;
  if (flags.includes('nohouse')) house.mesh.visible = false;
  const houseShown = () => wallLamps.length > 0; // (what a tool may switch back on)

  // ---- per render: a part of the floor-fixed rig that the camera's frustum does not hold is not drawn. three culls by
  // bounding sphere, and the sphere of a 5 x 3 m frame (or of a field of lamps as wide as the hall) reaches into almost every
  // frustum: in the player views, which look down past the rig, it cost three or four draw calls and a few thousand
  // triangles for nothing on screen. A box test per part and per camera (scene.onBeforeRender runs before three collects
  // the render list); the parts' own `visible` flags (tools) are put back right after the render.
  const scene = ctx.scene?.isScene ? ctx.scene : null;
  const cull = { installed: false, renders: 0, culled: 0, hazeOutOfCube: 0, error: null };
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), cullBox = new THREE.Box3(), cullStack = [];
  const cullParts = () => (haze ? [meshes.alu, meshes.dark, meshes.lens, house.mesh, wallMesh, haze.mesh] : [meshes.alu, meshes.dark, meshes.lens, house.mesh, wallMesh]);
  // Every part is tested group by group, never by one box: a box over the roof steel, the perimeter truss and the table's rig
  // together is the whole hall from 3.2 m up, which a player view that holds one wall lamp is inside of. The groups (world
  // metres at the build's floor height): the table's rig with its chains up to the rigging beams; the perimeter truss run
  // by run, with its cans below and its wires above; the roof steel; the wall lamps wall by wall.
  // (The house lights were tested like this from round A1: the top view paid a draw call for lamps on the walls: app job a7.)
  const B3 = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  const O = HALL.outer, PMT = HALL.perimeter;
  // (round A4: 0.75 -> 1.2 m around the outer rectangle: the house floods hang 0.8 m outside it, under the same roof steel)
  const tableBox = B3(-O.length / 2 - 1.2, floor0 + A.rig.bottomH - 0.05, -O.width / 2 - 1.2, O.length / 2 + 1.2, floor0 + hoistTopH() + 0.3, O.width / 2 + 1.2);
  const roofBox = B3(A.hall.x0, floor0 + HALL.roof.mouthH - 0.1, A.hall.z0, A.hall.x1, floor0 + A.hall.height, A.hall.z1);
  const perimeterBoxes = roof.perimeter.runs.map((r) => {
    const lo = floor0 + PMT.h - PMT.lampDrop - 0.1, hi = floor0 + HALL.roof.purlinH, w = PMT.section / 2 + 0.6;
    return r.axis === 0 ? B3(r.from - 0.3, lo, r.at - w, r.to + 0.3, hi, r.at + w) : B3(r.at - w, lo, r.from - 0.3, r.at + w, hi, r.to + 0.3);
  });
  const houseBoxes = [], wallBoxes = [];
  {
    const groups = new Map(), p = new THREE.Vector3();
    for (const l of wallLamps) {
      const key = l.kind === 'roof' ? 'roof' : l.kind === 'ring' ? (Math.abs(l.z) > PMT.z - 0.4 ? (l.z < 0 ? 'ring.n' : 'ring.s') : 'ring.e') : `wall.${l.wall ?? 'x'}`;
      if (!groups.has(key)) groups.set(key, new THREE.Box3());
      groups.get(key).expandByPoint(p.set(l.x, l.y, l.z));
    }
    for (const [key, b] of groups) { b.expandByScalar(0.45); houseBoxes.push(b); if (key.startsWith('wall.')) wallBoxes.push(b); }
  }
  meshes.alu.userData.cullBoxes = [tableBox, ...perimeterBoxes];
  meshes.dark.userData.cullBoxes = [tableBox, ...perimeterBoxes, roofBox];
  // (round A5: the lens mesh also holds the roof bells' lit mouths)
  meshes.lens.userData.cullBoxes = [tableBox, ...perimeterBoxes, roofBox];
  house.mesh.userData.cullBoxes = houseBoxes;
  wallMesh.userData.cullBoxes = wallBoxes;
  // (the beams: from the rig's plane down to the carpet, as far out as the colour washes reach)
  // (round A5: and the house floods' beams, from 5.8 m over the boards' line out over the lower rows)
  const hazeBoxes = [B3(-O.length / 2 - 3.6, floor0, -O.width / 2 - 3.6, O.length / 2 + 3.6, floor0 + A.rig.bottomH + 1.0, O.width / 2 + 3.6),
    B3(A.island.x0 - 0.5, floor0 + 2.0, A.island.z0 - 4.2, A.island.x1 + 4.2, floor0 + HALL.floods.h + 0.3, A.island.z1 + 4.2)];
  let cullBefore = null, cullAfter = null, prevCullBefore = null, prevCullAfter = null;
  if (scene) {
    prevCullBefore = scene.onBeforeRender; prevCullAfter = scene.onAfterRender;
    cullBefore = scene.onBeforeRender = function arenaRigCullBefore(r, s, cam, rt) {
      if (typeof prevCullBefore === 'function') prevCullBefore.call(this, r, s, cam, rt);
      let rec = null;
      try {
        if (!cull.error && cam?.isCamera) {
          cull.renders += 1;
          projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
          frustum.setFromProjectionMatrix(projView);
          // a camera at or above the hall's top cut: the room light moves these parts out of the clip volume in the vertex
          // shader, so they would be drawn for nothing
          const above = cam.matrixWorld.elements[13] >= shared.cutY();
          for (const m of cullParts()) {
            if (!m.visible) continue;
            // (the house lights' mesh also holds the wall lamps, which stand below the cut: its own shader drops the rest;
            // the wall lamps' housings stand below it too)
            if (above && m !== house.mesh && m !== wallMesh) { m.visible = false; (rec ??= []).push(m); cull.culled += 1; continue; }
            // haze is never in an environment capture (a cube render): it is air in front of the player's eye, not a light
            if (haze && m === haze.mesh && cam.parent?.type === 'CubeCamera') { m.visible = false; (rec ??= []).push(m); cull.hazeOutOfCube += 1; continue; }
            let hit = false;
            for (const b of (haze && m === haze.mesh ? hazeBoxes : m.userData.cullBoxes) ?? []) {
              cullBox.copy(b); cullBox.min.y += fixed.position.y; cullBox.max.y += fixed.position.y;
              if (frustum.intersectsBox(cullBox)) { hit = true; break; }
            }
            if (!hit) { m.visible = false; (rec ??= []).push(m); cull.culled += 1; }
          }
        }
      } catch (e) { cull.error = String(e?.message ?? e); }
      cullStack.push(rec);
    };
    cullAfter = scene.onAfterRender = function arenaRigCullAfter(r, s, cam) {
      const rec = cullStack.pop();
      if (rec) for (const m of rec) m.visible = true;
      if (typeof prevCullAfter === 'function') prevCullAfter.call(this, r, s, cam);
    };
    cull.installed = true;
  }

  // ---- the table light's housing (the venue's luminaire) --------------------------------------------------------------------------
  const lum = createLuminaire(club, shared, { appRoom: room, spill, detail });
  if (lum.group) group.add(lum.group);
  if (flags.includes('nowashlight')) lum.setWash?.(false);

  // ---- per frame ---------------------------------------------------------------------------------------------------------------------
  const tmpBox = new THREE.Box3(), clothBox = new THREE.Box3();
  function readBed() {
    const bed = shared.bed;
    let got = false;
    try {
      clothBox.makeEmpty();
      const root = ctx.table?.group?.isObject3D ? ctx.table.group : (ctx.scene?.isScene ? ctx.scene : null);
      root?.traverse?.((o) => {
        if (!o.isMesh || !o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (!ms.some((m) => m?.userData?.obClass === 'cloth')) return;
        tmpBox.setFromObject(o);
        if (!tmpBox.isEmpty()) clothBox.union(tmpBox);
      });
      const w = clothBox.max.x - clothBox.min.x, d = clothBox.max.z - clothBox.min.z;
      if (!clothBox.isEmpty() && w > 1 && w < 5 && d > 0.5 && d < 3) {
        got = true;
        if (bed.minX !== clothBox.min.x || bed.maxX !== clothBox.max.x || bed.minZ !== clothBox.min.z || bed.maxZ !== clothBox.max.z) bed.version += 1;
        bed.minX = clothBox.min.x; bed.maxX = clothBox.max.x; bed.minZ = clothBox.min.z; bed.maxZ = clothBox.max.z; bed.from = 'cloth';
      }
    } catch { got = false; }
    if (!got && bed.from === 'default' && tableBounds && Number.isFinite(tableBounds.minX)) {
      const k = (A.keepOut?.strokeRoom ?? 1.55) + 0.18; // the keep-out rectangle is the table plus the stroke room; the rails are about 0.18 m
      const b = { minX: tableBounds.minX + k, maxX: tableBounds.maxX - k, minZ: tableBounds.minZ + k, maxZ: tableBounds.maxZ - k };
      if (b.maxX - b.minX > 1 && b.maxZ - b.minZ > 0.5) { Object.assign(bed, b, { from: 'tableBounds' }); bed.version += 1; }
    }
  }
  function readBrightness() {
    try { const b = win?.__lighting?.state?.()?.brightness; if (Number.isFinite(b)) shared.brightness.value = Math.min(1.6, Math.max(0.4, b)); } catch { /* no lighting layer: 1 */ }
  }
  const parentInv = new THREE.Matrix4();
  const bounceTint = new THREE.Color(0.8, 0.87, 1.0), WARM_WHITE = new THREE.Color(1.0, 0.9, 0.74);
  let ticks = 0, bedAt = 0, brightAt = 2, lastError = null;
  group.matrixAutoUpdate = false;
  function tick(_clock, dt) {
    ticks += 1;
    // a render that threw between the two hooks left its record behind: put those parts back (a tick is never inside a render)
    while (cullStack.length) { const rec = cullStack.pop(); if (rec) for (const m of rec) m.visible = true; }
    try {
      // the rig is built in world metres: it cancels whatever its parent group does (the hall may follow the floor with its
      // group), and follows the app's floor itself (the floor re-seats per table class; the housing stays bed-relative)
      const parent = group.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        parentInv.copy(parent.matrixWorld).invert();
        if (!group.matrix.equals(parentInv)) { group.matrix.copy(parentInv); group.matrixWorldNeedsUpdate = true; }
      }
      const dy = floorNow() - floor0;
      if (fixed.position.y !== dy) fixed.position.y = dy;
      house.uniforms.uCutY.value = Number.isFinite(shared.cutY()) ? shared.cutY() : 1e9;
      if (haze) { haze.uniforms.uCutY.value = house.uniforms.uCutY.value; haze.uniforms.uShow.value = shared.brightness.value > 0 ? 1 : 0; }
      if (ticks >= bedAt) { readBed(); bedAt = ticks + 600; }
      if (brightAt >= 0 && ticks >= brightAt) { readBrightness(); brightAt = brightAt === 0 ? -1 : ticks + 600; }
      // the table under the rig: its outline as a disc of the same area, and its colour as light from below
      const bed = shared.bed;
      shared.bounce.table.value.set((bed.minX + bed.maxX) / 2, (bed.minZ + bed.maxZ) / 2, ((bed.maxX - bed.minX) * (bed.maxZ - bed.minZ)) / Math.PI, 0);
      if (ticks % 120 === 1) {
        let cloth = null;
        try { cloth = club?.adopt?.find?.('cloth')?.[0]?.color ?? null; } catch { cloth = null; }
        // (three parts warm white to one part cloth: at equal parts a blue cloth turned the aluminium into blue-painted steel)
        if (cloth?.isColor) bounceTint.copy(cloth).lerp(WARM_WHITE, 0.75); else bounceTint.setRGB(0.86, 0.86, 0.84);
        bounceTint.multiplyScalar(1 / Math.max(bounceTint.r, bounceTint.g, bounceTint.b, 1e-3));
      }
      shared.bounce.color.value.copy(bounceTint).multiplyScalar(BOUNCE_M * shared.brightness.value);
      uLensShow.value = shared.brightness.value > 0 ? 1 : 0;
    } catch (e) {
      if (!lastError) console.warn('[club] arena rig: frame update failed:', e);
      lastError = String(e?.message ?? e);
    }
    lum.tick(dt);
  }
  const onRelight = () => { brightAt = ticks + 2; bedAt = Math.min(bedAt, ticks + 30); };
  const EVENTS = ['ob:settings', 'ob:relight', 'ob:table-state'];
  try { for (const t of EVENTS) win?.addEventListener?.(t, onRelight); } catch { /* no window events */ }
  let selfDriven = false;
  if (typeof club?.onFrame === 'function') { try { club.onFrame(tick); selfDriven = true; } catch { selfDriven = false; } }
  tick(0, 0);

  const geomCounts = (mesh) => {
    const g = mesh.geometry;
    return g?.index ? { triangles: g.index.count / 3, vertices: g.attributes.position.count } : { triangles: 0, vertices: 0 };
  };
  return {
    enabled: true,
    group,
    // bloom and bokeh sources: the diffuser and the lit seam (first: the reflection service finds the face among them by its
    // name), the heads' lenses, the house lights
    emissives: [...lum.emissives, meshes.lens, house.mesh],
    /** Per frame (CONTRACT.md 9.2). The module also drives itself through club.onFrame, so a second call in a frame is free;
     * `dt` is read only when it does not (dev pages). The housing's state is decided at render time, from the render's camera. */
    update(camera, dt) {
      lum.hint(camera);
      if (!selfDriven) tick(0, dt);
    },
    setTier(tier) {
      const d = tier === club?.tier && [0, 1, 2].includes(club?.knobs?.roomDetail) ? club.knobs.roomDetail : TIER_DETAIL[tier];
      if (![0, 1, 2].includes(d)) return false;
      if (d !== detail) { detail = d; buildFixed(); buildHazeNow(); lum.setDetail(d); }
      return true;
    },
    counts() {
      const parts = {};
      let drawCalls = 0, triangles = 0, vertices = 0;
      for (const k of Object.keys(meshes)) { const c = geomCounts(meshes[k]); parts[k] = c; if (meshes[k].visible) { drawCalls += 1; triangles += c.triangles; vertices += c.vertices; } }
      parts.house = { triangles: house.triangles, vertices: house.count * 4, lamps: house.count };
      if (house.mesh.visible) { drawCalls += 1; triangles += house.triangles; vertices += house.count * 4; }
      parts.wall = wallMesh.visible ? geomCounts(wallMesh) : { triangles: 0, vertices: 0 };
      if (wallMesh.visible) { drawCalls += 1; triangles += parts.wall.triangles; vertices += parts.wall.vertices; }
      parts.haze = haze && haze.mesh.visible ? { triangles: haze.triangles, vertices: haze.count * 4, cones: haze.count } : { triangles: 0, vertices: 0, cones: 0 };
      if (haze && haze.mesh.visible) { drawCalls += 1; triangles += haze.triangles; vertices += haze.count * 4; }
      const lc = lum.counts();
      parts.housing = lc;
      // `drawCalls` = per scene render while the housing is solid; `drawn` = what the player's view draws now
      return {
        drawCalls: drawCalls + lc.drawCalls, drawn: drawCalls + (lc.drawn ?? 0), triangles: triangles + lc.triangles, vertices: vertices + lc.vertices,
        materials: 4 + (haze ? 1 : 0) + lc.materials, textures: 2 + lc.textures, textureBytes: TEX_BYTES.brushed + TEX_BYTES.lens + (lc.textures ? TEX_BYTES.face : 0),
        emitters: emitterState.registered.length + (lum.enabled ? lum.state().spill.registered.length : 0), detail, members: trussCounts, steel: steelCounts, parts,
      };
    },
    /** What a bake of the room depends on in this part (the hall's bake signature takes it): the truss's place, the heads and
     * the emitters, heights above the floor. A plain value; it moves only when the plan moves. */
    signature() { return rigSignature(A); },
    /** The rig's emitters that only the BAKE takes (round A3: the outer rectangle's colour washes, rig/plan.js
     * HALL.outer.colours.emit), as emitter specs of the room light's form. Nothing is registered by this; the room hands
     * them to the bake. `?clubrig=nowash` leaves them out with the heads' light. */
    bakeEmitters() {
      const out = [];
      // (round A4) the luminaire's own glow, `lamp.band`: the canopy's geometry (what the club look bakes), this lamp's
      // colour and level. It is no run-time emitter of the arena any more (the room calls with `spill: false`): the 24
      // run-time slots hold the heads, the house floods and the other parts' emitters, and the lite tier's twelve are
      // never exceeded by a re-registration. The room levels it (its LAMP_BAND).
      if (!spill) {
        try {
          for (const sp of lampSpillBaked()) out.push({
            id: sp.id, type: sp.type, position: new THREE.Vector3(...sp.position), normal: null, axis: new THREE.Vector3(...sp.axis),
            size: sp.size.slice(), color: new THREE.Color(...BAND.color), intensity: BAND.intensity, radius: BAND.radius,
          });
        } catch { /* no band in the bake */ }
      }
      // (round A5) the hanging screens' spill (plan.js HALL.screens.spill): a rect emitter of the screen's size just in
      // front of its lit face, at the slide's mean radiance in the room light's units. BAKE ONLY: an emitter each at run
      // time would be too much for what they light (0.03 units 3 m in front of one: under one level of 255).
      if (!flags.includes('nosteel')) {
        const SC = HALL.screens, L = (SC.white * SC.mean) / 0.728;
        roof.screens.forEach((s, i) => {
          const alongX = s.axis === 0, n = alongX ? [0, 0, s.face] : [s.face, 0, 0];
          out.push({
            id: `rig.screen.${i}`, type: 'rect', position: new THREE.Vector3(s.c[0] + n[0] * (s.t / 2 + SC.spill.off), s.c[1], s.c[2] + n[2] * (s.t / 2 + SC.spill.off)),
            normal: new THREE.Vector3(...n), axis: new THREE.Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1), size: [s.w, s.h],
            color: new THREE.Color(...SC.tint), intensity: L, radius: SC.spill.radius,
          });
        });
      }
      if (flags.includes('nowash')) return out;
      for (const sp of outer.emitters) out.push({
        id: sp.id, type: sp.type, position: new THREE.Vector3(...sp.position), normal: null, axis: new THREE.Vector3(...sp.axis),
        size: sp.size.slice(), color: new THREE.Color(...sp.color), intensity: sp.intensity, radius: sp.radius, cone: sp.cone, bell: sp.bell,
        // (round A6: a table key's shutter: plan.js tableKeyShutter; the bake's law: bake-room-core.mjs)
        ...(Array.isArray(sp.shutter) ? { shutter: sp.shutter.slice() } : {}), ...(Array.isArray(sp.foot) ? { foot: sp.foot.slice() } : {}),
        ...(Array.isArray(sp.sides) ? { sides: sp.sides.map((n) => n.slice()) } : {}),
      });
      return out;
    },
    /** The diffuser as plain data (the shape of room/lamp/face.js lampFace, with `law` and `color`): the wood part's lamp
     * image reads it. null while the housing is not built. */
    face() { return lum.face(); },
    /** The housing's glow as room-light emitter specs for the current emitters (nothing is registered by this). */
    spill() { return lum.enabled ? lum.spill() : []; },
    /** Pin the housing's state ('solid' | 'absent') or hand it back to the rule (null). */
    force(v) { lum.force(v); },
    /** Tools: the housing's `view` policy; `parts: { truss, lens, house }` booleans (what is drawn). */
    set(o = {}) {
      if (o.parts && typeof o.parts === 'object') {
        if (typeof o.parts.truss === 'boolean') { meshes.alu.visible = o.parts.truss; meshes.dark.visible = o.parts.truss; }
        if (typeof o.parts.lens === 'boolean') meshes.lens.visible = o.parts.lens;
        if (typeof o.parts.house === 'boolean') house.mesh.visible = o.parts.house && houseShown();
      }
      // (tools: the steel's wash on / off: the off arm of its pair)
      if (typeof o.wash === 'boolean') { uWash.value = o.wash ? 1 : 0; lum.setWash?.(o.wash); }
      // (tools: the haze cones shown or not: the off arm of their pair)
      if (typeof o.haze === 'boolean') { hazeShown = o.haze; if (haze) haze.mesh.visible = o.haze; }
      if ('hazeShare' in o) { hazeTool = o.hazeShare && typeof o.hazeShare === 'object' ? { ...o.hazeShare } : null; buildHazeNow(); }
      return lum.set(o);
    },
    state() {
      const ls = lum.state();
      return {
        // the luminaire's own record at the top level, as room/lamp.js gives it (other services read `state().face.law`)
        ...ls,
        enabled: true, detail, floorY: floorNow(), built: { y0: plan.y0, y1: plan.y1 },
        luminaire: { enabled: lum.enabled, reason: lum.reason ?? null },
        keepOut: { ...law }, keepOutHall: { ...lawHall }, signature: rigSignature(A),
        heads: plan.heads.map((h) => ({ id: h.id, pos: h.pos, aim: h.aim, lowest: h.lowest })),
        outer: { y0: outer.y0, heads: outer.heads.length, profiles: outer.heads.filter((h) => h.kind === 'profile').length, colours: outer.heads.filter((h) => h.kind === 'colour').length },
        roof: { trusses: roof.trusses.length, purlins: roof.purlins.length, fixtures: roof.fixtures.length, screens: roof.screens.length }, wash: uWash.value,
        houseLights: { floods: floods.floods.map((f) => ({ id: f.id, pos: f.pos, aim: f.aim, top: f.top, on: f.on })), keys: keys.heads.map((h) => ({ id: h.id, pos: h.pos, aim: h.aim })), built: houseCounts },
        haze: { built: !!haze, shown: !!haze && haze.mesh.visible, off: hazeOff, cones: haze?.count ?? 0, level: HAZE.level, peak: haze?.peak ?? 0, outOfCube: cull.hazeOutOfCube },
        emitters: { ...emitterState, registered: emitterState.registered.slice(), band: { ...BAND } },
        house: {
          lamps: house.count, roof: lamps.filter((l) => l.kind === 'roof').length, ring: lamps.filter((l) => l.kind === 'ring').length, wall: lamps.filter((l) => l.kind === 'wall').length,
          level: HOUSE_LEVEL, cutY: house.uniforms.uCutY.value,
        },
        patches: { done: shared.log.done.slice(), missed: shared.log.missed.slice() }, cull: { ...cull, depth: cullStack.length }, selfDriven, lastError: lastError ?? ls.lastError ?? null,
      };
    },
    dispose() {
      try { club?.offFrame?.(tick); } catch { /* no frame bus */ }
      try { for (const t of EVENTS) win?.removeEventListener?.(t, onRelight); } catch { /* nothing to remove */ }
      try { lum.dispose(); } catch { /* the housing keeps what it holds */ }
      // hand the scene's hooks back when nobody chained on top of ours (else they stay, as pass-throughs); the housing's
      // hook was installed after this one, so it went first
      cull.error = 'disposed';
      try { if (scene && scene.onBeforeRender === cullBefore) scene.onBeforeRender = prevCullBefore; if (scene && scene.onAfterRender === cullAfter) scene.onAfterRender = prevCullAfter; } catch { /* the hooks stay */ }
      group.parent?.remove(group);
      for (const k of Object.keys(meshes)) { meshes[k].geometry.dispose(); mats[k].dispose(); }
      wallMesh.geometry.dispose();
      if (haze) haze.dispose();
      house.dispose(); brushed.dispose(); lensTex.dispose();
    },
  };
}

export { rigPlan, housePlan, keepOut };
