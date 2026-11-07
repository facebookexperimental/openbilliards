// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX28: actual emitted fascia/hem and six-pocket material census.
// CPU builder only: no browser, raster color score, or visibility claim.
// FIX29 supersedes F1 acceptance: these fascia numbers are a retained
// partition regression only. fix29_census measures the LOWEST wood edge.
// Landing pass (JOY furniture revision): the flush lower boards
// (cn8-blind-*) and the cn8r82-endwrap-* covers no longer exist, so the
// lower-board joint gap is reported as RETIRED and the leather family is
// the eight meshes whose material name starts with cn8-pocket-leather.
// Derivation: tools/render/ghcn8/derive_landing_pins.mjs; record in
// docs/geometry/cn8-joy-furniture-revision.md (Landing pass section).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildTransportInputs } from './cpu_table_inputs.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ALIASES = Object.freeze(['chinese8_pro_9ft', 'joy_q8_9ft']);
// FIX28 F1 ruling, 2026-09-17 23:30Z: the apron continues below the
// shallow middle cup. Only corner boots govern the fascia height.
// External photograph is a construction reference, never a shipped asset.
export const F1_MIDDLE_SOURCE = Object.freeze({
  ruling: 'FIX28 F1 middle-boundary ruling, 2026-09-17 23:30Z',
  tag: 'PHOTO construction reference / OWNER applicability ruling',
  frame: '<construction reference photo, private archive>',
  sha256: 'a823e6837cdbbdf138bd2619651267e010aaa59b3d43ca4b763a3787bb013ca1',
  observation: 'The right long-side middle cup sits above the continuous apron band. Maker/model is not established by this row; no dimension is transferred.',
});
const MIDDLE_STATUS = 'NOT-APPLICABLE-BY-SOURCE';
export const LOWER_BOARD_RETIRED = 'RETIRED: the JOY furniture revision removed the flush lower boards (cn8-blind-*)';
// Eight corner/beam boundaries + four middle/beam boundaries per alias.
// A pocket identity cannot infer its neighbours from the captured buffer.
export const CONTACTS = Object.freeze([
  [0, 'corner', 'cn8-beam-long-nW'], [0, 'corner', 'cn8-beam-end-n'],
  [1, 'middle', 'cn8-beam-long-nW'], [1, 'middle', 'cn8-beam-long-nE'],
  [2, 'corner', 'cn8-beam-long-nE'], [2, 'corner', 'cn8-beam-end-p'],
  [3, 'corner', 'cn8-beam-long-pW'], [3, 'corner', 'cn8-beam-end-n'],
  [4, 'middle', 'cn8-beam-long-pW'], [4, 'middle', 'cn8-beam-long-pE'],
  [5, 'corner', 'cn8-beam-long-pE'], [5, 'corner', 'cn8-beam-end-p'],
].map(Object.freeze));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const arrayBytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const textureSlots = ['map', 'bumpMap', 'roughnessMap', 'normalMap', 'emissiveMap',
  'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'displacementMap', 'envMap',
  'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'sheenColorMap',
  'sheenRoughnessMap', 'specularColorMap', 'specularIntensityMap', 'transmissionMap', 'thicknessMap'];
const physicalFields = ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness',
  'bumpScale', 'specularIntensity', 'envMapIntensity', 'emissiveIntensity', 'sheen', 'sheenRoughness'];
// DERIVED (derive_landing_pins.mjs): 8 meshes / 14 material slots carry the
// cn8-pocket-leather family on both aliases; cn8r82-endwrap-* is retired.
const coverNames = /^(?:cn8r82-ring-[0235]|cn8-mid-leather(?:-skirt)?-[14])$/;
export const LEATHER_MESHES = 8;
export const LEATHER_SLOTS = 14;

function requiredMesh(group, name) {
  const matches = [];
  group.traverse(object => { if (object.name === name && object.isMesh) matches.push(object); });
  if (matches.length !== 1) throw new Error(`FIX28 MESH IDENTITY ${name}: ${matches.length}`);
  return matches[0];
}

