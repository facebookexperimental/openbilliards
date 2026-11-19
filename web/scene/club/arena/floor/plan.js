// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/floor/plan.js — where the furniture of the event stands and how large it is (CONTRACT.md 14.2). Owner: floor.
// Pure data and arithmetic over arena/layout.js: no three import, so it runs in node (web/tools/club/test-club-arena-floor.mjs).
//
// What is planned (every place from ARENA.floor and ARENA.boards.gaps; sizes are this module's):
//   cameras     broadcast cameras on wheeled pedestals at FULL height (the optical axis CAM.lensOverDeck = 1.50 m over
//               what the pedestal stands on; real studio pedestals carry the lens at 1.4 to 1.6 m), BY PLACEMENT
//               (CONTRACT 15.3: nothing is hidden, dimmed or switched by where the app's camera is). The arithmetic: the
//               app camera's reach in plan is radius[1] x sin(phi[1]) = 6.4526 m around its target rectangle, and inside
//               that reach its lowest surface (layout.js cameraFloor) is never higher than 1.573 m, so a camera whose
//               finder tops out near 1.75 m cannot stand anywhere inside it: not on the island, not in the gangway behind
//               the far boards (1.27 m there), not at the front of the stands. So each camera stands OUTSIDE the reach
//               (`platform` in the layout's camera entry): on a low riser on the hall's floor, or (round A4, CONTRACT
//               16.5: where the review poses frame it) on a scaffold platform built over a few folded seats of a seating
//               block, just outside the reach (`platform.on` = the block's id). planCamera() proves the place with the
//               layout's own test (clearOfCamera: inCameraVolume() is false at every point of the camera and at the
//               layout's clearance around it); a camera whose place fails, or whose entry has no platform, is not built
//               and is named in `problems`. Each camera tilts down to its target (the table's bed at the layout's lookAt).
//   platforms   under each camera. On the floor: a deck of dark painted board on a steel frame with posts and foot
//               plates, a kick rail on the three sides that do not carry the step-up, a pale nosing on the step-up side,
//               the cable's drop over that side, and a folding stool on the deck beside the pedestal. On a seating block
//               (planTower): the same deck on four scaffold standards that stand on base plates on the rows' walkways,
//               at seat centres in front of the folded seats; ledgers, braces, rungs at both ends, a guard rail on the
//               three sides away from the stair aisle; the deck's underside clears every seat under it. Such a platform,
//               its camera and its cable carry the block's cut side (`side`: the hall drops a block while the app's
//               camera is behind that side's plane, and what stands on the block leaves with it). Unmanned.
//   chairs      two low upholstered chairs at the foot end, turned a little toward the table, each with a side table
//               (a bottle, a folded towel, a cube of chalk). Nothing lies on a seat.
//   desk        the table by the north boards (a black cloth to the floor with folds at the corners and a hem on the
//               carpet, a ball tray, a rack triangle) with the rest leaning on its end.
//   thresholds  a flat aluminium strip across each walk-in of the boards.
//   cables      the taped runs of ARENA.floor.cables: a flat ribbon with the cable's ridge under the tape, from where
//               each camera's cable lands beside its platform to the flank of the nearest seating block.
// Not planned here: ARENA.floor.steps (the stairs from the carpet to the first row at each aisle). The surround builds those
// steps with its aisles (surround.js `approach`); a second set in the same place would fight it. See the floor role's report.
//
// NO STATURE: no figure, no person-shaped item, nothing draped that reads as one. PARTS is the whole list of what an item is
// made of; checkPeople() is the rule the arm runs over what was really built.
import { ARENA, VIEWS, SIDE, cameraFloor, inCameraVolume, blockFootprint, seatingRows } from '../layout.js';

export const FLOOR_PLAN_VERSION = 3;
// The shapes' revision: bumped whenever floor/items.js or a size below changes what is built (the arm pins a hash of the
// built vertices against it, so a shape cannot change without this number changing the bake's signature).
export const FLOOR_GEOMETRY_REV = 7;

// the played table's footprint when the room hands no keep-out rectangle (the 9 ft table, as the hall's arm has it)
export const TABLE = Object.freeze({ hx: 1.4478, hz: 0.8128 });

// The camera, in the frame that tilts with it: origin on the tilt axis over the pedestal's centre, +z = the lens, y up.
export const CAM = Object.freeze({
  skirtR: 0.33, skirtH: 0.262, skirtLift: 0.05,
  drop: 0.125,                 // from the tilt axis down to the column's top plate
  // radians, lens down: each camera tilts to its target (the bed's height at the layout's lookAt); a floor riser 11 m from
  // the table gives 0.09, a platform on the stands 9 m away and 3.2 m over the bed 0.34. `tilt` = a camera with no target.
  tilt: 0.08, tiltRange: Object.freeze([0.04, 0.42]),
  axis: 0.215,                 // the optical axis above the tilt axis
  lens: Object.freeze({ w: 0.25, h: 0.25, z0: -0.015, z1: 0.485 }),
  hood: Object.freeze({ w: 0.272, h: 0.262, z1: 0.60 }),
  housing: Object.freeze({ w: 0.15, h: 0.235, y0: 0.09, z0: -0.39, z1: -0.03 }),
  // (the finder: a monitor behind the housing under a deep hood: `hood` = how far the hood's plates stand out behind its face)
  finder: Object.freeze({ w: 0.21, h: 0.15, d: 0.05, y: 0.275, z: -0.445, lean: 0.2, hood: 0.11 }),
  top: 0.392,                  // the highest point (the tally on the finder), at about z = -0.45
  bars: Object.freeze({ x: 0.20, y: -0.07, z: -0.44 }),   // the grips' ends
  connector: Object.freeze({ x: 0.04, y: 0.10, z: -0.39 }),
  // FULL HEIGHT: the optical axis over what the pedestal stands on, and the range a real studio pedestal works in
  lensOverDeck: 1.50, lensRange: Object.freeze([1.40, 1.60]),
  // the telescoping column: where its two lower stages end, as shares of the column's length over the skirt
  stages: Object.freeze([0.42, 0.74]),
  // the farthest point of the camera from its pedestal's axis, in plan, at the steepest tilt (a corner of the hood)
  reach: 0.70,
});
// The platform under a camera (the deck's size and height come from the layout's camera entry).
export const PLATFORM = Object.freeze({
  min: 1.2, hMin: 0.15, hMax: 0.60,    // what a layout entry may ask for (a riser on the hall's floor)
  board: 0.021,                        // the deck board (plywood)
  frame: 0.05,                         // the steel box section of the frame and the posts
  inset: 0.05,                         // the frame stands this far inside the deck's edge
  kick: 0.10, kickT: 0.018, kickIn: 0.012,   // the kick rail: a board on edge, standing on the deck
  footW: 0.09, footH: 0.006,
  nosing: 0.035,                       // the pale strip along the step-up side
  land: 0.09,                          // where the cable lands on the carpet, out from the deck's edge
  stoolIn: 0.32,                       // the stool's centre from the deck's two edges at its corner
});
// A folding stool: two crossed tube frames under a padded seat.
export const STOOL = Object.freeze({ w: 0.33, d: 0.29, h: 0.45, pad: 0.03, tube: 0.011, spread: 0.19 });
// A scaffold platform on a seating block (a "seat kill": the deck stands over folded seats on four standards).
export const TOWER = Object.freeze({
  min: 1.1, hMax: 3.2,                 // what a layout entry with `on` may ask for (the deck's side, its top over the floor)
  tube: 0.0242,                        // scaffold tube: 48.3 mm
  rail: 1.05, mid: 0.55, post: 0.02,   // the guard rail over the deck: top rail, mid rail, the posts' tube
  plate: 0.15, plateT: 0.008, jack: 0.1, jackR: 0.017,   // a base plate under each standard, the screw jack over it
  under: 0.071,                        // the deck's board and frame: its underside is this far under its top
  clear: 0.02,                         // what the underside keeps over a seat
  end: 0.25, edge: 0.05,               // where the standards stand: from the deck's ends (then moved to a seat centre), from its front and rear edges
  walk: Object.freeze([0.06, 0.44]),   // where a standard may stand in a row, behind the row's front edge: the walkway in front of the folded seats
  drape: 0.045,                        // the black skirt on the front and the two ends: how far its pipes may stand out from the deck's edge
  slit: 0.10, hang: 0.052,             // the cable: over the open end's edge this far behind the rear-most row's front edge; where it meets the row, out from the deck's edge
  // the surround's folded seat (arena/surround/plan.js SEAT and the layout's seating; the arm compares them): the seats'
  // line behind a row's front edge, and what stands where behind that edge, with its top over the row's deck
  seatLine: 0.60, endMargin: 0.02,
  zones: Object.freeze([
    Object.freeze({ what: 'arm rests', from: 0.19, to: 0.53, top: 0.62 }),
    Object.freeze({ what: 'folded pans', from: 0.515, to: 0.60, top: 0.76 }),
    Object.freeze({ what: 'seat backs', from: 0.585, to: 0.72, top: 0.88 }),
  ]),
});
// the points of the camera that can touch the cone first (tilting frame): hood, lens, housing, finder and its hood, bar ends
const CAM_CONTROL = Object.freeze([
  [0.136, 0.349, 0.60], [-0.136, 0.349, 0.60], [0.136, 0.349, 0.485], [-0.136, 0.349, 0.485],
  [0.136, 0.084, 0.60], [-0.136, 0.084, 0.60], [0.05, 0.415, 0.29], [-0.05, 0.415, 0.29],
  [0.125, 0.34, -0.015], [-0.125, 0.34, -0.015], [0.075, 0.325, -0.39], [-0.075, 0.325, -0.39],
  [0.105, 0.392, -0.40], [-0.105, 0.392, -0.40], [0.105, 0.392, -0.51], [-0.105, 0.392, -0.51],
  [0.11, 0.385, -0.57], [-0.11, 0.385, -0.57], [0.11, 0.22, -0.605], [-0.11, 0.22, -0.605],
  [0.225, -0.04, -0.47], [-0.225, -0.04, -0.47],
]);
// the camera's rearmost and highest point in the tilting frame (the finder's hood: it rises as the lens tilts down)
const CAM_BACK = Object.freeze([0, CAM.top, -0.60]);

export const CHAIR = Object.freeze({ w: 0.70, d: 0.70, h: 0.79, seatH: 0.43, turn: 0.36 });
export const SIDE_TABLE = Object.freeze({ r: 0.21, h: 0.50, top: 0.725 });
// (the cloth: `flare` = how far the hem stands out from the top's edge, `fold` = the depth of the folds along a side at the
// hem, `corner` = how far the fold at a corner stands out beyond that, `hem` = the width of cloth lying on the carpet)
export const DESK = Object.freeze({ w: 0.90, d: 0.50, h: 0.747, flare: 0.03, fold: 0.04, corner: 0.11, hem: 0.045, top: 0.80 });
export const REST = Object.freeze({ length: 1.38, lean: 0.715, over: 0.24, behind: -0.12 });
export const THRESHOLD = Object.freeze({ depth: 0.12, h: 0.005, inset: 0.11 });   // a flat strip: the taped cable runs over it
export const CABLE = Object.freeze({ ridge: 0.0155, edge: 0.0075, core: 0.016, piece: 2.4 });   // heights of the tape's lie: over a threshold's top

// ---- ROUND A5 (CONTRACT 17.1): THE DRESS OF THE PLAYING FLOOR. The floor is the bright zone of the frame now, so what
// stands on it is the lit foreground. ONE switch holds all of it (floor.js readLook `dress`; `?clubfloor=dress:0|1` is
// the tool's on / off pair of one tree): with the switch off the part builds round A4's geometry, vertex for vertex
// (the arm pins both variants). FLOOR_DRESS_DEFAULT is what a build without a switch gives: it is turned on in ONE
// edit, after the dressed variant has been seen in an app frame (the bake's signature moves with it on the base and the
// high room; the lite room builds no dress and keeps its signature).
//   remote     ONE LOW CAMERA (the layout's `floor.lowCamera`): a compact camera in a yoke on a short post on a steel base
//              plate, on the playing floor at the table's foot end, where the hall photographs show a camera first. It
//              stands INSIDE the app camera's plan reach and UNDER its cone: lawful by the layout's exact test
//              (planRemote: inCameraVolume() is false at every point of it and at the layout's clearance around it; the
//              cone's underside is 1.125 m there, the camera ends at REMOTE.top). No view rule; unmanned by its kind
//              (a remote camera has no bars, no finder and nobody's place behind it). Its cable is a taped run to the
//              nearest board's foot.
//   monitor    a floor monitor on a wedge foot at the foot end's boards, turned to the table: a dark screen with a plain
//              level bar (no word, no digit, no mark).
//   bin        a waste bin at the desk's end away from the leaning rest.
//   cueStand   an empty cue stand beyond each side table (a wooden post with a two-notch rest on a round foot).
//   on what stands already: a clear bottle, a glass and an ice bucket on the side tables, a towel over ONE chair's arm,
//   pale tape marks at the chairs' front glides and at the remote camera's base plate, a worn edge on the cameras' hoods.
export const FLOOR_DRESS_DEFAULT = true;
// the revision of the dress's own shapes (in the signature of a dressed plan only)
export const DRESS_REV = 2;
// how far inside the board line a standing thing of the dress stays: the shell's edging profile on the island's joint
// ends 0.355 m inside the line, its contact shade 0.370 m (the shell role's rule of round A4)
export const BOARD_CLEAR = 0.376;
// The remote camera, in the frame of its post: origin on the floor under the post's axis, +z = the lens.
export const REMOTE = Object.freeze({
  base: 0.22, baseT: 0.012,            // the base plate: a steel disc
  post: 0.028, postTop: 0.77,          // the post's radius; where the pan drum sits on it
  clamp: 0.46,                         // the height of the post's clamp collar
  pan: 0.058, panH: 0.065,             // the pan drum
  axis: 0.925,                         // the tilt axis and the lens's axis over the floor
  tilt: 0.04,                          // radians, lens down: to the bed's far end from 0.135 m over it
  housing: Object.freeze({ w: 0.118, h: 0.12, z0: -0.15, z1: 0.07 }),
  lens: Object.freeze({ r: 0.043, z1: 0.205 }), hood: Object.freeze({ r: 0.057, z0: 0.185, z1: 0.262 }),
  yoke: Object.freeze({ x: 0.089, t: 0.018, d: 0.06, plate: 0.016 }),
  top: 1.02,                           // its highest point (the carrying handle)
  // the camera's reach from the post's axis in plan: half width (the tilt knobs), toward the lens, behind (the cable's loop)
  reach: Object.freeze({ hw: 0.115, front: 0.27, back: 0.19 }),
});
// A tool's stand-in for the layout's `floor.lowCamera` while the layout does not carry the entry yet (the floor role's
// request of round A5): read ONLY under the tool switch `clubfloor=low:1`, by the dev page and by the arm; a build
// without that switch takes the place from the layout or builds no remote camera.
export const LOW_CAMERA_PROPOSED = Object.freeze({ id: 'lo', x: 5.0, z: 1.25, lookAt: Object.freeze([0, 0]), top: 1.03 });
// The floor monitor, in its own frame (+z = the screen's side): a flat screen leaning back on a wedge foot.
// (`off`: how far off the table's axis the one at the chairs' end stands; `far`: how far beyond the waste bin the one in
// the officials' corner stands, along the boards)
export const MONITOR = Object.freeze({ w: 0.62, h: 0.38, t: 0.055, lean: 0.38, lift: 0.06, front: 0.15, back: 0.17, top: 0.45, off: 0.35, far: 1.45 });
export const BIN = Object.freeze({ r: 0.125, r0: 0.1, h: 0.30, gap: 0.035 });
export const CUE_STAND = Object.freeze({ base: 0.115, baseH: 0.028, post: 0.011, h: 0.80, rest: 0.15, gap: 0.035 });

