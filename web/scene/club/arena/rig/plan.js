// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/plan.js — where every member of the arena's light rig stands, as plain numbers (CONTRACT.md 13.4, 13.5). Owner: rig.
//
// Pure data and arithmetic: no three import, so the node arm (web/tools/club/test-club-arena-rig.mjs) runs it. Every position
// and size comes from arena/layout.js (`ARENA.rig`, `ARENA.houseLights`, `ARENA.hall`, `ARENA.keepOut`); what the layout
// does not say (tube diameters, how a head hangs) is a rigger's standard part and lives in `RIG` below.
//
// Frames: world metres, the table's centre at x = z = 0, the bed plane at y = 0. The layout gives heights above the floor;
// every function here takes the live floor height (`floorY`, world y of the floor) and returns world y.
//
// What hangs (and why it hangs there):
//   - a BOX TRUSS on the layout's rectangle, its lower chords in the app's ceiling plane (`bottomH`). Nothing of it is lower:
//     that plane is the hall's top cut (`ARENA.cut.top`: above it the hall is not drawn while the camera is above it);
//   - WASH HEADS on the outer upper chords of all four runs, on short yokes, so that the lowest point of a tilted can and its
//     barn doors stays above the lower chords. Each lights the part of the island it hangs over (round A2: under real
//     occlusion a head aimed across the table is shaded by the table light's housing; beamsAgainstHousing() is the check);
//   - HOISTS at the four corners: a sling over the upper chords, a chain motor, a chain to the roof's rigging beams;
//   - a SECOND RECTANGLE around the first, one section higher, with profile heads and a few colour washes (outerPlan);
//   - ROOF STEEL with the HOUSE LIGHTS in fixtures on it, and a perimeter truss over the upper seating with the low house
//     lights in cans (roofPlan; a seeded draw: the same field on every boot); small lamps on the walls beside the seating
//     blocks (housePlan).
// The table light's housing is not planned here: it follows the app's lamp rectangle at run time (arena/rig/housing.js).
import { ARENA, cameraCeil } from '../layout.js';

export const RIG = Object.freeze({
  chordR: 0.025,          // main tubes: 50 mm
  braceR: 0.0095,         // lattice diagonals: 19 mm
  tieR: 0.0125,           // end frames
  bay: 0.24,              // a lattice bay (45 degrees between chords 0.24 m apart)
  segment: 3.0, sleeve: 0.11, // a truss length; the coupler sleeve where two lengths are pinned together
  hoist: Object.freeze({ slingRise: 0.22, bodyGap: 0.5, bodyLen: 0.36, bodyR: 0.085, chainR: 0.011 }),
  head: Object.freeze({
    // WASH HEADS (the eight that are room-light emitters): where they hang along each run (metres from the run's middle).
    // Three over each long side of the island and one over each end: every head lights the part of the island it hangs
    // over (CONTRACT 14.2), so no beam has to pass the table light's housing (round A1 aimed them across the table: with
    // real occlusion the housing shaded the stroke room)
    long: Object.freeze([-1.7, 0, 1.7]), short: Object.freeze([0]),
    standOff: 0.2,        // the can's centre stands this far OUTSIDE the truss's outer face
    rise: 0.07,           // ... and this far above the upper chords' centre line
    canLen: 0.32, canR: 0.105, bezelR: 0.115, lensR: 0.098,
    doorLen: 0.1, doorFlare: 0.045, // barn doors beyond the bezel (the keep-out check counts them on every tier)
    // the aim point on the carpet: this far outside the head's own place, on its own side (where a player stands, between
    // the stroke room and the boards) ...
    aimOut: 0.3, aimOutEnd: 0.4,
    // ... and this share of the head's place along its run further out along the run (toward the corners). Round A3:
    // 0.45 -> 0.3. With real beams (the cone below) the aim points of a long side stood 2.47 m apart under heads 1.7 m
    // apart and left a dip between two pools (1.32 against 1.73 units 1 m beside the rail); at 0.3 they stand 2.21 m apart
    // and the row reads 1.6 to 2.0 (scratch/light/ring-field2.mjs of the lane)
    aimFan: 0.3,
    beamHalf: 30,         // half the field angle of a wash head, degrees (the arm keeps the housing outside this cone)
    // ROUND A7 (CONTRACT 19.2: the table is an occluder in the bake, the valance rule of 18.4 is gone; 19.3: the carpet at
    // the legs' feet at most 6 levels over the carpet under the table, the step across the outline under 8 px at V10).
    // As hung until now the six long-side heads stand 0.95 m outside the long outline, 2.84 m over the carpet: under a
    // skirt whose lower edge is 0.64 m up their light reaches 0.29 m: by arithmetic 1.1 units at the feet against 0.27
    // under the table (scratch/light/a7lev.mjs of the lane: the bake's law against the table's triangles). No blade
    // cures that (a ray that passes under the skirt's edge also lights the skirt and the legs). So the LIGHT moves:
    // `over` hangs the six long-side heads OVER the table's long side, each on a boom arm inside the truss (the truss
    // does not move; arena/rig/truss.js draws the arm from the clamp on the INNER upper chord to the yoke):
    // `z` the can's distance from the table's long axis (the outline is at 0.8128: the can stands over the cushion),
    // `long` the places along the run (the corner heads 0.02 m beyond the end outline), `aimZ` the aim point's distance
    // from the long axis on the carpet (`aimZMid`: the middle head's), `fan` as `aimFan`, `throw` how far down its beam
    // the emitter stands (below the truss's lower chords). The emitter then stands 0.02 to 0.07 m INSIDE the outline:
    // nothing of it passes under the skirt (the table role's boxes of the app's table, TABLE-BOXES-A7.md of the lane),
    // and the rail's top edge throws its shadow's edge 1 to 3 cm outside the outline: the table's own mesh.
    // What it costs: a head 2.6 m over the rail would light the rail and the bed's edge in a real hall (a rigger closes
    // its barn door to the rail); the app's bed and rails take no room emitter, so nothing shows (the round's report).
    // `on: false`: the heads hang where they hung.
    over: Object.freeze({ on: true, z: 0.58, long: Object.freeze([-1.45, 0, 1.45]), aimZ: 2.2, aimZMid: 2.0, fan: 0.25, throw: 0.35 }),
  }),
  // (round A7) the re-hung heads as emitters: candela on the axis, the field's half angle, and the radius the bake casts
  // their shadows from: the LENS (0.08 m; `wash.source` 0.3 was round A4's softened pool). `intensity`: a corner head's;
  // `mid`: the middle head's (three bells 1.45 m apart overlap in front of the long rail's middle: at one level the ring
  // 1 m outside the rails ran 1.0 to 1.86 by arithmetic; scratch/light/a7ring.mjs of the lane is the search).
  // (19:59Z, for the final bake: `source` 0.08 -> 0.05, a 10 cm lens. Under the half-way file the step across the
  // table's outline read 8 to 10 px at V10 (30 -> 68 at x = 640); a source of 0.08 m 2.6 m over the rail's edge gives
  // a penumbra of 5 cm on the carpet, 0.05 m gives 3: CONTRACT 19.3 asks for under 8 px.)
  washOver: Object.freeze({ intensity: 16, mid: 11, cone: 40, source: 0.05 }),
  // the heads as emitters of the room light (candela in the app's light units; a look value levelled on the frames: the
  // island's carpet gets a pool that stays far below the bed). After the lead's interim review of round A1: 15 units with a
  // reach of 8.5 m and a beam share of 0.85 put 8.6 units 1 m beside the long rail and 1.5 at the boards, which read
  // 2.3 : 1 on screen (the hall's app frame: 70 against 31 of 255), "one even grey". 20 units, 7.2 m and the whole lobe:
  // 10.9 beside the rail, 6.3 at 2 m, 3.2 at 3 m, 1.1 at the boards, 0.06 in the island's corners, 0.1 beyond the boards
  // (the room light's point law as arithmetic).
  // Round A2 (the heads over their own side, three per long side and one per end, aimed 0.3 m and 0.4 m out): 30 units
  // with a reach of 4.8 m put 9.9 units 1 m outside the long rails and 10.4 outside the end rails (a ring of 64 points
  // there: 9.0 to 10.4, a ratio of 1.16), 6.1 at 3 m from the centre line, 1.4 at the boards, nothing in the island's
  // corners and beyond the boards. (The first A2 numbers, 24 units / 5.6 m / aimed 0.5 m out, put 2.4 at the boards and
  // 5.7 two metres off a corner of the table: in the app's wide view the island was one even grey again, shots/rig/f1a-V10.)
  // Round A3 (the albedo law, CONTRACT 15.2, and a real beam). The island's carpet went from an albedo of 0.0317 to 0.13;
  // the anchor (carpet 1 m beside the long rail at 88 of 255) keeps E x albedo: 12.3 x 0.0317 / 0.13 = 3.0 units there, of
  // which the table lamp's real spill is 0.69, the low key light 0.71 (arena/room.js KEY), ambient and tubes 0.2: the
  // heads carry 1.4 of the 9.91 they put there at 30 units of the old lobe (x 0.14 of A2's light).
  // The beam: each head is a point emitter WITH A CONE now (room/light.js CONE): `intensity` is its candela on the axis
  // (11: E = 11 / d^2 on the axis, 1.36 units straight below a head 2.84 m over the carpet), `cone` its field half angle
  // (36 degrees: nothing outside it; the table light's housing stands 41.7 degrees or more off every axis,
  // test-club-arena-rig.mjs), `bell`: a wash's profile, falling smoothly from the axis to the field angle (a profile
  // light is flat with a short edge instead). The old lobe (2.4 cos^2, a quarter of its peak 70 degrees off the axis)
  // needed a reach of 4.8 m to end at the boards and still lit the housing; the cone ends the light, so the reach is
  // 12 m (no window inside the island). The pool by arithmetic (scratch/light/cone.mjs of the lane; heads + lamp + key
  // + 0.2): about 2.9 units 1 m beside the long rail (87 of 255), 2.4 at 2 m (74), 0.6 at 3 m (21), 1.7 two metres
  // behind an end rail (56), 0.2 in an island corner (6).
  // Round A4 (the house lights at half, CONTRACT 16): the hall's ambient now puts 0.6 units on the open carpet, so the
  // heads come down by what it adds at the anchor (11 -> 8.5 candela: 1.36 -> 1.05 units 1 m beside the long rail), and
  // the pool is softened (the shell's finding in A3: the carpet showed patches with edges): the field goes from 36 to 40
  // degrees (still inside the 41.7 the housing stands off every axis), and the source the BAKE casts a head's shadows
  // from goes from 0.1 to 0.3 m (the table's shadow edge on the carpet from a head 2 m over the rail: 0.08 -> 0.24 m wide).
  // Round A5 (CONTRACT 17.1: the playing floor is the bright zone, a pool of NEUTRAL light with the table's shadow in
  // it). The hall's ambient came down to a half and the low keys to 45 candela (they are what filled the table's shadow
  // in round A4: arena/room.js KEY), so the heads carry the pool: 8.5 -> 15.5 candela (1.05 -> 1.91 units 1 m beside the
  // long rail of the 3.4 there: heads 1.91, keys 0.41, ambient 0.27, the lamp's spill 0.69, bounce 0.1; level 94 of 255
  // on the island's carpet, target 80-95; 2.4 units at 2 m, 1.5 at 3.3 m). The colour: neutral, about 5200 K against the
  // house floods' 3000 K (it was 1.0, 0.93, 0.82: as warm as the floods of that round).
  // (09:36Z: 15.5 -> 14.5: the outer rectangle's 14 profiles are emitters of the bake now and add 0.15 units there)
  // (10:48Z: 14.5 -> 13.8. Under the half-way bake the carpet beside the table read 95 at V10 (900,600), 96.6 in the
  // table role's box (850,520) and 94 to 98 from the broadcast pose: at and over the top of 80-95. The heads carry 1.9
  // of the 3.5 units there: 5 % less of them is 0.1 units, 2 to 3 levels.)
  wash: Object.freeze({ color: [1.0, 0.97, 0.92], intensity: 13.8, radius: 12, source: 0.3, beam: 1.0, throw: 0.6, cone: 40, bell: true }),
  // house lights: lamp radius (m), the share of grid points left dark, the jitter as a share of the pitch
  house: Object.freeze({
    lampR: 0.1, dark: 0.1, jitter: 0.06, margin: 1.3, rigClear: 1.2, seed: 90417,
    // THE LOW RING: where the app's camera cannot be at all (beyond its reach in plan, with `clear` to spare) the lamps hang
    // on a lower grid over the upper seating rows, `h0..h1` above the floor (the top row's floor is 2.55 m up: 2.3 m of head
    // room). The roof field alone (7.6 m and up) is out of every frame the app can take except the far corner in V10; the
    // ring is what stands in the upper third of the wide views (the lead's interim review of round A1).
    ring: Object.freeze({ h0: 4.85, h1: 5.15, clear: 0.45 }),
    // WALL LAMPS: small bulkhead lamps on the hall's walls beside the seating blocks, `h` above the floor, `inset` off the
    // wall, every `pitch`: the only lamps of the hall that a player view can hold (the top edge of the aim and break views
    // is 6 degrees above the horizon: 3.2 m over the floor at the far wall)
    // (`inset`: the hall's drape stands up to 0.12 m off the wall in pleats, and a lamp's quad, 0.2 m to each side and square
    // to the line of sight, must not cut into it from a view 60 degrees off the wall's normal)
    // (round A5, CONTRACT 17.1 and 17.4: `lit: false`: the wall lamps are OFF and the rig builds nothing for them: the
    // walls fall to near black, and a lamp that turns to the camera and lights nothing is not a source. housePlan()
    // still lists their places.)
    wall: Object.freeze({ lit: false, h: 2.7, inset: 0.32, pitch: 1.3, r: 0.06, level: 0.62, start: 0.6, end: 0.9 }),
    cameraClear: 0.3,     // a lamp over a place the camera can be hangs at least this far above the camera's highest point there
  }),
});

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A small seeded generator (LCG): the same sequence on every machine. */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * The four straight runs of the box truss. Each: `id`, `axis` (0 = along x, 2 = along z), `from` / `to` along that axis,
 * `at` (the centre line's position on the other horizontal axis), `inner` (-1 | 1: the sign of the side that faces the
 * table on that other axis).
 */
export function trussRuns(layout = ARENA, rect = null) {
  const { length: L, width: W, section: S } = rect ?? layout.rig;
  const c = S / 2 - RIG.chordR;
  const zl = W / 2 - S / 2, xs = L / 2 - S / 2;
  return [
    { id: 'north', axis: 0, from: -L / 2, to: L / 2, at: -zl, inner: 1 },
    { id: 'south', axis: 0, from: -L / 2, to: L / 2, at: zl, inner: -1 },
    // the short runs stand between the long ones; their chords reach the long runs' inner chords
    { id: 'west', axis: 2, from: -(zl - c), to: zl - c, at: -xs, inner: 1 },
    { id: 'east', axis: 2, from: -(zl - c), to: zl - c, at: xs, inner: -1 },
  ];
}

