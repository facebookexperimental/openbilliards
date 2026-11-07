// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-decline-resync.mjs — arm P-DECLINE-RESYNC of the play-place gate
// (#992, the build-20 ruling: spec 034 FR-006 wins over r6b's re-browse).
//
// THE LAW JUDGED — a DECLINED game switch re-selects the COMMITTED card. On
// main (and builds 18 / 19) a real pointer on a non-committed card, then
// Cancel in the "Switch game" confirm, left the declined card painted as the
// selection (the kit paints aria-selected exactly like aria-current), the rail
// scrolled the committed card out, Details read the declined discipline over
// the committed discipline's RULES PRESET, and the picture survived a table
// round trip and a Practice → Play switch. The cure (play.js commitGame):
// focus is RE-HOMED onto the committed card before the confirm opens, so the
// dialog's close-time restore lands there; a declined or refused commit
// re-syncs and reveals the committed card whole.
//
// Per register (1024x768 fine MOUSE; 844x390 coarse TOUCH), real input on the
// card and on Cancel:
//   (a) after the decline: focus on the committed card, aria-selected only on
//       it, Details reads it, it rests WHOLE inside the rail, the game is
//       unchanged and the declined card is unselected;
//   (b) after a table round trip (quickPlay → openShell at play): the same;
//   (c) after Practice → Play: the same.
// RED on 484c56a1 (r6b: focus, aria-selected and Details stay on the declined
// card); planted red on the fix = the re-home removed.
//
// Runs INSIDE e2e-play.mjs (after P-PRESS-COMMIT on the same +0 / +4 slots)
// and stands alone:  node web/tools/e2e-play-decline-resync.mjs
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
const G = `document.querySelector('section[data-place="play"] [data-ob="play-games"]')`;
async function waitExpr(c, expr, tries, stepMs) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(stepMs); }
  return false;
}
// the play place at rest: the leaf rail mounted, the shell landed at play and not moving
const PLAY_READY = `(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
  && typeof window.__play === 'object' && !!document.querySelector('section[data-place="play"] .ob-cardrail-card')
  && window.__shell.isOpen() && !window.__shell.moving() && window.__shell.place() === 'play')()`;
// rect stable across two rAF ticks (the rail's snap / the arrival at rest)
const restingCard = (id) => `new Promise((res) => { const g = ${G}; const k = g?.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(id)}]');
  if (!k) { res(null); return; } const a = k.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => { const b = k.getBoundingClientRect();
    res(Math.abs(a.left - b.left) < 0.5 && b.width > 0 ? { x: Math.round(b.left + Math.min(b.width, 120) / 2), y: Math.round(b.top + b.height / 2) } : null); })); })`;
const READ = (committed, declined) => `(() => { const g = ${G}; const mr = g.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(g).paddingLeft) || 0;
  const card = (id) => g.querySelector('[data-ob="play-game"][data-game="' + id + '"]');
  const whole = (k) => { const r = k?.getBoundingClientRect(); return !!r && r.width > 0 && r.left >= mr.left + pad - 0.5 && r.right <= mr.right - pad + 0.5; };
  return { game: window.__settings.get().game, sel: [...g.querySelectorAll('[data-ob="play-game"][aria-selected="true"]')].map((k) => k.dataset.game),
    cur: g.querySelector('[data-ob="play-game"][aria-current="true"]')?.dataset.game ?? null,
    focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? (document.activeElement?.tagName ?? null),
    body: document.querySelector('section[data-place="play"] [data-ob="play-details-body"]')?.dataset.game ?? null,
    committedWhole: whole(card(${JSON.stringify(committed)})), declinedSel: card(${JSON.stringify(declined)})?.getAttribute('aria-selected') ?? null,
    confirm: !!document.querySelector('[data-ob="confirm"]') }; })()`;
