// Copyright (c) Meta Platforms, Inc. and affiliates.

// games.test.ts — GameCatalog validation + rack-template permutation pins
// (feature 011 T008; contracts/game-catalog.md). Covers: catalog validates,
// citation-less entries are REJECTED (no bypass tier), readiness-coherence
// rules V5/V6, WPA 4.2 rack legality across a seed sweep on REAL kernel
// scenarios, permutation determinism, the byte-frozen nine_standard
// identity, and entry-count/id drift pins.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GAME, GAME_CATALOG, GameCatalogError, getGameEntry,
  validateGameCatalog, validateGameEntry,
  RACK_TEMPLATES, RACK_TEMPLATE_CITES, RackTemplateError, applyRackTemplate,
  resolveRackTemplate,
  type GameEntry, type RackTemplate, type RackTemplateId,
} from '../src/games/index.js';
import type { Scenario } from '../src/index.js';
import { engine } from './helpers.js';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const eightWpa = (): RackTemplate => {
  const t = resolveRackTemplate('eight_wpa');
  assert.ok(t);
  return t;
};

// ---- catalog validation ------------------------------------------------------

test('the shipped GAME_CATALOG validates', () => {
  validateGameCatalog(GAME_CATALOG);
});

test('every playable ruleset_id resolves in the live rules registry', async () => {
  // drift pin for catalog.ts's import-free REGISTERED_RULESETS mirror
  // (cache-poison discipline): the registry must serve every playable id
  const { getRuleset } = await import('../src/rules/index.js');
  for (const e of GAME_CATALOG.filter((g) => g.readiness === 'playable')) {
    assert.ok(e.ruleset_id);
    assert.equal(getRuleset(e.ruleset_id).id, e.ruleset_id);
  }
});

test('drift pins: 7-entry content freeze, playable ids, default game, lookup semantics', () => {
  // the content freeze (contracts/game-catalog.md): the five 011/012
  // entries + the feature-025 straight_pool growth (issue #65) + the
  // feature-026 ten_ball growth (GH-343) — entries are immutable once
  // shipped, additions APPEND
  assert.deepEqual(GAME_CATALOG.map((e) => e.id).sort(),
    ['carom_3cushion', 'eight_ball', 'heyball', 'nine_ball', 'one_pocket',
      'snooker', 'straight_pool', 'ten_ball']);
  // feature 012 T048 + features 025/026 + GH-491: all eight entries are
  // playable
  const playable = GAME_CATALOG.filter((e) => e.readiness === 'playable')
    .map((e) => e.id).sort();
  assert.deepEqual(playable,
    ['carom_3cushion', 'eight_ball', 'heyball', 'nine_ball', 'one_pocket',
      'snooker', 'straight_pool', 'ten_ball']);
  assert.equal(DEFAULT_GAME, 'nine_ball');
  assert.equal(getGameEntry('nine_ball').ruleset_id, 'nineball-v1');
  assert.equal(getGameEntry('eight_ball').ruleset_id, 'eightball-v1');
  assert.equal(getGameEntry('one_pocket').ruleset_id, 'onepocket-v1');
  assert.equal(getGameEntry('snooker').ruleset_id, 'snooker-v1');
  assert.equal(getGameEntry('carom_3cushion').ruleset_id, 'carom3c-v1');
  assert.equal(getGameEntry('straight_pool').ruleset_id, 'fourteenone-v1');
  assert.equal(getGameEntry('ten_ball').ruleset_id, 'tenball-v1');
  assert.equal(getGameEntry('heyball').ruleset_id, 'heyball-v1');
  assert.equal(getGameEntry('eight_ball').rack_template, 'eight_wpa');
  assert.equal(getGameEntry('nine_ball').rack_template, 'nine_standard');
  assert.equal(getGameEntry('straight_pool').rack_template, 'fourteenone_wpa');
  assert.equal(getGameEntry('ten_ball').rack_template, 'ten_wpa');
  assert.equal(getGameEntry('heyball').rack_template, 'heyball_wpa');
  // GH-491: the Heyball table class is the Chinese eight-ball table
  // alone (WPA Heyball II.3(a); chinese8_pro_9ft — the GH-490/v15 rename)
  assert.deepEqual(getGameEntry('heyball').table_class,
    { kind: 'catalog', table_ids: ['chinese8_pro_9ft'] });
  assert.throws(() => getGameEntry('cutthroat'), GameCatalogError);
});

