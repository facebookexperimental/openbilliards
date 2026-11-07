// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-userboot-3g.mjs — GH-694 boot-overlay HOLD LAW arm (e2e-userboot arm 12;
// also runs standalone: node web/tools/e2e-userboot-3g.mjs).
//
// The finding: the #ob-boot driver's 30 s no-stage-advance failsafe fired on
// EVERY 3G-class first visit (data-stage sits on 'kernel' for 30-130 s while
// main.js's 92-module static graph + the wasm stream in), the overlay faded
// and left the DOM with __test.ready === false, and the persona saw the raw
// pre-shell HUD (empty labels on the phone) on a black canvas for 6-99 s.
//
//   hold   REAL-USER boot (tool:false, cold cache, app.html?sw=1) under CDP
//          Fast 3G (562.5 ms / 184 320 B/s); per-rAF boot-state log asserts
//          (a) #ob-boot never gains ob-boot--out nor leaves the DOM while
//          ready !== true and #err is empty — first 'out' frame has ready,
//          first 'none' frame has body.ob-shell-open; (b) no frame with #hud
//          visible, no #ob-boot and no shell (the exposure oracle); (c) at
//          t≈33 s the overlay is still painted (pixel probe = the field's
//          own computed background, sampled where the HUD panel would be)
//          and carries the honest slow register (copy + bytes received).
//          Phone 844×390 DPR3 by default; OB_E2E_3G_LEGS=hold,wasm,slow adds
//          the Slow 3G (2000 ms / 51 200 B/s, ~135 s) desktop repeat.
//   wasm   forced 404 on pool_wasm_bg.wasm (Fetch.fulfillRequest): the
//          failure card (reason + Retry) shows within 30 s, the field sits
//          UNDER #err (never masks the log), the dead chrome skeleton is
//          hidden, Retry really reloads. wasmphone: the same card on the
//          phone register — the Retry hit box is >= 44 pt (GH-699 review r1
//          P2, PR #706; app.html's own sheet, touch.js may not have loaded).
//   dict   (GH-694 review r1 P2, PR #706) the locale fetch + the wasm HELD past
//          the 30 s mark on a zh-CN phone boot: the slow register shows the
//          English last-resort copy per key at 33 s (never empty), and
//          swaps to the zh-CN strings once the dictionary is released.
//   stale  a zh-CN dictionary LACKING every boot.* key + a refused static
//          module (i18n.js 404): the failure card shows the English
//          last-resort copy per key (phone).
//   sw     (GH-714) Slow-3G cleared-cache first visit, page AND service-worker
//          target throttled, CPU x4, phone: the registration reaches
//          'activated' with the boot set (PRECACHE) cached and never goes
//          'redundant' (the 5-minute install kill); the second visit is
//          controlled and boots from the snapshot. swfill: unthrottled
//          desktop — the background fill completes after activation without
//          holding the page; the committed boot manifest is current. Legs +
//          the --record-boot recorder live in e2e-userboot-3g-sw.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';
import { legSwInstall, legSwFill, legSwFail, legSwStale, legSwQuota, legSwRetry, legSwStop, legSwUpdate, legSwScope, legSwLegacy, legSwShared, legSwNested, legSwForced, recordBootManifest } from './e2e-userboot-3g-sw.mjs';

export const NETS = {
  fast3g: { latency: 562.5, downloadThroughput: 184320, uploadThroughput: 90000 },
  slow3g: { latency: 2000, downloadThroughput: 51200, uploadThroughput: 51200 },
};
// standalone band sizing (run-gate reads this literal): the static server +
// the swfail/swstale/swquota/swretry legs' scratch-mirror server (PORT + 1; GH-714 review r1/r1v/r3)
// + CDP endpoints CDP_PORT..+2 (hold / wasm / slow legs)
export const PORT_INVENTORY = { http: 2, cdp: 3 };

// SHARED_DEFAULT_WINDOW (e2e-userboot) — one suite in two files: e2e-userboot imports runBoot3gArm from the 3g file,
// which also runs standalone on the same ports.
export const SHARED_DEFAULT_WINDOW = 'e2e-userboot';
const OUT_DIR = process.env.OB_E2E_3G_OUT || path.join(os.tmpdir(), 'ob-e2e-userboot-3g');

