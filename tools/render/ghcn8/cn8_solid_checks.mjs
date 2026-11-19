// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-12 full-solid oracle. Actual THREE.Mesh.raycast on consecutive source
// triangle chunks, independently indexed from the renderer's triangle BVH.
import * as THREE from '../../../web/vendor/three.module.min.js';
import { solveLiner, wallLighting } from './cn8_transport_solver.mjs';

export function capturedArray(attribute) {
  const Type = globalThis[attribute.type];
  if (!Type?.BYTES_PER_ELEMENT) throw new Error('Unknown captured attribute type');
  const result = new Type(attribute.array), seen = new Set();
  for (const i of attribute.negative_zero_indices ?? []) {
    if (![Float32Array, Float64Array].includes(Type) || !Number.isInteger(i)
      || i < 0 || i >= result.length || result[i] !== 0 || seen.has(i)) {
      throw new Error('Invalid captured signed-zero index');
    }
    result[i] = -0; seen.add(i);
  }
  return result;
}

export function restoreCapturedValue(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.cn8CapturedNegativeZero === true && Object.keys(value).length === 1) return -0;
  if (Array.isArray(value)) return value.map(restoreCapturedValue);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreCapturedValue(child)]));
}

export function sceneFromBuffers(rows) {
  const group = new THREE.Group();
  for (const row of rows) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(row.attributes)) {
      geometry.setAttribute(name, new THREE.BufferAttribute(capturedArray(attribute), attribute.itemSize, attribute.normalized));
    }
    if (row.index) geometry.setIndex(new THREE.BufferAttribute(new globalThis[row.index.type](row.index.array), 1));
    for (const g of row.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    if (row.drawRange) geometry.setDrawRange(row.drawRange.start, row.drawRange.count ?? Infinity);
    const materials = row.materials.map(m => new THREE.MeshBasicMaterial({
      visible: m.visible, opacity: m.opacity, transparent: m.transparent, side: m.side,
    }));
    const mesh = new THREE.Mesh(geometry, row.materialArray ? materials : materials.length === 1 ? materials[0] : materials);
    mesh.name = row.name; mesh.visible = row.visible;
    mesh.matrixAutoUpdate = false; mesh.matrix.fromArray(row.matrix);
    geometry.userData = restoreCapturedValue(row.userData ?? {});
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

export function fullSolidMeshOracle(group) {
  group.updateMatrixWorld(true);
  const rootInverse = group.matrixWorld.clone().invert(), point = new THREE.Vector3();
  const chunks = [], members = [], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let ordinal = 0;
  function collect(object, visible) {
    visible = visible && object.visible;
    if (object.isMesh) {
      const identity = ordinal++;
      if (visible) {
        if (object.isInstancedMesh || object.isSkinnedMesh) throw new Error('Unexpanded actual solid');
        const g = object.geometry, source = g.getAttribute('position'), index = g.index;
        const matrix = rootInverse.clone().multiply(object.matrixWorld);
        const world = new Float64Array(source.count * 3);
        for (let i = 0; i < source.count; i++) {
          point.fromBufferAttribute(source, i).applyMatrix4(matrix).toArray(world, i * 3);
        }
        const vertex = new THREE.BufferAttribute(world, 3), ids = [];
        const arrayMaterial = Array.isArray(object.material);
        const count = index?.count ?? source.count;
        const end = Math.min(count, g.drawRange.start + g.drawRange.count);
        for (let i = g.drawRange.start; i + 2 < end; i += 3) {
          const candidates = arrayMaterial ? g.groups.filter(range =>
            range.start <= i && range.start + range.count >= i + 3).map(range => object.material[range.materialIndex]) : [object.material];
          for (const m of candidates) if (m?.visible && !m.transparent && m.opacity === 1) {
            ids.push(index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2);
          }
        }
        if (ids.length) members.push({ ordinal: identity, name: object.name || '(unnamed)', triangles: ids.length / 3, vertices: source.count });
        // TESSELLATION / CPU acceleration only: consecutive eight-triangle
        // chunks, not the production spatial ordering. The complete source
        // set and Mesh.raycast semantics are unchanged by this partition.
        for (let start = 0; start < ids.length; start += 8 * 3) {
          const indices = ids.slice(start, start + 8 * 3), geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', vertex); geometry.setIndex(indices);
          geometry.boundingBox = new THREE.Box3();
          for (const i of indices) geometry.boundingBox.expandByPoint(point.fromArray(world, i * 3));
          geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
          const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true);
          chunks.push({ mesh, ordinal: identity, name: object.name || '(unnamed)', sourceTriangleStart: start / 3,
            box: geometry.boundingBox, centre: geometry.boundingBox.getCenter(new THREE.Vector3()) });
        }
      }
    }
    for (const child of object.children) collect(child, visible);
  }
  collect(group, true);
  const build = entries => {
    const box = new THREE.Box3(); for (const row of entries) box.union(row.box);
    if (entries.length <= 4) return { box, entries };
    const size = box.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    entries.sort((a, b) => a.centre[axis] - b.centre[axis]);
    const split = Math.floor(entries.length / 2);
    return { box, children: [build(entries.slice(0, split)), build(entries.slice(split))] };
  };
  const root = build(chunks.slice()), raycaster = new THREE.Raycaster();
  const hitBox = new THREE.Vector3(), v = new THREE.Vector3();
  let minimumDistance = 0, nearestDistance = Infinity;
  function accepted(entry, hit) {
    const origin = raycaster.ray.origin, position = entry.mesh.geometry.getAttribute('position');
    if (hit.point.equals(origin)) return false;
    if (hit.distance < minimumDistance) return false;
    // Exact source-vertex incidence removes the ray's open endpoint even
    // when a rounded intersection parameter would otherwise be positive.
    return ![hit.face.a, hit.face.b, hit.face.c].some(i => v.fromBufferAttribute(position, i).equals(origin));
  }
  function visit(node, trace) {
    if (!raycaster.ray.intersectBox(node.box, hitBox)) return null;
    // Exact lower-bound pruning for the nearest-hit disclosure. A ray that
    // starts inside a box has lower bound zero, not the exit-face distance.
    if (trace && !node.box.containsPoint(raycaster.ray.origin)
      && hitBox.distanceTo(raycaster.ray.origin) > nearestDistance) return null;
    if (node.children) {
      const first = visit(node.children[0], trace);
      if (first && !trace) return first;
      const second = visit(node.children[1], trace);
      return !first ? second : !second || first.distance <= second.distance ? first : second;
    }
    let best = null;
    for (const entry of node.entries) {
      if (!raycaster.ray.intersectBox(entry.box, hitBox)) continue;
      const hits = []; entry.mesh.raycast(raycaster, hits);
      for (const hit of hits) if (accepted(entry, hit)) {
        const result = { ordinal: entry.ordinal, name: entry.name, distance: hit.distance,
          source_triangle: entry.sourceTriangleStart + hit.faceIndex, point: hit.point.toArray() };
        if (!trace) return result;
        if (!best || result.distance < best.distance) best = result;
        nearestDistance = Math.min(nearestDistance, result.distance);
      }
    }
    return best;
  }
  function query(ray, trace, minimum = 0) {
    if (!Number.isFinite(minimum) || minimum < 0) throw new Error('Invalid derived contact distance');
    minimumDistance = minimum;
    nearestDistance = Infinity;
    raycaster.ray.origin.fromArray(ray);
    raycaster.ray.direction.fromArray(ray, 3).normalize();
    return visit(root, trace);
  }
  return { members, triangle_count: members.reduce((n, m) => n + m.triangles, 0), batch_count: chunks.length,
    blocked: (ray, minimum = 0) => Boolean(query(ray, false, minimum)),
    trace: (ray, minimum = 0) => query(ray, true, minimum),
    dispose() { for (const row of chunks) row.mesh.geometry.dispose(); material.dispose(); } };
}