test('GH-641 pin: pool_pro_9ft_k55 rides the POOL discipline table classes (catalog v18, twinned in v20)', () => {
  // the K55-cushion 9-ft (v18, served since v20 as the neutral twin
  // pool_pro_9ft_k55) is a visible pool-scale 9-ft entry: selectable for
  // the pool disciplines (nine-ball, eight-ball, one-pocket) and never for
  // snooker / carom. legalTableIds() refuses a visible table absent from
  // POOL_9FT_TABLES (review round 12 P1 on PR #642), so this pin is what
  // makes the entry reachable in the app.
  for (const id of ['nine_ball', 'eight_ball', 'one_pocket'] as const) {
    const tc = getGameEntry(id).table_class;
    assert.equal(tc.kind, 'catalog', id);
    const ids = (tc as { kind: 'catalog'; table_ids: string[] }).table_ids;
    assert.ok(ids.includes('pool_pro_9ft_k55'), `${id} must offer the K55-cushion 9-ft (GH-641)`);
  }
  for (const id of ['snooker', 'carom_3cushion'] as const) {
    const tc = getGameEntry(id).table_class;
    // both the served twin and the retired id must stay out
    for (const tableId of ['pool_pro_9ft_k55', 'rasson_ox_9ft']) {
      assert.ok(tc.kind !== 'catalog'
        || !(tc as { kind: 'catalog'; table_ids: string[] })
          .table_ids.includes(tableId), `${id} must not offer ${tableId}`);
    }
  }
});

test('FR-015 pin: chinese8_pro_9ft rides every POOL discipline table class (012 T048)', () => {
  // the Chinese eight-ball table is selectable as equipment for the pool
  // disciplines only (8-ball, 9-ball, one-pocket). v15/GH-490: the class
  // member is the de-branded chinese8_pro_9ft; the joy_q8_9ft alias is
  // ui_hidden resolve-only and must stay OUT of every class list.
  for (const id of ['nine_ball', 'eight_ball', 'one_pocket'] as const) {
    const tc = getGameEntry(id).table_class;
    assert.equal(tc.kind, 'catalog', id);
    const ids = (tc as { kind: 'catalog'; table_ids: string[] }).table_ids;
    assert.ok(ids.includes('chinese8_pro_9ft'),
      `${id} must offer the Chinese 8-ball table (FR-015)`);
    assert.ok(!ids.includes('joy_q8_9ft'),
      `${id}: the deprecated alias must never be a pickable class member`);
    // catalog v20 (#789): the six newly ui_hidden old table ids are
    // resolve-only rename aliases of their neutral twins, OUT of every class
    for (const old of ['diamond_redlabel_9ft', 'diamond_proam_9ft', 'predator_apex_9ft',
      'diamond_proam_8ft', 'diamond_proam_7ft', 'rasson_ox_9ft']) {
      assert.ok(!ids.includes(old),
        `${id}: the v20 rename alias ${old} must never be a pickable class member`);
    }
    validateGameEntry(getGameEntry(id)); // V4 re-proof: id resolves visible
  }
  // the non-pool disciplines never get the pool-scale table
  for (const id of ['snooker', 'carom_3cushion'] as const) {
    const tc = getGameEntry(id).table_class;
    assert.ok(tc.kind !== 'catalog'
      || !(tc as { kind: 'catalog'; table_ids: string[] })
        .table_ids.includes('chinese8_pro_9ft'), id);
  }
});