// per-rAF boot-state log, installed before any HTML parses (dedupes on change).
// GH-668 S5 slice 2 (G6): the overlay's attribute / class flips ALSO sample
// synchronously through a MutationObserver — the exit rides the t-med rung
// (200 ms) since the boot register moved onto the token ladder, and the first
// presented frame's bake + render can starve rAF for longer than that right
// when fade() fires; the frame LAW is unchanged (kernel > scene > ready > out
// > none), only the sampler can no longer miss a state the page really held.
const FRAME_LOG = `(() => {
  const F = window.__obFrames = []; let prev = '';
  const sample = () => {
    try {
      const b = document.getElementById('ob-boot');
      const hud = document.getElementById('hud');
      const hcs = hud && getComputedStyle(hud);
      const st = {
        boot: !b ? 'none' : b.classList.contains('ob-boot--out') ? 'out' : b.getAttribute('data-stage'),
        ready: !!(window.__test && window.__test.ready === true),
        shellOpen: !!(document.body && document.body.classList.contains('ob-shell-open')),
        hud: !!(hcs && hcs.display !== 'none' && hcs.visibility !== 'hidden'),
        err: !!((document.getElementById('err') || {}).textContent),
        slow: !!(b && b.hasAttribute('data-slow')),
        failed: b ? (b.getAttribute('data-boot-failed') || '') : '',
      };
      const k = JSON.stringify(st);
      if (k !== prev) { prev = k; st.t = Math.round(performance.now()); if (F.length < 400) F.push(st); }
    } catch (_) { /* pre-body */ }
  };
  const step = () => { sample(); requestAnimationFrame(step); };
  requestAnimationFrame(step);
  const watch = () => {
    const b = document.getElementById('ob-boot');
    if (!b) return false;
    new MutationObserver(sample).observe(b, { attributes: true,
      attributeFilter: ['class', 'data-stage', 'data-slow', 'data-boot-failed'] });
    return true;
  };
  if (!watch()) {
    const mo = new MutationObserver(() => { if (watch()) mo.disconnect(); });
    mo.observe(document, { childList: true, subtree: true });
  }
})();`;

const PROBE = `(() => {
  const b = document.getElementById('ob-boot');
  const txt = (s) => (b && b.querySelector(s) ? b.querySelector(s).textContent.trim() : null);
  return {
    t: Math.round(performance.now()), rs: document.readyState,
    boot: b ? { stage: b.getAttribute('data-stage'), out: b.classList.contains('ob-boot--out'),
      slow: b.hasAttribute('data-slow'), failed: b.getAttribute('data-boot-failed'),
      opacity: getComputedStyle(b).opacity, z: Number(getComputedStyle(b).zIndex),
      bgRgb: (() => { const o = document.createElement('canvas'); o.width = o.height = 1;
        const g = o.getContext('2d'); g.fillStyle = getComputedStyle(b).backgroundColor;
        g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); })(),
      slowTxt: txt('.ob-boot__slow [data-i18n="boot.slow"]'), mb: txt('.ob-boot__mb'),
      stageTxt: txt('.ob-boot__row[data-bs="kernel"] [data-i18n]'),
      reason: txt('.ob-boot__reason'), retry: txt('.ob-boot__retry'),
      recvTxt: txt('[data-i18n="boot.received"]'), fb: b.querySelectorAll('[data-ob-fb]').length,
      title: txt('.ob-boot__failtitle') } : null,
    ready: !!(window.__test && window.__test.ready === true),
    shellOpen: !!(document.body && document.body.classList.contains('ob-shell-open')),
    err: ((document.getElementById('err') || {}).textContent || '').slice(0, 160),
    frames: (window.__obFrames || []).length,
  };
})()`;

