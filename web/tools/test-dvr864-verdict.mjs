// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-dvr864-verdict.mjs — node selftest of lib/dvr864-verdict.mjs (DESIGN-864 section 5).
// No browser; its only I/O is importing the module under test and run-gate's verdict grammar (the H case).
// Usage: node web/tools/test-dvr864-verdict.mjs [path/to/dvr864-verdict.mjs]
//        (or OB_DVR864_VERDICT=<path>; default: lib/dvr864-verdict.mjs next to this file)
// Prints 'ok  ' / 'FAIL' per case, then 'DVR864-VERDICT SELFTEST PASS|FAIL (n)'; exit 0/1.
//
// Fixture anchors: w5 (the funnel log), w6 (the anchors log), w7 (the guards log), l5 (the reset
// log) and pp (the planPlayback log) are the GH-864 probe's evidence files; they are not in the
// repository. Each value is quoted inline in its case title (wN:L = line L of that file; the card
// cites the same line numbers).
// A value no evidence line prints is CONSTRUCTED and the case title says so
// ("[constructed: ...]"). Constructed page reads follow the card's seam
// definitions; they never decide a verdict the evidence prints differently.
import { pathToFileURL } from 'node:url';

const MOD = process.env.OB_DVR864_VERDICT || process.argv[2] || new URL('./lib/dvr864-verdict.mjs', import.meta.url).pathname;
const V = await import(pathToFileURL(MOD).href);

let n = 0, bad = 0;
function ok(title, cond, detail = '') {
  n++;
  if (cond) console.log(`ok   ${title}`);
  else { bad++; console.log(`FAIL ${title}${detail ? ` :: ${detail}` : ''}`); }
}
const show = (r) => `${r.verdict}: ${r.why} | ${r.print}`;
function leg(title, r, verdict, why) {
  ok(title, r.verdict === verdict && (why === undefined || r.why === why), `want ${verdict}${why === undefined ? '' : `: ${why}`}; got ${show(r)}`);
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const J = JSON.stringify;
const FDT = V.FDT;

// ------------------------------------------------------------------ evidence values
const DURS = [2.576669, 2.749541, 1.8104935650783585]; // w5:16
const COMP = [3.368295598567012, 3.963942325313526, 1.8104935650783585]; // w5:16
const E1 = 3.963942325313526; // w5:25, pp
const MAIN_CUM = [0, 2.576669, 5.32621]; // w5:18
const MAIN_TOTAL = 7.136703565078358; // w5:18
const FIX_CUM = [0, 3.368295598567012, 7.332237923880538]; // w5:34
const FIX_TOTAL = 9.142731488958898; // w5:34
const MOVE_CUTS = [{ seg: 1, t: 0, cam: 2, transitionIn: 0, dur: 0 }, { seg: 2, t: 0, cam: 2, transitionIn: 1, dur: 0 }]; // w5:23
const NULLBEAT_CUTS = [{ seg: 1, t: 0, cam: 2, transitionIn: 0, dur: 0 }, { seg: 2, t: 0, cam: 2, transitionIn: 0, dur: 0 }]; // w7:28
const CUT_FADE = { seg: 1, t: 274, cam: 0, transitionIn: 2, dur: 100 }; // w5:28
const CUT_BASE = { seg: 1, t: 274, cam: 0, transitionIn: 0, dur: 0 }; // w5:28
const FADES_FADE = [{ i: 1, t: 2.74, dur: 1 }, { i: 1, t: 0, dur: 1, b: 1 }, { i: 2, t: 0, dur: 1, b: 1 }]; // w5:28
const FADES_BASE = [{ i: 1, t: 0, dur: 1, b: 1 }, { i: 2, t: 0, dur: 1, b: 1 }]; // w5:28
const CD = 1.8104935650783585; // control durs, w5:262
const CTRL_EMPTY_LINE = '{"durs":[1.8104935650783585,1.8104935650783585,1.8104935650783585],"cum":[0,1.8104935650783585,3.620987130156717],"total":5.431480695235075,"tails":[0,0,0],"beats":[null,null,null],"leads":[0,0,0]}'; // w5:262 verbatim

function mkS({ cum, total, tails = [0, 0, 0], beats = [null, null, null], durs = DURS, completions = COMP, leads = [0, 0, 0], speed = 1 }) {
  return { speed, total, durs: [...durs], cum: [...cum], beats: [...beats], tails: [...tails], completions: [...completions], leads: [...leads] };
}
// the card's 24-step bisection with a step predicate "T >= flip" [constructed page read]
function bisect(lo, hi, flip, steps = 24) {
  for (let i = 0; i < steps; i++) { const m = (lo + hi) / 2; if (m >= flip) hi = m; else lo = m; }
  return { lo, hi, steps };
}
const trims3 = () => [{ startT: 0, endT: null }, { startT: 0, endT: null }, { startT: 0, endT: null }];

// fadeS restated INDEPENDENTLY here (playback.js:4687-4688) so fixtures never
// borrow the module under test's copy; a case pins the two against each other
const fadeS0 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (6 * u - 15) + 10));
const E = (S, k) => Math.max(S.durs[k] + S.tails[k], S.completions[k]); // card L1, restated
// reset dips at boundaries [1, 2] (l5:1), half-window 0.5 (l5:2) [constructed page read of b_j]
const dip = (T, S) => Math.max(...[1, 2].map((i) => {
  const d = Math.abs(T - S.cum[i]) / S.speed; return d < 0.5 ? fadeS0(1 - d / 0.5) : 0;
}));
const Tj = (S, j) => S.cum[1] + S.durs[1] + j * (E(S, 1) - S.durs[1]) / 8; // card L5, restated
function wj(S, T) { const x = (T - S.cum[1] - CUT_FADE.t / 100) / S.speed, h = CUT_FADE.dur / 200; return Math.abs(x) < h ? fadeS0(1 - Math.abs(x) / h) : 0; }
function l5Block(S, shape) {
  const samples = [];
  for (let j = 1; j <= 8; j++) {
    const T = Tj(S, j), b = dip(T, S), w = wj(S, T);
    // MAIN: a = b (l5:28-35); FIX: a = max(b, w) (l5:8-15); P4: 0.999932 j1-7, a_8 = b_8 (l5:18-25)
    const a = shape === 'MAIN' ? b : shape === 'FIX' ? Math.max(b, w) : (j === 8 ? b : 0.999932);
    samples.push({ j, T, a, b });
  }
  const S5 = clone(S);
  return { tS: (Math.round(S.durs[1] * 100) - 1) / 100,
    fade: { ok: true, cuts: [CUT_FADE], S: S5, planFades: FADES_FADE },
    base: { ok: true, cuts: [CUT_BASE], S: clone(S5), planFades: FADES_BASE }, samples };
}

