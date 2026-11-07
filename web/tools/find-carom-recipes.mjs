// Copyright (c) Meta Platforms, Inc. and affiliates.

// find-carom-recipes.mjs — OFFLINE recipe search for e2e-carom.mjs (feature
// 012 US3, T047 authoring tool — not part of any gate). Finds deterministic
// scripted-layout + shot-param recipes on the committed canonical wasm:
//   (a) a VALID three-cushion point (thin first-ball contact up front, the
//       cue banks ≥3 cushions, then meets the second object ball — UMB
//       Art 83) and
//   (b) a two-cushion no-point variant of the same pattern,
// by simulating with the second ball parked away, sampling the cue between
// its 3rd and 4th (resp. 2nd and 3rd) post-contact cushions, and placing
// the second ball on that path. Verified through the real carom3c-v1
// judge. Prints the constants to bake into e2e-carom.mjs.
//   node web/tools/find-carom-recipes.mjs
import { fileURLToPath } from 'node:url';
import { init, ScenarioBuilder } from '../dist/pool-sdk/index.js';
import { caromRuleset } from '../dist/pool-sdk/rules/index.js';

const GLUE = fileURLToPath(new URL('../dist/pool-wasm/pool_wasm.js', import.meta.url));
const eng = await init(GLUE);
const base = eng.caromStart(true, 0);
const table = base.system.table;
const params = base.system.balls[0].params;
const R = params.r;
const W2 = table.width / 2, L2 = table.length / 2;

const playState = { ...caromRuleset.initialState(1), phase: 'play', pendingDecision: null };

function simulate(balls, shot) {
  const b = new ScenarioBuilder(table);
  for (const [id, x, y] of balls) b.ball(id, { x, y, params });
  return eng.simulate(b.shot({ theta: 0, a: 0, b: 0, seed: 7, ...shot })
    .options(base.options).build());
}

/** First cue↔ball1 contact time + the cue's cushion times AFTER it; null
 * when the pattern is broken (no contact / a ball2 contact intruded). */
function scan(record) {
  let contactT = null;
  const cushions = [];
  for (const ev of record.events) {
    const k = ev.kind;
    if (typeof k === 'string') continue;
    if ('BallBall' in k) {
      const { b1, b2 } = k.BallBall;
      const pair = [b1, b2].sort().join(',');
      if (contactT === null && pair === '0,1') { contactT = ev.t; continue; }
      if (pair.includes('2') && (b1 === 0 || b2 === 0)) return null; // parked ball touched
    } else if ('BallLinearCushion' in k && k.BallLinearCushion.ball === 0) {
      if (contactT !== null) cushions.push(ev.t);
      else return null; // a pre-contact bank breaks the thin-hit pattern
    }
  }
  return contactT === null ? null : { contactT, cushions };
}

const inBed = ([, x, y]) => Math.abs(x) < W2 - R - 0.002 && Math.abs(y) < L2 - R - 0.002;
const PARK2 = [2, 0.55, -1.28]; // second ball parked near the bottom-right

function samplePath(record, t0, t1) {
  const sampler = eng.sampler(JSON.stringify(record));
  sampler.sampleAt(t0 + 0.4 * (t1 - t0));
  const ax = sampler.data[0], ay = sampler.data[1];
  sampler.sampleAt(t0 + 0.6 * (t1 - t0));
  const bx = sampler.data[0], by = sampler.data[1];
  sampler.free();
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1e-6) return null;
  return { x: ax, y: ay, ux: (bx - ax) / d, uy: (by - ay) / d };
}

let out = null;
outer:
for (let phiDeg = 95; phiDeg <= 175; phiDeg += 1) {
  for (const v0 of [3.2, 3.8, 4.4]) {
    for (const side of [1, -1]) {
      const phi = (phiDeg * Math.PI) / 180;
      const cue = [0, 0.2, -0.9];
      // ball 1 thin-hit: 0.18 m along the aim line, offset 1.75R sideways
      const ux = Math.cos(phi), uy = Math.sin(phi);
      const b1 = [1,
        cue[1] + ux * 0.18 - uy * side * 1.75 * R,
        cue[2] + uy * 0.18 + ux * side * 1.75 * R];
      if (!inBed(b1)) continue;
      const recA = simulate([cue, b1, PARK2], { v0, phi });
      const s = scan(recA);
      if (!s || s.cushions.length < 4) continue;
      const seg3 = samplePath(recA, s.cushions[2], s.cushions[3]);
      if (!seg3) continue;
      const b2 = [2, seg3.x + seg3.ux * 0.06, seg3.y + seg3.uy * 0.06];
      if (!inBed(b2) || Math.hypot(b2[1] - b1[1], b2[2] - b1[2]) < 0.15) continue;
      const recB = simulate([cue, b1, b2], { v0, phi });
      const j = caromRuleset.judge(playState, recB, null);
      if (!(j.legal && j.turn === 'continue' && j.next.points[1] === 1
        && j.next.cushionsThisShot === 3)) continue;
      const seg2 = samplePath(recA, s.cushions[1], s.cushions[2]);
      if (!seg2) continue;
      const p2 = [2, seg2.x + seg2.ux * 0.06, seg2.y + seg2.uy * 0.06];
      if (!inBed(p2) || Math.hypot(p2[1] - b1[1], p2[2] - b1[2]) < 0.15) continue;
      const recC = simulate([cue, b1, p2], { v0, phi });
      const j2 = caromRuleset.judge(playState, recC, null);
      if (!(j2.legal && j2.turn === 'pass'
        && j2.next.lastReason?.code === 'insufficient-cushions'
        && j2.next.lastReason?.cushions === 2)) continue;
      out = { cue, phi, v0, b1, point_b2: b2, two_b2: p2 };
      break outer;
    }
  }
}

if (!out) {
  console.error('no recipe found — widen the grid');
  process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