// mean RGB of a w×h patch of the composited page at CSS (x, y) — decoded
// in-page (no node png dependency; the probeShot precedent in e2e-userboot)
async function patchRgb(c, x, y, w = 24, h = 24) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  return c.eval(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${data}';
    await img.decode();
    const sx = img.naturalWidth / innerWidth, sy = img.naturalHeight / innerHeight;
    const o = document.createElement('canvas'); o.width = ${w}; o.height = ${h};
    const g = o.getContext('2d');
    g.drawImage(img, ${x} * sx, ${y} * sy, ${w} * sx, ${h} * sy, 0, 0, ${w}, ${h});
    const d = g.getImageData(0, 0, ${w}, ${h}).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; return [r / n, gg / n, b / n].map((v) => Math.round(v));
  })()`);
}

/** The frame oracle. Returns a list of violations (empty = law held). */
export function analyzeFrames(frames) {
  const bad = [];
  let seen = false, firstOut = null, firstNone = null;
  const order = [];
  for (const f of frames) {
    if (f.boot !== 'none' && !seen) seen = true;
    if (!seen) continue; // pre-parse frames: the overlay has not been born yet
    if (!order.includes(f.boot)) order.push(f.boot);
    if ((f.boot === 'out' || f.boot === 'none') && !f.ready && !f.err) {
      bad.push(`t=${f.t}ms overlay ${f.boot} while ready=false and #err empty (failed open)`);
    }
    if (f.boot === 'out' && firstOut === null) {
      firstOut = f;
      if (!f.ready) bad.push(`first 'out' frame t=${f.t}ms has ready=false`);
    }
    if (f.boot === 'none' && firstNone === null) {
      firstNone = f;
      if (!f.shellOpen) bad.push(`first no-overlay frame t=${f.t}ms has no body.ob-shell-open`);
    }
    if (f.hud && f.boot === 'none' && !f.shellOpen) {
      bad.push(`t=${f.t}ms EXPOSURE: #hud visible, no overlay, no shell`);
    }
  }
  const want = ['kernel', 'scene', 'ready', 'out', 'none'];
  const got = order.filter((s) => want.includes(s));
  if (got.join('>') !== want.join('>')) bad.push(`stage order ${order.join('>')} (want ${want.join('>')})`);
  return bad.slice(0, 8);
}

async function newPage(PORT, cdp, profile) {
  const phone = profile === 'phone';
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, {
    port: cdp, tool: false, width: phone ? 844 : 1280, height: phone ? 390 : 800 });
  if (phone) await setPhoneMetrics(c, { width: 844, height: 390, deviceScaleFactor: 3 });
  await c.send('Page.enable'); await c.send('Network.enable'); await c.send('Runtime.enable');
  await c.send('Network.clearBrowserCache'); await c.send('Network.clearBrowserCookies');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FRAME_LOG });
  return c;
}

