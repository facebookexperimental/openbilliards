// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-marks.mjs — node arm for the cloth marks of the club look (CONTRACT.md section 12; owner: marks).
// What it holds: the model's reading of real kernel records (which shots mark, where, how strongly), law 2 (the picture is a
// function of the record and t: any order of times gives the same records and the same texture bytes, a time before a
// mark's event shows no mark), the bounds (records per frame, the session list), no random or clock source, the listener
// contract through the REAL wiring (motion.js: a bad record never throws, never writes, never adds a mesh), the capture
// guard, and the shape of the shader term (anchor, order against the cloth and occlusion patches, one sampler).
// Run: node web/tools/club/test-club-marks.mjs   (about a second; add --stats for the marks of each canned shot)
import assert from 'node:assert/strict';
import nodeModule from 'node:module';
import { readFileSync } from 'node:fs';
import {
  shotMarks, marksAt, marksAtEnd, trackPointAt, legPoint, onCloth, slipSpeed, seed01, eventKind, createSession, recordsBox, MARKS_TUNE, MARK_BURN, MARK_CHALK, RECORD_FLOATS,
} from '../../scene/club/motion/marks/model.js';
import { marksPatchSpec, marksUniformNames, MARKS_PATCH_VERSION, MARK_MAX, MARKS_LOOK, ANCHOR_MARKS } from '../../scene/club/motion/marks/glsl.js';
import { clothPatchSpec } from '../../scene/club/mat/cloth/glsl.js';
import { occPatchSpec } from '../../scene/club/occ/glsl.js';
import { applyPatchText } from '../../scene/club/patchtext.js';
import { init, ScenarioBuilder, ShotBuilder, recordDuration } from '../../dist/pool-sdk/index.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log(`OK ${name}`); };
const STATS = process.argv.includes('--stats');
const here = new URL('.', import.meta.url);
const R = 0.028575, TABLE = { ballR: R, halfL: 1.27, halfW: 0.635 };

// ---- real records: fixed scenarios through the canonical kernel (the same ones the dev page plays) ----
const engine = await init(new URL('../../dist/pool-wasm/pool_wasm.js', import.meta.url));
// every canned shot uses the rack scenario's table and options (the kernel's realistic preset: what the app plays with)
const rack = engine.nineBallRack(1);
const shotOf = (place, shot) => { const sb = new ScenarioBuilder(rack.system.table); for (const [id, x, y] of place) sb.ball(id, { x, y }); return sb.shot(shot).options(rack.options).build(); };
const DRAW_BALLS = [[0, 0.10, -0.55], [1, -0.05, 0.05], [2, 0.28, 0.42], [4, 0.45, -0.15]];
const SHOTS = {
  break: () => shotOf(rack.system.balls.map((b) => [b.id, b.state.pos.x, b.state.pos.y]), new ShotBuilder().v0(9).phi(Math.PI / 2).tip(0, 0).seed(1).build()),
  draw: () => shotOf(DRAW_BALLS, new ShotBuilder().v0(5).phi(Math.atan2(0.6, -0.15)).tip(0, -0.45).seed(2).build()),
  soft: () => shotOf([[0, 0.1, -0.55], [1, -0.05, 0.05]], new ShotBuilder().v0(1.2).phi(Math.atan2(0.6, -0.15)).tip(0, 0.2).seed(3).build()),
  jump: () => shotOf([[0, 0.1, -0.55], [1, 0.1, -0.3], [2, 0.1, 0.5]], new ShotBuilder().v0(3).phi(Math.PI / 2).theta(35 * Math.PI / 180).tip(0, 0).seed(4).build()),
  swerve: () => shotOf([[0, -0.3, -0.8], [1, 0.3, 0.9]], new ShotBuilder().v0(4).phi(Math.PI / 2 - 0.1).theta(8 * Math.PI / 180).tip(0.4, -0.2).seed(5).build()),
  // the draw shot with the cue raised 8 degrees: driven into the bed, a flight, a landing, then the skid
  lift: () => shotOf(DRAW_BALLS, new ShotBuilder().v0(5).phi(Math.atan2(0.6, -0.15)).theta(8 * Math.PI / 180).tip(0, -0.45).seed(2).build()),
};
const REC = {}, MODEL = {};
for (const [name, make] of Object.entries(SHOTS)) { REC[name] = engine.simulate(make()); MODEL[name] = shotMarks(REC[name], TABLE); }
const kinds = (m) => { const o = {}; for (const k of m.marks) o[k.kind] = (o[k.kind] ?? 0) + 1; return o; };
if (STATS) for (const [name, m] of Object.entries(MODEL)) {
  console.log(`   ${name}: ${JSON.stringify(m.counts)}`);
  for (const k of m.marks) console.log(`      ${k.kind.padEnd(5)} event ${String(k.index).padStart(3)} ball ${k.ball} t ${k.t0.toFixed(3)}..${k.t1.toFixed(3)} strength ${k.s0.toFixed(2)}${k.kind === 'track' ? ` stretches ${k.legs.length} length ${(k.length * 1000).toFixed(0)} mm, ${marksAtEnd({ marks: [k] }, 99).length} records` : ` -> ${k.s1.toFixed(2)}`} half ${(k.half * 1000).toFixed(1)} mm`);
}
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

