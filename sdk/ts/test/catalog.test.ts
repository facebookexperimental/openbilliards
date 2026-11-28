// Copyright (c) Meta Platforms, Inc. and affiliates.

// catalog.test.ts — the registry drift gate: the hand-mirrored CATALOG in
// src/catalog.ts must deep-equal the canonical wasm's own catalog_json()
// (values AND shape), plus the equipment plumbing on Engine/ScenarioBuilder.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOG, CATALOG_ALIAS_DIGESTS, CATALOG_VERSION, DEFAULT_EQUIPMENT,
  DISCIPLINE_DEFAULT_CUE_IDS,
  EQUIPMENT_AXES,
  EquipmentError, calibrationKind, catalogEntry, fnv1a64Hex,
  isDefaultEquipment,
  validateEquipmentIds, type EquipmentAxis,
} from '../src/catalog.js';
import {
  ScenarioBuilder, scenarioToJson, validateCueParams, validateShot,
  type KernelModule,
} from '../src/index.js';
import { engine } from './helpers.js';

test('CATALOG mirror matches the kernel catalog_json() exactly', async () => {
  const eng = await engine();
  const kernel = JSON.parse(eng.kernel.catalog_json()) as unknown;
  assert.deepEqual(kernel, JSON.parse(JSON.stringify(CATALOG)),
    'src/catalog.ts drifted from the kernel registry — regenerate the mirror');
  assert.equal(CATALOG.version, CATALOG_VERSION);
  // typed accessor returns the same registry
  assert.deepEqual(eng.catalog(), kernel);
});

test('catalog v20 (#789): the SDK digest alias table matches the kernel '
  + 'catalog_alias_digests_json() exactly, and the BigInt FNV-1a 64 form '
  + 'reproduces the published vectors', async () => {
  const eng = await engine();
  // local cast: the public KernelModule type does not name the export
  const kernel = eng.kernel as KernelModule
    & { catalog_alias_digests_json(): string };
  assert.deepEqual(
    JSON.parse(JSON.stringify(CATALOG_ALIAS_DIGESTS)),
    JSON.parse(kernel.catalog_alias_digests_json()) as unknown,
    'CATALOG_ALIAS_DIGESTS drifted from the kernel digest alias rows');
  assert.equal(fnv1a64Hex(''), 'cbf29ce484222325');
  assert.equal(fnv1a64Hex('a'), 'af63dc4c8601ec8c');
  assert.equal(fnv1a64Hex('foobar'), '85944171f73967e8');
  // no current catalog id hashes to an alias digest (a current id never
  // reaches the alias branch of validateEquipmentIds)
  const digests = new Set(CATALOG_ALIAS_DIGESTS.map((r) => r.digest));
  assert.equal(digests.size, CATALOG_ALIAS_DIGESTS.length);
  for (const axis of Object.keys(EQUIPMENT_AXES) as EquipmentAxis[]) {
    for (const entry of CATALOG[EQUIPMENT_AXES[axis]]) {
      assert.ok(!digests.has(fnv1a64Hex(entry.id)), `${axis}/${entry.id}`);
    }
  }
});

