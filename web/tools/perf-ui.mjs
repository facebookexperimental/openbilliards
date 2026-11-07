// Copyright (c) Meta Platforms, Inc. and affiliates.

// perf-ui.mjs — UI-churn frame-time gate (feature 006 (internal spec) T001).
// Boots the app headless (cdp.mjs obtool stamp), scripts an e2e.mjs break
// shot, and while the balls are moving repeatedly opens/closes the settings
// panel (#ob-gear click — settings.js's own toggle path), opens/closes the
// export dialog (__export.open()/close() — the e2e-export.mjs path), and
// flashes the #banner (hud.js setBanner's exact DOM ops; no window hook
// exposes setBanner, so the same three ops are applied to #banner directly).
// Collects ≥10 s of rAF deltas via a page-side collector (perf-aim.mjs
// pattern) and reports p50/p95/p99/max frame deltas in ms.
//
//   node web/tools/perf-ui.mjs --url http://localhost:8021/app.html --out out.json
//   node web/tools/perf-ui.mjs --url ... --baseline <baseline.json>
//     (baseline mode: fresh capture vs stored JSON; exit 1 if p95 regresses > 1.0 ms)
//   node web/tools/perf-ui.mjs --url ... --viewport 844x390 --out phone.json
//     (014 T037, FR-008/SC-006: phone emulation via touch-cdp.mjs launchPhone
//      — DPR 3, mobile, overrides before app boot; numbers RECORDED, not
//      gated this phase. Without the flag the launch path is unchanged.)
import fs from 'node:fs';
import { launchChrome, sleep } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'cdp', '--viewport': 'none' };
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const URL_ = arg('url', 'http://localhost:8021/app.html');
const OUT = arg('out', null);
const BASELINE = arg('baseline', null);
const PORT = Number(arg('port', '22830'));
const CHURN_MS = Number(arg('seconds', '12')) * 1000;
const VIEWPORT = arg('viewport', ''); // 'WxH' = phone emulation (014 T037)
const vp = VIEWPORT ? VIEWPORT.split('x').map(Number) : null;
if (vp && (vp.length !== 2 || vp.some((n) => !Number.isFinite(n) || n <= 0))) {
  throw new Error(`--viewport wants WxH (got ${VIEWPORT})`);
}

// deterministic rack (e2e-aim.mjs boots ?seed=1; obtool stamp comes from cdp.mjs)
const withSeed = (u) => (/[?&]seed=/.test(u)
  ? u : u + (u.includes('?') ? '&' : '?') + 'seed=1');

function pct(xs, p) { // perf-aim.mjs percentile convention
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const consoleErrors = [];
const chrome = vp
  ? await launchPhone(withSeed(URL_), { cdpPort: PORT, width: vp[0], height: vp[1] })
  : await launchChrome(withSeed(URL_), { port: PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

let result;
try {
  // ---- boot (e2e-aim.mjs readiness convention)
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  await sleep(1500); // GI async load + shader warmup (perf-aim.mjs)

  // ---- page-side rAF delta collector, armed BEFORE the churn starts
  await chrome.eval(`window.__perfui = (() => {
    const deltas = []; let on = false, last = performance.now();
    function loop(now) {
      if (on) deltas.push(now - last);
      last = now; requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return { start() { on = true; deltas.length = 0; },
             stop() { on = false; return deltas.slice(); } };
  })(); true`);
  await chrome.eval('__perfui.start(); true');

  // ---- scripted break (the e2e.mjs shot: explicit v0/phi through __test.shoot)
  const err = await chrome.eval(
    '__test.shoot({ v0: 6.5, phi: Math.PI / 2, theta: 0, a: 0, b: -0.1 })');
  if (err) throw new Error('shoot rejected: ' + err);

  // ---- UI churn while balls move: settings panel + export dialog + banner
  const t0 = Date.now();
  while (Date.now() - t0 < CHURN_MS) {
    await chrome.eval('document.getElementById("ob-gear").click(); true'); // open
    await sleep(200);
    await chrome.eval('document.getElementById("ob-gear").click(); true'); // close
    await sleep(100);
    await chrome.eval('__export.open()');   // async: support probe + modal build
    await sleep(200);
    await chrome.eval('__export.close(); true');
    await sleep(100);
    await chrome.eval(`(() => { const b = document.getElementById('banner');
      b.textContent = 'perf-ui'; b.classList.toggle('foul', true);
      b.style.display = 'block'; })(); true`);
    await sleep(150);
    await chrome.eval(`(() => { const b = document.getElementById('banner');
      b.textContent = ''; b.classList.toggle('foul', false);
      b.style.display = 'none'; })(); true`);
    await sleep(150);
  }

  // ---- collect + stats
  const deltas = (await chrome.eval('__perfui.stop()')).slice(1);
  const totalMs = deltas.reduce((a, b) => a + b, 0);
  if (totalMs < 10000) throw new Error(`only ${(totalMs / 1000).toFixed(1)} s of frames collected (need ≥ 10 s)`);
  result = {
    // local calendar date (plain toISOString reports UTC, which rolls over
    // a day early in the evening on this side of the meridian)
    date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10),
    url: URL_,
    ...(VIEWPORT ? { viewport: VIEWPORT, dpr: 3, mobile: true } : {}),
    frames: deltas.length,
    p50: +pct(deltas, 50).toFixed(2),
    p95: +pct(deltas, 95).toFixed(2),
    p99: +pct(deltas, 99).toFixed(2),
    max: +Math.max(...deltas).toFixed(2),
    scenario: 'settings+export churn during shot',
  };
  console.log(JSON.stringify(result, null, 1));

  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) console.error('APP ERRORS:', appErrors.slice(0, 5).join(' | '));
  if (consoleErrors.length) console.error('CONSOLE ERRORS:', consoleErrors.slice(0, 5).join(' | '));
} finally {
  chrome.close();
}

if (OUT && result) fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
if (BASELINE && result) {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const dp95 = +(result.p95 - base.p95).toFixed(2);
  console.log(`p95 ${result.p95} ms vs baseline ${base.p95} ms (delta ${dp95} ms, gate +1.0)`);
  if (dp95 > 1.0) { console.error('PERF-UI FAIL: p95 regressed past the 1.0 ms gate'); process.exit(1); }
  console.log('PERF-UI PASS');
}