// the L2b-state S: beats [null, 1, null], tails zeroed on the beat segment (card L6
// precondition note, :3378-3379); cum[2] = cum[1] + (E_1 + 1) reproduces the page's
// trim point 5.82621 (w5:29) / 7.832237923880539 (w5:45) [constructed state object]
function beatS(kind) {
  const c1 = kind === 'MAIN' ? MAIN_CUM[1] : FIX_CUM[1];
  const span1 = kind === 'MAIN' ? DURS[1] : E1;
  const cum = [0, c1, c1 + (span1 + 1)];
  return mkS({ cum, total: cum[2] + DURS[2], beats: [null, 1, null] });
}
const ends = (S) => ({ lo0: S.cum[1], hi0: S.cum[2] - S.leads[2] - S.beats[1] / 2 }); // card L2b, restated
function witness(kind, { tails1 = kind === 'FIX' ? 0.25 : 0 } = {}) {
  const tails = [0, tails1, 0];
  const S = kind === 'MAIN' ? mkS({ cum: MAIN_CUM, total: MAIN_TOTAL, tails }) : mkS({ cum: FIX_CUM, total: FIX_TOTAL, tails });
  const SB = beatS(kind);
  const { lo0, hi0 } = ends(SB);
  const l3 = [0, 1].map((k) => {
    const T = S.cum[k] + E(S, k) - 0.01;
    // main owns T by durs+tails cum (w5:20 "k0 false k1 false"); FIX owns record k (w5:36) [constructed seg/dur]
    const seg = kind === 'MAIN' ? k + 1 : k;
    return { k, T, seg, dur: S.durs[seg] };
  });
  const flip = SB.cum[2]; // strikeLive().seg > 1 from cum[2] on both schedules [constructed flip]
  const walkT0 = kind === 'MAIN' ? 2.749541 : E1; // w5:25 / w5:41
  const R = {
    meta: { tree: kind === 'MAIN' ? 'main-0e6b7a33' : 'fix-shaped' },
    boot: { url: 'http://127.0.0.1/app.html', archiveArmed: true, twoClock: true, speed: null, webcodecs: true },
    setup: { activateSnooker: true, rows: [0.94, 0.935, 2.5].map((v0) => ({ v0, err: null })), flush: true,
      sidW: 1, current: 1, sessionsIds: [1], S0: clone(S), emptyPlanOk: true, S, planFades: FADES_BASE },
    l2: { brackets: kind === 'MAIN'
      ? [{ k: 0, lo: 2.5766688464185594, hi: 2.576669, steps: 24 }, { k: 1, lo: 5.326209836114585, hi: 5.32621, steps: 24 }] // w5:19
      : [{ k: 0, lo: 3.3682953978009493, hi: 3.368295598567012, steps: 24 }, { k: 1, lo: 7.332237687611164, hi: 7.332237923880538, steps: 24 }] }, // w5:35
    l3: { reads: l3 },
    // segments k0 218, k1 253 (w5:21/37); k2 139 [constructed: planPlayback(E_2, TAIL_SEC)]
    l4: { plan: { recordsLength: 3, opts: { slowmo: 1, trims: trims3(), beats: null } }, res: { montageRate: 1, segments: [218, 253, 139] }, error: null },
    l2b: { ok: true, cuts: clone(MOVE_CUTS), S: SB, lo0, hi0, atLo0: { seg: 1, beat: false }, atHi0: { seg: 1, beat: true }, // pred reads [constructed]
      bracket: kind === 'MAIN' ? { lo: 5.326209949158728, hi: 5.326210142846465, steps: 24 } : { lo: 7.332237854135183, hi: 7.33223812020688, steps: 24 } }, // w5:24 / w5:40
    l2c: { walkSpec: { moves: [{ kind: 'pose', t0: 0, t1: 0.5 }, { kind: 'pose', t0: walkT0, t1: walkT0 + 0.3 }, { kind: 'dolly', t0: walkT0 + 0.3, t1: walkT0 + 1 }] } },
    // L4-beat: beatSec 1, segments[1] 298 (w5:26/42); k0/k2 and the brackets [constructed:
    // L2's bisection for every k < n-1 in the L2b state; k0 flips at SB.cum[1] as L2 k0 does (w5:19/35)]
    l4beat: { plan: { recordsLength: 3, opts: { slowmo: 1, trims: trims3(), beats: [null, { beatSec: 1 }, null] } },
      res: { montageRate: 1, segments: [218, 298, 139] }, error: null,
      brackets: [{ k: 0, ...bisect(SB.cum[0], SB.cum[1], SB.cum[1]) }, { k: 1, ...bisect(SB.cum[1], SB.cum[2], flip) }] },
    l5: l5Block(S, kind),
    l6: l6Block(kind, SB, kind === 'FIX' ? E1 : null, 268), // T0: endT null, 268 (w5:29-30); FIX T25: endT E_1, 268 (w5:127-128)
    ctrl: control(),
  };
  return R;
}
function l6Block(kind, SB, endT, seg1) {
  const trimArg = SB.cum[2] - SB.leads[2] - SB.beats[1] / 2; // 5.82621 (w5:29) / 7.832237923880539 (w5:45)
  return { plan: { ok: true, cuts: clone(MOVE_CUTS), S: clone(SB) }, trimArg, trimOk: true, S: clone(SB),
    P: { recordsLength: 2, opts: { slowmo: 1, beats: null, trims: [{ startT: 0, endT: null }, { startT: 0, endT }] } },
    res: { montageRate: 1, segments: [218, seg1] }, error: null };
}

// the positive control on main (w5:261-264; MOCK cue tail 0.6: w5:269-272)
const C_KEYS = ['durs', 'cum', 'total', 'tails', 'beats', 'leads'];
const pick = (S) => J(Object.fromEntries(C_KEYS.map((k) => [k, S[k]])));
function control({ mock = false } = {}) {
  const t = mock ? 0.6 : 0;
  const S = mkS({ durs: [CD, CD, CD], completions: [CD, CD, CD], tails: [t, t, t],
    cum: mock ? [0, 2.4104935650783585, 4.820987130156717] : [0, CD, 3.620987130156717], // w5:270 / w5:262
    total: mock ? 7.231480695235076 : 5.431480695235075 });
  const bc1 = S.cum[1];
  const SB = mkS({ durs: [CD, CD, CD], completions: [CD, CD, CD], tails: [t, 0, t], beats: [null, 1, null],
    cum: [0, bc1, bc1 + (CD + 1)], total: bc1 + (CD + 1) + CD + t }); // [constructed beat-state object]
  const { lo0, hi0 } = ends(SB);
  const walkSpec = { moves: [{ kind: 'pose', t0: 0, t1: 0.5 }, { kind: 'pose', t0: CD, t1: CD + 0.3 }, { kind: 'dolly', t0: CD + 0.3, t1: CD + 1 }] }; // pose t0 w5:263
  const trimArg = SB.cum[2] - SB.leads[2] - SB.beats[1] / 2;
  // plan() JSON shapes [constructed]; the fades / beats / trims inside are w5:262-264 (w5:270-272 mock)
  const planEmpty = J({ records: 3, opts: { beats: null, trims: trims3(), fades: FADES_BASE } });
  const planBeat = J({ records: 3, opts: { beats: [null, { beatSec: 1 }, null], trims: trims3(), fades: [{ i: 1, t: 0, dur: 1, b: 1 }] } });
  const planTrim = J({ records: 2, opts: { beats: null, trims: [{ startT: 0, endT: null }, { startT: 0, endT: mock ? CD : null }], fades: [{ i: 1, t: 0, dur: 1, b: 1 }] } });
  const bracket = mock ? { lo: 4.220987032672921, hi: 4.220987170389069, steps: 24 } : { lo: 3.6209870326729208, hi: 3.620987170389069, steps: 24 }; // w5:271 / w5:263
  return {
    closeState: 'AIM', activateOk: true, rows: [2.5, 2.5, 2.5].map((v0) => ({ v0, err: null })), flush: true, // [constructed page reads]
    sidC: 2, sessionsIds: [2, 1], S0: clone(S), emptyPlanOk: true, S, // sid_w 1, sid_c 2 newest first [constructed ids]
    empty: { stateJson: pick(S), planJson: planEmpty },
    beat: { ok: true, cuts: clone(MOVE_CUTS), S: SB, stateJson: pick(SB), planJson: planBeat, walkSpec, walkSpecJson: J(walkSpec),
      lo0, hi0, atLo0: { seg: 1, beat: false }, atHi0: { seg: 1, beat: true }, bracket },
    trim: { trimArg, trimOk: true, S: clone(SB), stateJson: pick(SB), planJson: planTrim },
  };
}
const legsBy = (res) => Object.fromEntries(res.legs.map((r) => [r.leg, r]));

