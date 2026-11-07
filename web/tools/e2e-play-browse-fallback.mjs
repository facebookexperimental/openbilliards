// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-browse-fallback.mjs — arm P-BROWSE-FALLBACK of the play-place gate
// (GH-668 S5 play review review r1, P2-1: the rung-1 plain-button
// register — `ui/cardrail.js` poisoned — moved focus without updating the
// play browse state, so the Details body always resolved the COMMITTED game
// and a readiness card's prerequisites (Details copy since B-PL07) were
// unreachable on that register; the ownership ledger working-degradation law).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; the
// cardrail leaf BLOCKED at the network so the rung-1 button register renders;
// the scripted readiness fixture through `__play.previewCatalog`) is the
// P-BROWSE law on the fallback register:
//   * ArrowRight / ArrowLeft / Home / End on the rung-1 register BROWSE: a
//     READINESS (aria-disabled) card carries `data-ob-browsed="true"`, its
//     `aria-selected` stays "false", `aria-current` stays "false"; the
//     committed card keeps aria-selected="true"; a PLAYABLE browse moves
//     aria-selected onto the browsed card (the marker leaves the readiness
//     card); focus rides the browse (the roving handler);
//   * the Details body follows the BROWSED card: a readiness card's
//     prerequisite copy, a playable card's full citation (its rulebook);
//   * a sync (ob:settings / ob:capability / a locale swap) never reverts the
//     browse; Enter on a browsed readiness card commits nothing (no confirm,
//     the persisted game unchanged); a click / tap on a readiness card
//     browses it;
//   * `previewCatalog(null)` retires the fixture; the `ob-settings-v1` blob
//     is byte-unchanged at every step;
//   * the ARIA pair (review r1 checker P3, merge round): the register is
//     `role=listbox` and every card `role=option` — the only tree on which
//     the mirrored aria-selected is valid — at boot, after the fixture
//     rebuild and after its retirement (RED on 5aa7d4f3: plain buttons in a
//     role=group).
//
// Runs INSIDE e2e-play.mjs (imported; after P-BROWSE — re-uses the +0 desktop
// and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone for a
// fast red proof (the pre-fix bytes: End moved focus only — no marker, no
// aria-selected on the plain buttons — and the Details body stayed on the
// committed nine_ball citation):
//   node web/tools/e2e-play-browse-fallback.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
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
/** the e2e-play blockUrl idiom (P2c-cured form): Network.enable BEFORE
 * setCacheDisabled (else the second document reuses the first boot's leaf
 * from the renderer MemoryCache and nothing pauses), the service-worker
 * bypass, then Fetch.enable; a paused request the page abandoned answers
 * "Invalid InterceptionId" — never let that rejection escape the handler. */
async function blockUrl(c, re, pattern) {
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (re.test(params.request.url)) {
      c.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
    } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}
/** first boot (the profile warms), then the cardrail leaf blocked and a
 * second document on the same target — the rung-1 register renders */
async function bootFallback(c, url2) {
  if (!(await waitReady(c))) return false;
  await blockUrl(c, /\/app\/ui\/cardrail\.js(\?|$)/, '*cardrail.js*');
  await c.send('Page.navigate', { url: url2 });
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700); // fitPeek's first sync + the fold-snap's deferred re-settle
  return true;
}

