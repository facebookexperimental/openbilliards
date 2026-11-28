// Copyright (c) Meta Platforms, Inc. and affiliates.

// validation.test.ts — SDK-side validation mirrors the kernel's rules
// exactly: everything the builder rejects, the kernel also rejects (and the
// builder's accept set simulates cleanly).

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ball, ShotParams, SimOptions, Table } from '../src/index.js';
import {
  CATALOG, DEFAULT_EQUIPMENT, EngineError, ScenarioBuilder, ShotBuilder,
  ValidationError, defaultBallParams, defaultOptions, miscueGeometryOf,
  validateCueParams, validatePlacements, validateRecordShape, validateShot,
} from '../src/index.js';
import { engine } from './helpers.js';

const shot = (over: Partial<ShotParams>): ShotParams =>
  ({ v0: 3, phi: 0, theta: 0, a: 0, b: 0, seed: 1, ...over });

test('shot validation mirrors resolve/strike.rs::validate_shot', () => {
  // Accepts (kernel boundary cases).
  validateShot(shot({ v0: 15 }));
  validateShot(shot({ a: 0.3, b: 0.4 })); // a² + b² = 0.25 exactly
  // Amendment 020 (contact-offset miscue limit): (0.4, 0.4) — commanded
  // radial 0.566 R, contact 0.413 R on the default nickel tip — is inside
  // the envelope (the pre-020 commanded-offset rule rejected it).
  validateShot(shot({ a: 0.4, b: 0.4 }));
  validateShot(shot({ theta: Math.PI / 2 - 1e-9 }));
  // Rejects.
  for (const bad of [
    shot({ v0: 0 }), shot({ v0: -1 }), shot({ v0: 15.1 }), shot({ v0: NaN }),
    shot({ a: 0.5, b: 0.5 }), // miscue: contact 0.516 R > 0.5 R (nickel)
    shot({ theta: Math.PI / 2 }), shot({ theta: -0.1 }),
    shot({ phi: Infinity }), shot({ seed: -1 }), shot({ seed: 1.5 }),
  ]) {
    assert.throws(() => validateShot(bad), ValidationError, JSON.stringify(bad));
  }
});

test('miscue limit is cue-aware and exact at the commanded cap (Amendment 020)', () => {
  const R = 0.028575;
  // Catalog tip curvatures (Dr. Dave TP B.1): nickel 10.6 mm (`standard`,
  // also the break cue), dime 8.95 mm (`standard_dime_tip`).
  for (const tip of [0.0106, 0.00895]) {
    const cue = { tip_radius: tip, ball_radius: R };
    const cap = 0.5 * (1 + tip / R);
    // The commanded axis boundary is accepted EXACTLY (same single
    // rounding on both sides of the comparison) → contact exactly 0.5R.
    for (const [a, b] of [[cap, 0], [-cap, 0], [0, cap], [0, -cap]] as const) {
      validateShot(shot({ a, b }), cue);
    }
    // Beyond the cap: miscue, with the contact offset named.
    assert.throws(() => validateShot(shot({ b: -cap * (1 + 1e-9) }), cue),
      /contact point/);
  }
  // Cue-dependence: between the dime and nickel caps is dime-illegal,
  // nickel-legal; the no-argument default is the kernel-default nickel.
  const mid = 0.25 * (2 + (0.00895 + 0.0106) / R);
  assert.throws(() => validateShot(
    shot({ b: mid }), { tip_radius: 0.00895, ball_radius: R }), ValidationError);
  validateShot(shot({ b: mid }), { tip_radius: 0.0106, ball_radius: R });
  validateShot(shot({ b: mid }));
});