export function inspectFix28(built, tableId) {
  const { group, THREE } = built;
  group.updateMatrixWorld(true);
  const box = object => new THREE.Box3().setFromObject(object);
  const fascia = CONTACTS.map(([pocket, kind, beamName]) => {
    const hemName = kind === 'corner' ? `cn8r82-ring-${pocket}` : `cn8-mid-leather-skirt-${pocket}`;
    const beam = box(requiredMesh(group, beamName));
    const blindName = beamName.replace('cn8-beam-', 'cn8-blind-');
    const blindMeshes = [];
    group.traverse(object => { if (object.name === blindName && object.isMesh) blindMeshes.push(object); });
    const blind = blindMeshes.length === 1 ? box(blindMeshes[0]) : null;
    const hem = box(requiredMesh(group, hemName));
    // Three.js is y-up. The order's hem-minus-fascia inequality is in
    // downward depth, so depth=-y. Publish both frames, never reverse the
    // physical comparison by silently changing its sign.
    const hemDepth = -hem.min.y, fasciaDepth = -beam.min.y;
    return { table: tableId, pocket, kind, beam: beamName, hem_mesh: hemName,
      hem_y_mm: hem.min.y * 1000, fascia_bottom_y_mm: beam.min.y * 1000,
      hem_depth_mm: hemDepth * 1000, fascia_bottom_depth_mm: fasciaDepth * 1000,
      hem_minus_fascia_mm: (hemDepth - fasciaDepth) * 1000,
      fascia_height_mm: (beam.max.y - beam.min.y) * 1000,
      joint_gap_mm: blind ? (beam.min.y - blind.max.y) * 1000 : null,
      lower_board: blind ? 'PRESENT' : LOWER_BOARD_RETIRED,
      f1_applies: kind === 'corner',
      raw_clearance: hemDepth >= fasciaDepth ? 'NONNEGATIVE' : 'NEGATIVE',
      status: kind === 'middle' ? MIDDLE_STATUS : hemDepth >= fasciaDepth ? 'PASS' : 'FAIL',
      ...(kind === 'middle' ? { applicability_source: F1_MIDDLE_SOURCE } : {}),
      tag: 'DERIVED emitted world vertices; height source PHOTO edges / EST camera' };
  });
  const corners = [0, 2, 3, 5].map(pocket => {
    const boundaries = fascia.filter(row => row.pocket === pocket);
    const clearance = Math.min(...boundaries.map(row => row.hem_minus_fascia_mm));
    return { table: tableId, pocket, boundaries: boundaries.map(row => row.beam),
      hem_minus_fascia_mm: clearance, status: clearance >= 0 ? 'PASS' : 'FAIL',
      tag: 'DERIVED minimum clearance of the two measured corner/rail boundaries' };
  });

  const first = requiredMesh(group, 'cn8r82-ring-0');
  const reference = Array.isArray(first.material) ? first.material[0] : first.material;
  const materialRows = [], geometry = [], ordinals = new Map(), textureCache = new WeakMap();
  const texture = value => {
    if (!value) return null;
    if (textureCache.has(value)) return textureCache.get(value);
    const data = value.image?.data;
    const result = { width: value.image?.width ?? null, height: value.image?.height ?? null,
      content_sha256: data ? sha(arrayBytes(data)) : null,
      content_kind: data ? data.constructor.name : 'CPU canvas/image stub; no paint proof',
      channel: value.channel, repeat: value.repeat.toArray(), offset: value.offset.toArray(),
      colorSpace: value.colorSpace, wrap: [value.wrapS, value.wrapT],
      minFilter: value.minFilter, magFilter: value.magFilter };
    textureCache.set(value, result);
    return result;
  };
  const signature = material => ({ type: material.type,
    color: material.color?.getHexString(), color_linear: material.color?.toArray(),
    emissive: material.emissive?.getHexString(), emissive_linear: material.emissive?.toArray(),
    sheenColor: material.sheenColor?.getHexString(),
    ...Object.fromEntries(physicalFields.map(key => [key, material[key]])) });
  const expected = signature(reference);
  group.traverse(object => {
    if (!object.isMesh) return;
    const ordinal = ordinals.get(object.name) ?? 0;
    ordinals.set(object.name, ordinal + 1);
    geometry.push({ name: object.name, ordinal, matrix: object.matrixWorld.elements.slice(),
      attributes: Object.fromEntries(Object.entries(object.geometry.attributes)
        .map(([name, attribute]) => [name, sha(arrayBytes(attribute.array))])),
      index: object.geometry.index ? sha(arrayBytes(object.geometry.index.array)) : null });
    if (!coverNames.test(object.name)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material, slot) => {
      const cap = object.name.startsWith('cn8r82-ring-') && slot === 1;
      const maps = Object.fromEntries(textureSlots.map(key => [key, texture(material[key])]));
      const sharedSources = Object.fromEntries(textureSlots.map(key => [key,
        material[key] == null && reference[key] == null
          || Boolean(material[key] && reference[key] && material[key].source === reference[key].source)]));
      const mapSampler = textureSlots.every(key => {
        if (!material[key] || !reference[key]) return material[key] === reference[key];
        const a = { ...texture(material[key]), channel: 0 };
        const b = { ...texture(reference[key]), channel: 0 };
        return JSON.stringify(a) === JSON.stringify(b)
          && material[key].channel === (cap && key !== 'envMap' ? 1 : 0);
      });
      const physical = signature(material);
      materialRows.push({ table: tableId, mesh: object.name, slot,
        pocket: Number(object.name.match(/-(\d)$/)[1]), name: material.name,
        variant: material.userData.cn8LeatherVariant ?? null, ...physical,
        maps, same_source_objects: sharedSources, same_sampler_except_cap_channel: mapSampler,
        geometry_exception: cap ? 'Retained planar cap UV channel 1 for every sampler' : 'None',
        side: material.side,
        same_analytic_hook: material.onBeforeCompile === reference.onBeforeCompile,
        matches_corner_family: JSON.stringify(physical) === JSON.stringify(expected)
          && Object.values(sharedSources).every(Boolean) && mapSampler });
    });
  });
  if (fascia.length !== 12 || new Set(fascia.map(row => row.pocket)).size !== 6
    || materialRows.length !== LEATHER_SLOTS || new Set(materialRows.map(row => row.mesh)).size !== LEATHER_MESHES) {
    throw new Error('FIX28 CENSUS MEMBERSHIP');
  }
  // The builder lives in a VM realm. Clone the value receipt into this
  // realm so vector arrays compare by their numbers, not VM prototypes.
  return structuredClone({ table: tableId, actual_table_id: group.userData.tableId ?? built.activeTableId?.() ?? null,
    scope: 'CPU emitted geometry and material inputs; no pixels or production transport-application proof',
    fascia, corners, materials: materialRows, geometry,
    summary: { fascia_pass: fascia.filter(row => row.status === 'PASS').length,
      fascia_fail: fascia.filter(row => row.status === 'FAIL').length,
      fascia_not_applicable_by_source: fascia.filter(row => row.status === MIDDLE_STATUS).length,
      corner_pockets_pass: corners.filter(row => row.status === 'PASS').length,
      corner_pockets_fail: corners.filter(row => row.status === 'FAIL').length,
      material_slots: materialRows.length,
      material_mismatches: materialRows.filter(row => !row.matches_corner_family).length } });
}

