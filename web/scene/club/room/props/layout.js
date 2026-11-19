// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/layout.js — where the club props stand (owner: props). Pure arithmetic on the shell's interior box and the table's
// keep-out rectangle: no three import, so it runs in node. Nothing is tied to one room size: the bar, the far table and the wall
// slots are sized from the free strips between the keep-out and the walls, and what does not fit is left out.
//
// Frames: the table's long axis is world x. Wall ids: 'xp' (x = box.max.x, behind the foot of the table: the background of the
// aim and break views), 'xn', 'zn' (z = box.min.z, across the table from the standing view), 'zp'. A wall frame has its origin on
// the wall at floor level, local +Z pointing into the room and local +X along the wall.
//
// The plan, in order of weight in the picture:
//   1. the back bar on 'xp', centred on the table's axis when the wall is free (it fills the aim and break views), or pushed
//      into the 'zn' corner when the far table has to share that strip;
//   2. the far table beside the main one in the 'zn' strip, parallel to it, when that strip is deep enough for a table and a
//      player; otherwise across the foot of the room beside the bar; otherwise none;
//   3. wall slots about 1.9 m wide on what is left of every wall, each with a recipe (seats, a cue rack, a board, pictures, a
//      lit sign). The lit signs go where the play views see them: next to the bar first.

// Reserved wall spans (CONTRACT.md 8.6) are the shell's: a door, a window, a wall lamp. NOTHING of the props is placed on one:
// nothing is hung inside it, nothing stands on the floor against it, and the bar does not cross it. A door also keeps the floor
// in front of it free (`floor: true`). Wall lamps handed separately (`lamps`, from the shell's layout) are kept clear by
// everything hung and by tall floor props; chairs and benches may stand under one.

// The fixed review views (the lane's views.json, world metres). A floor-standing prop is never placed where it would stand
// between one of these cameras and what it looks at, or right next to the camera.
export const VIEWS = [
  { id: 'V1', cam: [-2.3, 1.05, 1.35], target: [0.1, 0, 0], fov: 40 },
  { id: 'V2', cam: [-1.35, 0.32, 0.22], target: [0.2, 0, 0], fov: 32 },
  { id: 'V3', cam: [-2.15, 0.62, 0], target: [0.6, 0, 0], fov: 38 },
  { id: 'V4', cam: [0.85, 0.28, 0.25], target: [1.27, 0, 0.635], fov: 28 },
  { id: 'V5', cam: [0.25, 0.22, 0.25], target: [0, 0.02, 0.66], fov: 26 },
  { id: 'V6', cam: [0.05, 0.115, 0.75], target: [0.5, 0.045, 0.6], fov: 26 },
  { id: 'V7', cam: [-0.85, 0.2, 0.42], target: [0.05, 0.02, -0.02], fov: 28 },
  { id: 'V9', cam: [-4.0, 1.6, 2.6], target: [0, 0.3, 0], fov: 50 },
];

export const WALLS = {
  xp: { ry: -Math.PI / 2, ux: 0, uz: 1 },   // local +X = world +z
  xn: { ry: Math.PI / 2, ux: 0, uz: -1 },   // local +X = world -z
  zn: { ry: 0, ux: 1, uz: 0 },              // local +X = world +x
  zp: { ry: Math.PI, ux: -1, uz: 0 },       // local +X = world -x
};

// the far table: a seven-foot table, outer size
export const FAR = { length: 2.36, width: 1.37 };
const CLEAR_TABLE = 1.6;       // free floor around the main table when the caller hands a bare table rectangle
const SLOT = 1.9;              // nominal width of one wall slot (two chairs and a side table)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** The wall frame at world coordinate `s` along the wall (z on the x walls, x on the z walls). */
export function wallFrame(wall, s, box) {
  const w = WALLS[wall];
  if (wall === 'xp') return { x: box.max.x, z: s, ry: w.ry };
  if (wall === 'xn') return { x: box.min.x, z: s, ry: w.ry };
  if (wall === 'zn') return { x: s, z: box.min.z, ry: w.ry };
  return { x: s, z: box.max.z, ry: w.ry };
}

/**
 * The id of a fixed view that a floor prop of radius r at (x, z) would stand in the way of, or null: within `near` metres of
 * the camera, or inside its horizontal field of view between the camera and what it looks at (closer than `reach` metres).
 * A prop behind the view's target is background, not an obstruction.
 */