const runPoint = (run, s, v, y) => (run.axis === 0 ? [r4(s), r4(y), r4(run.at + v)] : [r4(run.at + v), r4(y), r4(s)]);

/**
 * One straight run of box truss as members: four chords, a zigzag lattice on each of the four faces (45 degrees at the
 * default bay), a square end frame at each end, and at every joint of two truss lengths two back-to-back frames with a
 * coupler sleeve on the upper chords (a sleeve on a lower chord would hang below the chords' plane). `y0`: world height of
 * the lower chords' underside; `S`: the section. Members carry `run`, `group` and, for braces, their `face`.
 */
export function latticeRun(run, y0, S, { chordR = RIG.chordR, braceR = RIG.braceR, tieR = RIG.tieR, bay = RIG.bay, segment = RIG.segment, group = 'inner' } = {}) {
  const c = S / 2 - chordR, yb = y0 + chordR, yt = y0 + S - chordR;
  const chords = [], braces = [], ties = [], sleeves = [];
  const corner = { bi: [run.inner * c, yb], bo: [-run.inner * c, yb], ti: [run.inner * c, yt], to: [-run.inner * c, yt] };
  for (const k of Object.keys(corner)) chords.push({ a: runPoint(run, run.from, ...corner[k]), b: runPoint(run, run.to, ...corner[k]), r: chordR, run: run.id, chord: k, group });
  // the lattice: a zigzag between the two chords of each face, the phase shifted on neighbouring faces
  const len = run.to - run.from, n = Math.max(2, Math.round(len / bay));
  const faces = { bottom: ['bo', 'bi', 0], top: ['to', 'ti', 1], inner: ['bi', 'ti', 1], outer: ['bo', 'to', 0] };
  for (const face of Object.keys(faces)) {
    const [ka, kb, phase] = faces[face];
    for (let i = 0; i < n; i++) {
      const even = (i + phase) % 2 === 0;
      const p0 = corner[even ? ka : kb], p1 = corner[even ? kb : ka];
      braces.push({ a: runPoint(run, run.from + (len * i) / n, ...p0), b: runPoint(run, run.from + (len * (i + 1)) / n, ...p1), r: braceR, face, run: run.id, group });
    }
  }
  const frame = (s, list) => { for (const [ka, kb] of [['bi', 'bo'], ['ti', 'to'], ['bi', 'ti'], ['bo', 'to']]) list.push({ a: runPoint(run, s, ...corner[ka]), b: runPoint(run, s, ...corner[kb]), r: tieR, run: run.id, group }); };
  frame(run.from, ties); frame(run.to, ties);
  const joints = Math.max(0, Math.ceil(len / segment - 1e-9) - 1);
  for (let j = 1; j <= joints; j++) {
    const mid = run.from + (len * j) / (joints + 1);
    for (const k of ['ti', 'to']) sleeves.push({ a: runPoint(run, mid - RIG.sleeve / 2, ...corner[k]), b: runPoint(run, mid + RIG.sleeve / 2, ...corner[k]), r: chordR + 0.006, run: run.id, group });
    frame(mid - RIG.sleeve / 2, sleeves); frame(mid + RIG.sleeve / 2, sleeves);
  }
  return { chords, braces, ties, sleeves, c, yb, yt };
}

/** A cable loom along a run at cross offset `v` and height `y`: tied every half metre, sagging a little between ties. */
function loomAlong(run, v, y, r, { pitch = 0.5, sag = 0.006, group = 'inner' } = {}) {
  const out = [], len = run.to - run.from, n = Math.max(2, Math.round(len / pitch));
  for (let i = 0; i < n; i++) {
    const s0 = run.from + 0.1 + ((len - 0.2) * i) / n, s1 = run.from + 0.1 + ((len - 0.2) * (i + 1)) / n, sm = (s0 + s1) / 2;
    out.push({ a: runPoint(run, s0, v, y), b: runPoint(run, sm, v + 0.012 * Math.sign(v || 1), y - sag), r, group });
    out.push({ a: runPoint(run, sm, v + 0.012 * Math.sign(v || 1), y - sag), b: runPoint(run, s1, v, y), r, group });
  }
  return out;
}

/**
 * The rig as plain data for a floor height. Returns
 *   { y0, y1, section, chordOffset, runs, chords: [{ a, b, r, run }], braces: [{ a, b, r, face, run }], ties: [{ a, b, r }],
 *     sleeves: [{ a, b, r }] (couplers at the long runs' joints), cables: [{ a, b, r }] (a loom on the long runs),
 *     hoists: [{ x, z, slingTop, bodyY0, bodyY1, roofY }], heads: [{ id, side, pos, aim, dir, lens, clamp, lowest }],
 *     emitters: [spec], bounds: { min, max } }
 * `braces` carry their `face` ('bottom' | 'top' | 'inner' | 'outer') so a builder can leave a face out on a low tier.
 */
export function rigPlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const rg = layout.rig, S = rg.section, cr = RIG.chordR;
  const y0 = floorY + rg.bottomH, y1 = y0 + S;
  const c = S / 2 - cr;
  const runs = trussRuns(layout);
  const pt = (run, s, v, y) => (run.axis === 0 ? [r4(s), r4(y), r4(run.at + v)] : [r4(run.at + v), r4(y), r4(s)]);
  const chords = [], braces = [], ties = [], sleeves = [], cables = [];
  const yb = y0 + cr, yt = y1 - cr;
  for (const run of runs) {
    const lat = latticeRun(run, y0, S);
    chords.push(...lat.chords); braces.push(...lat.braces); ties.push(...lat.ties); sleeves.push(...lat.sleeves);
    // a cable loom on the inner upper chord of every run (the heads' feeds: the heads hang on the outer one), tied every
    // half metre, sagging between ties
    cables.push(...loomAlong(run, run.inner * c, yt + cr + 0.012, 0.011));
  }
  // hoists at the four corners (over the long runs' ends, on the short runs' centre lines)
  const xs = rg.length / 2 - S / 2, zl = rg.width / 2 - S / 2, H = RIG.hoist;
  const roofY = floorY + hoistTopH(); // the chains end on the roof steel's rigging beams
  const hoists = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const slingTop = y1 + H.slingRise;
    hoists.push({ x: r4(sx * xs), z: r4(sz * zl), slingTop: r4(slingTop), bodyY0: r4(slingTop + H.bodyGap), bodyY1: r4(slingTop + H.bodyGap + H.bodyLen), roofY: r4(roofY) });
  }
  // wash heads: on the OUTER upper chord of every run, the can outside the truss, aimed down and outward at its own side
  const hd = RIG.head;
  const heads = [];
  for (const run of runs) {
    // (round A7: `over`: a long run's heads hang over the table's long side, inside the truss: RIG.head.over)
    const over = hd.over?.on === true && run.axis === 0 ? hd.over : null;
    const places = over ? over.long : run.axis === 0 ? hd.long : hd.short, out = -run.inner;
    for (let i = 0; i < places.length; i++) {
      const s = places[i], v = over ? out * (over.z - Math.abs(run.at)) : out * (S / 2 + hd.standOff);
      const pos = pt(run, s, v, yt + hd.rise);
      const aim = over ? pt(run, s * (1 + over.fan), out * ((s === 0 ? over.aimZMid : over.aimZ) - Math.abs(run.at)), floorY)
        : pt(run, s * (1 + hd.aimFan), v + out * (run.axis === 0 ? hd.aimOut : hd.aimOutEnd), floorY);
      const dir = norm(sub(aim, pos)).map(r4);
      const lens = pos.map((q, k) => r4(q + dir[k] * (hd.canLen / 2 - 0.015)));
      // the lowest point of the can and of its barn doors (a cylinder end: the centre line's end minus the rim's drop)
      const side = Math.sqrt(Math.max(0, 1 - dir[1] * dir[1]));
      const lowCan = pos[1] + dir[1] * (hd.canLen / 2) - hd.bezelR * side;
      const lowDoor = pos[1] + dir[1] * (hd.canLen / 2 + hd.doorLen) - (hd.bezelR + hd.doorFlare) * side;
      heads.push({
        id: `${run.id[0]}${i}`, side: run.id, kind: 'wash', pos, aim, dir, lens, ...(over ? { over: true, mid: s === 0 } : {}),
        clamp: pt(run, s, (over ? -out : out) * c, yt),
        lowest: r4(Math.min(lowCan, lowDoor)),
      });
    }
  }
  // The heads as emitters of the room light. The service's point emitter is a broad lobe around an axis, not a cone, and a
  // head's own truss and the run across from it stand centimetres to two metres from the lens: registered AT the lens, every
  // head would flood the truss white. So each emitter stands `throw` metres down its beam (below every member of the rig)
  // and lights only what is below it (`normal` = straight down: the service's half space), with its lobe along the beam.
  const w = RIG.wash;
  // (round A6: a level per side of the truss, should the table keys' plan hold one (HALL.tableKeys.heads); it holds
  // none since the trial bake of 12:58Z: every head stands at the wash's level)
  const sideLevel = (h) => (HALL.tableKeys.on === true && Number.isFinite(HALL.tableKeys.heads?.[h.id[0]]) ? HALL.tableKeys.heads[h.id[0]] : w.intensity);
  const wo = RIG.washOver;
  const emitters = heads.map((h) => ({
    id: `rig.head.${h.id}`, type: 'point', position: h.lens.map((v, k) => r4(v + h.dir[k] * (h.over ? hd.over.throw : w.throw))), normal: [0, -1, 0], axis: h.dir.slice(),
    size: [h.over ? wo.source : w.source, w.beam], color: w.color.slice(), intensity: h.over ? (h.mid ? wo.mid : wo.intensity) : sideLevel(h), radius: w.radius, cone: h.over ? wo.cone : w.cone, bell: w.bell === true,
  }));
  // everything floor-fixed, as one box (the chains reach the roof)
  const lowest = Math.min(y0, ...heads.map((h) => h.lowest));
  const reach = hd.standOff + hd.canLen; // the heads stand outside the rectangle
  const bounds = { min: [r4(-rg.length / 2 - reach), r4(lowest), r4(-rg.width / 2 - reach)], max: [r4(rg.length / 2 + reach), r4(roofY), r4(rg.width / 2 + reach)] };
  return { y0: r4(y0), y1: r4(y1), section: S, chordOffset: r4(c), runs, chords, braces, ties, sleeves, cables, hoists, heads, emitters, bounds };
}

// a segment against an axis-aligned box (slab test): true when they meet
function segmentHitsBox(a, b, box) {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) { if (a[k] < box.min[k] || a[k] > box.max[k]) return false; continue; }
    let u0 = (box.min[k] - a[k]) / d, u1 = (box.max[k] - a[k]) / d;
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The wash heads against the table light's housing (round A2: no head's beam has to pass the housing). `box`: the housing's
 * body as { min: [x, y, z], max } in world metres (arena/rig/housing.js `boxes[0]`); `floorY`: the floor's world height;
 * `island`: the layout's island rectangle. Per head:
 *   `angle`   the smallest angle (degrees) between the beam's axis and a direction from the lens to any point of the box;
 *   `margin`  that angle minus the head's half field angle (RIG.head.beamHalf): positive = the whole beam misses the box;
 *   `axisHits` the axis from the lens to its aim point crosses the box;
 *   `own`     of the floor points of the head's own side of the island (a 0.25 m grid between the table's keep-out line
 *             and the island's edge, inside the beam), how many the emitter point reaches past the box, and how many it does not.
 * Returns { ok, heads: [{ id, angle, margin, axisHits, own: { lit, shaded } }], minMargin }.
 */
export function beamsAgainstHousing(plan, box, { floorY = -0.79, island = ARENA.island, half = RIG.head.beamHalf } = {}) {
  const cosHalf = Math.cos((half * Math.PI) / 180);
  const out = [];
  let minMargin = Infinity;
  const N = 8;
  for (const h of plan.heads) {
    let best = -1;
    // the box's surface on a grid (the nearest direction of a convex body lies on its surface)
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
      if (i > 0 && i < N && j > 0 && j < N && k > 0 && k < N) continue;
      const q = [box.min[0] + ((box.max[0] - box.min[0]) * i) / N, box.min[1] + ((box.max[1] - box.min[1]) * j) / N, box.min[2] + ((box.max[2] - box.min[2]) * k) / N];
      const d = norm(sub(q, h.lens));
      best = Math.max(best, d[0] * h.dir[0] + d[1] * h.dir[1] + d[2] * h.dir[2]);
    }
    const angle = (Math.acos(Math.min(1, Math.max(-1, best))) * 180) / Math.PI;
    const e = plan.emitters.find((x) => x.id === `rig.head.${h.id}`);
    const own = { lit: 0, shaded: 0 };
    if (e) {
      for (let x = island.x0 + 0.125; x < island.x1; x += 0.25) for (let z = island.z0 + 0.125; z < island.z1; z += 0.25) {
        const d = norm(sub([x, floorY, z], h.lens));
        if (d[0] * h.dir[0] + d[1] * h.dir[1] + d[2] * h.dir[2] < cosHalf) continue; // outside this head's beam
        if (segmentHitsBox(e.position, [x, floorY, z], box)) own.shaded += 1; else own.lit += 1;
      }
    }
    const rec = { id: h.id, angle: r4(angle), margin: r4(angle - half), axisHits: segmentHitsBox(h.lens, h.aim, box), own, emitter: !!e };
    minMargin = Math.min(minMargin, rec.margin);
    out.push(rec);
  }
  // (a head that is no emitter lights nothing: only its cone and its axis are judged)
  return { ok: out.every((r) => r.margin > 0 && !r.axisHits && (!r.emitter || (r.own.shaded === 0 && r.own.lit > 0))), heads: out, minMargin: r4(minMargin) };
}

/** FNV-1a over a string, as 8 hex digits (a short signature of plain data). */
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * What a bake of the room depends on in this part (CONTRACT 14.2): a short string that moves when the rig's geometry or its
 * emitters' places move, and with nothing else (levels and colours are not in it; the detail level is the room's own part
 * of its signature). Computed on the pool table's floor seat, so it is one value on every table class.
 */