test('miscue contact cap is per-cue and exact at each cue\'s cap (Amendment 021)', () => {
  const R = 0.028575;
  const limit = 1 + 0.0106 / R; // shared nickel-class tip
  // Boundary exact-accept at each cue's own cap: default 0.5 (implicit AND
  // explicit — same bit-identical bound) and the masse_trick 0.58 (Venom
  // W2 measured 0.567–0.579 R band).
  for (const [cap, geom] of [
    [0.5, { tip_radius: 0.0106, ball_radius: R }],
    [0.5, { tip_radius: 0.0106, ball_radius: R, miscue_contact_cap_r: 0.5 }],
    [0.58, { tip_radius: 0.0106, ball_radius: R, miscue_contact_cap_r: 0.58 }],
  ] as const) {
    const capCmd = cap * limit;
    for (const [a, b] of [[capCmd, 0], [-capCmd, 0], [0, capCmd], [0, -capCmd]] as const) {
      validateShot(shot({ a, b }), geom);
    }
    // Beyond the cue's own cap: miscue, the per-cue cap named.
    assert.throws(() => validateShot(shot({ b: -capCmd * (1 + 1e-9) }), geom),
      new RegExp(`${cap} R`));
  }
  // Reference discriminator: a command contact-mapping to 0.55R is
  // trick-legal, default-illegal (both implicit and explicit default cap).
  const cmd055 = 0.55 * limit;
  validateShot(shot({ b: -cmd055 }),
    { tip_radius: 0.0106, ball_radius: R, miscue_contact_cap_r: 0.58 });
  assert.throws(() => validateShot(shot({ b: -cmd055 })), ValidationError);
  assert.throws(() => validateShot(
    shot({ b: -cmd055 }), { tip_radius: 0.0106, ball_radius: R }), ValidationError);
});

test('malformed miscue contact cap fails CLOSED (Amendment 021)', () => {
  const R = 0.028575;
  // Out-of-domain caps mirror the kernel's cue-param rejection (finite,
  // in (0, 0.6] — CueParams::MISCUE_CONTACT_CAP_MAX): they must throw
  // even for a center hit the default geometry would accept.
  for (const cap of [NaN, Infinity, -Infinity, 0, -0.5, 0.61]) {
    assert.throws(() => validateShot(
      shot({}), { tip_radius: 0.0106, ball_radius: R, miscue_contact_cap_r: cap }),
    /miscue_contact_cap_r/, `cap ${cap}`);
  }
  // The 0.6 ceiling itself is in-domain.
  validateShot(shot({}), { miscue_contact_cap_r: 0.6 });
  validateShot(shot({ b: -0.6 * (1 + 0.0106 / R) }), { miscue_contact_cap_r: 0.6 });
});

test('malformed miscue geometry fails CLOSED (review review P2)', () => {
  const R = 0.028575;
  // A non-finite or non-positive radius would make the cap non-finite and
  // silently accept any offset; the kernel rejects such cue/ball params
  // (validate_input, Amendment 012) — the mirror must reject too, even for
  // an offset that the default geometry would accept.
  for (const geom of [
    { tip_radius: NaN, ball_radius: R },
    { tip_radius: Infinity, ball_radius: R },
    { tip_radius: 0, ball_radius: R },
    { tip_radius: -0.0106, ball_radius: R },
    { tip_radius: 0.0106, ball_radius: NaN },
    { tip_radius: 0.0106, ball_radius: Infinity },
    { tip_radius: 0.0106, ball_radius: 0 },
    { tip_radius: 0.0106, ball_radius: -R },
  ]) {
    assert.throws(() => validateShot(shot({ b: 0.1 }), geom), ValidationError,
      JSON.stringify(geom));
  }
  // Partial geometry: a valid explicit field combined with a defaulted one
  // still validates (defaults are the kernel constants, always sane).
  validateShot(shot({ b: 0.1 }), { tip_radius: 0.0106 });
  validateShot(shot({ b: 0.1 }), { ball_radius: R });
  validateShot(shot({ b: 0.1 }), {});
});

