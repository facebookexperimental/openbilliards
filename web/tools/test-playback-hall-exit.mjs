// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-playback-hall-exit.mjs — issue #1259: __playback.openSession() never
// opens the replay player over an open hall (a shell without the seam, or a
// throwing exit, keeps the old open).
//
// While the hall is open, shell.js's window-capture gates (gatePointerDown,
// gateWheel, gateKeyDown) take the bed (canvas) presses, wheels and most keys
// aimed at a player standing over it: a tap over a hall prop navigates the hall
// behind the player, Escape never closes it. No user path opens the player over
// the hall (the Replays wall exits first: replays.js open() calls exitToTable,
// then openSession), but the openSession seam did. It now leaves an open hall
// through the hall's own exit (__shell.quickPlay()) once the session is known to
// exist. The modal list seam (__playback.open(), then a row) is out of scope:
// only a harness reaches it over an open hall.
//
// playback.js's hallOpen and the openSession seam run in a vm, sliced from the
// tree by the vendored acorn, over stubs for the archive, the dialog settle and
// the player. Legs:
//   open       the hall is open: quickPlay runs once, before openPlayer, and the
//              player opens with the hall closed.
//   cold       the same with the dialog panel not built yet (the issue's own
//              path: a real-user boot that never opened the list): the exit runs
//              before the dialog settle and the player.
//   closed     the hall is closed (the wall launch, scripted boots): no exit, the
//              player opens.
//   missing    the hall is open and the session is gone: no exit and no player,
//              the hall stays open (presence first, as the wall launch does).
//   dismissed  the hall is open and close() lands during the archive read: no
//              exit and no player.
//   stale      the hall is open (root class) and the shell publishes no seam: no
//              throw, the player opens as before.
//   throws     the hall's exit throws: the open still goes ahead.
// INVALID (the stubs prove nothing) means: a slice not found exactly once, a leg
// whose archive read never ran, or a cold leg that opened the player without
// the dialog settle and the panel build. A player that never opens is a FAIL.
//
// Issue #1283 (the crash-resume Continue over an open hall; the review's S1 and
// S2): playback.js's hallOpen, setResumeUi and resumeRunInner run in a vm over a
// fake banner (Continue, and the one Cancel/Discard button) and stubs for the
// exporter, the DVR closes and the settle wait, which stands down (the offer
// comes back). Legs:
//   resume-left    the hall is open and its exit closes it: one exit, before the
//                  DVR closes and the settle wait; the run reads 'running'; at
//                  the stand-down to the offer the focus is on Continue, not on
//                  the Cancel/Discard button (it reads Discard again there).
//   resume-throws  the hall's exit throws: the run does not start (no 'running',
//                  no DVR close, no settle wait), the offer stands, one console
//                  line says why, and the focus is back on Continue.
//   resume-stale   the hall is open (root class) and the shell publishes no seam:
//                  the same.
//   resume-closed  the hall is closed: no exit, the run starts and stands down as
//                  before; the code moves no focus and writes no console line.
//   resume-states  setResumeUi alone, after a run that left the hall: an offer
//                  ('resumeFailed') hands the focus from Discard to Start over; a
//                  closing state ('cancelled', Close only) leaves it where it is.
// INVALID adds: a resume leg whose run never reached the exit decision.
//
//   node web/tools/test-playback-hall-exit.mjs   # exit 0 PASS, 1 FAIL, 2 INVALID
//   node web/tools/test-playback-hall-exit.mjs --source <playback.js>   # the same legs on
//                                                # another source (a planted red)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const SRC = args.includes('--source') ? path.resolve(args[args.indexOf('--source') + 1])
  : path.join(ROOT, 'web', 'app', 'playback.js');
const PB = fs.readFileSync(SRC, 'utf8');

let invalid = 0, failed = 0;
const P = (s) => console.log(`[hallexit] ${s}`);
const bad = (s) => { failed += 1; console.log(`[hallexit] FAIL ${s}`); };
const inval = (s) => { invalid += 1; console.log(`[hallexit] INVALID ${s}`); };

