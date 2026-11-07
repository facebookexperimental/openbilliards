// Copyright (c) Meta Platforms, Inc. and affiliates.

// harvest-rules-corpus.mjs — feature 013 T002 (research R8): the ONE-TIME
// harvester that freezes scripts/fixtures/rules-corpus.json, the byte
// oracle for the entire rules migration (conformance-gate.md §1).
//
// It replays every judgment-producing invocation from the shipped suites
// through the PRE-MIGRATION pure-TS rulesets:
//   1. the compiled discipline scenario suites (eightball / onepocket /
//      snooker / carom3c / share), run unmodified under the
//      harvest-intercept.mjs `--import` hook (captures every Ruleset
//      method call, successes and RulesError paths);
//   2. the nineball.test.ts synthetic battery, lifted through the
//      `nineball-v1` Ruleset adapter (the crate API surface — the raw
//      legacy judgeShot mapping stays TS-side, rules-crate-api.md §4b);
//   3. the nineball-shots.test.ts real-kernel ScenarioBuilder shots;
//   4. web/tools/fixtures/legacy-links.json adjudication records
//      (re-simulated on the COMMITTED canonical wasm, sha256-pinned);
//   5. docs/sdk/scenarios/*.json one-shots (those with object balls);
//   6. a deterministic sweep of every RulesError site + every decision id
//      1-10 resolution + initial/hud states (coverage-floor closure).
//
// The output file carries the legacy-links.json DO-NOT-REGENERATE
// discipline: regenerating it is a SPEC-LEVEL behavioral event. A byte
// diff at any migration gate is ALWAYS resolved by fixing the crate to
// match these bytes — never by editing the corpus.
//
// Run ONCE from sdk/ts:  node tools/harvest-rules-corpus.mjs

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SDK = path.dirname(TOOLS);                 // sdk/ts
const REPO = path.dirname(path.dirname(SDK));    // repo root
const OUT_PATH = path.join(REPO, 'scripts', 'fixtures', 'rules-corpus.json');
const GLUE = path.join(REPO, 'web', 'dist', 'pool-wasm', 'pool_wasm.js');

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const fail = (msg) => { throw new Error(`harvest FAILED: ${msg}`); };

// ---- 1. build the SDK (the pre-migration pure-TS implementation) ------------

console.log('building sdk/ts (tsc)…');
{
  const r = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'],
    { cwd: SDK, stdio: 'inherit' });
  if (r.status !== 0) fail('tsc build failed');
}

const CAPTURE_DIR = mkdtempSync(path.join(tmpdir(), 'rules-harvest-'));
console.log(`captures -> ${CAPTURE_DIR}`);

// ---- 2. run the shipped discipline suites under the interception hook -------

const SUITES = ['eightball', 'onepocket', 'snooker', 'carom3c', 'share'];
for (const s of SUITES) {
  const file = path.join(CAPTURE_DIR, `10-suite-${s}.jsonl`);
  console.log(`suite ${s}.test.js (intercepted)…`);
  const r = spawnSync(process.execPath,
    ['--import', path.join(TOOLS, 'harvest-intercept.mjs'),
      path.join(SDK, 'dist', 'test', `${s}.test.js`)],
    {
      cwd: SDK, stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, OB_HARVEST_FILE: file },
    });
  if (r.status !== 0) {
    process.stdout.write(String(r.stdout));
    fail(`suite ${s}.test.js exited ${r.status} — harvest requires a green tree`);
  }
}

// ---- 3. in-process supplements through the SAME interception layer ----------

process.env.OB_HARVEST_FILE = path.join(CAPTURE_DIR, '20-supplements.jsonl');
const { classifyRulesError, recordCase, RULESET_IDS } =
  await import('./harvest-intercept.mjs');
const rules = await import('../dist/src/rules/index.js');
const { getRuleset, RulesError } = rules;
const { init, ScenarioBuilder } = await import('../dist/src/index.js');
const { defaultBallParams } = await import('../dist/src/index.js');

const R9 = getRuleset('nineball-v1');
const R8 = getRuleset('eightball-v1');
const R1P = getRuleset('onepocket-v1');
const RSN = getRuleset('snooker-v1');
const RC3 = getRuleset('carom3c-v1');

/** Swallow the expected RulesError (the interceptor already recorded it). */
const expectErr = (fn) => {
  try { fn(); fail('expected a RulesError, got success'); } catch (e) {
    if (!(e instanceof RulesError)) throw e;
  }
};

// synthetic-record plumbing — byte-mirror of the shipped suites' helpers
function mkBall(id) {
  const params = defaultBallParams();
  return {
    id, params,
    state: {
      pos: { x: 0, y: 0, z: params.r }, vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary',
    },
  };
}
function rec(objectIds, events) {
  return {
    kernel_version: 'test', format_version: 1,
    initial: {
      balls: [0, ...objectIds].map((id) => mkBall(id)),
      table: { width: 1.27, length: 2.54 },
    },
    shot: { v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 0 },
    options: {},
    events,
  };
}
const ev = (t, kind) => ({ t, kind, post: [] });
const strike = (t = 0) => ev(t, { Strike: { ball: 0 } });
const bb = (t, b1, b2) => ev(t, { BallBall: { b1, b2 } });
const pot = (t, ball, pocket = 0) => ev(t, { BallPocket: { ball, pocket } });
const rail = (t, ball, seg = 0) => ev(t, { BallLinearCushion: { ball, seg } });
const arc = (t, ball) => ev(t, { BallCircularCushion: { ball, arc: 0 } });
const off = (t, ball) => ev(t, { BallOffTable: { ball } });
const rest = (t) => ev(t, 'Rest');
const transition = (t, ball) =>
  ev(t, { Transition: { ball, from: 'Sliding', to: 'Rolling' } });

