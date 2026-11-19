// Copyright (c) Meta Platforms, Inc. and affiliates.

// Actual cuepost factory + canonical WASM records + its emitted rod vertices.
// This measures a finite pose/time/surface grid, not a browser visibility proof.
// The GLSL expression is checked before mirroring its vertex arithmetic; triangle
// centroids are interpolated AFTER deformation, as rasterization does. The
// opposing surface is the actual submitted leather mesh. The conservative
// mouth envelope is reported separately and cannot classify a real clip.
// Textures are built behind a canvas shim but never inspected, persisted or used as data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {ROOT, sha, tipOffsets, distribution} from './cue-contract-source.mjs';
import {buildRenderedLeatherSurface, renderedSurfaceControls} from './rendered-leather-surface.mjs';

export function canvasEnvironment() {
  const noop = () => {};
  const imageData = (w, h) => ({data: new Uint8ClampedArray(w * h * 4), width: w, height: h});
  const canvas = () => ({width: 1, height: 1, style: {}, getContext: kind => kind === '2d' ? new Proxy({}, {
    get: (t, k) => k === 'createImageData' ? imageData : k === 'getImageData' ? (x, y, w, h) => imageData(w, h)
      : k === 'measureText' ? () => ({width: 1}) : typeof k === 'string' && k.startsWith('create') ? () => ({addColorStop: noop}) : t[k] ?? noop,
  }) : null});
  globalThis.document ??= {createElement: tag => { assert.equal(tag, 'canvas'); return canvas(); },
    createElementNS: () => canvas(), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    addEventListener: noop, documentElement: {style: {setProperty: noop}}, body: {appendChild: noop}};
  globalThis.removeEventListener ??= noop;
  globalThis.requestAnimationFrame ??= () => 0;
  globalThis.cancelAnimationFrame ??= noop;
}

const compact = text => text.replace(/\s+/g, '');
export function shaderReader(mesh, shaders) {
  const shader = {uniforms: {}, vertexShader: '#include <begin_vertex>'};
  mesh.material.onBeforeCompile(shader);
  const match = shader.vertexShader.match(/float cueS = clamp\(-\(uSegZ \+ position.y\) \* ([0-9.]+), 0.0, 1.0\);/);
  assert(match, 'unrecognized cuepost station expression');
  const whip = Object.hasOwn(shader.uniforms, 'uFlex2A');
  const expected = whip ? `{
    float cueS = clamp(-(uSegZ + position.y) * ${match[1]}, 0.0, 1.0);
    float uu = clamp(cueS / max(uRailS, 0.05), 0.0, 1.0);
    float ww = clamp((uFlex2S - cueS) / max(uFlex2S, 0.05), 0.0, 1.0);
    float bb = cueS / max(uFlex2S, 0.05);
    float b1 = min(bb, 1.0);
    transformed += uFlexA * sin(PI * cueS) + uRailA * (uu * uu * (3.0 - 2.0 * uu))
      + uFlex2A * (ww * ww)
      + uBendC * (2.5980762 * b1 * (1.0 - b1 * b1) - 5.1961524 * max(bb - 1.0, 0.0));
  }` : `{
    float cueS = clamp(-(uSegZ + position.y) * ${match[1]}, 0.0, 1.0);
    float uu = clamp(cueS / max(uRailS, 0.05), 0.0, 1.0);
    transformed += uFlexA * sin(PI * cueS) + uRailA * (uu * uu * (3.0 - 2.0 * uu));
  }`;
  assert.equal(compact(shader.vertexShader.split('#include <begin_vertex>')[1]), compact(expected),
    'cuepost shader changed; update the measured expression explicitly');
  shaders.add(sha(shader.vertexShader));
  const p = mesh.geometry.attributes.position, stations = new Map();
  for (let i = 0; i < p.count; i++) stations.set(p.getY(i), null);
  return {mesh, whip, u: shader.uniforms, invLen: Number(match[1]), stations, points: new Float64Array(p.count * 3)};
}

