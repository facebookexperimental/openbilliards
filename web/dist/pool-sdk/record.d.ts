// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { BallId, BallState, MotionState, SystemState } from './types.js';
import type { ShotParams, SimOptions } from './shot.js';
/** Shot-record format version the SDK understands (record.rs FORMAT_VERSION). */
export declare const FORMAT_VERSION = 1;
/** What happened at an event (events.rs `EventKind`, externally tagged serde
 * enum: the unit variant `Rest` is the bare string). Indices refer to
 * `Table` vectors. */
export type EventKind = 'Rest' | {
    Strike: {
        ball: BallId;
    };
} | {
    BallBall: {
        b1: BallId;
        b2: BallId;
    };
} | {
    BallLinearCushion: {
        ball: BallId;
        seg: number;
    };
} | {
    BallCircularCushion: {
        ball: BallId;
        arc: number;
    };
} | {
    BallPocket: {
        ball: BallId;
        pocket: number;
    };
} | {
    BallTable: {
        ball: BallId;
    };
} | {
    BallOffTable: {
        ball: BallId;
    };
} | {
    Transition: {
        ball: BallId;
        from: MotionState;
        to: MotionState;
    };
};
/** A simulation event: absolute time, kind, and post-event snapshots of the
 * participating balls (serde tuple → `[id, state]` arrays). */
export interface Event {
    t: number;
    kind: EventKind;
    post: [BallId, BallState][];
}
/** Per-shot diagnostic counters (record.rs `ShotStats`; serde-skipped at
 * default, so the field may be absent). */
export interface ShotStats {
    cushion_impacts_beyond_validity: number;
}
/** Complete, replayable record of one simulated shot (record.rs `ShotRecord`).
 *
 * Precision caveat: `shot.seed` is a kernel u64 but a JS `number` here, so
 * `parseShotRecord` REJECTS records whose seed exceeds
 * `Number.MAX_SAFE_INTEGER` (2^53 − 1) — JSON.parse would silently round it
 * and a re-serialized record would replay a different seed. Records from
 * this SDK are always safe (shot.ts enforces safe-integer seeds); use the
 * raw JSON string (e.g. `Engine.sampler(json)`) for foreign records with
 * larger seeds. */
export interface ShotRecord {
    kernel_version: string;
    format_version: number;
    initial: SystemState;
    shot: ShotParams;
    options: SimOptions;
    events: Event[];
    stats?: ShotStats;
}
/** Thrown by `parseShotRecord` on malformed JSON or version mismatch. */
export declare class RecordError extends Error {
    name: string;
}
/** Total simulated duration [s] (time of the final event; 0 if empty). */
export declare function recordDuration(record: ShotRecord): number;
/**
 * Parse a ShotRecord JSON string, enforcing versions — the kernel's STRICT
 * policy (record.rs `ShotRecord::from_json`):
 * - `format_version` must equal FORMAT_VERSION exactly;
 * - when `expectedKernelVersion` is given (pass `engine.version()`),
 *   `kernel_version` must match it exactly — cross-version replay is not
 *   bit-reproducible (constitution P-III).
 * Throws RecordError with a clear message otherwise.
 */
export declare function parseShotRecord(json: string, expectedKernelVersion?: string): ShotRecord;
/** Walk a parsed record and verify EVERY field against the mirrored serde
 * shapes; throws RecordError naming the first drifted path. */
export declare function validateRecordShape(rec: Record<string, unknown>): ShotRecord;
/** Validate a SimOptions shape (shared with scenario parsing). */
export declare function validateOptionsShape(v: unknown, path: string): void;