// ---- 3a. initial states + HUD projections (all five, both breakers) ---------

for (const id of RULESET_IDS) {
  const rs = getRuleset(id);
  for (const b of [1, 2]) rs.hudState(rs.initialState(b));
}

// ---- 3b. the nineball.test.ts battery, lifted through the adapter -----------

const FULL9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const NINE_BATTERY = [
  [FULL9, [strike(), bb(0.1, 0, 1), pot(0.5, 1), rest(0.8)]],
  [FULL9, [strike(), bb(0.1, 0, 1), bb(0.2, 1, 9), pot(0.6, 9), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), rail(0.4, 0), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), rail(0.3, 1), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), arc(0.3, 1), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), bb(0.2, 1, 3), pot(0.5, 3), rest(1)]],
  [[9], [strike(), bb(0.1, 0, 9), pot(0.5, 9)]],
  [FULL9, [strike(), rest(1)]],
  [FULL9, [strike(), rail(0.2, 0), rail(0.5, 0), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 2), rail(0.4, 2), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), rest(1)]],
  [FULL9, [strike(), rail(0.05, 0), bb(0.1, 0, 1), rest(1)]],
  [FULL9, [strike(), rail(0.5, 0), bb(0.5, 0, 1), rest(1)]],
  [FULL9, [strike(), bb(0.5, 0, 1), rail(0.5, 1), rest(1)]],
  [FULL9, [strike(), bb(0.5, 0, 1), pot(0.5, 1), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), rail(0.3, 1), pot(0.6, 0), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), rail(0.3, 1), off(0.6, 0)]],
  [FULL9, [strike(), bb(0.1, 0, 2), pot(0.6, 0), rest(1)]],
  [FULL9, [strike(), pot(0.3, 0)]],
  [[2, 5, 9], [strike(), bb(0.1, 0, 5), bb(0.2, 5, 9), pot(0.5, 9), rest(1)]],
  [[1, 9], [strike(), bb(0.1, 0, 1), rail(0.3, 1), off(0.6, 9)]],
  [[3, 4, 9], [strike(), bb(0.1, 0, 4), pot(0.5, 4), rest(1)]],
  [[5, 7, 9], [strike(), bb(0.1, 0, 5), pot(0.6, 5), rest(1)]],
  [FULL9, [strike(), bb(0.05, 3, 4), bb(0.1, 0, 1), rail(0.4, 1), rest(1)]],
  [FULL9, [strike(), bb(0.1, 0, 1), transition(0.2, 1), rail(0.4, 1), rest(1)]],
];
for (const [onTable, events] of NINE_BATTERY) {
  for (const shooter of [1, 2]) {
    const j = R9.judge(
      { shooter, onTable, result: null }, rec(onTable, events), null);
    R9.hudState(j.next);
  }
}

// ---- 3c. real-kernel legs: committed canonical wasm -------------------------

const eng = await init(GLUE);

// nineball-shots.test.ts ScenarioBuilder shots (baked constants, seed 7)
{
  const W = 1.27, L = 2.54;
  const PHI = Math.atan2(L / 2, W / 2);
  const nearCorner = (d) => {
    const n = Math.hypot(W / 2, L / 2);
    return [1, W / 2 - (W / 2 / n) * d, L / 2 - (L / 2 / n) * d];
  };
  const SHOTS = [
    [[[0, 0, 0], nearCorner(0.55), [9, -0.4, -0.8]], { v0: 2.5, phi: PHI }],
    [[[0, 0, -0.4], [2, 0, 0.2], [1, -0.5, -1.0], [9, 0.4, 0.9]],
      { v0: 2.0, phi: Math.PI / 2 }],
    [[[0, 0, -0.25], [1, 0, 0.25], [9, 0.4, 0.9]],
      { v0: 0.5, phi: Math.PI / 2 }],
    [[[0, 0, 0], nearCorner(0.3), [9, -0.4, -0.8]],
      { v0: 2.5, phi: PHI, b: 0.45 }],
  ];
  for (const [balls, shot] of SHOTS) {
    const b = new ScenarioBuilder(eng.table());
    for (const [id, x, y] of balls) b.ball(id, { x, y });
    const record = eng.simulate(b.shot(
      { v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 7, ...shot }).build());
    const onTable = balls.filter(([id]) => id !== 0).map(([id]) => id);
    R9.judge({ shooter: 1, onTable, result: null }, record, null);
  }
}

