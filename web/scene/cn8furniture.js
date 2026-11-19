// Copyright (c) Meta Platforms, Inc. and affiliates.

// JOY Q8 furniture assembly. Dimensions below are visual estimates from the
// maintainer's stills and videos, not manufacturer measurements. The bed,
// cushion, pocket apertures and kernel geometry remain authoritative.
import * as THREE from 'three';
export { closeClothJaw, replaceCn8Nets as finishCn8Nets } from './cn8pockets.js';

const V3 = (p) => new THREE.Vector3(...p);
const smooth = (t) => { const v = THREE.MathUtils.clamp(t, 0, 1); return v * v * (3 - 2 * v); };

/** Coplanar subdivision supplies interior lighting samples. Original
 * vertices, apertures and UV seams stay fixed; no physical surface moves. */
export function refineClothSurface(source, G, { railBand = 0 } = {}) {
  const attributes = Object.entries(source.attributes);
  const values = Object.fromEntries(attributes.map(([name, attr]) => [name, Array.from(attr.array)]));
  const position = values.position, midpoints = new Map(), triangles = [];
  const midpoint = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (midpoints.has(key)) return midpoints.get(key);
    const id = position.length / 3;
    for (const [name, attr] of attributes) {
      const data = values[name], offset = data.length;
      for (let axis = 0; axis < attr.itemSize; axis++) data.push((data[a * attr.itemSize + axis] + data[b * attr.itemSize + axis]) / 2);
      if (name === 'normal') {
        const length = Math.hypot(data[offset], data[offset + 1], data[offset + 2]);
        if (length) for (let axis = 0; axis < 3; axis++) data[offset + axis] /= length;
      }
    }
    midpoints.set(key, id); return id;
  };
  const queue = [], index = source.index?.array ?? Array.from({ length: position.length / 3 }, (_, i) => i);
  for (let i = 0; i < index.length; i += 3) queue.push([index[i], index[i + 1], index[i + 2]]);
  while (queue.length) {
    const ids = queue.pop(); let edge = -1, longestRatio = 1;
    // Use one target for the entire triangle. Per-edge targets can leave
    // a long edge spanning a pocket uncut while its two shorter sides are
    // bisected forever toward it, producing degenerate sliver triangles.
    const nearPocket = G.pockets.some(p => ids.some(v =>
      (position[v * 3] - p.x) ** 2 + (position[v * 3 + 2] - p.z) ** 2 < 0.18 ** 2));
    // The bed extends beneath the cushions. Coarse triangles must not
    // interpolate those hidden dark vertices across the playing surface.
    // Test the complete triangle span so a long edge cannot skip the band.
    const crossesBand = (axis, half) => {
      const coordinates = ids.map(v => position[v * 3 + axis]);
      const lo = Math.min(...coordinates), hi = Math.max(...coordinates);
      return [-half, half].some(edge => hi >= edge - railBand && lo <= edge + railBand);
    };
    const maxEdge = nearPocket ? 0.025 : 0.25;
    // Rail occlusion changes quickly across the nose, slowly along it.
    // An anisotropic metric resolves that gradient without subdividing
    // every long, narrow boundary triangle in both directions.
    const steps = [railBand > 0 && crossesBand(0, G.L / 2) ? 0.0125 : maxEdge,
      maxEdge, railBand > 0 && crossesBand(2, G.W / 2) ? 0.0125 : maxEdge];
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3]; let ratio = 0;
      for (let axis = 0; axis < 3; axis++) ratio += ((position[a * 3 + axis] - position[b * 3 + axis]) / steps[axis]) ** 2;
      if (ratio > longestRatio) { longestRatio = ratio; edge = j; }
    }
    if (edge < 0) { triangles.push(...ids); continue; }
    const a = ids[edge], b = ids[(edge + 1) % 3], c = ids[(edge + 2) % 3], m = midpoint(a, b);
    queue.push([a, m, c], [m, b, c]);
  }
  const result = new THREE.BufferGeometry();
  for (const [name, attr] of attributes) result.setAttribute(name,
    new THREE.BufferAttribute(new attr.array.constructor(values[name]), attr.itemSize, attr.normalized));
  result.setIndex(triangles); result.userData = { ...source.userData };
  source.dispose(); return result;
}

