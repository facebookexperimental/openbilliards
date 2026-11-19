// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/shell.js — the surfaces of the hall of the `arena` venue (CONTRACT.md sections 13.4, 13.6, 14). Owner: shell.
//
// A tournament hall before the doors open: dark, and never empty black. Five merged meshes (five draw calls; six from
// round A6: the roof's lid, see ROUND A6 below), real-world sized (metres); every position comes from ./layout.js and
// ./shell/plan.js:
//   carpet    ONE flat mesh over the whole hall and nothing else on it: the hall's charcoal broadloom and the lighter island
//             under the table. It is the room's FLOOR: a MeshStandardMaterial from roomLight.material({ tableShadow: true })
//             with the standard light chunks (the room light's floor terms, the occlusion service's floor map and the baked
//             map all patch it as before). What makes it a carpet is drawn by its material: a loop-pile colour and normal
//             map (drawn in code until the scans `arena.carpet.color|normal|rough` are shipped), and ./shell/glsl.js on the
//             base and high tiers: the scan's contrast law, roll seams, the contact shade of the island's edging, the
//             pile's sheen and lean at a low angle, vacuum tracks, wear where people walk, slow mottle. Nothing there adds
//             light, so the carpet takes the colour of whatever light is near it (the backdrop's amber wash, the rail's
//             cool spill). The island's carpet ends 0.31 m inside the line the boards stand on (./shell/plan.js).
//             Round A5: the island is laid in quarter-turned carpet TILES (their lay shows against the eye and against
//             the light from the rig, hairline seams, the yarn's grain at two scales); all of it zero in the mean.
//   THE ALBEDO LAW (round A3, CONTRACT 15.2): the carpets, the drape and the backdrop carry the layout's ALBEDO values as
//             the MEAN of their colour (map x material colour x vertex colour); `albedos()` states them as built and the
//             node arm pins them. No level in this file is a look value for a surface's darkness any more.
//   drape     the black drape on the four walls, hung from a pipe-and-base rail 7 m up (round A4: the hall is seen
//             under its house lights at half, so the cloth has to hold up as cloth): drape widths that hang in bays, no
//             two gathered alike (deeper folds on a narrower pitch, or slack and wide), pleats of uneven width and
//             depth, a JOIN as a lap (one width's free edge over the next), a head that sags between its ties under
//             the crossbar, folds that do not hang plumb, a hem that breaks a hand above the floor and pools on it.
//             Over each of the four exit doors it goes on as a header. Shaded by vertex colour (the cloth's uneven
//             nap, a closed fold's black) and a nap normal map laid larger than life (`arena.drape.normal` at 1.2 m
//             per repeat). It is on the LIGHT MAP, one chart per wall; the base tier hangs the high tier's folds.
//             Round A5: the lite tier hangs the same folds as FLAT cloth: one quad per stretch of wall, the folds'
//             shade (the same law as the vertex shade of the full tiers) in a small map, one row per wall.
//   matt      everything else untextured in one mesh, shaded by vertex colour: the hem's strip on the floor, the
//             PIPE-AND-BASE RAIL (the crossbar, an upright's head over it at every join, base plates at the wall's
//             foot), the bare wall above it, the roof's lid (a profiled steel deck in dark paint, two ducts under it
//             and a cross duct, cable trays on the rig's roof trusses, an eaves beam at the head of each wall), the
//             EXIT DOORS (round A5: a dark door pair set back in the reveal of a plain pier that stands proud of the
//             wall under the drape's header, each face shaded by how much of the hall it sees; a sign box on the
//             pier, whose own light on the pier and the reveal is ./shell/glsl.js SIGN_LIGHT), the backdrop's
//             frame, the housings of the floor lights, the battens of the drape lights, and the EDGING PROFILE on the
//             joint between the island's carpet and the hall's (an aluminium ramp 90 mm wide and 11 mm high).
//   backdrop  the west wall behind the breaker: fabric stretched on a frame. One map over its whole face (./shell/tex.js):
//             its colour is the cloth alone (panels, seams with their puckers, the frame's rails as soft ridges,
//             tension streaks), its alpha where the floor lights' beams land. The scallops are LIGHT (round A4): the
//             backdrop's own patch (./shell/glsl.js BACKDROP_LIGHT) adds them to the wash's light on the cloth, so
//             the house light finds plain cloth. A tiled weave normal for close range. The scoreboard is the surround's.
//             Round A5: the frame's rails, the cloth's bow between them and its ripples are LIGHT too (the wash
//             grazes the cloth: BACKDROP_RELIEF), no longer paint in the colour map.
//   lenses    the lit faces of the floor lights (unlit HDR surfaces with lens cells) and of the four exit signs (a
//             plain green rectangle each with a hot band in it and a window in the box's underside: a running light,
//             no word, no figure, no emitter).
// ROUND A6 (CONTRACT 18; every step behind a row of HALL, so a tool can build the round before it):
//   carpet    the patch v4 (`carpetV4`): the island's tiles laid by a fitter's hand (four directions, no two rows
//             alike), their nap against the island's DIRECTED light (a small model of it: the rig's fill and the
//             lamp's spill from over the table, the rig's four table keys inside their blades; read-only from
//             ./rig/plan.js), a walked ring around the table and worn patches at the players' chairs, a few pieces
//             of tape. Still nothing that adds light; the albedo's mean stays the table's.
//   roof      SIX meshes: the lid and its deck ribs are `arenaHallRoof` on the hall's light map (`roofChart`: two
//             half charts of the kind `roof` after the six, which keep their rectangles), so the bake's uplight from
//             the rig's bells lights it on every tier; ducts, trays and beams stay in the matt mesh on the volume.
//   doors     the pier is a door LOBBY (`doorBack`): 0.9 m into the hall, the door pair at the end of its reveal in
//             a dark paint, each vertex with what it sees of the hall (the form-factor law of round A5, a
//             deeper recess); a lit slot under the leaves (`doorGap`: a face in the lens mesh, no emitter).
//   backdrop  the wash has a top cut and a higher aim (`wash`, `washReach`, `washAim`): nothing of it above 4.3 m.
// Emitters on the room light (the shell's share is 4, all used): `hall.wash.0`, one tube along the row of floor lights (the
// wash as the room's light: hot at the foot of the cloth, falling off up the wall; round A5: ONE-SIDED, aimed up the
// cloth, nothing direct on the hall side of the row), and `hall.house.north|south|east`, a batten on the floor behind
// each seating block (the drape lights: they graze the cloth upward, the folds above the top row catch them on their
// ridges; round A5: a short reach, nothing in the wall's upper half; their light does not reach the island).
//
// The camera: nothing of the shell is inside the camera's reach (layout.js cameraFloor / cameraCeil: the walls, the roof
// and the backdrop are beyond it, the carpet is under it), so no mesh here carries a cut side. All faces look INTO the hall.
//
// Light map: the carpet, the backdrop's face and the drape carry the second UV set (`lm`, room/lightmap.js createAtlas: six
// charts in this order: the floor, the backdrop, the north, east, south and west walls up to the drape's pipe) for the
// hall's bake; the matt mesh reads the bake's volume. Round A6: the roof's lid carries it too (two more charts of the
// kind `roof`, after the six). Without a bake every material here compiles the analytic variant of the room light.
//
// Detail (`club.knobs.roomDetail`): 0 = flat cloth with a fold map, a flat lid, no duct, no tray, no rail, no housings, a door as
// one dark quad under its sign, the A1 floor (a dark band under the edging as floor geometry, no carpet patch), 256 px
// canvases; 1 = full pleats (the high tier's own folds, two columns each), the hem where a camera can see a wall's
// foot, deck crests, ducts, trays, beams, the rail, the doors, the carpet patch, 512 px canvases and the club's cloth
// normal as pile; 2 = rounded pleats (four columns), the deck's webs, the uprights' sides, a 1024 px loop-pile colour
// and normal map, the backdrop at 2048 x 1024.
import * as THREE from 'three';
import { createAtlas, LM_SIZE } from '../room/lightmap.js';
import { UNSHADE } from '../room/light.js';
import { canvasTexture, flat } from '../room/tex.js';
import { applyPatchText } from '../patchtext.js';
import { ARENA, PALETTE, ALBEDO, cutPlanes } from './layout.js';
import { shellPlan, shellSignature, makeRand, SHELL_VERSION } from './shell/plan.js';
import { CARPET_MEAN, BACKDROP_MEAN, SCALLOP_GRID, SCALLOP_ALPHA, FOLD_MAP_SCALE, carpetColor, pileNormal, backdropColor, washScallops, scallopShare, weaveNormal, lensCells, scanTransfer, foldsMap } from './shell/tex.js';
import { CARPET, CARPET_4, CARPET_5, carpetPatchSpec, carpetUniforms, carpetPatchSpec4, carpetUniforms4, backdropPatchSpec, backdropUniforms, signPatchSpec, signUniforms, roofUniforms, roofPatchSpec, ROOF_BELLS } from './shell/glsl.js';
// (read-only, round A5: where the rig's lit roof bells hang, for their own light on the lid: ./shell/glsl.js ROOF_LIGHT)
// (read-only, round A6: the rig's four table keys (place, axis, candela, shutter), for the carpet's nap against the
// island's directed light: ./shell/glsl.js CARPET_COLOR_4)
// (the keys' functions are read through the module's namespace and feature-detected: the rig's plan is another
// role's file, and a name that moved there must leave the carpet without its keys, not the hall without its shell)
import { roofPlan, HALL as RIG_HALL } from './rig/plan.js';
import * as RIG_PLAN from './rig/plan.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// sRGB hex -> linear [r, g, b]
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
/** Linear luminance (Rec.709 Y): the albedo table's measure. */
export const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** A linear colour's hue at the luminance `y` (the albedo law: the palette gives the hue, the table gives the level). */
const atLuma = (c, y) => mul(c, y / Math.max(1e-9, lumaOf(c)));

/**
 * Levels and tints of the hall (a look table: set against the frames, not derived). Light is in the app's units: irradiance
 * on a surface; the played bed gets about 5.7. `?arenahall=key:value,...` (tools: pairs of the same view) overrides a number.
 * The room (./room.js) reads the ambient, pool, gloss and table-block rows; the rest is the shell's own.
 */
