// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-userboot-arrival.mjs — GH-715 (S4 journey-QA round 3): the boot
// overlay's shell-arrival hold keys on the ARRIVAL SIGNAL, not a wall clock.
// A LEG MODULE of e2e-userboot.mjs (the e2e-userboot-3g precedent): the
// suite calls runArrivalArm with its band; standalone
// (`node web/tools/e2e-userboot-arrival.mjs` under run-gate) runs the same
// legs in isolation for red/green proofs.
//
// The pre-fix driver (app.html #ob-boot) bounded the hold at 1.6 s past
// ready: on warm-cache / delayed-shell boots (kernel + scene from the disk
// cache, shell.js and its leaf graph still on the wire) the field faded
// onto the raw pre-shell HUD + toolbar for 1-10 s before the hall opened.
// Law now: the fade waits while window.__obShellArrival === 'pending' with
// no time bound of its own (the HOLD law's slow register / stall card are
// the only caps; an import failure resolves the signal at once).
//
//   delay  — phone 844x390 real-user boot, everything fast, shell.js held
//            HOLD_MS (4 s) on the wire via Fetch: the per-rAF recorder must
//            show NO frame with the overlay gone (or fading) over a visible
//            #hud without body.ob-shell-open while the arrival is pending.
//   warm   — boot 1 with shell.js HELD (kernel/scene land, ready flips,
//            the shell never arrives) -> abandon; boot 2 on the SAME
//            profile with shell.js held 3 s: same assertion — no
//            translucent field over the HUD, no exposure.
//   fast   — a normal fast boot still lands: overlay gone with the shell
//            open within the suite's ordinary budget (no regression on the
//            hold's release side).
//   reject — shell.js 404: the documented degrade (the ownership ledger) — the
//            arrival resolves via main.js's import-failure path, the field
//            releases and the boot completes without a hang.
//   legacy — GH-715 review r4 P1 (capability handshake): the fresh app.html
//            paired with a LEGACY cached shell.js — a stub that exports
//            createShell, opens the hall (body.ob-shell-open + window.__shell)
//            and never touches the arrival marker (models 68e10a6c^
//            shell.js, the last pre-protocol module) — served for
//            app/shell.js via Fetch.fulfillRequest. The field must release
//            on the bounded law (the legacy open signal, capped at 1.6 s):
//            overlay gone within LEGACY_MAX_MS of ready, never the stall
//            card, and the marker is no longer 'pending'.
//   legacyaim — the same stub WITHOUT the open signal (a legacy straight-to-
//            AIM boot): the 1.6 s cap alone must release the field.
// Red on the pre-fix bytes: delay records an exposure window > 1 s;
// legacy/legacyaim sit on the field with the marker 'pending' past
// LEGACY_MAX_MS (04b9afa6: until the 120 s stall card).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';

// one static server + one phone endpoint at CDP_PORT
export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-userboot imports runArrivalArm; standalone this leg runs on userboot's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-userboot';
const HOLD_MS = Number(process.env.OB_E2E_ARRIVAL_HOLD_MS || 4000);
// legacy legs: the bounded release is 1.6 s past the legacy mark (+ the
// fade); 12 s is ~7x that and a tenth of the stall card the red bytes reach
const LEGACY_MAX_MS = Number(process.env.OB_E2E_ARRIVAL_LEGACY_MAX_MS || 12000);
// the legacy-shell stub (pre-protocol module shape): exports createShell,
// never claims __obShellProtocol, never resolves __obShellArrival
const LEGACY_STUB = (open) => `// legacy shell stub (e2e-userboot-arrival legacy leg)
export function createShell() {
  ${open ? "document.body.classList.add('ob-shell-open');" : '/* straight-to-AIM: no open signal */'}
  window.__shell = { go: () => 'play', legacyStub: true };
  return null;
}
`;

// per-rAF boot-state log (the e2e-userboot-3g oracle + the arrival signal)
const FRAME_LOG = `(() => {
  const F = window.__obFrames = []; let prev = '';
  const step = () => {
    try {
      const b = document.getElementById('ob-boot');
      const hud = document.getElementById('hud');
      const hcs = hud && getComputedStyle(hud);
      const st = {
        boot: !b ? 'none' : b.classList.contains('ob-boot--out') ? 'out' : b.getAttribute('data-stage'),
        op: b ? +(+getComputedStyle(b).opacity).toFixed(2) : null,
        ready: !!(window.__test && window.__test.ready === true),
        shellOpen: !!(document.body && document.body.classList.contains('ob-shell-open')),
        hud: !!(hcs && hcs.display !== 'none' && hcs.visibility !== 'hidden'),
        arrival: window.__obShellArrival || null,
        slow: !!(b && b.hasAttribute('data-slow')),
        failed: b ? (b.getAttribute('data-boot-failed') || '') : '',
        err: !!((document.getElementById('err') || {}).textContent),
      };
      const k = JSON.stringify(st);
      if (k !== prev) { prev = k; st.t = Math.round(performance.now()); if (F.length < 600) F.push(st); }
    } catch (_) { /* pre-body */ }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})();`;
