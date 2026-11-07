// Copyright (c) Meta Platforms, Inc. and affiliates.
/** All MotionState values, in the kernel's declaration order. */
export const MOTION_STATES = [
    'Stationary', 'Spinning', 'Sliding', 'Rolling', 'Airborne', 'Pocketed',
];
/** The kernel's default ball parameters (params.rs `BallParams::default`),
 * mirrored for scenario construction. r = 0.028575 m (57.15 mm US ball). */
export function defaultBallParams() {
    const r = 0.028575;
    return {
        m: 0.170097,
        r,
        u_s: 0.2,
        u_r: 0.01,
        u_sp: (10 * 2) / 5 / 9 * r,
        e_b: 0.95,
        e_c: 0.85,
        f_c: 0.2,
        e_t: 0.5,
    };
}
