// Copyright (c) Meta Platforms, Inc. and affiliates.

// swupdate.js — the service-worker UPDATE NOTICE (issue #1047).
//
// A deploy ships a byte-different sw.js. The browser installs the new
// generation in the background and it WAITS: no worker skips waiting at
// install, because a mid-session cache swap would hand a running page the
// next generation's modules (the generation-atomicity law, web/sw.js). Until
// this module, nothing told the player, and a tab that stayed open (or a
// home-screen install that was never force-quit) kept the old build however
// often it reloaded.
//
// While this page is CONTROLLED and a newer worker is WAITING, a kit prompt
// (div#ob-update.ob-prompt, placed by ui/swupdate.css — top centre on a fine
// pointer; on a coarse pointer it waits for the hall and never covers the
// table) says a new version is ready and offers Reload and Later:
//   Reload — the page goes inert and asks the waiting worker to take over
//     ({ob:'skip-waiting'}, web/sw.js). app.html's inline controllerchange
//     listener reloads every controlled app page (this one and any other
//     open tab) the moment it takes over, so no page runs two generations'
//     modules; the reload boots the new generation. One gap, repaired
//     here (#1173): a navigation the outgoing worker serves while the new
//     one takes over gets the OLD app.html under the NEW controller with no
//     controllerchange; verifyGeneration (below) finds it after load and
//     reloads once.
//   Later — hides the prompt for this page's life.
// A worker found installing at attach is followed to 'installed'. The
// worker's fill-miss digest check ({ob:'update-waiting'}: the served tree is
// newer than the active snapshot) asks the browser for the new sw.js at once,
// and a page that comes back to the foreground asks at most hourly, so a
// long-lived tab reaches the prompt without a navigation.
//
// #1388: a plain reload does not release a waiting worker, and the prompt is
// a button a player can miss. So while one waits, a page that is idle in the
// hall and can show it is the only page of the site starts the Reload press's
// machinery by itself, once (autoTakeover below). Everywhere else the prompt
// stands as before.
//
// Reached only through app.html's registration block, after register()
// resolves (a guarded dynamic import, a boot root of the precache: a stale
// cache without this file, or an offline first boot, simply shows no
// prompt). navigator.webdriver boots without ?sw=1 register no worker and
// never load it.
import { t } from './i18n.js';

/** ui/swupdate.css version — bump on every edit to that sheet (the
 * OWNERSHIP CSS addendum: the version lives in the module that links it). */
const CSS_V = '001';
const CHECK_MS = 60 * 60 * 1000;
const RELOAD_BELT_MS = 10000;

// #1167: the take-over can stall after the press. Chrome activates the
// waiting worker once the outgoing one is idle; when a fetch from another
// open tab restarts the outgoing worker in the instant it was stopped, its
// fresh life gets the default idle delay and Chrome makes no new attempt, so
// the page sat inert until the belt reload (~10 s; a lab run with the belt
// moved to 60 s was still held at 60 s). A re-posted skip-waiting does
// nothing (Chromium coalesces it), but any in-scope main-resource request
// makes the browser retry the activation, and a worker script is one that
// navigates nothing. So, from TICK_MS after the press (never at the press: a
// normal take-over is milliseconds), one throwaway dedicated Worker per tick
// on RETRIGGER_URL (an empty script outside the snapshot, passed through by
// the worker: no fill kick), at most MAX_TICKS, all before the belt, until
// controllerchange or until the waiting worker leaves 'installed' /
// 'activating'. Each one is terminated at once and its error ignored.
const RETRIGGER_URL = new URL('../sw-retrigger.js', import.meta.url).href;
const TICK_MS = 1000;
const MAX_TICKS = 8;
// (the timers are wrapped: a bare setTimeout called as env.setTimer() runs
// with env as `this`, an Illegal invocation in the browser; the Worker names
// RETRIGGER_URL itself, so the served-strings gate follows it)
export function retriggerTakeover(waiting, env = {
  sw: navigator.serviceWorker, makeWorker: () => new Worker(RETRIGGER_URL),
  setTimer: (f, ms) => setTimeout(f, ms), clearTimer: (id) => clearTimeout(id),
}) {
  let n = 0, timer = null, done = false;
  const stop = () => { done = true; env.clearTimer(timer); env.sw.removeEventListener('controllerchange', stop); };
  const tick = () => {
    if (done) return;
    if (n >= MAX_TICKS || (waiting.state !== 'installed' && waiting.state !== 'activating')) { stop(); return; }
    n++;
    try {
      const w = env.makeWorker(RETRIGGER_URL);
      w.onerror = (e) => { e.preventDefault(); };
      w.terminate();
    } catch { /* no Worker here: the belt stays the only retry */ }
    timer = env.setTimer(tick, TICK_MS);
  };
  env.sw.addEventListener('controllerchange', stop);
  timer = env.setTimer(tick, TICK_MS);
  return { ticks: () => n, stop };
}

