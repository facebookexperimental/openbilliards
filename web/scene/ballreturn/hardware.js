// Copyright (c) Meta Platforms, Inc. and affiliates.

// hardware.js — V17, the track's OWN HARDWARE declared by mesh name, as a COMPANION file (order 21 item 2, SNK-R29).
//
// The wires the ball rides, the ring it passes through, the strap and clamp at the run's end are the TRACK, built by the
// table lane for this track: V16 (furniture.js) reads them apart from the table body — never a violation, measured as the
// ball's closest approach (`ownHardware`, the seat-consistency read). The published track schema (V0, track-schema.js) has
// root additionalProperties:false and no `hardware` slot — the snooker lane proved with this lane's own validator that a
// track JSON carrying the block is refused by V0 before V17 runs (§R3c.33.1) — so the declaration travels as a companion,
// ./hardware/<trackId>.json, like the pocket assembly's ./assemblies/<tableId>.json (V18); the track JSON stays byte-identical
// to its owner's export (gate t6d). None = no hardware declared; an invalid one refuses the track (fail-closed).
//
// The same companion carries the track's ENVIRONMENT DECLARATION (#737 r8 class C): the scene meshes that are an environment
// rather than table body — the room, a floor, a backdrop. V16 used to decide that by ENCLOSURE (a mesh whose box holds every
// station is "a container"), which a solid leg or support around a single-pocket chute satisfies just as well as a room: the
// inside test was then switched off and the ball sat deep inside a solid with nothing within r of its centre. Enclosure is not
// a class; the class is declared (or read from the mesh's own open-shell property, back-side materials). An UNDECLARED
// enclosing solid is a collision.
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const TAGS = new Set(['MFR', 'MODEL', 'PHOTO', 'DERIVED', 'TEST']);
const fail = (msg) => { throw new Error(`ball-return hardware declaration refused [V17]: ${msg}`); };

/** Validate a companion; returns { trackId, tableId, meshNames, environmentMeshNames, meshes: [{ name, role?, solidSimplification }], omissions, provenance, doc }. */
import { tableIdsMatch } from './tableid.js'; // the ONE catalog identity comparison, the track's own (#707 prep FIX7 B)

/** The companion's table against the active one: through the catalog when given (an alias IS its canonical table — one spec
 * object under two ids), the raw id otherwise (a caller without the catalog, the node rows). */
const sameTable = (specs, declared, active) => (specs ? tableIdsMatch(specs, declared, active) === true : declared === active);

export function validateHardware(def, { trackId = null, tableId = null, specs = null } = {}) {
  if (!def || typeof def !== 'object') fail('not an object');
  if (def.schema !== 'ball-return-hardware/1.0') fail(`schema '${def.schema}' is not ball-return-hardware/1.0`);
  if (typeof def.track_id !== 'string' || !def.track_id) fail('track_id required');
  if (trackId && def.track_id !== trackId) fail(`declared for ${def.track_id}, loaded for ${trackId}`);
  if (def.table_id !== undefined && tableId && !sameTable(specs, def.table_id, tableId)) fail(`declared for table ${def.table_id}, loaded on ${tableId}`); // through the catalog identity (FIX7 B): a companion declaring the canonical id installs on its alias; a foreign id keeps this text
  if (!def.provenance || !TAGS.has(def.provenance.tag) || typeof def.provenance.source !== 'string' || def.provenance.source.length < 12) fail('provenance { tag: MFR|MODEL|PHOTO|DERIVED|TEST, source } required');
  if (!Array.isArray(def.mesh_names) || def.mesh_names.length === 0) fail('mesh_names must be a non-empty array of mesh names');
  const meshNames = [];
  for (const n of def.mesh_names) { if (typeof n !== 'string' || !NAME_RE.test(n)) fail(`mesh_names: '${n}' is not a mesh name`); if (meshNames.includes(n)) fail(`mesh_names: '${n}' twice`); meshNames.push(n); }
  const meshes = [];
  if (def.meshes !== undefined) {
    if (!Array.isArray(def.meshes)) fail('meshes must be an array');
    for (const m of def.meshes) {
      if (!m || typeof m !== 'object' || typeof m.name !== 'string' || !meshNames.includes(m.name)) fail(`meshes: every entry names one of mesh_names (${m && m.name})`);
      if (m.solid_simplification !== undefined && typeof m.solid_simplification !== 'boolean') fail(`meshes.${m.name}: solid_simplification must be a boolean`);
      meshes.push({ name: m.name, role: typeof m.role === 'string' ? m.role : null, solidSimplification: m.solid_simplification === true });
    }
  }
  // the environment declaration (#737 r8 class C): optional, the meshes V16 must NOT treat as table body — never one of the
  // track's own hardware meshes (that is the other list), never a duplicate
  const environmentMeshNames = [];
  if (def.environment_mesh_names !== undefined) {
    if (!Array.isArray(def.environment_mesh_names)) fail('environment_mesh_names must be an array of mesh names');
    for (const n of def.environment_mesh_names) {
      if (typeof n !== 'string' || !NAME_RE.test(n)) fail(`environment_mesh_names: '${n}' is not a mesh name`);
      if (environmentMeshNames.includes(n)) fail(`environment_mesh_names: '${n}' twice`);
      if (meshNames.includes(n)) fail(`environment_mesh_names: '${n}' is already declared as the track's own hardware`);
      environmentMeshNames.push(n);
    }
  }
  const omissions = Array.isArray(def.omissions) ? def.omissions.filter((x) => typeof x === 'string') : [];
  return { trackId: def.track_id, tableId: def.table_id ?? null, meshNames, environmentMeshNames, meshes, omissions, provenance: def.provenance, doc: def.doc ?? null };
}