function nodes(src, pred) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.type === 'string' && pred(n)) out.push(n);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }));
  return out;
}
function one(list, what) {
  if (list.length !== 1) { inval(`${what}: ${list.length} matches (want exactly 1)`); return null; }
  return list[0];
}

// ---- slices -------------------------------------------------------------------
const hall = one(nodes(PB, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'hallOpen'), 'playback.js hallOpen');
const seam = one(nodes(PB, (n) => n.type === 'Property' && n.key?.name === 'openSession'
  && n.value?.type === 'ArrowFunctionExpression'), 'playback.js __playback.openSession');
const setUi = one(nodes(PB, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'setResumeUi'), 'playback.js setResumeUi');
const inner = one(nodes(PB, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'resumeRunInner'), 'playback.js resumeRunInner');
if (args.includes('--source')) P(`source ${SRC}`);
if (invalid) { P(`verdict INVALID (${invalid})`); process.exit(2); }

// ---- one openSession in a vm ----------------------------------------------------
// shell: 'seam' publishes __shell { isOpen, quickPlay }; 'none' publishes nothing
// (a stale shell.js), leaving the root-class twin; 'throws' has a quickPlay that
// throws. The root class follows the hall's open flag, as shell.js flips both.
async function run(tag, { open, shell = 'seam', session = true, dismiss = false, cold = false }) {
  const st = { open };
  const log = [];
  const win = {
    __archive: {
      session: async (id) => {
        log.push(['read', id]);
        if (dismiss) box.__t.dismiss();
        return session ? { id, meta: { id } } : null;
      },
    },
  };
  if (shell !== 'none') {
    win.__shell = {
      isOpen: () => st.open,
      quickPlay: () => {
        log.push(['quickPlay', st.open]);
        if (shell === 'throws') throw new Error('planted exit failure');
        if (!st.open) return false;
        st.open = false;
        return true;
      },
    };
  }
  const classList = { contains: (c) => c === 'ob-shell-open' && st.open };
  const box = vm.createContext({
    window: win,
    document: { documentElement: { classList }, body: { classList: { contains: () => false } } },
    performance: { now: () => 0 },
  });
  vm.runInContext(`let pendingSession = false, pendingSince = null, openGen = 0, panel = ${cold ? 'null' : '{}'},
  pendingLaunch = null, pb = null, opening = false;
const log = globalThis.__log;
function arch() { return window.__archive; }
function armPendingEsc() { return () => {}; }
async function settleDialog() { log.push(['settle', hallOpen()]); }
function buildPanel() { log.push(['buildPanel']); panel = {}; }
function relabelBack() {}
async function openPlayer(detail) { log.push(['openPlayer', hallOpen()]); pb = { meta: detail.meta }; }
${PB.slice(hall.start, hall.end)}
const openSession = ${PB.slice(seam.value.start, seam.value.end)};
globalThis.__t = { openSession, dismiss: () => { openGen++; } };`, Object.assign(box, { __log: log }));
  let res, threw = null;
  try { res = await box.__t.openSession(7, { reopenList: false }); } catch (e) { threw = e; }
  P(`${tag}: open=${open} shell=${shell} session=${session} dismiss=${dismiss} cold=${cold} -> ${threw ? `threw ${threw.message}` : `resolved ${res}`}; log ${JSON.stringify(log)}; hall open after ${st.open}`);
  if (!log.some(([k]) => k === 'read')) inval(`${tag}: the archive read never ran — the stubs prove nothing`);
  return { res, threw, log, after: st.open };
}

const open = await run('open', { open: true });
if (open.threw || open.res !== true) bad(`open: the player must open after leaving the hall (got ${open.threw ? 'a throw' : open.res})`);
const qp = open.log.findIndex(([k]) => k === 'quickPlay');
const op = open.log.findIndex(([k]) => k === 'openPlayer');
if (qp < 0 || open.log.filter(([k]) => k === 'quickPlay').length !== 1) bad('open: the hall\'s exit (__shell.quickPlay) must run exactly once when the player opens over an open hall');
else if (op >= 0 && qp > op) bad('open: the hall\'s exit must run before the player opens');
if (op >= 0 && open.log[op][1] !== false) bad('open: the player opened over an open hall (hallOpen() was true at openPlayer)');
if (open.after !== false) bad('open: the hall is still open after the player opened');

