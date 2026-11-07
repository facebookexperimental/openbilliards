// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX6: outside/below-cap first-hit census in the owner's isolated viewer.
// The reference frame and camera pose are explicit inputs so main, before,
// and after receive identical rays. No material, visibility, or mesh is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChrome, sleep, spawnStaticServer, stopStaticServer} from '../../../../web/tools/cdp.mjs';
import {measureServedRenderer} from './renderer_binding_621.mjs';

export const PORT_INVENTORY = {http: 1, cdp: 1};

// Self-contained for evaluation against the live THREE scene through CDP.
export function cornerSealCensus(THREE, group, frame) {
  const {hx, hz, chamfer, railTop} = frame;
  // TESSELLATION: the highest sampled origin must be below the cap plateau.
  if (![hx, hz, chamfer, railTop].every(Number.isFinite)
      || hx <= 0 || hz <= 0 || chamfer <= 0 || railTop <= 0.043) {
    throw new Error('invalid reference frame or below-cap ray heights');
  }
  const meshes = [];
  group.traverse(object => {
    if (!object.isMesh) return;
    for (let p = object; p; p = p.parent) if (!p.visible) return;
    meshes.push(object);
  });
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), corners = [];
  const materialAt = hit => Array.isArray(hit.object.material)
    ? hit.object.material[hit.face.materialIndex] : hit.object.material;
  const accepted = /^dm-(cornerblock-\d+|railtop-\d+|apronband|apron|casting-corner-\d+)$/;
  const capBounds = new THREE.Box3();
  for (const mesh of meshes) if (accepted.test(mesh.name)) capBounds.expandByObject(mesh);
  if (capBounds.isEmpty()) throw new Error('frame/cap meshes missing');
  // TESSELLATION / test sampling: start 5 mm beyond the rectangular cap
  // envelope, 20 mm along the chamfer from its side endpoint. Starting just
  // outside the new chamfer would put the ray INSIDE main's larger old casting.
  // All four heights are below the reference cap plateau. The fan is 21 x 17.
  const heights = [0.040, 0.041, 0.042, 0.043];
  for (const [corner, sx, sz] of [[1,-1,-1],[2,1,-1],[3,1,1],[4,-1,1]]) {
    const firstHits = {}, rays = [];
    const center = new THREE.Vector3(sx * (hx - chamfer / 2), 0, sz * (hz - chamfer / 2));
    for (const y of heights) {
      const origin = new THREE.Vector3(sx * (hx - chamfer + 0.020), y, sz * (hz + 0.005));
      if (origin.z >= capBounds.min.z && origin.z <= capBounds.max.z) {
        throw new Error('ray origin is not outside the actual frame/cap bounding box');
      }
      for (let it = 0; it <= 20; it++) for (let id = 0; id <= 16; id++) {
        // TESSELLATION: sample the same physical fan in every renderer.
        const tangent = -0.025 + it * 0.0025, depth = 0.040 + id * 0.0025;
        const target = center.clone().add(new THREE.Vector3(
          sx * (tangent - depth) * Math.SQRT1_2, 0,
          sz * (-tangent - depth) * Math.SQRT1_2));
        ray.set(origin, target.clone().sub(origin).normalize());
        ray.far = origin.distanceTo(target) + 0.001; // CLEARANCE: numerical end-point allowance.
        const hit = ray.intersectObjects(meshes, false)[0];
        const material = hit && materialAt(hit);
        const mesh = hit?.object.name ?? 'MISS';
        const classification = material?.userData.obClass ?? null;
        const first = {mesh, material_name: material?.name ?? null,
          material_type: material?.type ?? null, material_class: classification};
        const key = `${mesh}:${classification}`;
        if (!firstHits[key]) firstHits[key] = {...first, count: 0};
        firstHits[key].count++;
        rays.push({height: y, tangent, depth, origin: origin.toArray(), target: target.toArray(),
          first: {...first, point: hit?.point.toArray() ?? null, face: hit?.faceIndex ?? null},
          pass: !!hit && accepted.test(mesh) && classification !== 'cloth'});
      }
    }
    corners.push({corner, sx, sz, first_hits: Object.values(firstHits), rays,
      ray_count: rays.length, cloth_first: rays.filter(r => r.first.material_class === 'cloth').length,
      failures: rays.filter(r => !r.pass).length, pass: rays.every(r => r.pass)});
  }
  // TESSELLATION: record the unchanged sampling recipe with the measurements.
  return {frame, visible_mesh_count: meshes.length,
    cap_bounds: {min: capBounds.min.toArray(), max: capBounds.max.toArray()},
    sampling: {stand_off_m: 0.005, chamfer_run_m: 0.020,
    heights_m: heights, tangent_m: [-0.025, 0.025, 0.0025], depth_m: [0.040, 0.080, 0.0025]},
  corners, verdict: corners.every(c => c.pass) ? 'PASS' : 'FAIL'};
}