test('catalog v8+ (Measured tier + owner Pro-Am): entries pinned, '
  + 'current-version assert, drift pins, provenance required', () => {
  // v12: dwell calibration on the NEW masse_trick_dwell entry;
  // masse_trick reverted to its v10 bytes (issue #232). v13: SCHEMA-ONLY
  // structural shaft fields on CueParams, no entry moves (issue #277,
  // Amendment 025) — pinned below: no PRE-v14 cue carries a shaft_* key
  // (the v14 archetypes are the first non-default f1 carriers, pinned in
  // the v14 test; ζ stays default everywhere). v14 (issue #283): seven
  // appended cues + superseded_by metadata on the three branded ids.
  // v15 (GH-490): the Chinese-eight width repin + de-brand rename —
  // chinese8_pro_9ft appended, joy_q8_9ft demoted to a ui_hidden
  // resolve-only alias (pinned below and in the games tests). v16
  // (calibration B1): the chinese8 CORNER geometry repin — entry set
  // unchanged, note rewritten (drift-gated against catalog_json below).
  // v17 (calibration B2 CAL-1): the predator SIDE-mouth repin — entry
  // set unchanged, note rewritten (same drift gate). v18 (GH-621): the
  // Diamond Pro-Am 8-ft / 7-ft size variants APPENDED (additive only; the
  // pocket furniture is the 9-ft spec by struct update in the kernel).
  // v18→19 at the ceremony (Rasson lane OX-A1, GH-641): rasson_ox_9ft APPENDED
  // AFTER the two Diamond variants (Diamond landed first; union in registry order).
  // v20 (#789): the 14 de-branded twins APPENDED after rasson_ox_9ft; the
  // two retired v8 Measured ids leave the mirror behind the digest alias.
  // v21 (GH-1080): the chinese8 corner F2 + middle M-c repin, in place
  // (entry set unchanged, note rewritten; same drift gate).
  assert.equal(CATALOG_VERSION, 21);
  assert.equal(CATALOG.version, 21);
  for (const cue of CATALOG.cues.slice(0, 9)) {
    assert.ok(!('shaft_first_mode_hz' in cue.params)
      && !('shaft_damping_ratio' in cue.params),
      `${cue.id}: v13 was schema-only — no pre-v14 entry carries a shaft_* key`);
  }
  for (const cue of CATALOG.cues) {
    assert.ok(!('shaft_damping_ratio' in cue.params),
      `${cue.id}: no shipped entry overrides the ζ default`);
  }
  // Drift pins: the pre-v8 entries keep their ids IN ORDER (values are
  // byte-gated by the kernel's committed v5 dump + the mirror drift test
  // above); v6 appended three tables and one cloth, v8 appends the two
  // Measured owner Pro-Am entries.
  assert.deepEqual(CATALOG.tables.map((t) => t.id), [
    'wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft',
    'diamond_proam_9ft', 'predator_apex_9ft',
    'wpbsa_snooker_12ft', 'umb_carom_284', 'joy_q8_9ft',
    'chinese8_pro_9ft',
    'diamond_proam_8ft', 'diamond_proam_7ft', // v18 (GH-621), appended
    'rasson_ox_9ft', // GH-641 (Rasson OX), appended last at the ceremony (#644 landed first)
    // v20 (#789): the table twins, appended in their old entries' order
    'pool_pro_9ft_older_gen', 'pool_pro_9ft', 'pool_pro_9ft_metal_rim',
    'pool_pro_9ft_measured', 'pool_pro_8ft', 'pool_pro_7ft',
    'pool_pro_9ft_k55',
  ]);
  assert.deepEqual(CATALOG.cloths.map((c) => c.id), [
    'simonis_860_tournament', 'simonis_760_fast', 'worn_slow',
    'snooker_napped', 'carom_worsted_heated',
    // v20 (#789): the cloth twins, appended in their old entries' order
    'pool_worsted_new', 'pool_worsted_fast', 'pool_worsted_measured',
  ]);
  // NO new cushion models in v6-v14; v9 appended exactly the two
  // visual-variant ballsets (issue #91 — pinned in the v9 test below);
  // v10 appended exactly the masse_trick cue (issue #168); v12 appended
  // exactly the masse_trick_dwell cue and reverted masse_trick to its
  // v10 bytes (issue #232 — pinned in the cue tests below); v14 appended
  // the four archetypes + three de-branding twins (issue #283 — pinned
  // in the v14 test below); v20 (#789) appended the four ballset twins.
  assert.equal(CATALOG.ballsets.length, 10);
  assert.equal(CATALOG.cues.length, 16);
  assert.equal(CATALOG.cushion_models.length, 4);
  // v8 Measured tier: owner entries carry session/date/doc + values WITH
  // uncertainties (docs/verification/pool-9ft-measured-calibration.md).
  // Since v20 the twins carry the two Measured entries; the two retired v8
  // Measured ids stay below only as inputs to the digest alias checks.
  const retiredClothId = 'owner_proam_cloth_2026_07';
  const measuredCloth = CATALOG.cloths.find(
    (c) => c.id === 'pool_worsted_measured')!;
  assert.equal(calibrationKind(measuredCloth.calibration), 'measured');
  assert.ok('Measured' in measuredCloth.calibration);
  const m = (measuredCloth.calibration as
    { Measured: { session: string; date: string; doc: string;
      values: { param: string; value: number; sigma: number }[] } }).Measured;
  assert.equal(m.session, 'pool-9ft-measured-s1');
  assert.equal(m.date, 'at adoption');
  assert.equal(m.doc, 'pool-9ft-measured-calibration.md (internal)');
  assert.ok(m.values.length >= 3);
  for (const v of m.values) assert.ok(v.param && v.sigma > 0, v.param);
  assert.equal(measuredCloth.params.u_s, 0.247);
  const retiredTableId = 'owner_proam_9ft_2026_07';
  const measuredTable = CATALOG.tables.find(
    (t) => t.id === 'pool_pro_9ft_measured')!;
  assert.equal(calibrationKind(measuredTable.calibration), 'measured');
  assert.equal(measuredTable.geometry, 'PoolPro9Ft');
  // v20 digest alias (#789): the retired ids are gone from the mirror, each
  // digest row maps one of them to its twin, and the validator accepts a
  // spec that pins both and returns it unchanged (the sender's ids reach
  // the kernel, so the record bytes stay identical).
  assert.equal(catalogEntry('cloth_id', retiredClothId), undefined);
  assert.equal(catalogEntry('table_id', retiredTableId), undefined);
  assert.deepEqual(
    CATALOG_ALIAS_DIGESTS.map((r) => [r.axis, r.digest, r.neutral_id]), [
      ['table', fnv1a64Hex(retiredTableId), measuredTable.id],
      ['cloth', fnv1a64Hex(retiredClothId), measuredCloth.id],
    ]);
  const retiredSpec = {
    ...DEFAULT_EQUIPMENT, table_id: retiredTableId, cloth_id: retiredClothId,
  };
  assert.equal(validateEquipmentIds(retiredSpec), retiredSpec);
  assert.equal(retiredSpec.table_id, retiredTableId);
  assert.equal(retiredSpec.cloth_id, retiredClothId);
  // the digest step is per axis: a retired table id on the cloth axis stays
  // unknown
  assert.throws(
    () => validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cloth_id: retiredTableId }),
    EquipmentError);
  // discipline entries: geometry variants + pairings
  const table = (id: string) => CATALOG.tables.find((t) => t.id === id)!;
  assert.equal(table('wpbsa_snooker_12ft').geometry, 'WpbsaSnooker12Ft');
  assert.equal(table('wpbsa_snooker_12ft').recommended_cushion_model_id,
    'mathavan_fitted');
  assert.equal(table('umb_carom_284').geometry, 'CaromUmb284');
  // v15 (GH-490): the de-brand rename — both ids share the renamed
  // geometry variant; the old id is picker-hidden but keeps resolving.
  assert.equal(table('joy_q8_9ft').geometry, 'Chinese8Pro9Ft');
  assert.equal(table('joy_q8_9ft').ui_hidden, true);
  assert.equal(table('chinese8_pro_9ft').geometry, 'Chinese8Pro9Ft');
  assert.equal(table('chinese8_pro_9ft').ui_hidden, undefined);
  assert.equal(table('chinese8_pro_9ft').display_name,
    'Chinese 8-ball tournament 9-ft');
  const caromCloth = CATALOG.cloths.find((c) => c.id === 'carom_worsted_heated')!;
  assert.equal(calibrationKind(caromCloth.calibration), 'estimated');
  assert.equal(caromCloth.params.u_s, 0.2);
  assert.equal(caromCloth.params.u_r, 0.01);
  // provenance REQUIRED on every entry (uncited-clone rejection, FR-010)
  for (const axis of Object.keys(EQUIPMENT_AXES) as EquipmentAxis[]) {
    for (const entry of CATALOG[EQUIPMENT_AXES[axis]]) {
      const cal = entry.calibration as
        Record<string, { source?: string; note?: string; doc?: string }>;
      const text = cal['Calibrated']?.source ?? cal['Literature']?.source
        ?? cal['Estimated']?.note ?? cal['Measured']?.doc ?? '';
      assert.ok(text.length >= 20,
        `${axis}/${entry.id}: provenance too thin: ${text}`);
    }
  }
  // the new ids validate through the shared equipment validator
  validateEquipmentIds({
    ...DEFAULT_EQUIPMENT, table_id: 'wpbsa_snooker_12ft',
    cloth_id: 'carom_worsted_heated',
  });
});

