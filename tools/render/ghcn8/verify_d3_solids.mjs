// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-12 O2: complete captured solids, all receiver vertices, an independent
// mesh oracle, actual radiometry replay, and a cover-only adverse plant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { digest, loadCornerBuilder, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';
import { occluder, productionRaySampler, productionLinerRaySampler, assertProductionSampling, assertReviewVertex593 } from './cn8_occlusion_checks.mjs';
import { capturedArray, restoreCapturedValue, sceneFromBuffers, fullSolidMeshOracle, capturedGeometry, productionWallLighting, productionLinerLighting } from './cn8_solid_checks.mjs';
import { receiverCensus } from './cn8_receiver_census.mjs';
import { inheritComponents } from './cn8_embedded_receivers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => JSON.parse(fs.readFileSync(file));
const typed = (type, values) => new globalThis[type](values);
const hashAttribute = a => digest(Buffer.from(capturedArray(a).buffer));
const sampleStats = values => {
  const ordered = [...values].sort((a, b) => a - b);
  return { min: ordered[0], max: ordered.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: ordered[Math.floor(ordered.length / 2)] };
};
const lum = (colors, i) => 0.2126 * colors[i * 3] + 0.7152 * colors[i * 3 + 1] + 0.0722 * colors[i * 3 + 2];
const wallName = /^cn8r82-(?:wallface|tongue|endroll)-[0235]-[ab]$/;
const receiverName = /^(?:cn8r82-(?:wallface|tongue|endroll)-[0235]-[ab]|cn8r82-rollface-[0235]|cn8-net-(?:[0235]|(?:liner|apron)-[0235]))$/;
const allowedColor = /^(?:cn8r82-(?:wallface|tongue|endroll)-[0235]-[ab]|cn8r82-rollface-[0235]|cn8-net-(?:[0235]|(?:apron|liner)-[0235])|cn8-fallbag-[0235])$/;

export function retainedSecondaryLinerSource(source) {
  const marker = '      // ROUND-15 (gate r13 P1-1 — the DARK open mouth): the exterior';
  const start = source.indexOf(marker);
  const end = source.indexOf('      // axis seal disc ', start);
  if (start < 0 || end < 0 || source.indexOf(marker, start + marker.length) !== -1) {
    throw new Error('Retained secondary liner source absent or ambiguous');
  }
  return source.slice(start, end);
}

function loadCapture(folder, renderer, table) {
  const files = ['solids-buffers.json', 'solid-set.json', 'census.json', 'capture-receipt.json'];
  const [rows, solidSet, census, receipt] = files.map(file => read(path.join(folder, file)));
  const binding = receipt.binding;
  if (!binding || binding.table_sha256 !== digest(renderer) || receipt.events?.length
    || census.requested !== table || census.builtId !== table || rows.length !== census.meshes.length) {
    throw new Error('Incomplete or unbound actual solid capture: ' + folder);
  }
  rows.forEach((row, ordinal) => {
    const descriptor = census.meshes[ordinal];
    if (row.ordinal !== ordinal || descriptor.ordinal !== ordinal || row.name !== descriptor.name
      || JSON.stringify(row.matrix) !== JSON.stringify(descriptor.matrix)) throw new Error('Actual solid identity differs');
    for (const [name, attribute] of Object.entries(row.attributes)) {
      if (hashAttribute(attribute) !== descriptor.attributes[name]?.sha256) throw new Error('Actual attribute digest differs: ' + row.name + '/' + name);
      attribute.array = Array.from(capturedArray(attribute));
    }
    const index = row.index ? digest(Buffer.from(typed(row.index.type, row.index.array).buffer)) : null;
    if (index !== descriptor.indexSha256 || JSON.stringify(row.groups) !== JSON.stringify(descriptor.groups)) throw new Error('Actual draw topology differs');
    row.userData = restoreCapturedValue(row.userData);
  });
  return { rows, solidSet, census, receipt, binding,
    inputs: Object.fromEntries(files.map(name => [path.join(folder, name), digest(fs.readFileSync(path.join(folder, name)))])) };
}

