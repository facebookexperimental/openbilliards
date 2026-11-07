// Copyright (c) Meta Platforms, Inc. and affiliates.

// find-lineup-recipes.mjs — OFFLINE recipe probe for the e2e-drills GH-131
// lineup-family arms (the find-snake-recipes.mjs authoring-tool precedent —
// not part of any gate). For every 蛇彩 family variant it composes the REAL
// catalog layout (web/app/drills/catalog.js is a zero-import leaf, imported
// directly) on the committed canonical wasm's fifteen-ball table, fires the
// planned first-ball shot (cue on the catalog's default laid spot or the
// arm's computed placement, ghost-ball aim at the intended pocket), and
// reports first contact / pots / scratch — so the e2e playability arm ships
// PINNED-green recipes instead of tuning through browser cycles. Candidates
// must hold across the shot seeds a scripted run produces (1000..1003) and
// a ±0.0015 rad phi jitter (the snake-recipes robustness law).
//   node web/tools/find-lineup-recipes.mjs
import { fileURLToPath } from 'node:url';
import { init, ScenarioBuilder } from '../dist/pool-sdk/index.js';
import * as catalog from '../app/drills/catalog.js';

const GLUE = fileURLToPath(new URL('../dist/pool-wasm/pool_wasm.js', import.meta.url));
const eng = await init(GLUE);
const base = eng.fifteenBallRack(1);
const table = base.system.table;
const params = base.system.balls[0].params;
const R = params.r;
const ctx = catalog.diamondCtx(table, R);
const D = ctx.D;

function layoutOf(id) {
  const d = catalog.getDrill(id);
  const k = d.protocol.kind === 'progressive' ? d.protocol.start : 0;
  return d.attempt(ctx, k, catalog.shotSeed(BigInt(d.base_seed), k));
}

function simulate(balls, shot) {
  const b = new ScenarioBuilder(table);
  for (const ball of balls) b.ball(ball.id, { x: ball.x, y: ball.y, params });
  return eng.simulate(
    b.shot({ theta: 0, a: 0, b: 0, ...shot }).options(base.options).build());
}

function analyze(record) {
  const a = { firstContact: null, pots: [], scratch: false, cueContacts: 0 };
  for (const e of record.events ?? []) {
    const k = e.kind;
    if (!k || typeof k === 'string') continue;
    if (k.BallBall && (k.BallBall.b1 === 0 || k.BallBall.b2 === 0)) {
      a.cueContacts += 1; // GH-134 clean-contact predicate input
      if (a.firstContact === null) {
        a.firstContact = k.BallBall.b1 === 0 ? k.BallBall.b2 : k.BallBall.b1;
      }
    }
    if (k.BallPocket) {
      a.pots.push([k.BallPocket.ball, k.BallPocket.pocket]);
      if (k.BallPocket.ball === 0) a.scratch = true;
    }
    if (k.BallOffTable?.ball === 0) a.scratch = true;
  }
  return a;
}

const pk = (i) => ctx.pockets[i];
/** Aim target for pocket i: CORNER pockets aim at the bed corner pulled
 * one ball radius into the table on each axis (the mouth apex — the kernel
 * disc center sits deep behind the jaws, and a shallow cross-table pot
 * aimed at the disc — or at the exact corner — grazes the near facing);
 * side pockets aim at the disc center (straight-in approaches only). */
function aimTarget(i) {
  if (i === 1 || i === 4) return pk(i);
  const pull = 1.0 * R; // swept offline: 0.7R grazes on the +phi jitter leg
  return {
    x: (i >= 3 ? 1 : -1) * (ctx.w / 2 - pull),
    y: (i % 3 === 2 ? 1 : -1) * (ctx.l / 2 - pull),
  };
}
/** Ghost-ball phi from `cue` at `ob` toward aim target `t` (aimJs math). */
function ghostPhi(cue, ob, t) {
  const n = Math.hypot(t.x - ob.x, t.y - ob.y);
  const gx = ob.x - ((t.x - ob.x) / n) * 2 * R;
  const gy = ob.y - ((t.y - ob.y) / n) * 2 * R;
  return Math.atan2(gy - cue.y, gx - cue.x);
}

