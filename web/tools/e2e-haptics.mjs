// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-haptics.mjs — feature-016 web-side haptics probe (NEW file; zero edits
// to existing tools — SC-004). Verification seams per
// the haptics-bridge contract (feature 016, internal) §6 / research R17:
//
//   node web/tools/e2e-haptics.mjs --inert [--port 8267] [--viewport WxH]
//   node web/tools/e2e-haptics.mjs --seam  [--port 8267] [--viewport WxH]
//
// --inert (FR-016/SC-004): desktop (fine-pointer) AND emulated-coarse boots
//   WITHOUT the bridge issue ZERO network requests for app/haptics.js, show
//   zero haptics DOM deltas, and zero haptics console output (interpretation:
//   the app's ordinary boot logging is out of scope — the gate is zero
//   console ERRORS plus zero entries mentioning the feature; mirrors
//   e2e-touch --desktop-inert). Defense-in-depth sub-check (desktop boot):
//   force-load the module and call createHaptics with a recording machine
//   stub — it must register nothing, return an inert stub, and leave the
//   DOM element count untouched. The forced load doubles as the positive
//   network-accounting control: exactly ONE haptics.js request appears
//   AFTER the zero-request assertion, proving the accounting would have
//   caught a real boot-path load.
//
// --seam (SC-005 at the seam): inject a mock
//   window.webkit.messageHandlers.obHaptics collector before boot (CDP
//   Page.addScriptToEvaluateOnNewDocument), boot ?obtool&norec, run the
//   canonical scripted break (e2e.mjs precedent: v0 6.5, phi PI/2, b -0.1 on
//   seed=1), and assert collected messages == deriveCues(record)
//   post-coalescing, 1:1 in class + clamped gain. The expected side is
//   INDEPENDENT of web/app/haptics.js: deriveCues is imported from
//   /app/sound.js in the page, the record comes from a serve-time probe tap
//   (below), and the §5 coalescing law is re-implemented in this file.
//   Extra seam laws gated here: per-class survivor spacing > COALESCE_MS,
//   rewind → cursor reset (replayed prefix), and the FR-005 throwing-bridge
//   law (a throwing bridge disables the module for the session; the frame
//   loop never blocks, zero console errors).
//
// Lane-local seam hunk (tasks.md T011 exit gate): the ONE main.js hunk of
// haptics-bridge.md §2 lands in the repo only at T031 (integrator). This
// probe therefore SELF-SERVES web/ through a node static server that
// applies the byte-exact frozen hunk to /app/main.js in flight WHEN (and
// only when) the file does not already contain it — pre-T031 boots get the
// lane-local hunk, post-T031 boots get the repo file verbatim. In --seam
// mode the server additionally injects a read-only record tap
// (window.__obE2eRecord) at the same anchor — probe machinery only, never
// a repo edit. The repo tree is never modified by this tool.
//
// Determinism of the seam compare: playback is driven through the sanctioned
// __test.renderAt(t, dt) manual-render seam (record.mjs precedent) on a
// fixed 0.04 s grid — 0.04 < STALE (0.05), so no cue can fall stale between
// steps and the collected set is a pure function of the record, never of
// wall-clock frame jank.
//
// Battery conventions (e2e-touch.mjs precedent): hermetic Chrome profile
// (cdp.mjs), suite-unique verified-free ports (OB_E2E_PORT ?? 8267 /
// OB_E2E_CDP_PORT ?? 16467; the coarse boot uses CDP+1 to dodge TIME_WAIT),
// obtool boot stamp, zero-console-error gate, PASS/FAIL exit codes, /tmp
// screenshot artifact on failure, hard global watchdog (exit 2).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';
import { setPhoneMetrics, verifyCoarse, waitReady } from './touch-cdp.mjs';

// ---- args / ports -----------------------------------------------------------
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const MODE_INERT = process.argv.includes('--inert');
const MODE_SEAM = process.argv.includes('--seam');
if (MODE_INERT === MODE_SEAM) {
  console.error('usage: node web/tools/e2e-haptics.mjs --inert | --seam '
    + '[--port N] [--viewport WxH]');
  process.exit(2);
}
const [W, H] = (argOf('--viewport') ?? '1024x640').split('x').map(Number);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8267);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16467);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 2 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 2 };
export const PORT_FLAGS = { '--port': 'http', '--viewport': 'none' };
const BASE = `http://127.0.0.1:${PORT}`;

