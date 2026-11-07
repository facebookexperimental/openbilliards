// Copyright (c) Meta Platforms, Inc. and affiliates.

// dvr864-verdict.mjs — the NODE verdict module of the DESIGN-864 section 5 probe
// ("Measurement of record", DESIGN-864.md lines 405-651; rulings 12-13 in
// RULINGS-864.md). Pure ES module: no I/O, no browser, no clock, no random.
// The page only READS values and returns them by value (the fg-analyze
// pattern); every PASS/FAIL/INVALID is decided here.
//
// planPlayback / TAIL_SEC / FDT are imported from the repository's own
// web/app/framestep.js, never restated.
// fadeS is RESTATED from playback.js:4687-4688 (the card says "restated").
//
// ============================== READINGS CONTRACT ==============================
// One object R (JSON). Every number is the page's double passed by value
// (JSON round-trips doubles exactly). S-shaped objects are
// window.__playback.state() by value (playback.js:12074-12100): at least
//   { speed, total, durs[], cum[], beats[], tails[], completions[], leads[] }
// (beats[k] is the live beat's beatSec or null, :12089).
// "cuts" is window.__playback.getCutPlan().cuts by value (:12140).
// "strikeLive read" is { seg, beat } copied from window.__playback.strikeLive()
// (:12242-12254) after window.__playback.seek(T).
//
// R.meta        { tree: string, url?: string }  free text; tree names the build
//               (e.g. 'main-0e6b7a33'); copied into the control-states doc.
// R.boot        read once in the second boot before Setup:
//   .url          location.href
//   .archiveArmed window.__archive.enabled() (archive.js:601 armed; :82 the
//                 disarmed seam returns false); null = unreadable
//   .twoClock     window.__test.twoClock (main.js:2037); null = unset
//   .speed        window.__playback.state()?.speed (:12078); null before a
//                 session is open (state() is null while pb is null)
//   .webcodecs    (await __export.open().then(() => __export.support())).webcodecs
//                 (export.js:1270; the suite's own idiom e2e-export-z2.mjs:57)
// R.setup       Setup steps 1-5 on the witness session:
//   .activateSnooker  return of window.__rules.activateSnooker('wpbsa-snooker')
//   .rows         [{ v0, err }] the three S2p rows in firing order; err = the
//                 __test.shoot return (null/'' when accepted)
//   .flush        return of await window.__archive.flush()
//   .sidW         (await window.__archive.sessions())[0]?.id  (null/undefined kept)
//   .current      window.__archive.current() (archive.js:620)
//   .sessionsIds  the first three sessions() ids
//   .S0           state() right after openSession(sid_w) (Setup 4); null if none
//   .emptyPlanOk  return of setCutPlan({ cuts: [], poses: [] }) (Setup 5)
//   .S            state() re-read after Setup 5 — THE witness state for L0-L4
//                 and the L6 precondition
//   .planFades    plan().opts.fades after Setup 5 (by value; null if absent)
// R.l2          { brackets: [{ k, lo, hi, steps }] } — for every k < n-1 the
//               24-step bisection over [S.cum[k], S.cum[k+1]] with predicate
//               strikeLive().seg > k, in the Setup-5 state
// R.l3          { reads: [{ k, T, seg, dur }] } — for every k < n-1:
//               T = S.cum[k] + E_k - 0.01 (the page computes it; node re-checks
//               it bit-exact), seg/dur = strikeLive().seg/.dur after seek(T)
// R.l4          L4 in the Setup-5 state:
//   .plan         { recordsLength, opts } — P = plan() (:12173); opts by value
//                 (slowmo, trims, beats, tailSec, leads, fades ...)
//   .res          { montageRate, segments } from renderDrill(P.records, ...)
//                 (offline-render.js:2546 segments, :3296 montageRate)
//   .error        string when renderDrill threw, else null
//   .timelineBeats optional: whatever the page can read of the export's
//                 planned beats (printed when L4a fails; 'unreadable' if absent)
// R.l2b         L2b state (MOVE-seam plan):
//   .ok           return of setCutPlan({ cuts: [{seg:1,t:0,cam:2},
//                 {seg:2,t:0,cam:2,transitionIn:1}], poses: [] })
//   .cuts         getCutPlan().cuts after the call (node finds c2 itself)
//   .S            state() re-read after the call
//   .lo0, .hi0    the bracket ends the page used (node re-derives them)
//   .atLo0, .atHi0 strikeLive reads at lo0 / hi0
//   .bracket      { lo, hi, steps } 24-step bisection, predicate
//                 sl.seg === 1 && sl.beat === true; null if not run
// R.l2c         { walkSpec } — window.__playback.walkSpec(1) by value (null ok)
//               read in the L2b state
// R.l4beat      L4 repeated in the L2b state (card :497 "Repeat L4 in this
//               state": L4a for every k, L4b for every k < n-1): { plan, res,
//               error, timelineBeats, brackets: [{ k, lo, hi, steps }] } where
//               brackets is L2's bisection for every k < n-1 (predicate
//               seg > k over [S.cum[k], S.cum[k+1]]) in this state
// R.l5          { tS, fade: { ok, cuts, S, planFades }, base: { ok, cuts, S,
//               planFades }, samples: [{ j, T, a, b }] } — a = fadeAlphaAt(T)
//               under the fade plan, b under the baseline (:12155); T as the
//               page computed it (node re-derives T_j bit-exact)
// R.l6          { plan: { ok, cuts, S }  (L2b's plan re-applied),
//                 trimArg, trimOk, S (after setTrim), P: { recordsLength, opts },
//                 res: { montageRate, segments }, error }
// R.ctrl        the positive control:
//   .closeState   window.__test.state() after __playback.close() (the wait)
//   .activateOk   return of the second activateSnooker
//   .rows         [{ v0, err }] the three 2.5 rows
//   .flush        return of the flush
//   .sidC         window.__archive.current()
//   .sessionsIds  the first three sessions() ids
//   .S0           state() right after openSession(sid_c) (Setup 4 on the control)
//   .emptyPlanOk  setCutPlan(empty) return on the control (Setup 5)
//   .S            state() re-read after Setup 5 on the control: THE control
//                 state for L0-control and C-empty
//   .empty        { stateJson, planJson } after Setup 5 on the control;
//                 stateJson = JSON.stringify({durs, cum, total, tails, beats,
//                 leads}) and planJson = JSON.stringify(plan()), BOTH computed
//                 in the page (byte-exact strings)
//   .beat         { ok, cuts, S, stateJson, planJson, walkSpec, walkSpecJson,
//                 lo0, hi0, atLo0, atHi0, bracket }  (L2b's plan + guards)
//   .trim         { trimArg, trimOk, S, stateJson, planJson }
// A missing field makes its leg INVALID "reading missing: <path>", never PASS.
//
// runAll(R, { controlBaseline }) — controlBaseline is controlStates() of the OTHER tree (the
// head tree when this R is main, or main when this R is the head tree): that tree's
// control-states-864.json, passed via OB_DVR864_CONTROL_BASELINE. Without it C-empty / C-beat /
// C-trim are INVALID "compare deferred: no baseline supplied (OB_DVR864_CONTROL_BASELINE unset);
// state captured" (a constructed, non-blocking reason: the state is captured, the compare is
// the card's cross-tree step). DEPS below is the dependency map; a leg whose upstream gate is
// closed prints INVALID "depends on <LEG>: <root reason>".
// ===============================================================================
import { planPlayback, TAIL_SEC, FDT } from '../../app/framestep.js';
import { isAbsolute } from 'node:path';