// #1173: a page whose HTML is not its controller's. A navigation the
// outgoing worker serves while the waiting one takes over (the belt reload
// above, the player's own reload, a second tab) gets the OLD app.html under
// the NEW controller, and Chromium sends no controllerchange: app.html's
// listener never fires and no worker waits any more, so nothing reloads it.
// Every module still comes from the new snapshot (measured: the boot graph,
// the stylesheets and later imports were all new in every swapped page);
// only the HTML is old. app.html's <html> tag carries data-ob-html, its own
// content id (gen-sw-precache writes it), and this compares it with the
// controller's snapshot copy: on a mismatch, one reload per distinct pair of
// ids. Nothing without a controller (a first visit; the iOS build has no
// service worker) or with a reload already under way; nothing on any
// failure (the degradation law); and no reload unless sessionStorage reads
// the pair back, so a loop is impossible.
const HTML_ID_RE = /^<html\b[^>]*?\sdata-ob-html="([0-9a-f]*)"/m;
const REPAIR_KEY = 'ob-html-repair';
export function verifyGeneration(env = {
  sw: navigator.serviceWorker, doc: document, win: window,
  fetchText: (u) => fetch(u).then((r) => (r.ok ? r.text() : null)),
  getItem: (k) => sessionStorage.getItem(k), setItem: (k, v) => sessionStorage.setItem(k, v),
  reload: () => location.reload(),
}) {
  if (!env.sw || !env.sw.controller || env.win.__obSwReloading) return Promise.resolve('skip');
  const mine = env.doc.documentElement.dataset.obHtml || '';
  return env.fetchText(new URL('../app.html', import.meta.url).href).then((text) => {
    const m = text ? HTML_ID_RE.exec(text) : null;
    if (!m) return 'unknown'; // a snapshot from before the id: nothing to compare
    const theirs = m[1];
    if (theirs === mine) return 'match';
    if (env.win.__obSwReloading) return 'skip';
    const pair = `${mine}>${theirs}`;
    try {
      if (env.getItem(REPAIR_KEY) === pair) return 'repaired';
      env.setItem(REPAIR_KEY, pair);
      if (env.getItem(REPAIR_KEY) !== pair) return 'no-storage';
    } catch { return 'no-storage'; }
    env.win.__obSwReloading = true;
    try { env.doc.body.inert = true; } catch { /* engine without inert */ }
    env.reload();
    return 'reload';
  }).catch(() => 'error');
}

// #1388: the automatic take-over. While a newer worker WAITS (found at
// attach, or when an install reaches 'installed'), the page starts the Reload
// press's machinery by itself, and only when nothing is interrupted:
//   IDLE   the hall is open with no match live and nothing moving; no replay,
//          save card or session opening (playback.js), no export dialog or
//          run (export.js holdsShot), no recording (record.js); no modal
//          layer painted, no text field in use (takeoverIdle). A shell.js
//          from before this change has no matchLive: never idle.
//   ALONE  this page can show it is the only page of the site: every page
//          holds one shared Web Lock for its life (watchUpdates), and exactly
//          one holder or asker is listed (onlyPage). Another tab's game is
//          never interrupted: with a second page, or in an engine without
//          Web Locks, nothing is automatic and the prompt stands.
//   ONLINE the take-over deletes the old, complete snapshot and the new
//          generation starts with its boot set only: never while the browser
//          says it is offline, and only after one small request has reached
//          the network (netUp: the re-trigger script, which the worker
//          passes through).
//   ONCE   one automatic attempt per document generation and tab: the mark
//          is written, and read back, before the take-over starts, and
//          watchUpdates clears it only on a page that finds no worker
//          waiting. A take-over that stalls ends in the belt reload; the page
//          that boots then still finds the worker waiting and the mark, and
//          shows the prompt: no loop. Storage that does not answer: nothing
//          automatic.
//   FLOOR  at most one automatic take-over per AUTO_FLOOR_MS and tab (its
//          time is stored with the mark and never cleared): a server that
//          hands out alternating sw.js bytes for a while gives one reload,
//          then the prompt.
// "Later" ends it for this page's life, and so does a take-over already
// started (the Reload press sets the same flag). The readings are taken
// again after the lock listing and the network answer (each a task away).
const AUTO_KEY = 'ob-auto-takeover';
const AUTO_AT_KEY = 'ob-auto-takeover-at';
const AUTO_FLOOR_MS = 15 * 60 * 1000;
const PAGE_LOCK = 'ob-app-page';
const AUTO_POLL_MS = 1000;
const AUTO_OFFLINE_MS = 60000; // after a network probe that failed, the next look: never one request a second
const NET_PROBE_MS = 8000; // the probe's own time bound
const ATTACH_CHECK_MS = 5000; // the page's own update check comes this long after it attaches: the boot goes first
// which layers are OPEN: ateliercue.js's reading of the shell's modal layers
const MODAL_UP_SEL = '#ob-settings:not([hidden]), [role="dialog"][aria-modal="true"]:not([hidden]), '
  + '[role="alertdialog"]:not([hidden]), .ob-modal:not([hidden]), .ob-confirm:not([hidden]), dialog[open]';
