// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { Ball, BallParams, CushionResponse, EquipmentIds, SystemState, Table } from './types.js';
import type { ShotParams, SimOptions } from './shot.js';
/** Kernel Eps::KISS [m] (consts.rs): minimum admissible gap shortfall
 * between balls. */
export declare const EPS_KISS = 0.000001;
/** Kernel Eps::SPACE [m] (consts.rs): positional tolerance (z-vs-R rules). */
export declare const EPS_SPACE = 1e-9;
/** Kernel Eps::VEL [m/s] (consts.rs): below this a velocity is "at rest". */
export declare const EPS_VEL = 1e-9;
/** Kernel Eps::SPIN [rad/s] (consts.rs): below this a spin is "at rest". */
export declare const EPS_SPIN = 1e-9;
/** A full simulation scenario — the JSON payload of `simulate_json` and
 * `pool-cli simulate` (`{system, shot, options?}`). */
export interface Scenario {
    system: SystemState;
    shot: ShotParams;
    options?: SimOptions;
}
/** Serialize a scenario for the wasm/CLI boundary. */
export declare function scenarioToJson(scenario: Scenario): string;
/** Options for `ScenarioBuilder.ball` explicit placement. */
export interface BallPlacement {
    x: number;
    y: number;
    /** Per-ball parameter override (defaults to `defaultBallParams()`). */
    params?: BallParams;
}
/**
 * Builds `{system, shot, options}` scenarios against a kernel table.
 * Get the table from `engine.table()` (the kernel's own WPA 9-ft geometry)
 * or reuse one from a rack scenario; `build()` validates placements with the
 * kernel's own rules and the shot with `validateShot` against the
 * scenario's OWN cue — `options.cue` + the cue ball's radius, exactly the
 * inputs the kernel's validate_shot reads (Amendments 020/021).
 */
export declare class ScenarioBuilder {
    private table;
    private balls;
    private shotParams;
    private opts;
    private equip;
    constructor(table: Table);
    /** Place a stationary on-bed ball at kernel (x, y); z is set to R. */
    ball(id: number, placement: BallPlacement): this;
    /** Add a fully specified ball (advanced states, e.g. Airborne replays). */
    rawBall(ball: Ball): this;
    /** Set the shot (validated in build()). */
    shot(shot: ShotParams): this;
    /** Set simulation options. When never called, `build()` OMITS the
     * `options` key entirely so the kernel's own serde default (v1 physics)
     * applies — the SDK never bakes a possibly-drifted mirror of it into the
     * scenario document. */
    options(options: SimOptions): this;
    /** Override the table's cushion response (e.g. the mathavanFitted ee0 0.80
     * or `gripFittedCushionResponse()` pairing — see shot.ts presets). */
    cushionResponse(response: CushionResponse): this;
    /** Tag the scenario with its equipment composition (catalog ids —
     * provenance metadata; the kernel simulates `balls`/`table`/`options`,
     * never the ids). Ids are validated against the registry mirror here
     * (EquipmentError on unknown ids). The kernel serde-skips the default
     * composition, so `build()` omits it too, keeping byte parity: pass the
     * equipment the table/params/options were resolved from (e.g. copy
     * `system.equipment` of an `Engine.nineBallRack(seed, equipment)`
     * template when rebuilding mid-game scenarios from it). */
    equipment(ids: EquipmentIds): this;
    /** Validate (kernel input rules) and return the Scenario. */
    build(): Scenario;
}
/**
 * Placement validation mirroring sim/event_loop.rs::validate_input (the
 * kernel re-checks; this mirrors its rejections so SDK users fail fast with
 * the same semantics): ids/cue/finiteness, pinch-press constraints, the
 * z/vz-vs-Airborne rules, bounds, motion/velocity consistency, and pairwise
 * overlap. Throws ValidationError.
 */
export declare function validatePlacements(balls: Ball[], table: Table, cueBallId?: number): void;