// ---- ROUND A6 (CONTRACT 18.1: the stand cameras lit; the last stand-ins; a floor that is used). ONE switch holds the
// round's set (floor.js readLook `a6`; `?clubfloor=a6:0|1` is the tool's on / off pair of one tree): with it off the
// part builds round A5's geometry, vertex for vertex (the arm pins both). FLOOR_A6_DEFAULT is what a build without a
// switch gives: turned on in ONE edit, after the set has been seen in an app frame.
//   workLight  a small work lamp per camera platform (the layout's `floor.workLights`: the light role owns the place of
//              the lit opening and the bake's emitter there; this part builds the fixture to that place): a thin mast
//              on the guard rail's corner post nearest the place (on a riser, which has no guard rail: on a flange
//              screwed to the deck), a 10 cm can tipped down at the camera. No registered emitter here.
//   on the low camera: a shot weight on its base plate, spare cable tied in a coil on its post.
//   roadCase   a production flight case on castors at the head end's boards, beside the walk-in.
//   trolley    a two-shelf cart at the desk's boards beyond the far monitor: a lined tray, a folded cloth.
//   spot       a cross of pale tape where a camera stands during a session (the layout's own review poses TV and V10
//              stand on such places), one with a coil of its cable and a taped run that curves in from the boards.
//   and: both chairs a little askew, a second rest lying on the desk, worn tape inside each walk-in.
export const FLOOR_A6_DEFAULT = true;
// the revision of the round's own shapes (in the signature of a plan with the set on only)
export const A6_REV = 1;
// The work lamp, in the frame of its mast's foot on the deck. `over`: the lit opening over the deck that a mast is
// built for; `fit`: how far the built opening may sit from the layout's place; `reach`: the can's middle from the mast.
export const WORK_LIGHT = Object.freeze({ over: 2.0, top: 2.09, mast: 0.011, sleeve: 0.017, sleeveFrom: 0.70, can: 0.037, canLen: 0.105, fit: 0.05, reach: 0.16, flange: 0.12 });
// A tool's stand-in for the layout's `floor.workLights` while the layout does not carry the entry yet (the light
// role's own table of 12:27Z, agreed 12:33Z: the lit opening's place [x, z] and its height over the FLOOR, the point
// it is aimed at as [x, z, h]): read ONLY by the dev page, the arm and the tool switch `clubfloor=a6:1` before the
// default is turned on; a default build takes the places from the layout or builds no lamp.
export const WORK_LIGHTS_PROPOSED = Object.freeze([
  Object.freeze({ id: 'n1', x: 0.75, z: -8.33, h: 4.45, aim: Object.freeze([1.45, -8.83, 3.95]) }),
  Object.freeze({ id: 'n2', x: -2.95, z: -8.33, h: 4.45, aim: Object.freeze([-3.65, -8.83, 3.95]) }),
  Object.freeze({ id: 'e1', x: 8.96, z: 2.325, h: 4.45, aim: Object.freeze([9.46, 1.625, 3.95]) }),
  Object.freeze({ id: 'ne', x: 8.9, z: -4.9, h: 2.30, aim: Object.freeze([9.5, -5.5, 1.80]) }),
]);
// A flight case (+z = its front, a long side): `clear`: how far its box stays beyond the stroke room's edge, so it joins
// the mesh group of the desk's side (no draw call of its own).
// (0.20 m: its shadow overlays are wider than the case and stay beyond that edge too)
export const ROAD_CASE = Object.freeze({ w: 0.70, d: 0.52, h: 0.50, castor: 0.085, top: 0.60, turn: 0.07, clear: 0.20 });
// The cart (+z = its front, a long side): `off`: how far beyond the far monitor it stands, along the boards.
// (1.2 m: at 0.5 it stood half cut by the left edge of the wide review pose V10, shots/floor/m1-V10.jpg; at 1.2 it
// stands 47 degrees off that pose's axis, outside its frame and V9's, in BACK's)
export const TROLLEY = Object.freeze({ w: 0.62, d: 0.40, h: 0.78, shelf: 0.24, tube: 0.011, castor: 0.07, top: 0.86, turn: -0.12, off: 1.2 });
// A camera's spot: a cross of two strips; `coil`: the coil's radius and height, `out`: its middle from the cross.
export const SPOT = Object.freeze({ len: 0.30, wide: 0.045, coil: 0.17, coilH: 0.055, out: 0.46 });
// what a low camera carries on its plate and its post
// (`at`: its middle from the post's axis: clear of the plate's hub, inside the plate's rim)
export const BALLAST = Object.freeze({ w: 0.22, d: 0.13, h: 0.055, at: 0.123 });
// the second rest, lying on the desk along its front edge
export const SPARE = Object.freeze({ length: 0.82, z: 0.2, turn: 0.035 });
// the worn tape inside a walk-in: how far inside the board line (beyond the shell's edging), its length's share of the gap
export const SCUFF = Object.freeze({ inside: 0.47, share: 0.62, wide: 0.05 });
// how far the first chair is turned from its planned bearing under the set (the second one has stood askew since A5)
export const CHAIR_ASKEW_A6 = -0.09;

// ---- ROUND A7 (CONTRACT 19.3: the tape reads as tape or goes; A6's open item: the west third is used). ONE switch
// holds the round's geometry (floor.js readLook `a7`; `?clubfloor=a7:0|1` is the tool's on / off pair of one tree):
// with it off the part builds round A6's geometry, vertex for vertex (the arm pins both). FLOOR_A7_DEFAULT is what a
// build without a switch gives: turned on in ONE edit, after the set has been seen in an app frame.
//   gone       the two pale crosses under the review poses, with the coil and its curved run: a mark lying alone in
//              the open floor reads as a stray dash, not as tape, and a coil with no camera is nobody's;
//   spike      the marks that stay are spike tape where a crew sets a thing back on its place: an L round each front
//              glide of a chair, a T and two ticks at the low camera's plate. Matt cloth tape 5 cm wide in a muted
//              yellow, laid by hand (the arms overlap, neither is square);
//   west       a second corner at the west boards (the base room and up): a low chair turned to the table and a
//              little further (not square to the boards) and a side table with a folded towel and a glass. Nothing
//              lies on the seat. The base room builds it in a lean form and pays for it with trims no pose resolves.
export const FLOOR_A7_DEFAULT = true;
// the revision of the round's own shapes (in the signature of a plan with the set on only)
export const A7_REV = 1;
// The west corner. `z`: the chair's place along the boards (south of the head end's axis, where the pose BACK frames
// it beside the table); `in`: its middle inside the edging's line; `askew`: its turn beyond the planned bearing;
// `table`: the side table's middle from the chair's (toward the boards, along the boards away from the axis).
export const WEST_CORNER = Object.freeze({ z: 1.45, in: 0.52, askew: 0.1, table: Object.freeze([0.02, 0.78]) });
// spike tape: a strip's width and length; how far it lies from the foot it marks
export const SPIKE = Object.freeze({ wide: 0.05, len: 0.13, gap: 0.008 });
// ---- ROUND A8 (CONTRACT 20.2 row 6: the west floor is bare from the far end). ONE switch holds the round's geometry
// (floor.js readLook `a8`; `?clubfloor=a8:0|1` is the tool's on / off pair of one tree): with it off the part builds
// round A7's geometry, vertex for vertex. FLOOR_A8_DEFAULT is what a build without a switch gives.
//   a monitor position in the south-west quadrant, beyond the stroke room: round A5's floor monitor turned to the
//   table with the platforms' folding stool beside it (the base room and up) and, on the high room, its cable taped
//   to the south boards' foot. Nothing new is modelled. The base room reads the high room's light file, which holds
//   both solids' shadows, and no shadow ships without its object: so it builds both, without the cable. The monitor
//   is paid for with the 8 mm bevel of its three monitors' cases (items.js `trim8`); the stool's 104 triangles are
//   not paid for (the base floor's line is 4,900 from this round). The lite room builds none of it.
export const FLOOR_A8_DEFAULT = true;
// `at`: the monitor's place; `stool`: the stool's place and its turn from the monitor's bearing
export const MONITOR_SPOT = Object.freeze({ at: Object.freeze([-3.7, 2.7]), stool: Object.freeze([-3.7, 3.35, 0.4]) });
// ROUND A7 (CONTRACT 19.1): the readers of the hall's baked reflection are not a switch. Steel, aluminium, chrome and
// the lenses are metals at their real reflectance on the hard material of every tier and take the hall's cube through
// the env service's handle (floor.js makeMaterials: the tag); the stand-ins of CONTRACT 18.4 (a constant on the lens
// glass, a satin grey bucket, a darkened steel, a matt pale finish on the flight case's edges) are DELETED: there is
// no code path that builds them.

// Everything an item is made of (the arm pins this list; a part outside it fails the build's check).
const A4_PARTS = {
  camera: ['skirt', 'bumper', 'wheel', 'column', 'collar', 'stage', 'ring', 'spoke', 'panTilt', 'cradle', 'wedge', 'supporter',
    'housing', 'lens', 'hood', 'bezel', 'glass', 'label', 'plate', 'vent', 'panel', 'handle', 'loom', 'tie', 'finder', 'screen', 'visor', 'tally', 'bar', 'grip', 'zoom', 'focus',
    'connector', 'lead'],
  platform: ['deck', 'joint', 'wear', 'mark', 'cover', 'frame', 'post', 'foot', 'kick', 'bracket', 'nosing', 'drop',
    'standard', 'jack', 'ledger', 'rail', 'drape'],
  stool: ['seat', 'strut', 'rung', 'tip'],
  chair: ['glide', 'plinth', 'cushion', 'arm', 'back', 'pad', 'piping', 'crease'],
  sideTable: ['base', 'stem', 'top', 'bottle', 'stopper', 'towel', 'chalk'],
  desk: ['cloth', 'hem', 'slab', 'tray', 'lining', 'rack', 'duster', 'shaft', 'bumper', 'ferrule', 'bridge'],
  threshold: ['strip', 'edge'],
  cable: ['tape'],
};
// what the dress of round A5 adds: new parts of the kinds above, and four new kinds
export const DRESS_PARTS = Object.freeze({
  camera: Object.freeze(['edge']),
  chair: Object.freeze(['towel', 'mark']),
  sideTable: Object.freeze(['bucket', 'glass', 'cap']),
  remote: Object.freeze(['base', 'post', 'clamp', 'pan', 'yoke', 'housing', 'lens', 'hood', 'glass', 'handle', 'lead', 'mark']),
  monitor: Object.freeze(['foot', 'case', 'screen', 'bar']),
  bin: Object.freeze(['tub', 'liner']),
  cueStand: Object.freeze(['base', 'post', 'rest']),
});
// what round A6's set adds (the arm audits each against the person rule: a work lamp is a mast and a can; `ballast` is
// a shot weight of production kit on the low camera's plate; a flight case, a cart, a tape cross)
export const A6_PARTS = Object.freeze({
  workLight: Object.freeze(['flange', 'sleeve', 'mast', 'swivel', 'can', 'lens', 'lead']),
  remote: Object.freeze(['ballast', 'coil']),
  desk: Object.freeze(['spare']),
  threshold: Object.freeze(['scuff']),
  roadCase: Object.freeze(['box', 'edge', 'latch', 'grip', 'castor']),
  trolley: Object.freeze(['frame', 'shelf', 'castor', 'tray', 'lining', 'cloth']),
  spot: Object.freeze(['cross', 'coil']),
});
export const PARTS = Object.freeze(Object.fromEntries([...new Set([...Object.keys(A4_PARTS), ...Object.keys(DRESS_PARTS), ...Object.keys(A6_PARTS)])].map((kind) => [kind, Object.freeze([...(A4_PARTS[kind] ?? []), ...(DRESS_PARTS[kind] ?? []), ...(A6_PARTS[kind] ?? [])])])));
// a name that describes a person, a part of one, or a thing worn or carried by one
export const PERSON_NAME = /person|people|figure|silhouette|head|face|crowd|spectator|audience|player|referee|umpire|operator|crew|jacket|coat|\bhat\b|bag|dummy|mannequin|torso|limb|\bleg\b|\bhand\b|body/i;
// Nothing but a camera is as tall as a seated person's eye line plus a margin; nothing rests on a chair or on a stool. A
// camera (the only tall thing: a pedestal, a column and a box lens, every part of it in PARTS.camera) ends
// `cameraOverDeck` over what it stands on (the finder's hood behind a lens that tilts 20 degrees down reaches 1.9 m).
// A platform's own parts end `platformOverDeck` over its deck (a guard rail at hip height), whatever the deck stands on.
// (round A6: a work lamp's mast ends `workLightOverDeck` over its platform's deck, and no part of it is wider than
// `workLightWide` in plan: a mast with a can on it, never a shape with shoulders)
export const STATURE = Object.freeze({ maxTop: 1.30, chairTop: 0.82, cameraOverDeck: 2.0, platformOverDeck: 1.10, workLightOverDeck: 2.10, workLightWide: 0.24 });

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const facing = (ry) => ({ fx: Math.sin(ry), fz: Math.cos(ry), rx: Math.cos(ry), rz: -Math.sin(ry) });
/** A local point (x = right, z = front) of a frame at (ox, oz) turned by ry, in the room. */
export const toRoom = (ox, oz, ry, x, z) => { const f = facing(ry); return [ox + f.rx * x + f.fx * z, oz + f.rz * x + f.fz * z]; };
const boxOf = (pts, pad = 0) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0: r4(x0 - pad), x1: r4(x1 + pad), z0: r4(z0 - pad), z1: r4(z1 + pad) };
};
const rectBox = (ox, oz, ry, hw, front, back, pad = 0) => boxOf([toRoom(ox, oz, ry, -hw, front), toRoom(ox, oz, ry, hw, front), toRoom(ox, oz, ry, -hw, -back), toRoom(ox, oz, ry, hw, -back)], pad);
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const union = (list) => ({ x0: r4(Math.min(...list.map((b) => b.x0))), x1: r4(Math.max(...list.map((b) => b.x1))), z0: r4(Math.min(...list.map((b) => b.z0))), z1: r4(Math.max(...list.map((b) => b.z1))) });