/** Run one leg: returns per-(seed, jitter) verdicts. */
function probe({ id, ball, pocket, cue, aimOff = { x: 0, y: 0 }, v0, b }) {
  const lay = layoutOf(id);
  const balls = lay.balls.map((x) => ({ ...x }));
  if (cue) balls[0] = { id: 0, ...cue };
  const ob = balls.find((x) => x.id === ball);
  const t0 = aimTarget(pocket);
  const target = { x: t0.x + aimOff.x * D, y: t0.y + aimOff.y * D };
  const phi0 = ghostPhi(balls[0], ob, target);
  const out = [];
  for (const seed of [1000, 1001, 1002, 1003]) {
    for (const dphi of [-0.0015, 0, 0.0015]) {
      const rec = simulate(balls, { v0, b, phi: phi0 + dphi, seed });
      const a = analyze(rec);
      const potted = a.pots.some(([bl, po]) => bl === ball && po === pocket);
      const wrongDrop = a.pots.some(([bl, po]) => bl !== 0 && po !== pocket);
      out.push({ seed, dphi, first: a.firstContact, potted, wrongDrop,
        scratch: a.scratch, cueContacts: a.cueContacts, pots: a.pots });
    }
  }
  return { id, phi0, out };
}

// diamond → kernel meters helper for hand-authored cue spots
const dm = (dx, dy) => ({ x: (dx - 2) * (ctx.w / 4), y: (dy - 4) * (ctx.l / 8) });

// ---- the legs under probe (mirror of the e2e arm-16 playability table) -----
const LEGS = [
  // base + e2m: ball 1 at the foot end, straight-ish into the foot-left
  // corner from the catalog's default laid cue (on the pot line)
  { id: 'lineup', ball: 1, pocket: 2, v0: 2.2, b: -0.25 },
  { id: 'lineup-e2m', ball: 1, pocket: 2, v0: 2.2, b: -0.25 },
  // m2e: the center ball straight into the LEFT side pocket
  { id: 'lineup-m2e', ball: 1, pocket: 1, v0: 1.9, b: -0.3 },
  // random (k=0 deterministic): pocket + cue computed by the arm's rule —
  // filled in below once the slot is known
  null,
  // lateral: the left-end ball up into the foot-left corner (the bed-corner
  // aim keeps the object path off the left cushion). GH-136 re-pin: the
  // uniform-16-gap law moved the end slots ~57 mm toward the cushions — the
  // old v0 2.6 / b −0.3 pin went knife-edge (red at neighbouring v0), so
  // the recipe re-centered on the swept green plateau.
  { id: 'lineup-lateral', ball: 1, pocket: 2, v0: 2.4, b: -0.2 },
  // lateral order variants (GH-131 review finding 1): lat-e2m shares the
  // base row's ball-1 slot + recipe; lat-m2e pots the CENTER ball into the
  // foot-left corner from the default laid cue on the pot line (a
  // side-pocket line from the center slot would clip the row's neighbours;
  // the center slot sits at x = 0 under the GH-136 law too — re-certified)
  { id: 'lineup-lat-e2m', ball: 1, pocket: 2, v0: 2.4, b: -0.2 },
  { id: 'lineup-lat-m2e', ball: 1, pocket: 2, v0: 2.4, b: -0.3 },
  // L (GH-136 rebuild): ball 1 just above the FOOT-RAIL MIDPOINT, a
  // near-straight shot along the foot cushion into the enclosed foot-right
  // pocket from the default laid cue; the drawn cue returns up the rail
  // line, clear of leg A
  { id: 'lineup-l', ball: 1, pocket: 5, v0: 2.0, b: -0.25 },
  // L ends-to-middle (GH-177): the IDENTICAL L layout under the
  // alternating id-placement permutation — ball 1 keeps lineup-l's slot 1
  // (leg A far end) and the default cue, so the same recipe must replay
  // byte-identically; probed anyway (the re-verify law) under the GH-134
  // cueContacts === 1 criterion
  { id: 'lineup-l-e2m', ball: 1, pocket: 5, v0: 2.0, b: -0.25 },
  // diagonal: the pocket-nearest ball on the default cut cue line. GH-134
  // re-pin: the pre-134 −55°-cut default address crashed the drawn cue into
  // the line on EVERY probed v0/b — the catalog default flipped to the
  // mirrored +45° side and the recipe re-tuned
  { id: 'lineup-diagonal', ball: 1, pocket: 5, v0: 2.0, b: -0.2 },
  // progressive (GH-131 review finding 3): the N=5 centered half-diamond
  // lay this diff reshaped — ball 1 at dy 5.0 into the foot-left corner
  // from the default laid cue on the pot line
  { id: 'progressive-lineup', ball: 1, pocket: 2, v0: 2.4, b: -0.3 },
];

