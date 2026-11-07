// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-card.mjs — arm P-CARD of the play-place gate (GH-668 S5 slice 3
// G4, BACKLOG B-PL04 card copy budget — OWNER Q2 default A with the
// answer-B switch — + B-PL09's "English citation + ISO date on localized
// cards" line + the B-PL02 rail-card budget tightened to the WHOLE card;
// the contract's S4b `Details` reservation realized).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse, ×7
// locales; the rail cards are the kit `.ob-card-option--card` part built on
// the kit anatomy `__body > __head (__name + __badge) > __hint > __meta`):
//   * BUDGET: every rail card's offsetHeight == the tallest card ± 1 AND
//     ≤ 97 (uniform = the kit's DECLARED reserve — 2 name + 2 hint-role
//     lines at the type tokens = 96.2 px — never the longest sibling); the
//     painted content box (name top → the last of hint / meta bottom) ≤ 88;
//   * COPY (Q2 default A): the hint is the ISSUER line — no English citation
//     string ('Rules of Play') and no ISO date inside any card's hint on the
//     default switch; the `.ob-card-option__meta` text equals the page's own
//     `Intl.DateTimeFormat(<html lang>, { year, month: 'short' })` output for
//     the FIRST date the arm parses out of the entry's raw `edition` (the
//     arm's own parse — ISO / English month name — computed in Node from the
//     dist catalog, formatted by the page's Intl so ICU data never drifts
//     between Node and Chrome);
//   * SWITCH (answer B): with `?obcite=full` the section reads
//     `data-ob-citation="full"`, the hint carries the S4 citation line
//     (body — rulebook (edition)) and the meta is hidden; the scripted
//     `__play.previewCitation('full' | null)` flips it live;
//   * DETAILS (S4b): `button[data-ob="play-details"][aria-expanded]
//     [aria-controls]` is a kit ghost row after the rail, outside the rail's
//     roving set; a click and a trusted Enter flip aria-expanded; the body
//     `[data-ob="play-details-body"]` (kit .ob-hint) carries the browsed
//     card's raw `edition` and `sections` DATA + the localized Sections
//     label; the body follows an ArrowRight browse; focus stays on the
//     button; the `ob-settings-v1` blob is byte-unchanged (law 5).
//
// Runs INSIDE e2e-play.mjs (imported; after P-RESERVE — re-uses the +0
// desktop and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands
// alone for a fast red proof (the base bytes: 212 / 137 px cards sized by
// the UMB citation, the ISO date in the hint, no meta, no Details node):
//   node web/tools/e2e-play-card.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { a2Sample, judgeTextGround } from './kit-laws.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
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
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}

