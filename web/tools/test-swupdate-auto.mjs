// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-swupdate-auto.mjs — #1388: the update notice's automatic take-over,
// judged on the REAL app/swupdate.js in Node (no browser).
//
// A plain reload does not release a waiting worker. While one waits, a page
// that is idle in the hall, can show it is the only page of the site and has
// reached the network starts the Reload press's machinery by itself, once.
// This arm slices AUTO_KEY … autoTakeover() from the source (takeoverIdle,
// onlyPage, netUp and autoTakeover with their constants) and runs them
// against stubs:
//   IDLE     takeoverIdle: true only with the hall open, no live match, the
//            shell not busy, no reload under way, no replay up (the class
//            and playback's own words: player, save card, a session
//            opening), no export dialog or run, no recording, no painted
//            modal layer and no text field in use; a shell or a hook
//            without one of its words, or a throwing query, is NOT idle; an
//            unpainted layer or a focused slider does not block
//   ALONE    onlyPage: true only when exactly one holder or asker of this
//            site's page lock is listed; none (its own lock not granted),
//            two, no lock manager, a failed or throwing listing: false;
//            another name on the origin is not counted
//   NET      netUp: false when the browser says offline (no request then),
//            when the probe answers not ok, nothing, rejects or throws;
//            autoTakeover asks it only once it is alone, and takes nothing
//            over unless the answer is true
//   GUARDS   autoTakeover does nothing without a waiting worker, without a
//            controller, with a reload under way, after "Later", with a
//            take-over already under way (a press), without its own lock, or
//            while not idle (no lock listing asked then); it schedules no
//            timer
//   RACE     the readings are taken again after the listing and after the
//            network answer: a worker gone, a hall left, a "Later", a press,
//            a reload or a lost controller in between ends it with no
//            take-over and nothing stored; a listing that says not alone (or
//            anything but true, or fails) stores nothing either
//   ONCE     the mark carries the document's id and is stored BEFORE the
//            take-over starts; the same document id is not tried twice, a
//            new one is (once the floor has passed)
//   FLOOR    the take-over's time is stored with the mark; within
//            AUTO_FLOOR_MS of it nothing is taken over (no listing asked),
//            at the floor it is; a clock that went back does not pass
//   STORAGE  get throws / set throws / the mark or the time not read back:
//            no take-over (fail closed)
//   WIRING   watchUpdates: offer() tries first; the page's take-over is the
//            Reload press's order (the flag, inert, the belt as an
//            unconditional statement, the message, the guarded re-trigger);
//            the press sets the same flag before its belt and the poll
//            stops behind it; the shared lock named with the registration's
//            scope; automation boots off unless asked; the mark cleared only
//            with no worker waiting; the final answers do not re-arm the
//            poll; a controlled page asks for a new sw.js itself when it
//            attaches (automation boots do not)
//   PINS     shell.js's matchLive is the quick-play verb's own reading; the
//            modal-layer selector is ateliercue.js's; playback.js sets and
//            clears the replay class and keeps its three words, export.js
//            holdsShot and record.js recording stand as read; the poll is no
//            faster than one second, the floor no shorter than ten minutes
//   DEFAULTS the DEFAULT envs under the browser's `this` rules: the shell
//            read from window, the lock listing called on its owner, the
//            network probe a bare fetch of the re-trigger script past the
//            HTTP cache
// The slice runs in strict mode, as the module does.
//
//   node web/tools/test-swupdate-auto.mjs [--src <swupdate.js>]
//   node web/tools/test-swupdate-auto.mjs --selftest
// Exit 0 PASS, 1 FAIL, 2 INVALID.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const SRC_DEFAULT = path.join(WEB, 'app', 'swupdate.js');
const SCOPE = 'http://127.0.0.1:1/site/web/';
const RETRIGGER = `${SCOPE}sw-retrigger.js`;
const MECHS = ['IDLE', 'ALONE', 'NET', 'GUARDS', 'RACE', 'ONCE', 'FLOOR', 'STORAGE', 'WIRING', 'PINS', 'DEFAULTS'];
const DOC_A = 'aaaaaaaaaaaa', DOC_B = 'bbbbbbbbbbbb';
const NOW = 1700000000000;
const MIN_FLOOR_MS = 10 * 60 * 1000;

