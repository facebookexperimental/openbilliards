// Copyright (c) Meta Platforms, Inc. and affiliates.

// equipmentalias.js - equipment id aliases shared by the settings store and the
// scene boot mirror. No imports: both consumers reach it through a namespace
// import and degrade to identity when an export is missing.
// Old table ids that the served catalog renames (ui_hidden + superseded_by):
// old id -> neutral id. A node drift test compares this map with the catalog.
export const TABLE_RENAMES = Object.freeze({
  diamond_redlabel_9ft: 'pool_pro_9ft_older_gen',
  diamond_proam_9ft: 'pool_pro_9ft',
  predator_apex_9ft: 'pool_pro_9ft_metal_rim',
  rasson_ox_9ft: 'pool_pro_9ft_k55',
  diamond_proam_8ft: 'pool_pro_8ft',
  diamond_proam_7ft: 'pool_pro_7ft',
});
// The digest alias rows: a copy of the SDK's alias digest table (same row
// shape). Each row maps the FNV-1a 64 digest of a retired id to its twin, so
// no retired id is served in plain text. A node drift test deep-equals this
// copy with the SDK table.
export const ALIAS_DIGESTS = Object.freeze([
  Object.freeze({ axis: 'table', digest: '8223852648be1aa5', neutral_id: 'pool_pro_9ft_measured' }),
  Object.freeze({ axis: 'cloth', digest: '906c9b774047f8a4', neutral_id: 'pool_worsted_measured' }),
]);
const FNV1A64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV1A64_PRIME = 0x100000001b3n;
// FNV-1a 64 over the UTF-8 bytes of s, as 16 lowercase hex digits.
export function fnv1a64Hex(s) {
  let h = FNV1A64_OFFSET_BASIS;
  for (const b of new TextEncoder().encode(s)) {
    h = BigInt.asUintN(64, (h ^ BigInt(b)) * FNV1A64_PRIME);
  }
  return h.toString(16).padStart(16, '0');
}
// The twin a row of `rows` maps `id` to on `axis` (an equipment axis such as
// 'table_id'), or undefined. Pure: the drift test drives it with a synthetic row.
export function aliasDigestTarget(rows, axis, id) {
  if (typeof id !== 'string' || typeof axis !== 'string' || !axis.endsWith('_id')) return undefined;
  const kernelAxis = axis.slice(0, -3); const digest = fnv1a64Hex(id);
  return rows.find((r) => r.axis === kernelAxis && r.digest === digest)?.neutral_id;
}
// The twin on a digest hit, else the id itself (any value, unchanged).
export function canonicalEquipmentId(axis, id) {
  return aliasDigestTarget(ALIAS_DIGESTS, axis, id) ?? id;
}
// The neutral table id for a renamed old table id, else the id itself.
export function renamedTableId(id) {
  return typeof id === 'string' && Object.hasOwn(TABLE_RENAMES, id) ? TABLE_RENAMES[id] : id;
}
