#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-analyze-bugreport.mjs — GH-1055: the bug-report analyzer measures the rack ON THE TABLE.
//
// The scenario ring (game.js scenarioLog) never resets: it spans re-racks and game switches. A
// bundle saved after a game switch, before the new game's first shot, carries the PREVIOUS game's
// scenario last, and pool, snooker and carom all reuse ids 0-15. The analyzer took every radius
// from that scenario, so a fresh touching snooker rack read as a -4.65 mm resting overlap (a false
// #44 WARNING), and a fresh pool rack after snooker as +4.65 mm (a false clear, no caveat).
//
// Each arm writes a synthesised bundle in the field shapes of a real capture (bugreport.js
// collect(): app, settings, scenarios, match_state, balls[].pos = the rendered mesh position,
// y up) and runs the analyzer on it as a child process. Zero dependencies, no browser, no wasm.
//
//   node tools/test-analyze-bugreport.mjs
//   node tools/test-analyze-bugreport.mjs --analyzer <path>   (planted red: run another analyzer copy)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argAt = process.argv.indexOf('--analyzer');
const ANALYZER = argAt > 0 ? path.resolve(process.argv[argAt + 1]) : path.join(ROOT, 'tools', 'analyze-bugreport.mjs');
const R_POOL = 0.028575;
const R_SNOOKER = 0.02625;
const TOUCH = 5e-7; // a frozen rack's seeded micro-gap [m]

/** n balls resting on a 0.2 m grid at height r, except `pair`: its second ball sits
 * 2r + TOUCH (minus `closer`) from its first, the rack's only near contact. */
function rack(n, r, [a, b], closer = 0) {
  const balls = [];
  for (let id = 0; id < n; id++) {
    balls.push({ id, pocketed: false, pos: [(id % 6) * 0.2 - 0.5, r, Math.floor(id / 6) * 0.2 - 0.4] });
  }
  const pa = balls[a].pos;
  balls[b].pos = [pa[0] + 2 * r + TOUCH - closer, r, pa[2]];
  return balls;
}
/** One scenario-log entry: the exact {system, shot, options} JSON string game.js submits. */
const scenario = (n, r) => JSON.stringify({
  system: { balls: Array.from({ length: n }, (_, id) => ({ id, params: { r } })) },
  shot: { v0: 2, phi: 1.5708, theta: 0.05, a: 0, b: 0, seed: 1000 },
  options: {},
});
const bundle = ({ game, balls, scenarios, matchState = 'BALL_IN_HAND' }) => ({
  bundle_version: 3,
  generated_at: '2026-10-10T00:00:00.000Z',
  kernel_version: '0.1.0+fixture',
  rules_version: '0.1.0+fixture',
  storage: { persistFailed: 0, firstKey: null },
  app: { look: 'fixture', game, seed: 1, shotIndex: 0, locale: 'en', scripted: false },
  settings: JSON.stringify({ game, mode: 'play' }),
  scenarios,
  judgments: [],
  replay_url: { error: 'share.noShots' },
  errors: [],
  ...(matchState === null ? {} : { match_state: matchState }), // null: the section is absent
  balls,
  platform: { userAgent: 'fixture', devicePixelRatio: 2, viewport: [1440, 900] },
});

const dir = mkdtempSync(path.join(os.tmpdir(), 'ob-analyze-bugreport-'));
let n = 0;
const analyze = (b) => {
  const file = path.join(dir, `bundle-${++n}.json`);
  writeFileSync(file, JSON.stringify(b));
  return execFileSync(process.execPath, [ANALYZER, file], { encoding: 'utf8' });
};
const gapOf = (out) => {
  const m = out.match(/min pairwise surface gap: (\S+) m \(balls (\S+)\/(\S+)\)/);
  return m ? { gap: Number(m[1]), pair: [m[2], m[3]].sort().join('/'), line: m[0] } : null;
};
const touching = (g) => g !== null && g.gap >= -1e-6 && g.gap <= 1e-5;
const lineWith = (out, s) => out.split('\n').find((l) => l.includes(s)) ?? null;

