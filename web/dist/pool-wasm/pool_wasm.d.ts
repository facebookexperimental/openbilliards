// Copyright (c) Meta Platforms, Inc. and affiliates.

/* tslint:disable */
/* eslint-disable */

/**
 * Per-frame sampler over a parsed [`ShotRecord`] (contract §M10).
 *
 * JS usage (one reusable `Float64Array`, zero JS-side allocation per frame):
 * ```js
 * const sampler = WasmSampler.from_record_json(recordJson);
 * const n = sampler.sample_into(0, new Float64Array(0)); // query ball count
 * const buf = new Float64Array(8 * n);
 * // per frame:
 * sampler.sample_into(t, buf); // buf[8*i .. 8*i+8] = ball i's sample
 * ```
 */
export class WasmSampler {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Parse a [`ShotRecord`] JSON (as produced by [`simulate_json`]).
     * Throws a JS string on malformed JSON or format-version mismatch.
     */
    static from_record_json(record_json: string): WasmSampler;
    /**
     * Sample every ball at time `t` \[s\] into `out`, returning the TOTAL
     * ball count (also the count for buffer sizing — call once with an empty
     * array to query it).
     *
     * Layout: ball `i` (in `record.initial` order, stable across calls)
     * occupies `out[8*i .. 8*i+8]` as `[x, y, z, qw, qx, qy, qz,
     * motion_code]` with motion_code per [`motion_code`]. Sampling semantics
     * are M8's: `t` before the first event ⇒ initial states, after the last
     * ⇒ final states. Only complete 8-slot ball entries that fit in `out`
     * are written; a short buffer is never a panic.
     */
    sample_into(t: number, out: Float64Array): number;
}

/**
 * Catalog v20 (#789): the kernel's digest alias rows as JSON
 * (`[{"axis", "digest", "neutral_id"}, ...]`, digests only, no plaintext
 * retired id), from [`pool_core::catalog::catalog_alias_digests_json`].
 */
export function catalog_alias_digests_json(): string;

/**
 * The shipped equipment catalog as JSON ([`EquipmentCatalog`] serde shape:
 * `{version, tables, cloths, ballsets, cues, cushion_models}`, every entry
 * with `id` + `display_name` + `calibration` provenance) so pickers and the
 * SDK registry mirrors read the registry from the canonical wasm itself.
 */
export function catalog_json(): string;

/**
 * Kernel version string embedded in shot records
 * ([`pool_core::KERNEL_VERSION`]).
 */
export function kernel_version(): string;

/**
 * Seeded rack scenario for the browser app (issue #11 P3): full scenario
 * JSON (`{system, shot, options}`) ready for [`simulate_json`] after the app
 * overwrites the placeholder `shot` (straight 3 m/s break azimuth) with the
 * player's aim. `kind` is `"nine"`, `"ten"` (GH-343 — the WPA 6.2 10-ball
 * triangle, same frozen-contact policy), `"fifteen"`, `"snooker"` or `"carom"`
 * (feature 012 — contracts/equipment-additions.md §3; the layouts expand to
 * explicit ball arrays pre-serde, additive-safe); anything else returns
 * `{"error": ...}`. Same seed → bit-identical rack (M7 contract).
 *
 * `equipment_json` (equipment-catalog wave, issue #15; omit/`undefined` for
 * the legacy behavior) is an [`EquipmentSpec`] JSON — partial objects fill
 * with the default ids. When present, the scenario is composed by
 * [`EquipmentCatalog::resolve`]: rack built on the resolved table at the
 * ballset radius with cloth-applied ball params, `system.equipment` tagged,
 * and `options` = the resolved options (cushion-model slice + cue). Unknown
 * ids return `{"error": ...}`. Without a spec the output is BYTE-IDENTICAL
 * to the pre-catalog builder for `"nine"`/`"fifteen"`: options are
 * [`SimOptions::realistic`] (calibrated Stronge cushion) and no equipment
 * tag is emitted.
 *
 * Feature 012 kinds (both are full resolved-equipment compositions —
 * their layouts are discipline-table coordinates):
 * - `"snooker"`: 22 balls (cue 0 in the D, frozen-topology reds 1–15,
 *   colours 16–21 on their spots) on the default snooker pairing
 *   (`EquipmentSpec::snooker_default`) or the given equipment, whose table
 *   must be the 12-ft snooker geometry;
 * - `"carom"`: 3 balls (UMB Art 23 — breaker 0 on the RIGHT start spot as
 *   the canonical seed-pure default; the recorded break-spot decision
 *   moves it via the placements axis) on `EquipmentSpec::carom_default`
 *   or the given equipment, whose table must be the pocketless 2.84 m
 *   geometry. The layout is seed-independent; the derived `shot.seed`
 *   still carries the seed.
 */