export function rigSignature(layout = ARENA) {
  const p = rigPlan(layout, { floorY: -0.79 });
  const seg = (list) => (list ?? []).map((m) => [...m.a, ...m.b, m.r]);
  const value = {
    rig: 2, truss: [layout.rig.length, layout.rig.width, layout.rig.section, layout.rig.bottomH],
    chords: seg(p.chords), hoists: p.hoists.map((x) => [x.x, x.z, x.roofY]),
    heads: p.heads.map((x) => [x.id, ...x.pos, ...x.dir]),
    emitters: p.emitters.map((e) => [e.id, ...e.position, ...e.axis, e.radius, ...(Number.isFinite(e.cone) ? [e.cone, e.bell ? 1 : 0] : [])]).concat([['lamp.band']]),
  };
  // round A2's members: the outer rectangle with its heads, the perimeter truss, the roof steel, the fixtures, the screens
  const o = outerPlan(layout, { floorY: -0.79 }), rf = roofPlan(layout, { floorY: -0.79 });
  const box = (list) => list.map((m) => [...m.a, ...m.b, m.w, m.h]);
  value.outer = { chords: seg(o.chords), hoists: o.hoists.map((x) => [x.x, x.z, x.roofY]), heads: o.heads.map((x) => [x.id, ...x.pos, ...x.dir]), emitters: o.emitters.map((e) => [e.id, ...e.position, ...e.axis, e.radius, e.cone, ...(e.shutter ?? []), ...(e.foot ?? []), ...(e.sides ? e.sides.flat() : [])]) };
  value.perimeter = { chords: seg(rf.perimeter.chords), wires: rf.perimeter.wires.length };
  value.roof = { trusses: rf.trusses.map((t) => [t.x, ...box(t.chords), t.webs.length]), purlins: box(rf.purlins), rigBeams: box(rf.rigBeams), stubs: rf.stubs.length };
  value.fixtures = rf.fixtures.map((f) => [f.kind, f.x, f.y, f.z]);
  value.screens = rf.screens.map((s) => [...s.c, s.w, s.h, s.axis]);
  // round A4's members: the house floods (fixtures and emitters) and the key lights' fixtures
  const fl = floodPlan(layout, { floorY: -0.79 }), ky = keyPlan(layout, { floorY: -0.79 });
  value.floods = { at: fl.floods.map((f) => [f.id, ...f.pos, ...f.dir, f.top]), emitters: fl.emitters.map((e) => [e.id, ...e.position, ...e.axis, e.radius, e.cone]) };
  value.keys = ky.heads.map((h) => [h.id, ...h.pos, ...h.dir]);
  const ww = wallWashPlan(layout, { floorY: -0.79 });
  value.wallwash = { runs: ww.runs.map((r) => [r.id, r.from, r.to, r.at, r.y, r.battens.length]), emitters: ww.emitters.map((e) => [e.id, ...e.position, ...e.axis, ...(e.normal ?? []), ...e.size, e.radius]) };
  if (ww.floods?.length) value.drapeWash = ww.floods.map((f) => [f.id, ...f.pos, ...f.dir, f.top]);
  return `rig2.${hash32(JSON.stringify(value))}`;
}

/**
 * The highest point (above the floor) the app's camera can reach within `pad` metres (in x and in z) of the floor point
 * (x, z); -Infinity where it cannot come that near. A layout without the camera's numbers answers with the top of its
 * camera volume inside that volume's rectangle.
 */
export function cameraTopNear(x, z, layout = ARENA, pad = 0) {
  if (layout.camera?.radius && layout.camera?.target) {
    // the point of the pad square nearest the table (the reach is a dome around the target area: highest toward it)
    const nx = x - Math.sign(x) * Math.min(pad, Math.abs(x)), nz = z - Math.sign(z) * Math.min(pad, Math.abs(z));
    return cameraCeil(nx, nz, layout);
  }
  const v = layout.keepOut.cameraVolume;
  return x > v.x0 - pad && x < v.x1 + pad && z > v.z0 - pad && z < v.z1 + pad ? v.h1 : -Infinity;
}

/**
 * The house lights: one record per lamp, `{ x, y, z, level, r, kind }` (world metres; `level` 0.55..1 of the field's
 * radiance; `r` the lamp's radius; `kind` 'roof' | 'ring' | 'wall').
 *   roof  rows along x at the layout's pitch, `h0..h1` above the floor; a row keeps ONE height (lamps on a catwalk),
 *         neighbouring rows differ; every lamp is jittered a little and a share of the grid is dark, so the field does not
 *         read as a drawn lattice. Nothing hangs over the rig's own footprint (its chains go up there).
 *   ring  the same grid where the camera cannot be: those lamps hang low over the upper seating (RIG.house.ring).
 *   wall  small lamps on the east, north and south walls beside the seating blocks (RIG.house.wall): not on the seeded
 *         draw (a wall's lamps are evenly spaced), all lit.
 */
export function housePlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const hall = layout.hall, K = RIG.house;
  const out = [];
  // ---- wall lamps
  {
    const W = K.wall, y = r4(floorY + W.h);
    const blocks = layout.seating?.blocks ?? [];
    const span = (side) => { const b = blocks.find((q) => q.side === side); return b ? [b.from, b.to] : null; };
    const run = (from, to, put) => { for (let v = from; to > from ? v <= to + 1e-9 : v >= to - 1e-9; v += to > from ? W.pitch : -W.pitch) put(r4(v)); };
    const lamp = (x, z, wall) => out.push({ x: r4(x), y, z: r4(z), level: W.level, r: W.r, kind: 'wall', wall });
    const east = span('east');
    if (east) {
      // the east wall, to both sides of the east block
      run(east[1] + W.start, hall.z1 - W.end, (z) => lamp(hall.x1 - W.inset, z, 'east'));
      run(east[0] - W.start, hall.z0 + W.end, (z) => lamp(hall.x1 - W.inset, z, 'east'));
    }
    for (const [side, zWall] of [['north', hall.z0 + W.inset], ['south', hall.z1 - W.inset]]) {
      const s = span(side);
      if (!s) continue;
      // beside the block, toward the east wall and toward the backdrop
      run(s[1] + W.start, hall.x1 - W.end - W.pitch, (x) => lamp(x, zWall, side));
      run(s[0] - W.start, hall.x0 + W.end, (x) => lamp(x, zWall, side));
    }
  }
  // ---- the lamps that hang in fixtures on the roof steel (roof) and under the perimeter truss (ring): roofPlan() places them
  for (const f of roofPlan(layout, { floorY }).fixtures) out.push({ x: f.x, y: f.y, z: f.z, level: f.level, r: K.lampR, kind: f.kind });
  return out;
}

