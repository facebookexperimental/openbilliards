// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5r4.mjs — GH-668 S5 review review r4 (0 P1 / 3 P2,
// browser-reproduced) + the targeted visual audit r4 (GPT-6, P2). ONE LEG
// MODULE of e2e-atelier.mjs (the e2e-atelier-s5q / s5r precedent) with four
// arms; the suite calls runS5M2 / runS5Q2 / runS5X2 / runS5R2 with its band;
// standalone (`node web/tools/e2e-atelier-s5r4.mjs [--arm M2|Q2|X2|R2]` under
// run-gate) runs the same cells in isolation for red/green proofs.
//
// S5-M2 (review r4 P2-1) pre-fix (02b91dd2) ateliercue.js handOffFocus let a
//       DELAYED inspection (the first ateliercue.js fetch held at the network
//       while the user opened Settings) pull focus out of the open modal onto
//       the background card's Try-it / Equip pill: Enter then entered practice
//       with Settings still open. Cell 1280x800 fine en: the module request
//       HELD (CDP Fetch), Cues entered (the arrival auto-inspect awaits the
//       module), Settings opened through the shell gear, the request RELEASED,
//       the card presents:
//       1  FOCUS-STAYS   document.activeElement stays inside #ob-settings
//                        after the card presents;
//       2  ENTER-STAYS   a REAL Enter key leaves the shell open at the
//                        equipment place (no practice entry);
//       3  LANDS         closing Settings lands focus on a live control (never
//                        <body>, never a hidden element).
//       Control cell (no Settings): the same held release hands focus to the
//       card's primary (the B-K06 law untouched).
//       RESTATED r4b (checker P2, 88440b4f): the P2-1 guard keyed on
//       activeElement being INSIDE a layer — with Settings open and focus
//       fallen to <body> (a REAL click on the modal's non-focusable title)
//       the release still pulled focus onto the background Try-it pill.
//       Body-focus cell (settings-body): gear click, a REAL click on
//       `#ob-settings .ob-panel__title` (precondition: focus is <body>),
//       release → the same three rows, FOCUS-STAYS now = focus is <body> or
//       inside Settings, never the card (the sheet stands down while ANY
//       modal layer is OPEN, wherever focus sits).
// S5-Q2 (review r4 P2-2) pre-fix the COARSE cue sheet budgeted the host + the
//       shell reserve only: with a carom break_spot pending (the equipment
//       place seats the prompt at top 90) the raised sheet put "Full spec"
//       under the prompt's left-start answer — a real tap at the pill's centre
//       answered the decision. Cells 667x375 + 844x390 coarse, de + en:
//       1  CLEAR         sheet top >= the prompt's published bottom + sp-2 − 1,
//                        sheet ∩ prompt = 0 px²;
//       2  SPEC-HIT      the Full-spec pill (scrolled into the sheet's box)
//                        hit-tests to itself at its centre;
//       3  ANSWERS-HIT   each answer whole in the viewport and self-hit
//                        (centre + the four straight-run points);
//       4  TAP-SPEC      a REAL tap on the Full-spec pill expands the specs
//                        (aria-expanded true) and the decision stays pending;
//       5  TAP-ANSWER    a REAL tap on an answer answers it.
//       RESTATED r4b (checker P3 ruled in, 88440b4f): the 46 / 61 px band
//       presented its TITLE row first — Equip / Try it / Full spec only by
//       scrolling inside the band, and at 844 the top ~15 px of the Equip
//       pill showed as a clipped sliver under the title. Measured at the
//       arrival pose, BEFORE any scroll:
//       6  BAND-ACTIONS  the three action pills (Equip, Try it, Full spec)
//                        WHOLE inside the sheet's visible box, each >= 44 px
//                        tall (the coarse floor), each self-hit at its centre
//                        + the four straight-run points;
//       7  BAND-WHOLE    no control (button / summary) is PARTIALLY inside
//                        the visible box — a pill is whole or below the fold.
//       RESTATED r8 (review r8 P2-2, c34a1bb8): at the same
//       sheet-up pose the rail wears BOTH `ob-atelier-rail--yield` (the
//       sheet fills the prompt's band) and the html decision-up state — and
//       the (1,1,1) GH-712 rail rule out-ranked the (1,1,0) yield rule on
//       max-height / overflow-y: measured 844x390 de/en max-height 57px,
//       667x375 de 42px, overflow-y auto, 13 ghost cards through the sheet's
//       52 % glass with pointer-events none (visible, unusable).
//       8  YIELD-KEPT    the yielded rail computes max-height 0px, overflow-y
//                        hidden, pointer-events none, a 0 px box; at least
//                        one cell must reach the yielded pose.
//       RESTATED r9 (review r9 P2-1, 5f07282a): the yielded rail
//       was clipped + pointer-inert but still IN the focus + accessibility
//       tree — measured served: 27 focusable descendants (the roving card at
//       tabindex 0, the docked bar's pills, the chips, the range, the pick
//       rows), the real tap left focus ON the card inside the 0 px box,
//       ArrowRight walked the selection behind the sheet (standard →
//       low_deflection, the sheet following), a 40-key Tab walk from the
//       sheet's close entered the rail 3× (Shift+Tab 4×, the very first key),
//       the AX tree exposed the listbox + 13 options.
//       9  KEYBOARD      at the yielded pose: the rail computes visibility
//                        hidden; focus does not sit inside it after the real
//                        tap; focus() on the selected card does not take;
//                        ArrowRight (after the tap, and from the sheet) never
//                        moves the selection; a 40-key Tab walk AND a 40-key
//                        Shift+Tab walk from the sheet's close never land
//                        inside #ob-atelier-rail; the AX tree
//                        (Accessibility.getPartialAXTree) marks the selected
//                        card ignored.
// S5-X2 (review r4 P2-3) pre-fix fitTxBar returned early on FINE pointers, so
//       a bar docked into a NARROW fine rail (800x600: 288 px) kept the flex
//       sentence form: the note cell shrank to 33 px beside an 85 px badge,
//       the sentence broke one character per line (a 417 px bar over the
//       cards; the badge over Put back). Cells 800x600 + 1024x640 fine ×
//       de / fr / ja, a cloth tint staged + a table card staged; 1440x900 en
//       control (the wide sentence form stands):
//       1  BAR-ROWS      bar height <= max(56 px (two rows), the bar's own
//                        one-row height: tallest pill + block padding +
//                        borders — 58 on the shipped wide fine bar);
//       2  BADGE-DISJOINT badge ∩ Put back = ∅, badge ∩ Keep = ∅, the badge
//                        inside its note cell;
//       3  SENTENCE      a painted sentence spans <= 3 line boxes;
//       4  CARDS-CLEAR   bar ∩ the cards row = 0 px²;
//       5  PILLS         Put back + Keep inside the bar, labels one line box,
//                        each hit-testing to itself at its centre;
//       6  ISLAND        the bar's top >= the host card's bottom + sp-2 − 1
//                        (the rail yields to the host on fine too — the
//                        short-window twin LOOKED on the smoke still:
//                        800x600 the bar rose 56 px under the station
//                        strip, Put back hit-tested to a strip pill).
//       RESTATED r5 (review r5 P2-2, 1cddb2b5): fitTxBar
//       returned early when the .ob-badge was ABSENT — the supported
//       stale-dictionary degrade (syncGatedCopy removes the badge under a
//       cached pre-S5 dictionary) — so the narrow ladder never ran: 800x600
//       de the legacy sentence in ten line boxes inside a 33 px note cell,
//       the bar 228 px over the cards; fr 102 px; 1024x640 de 60 px on two
//       lines. STALE-DICTIONARY leg: 800x600 + 1024x640 fine × de / fr with
//       the derived stale dictionary served at the network (e2e-atelier-
//       s5d.mjs staleDictionary — the documented transform, the S5-D leg's
//       bytes), the same two poses and rows 1-6, plus:
//       7  STALE-FORM    precondition: the badge is absent and the note
//                        reads the derived legacy sentence (the leg served);
//       8  SENTENCE-WHOLE a painted sentence is ONE line box no wider than
//                        its note cell (whole or hidden by --narrow — never
//                        cut).
//       RESTATED r8 (review r8 P2-1, c34a1bb8): the --narrow
//       grid rule was LATER than the [hidden] rule at the same (0,2,0), and
//       fitTxBar returned on hidden BEFORE shedding the rungs — after Keep /
//       Put back on a narrow fine rail the hidden bar kept its grid: 800x600
//       de hidden=true yet display grid, a 288x46 box, both pills painted +
//       focusable, a real Tab walk entered the bar 8 times, at the next
//       station too. Every cell now ENDS each pose (the cloth tint by a REAL
//       click on Keep — the decision cells put back — the card by Put back)
//       and judges the bar after, and again on arrival at the next station:
//       9  HIDE-AFTER    the bar is hidden, computes display none, has no
//                        box, wears no fit rung, its pills take no focus,
//                        one real Tab from the nearest painted focusable
//                        before it never lands inside it, elementFromPoint
//                        at its former centre is not the bar.
//       RESTATED r8 (the fixer's served finding R8-F3 under the integrator's
//       asked pose): the FINE rail's cap read the host edge only — with a
//       carom break_spot pending (the prompt at top 90) the bottom-anchored
//       rail grew up under the prompt: 800x600 de the docked bar 256..544 x
//       161.7..207.7 under the answer row (∩ 7374 px²), Keep AND Put back
//       hit-testing to an answer button (a real click on Keep would have
//       answered the decision). DECISION-UP cells 800x600 + 1024x640 fine x
//       de / en (carom boot, the shell opened under the pending decision,
//       the cloth tint + a CLOTH card — the carom catalogue has one table
//       and a pool-table pick under a carom game is the rules' refusal —
//       rows 1-6 + 9), plus:
//       10 DECISION-UP   the rail's top >= the prompt's bottom + sp-2 − 1,
//                        bar ∩ prompt = 0 px², neither pill hit-tests into
//                        the prompt, the rail has a max-height in effect
//                        and overflow-y auto (the cap, not a clip).
// S5-R2 (visual r4 P2) pre-fix staging a cushion row on the coarse rail left
//       the STAGED row under the sticky preview bar (844x390: bar 81..131, the
//       Han row from 101) — its name unreadable while choosing Keep / Put
//       back. Cells 844x390 + 667x375 coarse, en + ja, two scroll poses per
//       cell (the target row scrolled 'nearest' / 'start' before the tap):
//       1  ROW-CLEAR     the staged row's top >= the bar's bottom + sp-2 − 1,
//                        and the row whole inside the rail's box when the
//                        clear band affords its height;
//       2  NAME-VISIBLE  every Range rect of the row's name below the bar's
//                        bottom, and elementFromPoint at the name's centre
//                        resolves inside the row (not the bar);
//       Put back restores.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';
import { staleDictionary } from './e2e-atelier-s5d.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports the four arms; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
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
async function waitNode(pred, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) { if (pred()) return true; await sleep(ms); }
  return false;
}
async function tap(c, x, y) { await touchStart(c, [{ x, y, id: 1 }]); await sleep(40); await touchEnd(c); }
async function key(c, k, code, vk, modifiers = 0) { // modifiers: CDP bitmask (8 = Shift)
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
}
async function click(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
const attachErrs = (c, errs) => c.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
  else if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
});
const appErrs = (errs) => errs.filter((e) => !/favicon/i.test(String(e)));
/** boot → shell open → the equipment place (the S5-R idiom); false with the reason. */
async function toEquipment(c, tag, fail) {
  if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: boot never ready`); return false; }
  if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); return false; }
  await waitExpr(c, 'window.__shell.isOpen() === true', 100);
  for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
  if (!(await waitExpr(c, 'window.__atelier?.rail?.().live === true', 60))) { fail(`${tag}: rail never live`); return false; }
  return true;
}
async function setLoc(c, loc) {
  // r9 (the r8 checker's P3, arm fidelity): the locale is set EXPLICITLY for every cell, en included — the r8
  // DECISION-UP cells list ['de', 'en'] inside ONE Chrome session per (w, h), and the early return for 'en' left
  // the en cell running in de. No early return: every cell states its locale and waits for it.
  await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
  await waitExpr(c, `window.__i18n.locale() === ${J(loc)} && document.fonts.status === 'loaded'`, 60);
  await sleep(300);
}
const DESC = `((el) => el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset?.ob ? '[' + el.dataset.ob + ']' : '') + '.' + String(el.className || '').split(' ').slice(0, 2).join('.') : 'null')`;
const RR = `((el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })`;
const ovl = (a, b) => (a && b ? +(Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))).toFixed(0) : 0);

// ---- S5-M2: a delayed inspection never steals focus from an open modal ------
const FOCUS = `(() => { const ae = document.activeElement; const desc = ${DESC}; const r = ae && ae.getClientRects ? ae.getClientRects().length : 0;
  return { ae: desc(ae), body: !ae || ae === document.body, inSettings: !!ae?.closest?.('#ob-settings'), inCard: !!ae?.closest?.('#ob-atelier-cue'), inShell: !!ae?.closest?.('#ob-shell'), inAtelier: !!ae?.closest?.('#ob-atelier, #ob-atelier-rail'), painted: r > 0,
    settingsUp: (() => { const s = document.getElementById('ob-settings'); return !!s && !s.hidden && s.getClientRects().length > 0; })(),
    cardUp: document.getElementById('ob-atelier-cue')?.hidden === false, shellOpen: window.__shell?.isOpen?.() ?? null, place: window.__shell?.place?.() ?? null, station: window.__atelier?.station?.() ?? null }; })()`;
export async function runS5M2({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-M2 ${m}`);
  let cells = 0;
  for (const [w, h, loc, mode] of [[1280, 800, 'en', 'settings-open'], [1280, 800, 'en', 'settings-body'], [1280, 800, 'en', 'control']]) {
    const withSettings = mode !== 'control';
    const bodyLeg = mode === 'settings-body';
    const tag = `${w}x${h}/${loc}/${mode}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5m2_${mode}`, { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = []; attachErrs(c, errs);
    const held = []; let releasing = false;
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (!releasing && /ateliercue\.js/.test(params.request.url)) { held.push(params.requestId); return; }
      c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    try {
      if (!(await toEquipment(c, tag, fail))) continue;
      await setLoc(c, loc);
      await c.send('Network.enable');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*ateliercue.js*', requestStage: 'Request' }] });
      await c.eval(`__atelier.go('cues', { force: true }), true`);
      await waitExpr(c, `window.__atelier.station() === 'cues'`, 60);
      if (!(await waitNode(() => held.length > 0, 80, 100))) { fail(`${tag}: precondition — the ateliercue.js request never reached the network hold (the module was already resident)`); continue; }
      log(`S5-M2 ${tag}: ateliercue.js held at the network (${held.length} request(s)); card up ${await c.eval(`document.getElementById('ob-atelier-cue')?.hidden === false`)}`);
      if (withSettings) {
        // a REAL click on the shell rail's gear: focus follows the pointer, so the dialog's prevFocus is the gear and its close restores it (the designed landing)
        const gpt = await c.eval(`(() => { const g = document.getElementById('ob-shell-settings') || document.getElementById('ob-gear'); if (!g || !g.getClientRects().length) return null; const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: g.id }; })()`);
        if (!gpt) { fail(`${tag}: precondition — no painted settings gear`); continue; }
        await click(c, gpt.x, gpt.y);
        if (!(await waitExpr(c, `(() => { const s = document.getElementById('ob-settings'); return !!s && !s.hidden && s.getClientRects().length > 0 && !!document.activeElement?.closest?.('#ob-settings'); })()`, 60))) { fail(`${tag}: precondition — Settings never opened with focus inside (a real click on #${gpt.id} at (${Math.round(gpt.x)}, ${Math.round(gpt.y)}); ${J(await c.eval(FOCUS))})`); continue; }
        await sleep(400);
        if (bodyLeg) {
          // r4b: a REAL click on the modal's non-focusable title drops focus to <body> with Settings still open
          const tpt = await c.eval(`(() => { const t = document.querySelector('#ob-settings .ob-panel__title'); if (!t || !t.getClientRects().length) return null; const r = t.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const at = document.elementFromPoint(x, y); return { x, y, self: !!at && (at === t || t.contains(at)), at: ${DESC}(at), tag: t.tagName.toLowerCase() }; })()`);
          if (!tpt || !tpt.self) { fail(`${tag}: precondition — no painted Settings title to click (${J(tpt)})`); continue; }
          await click(c, tpt.x, tpt.y);
          await sleep(300);
          const fb = await c.eval(FOCUS);
          if (!fb.settingsUp || !fb.body) { fail(`${tag}: precondition — a real click on the Settings ${tpt.tag} at (${Math.round(tpt.x)}, ${Math.round(tpt.y)}) did not leave focus on <body> under the open modal (${J(fb)})`); continue; }
        }
        log(`S5-M2 ${tag}: Settings open, focus before the release ${J(await c.eval(FOCUS))}`);
      }
      releasing = true;
      for (const id of held.splice(0)) await c.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
      if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 100, 100))) { fail(`${tag}: the cue card never presented after the release`); continue; }
      await sleep(600); // the mount enter + the hand-off (same task) + any deferred focus
      const f = await c.eval(FOCUS);
      log(`S5-M2 ${tag}: after the card presented ${J(f)}`);
      cells += 1;
      if (withSettings) {
        if (!f.settingsUp) { fail(`${tag}: FOCUS-STAYS Settings left while the card presented (${J(f)})`); continue; }
        if (bodyLeg) {
          // r4b: focus was <body> under the open modal — the sheet stands down (focus stays <body> or lands inside Settings), never the card
          if (f.inCard || !(f.body || f.inSettings)) fail(`${tag}: FOCUS-STAYS the delayed inspection pulled focus from <body> under the open Settings modal onto ${f.ae}`);
        } else if (!f.inSettings) fail(`${tag}: FOCUS-STAYS focus left the open Settings modal for ${f.ae} when the delayed inspection completed`);
        // 2 ENTER-STAYS: a REAL Enter on whatever holds focus
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await sleep(700);
        const f2 = await c.eval(FOCUS);
        cells += 1;
        if (f2.shellOpen !== true || f2.place !== 'equipment') fail(`${tag}: ENTER-STAYS Enter left the equipment place (shell open ${f2.shellOpen}, place ${f2.place}, focus was ${f.ae})`);
        log(`S5-M2 ${tag}: after Enter ${J(f2)}`);
        // 3 LANDS: close Settings → a live control holds focus
        if (f2.settingsUp) {
          await c.eval(`(document.getElementById('ob-settings-close')?.click(), true)`);
          await waitExpr(c, `(() => { const s = document.getElementById('ob-settings'); return !s || s.hidden || s.getClientRects().length === 0; })()`, 60);
          await sleep(500);
        }
        const f3 = await c.eval(FOCUS);
        cells += 1;
        if (f3.body || !f3.painted) fail(`${tag}: LANDS after closing Settings focus is on ${f3.ae} (painted ${f3.painted})`);
        log(`S5-M2 ${tag}: after closing Settings ${J(f3)}`);
      } else {
        // control: the B-K06 hand-off still lands on the card's primary
        if (!f.inCard) fail(`${tag}: CONTROL the released inspection did not hand focus to the card (focus ${f.ae})`);
      }
      const bad = appErrs(errs);
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-M2 cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