test('review P2 (#168): ScenarioBuilder.build() validates against the '
  + 'scenario\'s OWN cue (options.cue + cue-ball radius) — trick-cue '
  + 'scenarios build and simulate; default-cue scenarios still reject', async () => {
  const eng = await engine();
  const table = eng.table();
  const trickParams = CATALOG.cues.find((c) => c.id === 'masse_trick')!.params;
  const R = defaultBallParams().r;
  // Commanded draw contact-mapping to 0.55R: inside the trick 0.58R cap,
  // past the default 0.5R cap.
  const cmd055 = 0.55 * (1 + trickParams.tip_radius / R);
  const s = shot({ v0: 2, phi: Math.PI / 2, b: -cmd055 });
  const base = () => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0, y: 0.3 });

  // options.cue = the resolved masse_trick params → builds AND simulates
  // on the canonical wasm (mirror == kernel).
  const scenario = base()
    .options({ ...defaultOptions(), cue: trickParams })
    .equipment({ ...DEFAULT_EQUIPMENT, cue_id: 'masse_trick' })
    .shot(s).build();
  assert.ok(eng.simulate(scenario).events.length > 0);

  // No options (kernel serde default cue) and explicit default options:
  // the same shot must still reject — no blanket loosening, and equipment
  // ids alone must NOT widen the envelope (the kernel reads options.cue,
  // never the provenance ids; a masse_trick-tagged scenario without the
  // resolved cue in options is kernel-rejected too).
  assert.throws(() => base().shot(s).build(), ValidationError);
  assert.throws(() => base().options(defaultOptions()).shot(s).build(),
    ValidationError);
  const bypassed = base().shot(shot({})).build();
  bypassed.shot = s;
  assert.throws(() => eng.simulate(bypassed), /miscue/);

  // The cue-BALL radius is read from the placed ball (kernel: the struck
  // ball's own R): a smaller snooker ball means a larger tip_radius/R, so
  // the commanded cap for the same 0.5R contact cap is WIDER — pool
  // 0.6855R vs snooker 0.7019R.
  const snookerR = 0.0525 / 2;
  const cmdBetween = 0.69; // between the pool cap 0.6855R and snooker 0.7019R
  const snookerBall = { ...defaultBallParams(), r: snookerR };
  new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6, params: snookerBall })
    .ball(1, { x: 0, y: 0.3, params: snookerBall })
    .shot(shot({ v0: 2, phi: Math.PI / 2, b: -cmdBetween })).build();
  assert.throws(() => base()
    .shot(shot({ v0: 2, phi: Math.PI / 2, b: -cmdBetween })).build(),
    ValidationError);

  // ShotBuilder pass-through: the same command builds with the trick cue's
  // geometry and rejects bare (kernel-default geometry — strict default).
  new ShotBuilder().v0(2).tip(0, -cmd055).build(trickParams);
  assert.throws(() => new ShotBuilder().v0(2).tip(0, -cmd055).build(),
    ValidationError);

  // miscueGeometryOf: the catalog-id resolver used by the share codec
  // yields exactly the equipped composition's geometry.
  const geom = miscueGeometryOf({
    table_id: 'wpa_generic_9ft', cloth_id: 'simonis_860_tournament',
    ballset_id: 'aramith_pool', cue_id: 'masse_trick',
    cushion_model_id: 'han2005_default',
  });
  assert.equal(geom.tip_radius, trickParams.tip_radius);
  assert.equal(geom.miscue_contact_cap_r, 0.58);
  assert.equal(geom.ball_radius, R);
  validateShot(s, geom);
});

test('dwell cue fields pass through and fail CLOSED (Amendment 024, #212)', async () => {
  const eng = await engine();
  const table = eng.table();
  const base = () => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0, y: 0.3 });
  const std = CATALOG.cues.find((c) => c.id === 'standard')!.params;

  // In-domain dwell cue: validates, builds, and the kernel accepts it.
  const dwellCue = {
    ...std,
    pinch_dwell_gain: 0.54, pinch_jam: 1, pinch_end_mass: 0.02,
    pinch_press_scale: 0.17,
  };
  validateCueParams(dwellCue);
  const scenario = base()
    .options({ ...defaultOptions(), cue: dwellCue })
    .shot(shot({ v0: 2, phi: Math.PI / 2, b: -0.3, theta: 1.3 })).build();
  assert.ok(eng.simulate(scenario).events.length > 0);

  // Absent optional fields = the kernel serde defaults — always pass.
  validateCueParams(std);

  // Domain boundaries accept exactly (kernel: [0, 1] / [0, 1] /
  // {0} ∪ [end_mass, 0.05] / [0, 1]).
  validateCueParams({ ...std, pinch_dwell_gain: 0, pinch_jam: 0, pinch_press_scale: 0 });
  validateCueParams({ ...std, pinch_dwell_gain: 1, pinch_jam: 1, pinch_press_scale: 1 });
  validateCueParams({ ...std, pinch_end_mass: 0 });
  validateCueParams({ ...std, pinch_end_mass: std.end_mass });
  validateCueParams({ ...std, pinch_end_mass: 0.05 });

  // Out-of-domain values fail CLOSED (mirror of the kernel's
  // validate_input Amendment-024 block), through the builder too.
  for (const bad of [
    { pinch_dwell_gain: -0.1 }, { pinch_dwell_gain: 1.01 },
    { pinch_dwell_gain: NaN }, { pinch_dwell_gain: Infinity },
    { pinch_jam: -1 }, { pinch_jam: 1.5 }, { pinch_jam: NaN },
    { pinch_end_mass: -0.01 }, { pinch_end_mass: std.end_mass / 2 },
    { pinch_end_mass: 0.051 }, { pinch_end_mass: NaN },
    { pinch_press_scale: -0.2 }, { pinch_press_scale: 1.2 },
    { pinch_press_scale: NaN },
  ] as const) {
    const cue = { ...std, ...bad };
    assert.throws(() => validateCueParams(cue), ValidationError,
      JSON.stringify(bad));
    assert.throws(() => base()
      .options({ ...defaultOptions(), cue })
      .shot(shot({})).build(), ValidationError, JSON.stringify(bad));
  }
});