// random: derive ball 1's slot, then the arm rule — foot corners when the
// ball sits in the foot 1.5 diamonds, head corners in the head 1.5, side
// pockets otherwise; cue 1.5D behind the ghost on the pot line
{
  const lay = layoutOf('lineup-random');
  const b1 = lay.balls.find((x) => x.id === 1);
  const pocket = b1.y >= 0.75 * D ? 2 : b1.y <= -0.75 * D ? 0 : 1;
  const t = aimTarget(pocket);
  const u = { x: t.x - b1.x, y: t.y - b1.y };
  const n = Math.hypot(u.x, u.y);
  const cue = { x: b1.x - (u.x / n) * 1.5 * D, y: b1.y - (u.y / n) * 1.5 * D };
  LEGS[3] = { id: 'lineup-random', ball: 1, pocket, cue, v0: 2.4, b: -0.3 };
  console.log(`lineup-random ball 1 at y=${(b1.y / D).toFixed(2)}D → pocket ${pocket}`);
}

let allGreen = true;
for (const leg of LEGS) {
  const { id, phi0, out } = probe(leg);
  // GH-134 clean-contact law: a playability recipe must pot the first ball
  // with EXACTLY ONE cue↔object contact — a scripted pot that crashes the
  // cue into a neighbour would fail the run under the new rule.
  const good = out.every((o) => o.first === leg.ball && o.potted
    && !o.wrongDrop && !o.scratch && o.cueContacts === 1);
  allGreen &&= good;
  console.log(`\n${id}: phi0=${phi0.toFixed(6)} v0=${leg.v0} b=${leg.b} → ${good ? 'GREEN' : 'RED'}`);
  if (!good) {
    for (const o of out) {
      if (o.first !== leg.ball || !o.potted || o.wrongDrop || o.scratch
        || o.cueContacts !== 1) {
        console.log('  ', JSON.stringify(o));
      }
    }
  }
}

