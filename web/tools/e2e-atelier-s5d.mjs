// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5d.mjs — GH-668 S5 review r2 (P2-3): the copy S5
// added is hasLocal()-gated against a CACHED pre-S5 locale dictionary. A LEG
// MODULE of e2e-atelier.mjs (the e2e-atelier-s5w/x/y/z precedent): the suite
// calls runS5D with its band; standalone (`node web/tools/e2e-atelier-s5d.mjs`
// under run-gate) runs the same arms in isolation for red/green proofs.
//
// S5-D  i18n.js fetchDict() is an unversioned default-cache request, so a
//       returning client can pair FRESH atelier.js with the base (c1b78943)
//       locale JSON — the documented mixed-cache deployment (the ownership ledger
//       :44-46). Pre-fix (b326cda4) that pairing painted RAW KEYS: the leave
//       confirm's atelier.leave.title / .body, the arrival hint, the preview
//       badge, the rail count, the stat legend. The arm serves the STALE
//       dictionary at the network for en + de (Fetch.fulfillRequest on
//       *locales/*.json: the live file minus the seven keys this slice added,
//       atelier.preview.note restored to its legacy sentence — the c1b78943
//       key set, verified offline against `git show c1b78943:…`), boots a
//       cache-disabled document, and censuses every TEXT NODE and aria-label
//       under #ob-atelier / #ob-atelier-rail / #ob-atelier-cue / #ob-shell-
//       note / the kit confirm for /^atelier\./ (zero allowed) at:
//       1  ARRIVAL       station null (the arrival hint hides or speaks);
//       2  CUE-CARD      desktop: a NON-equipped cue's card (the stat legend
//                        hides or speaks); the rail count badge;
//       3  STAGED        a cloth chip staged: the bar presents, the badge
//                        hides, the note reads the LEGACY sentence (desktop —
//                        the coarse one-row bar hides the note by law);
//       4  LEAVE         `__atelier.go('table')` (no force): either NO confirm
//                        (the pre-S5 revert + move path: station table, bar
//                        hidden, preview inactive, the notice legacy copy) or
//                        a confirm with NO raw key — then the same in de after
//                        `__i18n.setLocale('de')` (re-evaluated on locale
//                        change; the stale de served at the network).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, answerPausedRequest,
} from './cdp.mjs';
import { launchPhone, setSafeAreaInsets } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5D; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
// the stale dictionary's ONE truth lives in the pure e2e-atelier-stale.mjs (r5): re-exported here for the record's readers
export { S5_KEYS, LEGACY_NOTE, staleDictionary } from './e2e-atelier-stale.mjs';
// an `export … from` binds NOTHING locally (the r5 tooling red: "LEGACY_NOTE is not defined" in the FULL's S5-D leg — node --check cannot see it; run the leg)
import { LEGACY_NOTE, staleDictionary } from './e2e-atelier-stale.mjs';
async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(ms); }
  return false;
}
const BAR = `document.querySelector('[data-ob="atelier-txbar"]')`;
// the checked chip's identity is its `data-color` id; the factory chip's id is the EMPTY string by
// construction (atelier.js builds `['', ...CLOTH_COLOR_IDS]`), so name it — a bare read logged '' there
const CHECKED = `((el) => el ? (el.dataset.color || 'factory') : null)(document.querySelector('[data-ob="atelier-cloth-colors"] .ob-cloth-chip[aria-checked="true"]'))`;
/** every text node + aria-label under the place's roots that reads as a raw key */
const CENSUS = `(() => {
  const roots = ['#ob-atelier', '#ob-atelier-rail', '#ob-atelier-cue', '#ob-shell-note', '.ob-confirm[data-ob="confirm"]'].flatMap((s) => [...document.querySelectorAll(s)]);
  const raw = [];
  const where = (el) => el ? (el.dataset?.ob || el.dataset?.i18n || el.id || el.className || el.tagName) : '?';
  for (const root of roots) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const s = n.nodeValue.trim(); if (/^atelier\\./.test(s)) raw.push({ text: s.slice(0, 48), at: where(n.parentElement) }); }
    for (const el of [root, ...root.querySelectorAll('[aria-label]')]) { const a = el.getAttribute('aria-label') || ''; if (/(^|\\W)atelier\\.[a-zA-Z.]+/.test(a)) raw.push({ text: 'aria-label ' + a.slice(0, 48), at: where(el) }); }
  }
  return raw;
})()`;
const BAR_STATE = `(() => { const bar = ${BAR}; if (!bar) return null; const badge = bar.querySelector('[data-i18n="atelier.preview.badge"]'); const note = bar.querySelector('[data-i18n="atelier.preview.note"]'); const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0; return { hidden: bar.hidden, badgeVisible: vis(badge), badgeText: badge?.textContent ?? null, noteVisible: vis(note), noteText: note?.textContent ?? null }; })()`;
const NOTE_TEXT = `(document.getElementById('ob-shell-note')?.textContent ?? '')`;

