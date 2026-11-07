#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-638 / #727 land41 — Q698 page-side probe (orchestrator GO 2026-09-15 09:3xZ with conditions (1)–(6); boots only after 'box yours').
//
// e2e-atelier's Q698 arm reads `getComputedStyle(#ob-shell-quickplay-wrap).visibility` after a fixed 200 ms sleep once the decision
// prompt's buttons exist. shell.js mounts the prompt and adds `ob-shell-decision-up` in ONE synchronous call; the yield rule delays
// `visibility: hidden` by --ob-t-fast (120 ms) as a CSS transition, and a transition starts at the first STYLE FLUSH after the change.
// So the arm's `vis: "visible", pe: "none"` payload means: no rendered frame in the ~200–350 ms after the mount (a starved renderer or
// one long task), and the arm's own getComputedStyle was the first flush. This probe MEASURES that on a page, per boot, without the
// suite: frame gaps (rAF), long tasks (PerformanceObserver), the class-flip instant (MutationObserver on #ob-shell's class), the arm's
// read replicated page-side at +200 / +350 ms (setTimeout: its overrun IS the starvation), and the lane's venue state by name
// (window.__lighting.state().venue, sampled before the mount and at the end: state() SPREADS the internal venue.applied object at the top
// level when a derivation is applied — bakes / bakeCount / derived / stallMs / waitedMs / captures / lastBakeAt are top-level keys, no `applied`
// key — and publishes `applied: null` beside pending / captures / rebakeQueued / lastBakeAt when not; a bake firing ON the mount shows as
// null→spread, a bakeCount rise, a new lastBakeAt or a captures rise). One JSON line per boot on stdout (--out appends it); the human line on stderr.
//
// Modes:
//   boot      node …probe.mjs --web <served web dir> --port <http> --cdp <cdp> --label land41 --out out.jsonl [--width 667 --height 375]
//             [--kind dry_break] [--settle 600] [--control-busy 300]
//             --port / --cdp are REQUIRED and carry no default: the launcher claims the lane band's tail and passes both explicitly
//             (ci-bands law: a tool default inside a declared lane band is a lint PROBLEM; PORT_FLAGS declares the two flags' roles).
//             --control-busy N = the POSITIVE CONTROL (condition 2): a page-side hook runs a synchronous N ms busy loop the moment the
//             class flips; the probe must then see a long task >= 250 ms in (a) and read 'visible' at +200 in (b) — or it cannot see
//             what it claims. The control's line carries control: N and is never mixed into the A/B.
//   analyze   node …probe.mjs --analyze out.jsonl [--verdict-out path]  — applies the DECISION RULE fixed by the ruling (condition 4),
//             prints every boot's numbers (condition 5) and the medians, writes the verdict word. It judges the numbers, nothing else.
import { spawnStaticServer, stopStaticServer } from '../../web/tools/cdp.mjs';
import { launchPhone, waitReady } from '../../web/tools/touch-cdp.mjs';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ analyze: the ruled decision rule over a jsonl of boots
if (process.argv.includes('--analyze')) {
  const path = arg('--analyze'); const vout = arg('--verdict-out', null);
  const rows = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const boots = rows.filter((r) => !r.control && !r.error);
  const errs = rows.filter((r) => r.error && !r.control);
  const L = boots.filter((r) => /^land41/.test(r.label)); const M = boots.filter((r) => /^main/.test(r.label));
  const med = (a) => { const s = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const gap = (r) => r.maxGapAfterFlipMs; const vis200 = (r) => (r.reads || []).find((x) => x.tag === '+200')?.vis === 'visible';
  // FIX12 M1: rows carry one of three shapes — the pre-FIX11 probe (top-level bakeCount read from state().venue, null when the page published
  // `applied: null`), the FIX11 probe (an `applied` sub-object, null on both kinds of mount — the misread shape), or this probe (appliedState).
  // The normalizer for old rows reads them as what they recorded: bakeCount null / applied null ⇒ appliedState 'null'.
  const norm = (v) => { if (!v || v.present !== true || 'appliedState' in v) return v;
    const st = ('applied' in v) ? (v.applied === null ? 'null' : 'spread') : (v.bakeCount == null ? 'null' : 'spread'); return { ...v, appliedState: st }; };
  const bakeRead = (r) => bakeFired(norm(r.venue?.before), norm(r.venue?.after));
  const bakeOnMount = (r) => bakeRead(r).fired === true;
  const appliedNullBoth = (r) => { const b = norm(r.venue?.before), a = norm(r.venue?.after); return !!(b && a && b.present === true && a.present === true && b.appliedState === 'null' && a.appliedState === 'null'); };
  for (const r of boots) console.log(`[q698-analyze] ${r.label}: flip@${r.flipRel} buttons−flip ${r.buttonsMinusFlip} firstFrameAfterFlip ${r.firstFrameAfterFlipMs} maxGapAfterFlip ${gap(r)} frames/400 ${r.framesIn400} longTasksAfterFlip ${JSON.stringify(r.longTasksAfterFlip)} read+200 vis ${(r.reads || []).find((x) => x.tag === '+200')?.vis} overrun ${(r.reads || []).find((x) => x.tag === '+200')?.overrunMs} bake ${r.venue?.before?.bakeCount}→${r.venue?.after?.bakeCount} derived ${r.venue?.after?.derived} stall ${r.venue?.after?.stallMs} pending ${r.venue?.after?.rebakePending}`);
  for (const r of errs) console.log(`[q698-analyze] ${r.label}: ERROR ${r.error} (excluded from the medians, counted)`);
  const sortedNum = (a) => a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  console.log(`[q698-analyze] sorted longest-gap-after-flip samples (ms): land41 ${JSON.stringify(sortedNum(L.map(gap)))} | main ${JSON.stringify(sortedNum(M.map(gap)))}; first-frame-after-flip (ms): land41 ${JSON.stringify(sortedNum(L.map((r) => r.firstFrameAfterFlipMs)))} | main ${JSON.stringify(sortedNum(M.map((r) => r.firstFrameAfterFlipMs)))}; read+200 visibility: land41 ${JSON.stringify(L.map((r) => (r.reads || []).find((x) => x.tag === '+200')?.vis ?? null))} | main ${JSON.stringify(M.map((r) => (r.reads || []).find((x) => x.tag === '+200')?.vis ?? null))}; long tasks after flip (count per boot): land41 ${JSON.stringify(L.map((r) => (r.longTasksAfterFlip || []).length))} | main ${JSON.stringify(M.map((r) => (r.longTasksAfterFlip || []).length))}; venue bakeCount before→after: land41 ${JSON.stringify(L.map((r) => `${r.venue?.before?.bakeCount}→${r.venue?.after?.bakeCount}`))} | main ${JSON.stringify(M.map((r) => `${r.venue?.before?.bakeCount}→${r.venue?.after?.bakeCount}`))}`);
  // FIX13 N2: per-row venue READABILITY, printed as a column; any unreadable A/B row → the analyze REFUSES to classify (UNJUDGEABLE-INSTRUMENT, rows named)
  const readab = (r) => { const b = rowReadability(r.venue?.before), a = rowReadability(r.venue?.after); return b === 'unreadable' || a === 'unreadable' ? 'unreadable' : (b === 'read' && a === 'read' ? 'read' : (b === 'absence' && a === 'absence' ? 'absence' : 'mixed')); };
  console.log(`[q698-analyze] venue readability per row: land41 ${JSON.stringify(L.map((r) => r.label + ':' + readab(r)))} | main ${JSON.stringify(M.map((r) => r.label + ':' + readab(r)))} (read = state().venue read; absence = a successful read that found no venue block; unreadable = the read threw)`);
  const unreadable = [...L, ...M].filter((r) => readab(r) === 'unreadable' || readab(r) === 'mixed').map((r) => r.label + ':' + readab(r));
  if (unreadable.length) {
    const line = `[q698-analyze] VERDICT UNJUDGEABLE-INSTRUMENT — venue evidence unreadable on ${unreadable.length} A/B row(s) ${JSON.stringify(unreadable)}: an unreadable read is a refusal, never a 'no bake' observation (FIX13 N2) | boots land41 ${L.length} main ${M.length}`;
    console.log(line); if (vout) writeFileSync(vout, 'UNJUDGEABLE-INSTRUMENT\n' + line + '\n'); process.exit(2);
  }
  const mL = med(L.map(gap)), mM = med(M.map(gap)); const vL = L.filter(vis200).length, vM = M.filter(vis200).length; const bL = L.filter(bakeOnMount).length;
  const absentBoth = (r) => readab(r) === 'absence';
  const nullL = L.filter(appliedNullBoth).length, nullM = M.filter(appliedNullBoth).length, absL = L.filter(absentBoth).length, absM = M.filter(absentBoth).length;
  const bakeWord = (nullL + absL === L.length && nullM + absM === M.length && bL === 0)
    ? `venue.applied null on all boots, both trees — no derivation applied on this mount; bake detector not exercised (merged: applied null on ${nullL}/${L.length} boots; main: no venue state at all on ${absM}/${M.length} boots${nullM ? ', applied null on ' + nullM : ''} — main has no venue term)`
    : `venue bake on the mount fired in ${bL} merged boot(s) (${L.map((r) => bakeRead(r).why).join(' / ')})`;
  console.log(`[q698-analyze] venue bake reading: ${bakeWord}`);
  const ratio = (mL !== null && mM) ? mL / mM : null;
  // FIX11 L6(c): the rule's POWER in this regime, stated with the verdict — never a bare max/mean
  const ffL = sortedNum(L.map((r) => r.firstFrameAfterFlipMs)), ffM = sortedNum(M.map((r) => r.firstFrameAfterFlipMs));
  const power = `rule power here: gap samples are frame-quantized (${[...new Set([...L, ...M].map(gap).filter((x) => typeof x === 'number'))].sort((a, b) => a - b).map((x) => x + ' ms').join(', ')} ≈ 7/8/9 × 16.67 ms), so LANE-CAUSED via the ratio needed a lane median ≥ ${mM === null ? 'n/a' : (1.5 * mM).toFixed(1)} ms against main's ${mM} — a constant per-frame lane cost below ~${mM === null ? 'n/a' : (0.5 * mM).toFixed(0)} ms reads FLAKE-NAMED with N=5; the visibility criterion is saturated (${vL}/${L.length} vs ${vM}/${M.length} visible: 'within one' has no power here); the positive control exercised only the long-task pathway (a ≥ 250 ms task), not the ratio pathway; first-frame-after-flip is reported UNSCORED: land41 [${ffL.join(', ')}] vs main [${ffM.join(', ')}] ms (lane earlier)`;
  console.log(`[q698-analyze] ${power}`);
  let word, why;
  if (L.length < 3 || M.length < 3) { word = 'UNDECIDED'; why = `too few clean boots (land41 ${L.length}, main ${M.length}; errors ${errs.length})`; }
  else if ((ratio !== null && ratio >= 1.5) || bL > 0 || (vL >= 3 && vM <= 1)) { word = 'LANE-CAUSED'; why = `merged median longest-gap-after-flip ${mL} ms vs main ${mM} ms (ratio ${ratio === null ? 'n/a' : ratio.toFixed(2)}, rule >= 1.5); ${bakeWord} (rule: any bake on the mount); read+200 'visible' merged ${vL}/${L.length} vs main ${vM}/${M.length} (rule: >= 3 vs <= 1)`; }
  else if (ratio !== null && ratio < 1.5 && (1 / ratio) < 1.5 && Math.abs(vL - vM) <= 1 && bL === 0) { word = 'FLAKE-NAMED'; why = `both trees' distributions overlap: medians ${mL} vs ${mM} ms (ratio ${ratio.toFixed(2)}, within 1.5x either way), read+200 'visible' ${vL}/${L.length} vs ${vM}/${M.length} (within one); ${bakeWord} — main's 200 ms wall-clock guess against a 120 ms CSS delay, starved on this box equally on both trees; ${power}`; }
  else { word = 'UNDECIDED'; why = `between the rules: medians ${mL} vs ${mM} ms (ratio ${ratio === null ? 'n/a' : ratio.toFixed(2)}), read+200 'visible' ${vL}/${L.length} vs ${vM}/${M.length}, ${bakeWord}`; }
  const ctrl = rows.filter((r) => r.control);
  const ctrlOk = ctrl.length > 0 && ctrl.every((r) => !r.error && (r.longTasksAfterFlip || []).some((t) => t.dur >= 250) && (r.reads || []).find((x) => x.tag === '+200')?.vis === 'visible');
  console.log(`[q698-analyze] positive control: ${ctrl.length} boot(s) — ${ctrl.length ? (ctrlOk ? 'SEEN (long task >= 250 ms after the flip AND read+200 visible)' : 'NOT SEEN — the probe cannot see what it claims; the A/B is void') : 'ABSENT — the A/B is void'}`);
  if (!ctrlOk) { word = 'VOID'; why = 'positive control ' + (ctrl.length ? 'not seen' : 'absent') + ' — ' + why; }
  const line = `[q698-analyze] VERDICT ${word} — ${why} | boots land41 ${L.length} main ${M.length} errors ${errs.length} control ${ctrl.length}`;
  console.log(line); if (vout) writeFileSync(vout, word + '\n' + line + '\n');
  process.exit(word === 'FLAKE-NAMED' ? 0 : 1);
}

// ------------------------------------------------------------------ boot: one measured page
const WEB = arg('--web'); const PORT = Number(arg('--port', null)); const CDP = Number(arg('--cdp', null));
const LABEL = arg('--label', 'tree'); const OUT = arg('--out', null); const W = Number(arg('--width', 667)); const H = Number(arg('--height', 375));
const KIND = arg('--kind', 'dry_break'); const SETTLE = Number(arg('--settle', 600)); const BUSY = Number(arg('--control-busy', 0));
if (!process.argv.includes('--detector-selftest') && (!WEB || !PORT || !CDP)) { console.error('lighting-q698-probe: --web <served web dir>, --port <http> and --cdp <cdp> are all required (no port defaults — the launcher passes the claimed band tail)'); process.exit(2); }
async function waitExpr(c, expr, tries = 60) { for (let i = 0; i < tries; i++) { if (await c.eval(expr) === true) return true; await sleep(150); } return false; }

// FIX12 M1 (corrects FIX11 L4): lightingvisuals.js state() publishes `venue` in TWO shapes — when a derivation is applied it SPREADS the internal
// venue.applied object at the TOP level (`venue: venue.applied ? { ...venue.applied, ...budgetDegradeRecord, on, all, gain, pending, …, lastBakeAt, … }`:
// bakes / bakeCount / derived / stallMs / waitedMs / captures are top-level keys and there is NO `applied` key); when not, it publishes `applied: null`
// beside pending / captures / rebakeQueued / lastBakeAt. One normalizer (normalizeVenue) serves the page read AND the self-test, so the two cannot
// drift; the self-test anchors its fixtures to the SOURCE (the two state() branches + the applied literal + fix9State) and fails the day the shape moves.
export function normalizeVenue(v) {
  if (!v) return { present: false };
  const isNull = ('applied' in v) && v.applied === null;
  const num = (x) => (typeof x === 'number' ? x : null);
  return { present: true, appliedState: isNull ? 'null' : 'spread', on: v.on ?? null, all: v.all ?? null, pending: v.pending ?? null, rebakeQueued: v.rebakeQueued ?? null,
    lastBakeAt: num(v.lastBakeAt), captures: num(v.captures),
    bakeCount: isNull ? null : (Array.isArray(v.bakes) ? v.bakes.length : num(v.bakeCount)), derived: isNull ? null : (v.derived ?? null), stallMs: isNull ? null : num(v.stallMs), waitedMs: isNull ? null : num(v.waitedMs),
    error: v.error ?? null, keys: Object.keys(v) };
}
// FIX13 N2 (review r11 P2): a venue read is one of three things — READ (present:true, the state), READABLE ABSENCE (present:false, readable:true —
// window.__lighting missing, or present without a venue block: main's shape), or UNREADABLE (readable:false, reason — state() threw, the page seam
// broke). Only the first two are evidence; an unreadable row is a REFUSAL in analyze, never a 'no bake'.
const VENUE = `(() => { try { const L = window.__lighting; if (!L) return { present: false, readable: true, absence: 'window.__lighting absent (no venue term on this tree)', hasLighting: typeof L };
  const st = L.state?.(); const v = st?.venue; if (!v) return { present: false, readable: true, absence: 'state().venue absent (no venue term on this tree)', hasLighting: typeof L };
  const normalizeVenue = ${normalizeVenue.toString()}; return { ...normalizeVenue(v), readable: true }; } catch (e) { return { present: false, readable: false, reason: 'UNREADABLE: ' + String(e).slice(0, 120) }; } })()`;
export function rowReadability(v) {  // one venue sample → 'read' | 'absence' | 'unreadable'; rows from the earlier probes are read as what they recorded
  if (!v || typeof v !== 'object') return 'unreadable';
  if (v.present === true) return 'read';
  if (v.readable === false || typeof v.present === 'string') return 'unreadable';  // the 342eb3bd catch path wrote present: 'ERR …'
  if (v.present === false) return 'absence';  // readable:true, or the 342eb3bd shape {present:false, hasLighting} — a successful read that found no venue block
  return 'unreadable';
}
export function bakeFired(before, after) {
  const rb = rowReadability(before), ra = rowReadability(after);
  if (rb === 'unreadable' || ra === 'unreadable') return { fired: null, why: 'venue state UNREADABLE on one side — a refusal, not an observation (FIX13 N2)' };
  if (rb === 'absence' || ra === 'absence') return { fired: false, why: 'no venue block on this tree (a readable absence) — nothing to bake' };
  if (before.appliedState === 'null' && after.appliedState === 'spread') {
    // FIX12 P3 #5: three of the four venue.applied literals are DEGRADE records (derived:false — gi-hold-timeout, 'no renderer', the budget degrade); only derived:true is a derivation
    if (after.derived === true) return { fired: true, why: 'applied null → the derivation spread (derived:true) — a derivation applied between the samples' };
    return { fired: false, why: `applied null → a degrade record (derived ${after.derived === null ? 'null' : String(after.derived)}${after.error ? ', error ' + after.error : ''}) — not a derivation, not a bake` };
  }
  if (before.appliedState === 'spread' && after.appliedState === 'spread' && typeof after.bakeCount === 'number' && typeof before.bakeCount === 'number' && after.bakeCount > before.bakeCount) return { fired: true, why: `bakeCount ${before.bakeCount} → ${after.bakeCount}` };
  if (typeof after.lastBakeAt === 'number' && after.lastBakeAt > 0 && after.lastBakeAt !== before.lastBakeAt) return { fired: true, why: `lastBakeAt ${before.lastBakeAt} → ${after.lastBakeAt}` };
  if (typeof after.captures === 'number' && typeof before.captures === 'number' && after.captures > before.captures) return { fired: true, why: `captures ${before.captures} → ${after.captures}` };
  return { fired: false, why: before.appliedState === 'null' ? 'applied null on both samples — no derivation applied on this mount' : 'no bakeCount / lastBakeAt / captures change' };
}
// ---- the SOURCE ANCHOR: key lists read from lightingvisuals.js itself — state()'s two venue branches, ALL FOUR `venue.applied = {` literals
// (1360 / 1372 / 1615 degrade records, derived:false; 1651 the derivation, derived:true), the `venue.budgetDegradeRecord = {` literal both branches
// spread, and fix9State's return literal. Two INDEPENDENT reads of every literal: (a) a depth-aware scanner (strings and comments skipped; `key:`,
// shorthand `key,`, spreads `...x`; a ternary's ':' inside a value is not a key), (b) the literal's own text evaluated by the JS engine under a universal
// Proxy environment with the depth-1 spreads removed — Object.keys of the result. The self-test asserts (a) == (b) per literal, so a scanner defect
// and an engine read cannot agree by construction (FIX12 P3 #4 — the earlier "fixture built from the list carries the list" cell was circular).
export function scanLiteral(text, start) {
  const keys = [], spreads = [], spreadSpans = []; let depth = 0, i = start, str = null, ident = '', expectKey = false, tmplDepth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (str) { if (c === '\\') { i++; continue; } if (c === str) str = null; continue; }
    if (c === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); i = nl < 0 ? text.length : nl; ident = ''; continue; }
    if (c === '/' && text[i + 1] === '*') { const ce = text.indexOf('*/', i + 2); i = ce < 0 ? text.length : ce + 1; ident = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; ident = ''; continue; }
    if (c === '{' || c === '(' || c === '[') { depth++; if (depth === 1) expectKey = true; ident = ''; continue; }
    if (c === '}' || c === ')' || c === ']') {
      if (depth === 1 && expectKey && ident && !/^\d/.test(ident)) keys.push(ident);  // trailing shorthand `…, hooked }`
      depth--; ident = ''; if (depth === 0) return { keys, spreads, spreadSpans, end: i }; continue;
    }
    if (depth === 1) {
      if (text.startsWith('...', i)) { const m = /^\.\.\.\(?([A-Za-z0-9_.]+)/.exec(text.slice(i)); if (m) spreads.push(m[1]); const s0 = i; let d = 0, j = i;
        for (; j < text.length; j++) { const ch = text[j]; if (ch === '(' || ch === '{' || ch === '[') d++; else if (ch === ')' || ch === '}' || ch === ']') { if (d === 0) break; d--; } else if (ch === ',' && d === 0) break; }
        spreadSpans.push([s0, j]); i = j - 1; ident = ''; expectKey = false; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) { ident += c; continue; }
      if (c === ':') { if (expectKey && ident && !/^\d/.test(ident)) keys.push(ident); ident = ''; expectKey = false; continue; }
      if (c === ',') { if (expectKey && ident && !/^\d/.test(ident)) keys.push(ident); ident = ''; expectKey = true; continue; }  // shorthand property
      if (!/\s/.test(c)) ident = '';
    }
  }
  return { keys, spreads, spreadSpans, end: i };
}
export function evalLiteralKeys(text, start, end, spreadSpans) {  // read (b): the engine's own parse of the literal, spreads removed, free names satisfied by a universal Proxy
  let body = text.slice(start, end + 1); const rel = spreadSpans.map(([a, b]) => [a - start, b - start]).sort((x, y) => y[0] - x[0]);
  for (const [a, b] of rel) body = body.slice(0, a) + body.slice(b);
  for (let k = 0; k < 3; k++) body = body.replace(/\{\s*,/g, '{').replace(/,\s*,/g, ',').replace(/,\s*\}/g, '}');  // the commas the removed spreads left behind
  const universal = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : universal), apply: () => universal, construct: () => universal, has: () => true, ownKeys: () => [], getOwnPropertyDescriptor: () => undefined });
  const real = { Math, Array, Number, JSON, Object, String, Boolean, Date, Map, Set, Symbol, undefined, NaN, Infinity, performance: { now: () => 0 } };
  const env = new Proxy({}, { has: () => true, get: (t, k) => (k in real ? real[k] : (k === Symbol.unscopables ? undefined : universal)) });
  const fn = new Function('__env', 'with (__env) { return (' + body + '); }');
  return Object.keys(fn(env));
}
export function venueShapeFromSource(src) {
  const uniq = (a) => [...new Set(a)];
  const lit = (start) => { const r = scanLiteral(src, start); return { keys: uniq(r.keys), spreads: r.spreads, end: r.end, evalKeys: evalLiteralKeys(src, start, r.end, r.spreadSpans), start }; };
  const vi = src.indexOf('venue: venue.applied ? {'); if (vi < 0) throw new Error('anchor: state() venue expression not found');
  const b1 = lit(vi + 'venue: venue.applied ? '.length);
  const colon = src.indexOf(': {', b1.end); const b2 = lit(colon + 2);
  const applied = []; for (let at = src.indexOf('venue.applied = {'); at >= 0; at = src.indexOf('venue.applied = {', at + 1)) applied.push({ line: src.slice(0, at).split('\n').length, ...lit(at + 'venue.applied = '.length) });
  if (applied.length < 1) throw new Error('anchor: no venue.applied literal');
  const bd = []; for (let at = src.indexOf('venue.budgetDegradeRecord = {'); at >= 0; at = src.indexOf('venue.budgetDegradeRecord = {', at + 1)) bd.push({ line: src.slice(0, at).split('\n').length, ...lit(at + 'venue.budgetDegradeRecord = '.length) });
  const fi = src.indexOf('function fix9State()'); const fr = src.indexOf('return {', fi); const fix9 = lit(fr + 'return '.length);
  return { branchApplied: b1, branchNull: b2, applied, budgetDegrade: bd, fix9,
    appliedUnion: uniq(applied.flatMap((a) => a.keys)), budgetUnion: uniq(bd.flatMap((a) => a.keys)) };
}
if (process.argv.includes('--detector-selftest')) {
  const src = readFileSync(new URL('../../web/scene/lightingvisuals.js', import.meta.url), 'utf8');
  const shape = venueShapeFromSource(src); let bad = 0, n = 0;
  const say = (ok, msg) => { n++; if (!ok) bad++; console.log(`[q698-detector-selftest] ${ok ? 'OK ' : 'BAD'} ${msg}`); };
  const same = (a, b) => a.length === b.length && a.every((k) => b.includes(k));
  const derivedOf = (a) => { const m = /derived:\s*(true|false)/.exec(src.slice(a.start, a.end)); return m ? m[1] : '?'; };
  // (a) == (b) per literal: the scanner and the engine must read the same key set — the non-circular anchor
  for (const [name, L] of [['state() applied branch', shape.branchApplied], ['state() unapplied branch', shape.branchNull], ...shape.applied.map((a) => [`venue.applied literal @${a.line} (derived:${derivedOf(a)})`, a]), ...shape.budgetDegrade.map((a) => [`budgetDegradeRecord literal @${a.line}`, a]), ['fix9State return', shape.fix9]]) {
    const extra = L.keys.filter((k) => !L.evalKeys.includes(k)), missing = L.evalKeys.filter((k) => !L.keys.includes(k));
    say(same(L.keys, L.evalKeys), `anchor: ${name} — scanner ${L.keys.length} keys == engine ${L.evalKeys.length} keys${extra.length || missing.length ? ` (scanner-only ${JSON.stringify(extra)}, engine-only ${JSON.stringify(missing)})` : ''}`);
  }
  say(!shape.branchApplied.keys.includes('applied') && shape.branchApplied.spreads.includes('venue.applied'), `anchor: the applied branch SPREADS venue.applied and has no 'applied' key (explicit ${shape.branchApplied.keys.length}, spreads ${JSON.stringify(shape.branchApplied.spreads)})`);
  say(shape.branchNull.keys.includes('applied') && shape.branchNull.keys.includes('captures') && shape.branchNull.spreads.includes('venue.budgetDegradeRecord'), `anchor: the unapplied branch publishes 'applied' (null) + 'captures' and spreads budgetDegradeRecord (explicit ${shape.branchNull.keys.length})`);
  say(shape.applied.length === 4 && shape.applied.filter((a) => derivedOf(a) === 'true').length === 1, `anchor: ${shape.applied.length} venue.applied literals (${shape.applied.map((a) => `@${a.line} derived:${derivedOf(a)} ${a.keys.length} keys`).join('; ')}) — exactly one is the derivation (derived:true)`);
  const deriv = shape.applied.find((a) => derivedOf(a) === 'true');
  say(!!deriv && ['bakes', 'bakeCount', 'derived', 'stallMs', 'waitedMs', 'captures', 'hooked'].every((k) => deriv.keys.includes(k)), `anchor: the derivation literal carries bakes / bakeCount / derived / stallMs / waitedMs / captures and the shorthand 'hooked' (${deriv ? deriv.keys.length : 0} keys)`);
  say(shape.branchApplied.keys.includes('lastBakeAt') && shape.branchNull.keys.includes('lastBakeAt'), 'anchor: lastBakeAt is published in both branches');
  say(shape.budgetDegrade.length >= 1 && shape.budgetUnion.length > 0, `anchor: budgetDegradeRecord literal(s) ${shape.budgetDegrade.map((a) => '@' + a.line).join(', ')} — ${shape.budgetUnion.length} keys, spread by BOTH branches (anchored, not assumed)`);
  // fixtures from the SOURCE lists: the derivation spread, a degrade-record spread (derived:false), the unapplied branch
  const spreadKeys = [...new Set([...shape.appliedUnion, ...shape.budgetUnion, ...shape.branchApplied.keys, ...shape.fix9.keys])]; const nullKeys = [...new Set([...shape.budgetUnion, ...shape.branchNull.keys, ...shape.fix9.keys])];
  const build = (keys, over) => { const o = {}; for (const k of keys) o[k] = null; return Object.assign(o, over); };
  const FIX_SPREAD = build(spreadKeys, { bakes: [{ frameMs: 12 }, { frameMs: 14 }], bakeCount: 2, derived: true, stallMs: 300, waitedMs: 1200, captures: 2, lastBakeAt: 5000, on: true, pending: false, hooked: true });
  const FIX_DEGRADE = build(spreadKeys, { bakes: [], bakeCount: 0, derived: false, error: 'gi-hold-timeout', captures: 0, lastBakeAt: 0, on: true, pending: false });
  const FIX_NULL = build(nullKeys, { applied: null, captures: 0, lastBakeAt: 0, on: true, pending: false });
  if (process.argv.includes('--plant-badkey')) FIX_SPREAD.bogusKeyNotInSource = 1;  // the planted negative: a key the source does not publish → the fixture/source cell must FAIL
  say(same(Object.keys(FIX_SPREAD), spreadKeys), `fixture: the spread fixture carries exactly the source keys (${Object.keys(FIX_SPREAD).length} vs ${spreadKeys.length}) — this cell's sensitivity is the planted bad key only; the source truth is the scanner-vs-engine cells above`);
  say(same(Object.keys(FIX_NULL), nullKeys), `fixture: the null fixture carries exactly the source keys (${Object.keys(FIX_NULL).length} vs ${nullKeys.length})`);
  const N = normalizeVenue; const S1 = N(FIX_SPREAD), S2 = N({ ...FIX_SPREAD, bakes: [...FIX_SPREAD.bakes, { frameMs: 9 }], bakeCount: 3 }), S3 = N({ ...FIX_SPREAD, lastBakeAt: 7000 }), S4 = N({ ...FIX_SPREAD, captures: 3 }), Z = N(FIX_NULL), D = N(FIX_DEGRADE);
  const cases = [['null → derivation spread FIRES', Z, S1, true], ['null → DEGRADE record (derived:false) SILENT', Z, D, false], ['spread equal SILENT', S1, S1, false], ['bakeCount +1 FIRES', S1, S2, true], ['lastBakeAt change FIRES', S1, S3, true], ['captures rise FIRES', S1, S4, true], ['null both SILENT (not exercised)', Z, Z, false], ['unreadable → null verdict', { present: false, readable: false, reason: 'UNREADABLE: planted' }, Z, null], ['readable absence → SILENT (no venue term)', { present: false, readable: true, absence: 'planted absence' }, { present: false, readable: true, absence: 'planted absence' }, false]];
  for (const [name, b, a, want] of cases) { const r = bakeFired(b, a); say(r.fired === want, `${name}: fired=${r.fired} (want ${want}) — ${r.why}`); }
  say(Z.appliedState === 'null' && S1.appliedState === 'spread' && S1.bakeCount === 2 && Z.bakeCount === null && D.derived === false, `normalizer: null fixture → appliedState ${Z.appliedState}, derivation → ${S1.appliedState} bakeCount ${S1.bakeCount}, degrade record → derived ${D.derived}`);
  // FIX13 N2: readability — a read, a readable absence (both old and new shapes), and an unreadable sample; the unreadable one must be a refusal, not a 'no bake'
  const RA = { present: false, readable: true, absence: 'state().venue absent (no venue term on this tree)' }, RO = { present: false, hasLighting: 'object' }, RU = { present: false, readable: false, reason: 'UNREADABLE: TypeError planted' }, RE = { present: 'ERR planted (342eb3bd catch path)' };
  say(rowReadability(Z) === 'read' && rowReadability(RA) === 'absence' && rowReadability(RO) === 'absence' && rowReadability(RU) === 'unreadable' && rowReadability(RE) === 'unreadable' && rowReadability(null) === 'unreadable', `readability: read=${rowReadability(Z)}, absence(new)=${rowReadability(RA)}, absence(342eb3bd shape)=${rowReadability(RO)}, unreadable(new)=${rowReadability(RU)}, unreadable(342eb3bd catch)=${rowReadability(RE)}, null=${rowReadability(null)}`);
  say(bakeFired(RU, S1).fired === null && bakeFired(RE, Z).fired === null && bakeFired(RA, RA).fired === false && bakeFired(RO, RO).fired === false, `unreadable → refusal: bakeFired() returns fired=null on an unreadable side (${bakeFired(RU, S1).why}); a readable absence reads fired=false (${bakeFired(RA, RA).why}) — analyze refuses unreadable rows by name before any classification`);
  console.log(`[q698-detector-selftest] ${bad === 0 ? 'PASS' : 'FAIL'} ${n - bad}/${n}${process.argv.includes('--plant-badkey') ? ' (planted bad key: the fixture/source cell MUST have failed)' : ''}`); process.exit(bad === 0 ? 0 : 1);
}
const INSTRUMENT = `(() => {
  const S = window.__q698 = { t0: performance.now(), flip: null, buttonsAt: null, frames: [], long: [], reads: [], busy: ${BUSY} };
  const shell = document.getElementById('ob-shell');
  (function loop() { requestAnimationFrame((t) => { S.frames.push(t); if (performance.now() - S.t0 < 2500) loop(); }); })();
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.long.push({ start: e.startTime, dur: e.duration }); }).observe({ entryTypes: ['longtask'] }); } catch (e) { S.longErr = String(e); }
  if (shell) new MutationObserver(() => { if (S.flip === null && shell.classList.contains('ob-shell-decision-up')) { S.flip = performance.now();
    if (S.busy > 0) { const until = performance.now() + S.busy; while (performance.now() < until) {} S.busyRan = performance.now() - S.flip; } } }).observe(shell, { attributes: true, attributeFilter: ['class'] });
  const sd = () => document.getElementById('ob-shell-decision');
  new MutationObserver(() => { if (S.buttonsAt === null && sd() && sd().querySelectorAll('.osd-btns button').length > 0) S.buttonsAt = performance.now(); }).observe(document.body, { childList: true, subtree: true });
  const read = (tag, due) => () => { const qp = document.getElementById('ob-shell-quickplay-wrap'); const cs = qp ? getComputedStyle(qp) : null;
    S.reads.push({ tag, due, at: performance.now(), vis: cs ? cs.visibility : null, pe: cs ? cs.pointerEvents : null, cls: shell ? shell.className : null }); };
  S.arm = (fromT) => { setTimeout(read('+200', fromT + 200), Math.max(0, fromT + 200 - performance.now())); setTimeout(read('+350', fromT + 350), Math.max(0, fromT + 350 - performance.now())); };
  return true; })()`;

