// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/room.js — the room service of the `arena` venue (CONTRACT.md sections 13.4 to 13.7, 14.2). Owner: bake (A1: hall).
// Round A2: a third part (`./floor.js`, buildFloor: the event furniture; `parts.floor`), the house panels over the seating
// (HOUSE below: the bake role's emitters), and the bake's signature in three layers (the layout refuses a map, a part that
// moved or a level that changed is reported and the map stays: see `signature` below).
//
// The club look with another room: a tournament hall before the doors open. It follows ../room.js step by step and returns
// the same object, so the reflection, occlusion, post, material and motion services read it as they read the club room:
//   - the floor height is the app room's (read, never copied); the hall's box is layout.js ARENA.hall on that floor;
//   - the app room's walls, floor, floor-shadow overlay and wall props are hidden; its lamp, luminaire meshes and three
//     lights stay exactly as they are. No three light is added, removed or changed; renderer.shadowMap is not touched;
//   - the hall itself is arena/shell.js (carpet and island, drape, roof, backdrop and its wash). Two parts come from other
//     owners by literal dynamic imports with bounded waits: `./rig.js` (buildRig: the truss, the table light's housing, the
//     lamp heads, the house lights; it is `parts.lamp`, the luminaire of this venue) and `./surround.js` (buildSurround:
//     boards, seating, scoreboard). Either may be missing, late or failing: the hall stands without it, and until the rig
//     exists the app's own luminaire stays visible as it is;
//   - light: room/light.js (the shared room-light service). Analytic first: a low, slightly cool ambient that is brighter
//     from above, the hall's emitters, the parts' emitters; baked when a bake made for THIS hall is in the manifest (ids
//     `arena.light`, `arena.light.lite`; its signature covers the layout, the charts, the emitters and the parts' plans,
//     so a bake made for another layout is refused and the analytic light stays);
//   - the floor is a matt carpet: the main lamp's pool and the table's shadow on it are the room light's floor terms, and
//     the occlusion service's floor map takes the shadow over when it is ready, as in the club room;
//   - the cut (layout.js ARENA.cut): the planes handed to the room light drop a seating block while the camera is inside
//     it and the rig while the camera is above its plane (materials made with `hide: true` on meshes that carry `roomSide`).
//
// Order: build everything under a hidden group -> wait (bounded) for the textures and the light map -> swap in one
// synchronous step (hide the app parts, show the hall, re-capture the environment cube), so no frame shows half a hall.
import * as THREE from 'three';
import { roomLight } from '../room/light.js';
import { createLightmap, signatureOf, LM_VERSION } from '../room/lightmap.js';
import { buildShell, HALL } from './shell.js';
import * as LAYOUT from './layout.js';
// (pure data: the places of the house floods and of the key lights' fixtures; the rig builds what a camera sees of them)
import { floodPlan, keyPlan, wallWashPlan, roofPlan, HALL as RIG_HALL } from './rig/plan.js';

const { ARENA, ARENA_LAYOUT_VERSION, cutPlanes } = LAYOUT;

export const LM_ID_ARENA = 'arena.light';
export const LM_ID_ARENA_LITE = 'arena.light.lite';
// bounded waits, as in ../room.js: counted from the start of the build and running side by side
const ASSET_WAIT_MS = 2500;     // the hall shows with stand-in textures / analytic light if the files are slower than this
const PART_WAIT_MS = 5000;      // a rig or a surround slower than this is added when it arrives
const TOOL_WAIT_MS = 45000;     // a capture tool (`?clubtimeout=` of 20 s or more) waits for every part
// The level of the rig's spill emitter (`lamp.band`: the luminaire's own glow, registered by the rig as ../room/lamp.js
// registers it). Its place and size are the rig's; its level is part of the hall's light balance: under a black roof it
// lights the truss from below and nothing else, so it stays well under the club room's 2.0.
const LAMP_BAND = Object.freeze({ id: 'lamp.band', intensity: 0.8 });
/**
 * ROUNDS A2 AND A3 (history; replaced in round A4 by the house floods, HOUSE below):
 * The house light over the seating: "the house lights partly up", as a hall stands before the doors open (every row reads).
 * One broad downlight panel per seating block at the height of the rig's field of house lights (just under it, so no roof
 * steel stands between a panel and its seats), a little larger than the block's footprint is deep, turned away from the
 * island by `tilt` so the pool around the table stays the heads'. A panel is a rect emitter of the room light: `level` is
 * its radiance (the app's light units), `reach` the distance at which its light has faded out (the island's middle).
 * The room registers `runtime` of them on the room light (the bake role's share of CONTRACT 14.2: two emitters; they give
 * the analytic light and the highlights); the bake takes all of them (`room.bakeEmitters`): under the baked light every
 * block is lit, with the soft shadow of each row on the one behind and below it. Tools: `?arenahouse=key:value,...`.
 */
// Levels (set against the first bakes, 00:40Z): at 0.9 / tilt 0.45 / reach 15 the panels put 1.2 units on the island's edge,
// where the heads leave 2.4: the pool around the table went flat (carpet at the board line 95 of 255 against 123 beside the
// table). Turned further out and cut shorter they leave about a third of that there and the same light on the seats.
// Level 0.9 -> 1.2 (01:15Z): under the bake of 00:47Z the seats' pads stood at 8 to 24 of 255 at V10 (north row 5: 8, east
// row 1: 12): every row read, quietly; the photographs of halls with the house lights partly up show the rows clearly.
// Round A3 (the albedo law): 1.2 -> 0.88. The seat fabric went from 0.066 (garnet) to 0.09 (graphite): 0.066 / 0.09 = 0.73
// keeps the pads where A2 had them (pans 1.04 to 1.42 units on 0.09: 26 to 35 of 255 before any bounce).
//
// ROUND A4 (CONTRACT 16.1, 16.2): THE HOUSE FLOODS. The three panels are gone: a panel over a block's middle lit pans and
// decks and reached no face of rows 1 and 2 (the first row stood at 11 to 24 of 255). Six floodlights hang on drop pipes
// under the roof steel just inside the boards' line and are aimed out at the seating, two per block (the fixtures and
// the places: arena/rig/plan.js HALL.floods, floodPlan(); the arithmetic is there). This module registers them with the
// room light, ALL SIX AT RUN TIME on the high and the base tier, and they are in the bake: the frame without the light
// map is lit by the same sources as the frame with it. `gain`: a factor on the plan's candela (north and south 115, east
// 90: HALL.floods; 1 = as planned; a tool's `?arenahouse=gain:0` is the off arm of a pair). `lite`: the three the lite tier
// keeps at run time (its twelve: the eight heads, the backdrop's wash and these: the blocks the play views face); the
// other three are in its file.
export const HOUSE = Object.freeze({ gain: 1, lite: Object.freeze(['n0', 'n1', 'e0']) });
/**
 * The key lights (round A3): four profile lights, one toward each side of the table, low and far.
 *   north, south  AT a can of the perimeter truss over the upper seating (arena/rig/plan.js roofPlan: the lit can at
 *                 x = -0.6275 on both runs, its mouth 4.80 m over the floor);
 *   east          AT a can of that truss's east run (x = 11, z = -2.29: the can at z = 0 hangs behind the run's screen);
 *   west          the hall has no truss there: on the top of the backdrop's frame (6 m), 0.3 m in front of the cloth and
 *                 0.2 m over its top edge. No fixture is modelled there (the shell's part) and no review pose holds that
 *                 edge: said in the round's report.
 * Each emitter stands `drop` below its can's mouth (clear of the can's own wall) and is aimed across the table at the
 * carpet `past` metres beyond the table's middle.
 * Why they exist. (1) Light at a LOW ANGLE is the only thing that reaches the carpet under the table. A bounce cannot:
 * the body's underside is black (0.04) and sees lit carpet over 18 % of its hemisphere, so it returns 0.13 x 3.0 x 0.18 x
 * 0.04 = 0.003 units. The heads stand over the island's rim and reach 0.16 m under the body's edge. A key 10 m out and
 * 4.75 m up arrives at 25 degrees and passes 0.51 / tan 25 = 1.06 m under the edge of a body 0.51 m clear of the floor: the
 * north and south keys together reach the whole floor under a 1.6 m wide table. (2) A hall lit for cameras holds the
 * VERTICAL light at the table at a half to two thirds of the horizontal; with downlights alone the table's sides stood in a
 * fifth of the carpet's light (the table role's measurement, 03:40Z): a low key puts cot(25 degrees) = 2.1 times more on a
 * face that looks at it than on the floor.
 * Levels, by arithmetic and from the first A3 bake's file (scratch/light/cone.mjs, probe.mjs of the lane). The two ends
 * are tied: what a key puts on an apron it also puts, divided by 2.1, on the carpet under the table, and that carpet is
 * to stay dim (15 to 30 of 255: 0.42 to 0.85 units on the island's 0.13). North and south at 110 candela: 1.4 units on a
 * long apron, 0.43 under the table (0.77 where the two overlap), 0.61 beside the table on the key's own side. East 110:
 * 0.93 on the foot apron, 0.56 on the carpet 1 m behind the foot rail. West 100 (it stands higher and nearer: 37 degrees):
 * 0.96 on the head apron, 0.93 on the carpet 1 m behind the head rail, 0.59 m under the head end. Round A2 had 0.19 units
 * under the table (4 of 255).
 * `cone` 12 degrees: a north or south key's beam ends 3 m from the table's middle on its own side, where the boards'
 * shadow from it begins, and inside the far boards. `source` 0.35 m: the radius the bake casts its shadows from (a
 * profile light behind a frost, or two side by side): the table's shadow from a key has an edge about 0.15 m wide on the
 * carpet. At 0.1 (the first A3 bake, app frame shots/light/a1-V10.jpg) the shadow was a dark parallelogram with a razor edge.
 * BAKE ONLY: the room light's 24 run-time emitters are taken, so the analytic light has no key (as with `house.south`).
 * Tools: `?arenakey=north:0,south:0,east:0` (the off arm of a pair; a level per key).
 * ROUND A4. (1) THREE keys, each AT A FIXTURE: a profile spot under the perimeter truss's inner lower chord beside the
 * can named above (arena/rig/plan.js HALL.keys, keyPlan(): the emitter stands at the spot's lens and is aimed along its
 * axis). The west key is gone: it had no fixture, and with it three keys overlapped under the head end (48 of 255 on
 * that carpet against the 15 to 30). (2) 110 -> 90 candela: the hall's ambient now adds 0.5 units beside the table, and
 * the anchor there does not move. (3) A SOFT BEAM: the profile's flat field with its short edge drew a patch with an
 * edge on the carpet 3 m from the table (the shell's finding); now a bell of 17 degrees (the same light on the axis,
 * falling smoothly to nothing 3.4 m off it at the table), and the bake casts its shadows from a source of 0.45 m (two
 * spots behind a frost: the table's shadow from a key has an edge about 0.2 m wide). The analytic frame, which has no
 * key, carries their light beside the table in the lamp pool's gain (layout.js LIGHT.poolGainAnalytic).
 */
