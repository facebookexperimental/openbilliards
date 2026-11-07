// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-once.mjs — arm P-ONCE of the play-place gate (GH-668 S5 slice 3
// G5: BACKLOG B-PL06 said-once under ruling R7, B-PL07 readiness card copy,
// B-PL09 / B-K24 the h3 caps role).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse):
//   * SAID ONCE (R7): `[data-ob="play-summary"]` computes `display: none`
//     while `.ob-play-host` and the rail are mounted, its textContent still
//     equals the S1 composition `Game: <name>` + `Rules: <preset>` (FR-004 —
//     the text reads survive); exactly ONE visible element in the section
//     paints the current game's name (the committed card, type role >= 14 px);
//   * CAPS ROLE: every `h3` in the play body carries the kit `.ob-caps` class
//     and (en / de) computes `text-transform: uppercase` with a letter-spacing
//     equal to `--ob-track-caps` resolved at its font size — through the
//     class, never a sheet literal;
//   * LIST OF ONE: with a one-row `__settings.variantRows` stand-in the Rules
//     heading + list are hidden and `registry().variants` still reports the
//     row; with two rows both show;
//   * READINESS CARD (B-PL07): the scripted fixture card paints NO
//     `.ob-play-card__status` line and NO `.ob-play-card__prereqs` paragraph,
//     exactly ONE visible `.ob-badge` whose text is t('settings.gameBadge.
//     <readiness>') (not `--warn`), no dashed border, the kit `aria-disabled`
//     figure (opacity 0.38) on the NAME with the card box at 1 (RESTATED by
//     the S5 play visual r1 V4 fix: the badge + meta read; P-READY-INK judges
//     the ground), the same height as its playable siblings
//     (kit --card reserve ≤ 97, content ≤ 88 — the phone peephole finding);
//     the Details body lists the prerequisite description once the card is
//     browsed (End on the rail).
//
// Runs INSIDE e2e-play.mjs (imported; after P-CARD — re-uses the +0 desktop
// and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone for a
// fast red proof (the G4-head bytes: summary painted, the name said twice,
// h3 literals from the sheet, the one-row list shown, the status line on):
//   node web/tools/e2e-play-once.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

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
        && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet
        && !!document.querySelector('section[data-place="play"] [data-ob="play-game"]'))()`)) return true;
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
const VK = { ArrowRight: 39, End: 35, Home: 36, Enter: 13 };
async function pressKey(c, key, text) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0, ...(text ? { text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
}

// ---- page-side probe: the summary, every name paint, the h3s, the list ----
const MEASURE = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const body = sec?.querySelector('[data-ob="play-body"]');
  const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !body || !g) return { absent: true };
  const t = (k) => window.__i18n?.t?.(k) ?? null;
  const cs = (n) => getComputedStyle(n);
  const vis = (n) => { if (!n || n.hidden || !n.getClientRects().length) return false;
    for (let e = n; e && e !== document.body; e = e.parentElement) { const c = cs(e); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const game = window.__settings?.get?.().game ?? null;
  const name = game ? t('game.' + game) : null;
  const own = (n) => [...n.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim();
  // every VISIBLE element whose OWN text is exactly the current game's name
  const paints = [...sec.querySelectorAll('*')].filter((n) => vis(n) && name && own(n) === name)
    .map((n) => ({ tag: n.tagName.toLowerCase(), cls: n.className || null, px: parseFloat(cs(n).fontSize),
      inCurrent: !!n.closest('[data-ob="play-game"][aria-current="true"]') }));
  const sum = sec.querySelector('[data-ob="play-summary"]');
  const lang = document.documentElement.lang || 'en';
  const trackCaps = cs(document.documentElement).getPropertyValue('--ob-track-caps').trim();
  const h3s = [...body.querySelectorAll('h3')].map((h) => { const c = cs(h); const fs = parseFloat(c.fontSize);
    return { i18n: h.dataset.i18n ?? null, caps: h.classList.contains('ob-caps'), hidden: h.hidden, shown: vis(h),
      transform: c.textTransform, tracking: c.letterSpacing, fs, wantTracking: /em$/.test(trackCaps) ? parseFloat(trackCaps) * fs : parseFloat(trackCaps),
      weight: c.fontWeight, text: h.textContent.trim() }; });
  const variants = sec.querySelector('[data-ob="play-variants"]');
  const hRules = [...body.querySelectorAll('h3')].find((h) => h.dataset.i18n === 'shell.place.play.rules') ?? null;
  return { lang, locale: window.__i18n?.locale?.() ?? null, coarse: matchMedia('(pointer: coarse)').matches, vw: innerWidth,
    host: sec.classList.contains('ob-play-host'), cards: g.querySelectorAll('[data-ob="play-game"]').length,
    game, name, paints, trackCaps, h3s,
    summary: sum ? { display: cs(sum).display, hidden: sum.hidden, shown: vis(sum), text: sum.textContent,
      lines: [...sum.querySelectorAll('p')].map((p) => p.textContent) } : null,
    compose: game ? [t('shell.card.game') + ': ' + name, t('shell.card.rules') + ': '
      + ((window.__settings?.variantFor?.(game) ?? null) === null ? t('settings.variantDefault') : null)] : null,
    rules: { hHidden: hRules?.hidden ?? null, hShown: hRules ? vis(hRules) : null, listHidden: variants?.hidden ?? null,
      listShown: variants ? vis(variants) : null, picks: variants ? variants.querySelectorAll('[data-variant-pick]').length : null,
      reg: (window.__play?.registry?.().variants ?? []).length } };
})()`;
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const brief = (m) => JSON.stringify({ lang: m.lang, vw: m.vw, sum: m.summary && [m.summary.display, m.summary.shown], paints: m.paints.map((p) => [p.tag, p.cls, r1(p.px), p.inCurrent]),
  h3: m.h3s.map((h) => [h.i18n, h.caps, h.shown, h.transform, h.tracking, r1(h.wantTracking)]), rules: m.rules });

