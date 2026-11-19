#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-place-sheets — #811: the shell's boot-idle place-sheet preload, its cleanup, and the content modules'
// adoption law, as a node gate (no browser, no ports).
//
// shell.js links the content places' sheets at boot idle so a rail click right after a module's import no longer
// beats its sheet past LAW 2's cap, and cleans up after an older module that links its own sheet beside a preload.
// This gate runs it all on a fake document whose links resolve their href against the DOCUMENT (web/app.html), as a
// browser does, whose mutations reach a fake MutationObserver, and with the lifted code run strict, as the ES
// modules it comes from are:
//   TABLE   every PLACE_SHEETS row equals its module: link id, sheet file and the ?v= its ensureSheet() builds from
//           its *_CSS_V (the duplicated-literal law); every content place but the opening one (play, linked by its
//           mount) has a row; play has none; no row or CONTENT_MODULES entry escapes the parser. The tripwire, against
//           what each module shipped with before the adoption code (PRE_ADOPTION): a moved link id fails outright (an
//           older module links by it, so no cleanup can find it); a moved sheet (file or ?v=) fails while the shell's
//           cleanup does not work.
//   SHELL   preloadSheets(), lifted from shell.js and started from prefetchContent(): no throw and nothing linked
//           without requestIdleCallback; no throw and nothing linked synchronously at its start; nothing before boot
//           ready (__test.ready) over 50 idle callbacks; at most one link per idle callback, in table order; inside a
//           camera move a sheet only when the next one queued is the destination's; a place whose own or preload link
//           exists is skipped, never replaced, and the chain moves on; the chain stops once its queue is empty; a
//           failed preload is unlinked unless a module adopted it (renamed it to its own id); no idle callback throws.
//           Across every scenario: no timeout option on any requestIdleCallback call, the first included, and every
//           link the chain made (read after each idle callback) is a PRELOAD (<module id>-pre) with data-optional,
//           rel=stylesheet and the row's module-resolved href.
//   CLEANUP the real modules lifted onto the same document: no observer before the first preload, one with it; an older
//           module (the legacy copy, no adoption code, at ANOTHER ?v=) links its own sheet while the chain is still
//           running: its preload stays until that own link settles, then goes, and the own link stays; the other
//           unadopted preloads load with the observer live and stay; a second older module (at its own ?v=) fails its
//           own sheet: its preload goes; a current module adopts its preload while it is still loading, and the cleanup
//           never touches it through its load and error; the observer stays while any preload is unadopted and
//           disconnects once none is left, also at the chain's end when every preload was adopted while a skipped row
//           remained. A hand-made adoption racing an older link is never unlinked. A module that throws, and a shell
//           listener that throws, are named failures.
//   MODULE  each module's ensureSheet() (and prefetch(), its LAW 1 hook, whose first statement calls it): no link ->
//           its own, with rel=stylesheet and the module-resolved href; its own present link with an applied sheet ->
//           settled at once, never re-requested; its own present link still loading -> settles on its load, never
//           re-requested; a failed own sheet -> settled; the preload with ITS href, loaded -> adopted under its own id
//           at once, never re-requested; loading -> adopted, settles on load, and on error (the adopted link stays,
//           as a module's own failed link does); the preload with ANOTHER href (a stale shell's older ?v=), loaded or
//           loading -> unlinked, its own linked. A throw, a rejected ensureSheet() or a listener that throws is a
//           named failure. LEGACY control (fresh shell x stale module): the same module with the adoption removed
//           ignores the preload and links and waits for its own, as before.
// --selftest plants a product failure for every TABLE, SHELL, CLEANUP and MODULE check above (the legacy control
// models the stale-module path and has no product plant) on copies of the sources, and requires each plant to be
// caught by the failure it targets (a plant that throws, or whose anchor is absent or ambiguous, is INVALID, never
// "caught"); its anchors follow the parsed table, so a ?v= bump made by the duplicated-literal law keeps it green. Its
// pass arms are behaviour-preserving edits that must stay green: a ?v= bump with the cleanup, a link appended before
// it is filled in, observe options that rely on attributeFilter implying attributes. Exit 0 PASS, 1 FAIL.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
// the DOCUMENT is web/app.html (the manifest's start_url): a link's href resolves against it, not against the module
// that sets it, so a document-relative './ui/x.css' is web/ui/x.css, a 404 (practice.js's review r4 P1 note)
const DOC_URL = 'http://127.0.0.1:8178/app.html';
const APP_URL = new URL('app/', DOC_URL).href;
const SHELL_URL = new URL('shell.js', APP_URL).href;
const flush = () => new Promise((r) => setTimeout(r, 0));
// the link id and the sheet (file and ?v=) each content module shipped with before it had the adoption code (builds
// 18/19, main up to 19017f5e): a stale cached module of that age links exactly this beside an unadopted preload. The id
// must stay (the chain's skip and the cleanup find an older module's link by it); while a row also keeps the file and
// ?v=, the two links are the same sheet, and once it moves off them only the shell's cleanup ends with one sheet
// applying (the tripwire in checkTable follows the cleanup scenarios, not a frozen ?v=)
const PRE_ADOPTION = {
  practice: ['ob-practice-css', './ui/practice.css?v=015'],
  equipment: ['ob-atelier-css', './ui/atelier.css?v=054'],
  replays: ['ob-replays-css', './ui/replays.css?v=018'],
};

