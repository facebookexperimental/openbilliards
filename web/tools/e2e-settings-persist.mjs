// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-settings-persist.mjs — the persistence arms of the settings-modal gate
// (build 20): saved choices survive a cross-game shared-replay Continue
// (issue #1034) and a second tab on the same profile (issue #1019).
//
// REAL-USER boots on this leg's own browser (CDP_PORT + 7), real clicks and
// taps for every user moment; seams only to READ state (`__settings.get()`,
// localStorage, `__test.state()`), plus the atelier station seam
// (`__shell.go('equipment')` / `__atelier.go('cues')`, the e2e-atelier idiom).
//
//   X1 desktop 1440×900, fresh profile. The viewer plays snooker and shares it
//      (toolbar Share replay writes `#r=` into the address bar), then switches
//      back to 9-ball (the saved game). A fresh page load of the snooker link,
//      REPLAY finished, Continue from here, HUD CUE -> Low-deflection shaft:
//      the store keeps 9-ball's own cue (equipmentByGame.nine_ball and the
//      top-level tuple stay `standard`, game stays nine_ball) and the pick is
//      saved for the game on the table (equipmentByGame.snooker.cue_id =
//      low_deflection, the #1034 policy); a reload + To the table shows 9-ball
//      with the Standard maple cue. Then the same through Hall -> Equipment ->
//      Cues -> Carom cue -> Equip (equipmentByGame.snooker.cue_id =
//      carom_conical, 9-ball untouched).
//   X2 phone 844×390@3 (touch), fresh profile: the X1 link opened directly,
//      Continue (tap), Hall -> Equipment -> Cues -> Low-deflection -> Equip
//      (taps; the phone HUD has no cue select) -> the same store laws +
//      reload.
//   T1 desktop, TWO tabs in one browser (one profile). Tab B boots before tab
//      A's first commit. A: cue Low-deflection; B: Settings -> Assists ->
//      Wrong-ball warning Off + another assist level (B's writes keep A's
//      first pick); A: cue Standard maple dime tip. The store keeps ALL of
//      them (assistWrongBall false, B's assist level and its preview mirror
//      key ob.settings.assist, cue standard_dime_tip); a reloaded B reads
//      them and renders the toggle Off. B: Play -> Three-Cushion Carom -> Continue; A: a cue pick:
//      the store keeps game carom_3cushion and its equipmentByGame entry, and
//      a reloaded B boots on carom. ob-shell-v1 (the same class): B: Start at
//      the table next time ON; A: a hall place visit writes lastPlace and
//      keeps B's startAtTable.
//
// CI runs it STANDALONE (the selection law: each full arm is minutes long):
//   e2e-nightly.yml   node web/tools/e2e-settings-persist.mjs   (X1, X2, T1)
//   ci.yml e2e-fastlane   OB_PERSIST_ARMS=T1 … --fastlane   — T1's core,
//      through step 4 (A's cue, B's toggle + assist level, A's next cue).
//   `--fastlane` also cuts X1 to the HUD pick's store judgement (Next shot
//      skips the replay; no reload, no atelier leg) and skips X2; CI does not
//      run that core (two boots, two switches and a shot do not fit 60 s;
//      #1034's per-PR guard is tools/render/ghcn8/test_continue_inherited).
// Also imported by e2e-settings.mjs, where the arms run only when named, and
// the standalone entry is the red-proof runner (OB_E2E_PORT / _CDP_PORT;
// OB_PERSIST_WEBDIR serves another tree — the red-proof scratch archive;
// OB_PERSIST_ARMS=X1,T1 runs a subset).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, tap } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 8 };
// SHARED_DEFAULT_WINDOW — one suite in three files: e2e-settings imports this leg module; standalone it runs on e2e-settings' own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-settings';
// this leg's browser: CDP_PORT + 7 (a literal offset at every launch: the ci-bands lint reads it)
const ONLY = (process.env.OB_PERSIST_ARMS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const wants = (id) => !ONLY.length || ONLY.includes(id);
const FASTLANE = process.argv.slice(2).includes('--fastlane'); // the per-PR cores (header)
// The game-switch overlay (#974: web/app/ui/switchprogress.js) takes every pointer hit while a switch runs and until
// it leaves (MIN_SHOWN 500 ms + the leave): html[data-ob-switching] stands and a [data-ob="switch-progress"] element
// exists. Every real click and tap here waits for both to be gone; a tree without the overlay passes at once. The same
// predicate as e2e-drill-session's (whose arm SG guards the markers); one shared export for it is #1084.
const SWITCH_IDLE = `!document.documentElement.hasAttribute('data-ob-switching') && !document.querySelector('[data-ob="switch-progress"]')`;

async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitFor(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
}
async function gateErrors(c, sink, tag, fail) {
  const appErrs = await c.eval('(() => (window.__test?.errors ?? []).splice(0))()').catch(() => []);
  if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
  sink.length = 0;
}

// ---- real input ---------------------------------------------------------------
async function centerOf(c, sel) {
  return c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || !el.getClientRects().length) return null;
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`).catch(() => null);
}
/** A trusted press at the element's centre: a mouse click, or a touch tap on
 * the phone register. False (and a named failure) when it is not on screen. */
async function press(c, sel, tag, fail, { touch = false } = {}) {
  let p = null;
  // up to 9 s for the target to paint (3 s missed a settings nav after a reload at load1 ~70)
  for (let i = 0; i < 60 && !p; i++) { p = await centerOf(c, sel); if (!p) await sleep(150); }
  if (!p) { fail(`${tag}: no visible ${sel} to press`); return false; }
  await sleep(120); // scrollIntoView settles
  p = (await centerOf(c, sel)) ?? p;
  if (!(await waitFor(c, SWITCH_IDLE, 60, 150))) {
    fail(`${tag}: the game-switch overlay never left (html[data-ob-switching] / [data-ob="switch-progress"])`); return false;
  }
  if (touch) { await tap(c, p.x, p.y); return true; }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
}
/** Navigate this tab and wait for the NEW document (the e2e-replays
 * navigateFresh idiom: Page.navigate resolves before the commit). */
async function navigateFresh(c, url) {
  await c.eval('(window.__obNavOld = true), true').catch(() => {});
  await c.send('Page.navigate', { url });
  return waitFor(c, 'window.__obNavOld !== true', 200, 100);
}

/** A second page target in the SAME browser (one profile): the cdp.mjs client
 * shape (send / eval / onEvent / close) over the target's own websocket. */
async function openTab(cdpPort, url) {
  const t = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?${url}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('second tab: websocket did not open within 30 s')), 30_000);
    ws.onopen = () => { clearTimeout(to); res(); };
    ws.onerror = () => { clearTimeout(to); rej(new Error('second tab: websocket refused')); };
  });
  let next = 1;
  const pending = new Map(), handlers = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    } else if (m.method) for (const h of handlers) h(m.method, m.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = next++;
    const to = setTimeout(() => { pending.delete(id); rej(new Error(`second tab: ${method} timed out`)); }, 60_000);
    pending.set(id, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  return {
    send,
    onEvent: (h) => handlers.push(h),
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error('page eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      }
      return r.result.value;
    },
    async close() {
      try { ws.close(); } catch { /* gone */ }
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${t.id}`).catch(() => {});
    },
  };
}