test('catalog v9 (issue #91): visual-variant ballsets pinned — params '
  + 'byte-copy the aramith_pool class, no friction override', () => {
  assert.deepEqual(CATALOG.ballsets.map((b) => b.id), [
    'aramith_pool', 'aramith_pool_worn', 'snooker', 'carom',
    'aramith_black', 'arcos_reserve',
    // v20 (#789): the ballset twins, appended in their old entries' order
    'pool_standard', 'pool_used', 'pool_black_cap', 'pool_ivory_gunsight',
  ]);
  const pool = CATALOG.ballsets.find((b) => b.id === 'aramith_pool')!;
  for (const [id, name] of [
    // v20 (#789): the display names are neutral in place (the twin's name
    // plus the legacy-alias suffix)
    ['aramith_black', 'Black-cap tournament (legacy alias)'],
    ['arcos_reserve', 'Ivory gunsight (legacy alias)'],
  ] as const) {
    const e = CATALOG.ballsets.find((b) => b.id === id)!;
    assert.ok(e, `${id} missing from the mirror`);
    assert.equal(e.display_name, name);
    assert.equal(calibrationKind(e.calibration), 'estimated');
    const note = (e.calibration as { Estimated: { note: string } })
      .Estimated.note;
    for (const needle of ['visual variant', 'aramith_pool', 'issue #91']) {
      assert.ok(note.includes(needle), `${id} provenance missing ${needle}`);
    }
    // physics class proof: params deep-equal the aramith_pool class and
    // no ballset-condition friction curve is invented.
    assert.deepEqual(e.params, pool.params, `${id}: params drifted`);
    assert.equal(e.bb_friction, undefined, `${id}: no bb_friction override`);
  }
  // the new ids validate through the shared equipment validator
  for (const id of ['aramith_black', 'arcos_reserve']) {
    validateEquipmentIds({ ...DEFAULT_EQUIPMENT, ballset_id: id });
  }
});