const PROBE = `(() => { const b = document.getElementById('ob-boot');
  return { t: Math.round(performance.now()), ready: !!(window.__test && window.__test.ready === true),
    boot: !b ? 'none' : b.classList.contains('ob-boot--out') ? 'out' : b.getAttribute('data-stage'),
    shellOpen: !!(document.body && document.body.classList.contains('ob-shell-open')),
    arrival: window.__obShellArrival || null, frames: (window.__obFrames || []).length,
    claimed: Number(window.__obShellProtocol) >= 1, failed: b ? (b.getAttribute('data-boot-failed') || '') : '',
    err: ((document.getElementById('err') || {}).textContent || '').slice(0, 120) }; })()`;

async function newPhone(PORT, cdp) {
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: cdp, tool: false, width: 844, height: 390 });
  await setPhoneMetrics(c, { width: 844, height: 390, deviceScaleFactor: 3 });
  await c.send('Page.enable'); await c.send('Network.enable'); await c.send('Runtime.enable');
  await c.send('Network.clearBrowserCache'); await c.send('Network.clearBrowserCookies');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FRAME_LOG });
  return c;
}
/** Fetch interception on shell.js: 'delay' releases after ms, 'hold' never
 * releases (the held ids are returned), 'reject' fails the request (404),
 * 'legacy' / 'legacyaim' fulfil it with the pre-protocol stub (with /
 * without the open signal). */
function interceptShell(c, mode, ms = HOLD_MS) {
  const held = [];
  c.onEvent((m, p) => {
    if (m !== 'Fetch.requestPaused') return;
    const isShell = /\/app\/shell\.js(\?|$)/.test(p.request.url);
    if (!isShell) { c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {}); return; }
    if (mode === 'hold') { held.push(p.requestId); return; }
    if (mode === 'legacy' || mode === 'legacyaim') {
      c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }],
        body: Buffer.from(LEGACY_STUB(mode === 'legacy')).toString('base64') }).catch(() => {});
      return;
    }
    if (mode === 'reject') { c.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }).catch(() => {}); return; }
    setTimeout(() => c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {}), ms);
  });
  return held;
}
/** Watch a boot until the overlay is gone (shell open or not), with a
 * maximum; returns { frames, last }. */
async function watchBoot(c, { maxMs = 60000, until } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    last = await c.eval(PROBE).catch(() => last);
    if (last && (until ? until(last) : (last.boot === 'none'))) break;
    await sleep(150);
  }
  await sleep(500); // the last frames after the release
  let frames = [];
  try { frames = JSON.parse(await c.eval('JSON.stringify(window.__obFrames || [])')); } catch { /* navigating */ }
  return { frames, last };
}
/** The arrival oracle. A frame is an EXPOSURE when the gameplay chrome is
 * computed visible with no open shell while the overlay is gone or fading
 * (opacity < 1) AND the arrival is still pending — the straight-to-AIM
 * boot (arrival 'done', no shell by law) is not an exposure. Returns
 * { exposure: [t0, t1] | null, translucent: n, violations: [] }. */
export function judgeArrival(frames) {
  const bad = [];
  let seen = false;
  const exposed = [];
  let translucent = 0;
  for (const f of frames) {
    if (f.boot !== 'none' && !seen) seen = true;
    if (!seen) continue;
    const weak = f.boot === 'none' || (f.boot === 'out') || (f.op !== null && f.op < 1);
    if (f.hud && !f.shellOpen && f.arrival === 'pending' && weak) {
      exposed.push(f.t);
      if (f.boot !== 'none') translucent += 1;
    }
    if (f.boot === 'none' && f.arrival === 'pending' && !f.err && !f.failed) {
      bad.push(`t=${f.t}ms overlay GONE while the arrival is still pending`);
    }
  }
  if (exposed.length) {
    bad.push(`EXPOSURE ${exposed[0]}..${exposed.at(-1)}ms (${exposed.length} frame states, ${translucent} translucent): `
      + 'gameplay chrome under a weak/absent field with no shell while the arrival was pending');
  }
  return { exposure: exposed.length ? [exposed[0], exposed.at(-1)] : null, translucent, violations: bad.slice(0, 6) };
}

