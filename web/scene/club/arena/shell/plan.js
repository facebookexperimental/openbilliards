// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/shell/plan.js — where every piece of the hall's shell stands (CONTRACT.md 13.4, 14.2). Owner: shell.
// Pure data and arithmetic: no three import, so the node arm (web/tools/club/test-club-arena-shell.mjs) runs it as it is.
//
// The shell is the surfaces of the hall itself: the carpet, the drape on the four walls, the bare wall and the roof's lid
// above it, the backdrop and its floor lights. Positions that other parts share come from ../layout.js (the hall's box, the
// island, the backdrop, the seating blocks); what only the shell knows is in PLAN below. Heights are ABOVE THE FLOOR.
//
// `shellPlan(layout, detail)` is everything the builder (../shell.js) turns into triangles and emitters, as plain numbers;
// `shellSignature(plan)` hashes the part of it a bake depends on (geometry and emitter places, never a level or a colour).
import { ARENA } from '../layout.js';

// (4: round A4, the hall under house lights at half. The drape hangs in bays that differ (how tightly each width is
// gathered), its folds are deeper, a join is a lap, its head sags between its ties, it opens at four door bays; the
// pipe-and-base rail, the exit doors and their signs, cable trays and eaves beams under the roof; the island's edging
// profile is 9 cm wide.)
// (5: round A5, light with shape. The exit doors are recesses: the bay's wall is a pier built out into the hall and
// the door pair stands back in it; the sign has a hot band and a down window. The backdrop's wash is a one-sided
// tube aimed up the cloth (the emitter carries a normal, and the signature holds it). The lite tier's drape is flat
// cloth that carries the high tier's folds as a map.)
export const SHELL_VERSION = 5;

const freeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); }
  return o;
};