test('structural shaft fields validate, never move physics, and fail '
  + 'CLOSED (Amendment 025, #277)', async () => {
  const eng = await engine();
  const table = eng.table();
  const base = () => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0, y: 0.3 });
  const std = CATALOG.cues.find((c) => c.id === 'standard')!.params;

  // In-domain structural cue: validates, builds, and the kernel accepts
  // it (fields are render-side data — the strike solve never reads them).
  const shaftCue = {
    ...std, shaft_first_mode_hz: 45, shaft_damping_ratio: 0.05,
  };
  validateCueParams(shaftCue);
  const spun = () => shot({ v0: 3, phi: Math.PI / 2 + 0.03, a: 0.2, b: -0.25 });
  const withCue = (cue: typeof std) => base()
    .options({ ...defaultOptions(), cue }).shot(spun()).build();
  const rec = eng.simulate(withCue(shaftCue));
  assert.ok(rec.events.length > 0);

  // EMPTY-DIVERGENCE mirror of the kernel pin
  // (event_loop.rs::shaft_fields_never_move_physics): the event stream is
  // deep-equal to the default cue's — only the options.cue echo differs.
  const baseline = eng.simulate(withCue(std));
  assert.deepEqual(rec.events, baseline.events,
    'shaft fields must not move a physics byte');

  // Absent optional fields = the kernel serde defaults — always pass.
  validateCueParams(std);

  // Domain boundaries (kernel: Hz INCLUSIVE [8, 200]; zeta EXCLUSIVE
  // (0, 1)) accept exactly.
  validateCueParams({ ...std, shaft_first_mode_hz: 8 });
  validateCueParams({ ...std, shaft_first_mode_hz: 200 });
  validateCueParams({ ...std, shaft_damping_ratio: 1e-12 });
  validateCueParams({ ...std, shaft_damping_ratio: 1 - 1e-12 });

  // Out-of-domain values fail CLOSED (mirror of the kernel's
  // validate_input Amendment-025 block), through the builder too.
  for (const bad of [
    { shaft_first_mode_hz: 7.9 }, { shaft_first_mode_hz: 200.1 },
    { shaft_first_mode_hz: 0 }, { shaft_first_mode_hz: -27 },
    { shaft_first_mode_hz: NaN }, { shaft_first_mode_hz: Infinity },
    { shaft_damping_ratio: 0 }, { shaft_damping_ratio: 1 },
    { shaft_damping_ratio: -0.02 }, { shaft_damping_ratio: 1.5 },
    { shaft_damping_ratio: NaN }, { shaft_damping_ratio: Infinity },
  ] as const) {
    const cue = { ...std, ...bad };
    assert.throws(() => validateCueParams(cue), ValidationError,
      JSON.stringify(bad));
    assert.throws(() => base()
      .options({ ...defaultOptions(), cue })
      .shot(shot({})).build(), ValidationError, JSON.stringify(bad));
  }

  // Explicit null fails CLOSED (the #232 P2b undefined-only rule covers
  // the new fields through the shared validator).
  for (const field of ['shaft_first_mode_hz', 'shaft_damping_ratio'] as const) {
    const cue = { ...std, [field]: null } as unknown as typeof std;
    assert.throws(() => validateCueParams(cue),
      new RegExp(`${field} null`), field);
  }
});

