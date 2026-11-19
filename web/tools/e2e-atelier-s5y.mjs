// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5y.mjs — GH-668 S5 review r1 (P1): the atelier
// under a STALE ui/motion.js. A LEG MODULE of e2e-atelier.mjs (the
// e2e-atelier-s5w/x precedent): the suite calls runS5Y with its band;
// standalone (`node web/tools/e2e-atelier-s5y.mjs` under run-gate) runs the
// same arm in isolation for red/green proofs.
//
// THE MIXED-CACHE LAW (the ownership ledger :2652-2656, ui-kit.md cache-poison
// contract): a fresh atelier.js + a CACHED kit leaf is a legal module graph.
// motion.js's mount()/unmount() (B-K22, kit step 7) are NEWER than the
// atelier's guarded `import('./ui/motion.js')`: a stale leaf resolves
// TRUTHY without them. Pre-fix (8d1a9a0b) the host reveal read
// `if (m) m.mount(root); else root.hidden = false` — the continuation threw
// while `root.hidden` was still true and the equipment place never painted
// (the cue card's mount/unmount shared the assumption: a staged cue never
// showed).
//
// S5-Y  desktop 1280x800 + phone 844x390 (the e2e-ui coarse insets). Per
//       viewport: a WARM first document (the real leaf; its export set is
//       read and checked against the stand-in's mirror — the B7 sync law),
//       then a SECOND document with the renderer cache disabled and
//       ui/motion.js served STALE at the network (Fetch.fulfillRequest: a
//       body re-exporting every pre-mount export from the real file at
//       ?stale=1 — mount / unmount absent, nothing else changed). The stand-in
//       is asserted as the module the app GOT (typeof mount === 'undefined'
//       through the page's own module map — the effect, not the assignment).
//       Then:
//       1  HOST-OPENS   `__shell.go('equipment')` → #ob-atelier hidden ===
//          false (the truth attribute both registers flip; the desktop host
//          also paints — client rect width > 0; the coarse overview keeps
//          the host column collapsed, its evidence is the rail below);
//       2  RAIL-PAINTS  `__atelier.go('cues')` (the arrival is the S1
//          overview, station null, no rail row) → rail().live === true and
//          >= 1 card with a painted rect;
//       3  CARDS-BROWSE `__atelier.go('table')` → station() === 'table' with
//          painted cards; back to 'cues';
//       4  CUE-CARD     a cue card activation (el.click() on desktop — the
//          cardrail activate() path; a REAL touch press on the phone) →
//          #ob-atelier-cue hidden === false AND painted; the close control →
//          hidden === true; a second activation re-opens it;
//       5  NO-THROW     no Runtime exception / console error naming mount /
//          unmount / "is not a function" on the stale document.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, answerPausedRequest,
} from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5Y; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
// the motion.js surface BEFORE kit step 7 (b40a2d4e) added mount / unmount
const PRE_MOUNT = ['T_FAST', 'T_MED', 'T_SLOW', 'reduced', 'enter', 'exit', 'press', 'pulse', 'stagger'];
const MOUNT = ['mount', 'unmount'];
// a re-export keeps the live bindings (`reduced`) and the real bodies; only
// the mount pair is missing — exactly the cached pre-step-7 leaf
const STALE = `export { ${PRE_MOUNT.join(', ')} } from '/app/ui/motion.js?stale=1';\n`;

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
const PAINTED = (sel) => `(() => { const el = document.querySelector(${J(sel)}); return !!el && el.hidden === false && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0; })()`;
const CARDS_PAINTED = `[...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`;
const CENSUS = `(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), hidden: el.hidden, rects: el.getClientRects().length }; };
  return { host: R(document.getElementById('ob-atelier')), rail: window.__atelier?.rail?.() ?? null, station: window.__atelier?.station?.() ?? null,
    cards: [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].filter((b) => b.getBoundingClientRect().width > 0).length,
    cue: R(document.getElementById('ob-atelier-cue')) };
})()`;