// legacy-links.json adjudication records (sha256-verified re-simulation)
{
  const corpus = JSON.parse(readFileSync(
    path.join(REPO, 'web', 'tools', 'fixtures', 'legacy-links.json'), 'utf8'));
  if (eng.version() !== corpus.kernel_version) {
    fail(`legacy corpus kernel ${corpus.kernel_version} != committed wasm `
      + `${eng.version()}`);
  }
  for (const entry of corpus.entries) {
    entry.scenarios.forEach((scenario, i) => {
      const record = JSON.parse(eng.simulateJson(scenario));
      const h = sha256(JSON.stringify(record));
      if (h !== entry.record_sha256[i]) {
        fail(`legacy ${entry.name} shot ${i}: record sha ${h} != pinned`);
      }
      const onTable = record.initial.balls
        .filter((b) => b.id !== 0 && b.state.motion !== 'Pocketed')
        .map((b) => b.id);
      R9.judge({ shooter: 1, onTable, result: null }, record, null);
    });
  }
}

// docs/sdk/scenarios/*.json one-shots (9-ball table; skip cue-only drills)
{
  const dir = path.join(REPO, 'docs', 'sdk', 'scenarios');
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const fx = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    let scenario;
    if (fx.system && fx.system.rack === 'nine') {
      scenario = eng.nineBallRack(fx.shot.seed);
      scenario.shot = fx.shot;
    } else {
      const table = fx.system.table === 'wpa_9ft'
        ? eng.table(fx.system.balls[0].params.r) : fx.system.table;
      scenario = { system: { balls: fx.system.balls, table }, shot: fx.shot };
    }
    const record = JSON.parse(eng.simulateJson(scenario));
    const onTable = record.initial.balls
      .filter((b) => b.id !== 0 && b.state.motion !== 'Pocketed')
      .map((b) => b.id);
    if (onTable.length === 0) continue; // lag/bank drills: cue ball only
    R9.judge({ shooter: 1, onTable, result: null }, record, null);
  }
}

// ---- 3d. decision-id closure: every id 1-10 resolved at least once ----------

{
  // 8-ball ids 1-5 (dry_break / eight_legal_break / eight_foul_break /
  // break_foul / stalemate)
  const FULL15 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const dry = R8.judge(R8.initialState(1),
    rec(FULL15, [strike(), bb(0.1, 0, 1), rail(0.2, 1), rest(1)]), null);
  for (const choice of [1, 2, 3]) {
    R8.applyDecision(dry.next, { decision: 1, choice });
  }
  const legal8 = R8.judge(R8.initialState(1), rec(FULL15, [
    strike(), bb(0.1, 0, 1),
    rail(0.2, 1), rail(0.2, 2), rail(0.2, 3), rail(0.2, 4),
    pot(0.5, 8), rest(1)]), null);
  for (const choice of [1, 2]) {
    R8.applyDecision(legal8.next, { decision: 2, choice });
  }
  const foul8 = R8.judge(R8.initialState(1), rec(FULL15, [
    strike(), bb(0.1, 0, 1), pot(0.5, 8), pot(0.7, 0), rest(1)]), null);
  for (const choice of [1, 2]) {
    R8.applyDecision(foul8.next, { decision: 3, choice });
  }
  const foulBreak = R8.judge(R8.initialState(1), rec(FULL15, [
    strike(), bb(0.1, 0, 1), rail(0.2, 1), pot(0.5, 0), rest(1)]), null);
  for (const choice of [1, 2]) {
    R8.applyDecision(foulBreak.next, { decision: 4, choice });
  }
  const open = R8.applyDecision(dry.next, { decision: 1, choice: 1 });
  R8.applyDecision(open, { decision: 5, choice: 1 }); // stalemate agreement
  R8.hudState(open);

  // one-pocket ids 6 and 9
  for (const choice of [1, 2]) {
    R1P.applyDecision(R1P.initialState(1), { decision: 6, choice });
  }
  const play1p = R1P.applyDecision(R1P.initialState(1), { decision: 6, choice: 1 });
  for (const choice of [1, 2]) {
    R1P.applyDecision(play1p, { decision: 9, choice });
  }
  R1P.hudState(play1p);

  // snooker ids 7 and 8
  const snFoul = RSN.judge(RSN.initialState(1),
    rec([1, 15, 16, 17, 18, 19, 20, 21],
      [strike(), bb(0.1, 0, 16), rail(0.2, 16), rest(1)]), null);
  for (const choice of [1, 2]) {
    RSN.applyDecision(snFoul.next, { decision: 7, choice });
  }
  const snInit = RSN.initialState(1);
  const tieState = {
    ...snInit, phase: 'final_colours', ballOn: 21,
    scores: { 1: 10, 2: 17 }, onTable: [21],
  };
  const tie = RSN.judge(tieState,
    rec([21], [strike(), bb(0.1, 0, 21), pot(0.5, 21), rest(1)]),
    { kind: 'nominate', ball: 21 });
  for (const choice of [1, 2]) {
    RSN.applyDecision(tie.next, { decision: 8, choice });
  }
  RSN.hudState(tie.next);

  // carom id 10
  for (const choice of [1, 2]) {
    RC3.applyDecision(RC3.initialState(1), { decision: 10, choice });
  }
}