export function blocksView(x, z, r = 0.15, { near = 0.7, reach = 4.0, aspect = 16 / 9 } = {}) {
  for (const v of VIEWS) {
    const dx = x - v.cam[0], dz = z - v.cam[2];
    const d = Math.hypot(dx, dz);
    if (d < near + r) return v.id;
    const fx = v.target[0] - v.cam[0], fz = v.target[2] - v.cam[2];
    const fl = Math.hypot(fx, fz) || 1;
    if (d > Math.min(reach, fl + 0.3) + r) continue;
    const half = Math.atan(Math.tan((v.fov * Math.PI) / 360) * aspect);
    const ang = Math.acos(clamp((dx * fx + dz * fz) / (d * fl), -1, 1));
    if (ang < half + Math.asin(Math.min(1, r / Math.max(d, r)))) return v.id;
  }
  return null;
}

/**
 * The stretches of wall `wall` between `from` and `to` that no reserved span touches, each span widened by margin(r) metres.
 * Returns [{ from, to }] in order (possibly empty).
 */
export function freeStretches(wall, from, to, reserved = [], margin = () => 0) {
  const cuts = reserved.filter((r) => r.wall === wall).map((r) => { const m = margin(r); return [Math.min(r.from, r.to) - m, Math.max(r.from, r.to) + m]; })
    .filter(([a, b]) => b > from && a < to).sort((p, q) => p[0] - q[0]);
  const out = [];
  let at = from;
  for (const [a, b] of cuts) { if (a > at) out.push({ from: at, to: Math.min(a, to) }); at = Math.max(at, b); }
  if (at < to) out.push({ from: at, to });
  return out.filter((g) => g.to - g.from > 1e-9);
}

/**
 * planRoom({ box, floorY, tableBounds, farTable, reserved, lamps }) -> the placement plan.
 *   box: { min: {x,y,z}, max: {x,y,z} }   tableBounds: { minX, maxX, minZ, maxZ }
 *   reserved: optional [{ wall, from, to, floor? }] wall spans the shell keeps for itself, in world metres along the wall
 *             (windows, doors, wall lamps). Nothing is placed there: not hung, not standing against the wall, not the bar;
 *             `floor: true` (a door) also keeps the floor in front of it free.
 *   lamps: optional [{ wall, at }] wall lamps of the shell: nothing is hung over one and no tall floor prop stands under one.
 * Returns { keep, strips, bar, far, slots, ceil, notes, reserved, lamps, hung } (`hung` fills as hangAt() places things).
 */
