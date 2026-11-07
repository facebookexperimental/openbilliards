// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-stale.mjs — arms P-STALE-SHELL + P-NOTCH-FALLBACK of the play-place
// gate (GH-668 S5 play r4; review review r3 F1 / F2 on c25b6487, blame 1c70e7ac).
//
// THE LAW JUDGED. play.css caps the play section by the shell's PUBLISHED
// reserve (`--ob-shell-reserve-b`, the B-K05 seam) and keeps the pre-seam
// constant caps (desktop 130 / coarse 212 + safe-area-bottom) as the
// fallback for a returning client whose cached shell.js predates B-K05 —
// the mixed-cache pairing the ownership ledger names as supported. shell.css defines
// the seam's :root DEFAULT (`--ob-shell-reserve-b: 0px`, "a closed shell
// reserves nothing"), so on that pairing the var is DEFINED and never
// updated: `var(--ob-shell-reserve-b, <fallback>)` never falls back, the cap
// reads 100vh − 14 and long Play content runs under the quick-play band
// and the rail (r3 F1; measured on c25b6487: 844x390 en, Details open +
// body at end → section 14..339 over quick-play top 254 / rail top 312 = 85
// px of content under the action band; 1024x768 cap 754 for a 638 law). The
// fix gates the var consumption on the PUBLISH MARKER — the inline
// declaration the B-K05 observer writes on :root (`:root[style*=
// "--ob-shell-reserve-b:"]`, shell.js writeBands: `st.setProperty(…)` on
// #ob-shell.style AND documentElement.style) — and the base rule restates
// the pre-seam caps; the coarse fallback subtracts env(safe-area-inset-
// bottom) exactly as the G1-replaced expression did (`calc(100vh − 212px −
// env(top) − env(bottom))`; r3 F2 — the r1 fallback dropped the inset).
//
// THE STALE SHELL IS DERIVED, NEVER READ FROM HISTORY (arms never read git):
// `staleShellSource()` = the CURRENT app/shell.js with the five
// `st.setProperty('--ob-shell-…', …);` lines of the B-K05 write loop removed
// (documented transform; exactly five or the stage refuses). The observer
// still runs (probe, body class, event) but PUBLISHES NOTHING, so every band
// var stays at the shell.css :root default — the pre-B-K05 CSS surface
// exactly as the finding describes it (reserve-b DEFINED 0px, never
// updated). It is served to the judged document by Fetch.fulfillRequest
// (the e2e-play-once-degrade idiom) with `sw=0` on the URL AND
// Network.setBypassServiceWorker (the P-UPG belt: a registered worker would
// answer shell.js from Cache Storage and the interceptor would never fire).
//
// P-STALE-SHELL (stale pairing = the derived shell.js + the FRESH play.css;
// 844x390 coarse + 1024x768 fine; en + de; the LONG POSE = Details open, 40
// inert 20 px rows appended to the body — `[data-ob-e2e="long-pose"]`,
// test-only, ordered last — and the scroller at its end):
//   * STAGED: shell.js was fulfilled ≥ 1×, the computed reserve reads 0px,
//     the :root inline style carries NO reserve-b declaration (marker absent);
//   * CAP = the restated pre-seam law: coarse |max-height − (vh − 212 −
//     sa-top − sa-bottom)| ≤ 0.5, desktop |max-height − (vh − 130 − sa-top)|
//     ≤ 0.5;
//   * CONTENT CLEAR OF THE BAND: the last content rect's visible bottom (the
//     lowest visible descendant, clipped by the body scroller) ≤ min(rail
//     top, quick-play top); the section BOX's overhang is logged (desktop
//     de: the pre-seam 130 cap sits 3.8 px under the 107.8 px de quick-play
//     box; the content clip ends 13 px above it — pre-seam geometry restated).
//   * FRESH pairing unchanged (the same poses without the interceptor): the
//     marker present, max-height = vh − 14 − sa-top − var (844 en: 232 =
//     the r2 caption; 1024 en: 638), section bottom ≤ vh − bands().reserve
//     .bottom + 1, content clear of the band.
// P-NOTCH-FALLBACK (844x390 SA, insets 47/47/21 through Emulation.setSafe-
// AreaInsetsOverride, the document REBOOTED under them, the stale pairing — the fallback path is unreachable on
// the fresh pairing once the observer has published; before its first rAF
// write the base rule now yields the legacy cap instead of the 0 px reserve):
//   the cap = vh − 212 − sa-top − sa-bottom (157 at 844x390), the section's
//   bottom edge ≤ vh − sa-bottom, the content clear of the (inset-lifted)
//   band. RED on c25b6487 (cap 376 on both arms), GREEN ×3 on the fix.
//
// Runs INSIDE e2e-play.mjs (imported after P-RESERVE — the +0 desktop and
// +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged)
// and stands alone:
//   node web/tools/e2e-play-stale.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics, setSafeAreaInsets } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
/** the pre-seam caps play.css restates as the UNPUBLISHED-reserve fallback
 * (G1's replaced expressions: desktop 130 = 14 + 116, coarse 212 = 14 + 198) */
