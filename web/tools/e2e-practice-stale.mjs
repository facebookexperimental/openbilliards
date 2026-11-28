#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-practice-stale — GH-668 S5 slice 4 round 9 (review r1 P2-1 / P2-2 /
// P2-3; integrator rulings quoted in the slice-4 pr-body "Round 9"):
// the practice / drills copy the slice ADDED or REWORDED, judged under a
// STALE DICTIONARY served at the network, and the drill-end notice judged
// under the DVR's live-bed chrome hide. Seven legs, six arms (S1+S2 share
// a browser), one browser per boot, SEQUENTIAL (never concurrent):
//
//   S1 stale-complete (CDP offset 0): every locales/*.json is served in the
//      PRE-CHANGE shape (the documented transform STALE below — the arm
//      never reads git history) → a drill completes → the notice's title is
//      never the raw key `drills.endTitle`; it is the interpolated LEGACY
//      summary (the pre-change template with its {name} {score} {max}
//      params) — the drill name and score/max are on screen.
//      RED on 7995784c: title === 'drills.endTitle', body 'Drill complete'.
//   S2 stale-noScore (same session): the record S1 wrote sits under ONE
//      assist; the place read at ANOTHER never paints the raw key
//      `shell.place.practice.noScoreYet` — it reads the legacy
//      `drills.notPlayed` (has()-guarded fallback).
//      RED on 7995784c: '<name> · shell.place.practice.noScoreYet'.
//   S3 dvr-hold (CDP offset 1, FRESH dictionaries): an archived session is
//      opened (`__playback.openSession`) while the final drill shot is in
//      flight; openPlayer() awaits the settle, complete() mounts the notice
//      at that settle, then the player opens → with the player open
//      (`html.ob-pb-live`) the notice is NOT visible (visibility hidden — the
//      playback.css live-bed chrome law, drills.css restating it for the
//      body-level #ob-drill-end); after `__playback.close()`, still inside
//      its hold, it is visible again.
//      RED on 7995784c: visibility 'visible' over the open player.
//   S4 stale-module (CDP offset 2; GH-668 S5 slice 4 round 10, review r2
//      P2-3): the OPPOSITE mixed-cache pairing — a CACHED pre-notice drills.js
//      (DERIVED from the current module by fixtures/drills-stale-pre-notice.mjs:
//      the versioned compose → the base's one-template compose from the
//      legacy keys) is served at the network over FRESH locale JSON → the
//      completion summary still carries the drill NAME and SCORE/MAX (the
//      legacy templates keep their placeholders; the sentence verdicts live
//      under the round-10 keys drills.endComplete / drills.endRunEnded).
//      RED on 3d80f998: title 'Drill complete' (no name, no score).
//   S5 foul-tap (CDP offset 3; round 10, review r2 P2-2): a LIVE-FOLD drill
//      ends on a FOUL — century (the 14.1 high-run observer over the real
//      fourteenone-v1 fold): a soft opening stroke that reaches nothing is a
//      breaking foul (WPA 14.1), the visit ends on it; flow presents the foul
//      (AIM under the 14.1 cue-stays law, bannerKind 'foul', the 1.8 s
//      reaper) and the drill's notice mounts over it (#banner emptied under
//      the hold). The notice is TAPPED before the 1.8 s window closes, then
//      the locale flips (flow's renderText re-asserts an armed 14.1 foul in
//      AIM) → #banner stays EMPTY through the flip and after flow's window;
//      the table is untouched by the tap (state / aim / cue equal). RED on
//      3d80f998: the de foul banner returns on the flip (the notice is off
//      #banner, so HUD's tap-dismiss notification — gated on ITS banner —
//      never reached flow; the round-10 cure swallows the dismissed
//      settle's foul re-assert at the drills setBanner seam until the next
//      stroke). (A sandbox drill presents no foul at all — flow's sandbox
//      settle never arms bannerKind; the snooker fold routes a foul to the
//      play-again decision without arming it — so the 14.1 observer is the
//      one drill where the review scenario exists.)
//   S6 win-tap (CDP offset 4; GH-668 S5 practice round 13, review r3 P2-1 —
//      the ruling's arm "P-M"; §5's letter P-M is reserved for 031 canned
//      layouts and letters never re-use, so the leg lives here by position):
//      the WIN-tone twin of S5 — colours-clear over the live snooker-v1 fold,
//      the fold shaped black-on with the scores apart (the sanctioned
//      __rules.setMatchState seam; the e2e-drills s5 recipe), a soft stroke
//      that touches nothing = R4(b) foul-on-black → the FRAME ends: flow
//      routes WIN, arms bannerKind 'win' and paints the frame-win banner in
//      tone 'win'; the drill completes at 0 and its notice mounts over it.
//      The notice is TAPPED inside the runner's own 1.3 s window (RACK_MS —
//      its fresh frame pre-empts flow's 2.6 s WIN re-rack), then (a) a REAL
//      locale switch (flow's renderText re-asserts an armed 'win' in WIN)
//      and, on a fresh WIN run, (b) a DVR restore (`__playback.openSession`
//      inside the window parks the relay; the close re-routes through WIN,
//      where flow re-arms 'win' unless winDismissed — which an off-#banner
//      tap never set) → #banner stays EMPTY through the flip / the re-route,
//      the fresh frame and flow's window; a post-window flip paints nothing;
//      the table is untouched by the tap. RED on d29d2beb: (a) 'SPIELER 1
//      GEWINNT DEN FRAME — …' back on the de flip until the 1.3 s fresh
//      frame; (b) 'PLAYER 1 WINS THE FRAME — …' back on the WIN re-route
//      (the round-10 mirror swallowed tone 'foul' only).
//   S7 stale-active (CDP offset 5; round 13, review r3 P2-2 — the ruling's arm
//      "P-N"): the THIRD mixed-cache pairing — FRESH en.json + a STALE ACTIVE
//      dictionary (de, the transform STALE with the en pin skipped; en served
//      from the tree as-is). has() falls through to the fresh English copy
//      here (en carries the key), so the two practice.js sites the slice
//      keyed on new copy must gate on the ACTIVE dictionary: the Last-drill
//      line at another assist reads the recorded legacy de form
//      `<name> · Noch nicht gespielt` (drills.notPlayed), and a replay-locked
//      Drills / Free practice refusal notices the legacy condition key
//      shell.notice.replay in de ('Ein geteiltes Replay läuft') — never
//      'No score at … yet' / 'Stop the replay to …', and no missing-key warn
//      on the practice channel. RED on d29d2beb: 'Kreis-Drill · No score at
//      Ohne Hilfe yet' + 'Stop the replay to start free practice' (+ 2 warns).
//
// Ports: OB_E2E_PORT (http) / OB_E2E_CDP_PORT (cdp; offsets 0-5) — run-gate
// --band pins both; the bare defaults are e2e-practice's window (the suites
// are sequential within the lane).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { loadStaleDrills, BASE_COMPOSE, VERSIONED_MARK } from './fixtures/drills-stale-pre-notice.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8630);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8645);
export const PORT_INVENTORY = { http: 1, cdp: 6 };
// SHARED_DEFAULT_WINDOW (e2e-practice) — same window as the suite (8630/8660) — suites are sequential within the lane.
export const SHARED_DEFAULT_WINDOW = 'e2e-practice';

