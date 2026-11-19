// Copyright (c) Meta Platforms, Inc. and affiliates.

// O3-1: nearest actual-mesh blockers by family and distance. No browser,
// material tuning, tolerance changes, or authored shadow geometry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { sceneFromBuffers, fullSolidMeshOracle, capturedArray, restoreCapturedValue } from './cn8_solid_checks.mjs';
import { productionRaySampler, productionLinerRaySampler } from './cn8_occlusion_checks.mjs';
import { meshQuantum } from './cn8_contact_law.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receiver = /^(?:cn8r82-(?:wallface|tongue|endroll)-[0235]-[ab]|cn8r82-rollface-[0235]|cn8-net-(?:[0235]|(?:liner|apron)-[0235]))$/;
const read = file => JSON.parse(fs.readFileSync(file));
export function restoreContactInputs(rows) {
  for (const row of rows) {
    row.userData = restoreCapturedValue(row.userData ?? {});
    for (const attribute of Object.values(row.attributes)) attribute.array = Array.from(capturedArray(attribute));
  }
  return rows;
}
export function finiteContactSamples(samples) {
  if (samples.some(({ ray }) => ray.length !== 6 || ray.some(value => !Number.isFinite(value)))) {
    throw new Error('CONTACT_CENSUS_NONFINITE_RAY');
  }
  return samples;
}
export function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--capture', '--renderer', '--out', '--table', '--names'].includes(argv[i]) || !argv[i + 1] || args[argv[i]]) throw new Error('Unique named paths/table/names required');
    args[argv[i]] = argv[i + 1];
  }
  if (!args['--capture'] || !args['--renderer'] || !args['--out'] || fs.existsSync(args['--out'])) throw new Error('Capture, renderer and a fresh output directory required');
  const tables = args['--table'] ? [args['--table']] : ['chinese8_pro_9ft', 'joy_q8_9ft'];
  if (tables.some(t => !['chinese8_pro_9ft', 'joy_q8_9ft'].includes(t))) throw new Error('Unknown alias');
  const names = args['--names']?.split(','), renderer = fs.readFileSync(args['--renderer'], 'utf8');
  const wallSample = productionRaySampler(renderer), linerSample = productionLinerRaySampler(renderer);
  fs.mkdirSync(args['--out'], { recursive: true });
  const result = { schema: 1, tag: 'DERIVED / independent THREE.Mesh.raycast nearest-hit census',
    partial: Boolean(names || tables.length !== 2), renderer_sha256: sha(renderer),
    instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    dependencies_sha256: Object.fromEntries(['cn8_solid_checks.mjs', 'cn8_occlusion_checks.mjs', 'cn8_contact_law.mjs']
      .map(name => [name, sha(fs.readFileSync(new URL(name, import.meta.url)))])), tables: [] };
  for (const table of tables) {
    const folder = path.join(args['--capture'], table), rows = restoreContactInputs(read(path.join(folder, 'solids-buffers.json')));
    const receipt = read(path.join(folder, 'capture-receipt.json'));
    if (receipt.binding?.table_sha256 !== result.renderer_sha256) throw new Error('Capture/renderer binding differs');
    const group = sceneFromBuffers(rows), quantum = meshQuantum(group), oracle = fullSolidMeshOracle(group);
    const point = new THREE.Vector3(), selected = rows.filter(r => receiver.test(r.name) && (!names || names.includes(r.name)));
    if (names && selected.length !== names.length) throw new Error('Requested receiver is missing');
    const measured = [];
    for (const row of selected) {
      const matrix = new THREE.Matrix4().fromArray(row.matrix), positions = row.attributes.position.array;
      const primary = /^cn8-net-[0235]$/.test(row.name), normalArray = primary ? row.userData.cn8Smooth.nrm.array : null;
      const basis = row.userData.cn8Transport?.normals;
      const bins = [0, 0, 0, 0], family = {}, seams = {}, examples = [];
      let rays = 0, open = 0, afterOpen = 0, contactWithFartherBlocker = 0;
      for (let vi = 0; vi < positions.length / 3; vi++) {
        if (vi && vi % 4096 === 0) console.log(JSON.stringify({ table, name: row.name, progress_vertices: vi, rays }));
        const world = point.fromArray(positions, vi * 3).applyMatrix4(matrix).toArray();
        const normal = normalArray ? normalArray.slice(vi * 3, vi * 3 + 3) : basis?.[vi];
        const samples = finiteContactSamples(normal ? linerSample(world, normal) : wallSample(world));
        for (let ri = 0; ri < samples.length; ri++) {
          const { ray } = samples[ri], hit = oracle.trace(ray); rays++;
          if (!hit) { open++; afterOpen++; continue; }
          const bin = hit.distance < quantum.quantum_m ? 0 : hit.distance < .00025 ? 1 : hit.distance <= .005 ? 2 : 3;
          bins[bin]++;
          (family[hit.name] ??= [0, 0, 0, 0])[bin]++;
          if (bin === 0) {
            const after = oracle.trace(ray, quantum.quantum_m);
            (seams[hit.name] ??= { count: 0, minimum_m: Infinity, maximum_m: 0 }).count++;
            seams[hit.name].minimum_m = Math.min(seams[hit.name].minimum_m, hit.distance);
            seams[hit.name].maximum_m = Math.max(seams[hit.name].maximum_m, hit.distance);
            if (!after) afterOpen++; else contactWithFartherBlocker++;
            if (examples.length < 8) examples.push({ vertex: vi, ray_index: ri, ray,
              quantum_m: quantum.quantum_m, raw: hit, after_contact_classification: after });
          }
        }
      }
      const colors = row.attributes.color.array, luminance = [];
      for (let i = 0; i < colors.length; i += 3) luminance.push(.2126 * colors[i] + .7152 * colors[i + 1] + .0722 * colors[i + 2]);
      const record = { name: row.name, vertices: positions.length / 3, rays, open, bins,
        bins_mm: ['< mesh quantum', 'mesh quantum to < 0.25', '0.25 to 5 inclusive', '> 5'],
        by_blocker: family, seam_hits: seams, after_classification_open: afterOpen,
        contact_with_farther_blocker: contactWithFartherBlocker, examples,
        raw_multiplier: { mean: luminance.reduce((a, b) => a + b, 0) / luminance.length,
          floor_vertices: luminance.filter(x => x <= Math.fround(.05)).length } };
      measured.push(record);
      fs.writeFileSync(path.join(args['--out'], table + '--' + row.name + '.json'), JSON.stringify(record, null, 2) + '\n');
      console.log(JSON.stringify({ table, name: row.name, rays, bins, open, afterOpen }));
    }
    result.tables.push({ table, binding: receipt.binding, quantum, receivers: measured,
      buffer_sha256: sha(fs.readFileSync(path.join(folder, 'solids-buffers.json'))) });
    oracle.dispose();
  }
  fs.writeFileSync(path.join(args['--out'], 'CONTACT-BLOCKERS.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