// ================================================================== cases
// ---- A. constants and restatements against the evidence
ok('A1 FDT 0.016666666666666666 and TAIL_SEC 0.5 from framestep.js (pp constants line)', V.FDT === 0.016666666666666666 && V.TAIL_SEC === 0.5, `${V.FDT} ${V.TAIL_SEC}`);
{
  const a = V.planPlayback({ duration: E1, slowmo: 1, startT: 0, endT: null, tailSec: 0.25, headSec: 0, maxSec: Infinity });
  const m = V.planPlayback({ duration: E1, slowmo: 1, startT: 0, endT: 2.749541, tailSec: 0.25, headSec: 0, maxSec: Infinity });
  ok('A2 planPlayback E_1 -> frames 253 (playF 238); pin endT 2.749541 -> frames 180 (playF 165) (pp; w5:21)',
    a.frames === 253 && V.playFOf(a, { opts: { slowmo: 1 } }) === 238 && m.frames === 180 && V.playFOf(m, { opts: { slowmo: 1 } }) === 165, J([a.frames, m.frames]));
  const k2 = V.planPlayback({ duration: DURS[2], slowmo: 1, startT: 0, endT: null, tailSec: V.TAIL_SEC, headSec: 0, maxSec: Infinity });
  ok('A3 [constructed] L4 k2 fixture value 139 = planPlayback(E_2 1.8104935650783585, TAIL_SEC)', k2.frames === 139, J(k2));
  const e6 = V.planPlayback({ duration: E1, slowmo: 1, startT: 0, endT: null, tailSec: V.TAIL_SEC, headSec: 0, maxSec: Infinity });
  const pin = V.planPlayback({ duration: E1, slowmo: 1, startT: 0, endT: 2.749541, tailSec: V.TAIL_SEC, headSec: 0, maxSec: Infinity });
  ok('A4 ex6 268 and the P3 pin 195, short by 73 (w5:176; w6 shortfall line)', e6.frames === 268 && pin.frames === 195 && e6.frames - pin.frames === 73, J([e6.frames, pin.frames]));
}
{
  const us = [0, 0.1, 0.3227, 0.5, 0.6773, 0.9, 1, 1.2, -0.1];
  ok('A5 module fadeS === the independent restatement of playback.js:4687-4688 at 9 points', us.every((u) => V.fadeS(u) === fadeS0(u)), J(us.map((u) => [V.fadeS(u), fadeS0(u)])));
  const S = witness('FIX').setup.S;
  const w = [1, 2, 3].map((j) => wj(S, Tj(S, j)));
  const b = [5, 6, 7, 8].map((j) => dip(Tj(S, j), S));
  const want = [0.805647, 0.273097, 0.003095], wantB = [0.006181, 0.305074, 0.832124, 1.0];
  ok('A6 L5 fixture w_j (j 1-3) and b_j (j 5-8) reproduce l5:8-15 to 6 dp',
    w.every((v, i) => Math.abs(v - want[i]) < 5e-7) && b.every((v, i) => Math.abs(v - wantB[i]) < 5e-7), J([w, b]));
  const T = [1, 8].map((j) => Tj(S, j));
  ok('A7 L5 grid T_1 6.269637, T_8 7.332238 (l5:8, l5:15)', Math.abs(T[0] - 6.269637) < 5e-7 && Math.abs(T[1] - 7.332238) < 5e-7, J(T));
  const M = witness('MAIN').setup.S;
  const bm = [1, 2, 3].map((j) => dip(Tj(M, j), M));
  ok('A8 MAIN L5 fixture b_j (j 1-3) reproduce l5:28-30 (0.832124, 0.305074, 0.006181)',
    bm.every((v, i) => Math.abs(v - [0.832124, 0.305074, 0.006181][i]) < 5e-7), J(bm));
  ok('A9 control C-empty state JSON === w5:262 verbatim', control().empty.stateJson === CTRL_EMPTY_LINE, control().empty.stateJson);
  ok('A10 MAIN/FIX trim points 5.82621 (w5:29) and 7.832237923880539 (w5:45)',
    witness('MAIN').l6.trimArg === 5.82621 && witness('FIX').l6.trimArg === 7.832237923880539, J([witness('MAIN').l6.trimArg, witness('FIX').l6.trimArg]));
  ok('A11 E_1 per the card = 3.963942325313526 on the witness (w5:25)', V.Ek(M, 1) === E1, String(V.Ek(M, 1)));
}

// ---- B. MAIN-shaped readings (tails0 [0,0,0], the node replay) -> the card's main verdicts
const MAIN_RUN = V.runAll(witness('MAIN'));
{
  const L = legsBy(MAIN_RUN);
  const DEP6 = 'depends on L6: pin precondition: tails0[1] is 0';
  const want = [
    ['SETUP', 'PASS', 'ok', 'w5:15'],
    ['L0', 'PASS', 'ok', 'w5:16'],
    ['L1', 'FAIL', 'schedule law fails at k [0,1]', 'w5:18'],
    ['L2', 'FAIL', 'switch x is not E_k at k [0,1]', 'w5:19'],
    ['L3', 'FAIL', 'owning record is not k at k [0,1]', 'w5:20'],
    ['L4a', 'PASS', 'ok', 'w5:21 (k0 218, k1 253; k2 constructed)'],
    ['L4b', 'FAIL', 'segment 0 live switch vs export play end; segment 1 live switch vs export play end', 'w5:21'],
    ['L2b', 'FAIL', 'L2b beat flips at hi, not cum[1] + E_1', 'w5:24; w6 gap 1.214401'],
    ['L2c', 'FAIL', 'L2c walk departs at t0, not E_1', 'w5:25'],
    ['L4-beat', 'FAIL', 'segment 0 live switch vs export play end; segment 1 live switch vs export play end', 'w5:26 (k1); k0 constructed as L4b k0 w5:21'],
    ['L5', 'PASS', 'ok', 'l5:27-36'],
    ['L6', 'INVALID', 'pin precondition: tails0[1] is 0', 'w5:17, w5:30'],
    ['L6a', 'INVALID', DEP6, 'w5:30'],
    ['L6b', 'INVALID', DEP6, 'w5:30'],
    ['CTRL-SPLIT', 'PASS', 'ok', '[constructed split reads]'],
    ['L0-control', 'PASS', 'ok', 'w5:262'],
    ['C-empty', 'INVALID', V.COMPARE_DEFERRED, 'w5:262, one tree'],
    ['C-beat', 'INVALID', V.COMPARE_DEFERRED, 'w5:263, one tree'],
    ['C-trim', 'INVALID', V.COMPARE_DEFERRED, 'w5:264, one tree'],
  ];
  for (const [g, v, why, at] of want) leg(`B MAIN ${g} ${v}${why === 'ok' ? '' : ` "${why}"`} (${at})`, L[g], v, why);
  ok('B MAIN legs in card order, 19 legs', J(MAIN_RUN.legs.map((r) => r.leg)) === J(V.LEGS) && MAIN_RUN.legs.length === 19);
  const lines = MAIN_RUN.lines;
  ok('B MAIN L2b print carries bracket [5.326209949158728, 5.326210142846465] and cum[1] + E_1 6.540611325313526 (w5:24)',
    L.L2b.print.includes('bracket [5.326209949158728, 5.326210142846465]') && L.L2b.print.includes('cum[1] + E_1 6.540611325313526'), L.L2b.print);
  ok('B MAIN L4b print carries playF 203 f 155 / playF 238 f 165 (w5:21)',
    /k0 ex.frames 218 playF 203 .*f\(lo\) 155 f\(hi\) 155/.test(L.L4b.print) && /k1 ex.frames 253 playF 238 .*f\(lo\) 165 f\(hi\) 165/.test(L.L4b.print), L.L4b.print);
  ok('B MAIN L4-beat print: ex.frames 298 res 298 playF 238 f 165 (w5:26)',
    /ex.frames 298 res.segments\[1\] 298/.test(L['L4-beat'].print) && /playF 238 f\(lo\) 165 f\(hi\) 165/.test(L['L4-beat'].print), L['L4-beat'].print);
  ok('B MAIN L2c print: pose t0 2.749541 vs E_1 3.963942325313526 (w5:25)', L.L2c.print.startsWith('pose t0 2.749541 ') && L.L2c.print.endsWith('E_1 3.963942325313526'), L.L2c.print);
  ok('B MAIN RULING-12 line (ruling 12: tails0[1] 0 -> L6 INVALID by name)',
    lines.includes('DVR864 RULING-12 tails0[1] 0 -> L6 INVALID pin precondition: tails0[1] is 0'), lines.find((s) => s.includes('RULING-12')));
  ok('B MAIN RULING-13 line: both seams transitionIn 1, beats[1] 1 -> runnable (w5:23; w5:263)',
    lines.includes('DVR864 RULING-13 witness seam transitionIn 1, beats[1] 1; control seam transitionIn 1, beats[1] 1 -> runnable'), lines.find((s) => s.includes('RULING-13')));
  ok('B MAIN END legs 19 invalid 6 fail 7 pass 6', lines.at(-1) === 'DVR864 END legs 19 invalid 6 fail 7 pass 6', lines.at(-1));
  ok('B MAIN SUMMARY lists LEG=verdict in card order', lines.at(-2) === `DVR864 SUMMARY ${MAIN_RUN.legs.map((r) => `${r.leg}=${r.verdict}`).join(' ')}` && lines.at(-2).startsWith('DVR864 SUMMARY SETUP=PASS L0=PASS L1=FAIL'), lines.at(-2));
  ok('B MAIN first line is the boot-mode line with seams named',
    lines[0].startsWith('DVR864 boot-mode http://127.0.0.1/app.html archive-armed true twoClock true speed null webcodecs true | seams: '), lines[0]);
  ok('B MAIN leg lines have the exact shape "DVR864 <LEG> <V>: <why> | <inputs>"',
    MAIN_RUN.legs.every((r, i) => lines[i + 1] === `DVR864 ${r.leg} ${r.verdict}: ${r.why} | ${r.print}`));
}