// ---- 3e. discipline floor supplements (breadth beyond the suites) -----------

{
  const playC3 = RC3.applyDecision(RC3.initialState(1), { decision: 10, choice: 2 });
  RC3.hudState(playC3);
  // Art 83 cushion sweep: 0-4 cushions, cannon and no-cannon
  for (let cushions = 0; cushions <= 4; cushions++) {
    for (const cannon of [true, false]) {
      const events = [strike()];
      let t = 0.1;
      events.push(bb(t, 0, 2)); t += 0.1; // red first
      for (let c = 0; c < cushions; c++) { events.push(rail(t, 0)); t += 0.1; }
      if (cannon) { events.push(bb(t, 0, 1)); t += 0.1; }
      events.push(rest(t));
      const j = RC3.judge(playC3, rec([1, 2], events), null);
      RC3.hudState(j.next);
    }
  }
  // break red-first legality both ways + off-table respot + target win
  const breakSpot = RC3.applyDecision(RC3.initialState(2), { decision: 10, choice: 1 });
  RC3.judge(breakSpot,
    rec([1, 2], [strike(), bb(0.1, 0, 1), rest(1)]), null);
  RC3.judge(breakSpot,
    rec([1, 2], [strike(), bb(0.1, 0, 2), bb(0.2, 0, 1), rest(1)]), null);
  RC3.judge(playC3,
    rec([1, 2], [strike(), bb(0.1, 0, 2), off(0.3, 1), rest(1)]), null);
  const nearWin = { ...playC3, points: { 1: 14, 2: 3 } };
  RC3.judge(nearWin, rec([1, 2], [
    strike(), bb(0.1, 0, 2), rail(0.2, 0), rail(0.3, 0), rail(0.4, 0),
    bb(0.5, 0, 1), rest(1)]), null);

  // one-pocket: scratch spot-back, owed repay, three-foul chain
  const P = R1P.applyDecision(R1P.initialState(1), { decision: 6, choice: 1 });
  const FULL15 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const own = P.pockets[1];
  const opp = P.pockets[2];
  let s = P;
  const j1 = R1P.judge(s, rec(s.onTable,
    [strike(), bb(0.1, 0, 1), pot(0.5, 1, own), rest(1)]), null);
  R1P.hudState(j1.next);
  const j2 = R1P.judge(j1.next, rec(j1.next.onTable,
    [strike(), bb(0.1, 0, 2), pot(0.5, 2, opp), pot(0.7, 0), rest(1)]), null);
  const j3 = R1P.judge(j2.next, rec(j2.next.onTable,
    [strike(), rest(1)]), null);
  const j4 = R1P.judge(j3.next, rec(j3.next.onTable,
    [strike(), bb(0.1, 0, 3), pot(0.5, 3, own), pot(0.6, 4, 0), rest(1)]),
  null);
  R1P.hudState(j4.next);
  // consecutive-foul loss chain for the sitting shooter
  let cf = { ...P, consecutiveFouls: { 1: 2, 2: 0 } };
  const j5 = R1P.judge(cf, rec(cf.onTable, [strike(), rest(1)]), null);
  R1P.hudState(j5.next);
  // owed debt repaid immediately by an own-pocket score
  const owedState = { ...P, owed: { 1: 1, 2: 0 } };
  R1P.judge(owedState, rec(owedState.onTable,
    [strike(), bb(0.1, 0, 5), pot(0.5, 5, own), rest(1)]), null);
  // near-win tally
  const near1p = {
    ...P, tallies: { 1: 7, 2: 0 },
    scored: { 1: [1, 2, 3, 4, 5, 6, 7], 2: [] },
    onTable: [8, 9, 10, 11, 12, 13, 14, 15],
  };
  R1P.judge(near1p, rec(near1p.onTable,
    [strike(), bb(0.1, 0, 8), pot(0.5, 8, own), rest(1)]), null);

  // snooker: reds-phase pot, colour after red, final colours descent
  const SN_FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21];
  const sInit = RSN.initialState(1);
  const sj1 = RSN.judge(sInit, rec(SN_FULL,
    [strike(), bb(0.1, 0, 1), pot(0.5, 1), rest(1)]), null);
  RSN.hudState(sj1.next);
  const sj2 = RSN.judge(sj1.next, rec(sj1.next.onTable,
    [strike(), bb(0.1, 0, 21), pot(0.5, 21), rest(1)]),
  { kind: 'nominate', ball: 21 });
  RSN.hudState(sj2.next);
  const finals = { ...sInit, phase: 'final_colours', ballOn: 16,
    onTable: [16, 17, 18, 19, 20, 21] };
  const sj3 = RSN.judge(finals, rec(finals.onTable,
    [strike(), bb(0.1, 0, 16), pot(0.5, 16), rest(1)]),
  { kind: 'nominate', ball: 16 });
  RSN.hudState(sj3.next);
  const dz = RSN.judge(sInit, rec(SN_FULL,
    [strike(), bb(0.1, 0, 1), rail(0.3, 1), pot(0.6, 0), rest(1)]), null);
  RSN.hudState(dz.next);

  // 8-ball: kitchen/anywhere rights + open-table claim judged mid-game
  const FULLSET = FULL15;
  const openState = { ...R8.initialState(1), phase: 'open' };
  R8.judge(openState, rec(FULLSET,
    [strike(), bb(0.1, 0, 3), pot(0.5, 3, 2), rest(1)]),
  { kind: 'call', ball: 3, pocket: 2 });
  R8.judge(openState, rec(FULLSET,
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), rest(1)]), { kind: 'safety' });
  const grouped = { ...openState, phase: 'grouped',
    groups: { 1: 'solids', 2: 'stripes' } };
  R8.judge(grouped, rec(FULLSET,
    [strike(), bb(0.1, 0, 9), rail(0.3, 9), rest(1)]),
  { kind: 'call', ball: 1, pocket: 0 });
  R8.judge(grouped, rec(FULLSET,
    [strike(), bb(0.1, 0, 1), pot(0.4, 1, 1), pot(0.6, 0), rest(1)]),
  { kind: 'call', ball: 1, pocket: 1 });
}

