// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-browse.mjs — arm P-BROWSE of the play-place gate (GH-668 S5 play
// verifier fix round 1, finding F2: the readiness browse × sync() race).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; the
// scripted readiness fixture through `__play.previewCatalog`):
//   * BROWSE ≠ SELECTION: focusing (End / arrows / Tab) or activating (click,
//     tap, Enter) a READINESS (aria-disabled) card BROWSES it — the card
//     carries `data-ob-browsed="true"`, its `aria-selected` stays "false" and
//     `aria-current` stays "false"; the committed card keeps aria-selected;
//     the Details body follows the browsed card (prerequisite copy);
//   * A SYNC NEVER REVERTS A BROWSE: after `ob:settings` and after a locale
//     swap the readiness card is still browsed, focus is still on it, the
//     rail's scrollLeft is unchanged (no smooth snap back to the committed
//     card) and the card stays whole inside the rail's scrollport;
//   * ENTER on a browsed readiness card does nothing else: no confirm, the
//     persisted game unchanged, the card still browsed, the Details body
//     still the readiness copy;
//   * a PLAYABLE browse (ArrowLeft onto a playable card) rides the leaf's own
//     register (aria-selected on the browsed card, the G5 law) — the marker
//     leaves the readiness card — and that browse survives a sync too;
//   * `previewCatalog(null)` retires the fixture; nothing is written to the
//     `ob-settings-v1` blob at any step.
//   * P-BROWSE-SYNC (GH-668 S5 play r5, review review r4 F2 on 37a46b30 —
//     the arm above browses End straight from the COMMITTED card, so the
//     leaf's selection was the committed card and a same-id re-select never
//     re-snapped; the sequence ArrowRight → End leaves the leaf's selection
//     on the browsed PLAYABLE card while the readiness card is browsed, and
//     every sync computed keep = the committed game → rail.select re-snapped
//     the rail to the start while focus / Details stayed on the now-invisible
//     readiness card): THE KEEP LAW — while a browse is live (a browsed card
//     other than the committed one, or rail focus inside) every sync path
//     keeps the BROWSED card: a playable browse keeps the leaf's selection on
//     it, a readiness browse leaves the leaf's LIVE selection untouched
//     (scroll-neutral) and the browsed card is kept whole inside the rail's
//     scrollport (the nearest edge); the committed card is the keep ONLY when
//     no browse is live. Judged after ArrowRight → End on `__play.refresh()`,
//     a locale repaint, `ob:settings` / `ob:capability` / `ob:perftier`, and
//     a shell exit (`quickPlay`) + re-enter (`openShell({ place: 'play' })`):
//     the focused / browsed card's rect stays inside the rail viewport
//     (≥ 0.97 whole), scrollLeft unchanged (the in-place syncs), the leaf's
//     aria-selected unchanged, the Details body bound to the browsed card.
//     1024x768 fine + 844x390 coarse. RED on 37a46b30 (scroll 1322 → 133 /
//     1592 → 206, whole 1 → 0 on every sync), GREEN ×3 on the fix.
//
// Runs INSIDE e2e-play.mjs (imported; after P-ONCE — re-uses the +0 desktop
// and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone for a
// fast red proof (the pre-fix bytes: End SELECTED the fixture card — no
// marker, aria-selected="true" — and the next sync re-selected the committed
// game, snapping the rail away from the browsed card):
//   node web/tools/e2e-play-browse.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, touchStart, touchEnd } from './touch-cdp.mjs';

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
const VK = { ArrowLeft: 37, ArrowRight: 39, End: 35, Home: 36, Enter: 13 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
  }
}
async function boot(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700); // fitPeek's first sync + the fold-snap's deferred re-settle
  return true;
}

