// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5r5.mjs — GH-668 S5 review review r5 (0 P1 / 2 P2,
// browser-reproduced on 1cddb2b5). ONE LEG MODULE of e2e-atelier.mjs (the
// e2e-atelier-s5r4 precedent) with one arm; the suite calls runS5L with its
// band; standalone (`node web/tools/e2e-atelier-s5r5.mjs` under run-gate) runs
// the same cells in isolation for red/green proofs. (The r5 P2-2 stale-
// dictionary leg is S5-X2 RESTATED, in e2e-atelier-s5r4.mjs.)
//
// S5-L  (review r5 P2-1) pre-fix (1cddb2b5) atelier.js leaveConfirm's deferred
//       continuations had no VISIT-EPOCH guard: `import('./ui/dialog.js')`
//       held at the network while the user left Equipment and came back,
//       then staged an unrelated brightness preview — the stale confirm
//       opened over it, and its Put back reverted THAT preview and moved the
//       station. Fix: a visit epoch bumped on every arrival at / leave of the
//       place; a continuation whose epoch moved drops silently. Cells 1280x800
//       fine en:
//       held-import   the FIRST request for ui/dialog.js HELD at the network
//                     from about:blank (hud.js / touchwidgets.js import the
//                     leaf at boot, so the hold must precede the navigation:
//                     Chrome opens a served non-app page, the hold is armed,
//                     then the app URL — the held-leaf idiom), Equipment entered, a cloth tint
//                     staged by a REAL click, `__atelier.go('table')` (no
//                     force → the leave gate imports the held leaf), the shell
//                     moved to the play place and back (`__shell.go`), a
//                     brightness preview staged, the request RELEASED:
//         1  NO-CONFIRM     no kit confirm painted after the release;
//         2  PREVIEW-INTACT the brightness preview is still staged (the
//                           transaction active with the brightness scalar,
//                           the slider at its staged value, the bar up);
//         3  STAYS          place equipment, station lighting, no NEW notice
//                           (the shell-driven leave's own put-back notice
//                           may linger).
//       answer        the leaf resident: the confirm PAINTED, then the shell
//                     leaves under it (`__shell.go('play')` — the test-surface
//                     stand-in for the shell's body-focused Enter exit the r4b
//                     checker recorded; a pointer cannot reach the nav under
//                     the scrim), back to Equipment, brightness staged, a REAL
//                     click on the stale confirm's Put back: rows 2 + 3 (the
//                     confirm closes itself; its answer is void).
//       control       no leave: the held leaf released → the confirm paints;
//                     a REAL click on Put back reverts ONLY its own cloth
//                     preview (transaction inactive, bar hidden) and moves to
//                     the table station.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports the arm; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
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
const STATE = `(() => { const bar = document.querySelector('[data-ob="atelier-txbar"]'); const s = document.querySelector('[data-ob="atelier-brightness"]');
  const panels = [...document.querySelectorAll('.ob-confirm[data-ob="confirm"]')].filter((p) => !p.hidden && p.getClientRects().length > 0);
  const note = document.getElementById('ob-shell-note');
  return { place: window.__shell?.place?.() ?? null, open: window.__shell?.isOpen?.() ?? null, station: window.__atelier?.station?.() ?? null,
    preview: window.__settings?.preview?.active?.() ?? null, barUp: !!bar && !bar.hidden, confirms: panels.length, slider: s ? s.value : null,
    notice: note && !note.hidden && note.getClientRects().length > 0 ? (note.textContent || '').trim().slice(0, 60) : null }; })()`;
