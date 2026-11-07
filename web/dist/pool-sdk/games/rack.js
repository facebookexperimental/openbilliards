// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Thrown on template/scenario mismatches (programming errors, not game
 * outcomes). */
export class RackTemplateError extends Error {
    name = 'RackTemplateError';
}
/** Row-3 center slot of the fifteen lattice (kernel offsets order: rows
 * k = 0..4, j = 0..k; slot 4 = k=2, j=1). WPA 4.2: the 8 racks here. */
const FIFTEEN_CENTER_SLOT = 4;
/** Triangle-centre slot of the TEN lattice (kernel offsets order: rows
 * k = 0..3, j = 0..k; slot 4 = k=2, j=1 — the same lattice index as the
 * fifteen centre). WPA 6.2: the 10 racks here. */
const TEN_CENTER_SLOT = 4;
/** Apex slot (row k=0) — WPA 6.2 mandates the 1 at the apex. */
const TEN_APEX_SLOT = 0;
/** Rear-corner slots of the fifteen lattice (row k=4, j=0 and j=4). */
const FIFTEEN_REAR_CORNERS = [10, 14];
/** Kernel-backed templates. Since feature 012 (T021) `snooker_wpbsa` and
 * `carom_umb` RESOLVE to the kernel's new `'snooker'`/`'carom'` layouts
 * (crates/pool-core/src/rack.rs; contracts/equipment-additions.md §3):
 * both are pure identities on the kernel scenario — snooker reds are
 * interchangeable and the colours are FIXED spots (shuffle 'none'), carom
 * ball ids are role-mandated (0 breaker / 1 opponent / 2 red). */
export const RACK_TEMPLATES = Object.freeze([
    Object.freeze({
        id: 'nine_standard',
        kernel_kind: 'nine',
        cite: 'WPA Sec. 5 (9-ball diamond, 1 at the apex, 9 in the middle)',
        fixed: Object.freeze({}),
        shuffle: 'none',
    }),
    Object.freeze({
        id: 'eight_wpa',
        kernel_kind: 'fifteen',
        cite: 'WPA 4.2',
        fixed: Object.freeze({ 8: FIFTEEN_CENTER_SLOT }),
        corner_groups: ['solids', 'stripes'],
        shuffle: 'seeded',
    }),
    Object.freeze({
        id: 'one_pocket_wpa',
        kernel_kind: 'fifteen',
        cite: 'WPA 12.2',
        fixed: Object.freeze({}), // no mandated slots: "no pattern, no template"
        shuffle: 'seeded',
    }),
    Object.freeze({
        id: 'fourteenone_wpa',
        kernel_kind: 'fifteen',
        cite: 'WPA 7.2',
        // WPA 7.2 mandates NO ball order and no rack template — a free
        // seeded shuffle (the one_pocket_wpa precedent). The mid-game
        // 14-ball re-rack (apex vacant) is NOT a template concern: it is
        // executed by the adapter from the judged plan over this template's
        // lattice slots (rules/respot.ts fourteenOneRerackPlacements).
        fixed: Object.freeze({}),
        shuffle: 'seeded',
    }),
    Object.freeze({
        id: 'ten_wpa',
        kernel_kind: 'ten',
        cite: 'WPA 6.2',
        // WPA 6.2: 1 at the apex (on the foot spot), 10 in the middle of
        // the triangle; the other balls "without purposeful or intentional
        // pattern" — a seeded shuffle (the eight_wpa/one_pocket precedent).
        fixed: Object.freeze({ 1: TEN_APEX_SLOT, 10: TEN_CENTER_SLOT }),
        shuffle: 'seeded',
    }),
    Object.freeze({
        id: 'heyball_wpa',
        kernel_kind: 'fifteen',
        cite: 'WPA Heyball II.4',
        // WPA Heyball II.4 hard constraints match WPA 4.2's mechanics: the
        // 8 at the triangle centre, one solid and one stripe at the base
        // corners (seeded side assignment). The soft "other solid and
        // stripe balls should be separated as far as possible" pattern is
        // NOT enforced — the remaining 12 ids stay a seeded shuffle (the
        // eight_wpa mechanism; recorded as a coverage note in the GH-491
        // rulebook pin).
        fixed: Object.freeze({ 8: FIFTEEN_CENTER_SLOT }),
        corner_groups: ['solids', 'stripes'],
        shuffle: 'seeded',
    }),
    Object.freeze({
        id: 'snooker_wpbsa',
        kernel_kind: 'snooker',
        cite: 'WPBSA Official Rules (Rev. Sep 2024) Sec3 R2(a)(i)',
        fixed: Object.freeze({}), // reds interchangeable; colours fixed spots
        shuffle: 'none',
    }),
    Object.freeze({
        id: 'carom_umb',
        kernel_kind: 'carom',
        cite: 'UMB World Rules of Carom Billiard (1 Jan 1989) Art. 22/23',
        fixed: Object.freeze({}), // ids are role-mandated by the kernel layout
        shuffle: 'none',
    }),
]);
/** Racking-rule cites for ALL template ids, including the two that do not
 * resolve to a kernel lattice yet (readiness declarations). */
