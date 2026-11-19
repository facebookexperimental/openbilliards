#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Final emitted pocket geometry against the canonical WASM, without Chrome.
// No purchased assets, mirror geometry, or independent physics simulation.
// Run: node --experimental-vm-modules tools/render/check-pocket-assembly.mjs --out report.json
// Historical red: check-pocket-assembly-red.mjs --source-ref 10983e70 --out red.json.
// --exact disables certified early passes; both paths sample the same surfaces.
// All catalog entries are measured. The /4 report keeps complete enforced
// results and bounded audited detail with full counts; --strict enforces all.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../../web/vendor/three.module.min.js';
import {init} from '../../web/dist/pool-sdk/index.js';
import {buildTransportInputs} from './ghcn8/cpu_table_inputs.mjs';
import {projectPocketOpenings} from './pocket-opening-projection.mjs';
import {buildSinkPivot, poseInSink} from '../../web/app/sinkpivot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENFORCED = new Set(['diamond_proam_9ft', 'diamond_proam_8ft', 'diamond_proam_7ft',
  'pool_pro_9ft', 'pool_pro_9ft_measured', 'pool_pro_8ft', 'pool_pro_7ft']);
const SHA = bytes => createHash('sha256').update(bytes).digest('hex');

// Match Mesh draw submission: a scalar material ignores groups; an array
// draws only its assigned groups, each clipped by drawRange and buffer size.
export function visibleTriangleRanges(geometry, material) {
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  const range = geometry.drawRange ?? {start: 0, count: Infinity};
  const groups = Array.isArray(material) ? geometry.groups
    : [{start: 0, count, materialIndex: 0}];
  const materials = Array.isArray(material) ? material : [material];
  const ranges = [];
  for (const group of groups) {
    const m = materials[group.materialIndex];
    if (!m || m.visible === false || m.transparent && m.opacity < 0.5) continue;
    const start = Math.max(0, range.start, group.start);
    const end = Math.min(count, range.start + range.count, group.start + group.count);
    if (start + 2 < end) ranges.push({start, end, material: m});
  }
  return ranges;
}

const AUDITED_ARRAY_LIMIT = 16;

function tableSummary(result) {
  const maximum = (rows, key) => rows?.reduce((m, r) => Math.max(m, r[key] ?? -Infinity), -Infinity);
  return {id: result.id, status: result.status, enforced: result.enforced, reason: result.reason,
    join_max_mm: maximum(result.closure?.rows, 'gap_mm'), join_failures: result.closure?.rows.filter(r => r.status !== 'PASS').length,
    opening: result.opening && {status: result.opening.status,
      uncovered_fragments: result.opening.rows.reduce((n, r) => n + r.uncovered_fragments, 0),
      uncovered_segments: result.opening.rows.reduce((n, r) => n + r.uncovered_segments, 0),
      witnessed_depth_mm: Math.max(0, ...result.opening.rows.map(r => r.witness.depth_mm))},
    drop: result.drop && {status: result.drop.status, cases: result.drop.rows.length,
      non_pots: result.drop.rows.filter(r => r.status === 'NOT_POTTED').length,
      minimum_clearance_mm: Math.min(...result.drop.rows.filter(r => r.samples).map(r => r.clearance_mm))},
    active_contact_max_mm: maximum(result.contact?.rows.filter(r => r.active), 'face_gap_mm'),
    contact_failures: result.contact?.rows.filter(r => r.status === 'FAIL').length,
    mirror_max_mm: maximum(result.symmetry?.rows, 'maximum_mm'), witness_gap_mm: result.witness?.sphere_gap_mm,
    cue_floor: result.cue_floor && {status: result.cue_floor.status, rows: result.cue_floor.rows,
      solve_cases: result.cue_floor.solve_brackets?.length,
      solve_failures: result.cue_floor.solve_brackets?.filter(r => r.status !== 'PASS')},
    defects: result.defects, phase_ms: result.phase_ms, elapsed_ms: result.elapsed_ms};
}

function auditedDetails(result, summary) {
  const truncated = [];
  function copy(value, pointer) {
    if (Array.isArray(value)) {
      const retained = Math.min(value.length, AUDITED_ARRAY_LIMIT);
      if (retained < value.length) truncated.push({path: pointer,
        total: value.length, retained, omitted: value.length - retained});
      return value.slice(0, retained).map((row, i) => copy(row, `${pointer}/${i}`));
    }
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, copy(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)]));
    return value;
  }
  const bounded = copy(result, '');
  // Counts and maxima precede truncation. Nested details (including each
  // opening segment's bed_triangles) must be bounded as well as outer rows.
  bounded.audit_details = {array_limit: AUDITED_ARRAY_LIMIT, selection: 'first rows in source order',
    truncated_arrays: truncated, summary};
  return bounded;
}