export async function runS5L({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-L ${m}`);
  let cells = 0;
  for (const mode of ['held-import', 'answer', 'control']) {
    const tag = `1280x800/en/${mode}`;
    const hold = mode !== 'answer';
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5l_${mode}`;
    // the held-leaf idiom: a SERVED non-app page first (cdp.mjs binds the page target by an http URL, so about:blank
    // is not a boot target), the hold armed BEFORE the app's first request (the leaf is a boot-graph import)
    const c = await launchChrome(hold ? `http://127.0.0.1:${PORT}/app/locales/en.json` : url, { port: CDP_PORT, width: 1280, height: 800, tool: false });
    const errs = []; attachErrs(c, errs);
    const held = []; let releasing = false;
    if (hold) c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (!releasing && /ui\/dialog\.js/.test(params.request.url)) { held.push(params.requestId); return; }
      c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    try {
      if (hold) {
        await c.send('Network.enable');
        await c.send('Network.setCacheDisabled', { cacheDisabled: true });
        await c.send('Fetch.enable', { patterns: [{ urlPattern: '*ui/dialog.js*', requestStage: 'Request' }] });
        await c.send('Page.navigate', { url });
      }
      if (!(await toEquipment(c, tag, fail))) continue;
      const goSt = async (st) => { await c.eval(`__atelier.go(${J(st)}, { force: true }), true`); await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()`, 60); await sleep(400); };
      const centre = (sel) => c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => !x.hidden && x.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      // a cloth tint staged by a REAL click
      await goSt('cloth');
      const cp = await centre('[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"])');
      if (!cp) { fail(`${tag}: precondition — no colour chip to click`); continue; }
      await click(c, cp.x, cp.y);
      if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) { fail(`${tag}: precondition — the chip click staged nothing`); continue; }
      // the leave gate: a station move WITHOUT force imports the dialog leaf
      await c.eval(`__atelier.go('table'), true`);
      await sleep(500);
      const s0 = await c.eval(STATE);
      if (hold) {
        if (!(await waitNode(() => held.length > 0, 40, 100))) { fail(`${tag}: precondition — the ui/dialog.js request never reached the network hold (held ${held.length}; the leaf was resident)`); continue; }
        if (s0.confirms) { fail(`${tag}: precondition — a confirm painted with the leaf held (${J(s0)})`); continue; }
      } else if (!s0.confirms) { fail(`${tag}: precondition — the leave gate painted no confirm with the leaf resident (${J(s0)})`); continue; }
      log(`S5-L ${tag}: leave gate raised — held ${held.length}, ${J(s0)}`);
      if (mode !== 'control') {
        // the visit ends and a new one begins: play and back, then an UNRELATED brightness preview
        await c.eval(`__shell.go('play'), true`);
        if (!(await waitExpr(c, `window.__shell.place() === 'play'`, 40))) { fail(`${tag}: precondition — the shell never left for play`); continue; }
        await sleep(500);
        const s1 = await c.eval(STATE);
        if (s1.preview) fail(`${tag}: precondition — leaving Equipment did not revert the cloth preview (${J(s1)})`);
        await c.eval(`__shell.go('equipment'), true`);
        if (!(await waitExpr(c, `window.__shell.place() === 'equipment' && typeof window.__atelier === 'object'`, 40))) { fail(`${tag}: precondition — the shell never came back to equipment`); continue; }
        await sleep(500);
        await goSt('lighting');
        const staged = await c.eval(`(() => { const s = document.querySelector('[data-ob="atelier-brightness"]'); if (!s) return null; s.value = String(Number(s.value) > 1 ? 0.7 : 1.3); s.dispatchEvent(new Event('input', { bubbles: true })); return s.value; })()`);
        if (!staged || !(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false && !!(window.__settings?.preview?.active?.()?.scalars?.brightness !== undefined)`, 40))) { fail(`${tag}: precondition — the brightness input staged nothing (value ${staged})`); continue; }
        const s2 = await c.eval(STATE);
        log(`S5-L ${tag}: brightness staged on the new visit ${J(s2)}`);
        if (mode === 'held-import') {
          releasing = true;
          for (const id of held.splice(0)) await c.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
          await sleep(1500);
        } else {
          // the answer door: a REAL click on the STALE confirm's Put back
          const pb = await centre('.ob-confirm[data-ob="confirm"] [data-ob="confirm-cancel"]');
          if (!pb) { fail(`${tag}: precondition — the stale confirm's Put back is not painted (${J(s2)})`); continue; }
          await click(c, pb.x, pb.y);
          await sleep(1500);
        }
        const s3 = await c.eval(STATE);
        log(`S5-L ${tag}: after the ${mode === 'held-import' ? 'release' : 'stale answer'} ${J(s3)}`);
        cells += 1;
        if (mode === 'held-import' && s3.confirms) fail(`${tag}: NO-CONFIRM a stale leave confirm painted after the release on a LATER visit (${J(s3)})`);
        if (mode === 'answer' && s3.confirms) fail(`${tag}: NO-CONFIRM the stale confirm is still up after its Put back (${J(s3)})`);
        if (!s3.preview || s3.preview.scalars?.brightness === undefined || !s3.barUp || s3.slider !== staged) fail(`${tag}: PREVIEW-INTACT the unrelated brightness preview was touched by the stale gate (preview ${J(s3.preview)}, bar ${s3.barUp}, slider ${s3.slider} vs staged ${staged})`);
        if (s3.place !== 'equipment' || !s3.open || s3.station !== 'lighting') fail(`${tag}: STAYS the stale gate moved us (place ${s3.place}, open ${s3.open}, station ${s3.station})`);
        // the leave's own notice ("Preview put back" — the shell-driven exit spoke by law) may still be up: only a NEW notice is the stale gate's
        if (s3.notice && s3.notice !== s2.notice) fail(`${tag}: STAYS the stale gate spoke (${J(s3.notice)}; before ${J(s2.notice)})`);
      } else {
        // the positive control: no leave — the released leaf paints the confirm; Put back reverts ONLY its own preview and moves
        releasing = true;
        for (const id of held.splice(0)) await c.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
        if (!(await waitExpr(c, `[...document.querySelectorAll('.ob-confirm[data-ob="confirm"]')].some((p) => !p.hidden && p.getClientRects().length > 0)`, 40))) { fail(`${tag}: CONTROL the confirm never painted after the release`); continue; }
        const pb = await centre('.ob-confirm[data-ob="confirm"] [data-ob="confirm-cancel"]');
        if (!pb) { fail(`${tag}: CONTROL no Put back on the confirm`); continue; }
        await click(c, pb.x, pb.y);
        await sleep(1200);
        const s3 = await c.eval(STATE);
        log(`S5-L ${tag}: after Put back ${J(s3)}`);
        cells += 1;
        if (s3.confirms) fail(`${tag}: CONTROL the confirm is still up after Put back`);
        if (s3.preview || s3.barUp) fail(`${tag}: CONTROL Put back did not revert the cloth preview (${J(s3)})`);
        if (s3.station !== 'table' || s3.place !== 'equipment') fail(`${tag}: CONTROL Put back did not move to the table station (station ${s3.station}, place ${s3.place})`);
      }
      const bad = appErrs(errs);
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-L cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5R5 FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5L({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5R5 FAIL' : 'E2E-ATELIER-S5R5 PASS');
}