export const HALL = Object.freeze({
  // room ambient of the analytic light: what the bake will hold as multi-bounce light. Low, slightly cool, brighter from above.
  ambientSky: [0.30, 0.32, 0.37], ambientGround: [0.05, 0.053, 0.062], ambientSide: [0.09, 0.095, 0.112],
  // the backdrop's wash: the whole row of floor lights as one tube (candela-like for the row) and its reach.
  // Round A3 (the level factors of the lane's LEVELS note, version 1): the cloth's mean albedo went 0.028 -> 0.18, the
  // wash comes down by the same ratio, 200 x 0.156 = 31: the cloth keeps its exposure, hot at the foot (1.45 units)
  // and falling off upward (0.37 at 2 m, 0.12 at the scoreboard's height)
  // Round A4: the house light at half puts 1.0 to 1.5 units of neutral light on the whole cloth (level 48 to 66 where
  // round A3 had the hall's dark), so the wash at 31 stood only 1.6 : 1 over the cloth's top (97 at the visible foot,
  // 87 in the middle, 68 at 3 m: frame j3). 31 -> 38 with the beams widened along the bars (./shell/tex.js): the
  // foot's mean 112, a scallop's core 134 (under the bed's 144), 81 at 2 m, the top the hall's own 68
  // (scratch/shell/wash-a4.mjs). More would put a scallop's core over the bed: the bed stays the brightest surface.
  // Round A5 (the hall goes dark around the island: CONTRACT 17.1): the house light on the cloth falls to about 0.7
  // units, and the wash is the hall's second colour. The tube is ONE-SIDED now (./shell/plan.js `lights.aim`: the
  // height on the cloth that the bars are aimed at; the room light's one-sided tube: a cosine lobe around the aim):
  // nothing direct on the hall side of the row any more, less on the cloth's very foot, the same from 2 m up.
  // 38 -> 85 by arithmetic (scratch/shell/wash-a5.mjs: amber luminance units 1.9 at 0.5 m, 2.2 at 0.8 m, 1.0 at 2 m,
  // 0.47 at 3 m, 0.25 at 4 m, 0.09 at the top; a scallop's core 4.0 units at the most, the bed's p10).
  // Round A6 (CONTRACT 18.1: the backdrop's top third at most 25, the amber holding the lower half). `washAim`
  // (metres; the emitter's NORMAL, handed to ./shell/plan.js and held by the signature): the height on the cloth the
  // bars are aimed at. The row gets a top cut (the reach, the room light's finite window: a barn door on each bar)
  // and is aimed higher, so less lands on the cloth's very foot and nothing above 4.3 m: 85 cd / reach 11 / aim 4 m
  // -> 110 / 4.2 / 8. By the tube's law (scratch/shell/wash-a6.mjs; amber luminance units, round A5 in brackets):
  // 0.5 m 1.94 (1.93), 0.8 m 2.40 (2.17), 1.5 m 1.71 (1.48), 2 m 1.10 (1.00), 3 m 0.34 (0.47), 3.5 m 0.13 (0.34),
  // 4 m 0.015 (0.25), above that nothing (0.19 to 0.09). Arithmetic; the frames' levels are in the round's report.
  // Round A7 (CONTRACT 19.3; with the pelmet, whose hem hangs at 4.35 m): 110 cd / reach 4.2 -> 105 / 5.0, the aim
  // as it was: the amber is still alive where the pelmet cuts it, so it ends in a line. By the same law
  // (scratch/shell/wash-a6.mjs; round A6 in brackets): 0.8 m 2.31 (2.41), 2 m 1.11 (1.10), 3 m 0.44 (0.34), 3.5 m
  // 0.25 (0.13), 4 m 0.12 (0.02), 4.5 m 0.04 (0), nothing above 5.1 m (behind the pelmet).
  wash: 105, washReach: 5.0, washAim: 8,
  // the floor lights' scallops on the cloth, as light (./shell/glsl.js BACKDROP_LIGHT; 0 = off, for an on / off pair)
  scallops: 1,
  // the cloth's relief under the wash (round A5: the frame's rails as ridges, the bow between them, the tension's
  // ripples: light, ./shell/glsl.js BACKDROP_RELIEF; 0 = flat cloth, for an on / off pair)
  relief: 1,
  // a drape light behind each seating block (a tube; candela-like for the whole batten) and its reach. Round A3: the
  // drape's painted mean went 0.0479 (0.0786 x its fold paint 0.609) -> 0.0254 (0.035 / 0.838 x 0.609), so its light
  // goes UP by 1.883: 300 -> 565. Its other receivers do not see it: the top deck faces up over the batten (0 units),
  // the guard rail's hall side takes 0.006
  // Round A4: the battens are NEUTRAL TO WARM like the house floods (1.0, 0.95, 0.88): they were a cool blue (0.80,
  // 0.88, 1.0), and under the house light the drape's lower band read blue against the warm floods (CONTRACT 16.1:
  // the backdrop's amber is the only colour in the hall; the light role's finding of 06:08Z). The level keeps the
  // battens' luminance: 565 x 0.872 / 0.955 = 516. It stays 516 under the house light: the half-way bake of 06:29Z
  // (battens at 516, the light role's wall washers on the perimeter truss in it) read 2.8 units on the north drape at
  // 3 m and 3.6 at 5 m (level 28 and 35 on the cloth's mean: inside the 25-45 of CONTRACT 16.2 for its ridges, and
  // brighter up the wall than at its foot, as a hall lit from its roof is). The unoccluded sum had said 5.6 units at
  // 3 m, and for a minute (06:34Z to 06:35Z, no bake ran on it) the battens stood at 200 on that sum; the bake's own
  // number is half of it (the blocks stand in the floods' and the battens' way): that cut would have left 3 m near 20.
  // Round A5: 516 -> 190. The walls fall to near black (CONTRACT 17.1, 17.2: the drape 12-25 in its lower third, 5-14
  // in its upper half), the light role's wall washers are off (the ask of round A4 is withdrawn: no photograph shows
  // a washed black drape), and its floods and ambient leave the drape at 1.3 units at 3 m behind a block and 0.7 above
  // 4.5 m (scratch/light/LEVELS-A5.md, which allows the battens up to 1.3 units between 2 and 3.5 m and nothing above
  // 4.5 m). By round A4's bake 516 gave 2.2 units at 3 m and 0.4 at 5 m: 190 adds 0.8 and 0.15.
  // After the half-way bake (the drape's upper half read 15 to 16 where no beam of the rig crosses it, against 5-14):
  // the battens' REACH 9 -> 5.5 m, the level stays. A batten stands on the floor behind its block and grazes the
  // cloth upward; by the tube's law on the flat wall plane (scratch/shell/batten-a5.mjs, no pleats, no stands) its
  // light is 0.78 units at 3 m (was 0.83), 0.41 at 3.7 m (0.50), 0.14 at the start of the upper half (0.27), 0.08 at
  // 5 m (0.22) and nothing from 6 m up (was 0.12): the lower third keeps its light behind the stands, the upper half
  // loses the battens' share. The reach is the room light's finite window (a look value of the light model, as a
  // hood on the batten would be; not a photometric file).
  // Round A6, after the half-way bake (the light role's reading: the drape's lower third at 9 and 12 against the
  // row's 12-25, the upper half at 13 and 14 against 5-14; the rig's haze no longer veils the cloth and the
  // ambient's side row went down): 190 at 5.5 m -> 300 at 5.0 m. By the same law (scratch/shell/batten-a6.mjs): 1.18
  // units at 3 m (was 0.78), 0.72 at 3.5 m (0.50), 0.41 at 4 m (0.31), 0.20 at 4.5 m (0.18), 0.08 at 4.9 m (0.10),
  // nothing from 5 m: more in the lower third above the stands, the upper half as it was.
  house: 300, houseReach: 5.0, houseTint: [1.0, 0.95, 0.88],
  // a floor light's lit face (HDR; a bloom source: a source's face, not a light level: it stays where A2 had it)
  lens: 6.0,
  // an exit sign (SIGN below): its lit face (a saturated green that the tone curve does not wash to mint; 1.5 did;
  // 0 = the signs dark, for an on / off pair), the hot band in it (`signCore`: the LED row behind the opal, over the
  // post chain's bloom threshold of 1.35 in luminance: a source reads as a source, CONTRACT 17.4) and the window in
  // the box's underside (`signDown`: an exit luminaire's down light; what falls on the lintel and the reveal)
  // (after the half-way frames: the window 2.0 -> 3.5: a clear slot onto the LED row, brighter than the row through
  // the opal; the pier under the box read 20 against 16 beside it at 2.0: a fringe, not a falloff. 0.95 units of
  // green 15 cm under the box now. Not baked: the shell's own shader term, ./shell/glsl.js SIGN_LIGHT.)
  sign: 0.55, signCore: 3.0, signDown: 3.5,
  // Round A6, the exit doors (CONTRACT 18.1: the leaves at least 4 levels under the drape beside them). `doorBack`
  // (metres; GEOMETRY, handed to ./shell/plan.js and held by the signature): how much deeper the door's reveal is:
  // the pier becomes a door lobby that stands 0.30 m + this into the hall, the door pair at the end of it; 0 = round
  // A5's pier. `doorGap`: the line of light under a door pair (the lit corridor behind it, seen through the gap at
  // the leaves' foot): a warm white slot's radiance; 0 = none. Needs the lobby.
  // Round A7 (CONTRACT 19.3: the leaves 3-8, "a black mouth" no more): the lobby 1.2 m -> 0.6 m into the hall
  // (`doorBack` 0.9 -> 0.3): from the end of a reveal 0.57 m deep a leaf sees 0.44 to 0.63 of the hall (0.27 to 0.45
  // at 1.17 m: scratch/shell/see-a7.mjs). The slot's radiance 0.25 -> 0.45 (luminance 0.39: far under the bloom
  // threshold of 1.35).
  // Round A8 (CONTRACT 20.2 row 4: the leaves at least 3 under the cloth beside them): the lobby 0.6 m -> 0.9 m
  // (`doorBack` 0.3 -> 0.6). The drape wash lights leaf and cloth alike, so only shade moves the two apart: base at
  // V10, one tree, paint 0.05: the leaves 14.7 / 13.8 -> 12.8 / 11.8 beside cloth at 12.9. Not 1.2 m (10.5 / 9.8):
  // from the door corner the south flank then hides one leaf of the pair.
  doorBack: 0.6, doorGap: 0.45,
  // Round A7 (CONTRACT 19.3). `doorKit` (GEOMETRY, handed to ./shell/plan.js and held by the signature): 1 = a door
  // pair is two leaves in a dark paint (TONE.door) inside a painted frame, a kick plate on each leaf, a slot 14 mm high
  // under them; 0 = round A6's bare leaves. `pelmet` (GEOMETRY, the same way): 1 = a pelmet of black serge across the
  // backdrop's head, the cloth's face ends at its hem. `foldOpen` (paint, not geometry): 1 = no fold of the drape is
  // painted closed (./shell/plan.js drapePleats `mouth`).
  doorKit: 1, pelmet: 1, foldOpen: 1,
  // the roof's bells on the lid (round A5, CONTRACT 17.2 for the roof: the lid and the trays read only where a lit
  // fixture is near; ./shell/glsl.js ROOF_LIGHT, the high tier): what a bell at full level leaks straight up through
  // its top, candela-like. Nothing in the bake points up (the lid holds 0.08 to 0.12 units), so without this the
  // whole roof is black. 0 = off (and the matt material's program is the one without the term).
  // 4.5: by the rig's 39 lit bells (levels 0.57 to 0.98; scratch/shell/roof-try.mjs) the deck straight over a bell
  // takes 1.25 to 2.14 units, 0.5 to 0.9 midway to its nearest neighbour, nothing over the table's rig; 43 % of the
  // lid stays under a tenth of a unit. As a share of a house bell's light it is a leak of a few per cent.
  // Round A6: 0 by default. The hall's bake carries the bells' uplight now (the rig's bake-only emitters
  // `roof.up.*`, on the lid's chart and in the volume), so this stand-in would light the lid twice. The row and its
  // shader stay for an on / off pair (`?arenahall=bellUp:4.5`; round A5 stood at 4.5).
  bellUp: 0,
  // Round A6 (CONTRACT 18.2: the roof by the bake, on every tier). `roofChart` (GEOMETRY of the light map, handed to
  // ./shell/plan.js and held by the signature): 1 = the lid and its deck ribs are a sixth mesh, `arenaHallRoof`, on
  // the hall's light map (two half charts of the kind `roof`, in the atlas's free corner: the six other charts do
  // not move); 0 = the lid in the matt mesh on the bake's volume, as until round A5.
  roofChart: 1,
  // the carpet's gloss (room/light.js FLOOR_GLOSS terms): a matt loop pile keeps a little of the lamp's glare at grazing angles
  sheen: 0.30, emitterGloss: 0.25, knee: 0.02, cap: 0.05,
  // the main lamp's pool on the carpet (room/light.js POOL: tangents of the fade, gain on the lamp's direct light)
  poolT0: 0.48, poolT1: 7.8, poolGain: 2.2,
  // the table's shadow on the carpet under the emitters (room/light.js TABLE_BLOCK): strength, and the edge width at the
  // table top (m). The strength is a LOOK value of the analytic light (round A1); a bake replaces it with the real figure.
  tableBlock: 0.64, tableBlockSoft: 0.24,
  // THE ALBEDOS (round A3, CONTRACT 15.2): mean diffuse reflectance, linear luminance, from the layout's table. Each
  // surface's colour (map x material colour x vertex colour) is scaled so that its MEAN lands on the value; the hue is
  // the palette's. Not look values: a frame is fixed by the light. (A2 stood at: island 0.032, carpet 0.016, drape about
  // 0.045, backdrop 0.028.) `trim`: the edging profile on the island's joint (no row in the table). Round A4: an
  // anodised aluminium ramp edge, satin, 0.45 as a matt stand-in (round A3 built a grey PVC one at 0.30: a change of
  // the MATERIAL CLASS, stated in the report, not a level fitted to a frame).
  island: ALBEDO.island, carpet: ALBEDO.carpet, drape: ALBEDO.drape, backdrop: ALBEDO.backdrop, trim: 0.45,
  // the carpet's own shading (./shell/glsl.js CARPET): seams, the sheen and the lean at a low angle, wear, mottle, tracks
  carpetSeam: CARPET.seam, carpetSheen: CARPET.sheen, carpetLean: CARPET.lean, carpetWear: CARPET.wear, carpetMottle: CARPET.mottle, carpetTracks: CARPET.tracks,
  // (round A5: the island's tiles: their lay against the light, the yarn's grain at two scales, a tile seam's strength)
  carpetLay: CARPET.lay, carpetGrain: CARPET.grain, carpetGrain2: CARPET.grain2, carpetTileSeam: CARPET.tileSeam,
  // Round A6 (CONTRACT 18.1: the carpet's sheen in the frame). `carpetV4`: 1 = the floor takes the carpet patch v4
  // (./shell/glsl.js: the nap against the island's directed light, the fitter's hand, the walked ring, tape); 0 = v3.
  // Its rows: the pile's lean (the sine of its angle), the share of tiles turned half round, the share laid like
  // their neighbour, the tape pieces on / off. Tools: `?arenahall=carpetNap:0,carpetLean:0,carpetSheen:0,
  // carpetTracks:0` is the off arm of the nap's pair (the same tiles, wear and tape, no lean).
  carpetV4: 1, carpetNap: CARPET_4.nap, carpetFlip: CARPET_4.flip, carpetSwap: CARPET_4.swap, carpetTape: CARPET_4.tape,
  // (after the half-way bake the rig frames each table key with two SIDE blades: `carpetSides` 1 = the carpet's light
  // model reads them when the rig's plan has them (the variant `arena-carpet-v4s`), 0 = not, 2 = always, a tool)
  carpetSides: CARPET_4.sides,
  // Round A7 (the carpet at the broadcast pose without a checker at V10). `carpetV5`: 1 = the patch v5
  // (./shell/glsl.js: ONE lay by a fitter's hand, the machine's lanes soft-edged, the pile pressed flat where people
  // walk); 0 = v4. Its own rows (v4's rows of the same meaning are not read then): the pile's lean, the shares of
  // tiles half-turned and quarter-turned, the spread of a tile's lean, how far a tile lies off the line, the lanes'
  // strength and edge, the flattening. Tools: `?arenahall=carpetNap5:0,carpetLean:0,carpetSheen:0,carpetTracks5:0`
  // is the off arm of the nap's pair under v5.
  carpetV5: CARPET_5.on, carpetNap5: CARPET_5.nap, carpetFlip5: CARPET_5.flip, carpetSwap5: CARPET_5.swap, carpetSpread5: CARPET_5.leanSpread,
  carpetOff5: CARPET_5.off, carpetTracks5: CARPET_5.tracks, carpetSoft5: CARPET_5.soft, carpetFlat5: CARPET_5.flat,
  // the pile's relief (normal scale) on the code-drawn map and on a scan
  pile: 0.7, pileScan: 0.6, pileScanBase: 0.4,
  // the drape's nap (normal scale of `arena.drape.normal` laid at SCANS.drape.tile)
  nap: 0.8,
});

// the hall's own dark surfaces, linear albedo (the palette's hex values are the carpets', the backdrop's and the wash's)
const TONE = Object.freeze({
  // the drape's HUE only (a black serge, a hair cool); its level is HALL.drape: the mean of the cloth's tone over the
  // whole drape lands on it (round A3; A2 held the ridges at 8 % because lower sat under the grade's toe: that is the
  // light's to fix now, not the cloth's)
  drapeRidge: [0.078, 0.078, 0.086],
  // the pipe-and-base rail: aluminium tube gone dull (uprights and crossbars), black steel base plates
  wall: [0.040, 0.041, 0.045], pipe: [0.18, 0.185, 0.195], base: [0.05, 0.05, 0.055], conduit: [0.10, 0.10, 0.11],
  // the roof's deck: dark painted steel, 0.08 (round A4: the crests were 0.105 and the flutes 0.42 of that: a look
  // value that stood in for a shadow no light cast). `flute`: what the bottom of a flute 6 cm deep and 17 cm wide
  // keeps of a diffuse light from below (its own occlusion; the webs are geometry on the high tier).
  deck: [0.078, 0.080, 0.085], flute: 0.75, duct: [0.17, 0.175, 0.185],
  // under the deck: a cable tray with its cables (galvanised steel under black rubber), a dark painted eaves beam
  tray: [0.11, 0.113, 0.12], beam: [0.068, 0.070, 0.075],
  // an exit door (round A5: a dark recess): leaves in a black paint (0.04, the albedo table's matt black, CONTRACT
  // 15.2; round A8, a material change made for CONTRACT 20.2 row 4: at 0.05 the leaves read level with the cloth
  // beside them; round A4's charcoal at 0.095 read lighter), the pier they stand back in (the hall's own dark wall
  // paint), a brushed stainless push bar and an aluminium threshold as matt stand-ins, the sign's black box
  door: [0.039, 0.040, 0.042], pier: [0.040, 0.041, 0.045], portal: [0.040, 0.041, 0.045], bar: [0.25, 0.255, 0.265], threshold: [0.28, 0.285, 0.30], signBox: [0.03, 0.03, 0.032],
  // round A6, a door at the end of its passage: leaves in a dark satin paint (0.035; the matt material shows no
  // gloss: the satin is stated, not drawn), the passage's floor (a black rubber mat, 0.05), the slot under the
  // leaves as a warm white (its level is HALL.doorGap)
  doorDeep: [0.0343, 0.0350, 0.0371], mat: [0.050, 0.050, 0.052], gap: [1.0, 0.86, 0.66],
  // round A7, what says "door": the frame round the leaves in a grey paint (0.22), a kick plate of brushed stainless
  // steel as a matt stand-in (0.20: the matt material has no mirror; a declared stand-in, as the push bar is)
  doorFrame: [0.215, 0.220, 0.228], kick: [0.196, 0.200, 0.208],
  housing: [0.020, 0.020, 0.022], frame: [0.16, 0.165, 0.175], rail: [0.26, 0.27, 0.29],
  binding: 0.42,                        // lite: the bound edge against the outer carpet
});
/** An exit sign's lit face (round A4): a running light, a plain green rectangle and nothing on it. Scene-linear radiance
 * (a source's face, like the wash bars' lenses: not a light level; it registers no emitter). */
export const SIGN = Object.freeze({ color: [0.02, 0.95, 0.28], level: 0.55, core: 3.0, down: 2.0 });

/** The scans the assets role ships (CONTRACT 14.2) and how they are laid: metres per repeat. Until a file is in the
 * manifest the code-drawn canvases stay (the degrade law). `scratch/assets/READY.md` names the tiling: change it HERE. */
