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
//   node web/tools/test-playback-hall-exit.mjs   # exit 0 PASS, 1 FAIL, 2 INVALID
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PB = fs.readFileSync(path.join(ROOT, 'web', 'app', 'playback.js'), 'utf8');

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

const verdict = invalid ? 'INVALID' : failed ? 'FAIL' : 'PASS';
P(`verdict ${verdict}${invalid ? ` (${invalid} invalid)` : failed ? ` (${failed} failed)` : ' — 7 legs: openSession leaves an open hall before the player opens, and only then'}`);
process.exit(invalid ? 2 : failed ? 1 : 0);