export { planPlayback, TAIL_SEC, FDT };

export const LEGS = ['SETUP', 'L0', 'L1', 'L2', 'L3', 'L4a', 'L4b', 'L2b', 'L2c', 'L4-beat',
  'L5', 'L6', 'L6a', 'L6b', 'CTRL-SPLIT', 'L0-control', 'C-empty', 'C-beat', 'C-trim'];

// the card's tolerances, leg by leg
export const TOL = {
  L1: 1e-9, // "within 1e-9" (L1)
  L2: 1e-3, // "x = E_k ± 1e-3" (L2)
  L2b: 1e-3, // "Math.abs(hi - (S.cum[1] + E_1)) <= 1e-3" (L2b law)
  L5aWindow: 1e-6, // "x_j > h + 1e-6" (L5a)
  L5b: 1e-9, // "Math.abs(a_j - Math.max(b_j, w_j)) <= 1e-9" (L5b)
  // L2c, L6a, L6b, L4a, L4b, L3, L0, L0-control, C-*: exact ===
};

// fadeS RESTATED from web/app/playback.js:4687-4688 (main 67855b4f = 0e6b7a33):
//   const fadeS = (u) => (u <= 0 ? 0 : u >= 1 ? 1
//     : u * u * u * (u * (6 * u - 15) + 10));
export const fadeS = (u) => (u <= 0 ? 0 : u >= 1 ? 1
  : u * u * u * (u * (6 * u - 15) + 10));

// E_k = Math.max(S.durs[k] + S.tails[k], S.completions[k]) (card L1)
export const Ek = (S, k) => Math.max(S.durs[k] + S.tails[k], S.completions[k]);