// the en register the assertions compare against — strings by KEY from the
// in-tree locale file, never re-typed (the e2e-settings idiom)
const EN = JSON.parse(readFileSync(path.join(webDir, 'app/locales/en.json'), 'utf8'));
// the de register S7 compares against — the STALE de is the transform of
// this same file, so every LEGACY key (drills.notPlayed, shell.notice.replay,
// drills.name.*) reads the same bytes in both
const DE = JSON.parse(readFileSync(path.join(webDir, 'app/locales/de.json'), 'utf8'));
const SEED_DRILL = 'circle'; // e2e-practice's seed fixture: one shot completes it

// ---- the STALE dictionary = a documented TRANSFORM of the in-tree file ----
// The pre-change shape (main before this slice) as a transform — never a
// git read (the arms-never-read-git-history law):
//   (a) DROP the keys this slice ADDED: drills.endTitle (the notice's title
//       template), shell.place.practice.noScoreYet (the Last-drill card's
//       empty-score sentence) and, since round 10 (review r2 P2-3), the
//       sentence-verdict keys drills.endComplete / drills.endRunEnded, and,
//       since round 13 (review r3 P2-2), the G6 refusal keys
//       shell.place.practice.replayDrill / replayFree (added by this slice —
//       the pre-change dictionary names the condition, shell.notice.replay);
//   (b) PIN the two legacy templates to their pre-change bytes — en only
//       (the legs run the en locale; en.json is also the fallback + key
//       universe, so a stale en.json is the whole stale register):
//       drills.completeBanner 'DRILL COMPLETE — {name}: {score}/{max}',
//       drills.runEndedBanner 'RUN ENDED — {name}: {score}/{max}'. Round 10
//       restored exactly these bytes under the legacy keys in the tree
//       (the round-9 dictionary had reworded them), so hunk (b) is now an
//       idempotent pin — kept so the transform stays the pre-change shape
//       whatever a later round does to the in-tree values.
const STALE_DROP = new Set(['drills.endTitle', 'shell.place.practice.noScoreYet',
  'drills.endComplete', 'drills.endRunEnded',
  'shell.place.practice.replayDrill', 'shell.place.practice.replayFree']);
const STALE_EN_LEGACY = {
  'drills.completeBanner': 'DRILL COMPLETE — {name}: {score}/{max}',
  'drills.runEndedBanner': 'RUN ENDED — {name}: {score}/{max}',
};
const staleBody = (loc) => {
  const d = JSON.parse(readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
  for (const k of STALE_DROP) delete d[k];
  if (loc === 'en') Object.assign(d, STALE_EN_LEGACY);
  return Buffer.from(JSON.stringify(d)).toString('base64');
};
/** Serve every locale JSON of the session from the transform (must be armed
 * BEFORE the navigation that fetches them — the e2e-i18n / e2e-practice
 * P-A2(stale) idiom: Fetch.fulfillRequest, cache off). */
async function serveStaleLocales(c) {
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.clearBrowserCache').catch(() => {});
  let served = 0;
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const m = /\/app\/locales\/([\w-]+)\.json/.exec(params.request.url);
    if (!m) { c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); return; }
    served += 1;
    c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
      body: staleBody(m[1]) }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*.json*' }] });
  return () => served;
}

// ---- harness (the e2e-practice shapes) ------------------------------------
let failCount = 0;
let okCount = 0;
const fail = (msg) => { console.error('E2E-PRACTICE-STALE FAIL:', msg); process.exitCode = 1; failCount += 1; };
const bootUrl = (q = 'obtool=1&obshell=1&seed=1') => `http://127.0.0.1:${PORT}/app.html?${q}`;
async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitExpr(c, expr, tries = 60, stepMs = 40) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(stepMs);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
const gateErrors = async (c, sink, tag) => {
  const appErrs = await c.eval('(() => (window.__test?.errors ?? []).splice(0))()').catch(() => []);
  if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
  sink.length = 0;
};
const armOk = async (c, errs, f0, msg) => {
  if (c) await gateErrors(c, errs, msg.split(' ')[0]);
  if (failCount === f0) { console.log(msg); okCount += 1; return; }
  console.error(`E2E-PRACTICE-STALE: ${failCount - f0} failure(s) in this arm — OK line withheld (${msg.split(':')[0]})`);
};
const waitShell = (c) => waitExpr(c, 'typeof window.__shell === "object"', 40, 150);
const waitDrills = (c) => waitExpr(c, 'typeof window.__drills?.start === "function"', 60, 150);
const MOUNTED = 'typeof window.__practice === "object" && document.getElementById("ob-practice")?.hidden === false';
async function openAtPractice(c) {
  if (!(await waitShell(c))) return false;
  await c.eval(`__shell.isOpen() || __shell.openShell({}), true`);
  await c.eval(`__shell.go('practice'), true`);
  return waitExpr(c, MOUNTED);
}
/** Wait for a struck shot to settle (the e2e-drills settle shape). */
async function settle(c, tag) {
  let st = 'PLAYBACK';
  for (let i = 0; i < 150 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
    await sleep(400);
    st = await c.eval('__test.state()').catch(() => st);
  }
  if (st === 'PLAYBACK') fail(`${tag}: shot never settled`);
  return st;
}
const SHOT = '__test.shoot({ v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })';
/** Start the seed drill on the live table (the e2e-practice seedDrill shape
 * up to the strike). */
async function startSeed(c, tag) {
  await c.eval(`__shell.quickPlay(), true`);
  if (!(await waitDrills(c))) { fail(`${tag}: __drills never landed`); return false; }
  if (!(await c.eval(`window.__drills.start(${JSON.stringify(SEED_DRILL)})`))) { fail(`${tag}: seed start refused`); return false; }
  await sleep(400);
  return true;
}
/** Complete the seed drill: one strike, settle, the record written. */
async function completeSeed(c, tag) {
  if (!(await startSeed(c, tag))) return false;
  const err = await c.eval(SHOT);
  if (err) { fail(`${tag}: seed shoot rejected: ` + err); return false; }
  await settle(c, tag);
  if (!(await waitExpr(c, `window.__drills.last() === ${JSON.stringify(SEED_DRILL)}`, 50, 100))) {
    fail(`${tag}: seed never recorded (last() != '${SEED_DRILL}')`); return false;
  }
  return true;
}
const END_STATE = `(() => {
  const e = document.getElementById('ob-drill-end');
  return { up: !!e && e.style.display === 'block', display: e ? e.style.display : 'absent',
    title: e?.querySelector('.ob-drill-end__title')?.textContent ?? '',
    body: e?.querySelector('.ob-prompt__body')?.textContent ?? '',
    held: !!e && e.classList.contains('ob-drills-banner'),
    vis: e ? getComputedStyle(e).visibility : 'absent',
    pbLive: document.documentElement.classList.contains('ob-pb-live'),
    missing: (window.__i18n?.missing?.() ?? []).filter((k) => /^(drills\\.|shell\\.place\\.practice\\.)/.test(k)) };
})()`;
const RAW_KEY = /(^|[^\w.])(drills|shell)\.[a-zA-Z][\w.]*/;
const LAST_HINT = `(() => { const card = document.querySelector('[data-ob="practice-last"]');
  const line = card?.firstElementChild; return { tag: line?.tagName ?? null,
    hint: line?.querySelector('.ob-practice-hint')?.textContent ?? '' }; })()`;