/** The rectangle nothing may stand in: the room's keep-out rectangle, or the 9 ft table plus the stroke room. */
export function strokeRect(A = ARENA, tableBounds = null) {
  const k = A.keepOut.strokeRoom;
  const t = tableBounds && [tableBounds.minX, tableBounds.maxX, tableBounds.minZ, tableBounds.maxZ].every(Number.isFinite) ? tableBounds : null;
  // (never smaller than the 9 ft table's: a room that read a smaller table does not open the stroke room to furniture)
  return {
    x0: Math.min(t ? t.minX : Infinity, -TABLE.hx - k), x1: Math.max(t ? t.maxX : -Infinity, TABLE.hx + k),
    z0: Math.min(t ? t.minZ : Infinity, -TABLE.hz - k), z1: Math.max(t ? t.maxZ : -Infinity, TABLE.hz + k),
  };
}

/** Which mesh group a box goes to, so that no merged mesh's box holds the table (the ball return's furniture walk reads
 * every scene mesh whose box holds one of its stations under the table): the side of the stroke room it lies beyond. */
export function groupOf(box, stroke, order = GROUP_ORDER) {
  for (const side of order) {
    if (side === 'east' && box.x0 >= stroke.x1) return side;
    if (side === 'west' && box.x1 <= stroke.x0) return side;
    if (side === 'south' && box.z0 >= stroke.z1) return side;
    if (side === 'north' && box.z1 <= stroke.z0) return side;
  }
  return null;
}
const GROUP_ORDER = Object.freeze(['east', 'west', 'south', 'north']);
// (what stands in the hall's corners joins the east group or the group of its long side, never the west one: the west
// group holds only the thresholds, and the default tier counts every mesh)
const HALL_ORDER = Object.freeze(['east', 'north', 'south', 'west']);

const RING = Object.freeze([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]]);
/**
 * The layout's exact test with the layout's clearance: true when the point (x, h above the floor, z) and every point
 * `keepOut.clearance` around it, beside it and over it, are outside the volume the app's camera can reach
 * (layout.js inCameraVolume: over the cone's underside and inside the plan reach).
 */
export function clearOfCamera(x, h, z, A = ARENA) {
  const k = A.keepOut.clearance;
  for (const [dx, dz] of RING) for (const dh of [0, k]) if (inCameraVolume(x + dx * k, h + dh, z + dz * k, A)) return false;
  return true;
}
/** How far outside the app camera's plan reach a floor point is (negative: inside it). */
export function reachMargin(x, z, A = ARENA) {
  const c = A.camera;
  return Math.hypot(Math.max(0, Math.abs(x) - c.target.x), Math.max(0, Math.abs(z) - c.target.z)) - c.radius[1] * Math.sin(c.phi[1]);
}

/** The camera's tilt transform: a point of the tilting frame -> [x, height above the tilt axis, z along the lens]. */
export function tilted(p, tilt = CAM.tilt) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

/** True when a layout camera entry carries a platform this part can build: a riser on the hall's floor, or (with
 * `platform.on`) a scaffold platform on a seating block. */
export function platformOk(c) {
  const P = c?.platform;
  if (!P || ![P.w, P.d, P.h].every(Number.isFinite) || !(P.h >= PLATFORM.hMin)) return false;
  if (P.on !== undefined && P.on !== null) return typeof P.on === 'string' && P.w >= TOWER.min && P.d >= TOWER.min && P.h <= TOWER.hMax;
  return P.w >= PLATFORM.min && P.d >= PLATFORM.min && P.h <= PLATFORM.hMax;
}

/** How far a camera tilts its lens down (radians): to the bed's height at its layout target, from its lens's height. */
export function cameraTilt(c, A = ARENA) {
  const deckH = Number.isFinite(c?.platform?.h) ? c.platform.h : 0;
  const dist = Math.hypot(c.lookAt[0] - c.x, c.lookAt[1] - c.z);
  if (!(dist > 0.5)) return CAM.tilt;
  const t = Math.atan2(deckH + CAM.lensOverDeck - A.camera.bedH, dist);
  return Math.round(Math.min(CAM.tiltRange[1], Math.max(CAM.tiltRange[0], t)) * 1000) / 1000;
}

/**
 * One camera at full height on its platform: its frame, its heights, its footprint, and whether its place is lawful
 * (`standing`; `why` says what fails: no platform in the layout's entry, or a point of it inside the volume the app's
 * camera can reach, by the layout's test with the layout's clearance).
 */
export function planCamera(c, A = ARENA, index = 0) {
  const ry = Math.atan2(c.lookAt[0] - c.x, c.lookAt[1] - c.z);
  const deckOk = platformOk(c);
  const deckH = deckOk ? c.platform.h : 0;
  const tilt = cameraTilt(c, A);
  const onBlock = deckOk && c.platform.on ? c.platform.on : null;
  // the tilt axis over the deck: the optical axis crosses the pedestal's own axis CAM.axis x cos(tilt) over it
  const over = Math.round((CAM.lensOverDeck - CAM.axis * Math.cos(tilt)) * 1000) / 1000;
  const pivot = r4(deckH + over);
  const top = tilted(CAM_BACK, tilt)[1];
  // the footprint: the lens and its hood, the bars, the finder and its hood, the skirt
  const fp = union([rectBox(c.x, c.z, ry, 0.14, CAM.reach, 0), rectBox(c.x, c.z, ry, 0.228, 0, 0.475), rectBox(c.x, c.z, ry, 0.115, 0, 0.66),
    { x0: c.x - CAM.skirtR - 0.01, x1: c.x + CAM.skirtR + 0.01, z0: c.z - CAM.skirtR - 0.01, z1: c.z + CAM.skirtR + 0.01 }]);
  const control = CAM_CONTROL.map((p) => { const [lx, ly, lz] = tilted(p, tilt); const [wx, wz] = toRoom(c.x, c.z, ry, lx, lz); return [r4(wx), r4(pivot + ly), r4(wz)]; });
  // the points the place is proven on: the camera's own, the pedestal's rim from the deck to the tilt axis, the top
  const proof = [...control, [c.x, r4(pivot + top + 0.03), c.z]];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, x = r4(c.x + Math.cos(a) * (CAM.skirtR + 0.01)), z = r4(c.z + Math.sin(a) * (CAM.skirtR + 0.01));
    for (const h of [deckH + 0.05, deckH + CAM.skirtH, deckH + over * 0.6, pivot]) proof.push([x, r4(h), z]);
  }
  let why = null;
  if (!deckOk) why = 'its layout entry has no platform (a camera stands at full height on a platform outside the app camera\'s reach; it is not run down and not hidden by view)';
  else {
    const bad = proof.find(([x, h, z]) => !clearOfCamera(x, h, z, A));
    if (bad) why = `a point of it at ${bad[1]} m over the floor (${bad[0]}, ${bad[2]}) is inside the volume the app's camera can reach (${r4(reachMargin(bad[0], bad[2], A))} m from the edge of its plan reach, the cone's underside is ${r4(cameraFloor(bad[0], bad[2], A))} m there)`;
  }
  return {
    id: c.id, kind: 'camera', zone: onBlock ? 'stand' : 'hall', block: onBlock, on: `platform.${c.id}`, x: c.x, z: c.z, ry: r4(ry), tilt,
    deckH, pivotOverDeck: over, pivotH: pivot, lensOverDeck: CAM.lensOverDeck, lensH: r4(deckH + CAM.lensOverDeck), top: r4(pivot + top),
    standing: !why, why, tally: index === 0, reachMargin: r4(Math.min(...proof.map(([x, , z]) => reachMargin(x, z, A)))),
    box: { ...fp, h: r4(pivot + top) }, control, proof,
  };
}

/** The frame of a seating block: `s` runs along its rows (a world coordinate), `p` is the distance behind the island's
 * edge. `at(s, p)` -> [x, z]; `of(x, z)` -> [s, p]; `ends` = the hall sides of its low-s and high-s ends; `mark` = the
 * cut side of what stands on it (layout.js SIDE). */
export function blockFrame(blk, A = ARENA) {
  const I = A.island;
  if (blk.side === 'north') return { side: 'north', mark: SIDE.north, at: (s, p) => [s, I.z0 - p], of: (x, z) => [x, I.z0 - z], ends: ['west', 'east'], rear: 'north' };
  if (blk.side === 'south') return { side: 'south', mark: SIDE.south, at: (s, p) => [s, I.z1 + p], of: (x, z) => [x, z - I.z1], ends: ['west', 'east'], rear: 'south' };
  if (blk.side === 'east') return { side: 'east', mark: SIDE.east, at: (s, p) => [I.x1 + p, s], of: (x, z) => [z, x - I.x1], ends: ['north', 'south'], rear: 'east' };
  return { side: 'west', mark: SIDE.west, at: (s, p) => [I.x0 - p, s], of: (x, z) => [z, I.x0 - x], ends: ['north', 'south'], rear: 'west' };
}

/** The middles of a block's seats along its rows (world coordinate along the row): the surround's own arithmetic (the
 * seats of each half are centred in it; arena/surround/plan.js planSeating: the arm compares the two). */
export function seatCentres(blk, A = ARENA) {
  const s = A.seating, aw = s.aisleWidth / 2, lo = Math.min(blk.from, blk.to), hi = Math.max(blk.from, blk.to), out = [];
  for (const [p, q] of [[lo, blk.aisleAt - aw], [blk.aisleAt + aw, hi]]) {
    if (!(q - p > s.seatPitch)) continue;
    const n = Math.floor((q - p - 2 * TOWER.endMargin) / s.seatPitch + 1e-6), first = (p + q) / 2 - ((n - 1) * s.seatPitch) / 2;
    for (let i = 0; i < n; i++) out.push(r4(first + i * s.seatPitch));
  }
  return out;
}

const OUT = Object.freeze({ east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] });

/**
 * A scaffold platform on a seating block (the layout's `platform.on`): the deck over a few folded seats, four standards
 * on base plates on the rows' walkways at seat centres, the rows its black skirt ends on, the open end toward the stair
 * aisle, where the camera's cable leaves the deck and meets the row. `why` (null when lawful) says what fails: the deck
 * off the block or over the aisle, its underside not clear of a seat under it, a standard with no walkway to stand on.
 * Local points are offsets from the deck's centre; heights are above the floor.
 */