// ---- the arm's RED legs (order violation + only-pocket violation) ----------
// order red: on `lineup`, a stroke first-contacting ball 15 (head-most)
{
  const lay = layoutOf('lineup');
  const balls = lay.balls.map((x) => ({ ...x }));
  balls[0] = { id: 0, ...dm(2.5, 1.2) };
  const ob = balls.find((x) => x.id === 15);
  const phi = ghostPhi(balls[0], ob, pk(0));
  const a = analyze(simulate(balls, { v0: 1.4, b: 0, phi, seed: 1000 }));
  console.log('\norder-red (lineup, hit 15 first):', JSON.stringify(a.pots),
    'first=', a.firstContact, a.firstContact === 15 ? 'GREEN' : 'RED');
}
// crash red (issue GH-134, the clean-contact law): on `lineup` (byte-shared
// with lineup-called), pot ball 1 into the foot-left corner from a cue near
// the foot-rail right side — the stun tangent slides the cue down the string
// into ball 2 (cueContacts >= 2, no scratch, no wrong drop). This pins the
// e2e arm's red stroke; green across seeds 1000..1003 × ±0.0015 rad phi.
{
  const lay = layoutOf('lineup');
  const balls0 = lay.balls.map((x) => ({ ...x }));
  balls0[0] = { id: 0, ...dm(3.0, 7.5) };
  const ob = balls0.find((x) => x.id === 1);
  const t2 = aimTarget(2);
  let good = true;
  for (const seed of [1000, 1001, 1002, 1003]) {
    for (const dphi of [-0.0015, 0, 0.0015]) {
      const phi = ghostPhi(balls0[0], ob, t2) + dphi;
      const a = analyze(simulate(balls0, { v0: 2.2, b: 0, phi, seed }));
      const potted = a.pots.some(([bl, po]) => bl === 1 && po === 2);
      const clean = a.pots.every(([bl, po]) => bl === 0 || (bl === 1 && po === 2));
      if (!(a.firstContact === 1 && potted && clean && !a.scratch
        && a.cueContacts >= 2)) {
        good = false;
        console.log(`  crash-red seed=${seed} dphi=${dphi}:`, JSON.stringify(a));
      }
    }
  }
  console.log('\ncrash-red (lineup, pot 1 then cue into 2):', good ? 'GREEN' : 'RED');
  allGreen &&= good;
}
// crash red, progressive (GH-134): the SAME law over onProgressiveSettle's
// own analyze path — N=5 lay, pot ball 1 (dy 5.0) into the foot-left corner
// with draw from dm(2.4, 4.5); the curled cue re-contacts the string.
{
  const lay = layoutOf('progressive-lineup'); // k = protocol.start = 5
  const balls0 = lay.balls.map((x) => ({ ...x }));
  balls0[0] = { id: 0, ...dm(2.4, 4.5) };
  const ob = balls0.find((x) => x.id === 1);
  const t2 = aimTarget(2);
  let good = true;
  for (const seed of [1000, 1001, 1002, 1003]) {
    for (const dphi of [-0.0015, 0, 0.0015]) {
      const phi = ghostPhi(balls0[0], ob, t2) + dphi;
      const a = analyze(simulate(balls0, { v0: 1.8, b: -0.3, phi, seed }));
      const potted = a.pots.some(([bl, po]) => bl === 1 && po === 2);
      const clean = a.pots.every(([bl, po]) => bl === 0 || (bl === 1 && po === 2));
      if (!(a.firstContact === 1 && potted && clean && !a.scratch
        && a.cueContacts >= 2)) {
        good = false;
        console.log(`  crash-red-prog seed=${seed} dphi=${dphi}:`, JSON.stringify(a));
      }
    }
  }
  console.log('crash-red (progressive-lineup N=5, pot 1 then crash):',
    good ? 'GREEN' : 'RED');
  allGreen &&= good;
}
// issue #209: `lineup-diagonal` relaxed to the family BASE any-pocket law
// (the pocket-5-on-the-collinear-extension geometry was openable but not
// clearable into one pocket — FORMAT.md §3.10). Potting ball 1 into the
// foot-LEFT corner (pocket 2) is now a LEGAL continuation, not an
// only-pocket fail, so the diagonal only-pocket-red block was retired; the
// only-pocket law is still probed on `lineup-l` below (its enclosed pocket
// 5 is fed at an angle, so a non-enclosed drop stays a genuine 'pocket'
// fail).
// only-pocket red, L (issue GH-136): on `lineup-l`, pot ball 1 (just above
// the foot-rail midpoint) STRAIGHT along the foot rail into the foot-LEFT
// corner (pocket 2 — a NON-enclosed pocket; the enclosed pocket is 5) from
// a near-rail cue 0.35D behind it on the pot line — the mirror of the
// diagonal red above; pins the e2e arm-16c L red leg.
{
  const lay = layoutOf('lineup-l');
  const balls = lay.balls.map((x) => ({ ...x }));
  const ob = balls.find((x) => x.id === 1);
  const t2 = aimTarget(2);
  const u2 = { x: t2.x - ob.x, y: t2.y - ob.y };
  const n2 = Math.hypot(u2.x, u2.y);
  balls[0] = { id: 0, x: ob.x - (u2.x / n2) * 0.35 * D, y: ob.y - (u2.y / n2) * 0.35 * D };
  console.log('only-pocket-red-L cue at', balls[0].x.toFixed(4), balls[0].y.toFixed(4));
  let good = true;
  for (const seed of [1000, 1001, 1002, 1003]) {
    const phi = ghostPhi(balls[0], ob, t2);
    const a = analyze(simulate(balls, { v0: 2.4, b: -0.2, phi, seed }));
    const wrongPot = a.pots.some(([bl, po]) => bl === 1 && po === 2);
    const ok = a.firstContact === 1 && wrongPot && !a.scratch;
    good &&= ok;
    console.log(`only-pocket-red (L → pocket 2, seed=${seed}):`,
      JSON.stringify(a.pots), 'first=', a.firstContact, ok ? 'GREEN' : 'RED');
  }
  allGreen &&= good;
}

console.log(allGreen ? '\nALL PLAYABILITY LEGS GREEN' : '\nSOME LEGS RED — tune');
