// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-hud.mjs — arm P-HUD of the play-place gate (GH-668 S5 slice 3 G6,
// the HUD family's hud.js-resident rows; hud.js is a FROZEN file — the G6
// hunk is a RECORDED DEVIATION: style block + two class strings + the
// decision copy keys, no behaviour).
//
// The law judged here (desktop 1440x900 fine pointer, locale de — the
// longest rulebook copy of the Latin set):
//   * the decision prompt (#hud-decision, an eight_ball dry_break posed by
//     the __rules.setMatchState seam) speaks the slice-2 voice: `.hd-title`
//     == t('decision.q.dry_break') (the QUESTION, not the pre-split title),
//     `.hd-chooser` == "<who decides> · <decision.cite.dry_break>" and wears
//     the kit CAPS role (.ob-caps: computed uppercase + --ob-track-caps);
//   * ruling R6: NO answer wears .ob-btn--primary (equal neutral pills), the
//     FIRST answer is document.activeElement on open, and a REAL Tab
//     (Input.dispatchKeyEvent) lands on the second answer with the kit's
//     --ob-focus ring composed into its box-shadow;
//   * #hud-action (GH-371 spot-nearest, posed by the one-pocket kitchen
//     scratch scene of e2e-onepocket O14) wears `ob-btn ob-btn--row`, its
//     computed border-radius == --ob-r-m, white-space normal, the label
//     paints on <= 2 line boxes (copy law G8) and reads t('rules.spotNearest').
//
// Runs INSIDE e2e-play.mjs (imported; the LAST arm — re-uses the +0 desktop
// CDP slot after its owners closed; PORT_INVENTORY unchanged) and stands
// alone for a fast red proof (RED on the pre-G6 hud.js: pre-split title, a
// --primary first answer, no --row on #hud-action):
//   node web/tools/e2e-play-hud.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 slot)
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
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
async function pressTab(c) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  }
}
async function poll(fn, tries, ms) {
  for (let i = 0; i < tries * SCALE; i++) { const v = await fn(); if (v) return v; await sleep(ms); }
  return null;
}

// page-side reads: tokens RESOLVED through a probe element's computed style
// (oklch / calc resolve only in layout); every read is a computed value on
// the live node
const RESOLVE = `const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const resolve = (prop, token) => { probe.style[prop] = 'var(' + token + ')'; return getComputedStyle(probe)[prop]; };`;
const DECISION = `(() => {
  ${RESOLVE}
  const t = window.__i18n.t;
  const d = document.getElementById('hud-decision');
  if (!d || d.style.display !== 'block') { probe.remove(); return { shown: false }; }
  const title = d.querySelector('.hd-title'), ch = d.querySelector('.hd-chooser');
  const cs = getComputedStyle(ch);
  // --ob-track-caps is an em value: resolve it at the chooser's own font size
  probe.style.fontSize = cs.fontSize;
  const R = { track: resolve('letterSpacing', '--ob-track-caps'), focus: resolve('boxShadow', '--ob-focus'),
    text1: resolve('color', '--ob-text-1') };
  probe.remove();
  const btns = [...d.querySelectorAll('.hd-btns button')];
  const a = document.activeElement;
  return { shown: true, R,
    title: title.textContent, wantQ: t('decision.q.dry_break'), wantOld: t('decision.title.dry_break'),
    chooser: ch.textContent, wantChooser: t('decision.chooser', { player: 1 }) + ' \\u00b7 ' + t('decision.cite.dry_break'),
    caps: ch.classList.contains('ob-caps'), transform: cs.textTransform, track: cs.letterSpacing, ink: cs.color,
    n: btns.length, primary: btns.filter((b) => b.classList.contains('ob-btn--primary')).length,
    neutral: btns.every((b) => b.classList.contains('ob-btn')),
    focusIdx: btns.indexOf(a), focusShadow: a && a.tagName === 'BUTTON' ? getComputedStyle(a).boxShadow : null };
})()`;
const ACTION = `(() => {
  ${RESOLVE}
  const R = { radius: resolve('borderRadius', '--ob-r-m') };
  probe.remove();
  const el = document.getElementById('hud-action');
  if (!el || !el.classList.contains('on')) return { on: false };
  const cs = getComputedStyle(el);
  const range = document.createRange(); range.selectNodeContents(el);
  const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
  const r = el.getBoundingClientRect();
  return { on: true, R, text: el.textContent, want: window.__i18n.t('rules.spotNearest'),
    btn: el.classList.contains('ob-btn'), row: el.classList.contains('ob-btn--row'),
    radius: cs.borderRadius, ws: cs.whiteSpace, align: cs.textAlign, lines: tops.size,
    w: Math.round(r.width), h: Math.round(r.height), display: cs.display };
})()`;