export const SCANS = Object.freeze({
  // a loop-pile scan whose record says 1.7 m per tile (loops of 7 mm: a coarse wool berber with dark specks). Laid at
  // 0.85 m (round A3; 1.1 m in A2) the loops are 3.5 mm, a tight contract loop pile, and a speck is 5 to 10 mm; the
  // specks' depth is taken down by the patch's contrast law (./shell/glsl.js "scan"). Its rows of loops run along
  // U = the island's rolls (x). With the roughness scan (mean 0.65) the material's roughness is 1.45: the product is
  // the carpet's 0.94 (three clamps at 1).
  carpet: Object.freeze({ color: 'arena.carpet.color', normal: 'arena.carpet.normal', rough: 'arena.carpet.rough', tile: 0.85, roughness: 1.45 }),
  // a napped wool cloth, normal map only. On the backdrop at its true scale (close range); on the drape larger than life
  // (true scale is far below a pixel from anywhere a camera stands: at 1.2 m it is the cloth's unevenness across a fold)
  cloth: Object.freeze({ normal: 'arena.drape.normal', tile: [0.274, 0.273] }),
  drape: Object.freeze({ normal: 'arena.drape.normal', tile: 1.2 }),
});
/** The code-drawn pile: metres per repeat, loops per repeat and canvas size by detail. */
export const PILE = Object.freeze({ tile: 0.8, felt: 0.35, loops: [80, 160, 240], px: [256, 512, 1024] });
/** The backdrop's weave: metres per repeat, threads per repeat, canvas size (detail 1 and 2). */
export const WEAVE = Object.freeze({ tile: 0.4, threads: 128, px: [0, 256, 512] });
export const CARPET_TILE = PILE.tile;
export { CARPET_MEAN };

// ---- merged-geometry builder (the club shell's, reduced: positions, normals, UVs, vertex colours, the light-map chart) -----
class Builder {
  constructor(atlas = null, { sides = false } = {}) {
    this.p = []; this.n = []; this.uv = []; this.c = []; this.i = [];
    this.atlas = atlas; this.lmc = []; this.lmu = []; this.lmv = []; this.lmd = [];
    this.side = sides ? [] : null; // the `roomSide` attribute (room/light.js: a side index plus a mark as a binary fraction)
  }
  get count() { return this.p.length / 3; }
  vert(P, N, uv, col, side = 0) {
    this.p.push(P.x, P.y, P.z); this.n.push(N.x, N.y, N.z); this.uv.push(uv[0], uv[1]); this.c.push(col[0], col[1], col[2]);
    this.lmc.push(-1); this.lmu.push(0); this.lmv.push(0); this.lmd.push(-1e9);
    if (this.side) this.side.push(side);
    return this.count - 1;
  }
  /** Four points, counter-clockwise as seen from the lit side. `cols`: one colour or four; `normals`: null (flat) or four;
   * `sides`: null or four `roomSide` values. */
  quad(pts, uvs, cols, normals = null, sides = null) {
    const G = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[0]));
    if (G.lengthSq() < 1e-14) G.subVectors(pts[2], pts[1]).cross(new THREE.Vector3().subVectors(pts[0], pts[1]));
    G.normalize();
    const perVert = Array.isArray(cols[0]);
    const ix = pts.map((P, k) => this.vert(P, normals ? normals[k] : G, uvs ? uvs[k] : [0, 0], perVert ? cols[k] : cols, sides ? sides[k] : 0));
    this.i.push(ix[0], ix[1], ix[2], ix[0], ix[2], ix[3]);
    if (this.atlas) {
      const r = this.atlas.classify(pts, G);
      if (r) for (let k = 0; k < 4; k++) { this.lmc[ix[k]] = r.chart; this.lmu[ix[k]] = r.uv[k][0]; this.lmv[ix[k]] = r.uv[k][1]; this.lmd[ix[k]] = r.depth[k]; }
    }
  }
  /** Faces of an axis-aligned box: any of x- x+ y- y+ z- z+ given as 'w e b t n s' (west, east, bottom, top, north, south). */
  box(x0, x1, y0, y1, z0, z1, faces, col) {
    if (faces.includes('t')) this.quad([V(x0, y1, z0), V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0)], null, col);
    if (faces.includes('b')) this.quad([V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1)], null, col);
    if (faces.includes('e')) this.quad([V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1)], null, col);
    if (faces.includes('w')) this.quad([V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0)], null, col);
    if (faces.includes('s')) this.quad([V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)], null, col);
    if (faces.includes('n')) this.quad([V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0)], null, col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.side) g.setAttribute('roomSide', new THREE.Float32BufferAttribute(this.side, 1));
    if (this.atlas) {
      const lm = new Float32Array(this.count * 2);
      for (let k = 0; k < this.count; k++) {
        if (this.lmc[k] < 0) continue;
        const [s, t] = this.atlas.uv(this.lmc[k], this.lmu[k], this.lmv[k]);
        lm[2 * k] = s; lm[2 * k + 1] = t;
      }
      g.setAttribute('lm', new THREE.BufferAttribute(lm, 2));
      // for the bake tool only (never uploaded): the chart and the depth out of the chart plane, per vertex (NaN = own normal)
      g.userData.lm = { chart: Int16Array.from(this.lmc), depth: Float32Array.from(this.lmd), normal: new Float32Array(this.count * 3).fill(NaN) };
    }
    g.setIndex(this.i);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, name) {
    const m = new THREE.Mesh(this.geometry(), material);
    m.name = name;
    m.matrixAutoUpdate = false;
    return m;
  }
}

/** A wall frame: origin at the wall's left end at floor level (seen from inside), inward normal a, tangent t to the right. */
const frame = (o, a) => ({ o, a, t: new THREE.Vector3().crossVectors(UP, a).normalize() });
const P = (f, s, d, h) => V(0, 0, 0).copy(f.o).addScaledVector(f.t, s).addScaledVector(f.a, d).addScaledVector(UP, h);

/**
 * A pleated drape over one wall (./shell/plan.js drapePleats). Each pleat is one period of a rounded wave out of the wall;
 * the cloth is fuller at the hem than at the head and wanders along the wall on its way down. Where a camera can see the
 * wall's foot (`wall.foot`) the hem breaks a hand above the floor, spreads on it and ends in a strip that lies flat
 * (built into `M`, the matt mesh: a strip on the floor has no place in a wall's light-map chart).
 * Normals are the surface's own (they follow the wave and the cloth's flare). The vertex colour paints the cloth's uneven
 * nap from pleat to pleat and two shades of self-shadow: a DEEP fold's own (a closed fold goes toward black, a join is
 * black: far below a light-map texel, it stays under a bake), and an open valley's (UNSHADE.factor: the analytic light has
 * no shadow; under a baked map the room light divides it out again on the marked vertices, the map holds the real one).
 * UVs are metres of cloth (along the pleats' arc, up the wall): the nap's normal map tiles on them.
 * `acc` (optional) sums over the cloth's area: `area`, `tone` (the CLOTH's own shade: pleat tone x the head's dust; the
 * albedo law pins its mean) and `paint` (the tone times the painted fold shade: what the vertex colours hold). With
 * `B` null nothing is built (a dry run for the sums).
 */
function drape(B, M, f, wall, pleats, { steps, bands, hem, flat = false }, D, F, col, acc = null, vRow = 0) {
  // (the lite tier since round A5: flat cloth with the folds as a map)
  if (flat) { flatDrape(B, f, wall, pleats, D, col, acc, vRow); return; }
  const HD = D.height, fu = D.fullness;
  // the cloth's head hangs under the pipe on its ties (and sags between two of them: a column's `drop`)
  const head = HD - D.pipe - (D.headGap ?? 0);
  // rows from the floor to the head: [height, the pleat's wander key, fullness, shade]
  // (`over`: a door bay's header: the cloth starts at `D.header` above the floor, its hem hanging free there)
  const rowsOf = (foot, over = false) => {
    if (over) {
      const rows = [[D.header, 'mid', fu.mid, 0.97]];
      if (bands >= 2) rows.push([0.78 * HD, 'sway', 0.5 * (fu.mid + fu.head), 0.93]);
      rows.push([head, null, fu.head, 0.86]);
      return rows;
    }
    const rows = [[0, 'lean', foot ? fu.hem : 1.0, 1.0]];
    if (foot) rows.push([D.hemBreak, 'lean', fu.low, 1.0]);
    if (bands >= 3) { rows.push([0.42 * HD, 'mid', fu.mid, 0.97], [0.78 * HD, 'sway', 0.5 * (fu.mid + fu.head), 0.93]); } else if (bands === 2) rows.push([0.45 * HD, 'mid', fu.mid, 0.97]);
    rows.push([head, null, fu.head, 0.86]);
    return rows;
  };
  const inFoot = (s) => hem && wall.foot.some(([a, b]) => s >= a && s <= b);
  // one column of vertices: the pleat it belongs to, its phase, and whether it stands at the end of a stretch of cloth
  // (no wander there: the cloth is tied to its upright). A pleat is one period of a rounded wave; a JOIN is a lap: the
  // width's free edge stands out over three quarters of the pleat and goes straight back to the wall (a sawtooth).
  const column = (p, ph, end) => {
    const s = p.s + p.w * ph;
    let lift, dl;                                            // the fold's height 0..1 and its slope per unit of phase
    if (p.join) { const x = Math.min(1, ph / 0.75); lift = Math.sin(0.5 * Math.PI * x); dl = ph < 0.75 ? ((0.5 * Math.PI) / 0.75) * Math.cos(0.5 * Math.PI * x) : 0; }
    else { lift = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph); dl = Math.PI * Math.sin(2 * Math.PI * ph); }
    const k0 = UNSHADE.factor * p.valley;                    // the valley's shade: an open valley's times a deep fold's
    return { p, s, lift, slope: (p.A * dl) / p.w, k: (k0 + (1 - k0) * lift ** 0.8) * p.tone, tone: p.tone, end,
      drop: p.drop ? p.drop[0] + (p.drop[1] - p.drop[0]) * ph : 0, side: lift < 0.01 ? UNSHADE.mark : 0, arc: 0 };
  };
  let lo = 0, hi = wall.L, header = false;                   // the stretch of cloth being built (between two door bays, or a bay's header)
  const clampS = (v) => Math.min(hi, Math.max(lo, v));
  const at = (c, row, r, foot) => {
    // (the wander dies away over the last half metre of a stretch: the cloth is tied to its upright there, and no
    // fold may cross the stretch's end)
    const fade = Math.min(1, Math.max(0, Math.min(c.s - lo, hi - c.s) / 0.5));
    const off = c.end || !row[1] ? 0 : c.p[row[1]] * (r === 1 && foot ? 0.9 : 1) * fade;
    // the hem spreads on the floor: a ridge's foot stands further out than its fold
    const spread = foot && r === 0 ? c.p.hem * (0.35 + 0.65 * c.lift) : 0;
    // (a header's hem hangs free over the door: a hand's breadth uneven from fold to fold)
    const free = header && r === 0 ? (c.p.hem - 0.08) * 0.4 : 0;
    return P(f, clampS(c.s + off), 0.03 + c.p.A * c.lift * row[2] + spread, row[0] - (row[1] ? 0 : c.drop) + free);
  };
  // the surface normal at a column on a row: a - t * (dd/ds) - up * (dd/dh), from the neighbouring rows' fullness
  const nrm = (c, rows, r) => {
    const lo = rows[Math.max(0, r - 1)], hi = rows[Math.min(rows.length - 1, r + 1)];
    const dh = Math.max(1e-3, hi[0] - lo[0]);
    const ddh = (c.p.A * c.lift * (hi[2] - lo[2])) / dh;
    return V(0, 0, 0).copy(f.a).addScaledVector(f.t, -c.slope * rows[r][2]).addScaledVector(UP, -ddh).normalize();
  };
  // the stretches of cloth: the runs of pleats between the door bays, and the header over each bay (`over` pleats)
  const stretches = [];
  { let run = []; for (const p of pleats) { if (run.length && !!run[0].over !== !!p.over) { stretches.push(run); run = []; } run.push(p); } if (run.length) stretches.push(run); }
  for (const list of stretches) {
    const last = list[list.length - 1], over = !!list[0].over;
    lo = list[0].s; hi = last.s + last.w; header = over;
    const cols = [];
    list.forEach((p, i) => { for (let j = 0; j < steps; j++) cols.push(column(p, j / steps, i === 0 && j === 0)); });
    // (the stretch's last column: back at the wall, tied to its upright, hanging as far under the pipe as the pleat's end)
    cols.push({ ...column({ ...last, join: false }, 0, true), s: hi, drop: last.drop ? last.drop[1] : 0 });
    // metres of cloth along the wall (the arc over the pleats at mid fullness)
    for (let k = 1; k < cols.length; k++) cols[k].arc = cols[k - 1].arc + Math.hypot(cols[k].s - cols[k - 1].s, (cols[k].p.A * cols[k].lift - cols[k - 1].p.A * cols[k - 1].lift) * fu.mid);
    for (let k = 0; k < cols.length - 1; k++) {
      const a = cols[k], b = cols[k + 1];
      const foot = !over && inFoot(0.5 * (a.s + b.s));
      const rows = rowsOf(foot, over);
      for (let r = 0; r < rows.length - 1; r++) {
        const r0 = rows[r], r1 = rows[r + 1];
        const q = [at(a, r0, r, foot), at(b, r0, r, foot), at(b, r1, r + 1, foot), at(a, r1, r + 1, foot)];
        if (acc) {
          const ar = quadArea(q);
          acc.area += ar; acc.tone += ar * 0.5 * (a.tone + b.tone) * 0.5 * (r0[3] + r1[3]); acc.paint += ar * 0.5 * (a.k + b.k) * 0.5 * (r0[3] + r1[3]);
        }
        if (!B) continue;
        B.quad(q,
          [[a.arc, r0[0]], [b.arc, r0[0]], [b.arc, r1[0]], [a.arc, r1[0]]],
          [mul(col, a.k * r0[3]), mul(col, b.k * r0[3]), mul(col, b.k * r1[3]), mul(col, a.k * r1[3])],
          [nrm(a, rows, r), nrm(b, rows, r), nrm(b, rows, r + 1), nrm(a, rows, r + 1)], [a.side, b.side, b.side, a.side]);
      }
      if (foot && B) {
        // the hem rests on the floor: a strip that lies flat from the fold's foot outward (6 mm above the carpet)
        const lift = (pt) => V(pt.x, F + 0.006, pt.z);
        const pa = at(a, rows[0], 0, true), pb = at(b, rows[0], 0, true);
        const out = (pt, c) => lift(pt).addScaledVector(f.a, 0.03 + 1.3 * c.p.hem * (0.4 + 0.6 * c.lift));
        M.quad([out(pa, a), out(pb, b), lift(pb), lift(pa)], null, [mul(col, 0.8 * a.k), mul(col, 0.8 * b.k), mul(col, 0.55 * b.k), mul(col, 0.55 * a.k)], [UP, UP, UP, UP]);
      }
    }
  }
}

/** The painted shade of pleat `p` at phase `ph` (0..1 across it): the law of drape()'s columns (a pleat's own tone, the
 * shade of its valley; a lap rises over three quarters of its width and goes straight back to the wall). */
