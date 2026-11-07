// Copyright (c) Meta Platforms, Inc. and affiliates.

// Closed cushion returns and geometric cotton netting for the JOY pockets.
import * as THREE from 'three';

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };

/** Complete the existing crest/deck loft without moving its contact edge.
 * Every cross section returns down the back, across the underside and up
 * the original cushion slope. The two cut ends are triangulated as well. */
export function closeClothJaw({ pos, uv, col, idx, rows, cols, toWorld, height, tanAlpha }) {
  const sections = [];
  for (let i = 0; i < rows.length; i++) {
    const section = Array.from({ length: cols }, (_, j) => i * cols + j);
    const far = section[cols - 1], row = rows[i];
    const append = (x, y, z, u, v) => {
      const id = pos.length / 3;
      pos.push(x, y, z); uv.push(u, v); col.push(1, 1, 1); section.push(id);
    };
    append(pos[far * 3], -0.004, pos[far * 3 + 2], uv[far * 2], 0.046);
    for (const [fraction, y] of [[1.12, -0.004], [1, 0], [0.7, height * 0.3],
      [0.35, height * 0.65], [0.028, height - 0.001]]) {
      const offset = fraction * height / tanAlpha;
      const [x, z] = toWorld(row.c[0] + row.n[0] * offset, row.c[1] + row.n[1] * offset);
      append(x, y, z, row.row * 0.08, offset);
    }
    sections.push(section);
  }
  // Fan rows at a sharp junction sit within a micron of each other (the
  // caller snaps its crest/deck lattice the same way), so their returns do
  // too: snap each appended vertex onto the previous section's, and the
  // area test below drops the collapsed strips instead of leaving slivers
  // that weld into non-manifold edges.
  for (let i = 1; i < sections.length; i++) {
    for (let j = cols; j < sections[i].length; j++) {
      const p = sections[i][j] * 3, q = sections[i - 1][j] * 3;
      if (Math.hypot(pos[p] - pos[q], pos[p + 1] - pos[q + 1], pos[p + 2] - pos[q + 2]) < 1e-6) {
        pos[p] = pos[q]; pos[p + 1] = pos[q + 1]; pos[p + 2] = pos[q + 2];
      }
    }
  }
  const triangle = (a, b, c) => {
    const p = new THREE.Vector3().fromArray(pos, a * 3), q = new THREE.Vector3().fromArray(pos, b * 3);
    const r = new THREE.Vector3().fromArray(pos, c * 3);
    if (q.sub(p).cross(r.sub(p)).lengthSq() > 1e-28) idx.push(a, b, c);
  };
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i], b = sections[i + 1];
    for (let j = cols - 1; j < a.length; j++) {
      const k = (j + 1) % a.length;
      triangle(a[j], b[j], a[k]); triangle(a[k], b[j], b[k]);
    }
  }
  for (const end of [0, sections.length - 1]) {
    const row = rows[end], [cx, cz] = toWorld(...row.c);
    const [nx, nz] = toWorld(row.c[0] + row.n[0], row.c[1] + row.n[1]);
    const outline = [], ids = [];
    for (const id of sections[end]) {
      const p = new THREE.Vector2((pos[id * 3] - cx) * (nx - cx)
        + (pos[id * 3 + 2] - cz) * (nz - cz), pos[id * 3 + 1]);
      if (outline.length && p.distanceToSquared(outline.at(-1)) < 1e-20) continue;
      outline.push(p); ids.push(id);
    }
    const clockwise = THREE.ShapeUtils.isClockWise(outline);
    for (const face of THREE.ShapeUtils.triangulateShape(outline, [])) {
      const [a, b, c] = face.map(i => outline[i]);
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const reverse = (cross < 0) !== clockwise;
      const vertices = face.map(i => ids[i]);
      if (reverse !== (end !== 0)) vertices.reverse();
      triangle(...vertices);
    }
  }
  return { closed: true, topVertices: rows.length * cols, bottomY: -0.004 };
}

/** Six-sided round cords have actual walls and capped ends. All cords are
 * merged into one draw call per pocket; no alpha map or underlying sheet. */