/** leg hold: slow-link first visit — the overlay holds until the shell. */
export async function legHold({ PORT, cdp, profile = 'phone', net = 'fast3g', fail, log = console.log }) {
  const tag = `${profile}-${net}`;
  const cap = net === 'slow3g' ? 320000 : 150000;
  const c = await newPage(PORT, cdp, profile);
  const consoleErrs = [];
  c.onEvent((m, p) => { if (m === 'Runtime.exceptionThrown') consoleErrs.push(String(p.exceptionDetails?.text)); });
  try {
    await c.send('Network.emulateNetworkConditions', { offline: false, ...NETS[net] });
    const url = `http://127.0.0.1:${PORT}/app.html?sw=1&u=3g-${tag}`;
    const tNav = Date.now();
    await c.send('Page.navigate', { url });
    let at33 = null, opened = false, last = null, lastLog = 0;
    while (Date.now() - tNav < cap) {
      let p; try { p = await c.eval(PROBE); } catch { p = null; }
      const el = Date.now() - tNav;
      if (p) {
        last = p;
        if (at33 === null && el >= 33000) {
          // (c) still painted: the field's own background where the HUD would be
          const W = profile === 'phone' ? 844 : 1280;
          const rgb = await patchRgb(c, W - 130, 100);
          at33 = { el, p, rgb };
          fs.mkdirSync(OUT_DIR, { recursive: true });
          await c.screenshot(path.join(OUT_DIR, `hold-${tag}-33s.png`));
          const want = p.boot ? p.boot.bgRgb : null;
          const near = want && rgb.every((v, i) => Math.abs(v - want[i]) <= 8);
          if (!p.boot || p.boot.out) fail(`[${tag}] t=33 s: overlay ${p.boot ? 'fading' : 'gone'} (ready=${p.ready}, err='${p.err}')`);
          else if (!near) fail(`[${tag}] t=33 s: field pixel ${rgb} != overlay background ${want} (not painted)`);
          if (p.boot && !p.boot.slow) fail(`[${tag}] t=33 s: no [data-slow] register after 30 s on '${p.boot.stage}'`);
          if (p.boot && (!p.boot.slowTxt || !p.boot.stageTxt)) {
            fail(`[${tag}] t=33 s: slow register copy empty (slow='${p.boot?.slowTxt}', stage='${p.boot?.stageTxt}')`);
          }
          if (p.boot && !/^\d+\.\d MB$/.test(p.boot.mb || '')) fail(`[${tag}] t=33 s: bytes cue '${p.boot?.mb}'`);
          log(`[${tag}] t=${(el / 1000).toFixed(1)}s hold: stage=${p.boot?.stage} slow=${p.boot?.slow} `
            + `'${p.boot?.stageTxt}' / '${p.boot?.slowTxt}' ${p.boot?.mb} px=${rgb} want=${want}`);
        }
        if (p.shellOpen && p.ready && !p.boot) { opened = true; break; }
        if (el - lastLog >= 15000) { lastLog = el; log(`[${tag}] t=${(el / 1000).toFixed(0)}s stage=${p.boot ? p.boot.stage : 'none'} ready=${p.ready} frames=${p.frames}`); }
      }
      await sleep(400);
    }
    await sleep(800);
    const frames = await c.eval('JSON.stringify(window.__obFrames || [])').then(JSON.parse).catch(() => []);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `frames-${tag}.json`), JSON.stringify(frames));
    if (!opened) fail(`[${tag}] shell never opened within ${cap / 1000}s (last: ${JSON.stringify(last)})`);
    if (at33 === null) fail(`[${tag}] boot finished before the 33 s probe — link not throttled?`);
    const bad = analyzeFrames(frames);
    for (const b of bad) fail(`[${tag}] frame law: ${b}`);
    const errFrames = frames.filter((f) => f.err);
    if (errFrames.length) fail(`[${tag}] #err content during the boot: ${last?.err}`);
    if (!bad.length && opened) {
      const outF = frames.find((f) => f.boot === 'out'), noneF = frames.find((f) => f.boot === 'none' && f.ready);
      log(`[${tag}] hold law OK: kernel→scene→ready→out; out at ${outF?.t}ms (ready=${outF?.ready}), `
        + `removed at ${noneF?.t}ms (shell=${noneF?.shellOpen}); ${frames.length} transitions, 0 exposure frames`);
    }
  } finally { c.close(); }
}

