// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5z3.mjs — GH-668 S5 review r2 (P2-2): the coarse
// register's re-homed station controls are keyboard-isolated. A LEG MODULE of
// e2e-atelier.mjs (the e2e-atelier-s5w/x/y/z precedent): the suite calls
// runS5Z3 with its band; standalone (`node web/tools/e2e-atelier-s5z3.mjs`
// under run-gate) runs the same arms in isolation for red/green proofs. Every
// key is a TRUSTED CDP key (GH-534 F3 arm law).
//
// S5-Z3  on the COARSE register (a phone / tablet with an EXTERNAL keyboard —
//        844x390 via launchPhone) the table Advanced disclosure and the
//        lighting brightness row ride the showroom rail's secondary row
//        (atelier.js homeSecondary, G2): inside shell.js's KEY_GATE_EXEMPT
//        lane (#ob-atelier-rail) but OUTSIDE the cards listbox handler, so
//        pre-fix (b326cda4) an arrow on the focused Advanced summary or a
//        cushion pick reached aim.js (ArrowLeft stepped game.phi, ArrowUp
//        raised #power — review r2 P2-2, source-backed); the base register
//        (rows in the host column, shell-gated) blocked them.
//        1  SUMMARY-GATED   focus the re-homed Advanced summary; ArrowLeft /
//           ArrowUp / ArrowRight / ArrowDown / Home / End → __aim.getPhi()
//           and #power.value unchanged;
//        2  SUMMARY-OPENS   Enter on the focused summary still toggles the
//           disclosure (native activation survives the isolation);
//        3  CUSHION-GATED   focus a non-current cushion pick inside the open
//           disclosure; the six keys → phi / power unchanged;
//        4  CUSHION-PICKS   Enter on that pick stages the cushion (the
//           transaction bar presents) — then Put back;
//        5  RANGE-NATIVE    at lighting the brightness range rides the row:
//           seated at 0.8 (off the WPA detent's ±0.024 snap window — a
//           pre-existing keyboard limit of the detent, P3), focused, ArrowUp
//           RAISES its value and ArrowDown lowers it back (the native step is
//           kept) while phi / power stay unchanged;
//        6  FINE-CONTROL    1280x800 fine (the host-column register, shell-
//           gated): the same range keeps its native steps with phi / power
//           unchanged — the fix changes nothing there.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5Z3; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, Tab: 9, Enter: 13, ' ': 32 };
const CODE = { ' ': 'Space' };
const NAV = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'];
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
/** TRUSTED key via CDP; Enter / Space carry their char so native activation
 * runs exactly as a real keyboard's would. */
async function key(c, k) {
  const base = { key: k, code: CODE[k] || k, windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k] };
  const text = k === 'Enter' ? '\r' : k === ' ' ? ' ' : undefined;
  await c.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(90);
}
const BAR = `document.querySelector('[data-ob="atelier-txbar"]')`;
const AIM = `({ phi: window.__aim.getPhi(), power: document.getElementById('power').value })`;
const ACTIVE = `(() => { const a = document.activeElement; return a ? (a.dataset.ob || a.id || a.tagName) : null; })()`;
const ADV = `document.querySelector('[data-ob="atelier-advanced"]')`;
const SUMMARY = `${ADV}?.querySelector(':scope > summary')`;
const PICK = `(() => { const rows = [...document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row')]; const r = rows.find((x) => x.getAttribute('aria-current') !== 'true' && !x.querySelector('button')?.disabled); return r ? r.querySelector('button') : null; })()`;
const RANGE = `document.querySelector('[data-ob="atelier-brightness"]')`;

async function gated(c, focusExpr, label, fail, log) {
  await c.eval(`${focusExpr}?.focus(), true`);
  const active = await c.eval(`(() => { const a = document.activeElement; return a === ${focusExpr}; })()`);
  if (!active) { fail(`${label}: focus() did not land (active ${await c.eval(ACTIVE)})`); return 0; }
  const aim0 = await c.eval(AIM);
  let n = 0;
  for (const k of NAV) {
    const before = await c.eval(AIM);
    await key(c, k);
    const after = await c.eval(AIM);
    n += 1;
    if (after.phi !== before.phi || after.power !== before.power) fail(`${label} ${k} stepped aim/power: ${J(before)} → ${J(after)}`);
  }
  log(`S5-Z3 ${label}: six navigation keys, aim ${J(aim0)} → ${J(await c.eval(AIM))}, active ${await c.eval(ACTIVE)}`);
  return n;
}

