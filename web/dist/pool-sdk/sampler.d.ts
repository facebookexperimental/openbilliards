// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { BallId, MotionState } from './types.js';
/** f64 slots per ball in the flat sample layout. */
export declare const FLOATS_PER_BALL = 8;
/** Frozen motion-code mapping (pool-wasm `motion_code`). */
export declare const MOTION_CODES: readonly MotionState[];
/** The raw wasm-bindgen sampler surface the SDK wraps. */
export interface KernelSampler {
    sample_into(t: number, out: Float64Array): number;
    free(): void;
}
/** One ball's decoded sample (allocated on demand; hot paths should read the
 * flat buffer directly via `data`/offsets). */
export interface BallSampleView {
    id: BallId;
    x: number;
    y: number;
    z: number;
    qw: number;
    qx: number;
    qy: number;
    qz: number;
    motionCode: number;
    motion: MotionState;
}
/**
 * Per-frame sampler over one ShotRecord. Owns ONE reusable Float64Array:
 * `sampleAt(t)` fills it and returns it; `ball(i)` decodes ball i of the
 * LAST sampled frame. Ball order = `record.initial.balls` order (stable).
 * Call `free()` when done (releases the wasm-side index).
 */
export declare class Sampler {
    /** The reusable flat sample buffer (8 slots per ball). */
    readonly data: Float64Array;
    /** Ball ids in sampler order (record.initial.balls order). */
    readonly ballIds: readonly BallId[];
    private readonly inner;
    constructor(inner: KernelSampler, ballIds: readonly BallId[]);
    /** Number of balls in the record. */
    get ballCount(): number;
    /** Sample every ball at time t [s] into the reusable buffer and return it.
     * Semantics are the kernel's: t before the first event ⇒ initial states,
     * after the last ⇒ final states. */
    sampleAt(t: number): Float64Array;
    /** Byte offset helper: ball i's slots are data[offset(i) .. offset(i)+8]. */
    offset(i: number): number;
    /** Decode ball i (by sampler index) of the last sampled frame. */
    ball(i: number): BallSampleView;
    /** Decode every ball of the last sampled frame (allocates). */
    balls(): BallSampleView[];
    /** Release the wasm-side sampling index. */
    free(): void;
}
