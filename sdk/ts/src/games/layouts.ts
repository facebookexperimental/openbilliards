// Copyright (c) Meta Platforms, Inc. and affiliates.

// games/layouts.ts — kernel-mirror layout data for the feature-012
// disciplines (data-model.md §2; the single TS source for HUD markers,
// renderer decals and the respot geometry in rules/respot.ts).
//
// The DATA below hand-mirrors the kernel constants in
// crates/pool-core/src/rack.rs (SNOOKER_* / CAROM_*) and is DRIFT-TESTED
// against the canonical wasm's own `new_rack_scenario('snooker'|'carom')`
// output in test/layouts.test.ts — the kernel stays the single source of
// truth; this mirror exists so pure geometry (respot plans, D clamps,
// decals) needs no instantiated engine.
//
// Coordinate frame: kernel table frame — origin at table centre, +y toward
// the top (foot) cushion, metres.
//
// OWNERSHIP: leaf module — deep-imported (web/dist/pool-sdk/games/
// layouts.js), NOT exported from the frozen SDK barrel.

export interface LayoutSpotXY { x: number; y: number }

/** Snooker colour ball ids (feature 012 frozen ids: cue 0, reds 1–15,
 * yellow 16, green 17, brown 18, blue 19, pink 20, black 21). */
export type ColourId = 16 | 17 | 18 | 19 | 20 | 21;

/** Point value of a colour (WPBSA Sec3 R1(a): yellow 2 … black 7). */
export function colourValue(id: ColourId): number {
  return id - 14;
}

export interface SnookerLayout {
  /** Playing area (WPBSA Sec1 R1(a): 3.569 × 1.778 m ±13 mm). */
  table: { length: number; width: number };
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
export const SNOOKER_LAYOUT: SnookerLayout = Object.freeze({
  table: Object.freeze({ length: 3.569, width: 1.778 }),
  ballR: 0.02625,
  baulkY: -1.0475,
  dRadius: 0.292,
  spots: Object.freeze({
    16: Object.freeze({ x: 0.292, y: -1.0475 }),  // yellow — right D corner
    17: Object.freeze({ x: -0.292, y: -1.0475 }), // green — left D corner
    18: Object.freeze({ x: 0, y: -1.0475 }),      // brown — baulk centre
    19: Object.freeze({ x: 0, y: 0 }),            // blue — table centre
    20: Object.freeze({ x: 0, y: 0.89225 }),      // pink — mid centre→top
    21: Object.freeze({ x: 0, y: 1.4605 }),       // black — 324 mm off top
  }),
  cueDefault: Object.freeze({ x: 0.146, y: -1.0475 }),
  cite: 'WPBSA Official Rules of Snooker (Revised Sep 2024) Sec1 R1(d)-(f)',
});

export interface CaromLayout {
  /** Playing area (UMB Art 11.4: 2.84 × 1.42 m ±5 mm). */
  table: { length: number; width: number };
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
export const CAROM_LAYOUT: CaromLayout = Object.freeze({
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
