// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/layout.js — where everything of the `arena` venue stands (CONTRACT.md sections 13 and 14). Owner: bake (v0 by the lead, v1 by the hall role).
// Pure data and arithmetic: no three import, so it runs in node (web/tools/club/test-club-arena.mjs).
//
// Frames: metres. The table's centre is the origin of x and z; world x is the table's long axis. Heights are given ABOVE THE
// FLOOR (`h`), never as world y: the app seats the floor per table class, so a builder adds the live floor height. Sides:
// 'north' = z negative (across the table from the standing play view), 'south' = z positive, 'east' = x positive (behind the
// foot of the table: the background of the aim and break views), 'west' = x negative (behind the breaker).
//
// The plan: the table stands on a carpet island closed by a ring of low boards; tiered EMPTY seating rises behind the boards
// on the north, south and east sides; the west end is a tall backdrop with the scoreboard; a box truss hangs over the table and
// carries the table light's housing and a row of lamp heads; the roof void above holds a sparse field of house lights.
// No people anywhere: no figure, silhouette or face, painted or modelled.
//
// Every builder (arena/shell.js, arena/rig.js, arena/surround.js, arena/floor.js) reads positions and sizes from here and from
// nowhere else. A number that has to change is changed here, by the owner.

// (3: round A3, the albedo law. Every light level of the hall moved with the albedos, so a map baked for version 2 holds
// about four times the light this hall has: it is refused by its signature and the analytic light stands until the re-bake.)
// (4: round A4, the house lights at half. The hall's ambient went from 0.08 to 0.6 units, six house floods light the
// seating, the heads and the keys came down: a map baked for version 3 holds another hall's light and is refused.)
// (5: round A5, light with shape. The ambient came down to a half, the wall washers are gone, the house floods are
// warm, narrower and aimed lower, the heads carry the pool and the keys came down: a map baked for version 4 holds an
// evenly lit hall and is refused.)
export const ARENA_LAYOUT_VERSION = 5;

const freeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); }
  return o;
};

