// Copyright (c) Meta Platforms, Inc. and affiliates.

// rules-catalog-drift.test.ts — feature 013 T041 (ADDITIVE file: SC-001
// forbids edits to existing suites, not additions; plan Lane C1): the
// single-source guard for the pure data that STAYED in TS after the crate
// migration. `FOUL_LABELS`, `EIGHTBALL_V1_CONFIG`, `ONE_POCKET_FOOT_POCKETS`
// and the carom ball/target constants are TS exports consumed by the app —
// this suite pins them byte-consistent with the crate's
// `rules_catalog_json()` through backend.ts, and pins the frozen 011/012
// identity axes (ruleset ids, foul codes + cites, decision tables 1–10,
// terminal reasons) against the same catalog, so neither side can drift
// without failing here.
//
// Byte discipline: the crate serializes `config` through a serde_json
// Value map, which orders keys ALPHABETICALLY; TS object literals keep
// declaration order. Comparisons therefore go through ONE key-sorted
// stringify applied to BOTH sides — still byte-strength on values, types,
// and key sets. Arrays (fouls/decisions/terminals) keep crate declaration
// order and compare with plain JSON.stringify.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rulesCatalogJson, rulesVersion } from '../src/rules/backend.js';
import { FOUL_LABELS, RULESET_IDS } from '../src/rules/index.js';
import { EIGHTBALL_V1_CONFIG } from '../src/rules/eightball.js';
import { ONE_POCKET_FOOT_POCKETS } from '../src/rules/onepocket.js';
import {
  CAROM_BALL_BREAKER, CAROM_BALL_OPPONENT, CAROM_BALL_RED,
  CAROM_TARGET_DEFAULT,
} from '../src/rules/carom3c.js';
import {
  FOURTEENONE_TARGET_DEFAULT, FOURTEENONE_TARGETS,
} from '../src/rules/fourteenone.js';

interface CatalogEntry {
  id: string;
  fouls: { code: string; cite: string }[];
  decisions: { id: number; kind: string; choiceMax: number }[];
  terminals: string[];
  config: Record<string, unknown>;
  // feature 022 (contracts/registry-api.md §4, additive): shipped preset
  // rows — empty on the five v1 entries, both rows on eightball-v2
  presets: {
    id: string; family: string; displayKey: string; sourceTitle: string;
    sourceEdition: string; sourceUrl: string; tier: string;
    aliases: string | null; config: Record<string, unknown>;
    taskHash: string;
  }[];
}

const catalog = JSON.parse(rulesCatalogJson()) as {
  rulesVersion: string; rulesets: CatalogEntry[];
};
const byId = new Map(catalog.rulesets.map((e) => [e.id, e]));
const entry = (id: string): CatalogEntry => {
  const e = byId.get(id);
  assert.ok(e, `catalog carries ${id}`);
  return e;
};