// ---- the arm's OWN date read of the catalog's free-text edition (ISO
// `YYYY-MM[-DD]` or an English month name + year; the earliest in the
// string) — independent of play.js's parse; the page's Intl formats it
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function expectedDate(edition) {
  const hits = [];
  const iso = /(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?/g;
  for (let m; (m = iso.exec(edition));) hits.push({ i: m.index, y: +m[1], m: +m[2] });
  const en = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(?:\d{1,2},?\s+)?(\d{4})\b/gi;
  for (let m; (m = en.exec(edition));) hits.push({ i: m.index, y: +m[2], m: MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1 });
  hits.sort((a, b) => a.i - b.i);
  return hits[0] ?? null;
}
async function catalogEntries(webDir) {
  const mod = await import(path.join(webDir, 'dist/pool-sdk/games/index.js'));
  return mod.GAME_CATALOG.map((e) => ({ id: e.id, readiness: e.readiness, body: e.provenance.body,
    rulebook: e.provenance.rulebook, edition: e.provenance.edition, sections: e.provenance.sections ?? '',
    date: expectedDate(e.provenance.edition) }));
}

// page-side probe: every rail card's box + its name / hint / meta rects and
// texts, the html lang, the section's citation switch, the Details nodes
const MEASURE = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !g) return { absent: true };
  const rd = (n) => { if (!n || n.hidden || !n.getClientRects().length) return null; const q = n.getBoundingClientRect(); return { t: q.top, b: q.bottom, l: q.left, r: q.right, h: q.height, w: q.width }; };
  const cards = [...g.querySelectorAll('[data-ob="play-game"]')].filter((k) => !k.hidden && k.getClientRects().length);
  const lang = document.documentElement.lang || 'en';
  const det = sec.querySelector('[data-ob="play-details"]'), body = sec.querySelector('[data-ob="play-details-body"]');
  return { lang, locale: window.__i18n?.locale?.() ?? null, citation: sec.dataset.obCitation ?? null,
    coarse: matchMedia('(pointer: coarse)').matches, vw: innerWidth, vh: innerHeight,
    cards: cards.map((k) => { const name = k.querySelector('.ob-card-option__name'), hint = k.querySelector('.ob-card-option__hint'), meta = k.querySelector('.ob-card-option__meta');
      const nr = rd(name), hr = rd(hint), mr = rd(meta);
      const bottoms = [nr, hr, mr].filter(Boolean).map((q) => q.b);
      return { id: k.dataset.game, h: k.offsetHeight, w: k.offsetWidth, sel: k.getAttribute('aria-selected'), cur: k.getAttribute('aria-current'),
        anatomy: !!k.querySelector(':scope > .ob-card-option__body > .ob-card-option__head > .ob-card-option__name'),
        name: name?.textContent ?? null, nameH: nr?.h ?? null, hint: hint?.textContent ?? null, hintH: hr?.h ?? null, hintShown: !!hr,
        meta: meta?.textContent ?? null, metaShown: !!mr, metaH: mr?.h ?? null,
        content: nr && bottoms.length ? Math.max(...bottoms) - nr.t : null,
        metaTabular: mr ? getComputedStyle(meta).fontVariantNumeric : null, metaPx: mr ? parseFloat(getComputedStyle(meta).fontSize) : null }; }),
    details: det ? { hidden: det.hidden, shown: !!rd(det), expanded: det.getAttribute('aria-expanded'), controls: det.getAttribute('aria-controls'),
      label: det.textContent.trim(), inRail: g.contains(det), tab: det.tabIndex, h: det.offsetHeight, ghost: det.classList.contains('ob-btn--ghost') && det.classList.contains('ob-btn'),
      bodyId: body?.id ?? null, bodyHidden: body?.hidden ?? null, bodyShown: !!rd(body), bodyText: body?.textContent ?? null, bodyGame: body?.dataset.game ?? null,
      bodyHint: body?.classList.contains('ob-hint') ?? null, focused: document.activeElement === det } : null,
    blob: localStorage.getItem('ob-settings-v1') };
})()`;
const FMT = (y, m) => `(() => { const lang = document.documentElement.lang || 'en'; try { return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(${y}, ${m} - 1, 1))); } catch { return null; } })()`;
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
const brief = (m) => JSON.stringify({ lang: m.lang, vw: m.vw, cite: m.citation, cards: m.cards.map((k) => [k.id, k.h, r1(k.content), r1(k.nameH), r1(k.hintH), k.meta]) });

/** BUDGET + COPY on one measured frame (one locale, one register) */
async function judgeFrame(c, fail, tag, entries, { full = false } = {}) {
  const m = await c.eval(MEASURE);
  if (m.absent || !m.cards.length) { fail(`${tag}: play rail absent on the page`); return m; }
  const s = brief(m);
  const hs = m.cards.map((k) => k.h), top = Math.max(...hs);
  if (!m.cards.every((k) => k.anatomy)) fail(`${tag}: every rail card must carry the kit anatomy __body > __head > __name: ${s}`);
  if (!full) {
    if (!(top <= 97)) fail(`${tag}: the tallest rail card must fit the kit --card reserve (≤ 97 px): ${s}`);
    const off = m.cards.filter((k) => Math.abs(k.h - top) > 1).map((k) => [k.id, k.h]);
    if (off.length) fail(`${tag}: every rail card must stand at the reserve (tallest ${top} ± 1) — uniform by the DECLARED reserve, not the longest sibling: ${JSON.stringify(off)} ${s}`);
    const fat = m.cards.filter((k) => !(k.content !== null && k.content <= 88)).map((k) => [k.id, r1(k.content)]);
    if (fat.length) fail(`${tag}: the painted content box (name → hint / meta) must be ≤ 88 px on every card: ${JSON.stringify(fat)} ${s}`);
  }
  for (const k of m.cards) {
    const e = entries.find((x) => x.id === k.id);
    if (!e) continue; // a scripted fixture card
    const hint = k.hint ?? '';
    if (!hint.includes(e.body)) fail(`${tag} [${k.id}]: the hint must name the issuing body (${e.body}): ${JSON.stringify(hint)}`);
    if (full) {
      if (!hint.includes(e.rulebook) || !hint.includes(e.edition)) fail(`${tag} [${k.id}]: under data-ob-citation="full" the hint must carry the S4 citation (rulebook + raw edition): ${JSON.stringify(hint)}`);
      if (k.metaShown) fail(`${tag} [${k.id}]: under the full switch the edition meta line must be hidden: ${JSON.stringify(k.meta)}`);
      continue;
    }
    if (/Rules of Play|\d{4}-\d{2}-\d{2}/.test(hint)) fail(`${tag} [${k.id}]: the default hint must carry no English citation string / ISO date (Q2 default A): ${JSON.stringify(hint)}`);
    if (!k.metaShown || !k.meta) { fail(`${tag} [${k.id}]: the edition must render in the kit __meta line: ${s}`); continue; }
    if (k.metaPx !== 12 || !/tabular-nums/.test(k.metaTabular ?? '')) fail(`${tag} [${k.id}]: the meta line is the kit's 12 px tabular-nums role: ${JSON.stringify([k.metaPx, k.metaTabular])}`);
    const want = e.date ? await c.eval(FMT(e.date.y, e.date.m)) : e.edition;
    if (k.meta.trim() !== String(want).trim()) fail(`${tag} [${k.id}]: the meta must equal the page's Intl month + year for ${JSON.stringify(e.edition)} in ${m.lang}: got ${JSON.stringify(k.meta)} want ${JSON.stringify(want)}`);
    if (k.hintH !== null && k.hintH > 2 * 12 * 1.35 + 1) fail(`${tag} [${k.id}]: the issuer hint must stay within the kit's 2 hint lines: ${r1(k.hintH)} px ${JSON.stringify(hint)}`);
  }
  return m;
}