// =====================================================================================================================
// Round A2: what a real hall has overhead besides one rectangle (the lane's reference notes 1 and 4): a second truss level
// around the first, a heavier truss over the upper seating, roof steel with the house lights in fixtures on it.
export const HALL = Object.freeze({
  // THE OUTER RECTANGLE: a second box truss around the first, its lower chords `lift` above the first one's upper chords.
  // Profile heads hang inside it (aimed at the stroke room of their own side), a few colour washes outside it (aimed out
  // at the boards and the first rows). None of them is a room-light emitter: what the camera sees of them is their lens.
  outer: Object.freeze({
    length: 8.4, width: 5.6, section: 0.29, lift: 0.09,
    // Round A5 (CONTRACT 17.4: a lit fixture is a source; one that shows a lit lens lights something). Until now the 14
    // profiles showed a lit lens and a haze cone and were no emitter anywhere. `emit`: each is an emitter of the BAKE
    // (`rig.profile.<head>`; the 24 run-time slots are taken): a bell of 13 degrees along the head's own axis (the cone
    // the arm keeps clear of the table light's housing), `intensity` candela, standing `off` metres down its beam,
    // shadows cast from a `source` of 0.12 m. Steep (70 degrees and more below the horizon) and close to the table: 5
    // candela put 0.33 units on the axis 3.9 m below, about 0.45 along the stroke room where two pools overlap, 0.15
    // one metre beside the long rail, and reach 0.15 m under the skirt: they sharpen the table's shadow, they do not
    // fill it. The analytic frame carries them in the lamp pool's analytic gain (layout.js LIGHT).
    profiles: Object.freeze({ long: Object.freeze([-3.1, -1.55, 0, 1.55, 3.1]), short: Object.freeze([-1.4, 1.4]), aimLong: 1.35, aimShort: 2.0,
      // (ROUND A7, after the half-way bake: `blade`. The table's shadow comes from its mesh alone now, and a profile's
      // light passes UNDER the skirt's foot from 38 degrees off the vertical: 0.15 to 0.21 units on the carpet at three of
      // the lead's five feet boxes, which read 30 to 32 against 21 to 24 under the cabinet (CONTRACT 19.3: at most 6
      // over). A profile is a framing spot: each gets ONE shutter blade, the plane through its emitter and the line on
      // the carpet `out` metres outside the table's outline on the side its run faces (north, south, west, east); the
      // light reaches the side away from the table. Its pool on the playing floor ends at the outline; the table's
      // body takes its light from the keys and the fills.)
      emit: Object.freeze({ intensity: 5, cone: 13, radius: 9, source: 0.12, off: 0.3, color: Object.freeze([1.0, 0.97, 0.92]), blade: Object.freeze({ on: true, out: 0.03 }) }) }),
    // (round A3: the colour washes are aimed at the LOWER ROWS, `throw` metres outside their run and `aimH` over the floor:
    // 23 degrees below the horizon. Until then they pointed 55 degrees down at the walkway behind the boards, showed a lit
    // lens and a haze beam, and lit nothing. As emitters of the BAKE (`emit`, outerPlan().emitters): a flood with a bell
    // profile, field half angle `cone`, `intensity` candela on the axis, standing `off` metres down its beam (clear of its
    // barn doors). By arithmetic (scratch/light/cw.mjs of the lane, no occlusion), at 14 candela and 40 degrees: 0.34 to
    // 0.70 units on the backs of rows 1 to 3 of the block it faces (the backs lean 12 degrees and look at the island; the
    // house panels overhead reach them from behind: 0.14 units in the first A3 bake), 0.2 to 0.5 on their pans, 0.3 on
    // row 5, nothing on the aisle under each long side's middle, nothing on the island's carpet and nothing on the boards'
    // inner faces (both lie more than 40 degrees under the axis). On the graphite fabric (0.09) 0.7 units is 17 of 255.
    // The west one faces the backdrop: 0.5 units on its middle, 1.5 m up.)
    // Round A4 (CONTRACT 16.1: no coloured wash on the seating): these six heads are ON STANDBY. They hang where they
    // hung, their lenses are dark glass (`standby`: the lens material's vertex colour), they are no emitters of the bake
    // any more (`emit: null`) and they get no haze cone. The lower rows are lit by the house floods (HALL.floods).
    colours: Object.freeze({ long: Object.freeze([-2.35, 2.35]), short: Object.freeze([0]), throw: 4.4, aimH: 1.65, emit: null, standby: Object.freeze([0.0036, 0.0038, 0.0044]) }),
  }),
  // THE HOUSE FLOODS (round A4: "before the session, house lights at half"). Six floodlights on drop pipes under the roof
  // steel, `h` over the floor, just inside the boards' line, aimed OUT at the seating: two per block.
  //   north / south  under the two roof trusses that cross the island (roofPlan: x = -2.4 and 2.8), `inside` metres inside
  //                  the boards (z = -/+3.6); the pipe drops from the truss's bottom chord;
  //   east           under the two outer rigging beams (z = -/+2.655), `inside` metres inside the east boards (x = 4.9).
  // Why there. A seat's visible faces (its back, its tipped-up pan) look at the island and lean 12 degrees: a downlight
  // over a block gives them a quarter of what it gives the deck (round A3: pans 1.05 to 1.35 units, faces 0.23 to 0.51,
  // the first row at 11 to 24 of 255). Light that travels outward from above the boards' line meets them nearly square.
  // 5.8 m: high enough that a row does not shade the next, low enough that row 1 (2.5 m out, 4.6 m down) still gets as
  // much as row 4. Each is aimed at the middle of its half block `aimH` up (`aimOut` beyond the island's edge; along the
  // block `fan` times its own place), 38 degrees below the horizon. `cone` 45 degrees, a FLAT field with a soft edge
  // (room/light.js CONE, the profile: a floodlight; a wash's bell leaves row 1 at a third of row 4): the lower edge lands
  // on the walkway behind the boards (the boards' foot is 46 degrees off the axis: nothing on the island's carpet), the
  // upper edge is 7 degrees over the horizon (the drape is lit up to about 6 m).
  // Level, by arithmetic (scratch/light/a4.mjs of the lane; no occlusion): at 90 candela a seat's face gets 1.7 to 2.6
  // units in rows 1 to 4 and 1.0 to 1.7 in row 8; with the hall's ambient on a vertical face (1.0 x the open share)
  // the front rows stand at 2.7 to 3.2 units (55-70 of 255 on the graphite fabric) and the top rows at 2.0 to 2.4
  // (40-55): CONTRACT 16.2. The drape behind a block's middle takes 1.6 units at 3 m, a camera body in a corner 1.2 to 1.6.
  // They are emitters of the room light AT RUN TIME and in the bake (`house.<side><n>`; arena/room.js registers them and
  // owns their level: HOUSE), so the frame without the light map is lit by the same six sources as the frame with it.
  // `source`: the radius the bake casts their shadows from (a flood's face is 0.44 x 0.30 m); `off`: the emitter stands
  // this far down the beam from the face (clear of the fixture's own frame).
  // ROUND A5 (CONTRACT 17.1: the stands in warmer, dimmer, DIRECTED light that falls off upward; walls and drape near
  // black). The same six fixtures, re-aimed and re-lamped:
  //   aim      at rows 2 to 3 (`aimOut` 3.5 m beyond the island's edge, `aimH` 1.7 m up): 44 degrees below the horizon
  //            (round A4: 38, at the block's middle);
  //   cone     40 degrees (round A4: 45), flat to 0.64 of it and soft from there: rows 1 to 4 stand in the flat field,
  //            the top row in the soft edge, the field's upper edge 4 degrees UNDER the horizon: nothing of a flood
  //            lands on the drape above 4.5 m (round A4's field ran 7 degrees over the horizon and lit it to 6 m);
  //   colour   warm white, about 3000 K seen by a camera balanced on the rig's neutral light: (1.0, 0.76, 0.50). The
  //            candela are written for that colour: 145 is 115 by luminance (x 0.792).
  // By arithmetic (scratch/light/a4.mjs of the lane, luminance candela 115, no occlusion), on a seat's face: row 1 2.1
  // to 2.6 units, rows 2 to 4 2.2 to 2.85, row 6 1.8 to 2.0, row 8 1.0 to 1.2 (round A4: 1.3 to 1.75 there): with the
  // ambient's 0.4 the front rows stand at 58 to 69 of 255 on a fabric of 0.09 and the top rows at 34 to 40 (CONTRACT
  // 17.2: 50-70 and 28-45); the drape behind a block's middle takes 0.6 units at 3 m and nothing at 5 m.
  // THE LEVEL FOLLOWS THE SEAT FABRIC (17.2 is reached by light, never by albedo): 145 for 0.09; x (0.09 / albedo) x
  // 0.94 for another fabric (the ambient's share does not scale).
  floods: Object.freeze({
    h: 5.8, inside: 0.7, aimOut: 3.5, aimH: 1.7, fan: 1.3, eastAimZ: 3.0,
    // (levels after the first A4 trial bake, 06:06Z, read on the bake page's V10: at 90 candela the north rows stood at
    // 47 to 49 of 255 in the app's terms and the east rows at 56 to 63: the north and south blocks are 11.2 m wide for
    // two floods, the east block 8.6 m. So north and south 115, east 90: front rows about 60, top rows about 50.
    // The half-way bake of 06:29Z, read from its record: north backs 2.0 to 2.4 units in row 1, 3.2 to 3.4 in rows 2
    // and 3, 2.0 in row 8; east 1.8, 2.6 and 1.9: the east block stood a tenth under the north one, so east 100.)
    // (round A5: 115 / 100 at (1.0, 0.94, 0.85) and 45 degrees -> 145 / 126 at (1.0, 0.76, 0.50) and 40 degrees; the
    // east block keeps its 0.87 of the north's: it is 8.6 m wide for two floods, the north and south blocks 11.2 m)
    // (09:33Z: THE SEATS ARE OCHRE, albedo 0.18 (the surround's SEAT-COLOUR.md of 09:26Z). The level follows the fabric:
    // 145 x (0.09 / 0.18) x 1.05 = 76, east 66. The first analytic frame on the ochre at 145 (shots/light/q2-V10.jpg)
    // read the north rows at 90 (front) and 46 (top), the east rows at 97 and 63: at 76 the front rows come to about 64
    // and the top rows to 33 to 45 before the bake's row-on-row shading.)
    // (round A6: 76 / 66 -> 80 / 70: the ambient's side row came down by 0.14 units on a vertical face (layout.js
    // LIGHT), a tenth of a unit on a seat's back; a twentieth more from the floods holds the front rows where they stood)
    cone: 40, radius: 30, source: 0.22, off: 0.3, intensity: 80, eastIntensity: 70, color: Object.freeze([1.0, 0.76, 0.50]),
    body: Object.freeze({ w: 0.44, h: 0.30, d: 0.12 }), pipeR: 0.024, yoke: 0.24,
  }),
  // THE KEY LIGHTS' FIXTURES (round A4: every emitter stands at a visible fixture of the right kind). Three profile
  // spots under the perimeter truss's inner lower chord, beside the can the key was said to stand at (`along`: the place
  // along the run; a spot hangs `beside` metres from the can's axis along the run and `drop` under the chord's centre),
  // each aimed across the table at the carpet `past` metres beyond the table's middle. The emitters' levels and cones are
  // arena/room.js KEY; their places are these lenses. (Round A3's fourth key, on the backdrop's top edge, had no fixture
  // and is gone.)
  // Round A5: the north and the south key moved 1.26 m east along their runs (-0.6275 -> 0.63: half a metre WEST of the
  // can at x = 1.63, clear of the screen that starts at x = 2.1). At x = -0.13 the north key's lit lens sat exactly in
  // the top-left corner of the wide review pose V10 (pixel (0..9, 0..9): the "bright patch of about 10 px" of round
  // A4's sheet, traced by projection: the pose's corner ray meets the plane 4.9 m over the floor at (-0.05, -9.77)):
  // a source cut by the frame's corner. At x = 1.13 it stands whole in that frame, about (108, 26).
  keys: Object.freeze({ north: 0.63, south: 0.63, east: -2.2912, beside: 0.5, drop: 0.2, past: 1.5, off: 0.3 }),
  // THE WALL WASHERS (round A4; the shell's ask of 06:26Z: the upper drape and the corners). A line of LED battens on the
  // OUTER upper chord of each run of the perimeter truss (north, south, east), facing the wall 2.2 to 2.7 m away: a
  // batten `len` long every `len + gap`, its lit face toward the wall, tipped by `tilt` (the y of its normal over the
  // horizontal part: negative = down). From 5.585 m up and that far off, the wall takes nearly the same light from 4 m
  // to 6.5 m (a washer at the roof, 0.8 m off the wall, would put five times more on the wall's head than at 4 m).
  // As ONE emitter of the bake per run (`house.wall.<side>`): a tube along the battens' line, one-sided (the room
  // light's arena tube with a normal: a cosine lobe around it), `perMetre` candela per metre. By the tube's law (the
  // rig's arm computes it), at 3.2 cd/m tipped 14 degrees down: 1.5 units on the drape at 6.5 m, 2.1 at 5 m, 1.3 at
  // 4 m, 0.7 at 3 m (tipped 6 degrees UP, the half-way bake of 06:29Z: 1.8, 1.9, 1.1, 0.5: too little under 4 m);
  // about 1.3 in the two east corners (two runs meet there), 0.4 to 0.8 on the walls' west ends; 0.8 on the top rows'
  // pans and faces (they stand between the truss and the wall); nothing on the backdrop (it lies on the lobe's dark
  // side) and nothing on the island. BAKE ONLY (arena/room.js hands them over).
  // ROUND A5 (CONTRACT 17.1: the walls and the drape above and behind the stands fall to near black): THE WALL WASHERS
  // ARE GONE (`on: false`). No emitter, no batten: wallWashPlan() returns empty lists, the rig builds nothing for them,
  // the bake holds none. They put 0.7 to 2.3 units on the drape from 3 m to 6.5 m and held every wall at 29 to 35 of
  // 255; none of the lane's hall photographs shows a washed black drape. The numbers stay as the record of what they were.
  // ROUND A7 (CONTRACT 19.3: the drape's lower third at 12 to 25 of 255 on EVERY tier; round A6: 10 on the cloth on
  // high, 7 to 9 on base and lite; the upper half stays 5 to 14). The visible lower third is the band from the top
  // row's backs (3.5 m over the floor) to 4.5 m; the house floods' field ends there (0.2 to 0.5 units) and the shell's
  // floor battens stand behind the blocks. A COVE LINE behind the top row of each block: LED battens on the top deck's
  // rear edge (`off` metres behind it, `h` over the deck), lit face to the cloth, as ONE one-sided tube of the bake per
  // block (`house.cove.<block>`, `perMetre` candela a metre, its lobe up the cloth: `tilt` = the y of its normal over
  // the horizontal part). Grazing, by arithmetic: 2 k a / (a^2 + h^2) on the cloth h over the line and a in front of it
  // (a about 0.15 m): at 5 candela a metre 1.75 units at 3.5 m, 1.0 at 3.8 m, 0.4 at 4.5 m, 0.18 at 5.5 m, 0.1 at 6.5 m.
  // BAKE ONLY, every tier (the lite tier reads its own map). wallWashPlan() hands the runs and emitters on;
  // arena/rig/steel.js builds the battens. `on: false`: nothing is planned, built or baked.
  // (18:58Z: NOT SWITCHED IN. The shell cast the lead's boxes through V10 (its note of 18:11Z): the "lower third" boxes
  // are the hall's two EAST CORNERS, 3 to 4 m past a block's end and 4.3 to 4.7 m up; the "upper half" boxes, which
  // must stay at 5 to 14, are the cloth BEHIND the blocks at the same height. A line behind the blocks lifts the wrong
  // boxes. The plan stays for a hall that wants it; `ext` runs it on to the east corners.)
  cove: Object.freeze({ on: false, perMetre: 5, off: 0.09, h: 0.08, tilt: 3, radius: 6, inset: 0.4, ext: false, corner: 0.6 }),
  // ROUND A7, THE DRAPE WASH (CONTRACT 19.3: the drape's lower third at 12 to 25 on every tier): one more house flood
  // beside each east flood on its rigging beam (`shift` east of it, kept `end` short of the beam's end), aimed into
  // its corner of the hall (`aimIn` inside each wall, `aimH` over the floor) with a narrower field (`cone`), so the
  // blocks' ends stay the house floods'. By arithmetic 11 m out and 15 to 20 degrees off its axis: 0.0054 units a
  // candela on the cloth at the lead's two boxes; 165 candela of the house colour (130 by luminance) put 0.7 units over
  // the 0.4 that stand there (level 9 -> about 17 before the haze). BAKE ONLY on every tier (`house.drape.<id>`); the
  // fixture is a flood of arena/rig/steel.js. `on: false`: nothing is planned, built or baked.
  drapeWash: Object.freeze({ on: true, intensity: 165, cone: 30, shift: 0.7, end: 0.25, aimIn: 2.2, aimH: 4.4, radius: 30 }),
  wallwash: Object.freeze({ on: false, perMetre: 3.2, tilt: -0.25, radius: 12, tube: 0.03, clear: 0.05, color: Object.freeze([1.0, 0.94, 0.85]), batten: Object.freeze({ len: 1.0, gap: 0.22, w: 0.07, h: 0.09 }) }),
  // THE TABLE KEYS (round A6, CONTRACT 18.1: the table's shadow with an edge, its near legs' lit faces at 26 to 40 of
  // 255; the lead's note: "a black block on black legs with a soft pool and no contact edge"). Round A5 lit the island
  // from all round (eight steep heads, each side from its own side) and from three far keys at 25 degrees: no direction,
  // and a leg's face stood in under one unit. Now the island has ONE dominant direction, the SOUTH-WEST (the side of
  // the wide, standing and broadcast poses), and its mirror at a half from the north-east; everything else is a fill.
  // FOUR OF THE OUTER RECTANGLE'S FOURTEEN PROFILE SPOTS become the keys (`head`: the profile's id; no fixture is
  // added). `out`: the spot hangs on the OUTSIDE of its run (a ray from z = 3.1 passes under the south skirt, 0.635 m
  // over the carpet, and reaches the far leg's inner face; from the inside, z = 2.34, the skirt stops it). `aim`: the
  // point of the table's body it is aimed at, WORLD metres (the bed plane is y = 0). Elevation at the faces: 36 to 55
  // degrees. `rail`: the rail it is SHUTTERED to: a profile's blade, imaged by its lens: nothing of its beam passes
  // above the plane through its lens and the top outer edge of that rail (`edge`: the rails' half extents and the top's
  // world height, `drop` under it for the blade's own edge): the beam ends on the rail's edge, off the bed, the balls
  // and the rail across. A blade cannot follow two rails (the lit region would not be convex): hence two keys per
  // corner, one per side of the table, as a rigger hangs them. `intensity`: candela on the axis; `cone`: a profile's
  // flat field, half angle; `source`: the lens's radius (what the bake casts a shadow's edge from: 0.03 m of penumbra
  // under the cabinet). Arithmetic: scratch/light/a6lev.mjs and LEVELS-A6.md of the lane; arena/room.js hands them to
  // the bake as `key.<id>` (BAKE ONLY: the table's body reads the records, mat/wood.js).
  tableKeys: Object.freeze({
    on: true,
    // (13:10Z, after the trial bake `t1` of 12:58Z, read from its record. With ONE blade and 62 / 45 / 31 / 22 candela
    // the keys also lit the carpet beside the table: 4.4 units 1 m beside the long rail (113 of 255; the pool's cap is
    // 95) inside their ovals, and with the heads turned down for it 1.0 unit from 2 m out (the boards' foot at 36).
    // A face at 45 degrees takes what the carpet takes: a key strong enough for the legs is too strong for the pool.
    // So each key gets a SECOND BLADE, at the table's foot (`foot`: the line on the carpet `foot.out` metres outside
    // the outline, out of focus: tableKeyFoot): the key lights the body and the carpet under the skirt and fades out
    // over the half metre in front of the table; the pool is the heads' again, as in round A5. The keys go UP.)
    // (levels by the bake's own law, scratch/light/a6gate.mjs of the lane, and the table role's answer per unit (level
    // = 14 + 9.3 x E on a lit face, 0.5 units of other light on a leg): the long side's key 60 candela, flat: 1.3 to
    // 1.6 units on the south apron, 1.25 on the south-east leg's inner face; the end's key 50 candela as a BELL aimed
    // at the far leg (`bell`: the near corner leg takes both keys and would stand over the row's 40 under a flat field):
    // 1.3 on the north-west leg's west face, 2.3 in all on the south-west leg's. The north-east pair at a half.)
    keys: Object.freeze([
      // (14:04Z, after the half-way bake: each key hangs SQUARE to its side of the table, at the middle of its run (`at`:
      // metres along the run), a flat field, framed by two side blades at its legs (`legs` below). From the corners
      // (`sp0` at x = -3.1, `wp1` at z = 1.4, 60 / 50 bell / 30 / 25 bell) the south key left the south-east leg at
      // 11 of 255 (the skirt shades its west face; 0.65 units on its south face) and each wedge ran on past the
      // corners. Now by the bake's law: the south legs' south faces 1.76 units each, the west legs' west faces 1.49,
      // the long apron 2.4 to 2.7, the head apron 2.0. `cone` 37: the long side spans 22 degrees each way at 3.6 m.)
      // (14:12Z, the trial `t3`: at 56 / 28 candela the south and north keys, 61 degrees over the horizon, put 3.8
      // units on the carpet at the outline against 2.4 beside it: 46 / 23: the legs' south faces 1.44, the apron 2.0
      // to 2.25. 14:53Z, the final frame of 14:41Z: the carpet at the south outline 98 of 255 (the band ends at 95):
      // 42 / 21.)
      // (ROUND A7, 19:52Z, the table role's row after the half-way bake: the long apron read 40.0 against A6's 41.6 (the
      // re-hung heads no longer graze it; the side row came down): the south key 42 -> 50, its twin in the north 21 -> 25.)
      Object.freeze({ id: 'sw.s', head: 'sp2', out: true, aim: Object.freeze([0.0, -0.32, 0.75]), rail: 'south', intensity: 50, cone: 37 }),
      Object.freeze({ id: 'sw.w', head: 'wp1', at: 0, out: false, aim: Object.freeze([-1.35, -0.42, 0.0]), rail: 'west', intensity: 42 }),
      Object.freeze({ id: 'ne.n', head: 'np2', out: true, aim: Object.freeze([0.0, -0.32, -0.75]), rail: 'north', intensity: 25, cone: 37 }),
      Object.freeze({ id: 'ne.e', head: 'ep0', at: 0, out: false, aim: Object.freeze([1.35, -0.42, 0.0]), rail: 'east', intensity: 21 }),
    ]),
    cone: 24, radius: 12, source: 0.12, off: 0.3, color: Object.freeze([1.0, 0.97, 0.92]),
    // (`drop` 0.03: the blade's own soft edge is 0.045 m wide at the table: at 0.012 it left 0.3 units on the first two
    // centimetres of the rail's top by the bake's law; the top 3 cm of the skirt stay dark instead)
    edge: Object.freeze({ hx: 1.4478, hz: 0.8128, top: 0.0562, drop: 0.03 }),
    foot: Object.freeze({ out: 0.15 }),
    // (the side blades: tableKeySides. `x`, `z`: a leg's centre, `half`: half its width, metres; `margin` radians past
    // the legs' outer corners as the key sees them. `on`: false = two blades, the round's first plan.)
    // (`margin`: at 0.04 (the trial `t3`) the frames left the table's corners out: a dark wedge and a bright sliver
    // there; at 0.07 (`t4`) two frames overlapped past each corner: a lit ear, 4.0 units against 2.4 beside it. 0.055:
    // a frame ends at the corner of the outline. 14:29Z, the trial `t5` at 0.055: the two keys of a corner overlap on
    // the carpet round the corner leg, 5.0 units against 2.4 beside it. 0.02 = the blade's own soft edge: a frame
    // ends at its legs' edges, the legs whole in their keys, the corner beyond them the pool's. 14:53Z, the final
    // frame of 14:41Z at 0.02: the band where the two keys of a corner still overlap, 0.1 m wide round the corner
    // leg, reads 110 to 117 of 255 at the near leg's foot against 65 to 90 beside it. 0: a blade's half level lies ON
    // the leg's edge; what passes it is under a half and 0.04 m wide.)
    legs: Object.freeze({ on: true, x: 1.2037, z: 0.5687, half: 0.11, margin: 0 }),
    // THE FILL. The three far keys under the perimeter truss (arena/room.js KEY, now `fill.*`): 38 candela (round A5:
    // 45). They arrive at 25 degrees and are what holds the carpet UNDER the table at 15 to 30 of 255 (the trial at 30
    // candela: 0.22 to 0.33 units there, level 14 to 17 after the grade's lift: at the row's lower edge). The eight
    // heads keep round A5's level all round (RIG.wash): the pool is theirs.
    // (14:15Z, the table role's reading of the half-way bake: at 3 x 38 the bed stood 1.6 of 255 under round A5 at the
    // lead's box: the three fills are 135 candela in all again (round A5: 3 x 45). The SOUTH one carries the difference
    // (`farSouth`): at 25 degrees a unit of its beam puts 0.91 on the south skirt and 0.42 on the carpet, where the
    // steep key gives 0.48 and 0.87: the long apron's light (the row 35 to 55) comes from here.)
    far: 40, farSouth: 55,
  }),
  profile: Object.freeze({ canLen: 0.5, canR: 0.068, bezelR: 0.08, lensR: 0.064, standOff: 0.17, rise: 0.07 }),
  // THE PERIMETER TRUSS: a U of heavier box truss over the upper seating rows of the north, east and south blocks, where
  // the app's camera cannot come (beyond its reach in plan). The low house lights hang under it in cans; screens hang on
  // its inner face; steel wires carry it from the roof's purlins.
  perimeter: Object.freeze({ section: 0.52, bay: 0.5, braceR: 0.012, h: 5.1, z: 10.0, x0: -8.0, x1: 11.0, lampPitch: 2.2, lampDrop: 0.3, canR: 0.12, canLen: 0.26, wirePitch: 4.4, wireR: 0.006, dark: 0.12, seed: 4471 }),
  // SCREENS on the perimeter truss's inner face: centre along the run, width, height.
  // Round A5 (CONTRACT 17.1, 17.2: the screens are the brightest surfaces after the bed; mean of the lit face 95 to 130
  // of 255 at V10, under the bed's peak): LIT. `white`: the radiance (scene-linear) of a slide's white ground seen square
  // on: 0.21 is level 143 of 255; a slide is about 0.6 white by area and the rest navy, so its mean is about 0.13
  // (level 115). Far under the post chain's bloom threshold (1.35): a screen is a surface, not a source. `tint`: a
  // screen's white, a little cooler than the rig's light. `spill`: what the BAKE takes of a screen: a rect emitter of its
  // size 0.1 m in front of the face at the slide's mean radiance in the room light's units (display radiance / 0.728),
  // reaching 5 m; by arithmetic 0.03 units on the seats 3 m in front of it: under one level, said so in the report.
  screens: Object.freeze({ w: 2.2, h: 1.24, t: 0.07, off: 0.12, topOver: 0.4, north: Object.freeze([-4.4, 3.2]), south: Object.freeze([-4.4, 3.2]), east: Object.freeze([0]),
    // (09:33Z, after the first app frame, shots/light/q2-V10.jpg: at 0.21 the white ground read 108 of 255 and the lit
    // face's mean about 78, where the arithmetic said 143 and 115: the frame shows 0.68 of the arithmetic's radiance (the
    // slide's own white is 0.88, the venue's grade takes the rest). 0.33: white about 143, the face's mean about 105.)
    white: 0.33, mean: 0.6, tint: Object.freeze([0.96, 1.0, 1.06]), spill: Object.freeze({ off: 0.1, radius: 5 }) }),
  // THE ROOF STEEL: trusses across the hall (along z) every second lamp column, purlins along x on every lamp row, four
  // rigging beams over the table's rig (the hoists' chains end on them). House lights hang from the purlins on drop rods,
  // each in a bell: mouths at `mouthH` (inside the layout's h0..h1).
  // HEIGHTS, agreed with the shell (arena/shell/plan.js: the lid at the hall's height, a profiled deck 0.06 m deep under it,
  // two round ducts along x at z = +/-10.4 between 8.78 and 9.38 m, a cross duct at x = 12.6 between 8.99 and 9.44 m): the
  // trusses pass UNDER the ducts (their top chords' upper side at 8.70 m); the purlins lie right under the deck, none on
  // the two rows where the round ducts run, and all of them end short of the cross duct; a stub post carries each purlin
  // on each truss. `ducts` repeats the shell's numbers (the node arm compares them with the shell's plan).
  roof: Object.freeze({
    bottomH: 7.8, topH: 8.62, chord: 0.16, webR: 0.035, bay: 1.26, purlinH: 9.27, purlin: Object.freeze([0.1, 0.22]),
    rigBeamH: 8.0, rigBeam: Object.freeze([0.12, 0.24]), mouthH: 7.7, bellR: 0.19, bellH: 0.3, rodR: 0.012, clear: 0.8,
    ducts: Object.freeze({ z: 10.4, r: 0.3, h: 9.08, crossX: 12.6, crossW: 0.9, crossLow: 8.99 }), ductClear: 0.08,
  }),
});

