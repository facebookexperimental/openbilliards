// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-stale-dict.mjs — arm P-STALE-DICT of the play-place gate (GH-668 S5
// play r6; review review r5 F1 on 1ca619af + the round-6 census (a) of every
// locale gate play.js decides a feature's VISIBILITY or LABEL from).
//
// THE LAW JUDGED. the ownership ledger names the MIXED-DICTIONARY pairing as
// supported: a fresh play.js over a cached PRE-CHANGE active dictionary (the
// user's own locale) beside a fresh en.json — a feature whose keys are missing
// from the ACTIVE dictionary is HIDDEN, never shown in English. On 1ca619af
// the Details expander and its "Sections" line were gated by `has()`, which
// succeeds through the en fallback, and the Details label carried a
// `data-i18n` the shell's applyDom walk translated through `t()`: a Japanese
// UI showed the English "Details" / "Sections" and logged two missing-key
// warnings. The cure: EVERY lane feature gate reads the ACTIVE dictionary
// (`hasLoc`) at label initialisation AND on the locale repaint (renderDetails
// runs on every sync; play paints the Details label itself — no `data-i18n`
// on a lane-gated node, so no walk can translate a key the active dictionary
// lacks); the carom fork already followed that law (r1 P2-2).
//
// THE STALE DICTIONARY IS DERIVED, NEVER READ FROM HISTORY (arms never read
// git): `staleDictSource(webDir, loc)` = the CURRENT app/locales/<loc>.json
// minus the FIVE keys the play lane added (LANE_KEYS below — the identical
// add-set of all seven dictionaries against the integration base); the
// transform refuses by name when any of the five is absent from the fresh
// file. Served to the judged document by Fetch.fulfillRequest (the
// P-FORK-LOCALE idiom) with `sw=0` + Network.setBypassServiceWorker; en.json
// and every other dictionary pass through fresh.
//
// P-STALE-DICT (1024x768 fine × {ja, de, ko, fr, es, zh-CN} + 844x390 coarse
// ja; a carom boot so the fork is on the page; the scripted readiness fixture
// carries a `sections` string so the Details body would render the Sections
// line on a browse):
//   * STAGED: the stale <loc>.json fulfilled ≥ 1×, `__i18n.locale() === loc`;
//   * STALE PAIRING at boot AND after a live repaint (setLocale('en') →
//     setLocale(loc), the stale dictionary refetched): the Details toggle
//     hidden (zero client rects) with NO data-i18n label attached, the body
//     hidden; the fork's segments on the locale's own LEGACY register
//     (`settings.caromSecondBall.*` — never the English nouns, never a raw
//     key) and the hint hidden; ZERO visible text under the play section
//     equal to any en value of the five lane keys (or `<value>:` as a line
//     prefix); ZERO `[i18n] missing key` console warnings and none of the
//     five keys in `__i18n.missing()`;
//   * FRESH PAIRING (the interceptor disabled, the locale re-fetched on the
//     same document): the Details toggle shown with the locale's own label,
//     its body carrying the locale's own `Sections:` prefix on the fixture
//     browse, the fork's split nouns + the hint shown in that locale; zero
//     warnings.
// RED on 1ca619af (every locale: Details shown as "Details", the Sections
// line in English, 2 warnings), GREEN ×3 on the fix.
//
// Runs INSIDE e2e-play.mjs (imported after P-FORK-LOCALE — the +0 desktop
// and +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged)
// and stands alone for a fast red proof:
//   node web/tools/e2e-play-stale-dict.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
/** the five keys the play lane added — the documented transform removes
 * exactly these from the current dictionary (never git history) */
export const LANE_KEYS = Object.freeze([
  'shell.place.play.carom2b.yellow', 'shell.place.play.carom2b.marked', 'shell.place.play.carom2b.hint',
  'shell.place.play.details', 'shell.place.play.details.sections',
]);
export const STALE_LOCALES = Object.freeze(['ja', 'de', 'ko', 'fr', 'es', 'zh-CN']);
const dictOf = (webDir, loc) => JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
/** the DERIVED pre-change dictionary of `loc`: the current file minus LANE_KEYS; refuses when a key is absent */
export function staleDictSource(webDir, loc) {
  const d = dictOf(webDir, loc);
  const absent = LANE_KEYS.filter((k) => !(k in d));
  if (absent.length) throw new Error(`stale-dict transform ${loc}: lane keys absent from the fresh dictionary: ${absent.join(', ')}`);
  for (const k of LANE_KEYS) delete d[k];
  for (const k of LANE_KEYS) if (k in d) throw new Error(`stale-dict transform ${loc}: ${k} survived`);
  return d;
}