export function assertFascia(census) {
  const failed = [];
  for (const table of census) {
    if (table.fascia.length !== CONTACTS.length) throw new Error('FIX28 F1 BOUNDARY MEMBERSHIP');
    for (const [pocket, kind, beam] of CONTACTS) {
      const found = table.fascia.filter(row => row.pocket === pocket && row.beam === beam);
      if (found.length !== 1 || found[0].kind !== kind
        || !Number.isFinite(found[0].hem_minus_fascia_mm)) {
        throw new Error(`FIX28 F1 BOUNDARY MEMBERSHIP ${table.table}/${pocket}/${beam}`);
      }
      const row = found[0];
      if (kind === 'corner') {
        // Read the number, not a supplied PASS/N/A label. The source
        // exclusion can never hide a corner regression.
        if (row.hem_minus_fascia_mm < 0 || row.f1_applies !== true || row.status !== 'PASS') failed.push(row);
      } else if (row.f1_applies !== false || row.status !== MIDDLE_STATUS
        || row.applicability_source?.sha256 !== F1_MIDDLE_SOURCE.sha256) {
        throw new Error(`FIX28 F1 MIDDLE SOURCE ${table.table}/${pocket}/${beam}`);
      }
    }
  }
  if (failed.length) throw new Error('FIX28 F1 FASCIA BELOW HEM: '
    + failed.map(row => `${row.table}/${row.pocket}/${row.beam}=${row.hem_minus_fascia_mm}`).join('; '));
}