export const ARENA = freeze({
  // the hall's interior (the box projection of the reflection service uses it)
  hall: { x0: -11.0, x1: 14.0, z0: -12.6, z1: 12.6, height: 9.5 },
  // the carpet island under the table: a slightly lighter carpet; its edge carries the boards
  island: { x0: -5.6, x1: 5.6, z0: -4.3, z1: 4.3 },
  // The app's camera, as its code allows it (read 2026-11-14 for the 9 ft table; web/tools/club/test-club-arena.mjs pins
  // these numbers against web/app/orbit.js, web/app/aim.js and web/app/main.js, so a change there fails the arm):
  //   orbit rig      radius 0.7 .. 6.5 m, polar angle 0.15 .. 1.45 rad from the vertical (web/app/orbit.js apply())
  //   orbit target   a user pan keeps it inside the table's footprint + 0.3 m (`pan`); the aim view moves it to the cue ball
  //                  + 1.0 m along the aim line and leaves it there when the view is released (`target`); y 0 .. 0.05
  //   bedH           the bed plane above the floor (the app seats the floor per table class: read the live floor; this
  //                  number is the pool table's and is used for the layout's arithmetic only)
  // So the camera can leave the island: at full zoom-out it flies OVER the boards (never through them: cameraFloor() below)
  // and into the air where the lower seating rows are, and it can rise through the rig's plane up to 7.27 m above the floor.
  camera: {
    radius: [0.7, 6.5], phi: [0.15, 1.45], near: 0.01, bedH: 0.79,
    pan: { x: 1.57, z: 0.935 },
    target: { x: 2.2414, z: 1.6064, y0: 0, y1: 0.05 },
  },
  // what must stay empty. `strokeRoom`: clearance around the table's footprint (a cue is 1.47 m). `cameraVolume`: the box
  // around every place the app's camera can be (h = above the floor); inside it the exact test is inCameraVolume() below.
  // `clearance`: how far under the camera's lowest surface the top of a floor-standing thing must stay.
  keepOut: {
    strokeRoom: 1.55,
    cameraVolume: { x0: -8.70, x1: 8.70, z0: -8.06, z1: 8.06, h0: 0.87, h1: 7.27 },
    clearance: 0.05,
  },
  // Where the hall is cut away (the club room's rule: a camera behind a side's plane looks into a cut-away room, never at
  // the inside of a solid). A builder marks a mesh with the `roomSide` attribute (SIDE below) and makes its materials
  // with `hide: true` (room/light.js); the hall hands these planes to the room light. north / south / east: the seating
  // block of that side is dropped while the camera is beyond the plane (the plane lies between the boards and the first
  // row: the boards stay, the camera passes over them). west: the backdrop. top: everything at or above the rig's lower
  // chords (truss, heads, hangers, the roof and its lights) is dropped while the camera is at or above that height.
  cut: { north: -5.35, south: 5.35, east: 6.65, west: -8.75, top: 3.24 },
  // the ring of boards on the island's edge: panels in frames, a lit rail on top; `gaps` are the two walk-ins at the west corners
  boards: {
    height: 0.9, thickness: 0.12, footDepth: 0.5, module: 2.0,
    rail: { width: 0.06, height: 0.04 },
    gaps: [
      { side: 'north', from: -5.6, to: -4.0 },
      { side: 'south', from: -5.6, to: -4.0 },
    ],
  },
  // tiered seating: `front` = distance of the first row's front edge from the island's edge; a row is `tread` deep and `rise`
  // higher than the one before; folded seats every `seatPitch` along the row; one stair aisle per block
  seating: {
    rows: 8, front: 1.2, tread: 0.85, rise: 0.30, firstRowH: 0.45, seatPitch: 0.55, guardRailH: 1.0, aisleWidth: 1.2,
    blocks: [
      { id: 'north', side: 'north', from: -5.6, to: 5.6, aisleAt: 0 },
      { id: 'south', side: 'south', from: -5.6, to: 5.6, aisleAt: 0 },
      { id: 'east', side: 'east', from: -4.3, to: 4.3, aisleAt: 0 },
    ],
  },
  // the west end: a tall stretched-fabric wall washed from the floor, the scoreboard on it
  backdrop: {
    x: -8.9, z0: -7.0, z1: 7.0, height: 6.0,
    floorLights: { x: -7.9, pitch: 4.7 },
    scoreboard: { centerH: 3.6, width: 3.2, height: 1.2 },
  },
  // the rig over the table: a box truss (outer rectangle `length` x `width`, square section `section`), its lower chords at
  // `bottomH` (the app's ceiling plane: the app luminaire's rods end there), hung from the roof at the four corners
  rig: {
    length: 5.2, width: 3.0, section: 0.29, bottomH: 3.24,
    heads: { perLongSide: 4, aimAt: 'island' },
  },
  // the roof void: house lights as small points (h0 is above the camera's highest point, 7.27 m)
  houseLights: { h0: 7.6, h1: 9.0, pitchX: 2.6, pitchZ: 2.6 },
  // Event furniture (round A2: arena/floor.js builds it; CONTRACT 14.2). Heights of the things themselves are the floor
  // part's; the places are fixed here so nothing else takes them and no review pose looks through one.
  //   cameras       TV cameras at full height (lens 1.5 m over the deck), by placement (CONTRACT 15.3: no view rule):
  //                 OUTSIDE the boards and outside the plan reach of the app's camera (6.4526 m around the target
  //                 rectangle: inCameraVolume() is false at every height there; the arm pins it). Round A4 (CONTRACT
  //                 16.5): the places and the platform kinds are described at the entries below. (Round A3 had three low
  //                 risers in the hall's corners, which no review pose framed; round A2 two cameras inside the island,
  //                 run down to 1.0 m by a view rule.)
  //   chairs        the two players' chairs at the foot end, each with a small side table (`sideTables`) toward the table.
  //   refereeTable  a small table by the north boards.
  //   steps         from the carpet up to the first row's deck (seating.firstRowH) at the foot of each block's stair aisle,
  //                 OUTSIDE the boards (between the boards and the first row); `at` = the aisle's centre along the block.
  //   cables        a taped run from each camera platform across the walkway to the flank of the nearest seating block (the
  //                 cable goes under the deck there): [x, z] polylines starting at the camera; a run is flat (a tape
  //                 `cableWidth` wide) and stays outside the island.
  floor: {
    // ROUND A4 (CONTRACT 16.5: full height, outside the app camera's reach, in places V10, TV and BACK frame, lit by the
    // house light; the floor role's request of 05:52Z to 06:10Z, taken as written). No floor place outside the reach holds
    // a head of 40 px in V10 or BACK, so three cameras stand ON the stands just outside the reach, as productions build
    // them: a scaffold platform over a few folded seats.
    //   `platform`: the deck (w along x, d along z, h = the deck's TOP above the FLOOR), centred on the camera's place.
    //   `on: '<seating block id>'`: the platform stands on that block's rows (its legs on the rows' walkways); it and its
    //   camera take the block's cut side (they leave with the block they stand on: the hall's cut-away rule, nothing of
    //   their own). Without `on`: a low riser on the hall's floor.
    // The floor part builds the first on lite, the first two on base, all on high: the ORDER is n1 (V10 frames it), ne
    // (the break view frames it), n2 (BACK frames it), e1 (V10 frames it).
    // TV cannot frame a full-height head anywhere outside the reach (its top edge looks 10.6 degrees down).
    cameras: [
      { id: 'n1', x: 1.45, z: -8.83, lookAt: [0, 0], platform: { w: 1.6, d: 1.13, h: 2.45, on: 'north' } },
      { id: 'ne', x: 9.5, z: -5.5, lookAt: [0, 0], platform: { w: 1.6, d: 1.6, h: 0.30 } },
      { id: 'n2', x: -3.65, z: -8.83, lookAt: [0, 0], platform: { w: 1.6, d: 1.13, h: 2.45, on: 'north' } },
      { id: 'e1', x: 9.46, z: 1.625, lookAt: [0, 0], platform: { w: 1.13, d: 1.6, h: 2.45, on: 'east' } },
    ],
    //   lowCamera     ROUND A5 (the floor role's request of 09:08Z, corrected 09:12Z, taken as written): ONE remote camera
    //                 head on a short post on the playing floor at the table's foot end (the place the hall photographs
    //                 show first). It stands INSIDE the plan reach and UNDER the app camera's cone: `top` = its highest
    //                 point above the floor; the floor part's arm proves every vertex with inCameraVolume() and the
    //                 clearance (the cone's underside is 1.125 m there; highest lawful top 1.033). No view rule, never
    //                 dropped by the cut (it stands inside the boards). Built on every tier.
    lowCamera: { id: 'lo', x: 5.0, z: 1.25, lookAt: [0, 0], top: 1.03 },
    //   workLights    ROUND A6 (CONTRACT 18.1: the stand camera heads read 25 to 45 with a lit edge; agreed with the floor
    //                 role 12:27Z / 12:33Z): one small work light per camera platform, as a production clips one on a
    //                 platform's rail: a can on a short mast at the platform's corner toward the review pose that frames
    //                 the camera. `x`, `z`, `h`: the centre of the can's LIT FACE (h above the floor); `aim`: the camera
    //                 head's centre [x, z, h] it is tipped at, 1.0 m away. The floor part builds the mast and the can at
    //                 this place (within 0.05 m; none for an id that is not here); arena/room.js hands one bake-only
    //                 emitter per entry to the bake (`work.<id>`: WORK there holds the level).
    workLights: [
      { id: 'n1', x: 0.75, z: -8.33, h: 4.45, aim: [1.45, -8.83, 3.95] },
      { id: 'n2', x: -2.95, z: -8.33, h: 4.45, aim: [-3.65, -8.83, 3.95] },
      { id: 'e1', x: 8.96, z: 2.325, h: 4.45, aim: [9.46, 1.625, 3.95] },
      { id: 'ne', x: 8.9, z: -4.9, h: 2.30, aim: [9.5, -5.5, 1.80] },
    ],
    chairs: [{ id: 'a', x: 4.7, z: -3.3 }, { id: 'b', x: 4.7, z: 3.3 }],
    sideTables: [{ id: 'a', x: 4.7, z: -2.6 }, { id: 'b', x: 4.7, z: 2.6 }],
    // (round A4: 7 cm toward the table, the shell's ask through the floor role: the cloth's hem lay over the island's edging)
    refereeTable: { x: 0.9, z: -3.53 },
    steps: [
      { id: 'north', side: 'north', at: 0, width: 1.2 },
      { id: 'south', side: 'south', at: 0, width: 1.2 },
      { id: 'east', side: 'east', at: 0, width: 1.2 },
    ],
    // (round A4: one run, from the floor riser `ne`; a platform on a block carries its cable down a leg)
    cables: [
      { id: 'ne', path: [[9.5, -5.5], [9.5, -4.36]] },
    ],
    cableWidth: 0.10,
  },
  // The room-light service evaluates 24 emitters for the whole room (CONTRACT 14.2): each owner keeps to its share. `bake`:
  // arena/room.js (round A4: the six house floods); `rig`: the eight wash heads (the luminaire's band is bake-only since
  // round A4); `shell`: arena/shell.js (the backdrop's wash, the drape lights); the floor part has no emitter.
  emitters: { bake: 6, shell: 4, rig: 8, surround: 6, floor: 0 },
});