test('catalog v10/v12 (issues #168/#232): masse_trick cue pinned at its '
  + 'v10 bytes — per-cue miscue cap 0.58R, W3 bracket-top mass, NO dwell '
  + 'key (the v11 in-place quartet is reverted), appended id order', () => {
  assert.deepEqual(CATALOG.cues.map((c) => c.id), [
    'standard', 'low_deflection', 'predator_z2', 'predator_314',
    'meucci_reddot', 'break_phenolic', 'standard_dime_tip', 'masse_trick',
    'masse_trick_dwell',
    // catalog v14 (issue #283): archetypes + de-branding twins, appended
    'carbon_ld', 'jump_phenolic', 'snooker_ash', 'carom_conical',
    'pro_ld_pivot_141', 'pro_ld_pivot_118', 'pro_ld_pivot_101',
  ]);
  const e = CATALOG.cues.find((c) => c.id === 'masse_trick')!;
  assert.ok(e, 'masse_trick missing from the mirror');
  assert.equal(e.display_name, 'Massé/trick cue (hard pressed tip)');
  assert.equal(calibrationKind(e.calibration), 'calibrated');
  const src = (e.calibration as { Calibrated: { source: string } })
    .Calibrated.source;
  for (const needle of ['Venom', '#168', '0.567', '0.579', '0.62 kg',
    'venom/report.md (internal)']) {
    assert.ok(src.includes(needle), `provenance missing ${needle}`);
  }
  // The v11 Amendment-024 passages are GONE (issue #232 reversion).
  for (const gone of ['#212', 'masse-shot-1', 'dwell']) {
    assert.ok(!src.includes(gone),
      `v10 provenance must not carry the v11 passage ${gone}`);
  }
  // Params: the exact v10 struct — W3 bracket-top mass, nickel-class tip,
  // standard end_mass, the measured-band cap, and NO dwell key.
  assert.equal(e.params.m, 0.62);
  assert.equal(e.params.tip_radius, 0.0106);
  assert.equal(e.params.miscue_contact_cap_r, 0.58);
  assert.equal(e.params.pinch_dwell_gain, undefined);
  assert.equal(e.params.pinch_jam, undefined);
  assert.equal(e.params.pinch_end_mass, undefined);
  assert.equal(e.params.pinch_press_scale, undefined);
  validateCueParams(e.params);
  // The catalog CueParams passes straight into the validateShot mirror:
  // a commanded draw contact-mapping to 0.55R is trick-legal (cap 0.58)
  // and default-illegal (cap 0.5).
  const ballR = 0.028575;
  const cmd = 0.55 * (1 + e.params.tip_radius / ballR);
  const shot = { v0: 2, phi: 0, theta: 0, a: 0, b: -cmd, seed: 0 };
  validateShot(shot, e.params);
  assert.throws(() => validateShot(shot), /miscue/);
  // the id validates through the shared equipment validator
  validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: 'masse_trick' });
});

