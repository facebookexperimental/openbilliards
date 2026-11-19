// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-bugreport.mjs — bug-report gate (feature 025, feature 025 (internal spec)
// tasks.md T006). Drives the Settings → About "Report bug" row end-to-end:
//
//   1. visibility/label: the row renders in About, enabled, with a non-empty
//      localized label (asserted under en AND a de live-switch)
//   2. happy path: one scripted shot settles THROUGH THE APP'S NORMAL PATH
//      (__test.shoot → flow.js adjudication), the row click downloads
//      `openbilliards-bugreport-<timestamp>.json` via the blob anchor —
//      intercepted by an in-page HTMLAnchorElement.prototype.click hook that
//      records {download, href} + reads the blob text AT CLICK TIME (plan
//      D6: deterministic on starved runners, immune to the 10 s revoke);
//      the JSON parses and carries the FULL schema-v3 field list (FR-002 +
//      Amendment v2 + v3: bundle_version 3, rules_version, judgments,
//      the storage quota-degrade ledger — the last
//      judgment entry must be the fired shot's verdict), cross-checked
//      byte-equal against the window.__bugreport.last() seam. The
//      scenarios assert is CAP-AGNOSTIC on purpose (>= 1 entry; the cap
//      constant lives in game.js, never hardcoded here); the ledger
//      anchor is PINNED (seed 1 via ?seed=1, shot 0 — the deterministic
//      per-shot attribution the ledger exists for, never just
//      typeof-checked)
//   2b. judge-broken ledger row (Amendment v2, the #44 catch path itself):
//      the flow.js __rules.failNextJudge TEST SEAM arms a one-shot judge
//      fault, a SECOND real shot dies in adjudicate's catch, and both the
//      live seam and the downloaded bundle carry the {rack, seed, shot,
//      judgeError} row where the verdict would have been (AIM routing
//      asserted — the table stays playable; the one expected reportError
//      entry is consumed so the zero-error gates below stay real)
//   3. resilience: __share.encode stubbed to throw — the bundle STILL
//      downloads with replay_url as { error } while scenarios/balls/
//      kernel_version stay intact (FR-003, US2); then __rules.judgments
//      stubbed to throw — judgments becomes { error }, the bundle still
//      downloads (Amendment v2 resilience sub-arm)
//   4. stale-leaf degrade: bugreport.js poisoned at the network layer → the
//      row disables itself (aria-disabled), the settings modal keeps
//      working, zero page errors (cache-poison law, US2 scenario 3)
//
// Across all arms: zero console errors — gated UNFILTERED; the one expected
// noise (arm 4's poisoned bugreport.js resource-load 404) is excluded at
// capture time by its Log-entry URL while the poison is armed, NEVER by
// message text, so a genuine console error mentioning bugreport still trips
// the gate (2026-07-21 review finding) — and ZERO non-origin network
// requests (SC-004 — assembly reads local surfaces only; no upload endpoint
// exists).
//
// Conventions per cdp.mjs suites: hermetic Chrome profile + obtool stamp,
// self-served web/ on a suite-unique port GUARDED up front (the e2e-carom
// assertFree precedent), bounded node-side polls (821324a doctrine — no
// fixed sleep gates any assertion). Needs Chrome + node >= 22.
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// suite-unique defaults; env-overridable for parallel worktree lanes
const PORT = Number(process.env.OB_E2E_PORT ?? 8213);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16313);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const APP_URL = `http://127.0.0.1:${PORT}/app.html?seed=1`;
const fail = (msg) => { console.error('E2E-BUGREPORT FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-bugreport] PASS', name);
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

/** Refuse to squat on a busy port (the e2e-carom precedent). Without the
 * guard, a leaked server/Chrome from an aborted run poisons THIS run
 * silently: the second http.server dies unheard under stdio:'ignore' and
 * the CDP /json/list poll attaches to the STALE Chrome whose profile dir
 * launchChrome just rmSync'd (2026-07-21 review finding). */
async function assertFree(port) {
  await new Promise((res, rej) => {
    const s = createServer();
    s.once('error', (e) => rej(new Error(`port ${port} is not free: ${e.code}`)));
    s.listen(port, '127.0.0.1', () => s.close(res));
  });
}
await assertFree(PORT);
await assertFree(CDP_PORT);

const consoleErrors = [];
const nonOriginRequests = [];
let stalePoisonActive = false; // arm 4 arms this right before Fetch.enable
// server + Chrome start INSIDE the try so a launch failure still tears both
// down through the finally (2026-07-21 review finding: a throw between the
// two spawns used to leak the http.server — and the half-started Chrome —
// into every later run on these ports)
let server, chrome;

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error('app never became ready');
}
/** Bounded node-side condition polls (the e2e-settings 821324a precedent:
 * dynamic-import continuations land SECONDS late on starved CI boxes —
 * poll the settled condition from node, never trust a fixed sleep). */
