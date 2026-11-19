// Copyright (c) Meta Platforms, Inc. and affiliates.
// games/catalog.ts — the GameCatalog: the versioned, provenance-first
// registry of playable/authorable disciplines (feature 011,
// contracts/game-catalog.md — FROZEN schema & semantics). Mirrors the
// equipment catalog's philosophy (../catalog.ts): entries are immutable
// once shipped (corrections get NEW ids), every entry carries a pinned
// rulebook citation, and validation REJECTS citation-less entries — there
// is deliberately no `Estimated` tier here (research.md R3: "an entry
// without a real reference has no reason to exist").
//
// The catalog is DECLARATIVE about the rules; the ruleset TRANSCRIBES them
// (no interpreter, constitution P-VII / research.md R2). No kernel twin
// exists or may be added: games are control-layer data, pool-core stays
// game-agnostic (FR-007, research.md R5).
//
// OWNERSHIP: leaf module — deep-imported (web/dist/pool-sdk/games/*.js),
// NOT exported from the frozen SDK barrel. Rulebook edition pins:
// research.md R1 (all cites use the CURRENT WPA renumbering — 8-Ball is
// Section 4, shared fouls Section 3; legacy 2016 numbering is obsolete).
import { catalogEntry } from '../catalog.js';
import { KERNEL_KIND_RACK_BALLS, resolveRackTemplate } from './rack.js';
/** Registered ruleset ids — a LOCAL mirror of rules/index.ts RULESET_IDS,
 * kept runtime-import-free ON PURPOSE: this module rides the app BOOT
 * graph (pool-sdk/share.js imports it for codec-v4 validation), and a new
 * named runtime import from the SHIPPED rules/index.js would be exactly
 * the stale-cache poisoning that ownership-ledger rule 5 forbids (the
 * RulesetId import above is type-only and erased). games.test.ts pins this
 * mirror against the live registry. */
const REGISTERED_RULESETS = Object.freeze([
    'nineball-v1', 'eightball-v1',
    // feature 012 T048: the three story-lane rulesets are registered
    // (rules/index.ts RULESET_IDS mirrors) — the readiness flips below
    // ride the same commit as their games.test.ts drift pins.
    'onepocket-v1', 'snooker-v1', 'carom3c-v1',
    // feature 025 (issue #65): 14.1 continuous — registered in
    // rules/index.ts in the same commit as this mirror row.
    'fourteenone-v1',
    // feature 026 (GH-343): 10-ball — registered in rules/index.ts in
    // the same commit as this mirror row.
    'tenball-v1',
    // GH-491 (build 18): heyball — registered in rules/index.ts in the
    // same commit as this mirror row.
    'heyball-v1',
]);
/** Thrown on unknown ids and on every validation rejection (V1-V8). */
export class GameCatalogError extends Error {
    name = 'GameCatalogError';
}
/** All visible (non-ui_hidden) pool tables of the equipment catalog —
 * the pool table class for 9-ball / 8-ball (one-pocket reuses it). The
 * ui_hidden legacy `wpa_generic_9ft` stays out: it resolves for legacy
 * share links but is not a pickable class member. Catalog v18 (GH-621)
 * widened the class from 9-ft only to the Diamond Pro-Am 8-ft and 7-ft
 * size variants — same discipline, same 57.15 mm sets, smaller bed; the
 * constant keeps its historical name. Catalog v20 (#789): each old
 * entry's slot carries its neutral twin; the old ids are ui_hidden
 * resolve-only rename aliases (V4 refuses them here) and stay out like
 * `wpa_generic_9ft`. */
const POOL_9FT_TABLES = Object.freeze([
    'wpa_spec_9ft', 'pool_pro_9ft_older_gen', 'pool_pro_9ft',
    'pool_pro_9ft_metal_rim',
    // Catalog v18 (GH-621): the Diamond Pro-Am size variants — the 9-ft
    // pocket furniture (kernel spec by struct update) on the official
    // 90x45 in and 80x40 in beds. Every non-ui_hidden table must be
    // selectable for some game; the pool disciplines are theirs.
    'pool_pro_8ft', 'pool_pro_7ft',
    // FR-015 (feature 012 T048): the Chinese eight-ball table is selectable
    // as equipment for the POOL disciplines (8-ball, 9-ball, one-pocket)
    // with the standard 57.15 mm sets — pool-scale footprint, snooker-style
    // curved pockets. Catalog v15 (GH-490): the class is the de-branded
    // chinese8_pro_9ft entry on the repinned 2540x1260 mm surface (the
    // manufacturer's own site + WPA Heyball agree at 1260); the v6
    // joy_q8_9ft id stays OUT of the class as a ui_hidden resolve-only
    // alias — it resolves for legacy share links/replays exactly like
    // wpa_generic_9ft. The Heyball RULESET is its own lane (GH-491): when
    // it lands, it pairs with THIS id, never the alias.
    'chinese8_pro_9ft',
    // Catalog v8 Measured tier, served since v20 as the neutral twin
    // pool_pro_9ft_measured: a pool tournament 9-ft measured first-hand
    // (geometry reuses diamond_proam_9ft, confirmed by the session's
    // sight-grid homography at 0.33-0.38 mm RMS;
    // provenance: docs/verification/pool-9ft-measured-calibration.md).
    // Every non-ui_hidden table must be selectable for some game — this
    // class membership is what makes the entry reachable in the web app
    // (settings picker + ?table= boot; scene render: the
    // diamond_proam_9ft spec, which web/scene/table.js aliases).
    'pool_pro_9ft_measured',
    // Catalog v18 (Rasson lane OX-A1, GH-641): the Rasson OX gen-1 9-ft on
    // the manufacturer's retail 114 / 127 mm cut — a pool-scale 2540x1270 mm
    // surface, selectable for the POOL disciplines like every visible 9-ft
    // entry. Class membership is what makes it reachable (legalTableIds /
    // changeEquipment refuse a visible table absent from this list — review
    // round 12 P1 on PR #642).
    'pool_pro_9ft_k55',
]);
const WPA_2025 = Object.freeze({
    body: 'WPA',
    rulebook: 'Rules of Play',
    edition: 'effective 2025-09-15',
    url: 'https://wpapool.com/rules-of-play/',
    sections: '', // per-entry override below (frozen shape keeps it a string)
});
/** The shipped catalog — the 5-entry content freeze of
 * contracts/game-catalog.md: the two feature-011 playable entries (trunk,
 * T005) plus the three former `config_ready` readiness entries
 * (catalog-data lane, T027-T029) FLIPPED to `playable` by feature 012
 * T048 (research.md R12): their rulesets registered (US1-US3 story
 * lanes), their tables shipped (equipment catalog v6), their rack
 * templates resolve (T021), so every prerequisite is met and the
 * inventory lists are now empty. */