export function planRoom({ box, floorY = -0.79, tableBounds = null, farTable = true, reserved = [], lamps = [] } = {}) {
  const notes = [];
  let keep = tableBounds ? { ...tableBounds } : { minX: -1.45, maxX: 1.45, minZ: -0.82, maxZ: 0.82 };
  // a rectangle that hugs the table (no room for a player on any side) is taken as the bare table: add the playing clearance
  if (keep.maxX - keep.minX < 4.4 || keep.maxZ - keep.minZ < 3.2) {
    keep = { minX: keep.minX - CLEAR_TABLE, maxX: keep.maxX + CLEAR_TABLE, minZ: keep.minZ - CLEAR_TABLE, maxZ: keep.maxZ + CLEAR_TABLE };
    notes.push('tableBounds looked like the bare table: 1.6 m of playing clearance was added');
  }
  const cx = (keep.minX + keep.maxX) / 2, cz = (keep.minZ + keep.maxZ) / 2;
  const strips = {
    xp: box.max.x - keep.maxX, xn: keep.minX - box.min.x,
    zp: box.max.z - keep.maxZ, zn: keep.minZ - box.min.z,
  };
  const W = box.max.z - box.min.z;
  const ceil = box.max.y - floorY;
  const blocked = (wall, a, b, floorOnly = false) => reserved.some((r) => r.wall === wall && (!floorOnly || r.floor === true) && r.from < b && r.to > a);

  // ---- the far table
  let far = null;
  let farOn = null;
  if (farTable) {
    if (strips.zn >= FAR.width + 0.9) {
      // beside the main table, parallel to it; pushed toward the foot of the room so the standing view sees all of it
      const shift = clamp((strips.zn - FAR.width - 1.1) / 2, 0, 0.6);
      const x = clamp(cx + 1.2, box.min.x + FAR.length / 2 + 1.0, box.max.x - FAR.length / 2 - 1.0);
      far = { x, z: keep.minZ - FAR.width / 2 - shift, ry: 0, ceil };
      farOn = 'zn';
    } else {
      const lenWithFar = clamp(W - (0.9 + FAR.length + CLEAR_TABLE), 2.2, 4.4);
      const farMin = box.min.z + lenWithFar + 0.9;                    // the near end of the far table along the wall
      if (strips.xp >= FAR.width + 0.45 && farMin + FAR.length + 0.7 <= box.max.z && !blocked('xp', farMin, farMin + FAR.length, true)) {
        const spare = Math.max(0, box.max.z - (farMin + FAR.length) - CLEAR_TABLE);
        const shift = clamp((strips.xp - FAR.width - 1.1) / 2, 0, 0.6);
        far = { x: keep.maxX + FAR.width / 2 + shift, z: farMin + FAR.length / 2 + spare / 2, ry: Math.PI / 2, ceil, barLen: lenWithFar };
        farOn = 'xp';
      } else {
        notes.push(`no far table: the free strips are ${strips.zn.toFixed(2)} m (side) and ${strips.xp.toFixed(2)} m (foot) deep`);
      }
    }
  }

  // ---- the back bar on the 'xp' wall
  let bar = null;
  const d = strips.xp;
  if (d >= 0.45) {
    let cfg;
    if (d >= 2.24) cfg = { back: 0.45, counter: 0.55, overhang: 0.22, stools: true, aisle: clamp(d - (0.45 + 0.55 + 0.22 + 0.42), 0.6, 0.85) };
    else if (d >= 1.77) cfg = { back: 0.45, counter: 0.55, overhang: 0.22, stools: false, aisle: clamp(d - (0.45 + 0.55 + 0.22), 0.55, 0.85) };
    else if (d >= 1.4) cfg = { back: 0.36, counter: 0.46, overhang: 0.08, stools: false, aisle: clamp(d - (0.36 + 0.46 + 0.08), 0.5, 0.7) };
    else cfg = { back: Math.min(0.38, d - 0.05), counter: 0, overhang: 0, stools: false, aisle: 0 };
    cfg.total = cfg.back + cfg.aisle + cfg.counter + cfg.overhang + (cfg.stools ? 0.42 : 0);
    let len, z0;
    if (farOn === 'xp') { len = far.barLen; z0 = box.min.z; } else {
      // centred on the table's axis; snapped to a side wall that is nearly reached
      len = Math.min(clamp(W * 0.45, 2.2, 4.4), W - 0.6);
      z0 = clamp(cz - len / 2, box.min.z, box.max.z - len);
      if (z0 - box.min.z < 0.5) z0 = box.min.z;
      if (box.max.z - (z0 + len) < 0.5) z0 = box.max.z - len;
    }
    // the bar crosses no reserved span of its wall: it takes the free stretch nearest to where it wants to stand, and is
    // shortened to that stretch when the stretch is shorter (never under 2.2 m: then there is no bar)
    {
      const gaps = freeStretches('xp', box.min.z, box.max.z, reserved, (r) => (r.floor === true ? 0.35 : 0.1));
      const fits = (a, b) => gaps.some((g) => a >= g.from - 1e-9 && b <= g.to + 1e-9);
      if (!fits(z0, z0 + len)) {
        const want = z0 + len / 2;
        const usable = gaps.filter((g) => g.to - g.from >= 2.2)
          .map((g) => { const l = Math.min(len, g.to - g.from); const c = clamp(want, g.from + l / 2, g.to - l / 2); return { l, c, off: Math.abs(c - want) }; })
          .filter((g) => farOn !== 'xp' || g.c - g.l / 2 <= box.min.z + 1e-6) // the corner bar stays in its corner
          .sort((p, q) => (p.off + 1.5 * (len - p.l)) - (q.off + 1.5 * (len - q.l))); // near the axis, and long
        if (usable.length) {
          const pick = usable[0];
          if (pick.l < len - 1e-6) notes.push(`the bar is ${pick.l.toFixed(2)} m, not ${len.toFixed(2)} m: reserved wall spans leave no longer stretch`);
          len = pick.l; z0 = pick.c - pick.l / 2;
        } else { len = 0; notes.push('no bar: reserved wall spans leave no free stretch of 2.2 m on the foot wall'); }
      }
    }
    if (len > 0) {
      bar = {
        frame: wallFrame('xp', z0 + len / 2, box), len, cfg, ceil, from: z0, to: z0 + len,
        // which ends are open (get a return): not the one that meets a side wall
        ends: { lo: z0 - box.min.z > 0.05, hi: box.max.z - (z0 + len) > 0.05 },
      };
      if (!cfg.counter) notes.push('the bar is shelves only: no depth for a counter');
      else if (!cfg.stools) notes.push('the bar has no stools: they would stand inside the playing clearance');
    }
  } else {
    notes.push('no bar: no free depth behind the foot of the table');
  }
  const barFront = bar ? box.max.x - bar.cfg.total : box.max.x; // world x of the bar's customer side

  // ---- wall slots
  const slots = [];
  const used = new Set(); // one-off features already placed
  const UNIQUE = { seatNeonA: 'neonA', seatNeonB: 'neonB', neonB: 'neonB', rackChalk: 'chalk', plaque: 'plaque', clockStand: 'clock' };
  /**
   * Slots on wall span [a, b]. `recipes` are taken in order from the `fromB ? b : a` end by the slots whose wall is free; a slot
   * under a window gets seats only; a slot at a door gets nothing. `toward` = +1 / -1: the local-X side of the slot that faces
   * the bar (recipes put their lit sign on that side), 0 = none.
   */
  function addSlots(wall, a, b, depth, recipes, fromB, toward = 0) {
    const span = b - a;
    if (span < 0.9) return;
    const n = Math.max(1, Math.floor(span / SLOT));
    const width = span / n;
    const w = WALLS[wall];
    let next = 0;
    for (let i = 0; i < n; i++) {
      const k = fromB ? n - 1 - i : i;
      const lo = a + k * width, s = lo + width / 2;
      if (blocked(wall, lo + 0.1, lo + width - 0.1, true)) continue;       // a door
      const frame = wallFrame(wall, s, box);
      // three points on the front edge of what would stand on the floor here (0.6 m in front of the wall)
      let view = null;
      for (const t of [-0.45, 0, 0.45]) {
        const fx = frame.x + Math.sin(frame.ry) * 0.6 + w.ux * t * width, fz = frame.z + Math.cos(frame.ry) * 0.6 + w.uz * t * width;
        view = view ?? blocksView(fx, fz);
      }
      // the widest stretch of this slot's wall that no reserved span touches: what a recipe may use, on the wall and on the floor
      const gaps = freeStretches(wall, lo, lo + width, reserved, () => 0.04);
      const free = gaps.reduce((best, g) => (!best || g.to - g.from > best.to - best.from ? g : best), null);
      const freeWall = free ? free.to - free.from : 0;
      if (freeWall < 0.5) continue;                                          // the shell's wall: nothing here
      let recipe;
      if (freeWall < 1.0) recipe = 'frames';                                 // room for a picture, not for furniture
      else {
        recipe = recipes[next % recipes.length]; next += 1;
        const u = UNIQUE[recipe];
        if (u) { if (used.has(u)) recipe = 'seatFrames'; else used.add(u); }
      }
      slots.push({ wall, frame, s, lo, hi: lo + width, width, depth, clear: !view, blockedBy: view, recipe, toward, index: i, free: free ? { ...free } : null, gaps });
    }
  }
  if (bar && farOn !== 'xp') {
    // the foot wall on both sides of a centred bar: the lit signs go here first, next to the bar
    addSlots('xp', box.min.z + 0.4, bar.from - 0.5, strips.xp, ['seatNeonA', 'rackFrame', 'seatFrames'], true, 1);
    addSlots('xp', bar.to + 0.5, box.max.z - 0.4, strips.xp, ['seatNeonB', 'rackFrame', 'seatFrames'], false, -1);
    // the far side: behind the far table when there is one
    addSlots('zn', box.min.x + 0.4, box.max.x - 0.4, strips.zn,
      used.has('neonA') ? ['plantFrame', 'rackChalk', 'seatNeonB', 'seatFrames', 'plantFrame'] : ['seatNeonA', 'rackChalk', 'seatNeonB', 'plantFrame', 'seatFrames'], true, 0);
  } else {
    // the bar is in the 'zn' corner: the far side starts at the bar's customer side; the foot wall holds the far table
    addSlots('zn', box.min.x + 0.4, (bar ? barFront : box.max.x) - 0.45, strips.zn, ['seatNeonA', 'rackChalk', 'seatFrames', 'plantFrame', 'seatFrames'], true, 1);
    addSlots('xp', (bar ? bar.to : box.min.z) + 0.5, box.max.z - 0.4, far ? 0.3 : strips.xp, far ? ['rackFrame', 'neonB', 'frames'] : ['seatNeonB', 'seatFrames', 'rackFrame'], false, -1);
  }
  // behind the standing view, and behind the head of the table
  addSlots('zp', box.min.x + 0.4, box.max.x - 0.4, strips.zp, ['plantFrame', 'benchFrames', 'seatFrames', 'benchFrames', 'clockStand'], true, 0);
  addSlots('xn', box.min.z + 0.4, box.max.z - 0.4, strips.xn, ['seatFrames', 'plaque', 'rackFrame', 'seatFrames'], false, 0);

  // floor props of a slot must not stand under the far table's players
  if (far && farOn === 'zn') {
    for (const s of slots) {
      if (s.wall === 'zn' && s.hi > far.x - FAR.length / 2 - 0.3 && s.lo < far.x + FAR.length / 2 + 0.3) {
        s.depth = Math.min(s.depth, (far.z - FAR.width / 2) - box.min.z - 0.9);
      }
    }
  }
  return { keep, strips, bar, far, farOn, slots, ceil, notes, reserved, lamps, hung: { xp: [], xn: [], zp: [], zn: [] } };
}