async function pollFor(expr, tries = 75) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
async function waitFor(expr, what, tries = 150) {
  if (!await pollFor(expr, tries)) throw new Error(`${what} never came up`);
}

const ROW = `document.getElementById('ob-about-bugreport')`;
const SHELL_UP = `!!document.getElementById('ob-settings')`;
const openAbout = async () => {
  await chrome.eval(`window.__settings.show('about')`);
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await waitFor(`document.getElementById('ob-settings')
    .getClientRects().length > 0`, 'settings modal');
  // enter motion / section mount settled = the ROW has geometry — a bounded
  // poll, not a fixed sleep (821324a doctrine; 2026-07-21 review finding:
  // a 300 ms sleep raced the mount on loaded boxes and read a 0×0 rect)
  await waitFor(`(() => { const r = ${ROW}.getBoundingClientRect();
    return r.width > 0 && r.height > 0; })()`, 'About row geometry');
};
/** In-page anchor-click hook (plan D6): record + swallow download anchors,
 * read the blob text immediately (before the module's 10 s revoke).
 * Installed PER DOCUMENT: arm 4's Page.navigate wipes it, so the stale arm
 * reinstalls it before clicking — its "no download" assert must be able to
 * see a download actually fire (2026-07-21 review finding). */
const installAnchorHook = () => chrome.eval(`(() => {
  window.__dl = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return orig.call(this);
    const entry = { download: this.download, href: this.href, text: null };
    window.__dl.push(entry);
    fetch(this.href).then((r) => r.text())
      .then((t) => { entry.text = t; })
      .catch((e) => { entry.text = 'BLOB READ FAILED: ' + e; });
  };
  return true;
})()`);