export const FALLBACK_DESKTOP = 130;
export const FALLBACK_COARSE = 212;
/** the e2e-play P2p-sa notch profile (touch-e2e.md §4.1) */
export const PHONE_SA = { top: 0, left: 47, right: 47, bottom: 21 };
const PUBLISH_LINE = /^[ \t]*st\.setProperty\('--ob-shell-[a-z-]+', [A-Za-z]+\);[ \t]*\n/gm;

/** the DERIVED pre-B-K05 shell.js: the current module minus the five band-var
 * publish lines of writeBands (exactly five, or the transform no longer
 * describes the module and the stage refuses by name) */
export function staleShellSource(webDir) {
  const src = fs.readFileSync(path.join(webDir, 'app/shell.js'), 'utf8');
  const n = (src.match(PUBLISH_LINE) || []).length;
  if (n !== 5) throw new Error(`staging: the B-K05 publish loop must carry exactly five st.setProperty lines (found ${n}) — re-derive the stale-shell transform against app/shell.js`);
  return src.replace(PUBLISH_LINE, '');
}

async function waitExpr(c, expr, tries, stepMs) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(stepMs);
  }
  return false;
}
async function boot(c) {
  if (!(await waitExpr(c, 'window.__test?.ready === true', (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE, 200))) return false;
  if (!(await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 60 * SCALE, 150))) return false;
  if (!(await waitExpr(c, `typeof window.__play === 'object' && !!document.querySelector('section[data-place="play"].ob-play-host') && !!document.getElementById('ob-play-css')?.sheet`, 100 * SCALE, 150))) return false;
  await sleep(700); // the observer's first rAF write + fitPeek's first sync + the fold-snap's deferred re-settle
  return true;
}
/** the notch documents BOOT under the insets (a synthetic inset flip on a
 * live page moves the env() bands but fires no resize — the B-K05 observer
 * republishes on resize / ResizeObserver / transitionend only, and a real
 * device never changes its insets without one), so every inset leg reloads
 * the document after Emulation.setSafeAreaInsetsOverride and boots again */
async function reboot(c) {
  await c.eval('(location.reload(), true)').catch(() => {});
  await sleep(600);
  return boot(c);
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}

/** the LONG POSE: Details open, 40 inert 20 px rows appended to the body
 * (each `order: 2147483647` — the body orders its children (`order: -1` on
 * the rail) and a locale re-render appends play's own nodes after a plain
 * filler; many small rows give the fold-snap leaf a clean boundary within
 * one row of the budget, where ONE 600 px block gives it a single boundary
 * at the block's top and the section never reaches the cap), the scroller
 * at its end (the leaf may re-snap the stop; the section's edge is the law) */