const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
// page-side state: the register, the fixture card, the committed card, focus, Details, the blob
const STATE = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !g) return { absent: true };
  const cards = [...g.querySelectorAll('[data-ob="play-game"]')];
  const at = (k) => (k ? { id: k.dataset.game, sel: k.getAttribute('aria-selected'), cur: k.getAttribute('aria-current'), dis: k.getAttribute('aria-disabled'), browsed: k.getAttribute('data-ob-browsed') } : null);
  const fx = cards.find((k) => k.dataset.game === 'fixture_game') ?? null;
  const det = sec.querySelector('[data-ob="play-details"]'), body = sec.querySelector('[data-ob="play-details-body"]');
  return { leaf: cards.some((k) => k.classList.contains('ob-cardrail-card')), role: g.getAttribute('role'), roles: cards.map((k) => k.getAttribute('role')),
    rung1: cards.length > 0 && cards.every((k) => k.tagName === 'BUTTON' && k.classList.contains('ob-play-card') && !k.classList.contains('ob-cardrail-card')),
    n: cards.length, ids: cards.map((k) => k.dataset.game),
    fx: at(fx), committed: at(cards.find((k) => k.getAttribute('aria-current') === 'true') ?? null),
    selected: cards.filter((k) => k.getAttribute('aria-selected') === 'true').map((k) => k.dataset.game),
    browsedIds: cards.filter((k) => k.getAttribute('data-ob-browsed') === 'true').map((k) => k.dataset.game),
    focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? null,
    confirm: !!document.querySelector('[data-ob="confirm"]'), game: window.__settings?.get?.().game ?? null, locale: window.__i18n?.locale?.() ?? null,
    details: det ? { expanded: det.getAttribute('aria-expanded'), bodyGame: body?.dataset.game ?? null, bodyShown: !!body && !body.hidden && body.getClientRects().length > 0, bodyText: body?.textContent ?? null } : null,
    blob: localStorage.getItem('ob-settings-v1') };
})()`;
/** the S4 citation line of a catalog id, read from the dist games index on the page (no play seam) */
const citeOf = (id) => `(async () => { const { GAME_CATALOG } = await import('./dist/pool-sdk/games/index.js');
  const p = GAME_CATALOG.find((e) => e.id === ${JSON.stringify(id)})?.provenance; return p ? p.body + ' — ' + p.rulebook + ' (' + p.edition + ')' : null; })()`;
const brief = (s) => JSON.stringify({ fx: s.fx, sel: s.selected, browsed: s.browsedIds, focus: s.focus, game: s.game, body: s.details?.bodyGame, open: s.details?.expanded });
const centre = async (c, sel) => c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

/** the ARIA pair (review r1 checker P3): the mirrored aria-selected is valid on a role=option inside a role=listbox only —
 * the rung-1 register must restate the leaf's pair (ui/cardrail.js: mount listbox, card option) on every card it paints */
function judgeRoles(s, fail, tag) {
  const bad = [];
  if (s.role !== 'listbox') bad.push(`[data-ob="play-games"] role ${JSON.stringify(s.role)} (must be "listbox" — aria-selected is mirrored onto its cards)`);
  const off = s.roles.map((r, i) => (r === 'option' ? null : `${s.ids[i]}:${r}`)).filter(Boolean);
  if (off.length) bad.push(`cards without role="option": ${JSON.stringify(off)}`);
  if (bad.length) { fail(`${tag}: ARIA pair on the rung-1 register — ${bad.join('; ')}`); return false; }
  return true;
}
/** the readiness card is browsed (marker), never selected; the committed card keeps aria-selected; Details follows */
function judgeBrowsed(s, fail, tag, { committed }) {
  if (!s.fx) { fail(`${tag}: the fixture card is not on the register: ${brief(s)}`); return false; }
  const bad = [];
  if (s.fx.browsed !== 'true') bad.push('data-ob-browsed != "true" (the fallback register did not browse)');
  if (s.fx.sel === 'true') bad.push('aria-selected "true" (a readiness card is never selected)');
  if (s.fx.cur !== 'false') bad.push(`aria-current ${s.fx.cur}`);
  if (s.fx.dis !== 'true') bad.push(`aria-disabled ${s.fx.dis}`);
  if (s.browsedIds.length !== 1) bad.push(`browsed marker on ${JSON.stringify(s.browsedIds)}`);
  if (!(s.selected.length === 1 && s.selected[0] === committed)) bad.push(`aria-selected must stay on the committed card ${committed}: ${JSON.stringify(s.selected)}`);
  if (s.game !== committed) bad.push(`persisted game changed: ${s.game}`);
  if (s.confirm) bad.push('a confirm rose');
  if (!s.details || s.details.bodyGame !== 'fixture_game' || !s.details.bodyShown || !(s.details.bodyText ?? '').includes('Fixture rulebook (synthetic)'))
    bad.push(`the Details body must list the browsed readiness card's prerequisite copy: ${JSON.stringify(s.details)}`);
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}
/** a PLAYABLE browse: aria-selected on the browsed card, no marker, Details = its citation */
async function judgePlayable(c, s, fail, tag, { id, committed }) {
  const bad = [];
  if (s.browsedIds.length) bad.push(`a playable browse clears the readiness marker: ${JSON.stringify(s.browsedIds)}`);
  if (!(s.selected.length === 1 && s.selected[0] === id)) bad.push(`aria-selected must ride the browsed playable card ${id}: ${JSON.stringify(s.selected)}`);
  if (s.committed?.id !== committed) bad.push(`aria-current must stay on the committed card ${committed}: ${JSON.stringify(s.committed)}`);
  if (s.game !== committed) bad.push(`persisted game changed: ${s.game}`);
  const cite = await c.eval(citeOf(id)).catch(() => null);
  if (!cite) bad.push(`no citation for ${id} in the dist games index`);
  else if (s.details?.bodyGame !== id || !s.details.bodyShown || !(s.details.bodyText ?? '').includes(cite))
    bad.push(`the Details body must name the BROWSED game's rulebook (${cite}): ${JSON.stringify(s.details)}`);
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}

