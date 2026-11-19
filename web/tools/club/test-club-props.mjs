// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-props.mjs — node arm for the pure logic of the club props: the placement plan (room/props/layout.js: the bar, the
// far table, the wall slots, and the strict reading of the shell's reserved wall spans, CONTRACT.md 8.6) and the built-in
// stroke font (room/props/strokefont.js) that replaces canvas text. Run: node web/tools/club/test-club-props.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  planRoom, hangAt, floorAt, reservedConflicts, freeStretches, blocksView, wallFrame, WALLS, VIEWS, FAR,
} from '../../scene/club/room/props/layout.js';
import { GLYPHS, GAP, covers, textWidth, layoutText, drawText } from '../../scene/club/room/props/strokefont.js';
import { EMIT, GLASS, SHELF_GLOW, SHELF_POOLS, shelfPool, BOTTLES, EMIT_COLORS, FAR as FAR_LEVELS, FAR_BODY, FAR_POOL, FAR_SHADE, FAR_BALLS, FAR_BED, GLASS_EDGE, R2, linearOf, glassFacing, glassRim } from '../../scene/club/room/props/levels.js';
import { CLUB_TUNE, toneMap } from '../../scene/club/post/tune.js';
import { gradeColor } from '../../scene/club/post/gradelut.js';
import { DOF_DEFAULTS, smoothstep } from '../../scene/club/post/focus.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- the app's club room as round 1b builds it (room.js: the shell's box, the table's keep-out, and what the shell reserves:
// the door, the two windows, and every wall lamp at 0.25 m to each side) ----
const LAMPS = [ // shell.js lampSpots: on the seams of the 2 m bays, clear of the windows, the door and the bar's stretch of wall
  { wall: 'zn', at: -3.06 }, { wall: 'zn', at: 3.06 }, { wall: 'xp', at: -5.2 },
  { wall: 'zp', at: -3.06 }, { wall: 'zp', at: 3.06 }, { wall: 'zp', at: -1.02 }, { wall: 'zp', at: 1.02 },
  { wall: 'xn', at: 1.0 }, { wall: 'xn', at: -3.4 },
];
const APP = {
  box: { min: { x: -5.5, y: -0.79, z: -6 }, max: { x: 5.5, y: 2.45, z: 3.6 } },
  floorY: -0.79,
  tableBounds: { minX: -2.9978, maxX: 2.9978, minZ: -2.3628, maxZ: 2.3628 },
  // door on the east wall (centre z = 2.66, 0.92 wide), windows on the north wall (centres x = -1.95 and 1.95, 1.25 wide), +0.13
  reserved: [
    { wall: 'xp', from: 2.07, to: 3.25, floor: true, kind: 'door' },
    { wall: 'zn', from: -2.705, to: -1.195, kind: 'window' }, { wall: 'zn', from: 1.195, to: 2.705, kind: 'window' },
    ...LAMPS.map((l) => ({ wall: l.wall, from: l.at - 0.25, to: l.at + 0.25, kind: 'lamp' })),
  ],
  lamps: LAMPS,
};
const overlap = (a0, a1, b0, b1, eps = 1e-9) => a0 < b1 - eps && a1 > b0 + eps;
const wallRange = (wall, box) => (wall === 'xp' || wall === 'xn' ? [box.min.z, box.max.z] : [box.min.x, box.max.x]);

// what props.js does with a plan, without the geometry: every recipe's hung things and floor props through hangAt / floorAt
const HANG = { // recipe -> [[x, half-width], ...] hung, [[x, half-width, tall], ...] on the floor
  seats: [[], [[0, 0.84, false]]],
  seatNeonA: [[['toward', 0.71]], [[0, 0.84, false]]],
  seatNeonB: [[['toward', 0.58]], [[0, 0.84, false]]],
  neonB: [[['toward', 0.58]], [[0.75, 0.26, true]]],
  rackChalk: [[[-0.52, 0.4], [0.42, 0.505]], []],
  seatFrames: [[[-0.52, 0.2], [0, 0.19], [0.52, 0.2]], [[0, 0.84, false]]],
  plantFrame: [[[-0.25, 0.3]], [[0.55, 0.26, true]]],
  rackFrame: [[[-0.45, 0.4], [0.5, 0.22]], []],
  frames: [[[-0.38, 0.24], [0.38, 0.24]], []],
  benchFrames: [[[-0.42, 0.2], [0.42, 0.2]], [[0, 0.645, false]]],
  clockStand: [[[-0.2, 0.21]], [[0.55, 0.26, true]]],
  plaque: [[[0, 0.49]], [[0.8, 0.26, true]]],
};
function furnish(plan) {
  const floor = [], hung = [];
  for (const s of plan.slots) {
    const [hangs, floors] = HANG[s.recipe] ?? [[], []];
    const sign = WALLS[s.wall].ux + WALLS[s.wall].uz;
    for (const [x0, hw] of hangs) {
      const x = x0 === 'toward' ? (s.toward ? s.toward * Math.max(0, s.width / 2 - hw - 0.08) : 0) : x0;
      const lx = hangAt(plan, s, x, hw);
      if (lx !== null) hung.push({ wall: s.wall, from: s.s + sign * lx - hw, to: s.s + sign * lx + hw, recipe: s.recipe });
    }
    for (const [x, hw, tall] of floors) {
      if (!s.clear) continue;
      const lx = floorAt(plan, s, x, hw, tall);
      if (lx !== null) floor.push({ wall: s.wall, from: s.s + sign * lx - hw, to: s.s + sign * lx + hw, what: s.recipe, tall });
    }
  }
  return { floor, hung };
}

ok('free stretches: reserved spans cut the wall, margins widen them, order and bounds are kept', () => {
  const R = [{ wall: 'zn', from: 1, to: 2 }, { wall: 'zn', from: 4, to: 5 }, { wall: 'xp', from: 0, to: 9 }];
  assert.deepEqual(freeStretches('zn', 0, 6, R), [{ from: 0, to: 1 }, { from: 2, to: 4 }, { from: 5, to: 6 }]);
  assert.deepEqual(freeStretches('zn', 0, 6, R, () => 0.5), [{ from: 0, to: 0.5 }, { from: 2.5, to: 3.5 }, { from: 5.5, to: 6 }]);
  assert.deepEqual(freeStretches('zn', 1.2, 1.8, R), []);
  assert.deepEqual(freeStretches('zp', 0, 6, R), [{ from: 0, to: 6 }]);
  assert.deepEqual(freeStretches('zn', 0, 6, [{ wall: 'zn', from: 2, to: 1 }]), [{ from: 0, to: 1 }, { from: 2, to: 6 }], 'a reversed span');
});

ok('app room: the bar is full length, as near the table axis as the door allows; the far table stands beside the main one; no notes', () => {
  const plan = planRoom({ ...APP, farTable: true });
  assert.ok(plan.bar, 'a bar');
  assert.ok(Math.abs(plan.bar.from - -2.6) < 1e-9 && Math.abs(plan.bar.to - 1.72) < 1e-9, `bar ${plan.bar.from}..${plan.bar.to} (0.35 m short of the door)`);
  assert.deepEqual(planRoom({ ...APP, reserved: APP.reserved.filter((r) => r.wall !== 'xp') }).bar.from, -2.16, 'without the door: centred on z = 0');
  assert.ok(Math.abs(plan.bar.len - 4.32) < 1e-9, `length ${plan.bar.len}`);
  assert.equal(plan.bar.cfg.stools, true);
  assert.equal(plan.farOn, 'zn');
  assert.ok(Math.abs(plan.far.x - 1.2) < 1e-9 && Math.abs(plan.far.z - -3.6478) < 0.03, `far table at ${plan.far.x}, ${plan.far.z}`);
  assert.deepEqual(plan.notes, []);
});

ok('app room: nothing of the props touches a reserved span or covers a wall lamp (bar, hung, floor); hung things do not overlap', () => {
  const plan = planRoom({ ...APP, farTable: true });
  const { floor, hung } = furnish(plan);
  assert.deepEqual(reservedConflicts(plan, floor), []);
  for (const h of hung) for (const l of APP.lamps) if (l.wall === h.wall) assert.ok(!(l.at > h.from - 0.2 && l.at < h.to + 0.2), `${h.recipe} over the lamp at ${l.at} on ${h.wall}`);
  for (const f of floor) if (f.tall) for (const l of APP.lamps) if (l.wall === f.wall) assert.ok(!(l.at > f.from && l.at < f.to), `a tall prop under the lamp at ${l.at}`);
  for (const wall of Object.keys(plan.hung)) {
    const list = plan.hung[wall].slice().sort((a, b) => a.from - b.from);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].from >= list[i - 1].to + 0.05, `hung things overlap on ${wall}`);
  }
  // the signs, the rack and the full-size chalkboard all found a place
  const recipes = hung.map((h) => h.recipe);
  assert.ok(recipes.includes('seatNeonA') && recipes.includes('seatNeonB'), 'both lit signs hang');
  assert.equal(recipes.filter((r) => r === 'rackChalk').length, 2, 'the cue rack and the chalkboard hang');
  // every bay of the walls keeps some furniture: strict does not mean empty
  assert.ok(floor.length >= 8, `${floor.length} floor groups`);
  // under the two windows nothing stands and nothing hangs
  for (const w of APP.reserved.filter((r) => r.wall === 'zn')) {
    for (const f of floor) assert.ok(!(f.wall === 'zn' && overlap(f.from, f.to, w.from, w.to)), 'floor prop under a window');
  }
});

