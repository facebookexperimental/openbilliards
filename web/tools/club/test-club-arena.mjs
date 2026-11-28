// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-arena.mjs — node arm of the `arena` venue's room (CONTRACT.md sections 13.4 to 13.7 and 14.2). Owner: bake.
//   1. the layout's arithmetic (arena/layout.js): everything inside the hall, nothing in the stroke room, the app camera's
//      reach pinned against the app's own source, nothing solid where the camera can be (under it, beyond it, or on a cut
//      side), no floor-standing thing between a review camera and its target;
//   2. the words: WORDS is the pinned list, and no other upper-case word is written in any arena source file;
//   3. the room object: arena/room.js built in node on the vendored three (no GPU, no pixels) on every detail level, its
//      member list against CONTRACT 13.4, the hall's meshes, materials and emitters, the app parts it hides, dispose;
//   4. source pins: literal dynamic imports of the three parts, no three light, no shadow map, nothing imported from outside
//      web/scene/club/;
//   5. round A2: the emitter shares by owner, the floor part's loading, the parts' signatures and the stale report of a
//      bake whose part moved, the house panels (the bake role's emitters), the bake tool's venue.
// Run: node web/tools/club/test-club-arena.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as L from '../../scene/club/arena/layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../..');
const read = (rel) => fs.readFileSync(path.join(web, rel), 'utf8');
const { ARENA: A, PALETTE, WORDS, VIEWS, SIDE } = L;
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const okAsync = async (name, fn) => { await fn(); n += 1; console.log(`OK ${name}`); };
const inside = (b, o, m = 0) => b.x0 >= o.x0 + m && b.x1 <= o.x1 - m && b.z0 >= o.z0 + m && b.z1 <= o.z1 - m;
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

// the played table's footprint (the 9 ft table: web/tools/club/bake-room-scene.mjs tableStandIn, the app table's bounding box)
const TABLE = { x0: -1.4478, x1: 1.4478, z0: -0.8128, z1: 0.8128 };
const STROKE = { x0: TABLE.x0 - A.keepOut.strokeRoom, x1: TABLE.x1 + A.keepOut.strokeRoom, z0: TABLE.z0 - A.keepOut.strokeRoom, z1: TABLE.z1 + A.keepOut.strokeRoom };
const boardTop = A.boards.height + A.boards.rail.height;

/** The board ring as boxes (x0, x1, z0, z1, h = top above the floor): each side's runs between the gaps. */
function boardBoxes() {
  const t = A.boards.thickness, i = A.island, out = [];
  const runs = (side, from, to) => {
    let cur = from; const segs = [];
    for (const g of A.boards.gaps.filter((q) => q.side === side).sort((a, b) => a.from - b.from)) { if (g.from > cur) segs.push([cur, g.from]); cur = Math.max(cur, g.to); }
    if (to > cur) segs.push([cur, to]);
    return segs;
  };
  for (const [a, b] of runs('north', i.x0, i.x1)) out.push({ side: 'north', x0: a, x1: b, z0: i.z0 - t / 2, z1: i.z0 + t / 2, h: boardTop });
  for (const [a, b] of runs('south', i.x0, i.x1)) out.push({ side: 'south', x0: a, x1: b, z0: i.z1 - t / 2, z1: i.z1 + t / 2, h: boardTop });
  for (const [a, b] of runs('east', i.z0, i.z1)) out.push({ side: 'east', x0: i.x1 - t / 2, x1: i.x1 + t / 2, z0: a, z1: b, h: boardTop });
  for (const [a, b] of runs('west', i.z0, i.z1)) out.push({ side: 'west', x0: i.x0 - t / 2, x1: i.x0 + t / 2, z0: a, z1: b, h: boardTop });
  return out;
}
// event furniture at the reserved positions (A2 builds it): a footprint and a height above the floor
const FLOOR_ITEMS = [
  ...A.floor.chairs.map((c) => ({ id: `chair.${c.id}`, x: c.x, z: c.z, r: 0.45, h: 1.0 })),
  ...A.floor.sideTables.map((c) => ({ id: `sideTable.${c.id}`, x: c.x, z: c.z, r: 0.25, h: 0.65 })),
  { id: 'refereeTable', x: A.floor.refereeTable.x, z: A.floor.refereeTable.z, r: 0.6, h: 0.8 },
].map((f) => ({ ...f, x0: f.x - f.r, x1: f.x + f.r, z0: f.z - f.r, z1: f.z + f.r }));
// round A3: the TV cameras stand at full height on platforms OUTSIDE the island (CONTRACT 15.3); a footprint = the deck, and
// the camera's body reaches 0.71 m from its centre (the floor role's number, with the layout's clearance)
const CAMERAS = A.floor.cameras.map((c) => ({ id: `camera.${c.id}`, x: c.x, z: c.z, h: 2.1, reach: 0.71,
  x0: c.x - c.platform.w / 2, x1: c.x + c.platform.w / 2, z0: c.z - c.platform.d / 2, z1: c.z + c.platform.d / 2 }));

// ---- 1. layout -----------------------------------------------------------------------------------------------------------
ok('layout: the hall holds the island, the seating, the backdrop, the rig and the house lights', () => {
  const hall = A.hall;
  assert.ok(inside(A.island, hall, 1));
  for (const b of A.seating.blocks) { const f = L.blockFootprint(b); assert.ok(inside(f, hall, 0.1), `seating block ${b.id} ${JSON.stringify(f)} leaves the hall`); }
  const top = L.seatingRows().at(-1);
  assert.ok(top.h + 1.3 < hall.height, 'the top row and a seat on it are under the roof');
  assert.ok(A.backdrop.x > hall.x0 + 0.5 && A.backdrop.z0 >= hall.z0 && A.backdrop.z1 <= hall.z1 && A.backdrop.height < hall.height);
  assert.ok(A.backdrop.floorLights.x > A.backdrop.x + 0.3 && A.backdrop.floorLights.x < A.island.x0 - 0.5, 'the battens stand between the backdrop and the island');
  assert.ok(A.rig.bottomH + A.rig.section < A.houseLights.h0 && A.houseLights.h1 < hall.height);
  assert.ok(A.rig.length / 2 < A.island.x1 && A.rig.width / 2 < A.island.z1);
});

ok('layout: seating blocks do not overlap each other, the island or the backdrop', () => {
  const f = A.seating.blocks.map((b) => L.blockFootprint(b));
  for (let i = 0; i < f.length; i++) {
    assert.ok(!overlap(f[i], A.island));
    for (let j = i + 1; j < f.length; j++) assert.ok(!overlap(f[i], f[j]), `blocks ${A.seating.blocks[i].id} and ${A.seating.blocks[j].id} overlap`);
    assert.ok(f[i].x0 > A.backdrop.x + 0.5, 'a block reaches the backdrop');
  }
  const rows = L.seatingRows();
  assert.equal(rows.length, A.seating.rows);
  for (let r = 1; r < rows.length; r++) assert.ok(rows[r].offset > rows[r - 1].offset && rows[r].h > rows[r - 1].h);
});

ok('layout: nothing stands in the stroke room (the table + 1.55 m)', () => {
  assert.ok(inside(STROKE, A.island, 0.5), 'the island holds the stroke room with half a metre to spare');
  for (const b of boardBoxes()) assert.ok(!overlap(b, STROKE));
  for (const f of FLOOR_ITEMS) { assert.ok(!overlap(f, STROKE), `${f.id} stands in the stroke room`); assert.ok(inside(f, A.island, 0.1), `${f.id} is not inside the boards`); }
  for (const g of A.boards.gaps) assert.ok(g.to > g.from && ['north', 'south', 'east', 'west'].includes(g.side));
});

ok('camera: the numbers are the app\'s (source pins: a change of the app\'s camera code fails here)', () => {
  const orbit = read('app/orbit.js');
  assert.ok(orbit.includes(`s.phi = Math.min(${A.camera.phi[1]}, Math.max(${A.camera.phi[0]}, s.phi));`), 'orbit.js polar clamp');
  assert.ok(orbit.includes(`s.radius = Math.min(${A.camera.radius[1]}, Math.max(${A.camera.radius[0]}, s.radius));`), 'orbit.js radius clamp');
  const aim = read('app/aim.js');
  const margin = Number(/const PAN_MARGIN = ([0-9.]+);/.exec(aim)?.[1]);
  assert.equal(margin, 0.3);
  assert.ok(Math.abs(A.camera.pan.x - (2.54 / 2 + margin)) < 1e-9 && Math.abs(A.camera.pan.z - (1.27 / 2 + margin)) < 1e-9, 'pan bounds of the 9 ft table');
  assert.ok(aim.includes('look.set(ball.x + d.x * 1.0, 0.0, ball.z + d.z * 1.0);'), 'the aim view\'s look point: the cue ball + 1.0 m');
  const R = 0.028575;
  assert.ok(Math.abs(A.camera.target.x - (1.27 - R + 1.0)) < 1e-3 && Math.abs(A.camera.target.z - (0.635 - R + 1.0)) < 1e-3);
  assert.ok(/PerspectiveCamera\(40, W \/ H, 0\.01, 50\)/.test(read('app/main.js')), 'main.js camera: fov 40, near 0.01, far 50');
  assert.equal(A.camera.near, 0.01);
  // the far plane holds the hall from any camera position
  const diag = Math.hypot(A.hall.x1 - A.hall.x0, A.hall.z1 - A.hall.z0, A.hall.height);
  assert.ok(diag < 50, `the hall's diagonal ${diag.toFixed(1)} m is inside the far plane`);
});

ok('camera: the volume in the layout is the reach of those numbers', () => {
  const c = A.camera, reach = c.radius[1] * Math.sin(c.phi[1]);
  const v = A.keepOut.cameraVolume;
  assert.ok(Math.abs(v.x1 - (c.target.x + reach)) < 0.011 && Math.abs(v.x0 + v.x1) < 1e-9);
  assert.ok(Math.abs(v.z1 - (c.target.z + reach)) < 0.011 && Math.abs(v.z0 + v.z1) < 1e-9);
  assert.ok(Math.abs(v.h0 - (c.bedH + c.radius[0] * Math.cos(c.phi[1]))) < 0.011);
  assert.ok(Math.abs(v.h1 - (c.bedH + c.target.y1 + c.radius[1] * Math.cos(c.phi[0]))) < 0.011);
  // brute force: no orbit pose leaves the box or dips under cameraFloor(), and inCameraVolume() holds every pose
  let s = 12345; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let k = 0; k < 20000; k++) {
    const tx = (rnd() * 2 - 1) * c.target.x, tz = (rnd() * 2 - 1) * c.target.z, ty = c.target.y0 + rnd() * (c.target.y1 - c.target.y0);
    const r = c.radius[0] + rnd() * (c.radius[1] - c.radius[0]), phi = c.phi[0] + rnd() * (c.phi[1] - c.phi[0]), th = rnd() * 2 * Math.PI;
    const x = tx + r * Math.sin(phi) * Math.sin(th), z = tz + r * Math.sin(phi) * Math.cos(th), h = c.bedH + ty + r * Math.cos(phi);
    assert.ok(x >= v.x0 && x <= v.x1 && z >= v.z0 && z <= v.z1 && h >= v.h0 - 1e-9 && h <= v.h1 + 1e-9, `pose ${k} leaves the box`);
    assert.ok(h >= L.cameraFloor(x, z) - 1e-9, `pose ${k} is under cameraFloor`);
    assert.ok(L.inCameraVolume(x, h, z), `pose ${k} is not in inCameraVolume`);
  }
  assert.equal(L.cameraFloor(20, 0), Infinity);
  assert.equal(L.inCameraVolume(0, 8.5, 0), false);
});

