// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-arena-rig.mjs — node arm for the arena's light rig (web/scene/club/arena/rig.js and arena/rig/*; CONTRACT.md 13.4).
// Pure checks, no GL: the plan (every member at or above the hall's top cut, the heads' lowest points, every house light
// outside the camera's reach, what each review pose can hold of them), the emitter share, the luminaire's interface
// (`face()` has the shape of the club lamp's), the lamp
// view rule on this housing at the review poses, and (where node can load three: node:module registerHooks, 22.15+) the
// geometry itself: finite, counted, inside its bounds. Run: node web/tools/club/test-club-arena-rig.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as LAYOUT from '../../scene/club/arena/layout.js';
import { rigPlan, housePlan, keepOut, trussRuns, seeded, beamsAgainstHousing, rigSignature, outerPlan, roofPlan, hallKeepOut, hoistTopH, hazeBeams, RIG, HALL, HAZE } from '../../scene/club/arena/rig/plan.js';
import * as PLAN_MOD from '../../scene/club/arena/rig/plan.js';
import { lampFace, lampSpillBaked, CANOPY } from '../../scene/club/room/lamp/face.js';
import { PLAN as SHELL_PLAN } from '../../scene/club/arena/shell/plan.js';
import { RULE, coverCount, nextState, bodyInFrame, frameShare, nextWhole, lookAtViewProj, lookAtBasis } from '../../scene/club/room/lamp/rule.js';

const { ARENA, VIEWS } = LAYOUT;
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const okAsync = async (name, fn) => { await fn(); n += 1; console.log(`OK ${name}`); };
const FLOORS = [-0.79, -0.85, -0.74]; // the pool table's floor and two other seats
const src = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ---- the plan -----------------------------------------------------------------------------------------------------------------
ok('the truss stands on the layout rectangle, its lower chords in the layout plane', () => {
  for (const floorY of FLOORS) {
    const p = rigPlan(ARENA, { floorY });
    assert.ok(Math.abs(p.y0 - (floorY + ARENA.rig.bottomH)) < 1e-9 && Math.abs(p.y1 - p.y0 - ARENA.rig.section) < 1e-9);
    assert.equal(p.chords.length, 16, 'four chords on each of four runs');
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const m of p.chords) for (const q of [m.a, m.b]) {
      // a tube's radius counts across its axis, not along it
      const rx = m.a[0] !== m.b[0] ? 0 : m.r, rz = m.a[2] !== m.b[2] ? 0 : m.r;
      x0 = Math.min(x0, q[0] - rx); x1 = Math.max(x1, q[0] + rx); z0 = Math.min(z0, q[2] - rz); z1 = Math.max(z1, q[2] + rz);
      y0 = Math.min(y0, q[1] - m.r); y1 = Math.max(y1, q[1] + m.r);
    }
    assert.ok(Math.abs(x0 + ARENA.rig.length / 2) < 1e-6 && Math.abs(x1 - ARENA.rig.length / 2) < 1e-6, 'outer length');
    assert.ok(Math.abs(z0 + ARENA.rig.width / 2) < 1e-6 && Math.abs(z1 - ARENA.rig.width / 2) < 1e-6, 'outer width');
    assert.ok(Math.abs(y0 - p.y0) < 1e-6 && Math.abs(y1 - p.y1) < 1e-6, 'square section between the two planes');
  }
});

ok('the lattice: every diagonal joins the two chords of its face at 45 degrees, every face of every run is braced', () => {
  const p = rigPlan(ARENA);
  const runs = trussRuns(ARENA);
  for (const run of runs) for (const face of ['bottom', 'top', 'inner', 'outer']) {
    const list = p.braces.filter((b) => b.run === run.id && b.face === face);
    assert.ok(list.length >= 8, `${run.id}.${face}: ${list.length} diagonals`);
    for (let i = 0; i < list.length; i++) {
      const b = list[i], d = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]];
      const along = Math.abs(d[run.axis]), across = Math.hypot(...d.filter((_, k) => k !== run.axis));
      assert.ok(Math.abs(across - 2 * p.chordOffset) < 1e-3, `${run.id}.${face}: a diagonal spans the two chords`);
      const deg = (Math.atan2(across, along) * 180) / Math.PI;
      assert.ok(deg > 38 && deg < 52, `${run.id}.${face}: ${deg.toFixed(1)} degrees`);
      if (i > 0) assert.deepEqual(list[i].a, list[i - 1].b, 'a zigzag: each diagonal starts where the last one ended');
    }
  }
});

ok('keep-out: every floor-fixed member is at or above the hall\'s top cut, on every floor seat', () => {
  assert.ok(Number.isFinite(ARENA.cut?.top), 'the layout has a top cut');
  assert.equal(ARENA.cut.top, ARENA.rig.bottomH, 'the cut plane is the plane of the lower chords');
  assert.equal(LAYOUT.SIDE?.top, 5, 'the side mark of the top cut');
  for (const floorY of FLOORS) {
    const p = rigPlan(ARENA, { floorY }), house = housePlan(ARENA, { floorY });
    const k = keepOut(p, ARENA, { floorY, house });
    assert.equal(k.ok, true, k.problems.join('; '));
    assert.ok(k.clearance >= -1e-9, `clearance ${k.clearance}`);
    for (const h of p.heads) assert.ok(h.lowest >= p.y0 + 0.02, `head ${h.id}: its lowest point (can and barn doors) is ${(h.lowest - p.y0).toFixed(3)} m over the plane`);
    // house lights, lamp by lamp, against the layout's own test of the camera's reach (not the plan's helper): no lamp's
    // disc (and 0.25 m around it) is at a point the camera can be
    assert.ok(k.houseClear >= RIG.house.cameraClear, `the roof lamps hang ${k.houseClear} m above the camera's highest point under them`);
    for (const l of house) {
      for (const [dx, dz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]]) {
        for (const dh of [-l.r - 0.25, 0, l.r + 0.25]) assert.equal(LAYOUT.inCameraVolume(l.x + dx, l.y - floorY + dh, l.z + dz), false, `${l.kind} lamp at (${l.x}, ${l.y}, ${l.z}) is inside the camera's reach`);
      }
    }
    assert.ok(k.lowest - floorY > 2.2, 'above the stroke room (a raised cue)');
  }
  // the law bites for a lamp too: a roof lamp hung at the ring's height over the island fails
  {
    const p = rigPlan(ARENA), house = [{ x: 4.1, y: -0.79 + RIG.house.ring.h0, z: 2.6, level: 1, r: 0.1, kind: 'roof' }];
    const k = keepOut(p, ARENA, { house });
    assert.equal(k.ok, false);
    assert.match(k.problems[0], /inside the camera's reach/);
  }
  // the law bites: a rig hung 0.2 m lower fails
  const low = { ...ARENA, rig: { ...ARENA.rig, bottomH: ARENA.rig.bottomH - 0.2 } };
  const bad = keepOut(rigPlan(low), low);
  assert.equal(bad.ok, false);
  assert.ok(bad.count > 100);
});

// the table light's housing on the app's canopy rectangle, as a box (arena/rig/housing.js BOX: 0.13 m outside the emitter,
// 0.045 m below its plane, 0.18 m above; the three-loaded check below compares it with the built housing's own box)
const HOUSING_BOX = { min: [CANOPY.x - CANOPY.w / 2 - 0.13, CANOPY.y - 0.045, CANOPY.z - CANOPY.d / 2 - 0.13], max: [CANOPY.x + CANOPY.w / 2 + 0.13, CANOPY.y + 0.18, CANOPY.z + CANOPY.d / 2 + 0.13] };

ok('heads: eight wash heads on the outer upper chords, each over its own side of the island and aimed at it', () => {
  const p = rigPlan(ARENA);
  // (round A7: with RIG.head.over on, the six long-side heads hang INSIDE the truss, over the table's long outline)
  const OVER = RIG.head.over?.on === true ? RIG.head.over : null;
  assert.equal(p.heads.length, 2 * (OVER ? OVER.long.length : RIG.head.long.length) + 2 * RIG.head.short.length);
  assert.equal(p.heads.length, 8, 'eight wash heads (with lamp.band: the rig\'s nine emitters)');
  const L = ARENA.rig.length / 2, W = ARENA.rig.width / 2;
  const count = { north: 0, south: 0, west: 0, east: 0 };
  for (const h of p.heads) {
    count[h.side] += 1;
    assert.ok(Math.abs(Math.hypot(...h.dir) - 1) < 1e-3 && h.dir[1] < -0.9, 'a unit axis that points steeply down');
    // outside the truss rectangle, on the side it lights; the aim point further out on the same side, on the island
    const o = { north: [2, -1, W], south: [2, 1, W], west: [0, -1, L], east: [0, 1, L] }[h.side];
    if (h.over) {
      // over the rail of its own side: inside the table's outline by 0.1 to 0.3 m, inside the truss's inner chords, on an arm
      // from the inner upper chord; the emitter within 8 cm INSIDE the outline (nothing of it passes under the skirt; the rail's
      // top edge throws the shadow's edge within 3 cm of the outline)
      assert.ok(OVER && (h.side === 'north' || h.side === 'south'), 'only a long side\'s heads hang over the outline');
      assert.ok(o[1] * h.pos[2] > 0.8128 - 0.3 && o[1] * h.pos[2] < 0.8128 - 0.1, `head ${h.id} hangs over the rail (z ${h.pos[2]})`);
      assert.ok(o[1] * h.clamp[2] < W - ARENA.rig.section + 0.06 && o[1] * h.clamp[2] > W - ARENA.rig.section - 0.01, `head ${h.id}: its clamp sits on the inner upper chord (z ${h.clamp[2]})`);
      assert.ok(Math.abs(h.pos[0]) <= 1.4478 + 0.05, `head ${h.id} stands within 5 cm of the end outline in x`);
      const e = p.emitters.find((q) => q.id === `rig.head.${h.id}`);
      const dOut = o[1] * e.position[2] - 0.8128, edge = (0.813 * -dOut) / (e.position[1] + 0.768 - 0.813);
      assert.ok(dOut > -0.08 && dOut < 0.005 && edge < 0.03, `head ${h.id}: the emitter stands ${(-dOut).toFixed(3)} m inside the outline; the rail's shadow edge falls ${edge.toFixed(3)} m outside it`);
      assert.ok(e.position[1] < p.y0 - 0.05, `head ${h.id}: the emitter stands under the lower chords`);
      assert.equal(e.size[0], RIG.washOver.source); assert.equal(e.intensity, h.mid ? RIG.washOver.mid : RIG.washOver.intensity); assert.equal(e.cone, RIG.washOver.cone);
      assert.ok(o[1] * h.aim[2] > 1.8 && h.dir[1] < -0.9 && o[1] * h.dir[2] > 0.2, `head ${h.id} is aimed outward at the stroke room`);
      assert.ok(h.aim[0] > ARENA.island.x0 && h.aim[0] < ARENA.island.x1 && h.aim[2] > ARENA.island.z0 && h.aim[2] < ARENA.island.z1, 'the aim point is on the island');
      assert.ok(h.lowest > p.y0, `head ${h.id}: its can and doors stay above the lower chords (${h.lowest} against ${p.y0})`);
      continue;
    }
    assert.ok(o[1] * h.pos[o[0]] > o[2] + 0.1, `head ${h.id} hangs outside the truss on the ${h.side} side`);
    assert.ok(o[1] * h.aim[o[0]] > o[1] * h.pos[o[0]] + 0.25, `head ${h.id} is aimed outward, at its own side`);
    assert.ok(o[1] * h.dir[o[0]] > 0.05, `head ${h.id}: its axis leans outward`);
    assert.ok(h.aim[0] > ARENA.island.x0 && h.aim[0] < ARENA.island.x1 && h.aim[2] > ARENA.island.z0 && h.aim[2] < ARENA.island.z1, 'the aim point is on the island');
    // the lens stands clear of its own truss (outside the outer chords)
    assert.ok(o[1] * h.lens[o[0]] > o[2] + 0.1, 'the lens stands outside the outer chords');
  }
  assert.deepEqual(count, { north: 3, south: 3, west: 1, east: 1 });
});

ok('the heads\' beams against the table light\'s housing: every beam misses the box, every head reaches its own side past it', () => {
  for (const floorY of FLOORS) {
    const p = rigPlan(ARENA, { floorY });
    const r = beamsAgainstHousing(p, HOUSING_BOX, { floorY });
    // (round A7: a head that hangs over the rail has the housing 1.5 m under it and 0.3 m toward the table: the box stands
    // INSIDE the edge of its 40 degree field, where the bell is under a fifth; its axis points away and its own side is
    // lit past the box. The margin's law holds for the two end heads.)
    const overIds = new Set(p.heads.filter((h) => h.over).map((h) => h.id));
    if (!overIds.size) assert.equal(r.ok, true, JSON.stringify(r.heads));
    for (const h of r.heads) {
      assert.equal(h.axisHits, false, `head ${h.id}: the beam's axis crosses the housing`);
      if (overIds.has(h.id)) assert.ok(h.angle >= 22, `head ${h.id} (over the rail): the housing stands ${h.angle} degrees off its axis`);
      else assert.ok(h.margin >= 10, `head ${h.id}: the housing stands ${h.margin} degrees outside the beam's cone (half angle ${RIG.head.beamHalf})`);
      assert.ok(h.own.lit >= 40 && h.own.shaded === 0, `head ${h.id}: ${h.own.lit} floor points of its own side lit, ${h.own.shaded} behind the housing`);
    }
    if (floorY === FLOORS[0]) console.log(`   beams against the housing: the box stands at least ${r.minMargin} degrees outside every beam's ${RIG.head.beamHalf} degree half angle (per head: ${r.heads.map((h) => `${h.id} ${h.angle}`).join(', ')}); own-side floor points lit / shaded: ${r.heads.map((h) => `${h.own.lit}/${h.own.shaded}`).join(' ')}`);
  }
  // the law bites: round A1's cross aim (a head inside the truss aimed over the housing at the far side) fails it
  {
    const p = rigPlan(ARENA);
    const pos = [0, p.y1 - 0.025 + 0.07, -1.01], aim = [0, -0.79, 1.2];
    const l = Math.hypot(aim[0] - pos[0], aim[1] - pos[1], aim[2] - pos[2]), dir = aim.map((v, k) => (v - pos[k]) / l);
    const lens = pos.map((v, k) => v + dir[k] * 0.145);
    const bad = { heads: [{ id: 'x', pos, aim, dir, lens }], emitters: [{ id: 'rig.head.x', position: lens.map((v, k) => v + dir[k] * 0.6) }] };
    const r = beamsAgainstHousing(bad, HOUSING_BOX);
    assert.equal(r.ok, false);
    assert.ok(r.heads[0].margin < 0 && r.heads[0].own.shaded > 0, JSON.stringify(r.heads[0]));
  }
});

