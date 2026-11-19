#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Render-constraint point law and mixed-capability controls; no browser.
// Gameplay inputs are independently pinned to main by check-cue-aim-floor.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';

const cueUrl = new URL('../../web/scene/cuestick.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'three'
      ? {url: new URL('../../web/vendor/three.module.min.js', import.meta.url).href, shortCircuit: true}
      : next(specifier, context);
  },
  load(url, context, next) {
    if (url === cueUrl || url === cueUrl + '?uncompiled') {
      let source = fs.readFileSync(new URL(cueUrl), 'utf8');
      if (url.endsWith('?uncompiled')) {
        const anchor = 'function mouthTrackStations(g, px, pz, ux, uz, context = null) {';
        assert.equal(source.split(anchor).length - 1, 1, 'The uncompiled control must replace exactly one anchor');
        source = source.replace(anchor, anchor + '\n  return uncompiledMouthTrackStations(g, px, pz, ux, uz);');
      }
      return {format: 'module', shortCircuit: true,
        source: source + '\nexport {mouthCarveAt, mouthTrackStations, uncompiledMouthTrackStations, mouthTrackPlan};\n'};
    }
    return next(url, context);
  },
});
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = {search: ''};
globalThis.localStorage = {getItem: () => null};
const api = await import(cueUrl);
const slow = await import(cueUrl + '?uncompiled');
const ids = ['diamond_proam_9ft', 'diamond_proam_8ft', 'diamond_proam_7ft'];

for (const id of ids) {
  const g = api.renderRailGeomFor(id), m = g.mouths;
  test(`${id}: a closed join can only raise the render constraint`, () => {
    for (const [u, aw] of [[0.045, 0.070], [0.0486, 0.054], [0.0489, 0.054]]) {
      const query = base => api.mouthCarveAt(m, aw, aw - g.L / 2, u, u, g.cushionWidth, base);
      const original = query(-Infinity), fixed = query(g.railTop);
      assert.equal(fixed.open, undefined);
      assert.equal(fixed.collar, false, 'the case must reach the added join, not the existing collar');
      assert(original.top < g.railTop, `the negative control must expose the former lower floor at ${u}, ${aw}`);
      assert.equal(fixed.top, g.railTop);
    }
  });
  test(`${id}: missing or empty bands retain the uncompiled path`, () => {
    for (const kind of ['corner', 'side']) for (const joinBands of [undefined, []]) {
      const geom = {...g, mouths: {...m, ring: {...m.ring, [kind]: {...m.ring[kind], joinBands}}}};
      assert.equal(api.mouthTrackPlan(geom.mouths).fallback, true);
      for (const ux of [-0.3, 0, 0.3]) {
        const uz = Math.sqrt(1 - ux * ux), px = 0.034, pz = g.W / 2 - 0.015;
        assert.deepEqual(api.mouthTrackStations(geom, px, pz, ux, uz),
          api.uncompiledMouthTrackStations(geom, px, pz, ux, uz));
      }
    }
  });
  test(`${id}: collar identity is independent of its numeric height`, () => {
    const mouths = {...m, collarTop: g.railTop};
    const x = 0.070, u = 0.060;
    const collar = api.mouthCarveAt(mouths, x, x - g.L / 2, u, u, g.cushionWidth, g.frameTop);
    assert.equal(collar.collar, true);
    assert.equal(collar.top, g.railTop);
    const join = api.mouthCarveAt(mouths, x, x - g.L / 2, 0.045, 0.045, g.cushionWidth, g.railTop);
    assert.equal(join.collar, false);
    assert.equal(join.top, collar.top);
    const geom = {...g, mouths};
    const pos = {x: 0.0345, y: 0.028575, z: g.W / 2 - 0.005};
    for (const phi of [Math.PI - 0.1, Math.PI, Math.PI + 0.1]) {
      const actual = api.cueReachability(pos, phi, 80, geom, 0.028575, [], 0.69);
      const expected = slow.cueReachability(pos, phi, 80, geom, 0.028575, [], 0.69);
      assert.deepEqual(actual.floors, expected.floors);
      assert.equal(actual.deadCount, expected.deadCount);
    }
  });
  test(`${id}: uncharacterized band order uses reference enumeration`, () => {
    for (const key of ['top', 'glue', 'rIn', 'joinEnd']) {
      const joinBands = m.ring.side.joinBands.map(b => ({...b}));
      joinBands[1][key] = joinBands[0][key] - 0.0001;
      // joinEnd is a boundary only for the legacy local-return capability.
      // Exercise that pairing even when the current table fits the whole U.
      const side = {...m.ring.side, joinBands,
        ...(key === 'joinEnd' ? {joinDepth: 0.00118} : {})};
      const mouths = {...m, ring: {...m.ring, side}};
      assert.equal(api.mouthTrackPlan(mouths).fallback, true);
    }
  });
}