async function legDelay({ PORT, cdp, fail, log }) {
  const c = await newPhone(PORT, cdp);
  interceptShell(c, 'delay', HOLD_MS);
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/shell.js*' }] });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
  const { frames, last } = await watchBoot(c, { maxMs: 90000, until: (p) => p.boot === 'none' && p.shellOpen });
  const v = judgeArrival(frames);
  if (!last?.ready || last.boot !== 'none' || !last.shellOpen) {
    fail(`arrival/delay: the delayed-shell boot never completed into the hall: ${JSON.stringify(last)}`);
  } else if (v.violations.length) {
    fail(`arrival/delay (shell.js held ${HOLD_MS} ms): ${v.violations.join(' | ')}`);
  } else {
    const out = frames.find((f) => f.boot === 'out'), open = frames.find((f) => f.shellOpen);
    log(`arrival/delay OK: shell.js held ${HOLD_MS} ms — no exposure, no translucent field; `
      + `shell open t=${open?.t} before/at the fade start t=${out?.t} (${frames.length} frame states)`);
  }
  await c.send('Fetch.disable').catch(() => {});
  c.close();
  await sleep(800);
}
async function legWarm({ PORT, cdp, fail, log }) {
  const c = await newPhone(PORT, cdp);
  const held = interceptShell(c, 'hold');
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/shell.js*' }] });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
  // boot 1: kernel + scene land and ready flips; the shell never arrives -> abandon
  const b1 = await watchBoot(c, { maxMs: 60000, until: (p) => p.ready });
  const v1 = judgeArrival(b1.frames);
  if (!b1.last?.ready) fail(`arrival/warm: boot 1 never became ready: ${JSON.stringify(b1.last)}`);
  await sleep(2500); // well past the old 1.6 s bound: the field must still hold
  const hold1 = await c.eval(PROBE).catch(() => null);
  if (hold1 && (hold1.boot === 'none' || hold1.boot === 'out')) {
    fail(`arrival/warm: boot 1 with the shell HELD must keep the field (no time bound): ${JSON.stringify(hold1)}`);
  } else if (v1.violations.length) fail(`arrival/warm boot 1: ${v1.violations.join(' | ')}`);
  await c.send('Page.navigate', { url: 'about:blank' });
  await sleep(600);
  held.length = 0;
  // boot 2: same profile (kernel/scene warm), shell.js held 3 s on the wire
  await c.send('Fetch.disable').catch(() => {});
  interceptShell(c, 'delay', 3000);
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/shell.js*' }] });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
  const b2 = await watchBoot(c, { maxMs: 90000, until: (p) => p.boot === 'none' && p.shellOpen });
  const v2 = judgeArrival(b2.frames);
  if (!b2.last?.ready || b2.last.boot !== 'none' || !b2.last.shellOpen) {
    fail(`arrival/warm: boot 2 never completed into the hall: ${JSON.stringify(b2.last)}`);
  } else if (v2.violations.length) {
    fail(`arrival/warm boot 2 (warm cache, shell.js held 3 s): ${v2.violations.join(' | ')}`);
  } else log(`arrival/warm OK: boot 1 held the field with the shell never arriving (${JSON.stringify(hold1)}); boot 2 warm — no translucent field, no exposure`);
  await c.send('Fetch.disable').catch(() => {});
  c.close();
  await sleep(800);
}
async function legFast({ PORT, cdp, fail, log }) {
  const c = await newPhone(PORT, cdp);
  const t0 = Date.now();
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
  const { frames, last } = await watchBoot(c, { maxMs: 60000, until: (p) => p.boot === 'none' && p.shellOpen });
  const v = judgeArrival(frames);
  const ready = frames.find((f) => f.ready), gone = frames.find((f) => f.boot === 'none');
  const releaseMs = ready && gone ? gone.t - ready.t : null;
  if (!last?.ready || last.boot !== 'none' || !last.shellOpen) {
    fail(`arrival/fast: a normal boot never completed into the hall (${Date.now() - t0} ms): ${JSON.stringify(last)}`);
  } else if (v.violations.length) fail(`arrival/fast: ${v.violations.join(' | ')}`);
  else if (!(releaseMs !== null && releaseMs < 15000)) {
    fail(`arrival/fast: the field must release within the ordinary budget once the shell arrives (ready -> gone ${releaseMs} ms)`);
  } else log(`arrival/fast OK: normal boot, ready -> field gone ${releaseMs} ms, shell open at the release`);
  c.close();
  await sleep(800);
}
async function legReject({ PORT, cdp, fail, log }) {
  const c = await newPhone(PORT, cdp);
  interceptShell(c, 'reject');
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/shell.js*' }] });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
  // the documented degrade: main.js's import-failure path resolves the
  // arrival, the field releases onto the pre-shell app — never a hang
  const { last } = await watchBoot(c, { maxMs: 40000, until: (p) => p.ready && p.boot === 'none' });
  if (!last?.ready || last.boot !== 'none' || last.arrival !== 'done') {
    fail(`arrival/reject: a rejected shell import must resolve the arrival and release the field: ${JSON.stringify(last)}`);
  } else log(`arrival/reject OK: shell.js rejected -> arrival '${last.arrival}', field released (no hang)`);
  await c.send('Fetch.disable').catch(() => {});
  c.close();
  await sleep(800);
}

