// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-fork-locale.mjs — arm P-FORK-LOCALE of the play-place gate (GH-668
// S5 play review review r1, P2-2: the carom fork's GH-667 copy
// guard — split NOUN keys only when the dictionary carries them, else the
// retained legacy qualifier labels — was computed ONCE at boot, so a boot in
// de with a fresh de.json and a cached pre-split en.json left the segment
// labels + hint bound to the split keys and the switch to en painted the
// raw `shell.place.play.carom2b.*` keys; the ownership ledger mixed-cache law).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; scripted
// carom `obshell=1` boots; ONE dictionary served STALE at the network — the
// on-disk file minus every `shell.place.play.carom2b.*` key — through CDP
// Fetch interception, the other dictionaries fresh):
//   * boot in de (fresh) over a stale en: the segments read the de NOUNS and
//     the de hint line is visible, wired by aria-describedby;
//   * switching to en through the settings path (`__settings.set('language')`
//     → setLocale): ZERO text nodes under the play section match
//     /shell\.place\.play\.carom2b\./; the segments read the retained LEGACY
//     en labels (`settings.caromSecondBall.{yellow,marked}`); the hint is
//     hidden; the group's aria-describedby is absent or resolves to a
//     visible node; `__i18n.missing()` carries no carom2b key (no t() on a
//     missing key — the guard, not the fallback, chose the copy);
//   * back to de: the split copy again (nouns + visible hint, describedby);
//   * the reverse mix (desktop): a STALE de over a fresh en boots in de with
//     the de LEGACY qualifiers — never the English nouns through has()'s en
//     fallback — hint hidden; the switch to en (fresh) paints the en nouns +
//     hint.
//
// Runs INSIDE e2e-play.mjs (imported; after P-BROWSE-FALLBACK — re-uses the
// +0 desktop and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands
// alone for a fast red proof (the pre-fix bytes: after the switch to the stale
// en the two segments and the hint painted the raw keys, `missing()` listed
// the three keys):
//   node web/tools/e2e-play-fork-locale.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SPLIT_RE = /^shell\.place\.play\.carom2b\./;
const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
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
async function waitFork(c, tries = 40 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`(() => { const k = document.querySelector('[data-ob="play-carom2b"]');
        return !!k && !k.hidden && window.__settings?.get?.().game === 'carom_3cushion'; })()`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
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
const dictOf = (webDir, loc) => JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
/** serve the named locales STALE (the on-disk dictionary minus the split
 * keys) at the network; every other locale passes through fresh. The e2e-play
 * blockUrl cure: Network.enable BEFORE setCacheDisabled (else the reload
 * reuses the first boot's dictionary from the renderer MemoryCache and
 * nothing pauses), the service-worker bypass, then Fetch.enable. Returns a
 * counter of stale dictionaries served (staging proof). */
async function serveStale(c, webDir, staleLocales) {
  const served = { n: 0, locales: [] };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const m = /\/app\/locales\/([\w-]+)\.json/.exec(params.request.url);
    if (!m || !staleLocales.includes(m[1])) { c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); return; }
    const d = dictOf(webDir, m[1]);
    for (const k of Object.keys(d)) if (SPLIT_RE.test(k)) delete d[k];
    served.n += 1; served.locales.push(m[1]);
    c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from(JSON.stringify(d)).toString('base64') }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*locales/*.json*' }] });
  return served;
}
/** a scripted carom boot in `lang` with `stale` dictionaries: first boot (the
 * profile warms), pin the blob, arm the interception, reload, wait for the fork */
