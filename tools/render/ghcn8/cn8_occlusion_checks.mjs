// Copyright (c) Meta Platforms, Inc. and affiliates.

// Independent CPU ray census against the captured cover triangles.
import * as THREE from '../../../web/vendor/three.module.min.js';
import fs from 'node:fs';
import { loadCornerBuilder } from './cn8_emitted_checks.mjs';
import { meshQuantum } from './cn8_contact_law.mjs';

function offlineRecipe(renderer) {
  return renderer.includes('cn8Transport.apply(group, G, CN8_R82')
    ? fs.readFileSync(new URL('./cn8_transport_solver.mjs', import.meta.url), 'utf8') : null;
}

export function assertProductionSampling(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('The production light sampling changed');
  return after.length;
}

export function productionRaySampler(renderer) {
  const recipe = offlineRecipe(renderer);
  if (recipe) {
    const lamp = recipe.indexOf('  const LAMP_Y ='), hemi = recipe.indexOf('  const hemiAO =', lamp);
    const lampEnd = recipe.indexOf('\n', lamp), end = recipe.indexOf('  return (wx, vz, wz)', hemi);
    if ([lamp, hemi, lampEnd, end].some(i => i < 0)) throw new Error('Offline production transport sampler is absent');
    let rays = [], family = '';
    const functions = new Function('rayOpen', 'voidSide', 'W2M', recipe.slice(lamp, lampEnd)
      + '\n' + recipe.slice(hemi, end) + '\nreturn {hemiAO,lampVis};')(
      (...ray) => { rays.push({ family, ray }); return true; }, () => false, (x, z) => [x, z]);
    return point => {
      rays = []; family = 'production hemisphere'; functions.hemiAO(...point);
      family = 'production venue strip'; functions.lampVis(...point); return rays;
    };
  }
  const site = renderer.indexOf('      const buildCornerR82 =');
  const lamp = renderer.indexOf('        const LAMP_Y =', site);
  const map = renderer.indexOf('        const W2M =', lamp);
  const hemi = renderer.indexOf('        const hemiAO =', map);
  const end = renderer.indexOf('        // the single vertex scalar', hemi);
  if ([site, lamp, map, hemi, end].some(i => i < 0)) throw new Error('Production transport sampler is absent');
  let rays = [], family = '';
  const source = renderer.slice(lamp, map) + renderer.slice(hemi, end);
  // Record the production ray calls. The bounce-void predicate is disabled
  // only while enumerating directions; it never changes a shadow verdict.
  const functions = new Function('rayOpen', 'voidSide', 'W2M', source + '\nreturn {hemiAO,lampVis};')(
    (...ray) => { rays.push({ family, ray }); return true; }, () => false, (x, z) => [x, z]);
  return point => {
    rays = []; family = 'production hemisphere'; functions.hemiAO(...point);
    family = 'production venue strip'; functions.lampVis(...point);
    return rays;
  };
}

export function productionLinerRaySampler(renderer) {
  const recipe = offlineRecipe(renderer);
  // The extraction markers retain their renderer indentation. Padding only
  // changes whitespace; the sampling source remains the actual offline solve.
  if (recipe) renderer = recipe.split('\n').map(line => '      ' + line).join('\n');
  const site = renderer.indexOf('        const cn8Smooth =');
  const emitter = renderer.indexOf('        const EM =', site);
  const emitterEnd = renderer.indexOf('        // coaxial-disc quadrature', emitter);
  const stratification = renderer.indexOf('        const OM_ELS =', emitterEnd);
  const stratificationEnd = renderer.indexOf('        // R1-FIX4', stratification);
  const omega = renderer.indexOf('        const omegaOf =', stratificationEnd);
  const basis = renderer.indexOf('          let tot =', omega);
  const march = renderer.indexOf('              for (let t =', basis);
  if ([site, emitter, emitterEnd, stratification, stratificationEnd, omega, basis, march].some(i => i < 0)) {
    throw new Error('Production liner direction families are absent');
  }
  // Read the emitter grid and normal-basis directions from production. The
  // full families are tested before the separate aperture/cavity culls, so
  // no vertex or direction can disappear because of the old occluder.
  const source = renderer.slice(emitter, emitterEnd)
    + renderer.slice(stratification, stratificationEnd) + `
    return (point, normal) => {
      const [wx, ly, wz] = point, [nx, ny, nz] = normal, rays = [];
      for (const sample of emit) rays.push({ family: 'production liner strip',
        ray: [wx, ly, wz, sample[0] - wx, EM.y - ly, sample[1] - wz] });
      ${renderer.slice(basis, march)}
              rays.push({ family: 'production liner normal hemisphere', ray: [wx, ly, wz, dx, dy, dz] });
            }
          }
      return rays;
    };`;
  return new Function(source)();
}

