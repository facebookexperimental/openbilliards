// Copyright (c) Meta Platforms, Inc. and affiliates.

// engine.ts — kernel loading + the typed simulate surface. Works in BOTH
// node ≥ 20 and the browser over the SAME wasm-bindgen (--target web) glue:
//   - browser: `import * as glue from '.../pool_wasm.js'; await init(glue)`
//     (the glue fetches its sibling pool_wasm_bg.wasm), or pass a URL string
//     to the glue module and the SDK dynamic-imports it;
//   - node: `await init('/abs/path/to/pool_wasm.js')` — the SDK imports the
//     glue and feeds it the sibling .wasm bytes via node:fs (node's fetch
//     cannot read file:// URLs).
// Constitution P-III: the canonical physics is the shipped .wasm binary.

import type { EquipmentIds, Table } from './types.js';
import type { EquipmentCatalog } from './catalog.js';
import type { Scenario } from './scenario.js';
import { scenarioToJson } from './scenario.js';
import type { ShotRecord } from './record.js';
import { RecordError, parseShotRecord } from './record.js';
import type { KernelSampler } from './sampler.js';
import { Sampler } from './sampler.js';

/** The wasm-bindgen export surface the SDK consumes (pool_wasm.d.ts). */
export interface KernelModule {
  kernel_version(): string;
  simulate_json(scenarioJson: string): string;
  new_rack_scenario(kind: string, seed: bigint, equipmentJson?: string): string;
  catalog_json(): string;
  table_geometry_json(ballR?: number): string;
  WasmSampler: { from_record_json(recordJson: string): KernelSampler };
}

/** The glue module namespace (KernelModule + the wasm-bindgen initializer). */
export interface WasmGlueModule extends KernelModule {
  default(input?: { module_or_path: unknown }): Promise<unknown>;
}

/** Thrown when the kernel reports `{"error": ...}` for a scenario. */
export class EngineError extends Error {
  override name = 'EngineError';
}

const isNode =
  typeof process !== 'undefined' && process.versions?.node !== undefined;

/**
 * Load + instantiate the kernel and return an Engine.
 * `source` is either the glue module path/URL (pool_wasm.js; its sibling
 * pool_wasm_bg.wasm is loaded automatically) or an already-imported glue
 * module namespace. `wasmBytes` optionally overrides the .wasm binary.
 */
export async function init(
  source: string | URL | WasmGlueModule,
  wasmBytes?: BufferSource,
): Promise<Engine> {
  let glue: WasmGlueModule;
  let bytes = wasmBytes;
  if (typeof source === 'string' || source instanceof URL) {
    if (isNode) {
      const { pathToFileURL } = await import('node:url');
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const url = source instanceof URL || /^[a-z]+:/i.test(String(source))
        ? new URL(String(source))
        : pathToFileURL(String(source));
      glue = (await import(url.href)) as WasmGlueModule;
      if (bytes === undefined) {
        const wasmUrl = new URL(
          url.href.replace(/\.js$/, '_bg.wasm'));
        bytes = await readFile(fileURLToPath(wasmUrl));
      }
    } else {
      glue = (await import(String(source))) as WasmGlueModule;
    }
  } else {
    glue = source;
  }
  // The glue's init is idempotent (returns the cached instance when already
  // initialized), so double-init from app + SDK is safe.
  await glue.default(bytes !== undefined ? { module_or_path: bytes } : undefined);
  return new Engine(glue);
}

/** Typed simulation surface over an instantiated kernel module. */
export class Engine {
  readonly kernel: KernelModule;

  constructor(kernel: KernelModule) {
    this.kernel = kernel;
  }

  /** Kernel version string (embedded in every ShotRecord). */
  version(): string {
    return this.kernel.kernel_version();
  }

  /** WPA 9-ft table geometry — EXACTLY what the kernel simulates.
   * `ballR` is the ball radius the cushion nose height derives from; omit
   * it for the kernel default. Pass the first ball's radius to match
   * pool-cli's `"table": "wpa_9ft"` scenario expansion (spec 005 SC-001). */
  table(ballR?: number): Table {
    const out = this.kernel.table_geometry_json(ballR);
    if (out.startsWith('{"error"')) {
      throw new EngineError((JSON.parse(out) as { error: string }).error);
    }
    return JSON.parse(out) as Table;
  }

  /** The shipped equipment catalog, read from the canonical wasm itself
   * (kernel `catalog_json()`; the static mirror in catalog.ts is pinned
   * against this by the SDK drift test). */
  catalog(): EquipmentCatalog {
    return JSON.parse(this.kernel.catalog_json()) as EquipmentCatalog;
  }

  /** Seeded 9-ball rack scenario (kernel M7: same seed → bit-identical rack).
   * The placeholder shot (straight 3 m/s break) is meant to be overwritten.
   *
   * `equipment` (optional, may be partial — missing axes fill with the
   * default ids) routes the rack through the kernel's equipment resolve:
   * table geometry at the ballset radius, cloth-applied ball params, the
   * `system.equipment` tag, and the resolved options (cushion-model slice +
   * cue). Without it the output is byte-identical to the pre-catalog
   * builder (options = the kernel's `realistic()` preset, no equipment
   * tag). Unknown ids throw EngineError. */
  nineBallRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario {
    return this.rack('nine', seed, equipment);
  }