/**
 * Haze cones (the high tier): the radiance a cone shows at its lens for a head of level 1 (scene-linear), the power of the
 * fall with the beam's width, and the half angle of the visible cone by kind of head, degrees (the bright core of a wash
 * is narrower than its field). The level against what the beams light: the pool's carpet stands in 9.7 units and has an
 * albedo near 0.047, a radiance of 0.145; a cone starts at 0.016 at its lens (0.008 for a colour wash, which lands on the
 * dark seats) and only falls from there, so no cone is brighter than what its beam lights. (First frame, dev e3: 0.04 with
 * 17 degree cones filled the wide view with grey wedges: a fog machine, not a hall's air. App pair f2 | f3 at 0.024: the
 * black air over the far side of the table went from 6 to 24 of 255 where five cones cross, and the far boards from 23 to
 * 36: a veil. 0.016.)
 */
// Round A4: 0.016 -> 0.010. The haze is the high tier's alone, and it is a veil over the hall's far half: the on / off pair
// of the app at V10 (shots/light/x1-V10 | x2-V10, 06:14Z / 06:21Z) reads the north drape 53 | 41, the east drape 33 | 24,
// the north-east corner 44 | 30, the air over the far boards 60 | 43: 9 to 17 levels that the base and the lite tier do
// not have (round A3 found them 6 to 16 under the high tier there and guessed at this cause). CONTRACT 16.2 holds the
// tiers within 10 levels of each other; the hall's level is the house light's on every tier, so the veil comes down to
// what leaves 6 to 10.
// Round A5 (CONTRACT 17.4: on the high tier a lit fixture's beam shows in the haze): the six house floods get a cone
// too (`flood`: the visible core of a 40 degree flood, 13 degrees; its share 0.8: the beam lands on seats that stand at
// 0.05 of radiance, five times the cone's peak). Six cards more in the one haze draw call: 12 triangles.
// (10:40Z, after the half-way bake: the shell's frame with the baked light off read 16 to 20 of 255 in the north and
// far drape boxes of V10, where the unlit east drape read 3 to 7: the eight heads' WIDE cones, 12 degrees, crossing in
// front of those walls: a veil, not beams, and it held the drape over CONTRACT 17.2's 5 to 14 there. A wide wash in thin
// haze is the beam one does not see; a narrow profile's is the one that shows. So the wash cones' share comes down to
// a half and the fourteen profiles' goes from 0.85 to 1.2: 0.012 at a lens, under a quarter of the pool's radiance.)
// Round A6 (CONTRACT 18.1: a beam's core at least 6 levels over the drape beside it; the drape's own level 12 to 25 in
// its lower third and 5 to 14 in its upper half WHERE BEAMS CROSS TOO; round A5: 15 to 22 there). A beam reads against
// a dark wall by its own in-scatter, which goes with its candela over its width; a wide wash in thin air is a veil,
// not a beam. So the haze is tightened to the cones:
//   wash     the eight heads' 40 degree washes: NO cone (share 0.5 -> 0): they were the veil of 5 to 8 levels over the
//            drape and the stands that the base and the lite tier do not have (the surround's pair of 12:40Z);
//   flood    the visible core 13 -> 6 degrees, share 0.8 -> 1.0;
//   profile  the ten 5 candela profiles: 6.5 -> 4 degrees, share 1.2 -> 1.6;
//   key      the four table keys (25 to 60 candela in a narrow field: the brightest beams of the rig, 60 / 2.25 = 27
//            units across the beam 1.5 m from the lens against a head's 6): a core of 3.5 degrees, a share of
//            `share.key` at `keyAt` candela and in proportion below it; the cone ends at the table's rail (`keyEnd`:
//            world height). 3.4 at 60 candela is 0.034 of radiance at the lens: a quarter of the pool's carpet (the
//            rule that no cone is brighter than what its beam lights), 0.015 one and a half metres down the beam.
// Nothing in the haze term adds to the wall behind a cone: a card is its own in-scatter and nothing else.
// (`keySide`, 14:52Z, the final frame at V10: the two SOUTH-WEST keys hang 3 to 4 m from the wide poses and their
// cones crossed the frame in front of the stands as two veils: +10 of 255 on the seats at (290,172), +9 at (900,188),
// which the base and lite tiers do not have. Haze scatters forward: a beam that travels toward the viewer sends
// several times more light at him than one that travels away. A card has ONE level, so it takes the level its beam
// has from the side the review poses stand on (south-west): the north-east keys' beams, which travel toward them,
// read (x 2); the south-west keys' own, which travel away, nearly do not (x 0.2). From the north-east (BACK) that
// is the wrong way round, and the round's report says so. Not an input of the bake.)
export const HAZE = Object.freeze({ level: 0.010, fall: 0.9, half: Object.freeze({ wash: 12, profile: 4, colour: 10, flood: 6, key: 3.5 }), share: Object.freeze({ wash: 0, profile: 1.6, colour: 0.5, flood: 0.6, key: 3.4 }), keyAt: 42, keyEnd: 0.06, keySide: Object.freeze({ sw: 0.084, ne: 1.68 }),
  // (ROUND A7: the keys went from 42 / 21 to 50 / 25 cd for the table's apron; a key's cone follows its candela, so
  // `keySide` came down by the same factor (0.1 -> 0.084, 2.0 -> 1.68): the cones stand where they stood.)
  // (ROUND A7, the air over the stands: a factor on `share.profile` per run of the outer rectangle. 1 everywhere = round A6.
  // One job on the final files, four arms: north, east and west at 0.3 take the top-left seat box from 50.8 to 47.1 and
  // move no other row; the south run stays at 1, because its cones stand in front of the table's long apron (at 0.6 the
  // apron reads 41.3 for 42.0 and the lit drape 22.0 for 24.3). Run time only: not an input of the bake.)
  profileSide: Object.freeze({ n: 0.3, e: 0.3, s: 1, w: 0.3 }) });
// (15:00Z, the check frame `hz1` and the surround's pair of 14:55Z: the top-left seat box still stood 7 over its
// haze-off level (45): `keySide.sw` 0.2 -> 0.1 and the floods' cores 1.0 -> 0.6, whose cones hang over the top rows.)

/**
 * Round A5: the lens material's one texture is an ATLAS (arena/rig/mat.js lensTexture draws it; `size` square, rectangles
 * as [x, y, w, h] in canvas pixels, y down). One material and one draw call still carry every lit face of the rig:
 *   lens     a round lens or a downlight's mouth: a hot core, a stepped field, a fall to the rim, a dark bezel line;
 *   led      an LED flood's face: rows of emitters, each a hot core in a dim cell, a dark frame;
 *   slides   the four pictures of the hanging screens: one word of the layout's WORDS each, and geometric marks.
 */
export const LENS_ATLAS = Object.freeze({
  size: 512,
  lens: Object.freeze([0, 0, 128, 128]),
  led: Object.freeze([128, 0, 128, 88]),
  slides: Object.freeze([[0, 192, 256, 144], [256, 192, 256, 144], [0, 336, 256, 144], [256, 336, 256, 144]].map((r) => Object.freeze(r))),
});
/**
 * Round A5 (CONTRACT 17.4: a lit fixture's core at least 240 of 255 in a few pixels, WITH A HALO THAT FALLS OFF; the
 * glare is the post chain's own bloom). How much hotter than the lens level (arena/rig.js LENS_LEVEL 11) the face of a
 * fixture that really lights something is: the heads, the keys' spots, the house floods, the bells and the cans. At 1
 * (the first app frame of the round, shots/light/q2-V10.jpg) every core reached 251 to 254 in 6 to 13 pixels and the
 * bloom's halo around a disc of 6 pixels was a faint ring: +3 to +8 levels (the table role's measurement, its READY
 * note of 09:29Z). The cause was the lens map's MEAN (0.135 of the colour: a small lens is sampled near it), cured in
 * the map (mat.js: mean 0.39). What is left for this factor, by the table role's table of the pass: a lens disc whose
 * mean on screen is 7 to 10 gives +43 to +69 at 2 px and +12 to +25 at 4 px, falling to nothing by 16 px; over 12 it is
 * a blob. 11 x 1.8 x 0.39 = 7.8 square on, peak 19.8 (the lens clamps at 64), 2.3 at the worst angle. A lens on standby
 * and a screen do not take it.
 */
export const LENS_HOT = 1.8;
/**
 * The atlas's round lens as a law (arena/rig/mat.js draws it; the rig's arm takes its mean): the level, 0..1 of the
 * material's colour, at radius r (0 = the centre, 1 = the rim). A lit lens as a camera sees it:
 *   the core   the lamp behind the lens: a plateau of 1 out to half the radius, falling to nothing at 0.72 R;
 *   the ring   the stepped lens around it: 0.045 with fine rings, which at a lit lens's colour (11 x LENS_HOT) is 0.9
 *              of radiance: bright glass UNDER the bloom threshold (1.35), so the lens keeps a face (a clipped white
 *              disc from edge to edge is the "flat white shape" of round A4);
 *   the rim    a dark bezel line from 0.94 R.
 * `core` is returned beside the level (the map tints the core a little whiter).
 */