// ---- 3f. RulesError site sweep (every frozen message text) -------------------

{
  const FULL15 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const doneNine = { shooter: 1, onTable: [9],
    result: { winner: 1, reason: 'nine-ball-pocketed', cite: 'WPA Sec. 5' } };
  expectErr(() => R9.judge(doneNine, rec([9], [strike(), rest(1)]), null));
  expectErr(() => R9.judge({ shooter: 1, onTable: FULL9, result: null },
    rec(FULL9, [strike(), rest(1)]), { kind: 'safety' }));
  expectErr(() => R9.applyDecision(
    { shooter: 1, onTable: FULL9, result: null }, { decision: 1, choice: 1 }));

  // eightball
  const done8 = { ...R8.initialState(1), phase: 'over',
    result: { winner: 1, reason: 'eight-ball-pocketed', cite: 'WPA Sec. 4 intro; 4.6' } };
  expectErr(() => R8.judge(done8, rec(FULL15, []), null));
  expectErr(() => R8.applyDecision(done8, { decision: 1, choice: 1 }));
  const pending8 = { ...R8.initialState(1), phase: 'open',
    pendingDecision: { kind: 'dry_break', chooser: 2 } };
  expectErr(() => R8.judge(pending8, rec(FULL15, []), null));
  expectErr(() => R8.judge(R8.initialState(1), rec(FULL15, []),
    { kind: 'call', ball: 1, pocket: 0 }));
  const open8 = { ...R8.initialState(1), phase: 'open' };
  expectErr(() => R8.judge(open8, rec(FULL15, []), null));
  expectErr(() => R8.judge(open8, rec(FULL15, []),
    { kind: 'call', ball: 0, pocket: 0 }));
  expectErr(() => R8.judge({ ...open8, onTable: [2, 3] }, rec([2, 3], []),
    { kind: 'call', ball: 1, pocket: 0 }));
  expectErr(() => R8.judge(open8, rec(FULL15, []),
    { kind: 'call', ball: 1, pocket: -1 }));
  expectErr(() => R8.applyDecision(open8, { decision: 99, choice: 1 }));
  expectErr(() => R8.applyDecision(pending8, { decision: 1, choice: 4 }));
  expectErr(() => R8.applyDecision(pending8, { decision: 5, choice: 1 }));
  expectErr(() => R8.applyDecision(open8, { decision: 1, choice: 1 }));

  // onepocket
  const play1p = R1P.applyDecision(R1P.initialState(1), { decision: 6, choice: 1 });
  const done1p = { ...play1p, phase: 'over',
    result: { winner: 1, reason: 'first-to-eight', cite: 'WPA 12.5' } };
  expectErr(() => R1P.judge(done1p, rec(FULL15, []), null));
  expectErr(() => R1P.applyDecision(done1p, { decision: 6, choice: 1 }));
  expectErr(() => R1P.judge(R1P.initialState(1), rec(FULL15, []), null));
  expectErr(() => R1P.judge(play1p, rec(FULL15, []), { kind: 'safety' }));
  expectErr(() => R1P.judge({ ...play1p, pockets: null },
    rec(FULL15, []), null));
  expectErr(() => R1P.applyDecision(play1p, { decision: 6, choice: 1 }));
  expectErr(() => R1P.applyDecision(R1P.initialState(1), { decision: 6, choice: 3 }));
  expectErr(() => R1P.applyDecision(R1P.initialState(1), { decision: 9, choice: 1 }));
  expectErr(() => R1P.applyDecision(play1p, { decision: 9, choice: 3 }));
  expectErr(() => R1P.applyDecision(play1p, { decision: 1, choice: 1 }));

  // snooker
  const SN_FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21];
  const snInit = RSN.initialState(1);
  const doneSn = { ...snInit, phase: 'over',
    result: { winner: 1, reason: 'black-potted', cite: 'WPBSA Sec3 R4(b)' } };
  expectErr(() => RSN.judge(doneSn, rec(SN_FULL, []), null));
  expectErr(() => RSN.applyDecision(doneSn, { decision: 7, choice: 1 }));
  const pendingSn = { ...snInit,
    pendingDecision: { kind: 'play_again', chooser: 2 } };
  expectErr(() => RSN.judge(pendingSn, rec(SN_FULL, []), null));
  expectErr(() => RSN.judge(snInit, rec(SN_FULL, []),
    { kind: 'nominate', ball: 16 }));
  const colourOn = { ...snInit, phase: 'colour_after_red',
    ballOn: 'nominated_colour' };
  expectErr(() => RSN.judge(colourOn, rec(SN_FULL, []), null));
  expectErr(() => RSN.judge(colourOn, rec(SN_FULL, []),
    { kind: 'nominate', ball: 5 }));
  expectErr(() => RSN.judge({ ...colourOn, onTable: [1, 17, 18, 19, 20, 21] },
    rec(SN_FULL, []), { kind: 'nominate', ball: 16 }));
  const finalsSn = { ...snInit, phase: 'final_colours', ballOn: 16,
    onTable: [16, 17, 18, 19, 20, 21] };
  expectErr(() => RSN.judge(finalsSn, rec(finalsSn.onTable, []),
    { kind: 'nominate', ball: 21 }));
  // degenerate no-colour-left: last red pocketed ON a foul mid-judge
  expectErr(() => RSN.judge({ ...snInit, onTable: [15] }, rec([15],
    [strike(), bb(0.1, 0, 15), pot(0.3, 15), pot(0.5, 0), rest(1)]), null));
  expectErr(() => RSN.applyDecision(snInit, { decision: 5, choice: 1 }));
  expectErr(() => RSN.applyDecision(pendingSn, { decision: 7, choice: 3 }));
  expectErr(() => RSN.applyDecision(snInit, { decision: 7, choice: 1 }));

  // carom
  const playC3 = RC3.applyDecision(RC3.initialState(1), { decision: 10, choice: 2 });
  const doneC3 = { ...playC3, phase: 'over',
    result: { winner: 1, reason: 'carom-target-reached', cite: 'UMB Art 29.1/29.2' } };
  expectErr(() => RC3.judge(doneC3, rec([1, 2], []), null));
  expectErr(() => RC3.applyDecision(doneC3, { decision: 10, choice: 1 }));
  expectErr(() => RC3.judge(RC3.initialState(1), rec([1, 2], []), null));
  expectErr(() => RC3.judge(playC3, rec([1, 2], []), { kind: 'safety' }));
  expectErr(() => RC3.applyDecision(playC3, { decision: 7, choice: 1 }));
  expectErr(() => RC3.applyDecision(RC3.initialState(1), { decision: 10, choice: 3 }));
  expectErr(() => RC3.applyDecision(playC3, { decision: 10, choice: 1 }));

  // registry: the unknown-ruleset error (T018 loader-shim stub id)
  try {
    getRuleset('stub-v0');
    fail('getRuleset accepted an unknown id');
  } catch (e) {
    if (!(e instanceof RulesError)) throw e;
    recordCase('stub-v0', 'judge-error',
      { state: {}, record: {}, call: null },
      JSON.stringify({ error: {
        code: classifyRulesError(e.message), message: e.message } }));
  }
}

