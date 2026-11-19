// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5z.mjs — GH-668 S5 review r1 (P2 x2): the docked
// transaction bar is keyboard-isolated, and Enter on the leave confirm's
// focused Put back IS the discard. A LEG MODULE of e2e-atelier.mjs (the
// e2e-atelier-s5w/x/y precedent): the suite calls runS5Z with its band;
// standalone (`node web/tools/e2e-atelier-s5z.mjs` under run-gate) runs the
// same arms in isolation for red/green proofs. Desktop 1280x800 (the
// keyboard register); every key is a TRUSTED CDP key (GH-534 F3 arm law —
// page-synthetic KeyboardEvents never exercise the window-capture gate
// order faithfully).
//
// S5-Z   the bar docked as the rail's first row (GH-668 S5 G1) sits inside
//        shell.js's KEY_GATE_EXEMPT lane (#ob-atelier-rail) but OUTSIDE the
//        cards listbox handler: pre-fix (8d1a9a0b) an arrow on a focused pill
//        reached aim.js (ArrowLeft stepped game.phi, ArrowUp raised #power).
//        A cloth colour chip staged (a scalar, visual-only axis — Keep never
//        re-racks), then on the focused Keep AND the focused Put back:
//        1  KEYS-GATED   ArrowLeft / ArrowUp / ArrowRight / ArrowDown / Home /
//           End → __aim.getPhi() and #power.value unchanged, the bar still
//           presented (no key is a bar gesture);
//        2  TAB-ORDER    Tab from Put back lands on Keep (focus movement
//           untouched);
//        3  ACTIVATION   Space on the focused Put back reverts (bar hidden,
//           the original chip checked); a re-stage then Enter on the focused
//           Keep commits (bar hidden, the staged chip stays checked).
//        Every chip is staged, and the restore committed, by REAL mouse
//        presses, as a user does it: the continuation guard (shell.js, the key
//        half) swallows an Enter / Space on another target within 500 ms of
//        the last one that acted, unless a trusted primary press or a
//        non-modifier key came between, and a scripted el.click() is neither —
//        so a scripted re-stage between the Space and the Enter read as a focus
//        handoff (a user cannot reach Keep after Put back without a press).
// S5-Z2  the leave confirm (ui/dialog.js confirmDialog) settles Enter on the
//        focused button ITSELF (preventDefault — no native click follows), so
//        the atelier's click-only Put-back marker read Enter on the initially
//        focused Put back as a DISMISSAL: the dialog closed, nothing reverted,
//        nothing moved. A chip staged at cloth, `__atelier.go('table')` (no
//        force) raises the confirm with Put back focused; a trusted Enter →
//        4  ENTER-DISCARDS the confirm is gone, the bar hidden, the original
//           chip checked (exact revert) AND station() === 'table' (the move).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5Z; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, Tab: 9, Enter: 13, ' ': 32 };
const CODE = { ' ': 'Space' };
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
/** TRUSTED key via CDP; Enter / Space carry their char so native button
 * activation runs exactly as a real keyboard's would. */
async function key(c, k) {
  const base = { key: k, code: CODE[k] || k, windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k] };
  const text = k === 'Enter' ? '\r' : k === ' ' ? ' ' : undefined;
  await c.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(90);
}
/** TRUSTED mouse press at an element's centre once that point hit-tests to
 * it (re-read up to `tries` times, 150 ms apart — a strip settling after a
 * station switch); { pressed, color } (the element's data-color), or
 * { pressed: false, seen } (the last read: rect and what the point hit). */
