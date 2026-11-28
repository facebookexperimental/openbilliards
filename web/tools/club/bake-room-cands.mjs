// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-room-cands.mjs — candidates of the club room's light balance, for web/tools/club/bake-room.html?cands=<set> (room role).
//
// A candidate is a set of the numbers that decide how the room's own light is shared between the walls, the ceiling and the
// floor: the wall lamps (level, source size, beam share, reach, open axis), the floor's tint over its scan, a gain on the
// plaster's paint, the constant house light of the bake (bake-room-scene.mjs BAKE_AMBIENT) and the level of the main lamp's
// spill emitter. The page applies each candidate to the ONE room it built (emitter records, material colours), bakes it at a
// reduced size, and shows all of them side by side. Nothing here is read by the app or by a bake that makes a file: the
// chosen numbers are written into room/shell.js and bake-room-scene.mjs by hand.
// Pure data and three small functions; no imports.

const R2_HOUSE = { sky: [0.52, 0.43, 0.33], ground: [0.38, 0.32, 0.25], side: [0.80, 0.64, 0.49] };
const R2_FLOOR = [0.85, 0.80, 0.76];
const R2_SCONCE = { intensity: 8.0, source: 0.85, beam: 0.66, reach: 6.0, up: false };
const scale = (a, k) => a.map((v) => +(v * k).toFixed(4));
/** The house light from its three levels on the red channel (the warm tint of round 2 kept). */
const house = (sky, ground, side) => ({ sky: scale(R2_HOUSE.sky, sky / R2_HOUSE.sky[0]), ground: scale(R2_HOUSE.ground, ground / R2_HOUSE.ground[0]), side: scale(R2_HOUSE.side, side / R2_HOUSE.side[0]) });
const floorTint = (k) => scale(R2_FLOOR, k);

export const CANDIDATE_SETS = {
  // round 3, first pass: the reach and the direction of the wall lamps, a lighter floor, the house light moved from the floor
  // to the walls and the ceiling
  r3a: [
    { name: 'A  round 2 as shipped (6 m, floor x1)', sconce: { ...R2_SCONCE }, floor: R2_FLOOR, house: R2_HOUSE, band: 0.5, plaster: 1 },
    { name: 'B  2.4 m, floor x1.5', sconce: { ...R2_SCONCE, reach: 2.4 }, floor: floorTint(1.5), house: R2_HOUSE, band: 0.5, plaster: 1 },
    { name: 'C  3.4 m, floor x1.5, house .30/.55/1.05', sconce: { ...R2_SCONCE, reach: 3.4 }, floor: floorTint(1.5), house: house(0.30, 0.55, 1.05), band: 1.5, plaster: 1 },
    { name: 'D  up 6 / 3.0 m, floor x1.5, house as C', sconce: { intensity: 6, source: 0.7, beam: 0.66, reach: 3.0, up: true }, floor: floorTint(1.5), house: house(0.30, 0.55, 1.05), band: 1.5, plaster: 1 },
    { name: 'E  up 7 / 3.6 m, floor x1.5, house .36/.60/1.15', sconce: { intensity: 7, source: 0.7, beam: 0.66, reach: 3.6, up: true }, floor: floorTint(1.5), house: house(0.36, 0.60, 1.15), band: 1.5, plaster: 1 },
    { name: 'F  as D, floor x1.3, paint x1.35', sconce: { intensity: 6, source: 0.7, beam: 0.66, reach: 3.0, up: true }, floor: floorTint(1.3), house: house(0.30, 0.55, 1.05), band: 1.5, plaster: 1.35 },
  ],
  // round 3, second pass: wall lamps that open upward and reach less far, the house light moved off the floor, and the main
  // lamp's pool with the luminaire's real cut-off and a gain (`pool`: [t0, t1, gain] of room/light.js POOL)
  r3b: [
    { name: 'A  round 2 as shipped', sconce: { ...R2_SCONCE }, floor: R2_FLOOR, house: R2_HOUSE, band: 0.5, plaster: 1, pool: [0.75, 2.1, 1] },
    { name: 'G  up 6/2.6 m, house .25/.60/1.05, pool x1.8', sconce: { intensity: 6, source: 0.7, beam: 0.66, reach: 2.6, up: true }, floor: floorTint(1.5), house: house(0.25, 0.60, 1.05), band: 2.0, plaster: 1, pool: [0.75, 8, 1.8] },
    { name: 'H  up 7/2.6 m, house .25/.70/1.25, pool x1.8', sconce: { intensity: 7, source: 0.7, beam: 0.66, reach: 2.6, up: true }, floor: floorTint(1.5), house: house(0.25, 0.70, 1.25), band: 2.0, plaster: 1, pool: [0.75, 8, 1.8] },
    { name: 'I  up 6/3.0 m, house .22/.60/1.05, pool x1.8', sconce: { intensity: 6, source: 0.7, beam: 0.66, reach: 3.0, up: true }, floor: floorTint(1.5), house: house(0.22, 0.60, 1.05), band: 2.0, plaster: 1, pool: [0.75, 8, 1.8] },
    { name: 'J  as G, pool x1.3', sconce: { intensity: 6, source: 0.7, beam: 0.66, reach: 2.6, up: true }, floor: floorTint(1.5), house: house(0.25, 0.60, 1.05), band: 2.0, plaster: 1, pool: [0.75, 8, 1.3] },
    { name: 'K  as G, paint x1.35, pool x2.3', sconce: { intensity: 6, source: 0.7, beam: 0.66, reach: 2.6, up: true }, floor: floorTint(1.5), house: house(0.25, 0.60, 1.05), band: 2.0, plaster: 1.35, pool: [0.75, 8, 2.3] },
  ],
};