// ------------------------------------------------------------------ helpers
class Missing extends Error {
  constructor(path) { super(`reading missing: ${path}`); this.path = path; }
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// need(R, 'a.b.c') -> the value, or throw Missing (null/undefined are missing)
function need(R, path) {
  let v = R;
  for (const key of path.split('.')) {
    if (v === null || v === undefined) throw new Missing(path);
    v = v[key];
  }
  if (v === null || v === undefined) throw new Missing(path);
  return v;
}
// a state() object with the fields the legs read, all arrays of equal length
function needS(R, path) {
  const S = need(R, path);
  const n = Array.isArray(S.durs) ? S.durs.length : -1;
  if (n < 1) throw new Missing(`${path}.durs`);
  for (const f of ['cum', 'beats', 'tails', 'completions', 'leads']) {
    if (!Array.isArray(S[f]) || S[f].length !== n) throw new Missing(`${path}.${f}`);
  }
  for (const f of ['total', 'speed']) if (!isNum(S[f])) throw new Missing(`${path}.${f}`);
  return S;
}
export function fmt(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
const out = (verdict, why, print, extra = {}) => ({ verdict, why, print, ...extra });
const PASS = (print, extra) => out('PASS', 'ok', print, extra);
const FAIL = (why, print, extra) => out('FAIL', why, print, extra);
const INVALID = (why, print, extra) => out('INVALID', why, print, extra);
// wrap a leg: a Missing reading or any thrown error is INVALID, never PASS
const guarded = (fn) => (R, ctx = {}) => {
  try { return fn(R, ctx); } catch (e) {
    if (e instanceof Missing) return INVALID(e.message, '');
    return INVALID(`verdict error: ${e && e.message ? e.message : String(e)}`, '');
  }
};
const allNull = (a) => Array.isArray(a) && a.every((b) => b === null);
const keptB = (fades) => (Array.isArray(fades) ? fades : []).filter((f) => f && f.b === 1).map((f) => f.i);
// the card's L2b predicate over a strikeLive read
export const beatPred = (sl) => !!sl && sl.seg === 1 && sl.beat === true;
// L4 step 3: tail_k (offline-render.js:2890-2891 and :2791; framestep.js:16)
export function tailK(P, k, n) {
  const o = P.opts ?? {};
  return k === n - 1 ? TAIL_SEC : (o.beats?.[k] ? o.beats[k].beatSec : (o.tailSec ?? 0.25));
}
// L4 step 4: ex = planPlayback({...}) exactly as the export calls it (offline-render.js:1245-1249)
export function exFor(S, P, k, tail) {
  const o = P.opts;
  return planPlayback({ duration: Ek(S, k), slowmo: o.slowmo, startT: o.trims[k].startT ?? 0,
    endT: o.trims[k].endT ?? null, tailSec: tail, headSec: o.leads?.[k]?.sec ?? 0, maxSec: Infinity });
}
// L4b: playF and the live-side f(y)
export const playFOf = (ex, P) => Math.ceil((ex.playSec - ex.startSec) / (FDT * P.opts.slowmo));
export const fLive = (y, S, k, ex) => Math.ceil((y - S.cum[k] - (S.beats[k] ?? 0) - ex.startSec) / (FDT * S.speed));
// L2b bracket ends (card: lo0 = S.cum[1], hi0 = S.cum[2] - S.leads[2] - S.beats[1] / 2)
export const l2bEnds = (S) => ({ lo0: S.cum[1], hi0: S.cum[2] - S.leads[2] - S.beats[1] / 2 });
// L2b's guards over a { ok, cuts, S } plan state; returns null when they hold
function l2bGuard(st, path) {
  if (st.ok !== true) return 'L2b plan refused';
  const cuts = Array.isArray(st.cuts) ? st.cuts : null;
  if (!cuts) throw new Missing(`${path}.cuts`);
  const c2 = cuts.find((x) => x.seg === 2 && x.t === 0);
  if (!c2) return 'L2b seam missing';
  if (c2.transitionIn !== 1) return 'L2b seam downgraded: beatFor(1, durs[1]) null';
  const S = needS(st, 'S');
  if (!(S.beats[1] > 0)) return 'L2b beat gated: twoClock';
  return null;
}
const c2Of = (st) => (Array.isArray(st?.cuts) ? st.cuts.find((x) => x.seg === 2 && x.t === 0) ?? null : null);

// ------------------------------------------------------------------ boot line
// printed once in the second boot before Setup; seams named in the line
export function formatBootMode(boot) {
  const b = boot ?? {};
  const armed = b.archiveArmed === true ? 'true' : b.archiveArmed === false ? 'false' : 'unreadable';
  return `DVR864 boot-mode ${fmt(b.url ?? null)} archive-armed ${armed} twoClock ${fmt(b.twoClock ?? null)}`
    + ` speed ${fmt(b.speed ?? null)} webcodecs ${fmt(b.webcodecs ?? null)}`
    + ' | seams: url=location.href; archive-armed=window.__archive.enabled() (archive.js:601; disarmed seam :82);'
    + ' twoClock=window.__test.twoClock (main.js:2037); speed=window.__playback.state()?.speed (playback.js:12078; null before a session opens);'
    + ' webcodecs=__export.support().webcodecs after __export.open() (export.js:1270; e2e-export-z2.mjs:57 idiom)';
}

// ------------------------------------------------------------------ legs
const WITNESS_V0 = [0.94, 0.935, 2.5];
const CONTROL_V0 = [2.5, 2.5, 2.5];
function rowsProblem(rows, want, path) {
  if (!Array.isArray(rows)) throw new Missing(path);
  const v0s = rows.map((r) => r?.v0);
  if (rows.length !== want.length || v0s.some((v, i) => v !== want[i])) return `rows are not v0 ${want.join(', ')}`;
  const bad = rows.find((r) => r.err);
  return bad ? `row v0=${bad.v0} shoot rejected` : null;
}

// SETUP: Setup steps 1-5 (card "Setup.")
export const legSETUP = guarded((R) => {
  const s = need(R, 'setup');
  const S = s.S ?? null;
  const print = `activateSnooker ${fmt(s.activateSnooker)} rows ${fmt((s.rows ?? []).map((r) => [r?.v0, r?.err ?? null]))}`
    + ` flush ${fmt(s.flush)} sid_w ${fmt(s.sidW)} current ${fmt(s.current)} sessions ${fmt(s.sessionsIds ?? null)}`
    + ` emptyPlan ${fmt(s.emptyPlanOk)} beats ${fmt(S ? S.beats : null)}`;
  if (s.activateSnooker !== true) return INVALID('setup: activateSnooker refused', print);
  const rp = rowsProblem(s.rows, WITNESS_V0, 'setup.rows');
  if (rp) return INVALID(`setup: ${rp}`, print);
  if (s.sidW === null || s.sidW === undefined) return INVALID('no witness session', print);
  if (!S) return INVALID('setup: state() null after openSession', print);
  needS(R, 'setup.S');
  if (s.emptyPlanOk !== true || !allNull(S.beats)) return INVALID('plan seed not cleared', print);
  return PASS(print);
});

// L0, witness (derived, never assumed)
export const legL0 = guarded((R) => {
  const S = needS(R, 'setup.S');
  const print = `durs ${fmt(S.durs)} tails ${fmt(S.tails)} completions ${fmt(S.completions)} leads ${fmt(S.leads)}`
    + ` kept reset boundaries ${fmt(keptB(R.setup.planFades))}`;
  if (S.durs.length !== 3) return INVALID('not one session', print);
  const why = [];
  for (const k of [0, 1]) if (!(S.completions[k] > S.durs[k] + S.tails[k])) why.push(`row ${k} is not a witness`);
  if (S.completions[2] !== S.durs[2]) why.push('row 2 is not a control');
  return why.length ? FAIL(why.join('; '), print) : PASS(print);
});

// L1, schedule law (1e-9); FAIL name constructed (the card names the k only)
export const legL1 = guarded((R) => {
  const S = needS(R, 'setup.S');
  const n = S.durs.length;
  const bad = [], parts = [];
  for (let k = 0; k < n - 1; k++) {
    const lhs = S.cum[k + 1] - S.leads[k + 1] - S.cum[k] - (S.beats[k] ?? 0);
    const e = Ek(S, k);
    if (!(Math.abs(lhs - e) <= TOL.L1)) bad.push(k);
    parts.push(`k${k} span ${fmt(lhs)} E_k ${fmt(e)}`);
  }
  const totalExp = S.cum[n - 1] + Ek(S, n - 1) + (S.beats[n - 1] ?? 0);
  const okT = Math.abs(S.total - totalExp) <= TOL.L1;
  const print = `cum ${fmt(S.cum)} ${parts.join('; ')}; total ${fmt(S.total)} vs ${fmt(totalExp)}`;
  if (bad.length || !okT) {
    return FAIL(`schedule law fails at${bad.length ? ` k [${bad.join(',')}]` : ''}${okT ? '' : ' total'}`, print);
  }
  return PASS(print);
});

// L2, switch time (1e-3); FAIL name constructed
export const legL2 = guarded((R) => {
  const S = needS(R, 'setup.S');
  const n = S.durs.length;
  const brs = need(R, 'l2.brackets');
  const bad = [], parts = [];
  for (let k = 0; k < n - 1; k++) {
    const b = brs.find((x) => x && x.k === k);
    if (!b || !isNum(b.lo) || !isNum(b.hi)) throw new Missing(`l2.brackets[k=${k}]`);
    const x = b.hi - S.cum[k] - (S.beats[k] ?? 0);
    const e = Ek(S, k);
    if (!(Math.abs(x - e) <= TOL.L2)) bad.push(k);
    parts.push(`k${k} [${fmt(b.lo)}, ${fmt(b.hi)}] steps ${fmt(b.steps ?? null)} x ${fmt(x)} vs E_k ${fmt(e)} (durs+tails ${fmt(S.durs[k] + S.tails[k])})`);
  }
  const print = parts.join('; ');
  return bad.length ? FAIL(`switch x is not E_k at k [${bad.join(',')}]`, print) : PASS(print);
});

// L3, owning record (exact); FAIL name constructed
export const legL3 = guarded((R) => {
  const S = needS(R, 'setup.S');
  const n = S.durs.length;
  const reads = need(R, 'l3.reads');
  const bad = [], parts = [];
  for (let k = 0; k < n - 1; k++) {
    const r = reads.find((x) => x && x.k === k);
    if (!r) throw new Missing(`l3.reads[k=${k}]`);
    const T = S.cum[k] + Ek(S, k) - 0.01;
    if (r.T !== T) return INVALID('L3 probe T is not S.cum[k] + E_k - 0.01', `k${k} page T ${fmt(r.T)} node T ${fmt(T)}`);
    if (!(r.seg === k && r.dur === S.durs[k])) bad.push(k);
    parts.push(`k${k} T ${fmt(T)} seg ${fmt(r.seg)} dur ${fmt(r.dur)} durs[k] ${fmt(S.durs[k])}`);
  }
  const print = parts.join('; ');
  return bad.length ? FAIL(`owning record is not k at k [${bad.join(',')}]`, print) : PASS(print);
});

// L4 step 2 preconditions ("else INVALID"; the card names no reason: constructed)
function l4Pre(R, path, S) {
  const blk = need(R, path);
  if (blk.error) return { why: `renderDrill threw: ${blk.error}` };
  const P = need(R, `${path}.plan`);
  const o = need(R, `${path}.plan.opts`);
  const res = need(R, `${path}.res`);
  if (!Array.isArray(o.trims)) throw new Missing(`${path}.plan.opts.trims`);
  if (res.montageRate !== 1) return { why: 'export precondition: res.montageRate is not 1', P, res };
  if (P.recordsLength !== S.durs.length) return { why: 'export precondition: P.records.length is not S.durs.length', P, res };
  if (o.slowmo !== S.speed) return { why: 'export precondition: P.opts.slowmo is not S.speed', P, res };
  if (!Array.isArray(res.segments)) throw new Missing(`${path}.res.segments`);
  return { why: null, P, res, blk };
}
const preLine = (pre, S) => `montageRate ${fmt(pre.res?.montageRate)} records ${fmt(pre.P?.recordsLength)}`
  + ` slowmo ${fmt(pre.P?.opts?.slowmo)} speed ${fmt(S.speed)}`;

// L4a (exact): res.segments[k] === ex.frames for every k
export const legL4a = guarded((R) => {
  const S = needS(R, 'setup.S');
  const pre = l4Pre(R, 'l4', S);
  if (pre.why) return INVALID(pre.why, preLine(pre, S));
  const n = S.durs.length;
  const bad = [], parts = [];
  for (let k = 0; k < n; k++) {
    const tail = tailK(pre.P, k, n);
    const ex = exFor(S, pre.P, k, tail);
    const seg = pre.res.segments[k];
    if (seg !== ex.frames) bad.push(k);
    parts.push(`k${k} tail ${fmt(tail)} E_k ${fmt(Ek(S, k))} ex.frames ${fmt(ex.frames)} res.segments ${fmt(seg)}`);
  }
  let print = `${preLine(pre, S)}; ${parts.join('; ')}`;
  if (bad.length) {
    print += `; opts.beats ${fmt(pre.P.opts.beats ?? null)} timeline beats ${fmt(pre.blk.timelineBeats ?? 'unreadable')}`;
    return FAIL(bad.map((k) => `segment ${k} export frames`).join('; '), print);
  }
  return PASS(print);
});

// L4b (exact, grid-ambiguous INVALID): f(lo) === f(hi) === playF_k for every k < n-1
export const legL4b = guarded((R) => {
  const S = needS(R, 'setup.S');
  const pre = l4Pre(R, 'l4', S);
  if (pre.why) return INVALID(pre.why, preLine(pre, S));
  const n = S.durs.length;
  const brs = need(R, 'l2.brackets');
  const fails = [], amb = [], parts = [];
  for (let k = 0; k < n - 1; k++) {
    const b = brs.find((x) => x && x.k === k);
    if (!b || !isNum(b.lo) || !isNum(b.hi)) throw new Missing(`l2.brackets[k=${k}]`);
    const tail = tailK(pre.P, k, n);
    const ex = exFor(S, pre.P, k, tail);
    const playF = playFOf(ex, pre.P);
    const ident = ex.frames - ex.headFrames - Math.round(tail * 60);
    const fl = fLive(b.lo, S, k, ex), fh = fLive(b.hi, S, k, ex);
    if (fl !== fh) amb.push(k); else if (fl !== playF) fails.push(k);
    parts.push(`k${k} ex.frames ${fmt(ex.frames)} playF ${fmt(playF)} (identity ${fmt(ident)}) f(lo) ${fmt(fl)} f(hi) ${fmt(fh)}`);
  }
  const print = parts.join('; ');
  if (fails.length) return FAIL(fails.map((k) => `segment ${k} live switch vs export play end`).join('; '), print);
  if (amb.length) return INVALID('grid-ambiguous', `${print}; ambiguous k [${amb.join(',')}]`);
  return PASS(print);
});

// L2b, beat variant: guards (INVALID, never FAIL), bracket, law (1e-3)
export const legL2b = guarded((R) => {
  const st = need(R, 'l2b');
  const c2 = c2Of(st);
  const beats = st.S?.beats ?? null;
  const head = `plan ${fmt(st.ok)} c2 ${fmt(c2)} beats ${fmt(beats)} twoClock(boot) ${fmt(R.boot?.twoClock ?? null)}`;
  const g = l2bGuard(st, 'l2b');
  if (g) return INVALID(g, head, { gate: false });
  const S = needS(R, 'l2b.S');
  const { lo0, hi0 } = l2bEnds(S);
  if (st.lo0 !== lo0 || st.hi0 !== hi0) {
    return INVALID('L2b bracket ends are not the card\'s', `${head}; page lo0 ${fmt(st.lo0)} hi0 ${fmt(st.hi0)} node lo0 ${fmt(lo0)} hi0 ${fmt(hi0)}`, { gate: true });
  }
  const pl = beatPred(st.atLo0), ph = beatPred(st.atHi0);
  const ends = `lo0 ${fmt(lo0)} pred ${pl} (${fmt(st.atLo0 ?? null)}) hi0 ${fmt(hi0)} pred ${ph} (${fmt(st.atHi0 ?? null)})`;
  if (pl || !ph) return INVALID('no beat window', `${head}; ${ends}`, { gate: true });
  const br = need(R, 'l2b.bracket');
  if (!isNum(br.lo) || !isNum(br.hi)) throw new Missing('l2b.bracket.lo/hi');
  const target = S.cum[1] + Ek(S, 1);
  const print = `${head}; ${ends}; bracket [${fmt(br.lo)}, ${fmt(br.hi)}] steps ${fmt(br.steps ?? null)}`
    + ` cum[1] + E_1 ${fmt(target)} cum[1] + durs[1] ${fmt(S.cum[1] + S.durs[1])} |hi - target| ${fmt(Math.abs(br.hi - target))}`;
  return Math.abs(br.hi - target) <= TOL.L2b ? PASS(print, { gate: true })
    : FAIL('L2b beat flips at hi, not cum[1] + E_1', print, { gate: true });
});

// L2c, beat camera departure (exact): walkSpec(1).moves.at(-2).t0 === E_1
export const legL2c = guarded((R) => {
  const S = needS(R, 'l2b.S');
  const blk = need(R, 'l2c');
  const m = blk.walkSpec?.moves;
  if (!Array.isArray(m)) return INVALID('no walk spec', `walkSpec(1) ${fmt(blk.walkSpec ?? null)}`);
  const p = m.at(-2), d = m.at(-1);
  if (!(m.length >= 2 && p?.kind === 'pose' && d?.kind === 'dolly')) {
    return INVALID('walk shape', `last two kinds ${fmt([p?.kind ?? null, d?.kind ?? null])}`);
  }
  const E1 = Ek(S, 1);
  const print = `pose t0 ${fmt(p.t0)} t1 ${fmt(p.t1)} dolly t0 ${fmt(d.t0)} t1 ${fmt(d.t1)} durs[1] ${fmt(S.durs[1])} E_1 ${fmt(E1)}`;
  return p.t0 === E1 ? PASS(print) : FAIL('L2c walk departs at t0, not E_1', print);
});

// L4-beat: L4 repeated in the L2b state (card :497 "Repeat L4 in this state with
// tail_1 = P.opts.beats[1].beatSec"). "Repeat L4" is read literally: L4a for every k
// and L4b for every k < n-1 (card :456-461), tail_k by L4 step 3 (card :455), which
// gives tail_1 = P.opts.beats[1].beatSec on the beat segment. The card's node lines
// (:498-499) print k = 1 only; k != 1 runs the same law on this state's inputs.
export const legL4beat = guarded((R) => {
  const S = needS(R, 'l2b.S');
  const pre = l4Pre(R, 'l4beat', S);
  if (pre.why) return INVALID(pre.why, preLine(pre, S));
  const b1 = pre.P.opts.beats?.[1];
  if (!b1) return INVALID('L4-beat: the plan carries no beat on segment 1', `${preLine(pre, S)} opts.beats ${fmt(pre.P.opts.beats ?? null)}`);
  const n = S.durs.length;
  const brs = need(R, 'l4beat.brackets');
  if (!Array.isArray(brs)) throw new Missing('l4beat.brackets');
  const badA = [], fails = [], amb = [], parts = [];
  for (let k = 0; k < n; k++) {
    const tail = tailK(pre.P, k, n);
    const ex = exFor(S, pre.P, k, tail);
    const seg = pre.res.segments[k];
    if (seg !== ex.frames) badA.push(k);
    let part = `k${k} tail ${fmt(tail)} E_k ${fmt(Ek(S, k))} ex.frames ${fmt(ex.frames)} res.segments[${k}] ${fmt(seg)}`;
    if (k < n - 1) {
      const b = brs.find((x) => x && x.k === k);
      if (!b || !isNum(b.lo) || !isNum(b.hi)) throw new Missing(`l4beat.brackets[k=${k}]`);
      const playF = playFOf(ex, pre.P);
      const fl = fLive(b.lo, S, k, ex), fh = fLive(b.hi, S, k, ex);
      const x = b.hi - S.cum[k] - (S.beats[k] ?? 0);
      if (fl !== fh) amb.push(k); else if (fl !== playF) fails.push(k);
      part += ` bracket [${fmt(b.lo)}, ${fmt(b.hi)}] steps ${fmt(b.steps ?? null)} x ${fmt(x)} playF ${fmt(playF)} f(lo) ${fmt(fl)} f(hi) ${fmt(fh)}`;
    }
    parts.push(part);
  }
  let print = `${preLine(pre, S)} opts.beats[1].beatSec ${fmt(b1.beatSec)}; ${parts.join('; ')}`;
  if (badA.length) print += `; opts.beats ${fmt(pre.P.opts.beats ?? null)} timeline beats ${fmt(pre.blk.timelineBeats ?? 'unreadable')}`;
  const why = [...badA.map((k) => `segment ${k} export frames`), ...fails.map((k) => `segment ${k} live switch vs export play end`)];
  if (why.length) return FAIL(why.join('; '), print);
  if (amb.length) return INVALID('grid-ambiguous', `${print}; ambiguous k [${amb.join(',')}]`);
  return PASS(print);
});

// L5, fade clock (ruling 10 = F1): differential against the baseline plan
const L5_STATE_KEYS = ['durs', 'cum', 'total', 'tails', 'leads'];
const pickJson = (S, keys) => JSON.stringify(Object.fromEntries(keys.map((k) => [k, S[k]])));
export function l5Sample(S, c, j, T) {
  const E1 = Ek(S, 1);
  const Texp = S.cum[1] + S.durs[1] + j * (E1 - S.durs[1]) / 8;
  const tA = c.t / 100, h = c.dur / 200;
  const x = (T - S.cum[1] - tA) / S.speed;
  const w = Math.abs(x) < h ? fadeS(1 - Math.abs(x) / h) : 0;
  return { Texp, tA, h, x, w, past: x > h + TOL.L5aWindow };
}
export const legL5 = guarded((R) => {
  const blk = need(R, 'l5');
  const fade = need(R, 'l5.fade'), base = need(R, 'l5.base');
  if (fade.ok !== true) return INVALID('L5 fade plan refused', `fade ${fmt(fade.ok)}`);
  const c = (Array.isArray(fade.cuts) ? fade.cuts : []).find((x) => x.seg === 1);
  if (!c || c.transitionIn !== 2) return INVALID('L5 fade cut not stored as transitionIn 2', `c ${fmt(c ?? null)}`);
  if (base.ok !== true) return INVALID('L5 baseline plan refused', `base ${fmt(base.ok)}`);
  const cb = (Array.isArray(base.cuts) ? base.cuts : []).find((x) => x.seg === 1 && x.t === c.t);
  if (!cb || cb.transitionIn !== 0) return INVALID('L5 baseline cut not stored as transitionIn 0 at the same (seg, t)', `cb ${fmt(cb ?? null)}`);
  const Sf = needS(R, 'l5.fade.S'), Sb = needS(R, 'l5.base.S');
  if (!allNull(Sf.beats) || !allNull(Sb.beats)) return INVALID('L5 states carry a beat', `beats ${fmt(Sf.beats)} / ${fmt(Sb.beats)}`);
  if (pickJson(Sf, L5_STATE_KEYS) !== pickJson(Sb, L5_STATE_KEYS)) {
    return INVALID('L5 states differ beyond the fade flag', `${pickJson(Sf, L5_STATE_KEYS)} / ${pickJson(Sb, L5_STATE_KEYS)}`);
  }
  const tSx = (Math.round(Sf.durs[1] * 100) - 1) / 100;
  if (blk.tS !== tSx) return INVALID('L5 fade anchor tS is not the card\'s', `page tS ${fmt(blk.tS ?? null)} node tS ${fmt(tSx)}`);
  const samples = need(R, 'l5.samples');
  const redA = [], redB = [], rows = [];
  let tA = null, h = null;
  for (let j = 1; j <= 8; j++) {
    const s = samples.find((x) => x && x.j === j);
    if (!s || !isNum(s.T) || !isNum(s.a) || !isNum(s.b)) throw new Missing(`l5.samples[j=${j}]`);
    const q = l5Sample(Sf, c, j, s.T);
    tA = q.tA; h = q.h;
    if (s.T !== q.Texp) return INVALID('L5 sample grid is not the card\'s T_j', `j ${j} page T ${fmt(s.T)} node T ${fmt(q.Texp)}`);
    if (q.past) { if (s.a !== s.b) redA.push(j); } else if (!(Math.abs(s.a - Math.max(s.b, q.w)) <= TOL.L5b)) redB.push(j);
    rows.push(`j${j} ${q.past ? 'L5a' : 'L5b'} T ${fmt(s.T)} x ${fmt(q.x)} a ${fmt(s.a)} b ${fmt(s.b)} w ${fmt(q.w)}`);
  }
  const print = `tS ${fmt(blk.tS ?? null)} c ${fmt(c)} tA ${fmt(tA)} h ${fmt(h)} E_1 ${fmt(Ek(Sf, 1))}`
    + ` kept reset boundaries ${fmt(keptB(fade.planFades))} / ${fmt(keptB(base.planFades))}; ${rows.join('; ')}`
    + `; red ${redA.length + redB.length} of 8`;
  const why = [];
  if (redB.length) why.push(`L5b j [${redB.join(',')}]`);
  if (redA.length) why.push(`L5a j [${redA.join(',')}]`);
  return why.length ? FAIL(why.join('; '), print, { red: { L5a: redA, L5b: redB } })
    : PASS(print, { red: { L5a: [], L5b: [] } });
});

// L6, the degraded-beat pin row: precondition (ruling 12) + setup guards
export const legL6 = guarded((R) => {
  const S0 = needS(R, 'setup.S');
  const pre = `at L0: beats[1] ${fmt(S0.beats[1])} tails[1] ${fmt(S0.tails[1])}`;
  if (S0.beats[1] !== null) return INVALID('pin precondition unreadable', pre, { gate: false });
  if (!(S0.tails[1] > 0)) return INVALID('pin precondition: tails0[1] is 0', pre, { gate: false });
  const st = need(R, 'l6.plan');
  const g = l2bGuard(st, 'l6.plan');
  if (g) return INVALID(g, `${pre}; re-applied plan c2 ${fmt(c2Of(st))} beats ${fmt(st.S?.beats ?? null)}`, { gate: false });
  const S1 = needS(R, 'l6.plan.S');
  const arg = S1.cum[2] - S1.leads[2] - S1.beats[1] / 2;
  const l6 = need(R, 'l6');
  if (l6.trimArg !== arg) return INVALID('L6 setTrim point is not the beat midpoint', `${pre}; page ${fmt(l6.trimArg)} node ${fmt(arg)}`, { gate: false });
  if (l6.trimOk !== true) return INVALID('L6 setTrim refused', `${pre}; setTrim(0, ${fmt(arg)}) -> ${fmt(l6.trimOk)}`, { gate: false });
  const S2 = needS(R, 'l6.S');
  if (!(S2.beats[1] > 0)) return INVALID('L6 beat lost after the trim', `${pre}; beats ${fmt(S2.beats)}`, { gate: false });
  const P = need(R, 'l6.P');
  const o = need(R, 'l6.P.opts');
  const print = `${pre}; setTrim(0, ${fmt(arg)}) -> true; records ${fmt(P.recordsLength)} opts.beats ${fmt(o.beats ?? null)}`
    + ` trims ${fmt(o.trims ?? null)} durs[1] ${fmt(S2.durs[1])} completions[1] ${fmt(S2.completions[1])} E_1 ${fmt(Ek(S2, 1))}`;
  if (!(P.recordsLength === 2 && !o.beats?.[1] && Array.isArray(o.trims) && o.trims[1]?.startT === 0)) {
    return INVALID('pair did not leave the window', print, { gate: false });
  }
  return PASS(print, { gate: true });
});

// L6a (exact): P.opts.trims[1].endT === Math.max(S.durs[1], S.completions[1])
export const legL6a = guarded((R) => {
  const S2 = needS(R, 'l6.S');
  const o = need(R, 'l6.P.opts');
  const want = Math.max(S2.durs[1], S2.completions[1]);
  const endT = o.trims?.[1]?.endT ?? null;
  const print = `pin endT ${fmt(endT)} vs max(durs[1], completions[1]) ${fmt(want)}`;
  return endT === want ? PASS(print) : FAIL('L6a pin endT', print);
});

// L6b (exact): res.segments[1] === ex6.frames (ex6 never reads the pin)
export const legL6b = guarded((R) => {
  const S2 = needS(R, 'l6.S');
  const l6 = need(R, 'l6');
  if (l6.error) return INVALID(`renderDrill threw: ${l6.error}`, '');
  const P = need(R, 'l6.P');
  const res = need(R, 'l6.res');
  if (res.montageRate !== 1) return INVALID('L6b export precondition: res.montageRate is not 1', `montageRate ${fmt(res.montageRate)}`);
  if (!Array.isArray(res.segments)) throw new Missing('l6.res.segments');
  const ex6 = planPlayback({ duration: Ek(S2, 1), slowmo: P.opts.slowmo, startT: 0, endT: null,
    tailSec: TAIL_SEC, headSec: P.opts.leads?.[1]?.sec ?? 0, maxSec: Infinity });
  // L4a as written on this row (its ex reads the pin): printed, never a verdict
  const exPin = planPlayback({ duration: Ek(S2, 1), slowmo: P.opts.slowmo, startT: P.opts.trims?.[1]?.startT ?? 0,
    endT: P.opts.trims?.[1]?.endT ?? null, tailSec: TAIL_SEC, headSec: P.opts.leads?.[1]?.sec ?? 0, maxSec: Infinity });
  const seg = res.segments[1];
  const print = `res.segments[1] ${fmt(seg)} vs ex6.frames ${fmt(ex6.frames)} (E_1 ${fmt(Ek(S2, 1))}, TAIL_SEC ${fmt(TAIL_SEC)})`
    + `; L4a as written on this row: ex(pin) ${fmt(exPin.frames)} vs ${fmt(seg)} ${exPin.frames === seg ? 'EQUAL' : 'DIFFER'}`;
  return seg === ex6.frames ? PASS(print, { exPin: exPin.frames })
    : FAIL('L6b segment 1 export frames vs the live end', print, { exPin: exPin.frames });
});

// ------------------------------------------------------------------ positive control
// CTRL-SPLIT: split steps 1-5, the rows, the sid rule, Setup steps 4-5 on sid_c
export const legCTRLSPLIT = guarded((R) => {
  const c = need(R, 'ctrl');
  const sidW = R.setup?.sidW ?? null;
  const ids = Array.isArray(c.sessionsIds) ? c.sessionsIds : null;
  const S = c.S ?? null;
  const print = `close -> state ${fmt(c.closeState ?? null)} activateSnooker ${fmt(c.activateOk ?? null)}`
    + ` rows ${fmt((c.rows ?? []).map((r) => [r?.v0, r?.err ?? null]))} flush ${fmt(c.flush ?? null)}`
    + ` sid_w ${fmt(sidW)} sid_c ${fmt(c.sidC ?? null)} sessions[0..2] ${fmt(ids ? ids.slice(0, 3) : null)}`
    + ` emptyPlan ${fmt(c.emptyPlanOk ?? null)} beats ${fmt(S ? S.beats : null)}`;
  if (typeof c.closeState !== 'string' || c.closeState === 'PLAYBACK') return INVALID('control split: player did not close', print);
  if (c.activateOk !== true) return INVALID('control split refused', print);
  const rp = rowsProblem(c.rows, CONTROL_V0, 'ctrl.rows');
  if (rp) return INVALID(`control: ${rp}`, print);
  if (!ids) throw new Missing('ctrl.sessionsIds');
  if (!(c.sidC !== null && c.sidC !== undefined && c.sidC !== sidW && c.sidC === ids[0])) {
    return INVALID('control did not split', print);
  }
  if (!S) return INVALID('control: state() null after openSession', print);
  needS(R, 'ctrl.S');
  if (c.emptyPlanOk !== true || !allNull(S.beats)) return INVALID('plan seed not cleared', print);
  return PASS(print);
});

// plan() carries its fades at opts.fades (the setup contract reads plan().opts.fades)
const planFadesOf = (json) => { try { const p = JSON.parse(json); return p?.opts?.fades ?? p?.fades ?? null; } catch { return null; } };

// L0-control (derived, never presumed); every failure is INVALID by the card
export const legL0control = guarded((R) => {
  const S = needS(R, 'ctrl.S');
  const print = `durs ${fmt(S.durs)} tails ${fmt(S.tails)} completions ${fmt(S.completions)}`
    + ` kept reset boundaries ${fmt(keptB(planFadesOf(R.ctrl?.empty?.planJson)))}`;
  if (S.durs.length !== 3) return INVALID('control is not one session', print);
  for (let k = 0; k < 3; k++) {
    if (S.completions[k] !== S.durs[k]) return INVALID('not a control', `${print}; completions[${k}] !== durs[${k}]`);
    if (Ek(S, k) !== S.durs[k] + S.tails[k]) return INVALID('not a control', `${print}; E_${k} !== durs[${k}] + tails[${k}]`);
  }
  return PASS(print);
});

const C_STATE_KEYS = ['durs', 'cum', 'total', 'tails', 'beats', 'leads'];
// per-state capture, before any compare: { why|null, print, fields{name: bytes}, gate }
function cEmptyPre(R) {
  const e = need(R, 'ctrl.empty');
  const S = needS(R, 'ctrl.S');
  if (typeof e.stateJson !== 'string' || typeof e.planJson !== 'string') throw new Missing('ctrl.empty.stateJson/planJson');
  const node = pickJson(S, C_STATE_KEYS);
  const print = `state ${e.stateJson} plan ${e.planJson.length} chars fades b1 at ${fmt(keptB(planFadesOf(e.planJson)))}`;
  if (e.stateJson !== node) return { why: 'C-empty state JSON does not match S', print: `${print}; node ${node}` };
  return { why: null, print, fields: { state: e.stateJson, plan: e.planJson } };
}
function cBeatPre(R) {
  const st = need(R, 'ctrl.beat');
  const c2 = c2Of(st);
  const head = `plan ${fmt(st.ok)} c2 ${fmt(c2)} beats ${fmt(st.S?.beats ?? null)}`;
  const g = l2bGuard(st, 'ctrl.beat');
  if (g) return { why: g, print: head, gate: false };
  const S = needS(R, 'ctrl.beat.S');
  const { lo0, hi0 } = l2bEnds(S);
  if (st.lo0 !== lo0 || st.hi0 !== hi0) {
    return { why: 'L2b bracket ends are not the card\'s', print: `${head}; page lo0 ${fmt(st.lo0)} hi0 ${fmt(st.hi0)} node lo0 ${fmt(lo0)} hi0 ${fmt(hi0)}`, gate: true };
  }
  const pl = beatPred(st.atLo0), ph = beatPred(st.atHi0);
  const ends = `lo0 ${fmt(lo0)} pred ${pl} hi0 ${fmt(hi0)} pred ${ph}`;
  if (pl || !ph) return { why: 'no beat window', print: `${head}; ${ends}`, gate: true };
  const br = need(R, 'ctrl.beat.bracket');
  if (!isNum(br.lo) || !isNum(br.hi)) throw new Missing('ctrl.beat.bracket.lo/hi');
  for (const f of ['stateJson', 'planJson', 'walkSpecJson']) if (typeof st[f] !== 'string') throw new Missing(`ctrl.beat.${f}`);
  const d1 = S.cum[1] + S.durs[1];
  const pose = st.walkSpec?.moves?.at?.(-2)?.t0 ?? null;
  const print = `${head}; ${ends}; bracket [${fmt(br.lo)}, ${fmt(br.hi)}] contains cum[1] + durs[1] ${fmt(d1)}:`
    + ` ${br.lo <= d1 && d1 <= br.hi} walkSpec(1) pose t0 ${fmt(pose)} state ${st.stateJson}`;
  return { why: null, print, gate: true,
    fields: { state: st.stateJson, plan: st.planJson, walkSpec: st.walkSpecJson, bracket: JSON.stringify([br.lo, br.hi]) } };
}
function cTrimPre(R) {
  const t = need(R, 'ctrl.trim');
  const Sb = needS(R, 'ctrl.beat.S');
  const arg = Sb.cum[2] - Sb.leads[2] - Sb.beats[1] / 2;
  const head = `setTrim(0, ${fmt(t.trimArg ?? null)}) -> ${fmt(t.trimOk ?? null)} node point ${fmt(arg)}`;
  if (t.trimArg !== arg) return { why: 'C-trim setTrim point is not the beat midpoint', print: head };
  if (t.trimOk !== true) return { why: 'C-trim setTrim refused', print: head };
  if (typeof t.stateJson !== 'string' || typeof t.planJson !== 'string') throw new Missing('ctrl.trim.stateJson/planJson');
  let trims = null, pbeats = null;
  try { const p = JSON.parse(t.planJson); trims = p?.opts?.trims ?? p?.trims ?? null; pbeats = p?.opts?.beats ?? p?.beats ?? null; } catch { /* printed as null */ }
  return { why: null, print: `${head}; plan trims ${fmt(trims)} plan beats ${fmt(pbeats)} state ${t.stateJson}`,
    fields: { state: t.stateJson, plan: t.planJson } };
}
const C_PRE = { 'C-empty': cEmptyPre, 'C-beat': cBeatPre, 'C-trim': cTrimPre };
const C_KEY = { 'C-empty': 'empty', 'C-beat': 'beat', 'C-trim': 'trim' };
export const COMPARE_DEFERRED = 'compare deferred: no baseline supplied (OB_DVR864_CONTROL_BASELINE unset); state captured';

// compare this tree's capture with a baseline controlStates() document (other tree)
function cCompare(leg, pre, ctx) {
  if (pre.why) return INVALID(pre.why, pre.print, { gate: pre.gate ?? false });
  const base = ctx?.controlBaseline;
  if (!base) return INVALID(COMPARE_DEFERRED, pre.print, { gate: pre.gate ?? true, deferred: true });
  const b = base.states?.[C_KEY[leg]];
  const tag = `baseline tree ${fmt(base.tree ?? null)}`;
  if (!b) return INVALID(`${leg} missing on the baseline tree`, `${pre.print}; ${tag}`, { gate: pre.gate ?? true });
  if (b.why) return INVALID(`${leg} INVALID on the baseline tree: ${b.why}`, `${pre.print}; ${tag}`, { gate: pre.gate ?? true });
  const diff = Object.keys(pre.fields).filter((f) => pre.fields[f] !== b.fields?.[f]);
  const print = `${pre.print}; ${tag}; compared ${Object.keys(pre.fields).join(',')}; differ [${diff.join(',')}]`;
  return diff.length ? FAIL(`${leg} differs from the baseline tree`, print, { gate: pre.gate ?? true })
    : PASS(print, { gate: pre.gate ?? true });
}
export const legCempty = guarded((R, ctx) => cCompare('C-empty', cEmptyPre(R), ctx));
export const legCbeat = guarded((R, ctx) => cCompare('C-beat', cBeatPre(R), ctx));
export const legCtrim = guarded((R, ctx) => cCompare('C-trim', cTrimPre(R), ctx));

// ------------------------------------------------------------------ order + dependencies
export const LEG_FN = {
  SETUP: legSETUP, L0: legL0, L1: legL1, L2: legL2, L3: legL3, L4a: legL4a, L4b: legL4b,
  L2b: legL2b, L2c: legL2c, 'L4-beat': legL4beat, L5: legL5, L6: legL6, L6a: legL6a, L6b: legL6b,
  'CTRL-SPLIT': legCTRLSPLIT, 'L0-control': legL0control, 'C-empty': legCempty, 'C-beat': legCbeat, 'C-trim': legCtrim,
};
// a leg runs only when its upstream leg's gate is open; the gate is the upstream's explicit
// `gate` (L2b: its guards held; L6: PASS; C-beat: its guards held) or else upstream PASS
export const DEPS = {
  L0: 'SETUP', L1: 'L0', L2: 'L0', L3: 'L0', L4a: 'L0', L4b: 'L0', L2b: 'L0', L2c: 'L2b', 'L4-beat': 'L2b',
  L5: 'L0', L6: 'L0', L6a: 'L6', L6b: 'L6',
  'CTRL-SPLIT': 'SETUP', 'L0-control': 'CTRL-SPLIT', 'C-empty': 'L0-control', 'C-beat': 'L0-control', 'C-trim': 'C-beat',
};
const gateOf = (r) => (typeof r.gate === 'boolean' ? r.gate : r.verdict === 'PASS');
export const legLine = (r) => `DVR864 ${r.leg} ${r.verdict}: ${r.why} | ${r.print}`;

// ruling 12: the pin precondition, read from Setup's S whatever L6's upstream did
export function ruling12Line(R, l6) {
  const S = R?.setup?.S;
  const t = Array.isArray(S?.tails) ? S.tails[1] : undefined;
  const val = isNum(t) ? fmt(t) : 'unreadable';
  let tail;
  if (!isNum(t) || !Array.isArray(S?.beats) || S.beats[1] !== null) tail = 'INVALID pin precondition unreadable';
  else if (!(t > 0)) tail = 'INVALID pin precondition: tails0[1] is 0';
  else tail = l6 && l6.verdict !== 'PASS' ? `runnable (L6 ${l6.verdict}: ${l6.why})` : 'runnable';
  return `DVR864 RULING-12 tails0[1] ${val} -> L6 ${tail}`;
}

// ruling 13: the stored seam on the witness (L2b) and on the control (C-beat)
function seamOf(st, path) {
  if (!st || typeof st !== 'object') return { seam: 'unreadable', b1: 'unreadable', g: `reading missing: ${path}` };
  let g;
  try { g = l2bGuard(st, path); } catch (e) { g = e instanceof Missing ? `reading missing: ${e.path}` : `verdict error: ${e.message}`; }
  const c2 = c2Of(st);
  const b1 = Array.isArray(st.S?.beats) ? fmt(st.S.beats[1]) : 'unreadable';
  return { seam: c2 ? `transitionIn ${fmt(c2.transitionIn)}` : 'missing', b1, g };
}
export function ruling13Line(R) {
  const w = seamOf(R?.l2b, 'l2b'), c = seamOf(R?.ctrl?.beat, 'ctrl.beat');
  const bad = [];
  if (w.g) bad.push(`witness (${w.g})`);
  if (c.g) bad.push(`control (${c.g})`);
  return `DVR864 RULING-13 witness seam ${w.seam}, beats[1] ${w.b1}; control seam ${c.seam}, beats[1] ${c.b1}`
    + ` -> ${bad.length ? `INVALID ${bad.join('; ')}` : 'runnable'}`;
}

// runAll(readings, { controlBaseline }): card order, "depends on <LEG>: <root reason>" rule
export function runAll(R, ctx = {}) {
  const res = {};
  const legs = [];
  for (const leg of LEGS) {
    const up = DEPS[leg];
    let r;
    if (up && !gateOf(res[up])) {
      const u = res[up];
      const why = u.why.startsWith('depends on ') ? u.why : `depends on ${up}: ${u.why}`;
      r = { verdict: 'INVALID', why, print: `${up} ${u.verdict}`, gate: false, skipped: true };
    } else {
      r = LEG_FN[leg](R, ctx);
    }
    res[leg] = { leg, ...r };
    legs.push(res[leg]);
  }
  const count = (v) => legs.filter((r) => r.verdict === v).length;
  const lines = [formatBootMode(R?.boot), ...legs.map(legLine), ruling12Line(R, res.L6), ruling13Line(R),
    `DVR864 SUMMARY ${legs.map((r) => `${r.leg}=${r.verdict}`).join(' ')}`,
    `DVR864 END legs ${legs.length} invalid ${count('INVALID')} fail ${count('FAIL')} pass ${count('PASS')}`];
  return { legs, byLeg: res, lines, counts: { legs: legs.length, invalid: count('INVALID'), fail: count('FAIL'), pass: count('PASS') } };
}

// ------------------------------------------------------------------ pure builders for the block's writes
export function controlStates(R) {
  const doc = { schema: 'dvr864-control-states/1', tree: R?.meta?.tree ?? null, url: R?.meta?.url ?? null, states: {} };
  let beatGate = false;
  for (const leg of ['C-empty', 'C-beat', 'C-trim']) {
    const key = C_KEY[leg];
    if (leg === 'C-trim' && !beatGate) { doc.states[key] = { why: 'C-beat guards did not pass', fields: null }; continue; }
    let pre;
    try { pre = C_PRE[leg](R); } catch (e) { pre = { why: e instanceof Missing ? `reading missing: ${e.path}` : `verdict error: ${e.message}` }; }
    if (leg === 'C-beat') beatGate = pre.gate === true;
    doc.states[key] = { why: pre.why ?? null, fields: pre.why ? null : pre.fields };
  }
  return doc;
}
export function readingsDoc(R, result) {
  return { schema: 'dvr864-readings/1', tree: R?.meta?.tree ?? null, url: R?.meta?.url ?? null,
    verdicts: result ? result.legs.map((r) => ({ leg: r.leg, verdict: r.verdict, why: r.why })) : null, readings: R };
}
// the block writes these under OB_DVR864_OUT; with it unset it prints the note and writes nothing.
// A non-absolute OB_DVR864_OUT is refused (note, nothing written): a relative dir would
// resolve into the checkout the gate reads. `refused: true` tells
// the block to set a non-zero exit status (a requested dump that was not written).
export function outputPlan(outDir, R, result) {
  if (!outDir) return { dir: null, files: [], note: 'DVR864 note: OB_DVR864_OUT unset; readings-864.json and control-states-864.json not written' };
  const raw = String(outDir);
  if (!isAbsolute(raw)) {
    return { dir: null, files: [], refused: true, note: `DVR864 note: OB_DVR864_OUT ${JSON.stringify(raw)} is not an absolute path; readings-864.json and control-states-864.json not written` };
  }
  const dir = raw.replace(/\/+$/, '') || '/';
  const at = (f) => (dir === '/' ? `/${f}` : `${dir}/${f}`);
  return { dir, note: `DVR864 note: writing ${at('readings-864.json')} and ${at('control-states-864.json')}`,
    files: [{ path: at('readings-864.json'), text: `${JSON.stringify(readingsDoc(R, result), null, 2)}\n` },
      { path: at('control-states-864.json'), text: `${JSON.stringify(controlStates(R), null, 2)}\n` }] };
}
