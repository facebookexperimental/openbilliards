// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
import assert from 'node:assert/strict';
import * as THREE from '../../../../web/vendor/three.module.min.js';
import * as sinkFx from '../../../../web/app/sinkpivot.js';
import { pocketConstructor } from '../benchmark_pocket_cut_rox.mjs';

function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `CONSTRUCTION_SOURCE_REFUSED: ${start}`);
  return source.slice(a, b);
}

/** Execute the shipping publisher loop and cup constructors, including the
 * historical no-support branch. No support spec is synthesized by the test. */
export function buildCupContract(source) {
  const api = pocketConstructor(source), G = api.makeGeom('rasson_ox_9ft');
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mats = { cup: material, well: material, metal: material, cloth: material };
  const dm = (mesh, name) => { mesh.name = `dm-${name}`; return mesh; };
  const start = source.indexOf('\n', source.indexOf('    const roxMats = {'));
  assert(start > 0, 'CONSTRUCTION_SOURCE_REFUSED: OX pocket publisher');
  const loop = between(source.slice(start), '\n', '    // RC-19 / CP-14m:');
  const publish = new Function('G', 'group', 'dm', 'roxMats', 'clothMaterial', ...Object.keys(api),
    `let sinkRestSpecs = null;\n${loop}\nreturn sinkRestSpecs;`);
  const supports = publish(G, group, dm, mats, material, ...Object.values(api)) || [];
  group.updateMatrixWorld(true);
  return { G, group, supports };
}

/** The exact slab walk, stopping immediately before Three triangulates it. */
export function slabOutline(source, G) {
  const constants = ['ROX_CUSHION_BACK', 'ROX_BED_HOLE_REVEAL'].map(name => {
    const line = source.match(new RegExp(`^const ${name} = [^;]+;`, 'm'));
    assert(line, `CONSTRUCTION_SOURCE_REFUSED: ${name}`); return line[0];
  }).join('\n');
  const walk = between(source, '      const hx = G.L / 2 + ROX_CUSHION_BACK', '      const shape = new THREE.Shape(pts.');
  return new Function('G', `${constants}\n${walk}\nreturn {pts, hx, hz};`)(G);
}

/** Invoke the frozen consumer functions verbatim. Only shader setters are
 * inert in this geometry host; the actual landing and pose arithmetic runs. */
export function sinkConsumer(gameSource) {
  const functions = ['restEntryFor', 'closureSeatY', 'poseSink'].map(name => {
    const prefix = `  function ${name}(`, a = gameSource.indexOf(prefix);
    const b = gameSource.indexOf('\n  }\n', a);
    assert(a >= 0 && b > a, `SINK_SOURCE_REFUSED: ${name}`);
    return gameSource.slice(a, b + '\n  }\n'.length);
  });
  const constants = ['SINK_SECONDS', 'SINK_G', 'SINK_SHIELD_Y', 'SINK_FLOOR_Y', 'LIP_POP_M'].map(name => {
    const line = gameSource.match(new RegExp(`^const ${name} = [^;]+;`, 'm'));
    assert(line, `SINK_SOURCE_REFUSED: ${name}`); return line[0];
  });
  return new Function('THREE', 'sinkFx', `${constants.join('\n')}
    const sinkPoseTmp = {}, quatTmp = new THREE.Quaternion();
    const setNetBallEnv = () => {}, setWellBallOccl = () => {};
    // main (#707 ball-return extension): poseSink now consults game.js module state g.ballReturnOwns(b.id, dt);
    // this geometry host has no ball-return owner, so the hook is inert (null) and the original pose arithmetic runs
    const g = { ballReturnOwns: null };
    ${functions.join('\n')}
    return {restEntryFor, poseSink};`)(THREE, sinkFx);
}