export function assertLeather(census, variant) {
  for (const row of census.flatMap(table => table.materials)) {
    // DERIVED (derive_landing_pins.mjs on the accepted material pass): one
    // family over all six pockets; V2 differs in roughness/clearcoat only.
    if (!row.matches_corner_family || !row.same_analytic_hook
      || row.variant !== variant || row.color !== 'c6a480'
      || row.roughness !== (variant === 'v2' ? 0.90 : 1)
      || row.clearcoat !== (variant === 'v2' ? 0.12 : 0.06)
      || row.clearcoatRoughness !== (variant === 'v2' ? 0.45 : 0.55)
      || row.maps.bumpMap !== null || !row.maps.normalMap || !row.maps.roughnessMap || !row.maps.map
      || row.emissive !== '796750' || row.emissiveIntensity !== 0.35) {
      throw new Error(`FIX28 F2/F3 MATERIAL ${row.table}/${row.mesh}/${row.slot}`);
    }
  }
}

export async function collectFix28({ root = ROOT, variant = 'v1' } = {}) {
  const rows = [];
  for (const tableId of ALIASES) {
    rows.push(inspectFix28(await buildTransportInputs({ root, tableId,
      search: `?obtool=0&leather=${variant}` }), tableId));
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = { root: ROOT, variant: 'v1' };
  let out, check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (args[i] === '--out' && args[i + 1]) out = path.resolve(args[++i]);
    else if (args[i] === '--root' && args[i + 1]) options.root = path.resolve(args[++i]);
    else if (args[i] === '--variant' && ['v1', 'v2'].includes(args[i + 1])) options.variant = args[++i];
    else throw new Error('Usage: fix28_census.mjs --out fresh.json [--root tree] [--variant v1|v2] [--check]');
  }
  if (!out || fs.existsSync(out)) throw new Error('FIX28 requires a fresh output path');
  const rows = await collectFix28(options), failures = [];
  for (const checkRow of [() => assertFascia(rows), () => assertLeather(rows, options.variant)]) {
    try { checkRow(); } catch (error) { failures.push(error.message); }
  }
  const result = { schema: 'cn8-fix28-census/2', tag: 'DERIVED CPU build', variant: options.variant,
    f1_applicability: 'Historical FIX28 cream-fascia partition only; FIX29 lowest-wood/source census governs acceptance. Middle clearance remains N/A by source.',
    table_sha256: sha(fs.readFileSync(path.join(options.root, 'web/scene/table.js'))),
    rows, failures, status: failures.length ? 'FAIL' : 'PASS' };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ out, variant: options.variant, status: result.status,
    summaries: rows.map(row => ({ table: row.table, ...row.summary })), failures }));
  if (check && failures.length) process.exitCode = 1;
}
