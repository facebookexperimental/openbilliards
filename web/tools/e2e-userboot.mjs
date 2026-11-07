// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-userboot.mjs — REAL-USER boot gate (the 2026-07 black-page regression:
// every scripted suite boots with the cdp.mjs obtool stamp — classic green +
// cinema pin — so the path real users take, plain app.html → sp look + live
// tier, shipped with zero coverage).
//
//   1) plain URL, fresh profile: no ob-scripted pin, bootLook 'tournament', scene
//      RENDERS (mean luminance + cloth pixel fractions — the fresh-profile
//      default is pool_pro_9ft, whose factory tournament_blue cloth
//      the sp regrade deliberately keeps, so the gate's cloth arm is BLUE),
//      zero console errors / unhandled rejections, one full scripted shot
//      completes.
//   2) poisoned-module-cache recovery: the first settings.js response is
//      replaced with a broken module — the exact shape of the real failure
//      (stale-cache import SyntaxError kills the graph before main.js's
//      handlers exist). app.html's boot guard must cache-refresh + reload
//      into a working non-black app, and re-arm its one-shot marker.
//   3) scripted boot (obtool stamp): bootLook 'green' (path split intact).
//
//   node web/tools/e2e-userboot.mjs      (needs Chrome + node ≥ 22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, setPhoneMetrics } from './touch-cdp.mjs';
import { runBoot3gArm } from './e2e-userboot-3g.mjs';
import { runBootFirstFrameArm } from './e2e-userboot-firstframe.mjs';
import { runArrivalArm } from './e2e-userboot-arrival.mjs';
import { runBootStallArm } from './e2e-userboot-stall.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-316 port hygiene: env-overridable like every other suite (parallel
// worktree lanes carry assigned port ranges; the hardcoded 8149/9374 pair
// stays the default so CI and solo runs are byte-identical).
const PORT = Number(process.env.OB_E2E_PORT ?? 8149);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9374);
// declared so run-gate sizes the band claim (GH-410 law): one static
// server + CDP endpoints CDP_PORT..+15 (arm 10, GH-441, holds +8/+9
// desktop+phone; arm 11, GH-491, is +10; arm 12, GH-694, holds
// +11/+12/+13 for its throttled-boot legs; arm 13, GH-695/GH-701, holds
// +14 desktop / +15 phone)
// (+16: the GH-715 arrival leg module e2e-userboot-arrival.mjs)
// (+17: the BOOT-FIRSTFRAME arm, GH-668 S5 slice 2, both of its metric legs)
// (+18: the GH-1115 idle-only clock + scene-build yield arm, e2e-userboot-stall.mjs)
// (http 2: arm 12's swfail/swstale scratch-mirror server rides PORT + 1 —
// GH-714 review r1; run-gate reads this literal as ONE bare line, GH-410)
export const PORT_INVENTORY = { http: 2, cdp: 19 };

// SHARED_DEFAULT_WINDOW (e2e-userboot) — one suite in two files: e2e-userboot imports runBoot3gArm from the 3g file,
// which also runs standalone on the same ports.
export const SHARED_DEFAULT_WINDOW = 'e2e-userboot';
const fail = (msg) => { console.error('E2E-USERBOOT FAIL:', msg); process.exitCode = 1; };
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

// OB_E2E_READY_TRIES (default 200 × 200ms = 40s, unchanged) extends the
// ready window for heavily loaded machines (see cdp.mjs OB_CDP_LAUNCH_TRIES).
async function waitReady(chrome, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await chrome.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
// pixel probe: CDP screenshot (the composited page — the WebGL canvas has
// no preserveDrawingBuffer, so drawImage from it reads black), decoded and
// measured in-page (no node-side png dependency).
async function probeShot(c) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  return c.eval(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${data}';
    await img.decode();
    const o = document.createElement('canvas'); o.width = 160; o.height = 100;
    const g = o.getContext('2d'); g.drawImage(img, 0, 0, 160, 100);
    const d = g.getImageData(0, 0, 160, 100).data;
    let lum = 0, green = 0, gray = 0, blue = 0, olive = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      lum += 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      // classic_green post feature-010 calibration is a teal-leaning green
      // (Simonis Green screen anchor ~H162: g above r by >1.3x but only
      // slightly above b) — g >= b keeps it disjoint from tournament_blue,
      // whose b exceeds g.
      if (gg > 60 && gg > r * 1.3 && gg >= b && b > r) green++;
      if (r > 60 && Math.abs(r - gg) < 20 && Math.abs(gg - b) < 20) gray++;
      if (b > 60 && b > r * 1.3 && b > gg * 1.3) blue++; // tournament_blue cloth
      // snooker_green 0x041d08 (GH-489 R1 pure-XW101 re-solve through
      // the cammatch harness — clothvisuals.js provenance block; W3's
      // joint-solve value retired with the s1-club anchor): an emerald
      // tournament green — g dominates both r and b, b sits between
      // (r < b < g). The class is family-level by design; variant
      // IDENTITY rides the appliedClothVisual() exact-hex seam below,
      // the pixel arm stays the render-sanity tripwire (the R1 deep
      // albedo still reads g≈64 under the shipped rig — inside this
      // class; the venue-rig re-fit to photo-family exposure rides the
      // corner-rebuild round).
      if (gg > 40 && gg > r * 1.5 && gg > b * 1.4 && b > r) olive++;
    }
    const n = 160 * 100;
    return { lum: lum / n, green: green / n, gray: gray / n, blue: blue / n,
      olive: olive / n };
  })()`);
}
// GH-313 (fix-qa1 residual C3.2a): every pixel probe POLLS (bounded) instead
// of judging ONE fixed-sleep sample — under runner load the async texture
// loads lag the screenshot (measured: a healthy boot's blue ≈0.091 read
// 0.067 against the 0.07 floor mid-storm). Thresholds unchanged: an idle box
// passes on the first sample; a wrong boot reads ~0 forever and fails the
// same message after the bounded wait.
async function probeShotSettled(c, pred, tries = 20, ms = 500) {
  let px = null;
  for (let i = 0; i < tries; i++) {
    px = await probeShot(c);
    if (px && pred(px)) return px;
    await sleep(ms);
  }
  return px;
}
// GH-313 (fix-qa1 residual C3.2b): the GI-look checks poll the bake settle
// (bounded) instead of trusting a fixed sleep window — the state probe shows
// the bake landing after 1500 ms on a loaded box, before it on an idle one.
async function evalSettled(c, expr, tries = 25, ms = 400) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(ms);
  }
  return false;
}

// ---- 1) real-user boot: plain URL, fresh profile, no obtool stamp
const errors1 = [];
// GH-326 console hygiene: FULL-spectrum console watch for the AudioContext
// autoplay-policy warning ('The AudioContext was not allowed to start…').
// Chrome emits it as a Log.entryAdded WARNING (source 'other'), invisible
// to the error-level collectors every suite already runs — the journey-QA
// wave 1 pattern (capture ALL levels during the triggering journey).
const audioWarns = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
  { port: CDP_PORT, tool: false });
chrome.onEvent((method, params) => {
  const line = method === 'Runtime.consoleAPICalled'
    ? params.args.map((a) => a.value ?? a.description).join(' ')
    : method === 'Log.entryAdded' ? params.entry.text : null;
  if (line && /AudioContext/i.test(line)) audioWarns.push(line);
});
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    errors1.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    errors1.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  }
});
if (!(await waitReady(chrome))) fail('real-user boot never became ready (BLACK PAGE class)');
else {
  await sleep(1500);
  if (await chrome.eval('sessionStorage.getItem("ob-scripted")') !== null) fail('plain boot set the ob-scripted pin');
  if (await chrome.eval('__test.bootLook') !== 'tournament') fail('real-user bootLook is not tournament');
  await evalSettled(chrome, "__gi.state.look === 'tournament'"); // GH-313 C3.2b poll
  if (await chrome.eval('__gi.state.look') !== 'tournament') fail('real-user boot did not load the tournament GI bake');
  const px = await probeShotSettled(chrome, (p) => p.lum >= 40 && p.blue >= 0.07);
  if (!px || px.lum < 40) fail(`scene not rendered: luminance ${px?.lum?.toFixed(1)} (< 40 ⇒ black)`);
  // blue-cloth arm (feature 010 flip): the fresh real-user default is the
  // Diamond Pro-Am with factory tournament_blue cloth, which the sp regrade
  // keeps (branded materials are never repainted) — gray here would mean
  // the scene booted the wrong table or repainted a branded cloth.
  // Threshold 0.07 (re-derived, issue #228 mottle rebuild): the healthy
  // boot now measures ~0.091 — the pre-#228 map's ±0.14 hue-rotation
  // patches pushed extra pixels over the classifier's b > 1.3*g ratio
  // (~0.14 then); the rebuilt fiber-scale map has less hue variance, so
  // fewer pixels cross the ratio. A wrong-table/wrong-look boot still
  // reads ~0 — the tripwire keeps its full separation.
  else if (px.blue < 0.07) fail(`diamond tournament_blue cloth missing: blue fraction ${px.blue.toFixed(3)} (gray ${px.gray.toFixed(3)})`);
  else console.log(`user boot renders: lum ${px.lum.toFixed(1)}, blue ${px.blue.toFixed(2)}, gray ${px.gray.toFixed(2)}, green ${px.green.toFixed(2)}`);
  // 031 shell-boot variant (FR-011 / feature 031 (internal spec)): the fresh
  // real-user boot ARRIVES in the shell — the settle lands the play anchor
  // (bounded move law), quick-play exits to the LIVE table, THEN the
  // scripted shot below rides today's path. quick-play here goes through
  // the PROGRAMMATIC seam (__shell.quickPlay) so this journey stays
  // gestureless and the GH-326 no-AudioContext law keeps its meaning; the
  // pointer/keyboard quick-play paths are e2e-shell.mjs territory.
  {
    let landed = false;
    for (let i = 0; i < 30 && !landed; i++) {
      landed = await chrome.eval(`(() => {
        const s = window.__shell;
        if (!s || !s.isOpen() || s.moving()) return false;
        const a = s.registry().find((p) => p.id === 'play').anchor;
        const p = s.pose();
        return Math.abs(p.radius - a.radius) < 1e-9
          && Math.abs(p.theta - a.theta) < 1e-9
          && Math.abs(p.phi - a.phi) < 1e-9;
      })()`).catch(() => false);
      if (!landed) await sleep(200);
    }
    if (!landed) {
      fail('fresh real-user boot never landed the shell play anchor '
        + '(031 US1 settle)');
    } else if (await chrome.eval('__shell.place()') !== 'play') {
      fail('fresh arrival is not at the play place (031 US1)');
    } else if (await chrome.eval('__shell.quickPlay()') !== true) {
      fail('quick-play refused on a settled fresh arrival (031 US3)');
    } else if (await chrome.eval('__shell.isOpen()')) {
      fail('quick-play did not exit the shell (031 US3)');
    } else {
      console.log('shell-boot variant OK: settle landed play anchor, '
        + 'quick-play exited to the live table');
    }
  }
  const rej = await chrome.eval('__test.shoot({ power: 4 })');
  if (rej) fail('scripted shot rejected: ' + rej);
  let st = 'PLAYBACK';
  for (let i = 0; i < 150 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) { await sleep(200); st = await chrome.eval('__test.state()'); }
  if (st === 'PLAYBACK' || !(await chrome.eval('__test.outcome() !== null'))) fail(`shot never settled (state ${st})`);
  else console.log(`full shot OK: settled in ${st}`);
  await chrome.screenshot(path.join(webDir, 'e2e-userboot.png'));
  // boot overlay (issue #48): dismissed AND removed from the DOM after the
  // first presented frame — a lingering overlay would both fail the pixel
  // probe above and intercept input forever.
  if (await chrome.eval('document.getElementById("ob-boot") !== null')) {
    fail('boot overlay still in the DOM after ready (issue #48 dismissal)');
  }
  if (await chrome.eval('__test.errors.length')) fail('app errors: ' + JSON.stringify(await chrome.eval('__test.errors')));
  if (errors1.length) fail('console errors (real-user boot): ' + errors1.slice(0, 3).join(' | '));
  // GH-326: a gestureless boot + scripted shot must construct NO
  // AudioContext — pre-fix (red) the PLAYBACK entry created it before any
  // user gesture, Chrome logged the autoplay-policy warning and scheduled
  // cue nodes against a suspended clock (the first-tap-silence sighting).
  // Post-fix the context is latched to real user activation: zero
  // AudioContext console traffic on this whole journey and zero scheduled
  // nodes (sound.js 'frame' scheduler no-ops while audio is null).
  if (audioWarns.length) {
    fail(`AudioContext console traffic on a gestureless boot (GH-326): `
      + audioWarns.slice(0, 2).join(' | '));
  }
  const preGestureSched = await chrome.eval('window.__sound?.scheduled ?? -1');
  if (preGestureSched !== 0) {
    fail(`gestureless boot scheduled ${preGestureSched} audio nodes `
      + '(GH-326: must stay silent-by-design until the first gesture)');
  }
  if (!audioWarns.length && preGestureSched === 0) {
    console.log('GH-326 boot hygiene OK: no AudioContext warnings, '
      + '0 nodes scheduled pre-gesture');
  }
}

// ---- 1b) boot overlay lifecycle (issue #48): shown from first paint on a
// real-user boot (slate field over ALL chrome — z above the toolbar's 40),
// then fully REMOVED before the ready+1.5s pixel-probe window. Observed via
// an injected new-document MutationObserver: on a warm cache the overlay can
// be gone within ~700ms of ready, so post-hoc polling would race it.
await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  (() => {
    const rec = { seen: false, z: 0, stage0: '', display: '' };
    window.__obBootProbe = rec;
    const mo = new MutationObserver(() => {
      const el = document.getElementById('ob-boot');
      if (el && !rec.seen) {
        rec.seen = true;
        const cs = getComputedStyle(el);
        rec.z = Number(cs.zIndex); rec.display = cs.display;
        rec.stage0 = el.getAttribute('data-stage');
        mo.disconnect();
      }
    });
    // observe the DOCUMENT node: new-document scripts run before any HTML
    // is parsed, so document.documentElement is still null here
    mo.observe(document, { childList: true, subtree: true });
  })();
` });
await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ovl` });
if (!(await waitReady(chrome))) fail('overlay-probe boot never became ready');
else {
  await sleep(1500);
  const probe = await chrome.eval('window.__obBootProbe');
  if (!probe?.seen) fail('boot overlay never appeared on a real-user boot (issue #48 first paint)');
  else {
    if (probe.display === 'none') fail('boot overlay present but display:none at first observation');
    if (!(probe.z > 40)) fail(`boot overlay z-index ${probe.z} does not clear the toolbar (40)`);
    if (probe.stage0 !== 'kernel') fail(`boot overlay initial stage '${probe.stage0}' (want 'kernel')`);
  }
  if (await chrome.eval('document.getElementById("ob-boot") !== null')) {
    fail('boot overlay not removed after the first frame (pixel probe / input interception)');
  }
  const px = await probeShotSettled(chrome, (p) => p.lum >= 40 && p.blue >= 0.07);
  // blue floor 0.07: re-derived with the boot arm above (issue #228)
  if (!px || px.lum < 40 || px.blue < 0.07) fail(`scene not visible post-dismissal: ${JSON.stringify(px)}`);
  else console.log(`overlay lifecycle OK: seen (z ${probe?.z}, stage '${probe?.stage0}') → removed; lum ${px.lum.toFixed(1)}, blue ${px.blue.toFixed(2)}`);
  // 031 first-paint/z-order re-baseline (FR-011): this re-navigation rides
  // the profile arm 1 wrote, so it is a RETURNING boot — the shell chrome
  // presents once the overlay hands off, and its layer (z 8) sits UNDER
  // the overlay field (z > 40) and under #err (z 9): the boot overlay and
  // the error card are never covered by shell chrome.
  const shellZ = await chrome.eval(`(() => {
    const el = document.getElementById('ob-shell');
    if (!el) return null;
    return { z: Number(getComputedStyle(el).zIndex),
      open: window.__shell?.isOpen?.() === true,
      boot: window.__shell?.state?.().boot ?? null };
  })()`);
  if (!shellZ) fail('shell chrome missing on the returning re-boot (031 1b)');
  else {
    if (!shellZ.open || shellZ.boot !== 'returning') {
      fail('re-boot did not classify RETURNING with the shell presented: '
        + JSON.stringify(shellZ));
    }
    if (!(shellZ.z < (probe?.z ?? 60)) || !(shellZ.z < 9)) {
      fail(`shell chrome z ${shellZ.z} must sit under #err (9) and the `
        + `boot overlay (${probe?.z})`);
    }
  }
}