async function waitReady(c, tries = (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitShell(c, tries = 60 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('typeof window.__shell === "object" && window.__shell.isOpen()')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
async function waitPlay(c, tries = 100 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
        && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
async function waitFork(c, tries = 60 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(`(() => { const f = document.querySelector('[data-ob="play-carom2b"]'); return !!f && !f.hidden && f.getClientRects().length > 0; })()`)) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
/** console errors + the i18n missing-key warnings (kept apart: the law counts the warnings) */
function watchConsole(c, errs, warns) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const s = params.args.map((a) => a.value ?? a.description).join(' ');
      if (/\[i18n\] missing key/.test(s)) warns.push(s);
      else if (params.type === 'error') errs.push(s);
    } else if (method === 'Runtime.exceptionThrown') {
      errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
const VK = { End: 35 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
  }
}
/** serve `locales` STALE at the network (the P-FORK-LOCALE idiom: Network.enable BEFORE setCacheDisabled, the
 * worker bypass, then Fetch.enable); every other dictionary passes through fresh; returns the staging counter */
async function serveStale(c, webDir, locales) {
  const served = { n: 0, locales: [], on: true };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const m = /\/app\/locales\/([\w-]+)\.json/.exec(params.request.url);
    if (!served.on || !m || !locales.includes(m[1])) { c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); return; }
    served.n += 1; served.locales.push(m[1]);
    c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from(JSON.stringify(staleDictSource(webDir, m[1]))).toString('base64') }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*locales/*.json*' }] });
  return served;
}
const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026', sections: 'Sec. 1-3 (synthetic)' } }]);
// page-side probe: the Details toggle / body, the fork register, every VISIBLE text under the play section, i18n's missing set
const PROBE = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  if (!sec) return { absent: true };
  const det = sec.querySelector('[data-ob="play-details"]'), body = sec.querySelector('[data-ob="play-details-body"]');
  const vis = (n) => !!n && !n.hidden && n.getClientRects().length > 0;
  const texts = []; const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT); let t;
  while ((t = w.nextNode())) { const s = t.textContent.trim(); if (!s) continue; const p = t.parentElement; if (!p || p.closest('[hidden]') || p.getClientRects().length === 0) continue; texts.push(s); }
  const hint = sec.querySelector('[data-ob="play-carom2b-hint"]');
  return { locale: window.__i18n?.locale?.() ?? null, game: window.__settings?.get?.().game ?? null,
    details: det ? { hidden: det.hidden, rects: det.getClientRects().length, label: det.textContent.trim(), i18n: det.querySelector('[data-i18n]')?.dataset.i18n ?? null, expanded: det.getAttribute('aria-expanded') } : null,
    body: body ? { shown: vis(body), game: body.dataset.game ?? null, lines: [...body.querySelectorAll('.ob-play-details__line')].map((n) => n.textContent) } : null,
    fork: { shown: vis(sec.querySelector('[data-ob="play-carom2b"]')), labels: [...sec.querySelectorAll('[data-ob="play-carom2b"] label span')].map((n) => n.textContent),
      hint: hint ? { shown: vis(hint), text: hint.textContent } : null },
    missing: window.__i18n?.missing?.() ?? null, texts,
    focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? null };
})()`;
const brief = (p) => JSON.stringify({ loc: p.locale, det: p.details && { hidden: p.details.hidden, label: p.details.label, i18n: p.details.i18n }, body: p.body && { shown: p.body.shown, game: p.body.game, lines: p.body.lines }, fork: p.fork, missing: p.missing });
/** every visible play text equal to an en value of a lane key (or carrying it as a `value:` line prefix) */
function enLeaks(p, en) {
  return LANE_KEYS.filter((k) => p.texts.some((s) => s === en[k] || s.startsWith(en[k] + ':')));
}
/** the STALE pairing: every lane-gated feature hidden, the legacy fork register, no English, no warning */
function judgeStale(p, warns, fail, tag, { loc, en, dict }) {
  if (!p || p.absent) { fail(`${tag}: play section absent`); return false; }
  const bad = [];
  if (p.locale !== loc) bad.push(`locale ${p.locale} (staging: must be ${loc})`);
  if (!p.details) bad.push('no Details toggle node');
  else {
    if (!p.details.hidden || p.details.rects !== 0) bad.push(`the Details toggle must be HIDDEN under a stale active dictionary (hidden ${p.details.hidden}, rects ${p.details.rects}, label ${JSON.stringify(p.details.label)})`);
    if (p.details.i18n !== null) bad.push(`a data-i18n label (${p.details.i18n}) is attached to a key the active dictionary lacks — the applyDom walk would translate it`);
  }
  if (p.body?.shown) bad.push(`the Details body must be hidden (lines ${JSON.stringify(p.body.lines)})`);
  if (!p.fork.shown) bad.push('staging: the carom fork is not on the page (a carom boot was expected)');
  else {
    const legacy = ['yellow', 'marked'].map((v) => dict[`settings.caromSecondBall.${v}`]);
    if (p.fork.labels.length !== 2 || p.fork.labels.some((s, i) => s !== legacy[i])) bad.push(`the fork must read the locale's LEGACY register ${JSON.stringify(legacy)}: ${JSON.stringify(p.fork.labels)}`);
    if (p.fork.hint?.shown) bad.push(`the fork hint must be hidden under a stale dictionary: ${JSON.stringify(p.fork.hint)}`);
  }
  const leaks = enLeaks(p, en);
  if (leaks.length) bad.push(`English lane copy visible in the ${loc} play place: ${leaks.map((k) => `${k}=${JSON.stringify(en[k])}`).join(', ')}`);
  const raw = p.texts.filter((s) => /^(shell|settings)\.[\w.]+$/.test(s));
  if (raw.length) bad.push(`raw keys painted: ${JSON.stringify(raw)}`);
  if (warns.length) bad.push(`${warns.length} missing-key warning(s): ${warns.slice(0, 3).join(' | ')}`);
  const miss = (p.missing ?? []).filter((k) => LANE_KEYS.includes(k));
  if (miss.length) bad.push(`lane keys in __i18n.missing(): ${JSON.stringify(miss)}`);
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(p)}`); return false; }
  return true;
}
/** the FRESH pairing: the features shown in the locale's own copy */
function judgeFresh(p, warns, fail, tag, { loc, dict }) {
  if (!p || p.absent) { fail(`${tag}: play section absent`); return false; }
  const bad = [];
  if (p.locale !== loc) bad.push(`locale ${p.locale} (staging: must be ${loc})`);
  if (!p.details || p.details.hidden || p.details.rects === 0) bad.push('the Details toggle must be SHOWN on the fresh pairing');
  else if (p.details.label !== dict['shell.place.play.details']) bad.push(`the Details label must be the locale's own ${JSON.stringify(dict['shell.place.play.details'])}: ${JSON.stringify(p.details.label)}`);
  const sec = dict['shell.place.play.details.sections'] + ':';
  if (!p.body?.shown || p.body.game !== 'fixture_game') bad.push(`the Details body must be open on the browsed fixture (${JSON.stringify(p.body)})`);
  else if (!p.body.lines.some((l) => l.startsWith(sec) && l.includes('Sec. 1-3 (synthetic)'))) bad.push(`the Sections line must carry the locale's own prefix ${JSON.stringify(sec)}: ${JSON.stringify(p.body.lines)}`);
  const split = ['yellow', 'marked'].map((v) => dict[`shell.place.play.carom2b.${v}`]);
  if (!p.fork.shown) bad.push('staging: the carom fork is not on the page');
  else {
    if (p.fork.labels.some((s, i) => s !== split[i])) bad.push(`the fork must read the split nouns ${JSON.stringify(split)}: ${JSON.stringify(p.fork.labels)}`);
    if (!p.fork.hint?.shown || p.fork.hint.text !== dict['shell.place.play.carom2b.hint']) bad.push(`the fork hint must show the locale's own copy: ${JSON.stringify(p.fork.hint)}`);
  }
  if (warns.length) bad.push(`${warns.length} missing-key warning(s) on the fresh pairing: ${warns.slice(0, 3).join(' | ')}`);
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(p)}`); return false; }
  return true;
}
const openDetails = (c) => c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && !b.hidden && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
const focusCommitted = (c) => c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); k?.focus({ preventScroll: true }); return !!k; })()`);

