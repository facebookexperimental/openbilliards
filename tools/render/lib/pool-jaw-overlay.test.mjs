// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ensureRealThree, repoUrl } from './ensure-three.mjs';
import { MM } from './cushion-ring.mjs';
import { erosionVertex, sampledJawRuns } from './jaw-erosion.mjs';

ensureRealThree();
const { makeGeom, railPolysFor, cushionProfile, cushionPlanCtx, cushionRingCtx } =
  await import(repoUrl('web/scene/table.js'));
const overlay = fileURLToPath(new URL('../ring-plan-overlay.mjs', import.meta.url));
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const unescapeXml = (text) => text.replaceAll('&quot;', '"').replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&amp;', '&');

function withOverlay(tableId, rail, jaw, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-jaw-overlay-'));
  try {
    const out = path.join(dir, 'jaw.svg');
    const run = spawnSync(process.execPath, [overlay, tableId, String(rail), out, `--jaw=${jaw}`],
      { encoding: 'utf8' });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr);
    const svg = fs.readFileSync(out, 'utf8');
    const metadata = svg.match(/<metadata>(.*?)<\/metadata>/s);
    assert.ok(metadata, 'the SVG must carry its measured geometry');
    check(JSON.parse(unescapeXml(metadata[1])), svg);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

function renderedContext(tableId, rail, jaw) {
  const G = makeGeom(tableId), poly = railPolysFor(G)[rail];
  const prof = cushionProfile(G.render.cushionFamily, G.kernel.noseHeightFrac * G.render.profileBallD, G.CW);
  const ctx = cushionPlanCtx(G, poly), { backAt, oFAt } = cushionRingCtx(G, prof);
  const arc = sampledJawRuns(poly, ctx).find((candidate) => candidate.jaw === jaw);
  assert.ok(arc, `${tableId} rail${rail} ${jaw}: a sampled jaw is required`);
  return { G, poly, prof, ctx, arc, backAt, oFAt };
}

function assertRenderedMarkers(tableId, rail, jaw, equalInset) {
  const { G, poly, prof, ctx, arc, backAt, oFAt } = renderedContext(tableId, rail, jaw);
  assert.ok(G.render.jawArcSampled === true || (G.render.jawArcSegments ?? 0) >= 2);
  if (equalInset) {
    for (const row of prof.rows) assert.equal(oFAt(row.o, row.z), row.o);
  }
  withOverlay(tableId, rail, jaw, (metadata, svg) => {
    assert.equal(metadata.tableId, tableId);
    assert.equal(metadata.railIndex, rail);
    assert.equal(metadata.jaw, jaw);
    assert.deepEqual(metadata.arc, arc);
    const attributes = [...svg.matchAll(/<g class="erosion" data-row="(\d+)"[^>]*data-max-distance="([^"]+)"/g)]
      .map((match) => ({ index: Number(match[1]), maxDistance: Number(match[2]) }));
    let unequalRows = 0;
    assert.ok(metadata.erosions.length > 0, 'at least one eaten row must be checked');
    for (const record of metadata.erosions) {
      const row = prof.rows[record.index], oF = oFAt(row.o, row.z);
      const rendered = ctx.ringAt(row.o, oF, backAt(row.z));
      assert.deepEqual(record.row, row);
      const context = `${tableId} rail${rail} ${jaw} row ${record.index}`;
      for (let vertex = arc.i; vertex <= arc.k + 1; vertex++) {
        const gap = distance(rendered[vertex], record.point);
        assert.ok(gap <= 1e-9,
          `${context}: marker-to-rendered-vertex ${(gap * MM).toFixed(Math.log10(MM))} mm at vertex ${vertex}`);
      }
      const jawGap = distance(record.jawVertex, rendered[arc.i]);
      assert.ok(jawGap <= 1e-9,
        `${context}: recorded-jaw-to-rendered-vertex ${(jawGap * MM).toFixed(Math.log10(MM))} mm`);
      assert.deepEqual(record.vertices, rendered.slice(arc.i, arc.k + 2), context);
      assert.ok(record.maxDistance <= 1e-9, context);
      const attribute = attributes.find((value) => value.index === record.index);
      assert.ok(attribute, `${context}: a displayed marker is required`);
      assert.ok(attribute.maxDistance <= 1e-9, context);
      assert.equal(attribute.maxDistance, record.maxDistance);
      if (oF !== row.o) unequalRows++;
      if (equalInset) {
        assert.ok(distance(record.point, erosionVertex(poly, ctx, arc, row.o)) <= 1e-12, context);
        assert.equal(Object.hasOwn(record, 'oF'), false, 'equal-inset metadata must retain its recorded shape');
      }
    }
    // Mirror the renderer's own-chord collapse threshold, including its tolerance.
    // The overlay's strict comparison must select the same exported profile rows.
    const collapsedRows = prof.rows.flatMap((row, index) =>
      (ctx.noseEdge[arc.i] ? row.o : oFAt(row.o, row.z)) >= arc.rIn - 1e-12 ? [index] : []);
    assert.deepEqual(metadata.erosions.map((record) => record.index), collapsedRows);
    assert.deepEqual(attributes.map((record) => record.index), collapsedRows);
    if (!equalInset) assert.ok(unequalRows > 0, 'an unequal-inset row must reach the rendered-vertex assertions');
  });
}

test('Diamond rail zero markers coincide with the rendered vertices at both jaws', async (t) => {
  for (const jaw of ['start', 'end']) {
    await t.test(jaw, () => assertRenderedMarkers('diamond_proam_9ft', 0, jaw, false));
  }
});

test('Predator markers preserve equal-inset erosion on every rail and both jaws', () => {
  const tableId = 'predator_apex_9ft';
  for (const rail of railPolysFor(makeGeom(tableId)).keys()) {
    for (const jaw of ['start', 'end']) assertRenderedMarkers(tableId, rail, jaw, true);
  }
});

test('Diamond metadata records the rendered facing offset at the bed row', () => {
  const tableId = 'diamond_proam_9ft', rail = 0;
  for (const jaw of ['start', 'end']) {
    const { prof, oFAt } = renderedContext(tableId, rail, jaw);
    const index = prof.rows.findIndex((row) => row.z === 0), row = prof.rows[index];
    assert.ok(index >= 0);
    withOverlay(tableId, rail, jaw, (metadata, svg) => {
      const record = metadata.erosions.find((entry) => entry.index === index);
      assert.ok(record, 'the bed row must carry an erosion marker');
      assert.equal(record.oF, oFAt(row.o, row.z));
      assert.notEqual(record.oF, row.o);
      assert.match(svg, /Jaw vertices on w/);
    });
  }
});