export async function runS5D({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-D ${m}`);
  let cells = 0;
  // the live dictionaries, staled per locale (fetched once from the suite's own static server)
  const stale = {};
  for (const loc of ['en', 'de']) {
    const res = await fetch(`http://127.0.0.1:${PORT}/app/locales/${loc}.json`);
    if (!res.ok) { fail(`could not read the live ${loc} dictionary (${res.status})`); return; }
    const d = staleDictionary(await res.json(), loc); // the documented transform (r5): the same bytes the r2 leg served
    stale[loc] = Buffer.from(JSON.stringify(d), 'utf8').toString('base64');
  }
  // the literal tuple list bounds the cells (cdp 1: both kinds on +0, sequential)
  for (const [kind, w, h] of [['desktop', 1280, 800], ['phone', 844, 390]]) {
    const tag = `${kind} ${w}x${h}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5d_${kind}_${u}`;
    const c = kind === 'phone'
      ? await launchPhone(url('warm'), { cdpPort: CDP_PORT, width: w, height: h, tool: false })
      : await launchChrome(url('warm'), { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    let stalePhase = false; const served = { en: 0, de: 0, other: 0 };
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') { if (stalePhase) errs.push(params.args.map((a) => a.value ?? a.description).join(' ')); return; }
      if (method === 'Runtime.exceptionThrown') { if (stalePhase) errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text); return; }
      if (method !== 'Fetch.requestPaused') return;
      const m = /locales\/([a-zA-Z-]+)\.json/.exec(params.request.url);
      const loc = m && stale[m[1]] ? m[1] : null;
      if (loc) {
        served[loc] += 1;
        // #915: a paused request the page abandoned answers "Invalid InterceptionId." — tolerated and counted by the
        // helper; any other rejection fails this cell by name instead of escaping as an unhandled rejection
        answerPausedRequest(c, 'Fetch.fulfillRequest', params, { responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: stale[loc] }, { fail: (e) => fail(`${tag}: ${e}`) });
      } else { if (m) served.other += 1; answerPausedRequest(c, 'Fetch.continueRequest', params, {}, { fail: (e) => fail(`${tag}: ${e}`) }); }
    });
    try {
      if (kind === 'phone') await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: warm boot never ready`); continue; }
      await c.send('Network.enable');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*locales/*.json*' }] });
      stalePhase = true;
      await c.send('Page.navigate', { url: url('stale') });
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: stale boot never ready`); continue; }
      const took = await c.eval(`typeof window.__i18n === 'object' && !window.__i18n.keys().includes('atelier.leave.title') && window.__i18n.t('atelier.preview.note') === ${J(LEGACY_NOTE.en)}`);
      log(`S5-D ${tag}: stale en served x${served.en}, poison took ${took}`);
      if (!took) { fail(`${tag}: the stale en dictionary did not take (served ${J(served)})`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'typeof window.__atelier === "object"', 60))) { fail(`${tag}: atelier never mounted`); continue; }
      await waitExpr(c, 'window.__atelier.rail().live === true', 60);
      await sleep(400);
      const census = async (pose) => {
        const raw = await c.eval(CENSUS);
        cells += 1;
        if (raw.length) fail(`${pose}: ${raw.length} raw key(s) painted — ${raw.slice(0, 4).map((r) => `${r.text} @ ${r.at}`).join(' | ')}`);
        return raw.length;
      };
      const goSt = async (st) => { await c.eval(`__atelier.go(${J(st)}, { force: true }), true`); return waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()`, 80); };
      const stageChip = async () => {
        const ok = await c.eval(`(() => { const el = document.querySelector('[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"])'); if (!el) return false; el.click(); return true; })()`);
        return ok && waitExpr(c, `${BAR}?.hidden === false`, 40);
      };
      // GH-1001: the host card's height (F35: one height across the stations, the degrade included)
      const HOST_H = `(() => { const h = document.querySelector('#ob-shell-cards > section.ob-atelier-host'); return h && h.getClientRects().length ? +h.getBoundingClientRect().height.toFixed(1) : null; })()`;
      const walk = async (loc) => {
        const at = `${tag}/${loc}`;
        let cuesHostH = null;
        // 1 ARRIVAL (first mount only — the station is null there)
        if (loc === 'en') {
          const st = await c.eval('window.__atelier.station()');
          const arr = await c.eval(`(() => { const a = document.querySelector('[data-ob="atelier-arrival"]'); return a ? { hidden: a.hidden, text: a.textContent } : null; })()`);
          log(`S5-D ${at}: arrival station ${J(st)} line ${J(arr)}`);
          await census(`${at} ARRIVAL`);
        }
        // 2 CUE-CARD (desktop: a non-equipped cue's card carries the stat legend)
        if (kind === 'desktop') {
          if (!(await goSt('cues'))) fail(`${at}: cues never presented`);
          else {
            await sleep(300);
            cuesHostH = await c.eval(HOST_H);
            await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 60);
            const picked = await c.eval(`(() => { const b = document.querySelector('#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])'); if (!b) return null; b.click(); return b.dataset.id; })()`);
            await waitExpr(c, `window.__atelier.cardState?.()?.id === ${J(picked)}`, 40);
            await sleep(400);
            const legend = await c.eval(`[...document.querySelectorAll('[data-ob="atelier-stat-delta"]')].map((e) => e.textContent)`);
            const count = await c.eval(`document.querySelector('#ob-atelier-rail .ob-cardrail-count, #ob-atelier-rail [data-ob="atelier-rail-count"]')?.textContent ?? null`);
            log(`S5-D ${at}: cue card for ${picked}: legend ${J(legend)}, rail count ${J(count)}`);
            await census(`${at} CUE-CARD`);
            if (await c.eval(`${BAR}?.hidden === false`)) { await c.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`); await waitExpr(c, `${BAR}?.hidden === true`, 40); }
          }
        }
        // 3 STAGED
        if (!(await goSt('cloth'))) { fail(`${at}: cloth never presented`); return; }
        await sleep(300);
        const original = await c.eval(CHECKED);
        if (!(await stageChip())) { fail(`${at}: a chip press staged nothing`); return; }
        await sleep(200);
        const bar = await c.eval(BAR_STATE);
        log(`S5-D ${at}: staged, bar ${J(bar)}`);
        cells += 1;
        if (bar?.badgeVisible) fail(`${at}: STAGED the preview badge is visible under the stale dictionary (text ${J(bar.badgeText)})`);
        if (kind === 'desktop' && bar?.noteText !== LEGACY_NOTE[loc]) fail(`${at}: STAGED the note does not read the legacy sentence — ${J(bar?.noteText)} vs ${J(LEGACY_NOTE[loc])}`);
        await census(`${at} STAGED`);
        // GH-1001: the copy this change added is hasLocal-gated against the same cached dictionary — the B1
        // full-view pill and the cloth host hint stay off (never a raw key), and on the fine register the
        // cloth host keeps the one-row reserve, so the host height still equals the cues station's (F35)
        const gh = await c.eval(`(() => { const v = document.querySelector('[data-ob="atelier-view"]'); const h = document.querySelector('[data-ob="atelier-station-hint"][data-key="atelier.cloth.hint"]');
          return { view: !!v && v.isConnected && v.getClientRects().length > 0, hint: !!h && !h.hidden && h.textContent.trim().length > 0 }; })()`);
        const clothHostH = await c.eval(HOST_H);
        log(`S5-D ${at}: GH-1001 stale copy ${J(gh)}, host cues ${cuesHostH} / cloth ${clothHostH}`);
        cells += 1;
        if (gh.view) fail(`${at}: STAGED the GH-1001 full-view pill paints under the stale dictionary (its copy is absent)`);
        if (gh.hint) fail(`${at}: STAGED the GH-1001 cloth host hint paints under the stale dictionary`);
        if (kind === 'desktop' && (cuesHostH === null || clothHostH === null || Math.abs(cuesHostH - clothHostH) > 0.5)) fail(`${at}: STAGED the host card height differs by station under the stale dictionary (cues ${cuesHostH} vs cloth ${clothHostH}; F35)`);
        // 4 LEAVE
        await c.eval(`__atelier.go('table'), true`); // NO force: the leave path decides
        const settled = await waitExpr(c, `document.querySelectorAll('.ob-confirm[data-ob="confirm"]').length > 0 || (window.__atelier.station() === 'table' && !window.__shell.moving())`, 60);
        await sleep(250);
        const confirmUp = await c.eval(`document.querySelectorAll('.ob-confirm[data-ob="confirm"]').length > 0`);
        const conf = confirmUp ? await c.eval(`(() => { const p = [...document.querySelectorAll('.ob-confirm[data-ob="confirm"]')].pop(); return { title: p.querySelector('h2, h3, [data-ob="confirm-title"]')?.textContent ?? null, text: p.textContent.slice(0, 120) }; })()`) : null;
        const leaveRaw = await census(`${at} LEAVE`);
        const note = await c.eval(NOTE_TEXT);
        log(`S5-D ${at}: leave settled ${settled}, confirm ${confirmUp ? J(conf) : 'none'}, notice ${J(note)}`);
        if (confirmUp) {
          // a confirm is legal only with legacy copy — settle it with Put back so the walk continues
          await c.eval(`[...document.querySelectorAll('.ob-confirm[data-ob="confirm"]')].pop()?.querySelector('[data-ob="confirm-cancel"]')?.click(), true`);
        }
        const moved = await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving() && ${BAR}?.hidden === true`, 80);
        const z = await c.eval(`({ station: window.__atelier.station(), bar: ${BAR}?.hidden, preview: window.__settings?.preview?.active?.() ?? null })`);
        cells += 1;
        if (!moved) fail(`${at}: LEAVE the station never moved with the transaction settled — ${J(z)}`);
        if (/^atelier\./.test(note.trim())) fail(`${at}: LEAVE the shell notice reads a raw key: ${J(note)}`);
        log(`S5-D ${at}: after leave ${J(z)}, original chip ${J(original)}, checked ${J(await c.eval(CHECKED))}, raw at leave ${leaveRaw}`);
      };
      await walk('en');
      // the locale switch: the stale de served at the network; the gates re-evaluate
      await c.eval(`window.__i18n.setLocale('de'), true`);
      const de = await waitExpr(c, `window.__i18n.locale() === 'de' && window.__i18n.t('atelier.preview.note') === ${J(LEGACY_NOTE.de)}`, 80);
      log(`S5-D ${tag}: de switched ${de}, stale de served x${served.de}`);
      if (!de) fail(`${tag}: the stale de dictionary never took (served ${J(served)})`);
      else { await sleep(400); await walk('de'); }
      const bad = errs.filter((e) => !/favicon/i.test(String(e)));
      if (bad.length) fail(`${tag}: app errors on the stale document: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
      if (served.en === 0) fail(`${tag}: the network never served the stale en dictionary (interception blind)`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-D cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5D FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5D({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5D FAIL' : 'E2E-ATELIER-S5D PASS');
}