export function lensLaw(r) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const core = 1 - s(0.5, 0.72, r);
  const ring = 0.045 * (1 - 0.3 * Math.min(1, r)) + 0.012 * (0.5 + 0.5 * Math.cos(r * 44));
  const edge = r > 0.94 ? Math.max(0, 1 - (r - 0.94) / 0.05) : 1;
  return { level: Math.max(core, ring) * edge, core };
}
/** The mean of lensLaw() over the lens's disc: what a lens of a few pixels shows of its colour. */
export function lensMean(n = 256) {
  let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const r = Math.hypot(((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1);
    if (r <= 1) { sum += lensLaw(r).level; cnt += 1; }
  }
  return sum / cnt;
}
/** Texture coordinates of the point (u, v) (0..1 each, v up) of an atlas rectangle (the texture is a flipped canvas). */
export function atlasUV(rect, u, v) {
  const S = LENS_ATLAS.size;
  return [(rect[0] + u * rect[2]) / S, 1 - (rect[1] + (1 - v) * rect[3]) / S];
}

/**
 * The beams that get a haze cone: one per head of both rectangles. Each: { id, kind, from (the lens), dir, len, r0, r1,
 * tint, level }: the cone runs from the lens along the axis and ends a hand above what the beam lands on (the carpet; a
 * colour wash is cut at the boards' height).
 */
export function hazeBeams(plan, outer, { floorY = -0.79, tint = RIG.wash.color, share = HAZE.share } = {}) {
  // (`share`, round A7: a tool's own shares by kind, for the on / off pair of one kind of cone: arena/rig.js `washcone:`)
  const out = [];
  for (const h of [...plan.heads, ...(outer?.heads ?? [])]) {
    if (h.standby) continue; // (round A4: a head on standby has no beam)
    // (round A6: a table key is its own kind; a kind whose share is 0 gets no cone)
    const kind = h.key ? 'key' : h.kind === 'profile' ? 'profile' : h.kind === 'colour' ? 'colour' : 'wash';
    // (round A7: a profile's cone also takes its RUN's factor, HAZE.profileSide by the first letter of its id: n, s, w, e)
    const side = kind === 'profile' ? ((share.profileSide ?? HAZE.profileSide)?.[String(h.id)[0]] ?? 1) : 1;
    if (!(share[kind] * side > 0)) continue;
    const r0 = kind === 'profile' || kind === 'key' ? HALL.profile.lensR : RIG.head.lensR;
    const drop = kind === 'key' ? h.lens[1] - HAZE.keyEnd : h.lens[1] - (floorY + (kind === 'colour' ? 0.95 : 0.08));
    const len = Math.min(kind === 'colour' ? 4.2 : 6, drop / Math.max(0.2, -h.dir[1]));
    const keyLevel = kind === 'key' ? ((HALL.tableKeys.keys.find((k) => k.id === h.key)?.intensity ?? HAZE.keyAt) / HAZE.keyAt) * (HAZE.keySide?.[String(h.key).slice(0, 2)] ?? 1) : 1;
    out.push({ id: h.id, kind, from: h.lens.slice(), dir: h.dir.slice(), len: r4(len), r0, r1: r4(r0 + len * Math.tan((HAZE.half[kind] * Math.PI) / 180)), tint: (h.tint ?? tint).slice(), level: r4(share[kind] * keyLevel * side) });
  }
  return out;
}

/**
 * Round A5: the house floods' beams for the haze (the high tier): one cone per flood, from its face along its axis, cut
 * `FLOOD_BEAM` metres out (above the rows it lands on: a flood 5.8 m up and 44 degrees down meets row 3's seats after
 * 5.5 m), in the flood's own warm colour. The same record as hazeBeams().
 */
export const FLOOD_BEAM = 4.6;
export function floodBeams(floods) {
  const B = HALL.floods.body, r0 = Math.min(B.w, B.h) / 2;
  return (floods?.floods ?? []).map((f) => ({
    id: `flood.${f.id}`, kind: 'flood', from: f.lens.slice(), dir: f.dir.slice(), len: FLOOD_BEAM, r0,
    r1: r4(r0 + FLOOD_BEAM * Math.tan((HAZE.half.flood * Math.PI) / 180)), tint: HALL.floods.color.slice(), level: HAZE.share.flood,
  }));
}

/**
 * Round A6: a table key's shutter (HALL.tableKeys): the unit normal [x, y, z] of the plane through the emitter's place
 * `from` (world metres) and the top outer edge of the rail it faces (`rail`: 'south' | 'north' | 'west' | 'east'),
 * pointing to the LIT side: the table's body under that edge and the carpet; the bed, the balls and the rail across
 * are on the other side. The light reaches p where dot(normal, p - from) >= 0 (the bake's law: bake-room-core.mjs).
 */
export function tableKeyShutter(from, rail, edge = HALL.tableKeys.edge) {
  const y = edge.top - edge.drop;
  // a point of the edge line and the line's direction; `below`: a point of the body under the edge (the lit side)
  const along = rail === 'south' || rail === 'north' ? [1, 0, 0] : [0, 0, 1];
  const on = rail === 'south' ? [0, y, edge.hz] : rail === 'north' ? [0, y, -edge.hz] : rail === 'west' ? [-edge.hx, y, 0] : [edge.hx, y, 0];
  const to = sub(on, from);
  let n = norm([along[1] * to[2] - along[2] * to[1], along[2] * to[0] - along[0] * to[2], along[0] * to[1] - along[1] * to[0]]);
  const below = sub([on[0], y - 0.4, on[2]], from);
  if (n[0] * below[0] + n[1] * below[1] + n[2] * below[2] < 0) n = n.map((v) => -v);
  return n.map(r4);
}

/**
 * Round A6: a table key's second blade, at the table's foot (HALL.tableKeys.foot): the unit normal of the plane through
 * `from` and the line on the carpet `foot.out` metres OUTSIDE the outline of the side the key faces (`floorY`: the
 * floor's world height), pointing to the LIT side: the table and the carpet under it. The carpet in front of the table
 * is on the other side. A blade out of focus (the bake's SHUTTER_SOFT_FOOT: 0.37 m to each side of the line at 4.6 m):
 * the key's light on the carpet fades in over the half metre in front of the table and is whole under the skirt.
 */
export function tableKeyFoot(from, rail, floorY, T = HALL.tableKeys) {
  const e = T.edge, out = T.foot.out;
  const along = rail === 'south' || rail === 'north' ? [1, 0, 0] : [0, 0, 1];
  const on = rail === 'south' ? [0, floorY, e.hz + out] : rail === 'north' ? [0, floorY, -e.hz - out] : rail === 'west' ? [-e.hx - out, floorY, 0] : [e.hx + out, floorY, 0];
  const to = sub(on, from);
  let n = norm([along[1] * to[2] - along[2] * to[1], along[2] * to[0] - along[0] * to[2], along[0] * to[1] - along[1] * to[0]]);
  const under = sub([0, floorY, 0], from);
  if (n[0] * under[0] + n[1] * under[1] + n[2] * under[2] < 0) n = n.map((v) => -v);
  return n.map(r4);
}

/**
 * Round A6: a table key's two SIDE blades (HALL.tableKeys.legs): two vertical planes through `from`, one past each of
 * the two legs of the side the key faces (the legs' outer corners as the key sees them, `margin` radians wider), as
 * unit normals pointing to the lit side (between them). A profile's four shutters frame a rectangle: without the side
 * blades the wedge between the top blade and the foot blade ran on past the table's corners for the whole width of
 * the cone (the half-way bake: +0.4 to +0.9 units on the carpet north of the head end and east of the south side).
 */
export function tableKeySides(from, rail, T = HALL.tableKeys) {
  const L = T.legs, sx = rail === 'west' ? -1 : rail === 'east' ? 1 : 0, sz = rail === 'south' ? 1 : rail === 'north' ? -1 : 0;
  const legs = sx !== 0 ? [[sx * L.x, -L.z], [sx * L.x, L.z]] : [[-L.x, sz * L.z], [L.x, sz * L.z]];
  const mid = sx !== 0 ? [sx * T.edge.hx, 0] : [0, sz * T.edge.hz], ax = Math.atan2(mid[1] - from[2], mid[0] - from[0]);
  let lo = Infinity, hi = -Infinity;
  for (const [cx, cz] of legs) for (const dx of [-L.half, L.half]) for (const dz of [-L.half, L.half]) {
    const a0 = Math.atan2(cz + dz - from[2], cx + dx - from[0]) - ax, a = Math.atan2(Math.sin(a0), Math.cos(a0));
    lo = Math.min(lo, a); hi = Math.max(hi, a);
  }
  const plane = (a) => {
    let n = [-Math.sin(a), 0, Math.cos(a)];
    if (n[0] * Math.cos(ax) + n[2] * Math.sin(ax) < 0) n = n.map((v) => -v);
    return n.map(r4);
  };
  return [plane(ax + lo - L.margin), plane(ax + hi + L.margin)];
}

/** Where a hoist's chain ends, above the floor: the underside of the roof's rigging beams. */
export function hoistTopH() { return HALL.roof.rigBeamH - HALL.roof.rigBeam[1] / 2; }

/**
 * The outer rectangle as plain data: { y0, y1, runs, chords, braces, ties, sleeves, cables, hoists, heads, wires, bonds }.
 * `heads`: [{ id, kind: 'profile' | 'colour', side, pos, aim, dir, lens, clamp, lowest, tint }] (no emitters).
 * `wires`: steel safety wires beside every hoist's chain; `bonds`: a safety bond per head of both rectangles (a short
 * loop from the yoke to the chord), `[{ a, b, r }]`.
 */
export function outerPlan(layout = ARENA, { floorY = -0.79, palette = null } = {}) {
  const O = HALL.outer, S = O.section, cr = RIG.chordR, c = S / 2 - cr;
  const y0 = floorY + layout.rig.bottomH + layout.rig.section + O.lift, y1 = y0 + S, yt = y1 - cr;
  const runs = trussRuns(layout, O).map((r) => ({ ...r, id: `o.${r.id}` }));
  const chords = [], braces = [], ties = [], sleeves = [], cables = [], heads = [], wires = [], bonds = [];
  for (const run of runs) {
    const lat = latticeRun(run, y0, S, { group: 'outer' });
    chords.push(...lat.chords); braces.push(...lat.braces); ties.push(...lat.ties); sleeves.push(...lat.sleeves);
    cables.push(...loomAlong(run, 0, yt + cr + 0.014, 0.013, { group: 'outer', sag: 0.008 }));
  }
  const xs = O.length / 2 - S / 2, zl = O.width / 2 - S / 2, H = RIG.hoist, roofY = floorY + hoistTopH();
  const hoists = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const slingTop = y1 + H.slingRise;
    hoists.push({ x: r4(sx * xs), z: r4(sz * zl), slingTop: r4(slingTop), bodyY0: r4(slingTop + H.bodyGap), bodyY1: r4(slingTop + H.bodyGap + H.bodyLen), roofY: r4(roofY), group: 'outer' });
  }
  // heads: profiles inside, colour washes outside
  const P = HALL.profile, W = RIG.head;
  // (round A4: the washes are on standby: a dark lens, the same on every one; `palette` is no longer read)
  const tints = [O.colours.standby.slice()];
  // (round A6) the table keys: four of the profiles, re-hung and re-aimed (HALL.tableKeys)
  const TK = HALL.tableKeys;
  const add = (run, s, kind, i) => {
    const prof = kind === 'profile', d = prof ? P : W;
    const tk = prof && TK.on === true ? TK.keys.find((k) => k.head === `${run.id[2]}p${i}`) ?? null : null;
    const side = prof ? (tk?.out === true ? -run.inner : run.inner) : -run.inner;
    const v = side * (S / 2 + d.standOff);
    // (a table key may be re-hung ALONG its run too: `at`, metres from the run's middle)
    if (Number.isFinite(tk?.at)) s = tk.at;
    const pos = runPoint(run, s, v, yt + d.rise);
    // the aim point's cross coordinate in the world: toward the table for a profile, out toward the boards for a colour wash
    const at = Math.abs(run.at), target = prof ? (run.axis === 0 ? O.profiles.aimLong : O.profiles.aimShort) : at + O.colours.throw;
    const aim = tk ? tk.aim.slice() : runPoint(run, prof ? s * 0.55 : s * 1.25, -run.inner * target - run.at, floorY + (prof ? 0 : O.colours.aimH));
    const dir = norm(sub(aim, pos)).map(r4);
    const lens = pos.map((q, k) => r4(q + dir[k] * (d.canLen / 2 - 0.015)));
    const lev = Math.sqrt(Math.max(0, 1 - dir[1] * dir[1]));
    const lowest = pos[1] + dir[1] * (d.canLen / 2 + (prof ? 0 : W.doorLen)) - (d.bezelR + (prof ? 0 : W.doorFlare)) * lev;
    heads.push({
      id: `${run.id[2]}${prof ? 'p' : 'c'}${i}`, kind, side: run.id, group: 'outer', pos, aim, dir, lens,
      clamp: runPoint(run, s, side * c, yt), lowest: r4(lowest),
      // (round A5: a profile's lens in the rig's neutral, as its light is)
      tint: prof ? [1, 0.97, 0.92] : tints[(heads.filter((h) => h.kind === 'colour').length) % tints.length],
      ...(prof ? {} : { standby: true }),
      ...(tk ? { key: tk.id } : {}),
    });
  };
  for (const run of runs) {
    const long = run.axis === 0;
    (long ? O.profiles.long : O.profiles.short).forEach((s, i) => add(run, s, 'profile', i));
    (long ? O.colours.long : O.colours.short).forEach((s, i) => add(run, s, 'colour', i));
  }
  // a steel safety wire beside every hoist of both rectangles (from the truss's upper chord to the rigging beam)
  const inner = rigPlan(layout, { floorY });
  for (const h of [...inner.hoists, ...hoists]) wires.push({ a: [r4(h.x + 0.09), r4((h.group === 'outer' ? y1 : inner.y1) - cr), h.z], b: [r4(h.x + 0.09), h.roofY, h.z], r: 0.005 });
  // a safety bond per head: from the yoke's bow down around the chord and back (two short legs)
  for (const h of [...inner.heads, ...heads]) {
    const top = [h.pos[0], r4(h.pos[1] + 0.2), h.pos[2]], mid = [r4((h.pos[0] + h.clamp[0]) / 2 + 0.03), r4(h.clamp[1] - 0.05), r4((h.pos[2] + h.clamp[2]) / 2 + 0.03)];
    bonds.push({ a: top, b: mid, r: 0.003 }, { a: mid, b: [r4(h.clamp[0] + 0.04), r4(h.clamp[1] + 0.03), r4(h.clamp[2] + 0.04)], r: 0.003 });
  }
  // the colour washes as emitters of the room's BAKE (round A3; HALL.outer.colours.emit): `rig.colour.<head>`, a cone with a
  // wash's bell profile along the head's own axis, in the head's tint. Not registered with the room light (its run-time
  // table is full): the room hands them to the bake with its own bake-only emitters.
  // (round A4: on standby, `emit` is null and the list is empty; the member stays for its readers)
  const CE = O.colours.emit;
  const emitters = !CE ? [] : heads.filter((h) => h.kind === 'colour').map((h) => ({
    id: `rig.colour.${h.id}`, type: 'point', position: h.lens.map((v, k) => r4(v + h.dir[k] * CE.off)), normal: null, axis: h.dir.slice(),
    size: [CE.source, 1], color: h.tint.slice(), intensity: CE.intensity, radius: CE.radius, cone: CE.cone, bell: true,
  }));
  // (round A5) the profiles as emitters of the room's BAKE (HALL.outer.profiles.emit): `rig.profile.<head>`
  const PE = O.profiles.emit;
  if (PE) for (const h of heads.filter((q) => q.kind === 'profile' && !q.key)) {
    const position = h.lens.map((v, k) => r4(v + h.dir[k] * PE.off));
    // (round A7) the blade at the table's outline on the side this profile's run faces: tableKeyFoot()'s plane, lit on
    // the OTHER side (away from the table)
    const rail = { n: 'north', s: 'south', w: 'west', e: 'east' }[String(h.id)[0]];
    const blade = PE.blade?.on === true && rail ? tableKeyFoot(position, rail, floorY, { edge: TK.edge, foot: { out: PE.blade.out } }).map((v) => r4(-v)) : null;
    emitters.push({
      id: `rig.profile.${h.id}`, type: 'point', position, normal: null, axis: h.dir.slice(),
      size: [PE.source, 1], color: PE.color.slice(), intensity: PE.intensity, radius: PE.radius, cone: PE.cone, bell: true,
      ...(blade ? { shutter: blade } : {}),
    });
  }
  // (round A6) the table keys as emitters of the room's BAKE (HALL.tableKeys): `key.<id>`, a profile's flat field along
  // the head's own axis, with its shutter (tableKeyShutter below)
  for (const h of heads.filter((q) => q.key)) {
    const k = TK.keys.find((q) => q.id === h.key), position = h.lens.map((v, j) => r4(v + h.dir[j] * TK.off));
    emitters.push({
      id: `key.${h.key}`, type: 'point', position, normal: null, axis: h.dir.slice(),
      size: [TK.source, 1], color: TK.color.slice(), intensity: k.intensity, radius: TK.radius, cone: k.cone ?? TK.cone, bell: k.bell === true,
      shutter: tableKeyShutter(position, k.rail), foot: tableKeyFoot(position, k.rail, floorY),
      ...(TK.legs?.on === true ? { sides: tableKeySides(position, k.rail) } : {}),
    });
  }
  return { y0: r4(y0), y1: r4(y1), section: S, chordOffset: r4(c), runs, chords, braces, ties, sleeves, cables, hoists, heads, emitters, wires, bonds };
}