/** leg wasm: forced wasm 404 — honest failure card, never dead chrome. */
export async function legWasm404({ PORT, cdp, profile = 'desktop', fail, log = console.log }) {
  const tag = profile === 'phone' ? 'wasm404-phone' : 'wasm404';
  const c = await newPage(PORT, cdp, profile);
  try {
    c.onEvent((m, p) => {
      if (m !== 'Fetch.requestPaused') return;
      if (/pool_wasm_bg\.wasm/.test(p.request.url)) {
        c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404,
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }],
          body: Buffer.from('not found').toString('base64') });
      } else c.send('Fetch.continueRequest', { requestId: p.requestId });
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*pool_wasm_bg.wasm*' }] });
    const tNav = Date.now();
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=3g-${tag}` });
    let p = null;
    while (Date.now() - tNav < 30000) {
      try { p = await c.eval(PROBE); } catch { p = null; }
      if (p?.boot?.failed) break;
      await sleep(250);
    }
    const el = Date.now() - tNav;
    if (!p?.boot) { fail(`[${tag}] overlay gone after the wasm 404 (dead chrome + #err; err='${p?.err}')`); return; }
    if (!p.boot.failed) { fail(`[${tag}] no failure card within 30 s (stage=${p.boot.stage}, err='${p.err}')`); return; }
    await sleep(1500); // dictionary fetch + #err write settle
    p = await c.eval(PROBE);
    const s = await c.eval(`(() => {
      const b = document.getElementById('ob-boot'), e = document.getElementById('err');
      const btn = b.querySelector('.ob-boot__retry'); const br = btn.getBoundingClientRect();
      const er = e.getBoundingClientRect();
      const at = document.elementFromPoint(er.x + er.width / 2, er.y + Math.min(12, er.height / 2));
      const ghosts = [...document.body.children].filter((x) => !['err', 'ob-boot'].includes(x.id)
        && x.tagName !== 'SCRIPT' && getComputedStyle(x).display !== 'none').map((x) => x.id || x.tagName);
      window.__armToken = 1;
      return { retryVis: getComputedStyle(btn).display !== 'none' && br.width > 0 && br.height > 0,
        retryBox: [Math.round(br.width), Math.round(br.height)], coarse: matchMedia('(pointer: coarse)').matches,
        retryXY: [br.x + br.width / 2, br.y + br.height / 2], errZ: Number(getComputedStyle(e).zIndex),
        errVis: getComputedStyle(e).display !== 'none' && er.height > 0,
        errOnTop: !!(at && e.contains(at)), ghosts, bodyStamp: document.body.hasAttribute('data-ob-boot-failed') };
    })()`);
    log(`[${tag}] card at ${(el / 1000).toFixed(1)}s: failed='${p.boot.failed}' title='${p.boot.title}' reason='${p.boot.reason}' `
      + `retry='${p.boot.retry}' box=${s.retryBox.join('x')} coarse=${s.coarse} z=${p.boot.z} errZ=${s.errZ} errOnTop=${s.errOnTop} ghosts=[${s.ghosts}] err='${p.err}'`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await c.screenshot(path.join(OUT_DIR, `wasm404-card.png`));
    if (p.boot.failed !== 'kernel') fail(`[${tag}] reason kind '${p.boot.failed}' (want kernel)`);
    if (!p.boot.title || !p.boot.reason) fail(`[${tag}] failure card copy empty`);
    if (!s.retryVis || !p.boot.retry) fail(`[${tag}] Retry control missing/unlabelled ('${p.boot.retry}')`);
    // GH-699 review r1 P2 (PR #706): the 44 pt floor on the coarse register — the
    // card paints before touch.js, so app.html's own sheet must carry it
    if (profile === 'phone' && (!s.coarse || s.retryBox[0] < 44 || s.retryBox[1] < 44)) {
      fail(`[${tag}] Retry hit box ${s.retryBox.join('x')} under 44 pt on the coarse register (coarse=${s.coarse})`);
    }
    if (!(p.boot.z < s.errZ)) fail(`[${tag}] overlay z ${p.boot.z} not under #err z ${s.errZ} (masks the log)`);
    if (!s.errVis || !p.err || !s.errOnTop) fail(`[${tag}] #err not readable above the card (vis=${s.errVis}, onTop=${s.errOnTop}, '${p.err}')`);
    if (s.ghosts.length || !s.bodyStamp) fail(`[${tag}] dead chrome behind the card: [${s.ghosts}] stamp=${s.bodyStamp}`);
    const [x, y] = s.retryXY;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    await sleep(1500);
    const reloaded = await c.eval('window.__armToken !== 1').catch(() => true);
    if (!reloaded) fail(`[${tag}] Retry did not reload the page`);
    else if (p.boot.failed === 'kernel' && s.errOnTop && !s.ghosts.length) log(`[${tag}] failure honesty OK: card + Retry reload`);
    await c.send('Fetch.disable').catch(() => {});
  } finally { c.close(); }
}

// ---- GH-694 review r1 P2 (PR #706): the registers never paint EMPTY copy ----
const FB = { slow: 'Slow connection — still loading', received: 'Received', kernel: 'Physics kernel',
  failTitle: 'Could not start', failModule: 'A module failed to load.', retry: 'Retry' };
const LOCALE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'locales');
const readLocale = (id) => JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, `${id}.json`), 'utf8'));
// the saved language rides the settings key the driver resolves at parse time
const SAVE_ZH = `try { localStorage.setItem('ob-settings-v1', JSON.stringify({ language: 'zh-CN' })); } catch (_) {}`;