const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
// page-side state: the fixture card, the committed card, the rail scroll, focus, Details, the blob
const STATE = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !g) return { absent: true };
  const cards = [...g.querySelectorAll('[data-ob="play-game"]')];
  const at = (k) => (k ? { id: k.dataset.game, sel: k.getAttribute('aria-selected'), cur: k.getAttribute('aria-current'), dis: k.getAttribute('aria-disabled'), browsed: k.getAttribute('data-ob-browsed') } : null);
  const fx = cards.find((k) => k.dataset.game === 'fixture_game') ?? null;
  const gr = g.getBoundingClientRect();
  const frac = (k) => { if (!k) return null; const r = k.getBoundingClientRect(); if (r.width <= 0) return 0;
    return Math.max(0, Math.min(r.right, gr.right) - Math.max(r.left, gr.left)) / r.width; };
  const det = sec.querySelector('[data-ob="play-details"]'), body = sec.querySelector('[data-ob="play-details-body"]');
  return { leaf: cards.some((k) => k.classList.contains('ob-cardrail-card')), n: cards.length,
    fx: at(fx), fxVisible: frac(fx), committed: at(cards.find((k) => k.getAttribute('aria-current') === 'true') ?? null),
    selected: cards.filter((k) => k.getAttribute('aria-selected') === 'true').map((k) => k.dataset.game),
    browsedIds: cards.filter((k) => k.getAttribute('data-ob-browsed') === 'true').map((k) => k.dataset.game),
    scrollLeft: Math.round(g.scrollLeft * 10) / 10, focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? null,
    confirm: !!document.querySelector('[data-ob="confirm"]'), game: window.__settings?.get?.().game ?? null, locale: window.__i18n?.locale?.() ?? null,
    details: det ? { expanded: det.getAttribute('aria-expanded'), bodyGame: body?.dataset.game ?? null, bodyShown: !!body && !body.hidden && body.getClientRects().length > 0, bodyText: body?.textContent ?? null } : null,
    blob: localStorage.getItem('ob-settings-v1') };
})()`;
const brief = (s) => JSON.stringify({ fx: s.fx, vis: s.fxVisible === null ? null : Math.round(s.fxVisible * 100) / 100, sel: s.selected, browsed: s.browsedIds, sl: s.scrollLeft, focus: s.focus, game: s.game, body: s.details?.bodyGame, open: s.details?.expanded });
const centre = async (c, sel) => c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

/** the readiness card is browsed (marker), never selected; the committed card keeps aria-selected; Details follows */
function judgeBrowsed(s, fail, tag, { committed, bodyOpen = true, selectedOn = committed } = {}) {
  if (!s.fx) { fail(`${tag}: the fixture card is not on the rail: ${brief(s)}`); return false; }
  const bad = [];
  if (s.fx.browsed !== 'true') bad.push('data-ob-browsed != "true"');
  if (s.fx.sel !== 'false') bad.push(`aria-selected ${s.fx.sel} (a readiness card is never selected)`);
  if (s.fx.cur !== 'false') bad.push(`aria-current ${s.fx.cur}`);
  if (s.fx.dis !== 'true') bad.push(`aria-disabled ${s.fx.dis}`);
  if (s.browsedIds.length !== 1) bad.push(`browsed marker on ${JSON.stringify(s.browsedIds)}`);
  if (selectedOn && !(s.selected.length === 1 && s.selected[0] === selectedOn)) bad.push(`aria-selected must stay on ${selectedOn === committed ? 'the committed card' : 'the browsed playable card'} ${selectedOn}: ${JSON.stringify(s.selected)}`);
  if (s.game !== committed) bad.push(`persisted game changed: ${s.game}`);
  if (s.confirm) bad.push('a confirm rose');
  if (bodyOpen && (!s.details || s.details.bodyGame !== 'fixture_game' || !s.details.bodyShown || !(s.details.bodyText ?? '').includes('Fixture rulebook (synthetic)')))
    bad.push(`the Details body must list the browsed readiness card's prerequisite copy: ${JSON.stringify(s.details)}`);
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}