/**
 * The roof steel, the perimeter truss and what hangs on them, as plain data for a floor height:
 *   { trusses: [{ x, chords: [box], webs: [{ a, b, r }] }], purlins: [box], rigBeams: [box],
 *     fixtures: [{ x, y, z, level, kind: 'roof' | 'ring', top }]  (y: the mouth = the lamp; top: where its rod or yoke ends),
 *     perimeter: { y0, y1, runs, chords, braces, ties, sleeves, wires, cables }, screens: [{ c: [x, y, z], w, h, t, axis }] }
 * A `box` is { a, b, w, h }: an axis-aligned beam between two points, `w` wide and `h` high.
 */
export function roofPlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const hl = layout.houseLights, hall = layout.hall, K = RIG.house, R = HALL.roof, PM = HALL.perimeter;
  const x0 = hall.x0 + K.margin, x1 = hall.x1 - K.margin, z0 = hall.z0 + K.margin, z1 = hall.z1 - K.margin;
  const nx = Math.max(1, Math.floor((x1 - x0) / hl.pitchX)), nz = Math.max(1, Math.floor((z1 - z0) / hl.pitchZ));
  const ox = x0 + ((x1 - x0) - nx * hl.pitchX) / 2, oz = z0 + ((z1 - z0) - nz * hl.pitchZ) / 2;
  const Y = (h) => r4(floorY + h);
  // ---- trusses across the hall, midway between lamp columns, every second gap
  const trusses = [];
  const za = hall.z0 + 0.15, zb = hall.z1 - 0.15, bays = Math.max(4, Math.round((zb - za) / R.bay));
  for (let i = 0; ox + (i + 0.5) * hl.pitchX < hall.x1 - 0.4; i += 2) {
    const x = r4(ox + (i + 0.5) * hl.pitchX);
    const chords = [{ a: [x, Y(R.bottomH), za], b: [x, Y(R.bottomH), zb], w: R.chord, h: R.chord }, { a: [x, Y(R.topH), za], b: [x, Y(R.topH), zb], w: R.chord, h: R.chord }];
    const webs = [];
    for (let k = 0; k <= bays; k++) {
      const z = r4(za + ((zb - za) * k) / bays);
      webs.push({ a: [x, Y(R.bottomH), z], b: [x, Y(R.topH), z], r: R.webR, post: true });
      if (k < bays) {
        const zn = r4(za + ((zb - za) * (k + 1)) / bays);
        webs.push(k % 2 === 0 ? { a: [x, Y(R.bottomH), z], b: [x, Y(R.topH), zn], r: R.webR } : { a: [x, Y(R.topH), z], b: [x, Y(R.bottomH), zn], r: R.webR });
      }
    }
    trusses.push({ x, chords, webs });
  }
  // ---- purlins along the hall on the lamp rows (none where a round duct of the shell runs; all end short of its cross
  // duct), a stub post on each truss under each purlin; rigging beams over the table's rig
  const purlins = [], rigBeams = [], stubs = [];
  const D = R.ducts, purlinEnd = Math.min(hall.x1 - 0.15, D.crossX - D.crossW / 2 - R.ductClear + 0.03);
  const rowHasPurlin = (z) => Math.abs(Math.abs(z) - D.z) > D.r + R.purlin[0] / 2 + R.ductClear;
  for (let k = 0; k <= nz; k++) {
    const z = r4(oz + k * hl.pitchZ);
    if (!rowHasPurlin(z)) continue;
    purlins.push({ a: [hall.x0 + 0.15, Y(R.purlinH), z], b: [r4(purlinEnd), Y(R.purlinH), z], w: R.purlin[0], h: R.purlin[1] });
    for (const t of trusses) if (t.x < purlinEnd) stubs.push({ a: [t.x, Y(R.topH + R.chord / 2), z], b: [t.x, Y(R.purlinH - R.purlin[1] / 2), z], r: 0.03 });
  }
  {
    const O = HALL.outer, zi = layout.rig.width / 2 - layout.rig.section / 2, zo = O.width / 2 - O.section / 2;
    const xa = trusses.filter((t) => t.x < -O.length / 2).pop()?.x ?? hall.x0 + 0.5, xb = trusses.find((t) => t.x > O.length / 2)?.x ?? hall.x1 - 0.5;
    for (const z of [-zo, -zi, zi, zo]) rigBeams.push({ a: [xa, Y(R.rigBeamH), r4(z)], b: [xb, Y(R.rigBeamH), r4(z)], w: R.rigBeam[0], h: R.rigBeam[1] });
  }
  // ---- roof fixtures: a bell on a drop rod under a purlin at every grid point (seeded: a share dark, levels vary), none
  // over the table's rig (its chains go up there)
  const fixtures = [];
  const rnd = seeded(K.seed);
  const clearX = HALL.outer.length / 2 + R.clear, clearZ = HALL.outer.width / 2 + R.clear;
  for (let k = 0; k <= nz; k++) {
    for (let i = 0; i <= nx; i++) {
      // (every draw is taken for every grid point, so one lamp more or less never moves the others)
      const jx = (rnd() - 0.5) * 2 * K.jitter * hl.pitchX; rnd();
      const dark = rnd() < K.dark, level = 0.55 + 0.45 * rnd();
      const x = ox + i * hl.pitchX + jx, z = oz + k * hl.pitchZ;
      if (dark) continue;
      if (!rowHasPurlin(r4(z)) || x > purlinEnd - 0.1) continue; // no purlin there to hang from
      if (Math.abs(x) < clearX && Math.abs(z) < clearZ) continue;
      fixtures.push({ x: r4(x), y: Y(R.mouthH), z: r4(z), level: r4(level), kind: 'roof', top: Y(R.purlinH - R.purlin[1] / 2) });
    }
  }
  // ---- the perimeter truss: north and south runs along x, the east run between them
  const S = PM.section, cr = RIG.chordR, c = S / 2 - cr, py0 = floorY + PM.h, py1 = py0 + S;
  const runs = [
    { id: 'p.north', axis: 0, from: PM.x0, to: PM.x1 + S / 2, at: -PM.z, inner: 1 },
    { id: 'p.south', axis: 0, from: PM.x0, to: PM.x1 + S / 2, at: PM.z, inner: -1 },
    { id: 'p.east', axis: 2, from: -(PM.z - c), to: PM.z - c, at: PM.x1, inner: -1 },
  ];
  const per = { y0: r4(py0), y1: r4(py1), section: S, runs, chords: [], braces: [], ties: [], sleeves: [], wires: [], cables: [] };
  const prnd = seeded(PM.seed);
  const screens = [];
  for (const run of runs) {
    const lat = latticeRun(run, py0, S, { bay: PM.bay, braceR: PM.braceR, group: 'perimeter' });
    per.chords.push(...lat.chords); per.braces.push(...lat.braces); per.ties.push(...lat.ties); per.sleeves.push(...lat.sleeves);
    per.cables.push(...loomAlong(run, 0, py1 + 0.016, 0.014, { group: 'perimeter', pitch: 0.75, sag: 0.012 }));
    const len = run.to - run.from;
    // steel wires: a pair (one from each upper chord) meeting on the roof steel straight above. A run along x hangs from
    // the roof trusses it passes under (their bottom chords), the run along z from the purlins it passes under
    const tops = run.axis === 0
      ? trusses.filter((t) => t.x > run.from + 0.2 && t.x < run.to - 0.2).map((t) => [t.x, Y(R.bottomH - R.chord / 2), run.at])
      : purlins.filter((p) => p.a[2] > run.from + 0.2 && p.a[2] < run.to - 0.2 && run.at < p.b[0]).map((p) => [run.at, Y(R.purlinH - R.purlin[1] / 2), p.a[2]]);
    for (const top of tops) {
      const s = run.axis === 0 ? top[0] : top[2];
      for (const sv of [-1, 1]) per.wires.push({ a: runPoint(run, s, sv * c, py1 - cr), b: top, r: PM.wireR });
    }
    // the low house lights: a can under the truss's centre line every `lampPitch` (seeded: a share dark)
    const nl = Math.max(1, Math.floor((len - 1.2) / PM.lampPitch));
    for (let i = 0; i <= nl; i++) {
      const s = run.from + 0.6 + ((len - 1.2) * i) / nl;
      const dark = prnd() < PM.dark, level = 0.6 + 0.4 * prnd();
      if (dark) continue;
      const p = runPoint(run, s, 0, py0 - PM.lampDrop);
      fixtures.push({ x: p[0], y: p[1], z: p[2], level: r4(level), kind: 'ring', top: r4(py0 + cr) });
    }
    // screens on the inner face
    const SC = HALL.screens, list = SC[run.id.slice(2)] ?? [];
    for (const s of list) {
      const p = runPoint(run, s, run.inner * (S / 2 + SC.off), py0 + SC.topOver - SC.h / 2);
      // (round A5: `slide`: which of the atlas's four pictures the screen shows: one word of the layout's WORDS each)
      screens.push({ c: p, w: SC.w, h: SC.h, t: SC.t, axis: run.axis, face: run.inner, hang: r4(py1 - cr), slide: screens.length % LENS_ATLAS.slides.length });
    }
  }
  return { trusses, purlins, stubs, rigBeams, fixtures, perimeter: per, screens, grid: { ox: r4(ox), oz: r4(oz), nx, nz } };
}

/**
 * The house floods (round A4; HALL.floods) as plain data for a floor height:
 *   { floods: [{ id, side, pos (the body's centre), aim, dir, lens (the face's centre), top (where its drop pipe ends:
 *     the underside of the steel above), on: 'truss' | 'rigBeam' }], emitters: [spec of the room light's form, plain arrays] }
 * Ids: `n0`, `n1` (north, west to east), `s0`, `s1`, `e0` (north), `e1`; emitters `house.<id>`.
 */
export function floodPlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const F = HALL.floods, R = HALL.roof, isl = layout.island;
  const roof = roofPlan(layout, { floorY });
  // the two roof trusses that cross the island nearest its middle, one on each side of x = 0
  const xs = roof.trusses.map((t) => t.x).filter((x) => x > isl.x0 && x < isl.x1);
  const west = xs.filter((x) => x < 0).pop() ?? -2.4, east = xs.find((x) => x > 0) ?? 2.8;
  // the outer rigging beams (the two farthest from the table's long axis)
  const zb = Math.max(...roof.rigBeams.map((b) => Math.abs(b.a[2])));
  const y = floorY + F.h, trussUnder = floorY + R.bottomH - R.chord / 2, beamUnder = floorY + R.rigBeamH - R.rigBeam[1] / 2;
  const floods = [];
  const add = (id, side, pos, aim, top, on) => {
    const dir = norm(sub(aim, pos)).map(r4);
    floods.push({ id, side, kind: 'flood', pos: pos.map(r4), aim: aim.map(r4), dir, lens: pos.map((q, k) => r4(q + dir[k] * (F.body.d / 2))), top: r4(top), on });
  };
  for (const [sz, s] of [[-1, 'n'], [1, 's']]) {
    [west, east].forEach((x, i) => add(`${s}${i}`, sz < 0 ? 'north' : 'south', [x, y, sz * (isl.z1 - F.inside)], [x * F.fan, floorY + F.aimH, sz * (isl.z1 + F.aimOut)], trussUnder, 'truss'));
  }
  [-1, 1].forEach((sz, i) => add(`e${i}`, 'east', [isl.x1 - F.inside, y, sz * zb], [isl.x1 + F.aimOut, floorY + F.aimH, sz * F.eastAimZ], beamUnder, 'rigBeam'));
  const emitters = floods.map((f) => ({
    id: `house.${f.id}`, type: 'point', position: f.lens.map((v, k) => r4(v + f.dir[k] * F.off)), normal: null, axis: f.dir.slice(),
    size: [F.source, 1], color: F.color.slice(), intensity: f.side === 'east' ? F.eastIntensity : F.intensity, radius: F.radius, cone: F.cone, bell: false,
  }));
  return { floods, emitters };
}

/**
 * The key lights' fixtures (round A4; HALL.keys): three profile spots under the perimeter truss, as heads of the form
 * arena/rig/truss.js head() builds (`kind: 'profile'`), plus where each key's emitter stands and where it is aimed:
 *   { heads: [{ id: 'kn' | 'ks' | 'ke', key: 'north' | 'south' | 'east', kind, pos, aim, dir, lens, clamp, lowest, tint }],
 *     at: { north: { position, axis }, south, east } }   (plain arrays, world metres)
 */
export function keyPlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const K = HALL.keys, PM = HALL.perimeter, P = HALL.profile;
  const c = PM.section / 2 - RIG.chordR, yChord = floorY + PM.h + RIG.chordR, y = yChord - K.drop;
  const heads = [], at = {};
  const add = (key, pos, clamp) => {
    const l = Math.hypot(pos[0], pos[2]) || 1;
    const aim = [(-pos[0] / l) * K.past, floorY, (-pos[2] / l) * K.past];
    const dir = norm(sub(aim, pos)).map(r4);
    const lens = pos.map((q, k) => r4(q + dir[k] * (P.canLen / 2 - 0.015)));
    const lev = Math.sqrt(Math.max(0, 1 - dir[1] * dir[1]));
    heads.push({ id: `k${key[0]}`, key, kind: 'profile', side: `p.${key}`, group: 'perimeter', pos: pos.map(r4), aim: aim.map(r4), dir, lens, clamp: clamp.map(r4), lowest: r4(pos[1] + dir[1] * (P.canLen / 2) - P.bezelR * lev), tint: [1, 0.95, 0.86] });
    at[key] = { position: lens.map((v, k) => r4(v + dir[k] * K.off)), axis: dir.slice() };
  };
  // the north and south runs lie along x at z = -/+PM.z: the inner lower chord is the one toward the table
  add('north', [K.north + K.beside, y, -(PM.z - c)], [K.north + K.beside - 0.12, yChord, -(PM.z - c)]);
  add('south', [K.south + K.beside, y, PM.z - c], [K.south + K.beside - 0.12, yChord, PM.z - c]);
  add('east', [PM.x1 - c, y, K.east + K.beside], [PM.x1 - c, yChord, K.east + K.beside - 0.12]);
  return { heads, at };
}