// ---- S1 + S2 — the stale register ------------------------------------------
async function armS1S2() {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=s1pre'), { port: CDP_PORT, tool: false });
  watchErrors(c, errs);
  try {
    const served = await serveStaleLocales(c);
    await c.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&seed=1&u=s1') });
    if (!(await waitReady(c))) { fail('S1: boot never ready'); return; }
    if (!(await waitShell(c))) { fail('S1: no __shell'); return; }
    // the premise: the dictionary in force IS the stale one (served ≥ 1,
    // the two added keys absent, the legacy template present)
    const dict = await c.eval(`({ loc: window.__i18n?.locale?.() ?? null,
      hasEnd: window.__i18n.keys().includes('drills.endTitle'), hasNS: window.__i18n.keys().includes('shell.place.practice.noScoreYet'),
      complete: window.__i18n.t('drills.completeBanner') })`);
    if (served() < 1 || dict.loc !== 'en' || dict.hasEnd || dict.hasNS || dict.complete !== STALE_EN_LEGACY['drills.completeBanner']) {
      fail('S1 premise: the stale dictionary is not in force: ' + JSON.stringify({ served: served(), dict })); return;
    }
    // S1 — complete a drill under the stale register
    if (!(await completeSeed(c, 'S1'))) return;
    const e = await c.eval(END_STATE);
    const name = EN[`drills.name.${SEED_DRILL}`];
    const legacy = new RegExp(`^(DRILL COMPLETE|RUN ENDED) — ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\d+/\\d+$`);
    if (!e.up || !e.held) fail('S1: the end notice must be up and held after the completing settle: ' + JSON.stringify(e));
    if (RAW_KEY.test(e.title) || RAW_KEY.test(e.body)) {
      fail(`S1: a raw key on the notice under a stale dictionary (pre-fix: title 'drills.endTitle'): ` + JSON.stringify({ title: e.title, body: e.body }));
    }
    if (!legacy.test(e.title)) {
      fail(`S1: the title must be the interpolated LEGACY summary (name + score/max) when drills.endTitle is absent: ` + JSON.stringify({ title: e.title, body: e.body }));
    }
    if (e.missing.length) fail('S1: missing-key warnings on the practice / drills channel: ' + JSON.stringify(e.missing));
    console.log(`S1: stale register → notice title ${JSON.stringify(e.title)} body ${JSON.stringify(e.body)} (served ${served()} dictionaries)`);
    // S2 — the place at ANOTHER assist reads the legacy notPlayed, never the raw key
    if (!(await openAtPractice(c))) { fail('S2: practice never mounted'); return; }
    await sleep(150);
    const assist = await c.eval('window.__settings.get().assist');
    const rec = await c.eval(`window.__drills.bestsByAssist()[${JSON.stringify(SEED_DRILL)}]?.[${JSON.stringify(assist)}] ?? null`);
    if (!rec) { fail('S2 premise: S1 left no record under the current assist: ' + JSON.stringify({ assist, rec })); return; }
    const other = assist === 'off' ? 'standard' : 'off';
    await c.eval(`window.__settings.set('assist', ${JSON.stringify(other)}), true`);
    await sleep(150);
    const h = await c.eval(LAST_HINT);
    const want = `${name} · ${EN['drills.notPlayed']}`;
    if (RAW_KEY.test(h.hint)) fail(`S2: a raw key on the Last-drill line under a stale dictionary (pre-fix: 'shell.place.practice.noScoreYet'): ` + JSON.stringify(h));
    if (h.hint !== want) fail('S2: the line must read the legacy drills.notPlayed fallback: ' + JSON.stringify({ got: h, want }));
    const miss = await c.eval(`(window.__i18n?.missing?.() ?? []).filter((k) => /^(drills\\.|shell\\.place\\.practice\\.)/.test(k))`);
    if (miss.length) fail('S2: missing-key warnings on the practice / drills channel: ' + JSON.stringify(miss));
    console.log(`S2: stale register → Last-drill line ${JSON.stringify(h.hint)} at assist ${other} (record under ${assist})`);
    await armOk(c, errs, f0, 'S1+S2 OK: stale dictionary — the legacy end summary carries name + score, the Last-drill line reads notPlayed, no raw key, no missing-key warn');
  } finally { c.close(); }
}