function cordBuilder() {
  const positions = [], normals = [], indices = [], cords = [];
  const add = (points, radius) => {
    const firstVertex = positions.length / 3, firstIndex = indices.length, sides = 6;
    for (let i = 0; i < points.length; i++) {
      const point = points[i], tangent = points[Math.min(i + 1, points.length - 1)].clone()
        .sub(points[Math.max(0, i - 1)]).normalize();
      let normal = new THREE.Vector3(point.x, 0, point.z);
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-12) normal = new THREE.Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x);
      normal.normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      for (let j = 0; j < sides; j++) {
        const a = j * 2 * Math.PI / sides;
        const n = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        const r = typeof radius === 'function' ? radius(i / (points.length - 1)) : radius;
        positions.push(point.x + r * n.x, point.y + r * n.y, point.z + r * n.z);
        normals.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i + 1 < points.length; i++) for (let j = 0; j < sides; j++) {
      const a = firstVertex + i * sides + j, b = firstVertex + i * sides + (j + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
    for (const end of [0, points.length - 1]) {
      const point = points[end], center = positions.length / 3;
      const n = point.clone().sub(points[end === 0 ? 1 : end - 1]).normalize();
      positions.push(point.x, point.y, point.z); normals.push(n.x, n.y, n.z);
      const start = firstVertex + end * sides;
      for (let j = 0; j < sides; j++) {
        const a = start + j, b = start + (j + 1) % sides;
        indices.push(center, end === 0 ? b : a, end === 0 ? a : b);
      }
    }
    cords.push({ firstVertex, vertices: positions.length / 3 - firstVertex,
      firstIndex, indices: indices.length - firstIndex });
  };
  return { add, finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.userData.cn8Yarn = { cords, radius: 0.00065, sides: 6, alphaMap: false };
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  } };
}

function radiusAt(profile, y) {
  for (let i = 0; i + 1 < profile.length; i++) if (y >= profile[i + 1][1]) {
    const [a, b] = [profile[i], profile[i + 1]], t = clamp((a[1] - y) / (a[1] - b[1]));
    return a[0] + (b[0] - a[0]) * t;
  }
  return profile.at(-1)[0];
}

function cornerSurface(sx, sz, K, binding) {
  const top = binding.liningTop, bottom = -0.191;
  const profile = [[0.083, -0.020], [0.081, -0.050], [0.070, -0.092],
    [0.066, -0.108], [0.060, -0.125], [0.050, -0.148], [0.036, -0.171],
    [0.0305, -0.181], [0.023, -0.188], [0.0012, bottom]];
  return (u, v) => {
    const a = u * 2 * Math.PI, x = Math.sin(a), z = Math.cos(a);
    const angle = Math.acos(THREE.MathUtils.clamp((sx * x + sz * z) / Math.SQRT2, -1, 1));
    const flare = 1 - smooth((angle - 50 * Math.PI / 180) / (45 * Math.PI / 180));
    const height = top + (bottom - top) * v;
    const y = height - (top + 0.0015) * (1 - flare) * (1 - v);
    const rim = 0.0515 + (K.W_L - binding.bandWidth) * flare;
    // The cloth/slate cut is still R52.5 at bed height. The net must pass
    // through that opening before it can open into the hanging bag; a
    // direct wide loft intersected the bed and exposed a dark annular shelf.
    const throat = K.R - 0.0025;
    const r = y >= 0 ? throat + (rim - throat) * clamp(y / top)
      : y > -0.025 ? throat + (profile[0][0] - throat) * smooth(-y / 0.025)
        : radiusAt(profile, y);
    let px = r * x, pz = r * z;
    const gate = -0.0435, limit = 0.060;
    if (px * sx < gate + 0.008 && pz * sz > limit) pz += sz * (limit - pz * sz) * clamp((gate + 0.008 - px * sx) / 0.008);
    if (pz * sz < gate + 0.008 && px * sx > limit) px += sx * (limit - px * sx) * clamp((gate + 0.008 - pz * sz) / 0.008);
    return new THREE.Vector3(px, y, pz);
  };
}

