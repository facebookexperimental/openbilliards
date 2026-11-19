// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-userboot-3g-sw.mjs — GH-714 service-worker install legs of the
// e2e-userboot 3G arm (imported by e2e-userboot-3g.mjs; legs `sw`, `swfill`,
// `swfail`, `swstale`, `swquota`, `swretry`, `swstop`, `swupdate`, `swscope`,
// `swlegacy`, `swshared`, `swnested`, and `swforced`, which runs only when
// named).
//
// The finding (S4 journey QA r3, verify/sw-precache-install-timeout): the
// shipped sw.js installed ONE atomic cache.addAll over the whole 340-file
// tree (18.8 MB, ~11 MB never loaded by the boot). Chromium dispatches the
// install event with kRequestTimeout = 5 min, KILL_ON_TIMEOUT: on Slow 3G
// the worker went `redundant` at ~300 s, the registration was dropped and
// ~6.8 MB were discarded — no worker ever activated on that visit.
//
// The law (coordinator ruling on #714): install precaches ONLY the boot set
// (PRECACHE: shell documents, kernel wasm + glue, SDK, the modules the first
// boot imports, the 7 locales) with a per-request timeout and a total
// install budget well under the kill; everything else (PRECACHE_FILL: media,
// fonts, the remaining place modules) is filled AFTER activate by a chunked
// background fill (<= 12 in flight, per-request timeout, one chunk per
// message-loop turn, never blocking activation or fetch handling), resumed
// on the next boot if incomplete. The versioned cache stays the atomic unit
// of VERSION identity (cache name = VERSION, cache-first inside it).
//
//   sw      phone, Slow 3G on the PAGE and the SERVICE-WORKER target, CPU x4,
//           cold profile, real-user path (app.html?sw=1): the registration
//           reaches 'activated' with every PRECACHE entry cached and NEVER
//           transitions to 'redundant'; the SW never has more than 12
//           requests in flight; a second navigation in the same profile is
//           controlled and boots from the snapshot (every PRECACHE request
//           served fromServiceWorker). RED on the base bytes: the arm sees
//           `redundant` at ~300 s after `installing`.
//   swfill  desktop, unthrottled, cold profile: after 'activated' the fill
//           completes within the leg's patience (every PRECACHE_FILL entry
//           cached, caches.match true for a non-boot module), the hall opened
//           BEFORE the fill finished (the page never waits on the fill), and
//           every non-media URL the cold boot requested is in PRECACHE (the
//           committed boot manifest is not stale); review r2 arm: grade.json
//           (present at generation) is a DIGESTED PRECACHE_FILL entry and
//           is in the snapshot after the fill — no optional / digest-less
//           asset class (RED pre-fix: the optional tail never ran on the
//           normal completion path, the fill reported complete without it).
//   swstale review r2 arm: the same mismatch law over grade.json — a swapped
//           grade is a 503 + update-waiting, never stored (RED pre-fix: the
//           digest-less miss path served AND stored the foreign bytes).
//   swquota review r1v arm: a fill miss whose bytes MATCH is served even when
//           the snapshot cannot store them (put throws QuotaExceededError):
//           200 with the manifest bytes, no update-waiting, entry left for
//           the next fill pass; a mismatch stays 503 + message. In-worker
//           Node probe over the served sw.js (binding) + the real worker
//           under CDP Storage.overrideQuotaForOrigin when this Chrome honors
//           it for CacheStorage (RED pre-fix: 503 + update-waiting — the
//           awaited put's failure was answered as a digest mismatch).
//   swretry review r3 P2 arm: fill failures are CLASSIFIED — a transient
//           failure (one fill entry's first fetch failed in the worker) leaves
//           the fill PAUSED (1 retryable, no completion line), the next fetch
//           event re-arms it and the entry is cached; a 404 entry stays
//           refused; "fill complete" appears once, after the retryables
//           drained (RED pre-fix: every failure was permanent for the
//           worker's life and fillKicked never reset).
//   swstop  review r4 P2 arm: the fill's FIRST turn rides activate's
//           waitUntil ("fill first turn inside activate" in the log; boot
//           set + first chunk cached when 'activated' is observed); a
//           worker STOPPED mid-fill (CDP ServiceWorker.stopWorker) resumes
//           on a loaded page's {ob:'fill'} re-arm message alone and, stopped
//           again, on the next page load, which completes the fill; a
//           re-arm over a complete fill is a silent no-op (RED pre-fix: no
//           activate-time turn — a bare timer after activate — and only
//           PRECACHE at 'activated').
//   swforced  #1167 item 2 / #1173, only when named (never in the default
//           list): desktop, the FORCED take-over (lab bytes in a mirror's
//           sw.js: A's long start and a navigation-released hold) makes B
//           control A's not yet execution-ready document with no
//           controllerchange; GREEN when verifyGeneration repairs it once,
//           into B's id, within the bound; RED "silent swap" when A's
//           document stays under B (see legSwForced).
//   swscope  #1169: two registrations of the app on one origin (sibling
//           scopes /sa/ and /sb/, as two forks on one Pages user site, each
//           under its own VERSION): each generation name carries its scope
//           (ob-sws-<8-hex scope hash>-<VERSION>); B's activate, fill end
//           and later sweeps leave A's filled snapshot whole, and a copy of
//           A's boot set under a pre-scope name (a registration still on
//           pre-scope code); each scope's later sweeps spare an empty name
//           of the other scope; with the server and every worker stopped,
//           both boot offline cold. RED on the base bytes: B's activate
//           deleted A's snapshot, and A's cold offline boot fails.
//   swlegacy  #1169 upgrade: the previous version (these bytes with the
//           names from before scope tags) activates and fills; the deploy
//           installs and waits; every entry of the previous snapshot stays
//           through the take-over, the new fill end and the offline boot (no
//           sweep deletes a name from before scope tags), and the new
//           version boots offline cold.
//   swshared  #1169: two sibling scopes on the previous version (one
//           VERSION) share one pre-scope cache; A's upgrade leaves every
//           resolved manifest URL of both in it, B's previous-version sweeps
//           leave A's new snapshot alone, and A, B and A again boot offline
//           cold.
//   swnested  #1169: / over /web/ on the previous version (one VERSION)
//           share one pre-scope cache; each side upgrades in turn, in a
//           fresh profile: every resolved manifest URL of both stays, the
//           other side's previous-version sweeps leave the new snapshot
//           alone, and this side, the other and this side again boot
//           offline cold, each under its own registration.
//   --record-boot  (standalone) instruments an UNTHROTTLED cold boot on the
//           phone and the desktop register (?sw=0) and writes the union of
//           same-origin GET paths to web/tools/sw-boot-manifest.json — the
//           measured input gen-sw-precache.mjs derives PRECACHE from.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';
import { decodePng } from './png.mjs';
// GH-410 port inventory (GH-687 lint law): a scratch mirror server on PORT + 1 and CDP endpoints on CDP + 0 of the ports the importer hands this leg module
export const PORT_INVENTORY = { http: 2, cdp: 1 };
import { setPhoneMetrics, tap } from './touch-cdp.mjs';
import { runSwStopStagingArm } from './test-swstop-staging.mjs';
import { htmlGenId } from './lib/html-gen-id.mjs';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(TOOLS_DIR, '..');
export const BOOT_MANIFEST_PATH = path.join(TOOLS_DIR, 'sw-boot-manifest.json');
// media classes never enter the boot set (ruling: media + fonts are fill)
export const MEDIA_RE = /\.(wav|png|webp|woff2)$/i;

/** Browser-level CDP session: auto-attaches every target (flatten) so the
 * service-worker target can be throttled like the page and its network
 * counted. Returns { send, sendTo, onEvent, close, sw } where sw holds the
 * SW-side counters (in-flight high-water mark, loads, bytes, console). */
// swFetch (GH-714 review r1): { patterns, onPaused(params, api) } — Fetch
// interception on every SERVICE-WORKER session (enabled before the worker
// runs); api = { fail(errorReason), go() }. The swfail leg fails one boot
// entry's fetch inside the worker with it.
// pump (#1161): a RESTARTED worker reuses its DevTools agent host (no second
// attachedToTarget) and waits for the debugger (waitForDebuggerOnStart); a
// real browser has no debugger. pump releases every service-worker session
// every 250 ms once that session's setup above has settled, so a restart can
// never park (pre-fix: a navigation into it wedged, then rc=124 at the cap).
export async function attachBrowserSession(cdpPort, { net = null, log = () => {}, swFetch = null, pump = false } = {}) {
  const v = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('browser ws open failed')); });
  let id = 0; const pending = new Map(); const handlers = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(`${m.error.message} (${m.error.code})`)); else p.res(m.result || {});
    } else if (m.method) for (const h of handlers) { try { h(m.method, m.params, m.sessionId); } catch (e) { log(`handler err ${e.message}`); } }
  };
  ws.onclose = () => { for (const p of pending.values()) p.rej(new Error('browser ws closed')); pending.clear(); };
  const send = (method, params = {}, sessionId, timeout = 60000) => new Promise((res, rej) => {
    if (ws.readyState !== 1) return rej(new Error(`browser ws not open for ${method}`));
    const i = ++id; const t = setTimeout(() => { pending.delete(i); rej(new Error(`timeout ${method}`)); }, timeout);
    pending.set(i, { res: (x) => { clearTimeout(t); res(x); }, rej: (e) => { clearTimeout(t); rej(e); } });
    const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg));
  });
  const sw = { gens: 0, reqs: 0, done: 0, fails: 0, bytes: 0, inflight: 0, maxInflight: 0, console: [], exc: [], urls: new Map(),
    disk: 0, s304: 0, sample: [] }; // disk = responses served from the HTTP cache; sample = the first 16 responses
  const swSessions = new Set(); const swReady = new Set();
  handlers.push((m, p, sid) => {
    if (m === 'Target.attachedToTarget') {
      const s = p.sessionId;
      if (p.targetInfo.type === 'service_worker') {
        swSessions.add(s); sw.gens++;
        log(`[sw] target attached gen=${sw.gens} ${p.targetInfo.url}`);
        (async () => {
          try {
            await send('Network.enable', {}, s);
            if (net) await send('Network.emulateNetworkConditions', { offline: false, ...net }, s);
            await send('Runtime.enable', {}, s);
            if (swFetch) await send('Fetch.enable', { patterns: swFetch.patterns }, s);
          } catch (e) { log(`[sw] session setup failed: ${e.message}`); }
          swReady.add(s);
          if (p.waitingForDebugger) send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {});
        })();
      } else if (p.waitingForDebugger) send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {});
      return;
    }
    if (!sid || !swSessions.has(sid)) return;
    if (m === 'Fetch.requestPaused') {
      if (swFetch) {
        swFetch.onPaused(p, {
          fail: (errorReason = 'ConnectionFailed') => send('Fetch.failRequest', { requestId: p.requestId, errorReason }, sid).catch(() => {}),
          go: () => send('Fetch.continueRequest', { requestId: p.requestId }, sid).catch(() => {}),
        });
      } else send('Fetch.continueRequest', { requestId: p.requestId }, sid).catch(() => {});
      return;
    }
    if (m === 'Network.requestWillBeSent') {
      sw.reqs++; sw.inflight++; sw.maxInflight = Math.max(sw.maxInflight, sw.inflight);
      sw.urls.set(p.requestId, p.request.url);
    } else if (m === 'Network.responseReceived') {
      const r = p.response;
      if (r.fromDiskCache) sw.disk++;
      if (r.status === 304) sw.s304++;
      if (sw.sample.length < 16) sw.sample.push(`${(sw.urls.get(p.requestId) || '').replace(/^https?:\/\/[^/]+\//, '')}:${r.status}${r.fromDiskCache ? ':disk' : ''}`);
    } else if (m === 'Network.loadingFinished') {
      sw.done++; sw.inflight = Math.max(0, sw.inflight - 1); sw.bytes += p.encodedDataLength || 0; sw.urls.delete(p.requestId);
    } else if (m === 'Network.loadingFailed') {
      sw.fails++; sw.inflight = Math.max(0, sw.inflight - 1); sw.urls.delete(p.requestId);
      log(`[sw] net fail ${p.errorText} canceled=${p.canceled}`);
    } else if (m === 'Runtime.consoleAPICalled') {
      const line = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200);
      sw.console.push(line); if (sw.console.length <= 40) log(`[sw console.${p.type}] ${line}`);
    } else if (m === 'Runtime.exceptionThrown') {
      const line = (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 300);
      sw.exc.push(line); log(`[sw EXC] ${line}`);
    }
  });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const pumpTimer = pump ? setInterval(() => { for (const s of swReady) send('Runtime.runIfWaitingForDebugger', {}, s, 5000).catch(() => {}); }, 250) : null;
  return { send: (m, p) => send(m, p), sendTo: (s, m, p) => send(m, p, s), onEvent: (h) => handlers.push(h),
    close: () => { if (pumpTimer) clearInterval(pumpTimer); try { ws.close(); } catch { /* closed */ } }, sw };
}

// page-side observer, installed before any HTML parses: records the
// registration's lifecycle (statechange per worker) with page timestamps
const SW_OBSERVER = `(() => {
  const E = window.__obSw = { ev: [] };
  const push = (ev) => { if (E.ev.length < 200) E.ev.push({ ev, t: Math.round(performance.now()) }); };
  if (!('serviceWorker' in navigator)) { push('unsupported'); return; }
  const hook = (w, tag) => { if (!w || w.__obHooked) return; w.__obHooked = 1; push(tag + ':' + w.state);
    w.addEventListener('statechange', () => push('state:' + w.state)); };
  navigator.serviceWorker.addEventListener('controllerchange', () => push('controllerchange'));
  const poll = () => { navigator.serviceWorker.getRegistration().then((r) => {
    if (r) { if (!E.reg) push('registered'); E.reg = 1; hook(r.installing, 'installing'); hook(r.waiting, 'waiting'); hook(r.active, 'active');
      if (!r.__obUf) { r.__obUf = 1; r.addEventListener('updatefound', () => { push('updatefound'); hook(r.installing, 'installing'); }); } }
    else if (E.reg) push('reg:undefined');
  }).catch(() => {}); };
  setInterval(poll, 500); poll();
})();`;

// registration snapshot + cache census, evaluated in the page
const SW_PROBE = `(async () => {
  const r = await navigator.serviceWorker.getRegistration().catch(() => null);
  const keys = await caches.keys().catch(() => []);
  const ob = keys.filter((k) => k.startsWith('ob-sw')); // both forms: ob-sw-<VERSION>, ob-sws-<scope hash>-<VERSION>
  let entries = -1;
  if (ob.length === 1) entries = (await (await caches.open(ob[0])).keys()).length;
  return { t: Math.round(performance.now()), reg: r ? { installing: r.installing?.state ?? null, waiting: r.waiting?.state ?? null,
    active: r.active?.state ?? null } : null, controller: !!navigator.serviceWorker.controller, keys: ob, entries,
    ev: (window.__obSw || { ev: [] }).ev, ready: !!(window.__test && window.__test.ready === true),
    shellOpen: !!(document.body && document.body.classList.contains('ob-shell-open')) };
})()`;

/** PRECACHE / PRECACHE_FILL from web/sw.js's AUTOGEN block. Accepts the
 * pre-#714 string list (the red arm runs against the base bytes) and the
 * [url, sha16, bytes] triples; entries may be in-scope ('./…') or above
 * the root ('../tools/render/grade.json', review r2). Returns { boot: [url],
 * fill: [url], version, digests: Map url -> sha16 (triples only) }. */
export function readSwManifest(swPath = path.join(WEB_DIR, 'sw.js')) {
  const sw = fs.readFileSync(swPath, 'utf8');
  const digests = new Map();
  const list = (name) => {
    const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
    if (!m) return [];
    return [...m[1].matchAll(/^\s*(?:\[)?'(\.\.?\/[^']+)'(?:,\s*'([0-9a-f]+)')?/gm)].map((x) => {
      if (x[2]) digests.set(x[1], x[2]);
      return x[1];
    });
  };
  const version = (sw.match(/const VERSION = '([^']+)'/) || [])[1] || '';
  return { boot: list('PRECACHE'), fill: list('PRECACHE_FILL'), version, digests };
}

// grade.json (review r2 ruling — NOTHING enters the snapshot without a
// digest): the app fetches it ONE ABOVE the served root; the harness serves
// web/ (its tools/render symlink = the repo file), so the worker's URL lands
// on /tools/render/grade.json. Present at generation -> a NORMAL digested
// PRECACHE_FILL entry; absent -> no entry, never stored. The served-tree
// preflight makes the file mandatory here, so the absent branch is a
// manifest-only assertion in this harness.
export const GRADE_REL = 'tools/render/grade.json';
const GRADE_SW_URL = '../tools/render/grade.json';
const gradeLaw = (man) => ({ exists: fs.existsSync(path.join(WEB_DIR, GRADE_REL)),
  listed: man.fill.includes(GRADE_SW_URL), bootListed: man.boot.includes(GRADE_SW_URL),
  sha: man.digests.get(GRADE_SW_URL) || null });

const pathOf = (url) => { const u = new URL(url); return u.pathname.replace(/^\//, '') + (u.search || ''); };

async function newSwPage(PORT, cdp, { phone, net, cpu, onRequest, onResponse, observer = true }) {
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, {
    port: cdp, tool: false, width: phone ? 844 : 1280, height: phone ? 390 : 800 });
  if (phone) await setPhoneMetrics(c, { width: 844, height: 390, deviceScaleFactor: 3 });
  await c.send('Page.enable'); await c.send('Network.enable'); await c.send('Runtime.enable');
  await c.send('Network.clearBrowserCache'); await c.send('Network.clearBrowserCookies');
  // the swforced leg opens its tab without the observer: its 2 Hz getRegistration poll is the registration
  // traffic that leg keeps out of the window after the press
  if (observer) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SW_OBSERVER });
  if (net) await c.send('Network.emulateNetworkConditions', { offline: false, ...net });
  if (cpu && cpu > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  c.onEvent((m, p) => {
    if (m === 'Network.requestWillBeSent' && onRequest) onRequest(p);
    if (m === 'Network.responseReceived' && onResponse) onResponse(p);
  });
  return c;
}

// the boot window: the recorder keeps listening this long after the hall
// opens, and the swfill leg judges every request up to the same deadline
const BOOT_SETTLE_MS = 6000;

/** --record-boot: the measured boot set (phone + desktop union, ?sw=0,
 * unthrottled). Writes BOOT_MANIFEST_PATH; returns the sorted path list. */
