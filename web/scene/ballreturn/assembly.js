// Copyright (c) Meta Platforms, Inc. and affiliates.

// assembly.js — V18, the POCKET-ASSEMBLY declaration of a table (order 21, ruling 1).
//
// A ball legitimately enters the pocket assembly — that is what a pocket is — so the cup, the well,
// the bag and its net are not "furniture" for the ENTRY segment of a runway. A table declares its
// pocket-assembly meshes by name (or, for an unnamed mesh, by its parent, geometry and world box),
// MODEL / PHOTO / DERIVED-tagged like every other read; V16 (furniture.js) treats those meshes as
// PASSABLE only from the capture point to the first station whose sphere is clear of every declared
// assembly mesh — measured per runway, never a constant — and as furniture again beyond it. Never a
// global exemption; a solid the model uses where the real table is hollow (the wpa middle-pocket well,
// a 137 × 200 mm cylinder) is recorded as `solid_simplification: true` so the modelling lane sees it.
//
// Ownership: a table with a craft lane (the XW101's snooker bed, the Diamond) declares through its
// lane; main's generic wpa bed is declared here as fixture geometry, DERIVED from the built model.
// The declaration lives at ./assemblies/<tableId>.json; none = the assembly is furniture (V16 as ruled).
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const KINDS = new Set(['cup', 'well', 'bag', 'net', 'skirt', 'ring', 'liner', 'other']);
const TAGS = new Set(['MODEL', 'PHOTO', 'DERIVED', 'TEST']);
const fail = (msg) => { throw new Error(`ball-return assembly declaration refused [V18]: ${msg}`); };

/** Validate a declaration; returns { tableId, meshes: [{ id, kind, name?, match?, solidSimplification, provenance }], doc }. */
import { tableIdsMatch } from './tableid.js'; // the ONE catalog identity comparison, the track's own (#707 prep FIX7 B)

const sameTable = (specs, declared, active) => (specs ? tableIdsMatch(specs, declared, active) === true : declared === active);

export function validateAssembly(def, { tableId = null, specs = null } = {}) {
  if (!def || typeof def !== 'object') fail('not an object');
  if (def.schema !== 'ball-return-assembly/1.0') fail(`schema '${def.schema}' is not ball-return-assembly/1.0`);
  if (typeof def.table_id !== 'string' || !def.table_id) fail('table_id required');
  if (tableId && !sameTable(specs, def.table_id, tableId)) fail(`declared for ${def.table_id}, loaded for ${tableId}`); // through the catalog identity (FIX7 B), the same as V17's
  if (!def.provenance || !TAGS.has(def.provenance.tag) || typeof def.provenance.source !== 'string' || def.provenance.source.length < 12) fail('provenance { tag: MODEL|PHOTO|DERIVED|TEST, source } required');
  if (!Array.isArray(def.meshes) || def.meshes.length === 0) fail('meshes: a non-empty array');
  const ids = new Set();
  const meshes = def.meshes.map((m, i) => {
    if (!m || typeof m !== 'object') fail(`meshes[${i}]: not an object`);
    if (typeof m.id !== 'string' || !NAME_RE.test(m.id)) fail(`meshes[${i}]: id required`);
    if (ids.has(m.id)) fail(`meshes[${i}]: duplicate id ${m.id}`);
    ids.add(m.id);
    if (!KINDS.has(m.kind)) fail(`meshes.${m.id}: kind must be one of ${[...KINDS].join(' | ')}`);
    const hasName = typeof m.name === 'string', hasMatch = m.match && typeof m.match === 'object';
    if (hasName === hasMatch) fail(`meshes.${m.id}: exactly one of name | match`);
    if (hasName && !NAME_RE.test(m.name)) fail(`meshes.${m.id}: '${m.name}' is not a mesh name`);
    let match = null;
    if (hasMatch) {
      const q = m.match;
      if (typeof q.parent !== 'string' || !NAME_RE.test(q.parent)) fail(`meshes.${m.id}.match: parent (a group name) required`);
      if (typeof q.geometry !== 'string' || !/^[A-Za-z]+Geometry$/.test(q.geometry)) fail(`meshes.${m.id}.match: geometry (a three geometry type) required`);
      const v3 = (a, what) => { if (!Array.isArray(a) || a.length !== 3 || !a.every((x) => Number.isFinite(x))) fail(`meshes.${m.id}.match: ${what} must be [x, y, z] in mm`); return a.map((x) => x / 1000); };
      const center = v3(q.center_mm, 'center_mm'), size = v3(q.size_mm, 'size_mm');
      const tol = Number.isFinite(q.tolerance_mm) ? q.tolerance_mm / 1000 : 0.003;
      if (!(tol > 0 && tol <= 0.02)) fail(`meshes.${m.id}.match: tolerance_mm in (0, 20]`);
      match = { parent: q.parent, geometry: q.geometry, center, size, tol };
    }
    if (m.solid_simplification !== undefined && typeof m.solid_simplification !== 'boolean') fail(`meshes.${m.id}: solid_simplification must be a boolean`);
    if (!m.provenance || !TAGS.has(m.provenance.tag) || typeof m.provenance.source !== 'string' || m.provenance.source.length < 12) fail(`meshes.${m.id}: provenance { tag, source } required`);
    return { id: m.id, kind: m.kind, name: hasName ? m.name : null, match, solidSimplification: m.solid_simplification === true, provenance: m.provenance };
  });
  return { tableId: def.table_id, meshes, doc: def.doc ?? null, provenance: def.provenance };
}

/** A matcher over (mesh object, world AABB) → the declared entry it satisfies, or null. */
export function assemblyMatcher(decl) {
  if (!decl) return () => null;
  return (o, bb) => {
    for (const m of decl.meshes) {
      if (m.name) { if (o.name === m.name) return m; continue; }
      const q = m.match;
      if ((o.parent?.name || '') !== q.parent) continue;
      if (!o.geometry || o.geometry.type !== q.geometry) continue;
      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      if (Math.abs(cx - q.center[0]) > q.tol || Math.abs(cy - q.center[1]) > q.tol || Math.abs(cz - q.center[2]) > q.tol) continue;
      if (Math.abs(sx - q.size[0]) > 2 * q.tol || Math.abs(sy - q.size[1]) > 2 * q.tol || Math.abs(sz - q.size[2]) > 2 * q.tol) continue;
      return m;
    }
    return null;
  };
}

