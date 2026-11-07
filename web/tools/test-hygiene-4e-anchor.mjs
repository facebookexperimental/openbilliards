// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-hygiene-4e-anchor.mjs — #1158: e2e-harness-hygiene's arm 4e judges the loser's refusal against the LATEST of
// three anchors: the frozen session's reap, a GH-665 retained-profile release (the first caller's `[launch] :<port>
// — previous session … retained-ownership retry` line), and the last HTTP-readiness answer from the served origin (a
// relaunch reaches the launch lock right after it, so a slow static server must not count). Real runs produce
// neither a retained release nor a slow readiness on demand, so this file runs the arm's OWN text — the block
// between '// ---- arm 4e:' and '// ---- arm 5:' in the suite, built with the suite's bindings — against scripted
// stand-ins: launchChrome first fetches its readiness from a local server of this file (the server holds the answer
// for a scripted delay), then resolves the winner or rejects the loser at set times, and can log the retained-release
// line; pidAlive reports the frozen session gone at a set time. Every scripted time is an instant on a VIRTUAL clock:
// the block's own time sources (Date, setInterval/clearInterval, setTimeout/clearTimeout, and the injected sleep and
// pidAlive) are this file's scheduler, which moves only while no microtask is pending and none of this file's own
// counted requests is in flight — so no load stall on the runner can move an instant (#1193: on real timers one 950 ms stall over a scripted instant reddened a
// row while the arm was right, and a stall over an anchor flipped the guard's verdict). The frozen session itself is a
// real stand-in process of this file (the arm SIGSTOPs it), ended by its recorded pid — also when the probe itself is
// signalled (SIGTERM / SIGINT / SIGHUP), throws, or exits. Plain node, no browser.
//
//   A0 setup, a lint: the arm-4e block is found once in the suite and builds, the import() hook is live, and the
//      block's code names no clock the scheduler does not own and no evaluator, awaits only its pinned set, and holds
//      no slash whose reading tokens alone cannot decide
//   A1 control: no retained release; the loser is refused 30 ms after the reap: the guard row passes, the
//      timing line reports no retained release
//   A2 the retained release lands 2000 ms after the reap and the refusal 400 ms after the release (2400 ms after
//      the reap): the guard row PASSES — the later anchor is the release
//   A3 the retained release lands 1000 ms after the reap and the refusal 2600 ms after the release: the guard row
//      FAILS by name, judged from the release
//   A4 A2's script (refusal at 2900 ms) with the retained-release line for ANOTHER port: the line is not this
//      port's, so the reap stays the anchor and the guard row FAILS
//   A5 the loser's readiness answered 5000 ms after the race began (a slow static server), the refusal 50 ms after
//      it: the guard row PASSES — the anchor is the loser's arrival (review P2; the arm at 73a12902 is red here)
//   A6 the loser's readiness answered at 3000 ms and ANOTHER origin answered at 5000 ms (the real winner's CDP polls),
//      the refusal 2700 ms after the readiness: the guard row FAILS by name, judged from the served origin's arrival
//      (the arrival anchor is no free pass, and only the served origin counts)
// Rows judge the exact scripted instants: a readiness answer is stamped at its instant, and the reap and the release
// on the first tick of the arm's 20 ms timer at or after theirs.
// The RUN-TIME layer is authoritative; A0 (the block's code only: comments, string and template text and regex literals
// blanked) is a lint, defense in depth:
//   - deny by default: the block runs inside `with (SCOPE)`, so every name it does not declare resolves here. Its own
//     bindings and the clock-free ECMAScript built-ins pass; Date and the timers are the virtual clock; fetch reaches
//     only the served origin and its answers come back as a frozen facade; process, console, fs and globalThis are
//     proxies that pass only the members the arm uses (no symbol key, no prototype); any other name (every other host
//     global, eval, Function, Intl, Atomics, …) fails by name. While the rows run, the function constructors and
//     Date's are swapped, so no `.constructor` reaches code outside SCOPE or a real Date;
//   - import(): a hook fails it by name (it needs node --experimental-vm-modules; without it A0 fails by name);
//   - sticky record: each of these records (name, row) before it throws, in state the block cannot reach, and drive()
//     reads it after every turn and at the end, so a caught throw (a try/catch fallback) still fails the run;
//   - resources: a request this file did not count, or any real resource beyond the measured set (a file read, a DNS
//     lookup, another child) pending when virtual time would move or the block settles, fails the run by name.
// The block shares this realm, so it can rewrite intrinsics. The checks above, the verdict and the exit code run on
// functions captured before it runs: a rewrite cannot flip an allow, hide a violation, change the exit code or hand it a
// real object. A block that lies about itself (its own check() calls, its timing line, this file's request tag) is out
// of scope: it could always report the verdict it wants.
//
//   node --experimental-vm-modules web/tools/test-hygiene-4e-anchor.mjs      # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_HYGIENE_4E_SUITE=<copy>/web/tools/e2e-harness-hygiene.mjs node --experimental-vm-modules ...   # judge a plant copy
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITE = path.resolve(process.env.OB_HYGIENE_4E_SUITE || path.join(HERE, 'e2e-harness-hygiene.mjs'));
const WEB_DIR = path.resolve(path.dirname(SUITE), '..');
const { STALL_MS } = await import(pathToFileURL(path.join(WEB_DIR, 'tools', 'lib', 'hygiene-watchdog.mjs')).href);
// The block shares this realm and may rewrite intrinsics (Array.prototype, Reflect, …). Every decision that guards a
// clock or a door to one, the sticky record, the seals, the resource guard and the verdict therefore run on functions
// captured here, before the block runs, and on `k in s` over null-prototype objects: a rewrite cannot flip an allow,
// hide a violation, change the exit code, or hand the block a real object
const { apply: rApply, get: rGet, set: rSet, getOwnPropertyDescriptor: rOwn } = Reflect;
const { assign: oAssign, create: oCreate, defineProperty: oDefine, getOwnPropertyDescriptor: oOwn, freeze: oFreeze } = Object;
const strStartsWith = String.prototype.startsWith;
const resolvePath = path.resolve;
const nameSet = (names) => { const s = oCreate(null); for (const n of names) s[n] = true; return s; };
let rowsRun = 0;
let rowsBad = 0;
let badIds = '';
const row = (id, ok, desc, detail = '') => {
  rowsRun += 1;
  if (!ok) { rowsBad += 1; badIds += `${badIds === '' ? '' : ', '}${id}`; }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 900)}`}`);
};
// the virtual clock: one-shot and interval timers keyed by instant; virtual time moves only in drive()
const vclock = { now: 0, seq: 0, timers: new Map(), inflight: 0, uncounted: null, row: null };
// STICKY VIOLATIONS: whatever the block reaches outside what it may use is recorded here, (name, row), BEFORE the throw,
// in closure state the block can neither reach nor hook; drive() reads it after every step and at the end, so an arm
// that catches the throw (a try/catch fallback to another clock) still fails the run by name
let violationCount = 0;
let violationList = ''; // 'name in row, …'
const violate = (name) => {
  violationCount += 1;
  violationList += `${violationList === '' ? '' : ', '}${name} in ${vclock.row}`;
  throw new Error(`virtual clock: the arm reached ${name} (in ${vclock.row}), which it may not use: a clock the scheduler does not own, or a way to one`);
};
const violationError = () => new Error(`virtual clock: sticky violation(s) — ${violationList}: the arm reached what it may not use (recorded before the throw, so a caught throw still fails)`);
const VBASE = Date.now();
const vset = (fn, ms, every, args) => {
  const id = ++vclock.seq;
  vclock.timers.set(id, { id, at: vclock.now + Math.max(0, Math.trunc(Number(ms) || 0)), order: id, every, fn: () => fn(...args) });
  return id;
};
const vsetTimeout = (fn, ms, ...args) => vset(fn, ms, null, args);
const vsetInterval = (fn, ms, ...args) => { const p = Math.max(1, Math.trunc(Number(ms) || 0)); return vset(fn, p, p, args); };
const vclear = (id) => { vclock.timers.delete(id); };
// the virtual Date: a plain function, not a subclass, so no prototype chain leads from it to the real Date; its
// instances are real Dates, and Date.prototype.constructor points back to it while a row runs (seal() below)
const RealDate = Date;
function VDate(...a) {
  if (!new.target) return new RealDate(VBASE + vclock.now).toString();
  return a.length ? new RealDate(...a) : new RealDate(VBASE + vclock.now);
}
VDate.prototype = RealDate.prototype;
VDate.now = () => VBASE + vclock.now;
VDate.parse = RealDate.parse;
VDate.UTC = RealDate.UTC;
const vsleep = (ms) => new Promise((r) => vsetTimeout(r, ms));
const realTurn = () => new Promise((r) => setImmediate(r));
// the real resources a row may hold while virtual time moves (measured): the served origin and its sockets, the one
// stand-in child, and this process's own stdio; real timers and immediates cannot be told apart from this file's own,
// and the block reaches neither (SCOPE below). Anything else — a file read or close, a DNS lookup, another child — is
// real work the driver did not count, whatever its spelling (an await inside a Promise combinator included): the run
// fails by name rather than step over it
const RESOURCE_LIMIT = oFreeze({ __proto__: null, TCPServerWrap: 1, ProcessWrap: 1, PipeWrap: 3, TTYWrap: 3 });
const RESOURCE_ANY = nameSet(['TCPSocketWrap', 'Timeout', 'Immediate']);
const uncountedResources = () => { // '' when none
  const list = process.getActiveResourcesInfo();
  const n = oCreate(null);
  for (let i = 0; i < list.length; i++) n[list[i]] = (n[list[i]] ?? 0) + 1;
  let out = '';
  for (const r in n) if (!(r in RESOURCE_ANY) && n[r] > (RESOURCE_LIMIT[r] ?? 0)) out += `${out === '' ? '' : ', '}${r} x${n[r]}`;
  return out;
};
/** settle `pending` on the virtual clock: let real work run until idle (none of this file's I/O in flight; a microtask
 * chain of any length drains before the next setImmediate turn), then move the clock to the next due timer and fire
 * it. Equal instants fire by arming order, and an interval re-arms with a fresh order at each tick, so it sorts after
 * every timer armed before that re-arm. */