async function press(c, touch, { x, y }) {
  if (touch) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(40);
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }
}
function judge(r, committed, declined, tag, step, fail) {
  const bad = [];
  if (r.game !== committed) bad.push(`the game changed (${r.game})`);
  if (r.cur !== committed) bad.push(`aria-current moved (${r.cur})`);
  if (!(r.sel.length === 1 && r.sel[0] === committed)) bad.push(`aria-selected ${JSON.stringify(r.sel)} — only the committed card ${committed}`);
  if (r.declinedSel === 'true') bad.push(`the declined card ${declined} still reads selected`);
  if (r.body !== committed) bad.push(`Details reads ${r.body}, not the committed card`);
  if (!r.committedWhole) bad.push('the committed card is not whole inside the rail');
  if (step === 'decline' && r.focus !== committed) bad.push(`focus on ${r.focus}, not the committed card`);
  if (r.confirm) bad.push('a confirm is still open');
  if (bad.length) { fail(`${tag} (${step}): ${bad.join('; ')} — ${JSON.stringify(r)}`); return false; }
  return true;
}
async function leg(c, { touch, tag, url, fail }) {
  await c.eval(`(() => { const o = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}'); o.game = 'nine_ball'; o.language = 'en'; localStorage.setItem('ob-settings-v1', JSON.stringify(o)); return true; })()`);
  await c.send('Page.navigate', { url });
  if (!(await waitExpr(c, 'window.__test?.ready === true', (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE, 200))) { fail(`${tag}: boot never ready`); return; }
  await c.eval(`(() => { if (!window.__shell.isOpen()) window.__shell.openShell({}); window.__shell.go('play'); return true; })()`);
  if (!(await waitExpr(c, PLAY_READY, 120 * SCALE, 150))) { fail(`${tag}: the play place never came to rest`); return; }
  const committed = await c.eval(`${G}.querySelector('[data-ob="play-game"][aria-current="true"]')?.dataset.game ?? null`);
  // the declined target: the next playable card after the committed one, brought whole into view by a user-like pan
  const declined = await c.eval(`(() => { const ks = [...${G}.querySelectorAll('[data-ob="play-game"]')]; const i = ks.findIndex((k) => k.getAttribute('aria-current') === 'true');
    const k = ks.slice(i + 1).find((x) => x.getAttribute('aria-disabled') !== 'true' && !x.disabled); if (!k) return null;
    k.scrollIntoView({ inline: 'nearest', block: 'nearest' }); return k.dataset.game; })()`);
  if (!committed || !declined) { fail(`${tag}: staging — committed ${committed}, declined ${declined}`); return; }
  const at = await waitExpr(c, restingCard(declined), 40 * SCALE, 100) ? await c.eval(restingCard(declined)) : null;
  if (!at) { fail(`${tag}: staging — the ${declined} card never came to rest`); return; }
  await press(c, touch, at);
  if (!(await waitExpr(c, `!!document.querySelector('[data-ob="confirm"] [data-ob="confirm-cancel"]')`, 60 * SCALE, 100))) { fail(`${tag}: no switch confirm for ${declined}`); return; }
  await sleep(400); // the confirm's entrance
  const cb = await c.eval(`(() => { const b = document.querySelector('[data-ob="confirm"] [data-ob="confirm-cancel"]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await press(c, touch, cb);
  await waitExpr(c, `!document.querySelector('[data-ob="confirm"]')`, 60 * SCALE, 100);
  await waitExpr(c, restingCard(committed), 40 * SCALE, 100); // the restore + reveal at rest
  const ok1 = judge(await c.eval(READ(committed, declined)), committed, declined, tag, 'decline', fail);
  // (b) a table round trip
  await c.eval(`window.__shell.quickPlay(), true`);
  await waitExpr(c, `window.__shell.isOpen() === false`, 60 * SCALE, 150);
  await c.eval(`(() => { window.__shell.openShell({}); window.__shell.go('play'); return true; })()`);
  await waitExpr(c, PLAY_READY, 120 * SCALE, 150);
  await waitExpr(c, restingCard(committed), 40 * SCALE, 100);
  const ok2 = judge(await c.eval(READ(committed, declined)), committed, declined, tag, 'table round trip', fail);
  // (c) Practice → Play
  await c.eval(`window.__shell.go('practice'), true`);
  await waitExpr(c, `!window.__shell.moving() && window.__shell.place() === 'practice'`, 60 * SCALE, 150);
  await c.eval(`window.__shell.go('play'), true`);
  await waitExpr(c, PLAY_READY, 120 * SCALE, 150);
  await waitExpr(c, restingCard(committed), 40 * SCALE, 100);
  const ok3 = judge(await c.eval(READ(committed, declined)), committed, declined, tag, 'practice → play', fail);
  if (ok1 && ok2 && ok3) console.log(`${tag} OK: declined ${declined} → ${committed} re-selected (focus, aria-selected, Details, whole), kept after a table round trip and Practice → Play`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
export async function armPDeclineResync({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&${q}`;
  {
    const errs = [];
    const c = await launchChrome(url('u=pdecline0'), { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    try {
      await leg(c, { touch: false, tag: 'P-DECLINE-RESYNC 1024 mouse', url: url('u=pdecline-mouse'), fail });
      await gate(c, errs, 'P-DECLINE-RESYNC 1024 mouse', fail);
    } finally { c.close(); await sleep(600); }
  }
  {
    const errs = [];
    const c = await launchPhone(url('u=pdeclinephone0'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    try {
      await leg(c, { touch: true, tag: 'P-DECLINE-RESYNC 844 touch', url: url('u=pdecline-touch'), fail });
      await gate(c, errs, 'P-DECLINE-RESYNC 844 touch', fail);
    } finally { c.close(); await sleep(600); }
  }
}

// ---- standalone (the red-proof runner; the gate imports armPDeclineResync above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPDeclineResync({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-DECLINE-RESYNC FAIL (${n})` : 'E2E-PLAY-DECLINE-RESYNC PASS');
}