/** leg dict: the locale fetch (and the wasm, so the stage clock idles on
 * 'kernel') is HELD past the 30 s slow mark → at 33 s the register shows
 * the English last-resort copy; released at 36 s, the zh-CN dictionary
 * lands and the copy swaps to the locale string. Phone, unthrottled. */
export async function legDictHold({ PORT, cdp, fail, log = console.log }) {
  const tag = 'dict-hold';
  const zh = readLocale('zh-CN');
  const c = await newPage(PORT, cdp, 'phone');
  try {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SAVE_ZH });
    const held = []; let release = false;
    c.onEvent((m, p) => {
      if (m !== 'Fetch.requestPaused') return;
      if (!release && /\/app\/locales\/|pool_wasm_bg\.wasm/.test(p.request.url)) { held.push(p.requestId); return; }
      c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*' }, { urlPattern: '*pool_wasm_bg.wasm*' }] });
    const tNav = Date.now();
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=3g-${tag}` });
    let at33 = null;
    while (Date.now() - tNav < 36000) {
      if (at33 === null && Date.now() - tNav >= 33000) {
        at33 = await c.eval(PROBE).catch(() => null);
        fs.mkdirSync(OUT_DIR, { recursive: true });
        await c.screenshot(path.join(OUT_DIR, `${tag}-33s.png`));
      }
      await sleep(250);
    }
    release = true;
    for (const id of held) c.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
    const b = at33?.boot;
    log(`[${tag}] t=33 s (${held.length} requests held): slow=${b?.slow} failed='${b?.failed}' stage='${b?.stageTxt}' `
      + `slow='${b?.slowTxt}' recv='${b?.recvTxt}' fb=${b?.fb}`);
    if (!b) fail(`[${tag}] overlay gone at 33 s (${JSON.stringify(at33)})`);
    else {
      if (!b.slow || b.failed) fail(`[${tag}] no slow register at 33 s (slow=${b.slow}, failed='${b.failed}')`);
      if (b.slowTxt !== FB.slow || b.recvTxt !== FB.received || b.stageTxt !== FB.kernel) {
        fail(`[${tag}] register copy with the dictionary HELD: slow='${b.slowTxt}' recv='${b.recvTxt}' `
          + `stage='${b.stageTxt}' (want the English last-resort copy, never empty)`);
      }
      if (!(b.fb > 0)) fail(`[${tag}] fallback-filled nodes carry no data-ob-fb marker (fb=${b.fb})`);
    }
    // released: the zh-CN dictionary lands → the marked nodes swap
    let p = null; const t1 = Date.now();
    while (Date.now() - t1 < 10000) {
      p = await c.eval(PROBE).catch(() => null);
      if (p?.boot?.slowTxt === zh['boot.slow'] && p.boot.fb === 0) break;
      if (!p?.boot) break;
      await sleep(200);
    }
    const s = p?.boot;
    if (!s) fail(`[${tag}] overlay gone before the swap could be observed (${JSON.stringify(p)})`);
    else if (s.slowTxt !== zh['boot.slow'] || s.stageTxt !== zh['boot.kernel'] || s.fb !== 0) {
      fail(`[${tag}] copy did not swap to zh-CN after the release: slow='${s.slowTxt}' stage='${s.stageTxt}' fb=${s.fb}`);
    } else log(`[${tag}] fallback → locale swap OK ${Date.now() - t1} ms after the release: '${s.slowTxt}'`);
    await c.send('Fetch.disable').catch(() => {});
  } finally { c.close(); }
}

// leg stale's terminal document: the card failed, #err carries the boot
// guard's spent-heal register (that document is never reloaded again) and
// the stale dictionary has landed in it. Its generation (timeOrigin), else 0.
const STALE_TERMINAL = `(() => { const b = document.getElementById('ob-boot'), e = document.getElementById('err');
  const dict = performance.getEntriesByType('resource').some((r) => r.name.includes('/app/locales/zh-CN.json') && r.responseEnd > 0);
  return b && b.getAttribute('data-boot-failed') && e && e.textContent.includes('self-heal already attempted') && dict
    ? performance.timeOrigin : 0; })()`;

/** leg stale: a STALE zh-CN dictionary (the served file lacks every boot.*
 * key — an old cached locale beside a fresh app.html) plus a refused
 * static module (i18n.js 404 → the graph never runs, the driver's copy is
 * the only copy): the failure card shows the English last-resort strings
 * per key, never empty. Phone. */
export async function legStaleDict({ PORT, cdp, fail, log = console.log }) {
  const tag = 'stale-dict';
  const stale = Object.fromEntries(Object.entries(readLocale('zh-CN')).filter(([k]) => !k.startsWith('boot.')));
  const body = Buffer.from(JSON.stringify(stale)).toString('base64');
  const c = await newPage(PORT, cdp, 'phone');
  try {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SAVE_ZH });
    c.onEvent((m, p) => {
      if (m !== 'Fetch.requestPaused') return;
      const u = p.request.url;
      if (/\/app\/locales\/zh-CN\.json/.test(u)) {
        c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, body,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' },
            { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
      } else if (/\/app\/i18n\.js/.test(u)) {
        c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404,
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }],
          body: Buffer.from('not found').toString('base64') }).catch(() => {});
      } else c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/zh-CN.json*' }, { urlPattern: '*/app/i18n.js*' }] });
    const tNav = Date.now();
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=3g-${tag}` });
    let p = null;
    while (Date.now() - tNav < 30000) {
      try { p = await c.eval(PROBE); } catch { p = null; }
      if (p?.boot?.failed) break;
      await sleep(250);
    }
    if (!p?.boot?.failed) { fail(`[${tag}] no failure card within 30 s (${JSON.stringify(p)})`); return; }
    // that first card belongs to a document app.html's one-shot boot-guard
    // heal is about to replace (refetch every seen .js/.css with
    // cache:'reload', then location.reload()); a read after a fixed sleep
    // could land in the reloaded document before ITS failure (nightly
    // 10-09: failed='null', every copy slot empty). Judge the terminal
    // document only (#1091), and confirm the card was read in it.
    const t1 = Date.now(); let gen = 0;
    while (!gen && Date.now() - t1 < 30000) {
      gen = await c.eval(STALE_TERMINAL).catch(() => 0);
      if (!gen) await sleep(250);
    }
    if (!gen) { fail(`[${tag}] no terminal document within 30 s of the first card (card failed + "self-heal already attempted" in #err + the stale dictionary landed)`); return; }
    p = await c.eval(PROBE);
    if ((await c.eval(STALE_TERMINAL).catch(() => 0)) !== gen) { fail(`[${tag}] the card was read outside the terminal document`); return; }
    const b = p.boot;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await c.screenshot(path.join(OUT_DIR, `${tag}-card.png`));
    log(`[${tag}] card: failed='${b?.failed}' title='${b?.title}' reason='${b?.reason}' retry='${b?.retry}' `
      + `stage='${b?.stageTxt}' fb=${b?.fb} err='${p.err}'`);
    if (!b) { fail(`[${tag}] overlay gone after the module 404`); return; }
    if (b.failed !== 'module') fail(`[${tag}] reason kind '${b.failed}' (want module)`);
    if (b.title !== FB.failTitle || b.reason !== FB.failModule || b.retry !== FB.retry || b.stageTxt !== FB.kernel) {
      fail(`[${tag}] card copy over a stale dictionary: title='${b.title}' reason='${b.reason}' retry='${b.retry}' `
        + `stage='${b.stageTxt}' (want the English last-resort copy per key, never empty)`);
    } else log(`[${tag}] per-key fallback OK over a dictionary lacking boot.*`);
    await c.send('Fetch.disable').catch(() => {});
  } finally { c.close(); }
}

