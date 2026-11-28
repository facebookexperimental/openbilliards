// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-focus-browse.mjs — arm P-FOCUS-BROWSE of the play-place gate
// (GH-668 S5 play r6; review review r5 F2 on 1ca619af + the round-6 census (b)
// of every entry that moves focus or the browse target inside the rail).
//
// THE LAW JUDGED — the COMMON BROWSE-STATE CONTRACT (the ownership ledger, the play
// paragraph): focus on ANY card, in EITHER rail mode, routes through the ONE
// browse-state update (`browseTo`): the browse marker, the Details body and
// the keep follow the card holding focus, playable or readiness. On 1ca619af
// two entries bypassed it: (1) the FALLBACK rail (the cardrail leaf still
// PENDING past RAIL_LEAF_WAIT_MS — every rung-1 card tabbable) — its focusin
// handler browsed DISABLED cards only, so Tab across playable cards moved
// focus while Details stayed on the committed discipline's rulebook; (2) the
// leaf's `onBrowse` filter did the same for the cardrail register, so Shift+Tab
// from a browsed readiness card back onto the selected playable card left the
// marker and Details on the readiness card. Arrows / Home / End were already
// routed (the leaf's onSelect + the rung-1 roving handler) and stay so.
//
// P-FOCUS-BROWSE (1024x768 fine + 844x390 coarse; the scripted readiness
// fixture; the Details body open):
//   * FALLBACK-PENDING mode (`ui/cardrail.js` HELD at the network — the paused
//     request never answered — so the rung-1 register mounts after the wait
//     with EVERY card tabbable; staged: a cardrail request was intercepted,
//     the register is plain buttons, tabbable count = card count): Tab from
//     the committed card → the next card holds focus AND aria-selected AND
//     Details (its rulebook); Tab again → the third; Shift+Tab → back; a
//     programmatic focus() onto the card before the readiness card (the
//     reseat / a11y entry) → Details on it; Tab → the readiness card (marker
//     + its prerequisites in Details, aria-selected back on the committed
//     card); Shift+Tab → the playable card before it (marker cleared, Details
//     + aria-selected on it); Tab → the readiness card again; End from the
//     committed card (the roving handler, restated from P-BROWSE-FALLBACK —
//     a roving key leaves ONE tab stop, so the Tab crossings are judged
//     before it);
//   * LEAF mode: End from the committed card → the readiness card browsed;
//     Shift+Tab → the roving stop (the selected = committed card) holds
//     focus, Details and aria-selected, the marker cleared; ArrowRight →
//     End → Shift+Tab → the previously browsed PLAYABLE card (the leaf's
//     selection) holds focus + Details, the marker cleared; the restated
//     r5 leg End → ArrowLeft → Details follows the playable card;
//   * every step: the persisted game unchanged, no confirm, the blob
//     byte-unchanged; the fixture retired at the end.
// RED on 1ca619af (fallback: Tab → Details stays on the committed card;
// leaf: Shift+Tab → Details + marker stay on the readiness card), GREEN ×3 on
// the fix; the r5 P-BROWSE / P-BROWSE-SYNC / P-BROWSE-FALLBACK arms stay green.
//
// Runs INSIDE e2e-play.mjs (imported after P-STALE-DICT — the +0 desktop and
// +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged) and
// stands alone for a fast red proof:
//   node web/tools/e2e-play-focus-browse.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
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
const VK = { ArrowLeft: 37, ArrowRight: 39, End: 35, Home: 36, Tab: 9 };
async function pressKey(c, key, { shift = false } = {}) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0, modifiers: shift ? 8 : 0 });
  }
}
/** the P-UPG hold idiom: first boot (the profile warms), then EVERY cardrail.js request of the second document
 * is paused and NEVER answered — the leaf import stays pending past RAIL_LEAF_WAIT_MS and the rung-1 register
 * mounts with every card tabbable. Network.enable BEFORE setCacheDisabled (else the second document reuses the
 * first boot's leaf from the renderer MemoryCache and nothing pauses), the worker bypass, then Fetch.enable. */
