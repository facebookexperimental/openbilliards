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
  let checked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - checked < CHECK_MS) { offer(); return; }
    checked = Date.now();
    check();
  });
  // `shown` = mounted; `visible` = painted now (on a coarse pointer the
  // notice waits for the hall: ui/swupdate.css hides it at the table)
  const probe = { state: () => ({ controlled: !!sw.controller, shown: !!el?.isConnected, dismissed, waiting: !!reg.waiting,
    visible: !!el?.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' }) };
  window.__swupdate = probe;
  return probe;
}