/** the decision voice + the R6 neutral pills + the keyboard register */
async function judgeDecision(c, fail, tag) {
  // an eight_ball dry_break through the scripted match-state seam (the
  // e2e-touch-disciplines D4 pose): renderDecision opens the kit dialog
  const game = await c.eval(`window.__rules?.game?.()`);
  if (game !== 'eight_ball' && await c.eval(`window.__rules?.setGame?.('eight_ball')`) !== true) { fail(`${tag}: eight_ball not selectable (game ${game})`); return; }
  await sleep(300);
  const ok = await c.eval(`window.__rules.setMatchState(${JSON.stringify({ pendingDecision: { kind: 'dry_break', chooser: 1 } })})`);
  if (!ok) { fail(`${tag}: setMatchState(pendingDecision dry_break) rejected`); return; }
  const s = await poll(async () => { const v = await c.eval(DECISION); return v.shown ? v : null; }, 40, 150);
  if (!s) { fail(`${tag}: #hud-decision never showed for the posed dry_break`); return; }
  if (s.title !== s.wantQ) fail(`${tag}: .hd-title must be the QUESTION decision.q.dry_break (${JSON.stringify(s.wantQ)}), got ${JSON.stringify(s.title)}${s.title === s.wantOld ? ' (= the pre-split decision.title)' : ''}`);
  if (s.chooser !== s.wantChooser) fail(`${tag}: .hd-chooser must read "who decides · cite" (${JSON.stringify(s.wantChooser)}), got ${JSON.stringify(s.chooser)}`);
  if (!s.caps || s.transform !== 'uppercase' || s.track !== s.R.track) fail(`${tag}: .hd-chooser must wear the kit caps role .ob-caps (uppercase, letter-spacing ${s.R.track}): ` + JSON.stringify({ caps: s.caps, transform: s.transform, track: s.track }));
  if (s.ink !== s.R.text1) fail(`${tag}: .hd-chooser ink on the glass rung must be --ob-text-1 (${s.R.text1}), got ${s.ink}`);
  if (s.n < 2) fail(`${tag}: dry_break offers ${s.n} answer(s), expected >= 2`);
  if (s.primary !== 0 || !s.neutral) fail(`${tag}: R6 — every answer is a NEUTRAL .ob-btn (no --primary unless the kind names a default): primary ${s.primary} / neutral ${s.neutral}`);
  if (s.focusIdx !== 0) fail(`${tag}: focus-on-open must land on the FIRST answer, activeElement idx ${s.focusIdx}`);
  await pressTab(c);
  await sleep(120);
  const s2 = await c.eval(DECISION);
  if (s2.focusIdx !== 1) fail(`${tag}: a REAL Tab must move focus to the second answer, idx ${s2.focusIdx}`);
  else if (!s2.focusShadow || s2.focusShadow === 'none' || !s2.focusShadow.includes(s2.R.focus)) fail(`${tag}: the Tab target must compose the kit --ob-focus ring in its box-shadow (${s2.R.focus}), got ${s2.focusShadow}`);
  // resolve the decision through the seam so the surface is clean for the next pose
  await c.eval(`window.__rules.setMatchState(${JSON.stringify({ pendingDecision: null })})`);
  await sleep(300);
}