test('catalog v12 (issue #232; calibration = the Amendment-024 refit, '
  + '#212): masse_trick_dwell pinned — dwell quartet, 0.58R cap, the '
  + 'masse-shot-1 fitted mass 0.737611 kg, distinct display name; the '
  + 'ONLY pinch_* carrier', () => {
  const e = CATALOG.cues.find((c) => c.id === 'masse_trick_dwell')!;
  assert.ok(e, 'masse_trick_dwell missing from the mirror');
  assert.equal(e.display_name,
    'Massé/trick cue, dwell-calibrated (soft pressed tip)');
  assert.notEqual(e.display_name,
    CATALOG.cues.find((c) => c.id === 'masse_trick')!.display_name);
  assert.equal(calibrationKind(e.calibration), 'calibrated');
  const src = (e.calibration as { Calibrated: { source: string } })
    .Calibrated.source;
  for (const needle of ['#212', '#232', 'masse-shot-1.fit.json',
    'design-212-masse-curve-authority.md section 8', 'jam 1.0 HELD',
    '0.737611', '[0.7, 0.78]', '0.62 kg']) {
    assert.ok(src.includes(needle), `provenance missing ${needle}`);
  }
  // Params: the FULL masse-shot-1 fitted operating point (the fitted cue
  // mass included — the mass the 024 acceptance actually ran), in-domain
  // per validateCueParams.
  assert.equal(e.params.m, 0.737611);
  assert.equal(e.params.tip_radius, 0.0106);
  assert.equal(e.params.miscue_contact_cap_r, 0.58);
  assert.equal(e.params.pinch_dwell_gain, 0.54);
  assert.equal(e.params.pinch_jam, 1.0);
  assert.equal(e.params.pinch_end_mass, 0.0209);
  assert.equal(e.params.pinch_press_scale, 0.1725);
  validateCueParams(e.params);
  // ONLY carrier: every other cue omits every dwell key, and only the two
  // trick entries carry the cap key (pre-021/pre-024 byte shapes).
  for (const c of CATALOG.cues) {
    if (c.id === 'masse_trick_dwell') continue;
    assert.equal(c.params.pinch_dwell_gain, undefined,
      `${c.id}: must keep the pre-024 shape`);
    assert.equal(c.params.pinch_jam, undefined,
      `${c.id}: must keep the pre-024 shape`);
    assert.equal(c.params.pinch_end_mass, undefined,
      `${c.id}: must keep the pre-024 shape`);
    assert.equal(c.params.pinch_press_scale, undefined,
      `${c.id}: must keep the pre-024 shape`);
    if (c.id !== 'masse_trick') {
      assert.equal(c.params.miscue_contact_cap_r, undefined,
        `${c.id}: must keep the pre-021 shape`);
    }
  }
  // The dwell cue's envelope mirrors masse_trick's (same 0.58R cap): the
  // 0.55R-contact draw is legal here too.
  const ballR = 0.028575;
  const cmd = 0.55 * (1 + e.params.tip_radius / ballR);
  validateShot({ v0: 2, phi: 0, theta: 0, a: 0, b: -cmd, seed: 0 }, e.params);
  // the new id validates through the shared equipment validator
  validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: 'masse_trick_dwell' });
});