test('explicit null dwell fields fail CLOSED — only undefined defaults '
  + '(issue #232 P2b)', async () => {
  const eng = await engine();
  const table = eng.table();
  const std = CATALOG.cues.find((c) => c.id === 'standard')!.params;
  const base = () => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0, y: 0.3 });

  // `??` used to swallow an explicit null (nullish) into the default, so
  // the field passed validation but SERIALIZED as null — which the kernel
  // rejects for f64. The validator now defaults only `undefined`;
  // anything else, null included, fails closed on every dwell field.
  for (const field of ['pinch_dwell_gain', 'pinch_jam', 'pinch_end_mass',
    'pinch_press_scale'] as const) {
    // Untyped-JS shape: TS types forbid null, runtime callers do not.
    const cue = { ...std, [field]: null } as unknown as typeof std;
    assert.throws(() => validateCueParams(cue),
      new RegExp(`${field} null`), field);
    assert.throws(() => base()
      .options({ ...defaultOptions(), cue })
      .shot(shot({})).build(), ValidationError, field);
    // Kernel parity (fail-closed at the same spot the kernel rejects):
    // bypassing the SDK validator, the null field serializes as JSON null
    // and the wasm kernel refuses the scenario.
    const bypassed = base().shot(shot({})).build();
    bypassed.options = { ...defaultOptions(), cue };
    assert.throws(() => eng.simulate(bypassed), /error|invalid|null/i,
      `kernel must reject serialized null ${field}`);
  }
  // The same fix covers the two pre-024 optional fields in the shared
  // validator (identical `??` bug class, same function).
  for (const field of ['tip_cor', 'miscue_contact_cap_r'] as const) {
    const cue = { ...std, [field]: null } as unknown as typeof std;
    assert.throws(() => validateCueParams(cue),
      new RegExp(`${field} null`), field);
  }
  // undefined stays the kernel-default path: both explicit-undefined
  // (an untyped-JS shape — exactOptionalPropertyTypes forbids it in TS)
  // and absent keys validate exactly as before.
  validateCueParams(
    { ...std, pinch_dwell_gain: undefined } as unknown as typeof std);
  validateCueParams(std);
});

test('every SDK-rejected shot is also kernel-rejected', async () => {
  const eng = await engine();
  const table = eng.table();
  const base = () => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0, y: 0.3 });
  for (const bad of [shot({ v0: 16 }), shot({ a: 0.5, b: 0.5 }), shot({ theta: 2 })]) {
    assert.throws(() => base().shot(bad).build(), ValidationError);
    // Bypass the builder: the kernel must reject the same input.
    const scenario = base().shot(shot({})).build();
    scenario.shot = bad;
    assert.throws(() => eng.simulate(scenario), EngineError);
  }
});

test('newly-legal contact-offset commands simulate on the canonical wasm', async () => {
  // Amendment 020 end-to-end: a command inside the widened envelope
  // (commanded 0.68R draw, contact 0.496R on the default nickel cue)
  // simulates cleanly on the COMMITTED canonical kernel; past the cap
  // (0.70R) the kernel rejects. Mirrors the pool-py round-trip gate.
  const eng = await engine();
  const base = () => new ScenarioBuilder(eng.table())
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0, y: 0.3 });
  const ok = base().shot(shot({ v0: 2, phi: Math.PI / 2, b: -0.68 })).build();
  assert.ok(eng.simulate(ok).events.length > 0);
  const past = base().shot(shot({})).build();
  past.shot = shot({ v0: 2, phi: Math.PI / 2, b: -0.7 });
  assert.throws(() => eng.simulate(past), /miscue/);
});