export const RACK_TEMPLATE_CITES = Object.freeze({
    nine_standard: 'WPA Sec. 5 (9-ball diamond, 1 at the apex, 9 in the middle)',
    eight_wpa: 'WPA 4.2',
    snooker_wpbsa: 'WPBSA Official Rules (Rev. Sep 2024) Sec3 R2(a)(i)',
    carom_umb: 'UMB World Rules of Carom Billiard (1 Jan 1989) Art. 22/23',
    one_pocket_wpa: 'WPA 12.2',
    fourteenone_wpa: 'WPA 7.2',
    ten_wpa: 'WPA 6.2',
    heyball_wpa: 'WPA Heyball II.4',
});
/** Template lookup; undefined for ids without a kernel-backed lattice
 * (none since feature 012 — every declared template now resolves). */
export function resolveRackTemplate(id) {
    return RACK_TEMPLATES.find((t) => t.id === id);
}
/** Non-cue ball count per kernel rack kind (ball id 0 excluded; matches
 * the GameCatalog `ball_count` domain — validator V7). */
export const KERNEL_KIND_RACK_BALLS = Object.freeze({
    nine: 9,
    ten: 10, // feature 026 (GH-343)
    fifteen: 15,
    snooker: 21, // reds 1-15 + colours 16-21
    carom: 2, // opponent ball + red (ball 0 is the breaker's cue)
});
// ---- seeded integer-only mixer (splitmix64) ---------------------------------
const U64 = 0xffffffffffffffffn;
/** splitmix64 stream over BigInt — integer-only arithmetic, no
 * Math.random, bit-identical on every platform (FR-005/FR-011). */
function splitmix64(seed) {
    if (!Number.isSafeInteger(seed) || seed < 0) {
        throw new RackTemplateError(`rack seed must be a non-negative safe integer, got ${seed}`);
    }
    let state = BigInt(seed) & U64;
    return () => {
        state = (state + 0x9e3779b97f4a7c15n) & U64;
        let z = state;
        z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
        z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64;
        return (z ^ (z >> 31n)) & U64;
    };
}
/** Next integer in [0, n) from the stream (n <= 15 here: the 2^64 % n
 * modulo bias is ~1e-18 — irrelevant, and determinism is what matters). */
const below = (next, n) => Number(next() % BigInt(n));
// ---- the permutation ---------------------------------------------------------
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
export function applyRackTemplate(template, scenarioJson, rackSeed) {
    if (template.shuffle === 'none' && Object.keys(template.fixed).length === 0) {
        return scenarioJson; // identity — byte-frozen 9-ball path
    }
    const scenario = JSON.parse(scenarioJson);
    const balls = scenario.system?.balls;
    if (!Array.isArray(balls)) {
        throw new RackTemplateError('scenario has no system.balls');
    }
    const rackBalls = balls.filter((b) => b.id !== 0);
    const n = KERNEL_KIND_RACK_BALLS[template.kernel_kind];
    if (rackBalls.length !== n) {
        throw new RackTemplateError(`template '${template.id}' expects ${n} rack balls, got ${rackBalls.length}`);
    }
    // slots in kernel offsets order = the scenario's rack-ball ARRAY order
    // (new_rack_scenario emits the lattice row by row, apex first — pinned
    // by games.test.ts against a real kernel scenario). Do NOT sort by
    // (y, x): the kernel's seeded BACK-ROW MICRO-GAPS (rack.rs
    // DEFAULT_FROZEN_FRACTION, break-physics fix) jitter rear-row balls by
    // 0.05–0.5 mm along the apex ray, so a coordinate sort can move a rear
    // CORNER ball off its slot index (feature-011 game/flow lane finding:
    // on seed-1 racks the corner-group pair landed mid-row and both
    // geometric corners came up stripes — a WPA 4.2 violation).
    const slots = rackBalls;
    const next = splitmix64(rackSeed);
    const assigned = new Map(); // slot index -> new ball id
    const used = new Set();
    for (const [idStr, slot] of Object.entries(template.fixed)) {
        const id = Number(idStr);
        assigned.set(slot, id);
        used.add(id);
    }
    if (template.corner_groups) {
        const solid = 1 + below(next, 7); // 1..7
        const stripe = 9 + below(next, 7); // 9..15
        if (used.has(solid) || used.has(stripe)) {
            throw new RackTemplateError(`template '${template.id}' fixes a corner-group ball`);
        }
        const [c1, c2] = FIFTEEN_REAR_CORNERS;
        const swap = below(next, 2) === 1;
        assigned.set(swap ? c2 : c1, solid);
        assigned.set(swap ? c1 : c2, stripe);
        used.add(solid);
        used.add(stripe);
    }
    const restIds = [];
    for (let id = 1; id <= n; id++)
        if (!used.has(id))
            restIds.push(id);
    if (template.shuffle === 'seeded') {
        for (let i = restIds.length - 1; i > 0; i--) { // Fisher-Yates
            const j = below(next, i + 1);
            [restIds[i], restIds[j]] = [restIds[j], restIds[i]];
        }
    }
    let k = 0;
    for (let slot = 0; slot < slots.length; slot++) {
        if (!assigned.has(slot))
            assigned.set(slot, restIds[k++]);
    }
    slots.forEach((ball, slot) => { ball.id = assigned.get(slot); });
    return JSON.stringify(scenario);
}