// ---- S5-Q2: the coarse cue sheet clears a pending decision ------------------
const SHEET = `(() => { const rr = ${RR}; const desc = ${DESC};
  const card = document.getElementById('ob-atelier-cue'); const up = !!card && !card.hidden; const sd = document.getElementById('ob-shell-decision');
  const vh = innerHeight, vw = innerWidth;
  const hitAt = (el, x, y) => { const at = document.elementFromPoint(x, y); return { ok: !!at && (at === el || el.contains(at)), at: desc(at) }; };
  const probe = (el) => { const b = el.getBoundingClientRect(); const ix = Math.min(b.height / 2, b.width / 2);
    const pts = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + ix, b.top + 4], [b.right - ix, b.top + 4], [b.left + ix, b.bottom - 4], [b.right - ix, b.bottom - 4]];
    const miss = pts.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y), ...hitAt(el, x, y) })).filter((p) => !p.ok);
    return { text: (el.textContent || '').trim().slice(0, 40), box: rr(el), inView: b.top >= -0.5 && b.bottom <= vh + 0.5 && b.left >= -0.5 && b.right <= vw + 0.5, ok: miss.length === 0, miss }; };
  const answers = sd ? [...sd.querySelectorAll('.osd-btns button')].filter((b) => b.getBoundingClientRect().width > 0) : [];
  const spec = up ? (card.querySelector('[data-ob="atelier-cue-expand"]') || card.querySelector('[data-ob="atelier-details"] > summary')) : null;
  if (spec) { try { spec.scrollIntoView({ block: 'nearest' }); } catch {} }
  const sb = spec ? spec.getBoundingClientRect() : null;
  const specHit = spec ? hitAt(spec, sb.left + sb.width / 2, sb.top + sb.height / 2) : null;
  return { vw, vh, up, decUp: document.documentElement.classList.contains('ob-shell-decision-up'), decBottomVar: getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-decision-bottom').trim(),
    sheet: up ? rr(card) : null, sh: up ? card.scrollHeight : null, ch: up ? card.clientHeight : null, prompt: rr(sd), nAnswers: answers.length, answers: answers.map(probe),
    spec: spec ? { kind: spec.dataset.ob || 'summary', box: rr(spec), text: (spec.textContent || '').trim().slice(0, 30), hit: specHit.ok, at: specHit.at, inSheet: sb.top >= card.getBoundingClientRect().top - 0.5 && sb.bottom <= card.getBoundingClientRect().bottom + 0.5, expanded: spec.getAttribute('aria-expanded') } : null,
    pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null, station: window.__atelier?.station?.() ?? null }; })()`;