/** SAID ONCE + CAPS ROLE on one measured frame (one locale, one register) */
async function judgeOnce(c, fail, tag, { cjk = false } = {}) {
  const m = await c.eval(MEASURE);
  if (m.absent) { fail(`${tag}: no mounted play body to judge`); return m; }
  if (!m.host || !(m.cards >= 1)) { fail(`${tag}: the host class + the rail must be mounted: ${brief(m)}`); return m; }
  const s = m.summary;
  if (!s) fail(`${tag}: [data-ob="play-summary"] must exist (contract §3 — rendered, hidden under the host)`);
  else {
    if (s.display !== 'none' || s.shown) fail(`${tag}: R7 — the summary must compute display:none under the host (the selected card IS the summary): ${brief(m)}`);
    if (!m.compose || s.lines.length !== 2 || s.lines[0] !== m.compose[0] || (m.compose[1] !== null && s.lines[1] !== m.compose[1])
      || s.text !== s.lines.join('')) fail(`${tag}: FR-004 — the hidden summary must still read the S1 composition ${JSON.stringify(m.compose)}: ${JSON.stringify(s.lines)}`);
  }
  if (!m.name) fail(`${tag}: t('game.${m.game}') must resolve`);
  else if (m.paints.length !== 1) fail(`${tag}: the current game's name "${m.name}" must be painted exactly ONCE in the section (said-once): ${m.paints.length} paint(s) ${JSON.stringify(m.paints)}`);
  else if (!m.paints[0].inCurrent || !(m.paints[0].px >= 14)) fail(`${tag}: the ONE name paint is the committed card's name in the type role >= 14 px: ${JSON.stringify(m.paints[0])}`);
  if (m.h3s.length < 2) fail(`${tag}: the body carries the Discipline + Rules h3s (+ the fork's): ${brief(m)}`);
  for (const h of m.h3s) {
    if (!h.caps) fail(`${tag}: h3 ${h.i18n} must wear the kit caps role class .ob-caps (never a sheet literal): ${JSON.stringify(h)}`);
    if (!cjk) {
      if (h.transform !== 'uppercase') fail(`${tag}: h3 ${h.i18n} computes text-transform uppercase through .ob-caps: ${JSON.stringify(h)}`);
      const got = parseFloat(h.tracking);
      if (!(Math.abs(got - h.wantTracking) <= 0.05)) fail(`${tag}: h3 ${h.i18n} letter-spacing must equal --ob-track-caps (${m.trackCaps}) at ${h.fs}px = ${r1(h.wantTracking)}px, got ${h.tracking}`);
    } else if (h.transform === 'uppercase' || parseFloat(h.tracking) > 0) {
      fail(`${tag}: the kit CJK arm drops uppercase + tracking on h3 ${h.i18n}: ${JSON.stringify(h)}`);
    }
    if (!h.text) fail(`${tag}: h3 ${h.i18n} carries its localized text: ${JSON.stringify(h)}`);
  }
  return m;
}

