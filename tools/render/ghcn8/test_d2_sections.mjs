// Copyright (c) Meta Platforms, Inc. and affiliates.

// D2 expectation and rejection tests. No browser, private seal write or fixture re-pin.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkCensus, checkContract, censusFor } from './d2_contract_checks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'docs/geometry', name), 'utf8'));
const definition = read('cn8-pocket-d2-section.json');
const ledger = read('cn8-pocket-d2-ledger.json');
const contract = read('cn8-corner-furniture-definition-contract.json');
const metadata = { schema: contract.active_layout.cover.metadata_schema, definition: contract.active_layout.definition };

test('active renderer closes every measured section and agrees with its sealed buffers', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-d2-expectation-'));
  try {
    execFileSync(process.execPath, [path.join(here, 'verify_d2_sections.mjs'), '--out', out], { cwd: root });
    const actual = JSON.parse(fs.readFileSync(path.join(out, 'section-verification.json'), 'utf8'));
    assert.equal(actual.status, 'PASS');
    const sealPath = path.join(root, contract.active_layout.seal);
    assert.ok(fs.existsSync(sealPath), 'Active layout must name a delivered seal');
    const seal = JSON.parse(fs.readFileSync(sealPath, 'utf8'));
    if (contract.active_layout.cover.metadata_key === 'cn8D3') {
      assert.equal(actual.definition_sha256, seal.definition_sha256);
      assert.equal(actual.cpu_corners.length, 8);
      for (const row of actual.cpu_corners) {
        const sealed = seal.geometry.find((item) => item.table === row.table && item.name === row.name);
        assert.ok(sealed, `${row.table}/${row.name} is in the seal`);
        for (const key of ['position_sha256', 'index_sha256', 'vertices', 'triangles']) assert.equal(row[key], sealed[key], key);
        assert.equal(row.section_crossings, 0); assert.equal(row.boundary_edges, 0);
      }
    } else {
      for (const key of ['vertices', 'triangles', 'position_sha256', 'index_sha256', 'boundary_edges',
        'non_manifold_edges', 'inconsistent_winding_edges', 'zero_area_triangles']) assert.equal(actual[key], seal.topology_and_sections[key], key);
      assert.ok(actual.sections.length > 0);
      assert.ok(actual.sections.every((row) => row.crossings === 0));
    }
    assert.deepEqual(actual.violations, []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('every retired construction row fails by name if its erratum is removed', () => {
  assert.deepEqual(checkContract(contract, metadata), []);
  for (const retired of contract.active_layout.retired) {
    const changed = structuredClone(contract);
    changed.errata = changed.errata.filter((row) => row.id !== retired.erratum);
    const failures = checkContract(changed, metadata);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /lacks valid erratum/);
    assert.ok(failures[0].includes(retired.id), failures[0]);
  }
});

test('PHOTO quantities cannot outvote an EST camera (camera-retag red arm)', () => {
  assert.deepEqual(checkCensus(definition, ledger), []);
  // Synthetic tag-only control: this is an adversarial test state, not measured evidence.
  const def = structuredClone(definition), rows = structuredClone(ledger);
  def.photo_camera.tag = 'MODEL(Star)';
  rows.rows.find((row) => row.id === 'PHOTO-camera').tag = 'MODEL(Star)';
  for (const key of ['photo_drop_mm', 'photo_stitch_drop_mm', 'height_scale']) {
    def.parameters[key].tag = 'PHOTO';
    rows.rows.find((row) => row.id === `PARAM-${key}`).tag = 'PHOTO';
  }
  rows.census = censusFor(rows.rows);
  assert.deepEqual(checkCensus(def, rows), []);
  def.photo_camera.tag = 'EST';
  rows.rows.find((row) => row.id === 'PHOTO-camera').tag = 'EST';
  rows.census = censusFor(rows.rows);
  const failures = checkCensus(def, rows);
  for (const key of ['photo_drop_mm', 'photo_stitch_drop_mm', 'height_scale']) {
    assert.ok(failures.some((failure) => failure.includes(`REFUSE PARAM-${key}`)), failures.join('\n'));
  }
});

test('a removed or duplicated emitted cover is a named contract failure', () => {
  const layout = contract.active_layout;
  const emitted = { tables: layout.tables.map((table) => ({ table, built_table: table,
    meshes: [...layout.cover.ids.map((name) => ({ name, userData: { [layout.cover.metadata_key]: metadata } })),
      ...[...layout.bed.ids, ...layout.stitches.ids].map((name) => ({ name, userData: {} }))] })) };
  assert.deepEqual(checkContract(contract, metadata, emitted), []);
  emitted.tables[0].meshes.shift();
  assert.ok(checkContract(contract, metadata, emitted).some((row) => row.includes(`${layout.cover.ids[0]} count 0`)));
  emitted.tables[1].meshes.push(emitted.tables[1].meshes[0]);
  assert.ok(checkContract(contract, metadata, emitted).some((row) => row.includes(`${layout.cover.ids[0]} count 2`)));
});