// The palette (own; neutral for every cloth colour). Surface and emitter colours as sRGB hex: the HUE of a surface. Its
// LEVEL is ALBEDO below (round A3: a builder scales its colour so the mean diffuse reflectance lands on the table's value).
// `alt` is the second candidate kept for the first frames.
// Round A3 (CONTRACT 15.4): the seats are graphite, not red and not navy: `seat` is a neutral, slightly cool grey whose
// linear luminance is ALBEDO.seatFabric (0.090); `seatFrame` is a black powder coat at ALBEDO.seatShell (0.040).
export const PALETTE = freeze({
  carpet: '#26272b', island: '#3d4047', drape: '#060607',
  board: '#0c1a33', boardFrame: '#8d9096', rail: '#f2f5ff',
  seat: '#525559', seatFrame: '#38383a', step: '#3a3c40', stepLight: '#ffe2b0',
  backdrop: '#4a4d54', wash: '#ffb347', truss: '#b9bcc2', head: '#0b0b0c', houseLight: '#fff4e0',
  alt: { board: '#17181b', rail: '#7fe9ff', wash: '#8a5cff' },
});

/**
 * THE ALBEDO TABLE (CONTRACT 15.2, round A3). Mean diffuse reflectance, linear (0..1), of the real material class each
 * arena surface is. A builder scales its colour map (or its vertex colour) so that the MEAN over the surface lands on the
 * value (the repo's own room does the same: "ROOM DRESSING ALBEDOS" in web/scene/room.js); the hue stays the palette's.
 * No value here is changed to fix a frame: a frame is fixed by the light (scratch/light/LEVELS.md of the lane, and
 * LEVEL_FACTOR below). The bake's bounce reads these numbers (web/tools/club/bake-room-scene.mjs).
 * `null` = a metal: no diffuse albedo (its look is its reflection; the bake counts it as METAL_BOUNCE).
 */