/** one locale on one document: stale boot → repaint leg → fresh leg */
async function locale(c, webDir, fail, tag, loc, { warns }) {
  const en = dictOf(webDir, 'en'), dict = dictOf(webDir, loc);
  await c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}');
    s.game = 'carom_3cushion'; s.language = ${JSON.stringify(loc)}; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); return true; })()`);
  const served = await serveStale(c, webDir, [loc]);
  warns.length = 0;
  await c.eval('(location.reload(), true)');
  await sleep(500);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c)) || !(await waitFork(c))) { fail(`${tag}: the stale ${loc} carom boot never posed the fork`); return; }
  await sleep(500);
  if (served.n < 1 || !served.locales.includes(loc)) { fail(`${tag}: staging — the stale ${loc} dictionary was never served (${JSON.stringify(served)})`); return; }
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(300);
  await openDetails(c); // a no-op when the toggle is hidden (the law); opens it on the pre-fix bytes
  await focusCommitted(c);
  await pressKey(c, 'End'); // the fixture browsed: its Sections line would render in the body
  await sleep(500);
  const p1 = await c.eval(PROBE);
  const okBoot = judgeStale(p1, [...warns], fail, `${tag} stale boot`, { loc, en, dict });
  // ---- the REPAINT leg: en (fresh) then back to the stale locale (refetched through the interceptor)
  warns.length = 0;
  await c.eval(`window.__i18n.setLocale('en')`);
  await sleep(600);
  const pe = await c.eval(PROBE);
  if (pe.locale !== 'en') fail(`${tag}: the swap to en did not land (${pe.locale})`);
  else if (!pe.details || pe.details.hidden || pe.details.label !== en['shell.place.play.details']) fail(`${tag}: in en (fresh) the Details toggle must show ${JSON.stringify(en['shell.place.play.details'])}: ${brief(pe)}`);
  await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
  await sleep(800);
  const p2 = await c.eval(PROBE);
  const okRepaint = judgeStale(p2, [...warns], fail, `${tag} repaint (en → stale ${loc})`, { loc, en, dict });
  // ---- the FRESH pairing on the same document: interceptor off, the locale re-fetched
  served.on = false;
  await c.send('Fetch.disable').catch(() => {});
  warns.length = 0;
  await c.eval(`window.__i18n.setLocale('en')`);
  await sleep(500);
  await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
  await sleep(800);
  await openDetails(c);
  await focusCommitted(c);
  await pressKey(c, 'End');
  await sleep(500);
  const p3 = await c.eval(PROBE);
  const okFresh = judgeFresh(p3, [...warns], fail, `${tag} fresh ${loc}`, { loc, dict });
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); window.__play.previewCatalog(null); return true; })()`).catch(() => {});
  console.log(`${tag}: stale ${loc} served ×${served.n}; boot ${okBoot ? 'ok' : 'RED'} (details hidden ${p1.details?.hidden} label ${JSON.stringify(p1.details?.label)} i18n ${p1.details?.i18n} fork ${JSON.stringify(p1.fork.labels)} hint ${p1.fork.hint?.shown} leaks ${JSON.stringify(enLeaks(p1, en))} missing ${JSON.stringify(p1.missing)}); repaint ${okRepaint ? 'ok' : 'RED'} (hidden ${p2.details?.hidden} label ${JSON.stringify(p2.details?.label)}); fresh ${okFresh ? 'ok' : 'RED'} (label ${JSON.stringify(p3.details?.label)} sections ${JSON.stringify(p3.body?.lines?.find((l) => l.includes('Sec. 1-3')) ?? null)} hint ${p3.fork.hint?.shown})`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPStaleDict({ PORT, CDP_PORT, fail, webDir }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&${q}`;
  for (const loc of STALE_LOCALES) { // ---- desktop 1024x768 (fine), one document per locale
    const errs = [], warns = [];
    const c = await launchChrome(url(`u=pstaledict-${loc}`), { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchConsole(c, errs, warns);
    if (!(await waitReady(c))) fail(`P-STALE-DICT ${loc}: the warm boot never became ready`);
    else { await locale(c, webDir, fail, `P-STALE-DICT 1024 ${loc}`, loc, { warns }); await gate(c, errs, `P-STALE-DICT 1024 ${loc}`, fail); }
    c.close();
    await sleep(400);
  }
  { // ---- phone 844x390 (coarse) ja — the CJK register of the same law
    const errs = [], warns = [];
    const c = await launchChrome(url('u=pstaledict-phone'), { port: CDP_PORT + 4, tool: false });
    await setPhoneMetrics(c, { width: 844, height: 390 });
    watchConsole(c, errs, warns);
    if (!(await waitReady(c))) fail('P-STALE-DICT phone ja: the warm boot never became ready');
    else { await locale(c, webDir, fail, 'P-STALE-DICT 844 ja', 'ja', { warns }); await gate(c, errs, 'P-STALE-DICT 844 ja', fail); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPStaleDict above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPStaleDict({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-STALE-DICT FAIL (${n})` : 'E2E-PLAY-STALE-DICT PASS');
}