// (90 -> 80 after the first A4 trial bake, 06:06Z: the carpet under the table's middle stood at 0.85 units, 31 of 255,
// the top of the 15 to 30; at 80 it is 0.77, and the carpet 1 m beside the long rail keeps 2.9 of its 3.0 units)
// ROUND A5 (CONTRACT 17.1, 17.2: the carpet under the table 15 to 30 of 255 with a shadow edge that reads; round A4
// stood at 31 to 37). WHAT FILLED THE TABLE'S SHADOW WERE THESE KEYS: round A4's file held 0.29 to 0.77 units under the
// table, of which a long side's key was 0.43 and the two together 0.77 (they arrive at 25 degrees and reach 1.06 m under
// the body: built in round A3 to do exactly that); the ambient's open share was 0.06 to 0.12, the heads 0.08 at the
// edge, the floods and the carpet's bounce nothing. 80 -> 45 candela: 0.16 to 0.43 units of key under the table, and the
// pool beside it is the heads' now (rig/plan.js RIG.wash: 15.5 candela, steep, 0.3 m source: the shadow's edge is theirs).
// The colour is the rig's neutral (about 5200 K; it was 1.0, 0.95, 0.86).
export const KEY = Object.freeze({
  north: 45, south: 45, east: 45,
  cone: 17, bell: true, reach: 40, source: 0.45, tint: [1.0, 0.97, 0.92],
});
/**
 * ROUND A6 (CONTRACT 18.1: the table in the pool). The island's keys are now four profile spots of the outer rectangle,
 * two at the south-west corner and two at the north-east at a half (arena/rig/plan.js HALL.tableKeys: the rig's plan
 * holds their places, levels and shutters and hands them to the bake as `key.sw.s`, `key.sw.w`, `key.ne.n`, `key.ne.e`:
 * the ONLY records whose id starts with `key.`: the table's body reads them, mat/wood.js). The three spots under the
 * perimeter truss stay where they are as the FAR FILL: `fill.north`, `fill.south`, `fill.east`, at the plan's `far`
 * candela (30; round A5: 45). They arrive at 25 degrees and reach the whole carpet under the table: at 30 candela
 * 0.27 units each where one reaches, which with the ambient's open share holds that carpet at 15 to 30 of 255 while
 * the steeper table keys stop at the cabinet's shadow line. Tools: `?arenakey=north:0,...` as before.
 */
export const KEY_FILL = Object.freeze({ ...KEY, north: RIG_HALL.tableKeys.far, south: RIG_HALL.tableKeys.farSouth ?? RIG_HALL.tableKeys.far, east: RIG_HALL.tableKeys.far });
/**
 * ROUND A6 (CONTRACT 18.1: the stand camera heads at 25 to 45 of 255 with a lit edge; the floor role's row, agreed
 * 12:27Z / 12:33Z). A WORK LIGHT per camera platform, as a production clips one on a platform's rail: a small can on a
 * mast at the platform's corner, tipped at the camera's head from 1.0 m (the places: layout.js ARENA.floor.workLights;
 * the floor part builds the mast and the can there). Why near: a camera body (0.04) and the drape behind it (0.035)
 * under one light read one level; a source 1 m from the head puts 3 units on it and 0.2 on the drape 3.8 m behind.
 * BAKE ONLY, on every tier that builds the camera (`lite`: the cameras the lite tier builds). `intensity` candela on the
 * axis, a bell of `cone` degrees, warm white.
 */
// (`off`: the emitter stands this far down the beam from the lit face, clear of the can the floor part builds there. In
// the trial bake of 12:58Z the one camera whose can was already built, n1, took nothing from its lamp (0.95 units on
// the head, as without it; n2 and e1, not built yet: 2.8 and 2.0): the emitter sat inside the can.)
// (14:08Z, after the half-way bake: `cone` 50 -> 75 and `off` 0.12 -> 0.20. A camera's head reads the light VOLUME, whose
// cells are 0.8 m: a 50 degree beam is 0.4 m wide at the head and fell between the cell centres at n1 and ne (1.1 and
// 0.85 units on those heads against 3.07 at n2 and 2.2 at e1 under the same lamp). A work lamp is a small flood.)
export const WORK = Object.freeze({ on: true, intensity: 3, cone: 75, bell: true, reach: 4, source: 0.04, off: 0.20, tint: Object.freeze([1.0, 0.90, 0.74]), lite: Object.freeze(['n1']) });
// (14:21Z, the trial `t4`: n2 3.6 units and e1 2.4 on the head, n1 1.3 and ne 1.26 under the same lamp: at those two
// platforms the volume's cell centre nearest to the head lies INSIDE the head; the bake fills such a cell from its
// neighbours, which stand in the lamp's fringe. Their lamps are stronger by this factor: light, not a view rule; the
// deck and the mast take the same factor, as under a stronger lamp.)
export const WORK_GAIN = Object.freeze({ n1: 2.6, ne: 2.6 });
/**
 * ROUND A6b (the lead's order of 16:07Z: the cabinet's shadow is ONE piece that begins at the table's outline; no key
 * puts direct light on the floor under the cabinet). The final bake of 15:08Z lit the carpet under the skirts from
 * the four table keys (the strip to the cabinet's shadow line, 0.36 to 0.49 m inside the outline) and, as in every
 * round, from the eight heads (0.27 to 0.41 m inside): the legs' feet stood in the pool and the shadow began half a
 * metre inside. Now, in the BAKE only:
 *   `skip`   the four table keys are not baked at all: they light the table's body through the table's own material
 *            (its records, as before) and show their beam in the haze; nothing of them reaches the carpet;
 *   `match`  the eight heads and the ten profiles stop at the table's VALANCE: the carpet (an up-facing surface) inside
 *            the outline and under the skirt's lower edge (`skirt` metres over the floor) takes nothing from them, with
 *            an edge `soft` metres to each side of the outline (the outline's half extents `hx`, `hz`).
 * The three far fills (25 degrees) are NOT stopped: they are what holds the carpet under the table at 15 to 30 of 255,
 * evenly, with no edge at the legs. Faces that do not look up (a leg's side) keep the heads' light.
 *
 * ROUND A7 (CONTRACT 19.2: the table is an occluder in the bake). The valance (`match`) is GONE: the heads' and the
 * profiles' light is stopped by the table's own triangles and by nothing else (the six long-side heads now hang over
 * the table's long sides: arena/rig/plan.js RIG.head.over). `skip` stays: the four table keys arrive at 61 degrees
 * and would light the carpet 0.35 m under the skirt again; they light the table's body through its own material.
 */
export const UNDER = Object.freeze({ on: true, skip: Object.freeze(['key.']) });
/**
 * ROUND A6 (CONTRACT 18.1, 18.2: the roof lid and the roof steel are lit BY THE BAKE on every tier; round A5's two
 * stand-ins go: the shell's `bellUp` term on the lid and the rig's `roofPool` wash on the steel). Every LIT bell of the
 * roof's field (arena/rig/plan.js roofPlan: `kind: 'roof'`) gets one bake-only emitter at its top: a point that
 * radiates into the upper half space only (the room light's one-sided point: a broad lobe around +y), `roof.up.<n>`,
 * at the bell's own level x `perLevel` candela, with the bell's rim as its size (`source`: the near field is bounded,
 * E = I / (d^2 + source^2)) and a reach of `reach` metres. It lights the trusses' top chords beside it, the purlin it
 * hangs from and the lid above, with the purlin's and the trusses' shadows on the lid.
 * Honest arithmetic (LEVELS-A6.md of the lane): a bell's downward light is what the ambient's sky row stands for
 * (0.30 units on the open floor from 0.07 bells per square metre: 1.36 candela on its axis). A leak through top vents
 * (6 %) would be 0.08 candela and light nothing. The trial bake of 12:58Z at 1.2 candela held 0.46 units on the lid
 * beside the purlin over a bell, 0.65 on that purlin and on the truss's top chord beside it, 0.16 midway between two
 * bells; the row (CONTRACT 18.1: 30 to 45 of 255 near a lit fixture) asks for 1.2 to 1.9 units on a deck of 0.08. So:
 * 3.0 candela per unit of bell level: an UP-AND-DOWN fixture that throws about twice as much up as the ambient's row
 * says it throws down. That is what the roof's level asks for and what is built; it is NOT a small leak, and the
 * round's report says so.
 * (14:16Z, the half-way bake at 3.0: the lid beside the purlin over a bell 1.01 units, 0.71 at 0.8 m from the bell's
 * axis; the shell's frames read the lid near a bell at 20 to 29 of 255 against the row's 30 to 45: x 1.5 = 4.5.)
 */