export const ALBEDO = freeze({
  carpet: 0.10,        // the outer carpet: a dark grey event carpet tile (needle-punch / low loop pile, charcoal): 8-12 %
  island: 0.13,        // the island's carpet: the same class one shade lighter (mid-dark grey loop pile): 12-15 %
  drape: 0.035,        // black wool serge (stage drape): 3-4 %, the darkest textile a venue hangs
  backdrop: 0.18,      // grey stretch cloth on a frame (a photographic "18 % grey" tension fabric)
  board: 0.05,         // the board face: a deep navy print on laminate / PVC banner: 4-6 %
  metal: null,         // board frames, truss, roof steel: aluminium and steel, no diffuse albedo
  refereeCloth: 0.04,  // the referee's table cloth: black cotton / polyester
  seatFabric: 0.09,    // seat upholstery: graphite woven polyester (a dark grey contract fabric): 8-10 %
  seatShell: 0.04,     // seat shells, standards, frames, handrails: black powder coat / black polypropylene: 3.5-5 %
  deck: 0.10,          // seating decks, treads, risers, fascias: dark painted board (plywood under a dark grey deck paint)
  nosing: 0.45,        // step nosings: a pale anti-slip strip (light grey / off-white aluminium-oxide tape or PVC insert)
  camera: 0.04,        // camera bodies, pedestals, tripods: matt black paint and rubber
  leather: 0.06,       // the players' chairs: dark brown leather
  tableBody: 0.04,     // the table's body (apron, legs, underside): black lacquer (role `table`)
});
/** What the bake's bounce counts for a metal surface (ALBEDO.metal): the diffuse-equivalent of a satin aluminium or painted
 * steel member seen from all sides (most of its reflection goes on as a lobe: a small diffuse share stands in for it). */
export const METAL_BOUNCE = 0.07;

/**
 * THE LEVEL FACTORS of round A3 (CONTRACT 15.2), as a record: A3 level / A2 level per emitter group. Each owner has
 * ALREADY applied its factor in its own table (the lane's scratch/light/LEVELS.md holds the arithmetic): nothing multiplies
 * by these numbers at run time. The rule: an emitter keeps its main receiver exposed as round A2 had it, so its factor is
 * (the receiver's A2 albedo) / (its ALBEDO value); the carpet beside the table stays at 75-90 of 255 and the bed is the
 * app lamp's and does not move.
 */