const cold = await run('cold', { open: true, cold: true });
if (cold.threw || cold.res !== true) bad(`cold: the player must open after leaving the hall (got ${cold.threw ? 'a throw' : cold.res})`);
const cq = cold.log.findIndex(([k]) => k === 'quickPlay');
const cs = cold.log.findIndex(([k]) => k === 'settle');
const co = cold.log.findIndex(([k]) => k === 'openPlayer');
if (co >= 0 && (cs < 0 || !cold.log.some(([k]) => k === 'buildPanel'))) inval('cold: the player opened without the dialog settle and the panel build — the leg proves nothing');
else if (co >= 0 && (cq < 0 || cq > cs)) bad('cold: the hall\'s exit must run before the dialog settle (the issue\'s path: the list never opened)');
if (co >= 0 && cold.log[co][1] !== false) bad('cold: the player opened over an open hall (hallOpen() was true at openPlayer)');

const closed = await run('closed', { open: false });
if (closed.threw || closed.res !== true) bad(`closed: a closed hall must still open the player (got ${closed.threw ? 'a throw' : closed.res})`);
if (closed.log.some(([k]) => k === 'quickPlay')) bad('closed: the hall\'s exit ran although the hall was closed');

const missing = await run('missing', { open: true, session: false });
if (missing.res !== false || missing.log.some(([k]) => k === 'openPlayer')) bad('missing: a missing session must not open the player');
if (missing.log.some(([k]) => k === 'quickPlay') || missing.after !== true) bad('missing: the hall must stay open when the session is gone (presence first, as the wall launch does)');

const dismissed = await run('dismissed', { open: true, dismiss: true });
if (dismissed.res !== false || dismissed.log.some(([k]) => k === 'openPlayer')) bad('dismissed: an open dismissed during the archive read must not open the player');
if (dismissed.log.some(([k]) => k === 'quickPlay') || dismissed.after !== true) bad('dismissed: a dismissed open must not leave the hall');

const stale = await run('stale', { open: true, shell: 'none' });
if (stale.threw || stale.res !== true) bad(`stale: a shell without the seam must keep the old open (got ${stale.threw ? 'a throw' : stale.res})`);

const throws = await run('throws', { open: true, shell: 'throws' });
if (throws.threw || throws.res !== true) bad(`throws: a throwing exit must not abort the open (got ${throws.threw ? 'a throw' : throws.res})`);
if (!throws.log.some(([k]) => k === 'quickPlay')) bad('throws: the hall\'s exit was never attempted');