// (ROUND A7, 19:00Z, for the half-way bake: 4.5 -> 8. CONTRACT 19.3: the lid near a lit bell at 30 to 45; round A6 left
// it at 22 to 32, which is 15 to 28 before the grade's lift; 30 to 45 is 26 to 43 there: 1.9 times the radiance.)
// (19:52Z, for the final bake: 8 -> 7. Under the half-way file the lid beside a lit bell read 32 to 44 at V10.)
export const ROOF_UP = Object.freeze({ on: true, perLevel: 7, reach: 3.5, source: 0.4, rise: 0.02, tint: Object.freeze([1.0, 0.82, 0.60]) });
/**
 * The wall washers (round A4, the shell's ask of 06:26Z): the upper drape and the hall's corners. Three lines of LED battens
 * on the perimeter truss's outer upper chord, facing the walls (arena/rig/plan.js HALL.wallwash, wallWashPlan(): the
 * fixtures, the places, the arithmetic), each ONE one-sided tube of the bake: `house.wall.north`, `.south`, `.east`.
 * BAKE ONLY on every tier (the 24 run-time slots are taken; the analytic frame has no occlusion and shows the drape
 * brighter than the bake does in any case). `gain`: a factor on the plan's candela per metre; `?arenawall=gain:0` is the
 * off arm of a pair.
 * ROUND A5 (CONTRACT 17.1): the wall washers are gone (arena/rig/plan.js HALL.wallwash.on is false: wallWashPlan()
 * returns no emitter, so nothing is handed to the bake). The row and the loop below stay for a plan that has them.
 */
export const WALLWASH = Object.freeze({ gain: 1 });
/** The emitters the LITE tier keeps at run time, by id (12 at most: the eight heads, the backdrop's wash, three house
 * floods; see `registerFor` and `trimLite` in createRoom). */
const LITE_KEEP = Object.freeze([/^rig\.head\./, /^hall\.wash\./, new RegExp(`^house\\.(${HOUSE.lite.join('|')})$`)]);
const TIER_FIXED = 'the hall geometry, its materials, the emitter budget and the light map are built for one tier per page load; another tier applies on reload';

const stub = (reason) => ({ enabled: false, reason });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const MISSING_MODULE = /Failed to fetch|Cannot find module|error loading dynamically imported module|Importing a module script failed/i;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A level table with the numbers of `?<param>=key:value,...` (tools: on / off pairs of the same view). Unknown keys are ignored. */
function levelsFrom(query, param = 'arenahall', table = HALL) {
  let raw = null;
  try { raw = query?.get?.(param) ?? null; } catch { raw = null; }
  if (typeof raw !== 'string' || !raw) return table;
  const out = { ...table };
  for (const kv of raw.split(',')) {
    const [k, v] = kv.split(':');
    const n = Number(v);
    if (typeof table[k?.trim()] === 'number' && Number.isFinite(n)) out[k.trim()] = n;
  }
  return Object.freeze(out);
}

/** The house floods (HOUSE; arena/rig/plan.js floodPlan) as emitter specs of the room light: `house.n0` ... `house.e1`. */
function houseFloods(house, floorY, a = ARENA) {
  return floodPlan(a, { floorY }).emitters.map((e) => ({
    id: e.id, type: e.type, position: new THREE.Vector3(...e.position), normal: null, axis: new THREE.Vector3(...e.axis),
    size: e.size.slice(), color: new THREE.Color(...e.color), intensity: e.intensity * (Number.isFinite(house.gain) ? house.gain : 1), radius: e.radius, cone: e.cone, bell: e.bell === true,
  }));
}

/** The key lights (KEY) as emitter records of the room light's form, for the bake: `key.north`, `.south`, `.east`; each
 * stands at its fixture's lens and is aimed along the fixture's axis (arena/rig/plan.js keyPlan). */
function keyLights(key, floorY, a = ARENA) {
  const out = [];
  const color = new THREE.Color(key.tint[0], key.tint[1], key.tint[2]);
  const at = keyPlan(a, { floorY }).at;
  // (round A6: with the table keys on, these three are the far fill: `fill.<side>`)
  const prefix = RIG_HALL.tableKeys.on === true ? 'fill' : 'key';
  for (const id of ['north', 'south', 'east']) {
    if (!(key[id] > 0) || !at[id]) continue;
    out.push({
      id: `${prefix}.${id}`, type: 'point', position: new THREE.Vector3(...at[id].position), normal: null, axis: new THREE.Vector3(...at[id].axis),
      size: [key.source, 1], color, intensity: key[id], radius: key.reach, cone: key.cone, bell: key.bell === true,
    });
  }
  return out;
}

/** The work lights (WORK; layout.js ARENA.floor.workLights) as emitter records for the bake: `work.<camera id>`. */
function workLights(work, floorY, lite, a = ARENA) {
  const out = [];
  if (work.on !== true || !(work.intensity > 0)) return out;
  const color = new THREE.Color(work.tint[0], work.tint[1], work.tint[2]);
  for (const w of a.floor?.workLights ?? []) {
    if (lite && !work.lite.includes(w.id)) continue;
    const position = new THREE.Vector3(w.x, floorY + w.h, w.z);
    const axis = new THREE.Vector3(w.aim[0], floorY + w.aim[2], w.aim[1]).sub(position).normalize();
    if (Number.isFinite(work.off) && work.off > 0) position.addScaledVector(axis, work.off);
    out.push({ id: `work.${w.id}`, type: 'point', position, normal: null, axis, size: [work.source, 1], color, intensity: work.intensity * (WORK_GAIN[w.id] ?? 1), radius: work.reach, cone: work.cone, bell: work.bell === true });
  }
  return out;
}

/** The roof bells' uplight (ROOF_UP; arena/rig/plan.js roofPlan) as emitter records for the bake: `roof.up.<n>`, one per
 * lit bell, in the plan's order. */
function roofUplights(up, floorY, a = ARENA) {
  const out = [];
  if (up.on !== true || !(up.perLevel > 0)) return out;
  const color = new THREE.Color(up.tint[0], up.tint[1], up.tint[2]);
  const bells = roofPlan(a, { floorY }).fixtures.filter((f) => f.kind === 'roof');
  bells.forEach((f, i) => {
    out.push({
      id: `roof.up.${String(i).padStart(2, '0')}`, type: 'point', position: new THREE.Vector3(f.x, f.y + RIG_HALL.roof.bellH + up.rise, f.z),
      normal: new THREE.Vector3(0, 1, 0), axis: null, size: [up.source, 0], color, intensity: f.level * up.perLevel, radius: up.reach,
    });
  });
  return out;
}

/** A record of the room light's own form for a spec that is NOT registered (what `roomLight.addEmitter` would have kept). */
function emitterRecord(spec) {
  const e = {
    id: String(spec.id), type: ['point', 'rect', 'tube'].includes(spec.type) ? spec.type : 'point',
    position: new THREE.Vector3().copy(spec.position), color: new THREE.Color().copy(spec.color ?? new THREE.Color(1, 1, 1)),
    intensity: Number.isFinite(spec.intensity) ? spec.intensity : 1, radius: Number.isFinite(spec.radius) && spec.radius > 0 ? spec.radius : 4,
    size: Array.isArray(spec.size) ? [Number(spec.size[0]) || 0, Number(spec.size[1]) || 0] : null,
    axis: spec.axis ? new THREE.Vector3().copy(spec.axis) : null, normal: spec.normal ? new THREE.Vector3().copy(spec.normal) : null,
  };
  if (Number.isFinite(spec.cone)) { e.cone = spec.cone; e.bell = spec.bell === true; }
  return e;
}