test('catalog v14 (issue #283): archetypes pinned — carbon_ld byte-adopts '
  + 'the CF-LD regime, jump_phenolic the break band; snooker/carom '
  + 'entries carry the researched masses; first non-default f1 carriers',
() => {
  const cue = (id: string) => CATALOG.cues.find((c) => c.id === id)!;
  const cf = cue('carbon_ld');
  assert.equal(cf.display_name, 'Carbon-fiber ultra-LD shaft (leather tip)');
  assert.equal(calibrationKind(cf.calibration), 'estimated');
  assert.equal(cf.params.end_mass, cue('low_deflection').params.end_mass);
  assert.equal(cf.params.tip_cor, 0.73);
  assert.equal(cf.params.shaft_first_mode_hz, 40.0);
  const jp = cue('jump_phenolic');
  assert.equal(jp.params.m, 0.26);
  assert.equal(jp.params.tip_cor, 0.85);
  assert.equal(jp.params.end_mass, cue('break_phenolic').params.end_mass);
  assert.equal(jp.params.shaft_first_mode_hz, 57.0);
  assert.equal(jp.params.pinch_jam, undefined,
    'phenolic jump tips keep the flight channel (jam stays the 0 default)');
  const sa = cue('snooker_ash');
  assert.equal(sa.params.m, 0.49);
  assert.equal(sa.params.tip_radius, 0.00895);
  assert.equal(sa.params.tip_cor, 0.73);
  assert.equal(sa.params.shaft_first_mode_hz, 28.0);
  const cc = cue('carom_conical');
  assert.equal(cc.params.m, 0.52);
  assert.equal(cc.params.end_mass, 0.0045);
  assert.equal(cc.params.shaft_first_mode_hz, 35.0);
  for (const id of ['carbon_ld', 'jump_phenolic', 'snooker_ash',
    'carom_conical']) {
    const e = cue(id);
    assert.equal(e.superseded_by, undefined, id);
    assert.ok(!('shaft_damping_ratio' in e.params), id);
    validateCueParams(e.params);
    validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: id });
  }
});

test('catalog v14 (issue #283): de-branding twins byte-identical, '
  + 'supersession = exactly the three branded ids, visible names '
  + 'brand-free, discipline default-cue map resolves', () => {
  const cue = (id: string) => CATALOG.cues.find((c) => c.id === id)!;
  const pairs: [string, string][] = [
    ['predator_z2', 'pro_ld_pivot_141'],
    ['predator_314', 'pro_ld_pivot_118'],
    ['meucci_reddot', 'pro_ld_pivot_101'],
  ];
  for (const [branded, twin] of pairs) {
    assert.equal(cue(branded).superseded_by, twin);
    assert.equal(cue(twin).superseded_by, undefined,
      `${twin}: no supersession chains`);
    assert.deepEqual(cue(twin).params, cue(branded).params,
      `${branded}/${twin}: params must be byte-identical`);
    assert.equal(calibrationKind(cue(twin).calibration), 'literature');
    // both ids keep validating (records/share payloads pin the branded id)
    validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: branded });
    validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: twin });
  }
  assert.deepEqual(
    CATALOG.cues.filter((c) => c.superseded_by !== undefined)
      .map((c) => c.id),
    ['predator_z2', 'predator_314', 'meucci_reddot']);
  // picker-visible (non-superseded) display names carry no registered
  // mark — the UI never needs a branded string once the filter lands.
  for (const c of CATALOG.cues.filter((c) => c.superseded_by === undefined)) {
    for (const mark of ['Predator', 'Meucci', '314', 'Z-2', 'Red Dot',
      'Revo']) {
      assert.ok(!c.display_name.includes(mark),
        `${c.id}: visible display name carries ${mark}`);
    }
  }
  // per-discipline default-cue DATA (kernel DISCIPLINE_DEFAULT_CUE_IDS
  // mirror): every mapped id exists, validates, and is not superseded.
  assert.deepEqual(DISCIPLINE_DEFAULT_CUE_IDS, {
    pool: 'standard', snooker: 'snooker_ash', carom: 'carom_conical',
  });
  for (const id of Object.values(DISCIPLINE_DEFAULT_CUE_IDS)) {
    const e = cue(id);
    assert.ok(e, `${id} missing`);
    assert.equal(e.superseded_by, undefined, id);
    validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: id });
  }
});