// ---- #1283: one resumeRunInner in a vm -------------------------------------------
// The banner: Continue (go) and the one Cancel/Discard button; focus() and blur()
// keep document.activeElement. shell as above ('throws' throws before the hall
// closes). The settle wait stands down (false): a run that starts comes back to
// the offer through setResumeUi(prev).
function banner() {
  const doc = { activeElement: null };
  const el = (name) => {
    const e = { name, style: { display: '' }, textContent: '' };
    e.focus = () => { doc.activeElement = e; };
    e.blur = () => { if (doc.activeElement === e) doc.activeElement = doc.body; };
    return e;
  };
  doc.body = el('body');
  const parts = {};
  for (const c of ['text', 'prog', 'go', 'save', 'discard']) parts[`.ob-pb-resume-${c}`] = el(c);
  const root = el('banner');
  root.querySelector = (c) => parts[c] ?? null;
  root.contains = (n) => n === root || Object.values(parts).includes(n);
  return { doc, root, go: parts['.ob-pb-resume-go'], discard: parts['.ob-pb-resume-discard'] };
}
function resumeBox({ open, shell }) {
  const st = { open };
  const log = [], warns = [];
  const b = banner();
  const win = { __export: { state: () => 'idle', drillProgress: () => null, renderDrill: () => null } };
  if (shell !== 'none') {
    win.__shell = {
      isOpen: () => st.open,
      quickPlay: () => {
        log.push(['quickPlay', st.open]);
        if (shell === 'throws') throw new Error('planted exit failure');
        if (!st.open) return false;
        st.open = false;
        return true;
      },
    };
  }
  b.doc.body.classList = { contains: () => false };
  b.doc.documentElement = { classList: { contains: (c) => c === 'ob-shell-open' && st.open } };
  const box = vm.createContext({
    window: win, document: b.doc, performance: { now: () => 0 },
    console: { warn: (...a) => warns.push(a.map(String).join(' ')), log: () => {}, error: () => {} },
    __log: log, __root: b.root,
  });
  vm.runInContext(`let resumeCtx = { plan: { name: 'p', frames: 100, opts: { width: 1280, height: 720 } },
  leaf: { clearPlan: async () => { log.push(['clearPlan']); } }, hint: { frame: 10 } };
let resumeState = 'offer', resumeMsg = null, resumeProg = null, resumeRestart = false, resumeCancelled = false;
let resumeHallFocus = false, heldSalvage = null, resumeScrim = null, resumeStaging = null;
let rendering = false, transcodeBusy = false, saveWait = null;
let resumeUi = globalThis.__root;
const log = globalThis.__log;
function t(k) { return k; }
function has() { return true; }
function resumeProgText() { return ''; }
function saveErrorText(c) { return String(c); }
function equipmentRefusedCopy() { return ''; }
function streamBridge() { return {}; }
function ffEligible() { return true; }
function closeCard() { log.push(['closeCard', hallOpen()]); }
function closePlayer() {}
function closeList() {}
async function releaseHeldSalvage() {}
async function streamOp(bridge, op) { log.push(['streamOp', op.op]); }
async function awaitSettle() { log.push(['awaitSettle', hallOpen()]); return false; }
${PB.slice(hall.start, hall.end)}
${PB.slice(setUi.start, setUi.end)}
${PB.slice(inner.start, inner.end)}
const paint = setResumeUi;
setResumeUi = (s, m) => { log.push(['state', s]); return paint(s, m); };
globalThis.__t = { run: (restart) => resumeRunInner(restart), state: () => resumeState,
  flag: (v) => { if (v !== undefined) resumeHallFocus = v; return resumeHallFocus; }, paint: (s) => setResumeUi(s) };`, box);
  return { box, st, log, warns, b };
}
async function resumeRun(tag, opts) {
  const R = resumeBox(opts);
  R.b.go.focus(); // the player pressed Enter on Continue
  let threw = null;
  try { await R.box.__t.run(false); } catch (e) { threw = e; }
  const states = R.log.filter(([k]) => k === 'state').map(([, s]) => s);
  const focus = R.b.doc.activeElement?.name ?? null;
  P(`${tag}: open=${opts.open} shell=${opts.shell} -> ${threw ? `threw ${threw.message}` : 'resolved'}; states ${JSON.stringify(states)}; log ${JSON.stringify(R.log.filter(([k]) => k !== 'state'))}; console ${JSON.stringify(R.warns)}; focus ${focus}; hall open after ${R.st.open}; state ${R.box.__t.state()}`);
  return { ...R, threw, states, focus };
}

const left = await resumeRun('resume-left', { open: true, shell: 'seam' });
const lq = left.log.findIndex(([k]) => k === 'quickPlay');
const lc = left.log.findIndex(([k]) => k === 'closeCard');
const la = left.log.findIndex(([k]) => k === 'awaitSettle');
if (!left.states.includes('running')) inval('resume-left: the run never reached \'running\' — the stubs prove nothing');
if (left.threw) bad(`resume-left: the run threw (${left.threw.message})`);
if (left.log.filter(([k]) => k === 'quickPlay').length !== 1) bad('resume-left: the hall\'s exit must run exactly once');
else if ((lc >= 0 && lq > lc) || (la >= 0 && lq > la)) bad('resume-left: the hall\'s exit must run before the DVR closes and the settle wait');
if (la >= 0 && left.log[la][1] !== false) bad('resume-left: the settle wait began with the hall open');
if (left.box.__t.state() !== 'offer') bad(`resume-left: the stand-down must bring the offer back (state ${left.box.__t.state()})`);
if (left.focus === 'discard') bad('resume-left: after the stand-down the focus rests on the Cancel/Discard button, which reads Discard again (one more Enter drops the kept partial)');
else if (left.focus !== 'go') bad(`resume-left: after the stand-down the focus must be on Continue (it is on ${left.focus})`);
if (left.warns.length) bad(`resume-left: a console line on a sound exit: ${JSON.stringify(left.warns)}`);

