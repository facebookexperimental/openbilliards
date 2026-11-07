// Copyright (c) Meta Platforms, Inc. and affiliates.

// helpers.ts — shared node --test plumbing: engine bootstrap over the
// COMMITTED canonical wasm (web/dist/pool-wasm, constitution P-III) and
// fixture loading. Compiled to dist/test/, so fixture/glue paths hop back
// into the source tree.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Ball, Scenario, ShotParams, Table } from '../src/index.js';
import { Engine, init } from '../src/index.js';

/** Committed canonical wasm glue (repo: web/dist/pool-wasm/pool_wasm.js). */
export const GLUE_PATH = fileURLToPath(
  new URL('../../../../web/dist/pool-wasm/pool_wasm.js', import.meta.url));

const FIXTURES = new URL('../../test/fixtures/', import.meta.url);

let cached: Promise<Engine> | undefined;

/** One engine per test process (wasm instantiation is idempotent anyway). */
export function engine(): Promise<Engine> {
  cached ??= init(GLUE_PATH);
  return cached;
}

/** Read a fixture file from test/fixtures/. */
export function fixtureText(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

/** Committed scenario fixture shape (crates/pool-core/tests/fixtures/
 * scenarios/*.json): named, and the table may be the "wpa_9ft" preset
 * string (pool-cli convenience) instead of a full Table. */
export interface ScenarioFixture {
  name: string;
  description: string;
  system: { balls: Ball[]; table: Table | 'wpa_9ft' };
  shot: ShotParams;
}

export const SCENARIO_FIXTURES = [
  'straight_pot', 'cut_30_side', 'draw_shot', 'bank_two_cushion',
  'three_ball_chain',
] as const;

/** Load a scenario fixture, expanding the "wpa_9ft" table preset via the
 * kernel's own geometry (exactly what pool-cli does with Table::wpa_9ft). */
export function loadScenarioFixture(name: string, table: Table): Scenario {
  const fx = JSON.parse(fixtureText(`${name}.json`)) as ScenarioFixture;
  const t = fx.system.table === 'wpa_9ft' ? table : fx.system.table;
  return { system: { balls: fx.system.balls, table: t }, shot: fx.shot };
}