export function planTower(c, A = ARENA) {
  const P = c.platform, S = A.seating, blk = (S?.blocks ?? []).find((b) => b.id === P.on) ?? null;
  const hw = P.w / 2, hd = P.d / 2;
  const box = { x0: r4(c.x - hw), x1: r4(c.x + hw), z0: r4(c.z - hd), z1: r4(c.z + hd), h: r4(P.h + TOWER.rail + 0.03) };
  const out = { id: c.id, kind: 'platform', zone: 'stand', block: P.on, side: 0, x: c.x, z: c.z, ry: 0, w: P.w, d: P.d, h: P.h, open: 'north', cableSide: null,
    exit: null, land: null, landH: 0, lead: null, tape: null, legs: [], steps: [], cover: null, rows: [], box, why: null };
  if (!blk) { out.why = `the layout has no seating block called ${P.on}`; return out; }
  const f = blockFrame(blk, A), rows = seatingRows(S);
  const [sa, pa] = f.of(box.x0, box.z0), [sb, pb] = f.of(box.x1, box.z1);
  const s0 = Math.min(sa, sb), s1 = Math.max(sa, sb), p0 = Math.min(pa, pb), p1 = Math.max(pa, pb);
  const rowAt = (p) => rows[Math.min(rows.length - 1, Math.max(0, Math.floor((p - S.front) / S.tread + 1e-9)))];
  const why = [];
  const lo = Math.min(blk.from, blk.to), hi = Math.max(blk.from, blk.to), aw = S.aisleWidth / 2;
  if (s0 < lo + 0.04 || s1 > hi - 0.04 || p0 < S.front || p1 > S.front + S.rows * S.tread) why.push('its deck leaves the block');
  if (s0 < blk.aisleAt + aw + 0.04 && s1 > blk.aisleAt - aw - 0.04) why.push('its deck stands over the stair aisle');
  // the deck's underside over every seat under it
  const under = P.h - TOWER.under - TOWER.clear;
  for (const r of rows) for (const z of TOWER.zones) {
    if (r.offset + z.to <= p0 || r.offset + z.from >= p1) continue;
    out.rows.push({ row: r.row, what: z.what, top: r4(r.h + z.top) });
    if (r.h + z.top > under) why.push(`its underside (${r4(P.h - TOWER.under)} m) does not clear the ${z.what} of row ${r.row} (${r4(r.h + z.top)} m)`);
  }
  // the standards: along the rows at two seat centres (a standard there passes in front of a folded pan, between two arm
  // rests), across them on the walkway of the row under the deck's front edge and of the row under its rear edge
  const centres = seatCentres(blk, A).filter((q) => q >= s0 + 0.1 && q <= s1 - 0.1);
  const near = (s) => [...centres].sort((a, b) => Math.abs(a - s) - Math.abs(b - s))[0];
  const along = [near(s0 + TOWER.end), near(s1 - TOWER.end)];
  if (along[0] === undefined || along[1] === undefined || along[1] - along[0] < 0.5) { why.push('no two seat centres under its deck for the standards'); along[0] = s0 + TOWER.end; along[1] = s1 - TOWER.end; }
  const depth = [p0 + TOWER.edge, p1 - TOWER.edge].map((p) => { const r = rowAt(p); return { r, p: r4(r.offset + Math.min(TOWER.walk[1], Math.max(TOWER.walk[0], p - r.offset))) }; });
  for (const d of depth) if (d.p < p0 + 0.03 || d.p > p1 - 0.03) why.push(`a standard cannot stand on row ${d.r.row}'s walkway under the deck`);
  if (depth[1].p - depth[0].p < 0.5) why.push('its standards stand less than 0.5 m apart');
  const local = (s, p) => { const [x, z] = f.at(s, p); return [r4(x - c.x), r4(z - c.z)]; };
  for (const [i, s] of along.entries()) for (const [j, d] of depth.entries()) { const [x, z] = local(s, d.p); out.legs.push({ end: i, line: j, x, z, base: r4(d.r.h), row: d.r.row }); }
  // the rows under the deck, from its front edge to its rear edge (`from`, `to`: metres behind the front edge; `h`: the
  // row's deck): the black skirt that hangs from the deck's edge ends on them
  for (const r of rows) { const a = Math.max(p0, r.offset), b = Math.min(p1, r.offset + S.tread); if (b - a > 1e-6) out.steps.push({ from: r4(a - p0), to: r4(b - p0), h: r4(r.h), row: r.row }); }
  // the open end (no guard rail; the skirt is slit there: the way up): the end toward the stair aisle
  const mid = (s0 + s1) / 2, openEnd = mid >= blk.aisleAt ? 0 : 1;
  out.open = f.ends[openEnd]; out.openEnd = openEnd; out.side = f.mark; out.rear = f.rear;
  // the cable: from beside the pedestal over the open end's edge, a hand behind the front edge of the rear-most row
  // under the deck (that row's walkway: no seat part stands there), down the skirt's face to the row and under its hem
  const back = out.steps[out.steps.length - 1] ?? { from: 0, h: 0 }, [ox, oz] = OUT[out.open];
  const exit = local(openEnd ? s1 : s0, p0 + Math.min(p1 - p0 - 0.1, back.from + TOWER.slit));
  const el = Math.hypot(exit[0], exit[1]) || 1, k = (CAM.skirtR + 0.05) / el;
  out.exit = exit; out.lead = [r4(exit[0] * k), r4(exit[1] * k)]; out.cableSide = out.open;
  out.land = [r4(exit[0] + ox * TOWER.hang), r4(exit[1] + oz * TOWER.hang)]; out.landH = back.h;
  // a folded rain cover lies on the deck in the rear corner away from the open end
  const [fx, fz] = OUT[f.rear];
  out.cover = { x: r4(-ox * (hw - 0.27) + fx * (hw - 0.2)), z: r4(-oz * (hd - 0.27) + fz * (hd - 0.2)), ry: r4((ox ? 0 : Math.PI / 2) + 0.1) };
  out.why = why.length ? why.join('; ') : null;
  return out;
}

/**
 * The platform under a camera: the deck from the layout's entry, its step-up side (where the cable's path leaves the deck;
 * without a path, the side away from what the camera looks at), where the cable crosses the deck's edge and where it
 * lands on the carpet. Local points are offsets from the deck's centre (the platform is square to the hall). An entry
 * with `platform.on` is a scaffold platform on a seating block (planTower).
 */
export function planPlatform(c, run = null, A = ARENA) {
  if (c.platform?.on) return planTower(c, A);
  const P = c.platform, hw = P.w / 2, hd = P.d / 2;
  const box = { x0: r4(c.x - hw), x1: r4(c.x + hw), z0: r4(c.z - hd), z1: r4(c.z + hd), h: r4(P.h + PLATFORM.kick) };
  const inside = (p) => p[0] > box.x0 && p[0] < box.x1 && p[1] > box.z0 && p[1] < box.z1;
  const OUT = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };
  // `side` = where the cable's path leaves the deck (the cable drops there)
  let side = null, exit = null, tape = null;
  const path = run?.path ?? [];
  for (let i = 0; i + 1 < path.length && !side; i++) {
    const a = path[i], b = path[i + 1];
    if (!inside(a) || inside(b)) continue;
    let t = Infinity;
    const hit = (s, v) => { if (v > 0 && v <= 1 && v < t) { t = v; side = s; } };
    if (b[0] > box.x1) hit('east', (box.x1 - a[0]) / (b[0] - a[0]));
    if (b[0] < box.x0) hit('west', (box.x0 - a[0]) / (b[0] - a[0]));
    if (b[1] > box.z1) hit('south', (box.z1 - a[1]) / (b[1] - a[1]));
    if (b[1] < box.z0) hit('north', (box.z0 - a[1]) / (b[1] - a[1]));
    if (!side) continue;
    exit = [r4(a[0] + (b[0] - a[0]) * t), r4(a[1] + (b[1] - a[1]) * t)];
    const land = [r4(exit[0] + OUT[side][0] * PLATFORM.land), r4(exit[1] + OUT[side][1] * PLATFORM.land)];
    // the tape starts where the cable lands; the path's corner beyond it is kept unless the cable lands past it
    const rest = path.slice(i + 1).map((p) => [p[0], p[1]]);
    const past = (rest[0][0] - land[0]) * OUT[side][0] + (rest[0][1] - land[1]) * OUT[side][1];
    tape = past > 0.02 ? [land, ...rest] : [land, ...rest.slice(1)];
  }
  // The step-up side (no kick rail, the nosing): a side with room to step up from (no seating block within STEP_ROOM of
  // the edge, the hall's wall farther than that). The cable's side when it is such a side; else, of the free sides, the
  // one that looks most toward what the camera looks at (the cable then climbs over the kick rail of its own side).
  const blocks = (A.seating?.blocks ?? []).map((b) => blockFootprint(b, A)), H = A.hall;
  const free = (s) => {
    const [ox, oz] = OUT[s];
    const strip = { x0: ox > 0 ? box.x1 : ox < 0 ? box.x0 - STEP_ROOM : box.x0, x1: ox > 0 ? box.x1 + STEP_ROOM : ox < 0 ? box.x0 : box.x1, z0: oz > 0 ? box.z1 : oz < 0 ? box.z0 - STEP_ROOM : box.z0, z1: oz > 0 ? box.z1 + STEP_ROOM : oz < 0 ? box.z0 : box.z1 };
    return !blocks.some((f) => overlap(strip, f)) && strip.x0 >= H.x0 + 0.4 && strip.x1 <= H.x1 - 0.4 && strip.z0 >= H.z0 + 0.4 && strip.z1 <= H.z1 - 0.4;
  };
  const dx = c.lookAt[0] - c.x, dz = c.lookAt[1] - c.z, dl = Math.hypot(dx, dz) || 1;
  const toward = (s) => (OUT[s][0] * dx + OUT[s][1] * dz) / dl;
  let open = side && free(side) ? side : null;
  if (!open && side) open = Object.keys(OUT).filter((s) => s !== side && free(s)).sort((a, b) => toward(b) - toward(a))[0] ?? side;
  // (no cable: the side away from what the camera looks at)
  if (!open) open = Math.abs(dx) >= Math.abs(dz) ? (dx < 0 ? 'east' : 'west') : (dz < 0 ? 'south' : 'north');
  const local = (p) => [r4(p[0] - c.x), r4(p[1] - c.z)];
  let lead = null;
  if (exit) { const e = local(exit), l = Math.hypot(e[0], e[1]) || 1, k = (CAM.skirtR + 0.05) / l; lead = [r4(e[0] * k), r4(e[1] * k)]; }
  // a folded rain cover lies on the deck in the corner farthest from what the camera looks at
  const far = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [sx * (hw - 0.3), sz * (hd - 0.3)])
    .sort((a, b) => Math.hypot(b[0] - dx, b[1] - dz) - Math.hypot(a[0] - dx, a[1] - dz))[0];
  return {
    id: c.id, kind: 'platform', zone: 'hall', block: null, side: 0, x: c.x, z: c.z, ry: 0, w: P.w, d: P.d, h: P.h, open, cableSide: side,
    exit: exit ? local(exit) : null, land: exit ? local(tape[0]) : null, lead, tape: tape && tape.length >= 2 ? tape : null,
    legs: null, steps: null, cover: { x: r4(far[0]), z: r4(far[1]), ry: 0.1 }, why: null, box,
  };
}
// the room a step-up side needs beyond the deck's edge
const STEP_ROOM = 0.6;

/** The folding stool on a platform: on the deck beside the pedestal, at the side corner next to the step-up. */
export function planStool(plat, cam, lookAt = [0, 0]) {
  const k = PLATFORM.stoolIn;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ sx, sz, x: r4(plat.x + sx * (plat.w / 2 - k)), z: r4(plat.z + sz * (plat.d / 2 - k)) }))
    .sort((a, b) => Math.hypot(a.x - lookAt[0], a.z - lookAt[1]) - Math.hypot(b.x - lookAt[0], b.z - lookAt[1]));
  // neither in front of the lens nor behind the bars: one of the two side corners, the one on the step-up side
  const side = [corners[1], corners[2]];
  const onOpen = (q) => (plat.open === 'east' && q.sx > 0) || (plat.open === 'west' && q.sx < 0) || (plat.open === 'south' && q.sz > 0) || (plat.open === 'north' && q.sz < 0);
  const at = side.find(onOpen) ?? side[0];
  const half = Math.hypot(STOOL.w, 2 * STOOL.spread + 0.04) / 2;
  if (Math.hypot(at.x - cam.x, at.z - cam.z) < CAM.skirtR + half + 0.05) return null;   // (a deck too small for both)
  return {
    id: plat.id, kind: 'stool', zone: 'hall', on: `platform.${plat.id}`, x: at.x, z: at.z, ry: r4(cam.ry + 0.5), base: plat.h,
    box: { x0: r4(at.x - half), x1: r4(at.x + half), z0: r4(at.z - half), z1: r4(at.z + half), h: r4(plat.h + STOOL.h) },
  };
}

/** A chair: it looks along the nearest axis toward the table, turned by at most CHAIR.turn toward the table's centre.
 * `askew` (round A5, the dress): a further turn of that one chair, as somebody left it (the two chairs are not a mirror pair). */
export function planChair(c, askew = 0) {
  const a = Math.atan2(-c.z, -c.x);                          // the bearing of the table's centre, in (x, z)
  const b = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  const f = b + Math.max(-CHAIR.turn, Math.min(CHAIR.turn, a - b));
  const ry = Math.atan2(Math.cos(f), Math.sin(f)) + askew;
  return { id: c.id, kind: 'chair', x: c.x, z: c.z, ry: r4(ry), box: { ...rectBox(c.x, c.z, ry, CHAIR.w / 2, CHAIR.d / 2, CHAIR.d / 2 + 0.05), h: CHAIR.h } };
}

/**
 * ROUND A5: the one LOW camera of the layout's `floor.lowCamera` ({ id, x, z, lookAt, top }): its frame, its footprint,
 * the points its place is proven on, and whether it stands (`standing`; `why` says what fails). The law is the layout's
 * exact test, as for every camera: no point of it, nor a point `keepOut.clearance` beside or over one, is inside the
 * volume the app's camera can reach. Here that is the room UNDER the cone (the place is inside the plan reach); the
 * layout's `top` is the height the entry grants, and the camera's own height (REMOTE.top) may not pass it.
 */
export function planRemote(c, A = ARENA) {
  const R = REMOTE, ry = Math.atan2(c.lookAt[0] - c.x, c.lookAt[1] - c.z), granted = Number.isFinite(c.top) ? c.top : 0;
  const control = [];
  for (const hh of [R.postTop, R.axis, R.top]) for (const [u, v] of [[-R.reach.hw, -R.reach.back], [R.reach.hw, -R.reach.back], [-R.reach.hw, R.reach.front], [R.reach.hw, R.reach.front]]) {
    const [x, z] = toRoom(c.x, c.z, ry, u, v);
    control.push([r4(x), hh, r4(z)]);
  }
  // the proof: the camera's box at three heights, the top over the post, the base plate's rim
  const proof = [...control, [c.x, R.top, c.z]];
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; proof.push([r4(c.x + Math.cos(a) * R.base), 0.06, r4(c.z + Math.sin(a) * R.base)]); }
  let why = null;
  if (!(R.top <= granted)) why = `it is ${R.top} m tall and its layout entry grants ${granted} m`;
  else {
    const bad = proof.find(([x, hh, z]) => !clearOfCamera(x, hh, z, A));
    if (bad) why = `a point of it at ${bad[1]} m over the floor (${bad[0]}, ${bad[2]}) is inside the volume the app's camera can reach (the cone's underside is ${r4(cameraFloor(bad[0], bad[2], A))} m there)`;
  }
  // (the base plate's square with a pad of 5 mm: the shell's arm wants every standing box 1.5 cm clear of its edging profile)
  const fp = union([rectBox(c.x, c.z, ry, R.reach.hw, R.reach.front, R.reach.back), { x0: r4(c.x - R.base - 0.005), x1: r4(c.x + R.base + 0.005), z0: r4(c.z - R.base - 0.005), z1: r4(c.z + R.base + 0.005) }]);
  // the nearest board: its cable goes there (`out`: that direction in the camera's own frame, x right, z front)
  const I = A.island, near = [['east', I.x1 - c.x, [1, 0]], ['west', c.x - I.x0, [-1, 0]], ['south', I.z1 - c.z, [0, 1]], ['north', c.z - I.z0, [0, -1]]].sort((p, q) => p[1] - q[1])[0];
  const f = facing(ry), out = [r4(near[2][0] * f.rx + near[2][1] * f.rz), r4(near[2][0] * f.fx + near[2][1] * f.fz)];
  return { id: c.id, kind: 'remote', x: c.x, z: c.z, ry: r4(ry), tilt: R.tilt, top: R.top, granted, lensH: R.axis, standing: !why, why,
    board: near[0], boardDist: r4(near[1]), toBoard: near[2], out, box: { ...fp, h: R.top }, control, proof };
}