const drive = async (pending) => {
  let done = false;
  pending.then(() => { done = true; }, () => { done = true; });
  for (;;) {
    for (let i = 0; i < 3 || vclock.inflight > 0; i++) { // after every turn: also while I/O the block broke stays in flight
      await realTurn();
      if (violationCount) throw violationError();
    }
    if (vclock.uncounted !== null) throw new Error(`virtual clock: a request this file did not count reached the served origin (${vclock.uncounted}); the driver cannot hold time for it`);
    const foreignWork = uncountedResources(); // also at the end: the block may not settle with real work still pending
    if (foreignWork !== '') throw new Error(`virtual clock: real work the driver did not count is pending (${foreignWork}); it would step time over it`);
    if (done) return pending;
    let next = null;
    for (const tm of vclock.timers.values()) if (!next || tm.at < next.at || (tm.at === next.at && tm.order < next.order)) next = tm;
    if (!next) throw new Error('virtual clock: the arm is pending with no timer due and no I/O in flight');
    vclock.now = next.at;
    if (next.every) { next.at += next.every; next.order = ++vclock.seq; } else vclock.timers.delete(next.id);
    next.fn();
  }
};
/** { code, ambiguous }: the code of `s` — comments, string-literal text, template-literal text and regex literals
 * blanked in one left-to-right pass; a template's ${…} substitutions stay code (nested templates too), so A0's scans
 * see only code — and the line (1-based, in `s`) of the first slash whose reading tokens alone cannot decide, or null */