export function coverMeshOracle(row) {
  const positions = row.positions ?? row.localPositions;
  if (!positions?.length || !row.indices?.length) throw new Error('Actual indexed cover required');
  const attribute = new THREE.Float32BufferAttribute(positions, 3);
  const index = new THREE.Uint32BufferAttribute(row.indices, 1);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = [], point = new THREE.Vector3();
  // Algorithmic batching only: consecutive source-index chunks, independent
  // of the production spatial tree. Every original triangle is raycast by
  // THREE.Mesh.raycast. Chunk boxes merely skip disjoint batches.
  const chunk = 256 * 3;
  for (let start = 0; start < index.count; start += chunk) {
    const count = Math.min(chunk, index.count - start), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', attribute); geometry.setIndex(index);
    geometry.setDrawRange(start, count); geometry.boundingBox = new THREE.Box3();
    for (let i = start; i < start + count; i++) geometry.boundingBox.expandByPoint(point.fromBufferAttribute(attribute, index.array[i]));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true); meshes.push(mesh);
  }
  const raycaster = new THREE.Raycaster(), hit = new THREE.Vector3(), intersections = [];
  const blocked = ray => {
    raycaster.ray.origin.fromArray(ray); raycaster.ray.direction.fromArray(ray, 3).normalize();
    for (const mesh of meshes) {
      if (!raycaster.ray.intersectBox(mesh.geometry.boundingBox, hit)) continue;
      intersections.length = 0; mesh.raycast(raycaster, intersections);
      if (intersections.length) return true;
    }
    return false;
  };
  return { blocked, triangle_count: index.count / 3, batch_count: meshes.length,
    dispose() { for (const mesh of meshes) mesh.geometry.dispose(); material.dispose(); } };
}

export function occluder(renderer, completedGroup = null) {
  const builder = loadCornerBuilder(renderer);
  if (builder.solidRayTree) {
    if (!completedGroup) throw new Error('The active occluder requires the completed solid set');
    const contact = renderer.includes('function cn8D3SolidRayTree(group, contactDistance = 0)')
      && renderer.includes('cn8Transport.apply(group, G, CN8_R82') ? meshQuantum(completedGroup) : null;
    return { builder, geometry: builder.solidRayTree(completedGroup, contact?.quantum_m ?? 0), contact };
  }
  return { builder, geometry: builder.mouthOcclusion() };
}

export function retiredBlockerHeights(occ, toM, ray) {
  const [x, y, z, dx, dy, dz] = ray, heights = [];
  if (!(dy > 1e-4) || !occ.Z_BOOTS) return heights;
  for (const height of occ.Z_BOOTS) {
    if (height <= y + 0.0008) continue;
    const t = (height - y) / dy, p = toM(x + dx * t, z + dz * t);
    if (occ.bootBlocks(...p, height)) heights.push(height * 1000);
  }
  return heights;
}

export function assertReviewVertex593(row) {
  // The exact review ray and the full production fan are separate fixtures.
  // Equality between two blocked implementations cannot satisfy either one.
  if (row.vertex !== 593 || row.rays !== 37 || row.after_open !== 37 || row.mesh_open !== 37
    || row.review.after_blocked !== false || row.review.mesh_blocked !== false) {
    throw new Error('named vertex-593 production assertion changed');
  }
  return row;
}