/** LIST OF ONE: a one-row variantRows stand-in hides the Rules head + list; two rows show it */
const SHIM = (n) => `(() => {
  const s = window.__settings; if (!s) return 'no-settings';
  if (!window.__onceOrig) window.__onceOrig = { rows: s.variantRows, had: Object.prototype.hasOwnProperty.call(s, 'variantRows') };
  const mk = (i) => ({ id: 'once-' + i, value: i === 0 ? '' : 'once-' + i, label: 'Once ' + i, tier: i === 0 ? 'primary' : 'secondary', desc: 'Once preset ' + i, current: i === 0 });
  s.variantRows = () => Array.from({ length: ${n} }, (_, i) => mk(i));
  window.__play.refresh();
  return typeof s.changeVariant === 'function' ? 'shim' : 'no-changeVariant';
})()`;
const UNSHIM = `(() => { const s = window.__settings, o = window.__onceOrig; if (!s || !o) return false;
  if (o.had) s.variantRows = o.rows; else delete s.variantRows; delete window.__onceOrig; window.__play.refresh(); return true; })()`;
async function judgeListOfOne(c, fail, tag) {
  const one = await c.eval(SHIM(1));
  await sleep(200);
  const m1 = await c.eval(MEASURE);
  if (one === 'no-changeVariant') console.log(`${tag}: __settings.changeVariant absent — the list hides on the degrade rung regardless (stand-in ${one})`);
  if (one === 'no-settings') fail(`${tag}: window.__settings absent — the stand-in cannot be staged`);
  else {
    if (m1.rules.hHidden !== true || m1.rules.hShown || m1.rules.listHidden !== true || m1.rules.listShown)
      fail(`${tag}: a list of ONE is not a list — with one variantRows row the Rules h3 + list must be hidden: ${JSON.stringify(m1.rules)}`);
    if (one === 'shim' && m1.rules.reg !== 1) fail(`${tag}: registry().variants still reports the single row (the pins read the model): ${JSON.stringify(m1.rules)}`);
    const two = await c.eval(SHIM(2));
    await sleep(200);
    const m2 = await c.eval(MEASURE);
    if (two === 'shim' && (m2.rules.hHidden !== false || !m2.rules.hShown || m2.rules.listHidden !== false || !m2.rules.listShown || m2.rules.picks !== 2 || m2.rules.reg !== 2))
      fail(`${tag}: with two rows the Rules h3 + list show (2 picks, registry 2): ${JSON.stringify(m2.rules)}`);
    console.log(`${tag}: one row → ${JSON.stringify(m1.rules)}; two rows → ${JSON.stringify(m2.rules)} (${two})`);
  }
  if (!(await c.eval(UNSHIM))) fail(`${tag}: the variantRows stand-in must restore`);
  await sleep(200);
}

