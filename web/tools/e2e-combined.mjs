// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-combined.mjs — INTEGRATION gate: all three UX streams in one natural
// (share-reconstructible, no layout()) game on rack seed 1:
//   aim w/ preview on -> break -> no-contact foul (sound scheduled, foul
//   banner) -> BALL_IN_HAND anywhere -> 1->9 combo WIN -> share URL ->
//   reload -> replay byte-match. Screenshots: AIM / BALL_IN_HAND / REPLAY.
// Shot params planned offline against the kernel (same template/seeds the
// app uses: rack seed 1, shot seed = 1000 + shotIndex).
//
//   node web/tools/e2e-combined.mjs [--out <dir>]   (needs Chrome + node >= 22)
//
// #1108: the three screenshots go to --out <dir>, by default
// /tmp/e2e-combined-<cdp port> (laneArtifactDir, per lane under a port
// band), never into the checkout, so a run leaves `git status` clean. The
// committed web/e2e-combined-{aim,bih,replay}.png are reference frames that
// no check compares against; to refresh them on purpose, run from the
// repository root with `--out web` and commit the three files only after a
// PASS (a red run leaves them removed or mixed: git checkout them back).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  laneArtifactDir, launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-316 port hygiene: env-overridable like the sibling discipline suites
// (parallel worktree lanes carry assigned port ranges; the 20140/9231 pair
// stays the default so CI and solo runs are byte-identical).
const PORT = Number(process.env.OB_E2E_PORT ?? 20140);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9231);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-COMBINED FAIL:', msg); process.exitCode = 1; };

// #1108: one pass over the arguments before any server or browser starts. --out takes a directory (--out <dir> or
// --out=<dir>); a bare, blank or repeated --out, any other option and any positional argument are usage errors.
const usage = (why) => {
  console.error(`e2e-combined: ${why}; usage: node web/tools/e2e-combined.mjs [--out <dir>]`);
  process.exit(2);
};
let outArg = null;
for (let i = 2; i < process.argv.length; i++) {
  const m = /^--out(?:=([\s\S]*))?$/.exec(process.argv[i]);
  if (!m) usage(`unknown argument '${process.argv[i]}'`);
  if (outArg !== null) usage('--out given twice');
  const v = m[1] !== undefined ? m[1] : process.argv[++i];
  if (v === undefined || v.trim() === '' || v.startsWith('--')) usage('--out needs a directory');
  outArg = v;
}
const outDir = outArg === null ? laneArtifactDir('e2e-combined', CDP_PORT) : path.resolve(outArg);
const shot = (name) => path.join(outDir, `e2e-combined-${name}.png`);

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
// only now, with this run's ports held (a run refused on busy ports touches no captures): a red run must not leave an
// older capture that reads as this run's
fs.mkdirSync(outDir, { recursive: true });
for (const name of ['aim', 'bih', 'replay']) fs.rmSync(shot(name), { force: true });
console.log(`e2e-combined: screenshots go to ${outDir}`);
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) return;
    await sleep(200);
  }
  throw new Error('app never became ready');
}
// the settle poll snapshots state + judgment + banner in ONE page eval —
// and, at a terminal edge, the share surfaces too: the WIN's 2.6 s auto
// re-rack nulls the judgment surface, clears the banner AND resets the
// share log, so under load any separate post-settle read can land after
// that beat (GH-344; the e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner, share } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 240 && (settled.state === 'PLAYBACK' || settled.state === 'SIMULATING'); i++) {
    await sleep(400);
    settled = await chrome.eval(`(async () => {
      const state = __test.state();
      return { state,
        judgment: window.__rules.judgment(),
        banner: document.getElementById('banner').textContent,
        // encode() is async (buildShareUrl) — await the nested promise HERE:
        // Runtime.evaluate awaitPromise only awaits the top-level result
        share: state === 'WIN' ? { records: __share.records(),
          placements: __share.log().placements,
          url: await __share.encode() } : null };
    })()`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}