const codeOf = (s) => {
  let out = '';
  let i = 0;
  let ambiguous = null;
  const modes = []; // 'tpl' (template text) or a number (brace depth inside a ${…} substitution)
  const parens = []; // per open '(': 'hdr' after if/while/for/with (a statement header), else 'expr'
  let closed = null; // the kind of the ')' just emitted, until the next significant character
  const regexMayStart = () => { // by token context: after a header's ')', a keyword or an operator, a regex; otherwise a division
    const t = out.replace(/\s+$/, '');
    if (t === '') return true;
    const last = t[t.length - 1];
    // FAIL CLOSED: a regex only in a context that certainly opens one; any other or unknown context is a division, so
    // the text after the slash stays scanned as code (a false A0 FAIL is acceptable, a false PASS is not). Numeric
    // literals (1., .5, 1e3, 0x1f, 10n) end in a word character or '.', so they read as operands.
    if (last === ')') return closed === 'hdr';
    if (/(\+\+|--)$/.test(t)) return false; // a postfix operator ends an operand
    // REJECT, never guess: after '}' (a block, or an object literal) or `of` (a keyword, or a name in strict code too)
    // either reading is valid JavaScript, so A0 fails by name: rewrite that line
    if (last === '}' || /(^|[^\w$.])of$/.test(t)) { ambiguous ??= s.slice(0, i).split('\n').length; return false; }
    if (/[\w$]/.test(last)) return /(^|[^\w$.])(return|typeof|case|do|else|in|new|delete|void|throw|await|yield|instanceof)$/.test(t);
    return '(,=:[!&|?{;+-*%<>~^'.includes(last); // an operator or an opening bracket; '.', ']', quotes, the rest: division
  };
  while (i < s.length) {
    const top = modes[modes.length - 1];
    if (top === 'tpl') {
      if (s[i] === '\\') i += 2;
      else if (s[i] === '`') { modes.pop(); out += '`'; i++; } else if (s[i] === '$' && s[i + 1] === '{') { modes.push(0); out += '${'; i += 2; } else i++;
      continue;
    }
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === "'" || c === '"') { i++; while (i < s.length && s[i] !== c && s[i] !== '\n') i += s[i] === '\\' ? 2 : 1; i++; out += "''"; continue; }
    if (c === '`') { modes.push('tpl'); out += '`'; i++; continue; }
    if (c === '/' && regexMayStart()) { // a regex literal: its body (classes included) and flags
      i++;
      for (let cls = false; i < s.length && s[i] !== '\n'; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === '[') cls = true;
        else if (s[i] === ']') cls = false;
        else if (s[i] === '/' && !cls) break;
      }
      i++;
      while (i < s.length && /[a-z]/i.test(s[i])) i++;
      out += '/re/'; continue;
    }
    if (typeof top === 'number') {
      if (c === '{') modes[modes.length - 1] = top + 1;
      else if (c === '}' && top === 0) { modes.pop(); out += '}'; i++; continue; } else if (c === '}') modes[modes.length - 1] = top - 1;
    }
    if (c === '(') parens.push(/(^|[^\w$.])(if|while|for|with)\s*$|\bfor\s+await\s*$/.test(out) ? 'hdr' : 'expr');
    if (c === ')') { out += c; i++; closed = parens.pop() ?? 'expr'; continue; }
    if (!/\s/.test(c)) closed = null;
    out += c; i++;
  }
  return { code: out, ambiguous };
};
// the RUN-TIME layer (authoritative). The block is compiled as `with (scope) return async function () { "use strict";
// <block> }` and only the strict inner function runs (the sloppy wrapper is off the stack), so every name the block
// does not declare resolves through SCOPE, deny by default:
//   - its own bindings (check, launchChrome, url, … — set per row; fs is FS below);
//   - the clock-free ECMAScript built-ins and the host globals the arm uses (ALLOW; the served origin's answers that
//     fetch reads carry no Date header);
//   - the virtual clock (Date and the timers);
//   - process and console, through proxies that pass only the members the arm uses; globalThis / global (VGLOBAL)
//     resolve names the same way and write through only fetch (the arm's readiness wrapper);
//   - any other name on the real global — every other host global, eval and Function (both would run code in the REAL
//     global scope), Intl, Atomics, SharedArrayBuffer, WebAssembly, Temporal — records a violation and throws by name.
//     A name the real global lacks stays unresolvable, as in the suite.
const denied = (name) => new Proxy(function denied() {}, { get: (_, k) => violate(`${name}.${String(k)}`), apply: () => violate(name), construct: () => violate(name) });
// a proxy over a real object: it passes only the `allowed` string keys (and `then`, so an async function may return
// it), each function wrapped so the real object never reaches code the block may have rewritten; it writes through only
// the `writable` keys, shows no prototype, and fails by name on anything else, symbol keys included (node keeps real
// internals under them: a Stats' partial times, console's streams)
const allowOnly = (target, name, allowed, writable = nameSet([])) => {
  const pass = (k) => typeof k === 'string' && (k in allowed || k === 'then');
  return new Proxy(target, {
    get: (o, k) => {
      if (!pass(k)) return violate(`${name}.${String(k)}`);
      const v = rGet(o, k);
      return typeof v === 'function' ? (...a) => rApply(v, o, a) : v;
    },
    set: (o, k, v) => (typeof k === 'string' && k in writable ? rSet(o, k, v) : violate(`${name}.${String(k)} =`)),
    getOwnPropertyDescriptor: (o, k) => (pass(k) ? rOwn(o, k) : violate(`${name}.${String(k)}`)),
    defineProperty: (o, k) => violate(`${name}.${String(k)} (define)`),
    deleteProperty: (o, k) => violate(`delete ${name}.${String(k)}`),
    getPrototypeOf: () => null,
    setPrototypeOf: () => violate(`${name} (setPrototypeOf)`),
    preventExtensions: () => violate(`${name} (preventExtensions)`),
  });
};
const ALLOW = nameSet([
  'Object', 'Array', 'Number', 'String', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON', 'Promise', 'Map', 'Set', 'WeakMap',
  'WeakSet', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'AggregateError',
  'Reflect', 'Proxy', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'undefined', 'NaN', 'Infinity', 'URL', 'URLSearchParams',
]);
// fetch as the block sees it: the real fetch, to the served origin only (either spelling; any other host is real I/O
// the driver cannot hold time for, and a clock in its own right), its answers handed back as a frozen facade (node 22's
// fetch keeps real timing stamps under a Response's symbol keys). The URL is read with getters captured here: the block
// may rewrite URL.prototype, and it is the checked href that is fetched
const realFetch = fetch;
const textOf = Response.prototype.text;
const jsonOf = Response.prototype.json;
const headerOf = Headers.prototype.get;
const hrefOf = oOwn(URL.prototype, 'href').get;
const hostOf = oOwn(URL.prototype, 'host').get;
const protocolOf = oOwn(URL.prototype, 'protocol').get;
const servedHosts = oCreate(null); // filled once the served origin listens
const vfetch = async (input, init) => {
  const u = new URL(String(input));
  const href = rApply(hrefOf, u, []);
  if (rApply(protocolOf, u, []) !== 'http:' || !(rApply(hostOf, u, []) in servedHosts)) return violate(`fetch(${href})`);
  const res = await realFetch(href, init);
  const headers = res.headers;
  return oFreeze({
    __proto__: null, ok: res.ok, status: res.status, url: res.url, text: () => rApply(textOf, res, []), json: () => rApply(jsonOf, res, []),
    headers: oFreeze({ __proto__: null, get: (n) => rApply(headerOf, headers, [n]) }),
  });
};
const VIRTUAL = oFreeze({ __proto__: null, Date: VDate, setTimeout: vsetTimeout, setInterval: vsetInterval, clearTimeout: vclear, clearInterval: vclear });
const PROXIED = oFreeze({
  __proto__: null,
  process: allowOnly(process, 'process', nameSet(['kill', 'env'])),
  console: allowOnly(console, 'console', nameSet(['log', 'error']), nameSet(['log', 'error'])),
});
const resolveName = (k) => {
  if (k in VIRTUAL) return VIRTUAL[k];
  if (k in PROXIED) return PROXIED[k];
  if (k === 'globalThis' || k === 'global') return VGLOBAL;
  if (k === 'fetch') { const f = rGet(globalThis, 'fetch'); return f === realFetch ? vfetch : f; } // or the arm's own wrapper, once installed
  return k in ALLOW ? rGet(globalThis, k) : violate(k);
};
const VGLOBAL = new Proxy(globalThis, {
  get: (o, k) => (typeof k === 'string' ? resolveName(k) : violate(`globalThis[${String(k)}]`)),
  set: (o, k, v) => (k === 'fetch' ? rSet(o, k, v) : violate(`globalThis.${String(k)} =`)),
  getOwnPropertyDescriptor: (o, k) => {
    if (typeof k !== 'string') return violate(`globalThis[${String(k)}]`);
    const d = rOwn(o, k);
    return d === undefined || k in ALLOW ? d : { __proto__: null, value: resolveName(k), writable: true, enumerable: d.enumerable, configurable: true };
  },
  defineProperty: (o, k) => violate(`globalThis.${String(k)} (define)`),
  deleteProperty: (o, k) => violate(`delete globalThis.${String(k)}`),
  getPrototypeOf: () => null,
  setPrototypeOf: () => violate('globalThis (setPrototypeOf)'),
  preventExtensions: () => violate('globalThis (preventExtensions)'),
});
const injected = oCreate(null); // the block's own bindings, set per row
const SCOPE = new Proxy(oCreate(null), {
  has: (_, k) => typeof k === 'string' && (k in injected || k in globalThis),
  get: (_, k) => (typeof k !== 'string' ? undefined : k in injected ? injected[k] : resolveName(k)),
  set: (_, k) => violate(`${String(k)} =`),
});
// path and fs as injected. path is a frozen copy of the members a test may use (the module this file uses stays out of
// reach); fs passes the three calls the arm makes: a Stats passes no time field (a file's times are a real clock), and
// readFileSync takes a string path under the web tree and an encoding (no clock file such as /proc/uptime, no flags)
const PATH = oFreeze({
  __proto__: null, join: path.join, resolve: path.resolve, dirname: path.dirname, basename: path.basename, extname: path.extname,
  relative: path.relative, normalize: path.normalize, isAbsolute: path.isAbsolute, sep: path.sep,
});
const WEB_PREFIX = WEB_DIR + path.sep;
const STATS = nameSet(['ino', 'dev', 'mode', 'nlink', 'uid', 'gid', 'rdev', 'size', 'blksize', 'blocks', 'isFile', 'isDirectory', 'isSymbolicLink']);
const FS = allowOnly(oAssign(oCreate(null), {
  statSync: (p, o) => (o === undefined ? allowOnly(fs.statSync(p), 'fs.Stats', STATS) : violate('fs.statSync(…, options)')),
  existsSync: (p) => fs.existsSync(p),
  readFileSync: (p, o) => (typeof p === 'string' && (o === undefined || typeof o === 'string') && rApply(strStartsWith, resolvePath(p), [WEB_PREFIX])
    ? fs.readFileSync(p, o) : violate(`fs.readFileSync(${typeof p === 'string' ? p : typeof p})`)),
}), 'fs', nameSet(['statSync', 'existsSync', 'readFileSync']));
// while the rows run, any function's .constructor (Function, AsyncFunction and the generator kinds compile code in the
// REAL global scope, outside SCOPE) is a stand-in that fails by name, and a real Date's .constructor is the virtual Date
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const SEALS = [];
for (const F of [Function, AsyncFunction, Object.getPrototypeOf(function* () {}).constructor, Object.getPrototypeOf(async function* () {}).constructor]) SEALS.push([F.prototype, denied(F.name)]);
SEALS.push([RealDate.prototype, VDate]);
const seal = () => {
  const saved = oCreate(null);
  for (let i = 0; i < SEALS.length; i++) {
    const d = oOwn(SEALS[i][0], 'constructor');
    saved[i] = { __proto__: null, value: d.value, writable: d.writable, enumerable: d.enumerable, configurable: d.configurable };
    oDefine(SEALS[i][0], 'constructor', { __proto__: null, value: SEALS[i][1], writable: false, enumerable: false, configurable: true });
  }
  return () => { for (let i = 0; i < SEALS.length; i++) oDefine(SEALS[i][0], 'constructor', saved[i]); };
};
// import(): a hook records a violation and throws. It runs only under node --experimental-vm-modules: without the flag
// node rejects every import() in compiled code before any hook runs, so a caught import would leave no record — A0
// requires the hook live
const compileArm = (block) => vm.compileFunction(`with (scope) return async function () {\n"use strict";\n${block}\n};`, ['scope'],
  { filename: 'arm-4e-block', importModuleDynamically: (spec) => violate(`import(${spec})`) });