export async function recordBootManifest({ PORT, cdp, log = console.log, settleMs = BOOT_SETTLE_MS }) {
  const paths = new Set();
  for (const phone of [true, false]) {
    const seen = new Set();
    const c = await newSwPage(PORT, cdp, { phone, onRequest: (p) => {
      if (p.request.method !== 'GET' || !p.request.url.startsWith(`http://127.0.0.1:${PORT}/`)) return;
      seen.add(pathOf(p.request.url).replace(/\?.*$/, ''));
    } });
    try {
      const t0 = Date.now();
      await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?sw=0&u=recboot-${phone ? 'phone' : 'desktop'}` });
      let p = null;
      while (Date.now() - t0 < 90000) {
        p = await c.eval(SW_PROBE).catch(() => null);
        if (p?.ready && p?.shellOpen) break;
        await sleep(300);
      }
      if (!p?.ready || !p?.shellOpen) throw new Error(`record-boot: the ${phone ? 'phone' : 'desktop'} boot never opened the hall`);
      await sleep(settleMs); // late boot imports (rules backend, place module) land
      log(`[record-boot] ${phone ? 'phone' : 'desktop'}: hall at ${p.t} ms, ${seen.size} same-origin GET paths`);
    } finally { c.close(); }
    for (const s of seen) if (!/^tools\//.test(s) && s !== 'sw.js' && !s.startsWith('app.html')) paths.add(s);
  }
  const list = [...paths].sort();
  fs.writeFileSync(BOOT_MANIFEST_PATH, JSON.stringify({
    note: 'GH-714 measured cold-boot request set (phone + desktop union, ?sw=0, unthrottled) — '
      + 'node web/tools/e2e-userboot-3g.mjs --record-boot; gen-sw-precache.mjs derives PRECACHE from it',
    paths: list }, null, 2) + '\n');
  log(`[record-boot] wrote ${list.length} paths → ${path.relative(WEB_DIR, BOOT_MANIFEST_PATH)}`);
  return list;
}

const evAt = (ev, name) => { const e = ev.find((x) => x.ev === name); return e ? e.t : null; };
// a sub-poll install is first observed already 'active:activated' (no statechange seen)
const activatedAt = (ev) => evAt(ev, 'state:activated') ?? evAt(ev, 'active:activated') ?? evAt(ev, 'waiting:activated');
const isActivated = (p) => activatedAt(p.ev) !== null || p.reg?.active === 'activated';

/** leg sw: Slow-3G cleared-cache first visit (page + SW throttled, CPU x4,
 * phone) → activated, never redundant, boot set cached; second visit
 * controlled and served from the snapshot. */
// hardMs: 180 s = 60 % of Chromium's 5-minute kill. targetMs (60 s, ruling)
// is LOGGED, not asserted: under CDP emulation the SW target's throttle
// charges its per-request latency to HTTP-cache hits as well (measured
// 2026-09-07: 101/143 install responses fromDiskCache, still ~100 s at 6
// lanes; 27 s with the SW target unthrottled, OB_E2E_SW_NET=off), which a
// real link does not — the box-independent law is the mechanism.
export async function legSwInstall({ PORT, cdp, fail, log = console.log, net, cpu = 4, phone = true,
  hardMs = 180000, targetMs = 60000 }) {
  const tag = `sw-${phone ? 'phone' : 'desktop'}-${net ? 'slow3g' : 'fast'}`;
  const man = readSwManifest();
  const bootSet = new Set(man.boot.map((u) => u.replace(/^\.\//, '')));
  const pageRes = []; // second-visit page responses
  const c = await newSwPage(PORT, cdp, { phone, net, cpu, onResponse: (p) => pageRes.push({
    url: p.response.url, fromSW: !!p.response.fromServiceWorker, status: p.response.status }) });
  let b = null;
  try {
    // OB_E2E_SW_NET=off is a DIAGNOSTIC only (page throttled, SW target not):
    // it separates the emulated per-request latency from the worker's own cost
    b = await attachBrowserSession(cdp, { net: process.env.OB_E2E_SW_NET === 'off' ? null : net, log });
    const url = `http://127.0.0.1:${PORT}/app.html?sw=1&u=3g-${tag}`;
    const tNav = Date.now(); let p = null; let tInstalling = null; let lastLog = 0;
    await c.send('Page.navigate', { url });
    while (Date.now() - tNav < 320000 + 330000) {
      p = await c.eval(SW_PROBE).catch(() => null);
      const el = Date.now() - tNav;
      if (p) {
        const names = p.ev.map((e) => e.ev);
        if (tInstalling === null && names.includes('installing:installing')) tInstalling = Date.now();
        if (isActivated(p) || names.includes('state:redundant')) break;
        if (tInstalling !== null && Date.now() - tInstalling > 330000) break;
        if (el - lastLog >= 20000) { lastLog = el; log(`[${tag}] t=${(el / 1000).toFixed(0)}s reg=${JSON.stringify(p.reg)} entries=${p.entries} `
          + `ready=${p.ready} swNet ${b.sw.done}/${b.sw.reqs} ${(b.sw.bytes / 1e6).toFixed(2)} MB inflight=${b.sw.inflight} max=${b.sw.maxInflight}`); }
      }
      await sleep(1000);
    }
    if (!p) { fail(`[${tag}] page probe never answered`); return; }
    const ev = p.ev; const names = ev.map((e) => e.ev);
    const tReg = evAt(ev, 'installing:installing') ?? evAt(ev, 'registered');
    const tAct = activatedAt(ev) ?? (p.reg?.active === 'activated' ? p.t : null); const tRed = evAt(ev, 'state:redundant');
    log(`[${tag}] lifecycle: ${names.join(' > ')} | reg=${tReg} activated=${tAct} redundant=${tRed} | `
      + `cache ${p.keys.join(',')} entries=${p.entries} | swNet ${b.sw.done}/${b.sw.reqs} ${(b.sw.bytes / 1e6).toFixed(2)} MB `
      + `max-inflight=${b.sw.maxInflight} fails=${b.sw.fails} exc=${b.sw.exc.length} disk=${b.sw.disk} 304=${b.sw.s304}`);
    log(`[${tag}] first SW responses: ${b.sw.sample.join(' ')}`);
    if (tRed !== null) fail(`[${tag}] worker went REDUNDANT ${tReg !== null ? tRed - tReg : '?'} ms after installing (install killed / failed)`);
    if (tAct === null) { fail(`[${tag}] registration never reached 'activated' (${JSON.stringify(p.reg)})`); return; }
    const dur = tAct - tReg;
    if (dur > hardMs) fail(`[${tag}] install → activated took ${dur} ms (> ${hardMs} ms hard; target ${targetMs} ms)`);
    else log(`[${tag}] install → activated in ${(dur / 1000).toFixed(1)} s (target ${targetMs / 1000} s${dur > targetMs ? ' MISSED under emulation — the SW throttle taxes disk-cache hits; see the legSwInstall note' : ''})`);
    const miss = await c.eval(`(async () => { const c = await caches.open(${JSON.stringify(p.keys[0] || '')});
      const out = []; for (const u of ${JSON.stringify(man.boot)}) { if (!(await c.match(u))) out.push(u); } return out; })()`).catch(() => null);
    if (!miss) fail(`[${tag}] boot-set census failed`);
    else if (miss.length) fail(`[${tag}] ${miss.length}/${man.boot.length} PRECACHE entries missing at activated: ${miss.slice(0, 5).join(' ')}`);
    else log(`[${tag}] boot set cached: ${man.boot.length}/${man.boot.length} at activated (cache entries ${p.entries})`);
    // the fill's concurrency is clean here: the first-visit page is NOT
    // controlled, so every SW request so far is install or fill (the second
    // visit adds page misses the fetch handler forwards — no-SW behaviour)
    if (b.sw.maxInflight > 12) fail(`[${tag}] SW had ${b.sw.maxInflight} requests in flight during install/fill (law: <= 12)`);
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    await secondVisit({ c, url, tag, fail, log, bootSet, fillCount: man.fill.length, pageRes, b });
  } finally { if (b) b.close(); c.close(); }
}

const inSet = (set, url) => { const p = pathOf(url); return set.has(p) || set.has(p.replace(/\?.*$/, '')); };

async function secondVisit({ c, url, tag, fail, log, bootSet, fillCount, pageRes, b, hallMs = 90000 }) {
  pageRes.length = 0;
  const t0 = Date.now(); let p = null;
  await c.send('Page.navigate', { url });
  while (Date.now() - t0 < 240000) {
    p = await c.eval(SW_PROBE).catch(() => null);
    if (p?.ready && p?.shellOpen) break;
    await sleep(500);
  }
  const el = Date.now() - t0;
  const same = pageRes.filter((r) => r.url.startsWith(url.slice(0, url.indexOf('/app.html'))));
  const boot = same.filter((r) => inSet(bootSet, r.url));
  const notSw = boot.filter((r) => !r.fromSW);
  const total = bootSet.size + fillCount;
  // the fill is still running on the throttled link while this boot is served
  // from the snapshot: the page never waits on it (hall well inside the
  // first visit's network-bound time; every PRECACHE response from the SW)
  const fillLive = p ? p.entries < total : null;
  log(`[${tag}] second visit: hall ${p?.shellOpen ? 'open' : 'NOT open'} at ${(el / 1000).toFixed(1)} s, controller=${p?.controller}, `
    + `${boot.length} PRECACHE responses (${boot.length - notSw.length} fromServiceWorker), ${same.length - boot.length} other; `
    + `fill ${fillLive ? 'IN PROGRESS' : 'done'} (${p?.entries}/${total} entries) swNet ${b.sw.done}/${b.sw.reqs} inflight=${b.sw.inflight} max=${b.sw.maxInflight}`);
  if (!p?.ready || !p?.shellOpen) fail(`[${tag}] second visit never opened the hall (${JSON.stringify(p?.reg)})`);
  else if (el > hallMs) fail(`[${tag}] second visit took ${(el / 1000).toFixed(1)} s to the hall (> ${hallMs / 1000} s) — the page waited on the network/fill`);
  if (!p?.controller) fail(`[${tag}] second visit is not controlled by the service worker`);
  if (notSw.length) fail(`[${tag}] ${notSw.length} PRECACHE responses NOT from the service worker on the second visit: ${notSw.slice(0, 4).map((r) => pathOf(r.url)).join(' ')}`);
}

/** leg swfill: unthrottled desktop first visit → the background fill
 * completes after activation without holding the page; the boot manifest
 * covers every non-media URL the cold boot requested. */
export async function legSwFill({ PORT, cdp, fail, log = console.log, patienceMs = 180000 }) {
  const tag = 'swfill-desktop';
  const man = readSwManifest();
  const bootSet = new Set(man.boot.map((u) => u.replace(/^\.\//, '')));
  const total = man.boot.length + man.fill.length;
  const reqs = [];
  const c = await newSwPage(PORT, cdp, { phone: false, onRequest: (p) => {
    if (p.request.method === 'GET' && p.request.url.startsWith(`http://127.0.0.1:${PORT}/`)) reqs.push({ url: p.request.url, t: Date.now() }); } });
  let b = null;
  try {
    b = await attachBrowserSession(cdp, { log });
    const url = `http://127.0.0.1:${PORT}/app.html?sw=1&u=3g-${tag}`;
    const tNav = Date.now(); let p = null; let tHall = null; let tAct = null; let tFull = null; let lastLog = 0;
    await c.send('Page.navigate', { url });
    while (Date.now() - tNav < patienceMs) {
      p = await c.eval(SW_PROBE).catch(() => null);
      if (p) {
        const names = p.ev.map((e) => e.ev);
        if (tHall === null && p.ready && p.shellOpen) tHall = Date.now();
        if (tAct === null && isActivated(p)) tAct = Date.now();
        if (names.includes('state:redundant')) { fail(`[${tag}] worker went redundant`); break; }
        // the fill can WIN the race against the page's own boot (a warm disk
        // cache fills 340 entries in < 2 s while a loaded box is still
        // booting the page — merge run 2026-09-07: fill +1.8 s, hall later):
        // stamp the fill once and keep polling until the hall has opened too
        // — and until the boot window has passed (#1124: a fill that won the
        // race ended the loop at the hall, before the shell's idle prefetch,
        // so the staleness check below never saw those boot requests).
        if (tAct !== null && tFull === null && p.entries >= total) tFull = Date.now();
        if (tFull !== null && tHall !== null && Date.now() > tHall + BOOT_SETTLE_MS) break;
        const el = Date.now() - tNav;
        if (el - lastLog >= 15000) { lastLog = el; log(`[${tag}] t=${(el / 1000).toFixed(0)}s reg=${JSON.stringify(p.reg)} entries=${p.entries}/${total} `
          + `swNet ${b.sw.done}/${b.sw.reqs} inflight=${b.sw.inflight} max=${b.sw.maxInflight}`); }
      }
      await sleep(500);
    }
    log(`[${tag}] hall +${tHall === null ? '—' : ((tHall - tNav) / 1000).toFixed(1)}s activated +${tAct === null ? '—' : ((tAct - tNav) / 1000).toFixed(1)}s `
      + `fill complete +${tFull === null ? '—' : ((tFull - tNav) / 1000).toFixed(1)}s (${p?.entries}/${total} entries) swNet ${b.sw.done}/${b.sw.reqs} `
      + `${(b.sw.bytes / 1e6).toFixed(2)} MB max-inflight=${b.sw.maxInflight} fails=${b.sw.fails}`);
    if (tHall === null) fail(`[${tag}] the hall never opened`);
    if (tAct === null) fail(`[${tag}] never activated (${JSON.stringify(p?.reg)})`);
    if (tFull === null) fail(`[${tag}] fill incomplete after ${patienceMs / 1000} s: ${p?.entries}/${total} entries`);
    if (b.sw.maxInflight > 12) fail(`[${tag}] SW had ${b.sw.maxInflight} requests in flight (law: <= 12)`);
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    const probeUrl = man.fill.find((u) => /\.js$/.test(u)) || man.fill[0];
    if (probeUrl) {
      const hit = await c.eval(`caches.match(${JSON.stringify(probeUrl)}).then((r) => !!r)`).catch(() => false);
      if (!hit) fail(`[${tag}] caches.match(${probeUrl}) false after the fill`);
      else log(`[${tag}] caches.match(${probeUrl}) true (non-boot module filled)`);
    } else if (man.fill.length === 0) fail(`[${tag}] sw.js has no PRECACHE_FILL list (one atomic precache?)`);
    // review r2 ruling, arm 1: grade.json enters the snapshot ONLY as a
    // digested manifest entry — present at generation -> in PRECACHE_FILL
    // with its sha and cached by the normal fill (RED pre-fix: absent from
    // the manifest, the optional tail never ran when the last chunk
    // completed, the fill reported complete with the grade missing offline)
    const g = gradeLaw(man);
    const gradeUrl = `http://127.0.0.1:${PORT}/${GRADE_REL}`;
    const gradeHit = await c.eval(`caches.match(${JSON.stringify(gradeUrl)}).then((r) => !!r)`).catch(() => null);
    if (g.exists) {
      if (!g.listed || !g.sha) fail(`[${tag}] ${GRADE_REL} exists at generation but is not a digested PRECACHE_FILL entry (listed=${g.listed} sha=${g.sha}) — no optional / digest-less asset class`);
      if (g.bootListed) fail(`[${tag}] ${GRADE_SW_URL} is in PRECACHE (law: above-root entries are fill, never boot)`);
      if (gradeHit !== true) fail(`[${tag}] caches.match(${GRADE_REL}) ${gradeHit} after the fill completed — the grade is missing offline`);
      else log(`[${tag}] ${GRADE_REL} cached by the normal fill (manifest digest ${g.sha})`);
    } else if (g.listed || g.bootListed || gradeHit) {
      fail(`[${tag}] ${GRADE_REL} is absent at generation but listed (${g.listed || g.bootListed}) / cached (${gradeHit})`);
    } else log(`[${tag}] ${GRADE_REL} absent at generation: no manifest entry, not cached`);
    // manifest staleness: every non-media URL the boot requested is PRECACHE
    const bootReqs = reqs.filter((r) => tHall !== null && r.t <= tHall + BOOT_SETTLE_MS);
    const extra = [...new Set(bootReqs.map((r) => pathOf(r.url)).filter((q) => !MEDIA_RE.test(q.replace(/\?.*$/, ''))
      && !/^(sw\.js|app\.html|tools\/)/.test(q) && !bootSet.has(q) && !bootSet.has(q.replace(/\?.*$/, ''))))];
    if (extra.length) fail(`[${tag}] ${extra.length} non-media boot requests outside PRECACHE (stale sw-boot-manifest.json — rerun --record-boot): ${extra.slice(0, 6).join(' ')}`);
    else log(`[${tag}] boot manifest current: ${bootReqs.length} boot requests, 0 non-media outside PRECACHE`);
  } finally { if (b) b.close(); c.close(); }
}

// ---- GH-714 review r1 legs: install atomicity (swfail) + fill verification (swstale)
// Both serve a SCRATCH MIRROR of web/ (every entry symlinked, the files the
// leg rewrites copied) on its own port (PORT + 1: PORT_INVENTORY http 2), so
// a served-tree change (a new sw.js generation, a lazy module's bytes) is a
// real deploy to the browser — no page-side interception of sw.js (the
// browser fetches the worker script outside the page's Fetch domain).
import { spawnStaticServer, stopStaticServer } from './cdp.mjs';
import os from 'node:os';

// omit (review r3, swretry): paths LEFT OUT of the mirror — the server 404s them
function mirrorTree(copy, omit = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-sw-mirror-'));
  const inside = (list, r) => list.some((c) => c.startsWith(r + '/'));
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(WEB_DIR, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      if (r === 'node_modules' || (!rel && /\.png$/.test(name))) continue; // tools/ rides along: launchChrome's served-tree preflight reads tools/render/grade.json
      if (omit.includes(r)) continue;
      const src = path.join(WEB_DIR, r), dst = path.join(root, r);
      const dir = fs.statSync(src).isDirectory();
      if (copy.includes(r)) fs.copyFileSync(src, dst);
      else if (dir && (inside(copy, r) || inside(omit, r))) { fs.mkdirSync(dst); walk(r); }
      else fs.symlinkSync(src, dst);
    }
  };
  walk('');
  return root;
}
const rmTree = (root) => { if (root && root.startsWith(os.tmpdir())) fs.rmSync(root, { recursive: true, force: true }); };

// page-side: a controlled page's SW message log + the generation census
const SW_MSG_HOOK = `(() => { window.__obSwMsgs = []; if ('serviceWorker' in navigator)
  navigator.serviceWorker.addEventListener('message', (e) => { window.__obSwMsgs.push(e.data); }); })()`;
// GH-1039 P4 (H5): a verified fill miss is answered at once and its copy is
// written in that fetch event's waitUntil (sw.js: verification and storage are
// separate laws); the worker then posts {ob:'snapshot-joined', url}. A join is
// read AFTER that signal, never in the same breath as the answer (P0 r4 on
// 19017f5e: "restored 200, read uncached" in the same millisecond). No signal
// within JOIN_SIGNAL_MS is red — a hang guard on the event, not a settle.
const JOIN_SIGNAL_MS = 60000;
async function joinAfterSignal(c, url) {
  const t0 = Date.now();
  while (Date.now() - t0 < JOIN_SIGNAL_MS) {
    const got = await c.eval(`(window.__obSwMsgs || []).some((m) => m && m.ob === 'snapshot-joined' && m.url === ${JSON.stringify(url)})`).catch(() => false);
    if (got) return { signal: true, ms: Date.now() - t0, cached: await c.eval(`caches.match(${JSON.stringify(url)}).then((r) => !!r)`).catch(() => null) };
    await sleep(100);
  }
  return { signal: false, ms: Date.now() - t0, cached: null };
}
const joinVerdict = (j) => (!j.signal ? `no snapshot-joined signal within ${JOIN_SIGNAL_MS / 1000} s`
  : j.cached !== true ? `signalled after ${j.ms} ms, but caches.match is ${j.cached}` : null);
const census = (c, name, urls) => c.eval(`(async () => { const keys = (await caches.keys()).filter((k) => k.startsWith('ob-sw'));
  const c = await caches.open(${JSON.stringify(name)}); const miss = [];
  for (const u of ${JSON.stringify(urls)}) { if (!(await c.match(u))) miss.push(u); }
  return { keys, miss, controller: !!navigator.serviceWorker.controller }; })()`);

async function waitActivated(c, tag, log, patienceMs = 180000) {
  const t0 = Date.now(); let p = null;
  while (Date.now() - t0 < patienceMs) {
    p = await c.eval(SW_PROBE).catch(() => null);
    if (p && (isActivated(p) || p.ev.some((e) => e.ev === 'state:redundant'))) break;
    await sleep(500);
  }
  log(`[${tag}] first visit: ${p ? p.ev.map((e) => e.ev).join(' > ') : 'no probe'} keys=${p?.keys?.join(',')} entries=${p?.entries}`);
  return p;
}

/** leg swfail (GH-714 review r1 P1): a NEW generation whose install cannot
 * complete one boot entry (its fetch fails inside the worker, both attempts)
 * must NOT activate — the worker goes redundant, the previous snapshot stays
 * active with its boot set whole and keeps serving the app. RED pre-fix:
 * install resolved with the hole ('state:installed'), the old cache was
 * deleted at activation. */
export async function legSwFail({ PORT, cdp, fail, log = console.log }) {
  const tag = 'swfail-desktop';
  const man = readSwManifest();
  const bootUrls = man.boot;
  const victim = bootUrls.find((u) => /locales\/ko\.json$/.test(u)) || bootUrls[bootUrls.length - 1];
  const victimPath = victim.replace(/^\.\//, '').replace(/\?.*$/, '');
  const PORT2 = PORT + 1;
  const root = mirrorTree(['sw.js']);
  const server = spawnStaticServer(root, PORT2);
  await sleep(700);
  let failing = false; let failed = 0;
  const swFetch = { patterns: [{ urlPattern: `*${victimPath}*` }], onPaused: (p, api) => {
    if (failing) { failed++; api.fail('ConnectionFailed'); } else api.go(); } };
  let c = null; let b = null;
  try { // the page opens INSIDE the guard: a launch failure still reaps the mirror server + tree
    c = await newSwPage(PORT2, cdp, { phone: false });
    b = await attachBrowserSession(cdp, { log, swFetch });
    const url = `http://127.0.0.1:${PORT2}/app.html?sw=1&u=3g-${tag}`;
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.length !== 1) { fail(`[${tag}] generation A never activated cleanly (${JSON.stringify(p1?.reg)} keys=${p1?.keys})`); return; }
    const cacheA = p1.keys[0];
    // generation B: a byte-different sw.js (VERSION suffixed -> its own cache);
    // the HTTP cache is cleared so B's install must fetch the victim from the
    // network, where the worker-side interception fails it (both attempts)
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    fs.writeFileSync(path.join(root, 'sw.js'), sw.replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-r1fail'"));
    await c.send('Network.clearBrowserCache');
    failing = true;
    await c.send('Page.navigate', { url: url + '-b' });
    const t0 = Date.now(); let p = null;
    while (Date.now() - t0 < 300000) {
      p = await c.eval(SW_PROBE).catch(() => null);
      const names = p ? p.ev.map((e) => e.ev) : [];
      if (names.includes('updatefound') && (names.includes('state:redundant') || names.includes('state:installed'))) break;
      await sleep(500);
    }
    const names = p ? p.ev.map((e) => e.ev) : [];
    log(`[${tag}] generation B: ${names.join(' > ')} | victim ${victimPath} failed ${failed}x | keys=${p?.keys?.join(',')}`);
    if (!names.includes('updatefound')) { fail(`[${tag}] the byte-different sw.js never triggered an update`); return; }
    if (failed < 1) fail(`[${tag}] staging — the worker never fetched the victim through the failing interception`);
    if (names.includes('state:installed')) fail(`[${tag}] generation B INSTALLED with a boot entry missing (RED law: install must fail on any missing PRECACHE entry)`);
    if (!names.includes('state:redundant')) fail(`[${tag}] generation B did not go redundant after the failed install`);
    const cen = await census(c, cacheA, bootUrls);
    if (!cen.keys.includes(cacheA)) fail(`[${tag}] the previous snapshot ${cacheA} was deleted (keys ${cen.keys.join(',')})`);
    if (cen.miss.length) fail(`[${tag}] ${cen.miss.length} boot entries missing from the ACTIVE snapshot: ${cen.miss.slice(0, 4).join(' ')}`);
    if (!cen.controller) fail(`[${tag}] the page is no longer controlled`);
    // the old worker keeps serving: a third visit boots from the snapshot
    failing = false;
    const pageRes = []; const bootSet = new Set(bootUrls.map((u) => u.replace(/^\.\//, '')));
    c.onEvent((m, q) => { if (m === 'Network.responseReceived') pageRes.push({ url: q.response.url, fromSW: !!q.response.fromServiceWorker, status: q.response.status }); });
    await secondVisit({ c, url: url + '-c', tag, fail, log, bootSet, fillCount: man.fill.length, pageRes, b });
    // the failed install IS an uncaught rejection in generation B (the law's
    // signal); anything else is a defect
    const other = b.sw.exc.filter((e) => !/sw install: \d+\/\d+ boot entries missing/.test(e));
    const installErr = b.sw.exc.length - other.length;
    if (installErr < 1) fail(`[${tag}] generation B raised no install-failure error (${b.sw.exc.length} exceptions)`);
    if (other.length) fail(`[${tag}] SW exceptions: ${other[0]}`);
  } finally { if (b) b.close(); if (c) c.close(); await stopStaticServer(server); rmTree(root); }
}

/** leg swstale (GH-714 review r1 P1): a fill MISS is verified before it is
 * answered. Generation A activates and fills; one lazy module's snapshot
 * entry is removed (the deterministic stand-in for an entry the fill has not
 * reached) and the served tree's bytes for it are swapped (a newer deploy):
 * the controlled page's request must get a synthetic 503 (X-OB-SW:
 * stale-generation, empty body — never executed), the entry stays uncached
 * and the update-waiting message reaches the page; after the bytes match
 * again the same request is 200 and cached. RED pre-fix: 200 with the
 * foreign bytes. */
export async function legSwStale({ PORT, cdp, fail, log = console.log }) {
  const tag = 'swstale-desktop';
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const mod = man.fill.find((u) => /^\.\/app\/[^/]+\.js$/.test(u)) || man.fill.find((u) => /\.js$/.test(u));
  if (!mod) { fail(`[${tag}] no lazy .js entry in PRECACHE_FILL`); return; }
  const modPath = mod.replace(/^\.\//, '');
  const PORT2 = PORT + 1;
  const root = mirrorTree([modPath, GRADE_REL]); // both rewritten by the leg: real copies, the rest symlinked
  const server = spawnStaticServer(root, PORT2);
  await sleep(700);
  const orig = fs.readFileSync(path.join(root, modPath));
  let c = null; let b = null;
  try {
    c = await newSwPage(PORT2, cdp, { phone: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SW_MSG_HOOK });
    b = await attachBrowserSession(cdp, { log });
    const url = `http://127.0.0.1:${PORT2}/app.html?sw=1&u=3g-${tag}`;
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.length !== 1) { fail(`[${tag}] generation A never activated (${JSON.stringify(p1?.reg)})`); return; }
    const cacheA = p1.keys[0];
    const t0 = Date.now(); let p = p1;
    while (Date.now() - t0 < 180000 && p && p.entries < total) { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (!p || p.entries < total) { fail(`[${tag}] the fill never completed (${p?.entries}/${total})`); return; }
    await c.send('Page.navigate', { url: url + '-b' }); // a CONTROLLED page
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) { p = await c.eval(SW_PROBE).catch(() => null); if (p?.ready && p?.controller) break; await sleep(400); }
    if (!p?.controller) { fail(`[${tag}] the second visit is not controlled`); return; }
    const modUrl = `http://127.0.0.1:${PORT2}/${modPath}`;
    const dropped = await c.eval(`caches.open(${JSON.stringify(cacheA)}).then((k) => k.delete(${JSON.stringify(modUrl)}))`).catch(() => null);
    if (dropped !== true) { fail(`[${tag}] staging — ${modPath} was not in the filled snapshot (delete=${dropped})`); return; }
    fs.writeFileSync(path.join(root, modPath), Buffer.concat([orig, Buffer.from('\n/* r1 stale generation */\n')]));
    const probe = `fetch(${JSON.stringify(modUrl)}, { cache: 'no-store' }).then(async (r) => ({ status: r.status,
      sw: r.headers.get('X-OB-SW'), body: (await r.text()).length, stale: (await caches.match(${JSON.stringify(modUrl)})) ? 'cached' : 'uncached' }))`;
    const r1 = await c.eval(probe).catch((e) => ({ err: String(e) }));
    await sleep(1500);
    const msgs = await c.eval('window.__obSwMsgs || []').catch(() => []);
    log(`[${tag}] ${modPath} swapped -> ${JSON.stringify(r1)} msgs=${JSON.stringify(msgs).slice(0, 200)}`);
    if (r1.status !== 503 || r1.sw !== 'stale-generation' || r1.body !== 0) {
      fail(`[${tag}] a fill miss whose digest mismatches the ACTIVE manifest must be a synthetic 503 (X-OB-SW: stale-generation, empty) — got ${JSON.stringify(r1)} (RED pre-fix: 200 with the foreign bytes)`);
    }
    if (r1.stale !== 'uncached') fail(`[${tag}] the mismatched bytes were cached into the snapshot`);
    if (!msgs.some((m) => m && m.ob === 'update-waiting')) fail(`[${tag}] no update-waiting message reached the page (${JSON.stringify(msgs)})`);
    fs.writeFileSync(path.join(root, modPath), orig); // the matching redeploy
    await c.eval('window.__obSwMsgs = []').catch(() => {});
    const r2 = await c.eval(probe).catch((e) => ({ err: String(e) }));
    const j2 = await joinAfterSignal(c, modUrl);
    log(`[${tag}] ${modPath} restored -> ${JSON.stringify(r2)}; join ${JSON.stringify(j2)}`);
    if (r2.status !== 200 || r2.body < 1) fail(`[${tag}] after the matching redeploy the same request must be 200: ${JSON.stringify(r2)}`);
    if (joinVerdict(j2)) fail(`[${tag}] the verified copy did not join the snapshot (${joinVerdict(j2)})`);
    await legSwStaleGrade({ c, root, cacheA, PORT2, man, tag, fail, log });
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
  } finally { if (b) b.close(); if (c) c.close(); await stopStaticServer(server); rmTree(root); }
}

/** review r2 ruling, arm 2 (inside swstale, on the controlled page): the SAME
 * mismatch law over grade.json — the above-root entry is digested like any
 * other, so a swapped grade is a synthetic 503 + update-waiting and is never
 * stored; after the matching redeploy it is 200 and cached. RED pre-fix: the
 * digest-less miss path served AND stored the foreign bytes (an older active
 * worker mixed a newer grade into its versioned snapshot). A tree without
 * the file at generation has no entry: the request passes through unstored. */
async function legSwStaleGrade({ c, root, cacheA, PORT2, man, tag, fail, log }) {
  const g = gradeLaw(man);
  const gradeUrl = `http://127.0.0.1:${PORT2}/${GRADE_REL}`;
  const probe = `fetch(${JSON.stringify(gradeUrl)}, { cache: 'no-store' }).then(async (r) => ({ status: r.status,
    sw: r.headers.get('X-OB-SW'), body: (await r.text()).length, stale: (await caches.match(${JSON.stringify(gradeUrl)})) ? 'cached' : 'uncached' }))`;
  if (!g.exists) {
    if (g.listed || g.bootListed) fail(`[${tag}] ${GRADE_REL} is absent at generation but listed in the manifest`);
    const r0 = await c.eval(probe).catch((e) => ({ err: String(e) }));
    if (r0.stale !== 'uncached') fail(`[${tag}] an un-manifested ${GRADE_REL} request was stored in the snapshot: ${JSON.stringify(r0)}`);
    else log(`[${tag}] ${GRADE_REL} absent at generation: passed through (status ${r0.status}), not stored`);
    return;
  }
  if (!g.listed || !g.sha) fail(`[${tag}] ${GRADE_REL} exists at generation but is not a digested PRECACHE_FILL entry (listed=${g.listed} sha=${g.sha})`);
  const gradePath = path.join(root, GRADE_REL);
  const orig = fs.readFileSync(gradePath);
  const dropped = await c.eval(`caches.open(${JSON.stringify(cacheA)}).then((k) => k.delete(${JSON.stringify(gradeUrl)}))`).catch(() => null);
  if (dropped !== true) fail(`[${tag}] ${GRADE_REL} was not in the filled snapshot (delete=${dropped}) — the normal fill skipped it`);
  await c.eval('window.__obSwMsgs = []').catch(() => {});
  fs.writeFileSync(gradePath, Buffer.concat([orig, Buffer.from('\n')])); // still valid JSON, another digest
  const r1 = await c.eval(probe).catch((e) => ({ err: String(e) }));
  await sleep(1500);
  const msgs = await c.eval('window.__obSwMsgs || []').catch(() => []);
  // the pre-fix path stored the foreign bytes ASYNCHRONOUSLY (waitUntil after
  // answering), so the snapshot is read again once that write would have landed
  const late = await c.eval(`caches.match(${JSON.stringify(gradeUrl)}).then((r) => r ? 'cached' : 'uncached')`).catch(() => 'probe-failed');
  log(`[${tag}] ${GRADE_REL} swapped -> ${JSON.stringify(r1)} after 1.5 s: ${late} msgs=${JSON.stringify(msgs).slice(0, 200)}`);
  if (r1.status !== 503 || r1.sw !== 'stale-generation' || r1.body !== 0) {
    fail(`[${tag}] a mismatched ${GRADE_REL} must be a synthetic 503 (X-OB-SW: stale-generation, empty) — got ${JSON.stringify(r1)} (RED pre-fix: 200, stored without a digest)`);
  }
  if (r1.stale !== 'uncached' || late !== 'uncached') fail(`[${tag}] the mismatched ${GRADE_REL} bytes were cached into the snapshot (at answer: ${r1.stale}, after 1.5 s: ${late})`);
  if (!msgs.some((m) => m && m.ob === 'update-waiting')) fail(`[${tag}] no update-waiting message reached the page for the mismatched ${GRADE_REL} (${JSON.stringify(msgs)})`);
  fs.writeFileSync(gradePath, orig); // the matching redeploy
  await c.eval('window.__obSwMsgs = []').catch(() => {});
  const r2 = await c.eval(probe).catch((e) => ({ err: String(e) }));
  const j2 = await joinAfterSignal(c, gradeUrl);
  log(`[${tag}] ${GRADE_REL} restored -> ${JSON.stringify(r2)}; join ${JSON.stringify(j2)}`);
  if (r2.status !== 200 || r2.body < 1) fail(`[${tag}] after the matching redeploy ${GRADE_REL} must be 200: ${JSON.stringify(r2)}`);
  if (joinVerdict(j2)) fail(`[${tag}] the verified ${GRADE_REL} copy did not join the snapshot (${joinVerdict(j2)})`);
}

// ---- GH-714 review r1v P2: a STORE failure is not a digest MISMATCH -----------
/** In-worker arm, Node: the served tree's sw.js runs under a stub
 * CacheStorage whose put throws QuotaExceededError (the browser cannot be
 * made to throw it on demand from a page, so the worker's own answer path is
 * exercised on its real bytes). One fetch of `rel` (a manifest entry, not in
 * the stub cache) with `body` as the network bytes; returns the answer
 * { status, sw, body (bytes), cached, msgs } (msgs = update-waiting posts). */
export async function swQuotaProbe({ swPath, rel, body, putThrows }) {
  const code = fs.readFileSync(swPath, 'utf8');
  const origin = 'http://127.0.0.1:1';
  const handlers = {}; const msgs = []; const store = new Map();
  const client = { postMessage: (m) => msgs.push(m) };
  const self = {
    addEventListener: (k, f) => { handlers[k] = f; },
    location: { href: `${origin}/app.html`, origin },
    registration: { active: null },
    clients: { matchAll: async () => [client], claim: async () => {} },
    skipWaiting: async () => {},
  };
  const cache = {
    match: async () => undefined, keys: async () => [], delete: async () => false,
    put: async (k, r) => { if (putThrows) throw new DOMException('quota', 'QuotaExceededError'); store.set(k, r); },
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true };
  const fetchStub = async () => new Response(body, { status: 200, headers: { 'content-type': 'text/javascript' } });
  const quiet = { log: () => {}, warn: () => {}, error: () => {} };
  new Function('self', 'caches', 'fetch', 'setTimeout', 'clearTimeout', 'console', code)(
    self, caches, fetchStub, () => 0, () => 0, quiet);
  let out = null; const waits = [];
  const ev = { request: new Request(`${origin}/${rel}`), respondWith: (p) => { out = p; }, waitUntil: (p) => waits.push(p) };
  handlers.fetch(ev);
  if (!out) return { status: -1, sw: null, body: 0, cached: 0, msgs, err: 'no respondWith' };
  const res = await out;
  // RACE, never a bare await (review r4 P2): the fetch handler now hands the
  // fill KICK to waitUntil, and this probe's setTimeout stub never fires, so
  // that promise never settles. The store this probe measures rides the same
  // list and settles at once (in-memory cache, stubbed fetch).
  await Promise.race([Promise.allSettled(waits), new Promise((r) => globalThis.setTimeout(r, 1500))]);
  return { status: res.status, sw: res.headers.get('X-OB-SW'), body: (await res.arrayBuffer()).byteLength, cached: store.size,
    msgs: msgs.filter((m) => m && m.ob === 'update-waiting').length };
}

/** leg swquota (GH-714 review r1v P2): a fill miss whose bytes MATCH the
 * active manifest is served even when the snapshot cannot STORE them —
 * verification and storage are separate laws. Arm (a), in-worker Node probe
 * over the served sw.js bytes: put throws QuotaExceededError -> 200 with the
 * manifest bytes, nothing stored, NO update-waiting message; a mismatching
 * body under the same failing put is still the synthetic 503 + message.
 * Arm (b), browser: generation A fills; the origin's quota is overridden
 * below its usage (CDP Storage.overrideQuotaForOrigin) and PROVEN effective
 * by a page-side put that must reject with QuotaExceededError; one filled
 * module is dropped and requested -> 200 with the right bytes, uncached, no
 * message; the override cleared, the same request is 200 and cached (the
 * retry). Arm (b) is skipped (logged) only when this Chrome ignores the
 * override for CacheStorage — arm (a) is the binding gate either way.
 * RED pre-fix: (a) 503 + update-waiting on matching bytes (the awaited put's
 * failure was answered as a digest mismatch); (b) likewise. */
export async function legSwQuota({ PORT, cdp, fail, log = console.log }) {
  const tag = 'swquota-desktop';
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const mod = man.fill.find((u) => /^\.\/app\/[^/]+\.js$/.test(u)) || man.fill.find((u) => /\.js$/.test(u));
  if (!mod) { fail(`[${tag}] no lazy .js entry in PRECACHE_FILL`); return; }
  const modPath = mod.replace(/^\.\//, '');
  const orig = fs.readFileSync(path.join(WEB_DIR, modPath));
  // ---- arm (a): the worker's own answer path under a failing store
  const swPath = path.join(WEB_DIR, 'sw.js');
  const a1 = await swQuotaProbe({ swPath, rel: modPath, body: orig, putThrows: true }).catch((e) => ({ err: String(e) }));
  const a2 = await swQuotaProbe({ swPath, rel: modPath, body: Buffer.concat([orig, Buffer.from('\n/* r1v foreign */\n')]), putThrows: true }).catch((e) => ({ err: String(e) }));
  const a3 = await swQuotaProbe({ swPath, rel: modPath, body: orig, putThrows: false }).catch((e) => ({ err: String(e) }));
  log(`[${tag}] in-worker probe: put-throws+match ${JSON.stringify(a1)} | put-throws+mismatch ${JSON.stringify(a2)} | put-ok+match ${JSON.stringify(a3)}`);
  if (a1.status !== 200 || a1.body !== orig.length || a1.sw !== null) {
    fail(`[${tag}] matching fill-miss bytes must be SERVED (200, ${orig.length} B) when cache.put throws QuotaExceededError — got ${JSON.stringify(a1)} (RED pre-fix: 503 stale-generation, the store failure answered as a mismatch)`);
  }
  if (a1.msgs) fail(`[${tag}] a store failure on matching bytes posted update-waiting (${a1.msgs}x) — that message is the digest-mismatch signal`);
  if (a1.cached) fail(`[${tag}] probe staging — the failing put stored an entry`);
  if (a2.status !== 503 || a2.sw !== 'stale-generation' || a2.body !== 0 || a2.msgs < 1) {
    fail(`[${tag}] a MISMATCHING fill miss must stay the synthetic 503 + update-waiting under the same failing store — got ${JSON.stringify(a2)}`);
  }
  if (a3.status !== 200 || a3.body !== orig.length || a3.cached !== 1 || a3.msgs) {
    fail(`[${tag}] the plain matching miss must be 200 and stored, no message — got ${JSON.stringify(a3)}`);
  }
  // ---- arm (b): the real worker under a forced quota failure
  const PORT2 = PORT + 1;
  const root = mirrorTree([modPath]);
  const server = spawnStaticServer(root, PORT2);
  await sleep(700);
  const origin = `http://127.0.0.1:${PORT2}`;
  let c = null; let b = null;
  try {
    c = await newSwPage(PORT2, cdp, { phone: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SW_MSG_HOOK });
    b = await attachBrowserSession(cdp, { log });
    const url = `${origin}/app.html?sw=1&u=3g-${tag}`;
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.length !== 1) { fail(`[${tag}] generation A never activated (${JSON.stringify(p1?.reg)})`); return; }
    const cacheA = p1.keys[0];
    const t0 = Date.now(); let p = p1;
    while (Date.now() - t0 < 180000 && p && p.entries < total) { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (!p || p.entries < total) { fail(`[${tag}] the fill never completed (${p?.entries}/${total})`); return; }
    await c.send('Page.navigate', { url: url + '-b' }); // a CONTROLLED page
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) { p = await c.eval(SW_PROBE).catch(() => null); if (p?.ready && p?.controller) break; await sleep(400); }
    if (!p?.controller) { fail(`[${tag}] the second visit is not controlled`); return; }
    await legSwQuotaBrowser({ c, cacheA, origin, modPath, orig, tag, fail, log });
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
  } finally {
    if (c) await c.send('Storage.overrideQuotaForOrigin', { origin }).catch(() => {});
    if (b) b.close(); if (c) c.close(); await stopStaticServer(server); rmTree(root);
  }
}

/** swquota arm (b) on the controlled page: the quota override must be PROVEN
 * to fail a CacheStorage put before the worker's answer is judged by it. */
async function legSwQuotaBrowser({ c, cacheA, origin, modPath, orig, tag, fail, log }) {
  const modUrl = `${origin}/${modPath}`;
  const probe = `fetch(${JSON.stringify(modUrl)}, { cache: 'no-store' }).then(async (r) => ({ status: r.status,
    sw: r.headers.get('X-OB-SW'), body: (await r.arrayBuffer()).byteLength, stale: (await caches.match(${JSON.stringify(modUrl)})) ? 'cached' : 'uncached' }))`;
  const dropped = await c.eval(`caches.open(${JSON.stringify(cacheA)}).then((k) => k.delete(${JSON.stringify(modUrl)}))`).catch(() => null);
  if (dropped !== true) { fail(`[${tag}] staging — ${modPath} was not in the filled snapshot (delete=${dropped})`); return; }
  // quota below the snapshot's usage: every further put must reject
  const ov = await c.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1 }).then(() => 'ok', (e) => `refused: ${e.message}`);
  const putErr = await c.eval(`caches.open(${JSON.stringify(cacheA)}).then((k) => k.put(${JSON.stringify(origin + '/x-r1v-quota-probe')},
    new Response('x'.repeat(65536)))).then(() => 'stored', (e) => e && e.name)`).catch((e) => `eval: ${e.message}`);
  log(`[${tag}] quota override ${ov}; page-side 64 KB put -> ${putErr}`);
  if (putErr !== 'QuotaExceededError') {
    log(`[${tag}] browser arm SKIPPED: this Chrome does not fail CacheStorage puts under Storage.overrideQuotaForOrigin (put -> ${putErr}); arm (a) is the binding gate`);
    await c.send('Storage.overrideQuotaForOrigin', { origin }).catch(() => {});
    return;
  }
  await c.eval('window.__obSwMsgs = []').catch(() => {});
  const r1 = await c.eval(probe).catch((e) => ({ err: String(e) }));
  await sleep(1500);
  const msgs = await c.eval('window.__obSwMsgs || []').catch(() => []);
  const late = await c.eval(`caches.match(${JSON.stringify(modUrl)}).then((r) => r ? 'cached' : 'uncached')`).catch(() => 'probe-failed');
  log(`[${tag}] ${modPath} miss under the quota failure -> ${JSON.stringify(r1)} after 1.5 s: ${late} msgs=${JSON.stringify(msgs).slice(0, 200)}`);
  if (r1.status !== 200 || r1.body !== orig.length || r1.sw !== null) {
    fail(`[${tag}] a fill miss with MATCHING bytes must be served (200, ${orig.length} B) when the store fails — got ${JSON.stringify(r1)} (RED pre-fix: 503 stale-generation)`);
  }
  if (late !== 'uncached') fail(`[${tag}] staging — the put under the 1-byte quota override stored the entry (${late}); the override stopped binding`);
  if (msgs.some((m) => m && m.ob === 'update-waiting')) fail(`[${tag}] a store failure on matching bytes posted update-waiting: ${JSON.stringify(msgs).slice(0, 200)}`);
  await c.send('Storage.overrideQuotaForOrigin', { origin }); // the default quota again
  await c.eval('window.__obSwMsgs = []').catch(() => {});
  const r2 = await c.eval(probe).catch((e) => ({ err: String(e) }));
  const j2 = await joinAfterSignal(c, modUrl);
  log(`[${tag}] quota restored -> ${JSON.stringify(r2)}; join ${JSON.stringify(j2)}`);
  if (r2.status !== 200 || r2.body !== orig.length) fail(`[${tag}] after the quota returns the same request must be 200: ${JSON.stringify(r2)}`);
  if (joinVerdict(j2)) fail(`[${tag}] the retried verified copy did not join the snapshot (${joinVerdict(j2)})`);
}

// ---- GH-714 review r3 P2: fill failures are CLASSIFIED, not permanent --------
/** leg swretry: one fill entry's FIRST fetch fails inside the worker
 * (Fetch.failRequest on the SW session — a transient outage) and one is
 * absent from the served tree (404). After the first kick the fill must be
 * PAUSED ("fill paused (1 retryable …)", no "fill complete", the 404 entry
 * refused, the transient entry uncached, every other entry cached); the
 * next fetch event (a second navigation) must RE-ARM it and — the
 * interception now allowing — cache the transient entry, after which "fill
 * complete" is logged exactly once with the 404 entry as the ONE refused.
 * RED pre-fix: "fill complete (… 2 refused)" after the first kick, and the
 * transient entry stayed uncached after the second navigation (every
 * failure was permanent for the worker's life; fillKicked never reset). */
export async function legSwRetry({ PORT, cdp, fail, log = console.log }) {
  const tag = 'swretry-desktop';
  const man = readSwManifest();
  const lazy = man.fill.filter((u) => /^\.\/app\/[^/]+\.js$/.test(u));
  if (lazy.length < 2) { fail(`[${tag}] fewer than two lazy .js entries in PRECACHE_FILL`); return; }
  const flakyPath = lazy[0].replace(/^\.\//, ''); const gonePath = lazy[1].replace(/^\.\//, '');
  const total = man.boot.length + man.fill.length;
  const PORT2 = PORT + 1;
  const root = mirrorTree([], [gonePath]); // gonePath left out of the mirror: a served 404
  const server = spawnStaticServer(root, PORT2);
  await sleep(700);
  let seen = 0; let failed = 0;
  const swFetch = { patterns: [{ urlPattern: `*${flakyPath}*` }], onPaused: (p, api) => {
    seen++; if (seen === 1) { failed++; api.fail('ConnectionFailed'); } else api.go(); } };
  let c = null; let b = null;
  try {
    c = await newSwPage(PORT2, cdp, { phone: false });
    b = await attachBrowserSession(cdp, { log, swFetch });
    const url = `http://127.0.0.1:${PORT2}/app.html?sw=1&u=3g-${tag}`;
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.length !== 1) { fail(`[${tag}] generation A never activated (${JSON.stringify(p1?.reg)} keys=${p1?.keys})`); return; }
    const cacheA = p1.keys[0];
    const flakyUrl = `http://127.0.0.1:${PORT2}/${flakyPath}`; const goneUrl = `http://127.0.0.1:${PORT2}/${gonePath}`;
    const lines = () => b.sw.console.filter((l) => /\[sw\] fill (paused|complete)/.test(l));
    const cached = (u) => c.eval(`caches.open(${JSON.stringify(cacheA)}).then((k) => k.match(${JSON.stringify(u)})).then((r) => !!r)`).catch(() => null);
    // the first kick: everything but the two victims lands; the fill must PAUSE
    const t0 = Date.now();
    while (Date.now() - t0 < 180000 && !lines().length) await sleep(500);
    let p = await c.eval(SW_PROBE).catch(() => p1);
    const l1 = lines();
    log(`[${tag}] first kick: ${l1.join(' | ') || 'no fill line in 180 s'}; entries ${p?.entries}/${total}; `
      + `flaky ${flakyPath} seen ${seen}x failed ${failed}x cached=${await cached(flakyUrl)}; gone ${gonePath} cached=${await cached(goneUrl)}`);
    if (!l1.length) { fail(`[${tag}] the fill never reached the end of its first kick`); return; }
    if (failed < 1) { fail(`[${tag}] staging — the worker never fetched ${flakyPath} through the failing interception`); return; }
    if (!/fill paused \(1 retryable/.test(l1[0])) fail(`[${tag}] after a transient failure the first kick must end PAUSED (1 retryable) — got: ${l1[0]} (RED pre-fix: fill complete with the hole counted refused)`);
    if (l1.some((l) => /fill complete/.test(l))) fail(`[${tag}] "fill complete" logged while a retryable entry remained`);
    if (p && p.entries !== total - 2) fail(`[${tag}] the first kick cached ${p?.entries}/${total} entries (want ${total - 2}: all but the two victims)`);
    // the retry kick: the next fetch event (a navigation) re-arms the paused fill; the interception now allows
    await c.send('Page.navigate', { url: url + '-b' });
    const t1 = Date.now();
    while (Date.now() - t1 < 120000 && !lines().some((l) => /fill complete/.test(l))) await sleep(500);
    p = await c.eval(SW_PROBE).catch(() => null);
    const l2 = lines(); const flakyCached = await cached(flakyUrl); const goneCached = await cached(goneUrl);
    log(`[${tag}] after the second navigation (+${((Date.now() - t1) / 1000).toFixed(1)}s): ${l2.join(' | ')}; entries ${p?.entries}/${total}; `
      + `flaky seen ${seen}x cached=${flakyCached}; gone cached=${goneCached}`);
    if (seen < 2) fail(`[${tag}] the retry kick never refetched ${flakyPath} (seen ${seen}x) — the paused fill was not re-armed by the next fetch event (RED pre-fix: fillKicked stayed set)`);
    if (flakyCached !== true) fail(`[${tag}] ${flakyPath} is not in the snapshot after the retry kick (a transient failure must not be permanent)`);
    if (goneCached !== false) fail(`[${tag}] the 404 entry ${gonePath} must stay out of the snapshot (cached=${goneCached})`);
    const done = l2.filter((l) => /fill complete/.test(l));
    if (done.length !== 1) fail(`[${tag}] "fill complete" must be logged exactly once, after the retryables drained (got ${done.length}: ${l2.join(' | ')})`);
    else if (!/1 refused\)/.test(done[0])) fail(`[${tag}] completion must count the 404 entry as the ONE refused: ${done[0]}`);
    if (p && p.entries !== total - 1) fail(`[${tag}] ${p?.entries}/${total} entries after the retry kick (want ${total - 1}: all but the 404 entry)`);
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
  } finally { if (b) b.close(); if (c) c.close(); await stopStaticServer(server); rmTree(root); }
}

// ---- GH-714 review r4 P2 leg: the fill survives a worker stop (swstop) ------
/** CDP ServiceWorker domain on the page session: the live version table
 * (versionId / runningStatus / status) from workerVersionUpdated, plus
 * stopWorker(). The browser stops a worker with no extendable event in
 * flight — the deterministic stand-in here is an explicit stop. */
async function swControl(c) {
  const versions = new Map();
  c.onEvent((m, p) => {
    if (m !== 'ServiceWorker.workerVersionUpdated') return;
    for (const v of p.versions || []) versions.set(v.versionId, v);
  });
  await c.send('ServiceWorker.enable');
  const running = () => [...versions.values()].find((v) => v.runningStatus === 'running' && /^activat/.test(v.status)) || null;
  const stop = async () => {
    const v = running(); if (!v) return null;
    await c.send('ServiceWorker.stopWorker', { versionId: v.versionId });
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && versions.get(v.versionId)?.runningStatus !== 'stopped') await sleep(100);
    return { versionId: v.versionId, runningStatus: versions.get(v.versionId)?.runningStatus };
  };
  return { running, stop, versions };
}
// the fill must take long enough to be stopped mid-way (twice): every SW
// request for a NON-boot entry is held FILL_HOLD_MS at the Fetch layer of
// the worker's session (deterministic — CDP network emulation on the SW
// target alone did not slow a local serve), install and the page untouched
const FILL_HOLD_MS = 1500; // Removed before the page-load resume budget begins.

// GH-1092: the delay stages two forced stops. Its timers must not extend
// the later page-load completion observation or survive an early exit.
function swStopStaging(bootSet) {
  let staging = true;
  const timers = new Map();
  const release = () => {
    staging = false;
    for (const [timer, go] of timers) { clearTimeout(timer); go(); }
    timers.clear();
  };
  const swFetch = { patterns: [{ urlPattern: '*' }], onPaused: (p, api) => {
    if (!staging || bootSet.has(pathOf(p.request.url))) { api.go(); return; }
    const timer = setTimeout(() => { timers.delete(timer); api.go(); }, FILL_HOLD_MS);
    timers.set(timer, () => api.go());
  } };
  return { swFetch, release };
}

/** leg swstop (GH-714 review r4 P2): (1) the fill's FIRST turn runs inside
 * activate's waitUntil — the fill log carries "fill first turn inside
 * activate" and the snapshot holds the boot set PLUS the first chunk when
 * 'activated' is first observed; (2) with the worker STOPPED mid-fill
 * (ServiceWorker.stopWorker; no fetch event in flight), a loaded page's
 * {ob:'fill'} re-arm message alone restarts the worker and the fill makes
 * progress; (3) stopped again mid-fill, the NEXT page load resumes and
 * completes it (caches.match true for the last in-scope fill entry).
 * RED on 04b9afa6: no activate-time turn line, and at 'activated' the
 * snapshot holds only PRECACHE (the kick was a bare timer after activate). */
export async function legSwStop({ PORT, cdp, fail, log = console.log }) {
  await runSwStopStagingArm({ fail, log });
  const tag = 'swstop-desktop';
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const firstChunk = Math.min(12, man.fill.length); // sw.js CHUNK
  const lateUrl = [...man.fill].reverse().find((u) => u.startsWith('./')) || man.fill[man.fill.length - 1];
  let c = null; let b = null; let pump = null; let staging = null;
  try {
    c = await newSwPage(PORT, cdp, { phone: false });
    const ctl = await swControl(c);
    const bootSet = new Set(man.boot.map((u) => u.replace(/^\.\//, '')));
    staging = swStopStaging(bootSet);
    b = await attachBrowserSession(cdp, { log, swFetch: staging.swFetch });
    // a RESTARTED worker reuses its DevTools agent host: no second
    // attachedToTarget, but the new thread still waits for the debugger
    // (setAutoAttach waitForDebuggerOnStart) — the arm must release it, a
    // real browser has no debugger (pre-fix probe: 'starting' forever)
    const swSids = new Set();
    b.onEvent((m, p, sid) => { if (m === 'Target.attachedToTarget' && p.targetInfo?.type === 'service_worker') swSids.add(p.sessionId ?? sid); });
    // PUMP, not a one-shot: a navigation into a stopped worker WEDGES
    // (Page.navigate never answers) while the restarted thread waits for
    // the debugger, so the release must already be running.
    pump = setInterval(() => { for (const sid of swSids) b.sendTo(sid, 'Runtime.runIfWaitingForDebugger', {}).catch(() => {}); }, 250);
    const nudge = async (ms = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms && !ctl.running()) await sleep(250);
      return !!ctl.running();
    };
    const url = `http://127.0.0.1:${PORT}/app.html?sw=1&u=3g-${tag}`;
    const lines = (re) => b.sw.console.filter((l) => re.test(l));
    const cached = (u) => c.eval(`caches.match(${JSON.stringify(u)}).then((r) => !!r)`).catch(() => null);
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1)) { fail(`[${tag}] never activated (${JSON.stringify(p1?.reg)})`); return; }
    // (1) the activate-time first turn — logged INSIDE activate, so it is
    // already there when 'activated' is observed (3 s grace for delivery)
    const t0 = Date.now();
    while (Date.now() - t0 < 3000 && !lines(/fill first turn inside activate/).length) await sleep(250);
    const firstLine = lines(/fill first turn inside activate/)[0] || null;
    log(`[${tag}] activated with ${p1.entries}/${total} entries (boot ${man.boot.length} + first chunk ${firstChunk}); activate turn line: ${firstLine || 'ABSENT'}`);
    if (!firstLine) fail(`[${tag}] no "fill first turn inside activate" line — the first fill turn did not ride activate's waitUntil (RED pre-fix: a bare timer after activate)`);
    if (p1.entries < man.boot.length + firstChunk) {
      fail(`[${tag}] at 'activated' the snapshot holds ${p1.entries} entries (< boot ${man.boot.length} + first chunk ${firstChunk}) — activation completed before the first fill chunk was cached`);
    }
    // (2) stop the worker mid-fill; the page's re-arm message ALONE (no fetch
    // event — the first-visit page is uncontrolled and issues none) must
    // restart the worker and resume the fill
    let p = await c.eval(SW_PROBE).catch(() => p1);
    if (p.entries >= total) { log(`[${tag}] fill already complete at ${p.entries}/${total} — the stop legs cannot run on this box (staging)`); fail(`[${tag}] staging — the fill completed before a stop could be issued (raise the SW throttle)`); return; }
    // the CLIENT half of the law is the shipped page's own re-arm (the arm
    // posts the same message below to drive the worker deterministically):
    // app.html must post {ob:'fill'} to the active worker on every load
    if (!/postMessage\(\{ ob: 'fill'/.test(fs.readFileSync(path.join(WEB_DIR, 'app.html'), 'utf8'))) {
      fail(`[${tag}] app.html never posts {ob:'fill'} to the active worker — a stopped worker has no client re-arm (RED pre-fix)`);
    }
    const inflightBeforeControlled = b.sw.maxInflight;
    const s1 = await ctl.stop();
    const atStop1 = (await c.eval(SW_PROBE).catch(() => p))?.entries;
    log(`[${tag}] stop 1: ${JSON.stringify(s1)} at ${atStop1}/${total} entries`);
    if (!s1) { fail(`[${tag}] staging — no running activated version to stop (${ctl.versions.size} versions seen)`); return; }
    await sleep(1500);
    const idle = (await c.eval(SW_PROBE).catch(() => p))?.entries;
    await c.eval(`navigator.serviceWorker.ready.then((r) => { r.active && r.active.postMessage({ ob: 'fill', why: 'client' }); })`).catch(() => {});
    const woke = await nudge();
    log(`[${tag}] re-arm message posted; worker ${woke ? 'running' : 'NOT running'} after the debugger release`);
    const t1 = Date.now(); let grew = null;
    while (Date.now() - t1 < 60000) {
      p = await c.eval(SW_PROBE).catch(() => p);
      if (p && p.entries > idle + 1) { grew = p.entries; break; }
      await sleep(400);
    }
    log(`[${tag}] after stop 1 (idle ${idle}) the client re-arm message: entries ${grew ?? p?.entries}/${total} after ${((Date.now() - t1) / 1000).toFixed(1)} s; worker ${ctl.running() ? 'running' : 'stopped'}`);
    if (grew === null) fail(`[${tag}] the {ob:'fill'} re-arm message did not resume the stopped worker's fill (entries ${idle} -> ${p?.entries} in 60 s)`);
    // (3) stopped again mid-fill, the next page load resumes and completes it
    let s2 = null;
    if (p && p.entries < total) { s2 = await ctl.stop(); log(`[${tag}] stop 2: ${JSON.stringify(s2)} at ${p.entries}/${total}`); }
    else log(`[${tag}] fill completed under the re-arm before a second stop — the page-load resume runs over a complete snapshot`);
    // Both stop legs are staged. The resume budget measures the worker's
    // recovery without adding the test's stop-staging delay to each fetch.
    staging.release();
    log(`[${tag}] staging delay released before page-load resume`);
    const doneBefore = lines(/\[sw\] fill complete/).length;
    // do NOT await: this navigation is served by a worker that has to start
    // first (the pump releases it) — awaiting it would deadlock the arm
    const nav = c.send('Page.navigate', { url: url + '-b' }).catch((e) => log(`[${tag}] navigate: ${e.message}`));
    if (s2) log(`[${tag}] second load: worker ${await nudge() ? 'running' : 'NOT running'} after the debugger release`);
    const t2 = Date.now();
    while (Date.now() - t2 < 180000) {
      p = await c.eval(SW_PROBE).catch(() => null);
      if (p && p.ready && (p.entries >= total || lines(/\[sw\] fill complete/).length > doneBefore)) break;
      await sleep(500);
    }
    // GH-1039 P4: the census above was taken BEFORE the completion line was
    // seen; a fill that finished between the two reads left a stale count
    // (P1 natural runs: "fill complete (19 turns)" logged, census 344/404).
    // Count again now that the line is in.
    if (p && p.entries < total && lines(/\[sw\] fill complete/).length > doneBefore) p = await c.eval(SW_PROBE).catch(() => p);
    const done = lines(/\[sw\] fill complete/);
    const lateHit = await cached(lateUrl);
    log(`[${tag}] second load: entries ${p?.entries}/${total} after ${((Date.now() - t2) / 1000).toFixed(1)} s; completion lines: ${done.join(' | ') || 'none'}; caches.match(${lateUrl}) ${lateHit}`);
    if (!p || p.entries < total) fail(`[${tag}] the next page load did not complete the fill after a worker stop: ${p?.entries}/${total} entries`);
    if (lateHit !== true) fail(`[${tag}] caches.match(${lateUrl}) ${lateHit} — a late fill entry is missing after the resume`);
    if (!done.length) fail(`[${tag}] no "[sw] fill complete" line after the resume`);
    // the <= 12 law is measured over the fill (uncontrolled first visit):
    // once the page is CONTROLLED its own pass-through subresource fetches
    // are attributed to the SW target too (legSwRetry ignores it likewise)
    if (inflightBeforeControlled > 12) fail(`[${tag}] SW had ${inflightBeforeControlled} requests in flight during the fill (law: <= 12)`);
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    // a re-arm over a COMPLETE fill costs nothing: no exception, no refetch
    // (the completion LINE may repeat if the browser stopped the worker in
    // between — a fresh worker legitimately re-runs its one kick)
    const before = lines(/\[sw\] fill complete/).length;
    await c.eval(`navigator.serviceWorker.ready.then((r) => { r.active && r.active.postMessage({ ob: 'fill', why: 'client' }); })`).catch(() => {});
    await sleep(2500);
    const pEnd = await c.eval(SW_PROBE).catch(() => null);
    log(`[${tag}] re-arm over a complete fill: entries ${pEnd?.entries}/${total}, completion lines ${before} -> ${lines(/\[sw\] fill complete/).length}`);
    if (pEnd && pEnd.entries !== total) fail(`[${tag}] a re-arm over a complete fill changed the snapshot: ${pEnd.entries}/${total}`);
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions after the no-op re-arm: ${b.sw.exc[0]}`);
    await nav;
  } finally { staging?.release(); clearInterval(pump); if (b) b.close(); if (c) c.close(); }
}

/** leg swupdate (issue #1047): a WAITING generation is offered to the player.
 * Generation A activates and controls the page; a deploy (B = A's tree with a
 * byte-different marker, manifest.webmanifest, re-digested in B's sw.js under
 * a new VERSION) installs and WAITS. Two passes, desktop 1440×900 and phone
 * 844×390 @3 (touch, coarse):
 *   - the controlled page shows the update notice (#ob-update) in the hall
 *     within NOTICE_MS of the waiting worker: its three strings ride
 *     data-i18n keys present in all 7 locales and render t(key); it is not
 *     occluded (elementFromPoint at the title and at Reload);
 *   - desktop: it is painted (its box differs from the same box in the
 *     pre-deploy screenshot), it stays up at the table (a real click on To
 *     the table), Later hides it and a reload brings it back (B still waits);
 *   - phone: at the table (a real tap on To the table) NOTHING of it is
 *     painted or hit-testable — it never covers the playfield or the fire /
 *     power controls — and it is back when the hall opens again;
 *   - until Reload the page stays on A (A's cache, A's marker bytes); a real
 *     click / tap on Reload boots B: one ob-sw* cache, B's, and B's marker,
 *     read once every tab reloaded into B and the worker answered a fresh
 *     {ob:'fill'} with {ob:'swept'} (GH-1039 race 2);
 *     desktop: a second controlled tab that never pressed Reload reloads into
 *     B by itself (app.html's controllerchange listener — the tab has no
 *     safety reload, so this pins the every-page law);
 *   - #1173 (d): B's deploy changes app.html too (one comment byte; its id
 *     from lib/html-gen-id.mjs, its PRECACHE row re-digested), so the two
 *     generations' documents differ: before Reload the page carries A's id;
 *     after it the pressing tab ends on B's id with at most two documents
 *     after the press (the take-over reload and at most one verifyGeneration
 *     repair, counted by legSwForced's per-document record hook), and the
 *     second tab ends on B's id.
 * RED on main: no notice. */
const NOTICE_MS = 10000;
// GH-1039 race 2: post a fresh {ob:'fill'} with an id from the page and wait
// for the worker's {ob:'swept'} answer to that id (the sweep it asked for
// has settled). No answer within SWEPT_MS: { answer: null } (the caller's red).
const SWEPT_MS = 60000;
// #1161: every eval after the Reload press is bounded. A context that never
// answers (a worker parked for the debugger, a wedged renderer) is a named
// FAIL within STALL_MS, never an unbounded await until the driver's cap
// (pre-fix: one unanswered eval, then rc=124 at 1500 s and no phone pass).
class Stall extends Error {}
// #1173 rev 5: a hang guard over the forced leg's binding events tripped (a named FAIL, like a STALL)
class Hang extends Error {}
const STALL_MS = 20000;
const boundedEval = (target, expr, step) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Stall(`${step} did not answer within ${STALL_MS / 1000} s`)), STALL_MS);
  Promise.resolve().then(() => target.eval(expr)).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});
// note: where a non-Stall eval error goes (the leg's DIAG); the last poll
// error also rides the result's err, so a missing answer names its cause
async function sweptAfterAsk(c, id, ev = (t, expr) => t.eval(expr), note = () => {}) {
  const posted = await ev(c, `(() => { window.__obSwept = null; const sw = navigator.serviceWorker; const id = ${JSON.stringify(id)};
    sw.addEventListener('message', (e) => { if (e.data && e.data.ob === 'swept' && e.data.id === id) window.__obSwept = e.data; });
    sw.startMessages();
    return sw.ready.then((r) => { r.active.postMessage({ ob: 'fill', why: 'client', id }); return true; }); })()`, 'the read-point ask').catch((e) => { if (e instanceof Stall) throw e; return String(e); });
  if (posted !== true) return { answer: null, ms: 0, err: `the ask was not posted: ${posted}` };
  const t0 = Date.now(); let lastErr = null;
  while (Date.now() - t0 < SWEPT_MS) {
    const got = await ev(c, 'window.__obSwept', 'the read-point answer poll').catch((e) => {
      if (e instanceof Stall) throw e;
      lastErr = String((e && e.message) || e); note(e); return null;
    });
    if (got) return { answer: got, ms: Date.now() - t0 };
    await sleep(100);
  }
  return { answer: null, ms: Date.now() - t0, err: lastErr ? `last poll error: ${lastErr.slice(0, 160)}` : undefined };
}
export async function legSwUpdate({ PORT, cdp, fail: gateFail, log = console.log, phone = false }) {
  const tag = `swupdate-${phone ? 'phone' : 'desktop'}`;
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const MARK = 'manifest.webmanifest';
  const KEYS = ['update.ready', 'update.reload', 'update.later'];
  const man = readSwManifest();
  if (!man.digests.get(`./${MARK}`)) { fail(`[${tag}] ${MARK} is not a digested manifest entry`); return; }
  const missing = [];
  for (const f of fs.readdirSync(path.join(WEB_DIR, 'app', 'locales')).filter((n) => n.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(WEB_DIR, 'app', 'locales', f), 'utf8'));
    for (const k of KEYS) if (typeof d[k] !== 'string' || !d[k]) missing.push(`${f}:${k}`);
  }
  if (missing.length) fail(`[${tag}] the notice keys must exist in every locale: missing ${missing.join(', ')}`);
  // #1173 (d): B's deploy changes app.html too (one comment byte), so A's and B's documents carry different
  // generation ids; B's id comes from B's INTENDED bytes, computed before anything is served or written (the mirror
  // copy is byte-identical, and an INVALID here leaks no server)
  const htmlA = fs.readFileSync(path.join(WEB_DIR, 'app.html'), 'utf8');
  const genA = htmlGenId(htmlA), genB = htmlGenId(htmlA.replace('</body>', '<!-- swupdate: generation B --></body>'));
  if (genA.error || genB.error || genA.id === genB.id) { fail(`[${tag}] INVALID: the generation ids (A ${genA.error || genA.id}, B ${genB.error || genB.id})`); return; }
  const PORT2 = PORT + 1;
  const root = mirrorTree(['sw.js', MARK, 'app.html']); // all three rewritten by the deploy: real copies, the rest symlinked
  const server = spawnStaticServer(root, PORT2);
  await sleep(700);
  const swA = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const markA = fs.readFileSync(path.join(root, MARK));
  const shot = path.join(os.tmpdir(), `ob-e2e-swupdate-${process.pid}-${phone ? 'p' : 'd'}`);
  let c = null; let b = null;
  // the notice as PAINTED: null when absent, display-less or visibility-hidden
  const NOTICE = `(() => { const el = document.getElementById('ob-update');
    if (!el || !el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') return null;
    const box = (n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const title = el.querySelector('#ob-update-title'), btns = [...el.querySelectorAll('.ob-prompt__actions .ob-btn')];
    const hit = (n) => { const r = n.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!h && (h === n || n.contains(h)); };
    return { box: box(el), keys: [title, ...btns].map((n) => n?.dataset.i18n ?? null),
      texts: [title, ...btns].map((n) => n?.textContent ?? null),
      want: ${JSON.stringify(KEYS)}.map((k) => window.__i18n?.t?.(k) ?? null),
      hitTitle: !!title && hit(title), hitReload: !!btns[0] && hit(btns[0]),
      reload: btns[0] ? box(btns[0]) : null, later: btns[1] ? box(btns[1]) : null, iw: innerWidth,
      state: window.__swupdate?.state?.() ?? null, shellOpen: document.body.classList.contains('ob-shell-open') };
  })()`;
  // the notice's hit footprint while it is NOT painted (phone table): every
  // probe point of its box must reach something else
  const UNDER = `(() => { const el = document.getElementById('ob-update'); if (!el) return { mounted: false };
    const r = el.getBoundingClientRect(); const pts = [];
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.25, 0.75]) pts.push([r.x + fx * r.width, r.y + fy * r.height]);
    const hits = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); }).length;
    return { mounted: true, vis: getComputedStyle(el).visibility, pe: getComputedStyle(el).pointerEvents, hits, box: [r.x, r.y, r.width, r.height].map(Math.round),
      state: window.__swupdate?.state?.() ?? null, shellOpen: document.body.classList.contains('ob-shell-open') }; })()`;
  const marker = `fetch('./${MARK}').then((r) => r.text()).then((t) => t.includes('ob_generation') ? 'B' : 'A')`;
  const press = async (bx) => {
    const x = Math.round(bx.x + bx.w / 2), y = Math.round(bx.y + bx.h / 2);
    if (phone) { await tap(c, x, y); return; }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  };
  const boxOf = (sel) => c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.getClientRects().length) return null;
    const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`).catch(() => null);
  // a read counts once the notice is painted, on screen and at rest: two
  // consecutive reads with the same box inside the viewport (its sheet and
  // its entrance tween have landed — a click never aims at a moving box)
  const waitNotice = async (ms = NOTICE_MS) => {
    const t0 = Date.now(); let n = null, prev = null;
    while (Date.now() - t0 < ms) {
      n = await c.eval(`(() => { const n = ${NOTICE}; return n && { ...n, vh: innerHeight }; })()`).catch(() => null);
      const onScreen = n && n.box.y >= 0 && n.box.y + n.box.h <= n.vh && n.box.x >= 0 && n.box.x + n.box.w <= n.iw;
      if (onScreen && prev && JSON.stringify(prev.box) === JSON.stringify(n.box)) return { n, ms: Date.now() - t0 };
      prev = onScreen ? n : null;
      await sleep(250);
    }
    return { n: null, ms: Date.now() - t0 };
  };
  const waitShell = async (open, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await c.eval(`document.body.classList.contains('ob-shell-open') === ${open} && !(window.__shell?.moving?.())`).catch(() => false)) return true;
      await sleep(250);
    }
    return false;
  };
  const visit = async (u) => {
    await c.eval('(window.__obNavOld = true), true').catch(() => {});
    await c.send('Page.navigate', { url: u });
    const t0 = Date.now(); let p = null;
    while (Date.now() - t0 < 120000) {
      p = await c.eval(`window.__obNavOld === true ? null : ${SW_PROBE}`).catch(() => null);
      if (p?.ready && p?.controller) return p;
      await sleep(400);
    }
    return p;
  };
  // a second page target in the SAME browser (one profile): openSecondPage (after this leg, shared with swforced)
  const openPage = (pageUrl) => openSecondPage(cdp, pageUrl);
  const judgeNotice = (n, where) => {
    const bad = [];
    if (n.keys.join() !== KEYS.join()) bad.push(`keys ${JSON.stringify(n.keys)}`);
    if (n.texts.some((s, i) => !s || s !== n.want[i] || s === KEYS[i])) bad.push(`texts ${JSON.stringify(n.texts)} vs t() ${JSON.stringify(n.want)}`);
    if (!n.hitTitle || !n.hitReload) bad.push(`occluded (title ${n.hitTitle}, Reload ${n.hitReload})`);
    if (bad.length) fail(`[${tag}] ${where}: the update notice ${bad.join('; ')}`);
    return !bad.length;
  };
  const boxDiff = (fa, fb, bx, iw) => {
    const A = decodePng(fa), B = decodePng(fb);
    const sx = A.w / iw;
    let sum = 0, n = 0;
    for (let y = Math.floor(bx.y * sx); y < Math.ceil((bx.y + bx.h) * sx); y += 2) {
      for (let x = Math.floor(bx.x * sx); x < Math.ceil((bx.x + bx.w) * sx); x += 2) {
        const o = (y * A.w + x) * A.ch;
        sum += Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o + 1] - B.data[o + 1]) + Math.abs(A.data[o + 2] - B.data[o + 2]);
        n += 3;
      }
    }
    return n ? sum / n : 0;
  };
  try {
    c = await newSwPage(PORT2, cdp, { phone });
    if (!phone) await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FORCED_DOC_RECORD }); // #1173 (d): the reload count
    b = await attachBrowserSession(cdp, { log, pump: true });
    const url = `http://127.0.0.1:${PORT2}/app.html?sw=1&u=3g-${tag}`;
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.length !== 1) { fail(`[${tag}] generation A never activated (${JSON.stringify(p1?.reg)})`); return; }
    const cacheA = p1.keys[0];
    let p = await visit(`${url}-a`);
    if (!p?.controller || p.keys.length !== 1) { fail(`[${tag}] the second visit must be controlled with one cache: ${JSON.stringify(p && { c: p.controller, k: p.keys })}`); return; }
    if (await c.eval(NOTICE).catch(() => null)) fail(`[${tag}] the notice showed with no waiting worker`);
    await waitShell(true);
    await c.screenshot(`${shot}-before.png`);
    // the deploy: B's marker bytes and their digest in B's manifest, a new VERSION
    const j = JSON.parse(markA.toString('utf8'));
    j.ob_generation = 'b';
    const markB = Buffer.from(JSON.stringify(j, null, 2) + '\n');
    const shaB = createHash('sha256').update(markB).digest('hex').slice(0, 16);
    const entryA = new RegExp(`\\['\\./${MARK.replace('.', '\\.')}', '[0-9a-f]{16}', \\d+\\]`);
    if (!entryA.test(swA) || !/const VERSION = '[^']+';/.test(swA)) { fail(`[${tag}] INVALID: the manifest entry or VERSION anchor is missing in sw.js`); return; }
    const htmlB = Buffer.from(genB.text);
    const entryHtml = /\['\.\/app\.html', '[0-9a-f]{16}', \d+\]/;
    if (!entryHtml.test(swA)) { fail(`[${tag}] INVALID: the app.html entry is missing in sw.js`); return; }
    const swB = swA.replace(entryA, `['./${MARK}', '${shaB}', ${markB.length}]`)
      .replace(entryHtml, `['./app.html', '${createHash('sha256').update(htmlB).digest('hex').slice(0, 16)}', ${htmlB.length}]`)
      .replace(/const VERSION = '([^']+)';/, "const VERSION = '$1-b';");
    const aMtime = fs.statSync(path.join(root, 'sw.js')).mtimeMs;
    fs.writeFileSync(path.join(root, MARK), markB);
    fs.writeFileSync(path.join(root, 'app.html'), htmlB);
    fs.writeFileSync(path.join(root, 'sw.js'), swB);
    // the static server answers a conditional update check by mtime at 1 s
    // resolution (304 when not newer): B must read strictly newer than A
    const later = new Date(Math.max(Date.now(), aMtime + 2000));
    fs.utimesSync(path.join(root, 'sw.js'), later, later);
    p = await visit(`${url}-b`);
    const tW = Date.now();
    while (Date.now() - tW < 180000 && !(p?.reg?.waiting === 'installed')) { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (p?.reg?.waiting !== 'installed') { fail(`[${tag}] generation B never reached waiting: ${JSON.stringify(p?.reg)}`); return; }
    log(`[${tag}] B waiting after ${Date.now() - tW} ms (QoS-clamped wall, relative only); caches ${p.keys.join(',')}`);
    await waitShell(true);
    let w = await waitNotice();
    if (!w.n) { fail(`[${tag}] no update notice in the hall within ${NOTICE_MS} ms of the waiting worker (RED on main: the page never says an update is ready)`); return; }
    log(`[${tag}] notice in the hall after ${w.ms} ms: ${JSON.stringify(w.n.texts)} box ${JSON.stringify(w.n.box)}`);
    judgeNotice(w.n, 'hall');
    if (!w.n.shellOpen) fail(`[${tag}] precondition — the first notice read must be in the hall`);
    await c.screenshot(`${shot}-after.png`);
    const d = boxDiff(`${shot}-before.png`, `${shot}-after.png`, w.n.box, w.n.iw);
    if (!(d > 12)) fail(`[${tag}] the notice box must be painted: mean |Δ| ${d.toFixed(1)} vs the pre-deploy screenshot (need > 12)`);
    // the table (a real click / tap on To the table)
    const qp = await boxOf('#ob-shell-quickplay');
    if (!qp) { fail(`[${tag}] no To the table button`); return; }
    await press(qp);
    if (!(await waitShell(false))) fail(`[${tag}] To the table never closed the hall`);
    if (!phone) {
      const nt = await c.eval(NOTICE).catch(() => null);
      if (!nt) fail(`[${tag}] the notice must stay up at the table`);
      else judgeNotice(nt, 'table');
      // Later hides it for the page's life; a reload brings it back
      const nl = await c.eval(NOTICE).catch(() => null);
      if (nl?.later) {
        await press(nl.later);
        await sleep(600);
        const gone = await c.eval(`({ n: ${NOTICE}, s: window.__swupdate?.state?.() ?? null })`).catch(() => null);
        if (gone?.n || gone?.s?.dismissed !== true) fail(`[${tag}] Later must hide the notice: ${JSON.stringify(gone)}`);
      } else fail(`[${tag}] no Later button`);
      p = await visit(`${url}-c`);
      await waitShell(true);
      w = await waitNotice();
      if (!w.n) { fail(`[${tag}] after a reload the notice must come back while B waits`); return; }
    } else {
      await sleep(600);
      const u = await c.eval(UNDER).catch((e) => ({ err: String(e) }));
      log(`[${tag}] at the table: ${JSON.stringify(u)}`);
      if (!u?.mounted || u.vis !== 'hidden' || u.hits !== 0 || u.state?.visible !== false) {
        fail(`[${tag}] on the phone table the notice must paint nothing and take no hit over the playfield / fire / power controls: ${JSON.stringify(u)}`);
      }
      const pill = await boxOf('#ob-shell-open');
      if (!pill) { fail(`[${tag}] no hall pill`); return; }
      await press(pill);
      if (!(await waitShell(true))) fail(`[${tag}] the hall pill never opened the hall`);
      w = await waitNotice();
      if (!w.n) { fail(`[${tag}] the notice must be back when the hall opens again`); return; }
      judgeNotice(w.n, 'hall again');
    }
    // still generation A until Reload
    const pre = { probe: await c.eval(SW_PROBE).catch(() => null), mark: await c.eval(marker).catch((e) => String(e)),
      id: await c.eval(`(() => { for (const k of Object.keys(sessionStorage)) if (k.startsWith(${JSON.stringify(FORCED_DOC_KEY)})) sessionStorage.removeItem(k);
        return document.documentElement.dataset.obHtml || null; })()`).catch(() => null) };
    if (!pre.probe?.keys?.includes(cacheA) || pre.probe?.reg?.waiting !== 'installed' || pre.mark !== 'A') {
      fail(`[${tag}] before Reload the page must stay on A (A's cache, A's marker; B waiting): ${JSON.stringify({ keys: pre.probe?.keys, reg: pre.probe?.reg, mark: pre.mark })}`);
    }
    if (pre.id !== genA.id) { fail(`[${tag}] INVALID: the page before Reload must carry A's id ${genA.id}: ${JSON.stringify(pre.id)}`); return; }
    // desktop: a second controlled tab that does NOT press Reload must reload
    // into B by itself when B takes over (app.html's controllerchange law)
    let t2 = null;
    if (!phone) {
      t2 = await openPage(`${url}-t2`);
      const t0 = Date.now(); let q = null;
      while (Date.now() - t0 < 120000) { q = await t2.eval(SW_PROBE).catch(() => null); if (q?.ready && q?.controller) break; await sleep(400); }
      if (!q?.controller) fail(`[${tag}] the second tab never booted controlled`);
      await t2.eval('(window.__obNavOld = true), true').catch(() => {});
    }
    // a REAL click / tap on Reload -> the next boot is B
    await c.eval('(window.__obNavOld = true), true');
    const pressAt = Date.now();
    await press(w.n.reload);
    // #1161: from here every eval is bounded (STALL_MS, a FAIL naming its
    // step); other eval errors (a context destroyed by a reload) go to DIAG
    const diag = []; const evalMax = { ms: 0, step: '' };
    const ev = (target, expr, step) => { const t0 = Date.now();
      return boundedEval(target, expr, step).finally(() => { const d = Date.now() - t0; if (d > evalMax.ms) { evalMax.ms = d; evalMax.step = step; } }); };
    const soft = (step, dflt = null) => (e) => { if (e instanceof Stall) throw e; diag.push(`${step}: ${String((e && e.message) || e).slice(0, 160)}`); return dflt; };
    try {
      const t1 = Date.now(); let post = null;
      while (Date.now() - t1 < 60000) {
        post = await ev(c, `window.__obNavOld === true ? null : ${SW_PROBE}`, 'the pressing tab\'s probe after Reload').catch(soft('pressing tab probe'));
        if (post?.ready && post?.controller) break;
        await sleep(400);
      }
      log(`[${tag}] after Reload (${Date.now() - t1} ms): caches at the first ready ${post?.keys?.join(',')} reg ${JSON.stringify(post?.reg)}`);
      if (!post) {
        const raw = await ev(c, `(async () => ({ nav: window.__obNavOld === true ? 'old document' : 'new document', probe: await ${SW_PROBE},
          notice: window.__swupdate?.state?.() ?? null }))()`, 'the no-new-document DIAG probe').catch(soft('DIAG probe', { err: 'see DIAG' }));
        log(`[${tag}] DIAG no new controlled document: ${JSON.stringify(raw).slice(0, 600)}; sw console tail ${JSON.stringify(b.sw.console.slice(-6)).slice(0, 600)}`);
      }
      let q = null, m2 = null;
      if (t2) {
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
          q = await ev(t2, `window.__obNavOld === true ? null : ${SW_PROBE}`, 'the second tab\'s probe after the take-over').catch(soft('second tab probe'));
          if (q?.ready && q?.controller) break;
          await sleep(400);
        }
        m2 = q ? await ev(t2, marker, 'the second tab\'s marker read').catch(soft('second tab marker', 'error')) : null;
        log(`[${tag}] the second tab after the take-over: ${q ? `new document, caches at its ready ${q.keys.join(',')}, marker ${m2}` : 'NO new document'}`);
      }
      // GH-1039 race 2, the read point. The browser can re-create A's name
      // EMPTY after B's activate deleted it (V8 code cache stored for a script
      // an old page loaded from A opens the cache by name) until every old
      // document is gone; B's worker sweeps it again at each client
      // {ob:'fill'}. So the census is read once every tab has reloaded into B
      // AND a sweep asked by a fresh {ob:'fill'} has answered {ob:'swept'}:
      // the same predicate (one cache, not A's, B's marker), no bound, no
      // retry. A worker without the signal (a pre-fix tree) is read at once and
      // judged by the predicate alone, never by a missing answer; a worker
      // with it that does not answer within SWEPT_MS is red (a hang guard on
      // the event, not a settle).
      const signals = /ob: 'swept'/.test(swB);
      let swept = null;
      if (post && signals) {
        swept = await sweptAfterAsk(c, `swupdate-${tag}-${Date.now()}`, ev, soft('read-point answer poll'));
        if (!swept.answer) fail(`[${tag}] no {ob:'swept'} answer within ${SWEPT_MS / 1000} s to the read-point {ob:'fill'}${swept.err ? ` (${swept.err})` : ''}`);
      }
      const fin = post ? await ev(c, SW_PROBE, 'the read-point census').catch(soft('read-point census')) : null;
      const markPost = post ? await ev(c, marker, 'the pressing tab\'s marker read').catch(soft('pressing tab marker', 'error')) : null;
      log(`[${tag}] read point (${signals ? (swept?.answer ? `swept answered in ${swept.ms} ms: removed ${swept.answer.removed}, deferred ${JSON.stringify(swept.answer.deferred)}, worker keys() ${swept.answer.keysMs} ms` : 'no swept answer') : 'a worker without the swept signal: read at once'}): caches ${fin?.keys?.join(',')} marker ${markPost}`);
      if (!post?.controller || !fin || fin.keys.length !== 1 || fin.keys[0] === cacheA || markPost !== 'B') {
        fail(`[${tag}] a real ${phone ? 'tap' : 'click'} on Reload must boot generation B (one cache, not A's; B's marker bytes): ${JSON.stringify({ keys: fin?.keys, cacheA, mark: markPost, reg: fin?.reg ?? post?.reg })}`);
      }
      if (await ev(c, NOTICE, 'the notice check after the take-over').catch(soft('notice check'))) fail(`[${tag}] the notice must be gone once B is active`);
      // #1173 (d): judged by the DOCUMENT, not by bytes fetched through the controller: the final page is B's
      // app.html (B's id), after one take-over reload and at most one repair reload (verifyGeneration)
      if (post) {
        // the record store settles first (a natural belt swap would leave a short-lived A page and its repair):
        // B's document present and stable over two reads, bounded
        let docs = null, prevDocs = null; const tS = Date.now();
        while (Date.now() - tS < 20000) {
          const d = await ev(c, FORCED_READ, 'the pressing tab\'s record read').catch(soft('pressing tab records', null));
          if (Array.isArray(d)) {
            docs = d;
            // stable = two SUCCESSFUL reads in a row (a read a navigation destroys answers nothing)
            if (prevDocs && d.length === prevDocs.length && d.filter((x) => x.to >= pressAt - 50).some((x) => x.id === genB.id)) break;
          }
          prevDocs = Array.isArray(d) ? d : null; await sleep(1000);
        }
        const idPost = await ev(c, 'document.documentElement.dataset.obHtml || null', 'the pressing tab\'s id read').catch(soft('pressing tab id', 'error'));
        const after = (docs || []).filter((d) => d.to >= pressAt - 50);
        log(`[${tag}] documents after Reload: ${after.map((d) => `${d.id}${d.cc ? '/cc' : ''}${d.pair ? '/repair' : ''}`).join(' > ') || 'none'}; final id ${idPost} (A ${genA.id}, B ${genB.id})`);
        if (idPost !== genB.id) fail(`[${tag}] B's document id never seen: the pressing tab ends on ${JSON.stringify(idPost)}, not B's ${genB.id}`);
        if (after.length > 2) fail(`[${tag}] ${after.length} documents after Reload (want one take-over reload, at most one repair)`);
      }
      if (t2 && q) {
        const id2 = await ev(t2, 'document.documentElement.dataset.obHtml || null', 'the second tab\'s id read').catch(soft('second tab id', 'error'));
        if (id2 !== genB.id) fail(`[${tag}] B's document id never seen in the second tab: ${JSON.stringify(id2)}, not B's ${genB.id}`);
      }
      if (t2) {
        if (!q || !fin || fin.keys.length !== 1 || fin.keys[0] === cacheA || m2 !== 'B') {
          fail(`[${tag}] a second controlled tab must reload into B on its own when B takes over (it never pressed Reload): ${JSON.stringify({ newDocument: !!q, keys: fin?.keys, mark: m2 })}`);
        }
        await t2.close();
      }
      if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
      log(`[${tag}] post-Reload evals: largest ${evalMax.ms} ms (${evalMax.step || 'none'}), bound ${STALL_MS / 1000} s${diag.length ? `; DIAG ${diag.length}: ${diag.slice(-6).join(' | ')}` : ''}`);
      if (!failed) log(`[${tag}] OK: the waiting generation is offered (${phone ? 'hall; hidden over the table; back in the hall' : 'hall + table, Later, reload'}), Reload boots it`);
    } catch (e) {
      if (!(e instanceof Stall)) throw e;
      fail(`[${tag}] STALL after Reload: ${e.message}${diag.length ? `; DIAG ${diag.slice(-6).join(' | ')}` : ''}; sw console tail ${JSON.stringify(b.sw.console.slice(-4)).slice(0, 300)}`);
    }
  } finally {
    if (b) b.close();
    if (c) c.close();
    await stopStaticServer(server);
    rmTree(root);
    for (const sfx of ['before', 'after']) { try { fs.unlinkSync(`${shot}-${sfx}.png`); } catch { /* tmp */ } }
  }
}