// ---- S3 — the notice under the DVR -----------------------------------------
async function armS3() {
  const errs = [];
  const f0 = failCount;
  // ?archive=1: a scripted boot (obtool / seed) DISARMS the archive (the
  // e2e-archive hermetic convention); the DVR needs a real archived session
  const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&archive=1&u=s3'), { port: CDP_PORT + 1, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail('S3: boot never ready'); return; }
    if (!(await waitShell(c))) { fail('S3: no __shell'); return; }
    // (1) one archived session: a completed drill run, flushed
    if (!(await completeSeed(c, 'S3'))) return;
    // let the first notice's hold run out (a REAL tap would act on the table)
    if (!(await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display === 'none'`, 80, 150))) {
      fail('S3: the first notice never stood down'); return;
    }
    await c.eval('window.__archive.flush()');
    if (!(await waitExpr(c, '(async () => (await window.__archive.sessions()).length >= 1)()', 40, 250))) {
      fail('S3 premise: no archived session after the flush'); return;
    }
    const sid = await c.eval('(async () => (await window.__archive.sessions())[0].id)()');
    // (2) the final shot of a second run in flight → open the archive NOW
    if (!(await startSeed(c, 'S3b'))) return;
    const err = await c.eval(SHOT);
    if (err) { fail('S3b: shoot rejected: ' + err); return; }
    const inFlight = await c.eval('__test.state()');
    await c.eval(`window.__s3open = window.__playback.openSession(${JSON.stringify(sid)}); true`);
    const opened = await waitExpr(c, 'window.__playback.playerOpen() === true', 160, 250); // ≤ 40 s (awaitSettle's own 24 s bound inside)
    const e1 = await c.eval(END_STATE);
    if (!opened) { fail('S3: the player never opened after the settle: ' + JSON.stringify({ inFlight, e1 })); return; }
    if (!e1.pbLive) fail('S3: html.ob-pb-live must be set while the player is open: ' + JSON.stringify(e1));
    if (!e1.up || !e1.held) fail('S3 premise: the completion notice must be up (its hold outlives the open) when the player opens: ' + JSON.stringify(e1));
    if (e1.vis !== 'hidden') {
      fail(`S3: the drill-end notice must not be visible over the open player (pre-fix: visibility '${e1.vis}' — the playback.css live-bed list hides #banner, not the body-level #ob-drill-end): ` + JSON.stringify(e1));
    }
    console.log(`S3: player open (in flight: ${inFlight}) → notice up ${e1.up} held ${e1.held} visibility ${e1.vis}`);
    // (3) close inside the hold → visible again
    await c.eval('window.__playback.close(); true');
    if (!(await waitExpr(c, 'window.__playback.playerOpen() === false', 40, 100))) { fail('S3: the player never closed'); return; }
    await sleep(120);
    const e2 = await c.eval(END_STATE);
    if (e2.held) {
      if (e2.pbLive || e2.vis !== 'visible') fail('S3: after close, still inside its hold, the notice must be visible again: ' + JSON.stringify(e2));
      console.log(`S3: player closed inside the hold → visibility ${e2.vis}`);
    } else console.log(`S3: the hold ended before the close read (${JSON.stringify(e2)}) — the after-close half not exercised this run`);
    await armOk(c, errs, f0, 'S3 OK: the drill-end notice hides under html.ob-pb-live and shows again after the close');
  } finally { c.close(); }
}

// ---- S4 — the stale MODULE over fresh JSON (round 10, review r2 P2-3) -------
const esc = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function armS4() {
  const errs = [];
  const f0 = failCount;
  const stale = loadStaleDrills(webDir); // derived from THIS tree's module — no git
  if (stale.problems.length) {
    fail(`S4: the derived pre-notice drills.js is unsound — ${stale.problems.join('; ')} (fixtures/drills-stale-pre-notice.mjs; re-fit the transform to the compose hunk, never bypass it)`);
    return;
  }
  console.log(`S4 fixture: stale drills.js derived from the current module (${stale.bytes} → ${stale.derivedBytes} bytes; the base compose, no versioned keys, parses)`);
  const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=s4pre'), { port: CDP_PORT + 2, tool: false });
  watchErrors(c, errs);
  try {
    // the module must reach the NETWORK in the judged document (the F1i
    // precedent: the heuristic HTTP cache would hand a young checkout's
    // fresh module to the second document without a request)
    await c.send('Network.enable');
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Network.clearBrowserCache').catch(() => {});
    const body = Buffer.from(stale.src, 'utf8').toString('base64');
    let served = 0;
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/\/app\/drills\.js(\?|$)/.test(params.request.url)) {
        served += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
          body }).catch(() => {});
      } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/drills.js*' }] });
    await c.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&seed=1&u=s4') });
    if (!(await waitReady(c))) { fail('S4: boot never ready under the stale module'); return; }
    if (!(await waitShell(c))) { fail('S4: no __shell'); return; }
    // the premise: the module in force IS the derived one (served ≥ 1; the
    // bytes at the network carry the base compose and not the versioned
    // one) and the dictionary is the TREE's (fresh: drills.endTitle present)
    const pose = await c.eval(`fetch('/app/drills.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => ({ base: t.includes(${JSON.stringify(BASE_COMPOSE)}), versioned: t.includes(${JSON.stringify(VERSIONED_MARK)}), len: t.length })).catch((e) => ({ err: String(e) }))`);
    const dict = await c.eval(`({ loc: window.__i18n?.locale?.() ?? null,
      hasEnd: window.__i18n.keys().includes('drills.endTitle'), hasVerdict: window.__i18n.keys().includes('drills.endComplete'),
      complete: window.__i18n.t('drills.completeBanner'), runEnded: window.__i18n.t('drills.runEndedBanner') })`);
    if (served < 1 || !pose.base || pose.versioned || dict.loc !== 'en' || !dict.hasEnd) {
      fail('S4 premise: the stale module over the fresh dictionary is not in force: ' + JSON.stringify({ served, pose, dict })); return;
    }
    if (!dict.hasVerdict) console.log('S4: (the tree dictionary carries no drills.endComplete — the pre-round-10 shape; the reads below judge the legacy templates as they are)');
    // a drill completes under the stale module: the summary it composes
    // from the legacy keys alone must carry the NAME and the SCORE/MAX
    if (!(await completeSeed(c, 'S4'))) return;
    const e = await c.eval(END_STATE);
    const name = EN[`drills.name.${SEED_DRILL}`];
    const summary = new RegExp(`${esc(name)}.*\\b\\d+/\\d+\\b`);
    if (!e.up || !e.held) fail('S4: the end notice must be up and held after the completing settle: ' + JSON.stringify(e));
    if (RAW_KEY.test(e.title) || RAW_KEY.test(e.body)) fail('S4: a raw key on the notice under the stale module: ' + JSON.stringify({ title: e.title, body: e.body }));
    if (!summary.test(e.title)) {
      fail(`S4: a cached pre-notice drills.js composes its WHOLE summary from the legacy keys — over the fresh dictionary the title must still carry the drill name and score/max (pre-fix: the round-9 dictionary had dropped the placeholders, leaving ${JSON.stringify(e.title)}): ` + JSON.stringify({ title: e.title, body: e.body }));
    }
    // the legacy templates themselves: the pre-change bytes, verbatim (the
    // versioned-copy precedent — a retained legacy key never changes shape)
    for (const [k, want] of Object.entries(STALE_EN_LEGACY)) {
      const got = k === 'drills.completeBanner' ? dict.complete : dict.runEnded;
      if (got !== want) fail(`S4: the retained legacy template ${k} must be the pre-change bytes verbatim: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
    if (e.missing.length) fail('S4: missing-key warnings on the practice / drills channel: ' + JSON.stringify(e.missing));
    console.log(`S4: stale module + fresh dictionary → notice title ${JSON.stringify(e.title)} body ${JSON.stringify(e.body)} (served ${served})`);
    await armOk(c, errs, f0, 'S4 OK: a cached pre-notice drills.js over fresh JSON keeps the drill name + score/max on the run-end summary (the legacy templates verbatim under the legacy keys; the sentence verdicts under the round-10 keys)');
  } finally { c.close(); }
}

// ---- S5 — the notice tap under a LIVE-FOLD foul (round 10, review r2 P2-2) --
// the caps register read (text / inline display / tone) with the state and locale
const BANNER = `(() => { const b = document.getElementById('banner');
  return { text: b?.textContent ?? '', display: b?.style.display ?? 'absent', foul: !!b?.classList.contains('foul'),
    st: __test.state(), loc: window.__i18n?.locale?.() ?? null }; })()`;
// the table facts a tap must leave alone (state, aim, the cue ball)
const TABLE = `(() => { const b = __test.balls().find((x) => x.id === 0); return { st: __test.state(), phi: window.__aim?.getPhi?.() ?? null, pocketed: !!b?.pocketed, pos: b?.pos ?? null }; })()`;
// an INERT point for the tap: the desk HUD panel's own padding (#hud is
// pointer-active chrome on the fine register — a press there never reaches
// the canvas, whose click re-aims the cue in AIM; the r10 tap probe read
// #hud / #state / #help / #ob-toolbar inert, every canvas point re-aiming),
// first candidate whose hit-test is that element and no control; the arm
// verifies inertness after the tap (state / aim / cue unchanged)
const TAP_POINT = `(() => { for (const sel of ['#hud', '#state', '#help']) { const el = document.querySelector(sel); if (!el) continue;
  const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue; const x = Math.round(r.left + 4), y = Math.round(r.top + 4);
  const h = document.elementFromPoint(x, y); if (h && el.contains(h) && !h.closest('button, input, select, textarea, a, [role=button], [role=radio], [role=slider], canvas')) return { x, y, el: sel }; }
  return null; })()`;
/** Settle at a 50 ms cadence (the tap must land inside flow's 1.8 s window). */
async function settleFast(c, tag) {
  let st = 'PLAYBACK';
  for (let i = 0; i < 1200 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
    await sleep(50);
    st = await c.eval('__test.state()').catch(() => st);
  }
  if (st === 'PLAYBACK' || st === 'SIMULATING') fail(`${tag}: shot never settled`);
  return st;
}
async function armS5() {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=s5'), { port: CDP_PORT + 3, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail('S5: boot never ready'); return; }
    if (!(await waitShell(c))) { fail('S5: no __shell'); return; }
    // pre-warm the de dictionary so the mid-window flip is a broadcast, not a fetch
    await c.eval(`window.__settings.set('language', 'de'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'de'`, 60, 100))) { fail('S5: de never landed (pre-warm)'); return; }
    await c.eval(`window.__settings.set('language', 'en'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 60, 100))) { fail('S5: en never landed back'); return; }
    await c.eval(`__shell.quickPlay(), true`);
    if (!(await waitDrills(c))) { fail('S5: __drills never landed'); return; }
    // ONE cycle: the run-ending scratch → the notice → the tap inside the
    // window → the de flip inside the window → the caps register sampled
    // through the flip and past flow's window → the post-window en flip.
    // Returns null when a premise failed (the arm failed it), else the facts.
    const cycle = async (v0, n) => {
      const tag = `S5 c${n} v0 ${v0}`;
      if (!(await c.eval(`window.__drills.start('century')`))) { fail(`${tag}: century start refused`); return null; }
      // the kitchen grant (a synthetic BALL_IN_HAND) addresses the break
      if (!(await waitExpr(c, `window.__drills.state()?.id === 'century' && !window.__drills.state()?.done && (__test.state() === 'BALL_IN_HAND' || __test.state() === 'AIM')`, 120, 100))) {
        fail(`${tag}: the century drill never reached its break address`); return null;
      }
      await sleep(400);
      // a soft stroke up the table that reaches no ball and no rail: the
      // 14.1 breaking foul — the observer's visit ends on it
      const err = await c.eval(`__test.shoot({ v0: ${v0}, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })`);
      if (err) { fail(`${tag}: shoot rejected: ` + err); return null; }
      const st = await settleFast(c, tag);
      const tSettle = Date.now();
      const ds = await c.eval('window.__drills.state()');
      const j = await c.eval(`(() => { const j = window.__rules.judgment(); return { legal: j?.legal, fouls: (j?.fouls ?? []).map((f) => f.code) }; })()`);
      if (!ds?.done || j.legal !== false || st === 'PLAYBACK') {
        console.log(`${tag}: the stroke did not foul-end the run (${JSON.stringify({ st, done: ds?.done, j })}) — retrying`);
        await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display !== 'block'`, 80, 150); // a real tap would act on the table
        return { retry: true };
      }
      if (!(await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display === 'block'`, 50, 20))) { fail(`${tag}: the end notice never showed after the foul`); return null; }
      const e0 = await c.eval(END_STATE);
      const b0 = await c.eval(BANNER);
      if (b0.text !== '') fail(`${tag} premise: #banner must be EMPTY under the hold: ` + JSON.stringify(b0));
      const pt = await c.eval(TAP_POINT);
      if (!pt) { fail(`${tag}: no inert canvas tap point found`); return null; }
      const before = await c.eval(TABLE);
      // a REAL pointer press (eval .click() dispatches no pointerdown and
      // would never exercise the capture-phase dismiss seams)
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      }
      const tTap = Date.now();
      if (!(await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display === 'none'`, 20, 30))) fail(`${tag}: the tap did not dismiss the notice: ` + JSON.stringify(await c.eval(END_STATE)));
      const b1 = await c.eval(BANNER);
      const after = await c.eval(TABLE);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        fail(`${tag} premise: the tap point acted on the table (state / aim / cue changed): ` + JSON.stringify({ pt, before, after })); return null;
      }
      await c.eval(`window.__settings.set('language', 'de'), true`);
      const landed = await waitExpr(c, `window.__i18n?.locale?.() === 'de'`, 60, 25);
      const tFlip = Date.now();
      if (!landed) { fail(`${tag}: de never landed`); return null; }
      const seen = [];
      for (let i = 0; i < 50; i++) { // 2.5 s: through the flip and past flow's 1.8 s window
        const b = await c.eval(BANNER);
        if (b.text !== '') seen.push({ at: Date.now() - tSettle, ...b });
        await sleep(50);
      }
      await c.eval(`window.__settings.set('language', 'en'), true`);
      await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 60, 50);
      await sleep(300);
      const b3 = await c.eval(BANNER);
      return { retry: false, v0, e0, b0, b1, b3, pt, seen, fouls: j.fouls, st: after.st, tapAt: tTap - tSettle, flipAt: tFlip - tSettle, inWindow: tFlip - tSettle < 1700 };
    };
    // a stroke that somehow reaches a rail is legal (the drill restarts,
    // softer); a flip that lands outside the window re-runs the cycle
    let facts = null;
    let n = 0;
    for (const v0 of [0.3, 0.2, 0.3]) {
      n += 1;
      const r = await cycle(v0, n);
      if (r === null) return;
      if (r.retry) continue;
      facts = r;
      if (r.inWindow || r.seen.length) break;
      console.log(`S5 c${n}: the de flip landed ${r.flipAt} ms after the settle — outside flow's 1.8 s window; re-running the cycle`);
    }
    if (!facts) { fail('S5 premise: no cycle produced a run-ending foul'); return; }
    if (facts.seen.length) {
      fail(`S5: the dismissed settle's foul banner RETURNED after the notice tap (tap +${facts.tapAt} ms, de flip +${facts.flipAt} ms after the settle, ${facts.inWindow ? 'inside' : 'outside'} flow's 1.8 s window) — the notice is off #banner, so HUD's tap-dismiss notification never reached flow's bannerKind; the tap must reach flow's dismissal outcome: first ` + JSON.stringify(facts.seen[0]) + ` (${facts.seen.length} samples)`);
    } else if (!facts.inWindow) {
      fail(`S5 premise: the de flip never landed inside flow's 1.8 s window (last cycle +${facts.flipAt} ms) — the arm could not exercise the re-assert`);
    }
    if (facts.b3.text !== '') fail('S5: the foul banner returned on the post-window en flip: ' + JSON.stringify(facts.b3));
    if (facts.b3.st !== facts.st) fail('S5 premise: the table changed state during the reads: ' + JSON.stringify({ was: facts.st, now: facts.b3 }));
    console.log(`S5: breaking foul ${JSON.stringify(facts.fouls)} (v0 ${facts.v0}, ${facts.st}) → notice ${JSON.stringify(facts.e0.title)} / ${JSON.stringify(facts.e0.body)} over #banner ${JSON.stringify(facts.b0.text)} → tap +${facts.tapAt} ms at the inert point ${facts.pt.x},${facts.pt.y} → de flip +${facts.flipAt} ms → #banner ${facts.seen.length ? 'RED ' + JSON.stringify(facts.seen[0].text) : 'empty through 2.5 s'} → en flip → ${JSON.stringify(facts.b3.text)} (${facts.b3.st})`);
    await armOk(c, errs, f0, 'S5 OK: a live-fold drill (century, 14.1) ending on a breaking foul — the notice tapped inside flow\'s 1.8 s window, then a locale flip inside the window and one after it: the dismissed foul banner never returns, the table untouched by the tap');
  } finally { c.close(); }
}