// ---- app moments ----------------------------------------------------------------
const STORE = `(() => { let s = null; try { s = JSON.parse(localStorage.getItem('ob-settings-v1') || 'null'); } catch {}
  let sh = null; try { sh = JSON.parse(localStorage.getItem('ob-shell-v1') || 'null'); } catch {}
  return { game: s?.game ?? null, cue: s?.equipment?.cue_id ?? null, wrong: s?.assistWrongBall ?? null,
    ebg: Object.fromEntries(Object.entries(s?.equipmentByGame ?? {}).map(([g, e]) => [g, e?.cue_id ?? null])),
    assistMirror: localStorage.getItem('ob.settings.assist'), assist: s?.assist ?? null, shell: sh,
    live: { game: window.__settings?.get?.().game ?? null, cue: window.__settings?.get?.().equipment?.cue_id ?? null,
      wrong: window.__settings?.get?.().assistWrongBall ?? null } };
})()`;
const READY_TO_SHOOT = `['AIM', 'BALL_IN_HAND'].includes(window.__test?.state?.())`;
const CUE_BTN = '#cue-row [data-ob="select-button"]';
/** HUD CUE -> the option whose value passes `want` (a real press on the kit
 * select, then on its option row); returns the picked id or null. */
async function pickCue(c, want, tag, fail, opts) {
  const idx = await c.eval(`(() => { const o = [...document.querySelectorAll('#cue-select option')];
    const i = o.findIndex((x) => (${want})(x.value)); return i < 0 ? null : { i, id: o[i].value }; })()`);
  if (!idx) { fail(`${tag}: the HUD cue select offers no matching option`); return null; }
  if (!(await press(c, CUE_BTN, `${tag} (cue select)`, fail, opts))) return null;
  if (!(await waitFor(c, `!!document.querySelector('#ob-select-list-cue-select-opt-${idx.i}')?.getClientRects().length`, 40))) {
    fail(`${tag}: the cue list never opened`); return null;
  }
  if (!(await press(c, `#ob-select-list-cue-select-opt-${idx.i}`, `${tag} (cue option)`, fail, opts))) return null;
  if (!(await waitFor(c, `window.__settings.get().equipment.cue_id === ${JSON.stringify(idx.id)}`, 60))) {
    fail(`${tag}: the cue pick ${idx.id} never committed`); return null;
  }
  await sleep(300);
  return idx.id;
}
/** Hall Play rail -> the game's card -> Continue (all real presses); the
 * switch lands at the table, ready to shoot. */
