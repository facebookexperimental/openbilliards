// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-archive.mjs — Playback session-archive gate (issue #225, 030 Phase A:
// feature 030 (internal spec)). Drives web/app/archive.js
// headlessly through window.__archive on a self-served web/:
//
//   arms:
//   0. hermetic boot (issue #14 law, extended to IndexedDB): a scripted
//      boot WITHOUT the ?archive=1 opt-in installs the DISARMED seam and a
//      settled shot writes NOTHING — indexedDB.databases() stays EMPTY,
//      localStorage stays empty.
//   1. match split semantics: a settled shot materializes a session whose
//      recordJson byte-equals __share.records() and whose judgment row is
//      the __rules.judgments() row for that settle; a seed-bearing rerack
//      SPLITS; a same-seed DECISION rerack (driven via __share.annotate)
//      does NOT split — the session gains a second rack SEGMENT instead,
//      and its records stay byte-equal to the surviving share log.
//   2. playground session (owner refinement 3): a play→playground mode
//      switch splits WITHOUT a rerack; the session records mode/playground;
//      a committed free placement (codec-v6 moves axis) lands on the shot
//      row; judgment is null BY DESIGN and markers degrade to ts + pots.
//   3. multi-rack drill = ONE session (concat-plan risk G1): ghost9 across
//      two racks stays a single session with two segments; drill markers
//      (start/rack/rerack/stop) ride the session; the CURRENT rack's
//      records byte-equal __share.records() (which reset at the rack-2
//      rerack — exactly the loss the archive exists to close).
//   4. restart survival: a same-tab Page.navigate reload (never a fresh
//      launchChrome — cdp.mjs rmSyncs the profile) reads back the identical
//      session list and byte-identical records.
//   5. replay exclusion: the in-app HUD Replay re-settle adds no row; a
//      full shared-replay pass (#r= navigation) archives nothing.
//   6. retention: the session-count cap and the byte cap evict OLDEST
//      sessions; the live session always survives.
//   7. judged rules re-rack (022 eightball-v2 re_break, config-in-state
//      injected — the shipped APA preset pins rail-minimum 0): the
//      same-seed re-rack fires INSIDE flow's shotComplete dispatch — the
//      session must NOT split, the causing dry break stays in segment 0,
//      and the new rack segment opens at the FIRST post-re-rack shot (the
//      review off-by-one: the segment latch must defer past the settling
//      shot).
//   All arms: zero console errors / app errors.
//
//   node web/tools/e2e-archive.mjs [--port 8307]   (needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8307);
// suite-unique CDP ports (parallel-worktree law)
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16501);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 2 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 2 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-ARCHIVE FAIL:', msg); process.exitCode = 1; };
const check = (tag, ok, detail = '') => {
  if (ok) console.log(`ok: ${tag}`);
  else fail(`${tag}${detail ? ` — ${detail}` : ''}`);
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

// ---- helpers ----------------------------------------------------------------
function watch(chrome, consoleErrors, consoleLogs = []) {
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const line = params.args.map((a) => a.value ?? a.description).join(' ');
      if (params.type === 'error') consoleErrors.push(line);
      else consoleLogs.push(line);
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      consoleErrors.push(params.entry.text);
    }
  });
}
const READY_TRIES = Number(process.env.OB_E2E_READY_TRIES ?? 200);
async function waitReady(chrome, what = 'app') {
  for (let i = 0; i < READY_TRIES; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error(`${what} never became ready`);
}
async function waitFor(chrome, expr, what, tries = 100, ms = 200, debugExpr = null) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  let debug = '';
  if (debugExpr) {
    debug = ` [debug: ${JSON.stringify(await chrome.eval(debugExpr).catch((e) => String(e)))}]`;
  }
  fail(`${what} never came true (${expr})${debug}`);
  return false;
}
async function fire(chrome, tag, shot) {
  const err = await chrome.eval(`__test.shoot(${JSON.stringify(shot)})`);
  if (err) { fail(`${tag}: shot rejected: ${err}`); return 'REJECTED'; }
  let state = 'PLAYBACK';
  for (let i = 0; i < 200 && (state === 'PLAYBACK' || state === 'SIMULATING'); i++) {
    await sleep(300);
    state = await chrome.eval('__test.state()');
  }
  if (state === 'PLAYBACK') fail(`${tag}: shot never settled`);
  return state;
}
const flush = (chrome) => chrome.eval('window.__archive.flush()');
const sessions = (chrome) => chrome.eval('window.__archive.sessions()');
const totalShots = (list) => list.reduce((s, m) => s + (m.shots || 0), 0);