test('GH-491 (review r2): heyball call_shot is the null no-call-rules '
  + 'discriminator (data-model.md §2; WPA Heyball II.11)', () => {
  assert.equal(getGameEntry('heyball').call_shot, null);
});

test('every provenance pin is the current WPA edition (research.md R1)', () => {
  for (const e of GAME_CATALOG.filter((g) => g.discipline_family === 'pool')) {
    assert.equal(e.provenance.body, 'WPA');
    // GH-491: Heyball rides its own standalone WPA rulebook (the
    // consolidated 2025-09-15 Rules of Play defers to it) — pinned at
    // docs/research/rules-audit/heyball-rulebook-pin.md
    if (e.id === 'heyball') {
      assert.equal(e.provenance.rulebook, 'Rules of Heyball');
      assert.equal(e.provenance.edition, 'effective 2025-08-16');
    } else {
      assert.equal(e.provenance.edition, 'effective 2025-09-15');
    }
    assert.ok(e.provenance.url.startsWith('https://'));
  }
});

test('citation-required: stripped clones are rejected, never lower-tier', () => {
  const base = getGameEntry('eight_ball');
  for (const field of
    ['body', 'rulebook', 'edition', 'url', 'sections'] as const) {
    const bad = clone(base);
    bad.provenance[field] = '';
    assert.throws(() => validateGameEntry(bad), GameCatalogError,
      `provenance.${field} empty must reject`);
  }
  const noProv = clone(base) as { provenance?: unknown };
  delete noProv.provenance;
  assert.throws(() => validateGameEntry(noProv as GameEntry), GameCatalogError);

  const noFoulCite = clone(base);
  noFoulCite.foul_taxonomy[0]!.cite = '';
  assert.throws(() => validateGameEntry(noFoulCite), GameCatalogError);

  const noTextCite = clone(base);
  noTextCite.legal_shot.cite = '';
  assert.throws(() => validateGameEntry(noTextCite), GameCatalogError);
});

test('reference resolution: unknown ballset / hidden table / bad rack rejected', () => {
  const base = getGameEntry('nine_ball');
  const badBallset = clone(base);
  badBallset.ballset_ids = ['aramith_pool', 'ivory_antique'];
  assert.throws(() => validateGameEntry(badBallset), /ballset/);

  const hiddenTable = clone(base);
  (hiddenTable.table_class as { table_ids: string[] }).table_ids =
    ['wpa_generic_9ft']; // resolves but ui_hidden — V4 rejects
  assert.throws(() => validateGameEntry(hiddenTable), /ui_hidden/);

  const wrongDomain = clone(base);
  wrongDomain.rack_template = 'eight_wpa'; // 15-ball template on ball_count 9
  assert.throws(() => validateGameEntry(wrongDomain), /V7/);
});

test('readiness coherence V5/V6', () => {
  const playable = getGameEntry('eight_ball');
  const withPrereq = clone(playable);
  withPrereq.prerequisites = [{
    id: 'x', kind: 'ui', description: 'stray', cite: 'WPA 1.1' }];
  assert.throws(() => validateGameEntry(withPrereq), /V5/);

  const nullRuleset = clone(playable);
  nullRuleset.ruleset_id = null;
  assert.throws(() => validateGameEntry(nullRuleset), /V5/);

  // synthetic config_ready entry (the readiness-authoring shape, T027-T029)
  const readiness = clone(playable);
  readiness.id = 'snooker';
  readiness.readiness = 'config_ready';
  readiness.ruleset_id = null;
  readiness.rack_template = 'snooker_wpbsa' as RackTemplateId;
  readiness.ball_count = 21;
  readiness.table_class = { kind: 'missing', prerequisite: 'table-snooker-12ft' };
  readiness.prerequisites = [
    { id: 'table-snooker-12ft', kind: 'equipment',
      description: '12-ft snooker table class (3569x1778 mm)',
      cite: 'WPBSA Sec1 R1(a)' },
    { id: 'rack-snooker-reds-colours', kind: 'rack_template',
      description: '15-red triangle + 6 colours on their spots',
      cite: 'WPBSA Sec3 R2(a)(i)' },
  ];
  validateGameEntry(readiness); // configuration-complete: passes

  const emptyPrereqs = clone(readiness);
  emptyPrereqs.prerequisites = [];
  assert.throws(() => validateGameEntry(emptyPrereqs), /V6|V7/);

  const missingTablePrereq = clone(readiness);
  missingTablePrereq.prerequisites = readiness.prerequisites.filter(
    (p) => p.id !== 'table-snooker-12ft');
  assert.throws(() => validateGameEntry(missingTablePrereq), /V6/);

  const uncitedPrereq = clone(readiness);
  uncitedPrereq.prerequisites[0]!.cite = '';
  assert.throws(() => validateGameEntry(uncitedPrereq), /V2/);

  const rulesetOnReadiness = clone(readiness);
  rulesetOnReadiness.ruleset_id = 'nineball-v1';
  assert.throws(() => validateGameEntry(rulesetOnReadiness), /V6/);
});

