// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-playground.mjs — mode system + playground sandbox gate (issue #68).
// Drives the settings mode selector and the window.__playground seam
// end-to-end on a self-served web/:
//
//   arms:
//   0. hermetic default: a virgin profile boots into mode 'play' with the
//      mode chip strip absent and ZERO localStorage writes at boot.
//   1. selector: the settings GAME section leads with the 3-radio mode
//      selector (Play checked, per-mode blocks toggled by [hidden], the
//      #66 drills row living under Practice); switching to Playground
//      keeps the CURRENT table (no re-rack — the play->playground
//      transition semantics), shows the chip strip (Re-rack/Clear/Undo)
//      and nulls the matchState projection.
//  1b. one re-rack affordance (review F2): the HUD #rerack button hides
//      while the sandbox is live — the chip strip owns sandbox actions
//      (chip = same-seed re-rack; HUD button = seed+1 new rack).
//   2. persistence: reload restores mode 'playground' (blob round-trip);
//      the chip strip paints from the boot broadcast (2b: the HUD
//      Re-rack stays hidden from the same boot broadcast).
//   3. placement exactness: __playground.placeBall lands a ball at the
//      EXACT kernel coordinates (byte-compare via __test.balls).
//   4. overlap nudge: a drop onto another ball's center lands at contact
//      distance (>= 2r, <= 2r + 1 mm) — never a silent fail, never an
//      overlapped park (every pair >= 2r - 1e-6, the #44 law).
//   5. desktop drag: a REAL mouse drag (CDP Input) on an object ball in
//      AIM moves it (placement claims the press; phi never steers).
//  5b. shift stays fine aim (review F4): a SHIFT press within 3R of a
//      ball never grabs — the #46 precision family keeps its semantics
//      inside the sandbox (ball unmoved after a real shift-drag).
//   6. no-judgment invariant: a scripted 9-pot + a scripted scratch settle
//      with ZERO foulCalled/gameWon/playerChanged mirrors, the machine
//      back in AIM, the banner hidden, the player seat unchanged; the
//      potted 9 STAYS pocketed; the scratched cue respots (soft-lock
//      guard).
//   7. undo: single-slot undo restores the last placement exactly.
//  7b. grab-abort (review F3): a drag that ends WITHOUT a successful
//      placement must not feed a later undo — undo restores the TRUE
//      prior position, the slot drains (never re-polluted with the
//      aborted drag's origin), and a second undo refuses (no redo).
//  7c. endDrag seam: a disarmed grab never commits into the undo slot.
//  7d. #140 snap toggle: the playground chips row carries #ob-mode-snap
//      (aria-pressed=false by default); clicking flips the pressed state,
//      the __playground.snapEnabled() seam truth AND the persisted raw
//      blob key (snapGrid).
//  7e. #140 snap math red/green: with snap OFF an off-lattice placeBall
//      lands EXACTLY at the request (the arm-3 law); with snap ON the SAME
//      request lands EXACTLY on the nearest half-diamond lattice node
//      (16x8 cells of 0.5 diamond — expected coords computed test-side
//      from the live pitch); an occupied node still nudges (arm-4 law).
//  7f. #140 transient guides: a REAL mouse drag with snap ON paints the
//      scene overlay mid-drag (__aim.snapOverlay() visible, crosshair
//      pinned on-lattice, cloth-aware ink) and the ball lands on-lattice;
//      after release the overlay is GONE and the guide is null.
//  7g. #140 persistence: reload restores snapGrid=true (seam + raw blob +
//      chip pressed from the boot broadcast).
//  7h. #140 undo exactness (review fix): with snap ON and an OFF-lattice
//      pick-up origin (rerack, drag a rack ball — the drop itself snaps),
//      undo restores the TRUE origin EXACTLY (|Δ| < 1e-9) — the restore
//      rides pgPlaceBall's internal exact-placement escape, never the
//      lattice; then snap back OFF so the later arms keep the
//      exact-placement default.
//  7i. GH-994: a game switch (changeGame) and an equipment change
//      (changeEquipment table_id) under the sandbox re-rack AND empty the
//      single-slot undo — slot null, #ob-mode-undo disabled, undo()
//      refuses, no ball moves (pre-fix the chip stayed live and pulled a
//      ball of the fresh rack to the old table's coordinates).
//  5c. GH-152 tap-to-aim (desktop): a sub-CLICK_MAX_PX click on an object
//      ball AIMS at it (phi = cue→ball azimuth, ball BIT-unmoved, lift
//      never latched); a cue click stays a strict no-op (recorded — the
//      #46 first-ball routing makes aiming at the cue meaningless);
//      drags keep the arm-5 placement law byte-intact.
//   8. playground -> play: fresh rack (all balls up), judgment live again
//      (matchState non-null), chip strip gone, HUD Re-rack restored.
//   9. practice pane (GH-151 re-target): selecting Practice from play
//      shows the pane in the STILL-OPEN shell — the pre-GH-135 picker
//      auto-open is retired; the BROWSE button owns the sequential
//      close-then-open hand-off into the picker.
//  9b. mode <-> drill agreement (review F1): with a LIVE drill, switching
//      practice -> play stops it — drill chrome gone, evaluator dead,
//      mode=play persisted (raw blob).
//  9c. inverse pin (review F1): __drills.start from play mode PINS the
//      selector to practice (mode and drill layer never disagree).
//  9d. playground -> practice auto-close (GH-151 re-target of the #121
//      race arm): the Practice radio from PLAYGROUND runs ONLY the
//      GH-121 re-racking auto-close now — no picker opens, zero residual
//      backdrops, and dialog.js's own restore lands focus back on the
//      gear once the exit motion settles.
//  11. share fidelity (#68 codec v6): a playground session — drag-committed
//      object-ball move, direct seam move, move + single-slot undo (the
//      restore is one more committed event), a cue move through the free
//      primitive, two free shots — encodes with the moves axis in commit
//      order + mode 'playground'; reloading the #r= link on a PLAY-mode
//      viewer profile replays with judgment suppressed exactly like the
//      sender (playgroundSettle mirrors, zero foulCalled/gameWon/
//      playerChanged, matchState null), records byte-match, and the
//      replayed table matches the recorded one BALL-FOR-BALL. An in-app
//      HUD Replay after a committed post-settle placement RESTORES the
//      committed landing on re-settle (the playback rewrites meshes from
//      the last shot's sampler; no phantom event, no extra logged shot).
//  10. touch S3 generalization: on a phone boot, a one-finger drag on an
//      OBJECT ball in AIM classifies S3 (ghost ring up) and moves the
//      ball — the 014 grammar generalized per ball in playground.
// 10t. GH-152 tap-to-aim (touch): a sub-slop TAP on an object ball aims
//      at it (play-mode parity, ball BIT-unmoved, classifier drained);
//      the cue keeps its no-op claim in third person.
// 10b. #140 coarse snap leg: same phone boot, setSnap(true) — a one-finger
//      drag lands the ball ON the lattice with the ghost ring still up and
//      the guides gone after touchEnd.
//
//   node web/tools/e2e-playground.mjs [--port 8221]  (needs Chrome + node>=22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import {
  drag as touchDrag, setPhoneMetrics, tap, touchEnd, touchMove, touchStart,
} from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// committed dist SDK (the same build the app consumes) for node-side decode
// of the arm-11 share link (the e2e-share.mjs precedent)
const { decodeShare } = await import(
  path.join(webDir, 'dist', 'pool-sdk', 'share.js'));
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// suite-unique verified-free ports (parallel-worktree law)
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8221);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16321);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const APP_URL = `http://127.0.0.1:${PORT}/app.html?seed=1`;
const fail = (msg) => { console.error('E2E-PLAYGROUND FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-playground] PASS', name);
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const consoleLogs = [];
const chrome = await launchChrome(APP_URL, { port: CDP });
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

const READY_TRIES = Number(process.env.OB_E2E_READY_TRIES ?? 200);
async function waitReady(what = 'app') {
  for (let i = 0; i < READY_TRIES; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error(`${what} never became ready`);
}
async function pollFor(expr, tries = 75) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
/** Kernel (x, y) of ball `id` from the render surface (coords.js basis:
 * three.x = kernel y, three.z = kernel x). */
const kposExpr = (id) => `(() => {
  const b = window.__test.balls().find((x) => x.id === ${id});
  return b ? { x: b.pos[2], y: b.pos[0], pocketed: b.pocketed } : null;
})()`;
const mouse = (type, x, y, modifiers = 0) => chrome.send(
  'Input.dispatchMouseEvent',
  { type, x, y, modifiers, button: 'left',
    buttons: type === 'mouseMoved' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
const SHIFT = 8; // CDP Input modifiers bitmask: Alt=1 Ctrl=2 Meta=4 Shift=8
/** True when the element exists, is not [hidden] and has layout. */
const visExpr = (id) => `(() => {
  const el = document.getElementById('${id}');
  return !!el && !el.hidden && el.getClientRects().length > 0;
})()`;

try {
  await waitReady();
  await pollFor(`typeof window.__playground?.placeBall === 'function'`);
  await pollFor(`!!document.getElementById('ob-settings')`);

  // ---- 0. hermetic default --------------------------------------------------
  const virgin = await chrome.eval(`({
    mode: window.__settings.get().mode,
    blob: localStorage.getItem('ob-settings-v1'),
    chips: document.getElementById('ob-mode-chips')?.classList.contains('on'),
  })`);
  check('0: virgin profile boots into play mode, zero boot writes, no chips',
    virgin.mode === 'play' && virgin.blob === null && virgin.chips === false,
    JSON.stringify(virgin));

  // ---- 1. mode entry + play->playground keeps the table ----------------------
  // Feature 034 (525 S4a-mig) re-cut: the issue-#68 mode selector left the
  // settings modal with the game pane; the sandbox is entered through
  // 036a's practice card (`[data-ob="practice-playground"]` — the place
  // action EXITS to the table by design, 036 FR-007) or the changeMode API.
  // The HUD chip strip + Re-rack/Clear/Undo buttons are unchanged. The
  // shell exists on a scripted boot ONLY under the reserved `obshell=1`
  // opt-in (shell.md §4) — hop this page onto it once (same origin, same
  // profile; the boot pose opens the shell at play).
  await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1` });
  for (let i = 0; i < 300; i++) {
    let ok = false;
    try { ok = await chrome.eval('window.__test?.ready === true'); } catch { /* navigating */ }
    if (ok) break;
    await sleep(200);
  }
  await pollFor(`window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'`);
  await chrome.eval(`window.__shell.go('practice'); true`);
  const mounted1 = await pollFor(`typeof window.__practice === 'object'
    && document.getElementById('ob-practice')?.hidden === false
    && !!document.querySelector('[data-ob="practice-playground"]')`, 150);
  const sel = await chrome.eval(`({
    mode: window.__settings.get().mode,
    place: window.__shell.place(),
    pgCard: !!document.querySelector('[data-ob="practice-playground"]'),
    backHidden: document.querySelector('[data-ob="play-back"]')?.hidden ?? null })`);
  check('1: the practice card renders the sandbox entry (mode play, play-back hidden)',
    mounted1 && sel.mode === 'play' && sel.place === 'practice' && sel.pgCard
      && sel.backHidden === true, JSON.stringify(sel));

  // move a ball first so "keeps the table" is observable, then switch
  const preSwitch = await chrome.eval(kposExpr(1));
  await chrome.eval(`document.querySelector('[data-ob="practice-playground"] button').click(); true`);
  await pollFor(`window.__settings.get().mode === 'playground'`);
  await pollFor(`window.__shell.isOpen() === false`);
  const sw = await chrome.eval(`({
    mode: window.__settings.get().mode,
    shellOpen: window.__shell.isOpen(),
    ball1: ${kposExpr(1)},
    match: window.__rules.matchState(),
    chips: document.getElementById('ob-mode-chips').classList.contains('on'),
    btns: ['ob-mode-rerack', 'ob-mode-clear', 'ob-mode-undo']
      .map((id) => !!document.getElementById(id)),
  })`);
  check('1: playground entered via the practice card — shell exits to the table, '
    + 'table KEPT, matchState null, chip strip live (Re-rack/Clear/Undo)',
  sw.mode === 'playground' && sw.shellOpen === false
    && Math.abs(sw.ball1.x - preSwitch.x) < 1e-12
    && Math.abs(sw.ball1.y - preSwitch.y) < 1e-12
    && sw.match === null && sw.chips && sw.btns.every(Boolean),
  JSON.stringify(sw));

  // ---- 1b. exactly ONE re-rack affordance in playground (review F2) ----------
  // The chip strip owns sandbox actions: the HUD #rerack button (seed+1
  // NEW rack) hides while the sandbox is live; the chip (SAME-seed rack)
  // is the one visible re-rack surface. (Since feature 034 the settings
  // modal carries NO playground copy at all — the former #ob-pg-rerack
  // discoverability copy left with the game pane — so the assertion is
  // now trivially the whole story: chip up, HUD button hidden.)
  const one = await chrome.eval(`({
    hud: ${visExpr('rerack')},
    hudHidden: document.getElementById('rerack')?.hidden === true,
    chip: ${visExpr('ob-mode-rerack')},
  })`);
  check('1b: playground shows exactly ONE re-rack affordance (chip up, '
    + 'HUD button hidden)',
  one.chip && !one.hud && one.hudHidden, JSON.stringify(one));

  // ---- 2. persistence round-trip ---------------------------------------------
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=persist` });
  await waitReady('persist arm');
  await pollFor(`typeof window.__playground?.placeBall === 'function'`);
  const persisted = await chrome.eval(`({
    mode: window.__settings.get().mode,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).mode,
  })`);
  check('2: mode survives reload (resolved + raw blob)',
    persisted.mode === 'playground' && persisted.raw === 'playground',
    JSON.stringify(persisted));
  const chipsBoot = await pollFor(
    `document.getElementById('ob-mode-chips')?.classList.contains('on')`);
  check('2: chip strip paints from the boot broadcast', chipsBoot);
  check('2b: HUD Re-rack hidden from the same boot broadcast (F2)',
    await chrome.eval(`!${visExpr('rerack')}`));

  // ---- 3. placement exactness -------------------------------------------------
  const placed = await chrome.eval(`(() => {
    const ok = window.__playground.placeBall(5, 0.31, 0.22);
    const p = ${kposExpr(5)};
    return { ok, p };
  })()`);
  check('3: placeBall lands at exact kernel coordinates',
    placed.ok === true && Math.abs(placed.p.x - 0.31) < 1e-12
      && Math.abs(placed.p.y - 0.22) < 1e-12, JSON.stringify(placed));

  // ---- 4. overlap nudge ---------------------------------------------------------
  const nudged = await chrome.eval(`(() => {
    const r = window.__drills?.ballR
      ? window.__drills.ballR()
      : 0.028575;
    const nine = ${kposExpr(9)};
    const ok = window.__playground.placeBall(5, nine.x, nine.y);
    const five = ${kposExpr(5)};
    const d = Math.hypot(five.x - nine.x, five.y - nine.y);
    // no pair may overlap after the drop (the #44 >1µm law)
    const balls = window.__test.balls().filter((b) => !b.pocketed);
    let minPair = Infinity;
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        minPair = Math.min(minPair, Math.hypot(
          balls[i].pos[0] - balls[j].pos[0],
          balls[i].pos[2] - balls[j].pos[2]));
      }
    }
    return { ok, d, r, minPair };
  })()`);
  check('4: drop onto overlap nudges to the nearest legal spot (contact '
    + 'ring, no pair overlapped)',
  nudged.ok === true && nudged.d >= 2 * nudged.r - 1e-9
    && nudged.d <= 2 * nudged.r + 1e-3
    && nudged.minPair >= 2 * nudged.r - 1e-6, JSON.stringify(nudged));

  // ---- 5. desktop drag (REAL mouse) --------------------------------------------
  const dragProbe = await chrome.eval(`({
    s: window.__aim.ballScreen(3), phi: window.__aim.getPhi(),
    from: ${kposExpr(3)} })`);
  check('5: ballScreen probe live', !!dragProbe.s, JSON.stringify(dragProbe));
  if (dragProbe.s) {
    await mouse('mousePressed', dragProbe.s.x, dragProbe.s.y);
    for (let i = 1; i <= 12; i++) {
      await mouse('mouseMoved',
        dragProbe.s.x + i * 8, dragProbe.s.y + i * 4);
      await sleep(16);
    }
    await mouse('mouseReleased', dragProbe.s.x + 96, dragProbe.s.y + 48);
    await sleep(200);
    const dragged = await chrome.eval(`({
      to: ${kposExpr(3)}, phi: window.__aim.getPhi(),
      state: window.__test.state() })`);
    const moved = Math.hypot(dragged.to.x - dragProbe.from.x,
      dragged.to.y - dragProbe.from.y);
    check('5: mouse drag moves the OBJECT ball in AIM (placement claims '
      + 'the press — phi untouched)',
    moved > 0.05 && Math.abs(dragged.phi - dragProbe.phi) < 1e-9
      && dragged.state === 'AIM',
    JSON.stringify({ moved, ...dragged }));
  }

  // ---- 5b. SHIFT press never grabs (review F4) --------------------------------
  // The #46 fine-aim family keeps its semantics inside the sandbox: a
  // shift-drag starting within 3R of a ball steers phi at 0.1x — it never
  // latches placement, so the ball must not move a nanometer.
  const fineProbe = await chrome.eval(`({
    s: window.__aim.ballScreen(3), phi: window.__aim.getPhi(),
    from: ${kposExpr(3)} })`);
  check('5b: shift-arm ball probe live', !!fineProbe.s,
    JSON.stringify(fineProbe));
  if (fineProbe.s) {
    await mouse('mousePressed', fineProbe.s.x, fineProbe.s.y, SHIFT);
    for (let i = 1; i <= 12; i++) {
      await mouse('mouseMoved',
        fineProbe.s.x + i * 8, fineProbe.s.y + i * 4, SHIFT);
      await sleep(16);
    }
    await mouse('mouseReleased',
      fineProbe.s.x + 96, fineProbe.s.y + 48, SHIFT);
    await sleep(200);
    const fine = await chrome.eval(`({ to: ${kposExpr(3)},
      phi: window.__aim.getPhi(), state: window.__test.state() })`);
    const fMoved = Math.hypot(fine.to.x - fineProbe.from.x,
      fine.to.y - fineProbe.from.y);
    check('5b: SHIFT press within 3R stays fine aim — ball unmoved (F4)',
      fMoved < 1e-9 && fine.state === 'AIM',
      JSON.stringify({ fMoved, ...fine }));
  }

  // ---- 5c. GH-152: tap-to-aim inside the sandbox (desktop lane) ---------------
  // Pre-fix the playground pointerdown grabbed the ball for placement (and
  // the down-time move() snap even nudged it onto the click point), so the
  // #46 click-to-aim path never fired. Disambiguated at CLICK_MAX_PX: a
  // sub-threshold click AIMS at the clicked ball exactly like play mode —
  // phi lands on the cue→ball azimuth (wrapped err ≤ 1e-9 over the same
  // three-frame centers, the e2e-touch S16 convention), the ball BIT-
  // unmoved, the GH-143 lift never latched; a movement drag keeps the
  // arm-5 placement law byte-intact (proved above). Cue-ball click: a
  // strict no-op (recorded — aiming at the cue is meaningless under the
  // #46 first-ball routing; a cue DRAG still places).
  const tapErr = (id) => chrome.eval(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === ${id});
    let d = (Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2])
      - window.__aim.getPhi()) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  })()`);
  // park the aim provably OFF the cue→3 line (aimAtBall is the sanctioned
  // #46 write; ball 9 is alive until the arm-6 pot below)
  await chrome.eval(`window.__aim.aimAtBall(9)`);
  await sleep(100);
  const parked5c = await tapErr(3);
  check('5c: pre-tap aim parked off the cue→3 line', parked5c > 1e-3,
    `err=${parked5c}`);
  const tapProbe = await chrome.eval(`({
    s: window.__aim.ballScreen(3), from: ${kposExpr(3)} })`);
  check('5c: tap probe live', !!tapProbe.s, JSON.stringify(tapProbe));
  if (tapProbe.s) {
    await mouse('mousePressed', tapProbe.s.x, tapProbe.s.y);
    await sleep(50);
    await mouse('mouseReleased', tapProbe.s.x, tapProbe.s.y);
    await sleep(250);
    const tapped = await chrome.eval(`({
      to: ${kposExpr(3)}, state: window.__test.state(),
      lift: window.__aim.dragLift?.state?.() ?? null })`);
    check('5c: sandbox click on an object ball AIMS at it (wrapped err '
      + '≤ 1e-9), ball BIT-unmoved, lift never latched',
    await tapErr(3) <= 1e-9
      && tapped.to.x === tapProbe.from.x && tapped.to.y === tapProbe.from.y
      && tapped.state === 'AIM' && tapped.lift === null,
    JSON.stringify({ err: await tapErr(3), ...tapped, from: tapProbe.from }));
  }
  const cueProbe = await chrome.eval(`({
    s: window.__aim.ballScreen(0), from: ${kposExpr(0)},
    phi: window.__aim.getPhi() })`);
  check('5c: cue probe live', !!cueProbe.s, JSON.stringify(cueProbe));
  if (cueProbe.s) {
    await mouse('mousePressed', cueProbe.s.x, cueProbe.s.y);
    await sleep(50);
    await mouse('mouseReleased', cueProbe.s.x, cueProbe.s.y);
    await sleep(250);
    const cueTap = await chrome.eval(`({
      to: ${kposExpr(0)}, phi: window.__aim.getPhi() })`);
    check('5c: cue-ball click stays a strict no-op (phi + position '
      + 'bit-unchanged)',
    cueTap.phi === cueProbe.phi && cueTap.to.x === cueProbe.from.x
      && cueTap.to.y === cueProbe.from.y,
    JSON.stringify({ cueTap, from: cueProbe.from, phi0: cueProbe.phi }));
  }

  // ---- 6. no-judgment invariant --------------------------------------------------
  // scripted 9-pot: cue -> 9 -> foot-right CORNER pocket along its 45°
  // diagonal (the mouth faces the table center along the corner diagonal —
  // an off-diagonal approach clips the jaw arcs and stays up)
  const scene = await chrome.eval(`(() => {
    const pockets = window.__rules.pockets();
    const p = pockets.filter((q) => Math.abs(q.y) > 0.1)
      .reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    const ux = Math.SQRT1_2 * Math.sign(p.x);
    const uy = Math.SQRT1_2 * Math.sign(p.y);
    window.__test.layout([
      { id: 0, x: p.x - 0.55 * ux, y: p.y - 0.55 * uy },
      { id: 9, x: p.x - 0.25 * ux, y: p.y - 0.25 * uy },
    ]);
    const phi = Math.atan2(uy, ux);
    return { phi, player: window.__rules.player() };
  })()`);
  const mark6 = consoleLogs.length;
  await chrome.eval(`window.__test.shoot({ phi: ${scene.phi}, v0: 1.2 })`);
  const settled9 = await pollFor(
    `window.__test.state() === 'AIM' && window.__test.outcome() !== null`);
  const pot9 = await chrome.eval(`({
    state: window.__test.state(),
    nine: ${kposExpr(9)} === null || window.__test.balls()
      .find((b) => b.id === 9).pocketed,
    banner: document.getElementById('banner')?.style.display,
    player: window.__rules.player(),
    match: window.__rules.matchState(),
  })`);
  const lines6 = consoleLogs.slice(mark6).join('\n');
  check('6a: potting the 9 in playground — no win, no turn, 9 STAYS down, '
    + 'machine back in AIM',
  settled9 && pot9.state === 'AIM' && pot9.nine === true
    && pot9.banner !== 'block' && pot9.player === scene.player
    && pot9.match === null
    && lines6.includes('[flow] playgroundSettle')
    && !lines6.includes('[flow] gameWon')
    && !lines6.includes('[flow] foulCalled')
    && !lines6.includes('[flow] playerChanged'),
  JSON.stringify({ settled9, ...pot9 }));

  // scripted scratch: cue alone, straight down the same corner diagonal
  await chrome.eval(`(() => {
    const pockets = window.__rules.pockets();
    const p = pockets.filter((q) => Math.abs(q.y) > 0.1)
      .reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    const ux = Math.SQRT1_2 * Math.sign(p.x);
    const uy = Math.SQRT1_2 * Math.sign(p.y);
    window.__test.layout([
      { id: 0, x: p.x - 0.4 * ux, y: p.y - 0.4 * uy },
      { id: 1, x: -p.x + 0.4 * ux, y: -p.y + 0.4 * uy },
    ]);
    window.__test.shoot({ phi: Math.atan2(uy, ux), v0: 2.2 });
  })()`);
  const mark6b = consoleLogs.length;
  const settledScr = await pollFor(
    `window.__test.state() === 'AIM' && window.__test.outcome() !== null`);
  const scr = await chrome.eval(`({
    state: window.__test.state(),
    scratch: window.__test.outcome()?.scratch,
    cueUp: !window.__test.balls().find((b) => b.id === 0).pocketed,
    banner: document.getElementById('banner')?.style.display,
    player: window.__rules.player(),
  })`);
  const lines6b = consoleLogs.slice(mark6b).join('\n');
  check('6b: scratching in playground — cue RESPOTS (soft-lock guard), no '
    + 'foul banner, no turn switch',
  settledScr && scr.state === 'AIM' && scr.scratch === true && scr.cueUp
    && scr.banner !== 'block' && scr.player === scene.player
    && !lines6b.includes('[flow] foulCalled')
    && !lines6b.includes('[flow] playerChanged'),
  JSON.stringify({ settledScr, ...scr }));

  // ---- 7. single-slot undo --------------------------------------------------------
  const undo = await chrome.eval(`(() => {
    const before = ${kposExpr(1)};
    window.__playground.beginDrag(1);
    const ok = window.__playground.placeBall(1, 0.1, -0.3);
    const mid = ${kposExpr(1)};
    const undone = window.__playground.undo();
    const after = ${kposExpr(1)};
    return { before, ok, mid, undone, after,
      slot: window.__playground.state().undo };
  })()`);
  check('7: undo restores the last placement exactly (single slot drains)',
    undo.ok === true && undo.undone === true
      && Math.abs(undo.mid.x - 0.1) < 1e-12
      && Math.abs(undo.after.x - undo.before.x) < 1e-9
      && Math.abs(undo.after.y - undo.before.y) < 1e-9
      && undo.slot === null, JSON.stringify(undo));

  // ---- 7b. grab-abort must not corrupt undo (review F3) -----------------------
  // A committed placement arms the slot; then a drag is ABORTED (grab
  // armed, zero successful placements, gesture ends — modeled seam-level
  // exactly as a stale input leaf that never calls endDrag, so this also
  // pins the pgUndo defensive clear). The undo must restore the TRUE
  // prior position and DRAIN the slot: pre-fix, the leftover pendingGrab
  // re-committed the aborted drag's origin into the slot and a second
  // undo REDID the placement.
  const abort = await chrome.eval(`(() => {
    const orig = ${kposExpr(1)};                     // O
    window.__playground.beginDrag(1);
    const ok = window.__playground.placeBall(1, 0.2, -0.2); // slot={1,O}
    const moved = ${kposExpr(1)};                    // X
    window.__playground.beginDrag(1); // aborted drag: no placement follows
    const undone = window.__playground.undo();
    const back = ${kposExpr(1)};
    const slot = window.__playground.state().undo;
    const redo = window.__playground.undo();         // must refuse (drained)
    const still = ${kposExpr(1)};
    return { orig, ok, moved, undone, back, slot, redo, still };
  })()`);
  check('7b: aborted grab — undo restores the true prior position, slot '
    + 'drains, second undo refuses (no redo)',
  abort.ok === true && abort.undone === true
    && Math.abs(abort.back.x - abort.orig.x) < 1e-9
    && Math.abs(abort.back.y - abort.orig.y) < 1e-9
    && abort.slot === null && abort.redo === false
    && Math.abs(abort.still.x - abort.orig.x) < 1e-9
    && Math.abs(abort.still.y - abort.orig.y) < 1e-9,
  JSON.stringify(abort));

  // ---- 7c. endDrag disarms the grab (the aim.js/touch.js gesture-end wire) ----
  const disarm = await chrome.eval(`(() => {
    window.__playground.beginDrag(1);
    window.__playground.endDrag();   // gesture ended without a placement
    const ok = window.__playground.placeBall(1, 0.25, 0.1);
    return { ok, slot: window.__playground.state().undo };
  })()`);
  check('7c: a disarmed grab never commits into the undo slot',
    disarm.ok === true && disarm.slot === null, JSON.stringify(disarm));

  // ---- 7d. #140 snap toggle round-trip -----------------------------------------
  const snap0 = await chrome.eval(`(() => {
    const b = document.getElementById('ob-mode-snap');
    return b ? {
      pressed: b.getAttribute('aria-pressed'),
      enabled: window.__playground.snapEnabled(),
      blob: JSON.parse(localStorage.getItem('ob-settings-v1')).snapGrid,
    } : null;
  })()`);
  check('7d: snap chip present in playground, default OFF (aria-pressed '
    + 'false, seam false, persisted false)',
  snap0 !== null && snap0.pressed === 'false' && snap0.enabled === false
    && snap0.blob === false, JSON.stringify(snap0));
  await chrome.eval(`document.getElementById('ob-mode-snap').click()`);
  await pollFor(`window.__playground.snapEnabled() === true`);
  const snap1 = await chrome.eval(`({
    pressed: document.getElementById('ob-mode-snap').getAttribute('aria-pressed'),
    enabled: window.__playground.snapEnabled(),
    blob: JSON.parse(localStorage.getItem('ob-settings-v1')).snapGrid,
  })`);
  check('7d: chip click flips pressed state + seam + persisted blob key',
    snap1.pressed === 'true' && snap1.enabled === true && snap1.blob === true,
    JSON.stringify(snap1));

  // ---- 7e. #140 snap math red/green ---------------------------------------------
  // Clean three-ball scene (the arm-6 layout law) so the target region is
  // provably free; pitch from the live-table seam (kernel truth), sanity-
  // checked as 0.5-diamond cells on the scripted 2:1 table.
  await chrome.eval(`window.__test.layout([
    { id: 0, x: 0, y: -0.6 }, { id: 5, x: 0.2, y: 0.1 },
    { id: 1, x: -0.3, y: -0.3 }])`);
  const pitch = await chrome.eval(`window.__playground.snapPitch()`);
  check('7e: lattice pitch derives from live table dims (16x8 half-diamond '
    + 'cells — equal pitches on the 2:1 scripted table)',
  pitch && Math.abs(pitch.x - pitch.y) < 1e-6
    && pitch.x > 0.1 && pitch.x < 0.2, JSON.stringify(pitch));
  // an off-lattice request + its test-side expected nearest node
  const off = { x: 1.4 * pitch.x, y: -2.6 * pitch.y };
  const exp = { x: Math.round(off.x / pitch.x) * pitch.x,
    y: Math.round(off.y / pitch.y) * pitch.y };
  await chrome.eval(`window.__playground.setSnap(false)`);
  await pollFor(`window.__playground.snapEnabled() === false`);
  const red = await chrome.eval(`(() => {
    const ok = window.__playground.placeBall(5, ${off.x}, ${off.y});
    return { ok, p: ${kposExpr(5)} };
  })()`);
  check('7e RED: snap OFF — the off-lattice request lands EXACTLY there '
    + '(the arm-3 law)',
  red.ok === true && Math.abs(red.p.x - off.x) < 1e-12
    && Math.abs(red.p.y - off.y) < 1e-12, JSON.stringify({ off, red }));
  await chrome.eval(`window.__playground.setSnap(true)`);
  await pollFor(`window.__playground.snapEnabled() === true`);
  const green = await chrome.eval(`(() => {
    const ok = window.__playground.placeBall(5, ${off.x}, ${off.y});
    return { ok, p: ${kposExpr(5)} };
  })()`);
  check('7e GREEN: snap ON — the SAME request lands EXACTLY on the nearest '
    + 'lattice node (and it moved off the raw request)',
  green.ok === true && Math.abs(green.p.x - exp.x) < 1e-12
    && Math.abs(green.p.y - exp.y) < 1e-12
    && Math.hypot(exp.x - off.x, exp.y - off.y) > 0.01,
  JSON.stringify({ off, exp, green }));
  // occupied node still nudges (the arm-4 law, unchanged under snap):
  // a request beside ball 5's node snaps ONTO it and must land at the
  // contact ring — never a silent fail, never an overlapped park
  const occ = await chrome.eval(`(() => {
    const r = window.__drills?.ballR ? window.__drills.ballR() : 0.028575;
    const five = ${kposExpr(5)};
    const ok = window.__playground.placeBall(1, five.x + 0.01, five.y - 0.01);
    const one = ${kposExpr(1)};
    return { ok, r, d: Math.hypot(one.x - five.x, one.y - five.y) };
  })()`);
  check('7e: an occupied lattice node still nudges to the nearest legal spot',
    occ.ok === true && occ.d >= 2 * occ.r - 1e-9 && occ.d <= 2 * occ.r + 1e-3,
    JSON.stringify(occ));
  // park ball 1 on a far node so the drag arm below has a clear field
  await chrome.eval(`window.__playground.placeBall(1, -0.45, -0.3)`);

  // ---- 7f. #140 transient guides on a REAL mouse drag ----------------------------
  const onLat = (v, p) => Math.abs(v - Math.round(v / p) * p);
  await chrome.eval(
    `window.__playground.placeBall(5, ${exp.x}, ${1.2 * pitch.y})`);
  const snapDrag = await chrome.eval(`({
    s: window.__aim.ballScreen(5), pre: window.__aim.snapOverlay() })`);
  check('7f: snap-drag ball probe live + overlay hidden before the drag',
    !!snapDrag.s && snapDrag.pre.visible === false, JSON.stringify(snapDrag));
  if (snapDrag.s) {
    await mouse('mousePressed', snapDrag.s.x, snapDrag.s.y);
    let midOverlay = null;
    for (let i = 1; i <= 12; i++) {
      await mouse('mouseMoved', snapDrag.s.x + i * 7, snapDrag.s.y + i * 5);
      await sleep(32);
      if (i === 8) midOverlay = await chrome.eval(`window.__aim.snapOverlay()`);
    }
    const midGuide = await chrome.eval(`window.__playground.snapGuide()`);
    await mouse('mouseReleased', snapDrag.s.x + 84, snapDrag.s.y + 60);
    await sleep(250);
    const after = await chrome.eval(`({
      p: ${kposExpr(5)},
      overlay: window.__aim.snapOverlay(),
      guide: window.__playground.snapGuide() })`);
    check('7f: guides VISIBLE mid-drag, crosshair pinned to an on-lattice '
      + 'node, guide seam live',
    midOverlay?.visible === true && midGuide !== null
      && onLat(midOverlay.x, pitch.x) < 1e-9
      && onLat(midOverlay.y, pitch.y) < 1e-9,
    JSON.stringify({ midOverlay, midGuide }));
    check('7f: drop lands ON the lattice; overlay + guide GONE after release',
      onLat(after.p.x, pitch.x) < 1e-9 && onLat(after.p.y, pitch.y) < 1e-9
        && after.overlay.visible === false && after.guide === null,
      JSON.stringify(after));
  }

  // ---- 7g. #140 persistence: reload restores the toggle ---------------------------
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=snap` });
  await waitReady('snap arm');
  await pollFor(`typeof window.__playground?.snapEnabled === 'function'`);
  await pollFor(
    `document.getElementById('ob-mode-chips')?.classList.contains('on')`);
  const snapBoot = await chrome.eval(`({
    enabled: window.__playground.snapEnabled(),
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).snapGrid,
    pressed: document.getElementById('ob-mode-snap')
      ?.getAttribute('aria-pressed'),
  })`);
  check('7g: snapGrid=true survives reload (seam + raw blob + chip pressed '
    + 'from the boot broadcast)',
  snapBoot.enabled === true && snapBoot.raw === true
    && snapBoot.pressed === 'true', JSON.stringify(snapBoot));

  // ---- 7h. #140 undo exactness under snap (review fix) ----------------------------
  // Snap is still ON from the 7g reload. Rerack (rack origins are never
  // on-lattice — rows sit at foot + k·√3·r, columns at multiples of r),
  // drag a rack ball to a free lattice node (the DROP must snap — pins that
  // the toggle was live for the whole arm), then undo: the restore must
  // land EXACTLY on the true pick-up origin (|Δ| < 1e-9), never on its
  // nearest lattice node. RED on the pre-fix tree: pgUndo's restore routed
  // through the snapping seam and parked on the node (cm-scale error).
  // GREEN with the internal exact-placement escape. Setup subtlety: the
  // rack is FROZEN-contact topology (contacts at exactly 2r, back-row
  // micro-gaps 0.05–0.5 mm), so the origin point only re-fits the
  // placementFits 2r + 1e-4 clearance after the ball's touching neighbors
  // are vacated — scripted placements do that WITHOUT touching the undo
  // slot (the 7c law: no beginDrag, no commit).
  const hPitch = await chrome.eval(`window.__playground.snapPitch()`);
  const undoSnap = await chrome.eval(`(() => {
    const px = ${hPitch.x}, py = ${hPitch.y};
    const r = window.__drills?.ballR ? window.__drills.ballR() : 0.028575;
    const rerack = window.__playground.rerack(); // fresh same-seed rack
    const orig = ${kposExpr(3)};                 // a rack ball's TRUE origin
    // vacate frozen neighbors to free head-side lattice nodes (>= 1 pitch
    // apart, clear of the drag target (-2,-2), the cue, and each other)
    const parks = [[-1, -1], [1, -1], [-1, -3], [1, -3], [-3, -1], [3, -1]];
    let parked = 0;
    for (const b of window.__test.balls()) {
      if (b.pocketed || b.id === 3) continue;
      const d = Math.hypot(b.pos[2] - orig.x, b.pos[0] - orig.y);
      if (d < 2 * r + 2e-4 && parked < parks.length) {
        const [nx, ny] = parks[parked++];
        window.__playground.placeBall(b.id, nx * px, ny * py);
      }
    }
    window.__playground.beginDrag(3);
    const ok = window.__playground.placeBall(
      3, -2 * px + 0.011, -2 * py - 0.007);      // off-lattice ask
    window.__playground.endDrag();
    const moved = ${kposExpr(3)};                // must be ON the lattice
    const undone = window.__playground.undo();
    const after = ${kposExpr(3)};
    return { rerack, orig, parked, ok, moved, undone, after,
      slot: window.__playground.state().undo };
  })()`);
  const hOff = (v, p) => Math.abs(v - Math.round(v / p) * p);
  const hDelta = Math.hypot(undoSnap.after.x - undoSnap.orig.x,
    undoSnap.after.y - undoSnap.orig.y);
  check('7h: snap ON + off-lattice rack origin — the drop snaps but undo '
    + 'restores the TRUE origin EXACTLY (|Δ| < 1e-9, slot drains)',
  undoSnap.rerack === true && undoSnap.ok === true
    && undoSnap.undone === true && undoSnap.slot === null
    // precondition: the origin really is off-lattice (else the arm is vacuous)
    && Math.max(hOff(undoSnap.orig.x, hPitch.x),
      hOff(undoSnap.orig.y, hPitch.y)) > 1e-4
    // the drop itself snapped (toggle live through the arm)
    && hOff(undoSnap.moved.x, hPitch.x) < 1e-9
    && hOff(undoSnap.moved.y, hPitch.y) < 1e-9
    // the exactness law
    && Math.abs(undoSnap.after.x - undoSnap.orig.x) < 1e-9
    && Math.abs(undoSnap.after.y - undoSnap.orig.y) < 1e-9,
  JSON.stringify({ hPitch, hDelta, ...undoSnap }));

  // back OFF: the later arms (and the touch arm's own leg) start from the
  // shipped exact-placement default
  await chrome.eval(`window.__playground.setSnap(false)`);
  await pollFor(`window.__playground.snapEnabled() === false`);

  // ---- 7i. GH-994: every fresh table empties the single-slot undo -----------------
  // A game switch and an equipment change re-rack under the sandbox (mode
  // stays playground); pre-fix only the sandbox's own Re-rack / Clear and
  // the mode edge cleared the slot, so the chip stayed enabled and one
  // click pulled a ball of the FRESH rack to the old table's coordinates.
  // Legs: arm a committed drag → switch (changeGame eight_ball, the user
  // pin's confirm-free lane) → slot null, chip disabled, undo() refuses and
  // moves nothing; the same for changeEquipment(table_id); then back to the
  // 9-ball default table so arm 8 keeps its fresh-rack count.
  const undoAfter = async (commit) => chrome.eval(`(async () => {
    const W = (ms) => new Promise((r) => setTimeout(r, ms));
    const pos = () => JSON.stringify(window.__test.balls().map((b) => [b.id, b.pocketed, b.pos]));
    window.__playground.beginDrag(8);
    const placed = window.__playground.placeBall(8, 0.21, -0.37);
    window.__playground.endDrag();
    const armed = window.__playground.state().undo;
    const ok = await (${commit});
    for (let i = 0; i < 100 && !['AIM', 'BALL_IN_HAND'].includes(window.__test.state()); i++) await W(100);
    await W(300);
    const p0 = pos();
    const disabled = document.getElementById('ob-mode-undo')?.disabled ?? null;
    const slot = window.__playground.state().undo;
    const undone = window.__playground.undo();
    return { placed, armed, ok, mode: window.__settings.get().mode, slot, disabled, undone, moved: pos() !== p0 };
  })()`);
  const tableId0 = await chrome.eval(`window.__settings.get().equipment.table_id`);
  const u1 = await undoAfter(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`);
  check('7i: a GAME switch under the sandbox empties the undo slot (chip disabled, undo refuses, nothing moves)',
    u1.placed === true && u1.armed?.id === 8 && u1.ok === true && u1.mode === 'playground'
      && u1.slot === null && u1.disabled === true && u1.undone === false && u1.moved === false,
    JSON.stringify(u1));
  const tableAlt = tableId0 === 'pool_pro_9ft_metal_rim' ? 'pool_pro_9ft' : 'pool_pro_9ft_metal_rim';
  const u2 = await undoAfter(`window.__settings.changeEquipment('table_id', '${tableAlt}', { skipConfirm: true })`);
  check('7i: an EQUIPMENT change empties the undo slot the same way',
    u2.placed === true && u2.armed?.id === 8 && u2.ok === true && u2.mode === 'playground'
      && u2.slot === null && u2.disabled === true && u2.undone === false && u2.moved === false,
    JSON.stringify(u2));
  await chrome.eval(`window.__settings.changeEquipment('table_id', '${tableId0}', { skipConfirm: true })`);
  await chrome.eval(`window.__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await pollFor(`window.__rules.game() === 'nine_ball' && window.__settings.get().equipment.table_id === '${tableId0}'
    && ['AIM', 'BALL_IN_HAND'].includes(window.__test.state())`);

  // ---- 8. playground -> play: fresh rack, judgment live ---------------------------
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__settings.get().mode === 'play'`);
  await pollFor(`window.__test.balls().every((b) => !b.pocketed)`);
  const back = await chrome.eval(`({
    state: window.__test.state(),
    up: window.__test.balls().filter((b) => !b.pocketed).length,
    chips: document.getElementById('ob-mode-chips').classList.contains('on'),
    hudRerack: ${visExpr('rerack')},
  })`);
  const matchLive = await pollFor(`window.__rules.matchState() !== null`);
  // GH-370: the play-mode fresh rack grants the opening BALL_IN_HAND
  // (kitchen right) — the playground itself never converts (free placement)
  check('8: back to play — fresh rack (10 up), judgment live, chips gone, '
    + 'HUD Re-rack restored (F2)',
  back.state === 'BALL_IN_HAND' && back.up === 10 && back.chips === false
    && back.hudRerack === true && matchLive,
  JSON.stringify({ ...back, matchLive }));

  // ---- 9. practice mode + browse hand-off (GH-151 re-target; 034 re-cut) -------
  // The stale pre-GH-135 auto-open is RETIRED: switching to practice from
  // play (the changeMode API — the settings modal no longer hosts the mode
  // strip, feature 034) keeps the SHELL open (GH-121: play ↔ practice never
  // re-racks, never auto-closes) and the picker does NOT open; the BROWSE
  // hand-off is 036a's practice card `[data-ob="practice-drills"]` — it
  // closes the shell, then opens the tier-grouped picker.
  await pollFor(`typeof window.__drills?.open === 'function'`);
  // the arms between 1b and here re-boot the page without `obshell=1`
  // (persistence round-trips) — a scripted boot has no shell then (shell.md
  // §4); hop back onto the opt-in once (same origin, same profile)
  if (!(await chrome.eval(`typeof window.__shell === 'object'`))) {
    await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=pg9` });
    for (let i = 0; i < 300; i++) {
      let ok = false;
      try { ok = await chrome.eval('window.__test?.ready === true'); } catch { /* navigating */ }
      if (ok) break;
      await sleep(200);
    }
    await pollFor(`typeof window.__drills?.open === 'function'`);
  }
  await chrome.eval(`window.__shell.isOpen() || window.__shell.openShell({}); true`);
  await pollFor(`window.__shell.isOpen() === true`);
  await chrome.eval(`window.__shell.go('practice'); true`);
  await pollFor(`typeof window.__practice === 'object'
    && document.getElementById('ob-practice')?.hidden === false
    && !!document.querySelector('[data-ob="practice-drills"]')`, 150);
  await chrome.eval(`window.__settings.changeMode('practice')`);
  await sleep(700); // the retired hand-off's whole window (close + open)
  const sel9 = await chrome.eval(`({
    mode: window.__settings.get().mode,
    shellOpen: window.__shell.isOpen(),
    place: window.__shell.place(),
    pickerOpen: window.__drills.isOpen(),
    drillsCard: !!document.querySelector('[data-ob="practice-drills"]') })`);
  check('9: practice mode keeps the SHELL open at the practice card — NO '
    + 'picker auto-open (GH-151)',
  sel9.mode === 'practice' && sel9.shellOpen === true && sel9.place === 'practice'
    && sel9.pickerOpen === false && sel9.drillsCard === true,
  JSON.stringify(sel9));
  await chrome.eval(`document.querySelector('[data-ob="practice-drills"] button').click(); true`);
  const pickerUp = await pollFor(`window.__drills.isOpen() === true
    && window.__shell.isOpen() === false`);
  check('9: the practice card\'s BROWSE action closes the shell, then opens the '
    + 'drill picker (the close-then-open law lives there now)', pickerUp === true);
  await chrome.eval(`window.__drills.close()`);
  await sleep(300);
  // issue #120: the picker opener moved from the mode strip (#ob-mode-drills,
  // an aim-zone mis-tap surface) to the drills-owned icon dock — the opener
  // probe retargets to #ob-drill-open. GH-156 (chrome diet): the mode BADGE
  // left the strip too — practice renders the read-only #ob-mode-ind
  // indicator (icon + short label) and NO action strip at all (the band-S
  // row is playground-only now).
  const practiceChip = await pollFor(`(() => {
    const ind = document.getElementById('ob-mode-ind');
    const chips = document.getElementById('ob-mode-chips');
    return !!ind && ind.classList.contains('on')
      && ind.textContent.trim().length > 0
      && !!chips && !chips.classList.contains('on')
      && !!document.getElementById('ob-drill-open');
  })()`);
  check('9: practice mode INDICATOR live, action strip off (GH-156 split), '
    + 'dock opener present', practiceChip);

  // ---- 9b. live drill dies on ANY switch away from practice (review F1) -------
  // Pre-fix, only the playground leg stopped the drill: practice -> play
  // left it running AND scoring while the selector claimed Play.
  const drillId = await chrome.eval(`window.__drills.list()[0].id`);
  const started = await chrome.eval(`window.__drills.start('${drillId}')`);
  const drillLive = started === true && await pollFor(
    `window.__drills.state() !== null
      && document.getElementById('ob-drill-chips').classList.contains('on')`);
  check('9b: drill live in practice mode', drillLive,
    JSON.stringify({ drillId, started }));
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__settings.get().mode === 'play'`);
  const afterSwitch = await chrome.eval(`({
    mode: window.__settings.get().mode,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).mode,
    drill: window.__drills.state(),
    chromeOn: document.getElementById('ob-drill-chips')
      .classList.contains('on'),
    chromeKids: document.getElementById('ob-drill-chips').childElementCount,
  })`);
  check('9b: practice -> play stops the drill — chrome gone, evaluator '
    + 'dead, mode=play persisted',
  afterSwitch.mode === 'play' && afterSwitch.raw === 'play'
    && afterSwitch.drill === null && afterSwitch.chromeOn === false
    && afterSwitch.chromeKids === 0, JSON.stringify(afterSwitch));

  // ---- 9c. inverse pin: a drill started from play PINS the selector -----------
  const pinned = await chrome.eval(`window.__drills.start('${drillId}')`);
  const pinState = await chrome.eval(`({
    mode: window.__settings.get().mode,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).mode,
    drill: window.__drills.state()?.id ?? null,
  })`);
  check('9c: __drills.start from play pins the mode selector to practice',
    pinned === true && pinState.mode === 'practice'
      && pinState.raw === 'practice' && pinState.drill === drillId,
    JSON.stringify(pinState));
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__drills.state() === null`);

  // ---- 9d. playground -> practice re-rack leg (GH-151 re-target; 034 re-cut) -
  // From PLAYGROUND, switching to practice runs the ONE remaining #121
  // re-racking mode leg. The settings modal no longer hosts the mode strip
  // (feature 034), so the old "shell auto-closes + focus returns to the
  // gear" half is RETIRED with it; the surviving law is changeMode's own:
  // the rack is fresh (shot index 0, match state live again), NO picker
  // auto-open (GH-151), zero backdrops — and the HALL shell, which is not
  // the modal, keeps its state (open at the practice card). Driven through
  // the API with the shell open at practice (the place surface).
  await chrome.eval(`window.__settings.changeMode('playground')`);
  await pollFor(`window.__settings.get().mode === 'playground'`);
  await chrome.eval(`window.__shell.isOpen() || window.__shell.openShell({}); true`);
  await pollFor(`window.__shell.isOpen() === true`);
  await chrome.eval(`window.__shell.go('practice'); true`);
  await pollFor(`typeof window.__practice === 'object'
    && document.getElementById('ob-practice')?.hidden === false`, 150);
  const racePre = await chrome.eval(`({ shot: window.__test.bed().shotIndex,
    seed: window.__test.bed().seed, match: window.__rules.matchState() })`);
  await chrome.eval(`window.__settings.changeMode('practice')`);
  const raceUp = await pollFor(`window.__settings.get().mode === 'practice'`);
  // any straggler picker-open / teardown residue lands inside this settle
  // window — then read the truth
  await sleep(600);
  const race = await chrome.eval(`({
    mode: window.__settings.get().mode,
    shellOpen: window.__shell.isOpen(), place: window.__shell.place(),
    modalGone: document.getElementById('ob-settings')
      .getClientRects().length === 0,
    backdrops: document.querySelectorAll('.ob-backdrop').length,
    pickerOpen: window.__drills.isOpen(),
    shot: window.__test.bed().shotIndex, seed: window.__test.bed().seed,
    matchLive: window.__rules.matchState() !== null })`);
  check('9d: playground -> practice re-racks (fresh rack, match state live — '
    + 'the GH-121 re-rack leg), NO picker auto-open (GH-151), zero backdrops, '
    + 'the hall shell untouched (open at practice)',
  raceUp && race.mode === 'practice' && race.shot === 0 && race.matchLive
    && racePre.match === null && race.modalGone && race.backdrops === 0
    && race.pickerOpen === false && race.shellOpen === true
    && race.place === 'practice', JSON.stringify({ racePre, race }));
  await chrome.eval(`window.__shell.quickPlay(); true`);
  await pollFor(`window.__shell.isOpen() === false`);
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__settings.get().mode === 'play'`);

  const errs = await chrome.eval('window.__test.errors');
  if (errs.length) fail('app errors (desktop arms): ' + errs.join(' | '));

  // ---- 11. share fidelity (#68 codec v6) ---------------------------------------
  // A recorded playground session must replay FAITHFULLY: the committed
  // free placements ride the v6 moves axis (commit order, undo restores
  // as events, cue included), the sender-mode flag suppresses judgment on
  // the replay lane, and the replayed table matches ball-for-ball.
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=sharefid` });
  await waitReady('share-fidelity arm');
  await pollFor(`typeof window.__playground?.placeBall === 'function'`);
  await chrome.eval(`window.__settings.changeMode('playground')`);
  await pollFor(`window.__settings.get().mode === 'playground'`);
  // the primitives below gate on flow.js's live sandbox truth, not the
  // settings value — poll the concrete condition (no fixed sleep)
  await pollFor(`window.__playground.active() === true`);
  // six committed placements before shot 0: a drag commit, a direct seam
  // commit, a move->move->undo triplet on ball 1 (the restore is one MORE
  // event, landing exactly on the vacated prior point), and the cue
  // through the free primitive (ball id 0 on the wire)
  const fid = await chrome.eval(`(() => {
    const pg = window.__playground;
    pg.beginDrag(3);
    const ok1 = pg.placeBall(3, 0.25, 0.35);
    pg.endDrag();
    const ok2 = pg.placeBall(5, -0.3, 0.2);
    pg.beginDrag(1);
    const ok3 = pg.placeBall(1, 0.1, -0.3);
    pg.endDrag();
    pg.beginDrag(1);
    const ok4 = pg.placeBall(1, 0.35, -0.5);
    pg.endDrag();
    const ok5 = pg.undo();
    pg.beginDrag(0);
    const ok6 = pg.placeBall(0, 0, -0.8);
    pg.endDrag();
    return [ok1, ok2, ok3, ok4, ok5, ok6];
  })()`);
  check('11: six free-placement commits landed', fid.every((x) => x === true),
    JSON.stringify(fid));
  // shot 0: a NO-CONTACT stroke into the head cushion — judged play would
  // call the WPA no-contact foul (BIH); the sandbox just settles. The
  // replay must reproduce the SUPPRESSION, not the foul.
  const shot11a = await chrome.eval(
    `window.__test.shoot({ phi: -Math.PI / 2, v0: 1.0 })`);
  check('11: sandbox shot 0 accepted', !shot11a, JSON.stringify(shot11a));
  const settled11a = await pollFor(
    `window.__test.state() === 'AIM' && window.__test.outcome() !== null`);
  check('11: sandbox shot 0 settled to AIM (no BIH — judgment suppressed)',
    settled11a);
  // one committed placement BETWEEN the shots (tags shotIndex 1): any
  // still-up object ball to a clear spot (post-nudge landing recorded)
  const pick = await chrome.eval(`(() => {
    const b = window.__test.balls().find((x) => !x.pocketed && x.id > 0);
    const ok = window.__playground.placeBall(b.id, -0.35, -0.45);
    return { id: b.id, ok };
  })()`);
  check('11: mid-session placement landed', pick.ok === true,
    JSON.stringify(pick));
  await chrome.eval(`window.__test.shoot({ phi: Math.PI / 2, v0: 4.0 })`);
  // shoot() transitions off AIM synchronously, so the poll below cannot
  // pass on the stale shot-0 outcome — it waits for the NEW settle
  const settled11b = await pollFor(`window.__test.state() === 'AIM'`);
  check('11: sandbox shot 1 settled', settled11b);
  const recorded = await chrome.eval(`({
    balls: window.__test.balls().map((b) => ({
      id: b.id, pocketed: b.pocketed, x: b.pos[2], y: b.pos[0] })),
    records: window.__share.records(),
    log: window.__share.log(),
  })`);
  check('11: recorder log carries the moves axis + the playground latch',
    recorded.log.playground === true && recorded.log.moves.length === 7
      && recorded.log.shots === 2 && recorded.records.length === 2,
    JSON.stringify({ ...recorded.log, records: recorded.records.length }));
  const url11 = await chrome.eval(`window.__share.encode()`);
  const hash11 = url11.slice(url11.indexOf('#'));
  const dec11 = await decodeShare(hash11.slice(3));
  check('11: v6 axes — mode playground, 7 moves in commit order (undo '
    + 'restore = the exact vacated point; cue id 0 on the axis; the '
    + 'wire itself is v7 since the GH-448 breaker seat)',
  dec11.formatV === 7 && dec11.mode === 'playground'
    && dec11.moves.length === 7
    && dec11.moves.map((m) => m.ball).join(',') === `3,5,1,1,1,0,${pick.id}`
    && dec11.moves.map((m) => m.shotIndex).join(',') === '0,0,0,0,0,0,1'
    && dec11.moves[4].x === dec11.moves[2].x
    && dec11.moves[4].y === dec11.moves[2].y,
  JSON.stringify({ v: dec11.formatV, mode: dec11.mode, moves: dec11.moves }));
  // 11-flush (review F4): a shot fired MID-DRAG bakes the dragged mesh
  // into its scenario, so the pending in-bracket landing must flush to
  // the recorder AT THE SIMULATING EDGE — tagged with the shot it truly
  // precedes — and a lift AFTER settle must add no phantom event. (These
  // post-encode shots never touch the url11 assertions above.)
  const flush11 = await chrome.eval(`(() => {
    const pg = window.__playground;
    const b = window.__test.balls().find((x) => !x.pocketed && x.id > 0);
    const n0 = window.__share.log().moves.length;
    pg.beginDrag(b.id);
    const ok = pg.placeBall(b.id, 0.05, 0.6);
    const preFire = window.__share.log().moves.length; // tracked, not committed
    const err = window.__test.shoot({ phi: -Math.PI / 2, v0: 0.8 });
    const m = window.__share.log().moves;
    return { id: b.id, ok, err, n0, preFire, n: m.length,
      last: m[m.length - 1] };
  })()`);
  check('11: mid-drag shot flushes the pending commit at the SIMULATING '
    + 'edge, tagged with the FIRING shot index',
  flush11.ok === true && !flush11.err
    && flush11.preFire === flush11.n0 && flush11.n === flush11.n0 + 1
    && flush11.last.ball === flush11.id && flush11.last.shotIndex === 2,
  JSON.stringify(flush11));
  await pollFor(`window.__test.state() === 'AIM'`);
  const lift11 = await chrome.eval(`(() => {
    const n = window.__share.log().moves.length;
    window.__playground.endDrag();
    return { before: n, after: window.__share.log().moves.length,
      shots: window.__share.log().shots };
  })()`);
  check('11: lift AFTER settle records no phantom event (the flush '
    + 'already committed the gesture)',
  lift11.before === lift11.after && lift11.shots === 3,
  JSON.stringify(lift11));
  // 11-undo (review F5): a mid-gesture Undo chip tap nulls the GUIDE
  // bracket but must NOT flip the rest of the live drag onto the
  // per-pointermove immediate path — the drag stays ONE tracked commit
  // (plus the flush of its pre-undo landing), never a per-move flood.
  const flood11 = await chrome.eval(`(() => {
    const pg = window.__playground;
    const b = window.__test.balls().find((x) => !x.pocketed && x.id > 0);
    const n0 = window.__share.log().moves.length;
    pg.beginDrag(b.id);
    const a1 = pg.placeBall(b.id, 0.2, 0.15);
    const a2 = pg.placeBall(b.id, 0.22, 0.18);
    const u = pg.undo(); // chip action mid-gesture
    const a3 = pg.placeBall(b.id, 0.24, 0.21);
    const a4 = pg.placeBall(b.id, 0.26, 0.24);
    pg.endDrag();
    const m = window.__share.log().moves.slice(n0);
    return { id: b.id, ok: [a1, a2, u, a3, a4], n: m.length,
      balls: m.map((x) => x.ball).join(',') };
  })()`);
  check('11: mid-gesture undo keeps the live drag on the one-commit path '
    + '(pre-undo landing flushed + one gesture commit — no per-move flood)',
  flood11.ok.every((x) => x === true) && flood11.n === 2
    && flood11.balls === `${flood11.id},${flood11.id}`,
  JSON.stringify(flood11));
  // 11-hudreplay (WIRING re-review): an in-app HUD Replay in the sandbox
  // re-runs the LAST shot's playback, which rewrites every mesh from the
  // sampler — wiping the post-settle placement the recorder has ALREADY
  // committed for the next shot. The re-settle must RESTORE the committed
  // landing (or the sender's next stroke bakes a table the encoded moves
  // axis contradicts and the shared replay forks silently), with no
  // phantom event and no extra logged shot.
  const hud11 = await chrome.eval(`(() => {
    const pg = window.__playground;
    const b = window.__test.balls().find((x) => !x.pocketed && x.id > 0);
    pg.beginDrag(b.id);
    const ok = pg.placeBall(b.id, -0.18, 0.55);
    pg.endDrag();
    const m = window.__share.log().moves;
    document.getElementById('replay').click();
    return { id: b.id, ok, n: m.length, last: m[m.length - 1],
      state: window.__test.state() };
  })()`);
  check('11: HUD Replay accepted after a committed post-settle placement',
    hud11.ok === true && hud11.state === 'PLAYBACK'
      && hud11.last.ball === hud11.id && hud11.last.shotIndex === 3,
    JSON.stringify(hud11));
  await chrome.eval(`window.__test.seek(1e6)`); // settles on the next frame
  const hudSettled = await pollFor(`window.__test.state() === 'AIM'`);
  check('11: in-app Replay re-settled to AIM', hudSettled);
  const hud11r = await chrome.eval(`(() => {
    const b = window.__test.balls().find((x) => x.id === ${hud11.id});
    const log = window.__share.log();
    return { x: b.pos[2], y: b.pos[0], pocketed: b.pocketed,
      n: log.moves.length, shots: log.shots };
  })()`);
  check('11: in-app Replay re-settle RESTORES the committed placement '
    + '(mesh back on the recorded point; no phantom event, no extra shot)',
  hud11r.pocketed === false
    && Math.abs(hud11r.x - hud11.last.x) < 1e-9
    && Math.abs(hud11r.y - hud11.last.y) < 1e-9
    && hud11r.n === hud11.n && hud11r.shots === 3,
  JSON.stringify({ hud11, hud11r }));
  // replay on a PLAY-mode viewer profile: the suppression must come from
  // the WIRE flag, never the viewer's persisted mode
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__settings.get().mode === 'play'`);
  const mark11r = consoleLogs.length;
  await chrome.send('Page.navigate',
    { url: `${APP_URL}&arm=sharefid-replay${hash11}` });
  await waitReady('share-fidelity replay');
  let rep11 = { done: false };
  for (let i = 0; i < 150; i++) {
    await sleep(400);
    rep11 = await chrome.eval(`window.__share.replay()`);
    if (rep11.done) break;
  }
  check('11: playground replay finishes with the v6 axes advertised',
    rep11.done === true && rep11.n === 2 && rep11.mode === 'playground'
      && rep11.moves === 7, JSON.stringify(rep11));
  const after11 = await chrome.eval(`({
    records: window.__share.records(),
    balls: window.__test.balls().map((b) => ({
      id: b.id, pocketed: b.pocketed, x: b.pos[2], y: b.pos[0] })),
    match: window.__rules.matchState(),
  })`);
  check('11: replayed records byte-match the sender session',
    after11.records.length === recorded.records.length
      && after11.records.every((r, i) => r === recorded.records[i]),
    JSON.stringify(after11.records.map((r, i) => r === recorded.records[i])));
  const tableMatch = recorded.balls.length === after11.balls.length
    && recorded.balls.every((b) => {
      const r = after11.balls.find((x) => x.id === b.id);
      return r && r.pocketed === b.pocketed && (b.pocketed
        || (Math.abs(r.x - b.x) < 1e-9 && Math.abs(r.y - b.y) < 1e-9));
    });
  check('11: replayed table matches the recorded one BALL-FOR-BALL',
    tableMatch, JSON.stringify({ recorded: recorded.balls, after: after11.balls }));
  const lines11 = consoleLogs.slice(mark11r).join('\n');
  check('11: replay suppressed judgment exactly like the sender '
    + '(playgroundSettle mirrors, zero foul/win/turn hooks, matchState null)',
  after11.match === null
    && lines11.includes('[flow] playgroundSettle')
    && !lines11.includes('[flow] foulCalled')
    && !lines11.includes('[flow] gameWon')
    && !lines11.includes('[flow] playerChanged'),
  JSON.stringify({ match: after11.match,
    settles: (lines11.match(/playgroundSettle/g) ?? []).length }));

  // ---- 10. touch S3 generalization (phone boot) ---------------------------------------
  await setPhoneMetrics(chrome, { width: 844, height: 390 });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=touch` });
  await waitReady('touch arm');
  await pollFor(`document.documentElement.classList.contains('ob-touch')`);
  await pollFor(`typeof window.__playground?.placeBall === 'function'`);
  await chrome.eval(`window.__settings.changeMode('playground')`);
  await pollFor(`window.__settings.get().mode === 'playground'`);
  await sleep(300);
  const tFrom = await chrome.eval(`({
    s: window.__aim.ballScreen(2), k: ${kposExpr(2)} })`);
  check('10: touch-arm ball probe live', !!tFrom.s, JSON.stringify(tFrom));
  if (tFrom.s) {
    await touchStart(chrome, [{ x: tFrom.s.x, y: tFrom.s.y, id: 1 }]);
    for (let i = 1; i <= 10; i++) {
      await touchMove(chrome, [{
        x: tFrom.s.x + i * 6, y: tFrom.s.y + i * 3, id: 1 }]);
      await sleep(16);
    }
    const midS3 = await chrome.eval(
      `({ state: window.__touch.state(), ghost: window.__touch.ghost() })`);
    await touchEnd(chrome, []);
    await sleep(200);
    const tAfter = await chrome.eval(kposExpr(2));
    const tMoved = Math.hypot(tAfter.x - tFrom.k.x, tAfter.y - tFrom.k.y);
    check('10: one-finger drag on an OBJECT ball classifies S3 (ghost up) '
      + 'and moves it',
    midS3.state === 'S3' && midS3.ghost !== null && tMoved > 0.01,
    JSON.stringify({ midS3, tMoved }));
  }

  // ---- 10t. GH-152 touch lane: sandbox tap-to-aim ------------------------------
  // The #68 tap-inertness rule is retired: a sub-slop TAP on an object
  // ball aims at it exactly like play mode (the S3 placement claim only
  // engages past TOUCH_SLOP_PX — the FSM already disambiguates tap vs
  // drag), with the ball BIT-unmoved. The cue keeps its NO-OP claim
  // (recorded: a sandbox cue tap does nothing; a cue drag places).
  const tapErrT = (id) => chrome.eval(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === ${id});
    let d = (Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2])
      - window.__aim.getPhi()) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  })()`);
  // third person: in aim view the cue never competes for taps (the S16
  // convention) — the cue-claim leg below needs the third-person law
  if (await chrome.eval('window.__aim?.getAimView?.() === true')) {
    await chrome.eval('window.__aim.setAimView(false)');
    await sleep(400);
  }
  await chrome.eval(`window.__aim.aimAtBall(9)`);
  await sleep(100);
  const parkedT = await tapErrT(2);
  check('10t: pre-tap aim parked off the cue→2 line', parkedT > 1e-3,
    `err=${parkedT}`);
  const tapT = await chrome.eval(`({
    s: window.__aim.ballScreen(2), from: ${kposExpr(2)} })`);
  check('10t: tap probe live', !!tapT.s, JSON.stringify(tapT));
  if (tapT.s) {
    await tap(chrome, tapT.s.x, tapT.s.y);
    await sleep(300);
    const tappedT = await chrome.eval(`({
      to: ${kposExpr(2)}, state: window.__touch.state(),
      ghost: window.__touch.ghost() })`);
    check('10t: sandbox TAP on an object ball AIMS at it (wrapped err '
      + '≤ 1e-9), ball BIT-unmoved, no ghost, classifier drained',
    await tapErrT(2) <= 1e-9
      && tappedT.to.x === tapT.from.x && tappedT.to.y === tapT.from.y
      && tappedT.state === 'S0' && tappedT.ghost === null,
    JSON.stringify({ err: await tapErrT(2), ...tappedT, from: tapT.from }));
  }
  const cueT = await chrome.eval(`({
    s: window.__aim.ballScreen(0), from: ${kposExpr(0)},
    phi: window.__aim.getPhi() })`);
  check('10t: cue probe live', !!cueT.s, JSON.stringify(cueT));
  if (cueT.s) {
    await tap(chrome, cueT.s.x, cueT.s.y);
    await sleep(250);
    const cueTapT = await chrome.eval(`({
      to: ${kposExpr(0)}, phi: window.__aim.getPhi() })`);
    check('10t: cue-ball TAP stays a strict no-op (phi + position '
      + 'bit-unchanged)',
    cueTapT.phi === cueT.phi && cueTapT.to.x === cueT.from.x
      && cueTapT.to.y === cueT.from.y,
    JSON.stringify({ cueTapT, from: cueT.from, phi0: cueT.phi }));
  }

  // ---- 10b. #140 coarse snap leg -----------------------------------------------
  // Clean two-ball field (the 7e layout law) + snap ON: a one-finger drag
  // toward the screen center lands ball 2 ON the lattice, the ghost ring
  // still paints mid-drag, and the guides clear at touchEnd.
  await chrome.eval(`window.__test.layout([
    { id: 0, x: 0, y: -0.6 }, { id: 2, x: 0.2, y: 0.3 }])`);
  await chrome.eval(`window.__playground.setSnap(true)`);
  await pollFor(`window.__playground.snapEnabled() === true`);
  const tPitch = await chrome.eval(`window.__playground.snapPitch()`);
  const tSnapFrom = await chrome.eval(`window.__aim.ballScreen(2)`);
  check('10b: coarse snap ball probe live', !!tSnapFrom, JSON.stringify(tSnapFrom));
  if (tSnapFrom) {
    const tgt = { x: 422, y: 251 }; // placement lands GHOST_OFFSET_PX above
    await touchStart(chrome, [{ x: tSnapFrom.x, y: tSnapFrom.y, id: 1 }]);
    let midSnap = null;
    for (let i = 1; i <= 10; i++) {
      await touchMove(chrome, [{
        x: tSnapFrom.x + (tgt.x - tSnapFrom.x) * (i / 10),
        y: tSnapFrom.y + (tgt.y - tSnapFrom.y) * (i / 10), id: 1 }]);
      await sleep(32);
      if (i === 7) {
        midSnap = await chrome.eval(`({
          overlay: window.__aim.snapOverlay(),
          ghost: window.__touch.ghost() })`);
      }
    }
    await touchEnd(chrome, []);
    await sleep(250);
    const tSnapAfter = await chrome.eval(`({
      p: ${kposExpr(2)},
      overlay: window.__aim.snapOverlay(),
      guide: window.__playground.snapGuide() })`);
    const tOnLat = (v, p) => Math.abs(v - Math.round(v / p) * p);
    check('10b: coarse drag with snap ON — guides + ghost up mid-drag, '
      + 'ball lands ON the lattice, guides gone after touchEnd',
    midSnap?.overlay?.visible === true && midSnap.ghost !== null
      && tOnLat(tSnapAfter.p.x, tPitch.x) < 1e-9
      && tOnLat(tSnapAfter.p.y, tPitch.y) < 1e-9
      && tSnapAfter.overlay.visible === false && tSnapAfter.guide === null,
    JSON.stringify({ midSnap, tSnapAfter }));
  }
  await chrome.eval(`window.__playground.setSnap(false)`);
  await pollFor(`window.__playground.snapEnabled() === false`);

  // classic BALL_IN_HAND cue drag must be byte-identical OUTSIDE playground:
  // back to play, ball taps stay quick-aim (spot check: state returns S0)
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__settings.get().mode === 'play'`);
  await touchDrag(chrome, { x: 400, y: 200 }, { x: 460, y: 200 });
  const s0 = await chrome.eval(`window.__touch.state()`);
  check('10: classifier drains back to S0 outside playground', s0 === 'S0');

  const errsT = await chrome.eval('window.__test.errors');
  if (errsT.length) fail('app errors (touch arm): ' + errsT.join(' | '));
  if (consoleErrors.length) {
    fail('console errors: ' + consoleErrors.join(' | '));
  }
} catch (e) {
  fail(e?.stack ?? String(e));
} finally {
  try { chrome.close(); } catch { /* already gone */ }
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-PLAYGROUND: FAIL' : 'E2E-PLAYGROUND: ALL PASS');