// ---- 1c) 031 returning-player opening pose (both branches: Play-pose /
// straight-to-AIM — owner ruling 2026-08-15: returning ALWAYS opens at
// Play) + storage degrade (FR-011 arms). Same chrome/profile as arm 1: the
// shell key exists, so each leg SEEDS the exact ob-shell-v1 shape it probes
// and re-navigates (the arm-6 seed-then-renavigate convention).
{
  const settingsBlob = await chrome.eval(
    `localStorage.getItem('ob-settings-v1')`);
  // leg A — RETURNING: instant pose at the PLAY place, no settle move ever
  // in flight. Owner ruling 2026-08-15 (contract §4 / §9 entry 7): the
  // returning opening pose is ALWAYS Play — the seed deliberately records
  // an ERRAND place (equipment) to prove the stored lastPlace never
  // becomes a boot pose (it is write-only navigation memory, §5).
  await chrome.eval(`localStorage.setItem('ob-shell-v1', JSON.stringify(
    { v: 1, lastPlace: 'equipment', startAtTable: false })), true`);
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ret1` });
  if (!(await waitReady(chrome))) fail('returning-boot (play pose) never became ready');
  else {
    let s = null;
    for (let i = 0; i < 25 && !(s?.shell); i++) {
      await sleep(200);
      s = await chrome.eval(`(() => {
        const sh = window.__shell;
        if (!sh) return { shell: false };
        const a = sh.registry().find((p) => p.id === 'play').anchor;
        const p = sh.pose();
        return { shell: true, open: sh.isOpen(), place: sh.place(),
          moving: sh.moving(), boot: sh.state().boot,
          atAnchor: Math.abs(p.radius - a.radius) < 1e-9
            && Math.abs(p.theta - a.theta) < 1e-9
            && Math.abs(p.phi - a.phi) < 1e-9 };
      })()`).catch(() => null);
    }
    if (!s?.shell) fail('returning boot never exposed the shell surface');
    else if (!s.open || s.place !== 'play' || s.boot !== 'returning'
      || s.moving || !s.atAnchor) {
      fail('returning boot must present ALREADY POSED at the PLAY place '
        + '(never the stored errand place) with no settle move '
        + '(031 US2.1, owner ruling 2026-08-15): ' + JSON.stringify(s));
    } else {
      // retention corollary (contract §5 / review review r2): the forced
      // boot pose is not a navigation — a zero-navigation returning
      // session (boot open → quick-play exit) leaves the stored errand
      // memory untouched
      const kept = await chrome.eval(`(() => {
        window.__shell.quickPlay();
        return JSON.parse(localStorage.getItem('ob-shell-v1')).lastPlace;
      })()`);
      if (kept !== 'equipment') {
        fail('returning bootPose must RETAIN the stored lastPlace through '
          + 'a zero-navigation session (§5 retention corollary): ' + kept);
      } else console.log('returning boot OK: instant PLAY pose, stored '
        + 'equipment lastPlace retained through quick-play exit, no move');
    }
  }
  // leg B — explicit straight-to-AIM preference: today's boot, shell via
  // its chrome affordance only
  await chrome.eval(`localStorage.setItem('ob-shell-v1', JSON.stringify(
    { v: 1, lastPlace: 'play', startAtTable: true })), true`);
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ret2` });
  if (!(await waitReady(chrome))) fail('straight-to-AIM boot never became ready');
  else {
    await sleep(1200);
    const s = await chrome.eval(`(() => ({
      open: window.__shell?.isOpen?.() ?? null,
      boot: window.__shell?.state?.().boot ?? null,
      pill: !!document.getElementById('ob-shell-open')
        && document.getElementById('ob-shell-open').hidden === false,
      pos: window.__dbg.camera.position.toArray().map((v) => +v.toFixed(4)),
      fov: window.__dbg.camera.fov,
      state: __test.state(),
    }))()`);
    if (s.open !== false || s.boot !== 'table' || !s.pill) {
      fail('straight-to-AIM boot must keep the shell closed with the pill '
        + 'affordance present (031 US2.2): ' + JSON.stringify(s));
    } else if (JSON.stringify(s.pos) !== JSON.stringify([-1.8346, 1.3934, 1.4558])
      || s.fov !== 40) {
      fail('straight-to-AIM boot pose is not today\'s boot triple: '
        + JSON.stringify(s));
    } else console.log('straight-to-AIM boot OK: today\'s pose, pill present');
  }
  // leg C — storage degrade: corrupt JSON and an unknown schema version
  // both classify FRESH (hall arrival), never a boot error
  for (const [tag, blob] of [['corrupt', `'{'`],
    ['unknown-v', `JSON.stringify({ v: 9, lastPlace: 'play', startAtTable: false })`]]) {
    await chrome.eval(`localStorage.setItem('ob-shell-v1', ${blob}), true`);
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?u=deg-${tag}` });
    if (!(await waitReady(chrome))) { fail(`storage-degrade (${tag}) boot never became ready`); continue; }
    let s = null;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      s = await chrome.eval(`(() => ({
        boot: window.__shell?.state?.().boot ?? null,
        open: window.__shell?.isOpen?.() ?? null,
        moving: window.__shell?.moving?.() ?? null,
      }))()`).catch(() => null);
      if (s?.boot === 'fresh' && s.open === true && s.moving === false) break;
    }
    if (!(s?.boot === 'fresh' && s.open === true)) {
      fail(`storage-degrade (${tag}) must classify FRESH and arrive in the `
        + 'hall (031 US2.3): ' + JSON.stringify(s));
    }
    if (await chrome.eval('__test.errors.length')) {
      fail(`storage-degrade (${tag}) produced app errors: `
        + JSON.stringify(await chrome.eval('__test.errors')));
    }
  }
  // the settings blob is byte-identical across every shell boot/operation
  // above (US2.4 — the ob-settings-v1 byte-compat law)
  const settingsAfter = await chrome.eval(
    `localStorage.getItem('ob-settings-v1')`);
  if (settingsAfter !== settingsBlob) {
    fail('shell boots rewrote ob-settings-v1 (byte-compat law): '
      + JSON.stringify({ before: settingsBlob, after: settingsAfter }));
  } else {
    console.log('storage arms OK: corrupt/unknown degrade to FRESH, '
      + 'ob-settings-v1 byte-identical');
  }
  // restore a clean returning profile for the poison arm below (arm 2
  // stays byte-untouched; it recovers into whatever profile stands)
  await chrome.eval(`localStorage.setItem('ob-shell-v1', JSON.stringify(
    { v: 1, lastPlace: 'play', startAtTable: false })), true`);
}

// ---- 2) stale-module poison: boot guard must self-heal to a working app
let poisoned = 0, loads = 0, poisonAll = false; // poisonAll: scenario 2b only
chrome.onEvent((method, params) => {
  if (method === 'Page.loadEventFired') loads++;
  if (method !== 'Fetch.requestPaused') return;
  if (params.request.url.includes('settings.js') && (poisoned === 0 || poisonAll)) {
    poisoned++;
    chrome.send('Fetch.fulfillRequest', {
      requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' },
        { name: 'Cache-Control', value: 'max-age=3600' }],
      body: Buffer.from('export const stale = 1; // poisoned pre-merge module\n').toString('base64'),
    });
  } else chrome.send('Fetch.continueRequest', { requestId: params.requestId });
});
await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*settings.js*' }] });
// the module may sit in the renderer's memory cache from scenario 1 — force
// the request onto the network so the interception (the 'stale copy') serves
await chrome.send('Network.enable');
await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stale` });
if (!(await waitReady(chrome))) fail('boot guard did not recover from a poisoned module (black page)');
else {
  await sleep(1000);
  if (poisoned !== 1) fail(`poison served ${poisoned} times (want exactly 1)`);
  if (!errors1.some((e) => /does not provide an export|SyntaxError/.test(e))) fail('poison never produced the module SyntaxError (test inert)');
  if (await chrome.eval('sessionStorage.getItem("ob-bootfix-attempted")') !== null) fail('healthy recovery did not re-arm the boot guard marker');
  if (await chrome.eval('__test.bootLook') !== 'tournament') fail('recovered boot lost the tournament path');
  const px = await probeShotSettled(chrome, (p) => p.lum >= 40);
  if (!px || px.lum < 40) fail(`recovered scene not rendered: luminance ${px?.lum?.toFixed(1)}`);
  else console.log(`poison recovery OK: 1 heal, ${loads} loads, lum ${px.lum.toFixed(1)}`);
  // issue #48: the overlay must never mask #err (z 9) — on the poisoned
  // first load its error listener removed it before the guard's reload, and
  // the healthy recovery dismissed it again; either way it must be gone.
  if (await chrome.eval('document.getElementById("ob-boot") !== null')) {
    fail('boot overlay still present after poison recovery (would mask #err)');
  }
  if (await chrome.eval('__test.errors.length')) fail('post-recovery app errors: ' + JSON.stringify(await chrome.eval('__test.errors')));
}