async function switchGame(c, id, tag, fail) {
  if (!(await c.eval('window.__shell?.isOpen?.() === true'))) {
    if (!(await press(c, '#ob-shell-open', `${tag} (hall)`, fail))) return false;
    if (!(await waitFor(c, 'window.__shell.isOpen() === true && !window.__shell.moving()', 80))) { fail(`${tag}: the hall never opened`); return false; }
  }
  if (!(await c.eval(`window.__shell.place() === 'play'`))) {
    await press(c, '#ob-shell-rail [data-place="play"]', `${tag} (play place)`, fail);
    await waitFor(c, `window.__shell.place() === 'play' && !window.__shell.moving()`, 60);
  }
  if (!(await press(c, `.ob-cardrail-card[data-game="${id}"]`, `${tag} (${id} card)`, fail))) return false;
  // a progressed rack asks first ("Switching games re-racks the table"); a
  // pristine one switches at once (GH-534 R1)
  const CONFIRM = '.ob-confirm[data-ob="confirm"] .ob-btn--primary';
  if (!(await waitFor(c, `!!document.querySelector('${CONFIRM}') || window.__settings.get().game === ${JSON.stringify(id)}`, 60))) {
    fail(`${tag}: the ${id} card neither asked nor switched`); return false;
  }
  if (await c.eval(`!!document.querySelector('${CONFIRM}')`)) await press(c, CONFIRM, `${tag} (Continue)`, fail);
  if (!(await waitFor(c, `window.__settings.get().game === ${JSON.stringify(id)} && ${READY_TO_SHOOT}`, 200))) {
    fail(`${tag}: the switch to ${id} never landed at the table`); return false;
  }
  return true;
}
async function shootOnce(c, tag, fail) {
  if (!(await waitFor(c, READY_TO_SHOOT, 100))) { fail(`${tag}: never ready to shoot`); return false; }
  if (!(await press(c, '#shoot', `${tag} (Shoot)`, fail))) return false;
  if (!(await waitFor(c, `!(${READY_TO_SHOOT})`, 40, 100))) { fail(`${tag}: the shot never started`); return false; }
  if (!(await waitFor(c, READY_TO_SHOOT, 300, 200))) { fail(`${tag}: the shot never settled`); return false; }
  return true;
}
/** A fresh load of a share link -> REPLAY finished -> Continue from here. */
async function continueFromLink(c, url, tag, fail, opts) {
  if (!(await navigateFresh(c, 'about:blank'))) { fail(`${tag}: about:blank never committed`); return false; }
  await c.send('Page.navigate', { url });
  if (!(await waitReady(c))) { fail(`${tag}: the share-link boot never became ready`); return false; }
  // --fastlane: the bar's Next shot (a real press) fast-forwards the playing
  // replay to its end, so Continue shows without watching the shot again
  if (FASTLANE && await waitFor(c, `window.__test?.state?.() === 'PLAYBACK' && !!document.querySelector('#ob-rp-next')?.getClientRects().length`, 100)) {
    await press(c, '#ob-rp-next', `${tag} (Next shot)`, fail, opts);
  }
  if (!(await waitFor(c, `!!document.querySelector('#ob-rp-continue')?.getClientRects().length`, 400, 200))) {
    fail(`${tag}: the replay never finished (no Continue from here)`); return false;
  }
  if (!(await press(c, '#ob-rp-continue', `${tag} (Continue from here)`, fail, opts))) return false;
  if (!(await waitFor(c, `window.__settings.get().game === 'snooker' && ${READY_TO_SHOOT}`, 200))) {
    fail(`${tag}: Continue never handed the snooker table over`); return false;
  }
  return true;
}
/** Hall -> Equipment -> Cues -> the cue's card -> Equip (real presses; the
 * place and station through the shell / atelier seams, the e2e-atelier
 * idiom). True once the cue committed. */