/**
 * The wall washers (round A4; HALL.wallwash) as plain data for a floor height:
 *   { runs: [{ id: 'north' | 'south' | 'east', axis (0 = along x, 2 = along z), from, to, at (the battens' line on the
 *     other horizontal axis), y, out: [x, 0, z] (toward the wall), battens: [centre along the run, ...] }],
 *     emitters: [tube spec per run: `house.wall.<id>`, plain arrays] }
 */
export function wallWashPlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const W = HALL.wallwash, PM = HALL.perimeter, B = W.batten;
  // (round A5: the wall washers are gone; round A7: the cove lines and the drape wash, if on, ride in their place)
  if (W.on !== true) {
    const cv = covePlan(layout, { floorY }), dw = drapeWashPlan(layout, { floorY });
    return { runs: cv.runs, emitters: [...cv.emitters, ...dw.emitters], floods: dw.floods };
  }
  const per = roofPlan(layout, { floorY }).perimeter, c = PM.section / 2 - RIG.chordR;
  const y = r4(per.y1 - RIG.chordR - 0.01); // at the upper chords' height
  const runs = [], emitters = [];
  for (const run of per.runs) {
    const id = run.id.slice(2), outSign = -run.inner;                    // the wall is on the side away from the table
    const at = r4(run.at + outSign * (c + RIG.chordR + B.w / 2 + 0.01)); // on the outer upper chord's outer side
    const from = run.from + 0.3, to = run.to - 0.3, len = to - from;
    const n = Math.max(1, Math.floor((len + B.gap) / (B.len + B.gap))), pitch = len / n;
    const battens = Array.from({ length: n }, (_, i) => r4(from + (i + 0.5) * pitch));
    const out = run.axis === 0 ? [0, 0, outSign] : [outSign, 0, 0];
    runs.push({ id, axis: run.axis, from: r4(from), to: r4(to), at, y, out, battens });
    // the emitter: a tube on the battens' faces' line, `clear` in front of them, one-sided toward the wall and a little up
    const line = at + outSign * (B.w / 2 + W.clear), mid = (from + to) / 2;
    const nl = Math.hypot(1, W.tilt);
    emitters.push({
      id: `house.wall.${id}`, type: 'tube', position: (run.axis === 0 ? [mid, y, line] : [line, y, mid]).map(r4),
      axis: run.axis === 0 ? [1, 0, 0] : [0, 0, 1], normal: [out[0] / nl, W.tilt / nl, out[2] / nl].map(r4),
      size: [r4(len), W.tube], color: W.color.slice(), intensity: r4(W.perMetre * len), radius: W.radius,
    });
  }
  return { runs, emitters };
}

/**
 * The drape wash (round A7; HALL.drapeWash) in floodPlan()'s form: { floods: [{ id: 'd0' | 'd1', side: 'corner', kind,
 * pos, aim, dir, lens, top, on }], emitters: [`house.drape.<id>`] }; d0 is the north-east corner's. Empty while off.
 */
export function drapeWashPlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const D = HALL.drapeWash, F = HALL.floods;
  if (D?.on !== true) return { floods: [], emitters: [] };
  const hall = layout.hall, floods = [];
  const xEnd = Math.max(...roofPlan(layout, { floorY }).rigBeams.map((b) => Math.max(b.a[0], b.b[0])));
  for (const e of floodPlan(layout, { floorY }).floods.filter((f) => f.side === 'east')) {
    const sz = e.pos[2] < 0 ? -1 : 1;
    const pos = [Math.min(e.pos[0] + D.shift, xEnd - D.end), e.pos[1], e.pos[2]], aim = [hall.x1 - D.aimIn, floorY + D.aimH, sz * (hall.z1 - D.aimIn)];
    const dir = norm(sub(aim, pos)).map(r4);
    floods.push({ id: `d${e.id.slice(1)}`, side: 'corner', kind: 'flood', pos: pos.map(r4), aim: aim.map(r4), dir, lens: pos.map((q, k) => r4(q + dir[k] * (F.body.d / 2))), top: e.top, on: e.on });
  }
  const emitters = floods.map((f) => ({
    id: `house.drape.${f.id}`, type: 'point', position: f.lens.map((v, k) => r4(v + f.dir[k] * F.off)), normal: null, axis: f.dir.slice(),
    size: [F.source, 1], color: F.color.slice(), intensity: D.intensity, radius: D.radius, cone: D.cone, bell: false,
  }));
  return { floods, emitters };
}

/**
 * The cove lines behind the top rows (round A7; HALL.cove), in wallWashPlan()'s form: a run per seating block on the top
 * deck's rear edge, `battens` along it, and one tube emitter per run (`house.cove.<block>`). Empty while the cove is off.
 */
export function covePlan(layout = ARENA, { floorY = -0.79 } = {}) {
  const C = HALL.cove, W = HALL.wallwash, B = W.batten;
  if (C?.on !== true) return { runs: [], emitters: [] };
  const S = layout.seating, isl = layout.island;
  const depth = S.front + S.rows * S.tread, y = r4(floorY + S.firstRowH + (S.rows - 1) * S.rise + C.h);
  const runs = [], emitters = [];
  for (const b of S.blocks) {
    const axis = b.side === 'east' ? 2 : 0, outSign = b.side === 'north' ? -1 : 1;
    const edge = b.side === 'north' ? isl.z0 - depth : b.side === 'south' ? isl.z1 + depth : isl.x1 + depth;
    const at = r4(edge + outSign * C.off);
    let from = b.from + C.inset, to = b.to - C.inset;
    // (`ext`: the line runs on along the wall to the hall's two EAST corners, where no block stands and the drape is
    // seen from the play views: the north and south runs to `corner` short of the east run's line, the east run to
    // `corner` short of theirs. The shell's reading of the lead's boxes, 18:11Z: they lie 3 to 4 m past a block's end.)
    if (C.ext === true) {
      if (axis === 0) to = Math.max(to, isl.x1 + depth + C.off - C.corner);
      else { from = Math.min(from, isl.z0 - depth - C.off + C.corner); to = Math.max(to, isl.z1 + depth + C.off - C.corner); }
    }
    const len = to - from;
    const n = Math.max(1, Math.floor((len + B.gap) / (B.len + B.gap))), pitch = len / n;
    const battens = Array.from({ length: n }, (_, i) => r4(from + (i + 0.5) * pitch));
    const out = axis === 0 ? [0, 0, outSign] : [outSign, 0, 0];
    runs.push({ id: b.id, axis, from: r4(from), to: r4(to), at, y, out, battens, cove: true });
    const line = at + outSign * (B.w / 2 + W.clear), mid = (from + to) / 2, nl = Math.hypot(1, C.tilt);
    emitters.push({
      id: `house.cove.${b.id}`, type: 'tube', position: (axis === 0 ? [mid, y, line] : [line, y, mid]).map(r4),
      axis: axis === 0 ? [1, 0, 0] : [0, 0, 1], normal: [out[0] / nl, C.tilt / nl, out[2] / nl].map(r4),
      size: [r4(len), W.tube], color: W.color.slice(), intensity: r4(C.perMetre * len), radius: C.radius,
    });
  }
  return { runs, emitters };
}

/**
 * The keep-out law for the round-A2 members (CONTRACT 13.5). Two classes:
 *   `cut`      the outer rectangle with its heads, hoists and wires: over the island, inside the camera's reach in plan, so
 *              every member is at or above the hall's top cut (the law of the first truss: keepOut());
 *   `outside`  the perimeter truss, its cans, wires and screens, and the roof steel with its fixtures: no point of them is
 *              a point the app's camera can be at (layout `inCameraVolume`, sampled along every member with its radius).
 * Returns { ok, problems (first 8), count, lowestOuter (above the floor), sampled }.
 */
export function hallKeepOut(outer, roof, layout = ARENA, { floorY = -0.79, inVolume = null } = {}) {
  const planeH = Number.isFinite(layout.cut?.top) ? layout.cut.top : layout.keepOut.cameraVolume.h1, top = floorY + planeH;
  const problems = [];
  let lowestOuter = Infinity, sampled = 0;
  const cut = (name, p, r = 0) => {
    const y = p[1] - r;
    if (y < lowestOuter) lowestOuter = y;
    if (y < top - 1e-6) problems.push(`${name} at (${p.map((n) => n.toFixed(3)).join(', ')}) hangs ${(top - y).toFixed(3)} m below the cut plane`);
  };
  for (const k of ['chords', 'braces', 'ties', 'sleeves', 'cables', 'wires', 'bonds']) for (const m of outer[k] ?? []) { cut(`outer ${k}`, m.a, m.r); cut(`outer ${k}`, m.b, m.r); }
  for (const h of outer.heads) cut(`outer head ${h.id}`, [h.pos[0], h.lowest, h.pos[2]]);
  for (const h of outer.hoists) cut('outer hoist', [h.x, outer.y1, h.z]);
  const test = typeof inVolume === 'function' ? inVolume : null;
  const out = (name, a, b, r) => {
    if (!test) return;
    for (let i = 0; i <= 4; i++) {
      const p = [a[0] + ((b[0] - a[0]) * i) / 4, a[1] + ((b[1] - a[1]) * i) / 4, a[2] + ((b[2] - a[2]) * i) / 4];
      sampled += 1;
      for (const dh of [-r - 0.05, r + 0.05]) if (test(p[0], p[1] - floorY + dh, p[2], layout)) { problems.push(`${name} at (${p.map((n) => n.toFixed(2)).join(', ')}) is a point the camera can be at`); return; }
    }
  };
  const P = roof.perimeter;
  for (const k of ['chords', 'braces', 'ties', 'sleeves', 'cables', 'wires']) for (const m of P[k]) out(`perimeter ${k}`, m.a, m.b, m.r);
  for (const t of roof.trusses) { for (const m of t.chords) out('roof truss chord', m.a, m.b, m.h / 2); for (const m of t.webs) out('roof truss web', m.a, m.b, m.r); }
  for (const m of [...roof.purlins, ...roof.rigBeams]) out('roof beam', m.a, m.b, m.h / 2);
  for (const m of roof.stubs ?? []) out('roof stub', m.a, m.b, m.r);
  for (const f of roof.fixtures) out(`${f.kind} fixture`, [f.x, f.y, f.z], [f.x, f.top, f.z], f.kind === 'roof' ? HALL.roof.bellR : HALL.perimeter.canR);
  for (const s of roof.screens) out('screen', [s.c[0], s.c[1] - s.h / 2, s.c[2]], [s.c[0], s.c[1] + s.h / 2, s.c[2]], s.w / 2);
  return { ok: problems.length === 0, problems: problems.slice(0, 8), count: problems.length, lowestOuter: r4(lowestOuter - floorY), sampled };
}

/**
 * The keep-out law for the floor-fixed rig (CONTRACT.md 13.5, the hall's camera note of round A1). The app's camera can
 * rise through the rig (its reach ends 7.27 m above the floor), so the hall is CUT AWAY above the rig's lower chords:
 * everything at or above `layout.cut.top` carries the side mark `SIDE.top` and is not drawn while the camera is at or above
 * that plane. The law for this module is therefore: every floor-fixed member is at or above that plane (a camera below
 * the plane can never be inside one, and a camera above it does not draw them), and every house light hangs above the
 * highest point the camera can reach near it (cameraTopNear), or where the camera cannot come at all. (A layout without
 * `cut` falls back to the top of its camera volume.)
 * Returns { ok, problems: [text] (the first 8), count, plane, lowest, clearance, houseLowest, houseClear, cameraTop }:
 * heights are world y except `plane` and `cameraTop` (above the floor); `clearance` = the lowest member's height above the
 * plane; `houseClear` = the smallest height of a lamp above the camera's highest point under it (null: no lamp is over
 * the camera's reach).
 */
export function keepOut(plan, layout = ARENA, { floorY = -0.79, house = null } = {}) {
  const planeH = Number.isFinite(layout.cut?.top) ? layout.cut.top : layout.keepOut.cameraVolume.h1;
  const top = floorY + planeH;
  const problems = [];
  let lowest = Infinity;
  const check = (name, p, r = 0) => {
    const y = p[1] - r;
    if (y < lowest) lowest = y;
    if (y < top - 1e-6) problems.push(`${name} at (${p.map((n) => n.toFixed(3)).join(', ')}) hangs ${(top - y).toFixed(3)} m below the cut plane (${planeH} m over the floor)`);
  };
  for (const m of plan.chords) { check(`chord ${m.run}.${m.chord}`, m.a, m.r); check(`chord ${m.run}.${m.chord}`, m.b, m.r); }
  for (const m of plan.braces) { check(`brace ${m.run}.${m.face}`, m.a, m.r); check(`brace ${m.run}.${m.face}`, m.b, m.r); }
  for (const m of plan.ties) { check('tie', m.a, m.r); check('tie', m.b, m.r); }
  for (const m of plan.sleeves ?? []) { check('sleeve', m.a, m.r); check('sleeve', m.b, m.r); }
  for (const m of plan.cables ?? []) { check('cable', m.a, m.r); check('cable', m.b, m.r); }
  for (const h of plan.heads) check(`head ${h.id}`, [h.pos[0], h.lowest, h.pos[2]]);
  for (const h of plan.hoists) check('hoist', [h.x, plan.y1, h.z]);
  // the stroke room is a floor-level law (a raised cue reaches about 2.2 m): everything here hangs above it
  if (!(lowest > floorY + 2.2)) problems.push(`the rig's lowest member (${(lowest - floorY).toFixed(2)} m over the floor) is within a raised cue's reach (stroke room ${layout.keepOut.strokeRoom} m)`);
  // house lights, lamp by lamp: over a place the camera can come near (within the lamp's radius plus `cameraClear` in plan)
  // the lamp hangs above the camera's highest point THERE; where the camera cannot come, any height is free (the low ring,
  // the wall lamps)
  const cameraTop = layout.keepOut.cameraVolume.h1, K = RIG.house;
  let houseLowest = Infinity, houseClear = Infinity;
  for (const l of house ?? []) {
    if (l.y - l.r < houseLowest) houseLowest = l.y - l.r;
    const reach = cameraTopNear(l.x, l.z, layout, l.r + K.cameraClear);
    if (reach === -Infinity) continue;
    const over = l.y - l.r - floorY - reach;
    if (over < houseClear) houseClear = over;
    if (over < K.cameraClear) problems.push(`house light at (${l.x}, ${l.y}, ${l.z}) hangs inside the camera's reach (the camera comes up to ${reach.toFixed(2)} m over the floor there)`);
  }
  return {
    ok: problems.length === 0, problems: problems.slice(0, 8), count: problems.length, plane: planeH, lowest: r4(lowest), clearance: r4(lowest - top),
    houseLowest: Number.isFinite(houseLowest) ? r4(houseLowest) : null, houseClear: Number.isFinite(houseClear) ? r4(houseClear) : null, cameraTop,
  };
}