// Report construction only: measurement and defect classification finish
// before record(). Enforced tables, including --strict, retain every row.
export function createPocketAssemblyReporter(report, options, runStarted = performance.now()) {
  fs.rmSync(options['--out'], {force: true});
  return {
    record(result) {
      const summary = tableSummary(result);
      report.tables.push(result.enforced ? result : auditedDetails(result, summary));
      console.log(JSON.stringify(summary));
    },
    finish() {
      const failed = report.tables.filter(t => t.enforced && !['PASS', 'NOT_APPLICABLE'].includes(t.status));
      const refused = report.tables.filter(t => t.status === 'REFUSED');
      if (options['--expect-defects']) {
        const required = options['--expect-defects'].split(',');
        report.expected_defects = required;
        const targets = report.tables.filter(t => t.enforced);
        report.verdict = !refused.length && targets.length > 0
          && targets.every(t => t.opening?.status !== 'REFUSED' && required.every(name => t.defects.includes(name)))
          ? 'EXPECTED_RED' : 'RED_DID_NOT_FIRE';
      } else if (options['--expect-red']) {
        const closureRed = failed.some(t => t.closure?.rows.some(r => r.kind === 'side' && r.status === 'FAIL'));
        const contactRed = failed.some(t => t.witness?.status === 'FAIL');
        report.verdict = !refused.length && closureRed && contactRed ? 'EXPECTED_RED' : 'RED_DID_NOT_FIRE';
      } else {
        report.verdict = failed.length || refused.some(t => t.enforced) ? 'FAIL' : 'PASS_ENFORCED';
      }
      report.other_table_violations = report.tables.filter(t => !t.enforced && !['PASS', 'NOT_APPLICABLE'].includes(t.status)).map(t => t.id);
      report.elapsed_ms = performance.now() - runStarted;
      fs.mkdirSync(path.dirname(path.resolve(options['--out'])), {recursive: true});
      fs.writeFileSync(options['--out'], JSON.stringify(report) + '\n');
      console.log(JSON.stringify({verdict: report.verdict, enforced_failures: failed.map(t => t.id),
        other_table_violations: report.other_table_violations, report_bytes: fs.statSync(options['--out']).size}));
      return report;
    },
  };
}

