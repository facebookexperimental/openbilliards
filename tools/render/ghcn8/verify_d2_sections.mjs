// Copyright (c) Meta Platforms, Inc. and affiliates.

// Independent topology and construction checks on the shipped D2 builder.
// This is CPU geometry analysis; no browser or renderer is launched here.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { checkCensus, checkContract, coordinateCensus } from './d2_contract_checks.mjs';

// Keep the established entry point for consumers; the active D3 layout uses
// the integrated actual-buffer verifier. Historical D2 remains reproducible.
if (fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8')
  .includes('geometry.userData.cn8D3 =')) {
  const { runD3Verification } = await import('./verify_d3_sections.mjs');
  process.exit(runD3Verification());
}

const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const i = args.indexOf(key);
  if (i < 0) return fallback;
  if (!args[i + 1]?.trim() || args[i + 1].startsWith('--')) throw new Error(`${key} requires a value`);
  return args[i + 1];
};
const outArg = arg('--out', null);
const outDir = outArg ? path.resolve(outArg) : fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-d2-verify-'));
fs.mkdirSync(outDir, { recursive: true });
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const contract = readJson(arg('--contract', new URL('../../../docs/geometry/cn8-corner-furniture-definition-contract.json', import.meta.url)));
const ledger = readJson(arg('--ledger', new URL('../../../docs/geometry/cn8-pocket-d2-ledger.json', import.meta.url)));
const emittedFile = arg('--emitted', null);
const emitted = emittedFile ? readJson(emittedFile) : null;

const file = new URL('../../../web/scene/table.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('const CN8_D2_SECTION =');
const end = source.indexOf('// GH-490 MOUTH-CURE', start);
if (start < 0 || end <= start) throw new Error('D2 source block not found');
const { K, S, section, pair, build, bedEdge } = new Function('THREE', source.slice(start, end)
  + '\nreturn {K:CN8_R82,S:CN8_D2_SECTION,section:cn8D2Section,pair:cn8D2PlanPair,build:cn8D2CornerGeometry,bedEdge:cn8D2BedEdge};')(THREE);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const violations = [];
const g = build(K, 2.54, 1.26, 1, 1); // MFR printed Q8Pro playing dimensions.
const a = g.getAttribute('position').array; const idx = g.index.array;
const edges = new Map(); let zeroArea = 0; let volume6 = 0;
for (let i = 0; i < idx.length; i += 3) {
  const v = [0, 1, 2].map((k) => new THREE.Vector3().fromArray(a, idx[i + k] * 3));
  const ab = v[1].clone().sub(v[0]); const ac = v[2].clone().sub(v[0]);
  // TESSELLATION numeric degeneracy: 1e-14 m^2 doubled triangle area.
  if (ab.clone().cross(ac).length() <= 1e-14) zeroArea++;
  volume6 += v[0].dot(v[1].clone().cross(v[2]));
  for (let j = 0; j < 3; j++) {
    const p = idx[i + j]; const q = idx[i + (j + 1) % 3];
    const key = p < q ? `${p},${q}` : `${q},${p}`;
    const row = edges.get(key) ?? { count: 0, direction: 0 };
    row.count++; row.direction += p < q ? 1 : -1; edges.set(key, row);
  }
}
const boundary = [...edges].filter(([, row]) => row.count === 1);
const nonManifold = [...edges].filter(([, row]) => row.count > 2);
const inconsistent = [...edges].filter(([, row]) => row.count === 2 && row.direction !== 0);
if (boundary.length || nonManifold.length || inconsistent.length || zeroArea) {
  violations.push('Mesh edge/area topology failed');
}
if (!(volume6 > 0)) violations.push('Signed volume is not positive');
const probes = [];
for (const station of g.userData.cn8D2.stations) {
  const p = pair(K, station); const width = Math.hypot(...sub2(p.outer, p.inner));
  const s = section(width, p.mix); const poly = s.profile; const n = poly.length;
  let crossings = 0;
  for (let i = 0; i < n; i++) {
    const aa = poly[i]; const bb = poly[(i + 1) % n]; const d = sub2(bb, aa);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const cc = poly[j]; const dd = poly[(j + 1) % n]; const e = sub2(dd, cc);
      const den = cross2(d, e);
      if (Math.abs(den) < 1e-14) continue;
      const delta = sub2(cc, aa); const u = cross2(delta, e) / den; const v = cross2(delta, d) / den;
      if (u > 1e-7 && u < 1 - 1e-7 && v > 1e-7 && v < 1 - 1e-7) crossings++;
    }
  }
  let minGauge = Infinity; let maxGauge = 0; let maxChordError = 0;
  const distanceToSegments = (q, points) => {
    let distance = Infinity;
    for (let j = 0; j + 1 < points.length; j++) {
      const d = sub2(points[j + 1], points[j]); const p0 = sub2(q, points[j]);
      const t = Math.max(0, Math.min(1, (d[0] * p0[0] + d[1] * p0[1]) / (d[0] ** 2 + d[1] ** 2)));
      distance = Math.min(distance, Math.hypot(p0[0] - d[0] * t, p0[1] - d[1] * t));
    }
    return distance;
  };
  for (const q of s.sampled) {
    const distance = distanceToSegments(q, s.outer);
    minGauge = Math.min(minGauge, distance); maxGauge = Math.max(maxGauge, distance);
  }
  for (const q of s.inner) maxChordError = Math.max(maxChordError, distanceToSegments(q, s.sampled));
  probes.push({ station, width_mm: width * 1000, mix: p.mix, crossings,
    gauge_min_mm: minGauge * 1000, gauge_max_mm: maxGauge * 1000,
    inner_chord_error_mm: maxChordError * 1000 });
  if (crossings) violations.push(`Section self-crossing at ${station}`);
  // TESSELLATION: the same 0.03 mm chord budget used for source reduction.
  if (maxChordError > 0.00003) violations.push(`Inner section chord budget exceeded at ${station}`);
}
let maxReflectionError = 0; let footprintExcess = 0;
for (const [sx, sz] of [[-1, 1], [1, -1], [-1, -1]]) {
  const other = build(K, 2.54, 1.26, sx, sz).getAttribute('position').array;
  for (let i = 0; i < a.length; i += 3) {
    maxReflectionError = Math.max(maxReflectionError,
      Math.abs(a[i] * sx - other[i]), Math.abs(a[i + 1] - other[i + 1]),
      Math.abs(a[i + 2] * sz - other[i + 2]));
  }
}
for (let i = 0; i < a.length; i += 3) {
  const u = a[i] - 1.27; const v = a[i + 2] - 0.63;
  footprintExcess = Math.max(footprintExcess, u - K.A_R, v - K.A_R,
    K.Y_CUT - u, K.Y_CUT - v);
  if (u >= K.C && v >= K.C) footprintExcess = Math.max(footprintExcess,
    Math.hypot(u - K.C, v - K.C) - K.R - K.W_L);
}
// TESSELLATION Float32 publication allowance: 0.0002 mm at table scale.
if (maxReflectionError > 2e-7 || footprintExcess > 2e-7) violations.push('Symmetry or owner footprint failed');
const definition = readJson(arg('--definition', new URL('../../../docs/geometry/cn8-pocket-d2-section.json', import.meta.url)));
violations.push(...checkCensus(definition, ledger), ...checkContract(contract, g.userData.cn8D2, emitted));
if (emitted && emitted.table_sha256 !== sha(source)) violations.push('contract: emitted capture table.js digest differs from the checked source');
for (const key of ['central', 'terminal']) {
  if (JSON.stringify(S[key]) !== JSON.stringify(definition.sections[key].loft_profile)) violations.push(`${key} definition mismatch`);
}
if (JSON.stringify(S.parameters) !== JSON.stringify(definition.profile_parameters)) violations.push('Source feature parameterization mismatch');
for (const [i, key] of ['central', 'terminal'].entries()) {
  const [lo, hi] = definition.sections[key].source_radial_range_mm;
  // TESSELLATION/numeric equality: 1e-12 m; no physical fit allowance.
  if (Math.abs(S.sourceWidths[i] - (hi - lo) / 1000) > 1e-12) violations.push(`${key} source width mismatch`);
}
if (S.brown !== parseInt(definition.parameters.brown_albedo_hex.value, 16)) violations.push('Brown source interpretation mismatch');
for (const [key, field, divisor] of [['railTop','rail_top_mm',1000],['gauge','shell_gauge_mm',1000],['stitchDrop','photo_stitch_drop_mm',1000]]) {
  if (S[key] !== definition.parameters[field].value / divisor) violations.push(`${key} parameter definition mismatch`);
}
const outline = bedEdge(K);
// The new hidden cloth edge stays outside every playfield side and well
// outside the frozen mouth/jaw-foot boundary; no collision datum is edited.
if (outline.some(([u,v]) => u <= 0 && v <= 0)) violations.push('Cloth cut entered the playing rectangle');
const drawing = { tag:'DERIVED from the actual renderer builder; dimensions in metres',
  table_sha256:sha(source), K, central:section(K.W_L,0).profile,
  terminal:section(K.A_R-K.X_BC,1).profile,
  plan:g.userData.cn8D2.stations.map(station=>({station,...pair(K,station)})),
  bed_edge:outline };