/** The shell's own numbers (metres). A value the layout also names (`ARENA.backdrop.floorLights`) is read from there. */
export const PLAN = freeze({
  carpet: {
    // broadloom on the island: 3.66 m rolls laid along the table's long axis, one roll centred under the table, so the two
    // seams run 1.83 m to either side of the table's centre line; the hall's own carpet is 4 m rolls laid across
    roll: 3.66, outerRoll: 4.0,
    // The island's carpet is a second carpet laid on the hall's. It ends `inset` INSIDE the line the boards stand on
    // (layout.island): the boards stand on the hall's own carpet a hand off the play carpet, as a crew sets them, so the
    // joint between the two carpets lies in the open at the boards' feet instead of under them (round A3: in A2 it was
    // in no review pose). At 0.31 m the joint's profile (0.27 to 0.35 m inside the board line) lies just clear of the
    // boards' feet (they reach 0.25 m inside: layout.boards.footDepth / 2) and of the furniture that stands along the
    // boards (the desk's box starts 0.37 m inside, the chairs' 0.40 m): the node arm pins both clearances.
    inset: 0.31,
    // the joint: an edging profile over it (a low grey PVC ramp, the kind an exhibition floor ends in): `width` across,
    // `height` at its flat top (`top` wide), sloped to the carpet on both sides; laid in lengths of `piece`
    // (round A4: 9 cm wide and 11 mm high, an aluminium ramp edge: at 8 cm and 9 mm it was one faint pixel row on the
    // island's east side at V10. Its centre line stays: it occupies 0.265 to 0.355 m inside the board line.)
    trim: { width: 0.09, height: 0.011, top: 0.036, piece: 2.5, foot: 0.015 },
    // lite: the flat bound edge of round A1 under the profile (its width; the profile hides its middle)
    tape: 0.05,
    // vacuum tracks (the width of a machine's head) and the walked band around the table (distance from the rail, width)
    track: 0.38, walk: 0.7, walkWidth: 0.45,
  },
  drape: {
    // hung from a pipe at this height on all four walls; the bare wall shows above it
    height: 7.0, pipe: 0.06, pipeOff: 0.10,
    // one drape width between two joins (an overlap: a deep, dark fold)
    width: 3.0,
    // the cloth is fuller at the hem than at the head (shares of a pleat's depth), and breaks a hand above the floor
    hemBreak: 0.16, fullness: { hem: 1.18, low: 1.08, mid: 0.94, head: 0.62 },
    // the hem rests on the floor: it spreads this far out from the fold's foot (m, per pleat between the two)
    // (the builder lays a flat strip of cloth on the floor from there, 1.3 x as far again: the pooled hem)
    puddle: [0.03, 0.13],
    // Round A4. No two bays alike: a drape width is hung more or less tightly gathered (`gather`: the fold depth's
    // factor per width; the pitch narrows as it grows), a hung width covers `bay` x `width` of the wall, no fold stands
    // further out of the wall than `maxDepth` (the drape lights' battens stand 0.26 m off it behind the blocks).
    gather: [0.7, 1.5], bay: [0.75, 1.25], maxDepth: 0.20,
    // the head: the cloth is tied to the pipe every `tie` metres (between the two) and sags between two ties by `sag`
    // (between the two): the webbing droops, the pipe does not. `headGap`: the head's ties under the pipe.
    tie: [0.9, 1.6], sag: [0.012, 0.06], headGap: 0.012,
    // the pipe-and-base rail: an upright behind the cloth at every join and at a stretch's ends (a square tube
    // `upright` across; its head shows `over` above the pipe), on a steel base plate `baseW` along the wall, `baseH`
    // thick, reaching `base` off the wall: where a camera sees the wall's foot its front shows in front of the hem
    // (from `baseShow` off the wall: the cloth lies over the rest), and whole where the upright stands in a door bay
    upright: 0.05, over: 0.10, base: 0.50, baseW: 0.45, baseH: 0.012, baseShow: 0.28,
  },
  // Round A4: exit doors. A bay `bay` wide where the drape opens up to `header` above the floor and the wall shows
  // (over it the drape goes on: a header, a short width hung between the bay's two uprights; the first app frame had
  // the bay open to the pipe and it read as a black slot seven metres high); in it a door pair `width` x `height` in
  // a portal `depth` proud of the wall (jambs and a head `jamb` wide); a sign box over the head whose lit face
  // (`sign.w` x `sign.h`, centre `sign.at` above the floor) is a plain green rectangle: a running light, no word and
  // no figure. `at`: the doors' centres along z on the east and the west wall (the corners of the hall: the east
  // pair behind the two camera corners, the west pair beside the backdrop's ends).
  // Round A5: the door is a dark RECESS. The bay's wall is built out as a pier (`pier.depth` into the hall, `pier.inset`
  // narrower than the bay at each side so the rail's two uprights stand free beside it, `pier.top` high: just under
  // the header's hem), and the door pair stands back in it at `leaf` off the hall's wall: a reveal `pier.depth - leaf`
  // deep. (Round A4 had a portal standing 0.25 m PROUD of a flat wall, which is the opposite.) The sign is a box on
  // the pier's face over the opening: a lit face with a hot `core` band [w, h] (the LED row behind the opal), and a
  // lit window in its underside (the down light of an exit luminaire: what falls on the lintel and the reveal).
  doors: {
    bay: 2.6, header: 2.95, width: 1.8, height: 2.1, leaf: 0.03, bar: 1.0,
    pier: { depth: 0.30, inset: 0.18, top: 2.93 },
    sign: { w: 0.5, h: 0.18, at: 2.40, box: 0.07, core: [0.36, 0.035] },
    at: { east: [-10.7, 10.7], west: [-9.1, 9.1] },
  },
  roof: {
    // a profiled steel deck: ribs along x, their crests 60 mm below the lid; two round ducts under it and a cross duct
    ribPitch: 0.30, ribDepth: 0.06, crest: 0.13,
    ducts: { r: 0.30, h: 9.08, z: [-10.4, 10.4], endInset: 0.6, cross: { x: 12.6, w: 0.9, d: 0.45 } },
    // Round A4 (heights agreed with the rig's roof steel: rig/plan.js roofPlan(): trusses along z at x = -7.6 .. 13.2
    // step 5.2 with their top chords' upper side at 8.70 m; purlins along x at z = -7.8 .. 7.8 step 2.6 between 9.16
    // and 9.38 m, from x = -10.85 to 12.1):
    //   trays   cable trays `w` wide and `h` high: two along x that LIE ON the trusses' top chords (`y`: their
    //           underside) between two purlin rows, and one across (`cross`), over the long ones and under the
    //           purlins, between two trusses; it ends short of the round ducts
    //   eaves   a beam at the head of each wall, `d` off the wall, from `y0` up to the deck's crests
    trays: { w: 0.30, h: 0.08, y: 8.70, z: [-3.9, 3.9], x0: -10.4, x1: 12.0, cross: { x: 5.4, y: 8.86, z0: -9.4, z1: 9.4 } },
    eaves: { d: 0.25, y0: 9.05 },
  },
  backdrop: {
    // stretched fabric on a frame: module width (a panel between two uprights), the frame's rails behind the cloth
    module: 1.75, rails: [2.0, 4.0], frame: 0.30, topRail: 0.07,
    // floor lights: LED wash bars on the floor, one per `pitch` (the layout may name it: `floorLights.washPitch`), `off`
    // from the cloth unless the layout places the row (`floorLights.x`: 1 m off, as in round A1). A row that close to a
    // 6 m wall is hot at the foot and falls off up the cloth (11 : 1 from the foot to 3 m by the room light's tube law)
    // Round A5: the row is ONE-SIDED (the room light's one-sided tube: a cosine lobe around a normal): `aim` is the
    // height on the cloth the bars are aimed at. Nothing direct lands on the hall side of the row any more.
    lights: { off: 1.0, pitch: 2.0, length: 1.0, depth: 0.13, height: 0.11, tilt: 0.42, emitterH: 0.2, source: 2.0, aim: 4.0 },
  },
  // the drape lights: a batten on the wall behind each seating block, `inset` shorter than the block at each end
  drapeLights: { off: 0.26, h: 0.6, inset: 1.6 },
});