await ok('which shots mark: a break and a hard draw leave a full-strength track, a soft roll leaves chalk only, grazing hops of a break leave no dot', () => {
  // the break: the cue ball slides from the head string into the rack at full strength, one straight part
  const b = MODEL.break;
  const cueTrack = b.marks.find((m) => m.kind === 'track' && m.ball === 0);
  assert.ok(cueTrack && cueTrack.s0 === 1 && cueTrack.t0 < 1e-6 && marksAtEnd({ marks: [cueTrack] }, 99).length === 1, 'the cue ball\'s break track: full strength, one straight record');
  const cueEnd = trackPointAt(cueTrack, cueTrack.t1);
  assert.ok(Math.abs(cueTrack.legs[0].a[0] + 0.635) < 1e-6 && Math.abs(cueTrack.legs[0].a[1]) < 1e-6 && cueEnd[0] > 0.5 && Math.abs(cueEnd[1]) < 1e-3, 'from the head string toward the rack (world x = kernel y)');
  assert.ok(b.counts.skips >= 10 && b.counts.dots === 0, `the cluster's grazing hops are skips, not landings: no dot (${b.counts.skips} skips, ${b.counts.landings} landings)`);
  assert.ok(b.counts.tracks >= 2 && b.counts.tracks <= 12 && b.counts.stretches > 40, 'only the hard skids of a break are kept');
  // the draw shot: full strength on the way out (backspin: the contact point slips at over 10 m/s)
  const d = MODEL.draw;
  const out = d.marks.find((m) => m.kind === 'track' && m.ball === 0 && m.t0 < 1e-6);
  assert.ok(out && out.s0 === 1 && out.legs.length >= 2 && out.legs[out.legs.length - 1].s0 < 0.4, 'the draw shot\'s track: out at full strength, back weaker, one track');
  const outRecs = marksAtEnd({ marks: [out] }, 99);
  assert.ok(outRecs.length === 2 && outRecs[0][5] === 1 && outRecs[1][5] < 0.4 && outRecs[1][6] === 0, `two records: out, and back fading to nothing (${outRecs.length})`);
  // the same shot with the cue raised 8 degrees: a dot where the ball was driven into the bed, a flight that marks nothing,
  // a dot where it lands, then the skid
  const lift = MODEL.lift.marks.filter((m) => m.ball === 0 && m.kind !== 'speck' && m.kind !== 'smear');
  assert.deepEqual(lift.map((m) => m.kind), ['land', 'land', 'track']);
  assert.ok(lift[0].t0 < 1e-6 && lift[1].t0 > 0.05 && lift[1].a[0] - lift[0].a[0] > 0.3 && lift[2].t0 >= lift[1].t0 && lift[2].legs[0].a[0] >= lift[1].a[0] - 1e-6, 'nothing is drawn under the flight');
  assert.ok(lift[0].s0 > 0.3 && lift[0].s0 < 0.7 && lift[1].s0 > 0.3 && lift[1].s0 < 0.7, 'landing scuffs at about half strength');
  for (const m of Object.values(MODEL)) for (const k of m.marks) if (k.kind === 'land') assert.ok(k.half >= 0.005 && k.half <= 0.008, 'a landing dot is one to one and a half centimetres across');
  assert.ok(slipSpeed(REC.draw.events[0].post[0][1], R) > 10 && Math.hypot(REC.draw.events[0].post[0][1].vel.x, REC.draw.events[0].post[0][1].vel.y) < 7, 'slip speed over ball speed (backspin)');
  // a soft roll: chalk, no burn, no dot
  assert.deepEqual(kinds(MODEL.soft), { speck: 1, smear: 1 });
  // an elevated cue drives the ball into the bed where it sat: a dot there, and one where it comes down
  const lands = MODEL.jump.marks.filter((m) => m.kind === 'land');
  assert.ok(lands.length >= 2 && lands[0].t0 < 1e-6 && lands[0].s0 > 0.8 && Math.abs(lands[0].a[0] + 0.55) < 1e-4, `the dot where the jumped ball sat (${JSON.stringify(lands[0])})`);
  assert.ok(lands[1].t0 > 0.1 && lands[1].a[0] > -0.2 && lands[1].s0 > 0.1 && lands[1].s0 < lands[0].s0, 'and a weaker one where it landed');
  // every shot: a chalk speck behind the ball and a smear in front of it, at the strike
  for (const [name, m] of Object.entries(MODEL)) {
    const speck = m.marks.find((k) => k.kind === 'speck'), smear = m.marks.find((k) => k.kind === 'smear');
    assert.ok(speck && smear && speck.t0 === 0 && smear.t0 === 0, `${name}: chalk at the strike`);
    const p0 = REC[name].events[0].post[0][1].pos, v = REC[name].events[0].post[0][1].vel;
    const dir = [v.y, v.x].map((c) => c / Math.hypot(v.x, v.y));
    assert.ok((speck.a[0] - p0.y) * dir[0] + (speck.a[1] - p0.x) * dir[1] < -0.5 * R, `${name}: the speck lies behind the ball (under the tip)`);
    assert.ok((smear.b[0] - p0.y) * dir[0] + (smear.b[1] - p0.x) * dir[1] > 0.01 && smear.s1 === 0, `${name}: the smear runs forward and fades out`);
  }
});

await ok('slip: zero at every sliding-to-rolling transition of the real records (the contact-point formula matches the kernel\'s axes)', () => {
  let seen = 0;
  for (const rec of Object.values(REC)) for (const ev of rec.events) {
    if (eventKind(ev) !== 'Transition' || ev.kind.Transition.to !== 'Rolling') continue;
    const st = ev.post.find(([id]) => id === ev.kind.Transition.ball)[1];
    assert.ok(slipSpeed(st, R) < 1e-6, `slip at rolling: ${slipSpeed(st, R)}`);
    seen += 1;
  }
  assert.ok(seen >= 10);
  assert.equal(slipSpeed({ vel: { x: 0, y: 2, z: 0 }, avel: { x: -2 / R, y: 0, z: 0 } }, R), 0, 'rolling along +y');
  assert.equal(slipSpeed({ vel: { x: 0, y: 2, z: 0 }, avel: { x: 2 / R, y: 0, z: 0 } }, R), 4, 'backspin doubles it');
  assert.equal(slipSpeed(null, R), 0);
});

await ok('a track is where the ball was: the parabola through the recorded states stays within 3 mm of the kernel\'s sampler along every kept slide', () => {
  let worst = 0, checked = 0;
  for (const name of Object.keys(REC)) {
    const sampler = engine.sampler(REC[name]);
    const ids = REC[name].initial.balls.map((b) => b.id);
    for (const m of MODEL[name].marks.filter((k) => k.kind === 'track')) {
      const i = ids.indexOf(m.ball);
      for (const leg of m.legs) for (let j = 1; j < 12; j++) {
        const tau = leg.te * j / 12;
        const d = sampler.sampleAt(leg.t0 + tau);
        const p = legPoint(leg, tau);
        const err = Math.hypot(p[0] - d[8 * i + 1], p[1] - d[8 * i]); // world x = kernel y, world z = kernel x
        worst = Math.max(worst, err); checked += 1;
        const q = trackPointAt(m, leg.t0 + tau);
        assert.ok(q && Math.hypot(q[0] - d[8 * i + 1], q[1] - d[8 * i]) < 3e-3, 'trackPointAt finds the stretch');
      }
    }
    sampler.free?.();
  }
  // not exact: the kernel's slide is not one constant acceleration everywhere (a short elevated-press phase follows a
  // strike); the parabola stays within a few millimetres of the ball's centre, well inside the ball's own footprint
  assert.ok(checked > 100 && worst < 3e-3, `track against the sampler: worst ${(worst * 1000).toFixed(3)} mm over ${checked} points`);
  if (STATS) console.log(`   track against the kernel's sampler: worst ${(worst * 1000).toFixed(4)} mm over ${checked} points`);
});