ok('the pool around the table is even on all four sides (the room light\'s point law as arithmetic)', () => {
  const p = rigPlan(ARENA), FLOOR = -0.79;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // (round A6: `real` = at each head's own level. With the table keys on (HALL.tableKeys) the heads are the fill, a level
  // per side of the truss; the pool's SHAPE is judged as before, with every head at the wash's level)
  const field = (x, z, real = false) => {
    let E = 0;
    for (const e of p.emitters) {
      let lx = e.position[0] - x, ly = e.position[1] - FLOOR, lz = e.position[2] - z;
      const d2 = lx * lx + ly * ly + lz * lz;
      let w = d2 / (e.radius * e.radius);
      if (w >= 1) continue;
      w = 1 - w * w; w *= w;
      const il = 1 / Math.sqrt(d2); lx *= il; ly *= il; lz *= il;
      let emit = -(e.normal[0] * lx + e.normal[1] * ly + e.normal[2] * lz);
      if (emit <= 0) continue;
      emit = sstep(0, 0.35, emit);
      const ca = -(lx * e.axis[0] + ly * e.axis[1] + lz * e.axis[2]);
      // round A3: a head is a cone (room/light.js CONE: whole inside the beam, nothing outside the field half angle)
      const co = Math.cos((e.cone * Math.PI) / 180);
      emit *= sstep(co, co + (1 - co) * (e.bell ? 1 : 0.64), ca);
      E += (real ? e.intensity : RIG.wash.intensity) * emit * w * ly / d2;
    }
    return E;
  };
  // (the trial bake of 12:58Z: with the heads turned down as a fill the carpet stood at 1.0 unit from 2 m out. The
  // table keys are shuttered to the table and the pool is the heads' again: every head at the wash's level, unless the
  // table keys' plan holds a level per side)
  {
    const T = HALL.tableKeys.on === true ? HALL.tableKeys.heads ?? null : null;
    // (round A7: a head that hangs over the rail has its own level: RIG.washOver; the two end heads keep the wash's)
    const overOf = new Map(p.heads.filter((h) => h.over).map((h) => [`rig.head.${h.id}`, h]));
    for (const e of p.emitters) assert.equal(e.intensity, overOf.has(e.id) ? (overOf.get(e.id).mid ? RIG.washOver.mid : RIG.washOver.intensity) : T ? T[e.id.slice(9, 10)] : RIG.wash.intensity, `${e.id} level`);
    assert.ok(Math.abs(field(0, 1.8128, true) - field(0, 1.8128)) < 1e-9 || T || overOf.size > 0, 'the heads stand at the wash\'s level');
  }
  // every head carries a cone, and the table light's housing stands outside it with 5 degrees to spare (the share that
  // held the heads' light down on the box in rounds A1 and A2 is gone: rig/mat.js)
  for (const e of p.emitters) assert.ok(e.cone >= 25 && e.cone <= 40, `emitter ${e.id}: cone ${e.cone}`);
  // (round A4: the field is 40 degrees. Seen from a head's LENS the housing's nearest point stands 41.7 degrees off the
  // axis: outside the cone. The light itself leaves the emitter's own place, 0.6 m down the beam, and from THERE the
  // housing stands 55 degrees or more off the axis: 15 degrees to spare.)
  // (round A7: a head over the rail sees the housing 25 degrees or more off its axis, in the outer part of its bell: it
  // lights the hood's top a little, as a rig over a table does; the two end heads keep the old law)
  const OVER_IDS = new Set(p.heads.filter((h) => h.over).map((h) => h.id));
  assert.ok(beamsAgainstHousing(p, HOUSING_BOX, { floorY: FLOOR }).heads.every((h) => h.angle >= (OVER_IDS.has(h.id) ? 25 : RIG.wash.cone + 1.5)), 'the housing stands inside a head\'s cone');
  {
    const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    for (const e of p.emitters) {
      let best = -1;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) for (let k = 0; k <= 8; k++) {
        const q = [0, 1, 2].map((a) => HOUSING_BOX.min[a] + ((HOUSING_BOX.max[a] - HOUSING_BOX.min[a]) * [i, j, k][a]) / 8);
        const d = nrm(q.map((v, a) => v - e.position[a]));
        best = Math.max(best, d[0] * e.axis[0] + d[1] * e.axis[1] + d[2] * e.axis[2]);
      }
      const angle = (Math.acos(Math.min(1, best)) * 180) / Math.PI;
      assert.ok(angle >= (OVER_IDS.has(e.id.slice(9)) ? 25 : e.cone + 10), `${e.id}: the housing stands ${angle.toFixed(1)} degrees off the axis from the emitter's place (cone ${e.cone})`);
    }
  }
  // the anchor (CONTRACT 15.2, kept in 16.2): 1 m beside the long rail the heads leave 0.85 to 1.3 units of the 3.0 there
  // (round A4: the hall's ambient adds 0.5 there, so the heads carry 1.05 where round A3 had 1.36)
  // (round A5, CONTRACT 17.1 and 17.2: the playing floor is the bright zone and the pool is the heads'. The ambient and
  // the keys came down, the carpet there goes to 80-95 of 255 = 2.7 to 3.4 units, of which the heads carry 1.6 to 2.2)
  // (round A7: with heads over the rails the field is judged at every head's OWN level: the middle heads stand lower)
  const REAL = OVER_IDS.size > 0, fieldAt = (x, z) => field(x, z, REAL);
  assert.ok(fieldAt(0, 1.8128) > 1.6 && fieldAt(0, 1.8128) < 2.2, `the heads 1 m beside the long rail: ${fieldAt(0, 1.8128).toFixed(2)} units`);
  // 1 m outside the rails (the table's rails end 1.45 m and 0.815 m from its centre), all the way round
  const X = 2.45, Z = 1.815, v = [];
  for (let i = 0; i <= 20; i++) { const x = -X + (2 * X * i) / 20; v.push(fieldAt(x, Z), fieldAt(x, -Z)); }
  for (let i = 1; i < 12; i++) { const z = -Z + (2 * Z * i) / 12; v.push(fieldAt(X, z), fieldAt(-X, z)); }
  const lo = Math.min(...v), hi = Math.max(...v);
  const sides = { north: fieldAt(0, -Z), south: fieldAt(0, Z), west: fieldAt(-X, 0), east: fieldAt(X, 0) };
  // (round A3: real beams. Eight bells of 36 degrees overlap into a ring that is even within 1.4, not within the 1.2 of the
  // old broad lobes: a pool of beams shows its beams. The four sides' middles stay within 1.3 of each other.)
  // (round A7: six heads over the rails and two at the ends: the corners of the ring stand further from a head than its
  // sides: even within 1.75. The price of a pool whose edge at the table is the table's own shadow.)
  assert.ok(hi / lo < (REAL ? 1.75 : 1.4), `the ring 1 m outside the rails: ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
  assert.ok(Math.max(...Object.values(sides)) / Math.min(...Object.values(sides)) < 1.3, JSON.stringify(sides));
  // a pool, not a flood: it falls to the boards and is next to nothing in the island's corners
  const boards = fieldAt(0, ARENA.island.z1 - 0.1), corner = fieldAt(ARENA.island.x1 - 0.3, ARENA.island.z1 - 0.3);
  assert.ok(boards < (REAL ? 0.45 : 0.4) * sides.south && corner < 0.05 * sides.south, `boards ${boards.toFixed(2)}, corner ${corner.toFixed(2)}`);
  console.log(`   pool (units): 1 m outside the rails north ${sides.north.toFixed(2)} south ${sides.south.toFixed(2)} west ${sides.west.toFixed(2)} east ${sides.east.toFixed(2)}; the ring there ${lo.toFixed(2)} to ${hi.toFixed(2)} (x ${(hi / lo).toFixed(2)}); at the boards ${boards.toFixed(2)}; island corner ${corner.toFixed(2)}`);
});

ok('round A2: the second rectangle, the perimeter truss and the roof steel stand where the camera cannot be', () => {
  for (const floorY of FLOORS) {
    const o = outerPlan(ARENA, { floorY }), rf = roofPlan(ARENA, { floorY }), p = rigPlan(ARENA, { floorY });
    const k = hallKeepOut(o, rf, ARENA, { floorY, inVolume: LAYOUT.inCameraVolume });
    assert.equal(k.ok, true, k.problems.join('; '));
    assert.ok(k.sampled > 3000, `${k.sampled} points of the perimeter truss and the roof steel tested against the camera's reach`);
    // the second rectangle: around the first one, its lower chords above the first one's upper chords
    assert.ok(o.y0 > p.y1 + 0.02 && HALL.outer.length > ARENA.rig.length + 2 && HALL.outer.width > ARENA.rig.width + 2);
    assert.equal(o.chords.length, 16);
    // its heads: profiles inside (aimed in and down, at the stroke room of their own side), colour washes outside (aimed out)
    const prof = o.heads.filter((h) => h.kind === 'profile'), col = o.heads.filter((h) => h.kind === 'colour');
    assert.ok(prof.length >= 10 && col.length >= 4 && col.length <= 8, `${prof.length} profiles, ${col.length} colour washes`);
    for (const h of o.heads) {
      assert.ok(h.lowest >= o.y0 - 1e-6 || h.lowest - floorY >= ARENA.cut.top + 0.3, `outer head ${h.id}: lowest point ${(h.lowest - floorY).toFixed(3)} m over the floor`);
      // (round A3: a colour wash is aimed at the lower rows, 20 to 40 degrees below the horizon; a profile stays steep)
      assert.ok((h.kind === 'colour' ? h.dir[1] < -0.34 && h.dir[1] > -0.64 : h.dir[1] < -0.5) && Math.abs(Math.hypot(...h.dir) - 1) < 1e-3, `outer head ${h.id}: dir ${h.dir}`);
      // (round A4, CONTRACT 16.1: a colour wash is ON STANDBY: a dark, neutral lens, no emitter, no haze cone)
      if (h.kind === 'colour') assert.ok(h.standby === true && h.tint.length === 3 && h.tint.every((v) => v > 0 && v < 0.01) && Math.max(...h.tint) / Math.min(...h.tint) < 1.3, `wash ${h.id}: on standby, a dark neutral lens (${h.tint})`);
      else assert.ok(Array.isArray(h.tint) && h.tint.length === 3 && h.tint.every((v) => v > 0.2 && v <= 1), `head ${h.id}: a restrained tint`);
    }
    // (round A5, CONTRACT 17.4: a fixture that shows a lit lens lights something: the 14 profiles are emitters of the
    // BAKE, one each, at its lens, along its axis, a bell of 13 degrees (the cone checked against the housing below),
    // a few candela, neutral; the washes on standby stay no emitter)
    // (round A6: four of the fourteen are the table keys, HALL.tableKeys: `key.<id>`, checked in their own arm below)
    const keyHeads = prof.filter((h) => h.key), plain = prof.filter((h) => !h.key);
    assert.equal(keyHeads.length, HALL.tableKeys.on === true ? 4 : 0);
    assert.deepEqual(o.emitters.map((e) => e.id), [...plain.map((h) => `rig.profile.${h.id}`), ...keyHeads.map((h) => `key.${h.key}`)], 'one bake emitter per profile, none for a wash on standby');
    for (const e of o.emitters.filter((q) => q.id.startsWith('rig.profile.'))) {
      const h = prof.find((q) => `rig.profile.${q.id}` === e.id);
      assert.ok(e.type === 'point' && e.bell === true && e.cone === 13 && e.intensity > 0 && e.intensity <= 8 && e.normal === null, `${e.id}: a bell of 13 degrees, a few candela`);
      assert.ok(e.axis.every((v, k2) => Math.abs(v - h.dir[k2]) < 1e-9) && Math.hypot(...e.position.map((v, k2) => v - h.lens[k2])) < 0.31, `${e.id} stands at its lens, on its axis`);
      assert.ok(e.color[0] === 1 && e.color[1] > 0.93 && e.color[2] > 0.88, `${e.id} is neutral (${e.color})`);
    }
    // no profile's beam (13 degrees half angle) meets the table light's housing; none is a room-light emitter
    const b = beamsAgainstHousing({ heads: plain, emitters: [] }, HOUSING_BOX, { floorY, half: 13 });
    assert.equal(b.ok, true, JSON.stringify(b.heads.filter((h) => h.margin <= 0 || h.axisHits)));
    // (round A6) a table key: a profile's flat field from 30 to 60 degrees over the horizon, aimed at the table's body
    // under the rails; its shutter leaves the table light's housing (all of its box) and the bed dark and the body lit
    for (const e of o.emitters.filter((q) => q.id.startsWith('key.'))) {
      const h = keyHeads.find((q) => `key.${q.key}` === e.id), k = HALL.tableKeys.keys.find((q) => q.id === h.key);
      assert.ok(e.type === 'point' && e.bell === (k.bell === true) && e.cone === (k.cone ?? HALL.tableKeys.cone) && e.intensity === k.intensity && e.normal === null, `${e.id}: its field`);
      assert.ok(e.axis.every((v, k2) => Math.abs(v - h.dir[k2]) < 1e-9) && Math.hypot(...e.position.map((v, k2) => v - h.lens[k2])) < 0.31, `${e.id} stands at its lens, on its axis`);
      const elev = (Math.asin(-h.dir[1]) * 180) / Math.PI;
      assert.ok(elev > 30 && elev < 60 && h.aim[1] < 0 && h.aim[1] > -0.6 && Math.abs(h.aim[0]) < 1.45 && Math.abs(h.aim[2]) < 0.82, `${e.id}: ${elev.toFixed(1)} degrees, aimed at (${h.aim})`);
      const side = (q) => e.shutter[0] * (q[0] - e.position[0]) + e.shutter[1] * (q[1] - e.position[1]) + e.shutter[2] * (q[2] - e.position[2]);
      assert.ok(Math.abs(Math.hypot(...e.shutter) - 1) < 1e-3 && side([0, 0, 0]) < 0, `${e.id}: the bed is on the lit side of its shutter`);
      for (let i = 0; i < 8; i++) assert.ok(side([i & 1 ? HOUSING_BOX.max[0] : HOUSING_BOX.min[0], i & 2 ? HOUSING_BOX.max[1] : HOUSING_BOX.min[1], i & 4 ? HOUSING_BOX.max[2] : HOUSING_BOX.min[2]]) < 0, `${e.id}: the housing is on the lit side of its shutter`);
    }
    assert.equal(p.emitters.length, 8, 'the extra heads add no emitter');
    // the hoists of both rectangles end on the roof's rigging beams; a safety wire beside each
    for (const h of [...p.hoists, ...o.hoists]) {
      assert.ok(Math.abs(h.roofY - floorY - hoistTopH()) < 1e-6);
      assert.ok(rf.rigBeams.some((bm) => Math.abs(bm.a[2] - h.z) < 1e-6 && h.x > bm.a[0] && h.x < bm.b[0] && Math.abs(bm.a[1] - bm.h / 2 - h.roofY) < 1e-6), `the hoist at (${h.x}, ${h.z}) hangs from a rigging beam`);
    }
    assert.equal(o.wires.length, 8);
    assert.equal(o.bonds.length, 2 * (p.heads.length + o.heads.length), 'a safety bond on every head');
    // the roof steel: inside the layout's house-light heights and under the lid; trusses across the hall, purlins along it
    const R = HALL.roof;
    assert.ok(R.mouthH >= ARENA.houseLights.h0 && R.purlinH + R.purlin[1] / 2 < ARENA.hall.height && R.bottomH - R.chord / 2 > ARENA.keepOut.cameraVolume.h1 + 0.3);
    assert.ok(rf.trusses.length >= 4 && rf.purlins.length >= 6 && rf.rigBeams.length === 4);
    for (const t of rf.trusses) assert.ok(t.x > ARENA.hall.x0 && t.x < ARENA.hall.x1 && t.webs.length > 30);
    // AGREED WITH THE SHELL (its lid, deck and ducts: arena/shell/plan.js): the roof steel touches none of them
    {
      const SR = SHELL_PLAN.roof, D = R.ducts;
      assert.deepEqual([D.z, D.r, D.h, D.crossX, D.crossW], [Math.abs(SR.ducts.z[0]), SR.ducts.r, SR.ducts.h, SR.ducts.cross.x, SR.ducts.cross.w], 'the rig\'s copy of the shell\'s duct numbers');
      assert.ok(Math.abs(D.crossLow - (ARENA.hall.height - SR.ribDepth - SR.ducts.cross.d)) < 1e-9, 'the cross duct\'s underside');
      const deck = ARENA.hall.height - SR.ribDepth;
      assert.ok(R.purlinH + R.purlin[1] / 2 <= deck - 0.02, 'the purlins lie under the deck');
      assert.ok(R.topH + R.chord / 2 <= D.h - D.r - 0.05, 'the trusses pass under the round ducts');
      for (const p of rf.purlins) {
        assert.ok(Math.abs(Math.abs(p.a[2]) - D.z) > D.r + p.w / 2 + 0.05, `the purlin at z ${p.a[2]} runs in a round duct`);
        assert.ok(p.b[0] + 0.02 <= D.crossX - D.crossW / 2, `the purlin at z ${p.a[2]} ends short of the cross duct`);
      }
      // every purlin is carried: a stub post on each truss it crosses
      assert.equal(rf.stubs.length, rf.purlins.length * rf.trusses.filter((t) => t.x < rf.purlins[0].b[0]).length);
      for (const t of rf.trusses) assert.ok(t.x + R.chord / 2 < D.crossX - D.crossW / 2 - 0.02 || t.x - R.chord / 2 > D.crossX + D.crossW / 2 + 0.02 || R.topH + R.chord / 2 < D.crossLow - 0.05, `the truss at x ${t.x} against the cross duct`);
      // the perimeter truss's wires end on roof steel that is there: a truss's bottom chord or a purlin
      for (const w of rf.perimeter.wires) {
        const onTruss = rf.trusses.some((t) => Math.abs(t.x - w.b[0]) < 1e-6 && Math.abs(w.b[1] - floorY - (R.bottomH - R.chord / 2)) < 1e-6);
        const onPurlin = rf.purlins.some((p) => Math.abs(p.a[2] - w.b[2]) < 1e-6 && w.b[0] < p.b[0] && Math.abs(w.b[1] - floorY - (R.purlinH - R.purlin[1] / 2)) < 1e-6);
        assert.ok(onTruss || onPurlin, `a wire of the perimeter truss ends in the air at (${w.b})`);
      }
    }
    // the perimeter truss: over the upper seating rows of three sides, beyond the camera's reach, above the seats' head room
    const top = ARENA.seating.firstRowH + (ARENA.seating.rows - 1) * ARENA.seating.rise;
    assert.ok(HALL.perimeter.h - HALL.perimeter.lampDrop - 0.1 >= top + 2.1);
    for (const r of rf.perimeter.runs) for (const s of [r.from, (r.from + r.to) / 2, r.to]) {
      const [x, z] = r.axis === 0 ? [s, r.at] : [r.at, s];
      assert.equal(LAYOUT.cameraCeil(x, z), -Infinity, `the perimeter truss at (${x}, ${z}) is beyond the camera's reach`);
    }
    assert.ok(rf.perimeter.wires.length >= 20 && rf.screens.length >= 3 && rf.screens.length <= 6);
    for (const s of rf.screens) assert.ok(s.c[1] - s.h / 2 - floorY >= top + 1.6 && LAYOUT.cameraCeil(s.c[0], s.c[2]) === -Infinity, 'a screen hangs over the upper rows, beyond the camera');
    if (floorY === FLOORS[0]) console.log(`   second rectangle ${HALL.outer.length} x ${HALL.outer.width} m at ${(o.y0 - floorY).toFixed(2)} m: ${prof.length} profiles, ${col.length} colour washes, lowest member ${k.lowestOuter} m over the floor; roof steel: ${rf.trusses.length} trusses, ${rf.purlins.length} purlins, ${rf.fixtures.filter((f) => f.kind === 'roof').length} bells; perimeter truss: ${rf.fixtures.filter((f) => f.kind === 'ring').length} cans, ${rf.perimeter.wires.length} wires, ${rf.screens.length} screens; ${k.sampled} points outside the camera volume`);
  }
});