const NOT_TEXT_INPUT_RE = /^(range|checkbox|radio|button|submit|reset|color|file|image)$/;
export function takeoverIdle(env = { win: window, doc: document }) {
  try {
    const shell = env.win.__shell;
    if (!shell || shell.isOpen() !== true) return false; // not in the hall (or no shell yet)
    if (shell.matchLive() !== false) return false; // a shot has been taken and the rack is not won
    if (shell.busy() !== false) return false; // a flight, the open ramp or a keys change
    if (env.win.__obSwReloading) return false;
    if (env.doc.documentElement.classList.contains('ob-pb-live')) return false; // a replay is up
    const pb = env.win.__playback; // absent until its module loads: then nothing of it runs
    if (pb && (pb.playerOpen() !== false || pb.cardOpen() !== false || pb.opening())) return false; // a replay, its save card (render, transcode, save), a session opening
    if (env.win.__export && env.win.__export.holdsShot() !== false) return false; // an export dialog building or open, a run in flight
    if (env.win.__record && env.win.__record.recording() !== false) return false; // the recorder is capturing
    for (const layer of env.doc.querySelectorAll(MODAL_UP_SEL)) {
      if (layer.getClientRects().length) return false; // painted = open
    }
    const at = env.doc.activeElement;
    if (at && (at.isContentEditable || at.tagName === 'TEXTAREA' || at.tagName === 'SELECT'
      || (at.tagName === 'INPUT' && !NOT_TEXT_INPUT_RE.test(String(at.type || '').toLowerCase())))) return false;
    return true;
  } catch { return false; } // a shell or a hook without one of its words, a throwing query: not idle
}
export function onlyPage(env = { locks: navigator.locks, name: PAGE_LOCK }) {
  try {
    if (!env.locks || typeof env.locks.query !== 'function') return Promise.resolve(false);
    return env.locks.query().then((listed) => {
      const all = [...((listed && listed.held) || []), ...((listed && listed.pending) || [])]; // a page still asking counts
      const holders = all.filter((l) => l && l.name === env.name).length;
      return holders === 1;
    }, () => false);
  } catch { return Promise.resolve(false); }
}
// the network is reachable: not offline by the browser's word, and one small request answered ok (the #1167
// re-trigger script: outside the snapshot, passed through by the worker, never from the HTTP cache, given up after
// NET_PROBE_MS; an engine without AbortSignal.timeout throws here and reads as not reachable)
export function netUp(env = { nav: navigator, probe: () => fetch(RETRIGGER_URL, { cache: 'no-store', signal: AbortSignal.timeout(NET_PROBE_MS) }) }) {
  try {
    if (env.nav.onLine === false) return Promise.resolve(false);
    return env.probe().then((res) => !!res && res.ok === true, () => false);
  } catch { return Promise.resolve(false); }
}
/** One automatic attempt. `x`: { reg, sw, win, docId, dismissed(), taking(),
 * held(), idle(), alone(), online(), now(), getMark(key), setMark(key,
 * value), take() }. Resolves the reason nothing happened, or 'takeover' once
 * x.take() was called. */
