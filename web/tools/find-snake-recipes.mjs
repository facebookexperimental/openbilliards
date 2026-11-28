// Copyright (c) Meta Platforms, Inc. and affiliates.

// find-snake-recipes.mjs — OFFLINE recipe search for the e2e-drills snake
// arms (issue #80; the find-carom-recipes.mjs authoring-tool precedent —
// not part of any gate). Finds deterministic cue-in-the-D shot recipes on
// the committed canonical wasm for the snake_colours drill layout (colours
// on their WPBSA spots, judged by the real snooker-v1 crate):
//   (a) the IN-ORDER yellow pot (legal, yellow only, stays down) with a
//       follow-up no-contact miss stroke from the exact rest position;
//   (b) the OUT-OF-ORDER green pot (wrong-first-ball foul with the green
//       fouled IN — judgment.respot carries [17]).
// Every candidate must hold across the shot seeds the browser run actually
// uses (game.seed 1 → shot seeds 1000..1003) and across a ±phi jitter so a
// half-ulp aim drift can never rattle the jaws.
//   node web/tools/find-snake-recipes.mjs
import { fileURLToPath } from 'node:url';
import { init, ScenarioBuilder } from '../dist/pool-sdk/index.js';
import { snookerRuleset } from '../dist/pool-sdk/rules/index.js';

const GLUE = fileURLToPath(new URL('../dist/pool-wasm/pool_wasm.js', import.meta.url));
const eng = await init(GLUE);
const base = eng.snookerRack(1);
const table = base.system.table;
const params = base.system.balls[0].params;
const R = params.r;

// kernel layouts mirror (sdk games/layouts.ts SNOOKER_LAYOUT)
const SPOT = {
  16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 },
  18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 },
  20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 },
};
const BAULK_Y = -1.0475, D_R = 0.292;
const ORDER = [16, 17, 18, 19, 20, 21];
const inD = (x, y) => y <= BAULK_Y + 1e-9
  && Math.hypot(x, y - BAULK_Y) <= D_R + 1e-9;
/** Legal cue address: inside the D, clear of every spotted colour. */
const cueFits = (x, y) => inD(x, y) && ORDER.every((id) =>
  Math.hypot(x - SPOT[id].x, y - SPOT[id].y) > 2 * 0.02625 + 0.02);

const foldState = (ballOn, onTable) => ({
  phase: 'final_colours', shooter: 1, scores: { 1: 0, 2: 0 },
  currentBreak: 0, ballOn, onTable: [...onTable], respotQueue: [],
  pendingDecision: null, foulContext: null, result: null,
});

function simulate(balls, shot) {
  const b = new ScenarioBuilder(table);
  for (const [id, x, y] of balls) b.ball(id, { x, y, params });
  return eng.simulate(
    b.shot({ theta: 0, a: 0, b: 0, ...shot }).options(base.options).build());
}

function restOf(record, id) {
  const i = record.initial.balls.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const s = eng.sampler(JSON.stringify(record));
  let t = 0;
  for (const ev of record.events) t = Math.max(t, ev.t);
  s.sampleAt(t);
  const out = s.data[8 * i + 7] === 4 ? null
    : { x: s.data[8 * i], y: s.data[8 * i + 1] };
  s.free();
  return out;
}

const snakeBalls = (cue) => [[0, cue.x, cue.y],
  ...ORDER.map((id) => [id, SPOT[id].x, SPOT[id].y])];

/** Judge one snake stroke: layout = cue + the six colours on spots. */
function judgeSnake(cue, shot, ballOn = 16) {
  const record = simulate(snakeBalls(cue), shot);
  const j = snookerRuleset.judge(foldState(ballOn, ORDER), record,
    { kind: 'nominate', ball: ballOn });
  return { j, record };
}

const SEEDS = [1000, 1001, 1002, 1003];
const JITTER = [0, 0.0015, -0.0015];

/** (a) in-order yellow pot, robust across seeds + phi jitter, with a
 * verified no-contact follow-up miss from the rest position. */