ok('round A4: six house floods on drop pipes under the roof steel, aimed out at the seating; a profile spot under the perimeter truss for each key light', () => {
  const { floodPlan, keyPlan } = PLAN_MOD;
  const cosd = (d) => Math.cos((d * Math.PI) / 180);
  for (const floorY of FLOORS) {
    const fl = floodPlan(ARENA, { floorY }), rf = roofPlan(ARENA, { floorY }), F = HALL.floods, R = HALL.roof;
    assert.deepEqual(fl.floods.map((f) => f.id), ['n0', 'n1', 's0', 's1', 'e0', 'e1']);
    assert.deepEqual(fl.emitters.map((e) => e.id), ['house.n0', 'house.n1', 'house.s0', 'house.s1', 'house.e0', 'house.e1']);
    assert.ok(fl.emitters.length <= ARENA.emitters.bake, 'the room\'s share holds them');
    for (const f of fl.floods) {
      // it hangs from steel that is there: a roof truss's bottom chord (north, south) or an outer rigging beam (east)
      const onTruss = rf.trusses.some((t) => Math.abs(t.x - f.pos[0]) < 1e-6) && Math.abs(f.top - floorY - (R.bottomH - R.chord / 2)) < 1e-6;
      const onBeam = rf.rigBeams.some((b) => Math.abs(b.a[2] - f.pos[2]) < 1e-6 && f.pos[0] > b.a[0] && f.pos[0] < b.b[0]) && Math.abs(f.top - floorY - (R.rigBeamH - R.rigBeam[1] / 2)) < 1e-6;
      assert.ok(f.on === 'truss' ? onTruss : onBeam, `flood ${f.id} hangs in the air (${f.pos}, top ${f.top})`);
      // inside the boards' line, above the hall's top cut (the rig's law: dropped while the camera is above that plane)
      assert.ok(Math.abs(f.pos[0]) < ARENA.island.x1 && Math.abs(f.pos[2]) < ARENA.island.z1, `flood ${f.id} hangs inside the boards`);
      assert.ok(f.pos[1] - floorY - F.body.h > ARENA.cut.top + 1, `flood ${f.id} hangs above the rig`);
      // aimed OUT at its own block, 30 to 45 degrees below the horizon
      const out = f.side === 'north' ? -f.dir[2] : f.side === 'south' ? f.dir[2] : f.dir[0];
      assert.ok(out > 0.6 && f.dir[1] < -0.5 && f.dir[1] > -0.71, `flood ${f.id}: dir ${f.dir}`);
      // nothing of its field lands on the island's carpet: the boards' foot on its own side is outside the cone
      const e = fl.emitters.find((x) => x.id === `house.${f.id}`);
      const foot = f.side === 'north' ? [f.pos[0], floorY, ARENA.island.z0 + 0.1] : f.side === 'south' ? [f.pos[0], floorY, ARENA.island.z1 - 0.1] : [ARENA.island.x1 - 0.1, floorY, f.pos[2]];
      const d = foot.map((v, k) => v - e.position[k]), l = Math.hypot(...d);
      const ca = (d[0] * e.axis[0] + d[1] * e.axis[1] + d[2] * e.axis[2]) / l;
      assert.ok(ca <= cosd(e.cone) + 0.02, `flood ${f.id}: the boards' foot is ${(Math.acos(ca) * 180 / Math.PI).toFixed(1)} degrees off the axis (cone ${e.cone})`);
      assert.ok(e.type === 'point' && e.bell === false && e.cone === F.cone && e.intensity === (f.side === 'east' ? F.eastIntensity : F.intensity) && e.normal === null, 'a flat field with a soft edge');
      // round A5 (CONTRACT 17.3): warm white, about 3000 K against the rig's neutral: green 0.7 to 0.85 of the red, blue
      // 0.42 to 0.6; never a red light (no channel under 0.4 of the red)
      assert.ok(e.color[0] === 1 && e.color[1] > 0.7 && e.color[1] < 0.85 && e.color[2] > 0.42 && e.color[2] < 0.6, `flood colour ${e.color}`);
      // round A5 (CONTRACT 17.1: the stands fall off upward): rows 1 and 4 stand inside the flat field, the top row in
      // the cone's soft edge (lit, and less), and the drape 5 m up behind the block is outside the cone
      if (f.side === 'north') {
        const off = (z, h) => { const v = [f.pos[0], floorY + h, z].map((q, k) => q - e.position[k]), vl = Math.hypot(...v); return (v[0] * e.axis[0] + v[1] * e.axis[1] + v[2] * e.axis[2]) / vl; };
        for (const [z, h] of [[-(4.3 + 1.2 + 0.6), 1.2], [-(4.3 + 1.2 + 3 * 0.85 + 0.6), 0.45 + 3 * 0.3 + 0.75]]) assert.ok(off(z, h) > cosd(e.cone * 0.64), `flood ${f.id}: the row at z ${z} is outside the flat field`);
        const top = off(-(4.3 + 1.2 + 7 * 0.85 + 0.6), 2.55 + 0.75);
        assert.ok(top > cosd(e.cone) && top < cosd(e.cone * 0.64), `flood ${f.id}: the top row is not in the soft edge (${(Math.acos(top) * 180 / Math.PI).toFixed(1)} degrees off the axis, cone ${e.cone})`);
        assert.ok(off(ARENA.hall.z0 + 0.1, 5.0) < cosd(e.cone), `flood ${f.id}: its field reaches the drape 5 m up`);
      }
    }
    // the keys: profile spots under the perimeter truss's inner lower chord, aimed across the table
    const ky = keyPlan(ARENA, { floorY }), PM = HALL.perimeter;
    assert.deepEqual(ky.heads.map((h) => h.key), ['north', 'south', 'east']);
    for (const h of ky.heads) {
      assert.equal(h.kind, 'profile');
      assert.ok(h.pos[1] - floorY < PM.h && h.pos[1] - floorY > PM.h - 0.5 && h.lowest - floorY > PM.h - 0.6, `key ${h.id} hangs under the truss`);
      assert.equal(LAYOUT.cameraCeil(h.pos[0], h.pos[2]), -Infinity, `key ${h.id} is beyond the camera's reach`);
      assert.ok(h.dir[1] < -0.3 && h.dir[1] > -0.5, `key ${h.id}: ${(Math.asin(-h.dir[1]) * 180 / Math.PI).toFixed(1)} degrees below the horizon`);
      // its axis passes within 1.6 m of the table's middle on the floor
      const t = (floorY - h.pos[1]) / h.dir[1], hit = [h.pos[0] + h.dir[0] * t, h.pos[2] + h.dir[2] * t];
      assert.ok(Math.hypot(hit[0], hit[1]) < 1.6, `key ${h.id} lands at ${hit}`);
      const at = ky.at[h.key];
      assert.ok(at.axis.every((v, k) => Math.abs(v - h.dir[k]) < 1e-6) && Math.hypot(...at.position.map((v, k) => v - h.lens[k])) < HALL.keys.off + 1e-3, 'the emitter stands at the lens, on the axis');
    }
    // the wall washers: a line of battens on the OUTER upper chord of each run of the perimeter truss, their emitter a
    // one-sided tube just in front of their faces, toward the wall and a little up; the wall 2 to 3.2 m away
    // ROUND A5 (CONTRACT 17.1: walls and drape fall to near black): the wall washers are GONE. The plan holds no run
    // and no emitter; the checks below describe a plan that has them and run over an empty list.
    const wwAll = PLAN_MOD.wallWashPlan(ARENA, { floorY }), per = rf.perimeter;
    assert.equal(HALL.wallwash.on, false, 'the wall washers are off');
    // ROUND A7 (CONTRACT 19.3: the drape's lower third): with HALL.cove on, the same door hands the COVE LINES: a run per
    // seating block behind its top row, one one-sided tube each, aimed up the cloth; nothing of them on the perimeter truss
    const cove = wwAll.runs.filter((r) => r.cove === true);
    if (HALL.cove?.on === true) {
      const S = ARENA.seating, depth = S.front + S.rows * S.tread, deckH = S.firstRowH + (S.rows - 1) * S.rise;
      assert.deepEqual(cove.map((r) => r.id).sort(), ['east', 'north', 'south']);
      assert.deepEqual(wwAll.emitters.filter((e) => e.id.startsWith('house.cove.')).map((e) => e.id).sort(), ['house.cove.east', 'house.cove.north', 'house.cove.south']);
      for (const r of cove) {
        const e = wwAll.emitters.find((q) => q.id === `house.cove.${r.id}`);
        const edge = r.id === 'north' ? ARENA.island.z0 - depth : r.id === 'south' ? ARENA.island.z1 + depth : ARENA.island.x1 + depth;
        const wall = r.id === 'north' ? ARENA.hall.z0 : r.id === 'south' ? ARENA.hall.z1 : ARENA.hall.x1;
        // behind the top deck's rear edge, in front of the wall's cloth (its pleats stand up to 0.12 m off the wall)
        assert.ok(Math.abs(r.at) > Math.abs(edge) + 0.03 && Math.abs(r.at) < Math.abs(wall) - 0.17, `cove ${r.id}: its line at ${r.at} between the deck's edge ${edge} and the cloth before ${wall}`);
        assert.ok(Math.abs(r.y - floorY - deckH) < 0.2, `cove ${r.id}: at the top deck's height`);
        assert.equal(e.type, 'tube'); assert.ok(Math.abs(e.intensity / e.size[0] - HALL.cove.perMetre) < 1e-2 && HALL.cove.perMetre > 0 && HALL.cove.perMetre <= 8);
        const k = r.axis === 0 ? 2 : 0;
        assert.ok(e.normal[1] > 0.9 && e.normal[k] * r.out[k] > 0.1 && Math.abs(Math.hypot(...e.normal) - 1) < 1e-3, `cove ${r.id}: its lobe points up the cloth`);
        assert.ok(e.radius <= 7, `cove ${r.id}: reach ${e.radius} m`);
        assert.equal(LAYOUT.cameraCeil(r.axis === 0 ? 0 : r.at, r.axis === 0 ? r.at : 0), -Infinity, `cove ${r.id} is inside the camera's reach`);
      }
    } else { assert.deepEqual(wwAll.runs, []); assert.deepEqual(wwAll.emitters.filter((e) => !e.id.startsWith('house.drape.')), []); }
    // ROUND A7, the drape wash (HALL.drapeWash; CONTRACT 19.3: the drape's lower third, which in the play views is the
    // hall's two east corners): one flood beside each east flood on its rigging beam, aimed into its corner, with a
    // narrower field than a house flood's; bake only (the same door hands its emitters on). Off: nothing is planned.
    const dw = PLAN_MOD.drapeWashPlan(ARENA, { floorY }), dwE = wwAll.emitters.filter((e) => e.id.startsWith('house.drape.'));
    if (HALL.drapeWash?.on === true) {
      const D = HALL.drapeWash;
      assert.deepEqual(dw.floods.map((f) => f.id), ['d0', 'd1']); assert.deepEqual(dwE.map((e) => e.id), ['house.drape.d0', 'house.drape.d1']);
      assert.deepEqual(wwAll.floods, dw.floods);
      for (const f of dw.floods) {
        const east = fl.floods.find((q) => q.id === `e${f.id.slice(1)}`), e = dwE.find((q) => q.id === `house.drape.${f.id}`);
        assert.ok(f.pos[0] > east.pos[0] + 0.5 && f.pos[1] === east.pos[1] && f.pos[2] === east.pos[2] && f.top === east.top && f.on === 'rigBeam', `${f.id}: beside its east flood on the rigging beam`);
        assert.ok(rf.rigBeams.some((b) => Math.abs(Math.abs(b.a[2]) - Math.abs(f.pos[2])) < 0.35 && f.pos[0] <= Math.max(b.a[0], b.b[0]) - 0.2), `${f.id}: under its beam`);
        // aimed into its corner: past both blocks' ends, at the cloth's height the play views see
        assert.ok(f.aim[0] > ARENA.island.x1 + 3 && Math.abs(f.aim[2]) > ARENA.island.z1 + 3 && Math.sign(f.aim[2]) === Math.sign(f.pos[2]) && f.aim[1] - floorY > 3.5 && f.aim[1] - floorY < 5.5, `${f.id}: aimed into its corner`);
        assert.ok(Math.abs(Math.hypot(...f.dir) - 1) < 1e-3 && f.dir[1] < 0 && f.dir[1] > -0.4, `${f.id}: a unit axis, a little down`);
        assert.equal(e.type, 'point'); assert.equal(e.normal, null); assert.deepEqual(e.axis, f.dir); assert.deepEqual(e.color, HALL.floods.color.slice());
        assert.ok(e.cone <= HALL.floods.cone && e.cone >= 20 && e.intensity === D.intensity && D.intensity > 0 && D.intensity <= 250, `${f.id}: a narrower field than a house flood's`);
      }
    } else { assert.deepEqual(dw, { floods: [], emitters: [] }); assert.deepEqual(dwE, []); assert.ok(!(wwAll.floods?.length > 0)); }
    const ww = { runs: wwAll.runs.filter((r) => r.cove !== true), emitters: wwAll.emitters.filter((e) => e.id.startsWith('house.wall.')) };
    for (const r of ww.runs) {
      const run = per.runs.find((q) => q.id === `p.${r.id}`), e = ww.emitters.find((q) => q.id === `house.wall.${r.id}`);
      assert.ok(run && e && e.type === 'tube', `wall washer ${r.id}`);
      const outer = run.at - run.inner * (PM.section / 2); // the truss's outer face
      assert.ok(Math.abs(r.at - outer) < 0.08 && Math.abs(r.at) > Math.abs(run.at), `${r.id}: the battens are not on the truss's outer face (${r.at} against ${outer})`);
      assert.ok(Math.abs(r.y - (per.y1 - RIG.chordR)) < 0.05, `${r.id}: the battens are not at the upper chords`);
      assert.ok(r.from > run.from && r.to < run.to && r.battens.length >= 10, `${r.id}: ${r.battens.length} battens from ${r.from} to ${r.to}`);
      const B = HALL.wallwash.batten;
      for (let i = 1; i < r.battens.length; i++) assert.ok(r.battens[i] - r.battens[i - 1] >= B.len + 0.05, `${r.id}: two battens overlap`);
      const [ex, , ez] = e.position, wall = r.id === 'north' ? ez - ARENA.hall.z0 : r.id === 'south' ? ARENA.hall.z1 - ez : ARENA.hall.x1 - ex;
      assert.ok(wall > 2 && wall < 3.2, `${r.id}: the wall is ${wall.toFixed(2)} m from the emitter`);
      assert.ok(e.normal[0] * r.out[0] + e.normal[2] * r.out[2] > 0.9 && e.normal[1] > -0.4 && e.normal[1] < 0.2, `${r.id}: normal ${e.normal}`);
      assert.ok(Math.abs(e.intensity / e.size[0] - HALL.wallwash.perMetre) < 1e-2, `${r.id}: ${e.intensity} cd over ${e.size[0]} m`);
      assert.equal(LAYOUT.cameraCeil(ex, ez), -Infinity, `${r.id}: beyond the camera's reach`);
      // the tube's law on its wall: between 1 and 2.4 units from 4 to 6.5 m up, 0.6 to 1.2 at 3 m
      const E = (h) => {
        const p = r.id === 'north' ? [ex, floorY + h, ARENA.hall.z0 + 0.1] : r.id === 'south' ? [ex, floorY + h, ARENA.hall.z1 - 0.1] : [ARENA.hall.x1 - 0.1, floorY + h, ez];
        const l = [e.position[0] - p[0], e.position[1] - p[1], e.position[2] - p[2]], d = Math.hypot(...l);
        const emit = -(e.normal[0] * l[0] + e.normal[1] * l[1] + e.normal[2] * l[2]) / d, cosn = Math.abs(r.id === 'east' ? l[0] : l[2]) / d;
        const w = (1 - (d / e.radius) ** 4) ** 2;
        return (e.intensity * Math.max(0, emit) * w * cosn) / (d * d + (e.size[0] / 2) * d + e.size[1] * e.size[1]);
      };
      for (const h of [4, 5, 6.5]) assert.ok(E(h) > 1.0 && E(h) < 2.4, `${r.id}: ${E(h).toFixed(2)} units on the wall at ${h} m`);
      assert.ok(E(3) > 0.6 && E(3) < 1.2, `${r.id}: ${E(3).toFixed(2)} units on the wall at 3 m`);
      if (floorY === FLOORS[0] && r.id === 'north') console.log(`   wall washers: ${r.battens.length} battens per run at ${(r.y - floorY).toFixed(2)} m; on the north wall ${[3, 4, 5, 6.5].map((h) => `${E(h).toFixed(2)} at ${h} m`).join(', ')} (units, no occlusion)`);
    }
    if (floorY === FLOORS[0]) console.log(`   house floods: ${fl.floods.map((f) => `${f.id} (${f.pos.map((v, k) => (k === 1 ? v - floorY : v).toFixed(2)).join(', ')}) ${(Math.asin(-f.dir[1]) * 180 / Math.PI).toFixed(1)} deg down`).join('; ')}; keys: ${ky.heads.map((h) => `${h.id} (${h.pos.map((v, k) => (k === 1 ? v - floorY : v).toFixed(2)).join(', ')}) ${(Math.asin(-h.dir[1]) * 180 / Math.PI).toFixed(1)} deg down`).join('; ')}`);
  }
  // the signature moves with a flood's place and not with its level
  assert.notEqual(rigSignature({ ...ARENA, island: { ...ARENA.island, z1: ARENA.island.z1 + 0.2 } }), rigSignature(ARENA));
  // the fixtures are built on every tier; no violet is left in the rig's wash
  const rigSrc = src('../../scene/club/arena/rig.js');
  assert.ok(/buildHouseLights\(built\.parts, [^\n;]*floods\.floods[^\n;]*, keys\.heads/.test(rigSrc), 'the rig builds the floods (the drape wash with them) and the key spots');
  const wash = /roof: \[([0-9., ]+)\]/.exec(rigSrc)[1].split(',').map(Number);
  assert.ok(wash.length === 3 && wash[2] <= wash[1] && wash[1] <= wash[0], `the roof steel's wash is neutral to warm (${wash})`);
});

ok('haze cones: one per head, the high tier only, never in a cube render, a switch, never brighter than what they light', () => {
  const p = rigPlan(ARENA), o = outerPlan(ARENA), beams = hazeBeams(p, o);
  // (round A4: a head on standby has no beam)
  // (round A6, CONTRACT 18.1: beams read against a dark wall by their own in-scatter: a head's WIDE wash gets no cone
  // when its share is 0 (it was a veil over the drape, not a beam); a table key's narrow beam gets the brightest one,
  // by its candela)
  assert.equal(beams.length, (HAZE.share.wash > 0 ? p.heads.length : 0) + o.heads.filter((h) => !h.standby).length);
  if (HALL.tableKeys.on === true && HAZE.share.key > 0) {
    const kb = beams.filter((b) => b.kind === 'key');
    assert.equal(kb.length, 4);
    for (const b of kb) assert.ok(b.r1 < 0.45 && b.level > 0, `key cone ${b.id}: ${b.r1} m wide, level ${b.level}`);
    assert.ok(Math.max(...kb.map((b) => b.level)) > 2 * Math.max(...beams.filter((q) => q.kind !== 'key').map((q) => q.level)), 'the dominant key\'s beam is the brightest');
  }
  assert.ok(beams.every((b) => b.kind !== 'colour'), 'no cone on a wash that is on standby');
  // what the beams light: the pool's carpet (9.7 units, the island's albedo): its radiance
  const island = parseInt(LAYOUT.PALETTE.island.slice(1, 3), 16) / 255, albedo = Math.pow((island + 0.055) / 1.055, 2.4);
  const pool = (9.7 * albedo) / Math.PI;
  for (const b of beams) {
    const end = b.from.map((v, k) => v + b.dir[k] * b.len);
    assert.ok(end[1] > -0.79 + 0.05 && end[1] < b.from[1] - 1, `cone ${b.id} ends above the floor (${(end[1] + 0.79).toFixed(2)} m)`);
    assert.ok(b.r1 > b.r0 && b.r1 < 1.6, `cone ${b.id}: ${b.r0} to ${b.r1} m wide`);
    // the peak is at the lens (the law only falls with the width): a quarter of the pool's radiance at most
    assert.ok(HAZE.level * b.level * Math.max(...b.tint) <= pool / 4, `cone ${b.id}: peak ${(HAZE.level * b.level).toFixed(3)} against the pool's ${pool.toFixed(3)}`);
  }
  assert.ok(HAZE.fall > 0, 'a cone only gets dimmer away from its lens');
  const rig = src('../../scene/club/arena/rig.js'), hz = src('../../scene/club/arena/rig/haze.js');
  assert.ok(rig.includes("flags.includes('haze:0')") && rig.includes('if (hazeOff || detail < 2) return;'), 'the switch ?clubrig=haze:0; the high tier only');
  assert.ok(rig.includes("haze && m === haze.mesh && cam.parent?.type === 'CubeCamera'"), 'hidden for every cube render');
  assert.ok(hz.includes('AdditiveBlending') && hz.includes('depthWrite: false') && !/MeshStandardMaterial/.test(hz), 'additive cards of an own shader (the bake tool takes standard materials only)');
  assert.ok(hz.includes('pos.set(b.from, v * 3)'), 'every vertex of a card sits at its lens (nothing near the floor for a bounding-box reader)');
  console.log(`   haze: ${beams.length} cones, peak ${HAZE.level} at a lens against ${pool.toFixed(3)} of the pool's carpet (x ${(HAZE.level / pool).toFixed(2)})`);
});

ok('round A5: sources that read as sources; lit screens that carry the layout\'s words only; no sprite; floods\' beams in the haze (CONTRACT 17.1, 17.4)', () => {
  const { LENS_ATLAS, atlasUV, floodBeams, floodPlan, FLOOD_BEAM } = PLAN_MOD;
  const rig = src('../../scene/club/arena/rig.js'), mat = src('../../scene/club/arena/rig/mat.js'), steel = src('../../scene/club/arena/rig/steel.js');
  const BLOOM = 1.35; // the arena's bloom threshold (tiers.js VENUES.arena.bloom; the table role's)
  assert.ok(src('../../scene/club/tiers.js').includes('threshold: 1.35'), 'the post chain\'s bloom threshold moved: re-check every level here');
  // ---- the atlas: rectangles inside the texture, none overlapping, one slide per word of the layout
  const rects = [LENS_ATLAS.lens, LENS_ATLAS.led, ...LENS_ATLAS.slides];
  for (const r of rects) assert.ok(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= LENS_ATLAS.size && r[1] + r[3] <= LENS_ATLAS.size, `atlas rectangle ${r}`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `atlas rectangles ${a} and ${b} overlap`);
  }
  assert.equal(LENS_ATLAS.slides.length, LAYOUT.WORDS.length, 'one slide per word');
  assert.deepEqual(atlasUV([0, 0, 128, 128], 0, 1), [0, 1]); assert.deepEqual(atlasUV([0, 0, 128, 128], 1, 0), [0.25, 0.75]);
  // ---- the words: the texture is drawn from the layout's WORDS and holds no other string that could be drawn
  assert.ok(rig.includes('lensTexture(Array.isArray(LAYOUT.WORDS) ? LAYOUT.WORDS.slice() : []'), 'the rig hands the layout\'s WORDS to the texture');
  const drawn = [...mat.matchAll(/fillText\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(drawn, ['word'], `the texture draws ${drawn.join(', ')}`);
  assert.ok(mat.includes('const [x0, y0, W, H] = rect, M = 3, word = String(words[i % Math.max(1, words.length)] ?? \'\');'), 'a slide\'s word is one of the words handed in');
  // ---- levels: a lens's core is over the bloom threshold at every angle in front of it; a screen stays far under it
  const lensLevel = Number(/const LENS_LEVEL = ([0-9.]+);/.exec(rig)[1]), law = /const LENS_LAW = \[([0-9., ]+)\];/.exec(rig)[1].split(',').map(Number);
  const HOT = PLAN_MOD.LENS_HOT;
  assert.ok(HOT >= 1.2 && HOT <= 3, `LENS_HOT ${HOT}`);
  // The lens map's MEAN is what a small lens shows (the table role's measurement): it is computed here from the map's
  // own law as the source states it (a Gaussian core of sigma S at 1.0, a field of 0.07, rings of 0.03, a dark rim).
  assert.ok(mat.includes('const { level: v, core } = lensLaw(r);'), 'the map draws the plan\'s lens law');
  const mean = PLAN_MOD.lensMean(400);
  assert.ok(mean > 0.36 && mean < 0.5, `the lens map's mean ${mean.toFixed(3)}`);
  const onAxis = lensLevel * HOT * mean, worst = onAxis * law[0], peak = lensLevel * HOT;
  // the lens keeps a face: its ring (0.75 to 0.9 R) is bright glass under the bloom threshold, its rim is dark
  const ringLv = PLAN_MOD.lensLaw(0.82).level * peak;
  assert.ok(ringLv > 0.5 && ringLv < BLOOM && PLAN_MOD.lensLaw(0.3).level === 1 && PLAN_MOD.lensLaw(0.995).level < 0.01, `a lit lens's ring: ${ringLv.toFixed(2)} (under the threshold ${BLOOM})`);
  // a far lens's disc: a mean of 7 to 10.5 square on (a halo that reads and falls off inside 16 px), over the threshold
  // with a margin at the worst angle, the peak far under the lens's clamp (64)
  assert.ok(onAxis >= 7 && onAxis <= 10.5 && worst > BLOOM * 1.5 && peak < 32, `a lit lens: mean ${onAxis.toFixed(2)} square on, ${worst.toFixed(2)} at the worst angle, peak ${peak.toFixed(1)} (threshold ${BLOOM})`);
  const SC = HALL.screens;
  // (a screen: far under the threshold. Its white is set on the frame: the app shows 0.68 of this radiance, so 0.33 is
  // level 143 of 255 and the lit face's mean, 0.6 of it, about 105: CONTRACT 17.2's 95 to 130)
  assert.ok(SC.white < BLOOM / 4 && SC.white * SC.mean * 0.68 > 0.095 && SC.white * SC.mean * 0.68 < 0.18, `a screen's white ${SC.white}, its mean on the frame ${(SC.white * SC.mean * 0.68).toFixed(3)} (levels 95 to 130 of 255 are 0.095 to 0.18 of radiance)`);
  assert.ok(SC.tint[2] <= SC.tint[0] * 1.12 && SC.tint[1] <= SC.tint[0] * 1.08, 'a screen\'s white is near neutral');
  for (const s of roofPlan(ARENA).screens) assert.ok(Number.isInteger(s.slide) && s.slide >= 0 && s.slide < LENS_ATLAS.slides.length, `a screen's slide ${s.slide}`);
  // the house lights' mouths: at half, warm white, the core over the threshold seen square on
  const houseFace = Number(/export const HOUSE_FACE = ([0-9.]+),/.exec(steel)[1]);
  assert.ok(houseFace >= 0.3 && houseFace <= 0.9 && onAxis * houseFace * 0.55 > BLOOM * 1.5, `the dimmest bell's mouth square on: ${(onAxis * houseFace * 0.55).toFixed(2)}`);
  // ---- no sprite, no painted glare, no wall washer, no wall lamp
  assert.equal(RIG.house.wall.lit, false, 'the wall lamps are off');
  assert.ok(rig.includes('const house = buildHouse(wallLamps, {') && rig.includes('glare: 0 });') && rig.includes('house.mesh.visible = wallLamps.length > 0;'), 'the camera-facing lamp mesh holds the wall lamps only, is drawn only when there are some, and paints no halo');
  assert.ok(!/cameraPosition/.test(steel) && !/cameraPosition/.test(src('../../scene/club/arena/rig/truss.js')), 'no geometry of a lit face reads the camera');
  // ---- the floods' beams: one per flood, in its colour, from its face, ending above the rows it lands on
  const fb = floodBeams(floodPlan(ARENA));
  assert.equal(fb.length, 6);
  for (const b of fb) {
    const end = b.from.map((v, k) => v + b.dir[k] * b.len);
    assert.ok(b.kind === 'flood' && b.len === FLOOD_BEAM && end[1] + 0.79 > 2.2 && b.r1 > b.r0 && b.r1 < 1.6, `flood cone ${b.id} ends ${(end[1] + 0.79).toFixed(2)} m up, ${b.r1} m wide`);
    assert.deepEqual(b.tint, HALL.floods.color.slice());
    assert.ok(HAZE.level * b.level <= 0.054 / 4, 'a flood\'s cone is under a quarter of the radiance of the seats it lights');
  }
  assert.ok(rig.includes('beams.push(...floodBeams(floods))'), 'the rig adds the floods\' beams to the one haze mesh');
  console.log(`   a lit lens's disc: mean ${worst.toFixed(2)} (worst angle) to ${onAxis.toFixed(2)} (square on), peak ${peak.toFixed(1)}, the map's mean ${mean.toFixed(3)} (bloom threshold ${BLOOM}); a bell's mouth ${(onAxis * houseFace * 0.55).toFixed(2)} to ${(onAxis * houseFace).toFixed(2)} square on; a screen's white ${SC.white}, mean ${(SC.white * SC.mean).toFixed(3)}; ${fb.length} flood cones ending ${(fb[0].from[1] + fb[0].dir[1] * fb[0].len + 0.79).toFixed(2)} m up`);
});

ok('emitters: one per head, ids unique, within the layout\'s share together with lamp.band', () => {
  const p = rigPlan(ARENA);
  const ids = p.emitters.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^rig\.head\.[nsew]\d$/.test(id)));
  assert.equal(ids.length, 8);
  assert.match(rigSignature(ARENA), /^rig2\.[0-9a-f]{8}$/, 'signature(): a short string');
  assert.equal(rigSignature(ARENA), rigSignature(ARENA));
  {
    // it moves with the truss, and not with a level
    const moved = { ...ARENA, rig: { ...ARENA.rig, length: ARENA.rig.length + 0.1 } };
    assert.notEqual(rigSignature(moved), rigSignature(ARENA));
  }
  const band = lampSpillBaked();
  assert.equal(band.length, 1);
  assert.equal(band[0].id, 'lamp.band');
  // (round A4: `lamp.band` is bake-only in the arena: the rig's run-time share is the eight heads; the room's is the six
  // house floods; with the shell's four and the surround's six that is the room light's 24)
  assert.ok(ids.length <= ARENA.emitters.rig, `${ids.length} heads <= ${ARENA.emitters.rig}`);
  assert.equal(ARENA.emitters.bake + ARENA.emitters.rig + ARENA.emitters.shell + ARENA.emitters.surround + ARENA.emitters.floor, 24, 'the shares add up to the room light\'s 24');
  {
    const rigSrc = src('../../scene/club/arena/rig.js'), roomSrc = src('../../scene/club/arena/room.js');
    assert.ok(roomSrc.includes('spill: false }, partWait)'), 'the room builds the rig without a run-time spill emitter');
    assert.ok(rigSrc.includes('for (const sp of lampSpillBaked()) out.push({'), 'the rig hands lamp.band to the bake');
  }
  for (const e of p.emitters) {
    assert.equal(e.type, 'point');
    assert.ok(e.intensity > 0 && e.radius > 4 && e.size[1] > 0 && e.size[1] <= 1);
    assert.deepEqual(e.normal, [0, -1, 0], 'a head lights only what is below its emitter point');
    assert.ok(e.axis[1] < -0.5 && Math.abs(Math.hypot(...e.axis) - 1) < 1e-3, 'the lobe runs along the beam');
    // the emitter point stands down the beam, below every member of the rig (so no head floods its own truss) and far above the carpet
    assert.ok(e.position[1] < p.y0 - 0.1 && e.position[1] > p.y0 - 1.0, `emitter ${e.id} at y ${e.position[1]}`);
    const h = p.heads.find((x) => `rig.head.${x.id}` === e.id);
    const along = e.position.map((v, k) => v - h.lens[k]);
    const thr = h.over ? RIG.head.over.throw : RIG.wash.throw; // (round A7: a head over the rail stands its emitter a shorter way down)
    assert.ok(Math.abs(Math.hypot(...along) - thr) < 1e-3 && along.every((v, k) => Math.abs(v - h.dir[k] * thr) < 1e-3), 'on the beam axis');
  }
  // the same list on every tier and every floor seat (only the heights move): the bake's signature holds
  const q = rigPlan(ARENA, { floorY: -0.85 });
  assert.deepEqual(q.emitters.map((e) => [e.id, e.position[0], e.position[2]]), p.emitters.map((e) => [e.id, e.position[0], e.position[2]]));
});