async function realPress(c, sel, tries = 20) {
  let p = null;
  for (let i = 0; i < tries; i++) {
    p = await c.eval(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return { ok: false, el: false };
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y);
      return { ok: !!(r.width && r.height && h && (h === el || el.contains(h))), x, y, w: r.width, color: el.dataset.color ?? null,
        hit: h ? (h.dataset?.ob || h.id || h.className?.toString?.() || h.tagName) : null }; })()`);
    if (p.ok) break;
    await sleep(150);
  }
  if (!p?.ok) return { pressed: false, seen: p };
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  return { pressed: true, color: p.color };
}
const BAR = `document.querySelector('[data-ob="atelier-txbar"]')`;
const AIM = `({ phi: window.__aim.getPhi(), power: document.getElementById('power').value })`;
const CHECKED = `(document.querySelector('[data-ob="atelier-cloth-colors"] .ob-cloth-chip[aria-checked="true"]')?.dataset.color ?? null)`;
const ACTIVE = `(() => { const a = document.activeElement; return a ? (a.dataset.ob || a.id || a.tagName) : null; })()`;

export async function runS5Z({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-Z ${m}`);
  let cells = 0;
  if (!(await waitPortFree(CDP_PORT))) { fail(`cdp port ${CDP_PORT} still busy`); return; }
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5z`, { port: CDP_PORT, width: 1280, height: 800, tool: false });
  const errs = [];
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
  try {
    if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail('boot never ready'); return; }
    if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail('no shell'); return; }
    await waitExpr(c, 'window.__shell.isOpen() === true', 100);
    for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
    if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail('rail never live'); return; }
    const goSt = async (st) => {
      await c.eval(`__atelier.go(${J(st)}, { force: true }), true`);
      return waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving() && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 80);
    };
    // a stage counts only when the PRESSED chip is the checked one under a presented bar
    const stageChip = async () => {
      const p = await realPress(c, '[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"])');
      if (!p.pressed) { log(`S5-Z no chip to press (nothing pressed): ${J(p.seen)}`); return false; }
      return waitExpr(c, `${BAR}?.hidden === false && ${CHECKED} === ${J(p.color)}`, 40);
    };
    if (!(await goSt('cloth'))) { fail('cloth station never presented'); return; }
    await sleep(400);
    const original = await c.eval(CHECKED);
    if (!(await stageChip())) { fail('a chip press staged nothing'); return; }
    const staged = await c.eval(CHECKED);
    const docked = await c.eval(`!!${BAR}?.closest('#ob-atelier-rail')`);
    log(`S5-Z staged chip ${original} → ${staged}; bar docked in #ob-atelier-rail: ${docked}`);
    if (!docked) fail('precondition: the bar is not docked in the rail (the arm judges the docked pose)');
    // 1 KEYS-GATED on each pill
    for (const pill of ['atelier-keep', 'atelier-revert']) {
      await c.eval(`document.querySelector('[data-ob="${pill}"]').focus(), true`);
      if ((await c.eval(ACTIVE)) !== pill) { fail(`${pill}: focus() did not land (active ${await c.eval(ACTIVE)})`); continue; }
      const aim0 = await c.eval(AIM);
      for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End']) {
        const before = await c.eval(AIM); // per key: a later key must not undo an earlier step unseen
        await key(c, k);
        const aim1 = await c.eval(AIM);
        if (aim1.phi !== before.phi || aim1.power !== before.power) fail(`KEYS-GATED ${k} on the focused ${pill} stepped aim/power: ${J(before)} → ${J(aim1)}`);
        else if (aim1.phi !== aim0.phi || aim1.power !== aim0.power) fail(`KEYS-GATED ${k} on the focused ${pill}: aim/power drifted from the arm start ${J(aim0)} → ${J(aim1)}`);
        cells += 1;
        if (!(await c.eval(`${BAR}?.hidden === false`))) fail(`KEYS-GATED ${k} on the focused ${pill} dismissed the bar`);
      }
      log(`S5-Z ${pill}: six navigation keys, aim ${J(aim0)} → ${J(await c.eval(AIM))}, active ${await c.eval(ACTIVE)}`);
    }
    // 2 TAB-ORDER
    await c.eval(`document.querySelector('[data-ob="atelier-revert"]').focus(), true`);
    await key(c, 'Tab');
    const afterTab = await c.eval(ACTIVE);
    cells += 1;
    if (afterTab !== 'atelier-keep') fail(`TAB-ORDER Tab from Put back landed on ${afterTab}, not Keep`);
    // 3 ACTIVATION: Space on Put back reverts; Enter on Keep commits
    await c.eval(`document.querySelector('[data-ob="atelier-revert"]').focus(), true`);
    await key(c, ' ');
    const reverted = await waitExpr(c, `${BAR}?.hidden === true && ${CHECKED} === ${J(original)}`, 40);
    cells += 1;
    if (!reverted) fail(`ACTIVATION Space on the focused Put back did not revert (bar hidden ${await c.eval(`${BAR}?.hidden`)}, checked ${await c.eval(CHECKED)}, original ${original})`);
    if (!(await stageChip())) fail('ACTIVATION re-stage failed');
    else {
      const staged2 = await c.eval(CHECKED);
      await c.eval(`document.querySelector('[data-ob="atelier-keep"]').focus(), true`);
      await key(c, 'Enter');
      const kept = await waitExpr(c, `${BAR}?.hidden === true && ${CHECKED} === ${J(staged2)} && !(window.__settings?.preview?.active?.() ?? false)`, 40);
      cells += 1;
      if (!kept) fail(`ACTIVATION Enter on the focused Keep did not commit (bar hidden ${await c.eval(`${BAR}?.hidden`)}, checked ${await c.eval(CHECKED)}, staged ${staged2})`);
      log(`S5-Z activation: Space reverted ${reverted}, Enter kept ${kept} (${staged2})`);
      // restore the original tint for the arm below (a scalar commit), by real presses
      if ((await realPress(c, `[data-ob="atelier-cloth-colors"] .ob-cloth-chip[data-color=${J(original)}]`)).pressed) await waitExpr(c, `${BAR}?.hidden === false`, 20);
      if ((await realPress(c, '[data-ob="atelier-keep"]')).pressed) await waitExpr(c, `${BAR}?.hidden === true`, 40);
    }
    // 4 ENTER-DISCARDS (S5-Z2)
    if (!(await stageChip())) fail('Z2: a chip press staged nothing');
    else {
      await c.eval(`__atelier.go('table'), true`); // NO force: the leave confirm gates
      const up = await waitExpr(c, `(() => { const p = [...document.querySelectorAll('.ob-confirm[data-ob="confirm"]')].pop(); return !!p && p.querySelector('[data-ob="confirm-cancel"]') === document.activeElement; })()`, 40);
      cells += 1;
      if (!up) fail(`Z2: the leave confirm never presented with Put back focused (active ${await c.eval(ACTIVE)}, station ${await c.eval('window.__atelier.station()')})`);
      else {
        await key(c, 'Enter');
        const gone = await waitExpr(c, `document.querySelectorAll('.ob-confirm[data-ob="confirm"]').length === 0`, 40);
        const moved = await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving()`, 80);
        const z = await c.eval(`({ bar: ${BAR}?.hidden, checked: ${CHECKED}, station: window.__atelier.station(), preview: window.__settings?.preview?.active?.() ?? null })`);
        log(`S5-Z2 after Enter on Put back: confirm gone ${gone}, ${J(z)}, original ${original}`);
        if (!gone) fail('Z2 ENTER-DISCARDS the confirm did not close on Enter');
        if (z.bar !== true || z.checked !== original) fail(`Z2 ENTER-DISCARDS Enter on the focused Put back did not revert (bar hidden ${z.bar}, checked ${z.checked}, original ${original})`);
        if (!moved) fail(`Z2 ENTER-DISCARDS the station never switched to table (station ${z.station})`);
      }
    }
    const bad = errs.filter((e) => !/favicon/i.test(String(e)));
    if (bad.length) fail(`app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
  } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  log(`S5-Z cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5Z FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5Z({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5Z FAIL' : 'E2E-ATELIER-S5Z PASS');
}