// ---- C. FIX-shaped readings (class (a) + F1, MOCK tails0[1] 0.25 so the pin fires) -> PASS every leg
const MAIN_CTRL_DOC = V.controlStates(witness('MAIN'));
const FIX_R = witness('FIX');
const FIX_ALONE = V.runAll(FIX_R);
const FIX_RUN = V.runAll(FIX_R, { controlBaseline: MAIN_CTRL_DOC });
{
  const L = legsBy(FIX_RUN);
  for (const g of V.LEGS) leg(`C FIX ${g} PASS (w5:32-46, w5:113-128; control compares w5:265)`, L[g], 'PASS', 'ok');
  ok('C FIX END legs 19 invalid 0 fail 0 pass 19', FIX_RUN.lines.at(-1) === 'DVR864 END legs 19 invalid 0 fail 0 pass 19', FIX_RUN.lines.at(-1));
  ok('C FIX RULING-12 tails0[1] 0.25 -> L6 runnable (w5:115)', FIX_RUN.lines.includes('DVR864 RULING-12 tails0[1] 0.25 -> L6 runnable'), FIX_RUN.lines.find((s) => s.includes('RULING-12')));
  ok('C FIX L6b print: 268 vs 268 and L4a on the pin 268 EQUAL (w5:128)', /res.segments\[1\] 268 vs ex6.frames 268/.test(L.L6b.print) && /ex\(pin\) 268 vs 268 EQUAL/.test(L.L6b.print), L.L6b.print);
  ok('C FIX L2b |hi - target| 1.963e-7 region (w6 FIX width line)', /\|hi - target\| 1\.96\d*e-7/.test(L.L2b.print), L.L2b.print);
  const A = legsBy(FIX_ALONE);
  ok('C FIX without a baseline: witness legs PASS, C-* INVALID "compare deferred" (non-blocking), END invalid 3',
    ['C-empty', 'C-beat', 'C-trim'].every((g) => A[g].verdict === 'INVALID' && A[g].why === V.COMPARE_DEFERRED)
    && FIX_ALONE.lines.at(-1) === 'DVR864 END legs 19 invalid 3 fail 0 pass 16', FIX_ALONE.lines.at(-1));
  ok('C FIX T0 (tails0 0, w5:33): L6 INVALID "pin precondition: tails0[1] is 0" on the fix too (ruling 12)',
    V.legL6(witness('FIX', { tails1: 0 })).why === 'pin precondition: tails0[1] is 0');
}

// ---- D. plant shapes (w5 P1-P3; l5 P4)
{
  // P1: refreshSchedule total reverted; main's cum; L2b has no beat window, L2c still PASSes (w5:56-57)
  const R = witness('MAIN');
  R.l2b.atHi0 = { seg: 1, beat: false }; // w5:56 "pred(lo) false, pred(hi) false"
  R.l2b.bracket = null;
  R.l2c.walkSpec.moves.at(-2).t0 = E1; // w5:57 pose t0 3.963942325313526
  const L = legsBy(V.runAll(R));
  leg('D P1 L2b INVALID "no beat window" (w5:56)', L.L2b, 'INVALID', 'no beat window');
  leg('D P1 L2c PASS: "no beat window" does not block L2c (w5:57)', L.L2c, 'PASS', 'ok');
  leg('D P1 L4-beat FAIL (w5:58 k1; k0 constructed on main\'s schedule)', L['L4-beat'], 'FAIL', 'segment 0 live switch vs export play end; segment 1 live switch vs export play end');
  leg('D P1 L1 FAIL naming k [0,1] (w5:50)', L.L1, 'FAIL', 'schedule law fails at k [0,1]');
  leg('D P1 L2 FAIL (w5:51)', L.L2, 'FAIL', 'switch x is not E_k at k [0,1]');
  // P1 at MOCK tails0[1] 0.25: includedSegments' MIXED endT 3.249541, 225 vs 268 (w5:143-144)
  const R2 = witness('MAIN', { tails1: 0.25 });
  R2.l6 = l6Block('MAIN', beatS('MAIN'), 3.249541, 225);
  leg('D P1 T25 L6a FAIL "L6a pin endT" (w5:144)', V.legL6a(R2), 'FAIL', 'L6a pin endT');
  const b = V.legL6b(R2);
  leg('D P1 T25 L6b FAIL 225 vs 268 (w5:144)', b, 'FAIL', 'L6b segment 1 export frames vs the live end');
  ok('D P1 T25 L6b print 225 vs 268; L4a on the pin 225 EQUAL (w5:144)', /res.segments\[1\] 225 vs ex6.frames 268/.test(b.print) && /ex\(pin\) 225 vs 225 EQUAL/.test(b.print), b.print);
}
{
  // P2: livePovSpec tW = durs restored; L2b PASS, L2c FAIL (w5:72-73), every other leg PASS
  const R = witness('FIX');
  R.l2c.walkSpec.moves.at(-2).t0 = 2.749541; // w5:73
  const res = V.runAll(R, { controlBaseline: MAIN_CTRL_DOC });
  const L = legsBy(res);
  leg('D P2 L2b PASS (w5:72)', L.L2b, 'PASS', 'ok');
  leg('D P2 L2c FAIL "L2c walk departs at t0, not E_1" (w5:73)', L.L2c, 'FAIL', 'L2c walk departs at t0, not E_1');
  ok('D P2 every other leg PASS (row 283; w5:74)', res.legs.filter((r) => r.leg !== 'L2c').every((r) => r.verdict === 'PASS'), res.lines.at(-2));
  ok('D P2 L2c departs 1.214401 s before E_1 (w6 P2 gap line)', Math.abs((E1 - 2.749541) - 1.214401) < 5e-7);
}
{
  // P3 at MOCK tails0[1] 0.25: pin reverted to durs -> endT 2.749541, 195 vs 268, L4a 195 = 195 (w5:175-176)
  const R = witness('FIX');
  R.l6 = l6Block('FIX', beatS('FIX'), 2.749541, 195);
  const L = legsBy(V.runAll(R, { controlBaseline: MAIN_CTRL_DOC }));
  leg('D P3 T25 L6 PASS (the pair left the window, w5:175)', L.L6, 'PASS', 'ok');
  leg('D P3 T25 L6a FAIL "L6a pin endT" 2.749541 vs 3.963942325313526 (w5:176)', L.L6a, 'FAIL', 'L6a pin endT');
  leg('D P3 T25 L6b FAIL 195 vs 268 (w5:176)', L.L6b, 'FAIL', 'L6b segment 1 export frames vs the live end');
  ok('D P3 T25 L4a as written on the pin row: 195 = 195 EQUAL, never a verdict (w5:176)', /ex\(pin\) 195 vs 195 EQUAL/.test(L.L6b.print) && L.L6b.exPin === 195, L.L6b.print);
  ok('D P3 T25 L6a print endT 2.749541 vs 3.963942325313526', L.L6a.print === 'pin endT 2.749541 vs max(durs[1], completions[1]) 3.963942325313526', L.L6a.print);
  // P3 at MOCK cue tail with P3's own L4a: stays PASS (the card: "L4a must stay equal")
  leg('D P3 T25 L4a PASS (row 290)', L.L4a, 'PASS', 'ok');
  // MAIN at MOCK tails0[1] 0.25 is identical to P3 on the pin row (w5:111-112)
  const M = witness('MAIN', { tails1: 0.25 });
  M.l6 = l6Block('MAIN', beatS('MAIN'), 2.749541, 195);
  leg('D MAIN T25 L6 PASS (w5:111)', V.legL6(M), 'PASS', 'ok');
  leg('D MAIN T25 L6a FAIL (w5:112)', V.legL6a(M), 'FAIL', 'L6a pin endT');
  leg('D MAIN T25 L6b FAIL 195 vs 268 (w5:112)', V.legL6b(M), 'FAIL', 'L6b segment 1 export frames vs the live end');
  ok('D MAIN T25 RULING-12: tails0[1] 0.25 -> L6 runnable', V.ruling12Line(M, V.legL6(M)) === 'DVR864 RULING-12 tails0[1] 0.25 -> L6 runnable', V.ruling12Line(M, V.legL6(M)));
}
{
  // P4: cut-fade compare on the collapsed clock -> L5 FAIL 7 of 8 (l5:18-26)
  const R = witness('FIX');
  R.l5 = l5Block(R.setup.S, 'P4');
  const r = V.legL5(R);
  leg('D P4 L5 FAIL "L5b j [1,2,3]; L5a j [4,5,6,7]" (l5:26)', r, 'FAIL', 'L5b j [1,2,3]; L5a j [4,5,6,7]');
  ok('D P4 L5 red 7 of 8; j 8 cannot tell (l5:25)', r.print.endsWith('red 7 of 8') && !r.red.L5a.includes(8), r.print.slice(-40));
  const f = V.legL5(witness('FIX'));
  ok('D FIX L5 PASS red 0 of 8 (l5:16)', f.verdict === 'PASS' && f.print.endsWith('red 0 of 8'), show(f).slice(-60));
}

