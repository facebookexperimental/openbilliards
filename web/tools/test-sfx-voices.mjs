// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sfx-voices.mjs — node gate for the voice plan (the impact-realism wave, 2026-11): how a kernel ShotRecord becomes the
// voices its playback sounds (web/app/synth.js planVoices + scheduleVoice, web/app/sound.js deriveCues / deriveVoices).
// Plain node: the canonical wasm simulates the records, the shipped clips load from disk, and web/tools/lib/mini-webaudio.mjs
// renders what synth.js schedules. No browser.
//
//   node web/tools/test-sfx-voices.mjs
//
// What it holds:
//   A  the haptics seam: deriveCues' { t, type, gain } list is the law it was (an independent mirror recomputes it), with or
//      without the event-index tap
//   B  plan and cues: every impact voice is one cue (same type and time, seed = cue index); the plan is time-ordered
//   C  audio reads, never writes: a deep-frozen record plans without a throw; the same record gives the same plan and the
//      same samples; no clock, timer or Math.random in the voicing sources
//   D  the physics mapping: a harder ball-ball hit is louder AND brighter and draws harder clips; a thin cut is quieter,
//      thinner and carries less table; a cushion is duller than a click at every strength; a pocket jaw is harder than the
//      rail nose; an impact after a long roll is voiced by the speed the ball ARRIVED with
//   E  the cue tip: off-centre hits thin out and gain the chalk layer; past the miscue limit the voice is a different one
//   F  pockets: drop, then the roll down the return track, then a clack against the tray (or a dull stop when it is
//      empty, or for the cue ball); drop pockets and nets have no track
//   G  rolling follows speed and stops with the balls
//   H  the break: a bound on impacts per window and on sources at once, staged levels with no clipped sample at full
//      volume, and no class playing one clip twice in a row
//   I  the export bed's laws on every voice: nothing before `when`, silent again inside the per-voice support, and the same
//      samples wherever in time it is scheduled
//   J  clip conditioning: the impact sits at the clip's start, the tail is gone, and the arithmetic is engine-independent
//   K  the pre-plan entry point (scheduleCue) still voices all four classes, with and without the bank
//   M  levels: an isolated impact holds the energy it had before the clips were conditioned, and no clip plays over the
//      plan's ceiling
//   N  the live scheduler: the real createSound over a stub machine and game: rolling segments on one time anchor, the
//      trailing pass only after a completed playback, and its tail after slow motion
//   L  the listener's space: the pan law's sense, symmetry and width, the seeded room impulse, and that the export bed and
//      the voices themselves stay dry, centred and linear
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as synth from '../app/synth.js';
import { OfflineCtx } from './lib/mini-webaudio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.error('FAIL:', msg); } return !!cond; };
const section = (name) => console.log(`-- ${name}`);

// ---- sound.js, lifted verbatim below its imports (the module itself imports the settings UI and cannot load in node) ----
const soundSrc = fs.readFileSync(path.join(WEB, 'app/sound.js'), 'utf8');
const synthSrc = fs.readFileSync(path.join(WEB, 'app/synth.js'), 'utf8');
const liftA = soundSrc.indexOf('const LOOKAHEAD'), liftB = soundSrc.indexOf('export function createSound');
if (liftA < 0 || liftB < liftA) { console.error('FAIL: cannot lift the derivation out of sound.js'); process.exit(1); }
const liftDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-sfx-voices-'));
const liftFile = path.join(liftDir, 'sound-derivation.mjs');
fs.writeFileSync(liftFile,
  `import * as synth from ${JSON.stringify(pathToFileURL(path.join(WEB, 'app/synth.js')).href)};\n`
  + 'const streamCtx = {};\n' // sound.js's one use of its settings import: the stream context it registers itself in
  + soundSrc.slice(liftA));
let sound;
try {
  sound = await import(pathToFileURL(liftFile).href);
} finally {
  fs.rmSync(liftDir, { recursive: true, force: true });
}

// ---- the engine and the records ----
const sdk = await import(pathToFileURL(path.join(WEB, 'dist/pool-sdk/index.js')).href);
const engine = await sdk.init(pathToFileURL(path.join(WEB, 'dist/pool-wasm/pool_wasm.js')));
const rack = engine.nineBallRack(4);
const R = rack.system.balls[0].params.r;
const sim = (scenario) => JSON.parse(engine.simulateJson(scenario));
const withShot = (scn, shot) => { const s = structuredClone(scn); s.shot = { ...s.shot, ...shot }; return s; };
const layout = (balls, shot) => {
  const s = structuredClone(rack);
  const proto = s.system.balls;
  s.system.balls = balls.map(([id, x, y]) => {
    const b = structuredClone(proto.find((q) => q.id === id) ?? proto[1]);
    b.id = id; b.state.pos = { x, y, z: R };
    return b;
  });
  s.shot = { ...s.shot, a: 0, b: 0, theta: 0, ...shot };
  return s;
};
const aim = (cue, obj, target, shiftBalls = 0) => { // ghost-ball aim; shiftBalls moves the line sideways, in ball diameters
  const ux = target[0] - obj[0], uy = target[1] - obj[1], ul = Math.hypot(ux, uy);
  const gx = obj[0] - 2 * R * ux / ul, gy = obj[1] - 2 * R * uy / ul;
  return Math.atan2(gy - cue[1], gx - cue[0])
    + Math.atan2(shiftBalls * 2 * R, Math.hypot(gx - cue[0], gy - cue[1]));
};
const pockets = rack.system.table.pockets.map((q) => [q.center.x, q.center.y]);
const cornerTR = pockets.reduce((m, q) => (q[0] + q[1] > m[0] + m[1] ? q : m));
const inset = (q, d) => { const l = Math.hypot(q[0], q[1]); return [q[0] - d * q[0] / l, q[1] - d * q[1] / l]; };
const rollIn = (ids, v0 = 0.75) => { // object ball `ids[1]` rolls into the top-right corner
  const obj = [0.42, 1.02], cue = [0.10, 0.55];
  return sim(layout([[0, ...cue], [ids[1], ...obj], ...ids.slice(2).map((id, i) => [id, -0.4, -0.9 + 0.2 * i])],
    { v0, phi: aim(cue, obj, inset(cornerTR, 0.03)), b: 0.2 }));
};
const REC = {
  break9: sim(withShot(rack, { v0: 9, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })),
  break15: sim(withShot(engine.fifteenBallRack(2), { v0: 15, phi: Math.PI / 2 - 0.03, theta: 0, a: 0, b: 0 })),
  threeRail: sim(layout([[0, -0.2, -0.9], [9, 0.45, 1.1]], { v0: 4.2, phi: 0.62, a: 0.3, b: 0.15 })),
  lone: sim(layout([[0, -0.2, -0.9]], { v0: 1.6, phi: 1.2 })),
  rollInFirst: rollIn([0, 1]),            // ids 0, 1: nothing is down yet
  rollInLater: rollIn([0, 3, 9]),         // ids 1, 2 are missing: two balls are already in the tray
};
const headOn = (v0) => sim(layout([[0, 0, -0.6], [1, 0, 0.3]], { v0, phi: Math.PI / 2 }));
// the same straight stroke up the table; the object ball sits `offset` ball radii off the line (0 = full hit, 2 = a miss)
const cutShot = (offset) => sim(layout([[0, 0, -0.5], [2, offset * R, 0.3]], { v0: 3.2, phi: Math.PI / 2 }));

const voicesOf = (record, profile = synth.DEFAULT_PROFILE) => sound.deriveVoices(record, profile);
const kindOf = (e) => (typeof e.kind === 'string' ? e.kind : Object.keys(e.kind)[0]);

// ---- the shipped bank, from disk ----
globalThis.fetch = async (url) => {
  const file = String(url);
  if (!fs.existsSync(file)) return { ok: false };
  const b = fs.readFileSync(file);
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
};
const bank = await synth.loadSfxBank(path.join(WEB, 'assets/sfx') + path.sep);
if (!ok(bank && bank.clips.size === 39 && bank.shaped === true, 'the shipped bank loads whole (39 clips) and is shaped')) {
  process.exit(1);
}

/** Schedule voices on a fresh offline context. Returns { ctx, out: [Float32Array…] }. */
function render(voices, { rate = 1, sec, master = 1, profile = synth.DEFAULT_PROFILE, useBank = true, at } = {}) {
  const end = voices.reduce((m, v) => Math.max(m, v.t), 0) / rate + 2.2;
  const ctx = new OfflineCtx(1, Math.ceil((sec ?? end) * 48000), 48000);
  const dest = ctx.createGain();
  dest.gain.value = master;
  dest.connect(ctx.destination);
  const noise = synth.makeNoiseBuffer(ctx);
  for (const v of voices) {
    sound.voiceOne(ctx, dest, noise, v, at ?? v.t / rate, { profile, bank: useBank ? bank : null, rate });
  }
  return { ctx, out: ctx.startRendering() };
}
const peakOf = (out) => { let m = 0; for (const c of out) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > m) m = a; } return m; };
const one = (v, opts) => render([{ ...v, t: 0 }], { sec: 2.2, at: 0.1, ...opts });
const clipSources = (ctx) => ctx.sources.filter((s) => s.buffer && s.buffer.length !== 24000); // not the noise buffer
const filters = (ctx, type) => ctx.all.filter((n) => n.kind === 'biquad' && n.type === type);