// ---- 2b) TERMINAL boot failure (QA #81 lane E): the heal is one-shot, so a
// PERSISTENTLY poisoned module (fails again after the cache-refresh reload)
// must land the honest BOOT FAILED register — and that card must be the ONLY
// chrome on the page. The app never booted: i18n never loads, so the static
// HUD skeleton (#hud / #ob-toolbar / #help with empty data-i18n labels) is
// dead ink and app.html suppresses it (body[data-ob-boot-failed]).
poisonAll = true;
await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=terminal` });
let terminal = false;
for (let i = 0; i < 100 && !terminal; i++) {
  await sleep(300);
  try {
    terminal = await chrome.eval(
      `(document.getElementById('err')?.textContent ?? '').includes('BOOT FAILED')`);
  } catch { /* navigating (the guard's heal reload) */ }
}
if (!terminal) fail('persistent poison never reached the terminal BOOT FAILED register');
else {
  if (await chrome.eval('sessionStorage.getItem("ob-bootfix-attempted")') !== '1') {
    fail('terminal state lost the one-shot heal marker (would reload-loop)');
  }
  if (await chrome.eval('getComputedStyle(document.getElementById("err")).display') === 'none') {
    fail('terminal #err card is not visible');
  }
  // the skeleton-suppression gate: every non-#err element under <body> must
  // be display:none — pre-fix this listed [ob-toolbar, hud, help] (dead
  // skeleton chrome with raw/blank labels showing behind the error card)
  // GH-694 hold law: the boot overlay is the one non-#err survivor — it IS
  // the honest failure card (reason + Retry) and sits UNDER #err (z 8 < 9)
  // so the log is never masked (pre-694 the driver removed it and #err sat
  // over the dead skeleton / a bare black page).
  await sleep(600); // the card's own locale-dictionary fetch
  const ghosts = await chrome.eval(`[...document.body.children]
    .filter((el) => el.id !== 'err' && el.id !== 'ob-boot' && el.tagName !== 'SCRIPT'
      && getComputedStyle(el).display !== 'none')
    .map((el) => el.id || el.tagName)`);
  if (ghosts.length) fail('terminal BOOT FAILED shows dead skeleton chrome behind #err: ' + ghosts.join(', '));
  const card = await chrome.eval(`(() => {
    const b = document.getElementById('ob-boot'); if (!b) return null;
    const e = document.getElementById('err'); const btn = b.querySelector('.ob-boot__retry');
    const er = e.getBoundingClientRect();
    const at = document.elementFromPoint(er.x + er.width / 2, er.y + Math.min(12, er.height / 2));
    return { failed: b.getAttribute('data-boot-failed'), z: Number(getComputedStyle(b).zIndex),
      errZ: Number(getComputedStyle(e).zIndex), errOnTop: !!(at && e.contains(at)),
      retry: btn ? btn.textContent.trim() : null,
      retryVis: !!btn && btn.getBoundingClientRect().height > 0 };
  })()`);
  if (!card) fail('terminal state lost the overlay failure card (GH-694: never a bare #err over dead chrome)');
  else if (card.failed !== 'module' || !(card.z < card.errZ) || !card.errOnTop
    || !card.retryVis || !card.retry) {
    fail('terminal failure card wrong (GH-694): ' + JSON.stringify(card));
  }
  if (!ghosts.length && card) console.log('terminal BOOT FAILED honest: #err over the failure card, skeleton suppressed');
}
poisonAll = false;

// ---- 2c) GH-1081: a ResizeObserver-loop notification is not a boot failure.
// Browsers report undelivered ResizeObserver notifications as a window error
// event with no error object ("ResizeObserver loop completed with undelivered
// notifications."), and WebKit before 262989@main censors it to a detail-less
// "Script error." once parsing has finished; under load one landed mid-boot
// and a Mac cold launch stopped on "A module failed to load". A
// document-start recorder logs every document (and that its observer
// attached) and every data-boot-failed the #ob-boot driver sets, in
// sessionStorage so it survives the guard's heal reload. Every leg dispatches
// the notification and its censored shape at readystatechange 'interactive'
// (module graph not yet evaluated: the boot guard and the driver's listener
// are live). Leg RO dispatches both again on the first frame with
// window.__test (main.js's hook is live and its #err rows reach the driver's
// #err observer): none may trip the card or start the guard's heal, and
// main.js must still log both (__test.errors feeds the observer-cycle arms).
// Leg rearm trips the card with a real (Error-carrying) event, then, once
// ready has un-failed it while #ob-boot is still up, dispatches the
// notification: its #err row must not re-raise the card. Leg control lets
// arm 2's one-shot poisoned settings.js fail the graph after the
// 'interactive' dispatches: the real failure must still trip the card and
// heal (the filter leaves the guard's one-shot armed), so the zero trips
// above come from an instrument that sees trips.
{
  let ok2c = true;
  const fail2c = (msg) => { ok2c = false; fail(msg); };
  const RO_MSG = 'ResizeObserver loop completed with undelivered notifications.';
  const CENSORED = 'Script error.';
  const REAL = 'gh1081 synthetic module failure';
  const { identifier } = await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    let S; try { S = sessionStorage; if (!S.getItem('gh1081-leg')) return; } catch (_) { return; }
    const leg = S.getItem('gh1081-leg');
    const log = (k, v) => { const a = JSON.parse(S.getItem(k) || '[]'); a.push(v); S.setItem(k, JSON.stringify(a)); };
    log('gh1081-docs', location.search);
    // observe the Document: <html> does not exist yet at document start (arm 1b)
    new MutationObserver((ms) => {
      for (const m of ms) {
        const v = m.target.id === 'ob-boot' && m.target.getAttribute('data-boot-failed');
        if (v) log('gh1081-trips', v);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-boot-failed'] });
    log('gh1081-alive', location.search);
    const boot = () => document.getElementById('ob-boot');
    const fire = (where, message, error) => {
      const el = boot();
      log('gh1081-fired', { where, message, test: !!window.__test, overlay: !!el && el.isConnected });
      window.dispatchEvent(new ErrorEvent('error', error ? { message, error } : { message }));
    };
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive' || S.getItem('gh1081-g')) return;
      S.setItem('gh1081-g', '1');
      fire('guard', ${JSON.stringify(RO_MSG)});
      fire('guard', ${JSON.stringify(CENSORED)});
    });
    if (leg === 'control') return;
    const tick = () => {
      if (!window.__test) { requestAnimationFrame(tick); return; }
      if (leg === 'ro') {
        if (S.getItem('gh1081-m')) return;
        S.setItem('gh1081-m', '1');
        fire('main', ${JSON.stringify(RO_MSG)});
        fire('main', ${JSON.stringify(CENSORED)});
        return;
      }
      const el = boot();
      if (!S.getItem('gh1081-r1')) {
        S.setItem('gh1081-r1', '1');
        fire('real', ${JSON.stringify(REAL)}, new Error(${JSON.stringify(REAL)}));
      } else if (window.__test.ready === true && el && el.isConnected && !el.hasAttribute('data-boot-failed')) {
        fire('rearm', ${JSON.stringify(RO_MSG)});
        return;
      }
      if (el && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();` });
  const leg = async (name, search) => {
    await chrome.eval(`(sessionStorage.clear(), sessionStorage.setItem('gh1081-leg', ${JSON.stringify(name)}), true)`);
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=${search}` });
    const ready = await waitReady(chrome);
    // the overlay leaves after ready (+2 ticks, the shell-arrival hold, the fade)
    const gone = ready && await evalSettled(chrome, `document.getElementById('ob-boot') === null`);
    const read = (k) => chrome.eval(`JSON.parse(sessionStorage.getItem(${JSON.stringify(k)}) || '[]')`);
    const logged = await chrome.eval(`(() => { const e = (window.__test?.errors || []).map(String);
      return { ro: e.filter((m) => m.startsWith('ResizeObserver loop')).length, censored: e.filter((m) => m === ${JSON.stringify(CENSORED)}).length }; })()`);
    const r = { name, ready, gone, docs: await read('gh1081-docs'), alive: await read('gh1081-alive'), trips: await read('gh1081-trips'),
      fired: await read('gh1081-fired'), logged };
    const at = (where, message) => r.fired.find((f) => f.where === where && f.message === message);
    const live = (f, test) => !!f && f.test === test && f.overlay === true;
    if (!ready) { fail2c(`GH-1081 leg ${name}: the boot never reached ready: ${JSON.stringify(r)}`); return null; }
    if (!r.docs.length || r.alive.length !== r.docs.length) { fail2c(`GH-1081 leg ${name}: the document-start recorder did not attach: ${JSON.stringify(r)}`); return null; }
    if (!live(at('guard', RO_MSG), false) || !live(at('guard', CENSORED), false)) {
      fail2c(`GH-1081 leg ${name} is inert: the notification and its censored shape must fire before window.__test while #ob-boot is up: ${JSON.stringify(r.fired)}`);
      return null;
    }
    r.at = at; r.live = live;
    return r;
  };
  const ro = await leg('ro', 'gh1081ro');
  if (ro) {
    if (!ro.live(ro.at('main', RO_MSG), true) || !ro.live(ro.at('main', CENSORED), true)) {
      fail2c('GH-1081 leg ro is inert: both shapes must fire again on the first frame with window.__test while #ob-boot is up: ' + JSON.stringify(ro.fired));
    } else {
      if (ro.trips.length) fail2c(`GH-1081: a ResizeObserver-loop notification tripped the boot failure card (${ro.trips.join(', ')}): ${JSON.stringify(ro)}`);
      if (ro.docs.length !== 1) fail2c(`GH-1081: a ResizeObserver-loop notification started the boot guard's heal (${ro.docs.length} documents): ${JSON.stringify(ro)}`);
      if (!ro.gone) fail2c('GH-1081: the boot overlay never left after a ResizeObserver-loop notification');
      if (ro.logged.ro < 1 || ro.logged.censored < 1) {
        fail2c('GH-1081: main.js no longer logs the notification in __test.errors (the observer-cycle arms read it): ' + JSON.stringify(ro.logged));
      }
    }
  }
  const rearm = await leg('rearm', 'gh1081rearm');
  if (rearm) {
    if (!rearm.live(rearm.at('real', REAL), true) || !rearm.live(rearm.at('rearm', RO_MSG), true)) {
      fail2c('GH-1081 leg rearm is inert: a real error must fire, then the notification after ready un-failed the card while #ob-boot is up: '
        + JSON.stringify(rearm.fired));
    } else if (rearm.trips.length !== 1 || rearm.trips[0] !== 'module' || rearm.docs.length !== 1) {
      fail2c(`GH-1081: after ready un-failed a real error's card, a notification's #err row re-raised it (want exactly one 'module' trip): ${JSON.stringify(rearm)}`);
    }
  }
  poisoned = 0; // arm 2's interception serves ONE poisoned settings.js again
  const ctl = await leg('control', 'gh1081ctl');
  if (ctl) {
    if (poisoned !== 1) fail2c(`GH-1081 control: poison served ${poisoned} times (want exactly 1)`);
    if (!ctl.trips.includes('module')) fail2c('GH-1081 control: a real module failure no longer trips the card (or the recorder is blind): ' + JSON.stringify(ctl));
    if (ctl.docs.length !== 2) fail2c(`GH-1081 control: want the guard's one heal reload after the notifications (2 documents), got ${ctl.docs.length}: ${JSON.stringify(ctl)}`);
  }
  await chrome.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await chrome.eval('(sessionStorage.clear(), true)').catch(() => {});
  if (ok2c) {
    console.log(`GH-1081 ResizeObserver-loop notification ignored at boot OK: ro 0 trips in 1 document (logged ${JSON.stringify(ro.logged)});`
      + ` rearm 1 trip; control tripped '${ctl.trips[0]}' and healed in ${ctl.docs.length} documents`);
  }
}
chrome.close();

// ---- 3) scripted boot keeps the classic pin (bit-comparable captures)
{
  // review r1 P2: derive from CDP_PORT (+1/+2) so the parallel-lane override
  // moves ALL of this suite's browsers, not just scenario 1's
  const chrome3 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT + 1 });
  if (!(await waitReady(chrome3))) fail('scripted boot never became ready');
  else {
    // GH-313 C3.2b: the async GI bake load settles on its OWN clock — poll
    // the state probe instead of the old fixed sleep(1500) window
    await evalSettled(chrome3, "__gi.state.look === 'default'");
    if (await chrome3.eval('__test.bootLook') !== 'green') fail('scripted bootLook is not green');
    if (await chrome3.eval('__gi.state.look') !== 'default') fail('scripted boot did not pin the classic GI look');
    // issue #48: scripted boots remove the overlay at PARSE time so every
    // committed capture fixture stays bit-identical
    if (await chrome3.eval('document.getElementById("ob-boot") !== null')) {
      fail('boot overlay present under the obtool stamp (capture fixtures would perturb)');
    }
    const px = await probeShotSettled(chrome3, (p) => p.green >= 0.1);
    if (!px || px.green < 0.1) fail(`scripted boot green cloth missing: ${JSON.stringify(px)}`);
    else console.log(`scripted pin OK: green ${px.green.toFixed(2)}`);
  }
  chrome3.close();
}

