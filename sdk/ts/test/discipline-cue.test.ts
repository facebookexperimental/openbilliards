// Copyright (c) Meta Platforms, Inc. and affiliates.

// discipline-cue.test.ts — GH-1042: the snooker and carom racks strike with
// the cue their equipment spec names, and pre-fix share links keep the
// kernel's default pairing.
//
// The app (web/app/game.js composeKindScenario) racks a discipline on one of
// three specs: the player's spec, the kernel's default pairing with the
// selected cue (read from the no-spec rack's own equipment tag), or that
// pairing as is. These arms pin the kernel/SDK facts that composition
// relies on, over the COMMITTED canonical wasm:
//   - a spec equal to the no-spec rack's tag composes the no-spec rack byte
//     for byte (so the 'cue' path with the default cue moves no byte);
//   - swapping only the cue moves exactly `options.cue` and the tag's
//     `cue_id`, and `options.cue` is the catalog entry's params;
//   - the frozen pre-fix stamp set is exactly the lineage stamps up to
//     0.1.0+206ceb55 and never holds the live kernel.

import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogEntry } from '../src/catalog.js';
import { scenarioToJson } from '../src/index.js';
import type { Scenario } from '../src/index.js';
import {
  KERNEL_COMPAT_LINEAGE, KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS,
  kernelDefaultDisciplinePairing,
} from '../src/share.js';
import { engine } from './helpers.js';

type Build = (spec?: Record<string, string>) => Scenario;

async function kinds(): Promise<Array<[string, string, Build]>> {
  const eng = await engine();
  return [
    ['snooker', 'snooker_ash', (spec) => eng.snookerRack(7, spec)],
    ['carom', 'carom_conical', (spec) => eng.caromStart(true, 3, spec)],
  ];
}

const tagOf = (s: Scenario): Record<string, string> =>
  (s.system as unknown as { equipment: Record<string, string> }).equipment;

test('GH-1042: the no-spec discipline rack equals the rack on its own tag, byte for byte',
  async () => {
    for (const [kind, , build] of await kinds()) {
      const base = build();
      const tag = tagOf(base);
      assert.equal(tag.cue_id, 'standard', `${kind}: the kernel pairing keeps cue standard`);
      assert.equal(scenarioToJson(build({ ...tag })), scenarioToJson(base),
        `${kind}: spec(tag) composes the no-spec rack`);
    }
  });

test('GH-1042: a discipline cue moves only options.cue and the tag cue_id, '
  + 'and options.cue is the catalog entry', async () => {
  for (const [kind, cueId, build] of await kinds()) {
    const base = build();
    const withCue = build({ ...tagOf(base), cue_id: cueId });
    assert.equal(tagOf(withCue).cue_id, cueId, `${kind}: the tag names the cue`);
    const entry = catalogEntry('cue_id', cueId) as unknown as { params: unknown };
    assert.deepEqual(withCue.options?.cue, entry.params,
      `${kind}: options.cue is the catalog params of ${cueId}`);
    assert.equal((base.options as { cue?: unknown } | undefined)?.cue, undefined,
      `${kind}: the standard cue serde-skips options.cue`);
    const strip = (s: Scenario): string => {
      const o = JSON.parse(scenarioToJson(s)) as {
        options: { cue?: unknown }; system: { equipment: { cue_id?: string } } };
      delete o.options.cue;
      delete o.system.equipment.cue_id;
      return JSON.stringify(o);
    };
    assert.equal(strip(withCue), strip(base), `${kind}: nothing else moves`);
  }
});

test('GH-1042: the frozen pre-fix stamp set is the lineage up to 206ceb55, '
  + 'never the live kernel', async () => {
  const eng = await engine();
  assert.deepEqual([...KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS], [
    '0.1.0+5bd2803', '0.1.0+ee629a3', '0.1.0+4c2d25e', '0.1.0+6cde449',
    '0.1.0+6f8fd12', '0.1.0+99bca8b6', '0.1.0+52c22c0d', '0.1.0+c7816023',
    '0.1.0+208e1dc4', '0.1.0+dedc61cd', '0.1.0+91ad8597', '0.1.0+b6b5dc3f',
    '0.1.0+a2b08c21', '0.1.0+206ceb55',
  ]);
  assert.ok(Object.isFrozen(KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS));
  for (const s of KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS) {
    assert.ok(KERNEL_COMPAT_LINEAGE.some(([a, b]) => a === s || b === s),
      `${s} is a lineage stamp`);
    assert.equal(kernelDefaultDisciplinePairing({ kernelVersion: s }), true, s);
  }
  assert.equal(kernelDefaultDisciplinePairing({ kernelVersion: eng.version() }), false,
    'the live kernel racks disciplines on the selected spec');
  assert.equal(kernelDefaultDisciplinePairing({ kernelVersion: '0.1.0+deadbeef' }), false);
});