  /** Seeded 10-ball rack scenario (feature 026, GH-343 — WPA 6.2
   * triangle: 1 at the apex on the foot spot, 10 at the triangle centre;
   * see `nineBallRack` for the equipment semantics). */
  tenBallRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario {
    return this.rack('ten', seed, equipment);
  }

  /** Seeded 15-ball rack scenario (see `nineBallRack`). */
  fifteenBallRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario {
    return this.rack('fifteen', seed, equipment);
  }

  /** Seeded snooker frame scenario (feature 012, mirroring
   * `fifteenBallRack`): 22 balls — cue in the D, frozen-topology reds,
   * colours on their spots — on the kernel's default snooker pairing, or
   * on `equipment` (its table must be the 12-ft snooker geometry; the
   * kernel validates). */
  snookerRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario {
    return this.rack('snooker', seed, equipment);
  }

  /** Carom starting-position scenario (feature 012; UMB Art 23). The
   * kernel layout is seed-independent (3 fixed balls) with the breaker on
   * the RIGHT start spot as the canonical default; `breakerRight: false`
   * mirrors the breaker to the left start spot — a cue-ball PLACEMENT
   * (the recorded break-spot decision 10 rides the share placements axis,
   * exactly like ball-in-hand), by NEGATING the kernel's own start-spot x
   * (the start spots are symmetric about the centre line, UMB Art 23.1 —
   * no re-derived geometry). `seed` only feeds the derived `shot.seed`. */
  caromStart(
    breakerRight: boolean, seed = 0, equipment?: Partial<EquipmentIds>,
  ): Scenario {
    const scenario = this.rack('carom', seed, equipment);
    if (!breakerRight) {
      const breaker = scenario.system.balls[0];
      if (breaker === undefined || breaker.id !== 0) {
        throw new EngineError('carom scenario is missing the breaker ball');
      }
      breaker.state.pos = {
        ...breaker.state.pos,
        x: -Math.abs(breaker.state.pos.x),
      };
    }
    return scenario;
  }

  private rack(
    kind: 'nine' | 'ten' | 'fifteen' | 'snooker' | 'carom', seed: number,
    equipment?: Partial<EquipmentIds>,
  ): Scenario {
    if (!Number.isSafeInteger(seed) || seed < 0) {
      throw new EngineError(`rack seed must be a non-negative safe integer, got ${seed}`);
    }
    const json = this.kernel.new_rack_scenario(kind, BigInt(seed),
      equipment === undefined ? undefined : JSON.stringify(equipment));
    const parsed = JSON.parse(json) as Scenario & { error?: string };
    if (parsed.error !== undefined) throw new EngineError(parsed.error);
    return parsed;
  }

  /** Simulate a scenario, returning the raw ShotRecord JSON (the lossless
   * replay/transfer format). Throws EngineError on kernel rejection. */
  simulateJson(scenario: Scenario | string): string {
    const json = typeof scenario === 'string' ? scenario : scenarioToJson(scenario);
    const out = this.kernel.simulate_json(json);
    // The kernel's error payload is exactly {"error": "..."} (pool-wasm
    // error_json); a ShotRecord starts with {"kernel_version".
    if (out.startsWith('{"error"')) {
      const probe = JSON.parse(out) as { error: string };
      throw new EngineError(probe.error);
    }
    return out;
  }

  /** Simulate a scenario into a typed, shape-validated ShotRecord.
   * Throws EngineError (kernel rejection) or RecordError (shape drift). */
  simulate(scenario: Scenario | string): ShotRecord {
    return parseShotRecord(this.simulateJson(scenario), this.version());
  }

  /** Parse + strictly validate a stored ShotRecord (replay load): format
   * version AND kernel version must match this engine (P-III policy). */
  loadRecord(json: string): ShotRecord {
    return parseShotRecord(json, this.version());
  }

  /** Build a Sampler over a record. Accepts the raw record JSON (preferred —
   * avoids a re-serialize, and is the only lossless path for foreign records
   * with u64 seeds above 2^53 − 1; see the ShotRecord precision caveat) or a
   * parsed ShotRecord. The record's versions are enforced by the kernel-side
   * parser. */
  sampler(record: ShotRecord | string): Sampler {
    const json = typeof record === 'string' ? record : JSON.stringify(record);
    let inner: KernelSampler;
    try {
      inner = this.kernel.WasmSampler.from_record_json(json);
    } catch (e) {
      throw new RecordError(typeof e === 'string' ? e : String(e));
    }
    const rec = typeof record === 'string'
      ? (JSON.parse(record) as ShotRecord)
      : record;
    return new Sampler(inner, rec.initial.balls.map((b) => b.id));
  }
}