// ---- 4) composer render-scale symmetry (GH-263): a DPR-2 interactive boot
// must postFX-render at the SAME scale before and after a window resize.
// Pre-fix failure this arm red-proved: createPostFX handed EffectComposer a
// CSS-sized render target (boot scale 1x) while the composer's latent
// _pixelRatio — captured from the renderer, 2 here — multiplied the first
// setSize, so ANY resize flipped the whole chain to full-DPR (2x): two
// render qualities for one build and a 4x fragment cliff, invisible to every
// obtool-stamped suite (they all pin DPR 1). Policy under test: composer
// scale == renderer.getPixelRatio() — min(devicePixelRatio, 2) interactive,
// 1 scripted (the main.js retina pin).
{
  const chrome4 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=warm4`,
    { port: CDP_PORT + 2, tool: false });
  // metrics BEFORE the measured boot: override the session to DPR 2, then
  // re-navigate so the main.js pixel-ratio pin sees devicePixelRatio 2 from
  // the first frame (the arm-1b re-navigation pattern).
  await chrome4.send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await chrome4.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=dpr2` });
  const readScale = () => chrome4.eval(`(() => {
    const c = window.__dbg?.composer;
    if (!c) return null;
    return { rtw: c.renderTarget1.width, rth: c.renderTarget1.height,
      iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      rpr: window.__dbg.renderer.getPixelRatio() };
  })()`);
  if (!(await waitReady(chrome4))) fail('DPR-2 boot never became ready');
  else {
    await sleep(1000);
    const a = await readScale();
    if (!a) fail('composer probe missing (__dbg.composer — main.js GH-263 seam)');
    else if (a.dpr !== 2) fail(`DPR override not applied (devicePixelRatio ${a.dpr})`);
    else {
      // fire a REAL window resize (viewport change at the same DPR), re-read
      await chrome4.send('Emulation.setDeviceMetricsOverride',
        { width: 1216, height: 780, deviceScaleFactor: 2, mobile: false });
      await sleep(800);
      const b = await readScale();
      const sA = a.rtw / a.iw, sB = b.rtw / b.iw;
      if (!b || b.iw === a.iw) fail('resize never fired (innerWidth unchanged)');
      else if (sA !== sB) {
        fail(`composer scale asymmetric: boot ${sA}x (${a.rtw}×${a.rth} for `
          + `${a.iw}×${a.ih}) → post-resize ${sB}x (${b.rtw}×${b.rth} for ${b.iw}×${b.ih})`);
      } else if (sA !== a.rpr) {
        fail(`composer scale ${sA}x != renderer pixel ratio ${a.rpr}x `
          + '(policy: composer follows the renderer pin)');
      } else {
        console.log(`composer scale symmetric: ${sA}x at boot and post-resize `
          + `(renderer ${a.rpr}x, DPR ${a.dpr})`);
      }
    }
    // scripted twin at the SAME DPR-2 metrics: the obtool stamp must keep
    // both the renderer and the composer pinned at 1x so every committed
    // capture fixture stays bit-comparable (the main.js retina-pin law).
    await chrome4.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1&u=dpr2s` });
    if (!(await waitReady(chrome4))) fail('scripted DPR-2 boot never became ready');
    else {
      await sleep(1000);
      const s = await readScale();
      if (!s) fail('composer probe missing on the scripted boot');
      else if (s.rpr !== 1 || s.rtw !== s.iw) {
        fail(`scripted pin broken under DPR 2: renderer ${s.rpr}x, composer `
          + `${s.rtw}×${s.rth} for CSS ${s.iw}×${s.ih}`);
      } else {
        console.log(`scripted pin holds under DPR 2: renderer 1x, composer `
          + `${s.rtw}×${s.rth} == CSS`);
      }
    }
  }
  chrome4.close();
}
// ---- 5) locale-switch venue parity (GH-368): a real-user boot's VENUE
// register must survive a settings write that carries no look axis — the
// language switch is the canonical case (any first `set()` broadcasts, and
// GH-368 claimed that broadcast alone re-skinned the scene). The forensic
// verdict (issue closure): the product is CLEAN — the "flip" was the
// scripted-boot register (obtool stamp / ob-scripted sessionStorage carry →
// green look + wpa_generic pin) leaking into a capture tab, photographed
// after the language call and misattributed to it. This arm pins the truth
// permanently, three legs:
//   a. boot venue: diamond tournament_blue under sp (the arm-1 register);
//   b. set('language','zh-CN') relabels TEXT ONLY — table id, GI look,
//      center-felt pixel and cloth color-class fractions all hold, and the
//      write must not mint a scripted pin (the confound class);
//   c. no false suppression: a REAL look-axis write (fixture) still
//      re-skins — the venue is stable against unrelated keys, not frozen.
{
  const chrome5 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
    { port: CDP_PORT + 3, tool: false });
  if (!(await waitReady(chrome5))) fail('locale-parity boot never became ready');
  else {
    await evalSettled(chrome5, "__gi.state.look === 'tournament'");
    // center-felt probe: the playfield covers the viewport center at the
    // boot pose, so this samples CLOTH, never HUD text — the one signal
    // that separates "text relabeled" (legit) from "venue re-skinned"
    // (the GH-368 claim). ±2/channel absorbs settle jitter; the defect
    // class this guards moves the channel means by 40+.
    const feltPx = async () => {
      const { data } = await chrome5.send('Page.captureScreenshot', { format: 'png' });
      return chrome5.eval(`(async () => {
        const img = new Image(); img.src = 'data:image/png;base64,${data}';
        await img.decode();
        const o = document.createElement('canvas');
        o.width = img.width; o.height = img.height;
        const g = o.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(Math.floor(img.width / 2),
          Math.floor(img.height / 2), 1, 1).data;
        return [d[0], d[1], d[2]];
      })()`);
    };
    const near = (a, b, tol = 2) => a && b
      && a.every((v, i) => Math.abs(v - b[i]) <= tol);
    const table5 = () => chrome5.eval(
      `import('./scene/table.js').then((m) => m.activeTableId())`);
    // GH-1135 (KF-015): a fresh boot's camera GLIDES to the play anchor
    // (shellmover.js, 900 ms wall clock, exact landing) and the probe below
    // can pass mid-glide — it judges cloth FRACTIONS, which the glide barely
    // moves, while the center-felt pixel moves 3-4 levels along it. So the
    // "before" felt waits for the camera to HOLD: matrixWorld and fov
    // unchanged across STILL_FRAMES consecutive delivered frames (a frame
    // counts only when __test.renderedFrames() advanced — a held tick
    // renders nothing and moves nothing), within STILL_BOUND_MS. A camera
    // that never holds makes the parity UNJUDGEABLE: a red by name, never a
    // pass. The "after" felt is NOT re-gated: a camera the language switch
    // moved would be a defect of its own, and the parity must see it.
    const STILL_FRAMES = 10, STILL_BOUND_MS = 10000;
    const cameraStill = () => chrome5.eval(`new Promise((resolve) => {
      const t0 = performance.now(); let last = null, run = 0, frames = 0;
      let seen = window.__test.renderedFrames();
      const pose = (c) => [...c.matrixWorld.elements.slice(12, 15), c.fov]
        .map((v) => +v.toFixed(4));
      const tick = () => {
        const c = window.__dbg && window.__dbg.camera;
        const n = window.__test.renderedFrames();
        if (c && n !== seen) {
          seen = n; frames += 1;
          const sig = c.matrixWorld.elements.join(',') + '|' + c.fov;
          run = sig === last ? run + 1 : 1; last = sig;
          if (run >= ${STILL_FRAMES}) {
            resolve({ still: true, frames, ms: Math.round(performance.now() - t0), pose: pose(c) });
            return;
          }
        }
        if (performance.now() - t0 > ${STILL_BOUND_MS}) {
          resolve({ still: false, frames, run, ms: Math.round(performance.now() - t0), pose: c ? pose(c) : null });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })`);
    const camPose5 = () => chrome5.eval(`(() => { const c = window.__dbg && window.__dbg.camera;
      return c ? [...c.matrixWorld.elements.slice(12, 15), c.fov].map((v) => +v.toFixed(4)) : null; })()`);
    const before = await probeShotSettled(chrome5,
      (p) => p.lum >= 40 && p.blue >= 0.07);
    const still5 = await cameraStill();
    const feltBefore = await feltPx();
    if (!before || before.blue < 0.07) {
      fail(`locale-parity boot venue wrong: ${JSON.stringify(before)}`);
    } else if (!still5 || !still5.still) {
      fail(`locale-parity UNJUDGEABLE: the boot camera never held still for ${STILL_FRAMES} delivered frames `
        + `within ${STILL_BOUND_MS} ms (GH-1135): ${JSON.stringify(still5)}`);
    } else if (await table5() !== 'pool_pro_9ft') {
      fail('locale-parity boot is not on the settings-default table');
    } else {
      await chrome5.eval(`window.__settings.set('language', 'zh-CN'), true`);
      // the dictionary fetch + relabel are async — wait for the locale to
      // actually land before judging the venue (text change is EXPECTED)
      await evalSettled(chrome5,
        `window.__settings.get().language === 'zh-CN'`);
      await sleep(1500);
      const after = await probeShotSettled(chrome5,
        (p) => p.lum >= 40 && p.blue >= 0.07, 10);
      const feltAfter = await feltPx();
      if (await table5() !== 'pool_pro_9ft') {
        fail('language switch rebuilt the scene table (GH-368 re-skin class)');
      }
      if (await chrome5.eval("__gi.state.look") !== 'tournament') {
        fail('language switch moved the GI look off the boot register');
      }
      if (await chrome5.eval('sessionStorage.getItem("ob-scripted")') !== null) {
        fail('a settings write minted the ob-scripted pin (GH-368 confound class)');
      }
      if (!after || after.blue < 0.07 || after.green > 0.02
        || !near(feltBefore, feltAfter)) {
        fail(`language switch re-skinned the venue (GH-368): felt ${feltBefore}`
          + ` → ${feltAfter}, fractions ${JSON.stringify(after)}; camera `
          + `${JSON.stringify(still5.pose)} → ${JSON.stringify(await camPose5())}`);
      } else {
        console.log(`locale venue parity OK: felt ${feltAfter} held, blue `
          + `${after.blue.toFixed(2)}, green ${after.green.toFixed(2)} (camera `
          + `held ${STILL_FRAMES} frames after ${still5.ms} ms)`);
      }
      // leg c — the stability above must not be a frozen scene: a REAL
      // look-axis write still re-skins (fixture swap moves the whole rig)
      await chrome5.eval(`window.__settings.set('fixture', 'pendant_bar'), true`);
      await evalSettled(chrome5,
        `window.__lighting?.state?.().fixture === 'pendant_bar'`);
      await sleep(1500);
      const feltLit = await feltPx();
      if (near(feltAfter, feltLit)) {
        fail(`real look-axis change did not re-skin (false suppression): `
          + `felt ${feltAfter} → ${feltLit} under pendant_bar`);
      } else {
        console.log(`real look-axis re-skin OK: felt ${feltAfter} → ${feltLit}`);
      }
    }
    if (await chrome5.eval('__test.errors.length')) {
      fail('locale-parity arm app errors: '
        + JSON.stringify(await chrome5.eval('__test.errors')));
    }
  }
  chrome5.close();
}

// ---- 6) discipline-profile boots (GH-337 per-table-class bakes): a REAL
// user who left the app on snooker/carom re-opens it — the persisted
// profile (game + its kind-locked table at the top-level equipment spec,
// exactly what persist() writes on a discipline switch) must boot straight
// onto the discipline table WITH its class bake: sp look (real-user path),
// bakeClass resolved, uGiOn 1, the branded cloth actually painted (pixel
// fractions), zero console errors and zero footprint-fallback lines (the
// pre-337 renderer booted these profiles into the #52 pre-GI neutral).
{
  // clothHex = the exact FACTORY variant the discipline table must paint
  // (clothvisuals snooker_green / carom_blue), asserted through the
  // appliedClothVisual() seam — pixel fractions alone are family-level and
  // a wrong same-family variant would pass them (review r3); the pixel arm
  // stays as the render-sanity tripwire (the cloth is actually on screen).
  // `fixture` (GH-386): the persisted profile carries NO fixture keys —
  // exactly the pre-386 install shape — so the absent-key migration must
  // land it on the venue default: the class's own luminaire, boot-resolved
  // BEFORE gi.load (the maps must key to the true rig on the cold boot).
  const profiles = [
    // snooker lumFloor 18 (GH-489 R1): the pure-XW101 cloth re-solve
    // (clothvisuals snooker_green 0x041d08 — photo-family-exposure
    // albedo) drops the boot frame's MEAN luminance to ~31 under the
    // shipped venue rig (the rig's photo-family re-fit rides the
    // corner-rebuild round). This floor is a BLACK-FRAME tripwire, not
    // an exposure gate — a black/unrendered frame reads lum ≤ ~5, so 18
    // keeps a >3× margin while the calibrated identity (exact-hex seam +
    // olive fraction) carries the real verdict.
    { tag: 'snooker', game: 'snooker', table: 'wpbsa_snooker_12ft',
      cls: 'snooker_12ft', clothHex: 0x041d08, fixture: 'snooker_luminaire',
      lumFloor: 18,
      cloth: (px) => (px.olive >= 0.07
        ? null : `snooker_green cloth missing: olive ${px.olive.toFixed(3)}`) },
    { tag: 'carom', game: 'carom_3cushion', table: 'umb_carom_284',
      cls: 'carom_284', clothHex: 0x0e4f8e, fixture: 'carom_luminaire',
      lumFloor: 40,
      cloth: (px) => (px.blue >= 0.07
        ? null : `carom_blue cloth missing: blue ${px.blue.toFixed(3)}`) },
  ];
  const chrome5 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=disc0`,
    { port: CDP_PORT + 4, tool: false });
  const errors5 = [], giFallback5 = [];
  chrome5.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const line = params.args.map((a) => a.value ?? a.description).join(' ');
      if (params.type === 'error') errors5.push(line);
      if (line.includes('[gi] bake footprint')) giFallback5.push(line);
    } else if (method === 'Runtime.exceptionThrown') {
      errors5.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(chrome5))) fail('discipline-profile seed boot never became ready');
  for (const p of profiles) {
    // seed the persisted profile, then re-navigate — the boot must read it
    // cold (resolveBootTableId + settings.load), the arm-1b pattern
    await chrome5.eval(`localStorage.setItem('ob-settings-v1', JSON.stringify(
      { game: '${p.game}', equipment: { table_id: '${p.table}' } }))`);
    await chrome5.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?u=${p.tag}boot` });
    if (!(await waitReady(chrome5))) { fail(`${p.tag}-profile boot never became ready`); continue; }
    // poll the class-bake settle (review r7 — the GH-313 C3.2b law: a fixed
    // sleep window falsely fails healthy builds on a loaded runner)
    await evalSettled(chrome5,
      `window.__gi?.state?.bakeClass === '${p.cls}'`
      + ` && __gi.state.fixture === '${p.fixture}'`
      + ' && __gi.uniforms.uGiOn.value === 1');
    if (await chrome5.eval('__test.bootLook') !== 'tournament') {
      fail(`${p.tag}-profile boot lost the real-user tournament path`);
    }
    const gi = await chrome5.eval(`({ look: __gi.state.look,
      cls: __gi.state.bakeClass, fits: __gi.state.fits,
      on: __gi.uniforms.uGiOn.value, fx: __gi.state.fixture })`);
    if (gi.look !== 'tournament' || gi.cls !== p.cls || gi.fits !== true || gi.on !== 1) {
      fail(`${p.tag}-profile boot did not land the class bake: ${JSON.stringify(gi)}`);
    }
    // GH-386: the venue default resolved at BOOT (fixtureAuto absent →
    // migration lands auto → the class luminaire keyed into gi.load) and
    // the rig actually hangs it (lighting state auto + clearance)
    if (gi.fx !== p.fixture) {
      fail(`${p.tag}-profile boot gi fixture '${gi.fx}', want the venue `
        + `default '${p.fixture}' (GH-386 absent-key migration)`);
    }
    const lt5 = await chrome5.eval('window.__lighting?.state?.() ?? null');
    if (!lt5 || lt5.fixture !== p.fixture || lt5.auto !== true) {
      fail(`${p.tag}-profile boot lighting state is not the auto venue `
        + `default: ${JSON.stringify(lt5)}`);
    }
    // variant-exact cloth assertion (review r3): the applied FACTORY cloth
    // is the discipline variant, not just any same-family color
    const clothColor = await chrome5.eval(
      `import('/scene/table.js').then((t) => t.appliedClothVisual().color)`);
    if (clothColor !== p.clothHex) {
      fail(`${p.tag}-profile boot painted cloth 0x${clothColor?.toString(16)} `
        + `(want 0x${p.clothHex.toString(16)})`);
    }
    // poll the pixel probe too (review r8): GI state can settle before the
    // next rendered frame on a loaded runner — a single screenshot may
    // catch a black/previous frame (the probeShotSettled contract)
    const px = await probeShotSettled(chrome5,
      (q) => q.lum >= p.lumFloor && p.cloth(q) === null);
    if (!px || px.lum < p.lumFloor) {
      fail(`${p.tag}-profile scene not rendered: luminance `
        + `${px?.lum?.toFixed(1)} (floor ${p.lumFloor})`);
    } else {
      const clothErr = p.cloth(px);
      if (clothErr) fail(`${p.tag}-profile boot: ${clothErr}`);
      else {
        console.log(`${p.tag}-profile boot OK: bakeClass ${gi.cls}, uGiOn 1, `
          + `lum ${px.lum.toFixed(1)}, olive ${px.olive.toFixed(2)}, `
          + `blue ${px.blue.toFixed(2)}`);
      }
    }
  }
  if (giFallback5.length) {
    fail('discipline-profile boots hit the footprint fallback (GH-337): '
      + giFallback5[0]);
  }
  if (errors5.length) {
    fail('console errors (discipline-profile boots): '
      + errors5.slice(0, 3).join(' | '));
  }
  chrome5.close();
}

// ---- 7) carom profile boot (GH-383): a REAL-USER boot whose PERSISTED
// profile plays carom_3cushion under the two-cue preset with the 'marked'
// second-ball paint — the pocketless table must render, the fold must
// reach the carom break address (break_spot pending, Art 23.1(c)) and the
// visual-fork key must survive the load-path sanitation. This is the
// upgrade-path arm: an existing carom player's profile meets the GH-383
// modules for the first time on this boot.
{
  const errors6 = [];
  const chrome6 = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 5, tool: false });
  chrome6.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors6.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errors6.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(chrome6))) fail('carom-profile pre-boot never became ready');
  else {
    await chrome6.eval(`(() => {
      const blob = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
      blob.game = 'carom_3cushion';
      blob.variants = { carom_3cushion: 'umb-carom-2cue' };
      blob.caromSecondBall = 'marked';
      localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(chrome6))) fail('carom-profile boot never became ready');
    else {
      await sleep(1500);
      const snap = await chrome6.eval(`({
        game: window.__rules.game(),
        state: __test.state(),
        right: window.__rules.placementRight(),
        ms: window.__rules.matchState(),
        c2b: window.__settings.get().caromSecondBall,
        balls: __test.balls().length,
        pockets: window.__rules.pockets().length,
      })`);
      if (snap.game !== 'carom_3cushion') fail('carom profile did not boot carom: ' + snap.game);
      if (snap.balls !== 3 || snap.pockets !== 0) {
        fail(`carom boot scene wrong: ${snap.balls} balls, ${snap.pockets} pockets`);
      }
      if (snap.state !== 'BALL_IN_HAND' || snap.right !== 'carom_break'
        || snap.ms?.pendingDecision?.kind !== 'break_spot') {
        fail('carom boot did not reach the break address: ' + JSON.stringify(
          { state: snap.state, right: snap.right, pending: snap.ms?.pendingDecision }));
      }
      if (snap.c2b !== 'marked') {
        fail('caromSecondBall did not survive the load path: ' + snap.c2b);
      }
      const px6 = await probeShotSettled(chrome6, (p) => p.lum >= 40 && p.blue >= 0.07);
      if (!px6 || px6.lum < 40) {
        fail(`carom scene not rendered: luminance ${px6?.lum?.toFixed(1)}`);
      } else if (px6.blue < 0.07) {
        fail(`carom blue cloth missing: blue ${px6.blue.toFixed(3)}`);
      } else {
        console.log(`carom profile boot renders: lum ${px6.lum.toFixed(1)}, `
          + `blue ${px6.blue.toFixed(2)} (marked-white fork persisted)`);
      }
      if (await chrome6.eval('__test.errors.length')) {
        fail('carom-profile boot app errors: '
          + JSON.stringify(await chrome6.eval('__test.errors')));
      }
      if (errors6.length) {
        fail('console errors (carom-profile boot): ' + errors6.slice(0, 3).join(' | '));
      }
    }
  }
  chrome6.close();
}