/** One key-sorted serializer for both sides of every config comparison. */
function sortedStringify(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(sortedStringify).join(',')}]`;
  }
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${sortedStringify(x)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(v);
}

test('catalog: stamped, and the id set equals the frozen TS registry', () => {
  assert.equal(catalog.rulesVersion, rulesVersion());
  assert.equal(catalog.rulesets.length, RULESET_IDS.length);
  assert.deepEqual(
    [...byId.keys()].sort(), [...RULESET_IDS].sort(),
    'crate registry ids == TS RULESET_IDS (011/012 frozen slots '
    + '+ the 022 eightball-v2 growth)');
});

test('nineball: FOUL_LABELS byte-consistent with config.foulLabels', () => {
  const cat = entry('nineball-v1');
  assert.equal(
    sortedStringify(cat.config['foulLabels']), sortedStringify(FOUL_LABELS),
    'the TS label map and the crate catalog are the same data');
  // every labelled code is a catalog foul code and vice versa
  assert.deepEqual(
    Object.keys(FOUL_LABELS).sort(),
    cat.fouls.map((f) => f.code).sort());
});

test('eightball: EIGHTBALL_V1_CONFIG byte-consistent with the crate config', () => {
  assert.equal(
    sortedStringify(entry('eightball-v1').config),
    sortedStringify(EIGHTBALL_V1_CONFIG),
    'no house-rule toggle can drift between TS and the crate (FR-002)');
});

test('onepocket: ONE_POCKET_FOOT_POCKETS byte-consistent with config.footPockets', () => {
  const cat = entry('onepocket-v1');
  assert.equal(
    sortedStringify(cat.config['footPockets']),
    sortedStringify(ONE_POCKET_FOOT_POCKETS));
  assert.equal(cat.config['winTally'], 8, 'WPA 12.2 first-to-eight');
});

test('carom3c: ball ids and default target byte-consistent with the crate config', () => {
  assert.equal(
    sortedStringify(entry('carom3c-v1').config),
    sortedStringify({
      balls: {
        breaker: CAROM_BALL_BREAKER,
        opponent: CAROM_BALL_OPPONENT,
        red: CAROM_BALL_RED,
      },
      targetDefault: CAROM_TARGET_DEFAULT,
    }));
  assert.equal(sortedStringify(entry('snooker-v1').config), '{}',
    'snooker keeps no TS-mirrored config');
});

// The frozen identity axes (011/012 contracts): foul codes with their
// rulebook cites, the share-codec-v4 decision id space, and terminal
// reasons — pinned VALUE-FOR-VALUE against the crate catalog. A crate
// edit that changes any code/cite/decision/terminal fails here before it
// can reach the app or the share codec.
const FROZEN: Record<string, Pick<CatalogEntry, 'fouls' | 'decisions' | 'terminals'>> = {
  'nineball-v1': {
    fouls: [
      { code: 'no-contact', cite: 'WPA 3.3' },
      { code: 'wrong-first-ball', cite: 'WPA 3.2' },
      { code: 'no-rail-after-contact', cite: 'WPA 3.3' },
      { code: 'scratch', cite: 'WPA 3.1' },
    ],
    decisions: [],
    terminals: ['nine-ball-pocketed'],
  },
  'eightball-v1': {
    fouls: [
      { code: 'scratch', cite: 'WPA 3.1 via 4.9' },
      { code: 'no-contact', cite: 'WPA 3.3 via 4.9' },
      { code: 'wrong-first-ball', cite: 'WPA 3.2 via 4.4/4.9' },
      { code: 'no-rail-after-contact', cite: 'WPA 3.3 via 4.9' },
      { code: 'ball-off-table', cite: 'WPA 3.5 via 4.9' },
      { code: 'bad-break', cite: 'WPA 4.3(d)' },
    ],
    decisions: [
      { id: 1, kind: 'dry_break', choiceMax: 3 },
      { id: 2, kind: 'eight_legal_break', choiceMax: 2 },
      { id: 3, kind: 'eight_foul_break', choiceMax: 2 },
      { id: 4, kind: 'break_foul', choiceMax: 2 },
      { id: 5, kind: 'stalemate', choiceMax: 1 },
    ],
    terminals: [
      'eight-ball-pocketed', 'eight-with-foul', 'early-eight',
      'eight-wrong-pocket', 'eight-off-table',
    ],
  },
  'onepocket-v1': {
    fouls: [
      { code: 'scratch', cite: 'WPA 12.8 via 3.1' },
      { code: 'no-rail-after-contact', cite: 'WPA 12.8 via 3.3' },
      { code: 'ball-off-table', cite: 'WPA 12.8 via 3.5' },
      { code: 'three-consecutive-fouls', cite: 'WPA 12.9 via 3.13' },
      // GH-371 (rulesets-012.md Amendment A5): the 3.11 kitchen-shot
      // pair — para 1 cue-stays, para 2 = the second kitchen-BIH grant
      { code: 'bad-kitchen-shot', cite: 'WPA 12.8 via 3.11' },
      { code: 'kitchen-no-exit', cite: 'WPA 12.8 via 3.11' },
    ],
    decisions: [
      { id: 6, kind: 'break_pocket', choiceMax: 2 },
      { id: 9, kind: 'stalemate_lag', choiceMax: 2 },
      // GH-371 appendix: the recorded WPA 1.6 para-2 spot request
      { id: 14, kind: 'spot_nearest', choiceMax: 1 },
    ],
    terminals: ['first-to-eight', 'three-consecutive-fouls'],
  },
  'snooker-v1': {
    fouls: [
      { code: 'no-contact', cite: 'WPBSA Sec2 R11; Sec3 R10' },
      { code: 'wrong-first-ball', cite: 'WPBSA Sec2 R11; Sec3 R10' },
      { code: 'not-nominated', cite: 'WPBSA Sec3 R3(h), R10' },
      { code: 'ball-off-table', cite: 'WPBSA Sec3 R7, R10' },
      { code: 'scratch', cite: 'WPBSA Sec3 R5, R10' },
      { code: 'jump-over', cite: 'WPBSA Sec2 R20; Sec3 R10' },
    ],
    decisions: [
      { id: 7, kind: 'play_again', choiceMax: 2 },
      { id: 8, kind: 'respotted_black_toss', choiceMax: 2 },
    ],
    terminals: [
      'respotted-black-foul', 'respotted-black-potted', 'black-potted',
      'foul-on-black',
    ],
  },
  'carom3c-v1': {
    fouls: [
      { code: 'wrong-first-ball-break', cite: 'UMB Art 23.3/41.12' },
      // GH-371 (Amendment A5): frozen-cushion direct play joins judged
      // scope (Art 41.8's cushion half is record geometry)
      { code: 'frozen-cushion-play', cite: 'UMB Art 27.2/41.8' },
      { code: 'ball-off-table', cite: 'UMB Art 41.1/28.1(b)' },
    ],
    decisions: [
      { id: 10, kind: 'break_spot', choiceMax: 2 },
      // GH-371 appendix: the recorded Art 27.1(a) demand-respot
      { id: 16, kind: 'contact_respot', choiceMax: 1 },
    ],
    terminals: ['carom-target-reached'],
  },
  // feature 025 (issue #65): the fourteenone-v1 identity axes — frozen
  // at the conformance-slice harvest (wpa-14-1.json); decision 11 is the
  // first allocation past the codec-v4 1-10 space (additive).
  'fourteenone-v1': {
    fouls: [
      { code: 'scratch', cite: 'WPA 7.9 via 3.1' },
      { code: 'no-rail-after-contact', cite: 'WPA 7.9 via 3.3' },
      { code: 'ball-off-table', cite: 'WPA 7.9 via 3.5' },
      { code: 'breaking-foul', cite: 'WPA 7.3(b)/7.10' },
      { code: 'three-consecutive-fouls', cite: 'WPA 7.11 via 3.13' },
      // GH-371 slice-repin event: WPA 7.9 lists 3.11 — judged on
      // kitchenBih strokes since RULES_VERSION 0.1.7
      { code: 'bad-kitchen-shot', cite: 'WPA 7.9 via 3.11' },
      { code: 'kitchen-no-exit', cite: 'WPA 7.9 via 3.11' },
    ],
    decisions: [
      { id: 11, kind: 'break_violation', choiceMax: 2 },
      // GH-371 appendix: the recorded WPA 1.6 para-2 spot request
      { id: 15, kind: 'spot_nearest', choiceMax: 1 },
    ],
    terminals: ['target-reached'],
  },
  // feature 026 (GH-343): the tenball-v1 identity axes — frozen at the
  // conformance-slice harvest (wpa-10ball.json); decisions 12/13 are the
  // allocations past the codec 1-11 space (additive).
  'tenball-v1': {
    fouls: [
      { code: 'no-contact', cite: 'WPA 6.9 via 3.3' },
      { code: 'wrong-first-ball', cite: 'WPA 6.9 via 3.2' },
      { code: 'no-rail-after-contact', cite: 'WPA 6.9 via 3.3' },
      { code: 'illegal-break', cite: 'WPA 6.3(b)' },
      { code: 'ball-off-table', cite: 'WPA 6.9 via 3.5' },
      { code: 'scratch', cite: 'WPA 6.9 via 3.1' },
      { code: 'three-consecutive-fouls', cite: 'WPA 6.10 via 3.13' },
    ],
    decisions: [
      { id: 12, kind: 'pushout_response', choiceMax: 2 },
      { id: 13, kind: 'wrongful_pot', choiceMax: 2 },
    ],
    terminals: ['ten-ball-pocketed', 'three-consecutive-fouls'],
  },
  // GH-382 (build 17): the snooker-v2 identity axes — frozen at the
  // conformance-slice harvest (wpbsa-snooker-full.json). The v1 snooker
  // taxonomy is carried verbatim, plus the two completion fouls; the v1
  // decision rows 7/8 are REUSED with their frozen global meanings
  // (the eightball-v2 convention) and decision 17 is the allocation
  // past the codec 1-13 space (additive).
  'snooker-v2': {
    fouls: [
      { code: 'no-contact', cite: 'WPBSA Sec2 R11; Sec3 R10' },
      { code: 'wrong-first-ball', cite: 'WPBSA Sec2 R11; Sec3 R10' },
      { code: 'not-nominated', cite: 'WPBSA Sec3 R3(h), R10' },
      { code: 'ball-off-table', cite: 'WPBSA Sec3 R7, R10' },
      { code: 'scratch', cite: 'WPBSA Sec3 R5, R10' },
      { code: 'jump-over', cite: 'WPBSA Sec2 R20; Sec3 R10' },
      { code: 'push-stroke',
        cite: 'WPBSA Sec2 R19; Sec3 R8(b), R11(b)(v)' },
      // the dual-touch arm (review r28/r30): the same code cites R8(c)
      // when an UNANNOUNCED touching neighbour was moved
      { code: 'push-stroke',
        cite: 'WPBSA Sec2 R19; Sec3 R8(c), R11(b)(v)' },
      { code: 'free-ball-snooker',
        cite: 'WPBSA Sec3 R12(b)(ii), R11(a)(viii)' },
    ],
    decisions: [
      { id: 7, kind: 'play_again', choiceMax: 2 },
      { id: 8, kind: 'respotted_black_toss', choiceMax: 2 },
      { id: 17, kind: 'foul_and_a_miss', choiceMax: 3 },
    ],
    terminals: [
      'respotted-black-foul', 'respotted-black-potted', 'black-potted',
      'foul-on-black', 'miss-frame-award',
    ],
  },
  // GH-491 (build 18): the heyball-v1 identity axes — frozen at the
  // conformance-slice harvest (wpa-heyball.json, 3f41c726). Decisions
  // 18-23 are the allocation past the codec 1-17 space (additive); the
  // rulebook is the standalone WPA Rules of Heyball (eff. 2025-08-16,
  // pin: docs/research/rules-audit/heyball-rulebook-pin.md).
  'heyball-v1': {
    fouls: [
      { code: 'scratch', cite: 'WPA Heyball II.17(a)' },
      { code: 'no-contact', cite: 'WPA Heyball II.17(b)' },
      { code: 'wrong-first-ball', cite: 'WPA Heyball II.17(b)' },
      { code: 'no-rail-after-contact', cite: 'WPA Heyball II.12.2' },
      { code: 'ball-off-table', cite: 'WPA Heyball II.17(e) via II.12.3' },
      { code: 'frozen-cushion-escape', cite: 'WPA Heyball II.15.2' },
      { code: 'bad-kitchen-shot', cite: 'WPA Heyball II.8 via II.17(i)' },
      { code: 'kitchen-no-exit', cite: 'WPA Heyball App-A 3.11' },
      { code: 'illegal-break', cite: 'WPA Heyball II.6(c)' },
    ],
    decisions: [
      { id: 18, kind: 'illegal_break', choiceMax: 3 },
      { id: 19, kind: 'break_foul', choiceMax: 3 },
      { id: 20, kind: 'eight_break_pot', choiceMax: 2 },
      { id: 21, kind: 'eight_break_foul', choiceMax: 3 },
      { id: 22, kind: 'break_miscue', choiceMax: 2 },
      { id: 23, kind: 'stalemate', choiceMax: 1 },
    ],
    terminals: [
      'eight-ball-pocketed', 'eight-with-foul', 'eight-with-last-ball',
      'eight-off-table', 'early-eight',
    ],
  },
};

test('foul codes + cites, decision tables, terminals: frozen per ruleset', () => {
  for (const [id, want] of Object.entries(FROZEN)) {
    const cat = entry(id);
    assert.equal(JSON.stringify(cat.fouls), JSON.stringify(want.fouls),
      `${id} fouls (codes AND cites) are 011/012-frozen`);
    assert.equal(
      JSON.stringify(cat.decisions), JSON.stringify(want.decisions),
      `${id} decision table is share-codec-v4-frozen`);
    assert.equal(
      JSON.stringify(cat.terminals), JSON.stringify(want.terminals),
      `${id} terminal reasons are frozen`);
  }
});

test('decision ids 1-23: globally disjoint and complete', () => {
  // feature 022: eightball-v2 is EXCLUDED from the disjointness sweep —
  // by contract it allocates NO new decision ids and instead reuses the
  // frozen v1 8-ball rows verbatim (ids 1-5 keep their frozen GLOBAL
  // meanings; new ids for future variants come from the P21+ namespace,
  // research R12). The reuse is pinned value-for-value just below.
  // Feature 025 (issue #65): fourteenone-v1 allocates id 11
  // (break_violation) — the first ADDITIVE growth past the frozen v4
  // 1-10 space; the codec table gains 11:2 in the same commit.
  // Feature 026 (GH-343): tenball-v1 allocates ids 12 (pushout_response,
  // WPA 6.4) + 13 (wrongful_pot, WPA 6.6); the codec table gains 12:2 +
  // 13:2 in the same commit.
  // GH-371: ids 14 (onepocket spot_nearest), 15 (fourteenone
  // spot_nearest) and 16 (carom contact_respot) are the recorded-request
  // appendices; the codec table gains 14:1/15:1/16:1 in the same commit.
  // GH-383: carom3c-v2 follows the SAME variant-engine law — it
  // allocates no new ids, reusing the frozen carom rows (id 10; id 16
  // per the GH-371 adoption) verbatim (the leveling inning's break_spot
  // option rides the same wire row).
  // GH-382 (build 17): snooker-v2 — like eightball-v2 — is EXCLUDED from
  // the sweep because it REUSES the frozen snooker rows 7/8 verbatim;
  // its one NEW allocation (17 foul_and_a_miss, WPBSA Sec3 R14 —
  // renumbered past the GH-371 14-16 allocations) joins the global
  // space here and the codec table gains 17:3 in the same commit. The
  // reuse + allocation are pinned value-for-value below.
  // GH-491 (build 18): heyball-v1 allocates ids 18-23 (the II.6 break
  // option matrices + the II.21 stalemate agreement); the codec table
  // gains 18:3/19:3/20:2/21:3/22:2/23:1 in the same commit.
  const ids = catalog.rulesets
    .filter((e) => e.id !== 'eightball-v2' && e.id !== 'carom3c-v2'
      && e.id !== 'snooker-v2')
    .flatMap((e) => e.decisions.map((d) => d.id))
    .concat(entry('snooker-v2').decisions
      .map((d) => d.id).filter((id) => id > 13))
    .sort((a, b) => a - b);
  assert.deepEqual(ids,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
      18, 19, 20, 21, 22, 23],
    'the share-codec global decision id space (v4 rows 1-10 + the '
    + 'feature-025 appendix 11 + the feature-026 appendix 12/13 + the '
    + 'GH-371 appendices 14-16 + the GH-382 appendix 17 + the GH-491 '
    + 'appendices 18-23)');
  assert.equal(
    JSON.stringify(entry('eightball-v2').decisions),
    JSON.stringify(entry('eightball-v1').decisions),
    'eightball-v2 reuses the v1 8-ball decision rows byte-for-byte '
    + '(no new id allocations)');
  assert.equal(
    JSON.stringify(entry('carom3c-v2').decisions),
    JSON.stringify(entry('carom3c-v1').decisions),
    'carom3c-v2 reuses the v1 carom decision row byte-for-byte '
    + '(no new id allocations — GH-383)');
  assert.equal(
    JSON.stringify(entry('snooker-v2').decisions.slice(0, 2)),
    JSON.stringify(entry('snooker-v1').decisions),
    'snooker-v2 carries the v1 snooker decision rows byte-for-byte '
    + 'before its one GH-382 allocation');
});

// ---- feature 022 (T009 TS pure-data mirror repin): the eightball-v2
// registry-growth rows. The variant engine shares the v1 8-ball foul
// taxonomy and decision table (its config-varying cites are judgment
// data, not taxonomy rows), adds the four config-born terminals, and
// carries the two shipped preset rows (contracts/registry-api.md §4) the
// app picker consumes EXCLUSIVELY from this catalog. The taskHash pins
// are the T003/T004 canonical-byte identities: a crate change that moves
// either hash is a determinism-key change and MUST fail here. -------------------

const WPA_8BALL_CONFIG = {
  break_scratch_bih: 'kitchen',
  call_shot: 'full',
  dry_break_consequence: 'option_tree',
  dry_break_rail_minimum: 4,
  eight_on_break: 'option_tree',
  jumped_ball: 'foul_stay_down',
  open_table_assignment: 'called_pot',
  safety_call: true,
  safety_pot_stays_down: true,
  scratch_on_eight: 'foul',
  // GH-371 schema evolution (variant-config.md par.6): appended axis
  kitchen_rule: 'wpa',
};

const APA_8BALL_CONFIG = {
  break_scratch_bih: 'kitchen',
  call_shot: 'eight_only',
  dry_break_consequence: 're_break',
  dry_break_rail_minimum: 0,
  eight_on_break: 'win_unless_scratch',
  jumped_ball: 'spot_no_foul',
  open_table_assignment: 'take_what_you_make',
  safety_call: false,
  safety_pot_stays_down: false,
  scratch_on_eight: 'loss',
  kitchen_rule: 'wpa',
};

const WPA_8BALL_TASK_HASH =
  'c4e86124aa971b28da0bb033b8f7117f4f45e5fc488ed0cef4d8288c4726dacc';
const APA_8BALL_TASK_HASH =
  'b312498e35602e4d23435144255514586457b90979c731f98cf60ce0f1ef38fe';

test('eightball-v2: v1 foul taxonomy + frozen decisions + v1-plus-config-born terminals', () => {
  const v2 = entry('eightball-v2');
  const v1 = FROZEN['eightball-v1'];
  assert.ok(v1);
  assert.equal(
    JSON.stringify(v2.fouls.slice(0, v1.fouls.length)),
    JSON.stringify(v1.fouls),
    'the v2 foul taxonomy leads with the v1 rows (codes AND cites)');
  // GH-371: the config-gated kitchen pair rides behind the v1 rows
  assert.equal(
    JSON.stringify(v2.fouls.slice(v1.fouls.length)),
    JSON.stringify([
      { code: 'bad-kitchen-shot', cite: 'WPA 3.11 via 4.9' },
      { code: 'kitchen-no-exit', cite: 'WPA 3.11 via 4.9' },
    ]),
    'the GH-371 kitchen_rule rows are additive after the v1 taxonomy');
  assert.equal(
    JSON.stringify(v2.decisions),
    JSON.stringify(v1.decisions),
    'ids 1-5 keep their frozen global meanings');
  assert.deepEqual(v2.terminals, [
    ...v1.terminals,
    // the four config-born terminals (research R5 axes: eight_on_break,
    // scratch_on_eight, dry_break_consequence)
    'eight-on-break', 'eight-on-break-scratch', 'scratch-on-eight',
    'dry-break-loss',
  ]);
  assert.equal(
    sortedStringify(v2.config),
    sortedStringify({
      family: 'eightball',
      configSchema: 'task-config-v1',
      defaultPreset: 'wpa-8ball',
    }),
    'the v2 config block points at the one task-config mechanism');
});

test('presets rows: empty on the five v1 entries, both shipped rows on eightball-v2', () => {
  for (const id of RULESET_IDS.filter(
    (r) => r !== 'eightball-v2' && r !== 'fourteenone-v1'
      && r !== 'carom3c-v2' && r !== 'snooker-v2')) {
    assert.deepEqual(entry(id).presets, [],
      `${id} carries no preset rows (022 additive field)`);
  }
  // GH-382: the snooker family rows — the FR-005 alias default first,
  // then the completion preset (both primary; the taskHash pins are the
  // canonical-byte identities, cross-checked in the crate's
  // variants_registry.rs)
  const snooker = entry('snooker-v2').presets;
  assert.deepEqual(snooker.map((r) => r.id),
    ['wpbsa-snooker', 'wpbsa-snooker-full']);
  assert.equal(snooker[0]?.aliases, 'snooker-v1',
    'the FR-005 default-routing instruction');
  assert.equal(snooker[1]?.aliases, null);
  assert.equal(snooker[0]?.tier, 'primary');
  assert.equal(snooker[1]?.tier, 'primary');
  assert.deepEqual(snooker[1]?.config, {
    free_ball: true, miss_rule: true, touching_ball: true,
  }, 'the completion preset judges all three GH-382 axes');
  const rows = entry('eightball-v2').presets;
  assert.deepEqual(rows.map((r) => r.id), ['wpa-8ball', 'apa-8ball']);

  const [wpa, apa] = rows;
  assert.ok(wpa);
  assert.ok(apa);
  // wpa-8ball: tier primary, pure WPA defaults, the FR-005 alias row
  assert.equal(wpa.family, 'eightball');
  assert.equal(wpa.displayKey, 'settings.variant.wpa-8ball');
  assert.equal(wpa.sourceTitle, 'WPA Rules of Play, Section 4 (8-Ball)');
  assert.equal(wpa.sourceEdition,
    'Effective 2025-09-15 (the 011/012 pinned edition)');
  assert.equal(wpa.sourceUrl, 'https://wpapool.com/rules-of-play/');
  assert.equal(wpa.tier, 'primary');
  assert.equal(wpa.aliases, 'eightball-v1',
    'the FR-005 default-routing instruction: default selections play '
    + 'through the frozen v1 id');
  assert.equal(sortedStringify(wpa.config), sortedStringify(WPA_8BALL_CONFIG));
  assert.equal(wpa.taskHash, WPA_8BALL_TASK_HASH);

  // apa-8ball: tier secondary, the research R5 judged deltas, no alias
  assert.equal(apa.family, 'eightball');
  assert.equal(apa.displayKey, 'settings.variant.apa-8ball');
  assert.equal(apa.sourceTitle,
    'APA 8-Ball Game Rules (APA/CPA Official Team Manual)');
  assert.equal(apa.sourceEdition,
    "League Years '26/27, '27/28 & '28/29 (© 2025 APA)");
  assert.equal(apa.sourceUrl, 'https://rules.poolplayers.com/');
  assert.equal(apa.tier, 'secondary');
  assert.equal(apa.aliases, null);
  assert.equal(sortedStringify(apa.config), sortedStringify(APA_8BALL_CONFIG));
  assert.equal(apa.taskHash, APA_8BALL_TASK_HASH);

  // hash discipline: lowercase-hex sha256, distinct per preset (TASK-OOS
  // exclusion-by-hash rides this separation)
  for (const r of rows) {
    assert.match(r.taskHash, /^[0-9a-f]{64}$/);
  }
  assert.notEqual(wpa.taskHash, apa.taskHash);
});

// ---- feature 025 (issue #65): the fourteenone-v1 registry-growth rows.
// The TS pure-data constants (FOURTEENONE_TARGET_DEFAULT / _TARGETS) pin
// against the crate catalog config; the shipped wpa-14-1 preset row pins
// value-for-value like the eightball-v2 rows (the taskHash is the
// canonical-byte identity of the target-100 envelope — a crate change
// that moves it is a determinism-key change and MUST fail here). ------------

const WPA_14_1_TASK_HASH =
  'fbdb8b75205c0f9c911d7191a2a13e8d2e5f57718a2e66b5268a67ce5eee022a';

test('fourteenone: target constants + the config block byte-consistent with the crate', () => {
  const cat = entry('fourteenone-v1');
  assert.equal(
    sortedStringify(cat.config),
    sortedStringify({
      family: 'fourteenone',
      configSchema: 'task-config-v1',
      defaultPreset: 'wpa-14-1',
      targetDefault: FOURTEENONE_TARGET_DEFAULT,
    }),
    'the fourteenone config block points at the one task-config mechanism');
  assert.ok(FOURTEENONE_TARGETS.includes(FOURTEENONE_TARGET_DEFAULT),
    'the default target is in the sanctioned domain');
});

test('fourteenone: the shipped wpa-14-1 preset row (025 growth repin)', () => {
  const rows = entry('fourteenone-v1').presets;
  assert.deepEqual(rows.map((r) => r.id), ['wpa-14-1']);
  const [row] = rows;
  assert.ok(row);
  assert.equal(row.family, 'fourteenone');
  assert.equal(row.displayKey, 'settings.variant.wpa-14-1');
  assert.equal(row.sourceTitle,
    'WPA Rules of Play, Section 7 (14.1 Continuous Pool)');
  assert.equal(row.sourceEdition,
    'Effective 2025-09-15 (the 011/012 pinned edition)');
  assert.equal(row.sourceUrl, 'https://wpapool.com/rules-of-play/');
  assert.equal(row.tier, 'primary');
  assert.equal(row.aliases, 'fourteenone-v1',
    'the FR-005 default-routing instruction: default selections play '
    + 'through the registry id');
  assert.equal(sortedStringify(row.config),
    sortedStringify({ target: FOURTEENONE_TARGET_DEFAULT }));
  assert.equal(row.taskHash, WPA_14_1_TASK_HASH);
  assert.match(row.taskHash, /^[0-9a-f]{64}$/);
});

// ---- GH-383: the carom3c-v2 registry-growth rows. The variant engine
// keeps the v1 carom decision table (pinned above), extends the foul
// taxonomy with the Art 41.11 wrong-ball foul and the Art 83 announce
// triple, adds the config-born carom-draw terminal (winner 0 sentinel),
// and carries the three shipped preset rows the app picker consumes
// EXCLUSIVELY from this catalog. The taskHash pins are canonical-byte
// identities: a crate change that moves any of them is a
// determinism-key change and MUST fail here. ---------------------------------

const UMB_CAROM_CONFIG = {
  target: 15,
  two_cue_balls: false,
  insufficient_cushions_foul: false,
  equal_innings: false,
};
const UMB_CAROM_2CUE_CONFIG = {
  target: 15,
  two_cue_balls: true,
  insufficient_cushions_foul: true,
  equal_innings: false,
};
const UMB_CAROM_2CUE_EI_CONFIG = {
  target: 15,
  two_cue_balls: true,
  insufficient_cushions_foul: true,
  equal_innings: true,
};
const UMB_CAROM_TASK_HASH =
  '11a9b55baafe6cea3b54075db0645f123b9e27169c6f97d061fe3e2b7f9e2c49';
const UMB_CAROM_2CUE_TASK_HASH =
  'b84ca562c14e9bd58478b3e30bc4845503fd135148edacfa90f19f9d9ee827ee';
const UMB_CAROM_2CUE_EI_TASK_HASH =
  '9341d7077867ffa62757bc4470921172e557d334b0061d3be79ca5091c02aeac';

test('carom3c-v2: v1-plus-GH-383 foul taxonomy, frozen decision row, the draw terminal', () => {
  const v2 = entry('carom3c-v2');
  const v1 = entry('carom3c-v1');
  assert.deepEqual(v2.fouls, [
    ...v1.fouls,
    { code: 'wrong-ball', cite: 'UMB Art 41.11' },
    { code: 'no-cushion', cite: 'UMB Art 83' },
    { code: 'one-cushion', cite: 'UMB Art 83' },
    { code: 'two-cushions', cite: 'UMB Art 83' },
  ], 'the v1 rows stay frozen; the GH-383 fouls append');
  assert.deepEqual(v2.terminals, ['carom-target-reached', 'carom-draw'],
    'the Art 29.4 draw is the config-born terminal (winner 0 sentinel)');
  assert.equal(
    sortedStringify(v2.config),
    sortedStringify({
      family: 'carom3c',
      configSchema: 'task-config-v1',
      defaultPreset: 'umb-carom',
      balls: { breaker: 0, opponent: 1, red: 2 },
    }),
    'the carom3c config block points at the one task-config mechanism');
});

test('carom3c-v2: the three shipped preset rows (GH-383 growth repin)', () => {
  const rows = entry('carom3c-v2').presets;
  assert.deepEqual(rows.map((r) => r.id),
    ['umb-carom', 'umb-carom-2cue', 'umb-carom-2cue-ei']);
  const [def, twoCue, ei] = rows;
  assert.ok(def);
  assert.ok(twoCue);
  assert.ok(ei);
  for (const row of rows) {
    assert.equal(row.family, 'carom3c');
    assert.equal(row.displayKey, `settings.variant.${row.id}`);
    assert.equal(row.sourceTitle,
      'UMB World Rules of Carom Billiard (three cushions)');
    assert.equal(row.sourceEdition,
      '1 January 1989 (Art 92.1; the 011/012 pinned edition)');
    assert.equal(row.sourceUrl,
      'https://files.umb-carom.org/Public/Rules/'
      + 'CAROM%20BILLIARD%20RULES.pdf');
    assert.equal(row.tier, 'primary');
    assert.match(row.taskHash, /^[0-9a-f]{64}$/);
  }
  // umb-carom: the frozen v1 behavior point, FR-005 alias to carom3c-v1
  assert.equal(def.aliases, 'carom3c-v1',
    'the FR-005 default-routing instruction: default selections play '
    + 'through the frozen v1 id');
  assert.equal(sortedStringify(def.config),
    sortedStringify(UMB_CAROM_CONFIG));
  assert.equal(def.taskHash, UMB_CAROM_TASK_HASH);
  // umb-carom-2cue: Art 22/23 per-seat cue balls + the Art 83 letter
  assert.equal(twoCue.aliases, null);
  assert.equal(sortedStringify(twoCue.config),
    sortedStringify(UMB_CAROM_2CUE_CONFIG));
  assert.equal(twoCue.taskHash, UMB_CAROM_2CUE_TASK_HASH);
  // umb-carom-2cue-ei: + the Art 29.4 equal-innings regime
  assert.equal(ei.aliases, null);
  assert.equal(sortedStringify(ei.config),
    sortedStringify(UMB_CAROM_2CUE_EI_CONFIG));
  assert.equal(ei.taskHash, UMB_CAROM_2CUE_EI_TASK_HASH);
  // hash discipline: distinct per preset (TASK-OOS exclusion-by-hash)
  assert.equal(new Set(rows.map((r) => r.taskHash)).size, 3);
});