export const LEVEL_FACTOR = freeze({
  heads: 0.17,        // the eight wash heads: 30 -> 5.1 of the old lobe (island carpet 0.0317 -> 0.13, less what the lamp's real spill and the key lights carry); as built: cones of 11 candela that leave the same light 1 m beside the rails (rig/plan.js RIG.wash)
  lampPool: 0.455,    // the gain on the app lamp's direct light on the carpet: 2.2 -> 1.0 (the panel's real spill)
  house: 0.73,        // the house panels over the seating: 1.2 -> 0.88 (seat fabric 0.066 -> 0.09)
  ambient: 0.25,      // the analytic ambient and the bake's constant term (island carpet 0.0317 -> 0.13)
  steel: 1.0,         // the rig's own wash on its steel, the luminaire's band, the bed's bounce: no albedo moved
  drapeLights: 1.57,  // shell: 300 -> 470 (the drape went DOWN: about 0.055 -> 0.035)
  backdropWash: 0.156, // shell: 200 -> 31 (backdrop 0.028 -> 0.18)
  rail: 0.8,          // surround: 4.5 -> 3.6 (board face 0.040 -> 0.05)
  scoreboard: 1.0,    // surround: tied to its own face (radiance x area), not to a receiver
});

/**
 * The hall's light rows that arena/room.js reads (round A3: they moved here from arena/shell.js HALL, where rows of the
 * same names are no longer read; `?arenahall=key:value` still overrides them). Units: the room light's irradiance.
 *   ambient*   the analytic light's ambient and, under a bake, the bake's constant term (weighted by how open a point is):
 *              the roof's field of house lamps, which are no emitters, and the far multi-bounce. Round A2 x 0.25.
 *   poolGain   the gain on the app lamp's direct light on the carpet: 1 = the panel's real spill (0.69 units 1 m beside
 *              the long rail against 5.7 on the bed). Round A2 had 2.2: a stand-in for light a 3 % carpet could not show.
 */
// Round A4 (CONTRACT 16.1, 16.2: "before the session, house lights at half"). The ambient rows are the roof's bells and
// the ring's cans, LIT (they are fixtures of the rig, not emitters), and the hall's far multi-bounce under them; neutral
// to slightly warm (round A3's rows leaned blue). In units of irradiance, before a point's open share (the bake) or as
// written (the analytic light):
//   an open floor            ambientSky                                  0.60   (round A3: 0.08)
//   an open vertical face    ground + (sky - ground) / 2 + side          1.00   (round A3: 0.07)
//   a face that looks down   ambientGround                               0.09   (the bounce itself is the bake's)
// 0.60 on the floor is what the anchors allow: the carpet 1 m beside the long rail keeps its 3.0 units (the heads and the
// keys came down by what this adds) and the carpet at the boards rises from 0.96 to about 1.2 (target 45-60 of 255).
// 1.0 on a vertical face is the level at which a hall reads with nobody in it: the drape's deep folds and the corners
// (0.035: level 8), a board's face, a camera's body, the table's legs; a real hall under its house lights holds the
// vertical light near a half of the horizontal (here: 1.0 against the 2 to 3 units the floods put on the seating).
//   poolGainAnalytic   the gain on the app lamp's direct light on the carpet WHILE THE LIGHT MAP IS OFF. The analytic
//                      frame has no key light and no bounce (both are the bake's): at the anchor they are 0.88 + 0.2
//                      units, 1.56 times the lamp's real spill (0.69) there, and they fall off as the spill does. Round
//                      A3 had no such row and its analytic carpet beside the table stood at 63 of 255 against 83 baked.
// Round A5 (CONTRACT 17.1, 17.2: light with shape; what no flood or head hits is dark). The rows come down to a half:
//   an open floor            ambientSky                                  0.30   (round A4: 0.60)
//   an open vertical face    ground + (sky - ground) / 2 + side          0.725  (round A4: 1.00)
//   a face that looks down   ambientGround                               0.05
// 0.725 on a vertical face is the upper drape's whole light (0.035: level 5 to 6 of 255, 7 to 9 with the grade's
// shadow lift; CONTRACT 17.2: 5 to 14): as low as "no more than 3 % of a frame at or under level 4" allows. 0.30 on the
// open floor leaves 0.03 to 0.05 under the table (its open share there is 0.1 to 0.15) where round A4 had 0.06 to 0.12.
//   poolGainAnalytic   1.5 (round A4: 2.1): the keys it stands for came down from 80 to 45 candela (0.73 -> 0.41 units
//                      1 m beside the long rail) and the heads, which the analytic frame has itself, carry the pool.
// Round A5, after the half-way bake (10:10Z; the app at V10 under it): the drape's upper half read 15 to 19 of 255
// where no beam crosses it (CONTRACT 17.2: 5 to 14) and about a half of the drape's 0.6 to 0.76 units was the side row
// (0.55 times the bake's open share of about 0.75). The side row comes down to 0.34:
//   an open vertical face    ground + (sky - ground) / 2 + side          0.515  (half-way: 0.725)
// By arithmetic the drape loses 0.15 units (2 to 3 levels), a seat's back 0.10 of its 1.2 to 1.9 (2 levels: the rows
// stay inside 17.2), a camera's body 1 level; the carpet takes the sky row and does not move.
//   ambientSideAnalytic   the side row WHILE THE LIGHT MAP IS OFF. The analytic frame has no occlusion: the floods reach
//                      every seat of every row, and with the baked row on top the stands stood 12 levels over the bake
//                      (north front rows 68 | 55, top rows 52 | 40). 0.12 takes back what the row-on-row shading takes
//                      (about 0.2 units on a seat's back); the bake never reads this row and its signature does not
//                      hold it.
// Round A6 (CONTRACT 18.1: the backdrop's top third at most 25 of 255; the drape's upper half 5 to 14 with the beams
// included). Round A5's file held 0.59 neutral units on the backdrop 4 m up, 0.42 of them this side row times the open
// share there: on an 18 % cloth that alone is level 27. The side row comes down from 0.34 to 0.20:
//   an open vertical face    ground + (sky - ground) / 2 + side          0.375  (round A5: 0.515)
// By arithmetic: the backdrop's top 0.38 neutral units (level 19 before the grade's lift, 25 after), the drape 0.1
// units less (1 level), a seat's back 0.1 less (the floods go up by a twentieth for it: rig/plan.js HALL.floods).
// (14:16Z, after the half-way bake: 0.20 -> 0.15. The record held 0.42 units on the backdrop at 4 m and 0.38 at 5.5 m,
// the shell's BACK frame 28 to 32 on plain cloth in the top third; 0.30 units puts it at 24 to 27. Every vertical face
// loses 0.05 units: a seat's back 2 levels.)
// (ROUND A7, 19:00Z, for the half-way bake: 0.15 -> 0.10. CONTRACT 19.3: the backdrop's top third at most 25; round A6
// left its plain cloth at 25 to 27 on 0.33 to 0.37 units. Every vertical face loses 0.05 units: the backdrop's top
// comes to about 23 to 25, a seat's back loses 2 levels, the drape behind the blocks 1. The drape's east corners get
// their own light (arena/rig/plan.js HALL.drapeWash). The analytic row stays under the baked one: 0.12 -> 0.08.)
export const LIGHT = freeze({
  ambientSky: [0.30, 0.285, 0.265], ambientGround: [0.05, 0.0475, 0.044], ambientSide: [0.10, 0.094, 0.088],
  ambientSideAnalytic: [0.08, 0.075, 0.070],
  // (1.5 -> 1.7 at 09:36Z: the outer rectangle's profiles are emitters of the bake now, 0.15 units there, and the heads
  // came down to 14.5 candela with them; the first analytic frame at 1.5 with the heads at 15.5 read 92 beside the table)
  poolGain: 1.0, poolGainAnalytic: 1.7,
});