// r4b BAND-CONTENT (checker P3 ruled in): the arrival pose, BEFORE any scroll — every control's
// standing against the sheet's visible box (whole / partial / outside) + the three action pills probed
const BANDC = `(() => { const rr = ${RR}; const desc = ${DESC};
  const card = document.getElementById('ob-atelier-cue'); const up = !!card && !card.hidden; if (!up) return { up };
  const cb = card.getBoundingClientRect();
  const hitAt = (el, x, y) => { const at = document.elementFromPoint(x, y); return { ok: !!at && (at === el || el.contains(at)), at: desc(at) }; };
  const stand = (b) => (b.top >= cb.top - 0.5 && b.bottom <= cb.bottom + 0.5) ? 'whole' : ((b.bottom <= cb.top + 0.5 || b.top >= cb.bottom - 0.5) ? 'outside' : 'partial');
  const probe = (el) => { const b = el.getBoundingClientRect(); const ix = Math.min(b.height / 2, b.width / 2);
    const pts = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + ix, b.top + 4], [b.right - ix, b.top + 4], [b.left + ix, b.bottom - 4], [b.right - ix, b.bottom - 4]];
    const miss = pts.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y), ...hitAt(el, x, y) })).filter((p) => !p.ok);
    return { text: (el.textContent || '').trim().slice(0, 30), box: rr(el), stand: stand(b), ok: miss.length === 0, miss }; };
  const controls = [...card.querySelectorAll('button, summary')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().width > 0)
    .map((el) => { const b = el.getBoundingClientRect(); return { d: desc(el), text: (el.textContent || '').trim().slice(0, 24), box: rr(el), stand: stand(b) }; });
  const pick = (sel) => card.querySelector(sel);
  const acts = { equip: pick('[data-ob="atelier-equip"]'), tryit: pick('[data-ob="atelier-tryit"]'), spec: pick('[data-ob="atelier-cue-expand"]') || pick('[data-ob="atelier-details"] > summary') };
  const cs = getComputedStyle(card);
  return { up, sheet: rr(card), ch: card.clientHeight, sh: card.scrollHeight, scrollTop: card.scrollTop, pad: [cs.paddingTop, cs.paddingBottom], decUp: document.documentElement.classList.contains('ob-shell-decision-up'),
    actions: Object.fromEntries(Object.entries(acts).map(([k, el]) => [k, el ? probe(el) : null])), controls }; })()`;
// r8 YIELD-KEPT (review r8 P2-2): the rail's standing at the sheet-up pose — both classes, the computed cap, the box
const RAILY = `(() => { const rr = ${RR}; const rail = document.getElementById('ob-atelier-rail'); if (!rail) return { none: true }; const cs = getComputedStyle(rail); const r = rail.getBoundingClientRect();
  return { cls: rail.className, yield: rail.classList.contains('ob-atelier-rail--yield'), decUp: document.documentElement.classList.contains('ob-shell-decision-up'), maxHeight: cs.maxHeight, overflowY: cs.overflowY, pointerEvents: cs.pointerEvents,
    h: +r.height.toFixed(1), rect: rr(rail), clientHeight: rail.clientHeight, cards: rail.querySelectorAll('.ob-cardrail-card').length, hostB: getComputedStyle(document.documentElement).getPropertyValue('--ob-eq-host-b').trim() }; })()`;
// r9 KEYBOARD (review r9 P2-1): the yielded rail's standing in the FOCUS + ACCESSIBILITY tree — computed visibility / inert,
// the active element after the real tap, focus() on the selected card (takes only on a focusable, rendered element; restored)
const KBD = `(() => { const desc = ${DESC}; const rail = document.getElementById('ob-atelier-rail'); if (!rail) return { none: true }; const cs = getComputedStyle(rail);
  const ae0 = document.activeElement; const sel = rail.querySelector('.ob-cardrail-card[aria-selected="true"]'); let took = null;
  if (sel) { try { sel.focus({ preventScroll: true }); took = document.activeElement === sel; } catch { took = 'err'; } }
  const aeTry = desc(document.activeElement);
  try { if (took === true) { if (ae0 && ae0 !== document.body && ae0 !== sel) ae0.focus({ preventScroll: true }); } } catch {}
  const focusables = rail.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])').length;
  return { visibility: cs.visibility, inert: rail.inert === true, ae: desc(ae0), aeInRail: !!ae0 && rail.contains(ae0), aeInSheet: !!ae0 && !!ae0.closest('#ob-atelier-cue'), selected: sel?.dataset.id ?? null, selFocusTook: took, aeAfterTry: aeTry, focusables }; })()`;
