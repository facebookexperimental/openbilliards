// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX29: signed clearance against every adjoining wood surface, not only
// the cream fascia. CPU geometry evidence; raster visibility waits for cue.
// Landing pass (JOY furniture revision): the flush lower panel and the
// FIX29 source-total apron (126.733 mm) describe a construction the accepted
// rebuild replaced with a recessed frame. The lowest-wood rows now measure
// the fascia-plane contributors only; the source derivation in
// docs/geometry/cn8-pocket-fix29-apron.json stays as a self-consistent
// record. Derivation: derive_landing_pins.mjs; disposition recorded in
// docs/geometry/cn8-joy-furniture-revision.md (Landing pass section).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { ALIASES, inspectFix28, assertLeather, F1_MIDDLE_SOURCE, LOWER_BOARD_RETIRED } from './fix28_census.mjs';
import { deriveFascia } from './derive_oc3_fascia.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFINITION = 'docs/geometry/cn8-pocket-fix29-apron.json';
export const QUANTUM_MM = 1000 * 2 ** -23; // DERIVED existing table-space Float32 mesh quantum.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Fixed identities, including both cut-face segments at every corner.
export const BOUNDARIES = [
  [0, 'corner', 'long-nW', 'lnn', 0, 'l0'], [0, 'corner', 'end-n', 'enn', 4, 'en'],
  [1, 'middle', 'long-nW', 'mWn', 0, 'l0'], [1, 'middle', 'long-nE', 'mEn', 1, 'l1'],
  [2, 'corner', 'long-nE', 'lpn', 1, 'l1'], [2, 'corner', 'end-p', 'epn', 5, 'ep'],
  [3, 'corner', 'long-pW', 'lnp', 2, 'l2'], [3, 'corner', 'end-n', 'enp', 4, 'en'],
  [4, 'middle', 'long-pW', 'mWp', 2, 'l2'], [4, 'middle', 'long-pE', 'mEp', 3, 'l3'],
  [5, 'corner', 'long-pE', 'lpp', 3, 'l3'], [5, 'corner', 'end-p', 'epp', 5, 'ep'],
];
export function boundaryNames([, kind, stem, plate, plank, deck]) {
  return [`cn8-beam-${stem}`, `cn8-plank-${plank}`,
    `cn8-beam-deck-${deck}`, `cn8-bodyweb-${deck}`, `cn8-railend-plate-${plate}`,
    ...(kind === 'corner' ? [`cn8-railend-plate-${plate}-1`] : [])];
}
// DERIVED (derive_landing_pins.mjs): 347 emitted meshes per alias after the
// furniture revision (256 before it).
export const INVENTORY_MESHES = 347;
export function axisDigest(attribute, axes) {
  const words = new Float32Array(attribute.count * axes.length);
  for (let i = 0; i < attribute.count; i++) {
    for (let j = 0; j < axes.length; j++) words[i * axes.length + j] = attribute.array[i * attribute.itemSize + axes[j]];
  }
  return sha(Buffer.from(words.buffer));
}
export function inspectFix29(built, tableId) {
  const legacy = inspectFix28(built, tableId), { group, THREE, G } = built;
  group.updateMatrixWorld(true);
  const inventory = [], ordinals = new Map();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const ordinal = ordinals.get(mesh.name) ?? 0;
    ordinals.set(mesh.name, ordinal + 1);
    const box = new THREE.Box3().setFromObject(mesh);
    const p = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
    inventory.push({ name: mesh.name, ordinal, min_mm: box.min.toArray().map(v => v * 1000),
      max_mm: box.max.toArray().map(v => v * 1000),
      plan_words_sha256: axisDigest(p, [0, 2]),
      u_words_sha256: uv ? axisDigest(uv, [0]) : null });
  });
  const one = name => {
    const found = inventory.filter(mesh => mesh.name === name);
    if (found.length !== 1) throw new Error(`FIX29 MESH IDENTITY ${name}: ${found.length}`);
    return found[0];
  };
  const rows = BOUNDARIES.map(boundary => {
    const [pocket, kind, stem] = boundary;
    const hem = one(kind === 'corner' ? `cn8r82-ring-${pocket}` : `cn8-mid-leather-skirt-${pocket}`);
    const names = boundaryNames(boundary), wood = names.map(one);
    const beam = one(`cn8-beam-${stem}`);
    const lowest = Math.min(...wood.map(mesh => mesh.min_mm[1]));
    return { table: tableId, pocket, kind, boundary: stem,
      tag: 'DERIVED emitted world vertices; source total PHOTO / EST camera',
      rail_seat_y_mm: (G.render.railSeatY ?? 0.006) * 1000,
      hem_y_mm: hem.min_mm[1], lowest_wood_y_mm: lowest,
      signed_hem_minus_wood_depth_mm: lowest - hem.min_mm[1],
      apron_total_mm: (G.render.railSeatY ?? 0.006) * 1000 - lowest,
      fascia_height_mm: beam.max_mm[1] - beam.min_mm[1],
      fascia_bottom_y_mm: beam.min_mm[1],
      lower_panel_height_mm: null,
      fascia_panel_gap_mm: null,
      lower_board: LOWER_BOARD_RETIRED,
      clearance_status: kind === 'corner' ? 'SIGNED-RECORD; positive clearance is not required'
        : 'NOT-APPLICABLE-BY-SOURCE',
      ...(kind === 'middle' ? { applicability_source: F1_MIDDLE_SOURCE } : {}),
      contributors: wood.map(mesh => ({ name: mesh.name, bottom_y_mm: mesh.min_mm[1],
        top_y_mm: mesh.max_mm[1] })) };
  });
  const mounts = inventory.filter(mesh => /^cn8-leg-[0-5]$/.test(mesh.name) && mesh.ordinal === 0);
  const published = group.userData.cn8Furniture ?? null;
  const furniture = published && { headTop_mm: published.headTop * 1000, headBottom_mm: published.headBottom * 1000,
    frameTop_mm: published.frameTop * 1000, frameBottom_mm: published.frameBottom * 1000, legCount: published.legCount };
  return structuredClone({ table: tableId, actual_table_id: legacy.actual_table_id,
    scope: 'CPU bounds of all adjoining wood, including closure plates. No rendered visibility or hidden load-path certification.',
    rows, mounts, furniture, inventory, materials: legacy.materials, geometry: legacy.geometry });
}
export function deriveSources(definition) {
  const sources = Object.fromEntries(Object.entries(definition.sources).map(([id, data]) => [id, deriveFascia(data)]));
  const widths = Object.fromEntries(Object.entries(sources).map(([id, data]) => [id,
    data.placement_interval_mm[1] - data.placement_interval_mm[0]]));
  const selected = Object.keys(widths).sort((a, b) => widths[a] - widths[b] || a.localeCompare(b))[0];
  if (selected !== definition.selection.chosen
    || sources[selected].height_mm !== definition.parameters.apron_total_mm.value
    || JSON.stringify(sources[selected].placement_interval_mm)
      !== JSON.stringify(definition.parameters.apron_total_mm.placement_interval_mm)) {
    throw new Error('FIX29 SOURCE DERIVATION / SELECTION MISMATCH');
  }
  return { selected, sources, widths };
}
export function assertApron(tables, definition) {
  // The source derivation must stay self-consistent (recipe, selection), but
  // its total no longer governs geometry: the accepted revision keeps only
  // the fascia flush, so every fascia-plane contributor ends at the fascia.
  deriveSources(definition);
  const fascia = definition.parameters.fascia_height_mm.value;
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= QUANTUM_MM;
  const failures = [];
  for (const table of tables) {
    if (!ALIASES.includes(table.table) || table.actual_table_id !== table.table
      || table.rows.length !== BOUNDARIES.length || table.inventory.length !== INVENTORY_MESHES || !table.furniture) {
      throw new Error('FIX29 CENSUS MEMBERSHIP');
    }
    for (const boundary of BOUNDARIES) {
      const [pocket, kind, stem] = boundary;
      const found = table.rows.filter(row => row.pocket === pocket && row.boundary === stem);
      if (found.length !== 1 || found[0].kind !== kind) throw new Error('FIX29 BOUNDARY MEMBERSHIP');
      const row = found[0], names = boundaryNames(boundary);
      if (JSON.stringify(row.contributors.map(item => item.name)) !== JSON.stringify(names)) {
        throw new Error('FIX29 INCOMPLETE LOWEST-WOOD CONTRIBUTORS');
      }
      const lowest = Math.min(...row.contributors.map(item => item.bottom_y_mm));
      if (!close(row.lowest_wood_y_mm, lowest)
        || !close(row.signed_hem_minus_wood_depth_mm, lowest - row.hem_y_mm)
        || !close(row.apron_total_mm, row.rail_seat_y_mm - lowest)) throw new Error('FIX29 SIGNED RECORD MISMATCH');
      const platesAndFascia = row.contributors.filter(item => item.name.startsWith('cn8-beam-long-')
        || item.name.startsWith('cn8-beam-end-') || item.name.startsWith('cn8-railend-plate-'));
      if (!close(row.apron_total_mm, fascia)
        || !close(row.fascia_height_mm, fascia)
        || !close(row.fascia_bottom_y_mm, row.rail_seat_y_mm - fascia)
        || row.lower_panel_height_mm !== null || row.fascia_panel_gap_mm !== null
        || row.lower_board !== LOWER_BOARD_RETIRED
        || platesAndFascia.some(item => !close(item.bottom_y_mm, row.rail_seat_y_mm - fascia))) {
        failures.push(`${table.table}/${pocket}/${stem}: total=${row.apron_total_mm}, fascia_bottom=${row.fascia_bottom_y_mm}`);
      }
      if (kind === 'middle' && (row.clearance_status !== 'NOT-APPLICABLE-BY-SOURCE'
        || row.applicability_source?.sha256 !== F1_MIDDLE_SOURCE.sha256)) throw new Error('FIX29 MIDDLE SOURCE MISSING');
    }
    if (table.mounts.length !== 6 || new Set(table.mounts.map(m => m.name)).size !== 6) throw new Error('FIX29 MOUNT MEMBERSHIP');
    // Mount interface after the revision: every leg head top sits on the
    // DEFINITION datum parameters.leg_head_top_y_mm, pinned TWO-SIDED
    // (|emitted - definition| <= quantum; the datum is written by
    // derive_landing_pins.mjs --write-definition and must itself lie at or
    // above the fascia bottom, so no gap can open between head and fascia).
    // The emitted-vs-published clause is kept as a second check; the head
    // bottom keeps the retained definition value.
    const fasciaBottom = definition.datum.apron_top_y_mm - fascia;
    const headTop = definition.parameters.leg_head_top_y_mm.value;
    if (!Number.isFinite(headTop) || headTop < fasciaBottom - QUANTUM_MM) {
      throw new Error(`FIX29 DEFINITION HEAD TOP: leg_head_top_y_mm=${headTop} is not a finite value at or above the fascia bottom ${fasciaBottom}`);
    }
    for (const mount of table.mounts) {
      if (!close(mount.max_mm[1], headTop)
        || !close(mount.max_mm[1], table.furniture.headTop_mm)
        || !close(mount.min_mm[1], definition.parameters.leg_head_bottom_y_mm.value)) {
        failures.push(`${table.table}/${mount.name}: mount=[${mount.min_mm[1]},${mount.max_mm[1]}], definition_head_top=${headTop}, published_head_top=${table.furniture.headTop_mm}, fascia_bottom=${fasciaBottom}`);
      }
    }
  }
  if (failures.length) throw new Error('FIX29 FASCIA APRON / MOUNT: ' + failures.join('; '));
}
export async function collectFix29({ root = ROOT, variant = 'v1' } = {}) {
  const tables = [];
  for (const tableId of ALIASES) tables.push(inspectFix29(await buildTransportInputs({ root, tableId,
    search: `?obtool=0&leather=${variant}` }), tableId));
  return tables;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = { root: ROOT, variant: 'v1' };
  let out, check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (args[i] === '--out' && args[i + 1]) out = path.resolve(args[++i]);
    else if (args[i] === '--root' && args[i + 1]) options.root = path.resolve(args[++i]);
    else if (args[i] === '--variant' && ['v1', 'v2'].includes(args[i + 1])) options.variant = args[++i];
    else throw new Error('Usage: fix29_census.mjs --out fresh.json [--root tree] [--variant v1|v2] [--check]');
  }
  if (!out || fs.existsSync(out)) throw new Error('FIX29 requires a fresh output path');
  const definition = JSON.parse(fs.readFileSync(path.join(options.root, DEFINITION)));
  const tables = await collectFix29(options), failures = [];
  for (const arm of [() => assertApron(tables, definition), () => assertLeather(tables, options.variant)]) {
    try { arm(); } catch (error) { failures.push(error.message); }
  }
  const result = { schema: 'cn8-fix29-census/1', tag: 'DERIVED CPU build', variant: options.variant,
    table_sha256: sha(fs.readFileSync(path.join(options.root, 'web/scene/table.js'))),
    source: deriveSources(definition), tables, failures, status: failures.length ? 'FAIL' : 'PASS' };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ out, status: result.status, variant: options.variant,
    source: result.source.selected, rows: tables.flatMap(table => table.rows).length,
    signed_corner_mm: [...new Set(tables.flatMap(table => table.rows.filter(row => row.kind === 'corner')
      .map(row => row.signed_hem_minus_wood_depth_mm)))],
    signed_middle_mm: [...new Set(tables.flatMap(table => table.rows.filter(row => row.kind === 'middle')
      .map(row => row.signed_hem_minus_wood_depth_mm)))], failures }));
  if (check && failures.length) process.exitCode = 1;
}
