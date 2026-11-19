// Copyright (c) Meta Platforms, Inc. and affiliates.
/** f64 slots per ball in the flat sample layout. */
export const FLOATS_PER_BALL = 8;
/** Frozen motion-code mapping (pool-wasm `motion_code`). */
export const MOTION_CODES = [
    'Stationary', 'Spinning', 'Sliding', 'Rolling', 'Pocketed', 'Airborne',
];
/**
 * Per-frame sampler over one ShotRecord. Owns ONE reusable Float64Array:
 * `sampleAt(t)` fills it and returns it; `ball(i)` decodes ball i of the
 * LAST sampled frame. Ball order = `record.initial.balls` order (stable).
 * Call `free()` when done (releases the wasm-side index).
 */
export class Sampler {
    /** The reusable flat sample buffer (8 slots per ball). */
    data;
    /** Ball ids in sampler order (record.initial.balls order). */
    ballIds;
    inner;
    constructor(inner, ballIds) {
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
    get ballCount() {
        return this.ballIds.length;
    }
    /** Sample every ball at time t [s] into the reusable buffer and return it.
     * Semantics are the kernel's: t before the first event ⇒ initial states,
     * after the last ⇒ final states. */
    sampleAt(t) {
        this.inner.sample_into(t, this.data);
        return this.data;
    }
    /** Byte offset helper: ball i's slots are data[offset(i) .. offset(i)+8]. */
    offset(i) {
        return FLOATS_PER_BALL * i;
    }
    /** Decode ball i (by sampler index) of the last sampled frame. */
    ball(i) {
        const id = this.ballIds[i];
        if (id === undefined)
            throw new RangeError(`ball index ${i} out of range`);
        const o = this.offset(i);
        const d = this.data;
        const motionCode = d[o + 7];
        const motion = MOTION_CODES[motionCode];
        if (motion === undefined)
            throw new Error(`unknown motion code ${motionCode}`);
        return {
            id,
            x: d[o], y: d[o + 1], z: d[o + 2],
            qw: d[o + 3], qx: d[o + 4], qy: d[o + 5], qz: d[o + 6],
            motionCode, motion,
        };
    }
    /** Decode every ball of the last sampled frame (allocates). */
    balls() {
        return this.ballIds.map((_, i) => this.ball(i));
    }
    /** Release the wasm-side sampling index. */
    free() {
        this.inner.free();
    }
}