// ---- READINESS CARD (B-PL07): the badge IS the status ---------------------
const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
const CARD = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const cards = [...sec.querySelectorAll('[data-ob="play-game"]')].filter((k) => !k.hidden && k.getClientRects().length);
  const k = cards.find((x) => x.dataset.game === 'fixture_game');
  if (!k) return { absent: true, n: cards.length };
  const cs = (n) => getComputedStyle(n);
  const vis = (n) => !!n && !n.hidden && n.getClientRects().length > 0 && cs(n).display !== 'none' && cs(n).visibility !== 'hidden';
  const rd = (n) => (vis(n) ? n.getBoundingClientRect() : null);
  const name = k.querySelector('.ob-card-option__name'), hint = k.querySelector('.ob-card-option__hint'), meta = k.querySelector('.ob-card-option__meta');
  const bottoms = [name, hint, meta].map(rd).filter(Boolean).map((q) => q.bottom);
  const badges = [...k.querySelectorAll('.ob-badge')].filter(vis);
  // the kit head wraps a badge that does not fit beside the name (kit.css
  // .ob-card-option__head flex-wrap) — measured, never assumed
  const nr = rd(name), br = badges[0] ? rd(badges[0]) : null;
  const head = k.querySelector('.ob-card-option__head');
  const dropped = !!(nr && br) && br.top >= nr.bottom - 1;
  const nameLine = nr ? parseFloat(cs(name).lineHeight) : null;
  const rowGap = head ? parseFloat(cs(head).rowGap) || 0 : 0;
  const sib = cards.filter((x) => x !== k).map((x) => x.offsetHeight);
  const det = sec.querySelector('[data-ob="play-details"]'), body = sec.querySelector('[data-ob="play-details-body"]');
  return { n: cards.length, last: cards.at(-1) === k, h: k.offsetHeight, sib, content: nr && bottoms.length ? Math.max(...bottoms) - nr.top : null,
    dropped, badgeH: br ? br.height : null, nameLine, rowGap, nameLines: nr && nameLine ? Math.round(nr.height / nameLine) : null,
    dis: k.getAttribute('aria-disabled'), sel: k.getAttribute('aria-selected'), browsed: k.getAttribute('data-ob-browsed'), leaf: k.classList.contains('ob-cardrail-card'),
    opacity: cs(k).opacity, nameOpacity: name ? cs(name).opacity : null, border: cs(k).borderTopStyle,
    statusShown: vis(k.querySelector('.ob-play-card__status')), statusText: k.querySelector('.ob-play-card__status')?.textContent ?? null,
    preShown: vis(k.querySelector('.ob-play-card__prereqs')), preText: k.querySelector('.ob-play-card__prereqs')?.textContent ?? null,
    badges: badges.map((b) => ({ text: b.textContent.trim(), warn: b.classList.contains('ob-badge--warn'), accent: b.classList.contains('ob-badge--accent') })),
    want: window.__i18n?.t?.('settings.gameBadge.config_ready') ?? null, notPlayable: window.__i18n?.t?.('shell.place.play.notPlayable') ?? null,
    prereqLabel: window.__i18n?.t?.('settings.gamePrereqs') ?? null,
    details: det ? { expanded: det.getAttribute('aria-expanded'), bodyGame: body?.dataset.game ?? null, bodyText: body?.textContent ?? null, bodyShown: vis(body) } : null };
})()`;
async function judgeReadiness(c, fail, tag) {
  const ok = await c.eval(`window.__play.previewCatalog(${FIX})`);
  await sleep(300);
  const r = await c.eval(CARD);
  if (ok !== true || r.absent) { fail(`${tag}: previewCatalog must render the fixture card (${ok}, ${JSON.stringify(r)})`); return; }
  if (!r.last || r.dis !== 'true') fail(`${tag}: the readiness card sits after the playable set, aria-disabled: ${JSON.stringify(r)}`);
  if (r.statusShown || r.preShown) fail(`${tag}: the status line / prerequisites paragraph must NOT be painted on the card (the badge IS the status; prerequisites are Details copy): ${JSON.stringify({ statusShown: r.statusShown, preShown: r.preShown })}`);
  if (r.notPlayable && r.statusText !== r.notPlayable) fail(`${tag}: the hidden status node keeps its text for the contract pins: ${JSON.stringify(r.statusText)}`);
  if (r.badges.length !== 1 || r.badges[0].text !== r.want || r.badges[0].warn) fail(`${tag}: exactly ONE visible kit badge whose copy is t(settings.gameBadge.config_ready) = ${JSON.stringify(r.want)} (never --warn): ${JSON.stringify(r.badges)}`);
  if (r.border === 'dashed') fail(`${tag}: no dashed border on a readiness card (the kit register is the muted voice)`);
  // RESTATED (GH-668 S5 play visual r1, V4): the kit aria-disabled figure (0.38) is the muted voice ON THE NAME —
  // the card box paints at 1 so the badge (the status) and the issuer / edition read (P-READY-INK judges the ground)
  if (Math.abs(parseFloat(r.nameOpacity) - 0.38) > 0.005) fail(`${tag}: the kit aria-disabled figure (opacity 0.38) is the muted voice on the NAME, got ${r.nameOpacity}`);
  if (Math.abs(parseFloat(r.opacity) - 1) > 0.005) fail(`${tag}: the readiness card's box paints at opacity 1 (the badge + meta read; only the name is muted), got ${r.opacity}`);
  const maxSib = r.sib.length ? Math.max(...r.sib) : null;
  if (r.content === null || !(r.content <= 88)) fail(`${tag}: the readiness card's painted content box holds the kit --card content (≤ 88, the phone peephole finding): content ${r1(r.content)} h ${r.h}`);
  // a badge beside a one-line name: the card IS the reserve like its siblings;
  // a DROPPED badge row (the kit head wraps it under the name) may exceed the
  // reserve by exactly that row's excess over the name line it displaces —
  // the kit reserve counts 2 name lines, not a badge row (GH-668 kit follow-up)
  const allow = r.dropped && r.nameLines === 1 ? Math.max(0, r.badgeH + r.rowGap - r.nameLine) : 0;
  if (!(r.h <= 97 + allow) || (maxSib !== null && !(r.h <= maxSib + 1 + allow)))
    fail(`${tag}: the readiness card holds the kit --card reserve like its siblings (h ≤ 97 [+ the dropped badge row ${r1(allow)}], uniform ± 1): h ${r.h} content ${r1(r.content)} dropped ${r.dropped} badge ${r1(r.badgeH)} + gap ${r.rowGap} − line ${r1(r.nameLine)} siblings ${JSON.stringify(r.sib)}`);
  // browse onto it (End on the rail) → the Details body lists the prerequisite
  await c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]') ?? document.querySelector('section[data-place="play"] [data-ob="play-game"]'); k.focus({ preventScroll: true }); return true; })()`);
  await pressKey(c, 'End');
  await sleep(400);
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
  await sleep(250);
  const d = await c.eval(CARD);
  // vfix1 (verifier F2): a READINESS card is BROWSED, never selected — the
  // play browse register is the data-ob-browsed marker (aria-selected stays
  // on the committed game so no sync() can revert the browse)
  if (!d.leaf) console.log(`${tag}: rung-1 register (no cardrail leaf) — no browse law to judge; Details judged on ${d.details?.bodyGame}`);
  else if (d.sel === 'true' || d.browsed !== 'true') fail(`${tag}: End onto the readiness card must BROWSE it (data-ob-browsed="true") and never select it (aria-selected stays false) — vfix1 F2: sel ${d.sel} browsed ${d.browsed}`);
  else if (!d.details || d.details.bodyGame !== 'fixture_game' || !d.details.bodyShown || !(d.details.bodyText ?? '').includes('Fixture rulebook (synthetic)')
    || (d.prereqLabel && !(d.details.bodyText ?? '').includes(d.prereqLabel + ':')))
    fail(`${tag}: the Details body lists the browsed readiness card's prerequisite description under the localized label: ${JSON.stringify(d.details)}`);
  console.log(`${tag}: card h ${r.h} content ${r1(r.content)} dropped-badge ${r.dropped} (badge ${r1(r.badgeH)} gap ${r.rowGap} line ${r1(r.nameLine)} name-lines ${r.nameLines}) siblings ${JSON.stringify(r.sib)} badge ${JSON.stringify(r.badges)} opacity ${r.opacity} status ${r.statusShown} pre ${r.preShown}; browsed ${d.sel} details ${JSON.stringify(d.details && [d.details.bodyGame, d.details.bodyShown])}`);
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); window.__play.previewCatalog(null); return true; })()`);
  await sleep(200);
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
async function register(c, fail, tag, errs) {
  const m = await judgeOnce(c, fail, `${tag} [en]`);
  console.log(`${tag} [en] measured: ${brief(m)}`);
  for (const [loc, cjk] of [['de', false], ['ja', true]]) { // one Latin + one CJK arm of the caps role
    await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
    await sleep(600);
    const ml = await judgeOnce(c, fail, `${tag} [${loc}]`, { cjk });
    if (!ml.absent && ml.locale !== loc) fail(`${tag} [${loc}]: the locale swap did not land: ${brief(ml)}`);
    console.log(`${tag} [${loc}] measured: ${brief(ml)}`);
  }
  await c.eval(`window.__i18n.setLocale('en')`);
  await sleep(500);
  await judgeListOfOne(c, fail, `${tag} list-of-one`);
  await judgeReadiness(c, fail, `${tag} readiness`);
  await gate(c, errs, tag, fail);
}
export async function armPOnce({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=once'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-ONCE desktop: the obshell boot never mounted play');
    else await register(c, fail, 'P-ONCE desktop', errs);
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=oncephone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-ONCE phone: the phone boot never mounted play');
    else {
      const m = await c.eval(MEASURE);
      if (!m.absent && !m.coarse) fail('P-ONCE phone: expected the coarse register: ' + brief(m));
      await register(c, fail, 'P-ONCE phone', errs);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPOnce above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPOnce({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-ONCE FAIL (${n})` : 'E2E-PLAY-ONCE PASS');
}
