// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ensureRealThree, repoUrl } from './ensure-three.mjs';
import { readMidjawInputs } from './midjaw-overrun.mjs';

ensureRealThree();
const { makeGeom, railPolysFor, CN8_MID } = await import(repoUrl('web/scene/table.js'));
const law = { ...await import(repoUrl('web/scene/cn8midlaw.js')), CN8_MID };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-midjaw-arm-666.json', import.meta.url)));
const ids = [...new Set(fixture.crossings.map(({ id }) => id))];

for (const id of ids) {
  test(`${id}: exported samples recover the recorded inputs and every long rail exactly`, () => {
    const G = makeGeom(id);
    const inputs = readMidjawInputs(G, railPolysFor(G), law);
    assert.equal(inputs.allowance, fixture.inputs.allowance);
    assert.equal(inputs.segments, fixture.inputs.segments);
    assert.deepEqual(inputs.fidelity.map(({ rail }) => rail),
      fixture.crossings.filter((crossing) => crossing.id === id).map(({ rail }) => rail));
    assert.ok(inputs.fidelity.every(({ delta }) => !delta), 'all rebuilt vertices must be bit-identical');
  });
}

test('a changed exported default sample count cannot silently reconstruct a different jaw', () => {
  const [id] = ids, G = makeGeom(id);
  const changedLaw = { ...law, cn8ArcPts: (...args) =>
    law.cn8ArcPts(...args, fixture.inputs.segments + fixture.crossings.length) };
  assert.throws(() => readMidjawInputs(G, railPolysFor(G), changedLaw), /middle-jaw.*(?:fidelity|allowance)/);
});

test('fidelity checks include the reflected bodies, beyond the sampled first body', () => {
  const [, reflected] = fixture.crossings, G = makeGeom(reflected.id);
  const polys = railPolysFor(G), [point] = polys[reflected.rail];
  const [x, y] = point;
  polys[reflected.rail] = polys[reflected.rail].map((p) =>
    p === point ? [x + fixture.inputs.allowance, y] : p);
  assert.throws(() => readMidjawInputs(G, polys, law), /exported middle-jaw fidelity failed/);
});
