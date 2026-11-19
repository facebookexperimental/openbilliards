// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTongueBuilder, measureMatingEdge } from './cn8_tongue_checks.mjs';
import { CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const input = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-source-inputs.json', import.meta.url)));
const dimensions = input.mfr_playing_dimensions_mm.value.map((v) => v / 1000);
const builder = loadTongueBuilder(source);
// Landing pass (class G): the shipped tongue now reads woodBack/woodEnd from
// cn8JoyWoodCorner, closes each jaw with cn8Furniture.closeClothJaw and takes
// the call site's TAN_A; cn8_tongue_checks.mjs carries all three from production
// text and reads the published cn8ClosedJaw layout (derive_plank_pins.mjs:
// 77 x 24 lattice, 462 appended closure vertices per jaw). Rows unchanged.
for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) {
  test(`corner ${id}: both tongues meet the actual lip with no proud step or plan point`, () => {
    const cover = builder.corner.build(builder.corner.K, ...dimensions, sx, sz);
    for (const mesh of builder.build(...dimensions, id, sx, sz)) {
      const g = mesh.geometry, p = g.attributes.position.array;
      const result = measureMatingEdge(p, g.userData, cover.attributes.position.array, cover.userData.cn8D3, [sx, sz]);
      assert.equal(result.status, 'PASS', JSON.stringify(result));
      assert.ok(result.contacts > 20, 'A single convenient contact cannot stand for the full join');
      assert.ok(Math.abs(result.cloth_recess_max_mm - builder.corner.S.clothRecess * 1000) <= 0.0002);
      // Every original nose sample is present at the protected height and
      // drawing position. Only the decorative skin behind it may change.
      for (let i = 0; i < builder.occ.chain.length; i++) {
        const row = g.userData.cn8D3Mating.rows.findIndex((r) => Math.abs(r.sourceRow - i) < 1e-10);
        assert.ok(row >= 0, `Missing held nose sample ${i}`);
        const at = row * g.userData.tongueCols.stride * 3;
        const q = mesh.name.endsWith('-b') ? [...builder.occ.chain[i]].reverse() : builder.occ.chain[i];
        assert.deepEqual(Array.from(p.slice(at, at + 3)), Array.from(new Float32Array([
          sx * (dimensions[0] / 2 + q[0]), builder.corner.K.H_NOSE, sz * (dimensions[1] / 2 + q[1])])));
      }
    }
  });
}

test('a raised or extended tongue edge fails the measured mating arm', () => {
  const cover = builder.corner.build(builder.corner.K, ...dimensions, 1, 1);
  const g = builder.build(...dimensions, 5, 1, 1)[0].geometry;
  const metadata = g.userData;
  const row = metadata.cn8D3Mating.rows.findIndex((r) => r.station !== null);
  const index = (row * metadata.tongueCols.stride + metadata.cn8D3Mating.matingColumn) * 3;
  for (const axis of [0, 1]) {
    const changed = new Float32Array(g.attributes.position.array);
    changed[index + axis] += 0.008; // Synthetic red control, not a product dimension.
    const result = measureMatingEdge(changed, metadata, cover.attributes.position.array, cover.userData.cn8D3, [1, 1]);
    assert.equal(result.status, 'FAIL');
    assert.ok(axis === 1 ? result.proud_step_mm > 7 : result.unmatched_plan_length_mm > 1);
  }
});