const AE = `(() => { const desc = ${DESC}; const ae = document.activeElement; return { ae: desc(ae), inRail: !!ae && !!ae.closest('#ob-atelier-rail') }; })()`;
const SELID = `(() => ({ selected: document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]')?.dataset.id ?? null, sheetUp: document.getElementById('ob-atelier-cue')?.hidden === false }))()`;
const FOCUS_CLOSE = `(() => { const b = document.querySelector('#ob-atelier-cue [data-ob="atelier-cue-close"]'); if (!b) return false; b.focus({ preventScroll: true }); return document.activeElement === b; })()`;
async function axNode(c, selector) {
  const { root } = await c.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return { none: true };
  const r = await c.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const n = r.nodes?.[0];
  return n ? { role: n.role?.value ?? null, ignored: n.ignored === true, reasons: (n.ignoredReasons || []).map((x) => x.name), name: n.name?.value ?? null } : { none: true };
}
export async function runS5Q2({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-Q2 ${m}`);
  let cells = 0, yielded = 0;
  for (const [w, h, loc] of [[667, 375, 'de'], [844, 390, 'de'], [667, 375, 'en'], [844, 390, 'en']]) {
    const tag = `${w}x${h}/${loc}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5q2_${w}_${loc}`, { cdpPort: CDP_PORT, width: w, height: h, tool: false });
    const errs = []; attachErrs(c, errs);
    try {
      await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: pre-boot never ready`); continue; }
      // the carom boot: the fresh rack pends UMB 23.1(c) break_spot (the S5-Q / arm-I idiom)
      await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion', language: ${J(loc)} })), location.reload(), true)`);
      await sleep(1200);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: carom boot never ready`); continue; }
      if (!(await waitExpr(c, `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`, 80))) { fail(`${tag}: the carom boot never raised the break_spot decision`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      if (loc !== 'en') await waitExpr(c, `window.__i18n?.locale?.() === ${J(loc)}`, 60);
      if (!(await c.eval('__shell.isOpen() || __shell.openShell() === true'))) { fail(`${tag}: the shell would not open under the pending decision`); continue; }
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier?.rail?.().live === true', 60))) { fail(`${tag}: rail never live`); continue; }
      await setLoc(c, loc); // r9: explicit for every cell (en included)
      await c.eval(`__atelier.go('cues', { force: true }), true`);
      await waitExpr(c, `window.__atelier.station() === 'cues' && !window.__shell.moving()`, 80);
      if (!(await waitExpr(c, `document.querySelectorAll('#ob-shell-decision .osd-btns button').length >= 2 && document.documentElement.classList.contains('ob-shell-decision-up')`, 60))) { fail(`${tag}: the in-shell break_spot prompt never mounted`); continue; }
      // inspect a cue: a REAL tap on a rail card (the coarse register never auto-inspects)
      await sleep(700); // the prompt's font-settled re-wrap → its ResizeObserver publish → the rail's band (a transient 0-height rail was measured mid-publish under load)
      // the rail's band under the prompt is shorter than a card (71 px at 667x375): the tap lands on the card's VISIBLE part (card ∩ rail clip ∩ viewport)
      const PT = `(() => { const el = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].find((x) => x.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(), k = document.getElementById('ob-atelier-rail').getBoundingClientRect();
        const t = Math.max(r.top, k.top, 0), b = Math.min(r.bottom, k.bottom, innerHeight), l = Math.max(r.left, k.left, 0), rt = Math.min(r.right, k.right, innerWidth); if (b - t < 8 || rt - l < 8) return { id: el.dataset.id, none: true, card: [r.top, r.bottom], rail: [k.top, k.bottom] };
        const x = (l + rt) / 2, y = (t + b) / 2; const at = document.elementFromPoint(x, y); return { x, y, hit: !!at && (at === el || el.contains(at)), id: el.dataset.id, visible: +(b - t).toFixed(1) }; })()`;
      let pt = null;
      for (let i = 0; i < 20 && (!pt || pt.none); i++) { pt = await c.eval(PT); if (!pt || pt.none) await sleep(200); }
      if (!pt || pt.none) { fail(`${tag}: no tappable rail card under the prompt after 4 s (${J(pt)}; dec-bottom ${await c.eval(`getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-decision-bottom')`)}, reserve-b ${await c.eval(`getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-reserve-b')`)})`); continue; }
      await sleep(200);
      await tap(c, pt.x, pt.y);
      if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 60))) {
        // the card may already be selected: a second tap on the same card re-presents the sheet
        await tap(c, pt.x, pt.y);
        if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 40))) { fail(`${tag}: the cue sheet never presented after a real tap on card ${pt.id} at (${Math.round(pt.x)}, ${Math.round(pt.y)}) (self-hit ${pt.hit})`); continue; }
      }
      await sleep(800); // the mount enter + the band publish + the prompt's ResizeObserver publish
      const bc = await c.eval(BANDC); // r4b: the arrival pose first — SHEET below scrolls the spec control into view
      log(`S5-Q2 ${tag}: BAND sheet ${bc.sheet ? `${bc.sheet.t}..${bc.sheet.b} (h ${bc.sheet.h}, ch ${bc.ch}, sh ${bc.sh}, scrollTop ${bc.scrollTop}, pad ${bc.pad.join('/')})` : '-'} actions ${J(Object.fromEntries(Object.entries(bc.actions || {}).map(([k, a]) => [k, a ? { text: a.text, box: a.box, stand: a.stand, ok: a.ok, miss: a.miss.slice(0, 2) } : null])))} controls ${J((bc.controls || []).map((k) => [k.d, k.stand, k.box && [k.box.t, k.box.b]]))}`);
      const m = await c.eval(SHEET);
      log(`S5-Q2 ${tag}: prompt ${m.prompt ? `${m.prompt.l}..${m.prompt.r} x ${m.prompt.t}..${m.prompt.b}` : '-'} (dec-bottom ${m.decBottomVar || '-'}) sheet ${m.sheet ? `${m.sheet.l}..${m.sheet.r} x ${m.sheet.t}..${m.sheet.b} (h ${m.sheet.h}, sh ${m.sh}, ch ${m.ch})` : '-'} ∩ ${ovl(m.sheet, m.prompt)} px² spec ${J(m.spec)} answers ${J(m.answers.map((a) => ({ text: a.text, box: a.box, ok: a.ok, miss: a.miss.slice(0, 2) })))}`);
      if (!m.up || m.pend !== 'break_spot' || m.station !== 'cues' || !m.decUp || m.nAnswers < 2) { fail(`${tag}: staging — sheet up ${m.up}, pending ${m.pend}, station ${m.station}, decision-up ${m.decUp}, answers ${m.nAnswers}`); continue; }
      // 1 CLEAR
      cells += 1;
      if (m.sheet.t < m.prompt.b + 8 - 1) fail(`${tag}: CLEAR sheet top ${m.sheet.t} is not one sp-2 under the prompt's bottom ${m.prompt.b}`);
      if (ovl(m.sheet, m.prompt) > 0) fail(`${tag}: CLEAR sheet ∩ prompt = ${ovl(m.sheet, m.prompt)} px² (sheet ${m.sheet.t}..${m.sheet.b}, prompt ${m.prompt.t}..${m.prompt.b})`);
      // 2 SPEC-HIT
      cells += 1;
      if (!m.spec) fail(`${tag}: SPEC-HIT no Full-spec control on the sheet`);
      else if (!m.spec.inSheet || !m.spec.hit) fail(`${tag}: SPEC-HIT "${m.spec.text}" ${J(m.spec.box)} is covered — elementFromPoint resolves to ${m.spec.at} (in sheet ${m.spec.inSheet})`);
      // 3 ANSWERS-HIT
      for (const a of m.answers) {
        cells += 1;
        if (!a.inView) fail(`${tag}: ANSWERS-HIT "${a.text}" is not whole inside the viewport: ${J(a.box)}`);
        else if (!a.ok) fail(`${tag}: ANSWERS-HIT "${a.text}" is covered — elementFromPoint resolves to ${a.miss.map((p) => `${p.at} at (${p.x},${p.y})`).join('; ')}`);
      }
      // 6 BAND-ACTIONS (r4b): the three action pills whole in the visible box at the arrival pose, >= 44 px, self-hit
      for (const [k, a] of Object.entries(bc.actions || {})) {
        cells += 1;
        if (!a) { fail(`${tag}: BAND-ACTIONS no ${k} control on the sheet`); continue; }
        if (a.stand !== 'whole') fail(`${tag}: BAND-ACTIONS "${a.text}" ${J(a.box)} is ${a.stand} the sheet's visible box ${bc.sheet.t}..${bc.sheet.b} at the arrival pose (scrollTop ${bc.scrollTop})`);
        else if (a.box.h < 44 - 0.5) fail(`${tag}: BAND-ACTIONS "${a.text}" is ${a.box.h} px tall (coarse floor 44)`);
        else if (!a.ok) fail(`${tag}: BAND-ACTIONS "${a.text}" is covered — elementFromPoint resolves to ${a.miss.map((p) => `${p.at} at (${p.x},${p.y})`).join('; ')}`);
      }
      // 7 BAND-WHOLE (r4b): a pill is whole or below the fold — never a clipped sliver in the visible box
      cells += 1;
      const partial = (bc.controls || []).filter((k) => k.stand === 'partial');
      if (partial.length) fail(`${tag}: BAND-WHOLE ${partial.length} control(s) partially inside the visible box ${bc.sheet.t}..${bc.sheet.b}: ${partial.map((k) => `${k.d} "${k.text}" ${k.box.t}..${k.box.b}`).join('; ')}`);
      // 8 YIELD-KEPT (r8, review r8 P2-2): the sheet fills the prompt's band, so publishBands yields the rail WHOLE — and the yield
      // must survive the decision-up rule (pre-fix the (1,1,1) GH-712 rule restored max-height 57 / 42 px + overflow-y auto over
      // the (1,1,0) yield: 13 ghost cards through the sheet's 52 % glass, pointer-events none)
      const ry = await c.eval(RAILY);
      log(`S5-Q2 ${tag}: RAIL ${J(ry)}`);
      cells += 1;
      if (ry.none) fail(`${tag}: YIELD-KEPT no rail`);
      else if (!ry.yield) log(`S5-Q2 ${tag}: YIELD-KEPT the rail did not yield in this cell [${ry.cls}] (rect ${J(ry.rect)}) — the row needs a yielded cell`);
      else {
        yielded += 1;
        if (!ry.decUp) fail(`${tag}: YIELD-KEPT staging — the yielded rail is not under the decision-up state`);
        if (ry.maxHeight !== '0px') fail(`${tag}: YIELD-KEPT the yielded rail computes max-height ${ry.maxHeight} under the decision (overflow-y ${ry.overflowY}; ${ry.h} px tall with ${ry.cards} cards in the band under the sheet ${m.sheet.t}..${m.sheet.b})`);
        if (ry.overflowY !== 'hidden') fail(`${tag}: YIELD-KEPT the yielded rail's overflow-y is ${ry.overflowY}, not hidden`);
        if (ry.h > 0.5) fail(`${tag}: YIELD-KEPT the yielded rail stands ${ry.h} px tall (${J(ry.rect)}) under the sheet ${m.sheet.t}..${m.sheet.b}`);
        if (ry.pointerEvents !== 'none') fail(`${tag}: YIELD-KEPT the yielded rail's pointer-events is ${ry.pointerEvents}`);
        // 9 KEYBOARD (r9, review r9 P2-1): the yielded rail leaves the FOCUS + ACCESSIBILITY tree — pre-fix (5f07282a) the
        // 0 px overflow-hidden rail kept 27 focusable descendants, the real tap left focus ON the card, ArrowRight walked
        // the selection behind the sheet, a Tab walk from the sheet entered the rail, the AX tree exposed the listbox
        const k0 = await c.eval(KBD);
        log(`S5-Q2 ${tag}: KEYBOARD ${J(k0)}`);
        cells += 1;
        if (k0.visibility !== 'hidden') fail(`${tag}: KEYBOARD the yielded rail computes visibility ${k0.visibility}, not hidden (${k0.focusables} focusable descendants reachable)`);
        if (k0.aeInRail) fail(`${tag}: KEYBOARD after the real tap focus sits INSIDE the yielded rail (${k0.ae})`);
        if (k0.selFocusTook !== false) fail(`${tag}: KEYBOARD focus() on the selected card ${k0.selected} took inside the yielded rail (active ${k0.aeAfterTry})`);
        // arrow keys wherever the tap left focus: the selection must not walk behind the sheet
        const a0 = await c.eval(SELID); await key(c, 'ArrowRight', 'ArrowRight', 39); await sleep(400); const a1 = await c.eval(SELID); const aeA = await c.eval(AE);
        log(`S5-Q2 ${tag}: KEYBOARD ArrowRight after the tap: ${a0.selected} → ${a1.selected} (active ${aeA.ae})`);
        if (a1.selected !== a0.selected) { fail(`${tag}: KEYBOARD ArrowRight after the tap walked the selection behind the sheet (${a0.selected} → ${a1.selected}; active ${aeA.ae})`); await key(c, 'ArrowLeft', 'ArrowLeft', 37); await sleep(400); }
        // a 40-key Tab walk and a 40-key Shift+Tab walk from the sheet's close: never a landing inside the rail
        for (const [name, mods] of [['Tab', 0], ['Shift+Tab', 8]]) {
          if (!(await c.eval(FOCUS_CLOSE))) { fail(`${tag}: KEYBOARD the sheet's close would not take focus for the ${name} walk`); continue; }
          const walk = [], hitIdx = [];
          for (let i = 0; i < 40; i++) { await key(c, 'Tab', 'Tab', 9, mods); await sleep(50); const a = await c.eval(AE); walk.push(a.ae); if (a.inRail) hitIdx.push(i + 1); }
          log(`S5-Q2 ${tag}: KEYBOARD ${name} walk: rail landings ${hitIdx.length}${hitIdx.length ? ` at keys ${hitIdx.join(',')}` : ''}; ${J(walk.slice(0, 14))}${walk.length > 14 ? ' …' : ''}`);
          if (hitIdx.length) fail(`${tag}: KEYBOARD a 40-key ${name} walk from the sheet entered the yielded rail ${hitIdx.length}× (first at key ${hitIdx[0]}: ${walk[hitIdx[0] - 1]})`);
        }
        // arrow keys from the sheet's close: nothing moves
        await c.eval(FOCUS_CLOSE); const b0 = await c.eval(SELID); await key(c, 'ArrowRight', 'ArrowRight', 39); await sleep(300); const b1 = await c.eval(SELID); const aeB = await c.eval(AE);
        if (b1.selected !== b0.selected || aeB.inRail) { fail(`${tag}: KEYBOARD ArrowRight from the sheet moved the selection / focus into the rail (${b0.selected} → ${b1.selected}; active ${aeB.ae})`); await key(c, 'ArrowLeft', 'ArrowLeft', 37); await sleep(300); }
        // the AX tree: the yielded rail's cards are not exposed
        try {
          await c.send('Accessibility.enable');
          const axRail = await axNode(c, '#ob-atelier-rail'), axStrip = await axNode(c, '[data-ob="atelier-rail-cards"]'), axCard = await axNode(c, '#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]');
          log(`S5-Q2 ${tag}: KEYBOARD AX rail ${J(axRail)} strip ${J(axStrip)} card ${J(axCard)}`);
          if (!axCard || axCard.none) fail(`${tag}: KEYBOARD no AX node for the selected card`);
          else if (axCard.ignored !== true) fail(`${tag}: KEYBOARD the AX tree exposes the yielded rail's selected card (role ${axCard.role}, name ${J(axCard.name)})`);
        } catch (e) { fail(`${tag}: KEYBOARD the AX read threw: ${e?.message || e}`); }
        await c.eval(FOCUS_CLOSE); // leave focus where the user's would be
      }
      // 4 TAP-SPEC: a REAL tap on the Full-spec control
      if (m.spec) {
        const sx = m.spec.box.l + m.spec.box.w / 2, sy = m.spec.box.t + m.spec.box.h / 2;
        await tap(c, sx, sy);
        await sleep(500);
        const s2 = await c.eval(`(() => { const card = document.getElementById('ob-atelier-cue'); const b = card?.querySelector('[data-ob="atelier-cue-expand"]'); const d = card?.querySelector('[data-ob="atelier-details"]');
          return { expanded: b ? b.getAttribute('aria-expanded') === 'true' : (d ? d.open : null), pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null, prompt: !!document.getElementById('ob-shell-decision') }; })()`);
        cells += 1;
        if (s2.pend !== 'break_spot' || !s2.prompt) fail(`${tag}: TAP-SPEC a real tap on "${m.spec.text}" at (${Math.round(sx)}, ${Math.round(sy)}) ANSWERED the decision (pending ${s2.pend}, prompt ${s2.prompt})`);
        else if (s2.expanded !== true) fail(`${tag}: TAP-SPEC a real tap on "${m.spec.text}" at (${Math.round(sx)}, ${Math.round(sy)}) did not expand the specs (expanded ${s2.expanded})`);
        log(`S5-Q2 ${tag}: after the spec tap ${J(s2)}`);
      }
      // 5 TAP-ANSWER: a REAL tap on the first answer
      const m2 = await c.eval(SHEET);
      const a0 = m2.answers[0];
      if (a0) {
        const ax = a0.box.l + a0.box.w / 2, ay = a0.box.t + a0.box.h / 2;
        await tap(c, ax, ay);
        const answered = await waitExpr(c, `!document.getElementById('ob-shell-decision') && window.__rules.matchState()?.pendingDecision?.kind !== 'break_spot'`, 40);
        cells += 1;
        if (!answered) fail(`${tag}: TAP-ANSWER a real tap on "${a0.text}" at (${Math.round(ax)}, ${Math.round(ay)}) did not answer the decision (pending ${await c.eval(`window.__rules.matchState()?.pendingDecision?.kind ?? null`)})`);
      }
      const bad = appErrs(errs);
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-Q2 cells judged: ${cells} (yielded ${yielded})`);
  if (cells === 0) fail('no cell judged');
  if (cells && yielded === 0) fail('YIELD-KEPT: no cell reached the yielded pose (the row never ran)');
}

// ---- S5-X2: the docked bar fits a narrow FINE rail too ----------------------
const BAR = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rr = ${RR};
  const R = (e) => e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const q = (s) => document.querySelector(s), tx = q('[data-ob="atelier-txbar"]'), txr = R(tx);
  const sd = document.getElementById('ob-shell-decision'), railEl = q('#ob-atelier-rail'), rcs = railEl ? getComputedStyle(railEl) : null; // r8: the decision-up cells
  const note = tx && tx.querySelector('.ob-atelier-txnote'), badge = tx && tx.querySelector('[data-ob="atelier-txstate"]'), text = tx && tx.querySelector('.ob-atelier-txnote__text'); // GH-1001: the state marker
  const back = tx && tx.querySelector('[data-ob="atelier-revert"]'), keep = tx && tx.querySelector('[data-ob="atelier-keep"]');
  const inside = (a, b, m = 0.5) => !!a && !!b && a.left >= b.left - m && a.top >= b.top - m && a.right <= b.right + m && a.bottom <= b.bottom + m;
  const hit = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const lines = (el) => { if (!el || !R(el)) return []; const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter((l) => l.width > 0 && l.height > 0).map((l) => [+l.top.toFixed(1), +l.width.toFixed(1)]); };
  const pill = (el) => { const r = R(el); if (!r) return null; const sp = el.querySelector('span') || el; const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { rect: rr(el), lines: lines(sp).length, fit: el.scrollWidth <= el.clientWidth + 1, txt: (sp.textContent || '').trim(), inBar: inside(r, txr), hit: !!at && (at === el || el.contains(at)), at: at ? at.tagName.toLowerCase() + '.' + String(at.className || '').split(' ').slice(0, 2).join('.') : 'null', inPrompt: !!at && !!sd && sd.contains(at) }; };
  const host = document.querySelector('#ob-shell-cards section[data-place="equipment"]');
  const br = R(badge), nr = R(note), bk = R(back), kp = R(keep), tr = R(text);
  const cards = q('[data-ob="atelier-rail-cards"]');
  // the bar's own ONE-ROW height: the tallest pill + the bar's block padding + borders (the shipped fine bar on a wide rail is 58 px: 40 + 2 x 8 + 2)
  const cs = tx ? getComputedStyle(tx) : null, f = (k) => (cs ? parseFloat(cs[k]) || 0 : 0);
  const oneRow = Math.max(bk ? bk.height : 0, kp ? kp.height : 0) + f('paddingTop') + f('paddingBottom') + f('borderTopWidth') + f('borderBottomWidth');
  return { vw: innerWidth, vh: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, display: tx ? getComputedStyle(tx).display : null, cls: tx ? tx.className : null, oneRow: +oneRow.toFixed(1),
    station: window.__atelier.station(), preview: window.__settings?.preview?.active?.() ?? null, inRail: !!tx?.closest('#ob-atelier-rail'),
    rail: rr(q('#ob-atelier-rail')), bar: rr(tx), note: nr ? { rect: rr(note), sw: note.scrollWidth, cw: note.clientWidth } : null,
    text: tr ? { rect: rr(text), lines: lines(text), txt: (text.textContent || '').trim().slice(0, 60) } : null,
    textRaw: text ? (text.textContent || '').trim().slice(0, 60) : null, // the sentence's copy whether painted or hidden (--narrow hides it by law)
    badge: badge ? { hidden: !br, rect: rr(badge), txt: badge.textContent.trim(), inNote: !br || inside(br, nr), hitBack: hit(br, bk), hitKeep: hit(br, kp) } : null,
    back: pill(back), keep: pill(keep), cards: rr(cards), host: rr(host), railScroll: q('#ob-atelier-rail')?.scrollTop ?? null,
    // r8 DECISION-UP: the prompt's box, the shell's decision state, the rail's computed cap
    prompt: rr(sd), decUp: document.documentElement.classList.contains('ob-shell-decision-up'), pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null, railMax: rcs ? rcs.maxHeight : null, railOy: rcs ? rcs.overflowY : null };
})()`;
// r8 HIDE-AFTER (review r8 P2-1): the bar after Keep / Put back — attribute, computed display, box, focusability of its pills
// (programmatic focus lands only on a laid-out element) + the nearest painted focusable BEFORE the bar in document order takes
// focus so the caller can press ONE real Tab and read where it lands
const HIDDEN = `(() => { const rr = ${RR}; const desc = ${DESC}; const tx = document.querySelector('[data-ob="atelier-txbar"]'); if (!tx) return { none: true };
  const cs = getComputedStyle(tx); const btns = [...tx.querySelectorAll('button')];
  const foc = btns.map((b) => { let ok = false; try { b.focus(); ok = document.activeElement === b; if (ok) b.blur(); } catch { ok = false; } return { d: desc(b), focusable: ok, painted: b.getClientRects().length > 0 }; });
  const all = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')];
  const i = btns[0] ? all.indexOf(btns[0]) : -1; let prev = null;
  for (let k = i - 1; k >= 0; k--) { const el = all[k]; if (el.getClientRects().length && !el.disabled && !tx.contains(el)) { prev = el; break; } }
  if (prev) prev.focus();
  return { hidden: tx.hidden, cls: tx.className, display: cs.display, rects: tx.getClientRects().length, rect: rr(tx), foc, prev: desc(prev), prevFocused: !!prev && document.activeElement === prev, station: window.__atelier?.station?.() ?? null }; })()`;
