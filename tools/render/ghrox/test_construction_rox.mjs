// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildCupContract, sinkConsumer, sinkSamples, slabOutline } from './lib/construction_contract_rox.mjs';
import { sightDifferences } from './lib/material_identity_rox.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const game = fs.readFileSync(new URL('../../../web/app/game.js', import.meta.url), 'utf8');
const built = buildCupContract(source), consumer = sinkConsumer(game);

test('all six actual OX cups publish support and stop visible pots above their rendered floors', () => {
  assert.equal(built.supports.length, 6, 'OX_SINK_SUPPORT_COUNT');
  for (const pocket of built.G.pockets) {
    const row = sinkSamples(built, consumer, pocket);
    assert(row.rest, `OX_SINK_REST_MISSING: ${row.tag}`);
    assert(row.spec.rSupport > row.radius && row.spec.rVent < row.radius);
    assert(row.deepest.clearance_mm >= 0, `OX_SINK_FLOOR: ${row.tag} ${row.deepest.clearance_mm} mm`);
    assert(row.closestSurface.surface_clearance_mm >= 0, `OX_SINK_FLOOR_SURFACE: ${row.tag} ${row.closestSurface.surface_clearance_mm} mm`);
    assert.equal(row.visible_samples, 751, `OX_SINK_CULLED: ${row.tag}`);
    assert.deepEqual(row.samples.at(-1).position, row.samples.at(-2).position);
    assert.deepEqual(row.samples.at(-1).quaternion, row.samples.at(-2).quaternion);
  }
});

test('slab notch exits and the complete boundary are symmetric across both axes', () => {
  const { pts, hx, hz } = slabOutline(source, built.G);
  for (const [axis, extent] of [[0, hx], [1, hz]]) {
    const exits = pts.filter(q => Math.abs(Math.abs(q[axis]) - extent) < 1e-12
      && (axis === 0 || Math.abs(q[0]) > built.G.L / 4));
    assert.equal(exits.length, 4, 'OX_SLAB_NOTCH_EXIT_COUNT');
    assert(Math.max(...exits.map(q => Math.abs(q[1 - axis]))) - Math.min(...exits.map(q => Math.abs(q[1 - axis]))) <= 1e-6, 'OX_SLAB_ASYMMETRIC_EXITS');
  }
  for (const [x, z] of pts) for (const [mx, mz] of [[-x, z], [x, -z]]) {
    assert(Math.min(...pts.map(([px, pz]) => Math.hypot(px - mx, pz - mz))) <= 1e-6, 'OX_SLAB_ASYMMETRIC_BOUNDARY');
  }
});

test('ordered sight identity refuses absent coverage and names every inherited material field', () => {
  const fresh = [{ name: 'dm-sight-long-0', color: '8a8274', metalness: 0, roughness: 0.85, envMapIntensity: 0.05 }];
  assert.deepEqual(sightDifferences(fresh, structuredClone(fresh), { requireSights: true }), []);
  assert(sightDifferences([], [], { requireSights: true }).length);
  assert(sightDifferences(fresh, []).length);
  const gold = [{ ...fresh[0], color: 'c9a227', metalness: 0.7, roughness: 0.35 }];
  assert.deepEqual(sightDifferences(fresh, gold).map(row => row.field), ['color', 'metalness', 'roughness']);
  assert(sightDifferences(fresh, [{ ...fresh[0], envMapIntensity: undefined }]).some(row => row.field === 'envMapIntensity'));
});