for (const [tag, shell] of [['resume-throws', 'throws'], ['resume-stale', 'none']]) {
  const r = await resumeRun(tag, { open: true, shell });
  if (!r.warns.length && !r.states.includes('running')) inval(`${tag}: the run neither started nor said why — it never reached the exit decision`);
  if (r.st.open !== true) inval(`${tag}: the hall closed — the leg proves nothing`);
  if (r.threw) bad(`${tag}: the run threw (${r.threw.message})`);
  if (shell === 'throws' && !r.log.some(([k]) => k === 'quickPlay')) bad(`${tag}: the hall's exit was never attempted`);
  if (r.states.includes('running')) bad(`${tag}: the run started with the hall still open (the clip #1283 forbids)`);
  if (r.log.some(([k]) => k === 'closeCard' || k === 'awaitSettle')) bad(`${tag}: the run went on past the exit with the hall still open`);
  if (r.box.__t.state() !== 'offer') bad(`${tag}: the offer must stand (state ${r.box.__t.state()})`);
  if (r.warns.length !== 1) bad(`${tag}: want one console line saying why, got ${r.warns.length}`);
  if (r.focus !== 'go') bad(`${tag}: the focus must be back on Continue (it is on ${r.focus})`);
}

const shut = await resumeRun('resume-closed', { open: false, shell: 'seam' });
if (!shut.states.includes('running')) inval('resume-closed: the run never reached \'running\' — the stubs prove nothing');
if (shut.threw) bad(`resume-closed: the run threw (${shut.threw.message})`);
if (shut.log.some(([k]) => k === 'quickPlay')) bad('resume-closed: the hall\'s exit ran although the hall was closed');
if (shut.box.__t.state() !== 'offer') bad(`resume-closed: the stand-down must bring the offer back (state ${shut.box.__t.state()})`);
if (shut.box.__t.flag()) bad('resume-closed: the focus handback is armed without a hall exit');
if (shut.focus === 'discard') bad('resume-closed: the code moved the focus to the Cancel/Discard button without a hall exit');
if (shut.warns.length) bad(`resume-closed: a console line without a hall: ${JSON.stringify(shut.warns)}`);

const S = resumeBox({ open: false, shell: 'seam' });
S.box.__t.paint('running'); S.b.discard.focus(); S.box.__t.flag(true);
S.box.__t.paint('resumeFailed');
const f1 = S.b.doc.activeElement?.name;
S.box.__t.paint('running'); S.b.discard.focus(); S.box.__t.flag(true);
S.box.__t.paint('cancelled');
const f2 = S.b.doc.activeElement?.name, armed = S.box.__t.flag();
P(`resume-states: running -> resumeFailed with the handback armed: focus ${f1}; running -> cancelled: focus ${f2}, handback armed after ${armed}`);
if (f1 !== 'go') bad(`resume-states: after a hall-exit run, 'resumeFailed' must hand the focus from Discard to Start over (it is on ${f1})`);
if (f2 !== 'discard') bad(`resume-states: 'cancelled' (Close only) must leave the focus on its one button (it is on ${f2})`);
if (armed) bad('resume-states: the handback stays armed after the run ended');

const verdict = invalid ? 'INVALID' : failed ? 'FAIL' : 'PASS';
P(`verdict ${verdict}${invalid ? ` (${invalid} invalid)` : failed ? ` (${failed} failed)` : ' — 12 legs: openSession leaves an open hall before the player opens, and only then; Continue leaves it before a resumed export, starts none under it, and gives the focus back to the offer at a stand-down'}`);
process.exit(invalid ? 2 : failed ? 1 : 0);
