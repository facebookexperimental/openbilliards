// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-gw.mjs — arm GW of the ui-shell gate (#1202 batch 2; maintainer records dbed84ae and cb904a26): a hall-keys
// light-set change that main's __obStage still holds when cinelight's studio window opens never lands inside the
// window, and after the window the keys stand as the same change leaves them with no export.
//
// One desktop boot (1440x900, a real-user FRESH boot on a fresh profile). Once the hall has landed, the arm swaps
// window.__obStage for a seam it holds: shell.js reads the seam at each change, and the held seam runs main's shape
// for the keys (the compile pass, apply then revert, in a microtask, or when the arm runs it; the real apply when the
// arm lands it). Changes
// that are not the keys' land at once, as main's do when it stages nothing. The studio window is the real one:
// installCineLight() from app/cinelight.js on main's scene, renderer and camera (window.__dbg), reverted by its handle.
// Rows, each judged on visualState() (the keys in the scene, camera layer 1) and on what the held seam receives:
//   GW1 an exit's leave, held when the window opens, landed inside it;
//   GW2 an open's join, held when the window opens, landed inside it (the hall stays open through the window, the
//       shape of an export resumed under an open hall);
//   GW3 an exit's leave across two windows back to back: landed inside the first, handed over again between them,
//       landed inside the second;
//   GW4 an open's join and then the exit's leave, both held, both landed inside the window: only the newest is handed
//       over again;
//   GW5 the control: a join and a leave, held and landed with no window: each lands at once, nothing is handed over
//       again;
//   GW6 an open's join whose compile pass runs inside the window and whose real apply comes after it closed (main
//       runs a queued change's compile pass only when the change ahead of it has landed): the original submission,
//       parked at its compile pass, must stay inert at that apply; only the change handed over again lands, after its
//       own compile pass;
//   GW7 an exit's leave parked in a window whose revert is followed, in the same task, by a second installCineLight()
//       (the close's microtask then runs inside the second window): nothing is handed over inside the second window;
//       the change is handed over once, after it.
// Judged per row on the keys' place in the main camera's light set (the group in the scene AND camera layer 1 on: each
// spot is on layer 1 only, so it lights a frame and keys its programs only then): inside the window it stays as it was
// when the window opened; after the revert the held seam receives the change again, once; once that lands the keys
// stand as with no export. Main's own compile toggle (compileHallOther, restored in its task) can leave an open hall's
// group in the scene with layer 1 off (leaveKeys keeps an open hall's keys); that moves no light set, so it is logged,
// not judged. In every row the held seam also checks the whole P-A class: a landing that moves the keys' light set may
// only move it to the set its own compile pass compiled (a submission whose compile pass moved nothing, because it parked
// there, must move nothing when it lands); any breach fails the arm at its end.
// Red proof: on acaac82c (shell.js without the studio-window rule) GW1 to GW4, GW6 and GW7 fail; GW5 passes. On 3c9fd201
// (the rule's first version) GW6 fails: the parked original applied after the window without a compile pass of its
// own. GW7 guards the close's microtask, which re-reads the window when it runs; a shell.js whose microtask skips that
// read fails GW7 (the change is handed over inside the second window).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 12 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