async function rangeNative(c, label, fail, log) {
  await c.eval(`${RANGE}?.focus(), true`);
  if (!(await c.eval(`document.activeElement === ${RANGE}`))) { fail(`${label}: the brightness range did not take focus (active ${await c.eval(ACTIVE)})`); return 0; }
  // the shipped default rests ON the WPA detent (1.0) whose ±0.024 snap window
  // (the settings.js recipe, atelier.js slider 'input') re-seats every 0.01
  // arrow step — a pre-existing keyboard limit of the detent, not this law's
  // subject (disclosed P3). The arm judges the NATIVE step from a value
  // outside the window: seat 0.8 through the control's own input path first.
  await c.eval(`(() => { const s = ${RANGE}; s.value = '0.8'; s.dispatchEvent(new Event('input', { bubbles: true })); return s.value; })()`);
  await sleep(200);
  const v0 = Number(await c.eval(`${RANGE}.value`));
  const aim0 = await c.eval(AIM);
  await key(c, 'ArrowUp');
  const v1 = Number(await c.eval(`${RANGE}.value`));
  const aim1 = await c.eval(AIM);
  if (!(v1 > v0)) fail(`${label} RANGE-NATIVE ArrowUp did not raise the brightness value (${v0} → ${v1}) — the native step was lost`);
  if (aim1.phi !== aim0.phi || aim1.power !== aim0.power) fail(`${label} RANGE-NATIVE ArrowUp on the focused range stepped aim/power: ${J(aim0)} → ${J(aim1)}`);
  await key(c, 'ArrowDown');
  const v2 = Number(await c.eval(`${RANGE}.value`));
  const aim2 = await c.eval(AIM);
  if (!(v2 < v1)) fail(`${label} RANGE-NATIVE ArrowDown did not lower the brightness value (${v1} → ${v2}) — the native step was lost`);
  if (aim2.phi !== aim0.phi || aim2.power !== aim0.power) fail(`${label} RANGE-NATIVE ArrowDown on the focused range stepped aim/power: ${J(aim0)} → ${J(aim2)}`);
  log(`S5-Z3 ${label}: brightness ${v0} → ${v1} → ${v2}, aim ${J(aim0)} → ${J(aim2)}`);
  // the seat + steps staged a brightness preview — put it back
  if (await c.eval(`${BAR}?.hidden === false`)) { await c.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`); await waitExpr(c, `${BAR}?.hidden === true`, 40); }
  return 2;
}

export async function runS5Z3({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-Z3 ${m}`);
  let cells = 0;
  // the literal tuple list bounds the cells (cdp 1: both kinds on +0, sequential)
  for (const [kind, w, h] of [['phone', 844, 390], ['desktop', 1280, 800]]) {
    const tag = `${kind} ${w}x${h}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5z3_${kind}`;
    const c = kind === 'phone'
      ? await launchPhone(url, { cdpPort: CDP_PORT, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
      else if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    });
    try {
      if (kind === 'phone') await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${tag}: rail never live`); continue; }
      const goSt = async (st) => {
        await c.eval(`__atelier.go(${J(st)}, { force: true }), true`);
        return waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()`, 80);
      };
      if (kind === 'phone') {
        if (!(await goSt('table'))) { fail(`${tag}: table station never presented`); continue; }
        // precondition: the disclosure rides the rail's secondary row (G2)
        const home = await waitExpr(c, `!!${ADV}?.closest('#ob-atelier-rail') && ${SUMMARY}.getBoundingClientRect().width > 0`, 60);
        if (!home) { fail(`${tag}: precondition — the Advanced disclosure is not re-homed into the rail (in rail ${await c.eval(`!!${ADV}?.closest('#ob-atelier-rail')`)})`); continue; }
        await sleep(300);
        // 1 SUMMARY-GATED
        cells += await gated(c, SUMMARY, 'SUMMARY-GATED', fail, log);
        // 2 SUMMARY-OPENS
        const wasOpen = await c.eval(`${ADV}.open`);
        await c.eval(`${SUMMARY}.focus(), true`);
        await key(c, 'Enter');
        const nowOpen = await c.eval(`${ADV}.open`);
        cells += 1;
        if (nowOpen === wasOpen) fail(`${tag}: SUMMARY-OPENS Enter on the focused summary did not toggle the disclosure (open ${wasOpen} → ${nowOpen})`);
        if (!nowOpen) { await c.eval(`${ADV}.open = true, true`); await sleep(150); }
        // 3 CUSHION-GATED
        if (!(await waitExpr(c, `!!${PICK} && ${PICK}.getBoundingClientRect().height > 0`, 40))) fail(`${tag}: CUSHION-GATED no focusable non-current cushion pick inside the open disclosure`);
        else {
          cells += await gated(c, PICK, 'CUSHION-GATED', fail, log);
          // 4 CUSHION-PICKS
          const pickId = await c.eval(`${PICK}?.closest('[data-id]')?.dataset.id ?? null`);
          await c.eval(`${PICK}.focus(), true`);
          await key(c, 'Enter');
          const staged = await waitExpr(c, `${BAR}?.hidden === false`, 40);
          cells += 1;
          if (!staged) fail(`${tag}: CUSHION-PICKS Enter on the focused cushion pick ${pickId} staged nothing (bar hidden ${await c.eval(`${BAR}?.hidden`)})`);
          else {
            log(`S5-Z3 ${tag}: Enter on cushion ${pickId} staged (bar presented)`);
            await c.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`);
            await waitExpr(c, `${BAR}?.hidden === true`, 40);
          }
        }
        // 5 RANGE-NATIVE (the row rides the rail at lighting)
        if (!(await goSt('lighting'))) fail(`${tag}: lighting station never presented`);
        else if (!(await waitExpr(c, `!!${RANGE}?.closest('#ob-atelier-rail') && ${RANGE}.getBoundingClientRect().width > 0`, 60))) fail(`${tag}: precondition — the brightness range is not re-homed into the rail`);
        else { await sleep(300); cells += await rangeNative(c, `${tag} rail`, fail, log); }
      } else {
        // 6 FINE-CONTROL: the host-column range (shell-gated) keeps its native step
        if (!(await goSt('lighting'))) { fail(`${tag}: lighting station never presented`); continue; }
        if (!(await waitExpr(c, `!!${RANGE} && !${RANGE}.closest('#ob-atelier-rail') && ${RANGE}.getBoundingClientRect().width > 0`, 60))) { fail(`${tag}: FINE-CONTROL the brightness range is not in the host column`); continue; }
        await sleep(300);
        cells += await rangeNative(c, `${tag} host`, fail, log);
      }
      const bad = errs.filter((e) => !/favicon/i.test(String(e)));
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-Z3 cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5Z3 FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5Z3({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5Z3 FAIL' : 'E2E-ATELIER-S5Z3 PASS');
}