export async function runS5Y({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-Y ${m}`);
  let cells = 0;
  const VPS = [['desktop', 1280, 800], ['phone', 844, 390]];
  for (const [kind, w, h] of VPS) {
    const tag = `${kind} ${w}x${h}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5y_${kind}_${u}`;
    const c = kind === 'phone'
      ? await launchPhone(url('warm'), { cdpPort: CDP_PORT, width: w, height: h, tool: false })
      : await launchChrome(url('warm'), { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    let stalePhase = false, served = 0;
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') { if (stalePhase) errs.push(params.args.map((a) => a.value ?? a.description).join(' ')); return; }
      if (method === 'Runtime.exceptionThrown') { if (stalePhase) errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text); return; }
      if (method !== 'Fetch.requestPaused') return;
      const { url: u } = params.request;
      if (/ui\/motion\.js/.test(u) && !/stale=1/.test(u)) {
        served += 1;
        // #915: a paused request the page abandoned answers "Invalid InterceptionId." — tolerated and counted by the
        // helper; any other rejection fails this cell by name instead of escaping as an unhandled rejection
        answerPausedRequest(c, 'Fetch.fulfillRequest', params, { responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
          body: Buffer.from(STALE, 'utf8').toString('base64') }, { fail: (e) => fail(`${tag}: ${e}`) });
      } else answerPausedRequest(c, 'Fetch.continueRequest', params, {}, { fail: (e) => fail(`${tag}: ${e}`) });
    });
    try {
      if (kind === 'phone') await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: warm boot never ready`); continue; }
      // the B7 sync law: the stand-in mirrors the REAL leaf minus the mount pair
      const real = await c.eval(`import('/app/ui/motion.js').then((m) => Object.keys(m).sort())`, { awaitPromise: true }).catch(() => null);
      const want = [...PRE_MOUNT, ...MOUNT].sort();
      if (J(real) !== J(want)) { fail(`${tag}: the stale stand-in is out of sync with ui/motion.js — real ${J(real)} != mirrored ${J(want)}`); continue; }
      // the second document: renderer cache OFF (the leaf is an eager shell
      // dependency the warm boot cached — the B7 lesson), the leaf served stale
      await c.send('Network.enable');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*ui/motion.js*' }] });
      stalePhase = true;
      await c.send('Page.navigate', { url: url('stale') });
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: stale boot never ready`); continue; }
      const got = await c.eval(`import('/app/ui/motion.js').then((m) => ({ mount: typeof m.mount, unmount: typeof m.unmount, enter: typeof m.enter }))`, { awaitPromise: true }).catch(() => null);
      log(`S5-Y ${tag}: stale leaf served x${served}, page sees ${J(got)}`);
      if (!got || got.mount !== 'undefined' || got.unmount !== 'undefined' || got.enter !== 'function') { fail(`${tag}: the poison did not take (page sees ${J(got)})`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'typeof window.__atelier === "object"', 20))) { fail(`${tag}: atelier never mounted`); continue; }
      // 1 HOST-OPENS (the attribute is the truth; the desktop host also paints)
      const opened = await waitExpr(c, kind === 'phone' ? `document.getElementById('ob-atelier')?.hidden === false` : PAINTED('#ob-atelier'), 60);
      let z = await c.eval(CENSUS);
      cells += 1;
      log(`S5-Y ${tag} arrival ${J(z)}`);
      if (!opened) fail(`${tag}: HOST-OPENS #ob-atelier never opened under the stale leaf (host ${J(z.host)})`);
      // 2 RAIL-PAINTS (the arrival is the overview: station null, no rail row)
      await c.eval(`__atelier.go('cues', { force: true }), true`);
      const live = await waitExpr(c, `window.__atelier.station() === 'cues' && window.__atelier.rail().live === true && ${CARDS_PAINTED}`, 80);
      z = await c.eval(CENSUS);
      log(`S5-Y ${tag} cues ${J({ station: z.station, rail: z.rail, cards: z.cards, host: z.host })}`);
      if (!live) fail(`${tag}: RAIL-PAINTS the rail never went live with painted cards at cues (rail ${J(z.rail)}, cards ${z.cards})`);
      // 3 CARDS-BROWSE
      await c.eval(`__atelier.go('table', { force: true }), true`);
      const browsed = await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving() && ${CARDS_PAINTED}`, 80);
      z = await c.eval(CENSUS);
      log(`S5-Y ${tag} table ${J({ station: z.station, cards: z.cards, host: z.host })}`);
      if (!browsed) fail(`${tag}: CARDS-BROWSE the table station never presented painted cards (station ${z.station}, cards ${z.cards})`);
      await c.eval(`__atelier.go('cues', { force: true }), true`);
      await waitExpr(c, `window.__atelier.station() === 'cues' && !window.__shell.moving() && ${CARDS_PAINTED}`, 80);
      await sleep(400);
      // 4 CUE-CARD open / close / re-open
      const activate = async () => {
        const sel = '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])';
        if (kind === 'phone') {
          const pt = await c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => x.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
          if (!pt) return false;
          await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(40); await touchEnd(c);
          return true;
        }
        return c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => x.getBoundingClientRect().width > 0); if (!el) return false; el.click(); return true; })()`);
      };
      const cueOpen = PAINTED('#ob-atelier-cue');
      if (!(await c.eval(cueOpen))) { if (!(await activate())) fail(`${tag}: CUE-CARD no cue card to activate`); }
      const open1 = await waitExpr(c, cueOpen, 60);
      z = await c.eval(CENSUS);
      log(`S5-Y ${tag} cue open ${J(z.cue)}`);
      if (!open1) fail(`${tag}: CUE-CARD the cue card never painted after activation under the stale leaf (cue ${J(z.cue)})`);
      else {
        const closed = await c.eval(`(() => { const b = document.querySelector('#ob-atelier-cue [data-ob="atelier-cue-close"]'); if (!b) return false; b.click(); return true; })()`);
        const hid = closed && await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === true`, 40);
        if (!hid) fail(`${tag}: CUE-CARD the close control never hid the card (close found ${closed})`);
        await sleep(500); // the rail re-bands after the sheet leaves (coarse); press a settled card
        let open2 = false;
        for (let i = 0; i < 2 && !open2; i++) { if (!(await activate())) { fail(`${tag}: CUE-CARD no second cue card to activate`); break; } open2 = await waitExpr(c, cueOpen, 40); }
        z = await c.eval(CENSUS);
        log(`S5-Y ${tag} cue re-open ${J(z.cue)}`);
        if (!open2) fail(`${tag}: CUE-CARD the card never re-opened after a close (cue ${J(z.cue)})`);
      }
      // 5 NO-THROW
      const bad = errs.filter((e) => /mount|not a function/i.test(String(e)));
      if (bad.length) fail(`${tag}: NO-THROW ${bad.length} mount-shaped error(s) on the stale document: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
      if (served === 0) fail(`${tag}: the network never served the stale leaf (interception blind)`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-Y cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5Y FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5Y({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5Y FAIL' : 'E2E-ATELIER-S5Y PASS');
}