// ---- META INK on the COMMITTED card (GH-668 S5 play vfix1, verifier F1) ----
// The kit-laws A2 ground method (a2TextRunsJs + a CSS-px still +
// judgeTextGround — the same probe the e2e-ui audit runs) applied to the
// committed card's edition line on BOTH material rungs (glass / body.
// ob-glass-off), per locale, on both viewports. Why a lane leg: the kit lifts
// __hint to --ob-text-0 on the selected register but not __meta; the audit's
// play frames judge the glass rung only (4.53:1 there — a pass by 0.03) and
// its KIT_LAW_OK 'ob-play-card__edition' row (the 667 peek geometry) swallows
// the class on every frame, so no gate judged the committed card. Red on the
// pre-fix bytes: 4.29:1 (1440 solid) / 4.30:1 (844 solid) in all 7 locales.
const SEL_RECT = `(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); if (!k) return null;
  const r = k.getBoundingClientRect(); const m = k.querySelector('.ob-card-option__meta');
  return { id: k.dataset.game, l: r.left, r: r.right, t: r.top, b: r.bottom, metaShown: !!m && !m.hidden && m.getClientRects().length > 0 }; })()`;
async function judgeMetaInk(c, fail, tag) {
  const [w, h, dpr, coarse] = await c.eval(`[innerWidth, innerHeight, devicePixelRatio, matchMedia('(pointer: coarse)').matches]`);
  const out = [];
  for (const solid of [false, true]) {
    const rung = solid ? 'solid' : 'glass';
    await c.eval(`(document.body.classList.toggle('ob-glass-off', ${solid}), true)`);
    await sleep(250);
    const sel = await c.eval(SEL_RECT);
    if (!sel) { fail(`${tag} ${rung}: no aria-current card to judge the meta ink on`); continue; }
    if (!sel.metaShown) { out.push({ rung, skipped: 'meta hidden' }); continue; }
    const sampled = await a2Sample(c, { w, h, coarse, dpr, max: 400 }); // GH-877: one state for ink + ground
    if (!sampled.settled) { fail(`${tag} ${rung}: ${sampled.unsettled} (instrument: attempts ${sampled.attemptsUsed}, settle polls ${sampled.settlePollsUsed})`); continue; }
    const runs = sampled.runs
      .filter((t) => /ob-play-card__edition/.test(t.name) && t.x >= sel.l - 1 && t.x <= sel.r && t.y >= sel.t - 1 && t.y <= sel.b);
    if (runs.length !== 1) { fail(`${tag} ${rung}: expected ONE painted edition run inside the committed card (${sel.id}), got ${runs.length}`); continue; }
    const img = sampled.img;
    const [s] = judgeTextGround(runs, img, { cssW: w, min: 99 }); // min 99 ⇒ the string carries the measured ratio
    const ratio = s ? parseFloat(/(\d+\.\d+):1/.exec(s)?.[1] ?? 'NaN') : NaN;
    if (!(ratio >= 4.5)) fail(`${tag} ${rung}: the committed card's edition meta must keep ≥ 4.5:1 against its RENDERED ground (kit-laws A2): ${s ?? 'no readable ground sample'}`);
    out.push({ rung, ratio, paint: /\((ink .*)\)$/.exec(s ?? '')?.[1] ?? null });
  }
  await c.eval(`(document.body.classList.remove('ob-glass-off'), true)`);
  await sleep(150);
  console.log(`${tag} meta ink on the committed card: ${JSON.stringify(out)}`);
}