export const CN8_FURNITURE = Object.freeze({
  fasciaThickness: 0.025, fasciaBevel: 0.0015,
  headWidth: 0.21, headBottom: -0.255, frameTop: -0.055,
  frameBottom: -0.215, frameThickness: 0.042, frameTrim: 0.014,
  frameReveal: 0.010, panelRecess: 0.004,
  yarnPitch: 0.0054, coursePitch: 0.0081,
});

function add(group, name, geometry, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.position.fromArray(position);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh); return mesh;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

function extrude(shape, thickness, bevel = 0.001) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness - 2 * bevel,
    bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, steps: 1, curveSegments: 8 });
  g.translate(0, 0, -thickness / 2 + bevel);
  return g;
}

/** Finished board stock with closed ends and a small softened edge. The
 * bevel stays inside the requested length, height and outer mounting plane. */
export function fasciaGeometry(length, height) {
  const { fasciaThickness, fasciaBevel: b } = CN8_FURNITURE;
  return extrude(roundedRect(length - 2 * b, height - 2 * b, b), fasciaThickness, b);
}

/** Flare the upper lining into the independently sized leather return.
 * The bed-plane throat and the hanging catch bag retain their dimensions.
 * Casting, knit and their smooth lighting normals share the same mapping. */
export function finishCn8CornerLining(group, G, K, { bandWidth, liningTop }) {
  const sources = new Map(), nrmDone = new Set();
  group.updateMatrixWorld(true);
  const names = /^(?:cn8-(?:net|fallbag|net-apron)|cn8r82-(?:cup|cup-wing|endwrap|fallface))-[0235]$/;
  group.traverse(mesh => {
    if (!mesh.isMesh || !names.test(mesh.name)) return;
    const id = Number(mesh.name.match(/-(\d+)$/)[1]), pocket = G.pockets[id];
    const sx = Math.sign(pocket.x), sz = Math.sign(pocket.z);
    const ox = sx * (G.L / 2 + K.C), oz = sz * (G.W / 2 + K.C);
    const inverse = mesh.matrixWorld.clone().invert(), world = mesh.matrixWorld;
    const map = (p) => {
      const v = p.clone().applyMatrix4(world);
      if (v.y <= 0) return p.clone();
      const x = v.x - ox, z = v.z - oz, radius = Math.hypot(x, z);
      if (radius < 1e-9) return p.clone();
      const angle = Math.acos(THREE.MathUtils.clamp((sx * x + sz * z) / (Math.SQRT2 * radius), -1, 1));
      const angular = 1 - smooth((angle - 50 * Math.PI / 180) / (45 * Math.PI / 180));
      // A ruled flare keeps the finely sampled fabric inside the coarser
      // casting at every height. An S-shaped warp crossed their different
      // tessellation chords and exposed a dark band through the lining.
      const expansion = (K.W_L - bandWidth) * (v.y / liningTop) * angular;
      v.x += x * expansion / radius; v.z += z * expansion / radius;
      return v.applyMatrix4(inverse);
    };
    const normalAt = (p, n) => {
      const h = 1e-5, columns = [];
      for (let axis = 0; axis < 3; axis++) {
        const lo = p.clone(), hi = p.clone();
        lo.setComponent(axis, lo.getComponent(axis) - h);
        hi.setComponent(axis, hi.getComponent(axis) + h);
        columns.push(map(hi).sub(map(lo)).multiplyScalar(1 / (2 * h)));
      }
      const [a, b, c] = columns;
      const transform = new THREE.Matrix3().set(a.x,b.x,c.x, a.y,b.y,c.y, a.z,b.z,c.z).invert().transpose();
      return n.clone().applyMatrix3(transform).normalize();
    };
    const geometry = mesh.geometry, smoothBasis = geometry.userData.cn8Smooth;
    const pairs = [[geometry.attributes.position, geometry.attributes.normal]];
    if (smoothBasis) pairs.push([smoothBasis.pos, smoothBasis.nrm]);
    for (const [position, normal] of pairs) {
      if (!position || sources.has(position)) continue;
      const source = position.array.slice(); sources.set(position, source);
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3().fromArray(source, 3 * i), q = map(p);
        if (q.distanceToSquared(p) < 1e-24) continue;
        position.setXYZ(i, q.x, q.y, q.z);
        if (normal && !nrmDone.has(normal)) {
          const n = normalAt(p, new THREE.Vector3().fromBufferAttribute(normal, i));
          normal.setXYZ(i, n.x, n.y, n.z);
        }
      }
      position.needsUpdate = true;
      if (normal) { normal.needsUpdate = true; nrmDone.add(normal); }
    }
    const basis = geometry.userData.cn8Transport?.normals;
    if (basis) {
      const source = sources.get(geometry.attributes.position);
      geometry.userData.cn8Transport.normals = basis.map((n, i) => normalAt(
        new THREE.Vector3().fromArray(source, 3 * i), new THREE.Vector3(...n)).toArray());
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.cn8JoyOpening = { bandWidth, liningTop, bedPlaneFixed: true };
  });
}

