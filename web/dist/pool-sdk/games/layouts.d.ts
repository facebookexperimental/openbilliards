// Copyright (c) Meta Platforms, Inc. and affiliates.

export interface LayoutSpotXY {
    x: number;
    y: number;
}
/** Snooker colour ball ids (feature 012 frozen ids: cue 0, reds 1–15,
 * yellow 16, green 17, brown 18, blue 19, pink 20, black 21). */
export type ColourId = 16 | 17 | 18 | 19 | 20 | 21;
/** Point value of a colour (WPBSA Sec3 R1(a): yellow 2 … black 7). */
export declare function colourValue(id: ColourId): number;
export interface SnookerLayout {
    /** Playing area (WPBSA Sec1 R1(a): 3.569 × 1.778 m ±13 mm). */
    table: {
        length: number;
        width: number;
    };
    /** Snooker ball radius [m] (WPBSA Sec1 R2: 52.5 mm diameter). */
    ballR: number;
    /** Baulk-line y (Sec1 R1(d): 737 mm from the bottom cushion face). */
    baulkY: number;
    /** Radius of the "D" (Sec1 R1(e): 292 mm, centred on the baulk line). */
    dRadius: number;
    /** The six colour spots by ball id (Sec1 R1(d)–(f)). */
    spots: Readonly<Record<ColourId, LayoutSpotXY>>;
    /** Default cue address in the D (kernel scenario starting point; the
     * actual break placement is a player right — Sec3 R5, Sec2 R9). */
    cueDefault: LayoutSpotXY;
    cite: string;
}
/** WPBSA 12-ft snooker layout — mirror of the kernel `SNOOKER_*`
 * constants (rack.rs), drift-tested. */
export declare const SNOOKER_LAYOUT: SnookerLayout;
export interface CaromLayout {
    /** Playing area (UMB Art 11.4: 2.84 × 1.42 m ±5 mm). */
    table: {
        length: number;
        width: number;
    };
    /** Carom ball radius [m] (UMB Art 12.2: 61.5 mm diameter). */
    ballR: number;
    /** The three respot spots (Art 11.6/22): red → top, breaker → bottom,
     * opponent → centre (Art 27.3(b)/28.1(b) respot designations). */
    spots: Readonly<{
        top: LayoutSpotXY;
        centre: LayoutSpotXY;
        bottom: LayoutSpotXY;
    }>;
    /** Start-spot lateral offset (USBA table-markings diagram: 18.25 cm
     * either side of the bottom spot — the documented numeric SECONDARY;
     * UMB Planches A–L are missing from every public copy). */
    startOffsetX: number;
    cite: string;
}
/** UMB 2.84 m carom layout — mirror of the kernel `CAROM_*` constants
 * (rack.rs), drift-tested. Ball ids: 0 breaker-white, 1 opponent (yellow
 * visual), 2 red. */
export declare const CAROM_LAYOUT: CaromLayout;