test('placement validation mirrors sim/event_loop.rs::validate_input', async () => {
  const eng = await engine();
  const table = eng.table();
  const ok = new ShotBuilder().v0(2).build();
  const r = defaultBallParams().r;

  // duplicate ids
  assert.throws(() => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: 0 }).ball(0, { x: 0.5, y: 0 }).shot(ok).build(),
    /duplicate ball ids/);
  // missing cue
  assert.throws(() => new ScenarioBuilder(table)
    .ball(1, { x: 0, y: 0 }).shot(ok).build(), /missing cue ball/);
  // no balls
  assert.throws(() => new ScenarioBuilder(table).shot(ok).build(), /no balls/);
  // overlap (gap below 2R − Eps::KISS)
  assert.throws(() => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: 0 }).ball(1, { x: 2 * r - 1e-5, y: 0 }).shot(ok).build(),
    /overlap/);
  // out of bounds
  assert.throws(() => new ScenarioBuilder(table)
    .ball(0, { x: table.width / 2 + 2 * r, y: 0 }).shot(ok).build(),
    /outside playing surface/);

  // Kernel agreement for the overlap + bounds rejects (builder bypassed).
  const overlapping = new ScenarioBuilder(table)
    .ball(0, { x: 0, y: 0 }).ball(1, { x: 0.5, y: 0 }).shot(ok).build();
  overlapping.system.balls[1]!.state.pos.x = 2 * r - 1e-5;
  assert.throws(() => eng.simulate(overlapping), /overlap/);
  const outside = new ScenarioBuilder(table)
    .ball(0, { x: 0, y: 0 }).ball(1, { x: 0.5, y: 0 }).shot(ok).build();
  outside.system.balls[1]!.state.pos.x = table.width / 2 + 2 * r;
  assert.throws(() => eng.simulate(outside), /outside playing surface/);
});

test('rawBall advanced states mirror the kernel z/motion-consistency rules', async () => {
  const eng = await engine();
  const table = eng.table();
  const ok = new ShotBuilder().v0(2).build();
  const p = defaultBallParams();
  const r = p.r;
  const raw = (state: Partial<Ball['state']>): Ball => ({
    id: 1,
    params: p,
    state: {
      pos: { x: 0, y: 0.3, z: r }, vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary', ...state,
    },
  });
  const build = (b: Ball) => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).rawBall(b).shot(ok).build();

  for (const [bad, why] of [
    // on-bed z != R
    [raw({ pos: { x: 0, y: 0.3, z: 0.1 }, vel: { x: 0, y: 1, z: 0 }, motion: 'Rolling' }),
      /requires motion 'Airborne'/],
    [raw({ pos: { x: 0, y: 0.3, z: r / 2 } }), /must have z == R/],
    // motion/velocity consistency
    [raw({ vel: { x: 0, y: 1, z: 0 }, motion: 'Stationary' }), /Stationary but moving/],
    [raw({ motion: 'Sliding' }), /Sliding but not translating/],
    [raw({ motion: 'Rolling' }), /Rolling but not translating/],
    [raw({ avel: { x: 5, y: 0, z: 0 }, motion: 'Spinning' }), /pure z-spin/],
    // Airborne rules
    [raw({ pos: { x: 0, y: 0.3, z: r / 2 }, vel: { x: 0, y: 0, z: -1 }, motion: 'Airborne' }),
      /below the bed/],
    [raw({ motion: 'Airborne' }), /Airborne requires/],
    // pinch press
    [raw({ vel: { x: 0, y: 1, z: 0 }, motion: 'Rolling', pinch: { k: 1.5, t_rem: 0.01 } }),
      /pinch press requires/],
    [raw({ vel: { x: 0, y: 1, z: 0 }, motion: 'Sliding', pinch: { k: 0.5, t_rem: 0.01 } }),
      /invalid pinch press/],
  ] as const) {
    assert.throws(() => build(bad), ValidationError, JSON.stringify(bad));
    assert.throws(() => build(bad), why, JSON.stringify(bad));
    // The kernel rejects the same input (builder bypassed).
    const scenario = build(raw({}));
    scenario.system.balls[1] = bad;
    assert.throws(() => eng.simulate(scenario), EngineError, JSON.stringify(bad));
  }

  // Kernel agreement on the accept side: a genuine airborne ball simulates.
  const airborne = build(raw({
    pos: { x: 0, y: 0.3, z: 3 * r }, vel: { x: 0, y: 0.5, z: 0.5 },
    avel: { x: 0, y: 0, z: 0 }, motion: 'Airborne',
  }));
  assert.ok(eng.simulate(airborne).events.length > 0);
});


