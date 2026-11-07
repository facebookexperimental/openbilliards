// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-heyball.mjs — headless scripted heyball adjudication suite (GH-491,
// build 18): drives the WPA Rules of Heyball (eff. 2025-08-16) app wiring
// through the REAL settings/flow/hud/aim path — the picker boot onto the
// Chinese eight-ball table (chinese8_pro_9ft, II.3(a)) with the II.4 rack (8
// centred), the II.6(c) illegal-break and II.6(e) break-foul option
// matrices (wire decisions 18/19 — the 19 prompt rides the
// heyball_break_foul UI alias with THREE options, never the 8-ball
// break_foul row), the II.8 kitchen ball-in-hand (clamp + standing chip,
// cleared by the next judged stroke), II.10/II.12.1 open-table grouping
// with the chip swap, the II.11 no-call law (no nomination affordance,
// no armed call, call()/safety() refused), and the II.2 terminal with the
// I.12 ALTERNATE-break rack liturgy (red-proof: winner-breaks would seat
// the winner; heyball must seat the seat that did NOT break).
//
// Physics recipes are proven against the committed canonical wasm (the
// e2e-8ball / e2e-onepocket constants — the chinese8_pro_9ft playfield is the
// same 2.54 x 1.27 as the WPA 9-ft, only the jaw geometry differs):
//   - "stage-3 pot": cue (0,0), object ball at POT, phi 1.10715 pots
//     straight into the foot-right corner (kernel pocket 5); b=+0.45
//     follows the cue in (scratch);
//   - a gentle tap (v0 0.35, 0.1 m gap) contacts with no rail after.
//
//   node web/tools/e2e-heyball.mjs      (needs Chrome + node >= 22)
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports
//   (concurrent-lane collision guard; run-gate derives them from the
//   lane band per the GH-338/GH-410 layout law).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8195);     // own static server
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16395);
// declared so run-gate sizes the band claim (GH-410 law)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-HEYBALL FAIL:', msg); process.exitCode = 1; };

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [], consoleLogs = [];
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    const line = params.args.map((a) => a.value ?? a.description).join(' ');
    if (params.type === 'error') consoleErrors.push(line);
    else consoleLogs.push(line);
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const sawLog = (s) => consoleLogs.some((l) => l.includes(s));
const ev = (js) => chrome.eval(js);
// the settle poll snapshots state + judgment + banner + match in ONE page
// eval (the GH-344 / e2e-10ball df4d5134 law): a WIN's 2.6 s auto re-rack
// nulls the judgment surface and resets the match fold, and the GH-350
// banner reapers clear foul banners at 1.8 s.
let settled = null; // { state, judgment, banner, match } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 220 && settled.state === 'PLAYBACK'; i++) {
    await sleep(350);
    settled = await ev(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent,
      match: window.__rules.matchState() })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}
/** Fire a scripted shot and wait for adjudication routing. */
async function shot(tag, params) {
  const err = await ev(`__test.shoot(${JSON.stringify(params)})`);
  if (err) { fail(`${tag}: shoot rejected: ${err}`); return 'REJECTED'; }
  return settle(tag);
}
const judgment = () => ev('window.__rules.judgment()');
const match = () => ev('window.__rules.matchState()');
const player = () => ev('window.__rules.player()');
const heyChips = () => ev(
  "document.getElementById('hud-heyball')?.textContent ?? ''");

// the proven pot geometry (e2e-8ball / e2e-rules stage 3): POT into the
// foot-right corner (kernel pocket 5) from a cue at the origin
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;

/** Baseline heyball play state for scripted scenes (the heyball-v1 match
 * shape — heyball.rs HeyballMatchState); scenes override fields. */