const REPORT = `(() => { const S = window.__q698; const f = S.frames; const flip = S.flip;
  const gaps = []; for (let i = 1; i < f.length; i++) gaps.push({ at: f[i - 1], gap: f[i] - f[i - 1] });
  const after = flip === null ? [] : gaps.filter((g) => g.at >= flip - 50 && g.at <= flip + 400);
  const longAfter = flip === null ? [] : S.long.filter((l) => l.start + l.dur >= flip - 50 && l.start <= flip + 400).map((l) => ({ startRel: +(l.start - flip).toFixed(1), dur: +l.dur.toFixed(1) }));
  const firstFrameAfterFlip = flip === null ? null : (f.find((t) => t >= flip) ?? null);
  const qp = document.getElementById('ob-shell-quickplay-wrap'); const cs = qp ? getComputedStyle(qp) : null;
  const g = (fn) => { try { return fn(); } catch (e) { return 'ERR ' + String(e).slice(0, 80); } };
  return { flipRel: flip === null ? null : +(flip - S.t0).toFixed(1), buttonsRel: S.buttonsAt === null ? null : +(S.buttonsAt - S.t0).toFixed(1),
    buttonsMinusFlip: (flip === null || S.buttonsAt === null) ? null : +(S.buttonsAt - flip).toFixed(1), busyRanMs: S.busyRan === undefined ? null : +S.busyRan.toFixed(1),
    firstFrameAfterFlipMs: (firstFrameAfterFlip === null || flip === null) ? null : +(firstFrameAfterFlip - flip).toFixed(1),
    maxGapAfterFlipMs: after.length ? +Math.max(...after.map((x) => x.gap)).toFixed(1) : null, framesIn400: after.length,
    maxGapAllMs: gaps.length ? +Math.max(...gaps.map((x) => x.gap)).toFixed(1) : null, nFrames: f.length,
    longTasksAfterFlip: longAfter, longTasksAll: S.long.length, longErr: S.longErr ?? null,
    reads: S.reads.map((r) => ({ tag: r.tag, overrunMs: +(r.at - r.due).toFixed(1), vis: r.vis, pe: r.pe, decisionUp: /ob-shell-decision-up/.test(r.cls || '') })),
    nowVis: cs ? cs.visibility : null, nowPe: cs ? cs.pointerEvents : null, shellCls: document.getElementById('ob-shell')?.className ?? null,
    place: g(() => window.__shell.place()), station: g(() => window.__atelier.station()), pend: g(() => window.__rules.matchState()?.pendingDecision?.kind ?? null),
    venueProtocol: g(() => window.__venueProtocol ? { ok: window.__venueProtocol.ok, stalled: window.__venueProtocol.stalled, reason: window.__venueProtocol.reason ?? null } : null),
    vw: innerWidth, vh: innerHeight }; })()`;