function foldShadeAt(p, ph) {
  const lift = p.join ? (ph <= 0.75 ? Math.sin(0.5 * Math.PI * (ph / 0.75)) : 1 - (ph - 0.75) / 0.25) : 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
  const k0 = UNSHADE.factor * p.valley;
  return (k0 + (1 - k0) * Math.max(0, lift) ** 0.8) * p.tone;
}
/** The fold shade along a wall of length L at `n` equal steps (the lite tier's fold map: ./shell/tex.js foldsMap). */
export function foldRow(pleats, L, n) {
  const out = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * L;
    while (k < pleats.length - 1 && s >= pleats[k].s + pleats[k].w) k += 1;
    const p = pleats[k];
    out[i] = foldShadeAt(p, Math.min(1, Math.max(0, (s - p.s) / p.w)));
  }
  return out;
}
/** How far the lite tier's flat cloth stands off its wall (the folds' mean) and the head's dust at the cloth's top. */
const FLAT_DRAPE = Object.freeze({ off: 0.10, headShade: 0.88, px: 1024 });

/**
 * The lite tier's drape over one wall (round A5): FLAT cloth, one quad per stretch (the runs between the door bays, and
 * the header over each bay), that carries the high tier's folds as a map along the wall (`vRow`: the wall's row in
 * ./shell/tex.js foldsMap). Round A4's lite drape hung wide pleats of its own (0.9 m, two columns each): from the stands
 * it read as flat panels, and its large faces took the battens' light 13 levels over the high tier's wall. Flat cloth
 * is baked as a flat wall; the folds are the painted shade the full tiers hold per vertex, at the same places.
 * The vertex colour is the cloth's colour x FOLD_MAP_SCALE (the map holds the shade / that) x the head's dust.
 * `acc` sums area, tone and paint as drape() does.
 */
function flatDrape(B, f, wall, pleats, D, col, acc, vRow, rows = 4) {
  const head = D.height - D.pipe - (D.headGap ?? 0), d = FLAT_DRAPE.off, v = (vRow + 0.5) / rows;
  const shadeAt = (y) => 1 - (1 - FLAT_DRAPE.headShade) * (y / head);
  const stretches = [];
  { let run = []; for (const p of pleats) { if (run.length && !!run[0].over !== !!p.over) { stretches.push(run); run = []; } run.push(p); } if (run.length) stretches.push(run); }
  for (const list of stretches) {
    const last = list[list.length - 1], over = !!list[0].over, lo = list[0].s, hi = last.s + last.w, y0 = over ? D.header : 0;
    if (acc) {
      const sm = 0.5 * (shadeAt(y0) + shadeAt(head));
      for (const p of list) {
        let k = 0; for (let j = 0; j < 8; j++) k += foldShadeAt(p, (j + 0.5) / 8) / 8;
        const ar = p.w * (head - y0);
        acc.area += ar; acc.tone += ar * p.tone * sm; acc.paint += ar * k * sm;
      }
    }
    if (!B) continue;
    const c0 = mul(col, FOLD_MAP_SCALE * shadeAt(y0)), c1 = mul(col, FOLD_MAP_SCALE * shadeAt(head));
    const n = V(f.a.x, f.a.y, f.a.z);
    B.quad([P(f, lo, d, y0), P(f, hi, d, y0), P(f, hi, d, head), P(f, lo, d, head)],
      [[lo / wall.L, v], [hi / wall.L, v], [hi / wall.L, v], [lo / wall.L, v]], [c0, c0, c1, c1], [n, n, n, n], [0, 0, 0, 0]);
  }
}

/**
 * The share of the hemisphere over a point that a parallel rectangle fills (its form factor, 0..1): the rectangle
 * [x0, x1] x [y0, y1] lies in a plane `h` in front of the point, whose foot on that plane is (px, py). The corner
 * formula of a differential area to a parallel rectangle, summed over the four quadrants with their signs.
 */
export function rectShare(px, py, h, x0, x1, y0, y1) {
  const f = (a, b) => {
    const sg = Math.sign(a) * Math.sign(b); a = Math.abs(a); b = Math.abs(b);
    if (a < 1e-9 || b < 1e-9) return 0;
    const A = Math.hypot(a, h), B = Math.hypot(b, h);
    return (sg * ((a / A) * Math.atan(b / A) + (b / B) * Math.atan(a / B))) / (2 * Math.PI);
  };
  return f(x1 - px, y1 - py) - f(x0 - px, y1 - py) - f(x1 - px, y0 - py) + f(x0 - px, y0 - py);
}

/** The area of a quad (two triangles), m2. */
function quadArea(q) {
  const e1 = new THREE.Vector3().subVectors(q[1], q[0]), e2 = new THREE.Vector3().subVectors(q[3], q[0]);
  const e3 = new THREE.Vector3().subVectors(q[1], q[2]), e4 = new THREE.Vector3().subVectors(q[3], q[2]);
  return 0.5 * (e1.cross(e2).length() + e3.cross(e4).length());
}

/**
 * The edging profile on the island's joint: a low ramp over the line where the island's carpet ends on the hall's
 * (plan.island), all the way round, in lengths of `trim.piece` (each a hair off the next in tone), mitred at the four
 * corners. Cross-section: from the carpet up a slope to a flat top `trim.top` wide at `trim.height`, down the other
 * slope; `trim.width` across. Its feet stand 1.5 mm proud of the floor (no fight with the carpet's plane).
 */
function edging(B, isl, trim, F, col, rnd) {
  const hw = trim.width / 2, ht = trim.top / 2, y0 = F + 0.0015, y1 = F + trim.height;
  // the cross-section from the island's side (d < 0) to the hall's side (d > 0): [offset from the joint, height, shade]
  const prof = [[-hw, y0], [-ht, y1], [ht, y1], [hw, y0]];
  const shade = [0.86, 1.0, 0.86];                               // the two slopes are scuffed a shade darker than the top
  // a side: the joint's line from corner to corner, `out` = the outward direction; a point at (s along, d outward)
  const sides = [
    { a: [isl.x0, isl.z0], b: [isl.x1, isl.z0], out: [0, -1] }, { a: [isl.x1, isl.z0], b: [isl.x1, isl.z1], out: [1, 0] },
    { a: [isl.x1, isl.z1], b: [isl.x0, isl.z1], out: [0, 1] }, { a: [isl.x0, isl.z1], b: [isl.x0, isl.z0], out: [-1, 0] },
  ];
  for (const S of sides) {
    const L = Math.hypot(S.b[0] - S.a[0], S.b[1] - S.a[1]), t = [(S.b[0] - S.a[0]) / L, (S.b[1] - S.a[1]) / L];
    const n = Math.max(1, Math.round(L / trim.piece));
    // (a mitre: at offset d the side runs from -d to L + d along its line; a joint between two lengths is square)
    const pt = (s, d, y, end) => { const ss = end < 0 ? -d : end > 0 ? L + d : s; return V(S.a[0] + t[0] * ss + S.out[0] * d, y, S.a[1] + t[1] * ss + S.out[1] * d); };
    for (let k = 0; k < n; k++) {
      const s0 = (k / n) * L, s1 = ((k + 1) / n) * L, e0 = k === 0 ? -1 : 0, e1 = k === n - 1 ? 1 : 0;
      const tone = 0.9 + 0.2 * rnd();
      for (let j = 0; j < 3; j++) {
        const [d0, h0] = prof[j], [d1, h1] = prof[j + 1];
        const q = [pt(s0, d0, h0, e0), pt(s1, d0, h0, e1), pt(s1, d1, h1, e1), pt(s0, d1, h1, e0)];
        const G = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[3], q[0]));
        if (G.y < 0) q.reverse();
        B.quad(q, null, mul(col, tone * shade[j]));
      }
    }
  }
}

/** A round duct along an axis: the six lower faces of an octagon in `sections` lengths (each a hair off the next in tone). */
function duct(B, { axis, at, from, to, y, r, sections, col, rnd }) {
  const n = 8, len = (to - from) / sections;
  const ring = (k) => { const a = (k / n) * 2 * Math.PI; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const pt = (along, k) => { const [c, s] = ring(k); return axis === 'x' ? V(along, y + s, at + c) : V(at + c, y + s, along); };
  const nr = (k) => { const [c, s] = ring(k); return axis === 'x' ? V(0, s / r, c / r) : V(c / r, s / r, 0); };
  for (let q = 0; q < sections; q++) {
    const a0 = from + q * len, a1 = a0 + len, tone = mul(col, 0.86 + 0.28 * rnd());
    // (k = 3 .. 8: from just above the duct's side, round its underside, to just above the other side)
    for (let k = 3; k < 9; k++) {
      const pts = [pt(a0, k), pt(a0, k + 1), pt(a1, k + 1), pt(a1, k)], ns = [nr(k), nr(k + 1), nr(k + 1), nr(k)];
      const G = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[0]));
      if (G.dot(ns[0]) < 0) { pts.reverse(); ns.reverse(); }
      B.quad(pts, null, tone, ns);
    }
  }
}

/** The same wrap as ../adopt.js patch(), kept local for a page without the adoption service (a node arm, a bare dev page). */
function patchMaterial(club, material, spec) {
  try { if (typeof club?.adopt?.patch === 'function') return club.adopt.patch(material, spec) ? 'adopt' : 'kept'; } catch { /* the local wrap */ }
  const prevCompile = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  (material.userData.clubKeys ??= []).push(spec.key);
  material.onBeforeCompile = function arenaCompile(shader, renderer) {
    if (typeof prevCompile === 'function') prevCompile.call(this, shader, renderer);
    const r = applyPatchText(shader.vertexShader, shader.fragmentShader, spec);
    if (!r.ok) { console.error(`[club] arena: the carpet patch is skipped (anchors not found: ${r.missed.join(', ')})`); return; }
    Object.assign(shader.uniforms, spec.uniforms);
    shader.vertexShader = r.vs; shader.fragmentShader = r.fs;
  };
  material.customProgramCacheKey = function arenaKey() { return `${typeof prevKey === 'function' ? String(prevKey.call(this)) : ''}|club:${spec.key}`; };
  material.needsUpdate = true;
  return 'local';
}

/**
 * A loaded colour image measured in LINEAR light: { mean: [r, g, b], lum: Float32Array } or null (no 2D canvas, a tainted
 * image). `mean` is the mean over EVERY pixel (read in strips at the image's own size: a down-scaled copy would average
 * sRGB values and read a speckled scan too dark); `lum` is the luminance of the image's blocks on a grid of at most
 * `grid` x `grid` (block means in linear light: what a mip level a few steps down holds, the scale a standing viewer sees).
 */