async function register(c, fail, tag, { coarse }) {
  const s0 = await c.eval(STATE);
  if (s0.absent) { fail(`${tag}: play rail absent`); return; }
  if (!s0.leaf) { console.log(`${tag}: rung-1 register (no cardrail leaf) — no browse law to judge`); return; }
  const committed = s0.committed?.id ?? null, blob = s0.blob;
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(300);
  // ---- 1. focus-browse: End from the committed card lands on the fixture (last card, disabled = focusable)
  await c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); k.focus({ preventScroll: true }); return true; })()`);
  await pressKey(c, 'End');
  await sleep(500);
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
  await sleep(300);
  const s1 = await c.eval(STATE);
  if (s1.focus !== 'fixture_game') fail(`${tag}: End must move focus onto the readiness card: focus ${s1.focus}`);
  if (!judgeBrowsed(s1, fail, `${tag} after End`, { committed })) { await c.eval(`window.__play.previewCatalog(null)`); return; }
  if (!(s1.fxVisible >= 0.97)) fail(`${tag}: the browsed readiness card must stand whole inside the rail's scrollport after the focus scroll: ${brief(s1)}`);
  // ---- 2. a sync never reverts the browse (ob:settings, then a locale swap)
  await c.eval(`(window.dispatchEvent(new Event('ob:settings')), true)`);
  await sleep(700); // a smooth snap back to the committed card would have landed by now
  const s2 = await c.eval(STATE);
  judgeBrowsed(s2, fail, `${tag} after ob:settings`, { committed });
  if (Math.abs(s2.scrollLeft - s1.scrollLeft) > 1) fail(`${tag}: a sync must not scroll the rail away from the browsed card: ${s1.scrollLeft} → ${s2.scrollLeft}`);
  if (s2.focus !== 'fixture_game') fail(`${tag}: focus must stay on the browsed card through a sync: ${s2.focus}`);
  if (!(s2.fxVisible >= 0.97)) fail(`${tag}: the browsed card must stay whole through a sync: ${brief(s2)}`);
  await c.eval(`window.__i18n.setLocale('de')`);
  await sleep(700);
  const s3 = await c.eval(STATE);
  if (s3.locale !== 'de') fail(`${tag}: the locale swap did not land (${s3.locale})`);
  judgeBrowsed(s3, fail, `${tag} after setLocale(de)`, { committed });
  if (Math.abs(s3.scrollLeft - s1.scrollLeft) > 1) fail(`${tag}: a locale sync must not scroll the rail away from the browsed card: ${s1.scrollLeft} → ${s3.scrollLeft}`);
  if (s3.focus !== 'fixture_game') fail(`${tag}: focus must stay on the browsed card through a locale sync: ${s3.focus}`);
  await c.eval(`window.__i18n.setLocale('en')`);
  await sleep(500);
  // ---- 3. Enter on the browsed readiness card: nothing but the readiness copy
  await pressKey(c, 'Enter');
  await sleep(500);
  const s4 = await c.eval(STATE);
  judgeBrowsed(s4, fail, `${tag} after Enter`, { committed });
  if (s4.focus !== 'fixture_game') fail(`${tag}: Enter must leave focus on the readiness card: ${s4.focus}`);
  // ---- 4. pointer: Home ends the readiness browse (a playable browse), a click / tap on the fixture browses it again
  await pressKey(c, 'Home');
  await sleep(400);
  const s5 = await c.eval(STATE);
  if (s5.browsedIds.length) fail(`${tag}: Home onto a playable card must clear the readiness marker: ${brief(s5)}`);
  await c.eval(`(() => { const k = document.querySelector('[data-ob="play-game"][data-game="fixture_game"]'); k.scrollIntoView({ inline: 'nearest', block: 'nearest' }); return true; })()`);
  await sleep(400);
  const pt = await centre(c, '[data-ob="play-game"][data-game="fixture_game"]');
  if (!pt) fail(`${tag}: the fixture card has no box to point at`);
  else if (coarse) { await touchStart(c, [pt]); await sleep(40); await touchEnd(c); }
  else {
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  }
  await sleep(500);
  const s6 = await c.eval(STATE);
  judgeBrowsed(s6, fail, `${tag} after a ${coarse ? 'tap' : 'click'}`, { committed });
  await c.eval(`(window.dispatchEvent(new Event('ob:capability')), true)`);
  await sleep(700);
  const s7 = await c.eval(STATE);
  judgeBrowsed(s7, fail, `${tag} after ob:capability`, { committed });
  if (Math.abs(s7.scrollLeft - s6.scrollLeft) > 1) fail(`${tag}: a capability sync must not scroll the rail away from the browsed card: ${s6.scrollLeft} → ${s7.scrollLeft}`);
  // ---- 5. a PLAYABLE browse (ArrowLeft) rides aria-selected and survives a sync too
  await c.eval(`(document.querySelector('[data-ob="play-game"][data-game="fixture_game"]')?.focus({ preventScroll: true }), true)`);
  await pressKey(c, 'ArrowLeft');
  await sleep(500);
  const s8 = await c.eval(STATE);
  const left = s8.focus;
  if (!left || left === 'fixture_game') fail(`${tag}: ArrowLeft from the fixture must focus the previous (playable) card: ${brief(s8)}`);
  else {
    if (s8.browsedIds.length) fail(`${tag}: a playable browse clears the readiness marker: ${brief(s8)}`);
    if (!(s8.selected.length === 1 && s8.selected[0] === left)) fail(`${tag}: a playable browse rides the leaf's aria-selected on the browsed card (G5): ${brief(s8)}`);
    if (s8.details?.bodyGame !== left) fail(`${tag}: the Details body follows the playable browse: ${brief(s8)}`);
    await c.eval(`(window.dispatchEvent(new Event('ob:settings')), true)`);
    await sleep(700);
    const s9 = await c.eval(STATE);
    if (!(s9.selected.length === 1 && s9.selected[0] === left) || s9.committed?.id !== committed)
      fail(`${tag}: a sync must not revert a playable browse either (aria-selected stays on ${left}, aria-current on ${committed}): ${brief(s9)}`);
    if (Math.abs(s9.scrollLeft - s8.scrollLeft) > 1) fail(`${tag}: a sync must not scroll the rail away from the browsed playable card: ${s8.scrollLeft} → ${s9.scrollLeft}`);
  }
  // ---- 6. retire the fixture; nothing written
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); window.__play.previewCatalog(null); return true; })()`);
  await sleep(300);
  const s10 = await c.eval(STATE);
  if (s10.fx) fail(`${tag}: previewCatalog(null) must retire the fixture card`);
  if (s10.browsedIds.length) fail(`${tag}: no browse marker survives the fixture's retirement: ${JSON.stringify(s10.browsedIds)}`);
  if (s10.blob !== blob) fail(`${tag}: the ob-settings-v1 blob must be byte-unchanged by browsing (law 5)`);
  console.log(`${tag}: End → ${brief(s1)}; ob:settings → sl ${s2.scrollLeft} vis ${Math.round((s2.fxVisible ?? 0) * 100) / 100}; de → sl ${s3.scrollLeft}; Enter → game ${s4.game} confirm ${s4.confirm}; ${coarse ? 'tap' : 'click'} → browsed ${JSON.stringify(s6.browsedIds)}; ArrowLeft → sel ${JSON.stringify(s8.selected)} kept ${JSON.stringify((await c.eval(STATE)).selected)}`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPBrowse({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=browse'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-BROWSE desktop: the obshell boot never mounted play');
    else { await register(c, fail, 'P-BROWSE desktop', { coarse: false }); await gate(c, errs, 'P-BROWSE desktop', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=browsephone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-BROWSE phone: the phone boot never mounted play');
    else { await register(c, fail, 'P-BROWSE phone', { coarse: true }); await gate(c, errs, 'P-BROWSE phone', fail); }
    c.close();
  }
}

/** P-BROWSE-SYNC: the keep law under ArrowRight → End on every sync path */
async function syncRegister(c, fail, tag) {
  const s0 = await c.eval(STATE);
  if (s0.absent) { fail(`${tag}: play rail absent`); return; }
  if (!s0.leaf) { console.log(`${tag}: rung-1 register (no cardrail leaf) — no keep law to judge`); return; }
  const committed = s0.committed?.id ?? null, blob = s0.blob;
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(300);
  await c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); k.focus({ preventScroll: true }); return true; })()`);
  await pressKey(c, 'ArrowRight');
  await sleep(600);
  const sA = await c.eval(STATE);
  const left = sA.selected[0] ?? null;
  if (!left || left === committed || sA.selected.length !== 1) { fail(`${tag}: ArrowRight must browse the next PLAYABLE card onto the leaf's aria-selected: ${brief(sA)}`); await c.eval('window.__play.previewCatalog(null)'); return; }
  await pressKey(c, 'End');
  await sleep(600);
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
  await sleep(300);
  const s1 = await c.eval(STATE);
  if (s1.focus !== 'fixture_game') fail(`${tag}: End must move focus onto the readiness card: focus ${s1.focus}`);
  if (!judgeBrowsed(s1, fail, `${tag} after ArrowRight → End`, { committed, selectedOn: left })) { await c.eval('window.__play.previewCatalog(null)'); return; }
  if (!(s1.selected.length === 1 && s1.selected[0] === left)) fail(`${tag}: the leaf's selection stays on the browsed playable card ${left} through the readiness browse: ${brief(s1)}`);
  if (s1.game !== committed) fail(`${tag}: the persisted game changed: ${s1.game}`);
  if (!(s1.fxVisible >= 0.97)) fail(`${tag}: the browsed readiness card must stand whole inside the rail's scrollport after End: ${brief(s1)}`);
  // the in-place syncs: focus + scroll + selection + Details all unchanged
  const judgeKept = (s, leg, { focus = true } = {}) => {
    const bad = [];
    if (!(s.fxVisible >= 0.97)) bad.push(`the browsed card must stay whole inside the rail viewport (whole ${s.fxVisible})`);
    if (Math.abs(s.scrollLeft - s1.scrollLeft) > 1) bad.push(`the rail must not scroll (${s1.scrollLeft} → ${s.scrollLeft})`);
    if (focus && s.focus !== 'fixture_game') bad.push(`focus must stay on the browsed card (${s.focus})`);
    if (!(s.selected.length === 1 && s.selected[0] === left)) bad.push(`the leaf's aria-selected must stay on ${left} (${JSON.stringify(s.selected)}) — a sync never re-selects the committed card under a live browse`);
    if (s.details?.bodyGame !== 'fixture_game' || !s.details.bodyShown) bad.push(`the Details body must stay bound to the browsed card (${JSON.stringify(s.details?.bodyGame)})`);
    if (s.browsedIds.length !== 1 || s.browsedIds[0] !== 'fixture_game') bad.push(`the browse marker must stay on the readiness card (${JSON.stringify(s.browsedIds)})`);
    if (s.game !== committed) bad.push(`the persisted game changed: ${s.game}`);
    if (bad.length) fail(`${tag} ${leg}: ${bad.join('; ')} — ${brief(s)}`);
    return bad.length === 0;
  };
  await c.eval('window.__play.refresh()'); await sleep(800);
  const s2 = await c.eval(STATE); judgeKept(s2, 'after __play.refresh()');
  await c.eval(`window.__i18n.setLocale('de')`); await sleep(800);
  const s3 = await c.eval(STATE);
  if (s3.locale !== 'de') fail(`${tag}: the locale swap did not land (${s3.locale})`);
  judgeKept(s3, 'after setLocale(de)');
  await c.eval(`window.__i18n.setLocale('en')`); await sleep(500);
  for (const ev of ['ob:settings', 'ob:capability', 'ob:perftier']) {
    await c.eval(`(window.dispatchEvent(new Event(${JSON.stringify(ev)})), true)`); await sleep(700);
    judgeKept(await c.eval(STATE), `after ${ev}`);
  }
  // shell exit + re-enter: the browse persists and the browsed card is brought back whole (focus is the shell's to place)
  const exited = await c.eval('window.__shell.quickPlay()'); await sleep(1200);
  if (exited !== true) fail(`${tag}: quickPlay must exit the shell (${exited})`);
  const reopened = await c.eval(`window.__shell.openShell({ place: 'play' })`); await sleep(1500);
  if (reopened !== true) fail(`${tag}: openShell({ place: 'play' }) must re-enter (${reopened})`);
  const s6 = await c.eval(STATE);
  {
    const bad = [];
    if (!(s6.fxVisible >= 0.97)) bad.push(`after a shell exit / re-enter the browsed card must be whole inside the rail viewport (whole ${s6.fxVisible}, scroll ${s6.scrollLeft})`);
    if (!(s6.selected.length === 1 && s6.selected[0] === left)) bad.push(`the leaf's aria-selected must stay on ${left} (${JSON.stringify(s6.selected)})`);
    if (s6.details?.bodyGame !== 'fixture_game') bad.push(`the Details body must stay bound to the browsed card (${JSON.stringify(s6.details?.bodyGame)})`);
    if (s6.browsedIds.length !== 1 || s6.browsedIds[0] !== 'fixture_game') bad.push(`the browse marker must survive the exit / re-enter (${JSON.stringify(s6.browsedIds)})`);
    if (s6.game !== committed) bad.push(`the persisted game changed: ${s6.game}`);
    if (bad.length) fail(`${tag} after shell exit + re-enter: ${bad.join('; ')} — ${brief(s6)}`);
  }
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); window.__play.previewCatalog(null); return true; })()`);
  await sleep(300);
  const s7 = await c.eval(STATE);
  if (s7.blob !== blob) fail(`${tag}: the ob-settings-v1 blob must be byte-unchanged by browsing + syncing (law 5)`);
  console.log(`${tag}: ArrowRight → sel ${left}; End → ${brief(s1)}; refresh → sl ${s2.scrollLeft} whole ${s2.fxVisible} sel ${JSON.stringify(s2.selected)}; de → sl ${s3.scrollLeft} whole ${s3.fxVisible}; exit/re-enter → sl ${s6.scrollLeft} whole ${s6.fxVisible} body ${s6.details?.bodyGame}`);
}
export async function armPBrowseSync({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1024x768 (fine)
    const errs = [];
    const c = await launchChrome(url('u=browsesync'), { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-BROWSE-SYNC 1024: the obshell boot never mounted play');
    else { await syncRegister(c, fail, 'P-BROWSE-SYNC 1024'); await gate(c, errs, 'P-BROWSE-SYNC 1024', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=browsesyncphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-BROWSE-SYNC 844: the phone boot never mounted play');
    else { await syncRegister(c, fail, 'P-BROWSE-SYNC 844'); await gate(c, errs, 'P-BROWSE-SYNC 844', fail); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPBrowse + armPBrowseSync above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPBrowse({ PORT, CDP_PORT, fail, webDir }); await armPBrowseSync({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-BROWSE FAIL (${n})` : 'E2E-PLAY-BROWSE PASS');
}