ok('camera: the boards and the low floor furniture stay under it; the camera never crosses a board', () => {
  for (const b of boardBoxes()) assert.ok(L.underCamera(b), `the ${b.side} boards (top ${b.h} m) reach the camera's lowest surface`);
  assert.ok(boardTop <= 1.05, 'nothing on the board line above 1.05 m');
  // round A3: nothing inside the boards is taller than the camera's lowest surface (A2's two island cameras were: gone)
  const tall = FLOOR_ITEMS.filter((f) => !L.underCamera(f)).map((f) => f.id);
  assert.deepEqual(tall, []);
  // the TV cameras: full height, by placement (CONTRACT 15.3): the app's camera cannot be within the body's reach of the
  // camera's centre at ANY height (the tall part); the low deck with its kick rail (0.45 m at most) stays under the app
  // camera's lowest surface where a corner of it lies inside the reach; each stands on the hall's floor outside the island
  // and outside every seating block, clear of the backdrop's light row, and inside the hall
  // ROUND A4 (CONTRACT 16.5): four places, in the order the tiers build them; three stand ON a seating block (a scaffold
  // platform over folded seats, `platform.on`), just outside the reach, where V10 and BACK frame them; one on the floor
  assert.deepEqual(A.floor.cameras.map((q) => q.id), ['n1', 'ne', 'n2', 'e1']);
  assert.equal(CAMERAS.length, 4);
  for (const c of CAMERAS) {
    for (let k = 0; k <= 16; k++) for (const r of [0, c.reach / 2, c.reach]) {
      const a = (k / 16) * 2 * Math.PI, x = c.x + r * Math.cos(a), z = c.z + r * Math.sin(a);
      assert.equal(L.cameraFloor(x, z), Infinity, `${c.id}: its body is inside the camera's reach at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      for (const h of [0.5, 1.5, 2.1, 4, 7]) assert.equal(L.inCameraVolume(x, h, z), false);
    }
    const src = A.floor.cameras.find((q) => `camera.${q.id}` === c.id);
    assert.ok(!overlap(c, A.island), `${c.id} stands on the island`);
    assert.ok(inside(c, A.hall, 0.5), `${c.id} leaves the hall`);
    assert.ok(c.x0 > A.backdrop.floorLights.x + 0.2 || c.z1 < A.backdrop.z0 || c.z0 > A.backdrop.z1 || c.x0 > A.backdrop.floorLights.x + 0.2, `${c.id} stands in the backdrop's light row`);
    if (src.platform.on) {
      // a platform on a stand: wholly inside its block's footprint, clear of the block's aisle, its deck 0.5 to 1.3 m over
      // the highest row under it and at most 3.0 m over the floor; the WHOLE deck is outside the app camera's reach (a
      // tall thing: no height at which the camera can be over any corner of it)
      const blk = A.seating.blocks.find((b) => b.id === src.platform.on);
      assert.ok(blk, `${c.id}: no block '${src.platform.on}'`);
      const f = L.blockFootprint(blk);
      assert.ok(c.x0 >= f.x0 && c.x1 <= f.x1 && c.z0 >= f.z0 && c.z1 <= f.z1, `${c.id}: its platform leaves the ${blk.id} block`);
      const along = blk.side === 'east' ? [c.z0, c.z1] : [c.x0, c.x1];
      assert.ok(along[0] >= blk.aisleAt + A.seating.aisleWidth / 2 || along[1] <= blk.aisleAt - A.seating.aisleWidth / 2, `${c.id}: its platform stands in the aisle`);
      for (const [x, z] of [[c.x0, c.z0], [c.x0, c.z1], [c.x1, c.z0], [c.x1, c.z1]]) assert.equal(L.cameraFloor(x, z), Infinity, `${c.id}: the deck's corner (${x}, ${z}) is inside the camera's reach`);
      const far = blk.side === 'north' ? f.z1 - c.z0 : blk.side === 'south' ? c.z1 - f.z0 : c.x1 - f.x0; // how deep into the block its rear edge lies
      const rowUnder = Math.min(A.seating.rows - 1, Math.floor(far / A.seating.tread)), rowH = A.seating.firstRowH + rowUnder * A.seating.rise;
      assert.ok(src.platform.h <= 3.0 && src.platform.h - rowH >= 0.5 && src.platform.h - rowH <= 1.3, `${c.id}: deck ${src.platform.h} m over the floor, row ${rowUnder + 1} under it at ${rowH} m`);
      assert.ok(src.platform.w >= 1.1 && src.platform.d >= 1.1, `${c.id}: the platform`);
    } else {
      // a riser on the hall's floor: the low deck with its kick rail (0.45 m at most) stays under the app camera's lowest
      // surface, outside every seating block
      assert.ok(L.underCamera({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, h: 0.45 }), `${c.id}: its deck reaches the camera's lowest surface`);
      for (const b of A.seating.blocks) assert.ok(!overlap(c, L.blockFootprint(b)), `${c.id} stands in the ${b.id} block`);
      assert.ok(src.platform.h >= 0.2 && src.platform.h <= 0.45 && src.platform.w >= 1.2 && src.platform.d >= 1.2, `${c.id}: the platform`);
    }
  }
  assert.ok(L.underCamera({ x0: A.backdrop.floorLights.x - 0.1, x1: A.backdrop.floorLights.x + 0.1, z0: A.backdrop.z0, z1: A.backdrop.z1, h: 0.2 }), 'the battens');
});

ok('camera: what it can reach above the floor line is cut away (seating, rig) or out of reach (backdrop, walls, roof, house lights)', () => {
  const v = A.keepOut.cameraVolume, c = A.cut;
  // each seating block lies wholly beyond its side's plane, the plane lies beyond the boards
  const plane = { north: (f) => f.z1 <= c.north - 0.1 && c.north < A.island.z0 - A.boards.thickness, south: (f) => f.z0 >= c.south + 0.1 && c.south > A.island.z1 + A.boards.thickness,
    east: (f) => f.x0 >= c.east + 0.1 && c.east > A.island.x1 + A.boards.thickness };
  for (const b of A.seating.blocks) { assert.ok(plane[b.side], `no cut plane for a block on the ${b.side} side`); assert.ok(plane[b.side](L.blockFootprint(b)), `block ${b.id} is not beyond its cut plane`); }
  // the planes as the room light takes them: a point inside the island is on the drawn side of all six
  const planes = L.cutPlanes(-A.camera.bedH);
  assert.equal(planes.length, 6);
  const drawn = (i, p) => planes[i][0] * p[0] + planes[i][1] * p[1] + planes[i][2] * p[2] + planes[i][3] > 0;
  for (let i = 0; i < 6; i++) assert.ok(drawn(i, [0, 0.5, 0]), `plane ${i} drops its side for a camera over the table`);
  assert.ok(!drawn(SIDE.north, [0, 1, c.north - 0.01]) && !drawn(SIDE.south, [0, 1, c.south + 0.01]) && !drawn(SIDE.east, [c.east + 0.01, 1, 0]) && !drawn(SIDE.west, [c.west - 0.01, 1, 0]));
  assert.ok(!drawn(SIDE.top, [0, -A.camera.bedH + c.top + 0.01, 0]) && drawn(SIDE.top, [0, -A.camera.bedH + c.top - 0.01, 0]));
  assert.deepEqual(planes[SIDE.keep], [0, 0, 0, 1]);
  assert.equal(c.top, A.rig.bottomH);
  // out of reach
  assert.ok(A.backdrop.x < v.x0 - 0.1 && c.west > A.backdrop.x && c.west < v.x0, 'the backdrop is behind the reach, its plane between');
  assert.ok(A.hall.x0 < v.x0 - 1 && A.hall.x1 > v.x1 + 1 && A.hall.z0 < v.z0 - 1 && A.hall.z1 > v.z1 + 1, 'the walls');
  assert.ok(A.houseLights.h0 > v.h1 + 0.2 && A.hall.height > v.h1 + 1, 'the house lights and the roof');
});

ok('views: every review pose is a camera pose inside the island, on the drawn side of every cut, with a free line to its target', () => {
  assert.deepEqual(VIEWS.map((v) => v.id), ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V9', 'V10', 'V11', 'TV', 'BACK']);
  const lane = JSON.parse(JSON.stringify(VIEWS));
  const solids = [...boardBoxes(), ...FLOOR_ITEMS];
  for (const v of lane) {
    const [x, y, z] = v.cam, h = y + A.camera.bedH;
    assert.ok(L.inCameraVolume(x, h, z), `${v.id} is not a pose the app's camera can take`);
    assert.ok(x > A.island.x0 + 0.5 && x < A.island.x1 - 0.5 && z > A.island.z0 + 0.5 && z < A.island.z1 - 0.5, `${v.id} is outside the island`);
    assert.ok(h < A.cut.top, `${v.id} is above the rig's plane`);
    assert.ok(Math.hypot(v.cam[0] - v.target[0], v.cam[1] - v.target[1], v.cam[2] - v.target[2]) > 0.2 && v.fov >= 20 && v.fov <= 70);
    // the segment camera -> target against every floor-standing box (64 samples)
    for (let k = 0; k <= 64; k++) {
      const t = k / 64, px = x + (v.target[0] - x) * t, pz = z + (v.target[2] - z) * t, ph = h + (v.target[1] + A.camera.bedH - h) * t;
      for (const s of solids) assert.ok(!(px > s.x0 && px < s.x1 && pz > s.z0 && pz < s.z1 && ph < s.h), `${v.id}: ${s.id ?? `${s.side} boards`} stands between the camera and its target`);
    }
    for (const f of FLOOR_ITEMS) assert.ok(Math.hypot(f.x - x, f.z - z) > f.r + 0.3, `${v.id} stands inside ${f.id}`);
  }
});

ok('layout: emitter shares, palette, sides, no people', () => {
  // (CONTRACT 14.2's 24; round A4: the six house floods are the room's, the rig keeps its eight heads (the luminaire's band
  // is bake-only), the floor part has no emitter)
  assert.deepEqual({ ...A.emitters }, { bake: 6, shell: 4, rig: 8, surround: 6, floor: 0 });
  assert.equal(Object.values(A.emitters).reduce((a, b) => a + b, 0), 24);
  const hex = /^#[0-9a-f]{6}$/;
  for (const [k, v] of Object.entries(PALETTE)) { if (k === 'alt') { for (const a of Object.values(v)) assert.match(a, hex); } else assert.match(v, hex, `PALETTE.${k}`); }
  assert.deepEqual({ ...SIDE }, { keep: 0, north: 1, east: 2, south: 3, west: 4, top: 5 });
  assert.ok(Object.isFrozen(A) && Object.isFrozen(A.seating.blocks[0]) && Object.isFrozen(WORDS) && Object.isFrozen(VIEWS[0].cam));
  // no figure of a person in any list: the layout names places and things only
  const names = [];
  const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { names.push(k); if (typeof v === 'string') names.push(v); else if (v && typeof v === 'object') walk(v, `${p}.${k}`); } };
  walk(A, 'ARENA'); walk(PALETTE, 'PALETTE');
  for (const nm of names) assert.ok(!/crowd|people|person|audience|spectator|figure|silhouette|mannequin|\bface\b|\bman\b|\bwoman\b/i.test(nm), `"${nm}" names a person`);
  assert.deepEqual(Object.keys(A.floor), ['cameras', 'lowCamera', 'workLights', 'chairs', 'sideTables', 'refereeTable', 'steps', 'cables', 'cableWidth']);
  // round A6: a work light per camera platform: one entry per camera, its lit face 0.9 to 1.1 m from the head it is tipped
  // at, above the head, outside the app camera's reach (the cameras' own law), in the floor role's shape
  {
    const ids = A.floor.cameras.map((c) => c.id).sort();
    assert.deepEqual(A.floor.workLights.map((w) => w.id).sort(), ids, 'one work light per camera');
    for (const w of A.floor.workLights) {
      const c = A.floor.cameras.find((q) => q.id === w.id);
      assert.deepEqual(Object.keys(w), ['id', 'x', 'z', 'h', 'aim']);
      assert.ok(Math.abs(w.aim[0] - c.x) < 1e-9 && Math.abs(w.aim[1] - c.z) < 1e-9, `work light ${w.id} is aimed at its camera`);
      assert.ok(Math.abs(w.aim[2] - (c.platform.h + 1.5)) < 1e-9, `work light ${w.id}: the head is 1.5 m over the deck`);
      const d = Math.hypot(w.x - w.aim[0], w.z - w.aim[1], w.h - w.aim[2]);
      assert.ok(d > 0.9 && d < 1.1 && w.h > w.aim[2], `work light ${w.id} stands ${d.toFixed(2)} m from the head`);
      assert.ok(!L.inCameraVolume(w.x, w.h, w.z), `work light ${w.id} stands where the app's camera can be`);
    }
  }
  // round A5: the low camera stands inside the boards, outside the stroke room, and UNDER the app camera's cone with the
  // layout's clearance (a base plate of 0.22 m radius and a head box of 0.44 m: the floor part's own arm has the vertices)
  {
    const c = A.floor.lowCamera;
    assert.ok(c.x > STROKE.x1 && c.x + 0.22 < A.island.x1 - 0.3 && Math.abs(c.z) + 0.22 < A.island.z1, `the low camera at (${c.x}, ${c.z})`);
    assert.ok(L.underCamera({ x0: c.x - 0.22, x1: c.x + 0.22, z0: c.z - 0.22, z1: c.z + 0.22, h: c.top }), `the low camera's top (${c.top} m) is not under the camera's cone`);
  }
  // steps: one per seating block, at its aisle; cables: flat runs that stay out of the stroke room and inside the hall
  assert.deepEqual(A.floor.steps.map((q) => q.side), A.seating.blocks.map((b) => b.side));
  for (const q of A.floor.steps) { const b = A.seating.blocks.find((x) => x.side === q.side); assert.ok(q.at === b.aisleAt && q.width > 0.8 && q.width <= A.seating.aisleWidth); }
  for (const c of A.floor.cables) {
    assert.ok(c.path.length >= 2);
    for (let k = 0; k + 1 < c.path.length; k++) for (let t = 0; t <= 16; t++) {
      const x = c.path[k][0] + (c.path[k + 1][0] - c.path[k][0]) * t / 16, z = c.path[k][1] + (c.path[k + 1][1] - c.path[k][1]) * t / 16;
      assert.ok(!(x > STROKE.x0 && x < STROKE.x1 && z > STROKE.z0 && z < STROKE.z1), `cable ${c.id} crosses the stroke room`);
      assert.ok(x > A.hall.x0 && x < A.hall.x1 && z > A.hall.z0 && z < A.hall.z1);
      // round A3: a run stays outside the island (it goes from a camera's platform to a seating block's flank)
      assert.ok(!(x > A.island.x0 && x < A.island.x1 && z > A.island.z0 && z < A.island.z1), `cable ${c.id} enters the island`);
    }
    // a run starts at its camera
    const cam = A.floor.cameras.find((q) => q.id === c.id);
    assert.ok(cam && c.path[0][0] === cam.x && c.path[0][1] === cam.z, `cable ${c.id} does not start at a camera`);
  }
});

// ---- 2. words --------------------------------------------------------------------------------------------------------------
const arenaDir = path.join(web, 'scene/club/arena');
const arenaFiles = (function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : [])); })(arenaDir).sort();
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
// upper-case literals that are code, not content (each one audited: a new one fails until it is added here)
const CODE_WORDS = new Set(['V10', 'V11', 'TV', 'BACK' /* ids of review poses (layout.js VIEWS) */, 'RGBA', 'USE_INSTANCING', 'USE_COLOR', 'ROOM_HIDE',
  'YXZ' /* a rotation order of three's Euler (surround.js, audited 2026-11-15) */]);