// ---- watchdog (unref'd: never holds an otherwise-finished process) ----------
const WATCHDOG_MS = Number(process.env.OB_E2E_WATCHDOG_MS ?? 420000);
let client = null;
let server = null;
setTimeout(() => {
  console.error(`[e2e-haptics] WATCHDOG: suite exceeded ${WATCHDOG_MS} ms — hard exit`);
  try { client?.close(); } catch { /* already gone */ }
  try { server?.close(); } catch { /* already gone */ }
  process.exit(2);
}, WATCHDOG_MS).unref();

// ---- scoring ----------------------------------------------------------------
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-haptics] PASS', name);
  else {
    failures++;
    process.exitCode = 1;
    console.error('E2E-HAPTICS FAIL:', name + (detail ? ' — ' + detail : ''));
  }
};

// ---- frozen constants (haptics-bridge.md §5; INDEPENDENT copy) ---------------
// Deliberately duplicated from web/app/haptics.js: the seam gate is two
// implementations of the same frozen law agreeing — the probe must never
// import the module under test.
const COALESCE_MS = 50;
const HAPTICS_RE = /\/app\/haptics\.js(?:\?|$)/;

/** §5 coalescing law, probe-side reimplementation: per cue class, windows
 * anchored at each group's first cue (shot time); survivor keeps the
 * group-opening t and carries the group's max gain. */
function coalesceCues(cues) {
  const open = new Map();
  const out = [];
  for (const c of cues) {
    const g = open.get(c.type);
    if (g && c.t - g.t <= COALESCE_MS / 1000) {
      g.gain = Math.max(g.gain, c.gain);
      continue;
    }
    const survivor = { t: c.t, type: c.type, gain: c.gain };
    open.set(c.type, survivor);
    out.push(survivor);
  }
  return out;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---- self-served web/ with the lane-local seam hunk --------------------------
// The byte-exact frozen §2 hunk (haptics-bridge.md; T031 lands this same
// text in the repo — the includes('obHaptics') guard below makes the patch
// a no-op from that day on).
const HUNK = [
  '  // iOS shell haptics (feature 016, contracts/haptics-bridge.md §2):',
  '  // feature-detected DYNAMIC import per the cache-poison contract — the',
  '  // bridge only exists inside the shell, so web boots never request the',
  '  // module. Do NOT convert to a static import.',
  '  if (window.webkit?.messageHandlers?.obHaptics) {',
  "    import('./haptics.js').then((m) => m.createHaptics?.({ machine, game }))",
  '      .catch(() => {});',
  '  }',
].join('\n');
const TAP = '  window.__obE2eRecord = () => game.record;'
  + ' // e2e-haptics --seam serve-time probe tap (never committed)';

function patchMainJs(src) {
  const anchor = src.match(/^[ \t]*createSound\(\{ machine, game \}\);.*$/m);
  if (!anchor) {
    throw new Error('e2e-haptics: createSound({ machine, game }) anchor not '
      + 'found in web/app/main.js — the frozen seam insertion point moved');
  }
  let out = src;
  if (!src.includes('obHaptics')) out = out.replace(anchor[0], anchor[0] + '\n' + HUNK);
  if (MODE_SEAM) {
    out = out.replace(anchor[0], anchor[0] + '\n' + TAP);
    // serve-time WIRING beacon (the TAP precedent — never committed): the
    // §2 hunk resolves its dynamic import ASYNCHRONOUSLY, so "haptics.js
    // was requested" (the network poll below) races "createHaptics
    // subscribed" — the 2026-08-06 hosted shellcore failure walked the
    // whole playback before the subscription existed (collected=0 with 24
    // derived cues; reproduced deterministically by delaying the module
    // response 4 s). The instrumented import publishes the wiring instant;
    // the seam boot polls it before the first frame of the walk.
    out = out.replace(
      "import('./haptics.js').then((m) => m.createHaptics?.({ machine, game }))",
      "import('./haptics.js').then((m) => { window.__obE2eHapticsWired"
      + ' = !!m.createHaptics?.({ machine, game }); })');
  }
  return out;
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.md': 'text/plain', '.map': 'application/json',
};

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, BASE).pathname);
    if (p === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>e2e-haptics</title>ok');
      return;
    }
    if (p === '/favicon.ico') {
      // headless Chrome requests the favicon nondeterministically; web/ ships
      // none and a 404 would poison the zero-console-error gate — answer it
      res.writeHead(200, { 'content-type': 'image/x-icon', 'content-length': 0 });
      res.end();
      return;
    }
    const fp = path.resolve(webDir, '.' + p);
    if (fp !== webDir && !fp.startsWith(webDir + path.sep)) {
      res.writeHead(403); res.end(); return;
    }
    let data = await readFile(fp);
    if (p === '/app/main.js') data = Buffer.from(patchMainJs(data.toString('utf8')));
    res.writeHead(200, {
      'content-type': MIME[path.extname(fp).toLowerCase()] ?? 'application/octet-stream',
      'content-length': data.length,
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    const notFound = e?.code === 'ENOENT' || e?.code === 'EISDIR';
    if (!notFound || process.env.OB_E2E_DEBUG) {
      console.error(`[e2e-haptics] serve ${notFound ? 404 : 500} ${req.url}: ${e.message}`);
    }
    res.writeHead(notFound ? 404 : 500);
    res.end();
  }
});
await new Promise((res, rej) => server.listen(PORT, '127.0.0.1', res).on('error', rej));

