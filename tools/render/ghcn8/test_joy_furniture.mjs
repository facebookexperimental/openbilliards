// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { apply } from '../../../web/scene/cn8transport.js';
import { currentArtifact } from '../../../web/scene/cn8transport-data.js';
import { solverIdentity } from './gen_transport_artifact.mjs';
import { bufferTopology, loadCornerBuilder, sectionCrossings } from './cn8_emitted_checks.mjs';
import { inheritSurfaceTransport } from './cn8_embedded_receivers.mjs';

const cache = new Map();
async function built(alias) {
  if (!cache.has(alias)) cache.set(alias, await buildTransportInputs({ tableId: alias }));
  return cache.get(alias);
}
const aliases = ['chinese8_pro_9ft', 'joy_q8_9ft'];

test('cloth subdivision terminates when a coarse edge spans a pocket refinement zone', async () => {
  const { THREE: T } = await built(aliases[0]);
  const source = fs.readFileSync(new URL('../../../web/scene/cn8furniture.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function refineClothSurface(');
  const end = source.indexOf('\n}\n', start) + 2;
  const refine = new Function('THREE', source.slice(start, end).replace('export ', '')
    + '\nreturn refineClothSurface;')(T);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-0.12,0,0.15, 0.12,0,0.15, 0,0,0.14], 3));
  geometry.setIndex([0, 1, 2]);
  const result = refine(geometry, { pockets: [{ x: 0, z: 0 }] });
  const position = result.attributes.position, index = result.index;
  assert.ok(position.count < 300, 'The narrow triangle must not bisect toward an uncut base forever');
  let area = 0;
  for (let i = 0; i < index.count; i += 3) {
    const points = [0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(position, index.getX(i + j)));
    const limit = points.some(p => Math.hypot(p.x, p.z) < 0.18) ? 0.025 : 0.25;
    for (let j = 0; j < 3; j++) assert.ok(points[j].distanceTo(points[(j + 1) % 3]) <= limit + 1e-7);
    area += new T.Triangle(...points).getArea();
  }
  assert.ok(Math.abs(area - 0.0012) < 1e-8, 'Refinement preserves the original surface');
});

