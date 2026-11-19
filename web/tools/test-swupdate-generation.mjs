// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-swupdate-generation.mjs — #1173: the update notice's generation check,
// judged on the REAL app/swupdate.js in Node (no browser).
//
// A navigation the outgoing worker serves while the waiting one takes over
// gets the OLD app.html under the NEW controller, with no controllerchange.
// verifyGeneration() compares app.html's data-ob-html (gen-sw-precache's
// content id) with the controller's snapshot copy and reloads once per
// distinct pair. This arm slices HTML_ID_RE, REPAIR_KEY and
// verifyGeneration() from the source and runs them against stubs:
//   GUARDS   no service worker / no controller / a reload already under way:
//            no fetch, no reload
//   COMPARE  a match: nothing; a mismatch: one reload (inert and the shared
//            __obSwReloading flag set BEFORE it); a document without an id:
//            reload; a snapshot without an id, a failed fetch, a reload that
//            starts while the fetch is in flight: nothing, storage untouched;
//            no timer scheduled (a deferred effect would escape every count)
//   LOOP     one shared store across calls: the first mismatch reloads, the
//            same pair on the reloaded page does not, a new snapshot id or a
//            new document id does
//   STORAGE  get throws / set throws / set not read back: no reload (fail
//            closed)
//   URL      the fetched URL is the web root's app.html (resolved from the
//            module under a sub-path, as on GitHub Pages)
//   ID       HTML_ID_RE reads the id gen-sw-precache writes, from the real
//            web/app.html, and the FIRST of a doubled attribute (as the
//            browser's dataset does)
//   WIRING   watchUpdates calls verifyGeneration() inside a try, after its
//            no-registration guard
//   DEFAULTS the DEFAULT env under the browser's `this` rules: fetch called
//            unbound and with no init (a cache mode takes sw.js's network
//            heal path), location.reload / sessionStorage methods on their
//            owners (stubs that throw 'Illegal invocation' otherwise)
// The slice runs in strict mode, as the module does.
//
//   node web/tools/test-swupdate-generation.mjs [--src <swupdate.js>]
//   node web/tools/test-swupdate-generation.mjs --selftest
// Exit 0 PASS, 1 FAIL, 2 INVALID.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const SRC_DEFAULT = path.join(WEB, 'app', 'swupdate.js');
const SCOPE = 'http://127.0.0.1:1/site/web/';
const MODULE_URL = `${SCOPE}app/swupdate.js`;
const MECHS = ['GUARDS', 'COMPARE', 'LOOP', 'STORAGE', 'URL', 'ID', 'WIRING', 'DEFAULTS'];