async function equipFromAtelier(c, id, tag, fail, opts) {
  if (!(await press(c, '#ob-shell-open', `${tag} (hall)`, fail, opts))) return false;
  if (!(await waitFor(c, 'window.__shell.isOpen() === true && !window.__shell.moving()', 80))) { fail(`${tag}: the hall never opened`); return false; }
  await c.eval(`window.__shell.go('equipment'), true`);
  await waitFor(c, `window.__shell.place() === 'equipment' && typeof window.__atelier === 'object' && !window.__shell.moving()`, 80);
  await c.eval(`window.__atelier.go('cues'), true`);
  const card = `#ob-atelier-rail .ob-cardrail-card[data-id="${id}"]`;
  if (!(await waitFor(c, `window.__atelier.station() === 'cues' && !window.__shell.moving() && !!document.querySelector('${card}')`, 80))) {
    fail(`${tag}: the cues station never offered ${id}`); return false;
  }
  await sleep(500); // the rail strip settles (the e2e-atelier railCardSettled law, bounded)
  if (!(await press(c, card, `${tag} (${id} card)`, fail, opts))) return false;
  if (!(await waitFor(c, `window.__atelier.floatState?.()?.id === ${JSON.stringify(id)}`, 60))) { fail(`${tag}: ${id} never staged`); return false; }
  if (!(await press(c, '[data-ob="atelier-equip"]', `${tag} (Equip)`, fail, opts))) return false;
  if (!(await waitFor(c, `window.__settings.get().equipment.cue_id === ${JSON.stringify(id)}`, 60))) { fail(`${tag}: Equip never committed ${id}`); return false; }
  await sleep(300);
  return true;
}
/** Reload (no hash) -> To the table: the HUD cue label must read 9-ball's
 * standard cue (the option text of `standard`). */
async function reloadAndJudge(c, base, tag, fail, opts) {
  if (!(await navigateFresh(c, `${base}/app.html`)) || !(await waitReady(c))) { fail(`${tag}: the reload never became ready`); return; }
  if (await waitFor(c, 'window.__shell?.isOpen?.() === true', 80)) await press(c, '#ob-shell-quickplay', `${tag} (To the table)`, fail, opts);
  await waitFor(c, `window.__shell?.isOpen?.() === false && ${READY_TO_SHOOT}`, 120);
  const r = await c.eval(`(() => ({ game: window.__settings.get().game, cue: window.__settings.get().equipment.cue_id,
    label: document.querySelector('${CUE_BTN} .ob-select__label')?.textContent?.trim() ?? null,
    want: document.querySelector('#cue-select option[value="standard"]')?.textContent?.trim() ?? null }))()`);
  if (r.game !== 'nine_ball' || r.cue !== 'standard' || !r.want || r.label !== r.want) {
    fail(`${tag}: after the reload 9-ball must show its own Standard maple cue — ${JSON.stringify(r)}`);
  } else console.log(`${tag}: after the reload 9-ball shows '${r.label}'`);
}
function judgeCrossGame(st, tag, fail, pick) {
  const bad = [];
  if (st.game !== 'nine_ball') bad.push(`stored game ${st.game} (want nine_ball — Continue never changes the saved game)`);
  if (st.cue !== 'standard') bad.push(`stored top-level cue ${st.cue} (want standard — 9-ball's own tuple)`);
  if (st.ebg.nine_ball !== undefined && st.ebg.nine_ball !== 'standard') bad.push(`equipmentByGame.nine_ball.cue_id ${st.ebg.nine_ball} (want standard)`);
  if (st.ebg.snooker !== pick) bad.push(`equipmentByGame.snooker.cue_id ${st.ebg.snooker} (want ${pick} — the pick is saved for the game on the table)`);
  if (bad.length) fail(`${tag}: ${bad.join('; ')} — ${JSON.stringify(st)}`);
  else console.log(`${tag}: stored game nine_ball / cue standard; equipmentByGame.snooker.cue_id ${pick}`);
}