// ---- 4. merge captures, dedup, id, assert the coverage floor -----------------

const captures = [];
for (const f of readdirSync(CAPTURE_DIR).sort()) {
  for (const line of readFileSync(path.join(CAPTURE_DIR, f), 'utf8').split('\n')) {
    if (line.trim().length > 0) captures.push(JSON.parse(line));
  }
}
console.log(`raw captures: ${captures.length}`);

const seen = new Set();
const cases = [];
for (const c of captures) {
  const { expect, expectSha256, ...inputs } = c;
  const key = sha256(JSON.stringify(inputs));
  if (seen.has(key)) continue;
  seen.add(key);
  cases.push(c);
}
console.log(`deduped cases: ${cases.length}`);

// stable ordering: ruleset (registry order + stub) -> kind -> capture order
const KIND_ORDER = ['initialState', 'judge', 'judge-error', 'applyDecision',
  'applyDecision-error', 'hudState', 'hudState-error'];
const RS_ORDER = [...RULESET_IDS, 'stub-v0'];
cases.sort((a, b) => {
  const r = RS_ORDER.indexOf(a.ruleset) - RS_ORDER.indexOf(b.ruleset);
  if (r !== 0) return r;
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
});

const tagFor = (c) => {
  try {
    const out = JSON.parse(c.expect);
    if (c.kind.endsWith('-error')) return out.error.code;
    if (c.kind === 'judge') {
      if (out.terminal) return out.terminal.reason;
      if (!out.legal) return out.fouls.map((f) => f.code).join('+');
      return out.pocketed.length > 0 ? 'legal-pot' : 'legal';
    }
    if (c.kind === 'applyDecision') {
      return `d${c.decision.decision}c${c.decision.choice}`;
    }
    if (c.kind === 'initialState') return `b${c.breaker}`;
    if (c.kind === 'hudState') {
      return String(c.state?.phase ?? c.state?.stage ?? 'state');
    }
  } catch { /* tag is advisory only */ }
  return '';
};
const counters = new Map();
const finalCases = cases.map((c) => {
  const short = c.ruleset.replace(/-v1$/, '');
  const ck = `${short}/${c.kind}`;
  const n = (counters.get(ck) ?? 0) + 1;
  counters.set(ck, n);
  const tag = tagFor(c).toLowerCase().replace(/[^a-z0-9+_-]/g, '-').slice(0, 48);
  const id = `${short}/${c.kind}-${String(n).padStart(3, '0')}${tag ? `-${tag}` : ''}`;
  const { ruleset, kind, expect, expectSha256, ...inputs } = c;
  return { id, ruleset, kind, ...inputs, expect, expectSha256 };
});