// ---- E. w7 known reds: each L2b guard names its cause (ruling 13), never green by fallback
const NULLBEAT = 'L2b seam downgraded: beatFor(1, durs[1]) null';
const GATED = 'L2b beat gated: twoClock';
function arm(R, kind) {
  for (const st of [R.l2b, R.ctrl.beat, R.l6.plan]) {
    st.cuts = kind === 'NULLBEAT' ? clone(NULLBEAT_CUTS) : clone(MOVE_CUTS); // w7:28 / w7:38 stored (2,0)
    st.S.beats = [null, null, null]; // w7:28 / w7:38 beats [null,null,null]
  }
  R.l2c.walkSpec = null; R.ctrl.beat.walkSpec = null; R.ctrl.beat.walkSpecJson = 'null'; // walkSpec null when beats[1] null (:12263-12270)
  return R;
}
for (const kind of ['NULLBEAT', 'NOTWOCLOCK']) {
  const why = kind === 'NULLBEAT' ? NULLBEAT : GATED;
  const at = kind === 'NULLBEAT' ? 'w7:28-29' : 'w7:38-39';
  const R = arm(witness('FIX'), kind);
  const res = V.runAll(R, { controlBaseline: MAIN_CTRL_DOC });
  const L = legsBy(res);
  leg(`E ${kind} witness L2b INVALID "${why}" (${at})`, L.L2b, 'INVALID', why);
  leg(`E ${kind} L2c INVALID "depends on L2b: ${why}"`, L.L2c, 'INVALID', `depends on L2b: ${why}`);
  leg(`E ${kind} L4-beat INVALID "depends on L2b: ${why}"`, L['L4-beat'], 'INVALID', `depends on L2b: ${why}`);
  leg(`E ${kind} direct L2c guard INVALID "no walk spec" (${at})`, V.legL2c(R), 'INVALID', 'no walk spec');
  leg(`E ${kind} L6 re-applies L2b's plan with its guards: INVALID "${why}" (card L6 setup)`, L.L6, 'INVALID', why);
  leg(`E ${kind} L6a INVALID "depends on L6: ${why}"`, L.L6a, 'INVALID', `depends on L6: ${why}`);
  leg(`E ${kind} control C-beat INVALID "${why}" (${at} control)`, L['C-beat'], 'INVALID', why);
  leg(`E ${kind} control C-trim INVALID "depends on C-beat: ${why}"`, L['C-trim'], 'INVALID', `depends on C-beat: ${why}`);
  leg(`E ${kind} C-empty still compared (PASS vs main)`, L['C-empty'], 'PASS', 'ok');
  const seam = kind === 'NULLBEAT' ? 'transitionIn 0' : 'transitionIn 1';
  ok(`E ${kind} RULING-13 names the seam and the cause on both sessions`,
    res.lines.includes(`DVR864 RULING-13 witness seam ${seam}, beats[1] null; control seam ${seam}, beats[1] null -> INVALID witness (${why}); control (${why})`),
    res.lines.find((s) => s.includes('RULING-13')));
  ok(`E ${kind} no leg downstream of a guard is PASS`, ['L2b', 'L2c', 'L4-beat', 'L6', 'L6a', 'L6b', 'C-beat', 'C-trim'].every((g) => L[g].verdict === 'INVALID'));
}
{
  const R = witness('FIX'); R.l2b.cuts = [clone(MOVE_CUTS[0])];
  leg('E seam missing: L2b INVALID "L2b seam missing"', V.legL2b(R), 'INVALID', 'L2b seam missing');
  R.l2b.ok = false;
  leg('E plan refused: L2b INVALID "L2b plan refused"', V.legL2b(R), 'INVALID', 'L2b plan refused');
  ok('E RULING-13 seam missing prints "missing"', V.ruling13Line(R).startsWith('DVR864 RULING-13 witness seam missing, beats[1] 1; control seam transitionIn 1'), V.ruling13Line(R));
}

// ---- F. L0 / Setup reds and the "depends on" root-cause rule
{
  const R = witness('FIX'); R.setup.S.completions[1] = R.setup.S.durs[1] + R.setup.S.tails[1]; // [constructed] no late drop on row 1
  const res = V.runAll(R);
  leg('F L0 FAIL "row 1 is not a witness" [constructed completions[1] = durs + tails]', legsBy(res).L0, 'FAIL', 'row 1 is not a witness');
  leg('F L1 INVALID "depends on L0: row 1 is not a witness"', legsBy(res).L1, 'INVALID', 'depends on L0: row 1 is not a witness');
  const R2 = witness('FIX'); R2.setup.S.completions[2] = DURS[2] + 0.1; // [constructed]
  leg('F L0 FAIL "row 2 is not a control" [constructed completions[2] > durs[2]]', V.legL0(R2), 'FAIL', 'row 2 is not a control');
  const R3 = witness('FIX'); R3.setup.S.completions[0] = DURS[0]; R3.setup.S.completions[2] = 2;
  leg('F L0 FAIL names both causes [constructed]', V.legL0(R3), 'FAIL', 'row 0 is not a witness; row 2 is not a control');
  const R4 = witness('FIX'); for (const f of ['durs', 'cum', 'beats', 'tails', 'completions', 'leads']) R4.setup.S[f] = R4.setup.S[f].slice(0, 2);
  leg('F L0 INVALID "not one session" [constructed 2 records]', V.legL0(R4), 'INVALID', 'not one session');
  const R5 = witness('FIX'); R5.setup.sidW = null;
  const r5 = V.runAll(R5); const L5 = legsBy(r5);
  leg('F SETUP INVALID "no witness session" [constructed sid_w null]', L5.SETUP, 'INVALID', 'no witness session');
  leg('F L0 INVALID "depends on SETUP: no witness session"', L5.L0, 'INVALID', 'depends on SETUP: no witness session');
  leg('F L6b root cause propagates two hops: "depends on SETUP: no witness session"', L5.L6b, 'INVALID', 'depends on SETUP: no witness session');
  leg('F CTRL-SPLIT INVALID "depends on SETUP: no witness session"', L5['CTRL-SPLIT'], 'INVALID', 'depends on SETUP: no witness session');
  ok('F SETUP red: every leg INVALID, none PASS', r5.lines.at(-1) === 'DVR864 END legs 19 invalid 19 fail 0 pass 0', r5.lines.at(-1));
  const R6 = witness('FIX'); R6.setup.S.beats = [null, 1, null];
  leg('F SETUP INVALID "plan seed not cleared" [constructed beats after empty plan]', V.legSETUP(R6), 'INVALID', 'plan seed not cleared');
  const R7 = witness('FIX'); R7.setup.emptyPlanOk = false;
  leg('F SETUP INVALID "plan seed not cleared" when setCutPlan(empty) is false', V.legSETUP(R7), 'INVALID', 'plan seed not cleared');
  const R8 = witness('FIX'); R8.setup.rows[1].err = 'busy';
  leg('F SETUP INVALID row rejected [constructed]', V.legSETUP(R8), 'INVALID', 'setup: row v0=0.935 shoot rejected');
  const R9 = witness('FIX'); delete R9.l3;
  leg('F missing reading: L3 INVALID "reading missing: l3.reads", never PASS', V.legL3(R9), 'INVALID', 'reading missing: l3.reads');
  const R10 = witness('FIX'); R10.l3.reads[0].T += 1e-12;
  leg('F L3 probe T re-derived bit-exact [constructed off-by-1e-12]', V.legL3(R10), 'INVALID', 'L3 probe T is not S.cum[k] + E_k - 0.01');
}