test('default ids resolve on every axis; helpers agree', () => {
  validateEquipmentIds({ ...DEFAULT_EQUIPMENT });
  assert.ok(isDefaultEquipment({ ...DEFAULT_EQUIPMENT }));
  for (const axis of Object.keys(EQUIPMENT_AXES) as EquipmentAxis[]) {
    const entry = catalogEntry(axis, DEFAULT_EQUIPMENT[axis]);
    assert.ok(entry, `${axis}: default id missing from the registry`);
    assert.ok(entry.display_name.length > 0);
    assert.ok(['calibrated', 'literature', 'estimated', 'measured']
      .includes(calibrationKind(entry.calibration)));
  }
  assert.throws(
    () => validateEquipmentIds({ ...DEFAULT_EQUIPMENT, cue_id: 'broomstick' }),
    EquipmentError);
});

test('Engine racks honor equipment specs (tag + cloth + cue)', async () => {
  const eng = await engine();
  // no-spec arm: byte-identical legacy template (no equipment tag)
  const legacy = eng.nineBallRack(5);
  assert.equal(legacy.system.equipment, undefined);
  const spec = {
    cloth_id: 'worn_slow', cue_id: 'low_deflection',
    cushion_model_id: 'stronge_realistic',
  };
  const rack = eng.nineBallRack(5, spec);
  assert.equal(rack.system.equipment?.cloth_id, 'worn_slow');
  assert.equal(rack.system.equipment?.table_id, DEFAULT_EQUIPMENT.table_id);
  const worn = CATALOG.cloths.find((c) => c.id === 'worn_slow')!;
  assert.equal(rack.system.balls[0]!.params.u_r, worn.params.u_r);
  const ld = CATALOG.cues.find((c) => c.id === 'low_deflection')!;
  assert.equal(rack.options?.cue?.end_mass, ld.params.end_mass);
  // ballset radius drives the geometry
  const snooker = eng.nineBallRack(5, { ballset_id: 'snooker' });
  assert.equal(snooker.system.balls[0]!.params.r, 0.02625);
  assert.equal(snooker.system.table.linear[0]!.height, 0.635 * 2 * 0.02625);
  // unknown ids throw EngineError with the kernel's message
  assert.throws(() => eng.nineBallRack(5, { cloth_id: 'velvet' }),
    /unknown equipment cloth id/);
});

test('ScenarioBuilder.equipment tags scenarios; default omitted', async () => {
  const eng = await engine();
  const table = eng.table();
  const base = () => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.5 })
    .shot({ v0: 1, phi: Math.PI / 2, theta: 0, a: 0, b: 0, seed: 0 });
  const dflt = base().equipment({ ...DEFAULT_EQUIPMENT }).build();
  assert.equal(dflt.system.equipment, undefined,
    'default composition must be omitted (kernel serde parity)');
  assert.equal(scenarioToJson(dflt), scenarioToJson(base().build()));
  const spec = { ...DEFAULT_EQUIPMENT, cloth_id: 'snooker_napped' };
  const tagged = base().equipment(spec).build();
  assert.deepEqual(tagged.system.equipment, spec);
  // the tag is pure metadata: the kernel simulates and echoes it back
  const rec = eng.simulate(tagged);
  assert.deepEqual(
    (rec.initial as { equipment?: unknown }).equipment, spec);
  assert.throws(
    () => base().equipment({ ...DEFAULT_EQUIPMENT, table_id: 'unlisted_table_8ft' }),
    EquipmentError);
});