await ok('law 2: marksAt is a function of the record and t (any order of times, a model rebuilt from the record, a frozen record)', () => {
  const times = [-1, 0, 0.01, 0.03, 0.06, 0.1, 0.2, 0.4, 0.9, 1.5, 3, 20];
  for (const name of Object.keys(REC)) {
    const first = new Map(times.map((t) => [t, JSON.stringify(marksAt(MODEL[name], t, MARK_MAX))]));
    const r = rng(7);
    for (let k = 0; k < 200; k++) {
      const t = times[Math.floor(r() * times.length)];
      assert.equal(JSON.stringify(marksAt(MODEL[name], t, MARK_MAX)), first.get(t), `${name} at ${t}`);
    }
    // the model is the record's alone: built again from a deep-frozen copy it gives the same records (and never writes the record)
    const again = shotMarks(deepFreeze(JSON.parse(JSON.stringify(REC[name]))), TABLE);
    for (const t of times) assert.equal(JSON.stringify(marksAt(again, t, MARK_MAX)), first.get(t));
  }
});

await ok('law 2: no mark before its event; a track grows with the ball and never shrinks; chalk settles in after the strike', () => {
  for (const name of Object.keys(REC)) {
    const m = MODEL[name];
    assert.deepEqual(marksAt(m, -0.001, MARK_MAX), [], `${name}: nothing before the strike`);
    assert.deepEqual(marksAt(m, 0, MARK_MAX).filter((r) => r[7] >= MARK_CHALK), [], `${name}: no chalk at the instant of the strike`);
    for (const k of m.marks) {
      // just before the mark's event it is not among the records; from its event on it is
      const before = shotMarks({ events: REC[name].events.slice(0, k.index), shot: REC[name].shot }, TABLE);
      assert.ok(!before.marks.some((x) => x.index === k.index && x.kind === k.kind), 'a mark needs its event');
    }
    // (the drawn length may give back the few millimetres by which points are merged and corners are cut, never more)
    let prevLen = 0, prevMarks = 0;
    for (let t = 0; t <= recordDuration(REC[name]) + 0.5; t += 0.01) {
      const recs = marksAt(m, t, 1000);
      const len = recs.reduce((s, r) => s + Math.hypot(r[2] - r[0], r[3] - r[1]), 0);
      const shown = m.marks.filter((k) => t >= k.t0).length;
      assert.ok(len >= prevLen - 0.006 && shown >= prevMarks, `${name}: marks only grow as t grows (t = ${t.toFixed(2)}: ${len} after ${prevLen})`);
      prevLen = Math.max(prevLen, len); prevMarks = shown;
      for (const r of recs) { assert.equal(r.length, RECORD_FLOATS); assert.ok(r.every(Number.isFinite) && r[5] >= 0 && r[5] <= 1 && r[6] >= 0 && r[6] <= 1 && r[4] > 0.002 && r[4] < 0.012); }
    }
    assert.equal(JSON.stringify(marksAtEnd(m, 1000)), JSON.stringify(marksAt(m, 1e6, 1000)));
  }
  // the head of the draw shot's track at t is the ball's place at t (not the end of the slide)
  const out = MODEL.draw.marks.find((k) => k.kind === 'track' && k.ball === 0 && k.t0 < 1e-6);
  const tHalf = out.legs[0].t0 + out.legs[0].te / 2;
  const half = marksAt(MODEL.draw, tHalf, MARK_MAX).find((r) => r[7] < MARK_CHALK);
  const head = trackPointAt(out, tHalf), full = legPoint(out.legs[0], out.legs[0].te);
  assert.ok(Math.abs(half[2] - head[0]) < 1e-9 && Math.abs(half[3] - head[1]) < 1e-9 && Math.hypot(half[2] - half[0], half[3] - half[1]) < Math.hypot(full[0] - out.legs[0].a[0], full[1] - out.legs[0].a[1]) * 0.75);
  assert.equal(trackPointAt(out, out.t0 - 1), null);
  const speck = (t) => marksAt(MODEL.draw, t, MARK_MAX).find((r) => r[7] >= MARK_CHALK && r[0] === r[2])?.[5] ?? 0;
  assert.ok(speck(0.01) === 0 && speck(0.1) > 0 && speck(0.1) < speck(0.2) && speck(0.31) === speck(5) && speck(5) > 0.5, 'the chalk fades in over the first third of a second');
});

await ok('bounds: at most `cap` records, the strongest kept, in the record\'s order; the box holds them', () => {
  const all = marksAtEnd(MODEL.break, 1000);
  assert.ok(all.length >= 6 && all.length <= MARK_MAX, `a break fits the texture (${all.length} records)`);
  for (let cap = 1; cap <= all.length; cap++) {
    const kept = marksAtEnd(MODEL.break, cap);
    assert.equal(kept.length, cap);
    const strength = (r) => Math.max(r[5], r[6]);
    const weakestKept = Math.min(...kept.map(strength));
    const dropped = all.filter((r) => !kept.some((k) => JSON.stringify(k) === JSON.stringify(r)));
    for (const r of dropped) assert.ok(strength(r) <= weakestKept + 1e-12, 'nothing stronger is dropped');
    let at = -1;
    for (const k of kept) { const i = all.findIndex((r) => JSON.stringify(r) === JSON.stringify(k)); assert.ok(i > at, 'order kept'); at = i; }
  }
  assert.deepEqual(marksAtEnd(MODEL.break, 0), []);
  assert.deepEqual(marksAt(null, 1, 8), []); assert.deepEqual(marksAt(MODEL.break, NaN, 8), []);
  const box = recordsBox(all, 0.04);
  for (const r of all) assert.ok(r[0] > box[0] && r[2] > box[0] && r[1] > box[1] && r[3] > box[1] && r[0] < box[2] && r[2] < box[2] && r[1] < box[3] && r[3] < box[3]);
  assert.deepEqual(recordsBox([], 0.04), [0, 0, 0, 0]);
  // marks stay on the playing surface (a ball's radius past the nose line at most)
  for (const m of Object.values(MODEL)) for (const r of marksAtEnd(m, 1000)) assert.ok(Math.abs(r[0]) <= 1.27 + R + 1e-9 && Math.abs(r[2]) <= 1.27 + R + 1e-9 && Math.abs(r[1]) <= 0.635 + R + 1e-9 && Math.abs(r[3]) <= 0.635 + R + 1e-9);
});