/** ROUND A5: the floor monitor: at the boards of the end where the chairs stand, on the other side of the table's axis
 * from the low camera, turned to the table's centre. */
export function planMonitor(A = ARENA, chairs = [], remote = null) {
  if (!chairs.length) return null;
  const I = A.island, M = MONITOR, east = chairs.reduce((s, c) => s + c.x, 0) >= 0;
  const x = r4(east ? I.x1 - BOARD_CLEAR - M.back - 0.03 : I.x0 + BOARD_CLEAR + M.back + 0.03), z = r4(-Math.sign(remote?.z || 1) * M.off);
  const ry = Math.atan2(-x, -z);
  return { id: 'm', kind: 'monitor', x, z, ry: r4(ry), box: { ...rectBox(x, z, ry, M.w / 2 + 0.005, M.front, M.back), h: M.top } };
}

/** ROUND A5: the second floor monitor (id 'w'): at the boards of the desk's long side, `MONITOR.far` beyond the waste bin
 * from the desk (the officials' corner: desk, bin, monitor), turned to the table's centre, its box two centimetres clear
 * of the edging's line. Its cable goes straight back under the edging: `lead` = where it ends, in the monitor's own
 * frame; no taped run. In the desk's mesh group: no draw call of its own. */
export function planMonitorFar(A = ARENA, desk = null, bin = null) {
  if (!desk || !bin || Math.abs(Math.sin(desk.ry)) > 0.01) return null;
  const I = A.island, M = MONITOR, zs = Math.sign(desk.z) || -1, x = r4(bin.x + (Math.sign(bin.x - desk.x) || -1) * M.far);
  const edge = (zs < 0 ? -I.z0 : I.z1) - BOARD_CLEAR - 0.02;
  // (turned to the centre from where it would stand square; then set off the boards by what the turned box takes)
  const ry = Math.atan2(-x, -zs * (edge - M.back)), cs = Math.cos(ry), sn = Math.sin(ry), hw = M.w / 2 + 0.005;
  const z = r4(zs * (edge - (M.back * Math.abs(cs) + hw * Math.abs(sn))));
  const box = rectBox(x, z, ry, hw, M.front, M.back);
  const dx = 0.02, dz = (zs < 0 ? box.z0 + 0.012 : box.z1 - 0.012) - z;
  return { id: 'w', kind: 'monitor', x, z, ry: r4(ry), box: { ...box, h: M.top }, lead: [r4(dx * cs - dz * sn), r4(dx * sn + dz * cs)] };
}

/** ROUND A5: the waste bin: on the carpet at the desk's end away from the leaning rest, a little toward the table. */
export function planBin(desk) {
  const skirt = Math.max(DESK.flare + DESK.fold, (DESK.flare + DESK.corner) * Math.SQRT1_2) + DESK.hem;
  const [x, z] = toRoom(desk.x, desk.z, desk.ry, -desk.rest.end * (DESK.w / 2 + skirt + BIN.gap + BIN.r), 0.05);
  return { id: 'b', kind: 'bin', x: r4(x), z: r4(z), ry: 0.3, box: { x0: r4(x - BIN.r - 0.006), x1: r4(x + BIN.r + 0.006), z0: r4(z - BIN.r - 0.006), z1: r4(z + BIN.r + 0.006), h: r4(BIN.h + 0.012) } };
}

/** ROUND A5: an empty cue stand beyond a side table from its chair (the two stands a little unlike: `i`). */
export function planCueStand(st, ch, i = 0) {
  const dx = st.x - ch.x, dz = st.z - ch.z, l = Math.hypot(dx, dz) || 1, k = SIDE_TABLE.r + CUE_STAND.gap + CUE_STAND.base + 0.02 * i, s = i ? -0.07 : -0.06;
  const x = r4(st.x + (dx / l) * k - (dz / l) * s), z = r4(st.z + (dz / l) * k + (dx / l) * s), r = CUE_STAND.base + 0.004;
  return { id: st.id, kind: 'cueStand', x, z, ry: r4(0.5 + i * 1.3), box: { x0: r4(x - r), x1: r4(x + r), z0: r4(z - r), z1: r4(z + r), h: CUE_STAND.h } };
}

// ---- ROUND A6: the plans of the round's set (FLOOR_A6_DEFAULT) ---------------------------------------------------------

/**
 * ROUND A6: a work lamp at a camera platform. `e` = the layout's entry { id, x, z, h, aim: [x, z, h] }: the place of the
 * lit opening (h over the FLOOR; the light role's bake has its emitter there) and the point it is aimed at. The fixture
 * is built to that place: the can's lit end ON it, its axis toward the aim; the mast on the guard rail's corner post
 * nearest the can (a platform on a seating block) or on a flange on the deck under the can (a riser). `why` (null when
 * lawful) says what does not fit: the opening too far from a post, off the deck, in the pedestal, not at mast height.
 * Local points are offsets from the mast's foot on the deck.
 */