/** a second page target in the SAME browser (one profile): the cdp.mjs client shape over its own websocket
 * (legSwUpdate's second tab, legSwForced's forcing tab). Placed after legSwUpdate, outside test-swstop-staging's
 * slice; a function declaration, so legSwUpdate above calls it. */
async function openSecondPage(cdp, pageUrl) {
  const tgt = await (await fetch(`http://127.0.0.1:${cdp}/json/new?${pageUrl}`, { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('second page ws refused')); });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const q = pend.get(m.id); pend.delete(m.id); if (m.error) q.rej(new Error(m.error.message)); else q.res(m.result); } };
  // #1161: a backstop deadline (the leg's bounded eval names the step first)
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; const t = setTimeout(() => { pend.delete(i); rej(new Error(`second tab: ${method} did not answer within ${STALL_MS / 1000 + 5} s`)); }, STALL_MS + 5000);
    pend.set(i, { res: (x) => { clearTimeout(t); res(x); }, rej: (e) => { clearTimeout(t); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return {
    eval: async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; },
    close: async () => { try { ws.close(); } catch { /* gone */ } await fetch(`http://127.0.0.1:${cdp}/json/close/${tgt.id}`, { signal: AbortSignal.timeout(5000) }).catch(() => {}); },
  };
}

/** leg swforced (#1167 item 2 D3, #1173): the FORCED take-over, judged by
 * each document's own generation id. Desktop only, NO DevTools on the
 * workers (page-session ServiceWorker events only: a DevTools session
 * changes a worker's lifecycle). The recipe (lab step 0', w1173):
 *   - A's mirror sw.js gains a start loop (FORCED_HOLD_MS, A only, while a
 *     worker waits) and holds the forcing fetch's event (a non-navigation
 *     request carrying FORCED_HOLD_TOKEN) until A's own fetch listener sees
 *     the first navigation (capped at 20 s), so serving that navigation is
 *     A's last work;
 *   - A's fill is complete before the press (FORCED_FILL_MS); A is stopped,
 *     B warmed, a second tab's fetch restarts A, and Reload is pressed once
 *     A's restart is seen (the CDP event), during A's start;
 *   - the 10 s belt then reloads the page while A still holds: A serves its
 *     OLD app.html, the navigation activates B, B controls the not yet
 *     execution-ready document with no controllerchange.
 * After the press no SW_PROBE / caches / registration eval runs (those are
 * the reads that stalled behind B's activate; the tab is opened without
 * SW_OBSERVER's registration poll): B's 'activated' is the CDP event
 * itself, bounded by FORCED_ACTIVATE_MS (over it ends the leg, named), and
 * the verdict reads only the per-document records a new-document hook
 * writes to sessionStorage, one key per document, each written only by its
 * own document (one clock, the page's). Classes:
 *   REPAIRED (GREEN): doc1 has A's id and no controllerchange, its repair pair
 *     names A>B, then exactly one more document, controlled, with B's id,
 *     starting within FORCED_REPAIR_MS of doc1's response, and no third
 *     document until FORCED_REPAIR_MS past the repair document's response;
 *   SILENT-SWAP (RED): doc1 with A's id, controlled, no controllerchange,
 *     stays, and its controller answers B's app.html;
 *   INVALID (a named FAIL, never GREEN, no re-run): no A document after the
 *     press, a controllerchange in it, a stale page without a controller or
 *     whose controller does not answer B's id (the recipe made no swap), the
 *     controller read failing, or the forcing fetch not restarting A.
 * rev 5: after the press the leg reads those records from a CDP binding the
 * hook pushes each stored record (and a 1 s beat) through, never by eval;
 * the next document re-emits every stored record (a pagehide push can be
 * lost), and the highest count per document wins. A binding call names its
 * execution context: a document's beats and own records are tied to its
 * main-world context (alive from creation to destruction), commits to their
 * loader's DOMContentLoaded; nothing is matched by time. Two hang guards keep
 * a frozen page a FAIL (a named HANG): a document committed after the press
 * reaches DOMContentLoaded within FORCED_DCL_MS, and from max(the press, its
 * DOMContentLoaded) its beats never pause over FORCED_SILENCE_MS; a document
 * left without a record of its own is a named FAIL. Stability needs two
 * looks 1 s apart. Then the loop control: the tab opens ./app-loop.html (in
 * B's snapshot, a rewritten id): exactly 2 documents within
 * FORCED_LOOP_WATCH_MS of that navigation's commit (one repair reload; the
 * tab is closed at FORCED_LOOP_CLOSE); and no late document of the main
 * phase. */
const FORCED_HOLD_MS = 1500;
const FORCED_ACTIVATE_MS = 60000;
// the repair document starts at most this long after the swapped document's response (one clock, the page's).
// Calibrated (CALIBRATION ONLY, a034fc17): 0.18-4.38 s; measured from the swapped document's start it moved with A's
// answer time (0.4-12.7 s), from B's 'activated' it was mostly negative (the repair often precedes that event)
const FORCED_REPAIR_MS = 20000;
const FORCED_LOOP_WATCH_MS = 20000;
const FORCED_LOOP_CLOSE = 6;
// A's background fill must be complete before the press (its kick then adds no work at the belt navigation); a busy
// host took over 180 s in calibration (342/407 at 180 s), so the precondition waits this long before INVALID
const FORCED_FILL_MS = 300000;
// one sessionStorage key per document: FORCED_DOC_KEY + timeOrigin (no document rewrites another's record)
const FORCED_DOC_KEY = 'ob-forced-doc:';
const FORCED_ALL_HREFS = 'const ALL_HREFS';
// the forcing fetch's query token: no leg URL carries it, and only a non-navigation request arms the hold
const FORCED_HOLD_TOKEN = 'obforced-hold';
// the record hook keeps app/swupdate.js's repair pair (REPAIR_KEY there; test-swforced pins the two equal)
const FORCED_REPAIR_KEY = 'ob-html-repair';
// #1173 rev 5: the record hook also pushes every record it stores, and a beat, through this CDP binding; after the press
// the leg reads the records from those Runtime.bindingCalled events, never by eval (round 7's c34: a record read eval
// answered nothing in 20 s)
const FORCED_BINDING = '__obForcedRec';
// hang guard 1 (PREREG rev 5): a document committed after the press reaches DOMContentLoaded within this long of its
// commit. 20 s = the old read bound and bootSettled's wait cap; no calibration data justifies a tighter bound
const FORCED_DCL_MS = 20000;
// hang guard 2 (PREREG rev 5): from max(the press, a document's DOMContentLoaded) the document's main thread beats with
// no gap over this bound. 15 s = rev 4's post-press eval ceiling (gate item 3), whose role this guard takes over
const FORCED_SILENCE_MS = 15000;
const FORCED_BEAT_MS = 1000;
const FORCED_DOC_RECORD = `(() => {
  if (window.top !== window) return;
  const sw = navigator.serviceWorker;
  // b: the binding's type when the hook ran (the browser probe checks it is a function in every document)
  const rec = { to: Math.round(performance.timeOrigin), id: null, cc: false, ctl: null, pair: null, rs: null, n: 0, dcl: null, ph: null, vis: null,
    b: typeof window[${JSON.stringify(FORCED_BINDING)}] };
  const key = ${JSON.stringify(FORCED_DOC_KEY)} + rec.to;
  const now = () => Math.round(performance.timeOrigin + performance.now());
  // the binding, looked up at each push (it may attach after the hook ran); the shipped swupdate leg adds none, so
  // nothing is pushed there
  const push = (o) => { const b = window[${JSON.stringify(FORCED_BINDING)}]; if (typeof b === 'function') try { b(JSON.stringify(o)); } catch (e) { /* lab record */ } };
  // each save counts up (the leg keeps the highest count per document), is pushed only once it is stored, and names
  // its trigger (tr): the leg ties a document's own pushes to its execution context, never a re-emit ('re')
  let stored = false;
  // vis: the page's visibility at each save (a hidden page's timers are throttled, which would stretch the beats)
  const save = (tr) => { rec.n += 1; rec.vis = document.visibilityState || null; let ok = false; try { sessionStorage.setItem(key, JSON.stringify(rec)); ok = stored = true; } catch (e) { /* lab record */ } if (ok) push({ rec, tr }); };
  // every stored record again: a pagehide push is lost when the frame host swaps, and the next document carries it
  const reemit = () => { try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(${JSON.stringify(FORCED_DOC_KEY)})) { const r = JSON.parse(sessionStorage.getItem(k)); if (r && typeof r.to === 'number') push({ rec: r, tr: 're' }); } } catch (e) { /* lab record */ } };
  const nav = () => { const n = performance.getEntriesByType('navigation')[0]; if (n && n.responseStart) rec.rs = Math.round(n.responseStart); };
  const readId = () => { const el = document.documentElement; if (!el) return false; rec.id = el.getAttribute('data-ob-html') || ''; save('id'); return true; };
  save('start'); reemit();
  if (!readId()) { const mo = new MutationObserver(() => { if (readId()) mo.disconnect(); }); mo.observe(document, { childList: true }); }
  if (sw) sw.addEventListener('controllerchange', () => { rec.cc = true; save('cc'); });
  addEventListener('DOMContentLoaded', () => { nav(); rec.ctl = !!(sw && sw.controller); rec.dcl = now(); save('dcl'); reemit(); beat(); });
  addEventListener('pagehide', () => { nav(); rec.ctl = !!(sw && sw.controller); rec.ph = now();
    try { rec.pair = sessionStorage.getItem(${JSON.stringify(FORCED_REPAIR_KEY)}); } catch (e) { /* lab record */ } save('ph'); });
  // the beat: this document's main thread answering, on the page clock (hang guard 2 reads the gaps); each tick checks
  // that the record is stored (not the opaque about:blank of the leg's own close) and push checks the binding
  // d: this document's DOMContentLoaded stamp once it has one (hang guard 2 starts there even when no record of the
  // document reached the leg)
  function beat() { if (stored) push({ beat: rec.to, t: now(), d: rec.dcl }); }
  beat(); setInterval(beat, ${FORCED_BEAT_MS});
})();`;
// every record of the tab, sorted by timeOrigin (an expression evaluated in the page)
const FORCED_READ = `Object.keys(sessionStorage).filter((k) => k.startsWith(${JSON.stringify(FORCED_DOC_KEY)}))
  .map((k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => a.to - b.to)`;

/** the lab bytes of the forced recipe, in a MIRROR's sw.js (never web/sw.js):
 * gen 'A' = the start loop + the navigation-released hold, before ALL_HREFS;
 * gen 'B' = A's bytes with the A-only block stripped, plus an optional
 * activate delay (calibration only; never in A). Returns { sw } or { invalid }. */
export function forcedLabBytes(sw, gen, { activateDelayMs = 0 } = {}) {
  const n = sw.split(FORCED_ALL_HREFS).length - 1;
  if (n !== 1) return { invalid: `lab anchor missing: ${FORCED_ALL_HREFS} (found ${n})` };
  const BEGIN = '/* SWFORCED-A-BEGIN */', END = '/* SWFORCED-A-END */';
  if (gen === 'A') {
    const hold = `\n${BEGIN} if (self.registration && self.registration.waiting && !VERSION.endsWith('-b')) { const until = Date.now() + ${FORCED_HOLD_MS}; while (Date.now() < until) { /* lab: a long start */ } }
let __forcedRel = null;
self.addEventListener('fetch', (e) => {
  if (VERSION.endsWith('-b')) return;
  let u; try { u = new URL(e.request.url); } catch (x) { return; }
  if (e.request.mode !== 'navigate' && u.search.indexOf('${FORCED_HOLD_TOKEN}') >= 0 && __forcedRel === null) {
    let r; const p = new Promise((res) => { r = res; });
    __forcedRel = r; setTimeout(() => { if (typeof __forcedRel === 'function') { const f = __forcedRel; __forcedRel = 'cap'; f(); } }, 20000);
    e.waitUntil(p); return;
  }
  if (e.request.mode === 'navigate' && typeof __forcedRel === 'function') { const f = __forcedRel; __forcedRel = 'released'; f(); }
});
${END}\n`;
    const at = sw.indexOf(FORCED_ALL_HREFS);
    return { sw: sw.slice(0, at) + hold + sw.slice(at) };
  }
  const b0 = sw.indexOf(BEGIN), b1 = sw.indexOf(END);
  let out = b0 >= 0 && b1 > b0 ? sw.slice(0, b0) + '/* swforced: the A-only block stripped from B */' + sw.slice(b1 + END.length) : sw;
  if (activateDelayMs > 0) {
    const at = out.indexOf(FORCED_ALL_HREFS);
    out = `${out.slice(0, at)}/* swforced calibration */ self.addEventListener('activate', (e) => { e.waitUntil(new Promise((r) => setTimeout(r, ${activateDelayMs}))); });\n${out.slice(at)}`;
  }
  return { sw: out };
}

/** classify the pressing tab's records after the press (pure; the node arm
 * judges it). With a single A document the stale page's controller decides:
 * call without ctlId first ({ cls: 'NEEDS-CTL' }), read it, call again.
 * Returns { cls, why, doc1, doc2, repairMs, fromAnswer } */
export function classifyForced(docs, { idA, idB, pressAt, ctlId }) {
  const after = docs.filter((d) => d.to >= pressAt - 50);
  const doc1 = after[0], doc2 = after[1];
  if (!doc1 || doc1.id !== idA) return { cls: 'INVALID', why: doc1 ? `the first document after the press carries ${JSON.stringify(doc1.id)}, not A's id ${idA} (a take-over before the belt: no swap)` : 'no document after the press', doc1, doc2 };
  if (doc1.cc) return { cls: 'INVALID', why: 'the A document saw a controllerchange (the double-reload path: no swap)', doc1, doc2 };
  if (!doc2) {
    if (doc1.ctl !== true) return { cls: 'INVALID', why: `the stale A page has no controller (ctl ${JSON.stringify(doc1.ctl)}): no swap`, doc1 };
    if (ctlId === undefined) return { cls: 'NEEDS-CTL', why: null, doc1 };
    if (ctlId !== idB) return { cls: 'INVALID', why: `the stale page's controller answers id ${JSON.stringify(ctlId)}, not B's ${idB} (no swap)`, doc1 };
    return { cls: 'SILENT-SWAP', why: `A's document stayed under B (${after.length} document after the press)`, doc1 };
  }
  const repairMs = doc2.to - doc1.to;
  const fromAnswer = doc1.rs == null ? null : doc2.to - (doc1.to + doc1.rs);
  if (doc2.id !== idB) return { cls: 'FAIL', why: `the document after the swap carries ${JSON.stringify(doc2.id)}, not B's id ${idB}`, doc1, doc2, repairMs, fromAnswer };
  if (doc2.ctl !== true) return { cls: 'FAIL', why: 'the repair document is not controlled', doc1, doc2, repairMs, fromAnswer };
  if (doc1.pair !== `${idA}>${idB}`) return { cls: 'FAIL', why: `the swapped document left repair pair ${JSON.stringify(doc1.pair)}, not ${idA}>${idB} (not verifyGeneration's reload)`, doc1, doc2, repairMs, fromAnswer };
  if (after.length > 2) return { cls: 'FAIL', why: `${after.length} documents after the press (want exactly 2: the swap, its repair)`, doc1, doc2, repairMs, fromAnswer };
  if (!(fromAnswer !== null && fromAnswer <= FORCED_REPAIR_MS)) return { cls: 'FAIL', why: `the repair document started ${fromAnswer} ms after the swapped document's response (bound ${FORCED_REPAIR_MS} ms)`, doc1, doc2, repairMs, fromAnswer };
  return { cls: 'REPAIRED', why: null, doc1, doc2, repairMs, fromAnswer };
}

/** #1173 rev 5: the STALL dump (pure; the node arm judges it). It is built at the 20 s timeout from what the leg already
 * holds, never from a CDP call (a dump must not wait on the stalled renderer): its evals, the CDP events (still
 * arriving at the timeout = a live browser), the main frame's lifecycle, the workers' states and the last good records.
 * Times are ms from the press. */
export function forcedStallDump(d, { step, phase, evals, diag, runs, now }) {
  const rel = (t) => (t && d.pressAt != null ? t - d.pressAt : null);
  const b = d.boot || {};
  return {
    step, phase, where: d.where, sincePressMs: rel(now),
    evals: evals.slice(-40),
    boot: { commit: rel(b.commit), dcl: rel(b.dcl), started: rel(b.started), stopped: rel(b.stopped) },
    page: d.page.map((e) => `${e.m}@${rel(e.t)}`),
    cdp: { events: d.cdp.n, last: d.cdp.last, lastMs: rel(d.cdp.lastAt), quietMs: d.cdp.lastAt ? now - d.cdp.lastAt : null },
    runs: runs.filter((r) => d.pressAt == null || r.t >= d.pressAt - 1000).slice(-12).map((r) => `${rel(r.t)}:${r.id}:${r.st}/${r.status}`),
    diag: diag.slice(-8),
    docs: (d.lastGood || []).map((x) => `${rel(x.to)}+${x.rs}:${x.id}${x.cc ? '/cc' : ''}${x.ctl ? '/ctl' : ''}${x.pair ? `/pair=${x.pair}` : ''}`),
    binding: d.store ? { records: d.store.recs.size, beats: [...d.store.beats].map(([ctx, b]) => `ctx${ctx}:${b.length}@${rel(b[b.length - 1])}`).slice(-8),
      commits: (d.commits || []).filter((x) => d.pressAt == null || x.t >= d.pressAt - 1000).slice(-10)
        .map((x) => `${rel(x.t)}${/^about:/.test(x.url) ? ':blank' : ''}${(x.dcl ?? x.dcl2) != null ? `:dcl+${(x.dcl ?? x.dcl2) - x.t}` : ''}`),
      contexts: (d.contexts || []).filter((x) => d.pressAt == null || x.end == null || x.end >= d.pressAt - 1000).slice(-10)
        .map((x) => `ctx${x.id}@${rel(x.t)}..${x.end == null ? 'live' : rel(x.end)}${d.store.recByCtx && d.store.recByCtx.has(x.id) ? '' : ':norec'}`) } : null,
  };
}

/** #1173 rev 5: one Runtime.bindingCalled payload into the leg's store (pure; the node arm judges it). meta.ctx is the
 * call's execution context (the CDP event carries it). A document's OWN pushes (every trigger but a re-emit, 're') tie
 * its context to its record (store.ctxTo; store.recByCtx keeps the highest count per context, so two documents that
 * share a time origin never share a record); its beats are kept by context (at most 1800, store.beatsCut marks a cut);
 * its DOMContentLoaded stamp, from its own record or a beat, is kept by context (store.dclByCtx). A pagehide copy that
 * arrives directly is counted (store.phDirect). store.recs keeps the highest count per time origin, for the verdict (a
 * re-emitted copy, read before a newer save, can arrive after it). Returns false for a payload it cannot use. */
export function forcedTake(store, msg, meta = {}) {
  if (msg && msg.rec && typeof msg.rec.to === 'number') {
    const old = store.recs.get(msg.rec.to);
    if (!old || (msg.rec.n || 0) > (old.n || 0)) store.recs.set(msg.rec.to, msg.rec);
    if (msg.tr !== 're' && meta.ctx != null) {
      store.ctxTo.set(meta.ctx, msg.rec.to);
      const mine = store.recByCtx.get(meta.ctx);
      if (!mine || (msg.rec.n || 0) > (mine.n || 0)) store.recByCtx.set(meta.ctx, msg.rec);
      if (msg.rec.dcl != null && !store.dclByCtx.has(meta.ctx)) store.dclByCtx.set(meta.ctx, msg.rec.dcl);
    }
    if (msg.tr === 'ph') store.phDirect.add(msg.rec.to);
    return true;
  }
  if (msg && typeof msg.beat === 'number' && typeof msg.t === 'number' && meta.ctx != null) {
    const b = store.beats.get(meta.ctx) || [];
    b.push(msg.t); if (b.length > 1800) { b.shift(); store.beatsCut.add(meta.ctx); }
    store.beats.set(meta.ctx, b);
    if (msg.d != null && !store.dclByCtx.has(meta.ctx)) store.dclByCtx.set(meta.ctx, msg.d);
    return true;
  }
  return false;
}
// the store's records, sorted by timeOrigin (what the sessionStorage read returned before rev 5)
export function forcedDocs(store) {
  return [...store.recs.values()].sort((a, b) => a.to - b.to);
}

/** #1173 rev 5: the hang guards (pure; the node arm judges them). Nothing is matched by time (review P2 on cd4fce09).
 * Every cross-document commit of the main frame makes exactly one main-world context, so the k-th commit
 * (Page.frameNavigated, the leg's clock) and the k-th context (Runtime.executionContextCreated, isDefault, main frame)
 * are one document, whatever order the two events arrive in. A commit carries its loader's DOMContentLoaded
 * (Page.lifecycleEvent by loaderId, else the first Page.domContentEventFired after it); a context names its binding
 * calls, so its beats and own record are its document's (forcedTake). A document lives from its commit until its
 * context ends or the next context is made (a page kept in the back/forward cache never ends its context).
 * Returns { why, dclMax, silenceMax, unmatched, unaccounted }: unaccounted lists the commits after the press (about:blank
 * excluded) whose document has not pushed a record of its own; why is null, or the reason a HANG names:
 *  1. a document committed after the press reached DOMContentLoaded more than FORCED_DCL_MS after its commit, or has
 *     not reached it FORCED_DCL_MS after its commit while it was still the tab's document (one replaced sooner is not
 *     judged past its replacement);
 *  2. a gap over FORCED_SILENCE_MS in a document's beats from max(the press, its DOMContentLoaded: CDP's, else its own
 *     stamp) to the end of its life or, while it lives, to now. Before DOMContentLoaded guard 1 bounds the document; a
 *     page frozen until its replacement counts; a navigation's own wait does not (the old page beats until its end). */
export function forcedHangCheck(store, { pressAt, commits, contexts, now }) {
  const cs = [...commits].sort((x, y) => x.t - y.t), xs = [...contexts].sort((x, y) => x.t - y.t);
  let dclMax = null, silenceMax = null, why = null; const unaccounted = [];
  cs.forEach((c, k) => {
    if (why) return;
    const blank = /^about:/.test(c.url || ''), x = xs[k], cdpDcl = c.dcl ?? c.dcl2 ?? null;
    if (!blank && c.t >= pressAt) {
      if (!x || !store.recByCtx.has(x.id)) unaccounted.push({ t: c.t, url: c.url });
      const until = cs[k + 1] ? cs[k + 1].t : now;
      if (cdpDcl != null) {
        const ms = cdpDcl - c.t;
        dclMax = Math.max(dclMax ?? 0, ms);
        if (ms > FORCED_DCL_MS) why = `a document reached DOMContentLoaded ${ms} ms after its commit (committed ${c.t - pressAt} ms after the press; bound ${FORCED_DCL_MS} ms)`;
      } else if (until - c.t > FORCED_DCL_MS) {
        why = `a document committed ${c.t - pressAt} ms after the press has not reached DOMContentLoaded ${until - c.t} ms after its commit (bound ${FORCED_DCL_MS} ms)`;
      }
    }
    if (why || blank || !x) return;
    const dcl = cdpDcl ?? store.dclByCtx.get(x.id) ?? null;
    if (dcl == null) return;
    const next = xs[k + 1], from = Math.max(pressAt, dcl), end = Math.min(x.end ?? Infinity, next ? next.t : Infinity, now);
    if (end <= from) return;
    const bs = store.beats.get(x.id) || [];
    let last = store.beatsCut.has(x.id) && bs.length && bs[0] > from ? bs[0] : from, gap = 0;
    for (const b of bs) { if (b < from || b > end) continue; gap = Math.max(gap, b - last); last = b; }
    gap = Math.max(gap, end - last);
    silenceMax = Math.max(silenceMax ?? 0, gap);
    const own = store.recByCtx.get(x.id);
    if (gap > FORCED_SILENCE_MS) why = `${end === now ? 'the live document' : 'a document'} (${own ? own.id : 'no record'}) was silent ${gap} ms from ${from === pressAt ? 'the press' : 'its DOMContentLoaded'} on (bound ${FORCED_SILENCE_MS} ms)`;
  });
  return { why, dclMax, silenceMax, unmatched: unaccounted.length, unaccounted };
}

export async function legSwForced({ PORT, cdp, fail: gateFail, log = console.log, activateDelayMs = Number(process.env.OB_SWFORCED_ACTIVATE_DELAY_MS || 0) }) {
  const tag = 'swforced';
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const MARK = 'manifest.webmanifest';
  const man = readSwManifest();
  if (!man.digests.get(`./${MARK}`)) { fail(`[${tag}] ${MARK} is not a digested manifest entry`); return; }
  // the generation ids before anything is served (the mirror copy is byte-identical): an INVALID here leaks nothing
  const html0 = fs.readFileSync(path.join(WEB_DIR, 'app.html'), 'utf8');
  const genA = htmlGenId(html0);
  const genB = htmlGenId(html0.replace('</body>', '<!-- swforced: generation B --></body>'));
  if (genA.error || genB.error || genA.id === genB.id) { fail(`[${tag}] INVALID: the generation ids (A ${genA.error || genA.id}, B ${genB.error || genB.id})`); return; }
  const idA = genA.id, idB = genB.id;
  const PORT2 = PORT + 1;
  const root = mirrorTree(['sw.js', MARK, 'app.html']); // the deploy rewrites all three: real copies
  const server = spawnStaticServer(root, PORT2);
  let c = null; let t2 = null;
  const runs = []; const evals = []; const diag = [];
  const at = (t, from) => (t == null || from == null ? null : t - from);
  let phase = 'before the press';
  // #1173 rev 5: the records and beats the binding delivers (beats and own records tied to the calling execution
  // context), and the main frame's commits (node clock), each with its loader, context and DOMContentLoaded
  const store = { recs: new Map(), beats: new Map(), ctxTo: new Map(), recByCtx: new Map(), dclByCtx: new Map(), beatsCut: new Set(), phDirect: new Set() };
  const commits = []; const contexts = [];
  // #1173 rev 5 (maintainer, 10-20): what a STALL or a HANG prints, held outside the try so the catch can read it
  const dump = { pressAt: null, where: phase, boot: null, lastGood: null, cdp: { n: 0, lastAt: null, last: null }, page: [], store, commits, contexts };
  try {
    await sleep(700);
    c = await newSwPage(PORT2, cdp, { observer: false });
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // the binding before the hook and the first visit: it persists across navigations while Runtime stays enabled (as
    // newSwPage leaves it), and a handler error is caught here (the CDP client does not catch handler errors)
    c.onEvent((m, p) => {
      if (m !== 'Runtime.bindingCalled' || !p || p.name !== FORCED_BINDING) return;
      try { if (!forcedTake(store, JSON.parse(p.payload), { ctx: p.executionContextId })) diag.push('binding: an unusable payload'); } catch (e) { diag.push(`binding: ${String(e && e.message).slice(0, 80)}`); }
    });
    await c.send('Runtime.addBinding', { name: FORCED_BINDING });
    // each loader's DOMContentLoaded by loaderId (hang guard 1, no time matching)
    await c.send('Page.setLifecycleEventsEnabled', { enabled: true });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FORCED_DOC_RECORD });
    c.onEvent((m, p) => { if (m === 'ServiceWorker.workerVersionUpdated') for (const v of p.versions || []) runs.push({ t: Date.now(), id: v.versionId, st: v.runningStatus, status: v.status }); });
    // the dump's CDP view, from events only: whether events still arrive, and the main frame's lifecycle
    c.onEvent((m, p) => {
      dump.cdp.n += 1; dump.cdp.lastAt = Date.now(); dump.cdp.last = m;
      if (/^Page\.(frameNavigated|domContentEventFired|loadEventFired|frameStartedLoading|frameStoppedLoading)$/.test(m) && !(p && p.frame && p.frame.parentId)) {
        dump.page.push({ m: m.slice(5), t: Date.now() }); if (dump.page.length > 24) dump.page.shift();
      }
    });
    // the tab's main-frame lifecycle from CDP events (never an eval): the commits feed hang guard 1, and the verdict
    // waits for a main-frame navigation still in flight (a third document is recorded before judging)
    const boot = { frame: null, commit: 0, dcl: 0, started: 0, stopped: 0 };
    dump.boot = boot;
    c.onEvent((m, p) => {
      if (m === 'Page.frameNavigated' && p.frame && !p.frame.parentId) {
        boot.frame = p.frame.id; boot.commit = Date.now();
        commits.push({ t: boot.commit, url: p.frame.url || '', loaderId: p.frame.loaderId || null, dcl: null, dcl2: null });
      }
      // a loader's DOMContentLoaded belongs to the commit with that loaderId; the main-frame DOMContentLoaded event
      // (no loader id) to the latest commit, which it follows in the Page domain's own order
      else if (m === 'Page.lifecycleEvent' && p.name === 'DOMContentLoaded' && p.frameId === boot.frame) {
        const k = commits.find((x) => x.loaderId && x.loaderId === p.loaderId); if (k && k.dcl == null) k.dcl = Date.now();
      }
      // the main frame's main-world contexts, one per document, alive from creation to destruction
      else if (m === 'Runtime.executionContextCreated' && p.context && p.context.auxData && p.context.auxData.isDefault && p.context.auxData.frameId === boot.frame) {
        contexts.push({ id: p.context.id, t: Date.now(), end: null });
      }
      else if (m === 'Runtime.executionContextDestroyed') { const x = contexts.find((y) => y.id === p.executionContextId); if (x && x.end == null) x.end = Date.now(); }
      else if (m === 'Runtime.executionContextsCleared') { for (const x of contexts) if (x.end == null) x.end = Date.now(); }
      else if (m === 'Page.domContentEventFired') { boot.dcl = Date.now(); const k = commits[commits.length - 1]; if (k && k.dcl2 == null) k.dcl2 = boot.dcl; }
      else if (m === 'Page.frameStartedLoading' && p.frameId === boot.frame) boot.started = Date.now();
      else if (m === 'Page.frameStoppedLoading' && p.frameId === boot.frame) boot.stopped = Date.now();
    });
    const navSettled = async () => { const t0 = Date.now(); while (boot.started > Math.max(boot.commit, boot.stopped) && Date.now() - t0 < STALL_MS) await sleep(100); };
    await c.send('ServiceWorker.enable');
    // A's lab bytes: after launchChrome's served-tree preflight, before the first visit
    const labA = forcedLabBytes(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), 'A');
    if (labA.invalid) { fail(`[${tag}] INVALID: ${labA.invalid}`); return; }
    fs.writeFileSync(path.join(root, 'sw.js'), labA.sw);
    const url = `http://127.0.0.1:${PORT2}/app.html?sw=1&u=3g-${tag}`;
    const visit = async (u) => {
      await c.eval('(window.__obNavOld = true), true').catch(() => {});
      await c.send('Page.navigate', { url: u });
      const t0 = Date.now(); let q = null;
      while (Date.now() - t0 < 120000) {
        q = await c.eval(`window.__obNavOld === true ? null : ${SW_PROBE}`).catch(() => null);
        if (q?.ready && q?.controller) return q;
        await sleep(400);
      }
      return q;
    };
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.length !== 1) { fail(`[${tag}] generation A never activated (${JSON.stringify(p1?.reg)})`); return; }
    const tSetup0 = Date.now();
    let p = await visit(`${url}-a`);
    if (!p?.controller || p.keys.length !== 1) { fail(`[${tag}] the second visit must be controlled with one cache: ${JSON.stringify(p && { c: p.controller, k: p.keys })}`); return; }
    // the deploy: B = the manifest marker, app.html with one comment byte and ITS id (computed above, before anything
    // was written), app-loop.html (B's app.html under a rewritten id) as a boot entry, '-b'
    const swA = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const markA = fs.readFileSync(path.join(root, MARK));
    const j = JSON.parse(markA.toString('utf8')); j.ob_generation = 'b';
    const markB = Buffer.from(JSON.stringify(j, null, 2) + '\n');
    const loopHtml = genB.text.replace(`data-ob-html="${idB}"`, `data-ob-html="${idB.slice(0, 11)}${idB.endsWith('0') ? '1' : '0'}"`);
    const row = (u, bytes) => `['./${u}', '${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}', ${bytes.length}]`;
    const reRow = (sw, u, bytes) => { const re = new RegExp(`\\['\\./${u.replace(/[.]/g, '\\.')}', '[0-9a-f]{16}', \\d+\\]`); return re.test(sw) ? sw.replace(re, row(u, bytes)) : null; };
    let swB = reRow(swA, MARK, markB);
    swB = swB && reRow(swB, 'app.html', Buffer.from(genB.text));
    if (!swB || !/const PRECACHE = \[\n/.test(swB) || !/const VERSION = '[^']+';/.test(swB)) { fail(`[${tag}] INVALID: a manifest, app.html, PRECACHE or VERSION anchor is missing in sw.js`); return; }
    swB = swB.replace(/const PRECACHE = \[\n/, `const PRECACHE = [\n  ${row('app-loop.html', Buffer.from(loopHtml))},\n`)
      .replace(/const VERSION = '([^']+)';/, "const VERSION = '$1-b';");
    const labB = forcedLabBytes(swB, 'B', { activateDelayMs });
    if (labB.invalid) { fail(`[${tag}] INVALID: ${labB.invalid}`); return; }
    const aMtime = fs.statSync(path.join(root, 'sw.js')).mtimeMs;
    fs.writeFileSync(path.join(root, MARK), markB);
    fs.writeFileSync(path.join(root, 'app.html'), genB.text);
    fs.writeFileSync(path.join(root, 'app-loop.html'), loopHtml);
    fs.writeFileSync(path.join(root, 'sw.js'), labB.sw);
    const later = new Date(Math.max(Date.now(), aMtime + 2000));
    fs.utimesSync(path.join(root, 'sw.js'), later, later);
    p = await visit(`${url}-b`);
    const tW = Date.now();
    while (Date.now() - tW < 180000 && !(p?.reg?.waiting === 'installed')) { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (p?.reg?.waiting !== 'installed') { fail(`[${tag}] generation B never reached waiting: ${JSON.stringify(p?.reg)}`); return; }
    const setupMs = Date.now() - tSetup0;
    // A's fill complete before the press (its kick then adds no work to A at the belt navigation); A's cache is the
    // one name at A's activation (scope-tagged since #1169), and it carries A's VERSION
    const vA = (swA.match(/const VERSION = '([^']+)';/) || [])[1];
    const cacheA = p1.keys[0];
    if (!vA || !cacheA.endsWith(`-${vA}`)) { fail(`[${tag}] INVALID: A's cache ${cacheA} does not carry A's VERSION ${vA}`); return; }
    const want = (swA.match(/^ {2}\['\.\.?\//gm) || []).length; const tF = Date.now(); let have = null;
    while (Date.now() - tF < FORCED_FILL_MS) {
      have = await boundedEval(c, `caches.open(${JSON.stringify(cacheA)}).then((k) => k.keys()).then((k) => k.length)`, 'the pre-press fill gate').catch((e) => { if (e instanceof Stall) throw e; return null; });
      if (have != null && have >= want) break; await sleep(1000);
    }
    if (!(have >= want)) { fail(`[${tag}] INVALID: A's fill incomplete at the press (${have}/${want} after ${FORCED_FILL_MS / 1000} s)`); return; }
    const fillWaitMs = Date.now() - tF;
    // the second tab (it fires the forcing fetch)
    t2 = await openSecondPage(cdp, `${url}-t2`);
    { const t0 = Date.now(); let q = null;
      while (Date.now() - t0 < 120000) { q = await t2.eval(SW_PROBE).catch(() => null); if (q?.ready && q?.controller) break; await sleep(400); }
      if (!q?.controller) { fail(`[${tag}] the second tab never booted controlled`); return; } }
    // the pressing page is A's: its id, a clean record store
    const pre = await boundedEval(c, `(() => { for (const k of Object.keys(sessionStorage)) if (k.startsWith(${JSON.stringify(FORCED_DOC_KEY)})) sessionStorage.removeItem(k);
      sessionStorage.removeItem(${JSON.stringify(FORCED_REPAIR_KEY)});
      return { id: document.documentElement.dataset.obHtml || null, ctl: !!navigator.serviceWorker.controller }; })()`, 'the pre-press id read');
    if (pre.id !== idA || !pre.ctl) { fail(`[${tag}] INVALID: the pressing page must be controlled and carry A's id ${idA}: ${JSON.stringify(pre)}`); return; }
    // the forced hold: stop A, warm B, a second-tab fetch restarts A (its start lengthened), press during it
    const latest = (pred) => { for (let i = runs.length - 1; i >= 0; i--) if (pred(runs[i])) return runs[i]; return null; };
    const aV = latest((r) => r.status === 'activated'), bV = latest((r) => r.status === 'installed');
    if (!aV || !bV) { fail(`[${tag}] INVALID: the worker versions are not known (A ${aV && aV.id}, B ${bV && bV.id})`); return; }
    const ts = Date.now();
    const stopErr = await c.send('ServiceWorker.stopWorker', { versionId: aV.id }).then(() => null, (e) => e.message);
    let st = null; while (Date.now() - ts < 10000) { st = runs.find((r) => r.t >= ts && r.id === aV.id && r.st === 'stopped'); if (st) break; await sleep(20); }
    await c.eval(`navigator.serviceWorker.getRegistration().then((r) => { if (r && r.waiting) r.waiting.postMessage({ ob: 'swforced-ping' }); return true; })`).catch(() => {});
    const tb = Date.now(); let bRun = null; while (Date.now() - tb < 10000) { const n = latest((r) => r.id === bV.id); bRun = n && n.st === 'running' ? n : null; if (bRun) break; await sleep(20); }
    if (!st || !bRun) { fail(`[${tag}] INVALID: the hold was not set up (A stopped ${!!st}${stopErr ? ` (${stopErr})` : ''}, B running ${!!bRun})`); return; }
    // the Reload button, read right before the press (the page has not moved since)
    const RELOAD = `(() => { const b = document.querySelector('#ob-update .ob-prompt__actions .ob-btn'); if (!b || !b.getClientRects().length) return null;
      const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`;
    const box = await boundedEval(c, RELOAD, 'the Reload button read');
    if (!box) { fail(`[${tag}] no update notice while B waits`); return; }
    // the forcing fetch restarts A (its start lengthened) and arms the hold; the press waits for A's restart (the CDP
    // event; A already up when something else woke it), then lands during A's start
    const tKick = Date.now();
    await t2.eval(`(fetch('./manifest.webmanifest?${FORCED_HOLD_TOKEN}').catch(() => {}), true)`).catch(() => {});
    const aIsUp = (r) => !!r && (r.st === 'starting' || r.st === 'running');
    let aUp = latest((r) => r.id === aV.id); if (!aIsUp(aUp)) aUp = null;
    while (!aUp && Date.now() - tKick < 10000) { await sleep(20); const l = latest((r) => r.id === aV.id); if (aIsUp(l) && l.t >= tKick) aUp = l; }
    if (!aUp) { fail(`[${tag}] INVALID: the forcing fetch did not restart A within 10 s`); return; }
    const restartMs = aUp.t - tKick;
    await sleep(150);
    const pressAt = Date.now();
    phase = 'after the press';
    dump.pressAt = pressAt; dump.where = 'the press check';
    const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    // every eval from here is bounded and recorded; none touches the registration or CacheStorage
    const ev = (expr, step) => { const t0 = Date.now(); return boundedEval(c, expr, step).finally(() => evals.push(`${step}@${at(t0, pressAt)}+${Date.now() - t0}`)); };
    // the press landed: the page goes inert at once (the Reload handler's first statement)
    const inert = await ev('!!(document.body && document.body.inert)', 'the press check').catch((e) => { if (e instanceof Stall) throw e; return null; });
    if (inert !== true) { fail(`[${tag}] the Reload press did not land (the page is not inert: ${JSON.stringify(inert)})`); return; }
    // B's activate: the CDP event, never an eval; over the bound ends the leg (a pre-existing term, named)
    dump.where = "B's activate";
    let bAct = null, bDone = null;
    while (Date.now() - pressAt < FORCED_ACTIVATE_MS) {
      bAct = bAct || runs.find((r) => r.t >= pressAt && r.id === bV.id && r.status === 'activating');
      bDone = runs.find((r) => r.t >= pressAt && r.id === bV.id && r.status === 'activated');
      if (bDone) break; await sleep(50);
    }
    if (!bDone) { fail(`[${tag}] B's activate exceeded ${FORCED_ACTIVATE_MS / 1000} s after the press (a pre-existing term; activating ${at(bAct?.t, pressAt)} ms)`); return; }
    // the records come from the binding's events (#1173 rev 5: no eval, so no record read can stall); every look runs
    // the hang guards first, and a tripped guard ends the leg as a named HANG
    let lastGood = null; let hang = { why: null, dclMax: null, silenceMax: null, unmatched: 0, unaccounted: [] };
    const docsNow = async () => {
      hang = forcedHangCheck(store, { pressAt, commits, contexts, now: Date.now() });
      if (hang.why) throw new Hang(hang.why);
      const d = forcedDocs(store);
      lastGood = d; dump.lastGood = d; return d;
    };
    // a record of its own for every main-frame commit after the press (about:blank excluded), waited for at most 3 s (a
    // commit's first push follows it); a commit still without one is a named FAIL (review P2 on cd4fce09: a late push
    // must never leave an extra document uncounted)
    const docsSettled = async (where) => {
      for (let i = 0; i < 3; i++) {
        await docsNow();
        if (!hang.unmatched) return;
        await sleep(1000);
      }
      // a last look after the last wait, so a record that arrived during it counts and lastGood holds it (review P2 on
      // 9ab5caf3)
      await docsNow();
      if (!hang.unmatched) return;
      fail(`[${tag}] an unaccounted document ${where}: ${hang.unmatched} main-frame commit(s) after the press without a record of their own after 3 s (${hang.unaccounted.map((u) => `+${u.t - pressAt} ms ${String(u.url).replace(/^https?:\/\/[^/]+/, '')}`).join(', ').slice(0, 300)})`);
    };
    // settled: B's document present and the store unchanged over two looks 1 s apart, or the repair bound past the
    // swapped document's response (+ 2 s), or FORCED_ACTIVATE_MS after 'activated' at most
    dump.where = 'the settle';
    let prev = null; const tR = Date.now();
    while (Date.now() - tR < FORCED_ACTIVATE_MS) {
      const d = await docsNow();
      if (d) {
        const after = d.filter((x) => x.to >= pressAt - 50);
        const stable = prev && d.length === prev.length && d.length && d[d.length - 1].rs != null;
        if (stable && after.some((x) => x.id === idB)) break;
        const d1 = after[0];
        if (stable && d1 && d1.rs != null && Date.now() > d1.to + d1.rs + FORCED_REPAIR_MS + 2000) break;
      }
      prev = d; await sleep(1000);
    }
    const P0 = Math.round(pressAt);
    let r = classifyForced(lastGood || [], { idA, idB, pressAt: P0 });
    let ctlId;
    if (r.cls === 'NEEDS-CTL') {
      dump.where = 'the controller read';
      const t = await ev(`fetch(new URL('app.html', location.href)).then((x) => x.text())`, 'the stale page controller read')
        .catch((e) => { if (e instanceof Stall) throw e; return { err: String(e.message || e).slice(0, 120) }; });
      if (t && typeof t === 'object') r = { cls: 'INVALID', why: `the stale page's controller read failed: ${t.err}`, doc1: r.doc1 };
      else {
        ctlId = (typeof t === 'string' && t.match(/^<html\b[^>]*?\sdata-ob-html="([0-9a-f]*)"/m) || [])[1] ?? null;
        // a repair document that started after the settle's cut is judged as well (over its bound: a FAIL, never a
        // SILENT-SWAP)
        await navSettled();
        await docsSettled('after the controller read');
        r = classifyForced(lastGood || [], { idA, idB, pressAt: P0, ctlId });
      }
    }
    // REPAIRED holds only if no third main-phase document follows: watch the store until the repair bound past the
    // repair document's own response (+ 2 s), the window the swapped document got, then judge again
    if (r.cls === 'REPAIRED') {
      dump.where = 'the late watch';
      const until = r.doc2.to + (r.doc2.rs ?? 0) + FORCED_REPAIR_MS + 2000;
      while (Date.now() < until) { await sleep(1000); await docsNow(); }
      await navSettled();
      await docsSettled('after the late watch');
      r = classifyForced(lastGood || [], { idA, idB, pressAt: P0 });
    }
    const docs = lastGood || [];
    const aDoc = r.doc1 && r.doc1.rs != null ? r.doc1.to + r.doc1.rs : null;
    const result = { cls: r.cls, why: r.why, idA, idB, repairMs: r.repairMs ?? null, repairFromAnswerMs: r.fromAnswer ?? null, ctlId: ctlId ?? null, setupMs, fillWaitMs,
      vis: [...new Set(docs.filter((d) => d.to >= pressAt - 50).map((d) => d.vis ?? null))], bind: [...new Set(docs.filter((d) => d.to >= pressAt - 50).map((d) => d.b ?? null))],
      phDirect: `${docs.filter((d) => d.to >= pressAt - 50 && d.ph != null && store.phDirect.has(d.to)).length}/${docs.filter((d) => d.to >= pressAt - 50 && d.ph != null).length}`,
      activateDelayMs, restartMs, activateMs: at(bDone.t, bAct?.t ?? null), pressToActivated: at(bDone.t, pressAt), swapGapDiag: bAct && aDoc ? bAct.t - aDoc : null, evals,
      docs: docs.filter((d) => d.to >= pressAt - 50).map((d) => `${d.to - P0}+${d.rs}:${d.id}${d.cc ? '/cc' : ''}${d.ctl ? '/ctl' : ''}${d.pair ? `/pair=${d.pair}` : ''}`) };
    if (r.cls === 'INVALID') fail(`[${tag}] INVALID: forced swap not reproduced: ${r.why}`);
    else if (r.cls === 'SILENT-SWAP') fail(`[${tag}] silent swap: A's document stays under B with no controllerchange (its controller answers B's id ${ctlId})`);
    else if (r.cls === 'FAIL') fail(`[${tag}] ${r.why}`);
    // the loop control: a page whose id the controller's snapshot never matches repairs ONCE, then stops; and no late
    // document of the main phase appears meanwhile (n0 = the set the verdict read)
    if (r.cls === 'REPAIRED') {
      const n0 = docs.length;
      const loopAt = Date.now();
      dump.where = 'the app-loop commit';
      // the watch runs from the navigation's commit: a commit slowed by the host (20.5 s once, round 4) must not eat the
      // repair's window; the commit itself is bounded (over it: a named STALL)
      let navTimer = null;
      await Promise.race([c.send('Page.navigate', { url: `http://127.0.0.1:${PORT2}/app-loop.html?sw=1&u=3g-${tag}-loop` }),
        new Promise((_, rej) => { navTimer = setTimeout(() => rej(new Stall('the app-loop navigation did not commit within 60 s')), 60000); })])
        .finally(() => clearTimeout(navTimer));
      const loopT0 = Date.now(); result.loopNavMs = loopT0 - loopAt;
      dump.where = 'the loop watch';
      let closed = false;
      while (Date.now() - loopT0 < FORCED_LOOP_WATCH_MS) {
        const d = await docsNow(); const k = d ? d.filter((x) => x.to >= loopAt - 50).length : 0;
        if (k >= FORCED_LOOP_CLOSE) { await c.send('Page.navigate', { url: 'about:blank' }).catch(() => {}); closed = true; break; }
        await sleep(1000);
      }
      if (!closed) await docsSettled('after the loop watch');
      const ld = lastGood || [];
      const loopDocs = ld.filter((d) => d.to >= loopAt - 50);
      const mainDocs = ld.filter((d) => d.to < loopAt - 50).length;
      result.loop = loopDocs.map((d) => `${d.id}${d.pair ? `/pair=${d.pair}` : ''}`);
      if (mainDocs !== n0) fail(`[${tag}] a late document appeared after the settle (${mainDocs} main-phase records, ${n0} at the settle)`);
      if (loopDocs.length > 2) fail(`[${tag}] loop: ${loopDocs.length} documents within ${FORCED_LOOP_WATCH_MS / 1000} s on a page whose id the snapshot never matches (want exactly 2: one repair reload)`);
      else if (loopDocs.length < 2) fail(`[${tag}] the app-loop page was not repaired once (${loopDocs.length} document)`);
    }
    const largest = evals.reduce((m, e) => Math.max(m, Number(e.split('+').pop())), 0);
    log(`[${tag}] SWFORCED RESULT ${JSON.stringify({ ...result, largestEvalMs: largest, dclMaxMs: hang.dclMax, silenceMaxMs: hang.silenceMax, diag: diag.slice(-4) })}`);
    if (!failed) log(`[${tag}] OK: the forced take-over left A's page under B and verifyGeneration repaired it once (${r.fromAnswer} ms after its response); the loop control repaired once and stopped`);
  } catch (e) {
    if (!(e instanceof Stall) && !(e instanceof Hang)) throw e;
    log(`[${tag}] SWFORCED STALL-DUMP ${JSON.stringify(forcedStallDump(dump, { step: e.message, phase, evals, diag, runs, now: Date.now() }))}`);
    fail(`[${tag}] ${e instanceof Hang ? 'HANG' : 'STALL'} ${phase}: ${e.message}`);
  } finally {
    if (t2) await t2.close();
    if (c) c.close();
    await stopStaticServer(server);
    rmTree(root);
  }
}

// ---- #1169: generation names carry the registration's scope ----------------------------------------------------
// Cache Storage is per origin, and one origin can hold two registrations of the app. Each leg serves a scratch
// mirror on PORT + 1 and stops it for its offline boots (no network at all, not an emulated one). A name from before
// scope tags is never deleted, nor any entry of it, by any sweep: one worker cannot prove whose it is.

// every ob-sw* name (both forms) with its entry count; a name is opened only after caches.keys() listed it
const SW_NAMES = `(async () => { const out = {};
  for (const k of (await caches.keys()).filter((k) => k.startsWith('ob-sw'))) out[k] = (await (await caches.open(k)).keys()).length;
  return out; })()`;
// a scope-tagged name; it does not start with 'ob-sw-', the sweep filter of every worker from before scope tags
const SCOPED_RE = /^ob-sws-([0-9a-f]{8})-/;
// every manifest URL (boot and fill, above-scope ones included) as the worker at origin/dir resolves it ('' = the
// origin's root)
const resolvedAt = (man, origin, dir) => man.boot.concat(man.fill).map((u) => new URL(u, `${origin}/${dir}sw.js`).href);
// the URLs of urls the cache name does not hold: null when the name is gone (it is opened only after caches.keys()
// listed it), { err } when the census failed
const lostIn = (c, name, urls) => c.eval(`(async () => { const q = ${JSON.stringify(name)};
  if (!(await caches.keys()).includes(q)) return null;
  const have = new Set((await (await caches.open(q)).keys()).map((r) => r.url));
  return ${JSON.stringify(urls)}.filter((u) => !have.has(u)); })()`).catch((e) => ({ err: String(e).slice(0, 120) }));
// a lostIn answer in words: why the name does not hold urls, or null when it holds every one
const lossOf = (lost, urls) => (lost === null ? 'was deleted' : lost.err ? `census failed (${lost.err})`
  : lost.length ? `lost ${lost.length} of ${urls.length} entries, first ${lost[0]}` : null);

/** lostIn polled until the name holds every URL (bounded); the last answer */
async function holdsAll(c, name, urls, ms = 180000) {
  const t0 = Date.now(); let lost = null;
  while (Date.now() - t0 < ms) {
    lost = await lostIn(c, name, urls);
    if (Array.isArray(lost) && !lost.length) break;
    await sleep(500);
  }
  return lost;
}

/** a check, named by its step, that the pre-scope cache name still holds every URL of each registration in regs
 * ({ who: urls }); a deleted name is one fail line */
const keepsEvery = (c, fail, tag, name, regs) => async (at) => {
  for (const [who, urls] of Object.entries(regs)) {
    const lost = await lostIn(c, name, urls);
    if (lost === null) { fail(`[${tag}] ${at}: the pre-scope cache ${name} was deleted (a name from before scope tags is never deleted)`); return; }
    const why = lossOf(lost, urls);
    if (why) fail(`[${tag}] ${at}: ${who}'s entries in the pre-scope cache ${name}: ${why} (no entry of a name from before scope tags is ever deleted)`);
  }
};

// the fill-end sweeps a document hears, from its start: a sweep no page asked for broadcasts {ob:'swept'} to every
// window client of the origin, the fill end's included
const FILL_END_REC = `(() => { const R = window.__obFillEnds = []; if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => { const d = e.data;
    if (d && d.ob === 'swept' && d.why === 'fill end') R.push({ version: d.version, removed: d.removed, deferred: d.deferred }); }); })()`;

/** the fill-end sweep of the worker of `version`, as the current document heard it (bounded): its broadcast, or null.
 * Each worker life runs one: a cold start's first fetch kicks the fill 2.5 s later, and a complete fill ends at once. */
async function fillEndHeard(c, version, ms = 60000) {
  const t0 = Date.now(); const q = JSON.stringify(version);
  while (Date.now() - t0 < ms) {
    const got = await c.eval(`(window.__obFillEnds || []).find((x) => x.version === ${q}) || null`).catch(() => null);
    if (got) return got;
    await sleep(250);
  }
  return null;
}
/** fillEndHeard on a worker life that must run one (a cold start): no broadcast is a fail line */
async function fillEnded(c, fail, tag, who, version) {
  const got = await fillEndHeard(c, version);
  if (!got) fail(`[${tag}] no fill-end {ob:'swept'} from ${who}'s worker (${version}) within 60 s`);
  return got;
}

/** the previous version's sweeps on the current page (its navigation sweep, then a client ask answered once its sweep
 * is done) leave the new snapshot name whole: a worker from before scope tags takes every other name that starts with
 * 'ob-sw-', and a scope-tagged name starts with 'ob-sws-'. Returns the answer's removed count and the census. */
async function oldSweepsSpare(c, fail, tag, who, name, total) {
  const ask = await sweptAfterAsk(c, `${tag}-old-${Date.now()}`);
  if (!ask.answer) fail(`[${tag}] ${who}'s previous-version worker gave no {ob:'swept'} answer within ${SWEPT_MS / 1000} s${ask.err ? ` (${ask.err})` : ''}`);
  const n = await c.eval(SW_NAMES).catch((e) => ({ err: String(e).slice(0, 120) }));
  if (n.err) fail(`[${tag}] the census after ${who}'s previous-version sweeps failed (${n.err})`);
  else if (!(name in n)) fail(`[${tag}] ${who}'s previous-version sweeps deleted the new snapshot ${name} (a worker from before scope tags takes every other name that starts with 'ob-sw-')`);
  else if (n[name] !== total) fail(`[${tag}] ${who}'s previous-version sweeps left the new snapshot ${name} with ${n[name]}/${total}`);
  return { removed: ask.answer?.removed, census: n };
}

/** a second app tree at root/dir: every top-level web/ entry symlinked (as mirrorTree), its own sw.js bytes, so
 * /dir/app.html registers /dir/sw.js under the scope /dir/ */
function scopeTree(root, dir, sw) {
  const at = path.join(root, dir);
  fs.mkdirSync(at);
  for (const name of fs.readdirSync(WEB_DIR)) {
    if (name === 'node_modules' || /\.png$/.test(name)) continue;
    if (name === 'sw.js') fs.writeFileSync(path.join(at, name), sw);
    else fs.symlinkSync(path.join(WEB_DIR, name), path.join(at, name));
  }
}

/** one name's entry count, polled until it reaches want (bounded); -1 while the name does not exist */
async function filledTo(c, name, want, ms = 180000) {
  const t0 = Date.now(); let n = -1;
  const q = JSON.stringify(name);
  while (Date.now() - t0 < ms) {
    n = await c.eval(`caches.has(${q}).then(async (h) => (h ? (await (await caches.open(${q})).keys()).length : -1))`).catch(() => n);
    if (n >= want) break;
    await sleep(500);
  }
  return n;
}

/** a navigation answered by a new document that is ready, controlled and in the hall (bounded); the last probe */
async function controlledVisit(c, u, ms = 120000) {
  await c.eval('(window.__obNavOld = true), true').catch(() => {});
  await c.send('Page.navigate', { url: u });
  const t0 = Date.now(); let p = null;
  while (Date.now() - t0 < ms) {
    p = await c.eval(`window.__obNavOld === true ? null : ${SW_PROBE}`).catch(() => null);
    if (p?.ready && p?.controller && p?.shellOpen) return p;
    await sleep(400);
  }
  return p;
}

/** every running worker of the origin stopped (each by its version, bounded), so the next navigation starts its worker
 * cold and opens its snapshot BY NAME: a live worker answers from the Cache it opened earlier, even after that name
 * was deleted (the base-sw plant's offline boot passed on a deleted snapshot that way). Returns the versions still
 * not stopped. */
async function stopWorkers(ctl, c) {
  const live = () => [...ctl.versions.values()].filter((v) => v.runningStatus !== 'stopped');
  for (const v of live()) await c.send('ServiceWorker.stopWorker', { versionId: v.versionId }).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < 10000 && live().length) await sleep(100);
  return live().map((v) => `${v.versionId}:${v.runningStatus}`);
}

/** leg swscope (#1169): two registrations of the app on one origin, the sibling scopes /sa/ (A) and /sb/ (B), each
 * under its own VERSION (one VERSION would be one shared name without scope tags, which no sweep deletes). Each
 * generation name is ob-sws-<8-hex scope hash>-<VERSION>, one hash per scope. A activates and fills; a copy of A's
 * boot set re-keyed under /sb/nested/, under a name from before scope tags, stands for a registration NESTED in B's
 * scope that still runs pre-scope code (a dev server's inner layout): its URLs lie under B's scope, and no sweep of
 * B's takes the name or any entry of it. B installs, activates (its activate sweep) and fills (its fill-end sweep,
 * heard by B's page): A's snapshot and that copy stay whole. Then, with every worker stopped first, a controlled page
 * in each scope cold-starts its own worker (its navigation sweep), asks its sweep ({ob:'fill'}, answered
 * {ob:'swept'}) and hears its fill-end sweep: both snapshots stay whole, and so does an EMPTY name under the other
 * scope's prefix made just before (newer than both snapshots: only the prefix rule spares it). With the server
 * stopped and every worker stopped (a cold start opens the snapshot by name), a page in each scope boots from its own
 * snapshot, and its worker's fill-end sweep spares the rest. RED on the base bytes: B's activate deleted A's snapshot
 * (every other ob-sw-* name was an older generation of B's), and A's cold offline boot fails. */
export async function legSwScope({ PORT, cdp, fail: gateFail, log = console.log }) {
  const tag = 'swscope-desktop';
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const sw = fs.readFileSync(path.join(WEB_DIR, 'sw.js'), 'utf8');
  const v = (sw.match(/const VERSION = '([^']+)';/) || [])[1];
  if (!v) { fail(`[${tag}] INVALID: no VERSION line in sw.js`); return; }
  const PORT2 = PORT + 1;
  const root = mirrorTree([]); // the origin's root (launchChrome's served-tree preflight); never registered
  for (const s of ['sa', 'sb']) scopeTree(root, s, sw.replace(/const VERSION = '([^']+)';/, `const VERSION = '$1-${s}';`));
  const server = spawnStaticServer(root, PORT2);
  let up = true; let c = null; let b = null;
  const url = (s, q) => `http://127.0.0.1:${PORT2}/${s}/app.html?sw=1&u=3g-${tag}-${q}`;
  let n = {};
  const census = async () => { n = await c.eval(SW_NAMES).catch((e) => ({ err: String(e).slice(0, 120) })); return n; };
  const whole = (k, who, at) => { if (n[k] !== total) fail(`[${tag}] ${at}: ${who}'s snapshot ${k} ${n[k] == null ? 'was deleted' : `holds ${n[k]}/${total}`} (another scope's names are never swept)`); };
  try {
    await sleep(700);
    c = await newSwPage(PORT2, cdp, { phone: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FILL_END_REC });
    const ctl = await swControl(c); // the worker versions, from the start
    b = await attachBrowserSession(cdp, { log, pump: true }); // pump: the offline boots restart stopped workers (#1161)
    // A: /sa/ activates and fills
    await c.send('Page.navigate', { url: url('sa', 'a') });
    const pa = await waitActivated(c, `${tag} A`, log);
    if (!pa || !isActivated(pa) || pa.keys.length !== 1) { fail(`[${tag}] INVALID: A never activated alone (${JSON.stringify(pa?.reg)} keys=${pa?.keys})`); return; }
    const nameA = pa.keys[0];
    const fillA = await filledTo(c, nameA, total);
    if (fillA < total) { fail(`[${tag}] INVALID: A's fill incomplete (${fillA}/${total})`); return; }
    // the nested pre-scope copy: A's boot entries re-keyed under /sb/nested/, under ob-sw-<VERSION>-pre-sa
    const preA = `ob-sw-${v}-pre-sa`;
    const bootA = man.boot.map((u) => new URL(u, `http://127.0.0.1:${PORT2}/sa/sw.js`).href);
    const preN = await c.eval(`(async () => { const s = await caches.open(${JSON.stringify(nameA)}), d = await caches.open(${JSON.stringify(preA)}); let k = 0;
      for (const u of ${JSON.stringify(bootA)}) { const x = await s.match(u); if (x) { await d.put(u.replace('/sa/', '/sb/nested/'), x); k++; } } return k; })()`).catch(() => -1);
    if (preN !== bootA.length) { fail(`[${tag}] INVALID: the pre-scope copy holds ${preN} of A's ${bootA.length} boot entries`); return; }
    const keepsPre = (at) => { if (n[preA] !== preN) fail(`[${tag}] ${at}: another registration's pre-scope snapshot ${preA} ${n[preA] == null ? 'was deleted' : `holds ${n[preA]}/${preN}`} (a name from before scope tags is never swept, nor any entry of it)`); };
    // B: /sb/ is outside A's scope (an uncontrolled first visit); B installs and activates
    await c.send('Page.navigate', { url: url('sb', 'b') });
    const pb = await waitActivated(c, `${tag} B`, log);
    if (!pb || !isActivated(pb)) { fail(`[${tag}] INVALID: B never activated (${JSON.stringify(pb?.reg)})`); return; }
    await census();
    log(`[${tag}] after B's activate: ${JSON.stringify(n)}`);
    const nameB = Object.keys(n).find((k) => k !== nameA && k.endsWith(`-${v}-sb`));
    if (!nameB) { fail(`[${tag}] INVALID: no B name in ${JSON.stringify(n)}`); return; }
    const hash = (k) => (k.match(SCOPED_RE) || [])[1] || null;
    if (!nameA.endsWith(`-${v}-sa`) || !hash(nameA) || !hash(nameB) || hash(nameA) === hash(nameB)) {
      fail(`[${tag}] each generation name must be ob-sws-<8-hex scope hash>-<VERSION>, one hash per scope: A ${nameA}, B ${nameB}`);
    }
    whole(nameA, 'A', "B's activate"); keepsPre("B's activate");
    // B's fill completes (its fill-end sweep)
    const fillB = await filledTo(c, nameB, total);
    if (fillB < total) { fail(`[${tag}] INVALID: B's fill incomplete (${fillB}/${total})`); return; }
    await fillEnded(c, fail, tag, 'B', `${v}-sb`); // B's page, open since before B's install, hears it
    await census();
    whole(nameA, 'A', "B's fill end"); keepsPre("B's fill end");
    // each scope's later sweeps, every worker stopped first (so no other worker sweeps meanwhile): a controlled page
    // cold-starts the scope's worker (the navigation sweep), its own {ob:'fill'} is answered, its fill-end sweep is
    // heard; an empty name under the OTHER scope's prefix, made just before, must survive them (only the prefix rule
    // spares it)
    for (const [s, other] of [['sa', nameB], ['sb', nameA]]) {
      const left = await stopWorkers(ctl, c);
      if (left.length) { fail(`[${tag}] INVALID: workers still running before /${s}/'s later sweeps: ${left.join(', ')}`); return; }
      const emptyOther = `${(other.match(SCOPED_RE) || ['ob-sw-'])[0]}0.1.0+empty-${s === 'sa' ? 'sb' : 'sa'}`;
      if ((await c.eval(`caches.open(${JSON.stringify(emptyOther)}).then(() => true)`).catch(() => false)) !== true) { fail(`[${tag}] INVALID: ${emptyOther} not made`); return; }
      const p = await controlledVisit(c, url(s, 'later'));
      if (!p?.controller) { fail(`[${tag}] INVALID: the /${s}/ page is not controlled (${JSON.stringify(p?.reg)})`); return; }
      const ask = await sweptAfterAsk(c, `${tag}-${s}-${Date.now()}`);
      if (!ask.answer) fail(`[${tag}] no {ob:'swept'} answer in /${s}/ within ${SWEPT_MS / 1000} s${ask.err ? ` (${ask.err})` : ''}`);
      const fe = await fillEnded(c, fail, tag, s === 'sa' ? 'A' : 'B', `${v}-${s}`);
      await census();
      log(`[${tag}] after /${s}/'s later sweeps (client: removed ${ask.answer?.removed}, deferred ${JSON.stringify(ask.answer?.deferred)}; fill end: removed ${fe?.removed}, deferred ${JSON.stringify(fe?.deferred)}): ${JSON.stringify(n)}`);
      whole(nameA, 'A', `/${s}/'s later sweeps`); whole(nameB, 'B', `/${s}/'s later sweeps`); keepsPre(`/${s}/'s later sweeps`);
      if (n[emptyOther] !== 0) fail(`[${tag}] /${s}/'s later sweeps: another scope's empty name ${emptyOther} ${n[emptyOther] == null ? 'was deleted' : `holds ${n[emptyOther]}`} (another scope's names are never swept)`);
    }
    // offline: the server stops; every worker stops before each boot, so each boots cold from its snapshot by name
    await stopStaticServer(server); up = false;
    for (const s of ['sa', 'sb']) {
      const left = await stopWorkers(ctl, c);
      if (left.length) { fail(`[${tag}] INVALID: workers still running before the offline /${s}/ boot: ${left.join(', ')}`); return; }
      const p = await controlledVisit(c, url(s, 'offline'));
      log(`[${tag}] offline /${s}/: ready ${p?.ready} controller ${p?.controller} hall ${p?.shellOpen}`);
      if (!p?.ready || !p?.controller || !p?.shellOpen) fail(`[${tag}] with the server gone the /${s}/ page must boot from its snapshot (ready, controlled, in the hall): ${JSON.stringify(p && { ready: p.ready, controller: p.controller, hall: p.shellOpen, keys: p.keys })}`);
      else await fillEnded(c, fail, tag, s === 'sa' ? 'A' : 'B', `${v}-${s}`);
    }
    await census();
    whole(nameA, 'A', 'offline'); whole(nameB, 'B', 'offline'); keepsPre('offline');
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    if (!failed) log(`[${tag}] OK: ${nameA}, ${nameB} and the pre-scope ${preA} stay whole through B's activate and fill end and each scope's later sweeps (navigation, client, fill end; each sparing the other scope's empty name); both scopes boot offline from a cold worker, whose fill-end sweeps spare the rest`);
  } finally { if (b) b.close(); if (c) c.close(); if (up) await stopStaticServer(server); rmTree(root); }
}

/** the previous version for the upgrade checks: sw's bytes with the names from before scope tags (CACHE =
 * 'ob-sw-' + VERSION; the sweep loop's first line, the scope skip, gives way to the one old skip line: every other
 * ob-sw-* name is this registration's) under VERSION + '-legacy'; { invalid } when an anchor is missing or the
 * transformed sweep loop still reads PREFIX */
export function legacyBytes(sw) {
  const cache = 'const CACHE = `${PREFIX}${VERSION}`;';
  const skip = /^( {4}for \(const \[i, n\] of names\.entries\(\)\) \{\n) {6}if \(n === CACHE \|\| .*\) continue;.*\n/m;
  const ver = /const VERSION = '([^']+)';/;
  if (sw.split(cache).length !== 2 || !skip.test(sw) || !ver.test(sw)) return { invalid: 'the CACHE, sweep-skip or VERSION anchor is missing in sw.js' };
  const out = sw.replace(cache, 'const CACHE = `ob-sw-${VERSION}`;')
    .replace(skip, "$1      if (!n.startsWith('ob-sw-') || n === CACHE) continue;\n")
    .replace(ver, "const VERSION = '$1-legacy';");
  const loop = out.slice(out.indexOf('    for (const [i, n] of names.entries()) {'), out.indexOf('      held = await guard();'));
  if (!loop || /\bPREFIX\b/.test(loop)) return { invalid: 'the transformed sweep loop is missing or still reads PREFIX' };
  return { sw: out };
}

/** leg swlegacy (#1169, the upgrade): the previous version (legacyBytes) activates and fills under
 * ob-sw-<VERSION>-legacy; the deploy (this tree's sw.js) installs into its scope-tagged name and waits. The take-over
 * (what the update notice's Reload posts: {ob:'skip-waiting'} to the waiting worker; the page reloads at its
 * controllerchange) leaves the previous snapshot alone: a name from before scope tags is never deleted, nor any entry
 * of it (one worker cannot prove whose it is; the leftover is the record's storage cost). Every resolved manifest URL
 * stays in it while the new version waits, after the take-over, after the new fill (its fill-end sweep when the
 * reloaded document heard it) and after the offline boot: with the new fill complete, the server stopped and the
 * worker stopped (a cold start opens the snapshot by name), the app boots offline from the new snapshot, and that
 * worker life's navigation and fill-end sweeps spare it too. RED (plant legacy-delete): the take-over deletes the
 * previous snapshot. */
export async function legSwLegacy({ PORT, cdp, fail: gateFail, log = console.log }) {
  const tag = 'swlegacy-desktop';
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const sw = fs.readFileSync(path.join(WEB_DIR, 'sw.js'), 'utf8');
  const v = (sw.match(/const VERSION = '([^']+)';/) || [])[1];
  const old = legacyBytes(sw);
  if (old.invalid) { fail(`[${tag}] INVALID: ${old.invalid}`); return; }
  const PORT2 = PORT + 1;
  const root = mirrorTree(['sw.js']); // the deploy rewrites it: a real copy
  fs.writeFileSync(path.join(root, 'sw.js'), old.sw);
  const server = spawnStaticServer(root, PORT2);
  let up = true; let c = null; let b = null;
  const url = `http://127.0.0.1:${PORT2}/app.html?sw=1&u=3g-${tag}`;
  const nameL = `ob-sw-${v}-legacy`;
  let n = {};
  const census = async () => { n = await c.eval(SW_NAMES).catch((e) => ({ err: String(e).slice(0, 120) })); return n; };
  try {
    await sleep(700);
    c = await newSwPage(PORT2, cdp, { phone: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FILL_END_REC });
    const ctl = await swControl(c); // the worker versions, from the start
    b = await attachBrowserSession(cdp, { log, pump: true }); // pump: the offline boots restart stopped workers (#1161)
    const keepsL = keepsEvery(c, fail, tag, nameL, { 'the previous version': resolvedAt(man, `http://127.0.0.1:${PORT2}`, '') });
    // the previous version activates and fills under its unscoped name
    await c.send('Page.navigate', { url });
    const p1 = await waitActivated(c, tag, log);
    if (!p1 || !isActivated(p1) || p1.keys.join() !== nameL) { fail(`[${tag}] INVALID: the previous version never activated under ${nameL} (${JSON.stringify(p1?.reg)} keys=${p1?.keys})`); return; }
    const fillL = await filledTo(c, nameL, total);
    if (fillL < total) { fail(`[${tag}] INVALID: the previous version's fill incomplete (${fillL}/${total})`); return; }
    let p = await controlledVisit(c, `${url}-a`);
    if (!p?.controller) { fail(`[${tag}] INVALID: the previous version's second visit is not controlled (${JSON.stringify(p?.reg)})`); return; }
    // the deploy: this tree's sw.js, strictly newer (the static server answers the update check by mtime at 1 s)
    const aMtime = fs.statSync(path.join(root, 'sw.js')).mtimeMs;
    fs.writeFileSync(path.join(root, 'sw.js'), sw);
    const later = new Date(Math.max(Date.now(), aMtime + 2000));
    fs.utimesSync(path.join(root, 'sw.js'), later, later);
    p = await controlledVisit(c, `${url}-b`);
    const tW = Date.now();
    while (Date.now() - tW < 180000 && p?.reg?.waiting !== 'installed') { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (p?.reg?.waiting !== 'installed') { fail(`[${tag}] INVALID: the new version never reached waiting (${JSON.stringify(p?.reg)})`); return; }
    await census();
    log(`[${tag}] the new version waits: ${JSON.stringify(n)}`);
    const nameN = Object.keys(n).find((k) => k !== nameL);
    if (!nameN || !SCOPED_RE.test(nameN) || !nameN.endsWith(`-${v}`)) { fail(`[${tag}] the new version's name must be ob-sws-<8-hex scope hash>-${v}: ${nameN || 'none'} in ${JSON.stringify(n)}`); return; }
    await keepsL('while the new version waits');
    if (!(n[nameN] >= man.boot.length)) fail(`[${tag}] the waiting version's boot set is incomplete: ${n[nameN]}/${man.boot.length}`);
    // the take-over: the update notice's Reload message; the page reloads at its controllerchange
    await c.eval('(window.__obNavOld = true), true');
    const posted = await c.eval(`navigator.serviceWorker.getRegistration().then((r) => { if (!r || !r.waiting) return false;
      r.waiting.postMessage({ ob: 'skip-waiting' }); return true; })`).catch((e) => String(e));
    if (posted !== true) { fail(`[${tag}] INVALID: the take-over message was not posted (${posted})`); return; }
    const t1 = Date.now(); p = null;
    while (Date.now() - t1 < 60000) {
      p = await c.eval(`window.__obNavOld === true ? null : ${SW_PROBE}`).catch(() => null);
      if (p?.ready && p?.controller && !p.reg?.waiting) break;
      await sleep(400);
    }
    if (!p?.controller || p.reg?.waiting) { fail(`[${tag}] INVALID: no controlled document after the take-over (${JSON.stringify(p?.reg)})`); return; }
    const ask = await sweptAfterAsk(c, `${tag}-${Date.now()}`);
    if (!ask.answer) fail(`[${tag}] no {ob:'swept'} answer within ${SWEPT_MS / 1000} s${ask.err ? ` (${ask.err})` : ''}`);
    await census();
    log(`[${tag}] after the take-over (swept: removed ${ask.answer?.removed}, deferred ${JSON.stringify(ask.answer?.deferred)}): ${JSON.stringify(n)}`);
    await keepsL('after the take-over');
    if (n.err || Object.keys(n).some((k) => k !== nameL && k !== nameN)) fail(`[${tag}] an unexpected census after the take-over: ${JSON.stringify(n)}`);
    // the new fill completes; then the server stops and the app boots offline from the new snapshot
    const fillN = await filledTo(c, nameN, total);
    if (fillN < total) { fail(`[${tag}] INVALID: the new version's fill incomplete (${fillN}/${total})`); return; }
    // the fill-end broadcast reaches the documents open when it is posted: it may end during the reload
    const fe = await fillEndHeard(c, v, 20000);
    if (!fe) log(`[${tag}] the reloaded document did not hear the new fill's end (the offline cold start runs another)`);
    await keepsL(fe ? 'after the new fill end' : 'after the new fill');
    await stopStaticServer(server); up = false;
    const left = await stopWorkers(ctl, c); // a cold start: the snapshot opened by name
    if (left.length) { fail(`[${tag}] INVALID: workers still running before the offline boot: ${left.join(', ')}`); return; }
    p = await controlledVisit(c, `${url}-offline`);
    const booted = p?.ready && p?.controller && p?.shellOpen;
    if (booted) await fillEnded(c, fail, tag, 'the new version', v);
    await census();
    log(`[${tag}] offline: ready ${p?.ready} controller ${p?.controller} hall ${p?.shellOpen}; ${JSON.stringify(n)}`);
    if (!booted) fail(`[${tag}] with the server gone the new version must boot from its snapshot (ready, controlled, in the hall): ${JSON.stringify(p && { ready: p.ready, controller: p.controller, hall: p.shellOpen, reg: p.reg })}`);
    if (n[nameN] !== total) fail(`[${tag}] offline: the new snapshot ${nameN} holds ${n[nameN]}/${total}`);
    await keepsL('offline');
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    if (!failed) log(`[${tag}] OK: ${nameL} kept every entry while ${nameN} waited, through the take-over, the new fill and the offline boot (its navigation and fill-end sweeps); the new version boots offline from a cold worker`);
  } finally { if (b) b.close(); if (c) c.close(); if (up) await stopStaticServer(server); rmTree(root); }
}

/** leg swshared (#1169): a pre-scope cache is named by VERSION alone, so two registrations of one VERSION shared one.
 * The sibling scopes /sa/ (A) and /sb/ (B) both serve the previous version (legacyBytes, ONE VERSION): each activates
 * and fills its own entries into the one ob-sw-<VERSION>-legacy, and the above-scope ../tools/render/grade.json
 * resolves to one entry for both. A deploys this tree's sw.js and takes over. After its activate, after its fill (its
 * fill-end sweep when the reloaded page heard it) and after the offline boots (each worker life's navigation and
 * fill-end sweeps heard), every resolved manifest URL of each registration, above-scope ones included, is still in
 * the shared cache: no entry of a name from before scope tags is ever deleted. With the server and every worker
 * stopped, A boots offline cold from its new snapshot, then B, still on the previous version, from the shared cache,
 * then A again: B's previous-version sweeps (its navigation, then a client ask) take only names that start with
 * 'ob-sw-', so A's new snapshot (ob-sws-…) survives them whole. RED (plant legacy-delete): A's activate deletes the
 * shared cache, and B's cold offline boot fails; RED (plant prefix-ob-sw-s): B's sweeps delete A's new snapshot, and
 * A's second offline boot fails. */
export async function legSwShared({ PORT, cdp, fail: gateFail, log = console.log }) {
  const tag = 'swshared-desktop';
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const sw = fs.readFileSync(path.join(WEB_DIR, 'sw.js'), 'utf8');
  const v = (sw.match(/const VERSION = '([^']+)';/) || [])[1];
  const old = legacyBytes(sw);
  if (old.invalid) { fail(`[${tag}] INVALID: ${old.invalid}`); return; }
  const PORT2 = PORT + 1;
  const root = mirrorTree([]); // the origin's root (launchChrome's served-tree preflight); never registered
  for (const s of ['sa', 'sb']) scopeTree(root, s, old.sw); // the previous version in both scopes, one VERSION
  const server = spawnStaticServer(root, PORT2);
  let up = true; let c = null; let b = null;
  const origin = `http://127.0.0.1:${PORT2}`;
  const url = (s, q) => `${origin}/${s}/app.html?sw=1&u=3g-${tag}-${q}`;
  const nameL = `ob-sw-${v}-legacy`;
  const urls = { '/sa/': resolvedAt(man, origin, 'sa/'), '/sb/': resolvedAt(man, origin, 'sb/') };
  try {
    await sleep(700);
    c = await newSwPage(PORT2, cdp, { phone: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FILL_END_REC });
    const ctl = await swControl(c); // the worker versions, from the start
    b = await attachBrowserSession(cdp, { log, pump: true }); // pump: the offline boots restart stopped workers (#1161)
    const keeps = keepsEvery(c, fail, tag, nameL, urls);
    // the previous version activates in A, then in B, each filling every URL it resolves into the one shared cache
    for (const s of ['sa', 'sb']) {
      await c.send('Page.navigate', { url: url(s, 'first') });
      const p = await waitActivated(c, `${tag} ${s}`, log);
      if (!p || !isActivated(p) || p.keys.join() !== nameL) { fail(`[${tag}] INVALID: the previous version never activated in /${s}/ under ${nameL} (${JSON.stringify(p?.reg)} keys=${p?.keys})`); return; }
      const why = lossOf(await holdsAll(c, nameL, urls[`/${s}/`]), urls[`/${s}/`]);
      if (why) { fail(`[${tag}] INVALID: /${s}/'s fill incomplete in the shared cache: ${why}`); return; }
    }
    // A's deploy (B keeps the previous version): this tree's sw.js at /sa/, strictly newer (the update check reads mtime)
    const aMtime = fs.statSync(path.join(root, 'sa', 'sw.js')).mtimeMs;
    fs.writeFileSync(path.join(root, 'sa', 'sw.js'), sw);
    const later = new Date(Math.max(Date.now(), aMtime + 2000));
    fs.utimesSync(path.join(root, 'sa', 'sw.js'), later, later);
    let p = await controlledVisit(c, url('sa', 'b'));
    const tW = Date.now();
    while (Date.now() - tW < 180000 && p?.reg?.waiting !== 'installed') { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (p?.reg?.waiting !== 'installed') { fail(`[${tag}] INVALID: A's new version never reached waiting (${JSON.stringify(p?.reg)})`); return; }
    // the take-over: the update notice's Reload message; the page reloads at its controllerchange
    await c.eval('(window.__obNavOld = true), true');
    const posted = await c.eval(`navigator.serviceWorker.getRegistration().then((r) => { if (!r || !r.waiting) return false;
      r.waiting.postMessage({ ob: 'skip-waiting' }); return true; })`).catch((e) => String(e));
    if (posted !== true) { fail(`[${tag}] INVALID: the take-over message was not posted (${posted})`); return; }
    const t1 = Date.now(); p = null;
    while (Date.now() - t1 < 60000) {
      p = await c.eval(`window.__obNavOld === true ? null : ${SW_PROBE}`).catch(() => null);
      if (p?.ready && p?.controller && !p.reg?.waiting) break;
      await sleep(400);
    }
    if (!p?.controller || p.reg?.waiting) { fail(`[${tag}] INVALID: no controlled /sa/ document after the take-over (${JSON.stringify(p?.reg)})`); return; }
    const ask = await sweptAfterAsk(c, `${tag}-${Date.now()}`);
    if (!ask.answer) fail(`[${tag}] no {ob:'swept'} answer within ${SWEPT_MS / 1000} s${ask.err ? ` (${ask.err})` : ''}`);
    const keys = await c.eval(SW_NAMES).catch((e) => ({ err: String(e).slice(0, 120) }));
    const nameN = Object.keys(keys).find((k) => k !== nameL && k.endsWith(`-${v}`));
    log(`[${tag}] after A's take-over (swept: removed ${ask.answer?.removed}, deferred ${JSON.stringify(ask.answer?.deferred)}): ${JSON.stringify(keys)}`);
    await keeps("A's activate");
    if (!nameN) { fail(`[${tag}] INVALID: no name for A's new version in ${JSON.stringify(keys)}`); return; }
    if (!SCOPED_RE.test(nameN)) fail(`[${tag}] A's new snapshot name must be ob-sws-<8-hex scope hash>-${v}: ${nameN}`);
    const fillN = await filledTo(c, nameN, total);
    if (fillN < total) { fail(`[${tag}] INVALID: A's new fill incomplete (${fillN}/${total})`); return; }
    const fe = await fillEndHeard(c, v, 20000); // it may end during the reload (the offline cold starts run more)
    if (!fe) log(`[${tag}] the reloaded /sa/ page did not hear A's new fill end`);
    await keeps(fe ? "A's fill end" : "A's fill");
    // offline, cold, in either order: A from its new snapshot, B on the previous version from the shared cache, then A
    // again after B's previous-version sweeps (see above)
    await stopStaticServer(server); up = false;
    for (const [s, step] of [['sa', 'offline'], ['sb', 'offline'], ['sa', 'again']]) {
      const left = await stopWorkers(ctl, c);
      if (left.length) { fail(`[${tag}] INVALID: workers still running before the ${step} /${s}/ boot: ${left.join(', ')}`); return; }
      const q = await controlledVisit(c, url(s, step));
      log(`[${tag}] ${step} /${s}/: ready ${q?.ready} controller ${q?.controller} hall ${q?.shellOpen}`);
      if (!q?.ready || !q?.controller || !q?.shellOpen) fail(`[${tag}] ${step === 'again' ? "after B's previous-version sweeps" : 'with the server gone'} the /${s}/ page must boot from its snapshot (ready, controlled, in the hall): ${JSON.stringify(q && { ready: q.ready, controller: q.controller, hall: q.shellOpen, keys: q.keys })}`);
      else if (step === 'offline') await fillEnded(c, fail, tag, s === 'sa' ? 'A' : 'B', s === 'sa' ? v : `${v}-legacy`);
      if (s !== 'sb') continue;
      if (!q?.controller) { log(`[${tag}] the /sb/ page is not controlled: B's sweeps are not asked`); continue; }
      const o = await oldSweepsSpare(c, fail, tag, 'B', nameN, total);
      log(`[${tag}] after B's previous-version sweeps (removed ${o.removed}): ${JSON.stringify(o.census)}`);
    }
    await keeps('offline');
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    if (!failed) log(`[${tag}] OK: the shared ${nameL} kept every entry of both scopes, above-scope ones included, through A's take-over, its fill and the offline boots (their navigation and fill-end sweeps); B's previous-version sweeps left A's new snapshot whole; A (new), B (previous version) and A again boot offline cold`);
  } finally { if (b) b.close(); if (c) c.close(); if (up) await stopStaticServer(server); rmTree(root); }
}

/** leg swnested (#1169): a registration nested in another's scope (a dev server's / over /web/), both on the previous
 * version (legacyBytes, ONE VERSION), so both fill one pre-scope cache ob-sw-<VERSION>-legacy: the inner one's entries
 * lie under the outer one's scope, and ../tools/render/grade.json resolves to one URL for both (above the inner scope,
 * inside the outer one). Run once per side, each in a fresh profile: that side deploys this tree's sw.js and takes
 * over. While its new version waits, after its activate, after its fill (its fill-end sweep when the reloaded page
 * heard it) and after the offline boots (each worker life's navigation and fill-end sweeps heard), every resolved
 * manifest URL of each registration, above-scope ones included, is still in the pre-scope cache. With the
 * server and every worker stopped, the upgraded side boots offline cold from its new snapshot, then the other, still
 * on the previous version, from the pre-scope cache, then the upgraded side again, each page controlled by its own
 * registration: the other side's previous-version sweeps take only names that start with 'ob-sw-', so the new snapshot
 * (ob-sws-…) survives them whole. RED (plant legacy-delete): the upgraded side's activate deletes the pre-scope cache,
 * and the other side's cold offline boot fails; RED (plant prefix-ob-sw-s): the other side's sweeps delete the new
 * snapshot, and the upgraded side's second offline boot fails. */
export async function legSwNested({ PORT, cdp, fail, log = console.log }) {
  for (const side of ['outer', 'inner']) await nestedSide({ PORT, cdp, gateFail: fail, log, side });
}

async function nestedSide({ PORT, cdp, gateFail, log, side }) {
  const tag = `swnested-${side}`;
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const man = readSwManifest();
  const total = man.boot.length + man.fill.length;
  const sw = fs.readFileSync(path.join(WEB_DIR, 'sw.js'), 'utf8');
  const v = (sw.match(/const VERSION = '([^']+)';/) || [])[1];
  const old = legacyBytes(sw);
  if (old.invalid) { fail(`[${tag}] INVALID: ${old.invalid}`); return; }
  const PORT2 = PORT + 1;
  const root = mirrorTree(['sw.js']); // the outer registration is the origin's root: its sw.js a real copy
  fs.writeFileSync(path.join(root, 'sw.js'), old.sw);
  scopeTree(root, 'web', old.sw); // the inner registration at /web/, on the same previous VERSION
  const server = spawnStaticServer(root, PORT2);
  let up = true; let c = null; let b = null;
  const origin = `http://127.0.0.1:${PORT2}`;
  const dir = { outer: '', inner: 'web/' };
  const other = side === 'outer' ? 'inner' : 'outer';
  const url = (s, q) => `${origin}/${dir[s]}app.html?sw=1&u=3g-${tag}-${q}`;
  const nameL = `ob-sw-${v}-legacy`;
  const urls = { outer: resolvedAt(man, origin, dir.outer), inner: resolvedAt(man, origin, dir.inner) };
  try {
    await sleep(700);
    c = await newSwPage(PORT2, cdp, { phone: false });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FILL_END_REC });
    const ctl = await swControl(c); // the worker versions, from the start
    b = await attachBrowserSession(cdp, { log, pump: true }); // pump: the offline boots restart stopped workers (#1161)
    const keeps = keepsEvery(c, fail, tag, nameL, { 'the outer registration': urls.outer, 'the inner registration': urls.inner });
    // the previous version, the inner side first (getRegistration() answers the longest matching scope: once the
    // outer registration exists it covers /web/ until the inner one does), each filling every URL it resolves
    for (const s of ['inner', 'outer']) {
      await c.send('Page.navigate', { url: url(s, 'first') });
      const p = await waitActivated(c, `${tag} ${s}`, log);
      if (!p || !isActivated(p) || p.keys.join() !== nameL) { fail(`[${tag}] INVALID: the previous version never activated at the ${s} scope under ${nameL} (${JSON.stringify(p?.reg)} keys=${p?.keys})`); return; }
      const why = lossOf(await holdsAll(c, nameL, urls[s]), urls[s]);
      if (why) { fail(`[${tag}] INVALID: the ${s} fill incomplete in ${nameL}: ${why}`); return; }
    }
    // this side's deploy (the other keeps the previous version): this tree's sw.js, strictly newer (the update check
    // reads mtime)
    const at = path.join(root, dir[side], 'sw.js');
    const aMtime = fs.statSync(at).mtimeMs;
    fs.writeFileSync(at, sw);
    const later = new Date(Math.max(Date.now(), aMtime + 2000));
    fs.utimesSync(at, later, later);
    let p = await controlledVisit(c, url(side, 'b'));
    const tW = Date.now();
    while (Date.now() - tW < 180000 && p?.reg?.waiting !== 'installed') { await sleep(500); p = await c.eval(SW_PROBE).catch(() => p); }
    if (p?.reg?.waiting !== 'installed') { fail(`[${tag}] INVALID: the ${side} new version never reached waiting (${JSON.stringify(p?.reg)})`); return; }
    await keeps('while the new version waits');
    // the take-over: the update notice's Reload message; the page reloads at its controllerchange
    await c.eval('(window.__obNavOld = true), true');
    const posted = await c.eval(`navigator.serviceWorker.getRegistration().then((r) => { if (!r || !r.waiting) return false;
      r.waiting.postMessage({ ob: 'skip-waiting' }); return true; })`).catch((e) => String(e));
    if (posted !== true) { fail(`[${tag}] INVALID: the take-over message was not posted (${posted})`); return; }
    const t1 = Date.now(); p = null;
    while (Date.now() - t1 < 60000) {
      p = await c.eval(`window.__obNavOld === true ? null : ${SW_PROBE}`).catch(() => null);
      if (p?.ready && p?.controller && !p.reg?.waiting) break;
      await sleep(400);
    }
    if (!p?.controller || p.reg?.waiting) { fail(`[${tag}] INVALID: no controlled ${side} document after the take-over (${JSON.stringify(p?.reg)})`); return; }
    const ask = await sweptAfterAsk(c, `${tag}-${Date.now()}`);
    if (!ask.answer) fail(`[${tag}] no {ob:'swept'} answer within ${SWEPT_MS / 1000} s${ask.err ? ` (${ask.err})` : ''}`);
    const keys = await c.eval(SW_NAMES).catch((e) => ({ err: String(e).slice(0, 120) }));
    const nameN = Object.keys(keys).find((k) => k !== nameL && k.endsWith(`-${v}`));
    log(`[${tag}] after the ${side} take-over (swept: removed ${ask.answer?.removed}, deferred ${JSON.stringify(ask.answer?.deferred)}): ${JSON.stringify(keys)}`);
    await keeps(`the ${side} activate`);
    if (!nameN) { fail(`[${tag}] INVALID: no name for the ${side} new version in ${JSON.stringify(keys)}`); return; }
    if (!SCOPED_RE.test(nameN)) fail(`[${tag}] the ${side} new snapshot name must be ob-sws-<8-hex scope hash>-${v}: ${nameN}`);
    const fillN = await filledTo(c, nameN, total);
    if (fillN < total) { fail(`[${tag}] INVALID: the ${side} new fill incomplete (${fillN}/${total})`); return; }
    const fe = await fillEndHeard(c, v, 20000); // it may end during the reload (the offline cold starts run more)
    if (!fe) log(`[${tag}] the reloaded ${side} page did not hear its new fill end`);
    await keeps(fe ? `the ${side} fill end` : `the ${side} fill`);
    // offline, cold, in either order, each page under its own registration: this side from its new snapshot, the other
    // on the previous version from the pre-scope cache, then this side again after the other's previous-version sweeps
    await stopStaticServer(server); up = false;
    for (const [s, step] of [[side, 'offline'], [other, 'offline'], [side, 'again']]) {
      const left = await stopWorkers(ctl, c);
      if (left.length) { fail(`[${tag}] INVALID: workers still running before the ${step} ${s} boot: ${left.join(', ')}`); return; }
      const q = await controlledVisit(c, url(s, step));
      const script = await c.eval('navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null').catch(() => null);
      log(`[${tag}] ${step} ${s}: ready ${q?.ready} controller ${script} hall ${q?.shellOpen}`);
      if (!q?.ready || !q?.controller || !q?.shellOpen) fail(`[${tag}] ${step === 'again' ? `after the ${other} registration's previous-version sweeps` : 'with the server gone'} the ${s} page must boot from its snapshot (ready, controlled, in the hall): ${JSON.stringify(q && { ready: q.ready, controller: q.controller, hall: q.shellOpen, keys: q.keys })}`);
      else if (script !== `${origin}/${dir[s]}sw.js`) fail(`[${tag}] ${step} ${s}: the page is controlled by ${script}, not by its own registration's ${origin}/${dir[s]}sw.js`);
      else if (step === 'offline') await fillEnded(c, fail, tag, `the ${s} registration`, s === side ? v : `${v}-legacy`);
      if (s !== other || step !== 'offline') continue;
      if (!q?.controller) { log(`[${tag}] the ${other} page is not controlled: its sweeps are not asked`); continue; }
      const o = await oldSweepsSpare(c, fail, tag, `the ${other} registration`, nameN, total);
      log(`[${tag}] after the ${other} registration's previous-version sweeps (removed ${o.removed}): ${JSON.stringify(o.census)}`);
    }
    await keeps('offline');
    if (b.sw.exc.length) fail(`[${tag}] SW exceptions: ${b.sw.exc[0]}`);
    if (!failed) log(`[${tag}] OK: ${nameL} kept every entry of both registrations, above-scope ones included, through the ${side} upgrade (waiting, activate, fill, offline boots with their navigation and fill-end sweeps); the ${other} registration's previous-version sweeps left the new snapshot whole; the ${side}, ${other} and ${side} pages boot offline cold, each under its own registration`);
  } finally { if (b) b.close(); if (c) c.close(); if (up) await stopStaticServer(server); rmTree(root); }
}