export async function runS5X2({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-X2 ${m}`);
  let cells = 0;
  // the fourth tuple slot: the STALE-DICTIONARY leg (r5) — the derived pre-S5 dictionary served at the network for the cell's locales
  // the fifth slot: the DECISION-UP leg (r8) — a carom break_spot pending in the shell while the bar is staged (the fixer's served finding R8-F3)
  const CELLS = [[800, 600, ['de', 'fr', 'ja']], [1024, 640, ['de', 'fr', 'ja']], [1440, 900, ['en']], [800, 600, ['de', 'fr'], true], [1024, 640, ['de', 'fr'], true], [800, 600, ['de', 'en'], false, 'decision'], [1024, 640, ['de', 'en'], false, 'decision']];
  const stale = {}; // locale → base64 of the derived stale dictionary (fetched once from the suite's own server)
  let hideCells = 0;
  for (const [w, h, locs, isStale, mode] of CELLS) {
    const decision = mode === 'decision';
    const cellTag = `${w}x${h}${isStale ? '/stale' : ''}${decision ? '/decision' : ''}`;
    if (isStale) {
      for (const loc of [...new Set(['en', ...locs])]) {
        if (stale[loc]) continue;
        try { const res = await fetch(`http://127.0.0.1:${PORT}/app/locales/${loc}.json`); if (!res.ok) throw new Error(`HTTP ${res.status}`); stale[loc] = Buffer.from(JSON.stringify(staleDictionary(await res.json(), loc)), 'utf8').toString('base64'); }
        catch (e) { fail(`${cellTag}: could not derive the stale ${loc} dictionary: ${e.message}`); }
      }
      if (!locs.every((l) => stale[l]) || !stale.en) continue;
    }
    if (!(await waitPortFree(CDP_PORT))) { fail(`${cellTag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5x2_${w}${isStale ? '_stale' : ''}${decision ? '_dec' : ''}_${u}`;
    const c = await launchChrome(url('warm'), { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = []; attachErrs(c, errs);
    const served = {};
    if (isStale) c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const m = /locales\/([a-zA-Z-]+)\.json/.exec(params.request.url);
      const loc = m && stale[m[1]] ? m[1] : null;
      if (loc) { served[loc] = (served[loc] || 0) + 1; c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: stale[loc] }).catch(() => {}); }
      else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    try {
      if (isStale) {
        // the S5-D idiom: a warm boot, then the stale dictionary served at the network on a cache-disabled document
        if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${cellTag}: warm boot never ready`); continue; }
        await c.send('Network.enable');
        await c.send('Network.setCacheDisabled', { cacheDisabled: true });
        await c.send('Fetch.enable', { patterns: [{ urlPattern: '*locales/*.json*' }] });
        await c.send('Page.navigate', { url: url('stale') });
      }
      if (decision) {
        // the carom boot: the fresh rack pends UMB 23.1(c) break_spot (the S5-Q / S5-Q2 idiom); the shell opens under the pending decision
        if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${cellTag}: pre-boot never ready`); continue; }
        await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion' })), location.reload(), true)`);
        await sleep(1200);
        if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${cellTag}: carom boot never ready`); continue; }
        if (!(await waitExpr(c, `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`, 80))) { fail(`${cellTag}: the carom boot never raised the break_spot decision`); continue; }
        if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${cellTag}: no shell`); continue; }
        if (!(await c.eval('__shell.isOpen() || __shell.openShell() === true'))) { fail(`${cellTag}: the shell would not open under the pending decision`); continue; }
      }
      if (!(await toEquipment(c, cellTag, fail))) continue;
      if (decision && !(await waitExpr(c, `document.querySelectorAll('#ob-shell-decision .osd-btns button').length >= 2 && document.documentElement.classList.contains('ob-shell-decision-up')`, 60))) { fail(`${cellTag}: the in-shell break_spot prompt never mounted`); continue; }
      if (isStale) {
        const took = await c.eval(`typeof window.__i18n === 'object' && !window.__i18n.keys().includes('atelier.leave.title') && !window.__i18n.keys().includes('atelier.preview.badge')`);
        log(`S5-X2 ${cellTag}: stale dictionaries served ${J(served)}, poison took ${took}`);
        if (!took) { fail(`${cellTag}: precondition — the stale dictionary did not take (served ${J(served)})`); continue; }
      }
      const goSt = async (st) => { await c.eval(`__atelier.go(${J(st)}, { force: true }), true`); await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving() && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 60); await sleep(400); };
      const centre = (sel) => c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => !x.hidden && x.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      const judge = async (tag, wide) => {
        await sleep(500);
        const z = await c.eval(BAR, { awaitPromise: true });
        cells += 1;
        const b = z.badge;
        log(`S5-X2 ${tag} ${J({ rail: z.rail && [z.rail.t, z.rail.b, z.rail.w], railScroll: z.railScroll, host: z.host && [z.host.t, z.host.b], bar: z.bar && [z.bar.t, z.bar.b, z.bar.h, z.bar.w], oneRow: z.oneRow, display: z.display, cls: z.cls, note: z.note && [z.note.sw, z.note.cw, z.note.rect.w], text: z.text && { lines: z.text.lines.length, w: z.text.rect.w }, badge: b && (b.hidden ? 'hidden' : [b.rect.l, b.rect.r, b.txt]), back: z.back && [z.back.rect.l, z.back.rect.r, z.back.rect.h, z.back.lines], keep: z.keep && [z.keep.rect.l, z.keep.rect.r, z.keep.rect.h, z.keep.lines], cards: z.cards && [z.cards.t, z.cards.b] })}`);
        if (!z.bar) { fail(`${tag}: txbar not painted (preview ${J(z.preview)})`); return z; }
        if (z.coarse) fail(`${tag}: not a fine-pointer cell`);
        // the budget: two rows = 56 px, or the bar's own one-row height when a pill row is taller than that (the shipped wide fine bar: 58) — a second LINE always exceeds it
        const budget = Math.max(56, z.oneRow || 0);
        if (z.bar.h > budget + 0.5) fail(`${tag}: BAR-ROWS the bar stands ${z.bar.h} px tall (> ${budget}: two rows / its own one-row height ${z.oneRow}) in a ${z.rail ? z.rail.w : '?'} px rail`);
        if (b && !b.hidden) {
          if (b.hitBack) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} "${b.txt}" paints over Put back ${J(z.back?.rect)}`);
          if (b.hitKeep) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} "${b.txt}" paints over Keep ${J(z.keep?.rect)}`);
          if (!b.inNote) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} leaves its note cell ${J(z.note?.rect)}`);
        }
        if (z.text && z.text.lines.length > 3) fail(`${tag}: SENTENCE "${z.text.txt}" breaks into ${z.text.lines.length} line boxes (note cell ${z.note?.cw} px)`);
        if (isStale) {
          // 7 STALE-FORM: the leg's own precondition on the painted bar — no badge, the legacy sentence
          if (b) fail(`${tag}: STALE-FORM the badge is present (${J(b)}) under the stale dictionary — the leg did not serve`);
          if (!/ — /.test(z.textRaw || '')) fail(`${tag}: STALE-FORM the note does not carry the legacy sentence (${J(z.textRaw)})`);
          // 8 SENTENCE-WHOLE: whole or hidden, never cut — one line box no wider than its cell
          if (z.text && z.text.lines.length > 1) fail(`${tag}: SENTENCE-WHOLE "${z.text.txt}" is ${z.text.lines.length} line boxes (note cell ${z.note?.cw} px) — cut, not hidden`);
          if (z.text && z.text.lines.length === 1 && z.note && z.text.lines[0][1] > z.note.cw + 0.5) fail(`${tag}: SENTENCE-WHOLE the line box ${z.text.lines[0][1]} px is wider than its note cell ${z.note.cw} px`);
        }
        if (z.cards && z.bar && ovl(z.bar, z.cards) > 0) fail(`${tag}: CARDS-CLEAR the bar ${z.bar.t}..${z.bar.b} covers the cards row ${z.cards.t}..${z.cards.b} (${ovl(z.bar, z.cards)} px²)`);
        for (const [name, p] of [['Put back', z.back], ['Keep', z.keep]]) {
          if (!p) { fail(`${tag}: PILLS ${name} not painted`); continue; }
          if (!p.inBar) fail(`${tag}: PILLS ${name} ${J(p.rect)} leaves the bar ${J(z.bar)}`);
          if (p.lines !== 1) fail(`${tag}: PILLS ${name} "${p.txt}" is ${p.lines} line boxes`);
          if (!p.fit) fail(`${tag}: PILLS ${name} "${p.txt}" truncated`);
          if (!p.hit) fail(`${tag}: PILLS ${name} "${p.txt}" ${J(p.rect)} does not hit-test to itself at its centre (covered by ${p.at})`);
        }
        // ISLAND (the short-window twin, LOOKED on the smoke still): the docked bar — the rail's top row — sits one sp-2 under the host card (the strip paints above the rail by the F5 mount order)
        if (z.host && z.bar && z.bar.t < z.host.b + 8 - 1) fail(`${tag}: ISLAND the bar's top ${z.bar.t} rises under the host card (bottom ${z.host.b}) — the rail did not yield to the host`);
        if (wide) { // the control: the wide rail keeps the sentence form (the badge painted, the text shown)
          if (!z.text || !b || b.hidden) fail(`${tag}: CONTROL the wide rail lost the sentence form (text ${!!z.text}, badge hidden ${b?.hidden})`);
        }
        if (decision) {
          // 10 DECISION-UP (r8, the fixer's served finding R8-F3): the fine rail's cap reads the prompt's published edge — the rail and its
          // docked bar seat one sp-2 under the prompt, Keep / Put back never hit-test into it (pre-fix a real click on Keep answered the decision)
          log(`S5-X2 ${tag} DECISION-UP ${J({ decUp: z.decUp, pend: z.pend, prompt: z.prompt && [z.prompt.l, z.prompt.r, z.prompt.t, z.prompt.b], railMax: z.railMax, railOy: z.railOy, barVsPrompt: ovl(z.bar, z.prompt), backInPrompt: z.back?.inPrompt, keepInPrompt: z.keep?.inPrompt })}`);
          if (!z.decUp || !z.prompt || z.pend !== 'break_spot') fail(`${tag}: DECISION-UP staging — decision-up ${z.decUp}, prompt ${J(z.prompt)}, pending ${z.pend}`);
          else {
            if (z.rail && z.rail.t < z.prompt.b + 8 - 1) fail(`${tag}: DECISION-UP the rail's top ${z.rail.t} rises under the prompt's bottom ${z.prompt.b} (rail max-height ${z.railMax}, overflow-y ${z.railOy})`);
            if (z.bar && ovl(z.bar, z.prompt) > 0) fail(`${tag}: DECISION-UP the bar ${z.bar.t}..${z.bar.b} sits under the prompt ${z.prompt.t}..${z.prompt.b} (${ovl(z.bar, z.prompt)} px²)`);
            for (const [name, p] of [['Put back', z.back], ['Keep', z.keep]]) if (p && p.inPrompt) fail(`${tag}: DECISION-UP ${name} ${J(p.rect)} hit-tests into the prompt (${p.at}) — a real click would answer the decision`);
            if (!z.railMax || z.railMax === 'none') fail(`${tag}: DECISION-UP the rail has no max-height in effect (${z.railMax})`);
            if (z.railOy !== 'auto') fail(`${tag}: DECISION-UP the rail's overflow-y is ${z.railOy}, not auto`);
          }
        }
        return z;
      };
      // 9 HIDE-AFTER (r8, review r8 P2-1): once Keep / Put back ended the transaction the bar is GONE — display none, no box, the
      // rungs shed, its pills unfocusable, one real Tab from the nearest painted focusable before it never lands inside it,
      // elementFromPoint at the bar's former centre is not the bar; judged again at the next station before anything is staged
      const hideAfter = async (tag, prevRect) => {
        await sleep(300);
        const hb = await c.eval(HIDDEN);
        await key(c, 'Tab', 'Tab', 9);
        const landed = await c.eval(`(() => { const ae = document.activeElement; return { d: ${DESC}(ae), inBar: !!ae?.closest?.('[data-ob="atelier-txbar"]') }; })()`);
        const atPrev = prevRect ? await c.eval(`(() => { const at = document.elementFromPoint(${prevRect.l + prevRect.w / 2}, ${prevRect.t + prevRect.h / 2}); return { d: ${DESC}(at), inBar: !!at?.closest?.('[data-ob="atelier-txbar"]') }; })()`) : null;
        cells += 1; hideCells += 1;
        log(`S5-X2 ${tag} HIDE-AFTER ${J({ hidden: hb.hidden, cls: hb.cls, display: hb.display, rects: hb.rects, rect: hb.rect, foc: hb.foc, prev: hb.prev, prevFocused: hb.prevFocused, tab: landed, atPrev })}`);
        if (hb.none) { fail(`${tag}: HIDE-AFTER no bar`); return; }
        if (!hb.hidden) { fail(`${tag}: HIDE-AFTER the bar is not hidden — the transaction did not end`); return; }
        if (hb.display !== 'none') fail(`${tag}: HIDE-AFTER the hidden bar computes display ${hb.display} [${hb.cls}]`);
        if (hb.rects > 0) fail(`${tag}: HIDE-AFTER the hidden bar still has a box ${J(hb.rect)}`);
        if (/ob-atelier-txbar--(narrow|tight|small)/.test(hb.cls)) fail(`${tag}: HIDE-AFTER the hidden bar still wears a fit rung [${hb.cls}] (fitTxBar returned before shedding it)`);
        for (const f of hb.foc) if (f.focusable) fail(`${tag}: HIDE-AFTER ${f.d} takes focus inside the hidden bar`);
        if (landed.inBar) fail(`${tag}: HIDE-AFTER a real Tab from ${hb.prev} landed inside the hidden bar (${landed.d})`);
        if (atPrev && atPrev.inBar) fail(`${tag}: HIDE-AFTER elementFromPoint at the bar's former centre still resolves to the bar (${atPrev.d})`);
      };
      const putBack = async () => { await c.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`); return waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40); };
      // r8: Keep by a REAL click on the pill (the decision cells put back instead — a commit under a pending decision is the rules' own story)
      const keep = async () => { const kp = await centre('[data-ob="atelier-keep"]'); if (!kp) return false; await click(c, kp.x, kp.y); return waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40); };
      for (const loc of locs) {
        await setLoc(c, loc);
        if (isStale && !(await c.eval(`window.__i18n.locale() === ${J(loc)} && !window.__i18n.keys().includes('atelier.preview.badge')`))) { fail(`${cellTag}/${loc}: precondition — the stale ${loc} dictionary did not take on the locale switch (served ${J(served)})`); continue; }
        const wide = w >= 1440;
        // pose 1: a cloth tint staged from a REAL click on a colour chip
        await goSt('cloth');
        await sleep(300);
        const cp = await centre('[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"])');
        if (!cp) fail(`${cellTag}/${loc}/cloth/tint: no colour chip to click`);
        else {
          await click(c, cp.x, cp.y);
          if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) fail(`${cellTag}/${loc}/cloth/tint: the chip click staged nothing`);
          else {
            const z1 = await judge(`${cellTag}/${loc}/cloth/tint`, wide);
            const ended = decision ? await putBack() : await keep();
            if (!ended) fail(`${cellTag}/${loc}/cloth/tint: ${decision ? 'Put back' : 'a real click on Keep'} did not end the transaction`);
            else await hideAfter(`${cellTag}/${loc}/cloth/${decision ? 'putback' : 'keep'}`, z1?.bar);
          }
        }
        // pose 2: a rail CARD staged from a REAL click — the table card; the decision cells (a CAROM rack) stage a CLOTH card
        // instead: the carom catalogue has one table, and a pool-table pick under a carom game is the rules' own refusal
        // (measured on the fixed tree: the click self-hits the card, nothing stages, no error) — the pose, not the defect
        await goSt('table');
        await hideAfter(`${cellTag}/${loc}/table/arrive`, null); // the next station: the bar stays gone before anything is staged
        const st2 = decision ? 'cloth' : 'table';
        if (decision) await goSt('cloth');
        const tp = await centre('#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
        if (!tp) fail(`${cellTag}/${loc}/${st2}/card: no card to click`);
        else {
          await click(c, tp.x, tp.y);
          if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) fail(`${cellTag}/${loc}/${st2}/card: the card click staged nothing`);
          else {
            const z2 = await judge(`${cellTag}/${loc}/${st2}/card`, wide);
            if (!(await putBack())) fail(`${cellTag}/${loc}/${st2}/card: Put back did not end the transaction`);
            else await hideAfter(`${cellTag}/${loc}/${st2}/putback`, z2?.bar);
          }
        }
      }
      const bad = appErrs(errs);
      if (bad.length) fail(`${cellTag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-X2 cells judged: ${cells} (hide-after ${hideCells})`);
  if (cells === 0) fail('no cell judged');
  if (hideCells === 0) fail('HIDE-AFTER: no cell reached the ended-transaction pose');
}

// ---- S5-R2: the staged cushion row reads below the sticky bar ----------------
const ADV = `document.querySelector('[data-ob="atelier-advanced"]')`;
const STAGED = `(() => { const rr = ${RR}; const desc = ${DESC};
  const bar = document.querySelector('[data-ob="atelier-txbar"]'); const rail = document.getElementById('ob-atelier-rail');
  const row = document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[aria-current="true"]'); const name = row?.querySelector('.ob-eq-prov-row__name');
  const rects = name ? (() => { const g = document.createRange(); g.selectNodeContents(name); return [...g.getClientRects()].filter((l) => l.width > 0).map((l) => ({ t: +l.top.toFixed(1), b: +l.bottom.toFixed(1), l: +l.left.toFixed(1), r: +l.right.toFixed(1) })); })() : [];
  const nb = name ? name.getBoundingClientRect() : null; const at = nb ? document.elementFromPoint(nb.left + Math.min(12, nb.width / 2), nb.top + nb.height / 2) : null;
  // the kit gap in px (the token is authored in rem: a probe box resolves it)
  const sp = (() => { const pr = document.createElement('div'); pr.style.cssText = 'position:fixed;width:var(--ob-sp-2);height:0;visibility:hidden'; document.body.appendChild(pr); const v = parseFloat(getComputedStyle(pr).width); pr.remove(); return Number.isFinite(v) && v > 0 ? v : 8; })();
  return { barUp: !!bar && !bar.hidden, bar: rr(bar), rail: rr(rail), railScroll: rail ? rail.scrollTop : null, row: rr(row), id: row?.dataset.id ?? null, name: rects, nameHit: !!at && !!row && (at === row || row.contains(at)), nameAt: desc(at), sp2: sp, txcontrol: !!rail?.classList.contains('ob-atelier-rail--txcontrol') }; })()`;
export async function runS5R2({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-R2 ${m}`);
  let cells = 0;
  for (const [w, h, loc] of [[844, 390, 'en'], [844, 390, 'ja'], [667, 375, 'en'], [667, 375, 'ja']]) {
    const tag = `${w}x${h}/${loc}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5r2_${w}_${loc}`, { cdpPort: CDP_PORT, width: w, height: h, tool: false });
    const errs = []; attachErrs(c, errs);
    try {
      await setSafeAreaInsets(c, SA);
      if (!(await toEquipment(c, tag, fail))) continue;
      await setLoc(c, loc);
      await c.eval(`__atelier.go('table', { force: true }), true`);
      if (!(await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving()`, 80))) { fail(`${tag}: table station never presented`); continue; }
      if (!(await waitExpr(c, `!!${ADV} && !!${ADV}.closest('#ob-atelier-rail') && ${ADV}.querySelector(':scope > summary').getBoundingClientRect().width > 0`, 60))) { fail(`${tag}: precondition — the Advanced disclosure is not re-homed into the rail`); continue; }
      await c.eval(`${ADV}.open = true, true`);
      if (!(await waitExpr(c, `document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row').length >= 2 && [...document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row')].every((r) => r.getBoundingClientRect().height > 0)`, 60))) { fail(`${tag}: the cushion rows never laid out inside the open disclosure`); continue; }
      await sleep(400);
      for (const pose of ['nearest', 'start']) {
        const ptag = `${tag}/${pose}`;
        const target = await c.eval(`document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row:not([aria-current="true"])')?.dataset.id ?? null`);
        if (!target) { fail(`${ptag}: no non-current pick to stage`); break; }
        const pt = await c.eval(`(() => { const row = document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[data-id="' + ${J(target)} + '"]'); const b = row?.querySelector('button'); if (!b || b.disabled) return null;
          row.scrollIntoView({ block: ${J(pose)} }); const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: !!at && (at === b || b.contains(at)), rowTop: +row.getBoundingClientRect().top.toFixed(1) }; })()`);
        if (!pt) { fail(`${ptag}: the pick ${target} has no enabled button`); continue; }
        await sleep(250);
        const before = await c.eval(STAGED);
        await tap(c, pt.x, pt.y);
        const staged = await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false && document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[data-id="' + ${J(target)} + '"]')?.getAttribute('aria-current') === 'true'`, 40);
        if (!staged) { fail(`${ptag}: a real tap on ${target} at (${Math.round(pt.x)}, ${Math.round(pt.y)}) did not stage it (self-hit ${pt.hit}, row top ${pt.rowTop})`); continue; }
        await sleep(700); // the bar's present + any reveal scroll settle
        const m = await c.eval(STAGED);
        log(`S5-R2 ${ptag}: tapped ${target} (row top before ${pt.rowTop}, rail scrollTop ${before.railScroll} → ${m.railScroll}) bar ${m.bar ? `${m.bar.t}..${m.bar.b}` : '-'} row ${m.row ? `${m.row.t}..${m.row.b}` : '-'} rail ${m.rail ? `${m.rail.t}..${m.rail.b}` : '-'} name rects ${J(m.name)} name hit ${m.nameHit} (${m.nameAt}) txcontrol ${m.txcontrol}`);
        cells += 1;
        if (!m.barUp || !m.bar || !m.row || m.id !== target) { fail(`${ptag}: staging — bar up ${m.barUp}, current row ${m.id}`); continue; }
        // 1 ROW-CLEAR
        if (m.row.t < m.bar.b + m.sp2 - 1) fail(`${ptag}: ROW-CLEAR the staged row ${target} top ${m.row.t} sits under the sticky bar (bar bottom ${m.bar.b} + sp-2 ${m.sp2})`);
        // the row reads WHOLE inside the rail's box when the clear band (bar bottom + sp-2 .. rail bottom) affords its height; a taller row keeps its top clear
        if (m.rail && m.rail.b - (m.bar.b + m.sp2) >= m.row.h - 0.5 && (m.row.t < m.rail.t - 0.5 || m.row.b > m.rail.b + 0.5)) fail(`${ptag}: ROW-CLEAR the staged row ${m.row.t}..${m.row.b} (h ${m.row.h}) leaves the rail's box ${m.rail.t}..${m.rail.b} though the clear band ${(m.rail.b - m.bar.b - m.sp2).toFixed(1)} px affords it`);
        // 2 NAME-VISIBLE
        cells += 1;
        if (!m.name.length) fail(`${ptag}: NAME-VISIBLE the staged row has no painted name`);
        else {
          const under = m.name.filter((r) => r.t < m.bar.b - 0.5);
          if (under.length) fail(`${ptag}: NAME-VISIBLE ${under.length} name line(s) under the bar's bottom ${m.bar.b}: ${J(under)}`);
          if (!m.nameHit) fail(`${ptag}: NAME-VISIBLE elementFromPoint at the name resolves to ${m.nameAt}, not the row`);
        }
        // Put back
        await c.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`);
        if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40))) { fail(`${ptag}: Put back did not clear the bar`); break; }
        await sleep(300);
      }
      const bad = appErrs(errs);
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-R2 cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5R4 FAIL:', msg); process.exitCode = 1; };
  const armArg = process.argv.indexOf('--arm');
  const arms = armArg >= 0 ? String(process.argv[armArg + 1] || '').split(',') : ['M2', 'Q2', 'X2', 'R2'];
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try {
    if (arms.includes('M2')) await runS5M2({ PORT, CDP_PORT, fail });
    if (arms.includes('Q2')) await runS5Q2({ PORT, CDP_PORT, fail });
    if (arms.includes('X2')) await runS5X2({ PORT, CDP_PORT, fail });
    if (arms.includes('R2')) await runS5R2({ PORT, CDP_PORT, fail });
  } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5R4 FAIL' : 'E2E-ATELIER-S5R4 PASS');
}
