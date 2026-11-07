// Copyright (c) Meta Platforms, Inc. and affiliates.

// Complete-solid transport generation. This module is CPU tooling only.
import { performance } from 'node:perf_hooks';
import { solveLiner, wallLighting } from './cn8_transport_solver.mjs';
import * as identity from '../../../web/scene/cn8transport-core.js';
import { meshQuantum } from './cn8_contact_law.mjs';
import { receiverCensus } from './cn8_receiver_census.mjs';
import { inheritComponents } from './cn8_embedded_receivers.mjs';

class MeasuredCache extends Map {
  hits = 0; misses = 0; writes = 0;
  get(key) { const value = super.get(key); if (value === undefined) this.misses++; else this.hits++; return value; }
  set(key, value) { this.writes++; return super.set(key, value); }
}

export function solveTransport(inputs, { blocked = null, rawContactPlant = false, embedding = true,
  embeddedCensus = null, visibility = true, progress = null } = {}) {
  const { group, G, K, THREE, mouth, clothMat } = inputs;
  const contact = meshQuantum(group), minimum = rawContactPlant ? 0 : contact.quantum_m;
  const start = performance.now(), tree = inputs.solidRayTree(group, minimum);
  const treeMs = performance.now() - start;
  const query = blocked ?? ((...ray) => tree.blocked(...ray));
  const occupancyStart = performance.now();
  const census = embedding ? embeddedCensus ?? receiverCensus(group, tree, contact.quantum_m, { visibility, progress }) : null;
  const occupancyMs = performance.now() - occupancyStart;
  const cn8Solids = { rayOpenM: (_toM, ...ray) => !query(...ray) };
  const meshes = new Map(); group.traverse(object => { if (object.isMesh) meshes.set(object.name, object); });
  const cache = new MeasuredCache(), results = [], timers = [];
  for (const [corner, sx, sz] of identity.CORNERS) {
    const net = meshes.get(`cn8-net-${corner}`), bag = meshes.get(`cn8-fallbag-${corner}`);
    const started = performance.now();
    let solved = null;
    // Legacy sheet linings need their baked interior response. Geometric
    // cords use lit round surfaces and contribute their actual open mesh
    // to the same occluder census; there is no lining sheet to solve.
    if (net && bag) {
      const fullIndex = [...net.geometry.index.array, ...bag.geometry.index.array];
      solved = solveLiner({ netGeo: net.geometry,
        cn8TransportIndex: new THREE.Uint32BufferAttribute(fullIndex, 1),
        p: G.pockets[corner], L: G.L, W: G.W, CN8_R82: K, cn8Solids, clothMat, G, cache,
        embeddedPlan: census?.byName.get(net.name) });
      results.push({ name: net.name, coefficients: solved.coefficients,
        field: { ...net.geometry.userData.cn8Field, omMs: 0 } });
    }
    const linerMs = performance.now() - started;
    const lamp = solved?.lamps.get(`${sx},${sz}`), ofx = sx * (G.L / 2 + K.C), ofz = sz * (G.W / 2 + K.C);
    const shade = wallLighting({ dimensions: [G.L, G.W], signs: [sx, sz],
      voidSide: mouth.voidSide, blocked: ray => query(...ray) });
    for (const mesh of meshes.values()) {
      if (!identity.RECEIVER.test(mesh.name) || !(mesh.name.endsWith('-' + corner)
        || mesh.name.includes('-' + corner + '-')) || mesh === net || mesh === bag) continue;
      const g = mesh.geometry, position = g.getAttribute('position'), color = g.getAttribute('color');
      const plan = census?.byName.get(mesh.name);
      if (/^cn8-net-liner-[0235]$/.test(mesh.name)) {
        // This secondary liner has a retained per-vertex interior field,
        // not a hemisphere job. Q2 still applies to its proved embedded
        // samples. FREE values keep the renderer's original bytes.
        if (plan) color.array.set(inheritComponents(color.array, 3, plan.inherited, plan.classifications, plan.freeEligible));
        results.push({ name: mesh.name, color: color.array.slice() });
        continue;
      }
      const basis = g.userData.cn8Transport?.normals, apron = mesh.name.startsWith('cn8-net-apron-');
      for (let i = 0; i < position.count; i++) {
        if (plan?.classifications[i].length) continue;
        let value;
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        if (basis && lamp) value = lamp(apron ? x : x - ofx, y, apron ? z : z - ofz, ...basis[i]);
        else {
          const key = `wall:${x}:${y}:${z}`;
          value = cache.get(key);
          if (value === undefined) { value = shade(x, y, z); cache.set(key, value); }
        }
        color.setXYZ(i, value, value, value);
      }
      if (plan) color.array.set(inheritComponents(color.array, 3, plan.inherited, plan.classifications, plan.freeEligible));
      results.push({ name: mesh.name, color: color.array.slice() });
    }
    timers.push({ corner, liner_ms: linerMs, total_ms: performance.now() - started });
  }
  // The same cloth continues from the pocket wraps onto all six cushions
  // and the bed. Sampling only the small wrap meshes left a light-response
  // discontinuity at a mesh boundary even when positions/normals matched.
  if (group.userData.cn8Furniture) {
    const shades = new Map(identity.CORNERS.map(([, sx, sz]) => [`${sx},${sz}`,
      wallLighting({ dimensions: [G.L, G.W], signs: [sx, sz],
        voidSide: mouth.voidSide, blocked: ray => query(...ray) })]));
    const point = new THREE.Vector3(), rootInverse = group.matrixWorld.clone().invert();
    for (const mesh of meshes.values()) {
      if (!identity.CLOTH_SURFACE.test(mesh.name)) continue;
      const g = mesh.geometry, position = g.getAttribute('position'), color = g.getAttribute('color');
      const plan = census?.byName.get(mesh.name), transform = rootInverse.clone().multiply(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        if (plan?.classifications[i].length) continue;
        point.fromBufferAttribute(position, i).applyMatrix4(transform);
        const key = `wall:${point.x}:${point.y}:${point.z}`;
        let value = cache.get(key);
        if (value === undefined) {
          const shade = shades.get(`${Math.sign(point.x) || 1},${Math.sign(point.z) || 1}`);
          value = shade(point.x, point.y, point.z); cache.set(key, value);
        }
        color.setXYZ(i, value, value, value);
      }
      if (plan) color.array.set(inheritComponents(color.array, 3, plan.inherited, plan.classifications, plan.freeEligible));
      results.push({ name: mesh.name, color: color.array.slice() });
    }
  }
  const scalars = Array.from(cache).filter(([, value]) => typeof value === 'number');
  return { results, tree, contact, raw_contact_plant: rawContactPlant, embedded: census,
    cache: { entries: cache.size, scalar_entries: scalars.length,
    hits: cache.hits, misses: cache.misses, writes: cache.writes },
    timers: { tree_ms: treeMs, occupancy_ms: occupancyMs, corners: timers, total_ms: performance.now() - start } };
}