export function autoTakeover(x) {
  const ready = () => !!x.reg.waiting && !!x.sw.controller && !x.win.__obSwReloading && !x.dismissed() && !x.taking();
  if (!ready()) return Promise.resolve('skip');
  if (!x.held()) return Promise.resolve('no-lock'); // this page's own lock is not granted yet: it cannot count itself
  if (!x.idle()) return Promise.resolve('busy');
  const mark = `1:${x.docId}`;
  try {
    if (x.getMark(AUTO_KEY) === mark) return Promise.resolve('tried');
    const last = Number(x.getMark(AUTO_AT_KEY));
    if (last > 0 && !(x.now() - last >= AUTO_FLOOR_MS)) return Promise.resolve('floor'); // also a clock that went back
  } catch { return Promise.resolve('unstored'); }
  return x.alone().then((alone) => {
    if (alone !== true) return 'not-alone';
    return x.online().then((up) => {
      if (up !== true) return 'offline';
      if (!ready() || !x.idle()) return 'changed';
      const at = String(x.now());
      try {
        x.setMark(AUTO_KEY, mark);
        x.setMark(AUTO_AT_KEY, at);
        if (x.getMark(AUTO_KEY) !== mark || x.getMark(AUTO_AT_KEY) !== at) return 'unstored';
      } catch { return 'unstored'; }
      x.take();
      return 'takeover';
    }, () => 'offline');
  }, () => 'not-alone');
}

/** The sheet, linked once; resolves true once it applies (false when it
 * failed: the notice is never shown unstyled — a stale tree simply has no
 * notice). */
let sheet = null;
function ensureSheet() {
  if (sheet) return sheet;
  const href = new URL(`./ui/swupdate.css?v=${CSS_V}`, import.meta.url).href;
  sheet = new Promise((resolve) => {
    let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === href);
    if (link?.sheet) { resolve(true); return; }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => resolve(false), { once: true });
  });
  return sheet;
}

/** Watch `reg` (the page's ServiceWorkerRegistration) for a waiting worker
 * and offer the reload. Returns a read-only state probe. */
