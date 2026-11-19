// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-rules.mjs — headless scripted FOUL GAME for the 9-ball rules engine
// (STREAM-B): wrong-first-ball foul → BALL_IN_HAND anywhere + turn switch →
// legal pot keeps the table → 9-ball pot → WIN banner + auto re-rack.
// Stage params validated offline against the kernel (same template/seeds
// the app uses: rack seed 1, shot seed = 1000 + shotIndex).
//
//   node web/tools/e2e-rules.mjs      (needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-316 port hygiene: env-overridable like the sibling discipline suites
// (parallel worktree lanes carry assigned port ranges; the 8139/22390 pair
// stays the default so CI and solo runs are byte-identical).
const PORT = Number(process.env.OB_E2E_PORT ?? 8139);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 22390);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-RULES FAIL:', msg); process.exitCode = 1; };

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [], consoleLogs = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    const line = params.args.map((a) => a.value ?? a.description).join(' ');
    if (params.type === 'error') consoleErrors.push(line);
    else consoleLogs.push(line);
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const sawLog = (s) => consoleLogs.some((l) => l.includes(s));
// the settle poll snapshots state + judgment + banner in ONE page eval:
// a WIN's 2.6 s auto re-rack nulls the judgment surface (fresh rack), the
// GH-350 banner reapers clear foul banners at 1.8 s, and under load a
// separate post-settle read can land after those beats (GH-344; the
// e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner, bannerShown } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 150 && settled.state === 'PLAYBACK'; i++) {
    await sleep(400);
    settled = await chrome.eval(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent,
      bannerShown: document.getElementById('banner').style.display === 'block' })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  if (await chrome.eval('window.__rules?.player()') !== 1) fail('game does not start with player 1');

  // ---- stage 1: wrong ball first (2 dead ahead, lowest is the 1) ------------
  await chrome.eval(`__test.layout([
    { id: 0, x: 0, y: -0.4 }, { id: 2, x: 0, y: 0.2 },
    { id: 1, x: -0.5, y: -1.0 }, { id: 9, x: 0.4, y: 0.9 }])`);
  const e1 = await chrome.eval('__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (e1) fail('stage1 shoot rejected: ' + e1);
  if (await settle('stage1') !== 'BALL_IN_HAND') fail('foul did not lead to BALL_IN_HAND');
  const j1 = await chrome.eval('window.__rules.judgment()');
  if (JSON.stringify(j1?.fouls) !== '["wrong-first-ball"]') fail('stage1 fouls wrong: ' + JSON.stringify(j1?.fouls));
  if (await chrome.eval('window.__rules.player()') !== 2) fail('foul did not pass the turn to player 2');
  if (!sawLog('[flow] foulCalled')) fail('foulCalled hook not printed');
  if (!sawLog('[flow] playerChanged {"player":2}')) fail('playerChanged hook not printed');
  // atomic with the foul edge (see settle()) — the foul banner rides the
  // 1.8 s GH-350 reaper, so separate reads race it under load
  if (settled.bannerShown !== true) fail('foul banner not shown');
  if (!settled.banner.startsWith('FOUL')) fail('foul banner text wrong');

  // ---- issue #71: the foul banner is PASSIVE CHROME --------------------------
  // (a) never-block, state: shooting is NOT gated on the banner timer — the
  // Shoot button is enabled while the foul banner still shows
  if (await chrome.eval('document.getElementById("shoot").disabled')) {
    fail('#71: shooting gated while the foul banner shows (never-block law)');
  }
  // (b) never-block, pointer: the strip is pointer-transparent — a hit-test
  // inside its box lands on the game canvas beneath (pre-#71 this returned
  // the banner div, which swallowed the tap: the owner's "cannot operate")
  const band71 = await chrome.eval(`(() => {
    const b = document.getElementById('banner');
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    window.__e2e71 = { phi0: window.__aim.getPhi() };
    return { cx, cy, hit: hit ? hit.tagName + ':' + (hit.id || '') : null,
      display: b.style.display };
  })()`);
  if (band71.display !== 'block') fail('#71: banner cleared before the tap arm (load-skewed timing)');
  if (band71.hit !== 'CANVAS:') fail('#71: #banner not pointer-transparent, hit-test returned ' + band71.hit);
  // (c) tap-to-dismiss + same-tap normal effect: a REAL mouse press inside
  // the banner band reaches aim.js (coarse aim snaps phi to the pointer)
  // AND fades the banner (~120 ms motion.exit) — the tap is never swallowed
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent',
      { type, x: band71.cx, y: band71.cy, button: 'left', clickCount: 1 });
  }
  let gone71 = false;
  for (let i = 0; i < 10 && !gone71; i++) { // poll past the 120 ms exit fade
    await sleep(100);
    gone71 = (await chrome.eval('document.getElementById("banner").style.display')) === 'none';
  }
  if (!gone71) fail('#71: tap did not dismiss the foul banner');
  if (await chrome.eval('window.__aim.getPhi() === window.__e2e71.phi0')) {
    fail('#71: tap was swallowed — aim azimuth unchanged by the same tap');
  }

  // ---- ball in hand ANYWHERE: overlap rejected, open spot beyond the kitchen
  if (await chrome.eval('__test.placeCue(0.4, 0.9)')) fail('placeCue accepted an overlap with the 9');
  const cuePlace = { x: -0.2763932022500211, y: -0.5527864045000421 }; // 0.5 m behind the 1, on the pocket line
  if (!(await chrome.eval(`__test.placeCue(${cuePlace.x}, ${cuePlace.y})`))) fail('placeCue rejected an open spot outside the kitchen');
  const cuePos = (await chrome.eval('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(cuePos[2] - cuePlace.x) > 1e-6 || Math.abs(cuePos[0] - cuePlace.y) > 1e-6) {
    fail('cue not placed outside the kitchen: ' + cuePos);
  }

  // ---- stage 2: legal pot of the 1 → player 2 KEEPS the table ---------------
  const e2 = await chrome.eval('__test.shoot({ v0: 2.2, phi: -2.0344439357957027, theta: 0, a: 0, b: -0.3 })');
  if (e2) fail('stage2 shoot rejected: ' + e2);
  if (await settle('stage2') !== 'AIM') fail('legal pot did not return to AIM');
  const j2 = await chrome.eval('window.__rules.judgment()');
  if (!j2?.legal || JSON.stringify(j2?.pocketed) !== '[1]') fail('stage2 judgment wrong: ' + JSON.stringify(j2));
  if (await chrome.eval('window.__rules.player()') !== 2) fail('legal pot must not switch players');
  if (!(await chrome.eval('__test.balls()')).find((b) => b.id === 1).pocketed) fail('ball 1 not pocketed');

  // ---- stage 3: 9 is lowest, straight pot → WIN + banner + auto re-rack -----
  await chrome.eval(`__test.layout([
    { id: 0, x: 0, y: 0 },
    { id: 9, x: 0.38903252247502133, y: 0.7780650449500427 }])`);
  const e3 = await chrome.eval('__test.shoot({ v0: 2.5, phi: 1.1071487177940904, theta: 0, a: 0, b: 0 })');
  if (e3) fail('stage3 shoot rejected: ' + e3);
  if (await settle('stage3') !== 'WIN') fail('legal 9 pot did not reach WIN');
  if (!sawLog('[flow] gameWon')) fail('gameWon hook not printed');
  const bannerText = settled.banner; // atomic with the WIN edge (see settle())
  if (!bannerText.includes('PLAYER 2 WINS')) fail('win banner wrong: ' + bannerText);
  // issue #71: a tap dismisses the WIN banner immediately, but the 2600 ms
  // auto re-rack is a GAME-flow timer, not a banner block — it must still
  // fire on today's schedule (the tap-free auto-timeout arms live in
  // e2e.mjs:163 and e2e-8ball S12; this arm pins tap + timer coexistence)
  const winBand = await chrome.eval(`(() => {
    const el = document.getElementById('banner');
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2,
             display: el.style.display };
  })()`);
  // Load-skew guard (review 2026-07): if the 2600 ms auto-clear already ran
  // before our tap, the dismiss assert below would pass vacuously.
  if (winBand.display !== 'block') fail('#71 WIN arm: banner already gone before the tap (load skew)');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent',
      { type, x: winBand.cx, y: winBand.cy, button: 'left', clickCount: 1 });
  }
  let winGone = false;
  for (let i = 0; i < 10 && !winGone; i++) {
    await sleep(100);
    winGone = (await chrome.eval('document.getElementById("banner").style.display')) === 'none';
  }
  if (!winGone) fail('#71: tap did not dismiss the WIN banner');
  await sleep(3200); // auto re-rack fires 2.6 s after the win — UNCHANGED by the tap
  { // GH-370: the fresh rack grants the next breaker the opening BALL_IN_HAND
    let sw = null;
    for (let i = 0; i < 25 && sw !== 'BALL_IN_HAND'; i++) {
      sw = await chrome.eval('__test.state()');
      if (sw !== 'BALL_IN_HAND') await sleep(200);
    }
    if (sw !== 'BALL_IN_HAND') fail('WIN auto re-rack did not grant the opening BALL_IN_HAND');
  }
  if ((await chrome.eval('__test.balls()')).length !== 10) fail('re-rack ball count wrong');

  // ---- GH-716 guard: 9-ball KEEPS winner-breaks (the WPA default) ----------
  // Rack 1 was broken by P1 and won by P2, so rack 2's breaker is P2 (winner
  // AND alternation agree here). Rack 2: the breaker P2 wins again → rack 3's
  // breaker is STILL P2 — alternation (snooker's WPBSA Sec3 R3(b) law,
  // e2e-snooker S8b) would hand it to P1. The layout fold keeps the live
  // seat; the same straight 9 pot ends the rack.
  if (await chrome.eval('window.__rules.player()') !== 2) {
    fail('GH-716: rack-2 breaker must be the rack-1 winner (P2)');
  }
  await chrome.eval(`__test.layout([
    { id: 0, x: 0, y: 0 },
    { id: 9, x: 0.38903252247502133, y: 0.7780650449500427 }])`);
  const e3b = await chrome.eval('__test.shoot({ v0: 2.5, phi: 1.1071487177940904, theta: 0, a: 0, b: 0 })');
  if (e3b) fail('GH-716 rack-2 shoot rejected: ' + e3b);
  if (await settle('rack2') !== 'WIN') fail('GH-716: rack-2 9 pot did not reach WIN');
  if (!settled.banner.includes('PLAYER 2 WINS')) { // the 9-ball judgment surface has no terminal projection
    fail('GH-716: rack-2 winner must be P2, banner: ' + settled.banner);
  }
  await sleep(3200); // auto re-rack
  {
    let sw = null;
    for (let i = 0; i < 25 && sw !== 'BALL_IN_HAND'; i++) {
      sw = await chrome.eval('__test.state()');
      if (sw !== 'BALL_IN_HAND') await sleep(200);
    }
    if (sw !== 'BALL_IN_HAND') fail('GH-716: rack-3 auto re-rack did not grant the opening BALL_IN_HAND');
  }
  if (await chrome.eval('window.__rules.player()') !== 2) {
    fail('GH-716: 9-ball must keep winner-breaks — rack-3 breaker is not the rack-2 winner (P2)');
  }
  console.log('GH-716 OK: 9-ball winner-breaks held over racks 1→2→3 (P2, P2)');

  // ---- GH-990 / GH-1018: the HUD Re-rack confirm + the user re-rack seat --
  // Re-rack throws the rack in play away: a PROGRESSED undecided rack asks
  // first (kit confirm; Cancel keeps everything), and the new rack is broken
  // by the ABANDONED rack's breaker — never whoever happened to be on turn
  // (RED pre-fix: one click re-racked at once and initialState(player)
  // seated the turn holder). Pristine racks and the WIN hold re-rack on one
  // click. Every Re-rack / confirm press is a REAL pointer click at the
  // element's centre, hit-tested first (an occluded button fails the arm).
  {
    const centre = async (sel) => chrome.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: !!hit && (hit === el || el.contains(hit)) };
    })()`);
    const press = async (sel, tag) => {
      const p = await centre(sel);
      if (!p) { fail(`${tag}: ${sel} not visible`); return false; }
      if (!p.hit) { fail(`${tag}: ${sel} is occluded at its centre`); return false; }
      for (const type of ['mousePressed', 'mouseReleased']) {
        await chrome.send('Input.dispatchMouseEvent',
          { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return true;
    };
    const poll = async (expr, tries = 40) => {
      for (let i = 0; i < tries; i++) {
        if (await chrome.eval(expr)) return true;
        await sleep(150);
      }
      return false;
    };
    const CONFIRM = '[data-ob="confirm"]';
    const confirmUp = `!!document.querySelector('${CONFIRM}')`;
    const snap = () => chrome.eval(`({ balls: JSON.stringify(__test.balls()),
      player: window.__rules.player(), state: __test.state(),
      line: document.getElementById('state').textContent })`);
    // a soft stroke away from every ball (back toward the head rail): no
    // contact = a foul, the turn passes and the rack is PROGRESSED,
    // undecided (9-ball has no pending rulebook options)
    const foulAway = async (tag) => {
      const e = await chrome.eval('__test.shoot({ v0: 0.6, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
      if (e) fail(`${tag}: shoot rejected: ${e}`);
      if (await settle(tag) !== 'BALL_IN_HAND') fail(`${tag}: the no-contact stroke did not foul`);
    };
    // R0: a PRISTINE rack re-racks on one click (nothing to lose); the seat
    // stays the rack's breaker (rack 3: P2, the rack-2 winner)
    const r0 = await snap();
    await press('#rerack', 'R0');
    await sleep(700);
    const r0b = await snap();
    if (await chrome.eval(confirmUp)) fail('GH-990 R0: a pristine rack must re-rack without a confirm');
    if (r0b.balls === r0.balls) fail('GH-990 R0: the pristine Re-rack did not deal a new rack');
    if (r0b.player !== 2) fail('GH-990 R0: the pristine re-rack moved the breaker seat: ' + r0b.player);

    // R1-R3 (the discriminating seat leg): P2 broke this rack, P1 is on
    // turn after P2's foul. Turn-holder law → P1, seat-1 law → P1, the
    // abandoned breaker (the WPA 4.11/1.13 stalemate law) → P2.
    await foulAway('GH-1018 R1');
    const r1 = await snap();
    if (r1.player !== 1) fail('GH-1018 R1: P2\'s foul must hand the turn to P1: ' + r1.player);
    await press('#rerack', 'GH-990 R2');
    if (!await poll(confirmUp)) {
      fail('GH-990 R2: Re-rack on a progressed rack must ask first (kit confirm)');
    } else {
      const copy = await chrome.eval(`(() => {
        const d = document.querySelector('${CONFIRM}');
        return { title: d.querySelector('.ob-panel__title')?.textContent,
          body: d.querySelector('.ob-confirm__body')?.textContent,
          want: [window.__i18n.t('hud.rerack'), window.__i18n.t('hud.rerackConfirm')] };
      })()`);
      if (copy.title !== copy.want[0] || copy.body !== copy.want[1]) {
        fail('GH-990 R2: confirm copy wrong: ' + JSON.stringify(copy));
      }
      await press('[data-ob="confirm-cancel"]', 'GH-990 R2 cancel');
      if (!await poll(`!document.querySelector('${CONFIRM}')`)) fail('GH-990 R2: Cancel did not close the confirm');
      await sleep(400);
      const r2 = await snap();
      if (r2.balls !== r1.balls || r2.player !== 1 || r2.state !== 'BALL_IN_HAND') {
        fail('GH-990 R2: Cancel must leave the rack untouched: '
          + JSON.stringify({ player: r2.player, state: r2.state, same: r2.balls === r1.balls }));
      }
    }
    await press('#rerack', 'GH-990 R3');
    if (!await poll(confirmUp)) {
      fail('GH-990 R3: the confirm did not open again');
    } else {
      await press('[data-ob="confirm-accept"]', 'GH-990 R3 accept');
      await poll(`__test.state() === 'BALL_IN_HAND'
        && JSON.stringify(__test.balls()) !== ${JSON.stringify(r1.balls)}`);
      const r3 = await snap();
      if (r3.balls === r1.balls) fail('GH-990 R3: Continue did not re-rack');
      if (r3.player !== 2 || !r3.line.startsWith('BALL IN HAND — P2')) {
        fail('GH-1018 R3: the user re-rack must seat the ABANDONED rack\'s breaker (P2), '
          + 'not the turn holder (P1): ' + JSON.stringify({ player: r3.player, line: r3.line }));
      }
    }

    // R4 (control): the WIN hold keeps its next-rack law — a Re-rack click
    // inside the hold re-racks on one click (the frame is decided) and the
    // WINNER breaks. P2 fouls, P1 pots the 9 from a scripted layout.
    await foulAway('GH-990 R4 setup');
    await chrome.eval(`__test.layout([
      { id: 0, x: 0, y: 0 },
      { id: 9, x: 0.38903252247502133, y: 0.7780650449500427 }])`);
    const e4 = await chrome.eval('__test.shoot({ v0: 2.5, phi: 1.1071487177940904, theta: 0, a: 0, b: 0 })');
    if (e4) fail('GH-990 R4: shoot rejected: ' + e4);
    if (await settle('GH-990 R4') !== 'WIN') {
      fail('GH-990 R4: the 9 pot did not reach WIN');
    } else {
      if (!settled.banner.includes('PLAYER 1 WINS')) fail('GH-990 R4: winner must be P1: ' + settled.banner);
      const w0 = await snap();
      await press('#rerack', 'GH-990 R4');
      await sleep(600);
      if (await chrome.eval(confirmUp)) fail('GH-990 R4: the WIN hold must re-rack without a confirm');
      const w1 = await snap();
      if (w1.balls === w0.balls || w1.state !== 'BALL_IN_HAND') fail('GH-990 R4: the WIN-hold Re-rack did not re-rack');
      if (w1.player !== 1) fail('GH-1018 R4: the WIN-hold re-rack must seat the WINNER (P1): ' + w1.player);
    }
    await sleep(3000); // let the voided WIN continuation timer pass

    // R5 (the issue's leg 1): P1 broke, P2 is on turn after P1's foul → P1
    await foulAway('GH-1018 R5');
    const r5a = await snap();
    if (r5a.player !== 2) fail('GH-1018 R5: P1\'s foul must hand the turn to P2');
    await press('#rerack', 'GH-1018 R5');
    if (!await poll(confirmUp)) {
      fail('GH-1018 R5: the confirm did not open');
    } else {
      await press('[data-ob="confirm-accept"]', 'GH-1018 R5 accept');
      await poll(`__test.state() === 'BALL_IN_HAND'
        && JSON.stringify(__test.balls()) !== ${JSON.stringify(r5a.balls)}`);
      const r5 = await snap();
      if (r5.player !== 1 || !r5.line.startsWith('BALL IN HAND — P1')) {
        fail('GH-1018 R5: Re-rack must seat the abandoned breaker (P1), not P2: '
          + JSON.stringify({ player: r5.player, line: r5.line }));
      }
    }

    // R6 (the issue's equipment leg): a re-racking equipment commit through
    // the shipped confirm is a user re-rack too — P1 broke, P2 on turn → P1
    await foulAway('GH-1018 R6');
    const r6a = await snap();
    const table6 = await chrome.eval(`(async () => {
      const m = await import('./dist/pool-sdk/catalog.js');
      const cur = window.__settings.get().equipment.table_id;
      return m.catalogEntries('table_id').filter((e) => !e.ui_hidden
        && !e.superseded_by && e.id !== cur
        && window.__settings.tableInClass(e.id)).map((e) => e.id);
    })()`);
    if (!table6?.length) {
      fail('GH-1018 R6: no alternative 9-ball table id in the catalog');
    } else {
      await chrome.eval(`window.__e2e1018 = window.__settings.changeEquipment('table_id', ${JSON.stringify(table6[0])}); true`);
      if (!await poll(confirmUp)) {
        fail('GH-1018 R6: the equipment commit did not ask (progressed rack)');
      } else {
        await press('[data-ob="confirm-accept"]', 'GH-1018 R6 accept');
        const ok6 = await chrome.eval('window.__e2e1018');
        if (ok6 !== true) fail('GH-1018 R6: changeEquipment resolved ' + ok6);
        await poll(`__test.state() === 'BALL_IN_HAND'
          && JSON.stringify(__test.balls()) !== ${JSON.stringify(r6a.balls)}`);
        const r6 = await snap();
        if (r6.balls === r6a.balls) fail('GH-1018 R6: the accepted equipment commit did not re-rack');
        if (r6.player !== 1) {
          fail('GH-1018 R6: the equipment re-rack must seat the abandoned breaker (P1), not P2: '
            + r6.player);
        }
      }
    }

    // ---- review r1 P2: gameplay keys behind the Re-rack confirm (desktop) ----
    // aim.js's window keydown steps phi/power and toggles the aim view on
    // arrows/V from ANY plain button — the confirm's Cancel included — so the
    // shot changed behind the modal and Cancel kept it (RED pre-fix). The
    // shared ui/keygate.js predicate makes a dialog-class surface own them:
    // focus on Cancel AND a body target (blur) both leave aim untouched;
    // once the dialog closes, arrows aim again (control).
    const aimSnap = () => chrome.eval(`JSON.stringify({ phi: window.__aim.getPhi(),
      power: document.getElementById('power').value, view: window.__aim.getAimView() })`);
    const VK = { ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], v: [86, 'KeyV'], Escape: [27, 'Escape'] };
    const key = async (k) => {
      const [vk, code] = VK[k];
      await chrome.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(60);
    };
    const gameKeys = async () => { for (const k of ['ArrowLeft', 'ArrowUp', 'v']) await key(k); await sleep(150); };
    await foulAway('P2-K1 setup');
    await press('#rerack', 'P2-K1');
    if (!await poll(confirmUp)) {
      fail('P2-K1: the Re-rack confirm did not open on the progressed rack');
    } else {
      const onCancel = await chrome.eval(`document.activeElement?.dataset?.ob ?? null`);
      if (onCancel !== 'confirm-cancel') fail('P2-K1 staging: focus must rest on Cancel, got ' + onCancel);
      const k0 = await aimSnap();
      await gameKeys();
      const k1 = await aimSnap();
      if (k1 !== k0) fail('P2-K1: arrows/V on the focused Cancel steered the shot behind the confirm: ' + JSON.stringify({ k0, k1 }));
      await chrome.eval('(document.activeElement?.blur?.(), true)');
      const bodyT = await chrome.eval('document.activeElement === document.body');
      await gameKeys();
      const k2 = await aimSnap();
      if (!bodyT || k2 !== k0) fail('P2-K1: arrows/V with a body target steered the shot behind the confirm: ' + JSON.stringify({ bodyT, k0, k2 }));
      await key('Escape');
      if (!await poll(`!document.querySelector('${CONFIRM}')`)) fail('P2-K1: Escape did not decline the confirm');
      await sleep(200);
      const c0 = await aimSnap();
      await key('ArrowLeft');
      await sleep(150);
      if (await aimSnap() === c0) fail('P2-K1 control: arrows must aim again once the confirm closed');
    }
    // the same law for the settings modal opened AT THE TABLE (pre-existing
    // leak, same fix): a focused modal control + arrows/V never steer
    await press('#ob-gear', 'P2-K2');
    if (!await poll(`document.getElementById('ob-gear').getAttribute('aria-expanded') === 'true'
      && document.getElementById('ob-settings').getClientRects().length > 0`)) {
      fail('P2-K2: the settings modal did not open at the table');
    } else {
      await sleep(300);
      const inModal = await chrome.eval(`!!document.activeElement?.closest?.('#ob-settings')`);
      const s0 = await aimSnap();
      await gameKeys();
      const s1 = await aimSnap();
      if (!inModal || s1 !== s0) fail('P2-K2: arrows/V inside the settings modal steered the shot behind it: ' + JSON.stringify({ inModal, s0, s1 }));
      await press('#ob-settings-close', 'P2-K2 close');
      await poll(`document.getElementById('ob-settings').getClientRects().length === 0`);
      await sleep(300);
    }
    if (!process.exitCode) console.log('GH-990/GH-1018 OK: pristine one-click, progressed confirm (cancel/continue), abandoned-breaker seat (P2 and P1 legs, equipment commit), WIN-hold winner');
  }
  // ---- review r1 P3: the legacy-path WIN is decided too --------------------
  // With the rules registry unavailable, adjudicateLegacy enters WIN without
  // setting lastTerminal — the GH-990 guard read the finished rack as
  // progressed and opened a discard confirm while the 2.6 s continuation
  // re-racked behind it (RED pre-fix). The GH-492 hold seam
  // (?obtool=1&obholdrules=…) keeps the registry null for the whole leg.
  {
    const base = `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1&obholdrules=30000`;
    await chrome.send('Page.navigate', { url: base });
    let rdy = false;
    for (let i = 0; i < 200 && !rdy; i++) { await sleep(150); rdy = await chrome.eval('window.__test?.ready === true').catch(() => false); }
    if (!rdy) fail('P3-L: the held-registry boot never became ready');
    else if (!sawLog('GH-492 TEST SEAM: holding the rules registry')) fail('P3-L: the hold seam did not arm (seam liveness)');
    else {
      await chrome.eval(`__test.layout([{ id: 0, x: 0, y: 0 }, { id: 9, x: 0.38903252247502133, y: 0.7780650449500427 }])`);
      const eL = await chrome.eval('__test.shoot({ v0: 2.5, phi: 1.1071487177940904, theta: 0, a: 0, b: 0 })');
      if (eL) fail('P3-L: shoot rejected: ' + eL);
      else if (await settle('P3-L') !== 'WIN') fail('P3-L: the legacy 9 pot did not reach WIN');
      else {
        if (await chrome.eval('window.__rules.ready()') !== false) fail('P3-L staging: the registry must still be held (legacy path)');
        const balls0 = await chrome.eval('JSON.stringify(__test.balls())');
        const p = await chrome.eval(`(() => { const r = document.getElementById('rerack').getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await chrome.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        }
        await sleep(600);
        const asked = await chrome.eval(`!!document.querySelector('[data-ob="confirm"]')`);
        const moved = await chrome.eval(`JSON.stringify(__test.balls()) !== ${JSON.stringify(balls0)}`);
        if (asked || !moved) fail('P3-L: a Re-rack in the legacy WIN hold must re-rack on one click: ' + JSON.stringify({ asked, moved }));
        else console.log('P3-L OK: legacy-path WIN hold re-racks on one click');
      }
    }
  }

  // ---- review r1 P2 mixed-cache arm: a STALE cached ui/keygate.js ------------
  // (the cache-poison contract) — a keygate.js body without the export must
  // leave boot and keyboard aiming exactly as before the leaf existed.
  {
    let staleServed = 0;
    const onPause = (method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      staleServed += 1;
      chrome.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from('export const stale = 1; // pre-keygate stale leaf\n').toString('base64') });
    };
    chrome.onEvent(onPause);
    // #1186's census: the boots above already imported keygate.js, so the
    // navigation below could take the cached copy with no Fetch event and the
    // arm would pass on the real module. The cache is disabled first
    // (Network.enable FIRST, or the agent never applies it), and the arm
    // judges only a boot that was actually served the stale leaf.
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*ui/keygate.js*' }] });
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
    let rdy = false;
    for (let i = 0; i < 200 && !rdy; i++) { await sleep(150); rdy = await chrome.eval('window.__test?.ready === true').catch(() => false); }
    await chrome.send('Fetch.disable');
    if (!rdy) fail('P2-MC: boot with a stale keygate.js never became ready');
    else if (!staleServed) fail('P2-MC: staging — the stale keygate.js was never served (the interception missed it), so the arm cannot judge');
    else {
      await sleep(600);
      const phi0 = await chrome.eval('window.__aim.getPhi()');
      for (const type of ['rawKeyDown', 'keyUp']) {
        await chrome.send('Input.dispatchKeyEvent', { type, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
      }
      await sleep(200);
      const phi1 = await chrome.eval('window.__aim.getPhi()');
      if (phi1 === phi0) fail('P2-MC: keyboard aiming must survive a stale keygate.js (today\'s key path)');
      else console.log('P2-MC OK: stale keygate.js — boot ready, keyboard aim live (degrades to the pre-leaf path)');
    }
  }

  // ---- error gates
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-RULES PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