/**
 * ROUND A7 (CONTRACT 19.2): THE LIGHT MAP'S OWN PACKING. The shell declares the charts (carpet, backdrop, four drape
 * walls, the roof's two halves) and room/lightmap.js packs them at one density per kind: the carpet at 27.75 texels a
 * metre (3.6 cm), under the stands as on the island. The table's shadow needs 2 cm; the stands' floor, the drape's top
 * and the lid do not need what they hold. So the room re-packs (arena/room.js, after the shell is built):
 *   - the ISLAND's carpet is a chart of its own at `island` texels a metre (50: 2 cm);
 *   - the hall's carpet keeps its one rectangle at `floor` (20: 5 cm; the island's place in it stays empty);
 *   - the drape's walls at `wall` (20, was 22.2), the backdrop at `backdrop` (22.2, as it was), the lid at `roof`
 *     (11.9, as it was).
 * The joint between the two carpet charts lies under the island's edging profile. Texels a metre, densities of the
 * 1024 px map (the lite file holds the same layout at half of each). `on: false` = the shell's own packing.
 */
export const LM_PACK = freeze({ on: true, island: 50, floor: 20, wall: 20, backdrop: 22.2, roof: 11.9, minor: 12, pad: 2 });

/**
 * lightmapPack(info, island, origin) -> { size, pad, scale, floor, island, charts } | null
 *   `info`: the shell's atlas record (room/lightmap.js createAtlas info()); `island`: { x0, x1, z0, z1 } world metres
 *   (the island's CARPET as the shell lays it, inside the boards' line: the room measures it on the shell's quads);
 *   `origin`: [x, z] of the floor chart's origin. The charts keep their order and the island's chart is the LAST one
 *   (`island` = its index, `floor` = the hall carpet's); every chart lies unrotated; the island's record carries
 *   `o: [u, v]`, its origin in the floor chart's metres. null when a chart does not fit (the shell's packing stays).
 * Layout: the island top left, beside it a column of the lid's halves and the backdrop; under them the drape's four
 * walls in a column with the hall's carpet beside it. Pure arithmetic.
 */
