// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { EquipmentIds, Table } from './types.js';
import type { EquipmentCatalog } from './catalog.js';
import type { Scenario } from './scenario.js';
import type { ShotRecord } from './record.js';
import type { KernelSampler } from './sampler.js';
import { Sampler } from './sampler.js';
/** The wasm-bindgen export surface the SDK consumes (pool_wasm.d.ts). */
export interface KernelModule {
    kernel_version(): string;
    simulate_json(scenarioJson: string): string;
    new_rack_scenario(kind: string, seed: bigint, equipmentJson?: string): string;
    catalog_json(): string;
    table_geometry_json(ballR?: number): string;
    WasmSampler: {
        from_record_json(recordJson: string): KernelSampler;
    };
}
/** The glue module namespace (KernelModule + the wasm-bindgen initializer). */
export interface WasmGlueModule extends KernelModule {
    default(input?: {
        module_or_path: unknown;
    }): Promise<unknown>;
}
/** Thrown when the kernel reports `{"error": ...}` for a scenario. */
export declare class EngineError extends Error {
    name: string;
}
/**
 * Load + instantiate the kernel and return an Engine.
 * `source` is either the glue module path/URL (pool_wasm.js; its sibling
 * pool_wasm_bg.wasm is loaded automatically) or an already-imported glue
 * module namespace. `wasmBytes` optionally overrides the .wasm binary.
 */
export declare function init(source: string | URL | WasmGlueModule, wasmBytes?: BufferSource): Promise<Engine>;
/** Typed simulation surface over an instantiated kernel module. */
export declare class Engine {
    readonly kernel: KernelModule;
    constructor(kernel: KernelModule);
    /** Kernel version string (embedded in every ShotRecord). */
    version(): string;
    /** WPA 9-ft table geometry — EXACTLY what the kernel simulates.
     * `ballR` is the ball radius the cushion nose height derives from; omit
     * it for the kernel default. Pass the first ball's radius to match
     * pool-cli's `"table": "wpa_9ft"` scenario expansion (spec 005 SC-001). */
    table(ballR?: number): Table;
    /** The shipped equipment catalog, read from the canonical wasm itself
     * (kernel `catalog_json()`; the static mirror in catalog.ts is pinned
     * against this by the SDK drift test). */
    catalog(): EquipmentCatalog;
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
    nineBallRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario;
    /** Seeded 10-ball rack scenario (feature 026, GH-343 — WPA 6.2
     * triangle: 1 at the apex on the foot spot, 10 at the triangle centre;
     * see `nineBallRack` for the equipment semantics). */
    tenBallRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario;
    /** Seeded 15-ball rack scenario (see `nineBallRack`). */
    fifteenBallRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario;
    /** Seeded snooker frame scenario (feature 012, mirroring
     * `fifteenBallRack`): 22 balls — cue in the D, frozen-topology reds,
     * colours on their spots — on the kernel's default snooker pairing, or
     * on `equipment` (its table must be the 12-ft snooker geometry; the
     * kernel validates). */
    snookerRack(seed: number, equipment?: Partial<EquipmentIds>): Scenario;
    /** Carom starting-position scenario (feature 012; UMB Art 23). The
     * kernel layout is seed-independent (3 fixed balls) with the breaker on
     * the RIGHT start spot as the canonical default; `breakerRight: false`
     * mirrors the breaker to the left start spot — a cue-ball PLACEMENT
     * (the recorded break-spot decision 10 rides the share placements axis,
     * exactly like ball-in-hand), by NEGATING the kernel's own start-spot x
     * (the start spots are symmetric about the centre line, UMB Art 23.1 —
     * no re-derived geometry). `seed` only feeds the derived `shot.seed`. */
    caromStart(breakerRight: boolean, seed?: number, equipment?: Partial<EquipmentIds>): Scenario;
    private rack;
    /** Simulate a scenario, returning the raw ShotRecord JSON (the lossless
     * replay/transfer format). Throws EngineError on kernel rejection. */
    simulateJson(scenario: Scenario | string): string;
    /** Simulate a scenario into a typed, shape-validated ShotRecord.
     * Throws EngineError (kernel rejection) or RecordError (shape drift). */
    simulate(scenario: Scenario | string): ShotRecord;
    /** Parse + strictly validate a stored ShotRecord (replay load): format
     * version AND kernel version must match this engine (P-III policy). */
    loadRecord(json: string): ShotRecord;
    /** Build a Sampler over a record. Accepts the raw record JSON (preferred —
     * avoids a re-serialize, and is the only lossless path for foreign records
     * with u64 seeds above 2^53 − 1; see the ShotRecord precision caveat) or a
     * parsed ShotRecord. The record's versions are enforced by the kernel-side
     * parser. */
    sampler(record: ShotRecord | string): Sampler;
}