export async function checkPocketAssembly(options, {
  readSource = null, sourceRef = null, mutateScene = null, observeEmitted = null,
} = {}) {
  const runStarted = performance.now(), exact = options['--exact'] === true;
  if (!options['--out']) throw new Error('--out is required');
  const engine = await init(path.join(ROOT, 'web/dist/pool-wasm/pool_wasm.js'));
  const catalog = engine.catalog();
  const ids = options['--tables'] ? options['--tables'].split(',') : catalog.tables.map(t => t.id);
  // A 0.1 mm surface bar is above the sampled jaw's chord error and Float32
  // world-coordinate precision, and well below the reported multi-mm defects.
  // The sphere bar additionally allows the kernel's explicit planar approach
  // convention: sqrt(R^2 + (noseHeight-R)^2)-R, about 1.08 mm on this Diamond.
  const SURFACE = 0.0001, JOIN = 0.0001, MIRROR = 0.0001, SLAB = 0.00005;
  const report = {schema: 'pocket-assembly/4', mode: 'CPU final renderer geometry; canonical WASM contacts',
    algorithm: exact ? 'exact' : 'certified', node: process.version,
    instrument_sha256: SHA(fs.readFileSync(fileURLToPath(import.meta.url))),
    projection_sha256: SHA(fs.readFileSync(new URL('./pocket-opening-projection.mjs', import.meta.url))),
    sinkpivot_sha256: SHA(fs.readFileSync(new URL('../../web/app/sinkpivot.js', import.meta.url))),
    drop_check: options['--drop'] === true,
    plant: options['--plant'] ?? null,
    source_ref: sourceRef ?? execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
    source_dirty: !readSource && !!execFileSync('git', ['status', '--porcelain'], {cwd: ROOT, encoding: 'utf8'}).trim(),
    table_js_sha256: SHA(readSource ? readSource('web/scene/table.js') : fs.readFileSync(path.join(ROOT, 'web/scene/table.js'))),
    wasm_sha256: SHA(fs.readFileSync(path.join(ROOT, 'web/dist/pool-wasm/pool_wasm_bg.wasm'))),
    kernel_version: engine.version(), tolerances_mm: {surface: SURFACE * 1000, join: JOIN * 1000, mirror: MIRROR * 1000, glue_section_half_width: SLAB * 1000},
    tables: []};
  const reporter = createPocketAssemblyReporter(report, options, runStarted);

  function treeFor(rows) {
    if (!rows.length) return null;
    const box = new THREE.Box3(); for (const r of rows) box.union(r.box);
    if (rows.length <= 8) return {box, rows};
    const s = box.getSize(new THREE.Vector3()), axis = s.x >= s.y && s.x >= s.z ? 'x' : s.y >= s.z ? 'y' : 'z';
    rows.sort((a, b) => a.center[axis] - b.center[axis] || a.id - b.id);
    const m = rows.length >> 1;
    return {box, children: [treeFor(rows.slice(0, m)), treeFor(rows.slice(m))]};
  }
  function nearest(tree, point, eye = null) {
    let best = {distance: Infinity}; const closest = new THREE.Vector3(), delta = new THREE.Vector3();
    function visit(node) {
      if (!node || node.box.distanceToPoint(point) > best.distance) return;
      if (node.children) {
        for (const child of node.children.slice().sort((a, b) => a.box.distanceToPoint(point) - b.box.distanceToPoint(point))) visit(child);
        return;
      }
      for (const r of node.rows) {
        if (r.box.distanceToPoint(point) > best.distance) continue;
        if (eye && r.side !== THREE.DoubleSide) {
          const facing = delta.copy(eye).sub(r.tri.a).dot(r.normal);
          if (r.side === THREE.BackSide ? facing > 1e-10 : facing < -1e-10) continue;
        }
        r.tri.closestPointToPoint(point, closest);
        const distance = point.distanceTo(closest);
        if (distance < best.distance) best = {distance, mesh: r.name, triangle: r.id, point_m: closest.toArray()};
      }
    }
    visit(tree); return best;
  }
  function emitted(group, G) {
    const meshes = [], triangles = [];
    group.updateMatrixWorld(true);
    group.traverse(o => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      const g = o.geometry, attr = g.attributes.position;
      const ranges = visibleTriangleRanges(g, o.material);
      if (!ranges.length) return;
      const mesh = {name: o.name || `mesh-${meshes.length}`, rows: [], points: [], box: new THREE.Box3(),
        materials: [...new Set(ranges.map(r => r.material))]};
      const indices = g.index?.array ?? Array.from({length: attr.count}, (_, i) => i);
      const count = o.isInstancedMesh ? o.count : 1;
      for (let instance = 0; instance < count; instance++) {
        const matrix = new THREE.Matrix4().fromArray(o.matrixWorld.elements);
        if (o.isInstancedMesh) {
          const local = new THREE.Matrix4().fromArray(o.instanceMatrix.array, instance * 16);
          matrix.multiply(local);
        }
        const points = Array.from({length: attr.count}, (_, i) => new THREE.Vector3(attr.getX(i), attr.getY(i), attr.getZ(i)).applyMatrix4(matrix));
        const used = new Set();
        for (const {start, end, material} of ranges) for (let i = start; i + 2 < end; i += 3) {
          const tri = new THREE.Triangle(...[0, 1, 2].map(j => points[indices[i + j]]));
          if (tri.getArea() < 1e-15) continue;
          for (let j = 0; j < 3; j++) used.add(indices[i + j]);
          const box = new THREE.Box3().setFromPoints([tri.a, tri.b, tri.c]);
          // Every query is in the cushion/collar band. Keep crossing
          // triangles, but do not retain unrelated cabinet/leg tessellation.
          // rotateX(-PI/2) leaves bed y at roughly +/-1e-16. Retain both
          // halves of that plane for the independent open-hole check.
          if (box.max.y < (options['--drop'] ? -0.09 : -0.01) || box.min.y > 0.08) continue;
          const row = {tri, box, center: box.getCenter(new THREE.Vector3()), normal: tri.getNormal(new THREE.Vector3()),
            side: material.side, name: mesh.name, id: triangles.length, mesh};
          mesh.rows.push(row); triangles.push(row);
        }
        for (const i of used) { mesh.box.expandByPoint(points[i]); mesh.points.push(points[i]); }
      }
      if (!mesh.points.length) return;
      const size = mesh.box.getSize(new THREE.Vector3());
      mesh.cushion = /cushion/i.test(o.name || '') || (!o.name && Math.abs(mesh.box.min.y) < 1e-6
        && mesh.box.max.y > 0.02 && mesh.box.max.y < 0.08
        && (size.x > G.L * 0.15 && size.z < 0.15 || size.z > G.W * 0.30 && size.x < 0.15));
      meshes.push(mesh);
    });
    return {meshes, triangles};
  }
  function section(rows, height) {
    const segments = [];
    for (const {tri, box} of rows) {
      if (height < box.min.y - 1e-9 || height > box.max.y + 1e-9) continue;
      const ps = [tri.a, tri.b, tri.c];
      if (ps.every(p => Math.abs(p.y - height) < 1e-9)) {
        for (let i = 0; i < 3; i++) segments.push([ps[i], ps[(i + 1) % 3]]);
        continue;
      }
      const hits = [];
      const add = p => { if (!hits.some(q => p.distanceToSquared(q) < 1e-18)) hits.push(p); };
      for (let i = 0; i < 3; i++) {
        const a = ps[i], b = ps[(i + 1) % 3];
        if (Math.abs(a.y - height) < 1e-9) add(a);
        if ((a.y - height) * (b.y - height) < 0) add(a.clone().lerp(b, (height - a.y) / (b.y - a.y)));
      }
      if (hits.length >= 2) segments.push([hits[0], hits[1]]);
    }
    return segments;
  }
  function endpoint(segments, frame, sign, axis, railSign, rear, halfWidth = SLAB) {
    let value = Infinity;
    for (const pair of segments) {
      const a = pair[0], b = pair[1];
      const da = railSign * a[axis] - rear, db = railSign * b[axis] - rear;
      let lo = 0, hi = 1;
      if (Math.abs(db - da) < 1e-15) { if (Math.abs(da) > halfWidth) continue; }
      else {
        const u = (-halfWidth - da) / (db - da), v = (halfWidth - da) / (db - da);
        lo = Math.max(0, Math.min(u, v)); hi = Math.min(1, Math.max(u, v));
        if (lo > hi) continue;
      }
      for (const f of [lo, hi]) {
        const x = a.x + (b.x - a.x) * f - frame.nx, z = a.z + (b.z - a.z) * f - frame.nz;
        const w = sign * (-x * frame.uz + z * frame.ux), u = x * frame.ux + z * frame.uz;
        if (w > 0.005 && w < 0.20 && Math.abs(u) < 0.25) value = Math.min(value, w);
      }
    }
    return Number.isFinite(value) ? value : null;
  }
  function joins(data, G, api, id) {
    const cushions = data.meshes.filter(m => m.cushion);
    if (cushions.length !== 6) return {status: G.pockets.length ? 'REFUSED' : 'NOT_APPLICABLE', reason: `identified ${cushions.length} cushion bodies, expected six`, rows: []};
    const result = [];
    for (const [pi, p] of G.pockets.entries()) {
      const frame = api.pocketAxisFrame(G, p), centre = new THREE.Vector3(frame.nx, 0.03, frame.nz);
      const adjacent = cushions.filter(m => m.box.distanceToPoint(centre) < 0.15);
      if (adjacent.length !== 2) { result.push({pocket: pi, status: 'REFUSED', reason: `adjacent cushion count ${adjacent.length}`}); continue; }
      const diamond = ENFORCED.has(id);
      const support = data.triangles.filter(t => !t.mesh.cushion && t.box.distanceToPoint(centre) < 0.25
        && (!diamond || t.name.startsWith('dm-bootcollar-')));
      const supportTree = treeFor(support.slice());
      for (const m of adjacent) {
        const mc = m.box.getCenter(new THREE.Vector3()), size = m.box.getSize(new THREE.Vector3());
        const axis = size.x > size.z ? 'z' : 'x', railSign = Math.sign(mc[axis]);
        const sign = Math.sign(-(mc.x - frame.nx) * frame.uz + (mc.z - frame.nz) * frame.ux);
        const top = Math.max(...m.points.map(v => v.y));
        const heights = [...new Set([...m.points.map(v => Math.round(v.y * 1e8) / 1e8),
          ...Array.from({length: Math.ceil(top / 0.0005)}, (_, i) => i * 0.0005 + 0.0001)])]
          .filter(h => h > 0 && h <= top + 1e-8).sort((a, b) => a - b);
        for (const height of heights) {
          const cs = section(m.rows, height); if (!cs.length) continue;
          const rear = Math.max(...cs.flatMap(pair => pair.map(v => railSign * v[axis])));
          // A reconstructed cap can vary by a few Float32 ulps across a
          // metre-long rail. A 2 micrometre section includes its endpoint
          // without mistaking an interior vertex for the end of the jaw.
          const jaw = endpoint(cs, frame, sign, axis, railSign, rear, 0.000002);
          if (jaw === null) { result.push({pocket: pi, cushion: m.name, height_mm: height * 1000, status: 'REFUSED', reason: 'no cushion endpoint'}); continue; }
          const boot = endpoint(section(support, height), frame, sign, axis, railSign, rear);
          const point = new THREE.Vector3(0, height, 0);
          if (axis === 'z') {
            point.z = railSign * rear;
            point.x = frame.nx + ((point.z - frame.nz) * frame.ux - sign * jaw) / frame.uz;
          } else {
            point.x = railSign * rear;
            point.z = frame.nz + (sign * jaw + (point.x - frame.nx) * frame.uz) / frame.ux;
          }
          const closest = nearest(supportTree, point);
          result.push({pocket: pi, kind: p.corner ? 'corner' : 'side', cushion: m.name, height_mm: height * 1000,
            cushion_lateral_mm: jaw * 1000, support_lateral_mm: boot === null ? null : boot * 1000,
            lateral_gap_mm: boot === null ? null : (boot - jaw) * 1000,
            endpoint_m: point.toArray(), support: closest.mesh, gap_mm: closest.distance * 1000,
            status: !Number.isFinite(closest.distance) ? 'REFUSED' : closest.distance > JOIN ? 'FAIL' : 'PASS'});
        }
      }
    }
    return {status: result.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', rows: result};
  }

  // A construction receipt for dimensions and image overlays only. The
  // opening predicate above does not consume this contour or these values.
  function openingDimensions(G, api) {
    if (G.render.pocketAssembly !== 'canonical-jaws' || !api.pocketOpeningPlan) return null;
    const plans = {corner: api.pocketOpeningPlan(G, 'corner'), side: api.pocketOpeningPlan(G, 'side')};
    return {role: 'CONSTRUCTION_DIAGNOSTIC_NOT_ORACLE', pockets: G.pockets.map((p, pocket) => {
      const kind = p.corner ? 'corner' : 'side', plan = plans[kind], r = plan.ring;
      const face = r.jawFace, depth = G.kernel.cushionWidth;
      const rear = p.corner ? (face.intercept + face.slope * Math.SQRT2 * depth) / (1 + face.slope)
        : face.intercept + face.slope * depth;
      const us = plan.contour.map(q => q[0]), ws = plan.contour.map(q => Math.abs(q[1]));
      return {pocket, kind, frame: api.pocketAxisFrame(G, p), contour_uw_m: plan.contour,
        entrance_mm: G.kernel[p.corner ? 'cornerMouth' : 'sideMouth'] * 1000,
        facing_degrees: G.kernel[p.corner ? 'cornerFacingDeviationDeg' : 'sideFacingDeviationDeg'] + (p.corner ? 135 : 90),
        full_depth_mm: depth * 1000, definition_rear_width_mm: 2 * rear * 1000,
        join_width_mm: 2 * r.wLeg * 1000,
        maximum_hole_width_mm: 2 * Math.max(...ws) * 1000,
        hole_axis_length_mm: (Math.max(...us) - Math.min(...us)) * 1000,
        boot_mm: {outer_centre: r.uOut * 1000, outer_radius: r.rOut * 1000,
          inner_centre: r.uIn * 1000, inner_radius: r.rIn * 1000,
          leg_half_width: r.wLeg * 1000, maximum_profile_join: Math.max(...r.joinRows.map(q => q[1])) * 1000},
        boundary_land_mm: plan.land * 1000, lip_radius_mm: plan.lipRadius * 1000,
        lip_depth_mm: Math.max(plan.frontDepth ?? 0, plan.returnDepth ?? 0, plan.lipDepth ?? plan.lipRadius) * 1000,
        front_return_depth_mm: (plan.frontDepth ?? plan.lipDepth ?? plan.lipRadius) * 1000,
        rear_return_depth_mm: (plan.returnDepth ?? plan.lipDepth ?? plan.lipRadius) * 1000,
        front_arc_datum_offset_mm: (plan.lipDepth ?? plan.lipRadius) * 1000,
        lip_style: plan.lipStyle ?? 'quarter-round'};
    })};
  }

  // ADR-0017's production presentation of already captured balls. Motion
  // up to capture is sampled from canonical WASM; no gameplay is recreated
  // here. The optional full check includes bed, lip, boot and cup surfaces,
  // rather than retaining the earlier collar-only drop proof.
  function drops(id, G, api, tree) {
    const cases = [], rows = [], R = G.render.profileBallD / 2;
    const scene = () => {
      const s = engine.nineBallRack(7, {table_id: id});
      s.system.balls = s.system.balls.filter(b => b.id === 0); return s;
    };
    const contact = scene(), rail = contact.system.table.linear[10];
    const dx = rail.p2.x - rail.p1.x, dy = rail.p2.y - rail.p1.y, length = Math.hypot(dx, dy);
    const nx = -dy / length, ny = dx / length;
    const f = (G.W / 2 + 0.028 - rail.p1.x) / dx;
    contact.system.balls[0].state.pos = {x: rail.p1.x + f * dx + nx * (R + 0.001),
      y: rail.p1.y + f * dy + ny * (R + 0.001), z: R};
    contact.shot = {...contact.shot, v0: 0.5, phi: Math.atan2(-ny, -nx), theta: 0, a: 0, b: 0};
    cases.push({name: 'segment-10', expectedPot: true, scenario: contact});
    for (const [pocket, p] of G.pockets.entries()) {
      const d = p.corner ? Math.SQRT2 : 1;
      const ux = p.corner ? Math.sign(p.x) / d : 0, uz = Math.sign(p.z) / d;
      for (const [speed, offset] of [[0.35, 0], [1.2, 0], [3, 0], [1.2, -0.012], [1.2, 0.012]]) {
        const s = scene(), x = p.x - 0.40 * ux - offset * uz, z = p.z - 0.40 * uz + offset * ux;
        s.system.balls[0].state.pos = {x: z, y: x, z: R};
        s.shot = {...s.shot, v0: speed, phi: Math.atan2(ux, uz), theta: 0, a: 0, b: 0};
        cases.push({name: `p${pocket}-v${speed}-offset${offset}`, expectedPot: offset === 0, pocket, offset, scenario: s});
      }
    }
    for (const item of cases) {
      const raw = engine.simulateJson(item.scenario), record = JSON.parse(raw);
      const capture = record.events.find(e => e.kind?.BallPocket?.ball === 0);
      if (!capture) {
        rows.push({name: item.name, pocket: item.pocket, offset_mm: (item.offset ?? 0) * 1000,
          record_sha256: SHA(raw), status: item.expectedPot ? 'FAIL_NO_POT' : 'NOT_POTTED'});
        continue;
      }
      let previous = 0;
      for (const e of record.events) {
        if (e.t >= capture.t) break;
        if (e.post?.some(([ball]) => ball === 0)) previous = e.t;
      }
      const tb = capture.t - Math.min(1e-6, (capture.t - previous) / 2), ta = Math.max(previous, tb - 0.02);
      if (!(tb > ta)) throw new Error('Drop capture has no canonical approach interval');
      const sampler = engine.sampler(raw);
      let a, b;
      try {
        sampler.sampleAt(ta); a = sampler.balls().find(ball => ball.id === 0);
        sampler.sampleAt(tb); b = sampler.balls().find(ball => ball.id === 0);
      } finally { sampler.free(); }
      // game.js selects this production pivot only for grounded captures.
      // Refuse an unsupported fixture instead of checking the wrong path.
      if (!a || !b || b.motionCode === 5 || !(b.z < R * 1.25)) {
        throw new Error(`Drop fixture does not select the grounded production pivot: ${item.name}`);
      }
      const pocket = G.pockets.reduce((best, p) => Math.hypot(p.x - b.y, p.z - b.x)
        < Math.hypot(best.x - b.y, best.z - b.x) ? p : best, G.pockets[0]);
      // These are game.js sinkIndex's bounded 20 ms approach samples.
      // Spin affects orientation only in this branch; sphere clearance
      // needs the production position law, with no texture orientation.
      const pivot = buildSinkPivot({x0: b.y, z0: b.x, vx: (b.y - a.y) / (tb - ta), vz: (b.x - a.x) / (tb - ta),
        wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1], px: pocket.x, pz: pocket.z, pr: pocket.r, r: R,
        falls: api.pocketVisualFalls?.(id, {contract: 'kernel'}) ?? null,
        throats: api.pocketPlateDatums?.(id) ?? null, arcs: api.pocketCollarEnvelope?.(id) ?? null});
      if (!pivot) throw new Error(`Drop pivot missing for ${item.name}`);
      let samples = 0, worst = {clearance_mm: Infinity};
      for (let dt = 0; dt <= (pivot.ttl ?? 0.75) + 0.05; dt += 0.0005) {
        const pose = poseInSink(pivot, dt, {});
        if (!pose || pose.y + R < -0.055) break;
        const centre = new THREE.Vector3(pose.x, pose.y, pose.z), hit = nearest(tree, centre);
        const clearance = (hit.distance - R) * 1000;
        samples++;
        if (clearance < worst.clearance_mm) worst = {clearance_mm: clearance, t_s: dt, centre_m: centre.toArray(), nearest: hit};
      }
      rows.push({name: item.name, pocket: G.pockets.indexOf(pocket), offset_mm: (item.offset ?? 0) * 1000,
        record_sha256: SHA(raw), capture_t: capture.t, samples, ...worst,
        status: samples && Number.isFinite(worst.clearance_mm) && worst.clearance_mm >= -SURFACE * 1000 ? 'PASS' : 'FAIL'});
    }
    return {status: rows.every(r => ['PASS', 'NOT_POTTED'].includes(r.status)) ? 'PASS' : 'FAIL',
      scope: 'canonical approaches and production sink pivot against all submitted surfaces in the pocket height band',
      step_s: 0.0005, rows};
  }
  function contacts(table, radius, tree) {
    const rows = [], unresolved = [];
    const add = (kind, index, fraction, x, y, nx, ny, height) => {
      const q = new THREE.Vector3(y, height, x), c = new THREE.Vector3(y + radius * ny, radius, x + radius * nx);
      const capture = Math.min(...table.pockets.map(p => Math.hypot(c.x - p.center.y, c.z - p.center.x) - p.radius));
      const face = nearest(tree, q, c), ball = nearest(tree, c, c);
      const convention = Math.hypot(radius, height - radius) - radius;
      const air = ball.distance - radius, active = capture >= -1e-9;
      rows.push({kind, index, fraction, active, capture_margin_mm: capture * 1000,
        kernel_contact_m: q.toArray(), centre_m: c.toArray(), face_gap_mm: face.distance * 1000,
        sphere_gap_mm: air * 1000, planar_convention_mm: convention * 1000, nearest_mesh: face.mesh,
        status: !active ? 'POST_CAPTURE' : face.distance > SURFACE || air > convention + SURFACE || air < -SURFACE ? 'FAIL' : 'PASS'});
    };
    for (const [i, s] of table.linear.entries()) {
      const dx = s.p2.x - s.p1.x, dy = s.p2.y - s.p1.y, length = Math.hypot(dx, dy);
      // Full pocket facings; straight rails contribute their terminal 100 mm.
      const facing = Math.abs(dx) > 1e-8 && Math.abs(dy) > 1e-8;
      const n = Math.ceil(length / 0.0005);
      for (let j = 0; j <= n; j++) {
        if (!facing && j * length / n > 0.10 && (n - j) * length / n > 0.10) continue;
        const f = j / n;
        add('linear', i, f, s.p1.x + f * dx, s.p1.y + f * dy, -dy / length, dx / length, s.height);
      }
    }
    for (const [i, a] of table.circular.entries()) {
      let start, sweep;
      if (a.span) { ({start, sweep} = a.span); }
      else {
        const ts = [];
        for (const s of table.linear) for (const p of [s.p1, s.p2]) {
          if (Math.abs(Math.hypot(p.x - a.center.x, p.y - a.center.y) - a.radius) > 1e-7) continue;
          const t = Math.atan2(p.y - a.center.y, p.x - a.center.x);
          if (!ts.some(v => Math.abs(v - t) < 1e-7)) ts.push(t);
        }
        if (ts.length !== 2) { unresolved.push({arc: i, reason: 'no unique exposed arc interval in kernel endpoints'}); continue; }
        start = ts[0]; sweep = ts[1] - ts[0];
        while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
      }
      const n = Math.max(2, Math.ceil(a.radius * Math.abs(sweep) / 0.0005));
      for (let j = 0; j <= n; j++) {
        const f = j / n, t = start + f * sweep, nx = Math.cos(t), ny = Math.sin(t);
        add('arc', i, f, a.center.x + a.radius * nx, a.center.y + a.radius * ny, nx, ny, a.height);
      }
    }
    return {status: unresolved.length || rows.some(r => r.status === 'FAIL') ? 'FAIL' : 'PASS', unresolved, rows};
  }
  function mirrors(data, G, tree) {
    const points = new Map();
    const keyFor = p => p.toArray().map(v => Math.round(v * 1e7)).join(',');
    const basis = data.triangles.filter(r => r.mesh.cushion
      || /^(dm-bootcollar-|obPocketCap|obPocketFallWall|cn8-mid-(leather|fallcloth))/.test(r.name));
    for (const r of basis) for (const p of [r.tri.a, r.tri.b, r.tri.c, r.tri.getMidpoint(new THREE.Vector3())]) {
      if (p.y < 0.0001 || p.y > 0.08 || !G.pockets.some(v => Math.hypot(p.x - v.x, p.z - v.z) < 0.20)) continue;
      points.set(keyFor(p), {point: p, mesh: r.name, triangle: r.id});
    }
    const result = [];
    for (const axis of ['x', 'z']) {
      let worst = {distance: 0}, count = 0, certified = 0;
      for (const {point: p} of points.values()) {
        const q = p.clone(); q[axis] *= -1;
        // This witness is a vertex or centroid ON an emitted visible
        // triangle. Its distance bounds the true nearest distance from
        // above, so an in-tolerance witness proves the exact predicate.
        // Missing/out-of-tolerance witnesses still use the full triangle
        // query; no sample is dropped and a witness never certifies FAIL.
        const target = exact ? null : points.get(keyFor(q));
        const distance = target ? q.distanceTo(target.point) : Infinity;
        const near = distance <= MIRROR
          ? {distance, mesh: target.mesh, triangle: target.triangle, point_m: target.point.toArray()}
          : nearest(tree, q);
        if (distance <= MIRROR) certified++;
        count++;
        if (near.distance > worst.distance) worst = {...near, source_m: p.toArray(), reflected_m: q.toArray()};
      }
      result.push({axis, samples: count, certified, exact_queries: count - certified,
        distance_kind: exact ? 'nearest triangle' : 'surface-witness upper bound with exact fallback',
        maximum_mm: worst.distance * 1000, witness: worst,
        status: count && worst.distance <= MIRROR ? 'PASS' : 'FAIL'});
    }
    return {status: result.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
      basis: 'Emitted cushion and pocket-collar surfaces; cosmetic kerf floors and table markings excluded', rows: result};
  }
  function witness(id, G, tree) {
    const scenario = engine.nineBallRack(7, {table_id: id}), R = scenario.system.balls[0].params.r;
    const seg = scenario.system.table.linear[10], dx = seg.p2.x - seg.p1.x, dy = seg.p2.y - seg.p1.y;
    const length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
    const f = (G.W / 2 + 0.028 - seg.p1.x) / dx;
    const x = seg.p1.x + f * dx, y = seg.p1.y + f * dy;
    scenario.system.balls = scenario.system.balls.filter(b => b.id === 0);
    scenario.system.balls[0].state.pos = {x: x + nx * (R + 0.001), y: y + ny * (R + 0.001), z: R};
    scenario.shot = {...scenario.shot, v0: 0.5, phi: Math.atan2(-ny, -nx), theta: 0, a: 0, b: 0};
    const raw = engine.simulateJson(scenario), record = JSON.parse(raw);
    const hit = record.events.find(e => e.kind?.BallLinearCushion), pocket = record.events.find(e => e.kind?.BallPocket);
    if (!hit || hit.kind.BallLinearCushion.seg !== 10 || !pocket || pocket.t <= hit.t) return {status: 'REFUSED', reason: 'canonical pre-capture seg-10 witness did not reproduce'};
    const sampler = engine.sampler(raw);
    let state;
    try { sampler.sampleAt(hit.t); state = sampler.balls().find(b => b.id === 0); } finally { sampler.free(); }
    const c = new THREE.Vector3(state.y, state.z, state.x), near = nearest(tree, c, c);
    const convention = Math.hypot(R, seg.height - R) - R;
    const gap = near.distance - R;
    return {status: gap > convention + SURFACE || gap < -SURFACE ? 'FAIL' : 'PASS', hit, pocket,
      ball_state: state, sphere_gap_mm: gap * 1000, planar_convention_mm: convention * 1000,
      record_sha256: SHA(raw), nearest: near};
  }

  function cueFloors(id, data, G, api) {
    if (!api?.cpuMouthCarveAt || !api?.renderRailGeomFor) return {status: 'REFUSED', reason: 'paired render constraint module missing'};
    const g = api.renderRailGeomFor(id), current = g.mouths;
    const legacy = {...current, ring: Object.fromEntries(Object.entries(current.ring).map(([k, r]) =>
      [k, {...r, joinBands: undefined}]))};
    const points = new Map();
    for (const r of data.triangles.filter(r => r.name.startsWith('dm-bootcollar-'))) {
      for (const p of [r.tri.a, r.tri.b, r.tri.c, r.tri.getMidpoint(new THREE.Vector3())]) {
        if (p.y <= 0 || p.y > 0.08) continue;
        points.set(p.toArray().map(v => Math.round(v * 1e7)).join(','), p);
      }
    }
    const results = [];
    for (const [label, mouths] of [['paired', current], ['without_join_floor', legacy]]) {
      let worst = {undershoot_mm: 0}, failures = 0, certified = 0, queries = 0;
      const floorAt = (x, z) => {
        queries++;
        const ax = Math.abs(x) - G.L / 2, az = Math.abs(z) - G.W / 2, nd = Math.max(ax, az);
        if (nd <= 0 || nd > g.cushionWidth + g.frameWidth) return 0;
        const carve = api.cpuMouthCarveAt(mouths, x, ax, az, nd, g.cushionWidth, nd <= g.cushionWidth ? g.railTop : g.frameTop);
        return carve?.open ? 0 : carve?.top ?? (nd <= g.cushionWidth ? g.railTop : g.frameTop);
      };
      for (const p of points.values()) {
        // A Float32 boundary vertex may round a few nanometres into the
        // open side of an analytic boundary. The 10 micrometre neighbourhood
        // judges that boundary as closed, without hiding a macroscopic gap.
        let floor = Math.max(0, floorAt(p.x, p.z));
        // The exact test takes the maximum of these nine floor values.
        // Once the centre alone covers the vertex, the remaining values
        // cannot create a positive undershoot. Boundary cases retain all
        // nine queries, including every failure and the worst residual.
        if (!exact && floor >= p.y) certified++;
        else for (const ox of [-0.00001, 0, 0.00001]) for (const oz of [-0.00001, 0, 0.00001]) {
          if (ox || oz) floor = Math.max(floor, floorAt(p.x + ox, p.z + oz));
        }
        const undershoot = p.y - floor;
        if (undershoot > SURFACE) failures++;
        if (undershoot * 1000 > worst.undershoot_mm) worst = {undershoot_mm: undershoot * 1000, point_m: p.toArray(), floor_mm: floor * 1000};
      }
      results.push({label, samples: points.size, failures, worst, certified, floor_queries: queries});
    }
    const solveRows = [], R = G.render.profileBallD / 2, DEG = Math.PI / 180;
    const poses = [];
    for (const sign of [-1, 1]) for (const x of [-0.08, 0, 0.05, 0.08]) {
      poses.push({pos: {x, y: R, z: sign * (G.W / 2 - R - 0.008)}, phi: sign < 0 ? 0 : Math.PI});
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      poses.push({pos: {x: sx * (G.L / 2 - 0.05), y: R, z: sz * (G.W / 2 - 0.05)}, phi: Math.atan2(-sx, -sz)});
    }
    for (const [index, pose] of poses.entries()) for (const [a, b, turn] of [[0, 0, 0], [0.2, -0.3, 0.22], [-0.2, 0.3, -0.22]]) {
      const phi = pose.phi + turn, started = performance.now();
      const floor = api.cueMinElevationDeg(pose.pos, phi, a, b, g, R);
      const elapsed = performance.now() - started;
      // Compare the compiled line envelope with the exhaustive evaluator,
      // which enumerates every height boundary on every call. The angular
      // bracket allows the old evaluator's EDGE_EPS sampling either side.
      const raw = api.cpuMinRailClearance(pose.pos, phi, floor * DEG, a, b, g, R);
      const below = floor > 0.001 ? api.cpuMinRailClearance(pose.pos, phi, (floor - 0.001) * DEG, a, b, g, R) : null;
      solveRows.push({pose: index, a, b, turn, floor_deg: floor, raw_clearance_mm: raw * 1000,
        below_clearance_mm: below === null ? null : below * 1000, elapsed_ms: elapsed,
        status: raw >= -1e-7 && (below === null || below < 1e-7) ? 'PASS' : 'FAIL'});
    }
    return {status: results[0].failures || solveRows.some(r => r.status !== 'PASS') ? 'FAIL' : 'PASS',
      scope: 'Render-only cue constraint over the emitted leather; gameplay floor is held to main by check-cue-aim-floor.mjs',
      rows: results, solve_brackets: solveRows};
  }

  for (const id of ids) {
    const started = performance.now();
    const phases = {}, timed = (name, fn) => {
      const t = performance.now(), value = fn(); phases[name] = performance.now() - t; return value;
    };
    let result = {id, enforced: options['--strict'] === true || ENFORCED.has(id), phase_ms: phases};
    try {
      const built = await buildTransportInputs({root: ROOT, tableId: id, readSource, settle: true});
      phases.build = performance.now() - started;
      if (mutateScene) mutateScene(built, id);
      const {G, tableAPI} = built, R = G.render.profileBallD / 2;
      const table = JSON.parse(engine.kernel.table_geometry_json_for(id, R));
      if (table.error) throw new Error(table.error);
      if (!G.pockets.length) { result = {...result, status: 'NOT_APPLICABLE', reason: 'pocketless table'}; }
      else {
        const data = timed('emitted', () => emitted(built.group, G));
        // Private prototype proofs can inspect the same submitted triangles
        // and re-emit an explicit negative control without a second builder.
        if (observeEmitted) observeEmitted(data, G, () => emitted(built.group, G));
        // The bed is deliberately excluded: every grounded ball already
        // touches it, which would hide any missing cushion in a nearest query.
        const surfaces = data.triangles.filter(t => t.box.max.y >= 0.010 && t.box.min.y <= 0.08);
        const tree = timed('contact_tree', () => treeFor(surfaces));
        const mirrorTree = timed('mirror_tree', () => treeFor(data.triangles.filter(t => t.box.max.y >= 0 && t.box.min.y <= 0.08)));
        const closure = timed('closure', () => joins(data, G, tableAPI, id));
        const opening = timed('opening', () => projectPocketOpenings(data, G,
          tableAPI.pocketAxisFrame, {exact}));
        const contact = timed('contact', () => contacts(table, R, tree));
        const symmetry = timed('symmetry', () => mirrors(data, G, mirrorTree));
        const replay = ENFORCED.has(id) ? timed('replay', () => witness(id, G, tree)) : null;
        const cue = ENFORCED.has(id) ? timed('cue_floor', () => cueFloors(id, data, G, built.cueAPI)) : null;
        const construction = timed('opening_dimensions', () => openingDimensions(G, tableAPI));
        const drop = options['--drop'] && ENFORCED.has(id)
          ? timed('drop', () => drops(id, G, tableAPI, treeFor(data.triangles.slice()))) : null;
        result = {...result, triangles: surfaces.length, closure, opening, contact, symmetry, witness: replay, cue_floor: cue, construction, drop,
          status: [closure, opening, contact, symmetry, ...(replay ? [replay, cue] : []), ...(drop ? [drop] : [])].every(r => r.status === 'PASS') ? 'PASS' : 'FAIL'};
      }
    } catch (error) { result = {...result, status: 'REFUSED', reason: error.stack}; }
    const defects = new Set();
    for (const row of result.closure?.rows ?? []) if (row.status !== 'PASS') defects.add(`closure:${row.kind ?? 'unresolved'}`);
    for (const row of result.opening?.rows ?? []) if (row.status !== 'PASS') defects.add(`opening:${row.kind}`);
    if (result.opening?.status === 'REFUSED') defects.add('opening:unresolved');
    for (const row of result.contact?.rows ?? []) if (row.status === 'FAIL') defects.add(`contact:${row.kind}`);
    if (result.contact?.unresolved.length) defects.add('contact:unresolved');
    for (const row of result.symmetry?.rows ?? []) if (row.status !== 'PASS') defects.add(`mirror:${row.axis}`);
    if (result.witness && result.witness.status !== 'PASS') defects.add('replay:segment-10');
    if (result.cue_floor?.rows?.[0].failures) defects.add('cue:collar-floor');
    if (result.cue_floor?.solve_brackets?.some(r => r.status !== 'PASS')) defects.add('cue:solve');
    if (result.drop?.status === 'FAIL') defects.add('drop:surface-intersection');
    result.defects = [...defects].sort();
    result.elapsed_ms = performance.now() - started;
    reporter.record(result);
  }
  return reporter.finish();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--strict', '--exact', '--drop'].includes(key)) options[key] = true;
    else if (['--out', '--tables'].includes(key) && args[i + 1]) options[key] = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  if (!options['--out']) throw new Error('--out is required');
  const report = await checkPocketAssembly(options);
  process.exitCode = report.verdict === 'PASS_ENFORCED' ? 0 : 1;
}