// ---- parsing ------------------------------------------------------------------------------------------------------
function parseShell(src) {
  const cm = src.match(/const CONTENT_MODULES = \{([\s\S]*?)\n\};/);
  if (!cm) throw new Error('shell.js: CONTENT_MODULES not found');
  const cmLines = cm[1].split('\n').filter((l) => /^\s+\w+: \[/.test(l));
  const places = Object.fromEntries([...cm[1].matchAll(/^\s+(\w+): \['\.\/([\w-]+\.js)', '\w+'\]/gm)].map((m) => [m[1], m[2]]));
  const ps = src.match(/const PLACE_SHEETS = \[([\s\S]*?)\n\s*\];/);
  if (!ps) throw new Error('shell.js: PLACE_SHEETS not found');
  const rowLines = ps[1].split('\n').filter((l) => /^\s*\[/.test(l));
  const rows = [...ps[1].matchAll(/\['(\w+)', '([\w-]+)', '(\.\/ui\/[\w.-]+\.css)\?v=([\w.-]+)'\]/g)].map((m) => [m[1], m[2], m[3], m[4]]);
  // each count on its own: a sum of the two differences can cancel (an unread entry + two rows on one line)
  return { places, rows, cmLines: cmLines.length, rowLines: rowLines.length };
}

function parseModule(src, file) {
  const ids = [...src.matchAll(/document\.getElementById\('(ob-[\w-]+-css)'\)/g)].map((m) => m[1]);
  const hrefs = [...src.matchAll(/`(\.\/ui\/[\w.-]+\.css)\?v=\$\{(\w+_CSS_V)\}`/g)];
  if (new Set(ids).size !== 1 || hrefs.length !== 1) throw new Error(`${file}: expected one sheet id and one versioned href (${ids} / ${hrefs.length})`);
  const v = src.match(new RegExp(`^const ${hrefs[0][2]} = '([^']+)';`, 'm'));
  if (!v) throw new Error(`${file}: ${hrefs[0][2]} not found`);
  return { id: ids[0], rel: hrefs[0][1], v: v[1] };
}

function block(src, startText, label) {
  const start = src.indexOf(startText);
  if (start < 0) throw new Error(`${label}: '${startText}' not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`${label}: unbalanced block`);
}

// ---- TABLE --------------------------------------------------------------------------------------------------------
function checkTable(shellSrc, modSrcs, cleanupOk) {
  const out = [];
  const { places, rows, cmLines, rowLines } = parseShell(shellSrc);
  if (cmLines !== Object.keys(places).length) out.push(`TABLE: CONTENT_MODULES entr(ies) escaped the parser: ${cmLines} entry line(s), ${Object.keys(places).length} parsed`);
  if (rowLines !== rows.length) out.push(`TABLE: PLACE_SHEETS row(s) escaped the parser: ${rowLines} row line(s), ${rows.length} parsed`);
  if (!rows.length) out.push('TABLE: PLACE_SHEETS has no rows');
  for (const [place, linkId, rel, v] of rows) {
    const file = places[place];
    if (!file) { out.push(`TABLE: row '${place}' is not a CONTENT_MODULES place`); continue; }
    if (place === 'play') { out.push('TABLE: play has a row, but the opening mount links its sheet'); continue; }
    const src = modSrcs[file];
    if (!src) { out.push(`TABLE: ${file} not read`); continue; }
    const m = parseModule(src, file);
    if (linkId !== m.id) out.push(`TABLE: ${place} link id '${linkId}' != ${file}'s '${m.id}'`);
    if (rel !== m.rel) out.push(`TABLE: ${place} sheet '${rel}' != ${file}'s '${m.rel}'`);
    if (v !== m.v) out.push(`TABLE: ${place} ?v=${v} != ${file}'s ${m.v}`);
    const was = PRE_ADOPTION[place];
    if (was && linkId !== was[0]) {
      out.push(`TABLE: ${place} link id '${linkId}' moved off '${was[0]}', the id its module shipped with before the adoption `
        + `code: a stale cached module links '${was[0]}', which neither the chain's skip nor the cleanup would match, so both `
        + 'sheets would apply. Keep the id');
    }
    if (was && `${rel}?v=${v}` !== was[1] && !cleanupOk) {
      out.push(`TABLE: ${place} sheet ${rel}?v=${v} moved off ${was[1]}, the sheet its module shipped with before the adoption `
        + 'code, and the shell\'s cleanup does not work (see the SHELL cleanup failures): a stale cached module would link '
        + 'its own sheet beside the unadopted preload and both would apply. Restore the cleanup (shell.md §9 entry 34)');
    }
  }
  for (const place of Object.keys(places)) {
    if (place !== 'play' && !rows.some(([p]) => p === place)) out.push(`TABLE: content place '${place}' has no PLACE_SHEETS row`);
  }
  return out;
}

// ---- the fake document ----------------------------------------------------------------------------------------------
function fakeDocument() {
  const all = [], created = [], snapped = new Set(), observers = [], pending = [], listenerErrors = [];
  // a mutation is queued only while some observer watches (a later observer never sees older records)
  const notify = (rec) => { if (observers.some((o) => o.active)) pending.push(rec); };
  class Link {
    constructor() { this._id = ''; this.nodeName = 'LINK'; this.rel = ''; this._href = ''; this.sheet = null; this.isConnected = false; this.requests = 0; this.on = {}; this.attrs = {}; this.byShell = false; }
    get id() { return this._id; }
    set id(v) {
      const old = this._id;
      this._id = String(v);
      if (this.isConnected && old !== this._id) notify({ type: 'attributes', target: this, attributeName: 'id', addedNodes: [], removedNodes: [] });
    }
    get href() { return this._href; }
    // a browser resolves a link's href against the document; every assignment is a (re)request
    set href(v) { this._href = new URL(String(v), DOC_URL).href; this.sheet = null; this.requests += 1; }
    setAttribute(k, v) { if (k === 'href') this.href = v; else if (k === 'id') this.id = v; else this.attrs[k] = String(v); }
    hasAttribute(k) { return k in this.attrs; }
    addEventListener(type, fn) { (this.on[type] ||= []).push(fn); }
    // as in a browser, a listener that throws is reported and the other listeners still run
    fire(type) {
      if (type === 'load') this.sheet = {};
      const fns = this.on[type] || [];
      this.on[type] = [];
      for (const f of fns) { try { f(); } catch (e) { listenerErrors.push(e); } }
    }
    remove() {
      if (!this.isConnected) return;
      this.isConnected = false;
      notify({ type: 'childList', target: document.head, addedNodes: [], removedNodes: [this] });
    }
  }
  const document = {
    getElementById: (id) => all.find((l) => l.isConnected && l.id === id) ?? null,
    createElement: () => new Link(),
    head: {
      appendChild: (l) => {
        l.isConnected = true;
        if (!all.includes(l)) all.push(l);
        notify({ type: 'childList', target: document.head, addedNodes: [l], removedNodes: [] });
        return l;
      },
    },
  };
  // the MutationObserver the shell's cleanup gets: records filtered by each observer's own options, delivered by
  // flush() (the microtask checkpoint after a task)
  class MutationObserver {
    constructor(cb) { this.cb = cb; this.active = false; this.target = null; this.opts = null; this.disconnects = 0; observers.push(this); }
    observe(target, opts = {}) { this.active = true; this.target = target; this.opts = opts; }
    disconnect() { this.active = false; this.disconnects += 1; }
  }
  const sees = (o, r) => (o.target === document.head)
    && (r.type === 'childList' ? !!o.opts.childList
      // as observe() does: attributeFilter or attributeOldValue alone implies attributes
      : !!(o.opts.attributes || o.opts.attributeFilter || o.opts.attributeOldValue) && !!o.opts.subtree
        && (!o.opts.attributeFilter || o.opts.attributeFilter.includes(r.attributeName)));
  const flush = () => {
    for (let i = 0; i < 20 && pending.length; i++) {
      const recs = pending.splice(0);
      for (const o of observers) if (o.active) { const mine = recs.filter((r) => sees(o, r)); if (mine.length) o.cb(mine, o); }
    }
  };
  // what the shell's chain linked, taken after each idle callback (never at insertion: a chain may append a link
  // first and fill it in within the same task, as a browser allows); a later adoption renames it
  const snap = () => {
    for (const l of all) {
      if (l.byShell && !snapped.has(l)) { snapped.add(l); created.push({ id: l.id, href: l.href, rel: l.rel, optional: l.hasAttribute('data-optional') }); }
    }
  };
  const preset = (id, href, loaded) => {
    const l = new Link(); l.id = id; l.rel = 'stylesheet'; l.href = href; l.requests = 0;
    if (loaded) l.sheet = {};
    document.head.appendChild(l);
    return l;
  };
  const connected = () => all.filter((l) => l.isConnected);
  return { document, preset, connected, created: () => created, snap, flush, observers, MutationObserver, listenerErrors };
}

// ---- SHELL ----------------------------------------------------------------------------------------------------------
function liftPreload(shellSrc, env) {
  const tableText = shellSrc.slice(shellSrc.indexOf('const PLACE_SHEETS = ['), shellSrc.indexOf('];', shellSrc.indexOf('const PLACE_SHEETS = [')) + 2);
  const fn = block(shellSrc, 'function preloadSheets() {', 'shell.js preloadSheets').replaceAll('import.meta.url', JSON.stringify(SHELL_URL));
  const ctx = vm.createContext({ ...env, URL });
  vm.runInContext(`'use strict';\n${tableText}\n${fn}\nthis.preloadSheets = preloadSheets;`, ctx);
  return ctx;
}

function shellEnv(places, { ric = true } = {}) {
  const f = fakeDocument();
  const queued = [], calls = [], thrown = [];
  const window = { __test: { ready: false } };
  if (ric) window.requestIdleCallback = function (cb) { calls.push(arguments.length); queued.push(cb); return queued.length; };
  // the shell's own view of the document: what it creates is tagged, so the per-link checks judge only the chain's
  // links (a module lifted on the same document creates untagged ones)
  const doc = { getElementById: f.document.getElementById, head: f.document.head,
    createElement: () => { const l = f.document.createElement(); l.byShell = true; return l; } };
  const env = {
    window, document: doc, MutationObserver: f.MutationObserver,
    // the shell's own CONTENT_MODULES keys, as the TABLE parser read them: a new place joins every scenario
    CONTENT_MODULES: Object.fromEntries(Object.keys(places).map((p) => [p, [`./${places[p]}`, 'create']])),
    mover: { moving: () => false }, active: 'play',
  };
  // an idle callback that throws ends the chain in a browser: record it and go on with the scenario; after each
  // callback, the chain's links are snapped and pending mutations delivered (the task's microtask checkpoint)
  const runOne = () => {
    const cb = queued.shift();
    if (cb) { try { cb(); } catch (e) { thrown.push(e); } f.snap(); f.flush(); }
    return cb;
  };
  return { f, queued, calls, thrown, window, env, runOne };
}

function checkShell(shellSrc, modSrcs) {
  const out = [];
  const pc = block(shellSrc, 'function prefetchContent() {', 'shell.js prefetchContent');
  if (!/\n\s*preloadSheets\(\);/.test(pc)) out.push('SHELL: prefetchContent() does not start preloadSheets()');
  const { places, rows } = parseShell(shellSrc);
  if (rows.length < 2) { out.push('SHELL: fewer than two PLACE_SHEETS rows to run the scenarios'); return { out, cleanupOk: false }; }
  const want = rows.map(([, id, rel, v]) => ({ id: `${id}-pre`, href: new URL(`${rel}?v=${v}`, SHELL_URL).href }));
  const envs = [];
  const env = (o) => { const s = shellEnv(places, o); envs.push(s); return s; };
  // prefetchContent() runs inside the opening move's task: the chain may link nothing before its first idle callback
  const start = (s, ctx) => {
    try { ctx.preloadSheets(); } catch (e) { out.push(`SHELL: preloadSheets() threw (${e.name}: ${e.message}): prefetchContent() would stop before its LAW 1 prefetch`); }
    s.f.snap();
    if (s.f.created().length) out.push('SHELL: preloadSheets() linked a sheet synchronously, outside an idle callback');
  };
  // no requestIdleCallback (WebKit): no throw (it would abort prefetchContent's LAW 1 prefetch) and nothing linked
  {
    const s = env({ ric: false });
    s.window.__test.ready = true;
    const ctx = liftPreload(shellSrc, s.env);
    try { ctx.preloadSheets(); } catch (e) { out.push(`SHELL: preloadSheets() threw without requestIdleCallback (${e.message}): prefetchContent() would stop before its LAW 1 prefetch`); }
    s.f.snap();
    if (s.f.created().length) out.push('SHELL: linked a sheet without requestIdleCallback');
  }
  // before ready: re-armed, nothing linked over 50 callbacks (a boot hold spans many idle slots); after ready: the
  // table's preloads in order, at most one per idle callback; then the chain stops
  {
    const s = env();
    const ctx = liftPreload(shellSrc, s.env);
    start(s, ctx);
    for (let i = 0; i < 50 && s.queued.length; i++) s.runOne();
    if (s.f.connected().length) out.push('SHELL: linked a sheet before boot ready (__test.ready false)');
    if (!s.queued.length) out.push('SHELL: stopped re-arming before boot ready (the preload never resumes)');
    if (s.f.observers.length) out.push('SHELL: a cleanup observer before any preload (it starts with the first preload)');
    s.window.__test.ready = true;
    const seen = [];
    for (let i = 0; i < want.length + 2 && s.queued.length; i++) {
      const before = s.f.connected().length;
      s.runOne();
      const now = s.f.connected();
      if (now.length - before > 1) out.push('SHELL: more than one sheet linked in one idle callback');
      if (now.length > before) seen.push(now[now.length - 1].id);
    }
    if (seen.join() !== want.map((w) => w.id).join()) out.push(`SHELL: preloads [${seen}], want [${want.map((w) => w.id)}] in table order`);
    if (s.queued.length) out.push(`SHELL: the chain still re-arms after its queue emptied (${s.queued.length} callback(s) pending)`);
  }
  // a place whose own or preload link exists is skipped (the existing link untouched), and the chain moves on, then stops
  {
    const s = env();
    s.window.__test.ready = true;
    const own = rows[0][1];
    const pOwn = s.f.preset(own, new URL(`${rows[0][2]}?v=${rows[0][3]}`, SHELL_URL).href, true);
    const pPre = s.f.preset(`${rows[1][1]}-pre`, new URL(`${rows[1][2]}?v=${rows[1][3]}`, SHELL_URL).href, false);
    const ctx = liftPreload(shellSrc, s.env);
    start(s, ctx);
    for (let i = 0; i < 8 && s.queued.length; i++) s.runOne();
    const ids = s.f.connected().map((l) => l.id);
    if (ids.filter((id) => id === own || id === `${own}-pre`).length !== 1) out.push(`SHELL: '${rows[0][0]}' linked again although its own link existed (${ids})`);
    if (ids.filter((id) => id === `${rows[1][1]}-pre`).length !== 1) out.push(`SHELL: '${rows[1][0]}' linked again although its preload existed`);
    if (!pOwn.isConnected || !pPre.isConnected) out.push('SHELL: the chain unlinked a link that already existed (a skip must leave it alone)');
    if (rows[2] && !ids.includes(`${rows[2][1]}-pre`)) out.push(`SHELL: the chain did not continue past the skipped places ('${rows[2][0]}' never linked)`);
    if (s.queued.length) out.push(`SHELL: the chain kept re-arming after the skips (${s.queued.length} callback(s) pending)`);
  }
  // inside a camera move: nothing while another place's sheet is next; the destination's sheet once it is next; the
  // rest after the move
  {
    const s = env();
    s.window.__test.ready = true;
    let moving = true;
    s.env.mover.moving = () => moving;
    const ctx = liftPreload(shellSrc, s.env);
    ctx.active = rows[rows.length - 1][0];
    start(s, ctx);
    for (let i = 0; i < 4; i++) s.runOne();
    if (s.f.connected().length) out.push(`SHELL: linked '${rows[0][0]}' during a move to another place`);
    ctx.active = rows[0][0];
    s.runOne();
    if (s.f.connected().length !== 1) out.push('SHELL: did not link the destination\'s sheet during its move');
    moving = false;
    for (let i = 0; i < 6 && s.queued.length; i++) s.runOne();
    if (s.f.connected().length !== rows.length) out.push('SHELL: the chain did not resume after the move');
  }
  // a failed preload is unlinked unless adopted
  {
    const s = env();
    s.window.__test.ready = true;
    const ctx = liftPreload(shellSrc, s.env);
    start(s, ctx);
    for (let i = 0; i < 2; i++) s.runOne();
    const [a, b] = s.f.connected();
    if (a && b) {
      b.id = rows[1][1]; // a module adopted it
      a.fire('error'); b.fire('error');
      if (a.isConnected) out.push('SHELL: a failed, unadopted preload stayed linked (its module would adopt a dead link)');
      if (!b.isConnected) out.push('SHELL: a failed preload that a module ADOPTED was unlinked (the module never re-requests)');
    } else out.push('SHELL: fewer than two preloads to judge the error path');
  }
  // the cleanup, with the real modules lifted onto the same document. The observer starts with the first preload. An
  // older module (the legacy copy of rows[0]'s module, no adoption code, at ANOTHER ?v= as after a bump) links its own
  // sheet while the chain is still running: its preload stays until that own link settles, then goes. The rest of the
  // chain runs; the other unadopted preloads load with the observer live and stay. A second older module (rows[2], at
  // its own ?v=) links its own and it fails: its preload goes. A current module (rows[1]) adopts its preload LAST, while
  // it is still loading: never touched through its load and error. The observer stays while any preload is unadopted and disconnects once
  // none is left.
  const cleanupAt = out.length;
  const liftOn = (doc, row, kind) => {
    const file = places[row[0]], src0 = modSrcs[file];
    if (!src0) return null;
    const src = kind === 'current' ? src0 : legacyOf(src0);
    if (!src) return null;
    if (kind !== 'stale') return liftModule(src, file, doc);
    // the stale copy moves the constant its own href reads, never merely the first *_CSS_V in the file (another one
    // above it would leave the older link at the preload's href, and a same-href-only cleanup would pass)
    const name = src.match(/`\.\/ui\/[\w.-]+\.css\?v=\$\{(\w+_CSS_V)\}`/)?.[1];
    const stale = name && src.replace(new RegExp(`^const ${name} = '[^']+';`, 'm'), `const ${name} = 'stale';`);
    return stale && stale !== src ? liftModule(stale, file, doc) : null;
  };
  {
    const s = env();
    s.window.__test.ready = true;
    const ctx = liftPreload(shellSrc, s.env);
    start(s, ctx);
    const byId = (id) => s.f.document.getElementById(id);
    const watching = () => s.f.observers.some((o) => o.active);
    // a rejection is MODULE's to report (the same code runs there); here it must not abort the gate
    const call = (row, m) => {
      try { Promise.resolve(m.ensureSheet()).catch(() => {}); s.f.flush(); return true; } catch (e) { out.push(`SHELL: the ${row[0]} module threw in the cleanup leg (${e.name}: ${e.message})`); return false; }
    };
    s.runOne();
    if (!watching()) out.push('SHELL: no cleanup observer after the first preload (it starts with it)');
    const older = (row, kind, how, mid) => {
      const pre = byId(`${row[1]}-pre`), m = liftOn(s.f.document, row, kind);
      if (!pre || !m) { out.push(`SHELL: cannot run the cleanup leg for '${row[0]}' (no preload, or no legacy copy of its module)`); return; }
      if (!call(row, m)) return;
      const own = byId(row[1]);
      if (!own || own === pre) { out.push(`SHELL: the legacy copy of '${row[0]}' did not link its own sheet`); return; }
      if (!pre.isConnected) out.push('SHELL: the cleanup dropped a preload before the older module\'s own link settled');
      own.fire(how); s.f.flush();
      if (pre.isConnected) out.push(`SHELL: an unadopted preload stayed beside an older module's ${how === 'load' ? 'loaded' : 'failed'} own link (both sheets apply)${mid ? ', the chain still running' : ''}`);
      if (!own.isConnected) out.push('SHELL: the cleanup unlinked the older module\'s own link');
    };
    older(rows[0], 'stale', 'load', true);
    for (let i = 0; i < rows.length + 2 && s.queued.length; i++) s.runOne();
    // rows[1]'s preload stays loading: its module adopts it while it loads, and only then does it load (the order in
    // which a cleanup that removes the link on its load would unlink an adopted link)
    const unadopted = s.f.connected().filter((l) => l.byShell && l.id.endsWith('-pre') && l.id !== `${rows[1][1]}-pre`);
    for (const l of unadopted) { l.fire('load'); s.f.flush(); }
    const lost = unadopted.filter((l) => !l.isConnected).map((l) => l.id);
    if (lost.length) out.push(`SHELL: a loaded, unadopted preload was unlinked before any module adopted it (${lost})`);
    if (!watching()) out.push('SHELL: no cleanup observer watching while unadopted preloads remain');
    if (rows[2]) older(rows[2], 'legacy', 'error', false);
    const pre1 = byId(`${rows[1][1]}-pre`), m1 = liftOn(s.f.document, rows[1], 'current');
    if (!watching()) out.push('SHELL: the cleanup observer stopped while an unadopted preload remained');
    if (!pre1 || !m1) out.push(`SHELL: cannot run the adoption leg for '${rows[1][0]}'`);
    else if (call(rows[1], m1)) {
      if (pre1.id !== rows[1][1]) out.push(`SHELL: '${rows[1][0]}' did not adopt its preload (the adoption leg cannot judge the cleanup)`);
      pre1.fire('load'); s.f.flush();
      pre1.fire('error'); s.f.flush();
      if (!pre1.isConnected) out.push('SHELL: the cleanup unlinked an ADOPTED link (a current module\'s own sheet)');
    }
    if (watching()) out.push('SHELL: the cleanup observer still watching after every place sheet was adopted or settled');
  }
  // the chain-end tidy: every preload adopted while a row remains, and that last row skipped (its own link already
  // there): the observer disconnects when the chain ends, with no mutation left to wake it
  {
    const s = env();
    s.window.__test.ready = true;
    const last = rows[rows.length - 1];
    s.f.preset(last[1], new URL(`${last[2]}?v=${last[3]}`, SHELL_URL).href, true);
    const ctx = liftPreload(shellSrc, s.env);
    start(s, ctx);
    for (let i = 0; i < rows.length - 1; i++) s.runOne();
    for (const row of rows.slice(0, -1)) {
      const m = liftOn(s.f.document, row, 'current');
      if (m) { try { Promise.resolve(m.ensureSheet()).catch(() => {}); } catch (e) { out.push(`SHELL: the ${row[0]} module threw in the tidy leg (${e.name}: ${e.message})`); } }
      s.f.flush();
    }
    for (let i = 0; i < 4 && s.queued.length; i++) s.runOne();
    if (s.f.observers.some((o) => o.active)) out.push('SHELL: the cleanup observer still watching after the chain ended with every preload adopted (the chain-end tidy)');
  }
  // the drop's own guard: a preload adopted while an older module's own link is still loading is never unlinked when
  // that link settles (an adoption racing an older link)
  {
    const s = env();
    s.window.__test.ready = true;
    const ctx = liftPreload(shellSrc, s.env);
    start(s, ctx);
    for (let i = 0; i < rows.length + 2 && s.queued.length; i++) s.runOne();
    const pre = s.f.document.getElementById(`${rows[0][1]}-pre`);
    if (pre) {
      const own = s.f.document.createElement('link');
      own.id = rows[0][1]; own.rel = 'stylesheet'; own.href = new URL(`${rows[0][2]}?v=old`, SHELL_URL).href;
      s.f.document.head.appendChild(own); s.f.flush();
      pre.id = rows[0][1]; s.f.flush();
      own.fire('load'); s.f.flush();
      if (!pre.isConnected) out.push('SHELL: the cleanup unlinked a preload adopted while an older link was loading');
    } else out.push('SHELL: no preload to run the cleanup\'s guard leg');
  }
  const cleanupOk = out.length === cleanupAt;
  // every scenario: each requestIdleCallback call without a timeout option, the first included; each link the chain
  // made a preload of a table row (never the module's own id) with its href, rel and data-optional; no callback threw
  const argc = envs.flatMap((s) => s.calls), timed = argc.filter((n) => n !== 1);
  if (timed.length) out.push(`SHELL: requestIdleCallback got ${timed[0]} arguments in ${timed.length} of ${argc.length} call(s) across the scenarios, the first included (a timeout option competes with boot)`);
  const byId = new Map(want.map((w) => [w.id, w]));
  for (const c of envs.flatMap((s) => s.f.created())) {
    const w = byId.get(c.id);
    if (!w) { out.push(`SHELL: linked '${c.id}', not a preload id of the table (a preload never uses the module's own id; play's sheet comes with its mount)`); continue; }
    if (c.href !== w.href) out.push(`SHELL: preload ${c.id} href ${c.href}, want ${w.href}`);
    if (c.rel !== 'stylesheet') out.push(`SHELL: preload ${c.id} rel '${c.rel}'`);
    if (!c.optional) out.push(`SHELL: preload ${c.id} lacks data-optional (a failure would trip the boot guard)`);
  }
  const thrown = envs.flatMap((s) => s.thrown);
  if (thrown.length) out.push(`SHELL: an idle callback threw (${thrown[0].name}: ${thrown[0].message}): in a browser the chain stops there`);
  // a listener that throws (the preload's error listener, the cleanup's drop) is an uncaught error in a browser
  const le = envs.flatMap((s) => s.f.listenerErrors);
  if (le.length) out.push(`SHELL: a listener threw during the shell scenarios (${le[0].name}: ${le[0].message}): an uncaught error in a browser`);
  return { out: [...new Set(out)], cleanupOk };
}

// ---- MODULE ---------------------------------------------------------------------------------------------------------
function liftModule(src, file, document) {
  const body = block(src, 'function ensureSheet() {', `${file} ensureSheet`).replaceAll('import.meta.url', JSON.stringify(new URL(file, APP_URL).href));
  const pf = block(src, 'export function prefetch() {', `${file} prefetch`).replace('export function prefetch', 'function prefetch');
  const consts = [...src.matchAll(/^const \w+_CSS_V = '[^']+';/gm)].map((m) => m[0]).join('\n');
  const state = ['let sheetPromise = null;', /^let sheetSettled = false;/m.test(src) ? 'let sheetSettled = false;' : ''].join('\n');
  // prefetch() bodies may touch other module state (replays pre-reads its archive): its FIRST statement must be the
  // synchronous ensureSheet() call (`ensureSheet();` or `return ensureSheet();`)
  const pfCalls = /^function prefetch\(\) \{\s*(return )?ensureSheet\(\);/.test(pf);
  const ctx = vm.createContext({ document, URL, Promise });
  vm.runInContext(`'use strict';\n${consts}\n${state}\n${body}\nthis.ensureSheet = ensureSheet;`, ctx);
  return { ensureSheet: ctx.ensureSheet, prefetchLinks: pfCalls };
}

async function checkModule(src, file, { legacy = false } = {}) {
  const out = [];
  const m = parseModule(src, file);
  const own = new URL(`${m.rel}?v=${m.v}`, new URL(file, APP_URL)).href;
  const stale = own.replace(/\?v=[^&]+/, '?v=stale');
  const pre = `${m.id}-pre`;
  const run = async (label, setup, judge) => {
    (legacy ? LEGACY_CASES_SEEN : MODULE_CASES_SEEN).add(label);
    const f = fakeDocument();
    const p = setup ? setup(f) : null;
    let settled = false, rejected = null, msg;
    try {
      const mod = liftModule(src, file, f.document);
      Promise.resolve(mod.ensureSheet()).then(() => { settled = true; }, (e) => { rejected = e; });
      await flush();
      msg = await judge({ f, p, settled: () => settled, mod });
    } catch (e) { msg = `threw ${e.name}: ${e.message}`; }
    const le = f.listenerErrors[0];
    if (le) msg = `a load/error listener threw (${le.name}: ${le.message})${msg ? `; ${msg}` : ''}`;
    if (rejected) msg = `ensureSheet() rejected (${rejected.name}: ${rejected.message})${msg ? `; ${msg}` : ''}`;
    if (msg) out.push(`MODULE ${file}${legacy ? ' (legacy control)' : ''} ${label}: ${msg}`);
  };
  const ownLink = (f) => f.document.getElementById(m.id);
  await run('no link → its own', null, async ({ f, settled }) => {
    const l = ownLink(f);
    if (!l || l.href !== own) return `no own link with ${own}${l ? ` (it has ${l.href})` : ''}`;
    if (l.rel !== 'stylesheet') return `own link rel '${l.rel}' (a browser never loads it, so the module never settles)`;
    if (settled()) return 'settled before its sheet loaded';
    l.fire('load'); await flush();
    return settled() ? null : 'did not settle on load';
  });
  await run('its own present link, loaded → settled at once', (f) => f.preset(m.id, own, true), async ({ f, p, settled }) =>
    (!settled() ? 'not settled at once' : p.requests || f.connected().length !== 1 ? `re-requested (${p.requests}) or a second link` : null));
  await run('its own present link, loading → settles on its load, never re-requested', (f) => f.preset(m.id, own, false), async ({ f, p, settled }) => {
    if (ownLink(f) !== p || p.requests || f.connected().length !== 1) return `re-requested (${p.requests}) or a second link`;
    if (settled()) return 'settled before its load';
    p.fire('load'); await flush();
    return settled() ? null : 'did not settle on its load';
  });
  await run('own sheet fails → settles', null, async ({ f, settled }) => {
    ownLink(f)?.fire('error'); await flush();
    return settled() ? null : 'did not settle on error';
  });
  if (legacy) {
    await run('fresh shell × stale module: a preload with its href, loading → ignored, own linked and awaited', (f) => f.preset(pre, own, false), async ({ f, p, settled }) => {
      const l = ownLink(f);
      if (!l || l === p) return 'did not link its own';
      if (settled()) return 'settled on the preload (an older module must wait for its own)';
      if (!p.isConnected || p.id !== pre) return 'touched the preload';
      l.fire('load'); await flush();
      return settled() ? null : 'did not settle on its own load';
    });
    return out;
  }
  await run('preload with its href, loaded → adopted at once', (f) => f.preset(pre, own, true), async ({ f, p, settled }) => {
    if (p.id !== m.id || ownLink(f) !== p) return 'not adopted under its own id';
    if (!settled()) return 'not settled at once';
    if (p.requests || f.connected().length !== 1) return `re-requested (${p.requests}) or a second link`;
    return null;
  });
  await run('preload with its href, loading → adopted, settles on load', (f) => f.preset(pre, own, false), async ({ f, p, settled }) => {
    if (p.id !== m.id || ownLink(f) !== p) return 'not adopted under its own id';
    if (p.requests || f.connected().length !== 1) return `re-requested (${p.requests}) or a second link`;
    if (settled()) return 'settled before the load';
    p.fire('load'); await flush();
    return settled() ? null : 'did not settle on the adopted link\'s load';
  });
  await run('preload with its href, loading → error → settles, the link stays', (f) => f.preset(pre, own, false), async ({ p, settled }) => {
    p.fire('error'); await flush();
    if (!settled()) return 'did not settle on the adopted link\'s error';
    return p.isConnected ? null : 'the adopted link vanished';
  });
  for (const loaded of [true, false]) {
    await run(`preload with ANOTHER ?v=, ${loaded ? 'loaded' : 'loading'} → unlinked, its own linked`, (f) => f.preset(pre, stale, loaded), async ({ f, p, settled }) => {
      if (p.isConnected) return 'the stale preload stayed linked';
      const l = ownLink(f);
      if (!l || l.href !== own) return 'did not link its own';
      if (settled()) return 'settled on the stale sheet';
      l.fire('load'); await flush();
      return settled() ? null : 'did not settle on its own load';
    });
  }
  await run('prefetch() starts with ensureSheet()', null, async ({ mod }) => (mod.prefetchLinks ? null : 'prefetch() no longer starts by linking the sheet'));
  return out;
}

// the legacy control: the module with its adoption statement (and its #811 comment) removed; null when the statement
// is not there to remove (a plant or an edit changed it), which the gate reports instead of running a copy that adopts
const ADOPTION = /const pre = link \? null : document\.getElementById\('ob-[\w-]+-css-pre'\);\s*if \(pre && pre\.href === href\) \{ pre\.id = 'ob-[\w-]+-css'; link = pre; \} else pre\?\.remove\(\);/;
const legacyOf = (src) => (ADOPTION.test(src)
  ? src.replace(ADOPTION, '').replace(/\n[^\n]*\/\/ #811: the shell's boot-idle preload[^\n]*(\n\s*\/\/[^\n]*)*/, '')
  : null);

const MODULE_CASES_SEEN = new Set(), LEGACY_CASES_SEEN = new Set();
async function gate(shellSrc, modSrcs) {
  const shell = checkShell(shellSrc, modSrcs);
  const fails = [...checkTable(shellSrc, modSrcs, shell.cleanupOk), ...shell.out];
  for (const [file, src] of Object.entries(modSrcs)) {
    fails.push(...await checkModule(src, file));
    const legacy = legacyOf(src);
    if (legacy === null) fails.push(`MODULE ${file}: the adoption statement was not found for the legacy control`);
    else fails.push(...await checkModule(legacy, file, { legacy: true }));
  }
  return fails;
}

const shellSrc = read('web/app/shell.js');
const { places, rows } = parseShell(shellSrc);
const modSrcs = Object.fromEntries(rows.map(([p]) => places[p]).filter(Boolean).map((f) => [f, read(`web/app/${f}`)]));

if (process.argv.includes('--selftest')) {
  const S = 'shell.js';
  // a plant's anchor must occur exactly once in its file (absent or ambiguous = INVALID): an anchor that matched first
  // in another function once planted outside the lifted code. RegExp anchors are counted with their own flags, and
  // the replacement is inserted literally (no $-patterns).
  const swap = (from, to) => (s) => {
    const n = typeof from === 'string' ? s.split(from).length - 1
      : (s.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`)) || []).length;
    if (n !== 1) throw new Error(`anchor found ${n} times`);
    return s.replace(from, () => to);
  };
  // anchors follow the parsed table, never today's ?v= (a bump done by the duplicated-literal law keeps --selftest green)
  const rowOf = (place) => rows.find((r) => r[0] === place);
  const lineOf = (r) => `    ['${r[0]}', '${r[1]}', '${r[2]}?v=${r[3]}'],\n`;
  const bumpV = (v) => (/^\d+$/.test(v) ? String(Number(v) + 4).padStart(v.length, '0') : `${v}b`);
  const [, , relP, vP] = rowOf('practice'), [, , relE, vE] = rowOf('equipment');
  const renamed = relP.replace(/\.css$/, '-v2.css');
  const OBS = "        if (!watch && typeof MutationObserver === 'function') {\n          watch = new MutationObserver(cleanup);\n          watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });\n        }\n";
  const everywhere = (from, to) => (s) => { if (!s.includes(from)) throw new Error('anchor found 0 times'); return s.split(from).join(to); };
  const P = (name, file, from, to, expect) => [name, [[file, swap(from, to)]], expect];
  const GUARD = '      if (window.__test?.ready !== true || (mover.moving() && queue[0][0] !== active)) {\n        window.requestIdleCallback(step);\n        return;\n      }\n';
  const plants = [
    // SHELL: requestIdleCallback without a timeout option, every call in every scenario
    P('a timeout option on the re-armed idle callbacks', S, '      window.requestIdleCallback(step);\n    };', '      window.requestIdleCallback(step, { timeout: 2000 });\n    };', 'requestIdleCallback got 2 arguments'),
    P('a timeout option on the FIRST idle callback', S, '    };\n    window.requestIdleCallback(step);\n  }\n', '    };\n    window.requestIdleCallback(step, { timeout: 2000 });\n  }\n', 'requestIdleCallback got 2 arguments'),
    P('a timeout option only while a camera move defers', S, GUARD, '      if (window.__test?.ready !== true) {\n        window.requestIdleCallback(step);\n        return;\n      }\n      if (mover.moving() && queue[0][0] !== active) {\n        window.requestIdleCallback(step, { timeout: 2000 });\n        return;\n      }\n', 'requestIdleCallback got 2 arguments'),
    P('a timeout option only on a skip', S, '      if (!document.getElementById(linkId) && !document.getElementById(preId)) {', '      if (document.getElementById(linkId) || document.getElementById(preId)) { window.requestIdleCallback(step, { timeout: 2000 }); return; }\n      if (!document.getElementById(linkId) && !document.getElementById(preId)) {', 'requestIdleCallback got 2 arguments'),
    // SHELL: when the chain may link
    P('the boot-ready gate removed', S, 'window.__test?.ready !== true || ', '', 'linked a sheet before boot ready'),
    ['the chain stops waiting for ready after five deferrals', [[S, swap('    const step = () => {\n      if (!queue.length) { tidy(); return; }\n      if (window.__test?.ready', '    let waits = 0;\n    const step = () => {\n      if (!queue.length) { tidy(); return; }\n      if (window.__test?.ready')],
      [S, swap('      if (window.__test?.ready !== true || (mover.moving()', '      if ((window.__test?.ready !== true && ++waits <= 5) || (mover.moving()')]], 'linked a sheet before boot ready'],
    P('the first step runs synchronously', S, '    };\n    window.requestIdleCallback(step);\n  }\n', '    };\n    step();\n  }\n', 'linked a sheet synchronously'),
    P('every sheet in one idle callback', S, '      window.requestIdleCallback(step);\n    };', '      step();\n    };', 'more than one sheet linked in one idle callback'),
    P('the queue taken from its end', S, '      const [, linkId, rel] = queue.shift();', '      const [, linkId, rel] = queue.pop();', 'in table order'),
    P('no requestIdleCallback guard', S, "    if (typeof window.requestIdleCallback !== 'function') return;\n", '', 'threw without requestIdleCallback'),
    P('a no-rIC fallback that links', S, "    if (typeof window.requestIdleCallback !== 'function') return;\n", "    if (typeof window.requestIdleCallback !== 'function') { const l = document.createElement('link'); l.id = `${PLACE_SHEETS[0][1]}-pre`; l.rel = 'stylesheet'; l.setAttribute('data-optional', ''); l.href = new URL(PLACE_SHEETS[0][2], import.meta.url).href; document.head.appendChild(l); return; }\n", 'linked a sheet without requestIdleCallback'),
    // SHELL: the camera-move rule
    P('the camera-move guard removed', S, ' || (mover.moving() && queue[0][0] !== active)', '', 'during a move to another place'),
    P('no destination exception in a move', S, ' && queue[0][0] !== active)', ')', 'did not link the destination\'s sheet during its move'),
    P('the destination\'s preload under the module\'s own id in a move', S, 'const preId = `${linkId}-pre`;', 'const preId = mover.moving() ? linkId : `${linkId}-pre`;', "never uses the module's own id"),
    // SHELL: skip, move on, stop
    P('no skip for a place already linked', S, 'if (!document.getElementById(linkId) && !document.getElementById(preId)) {', 'if (true) {', 'linked again although its own link existed'),
    P('no skip for an existing preload', S, ' && !document.getElementById(preId)) {', ') {', 'linked again although its preload existed'),
    P('an existing preload replaced', S, '      if (!document.getElementById(linkId) && !document.getElementById(preId)) {', '      document.getElementById(preId)?.remove();\n      if (!document.getElementById(linkId) && !document.getElementById(preId)) {', 'unlinked a link that already existed'),
    P('a skip stalls the chain (re-arm without moving on)', S, '      const [, linkId, rel] = queue.shift();\n      const preId = `${linkId}-pre`;\n', '      const [, linkId, rel] = queue[0];\n      const preId = `${linkId}-pre`;\n      if (document.getElementById(linkId) || document.getElementById(preId)) { window.requestIdleCallback(step); return; }\n      queue.shift();\n', 'did not continue past the skipped places'),
    P('a skip ends the chain', S, '      const preId = `${linkId}-pre`;\n', '      const preId = `${linkId}-pre`;\n      if (document.getElementById(linkId) || document.getElementById(preId)) return;\n', 'did not continue past the skipped places'),
    P('the chain re-arms on an empty queue', S, '      if (!queue.length) { tidy(); return; }\n      if (window.__test?.ready', '      if (!queue.length) { tidy(); window.requestIdleCallback(step); return; }\n      if (window.__test?.ready', 're-arms after its queue emptied'),
    // SHELL: the error path
    P('a failed preload unlinked even when adopted', S, '() => { if (link.id === preId) link.remove(); }', '() => { link.remove(); }', 'ADOPTED was unlinked'),
    P('a failed preload never unlinked', S, "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n", '', 'unadopted preload stayed linked'),
    P('an undeclared assignment in the chain (strict, as the module is)', S, '      const preId = `${linkId}-pre`;\n', '      preId = `${linkId}-pre`;\n', 'an idle callback threw'),
    // SHELL: the cleanup
    P('no cleanup', S, "        if (!watch && typeof MutationObserver === 'function') {\n          watch = new MutationObserver(cleanup);\n          watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });\n        }\n", '', 'an unadopted preload stayed beside an older module\'s loaded own link'),
    P('the cleanup unlinks an adopted link', S, "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n", "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n        link.addEventListener('load', () => { if (document.getElementById(linkId)) link.remove(); }, { once: true });\n", 'the cleanup unlinked an ADOPTED link'),
    P('the drop without its preload-id guard', S, 'const drop = () => { if (pre.id === `${row[1]}-pre`) pre.remove(); };', 'const drop = () => { pre.remove(); };', 'adopted while an older link was loading'),
    P('the drop at insertion, before the own link settles', S, "          n.addEventListener('load', drop, { once: true });\n          n.addEventListener('error', drop, { once: true });\n", '          drop();\n', 'dropped a preload before the older module\'s own link settled'),
    P('the drop only on load', S, "          n.addEventListener('error', drop, { once: true });\n", '', 'stayed beside an older module\'s failed own link'),
    P('the cleanup unlinks the older link instead', S, 'const drop = () => { if (pre.id === `${row[1]}-pre`) pre.remove(); };', 'const drop = () => { if (pre.id === `${row[1]}-pre`) n.remove(); };', 'unlinked the older module\'s own link'),
    P('the observer never disconnects', S, '        watch.disconnect();\n        watch = null;\n', '', 'still watching after every place sheet was adopted or settled'),
    P('the observer disconnects once the chain is done', S, '      if (watch && !queue.length && !PLACE_SHEETS.some(([, id]) => document.getElementById(`${id}-pre`))) {', '      if (watch && !queue.length) {', 'no cleanup observer watching while unadopted preloads remain'),
    P('the observer disconnects after the first drop', S, '      if (watch && !queue.length && !PLACE_SHEETS.some(([, id]) => document.getElementById(`${id}-pre`))) {', '      if (watch && !queue.length && PLACE_SHEETS.filter(([, id]) => document.getElementById(`${id}-pre`)).length < 2) {', 'stopped while an unadopted preload remained'),
    P('the observer ignores id changes (adoptions)', S, "watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });", 'watch.observe(document.head, { childList: true });', 'still watching after every place sheet was adopted or settled'),
    // the cleanup scenarios' own preconditions: a scenario that cannot judge says so (never a silent pass)
    P('the chain never links after ready (cleanup leg)', S, '      const [, linkId, rel] = queue.shift();\n', '      if (queue.length) return;\n      const [, linkId, rel] = queue.shift();\n', 'cannot run the cleanup leg'),
    P('the chain never links after ready (adoption leg)', S, '      const [, linkId, rel] = queue.shift();\n', '      if (queue.length) return;\n      const [, linkId, rel] = queue.shift();\n', 'cannot run the adoption leg'),
    P('the chain never links after ready (guard leg)', S, '      const [, linkId, rel] = queue.shift();\n', '      if (queue.length) return;\n      const [, linkId, rel] = queue.shift();\n', "no preload to run the cleanup's guard leg"),
    P('an older module that never appends its own link (cleanup leg)', 'practice.js', '      document.head.appendChild(link);\n    }\n', '    }\n', "the legacy copy of 'practice' did not link its own sheet"),
    P('a current module that never adopts (adoption leg)', 'atelier.js', "{ pre.id = 'ob-atelier-css'; link = pre; }", '{ link = pre; }', "'equipment' did not adopt its preload"),
    // the lens review of the cleanup: the mid-chain leg, an older link at another ?v=, loaded unadopted preloads, the
    // chain-end tidy, the observer's start, shell listeners that throw, a module that throws in the cleanup leg
    P('the cleanup reads records only once the chain is done', S, '      for (const r of records) {', '      for (const r of queue.length ? [] : records) {', 'the chain still running'),
    P('the observer starts only with the last preload', S, "        if (!watch && typeof MutationObserver === 'function') {", "        if (!watch && !queue.length && typeof MutationObserver === 'function') {", 'no cleanup observer after the first preload'),
    P('the observer starts before any preload', S, '    let watch = null;\n', "    let watch = typeof MutationObserver === 'function' ? new MutationObserver((r) => cleanup(r)) : null;\n    watch?.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });\n", 'a cleanup observer before any preload'),
    P('the cleanup drops only a same-href duplicate', S, '          if (!pre) continue;', '          if (!pre || pre.href !== n.href) continue;', 'the chain still running'),
    ['the same, with another *_CSS_V above the module\'s own', [[S, swap('          if (!pre) continue;', '          if (!pre || pre.href !== n.href) continue;')],
      ['practice.js', swap(`const PRACTICE_CSS_V = '${vP}';`, `const PRACTICE_PRINT_CSS_V = '001';\nconst PRACTICE_CSS_V = '${vP}';`)]], 'the chain still running'],
    P('the cleanup matches a preload\'s own insertion', S, 'PLACE_SHEETS.find(([, id]) => id === n.id)', 'PLACE_SHEETS.find(([, id]) => n.id.startsWith(id))', 'a loaded, unadopted preload was unlinked before any module adopted it'),
    P('a preload unlinks itself when it loads', S, "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n", "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n        link.addEventListener('load', () => { if (link.id === preId) link.remove(); }, { once: true });\n", 'a loaded, unadopted preload was unlinked before any module adopted it'),
    P('no tidy at the chain\'s end', S, '      if (!queue.length) { tidy(); return; }', '      if (!queue.length) return;', 'the chain-end tidy'),
    P('the drop throws after unlinking (strict)', S, 'const drop = () => { if (pre.id === `${row[1]}-pre`) pre.remove(); };', 'const drop = () => { if (pre.id === `${row[1]}-pre`) pre.remove(); dropped += 1; };', 'a listener threw during the shell scenarios'),
    P('the preload\'s error listener throws (strict)', S, "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });", "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); reportErr(); }, { once: true });", 'reportErr is not defined'),
    P('a module ensureSheet() that throws at once (tidy leg)', 'atelier.js', 'function ensureSheet() {\n  if (sheetPromise) return sheetPromise;', 'function ensureSheet() {\n  noteSheet();\n  if (sheetPromise) return sheetPromise;', 'module threw in the tidy leg'),
    P('a module ensureSheet() that throws at once (cleanup leg)', 'replays.js', 'function ensureSheet() {\n  if (sheetPromise) return sheetPromise;', 'function ensureSheet() {\n  noteSheet();\n  if (sheetPromise) return sheetPromise;', 'module threw in the cleanup leg'),
    ['a link id moved off the pre-adoption id (the tripwire)', [[S, swap("['practice', 'ob-practice-css',", "['practice', 'ob-practice2-css',")], ['practice.js', everywhere('ob-practice-css', 'ob-practice2-css')]], "link id 'ob-practice2-css' moved off 'ob-practice-css'"],
    P('preloadSheets throws at its start (strict)', S, '    const queue = PLACE_SHEETS.filter', '    queue = PLACE_SHEETS.filter', 'preloadSheets() threw'),
    // SHELL: what each link carries
    P('the preload under the module\'s own id', S, 'const preId = `${linkId}-pre`;', 'const preId = linkId;', "never uses the module's own id"),
    P('the preload without data-optional', S, "        link.setAttribute('data-optional', '');\n", '', 'lacks data-optional'),
    P('the preload without rel', S, "        link.rel = 'stylesheet';\n        link.setAttribute", '        link.setAttribute', "rel ''"),
    P('a document-relative preload href (a 404 in the browser)', S, 'link.href = new URL(rel, import.meta.url).href;', 'link.href = rel;', `href ${new URL(`${relP}?v=${vP}`, DOC_URL).href}, want`),
    P('the preload href without its ?v=', S, 'link.href = new URL(rel, import.meta.url).href;', "link.href = new URL(rel.split('?')[0], import.meta.url).href;", `href ${new URL(relP, SHELL_URL).href}, want`),
    P('prefetchContent no longer starts the preload', S, '    preloadSheets(); // #811', '    // preloadSheets(); // #811', 'does not start preloadSheets()'),
    P('the chain stops re-arming before ready', S, GUARD, '      if (window.__test?.ready !== true) return;\n      if (mover.moving() && queue[0][0] !== active) {\n        window.requestIdleCallback(step);\n        return;\n      }\n', 'stopped re-arming before boot ready'),
    ['a skipped row re-queued forever', [[S, swap('      const [, linkId, rel] = queue.shift();', '      const row = queue.shift(), [, linkId, rel] = row;')],
      [S, swap('        document.head.appendChild(link);\n      }\n', '        document.head.appendChild(link);\n      } else queue.push(row);\n')]], 'kept re-arming after the skips'],
    P('the chain ends after a link made inside a move', S, '        document.head.appendChild(link);\n      }\n      window.requestIdleCallback(step);', '        document.head.appendChild(link);\n      }\n      if (mover.moving()) return;\n      window.requestIdleCallback(step);', 'did not resume after the move'),
    P('the chain never links after ready', S, '      const [, linkId, rel] = queue.shift();\n', '      if (queue.length) return;\n      const [, linkId, rel] = queue.shift();\n', 'fewer than two preloads to judge the error path'),
    // TABLE
    P('an empty PLACE_SHEETS', S, rows.map(lineOf).join(''), '', 'PLACE_SHEETS has no rows'),
    P('a one-row PLACE_SHEETS (the shell scenarios need two)', S, rows.slice(1).map(lineOf).join(''), '', 'fewer than two PLACE_SHEETS rows to run the scenarios'),
    P('a row for a place CONTENT_MODULES lacks', S, '  const PLACE_SHEETS = [\n', "  const PLACE_SHEETS = [\n    ['lessons', 'ob-lessons-css', './ui/lessons.css?v=001'],\n", "row 'lessons' is not a CONTENT_MODULES place"),
    ['a new place whose module the gate never read', [[S, swap('const CONTENT_MODULES = {\n', "const CONTENT_MODULES = {\n  lessons: ['./lessons.js', 'createLessons'],\n")],
      [S, swap('  const PLACE_SHEETS = [\n', "  const PLACE_SHEETS = [\n    ['lessons', 'ob-lessons-css', './ui/lessons.css?v=001'],\n")]], 'lessons.js not read'],
    P('table version drift', S, `'${relP}?v=`, `'${relP}?v=x`, `?v=x${vP} !=`),
    P('table link id drift', S, "['equipment', 'ob-atelier-css',", "['equipment', 'ob-atelier-sheet',", "link id 'ob-atelier-sheet' != atelier.js's 'ob-atelier-css'"),
    P('table sheet file drift', S, "'ob-replays-css', './ui/replays.css?v=", "'ob-replays-css', './ui/replay.css?v=", "sheet './ui/replay.css'"),
    P('a content place without a row', S, /\n\s*\['replays', 'ob-replays-css', [^\n]*\],/, '', "'replays' has no PLACE_SHEETS row"),
    P('a play row', S, '  const PLACE_SHEETS = [\n', "  const PLACE_SHEETS = [\n    ['play', 'ob-play-css', './ui/play.css?v=023'],\n", 'play has a row'),
    P('a CONTENT_MODULES entry the parser cannot read', S, 'const CONTENT_MODULES = {\n', 'const CONTENT_MODULES = {\n  lessons: ["./lessons.js", "createLessons"],\n', 'CONTENT_MODULES entr(ies) escaped the parser'),
    P('a PLACE_SHEETS row the parser cannot read', S, '  const PLACE_SHEETS = [\n', '  const PLACE_SHEETS = [\n    ["lessons", "ob-lessons-css", "./ui/lessons.css?v=001"],\n', 'PLACE_SHEETS row(s) escaped the parser'),
    ['an unread entry hidden by two rows on one line', [[S, swap('const CONTENT_MODULES = {\n', 'const CONTENT_MODULES = {\n  lessons: ["./lessons.js", "createLessons"],\n')],
      [S, swap("],\n    ['replays', 'ob-replays-css',", "], ['replays', 'ob-replays-css',")]], 'CONTENT_MODULES entr(ies) escaped the parser'],
    ['a ?v= bump without a working cleanup (the tripwire)', [[S, swap(`'${relP}?v=${vP}'`, `'${relP}?v=${bumpV(vP)}'`)], ['practice.js', swap(`const PRACTICE_CSS_V = '${vP}';`, `const PRACTICE_CSS_V = '${bumpV(vP)}';`)], [S, swap(OBS, '')]], `moved off ${PRE_ADOPTION.practice[1]}`],
    ['a sheet rename without a working cleanup (the tripwire)', [[S, swap(`'${relP}?v=${vP}'`, `'${renamed}?v=${vP}'`)], ['practice.js', swap('`' + relP + '?v=${PRACTICE_CSS_V}`', '`' + renamed + '?v=${PRACTICE_CSS_V}`')], [S, swap(OBS, '')]], `moved off ${PRE_ADOPTION.practice[1]}`],
    // MODULE
    P('a module adopts a preload whatever its href', 'practice.js', "if (pre && pre.href === href) { pre.id = 'ob-practice-css'; link = pre; }", "if (pre) { pre.id = 'ob-practice-css'; link = pre; }", 'the stale preload stayed linked'),
    P('a module adopts without renaming (loaded)', 'replays.js', "{ pre.id = 'ob-replays-css'; link = pre; }", '{ link = pre; }', 'loaded → adopted at once: not adopted under its own id'),
    P('a module adopts without renaming (loading)', 'practice.js', "{ pre.id = 'ob-practice-css'; link = pre; }", '{ link = pre; }', 'loading → adopted, settles on load: not adopted under its own id'),
    P('a module adds a second link when it adopts (loaded)', 'atelier.js', "{ pre.id = 'ob-atelier-css'; link = pre; }", "{ pre.id = 'ob-atelier-css'; link = pre; document.head.appendChild(document.createElement('link')); }", 'loaded → adopted at once: re-requested (0) or a second link'),
    P('a module adds a second link when it adopts (loading)', 'practice.js', "{ pre.id = 'ob-practice-css'; link = pre; }", "{ pre.id = 'ob-practice-css'; link = pre; document.head.appendChild(document.createElement('link')); }", 'loading → adopted, settles on load: re-requested (0) or a second link'),
    P('a module never settles a present loaded link', 'practice.js', '    if (link?.sheet) { settle(); return; }\n', '    if (link?.sheet) { return; }\n', 'its own present link, loaded → settled at once: not settled at once'),
    P('a module throws on its loaded path', 'atelier.js', '    if (link && link.sheet) { resolve(); return; }', '    if (link && link.sheet) { resolved(); return; }', 'ensureSheet() rejected (ReferenceError: resolved is not defined)'),
    P('a module settles before its new link loads', 'practice.js', '      document.head.appendChild(link);\n    }\n', '      document.head.appendChild(link);\n      settle();\n    }\n', 'no link → its own: settled before its sheet loaded'),
    P('a module settles a present loading link at once', 'replays.js', "    link.addEventListener('load', settle, { once: true });", "    settle(); link.addEventListener('load', settle, { once: true });", 'loading → settles on its load, never re-requested: settled before its load'),
    P('a module settles an adopted loading link at once', 'atelier.js', "    link.addEventListener('load', () => resolve(), { once: true });", "    resolve(); link.addEventListener('load', () => resolve(), { once: true });", 'loading → adopted, settles on load: settled before the load'),
    P('a module settles when it unlinks a stale preload', 'practice.js', 'link = pre; } else pre?.remove();', 'link = pre; } else if (pre) { pre.remove(); settle(); }', 'settled on the stale sheet'),
    P('a module drops a stale preload without linking its own', 'replays.js', 'link = pre; } else pre?.remove();', 'link = pre; } else if (pre) { pre.remove(); res(true); return; }', 'loaded → unlinked, its own linked: did not link its own'),
    P('a module re-requests the preload it adopts', 'practice.js', "{ pre.id = 'ob-practice-css'; link = pre; }", "{ pre.id = 'ob-practice-css'; link = pre; link.href = href; }", 'adopted at once: not settled at once'),
    P('a module keeps a stale preload linked', 'atelier.js', 'link = pre; } else pre?.remove();', 'link = pre; }', 'the stale preload stayed linked'),
    P('a module re-requests its present loaded link', 'practice.js', '    if (link?.sheet) { settle(); return; }\n', '    if (link?.sheet) { settle(); link.href = href; return; }\n', 'loaded → settled at once: re-requested (1)'),
    P('a module re-creates its present loading link', 'practice.js', "    if (!link) {\n      link = document.createElement('link');\n      link.id = 'ob-practice-css';", "    if (!link?.sheet) {\n      link = document.createElement('link');\n      link.id = 'ob-practice-css';", 'never re-requested: re-requested (0) or a second link'),
    P('a module links its own sheet document-relative', 'practice.js', "      link.rel = 'stylesheet';\n      link.href = href;\n", "      link.rel = 'stylesheet';\n      link.href = './ui/practice.css?v=' + PRACTICE_CSS_V;\n", 'MODULE practice.js no link → its own: no own link with'),
    P('a module links its own sheet without rel', 'practice.js', "      link.rel = 'stylesheet';\n      link.href = href;\n", '      link.href = href;\n', "no link → its own: own link rel ''"),
    P('a module never appends its own link', 'atelier.js', '    if (!link.isConnected) document.head.appendChild(link);\n', '', 'MODULE atelier.js no link → its own: no own link with'),
    P('a module ignores its link\'s load', 'practice.js', "    link.addEventListener('load', settle, { once: true });\n", '', 'did not settle on the adopted link\'s load'),
    P('a module ignores its adopted link\'s error', 'practice.js', "    link.addEventListener('error', settle, { once: true });\n", '', 'did not settle on the adopted link\'s error'),
    P('a module ignores its own new link\'s load', 'replays.js', "    link.addEventListener('load', settle, { once: true });\n", '', 'no link → its own: did not settle on load'),
    P('a module ignores its present link\'s load', 'atelier.js', "    link.addEventListener('load', () => resolve(), { once: true });\n", '', 'loading → settles on its load, never re-requested: did not settle on its load'),
    P('a module ignores the load of the link it makes after a stale preload', 'replays.js', "    link.addEventListener('load', settle, { once: true });\n", '', 'unlinked, its own linked: did not settle on its own load'),
    P('a module unlinks its adopted link on error', 'replays.js', "    link.addEventListener('error', settle, { once: true });", "    link.addEventListener('error', () => { link.remove(); settle(); }, { once: true });", 'the adopted link vanished'),
    P('a module never settles on its own sheet\'s failure', 'atelier.js', "    link.addEventListener('error', () => resolve(), { once: true });\n", '', 'own sheet fails → settles: did not settle on error'),
    P('a module listener that throws after settling', 'practice.js', "    link.addEventListener('load', settle, { once: true });", "    link.addEventListener('load', () => { settle(); reportLoad(); }, { once: true });", 'reportLoad is not defined'),
    P('an undeclared assignment in a module (strict, as the module is)', 'practice.js', 'const settle = () => { sheetSettled = true;', 'const settle = () => { sheetSetled = true;', 'sheetSetled is not defined'),
    P('prefetch() no longer starts with ensureSheet()', 'replays.js', 'export function prefetch() {\n  ensureSheet();', 'export function prefetch() {\n  void 0;\n  ensureSheet();', 'no longer starts by linking the sheet'),
  ];
  const passArms = [
    ['observe options without attributes: true (attributeFilter implies it)', [[S, swap("watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });", "watch.observe(document.head, { childList: true, subtree: true, attributeFilter: ['id'] });")]]],
    ['a ?v= bump with the cleanup (a GH-1001-style bump)', [[S, swap(`'${relE}?v=${vE}'`, `'${relE}?v=${bumpV(vE)}'`)], ['atelier.js', swap(`const ATELIER_CSS_V = '${vE}';`, `const ATELIER_CSS_V = '${bumpV(vE)}';`)]]],
    ['the chain appends a link before filling it in', [[S, swap("        const link = document.createElement('link');\n", "        const link = document.createElement('link');\n        document.head.appendChild(link);\n")],
      [S, swap("        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n        document.head.appendChild(link);\n", "        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });\n")]]],
  ];
  let caught = 0, invalid = 0, armsGreen = 0;
  for (const [name, edits] of passArms) {
    let sh = shellSrc;
    const mods = { ...modSrcs };
    try {
      for (const [file, edit] of edits) { if (file === S) sh = edit(sh); else mods[file] = edit(mods[file]); }
    } catch (e) { invalid++; console.log(`  INVALID (${e.message}): pass arm ${name}`); continue; }
    let fails;
    try { fails = await gate(sh, mods); } catch (e) { invalid++; console.log(`  INVALID (threw: ${e.message.slice(0, 120)}): pass arm ${name}`); continue; }
    armsGreen += fails.length ? 0 : 1;
    console.log(`  ${fails.length ? 'RED  ' : 'green'}  pass arm: ${name}${fails.length ? ` — ${fails[0]}` : ''}`);
  }
  for (const [name, edits, expect] of plants) {
    let sh = shellSrc;
    const mods = { ...modSrcs };
    try {
      for (const [file, edit] of edits) { if (file === S) sh = edit(sh); else mods[file] = edit(mods[file]); }
    } catch (e) { invalid++; console.log(`  INVALID (${e.message}): ${name}`); continue; }
    let fails;
    try { fails = await gate(sh, mods); } catch (e) { invalid++; console.log(`  INVALID (threw: ${e.message.slice(0, 120)}): ${name}`); continue; }
    const hit = fails.find((f) => f.includes(expect));
    caught += hit ? 1 : 0;
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${name}${hit ? ` — ${hit.slice(0, 220)}` : ` (want '${expect}'; got ${fails.length ? fails[0] : 'no failure'})`}`);
  }
  const control = await gate(shellSrc, modSrcs);
  console.log(`  control (the tree unedited): ${control.length ? `RED ${control.join('; ')}` : 'green'}`);
  const pass = caught === plants.length && armsGreen === passArms.length && !invalid && !control.length;
  console.log(`test-place-sheets --selftest: ${caught} of ${plants.length} plants caught, ${armsGreen} of ${passArms.length} pass arms green, ${invalid} invalid, control ${control.length ? 'red' : 'green'} → ${pass ? 'OK' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

const fails = await gate(shellSrc, modSrcs);
const MODULE_CASES = MODULE_CASES_SEEN.size, LEGACY_CASES = LEGACY_CASES_SEEN.size;
for (const f of fails) console.log(`  FAIL ${f}`);
console.log(`test-place-sheets: ${rows.length} PLACE_SHEETS row(s) (${rows.map(([p, , , v]) => `${p} ?v=${v}`).join(', ')}); `
  + 'the shell\'s preload chain (no rIC / sync / before ready / order / skip / move / error; every call and link) and its cleanup (older module load / error, adoption, guard, observer lifetime); '
  + `${Object.keys(modSrcs).length} module(s) × ${MODULE_CASES} adoption cases + the legacy control (${LEGACY_CASES} cases) → ${fails.length ? `FAIL (${fails.length})` : 'PASS'}`);
process.exit(fails.length ? 1 : 0);