test('validateGameCatalog rejects duplicate ids (V8)', () => {
  assert.throws(
    () => validateGameCatalog([...GAME_CATALOG, clone(getGameEntry('nine_ball'))]),
    /duplicate/);
});

// ---- feature 012 T048: the readiness flips (US1-US3 landed) -------------------
// The former config_ready entries (T027-T030; research.md R8) flipped to
// playable: rulesets registered, tables shipped (equipment catalog v6),
// rack templates resolve (T021), prerequisite inventories emptied.

/** Post-flip pins: registered ruleset + resolved table class per entry. */
const FLIPPED: Readonly<Record<string, {
  ruleset: string; tables: readonly string[];
}>> = {
  snooker: { ruleset: 'snooker-v1', tables: ['wpbsa_snooker_12ft'] },
  carom_3cushion: { ruleset: 'carom3c-v1', tables: ['umb_carom_284'] },
  one_pocket: {
    ruleset: 'onepocket-v1',
    tables: ['wpa_spec_9ft', 'pool_pro_9ft_older_gen', 'pool_pro_9ft',
      'pool_pro_9ft_metal_rim', // the v20 twins (older gen, standard, metal rim)
      'pool_pro_8ft', 'pool_pro_7ft', // catalog v18 size variants (GH-621), the v20 twins
      'chinese8_pro_9ft', // FR-015 class member (v15/GH-490 de-brand)
      'pool_pro_9ft_measured', // catalog v8 Measured entry (the v20 twin)
      'pool_pro_9ft_k55'], // catalog v19 (GH-641, appended last at the ceremony), the v20 twin
  },
};
const READINESS_IDS = Object.keys(FLIPPED);

test('T048 flips: the three disciplines are playable, cited, and resolved', () => {
  for (const [id, want] of Object.entries(FLIPPED)) {
    const e = getGameEntry(id);
    assert.equal(e.readiness, 'playable', id);
    assert.equal(e.ruleset_id, want.ruleset, id);
    assert.deepEqual(e.prerequisites, [], `${id}: prerequisites emptied`);
    assert.equal(e.table_class.kind, 'catalog', id);
    assert.deepEqual(
      (e.table_class as { kind: 'catalog'; table_ids: string[] }).table_ids,
      [...want.tables], `${id} table class drifted`);
    validateGameEntry(e); // V5: registered ruleset + resolved catalog class
  }
});

test('snooker pins: WPBSA Sep-2024, 52.5 mm set, 12-ft table resolved', () => {
  const e = getGameEntry('snooker');
  assert.equal(e.provenance.body, 'WPBSA');
  assert.match(e.provenance.edition, /September 2024/);
  assert.equal(e.discipline_family, 'snooker');
  assert.equal(e.ball_count, 21); // 15 reds + 6 colours
  assert.deepEqual(e.ballset_ids, ['snooker']); // resolves (V3 proved it)
  // rack template resolves since 012 T021 (kernel 'snooker' layout)
  assert.equal(e.rack_template, 'snooker_wpbsa');
  assert.equal(resolveRackTemplate(e.rack_template)?.kernel_kind, 'snooker');
  assert.match(e.respot_rules.cite, /Sec3 R7/); // colours respot pin (T027)
});