export function planWorkLight(e, plat, cam) {
  const W = WORK_LIGHT, lit = [e.x, e.h, e.z], aim = [e.aim[0], e.aim[2], e.aim[1]];
  const d = [aim[0] - lit[0], aim[1] - lit[1], aim[2] - lit[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1, dir = d.map((v) => v / dl);
  const mid = lit.map((v, i) => v - dir[i] * (W.canLen / 2)), why = [];
  let mx = mid[0], mz = mid[2], mount = 'flange';
  if (plat.zone === 'stand') {
    const cx = plat.w / 2 - 0.035, cz = plat.d / 2 - 0.035;
    [mx, mz] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [plat.x + sx * cx, plat.z + sz * cz]).sort((p, q) => Math.hypot(p[0] - mid[0], p[1] - mid[2]) - Math.hypot(q[0] - mid[0], q[1] - mid[2]))[0];
    mount = 'rail';
  } else {
    const k = W.flange / 2 + 0.035;
    if (!(mx - k >= plat.box.x0 && mx + k <= plat.box.x1 && mz - k >= plat.box.z0 && mz + k <= plat.box.z1)) why.push('its mast stands off the deck');
    if (Math.hypot(mx - cam.x, mz - cam.z) < CAM.skirtR + 0.12) why.push('its mast stands in the pedestal');
  }
  const off = Math.hypot(mid[0] - mx, mid[2] - mz), over = r4(e.h - plat.h);
  if (off > W.reach) why.push(`its lit opening is ${r4(off)} m from the nearest post`);
  if (!(over >= 1.6 && over <= W.over + 0.02)) why.push(`its lit opening is ${over} m over the deck (a mast carries it at ${W.over} m)`);
  if (!(dl > 0.5 && dl < 2.5 && dir[1] < 0)) why.push('it is not tipped down at something near it');
  const back = lit.map((v, i) => v - dir[i] * W.canLen);
  const fp = boxOf([[mx, mz], [lit[0], lit[2]], [back[0], back[2]]], Math.max(W.can + 0.012, mount === 'flange' ? W.flange / 2 + 0.005 : 0));
  return { id: e.id, kind: 'workLight', zone: plat.zone, block: plat.block ?? null, on: `platform.${plat.id}`, side: plat.side ?? 0, x: r4(mx), z: r4(mz), ry: 0, base: plat.h, mount, over,
    lit: [r4(lit[0] - mx), over, r4(lit[2] - mz)], dir: dir.map(r4), place: lit.map(r4), box: { ...fp, h: r4(plat.h + W.top) }, why: why.length ? why.join('; ') : null };
}

/** ROUND A6: the flight case: at the boards of the end away from the chairs, just beyond the stroke room's edge on the
 * desk's side (so it joins that side's mesh group), a long side to the boards, a little askew. */
export function planRoadCase(A = ARENA, stroke, chairs = [], desk = null) {
  if (!desk) return null;
  const I = A.island, C = ROAD_CASE, west = chairs.reduce((s, c) => s + c.x, 0) >= 0, zs = Math.sign(desk.z) || -1;
  const reach = (C.w / 2) * Math.abs(Math.cos(C.turn)) + (C.d / 2) * Math.abs(Math.sin(C.turn)), deep = (C.d / 2) * Math.abs(Math.cos(C.turn)) + (C.w / 2) * Math.abs(Math.sin(C.turn));
  const x = r4(west ? I.x0 + BOARD_CLEAR + deep + 0.03 : I.x1 - BOARD_CLEAR - deep - 0.03);
  const z = r4(zs < 0 ? stroke.z0 - C.clear - reach : stroke.z1 + C.clear + reach);
  // (its front, a long side, looks along the hall's long axis toward the table)
  const ry = (west ? Math.PI / 2 : -Math.PI / 2) + C.turn;
  return { id: 'c', kind: 'roadCase', x, z, ry: r4(ry), box: { ...rectBox(x, z, ry, C.w / 2 + 0.006, C.d / 2 + 0.006, C.d / 2 + 0.006), h: C.top } };
}

/** ROUND A6: the cart: at the desk's boards, `TROLLEY.off` beyond the far monitor from the desk (the officials' side
 * runs on toward the walk-in: desk, bin, monitor, cart), a little askew, its long side to the boards. */
export function planTrolley(A = ARENA, desk = null, far = null) {
  if (!desk || !far || Math.abs(Math.sin(desk.ry)) > 0.01) return null;
  const I = A.island, T = TROLLEY, zs = Math.sign(desk.z) || -1, sx = Math.sign(far.x - desk.x) || -1;
  const reach = (T.w / 2) * Math.abs(Math.cos(T.turn)) + (T.d / 2) * Math.abs(Math.sin(T.turn)), deep = (T.d / 2) * Math.abs(Math.cos(T.turn)) + (T.w / 2) * Math.abs(Math.sin(T.turn));
  const x = r4((sx < 0 ? far.box.x0 : far.box.x1) + sx * (T.off + reach));
  const z = r4(zs * ((zs < 0 ? -I.z0 : I.z1) - BOARD_CLEAR - deep - 0.03));
  const ry = (zs < 0 ? 0 : Math.PI) + T.turn;
  return { id: 't', kind: 'trolley', x, z, ry: r4(ry), box: { ...rectBox(x, z, ry, T.w / 2 + 0.006, T.d / 2 + 0.006, T.d / 2 + 0.006), h: T.top } };
}

/**
 * ROUND A6: the camera spots: a cross of pale tape on the carpet under each of the layout's review poses named in
 * `ids` that stands over the island outside the stroke room (a session's camera positions: the poses are such
 * positions). The first carries a coil of its cable beside the cross, toward the nearest board, and `run`: a taped
 * run that comes along that board's foot (inside the edging's line) and curves out to the coil.
 */
// (the order: V10's first. The pose BACK frames that place; the one under TV lies behind the table's head rail in
// every fixed pose, shots/floor/m2-CAM.jpg, so the coil and the run are at V10's)
export function planSpots(A = ARENA, views = VIEWS, stroke, width = 0.10, ids = ['V10', 'TV']) {
  const I = A.island, S = SPOT, out = [];
  for (const id of ids) {
    const v = (views ?? []).find((q) => q.id === id);
    if (!v) continue;
    const x = v.cam[0], z = v.cam[2], k = S.len / 2 + 0.02;
    if (!(x - k > I.x0 + BOARD_CLEAR && x + k < I.x1 - BOARD_CLEAR && z - k > I.z0 + BOARD_CLEAR && z + k < I.z1 - BOARD_CLEAR)) continue;
    if (x + k > stroke.x0 && x - k < stroke.x1 && z + k > stroke.z0 && z - k < stroke.z1) continue;
    const cross = { x0: r4(x - k), x1: r4(x + k), z0: r4(z - k), z1: r4(z + k), h: 0.004 };
    // (the item's frame stays square to the hall; `turn` = how the cross lies in it)
    const spot = { id: id.toLowerCase(), kind: 'spot', x: r4(x), z: r4(z), ry: 0, turn: r4(0.2 + out.length * 0.55), coil: null, run: null, box: cross, boxes: [{ tag: `cross.${id.toLowerCase()}`, ...cross }] };
    if (!out.length) {
      // the nearest board along x (the head or the foot end): the coil lies toward it, the run comes along its foot
      const sx = x < 0 ? -1 : 1, edge = (sx < 0 ? I.x0 + BOARD_CLEAR : I.x1 - BOARD_CLEAR) - sx * (width / 2 + 0.004);
      const cx = r4(x + sx * S.out), cz = r4(z + 0.03), r = S.coil + 0.012;
      if (Math.abs(edge - cx) > S.coil + 0.2) {
        spot.coil = [r4(cx - x), r4(cz - z)];
        spot.boxes.push({ tag: 'coil', x0: r4(cx - r), x1: r4(cx + r), z0: r4(cz - r), z1: r4(cz + r), h: r4(S.coilH + 0.005) });
        spot.box = { ...union(spot.boxes), h: r4(S.coilH + 0.005) };
        // (a quarter turn in three chords from the board's foot to the coil's rim; it comes from the desk's side)
        const ex = cx + sx * S.coil * 0.5, ez = cz - S.coil * 0.85, dx = ex - edge;
        spot.run = [[r4(edge), r4(cz - 1.9)], [r4(edge), r4(cz - 1.0)], [r4(edge + dx * 0.22), r4(cz - 0.6)], [r4(edge + dx * 0.6), r4(cz - 0.32)], [r4(ex), r4(ez)]];
      }
    }
    out.push(spot);
  }
  return out;
}

/** ROUND A7: the west corner: a low chair at the boards of the end AWAY from the players' chairs, turned toward the
 * table and then `askew` further (it does not stand square to the boards), and a small side table beside it on the
 * side away from the hall's long axis. null without players' chairs (the corner answers them). */
export function planWestCorner(A = ARENA, chairs = []) {
  if (!chairs.length) return null;
  const I = A.island, W = WEST_CORNER, sx = chairs.reduce((s, c) => s + c.x, 0) >= 0 ? -1 : 1;
  const x = r4(sx * ((sx < 0 ? -I.x0 : I.x1) - BOARD_CLEAR - W.in)), z = W.z;
  const chair = planChair({ id: 'w', x, z }, W.askew);
  const tx = r4(x + sx * W.table[0]), tz = r4(z + W.table[1]);
  const table = { id: 'w', kind: 'sideTable', x: tx, z: tz, ry: 1.7, box: { x0: r4(tx - SIDE_TABLE.r), x1: r4(tx + SIDE_TABLE.r), z0: r4(tz - SIDE_TABLE.r), z1: r4(tz + SIDE_TABLE.r), h: SIDE_TABLE.top } };
  return { chair, table };
}

/**
 * The whole plan for one detail level (0 lite, 1 base, 2 high). `tableBounds` = the room's keep-out rectangle (optional).
 * `opts.dress` (round A5; default FLOOR_DRESS_DEFAULT): the dress of the playing floor, on the base room and up.
 * Returns the items with their frames and boxes (x0, x1, z0, z1 in the room; h = top above the floor), each with the mesh
 * group it is merged into, and `problems`: what could not be placed (such an item is not built).
 */
export function planFloor(A = ARENA, detail = 1, tableBounds = null, opts = null) {
  const F = A.floor ?? {}, I = A.island, B = A.boards;
  const dress = (opts?.dress ?? FLOOR_DRESS_DEFAULT) === true && detail >= 1;
  // (round A6: the round's set. The work lamps stand wherever their cameras stand, on every tier; the rest of the set
  // is part of the dressed floor. `opts.workLights`: a tool's stand-in for the layout's `floor.workLights`)
  const a6 = (opts?.a6 ?? FLOOR_A6_DEFAULT) === true, set6 = a6 && dress;
  // (round A7: the round's geometry, on the floor that carries round A6's set: the base room and up)
  const a7 = (opts?.a7 ?? FLOOR_A7_DEFAULT) === true, set7 = a7 && set6;
  const stroke = strokeRect(A, tableBounds);
  const problems = [];
  const items = [];
  const add = (it) => {
    it.group = groupOf(it.box, stroke);
    if (!it.group) { problems.push(`${it.kind}.${it.id}: its footprint reaches into the stroke room`); return null; }
    items.push(it);
    return it;
  };

  // ---- cameras on their platforms; a riser on the hall's floor also carries a stool
  // TIER LINE (owner: floor): the lite room keeps the first camera (no stool), the base room the first two, the high room all
  // (the layout's order is the order of what a frame needs: the platform V10 frames, then the riser the break view frames)
  const all = F.cameras ?? [];
  const cameras = [], platforms = [], stools = [];
  // where a camera's own cable meets the deck and which way it runs on from there, in the camera's frame (x right, z front)
  const leadOf = (cam, plat) => {
    const f = facing(cam.ry), local = (dx, dz) => [r4(dx * f.rx + dz * f.rz), r4(dx * f.fx + dz * f.fz)];
    const dl = Math.hypot(plat.exit[0] - plat.lead[0], plat.exit[1] - plat.lead[1]) || 1;
    cam.lead = local(plat.lead[0], plat.lead[1]);
    cam.leadDir = local((plat.exit[0] - plat.lead[0]) / dl, (plat.exit[1] - plat.lead[1]) / dl);
  };
  // (round A5, TIER LINE: a DRESSED base room keeps the first camera alone; the remote camera on the playing floor takes
  // the second one's triangles and its place in the break view)
  for (const [i, c] of all.entries()) {
    if (i >= (detail >= 2 ? all.length : detail === 1 ? (dress ? 1 : 2) : 1)) break;
    const cam = planCamera(c, A, i);
    if (!cam.standing) { problems.push(`camera.${c.id}: ${cam.why}`); continue; }
    const plat = planPlatform(c, (F.cables ?? []).find((r) => r.id === c.id) ?? null, A);
    if (plat.why) { problems.push(`platform.${c.id}: ${plat.why}`); continue; }
    const g = groupOf(plat.box, stroke, HALL_ORDER);
    if (!g) { problems.push(`platform.${c.id}: its footprint reaches into the stroke room`); continue; }
    plat.group = g; cam.group = g; cam.side = plat.side;
    items.push(plat, cam); platforms.push(plat); cameras.push(cam);
    // (a platform on a seating block: the cable goes down a standard: no run on the floor; the lite room has no cable)
    if (plat.zone === 'stand') { if (detail >= 1) leadOf(cam, plat); else { plat.exit = null; plat.lead = null; plat.land = null; } continue; }
    const st = detail >= 1 ? planStool(plat, cam, c.lookAt) : null;
    if (st) { st.group = g; st.side = 0; items.push(st); stools.push(st); }
  }
  // ---- ROUND A6: a work lamp at each camera platform that stands and has an entry (a lamp that does not fit is named
  // in `problems` and not built; its camera stands without it)
  const workLights = [];
  if (a6) {
    const list = Array.isArray(F.workLights) ? F.workLights : Array.isArray(opts?.workLights) ? opts.workLights : [];
    for (const e of list) {
      const plat = platforms.find((p) => p.id === e?.id), cam = cameras.find((c) => c.id === e?.id);
      if (!plat || !cam || ![e.x, e.z, e.h, e.aim?.[0], e.aim?.[1], e.aim?.[2]].every(Number.isFinite)) continue;
      const wl = planWorkLight(e, plat, cam);
      if (wl.why) { problems.push(`workLight.${wl.id}: ${wl.why}`); continue; }
      wl.group = plat.group;
      items.push(wl); workLights.push(wl);
    }
  }

  // ---- chairs and their side tables
  const chairs = [];
  // (round A5, the dress: the second chair stands a little askew)
  // (round A6: the first one too, the other way: neither stands square to the boards)
  for (const [i, c] of (F.chairs ?? []).entries()) { const ch = add(planChair(c, dress && i === 1 ? 0.13 : set6 && i === 0 ? CHAIR_ASKEW_A6 : 0)); if (ch) chairs.push(ch); }
  const sideTables = [];
  for (const [i, c] of (F.chairs ?? []).entries()) {
    // the layout's place; without one, 0.7 m beside the chair on the side of the table's centre line
    const at = (F.sideTables ?? []).find((s) => s.id === c.id) ?? (F.sideTables ?? [])[i] ?? { id: c.id, x: c.x, z: c.z - Math.sign(c.z || 1) * 0.7 };
    const st = add({ id: at.id ?? c.id, kind: 'sideTable', x: at.x, z: at.z, ry: r4(0.4 + i * 2.1), box: { x0: r4(at.x - SIDE_TABLE.r), x1: r4(at.x + SIDE_TABLE.r), z0: r4(at.z - SIDE_TABLE.r), z1: r4(at.z + SIDE_TABLE.r), h: SIDE_TABLE.top } });
    if (st) sideTables.push(st);
  }

  // ---- the desk by the boards, with the rest on its end (the base room and up)
  let desk = null;
  if (F.refereeTable && detail >= 1) {
    const t = F.refereeTable;
    // it stands square to the nearest board and looks at the table
    const ry = Math.abs(t.z) / I.z1 >= Math.abs(t.x) / I.x1 ? (t.z < 0 ? 0 : Math.PI) : (t.x < 0 ? Math.PI / 2 : -Math.PI / 2);
    // the rest leans on the desk's end that is away from the nearest walk-in (nobody walks into it)
    const gap = (B.gaps ?? []).map((g) => (g.side === 'north' || g.side === 'south' ? { x: (g.from + g.to) / 2, z: g.side === 'north' ? I.z0 : I.z1 } : { x: g.side === 'east' ? I.x1 : I.x0, z: (g.from + g.to) / 2 }))
      .reduce((m, g) => (Math.hypot(g.x - t.x, g.z - t.z) < m.d ? { d: Math.hypot(g.x - t.x, g.z - t.z), g } : m), { d: Infinity, g: null }).g;
    const [nx] = gap ? [(gap.x - t.x) * Math.cos(ry) - (gap.z - t.z) * Math.sin(ry)] : [-1];
    const end = nx > 0 ? -1 : 1;
    // (the cloth's footprint: the flare, the folds, the corner folds along the diagonal, the hem lying on the carpet)
    const skirt = Math.max(DESK.flare + DESK.fold, (DESK.flare + DESK.corner) * Math.SQRT1_2) + DESK.hem;
    const hw = DESK.w / 2 + skirt, hd = DESK.d / 2 + skirt;
    const run = DESK.h / Math.tan(REST.lean);
    const butt = end * (DESK.w / 2 + 0.008 + run), tip = end * (DESK.w / 2 + 0.008 - REST.over * Math.cos(REST.lean));
    const tipH = DESK.h + 0.006 + REST.over * Math.sin(REST.lean);
    // two boxes: the desk with what lies on it, and the thin slab of air the leaning rest takes
    const own = { ...boxOf([toRoom(t.x, t.z, ry, -hw, hd), toRoom(t.x, t.z, ry, hw, hd), toRoom(t.x, t.z, ry, -hw, -hd), toRoom(t.x, t.z, ry, hw, -hd)]), h: DESK.top };
    const lean = { ...boxOf([toRoom(t.x, t.z, ry, butt + end * 0.03, REST.behind - 0.07), toRoom(t.x, t.z, ry, butt + end * 0.03, REST.behind + 0.07), toRoom(t.x, t.z, ry, tip - end * 0.03, REST.behind - 0.07), toRoom(t.x, t.z, ry, tip - end * 0.03, REST.behind + 0.07)]), h: r4(tipH + 0.05) };
    desk = add({ id: 'desk', kind: 'desk', x: t.x, z: t.z, ry: r4(ry), box: { ...union([own, lean]), h: lean.h }, boxes: [{ tag: 'desk', ...own }, { tag: 'rest', ...lean }],
      rest: { end, butt: r4(butt), tip: r4(tip), tipH: r4(tipH), z: REST.behind } });
  }

  // ---- ROUND A5: the dress of the playing floor (the base room and up, behind the `dress` switch)
  const D = { on: dress, remote: null, monitor: null, monitors: [], bin: null, cueStands: [] };
  if (dress) {
    if (F.lowCamera) {
      const r = planRemote(F.lowCamera, A);
      if (!r.standing) problems.push(`remote.${r.id}: ${r.why}`);
      else if (add(r)) D.remote = r;
    }
    const m = planMonitor(A, chairs, D.remote);
    if (m && add(m)) { D.monitor = m; D.monitors.push(m); }
    if (desk) { const b = add(planBin(desk)); if (b) D.bin = b; }
    // (the second monitor, in the officials' corner: only with the first, the desk and the bin)
    const m2 = D.monitor && D.bin ? planMonitorFar(A, desk, D.bin) : null;
    if (m2 && add(m2)) D.monitors.push(m2);
    for (const [i, st] of sideTables.entries()) {
      const ch = chairs.find((q) => q.id === st.id) ?? chairs[i];
      const cs = ch ? add(planCueStand(st, ch, i)) : null;
      if (cs) D.cueStands.push(cs);
    }
  }
  // ---- ROUND A6: the rest of the round's set, on the dressed floor (the base room and up)
  const S6 = { on: a6, floor: set6, lamps: workLights, roadCase: null, trolley: null, spots: [] };
  if (set6) {
    // (in the mesh group of the desk's side: that group has its overlays already, so neither brings a draw call)
    const deskSide = desk ? [desk.group, 'north', 'south', 'east', 'west'] : GROUP_ORDER;
    const addTo = (it, order) => { if (!it) return null; it.group = groupOf(it.box, stroke, order); if (!it.group) { problems.push(`${it.kind}.${it.id}: its footprint reaches into the stroke room`); return null; } items.push(it); return it; };
    S6.roadCase = addTo(planRoadCase(A, stroke, chairs, desk), deskSide);
    S6.trolley = addTo(planTrolley(A, desk, D.monitors[1] ?? null), deskSide);
    // (round A7: no camera spot is planned: the crosses, the coil and its run are gone)
    if (!set7) for (const sp of planSpots(A, opts?.views ?? VIEWS, stroke, Number.isFinite(F.cableWidth) ? F.cableWidth : 0.10)) { const s = add(sp); if (s) S6.spots.push(s); }
    if (D.remote) D.remote.ballast = true;
    if (desk) desk.spare = true;
  }

  // ---- ROUND A7: the west corner (not in `chairs` / `sideTables`: those are the players' and carry their own dress)
  const S7 = { on: a7, floor: set7, chair: null, table: null };
  if (set7) {
    const w = planWestCorner(A, chairs);
    // TIER LINE (owner: floor): below the high room the corner is built in a lean form (items.js `lean`)
    const ch = w ? add({ ...w.chair, lean: detail < 2 }) : null;
    if (ch) { S7.chair = ch; const st = add({ ...w.table, lean: detail < 2 }); if (st) S7.table = st; }
  }

  // ---- thresholds across the walk-ins
  const thresholds = [];
  if (detail >= 1) for (const g of B.gaps ?? []) {
    const along = g.side === 'north' || g.side === 'south';
    const line = g.side === 'north' ? I.z0 : g.side === 'south' ? I.z1 : g.side === 'east' ? I.x1 : I.x0;
    const from = g.from + THRESHOLD.inset, to = g.to - THRESHOLD.inset, c = (from + to) / 2;
    const box = along ? { x0: r4(from), x1: r4(to), z0: r4(line - THRESHOLD.depth / 2), z1: r4(line + THRESHOLD.depth / 2), h: THRESHOLD.h }
      : { x0: r4(line - THRESHOLD.depth / 2), x1: r4(line + THRESHOLD.depth / 2), z0: r4(from), z1: r4(to), h: THRESHOLD.h };
    const th = add({ id: g.side, kind: 'threshold', x: along ? r4(c) : line, z: along ? line : r4(c), ry: along ? 0 : Math.PI / 2, length: r4(to - from), box });
    if (th) thresholds.push(th);
    // (round A6: worn tape on the carpet inside the walk-in; `scuff` = which way the island lies in the strip's own
    // frame: +1 = its +z. Only where the strip runs along x: the layout's two walk-ins do)
    if (th && set6 && along) th.scuff = line < 0 ? 1 : -1;
  }

  // ---- the taped cable runs: from where a camera's cable lands beside its platform to the end of the layout's path;
  // every piece goes to the camera's own mesh group (the lite room lays none)
  const cables = [];
  const width = Number.isFinite(F.cableWidth) ? F.cableWidth : 0.10;
  for (const run of detail >= 1 ? F.cables ?? [] : []) {
    const cam = cameras.find((c) => c.id === run.id), plat = platforms.find((p) => p.id === run.id);
    if (!cam || !plat || plat.zone === 'stand') continue;   // a run belongs to a camera that stands on a floor riser
    if (!plat.tape) { problems.push(`cable.${run.id}: its path does not leave the platform`); plat.exit = null; plat.land = null; plat.lead = null; continue; }
    const path = plat.tape;
    const segments = [];
    let bad = false;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const box = { ...boxOf([a, b], width * 0.75), h: CABLE.ridge + 0.002 };
      if (overlap(box, stroke)) { problems.push(`cable.${run.id}: segment ${i} crosses the stroke room`); bad = true; break; }
      segments.push({ a, b, box, group: cam.group });
    }
    if (bad) { plat.exit = null; plat.land = null; plat.lead = null; continue; }
    cables.push({ id: run.id, kind: 'cable', width, path, start: path[0], segments });
    leadOf(cam, plat);
  }
  // (a riser whose camera has no run keeps its step-up side and has no drop)
  for (const p of platforms) if (p.zone !== 'stand' && !cables.some((c) => c.id === p.id)) { p.exit = null; p.land = null; p.lead = null; }
  // (round A5: the dress's taped runs; `of` names the kind of thing a run belongs to. NO run lies on or crosses the
  // shell's edging profile on the island's joint: a cable goes UNDER that profile to the boards, so a run ends at the
  // profile's inner line. The remote camera's run: from its base plate's rim toward the nearest board, as far as that
  // line; where the plate stands at the line already, as the layout's does, there is no tape: its cable goes from the
  // plate's rim straight under the profile)
  if (D.remote) {
    const r = D.remote, [ox, oz] = r.toBoard, a = [r4(r.x + ox * (REMOTE.base + 0.015)), r4(r.z + oz * (REMOTE.base + 0.015))];
    const len = r.boardDist - REMOTE.base - 0.015 - BOARD_CLEAR;
    if (len > 0.05) {
      const b = [r4(a[0] + ox * len), r4(a[1] + oz * len)], box = { ...boxOf([a, b], width * 0.75), h: CABLE.ridge + 0.002 };
      if (!overlap(box, stroke)) cables.push({ id: r.id, of: 'remote', kind: 'cable', width, path: [a, b], start: a, segments: [{ a, b, box, group: r.group }] });
    }
  }
  // (and the monitor's: from behind the screen ALONG the boards' foot, just inside the profile's line, to the low
  // camera's base plate, where both cables go under the profile together: the one taped run a pose from above reads.
  // `lead` = where the monitor's own cable meets the tape, in the monitor's frame)
  if (D.monitor) {
    const m = D.monitor, edge = m.x >= 0 ? I.x1 : I.x0, sg = m.x >= 0 ? 1 : -1, dir = D.remote ? Math.sign(D.remote.z - m.z) || 1 : 1;
    const x = r4(edge - sg * (BOARD_CLEAR + 0.054)), z0 = dir > 0 ? m.box.z1 : m.box.z0;
    // (it ends two centimetres short of the plate's rim on the run's own line)
    const reach = D.remote ? Math.sqrt(Math.max(0, REMOTE.base * REMOTE.base - (x - D.remote.x) * (x - D.remote.x))) : 0;
    const z1 = r4(D.remote ? D.remote.z - dir * (reach + 0.02) : z0 + dir * 0.9);
    if ((z1 - z0) * dir > 0.3) {
      const path = [[x, z0], [x, z1]], segments = [];
      for (let i = 0; i + 1 < path.length; i++) segments.push({ a: path[i], b: path[i + 1], box: { ...boxOf([path[i], path[i + 1]], width * 0.75), h: CABLE.ridge + 0.002 }, group: m.group });
      if (!segments.some((s) => overlap(s.box, stroke))) {
        cables.push({ id: m.id, of: 'monitor', kind: 'cable', width, path, start: path[0], segments });
        const dx = x - m.x, dz = z0 - dir * 0.012 - m.z, cs = Math.cos(m.ry), sn = Math.sin(m.ry);
        m.lead = [r4(dx * cs - dz * sn), r4(dx * sn + dz * cs)];
      }
    }
  }

  // ---- ROUND A8: the monitor position (the monitor and its stool from the base room up; its taped cable on the high
  // room). The stool joins `stools`: nothing may lie on it. The cable is taped from behind the screen straight to
  // the south boards' foot (`lead`: where it meets the tape)
  const a8 = (opts?.a8 ?? FLOOR_A8_DEFAULT) === true;
  const S8 = { on: a8, floor: a8 && set7, monitor: null, stool: null };
  if (S8.floor) {
    const hi = detail >= 2;
    const [x, z] = MONITOR_SPOT.at, [sx, sz, turn] = MONITOR_SPOT.stool, ry = r4(Math.atan2(-x, -z)), half = Math.hypot(STOOL.w, 2 * STOOL.spread + 0.04) / 2;
    const m = add({ id: 's', kind: 'monitor', x, z, ry, lead: hi ? [0.09, -0.2] : null, box: { ...rectBox(x, z, ry, MONITOR.w / 2 + 0.005, MONITOR.front, MONITOR.back), h: MONITOR.top } });
    const st = m && add({ id: 's', kind: 'stool', x: sx, z: sz, ry: r4(ry + turn), base: 0, box: { x0: r4(sx - half), x1: r4(sx + half), z0: r4(sz - half), z1: r4(sz + half), h: STOOL.h } });
    if (st) stools.push(st);
    if (m && hi) {
      const a = toRoom(x, z, ry, m.lead[0], m.lead[1] - 0.012).map(r4), b = [a[0], r4(I.z1 - BOARD_CLEAR)];
      cables.push({ id: m.id, of: 'monitor', kind: 'cable', width, path: [a, b], start: a, segments: [{ a, b, box: { ...boxOf([a, b], width * 0.75), h: CABLE.ridge + 0.002 }, group: m.group }] });
    }
    S8.monitor = m; S8.stool = st || null;
  }

  // (round A6: the first spot's taped run: along the boards' foot inside the edging's line, then out to the coil in
  // three chords; every piece in the spot's own mesh group)
  for (const sp of S6.spots) {
    if (!sp.run) continue;
    const segments = [];
    for (let i = 0; i + 1 < sp.run.length; i++) segments.push({ a: sp.run[i], b: sp.run[i + 1], box: { ...boxOf([sp.run[i], sp.run[i + 1]], width * 0.75), h: CABLE.ridge + 0.002 }, group: sp.group });
    if (segments.some((s) => overlap(s.box, stroke))) continue;
    cables.push({ id: sp.id, of: 'spot', kind: 'cable', width, path: sp.run, start: sp.run[0], segments });
  }

  const emitters = [];   // the tally lights are a few square centimetres: nothing is registered with the room light
  return { version: FLOOR_PLAN_VERSION, detail, stroke, items, cameras, platforms, stools, chairs, sideTables, desk, thresholds, cables, emitters, problems, dress: D, a6: S6, a7: S7, a8: S8 };
}