export function lightmapPack(info, island, origin, P = LM_PACK) {
  const size = info?.size, pad = P.pad;
  const fi = (info?.charts ?? []).findIndex((c) => c.kind === 'floor');
  if (!(size > 0) || fi < 0) return null;
  const px = (m, d) => Math.max(2, Math.ceil(m * d - 1e-9));
  const backdrop = (c) => c.kind === 'wall' && c.of === 'wall:backdrop';
  const dens = (c) => (c.kind === 'floor' ? P.floor : c.kind === 'roof' ? P.roof : c.kind === 'wall' ? (backdrop(c) ? P.backdrop : P.wall) : P.minor);
  const items = info.charts.map((c) => ({ kind: c.kind, of: c.of, mw: c.mw, mh: c.mh, w: px(c.mw, dens(c)), h: px(c.mh, dens(c)), x: -1, y: -1 }));
  const iw = +(island.x1 - island.x0).toFixed(4), ih = +(island.z1 - island.z0).toFixed(4);
  const isl = { kind: 'floor', of: 'floor:island', mw: iw, mh: ih, w: px(iw, P.island), h: px(ih, P.island), x: 1, y: 1, o: [+(island.x0 - origin[0]).toFixed(4), +(island.z0 - origin[1]).toFixed(4)] };
  let y = 1;
  for (const it of items) if (it.kind === 'roof' || it.kind === 'minor' || backdrop(it)) { it.x = 1 + isl.w + pad; it.y = y; y += it.h + pad; }
  const row2 = 1 + Math.max(isl.h, y - 1 - pad) + pad;
  y = row2;
  let ww = 0;
  for (const it of items) if (it.kind === 'wall' && !backdrop(it)) { it.x = 1; it.y = y; y += it.h + pad; ww = Math.max(ww, it.w); }
  for (const it of items) if (it.kind === 'floor') { it.x = 1 + (ww > 0 ? ww + pad : 0); it.y = row2; }
  const all = [...items, isl];
  for (let a = 0; a < all.length; a++) {
    const A = all[a];
    if (!(A.x >= 1 && A.y >= 1 && A.x + A.w <= size - 1 && A.y + A.h <= size - 1)) return null;
    for (let b = a + 1; b < all.length; b++) {
      const B = all[b];
      if (A.x < B.x + B.w + pad && B.x < A.x + A.w + pad && A.y < B.y + B.h + pad && B.y < A.y + A.h + pad) return null;
    }
  }
  return {
    size, pad, scale: P.island, floor: fi, island: all.length - 1,
    charts: all.map((c) => ({ kind: c.kind, of: c.of, x: c.x, y: c.y, w: c.w, h: c.h, rot: false, mw: c.mw, mh: c.mh, ...(c.o ? { o: c.o } : {}) })),
  };
}

// The only words that may appear on a board or the scoreboard (the legal arm pins this list; the game's own name is NOT on it).
// Everything else on a panel is a geometric mark.
export const WORDS = freeze(['9-BALL', 'TABLE 1', 'ARENA', 'FINAL']);

// The fixed review poses (the lane's views.json plus the two arena-only poses), world metres with the bed plane at y = 0.
// Nothing that stands on the floor inside the boards may sit between one of these cameras and its target.
export const VIEWS = freeze([
  { id: 'V1', cam: [-2.3, 1.05, 1.35], target: [0.1, 0, 0], fov: 40 },
  { id: 'V2', cam: [-1.35, 0.32, 0.22], target: [0.2, 0, 0], fov: 32 },
  { id: 'V3', cam: [-2.15, 0.62, 0], target: [0.6, 0, 0], fov: 38 },
  { id: 'V4', cam: [0.85, 0.28, 0.25], target: [1.27, 0, 0.635], fov: 28 },
  { id: 'V5', cam: [0.25, 0.22, 0.25], target: [0, 0.02, 0.66], fov: 26 },
  { id: 'V6', cam: [0.05, 0.115, 0.75], target: [0.5, 0.045, 0.6], fov: 26 },
  { id: 'V7', cam: [-0.85, 0.2, 0.42], target: [0.05, 0.02, -0.02], fov: 28 },
  { id: 'V9', cam: [-4.0, 1.6, 2.6], target: [0, 0.3, 0], fov: 50 },
  { id: 'V10', cam: [-4.2, 0.95, 2.8], target: [0, 0.25, 0], fov: 50 },
  { id: 'V11', cam: [0, 2.3, 0.03], target: [0, 0, 0], fov: 66 },
  { id: 'TV', cam: [-4.3, 2.4, 0], target: [0.3, 0, 0], fov: 34 },
  { id: 'BACK', cam: [3.9, 1.3, 1.9], target: [-1.0, 0.4, -0.3], fov: 46 },
]);

