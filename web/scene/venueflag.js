// Copyright (c) Meta Platforms, Inc. and affiliates.

// venueflag.js — the venue-lighting lane's ONE switch, readable by modules that must not import
// lightingvisuals.js (gi.js, shading.js, ballset.js). `?venue=off` or `?venue=0` → false: main's rig, room
// dressing AND ball shading, byte for byte (the identity fence's contract). Anything else (absent, `all`, …) → true.
// Mirrors lightingvisuals.js's rule (`venue.on` from ?venue=off|0, default on; ?venue=all includes HELD terms).
// ORDER-LIGHT-FIX6 (review r10 P2, the one-stale-leaf contract): the ONE handshake value every participating venue leaf exports
// (gi.js, shading.js, room.js, look.js, lightingvisuals.js, occlusionlut.js, app/ballset.js and this switch). main.js — the owner —
// enables the venue path only when every loaded participant reports exactly this integer; any absent or older value = the legacy
// path for ALL leaves. This module is a NEW leaf: main.js loads it through a feature-detected DYNAMIC import (never a static edge on
// the boot graph — the FIX5 P1 class) and injects it into shading.js / gi.js only on a consistent tree.
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)

export const VENUE_SHADING = (() => {
  try {
    const f = new URLSearchParams(location.search).get('venue');
    return !(f === 'off' || f === '0');
  } catch { return true; }
})();

// ORDER-LAND-638-FIX3 (review r7 P2 #1 / #4): the switch is LIVE for the DEGRADE path only. When the venue leaf is stale or
// missing, or its fill cannot be derived (no float render target), main.js turns the WHOLE feature off so the frame equals
// main's (`?venue=off`): consumers (gi.js, shading.js) read venueShading() at apply / compile time and recompile. Boot-time
// behaviour is unchanged (the const above); a stale consumer that only imports the const keeps it (cache-poison contract).
let live = VENUE_SHADING;
const subs = new Set();
export function venueShading() { return live; }
export function setVenueShading(on) {
  const v = !!on;
  if (v === live) return live;
  live = v;
  for (const cb of subs) { try { cb(v); } catch { /* a listener must not break the degrade */ } }
  return live;
}
export function onVenueShading(cb) { subs.add(cb); return () => subs.delete(cb); }
