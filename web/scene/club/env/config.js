// Copyright (c) Meta Platforms, Inc. and affiliates.

// env/config.js — the reflection service's configuration: the tier knobs (tiers.js) after the `?clubenv=` tool override.
// Pure and free of three, so the node arm reads it (web/tools/club/test-club-core.mjs).

// How far the floor's varnish follows the floor's normal map (a varnish fills the grain and keeps the cupping of the boards).
export const FLOOR_COAT_FOLLOW = 0.35;

/**
 * `?clubenv=mirror:0,coat:0.5,coatr:0.1,box:0,live:1,amb:0` — a tool override of the tier knobs (on / off pairs for pictures
 * and counts): mirror (the planar floor mirror), mirrorfull (1 = the mirror draws the whole scene, not the reduced one), coat /
 * coatr (the varnish strength / roughness), box (the box-projected lookup and every patch of this service), live (the cube
 * re-capture while the cue moves; off on every tier), amb (the ambient cube: `env.ambient`, on on every tier).
 */
function overrides(query) {
  const out = {};
  const raw = query?.get?.('clubenv');
  if (typeof raw !== 'string') return out;
  for (const part of raw.split(',')) { const [k, v] = part.split(':'); if (k) out[k.trim()] = (v ?? '1').trim(); }
  return out;
}

/** The service's configuration from the tier knobs and the tool override. Pure (the node arm reads it). */
export function envConfig(knobs = {}, query = null) {
  const ov = overrides(query);
  const flag = (v, d) => (v === undefined ? d : !(v === '0' || v === 'off' || v === 'false'));
  const num = (v, d, lo, hi) => { const n = v === undefined || v === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const unit = (v, d) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);
  const box = flag(ov.box, knobs.envBox === true);
  return {
    box,
    live: box && flag(ov.live, knobs.envLive === true),
    mirror: box && flag(ov.mirror, knobs.floorMirror === true),
    mirrorScale: num(undefined, Number(knobs.mirrorScale) > 0 ? Math.min(1, Number(knobs.mirrorScale)) : 0.5, 0.1, 1),
    mirrorFull: flag(ov.mirrorfull, false),
    coat: box ? num(ov.coat, unit(knobs.floorCoat, 1), 0, 1) : 0,
    coatRoughness: num(ov.coatr, Number.isFinite(Number(knobs.floorCoatRoughness)) ? Math.min(1, Math.max(0.03, Number(knobs.floorCoatRoughness))) : 0.2, 0.03, 1),
    coatFollow: FLOOR_COAT_FOLLOW,
    // the ambient cube (env.ambient): six uniform values made from one small extra capture per bake; needs no patch, so it
    // does not depend on `box`
    ambient: flag(ov.amb, knobs.envAmbient !== false),
    overridden: Object.keys(ov),
  };
}

/**
 * Round A6 (CONTRACT.md 13.2; the arena venue only, read by env.js beside the venue test): the rail wood's corrected lookup
 * on a tier WITHOUT the box (lite). Such a tier reads the cube along the raw reflection direction; the cube is captured
 * under the lamp, so on the rail's outer roll that direction holds the hood's lit face where the dark hall should stand: a
 * broad bright band. With this on, the rail wood (not the apron, not a floor) takes the same patch the tiers with the box
 * put on it; the capture policy, the cube and every other material stay the tier's. Tools: `?clubenv=rail:1` / `rail:0`.
 * Measured at V1, cell (640,640 80x80), on the tree of 2026-11-15 13:07Z-13:36Z WITHOUT a baked map (jobs r1, r2, r3):
 * high 80.0, lite 105.2, lite with this 77.9.
 */
export const HALL_RAIL = Object.freeze({ on: true });
export function hallRailWanted(query = null) {
  const v = overrides(query).rail;
  return v === undefined ? HALL_RAIL.on === true : !(v === '0' || v === 'off' || v === 'false');
}

/**
 * Round A7 (CONTRACT.md 19.1; the arena venue only, read by env.js beside the venue test): the hall's baked reflection
 * as a service (env/hallcube.js: `club.env.hall`). `on`: the service exists under the arena (false: no module is
 * requested, no member is added; tools: `?clubenv=hall:1`). `file`: ask for the light role's baked cube (false: the
 * stand-in only, no request; tools: `?clubenv=hall:standin` forces the stand-in, `hall:file` the file). `hall:0` turns
 * the service off. Returns 'off' | 'standin' | 'file'. Pure.
 */
export const HALL_CUBE = Object.freeze({ on: true, file: true });
export function hallEnvWanted(query = null) {
  const v = overrides(query).hall;
  if (v === undefined) return HALL_CUBE.on === true ? (HALL_CUBE.file === true ? 'file' : 'standin') : 'off';
  if (v === '0' || v === 'off' || v === 'false') return 'off';
  if (v === 'standin') return 'standin';
  if (v === 'file') return 'file';
  return HALL_CUBE.file === true ? 'file' : 'standin';
}