// ---- G. grid-ambiguous (INVALID, never a pass) and the exact / tolerance edges
{
  const R = witness('FIX'); const c1 = R.setup.S.cum[1];
  R.l2.brackets[1] = { k: 1, lo: c1 + 237 * FDT - 1e-9, hi: c1 + 237 * FDT + 1e-9, steps: 24 }; // [constructed straddle of frame 237|238]
  const r = V.legL4b(R);
  leg('G L4b INVALID "grid-ambiguous" [constructed bracket straddling a frame edge]', r, 'INVALID', 'grid-ambiguous');
  ok('G L4b ambiguous print names k [1] and f(lo) 237 f(hi) 238', /f\(lo\) 237 f\(hi\) 238/.test(r.print) && r.print.endsWith('ambiguous k [1]'), r.print);
  const M = witness('MAIN'); M.l2.brackets[1] = { k: 1, lo: M.setup.S.cum[1] + 237 * FDT - 1e-9, hi: M.setup.S.cum[1] + 237 * FDT + 1e-9, steps: 24 };
  leg('G L4b unambiguous FAIL at k 0 wins over ambiguous k 1 [constructed]', V.legL4b(M), 'FAIL', 'segment 0 live switch vs export play end');
  const B = witness('FIX'); const bc = B.l2b.S.cum[1] + 1;
  B.l4beat.brackets[1] = { k: 1, lo: bc + 237 * FDT - 1e-9, hi: bc + 237 * FDT + 1e-9, steps: 24 };
  leg('G L4-beat INVALID "grid-ambiguous" [constructed]', V.legL4beat(B), 'INVALID', 'grid-ambiguous');
}
{
  const R = witness('FIX'); const S = R.setup.S; const tot = S.cum[2] + V.Ek(S, 2);
  S.total = tot + 5e-10; leg('G L1 total within 1e-9 PASS [constructed +5e-10]', V.legL1(R), 'PASS', 'ok');
  S.total = tot + 3e-9; leg('G L1 total off by 3e-9 FAIL "schedule law fails at total" [constructed]', V.legL1(R), 'FAIL', 'schedule law fails at total');
  const R2 = witness('FIX'); R2.l2.brackets[0].hi = V.Ek(S, 0) + 0.9e-3;
  leg('G L2 x = E_0 + 0.9e-3 PASS (tolerance 1e-3) [constructed]', V.legL2(R2), 'PASS', 'ok');
  R2.l2.brackets[0].hi = V.Ek(S, 0) + 1.1e-3;
  leg('G L2 x = E_0 + 1.1e-3 FAIL [constructed]', V.legL2(R2), 'FAIL', 'switch x is not E_k at k [0]');
  const R3 = witness('FIX'); const tgt = R3.l2b.S.cum[1] + E1;
  R3.l2b.bracket.hi = tgt + 0.9e-3; leg('G L2b |hi - target| 0.9e-3 PASS [constructed]', V.legL2b(R3), 'PASS', 'ok');
  R3.l2b.bracket.hi = tgt - 1.1e-3; leg('G L2b |hi - target| 1.1e-3 FAIL [constructed]', V.legL2b(R3), 'FAIL', 'L2b beat flips at hi, not cum[1] + E_1');
  const R4 = witness('FIX'); R4.l2c.walkSpec.moves.at(-2).t0 = E1 + 1e-12;
  leg('G L2c exact: t0 = E_1 + 1e-12 FAIL [constructed]', V.legL2c(R4), 'FAIL', 'L2c walk departs at t0, not E_1');
  const R5 = witness('FIX'); R5.l6.P.opts.trims[1].endT = E1 + 1e-12;
  leg('G L6a exact: endT = E_1 + 1e-12 FAIL [constructed]', V.legL6a(R5), 'FAIL', 'L6a pin endT');
  const R6 = witness('FIX'); R6.l5.samples[0].a += 5e-10;
  leg('G L5b within 1e-9 PASS [constructed a_1 + 5e-10]', V.legL5(R6), 'PASS', 'ok');
  R6.l5.samples[0].a += 2e-9;
  leg('G L5b off by 2.5e-9 FAIL "L5b j [1]" [constructed]', V.legL5(R6), 'FAIL', 'L5b j [1]');
  const R7 = witness('FIX'); R7.l5.samples[4].a += 1e-12;
  leg('G L5a exact past the window: a_5 = b_5 + 1e-12 FAIL "L5a j [5]" [constructed]', V.legL5(R7), 'FAIL', 'L5a j [5]');
  const R8 = witness('FIX'); R8.l4.res.segments[1] = 254;
  leg('G L4a exact: segments[1] 254 vs 253 FAIL [constructed]', V.legL4a(R8), 'FAIL', 'segment 1 export frames');
  const R9 = witness('FIX'); R9.l6.res.segments[1] = 267;
  leg('G L6b exact: 267 vs 268 FAIL [constructed]', V.legL6b(R9), 'FAIL', 'L6b segment 1 export frames vs the live end');
  const R10 = witness('FIX'); R10.l5.samples[2].T += 1e-12;
  leg('G L5 sample grid re-derived bit-exact [constructed]', V.legL5(R10), 'INVALID', 'L5 sample grid is not the card\'s T_j');
}

// ---- H. positive control: split, sid rule, L0-control (derived, never presumed)
{
  const base = () => witness('FIX');
  const R1 = base(); R1.ctrl.sidC = 1; // sid_c === sid_w [constructed]
  const r1 = V.runAll(R1); const L1 = legsBy(r1);
  leg('H sid rule: sid_c === sid_w -> CTRL-SPLIT INVALID "control did not split" [constructed]', L1['CTRL-SPLIT'], 'INVALID', 'control did not split');
  leg('H L0-control INVALID "depends on CTRL-SPLIT: control did not split"', L1['L0-control'], 'INVALID', 'depends on CTRL-SPLIT: control did not split');
  leg('H C-trim INVALID with the root cause "depends on CTRL-SPLIT: control did not split"', L1['C-trim'], 'INVALID', 'depends on CTRL-SPLIT: control did not split');
  ok('H sid rule print carries sid_w, sid_c and sessions[0..2]', /sid_w 1 sid_c 1 sessions\[0\.\.2\] \[2,1\]/.test(L1['CTRL-SPLIT'].print), L1['CTRL-SPLIT'].print);
  const R2 = base(); R2.ctrl.sidC = null; // archive.js:615-620 null before the first persist [constructed]
  leg('H sid rule: sid_c null -> "control did not split" [constructed]', V.legCTRLSPLIT(R2), 'INVALID', 'control did not split');
  const R3 = base(); R3.ctrl.sessionsIds = [3, 2, 1]; // sid_c not the newest [constructed]
  leg('H sid rule: sid_c not sessions()[0] -> "control did not split" [constructed]', V.legCTRLSPLIT(R3), 'INVALID', 'control did not split');
  const R4 = base(); R4.ctrl.activateOk = false; // replayLocked (flow.js:3371) [constructed]
  leg('H activateSnooker false -> "control split refused" [constructed]', V.legCTRLSPLIT(R4), 'INVALID', 'control split refused');
  const R5 = base(); R5.ctrl.closeState = 'PLAYBACK';
  leg('H player still in PLAYBACK -> "control split: player did not close" [constructed reason]', V.legCTRLSPLIT(R5), 'INVALID', 'control split: player did not close');
  const R6 = base(); R6.ctrl.S.beats = [null, 1, null];
  leg('H control Setup 5 guard -> "plan seed not cleared" [constructed]', V.legCTRLSPLIT(R6), 'INVALID', 'plan seed not cleared');
  const R7 = base(); R7.ctrl.S.completions[1] = CD + 0.3; // a late drop on a control row [constructed]
  leg('H L0-control INVALID "not a control" (completions !== durs) [constructed]', V.legL0control(R7), 'INVALID', 'not a control');
  const R8 = base(); for (const f of ['durs', 'cum', 'beats', 'tails', 'completions', 'leads']) R8.ctrl.S[f] = R8.ctrl.S[f].slice(0, 2);
  leg('H L0-control INVALID "control is not one session" [constructed]', V.legL0control(R8), 'INVALID', 'control is not one session');
  const R9 = base(); R9.ctrl = control({ mock: true });
  leg('H L0-control PASS at MOCK cue tail 0.6 (w5:270 "max(...) === durs + tails true")', V.legL0control(R9), 'PASS', 'ok');
  const R10 = base(); R10.ctrl.S.tails[0] = -0.1; // max(durs + t, completion) = completion !== durs + t [constructed]
  leg('H L0-control INVALID "not a control" when E_k !== durs + tails [constructed negative tail]', V.legL0control(R10), 'INVALID', 'not a control');
  ok('H L0-control print: kept reset boundaries [1,2] from the control plan (w5:262 fades b1 at i 1 and 2)', V.legL0control(base()).print.endsWith('kept reset boundaries [1,2]'), V.legL0control(base()).print.slice(-60));
  const R11 = base(); R11.ctrl.rows[2].v0 = 0.935;
  leg('H control rows must be v0 2.5 x3 [constructed]', V.legCTRLSPLIT(R11), 'INVALID', 'control: rows are not v0 2.5, 2.5, 2.5');
}
{
  // run-gate's ledger reads its arm count with the ONE verdict grammar (lib/verdict-grammar.mjs, #1194): only an E2E-
  // suite summary's own '(N …' adds its number, so a leg line never inflates the suite's arm count. The module is pure
  // and is imported (run-gate.mjs itself is a CLI and is never imported).
  const { countArms } = await import(new URL('./lib/verdict-grammar.mjs', import.meta.url).href);
  const over = FIX_RUN.lines.filter((s) => countArms(s) > 1);
  const control = countArms('DVR864 L6b PASS: (313 frames) | x') === 1 && countArms('E2E-EXPORT-Z2 PASS (313 frames)') === 313;
  ok('H arm harvest: no FIX leg line adds more than one arm to run-gate\'s count (only a suite summary\'s own count is read)', over.length === 0 && control, J({ over, control }));
}