// the proven one-pocket kitchen scratch (e2e-onepocket O14): both object
// balls behind the head string + a scratch => kitchen BALL_IN_HAND, and
// flow.js driveRulesAction surfaces the 1.6 ¶2 spot-nearest affordance
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;
const PLAY = {
  phase: 'play', shooter: 1, breaker: 1, pockets: { 1: 5, 2: 2 },
  tallies: { 1: 0, 2: 0 }, owed: { 1: 0, 2: 0 }, consecutiveFouls: { 1: 0, 2: 0 },
  scored: { 1: [], 2: [] }, pendingSpots: [], pendingDecision: null, foulContext: null, result: null,
};
/** #hud-action = the kit row register (GH-371 pose) */
async function judgeAction(c, fail, tag) {
  if (await c.eval('window.__rules.setGameForTest("one_pocket", "onepocket-v1")', true) !== true) { fail(`${tag}: setGameForTest(one_pocket) failed`); return; }
  await sleep(500);
  const specs = [{ id: 0, x: POT.x, y: POT.y }, { id: 2, x: 0.3, y: -0.8 }, { id: 3, x: -0.3, y: -0.9 }];
  await c.eval(`__test.layout(${JSON.stringify(specs)})`);
  const full = { ...PLAY, onTable: [2, 3] };
  if (!(await c.eval(`window.__rules.setMatchState(${JSON.stringify(full)})`))) { fail(`${tag}: setMatchState(one_pocket scene) rejected`); return; }
  const err = await c.eval(`__test.shoot(${JSON.stringify({ v0: 1.4, phi: PHI, theta: 0, a: 0, b: 0 })})`);
  if (err) { fail(`${tag}: the staged scratch shot was rejected: ${err}`); return; }
  let st = 'PLAYBACK';
  for (let i = 0; i < 220 * SCALE && st === 'PLAYBACK'; i++) { await sleep(350); st = await c.eval('__test.state()'); }
  if (st !== 'BALL_IN_HAND') { fail(`${tag}: the staged scratch must grant kitchen ball-in-hand, state ${st}`); return; }
  const s = await poll(async () => { const v = await c.eval(ACTION); return v.on ? v : null; }, 40, 150);
  if (!s) { fail(`${tag}: the spot-nearest affordance (#hud-action.on) never surfaced`); return; }
  if (!s.btn || !s.row) fail(`${tag}: #hud-action must wear ob-btn ob-btn--row (the kit wrap-legal register), got btn ${s.btn} / row ${s.row}`);
  if (s.radius !== s.R.radius) fail(`${tag}: #hud-action border-radius must be --ob-r-m (${s.R.radius}), got ${s.radius}`);
  if (s.ws !== 'normal' || s.align !== 'start') fail(`${tag}: the row register wraps (white-space normal, text-align start): ${s.ws} / ${s.align}`);
  if (s.lines > 2) fail(`${tag}: the label paints on ${s.lines} line boxes (> 2, copy law G8): ${JSON.stringify(s.text)} in a ${s.w}x${s.h} box`);
  if (s.text !== s.want) fail(`${tag}: the label must read t('rules.spotNearest') (${JSON.stringify(s.want)}), got ${JSON.stringify(s.text)}`);
  if (s.h < 44) fail(`${tag}: the row keeps the 44 floor, got ${s.h}`);
  console.log(`${tag}: #hud-action ${s.w}x${s.h} ${s.lines} line(s), radius ${s.radius}, "${s.text}"`);
}

export async function armPHud({ PORT, CDP_PORT, fail }) {
  const url = `http://127.0.0.1:${PORT}/app.html?obtool=1&seed=1&u=hud`;
  const errs = [];
  const c = await launchChrome(url, { port: CDP_PORT, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('P-HUD desktop: the app never became ready');
  else {
    await c.eval(`window.__i18n.setLocale('de')`);
    await sleep(500);
    await judgeDecision(c, fail, 'P-HUD desktop de');
    await judgeAction(c, fail, 'P-HUD desktop de');
    await c.eval(`window.__i18n.setLocale('en')`);
    const bad = errs.filter((e) => !/favicon|Failed to load resource/.test(e));
    if (bad.length) fail('P-HUD desktop: page errors: ' + bad.slice(0, 3).join(' | '));
  }
  c.close();
}

// ---- standalone (the red-proof runner; the gate imports armPHud above) -----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPHud({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-HUD FAIL (${n})` : 'E2E-PLAY-HUD PASS');
}
