// Copyright (c) Meta Platforms, Inc. and affiliates.

// Landing pass for the JOY furniture revision: derive the FIX28/FIX29 pin
// dispositions from the emitted geometry of the current tree. CPU builder
// only; no browser. Every number printed here is DERIVED from emitted world
// vertices or material fields; nothing is copied from the superseded census.
//
// Usage: node --experimental-vm-modules tools/render/ghcn8/derive_landing_pins.mjs [--out fresh.json] [--write-definition] [--write-occluders]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTransportInputs } from './cpu_table_inputs.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ALIASES = Object.freeze(['chinese8_pro_9ft', 'joy_q8_9ft']);
export const QUANTUM_MM = 1000 * 2 ** -23;
// Source anchors of the superseded FIX29 red arms and their replacements.
export const SOURCE_ANCHORS = Object.freeze({
  fascia_height: /fasciaHeight: 0\.0654455198268036/g,
  apron_height_constant: /apronHeight: 0\.12673309261268662/g,
  retired_closure_anchor: /const plateY1 = cn8ApronBottomY\(G\);/g,
  retired_mount_anchor: /const legHeadTop = cn8ApronBottomY\(G\);/g,
  closure_ends_with_fascia: /const plateY1 = apronTop - beamD;/g,
});
const round = value => Math.round(value * 1e6) / 1e6;

export function materialPins(material) {
  return { name: material.name, variant: material.userData?.cn8LeatherVariant ?? null,
    color: material.color?.getHexString(), emissive: material.emissive?.getHexString(),
    emissiveIntensity: material.emissiveIntensity, roughness: material.roughness,
    clearcoat: material.clearcoat, clearcoatRoughness: material.clearcoatRoughness,
    maps: { map: Boolean(material.map), normalMap: Boolean(material.normalMap),
      roughnessMap: Boolean(material.roughnessMap), bumpMap: Boolean(material.bumpMap) } };
}

export function inspectLanding(built, tableId) {
  const { group, THREE, G } = built;
  group.updateMatrixWorld(true);
  const box = object => new THREE.Box3().setFromObject(object);
  const meshes = [];
  group.traverse(object => { if (object.isMesh) meshes.push(object); });
  const byName = name => meshes.filter(mesh => mesh.name === name);
  const railSeatMm = (G.render.railSeatY ?? 0.006) * 1000;
  const boards = meshes.filter(mesh => /^cn8-beam-(?:long|end)-/.test(mesh.name)).map(mesh => {
    const b = box(mesh), size = b.getSize(new THREE.Vector3());
    return { name: mesh.name, bottom_y_mm: round(b.min.y * 1000), top_y_mm: round(b.max.y * 1000),
      height_mm: round(size.y * 1000), thickness_mm: round((mesh.name.includes('-end-') ? size.x : size.z) * 1000) };
  });
  const plates = meshes.filter(mesh => mesh.name.startsWith('cn8-railend-plate-'))
    .map(mesh => ({ name: mesh.name, bottom_y_mm: round(box(mesh).min.y * 1000) }));
  const fasciaBottom = Math.max(...boards.map(row => row.bottom_y_mm));
  const corners = [0, 2, 3, 5].map(pocket => {
    const hem = box(byName(`cn8r82-ring-${pocket}`)[0]);
    return { pocket, hem_y_mm: round(hem.min.y * 1000), hem_below_fascia_mm: round(fasciaBottom - hem.min.y * 1000) };
  });
  const middles = [1, 4].map(pocket => {
    const hem = box(byName(`cn8-mid-leather-skirt-${pocket}`)[0]);
    return { pocket, hem_y_mm: round(hem.min.y * 1000), hem_below_fascia_mm: round(fasciaBottom - hem.min.y * 1000) };
  });
  const leather = meshes.filter(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .some(material => typeof material.name === 'string' && material.name.startsWith('cn8-pocket-leather')))
    .map(mesh => ({ name: mesh.name, slots: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(materialPins) }));
  const heads = meshes.filter(mesh => mesh.userData.cn8Part === 'head').map(mesh => {
    const b = box(mesh); return { name: mesh.name, bottom_y_mm: round(b.min.y * 1000), top_y_mm: round(b.max.y * 1000) };
  });
  const furniture = group.userData.cn8Furniture ?? null;
  const headTops = heads.map(row => row.top_y_mm);
  return { table: tableId, actual_table_id: group.userData.tableId ?? built.activeTableId?.() ?? null,
    head_top_y_mm: headTops.length === 6 && headTops.every(value => Math.abs(value - headTops[0]) <= QUANTUM_MM)
      && furniture && Math.abs(furniture.headTop * 1000 - headTops[0]) <= QUANTUM_MM ? headTops[0] : null,
    mesh_count: meshes.length, rail_seat_y_mm: railSeatMm,
    retired_constructions: { 'cn8-blind-*': meshes.filter(m => /^cn8-blind-/.test(m.name)).length,
      'cn8r82-endwrap-*': meshes.filter(m => /^cn8r82-endwrap-/.test(m.name)).length,
      lowest_emitted_y_mm: round(Math.min(...meshes.map(m => box(m).min.y)) * 1000),
      meshes_at_fix29_apron_bottom: meshes.filter(m => Math.abs(box(m).min.y * 1000 + 120.73309261268662) <= QUANTUM_MM).length },
    fascia: { boards, bottom_y_mm: fasciaBottom, height_mm: round(railSeatMm - fasciaBottom), plates },
    corners, middles, leather, heads,
    furniture: furniture && { fasciaOuter_mm: furniture.fasciaOuter.map(v => round(v * 1000)),
      frameOuter_mm: furniture.frameOuter.map(v => round(v * 1000)), frameTop_mm: round(furniture.frameTop * 1000),
      frameBottom_mm: round(furniture.frameBottom * 1000), headTop_mm: round(furniture.headTop * 1000),
      headBottom_mm: round(furniture.headBottom * 1000), legCount: furniture.legCount } };
}