export function sinkSamples(built, consumer, p, speed = 0.5) {
  const { G, group, supports } = built, r = G.render.profileBallD / 2;
  const ux = p.corner ? Math.sign(p.x) * Math.SQRT1_2 : 0;
  const uz = p.corner ? Math.sign(p.z) * Math.SQRT1_2 : Math.sign(p.z);
  const pivot = sinkFx.buildSinkPivot({ x0: p.x - p.r * ux, z0: p.z - p.r * uz,
    vx: speed * ux, vz: speed * uz, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1],
    px: p.x, pz: p.z, pr: p.r, r, falls: null });
  assert(pivot, 'SINK_SOURCE_REFUSED: valid pivot required');
  const tag = p.corner ? `${p.x > 0 ? 'px' : 'nx'}${p.z > 0 ? 'pz' : 'nz'}` : p.z > 0 ? 'pz' : 'nz';
  const name = `dm-pocket-rox-${p.corner ? 'corner' : 'side'}-${tag}-${p.corner ? 'cup-bucket-measured' : 'cup-floor'}`;
  const floor = group.getObjectByName(name); assert(floor, `SINK_FLOOR_REFUSED: ${name}`);
  const positions = floor.geometry.getAttribute('position'), indices = floor.geometry.getIndex();
  const triangles = [];
  // roxGrid's first cell is [0, 1, columns + 1]. Columns 0..2 are the
  // measured drain -> floor midpoint -> floor-turn start, on every row.
  // The remaining columns belong to the wall and underside, not the floor.
  const columns = p.corner ? indices.getX(2) - 1 : null;
  if (p.corner) assert(indices.getX(0) === 0 && indices.getX(1) === 1 && columns > 2, 'SINK_FLOOR_TOPOLOGY_REFUSED');
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    if (p.corner && !ids.every(id => id % columns <= 2)) continue;
    triangles.push(new THREE.Triangle(...ids.map(id => new THREE.Vector3().fromBufferAttribute(positions, id).applyMatrix4(floor.matrixWorld))));
  }
  assert(triangles.length, 'SINK_FLOOR_COVERAGE_REFUSED');
  const spec = supports.toSorted((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] || null;
  const entry = { r, pocket: p, pivot }, ball = { mesh: new THREE.Object3D(), baseQuat: new THREE.Quaternion() };
  entry.rest = consumer.restEntryFor(entry, spec);
  const samples = [];
  for (let frame = 0; frame <= 750; frame++) {
    const time = frame / 1000;
    if (!consumer.poseSink(ball, entry, time)) continue;
    const q = ball.mesh.position;
    const ray = new THREE.Raycaster(new THREE.Vector3(q.x, G.kernel.noseHeightFrac * G.render.profileBallD, q.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(floor)[0];
    let floorY = hit?.point.y ?? null;
    if (hit?.face) {
      const pos = floor.geometry.getAttribute('position');
      const ys = [hit.face.a, hit.face.b, hit.face.c].map(i => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(floor.matrixWorld).y);
      // A horizontal triangle's exact plane is its vertex height. Recomputing
      // that height as ray.origin + t * direction can lose one double ulp.
      if (ys.every(y => y === ys[0])) floorY = ys[0];
    }
    // The corner lands over its drain. Measure the sphere against every
    // actual floor triangle too; a missing centre ray cannot make it pass.
    let surfaceClearance = Infinity;
    const closest = new THREE.Vector3();
    for (const triangle of triangles) {
      triangle.closestPointToPoint(q, closest);
      let distance = q.distanceTo(closest) - r;
      if (triangle.a.y === triangle.b.y && triangle.a.y === triangle.c.y
          && triangle.containsPoint(new THREE.Vector3(q.x, triangle.a.y, q.z))) {
        distance = Math.abs(q.y - triangle.a.y) - r;
      }
      surfaceClearance = Math.min(surfaceClearance, distance);
    }
    samples.push({ time, position: q.toArray(), quaternion: ball.mesh.quaternion.toArray(),
      floor_y: floorY, clearance_mm: hit ? (q.y - r - floorY) * 1000 : null,
      surface_clearance_mm: surfaceClearance * 1000 });
  }
  const tested = samples.filter(q => q.clearance_mm !== null);
  assert(tested.length > 0, `SINK_COVERAGE_REFUSED: ${tag}`);
  const deepest = tested.reduce((a, b) => b.clearance_mm < a.clearance_mm ? b : a);
  const closestSurface = samples.reduce((a, b) => b.surface_clearance_mm < a.surface_clearance_mm ? b : a);
  return { tag, corner: p.corner, speed, radius: r, spec, rest: entry.rest,
    samples, deepest, closestSurface, floor_triangles: triangles.length,
    visible_samples: samples.length, tested_samples: tested.length };
}