function lathe(profile) {
  const curve = new THREE.SplineCurve(profile.map(p => new THREE.Vector2(...p)));
  const points = curve.getPoints(profile.length * 3);
  // Close both ends after sampling the outline. The foot's round shoulder
  // is wider than the octagonal column; an open lathe left a visible annular
  // hole between them. Axis points must not influence the outline spline.
  points.unshift(new THREE.Vector2(0, profile[0][1]));
  points.push(new THREE.Vector2(0, profile.at(-1)[1]));
  return new THREE.LatheGeometry(points, 48);
}

function timberMap() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d'), im = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const v = 1 + 0.065 * Math.sin(y * 1.71 + 0.9 * Math.sin(x / 100))
      + 0.035 * Math.sin(y * 4.2 + Math.sin(x / 59));
    const i = 4 * (y * c.width + x);
    im.data[i] = 188 * v; im.data[i + 1] = 165 * v; im.data[i + 2] = 147 * v; im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 7);
  tex.anisotropy = 8; return tex;
}

/** The load-bearing frame is between the leg heads, well inside the fascia.
 * Its cream bottom moulding follows a shallow arch between each pair. */
export function buildCn8Cabinet(group, G, { bodyOffset, footprint, fasciaBottom }) {
  const K = CN8_FURNITURE, { L, W } = G;
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x59262b, map: timberMap(),
    roughness: 0.39, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.3, envMapIntensity: 0.22 });
  wood.name = 'cn8-cabinet-mahogany';
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xd5bc98, roughness: 0.47,
    metalness: 0, clearcoat: 0.14, clearcoatRoughness: 0.35, envMapIntensity: 0.2 });
  cream.name = 'cn8-cabinet-cream';
  const recess = cream.clone(); recess.color.setHex(0xba9c77); recess.roughness = 0.61;
  recess.name = 'cn8-leg-recess';
  const hardware = new THREE.MeshStandardMaterial({ color: 0x77746b, metalness: 0.78,
    roughness: 0.28, envMapIntensity: 0.65 }); hardware.name = 'cn8-pocket-runner-metal';
  const strap = new THREE.MeshStandardMaterial({ color: 0x30241b, roughness: 0.84 });
  strap.name = 'cn8-pocket-support-leather';
  const legX = L / 2 + footprint - 0.45;
  const legZ = W / 2 + footprint - 0.20;
  const midZ = legZ - 0.05;
  const frameZ = midZ + K.headWidth / 2 - K.frameReveal;
  const frameX = legX + K.headWidth / 2 - K.frameReveal;
  const beam = (name, length, position, angle) => {
    const top = K.frameTop, bottom = K.frameBottom;
    const shape = new THREE.Shape();
    shape.moveTo(-length / 2, top); shape.lineTo(length / 2, top);
    shape.lineTo(length / 2, bottom);
    shape.lineTo(length / 2 - 0.055, bottom);
    shape.quadraticCurveTo(length / 2 - 0.080, bottom + 0.019, length / 2 - 0.115, bottom + 0.019);
    shape.lineTo(-length / 2 + 0.115, bottom + 0.019);
    shape.quadraticCurveTo(-length / 2 + 0.080, bottom + 0.019, -length / 2 + 0.055, bottom);
    shape.lineTo(-length / 2, bottom); shape.closePath();
    const m = add(group, name, extrude(shape, K.frameThickness), wood, position); m.rotation.y = angle;
    const trim = new THREE.Shape();
    const upper = [], lower = [];
    for (let i = 0; i <= 64; i++) {
      const x = -length / 2 + length * i / 64;
      const lift = 0.019 * smooth((length / 2 - Math.abs(x) - 0.055) / 0.06);
      upper.push([x, bottom + lift + K.frameTrim]); lower.push([x, bottom + lift]);
    }
    trim.moveTo(...upper[0]); upper.slice(1).forEach(p => trim.lineTo(...p));
    lower.reverse().forEach(p => trim.lineTo(...p)); trim.closePath();
    const t = add(group, name + '-trim', extrude(trim, K.frameThickness + 0.002, 0.0006), cream, position); t.rotation.y = angle;
  };
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    beam(`cn8-frame-long-${sz}-${sx}`, legX - K.headWidth + 0.016,
      [sx * legX / 2, 0, sz * (frameZ - K.frameThickness / 2)], 0);
  }
  for (const sx of [-1, 1]) beam(`cn8-frame-end-${sx}`, 2 * legZ - K.headWidth + 0.016,
    [sx * (frameX - K.frameThickness / 2), 0, 0], Math.PI / 2);

  const headTop = fasciaBottom + 0.013, headHeight = headTop - K.headBottom;
  const shoulder = lathe([[0.075,-0.406],[0.084,-0.399],[0.086,-0.388],
    [0.077,-0.375],[0.084,-0.355],[0.106,-0.333],[0.111,-0.314],
    [0.106,-0.294],[0.091,-0.278],[0.078,-0.267],[0.078,-0.255]]);
  const foot = lathe([[0.056,-0.790],[0.059,-0.774],[0.063,-0.764],
    [0.077,-0.752],[0.087,-0.738],[0.087,-0.726],[0.079,-0.714],[0.080,-0.706]]);
  const head = extrude(roundedRect(K.headWidth - 0.002, headHeight - 0.002, 0.004), K.headWidth, 0.001);
  const columnSource = new THREE.CylinderGeometry(0.093, 0.077, 0.30, 8, 1);
  columnSource.rotateY(Math.PI / 8);
  const column = columnSource.toNonIndexed(); column.computeVertexNormals(); columnSource.dispose();
  const stations = [[-1,-1],[-1,1],[0,-1],[0,1],[1,-1],[1,1]];
  for (const [i, [sx, sz]] of stations.entries()) {
    const x = sx * legX, z = sz * (sx === 0 ? midZ : legZ);
    const hy = (headTop + K.headBottom) / 2;
    const h = add(group, `cn8-leg-${i}`, head, wood, [x,hy,z]); h.userData.cn8Part = 'head';
    // Mahogany panels are sunk into a cream surround on all four head faces.
    const borderShape = roundedRect(K.headWidth - 0.004, headHeight - 0.004, 0.004);
    borderShape.holes.push(roundedRect(K.headWidth - 0.026, headHeight - 0.024, 0.004));
    const panel = extrude(borderShape, 0.007, 0.0008);
    for (let f = 0; f < 4; f++) {
      const a = f * Math.PI / 2, d = K.headWidth / 2 + 0.001;
      const p = add(group, `cn8-leg-head-border-${i}-${f}`, panel, cream,
        [x + Math.sin(a) * d, hy, z + Math.cos(a) * d]); p.rotation.y = a;
    }
    for (const [name, geo, y] of [['shoulder',shoulder,0],['column',column,-0.556],['foot',foot,0]]) {
      const m = add(group, `cn8-leg-${i}`, geo, cream, [x,y,z]); m.userData.cn8Part = name;
    }
    // Inset fields with a bevelled border; the long face is tapered with
    // the column. The field is a real depression in the raised surround.
    for (let f = 0; f < 8; f++) {
      const a = f * Math.PI / 4, d = 0.080;
      const panelShape = roundedRect(0.042, 0.236, 0.012);
      const border = panelShape.clone();
      border.holes.push(roundedRect(0.034, 0.224, 0.010));
      const field = add(group, `cn8-leg-recess-${i}-${f}`, extrude(roundedRect(0.035,0.225,0.010),0.001,0), recess,
        [x + Math.sin(a) * d,-0.556,z + Math.cos(a) * d]);
      const rim = add(group, `cn8-leg-panel-border-${i}-${f}`, extrude(border,0.004,0.0008), cream,
        [x + Math.sin(a) * (d + 0.002),-0.556,z + Math.cos(a) * (d + 0.002)]);
      for (const m of [field, rim]) { m.rotation.y = a; m.rotateX(Math.atan((0.093 - 0.077) / 0.30)); }
    }
  }
  group.userData.cn8Furniture = { fasciaOuter: [L/2 + bodyOffset,W/2 + bodyOffset],
    frameOuter: [frameX,frameZ], frameTop: K.frameTop, frameBottom: K.frameBottom,
    headTop, headBottom: K.headBottom, legCount: stations.length };
  buildRunners(group, G, { legX, frameZ, hardware, strap });
}