fs.writeFileSync(path.join(outDir, 'built-drawing-inputs.json'), JSON.stringify(drawing, null, 2) + '\n');
const result = { status: violations.length ? 'FAIL' : 'PASS',
  table_sha256: sha(source), source_block_sha256: sha(source.slice(start, end)),
  vertices: a.length / 3, triangles: idx.length / 3,
  position_sha256: sha(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)),
  index_sha256: sha(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength)),
  zero_area_triangles: zeroArea, boundary_edges: boundary.length,
  non_manifold_edges: nonManifold.length, inconsistent_winding_edges: inconsistent.length,
  boundary_examples: boundary.slice(0, 20), winding_examples: inconsistent.slice(0, 20),
  signed_volume_m3: volume6 / 6, max_reflection_error_mm: maxReflectionError * 1000,
  heights_mm: {
    rail_top: { value: S.railTop * 1000, tag: 'DERIVED / retained CN8_R82.DECK' },
    legacy_hem_datum: { value: K.HEM * 1000, tag: 'DERIVED / retained CN8_R82.HEM; not the old mesh minimum' },
    outer_hem: { value: S.railTop * 1000 - definition.parameters.photo_drop_mm.value, tag: 'EST / retained deck minus EST height transfer' },
    emitted_mesh_minimum: { value: Math.min(...Array.from(a).filter((_, i) => i % 3 === 1)) * 1000, tag: 'DERIVED from emitted Float32 mesh; physical input grade EST' },
  },
  footprint_excess_mm: footprintExcess * 1000, sections: probes,
  contract: { id: contract.active_layout?.id, cover_ids: contract.active_layout?.cover.ids,
    emitted_check: emitted ? 'RUN' : 'NOT RUN (supply --emitted for the scene-identity check)' },
  coordinate_census: coordinateCensus(ledger.rows), violations };
const out = path.join(outDir, 'section-verification.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, sections: `${probes.length} section probes` }, null, 2));
console.log(`[cn8-d2] output ${outDir}`);
if (violations.length) process.exitCode = 1;