function geometryIdentity(before, after, failures) {
  const changes = [];
  if (before.length !== after.length) throw new Error('The solid object count changed');
  after.forEach((row, i) => {
    const old = before[i], fields = [];
    if (row.name !== old.name || JSON.stringify(row.matrix) !== JSON.stringify(old.matrix)) failures.push('Moved solid identity: ' + row.name);
    for (const name of new Set([...Object.keys(old.attributes), ...Object.keys(row.attributes)])) {
      const a = old.attributes[name], b = row.attributes[name];
      if (!a || !b || a.itemSize !== b.itemSize || a.type !== b.type || hashAttribute(a) !== hashAttribute(b)) {
        fields.push(name);
        if (name !== 'color' || !allowedColor.test(row.name)) failures.push('Unintended attribute change: ' + row.name + '/' + name);
      }
    }
    if (JSON.stringify(row.index) !== JSON.stringify(old.index)) {
      fields.push('index');
      if (!/^cn8-plank-[0-5]$/.test(row.name)) failures.push('O2 moved an index buffer: ' + row.name);
    }
    if (JSON.stringify(row.groups) !== JSON.stringify(old.groups)) {
      fields.push('groups');
      if (!/^cn8-plank-[0-5]$/.test(row.name)) failures.push('O2 moved material groups: ' + row.name);
    }
    if (fields.length) changes.push({ ordinal: i, name: row.name, fields });
  });
  return { objects: after.length, changes,
    scope: 'O2 allows only receiver colors; B separately permits the six plank indices/groups. Position, normal and UV bytes are held everywhere.' };
}

function colorsAndFaces(table, row, old, truth, out, failures) {
  const after = row.attributes.color.array, before = old.attributes.color.array;
  if (after.length !== before.length || truth.length !== after.length) throw new Error('Color array lengths differ');
  const mismatches = [], delta = [], a = [], b = [], t = [];
  for (let i = 0; i < after.length; i++) if (after[i] !== truth[i]) mismatches.push(i);
  for (let i = 0; i < after.length / 3; i++) {
    a.push(lum(before, i)); b.push(lum(after, i)); t.push(lum(truth, i)); delta.push(b.at(-1) - a.at(-1));
  }
  if (mismatches.length) failures.push(`${table}/${row.name}: ${mismatches.length} color components differ from full-mesh truth`);
  const ids = row.index?.array ?? Array.from({ length: after.length / 3 }, (_, i) => i);
  const lines = ['triangle,a,b,c,before_linear_multiplier,after_linear_multiplier,mesh_truth_linear_multiplier,after_minus_truth'];
  for (let i = 0; i < ids.length; i += 3) {
    const triangle = ids.slice(i, i + 3), mean = values => triangle.reduce((n, v) => n + values[v], 0) / 3;
    lines.push([i / 3, ...triangle, mean(a), mean(b), mean(t), mean(b) - mean(t)].join(','));
  }
  const file = path.join(out, table + '--' + row.name + '--faces.csv');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { name: row.name, tag: 'DERIVED actual vertex-color linear luminance (Rec.709); retained material and radiometry',
    vertices: a.length, triangles: ids.length / 3, before: sampleStats(a), after: sampleStats(b), mesh_truth: sampleStats(t),
    delta: sampleStats(delta), mismatched_color_components: mismatches.length, first_mismatched_components: mismatches.slice(0, 20),
    before_color_sha256: hashAttribute(old.attributes.color), after_color_sha256: hashAttribute(row.attributes.color),
    truth_color_sha256: digest(Buffer.from(Float32Array.from(truth).buffer)), faces: file, faces_sha256: digest(fs.readFileSync(file)) };
}