let importHook = false;
try { await vm.compileFunction('return import("node:path")', [], { importModuleDynamically: () => { importHook = true; throw new Error('probe'); } })(); } catch { /* the probe rejects either way */ }
// A0's lint list: what the scheduler does not own, and the doors to it; the block's code may name none of it (cdp.mjs's
// readiness fetch also passes signal: AbortSignal.timeout(…); the stand-in leaves it out on purpose, as a real abort
// timer would fire on a held answer)
const FOREIGN_CLOCKS = /\b(performance|process\.hrtime|process\.uptime|setImmediate|queueMicrotask|MessageChannel|Atomics\.wait\w*|AbortSignal\.timeout|Temporal|Intl\.DateTimeFormat|getBuiltinModule)\b|\bimport\s*\(|\bglobal\.|\bglobalThis\s*\[|\bglobalThis\.(Date|set\w+|clear\w+|performance|queueMicrotask)\b|\b(process|Atomics)\s*\[|(?<![\w$.])(eval|Function)\b(?!\s*:)|\bconstructor\b/;
// the block's await heads: the injected stand-ins and virtual sleep, the arm's saved real fetch (its requests reach the
// served origin, where an uncounted one fails the run), Promise combinators (what they wait on is guarded at run time
// by uncountedResources()), and the stand-in winner's methods
const AWAIT_NAMES = new Set(['launchChrome', 'sleep', 'fetchOrig', 'Promise.race', 'Promise.all', 'Promise.allSettled']);
const AWAIT_TAILS = ['.eval', '.closeAndWait'];
const unpinnedOf = (code) => {
  const out = /\bfor\s+await\b/.test(code) ? ['for await'] : [];
  for (const m of code.matchAll(/\bawait\b\s*(\(|[\w$][\w$.]*)?/g)) {
    const h = m[1] ?? '(none)';
    if (h === '(') out.push('await (');
    else if (!AWAIT_NAMES.has(h) && !AWAIT_TAILS.some((tail) => h.endsWith(tail))) out.push(h);
  }
  return out;
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const standIns = oCreate(null); // recorded stand-in pids still to end (the arm SIGSTOPs them); null-prototype, as above
const endStandIn = (pid) => { if (alive(pid)) { try { process.kill(pid, 'SIGCONT'); process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } delete standIns[pid]; };
const endAll = () => { for (const pid in standIns) endStandIn(Number(pid)); };
// #1235 (KF-024): a SIGKILLed stand-in keeps its ProcessWrap until node has processed the child's exit, and on a loaded runner that
// outlasted the next row's spawn: the virtual clock's guard (one ProcessWrap) then failed the probe by name ("ProcessWrap x2"). Each
// row therefore waits for its own stand-in's exit before it returns (real turns only, bounded; a stand-in that never exits fails the
// probe by name). endStandIn and endAll stay synchronous for the exit and signal paths.
const STANDIN_EXIT_NS = 10_000_000_000n;
const standInExit = async (child) => {
  const t0 = process.hrtime.bigint();
  while (child.exitCode === null && child.signalCode === null) {
    if (process.hrtime.bigint() - t0 > STANDIN_EXIT_NS) throw new Error(`stand-in ${child.pid} did not exit within ${STANDIN_EXIT_NS / 1_000_000n} ms after SIGKILL`);
    await realTurn();
  }
  await realTurn(); // the exit handler closes the handle; one more turn lets the close finish before the next row counts resources
};
setTimeout(() => { endAll(); console.log('FAIL watchdog — the probe exceeded 180 s'); console.log('HYGIENE-4E-ANCHOR SELFTEST FAIL (watchdog)'); process.exit(1); }, 180000).unref();
// review #1158 r2 P2: an interrupted probe must not leave a stand-in the arm SIGSTOPped (a stopped child cannot run
// its own orphan check): every way out ends each recorded stand-in, SIGCONT then SIGKILL, by its recorded pid only
const SIG_EXIT = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
for (const sig of Object.keys(SIG_EXIT)) process.on(sig, () => { endAll(); console.log(`FAIL signal — ${sig}`); process.exit(SIG_EXIT[sig]); });
process.on('uncaughtException', (e) => { endAll(); console.log(`FAIL uncaught exception — ${e?.stack ?? e}`); process.exit(1); });
process.on('exit', endAll);

const text = fs.readFileSync(SUITE, 'utf8');
const OPEN = '  // ---- arm 4e: CONCURRENT same-port relaunches';
const a0 = text.indexOf(OPEN); const b0 = a0 < 0 ? -1 : text.indexOf('  // ---- arm 5:', a0);
const once = a0 >= 0 && text.indexOf(OPEN, a0 + 1) < 0 && b0 > a0;
const { code, ambiguous } = once ? codeOf(text.slice(a0, b0)) : { code: '', ambiguous: null };
const foreign = (FOREIGN_CLOCKS.exec(code) ?? [null])[0]; // a clock the scheduler does not own, or a door to one
const unpinned = unpinnedOf(code); // an await outside the pinned set
const ambiguousAt = ambiguous === null ? null : `line ${text.slice(0, a0).split('\n').length - 1 + ambiguous}: ambiguous slash context; rewrite this line`;
let armOf = null; // the compiled block: armOf(SCOPE) is its inner function, strict as in the suite (an ES module)
if (once) { try { armOf = compileArm(text.slice(a0, b0)); } catch { /* syntax */ } }
const GUARD = "4e: the loser is refused BY THE OWNERSHIP GUARD (never a wipe under the winner, never the 15 s dead-endpoint poll)";
const GUARD_MSG = "launchChrome: :<port> is still owned by this process's LIVE session (pid 1) that was never closed — refusing (GH-665)";
const ARM_BASE = 30400; // the arm's CDP binding: only a label in its expected log line (nothing here binds it)
// the served origin the arm watches: a local server of this file that answers '/?d=<ms>&c=1' <ms> later on the virtual
// clock. Each of this file's requests carries c=1 and is in flight (real) from the caller's fetch until it arrives here,
// and again from the answer's instant until the caller has read it; while the answer is held, virtual time moves. A
// request without c=1 is one this file did not count: it is answered at once and drive() fails the run by name. No
// answer carries a Date header (through fetch, the block would read a real clock).
const served = http.createServer((req, res) => {
  res.sendDate = false;
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('c') !== '1') { vclock.uncounted ??= req.url; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  const d = Number(q.get('d')) || 0;
  vclock.inflight--;
  vsetTimeout(() => { vclock.inflight++; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); }, d);
});
await new Promise((r) => served.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${served.address().port}`;
const OTHER = `http://localhost:${served.address().port}`; // the same server under another origin
servedHosts[`127.0.0.1:${served.address().port}`] = true;
servedHosts[`localhost:${served.address().port}`] = true;

/** run the arm's block once as row `id` against a script: { reapMs, lossMs, winMs, readyMs?: [winner, loser], retained?:
 * { atMs, port } } (ms from the relaunches' start). Resolves { checks: {name: {ok, detail}}, timing } */
const runArm = async (id, script) => {
  vclock.now = 0; vclock.timers.clear(); vclock.inflight = 0; vclock.uncounted = null; vclock.row = id;
  // the stand-ins' own instants never coincide: an equal-instant pair would fire in the order the two relaunches'
  // requests happened to reach the server (both readiness answers are armed on arrival)
  const instants = [script.lossMs, script.winMs, script.retained?.atMs, script.otherOriginMs].filter((v) => v != null);
  if (new Set(instants).size !== instants.length) throw new Error(`runArm: two stand-in instants coincide (${instants.join(', ')})`);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-4e-'));
  const dir = path.join(stage, 'profile'); fs.mkdirSync(dir);
  const standIn = spawn(process.execPath, ['-e', 'setInterval(() => { if (process.ppid === 1) process.exit(0); }, 500)'], { stdio: 'ignore' });
  const aPid = standIn.pid;
  standIns[aPid] = true;
  let tRel = null;
  let calls = 0;
  const launchChrome = async (url, opts = {}) => {
    const n = ++calls; // this call's own number (read before any await)
    if (n === 1) return { pid: aPid, close() {} }; // A, the session the arm freezes
    if (tRel === null) tRel = vclock.now;
    const due = (ms) => vsleep(Math.max(0, tRel + ms - vclock.now));
    // the relaunch's HTTP readiness, fetched the way cdp.mjs fetches it (a URL object, its cache and redirect options)
    vclock.inflight++;
    try { await (await fetch(new URL(`/?d=${(script.readyMs ?? [0, 0])[n - 2]}&c=1`, ORIGIN), { cache: 'no-store', redirect: 'manual' })).text(); } finally { vclock.inflight--; }
    if (n === 2) { // the winner: logs the retained release (when scripted), then lands
      if (script.retained) {
        due(script.retained.atMs).then(() => console.error(`[launch] :${script.retained.port} — previous session (pid ${aPid}) released ${dir} on attempt 3 (GH-665 retained-ownership retry)`));
      }
      // a fetch to ANOTHER origin late in the race (the real winner's CDP endpoint polls): never an anchor
      if (script.otherOriginMs != null) due(script.otherOriginMs).then(() => { vclock.inflight++; return fetch(new URL('/?d=0&c=1', OTHER)).then((r) => r.text()).catch(() => {}).finally(() => { vclock.inflight--; }); });
      await due(script.winMs);
      return { pid: aPid + 100000, eval: async () => 2, closeAndWait: async () => { fs.rmSync(dir, { recursive: true, force: true }); return true; } };
    }
    await due(script.lossMs); // the loser
    throw new Error(GUARD_MSG.replace('<port>', String(opts.port)));
  };
  // the frozen session reads gone at reapMs; the real stand-in is ended below by its recorded pid
  const pidAlive = (pid) => (pid === aPid ? (tRel === null || vclock.now - tRel < script.reapMs) : alive(pid));
  const checks = {};
  const check = (name, ok, detail = '') => { checks[name] = { ok: !!ok, detail: String(detail) }; };
  let timing = null;
  const logOrig = console.log;
  console.log = (...a) => { const s = a.map(String).join(' '); if (s.startsWith('[hygiene] 4e timing:')) timing = s; else logOrig(...a); };
  try {
    oAssign(injected, { check, launchChrome, url: `${ORIGIN}/app.html?seed=1`, CDP: ARM_BASE, profileOf: () => dir, pidAlive, sleep: vsleep, fs: FS, path: PATH, WEB_DIR, STALL_MS });
    await drive(armOf(SCOPE)());
  } finally {
    console.log = logOrig;
    endStandIn(aPid);
    await standInExit(standIn);
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return { checks, timing };
};
const brief = (r) => JSON.stringify({ guard: r.checks[GUARD], timing: r.timing });

try {
  const builds = armOf !== null;
  row('A0', once && builds && importHook && foreign === null && unpinned.length === 0 && ambiguousAt === null,
    "setup, a lint (the run-time layer is authoritative): the arm-4e block is found once in the suite and builds, the import() hook is live, and the block's code names no clock the virtual scheduler does not own and no evaluator, awaits only its pinned set, and holds no slash whose reading tokens alone cannot decide",
    JSON.stringify({ found: a0 >= 0, once, builds, importHook: importHook || 'not live: run under node --experimental-vm-modules', foreign, unpinned, ambiguous: ambiguousAt }));
  if (once && builds) {
    const unseal = seal(); // across every row: a callback the block leaves behind cannot run unsealed between rows
    try {
      const armKey = ARM_BASE + 1; // the label the arm's log-line match keys on (its CDP + 1)
      const num = (re, str) => { const m = re.exec(str ?? ''); return m ? Number(m[1]) : null; };
      const timingOf = (r, what) => num(new RegExp(`${what} at (-?\\d+) ms`), r.timing);
      const afterOf = (r) => num(/refused (-?\d+) ms after the anchor/, r.checks[GUARD]?.detail);
      const POLL = 20; // the arm stamps the reap and the release on its 20 ms timer: the first tick at or after the instant
      const tick = (v, at) => v !== null && v >= at && v < at + POLL;
      const r1 = await runArm('A1', { reapMs: 300, lossMs: 330, winMs: 900 });
      row('A1', r1.checks[GUARD]?.ok === true && /retained release at null ms/.test(r1.timing ?? '') && tick(timingOf(r1, 'reaped'), 300) && afterOf(r1) === 330 - timingOf(r1, 'reaped'),
        'control: no retained release, the loser refused 30 ms after the reap — the guard row passes', brief(r1));
      // the release 2000 ms after the reap and the refusal 400 ms after it: 2400 ms after the reap (red on the reap
      // alone), 400 ms after the release (green on the release): only the release anchor passes it
      const r2 = await runArm('A2', { reapMs: 300, retained: { atMs: 2300, port: armKey }, lossMs: 2700, winMs: 3100 });
      row('A2', r2.checks[GUARD]?.ok === true && tick(timingOf(r2, 'retained release'), 2300) && afterOf(r2) === 2700 - timingOf(r2, 'retained release'),
        'the retained release 2000 ms after the reap, the refusal 400 ms after it (2400 ms after the reap): PASS — the later anchor is the release', brief(r2));
      // the release 1000 ms after the reap, the refusal 2600 ms after the release (3600 ms after the reap)
      const r3 = await runArm('A3', { reapMs: 300, retained: { atMs: 1300, port: armKey }, lossMs: 3900, winMs: 4300 });
      row('A3', r3.checks[GUARD]?.ok === false && tick(timingOf(r3, 'retained release'), 1300) && afterOf(r3) === 3900 - timingOf(r3, 'retained release'),
        'the retained release 1000 ms after the reap, the refusal 2600 ms after it: the guard row FAILS by name, judged from the release', brief(r3));
      const r4 = await runArm('A4', { reapMs: 300, retained: { atMs: 2300, port: armKey + 7 }, lossMs: 2900, winMs: 3300 });
      row('A4', r4.checks[GUARD]?.ok === false && /retained release at null ms/.test(r4.timing ?? '') && tick(timingOf(r4, 'reaped'), 300) && afterOf(r4) === 2900 - timingOf(r4, 'reaped'),
        "A2's release (2000 ms after the reap) logged for another port, the refusal at 2900 ms: not this port's, the reap stays the anchor and the guard row FAILS", brief(r4));
      const r5 = await runArm('A5', { reapMs: 300, readyMs: [0, 5000], lossMs: 5050, winMs: 900 });
      row('A5', r5.checks[GUARD]?.ok === true && timingOf(r5, 'last readiness answer') === 5000 && afterOf(r5) === 50,
        "the loser's readiness answered 5000 ms in (a slow static server), the refusal 50 ms after it: PASS — the anchor is the loser's arrival", brief(r5));
      // the winner also fetches ANOTHER origin at 5000 ms: an anchor taken from it would put the refusal 700 ms after it
      const r6 = await runArm('A6', { reapMs: 300, readyMs: [0, 3000], otherOriginMs: 5000, lossMs: 5700, winMs: 900 });
      row('A6', r6.checks[GUARD]?.ok === false && timingOf(r6, 'last readiness answer') === 3000 && afterOf(r6) === 2700,
        "the loser's readiness answered at 3000 ms, another origin answered at 5000 ms, the refusal 2700 ms after the readiness: the guard row FAILS by name, judged from the served origin's arrival", brief(r6));
      if (violationCount) throw violationError(); // one recorded after the last row's drive
    } finally { unseal(); }
  }
} catch (e) {
  row('X', false, 'probe exception', (violationCount ? `${violationError().message} | ` : '') + (e.stack ?? e.message));
}
served.close();
console.log(rowsBad ? `HYGIENE-4E-ANCHOR SELFTEST FAIL (${rowsBad} of ${rowsRun}: ${badIds})` : `HYGIENE-4E-ANCHOR SELFTEST PASS (${rowsRun})`);
process.exit(rowsBad ? 1 : 0);