// ---- X1 / X2: #1034 ----------------------------------------------------------------
let SNOOKER_LINK = null;
async function crossGameDesktop({ PORT, CDP_PORT, fail: gateFail }) {
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const base = `http://127.0.0.1:${PORT}`;
  const errs = [];
  const c = await launchChrome(`${base}/app.html`, { port: CDP_PORT + 7, width: 1440, height: 900, tool: false });
  try {
    watchErrors(c, errs);
    if (!(await waitReady(c)) || !(await waitFor(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 200))) {
      fail('X1: real-user boot never became ready with the hall open'); return;
    }
    // step marks: one line per stage (the per-PR core's wall is read from them)
    const mark = (s) => console.log(`X1 mark ${s}`);
    mark('ready');
    // the viewer's own snooker session, shared from the toolbar
    if (!(await switchGame(c, 'snooker', 'X1 to snooker', fail))) return;
    mark('snooker table');
    if (!(await shootOnce(c, 'X1 snooker shot', fail))) return;
    mark('shot settled');
    if (!(await press(c, '#ob-share', 'X1 (Share replay)', fail))) return;
    if (!(await waitFor(c, `location.hash.startsWith('#r=')`, 60))) { fail('X1: Share replay never wrote the #r= link'); return; }
    SNOOKER_LINK = `${base}/app.html` + await c.eval('location.hash');
    mark('shared');
    // the saved game is 9-ball again (the snooker slot exists, snooker_ash)
    if (!(await switchGame(c, 'nine_ball', 'X1 back to 9-ball', fail))) return;
    mark('9-ball table');
    const pre = await c.eval(STORE);
    if (pre.game !== 'nine_ball' || pre.ebg.snooker == null || pre.ebg.snooker === 'low_deflection') {
      fail(`X1: precondition — saved game nine_ball with its own snooker slot: ${JSON.stringify(pre)}`); return;
    }
    // HUD leg
    if (!(await continueFromLink(c, SNOOKER_LINK, 'X1 HUD', fail))) return;
    mark('continued');
    const mid = await c.eval(STORE);
    if (mid.live.game !== 'snooker' || mid.game !== 'nine_ball') fail(`X1: after Continue the live game is snooker and the saved one 9-ball: ${JSON.stringify(mid)}`);
    if (await pickCue(c, '(v) => v === "low_deflection"', 'X1 HUD', fail)) judgeCrossGame(await c.eval(STORE), 'X1 HUD pick', fail, 'low_deflection');
    if (FASTLANE) {
      await gateErrors(c, errs, 'X1', fail);
      if (!failed) console.log('X1 OK (fastlane): #1034 desktop — a HUD cue pick after a cross-game Continue is saved for snooker and 9-ball keeps its own (the reload and atelier legs run nightly)');
      return;
    }
    await reloadAndJudge(c, base, 'X1 HUD', fail);
    // atelier leg: Hall -> Equipment -> Cues -> Carom cue -> Equip
    if (!(await continueFromLink(c, SNOOKER_LINK, 'X1 atelier', fail))) return;
    if (await equipFromAtelier(c, 'carom_conical', 'X1 atelier', fail)) {
      judgeCrossGame(await c.eval(STORE), 'X1 atelier equip', fail, 'carom_conical');
    }
    await reloadAndJudge(c, base, 'X1 atelier', fail);
    await gateErrors(c, errs, 'X1', fail);
    if (!failed) console.log('X1 OK: #1034 desktop — a cue picked after a cross-game Continue (HUD and atelier) is saved for snooker; 9-ball keeps its Standard maple cue across the reload');
  } finally { c.close(); await sleep(800); }
}
async function crossGamePhone({ PORT, CDP_PORT, fail: gateFail }) {
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const base = `http://127.0.0.1:${PORT}`;
  if (!SNOOKER_LINK) { fail('X2: no snooker link (X1 did not produce one)'); return; }
  const errs = [];
  const c = await launchPhone(`${base}/app.html`, { cdpPort: CDP_PORT + 7, width: 844, height: 390, tool: false });
  const touch = { touch: true };
  try {
    watchErrors(c, errs);
    if (!(await waitReady(c))) { fail('X2: real-user phone boot never became ready'); return; }
    if (!(await continueFromLink(c, SNOOKER_LINK, 'X2', fail, touch))) return;
    // the phone HUD carries no cue select: the pick rides the atelier (taps)
    if (await equipFromAtelier(c, 'low_deflection', 'X2', fail, touch)) judgeCrossGame(await c.eval(STORE), 'X2 equip', fail, 'low_deflection');
    await reloadAndJudge(c, base, 'X2', fail, touch);
    await gateErrors(c, errs, 'X2', fail);
    if (!failed) console.log('X2 OK: #1034 phone — a fresh profile opening the snooker link saves the Continue pick for snooker; 9-ball shows its Standard maple cue after the reload');
  } finally { c.close(); await sleep(800); }
}