export function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--capture', '--before-capture', '--before-renderer', '--out', '--table'].includes(argv[i])
      || !argv[i + 1] || options[argv[i]]) throw new Error('Four unique named paths required');
    options[argv[i]] = argv[i] === '--table' ? argv[i + 1] : path.resolve(argv[i + 1]);
  }
  if (['--capture', '--before-capture', '--before-renderer', '--out'].some(key => !options[key])
    || fs.existsSync(options['--out'])) throw new Error('A fresh output directory and four paths are required');
  if (options['--table'] && !['chinese8_pro_9ft', 'joy_q8_9ft'].includes(options['--table'])) throw new Error('Unknown selected alias');
  fs.mkdirSync(options['--out'], { recursive: true });
  const renderer = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8');
  const beforeRenderer = fs.readFileSync(options['--before-renderer'], 'utf8');
  if (retainedSecondaryLinerSource(renderer) !== retainedSecondaryLinerSource(beforeRenderer)) {
    throw new Error('Secondary-liner FREE field recipe changed');
  }
  const builder = loadCornerBuilder(renderer), beforeBuilder = loadCornerBuilder(beforeRenderer);
  const sample = productionRaySampler(renderer), linerSample = productionLinerRaySampler(renderer);
  const beforeSample = productionRaySampler(beforeRenderer), beforeLinerSample = productionLinerRaySampler(beforeRenderer);
  const solveLiner = productionLinerLighting(renderer), failures = [], tables = [];
  const selectedTables = options['--table'] ? [options['--table']] : ['chinese8_pro_9ft', 'joy_q8_9ft'];
  for (const table of selectedTables) {
    const before = loadCapture(path.join(options['--before-capture'], table), beforeRenderer, table);
    const after = loadCapture(path.join(options['--capture'], table), renderer, table);
    const { L, W } = after.census.geom;
    const group = sceneFromBuffers(after.rows), active = occluder(renderer, group), actual = active.geometry;
    const minimum = active.contact?.quantum_m ?? 0;
    const embedded = receiverCensus(group, actual, minimum, { visibility: false });
    const embeddedFile = path.join(options['--out'], table + '--embedded-receivers.json');
    fs.writeFileSync(embeddedFile, JSON.stringify(embedded.receipt) + '\n');
    const beforeOcc = occluder(beforeRenderer, beforeBuilder.solidRayTree ? sceneFromBuffers(before.rows) : null).geometry;
    const oracle = fullSolidMeshOracle(group), redGroup = new THREE.Group();
    for (const mesh of group.children) if (/^cn8r82-ring-[0235]$/.test(mesh.name)) redGroup.add(mesh.clone());
    const red = builder.solidRayTree(redGroup, minimum);
    const keyMember = ({ ordinal, name, triangles, vertices }) => ({ ordinal, name, triangles, vertices });
    if (JSON.stringify(actual.members.map(keyMember)) !== JSON.stringify(oracle.members)
      || JSON.stringify(after.solidSet?.members.map(keyMember)) !== JSON.stringify(oracle.members)) throw new Error('The production full-solid set differs from actual opaque draws');
    const identity = geometryIdentity(before.rows, after.rows, failures);
    const corners = [], lighting = [], truths = new Map();
    let raysTotal = 0, oldMismatch = 0, newMismatch = 0, redMismatch = 0, samplingGuardRays = 0;
    const rowsByName = new Map(after.rows.map(row => [row.name, row]));
    for (const [corner, sx, sz] of CN8_CORNER_IDENTITIES) {
      const toM = (x, z) => [x / sx - L / 2, z / sz - W / 2];
      const shade = productionWallLighting(renderer, builder.mouthOcclusion(), [L, W], [sx, sz], ray => oracle.blocked(ray, minimum));
      const names = after.rows.filter(row => receiverName.test(row.name)
        && (row.name.endsWith('-' + corner) || row.name.includes('-' + corner + '-'))).map(row => row.name);
      const cornerRows = [], worst = [];
      for (const name of names) {
        const row = rowsByName.get(name), old = before.rows[row.ordinal];
        const position = row.attributes.position.array, matrix = new THREE.Matrix4().fromArray(row.matrix);
        const pointV = new THREE.Vector3(), pointCount = position.length / 3, vertices = [];
        const primaryLiner = name === `cn8-net-${corner}`, linerBasis = primaryLiner ? row.userData.cn8Smooth.nrm.array : null;
        const basis = row.userData?.cn8Transport?.normals;
        const counts = { before: 0, after: 0, red: 0, rays: 0 };
        const plan = embedded.byName.get(name), donors = new Map(plan?.inherited.map(d => [d.vertex, d]) ?? []);
        const wallTruth = wallName.test(name) ? new Float32Array(position.length) : null;
        for (let vertex = 0; vertex < pointCount; vertex++) {
          if (vertex && vertex % 4096 === 0) console.log(JSON.stringify({ table, name, progress_vertices: vertex, pointCount, ...counts }));
          const point = pointV.fromArray(position, vertex * 3).applyMatrix4(matrix).toArray();
          const normal = linerBasis ? linerBasis.slice(vertex * 3, vertex * 3 + 3) : basis?.[vertex];
          const rays = normal ? linerSample(point, normal) : sample(point);
          if (vertex === 0) samplingGuardRays += assertProductionSampling(
            normal ? beforeLinerSample(point, normal) : beforeSample(point), rays);
          if (donors.has(vertex)) {
            vertices.push({ vertex, rays: 0, classification: 'INHERITED', donor: donors.get(vertex).source_vertex,
              reason: plan.classifications[vertex].map(s => ({ solid: s.name, reason: s.reason })) });
            continue;
          }
          if (plan && !plan.freeEligible[vertex]) {
            vertices.push({ vertex, rays: 0, classification: 'UNUSED_ZERO_NORMAL_STORAGE' });
            // Preserve/check this unreferenced storage byte, without treating
            // it as a valid hemisphere receiver or an eligible donor.
            if (wallTruth) wallTruth.fill(Math.fround(shade(...point)), vertex * 3, vertex * 3 + 3);
            continue;
          }
          let a = 0n, b = 0n, t = 0n, r = 0n, missed = null;
          for (let i = 0; i < rays.length; i++) {
            const ray = rays[i].ray, oldBlock = !beforeOcc.rayOpenM(toM, ...ray);
            const block = actual.blocked(...ray), truth = oracle.blocked(ray, minimum), redBlock = red.blocked(...ray);
            const bit = 1n << BigInt(i);
            if (oldBlock) a |= bit; if (block) b |= bit; if (truth) t |= bit; if (redBlock) r |= bit;
            if (oldBlock !== truth) { counts.before++; if (!oldBlock && !missed) missed = { ray_index: i, family: rays[i].family, ray }; }
            if (block !== truth) counts.after++;
            if (redBlock !== truth) counts.red++;
          }
          counts.rays += rays.length;
          vertices.push({ vertex, rays: rays.length, before: a.toString(16), after: b.toString(16), mesh: t.toString(16), red: r.toString(16) });
          if (wallTruth) {
            const value = Math.fround(shade(...point));
            wallTruth.fill(value, vertex * 3, vertex * 3 + 3);
            if (missed) {
              const delta = value - old.attributes.color.array[vertex * 3];
              if (worst.length < 5 || Math.abs(delta) > Math.abs(worst.at(-1).multiplier_delta)) {
                worst.push({ name, vertex, point_m: point, before_multiplier: old.attributes.color.array[vertex * 3],
                  mesh_true_multiplier: value, multiplier_delta: delta, missed: { ...missed, blocker: oracle.trace(missed.ray, minimum) } });
                worst.sort((a, b) => Math.abs(b.multiplier_delta) - Math.abs(a.multiplier_delta)); worst.length = Math.min(5, worst.length);
              }
            }
          }
        }
        if (wallTruth) truths.set(name, plan
          ? inheritComponents(wallTruth, 3, plan.inherited, plan.classifications, plan.freeEligible) : wallTruth);
        if (/^cn8-net-liner-[0235]$/.test(name)) {
          // The source-identical retained field is bound to the BEFORE
          // capture. Only independently certified invalid samples inherit;
          // no hemisphere law is imposed on this historical interior field.
          truths.set(name, inheritComponents(Float32Array.from(old.attributes.color.array), 3,
            plan.inherited, plan.classifications, plan.freeEligible));
        }
        const file = path.join(options['--out'], table + '--' + name + '--vertices.json');
        fs.writeFileSync(file, JSON.stringify({ name, tag: 'DERIVED exact blocked masks; hexadecimal bit i is production ray i', vertices }) + '\n');
        cornerRows.push({ name, vertices: pointCount, inherited_receivers: plan?.inherited.length ?? 0,
          unused_zero_normal_storage: plan?.zero_unused_vertices.length ?? 0,
          ...counts, masks: file, masks_sha256: digest(fs.readFileSync(file)) });
        raysTotal += counts.rays; oldMismatch += counts.before; newMismatch += counts.after; redMismatch += counts.red;
        console.log(JSON.stringify({ table, name, vertices: pointCount, ...counts }));
      }
      const net = rowsByName.get(`cn8-net-${corner}`), bag = rowsByName.get(`cn8-fallbag-${corner}`);
      const netGeo = capturedGeometry(net), fullIndex = [...net.index.array, ...bag.index.array];
      const bed = rowsByName.get('cn8-bed'), clothMat = { color: new THREE.Color().fromArray(bed.materials[0].color) };
      const replay = solveLiner({ netGeo, cn8TransportIndex: new THREE.Uint32BufferAttribute(fullIndex, 1),
        p: after.census.geom.pockets[corner], L, W, CN8_R82: builder.K, clothMat, G: after.census.geom,
        embeddedPlan: embedded.byName.get(net.name),
        cn8Solids: { rayOpenM: (_toM, ...ray) => !oracle.blocked(ray, minimum) } });
      truths.set(net.name, netGeo.attributes.color.array); truths.set(bag.name, netGeo.attributes.color.array);
      const lamp = replay.lamps.get(`${sx},${sz}`), ofx = sx * (L / 2 + builder.K.C), ofz = sz * (W / 2 + builder.K.C);
      for (const name of [`cn8-net-apron-${corner}`, `cn8r82-rollface-${corner}`]) {
        const row = rowsByName.get(name), normals = row.userData.cn8Transport.normals;
        const position = row.attributes.position.array, apron = name === `cn8-net-apron-${corner}`;
        const plan = embedded.byName.get(name);
        const values = new Float32Array(position.length);
        for (let i = 0; i < position.length / 3; i++) {
          if (plan?.classifications[i].length) continue;
          // Replay the published calls exactly: apron buffers are local;
          // rollface buffers are already in table coordinates. Adding and
          // then subtracting a world translation would round the local input.
          const x = apron ? position[i * 3] : position[i * 3] - ofx;
          const z = apron ? position[i * 3 + 2] : position[i * 3 + 2] - ofz;
          const value = lamp(x, position[i * 3 + 1], z, ...normals[i]);
          values.fill(value, i * 3, i * 3 + 3);
        }
        truths.set(name, plan ? inheritComponents(values, 3, plan.inherited, plan.classifications, plan.freeEligible) : values);
      }
      const reviewRow = rowsByName.get(`cn8r82-wallface-${corner}-a`), at = reviewRow.attributes.position.array.slice(6, 9);
      // Restore the named vertex-593 production assertion. All 37 rays are
      // open (the archived masks are zero); equality alone is not this fixture.
      const tongue = rowsByName.get(`cn8r82-tongue-${corner}-a`);
      const tonguePoint = new THREE.Vector3().fromArray(tongue.attributes.position.array, 593 * 3)
        .applyMatrix4(new THREE.Matrix4().fromArray(tongue.matrix)).toArray();
      const reviewRays = sample(tonguePoint);
      // DERIVED retained b611fc6e review ray: the production 0.45-radian
      // hemisphere direction, with signs from the fixed corner identities.
      const direction = [sx * 0.8319046479727339, 0.43496553411123023, sz * 0.3445861877915217];
      const reviewRay = [...tonguePoint, ...direction];
      const vertex593 = { name: tongue.name, vertex: 593, point_m: tonguePoint, rays: reviewRays.length,
        before_open: reviewRays.filter(({ ray }) => beforeOcc.rayOpenM(toM, ...ray)).length,
        after_open: reviewRays.filter(({ ray }) => !actual.blocked(...ray)).length,
        mesh_open: reviewRays.filter(({ ray }) => !oracle.blocked(ray, minimum)).length,
        review: { direction, before_blocked: !beforeOcc.rayOpenM(toM, ...reviewRay),
          after_blocked: actual.blocked(...reviewRay), mesh_blocked: oracle.blocked(reviewRay, minimum) } };
      try { assertReviewVertex593(vertex593); }
      catch (error) { failures.push(`${table}/${corner}: ${error.message}`); }
      corners.push({ corner, signs: [sx, sz], rows: cornerRows, worst_five: worst,
        vertex593,
        review_vertex: { name: reviewRow.name, vertex: 2, before: before.rows[reviewRow.ordinal].attributes.color.array[6],
          after: reviewRow.attributes.color.array[6], mesh_truth: Math.fround(shade(...at)) } });
    }
    for (const [name, truth] of truths) {
      const row = rowsByName.get(name);
      lighting.push(colorsAndFaces(table, row, before.rows[row.ordinal], truth, options['--out'], failures));
    }
    if (newMismatch || !redMismatch || !beforeBuilder.solidRayTree && !oldMismatch) {
      failures.push(`${table}: full-solid ray mismatch or an unarmed cover-only plant`);
    }
    tables.push({ table, binding: after.binding, before_binding: before.binding, rays: raysTotal,
      contact_classification: active.contact,
      embedded_classification: { file: embeddedFile, sha256: digest(fs.readFileSync(embeddedFile)),
        inherited_receivers: embedded.rows.reduce((n, r) => n + r.inherited.length, 0),
        secondary_liner_free_field: { source_sha256: digest(retainedSecondaryLinerSource(renderer)),
          source_byte_identical_to_before: true, truth: 'BEFORE captured original color bytes; independent closed-solid donor assignment' },
        rule: 'FREE-only hemisphere comparison; inherited values must exactly equal their independently replayed FREE donor.' },
      production_sampling_guard_rays: samplingGuardRays,
      prior_occluder: beforeBuilder.solidRayTree ? 'complete solid set (a zero before mismatch is admissible)' : 'cover-only (before mismatch must be nonzero)',
      before_mismatches: oldMismatch, after_mismatches: newMismatch, cover_only_plant_mismatches: redMismatch,
      members: actual.members.map(member => ({ ...member,
        captured_geometry_source: { file: path.join(options['--capture'], table, 'census.json'), ordinal: member.ordinal,
          position_sha256: after.census.meshes[member.ordinal].attributes.position.sha256,
          index_sha256: after.census.meshes[member.ordinal].indexSha256,
          groups: after.census.meshes[member.ordinal].groups, matrix: after.census.meshes[member.ordinal].matrix } })),
      opaque_triangles: oracle.triangle_count, independent_mesh_chunks: oracle.batch_count,
      identity, corners, lighting, inputs: { ...before.inputs, ...after.inputs } });
    oracle.dispose(); actual.geometry.dispose(); red.geometry.dispose(); beforeOcc.geometry?.dispose();
  }
  const record = { schema: 'ob-cn8-fix5-full-solid-census/1', tag: 'DERIVED', status: failures.length ? 'FAIL' : 'PASS',
    selected_tables: selectedTables, full_alias_coverage: selectedTables.length === 2,
    renderer_sha256: digest(renderer), before_renderer_sha256: digest(beforeRenderer),
    verifier_sha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    checks_sha256: digest(fs.readFileSync(new URL('./cn8_solid_checks.mjs', import.meta.url))),
    semantics: 'Opaque visible table mesh carriers, both triangle sides, exact open endpoint/incident-vertex exclusion. When contact_classification is present, hits strictly inside its DERIVED Float32 storage quantum are seam contacts in BOTH queries; equality and farther hits remain opaque. Shader alpha holes are not resolved. Bounds only accelerate actual triangles.',
    scope: 'Every FREE mouth-wall, tongue, end-roll, rollface, upper/deep liner and apron receiver in selected_tables. Closed-solid interior and separately disclosed quantum-contact receivers inherit from an independently certified FREE column/one-ring donor; every resulting color word is checked. Unused zero-normal storage is disclosed, never a receiver or donor. Both aliases are required; a one-alias run is partial. Liner/profile normals drive 75+16 directions; other receivers use 16+21. Shared net/fallbag attributes are counted once as ray origins and both are verified as rendered color buffers.',
    independent_truth: 'THREE.Mesh.raycast on consecutive source-index chunks; complete lighting solver replay with this query substituted. Every actual color component and every triangle mean is compared exactly.',
    red_plant: 'Restore only the four actual cover meshes in the same full-solid constructor; all adjacent opaque solids disappear and the ray census must fail.',
    separate_acceptance: 'C6 actual frame attribution, C7 GPU-input identity, L1 material ownership, and B draw/pixel census remain separately required.',
    tables, failures };
  fs.writeFileSync(path.join(options['--out'], 'O2-VERIFICATION.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ status: record.status, tables: tables.map(({ table, rays, before_mismatches, after_mismatches, cover_only_plant_mismatches }) =>
    ({ table, rays, before_mismatches, after_mismatches, cover_only_plant_mismatches })), failures }));
  return failures.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