ok('house lights: seeded, sparse, slightly irregular, clear of the rig, inside the hall', () => {
  const a = housePlan(ARENA), b = housePlan(ARENA);
  assert.deepEqual(a, b, 'the same field on every call');
  assert.ok(a.length >= 40 && a.length <= 140, `${a.length} lamps`);
  const hl = ARENA.houseLights, hall = ARENA.hall, K = RIG.house;
  const roof = roofPlan(ARENA);
  assert.equal(a.length, roof.fixtures.length + a.filter((l) => l.kind === 'wall').length, 'every roof and ring lamp is a fixture of the roof plan');
  const heights = new Set();
  const by = { roof: [], ring: [], wall: [] };
  for (const l of a) {
    const h = l.y + 0.79;
    assert.ok(by[l.kind], `a lamp's kind (${l.kind})`);
    by[l.kind].push(l);
    assert.ok(l.x > hall.x0 && l.x < hall.x1 && l.z > hall.z0 && l.z < hall.z1 && h < hall.height, 'inside the hall');
    assert.ok(!(Math.abs(l.x) < ARENA.rig.length / 2 + 1 && Math.abs(l.z) < ARENA.rig.width / 2 + 1), 'none over the rig');
    assert.ok(l.level >= 0.55 && l.level <= 1 && l.r > 0.05);
    if (l.kind === 'roof') {
      assert.ok(h >= hl.h0 - 1e-6 && h <= hl.h1 + 1e-6, 'a roof lamp hangs between the layout heights'); heights.add(h.toFixed(3));
      // IN A FIXTURE ON THE ROOF STEEL: straight under a purlin (the purlins run along x on the lamp rows), on its drop rod
      const f = roof.fixtures.find((q) => q.kind === 'roof' && q.x === l.x && q.z === l.z);
      assert.ok(f && roof.purlins.some((p) => Math.abs(p.a[2] - l.z) < 1e-6 && l.x > p.a[0] && l.x < p.b[0] && Math.abs(f.top - (p.a[1] - p.h / 2)) < 1e-6), `the roof lamp at (${l.x}, ${l.z}) hangs under a purlin`);
    }
    if (l.kind === 'ring') {
      assert.ok(Math.abs(h - (HALL.perimeter.h - HALL.perimeter.lampDrop)) < 1e-6, 'a low lamp hangs under the perimeter truss');
      // IN A CAN UNDER THE PERIMETER TRUSS: under the centre line of one of its runs
      assert.ok(roof.perimeter.runs.some((r) => (r.axis === 0 ? Math.abs(l.z - r.at) < 1e-6 && l.x > r.from && l.x < r.to : Math.abs(l.x - r.at) < 1e-6 && l.z > r.from && l.z < r.to)), `the low lamp at (${l.x}, ${l.z}) hangs under the perimeter truss`);
      assert.equal(LAYOUT.cameraCeil(l.x, l.z), -Infinity, 'the ring hangs only where the camera cannot be');
      // above the seating under it: the top row's floor plus a standing person and a hand
      const top = ARENA.seating.firstRowH + (ARENA.seating.rows - 1) * ARENA.seating.rise;
      assert.ok(h - l.r >= top + 2.1, `a ring lamp ${(h - l.r - top).toFixed(2)} m over the top row's floor`);
    }
    {
      // no lamp of any kind in the backdrop wall (0.5 m to either side of its plane, inside its span, under its top edge)
      const bd = ARENA.backdrop;
      assert.ok(!(Math.abs(l.x - bd.x) < 0.5 && l.z > bd.z0 - 0.3 && l.z < bd.z1 + 0.3 && h - l.r < bd.height + 0.3), `a ${l.kind} lamp at (${l.x}, ${l.z}) stands in the backdrop`);
    }
    if (l.kind === 'wall') {
      assert.ok(Math.abs(h - K.wall.h) < 1e-6 && h < ARENA.cut.top, 'a wall lamp stands below the hall\'s top cut');
      const onEast = Math.abs(l.x - (hall.x1 - K.wall.inset)) < 1e-6, onNS = Math.abs(Math.abs(l.z) - (hall.z1 - K.wall.inset)) < 1e-6;
      assert.ok(onEast || onNS, 'on the east, north or south wall');
      // beside a seating block, never behind one (its back rows stand against the wall)
      for (const b of ARENA.seating.blocks) {
        const f = LAYOUT.blockFootprint(b);
        assert.ok(!(l.x > f.x0 - 0.3 && l.x < f.x1 + 0.3 && l.z > f.z0 - 0.3 && l.z < f.z1 + 0.3), `a wall lamp at (${l.x}, ${l.z}) stands in the ${b.id} block`);
        if (onEast && b.side === 'east') assert.ok(l.z > b.to + 0.3 || l.z < b.from - 0.3, 'beside the east block');
        if (onNS && b.side !== 'east') assert.ok(l.x > b.to + 0.3 || l.x < b.from - 0.3, 'beside the block');
      }
    }
  }
  assert.equal(heights.size, 1, 'the roof lamps\' mouths hang in one plane (one length of drop rod)');
  assert.ok(by.roof.length >= 25 && by.ring.length >= 16 && by.wall.length >= 16, `roof ${by.roof.length}, ring ${by.ring.length}, wall ${by.wall.length}`);
  // no two lamps closer than a third of the pitch (jitter never merges two points)
  const grid = [...by.roof];
  for (let i = 0; i < grid.length; i++) for (let k = i + 1; k < grid.length; k++) assert.ok(Math.hypot(grid[i].x - grid[k].x, grid[i].z - grid[k].z) > hl.pitchX / 3);
  // WHAT A REVIEW POSE CAN HOLD (pure projection, nothing in the way counted): the count of lamps inside each frame, and for
  // the wide pose how many of them stand in the frame's upper third
  const seen = (v) => {
    const vp = lookAtViewProj(v.cam, v.target, v.fov, 16 / 9);
    const res = { roof: 0, ring: 0, wall: 0, upperThird: 0 };
    for (const l of a) {
      const w = vp[3] * l.x + vp[7] * l.y + vp[11] * l.z + vp[15];
      if (w <= 0.1) continue;
      const sx = (vp[0] * l.x + vp[4] * l.y + vp[8] * l.z + vp[12]) / w, sy = (vp[1] * l.x + vp[5] * l.y + vp[9] * l.z + vp[13]) / w;
      if (Math.abs(sx) > 0.97 || Math.abs(sy) > 0.97) continue;
      res[l.kind] += 1;
      if (sy > 1 / 3) res.upperThird += 1;
    }
    return res;
  };
  const at = Object.fromEntries(VIEWS.map((v) => [v.id, seen(v)]));
  console.log(`   lamps: roof ${by.roof.length}, ring ${by.ring.length}, wall ${by.wall.length}; inside the frame (roof / ring / wall): ${['V1', 'V3', 'V9', 'V10', 'BACK', 'TV'].map((id) => `${id} ${at[id].roof} / ${at[id].ring} / ${at[id].wall}`).join('   ')}; V10 upper third ${at.V10.upperThird}`);
  assert.ok(at.V10.upperThird >= 8, `V10 holds ${at.V10.upperThird} lamps in its upper third`);
  assert.ok(at.V3.wall >= 4, `V3 holds ${at.V3.wall} wall lamps`);
  // the geometry that no lamp height changes: V1 looks below the horizon, so nothing above its eye is ever in its frame
  assert.equal(at.V1.roof + at.V1.ring, 0, 'V1 cannot hold a roof or ring lamp (its top edge is below the horizon)');
  const r = seeded(7); const first = r(); assert.ok(first >= 0 && first < 1 && seeded(7)() === first);
});