ok('strict: a lamp on the bar\'s stretch of wall shortens the bar or leaves the room without one; a lamp in the middle of a bay leaves it pictures only', () => {
  // the round-1 lamp plan had lamps at z = -4.6, -1.8 and 1.0 on the foot wall, 2.8 m apart, inside the bar's stretch
  const old = [-4.6, -1.8, 1.0];
  const base = APP.reserved.filter((r) => !(r.wall === 'xp' && r.kind === 'lamp'));
  const spans = (half) => old.map((at) => ({ wall: 'xp', from: at - half, to: at + half, kind: 'lamp' }));
  const plan = planRoom({ ...APP, reserved: [...base, ...spans(0.15)], farTable: true });
  assert.deepEqual(reservedConflicts(plan, furnish(plan).floor), []);
  assert.ok(plan.bar, 'still a bar');
  assert.ok(plan.bar.len >= 2.2 && plan.bar.len < 2.5, `a short bar between two lamps: ${plan.bar.len.toFixed(2)} m`);
  assert.ok(plan.notes.some((t) => /the bar is/.test(t)), 'and the plan says so');
  // reserved 0.5 m wide each (what room.js hands today), those lamps leave no 2.2 m of wall: no bar, said plainly
  const wide = planRoom({ ...APP, reserved: [...base, ...spans(0.25)], farTable: true });
  assert.equal(wide.bar, null, 'lamps reserved at 0.5 m on the bar wall: no bar');
  assert.ok(wide.notes.some((t) => /no bar/.test(t)));
  assert.deepEqual(reservedConflicts(wide, furnish(wide).floor), []);
  // a lamp in the middle of the wall between the two windows leaves 0.73 m to each side: that bay gets pictures only, the
  // rack and the board go to a bay that holds them, and a hung thing asked for across the lamp is refused
  const mid = { ...APP, reserved: [...APP.reserved, { wall: 'zn', from: -0.25, to: 0.25, kind: 'lamp' }], lamps: [...LAMPS, { wall: 'zn', at: 0 }] };
  const p2 = planRoom({ ...mid, farTable: true });
  const centre = p2.slots.find((q) => q.wall === 'zn' && Math.abs(q.s) < 1e-9);
  assert.equal(centre.recipe, 'frames');
  assert.ok(Math.abs((centre.free.to - centre.free.from) - 0.73) < 1e-9, 'the widest free stretch of that bay');
  assert.equal(hangAt(p2, centre, 0, 0.5), null, 'a 1 m board across the lamp');
  assert.notEqual(hangAt(p2, centre, 0.5, 0.2), null, 'a small picture beside it');
  assert.deepEqual(reservedConflicts(p2, furnish(p2).floor), []);
});

ok('a door in the bar\'s place: the bar slides to the free stretch beside it', () => {
  const plan = planRoom({ ...APP, reserved: [{ wall: 'xp', from: -0.5, to: 0.5, floor: true }], farTable: true });
  assert.ok(plan.bar);
  assert.ok(plan.bar.to <= -0.5 - 0.35 + 1e-9 || plan.bar.from >= 0.5 + 0.35 - 1e-9, `bar ${plan.bar.from.toFixed(2)}..${plan.bar.to.toFixed(2)}`);
  assert.deepEqual(reservedConflicts(plan, furnish(plan).floor), []);
});

ok('random rooms and random reserved spans: strict everywhere, everything inside the room, the keep-out stays free', () => {
  const R = rng(4242);
  let bars = 0, fars = 0, hungCount = 0, floorCount = 0;
  for (let k = 0; k < 400; k++) {
    const LX = 7.5 + R() * 6.5, LZ = 6 + R() * 5;
    const ox = (R() - 0.5) * 1.2, oz = (R() - 0.5) * 2.4;
    const box = { min: { x: ox - LX / 2, y: -0.79, z: oz - LZ / 2 }, max: { x: ox + LX / 2, y: 2.45, z: oz + LZ / 2 } };
    const tableBounds = { minX: -2.9978, maxX: 2.9978, minZ: -2.3628, maxZ: 2.3628 };
    const reserved = [], lamps = [];
    for (const wall of ['xp', 'xn', 'zp', 'zn']) {
      const [a, b] = wallRange(wall, box);
      const m = Math.floor(R() * 4);
      for (let i = 0; i < m; i++) { const w = 0.4 + R() * 1.2, c = a + 0.6 + R() * (b - a - 1.2); reserved.push({ wall, from: c - w / 2, to: c + w / 2, ...(R() < 0.3 ? { floor: true } : {}) }); }
      const l = Math.floor(R() * 4);
      for (let i = 0; i < l; i++) lamps.push({ wall, at: a + 0.6 + R() * (b - a - 1.2) });
    }
    const plan = planRoom({ box, floorY: -0.79, tableBounds, farTable: R() < 0.8, reserved, lamps });
    const { floor, hung } = furnish(plan);
    assert.deepEqual(reservedConflicts(plan, floor), [], `room ${k}`);
    if (plan.bar) {
      bars += 1;
      assert.ok(plan.bar.from >= box.min.z - 1e-9 && plan.bar.to <= box.max.z + 1e-9 && plan.bar.len >= 2.2 - 1e-9, `room ${k}: bar inside the wall`);
      assert.ok(box.max.x - plan.bar.cfg.total >= tableBounds.maxX - 0.45, `room ${k}: the bar leaves the stroke room`);
    }
    if (plan.far) {
      fars += 1;
      const hx = (plan.far.ry ? FAR.width : FAR.length) / 2, hz = (plan.far.ry ? FAR.length : FAR.width) / 2;
      assert.ok(plan.far.x - hx >= box.min.x && plan.far.x + hx <= box.max.x && plan.far.z - hz >= box.min.z && plan.far.z + hz <= box.max.z, `room ${k}: far table inside`);
      const out = plan.far.x - hx >= tableBounds.maxX - 1e-9 || plan.far.x + hx <= tableBounds.minX + 1e-9 || plan.far.z - hz >= tableBounds.maxZ - 1e-9 || plan.far.z + hz <= tableBounds.minZ + 1e-9;
      assert.ok(out, `room ${k}: far table outside the keep-out`);
    }
    for (const s of plan.slots) {
      const [a, b] = wallRange(s.wall, box);
      assert.ok(s.lo >= a - 1e-9 && s.hi <= b + 1e-9, `room ${k}: slot inside its wall`);
      assert.ok(!reserved.some((r) => r.wall === s.wall && r.floor === true && overlap(r.from, r.to, s.lo + 0.1, s.hi - 0.1)), `room ${k}: a slot at a door`);
      if (s.wall === 'xp' && plan.bar && plan.farOn !== 'xp') assert.ok(!overlap(s.lo, s.hi, plan.bar.from, plan.bar.to), `room ${k}: slot behind the bar`);
    }
    for (const h of hung) {
      const [a, b] = wallRange(h.wall, box);
      assert.ok(h.from >= a - 0.3 && h.to <= b + 0.3, `room ${k}: hung thing on its wall`);
      for (const l of lamps) if (l.wall === h.wall) assert.ok(!(l.at > h.from - 0.2 && l.at < h.to + 0.2), `room ${k}: hung over a lamp`);
      if (h.wall === 'xp' && plan.bar) assert.ok(!overlap(h.from, h.to, plan.bar.from, plan.bar.to), `room ${k}: hung behind the bar`);
    }
    for (const wall of Object.keys(plan.hung)) {
      const list = plan.hung[wall].slice().sort((p, q) => p.from - q.from);
      for (let i = 1; i < list.length; i++) assert.ok(list[i].from >= list[i - 1].to + 0.05, `room ${k}: hung things overlap`);
    }
    hungCount += hung.length; floorCount += floor.length;
  }
  assert.ok(bars > 300 && fars > 100 && hungCount > 3000 && floorCount > 1500, `coverage: ${bars} bars, ${fars} far tables, ${hungCount} hung, ${floorCount} floor props`);
});

ok('room sizes: the old 9 x 6 room gets a bar without stools and no far table, and says why; a deep room gets both', () => {
  const small = planRoom({ box: { min: { x: -4.5, y: -0.79, z: -3 }, max: { x: 4.5, y: 2.45, z: 3 } }, floorY: -0.79, tableBounds: APP.tableBounds, farTable: true });
  assert.equal(small.far, null);
  assert.ok(small.bar && small.bar.cfg.stools === false);
  assert.ok(small.notes.some((t) => /no far table/.test(t)) && small.notes.some((t) => /bar/.test(t)));
  const big = planRoom({ box: { min: { x: -6.5, y: -0.79, z: -5.5 }, max: { x: 6.5, y: 2.71, z: 3.5 } }, floorY: -0.79, tableBounds: APP.tableBounds, farTable: true });
  assert.ok(big.far && big.bar && big.bar.cfg.stools);
  const off = planRoom({ ...APP, farTable: false });
  assert.equal(off.far, null);
  // a bare table rectangle gets its playing clearance
  const bare = planRoom({ ...APP, tableBounds: { minX: -1.45, maxX: 1.45, minZ: -0.82, maxZ: 0.82 } });
  assert.ok(bare.keep.minX < -3 && bare.notes.some((t) => /clearance/.test(t)));
});

ok('views: a floor prop between a fixed camera and its subject is in the way; one behind the subject or beside the room is not', () => {
  for (const v of VIEWS) {
    const mid = [(v.cam[0] + v.target[0]) / 2, (v.cam[2] + v.target[2]) / 2];
    assert.ok(blocksView(mid[0], mid[1]) !== null, `${v.id}: the midpoint`);
    assert.ok(blocksView(v.cam[0], v.cam[2]) !== null, `${v.id}: the camera's own spot`);
  }
  assert.equal(blocksView(5.0, 0), null, 'at the bar, behind every subject');
  assert.equal(blocksView(1.2, -5.4), null, 'against the far wall');
  // slots whose floor would be in a view are marked, and furnish() leaves their floor empty
  const plan = planRoom({ ...APP, farTable: true });
  assert.ok(plan.slots.some((s) => !s.clear && s.blockedBy === 'V9'), 'the wall behind the wide view is wall-only');
  for (const s of plan.slots) { const f = wallFrame(s.wall, s.s, APP.box); assert.ok(Number.isFinite(f.x) && Number.isFinite(f.z) && Number.isFinite(f.ry)); }
});