try {
  server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  chrome = await launchChrome(APP_URL, { port: CDP_PORT });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      // the stale arm's poisoned bugreport.js 404 logs a bare "Failed to
      // load resource" Log entry carrying the resource URL — the ONE
      // expected noise, excluded here by that URL while the poison is
      // armed (never by message text — a real console error that merely
      // MENTIONS bugreport must still trip the unfiltered gate below)
      if (stalePoisonActive && (params.entry.url ?? '').includes('bugreport.js')) return;
      consoleErrors.push(`${params.entry.text} [${params.entry.url ?? ''}]`);
    } else if (method === 'Network.requestWillBeSent') {
      // SC-004: every http(s) request the PAGE makes must stay on the served
      // origin (blob:/data: reads are local by construction)
      const u = params.request.url;
      if (/^https?:/.test(u) && !u.startsWith(`http://127.0.0.1:${PORT}/`)) {
        nonOriginRequests.push(u);
      }
    }
  });
  await chrome.send('Network.enable');

  await waitReady();
  await waitFor(SHELL_UP, 'settings shell');
  await sleep(800); // kit upgrades resolve (guarded imports)

  // ---- arm 1: visibility / label ---------------------------------------------
  await openAbout();
  const row = await chrome.eval(`(() => {
    const b = ${ROW};
    if (!b) return { present: false };
    const r = b.getBoundingClientRect();
    return { present: true, visible: r.width > 0 && r.height > 0,
      disabled: b.disabled, label: b.textContent.trim(),
      i18nKey: b.dataset.i18n };
  })()`);
  check('About row present, visible, enabled, localized label (en)',
    row.present && row.visible && !row.disabled && row.label.length > 0
    && row.label !== row.i18nKey
    && row.i18nKey === 'settingsModal.about.bugreport', JSON.stringify(row));
  // de live-switch: POLL the applied re-render — the dictionary fetch is
  // async and un-awaited through __settings.set, so a fixed sleep raced it
  // on loaded boxes and the early restore then raced setLocale's own
  // sequencing (2026-07-21 review finding; i18n.js now guards overlap too)
  await chrome.eval(`__settings.set('language', 'de')`);
  await waitFor(`window.__i18n.locale() === 'de'
    && ${ROW}.textContent.trim() !== ${JSON.stringify(row.label)}`,
  'de label re-render');
  const deLabel = await chrome.eval(`${ROW}.textContent.trim()`);
  check('label re-renders under a de live-switch (non-empty, no raw key)',
    deLabel.length > 0 && deLabel !== row.label
    && !deLabel.includes('settingsModal'), JSON.stringify({ en: row.label, deLabel }));
  await chrome.eval(`__settings.set('language', 'en')`);
  await waitFor(`window.__i18n.locale() === 'en'
    && ${ROW}.textContent.trim() === ${JSON.stringify(row.label)}`,
  'en label restore');
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  await pollFor(`document.getElementById('ob-settings')
    .getClientRects().length === 0`);

  // ---- arm 2: happy path — one settled shot, full schema-v2 assert -----------
  // known-good scripted shot (the e2e-i18n foul recipe): deterministic,
  // settles fast, and lands one entry in scenarioLog + the share log
  await chrome.eval(`__test.layout([
    { id: 0, x: 0, y: -0.4 }, { id: 2, x: 0, y: 0.2 },
    { id: 1, x: -0.5, y: -1.0 }, { id: 9, x: 0.4, y: 0.9 }])`);
  const shotErr = await chrome.eval(
    '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (shotErr) throw new Error('scripted shot rejected: ' + shotErr);
  await waitFor(`!['PLAYBACK', 'SIMULATING'].includes(window.__test.state())
    && window.__share.log().shots >= 1`, 'shot settle');
  // bundle v2: the rules backend (pool-rules glue) resolves on a dynamic
  // import — poll the seam, never trust boot timing (821324a doctrine)
  await waitFor(`typeof window.__rules?.rulesVersion?.() === 'string'`,
    'rules_version seam');

  await installAnchorHook();
  await openAbout();
  await chrome.eval(`${ROW}.click()`);
  check('row click produces a download (anchor hook caught it)',
    await pollFor(`typeof window.__dl?.[0]?.text === 'string'`));
  const arm2 = await chrome.eval(`(() => {
    const d = window.__dl[0];
    let bundle = null, parseErr = null;
    try { bundle = JSON.parse(d.text); } catch (e) { parseErr = String(e); }
    return { download: d.download, parseErr, bundle,
      liveBalls: window.__test.balls().length,
      seamEqual: window.__bugreport?.last() === d.text,
      downloads: window.__bugreport?.downloads?.() ?? -1,
      rowDisabled: ${ROW}.disabled };
  })()`);
  check('filename matches openbilliards-bugreport-<timestamp>.json',
    /^openbilliards-bugreport-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/
      .test(arm2.download), JSON.stringify(arm2.download));
  check('downloaded text parses as JSON', arm2.parseErr === null, arm2.parseErr ?? '');
  const b = arm2.bundle ?? {};
  check('bundle_version === 3 + generated_at ISO',
    b.bundle_version === 3 && typeof b.generated_at === 'string'
    && !Number.isNaN(Date.parse(b.generated_at)),
  JSON.stringify({ v: b.bundle_version, at: b.generated_at }));
  check('kernel_version: non-empty engine stamp',
    typeof b.kernel_version === 'string' && b.kernel_version.length > 0,
    JSON.stringify(b.kernel_version));
  // v2: the rules artifact stamp — a non-empty string on this healthy
  // tree (the seam was polled live above); an {error} entry is the only
  // other legal shape (absent/stale seam — the best-effort law)
  check('rules_version: non-empty rules stamp (or {error})',
    (typeof b.rules_version === 'string' && b.rules_version.length > 0)
    || typeof b.rules_version?.error === 'string',
  JSON.stringify(b.rules_version));
  // v2: the judgment ledger — the fired shot (wrong-first-ball foul
  // recipe: cue at the 2 while the 1 is lowest) must be the LAST entry,
  // with the shooter/legal verdict fields present as adjudicated. The
  // anchor is PINNED, not typeof-checked: seed 1 (APP_URL ?seed=1 →
  // main.js game.rerack(1); layout() touches neither seed nor shotIndex)
  // and shot 0 (the arm's single fired shot) are exactly deterministic
  // here — per-shot attribution is what the Amendment-v2 ledger is FOR,
  // so a mis-anchoring regression must trip this line. rack is the
  // fresh-table ordinal (boot rerack + the scripted layout = 2).
  const lastJ = Array.isArray(b.judgments)
    ? b.judgments[b.judgments.length - 1] : null;
  check('judgments: array whose last entry is the fired shot verdict',
    Array.isArray(b.judgments) && b.judgments.length >= 1
    && lastJ !== null && lastJ.shooter === 1 && lastJ.legal === false
    && Array.isArray(lastJ.fouls) && lastJ.fouls.includes('wrong-first-ball')
    && lastJ.seed === 1 && lastJ.shot === 0 && lastJ.rack === 2,
  JSON.stringify(lastJ));
  check('scenarios: >=1 exact scenario JSON strings, each parses',
    Array.isArray(b.scenarios) && b.scenarios.length >= 1
    && b.scenarios.every((s) => {
      try { return typeof s === 'string' && !!JSON.parse(s); }
      catch { return false; }
    }), JSON.stringify({ n: b.scenarios?.length }));
  check('balls: one entry per live ball (id/pocketed/pos present)',
    Array.isArray(b.balls) && b.balls.length === arm2.liveBalls
    && b.balls.length > 0
    && b.balls.every((x) => 'id' in x && 'pocketed' in x
      && Array.isArray(x.pos)),
  JSON.stringify({ n: b.balls?.length, live: arm2.liveBalls }));
  check('match_state + errors sections present',
    typeof b.match_state === 'string' && b.match_state.length > 0
    && Array.isArray(b.errors),
  JSON.stringify({ state: b.match_state, errors: b.errors }));
  check('settings: RAW persisted blob string (byte truth)',
    typeof b.settings === 'string' && b.settings.includes('"equipment"'),
    JSON.stringify(typeof b.settings));
  check('app: locale/look/game/seed/shotIndex/scripted',
    b.app?.locale === 'en' && typeof b.app?.look === 'string'
    && b.app?.game === 'nine_ball' && typeof b.app?.seed === 'number'
    && b.app?.shotIndex === 1 && b.app?.scripted === true,
  JSON.stringify(b.app));
  check('replay_url: decodable share link string',
    typeof b.replay_url === 'string' && b.replay_url.includes('#r='),
    JSON.stringify(typeof b.replay_url === 'string'
      ? b.replay_url.slice(0, 60) : b.replay_url));
  check('platform: userAgent + devicePixelRatio + viewport [w, h]',
    typeof b.platform?.userAgent === 'string' && b.platform.userAgent.length > 0
    && typeof b.platform?.devicePixelRatio === 'number'
    && Array.isArray(b.platform?.viewport) && b.platform.viewport.length === 2,
  JSON.stringify(b.platform));
  check('schema v3 is the CLOSED field list (no extra top-level keys)',
    Object.keys(b).sort().join(',') === ['app', 'balls', 'bundle_version',
      'errors', 'generated_at', 'judgments', 'kernel_version', 'match_state',
      'platform', 'replay_url', 'rules_version', 'scenarios',
      'settings', 'storage'].join(','),
  Object.keys(b).sort().join(','));
  // v3 (Amendment v3): the GH-534 G5 storage-degrade ledger — a healthy
  // run carries zero failed persists and no first key; an {error} entry
  // is the only sanctioned alternative shape (FR-003 best-effort law)
  check('storage: {persistFailed, firstKey} ledger (v3) or {error}',
    (typeof b.storage?.persistFailed === 'number'
      && (b.storage.firstKey === null || typeof b.storage.firstKey === 'string'))
    || typeof b.storage?.error === 'string',
  JSON.stringify(b.storage));
  check('__bugreport seam: last() equals the downloaded text, downloads()=1',
    arm2.seamEqual && arm2.downloads === 1 && !arm2.rowDisabled,
    JSON.stringify({ seamEqual: arm2.seamEqual, downloads: arm2.downloads }));

  // ---- arm 2b: judge-broken ledger row (Amendment v2 — the #44 catch path) ---
  // The resilience arm below breaks only the READ seam; this arm breaks
  // the JUDGE itself (flow.js failNextJudge TEST SEAM: the next
  // adjudication throws inside the judge try), so the ledger row the
  // amendment promises for a judge-broken session — {rack, seed, shot,
  // judgeError} where the verdict would have been — is actually gated.
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  await pollFor(`document.getElementById('ob-settings')
    .getClientRects().length === 0`);
  check('failNextJudge TEST SEAM armed',
    await chrome.eval(`window.__rules.failNextJudge('e2e-judge-fault') === true`));
  const shot2Err = await chrome.eval(
    '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (shot2Err) throw new Error('arm 2b scripted shot rejected: ' + shot2Err);
  await waitFor(`!['PLAYBACK', 'SIMULATING'].includes(window.__test.state())
    && window.__share.log().shots >= 2`, 'judge-fault shot settle');
  const arm2b = await chrome.eval(`(() => {
    const rows = window.__rules.judgments();
    return { last: rows[rows.length - 1] ?? null,
      reported: window.__test.errors
        .find((m) => String(m).includes('e2e-judge-fault')) ?? null,
      state: window.__test.state() };
  })()`);
  check('judge fault: catch pushed the {rack, seed, shot, judgeError} row',
    arm2b.last !== null && typeof arm2b.last.judgeError === 'string'
    && arm2b.last.judgeError.includes('e2e-judge-fault')
    && arm2b.last.rack === 2 && arm2b.last.seed === 1 && arm2b.last.shot === 1
    && arm2b.last.legal === undefined,
  JSON.stringify(arm2b.last));
  check('judge fault: reportError fired (loud surface), table back in AIM',
    typeof arm2b.reported === 'string'
    && arm2b.reported.startsWith('rules judge:') && arm2b.state === 'AIM',
  JSON.stringify({ reported: arm2b.reported, state: arm2b.state }));
  await openAbout();
  await chrome.eval(`${ROW}.click()`);
  check('download fires after the judge-broken shot',
    await pollFor(`typeof window.__dl?.[1]?.text === 'string'`));
  const arm2bDl = await chrome.eval(`(() => {
    let bundle = null, parseErr = null;
    try { bundle = JSON.parse(window.__dl[1].text); } catch (e) { parseErr = String(e); }
    return { parseErr, bundle };
  })()`);
  const b2b = arm2bDl.bundle ?? {};
  const lastJ2 = Array.isArray(b2b.judgments)
    ? b2b.judgments[b2b.judgments.length - 1] : null;
  check('bundle carries the judgeError row where the verdict would be',
    arm2bDl.parseErr === null && lastJ2 !== null
    && typeof lastJ2.judgeError === 'string'
    && lastJ2.judgeError.includes('e2e-judge-fault')
    && lastJ2.rack === 2 && lastJ2.seed === 1 && lastJ2.shot === 1
    && b2b.judgments[b2b.judgments.length - 2]?.shot === 0
    && b2b.errors.some((m) => String(m).includes('e2e-judge-fault')),
  JSON.stringify({ lastJ2, errors: b2b.errors }));
  // consume the ONE expected reportError entry — AFTER the bundle captured
  // it (the wounded-session errors section is part of the promise) — so
  // the zero-error gates below keep gating everything else unfiltered
  const spliced = await chrome.eval(`(() => {
    const errs = window.__test.errors;
    const i = errs.findIndex((m) => String(m).includes('e2e-judge-fault'));
    return i >= 0 ? errs.splice(i, 1)[0] : null;
  })()`);
  check('exactly the expected judge-fault error consumed from __test.errors',
    spliced !== null && await chrome.eval(`window.__test.errors
      .every((m) => !String(m).includes('e2e-judge-fault'))`),
  JSON.stringify(spliced));

  // ---- arm 3: resilience — broken provider still bundles ---------------------
  await chrome.eval(
    `window.__share.encode = () => { throw new Error('e2e-broken'); }; true`);
  await chrome.eval(`${ROW}.click()`);
  check('next download fires with __share.encode broken',
    await pollFor(`typeof window.__dl?.[2]?.text === 'string'`));
  const arm3 = await chrome.eval(`(() => {
    let bundle = null, parseErr = null;
    try { bundle = JSON.parse(window.__dl[2].text); } catch (e) { parseErr = String(e); }
    return { parseErr, bundle, downloads: window.__bugreport?.downloads?.() ?? -1 };
  })()`);
  const b3 = arm3.bundle ?? {};
  check('broken provider becomes {error: String(e)} — bundle still complete',
    arm3.parseErr === null
    && typeof b3.replay_url?.error === 'string'
    && b3.replay_url.error.includes('e2e-broken')
    && Array.isArray(b3.scenarios) && b3.scenarios.length >= 1
    && Array.isArray(b3.balls) && b3.balls.length > 0
    && typeof b3.kernel_version === 'string' && b3.kernel_version.length > 0
    && arm3.downloads === 3,
  JSON.stringify({ parseErr: arm3.parseErr, replay_url: b3.replay_url,
    downloads: arm3.downloads }));
  // v2 resilience sub-arm: the judgments seam stubbed to throw — the
  // field becomes {error}, the bundle STILL downloads (best-effort law)
  await chrome.eval(`window.__rules.judgments =
    () => { throw new Error('e2e-judgments-broken'); }; true`);
  await chrome.eval(`${ROW}.click()`);
  check('next download fires with __rules.judgments broken',
    await pollFor(`typeof window.__dl?.[3]?.text === 'string'`));
  const arm3b = await chrome.eval(`(() => {
    let bundle = null, parseErr = null;
    try { bundle = JSON.parse(window.__dl[3].text); } catch (e) { parseErr = String(e); }
    return { parseErr, bundle, downloads: window.__bugreport?.downloads?.() ?? -1 };
  })()`);
  const b3b = arm3b.bundle ?? {};
  check('broken judgments seam becomes {error} — bundle still complete',
    arm3b.parseErr === null
    && typeof b3b.judgments?.error === 'string'
    && b3b.judgments.error.includes('e2e-judgments-broken')
    && typeof b3b.rules_version === 'string' && b3b.rules_version.length > 0
    && Array.isArray(b3b.scenarios) && b3b.scenarios.length >= 1
    && arm3b.downloads === 4,
  JSON.stringify({ parseErr: arm3b.parseErr, judgments: b3b.judgments,
    downloads: arm3b.downloads }));
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  await sleep(500);
  const errsMain = await chrome.eval('window.__test.errors');
  if (errsMain.length) fail('app errors (arms 1-3): ' + errsMain.join(' | '));

  // ---- arm 4: stale-leaf degrade (cache-poison law, US2 scenario 3) — LAST ---
  chrome.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (params.request.url.includes('bugreport.js')) {
      chrome.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 404,
        responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }],
        body: Buffer.from('poisoned graph\n').toString('base64'),
      });
    } else chrome.send('Fetch.continueRequest', { requestId: params.requestId });
  });
  stalePoisonActive = true; // the poisoned 404's Log entry is expected from here
  await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*bugreport.js*' }] });
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=stale` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (stale arm)');
  await sleep(800);
  // the navigation wiped the in-page hook — reinstall so the "no download"
  // conjunct below is a REAL assert, not vacuously 0 (2026-07-21 review
  // finding: a regressed degrade that still fired a download went unseen)
  await installAnchorHook();
  await openAbout();
  await chrome.eval(`${ROW}.click()`);
  check('stale leaf: row degrades to disabled + aria-disabled',
    await pollFor(`${ROW}.disabled === true
      && ${ROW}.getAttribute('aria-disabled') === 'true'`));
  const staleAfter = await chrome.eval(`({
    modalOpen: document.getElementById('ob-settings').getClientRects().length > 0,
    active: window.__settings.activeSection(),
    downloads: window.__dl?.length ?? 0,
    errors: window.__test.errors.length })`);
  check('stale leaf: modal keeps working, zero page errors, no download',
    staleAfter.modalOpen && staleAfter.active === 'about'
    && staleAfter.downloads === 0 && staleAfter.errors === 0,
  JSON.stringify(staleAfter));
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  await sleep(400);

  // ---- cross-arm gates --------------------------------------------------------
  check('SC-004: zero non-origin network requests across all arms',
    nonOriginRequests.length === 0, nonOriginRequests.join(' | '));
  // UNFILTERED gate: the one expected noise (arm 4's poisoned resource-load
  // 404) was already excluded at capture time by its Log-entry URL
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome?.close();
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-BUGREPORT: FAILED' : 'E2E-BUGREPORT: PASS');