export async function deriveLanding({ root = ROOT } = {}) {
  const source = fs.readFileSync(path.join(root, 'web/scene/table.js'), 'utf8');
  const anchors = Object.fromEntries(Object.entries(SOURCE_ANCHORS).map(([id, pattern]) => [id, [...source.matchAll(pattern)].length]));
  const tables = [];
  for (const tableId of ALIASES) {
    for (const variant of ['v1', 'v2']) {
      const built = await buildTransportInputs({ root, tableId, search: `?obtool=0&leather=${variant}` });
      tables.push({ variant, ...inspectLanding(built, tableId) });
    }
  }
  return { schema: 'cn8-landing-pins/1', tag: 'DERIVED emitted world vertices and material fields; CPU build',
    source_anchor_counts: anchors, tables, head_top_datum: headTopDatum(tables) };
}

export const DEFINITION = 'docs/geometry/cn8-pocket-fix29-apron.json';
// The leg-head top datum: one value DERIVED from the six emitted mount heads
// of every alias and leather variant (all must agree within the quantum and
// with the published cn8Furniture.headTop). fix29_census.mjs pins each
// emitted head top to this definition value TWO-SIDED; a builder edit in
// either direction is refused by the census, not only a gap below the fascia.
export function headTopDatum(tables) {
  const tops = tables.map(table => table.head_top_y_mm);
  const bottoms = tables.map(table => table.fascia.bottom_y_mm);
  if (!tops.length || tops.some(value => !Number.isFinite(value) || Math.abs(value - tops[0]) > QUANTUM_MM)
    || bottoms.some(value => !Number.isFinite(value) || Math.abs(value - bottoms[0]) > QUANTUM_MM)
    || tops[0] < bottoms[0] - QUANTUM_MM) {
    throw new Error('LANDING HEAD TOP DATUM: emitted head tops disagree or sit below the fascia bottom: ' + JSON.stringify({ tops, bottoms }));
  }
  return { value: round(tops[0]), above_fascia_bottom_mm: round(tops[0] - bottoms[0]),
    tag: 'DERIVED emitted mount-head top faces, both aliases and both leather variants (derive_landing_pins.mjs --write-definition); the two-sided head-top pin read by fix29_census.mjs assertApron and test_fix29.mjs' };
}

// Write the derived head-top datum into the definition as
// parameters.leg_head_top_y_mm (the stale apron-bottom value is replaced).
// The file is round-tripped through JSON.stringify(value, null, 2) so only
// that entry changes. Returns the previous and the written entry.
export function writeHeadTopDatum(result, { root = ROOT } = {}) {
  const file = path.join(root, DEFINITION);
  const text = fs.readFileSync(file, 'utf8');
  const definition = JSON.parse(text);
  if (JSON.stringify(definition, null, 2) + '\n' !== text) throw new Error('LANDING DEFINITION: not a canonical 2-space JSON document; refusing to rewrite');
  const previous = definition.parameters.leg_head_top_y_mm ?? null;
  definition.parameters.leg_head_top_y_mm = result.head_top_datum;
  fs.writeFileSync(file, JSON.stringify(definition, null, 2) + '\n');
  return { file, previous, written: result.head_top_datum };
}

// The transferred rail silhouettes: the OC3 fascia source and the FIX29
// owner/video sources each name one plank and the two world endpoints of its
// axis-aligned lower rail edge (render_occluder). test_fix28 / test_fix29
// require every endpoint to be an actual emitted vertex. `derivation` names
// the source derivation that consumes each file's edges.
export const OCCLUDERS = Object.freeze([
  { file: 'docs/geometry/cn8-pocket-oc3-appearance.json', sources: ['fascia'], derivation: 'oc3' },
  { file: 'docs/geometry/cn8-pocket-fix29-apron.json', sources: ['owner', 'video'], derivation: 'fix29' },
]);