// ---- I. cross-tree compares (byte-identical or FAIL; INVALID on either tree is not compared)
{
  const docM = V.controlStates(witness('MAIN'));
  ok('I controlStates schema, tree, three states captured', docM.schema === 'dvr864-control-states/1' && docM.tree === 'main-0e6b7a33'
    && ['empty', 'beat', 'trim'].every((k) => docM.states[k].why === null && docM.states[k].fields), J(docM).slice(0, 300));
  ok('I controlStates C-empty state bytes === w5:262 verbatim', docM.states.empty.fields.state === CTRL_EMPTY_LINE);
  ok('I controlStates C-beat bracket bytes === w5:263 {lo 3.6209870326729208, hi 3.620987170389069}', docM.states.beat.fields.bracket === '[3.6209870326729208,3.620987170389069]', docM.states.beat.fields.bracket);
  const d2 = clone(docM); d2.states.trim.fields.plan = d2.states.trim.fields.plan.replace('"endT":null}],"fades"', '"endT":1.8104935650783585}],"fades"');
  ok('I plant: baseline trim plan differs (the endT the MOCK pin writes, w5:272)', d2.states.trim.fields.plan !== docM.states.trim.fields.plan);
  const L2 = legsBy(V.runAll(witness('FIX'), { controlBaseline: d2 }));
  leg('I C-trim FAIL "C-trim differs from the baseline tree" [constructed baseline]', L2['C-trim'], 'FAIL', 'C-trim differs from the baseline tree');
  ok('I C-trim FAIL print names the differing field [plan]', L2['C-trim'].print.endsWith('differ [plan]'), L2['C-trim'].print.slice(-80));
  const d3 = clone(docM); d3.states.beat = { why: NULLBEAT, fields: null };
  const L3 = legsBy(V.runAll(witness('FIX'), { controlBaseline: d3 }));
  leg('I baseline C-beat INVALID -> this tree INVALID, not compared', L3['C-beat'], 'INVALID', `C-beat INVALID on the baseline tree: ${NULLBEAT}`);
  const Rm = witness('FIX'); Rm.ctrl = control({ mock: true });
  const Mm = witness('MAIN'); Mm.ctrl = control({ mock: true });
  const L4 = legsBy(V.runAll(Rm, { controlBaseline: V.controlStates(Mm) }));
  ok('I MOCK cue tail 0.6: all three compares hold (w5:273)', ['C-empty', 'C-beat', 'C-trim'].every((g) => L4[g].verdict === 'PASS'), J(['C-empty', 'C-beat', 'C-trim'].map((g) => show(L4[g]).slice(0, 120))));
  const R5 = witness('FIX'); R5.ctrl.empty.stateJson = R5.ctrl.empty.stateJson.replace('5.431480695235075', '5.431480695235076');
  leg('I C-empty state JSON must match S [constructed 1-ulp edit]', V.legCempty(R5), 'INVALID', 'C-empty state JSON does not match S');
  const R6 = witness('FIX'); R6.ctrl.beat.atHi0 = { seg: 1, beat: false };
  const L6 = legsBy(V.runAll(R6, { controlBaseline: docM }));
  leg('I C-beat "no beat window" is INVALID by L2b\'s rule [constructed]', L6['C-beat'], 'INVALID', 'no beat window');
  leg('I C-trim still runs after C-beat\'s guards passed (no beat window is not a guard)', L6['C-trim'], 'PASS', 'ok');
  const docB = V.controlStates(arm(witness('FIX'), 'NULLBEAT'));
  ok('I controlStates skips C-trim when C-beat\'s guards fail', docB.states.beat.why === NULLBEAT && docB.states.trim.why === 'C-beat guards did not pass', J(docB.states.trim));
  const R7 = witness('FIX'); R7.ctrl.trim.trimOk = false;
  leg('I C-trim setTrim refused [constructed]', V.legCtrim(R7, { controlBaseline: docM }), 'INVALID', 'C-trim setTrim refused');
}

// ---- J. remaining named reasons, the boot line and the pure builders
{
  const R1 = witness('FIX'); R1.setup.S.beats[1] = 1; // beats[1] set at L0 [constructed]
  leg('J L6 INVALID "pin precondition unreadable" (beats[1] not null at L0) [constructed]', V.legL6(R1), 'INVALID', 'pin precondition unreadable');
  ok('J RULING-12 prints unreadable when beats[1] is set', V.ruling12Line(R1, null) === 'DVR864 RULING-12 tails0[1] 0.25 -> L6 INVALID pin precondition unreadable', V.ruling12Line(R1, null));
  const R2 = witness('FIX'); R2.l6.P.recordsLength = 3;
  leg('J L6 INVALID "pair did not leave the window" (3 records) [constructed]', V.legL6(R2), 'INVALID', 'pair did not leave the window');
  const R3 = witness('FIX'); R3.l6.P.opts.beats = [null, { beatSec: 1 }];
  leg('J L6 INVALID "pair did not leave the window" (export beat kept) [constructed]', V.legL6(R3), 'INVALID', 'pair did not leave the window');
  const R4 = witness('FIX'); R4.l6.trimOk = false;
  leg('J L6 INVALID "L6 setTrim refused" [constructed reason]', V.legL6(R4), 'INVALID', 'L6 setTrim refused');
  const R5 = witness('FIX'); R5.l6.res.montageRate = 0.5;
  leg('J L6b INVALID when res.montageRate !== 1 [constructed reason]', V.legL6b(R5), 'INVALID', 'L6b export precondition: res.montageRate is not 1');
  const R6 = witness('FIX'); R6.l4.res.montageRate = 2;
  leg('J L4a INVALID export precondition montageRate [constructed reason]', V.legL4a(R6), 'INVALID', 'export precondition: res.montageRate is not 1');
  const R7 = witness('FIX'); R7.l4.error = 'boom';
  leg('J L4b INVALID "renderDrill threw: boom" [constructed]', V.legL4b(R7), 'INVALID', 'renderDrill threw: boom');
  const R8 = witness('FIX'); R8.l2c.walkSpec.moves.reverse();
  leg('J L2c INVALID "walk shape" [constructed reversed moves]', V.legL2c(R8), 'INVALID', 'walk shape');
  const R9 = witness('FIX'); R9.l2b.hi0 += 1e-12;
  leg('J L2b INVALID bracket ends re-derived bit-exact [constructed]', V.legL2b(R9), 'INVALID', 'L2b bracket ends are not the card\'s');
  const R10 = witness('FIX'); R10.l4beat.plan.opts.beats = null;
  leg('J L4-beat INVALID "the plan carries no beat on segment 1" [constructed]', V.legL4beat(R10), 'INVALID', 'L4-beat: the plan carries no beat on segment 1');
  const R11 = witness('FIX'); R11.l5.fade.cuts = [CUT_BASE];
  leg('J L5 INVALID fade cut not stored as transitionIn 2 [constructed]', V.legL5(R11), 'INVALID', 'L5 fade cut not stored as transitionIn 2');
  const R12 = witness('FIX'); R12.l5.base.S.cum[2] += 1e-9;
  leg('J L5 INVALID states differ beyond the fade flag [constructed]', V.legL5(R12), 'INVALID', 'L5 states differ beyond the fade flag');
  const R13 = witness('FIX'); R13.l5.fade.S.beats[1] = 1; R13.l5.base.S.beats[1] = 1;
  leg('J L5 INVALID when a state carries a beat [constructed]', V.legL5(R13), 'INVALID', 'L5 states carry a beat');
  const R14 = witness('FIX'); R14.l5.samples.pop();
  leg('J L5 INVALID on a missing sample, never PASS', V.legL5(R14), 'INVALID', 'reading missing: l5.samples[j=8]');
  const R15 = witness('FIX'); R15.l6.S.beats[1] = null;
  leg('J L6 INVALID "L6 beat lost after the trim" [constructed reason]', V.legL6(R15), 'INVALID', 'L6 beat lost after the trim');
  const R16 = witness('FIX'); R16.setup.activateSnooker = false;
  leg('J SETUP INVALID "setup: activateSnooker refused" [constructed reason]', V.legSETUP(R16), 'INVALID', 'setup: activateSnooker refused');
  const R17 = witness('FIX'); R17.setup.S.durs = 'x';
  leg('J malformed state -> INVALID reading missing', V.legL1(R17), 'INVALID', 'reading missing: setup.S.durs');
  ok('J boot line: archive-armed unreadable when the read is not boolean',
    V.formatBootMode({ url: 'u', archiveArmed: undefined, twoClock: null, speed: null, webcodecs: false }).startsWith('DVR864 boot-mode u archive-armed unreadable twoClock null speed null webcodecs false | seams: '));
  const none = V.outputPlan(undefined, witness('FIX'), FIX_RUN);
  ok('J outputPlan without OB_DVR864_OUT: no files, a note', none.files.length === 0 && none.note.includes('OB_DVR864_OUT unset'), J(none));
  const two = V.outputPlan('/x/out/', witness('FIX'), FIX_RUN);
  const docR = JSON.parse(two.files[0].text), docC = JSON.parse(two.files[1].text);
  ok('J outputPlan with a dir: readings-864.json + control-states-864.json, schemas and verdicts',
    two.files.map((f) => f.path).join(',') === '/x/out/readings-864.json,/x/out/control-states-864.json'
    && docR.schema === 'dvr864-readings/1' && docR.verdicts.length === 19 && docC.schema === 'dvr864-control-states/1', two.files.map((f) => f.path).join(','));
  ok('J readings round-trip through JSON and give the same verdicts', J(V.runAll(docR.readings, { controlBaseline: MAIN_CTRL_DOC }).lines) === J(FIX_RUN.lines));
  ok('J runAll is pure: two runs on one object give identical lines', J(V.runAll(witness('MAIN')).lines) === J(MAIN_RUN.lines));
}

