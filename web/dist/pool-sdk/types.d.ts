// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Ball identity — serde newtype over u8, serialized as a bare number. */
export type BallId = number;
/** 3-component f64 vector (SI units, world frame, z-up). */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
/** Unit quaternion for ball orientation (render-only in kernel v1). */
export interface Quat {
    w: number;
    x: number;
    y: number;
    z: number;
}
/** Ball motion state machine (state.rs `MotionState`, unit-variant strings). */
export type MotionState = 'Stationary' | 'Spinning' | 'Sliding' | 'Rolling' | 'Airborne' | 'Pocketed';
/** All MotionState values, in the kernel's declaration order. */
export declare const MOTION_STATES: readonly MotionState[];
/** Post-pinch elevated-press slide phase (state.rs `PinchBoost`). */
export interface PinchBoost {
    k: number;
    t_rem: number;
}
/** Dynamic state of one ball (state.rs `BallState`). `pinch` is
 * serde-skipped when absent — omit it (or set `undefined`) for parity. */
export interface BallState {
    pos: Vec3;
    vel: Vec3;
    avel: Vec3;
    motion: MotionState;
    pinch?: PinchBoost;
}
/** Per-ball physical parameters (params.rs `BallParams`). `e_t` is
 * serde-defaulted (0.5) and may be absent in pre-Amendment-002 JSON. */
export interface BallParams {
    m: number;
    r: number;
    u_s: number;
    u_r: number;
    u_sp: number;
    e_b: number;
    e_c: number;
    f_c: number;
    e_t?: number;
}
/** A ball: identity + immutable parameters + dynamic state. */
export interface Ball {
    id: BallId;
    params: BallParams;
    state: BallState;
}
/** Cushion restitution hook (params.rs `CushionResponse`). `ee0` is
 * serde-defaulted (0.98) and skipped at default. */
export interface CushionResponse {
    e0: number;
    k_v: number;
    v_ref: number;
    e_min: number;
    e_max: number;
    ee0?: number;
}
/** Cushion friction slip-velocity hook (params.rs `CushionFriction`). */
export interface CushionFriction {
    k: number;
    v_ref: number;
    mu_min: number;
    mu_max: number;
}
/** Alciatore ball–ball friction curve μ(v) = a + b·exp(−c·v). */
export interface BallBallFriction {
    a: number;
    b: number;
    c: number;
}
/** A straight cushion segment (table.rs `LinearCushionSegment`). */
export interface LinearCushionSegment {
    p1: Vec3;
    p2: Vec3;
    height: number;
}
/** A circular cushion segment — pocket jaw arc. */
export interface CircularCushionSegment {
    center: Vec3;
    radius: number;
    height: number;
}
/** A pocket: point-of-no-return disc. */
export interface Pocket {
    center: Vec3;
    radius: number;
}
/** Table geometry + cushion response (table.rs `Table`). */
export interface Table {
    width: number;
    length: number;
    linear: LinearCushionSegment[];
    circular: CircularCushionSegment[];
    pockets: Pocket[];
    cushion_response: CushionResponse;
}
/** Equipment composition by catalog ids (catalog.rs `EquipmentSpec`;
 * equipment-catalog wave, issue #15). Serde-skipped when equal to the
 * default ids — omit the field entirely for pre-catalog byte parity.
 * The registry mirror + helpers live in catalog.ts. */
export interface EquipmentIds {
    table_id: string;
    cloth_id: string;
    ballset_id: string;
    cue_id: string;
    cushion_model_id: string;
}
/** Full system snapshot consumed by `simulate` (state.rs `SystemState`).
 * `equipment` is pure provenance metadata (catalog ids), serde-skipped at
 * the default ids. */
export interface SystemState {
    balls: Ball[];
    table: Table;
    equipment?: EquipmentIds;
}
/** The kernel's default ball parameters (params.rs `BallParams::default`),
 * mirrored for scenario construction. r = 0.028575 m (57.15 mm US ball). */
export declare function defaultBallParams(): BallParams;