export function sampleRod(readers, geom, api, surface, {details = false, envelope = true} = {}) {
  let depth = 0, samples = 0, leatherSamples = 0, worst = null;
  let envelopeDepth = 0, envelopeSamples = 0, envelopeWorst = null, minClearance = Infinity;
  let closest = null, reader = null;
  const halfL = geom.L / 2, halfW = geom.W / 2, band = geom.cushionWidth + geom.frameWidth;
  const measure = (x, y, z, kind, lx, ly, lz) => {
    samples++;
    const actualTop = surface.height(x, z);
    if (Number.isFinite(actualTop)) {
      leatherSamples++;
      if (details && y - actualTop < minClearance) {
        const m = reader.mesh.matrixWorld.elements;
        // Remove only the original radial coordinates from the already
        // shader-deformed point. Centroids/edge midpoints therefore keep
        // rasterization's interpolation of the emitted vertices.
        closest = {kind, point_m: [x, y, z], top_m: actualTop,
          mesh: surface.last.mesh, triangle: surface.last.triangle, instance: surface.last.instance,
          rod_mesh: reader.mesh.name, rod_part_index: readers.indexOf(reader),
          station_m: -(reader.u.uSegZ.value + ly), local_point_m: [lx, ly, lz],
          axis_point_m: [x - m[0] * lx - m[8] * lz, y - m[1] * lx - m[9] * lz, z - m[2] * lx - m[10] * lz]};
      }
      minClearance = Math.min(minClearance, y - actualTop);
      const pen = actualTop - y;
      if (pen > depth) { depth = pen; worst = {kind, point_m: [x, y, z], top_m: actualTop, depth_m: pen,
        mesh: surface.last.mesh, triangle: surface.last.triangle, instance: surface.last.instance}; }
    }
    if (!envelope) return;
    const ax = Math.abs(x) - halfL, az = Math.abs(z) - halfW, nd = Math.max(ax, az);
    if (nd <= 0 || nd > band) return;
    const carve = api.__probeMouthCarveAt(geom.mouths, x, ax, az, nd, geom.cushionWidth, -Infinity);
    // A non-open carve is the collar or joined leather footprint. Unrelated
    // solid rail bands and empty mouth corridors do not count as leather.
    if (!carve || carve.open || !Number.isFinite(carve.top)) return;
    envelopeSamples++;
    const pen = carve.top - y;
    if (pen > envelopeDepth) { envelopeDepth = pen; envelopeWorst = {kind, point_m: [x, y, z], top_m: carve.top, depth_m: pen, collar: carve.collar}; }
  };
  for (const r of readers) {
    reader = r;
    const {mesh, u, invLen, points} = r, p = mesh.geometry.attributes.position, m = mesh.matrixWorld.elements;
    for (const y of r.stations.keys()) {
      const s = Math.min(1, Math.max(0, -(u.uSegZ.value + y) * invLen));
      const uu = Math.min(1, Math.max(0, s / Math.max(u.uRailS.value, 0.05)));
      const weights = [Math.sin(Math.PI * s), uu * uu * (3 - 2 * uu)];
      const vectors = [u.uFlexA.value, u.uRailA.value];
      if (r.whip) {
        const ww = Math.min(1, Math.max(0, (u.uFlex2S.value - s) / Math.max(u.uFlex2S.value, 0.05)));
        const bb = s / Math.max(u.uFlex2S.value, 0.05), b1 = Math.min(bb, 1);
        weights.push(ww * ww, 2.5980762 * b1 * (1 - b1 * b1) - 5.1961524 * Math.max(bb - 1, 0));
        vectors.push(u.uFlex2A.value, u.uBendC.value);
      }
      const offset = [0, 0, 0];
      for (let k = 0; k < vectors.length; k++) { offset[0] += vectors[k].x * weights[k]; offset[1] += vectors[k].y * weights[k]; offset[2] += vectors[k].z * weights[k]; }
      r.stations.set(y, offset);
    }
    for (let i = 0; i < p.count; i++) {
      const offset = r.stations.get(p.getY(i));
      const xx = p.getX(i) + offset[0], yy = p.getY(i) + offset[1], zz = p.getZ(i) + offset[2];
      const o = i * 3;
      points[o] = m[0] * xx + m[4] * yy + m[8] * zz + m[12];
      points[o + 1] = m[1] * xx + m[5] * yy + m[9] * zz + m[13];
      points[o + 2] = m[2] * xx + m[6] * yy + m[10] * zz + m[14];
      measure(points[o], points[o + 1], points[o + 2], 'vertex', p.getX(i), p.getY(i), p.getZ(i));
    }
    const ix = mesh.geometry.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      measure((points[a] + points[b] + points[c]) / 3, (points[a + 1] + points[b + 1] + points[c + 1]) / 3,
        (points[a + 2] + points[b + 2] + points[c + 2]) / 3, 'triangle-centroid',
        details ? (p.getX(ix[i]) + p.getX(ix[i + 1]) + p.getX(ix[i + 2])) / 3 : 0,
        details ? (p.getY(ix[i]) + p.getY(ix[i + 1]) + p.getY(ix[i + 2])) / 3 : 0,
        details ? (p.getZ(ix[i]) + p.getZ(ix[i + 1]) + p.getZ(ix[i + 2])) / 3 : 0);
      measure((points[a] + points[b]) / 2, (points[a + 1] + points[b + 1]) / 2, (points[a + 2] + points[b + 2]) / 2, 'edge-midpoint',
        details ? (p.getX(ix[i]) + p.getX(ix[i + 1])) / 2 : 0, details ? (p.getY(ix[i]) + p.getY(ix[i + 1])) / 2 : 0,
        details ? (p.getZ(ix[i]) + p.getZ(ix[i + 1])) / 2 : 0);
      measure((points[b] + points[c]) / 2, (points[b + 1] + points[c + 1]) / 2, (points[b + 2] + points[c + 2]) / 2, 'edge-midpoint',
        details ? (p.getX(ix[i + 1]) + p.getX(ix[i + 2])) / 2 : 0, details ? (p.getY(ix[i + 1]) + p.getY(ix[i + 2])) / 2 : 0,
        details ? (p.getZ(ix[i + 1]) + p.getZ(ix[i + 2])) / 2 : 0);
      measure((points[c] + points[a]) / 2, (points[c + 1] + points[a + 1]) / 2, (points[c + 2] + points[a + 2]) / 2, 'edge-midpoint',
        details ? (p.getX(ix[i + 2]) + p.getX(ix[i])) / 2 : 0, details ? (p.getY(ix[i + 2]) + p.getY(ix[i])) / 2 : 0,
        details ? (p.getZ(ix[i + 2]) + p.getZ(ix[i])) / 2 : 0);
    }
  }
  return {depth, samples, leatherSamples, worst, envelopeDepth, envelopeSamples, envelopeWorst, minClearance, closest};
}