// ---- the luminaire's interface ----------------------------------------------------------------------------------------------------
const shape = (v) => (Array.isArray(v) ? (v.length && typeof v[0] === 'object' && v[0] !== null ? [shape(v[0])] : 'array') : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])])) : typeof v);
const FIXTURES = {
  canopy: [{ ...CANOPY }],
  strip: [{ x: 0, y: 1.15, z: 0, w: 2.984, d: 0.2 }],
  carom: [{ x: 0, y: 1.02, z: 0, w: 2.6, d: 0.35 }],
  pendant: [-0.55, 0, 0.55].map((x) => ({ x, y: 0.9, z: 0, w: 0.26, d: 0.26 })),
};

ok('rig.js keeps the luminaire\'s interface and names (read from the source)', () => {
  const rig = src('../../scene/club/arena/rig.js'), lum = src('../../scene/club/arena/rig/luminaire.js');
  for (const k of ['group', 'emissives', 'update(camera, dt)', 'setTier(tier)', 'counts()', 'face()', 'state()', 'dispose()']) assert.ok(rig.includes(k), `buildRig returns ${k}`);
  assert.ok(/export async function buildRig\(club, \{[^}]*box[^}]*floorY[^}]*tableBounds[^}]*roomLight[^}]*appRoom[^}]*layout[^}]*spill/.test(rig), 'the contract\'s signature');
  assert.ok(lum.includes("group.name = 'clubLamp'") && lum.includes('mesh.name = `clubLamp.${k}`') && lum.includes("for (const k of ['shade', 'glow', 'face'])"), 'the face mesh is found by its name clubLamp.face');
  assert.ok(lum.includes("from '../../room/lamp/rule.js'") && !/function (coverCount|nextWhole|bodyInFrame|frameShare)\b/.test(lum), 'the lamp view rule is imported, not copied');
  assert.ok(lum.includes("cam?.parent?.type === 'CubeCamera'"), 'a cube render is left to the app');
  assert.ok(lum.includes('lampSpillBaked()') && lum.includes('id: sp.id'), 'the spill emitter is the baked lamp.band');
  // no three light, no shadow map, no change of the app's light
  for (const [name, text] of [['rig.js', rig], ['luminaire.js', lum], ['housing.js', src('../../scene/club/arena/rig/housing.js')], ['truss.js', src('../../scene/club/arena/rig/truss.js')], ['house.js', src('../../scene/club/arena/rig/house.js')], ['mat.js', src('../../scene/club/arena/rig/mat.js')]]) {
    assert.ok(!/new THREE\.(RectAreaLight|PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight)\b/.test(text), `${name}: no three light is made`);
    assert.ok(!/shadowMap|castShadow|receiveShadow/.test(text), `${name}: no shadow map`);
    assert.ok(!/\.(intensity|width|height)\s*=[^=]/.test(text.replace(/cv\.(width|height)\s*=/g, '')), `${name}: no light property is written`);
    assert.ok(!/Math\.random|performance\.now|Date\.now/.test(text), `${name}: no clock, no unseeded draw`);
  }
});