// DERIVED: the emitted Float32 world vertices of the named plank that lie on
// the recorded edge line (both fixed coordinates held exactly); the extreme
// vertex at each end, in the recorded order.
export function occluderEdge(built, occluder) {
  const { group, THREE } = built;
  group.updateMatrixWorld(true);
  const [a, b] = occluder.edge_world_m;
  const free = [0, 1, 2].filter(axis => a[axis] !== b[axis]);
  if (free.length !== 1) throw new Error(`OCCLUDER ${occluder.mesh}: the recorded edge is not axis-aligned`);
  const [k] = free, mesh = group.getObjectByName(occluder.mesh);
  if (!mesh) throw new Error(`OCCLUDER ${occluder.mesh}: not emitted`);
  const p = mesh.geometry.getAttribute('position'), on = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).toArray();
    if (v.every((value, axis) => axis === k || value === a[axis])) on.push(v);
  }
  if (on.length < 2) throw new Error(`OCCLUDER ${occluder.mesh}: fewer than two emitted vertices on the recorded edge line`);
  on.sort((u, w) => u[k] - w[k]);
  return a[k] < b[k] ? [on[0], on.at(-1)] : [on.at(-1), on[0]];
}

// Re-derive every render_occluder edge from the emitted geometry of both
// aliases (which must agree exactly) and write the files back. A source whose
// edge came with a measurement (source_commit / source_tree /
// source_table_sha256, the archived OC3 census) keeps that record and gains
// `rederived`, naming the tree the new endpoints come from; table.js must be
// committed first so that tree is real. Each file's source derivation must
// come out byte-identical with the new edges: an edge move that changes a
// derived height needs a new source derivation, not a pin refresh. Nothing is
// written unless every file passes.
export async function writeOccluders({ root = ROOT } = {}) {
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { deriveFascia } = await import('./derive_oc3_fascia.mjs');
  const { deriveSources } = await import('./fix29_census.mjs');
  const derive = { oc3: definition => deriveFascia(definition.sources.fascia), fix29: deriveSources };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', 'web/scene/table.js')) throw new Error('OCCLUDER: web/scene/table.js differs from HEAD; commit the tree to derive from first');
  const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  const tableSha = createHash('sha256').update(fs.readFileSync(path.join(root, 'web/scene/table.js'))).digest('hex');
  const builds = [];
  for (const tableId of ALIASES) builds.push(await buildTransportInputs({ root, tableId, search: '?obtool=0' }));
  const pending = [], writes = [];
  for (const { file, sources, derivation } of OCCLUDERS) {
    const full = path.join(root, file), text = fs.readFileSync(full, 'utf8'), definition = JSON.parse(text);
    if (JSON.stringify(definition, null, 2) + '\n' !== text) throw new Error(`OCCLUDER ${file}: not a canonical 2-space JSON document; refusing to rewrite`);
    const before = JSON.stringify(derive[derivation](definition));
    for (const source of sources) {
      const occluder = definition.sources[source].render_occluder;
      const edges = builds.map(built => occluderEdge(built, occluder));
      if (edges.some(edge => JSON.stringify(edge) !== JSON.stringify(edges[0]))) throw new Error(`OCCLUDER ${file} ${source}: the aliases disagree`);
      const previous = occluder.edge_world_m, measured = 'source_commit' in occluder;
      occluder.edge_world_m = edges[0];
      occluder.tag = measured
        ? 'DERIVED emitted Float32 rail lower edge; endpoints re-derived on the `rederived` tree, measurement archived at source_commit; EST projected pose'
        : `DERIVED actual ${head.slice(0, 8)} emitted rail silhouette vertices, both aliases (derive_landing_pins.mjs --write-occluders)`;
      if (measured) occluder.rederived = { commit: head, tree, table_sha256: tableSha, tool: 'derive_landing_pins.mjs --write-occluders, both aliases' };
      writes.push({ file, source, mesh: occluder.mesh, previous, written: edges[0] });
    }
    if (JSON.stringify(derive[derivation](definition)) !== before) throw new Error(`OCCLUDER ${file}: the re-derived edge changes the ${derivation} source derivation`);
    pending.push([full, JSON.stringify(definition, null, 2) + '\n']);
  }
  for (const [full, body] of pending) fs.writeFileSync(full, body);
  return { commit: head, tree, table_sha256: tableSha, writes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let out = null;
  let writeDefinition = false;
  let writeOccluderEdges = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) out = path.resolve(args[++i]);
    else if (args[i] === '--write-definition') writeDefinition = true;
    else if (args[i] === '--write-occluders') writeOccluderEdges = true;
    else throw new Error('Usage: derive_landing_pins.mjs [--out fresh.json] [--write-definition] [--write-occluders]');
  }
  if (out && fs.existsSync(out)) throw new Error('derive_landing_pins requires a fresh output path');
  // writeHeadTopDatum writes at once, so a refused occluder step would leave the
  // FIX29 definition half-updated: one write mode per run.
  if (writeDefinition && writeOccluderEdges) throw new Error('derive_landing_pins: run --write-definition and --write-occluders separately');
  const result = await deriveLanding();
  if (writeDefinition) result.definition_write = writeHeadTopDatum(result);
  if (writeOccluderEdges) result.occluder_write = await writeOccluders();
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
  console.log(JSON.stringify(result, null, 2));
}