ok('words: WORDS is the pinned list; no other upper-case word is written in any arena source file', () => {
  assert.deepEqual([...WORDS], ['9-BALL', 'TABLE 1', 'ARENA', 'FINAL']);
  const bad = [];
  for (const file of arenaFiles) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      const lit = m[2].trim();
      // a word as it would be drawn: two or more capitals or digits in a row, in a literal of capitals, digits, spaces and dashes
      if (!/^[A-Z0-9][A-Z0-9 \-]*$/.test(lit) || !/[A-Z]{2}|[A-Z][0-9 \-]+[A-Z0-9]|[0-9][ \-]?[A-Z]{2}/.test(lit)) continue;
      if (WORDS.includes(lit) || CODE_WORDS.has(lit)) continue;
      bad.push(`${path.relative(web, file)}: "${lit}"`);
    }
    // text drawn through a canvas takes its string from WORDS, never from a literal that is not on the list
    for (const m of src.matchAll(/\b(?:fillText|strokeText|drawText|layoutText)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      if (!WORDS.includes(m[2])) bad.push(`${path.relative(web, file)}: text call with "${m[2]}"`);
    }
  }
  assert.deepEqual(bad, [], `words outside WORDS:\n  ${bad.join('\n  ')}`);
});

// ---- 4. source pins (before the build: they need no three) -------------------------------------------------------------------
const roomSrc = read('scene/club/arena/room.js'), shellSrc = arenaFiles.filter((f) => /arena\/shell(\.js$|\/)/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
ok('source: the room loads its three parts by literal dynamic imports and returns the member list of CONTRACT 13.4 and 14.2', () => {
  assert.ok(roomSrc.includes("import('./rig.js')") && roomSrc.includes("'buildRig'"));
  assert.ok(roomSrc.includes("import('./surround.js')") && roomSrc.includes("'buildSurround'"));
  assert.ok(roomSrc.includes("import('./floor.js')") && roomSrc.includes("'buildFloor'"));
  assert.equal((stripComments(roomSrc).match(/\bimport\(/g) ?? []).length, 3, 'exactly three dynamic imports');
  // (round A4: the rig is built with `spill: false`: the luminaire's band is no run-time emitter of the arena, the rig
  // hands it to the bake)
  assert.ok(/spill: false \}, partWait\)/.test(roomSrc) && !/spill: true \}, partWait\)/.test(roomSrc) && /appRoom/.test(roomSrc));
  const ret = roomSrc.slice(roomSrc.lastIndexOf('    return {\n      enabled: true,'));
  for (const member of ['enabled: true', 'group,', 'box,', 'floor: { mesh:', 'material:', 'builtinShadow:', 'get albedo()', 'emissives,', 'lightmap,', 'setTier(tier)', 'layout:', 'light: roomLight', 'tableBounds', 'parts: {', 'get lamp()', 'get surround()', 'get floor()', 'bakeEmitters,', 'recapture, state,', 'dispose()']) {
    assert.ok(ret.includes(member), `the returned object lacks "${member}"`);
  }
  const lmObj = roomSrc.slice(roomSrc.indexOf('const lightmap = {'), roomSrc.indexOf('    return {\n      enabled: true,'));
  for (const member of ['get texture()', 'ready: lmFile.ready', 'state:', 'set(on)', 'signature,', 'preview(texture, meta', 'floorIrradiance:']) assert.ok(lmObj.includes(member), `room.lightmap lacks "${member}"`);
  // the app room's parts it hides: walls, floor, floor-shadow overlay, wall props (as ../room.js)
  assert.ok(roomSrc.includes('hide(lr?.walls); hide(appFloor); hide(lr?.blob ?? appRoom?.giRefs?.blob);') && roomSrc.includes("o.name === 'obFarPropTable'"));
  assert.ok(read('scene/club/room.js').includes('hide(lr?.walls); hide(appFloor); hide(lr?.blob ?? appRoom?.giRefs?.blob);'), 'the club room hides the same parts');
});