// Round A7 (CONTRACT 19.3: the exit door leaves "with a line or panel that says door"). What a door pair carries
// besides its two leaves; in the plan only with `opt.doorKit` (then `doors.kit`, held by the signature):
//   frame      a painted steel frame round the leaves (two jambs and a head), this wide, `proud` of the leaves
//   kick       a kick plate on each leaf: from `kick[0]` to `kick[1]` above the floor, `kickInset` inside the leaf's
//              edges, `kickProud` of the leaf
//   gap        the slot under the leaves that shows the lit lobby beyond: from `gap[0]` to `gap[1]` above the floor
export const DOOR_KIT = freeze({ frame: 0.06, proud: 0.012, kick: [0.02, 0.24], kickInset: 0.03, kickProud: 0.004, gap: [0.004, 0.018] });
// Round A7 (CONTRACT 19.3: the backdrop's top third). A PELMET: a border of black serge across the head of the
// backdrop, hung from its top rail down to `hem` above the floor, `proud` of the stretched cloth (the scoreboard's
// rails pass behind it): the lit cloth ends in a line under it. In the plan only with `opt.pelmet` (then
// `backdrop.pelmet`, held by the signature). The cloth's own face ends at the hem (the pelmet takes the top of the
// backdrop's light-map chart: no texel is used twice).
export const PELMET = freeze({ hem: 4.35, proud: 0.16 });