const LAMP_CLEAR = 0.25;   // half-width of the wall a wall lamp keeps (its shade and its pool of light on the plaster)

/**
 * Where along a slot's wall a hung thing of half-width hw can go: the free position nearest to local offset x (steps of
 * 5 cm, up to 0.9 m away, at most 0.25 m past the slot's edge). Free = not on a reserved span (window, door, lamp), not over
 * a wall lamp, not across the bar, and not over anything hung before (the plan remembers what it placed). Returns the local
 * offset and records the span, or null when the wall has no room.
 */
export function hangAt(plan, slot, x, hw) {
  const w = WALLS[slot.wall];
  const sign = w.ux + w.uz;                       // world coordinate along the wall grows with local +X (+1) or against it (-1)
  const lim = slot.width / 2 + 0.25;
  const hung = plan.hung?.[slot.wall] ?? [];
  const bar = slot.wall === 'xp' && plan.bar ? plan.bar : null;
  for (let k = 0; k <= 36; k++) {
    const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
    const lx = x + dx;
    if (Math.abs(lx) + hw > lim) continue;
    const s = slot.s + sign * lx, a = s - hw, b = s + hw;
    if (plan.reserved.some((r) => r.wall === slot.wall && r.from < b + 0.04 && r.to > a - 0.04)) continue;
    if (plan.lamps.some((l) => l.wall === slot.wall && Math.abs(l.at - s) < hw + LAMP_CLEAR)) continue;
    if (bar && bar.from < b + 0.1 && bar.to > a - 0.1) continue;
    if (hung.some((h) => h.from < b + 0.06 && h.to > a - 0.06)) continue;
    hung.push({ from: a, to: b });
    return lx;
  }
  return null;
}