async function bootHeld(c, url2) {
  if (!(await waitReady(c))) return null;
  const st = { held: 0 };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/\/app\/ui\/cardrail\.js(\?|$)/.test(params.request.url)) { st.held += 1; return; } // held — never continued
    c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cardrail.js*' }] });
  await c.send('Page.navigate', { url: url2 });
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return null;
  // the rung-1 register lands RAIL_LEAF_WAIT_MS (2000) after the sheet; wait for it, then the fold-snap settle
  for (let i = 0; i < 60 * SCALE; i++) {
    if (await c.eval(`document.querySelectorAll('section[data-place="play"] [data-ob="play-game"]').length > 0`).catch(() => false)) break;
    await sleep(150);
  }
  await sleep(700);
  return st;
}
async function bootLeaf(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  for (let i = 0; i < 60 * SCALE; i++) {
    if (await c.eval(`!!document.querySelector('section[data-place="play"] .ob-cardrail-card')`).catch(() => false)) break;
    await sleep(150);
  }
  await sleep(700);
  return true;
}
const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
// page-side state: the register, every card's flags, focus, Details, the blob
const STATE = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !g) return { absent: true };
  const cards = [...g.querySelectorAll('[data-ob="play-game"]')];
  const det = sec.querySelector('[data-ob="play-details"]'), body = sec.querySelector('[data-ob="play-details-body"]');
  return { leaf: cards.some((k) => k.classList.contains('ob-cardrail-card')),
    rung1: cards.length > 0 && cards.every((k) => k.tagName === 'BUTTON' && k.classList.contains('ob-play-card') && !k.classList.contains('ob-cardrail-card')),
    n: cards.length, ids: cards.map((k) => k.dataset.game), tabbable: cards.filter((k) => k.tabIndex === 0).map((k) => k.dataset.game),
    playable: cards.filter((k) => k.dataset.playable === 'true').map((k) => k.dataset.game),
    committed: cards.find((k) => k.getAttribute('aria-current') === 'true')?.dataset.game ?? null,
    selected: cards.filter((k) => k.getAttribute('aria-selected') === 'true').map((k) => k.dataset.game),
    browsedIds: cards.filter((k) => k.getAttribute('data-ob-browsed') === 'true').map((k) => k.dataset.game),
    focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? null,
    active: (document.activeElement?.tagName ?? '') + (document.activeElement?.dataset?.ob ? '[' + document.activeElement.dataset.ob + ']' : ''),
    confirm: !!document.querySelector('[data-ob="confirm"]'), game: window.__settings?.get?.().game ?? null,
    details: det ? { expanded: det.getAttribute('aria-expanded'), bodyGame: body?.dataset.game ?? null, bodyShown: !!body && !body.hidden && body.getClientRects().length > 0, bodyText: body?.textContent ?? null } : null,
    blob: localStorage.getItem('ob-settings-v1') };
})()`;
const citeOf = (id) => `(async () => { const { GAME_CATALOG } = await import('./dist/pool-sdk/games/index.js');
  const p = GAME_CATALOG.find((e) => e.id === ${JSON.stringify(id)})?.provenance; return p ? p.body + ' — ' + p.rulebook + ' (' + p.edition + ')' : null; })()`;
const brief = (s) => JSON.stringify({ focus: s.focus, active: s.active, sel: s.selected, marker: s.browsedIds, body: s.details?.bodyGame, open: s.details?.expanded, game: s.game, tab: s.tabbable.length });
const focusCard = (c, id) => c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][data-game="${id}"]'); k?.focus({ preventScroll: true }); return !!k; })()`);
const openDetails = (c) => c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true; })()`);
/** the card holding focus is `id` AND Details + the browse register follow it. Under a READINESS focus the
 * `aria-selected` register never moves onto the disabled card: the LEAF keeps its live selection (the r5 keep
 * law — the committed card, or the playable card browsed before), the rung-1 mirror falls back to the committed
 * card; `sel` names the expected id. */
async function judgeFollows(c, s, fail, tag, { id, committed, blob, sel = committed }) {
  const bad = [];
  if (s.focus !== id) bad.push(`focus must be on ${id} (is ${s.focus} / ${s.active})`);
  const readiness = id === 'fixture_game';
  if (readiness) {
    if (s.browsedIds.length !== 1 || s.browsedIds[0] !== id) bad.push(`the browse marker must sit on the focused readiness card: ${JSON.stringify(s.browsedIds)}`);
    if (!(s.selected.length === 1 && s.selected[0] === sel)) bad.push(`aria-selected must stay on ${sel} under a readiness browse (never the readiness card): ${JSON.stringify(s.selected)}`);
    if (s.details?.bodyGame !== id || !s.details.bodyShown || !(s.details.bodyText ?? '').includes('Fixture rulebook (synthetic)')) bad.push(`Details must list the focused readiness card's prerequisites: ${JSON.stringify(s.details)}`);
  } else {
    if (s.browsedIds.length) bad.push(`a playable focus clears the readiness marker: ${JSON.stringify(s.browsedIds)}`);
    if (!(s.selected.length === 1 && s.selected[0] === id)) bad.push(`aria-selected must ride the focused playable card ${id}: ${JSON.stringify(s.selected)}`);
    const cite = await c.eval(citeOf(id)).catch(() => null);
    if (!cite) bad.push(`no citation for ${id} in the dist games index`);
    else if (s.details?.bodyGame !== id || !s.details.bodyShown || !(s.details.bodyText ?? '').includes(cite)) bad.push(`Details must name the FOCUSED card's rulebook (${cite}): ${JSON.stringify(s.details)}`);
  }
  if (s.committed !== committed) bad.push(`aria-current moved: ${s.committed}`);
  if (s.game !== committed) bad.push(`persisted game changed: ${s.game}`);
  if (s.confirm) bad.push('a confirm rose');
  if (s.blob !== blob) bad.push('the ob-settings-v1 blob changed (law 5)');
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}
async function retire(c) {
  await c.eval(`(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); window.__play.previewCatalog(null); return true; })()`).catch(() => {});
  await sleep(300);
}
/** FALLBACK-PENDING: Tab / Shift+Tab across playable cards, End onto the readiness card, Shift+Tab back */
async function fallbackLeg(c, fail, tag, st) {
  const s0 = await c.eval(STATE);
  if (s0.absent) { fail(`${tag}: play register absent`); return; }
  if (!st || st.held < 1) { fail(`${tag}: staging — no cardrail.js request was held (${JSON.stringify(st)})`); return; }
  if (s0.leaf || !s0.rung1) { fail(`${tag}: staging — the held leaf must leave the rung-1 register (leaf ${s0.leaf}, rung1 ${s0.rung1}, n ${s0.n})`); return; }
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(400);
  const s1 = await c.eval(STATE);
  if (s1.tabbable.length !== s1.n) { fail(`${tag}: staging — while the leaf is PENDING every rung-1 card is tabbable (tabbable ${s1.tabbable.length} of ${s1.n}: ${JSON.stringify(s1.tabbable)})`); await retire(c); return; }
  const committed = s1.committed, blob = s1.blob, ids = s1.ids;
  const i0 = ids.indexOf(committed);
  if (!committed || i0 < 0 || ids.length < 4 || ids[ids.length - 1] !== 'fixture_game') { fail(`${tag}: staging — unexpected inventory ${JSON.stringify(ids)} committed ${committed}`); await retire(c); return; }
  await openDetails(c);
  await sleep(300);
  // 1. Tab from the committed card → the next card (DOM order = tab order while every card is tabbable)
  await focusCard(c, committed);
  await sleep(200);
  await pressKey(c, 'Tab'); await sleep(400);
  const a = await c.eval(STATE);
  const next1 = ids[i0 + 1];
  await judgeFollows(c, a, fail, `${tag} Tab → ${next1}`, { id: next1, committed, blob });
  // 2. Tab again → the third card; Shift+Tab → back to the second
  await pressKey(c, 'Tab'); await sleep(400);
  const b = await c.eval(STATE);
  const next2 = ids[i0 + 2];
  await judgeFollows(c, b, fail, `${tag} Tab ×2 → ${next2}`, { id: next2, committed, blob });
  await pressKey(c, 'Tab', { shift: true }); await sleep(400);
  const d = await c.eval(STATE);
  await judgeFollows(c, d, fail, `${tag} Shift+Tab → ${next1}`, { id: next1, committed, blob });
  // 3. a programmatic focus() onto the card before the readiness card; Tab → the readiness card; Shift+Tab back; Tab again
  const before = ids[ids.length - 2];
  await focusCard(c, before); await sleep(400);
  const e0 = await c.eval(STATE);
  await judgeFollows(c, e0, fail, `${tag} focus() → ${before}`, { id: before, committed, blob });
  await pressKey(c, 'Tab'); await sleep(400);
  const e = await c.eval(STATE);
  await judgeFollows(c, e, fail, `${tag} Tab → fixture_game`, { id: 'fixture_game', committed, blob });
  await pressKey(c, 'Tab', { shift: true }); await sleep(400);
  const f = await c.eval(STATE);
  await judgeFollows(c, f, fail, `${tag} Shift+Tab from the readiness card → ${before}`, { id: before, committed, blob });
  await pressKey(c, 'Tab'); await sleep(400);
  const g = await c.eval(STATE);
  await judgeFollows(c, g, fail, `${tag} Tab → fixture_game again`, { id: 'fixture_game', committed, blob });
  // 4. End from the committed card — the roving handler's browse (restated; it leaves ONE tab stop)
  await focusCard(c, committed); await sleep(200);
  await pressKey(c, 'End'); await sleep(400);
  const h = await c.eval(STATE);
  await judgeFollows(c, h, fail, `${tag} End → fixture_game (roving)`, { id: 'fixture_game', committed, blob });
  await retire(c);
  console.log(`${tag}: rung-1 register held (${st.held} cardrail request(s) paused), ${s1.n} cards all tabbable; Tab → ${brief(a)}; Tab → ${brief(b)}; Shift+Tab → ${brief(d)}; focus() → ${brief(e0)}; Tab → ${brief(e)}; Shift+Tab → ${brief(f)}; Tab → ${brief(g)}; End → ${brief(h)}`);
}
/** LEAF: End → Shift+Tab (the roving stop); ArrowRight → End → Shift+Tab (the browsed playable card); End → ArrowLeft restated */
async function leafLeg(c, fail, tag) {
  const s0 = await c.eval(STATE);
  if (s0.absent) { fail(`${tag}: play register absent`); return; }
  if (!s0.leaf) { fail(`${tag}: staging — the cardrail leaf never landed (this leg judges the leaf register)`); return; }
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(400);
  const s1 = await c.eval(STATE);
  const committed = s1.committed, blob = s1.blob;
  if (!committed) { fail(`${tag}: no aria-current card: ${brief(s1)}`); await retire(c); return; }
  await openDetails(c);
  await sleep(300);
  // 1. End from the committed card → the readiness card browsed; Shift+Tab → the roving stop = the selected (committed) card
  await focusCard(c, committed); await sleep(200);
  await pressKey(c, 'End'); await sleep(500);
  const a = await c.eval(STATE);
  await judgeFollows(c, a, fail, `${tag} End → fixture_game`, { id: 'fixture_game', committed, blob });
  await pressKey(c, 'Tab', { shift: true }); await sleep(500);
  const b = await c.eval(STATE);
  if (b.focus === null) fail(`${tag}: Shift+Tab from the readiness card must land on the rail's roving stop (the selected card), not leave the rail (${b.active})`);
  else await judgeFollows(c, b, fail, `${tag} Shift+Tab → ${b.focus} (the roving stop)`, { id: committed, committed, blob });
  // 2. ArrowRight (a playable browse: the leaf's selection moves) → End → Shift+Tab → that playable card
  await focusCard(c, committed); await sleep(200);
  await pressKey(c, 'ArrowRight'); await sleep(500);
  const d = await c.eval(STATE);
  const right = d.focus;
  if (!right || right === committed || right === 'fixture_game') { fail(`${tag}: ArrowRight from the committed card must browse the next playable card: ${brief(d)}`); await retire(c); return; }
  await judgeFollows(c, d, fail, `${tag} ArrowRight → ${right}`, { id: right, committed, blob });
  await pressKey(c, 'End'); await sleep(500);
  const e = await c.eval(STATE);
  await judgeFollows(c, e, fail, `${tag} ArrowRight → End → fixture_game`, { id: 'fixture_game', committed, blob, sel: right }); // the leaf keeps its live selection (r5 keep law)
  await pressKey(c, 'Tab', { shift: true }); await sleep(500);
  const f = await c.eval(STATE);
  if (f.focus === null) fail(`${tag}: Shift+Tab from the readiness card must land on the leaf's selected card ${right} (${f.active})`);
  else await judgeFollows(c, f, fail, `${tag} Shift+Tab → ${right} (the browsed playable card)`, { id: right, committed, blob });
  // 3. the restated r5 leg: End → ArrowLeft → Details follows the playable card
  await pressKey(c, 'End'); await sleep(500);
  await pressKey(c, 'ArrowLeft'); await sleep(500);
  const g = await c.eval(STATE);
  if (!g.focus || g.focus === 'fixture_game') fail(`${tag}: ArrowLeft from the readiness card must focus the previous playable card: ${brief(g)}`);
  else await judgeFollows(c, g, fail, `${tag} End → ArrowLeft → ${g.focus}`, { id: g.focus, committed, blob });
  await retire(c);
  const z = await c.eval(STATE);
  if (z.blob !== blob) fail(`${tag}: the ob-settings-v1 blob must be byte-unchanged by browsing (law 5)`);
  console.log(`${tag}: leaf register; End → ${brief(a)}; Shift+Tab → ${brief(b)}; ArrowRight → ${brief(d)}; End → ${brief(e)}; Shift+Tab → ${brief(f)}; End → ArrowLeft → ${brief(g)}`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPFocusBrowse({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&${q}`;
  { // ---- desktop 1024x768 (fine): leaf, then the held fallback on a second document
    const errs = [];
    const c = await launchChrome(url('u=pfocusbrowse'), { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    if (!(await bootLeaf(c))) fail('P-FOCUS-BROWSE 1024: the obshell boot never mounted play');
    else {
      await leafLeg(c, fail, 'P-FOCUS-BROWSE 1024 leaf');
      await gate(c, errs, 'P-FOCUS-BROWSE 1024 leaf', fail);
      const st = await bootHeld(c, url('u=pfocusbrowse2'));
      if (!st) fail('P-FOCUS-BROWSE 1024: the held-leaf boot never mounted play');
      else { await fallbackLeg(c, fail, 'P-FOCUS-BROWSE 1024 fallback-pending', st); await gate(c, errs, 'P-FOCUS-BROWSE 1024 fallback-pending', fail); }
    }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=pfocusbrowsephone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await bootLeaf(c))) fail('P-FOCUS-BROWSE 844: the phone boot never mounted play');
    else {
      await leafLeg(c, fail, 'P-FOCUS-BROWSE 844 leaf');
      await gate(c, errs, 'P-FOCUS-BROWSE 844 leaf', fail);
      const st = await bootHeld(c, url('u=pfocusbrowsephone2'));
      if (!st) fail('P-FOCUS-BROWSE 844: the held-leaf phone boot never mounted play');
      else { await fallbackLeg(c, fail, 'P-FOCUS-BROWSE 844 fallback-pending', st); await gate(c, errs, 'P-FOCUS-BROWSE 844 fallback-pending', fail); }
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPFocusBrowse above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPFocusBrowse({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-FOCUS-BROWSE FAIL (${n})` : 'E2E-PLAY-FOCUS-BROWSE PASS');
}