export const LONG_POSE = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const body = sec?.querySelector('[data-ob="play-body"]');
  if (!body) return false;
  const d = sec.querySelector('[data-ob="play-details"]'); if (d && d.getAttribute('aria-expanded') !== 'true') d.click();
  if (!body.querySelector('[data-ob-e2e="long-pose"]')) {
    for (let i = 0; i < 40; i++) { const f = document.createElement('div'); f.setAttribute('data-ob-e2e', 'long-pose'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'flex:none;height:20px;order:2147483647;'; body.appendChild(f); }
  }
  body.scrollTop = body.scrollHeight; return true; })()`;
/** page-side probe: client rects + computed values on the live nodes; the
 * marker is read through the style API (the inline declaration on :root) */
export const MEASURE = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const body = sec?.querySelector('[data-ob="play-body"]');
  if (!sec || !body) return { absent: true };
  const rd = (n) => { if (!n || !n.getClientRects().length) return null; const q = n.getBoundingClientRect(); return { t: q.top, b: q.bottom, h: q.height }; };
  const rail = document.getElementById('ob-shell-rail'), qp = document.getElementById('ob-shell-quickplay-wrap');
  const qpR = qp && getComputedStyle(qp).visibility !== 'hidden' ? rd(qp) : null;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe); const pcs = getComputedStyle(probe);
  const sa = { t: parseFloat(pcs.paddingTop) || 0, b: parseFloat(pcs.paddingBottom) || 0 }; probe.remove();
  const br = rd(body); let last = null;
  for (const el of body.querySelectorAll('*')) { const r = rd(el); if (r && r.h > 0 && (!last || r.b > last.b)) last = r; }
  const visibleBottom = last ? Math.min(last.b, br.b) : br.b; // the scroller clips what layout reports
  const bands = typeof window.__shell?.bands === 'function' ? window.__shell.bands() : null;
  return { vw: innerWidth, vh: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, locale: window.__i18n?.locale?.() ?? null,
    varB: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-reserve-b')),
    marker: document.documentElement.style.getPropertyValue('--ob-shell-reserve-b') !== '',
    reserve: bands ? bands.reserve.bottom : null, secMax: parseFloat(getComputedStyle(sec).maxHeight),
    sec: rd(sec), body: br, last, visibleBottom, rail: rd(rail), qp: qpR, sa,
    bandTop: Math.min(rail ? rd(rail).t : Infinity, qpR ? qpR.t : Infinity),
    scroll: [body.scrollTop, body.scrollHeight, body.clientHeight], posed: !!body.querySelector('[data-ob-e2e="long-pose"]') }; })()`;
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
const brief = (m) => JSON.stringify({ vw: m.vw, vh: m.vh, locale: m.locale, varB: m.varB, marker: m.marker, reserve: r1(m.reserve), secMax: r1(m.secMax),
  sec: m.sec && [r1(m.sec.t), r1(m.sec.b)], body: m.body && [r1(m.body.t), r1(m.body.b)], last: m.last && [r1(m.last.t), r1(m.last.b)], visibleBottom: r1(m.visibleBottom),
  rail: m.rail && [r1(m.rail.t), r1(m.rail.b)], qp: m.qp && [r1(m.qp.t), r1(m.qp.b)], bandTop: r1(m.bandTop), sa: [m.sa.t, m.sa.b], scroll: m.scroll.map(r1), posed: m.posed });

/** the stale pairing's laws on one measured frame */
function judgeStale(m, fail, tag, { coarse }) {
  if (m.absent) { fail(`${tag}: the play section / body is absent`); return; }
  const s = brief(m);
  if (!m.posed || !(m.scroll[1] > m.scroll[2] + 300)) fail(`${tag}: staging — the long pose did not land (filler present, content > view + 300): ${s}`);
  if (m.marker || !(m.varB === 0)) fail(`${tag}: staging — the stale shell must leave the reserve at the shell.css default 0px with NO inline publish on :root: ${s}`);
  if (m.coarse !== coarse) fail(`${tag}: staging — expected the ${coarse ? 'coarse' : 'fine'} register: ${s}`);
  const law = coarse ? m.vh - FALLBACK_COARSE - m.sa.t - m.sa.b : m.vh - FALLBACK_DESKTOP - m.sa.t;
  if (!(Math.abs(m.secMax - law) <= 0.5)) fail(`${tag}: with the reserve UNPUBLISHED the cap must be the pre-seam law ${coarse ? 'vh - 212 - sa-top - sa-bottom' : 'vh - 130 - sa-top'} = ${r1(law)} (the var() fallback never engages on a DEFINED 0px — the marker gate): ${s}`);
  if (!(m.visibleBottom <= m.bandTop + 0.5)) fail(`${tag}: the Play content (visible bottom ${r1(m.visibleBottom)}) must never extend under the quick-play / rail band (top ${r1(m.bandTop)}): ${s}`);
  console.log(`${tag} measured: cap ${r1(m.secMax)} (law ${r1(law)}), content bottom ${r1(m.visibleBottom)} vs band top ${r1(m.bandTop)} (clear by ${r1(m.bandTop - m.visibleBottom)} px; section box overhang ${r1(m.sec.b - m.bandTop)} px): ${s}`);
}
/** the fresh pairing's laws (the seam consumed; the r2 captions unchanged) */
function judgeFresh(m, fail, tag) {
  if (m.absent) { fail(`${tag}: the play section / body is absent`); return; }
  const s = brief(m);
  if (!m.marker || !(m.reserve !== null)) fail(`${tag}: the fresh shell must publish the reserve on :root (marker) and expose bands(): ${s}`);
  if (!(Math.abs(m.varB - m.reserve) <= 0.51)) fail(`${tag}: --ob-shell-reserve-b must equal bands().reserve.bottom: ${s}`);
  const law = m.vh - 14 - m.sa.t - m.varB;
  if (!(Math.abs(m.secMax - law) <= 0.5)) fail(`${tag}: the fresh cap must consume the published reserve (vh - 14 - sa-top - var = ${r1(law)}): ${s}`);
  if (!(m.sec.b <= m.vh - m.reserve + 1)) fail(`${tag}: the section bottom must sit inside the shell's reserve: ${s}`);
  if (!(m.visibleBottom <= m.bandTop + 0.5)) fail(`${tag}: the Play content must stay clear of the quick-play / rail band: ${s}`);
  console.log(`${tag} measured: cap ${r1(m.secMax)} (law ${r1(law)}), content bottom ${r1(m.visibleBottom)} vs band top ${r1(m.bandTop)}: ${s}`);
}