test('carom pins: UMB 1-Jan-1989 + World Cup 15.12.2025, 61.5 mm set', () => {
  const e = getGameEntry('carom_3cushion');
  assert.equal(e.provenance.body, 'UMB');
  assert.match(e.provenance.edition, /1 January 1989/);
  assert.match(e.provenance.edition, /15\.12\.2025/); // World Cup complement
  assert.equal(e.discipline_family, 'carom');
  assert.equal(e.ball_count, 2); // object balls: red + opponent cue ball
  assert.deepEqual(e.ballset_ids, ['carom']); // resolves (V3 proved it)
  assert.equal(e.rack_template, 'carom_umb');
  // resolves since 012 T021 (kernel 'carom' layout)
  assert.equal(resolveRackTemplate(e.rack_template)?.kernel_kind, 'carom');
});

test('one-pocket pins: WPA §12 primary, OnePocket.org secondary + divergences', () => {
  const e = getGameEntry('one_pocket');
  assert.equal(e.provenance.body, 'WPA'); // primary = world governing body
  assert.equal(e.provenance.edition, 'effective 2025-09-15');
  assert.match(e.provenance.sections, /Sec\. 12 \(12\.1-12\.11\)/);
  // secondary authority recorded with its adoption date...
  assert.match(e.provenance.sections, /OnePocket\.org.*2021-10-09/);
  // ...and the divergences NOTED (research.md R1: scratch placement,
  // three-foul loss), riding the cited turn/foul summary
  assert.match(e.turn_rotation.text, /divergence/i);
  assert.match(e.turn_rotation.text, /OnePocket\.org/);
  assert.match(e.turn_rotation.cite, /secondary OnePocket\.org \(2021-10-09\)/);
  assert.equal(e.discipline_family, 'pool');
  assert.equal(e.ball_count, 15);
  // equipment RESOLVES today (R8): pool ballsets + 9-ft tables + fifteen rack
  assert.deepEqual(e.ballset_ids, ['pool_standard', 'pool_used']);
  assert.equal(e.table_class.kind, 'catalog');
  const t = resolveRackTemplate(e.rack_template);
  assert.ok(t);
  assert.equal(t.id, 'one_pocket_wpa');
  assert.equal(t.kernel_kind, 'fifteen');
  // three-foul tracking is IN scope for one-pocket (12.9 via 3.13 — unlike
  // 8-ball's 3.13 self-exclusion)
  assert.ok(e.foul_taxonomy.some((f) => f.code === 'three-consecutive-fouls'
    && /12\.9 via 3\.13/.test(f.cite)));
});

test('V6 still guards un-shipped rulesets after the T048 flips', () => {
  // the validator keeps REJECTING a config_ready entry that claims a
  // ruleset (V6) — the flip mechanism itself stays honest: flipping back
  // requires nulling the ruleset and restoring a prerequisite inventory
  for (const id of READINESS_IDS) {
    const demoted = clone(getGameEntry(id));
    demoted.readiness = 'config_ready';
    assert.throws(() => validateGameEntry(demoted), /V6/,
      `${id}: config_ready with a live ruleset_id must reject`);
  }
});