/** e2e-userboot arm 12 entry: legs from OB_E2E_3G_LEGS (default hold,wasm). */
export async function runBoot3gArm({ PORT, CDP_PORT, fail, log = console.log }) {
  const legs = (process.env.OB_E2E_3G_LEGS || 'hold,wasm,wasmphone,dict,stale,sw,swfill,swfail,swstale,swquota,swretry,swstop,swupdate,swscope,swlegacy,swshared,swnested').split(',');
  if (legs.includes('hold')) await legHold({ PORT, cdp: CDP_PORT, profile: 'phone', net: 'fast3g', fail, log });
  if (legs.includes('wasm')) await legWasm404({ PORT, cdp: CDP_PORT + 1, fail, log });
  if (legs.includes('wasmphone')) await legWasm404({ PORT, cdp: CDP_PORT + 2, profile: 'phone', fail, log });
  if (legs.includes('slow')) await legHold({ PORT, cdp: CDP_PORT + 2, profile: 'desktop', net: 'slow3g', fail, log });
  if (legs.includes('dict')) await legDictHold({ PORT, cdp: CDP_PORT + 1, fail, log });
  if (legs.includes('stale')) await legStaleDict({ PORT, cdp: CDP_PORT + 2, fail, log });
  if (legs.includes('swfill')) await legSwFill({ PORT, cdp: CDP_PORT + 1, fail, log });
  if (legs.includes('sw')) await legSwInstall({ PORT, cdp: CDP_PORT + 2, fail, log, net: NETS.slow3g });
  // GH-714 review r1: install atomicity + fill verification (scratch mirror on PORT + 1)
  if (legs.includes('swfail')) await legSwFail({ PORT, cdp: CDP_PORT + 1, fail, log });
  if (legs.includes('swstale')) await legSwStale({ PORT, cdp: CDP_PORT + 2, fail, log });
  // GH-714 review r1v P2: a store failure on matching bytes is served, never a 503 (scratch mirror on PORT + 1)
  if (legs.includes('swquota')) await legSwQuota({ PORT, cdp: CDP_PORT + 1, fail, log });
  // GH-714 review r3 P2: fill failures are classified — a transient failure retries on the next kick (scratch mirror on PORT + 1)
  if (legs.includes('swretry')) await legSwRetry({ PORT, cdp: CDP_PORT + 2, fail, log });
  // GH-714 review r4 P2: the fill's first turn rides activate; a stopped worker resumes on a re-arm message / the next load
  if (legs.includes('swstop')) await legSwStop({ PORT, cdp: CDP_PORT + 1, fail, log });
  // issue #1047: a waiting generation is offered (the update notice) and Reload boots it (scratch mirror on PORT + 1)
  if (legs.includes('swupdate')) {
    await legSwUpdate({ PORT, cdp: CDP_PORT + 2, fail, log });
    await legSwUpdate({ PORT, cdp: CDP_PORT + 1, fail, log, phone: true });
  }
  // #1169: generation names carry the scope — a second registration on the origin keeps its snapshots, and the
  // upgrade from the unscoped names boots offline (scratch mirror on PORT + 1)
  if (legs.includes('swscope')) await legSwScope({ PORT, cdp: CDP_PORT + 2, fail, log });
  if (legs.includes('swlegacy')) await legSwLegacy({ PORT, cdp: CDP_PORT + 1, fail, log });
  // #1169: a pre-scope cache two registrations of one VERSION share keeps every entry of both through one's upgrade,
  // and so does one a registration nested in another's scope (/ over /web/) shares, whichever side upgrades
  if (legs.includes('swshared')) await legSwShared({ PORT, cdp: CDP_PORT + 2, fail, log });
  if (legs.includes('swnested')) await legSwNested({ PORT, cdp: CDP_PORT + 1, fail, log });
  // #1167 item 2 / #1173: the FORCED take-over (desktop, no worker DevTools), judged by each document's id.
  // NOT in the default list: its own nightly step (OB_E2E_3G_LEGS=swforced) once its entry gate holds.
  if (legs.includes('swforced')) await legSwForced({ PORT, cdp: CDP_PORT + 2, fail, log });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8149);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9374);
  const fail = (msg) => { console.error('E2E-USERBOOT-3G FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try {
    if (process.argv.includes('--record-boot')) await recordBootManifest({ PORT, cdp: CDP_PORT });
    else await runBoot3gArm({ PORT, CDP_PORT, fail });
  } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-USERBOOT-3G FAIL' : 'E2E-USERBOOT-3G PASS');
}