// ---- T1: #1019 ---------------------------------------------------------------------
async function twoTabs({ PORT, CDP_PORT, fail: gateFail }) {
  let failed = 0;
  const fail = (m) => { failed += 1; gateFail(m); };
  const base = `http://127.0.0.1:${PORT}`;
  const errsA = [], errsB = [];
  const a = await launchChrome(`${base}/app.html`, { port: CDP_PORT + 7, width: 1440, height: 900, tool: false });
  let b = null;
  try {
    watchErrors(a, errsA);
    if (!(await waitReady(a)) || !(await waitFor(a, 'typeof window.__shell === "object" && window.__shell.isOpen()', 200))) {
      fail('T1: tab A never became ready with the hall open'); return;
    }
    await press(a, '#ob-shell-quickplay', 'T1 A (To the table)', fail);
    if (!(await waitFor(a, `window.__shell.isOpen() === false && ${READY_TO_SHOOT}`, 120))) { fail('T1: tab A never reached the table'); return; }
    b = await openTab(CDP_PORT + 7, `${base}/app.html`);
    watchErrors(b, errsB);
    if (!(await waitReady(b)) || !(await waitFor(b, 'typeof window.__shell === "object" && window.__shell.isOpen()', 200))) {
      fail('T1: tab B never became ready with the hall open'); return;
    }
    // 1-3: A's cue, B's assist toggle, A's next cue
    if (!(await pickCue(a, '(v) => v === "low_deflection"', 'T1 A cue 1', fail))) return;
    if (!(await press(b, '#ob-shell-settings', 'T1 B (Settings)', fail))) return;
    if (!(await waitFor(b, `!!document.querySelector('.ob-set-nav[data-section="assists"]')?.getClientRects().length`, 60))) { fail('T1: B settings never opened'); return; }
    await press(b, '.ob-set-nav[data-section="assists"]', 'T1 B (Assists)', fail);
    if (!(await waitFor(b, `!!document.getElementById('ob-set-assist-warnball')?.closest('label')?.getClientRects().length`, 60))) { fail('T1: B wrong-ball toggle never shown'); return; }
    await press(b, '#ob-settings-body label:has(#ob-set-assist-warnball)', 'T1 B (Wrong-ball warning)', fail);
    if (!(await waitFor(b, 'window.__settings.get().assistWrongBall === false', 60))) { fail('T1: B wrong-ball toggle never committed Off'); return; }
    // ... and the assist level (the preview mirror key ob.settings.assist)
    const lvl = await b.eval(`(() => { const sel = document.getElementById('ob-set-assist'); if (!sel) return null;
      const o = [...sel.options]; const i = o.findIndex((x) => x.value !== sel.value); return i < 0 ? null : { i, v: o[i].value }; })()`);
    if (!lvl) { fail('T1: B has no other assist level to pick'); return; }
    if (!(await press(b, '#ob-set-assist + [data-ob="select-button"]', 'T1 B (assist select)', fail))) return;
    if (!(await waitFor(b, `!!document.querySelector('#ob-select-list-ob-set-assist-opt-${lvl.i}')?.getClientRects().length`, 40))) { fail('T1: B assist list never opened'); return; }
    await press(b, `#ob-select-list-ob-set-assist-opt-${lvl.i}`, 'T1 B (assist option)', fail);
    if (!(await waitFor(b, `window.__settings.get().assist === ${JSON.stringify(lvl.v)}`, 60))) { fail(`T1: B assist level ${lvl.v} never committed`); return; }
    // B's writes must have kept A's first cue pick (B booted before it)
    const s3 = await a.eval(STORE);
    if (s3.cue !== 'low_deflection' || s3.ebg.nine_ball !== 'low_deflection' || s3.wrong !== false) {
      fail(`T1 step 2: B's writes must keep A's Low-deflection pick in the store — ${JSON.stringify(s3)}`);
    }
    const dime = await pickCue(a, '(v) => v === "standard_dime_tip"', 'T1 A cue 2', fail);
    if (!dime) return;
    const s4 = await a.eval(STORE);
    if (s4.wrong !== false || s4.cue !== 'standard_dime_tip' || s4.ebg.nine_ball !== 'standard_dime_tip'
      || s4.assist !== lvl.v || s4.assistMirror !== lvl.v) {
      fail(`T1 step 4: the store must keep B's Wrong-ball Off and assist level ${lvl.v} (mirror key too) AND A's dime-tip cue (one tab's write never reverts the other's) — ${JSON.stringify(s4)}`);
    } else console.log(`T1 step 4: store wrong=${s4.wrong} cue=${s4.cue} assist=${s4.assist}; mirror ${s4.assistMirror}`);
    if (FASTLANE) {
      await gateErrors(a, errsA, 'T1 A', fail);
      await gateErrors(b, errsB, 'T1 B', fail);
      if (!failed) console.log('T1 OK (fastlane): #1019 — two tabs on one profile keep each other\'s first writes (cue, wrong-ball toggle, assist level + mirror; the reloads, game and hall memory run nightly)');
      return;
    }
    // 5: a reloaded B reads both and renders the toggle Off
    await press(b, '#ob-settings-close', 'T1 B (close settings)', fail);
    if (!(await navigateFresh(b, `${base}/app.html`)) || !(await waitReady(b))) { fail('T1: B reload never became ready'); return; }
    const b5 = await b.eval(STORE);
    await waitFor(b, 'typeof window.__shell === "object"', 100);
    await press(b, '#ob-shell-settings', 'T1 B reload (Settings)', fail);
    await waitFor(b, `!!document.querySelector('.ob-set-nav[data-section="assists"]')?.getClientRects().length`, 60);
    await press(b, '.ob-set-nav[data-section="assists"]', 'T1 B reload (Assists)', fail);
    await waitFor(b, `!!document.getElementById('ob-set-assist-warnball')?.closest('label')?.getClientRects().length`, 60);
    const tg = await b.eval(`(() => { const i = document.getElementById('ob-set-assist-warnball'); const l = i?.closest('label');
      return { checked: i?.checked ?? null, word: l?.querySelector('.ob-toggle__state')?.textContent?.trim() ?? null,
        off: window.__i18n?.t?.('settings.off') ?? null }; })()`);
    if (b5.live.wrong !== false || b5.live.cue !== 'standard_dime_tip' || tg.checked !== false || (tg.word !== null && tg.word !== tg.off)) {
      fail(`T1 step 5: a reloaded B must read Wrong-ball Off and the dime-tip cue, toggle rendered Off — ${JSON.stringify({ b5, tg })}`);
    } else console.log(`T1 step 5: reloaded B reads wrong=false cue=${b5.live.cue}; toggle '${tg.word}'`);
    await press(b, '#ob-settings-close', 'T1 B reload (close settings)', fail);
    // 6-8: B switches the saved game to carom, A commits a cue
    if (!(await switchGame(b, 'carom_3cushion', 'T1 B to carom', fail))) return;
    const brk = await pickCue(a, '(v) => /break/.test(v)', 'T1 A cue 3', fail);
    if (!brk) return;
    const s7 = await a.eval(STORE);
    if (s7.game !== 'carom_3cushion' || s7.ebg.carom_3cushion == null || s7.ebg.nine_ball !== brk) {
      fail(`T1 step 7: the store must keep B's carom game + its equipmentByGame entry and take A's 9-ball cue — ${JSON.stringify(s7)}`);
    } else console.log(`T1 step 7: store game=${s7.game}, slots ${Object.keys(s7.ebg).join('/')}, nine_ball cue ${s7.ebg.nine_ball}`);
    if (!(await navigateFresh(b, `${base}/app.html`)) || !(await waitReady(b))) { fail('T1: B second reload never became ready'); return; }
    const b8 = await b.eval(STORE);
    if (b8.live.game !== 'carom_3cushion') fail(`T1 step 8: a reloaded B must boot on carom — ${JSON.stringify(b8)}`);
    else console.log('T1 step 8: reloaded B boots on carom_3cushion');
    // ob-shell-v1: B's Start at the table survives A's place visit
    // the hall must be STILL before the row is pressed: a press during the boot's opening move can land beside
    // the row (T1 failed once at load1 ~67 with no store write after this press)
    await waitFor(b, 'typeof window.__shell === "object" && window.__shell.isOpen() && !window.__shell.moving()', 100);
    if (!(await press(b, '[data-ob="shell-remember"]', 'T1 B (Start at the table next time)', fail))) return;
    if (!(await waitFor(b, `JSON.parse(localStorage.getItem('ob-shell-v1') || '{}').startAtTable === true`, 40))) { fail('T1: B never stored startAtTable'); return; }
    await press(a, '#ob-shell-open', 'T1 A (hall)', fail);
    await waitFor(a, 'window.__shell.isOpen() === true && !window.__shell.moving()', 80);
    await press(a, '#ob-shell-rail [data-place="replays"]', 'T1 A (Replays)', fail);
    const sh = await (async () => {
      for (let i = 0; i < 40; i++) {
        const s = (await a.eval(STORE)).shell;
        if (s?.lastPlace === 'replays') return s;
        await sleep(150);
      }
      return (await a.eval(STORE)).shell;
    })();
    if (sh?.lastPlace !== 'replays' || sh?.startAtTable !== true) {
      fail(`T1 shell: A's place visit must write lastPlace and keep B's startAtTable — ${JSON.stringify(sh)}`);
    } else console.log('T1 shell: A wrote lastPlace replays; B\'s startAtTable stays true');
    await gateErrors(a, errsA, 'T1 A', fail);
    await gateErrors(b, errsB, 'T1 B', fail);
    if (!failed) console.log('T1 OK: #1019 — two tabs on one profile keep each other\'s saved settings, equipment, game and hall memory');
  } finally {
    if (b) await b.close();
    a.close();
    await sleep(800);
  }
}

export async function armPersist(ctx) {
  if (wants('X1') || (wants('X2') && !FASTLANE)) await crossGameDesktop(ctx);
  if (wants('X2') && !FASTLANE) await crossGamePhone(ctx);
  if (wants('T1')) await twoTabs(ctx);
}

// ---- standalone (the red-proof runner; the gate imports armPersist above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_PERSIST_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8201);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16301);
  const fail = (msg) => { console.error('E2E-SETTINGS FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  // the summary carries the OK-line count (the X1 / X2 / T1 OK lines, counted as e2e-settings counts them), so
  // run-gate's ledger banks the real arm count: a run whose OB_PERSIST_ARMS matched nothing reads 0 arms and never
  // vouches for a skip (GH-347's zero-arm guard)
  let okCount = 0;
  const log = console.log;
  console.log = (...a) => { if (/^(X1|X2|T1) OK/.test(String(a[0]))) okCount += 1; log(...a); };
  try { await armPersist({ PORT, CDP_PORT, fail }); } finally { console.log = log; await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SETTINGS-PERSIST FAIL' : `E2E-SETTINGS-PERSIST PASS (${okCount} arms)`);
}
