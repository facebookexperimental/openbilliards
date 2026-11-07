// Copyright (c) Meta Platforms, Inc. and affiliates.

// Read-only D2 contract and provenance checks shared by the verifier and red arms.
// Measured geometry lives in the renderer/definition, never in this checker.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const numericCount = (value) => {
  if (typeof value === 'number') return 1;
  if (Array.isArray(value)) return value.reduce((n, v) => n + numericCount(v), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((n, v) => n + numericCount(v), 0);
  return 0;
};

export function censusFor(rows) {
  const result = {};
  for (const row of rows) {
    const tag = row.tag.startsWith('MODEL(Star)') ? 'MODEL(Star)' : row.tag;
    const item = result[tag] ??= { rows: 0, numeric_scalars: 0 };
    item.rows++;
    item.numeric_scalars += numericCount(row.value);
  }
  return result;
}

export function coordinateCensus(rows) {
  const count = (id) => numericCount(rows.find((row) => row.id === id)?.value);
  const source = count('STAR-central') + count('STAR-terminal') + count('EST-terminal-return-point');
  const loft = count('LOFT-central') + count('LOFT-terminal');
  const knots = count('SOURCE-parameterization');
  const camera = count('PHOTO-camera');
  const all = rows.reduce((n, row) => n + numericCount(row.value), 0);
  return {
    total_recorded_numeric_values: all,
    source_polyline_coordinates: source,
    loft_polyline_coordinates: loft,
    total_polyline_coordinates: source + loft,
    feature_arclength_parameters: knots,
    camera_matrix_entries: camera,
    other_numeric_values: all - source - loft - knots - camera,
    independent_measurements: false,
  };
}

export function checkCensus(definition, ledger) {
  const failures = [];
  const rows = new Map(ledger.rows.map((row) => [row.id, row]));
  if (rows.size !== ledger.rows.length) failures.push('census: duplicate ledger row id');
  for (const [key, field] of Object.entries(definition.parameters)) {
    const id = `PARAM-${key}`;
    const row = rows.get(id);
    if (!row || !same(row.value, field.value) || row.tag !== field.tag) failures.push(`census: ${id} differs from section definition`);
  }
  // These quantities always depend on the camera, even if a malformed row drops depends_on.
  const cameraFields = ['photo_drop_mm', 'photo_stitch_drop_mm', 'height_scale'];
  for (const key of cameraFields) {
    const field = definition.parameters[key];
    const row = rows.get(`PARAM-${key}`);
    if (definition.photo_camera.tag === 'EST' && (field.tag !== 'EST' || row?.tag !== 'EST')) {
      failures.push(`census: REFUSE PARAM-${key}: ${field.tag}/${row?.tag} over EST camera photo_camera`);
    }
    if (field.tag === 'EST' && (!field.uncertainty || !Number.isFinite(field.read_only_uncertainty_mm ?? field.read_only_uncertainty))) {
      failures.push(`census: PARAM-${key} lacks the separate read bound and camera uncertainty`);
    }
  }
  if (rows.get('PHOTO-camera')?.tag !== definition.photo_camera.tag) failures.push('census: PHOTO-camera tag differs from camera definition');
  for (const key of ['central', 'terminal']) {
    const section = definition.sections[key];
    const source = key === 'terminal' ? section.source_profile_mm.slice(1) : section.source_profile_mm;
    if (!same(rows.get(`STAR-${key}`)?.value, source)) failures.push(`census: STAR-${key} source coordinates differ`);
    if (!same(rows.get(`LOFT-${key}`)?.value, section.loft_profile)) failures.push(`census: LOFT-${key} coordinates differ`);
    if (definition.photo_camera.tag === 'EST' && rows.get(`LOFT-${key}`)?.tag !== 'EST') {
      failures.push(`census: REFUSE LOFT-${key}: height coordinates inherit EST camera photo_camera`);
    }
  }
  if (!same(rows.get('EST-terminal-return-point')?.value, definition.sections.terminal.source_profile_mm[0])) {
    failures.push('census: estimated terminal return point differs');
  }
  if (!same(rows.get('SOURCE-parameterization')?.value, definition.profile_parameters)) failures.push('census: feature-arclength parameters differ');
  const actual = censusFor(ledger.rows);
  for (const tag of new Set([...Object.keys(actual), ...Object.keys(ledger.census)])) {
    if (!same(actual[tag], ledger.census[tag])) failures.push(`census: ${tag} count differs`);
  }
  if (!same(coordinateCensus(ledger.rows), ledger.coordinate_census)) failures.push('census: coordinate/count breakdown differs');
  return failures;
}

export function checkContract(contract, metadata, emitted = null) {
  const failures = [];
  const layout = contract.active_layout;
  if (!layout) return ['contract: active_layout is missing'];
  const required = ['PROF_FULL', 'PROF_FLAT', 'cn8r82-block', 'cn8r82-endclose', 'cn8r82-fallface', 'cn8Fillet', 'legacy-cover-height-ladder'];
  for (const id of new Set([...required, ...layout.retired.map((row) => row.id)])) {
    const retired = layout.retired.find((row) => row.id === id);
    if (!retired) { failures.push(`contract: retired ${id} lacks an active-layout disposition`); continue; }
    const matches = contract.errata.filter((row) => row.id === retired.erratum);
    const erratum = matches[0];
    if (matches.length !== 1 || erratum.retired_element !== id
      || (erratum.seal_id ?? erratum.d2_seal_id) !== (retired.source_seal_id ?? layout.seal_id)
      || !/^\d{4}-\d{2}-\d{2}$/.test(erratum.date) || !erratum.fact) {
      failures.push(`contract: retired ${id} lacks valid erratum ${retired.erratum}`);
    }
  }
  if (metadata.schema !== layout.cover.metadata_schema || metadata.definition !== layout.definition) {
    failures.push('contract: emitted measured geometry metadata differs from active_layout');
  }
  if (!emitted) return failures;
  for (const table of layout.tables) {
    const capture = emitted.tables.find((row) => row.table === table);
    if (!capture || capture.built_table !== table) { failures.push(`contract: missing/incorrect emitted table ${table}`); continue; }
    const byName = new Map();
    for (const mesh of capture.meshes) {
      const list = byName.get(mesh.name) ?? []; list.push(mesh); byName.set(mesh.name, list);
    }
    for (const family of ['cover', 'bed', 'stitches']) {
      for (const id of layout[family].ids) {
        const found = byName.get(id) ?? [];
        if (found.length !== 1) failures.push(`contract: ${table} emitted ${id} count ${found.length}, expected one`);
        if (family === 'cover' && found.length === 1) {
          const info = found[0].userData[layout.cover.metadata_key];
          if (!info || info.schema !== metadata.schema || info.definition !== metadata.definition
            || info.profileCount !== metadata.profileCount || info.stationCount !== metadata.stationCount) {
            failures.push(`contract: ${table}/${id} has an incompatible emitted layout`);
          }
        }
      }
    }
    for (const retired of layout.retired) {
      for (const id of retired.absent_mesh_ids) if (byName.has(id)) failures.push(`contract: ${table} still emits retired ${id}`);
      for (const key of retired.absent_metadata_keys) {
        for (const mesh of capture.meshes) if (Object.hasOwn(mesh.userData, key)) failures.push(`contract: ${table}/${mesh.name} still emits retired ${key}`);
      }
    }
  }
  return failures;
}