export function watchUpdates(reg) {
  const sw = navigator.serviceWorker;
  if (!reg || !sw) return null;
  try { verifyGeneration(); } catch { /* the degradation law */ }
  let el = null, dismissed = false, mounting = false;
  let motion = null;
  import('./ui/motion.js').then((m) => { motion = m; }).catch(() => {});

  const reloadOnce = () => {
    if (window.__obSwReloading) return;
    window.__obSwReloading = true;
    location.reload();
  };
  // #1388: the automatic take-over (autoTakeover above). navigator.webdriver
  // boots stay as they were (the suites drive the prompt itself) unless
  // ?swauto=1 asks for it; ?swauto=0 switches it off in a real browser (that
  // page still holds its lock: another tab must count it).
  let autoOn = true, counted = true, pageLock = false, autoBusy = false, autoState = 'off', autoTimer = null;
  let taking = false; // one flag for both starts (the Reload press and pageTakeover): a take-over is under way
  try {
    const ask = new URLSearchParams(location.search).get('swauto');
    if (ask !== '1' && navigator.webdriver) { autoOn = false; counted = false; }
    else if (ask === '0') autoOn = false;
  } catch { /* a malformed URL keeps the default */ }
  // the lock is named with the registration's scope: a second copy of the app on this origin is not this site
  const lockName = `${PAGE_LOCK}:${reg.scope}`;
  if (counted) {
    try {
      // one shared lock for this page's life: how a page shows it is the only one (never released: the
      // callback's promise stays pending until the page goes)
      navigator.locks.request(lockName, { mode: 'shared' }, () => { pageLock = true; return new Promise(() => {}); })
        .catch(() => {});
    } catch { autoOn = false; /* no Web Locks: nothing automatic, the prompt stands */ }
  }
  if (autoOn) {
    // a page that finds no worker waiting starts clean: the last attempt, if there was one, went through
    try { if (!reg.waiting) sessionStorage.removeItem(AUTO_KEY); } catch { autoOn = false; /* no storage */ }
  }
  // the Reload press's machinery in its order (inert, the belt, the message, the re-trigger), started by the page
  const pageTakeover = () => {
    taking = true; // autoTakeover read it false in this task: a press never got there first
    try { document.body.inert = true; } catch { /* engine without inert */ }
    setTimeout(reloadOnce, RELOAD_BELT_MS);
    const next = reg.waiting;
    if (next) {
      next.postMessage({ ob: 'skip-waiting' });
      try { retriggerTakeover(next); } catch { /* the belt is the retry */ }
    } else reloadOnce();
  };
  const tryAuto = () => {
    if (!autoOn || autoBusy || taking || dismissed || !reg.waiting || !sw.controller) return;
    autoBusy = true;
    autoTakeover({
      reg, sw, win: window, docId: document.documentElement.dataset.obHtml || '',
      dismissed: () => dismissed, taking: () => taking, held: () => pageLock, idle: () => takeoverIdle(),
      alone: () => onlyPage({ locks: navigator.locks, name: lockName }),
      online: () => netUp(), now: () => Date.now(),
      getMark: (key) => sessionStorage.getItem(key), setMark: (key, value) => sessionStorage.setItem(key, value),
      take: pageTakeover,
    }).then((why) => why, () => 'error').then((why) => {
      autoState = why;
      autoBusy = false;
      // not now: look again while the worker waits (the hall opens, a match is won, a second tab closes)
      if (why === 'takeover' || why === 'tried' || why === 'unstored') return;
      clearTimeout(autoTimer);
      autoTimer = setTimeout(tryAuto, why === 'offline' ? AUTO_OFFLINE_MS : AUTO_POLL_MS);
    });
  };
  const button = (cls, key, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ob-btn ${cls}`;
    b.dataset.i18n = key;
    b.textContent = t(key);
    b.addEventListener('click', onClick);
    return b;
  };
  function mount() {
    el = document.createElement('div');
    el.id = 'ob-update';
    el.className = 'ob-prompt';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-labelledby', 'ob-update-title');
    const title = document.createElement('p');
    title.id = 'ob-update-title';
    title.className = 'ob-prompt__title';
    title.setAttribute('role', 'status');
    title.setAttribute('aria-live', 'polite');
    title.dataset.i18n = 'update.ready';
    title.textContent = t('update.ready');
    const actions = document.createElement('div');
    actions.className = 'ob-prompt__actions';
    const reload = button('ob-btn--primary', 'update.reload', () => {
      // nothing may start a lazy import between the take-over and the
      // reload: the page is inert from the press on
      try { document.body.inert = true; } catch { /* engine without inert */ }
      taking = true; // #1388: the automatic part stands down behind a press
      // belt first: a worker that never takes over still gets the reload
      // asked for, whatever the re-trigger below does
      setTimeout(reloadOnce, RELOAD_BELT_MS);
      const waiting = reg.waiting;
      if (waiting) {
        waiting.postMessage({ ob: 'skip-waiting' });
        try { retriggerTakeover(waiting); } catch { /* the belt stays the retry */ }
      } else reloadOnce(); // it took over already (another tab's Reload)
    });
    const later = button('ob-btn--ghost', 'update.later', () => {
      dismissed = true;
      const node = el;
      el = null;
      if (motion) motion.exit(node).then(() => node.remove());
      else node.remove();
    });
    actions.append(reload, later);
    el.append(title, actions);
    document.body.appendChild(el);
    motion?.enter(el);
  }
  function offer() {
    tryAuto(); // #1388: a worker waits — the page may take it over by itself (idle, alone, once)
    if (dismissed || mounting || el?.isConnected || !reg.waiting || !sw.controller) return;
    mounting = true;
    ensureSheet().then((ok) => {
      mounting = false;
      if (ok && !dismissed && !el?.isConnected && reg.waiting && sw.controller) mount();
    });
  }
  const follow = (w) => {
    w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(); });
  };
  const check = () => { reg.update().then(offer, offer); };

  offer();
  follow(reg.installing); // an install already under way at attach
  reg.addEventListener('updatefound', () => follow(reg.installing));
  sw.addEventListener('message', (e) => {
    if (e.data && e.data.ob === 'update-waiting') check();
  });
  // #1388: after a navigation the browser asks for a new sw.js only once the page has gone quiet (Chromium waits
  // for the frame's network and its main thread to rest), and a page that keeps drawing may not get there for
  // minutes: a plain reload then finds nothing to take over. So a controlled page asks once itself, a few seconds
  // after it attaches (automation boots keep the browser's own timing).
  if (autoOn && sw.controller) setTimeout(check, ATTACH_CHECK_MS);
  let checked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - checked < CHECK_MS) { offer(); return; }
    checked = Date.now();
    check();
  });
  // `shown` = mounted; `visible` = painted now (on a coarse pointer the
  // notice waits for the hall: ui/swupdate.css hides it at the table)
  // `auto` = the automatic take-over's last word (#1388): 'off' (not armed), or autoTakeover's result
  const probe = { state: () => ({ controlled: !!sw.controller, shown: !!el?.isConnected, dismissed, waiting: !!reg.waiting,
    visible: !!el?.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible',
    auto: autoOn ? autoState : 'off' }) };
  window.__swupdate = probe;
  return probe;
}