// ---- K. lens fold: L4-beat repeats L4 for every k (card :497, :456-461); the dump path
{
  const L = legsBy(MAIN_RUN);
  const p4 = L['L4-beat'].print;
  ok('K MAIN L4-beat print: k0 playF 203 f 155 (L4b k0 as w5:21), k1 298/298 playF 238 f 165 (w5:26), k2 L4a 139',
    /k0 tail 0\.25 .*ex\.frames 218 res\.segments\[0\] 218 .*playF 203 f\(lo\) 155 f\(hi\) 155/.test(p4)
    && /k1 tail 1 .*ex\.frames 298 res\.segments\[1\] 298 .*x 2\.749541 playF 238 f\(lo\) 165 f\(hi\) 165/.test(p4)
    && /k2 tail 0\.5 .*ex\.frames 139 res\.segments\[2\] 139$/.test(p4), p4);
  const F = legsBy(FIX_RUN);
  ok('K FIX L4-beat print: k0 playF 203 f 203, k1 playF 238 f 238 (w5:42)',
    /k0 .*playF 203 f\(lo\) 203 f\(hi\) 203/.test(F['L4-beat'].print) && /k1 .*playF 238 f\(lo\) 238 f\(hi\) 238/.test(F['L4-beat'].print), F['L4-beat'].print);
  // a tree red only at k 0 in the beat state (k 1 green) is caught [constructed: FIX with main's k0 bracket]
  const R1 = witness('FIX');
  R1.l4beat.brackets[0] = { k: 0, lo: 2.5766688464185594, hi: 2.576669, steps: 24 }; // w5:19 main k0 values
  leg('K L4-beat FAIL at k 0 alone "segment 0 live switch vs export play end" [constructed]', V.legL4beat(R1), 'FAIL', 'segment 0 live switch vs export play end');
  const R2 = witness('FIX'); R2.l4beat.res.segments[2] = 140;
  const r2 = V.legL4beat(R2);
  leg('K L4-beat FAIL at the last segment "segment 2 export frames" (L4a runs every k) [constructed]', r2, 'FAIL', 'segment 2 export frames');
  ok('K L4-beat L4a red prints the timeline beats', /; opts\.beats \[null,\{"beatSec":1\},null\] timeline beats unreadable$/.test(r2.print), r2.print);
  const R3 = witness('FIX'); R3.l4beat.brackets = R3.l4beat.brackets.filter((b) => b.k !== 0);
  leg('K L4-beat INVALID on a missing k 0 bracket, never PASS', V.legL4beat(R3), 'INVALID', 'reading missing: l4beat.brackets[k=0]');
  const R4 = witness('FIX'); R4.l4beat.bracket = R4.l4beat.brackets[1]; delete R4.l4beat.brackets;
  leg('K L4-beat INVALID when only the old single k = 1 bracket is read', V.legL4beat(R4), 'INVALID', 'reading missing: l4beat.brackets');
  const R5 = witness('FIX'); R5.l4beat.brackets[0] = { k: 0, lo: null, hi: null, steps: 3, err: 'strikeLive() null at T 1' };
  leg('K L4-beat INVALID on a page bracket error (lo/hi null)', V.legL4beat(R5), 'INVALID', 'reading missing: l4beat.brackets[k=0]');
  // L5 on main: the card's split x_j > h + 1e-6 puts j1-j3 in L5b and j4-j8 in L5a (card :569-570)
  const rows5 = [...L.L5.print.matchAll(/j(\d) (L5[ab]) T /g)].map((m) => `${m[1]}${m[2]}`);
  ok('K MAIN L5 split: j1-j3 L5b (inside), j4-j8 L5a (past h 0.5 + 1e-6)',
    J(rows5) === J(['1L5b', '2L5b', '3L5b', '4L5a', '5L5a', '6L5a', '7L5a', '8L5a']) && / h 0\.5 /.test(L.L5.print), J(rows5));
  // the dump path: a non-absolute OB_DVR864_OUT is refused (the launcher cds into the read-only export)
  for (const rel of ['out', './out', '../probe', 'probe/scratch/']) {
    const pl = V.outputPlan(rel, witness('FIX'), FIX_RUN);
    ok(`K outputPlan refuses the relative dir ${J(rel)}: no files, refused, a note`,
      pl.files.length === 0 && pl.refused === true && pl.dir === null && pl.note === `DVR864 note: OB_DVR864_OUT ${J(rel)} is not an absolute path; readings-864.json and control-states-864.json not written`, J(pl));
  }
  const un = V.outputPlan('', witness('FIX'), FIX_RUN);
  ok('K outputPlan with OB_DVR864_OUT empty: unset note, not refused', un.files.length === 0 && !un.refused && un.note.includes('OB_DVR864_OUT unset'), J(un));
  const ab = V.outputPlan('/x/out//', witness('FIX'), FIX_RUN);
  ok('K outputPlan normalizes an absolute dir: dir /x/out, not refused', ab.dir === '/x/out' && !ab.refused && ab.files[0].path === '/x/out/readings-864.json', J({ dir: ab.dir, p: ab.files.map((f) => f.path) }));
  const rt = V.outputPlan('/', witness('FIX'), FIX_RUN);
  ok('K outputPlan with "/": paths /readings-864.json, /control-states-864.json (the write, not the plan, fails)',
    rt.dir === '/' && rt.files.map((f) => f.path).join(',') === '/readings-864.json,/control-states-864.json', J({ dir: rt.dir, p: rt.files.map((f) => f.path) }));
}

if (process.env.OB_DVR864_PRINT === '1') {
  console.log('--- MAIN-shaped runAll lines');
  for (const s of MAIN_RUN.lines) console.log(s);
  console.log('--- FIX-shaped runAll lines (baseline: MAIN control states)');
  for (const s of FIX_RUN.lines) console.log(s);
}
console.log(bad ? `DVR864-VERDICT SELFTEST FAIL (${bad} of ${n})` : `DVR864-VERDICT SELFTEST PASS (${n})`);
process.exitCode = bad ? 1 : 0;