// ---- 8) fresh-profile carom default (GH-383 owner decision 2026-08-06):
// a FIRST-EVER boot (no persisted blob) seeds the carom discipline with
// the two-cue professional standard (umb-carom-2cue — UMB
// world-competition practice), while an EXISTING blob with no carom
// variants key keeps the v1 family default (absent key — NO silent
// migration). Both halves pin settings.js load(); the fold-level v2
// behavior itself is e2e-carom V-block territory.
{
  const errors7 = [];
  const chrome7 = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  chrome7.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors7.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errors7.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(chrome7))) fail('fresh-profile boot never became ready');
  else {
    // half A: the fresh boot carries the seed (and the picker default
    // for every OTHER discipline stays the family default)
    const seeded = await chrome7.eval(
      `window.__settings.variantFor('carom_3cushion')`);
    if (seeded !== 'umb-carom-2cue') {
      fail('fresh profile must seed the two-cue carom standard: ' + seeded);
    }
    const nineSel = await chrome7.eval(
      `window.__settings.variantFor('nine_ball')`);
    if (nineSel !== null) {
      fail('the seed must be carom-scoped (nine_ball selected: ' + nineSel + ')');
    }
    // a VIRGIN boot writes no blob (the issue-#14 hermetic doctrine —
    // the boot write-back only sanitizes EXISTING blobs); the seed is
    // load-derived until the first real persist, then explicit
    const virgin = await chrome7.eval(
      `localStorage.getItem('ob-settings-v1') === null`);
    if (virgin !== true) {
      fail('a virgin boot must not write a blob (issue-#14 doctrine)');
    }
    await chrome7.eval(`window.__settings.set('soundOn', false), true`);
    const persisted = await chrome7.eval(
      `JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}')
        ?.variants?.carom_3cushion ?? null`);
    if (persisted !== 'umb-carom-2cue') {
      fail('the fresh seed must persist explicitly on the first real '
        + 'persist: ' + persisted);
    }
    // half B: an EXISTING carom profile with NO variants key (a pre-383
    // player) keeps the v1 family default — no silent migration
    await chrome7.eval(`(() => {
      localStorage.setItem('ob-settings-v1',
        JSON.stringify({ game: 'carom_3cushion' }));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(chrome7))) fail('existing-profile boot never became ready');
    else {
      const kept = await chrome7.eval(
        `window.__settings.variantFor('carom_3cushion')`);
      if (kept !== null) {
        fail('an existing blob without a carom key must keep the v1 '
          + 'family default (no silent migration): ' + kept);
      }
      // GH-490 r31 harness hardening (the storm-aware law — a fixed
      // sleep is never a settle proof): the break_spot decision lands
      // 7-118 ms AFTER __test.ready (measured on this machine), so the
      // old immediate read raced it and red-fired under load (batteries
      // 3/4 + standalone repro; the scenario itself is sound — the
      // probe with a settle wait reads break_spot every time).  Bounded
      // poll (5 s): a genuinely missing break address still fails.
      let snap7 = null;
      for (let i7 = 0; i7 < 50; i7++) {
        snap7 = await chrome7.eval(`({
          game: window.__rules.game(),
          ms: window.__rules.matchState(),
        })`);
        if (snap7.game === 'carom_3cushion'
          && snap7.ms?.pendingDecision?.kind === 'break_spot') break;
        await sleep(100);
      }
      if (snap7.game !== 'carom_3cushion'
        || snap7.ms?.pendingDecision?.kind !== 'break_spot') {
        fail('existing v1 carom profile did not reach its break address: '
          + JSON.stringify({ game: snap7.game,
            pending: snap7.ms?.pendingDecision }));
      }
      console.log('fresh-profile carom default OK: fresh boot seeds '
        + 'umb-carom-2cue (persisted explicitly, carom-scoped); an '
        + 'existing keyless blob stays on the v1 family default');
    }
    if (errors7.length) {
      fail('console errors (fresh-profile default): '
        + errors7.slice(0, 3).join(' | '));
    }
  }
  chrome7.close();
}

// ---- arm 9 (GH-382 decision 1, owner sign-off on issue #382 2026-08-07):
// the snooker live default is a READ-time resolution in settings.variantFor
// — wpbsa-snooker-full for EVERY unpinned live frame (fresh AND returning
// profiles; contrast the GH-383 carom fresh-profile SEED above), never
// persisted by the default itself; the explicit v1 alias pin persists and
// survives a reload. The replay-aware half (legacy links resolve v1) is
// e2e-variants V6 territory; the fold-level flip is e2e-snooker V2-5.
{
  const errors9 = [];
  const chrome9 = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 7, tool: false });
  chrome9.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors9.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errors9.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(chrome9))) fail('snooker-default boot never became ready');
  else {
    // half A: a virgin profile resolves the completion preset live,
    // writes NOTHING (resolution, not a seed — the issue-#14 doctrine).
    // POLLED: the default is chain-gated (review r33) — the read flips
    // from null when the GH-382 adapter chain settles.
    let dflt = null;
    for (let i = 0; i < 50 && dflt !== 'wpbsa-snooker-full'; i++) {
      dflt = await chrome9.eval(`window.__settings.variantFor('snooker')`);
      if (dflt !== 'wpbsa-snooker-full') await sleep(200);
    }
    if (dflt !== 'wpbsa-snooker-full') {
      fail('fresh profile must resolve the snooker completion preset: '
        + dflt);
    }
    const virgin = await chrome9.eval(
      `localStorage.getItem('ob-settings-v1') === null`);
    if (virgin !== true) {
      fail('the snooker live default must not write a blob (resolution, '
        + 'not a seed)');
    }
    // half B: an EXISTING keyless blob (a pre-flip player) gets the flip
    // too — decision 1 covers frames, not just fresh profiles
    await chrome9.eval(`(() => {
      localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'snooker' }));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(chrome9))) fail('keyless snooker boot never became ready');
    else {
      let flipped = null;
      for (let i = 0; i < 50 && flipped !== 'wpbsa-snooker-full'; i++) {
        flipped = await chrome9.eval(
          `window.__settings.variantFor('snooker')`);
        if (flipped !== 'wpbsa-snooker-full') await sleep(200);
      }
      if (flipped !== 'wpbsa-snooker-full') {
        fail('an existing keyless blob must resolve the flipped live '
          + 'default: ' + flipped);
      }
      // the recorder/fold pair (review r33 P2): the chain-gated default
      // can settle AFTER the boot resetLog pinned the wire — the flow.js
      // readiness catch-up re-racks the shotless session so the recorded
      // variant and the judging fold can NEVER disagree. Both surfaces
      // must read the completion preset once the boot settles.
      const pair = await chrome9.eval(`(() => {
        const wire = window.__share?.log?.()?.variant ?? null;
        const fold = window.__rules?.variant?.()?.preset ?? null;
        return JSON.stringify({ wire, fold });
      })()`);
      if (pair !== JSON.stringify({ wire: 'wpbsa-snooker-full',
        fold: 'wpbsa-snooker-full' })) {
        fail('keyless snooker boot must settle with the recorder pin and '
          + 'the judging fold AGREEING on the completion preset: ' + pair);
      }
      // half C: the explicit v1 alias pin persists and survives a reload
      // (the completed rules stay one pick away in EITHER direction)
      const pinned = await chrome9.eval(
        `window.__settings.changeVariant('snooker', 'wpbsa-snooker')`);
      if (pinned !== true) fail('explicit v1 alias pin refused');
      const persisted = await chrome9.eval(
        `JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}')
          ?.variants?.snooker ?? null`);
      if (persisted !== 'wpbsa-snooker') {
        fail('the explicit v1 alias must persist: ' + persisted);
      }
      await chrome9.eval('location.reload(), true');
      await sleep(1200);
      if (!(await waitReady(chrome9))) fail('pinned snooker boot never became ready');
      else {
        const kept = await chrome9.eval(
          `window.__settings.variantFor('snooker')`);
        if (kept !== 'wpbsa-snooker') {
          fail('the persisted v1 alias must survive a reload: ' + kept);
        }
        // half D (review r34 P2, the persisted twin): an EXPLICITLY
        // persisted completion preset is chain-bound too — the boot
        // settles with the recorder pin and the judging fold agreeing
        // on the full preset (the same catch-up rerack law as the
        // default; pre-settle the read resolves v1, so no shot can
        // ever be judged v1 under a full-recorded wire)
        await chrome9.eval(`(() => {
          localStorage.setItem('ob-settings-v1', JSON.stringify({
            game: 'snooker',
            variants: { snooker: 'wpbsa-snooker-full' } }));
          location.reload();
          return true;
        })()`);
        await sleep(1200);
        if (!(await waitReady(chrome9))) {
          fail('persisted-full snooker boot never became ready');
        } else {
          let pf = null;
          for (let i = 0; i < 50 && pf !== 'wpbsa-snooker-full'; i++) {
            pf = await chrome9.eval(
              `window.__settings.variantFor('snooker')`);
            if (pf !== 'wpbsa-snooker-full') await sleep(200);
          }
          if (pf !== 'wpbsa-snooker-full') {
            fail('persisted completion preset must resolve once the '
              + 'chain settles: ' + pf);
          }
          const pair2 = await chrome9.eval(`(() => {
            const wire = window.__share?.log?.()?.variant ?? null;
            const fold = window.__rules?.variant?.()?.preset ?? null;
            return JSON.stringify({ wire, fold });
          })()`);
          if (pair2 !== JSON.stringify({ wire: 'wpbsa-snooker-full',
            fold: 'wpbsa-snooker-full' })) {
            fail('persisted-full snooker boot must settle with the '
              + 'recorder pin and the judging fold AGREEING: ' + pair2);
          }
          console.log('snooker live-default OK: virgin + keyless '
            + 'profiles resolve wpbsa-snooker-full with no blob write; '
            + 'the explicit v1 alias persists and survives reload; the '
            + 'persisted completion preset settles recorder/fold '
            + 'coherent (GH-382 decision 1 + review r34)');
        }
      }
    }
    if (errors9.length) {
      fail('console errors (snooker live default): '
        + errors9.slice(0, 3).join(' | '));
    }
  }
  chrome9.close();
}