let fails = 0;
let arms = 0;
const check = (id, ok, detail) => {
  arms += 1;
  if (ok) console.log(`PASS  ${id}`);
  else { fails += 1; console.log(`FAIL  ${id}: ${detail}`); }
};

try {
  const snooker = rack(22, R_SNOOKER, [2, 5]);
  const pool = rack(16, R_POOL, [13, 8]);

  // 1. the forward case: pool (16 balls, ids 0-15) scenario last, a fresh snooker rack on the table
  const fwd = analyze(bundle({ game: 'snooker', balls: snooker, scenarios: [scenario(16, R_POOL)] }));
  const g1 = gapOf(fwd);
  check('A1 forward: a pool scenario left over from before the switch never measures the snooker rack'
    + ' (no WARNING, min gap of the touching rack)', !fwd.includes('!! WARNING') && touching(g1),
  `${g1?.line ?? 'no gap line'}; ${lineWith(fwd, '!! WARNING') ?? 'no warning'}`);
  check('A1 forward: the radii line names the resting heights and why the scenario is not this rack\'s',
    lineWith(fwd, 'radii: resting heights pos[1] (match_state BALL_IN_HAND)')?.includes(
      "scenario #0 is another rack's (no params for on-table id(s) 16, 17, 18, 19, 20, 21)") === true,
    lineWith(fwd, 'radii:') ?? 'no radii line');

  // 2. the reverse case: snooker (22 balls) scenario last, a fresh pool rack on the table — every pool
  // id exists in the snooker scenario, so only the radius can tell the racks apart
  const rev = analyze(bundle({ game: 'eight_ball', balls: pool, scenarios: [scenario(22, R_SNOOKER)] }));
  const g2 = gapOf(rev);
  check('A2 reverse: a snooker scenario never clears the pool rack by +4.65 mm (min gap of the touching rack)',
    touching(g2), g2?.line ?? 'no gap line');
  check('A2 reverse: the radii line names the radius mismatch',
    lineWith(rev, 'radii:')?.includes(`params.r ${R_SNOOKER} m vs resting height ${R_POOL} m`) === true,
    lineWith(rev, 'radii:') ?? 'no radii line');

  // 3. a real overlap still fires: the reverse fixture with ONE pair 2.0 mm closer
  const planted = analyze(bundle({ game: 'eight_ball', balls: rack(16, R_POOL, [13, 8], 0.002),
    scenarios: [scenario(22, R_SNOOKER)] }));
  const g3 = gapOf(planted);
  check('A3 planted overlap: the WARNING names the pair moved 2.0 mm closer',
    g3?.pair === '13/8' && Math.abs(g3.gap - (TOUCH - 0.002)) <= 1e-6 // printed to 4 significant digits
      && /!! WARNING: .*'balls (13\/8|8\/13) overlap'/.test(planted),
    `${g3?.line ?? 'no gap line'}; ${lineWith(planted, '!! WARNING') ?? 'no warning'}`);

  // 4. the same-rack control: the snooker rack's own scenario appended last is the kernel truth
  const same = analyze(bundle({ game: 'snooker', balls: snooker,
    scenarios: [scenario(16, R_POOL), scenario(22, R_SNOOKER)] }));
  const g4 = gapOf(same);
  check('A4 same-rack control: the matching last scenario measures the rack; the gap line equals A1\'s',
    !same.includes('!! WARNING') && g4 !== null && g4.line === g1?.line
      && lineWith(same, 'radii: scenario #1 params (it matches the rack on the table)') !== null,
    `${g4?.line ?? 'no gap line'} vs ${g1?.line}; ${lineWith(same, 'radii:') ?? 'no radii line'}`);

  // 5. CAVEAT honesty: a parsed scenario that is not used must never be reported as "no parseable
  // scenario params". Here no ball height is usable (pos[1] = 0: no ball centre sits in the bed
  // plane), so the catalog fills in, and the CAVEAT names the foreign scenario
  const flat = (balls) => balls.map((b) => ({ ...b, pos: [b.pos[0], 0, b.pos[2]] }));
  const noHeight = analyze(bundle({ game: 'snooker', balls: flat(snooker), scenarios: [scenario(16, R_POOL)],
    matchState: 'AIM' }));
  const cav = lineWith(noHeight, 'CAVEAT: some radii ASSUMED');
  check('A5 CAVEAT honesty: a parsed foreign scenario is named as another rack\'s, never "no parseable scenario params"',
    cav !== null && !cav.includes('no parseable scenario params') && cav.includes("scenario #0 is another rack's")
      && cav.includes('no usable ball height (match_state AIM)') && touching(gapOf(noHeight)),
    `${cav ?? 'no CAVEAT'}; ${gapOf(noHeight)?.line ?? 'no gap line'}`);

  // 6. no match_state (the reverse case): the height most balls share unmasks the snooker scenario
  const unknown = analyze(bundle({ game: 'eight_ball', balls: pool, scenarios: [scenario(22, R_SNOOKER)],
    matchState: null }));
  check('A6 no match_state: the rack\'s common height rejects the foreign scenario (no false +4.65 mm clear)',
    touching(gapOf(unknown)) && !unknown.includes('CAVEAT')
      && lineWith(unknown, `radii: the rack's common height pos[1] = ${R_POOL} m (match_state unknown)`)?.includes(
        `params.r ${R_SNOOKER} m vs the rack's common height ${R_POOL} m`) === true,
    `${gapOf(unknown)?.line ?? 'no gap line'}; ${lineWith(unknown, 'radii:') ?? 'no radii line'}`);

  // 9-10. the archive player in PLAYBACK shows ANOTHER game's session than app.game, and the last
  // scenario is the live game's: the balls' common height measures them, never the live catalog
  const archSnk = analyze(bundle({ game: 'eight_ball', balls: snooker, scenarios: [scenario(16, R_POOL)],
    matchState: 'PLAYBACK' }));
  check('A9 PLAYBACK, a snooker session inside a live 8-ball game: no false -4.65 mm WARNING',
    !archSnk.includes('!! WARNING') && touching(gapOf(archSnk))
      && lineWith(archSnk, `radii: the rack's common height pos[1] = ${R_SNOOKER} m (match_state PLAYBACK)`) !== null,
    `${gapOf(archSnk)?.line ?? 'no gap line'}; ${lineWith(archSnk, 'radii:') ?? lineWith(archSnk, 'CAVEAT') ?? ''}`);
  const archPool = analyze(bundle({ game: 'snooker', balls: pool, scenarios: [scenario(22, R_SNOOKER)],
    matchState: 'PLAYBACK' }));
  check('A10 PLAYBACK, an 8-ball session inside a live snooker game: no false +4.65 mm clear',
    touching(gapOf(archPool)) && lineWith(archPool, `vs the rack's common height ${R_POOL} m`) !== null,
    `${gapOf(archPool)?.line ?? 'no gap line'}; ${lineWith(archPool, 'radii:') ?? ''}`);

  // 11. at rest but no usable height, every id covered: the game's catalog ballset unmasks the
  // snooker scenario (CAVEAT, the catalog mismatch named)
  const flatPool = analyze(bundle({ game: 'eight_ball', balls: flat(pool), scenarios: [scenario(22, R_SNOOKER)],
    matchState: 'AIM' }));
  const cav11 = lineWith(flatPool, 'CAVEAT: some radii ASSUMED');
  check('A11 no usable height: the catalog ballset rejects the foreign scenario (no false +4.65 mm clear)',
    touching(gapOf(flatPool)) && cav11?.includes(`vs the 'eight_ball' catalog ballset ${R_POOL} m`) === true,
    `${gapOf(flatPool)?.line ?? 'no gap line'}; ${cav11 ?? 'no CAVEAT'}`);

  // 12. a live PLAYBACK capture with one ball in the air: the matching scenario still measures the
  // rack (one height off the common one is a jump, not another ball set)
  const air = snooker.map((b) => (b.id === 9 ? { ...b, pos: [b.pos[0], 0.05, b.pos[2]] } : b));
  const jump = analyze(bundle({ game: 'snooker', balls: air, scenarios: [scenario(22, R_SNOOKER)], matchState: 'PLAYBACK' }));
  check('A12 PLAYBACK with a ball in the air: the matching scenario stays the radius source',
    touching(gapOf(jump)) && lineWith(jump, 'radii: scenario #0 params (it matches the rack on the table)') !== null,
    `${gapOf(jump)?.line ?? 'no gap line'}; ${lineWith(jump, 'radii:') ?? ''}`);

  // 13. a SPARSE snooker replay in PLAYBACK over a live 8-ball game (review r1 P2): two balls on the
  // table, one in the air, so no common height. The live catalog must not reject the matching snooker
  // scenario: it keeps the radii (marked unconfirmed), and the real +4.193 mm gap stays a gap
  const SPARSE_GAP = 0.004193;
  const dy = 0.05 - R_SNOOKER;
  const sparse = Array.from({ length: 22 }, (_, id) => ({ id, pocketed: true, pos: [0, -10, 0] }));
  sparse[3] = { id: 3, pocketed: false, pos: [0, R_SNOOKER, 0] };
  sparse[7] = { id: 7, pocketed: false, pos: [Math.sqrt((2 * R_SNOOKER + SPARSE_GAP) ** 2 - dy ** 2), 0.05, 0] };
  const sparseOut = analyze(bundle({ game: 'eight_ball', balls: sparse, scenarios: [scenario(22, R_SNOOKER)],
    matchState: 'PLAYBACK' }));
  const g13 = gapOf(sparseOut);
  check('A13 sparse cross-game PLAYBACK: the live catalog never rejects the replay\'s scenario (no false overlap)',
    !sparseOut.includes('!! WARNING') && g13 !== null && Math.abs(g13.gap - SPARSE_GAP) <= 1e-6
      && lineWith(sparseOut, 'radii: scenario #0 params (unconfirmed: no usable ball height (match_state PLAYBACK)') !== null,
    `${g13?.line ?? 'no gap line'}; ${lineWith(sparseOut, 'radii:') ?? lineWith(sparseOut, 'CAVEAT') ?? ''}`);

  // 7. no scenario at all (a fresh page): the resting heights are exact, so no CAVEAT; the empty
  // ring is described truthfully (it never resets on a re-rack)
  const fresh = analyze(bundle({ game: 'snooker', balls: snooker, scenarios: [] }));
  check('A7 empty ring: resting heights, no CAVEAT, and no "ring reset" claim',
    touching(gapOf(fresh)) && !fresh.includes('CAVEAT')
      && lineWith(fresh, 'radii: resting heights pos[1] (match_state BALL_IN_HAND) — no parseable scenario params') !== null
      && !fresh.includes('ring reset') && fresh.includes('0 entries (no shot fired since the page loaded'),
    `${lineWith(fresh, 'radii:') ?? 'no radii line'}; ${lineWith(fresh, '0 entries') ?? ''}`);

  // 8. the summary prints the machine state beside the mode (a WIN-hold bundle shows it at a glance)
  const win = analyze(bundle({ game: 'nine_ball', balls: pool, scenarios: [scenario(16, R_POOL)], matchState: 'WIN' }));
  check('A8 the app line prints match_state beside mode',
    /game=nine_ball mode=play match_state=WIN /.test(win) && fwd.includes('mode=play match_state=BALL_IN_HAND'),
    lineWith(win, 'game=') ?? 'no app line');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(fails === 0 ? `ANALYZE-BUGREPORT TEST PASS (${arms} checks)`
  : `ANALYZE-BUGREPORT TEST FAIL (${fails} of ${arms} checks)`);
process.exit(fails === 0 ? 0 : 1);