async function bootCarom(c, webDir, { lang, stale }) {
  if (!(await waitReady(c))) return null;
  await c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}');
    s.game = 'carom_3cushion'; s.language = ${JSON.stringify(lang)}; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); return true; })()`);
  const served = await serveStale(c, webDir, stale);
  await c.eval('(location.reload(), true)');
  await sleep(500);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c)) || !(await waitFork(c))) return null;
  await sleep(700); // kit upgrade + the stack measure frame
  return served;
}
// page-side probe: the segment texts, the hint, the describedby wiring, every
// raw split key painted anywhere under the play section, i18n's missing set
const PROBE = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const host = sec?.querySelector('[data-ob="play-carom2b"]');
  if (!host || host.hidden) return { absent: true };
  const g = host.querySelector(':scope > [role="radiogroup"]');
  if (!g) return { absent: true, noGroup: true };
  const raw = []; const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (/shell\\.place\\.play\\.carom2b\\./.test(n.data)) raw.push(n.data.trim().slice(0, 60));
  const hn = sec.querySelector('[data-ob="play-carom2b-hint"]');
  const desc = g.getAttribute('aria-describedby');
  const target = desc ? document.getElementById(desc) : null;
  return {
    lang: document.documentElement.lang, locale: window.__i18n?.locale?.() ?? null,
    labels: [...g.querySelectorAll(':scope > label')].map((l) => l.textContent.trim()),
    hint: hn ? { hidden: hn.hidden, shown: !hn.hidden && hn.getClientRects().length > 0, text: hn.textContent.trim() } : null,
    desc, descVisible: !!target && !target.hidden && target.getClientRects().length > 0, descIsHint: !!target && target === hn,
    raw, missing: (window.__i18n?.missing?.() ?? []).filter((k) => /carom2b/.test(k)),
  };
})()`;
async function switchTo(c, loc) {
  await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)})`);
  for (let i = 0; i < 60; i++) {
    if (await c.eval(`document.documentElement.lang === ${JSON.stringify(loc)} && window.__i18n.locale() === ${JSON.stringify(loc)}`).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(450); // the locale listeners (applyDom / play sync) + the kit's rAF measure
  return c.eval(PROBE).catch(() => null);
}
/** the SPLIT register: nouns + a visible hint wired by aria-describedby, no raw key */
function judgeSplit(f, x, fail, tag) {
  const bad = [];
  if (!f || f.absent) { fail(`${tag}: fork host ${f?.noGroup ? 'has no radiogroup' : 'absent / hidden'}`); return; }
  if (f.raw.length) bad.push(`raw key text painted: ${JSON.stringify(f.raw)}`);
  if (f.labels.length !== 2 || f.labels[0] !== x.yellow || f.labels[1] !== x.marked) bad.push(`segments ${JSON.stringify(f.labels)} ≠ nouns ${JSON.stringify([x.yellow, x.marked])}`);
  if (!f.hint || !f.hint.shown || f.hint.text !== x.hint) bad.push(`hint must be visible with "${x.hint.slice(0, 40)}…": ${JSON.stringify(f.hint)}`);
  if (!f.desc || !f.descIsHint || !f.descVisible) bad.push(`aria-describedby must resolve to the visible hint: ${JSON.stringify({ desc: f.desc, isHint: f.descIsHint, visible: f.descVisible })}`);
  if (f.missing.length) bad.push(`i18n missing-key register carries ${JSON.stringify(f.missing)}`);
  if (bad.length) fail(`${tag}: ${bad.join('; ')} (lang ${f.lang} / locale ${f.locale})`);
}
/** the LEGACY register (a stale dictionary): the retained qualifier labels, hint hidden, no raw key, no missing key */
function judgeLegacy(f, x, fail, tag) {
  const bad = [];
  if (!f || f.absent) { fail(`${tag}: fork host ${f?.noGroup ? 'has no radiogroup' : 'absent / hidden'}`); return; }
  if (f.raw.length) bad.push(`raw key text painted: ${JSON.stringify(f.raw)}`);
  if (f.labels.length !== 2 || f.labels[0] !== x.yellowLegacy || f.labels[1] !== x.markedLegacy) bad.push(`segments ${JSON.stringify(f.labels)} ≠ the retained legacy labels ${JSON.stringify([x.yellowLegacy, x.markedLegacy])}`);
  if (f.hint && f.hint.shown) bad.push(`the hint must be hidden under a stale dictionary: ${JSON.stringify(f.hint)}`);
  if (f.desc && !f.descVisible) bad.push(`aria-describedby ${f.desc} points at a hidden / absent node`);
  if (f.missing.length) bad.push(`i18n missing-key register carries ${JSON.stringify(f.missing)} (t() ran on a key the guard should have refused)`);
  if (bad.length) fail(`${tag}: ${bad.join('; ')} (lang ${f.lang} / locale ${f.locale})`);
}
const expected = (webDir, loc) => {
  const d = dictOf(webDir, loc);
  return { yellow: d['shell.place.play.carom2b.yellow'], marked: d['shell.place.play.carom2b.marked'], hint: d['shell.place.play.carom2b.hint'],
    yellowLegacy: d['settings.caromSecondBall.yellow'], markedLegacy: d['settings.caromSecondBall.marked'] };
};
/** fresh de over a STALE en: de split → en legacy (no raw key) → de split */
async function legStaleEn(c, fail, tag, webDir) {
  const served = await bootCarom(c, webDir, { lang: 'de', stale: ['en'] });
  if (!served) { fail(`${tag}: the carom boot in de never posed the fork`); return; }
  if (!served.locales.includes('en')) { fail(`${tag}: staging — the stale en dictionary was never served (${JSON.stringify(served)})`); return; }
  const de = expected(webDir, 'de'), en = expected(webDir, 'en');
  const f0 = await c.eval(PROBE).catch(() => null);
  if (f0?.locale !== 'de') { fail(`${tag}: the boot did not land in de (${f0?.locale})`); return; }
  judgeSplit(f0, de, fail, `${tag} boot de (fresh) over a stale en`);
  const f1 = await switchTo(c, 'en');
  if (f1?.locale !== 'en') fail(`${tag}: the switch to en did not land (${f1?.locale})`);
  judgeLegacy(f1, en, fail, `${tag} → en (STALE dictionary)`);
  const f2 = await switchTo(c, 'de');
  if (f2?.locale !== 'de') fail(`${tag}: the switch back to de did not land (${f2?.locale})`);
  judgeSplit(f2, de, fail, `${tag} → de again (fresh)`);
  console.log(`${tag}: stale en served ×${served.n}; de ${JSON.stringify(f0?.labels)} hint ${f0?.hint?.shown}; en ${JSON.stringify(f1?.labels)} hint ${f1?.hint?.shown} raw ${f1?.raw?.length} missing ${JSON.stringify(f1?.missing)}; de ${JSON.stringify(f2?.labels)} hint ${f2?.hint?.shown}`);
}
/** the reverse mix: a STALE de over a fresh en boots in de with the de LEGACY labels; en (fresh) splits */
async function legStaleDe(c, fail, tag, webDir) {
  const served = await bootCarom(c, webDir, { lang: 'de', stale: ['de'] });
  if (!served) { fail(`${tag}: the carom boot in de never posed the fork`); return; }
  if (!served.locales.includes('de')) { fail(`${tag}: staging — the stale de dictionary was never served (${JSON.stringify(served)})`); return; }
  const de = expected(webDir, 'de'), en = expected(webDir, 'en');
  const f0 = await c.eval(PROBE).catch(() => null);
  if (f0?.locale !== 'de') { fail(`${tag}: the boot did not land in de (${f0?.locale})`); return; }
  judgeLegacy(f0, de, fail, `${tag} boot de (STALE dictionary) over a fresh en`);
  const f1 = await switchTo(c, 'en');
  if (f1?.locale !== 'en') fail(`${tag}: the switch to en did not land (${f1?.locale})`);
  judgeSplit(f1, en, fail, `${tag} → en (fresh)`);
  console.log(`${tag}: stale de served ×${served.n}; de ${JSON.stringify(f0?.labels)} hint ${f0?.hint?.shown} raw ${f0?.raw?.length} missing ${JSON.stringify(f0?.missing)}; en ${JSON.stringify(f1?.labels)} hint ${f1?.hint?.shown}`);
}
async function gate(c, errs, tag, fail) {
  const pageErrs = await c.eval('window.__test?.errors ?? []').catch(() => []);
  const all = [...errs, ...pageErrs];
  if (all.length) fail(`${tag}: console errors / uncaught exceptions — ${all.slice(0, 3).join(' | ')}`);
}
export async function armPForkLocale({ PORT, CDP_PORT, fail, webDir }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine): stale en, then the reverse mix
    const errs = [];
    const c = await launchChrome(url('u=forkloc'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    await legStaleEn(c, fail, 'P-FORK-LOCALE desktop', webDir);
    await gate(c, errs, 'P-FORK-LOCALE desktop', fail);
    c.close();
    const errs2 = [];
    const c2 = await launchChrome(url('u=forklocrev'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c2, errs2);
    await legStaleDe(c2, fail, 'P-FORK-LOCALE desktop reverse', webDir);
    await gate(c2, errs2, 'P-FORK-LOCALE desktop reverse', fail);
    c2.close();
  }
  { // ---- phone 844x390 (coarse): stale en
    const errs = [];
    const c = await launchPhone(url('u=forklocphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    await legStaleEn(c, fail, 'P-FORK-LOCALE phone', webDir);
    await gate(c, errs, 'P-FORK-LOCALE phone', fail);
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPForkLocale above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPForkLocale({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-FORK-LOCALE FAIL (${n})` : 'E2E-PLAY-FORK-LOCALE PASS');
}