try {
  await waitReady();
  await sleep(800);
  // GH-326: audio is latched to REAL user activation (sound.js), so the
  // sound-scheduled assertion below earns its gesture the way a user would
  // — one trusted CDP click on open felt (e2e-record ensureAudioTap
  // precedent; scripted Runtime.evaluate grants nothing).
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent',
      { type, x: 20, y: 700, button: 'left', clickCount: 1 });
  }
  await sleep(300);
  // Catalog-policy flip: the whole 3-shot script below (incl. the planned
  // 1->9 combo; the no-contact foul survives only coincidentally) was
  // planned on the legacy WPA geometry and is CLI-verified broken on the
  // Diamond default — pin the ui_hidden legacy entry + its calibrated
  // Stronge cushion before any shot (see e2e.mjs).
  for (const [axis, id] of [['table_id', 'wpa_generic_9ft'],
    ['cushion_model_id', 'stronge_realistic']]) {
    const ok = await chrome.eval(
      `__settings.changeEquipment('${axis}', '${id}', { skipConfirm: true })`);
    if (ok !== true) fail(`equipment pin ${axis}=${id} rejected`);
  }
  await sleep(600); // re-rack settle (same wait as e2e-equipment.mjs)
  await chrome.eval(`__settings.set('soundOn', false)`); // headless: muted, still schedules

  // ---- AIM with the preview on: settings assist drives STREAM-A's preview
  await chrome.eval(`__settings.set('assist', 'practice')`);
  if (await chrome.eval('window.__aim.getAssist()') !== 'practice') {
    fail('settings assist=practice did not reach the preview');
  }
  await chrome.eval(`__settings.set('assist', 'standard')`);
  await chrome.eval('__test.aim(Math.PI / 2)');
  await sleep(400);
  const pv = await chrome.eval('window.__aim.preview()');
  if (pv?.level !== 'standard' || !pv?.contact) {
    fail('break aim preview missing/contactless: ' + JSON.stringify(pv));
  }
  await chrome.screenshot(shot('aim'));

  // ---- shot 0: break (legal dry -> turn passes to P2)
  // Re-planned 2026-07-11 for the feature-018 compliant cluster default
  // (flip-cascade.md §4) on wasm 0.1.0+3856cb9: the old b -0.1 seed-1
  // break now pockets ball 4 (shooter keeps the table); the dead-center
  // b 0 break is judged legal-dry offline (no pot, no foul).
  // Re-verified 2026-07-22 at the issue-87 repin (#77 Coulomb-cap slip
  // law) on wasm 0.1.0+fb3425ad: still judged legal-dry offline.
  const e0 = await chrome.eval('__test.shoot({ v0: 6.5, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (e0) fail('break rejected: ' + e0);
  if (await settle('break') !== 'AIM') fail('legal dry break did not return to AIM');
  if (await chrome.eval('window.__rules.player()') !== 2) fail('dry break did not pass the turn');

  // ---- shot 1: no-contact foul -> BALL_IN_HAND, sound scheduled, banner
  // Re-derived 2026-07-22 at the issue-87 repin (#77 Coulomb-cap slip
  // law reshapes the dry-break layout; flip-cascade.md §4 drill) on wasm
  // 0.1.0+fb3425ad: the cue now settles at kernel (0.1143, -1.1853) with
  // the 1 close by at (-0.0725, -1.1419) — the old -PI/2-0.25 aim now
  // clips it ("wrong-first-ball"), so the foul aims -PI/2+0.15 instead;
  // verifiably touches nothing (zero ball_ball events in the offline
  // kernel record, judged ["no-contact"] by the SDK planner sweep).
  const e1 = await chrome.eval('__test.shoot({ v0: 0.6, phi: -Math.PI / 2 + 0.15, theta: 0, a: 0, b: 0 })');
  if (e1) fail('foul shot rejected: ' + e1);
  if (await settle('foul') !== 'BALL_IN_HAND') fail('no-contact did not reach BALL_IN_HAND');
  const j1 = await chrome.eval('window.__rules.judgment()');
  if (JSON.stringify(j1?.fouls) !== '["no-contact"]') fail('foul judgment wrong: ' + JSON.stringify(j1?.fouls));
  if (await chrome.eval('window.__rules.player()') !== 1) fail('foul did not pass the turn back');
  const sched = await chrome.eval('window.__sound.scheduled');
  if (!(sched > 0)) fail('no audio nodes scheduled by the foul shot');
  console.log('sound nodes scheduled so far:', sched);
  const hudState = await chrome.eval(`document.getElementById('state').textContent`);
  if (!/BALL IN HAND/.test(hudState)) fail('HUD does not show BALL IN HAND: ' + hudState);
  await chrome.screenshot(shot('bih'));

  // ---- shot 2: ball-in-hand anywhere -> planned 1->9 combo WIN
  // Re-planned 2026-08-05 for GH-370 (the opening kitchen grant seats the
  // break address strictly behind the head string, −l/4 − 1e-6 — the 1 µm
  // shift reshapes the chaotic dry-break layout, so the 2026-07-22 combo
  // now clips the wrong ball first): ghost-ball chain + placement/phi/v0
  // sweep against the SDK's own judgeShot over the committed canonical
  // wasm — cue behind the 1 (now resting near the head-left rail) drives
  // the 1 (lowest) into the 9, the 9 drops in the HEAD-LEFT corner
  // (kernel pocket 0); judged legal gameOver (first contact the 1, no
  // scratch), pocketed [9]; the pick also wins at v0 2.5 (robustness
  // margin from the sweep).
  const place = { x: -0.5270010504354401, y: -1.1497963666282778 };
  if (!(await chrome.eval(`__test.placeCue(${place.x}, ${place.y})`))) {
    fail('planned ball-in-hand placement rejected');
  }
  const e2 = await chrome.eval('__test.shoot({ v0: 3.0, phi: 0.5924433714655818, theta: 0, a: 0, b: 0 })');
  if (e2) fail('win shot rejected: ' + e2);
  if (await settle('win') !== 'WIN') fail('1->9 combo did not reach WIN');
  const banner = settled.banner; // atomic with the WIN edge (see settle())
  if (!banner.includes('PLAYER 1 WINS')) fail('win banner wrong: ' + banner);

  // ---- share URL — snapshotted AT the WIN edge (the 2.6 s auto re-rack
  // resets the log; separate post-settle reads raced it under load)
  const originals = settled.share?.records ?? [];
  if (originals.length !== 3) fail(`expected 3 recorded shots, got ${originals.length}`);
  const shareLog = { placements: settled.share?.placements ?? {} };
  if (!shareLog.placements['2']) fail('ball-in-hand placement missing from share log');
  const url = settled.share?.url ?? '';
  console.log(`share URL for the 3-shot game: ${url.length} chars`);
  const hash = url.slice(url.indexOf('#'));

  // ---- reload with the hash -> auto replay -> byte-match
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html${hash}` });
  await sleep(500);
  await waitReady();
  let shotOne = false, rep = { done: false };
  for (let i = 0; i < 240; i++) {
    await sleep(400);
    rep = await chrome.eval('__share.replay()');
    if (!shotOne && rep.active && rep.i >= 0
        && await chrome.eval(`__test.state() === 'PLAYBACK'`)) {
      await chrome.screenshot(shot('replay'));
      shotOne = true;
    }
    if (rep.done) break;
  }
  if (!rep.done) fail('replay never finished: ' + JSON.stringify(rep));
  if (!shotOne) fail('never caught the replay in PLAYBACK for the screenshot');
  const replays = await chrome.eval('__share.records()');
  if (replays.length !== 3) fail(`replay produced ${replays.length} records, want 3`);
  replays.forEach((r, i) => {
    if (r === originals[i]) console.log(`record ${i}: byte-match OK (${r.length} bytes)`);
    else fail(`record ${i} does NOT byte-match the original (${r.length} vs ${originals[i].length} bytes)`);
  });

  // ---- error gates
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-COMBINED PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