// ---- S6 — the notice tap under a LIVE-FOLD WIN (round 13, review r3 P2-1;
// the ruling's arm P-M) -----------------------------------------------------
/** The black-on WIN (the e2e-drills s5 recipe): returns the settle timestamp
 * with the notice up, or null (a premise failed and the arm failed it). */
async function winRun(c, tag) {
  if (!(await c.eval(`window.__drills.start('colours-clear')`))) { fail(`${tag}: colours-clear start refused`); return null; }
  if (!(await waitExpr(c, `window.__drills.state()?.id === 'colours-clear' && !window.__drills.state()?.done && (__test.state() === 'BALL_IN_HAND' || __test.state() === 'AIM')`, 120, 100))) {
    fail(`${tag}: the colours drill never reached its address`); return null;
  }
  await sleep(400);
  // black on, scores apart: ANY foul now ends the FRAME (WPBSA Sec3 R4(b))
  if (!(await c.eval(`window.__rules.setMatchState({ phase: 'final_colours', ballOn: 21, onTable: [21], scores: { 1: 30, 2: 0 }, shooter: 1 })`))) {
    fail(`${tag}: fold shaping rejected`); return null;
  }
  const err = await c.eval(`__test.shoot({ v0: 0.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })`);
  if (err) { fail(`${tag}: shoot rejected: ` + err); return null; }
  const st = await settleFast(c, tag);
  const tSettle = Date.now();
  if (st !== 'WIN') { fail(`${tag} premise: the black-on foul did not end the frame (state ${st})`); return null; }
  if (!(await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display === 'block'`, 50, 20))) { fail(`${tag}: the end notice never showed at the terminal`); return null; }
  return tSettle;
}
// ONE pre-tap read (the window is the runner's 1.3 s fresh frame — every
// round trip before the press costs part of it): the hold's facts, the inert
// point and the table facts the tap must leave alone
const PRE_TAP = `(() => { const e = document.getElementById('ob-drill-end'); const b = document.getElementById('banner');
  return { up: !!e && e.style.display === 'block', done: window.__drills.state()?.done === true, banner: b?.textContent ?? '',
    pt: ${TAP_POINT}, table: ${TABLE} }; })()`;
/** A REAL pointer press at an inert point (the S5 seam): the notice must
 * fall and the table must not move. Returns { tTap, pt }, { late } when the
 * runner's fresh frame landed before the press could be judged (the cycle
 * re-runs), or null (a premise failed and the arm failed it). */
async function tapNotice(c, tag, tSettle) {
  const pre = await c.eval(PRE_TAP);
  if (!pre.up || !pre.done) { fail(`${tag} premise: the notice must be up over a completed run at the terminal: ` + JSON.stringify(pre)); return null; }
  if (pre.banner !== '') fail(`${tag} premise: #banner must be EMPTY under the hold: ` + JSON.stringify(pre.banner));
  if (!pre.pt) { fail(`${tag}: no inert tap point found`); return null; }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await c.send('Input.dispatchMouseEvent', { type, x: pre.pt.x, y: pre.pt.y, button: 'left', clickCount: 1 });
  }
  const tTap = Date.now() - tSettle;
  if (!(await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display === 'none'`, 20, 30))) fail(`${tag}: the tap did not dismiss the notice: ` + JSON.stringify(await c.eval(END_STATE)));
  const after = await c.eval(TABLE);
  if (JSON.stringify(after) !== JSON.stringify(pre.table)) {
    if (after.st !== 'WIN' && Date.now() - tSettle > 1000) { // the fresh frame landed under this read — not the tap
      console.log(`${tag}: the runner's fresh frame landed before the tap could be judged (tap +${tTap} ms, read +${Date.now() - tSettle} ms, ${after.st}) — re-running the cycle`);
      return { late: true };
    }
    fail(`${tag} premise: the tap point acted on the table (state / aim / cue changed): ` + JSON.stringify({ pt: pre.pt, before: pre.table, after })); return null;
  }
  return { tTap, pt: pre.pt };
}
/** Sample #banner at 50 ms for `ms`: every non-empty read is a dismissed
 * banner coming back. */
async function watchBanner(c, ms, tSettle) {
  const seen = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const b = await c.eval(BANNER);
    if (b.text !== '') seen.push({ at: Date.now() - tSettle, ...b });
    await sleep(50);
  }
  return seen;
}
const standDown = (c) => waitExpr(c, `document.getElementById('ob-drill-end')?.style.display !== 'block' && __test.state() !== 'WIN' && __test.state() !== 'PLAYBACK'`, 80, 150);
async function armS6() {
  const errs = [];
  const f0 = failCount;
  // ?archive=1: leg (b)'s DVR needs a real archived session (the S3 convention)
  const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&archive=1&u=s6'), { port: CDP_PORT + 4, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail('S6: boot never ready'); return; }
    if (!(await waitShell(c))) { fail('S6: no __shell'); return; }
    // pre-warm de (the S5 idiom: the mid-window flip is a broadcast, not a fetch)
    await c.eval(`window.__settings.set('language', 'de'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'de'`, 60, 100))) { fail('S6: de never landed (pre-warm)'); return; }
    await c.eval(`window.__settings.set('language', 'en'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 60, 100))) { fail('S6: en never landed back'); return; }
    await c.eval(`__shell.quickPlay(), true`);
    if (!(await waitDrills(c))) { fail('S6: __drills never landed'); return; }
    // ---- leg (a): the locale repaint. The window is the runner's OWN 1.3 s
    // fresh frame (RACK_MS pre-empts flow's 2.6 s WIN re-rack): the tap and
    // the de flip must land inside it; a late tap / flip re-runs the cycle.
    let a = null;
    for (let n = 1; n <= 4 && !a; n++) {
      const tag = `S6a c${n}`;
      const tSettle = await winRun(c, tag);
      if (tSettle === null) return;
      const tap = await tapNotice(c, tag, tSettle);
      if (!tap) return;
      if (tap.late) { await standDown(c); continue; }
      await c.eval(`window.__settings.set('language', 'de'), true`);
      const landed = await waitExpr(c, `window.__i18n?.locale?.() === 'de'`, 60, 25);
      const tFlip = Date.now() - tSettle;
      if (!landed) { fail(`${tag}: de never landed`); return; }
      const seen = await watchBanner(c, 3500, tSettle); // through the flip, the 1.3 s fresh frame, past flow's 2.6 s mark
      await c.eval(`window.__settings.set('language', 'en'), true`);
      await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 60, 50);
      await sleep(300);
      const b3 = await c.eval(BANNER);
      if (tFlip < 1100 || seen.length) a = { ...tap, tFlip, seen, b3 };
      else { console.log(`${tag}: the de flip landed +${tFlip} ms after the settle — outside the runner's 1.3 s window; re-running the cycle`); await standDown(c); }
    }
    if (!a) { fail('S6a premise: no cycle landed the tap + de flip inside the 1.3 s window — the arm could not exercise the re-assert'); return; }
    if (a.seen.length) {
      fail(`S6a: the dismissed frame-WIN banner RETURNED after the notice tap (tap +${a.tTap} ms, de flip +${a.tFlip} ms after the settle) — the round-10 mirror settled the dismissal for tone 'foul' only, so flow's renderText re-painted its armed 'win' on the locale repaint; the tap must settle the dismissal for every tone the notice can hold: first ` + JSON.stringify(a.seen[0]) + ` (${a.seen.length} samples)`);
    }
    if (a.b3.text !== '') fail('S6a: the WIN banner returned on the post-window en flip: ' + JSON.stringify(a.b3));
    console.log(`S6a: black-on WIN → notice tapped +${a.tTap} ms at ${a.pt.el} → de flip +${a.tFlip} ms → #banner ${a.seen.length ? 'RED ' + JSON.stringify(a.seen[0].text) : 'empty through 3.5 s'} → en flip → ${JSON.stringify(a.b3.text)} (${a.b3.st})`);
    // ---- leg (b): the DVR restore. One archived session (leg (a)'s runs,
    // flushed); a fresh WIN run, the notice tapped, the player opened inside
    // the window (the borrow parks the runner's relay), closed → the close
    // re-routes through WIN → #banner must stay empty through the re-route,
    // the re-armed relay's fresh frame and flow's window.
    await standDown(c);
    await c.eval('window.__archive.flush()');
    if (!(await waitExpr(c, '(async () => (await window.__archive.sessions()).length >= 1)()', 40, 250))) { fail('S6b premise: no archived session after the flush'); return; }
    const sid = await c.eval('(async () => (await window.__archive.sessions())[0].id)()');
    let b = null;
    for (let n = 1; n <= 4 && !b; n++) {
      const tag = `S6b c${n}`;
      const tSettle = await winRun(c, tag);
      if (tSettle === null) return;
      const tap = await tapNotice(c, tag, tSettle);
      if (!tap) return;
      if (tap.late) { await standDown(c); continue; }
      await c.eval(`window.__playback.openSession(${JSON.stringify(sid)}), true`);
      const tReq = Date.now() - tSettle;
      if (!(await waitExpr(c, 'window.__playback.playerOpen() === true', 80, 50))) { fail(`${tag}: the player never opened`); return; }
      const tOpen = Date.now() - tSettle;
      const stOpen = await c.eval('__test.state()');
      await sleep(300);
      await c.eval('window.__playback.close(), true');
      if (!(await waitExpr(c, 'window.__playback.playerOpen() === false', 60, 100))) { fail(`${tag}: the player never closed`); return; }
      const tClose = Date.now() - tSettle;
      // the close's re-route lands on the WIN edge (measured ~2 s after the close)
      const rerouted = await waitExpr(c, `__test.state() === 'WIN'`, 120, 50);
      const tWin = Date.now() - tSettle;
      const seen = await watchBanner(c, 4000, tSettle); // the re-route, the relay's 1.3 s fresh frame, past flow's window
      await c.eval(`window.__settings.set('language', 'de'), true`);
      await waitExpr(c, `window.__i18n?.locale?.() === 'de'`, 60, 50);
      await sleep(300);
      const b3 = await c.eval(BANNER);
      await c.eval(`window.__settings.set('language', 'en'), true`);
      await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 60, 50);
      if (rerouted || seen.length) b = { ...tap, tReq, tOpen, stOpen, tClose, tWin, seen, b3 };
      else { console.log(`${tag}: the close did not re-route through WIN (open requested +${tReq} ms, opened +${tOpen} ms in ${stOpen}, now ${b3.st}) — the fresh frame beat the borrow; re-running the cycle`); await standDown(c); }
    }
    if (!b) { fail('S6b premise: no cycle opened the player inside the window with a WIN re-route on close — the arm could not exercise the re-presentation'); return; }
    if (b.seen.length) {
      fail(`S6b: the dismissed frame-WIN banner RETURNED on the DVR restore (tap +${b.tTap} ms, player open +${b.tOpen} ms in ${b.stOpen}, close +${b.tClose} ms, WIN re-route +${b.tWin} ms) — flow re-arms 'win' on the close's re-route unless winDismissed, which the off-#banner tap never set: first ` + JSON.stringify(b.seen[0]) + ` (${b.seen.length} samples)`);
    }
    if (b.b3.text !== '') fail('S6b: the WIN banner returned on the post-window de flip: ' + JSON.stringify(b.b3));
    console.log(`S6b: black-on WIN → tap +${b.tTap} ms → player open +${b.tOpen} ms (${b.stOpen}) → close +${b.tClose} ms → WIN re-route +${b.tWin} ms → #banner ${b.seen.length ? 'RED ' + JSON.stringify(b.seen[0].text) : 'empty through 4 s'} → de flip → ${JSON.stringify(b.b3.text)} (${b.b3.st})`);
    await armOk(c, errs, f0, 'S6 OK (ruling arm P-M): a live-fold drill ending in WIN — the notice tapped inside the runner\'s window, then (a) a real locale switch and (b) a DVR restore whose close re-routes through WIN: the dismissed frame-win banner never returns, HUD stays empty, the table untouched by the tap');
  } finally { c.close(); }
}