await ok('the session list is bounded: six shots, ten records a shot, the oldest fades out and leaves, a re-rack clears it', () => {
  const s = createSession({ shots: 6, perShot: 10 });
  const rec = (k) => [k, 0, k + 0.1, 0, 0.005, 1, 0.5, 0.25];
  for (let k = 0; k < 20; k++) { assert.equal(s.push(`shot${k}`, Array.from({ length: 14 }, (_, j) => rec(k + j / 100))), true); assert.ok(s.size <= 6); }
  assert.equal(s.size, 6);
  assert.ok(s.has('shot19') && s.has('shot14') && !s.has('shot13'), 'the oldest left');
  const list = s.list(1000);
  assert.equal(list.length, 60, 'ten records a shot');
  assert.equal(list[0][5], 1); assert.ok(Math.abs(list[59][5] - 1 / 6) < 1e-12, 'the oldest shot is at a sixth');
  for (let i = 1; i < list.length; i++) assert.ok(list[i][5] <= list[i - 1][5] + 1e-12, 'newest first, fading with age');
  assert.equal(s.list(7).length, 7);
  s.push('shot19', [rec(1)]); assert.equal(s.size, 6, 'the same shot twice is one entry');
  assert.equal(s.clear(), 6); assert.equal(s.size, 0); assert.deepEqual(s.list(32), []);
  assert.equal(s.push('x', null), false);
});

await ok('no random and no clock: the sources name none, the seeds are hashes of the shot seed and the event index', () => {
  const files = ['../../scene/club/motion/marks.js', '../../scene/club/motion/marks/model.js', '../../scene/club/motion/marks/glsl.js'];
  for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    for (const bad of ['Math.random', 'performance.now', 'Date.now', 'new Date', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'crypto.']) assert.equal(code.includes(bad), false, `${f}: ${bad}`);
  }
  // and at run time: with the random source and the clocks booby-trapped the model still runs
  const keep = [Math.random, Date.now, globalThis.performance.now];
  Math.random = () => { throw new Error('Math.random called'); };
  Date.now = () => { throw new Error('Date.now called'); };
  globalThis.performance.now = () => { throw new Error('performance.now called'); };
  try { for (const rec of Object.values(REC)) marksAtEnd(shotMarks(rec, TABLE), MARK_MAX); } finally { [Math.random, Date.now, globalThis.performance.now] = keep; }
  assert.equal(seed01(5, 3, 1), seed01(5, 3, 1));
  const seeds = new Set(); for (let i = 0; i < 200; i++) seeds.add(seed01(1000 + (i % 4), i, i % 3));
  assert.ok(seeds.size === 200 && [...seeds].every((x) => x >= 0 && x < 1), 'seeds differ by shot, event and salt');
  // two shots with the same events and different seeds differ only in the seeds
  const a = marksAtEnd(MODEL.draw, MARK_MAX), b = marksAtEnd(shotMarks({ ...REC.draw, shot: { ...REC.draw.shot, seed: 99 } }, TABLE), MARK_MAX);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) { assert.deepEqual(a[i].slice(0, 7), b[i].slice(0, 7)); assert.equal(Math.floor(a[i][7]), Math.floor(b[i][7])); assert.notEqual(a[i][7], b[i][7]); }
});