test('citation-required re-proof: uncited clones of the flipped entries rejected', () => {
  // US4-AS3 re-proven against the SHIPPED (now playable) shapes: strip any
  // citation layer from a clone and validation must reject — there is no
  // lower tier for these entries either.
  for (const id of READINESS_IDS) {
    const base = getGameEntry(id);
    for (const field of
      ['body', 'rulebook', 'edition', 'url', 'sections'] as const) {
      const bad = clone(base);
      bad.provenance[field] = '';
      assert.throws(() => validateGameEntry(bad), GameCatalogError,
        `${id}: provenance.${field} empty must reject`);
    }
    const noProv = clone(base) as { provenance?: unknown };
    delete noProv.provenance;
    assert.throws(() => validateGameEntry(noProv as GameEntry),
      GameCatalogError, `${id}: missing provenance must reject`);

    const uncitedSummary = clone(base);
    uncitedSummary.scoring_win.cite = '';
    assert.throws(() => validateGameEntry(uncitedSummary), GameCatalogError,
      `${id}: uncited scoring_win must reject`);

    if (base.foul_taxonomy.length > 0) {
      const uncitedFoul = clone(base);
      uncitedFoul.foul_taxonomy[0]!.cite = '';
      assert.throws(() => validateGameEntry(uncitedFoul), /V2/);
    }
  }
});

// ---- rack templates ----------------------------------------------------------

test('template registry: every declared id resolves (012 T021)', () => {
  assert.deepEqual(RACK_TEMPLATES.map((t) => t.id).sort(),
    ['carom_umb', 'eight_wpa', 'fourteenone_wpa', 'heyball_wpa',
      'nine_standard', 'one_pocket_wpa', 'snooker_wpbsa', 'ten_wpa']);
  assert.equal(resolveRackTemplate('snooker_wpbsa')?.kernel_kind, 'snooker');
  assert.equal(resolveRackTemplate('snooker_wpbsa')?.shuffle, 'none');
  assert.equal(resolveRackTemplate('carom_umb')?.kernel_kind, 'carom');
  assert.equal(resolveRackTemplate('carom_umb')?.shuffle, 'none');
  // feature 025 (WPA 7.2): fifteen lattice, NO mandated slots, free
  // seeded shuffle — the one_pocket_wpa shape with its own cite
  assert.equal(resolveRackTemplate('fourteenone_wpa')?.kernel_kind, 'fifteen');
  assert.equal(resolveRackTemplate('fourteenone_wpa')?.shuffle, 'seeded');
  assert.deepEqual(resolveRackTemplate('fourteenone_wpa')?.fixed, {});
  assert.equal(resolveRackTemplate('fourteenone_wpa')?.cite, 'WPA 7.2');
  // feature 026 (WPA 6.2): ten lattice, 1 mandated at the apex slot and
  // the 10 at the triangle-centre slot, seeded shuffle for the rest
  assert.equal(resolveRackTemplate('ten_wpa')?.kernel_kind, 'ten');
  assert.equal(resolveRackTemplate('ten_wpa')?.shuffle, 'seeded');
  assert.deepEqual(resolveRackTemplate('ten_wpa')?.fixed, { 1: 0, 10: 4 });
  assert.equal(resolveRackTemplate('ten_wpa')?.cite, 'WPA 6.2');
  for (const [id, cite] of Object.entries(RACK_TEMPLATE_CITES)) {
    assert.ok(cite.length > 0, `cite for ${id}`);
  }
  assert.equal(eightWpa().cite, 'WPA 4.2');
});

test('nine_standard is the byte-frozen identity (FR-003)', async () => {
  const eng = await engine();
  const json = JSON.stringify(eng.nineBallRack(1234));
  const t = resolveRackTemplate('nine_standard');
  assert.ok(t);
  assert.equal(applyRackTemplate(t, json, 1234), json); // SAME string
});

/** Rack-ball slots in kernel offsets order — the scenario's rack-ball
 * ARRAY order (new_rack_scenario emits the lattice row by row, apex
 * first). NOT a coordinate sort: the kernel's seeded back-row micro-gaps
 * jitter rear-row y by 0.05–0.5 mm, so sorting by (y, x) can move a rear
 * corner ball off its slot index (feature-011 game/flow lane finding). */
function sortedSlots(scenario: Scenario) {
  return scenario.system.balls.filter((b) => b.id !== 0);
}

/** GEOMETRIC rear corners of a fifteen rack: the two extreme-x balls of
 * the max-y row (row membership by half-row-pitch tolerance — immune to
 * the micro-gap jitter that breaks a plain coordinate sort). */