export async function createRoom(club) {
  const ctx = club?.ctx;
  const scene = ctx?.scene;
  if (!scene?.isScene) return stub('no scene');
  const appRoom = ctx.room ?? null;
  const lr = appRoom?.lightRefs ?? null;
  const detail = [0, 1, 2].includes(club?.knobs?.roomDetail) ? club.knobs.roomDetail : 1;
  const builtTier = club?.tier ?? null;
  const now = () => { try { return performance.now(); } catch { return Date.now(); } };
  const tStart = now();
  const timing = { shell: null, parts: null, assets: null, total: null, toolWait: false };
  let group = null;
  const hidden = []; // app objects this module hid (restored by dispose)
  try {
    // the floor plane is the app room's (it follows the active table's bed height): read it, never copy it
    const appFloor = lr?.floor ?? appRoom?.giRefs?.floor ?? null;
    const floorY0 = Number.isFinite(appFloor?.position?.y) ? appFloor.position.y : -ARENA.camera.bedH;
    const HB = ARENA.hall;
    const box = {
      min: new THREE.Vector3(HB.x0, floorY0, HB.z0),
      max: new THREE.Vector3(HB.x1, floorY0 + HB.height, HB.z1),
      center: new THREE.Vector3(),
    };
    box.center.addVectors(box.min, box.max).multiplyScalar(0.5);
    // (round A3: the ambient rows and the lamp pool's gain are the layout's LIGHT table; the shell's rows of those names
    // are no longer read)
    const levels = levelsFrom(ctx.query, 'arenahall', Object.freeze({ ...HALL, ...(LAYOUT.LIGHT ?? {}) }));

    // ---- the light map request starts first (it loads while the hall is built). `?clublm=0` switches it off (tools).
    let lmSwitch = null;
    try { lmSwitch = ctx.query?.get?.('clublm') ?? null; } catch { lmSwitch = null; }
    try { timing.toolWait = Number(ctx.query?.get?.('clubtimeout')) >= 20000; } catch { timing.toolWait = false; }
    // The stage flow (index.js, CONTRACT.md section 21; `club.offStage` is absent without it): the hall is built OFF STAGE
    // while the game is live on the app's dark stage. Nothing is on hold while it waits, so it waits for every part and
    // file as a capture tool does, and its swap (`show` below) is deferred to the look's one swap (`stageShow` on the
    // returned object; index.js calls it once, in the task of the last stage frame).
    const offStage = club?.offStage === true;
    const partWait = timing.toolWait || offStage ? TOOL_WAIT_MS : PART_WAIT_MS, assetWait = timing.toolWait || offStage ? TOOL_WAIT_MS : ASSET_WAIT_MS;
    const lite = club?.tier === 'lite' || detail === 0;
    const lmFile = createLightmap(club, { want: lmSwitch !== '0', id: lite ? LM_ID_ARENA_LITE : LM_ID_ARENA });
    if (lmSwitch === '0') lmFile.reason = 'switched off by ?clublm=0';
    const lm = { on: false, volume: false, reason: lmFile.reason ?? 'not decided yet', live: null, stale: [], note: null, late: false };

    // ---- light service first: materials are made through it
    roomLight.reset();
    // `tableBlock`: the carpet also takes the table's shadow under every emitter (the rig's heads stand around the table)
    // `cone` (round A3): a point emitter may carry a beam (room/light.js CONE: the rig's heads, the key lights)
    roomLight.init({ club, envMap: scene.environment?.isTexture ? scene.environment : null, tableBlock: true, cone: true });
    // the main lamp's pool on the carpet and the carpet's gloss (the hall's values; tools: `?clubpool=t0,t1[,strength[,gain]]`)
    roomLight.setPool({ t0: levels.poolT0, t1: levels.poolT1, strength: 1, gain: levels.poolGain });
    let poolByTool = false;
    try {
      const pool = (ctx.query?.get?.('clubpool') ?? '').split(',').map(Number);
      if (pool.length >= 2 && pool.every(Number.isFinite)) { roomLight.setPool({ t0: pool[0], t1: pool[1], strength: pool[2] ?? 1, gain: pool[3] ?? levels.poolGain }); poolByTool = true; }
    } catch { /* the hall's pool stays */ }
    roomLight.setFloorGloss({ sheen: levels.sheen, emitter: levels.emitterGloss, knee: levels.knee, cap: levels.cap, shadow: 1 });
    roomLight.setBox(box.min, box.max);
    // (round A5) while the light map is off the side row is the layout's `ambientSideAnalytic` (the analytic frame has no
    // row-on-row shading in the stands); the bake takes and hashes `ambientSide` (the levels' own rows, below)
    const sideOff = Array.isArray(levels.ambientSideAnalytic) && levels.ambientSideAnalytic.length === 3 && levels.ambientSideAnalytic.every(Number.isFinite)
      ? levels.ambientSideAnalytic : levels.ambientSide;
    const AMBIENT = { sky: levels.ambientSky, ground: levels.ambientGround, side: sideOff };
    const setAnalyticAmbient = (a = AMBIENT) => roomLight.setAmbient(new THREE.Color(...a.sky), new THREE.Color(...a.ground), new THREE.Color(...a.side));
    setAnalyticAmbient();

    // ---- THE LITE TIER'S TWELVE, at the door (round A4). The lite room light evaluates 12 emitters and warns when a 13th
    // is registered; round A3 let the shell and the parts register all of theirs (18) and withdrew six afterwards, so
    // every lite load warned once ("13 emitters registered, 12 are evaluated"). Now the shell and every part on the lite
    // tier register through this door: an emitter the tier keeps (LITE_KEEP) goes to the room light, any other goes
    // straight to the bake's list as a record of the same form (what the caller gets back, so a part that keeps its
    // record still holds a live one). On the other tiers the door is the room light itself.
    const bakeEmitters = [], liteDropped = [];
    const lightForParts = !lite ? roomLight : Object.create(roomLight, {
      addEmitter: { value(spec) {
        if (!spec || !spec.position) return null;
        if (LITE_KEEP.some((re) => re.test(String(spec.id ?? '')))) return roomLight.addEmitter(spec);
        const e = emitterRecord(spec);
        const i = bakeEmitters.findIndex((x) => x.id === e.id);
        if (i >= 0) bakeEmitters[i] = e; else bakeEmitters.push(e);
        if (!liteDropped.includes(e.id)) liteDropped.push(e.id);
        return e;
      } },
    });

    // ---- the hall
    const shell = buildShell({ club, roomLight: lightForParts, box, detail, levels, layout: ARENA });
    // ---- (round A7, CONTRACT 19.2) the light map's own packing (layout.js LM_PACK): the island's carpet becomes a chart
    // of its own at 2 cm a texel. The shell wrote each vertex's place in ITS atlas into the `lm` attribute; here every
    // vertex is taken back to its chart's metres and laid into the new rectangles (the carpet triangles that lie wholly
    // on the island move to the island's chart). Nothing else reads a light-map coordinate (the bake rasterises this
    // attribute, the room light samples by it), so the bake and the app follow by themselves. `shellLm` is the atlas
    // record everything below uses (the signature, the floor's chart, the state, the bake's hand-over).
    const lmPack = (() => {
      if (LAYOUT.LM_PACK?.on !== true || !shell.lightmap || !Array.isArray(shell.lightmapMeshes)) return { info: null, note: null };
      const old = shell.lightmap, fi = old.charts.findIndex((c) => c.kind === 'floor');
      if (fi < 0) return { info: null, note: null };
      // pass 1: every vertex back to its chart's metres; the carpet triangles wholly inside the layout's island are the
      // island's carpet (the shell lays it inside the boards' line: their bounding rectangle is the new chart)
      const A = ARENA.island, ox = box.min.x, oz = box.min.z, e = 1e-3, jobs = [];
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const mesh of shell.lightmapMeshes) {
        const g = mesh.geometry, lmA = g.attributes.lm, ch = g.userData.lm.chart, idx = g.index.array, n = lmA.count;
        const uvm = new Float32Array(2 * n), isl = new Int8Array(n).fill(-1);
        for (let i = 0; i < n; i++) {
          const c = old.charts[ch[i]], s = lmA.getX(i) * old.size, t = lmA.getY(i) * old.size;
          const pw = c.rot ? c.h : c.w, ph = c.rot ? c.w : c.h, a = c.rot ? t - c.y : s - c.x, b = c.rot ? s - c.x : t - c.y;
          uvm[2 * i] = (a / pw) * c.mw; uvm[2 * i + 1] = (b / ph) * c.mh;
        }
        const onIsland = (i) => ch[i] === fi && ox + uvm[2 * i] >= A.x0 - e && ox + uvm[2 * i] <= A.x1 + e && oz + uvm[2 * i + 1] >= A.z0 - e && oz + uvm[2 * i + 1] <= A.z1 + e;
        for (let k = 0; k < idx.length; k += 3) {
          const inside = onIsland(idx[k]) && onIsland(idx[k + 1]) && onIsland(idx[k + 2]) ? 1 : 0;
          for (let j = 0; j < 3; j++) {
            const i = idx[k + j];
            if (isl[i] >= 0 && isl[i] !== inside) return { info: null, note: 'the light map\'s own packing: a carpet vertex is shared across the island\'s edge: the shell\'s packing stays' };
            isl[i] = inside;
            if (inside) { u0 = Math.min(u0, uvm[2 * i]); u1 = Math.max(u1, uvm[2 * i]); v0 = Math.min(v0, uvm[2 * i + 1]); v1 = Math.max(v1, uvm[2 * i + 1]); }
          }
        }
        jobs.push({ lmA, ch, uvm, isl, n });
      }
      if (!(u1 - u0 > 1 && v1 - v0 > 1)) return { info: null, note: 'the light map\'s own packing: no island carpet found: the shell\'s packing stays' };
      const r3m = (v) => Math.round(v * 1000) / 1000;
      const pack = LAYOUT.lightmapPack(old, { x0: r3m(ox + u0), x1: r3m(ox + u1), z0: r3m(oz + v0), z1: r3m(oz + v1) }, [ox, oz]);
      if (!pack) return { info: null, note: 'the light map\'s own packing does not fit: the shell\'s packing stays' };
      // pass 2: every vertex into its new rectangle
      const clamp = (v, hi) => Math.min(hi, Math.max(0, v));
      for (const { lmA, ch, uvm, isl, n } of jobs) {
        for (let i = 0; i < n; i++) {
          const ci = isl[i] === 1 ? pack.island : ch[i], c = pack.charts[ci];
          const u = clamp(uvm[2 * i] - (c.o ? c.o[0] : 0), c.mw), v = clamp(uvm[2 * i + 1] - (c.o ? c.o[1] : 0), c.mh);
          lmA.setXY(i, (c.x + (u / c.mw) * c.w) / pack.size, (c.y + (v / c.mh) * c.h) / pack.size);
          ch[i] = ci;
        }
        lmA.needsUpdate = true;
      }
      return { info: pack, note: null };
    })();
    const shellLm = lmPack.info ?? shell.lightmap;
    roomLight.setSides(cutPlanes(floorY0, ARENA));
    roomLight.setTableBlock({ strength: levels.tableBlock, soft: levels.tableBlockSoft });
    // ---- the house light over the seating (HOUSE): the bake role's emitters. The lite room light evaluates 12 emitters for
    // the whole room, so on lite none is registered (its own bake holds all of them); a level of 0 switches them off.
    // (round A4: the six house floods; all of them at run time on the high and the base tier, three on lite)
    const house = levelsFrom(ctx.query, 'arenahouse', HOUSE);
    const houseIds = [];
    if (house.gain > 0) {
      for (const p of houseFloods(house, floorY0)) {
        if ((!lite || LITE_KEEP.some((re) => re.test(p.id))) && houseIds.length < ARENA.emitters.bake) { roomLight.addEmitter(p); houseIds.push(p.id); } else bakeEmitters.push(emitterRecord(p));
      }
    }
    // ---- the key lights from the perimeter truss (KEY): bake only, on every tier. Tools: `?arenakey=level:0` (the off arm).
    const key = levelsFrom(ctx.query, 'arenakey', RIG_HALL.tableKeys.on === true ? KEY_FILL : KEY);
    bakeEmitters.push(...keyLights(key, floorY0));
    // ---- round A6, bake only on every tier: a work light per camera platform (WORK) and the roof bells' uplight
    // (ROOF_UP). Tools: `?arenawork=intensity:0`, `?arenaroofup=perLevel:0` (the off arms; a bake that makes a file sets neither).
    const work = levelsFrom(ctx.query, 'arenawork', WORK), roofUp = levelsFrom(ctx.query, 'arenaroofup', ROOF_UP);
    bakeEmitters.push(...workLights(work, floorY0, lite), ...roofUplights(roofUp, floorY0));
    // ---- the wall washers on the perimeter truss (WALLWASH): bake only, on every tier
    const wallwash = levelsFrom(ctx.query, 'arenawall', WALLWASH);
    if (wallwash.gain > 0) {
      for (const e of wallWashPlan(ARENA, { floorY: floorY0 }).emitters) {
        bakeEmitters.push(emitterRecord({ ...e, position: new THREE.Vector3(...e.position), axis: new THREE.Vector3(...e.axis), normal: e.normal ? new THREE.Vector3(...e.normal) : null, color: new THREE.Color(...e.color), intensity: e.intensity * wallwash.gain }));
      }
    }
    timing.shell = Math.round(now() - tStart);
    group = new THREE.Group();
    group.name = 'clubArenaRoom';
    group.visible = false;
    group.add(shell.group);
    scene.add(group);
    const emissives = [...shell.emissives];

    // ---- the table: keep-out rectangle for the parts, shadow rectangle for the floor
    const tb = new THREE.Box3();
    const tableRect = { cx: 0, cz: 0, hx: 1.45, hz: 0.82, top: 0.035 };
    const readTable = () => {
      const g = ctx.table?.group;
      if (!g?.isObject3D) return;
      tb.setFromObject(g);
      if (tb.isEmpty()) return;
      const hx = (tb.max.x - tb.min.x) / 2, hz = (tb.max.z - tb.min.z) / 2;
      if (!(hx > 0.6 && hx < 3 && hz > 0.4 && hz < 2)) return;
      tableRect.cx = (tb.max.x + tb.min.x) / 2; tableRect.cz = (tb.max.z + tb.min.z) / 2;
      tableRect.hx = hx; tableRect.hz = hz;
      tableRect.top = Math.min(0.09, Math.max(0.0, tb.max.y));
      // the shell's carpet follows the real table (the walked band of its wear)
      try { shell.setTable?.({ cx: tableRect.cx, cz: tableRect.cz, hx: tableRect.hx, hz: tableRect.hz }); } catch { /* the shell keeps its default footprint */ }
    };
    readTable();
    const clearance = ARENA.keepOut.strokeRoom;
    const tableBounds = {
      minX: tableRect.cx - tableRect.hx - clearance, maxX: tableRect.cx + tableRect.hx + clearance,
      minZ: tableRect.cz - tableRect.hz - clearance, maxZ: tableRect.cz + tableRect.hz + clearance,
    };

    // ---- the lamp rectangle (the app's rect lights, read every frame: a fixture swap moves them)
    const corner = new THREE.Vector3();
    const lampRect = { cx: 0, cz: 0, hx: 1.02, hz: 0.33, y: 1.02 };
    const readLamp = () => {
      const lights = (lr?.rectLights ?? []).filter((l) => l?.isRectAreaLight && l.visible !== false && l.intensity > 0);
      if (!lights.length) return false;
      let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity, y = 0;
      for (const l of lights) {
        l.updateWorldMatrix(true, false);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          corner.set((sx * l.width) / 2, (sy * l.height) / 2, 0).applyMatrix4(l.matrixWorld);
          ax = Math.min(ax, corner.x); bx = Math.max(bx, corner.x); az = Math.min(az, corner.z); bz = Math.max(bz, corner.z);
          y += corner.y / 4;
        }
      }
      lampRect.cx = (ax + bx) / 2; lampRect.cz = (az + bz) / 2;
      lampRect.hx = Math.max(0.02, (bx - ax) / 2); lampRect.hz = Math.max(0.02, (bz - az) / 2);
      lampRect.y = y / lights.length;
      return true;
    };
    // 1 = the built-in table shadow on the carpet is on. It goes to 0 when the occlusion service's own floor map has taken
    // over (its patch on the floor material scales every direct and indirect term, so the two must not stack): see onFrame.
    const shadowOn = { value: 1 };
    let shadowOwner = 'room';
    // a bake's floor map is a render target's texture; the service's open 1 x 1 map (no bake yet, or a bake that failed) is not
    const occFloorBaked = () => club.occ?.floor?.texture?.isRenderTargetTexture === true;
    const syncShadow = () => {
      const lamp = readLamp();
      roomLight.setShadow({ lamp: lampRect, table: tableRect, lampY: lampRect.y, tableY: tableRect.top, ambient: 0.32,
        strength: lamp ? shadowOn.value : 0 });
    };
    syncShadow();

    // ---- other owners' parts: guarded import, bounded wait, never fatal. A part that arrives late is added when it does.
    const part = (name) => ({ name, status: 'absent', error: null, api: null, counts: null, ms: null });
    const rig = part('rig'), surround = part('surround'), floorPart = part('floor');
    const PARTS = [rig, surround, floorPart];
    const failed = (p, e) => { p.status = 'failed'; p.error = String(e?.message ?? e); console.warn(`[club] arena: the ${p.name} failed — the hall stands without it:`, e); };
    // The three parts race (each awaits its own files), and a part's group is added when it arrives. The ORDER of the
    // groups among the room's children must not depend on who won: the bake's content hashes walk the scene in order,
    // and a page and a node build of one tree have to give one hash (round A4: a lite bake was refused by the tree check
    // with the same triangles in another order). So the parts' groups always stand in ONE order (floor, rig, surround:
    // the order the half-way file of 06:58Z was baked in, so that file stays current), in the places the parts' groups
    // occupy (every other child keeps its place).
    const orderParts = () => {
      const groups = [floorPart, rig, surround].map((p) => p.api?.group).filter((g) => g?.isObject3D && g.parent === group);
      const slots = groups.map((g) => group.children.indexOf(g)).sort((a, b) => a - b);
      groups.forEach((g, i) => { group.children[slots[i]] = g; });
    };
    const take = (p, api) => {
      if (!api || typeof api !== 'object') { p.status = 'empty'; return; }
      if (api.enabled === false) { p.status = 'off'; p.error = api.reason ?? null; p.api = api; return; }
      if (api.group?.isObject3D) group.add(api.group);
      for (const e of api.emissives ?? []) if (e?.isObject3D && !emissives.includes(e)) emissives.push(e);
      p.api = api; p.status = 'built'; p.ms = Math.round(now() - tStart);
      orderParts();
      try { p.counts = api.counts?.() ?? null; } catch { p.counts = null; }
    };
    // literal specifiers only (the served-strings gate rejects a computed one): each part brings its own loader
    async function callPart(p, load, fn, args, waitMs) {
      try {
        const mod = await load();
        if (typeof mod?.[fn] !== 'function') return null;
        p.status = 'building';
        const building = Promise.resolve().then(() => mod[fn](club, args));
        const first = await Promise.race([building.then((api) => ({ api }), (e) => ({ e })), delay(waitMs).then(() => ({ late: true }))]);
        if (first.late) { p.status = 'late'; return building; }
        if (first.e) failed(p, first.e); else take(p, first.api);
      } catch (e) {
        // a missing module is a normal case (the owner has not built it); anything else is reported once
        if (!MISSING_MODULE.test(String(e?.message ?? e))) failed(p, e);
      }
      return null;
    }
    // `layout`: the layout module's exports, with ARENA's members also at the top (layout.rig and layout.ARENA.rig both read)
    const layoutArg = Object.freeze({ ...ARENA, ...LAYOUT });
    const partArgs = () => ({ box: { min: box.min.clone(), max: box.max.clone() }, floorY: floorY0, tableBounds: { ...tableBounds }, roomLight: lightForParts, layout: layoutArg });
    const [rigLate, surroundLate, floorLate] = await Promise.all([
      // `spill: false` (round A4): the luminaire's own glow (`lamp.band`) is no run-time emitter of the arena; the rig hands
      // it to the bake with its other bake-only emitters (`bakeEmitters()`), and this module levels it (LAMP_BAND)
      callPart(rig, () => import('./rig.js'), 'buildRig', { ...partArgs(), appRoom, spill: false }, partWait),
      callPart(surround, () => import('./surround.js'), 'buildSurround', partArgs(), partWait),
      // the event furniture inside the boards (CONTRACT 14.2): cameras, chairs, the referee's table, steps, cable runs
      callPart(floorPart, () => import('./floor.js'), 'buildFloor', partArgs(), partWait),
    ]);
    const levelBand = () => {
      const e = roomLight.emitters.find((x) => x.id === LAMP_BAND.id);
      if (!e || e.intensity === LAMP_BAND.intensity) return false;
      e.intensity = LAMP_BAND.intensity;
      return true;
    };
    // THE LITE TIER'S TWELVE (round A3). The lite room light evaluates 12 emitters; the parts register 18 (rig 8 heads and
    // the lamp's band, shell 4, surround 5). Until now the service dropped "the weakest" by its own power estimate and
    // warned. The room names them instead. Kept at run time (LITE_KEEP): the eight heads (the island's pool), the
    // backdrop's wash and the three drape lights (what the lite frame's far half is made of). Withdrawn and handed to the
    // bake (`bakeEmitters`): the lamp's band (it lights the truss from below), the four board washes and the scoreboard's
    // glow (bands and a halo of a few levels). Under the lite file no emitter is evaluated at run time at all (the lite
    // programs have no highlight loop), so the twelve only matter when that file is missing.
    // (Round A4: the twelve are the eight heads, the backdrop's wash and three house floods, and nothing else is ever
    // registered on lite (`lightForParts` above): this trim is the second line, for a part that kept the room light itself.)
    const trimLite = () => {
      if (!lite) return false;
      let moved = false;
      for (const e of roomLight.emitters.slice()) {
        if (LITE_KEEP.some((re) => re.test(e.id))) continue;
        roomLight.removeEmitter(e.id);
        const i = bakeEmitters.findIndex((x) => x.id === e.id);
        if (i >= 0) bakeEmitters[i] = e; else bakeEmitters.push(e);
        if (!liteDropped.includes(e.id)) liteDropped.push(e.id);
        moved = true;
      }
      return moved;
    };
    // The rig's bake-only emitters (round A3: the outer rectangle's colour washes on the lower rows): taken once the rig stands.
    // (round A6, tools: `?arenatablekeys=0` leaves the four table keys' records out of the list at run time: the off arm
    // of the pair "the keys do not reach the bed or the balls" (the table's body reads the records; the baked map on
    // the carpet stays). A bake that makes a file never sets it.)
    let tableKeysOff = false;
    try { tableKeysOff = ctx.query?.get?.('arenatablekeys') === '0'; } catch { tableKeysOff = false; }
    const rigBake = () => {
      let list = [];
      try { list = rig.api?.bakeEmitters?.() ?? []; } catch { list = []; }
      if (tableKeysOff) list = list.filter((e) => !String(e.id).startsWith('key.'));
      for (const e of list) {
        if (e.id === LAMP_BAND.id) e.intensity = LAMP_BAND.intensity; // (the band's level is the hall's)
        const i = bakeEmitters.findIndex((x) => x.id === e.id);
        if (i >= 0) bakeEmitters[i] = e; else bakeEmitters.push(e);
      }
    };
    levelBand();
    trimLite();
    rigBake();
    roomLight.commit();
    timing.parts = Math.round(now() - tStart);

    // ---- the signature of what a bake depends on (CONTRACT 14.2), in three layers:
    //   `sig`    (hard) the layout itself: the layout version, the hall's box, the island, the backdrop, the detail level and
    //            the light map's charts. A map baked for another value cannot be shown (its texels lie elsewhere): refused.
    //   `parts`  each part's own `signature()` (the shell's, the rig's, the surround's, the floor's: a short string that
    //            moves with its geometry and its emitters' places) and a hash of the emitter table's places. The bake's
    //            record carries them; a part that changed since the bake is REPORTED (`state().lightmap.stale`) and the map
    //            is still used: a moved chair leaves its old shadow on the carpet until the next bake, the hall keeps its light.
    //   `soft`   levels (emitter colours and intensities, the ambient, the lamp's pool): reported, the map is used.
    // The exact test of all three is the tool's (`bake-room.mjs check`: content hashes of every triangle and emitter).
    // A part without `signature()` gives the counts that do not depend on the camera or on what has loaded.
    const partSig = (p) => {
      if (p.status !== 'built') return 'none';
      try { const s = p.api?.signature?.(); if (s !== undefined && s !== null) return typeof s === 'string' ? s : signatureOf(s); } catch { /* the counts stand in */ }
      const c = p.counts ?? {};
      return signatureOf(Object.fromEntries(['detail', 'emitters', 'triangles', 'vertices'].filter((k) => typeof c[k] === 'number').map((k) => [k, c[k]])));
    };
    const shellSig = () => {
      try { const s = shell.signature?.(); if (s !== undefined && s !== null) return typeof s === 'string' ? s : signatureOf(s); } catch { /* the counts stand in */ }
      let c = {};
      try { c = shell.counts?.() ?? {}; } catch { c = {}; }
      return signatureOf({ triangles: c.triangles ?? null, emitters: c.emitters ?? null, charts: c.lightmapCharts ?? null });
    };
    const signature = () => {
      const em = [...roomLight.emitters, ...bakeEmitters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const v3 = (v) => (v ? [r3(v.x), r3(v.y), r3(v.z)] : null);
      const atlas = shellLm ?? {};
      // (`plan`: the lite room is another plan (fewer emitters, its own file and id); the base and the high tier share one
      // file, baked on the high tier's geometry: the detail level rides with the parts, not here)
      const hard = {
        v: LM_VERSION, venue: 'arena', layout: ARENA_LAYOUT_VERSION, plan: lite ? 'lite' : 'full',
        box: [HB.x0, HB.x1, HB.z0, HB.z1, HB.height],
        island: [ARENA.island.x0, ARENA.island.x1, ARENA.island.z0, ARENA.island.z1],
        backdrop: [ARENA.backdrop.x, ARENA.backdrop.z0, ARENA.backdrop.z1, ARENA.backdrop.height],
        atlas: { size: atlas.size ?? null, scale: atlas.scale ?? null, charts: (atlas.charts ?? []).map((c) => [c.kind, c.x, c.y, c.w, c.h, c.rot ? 1 : 0]) },
      };
      const parts = {
        detail, shell: shellSig(), rig: partSig(rig), surround: partSig(surround), floor: partSig(floorPart),
        // (round A3: a cone is part of an emitter's place: where its light goes)
        emitters: signatureOf(em.map((e) => [e.id, e.type, [r3(e.position.x), r3(e.position.y - floorY0), r3(e.position.z)], r3(e.radius), e.size ? e.size.map(r3) : null, v3(e.axis), v3(e.normal), ...(Number.isFinite(e.cone) ? [r3(e.cone), e.bell === true ? 1 : 0] : []), ...(Array.isArray(e.shutter) ? [e.shutter.map(r3)] : []), ...(Array.isArray(e.foot) ? [e.foot.map(r3)] : []), ...(Array.isArray(e.sides) ? [e.sides.map((n) => n.map(r3))] : [])])),
      };
      // (levels: the emitters, the hall's house light and the main lamp's pool on the carpet)
      const soft = { emitters: em.map((e) => [e.id, r3(e.color.r * e.intensity), r3(e.color.g * e.intensity), r3(e.color.b * e.intensity)]),
        ambient: [levels.ambientSky, levels.ambientGround, levels.ambientSide], pool: [levels.poolT0, levels.poolT1, levels.poolGain] };
      return { sig: signatureOf(hard), soft: signatureOf(soft), parts, hard, softParts: soft };
    };
    const PART_WORDS = Object.freeze({ shell: 'the shell (carpet, drape, backdrop, roof)', rig: 'the rig', surround: 'the surround (boards, seating)', floor: 'the floor furniture', emitters: 'an emitter\'s place' });

    // where the carpet's chart lies in the map, for roomLight.floorIrradiance() (the chart's atlas record + its world origin)
    // (round A7: with the room's own packing the island's carpet lies in a chart of its own: `inner`, read for a point on the island)
    const floorChart = (() => {
      const c = shellLm.charts.find((ch) => ch.kind === 'floor');
      if (!c) return null;
      const out = { ...c, o: [HB.x0, floorY0, HB.z0], size: shellLm.size };
      if (lmPack.info) { const i = shellLm.charts[lmPack.info.island]; out.inner = { ...i, o: [HB.x0 + i.o[0], floorY0, HB.z0 + i.o[1]], size: shellLm.size }; }
      return out;
    })();

    // The parts' multiply-blended shadow overlays come in the two classes of the club props (../room.js applyPropsShadow):
    //   `<part>.contactshadow`  contact-size (a foot, an edge): stays under the bake, which cannot hold it in a 3 cm texel;
    //   `<part>.castshadow`     cast-size (the wide soft shadow under a deck or a row): the map holds the real one, so it
    //                           is hidden while the bake is on (the two must not stack).
    const partShadows = { contact: 0, cast: 0, castShown: 0 };
    const hiddenByBake = new Set(); // overlay meshes this module hid; only those are shown again
    const applyPartShadows = (bakeOn) => {
      partShadows.contact = 0; partShadows.cast = 0; partShadows.castShown = 0;
      // (the shell's own overlays, if it makes any, follow the same two names)
      for (const g of [shell.group, ...PARTS.map((p) => p.api?.group)]) {
        g?.traverse?.((o) => {
          if (!o.isMesh) return;
          const n = o.material?.name ?? '';
          if (/\.contactshadow$/.test(n)) partShadows.contact += 1;
          if (!/\.castshadow$/.test(n)) return;
          partShadows.cast += 1;
          if (bakeOn) { if (o.visible) { o.visible = false; hiddenByBake.add(o); } } else if (hiddenByBake.has(o)) { o.visible = true; hiddenByBake.delete(o); }
          if (o.visible) partShadows.castShown += 1;
        });
      }
    };

    // ---- the baked map: decide (signatures), then switch the materials and the ambient together
    function applyLightmap(want = true) {
      lm.stale = [];
      lm.live = signature();
      const meta = lmFile.meta;
      let use = want && !!lmFile.texture && !!meta;
      if (!want) lm.reason = 'switched off (room.lightmap.set(false))';
      else if (!lmFile.texture) lm.reason = lmFile.reason ?? `the file is ${lmFile.status}`;
      else if (meta.sig !== lm.live.sig) { use = false; lm.reason = `baked for another hall (signature ${meta.sig}, this hall is ${lm.live.sig}): re-bake with web/tools/club/bake-room.mjs`; }
      else {
        lm.reason = null;
        // a part that changed since the bake: reported, the map stays in use (CONTRACT 14.2)
        // (a part's signature belongs to one detail level: the file is baked on the high tier's geometry and also lights the
        // base tier, where the same parts are built coarser: there the parts are not compared, and the room says so)
        const baked = meta.parts && typeof meta.parts === 'object' ? meta.parts : null;
        lm.note = null;
        if (!baked) lm.stale.push('the bake\'s record carries no part signatures (baked by an older tool)');
        else if (baked.detail !== detail) lm.note = `baked on the geometry of detail level ${baked.detail}, shown at ${detail}: the parts' signatures are not compared`;
        else for (const k of Object.keys(PART_WORDS)) if (baked[k] !== lm.live.parts[k]) lm.stale.push(`${PART_WORDS[k]} changed since the bake (baked ${baked[k] ?? 'none'}, now ${lm.live.parts[k]}): re-bake to match`);
        if (meta.soft !== lm.live.soft) lm.stale.push('emitter levels changed since the bake (re-bake to match)');
        const pool = meta.lamp?.pool; // the bake's bounce off the carpet was computed under this pool of the main lamp
        if (Array.isArray(pool) && (pool[0] !== levels.poolT0 || pool[1] !== levels.poolT1 || (pool[2] ?? 1) !== levels.poolGain)) lm.stale.push('the main lamp pool changed since the bake (re-bake to match)');
      }
      lm.on = roomLight.setLightmap(use ? lmFile.texture : null, { fullScale: meta?.fullScale ?? 16, lampVisibility: 1, keepPoint: 0, floor: floorChart });
      const v = use ? lmFile.volume : null;
      lm.volume = roomLight.setVolume(v ? { texture: v.texture, data: v.data, dims: v.dims, bias: meta?.volume?.bias, fullScale: meta?.fullScale ?? 16,
        min: [v.min[0], v.min[1] + floorY0, v.min[2]], max: [v.max[0], v.max[1] + floorY0, v.max[2]] } : null);
      // a map whose floor texels saw the table holds the table's shadow and occlusion on the carpet: that light is final
      // (room/light.js TABLE_BLOCK_BAKED_CODE: later scale factors for the table's sake, the occlusion service's ambient term,
      // do not count the table twice). Tools: `?arenabakedtable=0` keeps the old path (the off arm of a pair).
      let finalBaked = lm.on && meta?.floorTable === true ? 1 : 0;
      try { if (ctx.query?.get?.('arenabakedtable') === '0') finalBaked = 0; } catch { /* keep */ }
      lm.finalBaked = finalBaked;
      roomLight.setTableBlock({ strength: levels.tableBlock, soft: levels.tableBlockSoft, baked: finalBaked });
      const amb = lm.on && meta?.ambient?.sky && meta.ambient.ground && meta.ambient.side ? meta.ambient : AMBIENT;
      setAnalyticAmbient(amb);
      // (round A4) the lamp pool's gain on the carpet: the panel's real spill under the bake, and while the map is off the
      // gain that stands for the key lights and the bounce the analytic frame does not have (layout.js LIGHT). A tool's
      // own `?clubpool=` stays.
      if (!poolByTool) roomLight.setPool({ t0: levels.poolT0, t1: levels.poolT1, strength: 1, gain: lm.on || !Number.isFinite(levels.poolGainAnalytic) ? levels.poolGain : levels.poolGainAnalytic });
      applyPartShadows(lm.on);
      if (lm.reason && want && lmFile.status === 'loaded') console.warn(`[club] arena: the light map is not used — ${lm.reason}`);
      return lm.on;
    }

    // ---- textures and the light map: bounded wait, then the swap
    let lmWanted = true;
    // (the shell's own scans: `shell.ready` settles when they have loaded or fallen back and are on its materials; a shell
    // without that member is waited for by the one id the A1 shell asked for)
    const ids = detail >= 1 ? ['felt.normal'] : [];
    let texturesLate = false;
    try {
      const waits = [lmFile.ready.then(() => 'lm')];
      const ready = typeof shell.ready?.then === 'function' ? shell.ready : (ids.length ? club.assets?.ready?.(ids) : null);
      let texturesDone = !ready?.then;
      if (ready?.then) waits.push(ready.then(() => { texturesDone = true; }, () => { texturesDone = true; }));
      const all = Promise.all(waits).then(() => 'ok');
      const r = await Promise.race([all, delay(Math.max(0, assetWait - (now() - tStart))).then(() => 'late')]);
      if (r === 'late') {
        if (!texturesDone) { texturesLate = true; ready.then(() => recapture('textures'), () => {}); }
        if (lmFile.status === 'loading') { lm.late = true; lmFile.ready.then(() => { if (applyLightmap(lmWanted)) recapture('lightmap'); }); }
      }
    } catch { /* no asset service: stand-ins, analytic light */ }
    applyLightmap(lmWanted);
    timing.assets = Math.round(now() - tStart);

    const studio = () => { try { return window.__cinelight === true; } catch { return false; } };
    function recapture(reason) {
      if (!group.visible) return;
      if (studio()) return; // a studio window owns the environment; the app re-bakes at its close
      try {
        if (club.env?.enabled && typeof club.env.capture === 'function') club.env.capture(`room:${reason}`);
        else ctx.rebakeEnv?.();
      } catch (e) { console.warn('[club] arena: the environment re-capture failed:', e); }
    }

    const hide = (o) => { if (o?.isObject3D && o.visible) { o.visible = false; hidden.push(o); } };
    function show() {
      // the app room: walls + ceiling box, floor, floor-shadow overlay, wall props. Its lamp, luminaire and lights stay.
      hide(lr?.walls); hide(appFloor); hide(lr?.blob ?? appRoom?.giRefs?.blob);
      appRoom?.group?.traverse?.((o) => { if (o.name === 'obFarPropTable') hide(o); });
      group.visible = true;
      recapture('show');
    }
    // ---- THE HALL'S SEAT (round A5; the table role's finding of 09:18Z). The app seats its floor per table class, but not
    // for every table: the default pool table stands its levelers' soles 21.9 mm OVER the app's floor (the app floor at
    // -0.79, the soles at -0.7681: its catalogue's bed height is 0.768 m). Under the club room's lamp nobody saw it; in a
    // hall with a real shadow under the table it is a table that does not quite stand (4 px of lit carpet under each
    // foot at V10). So the hall is seated at the SOLES when they stand 2 to 50 mm over the app's floor: the whole hall
    // rises by that much through the same path a re-seated app floor takes (`seatTo` below: the group, the box, the room
    // light's emitters, map and volume). The levelers are found by the app's own mesh names (`dm-leveler-*`); none
    // found, or a gap outside that range: the hall sits on the app's floor as before. Tools: `?arenaseat=0` (the off arm).
    let seated = floorY0, seatLift = 0, seatOff = false;
    try { seatOff = ctx.query?.get?.('arenaseat') === '0'; } catch { seatOff = false; }
    const soleBox = new THREE.Box3();
    const appFloorY = () => (Number.isFinite(appFloor?.position?.y) ? appFloor.position.y : floorY0);
    const readSeat = () => {
      if (seatOff) return 0;
      let low = Infinity;
      try {
        ctx.table?.group?.traverse?.((o) => {
          if (!o.isMesh || !/^dm-leveler/.test(o.name ?? '')) return;
          soleBox.setFromObject(o);
          if (!soleBox.isEmpty()) low = Math.min(low, soleBox.min.y);
        });
      } catch { low = Infinity; }
      const lift = low - appFloorY();
      return Number.isFinite(lift) && lift >= 0.002 && lift <= 0.05 ? lift : 0;
    };
    const seatTo = (y) => {
      if (Math.abs(y - seated) <= 1e-6) return false;
      seated = y;
      const dy = y - floorY0;
      group.position.y = dy;
      group.updateMatrixWorld(true);
      box.min.y = floorY0 + dy; box.max.y = floorY0 + HB.height + dy; box.center.y = (box.min.y + box.max.y) / 2;
      roomLight.reseat(dy, box.min, box.max);
      readTable();
      return true;
    };
    // (seated BEFORE the hall is shown: no frame shows it at the app floor's height first)
    seatLift = readSeat();
    seatTo(appFloorY() + seatLift);
    if (!offStage) show(); // (built off stage: the swap waits for index.js, `stageShow` below)
    timing.total = Math.round(now() - tStart);

    // ---- late parts
    const late = (p, pending) => pending?.then((api) => { take(p, api); levelBand(); trimLite(); rigBake(); roomLight.commit(); applyLightmap(lmWanted); recapture(p.name); }, (e) => failed(p, e));
    late(rig, rigLate);
    late(surround, surroundLate);
    late(floorPart, floorLate);

    // ---- per frame: follow the app floor (it re-seats per table class), the lamp rectangle, the rig
    let tick = 0;
    let rigUpdate = true;
    const onFrame = () => {
      // (round A5: the seat is the app's floor plus the table's sole gap; the gap is re-read with the table, below)
      if (seatTo(appFloorY() + seatLift)) recapture('reseat');
      // the app may re-show what this module hid (a rebuild, a studio revert): keep the two rooms from overlapping
      for (const o of hidden) if (o.visible && group.visible) o.visible = false;
      // the occlusion service patched the carpet: once its floor map is ready, its shadow replaces the built-in one. `ready`
      // also settles when a bake step threw or a bake shader did not link (occlusion.js stepJob, finishFloor): the service
      // then holds no baked floor map, so the built-in shadow stays (or comes back) and the hand-over is tried again
      if (shadowOwner === 'room' && club.occ?.enabled === true && (shell.floor.material.userData?.clubKeys ?? []).some((k) => /^occ/.test(k))) {
        shadowOwner = 'occ-pending';
        Promise.resolve(club.occ.floor?.ready).then(() => { if (occFloorBaked()) { shadowOwner = 'occ'; shadowOn.value = 0; } else shadowOwner = 'room'; }, () => { shadowOwner = 'room'; });
      } else if (shadowOwner === 'occ' && !occFloorBaked()) { shadowOwner = 'room'; shadowOn.value = 1; }
      syncShadow();
      if (rigUpdate && typeof rig.api?.update === 'function') {
        try { rig.api.update(ctx.camera); } catch (e) { rigUpdate = false; console.warn('[club] arena: the rig update threw and is no longer called:', e); }
      }
      if ((tick++ & 127) === 0) { readTable(); seatLift = readSeat(); const lv = levelBand(), tr = trimLite(); if (lv || tr) roomLight.commit(); } // (the rig re-registers its emitter on a fixture change)
    };
    club.onFrame?.(onFrame);
    try { club.adopt?.classify?.('room', (_o, m) => typeof m?.userData?.clubRoom === 'string'); } catch { /* no registry */ }

    let tierAsked = null;
    const partState = (p) => {
      let own = null;
      try { own = p.api?.state?.() ?? null; } catch { own = null; }
      try { p.counts = p.api?.counts?.() ?? p.counts; } catch { /* keep the last counts */ }
      return { status: p.status, error: p.error, readyAtMs: p.ms, counts: p.counts, ...(own ? { state: own } : {}) };
    };
    const state = () => ({
      venue: 'arena', layoutVersion: ARENA_LAYOUT_VERSION,
      detail, box: { min: box.min.toArray(), max: box.max.toArray() }, floorY: seated,
      // (round A5) the hall's seat: the app's floor, how far the table's soles stand over it, whether a tool switched it off
      seat: { appFloor: appFloorY(), lift: r3(seatLift), off: seatOff },
      tier: { built: builtTier, asked: tierAsked, rebuild: false, reason: TIER_FIXED },
      timing: { ...timing },
      shell: shell.counts(), light: roomLight.state(), rig: partState(rig), surround: partState(surround), lamp: partState(rig),
      // (`floor` below is the carpet's albedo record, as in the club room: the floor PART's state is `floorPart`)
      floorPart: partState(floorPart),
      emitterShare: {
        bake: houseIds.length, shell: (shell.emitterIds ?? []).length, bakeOnly: bakeEmitters.map((e) => e.id), liteDropped: liteDropped.slice(),
        byOwner: roomLight.emitters.reduce((acc, e) => { const k = e.id.split('.')[0]; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
        allowed: { ...ARENA.emitters },
      },
      levels: { ...levels }, house: { ...house, runtime: houseIds.slice() }, key: { ...key }, wallwash: { ...wallwash },
      // (round A6) the table keys' switch, the work lights and the bells' uplight (all bake only)
      tableKeys: RIG_HALL.tableKeys.on === true, work: { ...work }, roofUp: { ...roofUp },
      pool: { gain: roomLight.state?.()?.pool?.gain ?? null, baked: levels.poolGain, analytic: levels.poolGainAnalytic ?? null, byTool: poolByTool },
      lightmap: {
        on: lm.on, volume: lm.volume, reason: lm.reason, stale: lm.stale.slice(), note: lm.note, late: lm.late, file: lmFile.state(),
        floorTable: lmFile.meta?.floorTable ?? null, finalBaked: lm.finalBaked ?? 0,
        live: lm.live ? { sig: lm.live.sig, soft: lm.live.soft, parts: { ...lm.live.parts } } : null,
        baked: lmFile.meta?.parts ? { ...lmFile.meta.parts } : null,
        atlas: { size: shellLm.size, texelsPerMetre: shellLm.scale, charts: shellLm.charts.length,
          ...(lmPack.info ? { pack: { island: LAYOUT.LM_PACK.island, floor: LAYOUT.LM_PACK.floor, wall: LAYOUT.LM_PACK.wall, backdrop: LAYOUT.LM_PACK.backdrop, roof: LAYOUT.LM_PACK.roof } } : {}), ...(lmPack.note ? { note: lmPack.note } : {}) },
        partShadows: { ...partShadows },
      },
      floor: shell.floor.albedoState(),
      hiddenAppObjects: hidden.map((o) => o.name || o.type), texturesLate,
      lampRect: { ...lampRect }, table: { ...tableRect }, builtinShadow: shadowOn.value, shadowOwner,
      cut: { ...ARENA.cut },
    });

    const lightmap = {
      /** The baked map while it is in use, else null (analytic light). */
      get texture() { return lm.on ? lmFile.texture : null; },
      /** Resolves when the file has loaded or failed (the look's reveal waits for it, bounded). */
      ready: lmFile.ready,
      state: () => state().lightmap,
      /** Tools: switch between the baked and the analytic light at run time. */
      set(on) { lmWanted = on !== false; const r = applyLightmap(lmWanted); recapture('lightmap'); return r; },
      /** The bake tool: the live signature (hard + soft, with their parts). */
      signature,
      /** The bake tool: show a map that is not in a file yet (RGBA8 texture + its record, and the volume of the same bake),
       * or null to go back to the file. */
      preview(texture, meta, volume = null) {
        if (texture?.isTexture && meta) { lmFile.texture = texture; lmFile.meta = meta; lmFile.volume = volume; lmFile.status = 'preview'; }
        return lightmap.set(true);
      },
      /** The baked light on the carpet at world (x, z): [r, g, b] irradiance of the fixed emitters and the bounce, or null
       * while the map is off or the point is off the floor. */
      floorIrradiance: (x, z) => roomLight.floorIrradiance(x, z),
    };

    return {
      enabled: true,
      venue: 'arena',
      group,
      box,
      // the live floor height (the occlusion service reads it; it follows the app's floor per table class)
      get floorY() { return seated; },
      // `albedo`: the carpet's mean diffuse colour near the table (the island), linear RGB
      // `bakedTable`: true while the baked map in use holds the TABLE's shadow and occlusion on the carpet (its floor texels
      // saw the table: the record's `floorTable`). The carpet's own program then keeps that light out of the reach of
      // later scale factors (room/light.js TABLE_BLOCK_BAKED_CODE), so the occlusion service's ambient term does not
      // count the table a second time; a service may read this member to leave its own ambient term off the carpet.
      floor: { mesh: shell.floor.mesh, material: shell.floor.material, builtinShadow: shadowOn, get albedo() { return shell.floor.albedo; }, get bakedTable() { return lm.on && lmFile.meta?.floorTable === true; } },
      emissives,
      lightmap,
      /** The tier is fixed for a page load (state().tier says why). Returns true only for the tier that is built. */
      setTier(tier) { tierAsked = tier ?? null; return tier === builtTier; },
      layout: layoutArg, light: roomLight, tableBounds,
      shell: { meshes: shell.meshes, lightmap: shellLm, lightmapMeshes: shell.lightmapMeshes, sides: shell.sides, layout: shell.layout },
      // `lamp` is the rig: the luminaire of this venue (its face(), its spill emitter, its view rule)
      parts: { get lamp() { return rig.api; }, get rig() { return rig.api; }, get surround() { return surround.api; }, get floor() { return floorPart.api; } },
      // the bake tool: emitters that only the bake evaluates (the house panels the room light has no slot for), as
      // records of the room light's own form
      bakeEmitters,
      // (round A6b) what the bake leaves out (UNDER above; round A7: the valance is gone, `skip` is all there is)
      bakeRules: UNDER.on === true ? { skip: UNDER.skip.slice() } : null,
      recapture, state,
      ...(offStage ? { stageShow() { if (!group.visible) show(); } } : {}), // the deferred swap, once (absent without the stage flow)
      dispose() {
        club.offFrame?.(onFrame);
        for (const p of PARTS) { try { p.api?.dispose?.(); } catch { /* the part keeps what it holds */ } }
        roomLight.setLightmap(null); roomLight.setVolume(null);
        group.visible = false;
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
        scene.remove(group);
      },
    };
  } catch (e) {
    // leave the app room on screen exactly as it was
    try { if (group) { group.visible = false; scene.remove(group); } for (const o of hidden) o.visible = true; } catch { /* nothing to restore */ }
    console.warn('[club] arena: the hall failed to build — the app room stays:', e);
    return stub(String(e?.message ?? e));
  }
}