await okAsync('with three loaded: face() has the club lamp\'s shape; geometry is finite, counted and in bounds; the view rule', async () => {
  const nodeModule = await import('node:module');
  if (typeof nodeModule.registerHooks !== 'function') { console.log('   (skipped: node:module registerHooks is not available in this node)'); return; }
  const threeUrl = new URL('../../vendor/three.module.min.js', import.meta.url).href;
  nodeModule.registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : next(specifier, context); } });
  const { buildHousing, rigFace, RIG_FACE, BOX } = await import('../../scene/club/arena/rig/housing.js');
  const { buildTruss } = await import('../../scene/club/arena/rig/truss.js');

  // face(): the same keys at every level as room/lamp/face.js lampFace, for every fixture; only the two levels differ
  for (const [name, em] of Object.entries(FIXTURES)) {
    const mine = rigFace(em), club = lampFace(em);
    assert.deepEqual(shape(mine), shape(club), `${name}: the shape of face()`);
    assert.deepEqual({ ...mine, faces: null, panels: null }, { ...club, faces: null, panels: null }, `${name}: kind, plane and rectangle`);
    for (let i = 0; i < mine.faces.length; i++) {
      const a = mine.faces[i], b = club.faces[i];
      assert.deepEqual({ ...a, levels: null }, { ...b, levels: null }, `${name}: panels, frame and strips are the club lamp's`);
      if (a.shape === 'rect') assert.deepEqual(a.levels, { ...b.levels, panel: RIG_FACE.panel, tubeEnd: RIG_FACE.tubeEnd });
      else assert.deepEqual(a.levels, b.levels);
    }
  }

  const plan = rigPlan(ARENA);
  const finite = (acc, what) => { for (const v of acc.pos) if (!Number.isFinite(v)) assert.fail(`${what}: a position is not finite`); for (const v of acc.nor) if (!Number.isFinite(v)) assert.fail(`${what}: a normal is not finite`); for (const i of acc.idx) if (!(i >= 0 && i < acc.count)) assert.fail(`${what}: an index is out of range`); };
  // every triangle faces the way its vertex normals say (an inverted winding is a face that is never drawn: front side only)
  const facing = (acc, what) => {
    let bad = 0, flat = 0;
    for (let i = 0; i < acc.idx.length; i += 3) {
      const [a, b, c] = [acc.idx[i] * 3, acc.idx[i + 1] * 3, acc.idx[i + 2] * 3], P = acc.pos, N = acc.nor;
      const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const gl = Math.hypot(...g);
      if (gl < 1e-12) { flat += 1; continue; }
      const m = [N[a] + N[b] + N[c], N[a + 1] + N[b + 1] + N[c + 1], N[a + 2] + N[b + 2] + N[c + 2]];
      if ((g[0] * m[0] + g[1] * m[1] + g[2] * m[2]) / gl < -0.05) bad += 1;
    }
    assert.equal(bad, 0, `${what}: ${bad} of ${acc.idx.length / 3} triangles are wound against their normals`);
    assert.ok(flat <= acc.idx.length / 3 * 0.05, `${what}: ${flat} degenerate triangles`);
  };
  const span = (acc) => { let lo = Infinity, hi = -Infinity; for (let k = 1; k < acc.pos.length; k += 3) { lo = Math.min(lo, acc.pos[k]); hi = Math.max(hi, acc.pos[k]); } return [lo, hi]; };
  const counts = {};
  for (const detail of [0, 1, 2]) {
    const t = buildTruss(plan, { detail });
    for (const k of ['alu', 'dark', 'lens']) { finite(t.parts[k], `truss ${k} at detail ${detail}`); facing(t.parts[k], `truss ${k} at detail ${detail}`); }
    // nothing of the floor-fixed rig below the cut plane; the chains end at the roof
    for (const k of ['alu', 'dark', 'lens']) assert.ok(span(t.parts[k])[0] >= plan.y0 - 1e-6, `detail ${detail}: ${k} reaches ${(plan.y0 - span(t.parts[k])[0]).toFixed(4)} m below the cut plane`);
    assert.ok(Math.abs(span(t.parts.dark)[1] - (-0.79 + hoistTopH())) < 1e-6, 'the hoists\' chains end on the rigging beams');
    assert.equal(t.parts.lens.triangles, plan.heads.length * [6, 10, 20][detail], 'one disc per head');
    counts[detail] = { alu: t.parts.alu.triangles, dark: t.parts.dark.triangles, lens: t.parts.lens.triangles, braces: t.counts.braces };
  }
  assert.ok(counts[0].alu < counts[1].alu && counts[1].alu < counts[2].alu && counts[0].dark < counts[1].dark && counts[1].dark < counts[2].dark, 'detail orders the triangle counts');
  assert.ok(counts[0].braces >= 0.7 * counts[2].braces, 'the lite tier keeps its lattice (never plain beams)');
  assert.ok(counts[2].alu + counts[2].dark + counts[2].lens < 40000 && counts[1].alu + counts[1].dark + counts[1].lens < 20000, 'triangle budget');
  console.log(`   first rectangle, triangles by detail (alu / dark / lens): ${[0, 1, 2].map((d) => `${counts[d].alu} / ${counts[d].dark} / ${counts[d].lens}`).join('   ')}`);

  // round A2: both rectangles, the perimeter truss and the roof steel in the same three accumulators
  {
    const { buildSteel } = await import('../../scene/club/arena/rig/steel.js');
    const { washArray } = await import('../../scene/club/arena/rig/truss.js');
    const outer = outerPlan(ARENA), roof = roofPlan(ARENA), wallLamps = housePlan(ARENA).filter((l) => l.kind === 'wall');
    const all = {};
    for (const detail of [0, 1, 2]) {
      const t = buildTruss(plan, { detail, outer, wash: { inner: null, outer: [0.03, 0.03, 0.03] } });
      const st = buildSteel(t.parts, roof, { detail, wash: { roof: [1, 1, 1], perimeter: [0.05, 0.05, 0.05], pool: 1 }, wallLamps });
      for (const k of ['alu', 'dark', 'lens']) {
        finite(t.parts[k], `hall ${k} at detail ${detail}`); facing(t.parts[k], `hall ${k} at detail ${detail}`);
        assert.ok(span(t.parts[k])[0] >= plan.y0 - 1e-6, `detail ${detail}: ${k} reaches below the cut plane`);
        assert.ok(span(t.parts[k])[1] <= -0.79 + ARENA.hall.height, `detail ${detail}: ${k} reaches through the lid`);
        // the wash: three finite floats per vertex, none negative; the roof steel and the perimeter truss carry one
        const w = washArray(t.parts[k]);
        assert.equal(w.length, t.parts[k].count * 3);
        for (const v of w) if (!(v >= 0 && v < 50)) assert.fail(`detail ${detail}: a wash value of ${v} on ${k}`);
        if (k !== 'lens') assert.ok(w.some((v) => v > 0), `detail ${detail}: ${k} carries a wash`);
      }
      // the wall lamps' housings: the high tier only, below the cut, on the walls
      if (detail < 2) assert.equal(st.wall, null); else { finite(st.wall, 'wall housings'); facing(st.wall, 'wall housings'); assert.ok(st.wall.triangles > 0 && span(st.wall)[1] < plan.y0); assert.equal(st.wall.count % wallLamps.length, 0, 'the same vertex count per wall lamp (the side marks are filled by that)'); }
      // every head has its lens, every screen its face
      // (round A5: and every bell and can its lit mouth: a square on lite and base, a 12-sided disc on high)
      assert.equal(t.parts.lens.triangles, plan.heads.length * [6, 10, 20][detail] + (detail < 2 ? Math.ceil(outer.heads.length / 2) : outer.heads.length) * [6, 6, 20][detail] + 2 * roof.screens.length + roof.fixtures.length * [2, 2, 12][detail]);
      // ROUND A5 (CONTRACT 17.4): a lit mouth is a FACE that looks straight down from inside its fixture; a screen's
      // face carries a slide of the atlas, the word reading left to right for a viewer in front of it
      {
        const L = t.parts.lens, { LENS_ATLAS } = PLAN_MOD, S = LENS_ATLAS.size;
        let downFaces = 0;
        for (let i = 0; i < L.idx.length; i += 3) { const a = L.idx[i] * 3; if (L.nor[a + 1] < -0.999 && L.pos[a + 1] > -0.79 + 4.5) downFaces += 1; }
        assert.equal(downFaces, roof.fixtures.length * [2, 2, 12][detail], `detail ${detail}: one lit mouth per bell and can, facing down`);
        for (const f of roof.fixtures) {
          let got = false;
          for (let k = 0; k < L.count && !got; k++) if (L.nor[3 * k + 1] < -0.999 && Math.hypot(L.pos[3 * k] - f.x, L.pos[3 * k + 2] - f.z) < 0.25 && L.pos[3 * k + 1] > f.y && L.pos[3 * k + 1] < f.y + 0.1) got = true;
          assert.ok(got, `detail ${detail}: the ${f.kind} fixture at (${f.x}, ${f.z}) has no lit mouth inside it`);
        }
        // every uv of the lens mesh lies inside one rectangle of the atlas
        const rects = [LENS_ATLAS.lens, LENS_ATLAS.led, ...LENS_ATLAS.slides];
        for (let k = 0; k < L.count; k++) {
          const px = L.uv[2 * k] * S, py = (1 - L.uv[2 * k + 1]) * S;
          assert.ok(rects.some((r) => px >= r[0] - 1e-6 && px <= r[0] + r[2] + 1e-6 && py >= r[1] - 1e-6 && py <= r[1] + r[3] + 1e-6), `detail ${detail}: a lens vertex's uv (${px.toFixed(1)}, ${py.toFixed(1)}) is outside the atlas's rectangles`);
        }
      }
      all[detail] = { alu: t.parts.alu.triangles, dark: t.parts.dark.triangles, lens: t.parts.lens.triangles, wall: st.wall?.triangles ?? 0 };
    }
    const tot = (d) => all[d].alu + all[d].dark + all[d].lens + all[d].wall;
    assert.ok(tot(0) < tot(1) && tot(1) < tot(2), 'detail orders the triangle counts');
    // lite and base: a few merged draw calls and a bounded count (the lattice in full is the high tier's)
    assert.ok(tot(0) <= 8500 && tot(1) <= 10800, `lite ${tot(0)}, base ${tot(1)} triangles`);
    assert.ok(tot(2) <= 90000, `high ${tot(2)} triangles`);
    console.log(`   both rectangles, perimeter truss and roof steel, triangles by detail (alu / dark / lens / wall): ${[0, 1, 2].map((d) => `${all[d].alu} / ${all[d].dark} / ${all[d].lens} / ${all[d].wall} = ${tot(d)}`).join('   ')}`);
  }

  const hang = { y: plan.y0 + 2 * RIG.chordR + 0.024, z: { from: -1.57, to: 1.57, clamps: [-1.475, -1.235, 1.235, 1.475] }, x: { from: -2.67, to: 2.67, clamps: [-2.575, -2.335, 2.335, 2.575] } };
  const housing = {};
  for (const [name, em] of Object.entries(FIXTURES)) for (const detail of [0, 1, 2]) {
    const h = buildHousing(em, { detail, hang });
    for (const k of ['body', 'glow', 'face']) { finite(h.parts[k], `housing ${name} ${k}`); facing(h.parts[k], `housing ${name} ${k} at detail ${detail}`); assert.ok(h.parts[k].triangles > 0, `housing ${name}: ${k} has triangles`); }
    // the lit seam faces outward, the bezel faces the opening (inward and down), the diffuser faces down
    {
      const g = h.parts.glow, cxz = [h.rect.cx, h.rect.cz];
      // (the lit skirt is the part of the glow that stands outside the opening, on the box's side; the bezel is inside it)
      let out = 0, inw = 0, core = 0, edge = Infinity, skirtLo = Infinity, skirtHi = -Infinity;
      for (let k = 0; k < g.count; k++) {
        const x = g.pos[3 * k], z = g.pos[3 * k + 2];
        const r = [x - cxz[0], z - cxz[1]], nr = g.nor[3 * k] * r[0] + g.nor[3 * k + 2] * r[1];
        if (x < h.faces.minX - 0.05 || x > h.faces.maxX + 0.05 || z < h.faces.minZ - 0.05 || z > h.faces.maxZ + 0.05) {
          skirtLo = Math.min(skirtLo, g.pos[3 * k + 1]); skirtHi = Math.max(skirtHi, g.pos[3 * k + 1]);
          if (nr > 0) out += 1; else assert.fail(`${name}: a seam vertex faces inward`);
          core = Math.max(core, g.col[3 * k]); edge = Math.min(edge, g.col[3 * k]);
        } else if (nr < 0 || g.nor[3 * k + 1] < -0.2) inw += 1; else assert.fail(`${name}: a bezel vertex faces outward (normal ${[g.nor[3 * k], g.nor[3 * k + 1], g.nor[3 * k + 2]].map((v) => v.toFixed(2))})`);
      }
      assert.ok(out > 0 && inw > 0);
      // the reveal is a soft line (a core under the face's own level, a fall to both sides), never one flat clipped stroke
      assert.ok(core <= 1 && edge <= 0.5 * core, `${name}: the reveal's levels (core ${core}, edge ${edge})`);
      // the lit skirt on the box's side: at least 45 mm high, between the lip and the frame band (the long side seen from
      // eye height carries the lamp's own glow on its lower edge: round A1 had an 18 mm line)
      assert.ok(Math.abs(skirtLo - (h.span.lo + BOX.seam[0])) < 1e-6 && Math.abs(skirtHi - (h.span.lo + BOX.seam[1])) < 1e-6 && skirtHi - skirtLo >= 0.045, `${name}: the lit skirt spans ${skirtLo} .. ${skirtHi}`);
      // the box is folded: its top plate is smaller than its skirt (a sloped face between them), and it has a lower bevel
      {
        const bd = h.parts.body; let topHalf = 0, lowHalf = 0;
        const longX = h.rect.hx >= h.rect.hz, ax = longX ? 2 : 0, c0 = longX ? h.rect.cz : h.rect.cx, hs = longX ? h.rect.hz : h.rect.hx;
        for (let k = 0; k < bd.count; k++) {
          const y = bd.pos[3 * k + 1], off = Math.abs(bd.pos[3 * k + ax] - c0);
          if (Math.abs(y - h.span.top) < 1e-6 && bd.nor[3 * k + 1] > 0.9) topHalf = Math.max(topHalf, off);
          if (Math.abs(y - h.span.lo) < 1e-6) lowHalf = Math.max(lowHalf, off);
        }
        assert.ok(topHalf > 0 && topHalf < hs - 0.5 * Math.min(BOX.fold, hs * 0.25), `${name}: the top plate (${topHalf.toFixed(3)}) is inside the skirt (${hs.toFixed(3)})`);
        assert.ok(lowHalf < hs - 1e-4, `${name}: the lower edge is bevelled`);
      }
      const f = h.parts.face;
      let down = 0; for (let k = 0; k < f.count; k++) if (f.nor[3 * k + 1] < -0.9) down += 1;
      assert.ok(down >= 4 * (em.length), `${name}: the panels face down`);
    }
    // the emitting faces lie on the emitter plane (the frame hangs below it by its depth, nothing of the face part is above)
    const [lo, hi] = span(h.parts.face);
    const ys = em.map((e) => e.y);
    assert.ok(hi <= Math.max(...ys) + 1e-6 && lo >= Math.min(...ys) - Math.max(BOX.frameDepth, BOX.louvre) - 1e-6, `${name}: the face part lies on the emitter plane (the frame and the louvre hang below it)`);
    // the egg-crate louvre: cell walls (level normals) under the sheet on base and high, none on lite; above the lip's underside
    {
      const f = h.parts.face; let walls = 0;
      for (let k = 0; k < f.count; k++) if (Math.abs(f.nor[3 * k + 1]) < 0.1 && f.pos[3 * k + 1] < Math.min(...ys) - BOX.frameDepth - 1e-4) walls += 1;
      if (name === 'canopy') assert.ok(detail === 0 ? walls === 0 : walls >= 4 * 30, `canopy at detail ${detail}: ${walls} louvre vertices (four lower corners per wall)`);
      assert.ok(lo > h.span.lo, `${name}: the louvre stays above the lip`);
    }
    // the box wraps the emitters and hangs between the lip and the pipes
    const b = h.boxes[0];
    for (const e of em) assert.ok(b.min[0] < e.x - e.w / 2 && b.max[0] > e.x + e.w / 2 && b.min[2] < e.z - e.d / 2 && b.max[2] > e.z + e.d / 2 && b.min[1] < e.y && b.max[1] > e.y, `${name}: the body wraps the emitter`);
    assert.ok(span(h.parts.body)[1] <= hang.y + BOX.pipeR + 0.08, `${name}: nothing of the housing above its pipes`);
    if (detail === 1) housing[name] = { body: h.parts.body.triangles, glow: h.parts.glow.triangles, face: h.parts.face.triangles, box: b };
    // the box the beam check above used is the built housing's own
    if (name === 'canopy') for (let k = 0; k < 3; k++) assert.ok(Math.abs(b.min[k] - HOUSING_BOX.min[k]) < 1e-6 && Math.abs(b.max[k] - HOUSING_BOX.max[k]) < 1e-6, `the canopy housing's box (${b.min} .. ${b.max})`);
  }
  console.log(`   housing triangles at detail 1 (body / glow / face): ${Object.entries(housing).map(([k, v]) => `${k} ${v.body} / ${v.glow} / ${v.face}`).join('   ')}`);

  // the lamp view rule (room/lamp/rule.js, imported by the luminaire) on the canopy's light box at the review poses
  const boxes = [housing.canopy.box];
  const bed = { minX: -1.27, maxX: 1.27, minZ: -0.635, maxZ: 0.635 };
  const cutY = -0.79 + ARENA.cut.top;
  const stateAt = (v) => {
    const vp = lookAtViewProj(v.cam, v.target, v.fov, 16 / 9);
    const t = coverCount({ eye: v.cam, viewProj: vp, bed, boxes, margin: RULE.tight }).covered;
    const l = coverCount({ eye: v.cam, viewProj: vp, bed, boxes, margin: RULE.loose }).covered;
    const cover = nextState(null, t, l);
    const inFrame = bodyInFrame({ viewProj: vp, boxes }).share, ofFrame = frameShare({ eye: v.cam, basis: lookAtBasis(v.cam, v.target, v.fov, 16 / 9), boxes }).share;
    const whole = nextWhole(null, inFrame, ofFrame);
    const state = v.cam[1] >= cutY ? 'absent' : cover === 'absent' || whole === 'absent' ? 'absent' : 'solid';
    return { state, cover, whole, tight: t, inFrame: +inFrame.toFixed(2), ofFrame: +ofFrame.toFixed(3) };
  };
  const want = { V1: 'absent', V2: 'absent', V3: 'absent', V9: 'solid', V10: 'solid', V11: 'absent', TV: 'absent', BACK: 'solid' };
  const table = [];
  for (const v of VIEWS) {
    const r = stateAt(v);
    table.push(`${v.id} ${r.state}${r.state === 'absent' ? ` (${r.cover === 'absent' ? 'cover' : 'whole'})` : ''}`);
    if (want[v.id]) assert.equal(r.state, want[v.id], `${v.id}: ${JSON.stringify(r)}`);
    // the housing never stands between a player view and the bed
    if (r.state === 'solid') assert.equal(r.tight, 0, `${v.id}: a solid housing hides no bed sample`);
  }
  console.log(`   the housing at the review poses: ${table.join(', ')}`);
  // V1, the standing play view: the bed is never blocked (absent there, and hiding nothing even if it were kept)
  const v1 = stateAt(VIEWS.find((v) => v.id === 'V1'));
  assert.equal(v1.state, 'absent');
  assert.equal(v1.tight, 0, 'V1: the body hides no bed sample');
});