function tube(group, name, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(V3), false, 'centripetal');
  return add(group,name,new THREE.TubeGeometry(curve,Math.max(24,points.length*8),radius,8,false),material);
}

function buildRunners(group, G, { legX, frameZ, hardware, strap }) {
  // Two bent rods lead away from each pocket into an open ball cradle.
  // Their free end is suspended from the recessed frame by a leather strap.
  for (const [i,p] of G.pockets.entries()) {
    const corner = Math.abs(p.x) > 1e-6, sx = Math.sign(p.x) || 1, sz = Math.sign(p.z);
    const ring = group.getObjectByName(`cn8-ring-${corner ? 'gold' : 'iron'}-${i}`);
    if (!ring) continue;
    ring.userData.cn8Supported = true;
    const { x, y, z } = ring.position;
    const endX = corner ? sx * (legX - 0.22) : sx * 0.40;
    const endZ = sz * (group.userData.cn8Furniture.fasciaOuter[1] - 0.025), railY = -0.287;
    for (const lane of [-1,1]) {
      const dz = lane * 0.021;
      const leadX = x + Math.sign(endX-x) * Math.sqrt((corner ? 0.033 : 0.032) ** 2 - dz ** 2);
      tube(group,`cn8-pocket-runner-${i}-${lane}`,[[leadX,y-0.002,z+dz],[leadX,y-0.044,z+dz],
        [leadX+Math.sign(endX-x)*0.023,railY+0.007,z+dz],
        [corner ? sx*(legX+0.15) : 0.16,railY,endZ+dz],
        [endX-Math.sign(endX-x)*0.04,railY,endZ+dz],[endX,railY+0.004,endZ+dz]],0.0025,hardware);
    }
    tube(group,`cn8-pocket-runner-end-${i}`,[[endX,railY+0.004,endZ-0.021],
      [endX+Math.sign(endX-x)*0.018,railY+0.004,endZ],
      [endX,railY+0.004,endZ+0.021]],0.0025,hardware);
    // Flat straps, not another set of metallic rods.
    const path = [[endX,-0.142,sz*(frameZ+0.003)],[endX,-0.186,sz*(frameZ+0.014)],
      [endX,railY+0.006,endZ],[endX,railY-0.006,endZ]];
    const positions = [], indices = [];
    path.forEach(([px,py,pz]) => positions.push(px-0.006,py,pz,px+0.006,py,pz));
    for(let j=0;j<path.length-1;j++){const a=j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    const mat=strap.clone();mat.side=THREE.DoubleSide;
    add(group,`cn8-pocket-runner-strap-${i}`,geo,mat);
    const fastener = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0035,1),hardware);
    fastener.name=`cn8-pocket-runner-fastener-${i}`;fastener.position.fromArray(path[0]);group.add(fastener);
  }
}
