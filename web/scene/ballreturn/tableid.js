// Copyright (c) Meta Platforms, Inc. and affiliates.

// tableid.js — the ONE catalog identity comparison for a table id (#707 prep FIX7 B, review 707m7 P2-2).
// A track, a hardware companion (V17) and a pocket-assembly companion (V18) all name a table; the catalog (`TABLE_SPECS`)
// aliases some ids onto one spec object (pool_pro_9ft_measured IS the pool_pro_9ft spec), so two ids are the same
// table iff the catalog binds them to the same object — never by the raw id string (review r3 P2). Lives in its own leaf so
// index.js (the track's check), hardware.js and assembly.js import the same function; never a second alias table.
/** Returns true, false, or 'unknown' when the declared id is one the catalog does not carry (specFor() would silently fall
 * back to the pin table — that fallback must never grant a match). Without a catalog, the raw string compare. */
export function tableIdsMatch(specs, trackTableId, activeId) {
  if (typeof trackTableId !== 'string' || typeof activeId !== 'string') return false;
  if (specs && typeof specs === 'object') {
    const has = (k) => Object.prototype.hasOwnProperty.call(specs, k) && !!specs[k]; // own keys: 'constructor' / '__proto__' are unknown ids
    if (!has(trackTableId)) return 'unknown';
    if (!has(activeId)) return false;
    return specs[trackTableId] === specs[activeId];
  }
  return trackTableId === activeId;
}

/** The catalog's CANONICAL id for a table: the first key bound to the same spec object (the catalog defines a table under its
 * canonical id before aliasing it — table.js binds `pool_pro_9ft_measured` to the `pool_pro_9ft` spec after `pool_pro_9ft`).
 * Without a catalog, or for an id it does not carry, the id itself. Companion FILES live under the canonical id
 * (`assemblies/<canonical>.json`), so an alias table reads its canonical table's declaration (#707 prep FIX7 B). */
export function canonicalTableId(specs, id) {
  if (typeof id !== 'string' || !specs || typeof specs !== 'object') return id;
  const has = (k) => Object.prototype.hasOwnProperty.call(specs, k) && !!specs[k];
  if (!has(id)) return id;
  for (const k of Object.keys(specs)) if (has(k) && specs[k] === specs[id]) return k;
  return id;
}