/** The rows of one seating block: for row r (0 = front) the front edge's distance from the island's edge and its floor height. */
export function seatingRows(s = ARENA.seating) {
  const rows = [];
  for (let r = 0; r < s.rows; r++) rows.push({ row: r, offset: s.front + r * s.tread, h: s.firstRowH + r * s.rise });
  return rows;
}

/** The outer footprint of a seating block in x and z (the hall must hold it; the layout arm checks that). */
export function blockFootprint(block, a = ARENA) {
  const depth = a.seating.front + a.seating.rows * a.seating.tread;
  if (block.side === 'north') return { x0: block.from, x1: block.to, z0: a.island.z0 - depth, z1: a.island.z0 - a.seating.front };
  if (block.side === 'south') return { x0: block.from, x1: block.to, z0: a.island.z1 + a.seating.front, z1: a.island.z1 + depth };
  if (block.side === 'east') return { x0: a.island.x1 + a.seating.front, x1: a.island.x1 + depth, z0: block.from, z1: block.to };
  return { x0: a.island.x0 - depth, x1: a.island.x0 - a.seating.front, z0: block.from, z1: block.to };
}

// The `roomSide` values of the cut (ARENA.cut; room/light.js drops a marked mesh while the camera is behind its side's plane).
// 0 is never dropped: the carpet, the boards, floor furniture.
export const SIDE = freeze({ keep: 0, north: 1, east: 2, south: 3, west: 4, top: 5 });

/** The six planes of the cut for roomLight.setSides(): [nx, ny, nz, w] with dot(n, p) + w > 0 where the side is drawn.
 * Room coordinates; `floorY` = the live floor height. Index = SIDE. */
export function cutPlanes(floorY, a = ARENA) {
  const c = a.cut;
  return [[0, 0, 0, 1], [0, 0, 1, -c.north], [-1, 0, 0, c.east], [0, 0, -1, c.south], [1, 0, 0, -c.west], [0, -1, 0, floorY + c.top]];
}

// ---- the camera's reach (pure arithmetic over ARENA.camera) -----------------------------------------------------------
const distToRect = (x, z, r) => Math.hypot(Math.max(0, Math.abs(x) - r.x), Math.max(0, Math.abs(z) - r.z));

/** The lowest height above the floor at which the app's camera can be over the floor point (x, z); Infinity where the
 * camera cannot be at all. (The camera sits on a sphere of radius r around its target at a polar angle of at most
 * phi[1]: its lowest surface is a shallow cone around the target area.) */
export function cameraFloor(x, z, a = ARENA) {
  const c = a.camera, d = distToRect(x, z, c.target);
  if (d > c.radius[1] * Math.sin(c.phi[1])) return Infinity;
  return c.bedH + c.target.y0 + Math.max(c.radius[0] * Math.cos(c.phi[1]), d / Math.tan(c.phi[1]));
}

/** The highest height above the floor at which the camera can be over (x, z); -Infinity where it cannot be at all. */
export function cameraCeil(x, z, a = ARENA) {
  const c = a.camera, d = distToRect(x, z, c.target);
  if (d > c.radius[1] * Math.sin(c.phi[1])) return -Infinity;
  return c.bedH + c.target.y1 + Math.sqrt(c.radius[1] * c.radius[1] - d * d);
}

/** True when the app's camera can be at (x, z) at height h above the floor (a superset by a few centimetres). */
export function inCameraVolume(x, h, z, a = ARENA) {
  return h >= cameraFloor(x, z, a) && h <= cameraCeil(x, z, a);
}

/** True when a box (x0..x1, z0..z1, top h above the floor) standing on the floor stays under the camera everywhere. */
export function underCamera(box, a = ARENA) {
  const nx = Math.min(Math.max(0, box.x0), box.x1), nz = Math.min(Math.max(0, box.z0), box.z1); // (the cone is lowest toward the table)
  let low = Infinity;
  for (const [x, z] of [[nx, nz], [box.x0, box.z0], [box.x0, box.z1], [box.x1, box.z0], [box.x1, box.z1], [nx, box.z0], [nx, box.z1], [box.x0, nz], [box.x1, nz]]) low = Math.min(low, cameraFloor(x, z, a));
  return box.h + a.keepOut.clearance <= low;
}