const B = { browser: null }; // the browser globals the DEFAULT envs reach, swapped per run
const SCHED = []; // every timer the slice schedules (it needs none: the poll lives in watchUpdates)
function lift(src) {
  const start = src.indexOf('const AUTO_KEY');
  const fnAt = src.indexOf('export function autoTakeover(');
  if (start < 0 || fnAt < start) return { invalid: 'AUTO_KEY / autoTakeover not found' };
  // the function body ends at the first line that is exactly '}' after its start
  const end = src.indexOf('\n}\n', fnAt);
  if (end < 0) return { invalid: 'autoTakeover has no closing brace line' };
  const body = src.slice(start, end + 2).replaceAll('export function', 'function');
  // eslint-disable-next-line no-new-func
  const make = new Function('navigator', 'document', 'window', 'fetch', 'RETRIGGER_URL', 'AbortSignal', 'sessionStorage', 'location', 'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'requestIdleCallback', `"use strict";\n${body}\nreturn { AUTO_KEY, AUTO_AT_KEY, AUTO_FLOOR_MS, PAGE_LOCK, AUTO_POLL_MS, AUTO_OFFLINE_MS, NET_PROBE_MS, ATTACH_CHECK_MS, MODAL_UP_SEL, takeoverIdle, onlyPage, netUp, autoTakeover };`);
  // AbortSignal.timeout as a stub that only records its bound (no timer runs in the arm)
  const abortB = { timeout: (ms) => ({ boundMs: ms }) };
  const nav = { get locks() { return B.browser.locks; }, get onLine() { return B.browser.onLine; } };
  const view = (pick) => new Proxy({}, { get: (_, k) => pick()[k], set: (_, k, v) => { pick()[k] = v; return true; } });
  const rec = (n) => () => { SCHED.push(n); return 0; };
  // the browser's fetch under WebIDL's `this` rule: called as a method of another object it throws
  const fetchB = function fetchB(u, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation (fetch)');
    B.browser.fetched.push([u, init]);
    return Promise.resolve({ ok: B.browser.fetchOk });
  };
  return make(nav, view(() => B.browser.doc), view(() => B.browser.win), fetchB, RETRIGGER, abortB, undefined, undefined, rec('setTimeout'), rec('setInterval'), rec('queueMicrotask'), rec('requestAnimationFrame'), rec('requestIdleCallback'));
}

// a stub page for takeoverIdle: the shell's three words, the reload flag, the replay class, playback's, export's and
// the recorder's hooks (absent unless given), the modal layers (each the number of boxes it paints), the focused element
function page({ shell = {}, noShell = false, reloading = false, pbLive = false, playback, exporter, recorder, layers = [], active = null, queryThrows = false } = {}) {
  const sh = noShell ? undefined : { isOpen: () => true, matchLive: () => false, busy: () => false, ...shell };
  if (sh) for (const k of Object.keys(sh)) if (sh[k] === undefined) delete sh[k]; // a shell without that word
  const asked = [];
  const doc = {
    documentElement: { classList: { contains: (c) => pbLive && c === 'ob-pb-live' } },
    querySelectorAll: (sel) => { asked.push(sel); if (queryThrows) throw new Error('SyntaxError'); return layers.map((n) => ({ getClientRects: () => ({ length: n }) })); },
    activeElement: active,
  };
  const win = { __shell: sh, __obSwReloading: reloading };
  if (playback) win.__playback = playback;
  if (exporter) win.__export = exporter;
  if (recorder) win.__record = recorder;
  return { asked, env: { win, doc } };
}
const quietPlayback = (o = {}) => ({ playerOpen: () => false, cardOpen: () => false, opening: () => false, ...o });
// a stub lock manager, under the browser's `this` rule
function locksOf(held, { rejects = false, throws = false, noQuery = false, answer } = {}) {
  const locks = { calls: 0 };
  if (!noQuery) {
    locks.query = function query() {
      if (this !== locks) throw new TypeError('Illegal invocation (query)');
      locks.calls++;
      if (throws) throw new Error('SecurityError');
      if (rejects) return Promise.reject(new Error('InvalidStateError'));
      return Promise.resolve(answer !== undefined ? answer : { held, pending: [] });
    };
  }
  return locks;
}
// a stub `x` for autoTakeover; `during(s)` runs while the lock listing is in flight, `duringNet(s)` while the
// network probe is
function attempt(L, { waiting = true, controller = true, reloading = false, dismissed = false, taking = false, held = true, idle = true,
  alone = true, aloneRejects = false, online = true, onlineRejects = false, now = NOW, docId = DOC_A, store = new Map(), get, set, during, duringNet } = {}) {
  const s = { takes: 0, aloneCalls: 0, onlineCalls: 0, atTake: null, store, idle, dismissed, taking, reg: { waiting: waiting ? {} : null }, sw: { controller: controller ? {} : null }, win: { __obSwReloading: reloading } };
  s.x = {
    reg: s.reg, sw: s.sw, win: s.win, docId,
    dismissed: () => s.dismissed, taking: () => s.taking, held: () => held, idle: () => s.idle, now: () => now,
    alone: () => { s.aloneCalls++; if (during) during(s); return aloneRejects ? Promise.reject(new Error('InvalidStateError')) : Promise.resolve(alone); },
    online: () => { s.onlineCalls++; if (duringNet) duringNet(s); return onlineRejects ? Promise.reject(new Error('TypeError')) : Promise.resolve(online); },
    getMark: get || ((k) => store.get(k) ?? null), setMark: set || ((k, v) => { store.set(k, String(v)); }),
    take: () => { s.takes++; s.atTake = { mark: store.get(L.AUTO_KEY) ?? null, at: store.get(L.AUTO_AT_KEY) ?? null }; },
  };
  return s;
}

async function judgeLifted(L, files) {
  const { src, shell, atelier, playback, exporter, recorder } = files;
  const red = Object.fromEntries(MECHS.map((m) => [m, []]));
  // IDLE
  {
    const idle = (o) => { try { return L.takeoverIdle(page(o).env); } catch (e) { return `threw: ${e && e.message}`; } };
    const base = idle({});
    if (base !== true) red.IDLE.push(`the hall open, no match, nothing moving: ${JSON.stringify(base)} (want true)`);
    const blocked = [
      ['no shell yet', { noShell: true }],
      ['the hall closed', { shell: { isOpen: () => false } }],
      ['isOpen without an answer', { shell: { isOpen: () => undefined } }],
      ['a live match', { shell: { matchLive: () => true } }],
      ['a shell without matchLive (a shell.js from before the change)', { shell: { matchLive: undefined } }],
      ['matchLive without an answer', { shell: { matchLive: () => undefined } }],
      ['the shell busy', { shell: { busy: () => true } }],
      ['a shell without busy', { shell: { busy: undefined } }],
      ['a throwing shell word', { shell: { busy: () => { throw new Error('x'); } } }],
      ['a reload under way', { reloading: true }],
      ['a replay up (the class)', { pbLive: true }],
      ['a replay up (playback\'s word)', { playback: quietPlayback({ playerOpen: () => true }) }],
      ['the save card open (a render, a transcode, a save)', { playback: quietPlayback({ cardOpen: () => true }) }],
      ['a session opening', { playback: quietPlayback({ opening: () => 'session-1' }) }],
      ['a playback hook without one of its words', { playback: { playerOpen: () => false, opening: () => false } }],
      ['an export dialog or run', { exporter: { holdsShot: () => true } }],
      ['an export hook without holdsShot', { exporter: {} }],
      ['a recording', { recorder: { recording: () => true } }],
      ['a recorder without recording', { recorder: {} }],
      ['a painted modal layer', { layers: [0, 1] }],
      ['a throwing layer query', { queryThrows: true }],
      ['a text input in use', { active: { tagName: 'INPUT', type: 'text' } }],
      ['an input without a type', { active: { tagName: 'INPUT' } }],
      ['a search input in use', { active: { tagName: 'INPUT', type: 'search' } }],
      ['a textarea in use', { active: { tagName: 'TEXTAREA' } }],
      ['a select in use', { active: { tagName: 'SELECT' } }],
      ['an editable node in use', { active: { tagName: 'DIV', isContentEditable: true } }],
    ];
    for (const [what, o] of blocked) {
      const r = idle(o);
      if (r !== false) red.IDLE.push(`${what}: ${JSON.stringify(r)} (want false)`);
    }
    const free = [
      ['the three hooks loaded and quiet', { playback: quietPlayback(), exporter: { holdsShot: () => false }, recorder: { recording: () => false } }],
      ['a mounted layer that paints nothing', { layers: [0, 0] }],
      ['a slider focused', { active: { tagName: 'INPUT', type: 'range' } }],
      ['a checkbox focused', { active: { tagName: 'INPUT', type: 'checkbox' } }],
      ['a button focused', { active: { tagName: 'BUTTON' } }],
      ['the body focused', { active: { tagName: 'BODY' } }],
      ['nothing focused', { active: null }],
    ];
    for (const [what, o] of free) {
      const r = idle(o);
      if (r !== true) red.IDLE.push(`${what}: ${JSON.stringify(r)} (want true: it interrupts nothing)`);
    }
  }
  // ALONE
  {
    const NAME = `${L.PAGE_LOCK}:${SCOPE}`;
    const me = { name: NAME, mode: 'shared' };
    const alone = async (locks) => { try { return await L.onlyPage({ locks, name: NAME }); } catch (e) { return `threw: ${e && e.message}`; } };
    const cases = [
      ['exactly one holder', locksOf([me]), true],
      ['one holder beside other names on the origin', locksOf([me, { name: `${L.PAGE_LOCK}:http://127.0.0.1:1/other/`, mode: 'shared' }, { name: 'something-else', mode: 'exclusive' }]), true],
      ['a hole in the listing', locksOf([null, me]), true],
      ['two holders (a second page)', locksOf([me, { ...me }]), false],
      ['one holder and one page still asking', locksOf([me], { answer: { held: [me], pending: [{ ...me }] } }), false],
      ['no holder (its own lock is not listed)', locksOf([]), false],
      ['only another name', locksOf([{ name: 'something-else', mode: 'shared' }]), false],
      ['no lock manager', undefined, false],
      ['a lock manager without query', locksOf([me], { noQuery: true }), false],
      ['a listing that rejects', locksOf([me], { rejects: true }), false],
      ['a listing that throws', locksOf([me], { throws: true }), false],
      ['a listing with no answer', locksOf([me], { answer: null }), false],
      ['a listing without held', locksOf([me], { answer: {} }), false],
    ];
    for (const [what, locks, want] of cases) {
      const r = await alone(locks);
      if (r !== want) red.ALONE.push(`${what}: ${JSON.stringify(r)} (want ${want})`);
    }
  }
  const go = async (o) => { const s = attempt(L, o); let r; try { r = await L.autoTakeover(s.x); } catch (e) { r = `threw: ${e && e.message}`; } return { s, r }; };
  // NET
  {
    const net = async ({ onLine, res = { ok: true }, rejects = false, throws = false }) => {
      const e = { calls: 0, nav: { onLine }, probe: () => { e.calls++; if (throws) throw new Error('TypeError'); return rejects ? Promise.reject(new Error('Failed to fetch')) : Promise.resolve(res); } };
      let r; try { r = await L.netUp(e); } catch (x) { r = `threw: ${x && x.message}`; }
      return { r, calls: e.calls };
    };
    const off = await net({ onLine: false });
    if (off.r !== false || off.calls) red.NET.push(`offline by the browser's word: ${JSON.stringify(off.r)} with ${off.calls} request(s) (want false, none)`);
    for (const [what, o, want] of [
      ['online and the probe answers ok', { onLine: true }, true],
      ['an engine without onLine, the probe answers ok', { onLine: undefined }, true],
      ['the probe answers not ok (a 404, a 503)', { onLine: true, res: { ok: false } }, false],
      ['the probe answers nothing', { onLine: true, res: null }, false],
      ['the probe rejects (no network)', { onLine: true, rejects: true }, false],
      ['the probe throws', { onLine: true, throws: true }, false],
    ]) {
      const { r } = await net(o);
      if (r !== want) red.NET.push(`${what}: ${JSON.stringify(r)} (want ${want})`);
    }
    for (const [what, o] of [['the network does not answer', { online: false }], ['the network answer fails', { onlineRejects: true }], ['an answer that is not true (1)', { online: 1 }]]) {
      const { s } = await go(o);
      if (s.takes || s.store.size) red.NET.push(`${what}: ${s.takes} take-over(s), ${s.store.size} stored value(s) (want none: the old snapshot is the only whole one)`);
    }
    const down = await go({ online: false });
    if (down.r !== 'offline') red.NET.push(`the network does not answer: answered ${JSON.stringify(down.r)} (the probe's word is 'offline')`);
    const crowded = await go({ alone: false });
    if (crowded.s.onlineCalls) red.NET.push('not alone, and the network was still asked');
    const ok = await go({});
    if (ok.s.onlineCalls !== 1) red.NET.push(`idle and alone: the network was asked ${ok.s.onlineCalls} time(s) (want once)`);
  }
  // GUARDS
  {
    const quiet = [
      ['no waiting worker', { waiting: false }, null],
      ['no controller', { controller: false }, null],
      ['a reload under way', { reloading: true }, null],
      ['after Later', { dismissed: true }, null],
      ['a take-over already under way (a press)', { taking: true }, null],
      ['its own lock not granted yet', { held: false }, 'no-lock'],
      ['not idle', { idle: false }, 'busy'],
    ];
    for (const [what, o, word] of quiet) {
      const { s, r } = await go(o);
      if (s.takes || s.aloneCalls || s.onlineCalls || s.store.size) red.GUARDS.push(`${what}: ${s.takes} take-over(s), ${s.aloneCalls} lock listing(s), ${s.onlineCalls} network probe(s), ${s.store.size} stored value(s) (want none)`);
      if (word && r !== word) red.GUARDS.push(`${what}: answered ${JSON.stringify(r)} (the probe's word is '${word}')`);
    }
  }
  // RACE
  {
    const between = [
      ['the waiting worker went', (s) => { s.reg.waiting = null; }],
      ['the hall was left', (s) => { s.idle = false; }],
      ['Later was pressed', (s) => { s.dismissed = true; }],
      ['Reload was pressed', (s) => { s.taking = true; }],
      ['a reload started', (s) => { s.win.__obSwReloading = true; }],
      ['the controller went', (s) => { s.sw.controller = null; }],
    ];
    for (const [what, f] of between) {
      for (const [when, o] of [['the lock listing', { during: f }], ['the network probe', { duringNet: f }]]) {
        const { s } = await go(o);
        if (s.takes || s.store.size) red.RACE.push(`${what} while ${when} was in flight: ${s.takes} take-over(s), ${s.store.size} stored value(s) (want none)`);
      }
    }
    for (const [what, o] of [['not alone', { alone: false }], ['a listing that fails', { aloneRejects: true }], ['an answer that is not true (1)', { alone: 1 }], ['an answer that is not true (null)', { alone: null }]]) {
      const { s } = await go(o);
      if (s.takes) red.RACE.push(`${what}: ${s.takes} take-over(s) (want none: another tab's game is never interrupted)`);
      if (s.store.size) red.RACE.push(`${what}: the mark was written (the page could never try again once it is alone)`);
    }
    const na = await go({ alone: false });
    if (na.r !== 'not-alone') red.RACE.push(`not alone: answered ${JSON.stringify(na.r)} (the probe's word is 'not-alone')`);
  }
  // ONCE
  {
    const store = new Map();
    const first = await go({ store });
    if (first.r !== 'takeover' || first.s.takes !== 1) red.ONCE.push(`idle, alone, online, a worker waiting: answered ${JSON.stringify(first.r)} with ${first.s.takes} take-over(s) (want 'takeover', exactly 1)`);
    else if (!first.s.atTake.mark || !String(first.s.atTake.mark).includes(DOC_A)) red.ONCE.push(`at the take-over the stored mark was ${JSON.stringify(first.s.atTake.mark)} (want it stored before the take-over, carrying the document id ${DOC_A})`);
    const same = await go({ store, now: NOW + L.AUTO_FLOOR_MS });
    if (same.s.takes) red.ONCE.push(`the same document id a second time, the floor passed: ${same.s.takes} take-over(s) (want 0: a stalled take-over would loop)`);
    if (same.s.aloneCalls) red.ONCE.push('the same document id a second time still asked for the lock listing');
    const other = await go({ store, docId: DOC_B, now: NOW + L.AUTO_FLOOR_MS });
    if (other.s.takes !== 1) red.ONCE.push(`a new document id over the old mark, the floor passed: ${other.s.takes} take-over(s) (want 1: the next release is not blocked by the last one's mark)`);
  }
  // FLOOR
  {
    const store = new Map();
    const first = await go({ store });
    if (first.s.takes !== 1 || String(first.s.atTake && first.s.atTake.at) !== String(NOW)) red.FLOOR.push(`the first take-over: ${first.s.takes} take-over(s), time stored at the take-over ${JSON.stringify(first.s.atTake && first.s.atTake.at)} (want 1 and ${NOW}, stored before it starts)`);
    for (const [what, now, want] of [
      ['one minute after a take-over', NOW + 60000, 0],
      ['one millisecond under the floor', NOW + L.AUTO_FLOOR_MS - 1, 0],
      ['a clock that went back an hour', NOW - 3600000, 0],
      ['at the floor', NOW + L.AUTO_FLOOR_MS, 1],
    ]) {
      const r = await go({ store: new Map(store), docId: DOC_B, now });
      if (r.s.takes !== want) red.FLOOR.push(`a new document id ${what}: ${r.s.takes} take-over(s) (want ${want})`);
      if (!want && (r.s.aloneCalls || r.s.onlineCalls)) red.FLOOR.push(`a new document id ${what}: the lock listing or the network was still asked`);
      if (!want && r.r !== 'floor') red.FLOOR.push(`a new document id ${what}: answered ${JSON.stringify(r.r)} (the probe's word is 'floor')`);
    }
  }
  // STORAGE
  {
    const thr = () => { throw new Error('SecurityError'); };
    const dropTime = new Map();
    for (const [what, o] of [['get throws', { get: thr }], ['set throws', { set: thr }], ['set not read back', { set: () => {} }],
      ['the time not read back', { store: dropTime, set: (k, v) => { if (k !== L.AUTO_AT_KEY) dropTime.set(k, String(v)); } }]]) {
      const { s } = await go(o);
      if (s.takes) red.STORAGE.push(`${what}: ${s.takes} take-over(s) (want none: without the stored mark and time a loop could not be bounded)`);
    }
  }
  if (SCHED.length) red.GUARDS.push(`the slice scheduled ${SCHED.join(', ')} (a deferred effect escapes every clause's count)`);
  // WIRING (source text of watchUpdates)
  {
    if (!/function offer\(\) \{\n\s*tryAuto\(\);/.test(src)) red.WIRING.push('offer() does not start with tryAuto()');
    const m = src.match(/const pageTakeover = \(\) => \{\n([\s\S]*?)\n {2}\};\n/);
    if (!m) red.WIRING.push('pageTakeover was not found');
    else {
      const blk = m[1];
      const at = ['taking = true;', 'document.body.inert = true', 'setTimeout(reloadOnce, RELOAD_BELT_MS);', 'const next = reg.waiting;', "next.postMessage({ ob: 'skip-waiting' })", 'retriggerTakeover(next)'].map((s) => blk.indexOf(s));
      if (at.some((i) => i < 0)) red.WIRING.push(`pageTakeover lacks a part of the Reload press (flag, inert, belt, waiting, message, re-trigger: ${JSON.stringify(at)})`);
      else {
        if (at.some((i, k) => k > 0 && i < at[k - 1])) red.WIRING.push(`pageTakeover is not in the Reload press's order (flag, inert, belt, waiting, message, re-trigger: ${JSON.stringify(at)})`);
        const before = blk.slice(0, at[2]);
        const lineStart = before.slice(before.lastIndexOf('\n') + 1);
        const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
        if (!/^\s*$/.test(lineStart) || depth !== 0 || /\breturn\b/.test(before.replace(/\/\/.*$/gm, ''))) red.WIRING.push('the belt is not an unconditional statement at the top of pageTakeover');
        if (!/try \{\s*retriggerTakeover\(next\);\s*\} catch/.test(blk)) red.WIRING.push('the re-trigger is not guarded by a try');
        if (!/\} else reloadOnce\(\);/.test(blk)) red.WIRING.push('without a waiting worker pageTakeover does not reload');
      }
    }
    // the press sets the same flag, at the top level of its handler, before its belt
    {
      const anchor = "button('ob-btn--primary', 'update.reload', () => {";
      const h = src.indexOf(anchor);
      const belt = h < 0 ? -1 : src.indexOf('setTimeout(reloadOnce, RELOAD_BELT_MS);', h);
      const flag = h < 0 ? -1 : src.indexOf('\n      taking = true;', h);
      if (h < 0 || belt < 0) red.WIRING.push("the Reload handler or its belt was not found");
      else if (flag < 0 || flag > belt) red.WIRING.push('the Reload press does not set the take-over flag before its belt (the poll could start a second belt and re-trigger train)');
    }
    const call = src.match(/autoTakeover\(\{\n([\s\S]*?)\n {4}\}\)\.then\(/);
    if (!call) red.WIRING.push("tryAuto's autoTakeover({ … }) call was not found");
    else {
      for (const part of ['dismissed: () => dismissed', 'taking: () => taking', 'held: () => pageLock', 'idle: () => takeoverIdle()', 'alone: () => onlyPage({ locks: navigator.locks, name: lockName })',
        'online: () => netUp()', 'now: () => Date.now()', 'getMark: (key) => sessionStorage.getItem(key)', 'setMark: (key, value) => sessionStorage.setItem(key, value)', 'take: pageTakeover']) {
        if (!call[1].includes(part)) red.WIRING.push(`tryAuto does not pass \`${part}\``);
      }
    }
    for (const [what, text] of [
      ['the lock is not named with the registration scope', 'const lockName = `${PAGE_LOCK}:${reg.scope}`;'],
      ['the page lock is not one shared lock held for the page\'s life', "navigator.locks.request(lockName, { mode: 'shared' }, () => { pageLock = true; return new Promise(() => {}); })"],
      ['automation boots are not switched off unless asked', "if (ask !== '1' && navigator.webdriver) { autoOn = false; counted = false; }"],
      ['?swauto=0 does not switch it off', "else if (ask === '0') autoOn = false;"],
      ['tryAuto has no entry guard, or it does not stop behind a take-over under way', 'if (!autoOn || autoBusy || taking || dismissed || !reg.waiting || !sw.controller) return;'],
      ['the mark is not cleared only with no worker waiting', 'try { if (!reg.waiting) sessionStorage.removeItem(AUTO_KEY); } catch { autoOn = false; /* no storage */ }'],
      ['a final answer re-arms the poll', "if (why === 'takeover' || why === 'tried' || why === 'unstored') return;"],
      ['the poll is not re-armed by AUTO_POLL_MS, or a failed network probe does not wait AUTO_OFFLINE_MS', "autoTimer = setTimeout(tryAuto, why === 'offline' ? AUTO_OFFLINE_MS : AUTO_POLL_MS);"],
      ['the probe does not carry the last word', "auto: autoOn ? autoState : 'off'"],
      ['a controlled page does not ask for a new sw.js itself after it attaches (or automation boots do too)', '\n  if (autoOn && sw.controller) setTimeout(check, ATTACH_CHECK_MS);\n'],
    ]) {
      if (!src.includes(text)) red.WIRING.push(what);
    }
    if (src.includes('removeItem(AUTO_AT_KEY)')) red.WIRING.push("the take-over's time is cleared somewhere (the floor would not hold across boots)");
  }
  // PINS
  {
    const READING = "(game?.shotIndex ?? 0) > 0 && !machine.is('WIN')";
    if (!shell.includes(`    matchLive: () => ${READING},`)) red.PINS.push('shell.js: __shell.matchLive is not the live-match reading');
    if (!shell.includes(`    const live = ${READING};`)) red.PINS.push("shell.js: the quick-play verb's reading moved (matchLive must follow it)");
    const sel = atelier.match(/const MODAL_OPEN_SEL = '([^']*)'\s*\+ '([^']*)';/);
    if (!sel) red.PINS.push("ateliercue.js: MODAL_OPEN_SEL was not found (the modal-layer selector's source)");
    else if (sel[1] + sel[2] !== L.MODAL_UP_SEL) red.PINS.push('MODAL_UP_SEL is not ateliercue.js\'s MODAL_OPEN_SEL');
    for (const [file, text, what] of [
      [playback, "    document.documentElement.classList.add('ob-pb-live');", 'playback.js no longer sets html.ob-pb-live when the player is built'],
      [playback, "    document.documentElement.classList.remove('ob-pb-live');", 'playback.js no longer clears html.ob-pb-live'],
      [playback, '    playerOpen: () => !!pb,', 'playback.js: __playback.playerOpen moved'],
      [playback, '    cardOpen: () => !!card,', 'playback.js: __playback.cardOpen moved'],
      [playback, '    opening: () => opening || pendingSession,', 'playback.js: __playback.opening moved'],
      [exporter, '    holdsShot,', 'export.js: __export.holdsShot is gone'],
      [exporter, "    return !!opening || !!modal || uiState === 'exporting' || hdBusy || finalizing;", 'export.js: holdsShot no longer covers the dialog and a run in flight'],
      [recorder, '    recording: () => !!rec,', 'record.js: __record.recording moved'],
    ]) {
      if (!file.includes(text)) red.PINS.push(what);
    }
    if (!(L.AUTO_POLL_MS >= 1000)) red.PINS.push(`AUTO_POLL_MS = ${L.AUTO_POLL_MS} ms (want no faster than 1000)`);
    if (!(L.AUTO_FLOOR_MS >= MIN_FLOOR_MS)) red.PINS.push(`AUTO_FLOOR_MS = ${L.AUTO_FLOOR_MS} ms (want no shorter than ${MIN_FLOOR_MS})`);
    if (!(L.AUTO_OFFLINE_MS >= 30000)) red.PINS.push(`AUTO_OFFLINE_MS = ${L.AUTO_OFFLINE_MS} ms (want no shorter than 30000: a failed probe must not repeat every second)`);
    if (!(L.NET_PROBE_MS >= 1000 && L.NET_PROBE_MS <= 30000)) red.PINS.push(`NET_PROBE_MS = ${L.NET_PROBE_MS} ms (want 1000 to 30000)`);
    if (!(L.ATTACH_CHECK_MS >= 0 && L.ATTACH_CHECK_MS <= 30000)) red.PINS.push(`ATTACH_CHECK_MS = ${L.ATTACH_CHECK_MS} ms (want at most 30000)`);
  }
  // DEFAULTS
  {
    B.browser = { win: { __shell: { isOpen: () => true, matchLive: () => false, busy: () => false } }, doc: page({}).env.doc, locks: locksOf([{ name: L.PAGE_LOCK, mode: 'shared' }]), onLine: true, fetchOk: true, fetched: [] };
    let a = null, b = null, c = null, n = null, threw = null;
    try {
      a = L.takeoverIdle();
      b = await L.onlyPage();
      n = await L.netUp();
      B.browser.win.__shell.isOpen = () => false;
      c = L.takeoverIdle();
    } catch (e) { threw = e; }
    if (threw) red.DEFAULTS.push(`the default envs throw: ${threw.message}`);
    else {
      if (a !== true || c !== false) red.DEFAULTS.push(`the default takeoverIdle answered ${JSON.stringify(a)} in the hall and ${JSON.stringify(c)} out of it (want true, false: it reads window.__shell)`);
      if (b !== true) red.DEFAULTS.push(`the default onlyPage answered ${JSON.stringify(b)} with one holder (want true: the listing is called on navigator.locks)`);
      const [u, init] = B.browser.fetched[0] || [];
      if (n !== true || B.browser.fetched.length !== 1) red.DEFAULTS.push(`the default netUp answered ${JSON.stringify(n)} with ${B.browser.fetched.length} request(s) (want true, one: a bare fetch)`);
      else if (!init || !init.signal || init.signal.boundMs !== L.NET_PROBE_MS) red.DEFAULTS.push(`the default netUp's request carries no time bound of NET_PROBE_MS (${JSON.stringify(init)}): a request that never answers would hold the attempt`);
      else if (u !== RETRIGGER || !init || init.cache !== 'no-store') red.DEFAULTS.push(`the default netUp asked ${JSON.stringify(u)} with ${JSON.stringify(init)} (want the re-trigger script with cache 'no-store': a cached answer says nothing of the network)`);
    }
  }
  return red;
}
async function judge(files) {
  SCHED.length = 0;
  try {
    const L = lift(files.src);
    if (L.invalid) return { invalid: [L.invalid], red: {} };
    return { invalid: [], red: await judgeLifted(L, files) };
  } catch (e) { return { invalid: [`threw: ${e && e.message}`], red: {} }; }
}

// file: swupdate.js ('src') unless named
const PLANTS = [
  { mech: 'IDLE', name: 'the hall is not asked', old: '    if (!shell || shell.isOpen() !== true) return false; // not in the hall (or no shell yet)\n', new: '    if (!shell) return false;\n' },
  { mech: 'IDLE', name: 'a live match is ignored', old: '    if (shell.matchLive() !== false) return false; // a shot has been taken and the rack is not won\n', new: '' },
  { mech: 'IDLE', name: 'an old shell counts as idle', old: 'shell.matchLive() !== false', new: 'shell.matchLive?.() === true' },
  { mech: 'IDLE', name: 'a busy shell is ignored', old: '    if (shell.busy() !== false) return false; // a flight, the open ramp or a keys change\n', new: '' },
  { mech: 'IDLE', name: 'the replay class is not read', old: "    if (env.doc.documentElement.classList.contains('ob-pb-live')) return false; // a replay is up\n", new: '' },
  { mech: 'IDLE', name: 'the save card is ignored', old: 'pb.cardOpen() !== false || ', new: '' },
  { mech: 'IDLE', name: 'a session opening is ignored', old: ' || pb.opening())) return false;', new: ')) return false;' },
  { mech: 'IDLE', name: 'an export in flight is ignored', old: '    if (env.win.__export && env.win.__export.holdsShot() !== false) return false; // an export dialog building or open, a run in flight\n', new: '' },
  { mech: 'IDLE', name: 'a recording is ignored', old: '    if (env.win.__record && env.win.__record.recording() !== false) return false; // the recorder is capturing\n', new: '' },
  { mech: 'IDLE', name: 'a painted layer is ignored', old: '      if (layer.getClientRects().length) return false; // painted = open\n', new: '' },
  { mech: 'IDLE', name: 'a textarea is ignored', old: "at.tagName === 'TEXTAREA'", new: "at.tagName === 'TEXTAREA-X'" },
  { mech: 'IDLE', name: 'a failure reads as idle', old: '  } catch { return false; } // a shell or a hook without one of its words, a throwing query: not idle', new: '  } catch { return true; }' },
  { mech: 'ALONE', name: 'two pages read as alone', old: '      return holders === 1;', new: '      return holders >= 1;' },
  { mech: 'ALONE', name: 'no lock manager reads as alone', old: "    if (!env.locks || typeof env.locks.query !== 'function') return Promise.resolve(false);", new: "    if (!env.locks || typeof env.locks.query !== 'function') return Promise.resolve(true);" },
  { mech: 'ALONE', name: 'a failed listing reads as alone', old: '    }, () => false);\n', new: '    }, () => true);\n' },
  { mech: 'ALONE', name: 'every name is counted', old: '.filter((l) => l && l.name === env.name)', new: '.filter((l) => l)' },
  { mech: 'ALONE', name: 'a page still asking is not counted', old: ', ...((listed && listed.pending) || [])', new: '' },
  { mech: 'NET', name: "the browser's offline word is ignored", old: '    if (env.nav.onLine === false) return Promise.resolve(false);\n', new: '' },
  { mech: 'NET', name: 'a failed probe reads as online', old: '    return env.probe().then((res) => !!res && res.ok === true, () => false);', new: '    return env.probe().then((res) => !!res && res.ok === true, () => true);' },
  { mech: 'NET', name: 'any answer reads as online', old: '!!res && res.ok === true', new: '!!res' },
  { mech: 'NET', name: 'the attempt does not wait for the network', old: "      if (up !== true) return 'offline';\n", new: '' },
  { mech: 'NET', name: 'a failed network answer takes over', old: "    }, () => 'offline');", new: "    }, () => { x.take(); return 'takeover'; });" },
  { mech: 'GUARDS', name: 'no own-lock guard', old: "  if (!x.held()) return Promise.resolve('no-lock'); // this page's own lock is not granted yet: it cannot count itself\n", new: '' },
  { mech: 'GUARDS', name: 'no idle guard before the listing', old: "  if (!x.idle()) return Promise.resolve('busy');\n", new: '' },
  { mech: 'GUARDS', name: 'a dismissed page takes over', old: ' && !x.dismissed()', new: '' },
  { mech: 'GUARDS', name: 'a press in flight is not seen', old: ' && !x.taking();', new: ';' },
  { mech: 'GUARDS', name: 'no controller guard', old: '!!x.reg.waiting && !!x.sw.controller && ', new: '!!x.reg.waiting && ' },
  { mech: 'GUARDS', name: 'a timer inside the attempt', old: "  if (!ready()) return Promise.resolve('skip');", new: "  if (!ready()) { setTimeout(() => x.take(), 0); return Promise.resolve('skip'); }" },
  { mech: 'RACE', name: 'no second look after the answers', old: "      if (!ready() || !x.idle()) return 'changed';\n", new: '' },
  { mech: 'RACE', name: 'the hall is not read again', old: "      if (!ready() || !x.idle()) return 'changed';", new: "      if (!ready()) return 'changed';" },
  { mech: 'RACE', name: 'a truthy answer counts as alone', old: "    if (alone !== true) return 'not-alone';", new: "    if (!alone) return 'not-alone';" },
  { mech: 'RACE', name: 'a failed listing takes over', old: "  }, () => 'not-alone');", new: "  }, () => { x.take(); return 'takeover'; });" },
  { mech: 'ONCE', name: 'no tried guard', old: "    if (x.getMark(AUTO_KEY) === mark) return Promise.resolve('tried');\n", new: '    x.getMark(AUTO_KEY);\n' },
  { mech: 'ONCE', name: 'the mark without the document id', old: '  const mark = `1:${x.docId}`;', new: "  const mark = '1';" },
  { mech: 'ONCE', name: 'the mark stored after the take-over',
    old: "      try {\n        x.setMark(AUTO_KEY, mark);\n        x.setMark(AUTO_AT_KEY, at);\n        if (x.getMark(AUTO_KEY) !== mark || x.getMark(AUTO_AT_KEY) !== at) return 'unstored';\n      } catch { return 'unstored'; }\n      x.take();\n      return 'takeover';\n",
    new: "      x.take();\n      try { x.setMark(AUTO_KEY, mark); x.setMark(AUTO_AT_KEY, at); } catch { /* late */ }\n      return 'takeover';\n" },
  { mech: 'ONCE', name: 'an undeclared binding (a ReferenceError in the strict module)', old: '  const mark = `1:${x.docId}`;', new: '  mark = `1:${x.docId}`;' },
  { mech: 'FLOOR', name: 'no floor', old: "    if (last > 0 && !(x.now() - last >= AUTO_FLOOR_MS)) return Promise.resolve('floor'); // also a clock that went back\n", new: '' },
  { mech: 'FLOOR', name: 'a clock that went back passes', old: '!(x.now() - last >= AUTO_FLOOR_MS)', new: 'x.now() >= last && x.now() - last < AUTO_FLOOR_MS' },
  { mech: 'FLOOR', name: 'the floor one millisecond short', old: '!(x.now() - last >= AUTO_FLOOR_MS)', new: '!(x.now() - last >= AUTO_FLOOR_MS - 1)' },
  { mech: 'FLOOR', name: 'the time is stored after the take-over', old: "        x.setMark(AUTO_AT_KEY, at);\n        if (x.getMark(AUTO_KEY) !== mark || x.getMark(AUTO_AT_KEY) !== at) return 'unstored';\n      } catch { return 'unstored'; }\n      x.take();\n",
    new: "        if (x.getMark(AUTO_KEY) !== mark) return 'unstored';\n      } catch { return 'unstored'; }\n      x.take();\n      try { x.setMark(AUTO_AT_KEY, at); } catch { /* late */ }\n" },
  { mech: 'STORAGE', name: 'no read-back', old: "        if (x.getMark(AUTO_KEY) !== mark || x.getMark(AUTO_AT_KEY) !== at) return 'unstored';\n", new: '' },
  { mech: 'STORAGE', name: "the time's read-back is dropped", old: ' || x.getMark(AUTO_AT_KEY) !== at', new: '' },
  { mech: 'STORAGE', name: 'a throwing store fails open', old: "      } catch { return 'unstored'; }\n      x.take();", new: '      } catch { /* fail open */ }\n      x.take();' },
  { mech: 'WIRING', name: 'offer never tries', old: '    tryAuto(); // #1388: a worker waits — the page may take it over by itself (idle, alone, once)\n', new: '' },
  { mech: 'WIRING', name: 'the belt removed', old: '    setTimeout(reloadOnce, RELOAD_BELT_MS);\n    const next = reg.waiting;\n', new: '    const next = reg.waiting;\n' },
  { mech: 'WIRING', name: 'a conditional belt', old: '    setTimeout(reloadOnce, RELOAD_BELT_MS);\n    const next = reg.waiting;\n', new: '    if (!reg.waiting) setTimeout(reloadOnce, RELOAD_BELT_MS);\n    const next = reg.waiting;\n' },
  { mech: 'WIRING', name: 'the re-trigger unguarded', old: 'try { retriggerTakeover(next); } catch { /* the belt is the retry */ }', new: 'retriggerTakeover(next);' },
  { mech: 'WIRING', name: "the page's take-over does not set the flag", old: '    taking = true; // autoTakeover read it false in this task: a press never got there first\n', new: '' },
  { mech: 'WIRING', name: 'the press does not set the flag', old: '      taking = true; // #1388: the automatic part stands down behind a press\n', new: '' },
  { mech: 'WIRING', name: 'the poll does not stop behind a press', old: 'if (!autoOn || autoBusy || taking || dismissed', new: 'if (!autoOn || autoBusy || dismissed' },
  { mech: 'WIRING', name: 'automation boots take over', old: "    if (ask !== '1' && navigator.webdriver) { autoOn = false; counted = false; }\n    else if (ask === '0') autoOn = false;\n", new: "    if (ask === '0') autoOn = false;\n" },
  { mech: 'WIRING', name: 'an exclusive lock', old: "{ mode: 'shared' }", new: "{ mode: 'exclusive' }" },
  { mech: 'WIRING', name: 'the mark cleared with a worker waiting', old: 'if (!reg.waiting) sessionStorage.removeItem(AUTO_KEY);', new: 'sessionStorage.removeItem(AUTO_KEY);' },
  { mech: 'WIRING', name: "the take-over's time cleared at boot", old: 'if (!reg.waiting) sessionStorage.removeItem(AUTO_KEY);', new: 'if (!reg.waiting) { sessionStorage.removeItem(AUTO_KEY); sessionStorage.removeItem(AUTO_AT_KEY); }' },
  { mech: 'WIRING', name: 'the page never asks after it attaches', old: '  if (autoOn && sw.controller) setTimeout(check, ATTACH_CHECK_MS);\n', new: '' },
  { mech: 'WIRING', name: 'automation boots ask after they attach too', old: '  if (autoOn && sw.controller) setTimeout(check, ATTACH_CHECK_MS);\n', new: '  if (sw.controller) setTimeout(check, ATTACH_CHECK_MS);\n' },
  { mech: 'WIRING', name: 'the page asks in the middle of its boot', old: '  if (autoOn && sw.controller) setTimeout(check, ATTACH_CHECK_MS);\n', new: '  if (autoOn && sw.controller) check();\n' },
  { mech: 'WIRING', name: 'one request a second after a failed probe', old: "autoTimer = setTimeout(tryAuto, why === 'offline' ? AUTO_OFFLINE_MS : AUTO_POLL_MS);", new: 'autoTimer = setTimeout(tryAuto, AUTO_POLL_MS);' },
  { mech: 'WIRING', name: 'a tried page keeps polling', old: "if (why === 'takeover' || why === 'tried' || why === 'unstored') return;", new: "if (why === 'takeover') return;" },
  { mech: 'PINS', name: 'the hook reads another state', file: 'shell', old: "    matchLive: () => (game?.shotIndex ?? 0) > 0 && !machine.is('WIN'),", new: '    matchLive: () => false,' },
  { mech: 'PINS', name: 'the replay class renamed', file: 'playback', old: "    document.documentElement.classList.add('ob-pb-live');", new: "    document.documentElement.classList.add('ob-pb-up');" },
  { mech: 'PINS', name: 'the export hold narrowed', file: 'exporter', old: "    return !!opening || !!modal || uiState === 'exporting' || hdBusy || finalizing;", new: "    return uiState === 'exporting';" },
  { mech: 'PINS', name: 'the recorder word renamed', file: 'recorder', old: '    recording: () => !!rec,', new: '    capturing: () => !!rec,' },
  { mech: 'PINS', name: 'a faster poll', old: 'const AUTO_POLL_MS = 1000;', new: 'const AUTO_POLL_MS = 100;' },
  { mech: 'PINS', name: 'a short floor', old: 'const AUTO_FLOOR_MS = 15 * 60 * 1000;', new: 'const AUTO_FLOOR_MS = 60 * 1000;' },
  { mech: 'PINS', name: 'a short wait after a failed probe', old: 'const AUTO_OFFLINE_MS = 60000;', new: 'const AUTO_OFFLINE_MS = 1000;' },
  { mech: 'PINS', name: 'a probe left open for ten minutes', old: 'const NET_PROBE_MS = 8000;', new: 'const NET_PROBE_MS = 600000;' },
  { mech: 'PINS', name: 'the check ten minutes after the attach', old: 'const ATTACH_CHECK_MS = 5000;', new: 'const ATTACH_CHECK_MS = 600000;' },
  { mech: 'PINS', name: 'the layer list drifts', old: ".ob-confirm:not([hidden]), dialog[open]';\nconst NOT_TEXT_INPUT_RE", new: ".ob-confirm:not([hidden])';\nconst NOT_TEXT_INPUT_RE" },
  { mech: 'DEFAULTS', name: 'the listing called off its owner', old: '    return env.locks.query().then((listed) => {', new: '    const q = env.locks.query; return q().then((listed) => {' },
  { mech: 'DEFAULTS', name: 'the default shell read from another object', old: 'export function takeoverIdle(env = { win: window, doc: document }) {', new: 'export function takeoverIdle(env = { win: {}, doc: document }) {' },
  { mech: 'DEFAULTS', name: 'the probe answered by the HTTP cache', old: "probe: () => fetch(RETRIGGER_URL, { cache: 'no-store', signal: AbortSignal.timeout(NET_PROBE_MS) })", new: 'probe: () => fetch(RETRIGGER_URL, { signal: AbortSignal.timeout(NET_PROBE_MS) })' },
  { mech: 'DEFAULTS', name: 'the probe without a time bound', old: "probe: () => fetch(RETRIGGER_URL, { cache: 'no-store', signal: AbortSignal.timeout(NET_PROBE_MS) })", new: "probe: () => fetch(RETRIGGER_URL, { cache: 'no-store' })" },
  { mech: 'DEFAULTS', name: 'a bare fetch handed over as the probe', old: "probe: () => fetch(RETRIGGER_URL, { cache: 'no-store', signal: AbortSignal.timeout(NET_PROBE_MS) })", new: 'probe: fetch' },
];

let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => { if (!verdictPrinted) { verdictPrinted = true; console.log('[auto] INVALID: no verdict'); process.exitCode = 2; } });

const args = process.argv.slice(2);
const srcPath = path.resolve(args.includes('--src') ? args[args.indexOf('--src') + 1] : SRC_DEFAULT);
const app = (name) => fs.readFileSync(path.join(WEB, 'app', name), 'utf8');
const FILES = {
  src: fs.readFileSync(srcPath, 'utf8'),
  shell: app('shell.js'), atelier: app('ateliercue.js'), playback: app('playback.js'), exporter: app('export.js'), recorder: app('record.js'),
};
if (!args.includes('--selftest')) {
  const { invalid, red } = await judge(FILES);
  if (invalid.length) verdict(`[auto] verdict INVALID: ${invalid.join('; ')}`, 2);
  for (const m of MECHS) console.log(`[auto] ${red[m].length ? 'FAIL' : 'ok'} ${m}${red[m].length ? `: ${red[m].join('; ')}` : ''}`);
  const reds = MECHS.filter((m) => red[m].length);
  if (reds.length) verdict(`[auto] verdict FAIL — ${reds.join(', ')}`, 1);
  verdict(`[auto] verdict PASS — ${MECHS.length} mechanisms (${MECHS.join(', ')})`, 0);
}
const base = await judge(FILES);
if (base.invalid.length || MECHS.some((m) => base.red[m].length)) verdict(`[auto selftest] the tree is not green: ${JSON.stringify(base)}`, 2);
let bad = 0, collateral = 0;
for (const p of PLANTS) {
  const key = p.file || 'src';
  const n = FILES[key].split(p.old).length - 1;
  if (n !== 1) { console.log(`[auto selftest] INVALID plant "${p.name}": anchor count ${n}`); bad++; continue; }
  const r = await judge({ ...FILES, [key]: FILES[key].replace(p.old, () => p.new) });
  const hit = MECHS.filter((m) => r.red[m] && r.red[m].length);
  // its own mechanism must go red; a plant may also break clauses that stand on it (collateral)
  const ok = !r.invalid.length && hit.includes(p.mech);
  if (ok && hit.length > 1) collateral++;
  console.log(`[auto selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> red ${JSON.stringify(hit)}${r.invalid.length ? ` invalid ${JSON.stringify(r.invalid)}` : ''}`);
  if (!ok) bad++;
}
verdict(bad ? `[auto selftest] FAIL (${bad})` : `[auto selftest] OK: ${PLANTS.length} plants each caught on its own mechanism (${collateral} with collateral)`, bad ? 1 : 0);