// ---- coverage floor (conformance-gate.md §1) — FAIL the harvest if unmet ----

const FLOORS = { 'nineball-v1': 31, 'eightball-v1': 55, 'onepocket-v1': 31,
  'snooker-v1': 40, 'carom3c-v1': 28 };
const FOUL_CODES = {
  'nineball-v1': ['no-contact', 'wrong-first-ball', 'no-rail-after-contact',
    'scratch'],
  'eightball-v1': ['no-contact', 'wrong-first-ball', 'no-rail-after-contact',
    'scratch', 'ball-off-table', 'bad-break'],
  'onepocket-v1': ['no-rail-after-contact', 'ball-off-table', 'scratch',
    'three-consecutive-fouls'],
  'snooker-v1': ['no-contact', 'wrong-first-ball', 'not-nominated',
    'ball-off-table', 'scratch', 'jump-over'],
  'carom3c-v1': ['wrong-first-ball-break', 'ball-off-table'],
};
const TERMINAL_REASONS = {
  'nineball-v1': ['nine-ball-pocketed'],
  'eightball-v1': ['eight-ball-pocketed', 'eight-with-foul', 'early-eight',
    'eight-wrong-pocket', 'eight-off-table'],
  'onepocket-v1': ['first-to-eight', 'three-consecutive-fouls'],
  'snooker-v1': ['respotted-black-foul', 'respotted-black-potted',
    'black-potted', 'foul-on-black'],
  'carom3c-v1': ['carom-target-reached'],
};
const PHASES = {
  'eightball-v1': ['break', 'open', 'grouped', 'over'],
  'onepocket-v1': ['pocket_choice', 'play', 'over'],
  'snooker-v1': ['reds', 'colour_after_red', 'final_colours',
    'respotted_black', 'over'],
  'carom3c-v1': ['break', 'play', 'over'],
};
const REQUIRED_ERROR_PATTERNS = [
  /^unknown ruleset 'stub-v0'$/,
  /^nineball-v1: judge called after the match ended$/,
  /^nineball-v1: 9-ball has no call\/safety inputs$/,
  /^nineball-v1: no rulebook decision is ever pending$/,
  /^eightball-v1: judge called after the match ended/,
  /^eightball-v1: judge called while a rulebook decision is pending/,
  /^eightball-v1: the break shot carries no call/,
  /^eightball-v1: every non-break shot requires a call/,
  /^eightball-v1: called ball 0 is not an object ball/,
  /^eightball-v1: called ball 1 is not on the table$/,
  /^eightball-v1: called pocket -1 is not a kernel pocket index$/,
  /^eightball-v1: no decision can be applied after the match ended$/,
  /^eightball-v1: unknown decision id 99$/,
  /^eightball-v1: choice 4 out of range for 'dry_break'$/,
  /^eightball-v1: stalemate cannot pre-empt the pending 'dry_break' option$/,
  /^eightball-v1: decision 'dry_break' does not match the pending option \('none'\)$/,
  /^onepocket-v1: judge called after the match ended/,
  /^onepocket-v1: judge called while a rulebook decision is pending/,
  /^onepocket-v1: one-pocket carries no per-shot call/,
  /^onepocket-v1: play phase without pocket assignments$/,
  /^onepocket-v1: no decision can be applied after the match ended$/,
  /^onepocket-v1: no break-pocket choice is pending$/,
  /^onepocket-v1: choice 3 out of range for 'break_pocket'/,
  /^onepocket-v1: stalemate cannot pre-empt the pending/,
  /^onepocket-v1: choice 3 out of range for 'stalemate_lag'/,
  /^onepocket-v1: unknown decision id 1$/,
  /^snooker-v1: judge called after the frame ended/,
  /^snooker-v1: judge called while a rulebook decision is pending/,
  /^snooker-v1: a red shot carries no nomination/,
  /^snooker-v1: a colour shot MUST carry/,
  /^snooker-v1: nominated ball 5 is not a colour/,
  /^snooker-v1: nominated colour 16 is not on the table$/,
  /^snooker-v1: the ball on is 16 — nominating 21 in final_colours/,
  /^snooker-v1: final_colours state has no colour left$/,
  /^snooker-v1: no decision can be applied after the frame ended$/,
  /^snooker-v1: unknown decision id 5$/,
  /^snooker-v1: choice 3 out of range for 'play_again'$/,
  /^snooker-v1: decision 'play_again' does not match the pending option \('none'\)$/,
  /^carom3c-v1: judge called after the match ended/,
  /^carom3c-v1: judge called while the break-spot option is pending/,
  /^carom3c-v1: three-cushion carries no call\/safety\/nomination inputs$/,
  /^carom3c-v1: no decision can be applied after the match ended$/,
  /^carom3c-v1: unknown decision id 7/,
  /^carom3c-v1: choice 3 out of range for 'break_spot'/,
  /^carom3c-v1: decision 'break_spot' does not match the pending option \(none\)$/,
];