// ---- the stroke font ------------------------------------------------------------------------------------------------------
const here = fileURLToPath(new URL('.', import.meta.url));
const atlasSrc = fs.readFileSync(`${here}../../scene/club/room/props/atlas.js`, 'utf8');
ok('stroke font: every word the atlas draws has its glyphs, and the atlas uses no canvas text and no canvas shadow', () => {
  const words = [...atlasSrc.matchAll(/(?:drawText\(ctx,\s*|chalk\(|painted\(|paintNeon\(c, w, h,\s*)'([^']+)'/g)].map((m) => m[1]);
  for (const need of ['BILLIARDS', 'OPEN LATE', 'LEAGUE NIGHT', 'WINNER STAYS ON', 'BILLIARD', 'ROOM', '9']) assert.ok(words.includes(need), `the atlas draws ${need}`);
  for (const w of words) assert.ok(covers(w), `glyphs for "${w}"`);
  assert.ok(covers('TABLE 1') && covers('TABLE 2') && covers('TABLE 3'));
  assert.equal(covers('café'), false);
  for (const banned of ['fillText', 'strokeText', 'measureText', 'ctx.font', '.font =', 'shadowBlur', 'shadowColor']) assert.ok(!atlasSrc.includes(banned), `atlas.js uses ${banned}`);
});
// The legal rule (CONTRACT.md 10.2): the props draw only generic game words. Every word the props' code can put on a texture is
// listed here; a new one fails this arm until it has been through the audit table of the props report.
const ALLOWED_WORDS = ['BILLIARDS', 'OPEN LATE', 'LEAGUE NIGHT', '9-BALL · RACE TO 7', 'TABLE 1', 'TABLE 2', 'TABLE 3', 'WINNER STAYS ON', 'BILLIARD', 'ROOM', 'CUES · CHALK · GOOD COMPANY', '9'];
const ALLOWED_ART = ['rack', 'cues', 'diagram', 'hills', 'diamonds', 'numeral', 'deco', 'lampStudy'];
ok('legal: every word and every picture of the props is on the audited list; no other module of the props draws text', () => {
  const drawn = [...atlasSrc.matchAll(/(?:drawText\(ctx,\s*|chalk\(|painted\(|paintNeon\(c, w, h,\s*)'([^']+)'/g)].map((m) => m[1]);
  const rows = [...atlasSrc.matchAll(/\[\['(TABLE \d)'/g)].map((m) => m[1]).concat([...atlasSrc.matchAll(/, \['(TABLE \d)'/g)].map((m) => m[1]));
  for (const w of [...drawn, ...rows]) assert.ok(ALLOWED_WORDS.includes(w), `"${w}" is not on the audited word list`);
  assert.ok(drawn.length >= 9 && rows.length === 3, `${drawn.length} words, ${rows.length} table rows found`);
  // every call that draws words takes a literal (found above) or the chalk / painted / paintNeon helper's own argument
  const calls = atlasSrc.match(/drawText\(/g).length;
  assert.equal(calls, 5, 'drawText call sites in atlas.js (the numeral, chalk, painted x 2, the sign): a new one needs the audit');
  const art = [...atlasSrc.matchAll(/^  (\w+)\(ctx, w, h, R\) \{/gm)].map((m) => m[1]);
  assert.deepEqual(art, ALLOWED_ART, 'the pictures of the atlas');
  for (const f of ['bar.js', 'fartable.js', 'seating.js', 'wall.js', 'extras.js', 'kit.js', 'layout.js', 'levels.js']) {
    const src = fs.readFileSync(`${here}../../scene/club/room/props/${f}`, 'utf8');
    for (const banned of ['drawText', 'fillText', 'strokeText', 'getContext', 'createElement', 'Image(', 'TextureLoader', 'fetch(']) assert.ok(!src.includes(banned), `${f} uses ${banned}: only atlas.js paints`);
  }
  const main = fs.readFileSync(`${here}../../scene/club/room/props.js`, 'utf8');
  for (const banned of ['drawText', 'fillText', 'strokeText', 'Image(', 'TextureLoader', 'fetch(']) assert.ok(!main.includes(banned), `props.js uses ${banned}`);
});
ok('stroke font: glyphs stay inside their cell, strokes are polylines of finite points, round shapes close', () => {
  for (const [ch, g] of Object.entries(GLYPHS)) {
    assert.ok(g.w > 0 && g.w <= 0.9, `${ch}: width ${g.w}`);
    for (const s of g.strokes) {
      assert.ok(s.length >= 2, `${ch}: a stroke of one point`);
      for (const [x, y] of s) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${ch}: finite`);
        assert.ok(x >= -0.02 && x <= g.w + 0.04 && y >= -0.08 && y <= 1.001, `${ch}: point ${x}, ${y} outside the cell`);
      }
      for (let i = 1; i < s.length; i++) assert.ok(Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]) < 1.3, `${ch}: a jump inside a stroke`);
    }
  }
  for (const ch of 'O08') { const ring = GLYPHS[ch].strokes[0]; assert.ok(Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 1e-3, `${ch} closes`); }
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(GLYPHS[ch], `glyph ${ch}`);
});
ok('stroke font: layout is additive, aligned, squeezed to a maximum width, and the same every time', () => {
  assert.ok(Math.abs(textWidth('AB') - (GLYPHS.A.w + GLYPHS.B.w + GAP)) < 1e-12);
  assert.equal(textWidth(''), 0);
  assert.ok(Math.abs(textWidth('ab') - textWidth('AB')) < 1e-12, 'lower case is drawn as capitals');
  const L = layoutText('OPEN LATE', 100, 50, 20, { align: 'left' });
  const C = layoutText('OPEN LATE', 100, 50, 20, { align: 'center' });
  const Rt = layoutText('OPEN LATE', 100, 50, 20, { align: 'right' });
  const xs = (o) => o.lines.flat().map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs(L)) - 100) < 1e-9);
  assert.ok(Math.abs((Math.min(...xs(C)) + Math.max(...xs(C))) / 2 - 100) < 0.6);
  assert.ok(Math.abs(Math.max(...xs(Rt)) - 100) < 20 * GAP + 1e-9);
  assert.ok(Math.abs(L.width - textWidth('OPEN LATE') * 20) < 1e-9);
  const ys = L.lines.flat().map((p) => p[1]);
  assert.ok(Math.min(...ys) >= 30 - 1e-9 && Math.max(...ys) <= 50 + 20 * 0.08, 'cap height above the baseline (canvas y grows downward)');
  const S = layoutText('LEAGUE NIGHT', 0, 0, 40, { maxWidth: 120 });
  assert.ok(Math.abs(S.width - 120) < 1e-9 && Math.max(...xs(S)) <= 120 + 1e-9);
  assert.deepEqual(layoutText('BILLIARDS', 3, 4, 17, { align: 'center' }), layoutText('BILLIARDS', 3, 4, 17, { align: 'center' }));
  // drawText issues only moveTo / lineTo / stroke, with a width from the weight
  const calls = [];
  const ctx = { beginPath() { calls.push('b'); }, moveTo() { calls.push('m'); }, lineTo() { calls.push('l'); }, stroke() { calls.push('s'); } };
  const w = drawText(ctx, 'ROOM', 0, 0, 10, { weight: 0.2 });
  assert.equal(ctx.lineWidth, 2); assert.equal(ctx.lineCap, 'round'); assert.equal(ctx.lineJoin, 'round');
  assert.ok(Math.abs(w - textWidth('ROOM') * 10) < 1e-9);
  assert.equal(calls.filter((c) => c === 'm').length, GLYPHS.R.strokes.length + 2 * GLYPHS.O.strokes.length + GLYPHS.M.strokes.length);
  assert.equal(calls.at(-1), 's');
});

// ---- light levels through the grade and the app's tone map (room/props/levels.js, post/tune.js) ---------------------------------
const mul = (c, k) => c.map((v) => v * k);
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** scene-linear HDR -> display sRGB 0..1: the club grade's exposure and curve, then the app's ACES at its exposure */
const display = (c) => toneMap(gradeColor(c.map((v) => Math.max(v, 1e-6) * CLUB_TUNE.grade.exposure)));
const COLOR = Object.fromEntries(EMIT_COLORS);
// the highlight weight of the lens (post/dof.js gather: 1 + boost * smoothstep(1, 8, luminance))
const lensWeight = (c, boost = 1.5) => 1 + boost * smoothstep(1, 8, luma(c));

ok('levels: the shelf panel is a lit recess: bright and unclipped at the strip, falling to dark wood at the top, never over the bloom threshold', () => {
  let prev = Infinity;
  for (const [t, col] of SHELF_GLOW) {
    const hdr = mul(linearOf(col), EMIT.panel), d = display(hdr);
    assert.ok(Math.max(...d) < 0.93, `stop ${t}: display ${d.map((v) => v.toFixed(3))} is clipped`);
    assert.ok(luma(d) < prev, `stop ${t}: the light does not fall off up the panel`);
    prev = luma(d);
    assert.ok(d[0] - d[2] > 0.05, `stop ${t}: lost its warmth (white)`);
    assert.ok(luma(hdr) < CLUB_TUNE.bloom.threshold, `stop ${t}: luminance ${luma(hdr).toFixed(2)} blooms`);
    assert.ok(lensWeight(hdr) < 1.001, `stop ${t}: weighs as a highlight in the lens`);
  }
  const foot = display(mul(linearOf(SHELF_GLOW[0][1]), EMIT.panel)), top = display(mul(linearOf(SHELF_GLOW.at(-1)[1]), EMIT.panel));
  assert.ok(luma(foot) > 0.75, `the foot of the row reads as lit (${luma(foot).toFixed(3)})`);
  assert.ok(luma(top) < 0.3 && luma(top) > 0.05, `the top of the row is dark wood, not black and not a light box (${luma(top).toFixed(3)})`);
  // the mean over the row against round 1b's cream box (the same level): well under it
  const meanOf = (stops) => { let a = 0; for (let i = 0; i < 100; i++) { const t = (i + 0.5) / 100; let k = 1; while (k < stops.length - 1 && t > stops[k][0]) k += 1; const [t0, c0] = stops[k - 1], [t1, c1] = stops[k]; const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); a += luma(display(linearOf(c0).map((v, j) => (v + (linearOf(c1)[j] - v) * f) * EMIT.panel))) / 100; } return a; };
  const R1B_BOX = [[0, '#fff0d6'], [0.3, '#f3dcb4'], [0.75, '#dcbe90'], [1, '#c9a878']];   // round 1b's cream light box
  const now = meanOf(SHELF_GLOW), box = meanOf(R1B_BOX), r2 = meanOf(R2.SHELF_GLOW);
  assert.ok(now < 0.72 * box, `mean display luminance of a panel ${now.toFixed(3)} against round 1b's ${box.toFixed(3)}`);
  // round 3: the panel is amber, not cream (its foot is clearly warmer than round 2's), darker on average than round 2's,
  // and not even along the bay: between two pools and at the uprights it keeps under 60 % of a pool's level
  const footNow = display(mul(linearOf(SHELF_GLOW[0][1]), EMIT.panel)), footR2 = display(mul(linearOf(R2.SHELF_GLOW[0][1]), EMIT.panel));
  assert.ok(footNow[0] - footNow[2] > footR2[0] - footR2[2] + 0.08, `the foot is amber: red over blue ${(footNow[0] - footNow[2]).toFixed(3)} against round 2's ${(footR2[0] - footR2[2]).toFixed(3)}`);
  assert.ok(now < r2, `mean ${now.toFixed(3)} under round 2's ${r2.toFixed(3)}`);
  assert.ok(Math.abs(shelfPool(SHELF_POOLS.at[0]) - 1) < 1e-9 && shelfPool(0.5) < 0.6 && shelfPool(0) < 0.6 && shelfPool(0.5) >= SHELF_POOLS.base, 'pools of light along a bay, dark panel between them');
  // the round-1 panel (the same tone map): 4.5 x its gradient put the upper half of every row at display white
  const old = display(mul(linearOf('#f4d09c'), 4.5)), oldMid = display(mul(linearOf('#dca464'), 4.5));
  assert.ok(old[0] > 0.98 && old[1] > 0.96 && oldMid[0] > 0.98, 'round 1: clipped red and green (the white-orange slab)');
  assert.ok(luma(mul(linearOf('#dca464'), 4.5)) > CLUB_TUNE.bloom.threshold, 'round 1: the panel itself was over the bloom threshold');
});

// The played table leads (CONTRACT.md 10.2). Reference: the main bed's centre in the round-1 sheet is display (54, 148, 224),
// luminance 134 of 255 (sheets/r1/after-V1.jpg); the far cloth was (150, 222, 150), luminance 200.
ok('levels: the far cloth, its balls and the far lamp are held under the played table, and the cloth carries a visible pool', () => {
  const MAIN = 134 / 255;
  // the far cloth is a plain emissive surface: its display value is the painted pool x FAR.cloth through the grade and the tone map
  const cloth = display(mul(linearOf(FAR_POOL.centre), FAR_LEVELS.cloth));
  assert.ok(luma(cloth) <= 0.5 * MAIN && luma(cloth) > 0.38 * MAIN, `the far cloth at a pool centre: display ${cloth.map((v) => Math.round(v * 255))}, luminance ${Math.round(luma(cloth) * 255)} against the main bed's ${Math.round(MAIN * 255)} (clearly under it: 38 to 50 %; the accepted second table stood at 49 %)`);
  // CONTRACT.md 10.2: never brighter than the main bed in any frame. The main bed's darkest played cloth (its near end under
  // the lamp pool, high view) measured 72 of 255 in round 3: a far pool's centre stays under it with room to spare
  const MAIN_DARKEST = 72 / 255;
  assert.ok(luma(cloth) < MAIN_DARKEST - 6 / 255, `the far cloth's brightest (${Math.round(luma(cloth) * 255)}) is under the main bed's darkest played cloth (72)`);
  assert.ok(Math.max(...cloth) < 148 / 255, 'no channel of the far cloth reaches the main bed\'s green, let alone its blue (54, 148, 224)');
  const mid = display(mul(linearOf(FAR_POOL.mid), FAR_LEVELS.cloth)), edge = display(mul(linearOf(FAR_POOL.edge), FAR_LEVELS.cloth));
  assert.ok(luma(mid) < 0.75 * luma(cloth) && luma(mid) > luma(edge), 'the pool falls off half way out');
  assert.ok(luma(edge) < 0.3 * luma(cloth) && luma(edge) > 0.02, `a visible pool: the cloth between the pools is under a third of a pool's centre (${Math.round(luma(edge) * 255)} against ${Math.round(luma(cloth) * 255)}) and not black`);
  // round 2's cloth for comparison: its edge kept more than a third of its centre (a slab)
  const c2 = display(mul(linearOf(R2.FAR_CLOTH[0][1]), R2.FAR.cloth)), e2 = display(mul(linearOf(R2.FAR_CLOTH.at(-1)[1]), R2.FAR.cloth));
  assert.ok(luma(e2) / luma(c2) > luma(edge) / luma(cloth) + 0.1, 'round 2 was flatter');
  // three pools inside the bed, with a flat top and a steady fall; the two ENDS of the cloth and its long sides both lie
  // beyond the `mid` ring of the nearest pool (the pool reads along the table as well as across it), and between two pools
  // the cloth keeps most of a pool's centre (one lit band, not three spots)
  assert.equal(FAR_POOL.at.length, 3);
  for (const x of FAR_POOL.at) assert.ok(Math.abs(x) + FAR_POOL.radius * 0.5 < FAR_BED[0] / 2);
  const midRing = FAR_POOL.profile.at(-1)[0] * FAR_POOL.radius, cut = FAR_BED[0] / 2 - 0.05, side = FAR_BED[1] / 2 - 0.05;
  assert.ok(cut - Math.max(...FAR_POOL.at) >= midRing && side >= midRing * 0.95, `the ends (${(cut - Math.max(...FAR_POOL.at)).toFixed(2)} m from the last pool) and the sides (${side.toFixed(2)} m) are past the mid ring (${midRing.toFixed(2)} m)`);
  const shareAt = (r) => { const P = FAR_POOL.profile; let i = 1; while (i < P.length - 1 && r > P[i][0]) i += 1; const [t0, k0] = P[i - 1], [t1, k1] = P[i]; return k0 + (k1 - k0) * Math.min(1, Math.max(0, (r - t0) / (t1 - t0))); };
  const between = shareAt(((FAR_POOL.at[1] - FAR_POOL.at[0]) / 2) / FAR_POOL.radius);
  assert.ok(between < 0.3 && FAR_POOL.profile[0][1] === 0, `between two pools the cloth is ${Math.round((1 - between) * 100)} % centre colour`);
  // every ball stands on the bed, clear of the cushions and of the other balls; its top is under the main bed's level too
  FAR_BALLS.forEach(([name, x, z], i) => {
    assert.ok(Math.abs(x) < FAR_BED[0] / 2 - 0.1 && Math.abs(z) < FAR_BED[1] / 2 - 0.1, `${name} on the bed`);
    for (const [, x2, z2] of FAR_BALLS.slice(i + 1)) assert.ok(Math.hypot(x - x2, z - z2) > 0.06, `${name} overlaps another ball`);
  });
  // no ball lies under the cue left across the rail (fartable.js: from (-0.86, -0.6) to (0.5, 0.02) over the bed)
  const farSrc = fs.readFileSync(`${here}../../scene/club/room/props/fartable.js`, 'utf8');
  assert.ok(farSrc.includes('[-0.86, 0.823, -0.6], [0.5, 0.789, 0.02]'), 'the cue of the far table lies where this arm expects it');
  for (const [name, x, z] of FAR_BALLS) {
    const t = Math.min(1, Math.max(0, ((x + 0.86) * 1.36 + (z + 0.6) * 0.62) / (1.36 * 1.36 + 0.62 * 0.62)));
    assert.ok(Math.hypot(x - (-0.86 + 1.36 * t), z - (-0.6 + 0.62 * t)) > 0.05, `${name} lies under the cue`);
  }
  const cue = display(mul(linearOf('#f3eedf'), FAR_LEVELS.ball[1]));
  assert.ok(luma(cue) < MAIN && luma(cue) > 1.6 * luma(cloth) && FAR_LEVELS.ball[0] < 0.2 * FAR_LEVELS.ball[1], `a far ball is lit from above (the cue ball's top ${Math.round(luma(cue) * 255)}: under the main bed's centre, well over its own cloth; a dark underside)`);
  const cushionTop = display(mul(linearOf('#3a7452'), FAR_LEVELS.cushion));
  assert.ok(luma(cushionTop) < 0.5 * luma(cloth), `the cushion tops (${Math.round(luma(cushionTop) * 255)}) frame the pool from below its level`);
  assert.ok(FAR_LEVELS.ballSpark < CLUB_TUNE.bloom.threshold, 'the highlight on a far ball does not bloom');
  assert.ok(FAR_LEVELS.lamp <= 3, 'the far lamp is a quiet source');
  // the shades: lit amber glass (saturated, red well up), every part of them under the main bed's luminance
  const rimC = display(mul(linearOf(FAR_SHADE.at(-1)[1]), EMIT.shade));
  assert.ok(luma(rimC) < 0.85 * MAIN && luma(rimC) > 0.55 * MAIN, `a far shade's rim: display ${rimC.map((v) => Math.round(v * 255))}, luminance ${Math.round(luma(rimC) * 255)}`);
  assert.ok(rimC[0] > 0.6 && rimC[0] - rimC[2] > 0.45, 'the shade reads as lit amber glass (round 2: a dull cream)');
  for (const [t, col] of FAR_SHADE) assert.ok(luma(display(mul(linearOf(col), EMIT.shade))) <= luma(rimC) + 1e-9, `shade stop ${t} is brighter than the rim`);
  const inside = display(mul(linearOf(COLOR.bulb), EMIT.farBulb));
  assert.ok(luma(inside) < MAIN, `the inside of a far shade is under the main bed (${Math.round(luma(inside) * 255)})`);
  assert.ok(luma(mul(linearOf(COLOR.bulb), EMIT.farBulb)) < CLUB_TUNE.bloom.threshold, 'the inside of a far shade does not bloom');
  if (process.argv.includes('--stats')) console.log(`STATS far cloth: centre ${cloth.map((v) => Math.round(v * 255))} (luminance ${Math.round(luma(cloth) * 255)}), mid ${mid.map((v) => Math.round(v * 255))}, edge ${edge.map((v) => Math.round(v * 255))}, shade rim ${rimC.map((v) => Math.round(v * 255))} (${Math.round(luma(rimC) * 255)}), inside ${inside.map((v) => Math.round(v * 255))} (${Math.round(luma(inside) * 255)}), cue ball top ${cue.map((v) => Math.round(v * 255))}`);
});

ok('levels: bottles pass the panel\'s light in their own colour, darker than the panel, with a dark outline', () => {
  const panelMid = luma(display(mul(linearOf(SHELF_GLOW[0][1]), EMIT.panel)));   // the foot of the row: what stands behind a bottle's body
  let darker = 0, coloured = 0;
  for (const [liquid, neck, cap] of BOTTLES) {
    const lin = linearOf(liquid), d = display(mul(lin, GLASS));
    // a saturated liquid takes its dominant channel high (round 3: up to 0.93 of display white); no channel reaches white
    assert.ok(Math.max(...d) < 0.94, `${liquid}: display ${d.map((v) => v.toFixed(3))} is clipped`);
    if (luma(d) < panelMid) darker += 1;
    if (Math.max(...lin) - Math.min(...lin) > 0.25) { coloured += 1; assert.ok(Math.max(...d) - Math.min(...d) > 0.2, `${liquid}: its colour does not survive the tone map`); }
    const edge = display(mul(lin, GLASS * glassFacing(0.1)));
    assert.ok(Math.max(...edge) < 0.16, `${liquid}: the outline is not dark`);
    assert.ok(luma(display(mul(linearOf(cap), GLASS))) < 0.3, `${liquid}: the cap glows`);
    assert.ok(luma(display(mul(linearOf(neck), GLASS))) <= luma(display(mul(linearOf(SHELF_GLOW[0][1]), EMIT.panel))), `${liquid}: the empty neck is brighter than the panel behind it`);
  }
  assert.ok(darker >= BOTTLES.length - 2 && coloured >= 6, `${darker} darker than the panel, ${coloured} coloured`);
  // round 3: colour that survives the blur. Most liquids are saturated on the display, the glass above the fill line is
  // tinted (not cream), a few bottles are dark glass (a silhouette against the panel), and a paper band is a dark plain colour
  const satOf = (hex) => { const d = display(mul(linearOf(hex), GLASS)); return (Math.max(...d) - Math.min(...d)) / Math.max(...d, 1e-6); };
  const dark = BOTTLES.filter(([liquid]) => luma(display(mul(linearOf(liquid), GLASS))) < 0.12).length;
  const vivid = BOTTLES.filter(([liquid]) => satOf(liquid) > 0.7 && Math.max(...display(mul(linearOf(liquid), GLASS))) > 0.6).length;
  const pale = BOTTLES.filter(([liquid]) => satOf(liquid) < 0.35).length;
  assert.ok(dark >= 3 && dark <= 6, `${dark} dark bottles`);
  assert.ok(vivid >= 10, `${vivid} vivid liquids`);
  assert.ok(pale <= 1, `${pale} pale liquids (one clear bottle at most)`);
  const vividR2 = R2.BOTTLES.filter(([liquid]) => satOf(liquid) > 0.7 && Math.max(...display(mul(linearOf(liquid), GLASS))) > 0.6).length;
  assert.ok(vivid >= vividR2 + 4, `more vivid liquids than round 2 (${vivid} against ${vividR2})`);
  for (const [liquid, glass, , band] of BOTTLES) {
    if (satOf(liquid) > 0.35) assert.ok(satOf(glass) > 0.3, `${liquid}: the glass above its fill line is cream (${glass})`);
    if (band) { assert.ok(/^#[0-9a-f]{6}$/.test(band), `${liquid}: a band is one plain colour`); assert.ok(luma(linearOf(band)) < 0.12, `${liquid}: a paper band passes no back light (${band})`); }
  }
  assert.equal(BOTTLES.length, R2.BOTTLES.length, 'both palettes fill the same atlas columns');
  assert.ok(glassFacing(1) === 1 && glassFacing(0) < 0.06 && glassFacing(0.3) < glassFacing(0.5));
  // the body shades across the whole width (a cylinder, not a cut-out): half way out it is clearly under the middle
  assert.ok(glassFacing(Math.sqrt(1 - 0.5 * 0.5)) < 0.97 && glassFacing(Math.sqrt(1 - 0.8 * 0.8)) < 0.6, 'the body falls off across the width');
  // the rim: nothing in the middle, a line at the outline, brighter than the body there, under the panel's foot
  assert.equal(glassRim(1), 0); assert.equal(glassRim(0.7), 0);
  assert.ok(glassRim(0.15) > 0.9 * GLASS_EDGE.rimLevel && GLASS_EDGE.rimLevel <= 1, 'the rim is a share of the transmitted light, never more than all of it');
  assert.ok(GLASS_EDGE.keyLevel > 0.5 && GLASS_EDGE.keyLevel < CLUB_TUNE.bloom.threshold, 'the key highlight is a highlight under the bloom threshold, not a lamp');
});

ok('levels: point sources are far over the bloom threshold and carry the full highlight weight; surfaces are not', () => {
  for (const [name, level] of [['flame', EMIT.flame], ['hot', EMIT.hot], ['filament', EMIT.hot]]) {
    const hdr = mul(linearOf(COLOR[name]), level);
    assert.ok(luma(hdr) >= 8, `${name}: luminance ${luma(hdr).toFixed(1)}`);
    assert.ok(Math.abs(lensWeight(hdr) - 2.5) < 1e-9, `${name}: full highlight weight`);
    assert.ok(Math.min(...display(hdr)) > 0.97, `${name}: reads as a light`);
  }
  assert.ok(luma(mul(linearOf(COLOR.strip), EMIT.strip)) > CLUB_TUNE.bloom.threshold, 'the strip under a shelf glows');
  // a pilot lamp through the lens at the bar's distance in the aim view: 12 mm across, spread over the blur disc, keeps its colour
  for (const name of ['pilotRed', 'pilotGreen', 'pilotAmber']) {
    const hdr = mul(linearOf(COLOR[name]), EMIT.pilot);
    assert.ok(luma(hdr) > CLUB_TUNE.bloom.threshold && EMIT.pilot <= EMIT.flame, `${name}: a point source, under the flames`);
    const px = Math.PI * (0.006 * 193) ** 2, dsc = Math.PI * 4.6 ** 2;
    const dd = display(mul(hdr, (px / dsc) * lensWeight(hdr)));
    assert.ok(Math.max(...dd) > 0.45 && Math.max(...dd) - Math.min(...dd) > 0.3, `${name}: its disc behind the lens is visible and coloured (${dd.map((v) => v.toFixed(2))})`);
  }
  assert.ok(luma(mul(linearOf('#ffe6c8'), EMIT.sign)) > CLUB_TUNE.bloom.threshold, 'the core of a sign tube glows');
  // round 3: the bulbs of the string along the lower shelf board and the glints on the bottles are point sources inside the
  // range the post chain was tuned against (9 .. 26), under the flames
  const fairy = mul(linearOf(COLOR.fairy), EMIT.fairy);
  assert.ok(EMIT.fairy >= 9 && EMIT.fairy <= EMIT.flame && luma(fairy) > 4 * CLUB_TUNE.bloom.threshold, `a bulb of the string: luminance ${luma(fairy).toFixed(1)}`);
  assert.ok(GLASS_EDGE.glintLevel >= 9 && GLASS_EDGE.glintLevel <= EMIT.flame, 'a glint is a point source');
  assert.ok(GLASS_EDGE.glintLo[0] < GLASS_EDGE.glintLo[1] && GLASS_EDGE.glintLo[1] < GLASS_EDGE.glintHi[0] && GLASS_EDGE.glintHi[0] < GLASS_EDGE.glintHi[1], 'the glint band is on the shoulder (normal turning up), not on the body or the top');
  // a flame through the lens at the bar's distance in the aim view: 18 mm across at 193 px/m, spread over the blur disc
  const flamePx = Math.PI * (0.009 * 193) ** 2, discPx = Math.PI * 4.6 ** 2;
  const disc = mul(linearOf(COLOR.flame), (EMIT.flame * flamePx) / discPx);
  const dd = display(disc);
  assert.ok(luma(disc) > 1.5 && dd[0] > 0.93 && dd[0] - dd[2] > 0.05, `the disc of a flame: HDR ${disc.map((v) => v.toFixed(2))}, display ${dd.map((v) => v.toFixed(2))}`);
  // dark-coloured emitters at a high level are still surfaces
  for (const [name, level] of [['bankerGreen', EMIT.banker], ['dimWarm', EMIT.dim], ['candle', EMIT.jar * 1.3]]) assert.ok(luma(mul(linearOf(COLOR[name]), level)) < 1, `${name} is a surface`);
});

// ---- a model of one display row through the lens (NOT a picture: the levels, the lens and the tone map on a synthetic row) -----
// A row of the back bar as the aim view sees it (193 px per metre at 6.5 m): the lit panel, the strip, bottles on a 19 px pitch.
// It is blurred with a disc in linear light with the lens's highlight weight, bloomed the way the app's pass does it (the
// whole texel over the threshold, blurred wide, added at `strength`), graded and tone-mapped. What is measured is whether the
// row is still a row of bottles: the swing of display luminance along the bottles, and how much of the row is at display white.
function shelfRow({ panelStops, panelLevel, stripLevel, bottle, radius, bloom, palette = BOTTLES }) {
  const W = 190, H = 76, PITCH = 19, BW = 15, R = rng(77);
  const img = new Float64Array(W * H * 3);
  const stops = panelStops.map(([t, col]) => [t, linearOf(col)]);
  const panelAt = (t) => { let i = 1; while (i < stops.length - 1 && t > stops[i][0]) i += 1; const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]; const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return c0.map((v, j) => (v + (c1[j] - v) * k) * panelLevel); };
  const strip = mul(linearOf(COLOR.strip), stripLevel);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = y < 3 ? strip : panelAt(y / (H - 1)); img.set(c, (y * W + x) * 3); }
  for (let cx = PITCH / 2; cx < W; cx += PITCH) {
    const pal = palette[Math.floor(R() * palette.length)];
    const h = 52 + Math.floor(R() * 10);
    for (let y = H - h; y < H; y++) {
      const v = (H - 1 - y) / h;                                   // 0 at the foot of the bottle, 1 at its top
      const half = v < 0.55 ? BW / 2 : v < 0.76 ? BW / 2 - ((v - 0.55) / 0.21) * (BW / 2 - 2.5) : 2.5;
      const part = v > 0.905 ? 2 : v > 0.67 ? 1 : 0;
      for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
        if (x < 0 || x >= W) continue;
        const u = (x - cx) / half;
        img.set(bottle(pal, part, Math.sqrt(Math.max(0, 1 - u * u))), (y * W + x) * 3);
      }
    }
  }
  const at = (a, x, y) => { const xx = Math.min(W - 1, Math.max(0, x)), yy = Math.min(H - 1, Math.max(0, y)); const i = (yy * W + xx) * 3; return [a[i], a[i + 1], a[i + 2]]; };
  const disc = (src, r, weight) => {
    const out = new Float64Array(src.length), rr = Math.ceil(r);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let w = 0; const acc = [0, 0, 0];
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const c = at(src, x + dx, y + dy), k = weight ? lensWeight(c) : 1;
        acc[0] += c[0] * k; acc[1] += c[1] * k; acc[2] += c[2] * k; w += k;
      }
      out.set(acc.map((v) => v / w), (y * W + x) * 3);
    }
    return out;
  };
  let lens = radius > 0.5 ? disc(img, radius, true) : img;
  if (bloom) {
    const bright = new Float64Array(lens.length);
    for (let i = 0; i < lens.length; i += 3) { const c = [lens[i], lens[i + 1], lens[i + 2]]; if (luma(c) > bloom.threshold) bright.set(c, i); }
    const glow = disc(bright, 9, false);                           // the pass's wide mips, as one disc
    lens = lens.map((v, i) => v + bloom.strength * 2.9 * glow[i]);  // its five mips add up to about 2.9 x strength
  }
  // along the bottles' bodies (a quarter of the way up the row)
  const y = H - 16, line = [], sat = [];
  let white = 0, total = 0;
  for (let x = 10; x < W - 10; x++) { const d = display(at(lens, x, y)); line.push(luma(d)); sat.push(Math.max(...d) - Math.min(...d)); }
  for (let yy = 4; yy < H; yy++) for (let x = 0; x < W; x++) { total += 1; if (Math.max(...display(at(lens, x, yy))) > 0.97) white += 1; }
  const sorted = line.slice().sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)], p90 = sorted[Math.floor(sorted.length * 0.9)];
  return { swing: p90 - p10, mean: line.reduce((a, b) => a + b, 0) / line.length, colour: sat.reduce((a, b) => a + b, 0) / sat.length, white: white / total };
}
const NEW_BOTTLE = (pal, part, facing) => (part === 2 ? mul(linearOf(pal[2]), 0.05) : mul(linearOf(pal[part]), GLASS * glassFacing(facing)));
// round 1: opaque lathe shapes, albedo x the room's light (about 0.25 from the front) plus an emissive share of 0.34
const OLD_PALETTE = ['#b8641a', '#17401e', '#b8a67e', '#5a2a0e', '#6a1219', '#8e4410', '#c89a2c', '#20140c', '#2c5260', '#a47a40', '#7a3a12', '#1c3a20'];
const OLD_BOTTLE = (pal) => mul(linearOf(OLD_PALETTE[BOTTLES.indexOf(pal) % OLD_PALETTE.length]), 0.25 + 0.34);
const OLD_STOPS = [[0, '#f4d09c'], [0.25, '#dca464'], [0.7, '#905626'], [1, '#5a3214']];
const NOW_STOPS = SHELF_GLOW.map(([t, col]) => [1 - t, col]).reverse();   // levels.js lists the panel foot -> top; the model draws top -> foot
ok('model of a shelf row through the lens: round 1b keeps a row of coloured bottles; round 1 was a clipped slab (the same model)', () => {
  const now = shelfRow({ panelStops: NOW_STOPS, panelLevel: EMIT.panel, stripLevel: EMIT.strip, bottle: NEW_BOTTLE, radius: 4.6, bloom: CLUB_TUNE.bloom });
  const sharp = shelfRow({ panelStops: NOW_STOPS, panelLevel: EMIT.panel, stripLevel: EMIT.strip, bottle: NEW_BOTTLE, radius: 0, bloom: CLUB_TUNE.bloom });
  const closeUp = shelfRow({ panelStops: NOW_STOPS, panelLevel: EMIT.panel, stripLevel: EMIT.strip, bottle: NEW_BOTTLE, radius: 5.0, bloom: CLUB_TUNE.bloom });
  // round 1 at its own radii: the aim view (8.1 px at the bar) and the ball close-up (11.9 px), 4.5 x everywhere, round-1 bloom values
  const then = shelfRow({ panelStops: OLD_STOPS, panelLevel: 4.5, stripLevel: 4.5, bottle: OLD_BOTTLE, radius: 8.1, bloom: CLUB_TUNE.bloom });
  const thenClose = shelfRow({ panelStops: OLD_STOPS, panelLevel: 4.5, stripLevel: 4.5, bottle: OLD_BOTTLE, radius: 11.9, bloom: CLUB_TUNE.bloom });
  // only the lens rule changed (round-1b levels at the round-1 radius): how much of the gain is the lens, how much the levels
  const lensOnly = shelfRow({ panelStops: NOW_STOPS, panelLevel: EMIT.panel, stripLevel: EMIT.strip, bottle: NEW_BOTTLE, radius: 11.9, bloom: CLUB_TUNE.bloom });
  const levelsOnly = shelfRow({ panelStops: OLD_STOPS, panelLevel: 4.5, stripLevel: 4.5, bottle: OLD_BOTTLE, radius: 4.6, bloom: CLUB_TUNE.bloom });
  if (process.argv.includes('--stats')) console.log(JSON.stringify({ now, sharp, closeUp, then, thenClose, lensOnly, levelsOnly }, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v), 1));
  assert.ok(now.white === 0 && closeUp.white === 0, `nothing of the row at display white (aim ${now.white}, close-up ${closeUp.white})`);
  assert.ok(now.swing > 0.12 && closeUp.swing > 0.1, `the bottles still swing the luminance along the row (aim ${now.swing.toFixed(3)}, close-up ${closeUp.swing.toFixed(3)})`);
  assert.ok(now.colour > 0.2, `the row keeps colour (${now.colour.toFixed(3)})`);
  assert.ok(now.swing > 0.3 * sharp.swing, 'the blurred row keeps a third of the sharp row\'s swing');
  assert.ok(thenClose.swing < 0.8 * closeUp.swing, `round 1 close-up: the row had lost its bottles (${thenClose.swing.toFixed(3)} against ${closeUp.swing.toFixed(3)})`);
  assert.ok(then.white > 0.1 || then.mean > now.mean + 0.05, `round 1: part of the row at display white (${then.white.toFixed(3)}) or brighter overall`);
  // round 3 against round 2 in the same model (the same lens, bloom and tone map; only the panel, the palette and the body
  // falloff differ; the model's panel has no pools): more colour is left along the blurred row
  const R2_STOPS = R2.SHELF_GLOW.map(([t, col]) => [1 - t, col]).reverse();
  const R2_BOTTLE = (pal, part, facing) => (part === 2 ? mul(linearOf(pal[2]), 0.05) : mul(linearOf(pal[part]), R2.GLASS * glassFacing(facing, R2.power)));
  const r2row = shelfRow({ panelStops: R2_STOPS, panelLevel: EMIT.panel, stripLevel: EMIT.strip, bottle: R2_BOTTLE, radius: 4.6, bloom: CLUB_TUNE.bloom, palette: R2.BOTTLES });
  if (process.argv.includes('--stats')) console.log(`STATS shelf row model, aim view: round 3 colour ${now.colour.toFixed(3)} swing ${now.swing.toFixed(3)} mean ${now.mean.toFixed(3)} | round 2 colour ${r2row.colour.toFixed(3)} swing ${r2row.swing.toFixed(3)} mean ${r2row.mean.toFixed(3)}`);
  assert.ok(now.colour > r2row.colour + 0.08, `more colour survives the blur than in round 2 (${now.colour.toFixed(3)} against ${r2row.colour.toFixed(3)})`);
});

// ---- the whole props tree, built in node: three from the vendored file, a stub 2D canvas (the atlas draws into nothing) ---------
// No GPU and no pixels: this runs every line of props.js, the kit, the atlas painters and each prop on every tier, with the
// room's real light object and without it, so a thrown error, a NaN vertex, a prop outside the room or inside the playing
// clearance, a missed shader anchor or a broken budget shows here and not as an empty room in the app.
{
  const { registerHooks } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const threeUrl = pathToFileURL(`${here}../../vendor/three.module.min.js`).href;
  registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
  const THREE = await import('three');
  const grad = { addColorStop() {} };
  const calls = { stroke: 0, fill: 0, text: 0 };
  const ctxStub = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { if (k === 'stroke') calls.stroke += 1; if (k === 'fillRect' || k === 'fill') calls.fill += 1; if (/Text$/.test(String(k))) calls.text += 1; return String(k).startsWith('create') ? grad : undefined; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const hadDocument = 'document' in globalThis;
  if (!hadDocument) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() }) };
  const { buildProps, EMIT: E2 } = await import('../../scene/club/room/props.js');
  const { TIERS } = await import('../../scene/club/tiers.js');
  let roomLight = null, lightNote = 'room/light.js';
  try { roomLight = (await import('../../scene/club/room/light.js')).roomLight ?? null; } catch (e) { lightNote = `room/light.js did not load (${e?.message ?? e}): the fallback materials only`; }
  const args = (light) => ({
    box: { min: new THREE.Vector3(APP.box.min.x, APP.box.min.y, APP.box.min.z), max: new THREE.Vector3(APP.box.max.x, APP.box.max.y, APP.box.max.z) },
    floorY: APP.floorY, tableBounds: { ...APP.tableBounds }, roomLight: light,
    reserved: APP.reserved.map((r) => ({ ...r })),
    // the shell's layout as room.js hands it: the door and the wall lamps by wall name and world position
    layout: {
      door: { wall: 'east', min: [5.5, -0.79, 2.2], max: [5.5, 1.27, 3.12] },
      sconces: LAMPS.map((l) => ({ wall: { zn: 'north', zp: 'south', xp: 'east', xn: 'west' }[l.wall], on: true, position: l.wall === 'xp' || l.wall === 'xn' ? [l.wall === 'xp' ? 5.365 : -5.365, 1.01, l.at] : [l.at, 1.01, l.wall === 'zn' ? -5.865 : 3.465] })),
    },
  });
  const built = {};
  for (const tier of ['lite', 'base', 'high']) for (const lit of [true, false]) {
    if (lit && !roomLight) continue;
    if (lit) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); }
    built[`${tier}${lit ? '' : ':nolight'}`] = { tier, lit, props: await buildProps({ tier, knobs: TIERS[tier] }, args(lit ? roomLight : null)), lightState: lit ? roomLight.state?.() : null };
  }
  const meshesOf = (group) => { const out = []; group.traverse((o) => { if (o.isMesh && o.visible !== false && o.parent?.visible !== false) out.push(o); }); return out; };

  ok(`build: the props build on every tier, with the room light and without it (${lightNote}), inside their budgets`, () => {
    assert.ok(Object.keys(built).length >= 3);
    for (const [key, { tier, lit, props }] of Object.entries(built)) {
      const c = props.counts();
      assert.equal(c.enabled, true, `${key}: ${c.reason}`);
      assert.equal(c.lit, lit, `${key}: lit`);
      assert.equal(c.detail, TIERS[tier].roomDetail);
      const max = { lite: [7, 6500], base: [10, 30000], high: [10, 60000] }[tier];
      assert.ok(c.drawCalls <= max[0] + (lit ? 0 : 1), `${key}: ${c.drawCalls} draw calls`);
      assert.ok(c.triangles <= max[1], `${key}: ${c.triangles} triangles`);
      assert.equal(meshesOf(props.group).length, c.drawCalls, `${key}: one mesh per draw call`);
      assert.deepEqual(c.reserved.conflicts, [], `${key}: props on a reserved wall span`);
      assert.ok(c.reserved.spans === APP.reserved.length && c.reserved.lamps === LAMPS.length, `${key}: the shell's spans were read`);
      assert.equal(c.farTable, TIERS[tier].farTable !== false);
      assert.ok(c.bar && Math.abs(c.bar.from - -2.6) < 0.01 && Math.abs(c.bar.length - 4.32) < 0.01, `${key}: the bar`);
      assert.ok(props.emissives.length >= 2 && props.emissives.every((m) => m.isMesh), `${key}: emissives`);
      if (tier !== 'lite') assert.ok(c.bottles >= 70 && c.chairs >= 6 && c.pictures >= 10, `${key}: ${c.bottles} bottles, ${c.chairs} chairs, ${c.pictures} pictures`);
    }
    assert.equal(calls.text, 0, 'no canvas text call reached the 2D context');
    assert.ok(calls.stroke > 200, `the atlas strokes its words (${calls.stroke} strokes)`);
  });

  if (process.argv.includes('--stats')) {
    for (const [key, { props }] of Object.entries(built)) { const c = props.counts(); console.log(`STATS ${key}: ${c.drawCalls} draw calls, ${c.triangles} triangles, ${c.bottles} bottles, ${c.chairs} chairs, ${c.pictures} pictures, emitters ${c.emitters.length}; ${JSON.stringify(c.byMaterial)}`); }
  }
  if (process.argv.includes('--hung')) for (const h of built.high.props.counts().hung) console.log(`HUNG ${JSON.stringify(h)}`);
  ok('build: every vertex is finite, inside the room, and outside the table\'s playing clearance (soft shadows excepted)', () => {
    const B = APP.box, K = APP.tableBounds;
    for (const [key, { props }] of Object.entries(built)) {
      for (const mesh of meshesOf(props.group)) {
        const pos = mesh.geometry.getAttribute('position'), overlay = /contactshadow|castshadow|glowdecal/.test(mesh.name);
        let inside = 0;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `${key} ${mesh.name}: a vertex is not finite`);
          const out = overlay ? 0.35 : 0.02; // a soft contact shadow is a quad wider than its prop: its dark middle is in the room, its clear rim may pass under the wall
          assert.ok(x >= B.min.x - out && x <= B.max.x + out && z >= B.min.z - out && z <= B.max.z + out && y >= B.min.y - (overlay ? 0.1 : 0.02) && y <= B.max.y + 0.02, `${key} ${mesh.name}: vertex ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)} outside the room`);
          if (!overlay && x > K.minX + 0.02 && x < K.maxX - 0.02 && z > K.minZ + 0.02 && z < K.maxZ - 0.02) inside += 1;
        }
        assert.equal(inside, 0, `${key} ${mesh.name}: ${inside} vertices inside the playing clearance`);
        const idx = mesh.geometry.getIndex();
        assert.ok(idx && idx.count % 3 === 0 && idx.count / 3 > 0, `${key} ${mesh.name}: indexed triangles`);
      }
    }
  });

  ok('build: emissive levels ride the vertices (flames at the top, panels near 1), the glass patch hits its anchor, emitters are registered', () => {
    for (const [key, { tier, lit, props, lightState }] of Object.entries(built)) {
      const meshes = Object.fromEntries(meshesOf(props.group).map((m) => [m.name, m]));
      const em = meshes['club.props.emissive'];
      assert.ok(em, `${key}: the emissive mesh`);
      assert.equal(em.material.vertexColors, true);
      assert.ok(em.material.color.r === 1 && em.material.color.g === 1, `${key}: the emissive material's own colour is 1 (levels are per vertex)`);
      const col = em.geometry.getAttribute('color');
      assert.ok(col.array instanceof Float32Array && col.normalized !== true, `${key}: float levels`);
      let lo = Infinity, hi = 0; const seen = new Set();
      for (let i = 0; i < col.count; i++) { const v = col.getX(i); lo = Math.min(lo, v); hi = Math.max(hi, v); seen.add(+v.toFixed(3)); }
      assert.ok(seen.has(E2.panel) && seen.has(E2.strip), `${key}: panel and strip levels present`);
      assert.ok(lo > 0.005, `${key}: lowest level ${lo}`);
      if (tier !== 'lite') { assert.equal(hi, E2.flame, `${key}: the hottest vertices are the flames`); assert.ok(seen.has(E2.sign) && seen.has(E2.hot) && seen.has(E2.pilot) && seen.has(E2.shade) && seen.has(FAR_LEVELS.cloth), `${key}: sign, bulb, pilot lamp, far shade and far cloth levels present (the far cloth is in the unlit batch)`); }
      else assert.ok(hi <= E2.dim, `${key}: the lite room has no point sources (${hi})`);
      // every other batch keeps its baked shade in 8 bits
      for (const [name, m] of Object.entries(meshes)) if (name !== 'club.props.emissive') assert.ok(m.geometry.getAttribute('color').array instanceof Uint8Array, `${key} ${name}: 8-bit shade`);
      // the glass material: its own program key, and its text lands after the emissive map of the standard fragment shader
      const glass = meshes['club.props.glass'];
      assert.ok(glass && glass.geometry.getIndex().count / 3 > 500, `${key}: bottles in the glass batch`);
      const keyGlass = glass.material.customProgramCacheKey(), keyWood = meshes['club.props.wood'].material.customProgramCacheKey();
      assert.ok(keyGlass.endsWith('|club-props-glass-v3') && keyGlass !== keyWood, `${key}: glass program key`);
      const shader = { uniforms: {}, defines: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      glass.material.onBeforeCompile(shader, null);
      const at = shader.fragmentShader.indexOf('clubGlassFacing');
      assert.ok(at > shader.fragmentShader.indexOf('#include <emissivemap_fragment>') && at < shader.fragmentShader.indexOf('#include <lights_physical_fragment>'), `${key}: the glass text sits between the emissive map and the lights`);
      assert.equal(shader.fragmentShader.split('float clubGlassFacing').length, 2, `${key}: once`);
      // what the glass text reads is declared before it once three's chunks are in place (no shader is compiled here)
      const expand = (src) => src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (m, name) => (THREE.ShaderChunk[name] !== undefined ? expand(THREE.ShaderChunk[name]) : m));
      const full = expand(shader.fragmentShader), mine = full.indexOf('float clubGlassFacing');
      assert.ok(shader.uniforms.uClubGlass?.value?.isVector4 && shader.uniforms.uClubGlassKey?.value?.isVector3, `${key}: the glass uniforms are handed to the program`);
      assert.ok(shader.uniforms.uClubGlass.value.x === GLASS_EDGE.power && shader.uniforms.uClubGlass.value.y === GLASS_EDGE.glintLevel, `${key}: body exponent and glint level`);
      assert.equal(full.split('clubGlassGate').length, 4, `${key}: the glint gate is declared, read from the vertex colour and used once`);
      for (const decl of ['vec3 totalEmissiveRadiance', 'varying vec3 vViewPosition', 'vec3 normal = normalize( vNormal )', 'varying vec3 vColor', '#define saturate', 'uniform vec4 uClubGlass;', 'uniform vec3 uClubGlassKey;']) {
        const where = full.indexOf(decl);
        assert.ok(where >= 0 && where < mine, `${key}: "${decl}" is declared before the glass text`);
      }
      assert.ok(!/#include +<emissivemap_fragment>/.test(full.slice(mine)), `${key}: nothing re-reads the emissive map after the glass text`);
      assert.ok(glass.material.emissive.r === GLASS && glass.material.roughness < 0.2 && glass.material.color.r < 0.25);
      for (const m of Object.values(meshes)) { // every other material compiles its hooks without throwing on the standard shader text
        if (typeof m.material.onBeforeCompile !== 'function' || !m.material.isMeshStandardMaterial) continue;
        const sh = { uniforms: {}, defines: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
        m.material.onBeforeCompile(sh, null);
        assert.ok(sh.fragmentShader.length >= THREE.ShaderLib.standard.fragmentShader.length);
      }
      const ids = props.counts().emitters;
      if (tier === 'lite') assert.deepEqual(ids, ['props.bar.shelves', 'props.bar.counter', 'props.sign.a', 'props.sign.b']); // the lite room registers the first only
      else assert.deepEqual(ids, ['props.bar.shelves.0', 'props.bar.shelves.1', 'props.bar.shelves.2', 'props.bar.lamp', 'props.bar.counter', 'props.far.lamp', 'props.sign.a', 'props.sign.b']);
      if (lit && lightState) assert.ok(lightState.emitters >= (tier === 'lite' ? 1 : 8) && lightState.emitters <= lightState.max / 2, `${key}: ${lightState.emitters} emitters registered, half the budget is ${lightState.max / 2}`);
    }
  });

  // ---- round 3: the shadow overlays are split, and the tool switch gives round 2 back without moving anything
  const withQuery = (text) => ({ tier: 'high', knobs: TIERS.high, ctx: { query: new URLSearchParams(text) } });
  const r2look = await buildProps(withQuery('clubprops=r2'), args(null));
  const noContact = await buildProps(withQuery('clubprops=contact:0'), args(null));
  ok('shadows: contact-size and cast-size overlays are two meshes under the names the room agreed (it hides `castshadow` under its bake, never `contactshadow`)', () => {
    for (const [key, { tier, props }] of Object.entries(built)) {
      const meshes = Object.fromEntries(meshesOf(props.group).map((m) => [m.name, m]));
      const contact = meshes['club.props.contactshadow'], cast = meshes['club.props.castshadow'];
      assert.ok(contact && cast, `${key}: both overlay meshes`);
      assert.equal(contact.material.name, 'club.props.contactshadow', `${key}: room.js keeps this material's meshes under the bake`);
      assert.equal(cast.material.name, 'club.props.castshadow', `${key}: room.js hides this material's meshes under the bake`);
      assert.notEqual(contact.material, cast.material);
      for (const m of [contact, cast]) assert.ok(m.material.isMeshBasicMaterial && m.material.depthWrite === false && m.material.transparent === true && m.renderOrder === 1, `${key}: an unlit multiplied overlay (the bake skips it)`);
      // sizes, quad by quad (four vertices each): a contact overlay is never deeper than a counter's foot; cast ones are larger
      const sizes = (mesh) => { const p = mesh.geometry.getAttribute('position'), out = []; for (let i = 0; i + 3 < p.count; i += 4) { const a = Math.hypot(p.getX(i + 1) - p.getX(i), p.getY(i + 1) - p.getY(i), p.getZ(i + 1) - p.getZ(i)), b = Math.hypot(p.getX(i + 3) - p.getX(i), p.getY(i + 3) - p.getY(i), p.getZ(i + 3) - p.getZ(i)); out.push([Math.min(a, b), Math.max(a, b)]); } return out; };
      const cs = sizes(contact), ks = sizes(cast);
      assert.ok(cs.length >= (tier === 'lite' ? 40 : 90), `${key}: ${cs.length} contact overlays`);
      for (const [short] of cs) assert.ok(short <= 1.05, `${key}: a contact overlay ${short.toFixed(2)} m deep`);
      const median = (list) => list.map((q) => q[0]).sort((a, b) => a - b)[list.length >> 1];
      assert.ok(median(cs) < 0.3 && median(ks) > 0.45, `${key}: contact overlays are small (median depth ${median(cs).toFixed(2)} m), cast ones large (${median(ks).toFixed(2)} m)`);
      // on the floor or on a wall, never in the air: every contact quad lies within 5 mm of the floor or of a wall plane
      const p = contact.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const onFloor = Math.abs(p.getY(i) - APP.floorY) < 0.005;
        const onWall = Math.min(Math.abs(p.getX(i) - APP.box.min.x), Math.abs(p.getX(i) - APP.box.max.x), Math.abs(p.getZ(i) - APP.box.min.z), Math.abs(p.getZ(i) - APP.box.max.z)) < 0.005;
        assert.ok(onFloor || onWall, `${key}: a contact overlay off the floor and off the walls`);
      }
    }
    const names = (props) => meshesOf(props.group).map((m) => m.name);
    assert.ok(!names(noContact).includes('club.props.contactshadow') && names(noContact).includes('club.props.castshadow'), 'clubprops=contact:0: no contact mesh, the cast mesh stays');
    assert.ok(!names(r2look).includes('club.props.contactshadow') && names(r2look).includes('club.props.castshadow'), 'clubprops=r2: round 2 had cast-size overlays only (hidden under the bake)');
    assert.equal(noContact.counts().look.contact, false);
  });
  ok('tool switch: clubprops=r2 gives round 2\'s shelves and far table on the same geometry (nothing moves), with no glint and no bulb string', () => {
    const now = built['high:nolight'].props;
    const mesh = (props, name) => meshesOf(props.group).find((m) => m.name === name);
    const gNow = mesh(now, 'club.props.glass'), gOld = mesh(r2look, 'club.props.glass');
    const pNow = gNow.geometry.getAttribute('position'), pOld = gOld.geometry.getAttribute('position');
    assert.equal(pNow.count, pOld.count, 'the same bottles and glasses');
    let moved = 0; for (let i = 0; i < pNow.count; i += 97) if (Math.abs(pNow.getX(i) - pOld.getX(i)) + Math.abs(pNow.getZ(i) - pOld.getZ(i)) > 1e-6) moved += 1;
    assert.equal(moved, 0, 'no bottle moved');
    // the glint gate (blue channel): about a quarter of the bottles carry one now, none in round 2's look
    const gate = (g) => { const c = g.geometry.getAttribute('color'); let on = 0; for (let i = 0; i < c.count; i++) if (c.getZ(i) > 0.01) on += 1; return on / c.count; };
    assert.ok(gate(gNow) > 0.08 && gate(gNow) < 0.4, `share of glass vertices with a glint: ${gate(gNow).toFixed(2)}`);
    assert.equal(gate(gOld), 0, 'round 2: no glint');
    assert.equal(gOld.material.userData?.clubRoom, gNow.material.userData?.clubRoom);
    // the bulb string: more emissive triangles now; and the far balls are in the emissive batch now, in the lit batch in round 2
    const tri = (props, name) => (mesh(props, name)?.geometry.getIndex().count ?? 0) / 3;
    assert.ok(tri(now, 'club.props.emissive') > tri(r2look, 'club.props.emissive') + 400, 'the string and the far balls');
    assert.ok(tri(r2look, 'club.props.glow') > 300 && tri(now, 'club.props.glow') === 0, 'round 2 lit its far balls in the self-lit batch; that batch is empty now (no draw call)');
    assert.deepEqual(r2look.counts().emitters, now.counts().emitters, 'the switch does not touch the emitters');
    assert.deepEqual(r2look.counts().slots, now.counts().slots);
    assert.deepEqual({ ...r2look.counts().look }, { shelves: 'r2', far: 'r2', contact: false, points: true, body: true });
  });
  // ---- the second table's body: lifted in the wood material's answer to the light, where the room's bake does not read
  const noLift = await buildProps(withQuery('clubprops=body:0'), args(null));
  ok('far body: the wood inside the body\'s box returns FAR_BODY.lift times the diffuse light; vertex shade, colour and geometry (what the bake reads) are those of the unlifted room', () => {
    const wood = (props) => meshesOf(props.group).find((m) => m.name === 'club.props.wood');
    assert.ok(FAR_BODY.lift > 1 && FAR_BODY.lift <= 2.5, `lift ${FAR_BODY.lift}: a lighter wood, not a lit one`);
    assert.ok(THREE.ShaderLib.standard.fragmentShader.includes('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;'), 'the line the lift follows is in this three\'s standard fragment shader');
    for (const [key, { tier, props }] of Object.entries(built)) {
      const w = wood(props), u = w.material.userData.clubFarBody;
      assert.ok(w.material.customProgramCacheKey().includes('|club-props-farbody-v1'), `${key}: the wood's program key`);
      const sh = { uniforms: {}, defines: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      w.material.onBeforeCompile(sh, null);
      assert.equal(sh.fragmentShader.split('uClubFarLift.y').length, 2, `${key}: the lift is in the text once`);
      assert.ok(sh.fragmentShader.indexOf('uniform vec2 uClubFarLift;') < sh.fragmentShader.indexOf('uClubFarLift.y') && sh.fragmentShader.indexOf('uClubFarLift.y') < sh.fragmentShader.indexOf('#include <opaque_fragment>'), `${key}: declared, then used before the colour is written`);
      assert.ok(sh.uniforms.uClubFarBox === u.uClubFarBox && sh.uniforms.uClubFarLift === u.uClubFarLift, `${key}: the program reads the live uniforms`);
      const far = props.counts().far, box = u.uClubFarBox.value, top = u.uClubFarLift.value;
      if (tier === 'lite' || !far) { assert.ok(box.z < 0 && top.y === 0, `${key}: no second table, an empty box and no lift`); continue; }
      assert.ok(Math.abs(box.x - far.x) < 0.006 && Math.abs(box.y - far.z) < 0.006, `${key}: the box stands on the second table`);
      assert.ok(Math.max(box.z, box.w) > 1.15 && Math.max(box.z, box.w) < 1.3 && Math.min(box.z, box.w) > 0.65 && Math.min(box.z, box.w) < 0.8, `${key}: the box is the table's footprint (${box.z.toFixed(2)} x ${box.w.toFixed(2)} half sizes)`);
      assert.ok(Math.abs(top.x - (APP.floorY + FAR_BODY.top)) < 1e-6 && Math.abs(top.y - (FAR_BODY.lift - 1)) < 1e-6, `${key}: top of the box and the lift`);
      // inside the box under its top: only the second table's own wood (no chair, no stool, no panelling shares the lift)
      const p = w.geometry.getAttribute('position');
      let inside = 0;
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - box.x) <= box.z && Math.abs(p.getZ(i) - box.y) <= box.w && p.getY(i) <= top.x) inside += 1;
      assert.ok(inside >= 5 * 8 && inside <= 5 * 200, `${key}: ${inside} wood vertices in the box: the apron and four legs in two pieces`);
    }
    // the switch: no lift, and nothing the bake reads differs (positions, vertex shade, the material's colour)
    const a = wood(built['high:nolight'].props), b = wood(noLift);
    assert.equal(b.material.userData.clubFarBody.uClubFarLift.value.y, 0, 'clubprops=body:0: no lift');
    assert.equal(noLift.counts().look.body, false);
    assert.deepEqual(Array.from(a.geometry.getAttribute('position').array), Array.from(b.geometry.getAttribute('position').array), 'the same wood, vertex for vertex');
    assert.deepEqual(Array.from(a.geometry.getAttribute('color').array), Array.from(b.geometry.getAttribute('color').array), 'the same vertex shade');
    assert.ok(a.material.color.equals(b.material.color) && a.material.color.r === 1, 'the same material colour');
  });

  ok('build: setTier builds another level in place and shows only that level', () => {
    const one = built['base:nolight'].props;
    const before = one.counts().triangles;
    one.setTier('lite');
    assert.ok(one.counts().detail === 0 && one.counts().triangles < before && one.counts().levelsBuilt === 2);
    assert.equal(meshesOf(one.group).length, one.counts().drawCalls, 'only the shown level draws');
    one.setTier('base');
    assert.equal(one.counts().triangles, before);
  });
  // the shell's spans without its layout (only `reserved`): the door is known by its flag, a lamp span is not taken for a door
  const bare = await buildProps({ tier: 'base', knobs: TIERS.base }, { ...args(null), layout: null });
  ok('build: reserved spans alone (no layout) furnish the same room: only the flagged door keeps its floor free', () => {
    const a = bare.counts(), b = built['base:nolight'].props.counts();
    assert.deepEqual(a.reserved.conflicts, []);
    assert.deepEqual(a.slots, b.slots);
    assert.ok(a.chairs === b.chairs && a.pictures === b.pictures && a.chairs >= 6, `${a.chairs} chairs, ${a.pictures} pictures`);
  });
  const empty = await buildProps({ tier: 'base', knobs: TIERS.base }, {});
  ok('build: no room box = an empty group and a reason, never a throw', () => {
    assert.equal(empty.counts().enabled, false);
    assert.ok(/box/.test(empty.counts().reason) && empty.group.children.length === 0 && empty.emissives.length === 0);
  });
  if (!hadDocument) delete globalThis.document;
}

console.log(`test-club-props: ${n} arms OK`);