function findYellow() {
  const cues = [];
  for (const x of [-0.28, -0.24, -0.2, -0.16, -0.12, -0.08, -0.04, 0.02, 0.08])
    for (const y of [BAULK_Y, BAULK_Y - 0.05, BAULK_Y - 0.1, BAULK_Y - 0.16]) {
      if (cueFits(x, y)) cues.push({ x, y });
    }
  for (const cue of cues) {
    const base0 = Math.atan2(SPOT[16].y - cue.y, SPOT[16].x - cue.x);
    for (let dp = -0.32; dp <= 0.32; dp += 0.002) {
      for (const v0 of [2.0, 2.6, 3.2]) {
        const phi = base0 + dp;
        let ok = true;
        let rest = null;
        for (const seed of SEEDS) {
          for (const jit of JITTER) {
            const { j, record } = judgeSnake(cue, { v0, phi: phi + jit, seed });
            if (!(j.legal && JSON.stringify(j.pocketed) === '[16]'
              && j.respot.length === 0 && j.terminal === null
              && j.turn === 'continue')) { ok = false; break; }
            if (seed === SEEDS[0] && jit === 0) rest = restOf(record, 0);
          }
          if (!ok) break;
        }
        if (!ok || !rest) continue;
        // follow-up miss: soft stroke toward the bottom cushion — must be a
        // clean no-contact foul (nothing pocketed, no terminal) at every seed
        const missPhi = -Math.PI / 2;
        let missOk = true;
        for (const seed of SEEDS) {
          const record2 = simulate([[0, rest.x, rest.y],
            ...ORDER.slice(1).map((id) => [id, SPOT[id].x, SPOT[id].y])],
          { v0: 0.5, phi: missPhi, seed });
          const j2 = snookerRuleset.judge(foldState(17, ORDER.slice(1)),
            record2, { kind: 'nominate', ball: 17 });
          if (j2.legal || j2.pocketed.length || j2.terminal !== null
            || !j2.fouls.some((f) => f.code === 'no-contact')) {
            missOk = false; break;
          }
        }
        if (!missOk) continue;
        return { cue, phi, v0, rest, missPhi, missV0: 0.5 };
      }
    }
  }
  return null;
}

/** (b) out-of-order green pot: yellow on, first contact green, green IN —
 * wrong-first-ball foul with respot [17]. */
function findGreen() {
  const cues = [];
  for (const x of [0.28, 0.24, 0.2, 0.16, 0.12, 0.08, 0.04, -0.02, -0.08])
    for (const y of [BAULK_Y, BAULK_Y - 0.05, BAULK_Y - 0.1, BAULK_Y - 0.16]) {
      if (cueFits(x, y)) cues.push({ x, y });
    }
  for (const cue of cues) {
    const base0 = Math.atan2(SPOT[17].y - cue.y, SPOT[17].x - cue.x);
    for (let dp = -0.32; dp <= 0.32; dp += 0.002) {
      for (const v0 of [2.0, 2.6, 3.2]) {
        const phi = base0 + dp;
        let ok = true;
        for (const seed of SEEDS) {
          for (const jit of JITTER) {
            const { j } = judgeSnake(cue, { v0, phi: phi + jit, seed }, 16);
            if (!(!j.legal && JSON.stringify(j.pocketed) === '[17]'
              && j.respot.length === 1 && j.respot[0] === 17
              && j.terminal === null
              && j.fouls.some((f) => f.code === 'wrong-first-ball'))) {
              ok = false; break;
            }
          }
          if (!ok) break;
        }
        if (ok) return { cue, phi, v0 };
      }
    }
  }
  return null;
}

const yellow = findYellow();
if (!yellow) { console.error('no yellow recipe — widen the grid'); process.exit(1); }
console.log('YELLOW', JSON.stringify(yellow, null, 2));
const green = findGreen();
if (!green) { console.error('no green recipe — widen the grid'); process.exit(1); }
console.log('GREEN', JSON.stringify(green, null, 2));
