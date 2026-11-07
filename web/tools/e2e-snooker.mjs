// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-snooker.mjs — headless scripted snooker adjudication suite (feature
// 012 US2 T041, SC-002): drives a scripted WPBSA frame through the REAL
// app — 22-ball rack on the 12-ft table, red→colour scoring with the
// colour-nomination gate, the Sec3 R7 respot chain (occupied own spot →
// highest-value vacant spot), the blue-involved foul = 5-away Sec3 R11
// example with its cite on the scoreboard, the play-again option
// (decision 7), the D-zone ball-in-hand clamp (Sec3 R5/Sec2 R9), the
// final-colours endgame (colours stay down, R3(h)(ii)) and frame-win
// adjudication (R4(b)) — asserting judgment parity with the SDK
// snooker-v1 suite (identical foul codes + WPBSA cites, T035), HUD state,
// and the `[flow]` console hook wire (ballOnChanged / colourNominated /
// respotApplied / decisionRequired / decisionMade / foulCalled / gameWon).
//
// Discipline activation rides the flow adapter's story-lane TEST SEAM
// (__rules.activateSnooker): the public selector path keeps refusing
// config_ready entries until the US4 readiness flip — the catalog stays
// honest while this suite gates the lane.
//
// Issue #90 (S9a–S9d): the NATURAL-flow arm family — consecutive strokes
// across a real turn switch with NO setMatchState reshaping (the flow
// class of the owner's H1 report: incoming striker's red pot judged
// wrong-first). The __rules seams are consumed for ACTIVATION and scene
// layout only; every verdict is the genuine judge+adapter fold. Any
// incoming red pot judged non-legal dumps the judgment + the full
// __rules.judgments() ledger verbatim and stops the suite.
//
// Physics recipes are planned against the committed canonical wasm (the
// e2e-8ball.mjs precedent, baked constants proven by the T035 real-kernel
// arm): the corner-diagonal geometry below pots a ball cleanly on the
// snooker table; a cue sent down the same diagonal with nothing in the way
// scratches (no-contact + scratch).
//
//   node web/tools/e2e-snooker.mjs      (needs Chrome + node ≥22)
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports
//   (concurrent story lanes — check the defaults are free first).
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs'; // spawnSync / createHash / fs: LAND-11 T2 — the node kernel-replay mirror run once when a by-design UNJUDGEABLE row appears, its sha256 + argv printed on the row
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import {
  PROBE_SRC, runCornerProbe, judgeCornerProbe, MAT_PROBE_SRC, frameMatPins,
  judgeFrameMats,
} from './lib/cornerprobe.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 20770);     // own static server
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16367); // own CDP port
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
let failCount = 0; // GH-716 review r1v P3-b: blocks gate their OK line on it
const ownLog = []; // LAND-12 V3(e): the suite's OWN emitted verdict lines (the arm pass predicate reads these, never the page console)
const fail = (msg) => { console.error('E2E-SNOOKER FAIL:', msg); ownLog.push('E2E-SNOOKER FAIL: ' + msg); process.exitCode = 1; failCount += 1; };
let unjudgeableCount = 0; const unjudgeable = (msg) => { console.error('E2E-SNOOKER UNJUDGEABLE:', msg); ownLog.push('E2E-SNOOKER UNJUDGEABLE: ' + msg); if (!process.exitCode) process.exitCode = 2; unjudgeableCount += 1; };
// Exit precedence (LAND-11 T2): fail() sets 1 unconditionally; unjudgeable() sets 2 only while the exit is unset — so a run with any FAIL exits 1,
// a run whose only defect is an UNEXPLAINED refusal exits 2, and a by-design UNJUDGEABLE row (below) never sets the exit at all.
// LAND-11 T2 / LAND-12 C1: a refusal that carries a MEASURED by-design precondition (pocketedFlipSinceSettle — a ball the kernel calls pocketed at t0 that is not pocketed live; the tree has no per-ball revive marker, the seam names its inference) is
// UNJUDGEABLE BY DESIGN: named, counted, exit unchanged — PROVIDED the node kernel-replay mirror that carries clearance for this lane is present and green
// (check-sink-clearance-489.mjs on the same web, run once here); a refusal WITHOUT such a precondition, or a missing / red mirror, is the exit-2 channel above.
let byDesignCount = 0; const byDesignRows = []; let mirror = null;
const mirrorRow = () => { if (mirror) return mirror; const treeRoot = path.resolve(webDir, '..'); const renderArgvToken = (a) => { if (!path.isAbsolute(a)) return a; const rel = path.relative(treeRoot, a); return rel || '.'; }; // GH-852: one render for every printed argv token — option tokens verbatim (never resolved against process.cwd()), absolute paths relative to treeRoot, treeRoot itself '.' (the relative register the sibling tokens use), never ''
const mirrorPath = path.resolve(webDir, '..', 'tools', 'render', 'check-sink-clearance-489.mjs'); const mirrorWeb = ARM === 'seam-mirror-red' ? path.join(webDir, 'does-not-exist') : webDir; const argv = [mirrorPath, '--web', mirrorWeb]; let sha = 'unreadable'; try { sha = createHash('sha256').update(fs.readFileSync(mirrorPath)).digest('hex').slice(0, 16); } catch {} try { const r = spawnSync(process.execPath, argv, { cwd: treeRoot, encoding: 'utf8', timeout: 240000 }); const out = (r.stdout || '') + (r.stderr || ''); const pass = /\bPASS\b/.test(out) && !/\bFAIL\b/.test(out) && r.status === 0; const summary = (out.match(/PASS[^\n]{0,120}|FAIL[^\n]{0,120}/) || ['(no PASS/FAIL line)'])[0]; mirror = { pass, status: r.status, out, summary: `${summary} [mirror sha256 ${sha}, argv ${JSON.stringify(argv.map(renderArgvToken))}, rc ${r.status}]` }; } catch (e) { mirror = { pass: false, status: null, out: '', summary: `mirror could not run: ${e.message} [mirror sha256 ${sha}, argv ${JSON.stringify(argv.map(renderArgvToken))}]` }; } return mirror; };
const byDesignUnjudgeable = (tag, id, explained, machineState) => { const m = mirrorRow(); const rowTag = tag.replace(/ (red|cue)$/, ''); const rowRe = new RegExp('^\\[sink-clearance\\] ' + rowTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' v0 [0-9.]+ ball ' + id + ' pocket \\d+.*→ min clearance (-?[0-9.]+) mm at [^)]*\\) (OK|FAIL)$', 'm'); const rm = m.out ? m.out.match(rowRe) : null; const mirrorRowText = rm ? `mirror row ${rowTag} ball ${id}: min clearance ${rm[1]} mm ${rm[2]}` : `mirror row ${rowTag} ball ${id}: MISSING from the mirror output`; const line = `${tag}: UNJUDGEABLE (by design: pocketed flip since settle for ${explained.join(',')} — the kernel calls the ball pocketed at t0 and the live ball is not, the seam's named inference (no per-ball revive marker exists in the tree); machine ${machineState}) — this row's clearance is carried by the node kernel-replay mirror check-sink-clearance-489.mjs for the LEATHER classes only (corner cap + ends, middle cap + valance; the other mesh classes are unmeasured for this row): ${mirrorRowText}; mirror run: ${m.summary}`; if (m.pass && rm && rm[2] === 'OK') { console.log('E2E-SNOOKER UNJUDGEABLE-BY-DESIGN:', line); ownLog.push('E2E-SNOOKER UNJUDGEABLE-BY-DESIGN: ' + line); byDesignCount += 1; byDesignRows.push(tag); } else unjudgeable(line + ' — the named mirror row is missing or red (or the mirror run is red), so the refusal is not covered'); }; // LAND-12 V3(a)/C1: called only when EVERY refused id is explained (pocketed flip since settle) and ids is non-empty; the row text states THIS run's facts, never a coverage sentence

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [], consoleLogs = [];
// GH-337 (per-table-class bakes): level-split watch for the baked-GI
// footprint-mismatch fallback line. The snooker table used to be the
// canonical mismatch (GH-327 pinned it to ONE session-scoped debug); it
// now resolves its OWN committed bake class, so this watch must stay
// SILENT at every level for the whole suite — any line here means the
// class resolution regressed to the #52 fallback.
const giWarns = [], giDebugs = [];
// GH-489 SNK-R34: `--arm <name>` carries `&obArm=<name>` into the app (table.js obArmOn) — the red arms of the
// gameplay rows below (falls-plate: the pre-SNK-R34 plate-datum aperture)
const ARGV = process.argv.slice(2);
const ARM = ARGV.includes('--arm') ? ARGV[ARGV.indexOf('--arm') + 1] : null;
// LAND-12 V3(e): one table = the arm's name, its expectation (the banner prints it) and its routed proof text; an exit-2 arm passes only on banner + routed text + exit 2.
const ARM_TABLE = {
  'falls-plate': { expect: 'the S2p rows must FAIL', proof: /E2E-SNOOKER FAIL: S2p/ },
  'falls-perturb': { expect: 'the S2p rows must FAIL', proof: /E2E-SNOOKER FAIL: S2p/ },
  'throat-off': { expect: 'the S2p CLEARANCE rows must FAIL (no plate datum → no pre-roll → −6.57 mm)', proof: /E2E-SNOOKER FAIL: S2p/ },
  'seam-nudge': { expect: 'the S2p rows must be UNJUDGEABLE (exit 2): the cue moved 30 mm by placeCue before the first non-scratch row → the pre-check refuses naming offKernel id 0', proof: /UNJUDGEABLE: S2p: .*unexplained id\(s\) 0;.*"id":0,"dMm":30/ },
  'seam-respot': { expect: 'the S2p-scratch rows must be UNJUDGEABLE-BY-DESIGN with a green mirror (exit 0): the owner respot (__test.respotCue = game.respotCue, the live flow\'s path) applied after the S2p-scratch settle', proof: /UNJUDGEABLE-BY-DESIGN: S2p-scratch (red|cue)/ },
  'seam-mirror-red': { expect: 'the same respot, the mirror run pointed at a web dir that does not exist → the named mirror row must be MISSING/red → exit 2', proof: /UNJUDGEABLE: S2p-scratch (red|cue): .*mirror row .* MISSING/ },
  'seam-respot-nudge': { expect: 'COPY ARM (LAND-12 C2: runs on the whole instrumented copy web tree, whose e2e-snooker.mjs is sha-equal to the tip\'s; __nudge is arm-only): the same respot AND visible ball 16 nudged 30 mm → banner + the exit-2 line naming the nudged id 16 + exit 2; on a web without __nudge the arm FAILS by name (exit 1)', proof: /UNJUDGEABLE: S2p-scratch red: .*unexplained id\(s\) 16/ },
};
const KNOWN_ARMS = Object.keys(ARM_TABLE); // seam-nudge / seam-respot / seam-mirror-red / seam-respot-nudge: LAND-11/12 seam arms — see ARM_TABLE. UN-ARMED contract (LAND-12 V3(c)): the suite is NOT in drill mode (0 __drills hits; drills.js:632 finished = null; settings.js:183 mode 'play'; flow.js:579 sits inside settleUnderDrill, entered only when drillSandboxActive()); measured 2026-09-15 20:02Z (scratch12): machine AIM, cue still pocketed after S2p-scratch, 9 clearance rows measured / 0 UNJUDGEABLE — so EVERY clearance row is measurable, no by-design row, no mirror run, exit 0; an un-armed run that produces a by-design row exits 2 by name. Mechanism (read from code; the sentence here was stale at 4beb17bf — GH-853 — and is the LAND-14/15 corrected one): the suite runs the v1 ruleset (`activateSnooker('wpbsa-snooker')` at :232, re-pinned by V2-5 at :2082 before the S2 rows); a scratch foul gives the opponent ball-in-hand in the D (crates/pool-rules/src/rulesets/snooker.rs:523-524 `PlacementRight::DZone`) together with a pending `play_again` election (snooker.rs:592-594 `DecisionRequired`; the v2 analogue snooker_v2.rs:1092-1093 / :1163 is not the suite's ruleset), and flow.js parks the machine in AIM with the choice pending and returns (flow.js:1926-1935) BEFORE the in-hand routing at flow.js:2000-2008, so the cue stays pocketed until the choice is applied — which no suite row does before its clearance read.
if (ARGV.includes('--arm') && !KNOWN_ARMS.includes(ARM)) { console.error(`E2E-SNOOKER REFUSED: unknown --arm '${ARM}' (known: ${KNOWN_ARMS.join(', ')}) — a mistyped arm must not run the green suite`); process.exit(2); }
if (ARM) console.log(`[arm] ${ARM} (the app boots with &obArm=${ARM}; expectation: ${ARM_TABLE[ARM].expect})`);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1${ARM ? '&obArm=' + encodeURIComponent(ARM) : ''}`, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    const line = params.args.map((a) => a.value ?? a.description).join(' ');
    if (params.type === 'error') consoleErrors.push(line);
    else consoleLogs.push(line);
    if (line.includes('[gi] bake footprint')) {
      if (params.type === 'warning') giWarns.push(line);
      else if (params.type === 'debug') giDebugs.push(line);
    }
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const sawLog = (s) => consoleLogs.some((l) => l.includes(s));
const ev = (js) => chrome.eval(js);
// the settle poll snapshots state + judgment + banner in ONE page eval:
// a WIN's 2.6 s auto re-rack nulls the judgment surface (fresh frame), and
// under load a separate post-settle read can land after that beat (GH-344;
// the e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 220 && settled.state === 'PLAYBACK'; i++) {
    await sleep(350);
    settled = await ev(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}
/** Fire a scripted shot and wait for adjudication routing. */
async function shot(tag, params) {
  const err = await ev(`__test.shoot(${JSON.stringify(params)
    .replace('"PI2"', 'Math.PI / 2')})`);
  if (err) { fail(`${tag}: shoot rejected: ${err}`); return 'REJECTED'; }
  return settle(tag);
}
const judgment = () => ev('window.__rules.judgment()');
const match = () => ev('window.__rules.matchState()');
const player = () => ev('window.__rules.player()');
/** Scripted scene + match-state shaping (programmatic test seam). */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  if (ms && !(await ev(`window.__rules.setMatchState(${JSON.stringify(ms)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(ms));
  }
}

// ---- baked snooker-table pot lane (found offline against the committed
// wasm ON THE RACK'S OWN OPTIONS — snooker_napped cloth + Mathavan 2010
// cushions; NOTE the SDK-default-options corner diagonal does NOT capture
// here: the snooker jaws only accept a narrow corridor through the
// capture-disc centre of pocket 5, entered from this flatter angle) ------
const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 }; // pocket 5 capture centre
const ANCHOR = { x: 0.25, y: 1.0 };
const U = (() => {
  const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy);
  return { x: dx / n, y: dy / n };
})();
const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t });
const SPHI = Math.atan2(U.y, U.x); // ≈ 0.88290 rad — the capturing lane
const POT = LANE(0.35);   // object ball 0.35 m short of the capture centre
const CUE = LANE(0.95);   // cue 0.95 m out on the same lane
const SCRATCH_CUE = LANE(0.5); // a free cue roll from here scratches
const BAULK_Y = -1.0475, D_R = 0.292; // WPBSA Sec1 R1(d)-(f) (layouts mirror)
// colour spots (kernel rack.rs / sdk layouts.ts mirror)
const SPOT = {
  16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 },
  18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 },
  20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 },
};
const coloursAt = (...ids) =>
  ids.map((id) => ({ id, x: SPOT[id].x, y: SPOT[id].y }));
// ---- issue #90 natural-flow additions ---------------------------------------
const BALL_R = 0.02625; // WPBSA Sec1 R2 (layouts.ts mirror)
// y-mirrored pot lane into the HEAD-right corner — symmetry twin of the
// baked pocket-5 lane above, proven offline against the committed wasm
// (issue #90 probe): the same capture corridor reflected in y.
const CTRH = { x: CTR.x, y: -CTR.y };
const UH = { x: U.x, y: -U.y };
const LANEH = (t) => ({ x: CTRH.x - UH.x * t, y: CTRH.y - UH.y * t });
const SPHIH = Math.atan2(UH.y, UH.x);
/** Live kernel position of ball `id` (three frame: pos[2] = kernel x,
 * pos[0] = kernel y). */
const kposOf = async (id) => {
  const b = (await ev('__test.balls()')).find((x) => x.id === id);
  return b ? { x: b.pos[2], y: b.pos[0], pocketed: b.pocketed } : null;
};
/** Ghost-ball phi sending `ball` up the baked lane into the pocket-5
 * capture centre from the live cue rest — aim GEOMETRY only (the physics
 * stays kernel-side, constitution P-II); every recipe consuming this was
 * proven offline against the committed wasm (issue #90 probe ledger). */
const ghostPhi = (cue, ball) => {
  const g = { x: ball.x - U.x * 2 * BALL_R, y: ball.y - U.y * 2 * BALL_R };
  return Math.atan2(g.y - cue.y, g.x - cue.x);
};
/** Issue #90 H1 stop-clause: an incoming striker's red pot judged ANYTHING
 * but a clean legal +1 IS the owner's bug surfacing — dump the judgment and
 * the full __rules.judgments() ledger VERBATIM and stop the suite (do not
 * paper over it with later arms). */