async function main() {
  const args = process.argv.slice(2);
  const arg = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
  const root = arg('--root'), tree = arg('--tree'), out = arg('--out');
  const framePath = arg('--frame'), posePath = arg('--pose');
  const expected = arg('--expected-renderer-sha256');
  assert(root && tree && out && framePath && posePath && expected,
    '--root --tree --out --frame --pose --expected-renderer-sha256 are required');
  assert(/^[a-zA-Z0-9_-]+$/.test(tree), 'tree must be a directory name');
  assert(/^[0-9a-f]{64}$/.test(expected), 'expected table.js SHA-256 is required');
  const http = Number(process.env.OB_E2E_PORT), cdp = Number(process.env.OB_E2E_CDP_PORT);
  assert(http === 9520 && cdp === 9535, 'FIX6 is confined to Diamond ports 9520/9535');
  const frame = JSON.parse(fs.readFileSync(framePath, 'utf8'));
  const pose = JSON.parse(fs.readFileSync(posePath, 'utf8'));
  const url = `http://127.0.0.1:${http}/model-viewer/trees/${tree}/web/viewer.html?table=diamond_proam_9ft`;
  const report = {tool: 'corner_seal_621', tree, url, expected_renderer_sha256: expected,
    frame_path: path.resolve(framePath), pose_path: path.resolve(posePath), ports: {http, cdp}};
  fs.mkdirSync(out, {recursive: true});
  const server = spawnStaticServer(path.resolve(root), http, {bind: '127.0.0.1'});
  let chrome;
  try {
    chrome = await launchChrome(url, {port: cdp, width: 1600, height: 1000, preflight: false, tool: false});
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await chrome.eval('document.body?.dataset.ready') === '1') break;
      await sleep(250);
    }
    assert.equal(await chrome.eval('document.body?.dataset.ready'), '1', 'viewer not ready');
    assert.equal(await chrome.eval('window.__viewer.builtId'), 'diamond_proam_9ft', 'wrong table');
    report.served_renderer = await measureServedRenderer(url);
    assert.equal(report.served_renderer.files['scene/table.js'], expected, 'served table.js differs');
    report.census = await chrome.eval(`(${cornerSealCensus.toString()})(
      window.__viewer.THREE, window.__viewer.group, ${JSON.stringify(frame)})`);
    report.pose = await chrome.eval(`(() => {
      const v=window.__viewer, p=${JSON.stringify(pose)};
      v.controls.enableDamping=false; v.controls.clearDeltas?.();
      v.camera.position.fromArray(p.pos); v.controls.target.fromArray(p.target); v.controls.update();
      return v.pose();
    })()`);
    await sleep(250);
    await chrome.screenshot(path.join(out, 'corner.png'));
    const after = await measureServedRenderer(url);
    assert.deepEqual(after.files, report.served_renderer.files, 'renderer changed during the census');
  } catch (error) {
    report.error = error.stack;
  } finally {
    report.chrome_closed = chrome ? await chrome.closeAndWait() : false;
    report.http_closed = await stopStaticServer(server);
    report.verdict = !report.error && report.chrome_closed && report.http_closed
      && report.census?.verdict === 'PASS' ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  }
  console.log(JSON.stringify({...report, census: report.census && {...report.census,
    corners: report.census.corners.map(({rays, ...row}) => row)}}, null, 2));
  process.exitCode = report.verdict === 'PASS' ? 0 : 3;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