export const GAME_CATALOG = Object.freeze([
    Object.freeze({
        id: 'nine_ball',
        display_name: '9-Ball',
        discipline_family: 'pool',
        provenance: Object.freeze({
            ...WPA_2025,
            sections: 'Sec. 5 (9-Ball); Sec. 3 (3.1-3.16) fouls; 1.6 ball in hand',
        }),
        readiness: 'playable',
        ball_count: 9,
        ballset_ids: ['pool_standard', 'pool_used'],
        table_class: Object.freeze({ kind: 'catalog', table_ids: [...POOL_9FT_TABLES] }),
        rack_template: 'nine_standard',
        break_requirements: Object.freeze({
            text: 'Cue ball in hand behind the head string; judged like any other '
                + 'shot in v1 (the dry-break rail requirement is a documented v1 '
                + 'simplification — sdk/ts/src/rules/nineball.ts header).',
            cite: 'WPA Sec. 5',
        }),
        legal_shot: Object.freeze({
            text: 'First contact must be the lowest-numbered ball on the table; '
                + 'afterwards any ball must be pocketed or any ball must reach a '
                + 'rail.',
            cite: 'WPA Sec. 5; 3.2, 3.3',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'scratch', cite: 'WPA 3.1', detection: 'events' }),
            Object.freeze({ code: 'no-contact', cite: 'WPA 3.3', detection: 'events' }),
            Object.freeze({ code: 'wrong-first-ball', cite: 'WPA 3.2', detection: 'events' }),
            Object.freeze({ code: 'no-rail-after-contact', cite: 'WPA 3.3', detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'Legally pocketing the 9 wins the rack (combinations count; the '
                + '9 need not be the first ball contacted).',
            cite: 'WPA Sec. 5',
        }),
        respot_rules: Object.freeze({
            text: 'Only the 9 is respotted (foot spot, long-string occlusion '
                + 'fallback) when pocketed on a foul or driven off the table.',
            cite: 'WPA Sec. 5',
        }),
        turn_rotation: Object.freeze({
            text: 'Shooter continues after legally pocketing a ball; the turn '
                + 'passes on a legal dry shot; any foul gives the opponent cue ball '
                + 'in hand anywhere.',
            cite: 'WPA Sec. 5; 1.6',
        }),
        call_shot: null,
        ruleset_id: 'nineball-v1',
        prerequisites: [],
    }),
    Object.freeze({
        id: 'eight_ball',
        display_name: '8-Ball',
        discipline_family: 'pool',
        provenance: Object.freeze({
            ...WPA_2025,
            sections: 'Sec. 4 (4.1-4.11); Sec. 3 (3.1-3.16) fouls; 1.6; 1.7; 1.13',
        }),
        readiness: 'playable',
        ball_count: 15,
        ballset_ids: ['pool_standard', 'pool_used'],
        table_class: Object.freeze({ kind: 'catalog', table_ids: [...POOL_9FT_TABLES] }),
        rack_template: 'eight_wpa',
        break_requirements: Object.freeze({
            text: 'Cue ball in hand behind the head string; no call on the break; '
                + 'a dry break must drive at least four object balls to a rail, '
                + 'else the incoming player has the three-way option (accept / '
                + 're-rack and break / re-rack, offender re-breaks). Break fouls '
                + 'give ball in hand behind the head string only.',
            cite: 'WPA 4.3(a)-(d),(g),(h)',
        }),
        legal_shot: Object.freeze({
            text: 'First contact must be a ball of the shooter’s group (any '
                + 'ball except the 8 while the table is open, unless a whole group '
                + 'was pocketed); after contact a ball must reach a rail or be '
                + 'pocketed; every non-break, non-safety shot carries an explicit '
                + 'ball + pocket call.',
            cite: 'WPA 4.4-4.6; 1.7; 3.2, 3.3',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'scratch', cite: 'WPA 3.1 via 4.9', detection: 'events' }),
            Object.freeze({ code: 'no-contact', cite: 'WPA 3.3 via 4.9', detection: 'events' }),
            Object.freeze({ code: 'wrong-first-ball', cite: 'WPA 3.2 via 4.4/4.9', detection: 'events' }),
            Object.freeze({ code: 'no-rail-after-contact', cite: 'WPA 3.3 via 4.9', detection: 'events' }),
            Object.freeze({ code: 'ball-off-table', cite: 'WPA 3.5 via 4.9', detection: 'events' }),
            Object.freeze({ code: 'bad-break', cite: 'WPA 4.3(d)', detection: 'events' }),
            // GH-371 (kitchen_rule axis, eightball-v2): the WPA 3.11 pair
            Object.freeze({ code: 'bad-kitchen-shot', cite: 'WPA 3.11 via 4.9', detection: 'events' }),
            Object.freeze({ code: 'kitchen-no-exit', cite: 'WPA 3.11 via 4.9', detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'Pocket the 8 in a called pocket after clearing the shooter’s '
                + 'group; the rack is lost on 8-with-foul, early 8, 8 in the wrong '
                + 'pocket, or 8 off the table.',
            cite: 'WPA Sec. 4 intro; 4.6; 4.8(a)-(d)',
        }),
        respot_rules: Object.freeze({
            text: 'Only the 8 is ever spotted (8-on-break option paths; foot spot '
                + 'with long-string occlusion fallback).',
            cite: 'WPA 4.7',
        }),
        turn_rotation: Object.freeze({
            text: 'Shooter continues after legally pocketing a called ball; '
                + 'otherwise the turn passes; standard fouls give ball in hand '
                + 'anywhere (three-foul rule explicitly excluded).',
            cite: 'WPA 4.5, 4.9; 3.13 self-exclusion',
        }),
        call_shot: Object.freeze({
            text: 'Explicit ball + pocket nomination before every non-break shot '
                + '(strictest 1.7 reading); safety calls supported — '
                + 'safety-pocketed balls stay down.',
            cite: 'WPA 4.6 via 1.7',
        }),
        ruleset_id: 'eightball-v1',
        prerequisites: [],
    }),
    // ---- readiness entries (config_ready — research.md R8 resolution table) ----
    Object.freeze({
        id: 'snooker',
        display_name: 'Snooker',
        discipline_family: 'snooker',
        provenance: Object.freeze({
            body: 'WPBSA',
            rulebook: 'Official Rules of the Games of Snooker and English Billiards',
            edition: 'Official World Rules Revised September 2024 (Rulebook 2024-25)',
            url: 'https://wpbsa.com/rules/',
            sections: 'Sec1 R1 (table), R2 (balls); Sec3 R1(a) (values), '
                + 'R2(a)(i) (rack), R7 (respot), R11 (penalties), R17 (stalemate)',
        }),
        readiness: 'playable', // feature 012 T048: US2 suite green — flip
        ball_count: 21, // 15 reds + 6 colours
        ballset_ids: ['snooker'], // resolves: 52.5 mm Mathavan-cited set
        table_class: Object.freeze({
            // WPBSA Sec1 R1: playing surface 3569 x 1778 mm (+/-13 mm) —
            // resolves since equipment catalog v6 (012 trunk T017/T027) shipped
            // the 12-ft snooker geometry.
            kind: 'catalog', table_ids: ['wpbsa_snooker_12ft'],
        }),
        rack_template: 'snooker_wpbsa', // resolves since 012 T021 (kernel 'snooker' layout)
        break_requirements: Object.freeze({
            text: 'Frame opens with the striker playing from in-hand; the reds '
                + 'are racked as a triangle behind the pink (apex ball as close to '
                + 'the pink as possible without touching — pink-spot clearance) '
                + 'and the six colours stand on their own spots.',
            cite: 'WPBSA Sec3 R2(a)(i)',
        }),
        legal_shot: Object.freeze({
            text: 'First contact must be a ball on: while reds remain the ball '
                + 'on alternates between a red and a nominated colour; after the '
                + 'last red the colours are on in ascending value order.',
            cite: 'WPBSA Sec3 R1(a); Sec3 R11',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'ball-not-on-first', cite: 'WPBSA Sec3 R11',
                detection: 'events' }),
            Object.freeze({ code: 'cue-ball-pocketed', cite: 'WPBSA Sec3 R11',
                detection: 'events' }),
            Object.freeze({ code: 'ball-off-table', cite: 'WPBSA Sec3 R11',
                detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'Scoring strokes score the value of the ball potted (red 1, '
                + 'yellow 2, green 3, brown 4, blue 5, pink 6, black 7); penalty '
                + 'points score to the opponent; the frame is won on points.',
            cite: 'WPBSA Sec3 R1(a); Sec3 R11',
        }),
        respot_rules: Object.freeze({
            text: 'Colours pocketed (or forced off the table) are respotted on '
                + 'their own spots while reds remain and until the final '
                + 'ascending-order sequence; occupied spots follow the spotting '
                + 'precedence. Reds are never respotted.',
            cite: 'WPBSA Sec3 R7',
        }),
        turn_rotation: Object.freeze({
            text: 'The striker continues while making scoring strokes; the turn '
                + 'passes on a non-scoring stroke or a foul (penalty points to the '
                + 'opponent); a stalemated frame is re-racked.',
            cite: 'WPBSA Sec3 R1(a); Sec3 R11; Sec3 R17',
        }),
        call_shot: Object.freeze({
            text: 'After potting a red the striker nominates the colour on '
                + '(declared whenever it is not obvious).',
            cite: 'WPBSA Sec2 (nominated ball); Sec3 R1(a)',
        }),
        // feature 012 T048 (US2 flip): every T027-era prerequisite is now MET —
        // wpbsa_snooker_12ft (equipment v6), snooker_wpbsa lattice (T021),
        // snooker-v1 (US2 story lane), snooker scoreboard HUD (T039).
        ruleset_id: 'snooker-v1',
        prerequisites: [],
    }),
    Object.freeze({
        id: 'carom_3cushion',
        display_name: 'Three-Cushion Carom',
        discipline_family: 'carom',
        provenance: Object.freeze({
            body: 'UMB',
            rulebook: 'World Rules of Carom Billiard',
            edition: 'edition of 1 January 1989 (in force since then, Art. 92.1); '
                + 'format complement: World Cup 3-Cushion Rules, 15.12.2025',
            url: 'https://files.umb-carom.org/Public/Rules/CAROM%20BILLIARD%20RULES.pdf',
            sections: 'Art. 11.4 (table); Art. 12.2 (balls); Art. 22/23 (break); '
                + 'Art. 24 (cannon); Art. 27.3(b)/28.1(b) (respot); '
                + 'Art. 83 (three-cushion)',
        }),
        readiness: 'playable', // feature 012 T048: US3 suite green — flip
        ball_count: 2, // object balls: the red + the opponent cue ball
        ballset_ids: ['carom'], // resolves: 61.5 mm set (UMB Art. 12.2 norm)
        table_class: Object.freeze({
            // UMB Art. 11.4: pocketless heated table, playing surface
            // 2.84 x 1.42 m (+/-5 mm) — resolves since equipment catalog v6
            // (012 trunk T017/T027) shipped the first pocketless geometry.
            kind: 'catalog', table_ids: ['umb_carom_284'],
        }),
        rack_template: 'carom_umb', // resolves since 012 T021 (kernel 'carom' layout)
        break_requirements: Object.freeze({
            text: 'Opening stroke from the prescribed break-spot layout (both '
                + 'cue balls and the red on their spots); the red must be the '
                + 'first ball struck on the break.',
            cite: 'UMB Art. 22/23',
        }),
        legal_shot: Object.freeze({
            text: 'A point requires a cannon — the cue ball contacts both other '
                + 'balls — with the cue ball touching at least three cushions '
                + 'before the cannon is completed (three-cushion discipline).',
            cite: 'UMB Art. 24; Art. 83',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'ball-off-table', cite: 'UMB Art. 27.3(b) (respot)',
                detection: 'events' }),
            // GH-371 (Amendment A5): playing directly a cushion the cue ball
            // is frozen to ("balls in contact")
            Object.freeze({ code: 'frozen-cushion-play', cite: 'UMB Art 27.2/41.8',
                detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'One point per valid three-cushion cannon; the striker '
                + 'continues while scoring. Match distance / set format per the '
                + 'World Cup rules complement.',
            cite: 'UMB Art. 24; Art. 83; World Cup 3-Cushion Rules (15.12.2025)',
        }),
        respot_rules: Object.freeze({
            text: 'Balls forced off the table and frozen-ball situations are '
                + 'resolved by respotting on the prescribed spots.',
            cite: 'UMB Art. 27.3(b); Art. 28.1(b)',
        }),
        turn_rotation: Object.freeze({
            text: 'Innings alternate when the striker fails to score; each valid '
                + 'cannon continues the inning.',
            cite: 'UMB Art. 24',
        }),
        call_shot: null,
        // feature 012 T048 (US3 flip): every T028-era prerequisite is now MET —
        // umb_carom_284 (equipment v6), carom_umb spots (T021), carom3c-v1
        // (US3 story lane), points/innings/cushions HUD (T045).
        ruleset_id: 'carom3c-v1',
        prerequisites: [],
    }),
    Object.freeze({
        id: 'one_pocket',
        display_name: 'One-Pocket',
        discipline_family: 'pool',
        provenance: Object.freeze({
            // Primary: the WPA text (world governing body). Secondary authority
            // recorded per research.md R1: OnePocket.org Official Rules, adopted
            // 2021-10-09 (https://www.onepocket.org/rules/) — divergences noted
            // in turn_rotation below.
            ...WPA_2025,
            sections: 'Sec. 12 (12.1-12.11); fouls via Sec. 3 (12.8/12.9); '
                + 'secondary: OnePocket.org Official Rules, adopted 2021-10-09',
        }),
        readiness: 'playable', // feature 012 T048: US1 suite green — flip
        ball_count: 15,
        ballset_ids: ['pool_standard', 'pool_used'],
        table_class: Object.freeze({ kind: 'catalog', table_ids: [...POOL_9FT_TABLES] }),
        rack_template: 'one_pocket_wpa', // resolves: fifteen lattice, free seeded shuffle (WPA 12.2)
        break_requirements: Object.freeze({
            text: 'Before the break each player is assigned one of the two foot '
                + 'corner pockets (the breaker chooses); cue ball in hand behind '
                + 'the head string; balls count only in the shooter’s own pocket.',
            cite: 'WPA 12.3',
        }),
        legal_shot: Object.freeze({
            text: 'No rotation or group order — any object ball may be contacted '
                + 'first; the shared shot fouls of Sec. 3 (scratch, no rail after '
                + 'contact, ball off table) apply via 12.8.',
            cite: 'WPA 12.8 via 3.1, 3.3, 3.5',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'scratch', cite: 'WPA 12.8 via 3.1',
                detection: 'events' }),
            Object.freeze({ code: 'no-rail-after-contact', cite: 'WPA 12.8 via 3.3',
                detection: 'events' }),
            Object.freeze({ code: 'ball-off-table', cite: 'WPA 12.8 via 3.5',
                detection: 'events' }),
            Object.freeze({ code: 'three-consecutive-fouls', cite: 'WPA 12.9 via 3.13',
                detection: 'events' }),
            // GH-371 (Amendment A5): the 3.11 kitchen-shot pair; para 2 is
            // 12.8's second kitchen-BIH grant
            Object.freeze({ code: 'bad-kitchen-shot', cite: 'WPA 12.8 via 3.11',
                detection: 'events' }),
            Object.freeze({ code: 'kitchen-no-exit', cite: 'WPA 12.8 via 3.11',
                detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'Each ball legally pocketed in the shooter’s assigned '
                + 'pocket scores one; the first player to eight balls wins the '
                + 'rack.',
            cite: 'WPA 12.5',
        }),
        respot_rules: Object.freeze({
            text: 'Balls pocketed in neither assigned pocket and balls driven '
                + 'off the table are spotted; owed balls after fouls are spotted '
                + 'per the spotting rules.',
            cite: 'WPA 12.6, 12.7',
        }),
        turn_rotation: Object.freeze({
            text: 'Shooter continues after legally scoring in their own pocket; '
                + 'otherwise the turn passes. Standard fouls cost one owed ball '
                + '(spotted), the cue ball staying in position except a 3.1 '
                + 'scratch (ball in hand behind the head string); a third '
                + 'successive foul is a serious foul. Recorded divergences of the '
                + 'OnePocket.org secondary (2021-10-09): ball in hand behind the '
                + 'head string after a scratch, and three successive fouls lose '
                + 'the game.',
            cite: 'WPA 12.5, 12.8, 12.9 via 3.13; secondary OnePocket.org (2021-10-09)',
        }),
        call_shot: null, // pocket ownership (12.3) replaces call rules
        // feature 012 T048 (US1 flip): every T029-era prerequisite is now MET —
        // pocket-assignment UI + owed-ball ledger HUD (T031/T032), onepocket-v1
        // incl. three-foul tracking + OnePocket.org divergences (US1 lane).
        ruleset_id: 'onepocket-v1',
        prerequisites: [],
    }),
    // ---- feature 025 (issue #65): 14.1 continuous (straight pool) --------------
    Object.freeze({
        id: 'straight_pool',
        display_name: '14.1 Continuous',
        discipline_family: 'pool',
        provenance: Object.freeze({
            ...WPA_2025,
            sections: 'Sec. 7 (7.1-7.12); Sec. 3 fouls via 7.9; 1.7 call shot; '
                + '2.7 driven to a rail',
        }),
        readiness: 'playable',
        ball_count: 15,
        ballset_ids: ['pool_standard', 'pool_used'],
        table_class: Object.freeze({ kind: 'catalog', table_ids: [...POOL_9FT_TABLES] }),
        rack_template: 'fourteenone_wpa', // fifteen lattice, free seeded shuffle (WPA 7.2)
        break_requirements: Object.freeze({
            text: 'Cue ball in hand behind the head string; if no called ball is '
                + 'pocketed, the cue ball and two object balls must each be driven '
                + 'to a rail (pocketed/jumped balls count per 2.7), else a breaking '
                + 'foul: minus two points and the opponent’s repeatable '
                + 'accept-or-re-break option.',
            cite: 'WPA 7.3(b)/7.10; 2.7',
        }),
        legal_shot: Object.freeze({
            text: 'Every shot after the break carries an explicit ball + pocket '
                + 'call or a declared safety; the shared shot fouls of Sec. 3 '
                + '(scratch, no rail after contact, ball off table) apply via 7.9.',
            cite: 'WPA 7.5 via 1.7; 7.9 via 3.1, 3.3, 3.5',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'scratch', cite: 'WPA 7.9 via 3.1',
                detection: 'events' }),
            Object.freeze({ code: 'no-rail-after-contact', cite: 'WPA 7.9 via 3.3',
                detection: 'events' }),
            Object.freeze({ code: 'ball-off-table', cite: 'WPA 7.9 via 3.5',
                detection: 'events' }),
            Object.freeze({ code: 'breaking-foul', cite: 'WPA 7.3(b)/7.10',
                detection: 'events' }),
            Object.freeze({ code: 'three-consecutive-fouls', cite: 'WPA 7.11 via 3.13',
                detection: 'events' }),
            // GH-371 slice-repin event: WPA 7.9 lists 3.11
            Object.freeze({ code: 'bad-kitchen-shot', cite: 'WPA 7.9 via 3.11',
                detection: 'events' }),
            Object.freeze({ code: 'kitchen-no-exit', cite: 'WPA 7.9 via 3.11',
                detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'One point per ball legally pocketed on a called shot (every '
                + 'extra ball on that stroke counts); scores are cumulative and may '
                + 'be negative; the first player to reach the agreed target '
                + '(75/100/125, default 100) wins.',
            cite: 'WPA Sec. 7 intro; 7.4; 7.7',
        }),
        respot_rules: Object.freeze({
            text: 'Balls pocketed on fouls, on safeties, or without the called '
                + 'ball dropping are spotted; when the fourteenth ball drops the '
                + 'fourteen pocketed balls re-rack with the apex vacant and the '
                + 'fifteenth ball and cue ball stay, per the special racking '
                + 'situations table (rack-area interference resolves to the head '
                + 'spot / center spot / kitchen).',
            cite: 'WPA 7.6; 7.4; 7.8 Table 1',
        }),
        turn_rotation: Object.freeze({
            text: 'Shooter continues after each legally called pot (the run '
                + 'continues across re-racks); otherwise the turn passes. Standard '
                + 'fouls score minus one (scratch: ball in hand behind the head '
                + 'string, else the cue stays); a third consecutive foul scores '
                + 'minus fifteen more and all fifteen balls re-rack with the '
                + 'offender breaking under the opening-break requirements.',
            cite: 'WPA 7.4, 7.9 via 3.1; 7.11 via 3.13',
        }),
        call_shot: Object.freeze({
            text: 'Explicit ball + pocket nomination before every non-break shot '
                + '(the opening break may carry one); safety calls supported — '
                + 'safety-pocketed balls are spotted.',
            cite: 'WPA 7.5 via 1.7; 7.6',
        }),
        ruleset_id: 'fourteenone-v1',
        prerequisites: [],
    }),
    // ---- feature 026 (GH-343): 10-ball (WPA call-shot rotation) ----------------
    Object.freeze({
        id: 'ten_ball',
        display_name: '10-Ball',
        discipline_family: 'pool',
        provenance: Object.freeze({
            ...WPA_2025,
            sections: 'Sec. 6 (6.1-6.11); Sec. 3 fouls via 6.9/6.10; 1.7 call '
                + 'shot; 1.5 spotting; 2.7 driven to a rail',
        }),
        readiness: 'playable',
        ball_count: 10,
        ballset_ids: ['pool_standard', 'pool_used'],
        table_class: Object.freeze({ kind: 'catalog', table_ids: [...POOL_9FT_TABLES] }),
        rack_template: 'ten_wpa', // ten lattice: 1 apex, 10 centre, seeded shuffle (WPA 6.2)
        break_requirements: Object.freeze({
            text: 'Cue ball in hand behind the head string; if no object ball is '
                + 'pocketed, at least four object balls must be driven to one or '
                + 'more rails (jumped balls count per 2.7), else a standard foul — '
                + 'ball in hand anywhere for the opponent.',
            cite: 'WPA 6.3; 2.7; 6.9',
        }),
        legal_shot: Object.freeze({
            text: 'First contact must be the lowest-numbered ball on the table; '
                + 'every shot after the break carries an explicit ball + pocket '
                + 'call or a declared no-call stance (there is no safety call at '
                + '10-ball); after contact a ball must be pocketed or reach a '
                + 'rail. The shot after a foul-free break may be declared a push '
                + 'out (3.2/3.3 suspended; the opponent chooses who shoots next).',
            cite: 'WPA 6.5 via 1.7; 6.9 via 3.2, 3.3; 6.4',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'no-contact', cite: 'WPA 6.9 via 3.3',
                detection: 'events' }),
            Object.freeze({ code: 'wrong-first-ball', cite: 'WPA 6.9 via 3.2',
                detection: 'events' }),
            Object.freeze({ code: 'no-rail-after-contact', cite: 'WPA 6.9 via 3.3',
                detection: 'events' }),
            Object.freeze({ code: 'illegal-break', cite: 'WPA 6.3(b)',
                detection: 'events' }),
            Object.freeze({ code: 'ball-off-table', cite: 'WPA 6.9 via 3.5',
                detection: 'events' }),
            Object.freeze({ code: 'scratch', cite: 'WPA 6.9 via 3.1',
                detection: 'events' }),
            Object.freeze({ code: 'three-consecutive-fouls', cite: 'WPA 6.10 via 3.13',
                detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'The rack is won by legally pocketing the called 10 in the '
                + 'called pocket when it is the only object ball on the table. An '
                + 'early called 10 (e.g. a combination) is legal but spots and the '
                + 'shooter continues; there is no golden-break win — the 10 '
                + 'pocketed on the break spots.',
            cite: 'WPA Sec. 6 intro; 6.7; 6.8',
        }),
        respot_rules: Object.freeze({
            text: 'Only the 10 is respotted (foot spot, long-string occlusion '
                + 'fallback per 1.5) whenever it is pocketed other than on the '
                + 'winning shot or driven off the table; no other object ball is '
                + 'ever spotted — wrongfully pocketed balls stay down.',
            cite: 'WPA 6.8 via 1.5',
        }),
        turn_rotation: Object.freeze({
            text: 'Shooter continues after a legally made called shot (or any '
                + 'pot on a legal break); a wrongful pot (no call made, no foul) '
                + 'gives the opponent the choice of who shoots next, as does a '
                + 'foul-free push out; fouls give ball in hand anywhere; three '
                + 'consecutive fouls lose the rack.',
            cite: 'WPA 6.6; 6.7; 6.4; 6.9 via 1.6; 6.10 via 3.13',
        }),
        call_shot: Object.freeze({
            text: 'Explicit ball + pocket nomination before every non-break shot '
                + '(details such as cushions or combinations are irrelevant; one '
                + 'ball per call). There is NO safety call at 10-ball — playing '
                + 'without a nomination is the declared no-call stance, and any '
                + 'uncalled pot triggers the opponent option.',
            cite: 'WPA 6.5 via 1.7; 6.6',
        }),
        ruleset_id: 'tenball-v1',
        prerequisites: [],
    }),
    // ---- GH-491 (build 18): Heyball (WPA Rules of Heyball) ---------------------
    Object.freeze({
        id: 'heyball',
        display_name: 'Heyball',
        discipline_family: 'pool',
        provenance: Object.freeze({
            body: 'WPA',
            rulebook: 'Rules of Heyball',
            edition: 'effective 2025-08-16', // standalone rulebook; the
            // consolidated 2025-09-15 Rules of Play defers to it ("Chapter 9
            // ... in due course"). Pin + PDF sha256:
            // docs/research/rules-audit/heyball-rulebook-pin.md
            url: 'https://wpapool.com/wp-content/uploads/2025/08/250816-Rules-of-Heyball.pdf',
            sections: 'Ch. II (Rules of Heyball) 2-21; Ch. I 4, 12; App-A 3.11',
        }),
        readiness: 'playable',
        ball_count: 15,
        ballset_ids: ['pool_standard', 'pool_used'],
        // The Heyball table class is the Chinese eight-ball table alone
        // (II.3(a): 2540x1260(+/-9) mm inner, snooker-style curved pockets)
        // — catalog id `chinese8_pro_9ft` (the GH-490/v15 de-brand rename;
        // the pre-rename `joy_q8_9ft` id stays a ui_hidden resolve-only
        // alias for replays and persisted selections, never a class member).
        table_class: Object.freeze({ kind: 'catalog', table_ids: ['chinese8_pro_9ft'] }),
        rack_template: 'heyball_wpa', // fifteen lattice: 8 centre, one solid
        // + one stripe at the base corners (WPA Heyball II.4)
        break_requirements: Object.freeze({
            text: 'Cue ball in hand behind the head string; no call exists; a '
                + 'break with no pot must drive at least four object balls to '
                + 'cushions, else the opponent may accept the table or have it '
                + 're-racked with either player breaking (no ball in hand). '
                + 'Break fouls give ball in hand BEHIND the head string only, '
                + 'inside a three-way option (or re-rack); the 8 pocketed on the '
                + 'break is re-spotted or re-racked, never a win or loss — but '
                + 'the 8 driven OFF the table on the break loses the rack.',
            cite: 'WPA Heyball II.6(c)-(g); II.20(c)',
        }),
        legal_shot: Object.freeze({
            text: 'First contact must be a ball of the shooter’s group '
                + '(any ball except the 8 while the table is open — no '
                + 'whole-group exception exists); after contact a ball must be '
                + 'pocketed or reach a cushion; striking an object ball frozen '
                + 'to a cushion, the target must escape or another ball must '
                + 'reach a cushion or a ball be pocketed. No shot is ever '
                + 'called.',
            cite: 'WPA Heyball II.10.1; II.12.1-12.2; II.15.2; II.11',
        }),
        foul_taxonomy: [
            Object.freeze({ code: 'scratch', cite: 'WPA Heyball II.17(a)',
                detection: 'events' }),
            Object.freeze({ code: 'no-contact', cite: 'WPA Heyball II.17(b)',
                detection: 'events' }),
            Object.freeze({ code: 'wrong-first-ball', cite: 'WPA Heyball II.17(b)',
                detection: 'events' }),
            Object.freeze({ code: 'no-rail-after-contact',
                cite: 'WPA Heyball II.12.2', detection: 'events' }),
            Object.freeze({ code: 'ball-off-table',
                cite: 'WPA Heyball II.17(e) via II.12.3',
                detection: 'events' }),
            Object.freeze({ code: 'frozen-cushion-escape',
                cite: 'WPA Heyball II.15.2', detection: 'events' }),
            Object.freeze({ code: 'bad-kitchen-shot',
                cite: 'WPA Heyball II.8 via II.17(i)',
                detection: 'events' }),
            Object.freeze({ code: 'kitchen-no-exit',
                cite: 'WPA Heyball App-A 3.11', detection: 'events' }),
            Object.freeze({ code: 'illegal-break', cite: 'WPA Heyball II.6(c)',
                detection: 'events' }),
        ],
        scoring_win: Object.freeze({
            text: 'Pocket every ball of the shooter’s group, then the 8 '
                + '— in any pocket, flukes included (no call exists). The '
                + 'rack is lost on 8-with-foul, early 8, the 8 with the last '
                + 'group ball on one stroke, or the 8 off the table.',
            cite: 'WPA Heyball II.2; II.11; II.20(a)-(e)',
        }),
        respot_rules: Object.freeze({
            text: 'Only the 8 is ever spotted (the 8-on-break option paths; '
                + 'foot spot with long-string occlusion fallback). Object balls '
                + 'driven off the table stay out of play — a foul without a '
                + 're-spot.',
            cite: 'WPA Heyball II.6(f); II.7; II.12.3',
        }),
        turn_rotation: Object.freeze({
            text: 'Shooter continues after legally pocketing a ball of the '
                + 'first-contact group (any object ball while the table is '
                + 'open); otherwise the turn passes; standard fouls give ball in '
                + 'hand anywhere; break fouls give ball in hand behind the head '
                + 'string. Breaks alternate between the players.',
            cite: 'WPA Heyball II.9; II.10.1; II.12.1; II.17; I.12',
        }),
        // GH-491 review r2: null IS the catalog's no-call-rules discriminator
        // (data-model.md §2) — a populated CitedText here read as
        // call-ENABLED to generic consumers while heyball-v1 rejects every
        // non-null call. The II.11 law rides legal_shot's text ("No shot is
        // ever called", cite II.11) + the app help/locale copy; the share
        // codec refuses heyball shot-call annotations outright.
        call_shot: null,
        ruleset_id: 'heyball-v1',
        prerequisites: [],
    }),
]);
/** The app's default game (FR-003: 9-ball behaves exactly as before). */
export const DEFAULT_GAME = 'nine_ball';
/** Entry lookup. Throws GameCatalogError on unknown ids. */
export function getGameEntry(id) {
    const e = GAME_CATALOG.find((g) => g.id === id);
    if (e === undefined) {
        throw new GameCatalogError(`unknown game id '${String(id)}'`);
    }
    return e;
}
const nonEmpty = (s) => typeof s === 'string' && s.length > 0;
function requireCited(entryId, field, c, nullable = false) {
    if (c === null && nullable)
        return;
    if (c === null || c === undefined
        || !nonEmpty(c.text) || !nonEmpty(c.cite)) {
        throw new GameCatalogError(`game '${entryId}': ${field} must carry text + rulebook cite`);
    }
}
/**
 * Validate one entry against rules V1-V8 (data-model.md §1.2). Pure;
 * throws GameCatalogError naming the entry and the violated rule. There is
 * NO bypass tier: a citation-less entry is invalid, never lower-tier
 * (FR-002, US4-AS3).
 */