ok('source: no three light, no shadow map, no import from outside the club directory, no computed import', () => {
  for (const file of arenaFiles) {
    const rel = path.relative(web, file), src = stripComments(fs.readFileSync(file, 'utf8'));
    assert.ok(!/new\s+THREE\.\w*Light\s*\(/.test(src), `${rel} makes a three light`);
    assert.ok(!/shadowMap|castShadow\s*=|receiveShadow\s*=/.test(src), `${rel} touches shadows`);
    for (const m of src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec === 'three') continue;
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${rel} imports "${spec}"`);
      const target = path.resolve(path.dirname(file), spec);
      assert.ok(target.startsWith(path.join(web, 'scene/club') + path.sep), `${rel} imports from outside web/scene/club: ${spec}`);
    }
    for (const m of src.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) assert.match(m[1].trim(), /^['"]\.\/[\w./-]+['"]$/, `${rel}: a dynamic import that is not a literal`);
    assert.ok(!/Math\.random\s*\(/.test(src), `${rel} uses Math.random (the hall is the same on every load)`);
  }
  assert.ok(/tableShadow: true/.test(shellSrc), 'the carpet is the room light\'s floor material');
});

ok('light map (round A7, CONTRACT 19.2): the room\'s own packing fits the map, no two charts touch, the island\'s carpet holds 2 cm a texel', () => {
  const P = L.LM_PACK, shell = { size: 1024, pad: 2, scale: 27.75, charts: [
    { kind: 'floor', of: 'floor', mw: 25, mh: 25.2 }, { kind: 'wall', of: 'wall:backdrop', mw: 14, mh: 6 }, { kind: 'wall', of: 'wall:north', mw: 25, mh: 7 }, { kind: 'wall', of: 'wall:east', mw: 25.2, mh: 7 },
    { kind: 'wall', of: 'wall:south', mw: 25, mh: 7 }, { kind: 'wall', of: 'wall:west', mw: 25.2, mh: 7 }, { kind: 'roof', of: 'roof:0', mw: 25, mh: 12.6 }, { kind: 'roof', of: 'roof:1', mw: 25, mh: 12.6 }] };
  // (the island's carpet as the shell lays it on base and high: inside the boards' line)
  const isl = { x0: -5.29, x1: 5.29, z0: -3.99, z1: 3.99 }, pack = L.lightmapPack(shell, isl, [L.ARENA.hall.x0, L.ARENA.hall.z0]);
  assert.ok(pack, 'the packing fits a 1024 px map');
  assert.equal(pack.charts.length, shell.charts.length + 1); assert.equal(pack.island, shell.charts.length); assert.equal(pack.floor, 0);
  for (let i = 0; i < shell.charts.length; i++) assert.deepEqual([pack.charts[i].kind, pack.charts[i].of, pack.charts[i].mw, pack.charts[i].mh], [shell.charts[i].kind, shell.charts[i].of, shell.charts[i].mw, shell.charts[i].mh], 'the shell\'s charts keep their order');
  const I = pack.charts[pack.island];
  assert.equal(I.of, 'floor:island'); assert.equal(I.kind, 'floor'); assert.deepEqual(I.o, [5.71, 8.61]);
  assert.ok(Math.abs(I.w / I.mw - P.island) < 0.1 && Math.abs(I.h / I.mh - P.island) < 0.1 && P.island >= 50, `the island: ${(100 * I.mw / I.w).toFixed(2)} cm a texel`);
  for (let a = 0; a < pack.charts.length; a++) {
    const A = pack.charts[a];
    assert.ok(A.rot === false && A.x >= 1 && A.y >= 1 && A.x + A.w <= 1023 && A.y + A.h <= 1023, `chart ${A.of} lies inside the map`);
    for (let b = a + 1; b < pack.charts.length; b++) {
      const B = pack.charts[b];
      assert.ok(A.x + A.w + pack.pad <= B.x || B.x + B.w + pack.pad <= A.x || A.y + A.h + pack.pad <= B.y || B.y + B.h + pack.pad <= A.y, `charts ${A.of} and ${B.of} keep ${pack.pad} px apart`);
    }
  }
  // the hall's carpet at 5 cm or finer, the walls at 5 cm or finer, the backdrop and the lid no coarser than before
  const d = (c) => Math.min(c.w / c.mw, c.h / c.mh);
  assert.ok(d(pack.charts[0]) >= 19.9 && d(pack.charts[2]) >= 19.9 && d(pack.charts[1]) >= 22.1 && d(pack.charts[6]) >= 11.8);
  // a hall that does not fit is refused (the shell's packing stays), never squeezed
  assert.equal(L.lightmapPack({ ...shell, size: 512 }, isl, [L.ARENA.hall.x0, L.ARENA.hall.z0]), null);
});

// (round A8: the hall cube's arithmetic had no arm of its own in round A7)
await okAsync('the hall cube (CONTRACT 19.1): a direction finds its face and comes back; the chain keeps its sizes; the file\'s coding gives a face its colour back', async () => {
  const ENV = await import('./bake-room-env.mjs');
  for (const d of [[1, 0.3, -0.2], [-1, 0.5, 0.4], [0.2, 1, -0.6], [-0.3, -1, 0.1], [0.4, -0.2, 1], [0.1, 0.7, -1]]) {
    const [f, u, v] = ENV.dirFace(...d), back = ENV.faceDir(f, u, v);
    assert.ok(Math.abs(u) <= 1 && Math.abs(v) <= 1 && d.every((x, k) => Math.abs(x - back[k]) < 1e-12), `direction ${d}: face ${f}`);
  }
  // a cube of 16 px with one colour a face (three channels a thousand apart: the coding shares one exponent a texel)
  const size = 16, colour = (f) => [f + 1, 0.5 * (f + 1), 0.001 * (f + 1)], faces = new Float32Array(6 * size * size * 3);
  for (let f = 0; f < 6; f++) for (let t = 0; t < size * size; t++) faces.set(colour(f), 3 * (f * size * size + t));
  const chain = ENV.envChain(faces, size), file = ENV.envPack(chain);
  assert.deepEqual(chain.map((l) => l.s), [16, 8, 4]);
  assert.deepEqual(chain.map((l) => l.rough), ENV.envRough(3));
  assert.deepEqual([file.width, file.height], [6 * size, 16 + 8 + 4]);
  for (let f = 0; f < 6; f++) {
    const got = ENV.envLookup(file.rgba, file.width, file.levels, 0, ...ENV.faceDir(f, 0.1, -0.1));
    colour(f).forEach((want, k) => assert.ok(Math.abs(got[k] - want) <= (f + 1) / 128, `face ${f}, channel ${k}: ${got[k]} for ${want}`));
  }
  // the roughest level is the whole cube through a cosine lobe: straight up it reads between the darkest and the brightest face
  const up = ENV.envLookup(file.rgba, file.width, file.levels, 2, 0, 1, 0);
  assert.ok(up[0] > 1.5 && up[0] < 5.5, `the roughest level, straight up: ${up[0]}`);
});

// ---- 3. the room, built in node ----------------------------------------------------------------------------------------------
{
  const { registerHooks } = await import('node:module');
  const threeUrl = pathToFileURL(path.join(web, 'vendor/three.module.min.js')).href;
  registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
  const THREE = await import('three');
  const hadDocument = 'document' in globalThis;
  // a stub 2D canvas: the hall's canvases are pixel loops into an ImageData
  const ctx2d = () => new Proxy({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) }, {
    get: (t, k) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k] = v; return true; },
  });
  if (!hadDocument) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d() }) };
  const ROOM_MOD = await import('../../scene/club/arena/room.js');
  const RIG_PLAN = await import('../../scene/club/arena/rig/plan.js');
  // (round A6: with the table keys on, the three spots under the perimeter truss are the far fill, `fill.<side>`, at the
  // plan's `far` level; the only `key.*` records are the four table keys)
  const TK = RIG_PLAN.HALL.tableKeys, TK_ON = TK.on === true, FAR = TK_ON ? 'fill' : 'key';
  const { createRoom, HOUSE: HOUSE_A4 } = ROOM_MOD, HOUSE_KEY = TK_ON ? ROOM_MOD.KEY_FILL : ROOM_MOD.KEY;
  const KEY_PLAN = RIG_PLAN.keyPlan(L.ARENA, { floorY: -0.79 }), FLOOD_PLAN = RIG_PLAN.floodPlan(L.ARENA, { floorY: -0.79 });
  const { roomLight } = await import('../../scene/club/room/light.js');
  const { TIERS } = await import('../../scene/club/tiers.js');

  const makeApp = () => {
    const group = new THREE.Group();
    const mk = (name) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()); o.name = name; group.add(o); return o; };
    const floor = mk('appFloor'); floor.position.y = -0.79;
    const walls = mk('appWalls'), blob = mk('appBlob'), lampFace = mk('appLampFace');
    const far = new THREE.Group(); far.name = 'obFarPropTable'; group.add(far);
    return { group, giRefs: { floor, blob }, lightRefs: { group, rectLights: [], walls, floor, blob, lampFace } };
  };
  const warn = console.warn; const warned = [];
  console.warn = (...a) => { warned.push(a.map(String).join(' ')); };
  const built = {};
  try {
    for (const tier of ['lite', 'base', 'high']) {
      const scene = new THREE.Scene();
      const app = makeApp(); scene.add(app.group);
      const frameFns = [];
      const club = { enabled: true, tier, knobs: TIERS[tier], venue: 'arena', ctx: { scene, room: app, query: new URLSearchParams(''), rebakeEnv() { club.bakes += 1; } }, bakes: 0,
        onFrame(fn) { frameFns.push(fn); }, offFrame(fn) { const i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); } };
      const room = await createRoom(club);
      built[tier] = { room, club, app, scene, frameFns, state: room.enabled ? room.state() : null, lightState: room.enabled ? JSON.parse(JSON.stringify(roomLight.state())) : null };
      if (room.enabled) {
        // geometry facts are read now: the light service is one object and the next build resets it
        const meshes = []; room.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
        // (the hall's own meshes only: the parts' meshes are their owners' arms' business)
        const partOf = (m) => { let top = m; while (top.parent && top.parent !== room.group) top = top.parent; return top.name; };
        built[tier].partMeshes = meshes.filter((m) => partOf(m) !== 'arenaHallShell').length;
        built[tier].meshes = meshes.filter((m) => partOf(m) === 'arenaHallShell').map((m) => {
          const pos = m.geometry.attributes.position; let nan = 0; for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) nan += 1;
          m.geometry.computeBoundingBox();
          return { name: m.name, part: partOf(m), material: m.material?.name ?? null, nan, box: m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld), triangles: (m.geometry.index?.count ?? pos.count) / 3, lm: !!m.geometry.attributes.lm, key: m.material?.userData?.clubRoom ?? null };
        });
        const emRow = (e) => ({ id: e.id, type: e.type, y: e.position.y, x: e.position.x, z: e.position.z, intensity: e.intensity, radius: e.radius, nx: e.normal?.x ?? 0, ny: e.normal?.y ?? 0, nz: e.normal?.z ?? 0,
          ax: e.axis?.x ?? 0, ay: e.axis?.y ?? 0, az: e.axis?.z ?? 0, cone: e.cone ?? null, bell: e.bell ?? null, r: e.color?.r, g: e.color?.g, b: e.color?.b,
          shutter: Array.isArray(e.shutter) ? e.shutter.slice() : null, foot: Array.isArray(e.foot) ? e.foot.slice() : null,
          ...(Array.isArray(e.sides) ? { sides: e.sides.map((n) => n.slice()) } : {}) });
        built[tier].emitters = roomLight.emitters.map(emRow);
        built[tier].bakeOnly = (room.bakeEmitters ?? []).map(emRow);
        // the signature's three layers, and what the room does with a bake whose part moved or whose layout is another
        // (a 1 x 1 stand-in texture through room.lightmap.preview; read now: the light service is rebuilt by the next tier)
        const sig = room.lightmap.signature();
        const tex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
        const meta = (over) => ({ v: 4, sig: sig.sig, soft: sig.soft, parts: { ...sig.parts }, fullScale: 16, ...over });
        const tryMeta = (over) => { const on = room.lightmap.preview(tex, meta(over)); const s = room.state().lightmap; return { on, reason: s.reason, stale: s.stale, note: s.note, live: s.live, baked: s.baked }; };
        built[tier].sig = {
          sig,
          same: tryMeta({}),
          rigMoved: tryMeta({ parts: { ...sig.parts, rig: 'rig-of-another-day' } }),
          floorMoved: tryMeta({ parts: { ...sig.parts, floor: 'floor-with-a-chair-moved' } }),
          levels: tryMeta({ soft: '0000000000000000' }),
          noParts: tryMeta({ parts: undefined }),
          otherDetail: tryMeta({ parts: { ...sig.parts, detail: 7, rig: 'the-rig-of-that-detail' } }),
          otherLayout: tryMeta({ sig: '0123456789abcdef' }), // (the last one: the room is left on its analytic light)
        };
        for (const fn of [...frameFns]) fn(0, 1 / 60);
        built[tier].afterFrame = room.state();
      }
    }
  } finally { console.warn = warn; }

  await okAsync('room: built on every tier; the member list of CONTRACT 13.4 with the right kinds', async () => {
    for (const [tier, b] of Object.entries(built)) {
      const r = b.room;
      assert.equal(r.enabled, true, `${tier}: ${r.reason}`);
      assert.ok(r.group?.isObject3D && r.group.visible === true && r.group.parent === b.scene);
      assert.ok(r.box.min.isVector3 && r.box.max.isVector3 && r.box.center.isVector3);
      assert.deepEqual([r.box.min.x, r.box.min.y, r.box.min.z, r.box.max.x, r.box.max.z], [A.hall.x0, -0.79, A.hall.z0, A.hall.x1, A.hall.z1]);
      assert.ok(Math.abs(r.box.max.y - (-0.79 + A.hall.height)) < 1e-9);
      assert.ok(r.floor.mesh?.isMesh && r.floor.material?.isMeshStandardMaterial && r.floor.material === r.floor.mesh.material);
      assert.ok(Array.isArray(r.floor.albedo) && r.floor.albedo.length === 3 && r.floor.albedo.every((v) => v > 0.02 && v < 0.3), `${tier}: floor albedo ${r.floor.albedo}`);
      assert.ok(r.floor.builtinShadow && r.floor.builtinShadow.value === 1);
      assert.ok(Array.isArray(r.emissives) && r.emissives.length >= 1 && r.emissives.every((e) => e.isObject3D));
      assert.equal(r.light, roomLight);
      assert.equal(typeof r.light.irradianceAt, 'function');
      for (const k of ['state', 'set', 'signature', 'preview', 'floorIrradiance']) assert.equal(typeof r.lightmap[k], 'function', `lightmap.${k}`);
      assert.ok(r.lightmap.ready instanceof Promise && r.lightmap.texture === null);
      assert.ok('lamp' in r.parts && 'surround' in r.parts);
      assert.ok(r.layout.ARENA === A && r.layout.rig === A.rig && r.layout.PALETTE === PALETTE && typeof r.layout.cutPlanes === 'function');
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) assert.ok(Number.isFinite(r.tableBounds[k]));
      for (const k of ['setTier', 'recapture', 'state', 'dispose']) assert.equal(typeof r[k], 'function');
      assert.equal(r.setTier(tier), true); assert.equal(r.setTier('nope'), false);
      assert.equal(r.lightmap.floorIrradiance(0, 3), null, 'no bake: no baked floor light');
      const e = r.light.irradianceAt([0, -0.79, 3], [0, 1, 0]);
      assert.ok(e.every((v) => Number.isFinite(v) && v > 0), 'analytic light on the carpet');
    }
  });

  ok('room: the app room\'s walls, floor, shadow overlay and wall props are hidden, its lamp stays; the capture is asked for', () => {
    for (const [tier, b] of Object.entries(built)) {
      const lr = b.app.lightRefs;
      assert.ok(!lr.walls.visible && !lr.floor.visible && !lr.blob.visible, `${tier}: an app part is still shown`);
      assert.equal(b.app.group.getObjectByName('obFarPropTable').visible, false);
      assert.equal(lr.lampFace.visible, true);
      assert.ok(b.club.bakes >= 1, `${tier}: no environment capture after the swap`);
      assert.equal(b.state.hiddenAppObjects.length, 4);
    }
  });

  // (the shell's own counts, names and looks are its owner's arm: test-club-arena-shell.mjs. Here: what the ROOM needs of it.)
  ok('hall: every shell mesh inside the hall, no NaN, named materials, the carpet is the floor and carries the second UV set', () => {
    const tri = {};
    for (const [tier, b] of Object.entries(built)) {
      const hall = b.meshes.filter((m) => m.part === 'arenaHallShell');
      assert.ok(hall.length >= 2 && hall.length <= 12, `${tier}: ${hall.length} hall meshes`);
      for (const m of hall) {
        assert.equal(m.nan, 0, `${tier}: ${m.name} has NaN vertices`);
        assert.match(m.material, /^arena\.(hall|shell)\.[a-z.]+$/, `${tier}: ${m.name} material name`);
        assert.ok(m.box.min.x >= A.hall.x0 - 1e-6 && m.box.max.x <= A.hall.x1 + 1e-6 && m.box.min.z >= A.hall.z0 - 1e-6 && m.box.max.z <= A.hall.z1 + 1e-6, `${tier}: ${m.name} leaves the hall`);
        assert.ok(m.box.min.y >= -0.79 - 1e-6 && m.box.max.y <= -0.79 + A.hall.height + 1e-6, `${tier}: ${m.name} leaves the hall's height`);
      }
      const carpet = hall.find((m) => m.name === 'arenaHallCarpet'), back = hall.find((m) => m.name === 'arenaHallBackdrop');
      assert.ok(carpet && back, `${tier}: the shell has no mesh named arenaHallCarpet / arenaHallBackdrop`);
      assert.equal(b.room.floor.mesh.name, 'arenaHallCarpet', `${tier}: room.floor.mesh`);
      assert.ok(carpet.lm && back.lm && /\|ts\|/.test(carpet.key), `${tier}: carpet key ${carpet.key}`);
      // the table's shadow under the emitters: the carpet's program alone carries the switch (room/light.js `tableBlock`)
      // (round A3: every program of the hall also carries the cone switch, `|cone`, after it)
      assert.ok(carpet.key.endsWith('|tb|cone') && hall.filter((m) => m.key && m !== carpet).every((m) => !m.key.includes('|tb')), `${tier}: the table-block switch is on the wrong programs`);
      assert.ok(hall.filter((m) => /^club-room-light/.test(m.key ?? '')).every((m) => m.key.includes('|cone')), `${tier}: a lit program of the hall without the cone switch: ${hall.map((m) => m.key).join('  ')}`);
      assert.ok(Math.abs(carpet.box.max.y + 0.79) < 1e-6 && Math.abs(carpet.box.min.x - A.hall.x0) < 1e-6 && Math.abs(carpet.box.max.x - A.hall.x1) < 1e-6, 'the carpet covers the hall at the floor height');
      assert.ok(Math.abs(back.box.min.x - A.backdrop.x) < 1e-6 && Math.abs(back.box.max.y - (-0.79 + A.backdrop.height)) < 1e-6);
      tri[tier] = hall.reduce((s, m) => s + m.triangles, 0);
      assert.equal(b.state.shell.triangles, tri[tier]);
      // nothing of the hall is where the camera can be, except the carpet under it
      for (const m of hall.filter((q) => q.name !== 'arenaHallCarpet')) {
        const v = A.keepOut.cameraVolume;
        const clear = m.box.min.x > v.x1 || m.box.max.x < v.x0 || m.box.min.z > v.z1 || m.box.max.z < v.z0 || m.box.min.y + 0.79 > v.h1 || m.name === 'arenaHallMatt' || m.name === 'arenaHallWashLenses';
        if (!clear) console.log(`   note (${tier}): the shell's ${m.name} reaches into the camera volume (its owner's arm decides)`);
      }
    }
    assert.ok(tri.lite < tri.base && tri.base <= tri.high, `triangles lite ${tri.lite}, base ${tri.base}, high ${tri.high}`);
    console.log(`   hall triangles: lite ${tri.lite}, base ${tri.base}, high ${tri.high}`);
  });

  // who owns an emitter, by its id (CONTRACT 14.2: bake 2, shell 4, rig 9, surround 6, floor 3)
  const ownerOfEmitter = (id) => (id.startsWith('house.') ? 'bake' : id.startsWith('hall.') || id.startsWith('shell.') ? 'shell' : id.startsWith('rig.') || id === 'lamp.band' ? 'rig'
    : id.startsWith('arena.') || id.startsWith('surround.') ? 'surround' : id.startsWith('floor.') ? 'floor' : 'unknown');
  ok('light: the house panels are the bake role\'s two emitters; the bake takes the third; every emitter is in the hall; the cut planes are set', () => {
    for (const [tier, b] of Object.entries(built)) {
      const own = b.emitters.filter((e) => ownerOfEmitter(e.id) === 'bake');
      // ROUND A4: the six house floods are run-time emitters on the high and the base tier (so the frame without the map
      // has the sources of the frame with it); lite keeps three at run time and hands three to its file
      const FLOODS = ['n0', 'n1', 's0', 's1', 'e0', 'e1'].map((id) => `house.${id}`), LITE_FLOODS = ['house.n0', 'house.n1', 'house.e0'];
      assert.deepEqual(own.map((e) => e.id), tier === 'lite' ? LITE_FLOODS : FLOODS, `${tier}: the bake role's emitters`);
      assert.ok(own.length <= A.emitters.bake);
      // bake-only on every tier: the three key lights and the luminaire's band; on lite also the three other floods and
      // what the shell and the parts registered beyond the tier's twelve. No coloured wash is left (CONTRACT 16.1).
      const bakeIds = b.bakeOnly.map((e) => e.id);
      for (const id of [`${FAR}.north`, `${FAR}.south`, `${FAR}.east`, ...(tier === 'lite' ? FLOODS.filter((q) => !LITE_FLOODS.includes(q)) : [])]) assert.ok(bakeIds.includes(id), `${tier}: ${id} is not in the bake's list (${bakeIds.join(' ')})`);
      assert.ok(!bakeIds.includes('key.west') && !bakeIds.some((id) => id.startsWith('rig.colour.')), `${tier}: a west key or a colour wash is left: ${bakeIds.join(' ')}`);
      assert.equal(new Set(bakeIds).size, bakeIds.length, `${tier}: an id twice in the bake's list`);
      assert.ok(!bakeIds.some((id) => b.emitters.some((q) => q.id === id)), `${tier}: an emitter is both registered and bake-only`);
      assert.deepEqual(b.state.emitterShare.bakeOnly, bakeIds);
      // `lamp.band` is never a run-time emitter of the arena (the rig hands it to the bake when it is built)
      assert.ok(!b.emitters.some((e) => e.id === 'lamp.band'), `${tier}: lamp.band is registered with the room light`);
      if (b.state.rig?.status === 'built') assert.ok(bakeIds.includes('lamp.band'), `${tier}: lamp.band is not in the bake's list`);
      // no emitter of the light role carries a colour: every one is neutral to warm (CONTRACT 16.1; the backdrop's amber
      // wash is the hall's one hue). Another part's emitter that leans blue or violet is NOTED for its owner.
      for (const e of [...b.emitters, ...b.bakeOnly]) {
        if (/^hall\.wash\./.test(e.id) || !Number.isFinite(e.r)) continue;
        const neutral = e.b <= e.r * 1.12 + 1e-9 && e.g <= e.r * 1.08 + 1e-9;
        if (/^(house|key|fill|work|roof|rig|lamp)\./.test(e.id)) assert.ok(neutral, `${tier}: ${e.id} is tinted (${e.r}, ${e.g}, ${e.b})`);
        else if (!neutral && tier === 'high') console.log(`   note: ${e.id} leans cool (${[e.r, e.g, e.b].map((v) => +v.toFixed(2)).join(', ')}): its owner's to judge against CONTRACT 16.1`);
      }
      // ROUND A6 (CONTRACT 18.1): the table keys. Exactly four records start with `key.` (the table's body reads them):
      // each a profile's flat field from the outer rectangle, 30 to 60 degrees over the horizon at the table, with a
      // shutter that leaves the bed, the balls and the rail across dark and the body under its own rail lit; the
      // south-west pair at twice the north-east pair
      if (TK_ON) {
        const keys = b.bakeOnly.filter((q) => q.id.startsWith('key.'));
        assert.deepEqual(keys.map((e) => e.id).sort(), ['key.ne.e', 'key.ne.n', 'key.sw.s', 'key.sw.w'], `${tier}: the table keys`);
        const lit = (e, p) => e.shutter[0] * (p[0] - e.x) + e.shutter[1] * (p[1] - e.y) + e.shutter[2] * (p[2] - e.z);
        const sx0 = (k) => (k.rail === 'west' ? -1 : 1), sz0 = (k) => (k.rail === 'north' ? -1 : 1);
        for (const e of keys) {
          const k = TK.keys.find((q) => `key.${q.id}` === e.id);
          assert.ok(e.type === 'point' && e.cone === (k.cone ?? TK.cone) && e.bell === (k.bell === true) && e.intensity === k.intensity && e.radius >= 10, `${tier}: ${e.id} form`);
          assert.ok(Array.isArray(e.shutter) && Math.abs(Math.hypot(...e.shutter) - 1) < 1e-3, `${tier}: ${e.id} has no shutter`);
          const h = e.y + 0.79, out = Math.hypot(e.x, e.z);
          assert.ok(h > 3.4 && h < 4.1 && out > 2.5 && out < 4.6, `${tier}: ${e.id} stands at (${e.x}, ${h}, ${e.z})`);
          const elev = (Math.asin(-e.ay) * 180) / Math.PI;
          assert.ok(elev > 30 && elev < 60 && e.ax * e.x + e.az * e.z < 0, `${tier}: ${e.id} arrives at ${elev.toFixed(1)} degrees`);
          // the bed, a ball at each end and the far rail's top: dark; the body under the key's own rail and the carpet: lit
          for (const p of [[0, 0, 0], [1.2, 0.03, 0.6], [-1.2, 0.03, -0.6], [1.2, 0.03, -0.6], [-1.2, 0.03, 0.6], [0, 0.056, 0.7], [0, 0.056, -0.7], [1.36, 0.056, 0], [-1.36, 0.056, 0]]) assert.ok(lit(e, p) < -0.02, `${tier}: ${e.id} reaches the table's top at (${p})`);
          const sx = Math.sign(e.x), sz = Math.sign(e.z), long = k.rail === 'south' || k.rail === 'north';
          const body = long ? [[0, -0.07, sz * 0.8064], [sx * 1.2, -0.45, sz * 0.68], [-sx * 1.2, -0.45, sz * 0.68]] : [[sx * 1.4414, -0.07, 0], [sx * 1.313, -0.45, sz * 0.57], [sx * 1.313, -0.45, -sz * 0.57]];
          for (const p of body) assert.ok(lit(e, p) > 0.02, `${tier}: ${e.id} does not reach the body at (${p})`);
          // the second blade, at the table's foot: the body and the carpet under the skirt on the lit side, the carpet
          // a metre in front of the table on the dark side (the pool is not the keys')
          assert.ok(Array.isArray(e.foot) && Math.abs(Math.hypot(...e.foot) - 1) < 1e-3, `${tier}: ${e.id} has no foot blade`);
          const foot = (p) => e.foot[0] * (p[0] - e.x) + e.foot[1] * (p[1] - e.y) + e.foot[2] * (p[2] - e.z);
          for (const p of body) assert.ok(foot(p) > 0.1, `${tier}: ${e.id}: its foot blade cuts the body at (${p})`);
          const under = long ? [0, -0.79, sz * 0.5] : [sx * 1.15, -0.79, 0], front = long ? [0, -0.79, sz * 1.9] : [sx * 2.5, -0.79, 0];
          assert.ok(foot(under) > 0.1 && foot(front) < -0.3, `${tier}: ${e.id}: foot blade ${foot(under).toFixed(2)} under the skirt, ${foot(front).toFixed(2)} a metre in front`);
          // the side blades (HALL.tableKeys.legs): both legs of the key's side between them, the carpet 0.6 m past
          // either end of that side outside (a framed rectangle, not a wedge across the island)
          assert.equal(Array.isArray(e.sides), TK.legs?.on === true, `${tier}: ${e.id}: side blades as the plan says`);
          if (e.sides) {
            assert.ok(e.sides.length === 2 && e.sides.every((n) => Math.abs(Math.hypot(...n) - 1) < 1e-3 && Math.abs(n[1]) < 1e-6), `${tier}: ${e.id}: two vertical planes`);
            const sd = (n, p) => (n[0] * (p[0] - e.x) + n[1] * (p[1] - e.y) + n[2] * (p[2] - e.z)) / Math.hypot(p[0] - e.x, p[1] - e.y, p[2] - e.z);
            const legs = long ? [[1.2037, -0.45, sz0(k) * 0.68], [-1.2037, -0.45, sz0(k) * 0.68]] : [[sx0(k) * 1.313, -0.45, 0.5687], [sx0(k) * 1.313, -0.45, -0.5687]];
            const past = long ? [[2.05, -0.79, sz0(k) * 0.6], [-2.05, -0.79, sz0(k) * 0.6]] : [[sx0(k) * 1.2, -0.79, 1.42], [sx0(k) * 1.2, -0.79, -1.42]];
            for (const n of e.sides) {
              for (const p of legs) assert.ok(sd(n, p) > 0.02, `${tier}: ${e.id}: a side blade cuts the leg at (${p})`);
              assert.ok(past.some((p) => sd(n, p) < -0.02), `${tier}: ${e.id}: a side blade leaves the carpet past both corners lit`);
            }
          }
        }
        const I = Object.fromEntries(keys.map((e) => [e.id, e.intensity]));
        assert.ok(I['key.sw.s'] >= 1.8 * I['key.ne.n'] && I['key.sw.w'] >= 1.8 * I['key.ne.e'], `${tier}: one dominant direction: ${JSON.stringify(I)}`);
        // the work lights: one per camera the tier builds, 0.9 to 1.1 m from the head, a few candela, bake only
        const work = b.bakeOnly.filter((q) => q.id.startsWith('work.'));
        if (ROOM_MOD.WORK.on === true) {
          assert.deepEqual(work.map((e) => e.id).sort(), (tier === 'lite' ? ROOM_MOD.WORK.lite.map((id) => `work.${id}`) : A.floor.workLights.map((w) => `work.${w.id}`)).sort(), `${tier}: the work lights`);
          for (const e of work) assert.ok(e.intensity > 0 && e.intensity <= 8 && e.radius <= 5 && e.cone >= 30 && L.inCameraVolume(e.x, e.y + 0.79, e.z) === false, `${tier}: ${e.id}`);
        } else assert.equal(work.length, 0);
        // the roof bells' uplight: one per lit bell of the roof's field, at its top, radiating up only, bake only
        const up = b.bakeOnly.filter((q) => q.id.startsWith('roof.up.'));
        if (ROOM_MOD.ROOF_UP.on === true) {
          const bells = RIG_PLAN.roofPlan(L.ARENA, { floorY: -0.79 }).fixtures.filter((f) => f.kind === 'roof');
          assert.equal(up.length, bells.length, `${tier}: ${up.length} uplights for ${bells.length} lit bells`);
          up.forEach((e, i) => {
            assert.ok(e.type === 'point' && e.ny === 1 && e.nx === 0 && e.nz === 0 && e.cone === null, `${tier}: ${e.id} does not radiate up only`);
            assert.ok(Math.abs(e.x - bells[i].x) < 1e-9 && Math.abs(e.z - bells[i].z) < 1e-9 && e.y > bells[i].y + 0.25 && e.y < bells[i].y + 0.4, `${tier}: ${e.id} is not at its bell's top`);
            assert.ok(Math.abs(e.intensity - bells[i].level * ROOM_MOD.ROOF_UP.perLevel) < 1e-9 && e.radius <= 4, `${tier}: ${e.id} level`);
          });
        } else assert.equal(up.length, 0);
      }
      for (const e of b.bakeOnly.filter((q) => q.id.startsWith(`${FAR}.`))) {
        // a key: a point with a cone, outside the app camera's reach, aimed down across the table from far and low
        // (round A4: it stands at its fixture's lens: a profile spot under the perimeter truss; arena/rig/plan.js keyPlan)
        const side = e.id.slice(FAR.length + 1), at = KEY_PLAN.at[side];
        assert.equal(e.type, 'point', e.id);
        assert.ok(at && Math.abs(e.x - at.position[0]) < 1e-9 && Math.abs(e.z - at.position[2]) < 1e-9 && Math.abs(e.y - at.position[1]) < 1e-9, `${tier}: ${e.id} is not at its fixture's lens`);
        assert.ok(Math.abs(e.ax - at.axis[0]) < 1e-6 && Math.abs(e.ay - at.axis[1]) < 1e-6 && Math.abs(e.az - at.axis[2]) < 1e-6, `${tier}: ${e.id} is not aimed along its fixture`);
        assert.equal(L.inCameraVolume(e.x, e.y + 0.79, e.z), false, `${tier}: ${e.id} is inside the camera's reach`);
        // a soft beam: a bell of 14 to 22 degrees (round A3's flat 12 degrees drew a patch with an edge on the carpet)
        assert.ok(e.cone === HOUSE_KEY.cone && e.cone >= 14 && e.cone <= 22 && e.bell === true, `${tier}: ${e.id} cone ${e.cone}`);
        assert.ok(e.intensity === HOUSE_KEY[side] && e.intensity <= 100 && e.radius >= 30, `${tier}: ${e.id} level`);
        const elev = (Math.asin(-e.ay) * 180) / Math.PI;
        // its axis points at the table (the horizontal part of the axis runs from the key toward the hall's middle)
        assert.ok(e.ax * e.x + e.az * e.z < 0, `${tier}: ${e.id} is not aimed at the table`);
        // under the perimeter truss: 20 to 30 degrees, low enough to pass under the table's body (0.51 m clear), high
        // enough to clear the boards and the seats
        assert.ok(elev > 18 && elev < 30, `${tier}: ${e.id} arrives at ${elev.toFixed(1)} degrees`);
        assert.ok(e.y + 0.79 > 4.5 && e.y + 0.79 < 5.1, `${tier}: ${e.id} is not under the perimeter truss`);
        // north and south pass under the body's long edge (0.795 m from the middle) to beyond the middle
        if (side === 'north' || side === 'south') assert.ok(0.51 / Math.tan((elev * Math.PI) / 180) > 0.8128, `${tier}: ${e.id} does not reach the middle under the table`);
      }
      assert.equal(HOUSE_KEY.west, undefined, 'the west key (no fixture) is gone');
      // the wall washers (round A4): three one-sided tubes on the perimeter truss's outer upper chord, facing the walls,
      // beyond the app camera's reach, bake-only on every tier, neutral to warm
      {
        // ROUND A5 (CONTRACT 17.1: walls and drape fall to near black): the wall washers are gone from the plan, so the
        // bake holds none (the checks below describe one, should a plan bring them back)
        const ww = b.bakeOnly.filter((q) => q.id.startsWith('house.wall.'));
        assert.deepEqual(ww.map((e) => e.id).sort(), [], `${tier}: a wall washer is left in the bake's list`);
        for (const e of ww) {
          assert.equal(e.type, 'tube', e.id);
          assert.equal(L.cameraCeil(e.x, e.z), -Infinity, `${tier}: ${e.id} is inside the camera's reach`);
          const h = e.y + 0.79;
          assert.ok(h > 5.3 && h < 5.8, `${tier}: ${e.id} hangs ${h} m up (the perimeter truss's upper chords)`);
          // one-sided, toward its wall (away from the table) and a little up: nothing of it reaches the island or the backdrop
          assert.ok(e.nx * e.x + e.nz * e.z > 0 && e.ny > -0.4 && e.ny < 0.3 && Math.abs(Math.hypot(e.nx, e.ny, e.nz) - 1) < 1e-3, `${tier}: ${e.id} normal (${e.nx}, ${e.ny}, ${e.nz})`);
          const wall = e.id.endsWith('north') ? Math.abs(A.hall.z0 - e.z) : e.id.endsWith('south') ? Math.abs(A.hall.z1 - e.z) : Math.abs(A.hall.x1 - e.x);
          assert.ok(wall > 2 && wall < 3.2, `${tier}: ${e.id} stands ${wall.toFixed(2)} m off its wall`);
          assert.ok(e.intensity > 30 && e.intensity < 120 && e.radius >= 9, `${tier}: ${e.id} level ${e.intensity}`);
        }
      }
      for (const e of [...own, ...b.bakeOnly.filter((q) => /^house\.[nse]\d$/.test(q.id))]) {
        // a house flood: a point with a flat cone at its fixture (arena/rig/plan.js floodPlan), inside the boards' line,
        // above the rig, aimed out at its block; the level is the room's (HOUSE.level)
        const sp = FLOOD_PLAN.emitters.find((q) => q.id === e.id);
        assert.ok(sp, `${tier}: ${e.id} is not a flood of the plan`);
        assert.equal(e.type, 'point', e.id);
        assert.ok(Math.abs(e.x - sp.position[0]) < 1e-9 && Math.abs(e.y - sp.position[1]) < 1e-9 && Math.abs(e.z - sp.position[2]) < 1e-9, `${tier}: ${e.id} is not at its fixture`);
        assert.ok(e.cone === sp.cone && e.bell === false && e.intensity === sp.intensity * HOUSE_A4.gain && e.intensity >= 40 && e.intensity <= 240, `${tier}: ${e.id} cone ${e.cone}, level ${e.intensity}`);
        // round A5 (CONTRACT 17.3): the house light is warm white (about 3000 K), never a red light
        assert.ok(e.g > e.r * 0.7 && e.g < e.r * 0.85 && e.b > e.r * 0.42 && e.b < e.r * 0.6, `${tier}: ${e.id} is not warm white (${e.r}, ${e.g}, ${e.b})`);
        assert.ok(Math.abs(e.x) < A.island.x1 && Math.abs(e.z) < A.island.z1 && e.y + 0.79 > A.cut.top + 1.5, `${tier}: ${e.id} does not hang over the island's rim above the rig`);
        assert.ok(e.ax * e.x + e.az * e.z > 0 && e.ay < -0.5, `${tier}: ${e.id} is not aimed out and down`);
      }
      // the shares: each owner keeps to its own (a count over its share is its owner's to fix: the message names it)
      const by = {};
      for (const e of b.emitters) { const o = ownerOfEmitter(e.id); by[o] = (by[o] ?? 0) + 1; }
      assert.ok(!by.unknown, `${tier}: emitters of no known owner: ${b.emitters.filter((e) => ownerOfEmitter(e.id) === 'unknown').map((e) => e.id).join(' ')}`);
      b.shares = by; // (the other owners' shares are the LAST arm of this file: a part over its share must not hide the arms between)
      for (const e of b.emitters) {
        assert.ok(e.x > A.hall.x0 && e.x < A.hall.x1 && e.z > A.hall.z0 && e.z < A.hall.z1 && e.y > -0.79 && e.y < -0.79 + A.hall.height, `${tier}: emitter ${e.id} is outside the hall`);
        assert.ok(e.intensity > 0 && e.radius > 0);
      }
      assert.ok(b.lightState.committed === true && b.lightState.sides === true);
      assert.equal(b.lightState.lightmap.on, false);
      assert.ok(/not in the manifest|no asset service/.test(b.state.lightmap.reason ?? ''), `${tier}: light map reason "${b.state.lightmap.reason}"`);
      assert.match(b.state.lightmap.live.sig, /^[0-9a-f]{16}$/);
    }
    assert.notEqual(built.lite.state.lightmap.live.sig, built.base.state.lightmap.live.sig, 'the lite hall has its own signature');
  });

  ok('room: a frame keeps the app parts hidden and the built-in shadow; dispose restores the app room', () => {
    for (const [tier, b] of Object.entries(built)) {
      assert.equal(b.afterFrame.shadowOwner, 'room');
      b.app.lightRefs.walls.visible = true;
      for (const fn of [...b.frameFns]) fn(1, 1 / 60);
      assert.equal(b.app.lightRefs.walls.visible, false, `${tier}: a re-shown app wall stays`);
      b.room.dispose();
      assert.ok(b.app.lightRefs.walls.visible && b.app.lightRefs.floor.visible && b.app.lightRefs.blob.visible && b.room.group.parent === null && b.frameFns.length === 0);
    }
  });

  ok('room: no scene = a stub; a failing or missing part (rig, surround, floor) leaves the hall standing', () => {
    // (parts: whatever the tree holds now; a part that is absent or fails is a status, never a throw)
    for (const [tier, b] of Object.entries(built)) {
      for (const p of ['rig', 'surround', 'floorPart']) assert.ok(['absent', 'built', 'failed', 'off', 'empty', 'late', 'building'].includes(b.state[p].status), `${tier}: ${p} status ${b.state[p].status}`);
      assert.ok('floor' in b.room.parts && 'rig' in b.room.parts, `${tier}: room.parts`);
      // a built floor part is the object of CONTRACT 14.2 and is in the room's group
      if (b.state.floorPart.status === 'built') {
        const f = b.room.parts.floor;
        assert.ok(f.group?.isObject3D && Array.isArray(f.emissives), `${tier}: the floor part's group and emissives`);
        for (const k of ['setTier', 'counts', 'state', 'signature', 'dispose']) assert.equal(typeof f[k], 'function', `${tier}: the floor part lacks ${k}()`);
      } else assert.ok(b.room.parts.floor === null || b.room.parts.floor?.enabled === false, `${tier}: no floor part, yet room.parts.floor is set`);
    }
    const line = (p) => `${p} ${built.base.state[p].status}${built.base.state[p].error ? ` (${built.base.state[p].error})` : ''}`;
    console.log(`   parts in this tree: ${['rig', 'surround', 'floorPart'].map(line).join(', ')}`);
  });

  ok('signature: the layout is hard, the parts and the levels are reported; a moved part keeps the map, another layout refuses it (CONTRACT 14.2)', () => {
    for (const [tier, b] of Object.entries(built)) {
      const s = b.sig;
      assert.match(s.sig.sig, /^[0-9a-f]{16}$/); assert.match(s.sig.soft, /^[0-9a-f]{16}$/);
      assert.deepEqual(Object.keys(s.sig.parts), ['detail', 'shell', 'rig', 'surround', 'floor', 'emitters']);
      assert.equal(s.sig.parts.detail, { lite: 0, base: 1, high: 2 }[tier]);
      for (const [k, v] of Object.entries(s.sig.parts)) if (k !== 'detail') assert.ok(typeof v === 'string' && v.length > 0 && v.length < 120, `${tier}: parts.${k} = ${JSON.stringify(v)}`);
      for (const p of ['rig', 'surround', 'floorPart']) if (b.state[p].status !== 'built') assert.equal(s.sig.parts[p === 'floorPart' ? 'floor' : p], 'none', `${tier}: an absent part's signature`);
      // the hard layer holds the layout and the charts, nothing of a part
      assert.deepEqual(Object.keys(s.sig.hard), ['v', 'venue', 'layout', 'plan', 'box', 'island', 'backdrop', 'atlas']);
      assert.equal(s.sig.hard.layout, L.ARENA_LAYOUT_VERSION); assert.equal(s.sig.hard.venue, 'arena'); assert.equal(s.sig.hard.plan, tier === 'lite' ? 'lite' : 'full');
      assert.ok(s.sig.hard.atlas.charts.length >= 2 && s.sig.hard.atlas.size > 0);
      // a bake of this very hall: on, nothing stale
      assert.equal(s.same.on, true, `${tier}: ${s.same.reason}`); assert.deepEqual(s.same.stale, []);
      assert.deepEqual(s.same.baked, s.sig.parts); assert.deepEqual(s.same.live.parts, s.sig.parts);
      // a part moved since the bake: the map stays, the room says which part
      assert.equal(s.rigMoved.on, true); assert.equal(s.rigMoved.stale.length, 1); assert.match(s.rigMoved.stale[0], /^the rig changed since the bake \(baked rig-of-another-day, now /);
      assert.equal(s.floorMoved.on, true); assert.match(s.floorMoved.stale[0], /^the floor furniture changed since the bake/);
      assert.equal(s.levels.on, true); assert.deepEqual(s.levels.stale, ['emitter levels changed since the bake (re-bake to match)']);
      assert.equal(s.noParts.on, true); assert.match(s.noParts.stale[0], /no part signatures/);
      // a bake of another detail level (the file is baked on the high tier and also lights the base tier): on, not compared
      assert.equal(s.otherDetail.on, true); assert.deepEqual(s.otherDetail.stale, []); assert.match(s.otherDetail.note, /^baked on the geometry of detail level 7, shown at /);
      assert.equal(s.same.note, null);
      // another layout: refused, the analytic light stays
      assert.equal(s.otherLayout.on, false); assert.match(s.otherLayout.reason, /^baked for another hall \(signature 0123456789abcdef/);
    }
    assert.notEqual(built.lite.sig.sig.sig, built.base.sig.sig.sig, 'the lite hall has its own layout signature (its plan)');
    assert.equal(built.base.sig.sig.sig, built.high.sig.sig.sig, 'the base and the high tier share one layout signature (one file)');
    console.log(`   parts' signatures (base): ${JSON.stringify(built.base.sig.sig.parts)}`);
  });
  // ---- 5. the bake tool's venue (web/tools/club/bake-room-node.mjs --hash --venue arena: the same hall, in its own process)
  await okAsync('bake tool: --venue arena builds this hall, the club room stays the default', async () => {
    const { spawnSync } = await import('node:child_process');
    const run = (args) => { const r = spawnSync(process.execPath, [path.join(here, 'bake-room-node.mjs'), '--hash', ...args], { encoding: 'utf8', timeout: 60000 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim().split('\n').pop()); };
    const a = run(['--venue', 'arena']);
    assert.equal(a.venue, 'arena'); assert.equal(a.tier, 'base');
    // (its signature is not this arm's: the tool builds the hall around the table and the lamp of the app, this arm around none)
    assert.match(a.sig, /^[0-9a-f]{16}$/); assert.match(a.content.shell, /^[0-9a-f]{16}$/);
    assert.ok(a.content.triangles.shell > 0 && a.content.triangles.shell <= built.base.state.shell.triangles, 'the lit hall triangles are blockers (emitter surfaces are not)');
    // round A2: the parts' signatures ride in the record, the blockers are split by part, the bake takes the third house panel
    assert.deepEqual(Object.keys(a.parts), ['detail', 'shell', 'rig', 'surround', 'floor', 'emitters']);
    assert.deepEqual(Object.keys(a.content.parts), ['rig', 'surround', 'floor']);
    for (const p of Object.values(a.content.parts)) { assert.match(p.hash, /^[0-9a-f]{16}$/); assert.ok(Number.isInteger(p.triangles)); }
    // (round A4: the six house floods, the three keys and the luminaire's band are in every bake)
    assert.ok(['house.n0', 'house.n1', 'house.s0', 'house.s1', 'house.e0', 'house.e1', `${FAR}.north`, `${FAR}.south`, `${FAR}.east`, 'lamp.band'].every((id) => a.emitterIds.includes(id)) && !a.emitterIds.some((id) => /^rig\.colour\.|^key\.west$/.test(id)), `the bake's emitters: ${a.emitterIds.join(' ')}`);
    // (round A6: the four table keys, shuttered, are in every bake)
    // (round A6b: with the table's valance on (arena/room.js UNDER) the keys are NOT baked: they light the table's body
    // through its own material; the room still hands their records: the `bakeOnly` checks above)
    const UNDER_ON = ROOM_MOD.UNDER?.on === true;
    if (TK_ON) assert.deepEqual(a.emitterIds.filter((id) => id.startsWith('key.')), UNDER_ON ? [] : ['key.ne.e', 'key.ne.n', 'key.sw.s', 'key.sw.w'], `the bake's keys: ${a.emitterIds.join(' ')}`);
    // ROUND A7 (CONTRACT 19.2: the table is an occluder in the bake; the valance rule of 18.4 is GONE): the room's rules
    // hold `skip` and nothing else, and the bake's core knows no valance. (The block below describes round A6b's rule
    // and runs only in a tree that still has it.)
    const CORE_A7 = await import(new URL('./bake-room-core.mjs', import.meta.url).href);
    const VALANCE = typeof CORE_A7.packValance === 'function' && Array.isArray(ROOM_MOD.UNDER?.match);
    if (!VALANCE) {
      assert.deepEqual(Object.keys(ROOM_MOD.UNDER), ['on', 'skip'], 'the room\'s bake rules: on, skip');
      assert.deepEqual([...ROOM_MOD.UNDER.skip], ['key.']);
      assert.equal(typeof CORE_A7.packValance, 'undefined', 'the bake\'s core packs no valance');
      assert.ok(!/valance/i.test(read('tools/club/bake-room-core.mjs')) && !/valance/i.test(read('tools/club/bake-room-scene.mjs')), 'no valance in the bake tool');
      for (const tier of ['lite', 'base', 'high']) assert.deepEqual(built[tier].room.bakeRules, { skip: ['key.'] }, `${tier}: room.bakeRules`);
    }
    if (VALANCE) {
      // the valance's law by the bake's own term: a head's light on the carpet 0.3 m outside the outline is whole, 0.1 m
      // inside it is nothing; a leg's side and the bed's plane are not touched; no club row holds a negative number 18
      const CORE_MOD = await import(new URL('./bake-room-core.mjs', import.meta.url).href);
      const F0 = -0.79, row = new Float32Array(CORE_MOD.EM_STRIDE);
      row.set([0, F0 + 2.83, 1.76, 12, 1, 1, 1, 0, 0, -1, 0, 0.3, 0, -0.997, 0.08, 4 + Math.cos((40 * Math.PI) / 180), 0.3, 0.33, 0, 0], 0);
      const at = (x, y, z, n) => CORE_MOD.emitterTerm(row, 0, x, y, z, n[0], n[1], n[2]);
      const open = [at(0.3, F0, 1.11, [0, 1, 0]), at(0.3, F0, 0.71, [0, 1, 0]), at(1.2, F0 + 0.3, 0.68, [0, 0, 1])];
      const pv = CORE_MOD.packValance({ hx: ROOM_MOD.UNDER.hx, hz: ROOM_MOD.UNDER.hz, y: F0 + ROOM_MOD.UNDER.skirt, soft: ROOM_MOD.UNDER.soft });
      assert.ok(pv[0] < 0 && pv[1] < 0 && Math.fround(pv[0]) === pv[0] && Math.fround(pv[1]) === pv[1], 'the valance packs into two negative numbers a Float32 holds');
      row[18] = pv[0]; row[19] = pv[1];
      assert.ok(open[0] > 0.05 && Math.abs(at(0.3, F0, 1.11, [0, 1, 0]) - open[0]) < 1e-9, 'the carpet 0.3 m outside the outline keeps the head');
      assert.ok(open[1] > 0.05 && at(0.3, F0, 0.71, [0, 1, 0]) === 0, 'the carpet 0.1 m inside the outline takes nothing');
      assert.ok(Math.abs(at(1.2, F0 + 0.3, 0.68, [0, 0, 1]) - open[2]) < 1e-9, 'a leg\'s side is not touched');
      assert.equal(typeof ROOM_MOD.UNDER.on, 'boolean');
    }
    assert.equal(a.emitters, a.emitterIds.length);
    assert.deepEqual(a.pool, [built.base.state.levels.poolT0, built.base.state.levels.poolT1, built.base.state.levels.poolGain]);
    const src = read('tools/club/bake-room.mjs');
    assert.ok(src.includes("file: 'arena-light.png', id: 'arena.light'") && src.includes("file: 'arena-light-lite.png', id: 'arena.light.lite'"));
    assert.ok(src.includes("full: Object.freeze({ file: 'room-light.png', id: 'room.light', variant: 'full', bake: 'size=1024' })"), 'the club targets are untouched');
    assert.ok(roomSrc.includes("export const LM_ID_ARENA = 'arena.light';") && roomSrc.includes("export const LM_ID_ARENA_LITE = 'arena.light.lite';"));
  });
  ok('room light: the arena\'s switch is off after a reset (a club room built next gets the programs it always had)', () => {
    roomLight.reset(); roomLight.init({ club: { tier: 'base', knobs: { roomDetail: 1 } } });
    const floor = roomLight.material({ name: 'x.floor', tableShadow: true, lightmap: 'spec', hide: true });
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    floor.onBeforeCompile(sh);
    assert.ok(!floor.customProgramCacheKey().includes('|tb') && !sh.fragmentShader.includes('clubRoomTableBlock') && !('uRoomTableBlock' in sh.uniforms));
    assert.equal(roomLight.setTableBlock({ strength: 0 }), built.base ? true : false, 'the block uniforms exist once an arena floor was made');
    roomLight.reset(); roomLight.init({ club: { tier: 'base', knobs: { roomDetail: 1 } }, tableBlock: true });
    const carpet = roomLight.material({ name: 'x.carpet', tableShadow: true }), wall = roomLight.material({ name: 'x.wall' });
    const sh2 = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    carpet.onBeforeCompile(sh2);
    assert.ok(carpet.customProgramCacheKey().endsWith('|tb') && sh2.fragmentShader.includes('roomLight.color *= clubRoomTableBlock( vRoomWP, q, eN.w );') && 'uRoomTableBlock' in sh2.uniforms);
    assert.ok(!wall.customProgramCacheKey().includes('|tb'));
    // round A3: the cone for point emitters is a second switch of the same kind. Off (the club room, and the two materials
    // above): the lobe's line is the one it always had, no key suffix, and an emitter's `cone` is not even recorded. On:
    // every material's program carries the cone branch and the suffix, and the emitter's axis vector packs the cone.
    const LOBE = '      emit *= ( 1.0 - eA.w ) + eA.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );\n';
    assert.ok(sh.fragmentShader.includes(LOBE) && sh2.fragmentShader.includes(LOBE) && !sh.fragmentShader.includes('coneC') && !sh2.fragmentShader.includes('coneC'));
    assert.ok(!floor.customProgramCacheKey().includes('cone') && !carpet.customProgramCacheKey().includes('cone'));
    const plain = roomLight.addEmitter({ id: 'x.spot', type: 'point', position: new THREE.Vector3(0, 3, 0), axis: new THREE.Vector3(0, -1, 0), size: [0.1, 1], intensity: 10, radius: 12, cone: 30, bell: true });
    assert.ok(!('cone' in plain) && roomLight.uniforms.uRoomEmA.value[0].w === 1, 'without the switch a cone is ignored: the shaded lamp\'s beam share');
    const offAxis = roomLight.irradianceAt([3, 0, 0], [0, 1, 0], { baked: false })[0];
    roomLight.reset(); roomLight.init({ club: { tier: 'base', knobs: { roomDetail: 1 } }, tableBlock: true, cone: true });
    const carpetC = roomLight.material({ name: 'x.carpet', tableShadow: true }), wallC = roomLight.material({ name: 'x.wall' });
    const shC = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    const shWC = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    carpetC.onBeforeCompile(shC); wallC.onBeforeCompile(shWC);
    assert.ok(carpetC.customProgramCacheKey().endsWith('|tb|cone') && wallC.customProgramCacheKey().endsWith('|cone'));
    for (const s of [shC, shWC]) assert.ok(s.fragmentShader.includes('float coneC = eA.w > 3.5 ? eA.w - 4.0 : eA.w - 2.0;') && s.fragmentShader.includes('} else emit *= ( 1.0 - eA.w ) + eA.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );'), 'the cone branch');
    assert.ok(shC.fragmentShader.includes('roomLight.color *= clubRoomTableBlock( vRoomWP, q, eN.w );'), 'the table block stays on the carpet');
    const spot = roomLight.addEmitter({ id: 'x.spot', type: 'point', position: new THREE.Vector3(0, 3, 0), axis: new THREE.Vector3(0, -1, 0), size: [0.1, 1], intensity: 10, radius: 12, cone: 30, bell: true });
    assert.ok(spot.cone === 30 && spot.bell === true && Math.abs(roomLight.uniforms.uRoomEmA.value[0].w - (4 + Math.cos(Math.PI / 6))) < 1e-6);
    // the law on the CPU (what the table's body and the bake read): candela / d^2 on the axis, nothing outside the field angle
    const at = (x) => roomLight.irradianceAt([x, 0, 0], [0, 1, 0], { baked: false })[0] - roomLight.irradianceAt([50, 0, 50], [0, 1, 0], { baked: false })[0];
    assert.ok(Math.abs(at(0) - (10 / (9 + 0.01)) * (1 - (3 / 12) ** 4) ** 2) < 1e-3, `on the axis: ${at(0)}`);
    assert.ok(at(3 * Math.tan((31 * Math.PI) / 180)) === 0 && at(3 * Math.tan((20 * Math.PI) / 180)) > 0 && at(3 * Math.tan((20 * Math.PI) / 180)) < at(0.5), 'the field angle ends the light; a wash falls from the axis');
    assert.ok(offAxis > 0.05, 'the shaded lamp\'s lobe (no cone) still lights 45 degrees off its axis');
    roomLight.addEmitter({ id: 'x.spot', type: 'point', position: new THREE.Vector3(0, 3, 0), axis: new THREE.Vector3(0, -1, 0), size: [0.1, 1], intensity: 10, radius: 12, cone: 30 });
    assert.ok(Math.abs(roomLight.uniforms.uRoomEmA.value[0].w - (2 + Math.cos(Math.PI / 6))) < 1e-6 && Math.abs(at(3 * Math.tan((15 * Math.PI) / 180)) - (10 / (9 + 0.01 + 9 * Math.tan((15 * Math.PI) / 180) ** 2)) * Math.cos((15 * Math.PI) / 180) * (1 - ((9 + 9 * Math.tan((15 * Math.PI) / 180) ** 2) / 144) ** 2) ** 2) < 2e-3, 'a profile light is whole inside its beam');
    // round A2: on that carpet (and nowhere else) the baked light of a map that saw the table is final: it leaves as
    // radiance of its own, by the share the room sets (`baked`); the club floor's line is the one it always had
    const FINAL = 'totalEmissiveRadiance += roomBaked * ( roomAO * roomAmb * uRoomTableBlock.w ) * BRDF_Lambert( material.diffuseColor );';
    assert.ok(sh2.fragmentShader.includes(FINAL) && sh2.fragmentShader.includes('irradiance += roomBaked * ( roomAO * roomAmb * ( 1.0 - uRoomTableBlock.w ) );'));
    assert.ok(!sh2.fragmentShader.includes('irradiance += roomBaked * ( roomAO * roomAmb );'));
    assert.ok(!sh.fragmentShader.includes('totalEmissiveRadiance += roomBaked') && sh.fragmentShader.includes('irradiance += roomBaked * ( roomAO * roomAmb );'), 'the club floor keeps its line');
    const shW = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    wall.onBeforeCompile(shW);
    assert.ok(!shW.fragmentShader.includes('totalEmissiveRadiance += roomBaked'), 'only the floor');
    assert.equal(sh2.uniforms.uRoomTableBlock.value.w, 0, 'no bake: nothing is final');
    roomLight.setTableBlock({ strength: 0.5, soft: 0.2, baked: 1 }); assert.equal(sh2.uniforms.uRoomTableBlock.value.w, 1);
    roomLight.setTableBlock({ strength: 0.5, soft: 0.2 }); assert.equal(sh2.uniforms.uRoomTableBlock.value.w, 1, 'a call without `baked` keeps it');
    roomLight.setTableBlock({ baked: 0 });
    roomLight.reset();
  });
  // ROUND A5: the hall's seat. A table whose levelers stand a few millimetres over the app's floor (the default pool table:
  // 21.9 mm) is stood ON the carpet: the hall rises by the gap; no leveler, a gap out of range or the tool's switch: it
  // sits on the app's floor as it always did.
  await okAsync('seat: the hall rises to the table\'s soles when they stand 2 to 50 mm over the app\'s floor; never otherwise (round A5)', async () => {
    const build = async (sole, query = '') => {
      const scene = new THREE.Scene();
      const app = makeApp(); scene.add(app.group);
      const table = new THREE.Group();
      if (sole !== null) {
        const g = new THREE.BoxGeometry(0.1262, 0.005, 0.1262);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); m.name = 'dm-leveler-fl'; m.position.set(1.2037, sole + 0.0025, 0.5687); table.add(m);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.8956, 0.0762, 1.6256), new THREE.MeshBasicMaterial()); rail.position.y = 0.0181; table.add(rail);
      }
      scene.add(table); scene.updateMatrixWorld(true);
      const fns = [];
      const club = { enabled: true, tier: 'base', knobs: TIERS.base, venue: 'arena', ctx: { scene, room: app, table: { group: table }, query: new URLSearchParams(query), rebakeEnv() {} },
        onFrame(fn) { fns.push(fn); }, offFrame() {} };
      const room = await createRoom(club);
      assert.equal(room.enabled, true, room.reason);
      for (const fn of fns) fn(0, 1 / 60);
      const s = room.state();
      const out = { floorY: room.floorY, lift: s.seat.lift, off: s.seat.off, groupY: room.group.position.y, boxMin: room.box.min.y };
      room.dispose();
      return out;
    };
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    // (the parts' node stand-in notes are not this arm's subject: the stub canvas has no gradients)
    const warn0 = console.warn; console.warn = () => {};
    try {
    const a = await build(-0.7681);
    assert.ok(near(a.floorY, -0.7681) && near(a.groupY, 0.0219) && near(a.boxMin, -0.7681) && a.lift === 0.022, `soles 21.9 mm over the floor: ${JSON.stringify(a)}`);
    const b = await build(null);
    assert.ok(near(b.floorY, -0.79) && b.groupY === 0 && b.lift === 0, `no leveler: ${JSON.stringify(b)}`);
    const c = await build(-0.79);
    assert.ok(near(c.floorY, -0.79) && c.groupY === 0, `soles on the floor: ${JSON.stringify(c)}`);
    const d = await build(-0.70);
    assert.ok(near(d.floorY, -0.79) && d.groupY === 0, `a gap of 90 mm is not a seat: ${JSON.stringify(d)}`);
    const e = await build(-0.7681, 'arenaseat=0');
    assert.ok(near(e.floorY, -0.79) && e.groupY === 0 && e.off === true, `the tool's switch: ${JSON.stringify(e)}`);
    } finally { console.warn = warn0; }
    roomLight.reset();
  });
  await okAsync('room: createRoom without a scene returns a stub', async () => {
    const r = await createRoom({ ctx: {} });
    assert.equal(r.enabled, false); assert.equal(r.reason, 'no scene');
  });
  // (the real occlusion service and the real adoption registry on a renderer with no GL: every bake pass is a call that does
  // nothing, throws, or leaves a program that did not link in the renderer's list. Built after the arms above: the room
  // light is one object and this arm's rooms reset it; the arm leaves it reset.)
  await okAsync('room: the carpet\'s built-in table shadow goes to the occlusion service only for a bake that succeeded — a bake step that threw, or a bake shader that did not link, leaves it on; a later good bake takes over; a later failed one gives it back', async () => {
    const { createOcclusion } = await import('../../scene/club/occlusion.js');
    const { createAdopt } = await import('../../scene/club/adopt.js');
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const UNLINKED = [{ name: 'club-occ-bake', diagnostics: { runnable: false } }];
    const rig = async (fail) => {
      let target = null;
      const renderer = { isWebGLRenderer: true, capabilities: { isWebGL2: true }, autoClear: true, xr: { enabled: false }, fail, info: { programs: fail === 'shader' ? UNLINKED : [] },
        setRenderTarget(t) { target = t ?? null; }, getRenderTarget: () => target, getClearColor: (c) => c, getClearAlpha: () => 1, setClearColor() {}, clear() {},
        render() { if (renderer.fail === 'throw') throw new Error('the context was lost'); } };
      const scene = new THREE.Scene(), app = makeApp(), frameFns = [];
      const lamp = new THREE.RectAreaLight(0xffffff, 10, 2.04, 0.66); lamp.position.set(0, 1.02, 0); lamp.rotation.x = -Math.PI / 2; app.group.add(lamp); app.lightRefs.rectLights.push(lamp);
      const table = new THREE.Group(); table.name = 'obTable';
      const body = new THREE.Mesh(new THREE.BoxGeometry(TABLE.x1 - TABLE.x0, 0.85, TABLE.z1 - TABLE.z0), new THREE.MeshStandardMaterial()); body.position.y = -0.37; table.add(body);
      scene.add(app.group, table);
      const club = { enabled: true, tier: 'base', knobs: TIERS.base, venue: 'arena', shown: true, onFrame(fn) { frameFns.push(fn); }, offFrame(fn) { const i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); },
        ctx: { scene, renderer, room: app, table: { group: table }, query: new URLSearchParams(''), rebakeEnv() {},
          gi: { uniforms: { uLightPos: { value: new THREE.Vector3(0, 1.02, 0) }, uLightHalf: { value: new THREE.Vector2(1.02, 0.33) }, uLightCount: { value: 1 } } } } };
      club.adopt = createAdopt(club);
      club.room = await createRoom(club);
      assert.equal(club.room.enabled, true, club.room.reason);
      club.occ = await createOcclusion(club);
      assert.equal(club.occ.enabled, true, club.occ.reason);
      const frame = async () => { for (const fn of [...frameFns]) fn(0, 1 / 60); await tick(); };
      // one bake to its end (or to its failure), then two frames: the hand-over is decided after the first
      const bake = async (how) => { renderer.fail = how; renderer.info.programs = how === 'shader' ? UNLINKED : []; if (club.occ.state().baking !== true) assert.equal(club.occ.rebuild('arm', { force: true }), true); club.occ.flush(); await tick(); await frame(); await frame(); };
      const read = () => { const s = club.room.state(), o = club.occ.state(); return { owner: s.shadowOwner, builtin: s.builtinShadow, value: club.room.floor.builtinShadow.value, open: club.occ.floor.texture.name === 'club-occ-open', floorK: club.occ.floor.uniforms.uClubFloorK.value.w, errors: o.errors }; };
      await frame();
      const first = read();
      assert.ok(first.owner === 'occ-pending' && first.builtin === 1 && club.room.floor.material.userData.clubKeys.some((k) => /^occ/.test(k)), 'the carpet is patched and the hand-over waits for the bake');
      return { club, bake, read, dispose: () => club.room.dispose() };
    };
    const bad = [];
    const want = (tag, r, owner, builtin) => { if (r.owner !== owner || r.builtin !== builtin || r.value !== builtin) bad.push(`${tag}: owner '${r.owner}', built-in shadow ${r.builtin} (wanted '${owner}', ${builtin}); the service's floor map is ${r.open ? 'the open 1 x 1 map' : 'a baked map'} at strength ${r.floorK}, errors ${JSON.stringify(r.errors)}`); };
    const warn = console.warn; console.warn = () => {};
    try {
      // the boot as it is today: a bake that succeeds takes the shadow
      let r = await rig(null); await r.bake(null);
      let s = r.read(); assert.ok(!s.open && s.floorK > 0 && s.errors.length === 0, 'a good bake: the service holds a floor map');
      want('a good boot', s, 'occ', 0);
      // ... and a later bake whose shader does not link drops the map: the built-in shadow comes back
      await r.bake('shader'); s = r.read(); assert.ok(s.open && s.floorK === 0 && /bake shader failed/.test(s.errors.join()), 'the service is open again');
      want('a good boot, then a bake whose shader did not link', s, 'room', 1);
      r.dispose();
      // a boot whose bake step throws: the service is open (no floor map), the built-in shadow stays
      r = await rig('throw'); await r.bake('throw'); s = r.read();
      assert.ok(s.open && s.floorK === 0 && /^bake: the context was lost/.test(s.errors[0]), 'a thrown step: the service holds no floor map');
      want('a boot whose bake step threw', s, 'room', 1);
      // ... and a later bake that succeeds takes over (the two never stack)
      await r.bake(null); s = r.read(); assert.ok(!s.open && s.floorK > 0);
      want('a thrown step, then a good bake', s, 'occ', 0);
      r.dispose();
      // a boot whose bake shader did not link
      r = await rig('shader'); await r.bake('shader'); s = r.read();
      assert.ok(s.open && s.floorK === 0 && /bake shader failed: club-occ-bake/.test(s.errors.join()), 'an unlinked shader: the service shows its open map');
      want('a boot whose bake shader did not link', s, 'room', 1);
      r.dispose();
    } finally { console.warn = warn; roomLight.reset(); }
    assert.deepEqual(bad, [], `the floor shadow's hand-over:\n  ${bad.join('\n  ')}`);
  });
  if (!hadDocument) delete globalThis.document;

  // ---- (round A5) the ambient rows: the bake's side row and the analytic arm's own
  ok('ambient (round A5): the side row is under round A4\'s; the analytic arm has its own, lower side row, which the room shows while no map is on and the bake never takes', () => {
    const Lt = L.LIGHT;
    // (round A6, CONTRACT 18.1: 0.34 -> 0.20: the backdrop's top third; an open vertical face then holds 0.375 units)
    assert.ok(Lt.ambientSide[0] >= 0.08 && Lt.ambientSide[0] <= 0.45, `the side row ${Lt.ambientSide[0]} (the drape's upper half: CONTRACT 17.2)`);
    assert.ok(Array.isArray(Lt.ambientSideAnalytic) && Lt.ambientSideAnalytic.length === 3, 'the analytic side row exists');
    for (let k = 0; k < 3; k++) assert.ok(Lt.ambientSideAnalytic[k] > 0.05 && Lt.ambientSideAnalytic[k] < Lt.ambientSide[k], 'the analytic side row is under the baked one (no row-on-row shading in the analytic frame)');
    for (const [tier, b] of Object.entries(built)) {
      // what the bake reads (bake-room-scene.mjs: the state's levels) is the layout's row, not the analytic one
      assert.deepEqual(Array.from(b.state.levels.ambientSide), Array.from(Lt.ambientSide), `${tier}: the levels' side row is the bake's`);
    }
    const src = fs.readFileSync(path.join(here, '../../scene/club/arena/room.js'), 'utf8');
    assert.ok(src.includes('ambient: [levels.ambientSky, levels.ambientGround, levels.ambientSide]'), 'the signature\'s soft part holds the baked rows');
    assert.ok(!/ambient: \[[^\]]*ambientSideAnalytic/.test(src), 'the analytic row is not in the signature');
  });

  // ---- 6. the emitter shares of CONTRACT 14.2, by owner (last: an owner over its share fails here, after everything else ran)
  ok('shares: every owner keeps to its emitter share (bake 6, shell 4, rig 8, surround 6, floor 0); 24 in all; lite 12, never a 13th registered', () => {
    const over = [];
    for (const [tier, b] of Object.entries(built)) {
      const ids = (o) => b.emitters.filter((e) => ownerOfEmitter(e.id) === o).map((e) => e.id).join(' ');
      if (tier === 'lite') {
        if (b.emitters.length > 12) over.push(`lite: ${b.emitters.length} emitters registered, 12 are evaluated (${JSON.stringify(b.shares)})`);
        // round A4: the lite tier's twelve are the eight heads, the backdrop's wash and three house floods; everything else
        // goes to the bake's list AT THE DOOR (arena/room.js lightForParts), so the room light never holds a 13th and
        // never warns (round A3 registered 18 and withdrew six: one warning per load)
        const kept = /^(rig\.head\.|hall\.wash\.|house\.(n0|n1|e0)$)/;
        for (const e of b.emitters) if (!kept.test(e.id)) over.push(`lite: ${e.id} is registered at run time (the room keeps the heads, the wash and three house floods only)`);
        for (const id of b.state.emitterShare.liteDropped) { if (kept.test(id)) over.push(`lite: ${id} was dropped`); if (!b.bakeOnly.some((e) => e.id === id)) over.push(`lite: ${id} was dropped and is not in the bake's list`); }
        if (b.emitters.length !== 12) over.push(`lite: ${b.emitters.length} emitters at run time, the twelve are ${b.emitters.map((e) => e.id).join(' ')}`);
        if (warned.some((w) => /emitters registered/.test(w))) over.push(`a room-light overflow warning was raised: ${warned.filter((w) => /emitters registered/.test(w)).join(' | ')}`);
        continue;
      }
      assert.deepEqual(b.state.emitterShare.liteDropped, [], `${tier}: an emitter was withdrawn on a tier that is not lite`);
      for (const [o, k] of Object.entries(b.shares)) if (k > A.emitters[o]) over.push(`${tier}: ${o} registers ${k} emitters, its share is ${A.emitters[o]}: ${ids(o)}`);
      if (b.emitters.length > 24) over.push(`${tier}: ${b.emitters.length} emitters registered, the room light evaluates 24 (the weakest are dropped)`);
    }
    assert.deepEqual(over, [], `emitter shares (CONTRACT 14.2):\n  ${over.join('\n  ')}`);
  });
}

console.log(`test-club-arena: ${n} arms OK`);