async function assertIncomingRedPot(tag, j, potted) {
  if (j?.legal === true && (j?.fouls?.length ?? 0) === 0
    && JSON.stringify(j?.pocketed) === `[${potted}]` && j?.turn === 'continue') {
    return;
  }
  const ledger = await ev('window.__rules.judgments()');
  fail(`${tag}: *** H1 CLASS FAILURE — incoming striker's red pot not a clean legal +1 ***\n`
    + `judgment: ${JSON.stringify(j)}\n`
    + `judgments ledger (verbatim): ${JSON.stringify(ledger)}`);
  throw new Error(`${tag}: H1 reproduction — wave stopped (see dump above)`);
}
// pinned WPBSA cite strings — MUST equal the T035 suite's C map (cite parity)
const C = {
  // issue #62 erratum cites: Sec2 R11 ball-on def, Sec3 R5 in-hand,
  // R4(a) frame end
  wrongFirst: 'WPBSA Sec2 R11; Sec3 R10',
  noContact: 'WPBSA Sec2 R11; Sec3 R10',
  scratch: 'WPBSA Sec3 R5, R10',
  frameEnd: 'WPBSA Sec3 R4(a)',
};

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- S1: activation + 22-ball render sanity --------------------------------
  // GH-382 decision 1 (the default flip): the v1 regression battery below
  // is authored against the FROZEN snooker-v1 engine — pin the FR-005
  // alias explicitly (bare activation now folds the live default, the
  // wpbsa-snooker-full completion preset; V2-5 pins that).
  if (await ev("window.__rules.activateSnooker('wpbsa-snooker')", true)
    !== true) {
    throw new Error('activateSnooker failed — rules/games modules missing?');
  }
  await sleep(600); // table rebuild broadcast + first frames
  if (await ev('window.__rules.game()') !== 'snooker') fail('S1: active game not snooker');
  if (await ev('window.__rules.ready()') !== true) fail('S1: rules registry not live');
  const rack = await ev('__test.balls()');
  if (rack.length !== 22) fail(`S1: expected 22 balls, got ${rack.length}`);
  const reds = rack.filter((b) => b.id >= 1 && b.id <= 15);
  if (reds.length !== 15) fail('S1: expected 15 reds');
  for (const id of [16, 17, 18, 19, 20, 21]) {
    const b = rack.find((x) => x.id === id);
    // colours stand on their spots (three frame: x = kernel y, z = kernel x)
    if (!b || Math.abs(b.pos[2] - SPOT[id].x) > 1e-6
      || Math.abs(b.pos[0] - SPOT[id].y) > 1e-6) {
      fail(`S1: colour ${id} not on its spot: ` + JSON.stringify(b?.pos));
    }
  }
  let m = await match();
  if (m?.phase !== 'reds' || m?.ballOn !== 'red' || m?.redsRemaining !== 15) {
    fail('S1: fresh frame state wrong: ' + JSON.stringify(m));
  }

  // ---- S1-gi (GH-337 per-table-class bakes — supersedes the GH-327 arm):
  // the 12-ft snooker table now resolves its OWN committed bake class
  // (manifest.tables.snooker_12ft) instead of the #52 pre-GI fallback.
  // Red-proof vs the pre-337 renderer: this arm asserted fits=false /
  // uGiOn=0 / one footprint debug; it now demands the class bake LANDS —
  // uGiOn 1, fits true, bakeClass 'snooker_12ft', uGiBounds carrying the
  // class plan bounds, the 15×8 probe grid at the 52.5 mm ball radius —
  // and that the footprint-fallback console line never fires at ANY level.
  // A setLook round trip proves look regrades re-resolve the class.
  {
    let cls = null;
    for (let i = 0; i < 50 && cls !== 'snooker_12ft'; i++) {
      await sleep(200);
      cls = await ev('window.__gi?.state?.bakeClass ?? null');
    }
    if (cls !== 'snooker_12ft') {
      fail(`S1-gi: snooker bake class never resolved (bakeClass ${cls})`);
    }
    // GH-386 venue default: the activation must ALSO hang the snooker
    // luminaire (class-follow) and resolve its class × fixture bake —
    // red-proof vs the pre-386 renderer, which kept the pool canopy over
    // the 12-ft bed (the #385 audit Q3 corner vignette) and would report
    // fixture 'canopy_panel' here.
    let fx = null;
    for (let i = 0; i < 50 && fx !== 'snooker_luminaire'; i++) {
      await sleep(200);
      fx = await ev('window.__gi?.state?.fixture ?? null');
    }
    if (fx !== 'snooker_luminaire') {
      fail(`S1-gi: venue-default fixture never resolved (gi fixture ${fx})`);
    }
    const lt = await ev('window.__lighting?.state?.() ?? null');
    if (!lt || lt.fixture !== 'snooker_luminaire' || lt.auto !== true) {
      fail('S1-gi: lighting state is not the auto snooker luminaire: '
        + JSON.stringify(lt));
    }
    const halves = await ev('([__gi.uniforms.uLightHalf.value.x, '
      + '__gi.uniforms.uLightHalf.value.y])');
    if (Math.abs(halves[0] - 1.492) > 1e-4 || Math.abs(halves[1] - 0.10) > 1e-4) {
      fail(`S1-gi: derived-penumbra footprint ${JSON.stringify(halves)}, want `
        + '[1.492, 0.10] (GH-385/386 setEmitters)');
    }
    const st = await ev(`({ fits: __gi.state.fits,
      on: __gi.uniforms.uGiOn.value,
      b: [__gi.uniforms.uGiBounds.value.x, __gi.uniforms.uGiBounds.value.y,
        __gi.uniforms.uGiBounds.value.z, __gi.uniforms.uGiBounds.value.w],
      grid: __gi.state.probes && { nx: __gi.state.probes.grid.nx,
        nz: __gi.state.probes.grid.nz, y: __gi.state.probes.grid.y } })`);
    if (st.fits !== true || st.on !== 1) {
      fail(`S1-gi: class bake not applied (fits ${st.fits}, uGiOn ${st.on})`);
    }
    if (JSON.stringify(st.b) !== '[-2.06,-1.19,2.06,1.19]') {
      fail('S1-gi: uGiBounds is not the snooker_12ft plan bounds: '
        + JSON.stringify(st.b));
    }
    if (!st.grid || st.grid.nx !== 15 || st.grid.nz !== 8 || st.grid.y !== 0.02625) {
      fail('S1-gi: snooker probe grid wrong: ' + JSON.stringify(st.grid));
    }
    // look regrade round trip on the CLASS bake (the GH-327 trigger shape)
    if (await ev('window.__gi.setLook("sp")') !== true) {
      fail('S1-gi: setLook(sp) did not dispatch');
    }
    if (await ev('window.__gi.state.bakeClass') !== 'snooker_12ft'
      || await ev('window.__gi.uniforms.uGiOn.value') !== 1) {
      fail('S1-gi: sp regrade dropped the snooker class bake');
    }
    if (await ev('window.__gi.setLook("default")') !== true) {
      fail('S1-gi: setLook(default) did not dispatch');
    }
    await sleep(400); // console emissions flush
    if (giWarns.length || giDebugs.length) {
      fail(`S1-gi: footprint-fallback console lines on snooker (GH-337: the `
        + `class bake must resolve — ${giWarns.length} warns, `
        + `${giDebugs.length} debugs): ${(giWarns[0] ?? giDebugs[0])}`);
    } else {
      console.log('S1-gi OK (GH-337 + GH-386): snooker_12ft × '
        + 'snooker_luminaire venue-default bake on (uGiOn 1, class bounds + '
        + '15x8 probes, 2.984×0.20 emitter footprint), zero '
        + 'footprint-fallback lines across a look round trip');
    }
  }

  // ---- S1-corner (GH-387 regression guard): frame-corner watertightness.
  // The template family's butt-jointed planks run THROUGH the corner square
  // (templateLeftRailPlan — the curved-jaw remodel closed the see-through
  // corner gap of the earlier dressing), so raycast probes into all four
  // corners must hit table furniture, never the room through the table.
  // No straight-down wood-top pin here: the CEBP corner squares carry the
  // open pocket bays by design. Provenance: lib/cornerprobe.mjs; the carom
  // twin (e2e-carom S1-corner) was red on the pre-fix tree.
  //
  // GH-489 W13 (gate r16 P1-1, owner decision ⑥): the r16-adjudicated ONE-
  // bell construction cuts the rail-height casting back inside the bell
  // span and leaves the below-fall corner bay OPEN below/behind the bell
  // (the Star XW101 reference truth) — the in-span casting that used to
  // catch this sweep's tangent band-level rays is gone BY MANDATE, and the
  // W13 round proved any replacement catcher re-creates a gold stratum at
  // the S7b/S2b money registers. `openBay` re-derives the arm instead of
  // relaxing it (full law in lib/cornerprobe.mjs): a per-corner cutback-
  // annulus WITNESS must verify the bay open (the pre-r16 casting fails
  // this scoping — verbatim red on the rev-18 bytes @52a2dc62), and a
  // leaked ray is exempt only when its sight line never crosses the bell
  // core at sub-bed height (E2, the throat-breach signature — band-height
  // shell integrity is gated by corner-form F8/S1-width/posegate, not
  // this arm), targets verified bay air (E3) and demonstrably passed
  // through to the under-table world (E4). Everything else still fails.
  {
    await ev(PROBE_SRC);
    // one corner per evaluate (lib/cornerprobe.mjs runCornerProbe): the
    // one-call sweep took 445-481 s of the 600 s CDP deadline here
    // each evaluate is logged as it lands, so a deadline names its corner
    const res = await runCornerProbe(ev, { L: 3.569, W: 1.778,
      CW: 0.047625, FW: 0.0935, topPin: false,
      openBay: { geom: 'wpbsa_snooker_12ft' } },
    { onPart: (k, ms) => console.log(`S1-corner evaluate ${k}: ${(ms / 1000).toFixed(1)} s`) });
    judgeCornerProbe('S1-corner (GH-387, snooker)', res, fail);
  }

  // ---- S1-mat (GH-387 material-identity guard): the template ring must
  // be ONE material — pins on each plank body and beside every corner bay
  // must share a single material uuid (table.js's shared woodMat). GH-518:
  // on the Star band the corner fall notch reaches the plank outer edge,
  // so the old butt-seam flank pins have no wood to land on — the
  // 'template-narrow' style pins the plank bodies clear of the bays.
  // Provenance: lib/cornerprobe.mjs.
  {
    await ev(MAT_PROBE_SRC);
    const res = await ev(`window.__obFrameMatProbe(${JSON.stringify(
      frameMatPins({ L: 3.569, W: 1.778, CW: 0.047625, FW: 0.0935,
        style: 'template-narrow' }))})`);
    judgeFrameMats('S1-mat (GH-387, snooker)', res, fail);
  }

  // ---- S1-body (GH-518): the Star XW101-12S body — red-proven on the
  // pre-518 tree (no obSnk* furniture, floor −0.79, plank band 172.6 mm).
  // (a) room floor seats on the entry's bedAboveFloor 0.817 (#499: WPBSA
  //     864 mm floor→rail-top − 47 mm rail stack; R3-SNK-BODY-1: the pin is the
  //     entry's bedAboveFloor, now MFR 850 − the MODEL rail top);
  // (b) EIGHT turned legs (one shared geometry) at the photo-derived
  //     stances, feet landing on the floor plane;
  // (c) the gold body set (posts/molds/band/bead/plaques/badges/legs)
  //     shares ONE populate-local material;
  // (d) nose→outer band narrowed to 141 mm: a straight-down ray through
  //     the OLD band mid (155 mm behind the nose) must fall through to
  //     the room floor, never a plank top.
  {
    const body = await chrome.eval(`(async () => {
      const T = window.__dbg.scene.children.find((g) => g.name === 'obTable');
      const legs = [], names = {};
      let goldUuids = new Set(), legGeo = new Set(), floorY = null;
      // R3-SNK-7: the floor pin is the entry's OWN bedAboveFloor (0.864 −
      // the MODEL rail top 0.04018 = 0.82382), read from the spec — the
      // −0.817 literal belonged to the retired 47 stack
      const bedAboveFloor = (await import('./scene/table.js')).TABLE_SPECS.wpbsa_snooker_12ft.render.bedAboveFloor;
      window.__dbg.scene.traverse((o) => {
        if (o.name && o.name.startsWith('obSnk')) {
          names[o.name] = (names[o.name] ?? 0) + 1;
          if (o.material) goldUuids.add(o.material.uuid);
        }
        if (o.name === 'obSnkLeg') {
          legs.push([+o.position.x.toFixed(4), +o.position.z.toFixed(4)]);
          legGeo.add(o.geometry.uuid);
          o.geometry.computeBoundingBox();
        }
        if (o.geometry?.type === 'PlaneGeometry'
            && o.geometry.parameters?.width === 9
            && o.rotation.x < -1.5) floorY = o.position.y;
      });
      const leg = T?.children.find((o) => o.name === 'obSnkLeg');
      const legMinY = leg
        ? leg.geometry.boundingBox.min.y + leg.position.y : null;
      // ribbed faces + panels are NOT gold — count only the gold set
      const goldSet = ['obSnkPost', 'obSnkMold', 'obSnkBand', 'obSnkBead',
        'obSnkBadge', 'obSnkLeg', 'obSnkCasting'];
      const goldMats = new Set();
      window.__dbg.scene.traverse((o) => {
        if (goldSet.includes(o.name) || (o.name === 'obSnkPlaque'
            && o.geometry?.parameters?.width === 0.30)) {
          goldMats.add(o.material.uuid);
        }
      });
      return JSON.stringify({ names, legs, legGeoN: legGeo.size,
        goldMatN: goldMats.size, legMinY, floorY, bedAboveFloor });
    })()`, true).then(JSON.parse);
    const floorPin = body.bedAboveFloor !== null ? -body.bedAboveFloor : null;
    if (floorPin === null || Math.abs(body.floorY - floorPin) > 1e-6) {
      fail(`S1-body: room floor ${body.floorY} != ${floorPin} (the entry's bedAboveFloor; #499 stack on the MODEL rail top, R3-SNK-7)`);
    }
    // GH-489 IDENTITY round: every leg carries its OWN aOccl transport
    // bake (per-position geometry clones of the shared lathe — the strip
    // lamp cannot reach the legs and the occlusion field is a function
    // of each leg's stance), so the eight legs ride EIGHT geometries.
    if ((body.names.obSnkLeg ?? 0) !== 8 || body.legGeoN !== 8) {
      fail(`S1-body: expected 8 legs on 8 per-stance transport geometries, `
        + `got ${body.names.obSnkLeg}/${body.legGeoN}`);
    }
    if (body.legMinY === null || floorPin === null || Math.abs(body.legMinY - floorPin) > 5e-4) {
      fail(`S1-body: leg foot ${body.legMinY} does not land on the floor`);
    }
    // corner-leg end inset 0.230 -> 0.285 -> 0.267 (SNK.legInEnd; R3-SNK-BODY-1 PHOTO, corner-frame
    // rebuild R3 adopted at the 489 corner graft): the leg must stand out
    // of the pocket's room — FV489-NETCLEAR (judged, red-proved on the R0
    // basis: obSnkLeg 5713.5 mm² inside the net shell at 0.230) forces the
    // corner-leg centre ≥ 148 mm from the cup axis. legInSide stays
    // was photo-locked at 0.104 until R3-SNK-BODY-1 read 0.262 on the WST frames. Drawing letter still reads 0.230 — the
    // deviation is OPEN as twin row A5 and rides the A8 cabinet-plane
    // adjudication; this pin follows the MODEL's derived station so an
    // accidental leg move still fails.
    // R3-SNK-BODY-1 (B3): the leg stances are PHOTO reads — axis 270 +-35 from the
    // plank end and 265 +-30 inside the long plank plane (euromasters-2023-1 pads
    // 251-275 / 258-276, masters-table-closeup 274, Star MODEL 272), less the 3 mm
    // apron inset: SNK.legInEnd 0.267 / legInSide 0.262 (were 0.285 / 0.104).
    const lxC = +(3.569 / 2 + 0.047625 + 0.0935 - 0.0 - 0.267).toFixed(4); // BODY-2 R4: apron inset 0 (MODEL Magnum + PHOTO flush)
    const lz = +(1.778 / 2 + 0.047625 + 0.0935 - 0.0 - 0.262).toFixed(4);
    for (const ex of [-lxC, +(-lxC / 3).toFixed(4), +(lxC / 3).toFixed(4), lxC]) {
      for (const ez of [-lz, lz]) {
        if (!body.legs.some(([x, z]) => Math.abs(x - ex) < 1e-3
          && Math.abs(z - ez) < 1e-3)) {
          fail(`S1-body: no leg at the photo stance (${ex}, ${ez})`);
        }
      }
    }
    // GH-489 W6 construction round (adjudications c5259957376/c5260535193):
    // the side apron panels open MIDDLE BAYS (4 side runs + 2 end panels
    // = 6) and the corner castings are RESHAPED — off the mouth (the
    // rejected notch-arc wedge) to the FRAME corner beside/behind the
    // cream boot (the Star montage order), still 4. The PR #520-cleared
    // body bars (141.125 band, 864 stack, leg lathe, rib counts) are
    // gated unchanged below.
    // GH-489 W14 (signed drawing GH489-EXT-R1.2, owner sign-off #489):
    // the corner box RETIRES per the vs-rev-19 delete table — the W7
    // flank arms + wedge stub and the W13 casting shoulders are DELETED
    // (角部无第三块体; 皮外=房间). The gold survives as ONE leg-head block
    // per corner (obSnkPost ×4, top −141.5 = hem − E9) and the casting
    // count pins to ZERO (its absence is the F1 law, red on rev-19).
    // 489 CORNER GRAFT (R3/R4b two-clause closure adopted + the A8
    // cabinet re-plane, LAW-R4 / twin rows A8/A12):
    //   obSnkPanel 6 -> 24: the apron is TWO BANDS on two planes (flush
    //     above the hem, recessed by SNK.cabinetInset below): 2 bands ×
    //     (4 side runs + 2 end panels) = 12, + 8 corner arm extensions
    //     (flush, 0.006 → hem), + 4 splayed corner chamfers (the
    //     below-hem closure that clears the pocket's net room).
    //   obSnkMold 8 -> 16: both bottom-molding strips() calls ride the
    //     RECESSED plane below the E9 ceiling and run CONTINUOUS around
    //     it — 4 straight runs on 22.5° mitres + 4 chamfer segments per
    //     call (FV489-BUTT judges the joints; the r4corner red basis
    //     proves a cantilever fires).
    //   obSnkSlab 1 -> 2: the 5-pc slate is TWO plates (0.029 main +
    //     0.021 rebate) whose union keeps the manufacturer 50 mm — the
    //     union depth is judged at S1-body-r2 (d).
    //   obSnkBead/obSnkBand stay 4: their strips() calls are ABOVE the
    //     hem, where the corner is OPEN and the runs die on the apron
    //     arm's mitre with zero projection (FV489-CORNERAIR).
    // 489 BLOCKER-CURE (B11 "black void slots / floating legs"):
    //   obSnkPost 4 -> 8: the four INTERMEDIATE legs gain the same E9
    //     head-block construction (dossier §2.3: the gold head + flute
    //     panel is a structural member rising from EVERY leg; press-4K +
    //     bare-frame photos dress all eight stations);
    //   obSnkPostRib 8 -> 12 (below): one outer-face flute panel per
    //     mid block (the corner posts keep their twin faces);
    //   obSnkSoffit 6 (new): the A8 overhang's UNDERSIDE — the step
    //     between the flush and recessed bands was an open 103 mm slot
    //     that read as a black void over every leg top and let room
    //     light slit through at grazing bearings.
    for (const [nm, want] of [['obSnkPanel', 24], ['obSnkPost', 8],
      ['obSnkMold', 16], ['obSnkBand', 4], ['obSnkBead', 4],
      ['obSnkPlaque', 8], ['obSnkBadge', 4], ['obSnkSlab', 2],
      ['obSnkChamPanel', 4], ['obSnkCasting', 0], ['obSnkSoffit', 6]]) {
      if ((body.names[nm] ?? 0) !== want) {
        fail(`S1-body: ${nm} count ${body.names[nm] ?? 0} != ${want}`);
      }
    }
    // GH-489 IDENTITY round: the legs split off a dedicated material
    // (snkGoldLeg — rendered-read-calibrated base + spill-floor
    // transport; the casting/trim family keeps snkGold), so the gold
    // set spans exactly TWO materials.
    if (body.goldMatN !== 2) {
      fail(`S1-body: gold set spans ${body.goldMatN} materials (want 2: `
        + 'snkGold + snkGoldLeg)');
    }
    // (d) band narrowing: down-rays through the OLD 172.6 mm band's
    // mid-155 mm station on both axes must clear to the room floor
    const drop = await ev(`(async () => {
      const THREE = window.__obCornerTHREE
        ?? (window.__obCornerTHREE = await import('./vendor/three.module.min.js'));
      const rc = new THREE.Raycaster();
      const out = [];
      for (const [x, z] of [[0, ${(1.778 / 2 + 0.047625 + 0.0935 + 0.014).toFixed(6)}],
        [${(3.569 / 2 + 0.047625 + 0.0935 + 0.014).toFixed(6)}, 0]]) {
        rc.set(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0, -1, 0));
        const h = rc.intersectObjects(window.__dbg.scene.children, true)
          .filter((i) => i.object.type === 'Mesh' && i.object.visible)[0];
        out.push(h ? +h.point.y.toFixed(4) : null);
      }
      return JSON.stringify(out);
    })()`).then(JSON.parse);
    for (const y of drop) {
      if (!(y !== null && y < -0.5)) {
        fail(`S1-body: old-band station still carries furniture at y=${y} `
          + '(band not narrowed to the Star 141 mm)');
      }
    }
    console.log('S1-body (GH-518): Star body inventory + height stack OK (bedAboveFloor pin = the entry\'s own; R3-SNK-BODY-1 MFR 850)');
  }

  // ---- S1-body-r2 (GH-518 fix round 2 — review visual gate r1 findings
  // 3/4/5/7, PR #520 c5247040521): red-proven verbatim on the round-1 tree
  // @95fc98aa. Gate-basis numbers (auditor metrics/measurements.json):
  //   (a) leg lathe SECTIONS — reference product-photo leg divides
  //       38.8% double-bun cluster / 41.0% reeded barrel / 19.1% bead+foot
  //       (photo x≈570–649, y=368–546); round-1 modeled 15.4/69.8/14.6.
  //       Measured here from the shared leg geometry: reeded rows carry the
  //       reedDepth radius modulation, so the reed band's y-extent divides
  //       the profile into the same three sections.
  //   (b) CLOSED gold foot — the round-1 lathe tube was open at the floor
  //       (base ring r=0.070, no cap): a down-ray on the leg axis fell
  //       through to the room floor (the "open black concave base cutout"
  //       read, ~212×53 px in raw/after/B4-leg-closeup.png).
  //   (c) corner-post RIBBED TWIN FACES — reference montage ribbed runs
  //       cover 68.9% of the post face (y=335: 51/74 px, wrapping both
  //       faces); round-1 had one 22.6% chamfer inset + blank gold slabs.
  //   (d) under-frame — the 55 mm slab shared the near-black apron
  //       material (only ~9 mm separable from black at B5); no frame
  //       members existed, so the B5 register saw straight through the
  //       under-frame void to the FAR corner post's analytic-lit inner
  //       faces (the "orange cuboid", patch median luma 112.9 vs 3.4
  //       pre-518; misattributed on round-1's INDEX as an instanced block
  //       at (0.874,−0.195,0) — that point is this very sightline's z=0
  //       midpoint, a previewink degenerate-quad raycast artifact).
  {
    const r2 = await ev(`(() => {
      let leg = null, panelMesh = null;
      const slabMeshes = [];
      const names = {};
      window.__dbg.scene.traverse((o) => {
        if (o.name && o.name.startsWith('obSnk')) {
          names[o.name] = (names[o.name] ?? 0) + 1;
        }
        if (!leg && o.name === 'obSnkLeg') leg = o;
        if (o.name === 'obSnkSlab') slabMeshes.push(o);
        if (!panelMesh && o.name === 'obSnkPanel') panelMesh = o;
      });
      const slabMesh = slabMeshes[0] ?? null;
      // (a) section fractions from the lathe rows: group vertices by y,
      // reeded rows show a radius spread ≈ reedDepth across the ring
      let sections = null;
      if (leg) {
        const pos = leg.geometry.attributes.position;
        const rows = new Map();
        for (let i = 0; i < pos.count; i++) {
          const y = +pos.getY(i).toFixed(6);
          const r = Math.hypot(pos.getX(i), pos.getZ(i));
          const row = rows.get(y) ?? { min: Infinity, max: -Infinity };
          row.min = Math.min(row.min, r); row.max = Math.max(row.max, r);
          rows.set(y, row);
        }
        const ys = [...rows.keys()].sort((a, b) => b - a);
        const topY = ys[0], botY = ys[ys.length - 1], H = topY - botY;
        const reedYs = ys.filter((y) => {
          const row = rows.get(y);
          return row.max - row.min > 0.0008;
        });
        sections = reedYs.length ? {
          cluster: (topY - Math.max(...reedYs)) / H,
          barrel: (Math.max(...reedYs) - Math.min(...reedYs)) / H,
          foot: (Math.min(...reedYs) - botY) / H,
          H, topY, botY,
        } : { cluster: 0, barrel: 0, foot: 0, H, topY, botY };
      }
      // (d) slab material separation + spec depth + frame members.
      // 489 CORNER GRAFT: the slate is TWO plates (main + rebate) — the
      // manufacturer 50 mm law holds on the UNION of their world y-spans
      // (plates stack flush: -0.004..-0.033..-0.054), so a thinned plate
      // OR an opened gap between the plates both still fail.
      const slab = slabMesh ? {
        sharesApronMat: !!panelMesh
          && slabMeshes.some((m) => m.material.uuid === panelMesh.material.uuid),
        depth: (() => {
          let top = -Infinity, bot = Infinity;
          for (const m of slabMeshes) {
            if (!m.geometry) return null;
            m.geometry.computeBoundingBox();
            top = Math.max(top, m.geometry.boundingBox.max.y + m.position.y);
            bot = Math.min(bot, m.geometry.boundingBox.min.y + m.position.y);
          }
          let covered = 0;
          for (const m of slabMeshes) {
            covered += m.geometry.boundingBox.max.y
              - m.geometry.boundingBox.min.y;
          }
          const span = top - bot;
          // a gap between plates makes covered < span — report the span
          // only when the plates tile it (0.1 mm seam tolerance)
          return Math.abs(covered - span) < 1e-4 ? +span.toFixed(4) : null;
        })(),
      } : null;
      return JSON.stringify({ names, sections, slab });
    })()`).then(JSON.parse);
    // (a) lathe sections vs the photo-measured 38.8 / 41.0 / 19.1
    // (foot bar 20.2% = reed-end→floor; the auditor's 19.1% starts at the
    // bead — the 1.1 pp smooth gap between reed end and bead rides the
    // foot section in the geometry read)
    if (!r2.sections) fail('S1-body-r2: no obSnkLeg lathe geometry');
    else {
      for (const [nm, want, got] of [
        ['bun-cluster', 0.388, r2.sections.cluster],
        ['reeded-barrel', 0.410, r2.sections.barrel],
        ['bead+foot', 0.202, r2.sections.foot]]) {
        if (Math.abs(got - want) > 0.03) {
          fail(`S1-body-r2: leg ${nm} section ${(got * 100).toFixed(1)}% `
            + `!= reference ${(want * 100).toFixed(1)}% ±3 pp `
            + '(star-xw101-full-table-product.png leg column, photo-measured '
            + '38.8/41.0/19.1)');
        }
      }
    }
    // (c) ribbed plaques on BOTH outer faces of each corner post + one
    // outer face per mid-leg head block (489 BLOCKER-CURE B11)
    if ((r2.names.obSnkPostRib ?? 0) !== 12) {
      fail(`S1-body-r2: obSnkPostRib count ${r2.names.obSnkPostRib ?? 0} `
        + '!= 12 (twin ribbed faces per corner post + one per mid block '
        + '— reference coverage 68.9% of the post face, montage y=335)');
    }
    // (d) slab: own slate material at the manufacturer 50 mm, plus frame
    // members closing the under-frame void
    if (!r2.slab) fail('S1-body-r2: no obSnkSlab');
    else {
      if (r2.slab.sharesApronMat) {
        fail('S1-body-r2: slab still shares the near-black apron material '
          + '(gate r1 finding 5: ~9 mm separable from black at B5)');
      }
      // Number.isFinite: the union read reports null on a missing
      // geometry OR a gap between the two plates — both must fail, not
      // slide through the NaN comparison
      if (!Number.isFinite(r2.slab.depth)
          || Math.abs(r2.slab.depth - 0.050) > 0.0015) {
        fail(`S1-body-r2: slab union depth ${r2.slab.depth} != 0.050 `
          + '(manufacturer 5-pc 50 mm slate; two flush plates since the '
          + '489 corner graft)');
      }
    }
    if ((r2.names.obSnkBeam ?? 0) < 2 || (r2.names.obSnkBatten ?? 0) < 4) {
      fail(`S1-body-r2: under-frame members beams=${r2.names.obSnkBeam ?? 0} `
        + `battens=${r2.names.obSnkBatten ?? 0} (want >=2 / >=4 — the `
        + '1480 kg Star frame; also the B5 far-post sightline block)');
    }
    // (b) closed foot: an UP-ray from below the floor on each leg axis
    // must strike the leg's own closed-bottom cap first (front faces point
    // DOWN out of the solid; the floor plane's front faces up, so it
    // passes from below). On the open round-1 tube the ray flew up the
    // interior and out the open collar into the furniture above (posts /
    // planks) — never the leg.
    // + (d2) the exact B5 under-frame diagonal (camera world
    // (-1.2,-0.30,-2.0) toward the far post inner face) must be stopped
    // by an under-frame member before any obSnkPost surface
    const rays = await ev(`(async () => {
      const THREE = window.__obCornerTHREE
        ?? (window.__obCornerTHREE = await import('./vendor/three.module.min.js'));
      const rc = new THREE.Raycaster();
      const meshHits = () => rc.intersectObjects(window.__dbg.scene.children, true)
        .filter((i) => i.object.visible && i.object.type === 'Mesh'
          && i.object.geometry?.type !== 'InstancedBufferGeometry'
          && i.object.parent?.type !== 'Line');
      // R3-SNK-BODY-1: 0.267 / 0.262 = SNK.legInEnd / legInSide (PHOTO: leg
      // axis 270 ±35 from the plank end / 265 ±30 inside the long plank
      // plane, WST arena frames; were 0.285 / 0.104 from the studio frontal)
      const lxC = 3.569 / 2 + 0.047625 + 0.0935 - 0.0 - 0.267; // BODY-2 R4: apron inset 0
      const lz = 1.778 / 2 + 0.047625 + 0.0935 - 0.0 - 0.262;
      const feet = [];
      for (const ex of [-lxC, -lxC / 3, lxC / 3, lxC]) {
        for (const ez of [-lz, lz]) {
          // 20 mm off-axis: the cap ring closes to a 0.2 mm axial vent
          rc.set(new THREE.Vector3(ex + 0.02, -1.0, ez),
            new THREE.Vector3(0, 1, 0));
          const h = meshHits()[0];
          feet.push(h ? (h.object.name || h.object.type) : 'none');
        }
      }
      const org = new THREE.Vector3(-1.2, -0.30, -2.0);
      const dir = new THREE.Vector3(1.69, -0.154, 0.787).sub(org).normalize();
      rc.set(org, dir);
      const diag = meshHits().filter((i) => i.distance > 0.01)
        .slice(0, 3).map((i) => ({ name: i.object.name || i.object.type,
          d: +i.distance.toFixed(3) }));
      return JSON.stringify({ feet, diag });
    })()`).then(JSON.parse);
    for (const nm of rays.feet) {
      if (nm !== 'obSnkLeg') {
        fail(`S1-body-r2: leg-axis up-ray from below the floor hit ${nm}, `
          + "not the leg's own closed foot (gate r1 finding 3: open black "
          + 'base cutout — the reference foot is closed gold)');
        break;
      }
    }
    {
      const first = rays.diag.find((h) => h.name.startsWith('obSnk'));
      if (!first || !/^obSnk(Beam|Batten|Slab)/.test(first.name)) {
        fail(`S1-body-r2: B5 under-frame diagonal reaches ${first?.name} `
          + `at d=${first?.d} — the far corner post reads through the open `
          + 'void (gate r1 finding 7: 33.6× luma jump at the B5 patch); an '
          + 'under-frame member must close the sightline');
      }
    }
    console.log('S1-body-r2 (GH-518 fix round 2): lathe sections + closed '
      + 'feet + twin ribbed post faces + slate/members under-frame OK');
  }

  // ---- S1-body-r3 (GH-518 fix round 3 — review visual gate r2 finding B,
  // PR #520 c5248717543): red-proven verbatim on the round-2 tree
  // @fb8a8e2e. Gate-basis numbers (auditor r2 metrics/measurements.json):
  //   the reference montage post row y=335 resolves exactly TWO ribbed
  //   runs (x=129–156 / 169–191, one per outer face, plain gold at the
  //   corner) at ~7 ribs per panel (median pitch ~3 px on 23–28 px
  //   faces); round 2 rendered THREE runs (the ribbed chamfer inset was
  //   an unsupported third panel) at ~13 ribs per panel (~2× rhythm).
  //   Round 3: chamfer plate returns to the post gold (same mesh, same
  //   inventory count) and the twin face panels ride a 7-rib texture.
  {
    const r3 = await ev(`(() => {
      let cham = null, post = null, rib = null;
      window.__dbg.scene.traverse((o) => {
        if (!cham && o.name === 'obSnkChamPanel') cham = o;
        if (!post && o.name === 'obSnkPost') post = o;
        if (!rib && o.name === 'obSnkPostRib') rib = o;
      });
      // rib count from the panel's own albedo canvas: dark→bright
      // transitions across one texel row (a rib = one bright ridge).
      // W12 re-derivation (gate r15 P2-2): the panel is a material ARRAY
      // now (burgundy fluting on the outward face only, gold edge faces
      // — the montage's framed insert), and the burgundy law lifted the
      // groove floor to R 30 / crest 104: the map resolves from the
      // array and the ridge threshold sits at the crest/groove midpoint.
      let ribCount = null, plaqueLikePitch = null;
      const ribMats = Array.isArray(rib?.material)
        ? rib.material : [rib?.material];
      const img = ribMats.find((m) => m?.map)?.map?.image;
      if (img && img.getContext) {
        const px = img.getContext('2d').getImageData(0, 0, img.width, 1).data;
        let ribs = 0, prev = false;
        for (let x = 0; x < img.width; x++) {
          const bright = px[x * 4] > 62;
          if (bright && !prev) ribs++;
          prev = bright;
        }
        ribCount = ribs;
        plaqueLikePitch = img.width;
      }
      return JSON.stringify({
        chamShapesPostGold: !!cham && !!post
          && cham.material.uuid === post.material.uuid,
        chamCount: cham ? 1 : 0,
        ribCount, texW: plaqueLikePitch,
      });
    })()`).then(JSON.parse);
    if (!r3.chamShapesPostGold) {
      fail('S1-body-r3: chamfer inset plate does not share the post gold '
        + 'material (gate r2 finding B: the ribbed chamfer inset is an '
        + 'unsupported THIRD panel — reference montage y=335 shows two '
        + 'runs separated by plain gold)');
    }
    if (r3.ribCount === null || Math.abs(r3.ribCount - 7) > 1) {
      fail(`S1-body-r3: post panel texture resolves ${r3.ribCount} ribs `
        + '!= 7 ±1 (gate r2 finding B: reference ~7 ribs per panel, '
        + 'median pitch ~3 px on 23–28 px faces; round-2 carried ~13)');
    }
    console.log('S1-body-r3 (GH-518 fix round 3): two ribbed panels per '
      + 'post (gold chamfer plate) + 7-rib reference rhythm OK');
  }

  // ---- S1-width (GH-489 W1 corridor, RE-BASED by the W6 construction
  // round — adjudications c5259957376/c5260535193): the visible leather
  // band's LATERAL width must match the manufacturer references. The W6
  // topology sweeps the CREAM boot about the VISIBLE fall cups
  // (pocketVisualFalls — the kernel capture discs are NOT slate holes),
  // so the scans now run from the cups at the label radii. Bars (the W1
  // magnitudes SURVIVE on the new topology — the corner delta table):
  //   corner (0°, ±30°): INSIDE the GCL 46–56 mm corridor (fall-hole
  //     84.15 mm in-photo ruler; Star XW101 construction class);
  //   middle centre: ≥ the Star frame-cut lower bound 12.4 mm, roofed at
  //     20 mm (the signed-off 15 mm centre-band basis — middle
  //     adjudication Q1 default; no uncut near-nadir reference exists);
  //   middle flanks: ≥ the Star flank cut bounds (28 mm), roofed at 47 mm.
  // RED-proven on the pre-W1 tree @43fb2f7f (14.0–14.5 mm) and RED against
  // rev-11 @476de447 at the cup basis (the old ring sat about the capture
  // centres — the cup-based corner scan reads no leather-family run).
  {
    const spans = await chrome.eval(`(async () => {
      const THREE = await import('three');
      const T = await import('./scene/table.js');
      const G = T.makeGeom('wpbsa_snooker_12ft');
      const scene = __dbg.scene;
      const rc = new THREE.Raycaster();
      // W14 (E19): the neutral emboss zone is leather dressing on the
      // skirt face — the corridor scan must not break on it
      // 489 PASS-2: the second stitch row (obPocketStitch2) was leather
      // dressing exactly like obPocketStitch — without it the middle
      // +-45 scan BROKE its leather run at the row-2 ring (last 18.5 mm
      // vs the 24.9 mm frame-cut bound). craft R3-SNK-3: obPocketStitch2
      // is RETIRED (one outer row per pocket; the photo decides) — the
      // entry is dropped so the list names only meshes that exist.
      const LEATHER = ['obPocketValance',
        'obPocketStitch', 'obPocketCap', 'obPocketEmboss'];
      const scan = (cx, cz, th, fall) => {
        const dx = Math.sin(th), dz = Math.cos(th);
        let first = null, last = null;
        // A6 (twin row A6 / proposal_ext_r2_7): the XW101 plan band runs
        // to the brim outer r 0.119 (dr ≈ 77 from the fall) — the scan
        // ceiling rides past it (the old 0.062 ceiling truncated the
        // amended dome and read the ceiling, not the leather)
        for (let dr = -0.002; dr <= 0.100; dr += 0.0005) { // R3-SNK-6: the hem reaches dr ≈ 90 under the junction law
          const ox = cx + (fall + dr) * dx, oz = cz + (fall + dr) * dz;
          rc.set(new THREE.Vector3(ox, 0.5, oz), new THREE.Vector3(0, -1, 0));
          const hits = rc.intersectObjects(scene.children, true)
            .filter((i) => i.object.visible !== false && i.object.isMesh); // W14 hygiene: mesh-only — the aim-widget Line (y ≈ +4 mm) wins the ray race over the descending XW101 skirt
          const h = hits[0];
          // R3-SNK-7: the flush plate's top and the plank top are ONE plane
          // over the 0.9 mm lap past the cut face (clampP, E15) — a
          // coplanar tie the ray resolves arbitrarily (the middle flank
          // read flipped one 0.5 mm station between builds). A station
          // reads LEATHER when any hit within 0.2 mm of the first is leather.
          const leather = !!h && hits.some((i) => i.distance - h.distance < 0.0002
            && LEATHER.includes(i.object.name));
          if (leather && first === null) first = dr;
          if (first !== null) { if (leather) last = dr; else break; }
        }
        return first === null ? null
          : { span: Number((last - first).toFixed(4)),
            last: Number(last.toFixed(4)) };
      };
      // W6: stations ride the VISIBLE fall cups (rt corner = cups[5],
      // top middle = cups[4] in kernel order lb lc lt rb rc rt)
      const cups = T.pocketPlateDatums?.('wpbsa_snooker_12ft') ?? T.pocketVisualFalls('wpbsa_snooker_12ft'); // the PLATE DATUM (SNK-R34); a tree/arm that returns none falls back to the visual falls (SNK-R36: --arm throat-off removes the datum on purpose; the drop rows are the arm's, not this probe)
      const cC = cups[5], cM = cups[4];
      const q = Math.PI / 4;
      // R3-SNK-10 (RULING (a)): the middle D now ends 44.7° from the apex on
      // the ± 41.92 planes, so a ± 45° ray meets the plane BEFORE the flap
      // and reads no leather at all — the flank rays move to ± 30° (inside
      // the window on every build since the plate datum)
      const qM = Math.PI / 6;
      return {
        corner0: scan(cC.x, cC.z, q, cC.r),
        cornerP30: scan(cC.x, cC.z, q + q * 2 / 3, cC.r),
        cornerM30: scan(cC.x, cC.z, q - q * 2 / 3, cC.r),
        mid0: scan(cM.x, cM.z, 0, cM.r),
        midP30: scan(cM.x, cM.z, qM, cM.r),
        midM30: scan(cM.x, cM.z, -qM, cM.r),
        // R3-SNK-10: the flank band's inputs are the tree's own (the MODEL
        // slot plane and the kernel middle fall radius), not literals
        uFaceM: T.pocketFaceStations('wpbsa_snooker_12ft').uFaceM,
        rvM: cM.r,
        // R3-SNK-8: the middle plate's inner edge seen from above (the rim
        // wall radius the section fixes) — the S1 middle band's lower bound
        // rides it instead of the retired "pad face 2.2 inside rFlap"
        rPadInM: T.snkPocketLeatherSpec('wpbsa_snooker_12ft').middle.pad.rPadIn,
      };
    })()`, true);
    console.log('S1-width spans (m):', JSON.stringify(spans));
    // craft R3-SNK-4 (ORDER-CRAFT-R3-SNK4.md item 1; GH-640): the bars are
    // RE-DERIVED from the governing flush-plate letters (proposal_ext_r3_1
    // + r3_2 heads over the signed r1_2) and the plate section, not from
    // the retired constructions they encoded (the r2_7 brim corridor
    // [68, 81] "throat lip dr≈2 → brim outer r 0.119"; the W6 middle band
    // [12.4, 20] / flank end [24.8, 47]). Scan semantics are unchanged:
    // down-rays at 0.5 mm stations from the visible fall edge, `first` =
    // the first leather station, `last` = the last contiguous one — so a
    // true leather run [a, b] reads span = b − a − δ with δ ∈ [0, 1.0)
    // (one half-station lost at each end).
    //
    // CORNER (0°, ±30° about the outward diagonal): the plate is a body of
    // revolution about the cup (E26: hem circle centre Δcup 0.01 mm; E37
    // hem R about the cup). First leather from above = the pad's inner
    // face (R3-SNK-5: it overhangs the flap by 2.2 mm) at dr = lip 4.0 +
    // flapOut 2.1 − 2.2 = 3.9 (the letters' lipD3 moves with it, so E12 and
    // this span move together);
    // last leather = the pinked hem. E12 = lip → hem on the D3 meridian
    // (the D3 meridian rides a tooth TIP). R3-SNK-6 JUNCTION LAW (fixture
    // head proposal_ext_r3_6_junction; SPIKE-REPORT-CRAFT-R2.md §R3c.15.2):
    // the hem lands ON the apron plane — E37 132.2 [130.7, 133.7] DERIVED
    // (apron plane 131.9 + the leg law's 0.31) at E5 −105.5 (MFR); lip r
    // 47.0 (the pad's inner face top) → E12 85.2 [83.7, 86.7]. Off the
    // meridian the hem ends up to one tooth's RADIAL depth earlier: E7
    // depth 4.83 (MODEL) along the 2.5° derived skirt → 0.2 mm (kept at
    // the R3-SNK-5 allowance 1.2); the plan's leg law does not act inside
    // |phi| ≤ 35°. Hence
    //   span ∈ [E12.lo − δ_max 1.0 − 1.2, E12.hi] = [81.5, 86.7] mm
    // NOTE (honesty): the R3-SNK-5 hem-radius plate (E37 114.5) read
    // 63.3–69.5 and fires here (red arm d69b7d33); the r2_7 brim boot's
    // 74.9 and the W6 boot's < 63.3 fire too.
    // R3-SNK-7 (RULING-SNK-DATUM.md): the same law on the MODEL plate datum —
    // E37 110.5 (apron plane 110.2 about the cup 27.92 out + 0.31), lip r 47.0
    // → E12 63.5 [62.0, 65.0]; span ∈ [E12.lo − 1.0 − 1.2, E12.hi] = [59.8, 65.0]
    // (red: 1c4f0d06 reads 81.5–86.7 on the 6.24 cup)
    // R3-SNK-BODY-2 (r3_14): E12 re-derived on the flush-apron hem — 66.5 [65.0, 68.0]
    // (E37 113.5 − lip 47.0); span ∈ [E12.lo − 1.0 − 1.2, E12.hi] = [62.8, 68.0]
    const CORNER_SPAN = [0.0628, 0.0680];
    for (const k of ['corner0', 'cornerP30', 'cornerM30']) {
      if (!(spans[k]?.span >= CORNER_SPAN[0] && spans[k]?.span <= CORNER_SPAN[1])) {
        fail(`S1-width: ${k} band ${spans[k]?.span} m outside the flush-plate `
          + 'letter band [62.8, 68.0] mm (E12 [65.0, 68.0] r3_14 − scan δ 1.0 − tooth '
          + '1.2; R3-SNK-7 plate datum, R3-SNK-6 junction law)');
      }
    }
    // MIDDLE CENTRE (+z ray from the middle cup): no E-letter owns the
    // middle plan band (E16 = A4 deferred), so the bound is the plate
    // SECTION the construction fixes (snkPlateSpec middle, R3-SNK-5 law:
    // rFlap = rv + 6.1 = 55.7; the padded band anchored on the MODEL 4.3°
    // tongue line through the apron-bounded hem dHem 86.24 at −60.3: root
    // 78.9, vertical pad face 81.7, flat top to 74.9). From above the run
    // is the flat top + outer round + lean + face at least (face − rFlap
    // = 81.7 − 55.7 = 26.0, and the span starts 2.2 inside rFlap at the
    // pad's inner face → 28.2) and at most the tongue's whole plan drift
    // (dHem − rFlap + 2.2 = 32.7):
    //   span ∈ [28.2 − δ_max 1.0, 32.7] = [27.2, 32.7] mm.
    // Red basis: the W6 / card-18 middle saddle band read ≈ 15 (their own
    // [12.4, 20] roof) and the R3-SNK-4 section (25.0) → under 27.2 → fire.
    // R3-SNK-8 (the FORM round, MODEL M1/M3 mouth run): the plate's inner
    // edge from above is the RIM WALL — the rim overhangs the leaning
    // flap's top by 2.15 and stands at rFlap − 0.5, not 2.2 inside it —
    // so the lower bound is (face 81.7 − rPadIn) − δ_max, read live from
    // the section (25.5 on these bytes; the old literal 27.2 fired on the
    // built section at 26.0). The upper bound (tongue plan drift) stands.
    const MID_SPAN = [0.0817 - spans.rPadInM - 0.0010, 0.0327]; // 0.0817 = MODEL (R3-SNK-5 tongue law: the vertical pad face 81.7 behind the middle cup); 1.0 = δ_max DERIVED
    if (!(spans.mid0?.span >= MID_SPAN[0] && spans.mid0?.span <= MID_SPAN[1])) {
      fail(`S1-width: middle centre band ${spans.mid0?.span} m outside the `
        + `flush-plate section band [${(MID_SPAN[0] * 1000).toFixed(1)}, 32.7] mm `
        + '(flat top + outer round + lean + face ≤ run ≤ tongue plan drift; '
        + 'R3-SNK-5 law, inner edge = the rim wall since R3-SNK-8)');
    }
    // MIDDLE FLANKS (± 30° rays, R3-SNK-10): the plate is CUT at the wood
    // end faces x = ± uFaceM (MODEL: the purchased Star model's ± 41.92
    // planes, RULING (a); the ± 54 photo pin and its literal band [25.91,
    // 26.41] retire). The leather ends `gap` inside the plane ALONG x (gap
    // 0.25, MODEL: the Magnum butt joint 0.07 / 0.25); along a ray at θ
    // from the outward axis the plane is reached at (uFaceM − gap) / sin θ
    // from the cup → dr_end = that − rv (the kernel middle fall radius,
    // RULING (b)); `last` is the last 0.5 mm station at or under it:
    //   last ∈ [dr_end − 0.5, dr_end]   (30.15 → [29.65, 30.15] on this tree).
    // Inputs are the tree's own exports, so the band re-derives with them.
    const thM = Math.PI / 6;
    const drEnd = (spans.uFaceM - 0.00025) / Math.sin(thM) - spans.rvM;
    const FLANK_LAST = [drEnd - 0.0005, drEnd];
    for (const k of ['midP30', 'midM30']) {
      if (!(spans[k]?.last >= FLANK_LAST[0] && spans[k]?.last <= FLANK_LAST[1])) {
        fail(`S1-width: ${k} leather outer end ${spans[k]?.last} m outside the `
          + `cut-face band [${(FLANK_LAST[0] * 1000).toFixed(2)}, ${(FLANK_LAST[1] * 1000).toFixed(2)}] mm `
          + '((uFaceM − gap 0.25) / sin 30° − rv, one station; R3-SNK-5 law on the R3-SNK-10 slot)');
      }
    }
  }

  // ---- S1-wedge (GH-489 W2 zero-wood law, RE-BASED by W6): NO WOOD ALONG
  // THE POCKET DIAGONAL — the adjudicated construction has the rails END
  // at squared faces and NOTHING but boot + void + the sub-bed casting
  // around the outside of the opening (corner adjudication §1a; passes BY
  // CONSTRUCTION now: the plank ring, tip-trim and rail-height casting
  // wedges are all retired). Bar: top-down rays along the corner outward
  // diagonal at 0/±10/±20°, from the VISIBLE fall cup out to dr = +150 mm
  // (past the retired square-tip region), must hit NOTHING at plank
  // heights (y > 0.020) beyond the boot's drop edge — the post top rides
  // at −0.004, the moldings lower. RED-proven on the W1 tree @691f4f6e
  // (plank-top hits y = 0.047 from dr ≈ +50.5) and against rev-11
  // @476de447 (the continuous notched ring + castings hold plank-height
  // wood on the diagonal).
  {
    const wedge = await chrome.eval(`(async () => {
      const THREE = await import('three');
      const T = await import('./scene/table.js');
      const G = T.makeGeom('wpbsa_snooker_12ft');
      const scene = __dbg.scene;
      const rc = new THREE.Raycaster();
      // 489 PASS-2: the second stitch row (obPocketStitch2) was leather
      // dressing exactly like obPocketStitch — without it the middle
      // +-45 scan BROKE its leather run at the row-2 ring (last 18.5 mm
      // vs the 24.9 mm frame-cut bound). craft R3-SNK-3: obPocketStitch2
      // is RETIRED (one outer row per pocket; the photo decides) — the
      // entry is dropped so the list names only meshes that exist.
      const LEATHER = ['obPocketValance',
        'obPocketStitch', 'obPocketCap', 'obPocketEmboss']; // W14 E19
      const cup = (T.pocketPlateDatums?.('wpbsa_snooker_12ft') ?? T.pocketVisualFalls('wpbsa_snooker_12ft'))[5]; // the PLATE DATUM (SNK-R34); falls back to the visual falls when the datum is absent (SNK-R36 arm scope)
      const out = {};
      for (const degOff of [-20, -10, 0, 10, 20]) {
        const th = Math.PI / 4 + degOff * Math.PI / 180;
        const dx = Math.sin(th), dz = Math.cos(th);
        // find the leather run's outer end first (the drop edge)
        let last = null, bad = [];
        for (let dr = -0.002; dr <= 0.150; dr += 0.0005) {
          const ox = cup.x + (cup.r + dr) * dx, oz = cup.z + (cup.r + dr) * dz;
          rc.set(new THREE.Vector3(ox, 0.5, oz), new THREE.Vector3(0, -1, 0));
          const h = rc.intersectObjects(scene.children, true)
            .filter((i) => i.object.visible !== false && i.object.isMesh)[0]; // W14 hygiene: mesh-only — the aim-widget Line (y ≈ +4 mm) wins the ray race over the descending XW101 skirt
          const leather = !!h && LEATHER.includes(h.object.name);
          if (leather) { last = dr; continue; }
          // the GOLD frame-corner casting + the proud corner post are the
          // ADJUDICATED construction on the diagonal (c5259957376 §1e:
          // casting/post below/BESIDE the boot — the Star montage corner;
          // the post's proud top sliver beyond the plank edge is the PR
          // #520-cleared body read); the zero-wood law targets PLANK wood
          if (last !== null && h && h.point.y > 0.020
            && h.object.name !== 'obSnkCasting'
            && h.object.name !== 'obSnkPost') {
            bad.push([Number(dr.toFixed(4)), h.object.name || '(unnamed)',
              Number(h.point.y.toFixed(4))]);
          }
        }
        out[degOff] = { dropEdge: last, bad: bad.slice(0, 6),
          badCount: bad.length };
      }
      return out;
    })()`, true);
    console.log('S1-wedge diagonal coverage:', JSON.stringify(wedge));
    for (const k of Object.keys(wedge)) {
      if (wedge[k].badCount > 0) {
        fail(`S1-wedge: corner diagonal ${k} deg — ${wedge[k].badCount} `
          + 'plank-height hits beyond the drop edge (first: '
          + JSON.stringify(wedge[k].bad) + '); the reference class has no '
          + 'wood along the diagonal');
      }
      if (!(wedge[k].dropEdge >= 0.040)) {
        fail(`S1-wedge: corner diagonal ${k} deg leather run ends at `
          + `${wedge[k].dropEdge} m — no boot drop edge found`);
      }
    }
  }

  // ---- S2: red pot (+1) arms the nominated colour -----------------------------
  await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 1, x: POT.x, y: POT.y },
    ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'reds', shooter: 1 });
  if (await shot('S2', { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S2: legal red pot did not return to AIM');
  }
  let j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[1]') fail('S2: judgment wrong: ' + JSON.stringify(j));
  if (j?.turn !== 'continue') fail('S2: striker must continue after a red (R3(g))');
  if (m?.phase !== 'colour_after_red' || m?.ballOn !== 'nominated_colour'
    || m?.scores?.[1] !== 1 || m?.currentBreak !== 1) {
    fail('S2: colour_after_red state wrong: ' + JSON.stringify(m));
  }
  if (await player() !== 1) fail('S2: shooter changed after a legal pot');
  if (!sawLog('[flow] ballOnChanged')) fail('S2: ballOnChanged hook not printed');

  // ---- S2b: the nomination GATE — no stroke without a declared colour --------
  const rej = await ev('__test.shoot({v0:1.5,phi:1.0,theta:0,a:0,b:0})');
  if (!rej || !rej.includes('nominate a colour')) {
    fail('S2b: colour shot without a nomination was not refused: ' + rej);
  }
  if (await ev('__test.state()') !== 'AIM') fail('S2b: refused shot changed state');
  await ev('document.getElementById("shoot").click()');
  await sleep(250);
  if (await ev('document.getElementById("hud-hint").style.display') !== 'block') {
    fail('S2b: rejection hint banner not shown on the HUD shoot path');
  }
  if (await ev('__test.errors.length')) {
    fail('S2b: expected rejection polluted the zero-error gate');
  }

  // ---- S2c: the aim affordance offers the colours; nomination flows through --
  await sleep(400); // aim.js re-derives on the frame hook
  if (await ev('window.__aim.nominationRequired()') !== true) {
    fail('S2c: no nomination affordance on a colour shot');
  }
  const targets = await ev('window.__aim.legalTargets()');
  if (JSON.stringify(targets) !== '[16,17,18,19,20,21]') {
    fail('S2c: colour targets wrong: ' + JSON.stringify(targets));
  }
  if (await ev('window.__aim.call()') !== null) {
    fail('S2c: nomination must have NO default — it is the striker\'s declaration');
  }
  await ev('window.__aim.selectCallBall(19)'); // declare the blue
  await sleep(150);
  const armed = await ev('window.__rules.calledShot()');
  if (armed?.kind !== 'nominate' || armed?.ball !== 19) {
    fail('S2c: composed nomination did not reach the flow seam: ' + JSON.stringify(armed));
  }
  if (!sawLog('[flow] colourNominated')) fail('S2c: colourNominated hook not printed');
  const callText = await ev('document.getElementById("hud-call").textContent');
  if (!callText.includes('blue')) fail('S2c: HUD call indicator wrong: ' + callText);
  // issue #90: textContent alone passed even while the indicator was
  // hidden inside the snooker-hidden #hud-match — pin VISIBILITY too
  if (await ev('document.getElementById("hud-call").offsetParent !== null') !== true) {
    fail('S2c: HUD call indicator is not VISIBLE in snooker (#90)');
  }

  // ---- S3: nominated blue potted — +5, respots on its OWN spot (R7) ----------
  await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 19, x: POT.x, y: POT.y },
    { id: 2, x: -0.6, y: -1.3 }, ...coloursAt(16, 17, 18, 20, 21)],
  {
    phase: 'colour_after_red', ballOn: 'nominated_colour', shooter: 1,
    scores: { 1: 1, 2: 0 }, currentBreak: 1,
  });
  if (await ev('window.__rules.nominate(19)') !== true) fail('S3: nominate(19) rejected');
  if (await shot('S3', { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S3: nominated colour pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[19]'
    || JSON.stringify(j?.respot) !== '[19]') {
    fail('S3: judgment wrong: ' + JSON.stringify(j));
  }
  if (m?.phase !== 'reds' || m?.scores?.[1] !== 6 || m?.currentBreak !== 6) {
    fail('S3: post-colour state wrong (blue = 5): ' + JSON.stringify(m));
  }
  const blue3 = (await ev('__test.balls()')).find((b) => b.id === 19);
  if (blue3.pocketed || Math.abs(blue3.pos[2] - SPOT[19].x) > 1e-6
    || Math.abs(blue3.pos[0] - SPOT[19].y) > 1e-6) {
    fail('S3: blue not respotted on its OWN spot: ' + JSON.stringify(blue3));
  }
  if (!sawLog('[flow] respotApplied')) fail('S3: respotApplied hook not printed');

  // ---- S4: respot chain — own spot OCCUPIED → highest-value VACANT spot ------
  // blue's spot is occupied by a red and the pink is off the table: the
  // potted blue must land on the PINK spot (black occupied, pink vacant —
  // WPBSA Sec3 R7, snookerRespotPlan)
  await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 19, x: POT.x, y: POT.y },
    { id: 5, x: 0, y: 0 }, { id: 2, x: -0.6, y: -1.3 },
    ...coloursAt(16, 17, 18, 21)],
  {
    phase: 'colour_after_red', ballOn: 'nominated_colour', shooter: 1,
    scores: { 1: 6, 2: 0 }, currentBreak: 6,
  });
  await ev('window.__rules.nominate(19)');
  if (await shot('S4', { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S4: occupied-spot colour pot did not return to AIM');
  }
  const blue4 = (await ev('__test.balls()')).find((b) => b.id === 19);
  if (blue4.pocketed || Math.abs(blue4.pos[2] - SPOT[20].x) > 1e-6
    || Math.abs(blue4.pos[0] - SPOT[20].y) > 1e-6) {
    fail('S4: blue must respot on the highest-value VACANT spot (pink): '
      + JSON.stringify(blue4.pos));
  }

  // ---- S5: the blue-involved foul on a red = 5 away (Sec3 R11 example) -------
  await scene([{ id: 0, x: 0, y: -0.5 }, { id: 19, x: 0, y: 0 },
    { id: 7, x: 0.6, y: -1.3 }, ...coloursAt(16, 17, 18, 20, 21)],
  { phase: 'reds', ballOn: 'red', shooter: 1, scores: { 1: 6, 2: 0 } });
  if (await shot('S5', { v0: 1.5, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S5: foul must park in AIM for the play-again option');
  }
  j = await judgment();
  m = await match();
  if (j?.fouls?.[0]?.code !== 'wrong-first-ball' || j?.fouls?.[0]?.cite !== C.wrongFirst) {
    fail('S5: expected the cited wrong-first-ball: ' + JSON.stringify(j?.fouls));
  }
  if (m?.penalty !== 5 || m?.scores?.[2] !== 5) {
    fail('S5: blue-involved foul on a red must be 5 away (Sec3 R11): ' + JSON.stringify(m));
  }
  if (m?.currentBreak !== 0) fail('S5: a foul must end the break');
  if (m?.pendingDecision?.kind !== 'play_again' || m?.pendingDecision?.chooser !== 2) {
    fail('S5: expected the play_again option for P2: ' + JSON.stringify(m?.pendingDecision));
  }
  if (!sawLog('[flow] foulCalled')) fail('S5: foulCalled hook not printed');
  if (!sawLog('[flow] decisionRequired {"kind":"play_again"')) fail('S5: decisionRequired hook not printed');
  // the scoreboard surfaces the penalty WITH its cite (FR-008/FR-009)
  const chips = await ev('document.getElementById("hud-snooker-chips").textContent');
  if (!chips.includes('5') || !chips.includes('Sec3 R10')) {
    fail('S5: scoreboard penalty chip lacks points/cite: ' + chips);
  }
  // issue #90 (R13 conflation): the chip leads with the foul TITLE and the
  // per-foul separator is ' · ' — "Sec2 R13" can no longer chain-read as
  // the play_again prompt's "Sec3 R13"
  if (!chips.includes('wrong ball first — WPBSA Sec2 R11; Sec3 R10')) {
    fail('S5: penalty chip cite not title-prefixed (#90): ' + chips);
  }
  const blocked = await ev('__test.shoot({v0:1.5,phi:1.0,theta:0,a:0,b:0})');
  if (!blocked) fail('S5: shooting through a pending decision was not refused');
  // resolution 1: the incoming player elects to play (Sec3 R13)
  if (await ev('window.__rules.decide(1)') !== true) fail('S5: decide(1) rejected');
  if (!sawLog('[flow] decisionMade {"kind":"play_again","choice":1')) fail('S5: decisionMade hook not printed');
  if (await player() !== 2) fail('S5: choice 1 must seat the incoming player');
  if ((await match())?.pendingDecision !== null) fail('S5: decision did not clear');

  // ---- S5b: play-again choice 2 — the offender plays again -------------------
  await scene([{ id: 0, x: 0, y: -0.5 }, { id: 19, x: 0, y: 0 },
    { id: 7, x: 0.6, y: -1.3 }, ...coloursAt(16, 17, 18, 20, 21)],
  { phase: 'reds', ballOn: 'red', shooter: 1, scores: { 1: 6, 2: 5 } });
  await shot('S5b', { v0: 1.5, phi: 'PI2', theta: 0, a: 0, b: 0 });
  if (await ev('window.__rules.decide(2)') !== true) fail('S5b: decide(2) rejected');
  if (await player() !== 1) fail('S5b: choice 2 must make the OFFENDER play again');

  // ---- S6: scratch → play-again → ball in hand ON/WITHIN THE D (Sec3 R5) -----
  await scene([{ id: 0, x: SCRATCH_CUE.x, y: SCRATCH_CUE.y },
    { id: 7, x: -0.6, y: 0.5 }, ...coloursAt(19, 20, 21)],
  { phase: 'reds', ballOn: 'red', shooter: 1, scores: { 1: 6, 2: 5 } });
  if (await shot('S6', { v0: 1.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S6: scratch must park in AIM for the play-again option');
  }
  j = await judgment();
  if (!j?.fouls?.some((f) => f.code === 'scratch' && f.cite === C.scratch)) {
    fail('S6: expected the cited scratch: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'd_zone') fail('S6: a snooker scratch grants the D, never anywhere');
  if (await ev('window.__rules.decide(1)') !== true) fail('S6: decide(1) rejected');
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S6: D-zone BIH state not entered');
  if (await ev('window.__rules.placementRight()') !== 'd_zone') fail('S6: placement right not d_zone');
  const cue6 = (await ev('__test.balls()')).find((b) => b.id === 0);
  if (cue6.pocketed) fail('S6: cue not revived for the in-hand');
  // D-placement CLAMP: a request far outside projects onto the D boundary
  if (!(await ev('__test.placeCue(0.6, -1.3)'))) fail('S6: D placement call failed');
  const p1 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  const scale = D_R / Math.hypot(0.6, -1.3 - BAULK_Y);
  if (Math.abs(p1[2] - 0.6 * scale) > 1e-6
    || Math.abs(p1[0] - (BAULK_Y + (-1.3 - BAULK_Y) * scale)) > 1e-6) {
    fail(`S6: out-of-D request did not clamp onto the D boundary: ${p1}`);
  }
  // a request ABOVE the baulk line clamps back onto it
  if (!(await ev('__test.placeCue(0.1, -0.5)'))) fail('S6: baulk clamp call failed');
  const p2 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(p2[0] - BAULK_Y) > 1e-6 || Math.abs(p2[2] - 0.1) > 1e-6) {
    fail(`S6: above-baulk request did not clamp to the line: ${p2}`);
  }
  // an in-D request is kept exactly
  if (!(await ev('__test.placeCue(-0.1, -1.2)'))) fail('S6: in-D placement rejected');
  const p3 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(p3[2] + 0.1) > 1e-6 || Math.abs(p3[0] + 1.2) > 1e-6) {
    fail(`S6: in-D request moved: ${p3}`);
  }

  // ---- S7: final colours — the ball on is auto-nominated, pots stay DOWN -----
  await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 16, x: POT.x, y: POT.y },
    ...coloursAt(17, 18, 19, 20, 21)],
  {
    phase: 'final_colours', ballOn: 16, shooter: 1,
    scores: { 1: 20, 2: 5 }, currentBreak: 0,
  });
  if (await shot('S7', { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S7: final-colours pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[16]'
    || JSON.stringify(j?.respot) !== '[]') {
    fail('S7: yellow must stay DOWN in the final sequence (R3(h)(ii)): ' + JSON.stringify(j));
  }
  if (m?.ballOn !== 17 || m?.scores?.[1] !== 22 || m?.onTable?.includes(16)) {
    fail('S7: green must be on next: ' + JSON.stringify(m));
  }
  const yellow7 = (await ev('__test.balls()')).find((b) => b.id === 16);
  if (!yellow7.pocketed) fail('S7: potted yellow returned to the table');

  // ---- S8: the black ends the frame — WIN with the R4(b) cite ----------------
  await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 21, x: POT.x, y: POT.y }],
  {
    phase: 'final_colours', ballOn: 21, shooter: 1,
    scores: { 1: 22, 2: 5 }, currentBreak: 0,
  });
  if (await shot('S8', { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S8: potting the black did not end the frame');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'black-potted'
    || j?.terminal?.cite !== C.frameEnd) {
    fail('S8: expected the R4(a) frame end: ' + JSON.stringify(j?.terminal));
  }
  if (!sawLog('[flow] gameWon') || !sawLog('"reason":"black-potted"')) {
    fail('S8: gameWon hook/reason not printed');
  }
  const banner = settled.banner; // atomic with the WIN edge
  if (!banner.includes('WINS THE FRAME') || !banner.includes('R4(a)')) {
    fail('S8: frame-win banner lacks the verdict/cite: ' + banner);
  }
  await sleep(3200); // WIN auto re-racks (2.6 s banner)
  { // GH-370: a fresh frame grants the opening in-hand right ON/WITHIN the
    // D (WPBSA Sec2 R9(a)(i) + Sec3 R5) — BALL_IN_HAND with 'd_zone'
    let s8 = null;
    for (let i = 0; i < 25 && s8 !== 'BALL_IN_HAND'; i++) {
      s8 = await ev('__test.state()');
      if (s8 !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s8 !== 'BALL_IN_HAND') fail('S8: fresh frame did not grant the opening BALL_IN_HAND (GH-370)');
    if (await ev('window.__rules.placementRight()') !== 'd_zone') {
      fail('S8: opening placement right not d_zone (Sec3 R5)');
    }
    const zo = await ev('__aim.zoneOverlay()');
    if (!zo?.visible || zo.kind !== 'd_zone') {
      fail('S8: D zone overlay not shown during the opening grant: ' + JSON.stringify(zo));
    }
    // the D boundary is INCLUSIVE ("on or within"): a request exactly ON
    // the baulk line inside the D stays ON it (no exclusive nudge —
    // contrast the pool kitchen clamp)
    if (await ev(`__test.placeCue(0.1, ${BAULK_Y})`) !== true) fail('S8: D placement refused');
    const cue8 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (Math.abs(cue8[0] - BAULK_Y) > 1e-9 || Math.abs(cue8[2] - 0.1) > 1e-9) {
      fail(`S8: on-the-line D placement must stay ON the baulk line (Sec3 R5): ${cue8}`);
    }
    // outside-the-D requests clamp onto the D boundary (radial, inclusive)
    if (await ev(`__test.placeCue(0.4, ${BAULK_Y - 0.4})`) !== true) fail('S8: D clamp refused');
    const cue8b = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    const dd = Math.hypot(cue8b[2] - 0, cue8b[0] - BAULK_Y);
    if (dd > 0.292 + 1e-9) fail(`S8: clamped D placement left the D (r = ${dd})`);
  }
  if ((await ev('__test.balls()')).length !== 22) fail('S8: snooker re-rack ball count wrong');

  // ---- S8b sub-arm (GH-716 review r1v P3-a): the frame-seam register SURVIVES
  // a shared replay entered during the WIN hold. Frame 4 (breaker b4): the
  // BREAKER wins, so winner-breaks (b4) and alternation (3 - b4) disagree.
  // While the WIN banner holds (`player` = the winner, the next frame's
  // breaker 3 - b4 in flow's register) a share of THIS session is entered
  // IN-PAGE (__share.start: decode + startReplay — the transport pins the
  // wire's breaker and re-racks UNDER the replay lock), played to its end and
  // exited (__share.exit: the viewer's seat — the winner — re-pinned under the
  // lock, the viewer's game re-racked unlocked). That fresh rack IS the
  // viewer's frame 5: its opening BIH must seat the ALTERNATE 3 - b4. RED on
  // the pre-fix bytes: the locked transport fold consumed the one-shot
  // register and the exit restoration re-seated the winner b4. The persisted
  // game is pinned to snooker first (the suite entered snooker through the
  // activateSnooker seam, which never touches the persisted blob; exit's
  // restorePersistedGame would otherwise hand the viewer a 9-ball rack).
  let stageWinHold = null; // bound inside the S8b block (its scene/pot lane)
  async function s8bReplayRoundTrip(b4) { // b4: the live breaker at entry (frame 4's opening BIH)
    const tag = 'S8b-f4';
    const pinned = await ev("__settings.changeGame('snooker', { skipConfirm: true })").catch((e) => String(e));
    if (pinned !== true) { fail(`${tag}: staging — changeGame('snooker') refused: ${pinned}`); return null; }
    let st = null;
    for (let i = 0; i < 25 && st !== 'BALL_IN_HAND'; i++) { st = await ev('__test.state()'); if (st !== 'BALL_IN_HAND') await sleep(200); }
    const b4b = await player();
    if (st !== 'BALL_IN_HAND' || b4b !== b4) { fail(`${tag}: staging — the persisted-game re-rack changed the frame (state ${st}, breaker P${b4b}, want P${b4})`); return null; }
    // the share to enter: ONE plain reds-phase stroke of this fresh frame,
    // encoded BEFORE the frame is shaped (a replay re-folds the rack's own
    // phase, so a shaped final_colours stroke's nomination would be judged
    // against a reds fold — a Sec3 R3(g) call error, not this arm's subject)
    const rec = await shot(tag + '-rec', { v0: 1.2, phi: 'PI2', theta: 0, a: 0, b: 0 });
    if (rec === 'REJECTED') return null;
    const link = await ev('__share.encode()').catch((e) => String(e));
    const at = typeof link === 'string' ? link.indexOf('#r=') : -1;
    if (at < 0) { fail(`${tag}: __share.encode() produced no #r= link: ${JSON.stringify(link)}`); return null; }
    const hash = link.slice(at + 3).split('&')[0];
    // the stroke switched the turn: the shaped frame's scene() fold seeds
    // frameBreaker from the LIVE seat (the S8b law — every frame's fold
    // keeps the live seat as that frame's breaker), so frame 4's breaker is
    // read here and the BREAKER is made the winner (winner-breaks and
    // alternation must disagree for the arm to bite)
    const brk = await player();
    if (brk !== 1 && brk !== 2) { fail(`${tag}: staging — live seat after the recording stroke not a seat: ${brk}`); return null; }
    await stageWinHold(tag, brk);
    const held = await ev('__test.state()');
    if (held !== 'WIN') { fail(`${tag}: staging — expected the WIN hold at replay entry, state ${held}`); return null; }
    const started = await ev(`__share.start(${JSON.stringify(hash)}).then(() => true, (e) => String(e && e.message || e))`);
    if (started !== true) { fail(`${tag}: __share.start refused: ${started}`); return null; }
    let rep = null;
    for (let i = 0; i < 40 && !rep?.active; i++) { rep = await ev('__share.replay()'); if (!rep?.active) await sleep(250); }
    if (!rep?.active) { fail(`${tag}: the shared replay never became active: ${JSON.stringify(rep)}`); return null; }
    const wireSeat = await player(); // the transport fold under the lock seats the wire's breaker
    let done = false;
    for (let i = 0; i < 200 && !done; i++) { done = await ev('__share.replay().done === true'); if (!done) await sleep(300); }
    if (!done) { // exit from a resting table anyway (the shot may have been refused)
      st = 'PLAYBACK';
      for (let i = 0; i < 40 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) { st = await ev('__test.state()'); if (st === 'PLAYBACK' || st === 'SIMULATING') await sleep(300); }
      console.warn(`${tag}: the replay (n=${rep.n}) was not done after 60 s; exiting from state ${st}`);
    }
    await ev('__share.exit(), true');
    let cleared = false;
    for (let i = 0; i < 40 && !cleared; i++) { cleared = await ev('__share.replay().active === false'); if (!cleared) await sleep(250); }
    if (!cleared) fail(`${tag}: __share.exit() did not clear replay.active`);
    st = null;
    for (let i = 0; i < 25 && st !== 'BALL_IN_HAND'; i++) { st = await ev('__test.state()'); if (st !== 'BALL_IN_HAND') await sleep(200); }
    const gid = await ev('__rules.game()');
    if (st !== 'BALL_IN_HAND' || gid !== 'snooker') fail(`${tag}: the exit re-rack did not open a fresh snooker frame (state ${st}, game ${gid})`);
    const b5 = await player();
    console.log(`${tag}: frame 4 breaker P${brk} wins → WIN hold → shared replay (wire breaker P${rep.breaker}, transport seat P${wireSeat}, done=${done}) → exit → frame 5 breaker P${b5}`);
    if (b5 !== 3 - brk) {
      fail(`${tag}: after a shared replay entered during the WIN hold the next frame's breaker must still alternate to P${3 - brk}, got P${b5} (RED pre-fix: the locked transport fold dropped the register and the exit restoration re-seated the winner)`);
    }
    return b5;
  }

  // ---- S8b (GH-716): WPBSA Sec3 R3(b) — the break-off ALTERNATES frame by
  // frame ("the player or side to play first must alternate for each frame
  // during a game"), whoever won. Four consecutive frames from this opening
  // BALL IN HAND: the breaker wins f1 (winner-breaks would re-seat it), the
  // NON-breaker wins f2 (alternation is winner-independent), the breaker
  // wins f3 — breakers must read b, 3-b, b, 3-b. Each frame's scene() fold
  // keeps the live seat (= that frame's breaker); the seam reshapes only the
  // SHOOTER of the finishing black. Pool keeps winner-breaks (e2e-rules
  // GH-716 guard), heyball its I.12 arm (e2e-heyball).
  {
    const failsAtEntry = failCount; // P3-b: the OK line needs a clean block
    // { hold } (review r1v P3-a sub-arm): return DURING the WIN hold (before
    // the banner read and the 2.6 s auto re-rack) — the caller drives the
    // shared-replay round trip from there.
    stageWinHold = (tag, winner) => stageWin(tag, winner, { hold: true });
    const stageWin = async (tag, winner, { hold = false } = {}) => {
      await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 21, x: POT.x, y: POT.y }], {
        phase: 'final_colours', ballOn: 21, shooter: winner,
        scores: { [winner]: 22, [3 - winner]: 5 }, currentBreak: 0,
      });
      if (await shot(tag, { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
        fail(tag + ': potting the black did not end the frame');
      }
      if (settled.judgment?.terminal?.winner !== winner) {
        fail(tag + ': expected winner ' + winner + ': ' + JSON.stringify(settled.judgment?.terminal));
      }
      if (hold) return null;
      // GH-716 review r1 P1: the WIN banner names the WINNER for the whole
      // hold (`player` stays the winner; the alternation is applied at the
      // next frame's fold, never before). RED on the pre-fix bytes: when the
      // breaker won, the seat moved BEFORE the WIN state and the banner
      // announced the LOSER ("PLAYER <3-winner> WINS THE FRAME").
      await sleep(250);
      const banner = await ev('document.getElementById("banner").textContent');
      const seat = await player();
      if (!banner.includes(`PLAYER ${winner} WINS THE FRAME`)) {
        fail(`${tag}: the WIN banner must name the winner P${winner}, got "${banner}"`);
      }
      if (banner.includes(`PLAYER ${3 - winner} WINS`)) {
        fail(`${tag}: the WIN banner names the LOSER P${3 - winner}: "${banner}"`);
      }
      if (seat !== winner) {
        fail(`${tag}: the live seat during the WIN hold must stay the winner P${winner}, got P${seat}`);
      }
      await sleep(2950); // WIN auto re-rack (2.6 s banner)
      let st = null;
      for (let i = 0; i < 25 && st !== 'BALL_IN_HAND'; i++) {
        st = await ev('__test.state()');
        if (st !== 'BALL_IN_HAND') await sleep(200);
      }
      if (st !== 'BALL_IN_HAND') fail(tag + ': fresh frame did not grant the opening BALL_IN_HAND');
      return player();
    };
    const b1 = await player(); // this frame's breaker, read at its opening BIH
    if (b1 !== 1 && b1 !== 2) fail('S8b: opening breaker not a seat: ' + b1);
    const b2 = await stageWin('S8b-f1', b1);     // breaker wins → other seat breaks off
    const b3 = await stageWin('S8b-f2', 3 - b2); // non-breaker wins → still alternates
    const b4 = await stageWin('S8b-f3', b3);     // breaker wins again
    const got = [b1, b2, b3, b4].join(',');
    const want = [b1, 3 - b1, b1, 3 - b1].join(',');
    if (got !== want) {
      fail(`S8b: snooker break-off must alternate frame by frame (WPBSA Sec3 R3(b)): breakers ${got}, want ${want}`);
    }
    const stateLine = await ev('document.getElementById("state").textContent');
    if (!stateLine.includes(`P${b4}:`)) {
      fail(`S8b: HUD state line does not name the frame's breaker P${b4}: "${stateLine}"`);
    }
    if (!stateLine.includes('BALL IN HAND')) fail('S8b: HUD state line not the opening BIH: ' + stateLine);
    const b5 = await s8bReplayRoundTrip(b4);
    // P3-b (review r1v): the OK line is printed only when the block itself
    // recorded no failure — a FAIL line and an OK line for the same block
    // never share a log.
    if (failCount === failsAtEntry) {
      console.log('S8b OK: WPBSA Sec3 R3(b) break-off alternation breakers ' + got
        + ` (review r1: every WIN banner named its winner; r1v: WIN hold → shared replay → exit kept frame 5's breaker P${b5})`);
    } else {
      console.error(`S8b: ${failCount - failsAtEntry} failure(s) in the block — no OK line`);
    }
  }

  // ============================================================================
  // ---- S9 (issue #90): NATURAL-flow arms — the H1 guard ----------------------
  // Every arm below drives TWO-OR-MORE consecutive strokes ACROSS a snooker
  // turn switch with NO setMatchState reshaping: scene(specs) alone rebuilds
  // a genuine fresh fold (resetMatch layout:true), and every subsequent
  // state transition is the real judge+adapter path. This is the exact flow
  // class the owner's H1 report lives in (incoming striker's red pot judged
  // wrong-first) — every existing S2–S8 arm reshaped state via the test
  // seam and could not see an integration-boundary leak. If any incoming
  // red pot here judges foul, assertIncomingRedPot dumps the judgment +
  // the full judgments() ledger verbatim and stops the suite.
  // Recipes (soft stun taps, lane rolls, ghost-ball pots incl. the
  // y-mirrored head-right lane) proven offline against the committed wasm.

  // ---- S9a: legal-contact miss → turn passes → incoming striker pots red ----
  {
    const A_CUE = LANE(0.95), A_RED1 = LANE(0.95 + 3 * BALL_R), A_RED2 = POT;
    await scene([{ id: 0, x: A_CUE.x, y: A_CUE.y },
      { id: 1, x: A_RED1.x, y: A_RED1.y }, { id: 2, x: A_RED2.x, y: A_RED2.y },
      ...coloursAt(16, 17, 18, 19, 20, 21)]); // NO setMatchState — natural fold
    const p0 = await player();
    m = await match();
    if (m?.phase !== 'reds' || m?.ballOn !== 'red') {
      fail('S9a: natural fresh fold wrong: ' + JSON.stringify(m));
    }
    // stroke 1 (outgoing striker): soft stun tap backward onto the red
    // parked 3R behind the cue ON the lane — legal contact, no pot, and
    // the cue rests still on the lane for the incoming stroke
    if (await shot('S9a-1', { v0: 0.7, phi: SPHI + Math.PI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9a: legal-contact miss did not return to AIM');
    }
    j = await judgment();
    m = await match();
    if (!j?.legal || j?.fouls?.length || j?.pocketed?.length || j?.turn !== 'pass') {
      fail('S9a: legal-contact miss misjudged: ' + JSON.stringify(j));
    }
    if (await player() !== 3 - p0) fail('S9a: turn did not pass to the incoming striker');
    if (m?.phase !== 'reds' || m?.ballOn !== 'red') {
      fail('S9a: incoming striker must be ON RED (Sec2 R13): ' + JSON.stringify(m));
    }
    if (!sawLog('[flow] playerChanged')) fail('S9a: playerChanged hook not printed');
    let led = await ev('window.__rules.judgments()');
    let row = led[led.length - 1];
    if (row?.shooter !== p0 || row?.legal !== true || row?.fouls?.length) {
      fail('S9a: ledger row for the miss wrong: ' + JSON.stringify(row));
    }
    // stroke 2 (INCOMING striker): pots the pre-placed pot-lane red from
    // the cue's rest position — THE H1 red/green arm
    let cue = await kposOf(0), red = await kposOf(2);
    if (await shot('S9a-2', { v0: 2.5, phi: ghostPhi(cue, red), theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9a: incoming red pot did not return to AIM');
    }
    j = await judgment();
    m = await match();
    await assertIncomingRedPot('S9a', j, 2);
    if (m?.phase !== 'colour_after_red' || m?.scores?.[3 - p0] !== 1) {
      fail('S9a: incoming striker must stand at +1 on a colour: ' + JSON.stringify(m));
    }
    if (await player() !== 3 - p0) fail('S9a: a legal pot must keep the striker');
    led = await ev('window.__rules.judgments()');
    row = led[led.length - 1];
    if (row?.shooter !== 3 - p0 || row?.legal !== true) {
      fail('S9a: ledger row for the incoming pot wrong: ' + JSON.stringify(row));
    }

    // ---- S9a-vis (issue #90 red/green): the armed-nomination indicator is
    // VISIBLE in snooker — the natural colour_after_red fold we just built.
    // Pre-fix, #hud-call sat inside the #hud-match container hud.js hides
    // for snooker: textContent read fine while offsetParent was null (the
    // S2c blind spot). offsetParent !== null is the visibility truth.
    // POLL (not a fixed sleep): the surface is driven by aim.js's RAF
    // frame hook, and headless RAF cadence is host-load-dependent.
    if (await ev('window.__aim.nominationRequired()') !== true) {
      fail('S9a-vis: nomination affordance absent on the natural colour fold');
    }
    let vis0 = null;
    for (let i = 0; i < 40; i++) {
      vis0 = await ev(`(() => {
        const el = document.getElementById('hud-call');
        return { visible: el.offsetParent !== null, text: el.textContent,
          groups: getComputedStyle(document.getElementById('hud-groups')).display };
      })()`);
      if (vis0?.visible === true && vis0?.text && vis0?.groups === 'none') break;
      await sleep(250);
    }
    if (vis0?.visible !== true || !vis0?.text) {
      fail('S9a-vis: nomination indicator not visible pre-pick: ' + JSON.stringify(vis0));
    }
    if (vis0?.groups !== 'none') {
      fail('S9a-vis: stale 8-ball chip strip leaked into snooker: ' + JSON.stringify(vis0));
    }
    await ev('window.__aim.selectCallBall(19)'); // declare the blue
    await sleep(250);
    const vis1 = await ev(`(() => {
      const el = document.getElementById('hud-call');
      return { visible: el.offsetParent !== null, text: el.textContent,
        state: document.getElementById('state').textContent };
    })()`);
    if (vis1?.visible !== true || !vis1?.text.includes('blue')) {
      fail('S9a-vis: armed nomination not visible/named: ' + JSON.stringify(vis1));
    }
    // flow re-renders on nominate: the AIM state line names the colour NOW
    if (!vis1?.state.includes('blue')) {
      fail('S9a-vis: AIM state line does not name the nominated colour: ' + JSON.stringify(vis1));
    }
  }

  // ---- S9b: no-contact foul → play_again(1) → incoming striker pots red -----
  {
    const B_CUE = LANE(0.95), B_RED2 = POT;
    await scene([{ id: 0, x: B_CUE.x, y: B_CUE.y },
      { id: 2, x: B_RED2.x, y: B_RED2.y }, ...coloursAt(16, 17, 18, 19, 20, 21)]);
    const p0 = await player();
    // stroke 1: soft roll into empty cloth, angled off the lane so the
    // incoming pot is a CUT (a dead-straight follow from the rest point
    // scratches — proven offline)
    if (await shot('S9b-1', { v0: 0.5, phi: SPHI + Math.PI + 0.55, theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9b: no-contact foul must park in AIM for the option');
    }
    j = await judgment();
    m = await match();
    if (j?.legal || j?.fouls?.[0]?.code !== 'no-contact'
      || j?.fouls?.[0]?.cite !== C.noContact) {
      fail('S9b: expected the cited no-contact foul: ' + JSON.stringify(j?.fouls));
    }
    if (m?.scores?.[3 - p0] !== 4) fail('S9b: no-contact must be 4 away: ' + JSON.stringify(m?.scores));
    if (m?.pendingDecision?.kind !== 'play_again' || m?.pendingDecision?.chooser !== 3 - p0) {
      fail('S9b: expected play_again for the incoming striker: ' + JSON.stringify(m?.pendingDecision));
    }
    if (await ev('window.__rules.decide(1)') !== true) fail('S9b: decide(1) rejected');
    if (await player() !== 3 - p0) fail('S9b: choice 1 must seat the incoming striker');
    if ((await match())?.ballOn !== 'red') fail('S9b: incoming striker must be ON RED');
    // stroke 2 (INCOMING striker): the ~23° cut pot up the untouched lane
    const cue = await kposOf(0), red = await kposOf(2);
    if (await shot('S9b-2', { v0: 2.8, phi: ghostPhi(cue, red), theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9b: incoming red pot did not return to AIM');
    }
    j = await judgment();
    m = await match();
    await assertIncomingRedPot('S9b', j, 2);
    if (m?.scores?.[3 - p0] !== 5) { // 4 (penalty) + 1 (the pot)
      fail('S9b: incoming striker must stand at 5: ' + JSON.stringify(m?.scores));
    }
  }

  // ---- S9c: red pot → nominate → colour legal-miss → turn passes →
  // incoming striker pots red (the nomination-RESIDUE cell: an armed
  // nomination consumed by a colour miss must not leak across the switch) --
  {
    const C_CUE = LANEH(0.55), C_RED1 = LANEH(0.35), C_RED3 = POT;
    // the nominated blue parks 0.27 m from the measured post-pot cue rest
    // (LANEH(0.3603), offline probe) along the backward mirror-lane
    // direction rotated +8° — its roll after the tap clears every spot
    const p1e = LANEH(0.3603);
    const back = SPHIH + Math.PI + 0.14;
    const C_BLUE = { x: p1e.x + 0.27 * Math.cos(back), y: p1e.y + 0.27 * Math.sin(back) };
    await scene([{ id: 0, x: C_CUE.x, y: C_CUE.y },
      { id: 1, x: C_RED1.x, y: C_RED1.y }, { id: 2, x: C_RED3.x, y: C_RED3.y },
      { id: 19, x: C_BLUE.x, y: C_BLUE.y }, ...coloursAt(16, 17, 18, 20, 21)]);
    const p0 = await player();
    // stroke 1 (outgoing striker): short straight red pot down the
    // y-MIRRORED lane into the head-right corner — keeps the pocket-5
    // lane pristine for the incoming striker
    if (await shot('S9c-1', { v0: 2.2, phi: SPHIH, theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9c: mirror-lane red pot did not return to AIM');
    }
    j = await judgment();
    m = await match();
    if (!j?.legal || JSON.stringify(j?.pocketed) !== '[1]' || j?.turn !== 'continue'
      || m?.phase !== 'colour_after_red') {
      fail('S9c: mirror-lane red pot misjudged: ' + JSON.stringify({ j, m }));
    }
    // stroke 2 (same striker): nominate the blue, then a soft legal MISS
    // on it (contact, no pot) — the turn passes with the nomination spent
    if (await ev('window.__rules.nominate(19)') !== true) fail('S9c: nominate(19) rejected');
    if ((await ev('window.__rules.calledShot()'))?.ball !== 19) {
      fail('S9c: nomination did not arm');
    }
    let cue = await kposOf(0);
    const blue = await kposOf(19);
    const phiB = Math.atan2(blue.y - cue.y, blue.x - cue.x);
    if (await shot('S9c-2', { v0: 0.6, phi: phiB, theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9c: nominated-colour miss did not return to AIM');
    }
    j = await judgment();
    m = await match();
    if (!j?.legal || j?.fouls?.length || j?.pocketed?.length || j?.turn !== 'pass') {
      fail('S9c: nominated-colour legal miss misjudged: ' + JSON.stringify(j));
    }
    if (await player() !== 3 - p0) fail('S9c: turn did not pass after the colour miss');
    if (m?.phase !== 'reds' || m?.ballOn !== 'red') {
      fail('S9c: incoming striker must be ON RED: ' + JSON.stringify(m));
    }
    if (await ev('window.__rules.calledShot()') !== null) {
      fail('S9c: nomination RESIDUE survived the turn switch');
    }
    // stroke 3 (INCOMING striker): pots the pristine pot-lane red
    cue = await kposOf(0);
    const red = await kposOf(2);
    if (await shot('S9c-3', { v0: 2.6, phi: ghostPhi(cue, red), theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9c: incoming red pot did not return to AIM');
    }
    j = await judgment();
    m = await match();
    await assertIncomingRedPot('S9c', j, 2);
    if (m?.scores?.[3 - p0] !== 1) fail('S9c: incoming striker must stand at +1: ' + JSON.stringify(m?.scores));
  }

  // ---- S9d: wrong-first foul ON A COLOUR → play_again(1) → incoming pots red -
  {
    const D_CUE = LANE(1.12), D_BLUE = LANE(1.12 + 3 * BALL_R), D_RED2 = POT;
    await scene([{ id: 0, x: D_CUE.x, y: D_CUE.y },
      { id: 2, x: D_RED2.x, y: D_RED2.y }, { id: 19, x: D_BLUE.x, y: D_BLUE.y },
      ...coloursAt(16, 17, 18, 20, 21)]);
    const p0 = await player();
    // stroke 1: soft backward stun tap ONTO THE BLUE while on red —
    // wrong-first foul, blue involved ⇒ 5 away (Sec3 R11)
    if (await shot('S9d-1', { v0: 0.7, phi: SPHI + Math.PI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9d: foul-on-colour must park in AIM for the option');
    }
    j = await judgment();
    m = await match();
    if (j?.legal || j?.fouls?.[0]?.code !== 'wrong-first-ball'
      || j?.fouls?.[0]?.cite !== C.wrongFirst) {
      fail('S9d: expected the cited wrong-first-ball: ' + JSON.stringify(j?.fouls));
    }
    if (m?.scores?.[3 - p0] !== 5) fail('S9d: blue-involved foul must be 5 away: ' + JSON.stringify(m?.scores));
    if (await ev('window.__rules.decide(1)') !== true) fail('S9d: decide(1) rejected');
    if (await player() !== 3 - p0) fail('S9d: choice 1 must seat the incoming striker');
    // stroke 2 (INCOMING striker): the cue rested ON the lane — pot the red
    const cue = await kposOf(0), red = await kposOf(2);
    if (await shot('S9d-2', { v0: 2.8, phi: ghostPhi(cue, red), theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S9d: incoming red pot did not return to AIM');
    }
    j = await judgment();
    m = await match();
    await assertIncomingRedPot('S9d', j, 2);
    if (m?.scores?.[3 - p0] !== 6) { // 5 (penalty) + 1 (the pot)
      fail('S9d: incoming striker must stand at 6: ' + JSON.stringify(m?.scores));
    }
  }
  // ==== end issue #90 S9 natural-flow family ==================================

  // ============ GH-382 snooker-v2 blocks (the wpbsa-snooker-full preset) ========
  // The HUD chips and the aim nomination targets re-derive on the aim
  // lane's FRAME tick — one rAF after a decision resolves — so every
  // chip/affordance assertion below POLLS (the suite's settle-poll
  // philosophy; an instant scrape races the tick).
  const waitFor = async (tag, cond) => {
    for (let i = 0; i < 40; i++) {
      const v = await ev(cond);
      if (v) return v;
      await sleep(120);
    }
    fail(tag + ': never became true: ' + cond);
    return null;
  };
  const waitForChip = (tag, text) => waitFor(tag,
    'document.getElementById("hud-snooker-chips").textContent'
    + `.includes(${JSON.stringify(text)})`);
  // The three completion mechanics, driven end-to-end through the REAL
  // adapter surfaces: the settings variant lane, the crate judge via the
  // committed artifact, the decision prompt machinery, the in-scene
  // nomination lanes and the HUD chips.

  // ---- V2-0: activate the completion preset through the settings lane ---------
  if (!(await ev("window.__rules.activateSnooker('wpbsa-snooker-full')"))) {
    fail('V2-0: activateSnooker(wpbsa-snooker-full) refused');
  }
  {
    const v = await ev('window.__rules.variant()');
    if (v?.preset !== 'wpbsa-snooker-full') {
      fail('V2-0: variant not pinned: ' + JSON.stringify(v));
    }
    const ms0 = await match();
    if (ms0.freeBallEligible !== false || ms0.miss !== null) {
      fail('V2-0: fresh v2 fold carries unexpected trackers: '
        + JSON.stringify({ f: ms0.freeBallEligible, m: ms0.miss }));
    }
    console.log('V2-0 OK: wpbsa-snooker-full pinned (taskHash '
      + v.taskHash.slice(0, 8) + '), snooker-v2 judging');
  }

  // ---- V2-1: FOUL AND A MISS — decision 17, the bit-exact replace loop,
  // the Warning, the R14(d)(ii) frame award --------------------------------------
  {
    const IDS = [0, 1, 16, 17, 18, 19, 20, 21];
    const stage = async () => scene(
      [{ id: 0, x: 0, y: -0.5 }, { id: 1, x: 0.35, y: 0.9 },
        { id: 16, x: 0, y: 0.2 }, ...coloursAt(17, 18, 19, 20, 21)],
      {
        phase: 'reds', shooter: 1, scores: { 1: 0, 2: 0 }, currentBreak: 0,
        ballOn: 'red', onTable: [1, 16, 17, 18, 19, 20, 21],
        respotQueue: [], pendingDecision: null, foulContext: null,
        result: null, freeBallEligible: false, miss: null, missRestore: null,
      });
    await stage();
    const posBefore = {};
    for (const id of IDS) posBefore[id] = await kposOf(id);
    const missShot = { v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 };
    // miss #1: straight into the yellow — wrong first ball, open sight on
    // the red (full-ball contact available: the R14(d) ladder arms)
    await shot('V2-1 miss#1', missShot);
    let j = await judgment();
    if (j.fouls?.[0]?.code !== 'wrong-first-ball'
      || j.decisionRequired?.kind !== 'foul_and_a_miss') {
      fail('V2-1: expected wrong-first-ball + foul_and_a_miss, got '
        + JSON.stringify({ fouls: j.fouls, d: j.decisionRequired }));
    }
    if (!sawLog('[flow] decisionRequired {"kind":"foul_and_a_miss"')) {
      fail('V2-1: decisionRequired hook missing');
    }
    let ms = await match();
    if (ms.miss?.count !== 1 || ms.miss?.fullBall !== true) {
      fail('V2-1: miss context wrong: ' + JSON.stringify(ms.miss));
    }
    // the prompt renders three options (Sec3 R14(b))
    const btnCount = await ev(
      'document.querySelectorAll("#hud-decision .hd-btns button").length');
    if (btnCount !== 3) fail(`V2-1: expected 3 miss options, got ${btnCount}`);
    // choice 3: all balls REPLACED — byte-exact against the address
    await ev('window.__rules.decide(3)');
    if ((await player()) !== 1) fail('V2-1: offender must be back at the table');
    for (const id of IDS) {
      const now = await kposOf(id);
      if (JSON.stringify(now) !== JSON.stringify(posBefore[id])) {
        fail(`V2-1: ball ${id} not replaced bit-exactly: `
          + JSON.stringify({ before: posBefore[id], after: now }));
      }
    }
    console.log('V2-1 replace OK: 8 balls byte-identical to the address');
    // miss #2 from the identical position, then the Warning on the way back
    await shot('V2-1 miss#2', missShot);
    ms = await match();
    if (ms.miss?.count !== 2) fail('V2-1: second failure must count 2');
    await ev('window.__rules.decide(3)');
    ms = await match();
    if (ms.miss?.warned !== true) {
      fail('V2-1: R14(d)(ii) Warning missing: ' + JSON.stringify(ms.miss));
    }
    await waitForChip('V2-1 Warning chip',
      'warning: one more miss forfeits the frame');
    // miss #3: the frame is awarded (Sec3 R14(d)(ii))
    await shot('V2-1 miss#3', missShot);
    j = await judgment();
    if (j.terminal?.reason !== 'miss-frame-award' || j.terminal?.winner !== 2) {
      fail('V2-1: expected the miss-frame-award terminal, got '
        + JSON.stringify(j.terminal));
    }
    const st = await ev('__test.state()');
    if (st !== 'WIN') fail('V2-1: frame award must route WIN, got ' + st);
    console.log('V2-1 OK: miss decision loop (replace ×2, Warning, '
      + 'frame award — WPBSA Sec3 R14(b)/(d))');
  }

  // ---- V2-2: FREE BALL — the referee call, the in-scene nomination, the
  // R12 stroke ------------------------------------------------------------------
  {
    if (!(await ev("window.__rules.activateSnooker('wpbsa-snooker-full')"))) {
      fail('V2-2: re-activate refused');
    }
    // gentle wrong-first tap on the blue leaves the cue snookered behind
    // it on the one remaining red — the incoming player gets FREE BALL
    await scene(
      [{ id: 0, x: 0.5, y: -0.3 }, { id: 19, x: 0.5, y: -0.19 },
        { id: 1, x: 0.5, y: 0.9 }, ...coloursAt(16, 17, 18, 20, 21)],
      {
        phase: 'reds', shooter: 1, scores: { 1: 0, 2: 0 }, currentBreak: 0,
        ballOn: 'red', onTable: [1, 16, 17, 18, 19, 20, 21],
        respotQueue: [], pendingDecision: null, foulContext: null,
        result: null, freeBallEligible: false, miss: null, missRestore: null,
      });
    await shot('V2-2 snookering foul', { v0: 0.35, phi: Math.PI / 2,
      theta: 0, a: 0, b: 0 });
    const j1 = await judgment();
    if (j1.fouls?.[0]?.code !== 'wrong-first-ball'
      || j1.decisionRequired?.kind !== 'foul_and_a_miss') {
      fail('V2-2: staging foul wrong: ' + JSON.stringify(j1.fouls));
    }
    // the non-offender plays from the position left — the free-ball
    // right survives (R12(f) voids it only on play-again/replacement)
    await ev('window.__rules.decide(1)');
    if ((await player()) !== 2) fail('V2-2: the non-offender must be seated');
    const ms = await match();
    if (ms.freeBall !== true || ms.freeBallEligible !== true) {
      fail('V2-2: the FREE BALL call is not live: '
        + JSON.stringify({ fb: ms.freeBall, el: ms.freeBallEligible }));
    }
    if (!sawLog('[flow] freeBall')) fail('V2-2: freeBall hook missing');
    await waitForChip('V2-2 free-ball chip', 'Free ball');
    // direct manipulation: tap the yellow IN SCENE (the aim.js raycast
    // lane's programmatic twin — the same selectCallBall entry the
    // desktop pick and the touch tap drive). The tap lands once the aim
    // lane's frame tick derives the free-ball targets — poll the ARMED
    // call, re-tapping each round.
    const armed = await waitFor('V2-2 nomination armed',
      '(window.__aim.selectCallBall(16), '
      + '(window.__rules.calledShot()?.freeBall === true '
      + '&& window.__rules.calledShot()?.ball === 16) '
      + '&& window.__rules.calledShot())');
    if (armed?.kind !== 'nominate' || armed?.ball !== 16
      || armed?.freeBall !== true) {
      fail('V2-2: free-ball nomination not armed: ' + JSON.stringify(armed));
    }
    if (!sawLog('[flow] colourNominated')) {
      fail('V2-2: colourNominated hook missing');
    }
    // review GH-382 r2: the optional nomination is REVOCABLE — tapping a
    // red withdraws it back to the plain red shot, then re-arm
    await ev('window.__aim.selectCallBall(1)');
    await waitFor('V2-2 withdrawal',
      'window.__rules.calledShot() === null');
    if (!sawLog('[flow] nominationWithdrawn')) {
      fail('V2-2: nominationWithdrawn hook missing');
    }
    await waitFor('V2-2 re-arm',
      '(window.__aim.selectCallBall(16), '
      + 'window.__rules.calledShot()?.freeBall === true)');
    // play the nominated free ball first (R12(b)(i)): a clean legal hit
    const cue2 = await kposOf(0);
    const y16 = await kposOf(16);
    const phiFB = Math.atan2(y16.y - cue2.y, y16.x - cue2.x);
    await shot('V2-2 free-ball stroke', { v0: 1.0, phi: phiFB, theta: 0,
      a: 0, b: 0 });
    const j2 = await judgment();
    if (j2.legal !== true) {
      fail('V2-2: the free-ball stroke must be legal, got '
        + JSON.stringify(j2.fouls));
    }
    const ms2 = await match();
    if (ms2.freeBallEligible !== false || ms2.freeBall === true) {
      fail('V2-2: the free-ball right must be consumed');
    }
    console.log('V2-2 OK: FREE BALL called, nominated in scene, stroke '
      + 'judged under Sec3 R12');
  }

  // ---- V2-3: TOUCHING BALL — the declaration chip, the judged play-away,
  // the push stroke --------------------------------------------------------------
  {
    if (!(await ev("window.__rules.activateSnooker('wpbsa-snooker-full')"))) {
      fail('V2-3: re-activate refused');
    }
    const FROZEN_Y = 2 * BALL_R + 1e-9; // the app sanitizer's kiss gap
    const stageTouch = async () => scene(
      [{ id: 0, x: 0.3, y: 0 }, { id: 1, x: 0.3, y: FROZEN_Y },
        { id: 2, x: -0.5, y: 1.2 }, ...coloursAt(16, 17, 18, 19, 20, 21)],
      {
        phase: 'reds', shooter: 1, scores: { 1: 0, 2: 0 }, currentBreak: 0,
        ballOn: 'red', onTable: [1, 2, 16, 17, 18, 19, 20, 21],
        respotQueue: [], pendingDecision: null, foulContext: null,
        result: null, freeBallEligible: false, miss: null, missRestore: null,
      });
    await stageTouch();
    const ms3 = await match();
    if (!Array.isArray(ms3.touching) || !ms3.touching.includes(1)) {
      fail('V2-3: touching fact missing: ' + JSON.stringify(ms3.touching));
    }
    if (!sawLog('[flow] touchingBall')) fail('V2-3: touchingBall hook missing');
    await waitForChip('V2-3 touching chip', 'Touching ball');
    // play AWAY into empty cloth (south-east): no contact at all — the
    // R8(c)(i) deemed contact makes the stroke LEGAL
    await shot('V2-3 play away', { v0: 0.3, phi: Math.atan2(-0.6, 0.35),
      theta: 0, a: 0, b: 0 });
    const j3 = await judgment();
    if (j3.legal !== true || j3.turn !== 'pass') {
      fail('V2-3: clean play-away must be a legal pass, got '
        + JSON.stringify({ legal: j3.legal, fouls: j3.fouls, turn: j3.turn }));
    }
    // re-stage and play INTO the touching red: the push stroke (R8(b))
    await stageTouch();
    await shot('V2-3 push', { v0: 0.8, phi: Math.PI / 2, theta: 0,
      a: 0, b: 0 });
    const j4 = await judgment();
    if (j4.fouls?.[0]?.code !== 'push-stroke') {
      fail('V2-3: expected the push-stroke foul, got '
        + JSON.stringify(j4.fouls));
    }
    if (j4.decisionRequired?.kind !== 'play_again') {
      fail('V2-3: a push against the ball on is a foul but NOT a miss');
    }
    console.log('V2-3 OK: touching ball called, play-away legal, '
      + 'push stroke fouled (WPBSA Sec3 R8)');
  }

  // ---- V2-4: the in-hand D clamp preserves the R11(b)(vii) non-touching
  // clearance (review r27 P1) — a drag onto a red inside the D must land at
  // a FREE separation and never mint a touching-ball address --------------------
  {
    if (!(await ev("window.__rules.activateSnooker('wpbsa-snooker-full')"))) {
      fail('V2-4: re-activate refused');
    }
    const RED = { x: 0.1, y: BAULK_Y - 0.15 }; // inside the D
    await scene(
      [{ id: 0, x: SCRATCH_CUE.x, y: SCRATCH_CUE.y },
        { id: 1, x: RED.x, y: RED.y }, ...coloursAt(19, 20, 21)],
      {
        phase: 'reds', shooter: 1, scores: { 1: 0, 2: 0 }, currentBreak: 0,
        ballOn: 'red', onTable: [1, 19, 20, 21], respotQueue: [],
        pendingDecision: null, foulContext: null, result: null,
        freeBallEligible: false, miss: null, missRestore: null,
      });
    // the baked no-contact scratch: foul AND a miss under the full preset
    await shot('V2-4 scratch', { v0: 1.5, phi: SPHI, theta: 0, a: 0, b: 0 });
    const j5 = await judgment();
    if (!j5?.fouls?.some((f) => f.code === 'scratch')
      || j5?.decisionRequired?.kind !== 'foul_and_a_miss') {
      fail('V2-4: expected scratch + foul_and_a_miss, got '
        + JSON.stringify({ fouls: j5?.fouls, d: j5?.decisionRequired }));
    }
    if (await ev('window.__rules.decide(1)') !== true) {
      fail('V2-4: decide(1) rejected');
    }
    if (await ev('__test.state()') !== 'BALL_IN_HAND'
      || await ev('window.__rules.placementRight()') !== 'd_zone') {
      fail('V2-4: non-offender in-hand D grant missing');
    }
    // drag ONTO the red: pre-r27 this parked at the 2r+1e-9 touching
    // separation and announced TOUCHING BALL from an in-hand placement
    if (await ev(`__test.placeCue(${RED.x + 0.001}, ${RED.y})`) !== true) {
      fail('V2-4: overlapping D drag refused (must snap to clearance)');
    }
    const cue9 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    const gap = Math.hypot(cue9[2] - RED.x, cue9[0] - RED.y) - 2 * BALL_R;
    if (!(gap >= 1e-4 - 1e-9)) {
      fail(`V2-4: in-hand snap left the cue inside the touching band `
        + `(gap ${gap}; WPBSA Sec3 R11(b)(vii))`);
    }
    const dD = Math.hypot(cue9[2] - 0, cue9[0] - BAULK_Y);
    if (cue9[0] > BAULK_Y + 1e-9 || dD > D_R + 1e-9) {
      fail('V2-4: the snapped placement left the D');
    }
    await sleep(250); // let the address-fact refresh settle before the
                      // negative assertions below (absence must be real)
    const ms9 = await match();
    if (Array.isArray(ms9.touching) && ms9.touching.length) {
      fail('V2-4: an in-hand placement minted a touching call: '
        + JSON.stringify(ms9.touching));
    }
    const chip9 = await ev(
      'document.getElementById("hud-snooker-chips").textContent');
    if (String(chip9).toLowerCase().includes('touching')) {
      fail('V2-4: touching chip rendered for an in-hand placement');
    }
    console.log('V2-4 OK: in-hand D drag snapped to the non-touching '
      + 'clearance (Sec3 R11(b)(vii)); no touching call');
  }

  // ---- V2-5: the decision-1 default flip (owner sign-off on issue #382,
  // 2026-08-07) — an UNPINNED live snooker frame folds the completion
  // preset by default; the default is a READ-time resolution, never a
  // profile seed (the replay-aware half — legacy links pin v1 — is
  // e2e-variants V6 territory) ---------------------------------------------------
  {
    // clear every explicit selection this suite made — the default must
    // resolve on its own
    if (await ev("window.__settings.changeVariant('snooker', null)")
      !== true) {
      fail('V2-5: clearing the snooker selection refused');
    }
    const dflt = await ev("window.__settings.variantFor('snooker')");
    if (dflt !== 'wpbsa-snooker-full') {
      fail('V2-5: the live default must resolve the completion preset '
        + '(decision 1), got ' + JSON.stringify(dflt));
    }
    // resolution-level, not a seed: nothing persists for the default
    const blobSel = await ev(
      `JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}')
        ?.variants?.snooker ?? null`);
    if (blobSel !== null) {
      fail('V2-5: the live default must not persist a selection: '
        + JSON.stringify(blobSel));
    }
    // an UNPINNED activation folds snooker-v2 through the full preset
    if (!(await ev('window.__rules.activateSnooker(null)'))) {
      fail('V2-5: unpinned activation refused');
    }
    const v10 = await ev('window.__rules.variant()');
    if (v10?.preset !== 'wpbsa-snooker-full') {
      fail('V2-5: unpinned fresh frame did not fold the completion '
        + 'preset: ' + JSON.stringify(v10));
    }
    // the explicit v1 alias stays reachable (the picker writes it as an
    // explicit pin under the flipped default)
    if (!(await ev("window.__rules.activateSnooker('wpbsa-snooker')"))) {
      fail('V2-5: explicit v1 alias activation refused');
    }
    if (await ev('window.__rules.variant()') !== null) {
      fail('V2-5: the explicit v1 alias must fold the frozen engine '
        + '(variant() null)');
    }
    console.log('V2-5 OK: decision-1 default flip — unpinned frames fold '
      + 'wpbsa-snooker-full, nothing persists for the default, the v1 '
      + 'alias stays one explicit pick away');
  }

  // ---- hook-wire audit + error gates ------------------------------------------
  for (const hook of ['ballOnChanged', 'colourNominated', 'respotApplied',
    'decisionRequired', 'decisionMade', 'foulCalled', 'gameWon', 'playerChanged']) {
    if (!sawLog(`[flow] ${hook}`)) fail(`hook wire: [flow] ${hook} never printed`);
  }
  // ---- S2p (GH-489 SNK-R34, review r8 P2 A — GAMEPLAY): the corner pot builds its lip pivot ----
  // The drop animation steers to pocketVisualFalls() (pocket-geometry.md Amendment 026) and game.js builds the lip
  // pivot only when the capture point lies within the aperture. From R3-SNK-9 (d06d3ab0, 2026-09-03) to SNK-R33 the
  // export returned the leather PLATE DATUM (r 42.08, 27.87 mm inboard of the kernel capture centre) while the rendered
  // fall was the kernel's CEBP disc (R 88.90): every corner capture — always on the capture disc's rim — fell +19.07 mm
  // outside that aperture and the pivot was rejected (a glide over the opening). SNK-R34: the export returns the
  // render-fall discs (a verbatim copy of the kernel record) and game.js's gate, on the maintainer's ruling (A,
  // identity form — the ownership ledger), takes a fall whose centre and radius equal the kernel pocket's bit for bit without
  // a geometric re-test: measured, the kernel's capture point recomposes 0.1–3.4 µm OUTSIDE the rim (≈ 1.4 µm per
  // m/s), so a plain `<= fall.r` rejected these discs by microns — the pre-fix read of every pot below.
  // These rows run LAST (their own scenes; the scratch pots park a rulebook decision that would refuse the next
  // scripted shot — refuter 2 of §R3c.40). Read through the read-only seam window.__test.sinkInfo() (main.js): each potted ball's entry must carry a pivot
  // (buildSinkPivot non-null: sinkpivot.js's own mirror runs only in its re-base branch, never entered by a
  // kernel-disc fall), its steering fall must be the kernel corner cup (same centre, r 0.0889) and the capture point
  // must sit on that rim (|over| ≤ 10 µm). Pots: the S2 lane at v0 2.5 (before: +3.4 µm → glide), a FAST pot
  // (v0 4.5, before: ≈ +5 µm → glide) and a slow pot with the cue-ball scratch (v0 1.2, before: +0.9 / +0.3 µm → glide).
  // Arms: `--arm falls-plate` (the pre-fix aperture) → every pot REJECTED at +19.07 mm; `--arm falls-perturb` (one
  // copied number moved by 1e-9 on this corner) → the identity branch is not taken → REJECTED by the microns again.
  const readSink = async (tag, ids) => {
    const si = await ev('JSON.stringify(window.__test.sinkInfo ? window.__test.sinkInfo() : null)');
    const sinks = si ? JSON.parse(si) : null;
    if (!Array.isArray(sinks)) { fail(`${tag}: __test.sinkInfo() unavailable — a pre-SNK-R34 main.js (no seam) or no sink index`); return null; }
    const out = {};
    for (const id of ids) { const e = sinks.find((x) => x.id === id); if (!e) fail(`${tag}: ball ${id} has no sink entry: ${si.slice(0, 200)}`); out[id] = e ?? null; }
    return out;
  };
  // ---- SNK-R36 (review r10 P2 B): on the scripted S2 lanes the drop keeps the ball CLEAR of the built leather along the WHOLE descent ----
  // (SCOPE: the corridor these rows shoot; refuter 1's kernel-reachable census into pocket 5 — 68 captures over 396 lanes — reads
  // 10/68 oblique captures still clipping the raised leather collar by ≤ 3.24 mm (was 66/68, ≤ 11.5 mm): the OPEN row of §R3c.42,
  // measured by check-sink-clearance-489 --sweep, not by this suite.)
  // R34's identity gate made the corner pivot build, but the pendulum started AT the capture point (the capture-disc
  // rim, 19.07 mm short of the dressed leather opening) and dropped toward the capture-disc centre, 27.87 mm off the
  // throat axis: replayed, a built obPocketCap vertex came 19.68 mm from the 26.25 mm ball centre 47.5 ms after
  // capture (−6.57 mm). sinkpivot.js now rolls the ball on to the throat rim first (the W9-named model extension,
  // maintainer ruling (a)); this row reads the REAL rendered pose through window.__test.sinkClearance(id) — game.seek
  // every 0.5 ms from the capture, against every built obPocket* vertex within 0.25 m of the cup in plan, world
  // frame — and fails on any penetration. `--arm throat-off` (table.js: no plate datum → no pre-roll) → the corner
  // rows FAIL at −6.57 mm again. The middle rows are the same instrument (their throat IS the capture disc: no roll).
  let seamNudged = false;
  const judgeClearance = async (tag, id, { corner = true, airborne = false } = {}) => {
    if (ARM === 'seam-nudge' && !seamNudged && !/scratch|slow cue| cue$/.test(tag)) { // LAND-11 T2 plant 7: the cue ball moved 30 mm before a NON-scratch row — no by-design precondition → the suite must exit 2
      const cue = JSON.parse(await ev('JSON.stringify(__test.balls().find((b) => b.id === 0))')); if (cue) { await ev(`__test.placeCue(${cue.pos[2] + 0.03}, ${cue.pos[0]})`); seamNudged = true; console.log(`[${tag}] PLANT seam-nudge: cue ball moved +30 mm (placeCue) before this non-scratch row`); }
    }
    const cj = await ev(`JSON.stringify(window.__test.sinkClearance ? window.__test.sinkClearance(${id}) : null)`);
    const c = cj ? JSON.parse(cj) : null;
    if (!c) { fail(`${tag}: __test.sinkClearance() unavailable — a pre-SNK-R36 main.js (no seam)`); return null; }
    // LAND-10 R1: the seam REFUSES when the settled pose is not the seek(t0) pose (it never restores) — that is UNJUDGEABLE by name, never a value
    if (c.refused) {
      const pre = c.precondition || null; const flip = pre && Array.isArray(pre.pocketedFlipSinceSettle) ? pre.pocketedFlipSinceSettle : []; const ids = Array.isArray(c.ids) ? c.ids : [];
      // LAND-12 V3(a)/(b) + C1: by design ONLY when the refusal is a pre-check refusal with a NON-EMPTY id list and EVERY refused id is explained by the seam's
      // named inference pocketedFlipSinceSettle (kernel motion 4 at t0 && !pocketed live — the tree carries no per-ball revive marker); the in-hand leg is removed
      // (a live in-hand revive IS such a flip through game.respotCue). The no-record form (ids [], main.js noRecord) is never by design; an unexplained id
      // (offKernel / pocketedOffPark) is the exit-2 channel with its dMm.
      const unexplained = ids.filter((i) => !flip.includes(i));
      if (c.preCheck && !c.noRecord && ids.length > 0 && unexplained.length === 0) { byDesignUnjudgeable(tag, id, ids, pre ? pre.machineState : '?'); return null; }
      const deltaText = c.deltas && typeof c.deltas === 'object' ? Object.entries(c.deltas).map(([did, d]) => `${did} → ` + Object.entries(d || {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('; ')).join(' | ') : '(no deltas on the refusal)'; // LAND-11 ruling: a refusal names its field — id → field → settled vs after
      const preText = pre ? ` (machine ${pre.machineState}; unexplained id(s) ${unexplained.join(',') || 'none'}; offKernel ${JSON.stringify(pre.offKernel || [])}; pocketedOffPark ${JSON.stringify(pre.pocketedOffPark || [])}; pocketedFlipSinceSettle ${JSON.stringify(flip)})` : '';
      unjudgeable(`${tag}: ${c.refused}${c.noRecord ? ' (no record — never by design)' : ''}${preText} — deltas: ${deltaText}`); return null;
    }
    if (Array.isArray(c.quatRestored) && c.quatRestored.length) console.log(`[${tag}] orientation restored (hidden, parked): ${c.quatRestored.join(',')}`); // LAND-10 R1d: the seam's one write-back, named in the row
    if (Array.isArray(c.giRestored) && c.giRestored.length) console.log(`[${tag}] GI probe restored (hidden, parked): ${c.giRestored.join(',')}`); // LAND-11 (A): the seam's second write-back, named in the row
    if (c.error) { fail(`${tag}: sinkClearance: ${c.error}`); return null; }
    if (!(c.vertices > 0)) { fail(`${tag}: sinkClearance found no built pocket furniture within 0.25 m of the cup (meshes ${JSON.stringify(c.meshes)})`); return c; }
    // refuter 1 of SNK-R36: `null >= 0` is true in JS — a descent that never rendered a sample must FAIL by name, not pass
    if (!(c.samples > 0)) { fail(`${tag}: sinkClearance took NO visible sample of the descent (samples ${c.samples}, lastVisibleMs ${c.lastVisibleMs}) — the ball never rendered after capture`); return c; }
    if (!Number.isFinite(c.minClearanceMm)) { fail(`${tag}: sinkClearance returned no finite clearance (${c.minClearanceMm})`); return c; }
    if (!(c.minClearanceMm >= 0)) fail(`${tag}: the drop PENETRATES the built leather: min clearance ${c.minClearanceMm?.toFixed(3)} mm at ${c.atMs?.toFixed(1)} ms against ${c.atMesh} (pose ${JSON.stringify(c.atPose)}; per mesh ${JSON.stringify(c.perMeshMm)})`);
    const si = await ev('JSON.stringify(window.__test.sinkInfo ? window.__test.sinkInfo() : null)');
    const e = si ? JSON.parse(si).find((x) => x.id === id) : null;
    if (airborne) { // LAND-18 X3: an airborne capture builds NO pivot (the gate rejects motion 5 by design) — the glide steers to the plate datum
      if (e && e.pivot === true) fail(`${tag}: the AIRBORNE capture built a pivot (the gate must reject motion 5): ${JSON.stringify(e)}`);
      if (e && e.roll) fail(`${tag}: the AIRBORNE capture rolled (${JSON.stringify(e.roll)}) — no pivot, no roll expected`);
    } else if (corner) {
      if (!(e && e.roll && e.roll.distMm > 0)) fail(`${tag}: the corner pivot carries no pre-roll segment (sinkInfo roll ${JSON.stringify(e && e.roll)}) — the SNK-R36 branch did not fire`);
      else if (!(Math.abs(Math.hypot(e.roll.entry[0] - e.roll.throat.x, e.roll.entry[1] - e.roll.throat.z) - e.roll.throat.r) < 1e-6)) fail(`${tag}: the roll's rim entry is not ON the throat rim (${JSON.stringify(e.roll)})`);
    } else if (e && e.roll) fail(`${tag}: a MIDDLE pivot rolled (${JSON.stringify(e.roll)}) — the middle throat is the capture disc, no roll expected`);
    console.log(`[${tag}] clearance ${c.minClearanceMm?.toFixed(3)} mm min over ${c.samples} samples (${(c.lastVisibleMs ?? 0).toFixed(1)} ms visible) against ${c.vertices} vertices of ${c.meshes.length} meshes (worst ${c.atMesh} at ${c.atMs?.toFixed(1)} ms)`
      + (e && e.roll ? `; roll ${e.roll.distMm.toFixed(3)} mm / ${e.roll.tMs.toFixed(2)} ms (${e.roll.how}) to the throat r ${(e.roll.throat.r * 1000).toFixed(2)} mm` : '; no roll')
      + (c.landing && c.landing.mesh ? `; landing ${c.landing.mesh} ${c.landing.minMm?.toFixed(1)} mm (not judged)` : ''));
    return c;
  };
  // ---- SNK-R37 (review r11 P2 A/B) re-cut at the #637 landing (LAND-16 Z2): the playback completion budget and the leaf's pre-roll capability ----
  // ONE law for every pot (LAND-16 Z2 + CORRIGENDUM-1 C1 — a refactor of today's deadline): completion = sinkCompletionSec(duration, sink index)
  // = max(duration, max_i s.t + tEnd) (framestep.js — the SAME function the offline export plans with) and settleAt = max(duration + pad,
  // completion): the pad follows the RECORD end, never the completion. A pot whose last drop ends inside duration + pad keeps duration + pad to
  // the millisecond (S2p-scratch: 1.8491 on the 1.4491 s record, its cue's drop ending at 1.6961); the slow final-event pot (A1) settles at its
  // capture + tEnd. `expectExtended` asserts settleAt > duration + pad + 0.05 (A1); every row prints the completion. B3: the loaded leaf must declare preRoll — a cache split
  // (fresh game.js, older sinkpivot.js) would take the plate-steered fallback and this row names it.
  const judgeSettle = async (tag, { expectExtended = false } = {}) => {
    const bj = await ev('JSON.stringify(window.__test.settleBudget ? window.__test.settleBudget() : null)');
    const b = bj ? JSON.parse(bj) : null;
    if (!b) { fail(`${tag}: __test.settleBudget() unavailable — a pre-SNK-R37 main.js (no seam)`); return null; }
    if (!Number.isFinite(b.completion)) { fail(`${tag}: settleBudget() carries no completion field — a pre-LAND-16 main.js hook (the third copy of the arithmetic)`); return b; }
    // ONE law (LAND-16 Z2, CORRIGENDUM-1 C1 — today's shape, a refactor): completion = framestep.js sinkCompletionSec(duration, sink index)
    // = max(duration, last sink end), and settleAt = max(duration + pad, completion): the pad follows the RECORD end, never the sink
    // completion, so a normal-speed pot (its last drop ends inside the pad) settles at duration + pad exactly as before (:2186 kept verbatim)
    const completion = Math.max(b.duration, b.lastSinkEnd ?? 0);
    const legacy = b.duration + b.pad;
    const want = Math.max(legacy, completion);
    if (Math.abs(b.completion - completion) > 1e-9) fail(`${tag}: the hook's completion ${b.completion} ≠ max(duration, last sink end) ${completion} — the hook is not reading sinkCompletionSec`);
    if (Math.abs(b.settleAt - want) > 1e-3) fail(`${tag}: settleAt ${b.settleAt.toFixed(4)} ≠ max(duration + pad, completion) ${want.toFixed(4)} (duration ${b.duration.toFixed(4)}, last sink end ${b.lastSinkEnd}, pad ${b.pad}) — the ONE settle law does not hold`);
    if (!expectExtended && Math.abs(b.settleAt - legacy) > 1e-3) fail(`${tag}: the settle deadline moved for a normal-speed pot: settleAt ${b.settleAt.toFixed(4)} vs duration + pad ${legacy.toFixed(4)} (last sink end ${b.lastSinkEnd})`);
    if (expectExtended && !(b.settleAt > legacy + 0.05)) fail(`${tag}: the slow final-event pot did NOT extend the settle deadline: settleAt ${b.settleAt.toFixed(4)} vs duration + pad ${legacy.toFixed(4)} (last sink end ${b.lastSinkEnd})`);
    console.log(`[${tag}] settle budget: duration ${b.duration.toFixed(4)} + pad ${b.pad} = ${legacy.toFixed(4)}; last sink end ${b.lastSinkEnd?.toFixed?.(4)}; completion ${completion.toFixed(4)}; settleAt ${b.settleAt.toFixed(4)}${expectExtended ? ' (EXTENDED by the pivot\'s own end)' : ' (unchanged)'}`);
    return b;
  };
  const judgeCorner = (tag, e) => {
    if (!e) return;
    const dxz = e.fall && e.pocket ? Math.hypot(e.fall.x - e.pocket.x, e.fall.z - e.pocket.z) : NaN;
    if (!(e.fall && Math.abs(e.fall.r - 0.0889) < 1e-6 && dxz < 1e-9)) fail(`${tag}: the drop steers to a fall that is not the kernel corner cup (fall ${JSON.stringify(e.fall)} vs pocket ${JSON.stringify(e.pocket)}) — pocketVisualFalls() is not the animation's aperture`);
    if (!(Math.abs(e.overFall) <= 1e-5)) fail(`${tag}: the capture point is ${(e.overFall * 1000).toFixed(3)} mm off the fall's rim (want on it, ±10 µm)`);
    if (e.pivot !== true) fail(`${tag}: the corner pot's lip pivot was REJECTED (game.js glides over the opening): fall r ${e.fall?.r} at ${(dxz * 1000).toFixed(2)} mm from the kernel cup, capture ${(e.overFall * 1e6).toFixed(1)} µm outside the aperture's rim — the R3-SNK-9…R33 plate-datum aperture, or a gate that re-tests the kernel's own capture disc`);
    console.log(`[${tag}] corner pot lip pivot ${e.pivot ? 'BUILT' : 'REJECTED'}: fall r ${e.fall?.r} (kernel cup, Δ ${(dxz * 1000).toFixed(3)} mm), capture ${(e.overFall * 1e6).toFixed(1)} µm off the rim, glide ${e.glide?.toFixed(4)} s, tFall ${e.tFall?.toFixed(4)} s`);
  };
  // GH-1042: snooker racks strike with the SELECTED cue now, and this suite's changeGame('snooker') adopted the
  // discipline default snooker_ash. The S2p / S2m sink rows below replay lanes tuned (and node-mirrored: "the kernel
  // replay") on the kernel default pairing's 'standard' cue — S2p-slow's cue ball reaches the throat at ≈ 0.037 m/s,
  // and snooker_ash's lighter cue with its softer tip sends it ≈ 16 % slower (center ball, same stroke), so it stops
  // short of the pocket. Their subject is the sink pivot and the settle law, not the strike, so they select the cue
  // their lanes were tuned on; the discipline cue's strike is e2e-settings D2g's subject.
  {
    await ev(`__settings.changeEquipment('cue_id', 'standard', { skipConfirm: true }), true`);
    let pinned = false;
    for (let i = 0; i < 60 && !pinned; i++) {
      pinned = await ev(`(window.__test.equipment() || {}).cue_id === 'standard'`);
      if (!pinned) await sleep(200);
    }
    if (!pinned) fail('S2 sink rows: the standard cue never reached the snooker rack template (GH-1042 cue pin)');
  }
  {
    await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 1, x: POT.x, y: POT.y }, ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'reds', shooter: 1 });
    if (await shot('S2p', { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }) === 'REJECTED') fail('S2p: the 2.5 m/s pot was refused');
    const r1 = await readSink('S2p', [1]); judgeCorner('S2p', r1?.[1]); await judgeClearance('S2p', 1); await judgeSettle('S2p');
    // the FAST corner pot (≥ 4 m/s: the recompose error grows with speed)
    await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 1, x: POT.x, y: POT.y }, ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'reds', shooter: 1 });
    const stF = await shot('S2p-fast', { v0: 4.5, phi: SPHI, theta: 0, a: 0, b: 0 });
    if (stF === 'REJECTED') fail('S2p-fast: the 4.5 m/s pot was refused');
    const r2 = await readSink('S2p-fast', [1]); judgeCorner('S2p-fast', r2?.[1]); await judgeClearance('S2p-fast', 1); await judgeSettle('S2p-fast');
    // the slow pot with the cue-ball scratch (two captures in one pocket)
    await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 1, x: POT.x, y: POT.y }, ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'reds', shooter: 1 });
    await shot('S2p-scratch', { v0: 1.2, phi: SPHI, theta: 0, a: 0, b: 0 });
    if (ARM === 'seam-respot' || ARM === 'seam-mirror-red' || ARM === 'seam-respot-nudge') { await ev('__test.respotCue()'); console.log(`[S2p-scratch] PLANT ${ARM}: the owner respot applied after settle (__test.respotCue → game.respotCue, the live flow's path at flow.js:2002) — the clearance rows below must refuse at the PRE-CHECK with pocketedFlipSinceSettle [0]`); } // LAND-11/12 T2 arms
    if (ARM === 'seam-respot-nudge') { const nudged = await ev('typeof window.__test.__nudge === "function" ? (window.__test.__nudge(16, 30), "nudged") : "no __nudge"'); if (nudged === 'nudged') console.log('[S2p-scratch] PLANT seam-respot-nudge: visible ball 16 nudged 30 mm (arm-only __nudge on the instrumented copy web) — the refusal must name the unexplained id 16 → exit 2'); else fail('seam-respot-nudge needs the instrumented copy (the arm-only __nudge member is absent on this web) — a COPY arm, LAND-12 C2; NOT ARMED here'); } // LAND-12 V3(a)/C2 copy arm (exit 1 by name on a web without __nudge, never exit 2)
    const r3 = await readSink('S2p-scratch', [1, 0]); judgeCorner('S2p-scratch red', r3?.[1]); judgeCorner('S2p-scratch cue', r3?.[0]);
    await judgeClearance('S2p-scratch red', 1); await judgeClearance('S2p-scratch cue', 0); await judgeSettle('S2p-scratch');
    // ---- SNK-R37 A1: the SLOW final-event pot — the same lane at v0 0.94: the cue ball scratches at ≈ 0.037 m/s, rolls
    // ≈ 515 ms to the throat rim, tips for ≈ 164 ms and drops (tEnd ≈ 0.79 s after its capture, which is the record's last
    // event). The legacy settle at duration + 0.4 froze it at the mouth before the drop; the deadline now waits for the
    // pivot's own end. Read: the pivot BUILT with a roll, tEnd > 0.4, settleAt = capture + tEnd (> duration + 0.4), the state
    // still PLAYBACK past the legacy deadline, and the clearance row.
    await scene([{ id: 0, x: CUE.x, y: CUE.y }, { id: 1, x: POT.x, y: POT.y }, ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'reds', shooter: 1 });
    {
      const err = await ev(`__test.shoot(${JSON.stringify({ v0: 0.94, phi: SPHI, theta: 0, a: 0, b: 0 })})`);
      if (err) fail('S2p-slow: the 0.94 m/s scratch shot was refused: ' + err);
      else {
        // watch the state against the playback clock: it must remain PLAYBACK past duration + pad
        let st = 'PLAYBACK', pastLegacy = null;
        for (let i = 0; i < 400 && st === 'PLAYBACK'; i++) {
          await sleep(100);
          const o = await ev('({ s: __test.state(), b: window.__test.settleBudget ? __test.settleBudget() : null })');
          st = o.s;
          if (o.b && o.b.clock > o.b.duration + o.b.pad + 0.05 && st === 'PLAYBACK') pastLegacy = o.b.clock;
        }
        if (st === 'PLAYBACK') fail('S2p-slow: the shot never settled');
        const r4 = await readSink('S2p-slow', [0]); const e0 = r4?.[0];
        if (e0) {
          if (e0.pivot !== true || !e0.roll) fail(`S2p-slow: the slow scratch built no rolling pivot: ${JSON.stringify(e0)}`);
          if (!(e0.tEnd > 0.4)) fail(`S2p-slow: the slow pot's own end is not past the legacy pad (tEnd ${e0.tEnd})`);
          console.log(`[S2p-slow] cue scratch: capture t ${e0.t?.toFixed(4)}, roll ${e0.roll?.distMm?.toFixed(1)} mm / ${e0.roll?.tMs?.toFixed(0)} ms, tEnd ${e0.tEnd?.toFixed(3)} s; still PLAYBACK at clock ${pastLegacy?.toFixed?.(3) ?? 'n/a'} (past duration + pad)`);
          // the live observation is a 341 ms window at a 100 ms poll — informational under load; settleAt, tEnd and the final state carry the claim
          if (pastLegacy === null) console.log('[S2p-slow] note: the poll did not land inside the extended window (load); the settle budget row below is the judge');
        }
        await judgeSettle('S2p-slow', { expectExtended: true });
        await judgeClearance('S2p-slow cue', 0);
      }
    }
  }
  // ---- GH-489 #637 LAND-18 X3 (review 775r5 P2 (d)): the AIRBORNE corner capture on the REAL game.js path ----
  // The cue ball alone, 0.10 m from the capture centre on the SPHI lane, 5° elevation at 2 m/s: the ball is still in its hop (motion 5) at
  // capture, so game.js:1589 rejects the pivot by design (the bed-contact model) and the legacy glide carries the drop. game.js:1491 now
  // hands an airborne capture the PLATE DATUM as its glide target regardless of leaf freshness (the substitution a preRoll-less leaf takes);
  // before it the fresh leaf kept the kernel-identity disc and the glide put the ball 6.76 mm into the leather (the R34 class, airborne only).
  // The node mirror carries the same four rows (S2p-air10/15/25 + the flat control); THIS row is the witness on the rendered pose.
  {
    const AIR = LANE(0.10), AIR_THETA = 5 * Math.PI / 180;
    // the suite's colours-only recipe (S7): phase final_colours with the yellow on — the flow auto-nominates the lowest colour; 'colours' is not a
    // snooker phase (reds | colour_after_red | final_colours | respotted_black | over) and a null call would throw BadCall in the v1 judge (lens 18a P1)
    await scene([{ id: 0, x: AIR.x, y: AIR.y }, ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'final_colours', ballOn: 16, shooter: 1 });
    const stA = await shot('S2p-air', { v0: 2.0, phi: SPHI, theta: AIR_THETA, a: 0, b: 0 });
    if (stA === 'REJECTED') fail('S2p-air: the 5° 2 m/s cue-only stroke was refused');
    else {
      const rA = await readSink('S2p-air', [0]); const eA = rA?.[0];
      if (eA) {
        if (!(eA.fall && Math.abs(eA.fall.r - 0.0889) > 1e-6)) fail(`S2p-air: the airborne capture's fall is the kernel-identity disc (r ${eA.fall?.r}) — game.js:1491 did not substitute the plate datum for an airborne capture (motion 5)`);
        else console.log(`[S2p-air] airborne capture: pivot ${eA.pivot === true ? 'BUILT' : 'REJECTED (by design: motion 5)'}, fall r ${(eA.fall.r * 1000).toFixed(2)} mm (the plate datum, not the 88.90 mm kernel disc), glide ${eA.glide?.toFixed(4)} s, capture t ${eA.t?.toFixed(4)}`);
      }
      await judgeClearance('S2p-air cue', 0, { airborne: true });
    }
  }
  // ---- SNK-R37 B3: the loaded leaf declares pre-roll support (a cache split is visible in every run) ----
  {
    const caps = await ev('window.__test.sinkCaps ? window.__test.sinkCaps() : null');
    if (!caps) fail('B3: __test.sinkCaps() unavailable — a pre-SNK-R37 main.js (no seam)');
    else if (caps.preRoll !== true) fail(`B3: the loaded sinkpivot.js does NOT declare preRoll (${JSON.stringify(caps)}) — game.js takes the plate-steered fallback (a cache split)`);
    else console.log(`[B3] sinkpivot.js capabilities: ${JSON.stringify(caps)} — preRoll present, the identity gate takes the roll`);
  }
  // ---- S2m (SNK-R34 ruling A, consequence owned): the MIDDLE pot builds the lip pivot too, the descent gate retained ----
  // The middle render fall is the kernel's R 53.19 at the template centre (R3-SNK-10) — a verbatim copy of the kernel
  // record like the corners — so the identity condition takes it as well. The W7 adjudication had left the middle pot
  // on the gated glide because the middle visible fall THEN (r 49.61) was 3.6 mm smaller than the capture disc; that
  // premise expired at R3-SNK-10 (09-03) and the µm rejection kept the glide by accident until SNK-R34 ("W7 premise
  // expired at R3-SNK-10; revisited by R34" — not a new adjudication; the spin-preserving middle pivot stays the OPEN
  // model-extension row). Read: pivot BUILT, fall = the kernel middle cup, and the Amendment-026 DESCENT GATE still
  // applied (fall !== pocket → tFall = the first bezier station where the whole sphere fits inside fall.r − r − 2 mm,
  // > 0.35·glide). Before (a 4199f4f8 tree with only this seam grafted): pivot false, tFall 0.53–0.64·glide — the
  // report's frames show both pots before/after. Two straight-in pots on the +x-across middle cup: slow (v0 0.9) and
  // fast (v0 1.8).
  const judgeMiddle = (tag, e) => {
    if (!e) return;
    const dxz = e.fall && e.pocket ? Math.hypot(e.fall.x - e.pocket.x, e.fall.z - e.pocket.z) : NaN;
    if (!(e.fall && Math.abs(e.fall.r - 0.0531876) < 1e-6 && dxz < 1e-9 && Math.abs(e.pocket.x) < 1e-9)) fail(`${tag}: the middle pot's fall is not the kernel middle cup: fall ${JSON.stringify(e.fall)} pocket ${JSON.stringify(e.pocket)}`);
    if (e.pivot !== true) fail(`${tag}: the middle pot's lip pivot was REJECTED (capture ${(e.overFall * 1e6).toFixed(1)} µm off the rim) — the identity condition is not taking the kernel-disc fall`);
    if (!(e.tFall > 0.35 * e.glide + 1e-9)) fail(`${tag}: the middle glide lost its descent gate (tFall ${e.tFall} vs 0.35·glide ${0.35 * e.glide})`);
    console.log(`[${tag}] middle pot: pivot ${e.pivot ? 'BUILT' : 'REJECTED'}, capture ${(e.overFall * 1e6).toFixed(1)} µm off the rim, tFall ${e.tFall?.toFixed(4)} / glide ${e.glide?.toFixed(4)} s (${(e.tFall / e.glide).toFixed(3)}·glide, the descent gate ${e.tFall > 0.35 * e.glide + 1e-9 ? 'applied' : 'NOT applied'})`);
  };
  {
    const MIDC = { x: 0.9405874, y: 0 }; // the +x-across middle cup (kernel frame: x across, y along)
    for (const [tag, v0] of [['S2m-slow', 0.9], ['S2m-fast', 1.8]]) {
      await scene([{ id: 0, x: MIDC.x - 0.85, y: 0 }, { id: 1, x: MIDC.x - 0.25, y: 0 }, ...coloursAt(16, 17, 18, 19, 20, 21)], { phase: 'reds', shooter: 1 });
      const st = await shot(tag, { v0, phi: 0, theta: 0, a: 0, b: 0 });
      if (st === 'REJECTED') { fail(`${tag}: the middle pot was refused`); continue; }
      const r = await readSink(tag, [1]); judgeMiddle(tag, r?.[1]); await judgeClearance(tag, 1, { corner: false });
      // the cue ball follows the red into the middle on this lane (a scratch at ≈ 0.12 m/s): judged the same way when it has a sink entry
      const si0 = await ev('JSON.stringify(window.__test.sinkInfo ? window.__test.sinkInfo() : null)'); const e0 = si0 ? JSON.parse(si0).find((x) => x.id === 0) : null;
      if (e0) { judgeMiddle(tag + ' cue', e0); await judgeClearance(tag + ' cue', 0, { corner: false }); }
      else fail(`${tag} cue: no sink entry — the lane's premise is the cue follows (the kernel replay and every browser run of this lane scratch the cue at pocket 4); a non-scratch here is a lane change, never N/A`); // LAND-12 V3(d)
    }
  }

  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (byDesignCount) console.log(`E2E-SNOOKER UNJUDGEABLE-BY-DESIGN: ${byDesignCount} row(s) in THIS run — ${byDesignRows.join(', ')} — each explained by the seam's named inference (pocketed flip since settle) and carried by the node mirror check-sink-clearance-489.mjs for the leather classes only (${(mirror && mirror.summary) || 'not run'}); exit unchanged`);
  if (!ARM && byDesignCount > 0) unjudgeable(`un-armed run produced ${byDesignCount} by-design rows; the contract is every clearance row measurable`); // LAND-12 V3(c): the un-armed contract is ENFORCED
  if (ARM && ARM_TABLE[ARM] && /seam-/.test(ARM)) { const routed = ARM_TABLE[ARM].proof.test(ownLog.join('\n')); console.log(`[arm] ${ARM} pass predicate: banner printed, routed text ${routed ? 'PRESENT' : 'ABSENT'} (${ARM_TABLE[ARM].proof}), exit ${process.exitCode || 0}`); if (!routed) fail(`[arm] ${ARM}: the routed proof text is ABSENT — an exit code alone is never the arm's proof`); } // LAND-12 V3(e)
  if (unjudgeableCount) console.log(`E2E-SNOOKER UNJUDGEABLE: ${unjudgeableCount} row(s) refused by name without a by-design precondition or without a green mirror (exit 2) — not a pass, not a fail`);
  if (!process.exitCode) console.log('E2E-SNOOKER PASS (23 scenario blocks + S2p corner pots (2.5 / 4.5 / 1.2 + scratch + the airborne 5° 2 m/s cue-only capture, LAND-18 X3) + S2m middle pots (0.9 / 1.8) lip pivots + SNK-R36 drop clearance ≥ 0 on the scripted S2 lanes (off-axis captures: the OPEN row of §R3c.42) + SNK-R37 settle budget (ONE law: settleAt = max(duration + pad, sinkCompletionSec) — a refactor of the deadline it had; normal-speed pots keep duration + pad, the slow final-event pot settles at the end of its last drop) + the leaf preRoll capability: 22-ball rack, nomination gate + affordance + visible indicator, R7 respot chain, Sec3 R11 penalty + title-prefixed cites, decision 7, D clamp, final colours, R4(a) frame win, GH-716 S8b Sec3 R3(b) break-off alternation over four frames + the r1v shared-replay round trip out of the WIN hold, #90 S9a-d natural-flow turn-switch arms incl. the H1 incoming-red-pot guard, GH-382 V2-0..4: the wpbsa-snooker-full preset — foul-and-a-miss decision loop w/ bit-exact replace + Warning + frame award, free ball call/nomination/stroke, touching-ball chip + judged play-away + push stroke, in-hand D non-touching clearance, V2-5: the decision-1 live-default flip)');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
