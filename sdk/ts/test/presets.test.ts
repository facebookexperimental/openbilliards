// Copyright (c) Meta Platforms, Inc. and affiliates.

// presets.test.ts — drift gate for the SDK's hand-mirrored numeric kernel
// defaults/presets (shot.ts, types.ts): deep-compare every mirrored object
// against tools/fixtures/kernel-presets.json, the fixture pinned to the
// kernel by crates/pool-core/tests/presets_golden.rs. A kernel re-fit that
// forgets either side now fails a gate instead of silently pinning old
// physics. Regenerate the fixture with
// `cargo run -p pool-core --example gen_presets_fixture`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clothPreset, defaultBallParams, defaultOptions, gripFittedCushionResponse,
  gripFittedOptions, mathavanFittedOptions, realisticOptions,
} from '../src/index.js';
import type { ClothPresetId } from '../src/index.js';

// Compiled to dist/test/, so hop back to the repo root (cf. helpers.ts).
const FIXTURE = JSON.parse(readFileSync(
  new URL('../../../../tools/fixtures/kernel-presets.json', import.meta.url),
  'utf8')) as Record<string, unknown>;

test('defaultBallParams mirrors BallParams::default', () => {
  assert.deepStrictEqual(defaultBallParams(), FIXTURE.ball_params_default);
});

test('defaultOptions mirrors SimOptions::default', () => {
  assert.deepStrictEqual(defaultOptions(), FIXTURE.sim_options_default);
});

test('realisticOptions mirrors SimOptions::realistic', () => {
  assert.deepStrictEqual(realisticOptions(), FIXTURE.sim_options_realistic);
});

test('mathavanFittedOptions mirrors the mathavan-fitted preset', () => {
  assert.deepStrictEqual(
    mathavanFittedOptions(), FIXTURE.sim_options_mathavan_fitted);
});

test('gripFittedOptions mirrors the grip-fitted preset', () => {
  assert.deepStrictEqual(gripFittedOptions(), FIXTURE.sim_options_grip_fitted);
});

test('gripFittedCushionResponse mirrors CushionResponse::grip_fitted', () => {
  assert.deepStrictEqual(
    gripFittedCushionResponse(), FIXTURE.cushion_response_grip_fitted);
});

test('clothPreset mirrors every kernel ClothPreset constructor', () => {
  const cloths = FIXTURE.cloth_presets as Record<string, unknown>;
  const ids: ClothPresetId[] = [
    'simonis_860_tournament', 'simonis_760_fast', 'worn_slow',
    'snooker_napped',
  ];
  assert.deepStrictEqual(Object.keys(cloths).sort(), [...ids].sort());
  for (const id of ids) {
    assert.deepStrictEqual(clothPreset(id), cloths[id], id);
  }
  // 'default' is the tournament cloth by construction.
  assert.deepStrictEqual(clothPreset('default'),
    clothPreset('simonis_860_tournament'));
});