// ---- arm 10 (GH-441): the Display 'Default camera' control is LIVE. A
// persisted camera:'overhead' real-user boot poses the DERIVED overhead
// register (top-down: phi at the preset polar floor, target table center,
// tightened fov, radius fit from the ACTIVE bed + fov + viewport aspect —
// camerapresets.js overheadRegister), a reload re-lands the same pose, a
// SCRIPTED boot of the same profile pins the orbit pose (capture/baseline
// law), and a fresh 'orbit' profile stays BIT-IDENTICAL to the pre-441
// boot triple. RED (pre-fix): the overhead boot pose is byte-equal to the
// orbit pose — the issue's dead-control probe, desktop AND phone.
const ORBIT_BOOT = { pos: [-1.8346, 1.3934, 1.4558], fov: 40 }; // issue #441 probe triple
const poseSnap = (c) => c.eval(`(() => {
  const cam = window.__dbg.camera, s = window.__dbg.orbit.state;
  return { pos: cam.position.toArray().map((v) => +v.toFixed(4)),
    fov: cam.fov, phi: s.phi, theta: s.theta, radius: s.radius,
    target: s.target.toArray() };
})()`);
// bed-corner frame fit: project the four cushion-nose bed corners through
// the LIVE camera matrices (no page-side three import needed) — every
// corner must land inside NDC with margin, and the frame must actually be
// FILLED by the bed (coverage floor), so the fit law is probed without
// mirroring the register's formula into the suite.
const cornerFit = (c) => c.eval(`(() => {
  const cam = window.__dbg.camera;
  const L = __test.bed().tableLength, W = __test.bed().tableWidth;
  const xf = (e, v) => [
    e[0]*v[0] + e[4]*v[1] + e[8]*v[2] + e[12]*v[3],
    e[1]*v[0] + e[5]*v[1] + e[9]*v[2] + e[13]*v[3],
    e[2]*v[0] + e[6]*v[1] + e[10]*v[2] + e[14]*v[3],
    e[3]*v[0] + e[7]*v[1] + e[11]*v[2] + e[15]*v[3]];
  const proj = cam.projectionMatrix.elements;
  const view = cam.matrixWorldInverse.elements;
  let maxA = 0;
  const pts = [[L/2, 0, W/2], [L/2, 0, -W/2], [-L/2, 0, W/2], [-L/2, 0, -W/2]];
  const ndc = pts.map((p) => {
    const h = xf(proj, xf(view, [p[0], p[1], p[2], 1]));
    const n = [h[0] / h[3], h[1] / h[3]];
    maxA = Math.max(maxA, Math.abs(n[0]), Math.abs(n[1]));
    return n.map((v) => +v.toFixed(3));
  });
  return { ndc, maxA: +maxA.toFixed(3), L, W };
})()`);
{
  const errors10 = [];
  // OK-line gate: run-gate's arm counter harvests ok/PASS lines — the
  // summary lines below must never print over a failed half.
  const exitBefore10 = process.exitCode;
  const armClean = () => process.exitCode === exitBefore10;
  const chrome10 = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 8, tool: false });
  chrome10.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors10.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errors10.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(chrome10))) fail('camera-register pre-boot never became ready');
  else {
    // 031 re-baseline (FR-011): this arm pins the D15 GAMEPLAY camera
    // registers, which live on the straight-to-AIM boot branch under the
    // shell contract (a key-less real-user boot now settles into the shell
    // instead) — seed the explicit preference so every leg below keeps
    // probing exactly the pre-031 gameplay poses, byte-for-byte.
    // AWAIT the fresh boot's own first-arrival write FIRST (it lands at
    // the overlay-fade handoff, racing a seed placed right after ready —
    // the write's in-memory startAtTable:false clobbered an early seed
    // under load; observed intermittent 2026-08-13).
    for (let i = 0; i < 50; i++) {
      if (await chrome10.eval(
        `localStorage.getItem('ob-shell-v1') !== null`).catch(() => false)) break;
      await sleep(200);
    }
    await chrome10.eval(`(() => {
      localStorage.setItem('ob-shell-v1', JSON.stringify(
        { v: 1, lastPlace: 'play', startAtTable: true }));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(chrome10))) fail('camera-register table boot never became ready');
    await sleep(800);
    // half A: fresh profile = orbit default, BIT-identical pre-441 pose
    const fresh = await poseSnap(chrome10);
    if (JSON.stringify(fresh.pos) !== JSON.stringify(ORBIT_BOOT.pos)
      || fresh.fov !== ORBIT_BOOT.fov) {
      fail('fresh-profile boot pose drifted off the pre-441 orbit triple: '
        + JSON.stringify(fresh));
    }
    // half B: persisted overhead boots the derived register (RED: the
    // dead control leaves this byte-equal to the orbit triple)
    await chrome10.eval(`(() => {
      const blob = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
      blob.camera = 'overhead';
      localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(chrome10))) fail('overhead-profile boot never became ready');
    else {
      await sleep(800);
      const over = await poseSnap(chrome10);
      if (JSON.stringify(over.pos) === JSON.stringify(ORBIT_BOOT.pos)) {
        fail('overhead profile boots the ORBIT pose — dead control '
          + '(GH-441 red probe): ' + JSON.stringify(over));
      }
      if (Math.abs(over.phi - 0.16) > 1e-6 || Math.abs(over.theta) > 1e-6
        || over.target.some((v) => Math.abs(v) > 1e-6)) {
        fail('overhead register shape wrong (want phi 0.16, theta 0, '
          + 'target origin): ' + JSON.stringify(over));
      }
      if (!(over.fov < 39 && over.fov > 5)) {
        fail(`overhead fov not tightened: ${over.fov}`);
      }
      const fit = await cornerFit(chrome10);
      if (fit.ndc.some((n) => Math.abs(n[0]) > 0.97 || Math.abs(n[1]) > 0.97)) {
        fail('overhead framing clips the bed: ' + JSON.stringify(fit));
      }
      if (fit.maxA < 0.6) {
        fail('overhead framing wastes the viewport (coverage '
          + fit.maxA + ' < 0.6): ' + JSON.stringify(fit));
      }
      // the scene must still RENDER from up there (GH-381 occluder-fade
      // dissolves the lamp; a black or lamp-blocked frame fails the same
      // pixel law as the boot arm)
      const px10 = await probeShotSettled(chrome10, (p) => p.lum >= 40 && p.blue >= 0.07);
      if (!px10 || px10.lum < 40 || px10.blue < 0.07) {
        fail(`overhead boot scene not rendered: ${JSON.stringify(px10)}`);
      }
      // half C: reload persists — the same derived pose, byte-compared
      await chrome10.eval('location.reload(), true');
      await sleep(1200);
      if (!(await waitReady(chrome10))) fail('overhead reload never became ready');
      else {
        await sleep(800);
        const again = await poseSnap(chrome10);
        if (JSON.stringify(again) !== JSON.stringify(over)) {
          fail('overhead pose did not survive reload: '
            + JSON.stringify({ over, again }));
        }
      }
      // half D: a SCRIPTED boot of the SAME overhead profile pins the
      // orbit pose (the bootLook capture-baseline law) — offline renders
      // and committed fixtures stay bit-comparable under any profile.
      // The persisted GAME makes it the review-r2 scenario: the keyless
      // snooker profile triggers the ASYNC readiness catch-up rerack
      // (GH-382 flow), whose fresh-table signal must NOT re-home a
      // scripted session that never explicitly flipped the control.
      await chrome10.eval(`(() => {
        const blob = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
        blob.game = 'snooker';
        localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
        location.href = 'app.html?obtool=1&u=camreg';
        return true;
      })()`);
      await sleep(1200);
      if (!(await waitReady(chrome10))) fail('scripted camera-pin boot never became ready');
      else {
        await sleep(3000); // past the boot catch-up rerack window
        const pinned = await poseSnap(chrome10);
        if (JSON.stringify(pinned.pos) !== JSON.stringify(ORBIT_BOOT.pos)
          || pinned.fov !== ORBIT_BOOT.fov) {
          fail('scripted boot must pin the orbit pose regardless of the '
            + 'persisted register: ' + JSON.stringify(pinned));
        }
        if (armClean()) {
          console.log('camera register OK (desktop): orbit bit-identical, '
            + `overhead derived (r ${over.radius.toFixed(3)}, fov `
            + `${over.fov.toFixed(2)}, coverage ${fit.maxA}), reload `
            + 'persists, scripted pin holds');
        }
      }
    }
    if (await chrome10.eval('__test.errors.length')) {
      fail('camera-register app errors: '
        + JSON.stringify(await chrome10.eval('__test.errors')));
    }
    if (errors10.length) {
      fail('console errors (camera register): ' + errors10.slice(0, 3).join(' | '));
    }
  }
  chrome10.close();

  // phone half (the issue names desktop AND phone): real-user coarse boot,
  // landscape first (long axis on screen-x), then a portrait reboot flips
  // the register's axis mapping (theta π/2) and re-fits — the aspect
  // branch is structural, not per-class.
  const errorsP = [];
  const phone = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 9, tool: false });
  phone.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errorsP.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errorsP.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(phone))) fail('phone camera-register pre-boot never became ready');
  else {
    // 031 re-baseline: same straight-to-AIM seed as the desktop half above
    // (same first-arrival-write await — the seed must not race the boot)
    for (let i = 0; i < 50; i++) {
      if (await phone.eval(
        `localStorage.getItem('ob-shell-v1') !== null`).catch(() => false)) break;
      await sleep(200);
    }
    await phone.eval(`(() => {
      localStorage.setItem('ob-shell-v1', JSON.stringify(
        { v: 1, lastPlace: 'play', startAtTable: true }));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(phone))) fail('phone camera-register table boot never became ready');
    await sleep(800);
    const freshP = await poseSnap(phone);
    if (JSON.stringify(freshP.pos) !== JSON.stringify(ORBIT_BOOT.pos)
      || freshP.fov !== ORBIT_BOOT.fov) {
      fail('phone fresh-profile boot pose drifted off the pre-441 orbit '
        + 'triple: ' + JSON.stringify(freshP));
    }
    await phone.eval(`(() => {
      const blob = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
      blob.camera = 'overhead';
      localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(phone))) fail('phone overhead boot never became ready');
    else {
      await sleep(800);
      const overP = await poseSnap(phone);
      if (JSON.stringify(overP.pos) === JSON.stringify(ORBIT_BOOT.pos)) {
        fail('phone overhead profile boots the ORBIT pose — dead control '
          + '(GH-441 red probe): ' + JSON.stringify(overP));
      }
      if (Math.abs(overP.phi - 0.16) > 1e-6 || Math.abs(overP.theta) > 1e-6) {
        fail('phone landscape overhead register shape wrong: '
          + JSON.stringify(overP));
      }
      const fitP = await cornerFit(phone);
      if (fitP.ndc.some((n) => Math.abs(n[0]) > 0.97 || Math.abs(n[1]) > 0.97)
        || fitP.maxA < 0.6) {
        fail('phone landscape overhead framing wrong: ' + JSON.stringify(fitP));
      }
      // portrait reboot: the long axis flips onto screen-y
      await setPhoneMetrics(phone,
        { width: 390, height: 844, deviceScaleFactor: 3, maxTouchPoints: 5 });
      await phone.eval('location.reload(), true');
      await sleep(1200);
      if (!(await waitReady(phone))) fail('phone portrait overhead boot never became ready');
      else {
        await sleep(800);
        const port = await poseSnap(phone);
        if (Math.abs(port.phi - 0.16) > 1e-6
          || Math.abs(port.theta - Math.PI / 2) > 1e-6) {
          fail('portrait overhead register must map the long axis to '
            + 'screen-y (theta π/2): ' + JSON.stringify(port));
        }
        const fitPort = await cornerFit(phone);
        if (fitPort.ndc.some((n) => Math.abs(n[0]) > 0.97 || Math.abs(n[1]) > 0.97)
          || fitPort.maxA < 0.6) {
          fail('portrait overhead framing wrong: ' + JSON.stringify(fitPort));
        }
        // rotate-back re-home (GH-441 resize law): phones gate portrait
        // play behind the rotate prompt, so a portrait boot MUST re-derive
        // the landscape register the moment the player turns the phone —
        // while the rig still sits exactly at home a resize re-applies,
        // landing byte-equal to the landscape boot register above.
        await setPhoneMetrics(phone,
          { width: 844, height: 390, deviceScaleFactor: 3, maxTouchPoints: 5 });
        let rot = null;
        for (let i = 0; i < 25; i++) {
          await sleep(200);
          rot = await poseSnap(phone);
          if (JSON.stringify(rot) === JSON.stringify(overP)) break;
        }
        if (JSON.stringify(rot) !== JSON.stringify(overP)) {
          fail('rotate-back did not re-derive the landscape register: '
            + JSON.stringify({ rot, want: overP }));
        }
        if (armClean()) {
          console.log('camera register OK (phone): landscape '
            + `(r ${overP.radius.toFixed(3)}, fov ${overP.fov.toFixed(2)}) + `
            + `portrait (theta π/2, fov ${port.fov.toFixed(2)}, coverage `
            + `${fitPort.maxA}) + rotate-back re-home byte-equal`);
        }
      }
    }
    if (errorsP.length) {
      fail('console errors (phone camera register): '
        + errorsP.slice(0, 3).join(' | '));
    }
  }
  phone.close();
}