test('bed lighting does not stretch a hidden cushion shadow into the open playing surface', async () => {
  const { THREE: T } = await built(aliases[0]);
  const source = fs.readFileSync(new URL('../../../web/scene/cn8furniture.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function refineClothSurface(');
  const end = source.indexOf('\n}\n', start) + 2;
  const refine = new Function('THREE', source.slice(start, end).replace('export ', '')
    + '\nreturn refineClothSurface;')(T);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([
    -0.3,0,0.40, 0.3,0,0.40, 0.3,0,0.75, -0.3,0,0.75,
  ], 3));
  geometry.setIndex([0,2,1, 0,3,2]);
  const refined = refine(geometry, { L: 2.54, W: 1.27, pockets: [] }, { railBand: 0.10 });
  const mesh = new T.Mesh(refined, new T.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const pos = refined.attributes.position;
  const light = z => 1 - 0.95 * Math.max(0, Math.min(1, (z - 0.625) / 0.01));
  const sample = (x, z) => {
    const hit = new T.Raycaster(new T.Vector3(x, 0.1, z), new T.Vector3(0, -1, 0))
      .intersectObject(mesh, false)[0];
    assert.ok(hit);
    const vertices = [hit.face.a, hit.face.b, hit.face.c].map(i => new T.Vector3().fromBufferAttribute(pos, i));
    const weights = new T.Triangle(...vertices).getBarycoord(hit.point, new T.Vector3());
    return vertices.reduce((sum, p, i) => sum + light(p.z) * weights.getComponent(i), 0);
  };
  for (const x of [-0.20, 0, 0.20]) {
    assert.ok(sample(x, 0.60) > 0.999, 'Open cloth 35 mm inside the nose must retain its measured light');
    assert.ok(sample(x, 0.67) < 0.051, 'The hidden shadow remains dark');
  }
});

test('JOY furniture: both aliases build the same recessed six-leg assembly and consume the current transport', async () => {
  let recipe = null;
  assert.equal(solverIdentity().sha256, currentArtifact.solver_version);
  for (const alias of aliases) {
    const b = await built(alias), meshes = [];
    b.group.traverse(m => { if (m.isMesh) meshes.push(m); });
    assert.equal(b.tableId(), alias);
    const f = b.group.userData.cn8Furniture;
    assert.equal(f.legCount, 6);
    assert.ok(f.fasciaOuter[0] - f.frameOuter[0] > 0.25, 'End beam must stand behind the apron');
    assert.ok(f.fasciaOuter[1] - f.frameOuter[1] > 0.08, 'Long beam must stand behind the apron');
    assert.equal(meshes.filter(m => /^cn8-blind-/.test(m.name)).length, 0);
    assert.equal(meshes.filter(m => /(?:lettering|badge|logo|plaque)/i.test(m.name)).length, 0,
      'The table must remain free of manufacturer and sponsor markings');
    assert.equal(meshes.filter(m => /^cn8-frame-(?:long|end)-/.test(m.name) && !m.name.endsWith('-trim')).length, 6);
    assert.equal(meshes.filter(m => /^cn8-frame-.*-trim$/.test(m.name)).length, 6);
    assert.equal(meshes.filter(m => m.userData.cn8Part === 'head').length, 6);
    assert.equal(meshes.filter(m => /^cn8-leg-head-border-/.test(m.name)).length, 24);
    assert.equal(meshes.filter(m => /^cn8-leg-recess-/.test(m.name)).length, 48);
    for (const m of meshes.filter(m => /^cn8-railend-plate-/.test(m.name))) {
      const box = new b.THREE.Box3().setFromObject(m);
      assert.ok(Math.abs(box.min.y - (0.006 - 0.0654455198268036)) < 1e-7,
        `${m.name}: closure must end with the fascia`);
    }
    for (const m of meshes) for (const key of ['position', 'normal']) {
      assert.ok(m.geometry.attributes[key].array.every(Number.isFinite), `${m.name}: finite ${key}`);
    }
    apply(b.group, b.G, b.K, b.clothMat, currentArtifact.solver_version);
    assert.equal(b.group.userData.cn8TransportArtifact.status, 'PASS');
    assert.equal(b.group.userData.cn8TransportArtifact.ui_solve_calls, 0);
    const entry = currentArtifact.entries.find(row => row.aliases.includes(alias));
    for (const name of ['cn8-bed', ...Array.from({ length: 6 }, (_, i) => `cn8-cushion-${i}`)]) {
      assert.ok(entry.results.some(row => row.name === name), `${name}: cloth transport cannot stop at the wrap`);
      const cloth = b.group.getObjectByName(name);
      assert.ok(cloth.geometry.attributes.color.array.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    }
    const { id, ...physical } = b.G;
    if (recipe) assert.equal(JSON.stringify(physical), recipe);
    recipe = JSON.stringify(physical);
  }
});

test('JOY fascia: substantial closed stock has a lit cream finish on all six faces', async () => {
  const b = await built(aliases[0]), T = b.THREE, boards = [];
  b.group.traverse(m => { if (/^cn8-beam-(?:long|end)-/.test(m.name)) boards.push(m); });
  assert.equal(boards.length, 6);
  for (const board of boards) {
    const box = new T.Box3().setFromObject(board), size = box.getSize(new T.Vector3());
    const thickness = board.name.includes('-end-') ? size.x : size.z;
    assert.ok(thickness > 0.022 && thickness < 0.028, `${board.name}: visible board stock`);
    const p = board.geometry.attributes.position, unique = [], indices = [], weld = new Map();
    const source = board.geometry.index?.array ?? Array.from({ length: p.count }, (_, i) => i);
    for (const i of source) {
      const point = [p.getX(i), p.getY(i), p.getZ(i)];
      const key = point.map(v => Math.round(v * 1e8)).join(',');
      if (!weld.has(key)) { weld.set(key, unique.length / 3); unique.push(...point); }
      indices.push(weld.get(key));
    }
    const topology = bufferTopology(unique, indices);
    for (const key of ['boundary_edges', 'non_manifold_edges', 'winding_conflicts', 'zero_area_triangles']) {
      assert.equal(topology[key], 0, `${board.name}: ${key}`);
    }
    assert.ok(topology.signed_volume_m3 > size.x * size.y * size.z * 0.96);
    const center = box.getCenter(new T.Vector3());
    for (const axis of ['x', 'y', 'z']) for (const sign of [-1, 1]) {
      const origin = center.clone(); origin[axis] += sign * (size[axis] / 2 + 0.02);
      const direction = new T.Vector3(); direction[axis] = -sign;
      const hit = new T.Raycaster(origin, direction).intersectObject(board, false)[0];
      assert.ok(hit, `${board.name}: missing ${axis}/${sign} face`);
      const material = Array.isArray(board.material) ? board.material[hit.face.materialIndex] : board.material;
      assert.ok(material.color.r > 0.4 && material.color.g > 0.2 && material.color.b > 0.15,
        `${board.name}: cream must continue around the underside and cut ends`);
      assert.equal(material.emissive.getHex(), 0, 'Emission must not flatten the board lighting');
      assert.equal(material.side, T.FrontSide, 'A back-face workaround cannot replace solid stock');
    }
  }
});

test('unstructured cloth donors follow connected surface edges and refuse isolated covered sheets', () => {
  const positions = Float64Array.from([0,0,0, 0.02,0,0, 0.04,0,0, 0.001,0.0001,0]);
  const classifications = [[{reason:'INSIDE'}],[{reason:'INSIDE'}],[],[]];
  const topology = {vertices:[{one_ring:[1]},{one_ring:[0,2]},{one_ring:[1]},{one_ring:[]}]};
  const result = inheritSurfaceTransport('fixture', positions, classifications, topology, [true,true,true,true]);
  assert.equal(result.inherited[0].source_vertex, 2, 'A nearby disconnected free sheet is not a donor');
  assert.equal(result.inherited[0].distance_m, 0.04);
  assert.throws(() => inheritSurfaceTransport('fixture', positions,
    [[{reason:'INSIDE'}],[{reason:'INSIDE'}],[{reason:'INSIDE'}],[]], topology, [true,true,true,true]),
    /CN8_EMBEDDED_SURFACE_HAS_NO_FREE_RECEIVER/);
});

test('JOY pockets: each hoop has two connected rods and a suspended cradle', async () => {
  const b = await built(aliases[0]), T = b.THREE;
  const heads=[];b.group.traverse(m=>{if(m.userData.cn8Part==='head')heads.push(m);});
  for (const [i, p] of b.G.pockets.entries()) {
    const corner = Math.abs(p.x) > 1e-6;
    const ring = b.group.getObjectByName(`cn8-ring-${corner ? 'gold' : 'iron'}-${i}`);
    assert.ok(ring.userData.cn8Supported);
    for (const lane of [-1, 1]) {
      const rod = b.group.getObjectByName(`cn8-pocket-runner-${i}-${lane}`);
      assert.ok(rod);
      const first = rod.geometry.parameters.path.getPoint(0);
      assert.ok(Math.abs(Math.hypot(first.x-ring.position.x, first.z-ring.position.z)
        - (corner ? 0.033 : 0.032)) < 1e-6, 'Rod starts on the hoop');
      assert.ok(Math.abs(first.y-ring.position.y) < 0.005);
      const box = new T.Box3().setFromObject(rod);
      assert.ok(box.min.y < -0.28, 'Rod descends to the cradle');
      for(let sample=0;sample<=120;sample++) {
        const point=rod.geometry.parameters.path.getPoint(sample/120);
        if(point.y>=-0.255||point.y<=-0.406)continue;
        for(const head of heads) assert.ok(Math.hypot(point.x-head.position.x,point.z-head.position.z)>0.1175,
          `${rod.name}: both rods must clear every turned shoulder`);
      }
    }
    assert.ok(b.group.getObjectByName(`cn8-pocket-runner-strap-${i}`));
    assert.ok(b.group.getObjectByName(`cn8-pocket-runner-end-${i}`));
  }
  const materials = new Set();
  for (const i of [1, 4]) {
    const low=b.group.getObjectByName(`cn8-net-low-${i}`);
    const box=new T.Box3().setFromObject(low);
    assert.ok(box.max.x-box.min.x > 0.065, 'Middle bag has a visible belly');
    assert.ok(low.geometry.userData.cn8Yarn, 'One continuous geometric weave replaces both sheets');
    materials.add(low.material);
  }
  for (const i of [0,2,3,5]) materials.add(b.group.getObjectByName(`cn8-net-low-${i}`).material);
  assert.equal(materials.size,1,'All six bags use the same cotton and physical yarn gauge');
  for(let i=0;i<6;i++) {
    assert.equal(b.group.getObjectByName(`cn8-net-liner-${i}`),undefined,'No opaque cylinder inside open knit');
    assert.equal(b.group.getObjectByName(`cn8-net-shade-${i}`),undefined,'No floating disc inside open knit');
  }
});

test('JOY turned feet close the annulus outside the octagonal column', async () => {
  const b = await built(aliases[0]), T = b.THREE, feet = [];
  b.group.traverse(m => { if (m.userData.cn8Part === 'foot') feet.push(m); });
  assert.equal(feet.length, 6);
  for (const foot of feet) {
    const ray = new T.Raycaster(new T.Vector3(foot.position.x + 0.078, -0.68, foot.position.z),
      new T.Vector3(0, -1, 0), 0, 0.04);
    const hit = ray.intersectObject(foot, false)[0];
    assert.ok(hit && Math.abs(hit.point.y + 0.706) < 1e-6,
      'The top annulus must be cream material, not a view through the open foot');
  }
});

test('JOY supported nets keep their lacing fixed through catch deformation and reset exactly', async () => {
  const b = await built(aliases[0]);
  for (const i of [0, 2, 3, 5]) {
    const p = b.G.pockets[i], net = b.sinkDressFor(p.x, p.z).net;
    const ring = b.group.getObjectByName(`cn8-ring-gold-${i}`);
    const position = b.group.getObjectByName(`cn8-net-low-${i}`).geometry.attributes.position;
    const base = position.array.slice(), ringBase = ring.position.toArray();
    const ball = { ...net.restAt(0), r: 0.0286, w: 1, tau: 0.1 };
    net.deform([ball]);
    const caught = position.array.slice();
    assert.deepEqual(ring.position.toArray(), ringBase, 'Supported hoop stays on the rods');
    let fixed = 0, moved = 0;
    for (let vi = 0; vi < position.count; vi++) {
      if (base[vi * 3 + 1] <= ringBase[1] + 0.004) {
        for (let axis = 0; axis < 3; axis++) assert.equal(caught[vi * 3 + axis], base[vi * 3 + axis]);
        fixed++;
      } else if (caught[vi * 3] !== base[vi * 3]) moved++;
    }
    assert.ok(fixed > 0 && moved > 0, 'Fixed lacing and a moving belly are both exercised');
    net.deform([ball]); assert.deepEqual(position.array, caught, 'Catch is independent of seek history');
    net.deform([]); assert.deepEqual(position.array, base, 'Reset restores the exact authored net');
  }
});

test('JOY corner leather remains a closed positive-volume shell with non-crossing sections', () => {
  const builder=loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js',import.meta.url),'utf8'));
  for (const station of builder.stations()) {
    const pair=builder.pair(builder.K,station);
    const width=Math.hypot(pair.outer[0]-pair.inner[0],pair.outer[1]-pair.inner[1]);
    assert.ok(width > 0.030 && width < 0.045, 'The binding must be substantially narrower than the 95 mm timber');
    assert.equal(sectionCrossings(builder.section(width,station).profile),0);
  }
  const g=builder.build(builder.K,2.54,1.26,1,1);
  const topology=bufferTopology(g.attributes.position.array,g.index.array);
  assert.equal(topology.boundary_edges,0);assert.equal(topology.non_manifold_edges,0);
  assert.equal(topology.winding_conflicts,0);assert.equal(topology.zero_area_triangles,0);
  assert.ok(topology.signed_volume_m3>0);
});

test('JOY narrow leather and both cloth tongues share the emitted mating edge', async () => {
  const b = await built(aliases[0]);
  const builder = loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
  const mating = builder.mating(builder.K);
  assert.ok(mating.at(mating.first).span > 0.03, 'The final crest row must reach the narrow return without pinching');
  let checked = 0;
  for (const id of [0, 2, 3, 5]) for (const jaw of ['a', 'b']) {
    const mesh = b.group.getObjectByName(`cn8r82-tongue-${id}-${jaw}`), g = mesh.geometry;
    const { rows, matingColumn } = g.userData.cn8D3Mating;
    const stride = g.userData.tongueCols.stride, position = g.attributes.position;
    for (const [row, entry] of rows.entries()) {
      const actual = row * stride + matingColumn, p = b.G.pockets[id];
      if (entry.station === null) {
        const across = jaw === 'a' ? Math.sign(p.x) * position.getX(actual) - b.G.L / 2
          : Math.sign(p.z) * position.getZ(actual) - b.G.W / 2;
        const along = jaw === 'a' ? Math.sign(p.z) * position.getZ(actual) - b.G.W / 2
          : Math.sign(p.x) * position.getX(actual) - b.G.L / 2;
        const [back, end] = builder.woodCorner(builder.K);
        const error = along <= back[1] ? across - back[0]
          : across >= end[0] ? along - end[1] : across - along - (back[0] - back[1]);
        assert.ok(Math.abs(error) < 2e-7,
          `${mesh.name}: cloth must meet the chamfered timber without an open seam`);
        continue;
      }
      const point = builder.pair(builder.K, entry.station).inner;
      if (jaw === 'b') point.reverse();
      assert.ok(Math.abs(position.getX(actual) - Math.sign(p.x) * (b.G.L / 2 + point[0])) < 2e-7);
      assert.ok(Math.abs(position.getZ(actual) - Math.sign(p.z) * (b.G.W / 2 + point[1])) < 2e-7);
      const height = builder.returnHeight(builder.K, entry.station) - builder.S.clothRecess;
      assert.ok(Math.abs(position.getY(actual) - height) < 2e-7);
      checked++;
    }
  }
  assert.ok(checked > 100, 'Exercise the full seam on all four pockets');
});

test('JOY timber has a diagonal plan edge with continuous cloth beside all eight corner ends', async () => {
  const b = await built(aliases[0]), T = b.THREE;
  const builder = loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
  const [back, end] = builder.woodCorner(builder.K);
  assert.ok(end[0] - back[0] > 0.025 && end[0] - back[0] < 0.045);
  assert.ok(Math.abs(end[0] - back[0] - (end[1] - back[1])) < 1e-9);
  b.group.updateMatrixWorld(true);
  for (const id of [0, 2, 3, 5]) for (const jaw of ['a', 'b']) {
    const pocket = b.G.pockets[id];
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const side of [-1, 1]) {
      const point = [back[0] + (end[0] - back[0]) * t + side * 0.005,
        back[1] + (end[1] - back[1]) * t - side * 0.005];
      if (jaw === 'b') point.reverse();
      const origin = new T.Vector3(Math.sign(pocket.x) * (b.G.L / 2 + point[0]),
        0.2, Math.sign(pocket.z) * (b.G.W / 2 + point[1]));
      const hit = new T.Raycaster(origin, new T.Vector3(0, -1, 0)).intersectObject(b.group, true)[0];
      assert.ok(hit, `${id}/${jaw}: missing surface alongside the diagonal`);
      assert.ok(side > 0 ? /^cn8-plank-/.test(hit.object.name)
        : hit.object.name === `cn8r82-tongue-${id}-${jaw}`,
      `${id}/${jaw}: ${side > 0 ? 'wood' : 'green cloth'} side hit ${hit.object.name}`);
    }
  }
});

test('JOY cushion returns are closed solids with the same green cloth on every face', async () => {
  const b = await built(aliases[0]), T = b.THREE;
  for (const id of [0, 2, 3, 5]) {
    for (const jaw of ['a', 'b']) {
      const mesh = b.group.getObjectByName(`cn8r82-tongue-${id}-${jaw}`), g = mesh.geometry;
      assert.equal(mesh.material, b.clothMat);
      assert.equal(mesh.material.side, T.FrontSide, 'Back-face rendering cannot replace the missing return');
      assert.equal(mesh.material.transparent, false);
      const position = g.attributes.position, points = [], indices = [], weld = new Map();
      for (const i of g.index.array) {
        const p = [position.getX(i), position.getY(i), position.getZ(i)];
        const key = p.map(v => Math.round(v * 1e7)).join(',');
        if (!weld.has(key)) { weld.set(key, points.length / 3); points.push(...p); }
        indices.push(weld.get(key));
      }
      const topology = bufferTopology(points, indices);
      for (const key of ['boundary_edges', 'non_manifold_edges', 'winding_conflicts', 'zero_area_triangles']) {
        assert.equal(topology[key], 0, `${mesh.name}: ${key}`);
      }
      assert.ok(topology.signed_volume_m3 > 0.0001, 'The return must enclose cushion stock, not cloth gauge');
      const { topVertices } = g.userData.cn8ClosedJaw;
      let seen = 0;
      for (let i = 0; i < g.index.count; i += 3) {
        const ids = Array.from(g.index.array.slice(i, i + 3));
        if (!ids.some(v => v >= topVertices) || i % 21) continue;
        const triangle = new T.Triangle(...ids.map(v => new T.Vector3().fromBufferAttribute(position, v)));
        const n = triangle.getNormal(new T.Vector3()), center = triangle.getMidpoint(new T.Vector3());
        const hit = new T.Raycaster(center.clone().addScaledVector(n, 0.001), n.negate(), 0, 0.0011)
          .intersectObject(mesh, false)[0];
        assert.ok(hit, `${mesh.name}: the outside of every return must draw`);
        seen++;
      }
      assert.ok(seen > 20);
    }
  }
});

test('JOY net interiors and hanging bags consist of closed round cords with real open holes', async () => {
  const b = await built(aliases[0]), T = b.THREE;
  for (let id = 0; id < 6; id++) {
    const mesh = b.group.getObjectByName(`cn8-net-low-${id}`), g = mesh.geometry, yarn = g.userData.cn8Yarn;
    assert.equal(mesh.material.map, null, 'No painted net pattern');
    assert.equal(mesh.material.alphaMap, null);
    assert.equal(mesh.material.alphaTest, 0, 'Holes must be geometry');
    assert.equal(mesh.material.transparent, false);
    assert.equal(mesh.material.side, T.FrontSide, 'Each cord has its own inner-facing wall');
    for (const prefix of ['cn8-net-', 'cn8-net-apron-', 'cn8-fallbag-', 'cn8-fallbag-shell-', 'cn8r82-hole-', 'cn8r82-cup-', 'cn8r82-cup-wing-']) {
      assert.equal(b.group.getObjectByName(prefix + id), undefined, `${prefix}${id}: no sheet or opaque false bottom`);
    }
    assert.ok(yarn.strands >= 56);
    const p = g.attributes.position;
    if (![1, 4].includes(id)) {
      let intersections = 0;
      for (let triangle = 0; triangle < g.index.count; triangle += 3) for (let edge = 0; edge < 3; edge++) {
        const a = g.index.getX(triangle + edge), c = g.index.getX(triangle + (edge + 1) % 3);
        const ya = p.getY(a), yc = p.getY(c);
        if (ya * yc > 0 || ya === yc) continue;
        const t = -ya / (yc - ya), x = p.getX(a) + (p.getX(c) - p.getX(a)) * t;
        const z = p.getZ(a) + (p.getZ(c) - p.getZ(a)) * t;
        assert.ok(Math.hypot(x, z) < b.K.R, 'Every cord must pass inside the slate cut, without an occluding annular shelf');
        intersections++;
      }
      assert.ok(intersections > 100, 'The same cords connect the upper mouth to the lower bag');
    }
    for (const cord of yarn.cords) {
      const points = p.array.slice(cord.firstVertex * 3, (cord.firstVertex + cord.vertices) * 3);
      const ids = g.index.array.slice(cord.firstIndex, cord.firstIndex + cord.indices).map(i => i - cord.firstVertex);
      const topology = bufferTopology(points, ids);
      assert.equal(topology.boundary_edges, 0);
      assert.equal(topology.winding_conflicts, 0);
      assert.ok(topology.signed_volume_m3 > 0, 'Every yarn strand is an outward-facing volume');
    }
    let hits = 0;
    for (let i = 0; i < 64; i++) {
      const a = (i + 0.173) * 2 * Math.PI / 64;
      const origin = mesh.position.clone(); origin.y = -0.0743;
      const direction = new T.Vector3(Math.cos(a), 0, Math.sin(a));
      if (new T.Raycaster(origin, direction, 0, 0.15).intersectObject(mesh, false).length) hits++;
    }
    assert.ok(hits > 3 && hits < 55, `Pocket ${id}: rays must find both cotton and open air (${hits}/64)`);
  }
});