// serve-time patch positive control: the boot below must exercise the seam
const servedMain = await (await fetch(BASE + '/app/main.js')).text();
check('served main.js carries the seam gate (lane-local hunk or T031 repo hunk)',
  servedMain.includes('if (window.webkit?.messageHandlers?.obHaptics)'));
if (MODE_SEAM) {
  check('served main.js carries the --seam record tap',
    servedMain.includes('__obE2eRecord'));
  check('served main.js carries the --seam wiring beacon',
    servedMain.includes('__obE2eHapticsWired'));
}

// ---- shared boot plumbing ----------------------------------------------------
function attachConsole(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      sink.push({ kind: params.type,
        text: params.args.map((a) => a.value ?? a.description).join(' ') });
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push({ kind: 'error',
        text: params.exceptionDetails.exception?.description
          ?? params.exceptionDetails.text });
    } else if (method === 'Log.entryAdded') {
      sink.push({ kind: params.entry.level, text: params.entry.text });
    }
  });
}
const errorsOf = (sink) => sink.filter((e) => e.kind === 'error').map((e) => e.text);
const hapticsTalk = (sink) => sink.filter((e) => /haptic/i.test(e.text)).map((e) => e.text);

async function failShot(c, tag) {
  const shot = `/tmp/e2e-haptics-${tag}-fail-${Date.now()}.png`;
  try {
    await c.screenshot(shot);
    console.error('[e2e-haptics] failure screenshot:', shot);
  } catch { /* page already gone */ }
}