// =============================================================================
// ---- arm 0: hermetic scripted boot — the archive writes NOTHING -------------
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5`, { port: CDP });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'hermetic boot');
    await waitFor(chrome, 'typeof window.__archive?.enabled === "function"',
      'disarmed __archive seam');
    check('0: scripted boot without opt-in is DISARMED',
      await chrome.eval('window.__archive.enabled()') === false);
    await fire(chrome, '0: scripted shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1200); // any (buggy) macrotask write would have landed
    const dbs = await chrome.eval('indexedDB.databases().then((l) => l.map((d) => d.name))');
    check('0: indexedDB stays EMPTY on a scripted boot (hermetic law)',
      Array.isArray(dbs) && dbs.length === 0, JSON.stringify(dbs));
    const ls = await chrome.eval('JSON.stringify(Object.keys(localStorage))');
    check('0: localStorage stays empty (the e2e.mjs probe, restated)', ls === '[]', ls);
    check('0: disarmed readers are inert',
      (await chrome.eval('window.__archive.sessions()')).length === 0
      && (await chrome.eval('window.__archive.usage()')).enabled === false);
    const appErr = await chrome.eval('__test.errors.slice()');
    check('0: zero app errors', appErr.length === 0, JSON.stringify(appErr));
    check('0: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- armed boot: arms 1-6 ----------------------------------------------------
{
  const errs = [];
  const logs = [];
  const sawLog = (frag) => logs.some((l) => l.includes(frag));
  const bootUrl = `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`;
  const chrome = await launchChrome(bootUrl, { port: CDP + 1 });
  watch(chrome, errs, logs);
  try {
    await waitReady(chrome, 'armed boot');
    await waitFor(chrome, 'typeof window.__archive?.enabled === "function"',
      'armed __archive seam');
    check('armed: opt-in arms the archive on a scripted boot',
      await chrome.eval('window.__archive.enabled()') === true);
    // no writes until a real user shot: armed boot + seam reads stay virgin
    check('armed: no DB before the first shot (reads never create it)',
      (await sessions(chrome)).length === 0
      && (await chrome.eval('indexedDB.databases().then((l) => l.length)')) === 0);

    // ---- arm 1: match split semantics --------------------------------------
    await fire(chrome, '1: shot A1', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    let list = await sessions(chrome);
    check('1: first settled shot materializes ONE session',
      list.length === 1 && list[0].shots === 1, JSON.stringify(list));
    check('1: session meta carries kernel/rules stamps + mode',
      typeof list[0].kernelVersion === 'string' && list[0].mode === 'play'
      && list[0].playground === false, JSON.stringify(list[0]));
    {
      const arc = await chrome.eval(`window.__archive.records(${list[0].id})`);
      const share = await chrome.eval('window.__share.records()');
      check('1: archived recordJson byte-equals __share.records()',
        arc.length === 1 && arc[0] === share[0],
        `${arc[0]?.length} vs ${share[0]?.length} bytes`);
      const row = await chrome.eval(`window.__archive.shot(${list[0].id}, 0)`);
      const rows = await chrome.eval('window.__rules.judgments()');
      const tail = rows[rows.length - 1];
      check('1: shot row carries the per-settle judgment ledger row',
        row?.judgment && JSON.stringify(row.judgment) === JSON.stringify(tail),
        JSON.stringify(row?.judgment));
    }
    // seed-bearing rerack SPLITS
    await chrome.eval('__test.rerack(7)');
    await sleep(400);
    await fire(chrome, '1: shot B1', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    list = await sessions(chrome);
    check('1: a seed-bearing rerack SPLITS the session',
      list.length === 2 && list[0].shots === 1, JSON.stringify(list.map((m) => m.shots)));
    // same-seed DECISION rerack does NOT split (share.js's exact
    // discrimination, inherited through the resetLog seam)
    check('1: decision annotation accepted',
      await chrome.eval('window.__share.annotate({kind:"decision",decision:1,choice:1})') === true);
    await chrome.eval('__test.rerack(7)'); // same seed as the running log
    await sleep(400);
    await fire(chrome, '1: shot B2', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    list = await sessions(chrome);
    check('1: a same-seed DECISION rerack does NOT split (mid-game)',
      list.length === 2 && list[0].shots === 2, JSON.stringify(list.map((m) => m.shots)));
    check('1: the mid-game rerack opened a second rack SEGMENT',
      list[0].segments?.length === 2 && list[0].segments[1].startIdx === 1,
      JSON.stringify(list[0].segments));
    {
      const arc = await chrome.eval(`window.__archive.records(${list[0].id})`);
      const share = await chrome.eval('window.__share.records()');
      check('1: decision-rerack session records byte-equal the SURVIVING share log',
        arc.length === 2 && share.length === 2
        && arc[0] === share[0] && arc[1] === share[1]);
    }

    // ---- arm 2: playground session ------------------------------------------
    check('2: mode switch to playground accepted',
      await chrome.eval('__settings.changeMode("playground")') === true);
    await waitFor(chrome, 'typeof window.__playground?.placeBall === "function"',
      '__playground seam');
    check('2: committed free placement accepted',
      await chrome.eval('window.__playground.placeBall(5, 0.31, 0.22)') === true);
    await fire(chrome, '2: playground shot 1', { v0: 1.4, phi: 0.4, theta: 0, a: 0, b: 0 });
    await fire(chrome, '2: playground shot 2', { v0: 1.2, phi: -0.7, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    list = await sessions(chrome);
    check('2: the mode switch split WITHOUT a rerack (table kept)',
      list.length === 3 && list[0].shots === 2, JSON.stringify(list.map((m) => m.shots)));
    check('2: playground session recorded as playground',
      list[0].mode === 'playground' && list[0].playground === true,
      JSON.stringify({ mode: list[0].mode, pg: list[0].playground }));
    {
      const row = await chrome.eval(`window.__archive.shot(${list[0].id}, 0)`);
      check('2: judgment is null in playground (absent by design)',
        row && row.judgment === null, JSON.stringify(row?.judgment));
      // the moves axis mirrors the v6 share-log wire VERBATIM — shotIndex
      // is the share-log-local index (the log survives the mode switch,
      // which reracks nothing); the session binding is the row it rides
      const mv = row?.placements?.moves ?? [];
      check('2: codec-v6 free placement rides the shot row',
        mv.some((m) => m.ball === 5
          && Math.abs(m.x - 0.31) < 1e-9 && Math.abs(m.y - 0.22) < 1e-9),
        JSON.stringify(row?.placements));
      const det = await chrome.eval(`window.__archive.session(${list[0].id})`);
      const shotMarkers = det.markers.filter((m) => m.kind === 'shot');
      check('2: markers degrade to shot ts + pots (no judgment fields)',
        shotMarkers.length === 2
        && shotMarkers.every((m) => Array.isArray(m.pots)
          && typeof m.ts === 'number' && m.legal === undefined),
        JSON.stringify(shotMarkers));
    }

    // ---- arm 3: multi-rack drill = ONE session (risk G1) --------------------
    const preDrill = (await sessions(chrome)).length;
    await waitFor(chrome, 'typeof window.__drills?.start === "function"', '__drills seam');
    check('3: ghost9 start accepted',
      await chrome.eval('window.__drills.start("ghost9")') === true);
    await waitFor(chrome, '__test.state() === "BALL_IN_HAND"', '3: rack-1 kitchen grant', 40);
    await fire(chrome, '3: rack-1 weak break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '3: rack-1 foul', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    // rack 1 lost → the drill's OWN seeded re-rack (RACK_MS) lands rack 2.
    // state().k flips at the VERDICT, before the re-rack macrotask — wait
    // for the '[drills] rerack' mirror (the e2e-drills arm-8 convention) so
    // the next stroke never fires into the inter-rack window (it would be
    // VOIDED by the decided-rack latch and land in rack-1's segment).
    let rrOk = false;
    for (let i = 0; i < 60 && !rrOk; i++) {
      await sleep(200);
      rrOk = sawLog('[drills] rerack {"id":"ghost9","rack":2}');
    }
    check('3: rack-2 rerack mirror observed', rrOk);
    await waitFor(chrome, 'window.__drills.state()?.k === 1', '3: rack-2 state');
    await waitFor(chrome, '__test.state() === "BALL_IN_HAND"',
      '3: rack-2 kitchen grant', 60, 200, '__test.state()');
    await fire(chrome, '3: rack-2 break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    list = await sessions(chrome);
    check('3: the whole drill run is ONE session (reracks did not split)',
      list.length === preDrill + 1, `sessions ${preDrill} -> ${list.length}`);
    const drillSess = list[0];
    check('3: drill session carries the drill id + practice mode',
      drillSess.drill?.id === 'ghost9' && drillSess.mode === 'practice',
      JSON.stringify(drillSess.drill));
    check('3: three shots across two rack segments',
      drillSess.shots === 3 && drillSess.segments?.length === 2
      && drillSess.segments[1].startIdx === 2
      && drillSess.segments[0].seed !== drillSess.segments[1].seed,
      JSON.stringify({ shots: drillSess.shots, segments: drillSess.segments }));
    {
      const arc = await chrome.eval(`window.__archive.records(${drillSess.id})`);
      const share = await chrome.eval('window.__share.records()');
      check('3: current-rack records byte-equal __share.records() '
        + '(the share log RESET at the rack-2 rerack — the G1 loss the archive closes)',
      share.length === 1 && arc.length === 3 && arc[2] === share[0]);
      const rows = await chrome.eval('window.__rules.judgments()');
      const rowFor = (r) => rows.find((j) => j.rack === r.rack
        && j.seed === r.seed && j.shot === r.shot);
      let allMatch = true;
      for (let k = 0; k < 3; k++) {
        const r = await chrome.eval(`window.__archive.shot(${drillSess.id}, ${k})`);
        const led = r?.judgment ? rowFor(r.judgment) : null;
        if (!led || JSON.stringify(led) !== JSON.stringify(r.judgment)) allMatch = false;
      }
      check('3: every archived judgment row byte-equals its ledger row', allMatch);
    }
    await chrome.eval('window.__drills.stop()');
    await flush(chrome);
    {
      const det = await chrome.eval(`window.__archive.session(${drillSess.id})`);
      const evs = (det.drill?.events ?? []).map((e) => e.ev);
      check('3: drill lifecycle markers recorded (start/rack/rerack/stop)',
        ['start', 'rack', 'rerack', 'stop'].every((e) => evs.includes(e)),
        JSON.stringify(evs));
      check('3: stopped drill outcome recorded', det.drill?.outcome === 'stopped');
    }

    // ---- arm 4: restart survival (same-tab reload) ---------------------------
    const before = await sessions(chrome);
    const beforeRecs = await chrome.eval(`window.__archive.records(${drillSess.id})`);
    await chrome.send('Page.navigate', { url: `${bootUrl}&obtool=1&u=reload` });
    await waitReady(chrome, 'reload boot');
    await waitFor(chrome, 'typeof window.__archive?.enabled === "function"',
      'reloaded __archive seam');
    const after = await sessions(chrome);
    check('4: session list survives the reload byte-identically',
      JSON.stringify(before) === JSON.stringify(after),
      `${before.length} vs ${after.length} sessions`);
    const afterRecs = await chrome.eval(`window.__archive.records(${drillSess.id})`);
    check('4: drill-session records survive byte-identically',
      JSON.stringify(beforeRecs) === JSON.stringify(afterRecs));

    // ---- arm 5: replay exclusion ---------------------------------------------
    await fire(chrome, '5: fresh shot 1', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '5: fresh shot 2', { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    let base = await sessions(chrome);
    const baseCount = base.length, baseShots = totalShots(base);
    check('5: post-reload shots opened a NEW session',
      baseCount === before.length + 1 && base[0].shots === 2,
      JSON.stringify(base.map((m) => m.shots)));
    // in-app HUD Replay: SAME record re-settle → identity guard, no row
    await chrome.eval('document.getElementById("replay").click()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"', '5: replay re-settle', 150, 400);
    await flush(chrome);
    base = await sessions(chrome);
    check('5: in-app Replay archived NO duplicate row',
      base.length === baseCount && totalShots(base) === baseShots,
      JSON.stringify(base.map((m) => m.shots)));
    // shared replay: a full #r= pass archives nothing. The encoded base is
    // the CURRENT location — vary the query (u=reload → u=replay) so the
    // navigation is a full document load, not a same-document #hash change
    // (which would never boot the replay).
    const shareUrl = String(await chrome.eval('window.__share.encode()'))
      .replace('u=reload', 'u=replay');
    await chrome.send('Page.navigate', { url: shareUrl });
    await waitReady(chrome, 'shared-replay boot');
    await waitFor(chrome, 'typeof window.__archive?.enabled === "function"',
      'replay-boot __archive seam');
    await waitFor(chrome, 'window.__share.replay().done === true',
      '5: shared replay finished', 240, 500,
      '({ replay: window.__share.replay(), state: __test.state() })');
    check('5: the shared replay actually replayed both shots',
      await chrome.eval('window.__share.replay().n') === 2);
    await flush(chrome);
    const rep = await sessions(chrome);
    check('5: a shared-replay pass archived NOTHING',
      rep.length === baseCount && totalShots(rep) === baseShots,
      JSON.stringify(rep.map((m) => m.shots)));
    await chrome.eval('window.__share.exit()');
    await sleep(600);

    // ---- arm 6: retention (oldest-eviction, live session survives) ----------
    await chrome.eval('window.__archive.configure({ maxSessions: 2 })');
    await chrome.eval('__test.rerack(11)');
    await sleep(400);
    await fire(chrome, '6: capped shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    let capped = await sessions(chrome);
    check('6: session-count cap evicts oldest down to the cap',
      capped.length === 2 && capped[0].shots === 1,
      JSON.stringify(capped.map((m) => m.id)));
    const liveId = capped[0].id;
    check('6: eviction kept the NEWEST sessions',
      capped.every((m) => m.id >= rep[1].id), JSON.stringify(capped.map((m) => m.id)));
    await chrome.eval('window.__archive.configure({ maxSessions: 100, maxBytes: 16 })');
    await chrome.eval('__test.rerack(12)');
    await sleep(400);
    await fire(chrome, '6: byte-capped shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await flush(chrome);
    capped = await sessions(chrome);
    check('6: byte cap evicts every non-live session; the LIVE one survives',
      capped.length === 1 && capped[0].id > liveId && capped[0].shots === 1,
      JSON.stringify(capped.map((m) => ({ id: m.id, bytes: m.bytes }))));
    const use = await chrome.eval('window.__archive.usage()');
    check('6: usage seam reports sessions/bytes/caps',
      use.sessions === 1 && use.bytes > 0 && use.caps?.maxBytes === 16,
      JSON.stringify(use));

    // ---- arm 7: judged rules re-rack segment law (022 re_break) -------------
    // flow.js's eightball-v2 re_break calls game.rerack on the SAME seed
    // synchronously inside the shotComplete dispatch, BEFORE this leaf's
    // shotComplete archives the causing shot. The session must survive
    // (mid-game rules re-rack, share.js's expectRulesRerack law) and
    // segments[1].startIdx must be the FIRST post-re-rack shot — the dry
    // break itself was played on the pre-re-rack table (segment 0).
    // Drive: the shipped APA preset pins dry_break_rail_minimum 0 (a dry
    // break is never judged re_break), so inject the Rust clause-pair
    // config (WPA defaults + dry_break_consequence re_break, minimum 4)
    // config-in-state through setMatchState — hash-matched via the ONE
    // crate hasher (rules_task_hash), the eightball_v2.rs
    // dry_break_consequence_pair fixture at the app surface.
    await chrome.eval(
      'window.__archive.configure({ maxSessions: 100, maxBytes: 50 * 1024 * 1024 })');
    check('7: switch to eight_ball accepted',
      await chrome.eval('window.__settings.changeGame("eight_ball", {skipConfirm:true})') === true);
    check('7: eightball-v2 variant engine selected (apa-8ball)',
      await chrome.eval('window.__settings.changeVariant("eight_ball", "apa-8ball")') === true);
    await chrome.eval('__test.rerack(31)');
    await sleep(400);
    check('7: fresh rack adopted the variant fold',
      await chrome.eval('window.__rules.variant()?.preset') === 'apa-8ball');
    check('7: re_break config injected (config-in-state, hash-matched)',
      await chrome.eval(`(async () => {
        const m = await import('/dist/pool-sdk/rules/backend.js');
        const env = JSON.stringify({ schema: 'task-config-v1',
          kind: 'rules-variant', family: 'eightball',
          config: { dry_break_consequence: 're_break' } });
        const config = JSON.parse(
          m.unwrap(m.wasm.rules_canonical_task_config_json(env))).config;
        const task_hash = m.unwrap(m.wasm.rules_task_hash(env));
        return window.__rules.setMatchState(
          { shooter: 1, breaker: 1, variant: { task_hash, config } });
      })()`) === true);
    // soft tap: <4 object balls to rails → judged dry → re_break (the
    // same-seed re-rack fires INSIDE this settle dispatch)
    await fire(chrome, '7: dry break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    check('7: judged re_break returned to the break phase, same breaker',
      await chrome.eval(
        'window.__rules.matchState()?.phase === "break" && window.__rules.matchState()?.shooter === 1'));
    // the re-break judges under the re-folded APA preset (minimum 0): the
    // same soft tap is now a LEGAL dry break — no second re_break to
    // re-latch the segment and mask the off-by-one
    await fire(chrome, '7: re-break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    check('7: re-break judged under the preset fold (no second re_break)',
      await chrome.eval('window.__rules.matchState()?.phase') !== 'break');
    await flush(chrome);
    const sess7 = (await sessions(chrome))[0];
    check('7: judged re_break kept the session (same-seed rules re-rack, mid-game)',
      sess7?.shots === 2, JSON.stringify({ shots: sess7?.shots }));
    check('7: re-rack segment opens at the FIRST post-re-rack shot',
      sess7?.segments?.length === 2 && sess7.segments[0].startIdx === 0
      && sess7.segments[1].startIdx === 1
      && sess7.segments[0].seed === sess7.segments[1].seed,
      JSON.stringify(sess7?.segments));

    // ---- error gates ---------------------------------------------------------
    const appErr = await chrome.eval('__test.errors.slice()');
    check('armed arms: zero app errors', appErr.length === 0, JSON.stringify(appErr));
    check('armed arms: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-ARCHIVE FAIL' : 'E2E-ARCHIVE PASS');