function middleSurface(topMesh, lowMesh, sz) {
  const top = topMesh.geometry.attributes.position, low = lowMesh.geometry.attributes.position;
  const topRows = top.count / 257, lowRows = low.count / 41;
  const sample = (p, rows, segments, angleFirst, u, y) => {
    const vertex = (row, angle) => new THREE.Vector3().fromBufferAttribute(p,
      angleFirst ? angle * rows + row : row * (segments + 1) + angle);
    let row = 0;
    while (row + 2 < rows && vertex(row + 1, 0).y > y) row++;
    const a = vertex(row, 0).y, b = vertex(row + 1, 0).y, t = clamp((a - y) / (a - b));
    const q = ((u % 1) + 1) % 1 * segments, col = Math.floor(q), f = q - col;
    return vertex(row, col).lerp(vertex(row, col + 1), f)
      .lerp(vertex(row + 1, col).lerp(vertex(row + 1, col + 1), f), t);
  };
  const firstY = top.getY(0) - 0.0004, lastY = low.getY(lowRows - 1);
  return (u, v) => {
    const y = firstY + (lastY - firstY) * v;
    return y >= -0.092 ? sample(top, topRows, 256, false, u, y)
      : sample(low, lowRows, 40, true, sz < 0 ? 0.5 - u : u, y);
  };
}

export function replaceCn8Nets(group, G, K, binding) {
  const previousMaterials = new Set();
  const material = new THREE.MeshStandardMaterial({ color: 0xeee8d8,
    roughness: 0.94, metalness: 0, envMapIntensity: 0.15 });
  material.name = 'cn8-cotton-cords';
  for (const [id, p] of G.pockets.entries()) {
    const corner = Math.abs(p.x) > 1e-6, sx = Math.sign(p.x) || 1, sz = Math.sign(p.z);
    const top = group.getObjectByName(`cn8-net-${id}`), low = group.getObjectByName(`cn8-net-low-${id}`);
    const surface = corner ? cornerSurface(sx, sz, K, binding) : middleSurface(top, low, sz);
    const weave = cordBuilder(), strands = corner ? 48 : 28, courses = corner ? 28 : 20;
    const steps = courses * 4, yarnRadius = 0.00065;
    for (const direction of [-1, 1]) for (let strand = 0; strand < strands; strand++) {
      const points = [];
      for (let step = 0; step <= steps; step++) {
        const v = step / steps, u = (strand + direction * v * courses) / strands;
        const point = surface(u, v), radial = new THREE.Vector3(point.x, 0, point.z).normalize();
        // Opposing cords pass over/under one another at every junction.
        point.addScaledVector(radial, direction * yarnRadius * Math.cos(2 * Math.PI * v * courses));
        points.push(point);
      }
      weave.add(points, v => yarnRadius * (1 + 0.13 * Math.cos(2 * Math.PI * v * courses) ** 8));
    }
    // Sewn selvedge and the gathered bottom are cords too, never discs.
    for (const v of [0, 0.998]) {
      const points = Array.from({ length: strands * 2 + 1 }, (_, i) => surface(i / (strands * 2), v));
      weave.add(points, v === 0 ? 0.0011 : 0.0008);
    }
    const geometry = weave.finish();
    geometry.userData.cn8Yarn.strands = strands * 2;
    geometry.userData.cn8Yarn.courses = courses;
    const previous = low.geometry;
    previousMaterials.add(low.material);
    low.geometry = geometry; low.material = material;
    low.castShadow = true; low.receiveShadow = true;
    const retired = [];
    group.traverse(mesh => {
      if (!mesh.isMesh || !mesh.name.endsWith('-' + id) || mesh === low) return;
      if (/^cn8-(?:net(?:-apron|-hem)?|fallbag(?:-shell)?)-/.test(mesh.name)
        || corner && /^cn8r82-(?:cup|cup-wing|endwrap|hole)-/.test(mesh.name)) retired.push(mesh);
    });
    for (const mesh of retired) {
      previousMaterials.add(mesh.material); group.remove(mesh); mesh.geometry.dispose();
    }
    previous.dispose();
  }
  const retained = new Set(), retainedTextures = new Set(), releasedTextures = new Set();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      retained.add(mat);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (mat[key]) retainedTextures.add(mat[key]);
    }
  });
  for (const mat of previousMaterials) if (!retained.has(mat)) {
    for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
      const texture = mat[key];
      if (texture && !retainedTextures.has(texture) && !releasedTextures.has(texture)) {
        texture.dispose(); releasedTextures.add(texture);
      }
    }
    mat.dispose();
  }
  group.userData.cn8GeometricNets = { pockets: 6, yarnDiameter: 0.0013, opaqueBacking: false };
}
