// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Rack template ids (frozen union, contracts/game-catalog.md; additive
 * growth only — feature 025 appends `fourteenone_wpa`). */
export type RackTemplateId = 'nine_standard' | 'eight_wpa' | 'snooker_wpbsa' | 'carom_umb' | 'one_pocket_wpa' | 'fourteenone_wpa' | 'ten_wpa' | 'heyball_wpa';
export interface RackTemplate {
    id: RackTemplateId;
    /** Kernel `new_rack_scenario` kind ('snooker'/'carom' since feature
     * 012 — contracts/equipment-additions.md §3; 'ten' since feature 026,
     * GH-343). */
    kernel_kind: 'nine' | 'ten' | 'fifteen' | 'snooker' | 'carom';
    cite: string;
    /** Mandated ball id -> lattice slot index, in KERNEL OFFSETS ORDER (the
     * scenario's rack-ball array order; equivalently sorted by row y
     * ascending then x ascending — pinned by games.test.ts against a real
     * kernel scenario). */
    fixed: Record<number, number>;
    /** WPA 4.2 corner rule: the two rear-corner slots receive one seeded
     * solid (1-7) and one seeded stripe (9-15), seeded side assignment. */
    corner_groups?: ['solids', 'stripes'];
    shuffle: 'seeded' | 'none';
}
/** Thrown on template/scenario mismatches (programming errors, not game
 * outcomes). */
export declare class RackTemplateError extends Error {
    name: string;
}
/** Kernel-backed templates. Since feature 012 (T021) `snooker_wpbsa` and
 * `carom_umb` RESOLVE to the kernel's new `'snooker'`/`'carom'` layouts
 * (crates/pool-core/src/rack.rs; contracts/equipment-additions.md §3):
 * both are pure identities on the kernel scenario — snooker reds are
 * interchangeable and the colours are FIXED spots (shuffle 'none'), carom
 * ball ids are role-mandated (0 breaker / 1 opponent / 2 red). */
export declare const RACK_TEMPLATES: readonly RackTemplate[];
/** Racking-rule cites for ALL template ids, including the two that do not
 * resolve to a kernel lattice yet (readiness declarations). */
export declare const RACK_TEMPLATE_CITES: Readonly<Record<RackTemplateId, string>>;
/** Template lookup; undefined for ids without a kernel-backed lattice
 * (none since feature 012 — every declared template now resolves). */
export declare function resolveRackTemplate(id: string): RackTemplate | undefined;
/** Non-cue ball count per kernel rack kind (ball id 0 excluded; matches
 * the GameCatalog `ball_count` domain — validator V7). */
export declare const KERNEL_KIND_RACK_BALLS: Readonly<Record<RackTemplate['kernel_kind'], number>>;
/**
 * Apply a rack template to a kernel rack scenario: renumber object-ball
 * IDS by a pure seeded permutation (splitmix64 keyed by `rackSeed`);
 * POSITIONS, params, topology and the cue ball are untouched.
 *
 * - `shuffle: 'none'` with no fixed slots (nine_standard) returns
 *   `scenarioJson` UNCHANGED byte-for-byte (FR-003: 9-ball scenarios are
 *   byte-identical to today's).
 * - `eight_wpa` (WPA 4.2): 8 on the row-3 center slot; the two rear-corner
 *   slots get one seeded solid (1-7) and one seeded stripe (9-15) with a
 *   seeded side assignment; the remaining 12 ids (apex included — 4.2 does
 *   not mandate the 1 at the apex) are a seeded Fisher-Yates shuffle
 *   ("without purposeful or intentional pattern").
 *
 * Same `rackSeed` ⇒ same permutation on every platform. The kernel is a
 * pure function of the resulting scenario, so re-simulation byte-matches.
 */
export declare function applyRackTemplate(template: RackTemplate, scenarioJson: string, rackSeed: number): string;