/** arm the interceptor that answers app/shell.js with the derived module */
async function serveStale(c, body) {
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  const st = { served: 0 };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const { requestId, request } = params;
    if (/\/app\/shell\.js(\?|$)/.test(request.url)) {
      st.served += 1;
      c.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }],
        body: Buffer.from(body).toString('base64') }).catch(() => {});
      return;
    }
    c.send('Fetch.continueRequest', { requestId }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*app/shell.js*' }] });
  return st;
}
const gate = (errs, tag, fail) => {
  const bad = errs.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (bad.length) fail(`${tag}: page errors: ${bad.slice(0, 3).join(' | ')}`);
  errs.length = 0;
};

export async function armPStaleShell({ PORT, CDP_PORT, fail, webDir }) {
  const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&u=${u}`;
  const origin = `http://127.0.0.1:${PORT}/`;
  const staleJs = staleShellSource(webDir);
  const f0 = { n: 0 };
  const wrapFail = (m) => { f0.n += 1; fail(m); };
  const notch = { n: 0 };
  const notchFail = (m) => { notch.n += 1; fail(m); };
  // ---- STALE pairing: phone 844x390 coarse (+4), en / de long pose, then the notch
  {
    const errs = [];
    const c = await launchChrome(origin, { port: CDP_PORT + 4, tool: false });
    watchErrors(c, errs);
    await setPhoneMetrics(c, { width: 844, height: 390 });
    const st = await serveStale(c, staleJs);
    await c.send('Page.navigate', { url: url('stale-phone') });
    if (!(await boot(c))) wrapFail('P-STALE-SHELL 844: the stale-shell boot never mounted play');
    else {
      if (st.served < 1) wrapFail('P-STALE-SHELL 844: the stage never bit — app/shell.js was not fulfilled with the derived module');
      for (const loc of ['en', 'de']) {
        if (loc !== 'en') { await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`); await sleep(500); }
        await c.eval(LONG_POSE); await sleep(600);
        const m = await c.eval(MEASURE);
        if (m.locale !== loc) wrapFail(`P-STALE-SHELL 844 [${loc}]: the locale did not land: ${brief(m)}`);
        judgeStale(m, wrapFail, `P-STALE-SHELL 844 [${loc}]`, { coarse: true });
      }
      // P-NOTCH-FALLBACK: the notch profile on the SAME stale pairing (en pose stands)
      await c.eval(`window.__i18n.setLocale('en')`); await sleep(400);
      const mode = await setSafeAreaInsets(c, PHONE_SA);
      if (mode === null) notchFail('P-NOTCH-FALLBACK: Emulation.setSafeAreaInsetsOverride is unavailable on this Chrome build — the arm needs the pinned chrome-headless-shell (touch-e2e.md §4.1)');
      else if (!(await reboot(c))) notchFail('P-NOTCH-FALLBACK: the stale-shell boot under the notch insets never mounted play');
      else {
        if (st.served < 2) notchFail('P-NOTCH-FALLBACK: the stage never bit on the notch document — app/shell.js was not fulfilled again after the reload');
        await c.eval(LONG_POSE); await sleep(600);
        const m = await c.eval(MEASURE);
        if (!(m.sa.b === PHONE_SA.bottom)) notchFail(`P-NOTCH-FALLBACK: staging — the notch insets did not reach env() (mode=${mode}): ${brief(m)}`);
        judgeStale(m, notchFail, 'P-NOTCH-FALLBACK 844 SA', { coarse: true });
        if (!(m.sec.b <= m.vh - m.sa.b + 0.5)) notchFail(`P-NOTCH-FALLBACK: the panel's bottom edge (${r1(m.sec.b)}) must sit at or above the viewport bottom minus the inset (${m.vh - m.sa.b}): ${brief(m)}`);
        await setSafeAreaInsets(c, { top: 0, left: 0, right: 0, bottom: 0 });
      }
      gate(errs, 'P-STALE-SHELL 844', wrapFail);
    }
    c.close(); await sleep(400);
  }
  // ---- STALE pairing: desktop 1024x768 fine (+0), en / de long pose
  {
    const errs = [];
    const c = await launchChrome(origin, { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    const st = await serveStale(c, staleJs);
    await c.send('Page.navigate', { url: url('stale-desktop') });
    if (!(await boot(c))) wrapFail('P-STALE-SHELL 1024: the stale-shell boot never mounted play');
    else {
      if (st.served < 1) wrapFail('P-STALE-SHELL 1024: the stage never bit — app/shell.js was not fulfilled with the derived module');
      for (const loc of ['en', 'de']) {
        if (loc !== 'en') { await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`); await sleep(500); }
        await c.eval(LONG_POSE); await sleep(600);
        const m = await c.eval(MEASURE);
        if (m.locale !== loc) wrapFail(`P-STALE-SHELL 1024 [${loc}]: the locale did not land: ${brief(m)}`);
        judgeStale(m, wrapFail, `P-STALE-SHELL 1024 [${loc}]`, { coarse: false });
      }
      gate(errs, 'P-STALE-SHELL 1024', wrapFail);
    }
    c.close(); await sleep(400);
  }
  // ---- FRESH pairing unchanged: the same poses, no interceptor (phone +4, desktop +0)
  for (const [vp, slot] of [['844', CDP_PORT + 4], ['1024', CDP_PORT]]) {
    const errs = [];
    const phone = vp === '844';
    const c = phone ? await launchChrome(origin, { port: slot, tool: false })
      : await launchChrome(origin, { port: slot, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    if (phone) await setPhoneMetrics(c, { width: 844, height: 390 });
    await c.send('Page.navigate', { url: url('fresh-' + vp) });
    if (!(await boot(c))) wrapFail(`P-STALE-SHELL fresh ${vp}: the boot never mounted play`);
    else {
      for (const loc of ['en', 'de']) {
        if (loc !== 'en') { await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`); await sleep(500); }
        await c.eval(LONG_POSE); await sleep(600);
        const m = await c.eval(MEASURE);
        judgeFresh(m, wrapFail, `P-STALE-SHELL fresh ${vp} [${loc}]`);
        if (phone && loc === 'en' && !(Math.abs(m.secMax - 232) <= 0.5)) console.log(`P-STALE-SHELL fresh 844 [en] NOTE: the cap reads ${r1(m.secMax)} where the r2 caption measured 232 (the seam law above still holds — the shell's reserve moved)`);
      }
      if (phone) { // the fresh pairing under the notch: the reserve carries the inset, the content stays clear
        await c.eval(`window.__i18n.setLocale('en')`); await sleep(400);
        if ((await setSafeAreaInsets(c, PHONE_SA)) !== null) {
          if (!(await reboot(c))) notchFail('P-NOTCH-FALLBACK fresh: the boot under the notch insets never mounted play');
          await c.eval(LONG_POSE); await sleep(600);
          const m = await c.eval(MEASURE);
          judgeFresh(m, notchFail, 'P-NOTCH-FALLBACK fresh 844 SA');
          if (!(m.sec.b <= m.vh - m.sa.b + 0.5)) notchFail(`P-NOTCH-FALLBACK fresh: the panel's bottom edge (${r1(m.sec.b)}) must sit above the viewport bottom minus the inset: ${brief(m)}`);
          await setSafeAreaInsets(c, { top: 0, left: 0, right: 0, bottom: 0 });
        }
      }
      gate(errs, `P-STALE-SHELL fresh ${vp}`, wrapFail);
    }
    c.close(); await sleep(400);
  }
  if (f0.n === 0) console.log('P-STALE-SHELL OK: the derived pre-B-K05 shell.js over the fresh play.css keeps the Play content clear of the quick-play / rail band on the pre-seam caps (844x390 coarse 212 + sa-bottom, 1024x768 130; en + de, Details open + 40 x 20 px filler rows + scroller at end; the marker gate engages the fallback on a DEFINED 0px reserve); the fresh pairing consumes the published reserve unchanged (cap = vh - 14 - sa-top - var)');
  else console.log(`P-STALE-SHELL RED (${f0.n} failure line(s) above)`);
  if (notch.n === 0) console.log('P-NOTCH-FALLBACK OK: 844x390 under notch insets 47/47/21 on the stale pairing — the fallback cap = vh - 212 - sa-top - sa-bottom (157), the panel bottom above vh - inset, the content clear of the lifted band; the fresh pairing under the same insets keeps the seam law');
  else console.log(`P-NOTCH-FALLBACK RED (${notch.n} failure line(s) above)`);
}

// ---- standalone (the gate imports armPStaleShell above) --------------------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPStaleShell({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-STALE FAIL (${n})` : 'E2E-PLAY-STALE PASS');
}