/**
 * Where a floor prop of half-width hw can stand against a slot's wall: the position nearest to local offset x inside the
 * slot whose footprint touches no reserved span (and, for a `tall` prop, is not under a wall lamp). Returns the local offset
 * or null. Nothing is recorded: a recipe plans its own floor.
 */
export function floorAt(plan, slot, x, hw, tall = false) {
  const w = WALLS[slot.wall];
  const sign = w.ux + w.uz;
  const lim = slot.width / 2 + 0.05;
  for (let k = 0; k <= 40; k++) {
    const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
    const lx = x + dx;
    if (Math.abs(lx) + hw > lim) continue;
    const s = slot.s + sign * lx, a = s - hw, b = s + hw;
    if (plan.reserved.some((r) => r.wall === slot.wall && r.from < b + 0.02 && r.to > a - 0.02)) continue;
    if (tall && plan.lamps.some((l) => l.wall === slot.wall && Math.abs(l.at - s) < hw + LAMP_CLEAR)) continue;
    return lx;
  }
  return null;
}

/**
 * Every span the plan put on a wall that touches a span the shell reserved (the audit of CONTRACT.md 8.6): the bar, what
 * hangAt() recorded, and `floor` = [{ wall, from, to, what }] the caller recorded for floor props. An empty list = strict.
 */
export function reservedConflicts(plan, floor = []) {
  const out = [];
  const hit = (wall, a, b, what, eps = 1e-6) => {
    for (const r of plan.reserved) if (r.wall === wall && r.from < b - eps && r.to > a + eps) out.push({ wall, what, from: +a.toFixed(3), to: +b.toFixed(3), reserved: [r.from, r.to] });
  };
  if (plan.bar) hit('xp', plan.bar.from, plan.bar.to, 'bar');
  for (const wall of Object.keys(plan.hung ?? {})) {
    for (const h of plan.hung[wall]) {
      hit(wall, h.from, h.to, 'hung');
      for (const l of plan.lamps) if (l.wall === wall && l.at > h.from && l.at < h.to) out.push({ wall, what: 'hung over a lamp', from: h.from, to: h.to, lamp: l.at });
    }
  }
  for (const f of floor) hit(f.wall, f.from, f.to, f.what ?? 'floor');
  return out;
}