// ---- seeded numbers (deterministic: the same hall on every load) ---------------------------------------------------------
export function makeRand(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

const r4 = (v) => Math.round(v * 10000) / 10000;

/**
 * The pleats of one drape wall of length L: `[{ s, w, A, join, tone, valley, lean, mid, sway, hem }]`.
 *   s, w     where the pleat starts along the wall and how wide it is (one period of the fold)
 *   over     true in a DOOR BAY (`gaps`: [[from, to]] along the wall): the cloth there is a HEADER, a short width of its
 *            own between the bay's two uprights that hangs from the pipe down to over the door (`doors.header`); the
 *            cloth on either side ends at the bay's edge
 *   A        how far its ridge stands out of the wall (never more than 1.1 x its width, 0.7 x for a lap: every face of the
 *            fold then looks within 80 degrees of the wall's normal and projects into the wall's light-map chart; and
 *            never more than `maxDepth`)
 *   join     true where two drape widths meet: this width's free edge LAPS over the next one (the builder gives it a
 *            sawtooth profile: out to the edge, straight back to the wall; the next fold stands in its shadow)
 *   drop     how far the head hangs under its ties at the pleat's start and at its end (the cloth sags between two ties)
 *   tone     the cloth's shade on this pleat against its own colour (nap brushed one way or the other, dust: 0.5 .. 1.25)
 *   valley   what a DEEP fold keeps in its valley on top of an open fold's own shade (1 = an open fold; a narrow deep
 *            fold is closed and goes toward black; a join is black)
 *   lean, mid, sway   how far the fold wanders along the wall at the hem, at mid height and near the head (it does not
 *            hang plumb). The wander is smooth along the wall: neighbouring folds lean together, none crosses the next.
 *   hem      how far its foot spreads out on the floor
 */
export function drapePleats(L, { pitch, depth, seed, width = PLAN.drape.width, puddle = PLAN.drape.puddle, gaps = [], cloth: C = PLAN.drape, mouth = false }) {
  const rnd = makeRand(seed), rt = makeRand((seed ^ 0x5bd1e995) >>> 0);
  const out = [];
  const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const wander = (s, k, a) => a * (Math.sin(0.7 * s + ph[k]) + 0.5 * Math.sin(1.9 * s + ph[k + 1]));
  const span = (r, v) => r[0] + (r[1] - r[0]) * v;
  // a hung drape width: how wide it hangs, how tightly it is gathered (deeper folds on a narrower pitch), its own shade
  // (the gather walks a golden-ratio sequence from a seeded start: two neighbouring widths are never gathered alike)
  let gk = rnd();
  const hang = () => { gk = (gk + 0.6180339887) % 1; const g = gk; return { width: width * span(C.bay, rnd()), gather: span(C.gather, g), pitchK: 1.22 - 0.42 * g, cloth: 0.72 + 0.4 * rnd() }; };
  // the stretches of cloth along the wall (the wall less its door bays), in order, with the bays between them
  const cuts = gaps.filter((g) => g[1] - g[0] > 1e-6 && g[0] >= 0 && g[1] <= L).sort((a, b) => a[0] - b[0]);
  const runs = [];
  let at = 0;
  for (const [a, b] of cuts) { if (a - at > 1e-6) runs.push([at, a, false]); runs.push([a, b, true]); at = b; }
  if (L - at > 1e-6) runs.push([at, L, false]);
  for (const [from, to, over] of runs) {
    // (a door bay is hung too: a HEADER, one short width from the pipe down to over the door; no join inside it)
    // the head's ties along this stretch, and how far the cloth sags between two of them
    const ties = [from], dips = [];
    while (ties[ties.length - 1] < to - 1e-6) { ties.push(Math.min(to, ties[ties.length - 1] + span(C.tie, rt()))); const v = rt(); dips.push(span(C.sag, v * v)); }
    const dropAt = (s) => {
      let k = 0;
      while (k < dips.length - 1 && s > ties[k + 1]) k += 1;
      const x = Math.min(1, Math.max(0, (s - ties[k]) / Math.max(1e-6, ties[k + 1] - ties[k])));
      return dips[k] * 4 * x * (1 - x);
    };
    let s = from, run = 0, bay = hang(), lapped = false;
    while (s < to - 1e-6) {
      const u = rnd();
      let w = pitch * bay.pitchK * (0.5 + 1.1 * u * u + 0.25 * rnd());   // skewed: many narrow folds, a few wide flats
      let A = depth * bay.gather * (0.45 + 1.0 * rnd());
      let join = false;
      const shade = bay.cloth;                               // (a lap is the END of its own width: it keeps that width's shade)
      // a join: this width's free edge laps over the next width (a sawtooth: out to the edge, straight back to the wall)
      if (!over && run + w > bay.width) { join = true; run = 0; bay = hang(); A = depth * 1.7; w = pitch * 1.0; }
      w = Math.min(w, to - s);
      if (to - s - w < pitch * 0.45) w = to - s;             // no sliver at the stretch's end
      // (a lap's straight return to the wall spans a quarter of the pleat: its depth, with the hem's spread on top,
      // has to leave that face within the chart's cone too)
      const hemOut = join ? Math.min(0.06, span(puddle, rnd())) : span(puddle, rnd());
      A = Math.min(A, join ? Math.min(0.7 * w, Math.max(0.03, 0.85 * (w - 0.048) - hemOut)) : 1.1 * w, C.maxDepth);
      const open = w / (2 * A + 0.02);                        // > 2: a wide shallow fold; < 1: a narrow deep one
      // (the fold right behind a lap stands in the lap's shadow)
      // Round A7 (`mouth`): a fold's valley is never closed to black. Its bottom sees the hall through the fold's
      // mouth: of a diffuse light it keeps the share (w / 2) / hypot(w / 2, A) (the form factor of a V-groove's
      // bottom to its opening), 0.41 for the deepest fold hung here (A = 1.1 w), and that is the painted shade's
      // floor; the fold behind a lap keeps half of its own (the lap covers one side of its mouth). Until round A6
      // the floor was 0.14 and 0.12: lines at level 0 to 4 on every tier (the dark-pixel row of CONTRACT 19.3).
      const v0 = Math.min(1, Math.max(0.14, 0.3 + 0.9 * (open - 0.6)));
      const valley = mouth ? (lapped ? 0.5 : 1) * Math.max(v0, (0.5 * w) / Math.hypot(0.5 * w, A)) : lapped ? 0.12 : v0;
      const c = s + w / 2;
      out.push({ s: r4(s), w: r4(w), A: r4(A), join, over, tone: r4(shade * (0.74 + 0.4 * rnd())), valley: r4(valley),
        lean: r4(wander(c, 0, 0.05)), mid: r4(wander(c, 2, 0.035)), sway: r4(wander(c, 4, 0.02)), hem: r4(hemOut),
        drop: [r4(dropAt(s)), r4(dropAt(s + w))] });
      s += w; run += w; lapped = join;
    }
  }
  return out;
}

/**
 * The pleat sizes of a detail level: mean pitch, mean depth, columns per pleat, height bands.
 * Details 1 and 2 share ONE pleat list (the same pitch, depth and seeds: drapePleats() returns the same folds), round A3:
 * the full light map is baked on detail 2 and holds the drape lights' grazing light at the scale of a pleat (8 wall
 * texels per fold), so a base tier with folds of its own sampled lit texels under its valleys and dark ones under its
 * ridges and came out 0.4 to 0.7 of the high tier's level under the same map. Detail 1 saves its triangles in columns
 * only: 2 per pleat (a valley and a ridge: a folded, not a rounded, pleat whose ridge line and valley line are the
 * high tier's own; its vertex normals are the wall's, so its relief is the map's light and the painted fold shade),
 * with the same height bands (a fold wanders along the wall on its way up: the bands are part of where it stands).
 * Measured under one bake on the dev page: 3 columns read the same as 2 to within a level, at 2,000 triangles more.
 */
// Detail 0 (round A5): `flat`. The lite drape is flat cloth, one quad per stretch, and carries the SAME pleat list as a
// map along each wall (../shell.js flatDrape, ./tex.js foldsMap). Round A4's lite tier hung pleats of its own (0.90 m,
// two columns): from the stands it read as flat panels, and those large faces took the drape lights 13 levels over the
// high tier's wall (CONTRACT 16.2 allows 10). The lite light map is baked on the flat walls.
export const PLEATS = freeze({
  0: { pitch: 0.36, depth: 0.13, steps: 2, bands: 1, hem: false, flat: true },
  1: { pitch: 0.36, depth: 0.13, steps: 2, bands: 3, hem: true },
  2: { pitch: 0.36, depth: 0.13, steps: 4, bands: 3, hem: true },
});

/**
 * Everything the shell builds, for a layout and a detail level (0 lite, 1 base, 2 high):
 * { detail, hall, island, walls: [{ id, o, a, L, seed, foot: [[from, to]], doors: [{ s }], gaps: [[from, to]] }], drape,
 *   pleats: { <wall>: [...] }, uprights: { <wall>: [{ s, open, foot }] }, doors, roof, ducts, trays, eaves,
 *   backdrop: { x, z0, z1, height, modules, rails, frame, topRail }, lights: [{ x, z }], light, emitters: [{ id, type, p, axis, size }] }.
 * `foot`: the stretches of a wall whose foot a camera can see (no seating block, no backdrop in front): only there the
 * drape gets its hem band and its puddle on the floor. `doors` / `gaps` (round A4): the exit doors of a wall (their
 * centres along its tangent) and the bays where the drape is a header over them.
 * `opt` (round A6; the builder hands it from its level table, so a tool can build the plan without it):
 *   doorBack   metres: the exit doors' reveal is this much DEEPER: the pier is a door lobby that stands `pier.depth +
 *              doorBack` into the hall, and the door pair stays a hand in front of the hall's wall, at the end of it
 *              (`doors.back` and the deeper `doors.pier.depth` in the plan; 0 or absent = round A5's pier). Nothing
 *              leaves the hall's box (the hall's arm pins every mesh inside it).
 *   roofChart  true: the roof's lid and its deck ribs are a mesh of their own on the hall's light map, on two half
 *              charts (north and south of the hall's centre line: `roof.chart` in the plan); absent = in the matt
 *              mesh on the bake's volume, as until round A5
 *   washAim    metres: the height on the cloth the backdrop's floor lights are aimed at (the one-sided wash tube's
 *              normal); absent = `PLAN.backdrop.lights.aim`
 *   doorKit    (round A7) true: a door pair carries a frame, kick plates and its slot's size (`doors.kit` = DOOR_KIT)
 *   pelmet     (round A7) true: a pelmet of black serge across the backdrop's head (`backdrop.pelmet` = PELMET)
 *   foldOpen   (round A7) true: the drape's folds by the open-mouth law (drapePleats `mouth`): no fold's painted
 *              valley is closed to black. Paint only: the folds' places and sizes are the same, the signature
 *              does not move with it.
 */
export function shellPlan(layout = ARENA, detail = 1, opt = {}) {
  const H = layout.hall, isl = layout.island, bd = layout.backdrop, P = PLAN;
  const doorBack = Number.isFinite(opt?.doorBack) && opt.doorBack > 0 ? r4(Math.min(opt.doorBack, 2)) : 0;
  const d = [0, 1, 2].includes(detail) ? detail : 1;
  const block = (side) => layout.seating.blocks.find((b) => b.side === side) ?? null;
  const visible = (L, hide) => { // [0, L] minus the hidden stretch
    if (!hide) return [[0, L]];
    const out = [];
    if (hide[0] > 0.3) out.push([0, r4(hide[0])]);
    if (hide[1] < L - 0.3) out.push([r4(hide[1]), L]);
    return out;
  };
  // wall frames as ../shell.js walks them: origin at the wall's left end seen from inside, inward normal `a`, the tangent
  // runs to the right (cross(up, a)); `hide` = the stretch behind a seating block or behind the backdrop, along the tangent
  const LX = H.x1 - H.x0, LZ = H.z1 - H.z0;
  const bn = block('north'), bs = block('south'), be = block('east');
  const walls = [
    { id: 'north', o: [H.x0, H.z0], a: [0, 1], L: LX, seed: 20261, hide: bn ? [bn.from - H.x0, bn.to - H.x0] : null },   // tangent +x
    { id: 'east', o: [H.x1, H.z0], a: [-1, 0], L: LZ, seed: 20262, hide: be ? [be.from - H.z0, be.to - H.z0] : null },    // tangent +z
    { id: 'south', o: [H.x1, H.z1], a: [0, -1], L: LX, seed: 20263, hide: bs ? [H.x1 - bs.to, H.x1 - bs.from] : null },   // tangent -x
    { id: 'west', o: [H.x0, H.z1], a: [1, 0], L: LZ, seed: 20264, hide: [H.z1 - bd.z1, H.z1 - bd.z0] },                   // tangent -z
  ].map((w) => {
    // the exit doors of this wall: their centres along the wall's tangent, and the bays where the drape opens for them
    const DR = P.doors, at = w.id === 'east' ? (DR.at.east ?? []).map((z) => z - H.z0) : w.id === 'west' ? (DR.at.west ?? []).map((z) => H.z1 - z) : [];
    const doors = at.filter((s) => s - DR.bay / 2 > 0.3 && s + DR.bay / 2 < w.L - 0.3).sort((a, b) => a - b).map((s) => ({ s: r4(s) }));
    return { id: w.id, o: w.o, a: w.a, L: w.L, seed: w.seed, foot: visible(w.L, w.hide), doors, gaps: doors.map((q) => [r4(q.s - DR.bay / 2), r4(q.s + DR.bay / 2)]) };
  });
  const pl = PLEATS[d];
  const pleats = Object.fromEntries(walls.map((w) => [w.id, drapePleats(w.L, { pitch: pl.pitch, depth: pl.depth, seed: w.seed, gaps: w.gaps, mouth: !!opt?.foldOpen })]));
  // the pipe-and-base rail: an upright behind the cloth where a stretch of cloth begins and ends and at every join;
  // `open`: it stands at the edge of a door bay (seen over its whole height beside the door); `foot`: a camera sees
  // the wall's foot there (its base plate shows in front of the hem)
  const uprights = Object.fromEntries(walls.map((w) => {
    const list = pleats[w.id], out = [];
    const inFoot = (s) => w.foot.some(([a, b]) => s >= a && s <= b);
    // (`open`: 0 = behind the cloth; -1 / +1 = it stands IN a door bay, just clear of the cloth's free edge, the bay
    // on its lower / higher side along the wall)
    const add = (s, open) => out.push({ s: r4(Math.min(w.L - 0.06, Math.max(0.06, s))), open, foot: inFoot(s) });
    list.forEach((p, i) => {
      if (p.over) return;                                    // (a header hangs between the two uprights of its bay)
      const first = i === 0 || list[i - 1].over, last = i === list.length - 1 || list[i + 1].over;
      if (first) add(i > 0 ? p.s - 0.07 : p.s + 0.05, i > 0 ? -1 : 0);
      else if (p.join) add(p.s + 0.75 * p.w, 0);
      if (last) add(i < list.length - 1 ? p.s + p.w + 0.07 : p.s + p.w - 0.05, i < list.length - 1 ? 1 : 0);
    });
    return [w.id, out];
  }));

  // the backdrop's floor lights (the layout may name their distance from the wall and their pitch; else the shell's own)
  const fl = bd.floorLights ?? {};
  const off = Number.isFinite(fl.x) && fl.x - bd.x > 0.3 ? fl.x - bd.x : P.backdrop.lights.off;
  const pitch = Number.isFinite(fl.washPitch) ? fl.washPitch : P.backdrop.lights.pitch;
  const bl = bd.z1 - bd.z0;
  const n = Math.max(1, Math.round(bl / pitch));
  const z0 = (bd.z0 + bd.z1) / 2 - ((n - 1) * pitch) / 2;
  const lights = Array.from({ length: n }, (_, k) => ({ x: r4(bd.x + off), z: r4(z0 + k * pitch) }));

  // emitters (4: the shell's share): one tube along the row of floor lights (the wash as the room's light: the carpet and
  // whatever stands near take its colour from it; the scallop of each unit on the cloth is in the backdrop's own map), and
  // one tube per seating block on the wall behind it
  // (the tube's near-field radius is 2 m: a tube has no shade, and with a small one the carpet under the row took 27
  // units at 0.3 m against 17 on the cloth's foot and stood at the bed's level; at 2 m it takes 15 and the cloth's
  // fall-off is the same within a tenth: scratch/shell/wash.mjs)
  // (round A5: the wash is one-sided: its normal points from the row at the cloth `aim` metres above the floor; the
  // cloth stands at x = bd.x, on the row's -x side)
  const aimH = Number.isFinite(opt?.washAim) && opt.washAim > P.backdrop.lights.emitterH ? opt.washAim : P.backdrop.lights.aim;
  const washLight = aimH === P.backdrop.lights.aim ? P.backdrop.lights : { ...P.backdrop.lights, aim: aimH };
  const aimUp = aimH - P.backdrop.lights.emitterH, aimLen = Math.hypot(off, aimUp);
  const emitters = [{ id: 'hall.wash.0', type: 'tube', p: [r4(bd.x + off), P.backdrop.lights.emitterH, r4((bd.z0 + bd.z1) / 2)], axis: [0, 0, 1], size: [r4((n - 1) * pitch + P.backdrop.lights.length), P.backdrop.lights.source],
    normal: [r4(-off / aimLen), r4(aimUp / aimLen), 0] }];
  const dl = P.drapeLights;
  const battens = [];
  for (const [side, wall, sign] of [['north', H.z0, 1], ['south', H.z1, -1]]) {
    const b = block(side); if (!b) continue;
    const len = Math.max(1, b.to - b.from - 2 * dl.inset);
    emitters.push({ id: `hall.house.${side}`, type: 'tube', p: [r4((b.from + b.to) / 2), dl.h, r4(wall + sign * dl.off)], axis: [1, 0, 0], size: [r4(len), 3.0] });
    battens.push({ id: side, axis: 'x', from: r4((b.from + b.to) / 2 - len / 2), to: r4((b.from + b.to) / 2 + len / 2), at: r4(wall + sign * dl.off) });
  }
  if (be) {
    const len = Math.max(1, be.to - be.from - 2 * dl.inset);
    emitters.push({ id: 'hall.house.east', type: 'tube', p: [r4(H.x1 - dl.off), dl.h, r4((be.from + be.to) / 2)], axis: [0, 0, 1], size: [r4(len), 3.0] });
    battens.push({ id: 'east', axis: 'z', from: r4((be.from + be.to) / 2 - len / 2), to: r4((be.from + be.to) / 2 + len / 2), at: r4(H.x1 - dl.off) });
  }

  const ribs = Math.max(1, Math.round(LZ / P.roof.ribPitch));
  const ins = P.carpet.inset;
  return {
    detail: d,
    hall: { x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1, height: H.height },
    // `island`: the island's CARPET (the play carpet's own rectangle); `ring`: the line the boards stand on (layout.island)
    island: { x0: r4(isl.x0 + ins), x1: r4(isl.x1 - ins), z0: r4(isl.z0 + ins), z1: r4(isl.z1 - ins) },
    ring: { x0: isl.x0, x1: isl.x1, z0: isl.z0, z1: isl.z1 },
    trim: P.carpet.trim,
    walls, pleats, pleat: pl, uprights,
    drape: { height: Math.min(P.drape.height, H.height - 0.5), pipe: P.drape.pipe, pipeOff: P.drape.pipeOff, hemBreak: P.drape.hemBreak, fullness: P.drape.fullness,
      headGap: P.drape.headGap, header: P.doors.header, upright: P.drape.upright, over: P.drape.over, base: P.drape.base, baseW: P.drape.baseW, baseH: P.drape.baseH, baseShow: P.drape.baseShow },
    doors: doorBack > 0 || opt?.doorKit ? { ...P.doors, ...(doorBack > 0 ? { back: doorBack, pier: { ...P.doors.pier, depth: r4(P.doors.pier.depth + doorBack) } } : {}), ...(opt?.doorKit ? { kit: DOOR_KIT } : {}) } : P.doors,
    roof: { ribs: d === 0 ? 0 : ribs, ribPitch: LZ / ribs, ribDepth: P.roof.ribDepth, crest: P.roof.crest, webs: d >= 2, ...(opt?.roofChart ? { chart: true } : {}) },
    ducts: d === 0 ? null : P.roof.ducts,
    trays: d === 0 ? null : P.roof.trays, eaves: d === 0 ? null : P.roof.eaves,
    backdrop: { x: bd.x, z0: bd.z0, z1: bd.z1, height: bd.height, modules: Math.max(1, Math.round(bl / P.backdrop.module)), rails: P.backdrop.rails.filter((h) => h < bd.height - 0.3), frame: P.backdrop.frame, topRail: P.backdrop.topRail,
      ...(opt?.pelmet && PELMET.hem < bd.height - 0.5 ? { pelmet: PELMET } : {}) },
    lights, light: washLight, battens, batten: dl,
    emitters,
    carpet: P.carpet,
  };
}

/** A short hash (FNV-1a, 8 hex digits) of a string. */
export function hash8(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * The shell's signature (CONTRACT 14.2): a short string that moves when its geometry or an emitter's place moves, and with
 * nothing else (levels, colours and textures are not in it). The carpet's seams, wear and tracks are drawn by the
 * carpet's material on the flat floor: they are not geometry and not in it. The island's carpet rectangle and the edging
 * profile on its joint are in it (the profile is geometry; the rectangle decides which carpet a floor point is).
 */
export function shellSignature(plan) {
  const geo = {
    v: SHELL_VERSION, detail: plan.detail, hall: plan.hall, island: plan.island, ring: plan.ring, trim: plan.trim,
    walls: plan.walls.map((w) => [w.id, w.L, w.foot, w.gaps]), pleat: plan.pleat,
    pleats: Object.fromEntries(Object.entries(plan.pleats).map(([k, list]) => [k, hash8(JSON.stringify(list.map((p) => [p.s, p.w, p.A, p.lean, p.mid, p.sway, p.hem, p.join ? 1 : 0, p.over ? 1 : 0, p.drop])))])),
    uprights: Object.fromEntries(Object.entries(plan.uprights).map(([k, list]) => [k, hash8(JSON.stringify(list.map((u) => [u.s, u.open ? 1 : 0, u.foot ? 1 : 0])))])),
    drape: plan.drape, doors: plan.doors, roof: plan.roof, ducts: plan.ducts, trays: plan.trays, eaves: plan.eaves,
    backdrop: plan.backdrop, lights: plan.lights, light: plan.light, battens: plan.battens,
  };
  const em = plan.emitters.map((e) => [e.id, e.type, e.p, e.axis, e.size, e.normal ?? null]);
  return `shell-v${SHELL_VERSION}.d${plan.detail}.g${hash8(JSON.stringify(geo))}.e${hash8(JSON.stringify(em))}`;
}