// ---- arm 11 (GH-491, build 18): heyball profile boot — a REAL-USER boot
// whose PERSISTED profile plays heyball must land on the Chinese
// eight-ball table (chinese8_pro_9ft — the entry's ONLY class table, adopted by
// the per-game pairing default), rack the II.4 fifteen, and reach the
// break address (opening kitchen BALL_IN_HAND behind the head string,
// WPA Heyball II.6(b)). The fold-level rules are e2e-heyball territory;
// this arm pins the persisted-boot path (settings load → catalog pairing
// → rack composition → the GH-370 opening grant catch-ups).
{
  const errors11 = [];
  const chrome11 = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 10, tool: false });
  chrome11.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors11.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errors11.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  if (!(await waitReady(chrome11))) fail('heyball-profile pre-boot never became ready');
  else {
    await chrome11.eval(`(() => {
      const blob = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
      blob.game = 'heyball';
      localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(chrome11))) fail('heyball-profile boot never became ready');
    else {
      // the opening grant lands on a macrotask after the boot rack (and
      // the rules registry import can race it) — poll to the address.
      // GH-489 W6-finish: the poll must cover the WHOLE address — the
      // state flips to BALL_IN_HAND one macrotask before the rules
      // matchState phase lands, so a state-only poll reads
      // { state: BALL_IN_HAND, right: kitchen, phase: undefined } and
      // red-flags a healthy boot (reproduced on main @4ce1f5b6, same
      // signature; the arm's own comment already named the race).
      for (let i = 0; i < 40; i++) {
        const at11 = await chrome11.eval(
          `(__test.state() === 'BALL_IN_HAND'
            && window.__rules.placementRight() === 'kitchen'
            && window.__rules.matchState()?.phase === 'break')`);
        if (at11) break;
        await sleep(250);
      }
      const snap = await chrome11.eval(`({
        game: window.__rules.game(),
        state: __test.state(),
        right: window.__rules.placementRight(),
        ms: window.__rules.matchState(),
        table: __test.equipment()?.table_id ?? null,
        balls: __test.balls().length,
        cueY: __test.balls().find((b) => b.id === 0)?.pos?.[0],
      })`);
      if (snap.game !== 'heyball') fail('heyball profile did not boot heyball: ' + snap.game);
      if (snap.table !== 'chinese8_pro_9ft') {
        fail('heyball boot must rack on chinese8_pro_9ft (WPA Heyball II.3(a)): '
          + snap.table);
      }
      if (snap.balls !== 16) fail(`heyball boot ball count wrong: ${snap.balls}`);
      if (snap.state !== 'BALL_IN_HAND' || snap.right !== 'kitchen'
        || snap.ms?.phase !== 'break') {
        fail('heyball boot did not reach the break address: ' + JSON.stringify(
          { state: snap.state, right: snap.right, phase: snap.ms?.phase }));
      }
      if (!(snap.cueY <= -0.635 - 1e-6 + 1e-12)) {
        fail(`heyball break address ON/below the head string (kernel y = ${snap.cueY})`);
      }
      // GH-695 recalibration: the pre-695 thresholds (lum 40 / blue 0.07)
      // were measured on the split-brain Diamond bed this boot used to
      // BUILD under the heyball kernel (the defect itself). The real
      // chinese8_pro_9ft + snooker_napped scene reads lum ≈ 35, olive
      // (the snooker_green family class) ≈ 0.25, blue ≈ 0.004 under the
      // venue rig — lum 18 is the snooker arm's black-frame tripwire; the
      // built scene table is pinned explicitly (scene id = kernel id).
      const built11 = await chrome11.eval(
        `import('/scene/table.js').then((m) => m.activeTableId())`);
      if (built11 !== 'chinese8_pro_9ft') {
        fail(`heyball boot built scene table ${built11} under the chinese8_pro_9ft kernel`);
      }
      const px11 = await probeShotSettled(chrome11,
        (p) => p.lum >= 18 && p.olive >= 0.07);
      if (!px11 || px11.lum < 18) {
        fail(`heyball scene not rendered: luminance ${px11?.lum?.toFixed(1)}`);
      } else if (px11.olive < 0.07) {
        fail(`heyball napped-green cloth missing: olive ${px11.olive.toFixed(3)} `
          + `blue ${px11.blue.toFixed(3)}`);
      } else {
        console.log(`heyball profile boot OK: chinese8_pro_9ft built + break address, `
          + `lum ${px11.lum.toFixed(1)}, olive ${px11.olive.toFixed(2)}`);
      }
      if (await chrome11.eval('__test.errors.length')) {
        fail('heyball-profile boot app errors: '
          + JSON.stringify(await chrome11.eval('__test.errors')));
      }
      if (errors11.length) {
        fail('console errors (heyball-profile boot): '
          + errors11.slice(0, 3).join(' | '));
      }
    }
  }
  chrome11.close();
}

// ---- 12) GH-694 boot-overlay HOLD LAW: a 3G-class first visit keeps the
// overlay until the shell (never the raw pre-shell HUD), shows the honest
// slow register at 30 s, and a wasm 404 lands the failure card with Retry
// (legs + oracle live in e2e-userboot-3g.mjs; OB_E2E_3G_LEGS adds slow3g).
await runBoot3gArm({ PORT, CDP_PORT: CDP_PORT + 11, fail });

// ---- 12b) GH-715 (S4 journey QA round 3): the overlay's shell-arrival hold
// keys on the arrival SIGNAL, not a 1.6 s wall clock — delayed-shell / warm-
// cache / fast / rejected-import legs (e2e-userboot-arrival.mjs; its header
// documents the oracle; standalone-runnable for red/green isolation).
await runArrivalArm({ PORT, CDP_PORT: CDP_PORT + 16, fail });

// ---- 12c) GH-1115: the overlay's slow register and stall card count IDLE
// time only (a parked boot with a long busy spin cards only after the idle
// bound; a dead boot still cards; the slow register follows the same law),
// and main.js's scene-build yields show 'Table & lighting' before buildRoom
// on a 4x-CPU boot (legs + oracle live in e2e-userboot-stall.mjs).
await runBootStallArm({ PORT, CDP_PORT: CDP_PORT + 18, fail });

// ---- BOOT-FIRSTFRAME (GH-668 S5 slice 2 G6, B-SH03 / owner Q1 default B):
// the overlay is the hall's first frame — at rest (opacity 1, no keyframes)
// the moment it exists, the wordmark inside the viewport at 1440 and 844
// before the web font settles, one stage row painted per stage, the exit
// on the t-med rung (legs + judge live in e2e-userboot-firstframe.mjs).
await runBootFirstFrameArm({ PORT, CDP_PORT: CDP_PORT + 17, fail });

// ---- arm 13 (GH-695 / GH-701, S4 journey-QA round 2; arm 12 is GH-694's
// throttled-boot module): PARTIAL-profile
// FIRST boot. A persisted ob-settings-v1 blob that names a non-pool game
// but carries no in-class equipment (game only / a pool table id / an
// empty equipmentByGame entry) must, on its FIRST boot, (a) build the
// game's CLASS table in the scene — resolveBootTableId's class rule: the
// built id === the kernel table id, the GI bake names the class scene,
// every ball rests inside the built playing surface, the pixels read the
// class cloth (GH-695: the 9-ft blue Diamond bed used to render under the
// 12-ft snooker / 2.84 m carom kernel until the SECOND boot); and (b)
// load the DISCIPLINE kit into settings — load() no longer pre-fills the
// pool kit, so the tuple deep-equals the card-commit pairing, the HUD cue
// select reads the discipline cue, and heyball's kernel composes the
// card-commit cloth/cushion (GH-701: Simonis 860 / Aramith pool / Stronge /
// standard used to ride under the class-forced table, and never healed).
// Controls: empty storage still boots pool_pro_9ft with 10 balls; an
// explicit legal id in the seed still wins on its axis (GH-283 decision 2
// grandfathering); the app-written blob is byte-identical across a reboot.
// The phone register re-runs the first seed (same main.js boot path).
{
  const errors12 = [];
  const gi12 = [];
  const chrome12 = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 14, tool: false });
  chrome12.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const s = params.args.map((a) => a.value ?? a.description).join(' ');
      if (/\[gi\]/.test(s)) gi12.push(s);
      if (params.type === 'error') errors12.push(s);
    } else if (method === 'Runtime.exceptionThrown') {
      errors12.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  // reboot on a seeded (or emptied) storage; a page sentinel guards the
  // ready poll against the OLD document's __test.ready (verify precedent)
  const readyAfterReload = async (c) => {
    for (let i = 0; i < 300; i++) {
      await sleep(200);
      try {
        if (await c.eval('window.__ob12 === undefined && window.__test?.ready === true')) return true;
      } catch { /* navigating */ }
    }
    return false;
  };
  const rebootWith = async (c, seed) => {
    const set = seed === undefined ? '' : (seed === null
      ? 'localStorage.clear(); sessionStorage.clear();'
      : `localStorage.clear(); sessionStorage.clear(); localStorage.setItem('ob-settings-v1', ${JSON.stringify(JSON.stringify(seed))});`);
    gi12.length = 0;
    await c.eval(`(() => { window.__ob12 = 1; ${set} setTimeout(() => location.reload(), 30); return true; })()`);
    await sleep(1200);
    return readyAfterReload(c);
  };
  // the split-brain oracles: built scene table (scene/table.js activeTableId)
  // vs kernel table (__test.equipment), the built playing surface (specFor
  // kernel footprint; mesh x = long axis, z = short axis) vs every resting
  // ball, the settings tuple and the HUD cue select
  const probe12 = (c) => c.eval(`(async () => {
    const m = await import('/scene/table.js');
    const built = m.activeTableId();
    const k = m.specFor?.(built)?.kernel ?? null;
    const eq = __test.equipment();
    const balls = __test.balls().filter((b) => !b.pocketed);
    const outside = k ? balls.filter((b) => Math.abs(b.pos[0]) > k.length / 2
      || Math.abs(b.pos[2]) > k.width / 2).map((b) => b.id) : null;
    const s = window.__settings?.get?.() ?? null;
    return { built, kernel: eq?.table_id ?? null, kernelKit: eq,
      nBalls: balls.length, outside, game: s?.game ?? null,
      settingsKit: s?.equipment ?? null,
      cueSel: document.getElementById('cue-select')?.value ?? null,
      blob: localStorage.getItem('ob-settings-v1') };
  })()`);
  const kitOf = (t) => (t ? { table_id: t.table_id, cloth_id: t.cloth_id,
    ballset_id: t.ballset_id, cushion_model_id: t.cushion_model_id,
    cue_id: t.cue_id } : null);
  const sameKit = (a, b) => JSON.stringify(kitOf(a)) === JSON.stringify(kitOf(b));
  if (!(await waitReady(chrome12))) fail('partial-profile pre-boot never became ready');
  else {
    // the card-commit pairing per game, read from the SAME boot's settings
    // seam: set('game') on a fresh profile swaps the tuple to
    // equipmentByGame[game] ?? defaultEquipmentFor(game) on its PERSISTING
    // path (the card commit's path — persist:false skips the swap); the
    // storage it writes is cleared by every seeded reboot below. Hard pins
    // guard the card path itself (the two issue-named tuples).
    const expectKit = {};
    for (const g of ['snooker', 'carom_3cushion', 'heyball']) {
      let kit = null;
      for (let i = 0; i < 40 && !kit; i++) {
        kit = await chrome12.eval(`(() => {
          window.__settings.set('game', ${JSON.stringify(g)});
          const s = window.__settings.get();
          return s.game === ${JSON.stringify(g)} ? s.equipment : null;
        })()`);
        if (!kit) await sleep(250);
      }
      if (!kit) fail(`card path never switched to ${g}`);
      expectKit[g] = kitOf(kit);
      await sleep(600); // the game switch's re-rack settles on macrotasks
    }
    if (expectKit.snooker?.cloth_id !== 'snooker_napped'
      || expectKit.snooker?.cue_id !== 'snooker_ash'
      || expectKit.snooker?.table_id !== 'wpbsa_snooker_12ft') {
      fail('card-path snooker pairing drifted: ' + JSON.stringify(expectKit.snooker));
    }
    if (expectKit.heyball?.cloth_id !== 'snooker_napped'
      || expectKit.heyball?.cushion_model_id !== 'han2005_default'
      || expectKit.heyball?.table_id !== 'chinese8_pro_9ft') {
      fail('card-path heyball pairing drifted: ' + JSON.stringify(expectKit.heyball));
    }
    if (expectKit.carom_3cushion?.table_id !== 'umb_carom_284') {
      fail('card-path carom pairing drifted: ' + JSON.stringify(expectKit.carom_3cushion));
    }
    // the seeds: [label, blob, game, expected built table, gi bake class,
    // ball count, kernel kit must equal the settings kit (heyball composes
    // FROM settings; snooker/carom kernels are kind-locked), extra pins]
    const seeds12 = [
      ['game-only snooker', { game: 'snooker' }, 'snooker',
        'wpbsa_snooker_12ft', 'snooker_12ft', 22, false, null],
      ['game-only carom', { game: 'carom_3cushion' }, 'carom_3cushion',
        'umb_carom_284', 'carom_284', 3, false, null],
      ['snooker + pool table id',
        { game: 'snooker', equipment: { table_id: 'diamond_proam_9ft' } },
        'snooker', 'wpbsa_snooker_12ft', 'snooker_12ft', 22, false, null],
      ['game-only heyball', { game: 'heyball' }, 'heyball',
        'chinese8_pro_9ft', 'chinese8_9ft', 16, true, null],
      ['snooker + empty equipmentByGame entry',
        { game: 'snooker', equipmentByGame: { snooker: {} } },
        'snooker', 'wpbsa_snooker_12ft', 'snooker_12ft', 22, false, null],
      // GH-283 control: an explicit legal cloth id in the seed wins its
      // axis, after the load path renames an old id to its twin; the other
      // axes still come from the kit
      ['snooker + explicit cloth (renamed to its twin)',
        { game: 'snooker', equipment: { table_id: 'wpbsa_snooker_12ft',
          cloth_id: 'simonis_860_tournament' } },
        'snooker', 'wpbsa_snooker_12ft', 'snooker_12ft', 22, false,
        { cloth_id: 'pool_worsted_new' }],
    ];
    for (const [label, seed, game, table, giClass, nBalls, kernelKit, pins] of seeds12) {
      if (!(await rebootWith(chrome12, seed))) { fail(`${label}: boot never became ready`); continue; }
      // the boot rack + GI class bake land on macrotasks after ready — poll
      // to the expected ball count and the class-bake settle (the arm-7 /
      // GH-313 C3.2b law: never judge one fixed-sleep sample), then judge
      for (let i = 0; i < 40; i++) {
        const n = await chrome12.eval('__test.balls().filter((b) => !b.pocketed).length');
        if (n === nBalls) break;
        await sleep(250);
      }
      if (giClass) {
        await evalSettled(chrome12, `window.__gi?.state?.bakeClass === ${JSON.stringify(giClass)}`);
      }
      const r = await probe12(chrome12);
      const want = { ...expectKit[game], ...(pins ?? {}) };
      const tag = `${label} (first boot)`;
      if (r.game !== game) fail(`${tag}: game ${r.game}`);
      if (r.built !== table || r.kernel !== table) {
        fail(`${tag}: scene built ${r.built} under kernel ${r.kernel} (want ${table})`);
      }
      if (r.nBalls !== nBalls) fail(`${tag}: ${r.nBalls} balls (want ${nBalls})`);
      if (!r.outside || r.outside.length) {
        fail(`${tag}: balls outside the built playing surface: ${JSON.stringify(r.outside)}`);
      }
      if (giClass) {
        const bake = await chrome12.eval('window.__gi?.state?.bakeClass ?? null');
        if (bake !== giClass) {
          fail(`${tag}: GI bake class ${bake} is not the ${giClass} scene `
            + `(${(gi12.find((s) => /scene/.test(s)) ?? '').slice(0, 100)})`);
        }
      }
      if (!sameKit(r.settingsKit, want)) {
        fail(`${tag}: settings kit ${JSON.stringify(kitOf(r.settingsKit))} `
          + `!= card-commit ${JSON.stringify(want)}`);
      }
      if (kernelKit && (r.kernelKit?.cloth_id !== want.cloth_id
        || r.kernelKit?.cushion_model_id !== want.cushion_model_id
        || r.kernelKit?.ballset_id !== want.ballset_id)) {
        fail(`${tag}: kernel composed ${JSON.stringify(r.kernelKit)} `
          + `!= settings ${JSON.stringify(want)}`);
      }
      let cueSel = r.cueSel;
      for (let i = 0; i < 20 && cueSel !== want.cue_id; i++) {
        await sleep(250);
        cueSel = await chrome12.eval(`document.getElementById('cue-select')?.value ?? null`);
      }
      if (cueSel !== want.cue_id) fail(`${tag}: HUD cue select ${cueSel} (want ${want.cue_id})`);
      if (game === 'snooker') {
        // lum 18 = the snooker arm's black-frame tripwire (the deep XW101
        // albedo reads ~31-39 under the venue rig); identity = olive class
        const px = await probeShotSettled(chrome12,
          (p) => p.lum >= 18 && p.olive > p.blue && p.olive >= 0.03);
        if (!px || px.lum < 18 || !(px.olive > px.blue) || px.olive < 0.03) {
          fail(`${tag}: pixels do not read the 12-ft snooker cloth: `
            + `lum ${px?.lum?.toFixed(1)} olive ${px?.olive?.toFixed(3)} blue ${px?.blue?.toFixed(3)}`);
        }
      }
      console.log(`partial profile ${label}: built ${r.built} = kernel ${r.kernel}, `
        + `${r.nBalls} balls (${r.outside?.length ?? '?'} outside), `
        + `kit ${kitOf(r.settingsKit)?.cloth_id}/${kitOf(r.settingsKit)?.cue_id}`);
    }
    // full-profile identity control: the LAST seeded boot above persisted
    // its sanitized profile (an app-written blob) — it is byte-identical
    // across a reboot and loads the same tuple / built table
    const before12 = await probe12(chrome12);
    if (!(await rebootWith(chrome12, undefined))) fail('reboot on the app-written blob never became ready');
    else {
      const after12 = await probe12(chrome12);
      if (after12.blob !== before12.blob) {
        fail('app-written blob changed across a reboot: '
          + `${before12.blob} -> ${after12.blob}`);
      }
      if (!sameKit(after12.settingsKit, before12.settingsKit)
        || after12.built !== before12.built || after12.kernel !== before12.kernel) {
        fail('app-written profile reboot drifted: ' + JSON.stringify(
          { before: [before12.built, before12.kernel, kitOf(before12.settingsKit)],
            after: [after12.built, after12.kernel, kitOf(after12.settingsKit)] }));
      }
    }
    // empty-storage control: the fresh-profile boot is untouched
    if (!(await rebootWith(chrome12, null))) fail('empty-storage control never became ready');
    else {
      for (let i = 0; i < 40; i++) {
        if (await chrome12.eval('__test.balls().filter((b) => !b.pocketed).length') === 10) break;
        await sleep(250);
      }
      const r0 = await probe12(chrome12);
      if (r0.built !== 'pool_pro_9ft' || r0.kernel !== 'pool_pro_9ft'
        || r0.nBalls !== 10 || r0.blob !== null) {
        fail('empty-storage control drifted: ' + JSON.stringify(
          [r0.built, r0.kernel, r0.nBalls, r0.blob]));
      }
      await evalSettled(chrome12, `window.__gi?.state?.bakeClass === 'pool'`);
      const bake0 = await chrome12.eval('window.__gi?.state?.bakeClass ?? null');
      if (bake0 !== 'pool') fail(`empty-storage control GI bake class is not pool: ${bake0}`);
    }
    if (await chrome12.eval('__test.errors.length')) {
      fail('partial-profile boot app errors: '
        + JSON.stringify(await chrome12.eval('__test.errors')));
    }
    if (errors12.length) {
      fail('console errors (partial-profile boots): ' + errors12.slice(0, 3).join(' | '));
    }
  }
  chrome12.close();
  // phone register, first seed: same main.js boot path, no register branch
  // in resolveBootTableId / load() — pinned so a future register split
  // cannot reopen the defect on the phone alone
  const phone12 = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 15, tool: false });
  if (!(await waitReady(phone12))) fail('phone partial-profile pre-boot never became ready');
  else if (!(await rebootWith(phone12, { game: 'snooker' }))) {
    fail('phone game-only snooker boot never became ready');
  } else {
    for (let i = 0; i < 40; i++) {
      if (await phone12.eval('__test.balls().filter((b) => !b.pocketed).length') === 22) break;
      await sleep(250);
    }
    const rp = await probe12(phone12);
    if (rp.built !== 'wpbsa_snooker_12ft' || rp.kernel !== 'wpbsa_snooker_12ft'
      || rp.nBalls !== 22 || !rp.outside || rp.outside.length) {
      fail('phone game-only snooker first boot split-brain: ' + JSON.stringify(
        [rp.built, rp.kernel, rp.nBalls, rp.outside]));
    }
    if (rp.settingsKit?.cloth_id !== 'snooker_napped' || rp.settingsKit?.cue_id !== 'snooker_ash') {
      fail('phone game-only snooker kit is not the discipline kit: ' + JSON.stringify(kitOf(rp.settingsKit)));
    }
    console.log(`phone partial profile snooker: built ${rp.built} = kernel ${rp.kernel}, ${rp.nBalls} balls inside`);
  }
  phone12.close();
}

await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-USERBOOT FAIL' : 'E2E-USERBOOT PASS');