const B = { browser: null }; // the browser globals the DEFAULT env reaches, swapped per run
const SCHED = []; // every timer verifyGeneration schedules (it needs none: a deferred effect escapes every clause)
function lift(src) {
  const start = src.indexOf('const HTML_ID_RE');
  const fnAt = src.indexOf('export function verifyGeneration(');
  if (start < 0 || fnAt < 0) return { invalid: 'HTML_ID_RE / verifyGeneration not found' };
  const end = src.indexOf('\n}\n', fnAt);
  if (end < 0) return { invalid: 'verifyGeneration has no closing brace line' };
  const body = src.slice(start, end + 2).replace('export function', 'function').replaceAll('import.meta.url', JSON.stringify(MODULE_URL));
  // eslint-disable-next-line no-new-func
  const make = new Function('navigator', 'document', 'window', 'fetch', 'sessionStorage', 'location', 'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'requestIdleCallback', `"use strict";\n${body}\nreturn { HTML_ID_RE, REPAIR_KEY, verifyGeneration };`);
  const strict = (name, owner, fn) => function (...a) { if (owner ? this !== owner() : (this !== undefined && this !== globalThis)) throw new TypeError(`Illegal invocation (${name})`); return fn(...a); };
  const storage = { getItem: strict('getItem', () => storage, (k) => B.browser.store.get(k) ?? null), setItem: strict('setItem', () => storage, (k, v) => { B.browser.store.set(k, String(v)); }) };
  const loc = { href: `${SCOPE}app.html?sw=1`, reload: strict('reload', () => loc, () => { B.browser.reloads++; }) };
  const fetchB = strict('fetch', null, (u, init) => { B.browser.fetched.push(u); B.browser.inits.push(init); return Promise.resolve({ ok: true, text: () => Promise.resolve(B.browser.text) }); });
  const nav = { get serviceWorker() { return B.browser.sw; } };
  const doc = { get documentElement() { return B.browser.doc.documentElement; }, get body() { return B.browser.doc.body; } };
  const win = new Proxy({}, { get: (_, k) => B.browser.win[k], set: (_, k, v) => { B.browser.win[k] = v; return true; } });
  const rec = (n) => () => { SCHED.push(n); return 0; };
  return make(nav, doc, win, fetchB, storage, loc, rec('setTimeout'), rec('setInterval'), rec('queueMicrotask'), rec('requestAnimationFrame'), rec('requestIdleCallback'));
}
const tag = (id) => `<!DOCTYPE html>\n<html lang="en"${id == null ? '' : ` data-ob-html="${id}"`}>\n<head></head>\n`;
// a stub env: the document's id, the controller's app.html text, storage behaviour
function env({ controller = true, sw = true, docId = 'aaaaaaaaaaaa', text = tag('bbbbbbbbbbbb'), fetchFails = false, store = new Map(), get, set, reloading = false, onFetch } = {}) {
  const x = { fetched: [], reloads: 0, store, win: { __obSwReloading: reloading }, doc: { documentElement: { dataset: docId == null ? {} : { obHtml: docId } }, body: { inert: false } } };
  x.e = {
    sw: sw ? { controller: controller ? {} : null } : undefined, doc: x.doc, win: x.win,
    fetchText: (u) => { x.fetched.push(u); if (onFetch) onFetch(x); return fetchFails ? Promise.reject(new Error('offline')) : Promise.resolve(text); },
    getItem: get || ((k) => store.get(k) ?? null), setItem: set || ((k, v) => { store.set(k, v); }),
    reload: () => { x.reloads++; x.atReload = { inert: x.doc.body.inert, flag: x.win.__obSwReloading }; },
  };
  return x;
}

async function judgeLifted(L, src) {
  const red = Object.fromEntries(MECHS.map((m) => [m, []]));
  const go = async (o) => { const x = env(o); const r = await L.verifyGeneration(x.e); return { x, r }; };
  // GUARDS
  for (const [what, o] of [['no service worker', { sw: false }], ['no controller', { controller: false }], ['a reload under way', { reloading: true }]]) {
    const { x } = await go(o);
    if (x.fetched.length || x.reloads) red.GUARDS.push(`${what}: ${x.fetched.length} fetch(es), ${x.reloads} reload(s) (want none)`);
  }
  // COMPARE
  {
    const m = await go({ docId: 'cccccccccccc', text: tag('cccccccccccc') });
    if (m.x.reloads || m.x.store.size) red.COMPARE.push('a matching id reloaded or wrote storage');
    const mm = await go({});
    if (mm.x.reloads !== 1) red.COMPARE.push(`a mismatch gave ${mm.x.reloads} reload(s) (want 1)`);
    if (!mm.x.atReload || !mm.x.atReload.inert) red.COMPARE.push('the page was not made inert before the repair reload');
    if (!mm.x.atReload || mm.x.atReload.flag !== true) red.COMPARE.push('the shared __obSwReloading flag was not set (the belt / controllerchange could reload again)');
    const nodoc = await go({ docId: null });
    if (nodoc.x.reloads !== 1) red.COMPARE.push(`a document without an id (an HTML from before the fix) gave ${nodoc.x.reloads} reload(s) (want 1)`);
    const notheirs = await go({ text: tag(null) });
    if (notheirs.x.reloads || notheirs.x.store.size) red.COMPARE.push('a snapshot app.html without an id reloaded or wrote storage');
    const fail = await go({ fetchFails: true });
    if (fail.x.reloads) red.COMPARE.push('a failed fetch reloaded');
    const nul = await go({ text: null });
    if (nul.x.reloads) red.COMPARE.push('an unanswered fetch (no text) reloaded');
    const race = await go({ onFetch: (x) => { x.win.__obSwReloading = true; } });
    if (race.x.reloads) red.COMPARE.push('a reload that started while the fetch was in flight was doubled');
    if (race.x.store.size) red.COMPARE.push('a reload that started while the fetch was in flight stored the pair (the next page of that reload could not repair)');
    if (fail.x.store.size || nul.x.store.size) red.COMPARE.push('a failed / unanswered fetch wrote storage');
  }
  // LOOP
  {
    const store = new Map();
    const first = await go({ store });
    const same = await go({ store });
    if (first.x.reloads !== 1 || same.x.reloads) red.LOOP.push(`the same pair on the reloaded page: ${first.x.reloads} then ${same.x.reloads} reload(s) (want 1 then 0: a loop)`);
    const otherTheirs = await go({ store, text: tag('dddddddddddd') });
    if (otherTheirs.x.reloads !== 1) red.LOOP.push(`a pair with a different snapshot id was blocked (${otherTheirs.x.reloads} reloads, want 1)`);
    const otherMine = await go({ store, docId: 'eeeeeeeeeeee', text: tag('dddddddddddd') });
    if (otherMine.x.reloads !== 1) red.LOOP.push(`a pair with a different document id was blocked (${otherMine.x.reloads} reloads, want 1)`);
  }
  // STORAGE
  {
    const thr = () => { throw new Error('SecurityError'); };
    for (const [what, o] of [['get throws', { get: thr }], ['set throws', { set: thr }], ['set not read back', { set: () => {} }]]) {
      const { x } = await go(o);
      if (x.reloads) red.STORAGE.push(`${what}: reloaded (want none: without the stored pair a loop could not be bounded)`);
    }
  }
  // URL
  {
    const { x } = await go({});
    if (x.fetched[0] !== `${SCOPE}app.html`) red.URL.push(`fetched ${JSON.stringify(x.fetched[0])} (want the web root's app.html ${SCOPE}app.html)`);
  }
  // ID: the regex reads what gen writes, from the real app.html
  {
    const real = fs.readFileSync(path.join(WEB, 'app.html'), 'utf8');
    const want = (real.match(/data-ob-html="([0-9a-f]+)"/) || [])[1];
    L.HTML_ID_RE.lastIndex = 0;
    const got = (L.HTML_ID_RE.exec(real) || [])[1];
    if (!want) red.ID.push('web/app.html carries no data-ob-html (run gen-sw-precache)');
    else if (got !== want) red.ID.push(`HTML_ID_RE reads ${JSON.stringify(got)} from web/app.html, not its data-ob-html ${want}`);
    // the browser's dataset reads the FIRST of a doubled attribute; so must the check
    L.HTML_ID_RE.lastIndex = 0;
    const dup = (L.HTML_ID_RE.exec('<!DOCTYPE html>\n<html lang="en" data-ob-html="111111111111" data-ob-html="222222222222">\n') || [])[1];
    if (dup !== '111111111111') red.ID.push(`HTML_ID_RE reads ${JSON.stringify(dup)} from a doubled attribute (the browser reads the first, 111111111111)`);
  }
  // WIRING
  {
    const w = src.match(/export function watchUpdates\(reg\) \{\n\s*const sw = navigator\.serviceWorker;\n\s*if \(!reg \|\| !sw\) return null;\n(\s*)try \{ verifyGeneration\(\); \} catch/);
    if (!w) red.WIRING.push('watchUpdates does not call verifyGeneration() inside a try right after its no-registration guard');
  }
  // DEFAULTS
  {
    B.browser = { sw: { controller: {} }, doc: { documentElement: { dataset: { obHtml: 'aaaaaaaaaaaa' } }, body: { inert: false } }, win: {}, store: new Map(), reloads: 0, fetched: [], inits: [], text: tag('bbbbbbbbbbbb') };
    let r = null, threw = null;
    try { r = await L.verifyGeneration(); } catch (e) { threw = e; }
    if (B.browser.inits.some((i) => i !== undefined)) red.DEFAULTS.push(`the default fetch passes an init ${JSON.stringify(B.browser.inits)} (a cache mode takes sw.js's network-first heal path, not the controller's snapshot)`);
    if (threw) red.DEFAULTS.push(`the default env throws: ${threw.message}`);
    else if (r !== 'reload' || B.browser.reloads !== 1) red.DEFAULTS.push(`the default env gave ${JSON.stringify(r)} with ${B.browser.reloads} reload(s) on a mismatch (want 'reload', 1: a storage or reload call off its owner fails closed)`);
  }
  if (SCHED.length) red.COMPARE.push(`verifyGeneration scheduled ${SCHED.join(', ')} (a deferred effect escapes every clause's count)`);
  return red;
}
async function judge(src) {
  SCHED.length = 0;
  try {
    const L = lift(src);
    if (L.invalid) return { invalid: [L.invalid], red: {} };
    return { invalid: [], red: await judgeLifted(L, src) };
  } catch (e) { return { invalid: [`threw: ${e && e.message}`], red: {} }; }
}

const PLANTS = [
  { mech: 'GUARDS', name: 'no controller guard', old: "if (!env.sw || !env.sw.controller || env.win.__obSwReloading) return Promise.resolve('skip');", new: "if (!env.sw || env.win.__obSwReloading) return Promise.resolve('skip');" },
  { mech: 'GUARDS', name: 'no reload-under-way guard', old: "if (!env.sw || !env.sw.controller || env.win.__obSwReloading) return Promise.resolve('skip');", new: "if (!env.sw || !env.sw.controller) return Promise.resolve('skip');" },
  { mech: 'COMPARE', name: 'the check never reloads', old: '    env.reload();\n', new: '' },
  { mech: 'COMPARE', name: 'a snapshot without an id reloads', old: "    if (!m) return 'unknown';", new: "    if (!m) { env.win.__obSwReloading = true; env.reload(); return 'reload'; }" },
  { mech: 'COMPARE', name: 'no second look at the flag after the fetch', old: "    if (env.win.__obSwReloading) return 'skip';\n", new: '' },
  { mech: 'COMPARE', name: 'inert after the reload', old: '    try { env.doc.body.inert = true; } catch { /* engine without inert */ }\n    env.reload();\n', new: '    env.reload();\n    try { env.doc.body.inert = true; } catch { /* engine without inert */ }\n' },
  { mech: 'COMPARE', name: 'a raced reload stores the pair', old: "    if (env.win.__obSwReloading) return 'skip';\n    const pair = `${mine}>${theirs}`;\n", new: "    const pair = `${mine}>${theirs}`;\n    if (env.win.__obSwReloading) { try { env.setItem(REPAIR_KEY, pair); } catch {} return 'skip'; }\n" },
  { mech: 'COMPARE', name: 'a deferred reload on storage failure', old: "    } catch { return 'no-storage'; }", new: "    } catch { setTimeout(() => env.reload(), 0); return 'no-storage'; }" },
  { mech: 'LOOP', name: 'the stored pair ignores the document id', old: "      if (env.getItem(REPAIR_KEY) === pair) return 'repaired';\n", new: "      if ((env.getItem(REPAIR_KEY) || '').endsWith(`>${theirs}`)) return 'repaired';\n" },
  { mech: 'DEFAULTS', name: 'a cache-bypassing default fetch', old: 'fetchText: (u) => fetch(u).then(', new: "fetchText: (u) => fetch(u, { cache: 'no-store' }).then(" },
  { mech: 'COMPARE', name: 'no inert before the reload', old: '    try { env.doc.body.inert = true; } catch { /* engine without inert */ }\n', new: '' },
  { mech: 'COMPARE', name: 'a reload on a failed fetch', old: "  }).catch(() => 'error');", new: "  }).catch(() => { env.reload(); return 'error'; });" },
  { mech: 'COMPARE', name: 'an undeclared binding (strict ReferenceError in the module)', old: "    const pair = `${mine}>${theirs}`;\n", new: "    pair = `${mine}>${theirs}`;\n" },
  { mech: 'LOOP', name: 'no stored-pair guard', old: "      if (env.getItem(REPAIR_KEY) === pair) return 'repaired';\n", new: '' },
  { mech: 'STORAGE', name: 'no read-back', old: "      if (env.getItem(REPAIR_KEY) !== pair) return 'no-storage';\n", new: '' },
  { mech: 'STORAGE', name: 'storage errors fail open', old: "    } catch { return 'no-storage'; }", new: '    } catch { /* fail open */ }' },
  { mech: 'URL', name: 'a target under app/', old: "new URL('../app.html', import.meta.url)", new: "new URL('./app.html', import.meta.url)" },
  { mech: 'ID', name: 'a greedy id regex', old: '[^>]*?\\sdata-ob-html=', new: '[^>]*\\sdata-ob-html=' },
  { mech: 'WIRING', name: 'watchUpdates never checks', old: '  try { verifyGeneration(); } catch { /* the degradation law */ }\n', new: '' },
  { mech: 'DEFAULTS', name: 'a bare storage method in the default env', old: 'getItem: (k) => sessionStorage.getItem(k),', new: 'getItem: sessionStorage.getItem,' },
  { mech: 'DEFAULTS', name: 'a bare location.reload in the default env', old: 'reload: () => location.reload(),', new: 'reload: location.reload,' },
];

let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => { if (!verdictPrinted) { verdictPrinted = true; console.log('[generation] INVALID: no verdict'); process.exitCode = 2; } });

const args = process.argv.slice(2);
const srcPath = path.resolve(args.includes('--src') ? args[args.indexOf('--src') + 1] : SRC_DEFAULT);
const src = fs.readFileSync(srcPath, 'utf8');
if (!args.includes('--selftest')) {
  const { invalid, red } = await judge(src);
  if (invalid.length) verdict(`[generation] verdict INVALID: ${invalid.join('; ')}`, 2);
  for (const m of MECHS) console.log(`[generation] ${red[m].length ? 'FAIL' : 'ok'} ${m}${red[m].length ? `: ${red[m].join('; ')}` : ''}`);
  const reds = MECHS.filter((m) => red[m].length);
  if (reds.length) verdict(`[generation] verdict FAIL — ${reds.join(', ')}`, 1);
  verdict(`[generation] verdict PASS — ${MECHS.length} mechanisms (${MECHS.join(', ')})`, 0);
}
const base = await judge(src);
if (base.invalid.length || MECHS.some((m) => base.red[m].length)) verdict(`[generation selftest] the tree's swupdate.js is not green: ${JSON.stringify(base)}`, 2);
let bad = 0, collateral = 0;
for (const p of PLANTS) {
  const n = src.split(p.old).length - 1;
  if (n !== 1) { console.log(`[generation selftest] INVALID plant "${p.name}": anchor count ${n}`); bad++; continue; }
  const r = await judge(src.replace(p.old, p.new));
  const hit = MECHS.filter((m) => r.red[m] && r.red[m].length);
  // its own mechanism must go red; a check that never reloads also breaks the clauses that expect a repair (collateral)
  const ok = !r.invalid.length && hit.includes(p.mech);
  if (ok && hit.length > 1) collateral++;
  console.log(`[generation selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> red ${JSON.stringify(hit)}${r.invalid.length ? ` invalid ${JSON.stringify(r.invalid)}` : ''}`);
  if (!ok) bad++;
}
verdict(bad ? `[generation selftest] FAIL (${bad})` : `[generation selftest] OK: ${PLANTS.length} plants each caught on its own mechanism (${collateral} with collateral)`, bad ? 1 : 0);