export function validateGameEntry(e) {
    // V1 — provenance present and fully non-empty
    const p = e.provenance;
    if (p === null || p === undefined
        || !nonEmpty(p.body) || !nonEmpty(p.rulebook) || !nonEmpty(p.edition)
        || !nonEmpty(p.url) || !nonEmpty(p.sections)) {
        throw new GameCatalogError(`game '${e.id}': provenance (body/rulebook/edition/url/sections) is `
            + 'required and must be non-empty (V1: citation-required, no bypass '
            + 'tier)');
    }
    if (!nonEmpty(e.display_name)) {
        throw new GameCatalogError(`game '${e.id}': display_name is empty`);
    }
    // V2 — every CitedText / FoulDef / prerequisite cite non-empty
    requireCited(e.id, 'break_requirements', e.break_requirements);
    requireCited(e.id, 'legal_shot', e.legal_shot);
    requireCited(e.id, 'scoring_win', e.scoring_win);
    requireCited(e.id, 'respot_rules', e.respot_rules);
    requireCited(e.id, 'turn_rotation', e.turn_rotation);
    requireCited(e.id, 'call_shot', e.call_shot, true);
    for (const f of e.foul_taxonomy) {
        if (!nonEmpty(f.code) || !nonEmpty(f.cite)) {
            throw new GameCatalogError(`game '${e.id}': foul '${String(f.code)}' must carry code + cite (V2)`);
        }
        if (f.detection !== 'events' && f.detection !== 'nomination'
            && f.detection !== 'out_of_scope') {
            throw new GameCatalogError(`game '${e.id}': foul '${f.code}' has unknown detection `
                + `'${String(f.detection)}'`);
        }
    }
    for (const pr of e.prerequisites) {
        if (!nonEmpty(pr.id) || !nonEmpty(pr.description) || !nonEmpty(pr.cite)) {
            throw new GameCatalogError(`game '${e.id}': prerequisite '${String(pr.id)}' must carry `
                + 'id + description + cite (V2)');
        }
        if (pr.kind !== 'equipment' && pr.kind !== 'rack_template'
            && pr.kind !== 'ruleset' && pr.kind !== 'ui') {
            throw new GameCatalogError(`game '${e.id}': prerequisite '${pr.id}' has unknown kind `
                + `'${String(pr.kind)}'`);
        }
    }
    // V3 — ballsets resolve against the equipment catalog
    if (!Array.isArray(e.ballset_ids) || e.ballset_ids.length === 0) {
        throw new GameCatalogError(`game '${e.id}': ballset_ids is empty (V3)`);
    }
    for (const id of e.ballset_ids) {
        if (catalogEntry('ballset_id', id) === undefined) {
            throw new GameCatalogError(`game '${e.id}': unknown ballset id '${id}' (V3)`);
        }
    }
    // V4 — catalog table classes resolve to visible entries
    if (e.table_class.kind === 'catalog') {
        if (e.table_class.table_ids.length === 0) {
            throw new GameCatalogError(`game '${e.id}': empty table class (V4)`);
        }
        for (const id of e.table_class.table_ids) {
            const te = catalogEntry('table_id', id);
            if (te === undefined || te.ui_hidden === true) {
                throw new GameCatalogError(`game '${e.id}': table id '${id}' missing or ui_hidden (V4)`);
            }
        }
    }
    // V7 — rack template resolves; id domain consistent with ball_count.
    // Since feature 012 (kernel trunk T021) every declared template resolves
    // to a kernel lattice — snooker_wpbsa → 'snooker' (21 non-cue balls),
    // carom_umb → 'carom' (2); a template-less id would still need a
    // rack_template-kind READINESS PREREQUISITE on a config_ready entry.
    const template = resolveRackTemplate(e.rack_template);
    if (template !== undefined) {
        const domain = KERNEL_KIND_RACK_BALLS[template.kernel_kind];
        if (e.ball_count !== domain) {
            throw new GameCatalogError(`game '${e.id}': rack template '${e.rack_template}' covers ${domain} `
                + `balls but ball_count is ${e.ball_count} (V7)`);
        }
    }
    else if (e.readiness === 'playable'
        || !e.prerequisites.some((pr) => pr.kind === 'rack_template')) {
        throw new GameCatalogError(`game '${e.id}': rack template '${e.rack_template}' has no kernel `
            + 'lattice and no rack_template prerequisite names the gap (V7)');
    }
    // V5 / V6 — readiness coherence
    if (e.readiness === 'playable') {
        if (e.ruleset_id === null || !REGISTERED_RULESETS.includes(e.ruleset_id)) {
            throw new GameCatalogError(`game '${e.id}': playable requires a registered ruleset_id (V5)`);
        }
        if (e.prerequisites.length !== 0) {
            throw new GameCatalogError(`game '${e.id}': playable entries carry no prerequisites (V5)`);
        }
        if (e.table_class.kind !== 'catalog') {
            throw new GameCatalogError(`game '${e.id}': playable requires a resolved catalog table class (V5)`);
        }
    }
    else {
        if (e.prerequisites.length === 0) {
            throw new GameCatalogError(`game '${e.id}': config_ready requires a non-empty prerequisite `
                + 'list (V6)');
        }
        if (e.ruleset_id !== null) {
            throw new GameCatalogError(`game '${e.id}': config_ready entries are not selectable for play — `
                + 'ruleset_id must be null until the ruleset ships (V6)');
        }
        if (e.table_class.kind === 'missing'
            && !e.prerequisites.some((pr) => pr.id === e.table_class.prerequisite)) {
            throw new GameCatalogError(`game '${e.id}': table_class prerequisite `
                + `'${e.table_class.prerequisite}' is not in the prerequisite list (V6)`);
        }
    }
}
/** Validate a whole catalog: every entry validates and ids are unique
 * (V8; immutability-once-shipped is a review-time rule — corrections get
 * NEW ids, equipment-catalog convention). */
export function validateGameCatalog(c) {
    const seen = new Set();
    for (const e of c) {
        if (seen.has(e.id)) {
            throw new GameCatalogError(`duplicate game id '${e.id}' (V8)`);
        }
        seen.add(e.id);
        validateGameEntry(e);
    }
}