ok('round A7: the baked profiles\' blade at the table\'s outline; the table light\'s column in the haze (CONTRACT 19.2, 19.3)', () => {
  const PE = HALL.outer.profiles.emit, TK = HALL.tableKeys, floorY = FLOORS[0];
  const profiles = outerPlan(LAYOUT.ARENA, { floorY }).emitters.filter((e) => e.id.startsWith('rig.profile.'));
  assert.ok(profiles.length >= 8, 'the baked profiles');
  if (PE.blade?.on === true) {
    assert.ok(PE.blade.out >= 0 && PE.blade.out <= 0.1, 'the blade\'s line lies on the outline or a hand outside it');
    for (const e of profiles) {
      const rail = { n: 'north', s: 'south', w: 'west', e: 'east' }[e.id.slice('rig.profile.'.length)[0]];
      assert.ok(rail && Array.isArray(e.shutter) && Math.abs(Math.hypot(...e.shutter) - 1) < 1e-3, `${e.id}: one blade, a unit normal`);
      // the light reaches the side the normal points to: a carpet point 0.5 m OUTSIDE the outline on the profile's side
      // is lit, a carpet point 0.2 m under the table's edge is not, the table's middle is not
      const side = (p) => (p[0] - e.position[0]) * e.shutter[0] + (p[1] - e.position[1]) * e.shutter[1] + (p[2] - e.position[2]) * e.shutter[2];
      const at = (d) => (rail === 'south' ? [0, floorY, TK.edge.hz + d] : rail === 'north' ? [0, floorY, -TK.edge.hz - d] : rail === 'west' ? [-TK.edge.hx - d, floorY, 0] : [TK.edge.hx + d, floorY, 0]);
      assert.ok(side(at(0.5)) > 0, `${e.id}: the playing floor outside the outline is lit`);
      assert.ok(side(at(-0.2)) < 0 && side([0, floorY, 0]) < 0 && side([0, 0, 0]) < 0, `${e.id}: nothing under the table's edge, nothing on the table`);
    }
  } else for (const e of profiles) assert.equal(e.shutter, undefined, `${e.id}: no blade while the switch is off`);
});