export function new_rack_scenario(kind: string, seed: bigint, equipment_json?: string | null): string;

/**
 * Simulate a scenario (JSON in, JSON out).
 *
 * Input: `{ "system": SystemState, "shot": ShotParams, "options": SimOptions? }`.
 * Output: [`ShotRecord`] JSON on success, `{"error": "..."}` on any failure
 * (malformed JSON, validation error, event-budget exhaustion). Never throws.
 */
export function simulate_json(scenario_json: string): string;

/**
 * WPA 9-ft table geometry as JSON (the kernel's own `Table` serialization:
 * `width`, `length`, `linear` cushion segments, `circular` jaw arcs,
 * `pockets`, `cushion_response`) so the renderer draws EXACTLY the geometry
 * the kernel simulates.
 *
 * `ball_r` is the ball radius the cushion nose height derives from
 * (0.635 · 2r); omit it (`undefined`) for the kernel default radius. This
 * mirrors pool-cli's `"table": "wpa_9ft"` scenario convenience, which
 * expands with the FIRST ball's radius — pass that radius here so every
 * surface instantiates the same physics (spec 005 FR-002/SC-001). Invalid
 * radii (non-finite or ≤ 0) return `{"error": ...}`.
 */
export function table_geometry_json(ball_r?: number | null): string;

/**
 * Table geometry for ANY catalog table id (feature 012,
 * contracts/equipment-additions.md §3): the kernel's own `Table`
 * serialization for the id's geometry family, built for balls of radius
 * `ball_r` (omit for the kernel default radius — pass the ACTIVE ballset
 * radius so renderer and physics instantiate the same nose heights).
 *
 * The existing zero-arg [`table_geometry_json`] stays byte-frozen on
 * wpa_9ft (`table_geometry_json_for("wpa_generic_9ft", r)` produces the
 * identical bytes — pinned test). A retired v8 Measured id builds its
 * neutral twin's geometry (the catalog v20 digest alias rows, as in
 * equipment resolve). Unknown ids and invalid radii return
 * `{"error": ...}`.
 */
export function table_geometry_json_for(table_id: string, ball_r?: number | null): string;

/**
 * Geometric shot feasibility (issue #57): the kernel-side rail-clearance
 * envelope ([`pool_core::cue_clearance`]) over a scenario's cue ball.
 *
 * Input: the SAME scenario JSON as [`simulate_json`] (`options` ignored);
 * `cue_geom_json` is an optional partial [`pool_core::CueGeometry`] object
 * (missing fields fill with the documented cuestick.js mirror defaults —
 * omit/`undefined` for the default 9-ft rod + rail bands + pocket-mouth
 * carve; pass `"mouths": null` for solid bands). UNKNOWN keys are
 * REJECTED (`deny_unknown_fields`, review F4 2026-07-21): a camelCase
 * misspelling like `{"railTop": …}` returns an `{"error"}` payload
 * instead of silently deserializing to the defaults and reporting a
 * wrong verdict.
 *
 * Output (never throws): `{"ok": true, "min_elevation_deg": X}` when the
 * shot's theta clears the geometric floor, `{"ok": false,
 * "min_elevation_deg": X, "error": "..."}` when it sits below it, and
 * `{"error": "..."}` on malformed input. `simulate_json` itself stays
 * PERMISSIVE (replay compatibility) — this is a separate pure surface the
 * app's input envelope feature-detects (`typeof glue.… === 'function'`,
 * the `table_geometry_json_for` precedent) and the RL harness may consume
 * for action-space masking.
 */
export function validate_shot_geometry_json(scenario_json: string, cue_geom_json?: string | null): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmsampler_free: (a: number, b: number) => void;
    readonly catalog_alias_digests_json: () => [number, number];
    readonly catalog_json: () => [number, number];
    readonly kernel_version: () => [number, number];
    readonly new_rack_scenario: (a: number, b: number, c: bigint, d: number, e: number) => [number, number];
    readonly simulate_json: (a: number, b: number) => [number, number];
    readonly table_geometry_json: (a: number, b: number) => [number, number];
    readonly table_geometry_json_for: (a: number, b: number, c: number, d: number) => [number, number];
    readonly validate_shot_geometry_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmsampler_from_record_json: (a: number, b: number) => [number, number, number];
    readonly wasmsampler_sample_into: (a: number, b: number, c: number, d: number, e: any) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