// ============================================================================
section('A  the haptics seam: deriveCues is the law it was');
{
  const mirror = (record) => { // independent recomputation of the { t, type, gain } law
    const vel = new Map(record.initial.balls.map((b) => [b.id, { ...b.state.vel }]));
    const clamp = (x) => Math.max(0.05, Math.min(1, x));
    const out = [];
    for (const e of record.events) {
      const k = kindOf(e), body = typeof e.kind === 'object' ? e.kind[k] : null;
      const dv = (id) => {
        const q = e.post.find((s) => s[0] === id);
        if (!q) return 0;
        const b = vel.get(id) ?? { x: 0, y: 0, z: 0 }, a = q[1].vel;
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      };
      if (k === 'Strike') out.push({ t: e.t, type: 'cue', gain: clamp(dv(body.ball) / 8) });
      else if (k === 'BallBall') {
        const v = Math.max(0, ...e.post.map(([id]) => dv(id)));
        if (v >= 0.04) out.push({ t: e.t, type: 'click', gain: clamp(v / 7) });
      } else if (k === 'BallLinearCushion' || k === 'BallCircularCushion') {
        const v = dv(body.ball);
        if (v >= 0.04) out.push({ t: e.t, type: 'cushion', gain: clamp(v / 9) });
      } else if (k === 'BallPocket') {
        const b = vel.get(body.ball) ?? { x: 0, y: 0, z: 0 };
        out.push({ t: e.t, type: 'pocket', gain: clamp(0.3 + Math.hypot(b.x, b.y, b.z) / 5) });
      }
      for (const [id, s] of e.post) vel.set(id, { ...s.vel });
    }
    return out;
  };
  let n = 0;
  for (const [name, record] of Object.entries(REC)) {
    const plain = sound.deriveCues(record), evIdx = [], tapped = sound.deriveCues(record, evIdx);
    n += plain.length;
    ok(JSON.stringify(plain) === JSON.stringify(mirror(record)), `${name}: deriveCues equals the independent mirror`);
    ok(JSON.stringify(plain) === JSON.stringify(tapped), `${name}: the event-index tap does not change the cue list`);
    ok(plain.every((c) => Object.keys(c).join() === 't,type,gain'), `${name}: a cue is exactly { t, type, gain }`);
    ok(evIdx.length === plain.length && evIdx.every((ei, i) => record.events[ei].t === plain[i].t
      && (i === 0 || ei > evIdx[i - 1])), `${name}: evIdx names each cue's own event, in order`);
  }
  console.log(`   ${n} cues over ${Object.keys(REC).length} records`);
}

// ============================================================================
section('B  plan and cues');
{
  const IMPACT = new Set(['click', 'cushion', 'cue', 'pocket']);
  for (const [name, record] of Object.entries(REC)) {
    const cues = sound.deriveCues(record), plan = voicesOf(record);
    const impacts = plan.filter((v) => IMPACT.has(v.type));
    ok(impacts.every((v) => v.cue === v.seed && cues[v.cue] && cues[v.cue].type === v.type && cues[v.cue].t === v.t),
      `${name}: every impact voice is one cue (type, time, seed = cue index)`);
    ok(new Set(impacts.map((v) => v.cue)).size === impacts.length, `${name}: no cue is voiced twice`);
    ok(plan.every((v, i) => i === 0 || plan[i - 1].t <= v.t), `${name}: the plan is in time order`);
    ok(plan.filter((v) => !IMPACT.has(v.type)).every((v) => v.seed >= 100000),
      `${name}: the other voices take seeds from 100000 up`);
    ok(new Set(plan.map((v) => v.seed)).size === plan.length, `${name}: seeds are unique`);
    ok(plan.every((v) => Number.isFinite(v.t) && Number.isFinite(v.gain) && v.gain > 0 && v.gain <= 1
      && Number.isFinite(v.x) && Number.isFinite(v.y) && v.mix > 0 && v.mix <= 1),
    `${name}: every voice has finite time, strength, place and stage`);
  }
  const quiet = voicesOf(REC.lone).filter((v) => IMPACT.has(v.type));
  ok(quiet.length === sound.deriveCues(REC.lone).length, 'a sparse shot drops no cue (masking and bounds only act on bursts)');
}