const PLAY = {
  phase: 'open', shooter: 1, breaker: 1, groups: null,
  pendingDecision: null, result: null, foulContext: null, kitchenBih: false,
};
/** Scripted scene + match-state shaping (programmatic test seam). */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  const full = {
    ...PLAY,
    onTable: specs.filter((s) => s.id > 0).map((s) => s.id).sort((a, b) => a - b),
    ...ms,
  };
  if (!(await ev(`window.__rules.setMatchState(${JSON.stringify(full)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(full));
  }
}
// spares parked KITCHEN-side, clear of the POT/follow corridor to the
// foot-right corner (the e2e-8ball FAR convention — a foot-side park at
// x 0.5 sits inside the following cue's path and perturbs the recipes)
const FAR = [{ id: 12, x: 0.5, y: -1.0 }, { id: 10, x: -0.5, y: -1.0 }];

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- H0: picker boot — heyball racks the II.4 fifteen on chinese8_pro_9ft -
  // the discipline surface is GAME_CATALOG-driven: the playable heyball
  // entry must be a real, OFFERED discipline (not a seam-only one). Since
  // feature 034 (525 S4a-mig, spec ruling 9) the probe is API-FIRST: the
  // settings capability read (`capabilities().heyball` — the same value the
  // play card's rail follows via ob:capability), then the play card's own
  // registry when the shell is open, and `changeGame(heyball,
  // {skipConfirm}) === true` as the programmatic backstop (the GH-491
  // capability gate funnels every surface through it). POLLED (review-r10-
  // round flake): the capability settles a beat after __test.ready under
  // storm load — the one-shot read raced the boot on this box.
  let offered = false;
  for (let i = 0; i < 50 && !offered; i++) {
    offered = await ev(`(() => {
      const caps = window.__settings?.capabilities?.() ?? null;
      if (caps && caps.heyball === true) return true;
      if (window.__shell?.isOpen?.() && typeof window.__play === 'object') {
        return window.__play.registry().games.some((g) => g.id === 'heyball');
      }
      return false; })()`);
    if (!offered) await sleep(200);
  }
  if (!offered) {
    fail('H0: heyball not offered (capabilities().heyball / __play.registry())');
  }
  if (await ev('window.__settings.changeGame("heyball", { skipConfirm: true })', true) !== true) {
    throw new Error('changeGame(heyball) failed — rules/games modules missing or the capability backstop refused?');
  }
  // #747: poll (50 x 200 ms) instead of a fixed 500 ms sleep — under box load the rules module loads late
  let live = false;
  for (let i = 0; i < 50 && !live; i++) {
    live = await ev("window.__rules?.game?.() === 'heyball' && window.__rules?.ready?.() === true");
    if (!live) await sleep(200);
  }
  if (!live) {
    if (await ev('window.__rules.game()') !== 'heyball') fail('H0: active game not heyball');
    if (await ev('window.__rules.ready()') !== true) fail('H0: rules registry not live');
  }
  // the per-game equipment pairing adopts the entry's ONLY class table
  // (II.3(a) — the Chinese eight-ball table; GH-491 defaultEquipmentFor)
  const eq = await ev('__test.equipment()');
  if (eq?.table_id !== 'chinese8_pro_9ft') {
    fail('H0: heyball must rack on chinese8_pro_9ft (got '
      + JSON.stringify(eq) + ')');
  }
  // review r3 P1: the FR-015 Joy Q8 pairing is napped wool (research.md:
  // manufacturer ships Strachan; snooker_napped is the nearest cited
  // napped parameter set) — the pool-family fall-through must not leave
  // the worsted pool cloth under a heyball default rack
  if (eq?.cloth_id !== 'snooker_napped') {
    fail('H0: heyball default cloth must be snooker_napped (got '
      + JSON.stringify(eq?.cloth_id) + ')');
  }
  const rack = (await ev('__test.balls()')).filter((b) => b.id !== 0);
  if (rack.length !== 15) fail(`H0: expected 15 object balls, got ${rack.length}`);
  { // geometric II.4 pin on the live rack (three-frame: x=kernel y, z=kernel x):
    // the 8 sits on the row-3 CENTER slot of the foot-spot lattice
    const rows = new Map();
    for (const b of rack) {
      const k = Math.round((b.pos[0] - 0.635) / 0.04949);
      rows.set(k, [...(rows.get(k) ?? []), b]);
    }
    const centerRow = (rows.get(2) ?? []).sort((a, b) => a.pos[2] - b.pos[2]);
    if (centerRow[1]?.id !== 8) {
      fail(`H0: 8 not on the row-3 center slot (WPA Heyball II.4), got ${centerRow[1]?.id}`);
    }
    // II.4: one solid + one stripe on the base corners
    const rear = (rows.get(4) ?? []).sort((a, b) => a.pos[2] - b.pos[2]);
    const corners = [rear[0]?.id, rear[4]?.id];
    if (corners.filter((id) => id >= 1 && id <= 7).length !== 1
      || corners.filter((id) => id >= 9 && id <= 15).length !== 1) {
      fail(`H0: base corners ${corners} are not one solid + one stripe (II.4)`);
    }
  }
  const m0 = await match();
  if (m0?.phase !== 'break' || m0?.groups !== null || m0?.kitchenBih !== false) {
    fail('H0: fresh match state wrong: ' + JSON.stringify(m0));
  }
  // II.6(b): the break addresses from in hand BEHIND the head string —
  // the GH-370 opening grant (kitchen right, strictly above the line)
  {
    let s0 = null;
    for (let i = 0; i < 25 && s0 !== 'BALL_IN_HAND'; i++) {
      s0 = await ev('__test.state()');
      if (s0 !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s0 !== 'BALL_IN_HAND') fail('H0: fresh rack did not grant the opening BALL_IN_HAND');
    if (await ev('window.__rules.placementRight()') !== 'kitchen') {
      fail('H0: opening placement right not kitchen (WPA Heyball II.6(b))');
    }
    const cue0 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (!(cue0[0] <= -0.635 - 1e-6 + 1e-12)) {
      fail(`H0: opening address sits ON/below the head string (kernel y = ${cue0[0]})`);
    }
  }
  // the HUD panel title tracks the catalog display key
  if (await ev('document.querySelector("#hud h1").textContent') !== 'Heyball') {
    fail('H0: HUD title did not re-key to game.heyball');
  }

  // ---- H1 [II.6(c)]: illegal break — three-way option, NO ball in hand ------
  // gentle tap: contact, nothing to a cushion, nothing pocketed
  await scene([{ id: 0, x: 0, y: -0.3 }, { id: 1, x: 0, y: -0.2 }, ...FAR,
    { id: 8, x: -0.5, y: -0.9 }], { phase: 'break', shooter: 1, breaker: 1 });
  if (await shot('H1', { v0: 0.35, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('H1: illegal break did not park in AIM for the decision');
  }
  let j = await judgment();
  let m = await match();
  if (j?.fouls?.[0]?.code !== 'illegal-break'
    || j?.fouls?.[0]?.cite !== 'WPA Heyball II.6(c)') {
    fail('H1: expected the cited illegal-break report: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'none') fail('H1: an illegal break is NEVER ball in hand (II.6(c))');
  if (m?.pendingDecision?.kind !== 'illegal_break' || m?.pendingDecision?.chooser !== 2) {
    fail('H1: expected the illegal_break option for the opponent: '
      + JSON.stringify(m?.pendingDecision));
  }
  if (!sawLog('[flow] decisionRequired {"kind":"illegal_break"')) {
    fail('H1: decisionRequired hook not printed');
  }
  const rej1 = await ev('__test.shoot({v0:1.5,phi:1.0,theta:0,a:0,b:0})');
  if (!rej1) fail('H1: shooting through the pending decision was not refused');
  // the prompt panel: the illegal_break title (II.6(c) cite) + 3 options
  await sleep(400); // aim.js re-drives on the frame hook
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('H1: illegal-break decision panel not shown');
  }
  // the cite rides the chooser row (decision.cite.*; GH-668 S5 slice 3 G6)
  const t1 = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!t1.includes('II.6(c)')) fail('H1: decision cite row lacks the II.6(c) cite: ' + t1);
  if (await ev('document.querySelectorAll("#hud-decision .hd-btns button").length') !== 3) {
    fail('H1: illegal_break must offer THREE options (II.6(c))');
  }
  // choice 1: accept the table — the chooser plays AS IT LIES (no BIH)
  if (await ev('window.__rules.decide(1)') !== true) fail('H1: decide(1) rejected');
  if (!sawLog('[flow] decisionMade {"kind":"illegal_break","choice":1')) {
    fail('H1: decisionMade hook not printed');
  }
  if (await player() !== 2) fail('H1: accept must seat the chooser');
  if (await ev('__test.state()') !== 'AIM') {
    fail('H1: accept-the-table must park in AIM — II.6(c) grants NO ball in hand');
  }
  if (await ev('window.__rules.placementRight()') === 'kitchen') {
    fail('H1: accept-the-table must not arm a kitchen placement right');
  }
  if ((await match())?.pendingDecision !== null) fail('H1: decision did not clear');

  // ---- H2 [II.6(e)/II.8]: break foul — kitchen BIH + the standing chip ------
  // proven break-scratch recipe: pot + follow the cue in
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y },
    { id: 2, x: 0, y: 0.5 }, { id: 8, x: -0.5, y: -0.9 }, ...FAR],
  { phase: 'break', shooter: 1, breaker: 1 });
  if (await shot('H2', { v0: 3.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'AIM') {
    fail('H2: break scratch did not park in AIM for the decision');
  }
  j = await judgment();
  m = await match();
  if (!j?.fouls?.some((f) => f.code === 'scratch'
    && f.cite === 'WPA Heyball II.17(a) via II.6(e)')) {
    fail('H2: expected the cited break-route scratch: ' + JSON.stringify(j?.fouls));
  }
  if (m?.pendingDecision?.kind !== 'break_foul' || m?.pendingDecision?.chooser !== 2) {
    fail('H2: expected the break_foul option for the opponent: '
      + JSON.stringify(m?.pendingDecision));
  }
  // the prompt rides the heyball_break_foul UI ALIAS: the II.6(e) title +
  // THREE options (red-proof: the 8-ball break_foul row offers two and
  // cites 4.3(g),(h))
  await sleep(400);
  const t2 = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!t2.includes('II.6(e)')) fail('H2: decision cite row lacks the II.6(e) cite: ' + t2);
  if (await ev('document.querySelectorAll("#hud-decision .hd-btns button").length') !== 3) {
    fail('H2: heyball break_foul must offer THREE options (II.6(e))');
  }
  // choice 1: ball in hand BEHIND THE HEAD STRING as it lies (arms II.8)
  if (await ev('window.__rules.decide(1)') !== true) fail('H2: decide(1) rejected');
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('H2: kitchen BIH state not entered');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') {
    fail('H2: placement right not kitchen (II.6(e))');
  }
  m = await match();
  if (m?.kitchenBih !== true) fail('H2: the II.8 kitchenBih restriction must be armed: ' + JSON.stringify(m));
  // kitchen means kitchen: an over-line request clamps strictly behind
  if (!(await ev('__test.placeCue(0.2, 0.9)'))) fail('H2: kitchen placement call failed');
  const cue2 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  if (!(cue2[0] <= -0.635 - 1e-6 + 1e-12 && cue2[0] > -0.65)) {
    fail(`H2: kitchen placement did not clamp strictly behind the head string (kernel y = ${cue2[0]})`);
  }
  // the standing II.8 referee chip is visible on the heyball strip
  await sleep(400);
  let chips2 = await heyChips();
  if (!chips2.includes('behind the head string')) {
    fail('H2: kitchenBih chip not visible on #hud-heyball: ' + chips2);
  }
  // take the stroke (a legal kitchen escape: cross the line, drive the 2
  // to the foot cushion) — the II.8 restriction covers exactly one stroke
  if (!(await ev('__test.placeCue(0, -0.8)'))) fail('H2: legal kitchen placement refused');
  if (await shot('H2b', { v0: 5, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }) === 'REJECTED') {
    fail('H2b: the kitchen stroke was refused');
  }
  j = await judgment();
  if (!j?.legal) fail('H2b: the kitchen escape must judge legal: ' + JSON.stringify(j?.fouls));
  m = await match();
  if (m?.kitchenBih !== false) fail('H2b: kitchenBih must clear after the judged stroke');
  await sleep(400);
  chips2 = await heyChips();
  if (chips2.includes('behind the head string')) {
    fail('H2b: kitchenBih chip did not clear: ' + chips2);
  }

  // ---- H3 [II.10/II.12.1]: open table — chip, frozen announce, grouping -----
  // derive the live table dims + ball radius from the LAST submitted
  // scenario (the kernel's own truth — no hardcoded joy_q8 numbers)
  const dims = await ev(`(() => {
    const s = JSON.parse(__test.scenarios().at(-1));
    return { w: s.system.table.width, l: s.system.table.length,
      r: s.system.balls[0].params.r };
  })()`);
  if (!(dims?.w > 1 && dims?.r > 0.02)) fail('H3: scenario dims probe failed: ' + JSON.stringify(dims));
  const frozenX = dims.w / 2 - dims.r; // ball 5 frozen to the right cushion
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 2, x: -0.5, y: -1.0 }, { id: 9, x: 0.5, y: -1.0 },
    { id: 5, x: frozenX, y: -0.4 }, { id: 8, x: -0.5, y: 0.9 }],
  { phase: 'open', shooter: 1, breaker: 1 });
  await sleep(400);
  let chips3 = await heyChips();
  if (!chips3.includes('open table')) {
    fail('H3: openTable chip not visible while open: ' + chips3);
  }
  // the I.5/II.15.2 frozen-ball announce (display-only): ball 5 is legal
  // for the shooter while open and sits a radius off the right cushion
  if (!chips3.includes('frozen')) {
    fail('H3: frozen-ball announce chip missing (ball 5 frozen): ' + chips3);
  }
  // the no-call aim line names the open-table law
  const state3 = await ev('document.getElementById("state").textContent');
  if (!state3.includes('pot any ball except the 8')) {
    fail('H3: open-table aim hint missing: ' + state3);
  }
  // pot the solid 3 legally — first contact 3, pot of the contact group
  if (await shot('H3', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('H3: open-table pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || !j?.pocketed?.includes(3)) fail('H3: judgment wrong: ' + JSON.stringify(j));
  if (j?.turn !== 'continue') fail('H3: a legal claiming pot must continue (II.10.1)');
  if (m?.phase !== 'grouped' || m?.groups?.[1] !== 'solids' || m?.groups?.[2] !== 'stripes') {
    fail('H3: groups not fixed by the first-contact-group pot (II.12.1): '
      + JSON.stringify({ phase: m?.phase, groups: m?.groups }));
  }
  if (!sawLog('[flow] groupsAssigned {"groups":{"1":"solids","2":"stripes"}}')) {
    fail('H3: groupsAssigned hook not printed');
  }
  if (await player() !== 1) fail('H3: shooter changed after the claiming pot');
  // chip swap: openTable gone, the 8-ball group grammar takes the strip
  await sleep(400);
  chips3 = await heyChips();
  if (chips3.includes('open table')) fail('H3: openTable chip did not clear: ' + chips3);
  if (!chips3.includes('P1 · solids') || !chips3.includes('P2 · stripes')) {
    fail('H3: group chips missing after assignment: ' + chips3);
  }
  // the grouped aim line names the group + the no-call law
  const state3b = await ev('document.getElementById("state").textContent');
  if (!state3b.includes('clear your group, then the 8')) {
    fail('H3: grouped aim hint missing: ' + state3b);
  }

  // ---- H4 [II.11]: the no-call law — NO nomination surface exists -----------
  if (await ev('window.__rules.calledShot()') !== null) {
    fail('H4: a call is armed for heyball');
  }
  if (await ev('window.__rules.call(2, 5)') !== false) {
    fail('H4: __rules.call() must refuse for heyball (II.11)');
  }
  if (await ev('window.__rules.safety()') !== false) {
    fail('H4: __rules.safety() must refuse for heyball (II.11)');
  }
  if (await ev('window.__aim.call()') !== null) {
    fail('H4: aim composed a shot call for heyball');
  }
  if (await ev('window.__aim.nominationRequired()') !== false) {
    fail('H4: the nomination affordance is armed for heyball');
  }
  { // no pocket marks, no target rings, no #hud-call chip — nothing to call
    const marks = await ev('window.__aim.pocketMarks()');
    if (marks.length && marks.some((x) => x.visible)) {
      fail('H4: pocket marks live for heyball: ' + JSON.stringify(marks[0]));
    }
    if (await ev('document.getElementById("hud-call").classList.contains("on")') !== false) {
      fail('H4: the call indicator chip surfaced for heyball');
    }
  }
  // an uncalled stroke fires freely (the H3 pot already proved it; this
  // pins the gate for the GROUPED phase too — no call.required hint)
  const rej4 = await ev('__test.shoot({v0:0.9,phi:' + PHI + ',theta:0,a:0,b:0})');
  if (rej4) fail('H4: an uncalled grouped stroke was refused: ' + rej4);
  await settle('H4');

  // ---- H5 [II.2 + I.12]: the 8 wins — and the NEXT rack ALTERNATES breaks ---
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y },
    { id: 12, x: 0.5, y: -1.0 }, { id: 10, x: -0.5, y: -1.0 }],
  {
    phase: 'grouped', shooter: 1, breaker: 1,
    groups: { 1: 'solids', 2: 'stripes' },
  });
  // on the 8 (no solid remains): the aim line names the any-pocket law
  await sleep(400);
  const state5 = await ev('document.getElementById("state").textContent');
  if (!state5.includes('any pocket wins')) {
    fail('H5: on-the-8 aim hint missing: ' + state5);
  }
  if (await shot('H5', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('H5: the legal 8 did not end the rack');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'eight-ball-pocketed'
    || j?.terminal?.cite !== 'WPA Heyball II.2') {
    fail('H5: expected the cited II.2 win: ' + JSON.stringify(j?.terminal));
  }
  if (!sawLog('[flow] gameWon') || !sawLog('"reason":"eight-ball-pocketed"')) {
    fail('H5: gameWon hook/reason not printed');
  }
  const banner5 = settled.banner; // atomic with the WIN edge
  if (!banner5.includes('PLAYER 1 WINS') || !banner5.includes('II.2')) {
    fail('H5: win banner must carry the winner and the II.2 cite: ' + banner5);
  }
  await sleep(3200); // WIN auto re-racks after the banner (2.6 s)
  {
    let s5 = null;
    for (let i = 0; i < 25 && s5 !== 'BALL_IN_HAND'; i++) {
      s5 = await ev('__test.state()');
      if (s5 !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s5 !== 'BALL_IN_HAND') fail('H5: WIN auto re-rack did not grant the opening BALL_IN_HAND');
  }
  m = await match();
  // I.12 red-proof: P1 broke AND won the decided rack — winner-breaks
  // would seat P1 again; heyball must hand the break to P2
  if (m?.phase !== 'break' || m?.breaker !== 2 || await player() !== 2) {
    fail('H5: breaks must ALTERNATE between racks (WPA Heyball I.12): '
      + JSON.stringify({ phase: m?.phase, breaker: m?.breaker }));
  }
  if ((await ev('__test.balls()')).length !== 16) fail('H5: re-rack ball count wrong');

  // ---- hook-wire audit + error gates ------------------------------------------
  for (const hook of ['decisionRequired', 'decisionMade', 'groupsAssigned',
    'foulCalled', 'gameWon', 'playerChanged']) {
    if (!sawLog(`[flow] ${hook}`)) fail(`hook wire: [flow] ${hook} never printed`);
  }
  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-HEYBALL PASS (H0 picker boot/joy-table/II.4 rack + H1 illegal-break no-BIH option + H2 break-foul kitchen BIH/II.8 chip lifecycle + H3 open-table grouping/frozen announce + H4 no-call law + H5 II.2 terminal/I.12 alternate break + hook wire)');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