// ---- S7 — FRESH en.json + STALE ACTIVE de.json (round 13, review r3 P2-2;
// the ruling's arm P-N) -----------------------------------------------------
/** Serve every NON-en locale JSON of the session from the transform; en.json
 * passes through fresh from the tree (the pairing S1–S5 never held — their
 * whole register is stale, so has()'s en fallback had nothing to fall to). */
async function serveStaleActive(c) {
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.clearBrowserCache').catch(() => {});
  const served = { fresh: [], stale: [] };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const m = /\/app\/locales\/([\w-]+)\.json/.exec(params.request.url);
    if (!m || m[1] === 'en') {
      if (m) served.fresh.push(m[1]);
      c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); return;
    }
    served.stale.push(m[1]);
    c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
      body: staleBody(m[1]) }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*.json*' }] });
  return served;
}
const NOTE = `(() => ({ notice: __practice.lastNotice(), text: document.getElementById('ob-shell-note')?.textContent ?? null,
  open: __shell.isOpen(), replay: __share.replay().active }))()`;
const MISSING_PRACTICE = `(window.__i18n?.missing?.() ?? []).filter((k) => /^(drills\\.|shell\\.place\\.practice\\.|shell\\.notice\\.)/.test(k))`;
async function armS7() {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=s7pre'), { port: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  try {
    const served = await serveStaleActive(c);
    await c.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&seed=1&u=s7') });
    if (!(await waitReady(c))) { fail('S7: boot never ready'); return; }
    if (!(await waitShell(c))) { fail('S7: no __shell'); return; }
    await c.eval(`window.__settings.set('language', 'de'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'de'`, 60, 100))) { fail('S7: de never landed'); return; }
    // the premise: en FRESH (the key universe carries the slice's keys), de
    // STALE (served from the transform), the active locale de
    const dict = await c.eval(`({ loc: window.__i18n?.locale?.() ?? null, enNS: window.__i18n.keys().includes('shell.place.practice.noScoreYet'),
      enRF: window.__i18n.keys().includes('shell.place.practice.replayFree') })`);
    if (dict.loc !== 'de' || !dict.enNS || !dict.enRF || !served.stale.includes('de')) {
      fail('S7 premise: fresh en + stale active de is not in force: ' + JSON.stringify({ served, dict })); return;
    }
    // (1) the seed run under de — the notice is the legacy de summary (S1's law on this pairing)
    if (!(await completeSeed(c, 'S7'))) return;
    const e = await c.eval(END_STATE);
    const name = DE[`drills.name.${SEED_DRILL}`];
    if (RAW_KEY.test(e.title) || !e.title.includes(name)) fail('S7: the notice title under the stale active dictionary must be the legacy de summary: ' + JSON.stringify({ title: e.title, body: e.body }));
    // the hold runs out on its own (a real tap would act on the table)
    if (!(await waitExpr(c, `document.getElementById('ob-drill-end')?.style.display === 'none'`, 80, 150))) { fail('S7: the notice never stood down'); return; }
    // (2) the Last-drill line at ANOTHER assist: the recorded legacy de form, never the fresh English sentence
    if (!(await openAtPractice(c))) { fail('S7: practice never mounted'); return; }
    await sleep(150);
    const assist = await c.eval('window.__settings.get().assist');
    const other = assist === 'off' ? 'standard' : 'off';
    await c.eval(`window.__settings.set('assist', ${JSON.stringify(other)}), true`);
    await sleep(150);
    const h = await c.eval(LAST_HINT);
    const want = `${name} · ${DE['drills.notPlayed']}`;
    const enHead = EN['shell.place.practice.noScoreYet'].split('{')[0];
    if (h.hint.includes(enHead)) fail(`S7: the Last-drill line reads the fresh ENGLISH copy under a stale active de (has() fell through en.json; pre-fix 'Kreis-Drill · No score at Ohne Hilfe yet'): ` + JSON.stringify({ got: h, want }));
    else if (h.hint !== want) fail('S7: the line must read the recorded legacy de form: ' + JSON.stringify({ got: h, want }));
    // (3) the replay-locked refusals: the legacy condition key, in de
    await c.eval(`(() => { const real = window.__share.replay; window.__realReplay = real;
      window.__share.replay = () => ({ ...real(), active: true, done: false }); return true; })()`);
    const refusals = [];
    for (const [card, sel, enKey] of [['drills', '[data-ob="practice-drills"] button', 'shell.place.practice.replayDrill'],
      ['playground', '[data-ob="practice-playground"] button', 'shell.place.practice.replayFree']]) {
      const clicked = await c.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
      if (!clicked) { fail(`S7: no ${card} button`); continue; }
      await sleep(300);
      const r = await c.eval(NOTE);
      refusals.push({ card, ...r });
      if (!r.open || r.replay !== true) { fail(`S7 premise: the ${card} refusal must keep the shell open under the live lock: ` + JSON.stringify(r)); continue; }
      if (r.text === EN[enKey] || r.notice === enKey) fail(`S7: the ${card} refusal reads the fresh ENGLISH exit copy under a stale active de (pre-fix ${JSON.stringify(EN[enKey])}): ` + JSON.stringify(r));
      else if (r.notice !== 'shell.notice.replay' || r.text !== DE['shell.notice.replay']) fail(`S7: the ${card} refusal must notice the legacy condition key in de: ` + JSON.stringify({ r, want: DE['shell.notice.replay'] }));
      await sleep(200);
    }
    await c.eval(`(() => { if (window.__realReplay) window.__share.replay = window.__realReplay; return true; })()`);
    const miss = await c.eval(MISSING_PRACTICE);
    if (miss.length) fail('S7: missing-key warnings on the practice channel (the en fallback warns per key): ' + JSON.stringify(miss));
    console.log(`S7: fresh en + stale de (served ${JSON.stringify(served)}) → notice ${JSON.stringify(e.title)} → Last-drill line ${JSON.stringify(h.hint)} at assist ${other} (record under ${assist}) → refusals ${JSON.stringify(refusals.map((r) => [r.card, r.notice, r.text]))}`);
    await armOk(c, errs, f0, 'S7 OK (ruling arm P-N): fresh en.json + stale ACTIVE de.json — the Last-drill line reads the legacy de notPlayed form and both replay-locked refusals notice shell.notice.replay in de, never the fresh English copy, no missing-key warn');
  } finally { c.close(); }
}

const ARMS = [['S1+S2', armS1S2], ['S3', armS3], ['S4', armS4], ['S5', armS5], ['S6', armS6], ['S7', armS7]];
const only = (process.env.OB_E2E_PRACTICE_STALE_ARMS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ---- run ------------------------------------------------------------------
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
try {
  for (const [tag, arm] of ARMS) {
    if (only.length && !only.includes(tag)) continue;
    const f0 = failCount;
    try { await arm(); } catch (e) { fail(`${tag}: arm threw: ${e?.stack ?? e}`); }
    if (failCount !== f0) console.error(`E2E-PRACTICE-STALE: ${tag} red (${failCount - f0})`);
  }
} finally {
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-PRACTICE-STALE FAIL' : `E2E-PRACTICE-STALE PASS (${okCount} arms)`);