async function waitFor(c, expr, tries = 100, ms = 150) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push((params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
    }
  });
}
// open and still (the place is not judged here)
const STILL = 'window.__shell?.isOpen?.() === true && window.__shell.moving() === false';
// the held seam; the studio window's open and close
const HOLD = `(() => {
  if (window.__gw) return true;
  const real = window.__obStage;
  if (typeof real?.lightSet !== 'function') return false;
  const held = []; const seen = []; const breaches = [];
  // the keys in the main camera's light set (joined, camera layer 1 on)
  const lit = () => { const v = window.__shell.visualState(); return v.keys > 0 && v.camLayer1 === true; };
  // the compile pass: apply, then revert, in one task; it records the light set it compiled
  const pass = (h) => {
    h.inWindow = window.__cinelight === true;
    h.change.apply(); h.compiledLit = lit(); h.change.revert(); h.compiled = true;
  };
  window.__obStage = { version: 1, lightSet(change) {
    const why = String(change?.why ?? '');
    seen.push(why);
    if (!why.startsWith('shell:hall-keys')) {
      try { change?.apply?.(); } catch { /* the owner's own */ }
      return Promise.resolve('immediate');
    }
    return new Promise((resolve) => {
      const h = { change, resolve, why, compiled: false, inWindow: null };
      held.push(h);
      if (!window.__gw.holdCompile) queueMicrotask(() => pass(h));
    });
  } };
  window.__gw = {
    held, seen, breaches, cine: null, holdCompile: false,
    compile() { const h = held.find((x) => !x.compiled); if (!h) return null; pass(h); return h.why + (h.inWindow ? ' inside the window' : ''); },
    land() {
      const h = held.shift(); if (!h) return null;
      if (!h.compiled) pass(h);
      const before = lit(); h.change.apply(); const after = lit();
      // the whole P-A class: a landing moves the light set only to the one its own compile pass compiled
      if (after !== before && after !== h.compiledLit) breaches.push({ why: h.why, before, after, compiledLit: h.compiledLit, inWindow: h.inWindow });
      h.resolve('staged'); return h.why;
    },
    async open() {
      const m = window.__gw.mod = await import('/app/cinelight.js');
      const d = window.__dbg;
      window.__gw.cine = m.installCineLight({ scene: d.scene, renderer: d.renderer, camera: d.camera });
      return window.__cinelight === true;
    },
    // the open window's revert, then a second installCineLight() in the same task (before the close's microtask runs)
    reopen() {
      const k = window.__gw.cine; const m = window.__gw.mod; const d = window.__dbg;
      if (!k || !m) return false;
      k.revert();
      window.__gw.cine = m.installCineLight({ scene: d.scene, renderer: d.renderer, camera: d.camera });
      return window.__cinelight === true;
    },
    close() { const k = window.__gw.cine; window.__gw.cine = null; if (k) k.revert(); return window.__cinelight !== true; },
    restore() { window.__obStage = real; },
  };
  return true;
})()`;
const READ = `(() => {
  const v = window.__shell.visualState();
  return { keys: v.keys, layer1: v.camLayer1, pending: v.keysPending, parked: v.keysParked ?? null,
    open: window.__shell.isOpen(), held: window.__gw.held.length, studio: window.__cinelight === true };
})()`;
// in the light set: joined and camera layer 1 on
const lit = (s) => s.keys > 0 && s.layer1 === true;
const keysOf = (s) => ({ keys: s.keys, layer1: s.layer1, lit: lit(s) });
const same = (a, b) => lit(a) === lit(b);
const JOINED = { keys: 2, layer1: true };
const LEFT = { keys: 0, layer1: false };