await ok('a malformed record never throws and never marks', () => {
  const bad = [null, undefined, {}, { events: null }, { events: 'x' }, { events: [null, 1, 'Rest', {}, { t: NaN, post: [] }, { t: 0, kind: 'Rest' }, { t: 1, kind: { Strike: { ball: 0 } }, post: [[0, null], [0, {}], null, [0, { pos: { x: 0, y: NaN, z: 0 } }]] }] },
    { events: [{ t: 0, kind: { Transition: {} }, post: [[0, { pos: { x: 9, y: 9, z: R }, vel: { x: 1e30, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Sliding' }]] }, { t: 1, kind: {}, post: [[0, { pos: { x: 9, y: 9, z: R }, vel: { x: 0, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Rolling' }]] }] }];
  for (const rec of bad) { const m = shotMarks(rec, TABLE); assert.deepEqual(marksAtEnd(m, MARK_MAX), []); }
  // a strike that gave the ball no speed (nothing to aim a smear along): one speck where the ball sits, nothing else
  const still = shotMarks({ events: [{ t: 0, kind: { Strike: { ball: 0 } }, post: [[0, { pos: { x: 0, y: 0, z: R }, vel: { x: 0, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary' }]] }], shot: null }, TABLE);
  assert.deepEqual(still.marks.map((k) => k.kind), ['speck']);
  // a slide whose numbers fit no parabola is drawn as its chord, inside the table
  const odd = shotMarks({ shot: { seed: 1 }, events: [
    { t: 0, kind: { Strike: { ball: 0 } }, post: [[0, { pos: { x: 0, y: 0, z: R }, vel: { x: 0, y: 900, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Sliding' }]] },
    { t: 0.5, kind: { BallBall: { b1: 0, b2: 1 } }, post: [[0, { pos: { x: 0, y: 0.4, z: R }, vel: { x: 0, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary' }]] }] }, TABLE);
  const tr = odd.marks.find((k) => k.kind === 'track');
  assert.ok(tr && Math.abs(trackPointAt(tr, 0.25)[0] - 0.2) < 1e-9 && Math.abs(trackPointAt(tr, 0.5)[0] - 0.4) < 1e-9);
});

await ok('the look\'s bounds: a mark moves the albedo by a small share', () => {
  assert.ok(MARKS_LOOK.burn > 0 && MARKS_LOOK.burn <= 0.1, 'a burn: at most a tenth more of the cloth\'s own colour');
  assert.ok(MARKS_LOOK.burnNeutral >= 0 && MARKS_LOOK.burnNeutral <= 0.01, 'and at most a hundredth of its luminance as undyed light');
  assert.ok(MARKS_LOOK.chalkCover > 0 && MARKS_LOOK.chalkCover <= 0.03, 'chalk covers at most 3 % of the cloth');
  assert.ok(MARKS_LOOK.chalk.every((c) => c >= 0 && c <= 1) && MARKS_LOOK.chalk[2] > MARKS_LOOK.chalk[0], 'a pale blue powder');
  assert.ok(MARKS_TUNE.slip.from >= 2 && MARKS_TUNE.slip.full > MARKS_TUNE.slip.from && MARKS_TUNE.land.from >= 0.3, 'rolling and soft play mark nothing');
  assert.ok(MARKS_TUNE.skip > 0 && MARKS_TUNE.skip < MARKS_TUNE.land.from, 'a skip is lower than any landing that marks');
  assert.equal(onCloth({ motion: 'Sliding', vel: { x: 1, y: 0, z: 0 } }), true); assert.equal(onCloth({ motion: 'Rolling', vel: { x: 1, y: 0, z: 0 } }), false);
  assert.equal(onCloth({ motion: 'Airborne', vel: { x: 6, y: 0, z: 0.1 } }), true); assert.equal(onCloth({ motion: 'Airborne', vel: { x: 6, y: 0, z: -0.9 } }), false); assert.equal(onCloth(null), false);
});

// ---- the shader term ----
const THREE_SRC = await import('../../vendor/three.module.min.js');
await ok('patch: one `before` anchor that exists once; the term reads the finished albedo (after the cloth part\'s colour piece) in any patch order; one sampler', () => {
  const spec = marksPatchSpec({ uniforms: {} });
  assert.equal(spec.key, `motion-marks-v${MARKS_PATCH_VERSION}`);
  assert.equal(spec.apply.length, 1); assert.equal(spec.apply[0].mode, 'before'); assert.equal(spec.apply[0].anchor, ANCHOR_MARKS);
  const f = THREE_SRC.ShaderLib.physical.fragmentShader;
  const count = (text, s) => text.split(s).length - 1;
  assert.equal(count(f, ANCHOR_MARKS), 1);
  assert.ok(f.indexOf('#include <map_fragment>') < f.indexOf(ANCHOR_MARKS) && f.indexOf(ANCHOR_MARKS) < f.indexOf('#include <lights_fragment_begin>'));
  assert.ok(THREE_SRC.ShaderChunk.lights_physical_fragment.includes('material.diffuseColor = diffuseColor.rgb'), 'three reads diffuseColor right after the term');
  const shading = readFileSync(new URL('../../scene/shading.js', here), 'utf8');
  assert.ok(shading.includes('varying vec3 vSpikeWorldPos;') && shading.includes("'#include <lights_physical_fragment>' + SPIKE_WEAR_SHEEN") && shading.includes("'#include <map_fragment>' + SPIKE_WEAR_MAP"), 'the app keeps the include and hands the cloth its world position');
  // composed with the cloth part and the occlusion service in every order: all apply, the term sits after the cloth's
  // colour piece and the app's wear map, before the include
  // (a stand-in for the app's cloth fragment shader: the anchors in the order three and shading.js injectAnalytic leave them;
  // its SPIKE_APPLY block ends with the app's sheen rails, copied from shading.js and pinned there: the cloth patch's lamp
  // sheen piece anchors on the first)
  const SHEEN_RAILS = ['  #ifdef USE_SHEEN', '    sheenSpecularDirect *= spikeShadow;', '    sheenSpecularIndirect *= spikeOcc;', '  #endif'];
  assert.equal(count(shading, SHEEN_RAILS.join('\n')), 1, 'shading.js: the sheen rails of SPIKE_APPLY, as the stand-in copies them');
  assert.ok(shading.indexOf(SHEEN_RAILS.join('\n')) > shading.indexOf('  reflectedLight.directDiffuse *= spikeShadow;\n'), 'shading.js: the sheen rails come after the rail line');
  const VS = 'void main() {\n#include <common>\n#include <project_vertex>\n}';
  const FS = ['#include <common>', 'void main() {', '#include <map_fragment>', '// APP WEAR MAP', '#include <normal_fragment_begin>', '#include <normal_fragment_maps>',
    '#include <clearcoat_normal_fragment_begin>', '#include <lights_physical_fragment>', 'SPIKE_WEAR_SHEEN;', '#include <lights_fragment_begin>', '#include <lights_fragment_end>',
    '{', '      spikeShadow *= mix( 1.0, gi.a, uGiShadow );', '  reflectedLight.directDiffuse *= spikeShadow;', '  reflectedLight.indirectDiffuse *= spikeOcc;', ...SHEEN_RAILS, '}', '}'].join('\n');
  const cloth = clothPatchSpec({ uniforms: {} }), occ = occPatchSpec('table', { uniforms: {} }), gi = occPatchSpec('gi', { uniforms: {} });
  const orders = [[occ, gi, cloth, spec], [spec, cloth, occ, gi], [cloth, spec, gi, occ], [spec, occ, gi, cloth]];
  for (const order of orders) {
    let v = VS, fs = FS;
    for (const s of order) { const r = applyPatchText(v, fs, s); assert.equal(r.ok, true, `${s.key} applies`); v = r.vs; fs = r.fs; }
    const term = fs.indexOf('vec2 clubMarkP = vSpikeWorldPos.xz;'), colour = fs.indexOf('diffuseColor.rgb = clubClothSat('), wear = fs.indexOf('// APP WEAR MAP'), inc = fs.indexOf(ANCHOR_MARKS);
    assert.ok(colour > 0 && wear > 0 && term > colour && term > wear && term < inc, 'colour piece, wear map, then the marks, then the include');
    assert.equal(count(fs, 'uniform highp sampler2D uClubMarkTex;'), 1);
    assert.ok(fs.indexOf('uniform highp sampler2D uClubMarkTex;') < fs.indexOf('void main()'));
  }
  // one sampler, four uniforms, every identifier prefixed
  const text = spec.pars + spec.apply[0].code;
  assert.equal((text.match(/sampler2D/g) ?? []).length, 1);
  const declared = [...spec.pars.matchAll(/^uniform\s+(?:highp\s+)?\w+\s+(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(declared, marksUniformNames());
  for (const m of spec.apply[0].code.matchAll(/^\s*(?:const\s+)?(?:vec[234]|float|bool|int)\s+(\w+)/gm)) assert.ok(/^clubMark/.test(m[1]), `local ${m[1]}`);
  for (const m of spec.apply[0].code.matchAll(/for \( int (\w+)/g)) assert.ok(/^clubMark/.test(m[1]));
  assert.equal(/clubCloth|uClubCloth|clubVis|spike[A-Z]/.test(text.replace(/vSpikeWorldPos/g, '')), false, 'the term reads nothing of another patch but the world position');
  // nothing is written and nothing is read from the texture unless the count is over zero
  assert.ok(spec.apply[0].code.indexOf('if ( uClubMarkK.x > 0.5') < spec.apply[0].code.indexOf('texelFetch') && spec.apply[0].code.indexOf('texelFetch') < spec.apply[0].code.indexOf('diffuseColor.rgb ='));
  assert.ok(spec.apply[0].code.includes(`clubMarkI < ${MARK_MAX};`) && spec.apply[0].code.indexOf('dFdx( clubMarkP )') < spec.apply[0].code.indexOf('if ( uClubMarkK.x > 0.5'));
});

// ---- the real part under the real wiring (three objects, no GL) ----
if (typeof nodeModule.registerHooks === 'function') {
  const threeUrl = new URL('../../vendor/three.module.min.js', import.meta.url).href;
  nodeModule.registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : next(specifier, context); } });
  const THREE = await import('three');
  const { createMotion } = await import('../../scene/club/motion.js');
  const { applyMarks } = await import('../../scene/club/motion/marks.js');

  const fakeMat = (key = 'spike-cloth') => ({ isMeshPhysicalMaterial: true, name: 'cloth', userData: {}, customProgramCacheKey: () => key, onBeforeRender() { this.calls = (this.calls ?? 0) + 1; } });
  function rig({ query = '', knobs = { motion: 'full', motionMarks: 32, motionDust: 0 }, mats = [fakeMat()] } = {}) {
    const listeners = { frame: [], stateChange: [] };
    const machine = {
      state: 'AIM',
      on(event, fn) { listeners[event].push(fn); return () => { const i = listeners[event].indexOf(fn); if (i >= 0) listeners[event].splice(i, 1); }; },
      emit(event, ...a) { for (const fn of [...listeners[event]]) fn(...a); },
      to(next, info) { const prev = machine.state; machine.state = next; machine.emit('stateChange', next, prev, info); },
    };
    const game = { record: null, clock: 0, duration: 0, template: { system: { table: { length: 2.54, width: 1.27 }, balls: [{ params: { r: R } }] } }, ballSet: { balls: [] }, cueBall: () => null, activeBalls: () => [] };
    const patches = [];
    const adopt = { find: (cls) => (cls === 'cloth' ? mats : []), patch(m, spec) { if ((m.userData.keys ??= []).includes(spec.key)) return false; m.userData.keys.push(spec.key); patches.push({ m, spec }); return true; } };
    const scene = new THREE.Scene();
    const club = { enabled: true, tier: 'high', knobs, adopt, ctx: { scene, machine, game, query: new URLSearchParams(query) } };
    const play = (record, info = { strike: true }) => { game.record = record; game.duration = record ? recordDuration(record) : 0; game.clock = 0; machine.to('PLAYBACK', info); };
    const frame = (t) => { game.clock = t; machine.emit('frame', t, 0); };
    return { club, machine, game, scene, patches, mats, listeners, play, frame };
  }
  const build = async (opts) => { const r = rig(opts); r.motion = await createMotion(r.club, { parts: [['marks', './motion/marks.js', () => import('../../scene/club/motion/marks.js'), 'applyMarks']] }); r.part = r.motion.parts.marks; return r; };
  const bytes = (part) => { const u = part.uniforms; const nrec = u.uClubMarkK.value.x; const d = u.uClubMarkTex.value.image.data; const out = [nrec]; for (let i = 0; i < nrec; i++) { for (let k = 0; k < 4; k++) out.push(d[i * 4 + k]); for (let k = 0; k < 4; k++) out.push(d[(MARK_MAX + i) * 4 + k]); } return JSON.stringify(out); };

  await ok('the part: one patch on the cloth, a 32 x 2 float texture, no mesh; update writes marksAt(record, t) and nothing else', async () => {
    const r = await build();
    assert.equal(r.part.enabled, true);
    assert.equal(r.patches.length, 1); assert.equal(r.patches[0].spec.key, `motion-marks-v${MARKS_PATCH_VERSION}`);
    assert.deepEqual(Object.keys(r.patches[0].spec.uniforms).sort(), marksUniformNames().sort(), 'the part supplies exactly the uniforms the text declares');
    const tex = r.part.uniforms.uClubMarkTex.value;
    assert.ok(tex.isDataTexture && tex.image.width === MARK_MAX && tex.image.height === 2 && tex.type === THREE.FloatType && tex.format === THREE.RGBAFormat && tex.magFilter === THREE.NearestFilter && tex.generateMipmaps === false);
    assert.equal(r.part.uniforms.uClubMarkK.value.x, 0, 'no record: the count is zero');
    r.frame(0); // no record yet: clear()
    assert.equal(r.part.uniforms.uClubMarkK.value.x, 0);
    r.play(REC.draw);
    for (const t of [0.06, 0.4, 3]) {
      r.frame(t);
      const want = marksAt(MODEL.draw, t, MARK_MAX);
      assert.equal(r.part.uniforms.uClubMarkK.value.x, want.length);
      const d = tex.image.data;
      want.forEach((rec, i) => { for (let k = 0; k < 4; k++) { assert.equal(d[i * 4 + k], Math.fround(rec[k])); assert.equal(d[(MARK_MAX + i) * 4 + k], Math.fround(rec[4 + k])); } });
      const box = r.part.uniforms.uClubMarkBox.value;
      for (const rec of want) assert.ok(rec[0] > box.x && rec[1] > box.y && rec[2] < box.z + 1 && rec[0] < box.z && rec[1] < box.w);
    }
    // law 4: nothing was added to the scene by the part (the motion root and the part's empty group are the wiring's)
    let meshes = 0; r.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) meshes += 1; });
    assert.equal(meshes, 0, 'no mesh');
    assert.equal(r.motion.kit.marks.root.children.length, 0);
    const st = r.part.state();
    assert.ok(st.drawCalls === 0 && st.triangles === 0 && st.addedSamplers === 1 && st.texture.bytes === 1024 && st.patched === 1 && st.drawn === marksAt(MODEL.draw, 3, MARK_MAX).length);
    assert.equal(JSON.stringify(st), JSON.stringify(JSON.parse(JSON.stringify(st))), 'state() is plain data');
  });

  await ok('law 2 through the wiring: the texture bytes at a time are the same after any walk through other times, a replay and a scrub back', async () => {
    const r = await build();
    r.play(REC.break);
    const times = [0, 0.03, 0.05, 0.09, 0.12, 0.2, 0.5, 2, 9];
    const fresh = new Map();
    for (const t of times) { r.frame(t); fresh.set(t, bytes(r.part)); }
    const rnd = rng(3);
    for (let k = 0; k < 300; k++) { const t = times[Math.floor(rnd() * times.length)]; r.frame(t); assert.equal(bytes(r.part), fresh.get(t), `walk step ${k} at ${t}`); }
    // the same frame twice (a pause: dt = 0) uploads nothing new
    r.frame(0.05); const up = r.part.state().texture.uploads; r.frame(2); r.frame(2); r.frame(2); assert.equal(r.part.state().texture.uploads, up + 1);
    // a replay and a loaded record (other ways into PLAYBACK) draw the same as the live shot
    r.machine.to('AIM'); r.play(REC.break, { replay: true });
    for (const t of times) { r.frame(t); assert.equal(bytes(r.part), fresh.get(t)); }
    r.machine.to('AIM'); r.play(REC.break, { replay: true, dvr: true });
    for (const t of [...times].reverse()) { r.frame(t); assert.equal(bytes(r.part), fresh.get(t)); }
    // a scrub back before every mark: the cloth is clean again
    r.frame(-0.2); assert.equal(r.part.uniforms.uClubMarkK.value.x, 0);
    // outside PLAYBACK the clock holds and the played shot's marks stay; another record replaces them at once
    r.frame(9); r.machine.to('AIM'); r.frame(9); assert.equal(bytes(r.part), fresh.get(9));
    r.play(REC.soft); r.frame(1); assert.equal(r.part.uniforms.uClubMarkK.value.x, 2, 'a soft shot: the chalk only, nothing of the break');
    // no record (a re-rack): nothing
    r.game.record = null; r.machine.to('AIM'); r.frame(0); assert.equal(r.part.uniforms.uClubMarkK.value.x, 0);
    // a part built on another page load gives the same bytes (no state outside the record and t)
    const r2 = await build(); r2.play(REC.break, { replay: true }); r2.frame(0.5); assert.equal(bytes(r2.part), fresh.get(0.5));
  });

  await ok('the listener contract: read-only (a deep-frozen record, no refused write), nothing throws on a bad record, a failure leaves the count at zero', async () => {
    const r = await build();
    const frozen = deepFreeze(JSON.parse(JSON.stringify(REC.draw)));
    r.play(frozen);
    for (const t of [0, 0.1, 1, 5, 1, 0.1]) r.frame(t);
    assert.equal(r.part.uniforms.uClubMarkK.value.x, marksAt(MODEL.draw, 0.1, MARK_MAX).length);
    for (const bad of [{}, { events: 7 }, { events: [null, { t: 1 }, { t: 'x', post: 3 }] }, { events: [{ t: 0, kind: { Strike: { ball: 0 } }, post: [[0, { pos: {}, vel: null }]] }] }]) {
      r.game.record = bad;
      for (const t of [0, 1, NaN, Infinity, -5]) { r.game.clock = t; assert.doesNotThrow(() => r.machine.emit('frame', t, 0)); }
      assert.equal(r.part.uniforms.uClubMarkK.value.x, 0);
    }
    const st = r.motion.state();
    assert.equal(st.parts.marks.enabled, true, 'the part was never switched off'); assert.equal(st.parts.marks.errors, 0);
    assert.deepEqual(st.notes, [], 'no refused write on the game, no error note');
    assert.deepEqual(r.listeners.frame.length + r.listeners.stateChange.length, 2, 'the wiring\'s two listeners; the part subscribes none');
    // every entry point swallows a failure and zeroes the output: a table that throws
    const kit = { table() { throw new Error('boom'); }, knobs: { motionMarks: 32 }, note() {} };
    const alone = await applyMarks({ adopt: { find: () => [fakeMat()], patch: () => true }, ctx: { query: new URLSearchParams('') } }, kit);
    assert.doesNotThrow(() => alone.update(1, REC.draw, { playback: true }));
    assert.ok(alone.uniforms.uClubMarkK.value.x > 0, 'no table: the marks are still drawn (the size is only a filter)');
    const broken = await applyMarks({ adopt: { find: () => [fakeMat()], patch: () => true }, ctx: {} }, null);
    Object.defineProperty(broken.uniforms.uClubMarkBox, 'value', { get() { throw new Error('boom'); } });
    assert.doesNotThrow(() => broken.update(1, REC.draw, { playback: true }));
    assert.equal(broken.uniforms.uClubMarkK.value.x, 0); assert.equal(broken.state().enabled, false); assert.match(broken.state().reason, /update: boom/);
    assert.doesNotThrow(() => { broken.update(2, REC.draw); broken.clear(); broken.onState('AIM', 'PLAYBACK', null, REC.draw); broken.rebuild('x'); broken.set({ on: true }); broken.dispose(); });
    // dispose: nothing on the cloth, listeners gone
    r.game.record = frozen; r.frame(1); assert.ok(r.part.uniforms.uClubMarkK.value.x > 0);
    r.motion.dispose();
    assert.equal(r.part.uniforms.uClubMarkK.value.x, 0); assert.equal(r.listeners.frame.length + r.listeners.stateChange.length, 0);
    // without an adoption service, or with no cloth, the part is a stub or draws nothing; it never throws
    assert.equal((await applyMarks({}, null)).enabled, false);
    assert.equal((await applyMarks(null, null)).enabled, false);
    const none = await applyMarks({ adopt: { find: () => [{ isMeshBasicMaterial: true, userData: {} }], patch: () => { throw new Error('never called'); } }, ctx: {} }, null);
    assert.equal(none.state().patched, 0); assert.deepEqual(none.state().skipped.length, 1);
  });

  await ok('the capture guard: the count is zero for a draw by a cube camera or into a cube target, and the frame\'s count for every other draw', async () => {
    const r = await build();
    r.play(REC.draw); r.frame(2);
    const count = r.part.uniforms.uClubMarkK.value.x;
    assert.ok(count > 0);
    const m = r.mats[0];
    const cube = new THREE.CubeCamera(0.1, 10, new THREE.WebGLCubeRenderTarget(16));
    const main = new THREE.PerspectiveCamera();
    const rendererTo = (target) => ({ getRenderTarget: () => target });
    m.onBeforeRender(rendererTo(null), r.scene, cube.children[0]); assert.equal(r.part.uniforms.uClubMarkK.value.x, 0, 'a cube face camera');
    m.onBeforeRender(rendererTo(null), r.scene, main); assert.equal(r.part.uniforms.uClubMarkK.value.x, count, 'the main camera');
    m.onBeforeRender(rendererTo(new THREE.WebGLCubeRenderTarget(16)), r.scene, main); assert.equal(r.part.uniforms.uClubMarkK.value.x, 0, 'a cube target');
    m.onBeforeRender(rendererTo(new THREE.WebGLRenderTarget(4, 4)), r.scene, main); assert.equal(r.part.uniforms.uClubMarkK.value.x, count, 'a plain target (the composer)');
    assert.equal(m.calls, 4, 'the material\'s own hook still runs first');
    assert.equal(r.part.state().guard.cubeDrawsZeroed, 2);
    assert.doesNotThrow(() => m.onBeforeRender(null, null, null));
    // the tool switch: off = the count stays (the dev page uses it to show the guard matters)
    r.part.set({ guard: false }); r.frame(2);
    m.onBeforeRender(rendererTo(null), r.scene, cube.children[0]); assert.equal(r.part.uniforms.uClubMarkK.value.x, count);
    // after dispose the hook writes nothing
    r.part.set({ guard: true }); r.motion.dispose(); m.onBeforeRender(rendererTo(null), r.scene, main); assert.equal(r.part.uniforms.uClubMarkK.value.x, 0);
  });

  await ok('switches and budget: ?clubmarks=nochalk,noburn,noland, the tier\'s cap, set({ on }), a rebuilt table', async () => {
    const all = await build(); all.play(REC.jump); all.frame(5);
    const noChalk = await build({ query: 'clubmarks=nochalk' }); noChalk.play(REC.jump); noChalk.frame(5);
    const noLand = await build({ query: 'clubmarks=noland,noburn' }); noLand.play(REC.jump); noLand.frame(5);
    assert.equal(noChalk.part.state().records.filter((x) => x.kind === 'chalk').length, 0);
    assert.equal(noLand.part.state().records.filter((x) => x.kind === 'burn').length, 0);
    assert.equal(all.part.uniforms.uClubMarkK.value.x, noChalk.part.uniforms.uClubMarkK.value.x + noLand.part.uniforms.uClubMarkK.value.x);
    const lite = await build({ knobs: { motion: 'marks', motionMarks: 4, motionDust: 0 } }); lite.play(REC.break); lite.frame(9);
    assert.equal(lite.part.uniforms.uClubMarkK.value.x, 4); assert.equal(lite.part.state().cap, 4);
    assert.equal(bytes(lite.part), JSON.stringify([4, ...marksAtEnd(MODEL.break, 4).flatMap((x) => [...x.slice(0, 4), ...x.slice(4)].map(Math.fround))]));
    const big = await build({ knobs: { motion: 'full', motionMarks: 500, motionDust: 0 } }); assert.equal(big.part.state().cap, MARK_MAX, 'never more than the texture holds');
    all.part.set({ on: false }); all.frame(5); assert.equal(all.part.uniforms.uClubMarkK.value.x, 0);
    all.part.set({ on: true }); all.frame(5); assert.ok(all.part.uniforms.uClubMarkK.value.x > 0);
    const g = await build({ query: 'clubmarks=gain:2' }); assert.ok(Math.abs(g.part.uniforms.uClubMarkK.value.z - 2 * MARKS_LOOK.burn) < 1e-7);
    // a new cloth material (a rebuilt table) is patched on rebuild(); a material without the app's analytic shading is skipped
    const r = await build({ mats: [fakeMat(), fakeMat('plain')] });
    assert.equal(r.patches.length, 1); assert.deepEqual(r.part.state().skipped, ['cloth']);
    r.mats.push(fakeMat()); assert.equal(r.part.rebuild('table'), 1); assert.equal(r.patches.length, 2);
    // off by ?clubmotion=nomarks: the wiring never loads the part
    const off = await build({ query: 'clubmotion=nomarks' }); assert.equal(off.part.enabled, false); assert.equal(off.patches.length, 0); assert.equal(off.listeners.frame.length, 0);
  });

  await ok('session marks (off by default; ?clubmarks=session): a replay or a loaded record draws its own record alone, whatever the session holds', async () => {
    // default: state changes never change the picture
    const d = await build();
    d.play(REC.break); d.frame(9); d.machine.to('SETTLED'); d.machine.to('AIM'); d.frame(9);
    d.play(REC.draw); d.frame(0.4);
    assert.equal(bytes(d.part), JSON.stringify([marksAt(MODEL.draw, 0.4, MARK_MAX).length, ...marksAt(MODEL.draw, 0.4, MARK_MAX).flatMap((x) => x.map(Math.fround))]), 'default: only the record being played');
    assert.equal(d.part.state().session.on, false); assert.equal(d.part.state().session.shots, 0);
    // with the session on: a live stroke shows the earlier shots too...
    const s = await build({ query: 'clubmarks=session' });
    s.play(REC.break, { strike: true }); s.frame(9); const breakAlone = bytes(s.part);
    s.machine.to('SETTLED'); s.machine.to('AIM'); s.frame(9);
    assert.equal(s.part.state().session.shots, 1);
    const drawRec = REC.draw;
    s.play(drawRec, { strike: true }); s.frame(0.4);
    const liveCount = s.part.uniforms.uClubMarkK.value.x;
    assert.ok(liveCount > marksAt(MODEL.draw, 0.4, MARK_MAX).length, 'live: the break\'s marks are still on the cloth');
    assert.equal(s.part.state().source, 'record + session');
    // ...and a replay of that same shot, a DVR entry, an unflagged load and a record swapped in without a state change do not
    const own = (t) => JSON.stringify([marksAt(MODEL.draw, t, MARK_MAX).length, ...marksAt(MODEL.draw, t, MARK_MAX).flatMap((x) => x.map(Math.fround))]);
    for (const info of [{ replay: true }, { replay: true, dvr: true }, {}, null]) {
      s.machine.to('AIM'); s.play(drawRec, info);
      for (const t of [0.4, 0.06, 9, 0.4]) { s.frame(t); assert.equal(bytes(s.part), own(t), `replay ${JSON.stringify(info)} at ${t}`); }
    }
    s.machine.to('AIM'); s.play(REC.break, { strike: true }); s.game.record = drawRec; // an export swaps the record under a live playback
    s.frame(0.4); assert.equal(bytes(s.part), own(0.4), 'another record than the live stroke\'s: its own marks alone');
    // a re-rack (no record) clears the session
    s.game.record = null; s.machine.to('AIM'); s.frame(0); assert.equal(s.part.state().session.shots, 0); assert.equal(s.part.uniforms.uClubMarkK.value.x, 0);
    void breakAlone;
  });
} else {
  console.log('SKIP the part under the wiring (node:module registerHooks is not in this node: 22.15+ has it)');
}

console.log(`\n${n} checks passed`);