// =============================================================================
// --inert
// =============================================================================
if (MODE_INERT) {
  const boots = [
    { tag: 'desktop', coarse: false },
    { tag: 'coarse', coarse: true },
  ];
  for (const { tag, coarse } of boots) {
    const before = failures;
    const sink = [];
    let hapticsRequests = [];
    let totalRequests = 0;
    console.log(`[e2e-haptics] inert boot: ${tag} (bridge absent)`);
    client = await launchChrome(BASE + '/', {
      port: CDP_PORT + (coarse ? 1 : 0), tool: false, width: W, height: H,
    });
    try {
      attachConsole(client, sink);
      client.onEvent((method, params) => {
        if (method !== 'Network.requestWillBeSent') return;
        totalRequests++;
        if (HAPTICS_RE.test(params.request.url)) hapticsRequests.push(params.request.url);
      });
      await client.send('Network.enable');
      await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (coarse) await setPhoneMetrics(client, { width: 844, height: 390 });
      // network accounting is live BEFORE the app navigation — every app
      // module request of this boot is counted (no reload needed)
      await client.send('Page.navigate',
        { url: BASE + '/app.html?obtool&seed=1' });
      check(`${tag}: app ready`, await waitReady(client));
      await sleep(2000); // init settle — the §2 gated import would fire here
      if (coarse) {
        check(`${tag}: coarse pointer active (frozen 014 recipe)`,
          await verifyCoarse(client).then(() => true,
            (e) => { console.error(e.message); return false; }));
      } else {
        check(`${tag}: fine pointer at boot (coarse media query false)`,
          await client.eval(`matchMedia('(pointer: coarse)').matches`) === false);
      }
      check(`${tag}: bridge truly absent (window.webkit undefined)`,
        await client.eval('typeof window.webkit') === 'undefined');
      check(`${tag}: network accounting live (app modules requested)`,
        totalRequests > 10, `totalRequests=${totalRequests}`);
      check(`${tag}: ZERO requests for app/haptics.js`,
        hapticsRequests.length === 0, hapticsRequests.join(' '));
      check(`${tag}: zero haptics DOM deltas (no haptic-hinted elements)`,
        await client.eval(
          `document.querySelectorAll('[id*="haptic"], [class*="haptic"]').length`) === 0);
      check(`${tag}: zero console errors`, errorsOf(sink).length === 0,
        errorsOf(sink).slice(0, 5).join(' | '));
      check(`${tag}: zero haptics console output`, hapticsTalk(sink).length === 0,
        hapticsTalk(sink).slice(0, 5).join(' | '));

      if (!coarse) {
        // defense-in-depth (haptics-bridge.md §1): force-load the module with
        // no bridge — registers nothing, inert stub, no DOM delta, silent
        const r = await client.eval(`(async () => {
          const before = document.getElementsByTagName('*').length;
          const m = await import('/app/haptics.js');
          const regs = [];
          const stub = m.createHaptics({
            machine: { on: (ev) => { regs.push(ev); return () => {}; } },
            game: {},
          });
          return {
            regs,
            stubOk: !!stub && stub.active === false && stub.posted === 0,
            domDelta: document.getElementsByTagName('*').length - before,
          };
        })()`);
        check('desktop: forced load registers NOTHING on the machine',
          Array.isArray(r.regs) && r.regs.length === 0, JSON.stringify(r.regs));
        check('desktop: forced load returns the inert stub', r.stubOk === true);
        check('desktop: forced load causes zero DOM delta', r.domDelta === 0,
          `delta=${r.domDelta}`);
        // positive control: the accounting DOES see haptics.js when it is
        // actually fetched — the zero-request assert above is not vacuous
        check('desktop: accounting control — forced load shows exactly one '
          + 'haptics.js request', hapticsRequests.length === 1,
        `seen=${hapticsRequests.length}`);
        check('desktop: forced load stays console-silent',
          hapticsTalk(sink).length === 0, hapticsTalk(sink).slice(0, 5).join(' | '));
      }
      if (failures > before) await failShot(client, `inert-${tag}`);
    } finally {
      client.close();
      client = null;
    }
  }
  server.close();
  console.log(failures
    ? `[e2e-haptics] FAIL (${failures} failing assertions)`
    : '[e2e-haptics] ALL PASS (--inert)');
  process.exit(failures ? 1 : 0);
}

// =============================================================================
// --seam
// =============================================================================
// mock collector, installed on EVERY new document before any app script runs
const MOCK_BRIDGE_JS = [
  'window.__hapticsMsgs = [];',
  'window.__throwBridge = false;',
  'window.webkit = { messageHandlers: { obHaptics: { postMessage: (m) => {',
  "  if (window.__throwBridge) throw new Error('e2e-haptics: injected bridge throw');",
  '  window.__hapticsMsgs.push(JSON.parse(JSON.stringify(m)));',
  '} } } };',
].join('\n');

// canonical scripted break (e2e.mjs precedent) on the seed=1 rack
const SHOT_JS = '__test.shoot({ v0: 6.5, phi: Math.PI / 2, theta: 0, a: 0, b: -0.1 })';