export function productionWallLighting(renderer, geometry, dimensions, signs, blocked) {
  if (renderer.includes('cn8Transport.apply(group, G, CN8_R82')) {
    return wallLighting({ dimensions, signs, voidSide: geometry.voidSide, blocked });
  }
  const site = renderer.indexOf('      const buildCornerR82 =');
  const lamp = renderer.indexOf('        const LAMP_Y =', site);
  const map = renderer.indexOf('        const W2M =', lamp);
  const hemi = renderer.indexOf('        const hemiAO =', map);
  const end = renderer.indexOf('        // the single vertex scalar', hemi);
  const scalar = renderer.indexOf('v = Math.max(0.05,', end);
  const scalarEnd = renderer.indexOf(';', scalar);
  if ([site, lamp, map, hemi, end, scalar, scalarEnd].some(i => i < 0)) throw new Error('Missing production transport recipe');
  const toM = (x, z) => [x / signs[0] - dimensions[0] / 2, z / signs[1] - dimensions[1] / 2];
  const code = renderer.slice(lamp, map) + renderer.slice(hemi, end)
    + '\nreturn (wx,vz,wz) => {let v; ' + renderer.slice(scalar, scalarEnd + 1) + 'return v;};';
  return new Function('rayOpen', 'voidSide', 'W2M', code)(
    (...ray) => !blocked(ray), geometry.voidSide, toM);
}

export function capturedGeometry(row) {
  const group = sceneFromBuffers([{ ...row, matrix: new THREE.Matrix4().toArray() }]);
  const geometry = group.children[0].geometry;
  const smooth = geometry.userData.cn8Smooth;
  if (smooth) for (const key of ['pos', 'nrm']) {
    const a = smooth[key];
    if (!a?.array || !a.itemSize || !globalThis[a.type]?.BYTES_PER_ELEMENT) throw new Error('Missing captured smooth normal/position basis');
    smooth[key] = new THREE.BufferAttribute(capturedArray(a), a.itemSize);
  }
  return geometry;
}

export function productionLinerLighting(renderer) {
  if (renderer.includes('cn8Transport.apply(group, G, CN8_R82')) return solveLiner;
  const start = renderer.indexOf('      if (cornerP) cn8LinerJobs.push(() => {');
  const end = renderer.indexOf('      // ROUND-20 shallow-bowl remap', start);
  if (start < 0 || end < 0) throw new Error('Completed-solid liner solver is absent');
  // The retained radiometry is source-extracted; only its blocker provider is
  // substituted with the independent full-mesh raycast. This is a CPU replay,
  // not a second lighting formula or a fitted multiplier.
  const code = `const {netGeo, cn8TransportIndex, p, L, W, CN8_R82, cn8Solids, clothMat, G} = context;
    const cn8LinerJobs=[], cn8TransportCache=new Map(), cornerP=true;
    let cn8MouthLamp=null;
    ${renderer.slice(start, end)}
    if(cn8LinerJobs.length!==1)throw new Error('Exactly one liner solve required');
    cn8LinerJobs[0]();
    return { geometry:netGeo, lamps:cn8MouthLamp };`;
  return new Function('context', code);
}