function imageStats(image, grid = 256) {
  try {
    const W = image.naturalWidth || image.videoWidth || image.width, H = image.naturalHeight || image.videoHeight || image.height;
    if (!(W > 0 && H > 0)) return null;
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; lut[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
    const bw = Math.max(1, Math.ceil(W / grid)), bh = Math.max(1, Math.ceil(H / grid)), gw = Math.ceil(W / bw), gh = Math.ceil(H / bh);
    const lum = new Float32Array(gw * gh), cnt = new Uint32Array(gw * gh);
    const strip = Math.max(1, Math.min(H, Math.floor(1048576 / W) || 1));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = strip;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const sum = [0, 0, 0];
    for (let y0 = 0; y0 < H; y0 += strip) {
      const rows = Math.min(strip, H - y0);
      c2.clearRect(0, 0, W, strip);
      c2.drawImage(image, 0, y0, W, rows, 0, 0, W, rows);
      const d = c2.getImageData(0, 0, W, rows).data;
      for (let y = 0; y < rows; y++) {
        const gy = Math.floor((y0 + y) / bh) * gw;
        for (let x = 0, o = 4 * y * W; x < W; x++, o += 4) {
          const r = lut[d[o]], g = lut[d[o + 1]], b = lut[d[o + 2]];
          sum[0] += r; sum[1] += g; sum[2] += b;
          const c = gy + Math.floor(x / bw);
          lum[c] += 0.2126 * r + 0.7152 * g + 0.0722 * b; cnt[c] += 1;
        }
      }
    }
    for (let i = 0; i < lum.length; i++) lum[i] /= Math.max(1, cnt[i]);
    const mean = sum.map((v) => v / (W * H));
    return mean.every((v) => Number.isFinite(v) && v > 1e-4) ? { mean, lum, size: [W, H] } : null;
  } catch { return null; }
}

/**
 * The carpet material's colour under a scan (THE ALBEDO LAW): the scan keeps its texture, the table keeps the level.
 * `mean` = the scan's linear mean; `vertex` = the island's vertex colour; `target` = the island's albedo (luminance).
 * Returns { color, product }: the material's colour (it takes the scan's mean out; half of the scan's tint stays, a carpet
 * is never a pure grey) and `product` = mean x colour, scaled so that luminance(vertex x product) is `target` exactly.
 */
export function scanColour(mean, vertex, target) {
  const lum = lumaOf(mean);
  const tint = mean.map((c) => 1 / (0.5 * c + 0.5 * lum));
  const k = target / lumaOf(mean.map((c, i) => c * tint[i] * vertex[i]));
  const color = tint.map((t) => t * k);
  return { color, product: mean.map((c, i) => c * color[i]) };
}

/**
 * Build the hall's shell. `box` = { min, max } interior box in world metres (min.y = the floor); `detail` 0 | 1 | 2;
 * `levels` = HALL with any override. Registers its emitters on `roomLight` and returns
 * { group, floor: { mesh, material, albedo, albedoState() }, emissives, layout, materials, meshes, counts(), sides,
 *   lightmap, lightmapMeshes, emitterIds, plan, signature(), assetIds, ready, setTable(rect), uniforms, state() }.
 */
export function buildShell({ club = null, roomLight, box, detail = 1, levels = HALL, layout = ARENA }) {
  const x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z, F = box.min.y;
  const H = box.max.y - F;
  const full = detail >= 1;
  const bd = layout.backdrop;
  const plan = shellPlan(layout, detail, { doorBack: levels.doorBack, roofChart: levels.roofChart > 0, washAim: levels.washAim,
    doorKit: levels.doorKit > 0, pelmet: levels.pelmet > 0, foldOpen: levels.foldOpen > 0 });
  const isl = plan.island;             // the island's CARPET (inside the line the boards stand on: plan.ring)
  const sig = shellSignature(plan);
  const rnd = makeRand(20269);
  const notes = [];

  // ---- textures: canvases drawn here (./shell/tex.js); the club's cloth normal as pile on the base tier
  const px = PILE.px[detail], loops = PILE.loops[detail];
  const carpetMap = canvasTexture(carpetColor(px, loops), { srgb: true, repeat: [1 / PILE.tile, 1 / PILE.tile] });
  carpetMap.name = 'arena.hall.carpet.color';
  let pile = null, pileFrom = 'none';
  if (detail >= 2) {
    pile = canvasTexture(pileNormal(px, loops), { srgb: false, repeat: [1 / PILE.tile, 1 / PILE.tile] });
    pile.name = 'arena.hall.carpet.normal'; pileFrom = 'the loop pile drawn in code';
  } else if (detail === 1) {
    // (the asset service hands a second object on the id's one image when only the repeat differs: no second request, no
    // second upload: the base tier's pile costs no texture memory)
    const fallback = canvasTexture(flat(128, 128, 255), { srgb: false, repeat: [1 / PILE.felt, 1 / PILE.felt] });
    try { pile = club?.assets?.texture?.('felt.normal', { srgb: false, repeat: [1 / PILE.felt, 1 / PILE.felt], anisotropy: 8, fallback }) ?? fallback; } catch { pile = fallback; }
    pileFrom = 'felt.normal (the club cloth\'s weave, shared)';
  }
  const bl = bd.z1 - bd.z0, bh = bd.height;
  const bpx = detail === 0 ? [512, 256] : detail === 1 ? [1024, 512] : [2048, 1024];
  // (the backdrop's left end seen from the hall is its z1 end: positions along the wall count from there)
  // (its colour is the cloth alone; its ALPHA holds where the floor lights' beams land: read by the backdrop's patch)
  const backdropPlan = { length: bl, height: bh, modules: plan.backdrop.modules, rails: plan.backdrop.rails, lights: plan.lights.map((u) => ({ s: bd.z1 - u.z })), light: plan.light };
  const scallops = washScallops(SCALLOP_GRID[0], SCALLOP_GRID[1], backdropPlan);
  const backdropMap = canvasTexture(backdropColor(bpx[0], bpx[1], backdropPlan, scallops), { srgb: true });
  const washShare = scallopShare(scallops, SCALLOP_GRID[0]);
  backdropMap.wrapS = backdropMap.wrapT = THREE.ClampToEdgeWrapping;
  backdropMap.name = 'arena.hall.backdrop.color';
  let weave = null;
  if (full) {
    weave = canvasTexture(weaveNormal(WEAVE.px[detail], WEAVE.threads), { srgb: false, repeat: [bl / WEAVE.tile, bh / WEAVE.tile] });
    weave.name = 'arena.hall.backdrop.weave';
  }
  // the drape's nap: `arena.drape.normal` laid larger than life; a flat stand-in until the file arrives, and for good
  // without it (the asset service shows the file on this same object, so the drape's program never changes)
  let nap = null;
  if (full) {
    const rep = [1 / SCANS.drape.tile, 1 / SCANS.drape.tile];
    const fallback = canvasTexture(flat(128, 128, 255), { srgb: false, repeat: rep });
    try { nap = club?.assets?.texture?.(SCANS.drape.normal, { srgb: false, repeat: rep, anisotropy: 8, fallback }) ?? fallback; } catch { nap = fallback; }
  }
  // the lite tier's drape is flat cloth: the high tier's folds along each wall as one small map (./shell/tex.js
  // foldsMap: two pixel rows per wall, no mip levels: a level down would mix two walls)
  let foldMap = null;
  if (plan.pleat.flat) {
    const rows = plan.walls.map((w) => { const r = foldRow(plan.pleats[w.id], w.L, FLAT_DRAPE.px); for (let i = 0; i < r.length; i++) r[i] = Math.min(1, r[i] / FOLD_MAP_SCALE); return r; });
    foldMap = canvasTexture(foldsMap(rows), { srgb: true, anisotropy: 1 });
    foldMap.wrapS = foldMap.wrapT = THREE.ClampToEdgeWrapping;
    foldMap.generateMipmaps = false; foldMap.minFilter = THREE.LinearFilter;
    foldMap.name = 'arena.hall.drape.folds';
  }
  const lensMap = canvasTexture(lensCells(128, 16, 10), { srgb: true });
  lensMap.wrapS = lensMap.wrapT = THREE.ClampToEdgeWrapping;
  lensMap.name = 'arena.hall.washlens.cells';

  // ---- light-map charts: the carpet, the backdrop's face, then the four walls up to the drape's pipe (this order and
  // these sizes are the atlas: keep them)
  const atlas = createAtlas({ size: LM_SIZE });
  atlas.group('floor', { kind: 'floor', o: [x0, F, z0], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], w: x1 - x0, h: z1 - z0 });
  const fBack = frame(V(bd.x, F, bd.z1), V(1, 0, 0));
  atlas.group('wall:backdrop', { kind: 'wall', o: fBack.o.toArray(), u: fBack.t.toArray(), v: [0, 1, 0], n: [1, 0, 0], w: bl, h: bh });
  const frames = Object.fromEntries(plan.walls.map((w) => [w.id, frame(V(w.o[0], F, w.o[1]), V(w.a[0], 0, w.a[1]))]));
  const HD = plan.drape.height;
  for (const w of plan.walls) { const f = frames[w.id]; atlas.group(`wall:${w.id}`, { kind: 'wall', o: f.o.toArray(), u: f.t.toArray(), v: [0, 1, 0], n: f.a.toArray(), w: w.L, h: HD }); }
  // (round A6) the roof's lid on the light map: two half charts, AFTER the six (they pack into the atlas's free
  // corner at the kind's coarse density, so the six keep their rectangles: the node arm pins it). The seam between
  // the halves lies on the hall's centre line, over the rig's middle purlin row.
  const zMid = (z0 + z1) / 2;
  if (plan.roof.chart) {
    atlas.group('roof:0', { kind: 'roof', o: [x0, F + H, z0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], w: x1 - x0, h: zMid - z0 });
    atlas.group('roof:1', { kind: 'roof', o: [x0, F + H, zMid], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], w: x1 - x0, h: z1 - zMid });
  }
  const floorB = new Builder(atlas), backB = new Builder(atlas), drapeB = new Builder(atlas, { sides: true }), matt = new Builder(), lens = new Builder();
  const roofB = plan.roof.chart ? new Builder(atlas) : null;

  // ---- carpet: the island's carpet and the hall's carpet around it, flat at the floor height (UVs in metres; the maps
  // carry their own repeat). THE ALBEDO LAW: the vertex colour is the palette's hue at (the table's value / the map's
  // mean), and the map x the material's colour has the mean CARPET_MEAN, so the albedo's mean is the table's value.
  // The joint between the two carpets carries the edging profile (below); its contact shade on the carpet is the
  // material's on base and high, and on lite a flat dark band under the profile (the A1 bound edge, moved to the joint).
  const cIsland = mul(atLuma(lin(PALETTE.island), levels.island), 1 / CARPET_MEAN), cCarpet = mul(atLuma(lin(PALETTE.carpet), levels.carpet), 1 / CARPET_MEAN);
  atlas.use('floor');
  const fq = (ax, bx, az, bz, col) => {
    if (bx - ax < 1e-6 || bz - az < 1e-6) return;
    floorB.quad([V(ax, F, az), V(ax, F, bz), V(bx, F, bz), V(bx, F, az)], [[ax, az], [ax, bz], [bx, bz], [bx, az]], col);
  };
  // (lite: the band reaches `e` to either side of the joint; base and high: no band, e = 0)
  const e = full ? 0 : plan.trim.width / 2 + plan.trim.foot;
  fq(isl.x0 + e, isl.x1 - e, isl.z0 + e, isl.z1 - e, cIsland);
  if (!full) {
    const cEdge = mul(cCarpet, TONE.binding);
    fq(isl.x0 - e, isl.x1 + e, isl.z0 - e, isl.z0 + e, cEdge); fq(isl.x0 - e, isl.x1 + e, isl.z1 - e, isl.z1 + e, cEdge);
    fq(isl.x0 - e, isl.x0 + e, isl.z0 + e, isl.z1 - e, cEdge); fq(isl.x1 - e, isl.x1 + e, isl.z0 + e, isl.z1 - e, cEdge);
  }
  fq(x0, x1, z0, isl.z0 - e, cCarpet); fq(x0, x1, isl.z1 + e, z1, cCarpet);
  fq(x0, isl.x0 - e, isl.z0 - e, isl.z1 + e, cCarpet); fq(isl.x1 + e, x1, isl.z0 - e, isl.z1 + e, cCarpet);

  // ---- the island's edge: the edging profile over the joint (real geometry, 9 mm high: it catches the light on its top
  // and its slopes, and hides the carpet behind it at a low angle)
  const cTrim = mul([1, 1.005, 1.02], levels.trim / lumaOf([1, 1.005, 1.02]));
  edging(matt, isl, plan.trim, F, cTrim, makeRand(20271));

  // ---- the drape on the four walls, its pipe, the bare wall above it. THE ALBEDO LAW: a dry run sums the cloth's own
  // shade over the drape's area; the colour is scaled so that its MEAN is the table's value (the painted fold shade is
  // not albedo: it stands in for the folds' self-shadow and comes on top)
  const drapeSum = { area: 0, tone: 0, paint: 0 };
  for (const w of plan.walls) drape(null, null, frames[w.id], w, plan.pleats[w.id], plan.pleat, plan.drape, F, [1, 1, 1], drapeSum);
  const drapeTone = drapeSum.tone / Math.max(1e-9, drapeSum.area), drapePaint = drapeSum.paint / Math.max(1e-9, drapeSum.area);
  const cDrape = mul(atLuma(TONE.drapeRidge, levels.drape), 1 / drapeTone);
  // an exit sign's face rides in the lens mesh (one unlit material: the wash bars' amber x the lens level): its vertex
  // colour turns that into the sign's own green at the sign's own level
  const washLin = lin(PALETTE.wash);
  const signTintOf = (level) => SIGN.color.map((c, i) => (c * level) / Math.max(1e-6, washLin[i] * levels.lens));
  const signTint = signTintOf(levels.sign ?? SIGN.level);
  const signs = [];
  for (const w of plan.walls) {
    const f = frames[w.id];
    atlas.use(`wall:${w.id}`);
    drape(drapeB, matt, f, w, plan.pleats[w.id], plan.pleat, plan.drape, F, cDrape, null, plan.walls.indexOf(w));
    // THE PIPE-AND-BASE RAIL the drape hangs from (round A4). The crossbar along the whole wall: its front, its
    // underside and its top, a hand off the wall (the cloth's head hangs under it on its ties).
    const po = plan.drape.pipeOff, pr = plan.drape.pipe, DP = plan.drape;
    if (full) {
      matt.quad([P(f, 0, po, HD - pr), P(f, w.L, po, HD - pr), P(f, w.L, po, HD), P(f, 0, po, HD)], null, TONE.pipe);
      matt.quad([P(f, 0, po - pr, HD - pr), P(f, w.L, po - pr, HD - pr), P(f, w.L, po, HD - pr), P(f, 0, po, HD - pr)], null, mul(TONE.pipe, 0.55));
      matt.quad([P(f, 0, po, HD), P(f, w.L, po, HD), P(f, w.L, 0, HD), P(f, 0, 0, HD)], null, mul(TONE.pipe, 0.8));
      // the uprights: behind the cloth only a head shows over the crossbar; one that stands in a door bay also shows
      // from the floor up to the header's hem (its front and the side that looks at the door). A square tube, its
      // back a finger off the wall.
      const t = DP.upright / 2, d0 = 0.03, d1 = d0 + DP.upright;
      const tube = (u, y0, y1, tone, sides) => {
        matt.quad([P(f, u.s - t, d1, y0), P(f, u.s + t, d1, y0), P(f, u.s + t, d1, y1), P(f, u.s - t, d1, y1)], null, tone);
        if (sides < 0 || sides > 1) matt.quad([P(f, u.s - t, d0, y0), P(f, u.s - t, d1, y0), P(f, u.s - t, d1, y1), P(f, u.s - t, d0, y1)], null, mul(tone, 0.7));
        if (sides > 0) matt.quad([P(f, u.s + t, d1, y0), P(f, u.s + t, d0, y0), P(f, u.s + t, d0, y1), P(f, u.s + t, d1, y1)], null, mul(tone, 0.7));
      };
      for (const u of plan.uprights[w.id]) {
        const tone = mul(TONE.pipe, 0.78 + 0.3 * rnd());
        const y1 = HD + DP.over;
        // (the head over the crossbar: its front; on the high tier its two sides and its top as well)
        tube(u, HD - pr, y1, tone, detail >= 2 ? 2 : 0);
        if (detail >= 2) matt.quad([P(f, u.s - t, d1, y1), P(f, u.s + t, d1, y1), P(f, u.s + t, d0, y1), P(f, u.s - t, d0, y1)], null, mul(tone, 0.9));
        if (u.open) tube(u, 0, DP.header + 0.05, tone, u.open);
        // its base plate, where a camera sees the wall's foot: the part in front of the hem (the cloth lies over the
        // rest), or the whole plate in a door bay; black steel, its top and its front edge
        if (!u.foot) continue;
        const hw = DP.baseW / 2, bt = DP.baseH, b0 = u.open ? 0.01 : DP.baseShow, b1 = DP.base;
        // (in a bay the plate is pushed under the cloth's edge: it may not reach under the door's jamb)
        const sc = Math.min(w.L - hw - 0.01, Math.max(hw + 0.01, u.open ? u.s - u.open * (hw - 0.09) : u.s));
        const plate = mul(TONE.base, 0.85 + 0.3 * rnd());
        matt.quad([P(f, sc - hw, b1, bt), P(f, sc + hw, b1, bt), P(f, sc + hw, b0, bt), P(f, sc - hw, b0, bt)], null, plate);
        matt.quad([P(f, sc - hw, b1, 0), P(f, sc + hw, b1, 0), P(f, sc + hw, b1, bt), P(f, sc - hw, b1, bt)], null, mul(plate, 1.6));
      }
    }
    // the bare wall above the pipe: precast panels 3 m wide, each its own shade; a conduit along it
    const pw = 3.0, n = full ? Math.max(1, Math.round(w.L / pw)) : 1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * w.L, b = ((k + 1) / n) * w.L, tone = mul(TONE.wall, full ? 0.82 + 0.36 * rnd() : 1);
      matt.quad([P(f, a, 0, HD), P(f, b, 0, HD), P(f, b, 0, H), P(f, a, 0, H)], null, [tone, tone, mul(tone, 0.7), mul(tone, 0.7)]);
    }
    if (full) {
      const cy = HD + 0.55 * (H - HD);
      matt.quad([P(f, 0, 0.05, cy), P(f, w.L, 0.05, cy), P(f, w.L, 0.05, cy + 0.07), P(f, 0, 0.05, cy + 0.07)], null, TONE.conduit);
      matt.quad([P(f, 0, 0, cy), P(f, w.L, 0, cy), P(f, w.L, 0.05, cy), P(f, 0, 0.05, cy)], null, mul(TONE.conduit, 0.5));
    }
    // THE EXIT DOORS (round A5: dark recesses). In a bay the drape opens up to its header's hem; the bay's wall is
    // built out as a pier and the door pair stands back in it, in a reveal. A sign box on the pier's face over the
    // opening (its lit faces are in the lens mesh). What the reveal takes of the hall's light is the opening's FORM
    // FACTOR, stored per vertex (occlusion of light: the bake's volume has one sample per 0.8 m and cannot hold a
    // recess 0.27 m deep; the same law as the roof deck's flutes and the seats' slots, CONTRACT 16.6): a leaf sees
    // the hall through the opening (rectShare, sampled a hand inside each corner), a jamb or the soffit sees half
    // of it at the pier's face and less at the leaf.
    const DR = plan.doors, PR = DR.pier;
    // Round A6: with `DR.back` the pier is a door LOBBY: it stands that much further into the hall (`PR.depth` holds
    // it), and the door pair, a hand in front of the hall's wall, is at the end of a reveal 1.17 m deep (two jambs, a
    // soffit, a floor mat). A leaf there sees a quarter to four tenths of the hall where round A5's leaf, 0.27 m back,
    // saw two thirds to five sixths: the same form-factor law, a deeper recess. The lite tier keeps its one quad on
    // the wall, at the mean of what such a leaf sees.
    const deep = DR.back > 0;
    // Round A7 (`DR.kit`): the door says "door": leaves in a dark paint, TONE.door,
    // a grey frame round them, a kick plate on each, the slot under them. Every part is shaded by what it sees of
    // the hall from where it stands (the same form-factor law; on lite the mean of it).
    const KIT = DR.kit ?? null, fw = KIT ? KIT.frame : 0;
    for (const q of w.doors) {
      const s0 = q.s - DR.bay / 2, s1 = q.s + DR.bay / 2, hw = DR.width / 2, dh = DR.height, leaf = DR.leaf;
      const wt = mul(TONE.wall, 0.85 + 0.3 * rnd());
      // the hall's wall in the bay, up to behind the header's hem (the drape goes on over the door)
      const wallTop = Math.min(HD, DR.header + 0.4);
      matt.quad([P(f, s0, 0, 0), P(f, s1, 0, 0), P(f, s1, 0, wallTop), P(f, s0, 0, wallTop)], null, [mul(wt, 0.8), mul(wt, 0.8), wt, wt]);
      // (one leaf a hair lighter than the other: they never weather alike)
      const door = mul(deep && !KIT ? TONE.doorDeep : TONE.door, 0.9 + 0.2 * rnd());
      // (`rv`: the reveal's depth from the pier's face to the leaves; on lite, where the door is one quad on the
      // wall, the depth such a leaf WOULD stand at)
      const dp = full ? PR.depth : leaf, rv = PR.depth - leaf;
      // what a point of a leaf sees of the hall through the opening (x from the door's centre line, y above the floor)
      const see = (x, y) => rectShare(x, y, rv, -hw, hw, 0, dh);
      if (full) {
        const a0 = s0 + PR.inset, a1 = s1 - PR.inset, top = PR.top;
        const pier = mul(TONE.pier, 0.88 + 0.24 * rnd());
        // the pier's face (two flanks and the lintel over the opening), its two returns, its top
        matt.quad([P(f, a0, dp, 0), P(f, q.s - hw, dp, 0), P(f, q.s - hw, dp, top), P(f, a0, dp, top)], null, pier);
        matt.quad([P(f, q.s + hw, dp, 0), P(f, a1, dp, 0), P(f, a1, dp, top), P(f, q.s + hw, dp, top)], null, pier);
        matt.quad([P(f, q.s - hw, dp, dh), P(f, q.s + hw, dp, dh), P(f, q.s + hw, dp, top), P(f, q.s - hw, dp, top)], null, pier);
        matt.quad([P(f, a0, 0, 0), P(f, a0, dp, 0), P(f, a0, dp, top), P(f, a0, 0, top)], null, mul(pier, 0.8));
        matt.quad([P(f, a1, dp, 0), P(f, a1, 0, 0), P(f, a1, 0, top), P(f, a1, dp, top)], null, mul(pier, 0.8));
        matt.quad([P(f, a0, dp, top), P(f, a1, dp, top), P(f, a1, 0, top), P(f, a0, 0, top)], null, mul(pier, 0.9));
        // the reveal: two jambs and the soffit (half the hall at the pier's face, less at the leaf)
        const rf = mul(pier, 0.5), rb = mul(pier, 0.5 * (1 - rv / Math.hypot(rv, DR.width)));
        matt.quad([P(f, q.s - hw, dp, 0), P(f, q.s - hw, leaf, 0), P(f, q.s - hw, leaf, dh), P(f, q.s - hw, dp, dh)], null, [rf, rb, rb, rf]);
        matt.quad([P(f, q.s + hw, leaf, 0), P(f, q.s + hw, dp, 0), P(f, q.s + hw, dp, dh), P(f, q.s + hw, leaf, dh)], null, [rb, rf, rf, rb]);
        matt.quad([P(f, q.s - hw, leaf, dh), P(f, q.s + hw, leaf, dh), P(f, q.s + hw, dp, dh), P(f, q.s - hw, dp, dh)], null, [rb, rb, rf, rf]);
        // the leaves in the reveal, each vertex with what it sees of the hall
        const xo = hw - 0.15, xi = 0.05, yl = 0.3, yh = dh - 0.3;
        const ko = [see(xo, yl), see(xo, yh)], ki = [see(xi, yl), see(xi, yh)];
        // (with the kit the leaves stand inside the frame: `fw` narrower at the jamb and lower at the head)
        matt.quad([P(f, q.s - hw + fw, leaf, 0), P(f, q.s - 0.006, leaf, 0), P(f, q.s - 0.006, leaf, dh - fw), P(f, q.s - hw + fw, leaf, dh - fw)], null, [mul(door, ko[0]), mul(door, ki[0]), mul(door, ki[1]), mul(door, ko[1])]);
        matt.quad([P(f, q.s + 0.006, leaf, 0), P(f, q.s + hw - fw, leaf, 0), P(f, q.s + hw - fw, leaf, dh - fw), P(f, q.s + 0.006, leaf, dh - fw)], null, [mul(door, 0.9 * ki[0]), mul(door, 0.9 * ko[0]), mul(door, 0.9 * ko[1]), mul(door, 0.9 * ki[1])]);
        // the push bars (they stand 6 cm nearer the opening than the leaves)
        const kb = rectShare(0.5 * hw, DR.bar, rv - 0.06, -hw, hw, 0, dh);
        for (const [a, b] of [[q.s - hw + 0.1, q.s - 0.1], [q.s + 0.1, q.s + hw - 0.1]]) matt.quad([P(f, a, leaf + 0.06, DR.bar - 0.025), P(f, b, leaf + 0.06, DR.bar - 0.025), P(f, b, leaf + 0.06, DR.bar + 0.025), P(f, a, leaf + 0.06, DR.bar + 0.025)], null, mul(TONE.bar, kb));
        if (deep) {
          // the passage's floor: a black rubber mat from the pier's face to the leaves (what it sees of the hall: half
          // of it at the mouth, the opening's share at the leaves)
          const kf = 0.5 * (1 - rv / Math.hypot(rv, dh));
          matt.quad([P(f, q.s - hw, dp, 0.004), P(f, q.s + hw, dp, 0.004), P(f, q.s + hw, leaf, 0.004), P(f, q.s - hw, leaf, 0.004)], null, [mul(TONE.mat, 0.5), mul(TONE.mat, 0.5), mul(TONE.mat, kf), mul(TONE.mat, kf)]);
          // the line of light under the door pair: the lit corridor behind it, seen through the gap at the leaves'
          // foot (a lit FACE in the lens mesh, 12 mm high, under the bloom threshold: no emitter, nothing baked)
          const gl = levels.doorGap ?? 0;
          const g0 = KIT ? KIT.gap[0] : 0.005, g1 = KIT ? KIT.gap[1] : 0.017, gx = hw - fw - 0.02;
          if (gl > 0) lens.quad([P(f, q.s - gx, leaf + 0.004, g0), P(f, q.s + gx, leaf + 0.004, g0), P(f, q.s + gx, leaf + 0.004, g1), P(f, q.s - gx, leaf + 0.004, g1)],
            [[0.05, 0.5], [0.05, 0.5], [0.05, 0.5], [0.05, 0.5]], TONE.gap.map((c, i) => (c * gl) / Math.max(1e-6, washLin[i] * levels.lens)));
        } else {
          // the threshold plate on the floor of the reveal
          matt.quad([P(f, q.s - hw, dp, 0.004), P(f, q.s + hw, dp, 0.004), P(f, q.s + hw, leaf, 0.004), P(f, q.s - hw, leaf, 0.004)], null, [mul(TONE.threshold, 0.5), mul(TONE.threshold, 0.5), mul(TONE.threshold, 0.3), mul(TONE.threshold, 0.3)]);
        }
      } else {
        // (lite: the door as one dark quad on the bay's wall, at the mean of what a leaf in the reveal sees)
        // (round A7, with the kit: the mean of the full tiers' own vertex values, a hand inside the leaf's corners:
        // the first app frame had the lite leaves at 7 to 8 where base and high stood at 4)
        matt.quad([P(f, q.s - hw + fw, leaf, 0), P(f, q.s + hw - fw, leaf, 0), P(f, q.s + hw - fw, leaf, dh - fw), P(f, q.s - hw + fw, leaf, dh - fw)], null,
          mul(door, KIT ? 0.5 * (see(hw - 0.15, 0.3) + see(0.05, 0.3)) : 0.25 * (see(0.5 * hw, 0.3) + see(0.5 * hw, dh - 0.3) + 2 * see(0.5 * hw, 0.5 * dh))));
      }
      if (KIT) {
        // the frame (two jambs, a head) and the two kick plates, on every tier; each a hair proud of the leaves
        const zf = leaf + KIT.proud, zk = leaf + KIT.kickProud, sf = (x, y) => (full ? see(x, y) : 0.5 * (see(hw - 0.15, 0.3) + see(0.05, 0.3)));
        const fr = (y) => mul(TONE.doorFrame, sf(hw - 0.5 * fw, y)), kp = (x) => mul(TONE.kick, sf(x, 0.5 * (KIT.kick[0] + KIT.kick[1])));
        const xo = hw - fw - KIT.kickInset, xi = 0.006 + KIT.kickInset;
        for (const sg of [-1, 1]) {
          const ja = q.s + sg * hw, jb = q.s + sg * (hw - fw), j0 = Math.min(ja, jb), j1 = Math.max(ja, jb);
          matt.quad([P(f, j0, zf, 0), P(f, j1, zf, 0), P(f, j1, zf, dh), P(f, j0, zf, dh)], null, [fr(0.2), fr(0.2), fr(dh - 0.2), fr(dh - 0.2)]);
          const ka = q.s + sg * xo, kb2 = q.s + sg * xi, k0 = Math.min(ka, kb2), k1 = Math.max(ka, kb2), co = kp(xo), ci = kp(xi);
          matt.quad([P(f, k0, zk, KIT.kick[0]), P(f, k1, zk, KIT.kick[0]), P(f, k1, zk, KIT.kick[1]), P(f, k0, zk, KIT.kick[1])], null, sg < 0 ? [co, ci, ci, co] : [ci, co, co, ci]);
        }
        matt.quad([P(f, q.s - hw + fw, zf, dh - fw), P(f, q.s + hw - fw, zf, dh - fw), P(f, q.s + hw - fw, zf, dh), P(f, q.s - hw + fw, zf, dh)], null, mul(TONE.doorFrame, sf(0.5 * hw, dh - 0.5 * fw)));
      }
      // the sign: a black box on the pier's face over the opening; its lit face a hair proud of the box's front
      const S = DR.sign, sw = S.w / 2, sh = S.h / 2, m = 0.02, sd = dp + S.box;
      if (full) {
        const c = TONE.signBox;
        matt.quad([P(f, q.s - sw - m, sd, S.at + sh + m), P(f, q.s + sw + m, sd, S.at + sh + m), P(f, q.s + sw + m, dp, S.at + sh + m), P(f, q.s - sw - m, dp, S.at + sh + m)], null, c);
        matt.quad([P(f, q.s - sw - m, dp, S.at - sh - m), P(f, q.s - sw - m, sd, S.at - sh - m), P(f, q.s - sw - m, sd, S.at + sh + m), P(f, q.s - sw - m, dp, S.at + sh + m)], null, c);
        matt.quad([P(f, q.s + sw + m, sd, S.at - sh - m), P(f, q.s + sw + m, dp, S.at - sh - m), P(f, q.s + sw + m, dp, S.at + sh + m), P(f, q.s + sw + m, sd, S.at + sh + m)], null, c);
        // (the box's front, around the lit face: a black frame)
        matt.quad([P(f, q.s - sw - m, sd, S.at - sh - m), P(f, q.s + sw + m, sd, S.at - sh - m), P(f, q.s + sw + m, sd, S.at + sh + m), P(f, q.s - sw - m, sd, S.at + sh + m)], null, c);
        // the window in the box's underside (it looks down: lit, in the lens mesh) and the hot band in the face
        lens.quad([P(f, q.s - sw, dp + 0.01, S.at - sh - m), P(f, q.s + sw, dp + 0.01, S.at - sh - m), P(f, q.s + sw, sd - 0.01, S.at - sh - m), P(f, q.s - sw, sd - 0.01, S.at - sh - m)], [[0.05, 0.5], [0.05, 0.5], [0.05, 0.5], [0.05, 0.5]], signTintOf(levels.signDown ?? SIGN.down));
        const cw = S.core[0] / 2, ch = S.core[1] / 2;
        lens.quad([P(f, q.s - cw, sd + 0.005, S.at - ch), P(f, q.s + cw, sd + 0.005, S.at - ch), P(f, q.s + cw, sd + 0.005, S.at + ch), P(f, q.s - cw, sd + 0.005, S.at + ch)], [[0.05, 0.5], [0.05, 0.5], [0.05, 0.5], [0.05, 0.5]], signTintOf(levels.signCore ?? SIGN.core));
      }
      // (one texel of the lens map: the middle of a lens cell, so the face is plain; the colour is the vertex colour)
      lens.quad([P(f, q.s - sw, sd + 0.003, S.at - sh), P(f, q.s + sw, sd + 0.003, S.at - sh), P(f, q.s + sw, sd + 0.003, S.at + sh), P(f, q.s - sw, sd + 0.003, S.at + sh)], [[0.05, 0.5], [0.05, 0.5], [0.05, 0.5], [0.05, 0.5]], signTint);
      // (the sign as a source for the matt mesh's own glow term: the box's lower front edge, the wall's inward normal)
      const sp = P(f, q.s, sd, S.at - sh - m);
      signs.push({ wall: w.id, s: q.s, at: S.at, p: [sp.x, sp.y, sp.z], n: [f.a.x, f.a.y, f.a.z] });
    }
  }

  // ---- the roof's lid: a profiled steel deck (crests 60 mm below the lid, ribs along x), ducts under it
  const Y = F + H;
  // (lite: a flat lid at the deck's mean with its flutes)
  // Round A6: with `plan.roof.chart` the lid and its ribs go into a mesh of their own on the light map (`roofB`), in
  // two halves at the hall's centre line. The bake then holds what a flute keeps of the light (the crests stand in
  // its way), so the lid's plane carries the deck's paint alone there, without the painted flute factor.
  const lidB = roofB ?? matt;
  const lidTone = mul(TONE.deck, plan.roof.ribs ? (roofB ? 1 : TONE.flute) : 0.86);
  if (roofB) {
    atlas.use('roof:0'); roofB.quad([V(x0, Y, z0), V(x1, Y, z0), V(x1, Y, zMid), V(x0, Y, zMid)], null, lidTone);
    atlas.use('roof:1'); roofB.quad([V(x0, Y, zMid), V(x1, Y, zMid), V(x1, Y, z1), V(x0, Y, z1)], null, lidTone);
  } else matt.quad([V(x0, Y, z0), V(x1, Y, z0), V(x1, Y, z1), V(x0, Y, z1)], null, lidTone);
  if (plan.roof.ribs) {
    const { ribs, ribPitch, ribDepth, crest, webs } = plan.roof;
    const yc = Y - ribDepth, web = 0.035;
    let sheet = 1;
    for (let i = 0; i < ribs; i++) {
      if (i % 3 === 0) sheet = 0.8 + 0.4 * rnd();           // a sheet is three ribs wide; no two sheets weathered alike
      const za = z0 + i * ribPitch + 0.5 * (ribPitch - crest), zb = za + crest;
      const c = mul(TONE.deck, sheet * (i % 3 === 0 ? 0.82 : 1));  // (the lapped rib of a sheet is a shade darker)
      // (a rib lies wholly in one half: the centre line is a boundary between two ribs)
      if (roofB) atlas.use(0.5 * (za + zb) < zMid ? 'roof:0' : 'roof:1');
      lidB.quad([V(x0, yc, za), V(x1, yc, za), V(x1, yc, zb), V(x0, yc, zb)], null, c);
      if (webs) {
        lidB.quad([V(x0, Y, za - web), V(x1, Y, za - web), V(x1, yc, za), V(x0, yc, za)], null, [mul(c, TONE.flute), mul(c, TONE.flute), mul(c, 0.8), mul(c, 0.8)]);
        lidB.quad([V(x0, yc, zb), V(x1, yc, zb), V(x1, Y, zb + web), V(x0, Y, zb + web)], null, [mul(c, 0.8), mul(c, 0.8), mul(c, TONE.flute), mul(c, TONE.flute)]);
      }
    }
  }
  const ducts = [];
  if (plan.ducts) {
    const dk = plan.ducts, dy = F + dk.h;
    for (const z of dk.z) {
      // (base: four lengths instead of eight: 96 triangles that pay for the exit doors and the rail's uprights)
      duct(matt, { axis: 'x', at: z, from: x0 + dk.endInset, to: x1 - dk.endInset, y: dy, r: dk.r, sections: detail >= 2 ? 8 : 4, col: TONE.duct, rnd });
      // outlets under the duct, one per two sections
      for (let k = 0; k < 4; k++) {
        const x = x0 + dk.endInset + (k + 0.5) * ((x1 - x0 - 2 * dk.endInset) / 4);
        matt.box(x - 0.3, x + 0.3, dy - dk.r - 0.12, dy - dk.r + 0.02, z - 0.2, z + 0.2, 'bewns', mul(TONE.duct, 0.7));
      }
      ducts.push({ axis: 'x', z, y: dk.h, r: dk.r });
    }
    const cr = dk.cross;
    matt.box(cr.x - cr.w / 2, cr.x + cr.w / 2, Y - ribDepthOf(plan) - cr.d, Y - ribDepthOf(plan), dk.z[0], dk.z[dk.z.length - 1], 'bew', mul(TONE.duct, 0.9));
    ducts.push({ axis: 'z', x: cr.x, y: H - ribDepthOf(plan) - cr.d / 2, w: cr.w, d: cr.d });
  }
  // ---- under the deck (round A4): cable trays on the roof trusses' top chords, an eaves beam at the head of each wall
  const trays = [];
  if (plan.trays) {
    const T = plan.trays, n = detail >= 2 ? 4 : 1;
    for (const z of T.z) {
      for (let k = 0; k < n; k++) {
        const xa = T.x0 + (k / n) * (T.x1 - T.x0), xb = T.x0 + ((k + 1) / n) * (T.x1 - T.x0);
        matt.box(xa, xb, F + T.y, F + T.y + T.h, z - T.w / 2, z + T.w / 2, 'bns', mul(TONE.tray, 0.85 + 0.3 * rnd()));
      }
      trays.push({ axis: 'x', z, y: T.y, w: T.w, h: T.h, x0: T.x0, x1: T.x1 });
    }
    const c = T.cross;
    matt.box(c.x - T.w / 2, c.x + T.w / 2, F + c.y, F + c.y + T.h, c.z0, c.z1, 'bew', mul(TONE.tray, 0.9));
    trays.push({ axis: 'z', x: c.x, y: c.y, w: T.w, h: T.h, z0: c.z0, z1: c.z1 });
  }
  if (plan.eaves) {
    const E = plan.eaves, ya = F + E.y0, yb = Y - ribDepthOf(plan), c = TONE.beam;
    matt.box(x0, x1, ya, yb, z0, z0 + E.d, 'bs', c); matt.box(x0, x1, ya, yb, z1 - E.d, z1, 'bn', c);
    matt.box(x0, x0 + E.d, ya, yb, z0 + E.d, z1 - E.d, 'be', mul(c, 0.92)); matt.box(x1 - E.d, x1, ya, yb, z0 + E.d, z1 - E.d, 'bw', mul(c, 0.92));
  }

  // ---- the backdrop: the fabric face (its own mesh: the maps), the frame's returns, its top rail
  atlas.use('wall:backdrop');
  // (THE ALBEDO LAW: the map's mean over the face is BACKDROP_MEAN, so map x this colour has the table's value as its mean)
  const cBack = mul(atLuma(lin(PALETTE.backdrop), levels.backdrop), 1 / BACKDROP_MEAN);
  // Round A7: with a pelmet (`plan.backdrop.pelmet`) the cloth's face ends at the pelmet's hem, and the pelmet (a
  // border of black serge: the drape's albedo, the palette's serge hue) hangs `proud` of it up to the top: in the
  // backdrop's own mesh (its map's top rows give the serge its widths' seams; the wash's patch finds no wash up
  // there), on the top of the backdrop's chart. Its underside (the hem's return to the cloth) and, on the high
  // tier, its two ends are in the matt mesh.
  const PM = plan.backdrop.pelmet ?? null, bTop = PM ? PM.hem : bh;
  backB.quad([P(fBack, 0, 0, 0), P(fBack, bl, 0, 0), P(fBack, bl, 0, bTop), P(fBack, 0, 0, bTop)], [[0, 0], [1, 0], [1, bTop / bh], [0, bTop / bh]], cBack);
  if (PM) {
    const serge = atLuma(TONE.drapeRidge, levels.drape), cPel = mul(serge, 1 / BACKDROP_MEAN), rp = makeRand(20273);
    const n = detail >= 2 ? plan.backdrop.modules : 1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * bl, b = ((k + 1) / n) * bl, c = mul(cPel, n > 1 ? 0.9 + 0.2 * rp() : 1);
      backB.quad([P(fBack, a, PM.proud, bTop), P(fBack, b, PM.proud, bTop), P(fBack, b, PM.proud, bh), P(fBack, a, PM.proud, bh)], [[a / bl, bTop / bh], [b / bl, bTop / bh], [b / bl, 1], [a / bl, 1]], c);
    }
    matt.quad([P(fBack, 0, 0, bTop), P(fBack, bl, 0, bTop), P(fBack, bl, PM.proud, bTop), P(fBack, 0, PM.proud, bTop)], null, mul(serge, 0.6));
    if (detail >= 2) {
      matt.quad([P(fBack, 0, 0, bTop), P(fBack, 0, PM.proud, bTop), P(fBack, 0, PM.proud, bh), P(fBack, 0, 0, bh)], null, mul(serge, 0.8));
      matt.quad([P(fBack, bl, PM.proud, bTop), P(fBack, bl, 0, bTop), P(fBack, bl, 0, bh), P(fBack, bl, PM.proud, bh)], null, mul(serge, 0.8));
    }
  }
  const ret = plan.backdrop.frame; // the wall's depth (its frame)
  matt.box(bd.x - ret, bd.x, F, F + bh, bd.z0, bd.z1, 'tns', TONE.frame);
  // (the top rail is behind the pelmet when there is one)
  if (full && !PM) {
    const tr = plan.backdrop.topRail;
    // the top rail the cloth is laced to: a pipe proud of the cloth (front and underside)
    matt.quad([P(fBack, 0, 0.035, bh - tr), P(fBack, bl, 0.035, bh - tr), P(fBack, bl, 0.035, bh), P(fBack, 0, 0.035, bh)], null, TONE.rail);
    matt.quad([P(fBack, 0, 0, bh - tr), P(fBack, bl, 0, bh - tr), P(fBack, bl, 0.035, bh - tr), P(fBack, 0, 0.035, bh - tr)], null, mul(TONE.rail, 0.5));
  }

  // ---- the backdrop's floor lights: LED wash bars on the floor, each a dark housing on two feet with a lit face of lens
  // cells turned up and toward the cloth
  const U = plan.light;
  for (const u of plan.lights) {
    const xa = u.x - U.depth / 2, xb = u.x + U.depth / 2, za = u.z - U.length / 2, zb = u.z + U.length / 2, top = F + U.height;
    if (full) {
      matt.box(xa, xb, F + 0.035, top, za, zb, 'ewns', TONE.housing);
      for (const zf of [za + 0.08, zb - 0.14]) matt.box(xa - 0.02, xb + 0.02, F, F + 0.035, zf, zf + 0.06, 'tewns', mul(TONE.housing, 1.6));
    }
    const lo = top - 0.05, hi = top + 0.002;
    lens.quad([V(xa + 0.008, lo, za + 0.015), V(xa + 0.008, lo, zb - 0.015), V(xb - 0.008, hi, zb - 0.015), V(xb - 0.008, hi, za + 0.015)], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 1, 1]);
  }

  // ---- the drape lights' battens (dark housings on the wall behind each block)
  if (full) {
    const bt = plan.batten;
    for (const b of plan.battens) {
      if (b.axis === 'x') matt.box(b.from, b.to, F + bt.h - 0.11, F + bt.h - 0.03, b.at - 0.05, b.at + 0.05, 'tbns', TONE.housing);
      else matt.box(b.at - 0.05, b.at + 0.05, F + bt.h - 0.11, F + bt.h - 0.03, b.from, b.to, 'tbew', TONE.housing);
    }
  }

  // ---- emitters (heights above the floor; the room light re-seats them with the floor)
  const wash = new THREE.Color(PALETTE.wash), houseC = new THREE.Color(...levels.houseTint);
  const emitters = plan.emitters.map((e) => {
    const isWash = e.id.startsWith('hall.wash.');
    return { id: e.id, type: e.type, position: V(e.p[0], F + e.p[1], e.p[2]), axis: V(...e.axis), size: e.size.slice(),
      // (round A5: the wash carries a normal: a one-sided tube, aimed up the cloth)
      ...(e.normal ? { normal: V(...e.normal) } : {}),
      color: isWash ? wash : houseC, intensity: isWash ? levels.wash : levels.house, radius: isWash ? levels.washReach : levels.houseReach };
  });
  const share = layout.emitters?.shell ?? 4;
  if (emitters.length > share) throw new Error(`the shell registers ${emitters.length} emitters, its share is ${share}`);

  // ---- materials (all through the room light) and meshes
  const mats = {
    // matt loop pile: rough, next to no mirror; the floor of the room (lamp pool, table shadow, the occlusion service's map)
    carpet: roomLight.material({ name: 'arena.hall.carpet', map: carpetMap, ...(pile ? { normalMap: pile, normalScale: detail >= 2 ? levels.pile : 0.55 } : {}), roughness: 0.94, vertexColors: true, envMapIntensity: 0.02, tableShadow: true, lightmap: 'spec' }),
    // (`hide`: the drape's vertices carry `roomSide`: side 0, never dropped, plus the mark of a painted shade the map replaces)
    drape: roomLight.material({ name: 'arena.hall.drape', ...(foldMap ? { map: foldMap } : {}), ...(nap ? { normalMap: nap, normalScale: levels.nap } : {}), roughness: 0.97, vertexColors: true, envMapIntensity: 0.0, spec: false, lightmap: true, hide: true }),
    matt: roomLight.material({ name: 'arena.hall.matt', roughness: 0.97, vertexColors: true, envMapIntensity: 0.0, spec: false }),
    backdrop: roomLight.material({ name: 'arena.hall.backdrop', map: backdropMap, ...(weave ? { normalMap: weave, normalScale: 0.6 } : {}), roughness: 0.92, vertexColors: true, envMapIntensity: 0.0, lightmap: true }),
    lens: roomLight.emissive({ name: 'arena.hall.washlens', color: wash, intensity: levels.lens, map: lensMap }),
    // (round A6) the roof's lid on the light map: dark painted steel, matt, shaded by vertex colour like the matt mesh
    ...(roofB ? { roof: roomLight.material({ name: 'arena.hall.roof', roughness: 0.97, vertexColors: true, envMapIntensity: 0.0, spec: false, lightmap: true }) } : {}),
  };
  // (the lens mesh also holds the exit signs' faces: its vertex colours are 1 on a wash bar's lens and the sign's tint
  // on a sign; set before the material is ever compiled)
  mats.lens.vertexColors = true;
  // (the lite tier's flat drape holds its fold shade in a map, which the bake tool does not read: it would take a
  // quarter of the vertex colour for any mapped material. The bake's bounce gets the cloth's painted mean by name:
  // web/tools/club/bake-room-scene.mjs reads `userData.bakeAlbedo` as an absolute albedo.)
  if (foldMap) mats.drape.userData.bakeAlbedo = mul(cDrape, drapePaint);
  // the carpet's own shading (base and high): one patch on the floor material, text added after standard includes only
  let carpetU = null, patched = 'none';
  const look = { ...CARPET, seam: levels.carpetSeam, sheen: levels.carpetSheen, lean: levels.carpetLean, wear: levels.carpetWear, mottle: levels.carpetMottle, tracks: levels.carpetTracks,
    lay: levels.carpetLay ?? CARPET.lay, grain: levels.carpetGrain ?? CARPET.grain, grain2: levels.carpetGrain2 ?? CARPET.grain2, tileSeam: levels.carpetTileSeam ?? CARPET.tileSeam,
    conLow: levels.scanLow ?? CARPET.conLow, conHigh: levels.scanHigh ?? CARPET.conHigh };
  if (full && levels.carpetV4 > 0) {
    // Round A6, the patch v4: the nap against the island's directed light. The rig's table keys, read-only from the
    // rig's own plan (the four profile spots it marks as keys: lens, axis, candela, cone, shutter); the players'
    // chairs from the layout; a few pieces of tape: a tick across the table's centre line behind the head rail and
    // one beside the south rail (the marks a crew sets the table back on), a cross on the open floor behind the
    // head end (a floor mark). Half sizes in metres: a tape 48 mm wide.
    const TK = RIG_HALL.tableKeys;
    // (the keys' side blades: `carpetSides` 1 = when the rig's plan frames its keys with them, 2 = always, a tool)
    const sidesOn = typeof RIG_PLAN.tableKeySides === 'function' && (levels.carpetSides >= 2 || (levels.carpetSides > 0 && TK?.legs?.on === true));
    let keys = [];
    try {
      if (TK?.on === true && typeof RIG_PLAN.outerPlan === 'function' && typeof RIG_PLAN.tableKeyShutter === 'function') keys = RIG_PLAN.outerPlan(layout, { floorY: F }).heads.filter((h) => h.key).map((h) => {
        const k = TK.keys.find((q) => q.id === h.key);
        // (`foot`: the key's second blade, at the table's foot, when the rig's plan has one: the key then ends half
        // a metre in front of the table and the pool is the heads'. A key's own field angle when it has one.)
        return k ? { p: h.lens.slice(), d: h.dir.slice(), i: k.intensity, cone: k.cone ?? TK.cone, n: RIG_PLAN.tableKeyShutter(h.lens, k.rail),
          ...(typeof RIG_PLAN.tableKeyFoot === 'function' && TK.foot ? { foot: RIG_PLAN.tableKeyFoot(h.lens, k.rail, F) } : {}),
          ...(sidesOn ? { sides: RIG_PLAN.tableKeySides(h.lens, k.rail) } : {}) } : null;
      }).filter(Boolean);
    } catch (e) { notes.push(`carpet: the rig's table keys could not be read (${e?.message ?? e}): the nap shows against the rig's fill alone`); }
    const tb = { cx: 0, cz: 0, hx: 1.45, hz: 0.82 }, tw = 0.024;
    // (four pieces, none mirrored: the first app frame from the broadcast pose had a tick on either side of the
    // table and they read as two drawn dashes)
    const marks = [[-tb.hx - 0.42, 0.03, tw, 0.15], [0.07, tb.hz + 0.40, 0.17, tw], [-3.55, 1.9, 0.12, tw], [-3.56, 1.92, tw, 0.13]];
    // (round A7: with `carpetV5` and the keys' side blades the patch is v5: its own rows for the lay and the lanes)
    const v5 = levels.carpetV5 > 0 && sidesOn && keys.some((k) => k.sides);
    const look4 = { ...CARPET_4, nap: levels.carpetNap ?? CARPET_4.nap, flip: levels.carpetFlip ?? CARPET_4.flip, swap: levels.carpetSwap ?? CARPET_4.swap, tape: levels.carpetTape ?? CARPET_4.tape,
      ...(v5 ? { nap: levels.carpetNap5, flip: levels.carpetFlip5, swap: levels.carpetSwap5, leanSpread: levels.carpetSpread5, hand: { off: levels.carpetOff5, soft: levels.carpetSoft5, flat: levels.carpetFlat5 } } : {}),
      sides: sidesOn && keys.some((k) => k.sides) ? 1 : 0 };
    carpetU = carpetUniforms4(plan, { table: tb, gaps: layout.boards?.gaps ?? [], look: v5 ? { ...look, tracks: levels.carpetTracks5 } : look, look4, mean: CARPET_MEAN, ...(layout.rig ? { rig: layout.rig } : {}), keys, floorY: F, chairs: layout.floor?.chairs ?? [], marks });
    patched = patchMaterial(club, mats.carpet, carpetPatchSpec4(carpetU));
    mats.carpet.userData.arenaCarpet = carpetU;
    mats.carpet.userData.arenaCarpetKeys = keys.length;
  } else if (full) {
    carpetU = carpetUniforms(plan, { gaps: layout.boards?.gaps ?? [], look, mean: CARPET_MEAN, ...(layout.rig ? { rig: layout.rig } : {}) });
    patched = patchMaterial(club, mats.carpet, carpetPatchSpec(carpetU));
    mats.carpet.userData.arenaCarpet = carpetU; // (plain arrays: for tools that switch a term off for an on / off pair)
  }
  // the backdrop's scallops as light (every tier): the wash emitter in the cloth's own frame, the map's alpha as the
  // beams' share of each row (./shell/glsl.js BACKDROP_LIGHT). With the wash at 0 the term is zero.
  const washE = plan.emitters.find((e) => e.id.startsWith('hall.wash.'));
  const backU = backdropUniforms({
    cloth: { length: bl, height: bh },
    // (`aim`: the emitter's normal in the cloth's frame: up the cloth, and OUT of the cloth = the world's +x)
    tube: { off: washE.p[0] - bd.x, h: washE.p[1], centre: bd.z1 - washE.p[2], half: washE.size[0] / 2, radius: washE.size[1], window: levels.washReach,
      ...(washE.normal ? { aim: [washE.normal[1], washE.normal[0]] } : {}) },
    color: [wash.r * levels.wash, wash.g * levels.wash, wash.b * levels.wash], share: washShare, alpha: SCALLOP_ALPHA,
    // (round A5: the cloth's relief under the wash; `?arenahall=relief:0` = flat cloth, the off arm of a pair)
    ...(levels.relief === 0 ? {} : { relief: { rails: plan.backdrop.rails } }),
  });
  if (levels.scallops === 0) backU.uArenaWashC.value[3] = 0;   // (tools: `?arenahall=scallops:0`, the off arm of a pair)
  const backPatched = patchMaterial(club, mats.backdrop, backdropPatchSpec(backU));
  mats.backdrop.userData.arenaBackdrop = backU;
  // the exit signs' own light on the matt surfaces around them (base and high; ./shell/glsl.js SIGN_LIGHT): each lit
  // rectangle's radiance x its area is its intensity along its normal. The face counts with its hot band; the window
  // in the box's underside is a centimetre narrower than the box on either side.
  let signU = null, roofU = null, signPatched = 'none';
  if (full && signs.length) {
    const S = plan.doors.sign, lvF = levels.sign ?? SIGN.level, lit = lvF > 0;
    const faceI = lit ? S.w * S.h * lvF + S.core[0] * S.core[1] * Math.max(0, (levels.signCore ?? SIGN.core) - lvF) : 0;
    const downI = lit ? S.w * (S.box - 0.02) * (levels.signDown ?? SIGN.down) : 0;
    signU = signUniforms({ signs, face: SIGN.color.map((c) => c * faceI), down: SIGN.color.map((c) => c * downI) });
    // the roof's lit bells on the lid and on what hangs under it (the high tier; ./shell/glsl.js ROOF_LIGHT): the
    // rig's own fixture list, read-only: a point at each lit bell's top, its level x the hall's `bellUp`
    const up = detail >= 2 && Number.isFinite(levels.bellUp) ? levels.bellUp : 0;
    if (up > 0) {
      const bells = roofPlan(layout, { floorY: F }).fixtures.filter((f) => f.kind === 'roof').slice(0, ROOF_BELLS)
        .map((f) => ({ p: [f.x, f.y + RIG_HALL.roof.bellH, f.z], i: f.level * up }));
      if (bells.length) roofU = roofUniforms({ bells, tint: levels.houseTint, under: F + RIG_HALL.roof.mouthH + RIG_HALL.roof.bellH - 0.02 });
    }
    signPatched = patchMaterial(club, mats.matt, signPatchSpec(signU, roofU));
    mats.matt.userData.arenaSign = signU;     // (plain arrays: tools switch the signs' light off for an on / off pair)
    if (roofU) mats.matt.userData.arenaRoof = roofU;
    // (round A6: when the lid is its own mesh and a tool asks for the stand-in again, the lid's material takes it too)
    if (roofU && mats.roof) { patchMaterial(club, mats.roof, roofPatchSpec(roofU)); mats.roof.userData.arenaRoof = roofU; }
  }
  const group = new THREE.Group();
  group.name = 'arenaHallShell';
  const meshes = {
    floor: floorB.mesh(mats.carpet, 'arenaHallCarpet'),
    drape: drapeB.mesh(mats.drape, 'arenaHallDrape'),
    matt: matt.mesh(mats.matt, 'arenaHallMatt'),
    backdrop: backB.mesh(mats.backdrop, 'arenaHallBackdrop'),
    lenses: lens.mesh(mats.lens, 'arenaHallWashLenses'),
    ...(roofB ? { roof: roofB.mesh(mats.roof, 'arenaHallRoof') } : {}),
  };
  for (const m of Object.values(meshes)) group.add(m);
  for (const em of emitters) roomLight.addEmitter(em);

  // ---- the scans (CONTRACT 14.2): asked for on the base and high tiers; a file that is in the manifest replaces the
  // code-drawn map when it has loaded (the material's map slots stay filled, so the program does not change for the
  // colour and the normal map; a roughness scan adds its sampler once). Without the files nothing changes.
  const assetIds = [];
  const scan = { color: 'code', normal: 'code', rough: 'none', weave: 'code', mean: null };
  let mapMean = [CARPET_MEAN, CARPET_MEAN, CARPET_MEAN];
  let ready = Promise.resolve();
  const assets = club?.assets;
  if (full && typeof assets?.texture === 'function' && typeof assets?.ready === 'function') {
    try {
      const rep = [1 / SCANS.carpet.tile, 1 / SCANS.carpet.tile];
      const sColor = assets.texture(SCANS.carpet.color, { srgb: true, repeat: rep, anisotropy: 8 });
      const sNormal = assets.texture(SCANS.carpet.normal, { srgb: false, repeat: rep, anisotropy: 8 });
      // (the roughness scan on the high tier only: on base its detail is under a pixel and it would cost a sampler)
      const sRough = detail >= 2 ? assets.texture(SCANS.carpet.rough, { srgb: false, repeat: rep, anisotropy: 8 }) : null;
      const sWeave = assets.texture(SCANS.cloth.normal, { srgb: false, repeat: [bl / SCANS.cloth.tile[0], bh / SCANS.cloth.tile[1]], anisotropy: 8 });
      assetIds.push(SCANS.carpet.color, SCANS.carpet.normal, ...(sRough ? [SCANS.carpet.rough] : []), SCANS.cloth.normal);
      const loaded = (id) => { try { return assets.state?.().ids?.[id] === 'loaded'; } catch { return false; } };
      ready = assets.ready(assetIds).then(() => {
        const m = mats.carpet;
        if (loaded(SCANS.carpet.color)) {
          // the scan keeps its texture, the albedo table keeps the level: the material's colour takes the scan's MEAN
          // out (measured here over every pixel, in linear light), and the patch's contrast law takes the specks down
          // without moving that mean
          const st = imageStats(sColor.image);
          if (st) {
            const sc = scanColour(st.mean, cIsland, levels.island);
            m.color.setRGB(sc.color[0], sc.color[1], sc.color[2]);
            mapMean = st.mean; scan.mean = st.mean.map((v) => +v.toFixed(4)); scan.size = st.size;
            const tr = scanTransfer(st.lum, look.conLow, look.conHigh);
            scan.contrast = { low: look.conLow, high: look.conHigh, norm: +tr.norm.toFixed(5), spread: +tr.spread.toFixed(4), spreadOut: +tr.spreadOut.toFixed(4) };
            if (carpetU) { carpetU.uArenaMean.value = [sc.product[0], sc.product[1], sc.product[2], 0]; carpetU.uArenaCon.value = [look.conLow, look.conHigh, tr.norm, 0]; }
          } else notes.push('the carpet scan\'s mean could not be read: its own level stays (the albedo law is NOT met on the carpet)');
          m.map = sColor; carpetMap.dispose(); scan.color = SCANS.carpet.color;
        }
        if (loaded(SCANS.carpet.normal)) {
          // (on base the scan reaches the GPU at 512 px, two texels per loop: grain, kept low or the floor sparkles)
          const ns = detail >= 2 ? levels.pileScan : levels.pileScanBase;
          m.normalMap = sNormal; m.normalScale.set(ns, ns); if (detail >= 2) pile?.dispose(); scan.normal = SCANS.carpet.normal;
        }
        if (sRough && loaded(SCANS.carpet.rough)) { m.roughnessMap = sRough; m.roughness = SCANS.carpet.roughness; m.needsUpdate = true; scan.rough = SCANS.carpet.rough; }
        if (loaded(SCANS.cloth.normal) && weave) { mats.backdrop.normalMap = sWeave; weave.dispose(); scan.weave = SCANS.cloth.normal; }
      }).catch((e) => { notes.push(`scans: ${e?.message ?? e}`); });
    } catch (e) { notes.push(`scans: ${e?.message ?? e}`); }
  }

  // the floor's mean diffuse colour near the table, linear: the island's vertex colour times the map's mean
  const floorAlbedo = () => { const c = mats.carpet.color; return [c.r * cIsland[0] * mapMean[0], c.g * cIsland[1] * mapMean[1], c.b * cIsland[2] * mapMean[2]]; };
  /** THE ALBEDO LAW as built: each surface's mean diffuse reflectance (linear luminance) from what the materials hold now,
   * beside the table's value. `drapePaint`: the drape's vertex colours WITH the painted fold shade (what a bounce sees). */
  const albedos = () => {
    const c = mats.carpet.color, prod = [c.r * mapMean[0], c.g * mapMean[1], c.b * mapMean[2]];
    const r5 = (v) => +v.toFixed(5);
    return {
      island: r5(lumaOf(cIsland.map((v, i) => v * prod[i]))), carpet: r5(lumaOf(cCarpet.map((v, i) => v * prod[i]))),
      drape: r5(lumaOf(cDrape) * drapeTone), drapePaint: r5(lumaOf(cDrape) * drapePaint), backdrop: r5(lumaOf(cBack) * BACKDROP_MEAN), trim: r5(lumaOf(cTrim)),
      table: { island: levels.island, carpet: levels.carpet, drape: levels.drape, backdrop: levels.backdrop },
      // the drape's relative shades over its area: the cloth's own (pleat tone x the head's dust) and with the fold paint
      drapeShade: { tone: r5(drapeTone), paint: r5(drapePaint) },
    };
  };
  const counts = () => {
    let triangles = 0;
    for (const m of Object.values(meshes)) triangles += m.geometry.index.count / 3;
    return { meshes: Object.keys(meshes).length, triangles, emitters: emitters.length, lightmapCharts: atlas.count, girders: 0, battens: plan.lights.length, texturePx: px,
      pleats: Object.values(plan.pleats).reduce((n, l) => n + l.filter((p) => !p.gap).length, 0), ribs: plan.roof.ribs, ducts: ducts.length,
      doors: signs.length, uprights: Object.values(plan.uprights).reduce((n, l) => n + l.length, 0), trays: trays.length };
  };
  /** The table's footprint for the walked band (the room calls it when it has read the real table). */
  const setTable = (r) => {
    if (!carpetU || !r) return false;
    const t = carpetU.uArenaTab.value;
    for (const [k, key] of ['cx', 'cz', 'hx', 'hz'].entries()) if (Number.isFinite(r[key])) t[k] = r[key];
    return true;
  };
  return {
    group,
    // (`albedoState()` is what the room publishes as `state().floor`: the island's albedo, and `means`: the albedo law
    // as built on every surface of the shell, with the scan's measured mean and contrast when a scan is on)
    floor: { mesh: meshes.floor, material: mats.carpet, get albedo() { return floorAlbedo(); }, albedoState: () => ({ albedo: floorAlbedo(), mapMean: mapMean.slice(), from: scan.color === 'code' ? 'the carpet canvas (drawn in code) x the island tint' : `${scan.color} x the island tint`, tint: mats.carpet.color.toArray(), means: albedos(), scan: { ...scan } }) },
    emissives: [meshes.lenses],
    // what the shell occupies (heights above the floor), for the parts and the bake's signature
    layout: {
      walls: Object.fromEntries(plan.walls.map((w) => [w.id, { origin: frames[w.id].o.toArray(), tangent: frames[w.id].t.toArray(), normal: frames[w.id].a.toArray(), length: w.L }])),
      backdrop: { x: bd.x, z0: bd.z0, z1: bd.z1, height: bd.height, depth: ret, panels: plan.backdrop.modules },
      battens: plan.lights.map((u) => [u.x, u.z]), batten: { length: U.length, depth: U.depth, height: U.height },
      girders: [], ducts, trays,
      // (round A4) the exit doors: the wall, the centre along the wall's tangent, the bay's width, the sign's height
      doors: plan.walls.flatMap((w) => w.doors.map((q) => ({ wall: w.id, s: q.s, bay: plan.doors.bay, width: plan.doors.width, height: plan.doors.height, sign: plan.doors.sign.at }))),
      heights: { roof: H, deck: H - (plan.roof.ribs ? plan.roof.ribDepth : 0), drape: HD, wallLights: plan.batten.h, eaves: plan.eaves ? plan.eaves.y0 : null },
    },
    materials: mats, meshes, counts,
    emitterIds: emitters.map((em) => em.id),
    sides: cutPlanes(F, layout),
    lightmap: atlas.info(), lightmapMeshes: [meshes.floor, meshes.backdrop, meshes.drape, ...(meshes.roof ? [meshes.roof] : [])],
    // CONTRACT 14.2: the shell's geometry and emitter places as a short string (levels are not in it)
    plan, signature: () => sig,
    // the ids the shell asked the asset service for, and a promise that settles when they have loaded or fallen back
    assetIds, ready, setTable,
    uniforms: carpetU,
    albedos,
    state: () => ({ version: SHELL_VERSION, signature: sig, detail, albedo: albedos(), carpet: { patch: patched, pile: pileFrom, scan: { ...scan }, tile: scan.color === 'code' ? PILE.tile : SCANS.carpet.tile },
      backdrop: { patch: backPatched, share: +washShare.toFixed(4), wash: levels.wash }, doors: signs.slice(), sign: { patch: signPatched },
      roof: { bells: roofU ? roofU.uArenaBell.value.filter((v, i) => i % 4 === 3 && v > 0).length : 0, up: roofU ? levels.bellUp : 0, chart: !!roofB }, notes: notes.slice() }),
  };
}

function ribDepthOf(plan) { return plan.roof.ribs ? plan.roof.ribDepth : 0; }