const problems = [];
for (const [rs, floor] of Object.entries(FLOORS)) {
  const n = finalCases.filter((c) => c.ruleset === rs
    && (c.kind === 'judge' || c.kind === 'judge-error')).length;
  if (n < floor) problems.push(`${rs}: ${n} judge cases < floor ${floor}`);
}
for (const [rs, codes] of Object.entries(FOUL_CODES)) {
  const seenCodes = new Set();
  for (const c of finalCases) {
    if (c.ruleset !== rs || c.kind !== 'judge') continue;
    for (const f of JSON.parse(c.expect).fouls) seenCodes.add(f.code);
  }
  for (const code of codes) {
    if (!seenCodes.has(code)) problems.push(`${rs}: foul code ${code} uncovered`);
  }
}
for (const [rs, reasons] of Object.entries(TERMINAL_REASONS)) {
  const seenReasons = new Set();
  for (const c of finalCases) {
    if (c.ruleset !== rs || c.kind !== 'judge') continue;
    const t = JSON.parse(c.expect).terminal;
    if (t !== null) seenReasons.add(t.reason);
  }
  for (const r of reasons) {
    if (!seenReasons.has(r)) problems.push(`${rs}: terminal ${r} uncovered`);
  }
}
for (const [rs, phases] of Object.entries(PHASES)) {
  const seenPhases = new Set();
  for (const c of finalCases) {
    if (c.ruleset !== rs) continue;
    if (c.state && typeof c.state.phase === 'string') seenPhases.add(c.state.phase);
    if (c.kind === 'judge') {
      const nx = JSON.parse(c.expect).next;
      if (nx && typeof nx.phase === 'string') seenPhases.add(nx.phase);
    }
    if (c.kind === 'applyDecision') {
      const nx = JSON.parse(c.expect);
      if (typeof nx.phase === 'string') seenPhases.add(nx.phase);
    }
  }
  for (const p of phases) {
    if (!seenPhases.has(p)) problems.push(`${rs}: phase ${p} uncovered`);
  }
}
{
  const rights = new Set();
  const decisions = new Set();
  const errMessages = [];
  for (const c of finalCases) {
    if (c.kind === 'judge') rights.add(JSON.parse(c.expect).ballInHand);
    if (c.kind === 'applyDecision') decisions.add(c.decision.decision);
    if (c.kind.endsWith('-error')) {
      errMessages.push(JSON.parse(c.expect).error.message);
    }
  }
  for (const r of ['none', 'anywhere', 'kitchen', 'd_zone']) {
    if (!rights.has(r)) problems.push(`placement right ${r} uncovered`);
  }
  for (let d = 1; d <= 10; d++) {
    if (!decisions.has(d)) problems.push(`decision id ${d} unresolved`);
  }
  for (const re of REQUIRED_ERROR_PATTERNS) {
    if (!errMessages.some((m) => re.test(m))) {
      problems.push(`RulesError message uncovered: ${re}`);
    }
  }
}
if (problems.length > 0) {
  fail(`coverage floor unmet:\n  ${problems.join('\n  ')}`);
}

// ---- 5. freeze the byte oracle ----------------------------------------------

const harvestedAt = execFileSync('git', ['rev-parse', 'HEAD'],
  { cwd: REPO, encoding: 'utf8' }).trim();
const corpus = {
  comment: [
    'DO NOT REGENERATE (legacy-links.json discipline). Byte oracle for',
    'feature 013 (the pool-rules crate): every case harvested ONCE',
    'from the PRE-MIGRATION pure-TS rulesets (sdk/ts/src/rules) at the',
    'harvestedAt commit by sdk/ts/tools/harvest-rules-corpus.mjs (research',
    'R8, conformance-gate.md §1). Regenerating this file is a SPEC-LEVEL',
    'behavioral event requiring a new feature or amendment — NEVER a fix',
    'for a red gate. A byte diff at any migration/conformance gate is',
    'ALWAYS resolved by fixing crates/pool-rules to reproduce THESE bytes',
    '(behavior freeze beats correctness; TS bugs port as-is, filed apart).',
  ],
  harvestedAt,
  cases: finalCases,
};
writeFileSync(OUT_PATH, `${JSON.stringify(corpus, null, 1)}\n`);

const byKind = {};
for (const c of finalCases) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
console.log(`wrote ${OUT_PATH}`);
console.log(`harvestedAt ${harvestedAt}`);
console.log(`cases: ${finalCases.length}`, byKind);
for (const rs of RS_ORDER) {
  const n = finalCases.filter((c) => c.ruleset === rs).length;
  console.log(`  ${rs}: ${n}`);
}