let server = null, c = null, code = 0;
const line = { label: LABEL, web: WEB, w: W, h: H, kind: KIND, control: BUSY > 0 ? BUSY : null, startedAt: new Date().toISOString() };
try {
  server = spawnStaticServer(WEB, PORT);
  c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=q698probe_${W}`, { cdpPort: CDP, width: W, height: H, tool: false });
  line.booted = await waitReady(c);
  if (!line.booted) throw new Error('phone boot never became ready');
  // the arm's own staging: eight_ball + de, re-boot, equipment place, cues station (e2e-atelier.mjs Q698)
  await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball', language: 'de' })), location.reload(), true)`);
  await sleep(1200); line.rebooted = await waitReady(c); if (!line.rebooted) throw new Error('re-boot never became ready');
  if (!(await waitExpr(c, 'typeof window.__shell === "object"'))) throw new Error('no __shell');
  await c.eval(`__shell.go('equipment'), true`);
  if (!(await waitExpr(c, 'typeof window.__atelier === "object"'))) throw new Error('atelier never mounted');
  if (!(await waitExpr(c, `typeof window.__rules?.setMatchState === 'function' && typeof window.__atelier?.go === 'function'`))) throw new Error('no rules fold seam');
  await c.eval(`__atelier.go('cues'), true`);
  if (!(await waitExpr(c, `window.__atelier.station() === 'cues'`))) throw new Error('cues station never presented');
  await sleep(300);
  const venueBefore = await c.eval(VENUE);
  if (await c.eval(INSTRUMENT) !== true) throw new Error('instrument did not install');
  const tSet = await c.eval(`(() => { const t = performance.now(); const ok = window.__rules.setMatchState({ pendingDecision: { kind: ${JSON.stringify(KIND)}, chooser: 2 } }); window.__q698.arm(t); return ok === true ? t : null; })()`);
  if (tSet === null) throw new Error('the fold seam refused');
  await sleep(SETTLE);
  const r = await c.eval(REPORT); Object.assign(line, r); line.settleMs = SETTLE;
  line.venue = { before: venueBefore, after: await c.eval(VENUE) };
} catch (e) { line.error = String(e && e.message || e); code = 1; }
finally { try { if (c) await c.close(); } catch {} try { await stopStaticServer(server); } catch {} }
line.endedAt = new Date().toISOString();
const js = JSON.stringify(line); console.log(js); if (OUT) appendFileSync(OUT, js + '\n');
const r200 = (line.reads || []).find((x) => x.tag === '+200');
console.error(`[q698-probe] ${LABEL} ${W}x${H} ${KIND}${BUSY ? ' CONTROL busy ' + BUSY + ' ms (ran ' + line.busyRanMs + ')' : ''}: flip@${line.flipRel} ms, buttons−flip ${line.buttonsMinusFlip} ms, first frame after flip ${line.firstFrameAfterFlipMs} ms, max gap after flip ${line.maxGapAfterFlipMs} ms (${line.framesIn400} frames/400 ms), long tasks after flip ${JSON.stringify(line.longTasksAfterFlip)}, arm-read +200: vis ${r200?.vis} pe ${r200?.pe} overrun ${r200?.overrunMs} ms, now vis ${line.nowVis}, venue bake ${line.venue?.before?.bakeCount}→${line.venue?.after?.bakeCount} derived ${line.venue?.after?.derived} stall ${line.venue?.after?.stallMs} pending ${line.venue?.after?.rebakePending}${line.error ? ' ERROR ' + line.error : ''}`);
process.exit(code);
