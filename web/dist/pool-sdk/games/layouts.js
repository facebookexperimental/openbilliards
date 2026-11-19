// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Point value of a colour (WPBSA Sec3 R1(a): yellow 2 … black 7). */
export function colourValue(id) {
    return id - 14;
}
/** WPBSA 12-ft snooker layout — mirror of the kernel `SNOOKER_*`
 * constants (rack.rs), drift-tested. */
export const SNOOKER_LAYOUT = Object.freeze({
    table: Object.freeze({ length: 3.569, width: 1.778 }),
    ballR: 0.02625,
    baulkY: -1.0475,
    dRadius: 0.292,
    spots: Object.freeze({
        16: Object.freeze({ x: 0.292, y: -1.0475 }), // yellow — right D corner
        17: Object.freeze({ x: -0.292, y: -1.0475 }), // green — left D corner
        18: Object.freeze({ x: 0, y: -1.0475 }), // brown — baulk centre
        19: Object.freeze({ x: 0, y: 0 }), // blue — table centre
        20: Object.freeze({ x: 0, y: 0.89225 }), // pink — mid centre→top
        21: Object.freeze({ x: 0, y: 1.4605 }), // black — 324 mm off top
    }),
    cueDefault: Object.freeze({ x: 0.146, y: -1.0475 }),
    cite: 'WPBSA Official Rules of Snooker (Revised Sep 2024) Sec1 R1(d)-(f)',
});
/** UMB 2.84 m carom layout — mirror of the kernel `CAROM_*` constants
 * (rack.rs), drift-tested. Ball ids: 0 breaker-white, 1 opponent (yellow
 * visual), 2 red. */
export const CAROM_LAYOUT = Object.freeze({
    table: Object.freeze({ length: 2.84, width: 1.42 }),
    ballR: 0.03075,
    spots: Object.freeze({
        top: Object.freeze({ x: 0, y: 0.71 }),
        centre: Object.freeze({ x: 0, y: 0 }),
        bottom: Object.freeze({ x: 0, y: -0.71 }),
    }),
    startOffsetX: 0.1825,
    cite: 'UMB World Rules of Carom Billiard (1 Jan 1989) Art 11.6/22/23; '
        + 'USBA table-markings diagram (numeric secondary)',
});
