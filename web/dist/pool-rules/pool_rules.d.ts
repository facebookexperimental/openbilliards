// Copyright (c) Meta Platforms, Inc. and affiliates.

/* tslint:disable */
/* eslint-disable */

/**
 * Resolve a pending rulebook option: canonical next-state bytes.
 */
export function rules_apply_decision_json(ruleset: string, state: string, decision: string): string;

/**
 * Canonical `task-config-v1` envelope bytes (feature 022,
 * the registry API contract §2 — crate bytes verbatim; this wrapper
 * never re-serializes, SC-007 is a byte comparison).
 */
export function rules_canonical_task_config_json(task_config: string): string;

/**
 * Registry catalog bytes (ids, foul codes, cites, configs, decision
 * tables — the TS pure-data drift-gate target).
 */
export function rules_catalog_json(): string;

/**
 * Match-state HUD projection: canonical bytes.
 */
export function rules_hud_state_json(ruleset: string, state: string): string;

/**
 * Initial match state for a fresh rack: canonical state bytes.
 */
export function rules_initial_state_json(ruleset: string, breaker: number): string;

/**
 * Judge one settled shot: canonical Judgment bytes (`call` = `"null"`
 * for games without call inputs).
 */
export function rules_judge_json(ruleset: string, state: string, record: string, call: string): string;

/**
 * Preset entry point for surfaces starting from a catalog preset id
 * (settings picker, share replay — feature 022,
 * the registry API contract §2). Unknown id ships the structured
 * `unknown-preset` payload.
 */
export function rules_preset_initial_state_json(preset_id: string, breaker: number): string;

/**
 * snooker-v2 address examination (feature GH-382): the Sec 3 R8
 * touching-ball called set + the Sec 2 R17 snookered fact over the
 * adapter's live positions (`{r, baulkY, cue: {x,y}|null, balls:
 * [{id,x,y}]}` — null cue = in-hand, the R17(a) from-the-D arm).
 */
export function rules_snooker_address_facts_json(state: string, positions: string): string;

/**
 * SHA-256 lowercase hex over the canonical envelope bytes (feature 022
 * — the crate is the ONE hasher; this wrapper never re-hashes).
 */
export function rules_task_hash(task_config: string): string;

/**
 * THE one registration/entry mechanism (feature 022, FR-001): initial
 * match state for a task-config envelope, config-in-state.
 */
export function rules_task_initial_state_json(task_config: string, breaker: number): string;

/**
 * `RULES_VERSION` — `CARGO_PKG_VERSION + "+" + POOL_RULES_BUILD_HASH`
 * (independent of the physics `kernel_version()`).
 */
export function rules_version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly rules_apply_decision_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly rules_canonical_task_config_json: (a: number, b: number) => [number, number];
    readonly rules_catalog_json: () => [number, number];
    readonly rules_hud_state_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly rules_initial_state_json: (a: number, b: number, c: number) => [number, number];
    readonly rules_judge_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly rules_preset_initial_state_json: (a: number, b: number, c: number) => [number, number];
    readonly rules_snooker_address_facts_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly rules_task_hash: (a: number, b: number) => [number, number];
    readonly rules_task_initial_state_json: (a: number, b: number, c: number) => [number, number];
    readonly rules_version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