// ---- the body the arena shows under the perimeter ring: the app's own (web/scene/lightingvisuals.js buildRingMeshes) --------
await okAsync('the perimeter ring\'s own body: four lit strips on the emitters, eight thin cables on the long sides, the middle open', async () => {
  const nodeModule = await import('node:module');
  if (typeof nodeModule.registerHooks !== 'function') { console.log('   (skipped: node:module registerHooks is not available in this node)'); return; }
  const THREE = await import('three'); // through the hook the arm above registered
  const { lightingProfile, buildRingMeshes } = await import('../../scene/lightingvisuals.js');
  const em = lightingProfile('perimeter_ring', 1).emitters;
  const { group, faces } = buildRingMeshes({ emitters: em });
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 9, 'four faces, four frame bars, one cable mesh');
  // the faces: unlit, each on its emitter rectangle
  assert.equal(faces.length, 4);
  faces.forEach((f, i) => {
    const e = em[i], b = new THREE.Box3().setFromObject(f);
    assert.ok(f.material.isMeshBasicMaterial, `face ${i}: unlit (the lamp-face register)`);
    for (const [got, want] of [[b.min.x, e.x - e.w / 2], [b.max.x, e.x + e.w / 2], [b.min.z, e.z - e.d / 2], [b.max.z, e.z + e.d / 2], [b.min.y, e.y], [b.max.y, e.y]]) assert.ok(Math.abs(got - want) < 1e-6, `face ${i} lies on its emitter`);
  });
  // the cables: one lit mesh; its tubes stand on eight points, four on each long side (the corners and two between, evenly
  // spaced), each from the frame up to the app's ceiling plane, where the arena's truss has its lower chords (layout.js)
  const cables = group.getObjectByName('ringCables');
  assert.ok(cables?.isMesh && !cables.material.isMeshBasicMaterial, 'one lit cable mesh');
  const pos = cables.geometry.attributes.position, pts = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let p = pts.find((q) => Math.hypot(q.c[0] - x, q.c[1] - z) < 0.05);
    if (!p) pts.push(p = { c: [x, z], x0: x, x1: x, z0: z, z1: z, y0: y, y1: y });
    p.x0 = Math.min(p.x0, x); p.x1 = Math.max(p.x1, x); p.z0 = Math.min(p.z0, z); p.z1 = Math.max(p.z1, z); p.y0 = Math.min(p.y0, y); p.y1 = Math.max(p.y1, y);
  }
  assert.equal(pts.length, 8, `${pts.length} cable points`);
  const cx = Math.abs(em[2].x), cz = Math.abs(em[0].z), ceil = ARENA.rig.bottomH - ARENA.camera.bedH;
  for (const side of [-1, 1]) {
    const xs = pts.filter((p) => Math.sign(p.z0 + p.z1) === side).map((p) => (p.x0 + p.x1) / 2).sort((a, b) => a - b);
    assert.equal(xs.length, 4, `four cables on the long side at z ${side < 0 ? '-' : '+'}`);
    [-cx, -cx / 3, cx / 3, cx].forEach((want, k) => assert.ok(Math.abs(xs[k] - want) < 1e-5, `cable ${k} at x ${xs[k]} (want ${want})`));
  }
  for (const p of pts) {
    assert.ok(Math.abs(Math.abs(p.z0 + p.z1) / 2 - cz) < 1e-5, 'on a long side\'s strip');
    assert.ok(Math.abs(p.y0 - (em[0].y + 0.04)) < 1e-6 && Math.abs(p.y1 - ceil) < 1e-6, `from the frame (${p.y0}) to the ceiling plane (${p.y1})`);
  }
  // the cable tops it publishes for a look that draws its own ceiling (the arena's pipes): the eight tops, on the ceiling plane
  const tops = cables.userData.hang;
  assert.ok(tops && Math.abs(tops.y - ceil) < 1e-6 && tops.points.length === 8, 'the cable mesh publishes its eight tops');
  for (const [x, z] of tops.points) assert.ok(pts.some((p) => Math.abs((p.x0 + p.x1) / 2 - x) < 1e-5 && Math.abs((p.z0 + p.z1) / 2 - z) < 1e-5), `a published top (${x}, ${z}) is a cable's`);
  // a wire: the tube between the gripper and the ceiling cup is about two millimetres in radius, thin but still a line at the
  // player's distances (its two rings lie at the gripper's top and the cup's foot: the vertices nearest the axis away from
  // the cap centres)
  let thin = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), p = pts.find((q) => Math.hypot(q.c[0] - x, q.c[1] - z) < 0.05);
    const r = Math.hypot(x - (p.x0 + p.x1) / 2, z - (p.z0 + p.z1) / 2);
    if (r > 1e-5) thin = Math.min(thin, r);
  }
  assert.ok(thin >= 0.0015 && thin <= 0.003, `the cable's radius ${thin}`);
  // the middle open: no vertex of the body inside the frame's inner edge
  const hx = cx - (em[2].w + 0.02) / 2, hz = cz - (em[0].d + 0.02) / 2, v = new THREE.Vector3();
  for (const m of meshes) {
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld);
      assert.ok(!(Math.abs(v.x) < hx - 1e-6 && Math.abs(v.z) < hz - 1e-6), `a vertex of ${m.name || m.type} in the open middle (${v.x}, ${v.z})`);
    }
  }
});

// ---- the perimeter ring keeps the app's open frame (luminaire.js item 6) ------------------------------------------------------
// The housing is one light box over the emitters' bounding rectangle: on the ring's four strips it closed the open frame into a
// cover. Under the ring the luminaire draws no housing and hides nothing; of its own it draws only what the ring's cables end
// on (a pipe over each cable line, a drop rod to each cable top), below the hall's top cut and never in a cube render. At
// build and across a run-time swap both ways.
await okAsync('the perimeter ring: the app\'s open frame stays, no light box, its cables end on pipes; at build and across swaps both ways', async () => {
  const nodeModule = await import('node:module');
  if (typeof nodeModule.registerHooks !== 'function') { console.log('   (skipped: node:module registerHooks is not available in this node)'); return; }
  const THREE = await import('three'); // through the hook the arm above registered
  const { createLuminaire } = await import('../../scene/club/arena/rig/luminaire.js');
  let fixture = 'perimeter_ring';
  // the ring's emitter rectangles (web/scene/lightingvisuals.js FIXTURES.perimeter_ring)
  const IN = 0.0254, ow = 102.4 * IN, od = 53 * IN, sw = 2.75 * IN, ringY = 45 * IN;
  const ringRects = [
    { x: 0, z: -(od - sw) / 2, w: ow - 2 * sw, d: sw }, { x: 0, z: (od - sw) / 2, w: ow - 2 * sw, d: sw },
    { x: -(ow - sw) / 2, z: 0, w: sw, d: od }, { x: (ow - sw) / 2, z: 0, w: sw, d: od },
  ];
  const rectLight = (e, y) => { const l = new THREE.RectAreaLight(0xffffff, 5, e.w, e.d); l.position.set(e.x, y, e.z); l.rotation.x = -Math.PI / 2; return l; };
  const ringLights = ringRects.map((e) => rectLight(e, ringY)), canopyLight = rectLight(CANOPY, CANOPY.y);
  const mesh = (basic) => new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.1), basic ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial());
  // the app's own bodies: the ring's four faces, four frame bars and its cables (which publish their eight tops on the
  // ceiling plane, as lightingvisuals.js addCables does); the canopy's face, hood and rods
  const tops = [-1, -1 / 3, 1 / 3, 1].flatMap((s) => [[(s * (ow - sw)) / 2, -(od - sw) / 2], [(s * (ow - sw)) / 2, (od - sw) / 2]]);
  const cables = mesh(false);
  cables.userData.hang = { y: 2.45, points: tops };
  const ring = [...ringRects.map(() => mesh(true)), ...ringRects.map(() => mesh(false)), cables];
  const lr = { rectLights: ringLights.slice(), lampFace: mesh(true), hood: mesh(false), rods: [mesh(false), mesh(false)] };
  const canopy = [lr.lampFace, lr.hood, ...lr.rods];
  const scene = new THREE.Scene();
  for (const m of [...ring, ...canopy]) scene.add(m);
  for (const m of canopy) m.visible = false; // the app hides the canopy while another fixture hangs
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { __lighting: { state: () => ({ fixture }), fixtureMeshes: () => (fixture === 'perimeter_ring' ? ring.slice() : null) } };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }; // no 2d canvas: a plain face
  try {
    const plan = rigPlan(ARENA);
    const hang = { y: plan.y0 + 2 * RIG.chordR + 0.024, z: { from: -1.57, to: 1.57, clamps: [-1.475, -1.235, 1.235, 1.475] }, x: { from: -2.67, to: 2.67, clamps: [-2.575, -2.335, 2.335, 2.575] } };
    let cutYv = Infinity; // the hall's top cut (arena/rig.js cutY): off until the arm moves it
    const shared = {
      roomLight: null, bed: { minX: -1.27, maxX: 1.27, minZ: -0.635, maxZ: 0.635, version: 0 }, brightness: { value: 1 },
      bounce: { color: { value: new THREE.Color() }, table: { value: new THREE.Vector4() } }, log: { done: [], missed: [] }, hang: () => hang, cutY: () => cutYv,
    };
    // `?clublamp=solid` pins the camera rule, so the canopy's light box is drawn at every render
    const club = { ctx: { scene, query: { get: (k) => (k === 'clublamp' ? 'solid' : null) } } };
    const lum = createLuminaire(club, shared, { appRoom: { lightRefs: lr } });
    assert.equal(lum.enabled, true, `the luminaire is built (${lum.reason})`);
    scene.add(lum.group);
    lum.tick(1 / 60); // a frame: the pipes' group goes beside the light box's
    const pipesGroup = scene.getObjectByName('arenaRingPipes');
    assert.ok(pipesGroup && pipesGroup.parent === scene && !lum.group.getObjectByName('arenaRingPipes'), 'the pipes stand in their own group beside `clubLamp`, not in it');
    const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 50);
    cam.position.set(0, 1.6, 2.6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    // one render through the scene's hooks: what is shown while it draws
    const render = (c = cam) => {
      scene.onBeforeRender(null, scene, c, null);
      try { return { ring: ring.every((m) => m.visible), canopy: canopy.some((m) => m.visible), box: lum.group.visible, pipes: pipesGroup.visible }; } finally { scene.onAfterRender(null, scene, c); }
    };
    const underRing = (what) => {
      for (let i = 1; i <= 2; i++) {
        assert.deepEqual(render(), { ring: true, canopy: false, box: false, pipes: true }, `${what}, render ${i}: the app's frame and the pipes are drawn, no light box`);
        assert.ok(ring.every((m) => m.visible) && !lum.group.visible && !pipesGroup.visible, `${what}, after render ${i}: the frame shown; the light box and the pipes hidden between renders`);
        lum.tick(1 / 60);
      }
      const s = lum.state();
      assert.equal(s.appBody, 'perimeter_ring', `${what}: state() names the fixture's own body`);
      assert.equal(s.state, 'absent', `${what}: state() says no light box is drawn`);
      assert.equal(lum.counts().drawn, 0, `${what}: no draw call for the light box`);
      assert.ok(s.pipes.built && s.pipes.current && s.pipes.runs === 2 && s.pipes.rods === 8, `${what}: two pipes and eight drop rods (${JSON.stringify(s.pipes)})`);
      assert.equal(lum.counts().pipes.drawCalls, 1, `${what}: one draw call for the pipes`);
    };
    underRing('the ring at build');
    // the pipes: one over each cable line, from one short run of the truss to the other; every drop rod from its cable top up
    // into its pipe; nothing over the frame's open middle
    {
      const a = pipesGroup.getObjectByName('arenaRingPipes.body').geometry.attributes.position;
      let x0 = Infinity, x1 = -Infinity, middle = 0;
      for (let i = 0; i < a.count; i++) {
        x0 = Math.min(x0, a.getX(i)); x1 = Math.max(x1, a.getX(i));
        if (Math.abs(a.getZ(i)) < (od - sw) / 2 - 0.04) middle += 1;
      }
      assert.equal(middle, 0, 'nothing of the pipes over the frame\'s open middle');
      assert.ok(x0 <= hang.x.from + 1e-6 && x1 >= hang.x.to - 1e-6, `the pipes run from one short run to the other (${x0} .. ${x1})`);
      for (const [x, z] of tops) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < a.count; i++) if (Math.hypot(a.getX(i) - x, a.getZ(i) - z) < 0.0075) { lo = Math.min(lo, a.getY(i)); hi = Math.max(hi, a.getY(i)); }
        assert.ok(Math.abs(lo - 2.45) < 1e-6 && hi >= hang.y - 0.024, `the drop rod at (${x.toFixed(3)}, ${z.toFixed(3)}): from the cable top (${lo}) up into its pipe (${hi})`);
      }
    }
    // the eye at or above the hall's top cut: no pipes (the hall is not drawn up there); a cube render is the app's alone
    cutYv = 1.0; // the eye stands at 1.6
    assert.deepEqual(render(), { ring: true, canopy: false, box: false, pipes: false }, 'the ring, the eye above the hall\'s top cut: no pipes');
    cutYv = Infinity;
    {
      const holder = new THREE.Group();
      holder.type = 'CubeCamera';
      const cc = new THREE.PerspectiveCamera(90, 1, 0.05, 50);
      holder.add(cc); holder.updateMatrixWorld(true);
      assert.deepEqual(render(cc), { ring: true, canopy: false, box: false, pipes: false }, 'the ring, a cube render: the app\'s own luminaire, no pipes');
    }
    // a swap to the canopy at run time, as the app makes it: new rect lights, the canopy shown, the ring's meshes gone
    fixture = 'canopy_panel'; lr.rectLights = [canopyLight];
    for (const m of canopy) m.visible = true;
    for (const m of ring) scene.remove(m);
    // a render before the next tick: the housing still stands on the ring's rectangles, so none of it is drawn and the app's
    // canopy stays (no one-frame cover over the old frame)
    const r1 = render();
    assert.ok(r1.canopy && !r1.box && !r1.pipes, 'the canopy, a render before the next tick: no stale light box, no pipes, the app\'s canopy stays');
    assert.ok(!lum.group.visible, 'the canopy, before the next tick: none of ours between renders either');
    lum.tick(1 / 60);
    for (let i = 2; i <= 3; i++) {
      const r = render();
      assert.ok(!r.canopy && r.box && !r.pipes, `the canopy, render ${i}: the canopy is hidden for the render and the light box drawn, no pipes`);
      assert.ok(canopy.every((m) => m.visible), `the canopy, after render ${i}: the canopy is put back`);
      lum.tick(1 / 60);
    }
    assert.equal(lum.state().pipes.built, false, 'the canopy: no pipes built');
    // the light box now stands on the canopy's rectangle (the canopy housing's box of the arm above)
    const hull = lum.state().hull[0];
    for (const k of [0, 2]) assert.ok(Math.abs(hull.min[k] - HOUSING_BOX.min[k]) < 1e-6 && Math.abs(hull.max[k] - HOUSING_BOX.max[k]) < 1e-6, `the canopy: the light box on the canopy's rectangle (${hull.min} .. ${hull.max})`);
    assert.equal(lum.state().appBody, null, 'the canopy: no own body');
    assert.ok(lum.counts().drawn > 0, 'the canopy: the light box is drawn');
    // and back to the ring
    fixture = 'perimeter_ring'; lr.rectLights = ringLights.slice();
    for (const m of canopy) m.visible = false;
    for (const m of ring) scene.add(m);
    // a render before the next tick: no light box, and no pipes until they are built on these lights
    const r2 = render();
    assert.ok(r2.ring && !r2.canopy && !r2.box && !r2.pipes, 'the ring again, a render before the next tick: the app\'s frame, no light box, no pipes yet');
    lum.tick(1 / 60);
    underRing('the ring after a swap back');
    lum.dispose();
  } finally {
    for (const k of ['window', 'document']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
  }
});

console.log(`\ntest-club-arena-rig: ${n} checks OK`);