test('Amendment 022 (#164): strike_pinch_model mirrors the kernel serde — '
  + 'typed round-trip on the canonical wasm, omitted default, unknown '
  + 'value rejected', async () => {
  const eng = await engine();
  const table = eng.table();
  // Presets carry NO key (serde-skipped at the CoriolisSlip default —
  // byte parity with every pre-#164 scenario).
  assert.ok(!('strike_pinch_model' in defaultOptions()));

  // A grounded pinch massé (θ = 72° > the 60° onset) — the only regime
  // where the two decompositions differ.
  const pinch = shot({ v0: 2, phi: Math.PI / 2, theta: (72 * Math.PI) / 180, b: -0.3 });
  const build = (opts: SimOptions) => new ScenarioBuilder(table)
    .ball(0, { x: 0, y: -0.6 }).ball(1, { x: 0.5, y: 0.3 })
    .options(opts).shot(pinch).build();

  // Explicit LegacyFrontload: typed (no cast), simulates, and the record
  // echoes the key — the documented pre-#164 replay path is reachable
  // from TS.
  const legacy = eng.simulate(
    build({ ...defaultOptions(), strike_pinch_model: 'LegacyFrontload' }));
  assert.equal(legacy.options.strike_pinch_model, 'LegacyFrontload');
  // Explicit CoriolisSlip: kernel serde skips the key at the default, so
  // the record round-trips WITHOUT it (the Amendment-018 discipline).
  const def = eng.simulate(
    build({ ...defaultOptions(), strike_pinch_model: 'CoriolisSlip' }));
  assert.ok(!('strike_pinch_model' in def.options));
  // …and equals the key-less default exactly.
  const keyless = eng.simulate(build(defaultOptions()));
  assert.deepEqual(def.events, keyless.events);
  // The two decompositions genuinely diverge at a pinch strike.
  assert.notDeepEqual(legacy.events, def.events);

  // Shape validation rejects an unknown variant (the CushionModel
  // unknown-value precedent).
  const patched = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>;
  (patched.options as Record<string, unknown>).strike_pinch_model = 'Bogus';
  assert.throws(() => validateRecordShape(patched), /unknown StrikePinchModel/);
});

test('kernel-legal kiss gap is accepted by both SDK and kernel', async () => {
  const eng = await engine();
  const r = defaultBallParams().r;
  const scenario = new ScenarioBuilder(eng.table())
    .ball(0, { x: 0, y: -0.3 })
    .ball(1, { x: 0, y: -0.3 + 2 * r }) // exact contact: gap 0 ≥ −Eps::KISS
    .shot(new ShotBuilder().v0(1).phi(Math.PI / 2).build())
    .build();
  const rec = eng.simulate(scenario);
  assert.ok(rec.events.length > 0);
});

test('GH-595: validatePlacements rejects a ball resting inside a pocket '
  + 'capture disc (mirrors sim/event_loop.rs::validate_input)', () => {
  const r = defaultBallParams().r;
  const mkBall = (id: number, x: number, y: number): Ball => ({
    id,
    params: defaultBallParams(),
    state: {
      pos: { x, y, z: r },
      vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 },
      motion: 'Stationary',
    },
  });
  // The v16 chinese8 corner disc (Ø105 about O_f at ±(L/2+3.5mm) x
  // ±(W/2+3.5mm)) reaches into the rectangular placement envelope. width/
  // length + the corner pocket only — validatePlacements reads exactly those.
  const table = {
    width: 1.26,
    length: 2.54,
    linear: [],
    circular: [],
    pockets: [{ center: { x: 0.6335, y: 1.2735, z: 0 }, radius: 0.0525 }],
    cushion_response: {},
  } as unknown as Table;
  // Extreme-corner clamp point (hw−r−1e-4, hl−r−1e-4) = (0.601325, 1.241325):
  // inside the loose bounds but strictly inside the corner disc (#595 figures).
  const clamp = { x: 1.26 / 2 - r - 1e-4, y: 2.54 / 2 - r - 1e-4 };
  assert.throws(
    () => validatePlacements([mkBall(0, 0, 0), mkBall(1, clamp.x, clamp.y)], table),
    /pocket capture disc/,
  );
  // Control: a legal interior placement is accepted (guard not over-broad).
  assert.doesNotThrow(
    () => validatePlacements([mkBall(0, 0, 0), mkBall(1, 0.3, -0.3)], table),
  );
});