function geometricRearCorners(scenario: Scenario) {
  const balls = scenario.system.balls.filter((b) => b.id !== 0);
  const maxY = Math.max(...balls.map((b) => b.state.pos.y));
  const rowPitch = balls[0]!.params.r * Math.sqrt(3);
  const rear = balls.filter((b) => maxY - b.state.pos.y < rowPitch / 2)
    .sort((a, b) => a.state.pos.x - b.state.pos.x);
  return [rear[0]!, rear[rear.length - 1]!];
}

test('kernel offsets-order pin: fifteen lattice numbering is 8-centered', async () => {
  // pins the array-order slot convention AND the kernel's shipped
  // numbering the permutation is defined over (rack.rs fifteen_offsets:
  // idx+1 with the 5<->8 swap; rear corners are BOTH stripes — the 4.2
  // violation R6 fixes)
  const eng = await engine();
  const ids = sortedSlots(eng.fifteenBallRack(7)).map((b) => b.id);
  assert.deepEqual(ids, [1, 2, 3, 4, 8, 6, 7, 5, 9, 10, 11, 12, 13, 14, 15]);
});

test('eight_wpa permutation: WPA 4.2 legality holds across a seed sweep', async () => {
  const eng = await engine();
  const outputs = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    const original = eng.fifteenBallRack(seed);
    const json = JSON.stringify(original);
    const out = applyRackTemplate(eightWpa(), json, seed);
    const permuted = JSON.parse(out) as Scenario;

    // positions/params byte-untouched: strip ids and compare
    const stripIds = (s: Scenario) => s.system.balls.map((b) => ({
      pos: b.state.pos, vel: b.state.vel, params: b.params }));
    assert.deepEqual(stripIds(permuted), stripIds(original), `seed ${seed}`);
    // cue ball untouched
    assert.equal(permuted.system.balls.find((b) =>
      b.state.pos.y < 0)?.id, 0, `seed ${seed}: cue renumbered`);

    const slots = sortedSlots(permuted);
    // every object id exactly once
    assert.deepEqual(slots.map((b) => b.id).slice().sort((a, b) => a - b),
      Array.from({ length: 15 }, (_, i) => i + 1), `seed ${seed}`);
    // 8 on the row-3 center slot (WPA 4.2)
    assert.equal(slots[4]!.id, 8, `seed ${seed}: 8 not centered`);
    // one ball of EACH group on the two rear corners (WPA 4.2) — checked
    // GEOMETRICALLY (max-y row, extreme x), not via slot indices, so the
    // assertion cannot be self-consistent with the permutation's own slot
    // bookkeeping (the pre-fix circularity that hid the jitter bug)
    const corners = geometricRearCorners(permuted).map((b) => b.id);
    assert.equal(corners.filter((id) => id >= 1 && id <= 7).length, 1,
      `seed ${seed}: corners ${corners} lack exactly one solid`);
    assert.equal(corners.filter((id) => id >= 9 && id <= 15).length, 1,
      `seed ${seed}: corners ${corners} lack exactly one stripe`);

    // determinism: same seed -> identical output bytes
    assert.equal(applyRackTemplate(eightWpa(), json, seed), out);
    outputs.add(slots.map((b) => b.id).join(','));
  }
  // "without purposeful or intentional pattern": the sweep must not
  // collapse onto a handful of fixed numberings
  assert.ok(outputs.size > 30, `only ${outputs.size} distinct permutations`);
});