// ============================================================================
section('C  audio reads, never writes; one record, one plan');
{
  const freeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(freeze); } return o; };
  const frozen = freeze(structuredClone(REC.break9));
  let threw = null, a = null;
  // (the plan called directly: sound.js deriveVoices would catch a throw and hand back the bare cue list)
  const planOf = (rec) => { const at = []; const cues = sound.deriveCues(rec, at); return synth.planVoices(rec, cues, at, { profile: synth.DEFAULT_PROFILE }); };
  try { a = planOf(frozen); } catch (e) { threw = e; }
  ok(!threw, `planning a deep-frozen record does not throw (${threw?.message ?? ''})`);
  ok(JSON.stringify(a) === JSON.stringify(voicesOf(REC.break9)), 'the same record gives the same plan');
  const r1 = render(voicesOf(REC.break9)).out[0], r2 = render(voicesOf(REC.break9)).out[0];
  let same = r1.length === r2.length;
  for (let i = 0; same && i < r1.length; i++) same = r1[i] === r2[i];
  ok(same, 'the same plan renders the same samples');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const [file, src] of [['synth.js', synthSrc], ['sound.js', soundSrc]]) {
    const code = strip(src);
    for (const bad of ['Math.random', 'Date.now', 'new Date', 'performance.now', 'setTimeout', 'setInterval',
      'requestAnimationFrame']) {
      ok(!code.includes(bad), `${file} uses no ${bad} (variation is seeded; all audio work rides the frame hook)`);
    }
  }
  const noStop = render(voicesOf(REC.rollInLater)).ctx.sources.filter((s) => s.loop && s.t1 === null);
  ok(noStop.length === 0, 'every looping source has a stop time (nothing sounds on after its voice)');
  // audio never takes the game down: a record the plan cannot read keeps its sound as the bare cue list, and a voice the
  // engine refuses is dropped (the state machine runs its listeners unguarded)
  const damaged = structuredClone(REC.threeRail);
  delete damaged.events.find((e) => kindOf(e) === 'BallLinearCushion').post[0][1].pos;
  let planThrew = false, fb = null, fbThrew = null;
  try { planOf(damaged); } catch { planThrew = true; }
  try { fb = voicesOf(damaged); } catch (e) { fbThrew = e; }
  const bare = sound.deriveCues(damaged);
  ok(planThrew && !fbThrew && fb.length === bare.length
    && fb.every((v, i) => v.t === bare[i].t && v.type === bare[i].type && v.gain === bare[i].gain && v.seed === i && !v.plan),
  'a record the plan cannot read (a post state without its position) still gives the bare cue list, and nothing is thrown');
  ok(peakOf(render(fb).out) > 0.01, 'and that list still sounds');
  // a velocity that is not a number (the first rolling post-state without its vel.x): the cue list is still finite, the
  // plan is not a plan (it throws; deriveVoices hands back the bare list), and a voice with such a number creates nothing
  const noVel = structuredClone(REC.threeRail);
  delete noVel.events.find((e) => e.post.some((q) => q[1].motion === 'Rolling')).post.find((q) => q[1].motion === 'Rolling')[1].vel.x;
  let nvPlanThrew = false, nv = null, nvThrew = null;
  try { planOf(noVel); } catch { nvPlanThrew = true; }
  try { nv = voicesOf(noVel); render(nv); } catch (e) { nvThrew = e; }
  ok(nvPlanThrew && !nvThrew && nv.every((v) => !v.plan), `a record with a velocity that is not a number gives the bare cue list and renders (${nvThrew?.message ?? 'no throw'})`);
  const roll = voicesOf(REC.threeRail).find((v) => v.type === 'roll');
  for (const key of ['g0', 'g1', 'f0', 'f1', 'dur', 'mix']) {
    const r = one({ ...roll, [key]: NaN });
    ok(r.ctx.sources.length === 0 && r.ctx.all.length === 1, `a rolling voice whose ${key} is not a number starts no source and creates no node`);
  }
  ok(one({ type: 'click', gain: NaN, seed: 1 }).ctx.sources.length === 0 && one({ type: 'cushion', gain: 0.5, seed: 1, mix: NaN }).ctx.sources.length === 0,
    'nor does an impact with a strength or a stage that is not a number');
  ok(/try \{\s*voiceOne\(ac, destFor\(v\)[^;]*;\s*\} catch \{/.test(strip(soundSrc)), 'live playback drops a voice that throws instead of throwing into the frame hook');
  // ... and a voice the engine refuses HALFWAY leaves nothing sounding. Every number of these voices is finite, so they
  // pass the entry check, but a negative strength raised to a level's exponent is not a number, and the engine (and
  // this model) refuses that value after the voice's first nodes exist. A noise source starts last, together with its
  // stop: whatever was created before the refusal has not started.
  {
    const ctx = new OfflineCtx(1, 48000, 48000), noise = synth.makeNoiseBuffer(ctx);
    const refused = [];
    for (const type of ['click', 'cushion', 'cue', 'pocket', 'table']) {
      try { sound.voiceOne(ctx, ctx.destination, noise, { type, gain: -0.5, seed: 1, t: 0 }, 0.1, { profile: synth.DEFAULT_PROFILE, bank: null, rate: 1 }); } catch { refused.push(type); }
    }
    const open = ctx.sources.filter((q) => q.t0 !== null && q.t1 === null);
    ok(refused.length >= 1 && ctx.sources.length >= refused.length && open.length === 0,
      `a voice refused halfway (${refused.join(', ')}) leaves no source started without its stop (${ctx.sources.length} created, ${open.length} left open)`);
  }
}

// ============================================================================
section('D  the physics mapping');
{
  const speeds = [0.4, 0.8, 1.6, 3.2, 6.4];
  const rows = speeds.map((v0) => {
    const v = voicesOf(headOn(v0)).find((q) => q.type === 'click');
    const r = one(v);
    return { v0, v, lp: Math.max(...filters(r.ctx, 'lowpass').map((f) => f.frequency.value)), peak: peakOf(r.out) };
  });
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    ok(b.v.gain > a.v.gain, `ball-ball ${a.v0} -> ${b.v0} m/s: strength rises (${a.v.gain.toFixed(3)} -> ${b.v.gain.toFixed(3)})`);
    // (the hardest single hits reach the plan's ceiling: there the level stage holds the peak, and the hit is not quieter)
    ok(b.v.mix < 1 ? b.peak >= a.peak : b.peak > a.peak * 1.3,
      `ball-ball ${a.v0} -> ${b.v0} m/s: level rises${b.v.mix < 1 ? ' to the ceiling' : ''} (${a.peak.toFixed(4)} -> ${b.peak.toFixed(4)})`);
    ok(b.lp > a.lp * 1.05, `ball-ball ${a.v0} -> ${b.v0} m/s: brightness corner rises (${a.lp.toFixed(0)} -> ${b.lp.toFixed(0)} Hz)`);
    ok(synth.ladderPos('click', b.v.gain) > synth.ladderPos('click', a.v.gain),
      `ball-ball ${a.v0} -> ${b.v0} m/s: the clip ladder position rises`);
  }
  console.log('   head-on ladder: ' + rows.map((r) => `${r.v0} m/s g ${r.v.gain.toFixed(2)} lp ${r.lp.toFixed(0)} Hz clip ${r.v.clip}`).join(' | '));
  ok(rows.every((r) => r.v.cut < 0.05 && r.v.n === 2), 'a head-on hit has no cut and is a two-ball contact');

  // brightness is continuous in strength: no step larger than the law's slope allows across the whole range
  let jump = 0;
  for (const type of ['click', 'cushion', 'cue', 'pocket']) {
    for (let g = 0.05; g < 1; g += 0.005) jump = Math.max(jump, synth.brightnessHz(type, g + 0.005) / synth.brightnessHz(type, g));
  }
  ok(jump < 1.04, `the brightness law has no step (largest 0.005-strength ratio ${jump.toFixed(4)})`);
  let ladderStep = 0;
  for (const type of ['click', 'cushion', 'cue']) {
    for (let g = 0.05; g < 1; g += 0.002) ladderStep = Math.max(ladderStep, synth.ladderPos(type, g + 0.002) - synth.ladderPos(type, g));
  }
  ok(ladderStep < 0.2, `the clip ladder moves in small steps (largest ${ladderStep.toFixed(3)} per 0.002 strength)`);
  let duller = true;
  for (let g = 0.05; g <= 1.0001; g += 0.01) duller &&= synth.brightnessHz('cushion', g) < synth.brightnessHz('click', g);
  ok(duller, 'a cushion plays duller than a ball click at every strength');

  // the cut: same stroke, full hit vs a thin graze
  const full = voicesOf(cutShot(0)).find((q) => q.type === 'click');
  const thin = voicesOf(cutShot(1.9)).find((q) => q.type === 'click');
  ok(full && thin && full.cut < 0.3 && thin.cut > 0.8, `the cut is read from the contact (${full?.cut.toFixed(2)} full, ${thin?.cut.toFixed(2)} thin)`);
  ok(thin.gain < full.gain * 0.5, `a thin cut is the weaker impact at the same stroke (${thin.gain.toFixed(3)} vs ${full.gain.toFixed(3)})`);
  const rFull = one({ ...full, gain: 0.5 }), rThin = one({ ...thin, gain: 0.5 });
  ok(filters(rThin.ctx, 'highpass').length === 1 && filters(rFull.ctx, 'highpass').length === 0,
    'a thin cut loses its low end (a highpass); a full hit keeps it');
  // the table layer under a click is a mode: noise -> bandpass -> envelope; its level is the envelope's top
  const body = (r) => Math.max(0, ...r.ctx.all.filter((n) => n.kind === 'gain' && n.inputs.some((f) => f.kind === 'biquad' && f.type === 'bandpass'))
    .flatMap((g) => g.gain.ev.map((e) => e.v)));
  ok(body(rThin) < body(rFull) * 0.6, `a thin cut carries less table under it (${body(rThin).toFixed(4)} vs ${body(rFull).toFixed(4)})`);

  // the cluster: the break's first contact moves many balls and is voiced as one layered crack
  const crack = voicesOf(REC.break9).find((q) => q.type === 'click');
  ok(crack.n >= 5, `the break's first contact is a cluster (${crack.n} balls moved)`);
  const rc = one(crack), rp = one({ ...crack, n: 2 });
  ok(clipSources(rc.ctx).length === 1 + Math.min(crack.n - 2, 3) && clipSources(rp.ctx).length === 1,
    `a cluster layers extra hard clips (${clipSources(rc.ctx).length} clips vs 1 for a pair)`);
  const starts = clipSources(rc.ctx).map((s) => s.t0).sort((a, b) => a - b);
  ok(starts[starts.length - 1] - starts[0] < 0.009 && new Set(starts).size === starts.length,
    'the cluster layers land inside 9 ms, at distinct instants');
  ok(new Set(clipSources(rc.ctx).map((s) => s.buffer)).size === clipSources(rc.ctx).length, 'the cluster layers are different clips');

  // cushions: rail nose vs pocket jaw; wood answers a hard hit only
  const nose = one({ type: 'cushion', gain: 0.6, seed: 5, clip: 6, arc: false });
  const jaw = one({ type: 'cushion', gain: 0.6, seed: 5, clip: 6, arc: true });
  ok(clipSources(jaw.ctx)[0].playbackRate.value > clipSources(nose.ctx)[0].playbackRate.value * 1.08,
    'a pocket jaw is a harder contact than the rail nose (higher playback rate)');
  ok(filters(jaw.ctx, 'lowpass')[0].frequency.value > filters(nose.ctx, 'lowpass')[0].frequency.value * 1.15, 'and a brighter one');
  const softRail = one({ type: 'cushion', gain: 0.06, seed: 5, clip: 0 });
  ok(softRail.ctx.sources.length === 1 && nose.ctx.sources.length === 3,
    'a soft rail touch is rubber alone; a hard hit adds the rail wood (two layers)');

  // the true impulse: after a long roll a ball arrives slower than it left its last event
  const cues = sound.deriveCues(REC.threeRail), plan = voicesOf(REC.threeRail);
  const rails = plan.filter((v) => v.type === 'cushion');
  ok(rails.length >= 3 && rails.every((v) => v.gain <= cues[v.cue].gain + 1e-9),
    'a rail hit is never voiced stronger than its cue (the ball only slows between events)');
  ok(rails.some((v) => v.gain < cues[v.cue].gain * 0.9),
    'a rail hit after a long roll is voiced by the speed the ball arrived with');
  console.log('   three-rail shot, cue strength -> voiced strength: '
    + rails.map((v) => `${cues[v.cue].gain.toFixed(3)} -> ${v.gain.toFixed(3)}`).join(', '));
}

// ============================================================================
section('E  the cue tip');
{
  const strike = (record) => voicesOf(record).find((v) => v.type === 'cue');
  const base = headOn(2.5);
  const centre = strike(base);
  const edgeRec = structuredClone(base); edgeRec.shot.a = 0.62; // near the commanded limit (0.685 R at the default tip)
  const overRec = structuredClone(base); overRec.shot.a = 0.9;
  const edge = strike(edgeRec), over = strike(overRec);
  ok(centre.off === 0 && edge.off > 0.85 && edge.off < 1 && over.off > synth.MISCUE_OFF,
    `the tip offset is read against the miscue limit (${edge.off.toFixed(2)} at the edge, ${over.off.toFixed(2)} past it)`);
  const rc = one(centre), re = one(edge), ro = one(over);
  ok(filters(rc.ctx, 'highpass').length === 0 && filters(re.ctx, 'highpass').length === 1,
    'an off-centre hit thins out (a highpass); a centre hit does not');
  ok(re.ctx.sources.length === rc.ctx.sources.length + 1, 'an off-centre hit gains the chalk layer');
  ok(peakOf(re.out) < peakOf(rc.out), 'and is the quieter of the two');
  ok(filters(ro.ctx, 'bandpass').some((f) => f.frequency.ev.length === 2) && clipSources(ro.ctx).length === 2
    && clipSources(ro.ctx).every((s) => s.playbackRate.value > 1.5),
  'past the miscue limit the voice is a different one: a scrape sliding up in pitch and two thin ticks');
  const masse = structuredClone(base); masse.shot.theta = 1.0;
  ok(strike(masse).dig > 0.8 && one(strike(masse)).ctx.sources.length === rc.ctx.sources.length + 1,
    'an elevated cue adds the bed under the strike');
}