/** Points on the floor (world x, z) where a candidate's baked light is read against the main lamp's own. */
export const FLOOR_PROBES = Object.freeze({
  south1m: [0, 1.8],          // 1 m south of the long rail: inside the lamp's pool
  south2m: [0, 2.8],          // 2 m south of it, 0.8 m from the south wall
  southWallFoot: [1.02, 3.35], // under a south wall lamp
  west1m: [-2.45, 0],         // 1 m beyond the head rail
  west2p5m: [-3.95, 0],       // 2.5 m beyond it
  north1m: [0, -1.8],
  southWest: [-2.6, 1.9],     // the open floor between the V10 camera and the table
  farCorner: [-4.4, -4.6],    // open floor in the north-west, far from the table
  barSide: [2.35, 0.9],       // between the table and the bar
});

/**
 * Apply a candidate to a built room: the wall lamps' emitter records, the main lamp's spill emitter, the floor's tint and the
 * plaster's gain. Returns the house light for the bake ({ sky, ground, side }) or null (the tool's own).
 */
export function applyCandidate(room, c) {
  for (const e of room.light.emitters) {
    if (c.sconce && /^shell\.sconce\./.test(e.id)) {
      e.intensity = c.sconce.intensity; e.radius = c.sconce.reach; e.size = [c.sconce.source, c.sconce.beam];
      e.axis?.set(0, c.sconce.up ? 1 : -1, 0);
    }
    if (e.id === 'lamp.band' && Number.isFinite(c.band)) e.intensity = c.band;
  }
  room.light.commit();
  if (Array.isArray(c.floor)) room.floor.material.color.setRGB(c.floor[0], c.floor[1], c.floor[2]);
  const plaster = room.shell?.meshes?.plaster?.material;
  if (plaster && Number.isFinite(c.plaster)) plaster.color.setScalar(c.plaster);
  if (Array.isArray(c.pool)) room.light.setPool({ t0: c.pool[0], t1: c.pool[1], strength: 1, gain: c.pool[2] ?? 1 });
  return c.house ?? null;
}

/**
 * The main lamp's own light on the floor at world (x, z), without the table in the way: the irradiance of a uniform
 * rectangle (the lamp's emitter rectangle at its height, radiance = the luminance of colour x intensity) by a 24 x 8 point
 * sum, times the pool the shade leaves open (room/light.js clubRoomLampPool). The same units as the baked map.
 */
export function lampOnFloor(rect, floorY, x, z, lamp, pool) {
  const c = lamp.color, L = lamp.intensity * (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
  const h = rect.y - floorY, NX = 24, NZ = 8;
  let sum = 0;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const dx = rect.cx + ((i + 0.5) / NX * 2 - 1) * rect.hx - x, dz = rect.cz + ((j + 0.5) / NZ * 2 - 1) * rect.hz - z;
    const d2 = dx * dx + dz * dz + h * h;
    sum += (h * h) / (d2 * d2); // cos at the lamp x cos at the floor / d^2
  }
  const E = L * sum * (4 * rect.hx * rect.hz) / (NX * NZ);
  const ex = Math.max(Math.abs(x - rect.cx) - rect.hx, 0), ez = Math.max(Math.abs(z - rect.cz) - rect.hz, 0);
  const t = Math.hypot(ex, ez) / Math.max(h, 1e-3);
  const s = Math.min(1, Math.max(0, (t - pool.t0) / (pool.t1 - pool.t0)));
  return E * (pool.gain ?? 1) * (1 - (pool.strength ?? 1) * s * s * (3 - 2 * s));
}