/** GH-715 review r4 P1: fresh app.html + a LEGACY cached shell.js (exports
 * createShell, never claims the protocol, never resolves the marker). The
 * handshake must release the field on the bounded law — never the stall
 * card. `open` = the stub opens the hall (release on the open signal);
 * !open = a legacy straight-to-AIM boot (the 1.6 s cap alone releases). */
async function legLegacy({ PORT, cdp, fail, log, open }) {
  const tag = open ? 'arrival/legacy' : 'arrival/legacyaim';
  const c = await newPhone(PORT, cdp);
  interceptShell(c, open ? 'legacy' : 'legacyaim');
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/shell.js*' }] });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
  const ready = await watchBoot(c, { maxMs: 60000, until: (p) => p.ready });
  if (!ready.last?.ready) { fail(`${tag}: the boot never became ready: ${JSON.stringify(ready.last)}`); c.close(); return; }
  const tReady = Date.now();
  // the stub must actually be the module in play (staging): __shell.legacyStub
  const stubIn = await c.eval('!!(window.__shell && window.__shell.legacyStub)').catch(() => false);
  const { frames, last } = await watchBoot(c, { maxMs: LEGACY_MAX_MS, until: (p) => p.boot === 'none' });
  const releaseMs = Date.now() - tReady;
  const opened = frames.find((f) => f.shellOpen);
  if (!stubIn && !(await c.eval('!!(window.__shell && window.__shell.legacyStub)').catch(() => false))) {
    fail(`${tag}: staging — the legacy stub never became the shell module (window.__shell.legacyStub absent): ${JSON.stringify(last)}`);
  } else if (last?.claimed) {
    fail(`${tag}: staging — the protocol reads CLAIMED under the legacy stub (the stub must not claim): ${JSON.stringify(last)}`);
  } else if (last?.boot !== 'none') {
    fail(`${tag}: a legacy shell pairing stranded the field — overlay '${last?.boot}' arrival '${last?.arrival}' `
      + `failed '${last?.failed}' ${releaseMs} ms past ready (law: the bounded release, never the stall card): ${JSON.stringify(last)}`);
  } else if (last.failed) {
    fail(`${tag}: the field released through the FAILURE card ('${last.failed}'), not the bounded release`);
  } else if (last.arrival === 'pending') {
    fail(`${tag}: the field released while the marker still reads 'pending' (no legacy resolution): ${JSON.stringify(last)}`);
  } else {
    log(`${tag} OK: legacy stub (open signal ${open ? 'at t=' + (opened ? opened.t : '?') : 'never'}) -> arrival '${last.arrival}', `
      + `field gone ${releaseMs} ms past ready (bound ${LEGACY_MAX_MS} ms, no stall card)`);
  }
  await c.send('Fetch.disable').catch(() => {});
  c.close();
  await sleep(800);
}

export async function runArrivalArm({ PORT, CDP_PORT, fail, log = console.log }) {
  const legs = (process.env.OB_E2E_ARRIVAL_LEGS || 'delay,warm,fast,reject,legacy,legacyaim').split(',');
  if (legs.includes('delay')) await legDelay({ PORT, cdp: CDP_PORT, fail, log });
  if (legs.includes('warm')) await legWarm({ PORT, cdp: CDP_PORT, fail, log });
  if (legs.includes('fast')) await legFast({ PORT, cdp: CDP_PORT, fail, log });
  if (legs.includes('reject')) await legReject({ PORT, cdp: CDP_PORT, fail, log });
  if (legs.includes('legacy')) await legLegacy({ PORT, cdp: CDP_PORT, fail, log, open: true });
  if (legs.includes('legacyaim')) await legLegacy({ PORT, cdp: CDP_PORT, fail, log, open: false });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8149);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9374);
  const fail = (msg) => { console.error('E2E-USERBOOT-ARRIVAL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runArrivalArm({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-USERBOOT-ARRIVAL FAIL' : 'E2E-USERBOOT-ARRIVAL PASS');
}