// ============================================================================
section('F  pockets and the return track');
{
  const seq = (record, profile) => {
    const plan = voicesOf(record, profile);
    const drop = plan.find((v) => v.type === 'pocket');
    return { plan, drop, track: plan.filter((v) => v.type === 'roll' && v.hollow), settle: plan.filter((v) => v.type === 'settle') };
  };
  const first = seq(REC.rollInFirst), later = seq(REC.rollInLater);
  ok(first.drop && later.drop, 'the roll-in shots pocket their ball');
  for (const [name, s] of [['first ball', first], ['later ball', later]]) {
    ok(s.track.length >= 1 && s.settle.length === 1, `${name}: a drop, a roll down the track, one stop`);
    ok(s.track[0].t > s.drop.t && s.track[0].t - s.drop.t < 0.2, `${name}: the track roll starts right after the drop`);
    const end = s.track[s.track.length - 1];
    ok(Math.abs(end.t + end.dur - s.settle[0].t) < 1e-9, `${name}: the stop comes where the roll ends`);
    ok(s.track.every((v, i) => i === 0 || Math.abs(s.track[i - 1].t + s.track[i - 1].dur - v.t) < 1e-9
      && Math.abs(s.track[i - 1].g1 - v.g0) < 1e-12 && Math.abs(s.track[i - 1].f1 - v.f0) < 1e-9),
    `${name}: the track segments butt together in time, level and corner`);
  }
  ok(first.settle[0].clack === false, 'the first ball down stops against an empty tray (a dull stop, no clack)');
  ok(later.settle[0].clack === true, 'a later ball clacks against the balls already there');
  ok(clipSources(one(later.settle[0]).ctx).length === 2 && clipSources(one(first.settle[0]).ctx).length === 0,
    'the clack is two muffled ball clips (the hit and the nudge down the row); the dull stop is synthesized');
  // a far pocket is a longer run than a near one (the tray is at the foot end)
  const run = (y) => { const rec = structuredClone(REC.rollInLater); for (const q of rec.initial.table.pockets) q.center.y = y; return seq(rec).settle[0].t - seq(rec).drop.t; };
  ok(run(-1.3) > run(1.3) + 1, `a head-end pocket runs longer than a foot-end one (${run(-1.3).toFixed(2)} s vs ${run(1.3).toFixed(2)} s)`);
  // the cue ball has its own return: never a clack
  const scratch = structuredClone(REC.rollInLater);
  for (const e of scratch.events) if (typeof e.kind === 'object' && e.kind.BallPocket) e.kind.BallPocket.ball = scratch.events[0].kind.Strike.ball;
  ok(seq(scratch).settle.length === 1 && seq(scratch).settle[0].clack === false, 'a scratched cue ball never clacks against the object balls');
  // the tray fills in ARRIVAL order: a ball dropped later into a foot-end pocket has the shorter track and gets there first
  {
    const st = (x, y, motion) => ({ pos: { x, y, z: R }, vel: { x: 0, y: motion === 'Rolling' ? 1 : 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion });
    const head = rack.system.table.pockets.findIndex((q) => q.center.y < -1), foot = rack.system.table.pockets.findIndex((q) => q.center.y > 1);
    const two = { initial: { balls: [1, 2].map((id) => ({ id, state: st(0.1 * id, 0, 'Rolling'), params: { r: R } })), table: rack.system.table },
      events: [{ t: 1.0, kind: { BallPocket: { ball: 1, pocket: head } }, post: [[1, st(0, -1.27, 'Pocketed')]] },
        { t: 1.5, kind: { BallPocket: { ball: 2, pocket: foot } }, post: [[2, st(0, 1.27, 'Pocketed')]] }] };
    const stops = voicesOf(two).filter((v) => v.type === 'settle');
    ok(stops.length === 2 && stops[0].t < stops[1].t && Math.abs(stops[0].t - 1.5) < 1 && stops[1].t - 1.0 > 1.5,
      `the later drop reaches the tray first (stops at ${stops.map((v) => v.t.toFixed(2)).join(' and ')} s)`);
    ok(stops[0].clack === false && stops[0].variant === 0 && stops[1].clack === true && stops[1].variant === 1,
      'the first ARRIVAL stops dully in the empty tray, the second clacks against it');
  }
  // drop pockets hold their own balls; a net has nothing
  const dropProfile = synth.acousticProfile({ table_id: 'wpa_generic_9ft' });
  const netProfile = synth.acousticProfile({ table_id: 'wpbsa_snooker_12ft' });
  ok(dropProfile.pocket.kind === 'drop' && netProfile.pocket.kind === 'net', 'the drop and net profiles resolve');
  const d = seq(REC.rollInLater, dropProfile), nt = seq(REC.rollInLater, netProfile);
  ok(d.track.length === 0 && d.settle.length === 0, 'a drop pocket has no track and no stop for its first ball');
  ok(nt.track.length === 0 && nt.settle.length === 0, 'a net pocket has no track and no stop');
  ok(one(nt.drop, { profile: netProfile }).ctx.sources.length > 0 && clipSources(one(nt.drop, { profile: netProfile }).ctx).length === 0,
    'a net pocket is voiced by the synth (it has no recording)');
}

// ============================================================================
section('G  rolling follows speed');
{
  const plan = voicesOf(REC.lone);
  const roll = plan.filter((v) => v.type === 'roll' && !v.hollow);
  const rails = plan.filter((v) => v.type === 'cushion').map((v) => v.t);
  ok(roll.length >= 5, `a lone rolling ball has a rolling layer (${roll.length} segments)`);
  ok(roll.every((v, i) => i === 0 || Math.abs(roll[i - 1].t + roll[i - 1].dur - v.t) > 1e-9
    || (Math.abs(roll[i - 1].g1 - v.g0) < 1e-12 && Math.abs(roll[i - 1].f1 - v.f0) < 1e-9)),
  'adjacent rolling segments butt together in level and corner');
  // between two rail hits the ball only slows: level never rises there
  let rises = 0, spans = 0;
  for (let i = 1; i < roll.length; i++) {
    const a = roll[i - 1], b = roll[i];
    if (rails.some((t) => t >= a.t && t <= b.t + b.dur)) continue;
    spans++;
    if (b.g0 > a.g0 + 1e-12 || b.g1 > b.g0 + 1e-12) rises++;
  }
  ok(spans >= 3 && rises === 0, `away from a rail the rolling level only falls (${spans} segments checked)`);
  const stop = REC.lone.events[REC.lone.events.length - 1].t;
  ok(roll.every((v) => v.t <= stop + 1e-9), 'the rolling layer ends when the balls are at rest');
  ok(roll[roll.length - 1].g1 < 0.004, 'and fades to silence there');
  const fast = voicesOf(headOn(6.4)).filter((v) => v.type === 'roll')[0], slow = voicesOf(headOn(0.8)).filter((v) => v.type === 'roll')[0];
  ok(fast.g0 > slow.g0 * 3 && fast.f0 > slow.f0 * 1.3, 'a faster ball rolls louder and brighter');
  const rollPeak = peakOf(render(roll).out), hitPeak = peakOf(one(plan.find((v) => v.type === 'cue')).out);
  ok(rollPeak < hitPeak * 0.25, `rolling sits well under the impacts (${(20 * Math.log10(rollPeak / hitPeak)).toFixed(1)} dB re the strike)`);
  ok(render(roll, { rate: 0.1 }).ctx.sources.length === 0 && render(roll, { rate: 0.25 }).ctx.sources.length === roll.length,
    'slow motion stretches the rolling layer; past the per-voice bound it rests instead of pulsing');
}

// ============================================================================
section('H  the break: bounded, staged, varied');
{
  const L = synth.PLAN_LIMITS;
  const HIT = new Set(['click', 'cushion', 'cue', 'pocket', 'table']);
  for (const name of ['break9', 'break15']) {
    const plan = voicesOf(REC[name]);
    const hits = plan.filter((v) => HIT.has(v.type));
    let most = 0;
    for (let i = 0; i < hits.length; i++) {
      let n = 0;
      for (let j = i; j < hits.length && hits[j].t - hits[i].t < L.burstWindow; j++) n++;
      most = Math.max(most, n);
    }
    ok(most <= L.burstMax, `${name}: at most ${L.burstMax} impacts start inside any ${L.burstWindow} s (${most})`);
    const r = render(plan);
    const c = r.ctx.census();
    ok(c.peakSources <= L.maxSources + 8, `${name}: sources sounding at once stay bounded (${c.peakSources}; impacts <= ${L.maxSources}, plus rolling)`);
    const peak = peakOf(r.out);
    let clipped = 0;
    for (const s of r.out[0]) if (Math.abs(s) >= 1) clipped++;
    ok(clipped === 0 && peak < 0.92, `${name}: no clipped sample at full volume (peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS)`);
    ok(peak > 0.3, `${name}: and the break is still the loud event it is`);
    for (const type of ['click', 'cushion']) {
      const seqClips = plan.filter((v) => v.type === type).map((v) => v.clip);
      ok(seqClips.length > 3 && seqClips.every((cl, i) => i === 0 || cl !== seqClips[i - 1]),
        `${name}: no ${type} plays the clip the last ${type} played (${seqClips.length} in a row checked)`);
      ok(new Set(seqClips).size >= 4, `${name}: the ${type}s draw on ${new Set(seqClips).size} different clips`);
    }
    // (the stage is a ratio to the UNstaged level, which carries the make-up for the short clips: 0.1 here is the same
    // absolute level a factor near 0.25 gave before it)
    ok(hits.some((v) => v.mix < 1) && hits.every((v) => v.mix >= 0.08), `${name}: the dense opening is staged down, the rest is not crushed`);
    ok(plan[0].type === 'cue' && plan[0].t === 0 && plan[0].cue === 0, `${name}: the strike is the plan's first voice (never dropped by a bound)`);
    const late = hits.filter((v) => v.t > 3);
    ok(late.length > 0 && late.every((v) => v.mix === 1), `${name}: sparse late impacts play at their own level`);
    console.log(`   ${name}: ${plan.length} voices (${sound.deriveCues(REC[name]).length} cues), ${c.nodes} nodes, ${c.peakSources} sources at once, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
  }
  // A real break hardly reaches the bounds: its impacts are short. They are exercised on a stress record, the hardest
  // break with its clock run four times fast (four times as many impacts share every instant): cues are dropped there,
  // never the strike and never the strongest of an instant, and every bound still holds.
  {
    const cues = sound.deriveCues(REC.break15), plan = voicesOf(REC.break15);
    const kept = new Set(plan.filter((v) => v.cue != null).map((v) => v.cue));
    const gone = cues.filter((c, i) => !kept.has(i));
    ok(gone.length < cues.length * 0.1 && gone.every((c) => c.type !== 'cue'),
      `the hardest real break keeps nearly every cue (${gone.length} of ${cues.length} dropped)`);
  }
  {
    const fast = structuredClone(REC.break15);
    for (const e of fast.events) e.t /= 4;
    const cues = sound.deriveCues(fast), plan = voicesOf(fast);
    const hits = plan.filter((v) => HIT.has(v.type));
    const kept = new Set(plan.filter((v) => v.cue != null).map((v) => v.cue));
    const gone = cues.filter((c, i) => !kept.has(i)), stay = cues.filter((c, i) => kept.has(i));
    ok(plan.some((v) => v.plan) && gone.length > 0 && gone.length < cues.length * 0.5,
      `the stress record drops cues (${gone.length} of ${cues.length})`);
    ok(gone.every((g) => g.type !== 'cue' && stay.some((k) => Math.abs(k.t - g.t) < L.burstWindow && k.gain >= g.gain)),
      'never the strike, and never the strongest impact of its instant');
    // a pocket is pinned too: its roll down the track and its stop are separate voices and would play on without the drop
    const drops = cues.filter((c) => c.type === 'pocket').length;
    ok(drops >= 2 && gone.every((g) => g.type !== 'pocket')
      && plan.filter((v) => v.type === 'pocket').length === drops && plan.filter((v) => v.type === 'settle').length === drops,
    `and never a pocket: all ${drops} drops sound, each with its stop on the track`);
    let most = 0;
    for (let i = 0; i < hits.length; i++) {
      let n = 0;
      for (let j = i; j < hits.length && hits[j].t - hits[i].t < L.burstWindow; j++) n++;
      most = Math.max(most, n);
    }
    const r = render(plan);
    const c = r.ctx.census();
    const peak = peakOf(r.out);
    let clipped = 0;
    for (const x of r.out[0]) if (Math.abs(x) >= 1) clipped++;
    ok(most <= L.burstMax && c.peakSources <= L.maxSources + 8,
      `and its bounds hold: ${most} impacts inside ${L.burstWindow} s (at most ${L.burstMax}), ${c.peakSources} sources at once`);
    ok(clipped === 0 && peak < 0.92, `with no clipped sample at full volume (peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS)`);
  }
  // seeded variation: equal hits in a row are not one sound
  const twins = [0, 1, 2, 3].map((i) => one({ type: 'click', gain: 0.5, seed: i, clip: 5 }));
  const rates = twins.map((r) => clipSources(r.ctx)[0].playbackRate.value);
  ok(new Set(rates.map((x) => x.toFixed(5))).size === 4 && Math.max(...rates) / Math.min(...rates) < 1.07,
    'equal hits differ by a seeded detune inside ±3 %');
  const again = clipSources(one({ type: 'click', gain: 0.5, seed: 2, clip: 5 }).ctx)[0].playbackRate.value;
  ok(again === rates[2], 'and the same seed is the same sound');
}

// ============================================================================
section('I  the export bed laws, on every voice');
{
  const all = [...voicesOf(REC.break9), ...voicesOf(REC.rollInLater), ...voicesOf(headOn(2.5)).slice(0, 3)];
  const over = structuredClone(headOn(2.5)); over.shot.a = 0.9;
  all.push(voicesOf(over).find((v) => v.type === 'cue'));
  const types = new Set(all.map((v) => v.type + (v.hollow ? '/track' : '')));
  ok(['click', 'cushion', 'cue', 'pocket', 'table', 'roll', 'roll/track', 'settle'].every((t) => types.has(t)),
    `every voice type is exercised (${[...types].join(', ')})`);
  let early = 0, late = 0, longest = 0;
  for (const rate of [1, 0.25, 0.1]) {
    for (const useBank of [true, false]) {
      for (const v of all) {
        const { ctx } = one(v, { rate, useBank, sec: 3 });
        for (const s of ctx.sources) {
          const sp = s.span();
          if (!sp) continue;
          if (sp.t0 < 0.1 - 1e-12) early++;
          const end = Math.min(sp.t1, s.t1 ?? Infinity) - 0.1;
          longest = Math.max(longest, end);
          if (end > 1.7) late++;
        }
      }
    }
  }
  ok(early === 0, 'no source starts before its voice time');
  ok(late === 0, `every source is over inside 1.7 s of its voice time, at rates 1, 0.25 and 0.1 (longest ${longest.toFixed(3)} s)`);
  ok(synth.MAX_SEG_SEC + 0.04 < 1.7, 'the rolling segment bound sits inside the 2.0 s per-voice support with room for ring-out');
  // translation invariance: the same voice, a whole number of frames later, is the same samples
  // (to float rounding: `when + 0.003` rounds differently at two different `when`s, a last-bit effect)
  let moved = 0;
  for (const v of [all.find((q) => q.type === 'click'), all.find((q) => q.type === 'roll' && !q.hollow), all.find((q) => q.type === 'pocket'),
    all.find((q) => q.type === 'settle'), all.find((q) => q.type === 'cushion'), all.find((q) => q.type === 'table'),
    all.find((q) => q.type === 'roll' && q.hollow), all.find((q) => q.type === 'cue')]) {
    const a = render([v], { sec: 3, at: 0.25 }).out[0], b = render([v], { sec: 3, at: 0.375 }).out[0];
    for (let i = 0; i + 6000 < a.length; i++) moved = Math.max(moved, Math.abs(a[i] - b[i + 6000]));
  }
  ok(moved < 1e-9, `a voice scheduled 6000 frames later renders the same samples, 6000 frames later (largest difference ${moved.toExponential(1)})`);
  // flip-proof layers. Whether the frame AT a start or stop time plays is a rounding question between two contexts, so
  // every noise layer is: source -> a gain that is exactly zero at the source's start -> the filter -> an envelope that
  // is exactly zero before the source stops. (A bank clip carries its own zeros: section J.)
  let raw = 0, noisy = 0;
  for (const v of all) {
    for (const useBank of [true, false]) {
      const { ctx } = one(v, { useBank, sec: 3 });
      for (const src of ctx.sources.filter((q) => q.buffer && q.buffer.length === 24000)) {
        noisy++;
        const next = (n) => ctx.all.find((m) => m.inputs.includes(n));
        const pre = next(src), filt = pre && next(pre), env = filt && next(filt);
        const preEv = pre?.kind === 'gain' ? pre.gain.ev.slice().sort((p, q) => p.t - q.t) : [];
        const envEv = env?.kind === 'gain' ? env.gain.ev.slice().sort((p, q) => p.t - q.t) : [];
        const last = envEv[envEv.length - 1];
        if (!preEv.length || pre.gain.value !== 0 || preEv[0].v !== 0 || Math.abs(preEv[0].t - src.t0) > 1e-12
          || filt?.kind !== 'biquad' || !last || last.v !== 0 || src.t1 === null || last.t > src.t1) raw++;
      }
    }
  }
  ok(raw === 0 && noisy > 50, `every noise layer enters its filter from exact zero and leaves through an envelope at exact zero (${noisy} layers)`);
  // the junction law: no node input takes more than two connections, the voice's own destination included (three addends
  // sum in an order the engine does not fix; the byte-exact export bed renders each voice alone and needs it stable)
  let wide = 0, widest = 0, layered = 0;
  for (const v of all) {
    for (const useBank of [true, false]) {
      const { ctx } = one(v, { useBank, sec: 3 });
      for (const nd of [...ctx.all, ctx.destination]) {
        widest = Math.max(widest, nd.inputs.length);
        if (nd.inputs.length > 2) wide++;
      }
      if (ctx.sources.length >= 3) layered++;
    }
  }
  ok(wide === 0 && layered > 10, `no node input takes more than two connections (widest ${widest}; ${layered} voices of three or more layers checked)`);
}

// A voice's start time is never negative. The exact bed renders each voice in a context of its own, anchored at the whole
// frame before its time: floor(when * 48000) / 48000. In doubles that can come out one ulp ABOVE `when` (a rolling voice
// on its 0.2 s grid in a segment that starts on a 60 fps frame), and an engine refuses a negative time with a RangeError
// that would abort the export. export-audio.js clamps the difference at zero.
{
  let negative = 0, worst = 0, checked = 0;
  for (let f = 0; f <= 600; f++) {
    for (let k = 1; k <= 40; k++) {
      const when = f / 60 + k * synth.PLAN_LIMITS.rollStep, d = when - Math.floor(when * 48000) / 48000;
      checked++;
      if (d < 0) { negative++; worst = Math.min(worst, d); }
    }
  }
  ok(11 / 60 + 0.2 - Math.floor((11 / 60 + 0.2) * 48000) / 48000 < 0 && negative > 0,
    `the unclamped difference does go negative: ${negative} of ${checked} frame-offset and grid pairs (worst ${worst.toExponential(1)} s)`);
  const roll = voicesOf(REC.break9).find((v) => v.type === 'roll');
  const ulp = -5.551115123125783e-17;
  let refusal = null;
  try { new OfflineCtx(1, 128, 48000).createBufferSource().start(ulp); } catch (e) { refusal = e; }
  ok(refusal instanceof RangeError, 'an engine refuses a start one ulp before zero (RangeError; the model does as the specification says)');
  ok(one(roll, { at: ulp }).ctx.all.length === 1 && peakOf(one(roll, { at: Math.max(0, ulp) }).out) > 0,
    'scheduleVoice creates nothing for a negative time (the voice would be lost), and the clamped one sounds');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const exportCode = strip(fs.readFileSync(path.join(WEB, 'app/export-audio.js'), 'utf8'));
  ok(/Math\.max\(0, q\.when - q\.base \/ AUDIO_RATE\)/.test(exportCode) && !/[^(] q\.when - q\.base \/ AUDIO_RATE/.test(exportCode.replace(/Math\.max\(0, q\.when - q\.base \/ AUDIO_RATE\)/g, '')),
    'the exact bed clamps every per-voice start at zero');
}

// ============================================================================
section('J  clip conditioning');
{
  let lateOnset = 0, longTail = 0, hot = 0, n = 0;
  const report = [];
  for (const [name, clip] of bank.clips) {
    n++;
    const cls = name.slice(0, name.indexOf('-')), shape = synth.CLIP_SHAPE[cls], x = clip.data, sr = clip.rate;
    let peak = 0, at = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; at = i; } }
    if (peak < 0.25 || peak > 0.82) hot++;
    if (x.length > Math.floor(sr * shape.maxMs / 1000)) longTail++;
    // the impact is at the start: the first sample within 12 dB of the peak comes inside 3 ms (pocket knock trains: 25 ms)
    let first = 0;
    while (first < x.length && Math.abs(x[first]) < peak * 0.25) first++;
    if (first / sr > (cls === 'pocket' ? 0.025 : 0.003)) lateOnset++;
    // the tail is gone: the last fifth of the clip is at least 30 dB under the peak
    let tail = 0;
    for (let i = Math.floor(x.length * 0.8); i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]));
    if (cls !== 'pocket' && tail > peak * 0.0316) longTail++;
    report.push(`${name.replace('.wav', '')} ${(x.length / sr * 1000).toFixed(0)}ms`);
  }
  ok(n === 39 && hot === 0, 'every conditioned clip peaks between -12 and -1.7 dBFS');
  ok([...bank.clips.values()].every((c) => c.data[0] === 0 && c.data[c.data.length - 1] === 0),
    'every conditioned clip starts and ends on an exact zero (a start or stop frame that rounds either way changes nothing)');
  ok(lateOnset === 0, 'every conditioned clip has its impact at the start');
  ok(longTail === 0, 'every conditioned clip is cut to its class length, with its tail at least 30 dB down');
  // a raw clip, before and after: the old onset lag and tail
  const raw = fs.readFileSync(path.join(WEB, 'assets/sfx/click-s1.wav'));
  const pcm = new Float32Array((raw.length - 44) / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = raw.readInt16LE(44 + i * 2) / 32768;
  const pk = (a, i0, i1) => { let m = 0; for (let i = i0; i < Math.min(a.length, i1); i++) m = Math.max(m, Math.abs(a[i])); return m; };
  ok(pk(pcm, 16000, 22050) > pk(pcm, 0, 1323), 'the raw click-s1 take carries a LATER hit louder than its own impact (the defect)');
  const shaped = synth.conditionClip(pcm, 44100, synth.CLIP_SHAPE.click);
  ok(shaped.length <= 6615 && pk(shaped, 0, 265) > 0.25, 'conditioned, it is the impact alone, at the start');
  const again = synth.conditionClip(pcm, 44100, synth.CLIP_SHAPE.click);
  ok(shaped.every((s, i) => s === again[i]), 'conditioning is deterministic');
  ok(synth.conditionClip(new Float32Array(4000), 44100, synth.CLIP_SHAPE.click).length === 4000, 'a silent clip passes through untouched');
  const fn = synth.conditionClip.toString();
  ok(!/Math\.(exp|pow|sin|cos|tan|log|hypot|atan)/.test(fn), 'conditionClip uses only exactly-rounded arithmetic (no Math.exp / pow / sin …)');
  // the ladder lists: every tier is a permutation of its own clips
  for (const [type, tiers] of Object.entries(synth.SFX_FILES)) {
    for (const [tier, list] of Object.entries(tiers)) {
      ok(new Set(list).size === list.length && list.every((f) => f.startsWith(`${type}-${tier}`) && bank.clips.has(f)),
        `${type}/${tier}: the tier lists its own clips, each once, all loaded`);
    }
  }
  // The conditioning's constants are what the shipped recordings themselves measure (web/tools/measure-sfx-bank.mjs: the
  // owner's takes and nothing else). Each band of a take falls from its peak to a level it then holds; the clip is kept
  // untouched until that level is reached and fades from there at the rate of the fall.
  {
    const { measureBank } = await import('./measure-sfx-bank.mjs');
    const m = measureBank(synth), S = synth.CLIP_SHAPE;
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    for (const cls of ['click', 'cue']) {
      const t = m.tail[cls];
      ok(near(S[cls].holdMs, t.hi.reached, 0.25) && near(S[cls].hiMs, t.hi.tau, 0.25) && S[cls].loMs === S[cls].hiMs,
        `${cls}: hold ${S[cls].holdMs} ms and decay ${S[cls].hiMs} ms are the class medians of the takes above the split`
        + ` (${t.hi.reached.toFixed(2)} ms, ${t.hi.tau.toFixed(2)} ms), and the band below follows`);
      ok(t.hi.floor > 15 && t.lo.floor < 10,
        `${cls}: above the split the takes fall ${t.hi.floor.toFixed(0)} dB to their floor; below it only ${t.lo.floor.toFixed(0)} dB (no fall of its own to measure)`);
    }
    {
      const t = m.tail.cushion;
      ok(near(S.cushion.holdMs, t.hi.reached, 0.25) && near(S.cushion.holdMs, t.lo.reached, 0.25)
        && near(S.cushion.hiMs, t.hi.tau, 0.25) && near(S.cushion.loMs, t.lo.tau, 0.25),
      `cushion: hold ${S.cushion.holdMs} ms and decays ${S.cushion.hiMs} / ${S.cushion.loMs} ms are the class medians of the takes, band by band`
        + ` (${t.hi.reached.toFixed(2)} / ${t.lo.reached.toFixed(2)} ms, ${t.hi.tau.toFixed(2)} / ${t.lo.tau.toFixed(2)} ms)`);
      ok(t.hi.floor > 15 && t.lo.floor > 12, `cushion: the takes fall clearly in both bands (${t.hi.floor.toFixed(0)} and ${t.lo.floor.toFixed(0)} dB)`);
    }
    ok(['click', 'cue', 'cushion'].every((cls) => ['hi', 'lo'].every((b) => m.tail[cls][b].before > m.tail[cls][b].floor + 5)),
      'in every class and band the level a take holds after its impact is well above the level before it (the impact set it off)');
    ok(near(S.click.balance / m.balance.click, 1, 0.05) && near(S.cue.balance / m.balance.cue, 1, 0.05)
      && S.cushion.balance === undefined && S.pocket.balance === undefined,
    `the balance of click and cue is the class median (${m.balance.click.toFixed(3)}, ${m.balance.cue.toFixed(3)}); cushion and pocket have none`);
    ok(Object.keys(S).every((cls) => near(S[cls].energy / m.energy[cls], 1, 0.03)),
      `each class's reference energy is its median (${Object.keys(S).map((cls) => m.energy[cls].toExponential(2)).join(', ')})`);
    for (const type of ['click', 'cue', 'cushion']) {
      for (const [tier, list] of Object.entries(synth.SFX_FILES[type])) {
        const c = list.map((f) => m.centroid[f]);
        ok(c.every((x, i) => i === 0 || x >= c[i - 1]), `${type}/${tier}: the tier is listed dull to bright (${c.map((x) => Math.round(x)).join(' / ')} Hz)`);
      }
    }
    for (const cls of ['click', 'cue', 'cushion']) {
      const sh = S[cls], end = sh.holdMs + 6.91 * Math.max(sh.hiMs, sh.loMs);
      ok(sh.maxMs >= end && sh.maxMs <= end + 12, `${cls}: the length kept (${sh.maxMs} ms) is where the faded bands are 60 dB down (${end.toFixed(0)} ms)`);
    }
  }
  for (const type of ['click', 'cushion', 'cue']) {
    const span = synth.ladderWindow(type, synth.ladderPos(type, 1));
    ok(synth.ladderPos(type, 0.05) === 0 && span[span.length - 1] === Object.values(synth.SFX_FILES[type]).flat().length - 1,
      `${type}: the ladder runs from its softest clip to its hardest`);
    let thin = 99;
    for (let g = 0.05; g <= 1; g += 0.01) thin = Math.min(thin, synth.ladderWindow(type, synth.ladderPos(type, g)).length);
    ok(thin >= 2, `${type}: every strength can draw on at least two clips (${thin})`);
  }
}

// ============================================================================
section('K  the pre-plan entry point');
{
  const cue = (type, gain, useBank) => {
    const ctx = new OfflineCtx(1, 48000 * 3, 48000);
    synth.scheduleCue(ctx, ctx.destination, synth.makeNoiseBuffer(ctx), type, gain, 0.1,
      { profile: synth.DEFAULT_PROFILE, seed: 3, bank: useBank ? bank : null });
    return { ctx, out: ctx.startRendering() };
  };
  for (const type of ['click', 'cushion', 'cue', 'pocket']) {
    const withBank = cue(type, 0.6, true), bare = cue(type, 0.6, false);
    ok(clipSources(withBank.ctx).length >= 1 && peakOf(withBank.out) > 0.01, `scheduleCue voices a ${type} from the bank`);
    ok(clipSources(bare.ctx).length === 0 && peakOf(bare.out) > 0.005, `scheduleCue voices a ${type} from the synth without it`);
  }
  ok(cue('nothing', 0.6, true).ctx.sources.length === 0, 'an unknown class is silent, not a throw');
  // a bank-less planned pocket leaves the track to the plan (no doubled rumble); a bank-less legacy cue keeps its rumble
  const planned = one({ type: 'pocket', gain: 0.6, seed: 1, plan: true }, { useBank: false });
  const legacy = cue('pocket', 0.6, false);
  ok(planned.ctx.sources.every((s) => !s.loop) && legacy.ctx.sources.some((s) => s.loop),
    'the synth rumble plays for a legacy pocket cue only; a planned pocket has the track as its own voices');
}

// ============================================================================
section('M  levels against the whole-clip voicing');
{
  // Energy over 250 ms from the voice's start (sum of squares at master 0.8, mean over twelve clip draws of the strength),
  // in dB. BEFORE is the same impact voiced by the tree this wave started from (49d36ce2: whole clips with their tails),
  // measured once with this offline model. A conditioned clip is the direct sound alone and carries far less energy at an
  // equal peak, so the level law carries a per-class make-up (synth.js SAMPLE_LEVEL): an isolated impact stays within
  // 2 dB of what it was, up to the strengths where the plan's ceiling holds the peak.
  const BEFORE = {
    click: { 0.08: -15.75, 0.25: -2.39, 0.45: 5.60, 0.7: 11.39 },
    cushion: { 0.08: -12.47, 0.25: 0.40, 0.45: 5.94, 0.7: 9.67 },
    cue: { 0.08: -20.18, 0.25: -7.81, 0.45: -1.42, 0.7: 5.17, 1: 9.05 },
    pocket: { 0.45: 5.41, 0.7: 10.02, 1: 13.74 },
  };
  const energyOf = (v) => { const x = one(v).out[0]; let e = 0; for (let i = 4800; i < 4800 + 12000; i++) e += x[i] * x[i] * 0.64; return e; };
  for (const [type, rows] of Object.entries(BEFORE)) {
    const off = [];
    for (const [g, before] of Object.entries(rows)) {
      const gain = Number(g), win = type === 'pocket' ? null : synth.ladderWindow(type, synth.ladderPos(type, gain));
      let e = 0;
      for (let i = 0; i < 12; i++) {
        const v = { type, gain, seed: i * 7 + 3, plan: true, mix: 1, cut: 0, n: 2 };
        if (win) v.clip = win[i % win.length]; else v.variant = i;
        e += energyOf(v) / 12;
      }
      off.push(10 * Math.log10(e) - before);
    }
    ok(off.every((d) => Math.abs(d) <= 2), `${type}: an isolated impact holds its energy (${Object.keys(rows).map((g, i) => `${g}: ${off[i] >= 0 ? '+' : ''}${off[i].toFixed(1)} dB`).join(', ')})`);
  }
  // the hardest single hits: the plan stages them to its ceiling, and no clip plays over it whatever its own peak
  const hard = voicesOf(headOn(6.4)).find((q) => q.type === 'click');
  ok(hard.gain === 1 && hard.mix < 1 && peakOf(one(hard).out) <= synth.PLAN_LIMITS.ceiling, `the hardest ball-ball hit is staged (${hard.mix.toFixed(2)}) and peaks under the ceiling`);
  let top = 0;
  for (const type of ['click', 'cushion', 'cue']) {
    const n = Object.values(synth.SFX_FILES[type]).flat().length;
    for (let clip = 0; clip < n; clip++) top = Math.max(top, peakOf(one({ type, gain: 1, seed: clip, plan: true, mix: 1, cut: 0, n: 2, clip }).out));
  }
  ok(top < 1, `no clip clips even UNstaged at full strength: the per-clip cap holds (highest peak ${(20 * Math.log10(top)).toFixed(1)} dBFS)`);
}

// ============================================================================
section('N  the live scheduler');
{
  // The real createSound over a stub machine and game. The audio context is the offline model with a clock the test
  // moves: frames come every 1/60 s of wall time, and the audio clock is read in render quanta with a millisecond of
  // jitter against the playback clock (what a real pair of clocks does).
  class LiveCtx extends OfflineCtx {
    constructor() { super(2, 48000 * 60, 48000); this.state = 'running'; LiveCtx.last = this; }
    resume() { return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: true, isActive: true } }, configurable: true });
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.AudioContext = LiveCtx;
  const boot = (record, slowmo = false) => {
    const handlers = {};
    const machine = { on: (e, fn) => { (handlers[e] ??= []).push(fn); return () => {}; } };
    const game = { record, state: 'AIM', paused: false, slowmo };
    const api = sound.createSound({ machine, game });
    const h = { api, game, wall: 0, emit: (e, ...a) => { for (const fn of handlers[e] ?? []) fn(...a); } };
    game.state = 'PLAYBACK';
    h.emit('stateChange', 'PLAYBACK', 'AIM', {});
    h.ctx = LiveCtx.last;
    h.playTo = (tEnd) => {
      const rate = game.slowmo ? 0.25 : 1;
      for (let t = h.t ?? 0; t <= tEnd; t += rate / 60) {
        h.wall += 1 / 60;
        h.ctx.currentTime = Math.floor((h.wall + 0.0011 * Math.sin(t * 91)) * 375) / 375;
        h.emit('frame', t, 1 / 60);
        h.t = t;
      }
    };
    h.leave = (next) => { game.state = next; h.emit('stateChange', next, 'PLAYBACK', {}); };
    return h;
  };
  const endOf = (rec) => rec.events[rec.events.length - 1].t;
  const loops = (ctx) => ctx.sources.filter((q) => q.loop).sort((p, q) => p.t0 - q.t0);
  const trackOf = (ctx) => ctx.all.filter((n) => n.kind === 'biquad' && n.Q.value === 7).map((b) => b.inputs[0].inputs[0]).sort((p, q) => p.t0 - q.t0);

  // rolling segments on one anchor: every cloth segment starts a whole number of segments after the one before
  {
    const h = boot(REC.threeRail);
    h.playTo(endOf(REC.threeRail));
    const starts = loops(h.ctx).map((q) => q.t0), H = synth.PLAN_LIMITS.rollStep;
    const off = starts.slice(1).map((t, i) => (t - starts[i]) / H).filter((g) => Math.abs(g - Math.round(g)) > 1e-9 || g < 0.5);
    ok(starts.length > 10 && off.length === 0, `live rolling segments start exactly one segment apart (${starts.length} segments, ${off.length} off the grid)`);
    ok(h.ctx.all.filter((n) => n.kind === 'panner').length === 9, 'the space graph is built at the playback entry (nine panners)');
  }
  // the trailing pass: only a playback that COMPLETED (PLAYBACK -> SETTLED) owes its remaining voices
  // a record whose LAST event is a drop into a head-end pocket: the track's roll and the stop outlast the table by 2 s
  const late = (() => {
    const st = (y, vy, motion) => ({ pos: { x: 0.6, y, z: R }, vel: { x: 0, y: vy, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion });
    const head = rack.system.table.pockets.findIndex((q) => q.center.y < -1);
    return { initial: { balls: [{ id: 1, state: st(0, -1.2, 'Rolling'), params: { r: R } }], table: rack.system.table },
      events: [{ t: 1.0, kind: { BallPocket: { ball: 1, pocket: head } }, post: [[1, st(-1.2, 0, 'Pocketed')]] }] };
  })();
  const total = voicesOf(late).length;
  {
    const h = boot(late);
    h.playTo(endOf(late) - 0.25);
    const before = h.api.scheduled;
    h.leave('AIM'); // abandoned a quarter second before its end (a rerack)
    ok(before < total && h.api.scheduled === before, `a playback abandoned near its end schedules nothing more (${before} of ${total} voices)`);
  }
  {
    const h = boot(late);
    h.playTo(endOf(late));
    const before = h.api.scheduled;
    h.leave('SETTLED');
    const after = h.api.scheduled;
    h.emit('stateChange', 'AIM', 'SETTLED', {});
    ok(before < total && after === total && h.api.scheduled === total, `a completed playback schedules what it still owes, once (${before} -> ${after} of ${total})`);
    const tr = trackOf(h.ctx), gaps = tr.slice(1).map((q, i) => q.t0 - tr[i].t0);
    ok(tr.length >= 2 && Math.max(...gaps) - Math.min(...gaps) < 1e-9, `the track's roll is one even run across the transition (${tr.length} segments)`);
  }
  // Every return-track stream, join by join. A stream's segments carry consecutive seeds, and the scheduler creates
  // voices in plan order, so the i-th track segment of the plan is the i-th track source created. A segment's source
  // stops one fade and 5 ms after the segment's own end (voiceRoll), which is where the next voice of its stream is
  // due: a later start is a gap, an earlier one an overlap. Returns the worst miss, signed (positive = gap), over the
  // segment joins and over each stream's stop.
  const streamJoins = (ctx, rec) => {
    const plan = voicesOf(rec).filter((v) => v.type === 'roll' && v.hollow);
    const made = ctx.all.filter((n) => n.kind === 'biquad' && n.Q.value === 7).map((q) => q.inputs[0].inputs[0]);
    const hits = ctx.sources.filter((q) => !q.loop && q.t0 !== null).map((q) => q.t0);
    const due = (src) => src.t1 - 0.03 - 0.005;
    let seg = 0, stop = 0, streams = 0;
    const worse = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
    if (made.length !== plan.length) return { seg: NaN, stop: NaN, streams: 0 };
    for (let i = 0; i < plan.length; i++) {
      const next = plan.findIndex((v) => v.seed === plan[i].seed + 1);
      if (next >= 0) { seg = worse(seg, made[next].t0 - due(made[i])); continue; }
      streams++; // the stream's last segment: its stop is the non-looping voice nearest its end
      stop = worse(stop, hits.map((t) => t - due(made[i])).reduce((p, q) => (Math.abs(q) < Math.abs(p) ? q : p), Infinity));
    }
    return { seg, stop, streams };
  };
  const ms = (x) => `${(x * 1000).toFixed(1)} ms`;
  // after slow motion the last stretched segment is still sounding: the tail waits for it instead of running into it
  {
    // (the table rests 0.3 s after the drop here, so the track's first segment is scheduled DURING the slow playback)
    const slow = structuredClone(late);
    slow.initial.balls.push({ id: 2, state: { pos: { x: 0, y: 0.5, z: R }, vel: { x: 0, y: 0.2, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Rolling' }, params: { r: R } });
    slow.events.push({ t: 1.3, kind: 'Rest', post: [[2, { pos: { x: 0, y: 0.6, z: R }, vel: { x: 0, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary' }]] });
    const h = boot(slow, true);
    h.playTo(endOf(slow));
    const during = trackOf(h.ctx).length;
    h.leave('SETTLED');
    const tr = trackOf(h.ctx);
    let overlap = 0;
    for (let i = 1; i < tr.length; i++) overlap = Math.max(overlap, tr[i - 1].t1 - tr[i].t0);
    ok(during >= 1 && tr.length > during && h.api.scheduled === voicesOf(slow).length && overlap <= 0.04,
      `after slow motion no two track segments overlap beyond their crossfade (${during} scheduled slow, ${tr.length - during} after; worst overlap ${(overlap * 1000).toFixed(0)} ms)`);
    const j = streamJoins(h.ctx, slow);
    ok(j.streams === 1 && Math.abs(j.seg) < 1e-6 && Math.abs(j.stop) < 1e-6,
      `... and none leaves a gap: every segment and the stop start where the one before ends (worst ${ms(j.seg)}, stop ${ms(j.stop)})`);
  }
  // two balls on the track at the settle, after slow motion: each stream continues from ITS OWN last segment
  {
    // a head-pocket drop at 1.0 s, a side-pocket drop at 1.297 s, the table at rest at 1.45 s; the game settles 0.4 s
    // after the last event, so both tracks have stretched segments sounding and segments still owed
    const two = structuredClone(late);
    const side = rack.system.table.pockets.findIndex((q) => Math.abs(q.center.y) < 0.1);
    const at = (x, y, vx, motion) => ({ pos: { x, y, z: R }, vel: { x: vx, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion });
    const sx = rack.system.table.pockets[side].center.x;
    two.initial.balls.push({ id: 3, state: at(sx - Math.sign(sx) * 0.5, 0, Math.sign(sx) * 1.1, 'Rolling'), params: { r: R } });
    two.initial.balls.push({ id: 2, state: at(0, 0.5, 0.2, 'Rolling'), params: { r: R } });
    two.events.push({ t: 1.297, kind: { BallPocket: { ball: 3, pocket: side } }, post: [[3, at(sx, 0, 0, 'Pocketed')]] });
    two.events.push({ t: 1.45, kind: 'Rest', post: [[2, at(0.1, 0.5, 0, 'Stationary')]] });
    for (const slowmo of [true, false]) {
      const h = boot(two, slowmo);
      h.playTo(endOf(two) + 0.38);
      const during = trackOf(h.ctx).length;
      h.leave('SETTLED');
      const j = streamJoins(h.ctx, two), owed = trackOf(h.ctx).length - during;
      ok(side >= 0 && j.streams === 2 && during >= 2 && owed >= 2 && h.api.scheduled === voicesOf(two).length
        && Math.abs(j.seg) < 1e-6 && Math.abs(j.stop) < 1e-6,
      `two balls on the track ${slowmo ? 'after slow motion' : 'at normal speed'}: both streams join with no gap and no overlap, stops included (${during} segments before, ${owed} after; worst ${ms(j.seg)}, stop ${ms(j.stop)})`);
    }
  }
}

// ============================================================================
section('L  the listener\'s space (live only)');
{
  // a camera behind the head rail, 1.4 m up, looking up the table (kernel +y is scene +x): its world-to-view matrix
  const viewFrom = (eye, fwd) => {
    const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const f = n(fwd), r = n(cross(f, [0, 1, 0])), u = cross(r, f);
    return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
  };
  const head = viewFrom([-2.6, 1.4, 0], [0.88, -0.47, 0]);   // at the head end, looking toward the foot
  const foot = viewFrom([2.6, 1.4, 0], [-0.88, -0.47, 0]);   // the opposite seat
  const W = synth.PAN_WIDTH;
  // looking up the table from the head end (toward kernel +y), the viewer's right is kernel +x
  ok(synth.listenerPan(head, 0, 0) === 0 && Math.abs(synth.listenerPan(head, 0, 1)) < 1e-12, 'a sound on the view axis is centred');
  ok(synth.listenerPan(head, 0.5, 0) > 0.05 && synth.listenerPan(head, -0.5, 0) < -0.05, 'a sound to the camera\'s right pans right, to its left pans left');
  ok(Math.abs(synth.listenerPan(head, 0.5, 0.3) + synth.listenerPan(head, -0.5, 0.3)) < 1e-12, 'the pan is symmetric about the view axis');
  ok(synth.listenerPan(foot, 0.5, 0) < -0.05, 'from the opposite seat the same place is on the other side');
  ok(synth.listenerPan(head, 0.6, -1.2) > synth.listenerPan(head, 0.6, 1.2), 'a near ball sits wider than a far one');
  let widest = 0;
  for (let x = -0.7; x <= 0.7; x += 0.1) for (let y = -1.3; y <= 1.3; y += 0.1) widest = Math.max(widest, Math.abs(synth.listenerPan(head, x, y)));
  ok(widest <= W + 1e-12 && W <= 0.7, `the pan never exceeds the modest width (${widest.toFixed(2)} of ${W})`);
  ok(synth.listenerPan(viewFrom([0, 1.4, 0], [1, -0.4, 0]), 0.3, -1) === W, 'a sound behind the camera on its right is at full right, not wrapped');
  // the shooter's seat (no camera): the same sense
  const up = headOn(2.5); // the head-on shot goes up the table (phi = pi/2) from (0, -0.6)
  ok(synth.shooterPan(up, 0.4, 0.3) > 0.05 && synth.shooterPan(up, -0.4, 0.3) < -0.05 && Math.abs(synth.shooterPan(up, 0, 0.9)) < 1e-12,
    'without a camera the listener sits behind the cue ball on the shot line: right of the line pans right');
  ok(synth.shooterPan({ events: [] }, 0.4, 0.3) === 0, 'and a record without a strike is centred');
  // the room impulse
  const [l, r] = synth.makeRoomImpulse(48000), [l2] = synth.makeRoomImpulse(48000);
  const energy = (a, i0 = 0, i1 = a.length) => { let e = 0; for (let i = i0; i < i1; i++) e += a[i] * a[i]; return e; };
  ok(l.length === 12000 && l.length <= 12288 && r.length === l.length && l.every((x, i) => x === l2[i]), 'the room impulse is 0.25 s (inside an engine\'s audio-thread convolution limit), stereo, and the same on every call');
  ok(energy(l, 0, 384) === 0 && Math.abs(energy(l) - 1) < 1e-4 && Math.abs(energy(r) - 1) < 1e-4, 'it starts after an 8 ms gap and each channel has unit energy');
  ok(energy(l, 9000) < 0.002, `it is a short room: the last quarter holds ${(10 * Math.log10(energy(l, 9000))).toFixed(0)} dB of the energy`);
  let corr = 0;
  for (let i = 0; i < l.length; i++) corr += l[i] * r[i];
  ok(Math.abs(corr) < 0.1, `the two channels are different tails (correlation ${corr.toFixed(3)})`);
  // the export bed stays dry and centred; the voices themselves never pan
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const exportCode = strip(fs.readFileSync(path.join(WEB, 'app/export-audio.js'), 'utf8'));
  ok(!/createStereoPanner|createConvolver|listenerPan|makeRoomImpulse/.test(exportCode), 'export-audio.js builds no panner and no room (the bed is the dry, centred mix)');
  const voicing = strip(synthSrc);
  ok(!/createStereoPanner|createConvolver|createDelay|createDynamicsCompressor|createWaveShaper/.test(voicing),
    'synth.js creates no panner, room, delay, compressor or shaper: a voice is a linear mono graph');
  const soundCode = strip(soundSrc);
  const ensure = soundCode.slice(soundCode.indexOf('function ensureAudio()'), soundCode.indexOf('function buildSpace('));
  ok((soundCode.match(/buildSpace\(/g) ?? []).length === 2 && !ensure.includes('buildSpace') && !ensure.includes('pans')
    && /if \(audio && audio\.pans === undefined\) audio\.pans = buildSpace\(audio\.ctx, audio\.master\);/.test(soundCode),
  'sound.js builds the space once, at a playback entry after the resume: the unlock path (ensureAudio) builds none of it');
  ok(!/createDynamicsCompressor|createWaveShaper/.test(soundCode), 'and puts no compressor or shaper on the live mix either');
}

console.log(failures ? `test-sfx-voices: ${failures} FAILED of ${checks}` : `test-sfx-voices PASS — ${checks} checks`);
process.exit(failures ? 1 : 0);