async function leg({ PORT, CDP_PORT, fail, webDir = null }) {
  const errs = [];
  // webDir: the tree the standalone runner serves (the red proof's export); the gate serves its own
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 11, width: 1440, height: 900, tool: false, preflightWebDir: webDir });
  watchErrors(c, errs);
  const read = () => c.eval(READ);
  const held = (n) => waitFor(c, `window.__gw.held.length === ${n}`, 40, 50);
  // a few frames, and every microtask after them
  const frames = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(true), 30))))');
  // lands the oldest held change inside the window and judges the keys against the window's open
  async function landInside(tag, at) {
    const why = await c.eval('window.__gw.land()');
    await frames();
    const s = await read();
    if (!same(s, at)) {
      fail(`${tag}: '${why}' landed inside the studio window: the keys moved from ${JSON.stringify(at)} to `
        + `${JSON.stringify(keysOf(s))} (${JSON.stringify(s)})`);
      return false;
    }
    console.log(`${tag}: '${why}' held to the window, landed inside it, moved nothing (parked ${JSON.stringify(s.parked)})`);
    return true;
  }
  // after a failed row: close the window, let the close's microtask hand its change over, then land everything held
  async function drain() {
    await c.eval('window.__gw.close(); true');
    await frames();
    await c.eval('while (window.__gw.land()) {} true');
    await frames();
  }
  async function openWindow(tag) {
    if (!(await c.eval('window.__gw.open()'))) { fail(`${tag}: installCineLight() did not open the studio window`); return null; }
    return keysOf(await read());
  }
  // the revert, then the held seam's count of the changes handed over again
  async function closeWindow(tag, expectHeld) {
    if (!(await c.eval('window.__gw.close()'))) { fail(`${tag}: the studio window did not close`); return false; }
    await frames();
    const n = await c.eval('window.__gw.held.length');
    if (n !== expectHeld) {
      fail(`${tag}: after the window, the seam holds ${n} change(s) handed over again, not ${expectHeld}: ` + JSON.stringify(await read()));
      return false;
    }
    return true;
  }
  async function landAfter(tag, want) {
    const why = await c.eval('window.__gw.land()');
    await frames();
    const s = await read();
    if (!same(s, want)) {
      fail(`${tag}: once '${why}' landed after the window, the keys stand ${JSON.stringify(keysOf(s))}, `
        + `not ${JSON.stringify(want)} as with no export (${JSON.stringify(s)})`);
      return false;
    }
    console.log(`${tag}: handed over again after the window as '${why}'; it landed, keys ${JSON.stringify(want)} as with no export`);
    return true;
  }
  try {
    if (!(await waitFor(c, 'window.__test?.ready === true', 400, 150))) { fail('GW: the FRESH boot never became ready'); return; }
    if (!(await waitFor(c, STILL, 200, 150))) { fail('GW: the FRESH boot never landed in the hall'); return; }
    if (!(await waitFor(c, 'window.__shell.visualState().keysPending === 0', 100, 100))) { fail('GW: the keys never settled after the boot'); return; }
    if (!(await c.eval(HOLD))) { fail('GW: main published no __obStage to hold'); return; }
    const s0 = await read();
    if (!s0.open || !same(s0, JOINED)) { fail('GW: the hall has not landed with its keys joined: ' + JSON.stringify(s0)); return; }

    // GW1: the exit's leave
    {
      const tag = 'GW1';
      await c.eval('window.__shell.quickPlay()');
      if (!(await held(1))) { fail(`${tag}: the exit handed no leave to the seam: ` + JSON.stringify(await read())); return; }
      const at = await openWindow(tag); if (!at) return;
      const ok = await landInside(tag, at) && await closeWindow(tag, 1) && await landAfter(tag, LEFT);
      if (ok) console.log(`${tag} OK`);
      else await drain();
    }
    // GW2: the open's join, the hall open through the window
    {
      const tag = 'GW2';
      if (!(await c.eval('window.__shell.openShell({})'))) { fail(`${tag}: the hall refused to open: ` + JSON.stringify(await read())); return; }
      if (!(await held(1))) { fail(`${tag}: the open handed no join to the seam: ` + JSON.stringify(await read())); return; }
      const at = await openWindow(tag); if (!at) return;
      const ok = await landInside(tag, at) && await closeWindow(tag, 1) && await landAfter(tag, JOINED);
      if (ok) console.log(`${tag} OK`);
      else await drain();
      await waitFor(c, STILL, 100, 100);
    }
    // GW3: the exit's leave across two windows back to back
    {
      const tag = 'GW3';
      await c.eval('window.__shell.quickPlay()');
      if (!(await held(1))) { fail(`${tag}: the exit handed no leave to the seam: ` + JSON.stringify(await read())); return; }
      let ok = false;
      const a = await openWindow(`${tag} first window`);
      if (a && await landInside(`${tag} first window`, a) && await closeWindow(`${tag} first window`, 1)) {
        const b = await openWindow(`${tag} second window`);
        ok = !!b && await landInside(`${tag} second window`, b) && await closeWindow(`${tag} second window`, 1)
          && await landAfter(tag, LEFT);
      }
      if (ok) console.log(`${tag} OK`);
      else await drain();
    }
    // GW4: the open's join, then the exit's leave, both held through the window
    {
      const tag = 'GW4';
      if (!(await c.eval('window.__shell.openShell({})'))) { fail(`${tag}: the hall refused to open: ` + JSON.stringify(await read())); return; }
      await waitFor(c, STILL, 100, 100);
      await c.eval('window.__shell.quickPlay()');
      if (!(await held(2))) { fail(`${tag}: the open and the exit did not hand two changes to the seam: ` + JSON.stringify(await read())); return; }
      const at = await openWindow(tag); if (!at) return;
      const ok = await landInside(`${tag} join`, at) && await landInside(`${tag} leave`, at)
        && await closeWindow(tag, 1) && await landAfter(tag, LEFT);
      if (ok) console.log(`${tag} OK`);
      else await drain();
    }
    // GW5: the control, no window
    {
      const tag = 'GW5';
      let ok = true;
      for (const [verb, want] of [['open', JOINED], ['exit', LEFT]]) {
        if (verb === 'open') {
          if (!(await c.eval('window.__shell.openShell({})'))) { fail(`${tag}: the hall refused to open`); return; }
        } else await c.eval('window.__shell.quickPlay()');
        if (!(await held(1))) { fail(`${tag}: the ${verb} handed no change to the seam: ` + JSON.stringify(await read())); return; }
        const why = await c.eval('window.__gw.land()');
        await frames();
        const s = await read();
        if (!same(s, want) || s.held !== 0 || s.parked !== null) {
          fail(`${tag}: with no window, '${why}' did not land at once and alone: ` + JSON.stringify(s));
          ok = false;
        } else console.log(`${tag}: '${why}' landed at once with no window, nothing handed over again`);
        if (verb === 'open') await waitFor(c, STILL, 100, 100);
      }
      if (ok) console.log(`${tag} OK`);
    }
    // GW6: an open's join, compiled inside the window, its real apply after the window
    {
      const tag = 'GW6';
      await c.eval('window.__gw.holdCompile = true; true');
      if (!(await c.eval('window.__shell.openShell({})'))) { fail(`${tag}: the hall refused to open: ` + JSON.stringify(await read())); return; }
      if (!(await held(1))) { fail(`${tag}: the open handed no join to the seam: ` + JSON.stringify(await read())); return; }
      const at = await openWindow(tag); if (!at) return;
      let ok = true;
      const pass1 = await c.eval('window.__gw.compile()');
      await frames();
      let s = await read();
      if (!same(s, at)) { fail(`${tag}: the compile pass '${pass1}' left the keys moved inside the window: ` + JSON.stringify(s)); ok = false; }
      if (ok && !(await c.eval('window.__gw.close()'))) { fail(`${tag}: the studio window did not close`); ok = false; }
      await frames();
      const n = await c.eval('window.__gw.held.length');
      if (ok && n !== 2) {
        fail(`${tag}: after the window the seam holds ${n} change(s), not the original and the one handed over again: ` + JSON.stringify(await read()));
        ok = false;
      }
      if (ok) {
        const why = await c.eval('window.__gw.land()');
        await frames();
        s = await read();
        if (!same(s, at)) {
          fail(`${tag}: '${why}', parked at its compile pass inside the window, applied after the window without a compile pass of its `
            + `own: the keys moved from ${JSON.stringify(at)} to ${JSON.stringify(keysOf(s))} (${JSON.stringify(s)})`);
          ok = false;
        } else console.log(`${tag}: '${why}', compiled inside the window ('${pass1}'), reached its apply after the window and moved nothing`);
      }
      if (ok) {
        const pass2 = await c.eval('window.__gw.compile()');
        const why = await c.eval('window.__gw.land()');
        await frames();
        s = await read();
        if (!same(s, JOINED) || s.held !== 0) {
          fail(`${tag}: the change handed over again ('${pass2}', then '${why}') left the keys ${JSON.stringify(keysOf(s))}, not `
            + `${JSON.stringify(JOINED)} as with no export (${JSON.stringify(s)})`);
          ok = false;
        } else console.log(`${tag}: the change handed over again compiled after the window ('${pass2}') and landed: keys ${JSON.stringify(JOINED)} as with no export`);
      }
      await c.eval('window.__gw.holdCompile = false; true');
      if (ok) console.log(`${tag} OK`);
      else await drain();
    }
    // GW7: an exit's leave parked in a window, then a second window opened in the same task as the first one's revert
    {
      const tag = 'GW7';
      await waitFor(c, STILL, 100, 100);
      await c.eval('window.__shell.quickPlay()');
      if (!(await held(1))) { fail(`${tag}: the exit handed no leave to the seam: ` + JSON.stringify(await read())); return; }
      const at = await openWindow(tag); if (!at) return;
      let ok = await landInside(tag, at);
      if (ok && !(await c.eval('window.__gw.reopen()'))) { fail(`${tag}: the second window did not open`); ok = false; }
      if (ok) {
        await frames();
        const s = await read();
        if (s.held !== 0 || !same(s, at)) {
          fail(`${tag}: inside the second window (opened in the first one's revert task) the seam holds ${s.held} change(s) and the `
            + `keys stand ${JSON.stringify(keysOf(s))}, not 0 and ${JSON.stringify(keysOf(at))} (${JSON.stringify(s)})`);
          ok = false;
        } else console.log(`${tag}: the close's microtask ran inside the second window and handed nothing over (parked ${JSON.stringify(s.parked)})`);
      }
      ok = ok && await closeWindow(tag, 1) && await landAfter(tag, LEFT);
      if (ok) console.log(`${tag} OK`);
      else await drain();
    }
    await c.eval('window.__gw.restore(); true');
    const br = await c.eval('window.__gw.breaches.slice(0, 8)');
    if (br.length) fail('GW: a landing moved the keys\' light set to one its own compile pass did not compile (P-A): ' + JSON.stringify(br));
    else console.log('GW P-A class: every landing moved the light set only to the one its own compile pass compiled');
    const appErrs = await c.eval('window.__test.errors.slice(0, 8)').catch(() => []);
    if (appErrs.length) fail('GW: app errors: ' + JSON.stringify(appErrs));
    if (errs.length) fail('GW: console errors: ' + errs.slice(0, 3).join(' | '));
  } finally {
    await c.closeAndWait();
  }
}

export async function armGW(ctx) {
  await leg(ctx);
}

// ---- standalone (the red-proof runner; the gate imports armGW above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_GW_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armGW({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-GW FAIL' : 'E2E-SHELL-GW PASS');
}