/** Every box of the plan: the standing items, and the flat ones (cable pieces, thresholds) marked `flat`. */
export function planBoxes(plan) {
  const out = [];
  for (const it of plan.items) {
    const zone = it.zone ?? 'island', on = it.on ?? null;
    if (it.boxes) for (const b of it.boxes) out.push({ id: `${it.kind}.${b.tag}`, kind: it.kind, item: `${it.kind}.${it.id}`, zone, on, flat: false, group: it.group, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: b.h });
    else out.push({ id: `${it.kind}.${it.id}`, kind: it.kind, item: `${it.kind}.${it.id}`, zone, on, flat: it.kind === 'threshold', group: it.group, ...it.box });
  }
  for (const c of plan.cables) for (const [i, s] of c.segments.entries()) out.push({ id: `cable.${c.id}.${i}`, kind: 'cable', flat: true, group: s.group, ...s.box });
  return out;
}

// a segment against a box standing on the floor (slab test; heights above the floor)
function segmentHitsBox(p, q, b) {
  let t0 = 0, t1 = 1;
  for (const [a, d, lo, hi] of [[p[0], q[0] - p[0], b.x0, b.x1], [p[1], q[1] - p[1], 0, b.h], [p[2], q[2] - p[2], b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-12) { if (a < lo || a > hi) return false; continue; }
    const u0 = (lo - a) / d, u1 = (hi - a) / d;
    t0 = Math.max(t0, Math.min(u0, u1)); t1 = Math.min(t1, Math.max(u0, u1));
    if (t0 > t1) return false;
  }
  return true;
}

/** The walk-ins as rectangles that have to stay free: the gap's width, `depth` to both sides of the board line. */
export function walkIns(A = ARENA, depth = 0.9) {
  const I = A.island;
  return (A.boards.gaps ?? []).map((g) => {
    const line = g.side === 'north' ? I.z0 : g.side === 'south' ? I.z1 : g.side === 'east' ? I.x1 : I.x0;
    return g.side === 'north' || g.side === 'south' ? { side: g.side, x0: g.from, x1: g.to, z0: line - depth, z1: line + depth } : { side: g.side, x0: line - depth, x1: line + depth, z0: g.from, z1: g.to };
  });
}

/** What a thing standing on the hall's floor OUTSIDE the boards must keep clear of: the gangway round the boards (the
 * first rows' distance from the island), every seating block, the drape on the walls, the backdrop's row of floor lights. */
export function hallProblems(b, A = ARENA) {
  const out = [], I = A.island, H = A.hall, keep = A.seating?.front ?? 1.2;
  if (b.x0 < I.x1 + keep && b.x1 > I.x0 - keep && b.z0 < I.z1 + keep && b.z1 > I.z0 - keep) out.push(`${b.id} stands in the gangway round the boards`);
  for (const blk of A.seating?.blocks ?? []) {
    const f = blockFootprint(blk, A);
    if (b.x0 < f.x1 + HALL_CLEAR && b.x1 > f.x0 - HALL_CLEAR && b.z0 < f.z1 + HALL_CLEAR && b.z1 > f.z0 - HALL_CLEAR) out.push(`${b.id} stands in the ${blk.id} seating block`);
  }
  if (!(b.x0 >= H.x0 + WALL_CLEAR && b.x1 <= H.x1 - WALL_CLEAR && b.z0 >= H.z0 + WALL_CLEAR && b.z1 <= H.z1 - WALL_CLEAR)) out.push(`${b.id} stands in the hall's drape`);
  const bd = A.backdrop;
  if (bd && b.z0 < bd.z1 && b.z1 > bd.z0 && b.x0 < (Number.isFinite(bd.floorLights?.x) ? bd.floorLights.x : bd.x + 1) + 0.3) out.push(`${b.id} stands in the backdrop's row of floor lights`);
  return out;
}
// how far a hall item stays from a seating block's footprint, and from the hall's walls (the drape's pleats and hem)
const HALL_CLEAR = 0.25, WALL_CLEAR = 0.6;

/**
 * The keep-outs over a list of boxes (planBoxes(), or boxes measured on built geometry): returns the problems, [] when the
 * plan is lawful. Laws: nothing in the stroke room; nothing in the volume the app's camera can reach (a box by the cone's
 * lowest point over it; a camera, whose body is not a box, by its proof points and the layout's test: clearOfCamera);
 * nothing between a review camera and its target; the walk-ins free of anything higher than a flat strip; island items
 * inside the boards; hall items (cameras, platforms, stools) clear of the gangway, the seating, the drape and the
 * backdrop's lights; standing items apart from each other (a platform carries its camera and its stool).
 */
export function checkPlan(plan, A = ARENA, views = VIEWS, boxes = planBoxes(plan)) {
  const out = [...plan.problems];
  const I = A.island, clr = A.keepOut.clearance, bedH = A.camera.bedH;
  const gaps = walkIns(A);
  // (a measured box carries no zone: what belongs to a platform on a seating block is found by that platform's footprint)
  const towers = (plan.platforms ?? []).filter((p) => p.zone === 'stand');
  const onTower = (b) => towers.some((t) => b.x0 >= t.box.x0 - 0.2 && b.x1 <= t.box.x1 + 0.2 && b.z0 >= t.box.z0 - 0.2 && b.z1 <= t.box.z1 + 0.2);
  for (const b of boxes) {
    const zone = b.zone ?? (HALL_KINDS.includes(b.kind) ? (onTower(b) ? 'stand' : 'hall') : 'island');
    const hall = zone === 'hall', stand = zone === 'stand';
    if (overlap(b, plan.stroke)) out.push(`${b.id} stands in the stroke room`);
    if (!b.group) out.push(`${b.id} has no mesh group (its box would hold the table)`);
    // under the camera: the lowest point of the cone over the box (the cone falls toward the table; it is infinite outside the reach)
    if (b.kind !== 'camera') {
      let low = Infinity;
      const nx = Math.min(Math.max(0, b.x0), b.x1), nz = Math.min(Math.max(0, b.z0), b.z1);
      for (const [x, z] of [[nx, nz], [b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1], [nx, b.z0], [nx, b.z1], [b.x0, nz], [b.x1, nz]]) low = Math.min(low, cameraFloor(x, z, A));
      if (!(b.h + clr <= low)) out.push(`${b.id} (top ${b.h} m) reaches the app camera's volume (lowest ${low.toFixed(3)} m there)`);
    }
    if (!b.flat) {
      for (const g of gaps) if (overlap(b, g)) out.push(`${b.id} stands in the ${g.side} walk-in`);
      if (hall) out.push(...hallProblems(b, A));
      // (what stands on a seating block: on a platform whose own plan is lawful (planTower's `why`), and outside the reach)
      // (a camera is not a box: its own proof points carry that test below)
      else if (stand) { if (b.kind !== 'camera' && !(reachMargin(Math.abs(b.x0) < Math.abs(b.x1) ? b.x0 : b.x1, Math.abs(b.z0) < Math.abs(b.z1) ? b.z0 : b.z1, A) >= clr)) out.push(`${b.id} stands on a seating block inside the app camera's plan reach`); }
      else if (!(b.x0 >= I.x0 + B_CLEAR && b.x1 <= I.x1 - B_CLEAR && b.z0 >= I.z0 + B_CLEAR && b.z1 <= I.z1 - B_CLEAR)) out.push(`${b.id} is not inside the boards`);
    } else if (b.h > 0.03) out.push(`${b.id} is called flat and is ${b.h} m high`);
    for (const v of views) {
      const p = [v.cam[0], v.cam[1] + bedH, v.cam[2]], q = [v.target[0], v.target[1] + bedH, v.target[2]];
      if (segmentHitsBox(p, q, b)) out.push(`${b.id} stands between the review camera ${v.id} and its target`);
      if (!b.flat && p[0] > b.x0 - 0.2 && p[0] < b.x1 + 0.2 && p[2] > b.z0 - 0.2 && p[2] < b.z1 + 0.2 && p[1] < b.h + 0.3) out.push(`the review camera ${v.id} stands in ${b.id}`);
    }
  }
  for (const c of plan.cameras) {
    for (const [x, h, z] of c.proof ?? c.control) if (!clearOfCamera(x, h, z, A)) out.push(`camera.${c.id}: a point at ${h} m reaches the app camera's volume`);
    if (!(c.lensOverDeck >= CAM.lensRange[0] && c.lensOverDeck <= CAM.lensRange[1])) out.push(`camera.${c.id}: its lens is ${c.lensOverDeck} m over its deck (a studio pedestal carries it at ${CAM.lensRange[0]} to ${CAM.lensRange[1]} m)`);
  }
  const standing = boxes.filter((b) => !b.flat);
  // (a platform carries its camera and its stool; the stool's distance from the pedestal is planStool's own test)
  const stacked = (a, b) => a.on === b.item || b.on === a.item || (a.on && a.on === b.on);
  for (let i = 0; i < standing.length; i++) for (let j = i + 1; j < standing.length; j++) if (standing[i].item !== standing[j].item && !stacked(standing[i], standing[j]) && overlap(standing[i], standing[j])) out.push(`${standing[i].id} and ${standing[j].id} overlap`);
  return out;
}
// how far inside the island's edge a standing item's box has to stay (the boards' own half thickness)
const B_CLEAR = 0.06;
// the kinds that stand in the hall outside the boards (a measured box carries no zone: its kind says it)
const HALL_KINDS = Object.freeze(['camera', 'platform', 'stool', 'workLight']);

/**
 * The person rule over what was built: `parts` = [{ item, id, part, top, x0, x1, z0, z1 }] (floor.js counts().parts).
 * Fails on a part name outside PARTS or one that describes a person, on anything as tall as a seated or standing figure,
 * and on anything that is not the chair's own inside a chair's footprint above its seat.
 */
export function checkPeople(parts, plan = null) {
  const out = [];
  for (const p of parts) {
    const list = PARTS[p.item];
    if (!list) { out.push(`an item of an unknown kind: ${p.item}`); continue; }
    if (!list.includes(p.part)) out.push(`${p.item}: a part outside the list: ${p.part}`);
    if (PERSON_NAME.test(p.part) || PERSON_NAME.test(p.item) || PERSON_NAME.test(String(p.id))) out.push(`${p.item}.${p.part}: a name that describes a person`);
    if (p.item === 'camera') {
      // the one tall thing: it ends `cameraOverDeck` over the deck it stands on
      const deck = plan?.cameras?.find((c) => c.id === p.id)?.deckH ?? PLATFORM.hMax;
      if (!(p.top <= deck + STATURE.cameraOverDeck)) out.push(`camera.${p.part} is ${p.top} m tall: a camera ends ${STATURE.cameraOverDeck} m over its deck`);
    } else if (p.item === 'platform' && plan?.platforms?.find((q) => q.id === p.id)?.zone === 'stand') {
      // a platform on a seating block: its own parts end at its guard rail, hip height over its deck
      const deck = plan.platforms.find((q) => q.id === p.id).h;
      if (!(p.top <= deck + STATURE.platformOverDeck)) out.push(`platform.${p.part} ends ${p.top} m over the floor: a platform's parts end ${STATURE.platformOverDeck} m over its deck (${deck} m)`);
    } else if (p.item === 'workLight') {
      // (round A6) a work lamp: a mast with a can on it. It ends `workLightOverDeck` over its platform's deck and no
      // part of it is as wide as a hand's span: a thing that tall is never a shape with shoulders
      const deck = plan?.platforms?.find((q) => q.id === p.id)?.h ?? 0;
      if (!(p.top <= deck + STATURE.workLightOverDeck)) out.push(`workLight.${p.part} ends ${p.top} m over the floor: a work lamp ends ${STATURE.workLightOverDeck} m over its deck (${deck} m)`);
      if (!(p.x1 - p.x0 <= STATURE.workLightWide && p.z1 - p.z0 <= STATURE.workLightWide)) out.push(`workLight.${p.part} is ${Math.max(p.x1 - p.x0, p.z1 - p.z0).toFixed(3)} m wide: a work lamp is a mast and a can`);
    } else if (!(p.top <= STATURE.maxTop)) out.push(`${p.item}.${p.part} is ${p.top} m tall: nothing but a camera is as tall as a person`);
    if (p.item === 'chair' && !(p.top <= STATURE.chairTop)) out.push(`chair.${p.part} reaches ${p.top} m: something sits on the chair`);
    if (p.item === 'stool') {
      const base = plan?.stools?.find((s) => s.id === p.id)?.base ?? PLATFORM.hMax;
      if (!(p.top <= base + STOOL.h + 0.01)) out.push(`stool.${p.part} reaches ${p.top} m: something sits on the stool`);
    }
  }
  for (const ch of [...(plan?.chairs ?? []), ...(plan?.a7?.chair ? [plan.a7.chair] : [])]) for (const p of parts) {
    if (p.item === 'chair' || p.item === 'cable' || p.top < CHAIR.seatH) continue;
    if (p.x0 < ch.box.x1 - 0.12 && p.x1 > ch.box.x0 + 0.12 && p.z0 < ch.box.z1 - 0.12 && p.z1 > ch.box.z0 + 0.12) out.push(`${p.item}.${p.part} lies on the chair ${ch.id}`);
  }
  // nothing stands or lies on a stool, and nothing but the camera's own pedestal stands where an operator would
  for (const st of plan?.stools ?? []) for (const p of parts) {
    // (the camera of the same platform turns over the deck at an angle: a part's box is wider than the part, and the
    // stool's distance from the pedestal is planStool's own, exact test)
    if (p.item === 'stool' || p.item === 'platform' || p.item === 'cable' || (p.item === 'camera' && p.id === st.id) || p.top < st.base + STOOL.h - 0.02) continue;
    if (p.x0 < st.box.x1 - 0.12 && p.x1 > st.box.x0 + 0.12 && p.z0 < st.box.z1 - 0.12 && p.z1 > st.box.z0 + 0.12) out.push(`${p.item}.${p.part} lies on the stool ${st.id}`);
  }
  return out;
}

// ---- where a review pose frames a camera (round A4, CONTRACT 16.5): arithmetic before any picture ------------------------
// the table light's housing over the bed: the app's canopy rectangle (room/lamp/face.js CANOPY: 2.05 x 0.66 m at 1.02 m)
// with the rig's box round it (arena/rig/housing.js BOX: 0.13 m out, 0.045 m below, 0.18 m above); the arm compares
export const LAMP_BOX = Object.freeze({ hx: 1.155, hz: 0.46, y0: 0.975, y1: 1.20 });

/**
 * What can stand between a review pose and a camera's head, as boxes over the floor { name, x0, x1, h0, h1, z0, z1 }:
 * the table light's housing, the rig's truss, the boards, each seating row's deck and its line of folded seats.
 */
export function sightBlockers(A = ARENA, lamp = LAMP_BOX) {
  const out = [], bedH = A.camera.bedH, I = A.island;
  const add = (name, x0, x1, h0, h1, z0, z1) => out.push({ name, x0: Math.min(x0, x1), x1: Math.max(x0, x1), h0, h1, z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  add('housing', -lamp.hx, lamp.hx, bedH + lamp.y0, bedH + lamp.y1, -lamp.hz, lamp.hz);
  if (A.rig) {
    const r = A.rig, hx = r.length / 2, hz = r.width / 2, s = r.section, y0 = r.bottomH, y1 = r.bottomH + s;
    add('truss', -hx, hx, y0, y1, -hz, -hz + s); add('truss', -hx, hx, y0, y1, hz - s, hz);
    add('truss', -hx, -hx + s, y0, y1, -hz, hz); add('truss', hx - s, hx, y0, y1, -hz, hz);
  }
  const b = A.boards, t = b.thickness / 2, top = b.height + (b.rail?.height ?? 0);
  const runs = (side, from, to) => { let cuts = [[from, to]]; for (const g of (b.gaps ?? []).filter((q) => q.side === side)) cuts = cuts.flatMap(([p, q]) => (g.to <= p || g.from >= q ? [[p, q]] : [[p, g.from], [g.to, q]].filter(([u, v]) => v - u > 0.01))); return cuts; };
  for (const [p, q] of runs('north', I.x0, I.x1)) add('boards', p, q, 0, top, I.z0 - t, I.z0 + t);
  for (const [p, q] of runs('south', I.x0, I.x1)) add('boards', p, q, 0, top, I.z1 - t, I.z1 + t);
  for (const [p, q] of runs('east', I.z0, I.z1)) add('boards', I.x1 - t, I.x1 + t, 0, top, p, q);
  for (const [p, q] of runs('west', I.z0, I.z1)) add('boards', I.x0 - t, I.x0 + t, 0, top, p, q);
  const S = A.seating, back = TOWER.zones[TOWER.zones.length - 1];
  for (const blk of S?.blocks ?? []) {
    const f = blockFrame(blk, A), lo = Math.min(blk.from, blk.to), hi = Math.max(blk.from, blk.to), aw = S.aisleWidth / 2;
    for (const r of seatingRows(S)) for (const [p, q] of [[lo, blk.aisleAt - aw], [blk.aisleAt + aw, hi]]) {
      const box = (name, d0, d1, h0, h1) => { const [xa, za] = f.at(p, d0), [xb, zb] = f.at(q, d1); add(name, xa, xb, h0, h1, za, zb); };
      box('seating', r.offset, r.offset + S.tread, 0, r.h);
      box('seats', r.offset + TOWER.zones[1].from, r.offset + back.to, r.h, r.h + back.top);
    }
  }
  return out;
}

function segmentInBox(p, q, b) {
  let t0 = 1e-4, t1 = 1 - 1e-4;
  for (const [a, d, lo, hi] of [[p[0], q[0] - p[0], b.x0, b.x1], [p[1], q[1] - p[1], b.h0, b.h1], [p[2], q[2] - p[2], b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-12) { if (a < lo || a > hi) return false; continue; }
    const u0 = (lo - a) / d, u1 = (hi - a) / d;
    t0 = Math.max(t0, Math.min(u0, u1)); t1 = Math.min(t1, Math.max(u0, u1));
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * A planned camera's head (its control points: hood, lens, housing, finder, bars) in a review pose of the layout
 * (`view`: { cam, target, fov }, metres over the bed), on a frame of `size` pixels: the head's box in pixels (`w`, `h`,
 * its centre `at`), the share of its points inside the frame (`inFrame`), the share inside the frame with a free sight
 * line (`seen`), and what covers the rest (`covered`: blocker name -> share). null when the head is behind the pose.
 */
export function headInPose(cam, view, A = ARENA, size = [1280, 720], blockers = sightBlockers(A)) {
  const bedH = A.camera.bedH, [W, H] = size;
  const c = [view.cam[0], view.cam[1] + bedH, view.cam[2]], t = [view.target[0], view.target[1] + bedH, view.target[2]];
  let f = [t[0] - c[0], t[1] - c[1], t[2] - c[2]]; const fl = Math.hypot(...f); f = f.map((v) => v / fl);
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const k = (H / 2) / Math.tan((view.fov * Math.PI) / 360);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, seen = 0, inFrame = 0;
  const covered = {}, pts = cam.control;
  for (const p of pts) {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (z <= 0.1) return null;
    const px = W / 2 + (k * (d[0] * r[0] + d[1] * r[1] + d[2] * r[2])) / z, py = H / 2 - (k * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2])) / z;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    if (px < 0 || px > W || py < 0 || py > H) continue;
    inFrame += 1;
    const b = blockers.find((bx) => segmentInBox(c, p, bx));
    if (b) covered[b.name] = (covered[b.name] ?? 0) + 1; else seen += 1;
  }
  const share = (n) => Math.round((100 * n) / pts.length) / 100;
  return { w: Math.round(x1 - x0), h: Math.round(y1 - y0), at: [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)], inFrame: share(inFrame), seen: share(seen),
    covered: Object.fromEntries(Object.entries(covered).map(([name, n]) => [name, share(n)])) };
}

/** FNV-1a over the plan's geometry: the bake's signature of the floor part (levels and colours are not in it). */
export function planSignature(plan) {
  const geo = {
    v: plan.version, rev: FLOOR_GEOMETRY_REV, d: plan.detail,
    items: plan.items.map((it) => [it.kind, it.id, r4(it.x), r4(it.z), it.ry, it.pivotH ?? 0, it.tilt ?? 0, it.length ?? 0, it.rest ? [it.rest.end, it.rest.butt] : 0,
      it.kind === 'platform' ? [it.w, it.d, it.h, it.open, it.cableSide, it.exit, it.land, it.zone, it.side, it.legs, it.steps, it.cover] : 0, it.base ?? 0]),
    cables: plan.cables.map((c) => [c.id, c.width, c.path]),
    sizes: [CAM, PLATFORM, STOOL, TOWER, CHAIR, SIDE_TABLE, DESK, REST, THRESHOLD, CABLE],
    // (round A5: a dressed plan carries the dress's sizes and revision; a plain one is round A4's text, byte for byte)
    ...(plan.dress?.on ? { dress: [DRESS_REV, REMOTE, MONITOR, BIN, CUE_STAND, BOARD_CLEAR] } : {}),
    // (round A6: a plan with the round's set on carries its sizes, its revision and each lamp's opening and axis; a
    // plan without it is round A5's text, byte for byte)
    ...(plan.a6?.on ? { a6: [A6_REV, WORK_LIGHT, ROAD_CASE, TROLLEY, SPOT, BALLAST, SPARE, SCUFF, CHAIR_ASKEW_A6, plan.a6.floor, plan.a6.lamps.map((l) => [l.id, l.mount, l.lit, l.dir])] } : {}),
    // (round A7: a plan that carries the round's geometry (the base room and up) names its sizes and revision; the
    // lite room, which builds none of it, keeps round A6's text byte for byte)
    ...(plan.a7?.floor ? { a7: [A7_REV, WEST_CORNER, SPIKE] } : {}),
  };
  const text = JSON.stringify(geo);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `floor-${h.toString(16).padStart(8, '0')}`;
}