function sampleTimes(plan) {
  const end = Math.min(plan.tLift ?? plan.tHide, plan.tHide - 1e-7);
  assert(Number.isFinite(end) && end >= plan.t_contact && end - plan.t_contact <= 10, 'bounded post-strike window');
  const times = new Set([plan.t_contact, end]);
  const denseEnd = Math.min(end, plan.tAdvEnd + 0.25);
  for (let t = plan.t_contact; t <= denseEnd; t += 1 / 60) times.add(t);
  for (let i = 0; i <= 16; i++) times.add(plan.t_contact + (end - plan.t_contact) * i / 16);
  for (const t of [plan.tFtEnd, plan.tAdvEnd, plan.tTouch, plan.tTouch === null ? null : plan.tTouch + plan.bend.rampS,
    plan.tArrest, plan.fadeStart, plan.wdFadeStart]) if (Number.isFinite(t) && t >= plan.t_contact && t <= end) times.add(t);
  return [...times].sort((a, b) => a - b);
}

export async function auditCuePost({sources, variant, grid, reference, onProgress = () => {}}) {
  canvasEnvironment();
  assert(Object.is(variant.api.CUE_DIMS.RAIL_CLEAR, 0.002), 'unchanged 2 mm clearance law');
  const {init} = await import(pathToFileURL(path.join(ROOT, 'web/dist/pool-sdk/index.js')).href);
  const engine = await init(path.join(ROOT, 'web/dist/pool-wasm/pool_wasm.js'));
  const THREE = await sources.importWeb(variant.name, 'vendor/three.module.min.js');
  const {createCuePost} = await sources.importWeb(variant.name, 'app/cuepost.js');
  const report = {schema: 'cuepost-rail-audit/2', audited: true, speed_mps: 1.5, cue: 'standard',
    wasm_sha256: sha(fs.readFileSync(path.join(ROOT, 'web/dist/pool-wasm/pool_wasm_bg.wasm'))),
    kernel_version: engine.version(), cuepost_sha256: sha(sources.source(variant.name, 'web/app/cuepost.js')),
    instrument_sha256: sha(fs.readFileSync(new URL(import.meta.url))),
    coverage: 'same four pool-table grids and three offsets as the live audit; canonical simulation and actual createCuePost',
    time_sampling: '60 Hz through follow-through plus 0.25 s; 16 uniform window samples and exact plan knots through stay-down',
    surface_sampling: 'every emitted shader-deformed rod vertex, triangle centroid and edge midpoint against the actual submitted upward leather triangles; double arithmetic, no GPU',
    surface_controls: renderedSurfaceControls(), surfaces: [], switch_after_arm_controls: [],
    rod_correction: 'none; actual-surface measurement decides whether the scoped lift is needed',
    visible_clip_bar_m: 0.002, rows: [], errors: [], shader_sha256: [], frames: 0,
    visible_frames: 0, surface_samples: 0, leather_samples: 0, visible_clip_poses: 0, refused: 0, unreachable: 0,
    envelope_samples: 0, envelope_overlap_poses: 0,
    fold_sample_fields: ['surface_index', 'tip_x', 'tip_y', 'tip_z', 'axis_x', 'axis_y', 'axis_z', 'intrinsic_displacement_bound_m'],
    fold_samples: [],
    requested_poses: grid.filter(p => p.id !== 'wpbsa_snooker_12ft').reduce((n, p) => n + tipOffsets(p).length, 0),
    verdict: 'RUNNING', pass: false};
  const shaders = new Set(), frames = [], poses = [], envelopeFrames = [], envelopePoses = [], contexts = new Map();
  const getContext = async id => {
    if (!contexts.has(id)) {
      const scene = new THREE.Scene(), game = {}, ctx = {scene, game, callback: null, readers: null};
      ctx.post = createCuePost({machine: {on(event, fn) { assert.equal(event, 'frame'); ctx.callback = fn; }},
        game, scene, railGeom: variant.geoms.get(id)});
      ctx.geom = variant.api.renderRailGeomFor(id);
      ctx.surface = await buildRenderedLeatherSurface(sources, variant, id);
      ctx.surfaceIndex = report.surfaces.length;
      report.surfaces.push(ctx.surface.record); contexts.set(id, ctx);
    }
    return contexts.get(id);
  };
  auditLoop: for (const [index, p] of grid.entries()) {
    if (p.id === 'wpbsa_snooker_12ft') continue;
    variant.table.__probeSelectTable(p.id);
    const ctx = await getContext(p.id);
    for (const [a, b] of tipOffsets(p)) {
      const floor = reference.api.cueMinElevationDeg(p.pos, p.phi, a, b, reference.geoms.get(p.id), p.R, p.balls);
      // The shot JSON carries +0 at the zero-degree AUTO setting.
      const auto = Math.max(0, Math.ceil(floor - 1e-9)), row = {index, table: p.id, pocket: p.pocket, pos: p.pos, phi: p.phi, a, b,
        obstacles: p.balls, floor_deg: floor, fired_auto_deg: auto, visible_frames: 0, max_depth_m: 0, envelope_max_depth_m: 0};
      report.rows.push(row);
      if (auto > 80) { row.status = 'UNREACHABLE_AT_APP_CAP'; report.unreachable++; continue; }
      let sampler;
      try {
        const scenario = engine.nineBallRack(7, {table_id: p.id}), template = structuredClone(scenario.system.balls[0]);
        scenario.system.balls = [template, ...p.balls.map((ball, i) => ({...structuredClone(template), id: i + 1,
          state: {...structuredClone(template.state), pos: {x: ball.z, y: ball.x, z: ball.y}}}))];
        template.state.pos = {x: p.pos.z, y: p.pos.x, z: p.R};
        scenario.shot = {...scenario.shot, v0: report.speed_mps, phi: p.phi, theta: auto * Math.PI / 180, a, b};
        const raw = engine.simulateJson(scenario), record = JSON.parse(raw);
        row.record_sha256 = sha(raw);
        for (const key of ['v0', 'phi', 'theta', 'a', 'b']) assert(Object.is(record.shot[key], scenario.shot[key]), `record input ${key}`);
        sampler = engine.sampler(raw); ctx.game.record = record; ctx.game.sampler = sampler;
        ctx.post.arm(null);
        const messages = [], saved = {warn: console.warn, debug: console.debug, error: console.error};
        let plan;
        try {
          for (const key of Object.keys(saved)) console[key] = (...args) => messages.push({level: key, text: args.join(' ')});
          plan = ctx.post.arm({t_contact: 0, approach: {from_s: -0.6, pullback_m: 0.1, ease: 'smooth'},
            visible_window: [-0.6, null], cue: {id: 'standard'}});
        } finally { Object.assign(console, saved); }
        if (plan === false) {
          row.status = messages.some(m => m.level === 'error') ? 'ARM_ERROR' : 'FRAMING_REFUSED'; row.messages = messages;
          if (row.status === 'ARM_ERROR') { report.errors.push({index, a, b, messages}); break auditLoop; }
          report.refused++;
          continue;
        }
        row.plan = {theta_deg: plan.bend.thetaDeg, tFtEnd: plan.tFtEnd, tAdvEnd: plan.tAdvEnd, tLift: plan.tLift,
          tHide: plan.tHide, tTouch: plan.tTouch, mode: plan.mode, followThroughM: plan.followThroughM};
        const group = ctx.scene.children.find(g => g.userData.obCueRole === 'post');
        assert(group && group.children.length === 6, 'actual six-segment cuepost rod');
        ctx.readers ??= group.children.map(m => shaderReader(m, shaders));
        for (const t of sampleTimes(plan)) {
          ctx.callback(t); report.frames++;
          let frame = ctx.post.state().frame;
          if (!frame?.visible || !(frame.opacity > 0)) continue;
          if (!ctx.switchChecked) {
            const snapshot = () => {
              group.updateMatrixWorld(true);
              return {frame: structuredClone(ctx.post.state().frame), matrices: group.children.map(m => [...m.matrixWorld.elements]),
                uniforms: ctx.readers.map(r => Object.fromEntries(Object.entries(r.u).map(([key, u]) =>
                  [key, u.value?.isVector3 ? u.value.toArray() : u.value])))};
            };
            const before = snapshot();
            variant.table.__probeSelectTable('wpbsa_snooker_12ft');
            try {
              ctx.callback(t);
              const pass = isDeepStrictEqual(before, snapshot());
              report.switch_after_arm_controls.push({table: p.id, switched_to: 'wpbsa_snooker_12ft', t, pass});
              assert(pass, 'record-bound cuepost changes when active table switches after arm');
            } finally { variant.table.__probeSelectTable(p.id); }
            ctx.switchChecked = true; frame = ctx.post.state().frame;
          }
          const f = frame.flex;
          const intrinsic = Math.hypot(...f.flexA) + Math.hypot(...(f.flex2A ?? [0, 0, 0]))
            + Math.hypot(...(f.bendA ?? [0, 0, 0])) * Math.max(1, 5.1961524 * (1 / Math.max(f.flex2S ?? 0.78, 0.05) - 1));
          report.fold_samples.push([ctx.surfaceIndex, ...frame.tip, ...frame.axis, intrinsic]);
          group.updateMatrixWorld(true); report.visible_frames++; row.visible_frames++;
          const measured = sampleRod(ctx.readers, ctx.geom, variant.api, ctx.surface);
          report.surface_samples += measured.samples; report.leather_samples += measured.leatherSamples;
          report.envelope_samples += measured.envelopeSamples;
          frames.push(measured.depth);
          envelopeFrames.push(measured.envelopeDepth);
          if (measured.depth > row.max_depth_m) {
            row.max_depth_m = measured.depth; row.worst = {t, ...measured.worst, tip: frame.tip, axis: frame.axis,
              flex: frame.flex, opacity: frame.opacity, pull: frame.pull, rigid_lift_m: frame.lift};
          }
          if (measured.envelopeDepth > row.envelope_max_depth_m) {
            row.envelope_max_depth_m = measured.envelopeDepth;
            row.envelope_worst = {t, ...measured.envelopeWorst, tip: frame.tip, axis: frame.axis, opacity: frame.opacity};
          }
        }
        for (const key of ['v0', 'phi', 'theta', 'a', 'b']) assert(Object.is(record.shot[key], scenario.shot[key]), `cuepost changed record input ${key}`);
        row.status = row.max_depth_m > report.visible_clip_bar_m ? 'VISIBLE_LEATHER_CLIP' : 'SAMPLED_CLEAR';
        if (row.status === 'VISIBLE_LEATHER_CLIP') report.visible_clip_poses++;
        if (row.envelope_max_depth_m > report.visible_clip_bar_m) report.envelope_overlap_poses++;
        poses.push(row.max_depth_m);
        envelopePoses.push(row.envelope_max_depth_m);
      } catch (error) {
        row.status = 'ERROR'; row.error = String(error?.stack ?? error); report.errors.push({index, a, b, error: row.error});
        break auditLoop;
      } finally { sampler?.free(); ctx.post.arm(null); }
    }
    if (index % 144 === 0) {
      console.log(`CUEPOST-AUDIT ${p.id} grid ${index}: records ${report.rows.length}, visible clips ${report.visible_clip_poses}, errors ${report.errors.length}`);
      onProgress(report);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  report.live_float = await auditLiveFloat({variant, grid, reference, contexts, shaders});
  for (const ctx of contexts.values()) for (const group of [...ctx.scene.children]) {
    ctx.scene.remove(group);
    for (const m of group.children) { m.geometry?.dispose(); if (m.material?.map?.obCueLookCached !== true) m.material?.map?.dispose(); m.material?.dispose(); }
  }
  report.shader_sha256 = [...shaders]; report.frame_depth_m = distribution(frames); report.pose_depth_m = distribution(poses);
  report.envelope_frame_overlap_m = distribution(envelopeFrames); report.envelope_pose_overlap_m = distribution(envelopePoses);
  report.tables = [...contexts.keys()].map(id => ({id, rows: report.rows.filter(r => r.table === id).length,
    visible_clip_poses: report.rows.filter(r => r.table === id && r.status === 'VISIBLE_LEATHER_CLIP').length,
    envelope_overlap_poses: report.rows.filter(r => r.table === id && r.envelope_max_depth_m > report.visible_clip_bar_m).length,
    depth_m: distribution(report.rows.filter(r => r.table === id && ['VISIBLE_LEATHER_CLIP', 'SAMPLED_CLEAR'].includes(r.status)).map(r => r.max_depth_m))}));
  report.complete = report.rows.length === report.requested_poses;
  report.pass = report.complete && report.errors.length === 0 && report.visible_frames > 0 && report.leather_samples > 0
    && report.visible_clip_poses === 0 && report.switch_after_arm_controls.length === 4
    && report.switch_after_arm_controls.every(x => x.pass);
  report.verdict = report.pass ? 'PASS_SAMPLED_GRID' : 'RED';
  onProgress(report);
  console.log(`CUEPOST-AUDIT ${report.pass ? 'PASS' : 'FAIL'}: ${report.rows.length} poses, ${report.visible_frames} visible frames, `
    + `${report.visible_clip_poses} real-surface poses deeper than ${report.visible_clip_bar_m * 1000} mm, max ${(report.pose_depth_m.max ?? 0) * 1000} mm, `
    + `envelope overlaps ${report.envelope_overlap_poses}, errors ${report.errors.length}`);
  return report;
}

// Steady live aiming uses the real poseCue/updateFlex and emitted rod. Two
// stationary dt=1 applications settle its monotone rail interpolation and
// clear any previous pull bow. This reports the held pose, not transition
// timing. For a lifted pose, "float" is its NEAREST sampled rod underside
// to the actual leather beneath it; high portions of an inclined butt do
// not inflate that number. Poses over no leather are counted separately.
async function auditLiveFloat({variant, grid, reference, contexts, shaders}) {
  const cue = variant.api.buildCue({cueId: 'standard'});
  const readers = cue.group.children.map(m => shaderReader(m, shaders));
  const out = {schema: 'live-bend-rendered-float/1', mode: 'steady real poseCue/updateFlex, default aim mesh and shader, floor and AUTO, three pulls',
    poses: 0, lifted_poses: 0, no_leather_beneath: 0, real_clip_poses: 0, max_lift_m: 0, worst_float: null};
  try {
    for (const [index, p] of grid.entries()) {
      if (p.id === 'wpbsa_snooker_12ft') continue;
      const ctx = contexts.get(p.id); if (!ctx) continue;
      variant.table.__probeSelectTable(p.id);
      for (const [a, b] of tipOffsets(p)) {
        const floor = reference.api.cueMinElevationDeg(p.pos, p.phi, a, b, reference.geoms.get(p.id), p.R, p.balls);
        const angles = [['floor', floor], ['AUTO', Math.max(0, Math.ceil(floor - 1e-9))]];
        for (const [mode, thetaDeg] of angles) for (const pull of [0, 0.06, 0.12]) {
          if (thetaDeg > 80) continue;
          const theta = thetaDeg * Math.PI / 180;
          for (let i = 0; i < 2; i++) variant.api.poseCue(cue, p.pos, p.phi, theta, pull, a, b, 1, p.R);
          out.poses++;
          const flex = variant.api.cueFlexState(cue);
          if (!(flex.rail > 0)) continue;
          out.lifted_poses++; out.max_lift_m = Math.max(out.max_lift_m, flex.rail);
          cue.group.updateMatrixWorld(true);
          const measured = sampleRod(readers, ctx.geom, variant.api, ctx.surface);
          if (measured.depth > 0.002) out.real_clip_poses++;
          if (!Number.isFinite(measured.minClearance)) { out.no_leather_beneath++; continue; }
          if (out.worst_float === null || measured.minClearance > out.worst_float.clearance_m) {
            const saved = cue.flex.u.uRailA.value.z; cue.flex.u.uRailA.value.z = 0;
            const unbent = sampleRod(readers, ctx.geom, variant.api, ctx.surface);
            cue.flex.u.uRailA.value.z = saved;
            out.worst_float = {index, table: p.id, pocket: p.pocket, pos: p.pos, phi: p.phi, a, b, mode, theta_deg: thetaDeg, pull,
              lift_m: flex.rail, fulcrum_s: flex.railS, clearance_m: measured.minClearance,
              unbent_clearance_m: Number.isFinite(unbent.minClearance) ? unbent.minClearance : null,
              clearance_gain_m: Number.isFinite(unbent.minClearance) ? measured.minClearance - unbent.minClearance : null};
          }
        }
      }
      if (index % 144 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    for (const m of cue.group.children) { m.geometry.dispose(); if (m.material.map?.obCueLookCached !== true) m.material.map?.dispose(); m.material.dispose(); }
  }
  console.log(`LIVE-RENDERED-FLOAT ${out.lifted_poses}/${out.poses} lifted poses; worst nearest leather gap ${(out.worst_float?.clearance_m ?? 0) * 1000} mm`);
  return out;
}