async function register(c, fail, tag, { coarse }) {
  const s0 = await c.eval(STATE);
  if (s0.absent) { fail(`${tag}: play register absent`); return; }
  if (s0.leaf || !s0.rung1) { fail(`${tag}: staging — the cardrail block never landed (leaf ${s0.leaf}, rung1 ${s0.rung1}, n ${s0.n}); this arm judges the plain-button register`); return; }
  const committed = s0.committed?.id ?? null, blob = s0.blob;
  if (!committed) { fail(`${tag}: no aria-current card on the register: ${brief(s0)}`); return; }
  judgeRoles(s0, fail, `${tag} at boot`);
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(300);
  judgeRoles(await c.eval(STATE), fail, `${tag} after previewCatalog (the rebuilt inventory)`);
  // ---- 1. End from the committed card lands on the fixture (last card) and BROWSES it; Details = its prerequisites
  await c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); k.focus({ preventScroll: true }); return true; })()`);
  await pressKey(c, 'End');
  await sleep(400);
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
  await sleep(300);
  const s1 = await c.eval(STATE);
  if (s1.focus !== 'fixture_game') fail(`${tag}: End must move focus onto the readiness card: focus ${s1.focus}`);
  if (!judgeBrowsed(s1, fail, `${tag} after End`, { committed })) { await c.eval(`window.__play.previewCatalog(null)`); return; }
  // ---- 2. a sync never reverts the browse (ob:settings, then a locale swap)
  await c.eval(`(window.dispatchEvent(new Event('ob:settings')), true)`);
  await sleep(500);
  const s2 = await c.eval(STATE);
  judgeBrowsed(s2, fail, `${tag} after ob:settings`, { committed });
  if (s2.focus !== 'fixture_game') fail(`${tag}: focus must stay on the browsed card through a sync: ${s2.focus}`);
  await c.eval(`window.__i18n.setLocale('de')`);
  await sleep(700);
  const s3 = await c.eval(STATE);
  if (s3.locale !== 'de') fail(`${tag}: the locale swap did not land (${s3.locale})`);
  judgeBrowsed(s3, fail, `${tag} after setLocale(de)`, { committed });
  if (s3.focus !== 'fixture_game') fail(`${tag}: focus must stay on the browsed card through a locale sync: ${s3.focus}`);
  await c.eval(`window.__i18n.setLocale('en')`);
  await sleep(500);
  // ---- 3. Enter on the browsed readiness card: no commit, no confirm, still browsed
  await pressKey(c, 'Enter');
  await sleep(500);
  const s4 = await c.eval(STATE);
  judgeBrowsed(s4, fail, `${tag} after Enter`, { committed });
  if (s4.focus !== 'fixture_game') fail(`${tag}: Enter must leave focus on the readiness card: ${s4.focus}`);
  // ---- 4. ArrowLeft = a PLAYABLE browse (aria-selected rides it, Details = its rulebook); ArrowRight browses the fixture again
  await pressKey(c, 'ArrowLeft');
  await sleep(400);
  const s5 = await c.eval(STATE);
  const left = s5.focus;
  if (!left || left === 'fixture_game') fail(`${tag}: ArrowLeft from the fixture must focus the previous (playable) card: ${brief(s5)}`);
  else {
    await judgePlayable(c, s5, fail, `${tag} after ArrowLeft`, { id: left, committed });
    await c.eval(`(window.dispatchEvent(new Event('ob:settings')), true)`);
    await sleep(500);
    const s5b = await c.eval(STATE);
    await judgePlayable(c, s5b, fail, `${tag} after ArrowLeft + ob:settings`, { id: left, committed });
    if (s5b.focus !== left) fail(`${tag}: focus must stay on the browsed playable card through a sync: ${s5b.focus}`);
  }
  await pressKey(c, 'ArrowRight');
  await sleep(400);
  const s6 = await c.eval(STATE);
  if (s6.focus !== 'fixture_game') fail(`${tag}: ArrowRight must move focus back onto the readiness card: ${s6.focus}`);
  judgeBrowsed(s6, fail, `${tag} after ArrowRight`, { committed });
  // ---- 5. Home ends the readiness browse (a playable browse onto the first card); a click / tap on the fixture browses it again
  await pressKey(c, 'Home');
  await sleep(400);
  const s7 = await c.eval(STATE);
  if (s7.browsedIds.length) fail(`${tag}: Home onto a playable card must clear the readiness marker: ${brief(s7)}`);
  if (s7.focus) await judgePlayable(c, s7, fail, `${tag} after Home`, { id: s7.focus, committed });
  else fail(`${tag}: Home must focus the first card: ${brief(s7)}`);
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
  const s8 = await c.eval(STATE);
  judgeBrowsed(s8, fail, `${tag} after a ${coarse ? 'tap' : 'click'}`, { committed });
  await c.eval(`(window.dispatchEvent(new Event('ob:capability')), true)`);
  await sleep(500);
  const s9 = await c.eval(STATE);
  judgeBrowsed(s9, fail, `${tag} after ob:capability`, { committed });
  // ---- 6. retire the fixture; nothing written
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); window.__play.previewCatalog(null); return true; })()`);
  await sleep(300);
  const s10 = await c.eval(STATE);
  if (s10.fx) fail(`${tag}: previewCatalog(null) must retire the fixture card`);
  if (s10.browsedIds.length) fail(`${tag}: no browse marker survives the fixture's retirement: ${JSON.stringify(s10.browsedIds)}`);
  if (s10.blob !== blob) fail(`${tag}: the ob-settings-v1 blob must be byte-unchanged by browsing (law 5)`);
  judgeRoles(s10, fail, `${tag} after the fixture's retirement`);
  console.log(`${tag}: rung-1 register (${s0.n} buttons, ${s0.role} / ${[...new Set(s0.roles)].join('+')}); End → ${brief(s1)}; de → body ${s3.details?.bodyGame}; Enter → game ${s4.game} confirm ${s4.confirm}; ArrowLeft → sel ${JSON.stringify(s5.selected)} body ${s5.details?.bodyGame}; ArrowRight → browsed ${JSON.stringify(s6.browsedIds)}; Home → sel ${JSON.stringify(s7.selected)}; ${coarse ? 'tap' : 'click'} → browsed ${JSON.stringify(s8.browsedIds)}`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPBrowseFallback({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=fbrowse'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await bootFallback(c, url('u=fbrowse2')))) fail('P-BROWSE-FALLBACK desktop: the cardrail-blocked obshell boot never mounted play');
    else { await register(c, fail, 'P-BROWSE-FALLBACK desktop', { coarse: false }); await gate(c, errs, 'P-BROWSE-FALLBACK desktop', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=fbrowsephone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await bootFallback(c, url('u=fbrowsephone2')))) fail('P-BROWSE-FALLBACK phone: the cardrail-blocked phone boot never mounted play');
    else { await register(c, fail, 'P-BROWSE-FALLBACK phone', { coarse: true }); await gate(c, errs, 'P-BROWSE-FALLBACK phone', fail); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPBrowseFallback above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPBrowseFallback({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-BROWSE-FALLBACK FAIL (${n})` : 'E2E-PLAY-BROWSE-FALLBACK PASS');
}