// deterministic manual-render walk: 0.04 s grid (< STALE) via renderAt
const walkJs = (from, to) => '(async () => {'
  + ' const DT = 0.04; let steps = 0;'
  + ` for (let t = ${from}; t <= ${to} + 1e-9; t += DT) {`
  + ' window.__test.renderAt(t, DT);'
  + ' if (++steps % 25 === 0) await new Promise((r) => setTimeout(r, 0));'
  + ' } return steps; })()';

const msgEq = (a, b) => a && b && a.v === b.v && a.type === b.type
  && a.gain === b.gain && a.t === b.t;
const msgStr = (m) => m ? `{v:${m.v} ${m.type} gain:${m.gain} t:${m.t}}` : String(m);

{
  const sink = [];
  const hapticsRequests = [];
  console.log(`[e2e-haptics] seam boot (mock obHaptics collector) cdp=${CDP_PORT}`);
  client = await launchChrome(BASE + '/', {
    port: CDP_PORT, tool: false, width: W, height: H,
  });
  try {
    attachConsole(client, sink);
    client.onEvent((method, params) => {
      if (method === 'Network.requestWillBeSent'
        && HAPTICS_RE.test(params.request.url)) hapticsRequests.push(params.request.url);
    });
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK_BRIDGE_JS });
    await client.send('Page.navigate', { url: BASE + '/app.html?obtool&norec&seed=1' });
    check('seam: app ready', await waitReady(client));
    check('seam: mock bridge installed before boot',
      await client.eval('!!window.webkit?.messageHandlers?.obHaptics'
        + ' && Array.isArray(window.__hapticsMsgs)'));
    // the §2 capability gate must fire on this boot: bounded poll for the
    // module request (dynamic import resolves during init)
    let requested = false;
    for (let i = 0; i < 50 && !requested; i++) {
      requested = hapticsRequests.length > 0;
      if (!requested) await sleep(200);
    }
    check('seam: bridge presence triggers exactly one haptics.js request',
      hapticsRequests.length === 1, `seen=${hapticsRequests.length}`);
    // WIRING poll (GH-313 posture: a real signal, never a settle sleep) —
    // the request poll above only proves the §2 gate FIRED; on a slow host
    // the module can still be in flight/evaluating when the walk below
    // starts, and every cue of the record is silently missed (the hosted
    // shellcore failure of 2026-08-06). The serve-time beacon marks the
    // instant createHaptics RETURNED, i.e. the machine subscription exists.
    let wired = false;
    for (let i = 0; i < 50 && !wired; i++) {
      wired = await client.eval('window.__obE2eHapticsWired === true');
      if (!wired) await sleep(200);
    }
    check('seam: haptics wiring landed before the walk (serve-time beacon)',
      wired);
    check('seam: zero messages before any shot',
      await client.eval('window.__hapticsMsgs.length') === 0);

    // enter the manual-render regime BEFORE shooting so no wall-clock frame
    // ever drives the cue cursor (determinism note in the header)
    await client.eval('window.__test.renderAt(0, 0.04); true');
    const shotErr = await client.eval(SHOT_JS);
    check('seam: scripted break accepted', shotErr === null, String(shotErr));
    check('seam: state is PLAYBACK', await client.eval('__test.state()') === 'PLAYBACK');
    const dur = await client.eval('__test.duration()');
    check('seam: playback duration sane', typeof dur === 'number' && dur > 0.5
      && dur < 120, `dur=${dur}`);
    console.log(`[e2e-haptics] walking playback 0..${(dur + 0.2).toFixed(2)}s on the 0.04s grid`);
    await client.eval(walkJs(0, dur + 0.2));

    const collected = await client.eval('window.__hapticsMsgs');
    // expected side: sound.js deriveCues on the game's own record (serve-time
    // tap), coalesced by THIS file's independent §5 implementation
    const derived = await client.eval(`(async () => {
      const rec = typeof window.__obE2eRecord === 'function' ? window.__obE2eRecord() : null;
      if (!rec) return { err: 'record tap missing or no record' };
      const m = await import('/app/sound.js');
      return { cues: m.deriveCues(rec), recTs: rec.events.map((e) => e.t) };
    })()`);
    check('seam: record tap + page-side deriveCues available', !derived.err,
      derived.err ?? '');
    const expected = (derived.cues ?? []).length
      ? coalesceCues(derived.cues).map((c) => ({
        v: 1, type: c.type, gain: clamp01(c.gain), t: c.t,
      })) : [];
    // anchor the tapped record to the game's own __test.events() seam — the
    // tap cannot have handed the probe a different record
    const testTs = await client.eval('(__test.events() ?? []).map((e) => e.t)');
    check('seam: tapped record IS the game record (__test.events t-list match)',
      Array.isArray(derived.recTs) && derived.recTs.length === testTs.length
      && derived.recTs.every((t, i) => t === testTs[i]),
    `tap=${derived.recTs?.length} test=${testTs.length}`);

    check('seam: break produced a non-vacuous cue set (>= 5 post-coalescing)',
      expected.length >= 5, `expected=${expected.length}`);
    check('seam: collected count == derived post-coalescing count',
      collected.length === expected.length,
      `collected=${collected.length} expected=${expected.length}`);
    let firstDiff = -1;
    const n = Math.min(collected.length, expected.length);
    for (let i = 0; i < n && firstDiff < 0; i++) {
      if (!msgEq(collected[i], expected[i])) firstDiff = i;
    }
    check('seam: messages match 1:1 (v, class, clamped gain, t) in order',
      collected.length === expected.length && firstDiff < 0,
      firstDiff >= 0
        ? `first diff at ${firstDiff}: got ${msgStr(collected[firstDiff])} want ${msgStr(expected[firstDiff])}`
        : '');
    // §5 law directly on the wire: per-class survivor spacing > COALESCE_MS
    let minGap = Infinity;
    const lastByClass = new Map();
    for (const m of collected) {
      const prev = lastByClass.get(m.type);
      if (prev !== undefined) minGap = Math.min(minGap, m.t - prev);
      lastByClass.set(m.type, m.t);
    }
    check('seam: per-class spacing exceeds COALESCE_MS on every posted pair',
      minGap === Infinity || minGap > COALESCE_MS / 1000 - 1e-9,
      `minGap=${minGap}`);

    // rewind law: cursor resets when the clock goes backwards — a re-walk of
    // the head of the shot re-posts the same prefix, byte-identical
    const nFirst = collected.length;
    await client.eval(walkJs(0, 1.0));
    const afterRewind = await client.eval('window.__hapticsMsgs');
    const replayed = afterRewind.slice(nFirst);
    check('seam: rewind resets the cue cursor (head cues re-posted)',
      replayed.length >= 1, `replayed=${replayed.length}`);
    check('seam: re-posted cues replay the first-pass prefix exactly',
      replayed.every((m, i) => msgEq(m, afterRewind[i])),
      `replayed=${replayed.length}`);

    // FR-005 throwing-bridge law: first throw disables for the session; the
    // page keeps rendering and stays console-clean
    const nBefore = afterRewind.length;
    await client.eval('window.__throwBridge = true; true');
    await client.eval(walkJs(0, 1.0));
    await client.eval('window.__throwBridge = false; true');
    await client.eval(walkJs(0, 1.0)); // still disabled: session latch
    const nAfter = await client.eval('window.__hapticsMsgs.length');
    check('seam: throwing bridge disables the module for the session '
      + '(zero messages after the throw, even once the bridge heals)',
    nAfter === nBefore, `before=${nBefore} after=${nAfter}`);
    check('seam: frame loop survived the throwing bridge (renderAt still live)',
      await client.eval('(window.__test.renderAt(0.5, 0.04), __test.state())') === 'PLAYBACK');

    check('seam: zero console errors across the run', errorsOf(sink).length === 0,
      errorsOf(sink).slice(0, 5).join(' | '));
    if (failures) await failShot(client, 'seam');
  } finally {
    client.close();
    client = null;
    server.close();
  }
  console.log(failures
    ? `[e2e-haptics] FAIL (${failures} failing assertions)`
    : '[e2e-haptics] ALL PASS (--seam)');
  process.exit(failures ? 1 : 0);
}