test('ten_wpa permutation: WPA 6.2 legality holds across a seed sweep '
  + '(feature 026, GH-343 — against REAL kernel ten scenarios)', async () => {
  const eng = await engine();
  const tenWpa = () => {
    const t = resolveRackTemplate('ten_wpa');
    assert.ok(t);
    return t;
  };
  const outputs = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    const original = eng.tenBallRack(seed);
    assert.equal(original.system.balls.length, 11, `seed ${seed}`);
    const json = JSON.stringify(original);
    const out = applyRackTemplate(tenWpa(), json, seed);
    const permuted = JSON.parse(out) as Scenario;

    // positions/params byte-untouched: strip ids and compare
    const stripIds = (s: Scenario) => s.system.balls.map((b) => ({
      pos: b.state.pos, vel: b.state.vel, params: b.params }));
    assert.deepEqual(stripIds(permuted), stripIds(original), `seed ${seed}`);
    // cue ball untouched
    assert.equal(permuted.system.balls.find((b) =>
      b.state.pos.y < 0)?.id, 0, `seed ${seed}: cue renumbered`);

    const slots = permuted.system.balls.filter((b) => b.id !== 0);
    // every object id exactly once
    assert.deepEqual(slots.map((b) => b.id).slice().sort((a, b) => a - b),
      Array.from({ length: 10 }, (_, i) => i + 1), `seed ${seed}`);
    // WPA 6.2 mandates: 1 at the apex slot (array order = kernel offsets
    // order, apex first — the slot law), 10 at the triangle-centre slot.
    // Checked GEOMETRICALLY too: the apex is the min-y rack ball (the
    // rack points at the breaker), the 10 centres row 3 (x ~ 0).
    assert.equal(slots[0]!.id, 1, `seed ${seed}: 1 not at the apex slot`);
    assert.equal(slots[4]!.id, 10, `seed ${seed}: 10 not at the centre slot`);
    const minY = slots.reduce((a, b) =>
      (a.state.pos.y < b.state.pos.y ? a : b));
    assert.equal(minY.id, 1, `seed ${seed}: apex ball is not the 1`);
    const ten = slots.find((b) => b.id === 10)!;
    assert.ok(Math.abs(ten.state.pos.x) < 2e-3,
      `seed ${seed}: the 10 is off the centre column`);

    // determinism: same seed -> identical output bytes
    assert.equal(applyRackTemplate(tenWpa(), json, seed), out);
    outputs.add(slots.map((b) => b.id).join(','));
  }
  // "without purposeful or intentional pattern" (6.2): the sweep must
  // not collapse onto a handful of fixed numberings
  assert.ok(outputs.size > 30, `only ${outputs.size} distinct permutations`);
});

test('eight_wpa corner sides + shuffle actually vary with the seed', async () => {
  const eng = await engine();
  const json = JSON.stringify(eng.fifteenBallRack(3));
  let solidFirst = 0;
  for (let seed = 0; seed < 24; seed++) {
    const slots = sortedSlots(
      JSON.parse(applyRackTemplate(eightWpa(), json, seed)) as Scenario);
    if (slots[10]!.id <= 7) solidFirst += 1;
  }
  assert.ok(solidFirst > 0 && solidFirst < 24,
    `corner side assignment never varied (${solidFirst}/24)`);
});

test('one_pocket_wpa: free seeded shuffle over the full fifteen', async () => {
  const eng = await engine();
  const t = resolveRackTemplate('one_pocket_wpa');
  assert.ok(t);
  const json = JSON.stringify(eng.fifteenBallRack(9));
  const a = applyRackTemplate(t, json, 17);
  assert.equal(applyRackTemplate(t, json, 17), a); // deterministic
  const ids = sortedSlots(JSON.parse(a) as Scenario).map((b) => b.id);
  assert.deepEqual([...ids].sort((x, y) => x - y),
    Array.from({ length: 15 }, (_, i) => i + 1));
});

test('applyRackTemplate rejects mismatched scenarios and bad seeds', async () => {
  const eng = await engine();
  const nineJson = JSON.stringify(eng.nineBallRack(2));
  assert.throws(() => applyRackTemplate(eightWpa(), nineJson, 2),
    RackTemplateError);
  const fifteenJson = JSON.stringify(eng.fifteenBallRack(2));
  assert.throws(() => applyRackTemplate(eightWpa(), fifteenJson, -1),
    RackTemplateError);
  assert.throws(() => applyRackTemplate(eightWpa(), fifteenJson, 1.5),
    RackTemplateError);
});
