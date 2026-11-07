// Copyright (c) Meta Platforms, Inc. and affiliates.

// sampler.ts — typed wrapper over the kernel's WasmSampler with a reusable
// Float64Array (zero allocation per frame) and per-ball view helpers over
// the frozen flat layout [x, y, z, qw, qx, qy, qz, motion_code] × N
// (crates/pool-wasm FLOATS_PER_BALL = 8; motion codes Stationary=0,
// Spinning=1, Sliding=2, Rolling=3, Pocketed=4, Airborne=5).

import type { BallId, MotionState } from './types.js';

/** f64 slots per ball in the flat sample layout. */
export const FLOATS_PER_BALL = 8;

/** Frozen motion-code mapping (pool-wasm `motion_code`). */
export const MOTION_CODES: readonly MotionState[] = [
  'Stationary', 'Spinning', 'Sliding', 'Rolling', 'Pocketed', 'Airborne',
];

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
export class Sampler {
  /** The reusable flat sample buffer (8 slots per ball). */
  readonly data: Float64Array;
  /** Ball ids in sampler order (record.initial.balls order). */
  readonly ballIds: readonly BallId[];
  private readonly inner: KernelSampler;

  constructor(inner: KernelSampler, ballIds: readonly BallId[]) {
    this.inner = inner;
    this.ballIds = ballIds;
    this.data = new Float64Array(FLOATS_PER_BALL * ballIds.length);
    const n = inner.sample_into(0, this.data);
    if (n !== ballIds.length) {
      inner.free();
      throw new Error(`sampler ball count ${n} != record ball count ${ballIds.length}`);
    }
  }

  /** Number of balls in the record. */
  get ballCount(): number {
    return this.ballIds.length;
  }

  /** Sample every ball at time t [s] into the reusable buffer and return it.
   * Semantics are the kernel's: t before the first event ⇒ initial states,
   * after the last ⇒ final states. */
  sampleAt(t: number): Float64Array {
    this.inner.sample_into(t, this.data);
    return this.data;
  }

  /** Byte offset helper: ball i's slots are data[offset(i) .. offset(i)+8]. */
  offset(i: number): number {
    return FLOATS_PER_BALL * i;
  }

  /** Decode ball i (by sampler index) of the last sampled frame. */
  ball(i: number): BallSampleView {
    const id = this.ballIds[i];
    if (id === undefined) throw new RangeError(`ball index ${i} out of range`);
    const o = this.offset(i);
    const d = this.data;
    const motionCode = d[o + 7]!;
    const motion = MOTION_CODES[motionCode];
    if (motion === undefined) throw new Error(`unknown motion code ${motionCode}`);
    return {
      id,
      x: d[o]!, y: d[o + 1]!, z: d[o + 2]!,
      qw: d[o + 3]!, qx: d[o + 4]!, qy: d[o + 5]!, qz: d[o + 6]!,
      motionCode, motion,
    };
  }

  /** Decode every ball of the last sampled frame (allocates). */
  balls(): BallSampleView[] {
    return this.ballIds.map((_, i) => this.ball(i));
  }

  /** Release the wasm-side sampling index. */
  free(): void {
    this.inner.free();
  }
}