const VK = { ArrowRight: 39, Enter: 13 };
async function pressKey(c, key, text) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0, ...(text ? { text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
}
/** DETAILS (S4b): the ghost row toggles by click + trusted Enter, the body
 * carries the browsed card's raw edition + sections, follows a browse,
 * focus stays, the blob never changes */
async function judgeDetails(c, fail, tag, entries) {
  const m0 = await c.eval(MEASURE);
  const d0 = m0.details;
  if (!d0) { fail(`${tag}: button[data-ob="play-details"] must exist (contract §3 S4b reservation)`); return; }
  const sec = 'section[data-place="play"]';
  if (d0.hidden || !d0.shown || !d0.ghost) fail(`${tag}: the Details row must be a VISIBLE kit .ob-btn.ob-btn--ghost: ${JSON.stringify(d0)}`);
  if (d0.expanded !== 'false' || d0.controls !== d0.bodyId || d0.bodyHidden !== true || d0.bodyShown) fail(`${tag}: Details must start collapsed (aria-expanded=false, aria-controls → the hidden body): ${JSON.stringify(d0)}`);
  if (d0.inRail || d0.tab !== 0) fail(`${tag}: the Details button joins no roving set (outside the rail, tabIndex 0): ${JSON.stringify(d0)}`);
  if (!d0.bodyHint) fail(`${tag}: the Details body is the kit .ob-hint role: ${JSON.stringify(d0)}`);
  const want = await c.eval(`window.__i18n?.t?.('shell.place.play.details') ?? null`);
  if (want && d0.label !== want) fail(`${tag}: the Details label is t(shell.place.play.details): got ${JSON.stringify(d0.label)} want ${JSON.stringify(want)}`);
  if (!(d0.h >= 44)) fail(`${tag}: the Details row keeps the 44 floor: ${d0.h}`);
  // click → open on the CURRENT card's citation
  await c.eval(`document.querySelector('${sec} [data-ob="play-details"]').click(); true`);
  await sleep(150);
  const m1 = await c.eval(MEASURE);
  const d1 = m1.details;
  const cur = m1.cards.find((k) => k.cur === 'true')?.id ?? null;
  const e = entries.find((x) => x.id === (d1.bodyGame || cur));
  if (d1.expanded !== 'true' || d1.bodyHidden || !d1.bodyShown) fail(`${tag}: a click must expand Details (aria-expanded=true, body shown): ${JSON.stringify(d1)}`);
  if (!e) fail(`${tag}: the Details body must name a catalog card (${d1.bodyGame} / ${cur})`);
  else {
    const txt = d1.bodyText ?? '';
    if (!txt.includes(e.edition) || !txt.includes(e.rulebook) || !txt.includes(e.body)) fail(`${tag}: the Details body must carry the FULL citation verbatim (body, rulebook, raw edition ${JSON.stringify(e.edition)}): ${JSON.stringify(txt.slice(0, 160))}`);
    if (e.sections && !txt.includes(e.sections.trim())) fail(`${tag}: the Details body must carry the sections DATA: ${JSON.stringify(txt.slice(0, 200))}`);
    const secLabel = await c.eval(`window.__i18n?.t?.('shell.place.play.details.sections') ?? null`);
    if (secLabel && e.sections && !txt.includes(secLabel + ':')) fail(`${tag}: the sections line carries the localized label ${JSON.stringify(secLabel)}: ${JSON.stringify(txt.slice(0, 120))}`);
  }
  // trusted Enter on the focused button → collapse; Enter again → expand; focus stays
  await c.eval(`document.querySelector('${sec} [data-ob="play-details"]').focus({ preventScroll: true }); true`);
  await pressKey(c, 'Enter', '\r');
  await sleep(150);
  const m2 = await c.eval(MEASURE);
  if (m2.details.expanded !== 'true' && m2.details.bodyHidden !== true) fail(`${tag}: trusted Enter must toggle the row (expected collapsed): ${JSON.stringify(m2.details)}`);
  if (m2.details.expanded !== 'false' || !m2.details.focused) fail(`${tag}: after Enter the row is collapsed and keeps focus: ${JSON.stringify(m2.details)}`);
  await pressKey(c, 'Enter', '\r');
  await sleep(150);
  const m3 = await c.eval(MEASURE);
  if (m3.details.expanded !== 'true' || !m3.details.bodyShown || !m3.details.focused) fail(`${tag}: a second Enter re-expands with focus kept: ${JSON.stringify(m3.details)}`);
  // the body FOLLOWS a browse: ArrowRight on the current rail card
  const before = m3.details.bodyGame;
  await c.eval(`(() => { const k = document.querySelector('${sec} [data-ob="play-game"][aria-current="true"]') ?? document.querySelector('${sec} [data-ob="play-game"]'); k.focus({ preventScroll: true }); return true; })()`);
  await pressKey(c, 'ArrowRight');
  await sleep(500);
  const m4 = await c.eval(MEASURE);
  const browsed = m4.cards.find((k) => k.sel === 'true')?.id ?? null;
  if (browsed && browsed !== before) {
    const eb = entries.find((x) => x.id === browsed);
    if (m4.details.bodyGame !== browsed || (eb && !(m4.details.bodyText ?? '').includes(eb.edition))) fail(`${tag}: the Details body must follow the BROWSED card (${browsed}): ${JSON.stringify({ game: m4.details.bodyGame, text: (m4.details.bodyText ?? '').slice(0, 100) })}`);
  } else console.log(`${tag}: browse leg — no aria-selected change after ArrowRight (rung-1 register?) — body stays on ${before}`);
  if (m4.blob !== m0.blob) fail(`${tag}: Details toggles / browsing must write nothing (ob-settings-v1 changed)`);
  // restore: collapse + re-select the current card
  await c.eval(`(() => { const b = document.querySelector('${sec} [data-ob="play-details"]'); if (b.getAttribute('aria-expanded') === 'true') b.click(); return true; })()`);
}

async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
async function boot(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700); // fitPeek's first sync + the fold-snap's deferred re-settle
  return true;
}
async function locales(c, fail, tag, entries) {
  for (const loc of LOCALES) {
    await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
    await sleep(600);
    const m = await judgeFrame(c, fail, `${tag} [${loc}]`, entries);
    if (!m.absent && m.locale !== loc) fail(`${tag} [${loc}]: the locale swap did not land: ${brief(m)}`);
    console.log(`${tag} [${loc}] measured: ${brief(m)}`);
    if (!m.absent) await judgeMetaInk(c, fail, `${tag} [${loc}]`);
  }
  await c.eval(`window.__i18n.setLocale('en')`);
  await sleep(500);
}
export async function armPCard({ PORT, CDP_PORT, fail, webDir }) {
  const entries = await catalogEntries(webDir);
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine): 7 locales, the Details row, the live + query switch
    const errs = [];
    const c = await launchChrome(url('u=card'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-CARD desktop: the obshell boot never mounted play');
    else {
      const m = await c.eval(MEASURE);
      if (!m.absent && (m.coarse || m.citation !== null)) fail('P-CARD desktop: expected the fine register on the default (short) citation: ' + brief(m));
      await locales(c, fail, 'P-CARD desktop', entries);
      await judgeDetails(c, fail, 'P-CARD desktop details', entries);
      // the scripted switch flips live (answer B) and back
      if (await c.eval(`window.__play.previewCitation?.('full') === true`)) {
        await sleep(300);
        const f = await judgeFrame(c, fail, 'P-CARD desktop previewCitation(full)', entries, { full: true });
        if (!f.absent && f.citation !== 'full') fail('P-CARD desktop: previewCitation("full") must set data-ob-citation="full" on the section: ' + brief(f));
        await c.eval(`window.__play.previewCitation(null)`);
        await sleep(300);
        const back = await judgeFrame(c, fail, 'P-CARD desktop previewCitation(null)', entries);
        if (!back.absent && back.citation !== null) fail('P-CARD desktop: previewCitation(null) must clear the switch: ' + brief(back));
      } else fail('P-CARD desktop: window.__play.previewCitation("full") must answer true on a scripted boot');
      await gate(c, errs, 'P-CARD desktop', fail);
      // the capture driver's query: ?obcite=full boots on answer B
      await c.eval(`(location.assign(${JSON.stringify(url('u=cardfull&obcite=full'))}), true)`);
      await sleep(600);
      if (!(await boot(c))) fail('P-CARD desktop obcite: the ?obcite=full boot never mounted play');
      else {
        const f = await judgeFrame(c, fail, 'P-CARD desktop ?obcite=full', entries, { full: true });
        if (!f.absent && f.citation !== 'full') fail('P-CARD desktop: ?obcite=full must set data-ob-citation="full" on the section: ' + brief(f));
        console.log('P-CARD desktop ?obcite=full measured: ' + brief(f));
      }
      await gate(c, errs, 'P-CARD desktop obcite', fail);
    }
    c.close();
  }
  { // ---- phone 844x390 (coarse): 7 locales + the Details row on the coarse register
    const errs = [];
    const c = await launchPhone(url('u=cardphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-CARD phone: the phone boot never mounted play');
    else {
      const m = await c.eval(MEASURE);
      if (!m.absent && !m.coarse) fail('P-CARD phone: expected the coarse register: ' + brief(m));
      await locales(c, fail, 'P-CARD phone', entries);
      await judgeDetails(c, fail, 'P-CARD phone details', entries);
      await gate(c, errs, 'P-CARD phone', fail);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPCard above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPCard({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-CARD FAIL (${n})` : 'E2E-PLAY-CARD PASS');
}
