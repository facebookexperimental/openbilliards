// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell.mjs — UI-shell gate (feature 031, program #525 S1; coordinator
// ruling 5: the DEDICATED driver, e2e-settings precedent). Drives the
// contract surface end-to-end on the frozen §6 selectors of
// the shell contract (feature 031, internal):
//
//   A. `obshell=1` scripted shell (ruling 3): instant posed boot, registry
//      walk via __shell.go (pose === §2 anchor per place, aria-current +
//      hidden-toggle card law), no-op-on-unknown, live-while-closed
//      go()/place()/pose() (US6.2/T026), posed-boot determinism (two boots
//      byte-equal), zero console errors.
//   B. DEFAULT scripted boot byte-identity: no shell surface, no shell DOM,
//      no pill, the pre-031 boot pose triple, no ob-shell-v1 write, no
//      arrival-protocol claim (GH-715 review r5 P2: a window write).
//   C. real-user mover laws (§3): fresh settle arrives; interrupt-to-end
//      (pose-at-interrupt === end pose) via a REAL canvas pointerdown;
//      one-in-flight under an interrupt storm (last pick wins, the cut
//      lands the FIRST move's own end pose); reduced-motion instant snap;
//      aim-view gate (engaged aim view at move start → exact target pose,
//      re-engage blocked while the shell owns the camera); no AudioContext
//      traffic during the settle.
//   D. quick-play + escape grammar (§7 exit / FR-007): pointer AND
//      keyboard (Enter/Space) quick-play from every place — live state,
//      instant gameplay pose (never a wall pose), zero animated wait;
//      BALL_IN_HAND preservation (the 9-ball break address rides the boot);
//      WIN-continuation preservation (staged 9-pot → WIN → shell open →
//      auto-rerack completes UNDER the open shell); remember-option
//      round-trip (opt-in → reload → straight-to-AIM → opt-out → reload →
//      returning); fresh → immediate-quick-play → reload classifies
//      RETURNING (FR-006 first-arrival write, US2.5).
//   E. prop taps (FR-009: raycast + 44 pt screen-projected floor), FR-016
//      entry locks (shot in flight, shared-replay boot incl. the
//      pending-intent seam + rejected-link release, PLAYBACK borrow), the
//      GH-541 decision-entry amendment (pending decision = in-shell
//      answerable prompt, hud stand-down + reveal handoff, resolve via
//      the prompt), and the FR-017 input-isolation byte-unchanged
//      probes (full shell session → aim/cue/power/HUD/settings-blob state
//      identical; camera restored to the entry pose).
//   F. phone walker: real-user coarse boot (touch-cdp launchPhone,
//      tool:false) — shell chrome ≥ 44 pt both dimensions, rail single-row
//      within the viewport, touch quick-play exits to the table.
//   A2. equipment-place atelier arrival (032; shell.md §9 deviation 9):
//      the equipment arrival presents the atelier content (guarded dynamic
//      import); a rack tap while open AT the equipment place delegates to
//      the `cues` STATION (place unchanged — the ONE prop delegation);
//      table-bed taps keep the frozen 'play' mapping; with atelier.js
//      POISONED the S1 stub cards stand (cache-poison degrade) and the
//      rack tap keeps its S1 degenerate same-pose behavior. The §2
//      place-registry law is asserted UNCHANGED (arm A above passes as-is).
//   A3. place-content cache-poison degrade (GH-525 S4, protocol R3 — the
//      integrator-owned arm): per CONTENT place in registry order (play,
//      practice, replays) a CONTROL arrival mounts the module
//      (`ob-<place>-host`) and a POISONED arrival (the module import
//      refused through the per-place suites' Fetch seam) leaves the S1
//      stub standing with the shell operable and exactly the one refused
//      fetch in the log; a place with no CONTENT_MODULES row in this
//      tree's shell.js is skipped with a reason. Leg 4: one cross-place
//      reduced-motion journey (real-user fresh boot, play → practice →
//      equipment → replays → quick-play): the mover snaps at every arrival,
//      no card motion anywhere — and (GH-525 integrator 2026-09-05, shell.md
//      §9 entry 17) every rail arrival lands its card WHOLE: 0 S1-stub-visible
//      frames, content ≤ 2 frames after the click once the prefetch has
//      settled; then (entry 18, audit r2 finding 1) the SAME journey under
//      NORMAL motion: 0 stub frames from the click to content at every hop,
//      content inside the D6 window, "content" = PAINT truth (host + no stub
//      painting + a laid-out module child), never the stubs' attribute.
//      Leg 5: the same journey with every place module's response
//      HELD 400 ms at the Fetch seam (LAW 1 prefetch settles before the
//      hops; LAW 2 no stub frame) + a refused-practice.js positive control
//      proving the sampler sees a standing stub.
//   G. shell-open visual state (contract §7.1, owner fix round 2026-08-14):
//      while open — hall key lights live (obShellLight, camera layer 1),
//      live emitters dimmed ×0.85, cue rod + aim/preview family hidden,
//      bake bracket wrapped (suspendForBake round-trip restores AUTHORED
//      levels + gameplay visibilities for the bake, re-applies after);
//      after exit — emitter intensities exactly the pre-open bases, layer
//      mask restored, obShellLight out of the scene, cue/preview visible
//      again; a mid-open __rebakeEnv leaves the state intact. #1202: the
//      keys are dark on the exit frame itself; their join/leave (the group
//      + camera layer 1) is read once it settles (keysPending 0), since
//      main's __obStage may stage it. #1202 G3 (build 21; rows G3a/G3b/G3c in
//      web/tools/e2e-shell-g3cold.mjs, CDP +11, after G): covered FRESH boots
//      on fresh profiles (Chrome's shader cache cold): G3a as it comes, G3b
//      with shell.js held until ready with main's hold capped (the late
//      arrival), and G3c with an environment re-bake planted when the keys
//      first stand joined (the stall model's control). Each stalls by 1200 ms
//      the first draw inside a main-camera render with the keys in its light
//      set: at the overlay's exit class the keys are joined DARK with camera
//      layer 1 on, the stalled draw has run, a fence behind it has signalled
//      and the shell's draw record shows its own fence signalled; the open
//      adopts the keys. #1202 GW (batch 2; rows GW1-GW5 in
//      web/tools/e2e-shell-gw.mjs, CDP +11, after G3): with a held seam in
//      place of main's, a keys join or leave held when cinelight's studio
//      window opens moves nothing inside it, is handed over again once after
//      it, and then leaves the keys as with no export; with no window each
//      lands at once; a change compiled inside the window and applied after
//      it stays inert, and only the change handed over again lands (GW6).
//   Q. S4 journey-QA fix round (2026-09-06; issues GH-676/678/679/682/685),
//      every leg red-proven on main @ dabc57cf:
//      Q1 GH-678 — #ob-shell-open carries title + aria-label = t('shell.open')
//         from first paint (desktop boot, after a REAL Play now, phone boot);
//         the full AX tree has ZERO empty-named buttons; both follow setLocale.
//      Q2 GH-679 — a re-racking equipment pick in the SAME input task as the
//         gate's cutToEnd (REAL Enter on a focused rail card / a 0 ms mouse
//         click mid-flight) lands the camera ON the balls anchor (dist 0);
//         controls: canvas click mid-flight cuts to the anchor, a settled
//         pick leaves the pose untouched.
//      Q3 GH-682 — keyboard/mouse hall→table exits (Enter on Play now, the
//         switch-game confirm's Continue, Escape from the practice-opened
//         drills dialog, a real click on Play now) never leave focus on
//         <body> at any 50 ms sample; the successor is visible and the next
//         Tab is a live control.
//      Q3P GH-682 review r1 P2 — the same law with Element.checkVisibility
//         DELETED before boot (iOS 16–17.3 WKWebView) and #shoot disabled
//         (the WIN button law): the phone exit (touch.css hides #hud > .row)
//         lands a visible successor or the canvas, never a display:none
//         ancestor's child / <body>; the desktop control still prefers a
//         visible #hud control over the canvas.
//      Q3U GH-682 review r2 P2 — the same law with navigator.userActivation
//         DELETED before boot (iOS 16.0–16.3 WKWebView) and nothing focused
//         (the WebKit tap law: a button tap never moves focus — shimmed as a
//         default-prevented mousedown): a REAL Play now tap (phone) and Enter
//         at the root (desktop) land #shoot / a visible #hud control / the
//         canvas, never <body> (pre-fix: <body> on both arms).
//      Q4 GH-676 — the card hold (phone, REAL touch): rest-then-flick and a
//         1 px creep never fire; a 700 ms still hold commits ON RELEASE with
//         zero ghost clicks into the picker/DVR (drill state null, mode
//         unchanged); desktop lighting: a slow brightness drag / an 800 ms
//         hold on the thumb or the lux note never flips #ob-gear.
//      Q5 GH-685 — phone decision prompts (carom break_spot 2 options; 8-ball
//         dry_break 3 options at 844x390 and 667x375): #ob-spin-btn is
//         hidden/inert under the prompt, an elementFromPoint sweep at 4 px
//         never reaches it, seam taps never open #ob-spin-modal; after the
//         decision Spin is back and opens again.
//   H. strip SELECTION OUTRANKS HOVER (kit law; GH-525 integrator
//      2026-09-05): after a REAL rail click with the pointer left resting
//      on the pill (desktop) and after a REAL tap with no further input
//      (phone, sticky touch hover) the CURRENT pill's computed paint is the
//      accent fill (--ob-accent-dim-3 / --ob-accent-line), never the hover
//      rung's --ob-bg-2; a hovered NON-current pill still takes the hover
//      rung. Tokens resolve on a probe element in the same document.
//   R. GH-696 / GH-697 (S4 journey-QA round 2, link-recipient F1/F2): a
//      REAL share link boots a recipient (desktop 1440x900 + phone 844x390
//      coarse), the replay finishes, a REAL pill press opens the hall:
//      #ob-replay is hidden + inert under the open hall and REAL presses
//      where prev / next sat never re-run the replay under the open shell
//      (6 s of samples, never PLAYBACK && open); a REAL Play now from that
//      hall resolves the finished replay first (replay.active false,
//      #shoot enabled, no finished bar, a REAL cue-ball drag moves the
//      ball, no BIH instruction while Shoot is disabled).
//      Half 3 (review r1 P2, PR #706): with practice.js refused, the stub
//      Practice card's Free-practice action (exitToTable + changeMode
//      'playground' in one task) reaches mode playground on a live table
//      — the finished replay is torn down synchronously inside exitToTable.
//   K05. GH-668 B-K05 shell seam (S5 slice 2, the shell half): the shell
//      PUBLISHES its band geometry — __shell.bands(), five --ob-shell-*
//      px custom properties on #ob-shell + :root, body.ob-shell-stacked,
//      the ob:shell-bands event — and the values EQUAL the live rail /
//      quick-play rects ± 0.5 at rest, after a locale flip and after a
//      viewport resize on both registers; band T's corner-slot right edge
//      matches an independent probe on the touch.css tokens; a closed
//      shell reserves nothing. Arm body: ./e2e-shell-k05.mjs (importable,
//      so the seam has a fast standalone red proof); it reuses the +6
//      desktop / +5 phone slots after R — the inventory is unchanged.
//   G3. GH-668 B-SH05 / B-SH06 (S5 slice 2): the rail's settings segment is
//      an ICON segment wearing the toolbar gear's inlined mark (named by
//      aria-label + title, outside the roving set, a 44 square on fine
//      pointers / the strip's own 48 rung under a finger), the rail sits on
//      the SOLID rung (no blur, --ob-glass-solid on every register), and
//      #ob-shell-open LEADS the toolbar (tbOrder -1) as a labelled pill
//      (shell.hall, the kit text register, J3's 34 / 999 / one material)
//      on fine pointers and the 44 icon-only circle on coarse. Arm body:
//      ./e2e-shell-g3.mjs (same +6 / +5 slots after G2).
//   G4. GH-668 B-SH08 / B-PL05 (S5 slice 2, ruling R6): the shell's two
//      transient panels are the kit .ob-prompt registers — #ob-shell-note
//      = .ob-prompt--notice (key-stored copy that re-composes on a locale
//      flip, the --ob-info-line cue, balanced wrap, >= 10 px clear of the
//      rail / the quick-play stack through the B-K05 seam's lift, the
//      667 x 375 register) and #ob-shell-decision = .ob-prompt--routed
//      (h2 question <= 40 ch, caps hint 'chooser · citation', equal
//      NEUTRAL options with option 0 the focus anchor, the kit's top-centre
//      / right-band placement, coarse 44 answers). Arm body:
//      ./e2e-shell-g4.mjs (same +6 / +5 slots after G3).
//   XD. #1202 build 21 (the #1192 lens): camera=overhead with the register
//      applied before the shell opens and an unfadeable non-canopy fixture
//      inside it (the pre-381 shape, simulated): the exit's overhead re-home
//      refuses, and the restored entry pose must not stay over the fixture;
//      main's lamp-degrade recovery returns the rig to the orbit home. Arm
//      body: ./e2e-shell-xd.mjs (the +6 slot after G4).
//   S. GH-709 / GH-710 (S4 journey-QA round 3, sender-keeps-playing): the
//      sender's OWN tab after Share — the polite path writes nothing into
//      location; the clipboard-refused fallback writes `#r=` + the own-tab
//      sessionStorage marker; a reload (= tab restore) over an own hash
//      boots the NORMAL returning table (never blocked / PLAYBACK), the
//      next live shot drops the stale own link, a second Share re-mints; a
//      fresh-profile recipient still replays blocked-class. Desktop + phone.
//      review r3 (710): a recorded DECISION with no shot (the recorder's
//      annotate seam, where log.calls grows) drops the own link + marker
//      too; a recipient's #r= stays untouched.
//   T. GH-719 (keyboard-replay-reviewer): #ob-replay / the kernel-gate
//      banner are role=region + localized aria-label with a polite status,
//      first in body (≤ 2 Tabs from the document start), first control
//      focused on present; Exit / Dismiss / View anyway by Enter hand focus
//      to a visible successor (never <body>, next Tab never dead) over a
//      real link and a forged stale one (dist codec re-encode).
//   Q4M. #1168 fix-forward (2026-11, runs after Q4L): a still hold on the
//      practice column that the column's own motion cancels (an instant
//      scroll carries a control under the finger) releases inert in both
//      bands, short (held under HOLD_MS) and long (at or past it) on the
//      page's own clock: 0 clicks, the shell open, no picker, the settings
//      unchanged. A hold that only an unrelated scroller disarms (a test
//      box outside the section scrolls, the column still) still delivers
//      its tap: exactly 1 click, on the pressed element. Arm body:
//      e2e-shell-movedhold.mjs.
//
// Conventions per cdp.mjs suites: hermetic Chrome profiles, self-served
// web/, console error gates per arm. Needs Chrome + node ≥ 22.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, touchStart, touchMove, touchEnd, setPhoneMetrics } from './touch-cdp.mjs';
import { armK05 } from './e2e-shell-k05.mjs';
import { flipLocale, settledRead } from './lib/locale-settle.mjs';
import { armG2 } from './e2e-shell-g2.mjs';
import { armG3 } from './e2e-shell-g3.mjs';
import { armG3Cold } from './e2e-shell-g3cold.mjs';
import { armGW } from './e2e-shell-gw.mjs';
import { armG4 } from './e2e-shell-g4.mjs';
import { armXD } from './e2e-shell-xd.mjs';
import { armSwitch } from './e2e-shell-switch.mjs';
import { runQa3ShellArms } from './e2e-shell-qa3.mjs';
import { armMovedHold } from './e2e-shell-movedhold.mjs';
// GH-909 item 2 / GH-966 (B): Q5's seeded straight-to-table boots wait for the
// NEW document in its seeded state (lib/seed-reload.mjs), never a sleep
import { seedReload } from './lib/seed-reload.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** A shell law read from the SERVED app/shell.js (never authored here), e.g.
 * `ARRIVAL_HOLD_MS` (the arrival hold cap): the fixture judges against the
 * number the shell actually runs, so a law change cannot silently retire an
 * arm. */
const shellLaw = (name) => {
  const src = fs.readFileSync(path.join(webDir, 'app', 'shell.js'), 'utf8');
  const m = src.match(new RegExp('\\b' + name + ' = (\\d+(?:\\.\\d+)?)'));
  if (!m) throw new Error('e2e-shell: ' + name + ' not found in app/shell.js');
  return Number(m[1]);
};
const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
// run-gate band sizing (GH-410 law): one static server + CDP endpoints
// CDP_PORT..+9 (arms A..G + the 032 A2 atelier-arrival arm, one browser
// each; E reuses D's slot family; A2's two browsers run sequentially on +7;
// the GH-525 A3 place-content degrade legs run sequentially on +8 and its
// reduced-motion journey on +9 — ci.yml's e2e-shell band (web/tools/ci-bands.json:
// 19540-19649, CDP pinned at 19630) puts the cdp-12 tail at +11 = 19641 <= 19649; arm H reuses +6 and +5
// sequentially AFTER G and F have closed, and the Q arms (S4 fix round)
// reuse the same +6 desktop / +5 phone slots one browser at a time after
// H, so the inventory is unchanged)
// (+10/+11: the QA3 leg module e2e-shell-qa3.mjs — GH-711 / GH-713)
export const PORT_INVENTORY = { http: 1, cdp: 12 };
// SHARED_DEFAULT_WINDOW — the leg module declared this window at #705's landing; a window is an agreement on both files
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';
const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const EPS = 1e-9;
// pre-031 boot pose triple (the e2e-userboot arm-10 probe values)
const ORBIT_BOOT = { pos: [-1.8346, 1.3934, 1.4558], fov: 40 };

async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitShell(c, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('typeof window.__shell === "object"')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
/** Poll until the shell is open, landed, and posed at `id`'s anchor.
 * 100 × 150 ms: the fresh settle lands ~2 s into a healthy boot, but the
 * shared-runner storm class (GH-313) can stretch a real-user boot past a
 * 6 s window — the wider bound only changes how long a FAILING run takes
 * to report (a wrong pose never satisfies the predicate). */
async function waitLanded(c, id, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const ok = await c.eval(`(() => {
      const s = window.__shell;
      if (!s || !s.isOpen() || s.moving()) return false;
      if (s.place() !== '${id}') return false;
      const a = s.registry().find((p) => p.id === '${id}').anchor;
      const p = s.pose();
      return Math.abs(p.radius - a.radius) < ${EPS}
        && Math.abs(p.theta - a.theta) < ${EPS}
        && Math.abs(p.phi - a.phi) < ${EPS}
        && Math.abs(p.target[0] - a.tx) < ${EPS}
        && Math.abs(p.target[2] - a.tz) < ${EPS};
    })()`).catch(() => false);
    if (ok) return true;
    await sleep(150);
  }
  return false;
}
const atAnchorExpr = (id) => `(() => {
  const s = window.__shell;
  const a = s.registry().find((p) => p.id === '${id}').anchor;
  const p = s.pose();
  return Math.abs(p.radius - a.radius) < ${EPS}
    && Math.abs(p.theta - a.theta) < ${EPS}
    && Math.abs(p.phi - a.phi) < ${EPS};
})()`;
async function clickEl(c, sel) {
  const pt = await c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!pt) return false;
  await c.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  return true;
}
// #1202 build 21 (arm D's TEST RACE, the maintainer's ruling): the boot overlay can outlive the first ready read. On a tree with
// main's quiet term, a RETURNING open's key join re-arms ready until that state is drawn and fenced, and app.html fades only on
// a ready-true poll. A click on the overlay does nothing, so a click after a reload waits for its exit: #ob-boot removed, or
// carrying ob-boot--out with its pointer-events off.
async function waitOverlayGone(c, tries = 150) {
  for (let i = 0; i < tries; i++) {
    const gone = await c.eval(`(() => { const el = document.getElementById('ob-boot');
      return !el || (el.classList.contains('ob-boot--out') && getComputedStyle(el).pointerEvents === 'none'); })()`).catch(() => false);
    if (gone) return true;
    await sleep(100);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
}
const gateErrors = async (c, sink, tag) => {
  if (await c.eval('__test.errors.length').catch(() => 0)) {
    fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  }
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
};

// ---- A) obshell=1 scripted shell: posed boot + registry walk + __shell ----
{
  const errs = [];
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1`,
    { port: CDP_PORT, tool: false }); // the URL carries its own stamps
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('A: obshell boot never became ready');
  else if (!(await waitShell(c))) fail('A: obshell boot never exposed __shell');
  else {
    const boot = await c.eval(`(() => ({
      boot: __shell.state().boot, open: __shell.isOpen(),
      moving: __shell.moving(), place: __shell.place(),
      rail: document.querySelectorAll('#ob-shell-rail .ob-shell-place').length,
      cards: document.querySelectorAll('#ob-shell-cards > section').length,
      visible: [...document.querySelectorAll('#ob-shell-cards > section')]
        .filter((s) => !s.hidden).map((s) => s.dataset.place),
    }))()`);
    if (boot.boot !== 'scripted-shell' || !boot.open || boot.moving) {
      fail('A: obshell boot must open the shell INSTANTLY posed: '
        + JSON.stringify(boot));
    }
    if (boot.rail !== 4 || boot.cards !== 4 || boot.visible.length !== 1) {
      fail('A: chrome DOM shape wrong (4 rail places, 4 card sections, '
        + 'exactly one visible): ' + JSON.stringify(boot));
    }
    const pose1 = JSON.stringify(await c.eval('__shell.pose()'));
    // registry walk: every id via __shell.go — instant landing on the §2
    // anchor (scripted boots never animate), aria-current + card follow
    for (const id of ['practice', 'equipment', 'replays', 'play']) {
      const r = await c.eval(`(() => {
        const ret = __shell.go('${id}');
        const at = ${atAnchorExpr(id)};
        const cur = document.querySelector(
          '#ob-shell-rail [data-place="${id}"]').getAttribute('aria-current');
        const vis = [...document.querySelectorAll('#ob-shell-cards > section')]
          .filter((s) => !s.hidden).map((s) => s.dataset.place);
        return { ret, at, moving: __shell.moving(), cur, vis: vis.join() };
      })()`);
      if (r.ret !== id || !r.at || r.moving || r.cur !== 'true' || r.vis !== id) {
        fail(`A: registry walk at '${id}' broke the §2 law: ` + JSON.stringify(r));
      }
    }
    // no-op-on-unknown returns the active id, pose untouched
    const noop = await c.eval(`(() => {
      const before = JSON.stringify(__shell.pose());
      const ret = __shell.go('cue-room');
      return { ret, same: before === JSON.stringify(__shell.pose()),
        place: __shell.place() };
    })()`);
    if (noop.ret !== 'play' || !noop.same || noop.place !== 'play') {
      fail('A: unknown place id must be a no-op returning the active id: '
        + JSON.stringify(noop));
    }
    // live-while-closed (US6.2/T026): quick-play closes; go() poses for the
    // next open; place() reports it; openShell lands there
    const lwc = await c.eval(`(() => {
      const qp = __shell.quickPlay();
      const closedGo = __shell.go('replays');
      const place = __shell.place();
      const open = __shell.isOpen();
      __shell.openShell();
      const at = ${atAnchorExpr('replays')};
      return { qp, closedGo, place, open, reopened: __shell.isOpen(), at };
    })()`);
    if (!lwc.qp || lwc.closedGo !== 'replays' || lwc.place !== 'replays'
      || lwc.open || !lwc.reopened || !lwc.at) {
      fail('A: live-while-closed go()/place()/openShell broke: '
        + JSON.stringify(lwc));
    }
    // posed-boot determinism: a second boot poses byte-equal. The profile's
    // stored lastPlace is 'replays' at this point (the live-while-closed leg
    // landed there) — the reboot must IGNORE it and pose play (owner ruling
    // 2026-08-15: the opening pose is always Play; lastPlace is write-only
    // navigation memory), which also makes the pose profile-independent.
    await c.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=b2` });
    if (!(await waitReady(c)) || !(await waitShell(c))) {
      fail('A: obshell reboot never became ready');
    } else {
      const pose2 = JSON.stringify(await c.eval('__shell.pose()'));
      if (pose2 !== pose1) {
        fail(`A: obshell posed boot not deterministic: ${pose1} vs ${pose2}`);
      } else {
        console.log('A OK: obshell posed boot deterministic, registry walk + '
          + '__shell conformance green');
      }
    }
    await gateErrors(c, errs, 'A');
  }
  c.close();
}

// ---- A2) equipment-place atelier arrival + rack→cues delegation (032) ------
// #1106: A2 judges its camera reads inside ONE settled, RENDERED camera matrix. An instant move's orbit.apply() runs
// lookAt(), which updates the world matrices before it sets the quaternion, so matrixWorld / matrixWorldInverse keep the
// pre-turn orientation until the next rendered frame's updateMatrixWorld: an immediate projection read the stale pose and
// put the rack off-screen at load1 ~70 (main ci 38797287560). a2Settled waits inside a rAF loop for (1) the caller's
// logical pose, (2) camera.matrixWorld within A2_TOL per element of the parent's world matrix x compose(position,
// quaternion, scale), with matrixWorldInverse its inverse (the gate never calls updateMatrixWorld), (3) the same matrix
// on two consecutive frames and (4) a render since the pose was first seen (renderer.info.render.frame advanced), then
// evaluates the caller's judgement in that same callback. Bounded like the GH-1111 frame wait (A2_MIN_FRAMES frames AND
// A2_WAIT_MS, hard A2_HARD_MS, the hard cap also on its own timer); a camera that never settles is its own named FAIL,
// never retried, and the residuals print either way (a never-settled camera reads apart from a tolerance problem).
const A2_TOL = 1e-9, A2_MIN_FRAMES = 120, A2_WAIT_MS = 5000, A2_HARD_MS = 10000;
const a2Settled = (c, want, judge) => c.eval(`new Promise((resolve) => {
  const cam = window.__dbg.camera, R = window.__dbg.renderer, t0 = performance.now();
  const mul = (a, b) => { const o = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
      let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + row] * b[col * 4 + k]; o[col * 4 + row] = v; }
    return o; };
  let frames = 0, f0 = null, prev = null, last = null, raf = 0, done = false;
  // the hard cap runs on its OWN timer (#1106 review P2): if animation frames stop while JS and CDP still answer, a
  // rAF-only bound never fires and the eval waits for cdp.mjs's command deadline, which aborts the suite. The timer ends
  // the wait at A2_HARD_MS with the named never-settled result and cancels the loop. A timer is never a frame (the
  // settledRead law): it only ends the wait; the judgement runs inside a rAF tick or not at all
  const end = (r) => { if (done) return; done = true; clearTimeout(cap); cancelAnimationFrame(raf); resolve(r); };
  const cap = setTimeout(() => end({ settled: false, deadline: true, ...(last || { want: null, residual: NaN,
    inverseResidual: NaN, stable: false, renders: 0 }), frames, ms: Math.round(performance.now() - t0) }), ${A2_HARD_MS});
  const tick = () => {
    if (done) return;
    frames += 1;
    const want = !!(${want});
    const fr = R.info.render.frame;
    if (want && f0 === null) f0 = fr;
    const local = new cam.matrix.constructor().compose(cam.position, cam.quaternion, cam.scale).elements;
    const expect = cam.parent ? mul(cam.parent.matrixWorld.elements, local) : local;
    const mw = cam.matrixWorld.elements;
    const residual = Math.max(...mw.map((v, i) => Math.abs(v - expect[i])));
    const inverseResidual = Math.max(...mul(cam.matrixWorldInverse.elements, mw).map((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0))));
    const stable = prev !== null && mw.every((v, i) => Math.abs(v - prev[i]) <= ${A2_TOL});
    prev = mw.slice();
    const st = { want, residual, inverseResidual, stable, renders: f0 === null ? 0 : fr - f0, frames,
      ms: Math.round(performance.now() - t0) };
    last = st;
    if (want && fr > f0 && residual <= ${A2_TOL} && inverseResidual <= ${A2_TOL} && stable) {
      let result;
      try { result = (${judge}); } catch (e) { result = { error: String(e) }; }
      return end({ settled: true, ...st, result });
    }
    if ((frames >= ${A2_MIN_FRAMES} && st.ms >= ${A2_WAIT_MS}) || st.ms >= ${A2_HARD_MS}) return end({ settled: false, ...st });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
})`);
const a2SettleLine = (r) => `${r.frames} frame(s), ${r.ms} ms, renders +${r.renders}, matrix residual `
  + `${r.residual.toExponential(1)}, inverse residual ${r.inverseResidual.toExponential(1)}`;
// the equipment anchor, exactly (the A3 atA idiom: the logical pose AT the registry anchor, not merely the place)
const A2_AT_EQUIPMENT = `(() => { const s = window.__shell;
  if (s.place() !== 'equipment' || s.moving()) return false;
  const a = s.registry().find((p) => p.id === 'equipment').anchor, q = s.pose();
  return Math.abs(q.radius - a.radius) < ${EPS} && Math.abs(q.theta - a.theta) < ${EPS}
    && Math.abs(q.phi - a.phi) < ${EPS} && Math.abs(q.target[0] - a.tx) < ${EPS}
    && Math.abs(q.target[2] - a.tz) < ${EPS}; })()`;
// the rack clip-rail/shelf centre through THIS frame's matrices, and propAt at that point in the same task
const A2_RACK = `(() => {
  const v = [4.4525, 0.2, -0.53, 1];
  const xf = (e, p) => [
    e[0]*p[0] + e[4]*p[1] + e[8]*p[2] + e[12]*p[3],
    e[1]*p[0] + e[5]*p[1] + e[9]*p[2] + e[13]*p[3],
    e[2]*p[0] + e[6]*p[1] + e[10]*p[2] + e[14]*p[3],
    e[3]*p[0] + e[7]*p[1] + e[11]*p[2] + e[15]*p[3]];
  const h = xf(cam.projectionMatrix.elements, xf(cam.matrixWorldInverse.elements, v));
  const n = [h[0] / h[3], h[1] / h[3]];
  const x = (n[0] + 1) / 2 * innerWidth, y = (1 - n[1]) / 2 * innerHeight;
  const on = Math.abs(n[0]) < 1 && Math.abs(n[1]) < 1;
  return { x, y, on, hit: on ? window.__shell.propAt(x, y) : null };
})()`;
{
  const errs = [];
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=atelier`,
    { port: CDP_PORT + 7, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) {
    fail('A2: obshell boot never became ready');
  } else {
    await c.eval(`__shell.go('equipment'), true`);
    let mounted = false;
    for (let i = 0; i < 60 && !mounted; i++) {
      mounted = await c.eval('typeof window.__atelier === "object"')
        .catch(() => false);
      if (!mounted) await sleep(150);
    }
    if (!mounted) fail('A2: equipment arrival never presented the atelier');
    else {
      const shape = await c.eval(`({
        root: !!document.querySelector(
          'section[data-place="equipment"] #ob-atelier'),
        pills: document.querySelectorAll(
          '#ob-atelier-carousel [data-station]').length,
      })`);
      if (!shape.root || shape.pills !== 5) {
        fail('A2: atelier content missing at equipment arrival: '
          + JSON.stringify(shape));
      }
      // rack→cues delegation (§9 dev 9): a REAL primary tap on the rack
      // while AT the equipment place selects the cues STATION — the place
      // does not change and no place move is re-requested. #1106: the
      // projection and propAt read ONE settled, rendered camera matrix at the
      // equipment anchor (a2Settled), never the matrix of the frame before
      // the turn
      const rk = await a2Settled(c, A2_AT_EQUIPMENT, A2_RACK);
      if (!rk.settled) {
        fail('A2: the rendered camera never settled at the equipment anchor: ' + JSON.stringify(rk));
      } else {
        console.log(`A2 settle (rack): ${a2SettleLine(rk)}`);
      }
      const rack = rk.settled ? rk.result : null;
      if (rack && !rack.on) fail('A2: rack not on screen from the equipment anchor');
      else if (rack) {
        if (rack.hit !== 'equipment') {
          fail(`A2: propAt(rack) resolved '${rack.hit}', want equipment`);
        }
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: rack.x, y: rack.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: rack.x, y: rack.y, button: 'left', clickCount: 1 });
        await sleep(150);
        const tapped = await c.eval(`({ place: __shell.place(),
          station: __atelier.station(), moving: __shell.moving() })`);
        if (tapped.place !== 'equipment' || tapped.station !== 'cues'
          || tapped.moving) {
          fail('A2: rack tap AT equipment must select the cues station '
            + '(instant on obshell): ' + JSON.stringify(tapped));
        }
      }
      // table-bed taps KEEP the frozen 'play' mapping (a lawful atelier
      // exit) — asserted from the table station where the bed fills frame
      await c.eval(`__atelier.go('table'), true`);
      // the raycast reads the RENDERED camera: one settled matrix at the
      // table station (#1106; a fixed one-frame sleep is not a measurement)
      const bd = await a2Settled(c,
        `window.__atelier.station() === 'table' && !window.__shell.moving()`,
        'window.__shell.propAt(innerWidth / 2, innerHeight / 2)');
      if (!bd.settled) {
        fail('A2: the rendered camera never settled at the table station: ' + JSON.stringify(bd));
      } else {
        console.log(`A2 settle (bed): ${a2SettleLine(bd)}`);
        if (bd.result !== 'play') {
          fail(`A2: table-bed hit must keep the frozen 'play' mapping, got '${bd.result}'`);
        }
      }
      console.log('A2 OK: equipment arrival presents the atelier; rack→cues '
        + 'delegation; bed keeps play');
    }
    await gateErrors(c, errs, 'A2');
  }
  c.close();
}

// ---- A2b) atelier.js POISONED: the S1 stub cards stand (cache-poison) ------
{
  const errs = [];
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=atldeg`,
    { port: CDP_PORT + 7, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/app\/atelier\.js/.test(params.request.url)) {
      c.send('Fetch.failRequest', { requestId: params.requestId,
        errorReason: 'ConnectionRefused' }).catch(() => {});
    } else {
      c.send('Fetch.continueRequest', { requestId: params.requestId })
        .catch(() => {}); // cancelled request → benign "Invalid InterceptionId"
    }
  });
  // #1157: this first page boots from the spawn, and the shell's LAW 1 idle
  // prefetch can fetch atelier.js before the poison below is armed; the
  // poisoned navigation then got the renderer's cached copy with no Fetch
  // event and mounted the atelier (a3Poison's / leg 5's finding). The cache
  // is disabled first — Network.enable FIRST, or the agent never applies it
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*atelier.js*' }] });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=atldeg2`,
  });
  if (!(await waitReady(c)) || !(await waitShell(c))) {
    fail('A2b: degrade boot never became ready');
  } else {
    await c.eval(`__shell.go('equipment'), true`);
    await sleep(1200); // the failed guarded import settles
    const deg = await c.eval(`({
      atelier: typeof window.__atelier,
      root: !!document.querySelector('#ob-atelier'),
      stubsVisible: [...document.querySelectorAll(
        'section[data-place="equipment"] > *')]
        .filter((n) => n.tagName !== 'H2').some((n) => !n.hidden),
      place: __shell.place(),
      at: ${atAnchorExpr('equipment')},
    })`);
    if (deg.atelier !== 'undefined' || deg.root || !deg.stubsVisible
      || deg.place !== 'equipment' || !deg.at) {
      fail('A2b: with atelier.js poisoned the S1 stub cards must stand '
        + '(never a black page): ' + JSON.stringify(deg));
    } else {
      console.log('A2b OK: atelier.js poisoned → S1 stub-card degrade stands');
    }
    // ---- GH-534 G2 (round-2 QA): the stub action must NOT bury its own
    // remedy — pre-fix it opened the Game-settings modal (the equipment
    // pane migrated in S2) ON TOP of the honest reload hint the same
    // click that raised it. REAL click + DOM-occlusion + pixel asserts. --
    {
      const base = (await c.send('Page.captureScreenshot',
        { format: 'png' })).data;
      const pt = await c.eval(`(() => {
        const b = [...document.querySelectorAll(
          'section[data-place="equipment"] .ob-shell-actions button')]
          .find((x) => x.querySelector(
            '[data-i18n="shell.card.equipmentSettings"]'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (!pt) fail('A2b/G2: the stub equipment action is missing');
      else {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        const clickAt = Date.now(); // the hint transient is 3.5 s — every
        // later probe budgets against THIS wall clock (eval latency under
        // load pushed fixed-iteration probes past expiry; red-proven)
        // the modal must NEVER present — sampled over ~1.5 s wall
        let modalSeen = false;
        while (Date.now() - clickAt < 1500) {
          await sleep(150);
          if (await c.eval(`(document.getElementById('ob-settings')
            ?.getClientRects().length ?? 0) > 0`)) modalSeen = true;
        }
        const g2 = await c.eval(`(() => {
          const h = document.getElementById('hud-hint');
          const r = h?.getBoundingClientRect() ?? null;
          const stack = r ? document.elementsFromPoint(
            r.x + r.width / 2, r.y + r.height / 2) : [];
          return {
            hintVis: !!h && h.style.display === 'block'
              && h.getClientRects().length > 0,
            text: h?.textContent ?? null,
            wantText: window.__i18n.t('atelier.shim.stale'),
            buried: stack.some((el) => el.id === 'ob-settings'
              || el.className?.includes?.('ob-navmodal')
              || el.className?.includes?.('ob-mode-desc')),
            theater: document.body.classList.contains('ob-shell-theater'),
            rect: r && { x: r.x, y: r.y, w: r.width, h: r.height },
          }; })()`);
        if (modalSeen || !g2.hintVis || g2.text !== g2.wantText
          || g2.buried || g2.theater) {
          fail('A2b/G2: the stub action must land the UNBURIED reload '
            + 'hint, never the wrong modal: '
            + JSON.stringify({ modalSeen, g2 }));
        }
        // pixel capture IMMEDIATELY while the hint is provably up (g2
        // just read it visible); the ink compare is timing-safe
        const after = (await c.send('Page.captureScreenshot',
          { format: 'png' })).data;
        // perceivable dwell probe, wall-clock guarded: only meaningful
        // INSIDE the 3.5 s transient — under load the probes above can
        // consume the budget, in which case g2's own visible read (at
        // >=1.5 s post-click) already proved the dwell
        let dwell = { hint: true, modal: false, derived: true };
        if (Date.now() - clickAt < 2800) {
          const target = clickAt + 2000;
          const wait = target - Date.now();
          if (wait > 0) await sleep(wait);
          dwell = await c.eval(`({
            hint: document.getElementById('hud-hint')?.style.display === 'block',
            modal: (document.getElementById('ob-settings')
              ?.getClientRects().length ?? 0) > 0 })`);
        }
        const ink = await c.eval(`(async () => {
          const load = async (b64) => { const i = new Image();
            i.src = 'data:image/png;base64,' + b64; await i.decode();
            return i; };
          const a = await load('${base}'), b = await load('${after}');
          const grab = (img) => {
            const o = document.createElement('canvas');
            o.width = img.width; o.height = img.height;
            const g = o.getContext('2d'); g.drawImage(img, 0, 0);
            const kx = img.width / innerWidth, ky = img.height / innerHeight;
            return g.getImageData(Math.round(${g2.rect.x} * kx),
              Math.round(${g2.rect.y} * ky),
              Math.max(1, Math.round(${g2.rect.w} * kx)),
              Math.max(1, Math.round(${g2.rect.h} * ky))).data;
          };
          const da = grab(a), db = grab(b);
          let sum = 0;
          const n = Math.min(da.length, db.length) / 4;
          for (let i = 0; i < n * 4; i += 4) {
            sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1])
              + Math.abs(da[i + 2] - db[i + 2]);
          }
          return sum / n;
        })()`);
        if (ink < 6 || !dwell.hint || dwell.modal) {
          fail('A2b/G2: hint ink/dwell broke: '
            + JSON.stringify({ ink, dwell }));
        } else {
          console.log('A2b OK (G2): stub action lands the unburied reload '
            + 'hint — no wrong-destination modal, pixel ink + dwell');
        }
      }
      // GH-534 G4 desktop control: under the same poison the HUD cue row
      // stays the desktop remedy surface after a shell exit
      await c.eval('__shell.quickPlay(), true');
      await sleep(400);
      const cueRow = await c.eval(`(() => {
        const row = document.getElementById('cue-row');
        if (!row) return null;
        const r = row.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2, r.y + r.height / 2);
        return { rects: row.getClientRects().length,
          hit: row.contains(hit),
          opts: row.querySelector('select')?.options.length ?? 0 }; })()`);
      if (!cueRow || !cueRow.rects || !cueRow.hit || cueRow.opts < 2) {
        fail('A2b/G4: the desktop HUD cue row must stay the degrade '
          + 'equipment surface: ' + JSON.stringify(cueRow));
      }
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('A2b: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- A3) place-content cache-poison degrade, registry order (GH-525 S4 R3) --
// The integrator-owned arm (shared-file protocol R3: written ONCE here, never
// per lane). For every CONTENT place in registry order (equipment stays A2/
// A2b's business): CONTROL — an obshell boot arrives and the module mounts
// (R0 (g): the additive `ob-<place>-host` class); POISON — the SAME boot
// with the module import defeated through the SAME seam the per-place
// suites use (CDP Fetch interception → ConnectionRefused; e2e-play P1a /
// e2e-practice P-A2 / e2e-replays 0e, all copies of A2b above) → the S1
// stub surface stands (h2 + the place's own lines/actions + hold hint —
// mirrored by hand from shell.js's card builders, the mirrored-literal law),
// no host class, no module nodes/global, the shell stays OPERABLE (rail
// mover to the next place, quick-play pill present, exit + pill re-open),
// the FR-017 body hides hold, and the console carries EXACTLY the refused
// module fetch (nothing else). A place whose CONTENT_MODULES row is absent
// from THIS tree's shell.js is SKIPPED with a reason — detected at runtime
// from the source, never hard-coded — so the arm is honest on the
// integration branch before every lane has merged.
// Leg 4: one cross-place reduced-motion journey (the integration judge's
// gap) — a REAL-USER fresh boot under `prefers-reduced-motion: reduce`,
// play → practice → equipment → replays → quick-play through the rail
// buttons (then the same hops under normal motion — entry 18); a
// document-start rAF sampler proves the mover SNAPPED at every arrival (no
// intermediate pose frames, never `moving()`), and `getAnimations()` inside
// #ob-shell stays empty at every arrival (no card motion at any place).
let a3Fails = 0;
const a3fail = (msg) => { a3Fails += 1; fail(msg); };
// #966 family C: a fresh real-user boot's shell writes ob-shell-v1 ONCE, 24-34 ms after __test.ready (the #1090
// measurement, e2e-shell-qa3.mjs's 711/713 seed). A warm-up clear that lands before that write leaves it standing,
// and the judged boot classifies 'returning'. The warm-ups clear only after the write (bounded; a write that never
// comes is named as staging).
async function a3ClearAfterShellWrite(c, tag) {
  if (!(await a3wait(c, `localStorage.getItem('ob-shell-v1') !== null`, 50, 100))) {
    a3fail(`${tag}: staging — the warm-up shell never wrote ob-shell-v1`);
  }
  await c.eval('localStorage.clear(), true').catch(() => {});
}
const A3_PLACES = (() => {
  // the CONTENT_MODULES rows of the shell.js THIS server serves (the source
  // literal; a row absent here = the lane has not merged into this tree)
  try {
    const src = fs.readFileSync(path.join(webDir, 'app', 'shell.js'), 'utf8');
    const m = src.match(/const CONTENT_MODULES = \{([\s\S]*?)\n\};/);
    return m
      ? [...m[1].matchAll(/^\s*([a-z0-9_]+):\s*\[/gm)].map((x) => x[1])
      : null;
  } catch { return null; }
})();
// the S1 card surface per place (shell.js card builders, mirrored by hand):
// `lines` = `:scope > p.ob-shell-line` count, `actions` = the action label
// keys that must be VISIBLE with the module absent, `global` = the module's
// window seam that must stay undefined, `nodes` = the module's data-ob prefix
const A3_STUB = {
  play: { lines: 2, actions: ['shell.card.gameSettings'],
    global: '__play', nodes: 'play-' },
  practice: { lines: 0, actions: ['shell.card.drills', 'shell.card.playground'],
    global: '__practice', nodes: 'practice-' },
  replays: { lines: 0, actions: ['shell.card.replaysOpenVerb'],
    global: '__replays', nodes: 'replays-' },
};
/** The per-place suites' poison seam (e2e-play blockUrl / e2e-practice
 * poison / e2e-replays poison — all the A2b Fetch idiom): every request
 * whose URL matches `re` fails ConnectionRefused; the cache is disabled so
 * a module the first boot already fetched cannot be served from memory. */
async function a3Poison(c, re, pattern) {
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (re.test(params.request.url)) {
      c.send('Fetch.failRequest', { requestId: params.requestId,
        errorReason: 'ConnectionRefused' }).catch(() => {});
    } else {
      c.send('Fetch.continueRequest', { requestId: params.requestId })
        .catch(() => {}); // cancelled request → benign "Invalid InterceptionId"
    }
  });
  // GH-525 entry 17: the shell now PREFETCHES every place module in the
  // warm-up boot — Network.enable so setCacheDisabled actually bites (the
  // agent applies it; off, the heuristic disk cache serves the warm-up's
  // copy to the poisoned navigation with no Fetch event — leg 5's finding)
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}
/** Browser-level error log (Log.entryAdded, level error): the refused
 * module fetch surfaces HERE (a caught import() rejection never reaches
 * Runtime.exceptionThrown) — the arm asserts it is the ONLY entry. */
function a3WatchLog(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      sink.push(`${params.entry.source}: ${params.entry.text} `
        + `${params.entry.url ?? ''}`);
    }
  });
}
/** One in-page readout of a place's card + the shell posture. */
const a3Stub = (id) => `(() => {
  const sec = document.querySelector(
    '#ob-shell-cards > section[data-place="${id}"]');
  const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  const act = (k) => sec.querySelector(
    '.ob-shell-actions [data-i18n="' + k + '"]')?.closest('button');
  const h2 = sec.querySelector(':scope > h2');
  const hud = document.getElementById('hud');
  return {
    host: sec.classList.contains('ob-${id}-host'),
    h2: vis(h2) && h2.dataset.i18n === 'shell.place.${id}',
    lines: [...sec.querySelectorAll(':scope > p.ob-shell-line')]
      .filter(vis).length,
    actions: ${JSON.stringify(A3_STUB[id].actions)}.map((k) => vis(act(k))),
    // release ruling D3 (uiaudit F14): the hold hint STANDS (present, not
    // [hidden]) on every register but PAINTS only under a finger — fine
    // pointers keep it off the paint (shell.css (pointer: fine))
    hold: (() => { const h = sec.querySelector(':scope > p.ob-shell-hold');
      return !!h && !h.hidden && (matchMedia('(pointer: fine)').matches ? !vis(h) : vis(h)); })(),
    global: typeof window.${A3_STUB[id].global},
    nodes: sec.querySelectorAll('[data-ob^="${A3_STUB[id].nodes}"]').length,
    place: __shell.place(), open: __shell.isOpen(), moving: __shell.moving(),
    at: ${atAnchorExpr(id)},
    bodyOpen: document.body.classList.contains('ob-shell-open'),
    hudHidden: !hud || getComputedStyle(hud).visibility === 'hidden',
    pill: vis(document.getElementById('ob-shell-quickplay')),
  }; })()`;
{
  // registry order from a LIVE boot (never a hand list) minus equipment
  let order = null;
  {
    const c = await launchChrome(
      `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=a3reg`,
      { port: CDP_PORT + 8, tool: false });
    if (!(await waitReady(c)) || !(await waitShell(c))) {
      a3fail('A3: registry boot never became ready');
    } else {
      order = (await c.eval('__shell.registry().map((p) => p.id)'))
        .filter((id) => id !== 'equipment');
    }
    c.close();
  }
  if (!A3_PLACES) {
    a3fail('A3: CONTENT_MODULES literal not found in app/shell.js '
      + '(the source seam the skip rule reads)');
  }
  for (const id of order ?? []) {
    if (!A3_STUB[id]) {
      a3fail(`A3: no S1 stub contract mirrored for place '${id}' — extend A3_STUB`);
      continue;
    }
    if (!A3_PLACES?.includes(id)) {
      console.log(`A3 SKIP (${id}): no CONTENT_MODULES row for '${id}' in this `
        + `tree's app/shell.js (rows: ${JSON.stringify(A3_PLACES)}) — the lane `
        + 'has not merged here; leg not judged');
      continue;
    }
    const next = order[(order.indexOf(id) + 1) % order.length];
    const want = A3_STUB[id];
    const boot = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1`
      + `&seed=1&u=${u}`;
    const hostExpr = `document.querySelector('section[data-place="${id}"]')`
      + `.classList.contains('ob-${id}-host')`;
    // ---- CONTROL: the module mounts at the place's first arrival ----------
    {
      const f0 = a3Fails;
      const errs = [];
      const c = await launchChrome(boot(`a3ctl${id}`),
        { port: CDP_PORT + 8, tool: false });
      watchErrors(c, errs);
      if (!(await waitReady(c)) || !(await waitShell(c))) {
        a3fail(`A3 ${id} control: boot never became ready`);
      } else {
        await c.eval(`__shell.go('${id}'), true`);
        let mounted = false;
        for (let i = 0; i < 60 && !mounted; i++) {
          mounted = await c.eval(hostExpr).catch(() => false);
          if (!mounted) await sleep(150);
        }
        const ctl = await c.eval(a3Stub(id));
        if (!mounted || !ctl.host || ctl.global !== 'object'
          || ctl.place !== id || !ctl.at) {
          a3fail(`A3 ${id} control: the arrival must mount the module (host `
            + `class + window.${want.global}): ` + JSON.stringify(ctl));
        } else if (a3Fails === f0) {
          console.log(`A3 ${id} control OK: arrival mounted ob-${id}-host `
            + `(window.${want.global} live)`);
        }
        await gateErrors(c, errs, `A3 ${id} control`);
      }
      c.close();
    }
    // ---- POISON: the import defeated → the S1 stub stands, shell operable --
    {
      const f0 = a3Fails;
      const errs = [];
      const log = [];
      const c = await launchChrome(boot(`a3deg${id}0`),
        { port: CDP_PORT + 8, tool: false });
      watchErrors(c, errs);
      a3WatchLog(c, log);
      const modRe = new RegExp(`/app/${id}\\.js(\\?|$)`);
      await a3Poison(c, modRe, `*${id}.js*`);
      await c.send('Page.navigate', { url: boot(`a3deg${id}`) });
      if (!(await waitReady(c)) || !(await waitShell(c))) {
        a3fail(`A3 ${id} poison: degrade boot never became ready`);
      } else {
        await c.eval(`__shell.go('${id}'), true`);
        await sleep(1500); // the refused guarded import settles (A2b/P1a/0e)
        // #878: the stub's actions follow their own seams — practice's drills action shows once drills.js (a
        // separate guarded import at boot) has published window.__drills, and the card re-reads it on the shell's
        // 2 s summary refresh — so the surface is read once it stands, bounded at 10 s (a surface that never
        // stands is judged exactly as before); the readout names the drills seam
        let s = await c.eval(a3Stub(id));
        for (let i = 0; i < 50 && !(s.h2 && s.lines === want.lines && s.actions.every(Boolean) && s.hold); i++) {
          await sleep(200);
          s = await c.eval(a3Stub(id));
        }
        s.drillsSeam = await c.eval('typeof window.__drills?.open').catch(() => 'unreadable');
        if (s.host || s.global !== 'undefined' || s.nodes !== 0) {
          a3fail(`A3 ${id} poison: with ${id}.js refused the module must NOT `
            + `mount (no ob-${id}-host, no window.${want.global}, no `
            + `${want.nodes}* nodes): ` + JSON.stringify(s));
        }
        if (!s.h2 || s.lines !== want.lines || !s.actions.every(Boolean)
          || !s.hold) {
          a3fail(`A3 ${id} poison: the S1 stub surface must stand (h2 + `
            + `${want.lines} line(s) + ${want.actions.join('/')} + hold `
            + 'hint): ' + JSON.stringify(s));
        }
        if (s.place !== id || !s.open || s.moving || !s.at || !s.pill
          || !s.bodyOpen || !s.hudHidden) {
          a3fail(`A3 ${id} poison: the shell must stay posed at ${id}, open, `
            + 'quick-play present, FR-017 body hides holding: '
            + JSON.stringify(s));
        }
        // operable: the RAIL button (real user path) moves to the next place
        if (!(await clickEl(c, `#ob-shell-rail [data-place="${next}"]`))) {
          a3fail(`A3 ${id} poison: rail button for '${next}' unreachable`);
        }
        const mv = await c.eval(`({ place: __shell.place(),
          at: ${atAnchorExpr(next)}, moving: __shell.moving(),
          vis: [...document.querySelectorAll('#ob-shell-cards > section')]
            .filter((x) => !x.hidden).map((x) => x.dataset.place).join() })`);
        if (mv.place !== next || !mv.at || mv.moving || mv.vis !== next) {
          a3fail(`A3 ${id} poison: the mover to the next place ('${next}') `
            + 'must still work: ' + JSON.stringify(mv));
        }
        await c.eval(`__shell.go('${id}'), true`);
        // exit through quick-play (the §7 exit), then Back through the pill
        if (!(await clickEl(c, '#ob-shell-quickplay'))) {
          a3fail(`A3 ${id} poison: quick-play pill unreachable`);
        }
        let closed = false;
        for (let i = 0; i < 20 && !closed; i++) {
          closed = await c.eval('__shell.isOpen() === false && '
            + '!document.body.classList.contains("ob-shell-open")')
            .catch(() => false);
          if (!closed) await sleep(100);
        }
        if (!closed) {
          a3fail(`A3 ${id} poison: quick-play must exit the degraded shell `
            + '(isOpen false, body class off)');
        }
        if (!(await clickEl(c, '#ob-shell-open'))) {
          a3fail(`A3 ${id} poison: the re-open pill is unreachable after exit`);
        }
        let back = null;
        for (let i = 0; i < 40 && !back; i++) {
          back = await c.eval(`(() => { const s = window.__shell;
            if (!s.isOpen() || s.moving()) return null;
            s.go('${id}'); return ${a3Stub(id)}; })()`).catch(() => null);
          if (!back) await sleep(150);
        }
        if (!back || back.host || !back.actions.every(Boolean) || !back.h2
          || !back.at || !back.bodyOpen) {
          a3fail(`A3 ${id} poison: Back (pill re-open) must re-present the `
            + `standing stub at ${id}: ` + JSON.stringify(back));
        }
        // the console: EXACTLY the refused module fetch, nothing else
        const foreign = log.filter((l) => !modRe.test(l));
        if (!log.length || foreign.length) {
          a3fail(`A3 ${id} poison: the browser log must carry the refused `
            + `${id}.js fetch and NOTHING else: ` + JSON.stringify(
              { expected: log.length - foreign.length,
                foreign: foreign.slice(0, 3) }));
        }
        await gateErrors(c, errs, `A3 ${id} poison`);
        if (a3Fails === f0) {
          console.log(`A3 ${id} poison OK: ${id}.js refused → S1 stub stands, `
            + `shell operable (rail → ${next}, quick-play exit, pill back), `
            + 'body hides hold, log = the one refused fetch');
        }
      }
      c.close();
    }
  }
}

// The per-frame CARD readout the leg-4/leg-5 samplers fold into every frame
// (GH-525 integrator 2026-09-05 — shell.md §9 entry 17, the arrival laws):
// `stub` = the active place's S1 stub CONTENT (direct summary lines / action
// wraps — the H2 and the hold hint are shell chrome) is PAINT-visible this
// frame (section un-hidden, visibility not hidden, a stub node laid out);
// `content` = the section is visible with the stubs retired and the module's
// host class on ('ob-atelier-host' is equipment's — S2 naming); `held` = the
// shell's arrival hold is on this place this frame.
const A3_CARD = `window.__a3card = (id) => {
  const sec = document.querySelector(
    '#ob-shell-cards > section[data-place="' + id + '"]');
  if (!sec) return { secVis: false, stub: false, content: false, held: false };
  const cs = getComputedStyle(sec);
  const secVis = !sec.hidden && cs.visibility !== 'hidden'
    && cs.display !== 'none';
  const stubs = [...sec.querySelectorAll(
    ':scope > p.ob-shell-line, :scope > .ob-shell-actions')];
  // entry 18: a STUB frame is paint truth — never gated on the attribute
  // (a [hidden] .ob-shell-actions wrap still paints under shell.css's own
  // display:flex until the module's sheet lands; the r2 audit's flash was
  // exactly that, and the entry-17 sampler's '!el.hidden' clause was blind
  // to it: pre-fix stash run 16684878 read 'vvvvvCCC' where the pixels
  // showed the stub)
  const stub = secVis && stubs.some((el) =>
    getComputedStyle(el).display !== 'none'
    && el.getClientRects().length > 0);
  const host = sec.classList.contains('ob-' + id + '-host')
    || (id === 'equipment' && sec.classList.contains('ob-atelier-host'));
  // entry 18 (combined audit r2 finding 1): CONTENT is paint truth — the
  // host owns the section, no stub node paints, and a module-owned direct
  // child (not the H2 / hold hint / stub nodes) is laid out with a box.
  // (Before: host + every stub [hidden] — the attribute lied for the
  // atelier, whose stub kill rides its sheet.)
  const laid = [...sec.children].some((el) => el.tagName !== 'H2'
    && !el.classList.contains('ob-shell-hold') && !stubs.includes(el)
    && !el.hidden && getComputedStyle(el).display !== 'none'
    && el.getBoundingClientRect().width > 0
    && el.getBoundingClientRect().height > 0);
  const content = secVis && host && stubs.length > 0
    && !stubs.some((el) => getComputedStyle(el).display !== 'none'
      && el.getClientRects().length > 0) && laid;
  // entry 19 (combined audit r3 finding 1): the replays CARD REGION as the
  // settled-frame method sees it — the empty sentence's PAINT, the latest
  // body, the rail rows and the geometry the sheet + register settle
  // (rail top / height, section height): a frame equals the settled frame
  // only when every one of these does
  const paints = (el) => !!el && getComputedStyle(el).display !== 'none'
    && el.getClientRects().length > 0;
  const rail = document.getElementById('ob-replays-rail');
  const rb = rail ? rail.getBoundingClientRect() : null;
  const rep = id !== 'replays' ? {} : {
    empty: secVis && paints(sec.querySelector('#ob-replays-actions .ob-replays-empty')),
    latestOn: secVis && paints(document.getElementById('ob-replays-latest')),
    rows: document.querySelectorAll('#ob-replays-list .ob-pb-row').length,
    railVis: !!rail && !rail.hidden && paints(rail),
    railTop: rb ? Math.round(rb.top) : -1, railH: rb ? Math.round(rb.height) : -1,
    secH: Math.round(sec.getBoundingClientRect().height) };
  return { secVis, stub, content, t: performance.now(), ...rep,
    held: window.__shell?.contentState?.().hold === id };
};`;
// the module's host class on the place section (R0 (g) `ob-<id>-host`; the
// S2 atelier predates R0 and keeps `ob-atelier-host`)
const hostClassOf = (id) => (id === 'equipment' ? 'ob-atelier-host' : `ob-${id}-host`);
// ---- archive fixture (PORTED from capture-525-shell.mjs `seedArchive` —
// the e2e-playback fire() helper law; entry 19). The journeys tool seeds
// THREE real sessions across TWO day groups in a PRIOR REAL SESSION of the
// same profile: runner shots through `__test.shoot` (one session per
// seed-bearing rerack, archive.js tap 1), `__archive.flush()`, the oldest
// session back-dated in the archive's own IndexedDB meta store. The
// archive is IndexedDB (`ob-archive-v1`), so it survives the localStorage
// wipe that keeps the judged boot FRESH. ------------------------------------
const a3wait = async (c, expr, tries = 60, ms = 150) => {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
};
// GH-966 fix 4: the A3 rail arms judge at least A3_MIN_FRAMES sampled frames at the place. A fixed sleep before the
// read delivered 2-5 frames on the loaded CI box (main 37938647928 / 38180099297 / 38352665680: rm→equipment 3/3/5,
// dl→replays 3/4/4, dl→practice 2), and the floor failed with every content field clean. After the same sleep the
// arms now WAIT for the frames: bounded by the event (the sampler has recorded A3_MIN_FRAMES frames at the place since
// the mark) and a cap that runs out only once BOTH 60 animation frames and A3_FRAMES_WAIT_MS have passed (the GH-1111
// bound: a long task passes time without frames, fast frames pass frames without time) or after A3_FRAMES_HARD_MS
// whatever the frames do (a page that stopped producing them). A calm box reads what it read before; a loaded one
// reads more frames, never fewer. The floor stays, so a run-out is still red, and every content law judges the same
// frames as before.
const A3_MIN_FRAMES = 6, A3_FRAMES_WAIT_MS = 2000, A3_FRAMES_HARD_MS = 10000;
const a3FramesWait = (count) => `(async () => {
  const t0 = performance.now(); let ticks = 0, n = ${count};
  while (n < ${A3_MIN_FRAMES}) {
    const ms = performance.now() - t0;
    if ((ticks >= 60 && ms >= ${A3_FRAMES_WAIT_MS}) || ms >= ${A3_FRAMES_HARD_MS}) break;
    if (await new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(false), 250); })) ticks++;
    n = ${count};
  }
  return { n, ticks, ms: Math.round(performance.now() - t0) };
})()`;
const a3SinceMark = (id) => `window.__a3.samples.slice(window.__a3.mark ?? 0).filter((q) => q.place === '${id}').length`;
const a3Load = () => os.loadavg()[0].toFixed(1);
const A3_SHOTS = [{ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 },
  { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 }];
const A3_BACKDATE_MS = 50 * 3600e3; // two calendar days → a real date label
async function seedArchive(c, n, older) {
  if (!(await a3wait(c, 'typeof window.__archive === "object" && !!window.__archive'
    + ' && window.__archive.enabled?.() === true', 80, 150))) {
    throw new Error('the archive seam is absent or disarmed on the warm document (12 s)');
  }
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      await c.eval(`__test.rerack(${100 + i}), true`);
      await a3wait(c, `__test.state() === 'AIM' || __test.state() === 'BALL_IN_HAND'`, 60, 200);
    }
    let err = null;
    for (let k = 0; k < 20; k++) {
      err = await c.eval(`__test.shoot(${JSON.stringify(A3_SHOTS[i % 2])})`);
      if (!err || !/aiming state/.test(String(err))) break;
      await sleep(500);
    }
    if (err) throw new Error(`fixture shot ${i + 1} rejected: ${err}`);
    if (!(await a3wait(c, `!['PLAYBACK', 'SIMULATING'].includes(__test.state())`, 200, 300))) {
      throw new Error(`fixture shot ${i + 1} never settled`);
    }
  }
  await c.eval('window.__archive.flush()');
  const metas = await c.eval('window.__archive.sessions()');
  if (metas.length < n) throw new Error(`expected ${n} sessions, archive lists ${metas.length}`);
  const ids = metas.slice(metas.length - older).map((m) => m.id);
  const backdated = await c.eval(`(async () => {
    const d = await new Promise((res, rej) => { const q = indexedDB.open('ob-archive-v1');
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const tx = d.transaction('sessions', 'readwrite');
    const st = tx.objectStore('sessions');
    let k = 0;
    for (const id of ${JSON.stringify(ids)}) {
      const m = await new Promise((res) => { const g = st.get(id);
        g.onsuccess = () => res(g.result); g.onerror = () => res(null); });
      if (!m) continue;
      m.startTs = (m.startTs ?? Date.now()) - ${A3_BACKDATE_MS};
      if (typeof m.endTs === 'number') m.endTs -= ${A3_BACKDATE_MS};
      st.put(m); k += 1;
    }
    await new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
    d.close();
    return k;
  })()`);
  if (backdated !== older) throw new Error(`back-dated ${backdated} of ${older} sessions`);
  return { sessions: metas.length, seeded: n, backdated };
}
// ---- A3 leg 4) cross-place reduced-motion journey (real-user boot) --------
{
  const f0 = a3Fails;
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=a3rm0`,
    { port: CDP_PORT + 9, tool: false });
  watchErrors(c, errs);
  // reduced motion from the FIRST frame of the judged boot + the sampler:
  // one rAF loop from document start recording every open-shell frame's
  // pose/place/moving and any Web Animation whose target lives in #ob-shell
  await c.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `${A3_CARD}(() => {
    const S = window.__a3 = { samples: [], anims: [] };
    const tick = () => {
      const s = window.__shell;
      if (s && s.isOpen()) {
        const p = s.pose();
        S.samples.push({ place: s.place(), moving: s.moving(),
          radius: p.radius, theta: p.theta, phi: p.phi,
          tx: p.target[0], tz: p.target[2], ...__a3card(s.place()) });
        const root = document.getElementById('ob-shell');
        for (const a of document.getAnimations()) {
          const el = a.effect?.target;
          if (el && root && root.contains(el)) {
            S.anims.push((el.id ? '#' + el.id
              : '.' + String(el.className).split(' ')[0])
              + ':' + (a.transitionProperty ?? a.animationName
                ?? a.constructor.name) + '@' + s.place());
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()` });
  // the warm-up boot wrote ob-shell-v1; wipe it so the JUDGED boot is FRESH
  // (the animated settle class) under reduced motion
  if (!(await waitReady(c))) a3fail('A3 rm: warm-up boot never became ready');
  await a3ClearAfterShellWrite(c, 'A3 rm');
  await c.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?u=a3rm` });
  const PROBE = (id) => `(() => {
    const S = window.__a3; const s = window.__shell;
    const a = s.registry().find((p) => p.id === '${id}').anchor;
    const atA = (q) => Math.abs(q.radius - a.radius) < ${EPS}
      && Math.abs(q.theta - a.theta) < ${EPS}
      && Math.abs(q.phi - a.phi) < ${EPS}
      && Math.abs(q.tx - a.tx) < ${EPS} && Math.abs(q.tz - a.tz) < ${EPS};
    const since = S.samples.slice(S.mark ?? 0);
    const mine = since.filter((q) => q.place === '${id}');
    return { boot: s.state().boot, place: s.place(), moving: s.moving(),
      frames: mine.length, offAnchor: mine.filter((q) => !atA(q)).length,
      movingFrames: since.filter((q) => q.moving).length,
      anims: S.anims.splice(0),
      host: document.querySelector('section[data-place="${id}"]')
        .classList.contains('${hostClassOf(id)}'),
      // the arrival laws (entry 17): stub-visible frames since the mark,
      // frames from the mark to the first whole-card frame, held frames,
      // and whether the prefetch had settled this module before the mark
      stubFrames: mine.filter((q) => q.stub).length,
      toContent: mine.findIndex((q) => q.content),
      heldFrames: mine.filter((q) => q.held).length,
      settled: !!s.contentState?.().settled.includes('${id}') };
  })()`;
  const markExpr = 'window.__a3.mark = window.__a3.samples.length, true';
  if (!(await waitReady(c)) || !(await waitShell(c))) {
    a3fail('A3 rm: judged boot never became ready');
  } else if (!(await waitLanded(c, 'play'))) {
    a3fail('A3 rm: the fresh boot never landed play');
  } else {
    // entry 18: EQUIPMENT joins the judged hops (registry order) — the r2
    // audit's surviving stub flash lived there
    const hops = ['practice', 'equipment', 'replays'].filter((id) => {
      if (A3_PLACES?.includes(id)) return true;
      console.log(`A3 rm SKIP hop → ${id}: no CONTENT_MODULES row in this `
        + "tree's app/shell.js");
      return false;
    });
    const judge = async (id, how) => {
      // settle: a mounted place gets its bounded mount window (the module's
      // first-arrival import), then ~12 frames of stillness are sampled
      for (let i = 0; i < 40; i++) {
        const host = await c.eval(`document.querySelector(
          'section[data-place="${id}"]').classList.contains('${hostClassOf(id)}')`);
        if (host) break;
        await sleep(150);
      }
      await sleep(250);
      const wait = await c.eval(a3FramesWait(a3SinceMark(id)));
      const r = { ...(await c.eval(PROBE(id))), wait, load1: a3Load() };
      if (r.place !== id || r.moving || r.frames < A3_MIN_FRAMES || r.offAnchor
        || r.movingFrames || r.anims.length) {
        a3fail(`A3 rm ${how} → ${id}: the mover must SNAP (no off-anchor `
          + 'frames, never moving) and no card motion: ' + JSON.stringify(r));
      } else if (how === 'rail' && (r.stubFrames || r.toContent < 0
        || (r.settled && r.toContent > 2))) {
        // entry 17 (combined audit r1 finding 4): a rail arrival never
        // paints the S1 stub, and with the prefetch settled the whole card
        // lands within 2 frames of the click (the reduced-motion snap law)
        a3fail(`A3 rm ${how} → ${id}: the card must land WHOLE — 0 stub `
          + 'frames and content ≤ 2 frames after the click (prefetch '
          + `settled=${r.settled}): ` + JSON.stringify(r));
      } else {
        console.log(`A3 rm ${how} → ${id} OK: ${r.frames} frames all on the `
          + `anchor, 0 moving, 0 animations, host=${r.host}, stub frames `
          + `${r.stubFrames}, content at frame ${r.toContent} (held `
          + `${r.heldFrames}, prefetch settled=${r.settled}; frame wait `
          + `+${wait.ms} ms, load1 ${r.load1})`);
      }
      return r;
    };
    const first = await judge('play', 'fresh boot');
    if (first.boot !== 'fresh') {
      a3fail(`A3 rm: the judged boot must classify fresh (got '${first.boot}')`);
    }
    for (const id of hops) {
      await c.eval(markExpr);
      if (!(await clickEl(c, `#ob-shell-rail [data-place="${id}"]`))) {
        a3fail(`A3 rm: rail button '${id}' unreachable`);
        continue;
      }
      const snap = await c.eval(`({ place: __shell.place(),
        moving: __shell.moving(), at: ${atAnchorExpr(id)} })`);
      if (snap.place !== id || snap.moving || !snap.at) {
        a3fail(`A3 rm rail → ${id}: not posed in the click's own task: `
          + JSON.stringify(snap));
      }
      await judge(id, 'rail');
    }
    await c.eval(markExpr);
    if (!(await clickEl(c, '#ob-shell-quickplay'))) {
      a3fail('A3 rm: quick-play pill unreachable');
    }
    await sleep(300);
    const qp = await c.eval(`({ open: __shell.isOpen(),
      moving: __shell.moving(),
      body: document.body.classList.contains('ob-shell-open'),
      movingFrames: window.__a3.samples.slice(window.__a3.mark)
        .filter((q) => q.moving).length,
      anims: window.__a3.anims.splice(0),
      hud: getComputedStyle(document.getElementById('hud')).visibility })`);
    if (qp.open || qp.moving || qp.body || qp.movingFrames || qp.anims.length
      || qp.hud === 'hidden') {
      a3fail('A3 rm quick-play: must exit instantly with no animation and '
        + 'the gameplay chrome back: ' + JSON.stringify(qp));
    } else {
      console.log('A3 rm quick-play OK: instant exit, 0 moving frames, '
        + '0 animations, hud back');
    }
    // ---- LATE pass (issue #811; first written 2026-09-14 — the #770 CI read of this leg: `A3 rm rail
    // → equipment` stub 52 / held 15 / toContent 67 / settled=true, green in
    // the retry; main's own `A3 dl / motion rail → practice`, 4 of its last 5
    // jobs): the prefetch makes a hop WHOLE only by fetching what the paint
    // WAITS ON — each place's SHEET (play gates its mount on play.css,
    // practice reveals on practice.css, the atelier's stub kill rides
    // atelier.css; replays already prefetched its own) — not the module
    // alone. The law under test, for the three places the idle prefetch
    // queue warms (the census found two defects and one place already
    // correct; an arm on one guards a third of them):
    //     settled(id)  ⇒  the sheet of id is in the document (REQUESTED),
    //                      and at that place's click, LOADED
    // The two halves are SPLIT deliberately. `settled` means the IMPORT
    // settled (the shell's contentState().settled — a published wait
    // condition; predicates in this file and capture-525-shell read it) and the LAW 1 hook that
    // links the sheet runs one microtask LATER, so "settled ⇒ LOADED" is
    // false by construction on EVERY tree, fixed or not: it would be a row
    // that cannot pass, not an arm. Request latency of 2 × ARRIVAL_HOLD_MS
    // (the served shell's hold cap — the number the stub would paint from;
    // read by shellLaw, not authored) is applied BEFORE a fresh
    // reduced-motion boot, so the opening place is under it too; a 50 ms
    // poll records, for every place, whether its sheet was IN THE DOCUMENT
    // at the first instant `settled` reported it (the load-bearing ORDERING
    // check — a calm pass wins the race without it). Then each rail hop
    // asserts LOADED at its click, with the arrival law (0 stub frames,
    // content ≤ 2 frames) as corroboration.
    // play is REPORTED, NEVER judged: the opening pose is always Play (owner
    // ruling 2026-08-15) and the shell's mountContent chains the factory
    // on the same import promise the hook rides, so LAW 1 cannot advance
    // play's sheet and no fix on this seam can flip that row. Its remedy is
    // a document-level preload in app.html — a different gate
    // (e2e-userboot-firstframe), tracked as its own issue.
    // Pre-fix: settled=true with NO link at all (practice, equipment), held
    // 15–16 frames at the cap, then the stub (round9 lab, latency 400 /
    // 1000 ms); replays already correct, standing as the negative control.
    // The refused case stays on the poison legs above (the cache-poison
    // contract: stubs stand).
    {
      const lateMs = 2 * shellLaw('ARRIVAL_HOLD_MS');
      const SHEET_LINK_ID = { play: 'ob-play-css', practice: 'ob-practice-css', equipment: 'ob-atelier-css', replays: 'ob-replays-css' };
      const all = ['play', ...hops];
      const f1 = a3Fails;
      await c.eval('localStorage.clear(), true').catch(() => {});
      await c.send('Network.enable');
      await c.send('Network.emulateNetworkConditions',
        { offline: false, latency: lateMs, downloadThroughput: -1, uploadThroughput: -1 });
      await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=a3late` });
      // the ordering census: first sight of settled(id) → was the sheet loaded then?
      const sight = {};
      const readSight = `(() => { const st = window.__shell && window.__shell.contentState ? window.__shell.contentState() : null;
        if (!st) return null; const out = {};
        for (const [id, lid] of Object.entries(${JSON.stringify(SHEET_LINK_ID)})) {
          const l = document.getElementById(lid);
          out[id] = { settled: st.settled.includes(id), link: !!l, sheet: !!(l && l.sheet) };
        } return out; })()`;
      const t0 = Date.now();
      let landed = false;
      while (Date.now() - t0 < 40000) {
        const s = await c.eval(readSight).catch(() => null);
        if (s) {
          for (const id of all) {
            if (s[id].settled && !sight[id]) sight[id] = { ...s[id], atMs: Date.now() - t0 };
          }
          if (!landed) landed = await c.eval(atAnchorExpr('play') + " && __shell.isOpen() && !__shell.moving()").catch(() => false);
          if (landed && all.every((id) => sight[id])) break;
        }
        await sleep(50);
      }
      if (!landed) {
        a3fail(`A3 late: the fresh boot never landed play under ${lateMs} ms latency (40 s)`);
      } else if (!all.every((id) => sight[id])) {
        a3fail(`A3 late: prefetch never settled ${all.filter((id) => !sight[id]).join('/')} under ${lateMs} ms latency (40 s): ${JSON.stringify(sight)}`);
      } else {
        { // play: measured and printed, never judged (see the header)
          const g = sight.play;
          console.log(`A3 late play REPORTED (not judged): link ${g.link} / loaded ${g.sheet} at the first sight of settled`
            + ` (${g.atMs} ms after the boot, latency ${lateMs} ms) — the opening place's sheet is out of LAW 1's reach`);
        }
        for (const id of hops) {
          const g = sight[id];
          if (!g.link) {
            a3fail(`A3 late ${id}: settled reported with the sheet of the place ABSENT from the document `
              + `(settled ⇒ the sheet was REQUESTED is the law; ${g.atMs} ms after the boot, latency ${lateMs} ms): ${JSON.stringify(g)}`);
          } else {
            console.log(`A3 late ${id} OK: sheet requested by the first sight of settled (loaded then: ${g.sheet}; `
              + `${g.atMs} ms after the boot, latency ${lateMs} ms)`);
          }
        }
        for (const id of hops) {
          const linkBefore = await c.eval(`(() => { const l = document.getElementById(${JSON.stringify(SHEET_LINK_ID[id])});
            return l ? { sheet: !!l.sheet } : null; })()`);
          await c.eval(markExpr);
          if (!(await clickEl(c, `#ob-shell-rail [data-place="${id}"]`))) {
            a3fail(`A3 late: rail button ${id} unreachable`);
            continue;
          }
          const r = await judge(id, 'rail');
          if (!linkBefore || !linkBefore.sheet) {
            a3fail(`A3 late rail → ${id}: the sheet of the place must be in the document and LOADED before the click `
              + `(prefetch settled=${r.settled}, latency ${lateMs} ms): link ${JSON.stringify(linkBefore)}`);
          } else {
            console.log(`A3 late rail → ${id} OK: sheet loaded before the click under ${lateMs} ms latency`);
          }
        }
      }
      await c.send('Network.emulateNetworkConditions',
        { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await c.send('Network.disable').catch(() => {});
      if (a3Fails === f1) console.log(`A3 late OK: settled ⇒ the sheet was REQUESTED held for ${hops.join('/')} and every hop's sheet was LOADED before its click, under ${lateMs} ms latency from the boot (play reported, not judged); every hop landed WHOLE`);
    }
    await gateErrors(c, errs, 'A3 rm');
    if (a3Fails === f0) {
      console.log(`A3 rm OK: reduced-motion journey play → ${hops.join(' → ')}`
        + ' → quick-play snapped everywhere');
    }
  }
  // ---- entry 18 MOTION pass (GH-525 integrator 2026-09-05; combined review
  // visual audit r2 finding 1): the SAME real-user fresh boot under NORMAL
  // motion — the register where the equipment S1 card still flashed (J1
  // desktop f343–345 / J3 desktop f307–309 / J4 phone f355–357; the rm pass
  // above was clean there). Every judged hop (registry order, EQUIPMENT
  // included) must paint 0 stub frames from the click to its content, and
  // the content must land inside the mover's D6 window (≤ 1000 ms after the
  // click; shellmover MOVE_MS 900). The place SHEETS (ui/play|practice|
  // replays|atelier.css) are HELD 120 ms at the Fetch seam (cache disabled,
  // as leg 5): the local server answers a sheet inside one frame, so an
  // undelayed pass races the very window the audit's capture load exposed
  // (the pre-fix tree passed it 0/1 depending on the click's frame phase);
  // the delay makes the window deterministic — pre-fix control (stash run
  // at 16684878 with this seam): equipment paints its stub for the whole
  // sheet window (stub attribute hidden, stub PAINTED, sheet pending — the
  // attribute lied), the fixed tree holds it (≤ the 250 ms cap) and lands
  // WHOLE.
  await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
  {
    const f1 = a3Fails;
    const SHEET_DELAY_MS = 120;
    const sheetRe = /\/app\/ui\/(play|practice|replays|atelier)\.css(\?|$)/;
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const go = () => c.send('Fetch.continueRequest',
        { requestId: params.requestId }).catch(() => {});
      if (sheetRe.test(params.request.url)) setTimeout(go, SHEET_DELAY_MS);
      else go();
    });
    await c.send('Network.enable');
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*.css*' }] });
    await c.eval('localStorage.clear(), true').catch(() => {});
    await c.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?u=a3mo` });
    if (!(await waitReady(c)) || !(await waitShell(c))) {
      a3fail('A3 motion: judged boot never became ready');
    } else if (!(await waitLanded(c, 'play'))) {
      a3fail('A3 motion: the fresh boot never landed play');
    } else {
      const hops = ['practice', 'equipment', 'replays']
        .filter((id) => A3_PLACES?.includes(id));
      // LAW 1: let the idle prefetch settle every hop (timed readout) so the
      // judged frames are the hold's, not the import's (the audit's journeys
      // hop after the landing too; a slow import only widens the D6 bound)
      const t0 = Date.now();
      let settled = false;
      for (let i = 0; i < 60 && !settled; i++) {
        settled = await c.eval(`(() => { const st = __shell.contentState?.();
          return !!st && ${JSON.stringify(hops)}.every((id) => st.settled.includes(id)); })()`);
        if (!settled) await sleep(100);
      }
      console.log(`A3 motion: prefetch settled ${hops.join('/')}=${settled} `
        + `after ${Date.now() - t0} ms`);
      for (const id of hops) {
        await c.eval('window.__a3.mark = window.__a3.samples.length, '
          + 'window.__a3.markT = performance.now(), true');
        if (!(await clickEl(c, `#ob-shell-rail [data-place="${id}"]`))) {
          a3fail(`A3 motion: rail button '${id}' unreachable`);
          continue;
        }
        // the move runs ~0.9 s; sample through it and ~15 frames of stillness
        for (let i = 0; i < 30; i++) {
          const still = await c.eval(`!__shell.moving() && document.querySelector(
            'section[data-place="${id}"]').classList.contains('${hostClassOf(id)}')`);
          if (still) break;
          await sleep(100);
        }
        await sleep(250);
        const wait = await c.eval(a3FramesWait(a3SinceMark(id)));
        const r = await c.eval(`(() => {
          const S = window.__a3; const since = S.samples.slice(S.mark);
          const mine = since.filter((q) => q.place === '${id}');
          const first = mine.find((q) => q.content);
          return { place: __shell.place(), moving: __shell.moving(),
            frames: mine.length, stubFrames: mine.filter((q) => q.stub).length,
            toContent: mine.findIndex((q) => q.content),
            msToContent: first ? Math.round(first.t - S.markT) : -1,
            heldFrames: mine.filter((q) => q.held).length,
            seq: mine.slice(0, 12).map((q) => (q.stub ? 'S' : q.content ? 'C'
              : q.secVis ? 'v' : '_')).join(''),
            // the shell's own verdict where the readout exposes it (null on
            // a tree without it — the stub-frame law above is the judge)
            painted: Array.isArray(__shell.contentState?.().painted)
              ? __shell.contentState().painted.includes('${id}') : null };
        })()`);
        Object.assign(r, { wait, load1: a3Load() });
        if (r.place !== id || r.moving || r.frames < A3_MIN_FRAMES) {
          a3fail(`A3 motion rail → ${id}: never settled at the place: `
            + JSON.stringify(r));
        } else if (r.stubFrames || r.toContent < 0 || r.msToContent > 1000
          || r.painted === false) {
          a3fail(`A3 motion rail → ${id}: the card must land WHOLE under motion `
            + '— 0 stub frames from the click to content, content inside the '
            + 'D6 window (≤ 1000 ms) and painted by the shell\'s own predicate: '
            + JSON.stringify(r));
        } else {
          console.log(`A3 motion rail → ${id} OK: ${r.frames} frames, stub frames `
            + `${r.stubFrames}, content at frame ${r.toContent} (${r.msToContent} ms `
            + `after the click, held ${r.heldFrames}), seq ${r.seq}; frame wait +${wait.ms} ms, `
            + `load1 ${r.load1}`);
        }
      }
    }
    await c.send('Fetch.disable').catch(() => {});
    await gateErrors(c, errs, 'A3 motion');
    if (a3Fails === f1) {
      console.log('A3 motion OK: normal-motion journey play → hops landed WHOLE '
        + '(0 stub frames, content inside the D6 window)');
    }
  }
  // ---- entry 19 SEEDED-ARCHIVE passes (GH-525 integrator 2026-09-05;
  // combined review visual audit r3 finding 1): the journeys' archive
  // fixture (three sessions / two days) seeded on this profile, then the
  // SAME real-user fresh boot under reduced motion and under normal motion.
  // The replays arrival is judged by the settled-frame method: the card
  // region (empty-sentence paint, latest body, rail rows, rail/section
  // geometry) must EQUAL the settled frame within 2 frames of the click
  // under reduced motion (the mover snaps), and NO frame may paint the
  // empty sentence while the archive holds rows — pre-fix the card showed
  // "No recordings yet" for 3–5 frames (J2 f60 326–328; probe 'EEEEERRR')
  // because the empty sentence was the card's INITIAL DOM and the first
  // read resolved frames later. Under motion the rows must land inside the
  // D6 window with no empty frame either.
  if (A3_PLACES?.includes('replays')) {
    const f2 = a3Fails;
    await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=a3seed` });
    let seeded = null;
    if (!(await waitReady(c))) a3fail('A3 seeded: the warm document never became ready');
    else {
      try { seeded = await seedArchive(c, 3, 1); }
      catch (e) { a3fail(`A3 seeded: archive fixture failed — ${e.message}`); }
    }
    if (seeded) console.log(`A3 seeded: ${seeded.seeded} real sessions (${seeded.backdated} back-dated) on this profile`);
    const hops = ['practice', 'equipment', 'replays'].filter((id) => A3_PLACES?.includes(id));
    for (const how of seeded ? ['rm', 'motion'] : []) {
      const rm = how === 'rm';
      await c.send('Emulation.setEmulatedMedia', { features: rm
        ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] });
      await c.eval('localStorage.clear(), true').catch(() => {});
      await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=a3seed${how}` });
      if (!(await waitReady(c)) || !(await waitShell(c))) { a3fail(`A3 seeded ${how}: judged boot never became ready`); continue; }
      if (!(await waitLanded(c, 'play'))) { a3fail(`A3 seeded ${how}: the fresh boot never landed play`); continue; }
      // LAW 1: the idle prefetch (module + replays' archive snapshot) settles
      // before the first hop — the audit's journeys hop after the landing too
      const settled = await a3wait(c, `(() => { const st = __shell.contentState?.();
        return !!st && ${JSON.stringify(hops)}.every((id) => st.settled.includes(id)); })()`, 60, 100);
      await sleep(400);
      let r = null;
      for (const id of hops) {
        await c.eval('window.__a3.mark = window.__a3.samples.length, window.__a3.markT = performance.now(), true');
        if (!(await clickEl(c, `#ob-shell-rail [data-place="${id}"]`))) { a3fail(`A3 seeded ${how}: rail button '${id}' unreachable`); break; }
        for (let i = 0; i < 30; i++) {
          if (await c.eval(`!__shell.moving() && document.querySelector('section[data-place="${id}"]').classList.contains('${hostClassOf(id)}')`)) break;
          await sleep(100);
        }
        await sleep(rm ? 400 : 300);
        if (id !== 'replays') continue;
        const wait = await c.eval(a3FramesWait(a3SinceMark('replays')));
        r = await c.eval(`(() => { const S = window.__a3; const since = S.samples.slice(S.mark);
          const mine = since.filter((q) => q.place === 'replays'); const last = mine[mine.length - 1];
          const same = (q) => q.secVis === last.secVis && q.content === last.content && q.empty === last.empty
            && q.latestOn === last.latestOn && q.rows === last.rows && q.railVis === last.railVis
            && q.railTop === last.railTop && q.railH === last.railH && q.secH === last.secH;
          let toSettled = -1;
          for (let i = 0; i < mine.length; i++) { if (mine.slice(i).every(same)) { toSettled = i; break; } }
          const firstRows = mine.find((q) => q.content && q.rows > 0 && q.railVis);
          return { frames: mine.length, toSettled, rows: last?.rows ?? 0, latestOn: !!last?.latestOn,
            railVis: !!last?.railVis, emptyFrames: mine.filter((q) => q.empty).length,
            stubFrames: mine.filter((q) => q.stub).length, heldFrames: mine.filter((q) => q.held).length,
            movingFrames: since.filter((q) => q.moving).length,
            msToRows: firstRows ? Math.round(firstRows.t - S.markT) : -1,
            seq: mine.slice(0, 12).map((q) => (q.stub ? 'S' : q.empty ? 'E'
              : (q.content && q.rows > 0 && q.railVis) ? 'R' : q.content ? 'C' : q.secVis ? 'v' : '_')).join('') }; })()`);
        Object.assign(r, { wait, load1: a3Load() });
      }
      if (!r) { a3fail(`A3 seeded ${how}: the replays hop was never judged`); continue; }
      const whole = r.rows >= 1 && r.latestOn && r.railVis;
      if (r.frames < A3_MIN_FRAMES || !whole) {
        a3fail(`A3 seeded ${how} → replays: the settled card must show the seeded latest body + rail rows (prefetch settled=${settled}): ${JSON.stringify(r)}`);
      } else if (r.emptyFrames || r.stubFrames) {
        a3fail(`A3 seeded ${how} → replays: with rows in the archive NO frame may paint the empty sentence or a stub (empty ${r.emptyFrames}, stub ${r.stubFrames}): ${JSON.stringify(r)}`);
      } else if (rm && (r.movingFrames || r.toSettled < 0 || r.toSettled > 2)) {
        a3fail(`A3 seeded rm → replays: the card region must EQUAL the settled frame within 2 frames of the click (snap; got frame ${r.toSettled}): ${JSON.stringify(r)}`);
      } else if (!rm && (r.msToRows < 0 || r.msToRows > 1000)) {
        a3fail(`A3 seeded motion → replays: body + rows must land inside the D6 window (≤ 1000 ms; got ${r.msToRows} ms): ${JSON.stringify(r)}`);
      } else {
        console.log(`A3 seeded ${how} → replays OK: ${r.frames} frames, settled at frame ${r.toSettled} (${r.msToRows} ms), rows ${r.rows}, empty frames 0, stub frames 0, held ${r.heldFrames}, seq ${r.seq}; frame wait +${r.wait.ms} ms, load1 ${r.load1}`);
      }
    }
    await gateErrors(c, errs, 'A3 seeded');
    if (seeded && a3Fails === f2) console.log('A3 seeded OK: seeded-archive journeys (rm + motion) land the replays card WHOLE — no empty-sentence frame');
  }
  await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
  c.close();
}

// ---- A3 leg 5) DELAYED imports: the arrival laws under a slow network -----
// (GH-525 integrator 2026-09-05 — shell.md §9 entry 17; combined review
// visual audit r1 finding 4.) The SAME real-user reduced-motion boot with
// every place module's response HELD ~400 ms at the Fetch seam (the A2b/A3
// poison family, continued late instead of refused): LAW 1 must have every
// hop's module settled before the first rail hop (the `contentState`
// readout, timed), and each hop must land its card WHOLE — 0 stub-visible
// frames, content ≤ 2 frames after the click. Then the POSITIVE CONTROL of
// the sampler on the same profile: practice.js REFUSED on a fresh
// navigation → the arrival at practice MUST record stub frames (the S1
// stub stands, entry 12's degrade) — a sampler blind to the stub would pass
// the law vacuously. The pre-fix tree is the other control (stash run at
// 3a452588 with this sampler: practice S×1 / replays S×1 / equipment S×2
// undelayed; 12 / 21 / 25 stub frames at 400 ms — the integrator report).
{
  const f0 = a3Fails;
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=a3dl0`,
    { port: CDP_PORT + 9, tool: false });
  watchErrors(c, errs);
  const modRe = /\/app\/(play|practice|replays|atelier)\.js(\?|$)/;
  const seam = { delayMs: 400, failRe: null };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const { requestId, request } = params;
    // every seam reply is guarded: a request the page already cancelled
    // (a navigation mid-flight) answers "Invalid InterceptionId", benign
    // here and fatal un-caught (the e2e-playback precedent; the entry-18
    // green run crashed on it after every judged leg had passed)
    if (seam.failRe && seam.failRe.test(request.url)) {
      c.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' })
        .catch(() => {});
    } else if (modRe.test(request.url)) {
      setTimeout(() => c.send('Fetch.continueRequest', { requestId })
        .catch(() => {}), seam.delayMs);
    } else c.send('Fetch.continueRequest', { requestId }).catch(() => {});
  });
  // Network.enable FIRST: setCacheDisabled is applied by the network agent
  // and is inert while the agent is off — the warm-up boot's PREFETCH puts
  // every place module into the profile's heuristic disk cache (the static
  // server sends no Cache-Control), and the judged/control navigations
  // were then served practice.js from that cache with no Fetch event at
  // all (the control saw the module mount, browser log empty). The A3
  // poison legs above escape this only because their poison is armed
  // before the warm-up boot's prefetch fires (the refusal is never cached).
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*.js*' }] });
  await c.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `${A3_CARD}(() => {
    const S = window.__a3 = { f: [], mark: 0 };
    const tick = () => {
      const s = window.__shell;
      if (s && s.isOpen()) S.f.push({ place: s.place(), ...__a3card(s.place()) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()` });
  // the warm-up boot wrote ob-shell-v1; the judged boot is FRESH
  if (!(await waitReady(c))) a3fail('A3 dl: warm-up boot never became ready');
  await a3ClearAfterShellWrite(c, 'A3 dl');
  await c.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?u=a3dl` });
  const CARD = (id) => `(() => { const S = window.__a3;
    const f = S.f.slice(S.mark).filter((q) => q.place === '${id}');
    return { frames: f.length, stubFrames: f.filter((q) => q.stub).length,
      toContent: f.findIndex((q) => q.content),
      heldFrames: f.filter((q) => q.held).length,
      emptyFrames: f.filter((q) => !q.secVis).length,
      seq: f.slice(0, 8).map((q) => (q.stub ? 'S' : q.content ? 'C'
        : q.secVis ? 'v' : '_')).join(''),
      state: __shell.contentState() }; })()`;
  const hops = ['practice', 'replays'].filter((id) => A3_PLACES?.includes(id));
  if (!(await waitReady(c)) || !(await waitShell(c))) {
    a3fail('A3 dl: judged boot never became ready');
  } else if (!(await waitLanded(c, 'play'))) {
    a3fail('A3 dl: the fresh boot never landed play');
  } else {
    // LAW 1: every hop's module settles after the settle — bounded, timed
    const t0 = Date.now();
    let settled = false;
    for (let i = 0; i < 60 && !settled; i++) {
      settled = await c.eval(`(() => { const st = __shell.contentState();
        return ${JSON.stringify(hops)}.every((id) => st.settled.includes(id));
      })()`).catch(() => false);
      if (!settled) await sleep(100);
    }
    const st = await c.eval('__shell.contentState()');
    if (!settled) {
      a3fail('A3 dl: LAW 1 — the prefetch must settle every place module '
        + 'after the settle (400 ms held responses): ' + JSON.stringify(st));
    } else {
      console.log(`A3 dl LAW 1 OK: prefetch settled ${JSON.stringify(st.settled)} `
        + `${Date.now() - t0} ms after play landed (mounted `
        + `${JSON.stringify(st.mounted)})`);
    }
    for (const id of hops) {
      await c.eval('window.__a3.mark = window.__a3.f.length, true');
      if (!(await clickEl(c, `#ob-shell-rail [data-place="${id}"]`))) {
        a3fail(`A3 dl: rail button '${id}' unreachable`);
        continue;
      }
      for (let i = 0; i < 40; i++) {
        const host = await c.eval(`document.querySelector(
          'section[data-place="${id}"]').classList.contains('ob-${id}-host')`)
          .catch(() => false);
        if (host) break;
        await sleep(100);
      }
      await sleep(250);
      const wait = await c.eval(a3FramesWait(`window.__a3.f.slice(window.__a3.mark).filter((q) => q.place === '${id}').length`));
      const r = { ...(await c.eval(CARD(id))), wait, load1: a3Load() };
      if (r.stubFrames || r.toContent < 0 || r.toContent > 2 || r.frames < A3_MIN_FRAMES) {
        a3fail(`A3 dl rail → ${id}: LAW 2 — 0 stub frames and the whole card `
          + '≤ 2 frames after the click: ' + JSON.stringify(r));
      } else {
        console.log(`A3 dl rail → ${id} OK: ${r.frames} frames, stub `
          + `${r.stubFrames}, content at frame ${r.toContent}, held `
          + `${r.heldFrames}, seq ${r.seq}; frame wait +${wait.ms} ms, load1 ${r.load1}`);
      }
    }
    await gateErrors(c, errs, 'A3 dl');
  }
  // POSITIVE CONTROL: practice.js refused → the sampler MUST see stub frames
  if (hops.includes('practice')) {
    const log = [];
    a3WatchLog(c, log);
    seam.failRe = /\/app\/practice\.js(\?|$)/;
    await c.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?u=a3dlctl` });
    if (!(await waitReady(c)) || !(await waitShell(c))) {
      a3fail('A3 dl control: boot never became ready');
    } else if (!(await waitLanded(c, 'play'))) {
      a3fail('A3 dl control: boot never landed play');
    } else {
      await sleep(1500); // the refused prefetch settles
      await c.eval('window.__a3.mark = window.__a3.f.length, true');
      if (!(await clickEl(c, '#ob-shell-rail [data-place="practice"]'))) {
        a3fail('A3 dl control: rail button practice unreachable');
      }
      await sleep(600);
      const r = await c.eval(CARD('practice'));
      if (!r.stubFrames || r.toContent >= 0
        || !r.state.degraded.includes('practice')) {
        a3fail('A3 dl control: with practice.js refused the sampler must '
          + 'record the STANDING stub (≥ 1 stub frame, no content, degraded): '
          + JSON.stringify(r));
      } else {
        console.log(`A3 dl control OK: practice.js refused → ${r.stubFrames}/`
          + `${r.frames} stub frames, no content, held ${r.heldFrames} `
          + '(the sampler sees the stub)');
      }
      const foreign = log.filter((l) => !/\/app\/practice\.js/.test(l));
      if (!log.length || foreign.length) {
        a3fail('A3 dl control: the browser log must carry the refused '
          + 'practice.js fetch and nothing else: '
          + JSON.stringify(foreign.slice(0, 3)));
      }
      await gateErrors(c, errs, 'A3 dl control');
    }
  }
  if (a3Fails === f0) {
    console.log('A3 dl OK: delayed imports (400 ms) — prefetch settled before '
      + `the hops, every hop landed whole (${hops.join(', ')}), the refused `
      + 'control recorded the standing stub');
  }
  await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
  c.close();
}

// ---- B) DEFAULT scripted boot: byte-identical, shell fully absent ---------
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
    { port: CDP_PORT + 1 }); // cdp.mjs stamps obtool=1
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('B: scripted boot never became ready');
  else {
    await sleep(1500); // the guarded dynamic import settles either way
    const s = await c.eval(`({
      surface: typeof window.__shell,
      dom: document.getElementById('ob-shell') !== null,
      pill: document.getElementById('ob-shell-open') !== null,
      css: document.getElementById('ob-shell-css') !== null,
      key: localStorage.getItem('ob-shell-v1'),
      // GH-715 review r5 P2: the arrival-protocol claim is a window write —
      // a scripted boot (no obshell=1) must not carry it either (RED on
      // a57f242a: shell.js claimed at module evaluation unconditionally)
      claim: '__obShellProtocol' in window,
      pos: window.__dbg.camera.position.toArray().map((v) => +v.toFixed(4)),
      fov: window.__dbg.camera.fov,
    })`);
    if (s.surface !== 'undefined' || s.dom || s.pill || s.css || s.key !== null) {
      fail('B: default scripted boot must carry ZERO shell surface/DOM/state '
        + '(SC-002): ' + JSON.stringify(s));
    } else if (s.claim !== false) {
      fail('B: default scripted boot must not claim the arrival protocol '
        + '(__obShellProtocol is a window write; shell.md §4 entire no-op): ' + JSON.stringify(s));
    } else if (JSON.stringify(s.pos) !== JSON.stringify(ORBIT_BOOT.pos)
      || s.fov !== ORBIT_BOOT.fov) {
      fail('B: scripted boot pose drifted off the pre-031 triple: '
        + JSON.stringify(s));
    } else console.log('B OK: default scripted boot byte-identical, no shell');
    await gateErrors(c, errs, 'B');
  }
  c.close();
}

// ---- C) real-user mover laws (§3) ------------------------------------------
{
  const errs = [];
  const audio = [];
  let cFails = 0; // #1121: 'C OK' only when no C row failed (it printed after a FAIL)
  const cfail = (msg) => { cFails += 1; fail(msg); };
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 2, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    const line = method === 'Runtime.consoleAPICalled'
      ? params.args.map((a) => a.value ?? a.description).join(' ')
      : method === 'Log.entryAdded' ? params.entry.text : null;
    if (line && /AudioContext/i.test(line)) audio.push(line);
  });
  if (!(await waitReady(c))) cfail('C: real-user boot never became ready');
  else {
    if (!(await waitLanded(c, 'play'))) cfail('C: fresh settle never landed play');
    // interrupt-to-end: quick-play out, re-open ANIMATED, then a REAL canvas
    // pointerdown mid-flight must cut to the exact end pose (never rewind).
    // #1121: a fixed 120 ms sleep ('~13% into the 900 ms move') let the press
    // land after the move had ended on a loaded box, and the cut law judged a
    // pose no press had interrupted. The verdict is now read inside the
    // gate's own call (review P2 on 0e28fc1b: a frame-based read let a natural
    // landing erase an ignored press, and a long frame stall hid a correct
    // cut). The shell's pointer gate (shell.js gatePointerDown, re-installed
    // by every openShell) is wrapped so the move and the full pose are read
    // immediately before and after the app's own handler, synchronously: no
    // microtask, frame or timer falls in between. The press is a RIGHT press:
    // the gate cuts, then returns for buttons 1/2 (free orbit, §3(6)), so only
    // the gate's own cut can end the move. A left press on the bed is also a
    // prop tap whose goTo('play') → moveTo one-in-flight cut lands the same
    // end pose without the gate (fix-verify P2 on e1946d43), and a prop under
    // the point mid-flight starts a second move (the GH-563 class). A press
    // the gate saw with the move already ended is staged again (<= 3 tries);
    // a press it saw in flight must leave the move ended at the end pose,
    // shell open, or the law is broken at once. Frames only feed the readout.
    await c.eval(`(() => {
      if (window.__cPressHooked) return true;
      window.__cPressHooked = true;
      const W = new WeakMap();
      window.__cPress = [];
      const read = () => {
        try {
          const s = window.__shell, a = s.registry().find((p) => p.id === 'play').anchor, q = s.pose();
          return { t: performance.now(), moving: s.moving(), open: s.isOpen(),
            atPlay: [q.target[0] - a.tx, q.target[1] - a.ty, q.target[2] - a.tz, q.radius - a.radius,
              q.theta - a.theta, q.phi - a.phi, Number.isFinite(a.fov) ? q.fov - a.fov : 0]
              .every((d) => Math.abs(d) < ${EPS}) };
        } catch (err) { return { t: performance.now(), err: String(err) }; }
      };
      const isGate = (tgt, type, fn) => tgt === window && type === 'pointerdown' && typeof fn === 'function'
        && fn.name === 'gatePointerDown';
      const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (!isGate(this, type, fn)) return add.call(this, type, fn, opts);
        if (!W.has(fn)) {
          W.set(fn, function (e) {
            const pre = e.isTrusted ? read() : null;
            try { return fn.call(this, e); } finally {
              if (pre) window.__cPress.push({ button: e.button, pre, post: read() });
            }
          });
        }
        return add.call(this, type, W.get(fn), opts);
      };
      EventTarget.prototype.removeEventListener = function (type, fn, opts) {
        return rem.call(this, type, isGate(this, type, fn) && W.has(fn) ? W.get(fn) : fn, opts);
      };
      return true;
    })()`);
    let cut = null, breach = null, unjudged = null;
    for (let i = 1; i <= 3 && !cut && !breach && !unjudged; i++) {
      await c.eval('__shell.isOpen() && __shell.quickPlay(), true');
      const staged = await c.eval(`(async () => {
        window.__cPress.length = 0;
        const t0 = window.__cTOpen = performance.now();
        __shell.openShell({ animate: true });
        while (!__shell.moving() && performance.now() - t0 < 500) await new Promise((r) => requestAnimationFrame(r));
        return __shell.moving();
      })()`);
      if (staged) {
        await c.send('Input.dispatchMouseEvent',
          { type: 'mousePressed', x: 640, y: 300, button: 'right', buttons: 2, clickCount: 1 });
        await c.send('Input.dispatchMouseEvent',
          { type: 'mouseReleased', x: 640, y: 300, button: 'right', buttons: 0, clickCount: 1 });
      }
      const r = await c.eval(`(async () => {
        for (let k = 0; k < 2; k++) await new Promise((res) => requestAnimationFrame(res));
        const p = window.__cPress[0] ?? null;
        return { press: p && { inMs: Math.round(p.pre.t - window.__cTOpen), button: p.button, pre: p.pre,
          post: p.post }, moving: __shell.moving(), at: ${atAnchorExpr('play')}, open: __shell.isOpen() };
      })()`);
      if (!staged) {
        console.log(`C: interrupt try ${i}: the animated open never reported moving${i < 3 ? ' — staged again' : ''}`);
      } else if (!r.press) unjudged = { try: i, why: 'no press was recorded at the shell\'s pointer gate', ...r };
      else if (r.press.button !== 2 || r.press.pre.err || r.press.post.err) {
        unjudged = { try: i, why: 'the gate\'s record is not a clean right press', ...r };
      } else if (!r.press.pre.moving) {
        console.log(`C: interrupt try ${i}: the gate saw the press ${r.press.inMs} ms after the open, with the move `
          + `already ended${i < 3 ? ' — staged again' : ''}`);
      } else if (r.press.post.moving || !r.press.post.atPlay || !r.press.post.open) breach = { try: i, ...r };
      else cut = { try: i, ...r };
    }
    if (breach) {
      cfail('C: a press the shell\'s gate saw in flight did not end the move at the exact end pose within the gate\'s '
        + `own call (the cut law): ${JSON.stringify(breach)}`);
    } else if (unjudged) {
      cfail(`C: UNJUDGEABLE — ${unjudged.why}: ${JSON.stringify(unjudged)}`);
    } else if (!cut) {
      cfail('C: arm inert — no press reached the shell\'s gate with the move in flight in 3 tries (the open never '
        + 'reported moving, or every press came after the move\'s end)');
    }
    // one-in-flight interrupt storm: the second pick cuts the first move to
    // ITS OWN end pose, exactly one move in flight, last pick wins
    const storm = await c.eval(`(() => {
      __shell.go('equipment');
      const movingAfter1 = __shell.moving();
      __shell.go('replays');
      const cutAtEquipment = ${atAnchorExpr('equipment')};
      return { movingAfter1, cutAtEquipment, moving2: __shell.moving(),
        place: __shell.place() };
    })()`);
    if (!storm.movingAfter1 || !storm.cutAtEquipment || !storm.moving2
      || storm.place !== 'replays') {
      cfail('C: one-in-flight law broke under the interrupt storm: '
        + JSON.stringify(storm));
    }
    if (!(await waitLanded(c, 'replays'))) {
      cfail('C: storm did not land the LAST pick\'s anchor (replays)');
    }
    // reduced-motion ⇒ instant snap (the pose lands in the same tick)
    await c.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const rm = await c.eval(`(() => {
      __shell.go('equipment');
      return { at: ${atAnchorExpr('equipment')}, moving: __shell.moving() };
    })()`);
    if (!rm.at || rm.moving) {
      cfail('C: prefers-reduced-motion must snap instantly: ' + JSON.stringify(rm));
    }
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    // aim-view gate: engage aim view, start a move — the mover disengages
    // at start, re-engage is blocked while the shell owns the camera, and
    // the move lands EXACTLY on the target anchor (SC-006)
    const gate = await c.eval(`(() => {
      window.__aim.setAimView(true);
      const engagedBefore = window.__aim.getAimView();
      __shell.go('play');
      const engagedAtStart = window.__aim.getAimView();
      window.__aim.setAimView(true); // re-engage attempt mid-move
      return { engagedBefore, engagedAtStart };
    })()`);
    await sleep(250); // the frame-hook block clears the re-engage attempt
    const gate2 = await c.eval('window.__aim.getAimView()');
    if (!(await waitLanded(c, 'play'))) {
      cfail('C: aim-view-gated move did not land the exact play anchor (SC-006)');
    }
    if (gate.engagedAtStart !== false || gate2 !== false) {
      cfail('C: aim view must be disengaged at move start and blocked while '
        + 'the shell owns the camera: ' + JSON.stringify({ ...gate, gate2 }));
    }
    if (audio.length) {
      cfail('C: AudioContext console traffic during the shell session: '
        + audio.slice(0, 2).join(' | '));
    }
    if (!cFails) {
      console.log('C OK: interrupt-to-end, one-in-flight storm, reduced-motion '
        + `snap, aim-view gate all lawful (a right press cut the move ${cut.press.inMs} ms into it, within the gate's `
        + 'own call)');
    }
    await gateErrors(c, errs, 'C');
  }
  c.close();
}

// ---- D) quick-play grammar + remember + state preservation -----------------
{
  const errs = [];
  const exitBeforeD = process.exitCode;
  const armCleanD = () => process.exitCode === exitBeforeD;
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 3, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('D: real-user boot never became ready');
  else {
    if (!(await waitLanded(c, 'play'))) fail('D: fresh settle never landed');
    // the 9-ball break address is the LIVE state under the fresh shell —
    // BALL_IN_HAND entry rode the boot (FR-016 whitelist)
    const bootState = await c.eval('__test.state()');
    // reduced motion for deterministic instant moves in this arm
    await c.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    // pointer + keyboard quick-play from EVERY place (FR-007(1)/SC-004)
    for (const [id, how] of [['play', 'pointer'], ['practice', 'key-enter'],
      ['equipment', 'key-space'], ['replays', 'pointer']]) {
      await c.eval(`__shell.go('${id}'), true`);
      const wall = await c.eval(atAnchorExpr(id));
      if (!wall) { fail(`D: go('${id}') did not pose the anchor`); continue; }
      if (how === 'pointer') {
        if (!(await clickEl(c, '#ob-shell-quickplay'))) {
          fail(`D: quick-play control unreachable at '${id}'`);
          continue;
        }
      } else {
        await c.eval(`document.getElementById('ob-shell-quickplay').focus(), true`);
        // keyDown WITH text (the e2e-ui pressKey convention): the native
        // button activation (Enter on keydown, Space on keyup) must fire
        const key = how === 'key-enter'
          ? { key: 'Enter', code: 'Enter', vk: 13, text: '\r' }
          : { key: ' ', code: 'Space', vk: 32, text: ' ' };
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown',
          key: key.key, code: key.code, text: key.text,
          windowsVirtualKeyCode: key.vk, nativeVirtualKeyCode: key.vk });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp',
          key: key.key, code: key.code, windowsVirtualKeyCode: key.vk,
          nativeVirtualKeyCode: key.vk });
      }
      await sleep(150);
      const out = await c.eval(`({
        open: __shell.isOpen(), state: __test.state(),
        pose: __shell.pose(), moving: __shell.moving() })`);
      const gameplayPose = Math.abs(out.pose.target[0]) < 1.0
        && Math.abs(out.pose.target[2]) < 1.0; // table framing, never a wall
      if (out.open || out.moving || !gameplayPose
        || !['AIM', 'BALL_IN_HAND', 'WIN'].includes(out.state)) {
        fail(`D: quick-play (${how}) from '${id}' must land the LIVE table `
          + 'on a gameplay pose with zero wait: ' + JSON.stringify(out));
      }
      // reopen for the next leg — the first leg proves the pill affordance
      // (US2.2 chrome path); later legs re-open programmatically so one
      // failed leg never cascades
      if (id === 'play') {
        if (!(await clickEl(c, '#ob-shell-open'))) fail('D: pill unreachable');
        await sleep(120);
        if (!(await c.eval('__shell.isOpen()'))) {
          fail('D: pill did not reopen the shell');
        }
      }
      await c.eval('__shell.isOpen() || __shell.openShell(), true');
      await sleep(80);
    }
    // BALL_IN_HAND preservation: the boot's break address stays live —
    // placement rights intact after a full shell round-trip
    if (bootState === 'BALL_IN_HAND') {
      await c.eval('__shell.quickPlay(), true');
      const bih = await c.eval(`(() => {
        if (__test.state() !== 'BALL_IN_HAND') return { state: __test.state() };
        const before = __test.balls().find((b) => b.id === 0).pos.slice();
        __test.placeCue(-0.2, -0.8);
        const after = __test.balls().find((b) => b.id === 0).pos.slice();
        return { state: 'BALL_IN_HAND',
          moved: JSON.stringify(before) !== JSON.stringify(after) };
      })()`);
      if (bih.state !== 'BALL_IN_HAND' || !bih.moved) {
        fail('D: BALL_IN_HAND placement rights must survive the shell '
          + 'round-trip (FR-007(1)): ' + JSON.stringify(bih));
      } else console.log('D OK: BIH placement rights intact after shell session');
      await c.eval('__shell.openShell(), true');
    }
    // long-press act-now (FR-007(2)/US3.2): press-and-hold the PLAY card's
    // surface (not a button) fires its primary action — quick-play — with
    // no camera travel; the visible action buttons are the a11y alternative
    // (they are walked by the e2e-ui audit)
    {
      await c.eval(`__shell.isOpen() || __shell.openShell(), true`);
      await c.eval(`__shell.go('play'), true`);
      await sleep(100);
      const card = await c.eval(`(() => {
        const h = document.querySelector(
          '#ob-shell-cards section[data-place="play"] h2');
        const r = h.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
        x: card.x, y: card.y, button: 'left', clickCount: 1 });
      await sleep(750); // past the 550 ms hold threshold
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
        x: card.x, y: card.y, button: 'left', clickCount: 1 });
      await sleep(150);
      const held = await c.eval(
        `({ open: __shell.isOpen(), state: __test.state() })`);
      if (held.open || !['AIM', 'BALL_IN_HAND', 'WIN'].includes(held.state)) {
        fail('D: card long-press must fire the primary action (quick-play) '
          + 'without travel (FR-007(2)): ' + JSON.stringify(held));
      }
      await c.eval(`__shell.openShell(), true`);
      await sleep(100);
      // a SHORT press on the card surface must NOT fire the action. #878: the
      // card's hold is shell.js's HOLD_MS timer from the pointerdown, committed
      // on the pointerup, so the press is judged as the PAGE timed it — a
      // capture listener stamps both events. A release the box delivered late
      // (the page timed >= HOLD_MS: the old fixed 120 ms press read as a hold
      // under load) is no short press: it is pressed again, up to 3 times, and
      // named; a press the page timed short must never fire the action.
      const D_HOLD_MS = 550; // app/shell.js HOLD_MS (the mirrored-literal law)
      let short = null, unseen = false;
      for (let i = 1; i <= 3 && !short; i++) {
        await c.eval(`(() => { const P = window.__dPress = { down: null, up: null };
          for (const k of ['down', 'up']) window.addEventListener('pointer' + k,
            () => { if (P[k] === null) P[k] = performance.now(); }, { capture: true, once: true });
          return true; })()`);
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: card.x, y: card.y, button: 'left', clickCount: 1 });
        await sleep(120);
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: card.x, y: card.y, button: 'left', clickCount: 1 });
        await sleep(500);
        const r = await c.eval(`({ open: __shell.isOpen(), down: window.__dPress.down, up: window.__dPress.up })`);
        if (r.down === null || r.up === null) {
          unseen = true;
          fail(`D: UNJUDGEABLE — the short press was not seen by the page (${JSON.stringify(r)})`);
          break;
        }
        r.ms = r.up - r.down;
        if (r.ms < D_HOLD_MS) { short = r; break; }
        console.log(`D: short press ${i}: the page timed it ${r.ms.toFixed(0)} ms (>= the ${D_HOLD_MS} ms hold; `
          + `load1 ${os.loadavg()[0].toFixed(1)}) — not a short press, pressed again`);
        await c.eval(`__shell.isOpen() || __shell.openShell(), __shell.go('play'), true`);
        await sleep(150);
      }
      if (short && !short.open) {
        fail(`D: a short card press must not fire the hold action (the page timed the press ${short.ms.toFixed(0)} ms)`);
      } else if (short) {
        console.log(`D OK: a short card press (the page timed it ${short.ms.toFixed(0)} ms) did not fire the hold action`);
      } else if (!unseen) {
        fail(`D: UNJUDGEABLE — 3 short presses were all timed >= ${D_HOLD_MS} ms by the page`);
      }
    }
    // US2.5: fresh → immediate quick-play → reload classifies RETURNING
    await c.eval('__shell.quickPlay(), true');
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ret` });
    if (!(await waitReady(c)) || !(await waitShell(c))) fail('D: reload never became ready');
    else {
      let boot = null;
      for (let i = 0; i < 20 && boot !== 'returning'; i++) {
        boot = await c.eval(`window.__shell?.state?.().boot`).catch(() => null);
        if (boot !== 'returning') await sleep(200);
      }
      if (boot !== 'returning') {
        fail('D: fresh → immediate quick-play → reload must classify '
          + 'RETURNING (FR-006 first-arrival write): ' + boot);
      }
    }
    // remember round-trip (ruling 2): opt-in via the REAL control → reload
    // lands straight-to-AIM; opt-out → reload returns to the shell
    if (!(await waitOverlayGone(c))) fail('D: the boot overlay never left after the RETURNING reload');
    await c.eval(`window.__shell.isOpen() || __shell.openShell(), true`);
    await sleep(100);
    if (!(await clickEl(c, '[data-ob="shell-remember"]'))) {
      fail('D: remember control unreachable');
    }
    const remembered = await c.eval(`({
      pressed: document.querySelector('[data-ob="shell-remember"]')
      .getAttribute('aria-pressed'),
      key: JSON.parse(localStorage.getItem('ob-shell-v1')).startAtTable })`);
    if (remembered.pressed !== 'true' || remembered.key !== true) {
      fail('D: remember opt-in must write startAtTable explicitly: '
        + JSON.stringify(remembered));
    }
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=saa` });
    if (!(await waitReady(c)) || !(await waitShell(c))) fail('D: straight-to-AIM reload never ready');
    else {
      await sleep(800);
      const saa = await c.eval(`({ boot: __shell.state().boot,
        open: __shell.isOpen(),
        pos: window.__dbg.camera.position.toArray().map((v) => +v.toFixed(4)) })`);
      if (saa.boot !== 'table' || saa.open
        || JSON.stringify(saa.pos) !== JSON.stringify(ORBIT_BOOT.pos)) {
        fail('D: remember opt-in must boot straight to AIM on today\'s pose: '
          + JSON.stringify(saa));
      }
      // opt-out: open via pill, un-press remember, reload → returning
      if (!(await waitOverlayGone(c))) fail('D: the boot overlay never left after the straight-to-AIM reload');
      await clickEl(c, '#ob-shell-open');
      await sleep(1100); // pill open is animated; let it land
      await clickEl(c, '[data-ob="shell-remember"]');
      const off = await c.eval(
        `JSON.parse(localStorage.getItem('ob-shell-v1')).startAtTable`);
      if (off !== false) fail('D: remember opt-out did not clear startAtTable');
      await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ret2` });
      if (!(await waitReady(c)) || !(await waitShell(c))) fail('D: opt-out reload never ready');
      else {
        let boot = null;
        for (let i = 0; i < 20 && boot !== 'returning'; i++) {
          boot = await c.eval(`window.__shell?.state?.().boot`).catch(() => null);
          if (boot !== 'returning') await sleep(200);
        }
        if (boot !== 'returning') {
          fail('D: remember opt-out reload must classify RETURNING: ' + boot);
        }
      }
    }
    // WIN-continuation preservation (FR-007(1)): stage a legal 9-pot (only
    // the 9 on the table = lowest ball), enter the shell from WIN, let the
    // flow.js auto-rerack complete UNDER the open shell, quick-play into AIM
    await c.eval('__shell.isOpen() && __shell.quickPlay(), true');
    const staged = await c.eval(`(() => {
      if (__test.state() === 'BALL_IN_HAND') __test.placeCue(0, -0.6);
      const R = 0.028575;
      // kernel corner-pocket center (window.__rules.pockets() i=5) — the 9
      // sits 0.12 m off the mouth on a near-straight gentle pot (a longer
      // 30° cut MISSED under the kernel's Alciatore cut-induced throw, and
      // a hard straight follow scratched: this staging is throw-safe)
      const pocket = { x: 0.6601447171389936, y: 1.2951447171389936 };
      const nine = { x: 0.58, y: 1.2 };
      const cue = { x: 0.2, y: 0.7 };
      __test.layout([{ id: 0, x: cue.x, y: cue.y },
        { id: 9, x: nine.x, y: nine.y }]);
      // ghost-ball aim: drive the 9 along nine→pocket
      const ux = pocket.x - nine.x, uy = pocket.y - nine.y;
      const n = Math.hypot(ux, uy);
      const gx = nine.x - 2 * R * ux / n, gy = nine.y - 2 * R * uy / n;
      const phi = Math.atan2(gy - cue.y, gx - cue.x);
      return { rejected: __test.shoot({ phi, power: 1.6 }) };
    })()`);
    if (staged.rejected) fail('D: staged 9-pot rejected: ' + staged.rejected);
    let st = 'PLAYBACK';
    for (let i = 0; i < 100 && st !== 'WIN'; i++) { await sleep(200); st = await c.eval('__test.state()'); }
    if (st !== 'WIN') fail(`D: staged 9-pot did not reach WIN (state ${st})`);
    else {
      if (!(await clickEl(c, '#ob-shell-open'))) fail('D: pill unreachable at WIN');
      await sleep(200);
      const inWin = await c.eval('({ open: __shell.isOpen(), state: __test.state() })');
      if (!inWin.open || inWin.state !== 'WIN') {
        fail('D: shell entry from WIN refused: ' + JSON.stringify(inWin));
      }
      // the WIN continuation (auto-rerack ~2.6 s) completes under the shell:
      // a FRESH rack replaces the won layout, landing the 9-ball opening
      // break address (AIM → kitchen BALL_IN_HAND — the same live state a
      // boot rack presents; never an orphaned two-ball won layout)
      let cont = null;
      for (let i = 0; i < 30; i++) {
        await sleep(300);
        cont = await c.eval(`({ state: __test.state(), open: __shell.isOpen(),
          census: __test.balls().filter((b) => !b.pocketed).length })`);
        if (cont.state !== 'WIN' && cont.census === 10) break;
      }
      if (cont?.state === 'WIN' || cont?.census !== 10 || !cont.open) {
        fail('D: WIN continuation must auto-rerack a FRESH table under the '
          + 'OPEN shell (never an orphaned won layout): ' + JSON.stringify(cont));
      }
      await c.eval('__shell.quickPlay(), true');
      const post = await c.eval('({ state: __test.state(), open: __shell.isOpen() })');
      if (!['AIM', 'BALL_IN_HAND'].includes(post.state) || post.open) {
        fail('D: post-WIN quick-play must land the live fresh-rack state: '
          + JSON.stringify(post));
      } else if (armCleanD()) {
        console.log('D OK: quick-play pointer+keyboard from every place, '
          + 'US2.5 returning classification, remember round-trip, BIH/WIN '
          + 'state preservation');
      }
    }
    await gateErrors(c, errs, 'D');
  }
  c.close();
}

// ---- E) prop taps + FR-016 entry locks + FR-017 isolation probes -----------
{
  const errs = [];
  const exitBeforeE = process.exitCode;
  const armCleanE = () => process.exitCode === exitBeforeE;
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 4, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('E: real-user boot never became ready');
  else {
    if (!(await waitLanded(c, 'play'))) fail('E: fresh settle never landed');
    await c.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    // ---- prop taps (FR-009/R7): a REAL primary tap on the bench navigates
    // to replays; the same tap must never reach the gameplay handlers
    const bench = await c.eval(`(() => {
      const cam = window.__dbg.camera;
      const v = [1.35, -0.27, -2.775, 1]; // bench pad center
      const xf = (e, p) => [
        e[0]*p[0] + e[4]*p[1] + e[8]*p[2] + e[12]*p[3],
        e[1]*p[0] + e[5]*p[1] + e[9]*p[2] + e[13]*p[3],
        e[2]*p[0] + e[6]*p[1] + e[10]*p[2] + e[14]*p[3],
        e[3]*p[0] + e[7]*p[1] + e[11]*p[2] + e[15]*p[3]];
      const h = xf(cam.projectionMatrix.elements,
        xf(cam.matrixWorldInverse.elements, v));
      const n = [h[0] / h[3], h[1] / h[3]];
      return { x: (n[0] + 1) / 2 * innerWidth,
        y: (1 - n[1]) / 2 * innerHeight,
        on: Math.abs(n[0]) < 1 && Math.abs(n[1]) < 1 };
    })()`);
    if (!bench.on) fail('E: bench not on screen from the play anchor (adjust anchors)');
    else {
      const hit = await c.eval(`window.__shell.propAt(${bench.x}, ${bench.y})`);
      if (hit !== 'replays') fail(`E: propAt(bench) resolved '${hit}', want replays`);
      await c.send('Input.dispatchMouseEvent',
        { type: 'mousePressed', x: bench.x, y: bench.y, button: 'left', clickCount: 1 });
      await c.send('Input.dispatchMouseEvent',
        { type: 'mouseReleased', x: bench.x, y: bench.y, button: 'left', clickCount: 1 });
      await sleep(150);
      const tapped = await c.eval(`({ place: __shell.place(),
        at: ${atAnchorExpr('replays')} })`);
      if (tapped.place !== 'replays' || !tapped.at) {
        fail('E: a real bench tap must navigate to replays: '
          + JSON.stringify(tapped));
      }
      // 44 pt screen-projected floor: a point just OUTSIDE the plaque's
      // projected silhouette (inside its pad slack) still resolves, while a
      // far-outside point does not (the pad is a floor, not a magnet).
      // Screen bbox computed from the plaque frame's world AABB
      // (room.js: x 0.99..1.71, y 0.53..1.03, z -2.998..-2.9605).
      const pad = await c.eval(`(() => {
        const cam = window.__dbg.camera;
        const xf = (e, p) => [
          e[0]*p[0] + e[4]*p[1] + e[8]*p[2] + e[12]*p[3],
          e[1]*p[0] + e[5]*p[1] + e[9]*p[2] + e[13]*p[3],
          e[2]*p[0] + e[6]*p[1] + e[10]*p[2] + e[14]*p[3],
          e[3]*p[0] + e[7]*p[1] + e[11]*p[2] + e[15]*p[3]];
        const box = { min: [0.99, 0.53, -2.998], max: [1.71, 1.03, -2.9605] };
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (let i = 0; i < 8; i++) {
          const p = [i & 1 ? box.max[0] : box.min[0],
            i & 2 ? box.max[1] : box.min[1],
            i & 4 ? box.max[2] : box.min[2], 1];
          const h = xf(cam.projectionMatrix.elements,
            xf(cam.matrixWorldInverse.elements, p));
          const x = (h[0] / h[3] + 1) / 2 * innerWidth;
          const y = (1 - h[1] / h[3]) / 2 * innerHeight;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        const cx = (minX + maxX) / 2;
        return { near: window.__shell.propAt(cx, minY - 3),
          far: window.__shell.propAt(cx, minY - 60) };
      })()`);
      if (pad.near !== 'replays' || pad.far === 'replays') {
        fail('E: 44pt projected floor law broke (near must inflate, far '
          + 'must not): ' + JSON.stringify(pad));
      }
      // tap the table → play (direct manipulation first)
      await c.eval(`__shell.go('play'), true`);
    }
    // ---- FR-017 input-isolation byte-unchanged probes ----------------------
    await c.eval('__shell.quickPlay(), true');
    const snapExpr = `(() => ({
      state: __test.state(),
      phi: window.__aim.getPhi(),
      power: document.getElementById('power').value,
      elev: document.getElementById('elev').value,
      slowmo: document.getElementById('slowmo').checked,
      cue: __test.balls().find((b) => b.id === 0).pos,
      settings: localStorage.getItem('ob-settings-v1'),
    }))()`;
    const before = await c.eval(snapExpr);
    const entryPose = await c.eval('window.__shell.pose()');
    if (!(await clickEl(c, '#ob-shell-open'))) fail('E: pill unreachable');
    await sleep(150);
    // storm the scene: primary drags, wheel, gameplay keys — all gated.
    // RED-PROVEN against the pre-fix gate shape (2026-08-12): a keydown
    // whose target was the FOCUSED shell chrome (the pill click leaves
    // focus on #ob-shell-quickplay) bubbled to aim.js's window handler —
    // the leak signature this byte-compare catches is EXACTLY
    // phi +0.00087 rad (one ArrowLeft 0.05° step) and #power +0.1 (one
    // ArrowUp step). The shipped gate stops ALL non-dialog keydown at
    // window capture; native activation (Enter/Space on buttons) survives
    // stopImmediatePropagation by construction.
    for (let i = 0; i < 3; i++) {
      await c.send('Input.dispatchMouseEvent',
        { type: 'mousePressed', x: 620 + i * 10, y: 320, button: 'left', clickCount: 1 });
      await c.send('Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: 400, y: 500, button: 'left' });
      await c.send('Input.dispatchMouseEvent',
        { type: 'mouseReleased', x: 400, y: 500, button: 'left', clickCount: 1 });
    }
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 240 });
    for (const [key, code, vk] of [['ArrowLeft', 'ArrowLeft', 37],
      ['ArrowUp', 'ArrowUp', 38], ['v', 'KeyV', 86]]) {
      await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code,
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code,
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
    await c.eval(`__shell.go('equipment'), __shell.go('play'), true`);
    await sleep(150);
    await c.eval('__shell.quickPlay(), true');
    const after = await c.eval(snapExpr);
    const exitPose = await c.eval('window.__shell.pose()');
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      fail('E: a full shell session must leave aim/cue/power/HUD/settings '
        + 'byte-unchanged (FR-017): '
        + JSON.stringify({ before, after }));
    }
    if (JSON.stringify(entryPose) !== JSON.stringify(exitPose)) {
      fail('E: exit must restore the entry gameplay pose (orbit profile, '
        + 'FR-007(5)): ' + JSON.stringify({ entryPose, exitPose }));
    }
    if (armCleanE()) {
      console.log('E OK: prop taps + 44pt floor + FR-017 byte-unchanged probes');
    }
    // ---- GH-534 F6 (QA): a double-click on the reopen pill must never
    // fall through to the prop raycast — the pill hides + the gate
    // installs on click 1, so click 2 hit-tests the CANVAS at the same
    // coords and (pre-fix) prop-navigated through the wall rack ------------
    {
      const pillPt = await c.eval(`(() => {
        const r = document.getElementById('ob-shell-open')
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      const dbl = async () => {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: pillPt.x, y: pillPt.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: pillPt.x, y: pillPt.y, button: 'left', clickCount: 1 });
        await sleep(40);
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: pillPt.x, y: pillPt.y, button: 'left', clickCount: 2 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: pillPt.x, y: pillPt.y, button: 'left', clickCount: 2 });
      };
      await dbl();
      await sleep(800);
      const dc = await c.eval(`({
        open: __shell.isOpen(), place: __shell.place(),
        lastPlace: JSON.parse(
          localStorage.getItem('ob-shell-v1') ?? '{}').lastPlace ?? null,
        atelierPainted: (document.getElementById('ob-atelier-carousel')
          ?.getClientRects().length ?? 0) > 0 })`);
      if (!dc.open || dc.place !== 'play' || dc.lastPlace !== 'play'
        || dc.atelierPainted) {
        fail('E: F6 — a pill double-click must open at Play with no prop '
          + 'fall-through (and no atelier chrome painted): '
          + JSON.stringify(dc));
      }
      // variant A: with equipment ACTIVE, the reopen double-click lands
      // the lawful active-place overview — never a cues deep-land
      await c.eval(`__shell.go('equipment'), true`);
      await sleep(700);
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
      await dbl();
      await sleep(800);
      const va = await c.eval(`({
        open: __shell.isOpen(), place: __shell.place(),
        station: window.__atelier?.station?.() ?? null,
        staged: window.__atelier?.floatState?.().staged ?? false })`);
      if (!va.open || va.place !== 'equipment' || va.station !== null
        || va.staged) {
        fail('E: F6 variant A — the reopen must land the active-place '
          + 'overview, never a deep station: ' + JSON.stringify(va));
      }
      // guard-the-guard (FR-009 survives the fix): a SINGLE real canvas
      // press on the rack's screen position still navigates
      await c.eval(`__shell.go('play'), true`);
      await sleep(700);
      const rackPt = await c.eval(`(() => {
        for (let x = innerWidth - 24; x > innerWidth / 2; x -= 28) {
          for (let y = 24; y < innerHeight / 2; y += 28) {
            if (window.__shell.propAt(x, y) === 'equipment') return { x, y };
          }
        }
        return null; })()`);
      if (!rackPt) fail('E: F6 guard — no rack screen point resolved');
      else {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: rackPt.x, y: rackPt.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: rackPt.x, y: rackPt.y, button: 'left', clickCount: 1 });
        await sleep(700);
        const g = await c.eval('__shell.place()');
        if (g !== 'equipment') {
          fail('E: F6 guard — a single rack tap must still navigate '
            + `(FR-009): place=${g}`);
        }
      }
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
      console.log('E OK (F6): pill double-click gated — no prop '
        + 'fall-through, active-place reopen lawful, FR-009 intact');
    }
    // ---- GH-534 F3 mirror (FR-017 family): a kit confirm raised over the
    // shell declines on a TRUSTED Escape, gameplay-inert --------------------
    {
      // progress the rack first: the R1 pristine fast path would skip the
      // confirm on a shotless session
      const rej17 = await c.eval('__test.shoot({ power: 3 })');
      if (rej17) fail('E: F3 staging shot refused: ' + rej17);
      for (let i = 0; i < 120; i++) {
        const st = await c.eval('__test.state()');
        if (st === 'AIM' || st === 'BALL_IN_HAND') break;
        await sleep(250);
      }
      await c.eval('__shell.openShell({}), true');
      await sleep(400);
      const b17 = await c.eval(`({ phi: window.__aim.getPhi(),
        power: document.getElementById('power').value,
        table: window.__settings.get().equipment.table_id })`);
      await c.eval(`void window.__settings.changeEquipment('table_id',
        window.__settings.get().equipment.table_id === 'pool_pro_9ft'
          ? 'wpa_spec_9ft' : 'pool_pro_9ft'), true`);
      let up = false;
      for (let i = 0; i < 40 && !up; i++) {
        up = await c.eval(`!!document.querySelector('[data-ob="confirm"]')`);
        if (!up) await sleep(150);
      }
      if (!up) fail('E: F3 mirror — the equipment confirm never mounted');
      else {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown',
          key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27 });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp',
          key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27 });
        await sleep(700);
        const a17 = await c.eval(`({
          confirm: !!document.querySelector('[data-ob="confirm"]'),
          open: __shell.isOpen(),
          phi: window.__aim.getPhi(),
          power: document.getElementById('power').value,
          table: window.__settings.get().equipment.table_id })`);
        if (a17.confirm || !a17.open || a17.phi !== b17.phi
          || a17.power !== b17.power || a17.table !== b17.table) {
          fail('E: F3 mirror — Escape must decline the confirm over the '
            + 'shell, gameplay-inert (FR-017): '
            + JSON.stringify({ b17, a17 }));
        } else {
          console.log('E OK (F3): trusted Escape declines the kit confirm '
            + 'over the shell, gameplay-inert');
        }
      }
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
    }
    // ---- GH-534 G3 (round-2 QA): a kit-select MOUSE pick keeps focus on
    // the trigger (select.js option-mousedown fix), and Escape closes the
    // shell-fronted modal even when focus legitimately rests on <body>
    // (gateKeyDown body-target seam) — pre-fix EVERY value-committing
    // mouse pick stranded focus on body and the gate ate Escape. ----------
    {
      await c.eval('__shell.openShell({}), true');
      await sleep(400);
      await c.eval(`document.getElementById('ob-gear').click(), true`);
      await sleep(600);
      await c.eval(`window.__settings.show('language'), true`);
      await sleep(600);
      const pickAndEscape = async (selId, optMatch, tag) => {
        const trig = await c.eval(`(() => {
          const s = document.getElementById(${JSON.stringify(selId)});
          const b = s?.nextElementSibling?.matches?.('button.ob-select')
            ? s.nextElementSibling : null;
          if (!b || !b.getClientRects().length) return null;
          const r = b.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!trig) { fail(`E/G3 ${tag}: trigger missing`); return; }
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: trig.x, y: trig.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: trig.x, y: trig.y, button: 'left', clickCount: 1 });
        await sleep(400);
        const opt = await c.eval(`(() => {
          const li = [...document.querySelectorAll(
            '[data-ob="select-list"] [data-ob="option"]')]
            .find((o) => ${optMatch});
          if (!li) return null;
          const r = li.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!opt) { fail(`E/G3 ${tag}: option missing`); return; }
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: opt.x, y: opt.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: opt.x, y: opt.y, button: 'left', clickCount: 1 });
        await sleep(700);
        const focus = await c.eval(`({
          isTrigger: document.activeElement?.matches?.(
            'button.ob-select') === true,
          isBody: document.activeElement === document.body })`);
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown',
          key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27 });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp',
          key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27 });
        await sleep(800);
        const after = await c.eval(`({
          modal: (document.getElementById('ob-settings')
            ?.getClientRects().length ?? 0) > 0,
          gear: document.getElementById('ob-gear')
            ?.getAttribute('aria-expanded'),
          shellOpen: __shell.isOpen() })`);
        if (!focus.isTrigger || focus.isBody || after.modal
          || after.gear !== 'false' || !after.shellOpen) {
          fail(`E/G3 ${tag}: mouse pick must keep trigger focus and ONE `
            + 'Escape must close the modal over the shell: '
            + JSON.stringify({ focus, after }));
        }
      };
      // language pick (the filed repro) — then restore en
      await pickAndEscape('ob-set-language', `/简体中文/.test(o.textContent)`,
        'language');
      await c.eval(`window.__settings.set('language', 'en'), true`);
      await sleep(600);
      // locale-neutral pick (gates the CLASS, not the language case)
      await c.eval(`document.getElementById('ob-gear').click(), true`);
      await sleep(500);
      await c.eval(`window.__settings.show('assists'), true`);
      await sleep(500);
      await pickAndEscape('ob-set-assist',
        `o.getAttribute('aria-selected') !== 'true'
          && o.getAttribute('aria-disabled') !== 'true'`, 'assist');
      await c.eval(`window.__settings.set('assist', 'standard'), true`);
      // FR-017 body-target guard: modal open, focus forced to body,
      // ArrowLeft steps neither phi nor #power (the r1-P2 leak class)
      await c.eval(`document.getElementById('ob-gear').click(), true`);
      await sleep(500);
      const g3b = await c.eval(`(document.activeElement?.blur?.(),
        { phi: window.__aim.getPhi(),
          power: document.getElementById('power').value })`);
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown',
        key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp',
        key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      await sleep(300);
      const g3a = await c.eval(`({ phi: window.__aim.getPhi(),
        power: document.getElementById('power').value,
        modal: (document.getElementById('ob-settings')
          ?.getClientRects().length ?? 0) > 0 })`);
      if (g3a.phi !== g3b.phi || g3a.power !== g3b.power || !g3a.modal) {
        fail('E/G3: a body-target arrow with the modal open must step '
          + 'nothing (FR-017): ' + JSON.stringify({ g3b, g3a }));
      }
      // close the modal + shell for the FR-016 legs below
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown',
        key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp',
        key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(600);
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
      console.log('E OK (G3): mouse-pick keeps trigger focus; Escape '
        + 'closes the shell-fronted modal (trigger + body targets); '
        + 'body-arrow FR-017 guard');
    }
    // ---- FR-016 locks -------------------------------------------------------
    // (a) shot in flight: PLAYBACK refuses with the honest notice
    const rej = await c.eval('__test.shoot({ power: 5 })');
    if (rej) fail('E: probe shot rejected: ' + rej);
    await sleep(150);
    const lockShot = await c.eval(`(() => {
      const st = __test.state();
      const opened = __shell.openShell();
      const notice = document.getElementById('ob-shell-note');
      return { st, opened, open: __shell.isOpen(),
        notice: notice ? notice.textContent : null };
    })()`);
    if (!['SIMULATING', 'PLAYBACK'].includes(lockShot.st)) {
      fail('E: in-flight probe missed the window (state ' + lockShot.st + ')');
    } else if (lockShot.opened !== false || lockShot.open || !lockShot.notice) {
      fail('E: shell entry during a live shot must refuse with the transient '
        + 'notice (FR-016a): ' + JSON.stringify(lockShot));
    }
    let st = 'PLAYBACK';
    for (let i = 0; i < 120 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
      await sleep(200); st = await c.eval('__test.state()');
    }
    // (b) PLAYBACK borrow: play the archived session back — refused
    await c.eval('window.__archive?.flush?.(), true').catch(() => {});
    let sessId = null;
    for (let i = 0; i < 25 && sessId === null; i++) {
      sessId = await c.eval(
        '(async () => (await window.__archive?.sessions?.())?.[0]?.id ?? null)()')
        .catch(() => null);
      if (sessId === null) await sleep(300);
    }
    if (sessId === null) fail('E: archive session id unavailable for the borrow lock');
    else {
      const borrowed = await c.eval(
        `window.__playback.openSession(${JSON.stringify(sessId)})`);
      if (borrowed !== true) fail('E: DVR borrow refused to open (harness)');
      else {
        await sleep(300);
        const lockPb = await c.eval(`({ st: __test.state(),
          opened: __shell.openShell(), open: __shell.isOpen() })`);
        if (lockPb.opened !== false || lockPb.open) {
          fail('E: shell entry during a PLAYBACK borrow must refuse '
            + '(FR-016a): ' + JSON.stringify(lockPb));
        }
        await c.eval('window.__playback.close(), true');
        await sleep(500);
      }
    }
    // (c) shared-replay link boot: pending intent + live replay refuse;
    // a completed replay releases the lock
    const link = await c.eval('window.__share.encode()');
    if (typeof link !== 'string' || !link.includes('#r=')) {
      fail('E: share link unavailable: ' + JSON.stringify(link));
    } else {
      // force a REAL document load: navigating app.html → app.html#r=… is a
      // same-document hash navigation (share.js never re-parses, no replay)
      await c.send('Page.navigate',
        { url: link.replace('app.html', 'app.html?u=replayboot') });
      if (!(await waitReady(c)) || !(await waitShell(c))) fail('E: replay boot never ready');
      else {
        // while the intent is pending OR the replay runs, entry refuses;
        // the shell must also NOT have auto-opened (fresh classification
        // was consumed earlier — this profile is RETURNING, gated closed)
        let sawLock = false, done = false, last = null;
        for (let i = 0; i < 150; i++) {
          const s = await c.eval(`(() => {
            const r = window.__share.replay();
            const pending = window.__share.pending?.() === true;
            return { pending, active: r.active, done: r.done, i: r.i, n: r.n,
              hash: location.hash.slice(0, 12), st: __test.state(),
              opened: (pending || (r.active && !r.done))
                ? window.__shell.openShell() : null,
              open: __shell.isOpen() };
          })()`).catch(() => null);
          last = s;
          if (!s) { await sleep(200); continue; }
          if (s.opened === false) sawLock = true;
          if (s.open && !s.done) {
            fail('E: shell opened under a live/pending shared replay '
              + '(FR-016b/c): ' + JSON.stringify(s));
            break;
          }
          if (s.done) { done = true; break; }
          await sleep(200);
        }
        if (!done) {
          fail('E: shared replay never completed — last sample: '
            + JSON.stringify(last));
        }
        if (!sawLock) {
          fail('E: replay lock never observed (arm inert) — last sample: '
            + JSON.stringify(last));
        }
        const released = await c.eval(`(() => {
          window.__share.exit();
          return true;
        })()`);
        if (released) await sleep(600);
        const postReplay = await c.eval('__shell.openShell()');
        if (postReplay !== true) {
          fail('E: shell entry must be allowed after the replay resolves');
        }
        await c.eval('__shell.quickPlay(), true');
      }
      // rejected link: the boot intent must RELEASE (the __share.pending
      // seam — a hash-only check would over-lock forever)
      await c.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?u=bad#r=AAAAAAAAAAAA` });
      if (!(await waitReady(c)) || !(await waitShell(c))) fail('E: bad-link boot never ready');
      else {
        let opened = false;
        for (let i = 0; i < 50 && !opened; i++) {
          opened = await c.eval('__shell.openShell()') === true;
          if (!opened) await sleep(200);
        }
        if (!opened) {
          fail('E: a REJECTED share link must release the entry lock after '
            + 'decode resolution (FR-016c / §9 deviation 1)');
        }
        await c.eval('__shell.quickPlay(), true');
      }
    }
    // (d) rules-decision ENTRY (GH-541 — the amended FR-016(d), shell.md
    // §9 dev 10): a carom profile boots into a pending break_spot decision
    // — entry is NO LONGER refused. The shell opens (boot or pill), the
    // decision surfaces as the shell's OWN answerable prompt
    // (#ob-shell-decision, the two break_spot options) while the hud
    // dialog stands down (html.ob-shell-open crit rule); a quick-play exit
    // with the decision STILL pending re-presents the hud dialog at the
    // table; answering THROUGH the shell prompt resolves via
    // __rules.decide and the shell stays open.
    await c.eval(`(() => {
      localStorage.setItem('ob-settings-v1',
        JSON.stringify({ game: 'carom_3cushion' }));
      localStorage.setItem('ob-shell-v1', JSON.stringify(
        { v: 1, lastPlace: 'play', startAtTable: false }));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(c)) || !(await waitShell(c))) fail('E: carom boot never ready');
    else {
      let pend = false;
      for (let i = 0; i < 40 && !pend; i++) {
        pend = await c.eval(
          `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`)
          .catch(() => false);
        if (!pend) await sleep(250);
      }
      if (!pend) fail('E: carom boot never raised the break_spot decision');
      // entry allowed: the returning boot may already be open (the boot
      // chain raises the decision asynchronously); otherwise the explicit
      // open must succeed — never the old refusal
      const entry = await c.eval(
        '__shell.isOpen() || __shell.openShell() === true');
      if (!entry) {
        fail('E: shell entry under a pending rules decision must be '
          + 'ALLOWED (GH-541 amended FR-016d): '
          + JSON.stringify(await c.eval(`({ open: __shell.isOpen(),
            boot: __shell.state().boot,
            notice: document.getElementById('ob-shell-note')
              ?.textContent ?? null })`)));
      }
      // the in-shell prompt is up + answerable; the hud dialog stands down
      let prompted = false;
      for (let i = 0; i < 20 && !prompted; i++) {
        prompted = await c.eval(`document.querySelectorAll(
          '#ob-shell-decision .osd-btns button').length === 2`);
        if (!prompted) await sleep(200);
      }
      const inShell = await c.eval(`({
        open: __shell.isOpen(),
        btns: document.querySelectorAll(
          '#ob-shell-decision .osd-btns button').length,
        hudDown: (document.getElementById('hud-decision')
          ?.getClientRects().length ?? 0) === 0 })`);
      if (!prompted || !inShell.open || !inShell.hudDown) {
        fail('E: the pending decision must surface as the in-shell '
          + 'answerable prompt (hud dialog standing down): '
          + JSON.stringify(inShell));
      }
      // quick-play with the decision STILL pending: the hud dialog
      // re-presents at the table (the reveal handoff)
      await c.eval('__shell.quickPlay(), true');
      let hudBack = false;
      for (let i = 0; i < 20 && !hudBack; i++) {
        hudBack = await c.eval(`(document.getElementById('hud-decision')
          ?.getClientRects().length ?? 0) > 0`);
        if (!hudBack) await sleep(200);
      }
      if (!hudBack) {
        fail('E: a shell exit with the decision still pending must '
          + 're-present the hud decision dialog');
      }
      // pill re-entry (mid-session, decision pending) + answer THROUGH the
      // shell prompt: decide() resolves, prompt clears, shell stays open
      const reopened = await c.eval('__shell.openShell()');
      if (reopened !== true) fail('E: pill re-entry under the pending decision must open');
      await sleep(300);
      const resolved = await c.eval(`(() => {
        const b = document.querySelector(
          '#ob-shell-decision .osd-btns button');
        if (!b) return { clicked: false };
        b.click();
        return { clicked: true,
          pending: window.__rules.matchState()?.pendingDecision ?? null,
          promptGone: !document.getElementById('ob-shell-decision'),
          open: __shell.isOpen() };
      })()`);
      if (!resolved.clicked || resolved.pending !== null
        || !resolved.promptGone || !resolved.open) {
        fail('E: answering through the in-shell prompt must resolve the '
          + 'decision and keep the shell open: ' + JSON.stringify(resolved));
      } else if (armCleanE()) {
        console.log('E OK: FR-016 locks (shot in flight, DVR borrow, shared '
          + 'replay pending/live/released, rejected-link release) + the '
          + 'GH-541 decision-entry amendment (in-shell answerable prompt, '
          + 'hud stand-down, reveal on exit, resolve-in-shell)');
      }
      await c.eval('__shell.quickPlay(), true');
    }
    await gateErrors(c, errs, 'E');
  }
  c.close();
}

// ---- F) phone walker: coarse-pointer shell register -------------------------
{
  const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('F: phone real-user boot never became ready');
  else {
    if (!(await waitLanded(c, 'play', 60))) fail('F: phone settle never landed');
    const geo = await c.eval(`(() => {
      const out = [];
      const els = [
        ...document.querySelectorAll('#ob-shell-rail .ob-shell-place'),
        document.getElementById('ob-shell-settings'),
        document.getElementById('ob-shell-quickplay'),
        document.querySelector('[data-ob="shell-remember"]'),
      ].filter((el) => el && el.getClientRects().length
        // R4: the remember row folds away on coarse — review r4 P2: it is the
        // collapsed focus-reveal row (sr-only box, opacity 0) until keyboard
        // focus reveals it; judged by its own leg below, never as a 1 px control
        && !(el.hasAttribute('data-ob-focus-reveal') && getComputedStyle(el).opacity === '0'));
      for (const el of els) {
        const r = el.getBoundingClientRect();
        out.push({ id: el.dataset.place ?? el.id ?? el.dataset.ob,
          w: r.width, h: r.height,
          inX: r.left >= 0 && r.right <= innerWidth,
          clipped: el.scrollWidth > el.clientWidth + 1 });
      }
      const rail = [...document.querySelectorAll('#ob-shell-rail .ob-shell-place')]
        .map((el) => el.getBoundingClientRect().top);
      return { out, singleRow: Math.max(...rail) - Math.min(...rail) < 2 };
    })()`);
    for (const g of geo.out) {
      if (g.w < 44 || g.h < 44) {
        fail(`F: '${g.id}' under the 44pt floor: ${g.w.toFixed(1)}x${g.h.toFixed(1)}`);
      }
      if (!g.inX) fail(`F: '${g.id}' breaches the viewport`);
      if (g.clipped) fail(`F: '${g.id}' clips its label (never ellipsize)`);
    }
    if (!geo.singleRow) fail('F: the place rail must never wrap');
    // review visual audit P0 (2026-08-13): quick-play stack ∩ rail must be
    // empty, and the touch register's body-level gameplay chrome must be
    // hidden while the shell is open
    const collide = await c.eval(`(() => {
      const bad = [];
      const a = document.getElementById('ob-shell-rail').getBoundingClientRect();
      const b = document.getElementById('ob-shell-quickplay-wrap')
        .getBoundingClientRect();
      const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ow > 0 && oh > 0) bad.push('quick-play overlaps rail');
      for (const id of ['ob-push-btn', 'ob-power-gauge', 'ob-spin-btn',
        'ob-fine-cluster']) {
        const el = document.getElementById(id);
        if (el && el.getClientRects().length
          && getComputedStyle(el).visibility !== 'hidden') {
          bad.push('#' + id + ' visible under the shell');
        }
      }
      return bad;
    })()`);
    if (collide.length) {
      fail('F: phone chrome collision/inertness law broke: ' + collide.join('; '));
    }
    const pt = await c.eval(`(() => {
      const r = document.getElementById('ob-shell-quickplay').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    // GH-668 S5 slice 2 review r3 P2-2: the coarse long-press Remember fold
    // (R4 / B-SH04) speaks ONLY through the notice (shell.rememberOn /
    // shell.rememberOff). Dictionaries are cached independently of the
    // modules (the ownership ledger cache-poison contract): a fresh shell.js paired
    // with a cached pre-slice de dictionary must paint NO English and no raw
    // key — the pair has no localized legacy composition (the row's own
    // label names no state), so the notice is OMITTED and the commit still
    // lands; a fresh dictionary restores the copy. Four holds: fresh en ON
    // (en copy) -> stale de OFF (omitted) -> fresh de ON / OFF (de copy) —
    // the persisted startAtTable ends where it began. RED on 4bc70438: the
    // stale de hold painted the English rememberOff line.
    {
      const dictOf = (loc) => JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
      const en = dictOf('en'), de = dictOf('de');
      const S5_DROP = /^(shell\.card\.replaysOpenVerb|shell\.notice\.replayExit|shell\.toTable|shell\.backToTable|shell\.rememberNext|shell\.hall|shell\.rememberOn|shell\.rememberOff|settings\.on|settings\.off)$|^decision\.(q|cite)\./;
      let staleServed = 0;
      c.onEvent((method, params) => {
        if (method !== 'Fetch.requestPaused') return;
        const m = /\/app\/locales\/([\w-]+)\.json/.exec(params.request.url);
        if (!m) { c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); return; }
        const d = dictOf(m[1]);
        for (const k of Object.keys(d)) if (S5_DROP.test(k)) delete d[k];
        staleServed += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
          body: Buffer.from(JSON.stringify(d)).toString('base64') }).catch(() => {});
      });
      const switchTo = async (loc) => {
        await c.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
        let ok = false;
        for (let i = 0; i < 40 && !ok; i++) {
          ok = await c.eval(`window.__i18n.locale() === ${JSON.stringify(loc)}`).catch(() => false);
          if (!ok) await sleep(150);
        }
        await sleep(300);
        return ok;
      };
      const hold = async () => { // HOLD_MS 550 stillness, commit on the release
        await touchStart(c, [pt]);
        await sleep(800);
        await touchEnd(c);
        await sleep(250);
        const r = await c.eval(`(() => {
          const n = document.getElementById('ob-shell-note');
          const st = JSON.parse(localStorage.getItem('ob-shell-v1') || 'null');
          return { open: __shell.isOpen(), locale: window.__i18n.locale(), note: n && n.isConnected ? n.textContent : null,
            raw: n ? (n.textContent.match(/shell\\.[a-zA-Z.]+/g) || []) : [],
            startAtTable: st ? st.startAtTable === true : null }; })()`);
        await sleep(600); // past the trailing-click swallow window (HOLD_CLICK_MS)
        return r;
      };
      const okEn0 = await switchTo('en');
      const h1 = await hold();
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*.json*' }] });
      const okDe1 = await switchTo('de'); // re-fetched under the intercept: stale de
      const h2 = await hold();
      await c.send('Fetch.disable');
      const okEn2 = await switchTo('en');
      const okDe2 = await switchTo('de'); // fresh de
      const h3 = await hold();
      const h4 = await hold();
      const okEn3 = await switchTo('en');
      const tag = 'F coarse Remember (review r3)';
      let legFails = 0;
      const f = (m) => { legFails += 1; fail(m); };
      if (!okEn0 || !okDe1 || !okEn2 || !okDe2 || !okEn3) f(`${tag}: a locale switch never landed ${JSON.stringify({ okEn0, okDe1, okEn2, okDe2, okEn3 })}`);
      if (staleServed < 1) f(`${tag}: staging — the stale de dictionary was never served through the intercept`);
      if (h1.open !== true || h2.open !== true || h3.open !== true || h4.open !== true) f(`${tag}: a hold must never exit the hall: ${JSON.stringify([h1.open, h2.open, h3.open, h4.open])}`);
      if (!(h1.startAtTable === true && h1.note === en['shell.rememberOn'])) f(`${tag}: staging — the fresh en hold must commit ON and speak en's rememberOn, got ${JSON.stringify(h1)}`);
      if (h2.startAtTable !== false) f(`${tag}: the stale de hold must still commit OFF (the notice is presentation, the write is the law), got ${JSON.stringify(h2)}`);
      if (h2.note !== null) f(`${tag}: under a stale de dictionary the notice must be OMITTED (no localized composition), got ${JSON.stringify(h2)} (RED on 4bc70438: the English rememberOff line)`);
      if (h2.note === en['shell.rememberOff'] || h2.note === en['shell.rememberOn'] || h2.raw.length) f(`${tag}: English / raw notice text under a stale de: ${JSON.stringify(h2)}`);
      if (!(h3.startAtTable === true && h3.note === de['shell.rememberOn'])) f(`${tag}: the fresh de hold must speak de's rememberOn, got ${JSON.stringify(h3)}`);
      if (!(h4.startAtTable === false && h4.note === de['shell.rememberOff'])) f(`${tag}: the fresh de hold must speak de's rememberOff, got ${JSON.stringify(h4)}`);
      if (!legFails) console.log(`${tag} OK: en '${h1.note}' -> stale de ${JSON.stringify(h2.note)} (omitted, commit ${h2.startAtTable}) -> fresh de '${h3.note}' / '${h4.note}' (staleServed ${staleServed})`);
    }
    // review r4 P2 (GH-668 S5 slice 2): the folded Remember row stays in the
    // TAB ORDER — an external-keyboard / switch user has no long-press and
    // Enter / Space on quick-play exits the hall. A REAL Tab from quick-play
    // lands on the row (activeElement, :focus-visible); while focused it is
    // REVEALED (>= 44 pt, inside the viewport, computed opacity 1, pointers
    // on); Enter flips startAtTable (the sole writer) and Space flips it
    // back, neither exits the hall; blur re-collapses it to the sr-only box
    // (1 x 1, clip-path, opacity 0 — the audits' "off the paint" idiom);
    // under reduced motion the reveal is there by the next frame with no
    // transition of its own. RED on 1f8481d3: `display: none` = not
    // focusable, Tab from quick-play skips the row.
    {
      const tag = 'F coarse Remember keyboard path (review r4 P2)';
      let bad = 0;
      const f = (m) => { bad += 1; fail(`${tag}: ${m}`); };
      const KEY = {
        Tab: { key: 'Tab', code: 'Tab', vk: 9 },
        Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
        Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
      };
      const press = async (name) => {
        const k = KEY[name];
        const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: 0 };
        await c.send('Input.dispatchKeyEvent', k.text ? { type: 'keyDown', text: k.text, ...base } : { type: 'rawKeyDown', ...base });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      };
      const READ = `(() => {
        const el = document.querySelector('[data-ob="shell-remember"]');
        if (!el) return null;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        let st = null; try { st = JSON.parse(localStorage.getItem('ob-shell-v1')); } catch {}
        return { active: document.activeElement === el, fv: el.matches(':focus-visible'),
          w: r.width, h: r.height, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          opacity: cs.opacity, clip: cs.clipPath, display: cs.display, pointer: cs.pointerEvents, td: cs.transitionDuration,
          pressed: el.getAttribute('aria-pressed'), name: (el.textContent || '').trim(),
          startAtTable: st ? st.startAtTable : null, open: __shell.isOpen() };
      })()`;
      const revealed = (s) => s.w >= 43.5 && s.h >= 43.5 && s.inView && s.opacity === '1';
      const collapsed = (s) => s.w <= 1 && s.h <= 1 && s.clip !== 'none' && s.opacity === '0' && s.display !== 'none';
      const rest = await c.eval(READ);
      if (!rest) f('no [data-ob="shell-remember"] in the DOM');
      else {
        if (!collapsed(rest)) f(`at rest the row must be the collapsed sr-only box (1x1, clip-path, opacity 0), got ${JSON.stringify(rest)}`);
        const name0 = rest.name;
        await c.eval(`document.getElementById('ob-shell-quickplay').focus(), true`);
        await press('Tab'); await sleep(250);
        const s1 = await c.eval(READ);
        if (!s1.active) f(`Tab from quick-play must land on the Remember row (activeElement), got ${JSON.stringify(s1)}`);
        else {
          if (!s1.fv) f(`the focused row must match :focus-visible (a real Tab), got ${JSON.stringify(s1)}`);
          if (!revealed(s1)) f(`the focused row must be REVEALED (>= 44 pt, inside the viewport, opacity 1), got ${JSON.stringify(s1)}`);
          if (s1.pointer === 'none') f('the focused row must accept pointers again');
          if (!s1.name || s1.name !== name0) f(`the a11y name must not change with the reveal: '${name0}' -> '${s1.name}'`);
          const was = s1.startAtTable === true;
          await press('Enter'); await sleep(200);
          const s2 = await c.eval(READ);
          if (s2.startAtTable !== !was || s2.pressed !== String(!was)) f(`Enter must flip startAtTable ${was} -> ${!was} and aria-pressed, got ${JSON.stringify(s2)}`);
          if (!s2.open) f('Enter on the Remember row must not exit the hall');
          if (!s2.active) f('the row must keep focus after Enter');
          await press('Space'); await sleep(200);
          const s3 = await c.eval(READ);
          if (s3.startAtTable !== was || s3.pressed !== String(was)) f(`Space must flip it back to ${was}, got ${JSON.stringify(s3)}`);
          if (!s3.open) f('Space on the Remember row must not exit the hall');
          await c.eval('document.activeElement.blur(), true'); await sleep(250);
          const s4 = await c.eval(READ);
          if (s4.active || !collapsed(s4)) f(`blur must re-collapse the row to the sr-only box, got ${JSON.stringify(s4)}`);
          // reduced motion: the reveal is there by the next frame, no transition of its own
          await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
          await sleep(100);
          await c.eval(`document.getElementById('ob-shell-quickplay').focus(), true`);
          await press('Tab');
          const s5 = await c.eval(`new Promise((res) => requestAnimationFrame(() => res(${READ})))`);
          if (!s5.active || !revealed(s5)) f(`under reduced motion the row must be revealed by the next frame, got ${JSON.stringify(s5)}`);
          if (String(s5.td || '').split(',').some((v) => parseFloat(v) > 0)) f(`under reduced motion the row must carry no transition (the kit .ob-btn block), got transition-duration '${s5.td}'`);
          await c.eval('document.activeElement.blur(), true');
          await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
          await sleep(150);
          const s6 = await c.eval(READ);
          if (s6.startAtTable !== was) f(`the leg must leave startAtTable where it began (${was}), got ${JSON.stringify(s6)}`);
          if (!collapsed(s6)) f(`after the leg the row must be collapsed again, got ${JSON.stringify(s6)}`);
          if (!bad) console.log(`${tag} OK: Tab -> revealed ${s1.w.toFixed(0)}x${s1.h.toFixed(0)} @ opacity 1, Enter/Space flipped ${was} -> ${!was} -> ${was} in the hall, blur collapsed, reduced-motion reveal next-frame (td '${s5.td}')`);
        }
      }
    }
    // touch quick-play exits to the live table
    await touchStart(c, [pt]);
    await touchEnd(c);
    await sleep(250);
    const out = await c.eval(`({ open: __shell.isOpen(), state: __test.state() })`);
    if (out.open || !['AIM', 'BALL_IN_HAND', 'WIN'].includes(out.state)) {
      fail('F: touch quick-play must exit to the live table: '
        + JSON.stringify(out));
    } else console.log('F OK: phone register (44pt, single-row rail, touch quick-play)');
    await gateErrors(c, errs, 'F');
  }
  c.close();
}

// ---- G) shell-open visual state (contract §7.1) -----------------------------
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('G: real-user boot never became ready');
  else if (!(await waitLanded(c, 'play'))) {
    fail('G: fresh settle never landed');
  } else {
    // wait out the open-side ramp (450 ms; instant under storm-degraded
    // rAF cadence is still bounded — poll, GH-313 posture)
    let vs = null;
    for (let i = 0; i < 40; i++) {
      vs = await c.eval('window.__shell.visualState()');
      // bakeWrapped lands when the lampfade leaf import does (the shell's
      // frame hook retries the wrap) — poll it with the ramp settle; so does
      // the keys' join where main's __obStage stages it (#1202)
      if (vs && !vs.ramping && vs.glareK === 1 && vs.bakeWrapped
        && !vs.keysPending) break;
      await sleep(150);
    }
    if (!vs || vs.ramping || vs.glareK !== 1) {
      fail('G: visual-state ramp never settled: ' + JSON.stringify(vs));
    }
    if (vs.keys !== 2) fail(`G: expected 2 hall key lights, got ${vs.keys}`);
    if (!vs.keyIntensities.every((i) => i > 0)) {
      fail('G: hall key lights not lit: ' + JSON.stringify(vs.keyIntensities));
    }
    if (!vs.camLayer1) fail('G: camera layer 1 not enabled while open');
    if (vs.cueHidden !== true) fail('G: cue rod visible under the open shell');
    if (vs.previewHidden !== true) {
      fail('G: aim/preview family visible under the open shell');
    }
    // review visual-audit round 2: the aim-assist families (BIH kitchen
    // tint/head-string zone, snap/rest/call) are gameplay chrome too
    const assists = await c.eval(`(() => {
      const out = {};
      for (const n of ['obAimZone', 'obAimSnap', 'obAimRest', 'obAimCall']) {
        out[n] = window.__dbg.scene.getObjectByName(n)?.visible ?? null;
      }
      return out;
    })()`);
    for (const [n, v] of Object.entries(assists)) {
      if (v === true) fail(`G: ${n} visible under the open shell`);
    }
    if (!vs.glare.length) fail('G: no live emitters tracked for the glare dim');
    for (const g of vs.glare) {
      if (Math.abs(g.now - g.base * 0.85) > 1e-9) {
        fail(`G: glare dim wrong: base ${g.base} now ${g.now} (want ×0.85)`);
      }
    }
    if (!vs.bakeWrapped) fail('G: bake bracket seam not wrapped while open');
    // §9 deviation 6: the boot-overlay shell-arrival hold must be RESOLVED
    // (a stuck 'pending' would cost every real-user boot the 1.6s bound)
    const arrival = await c.eval('window.__obShellArrival ?? null');
    if (arrival !== 'done') {
      fail(`G: shell-arrival hold not resolved: ${JSON.stringify(arrival)}`);
    }
    // bake-bracket round-trip: suspend must present AUTHORED emitter levels
    // + gameplay visibilities; the undo must re-apply the shell state
    const bake = await c.eval(`(() => {
      const scene = window.__dbg.scene;
      const cue = scene.getObjectByName('obCueStick');
      const pg = scene.getObjectByName('obAimPreview');
      const bases = window.__shell.visualState().glare.map((g) => g.base);
      const undo = window.__lampfade.suspendForBake();
      const during = {
        glare: window.__shell.visualState().glare.map((g) => g.now),
        cue: cue ? cue.visible : null, pg: pg ? pg.visible : null,
      };
      if (undo) undo();
      const after = window.__shell.visualState();
      return { bases, during,
        afterGlare: after.glare.map((g) => g.now),
        afterCue: after.cueHidden, afterPg: after.previewHidden };
    })()`);
    if (!bake.during.glare.every((v, i) => Math.abs(v - bake.bases[i]) < 1e-9)) {
      fail('G: bake suspend must restore AUTHORED emitter levels: '
        + JSON.stringify(bake));
    }
    if (bake.during.cue !== true || bake.during.pg !== true) {
      fail('G: bake suspend must restore gameplay visibilities: '
        + JSON.stringify(bake));
    }
    if (!bake.afterGlare.every((v, i) => Math.abs(v - bake.bases[i] * 0.85) < 1e-9)
      || bake.afterCue !== true || bake.afterPg !== true) {
      fail('G: bake undo must re-apply the shell state: ' + JSON.stringify(bake));
    }
    // a REAL mid-open rebake rides the wrapped seam and leaves the state
    await c.eval('window.__rebakeEnv?.(), true');
    const vs2 = await c.eval('window.__shell.visualState()');
    if (vs2.cueHidden !== true || vs2.previewHidden !== true
      || !vs2.glare.every((g) => Math.abs(g.now - g.base * 0.85) < 1e-9)) {
      fail('G: mid-open rebake disturbed the visual state: '
        + JSON.stringify(vs2));
    }
    // exit: EXACT restoration on the quick-play frame
    const bases = vs.glare.map((g) => g.base);
    // #1202: the keys go dark ON the exit frame (read in the exit's own
    // task); their leave (the group + camera layer 1) can land later where
    // main's __obStage stages it, so the restore reads wait for it to settle
    const exitKeys = await c.eval(`(() => { window.__shell.quickPlay();
      return window.__shell.visualState().keyIntensities; })()`);
    if (!exitKeys.every((i) => i === 0)) {
      fail('G: hall keys still lit on the exit frame: ' + JSON.stringify(exitKeys));
    }
    await sleep(150); // one frame: aim.js re-asserts its own visibility
    let pend = null;
    for (let i = 0; i < 40; i++) {
      pend = await c.eval('window.__shell.visualState().keysPending');
      if (!pend) break; // 0, or a pre-#1202 shell without the field
      await sleep(100);
    }
    if (pend) fail(`G: the keys' staged leave never settled (keysPending ${pend})`);
    const rest = await c.eval(`(async () => {
      const room = await import('/scene/room.js');
      const scene = window.__dbg.scene;
      return {
        open: window.__shell.isOpen(),
        emitters: room.activeRoom.instance.lightRefs.rectLights
          .map((l) => l.intensity),
        shellLight: !!scene.getObjectByName('obShellLight'),
        mask: window.__dbg.camera.layers.mask,
        cue: scene.getObjectByName('obCueStick')?.visible ?? null,
        pg: scene.getObjectByName('obAimPreview')?.visible ?? null,
        state: __test.state(),
      };
    })()`);
    if (rest.open) fail('G: quick-play left the shell open');
    if (!rest.emitters.every((v, i) => v === bases[i])) {
      fail(`G: emitter restore not exact: ${JSON.stringify(rest.emitters)}`
        + ` vs bases ${JSON.stringify(bases)}`);
    }
    if (rest.shellLight) fail('G: obShellLight still in the scene after exit');
    if ((rest.mask & 2) !== 0) fail('G: camera layer 1 still enabled after exit');
    if (rest.state === 'AIM' && rest.cue !== true) {
      fail('G: cue rod not restored on the live table');
    }
    if (rest.pg !== true) fail('G: preview group not restored after exit');
    // pill re-open applies the state again (the mid-session open path)
    await clickEl(c, '#ob-shell-open');
    let vs3 = null;
    for (let i = 0; i < 40; i++) {
      vs3 = await c.eval('window.__shell.visualState()').catch(() => null);
      if (vs3 && !vs3.ramping && vs3.glareK === 1 && vs3.keys === 2
        && !vs3.keysPending) break;
      await sleep(150);
    }
    if (!vs3 || vs3.keys !== 2 || !vs3.camLayer1 || vs3.cueHidden !== true) {
      fail('G: pill re-open did not re-apply the visual state: '
        + JSON.stringify(vs3));
    } else {
      console.log(`G: the keys' light-set changes landed '${vs3.keysStage}' (#1202)`);
      console.log('G OK: shell-open visual state (keys + glare ×0.85 + hides'
        + ' + bake bracket + exact exit restore + pill re-apply)');
    }
    await gateErrors(c, errs, 'G');
  }
  c.close();
}
// G3 (#1202 build 21): the covered FRESH boot's first keys draw lands behind the overlay, on cold profiles, on the
// late arrival and past a planted re-bake — web/tools/e2e-shell-g3cold.mjs (its own browser on CDP +11, a fresh
// profile per row)
await armG3Cold({ PORT, CDP_PORT, fail });
// GW (#1202 batch 2): a keys change main's __obStage still holds when cinelight's studio window opens never lands
// inside it, and is handed over again after it — web/tools/e2e-shell-gw.mjs (its own browser on CDP +11, after G3
// has closed, so PORT_INVENTORY is unchanged)
await armGW({ PORT, CDP_PORT, fail });

// ---- H) strip SELECTION OUTRANKS HOVER (kit law; GH-525 integrator) --------
// Until 2026-09-05 kit.css's strip hover rung (0,3,0) outranked the selected
// pill rule (0,2,0): after a REAL click with the pointer left resting on the
// pill, or a phone TAP (touch hover is sticky until the next tap), the
// CURRENT place pill painted as an unselected hovered pill (--ob-bg-2) — the
// pill probe (internal log) and every
// real-user clip showed it DARK while posed obshell=1 stills (never hovered)
// showed it FILLED. Both registers, both REAL inputs, paint read in the same
// tick as :hover (asserted TRUE on the desktop leg — a leg that never hovers
// proves nothing). Reference colours resolve from the tokens on a probe
// element in this document, never literals. Slots: +6 after G closed, +5
// after F closed (the band's 10 CDP ports stay the inventory).
const pillPaintExpr = `(() => {
  const tok = (v) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:-9999px;top:0;background:' + v;
    document.body.appendChild(d);
    const c = getComputedStyle(d).backgroundColor;
    d.remove();
    return c;
  };
  const ref = { fill: tok('var(--ob-accent-dim-3)'),
    // hover rung = the glass-strip ivory WASH (GH-668 B-K15: --ob-line-0
    // 8 %, no longer the opaque --ob-bg-2 slab punched into the smoke)
    line: tok('var(--ob-accent-line)'), hover: tok('var(--ob-line-0)') };
  const p = document.querySelector('#ob-shell-rail [aria-current="true"]');
  const q = document.querySelector('#ob-shell-rail .ob-shell-place:hover');
  const read = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { place: el.dataset.place, hover: el.matches(':hover'),
      focusVisible: el.matches(':focus-visible'),
      bg: cs.backgroundColor, border: cs.borderColor };
  };
  return { ref, current: read(p), hovered: read(q),
    boot: window.__shell.state().boot };
})()`;
// GH-1111: the H legs wait for a pill's PAINT instead of sleeping a fixed 300 ms. A main-thread long task inside that
// window (the preview ink's synchronous GPU readback, 70-334 ms measured) delays the pill's 120 ms transition
// (--ob-t-fast) past any fixed sleep, and the read caught it part-way (alpha 0 or 0.0795 of 0.08). The wait is bounded
// by an EVENT, the predicate on pillPaintExpr's reading (the expected token reached), and gives up only once BOTH 60
// animation frames AND 2 s have passed since it began: a long task passes time without frames and fast frames pass
// without time, so neither alone ends it early. It resolves to the last reading, with `settle` stats.
const pillSettledExpr = (pred) => `(async () => {
  const t0 = performance.now(); let frames = 0, r = null;
  for (;;) {
    r = ${pillPaintExpr};
    if (${pred}) return { ...r, settle: { ok: true, frames, ms: Math.round(performance.now() - t0) } };
    if (frames >= 60 && performance.now() - t0 >= 2000) return { ...r, settle: { ok: false, frames, ms: Math.round(performance.now() - t0) } };
    await new Promise((res) => requestAnimationFrame(res)); frames++;
  }
})()`;
const PILL_FILLED = (place) => `!!r.current && r.current.place === '${place}' && r.current.bg === r.ref.fill && r.current.border === r.ref.line`;
const PILL_HOVER_RUNG = (place) => `!!r.hovered && r.hovered.place === '${place}' && r.hovered.bg === r.ref.hover`;
const judgeCurrentPill = (tag, r, want) => {
  if (!r || !r.current) { fail(`${tag}: no aria-current pill to read`); return; }
  const cur = r.current;
  const bad = [];
  if (cur.place !== want) bad.push(`current pill is '${cur.place}', want '${want}'`);
  if (cur.bg !== r.ref.fill) bad.push(`background ${cur.bg} !== fill ${r.ref.fill}`);
  if (cur.border !== r.ref.line) bad.push(`border ${cur.border} !== line ${r.ref.line}`);
  if (cur.bg === r.ref.hover) bad.push(`background is the hover rung ${r.ref.hover}`);
  if (bad.length) {
    fail(`${tag}: the SELECTED pill must keep the accent fill under hover `
      + `(hover=${cur.hover}, focusVisible=${cur.focusVisible}, boot=${r.boot}): `
      + bad.join('; '));
  } else {
    console.log(`${tag} OK: current '${cur.place}' pill FILLED with :hover=`
      + `${cur.hover} (bg ${cur.bg}, border ${cur.border})`);
  }
};
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('H: real-user boot never became ready');
  else if (!(await waitLanded(c, 'play'))) fail('H: fresh settle never landed');
  else {
    // a REAL click: move onto the pill, press, release — and LEAVE the
    // pointer there (clickEl never moves the pointer; this leg must)
    const pt = await c.eval(`(() => {
      const r = document.querySelector('#ob-shell-rail [data-place="practice"]')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    if (!(await waitLanded(c, 'practice'))) fail('H: rail click → practice never landed');
    // past the pill's own transition, pointer still resting (GH-1111: a bounded wait for the filled paint, not 300 ms)
    const r = await c.eval(pillSettledExpr(PILL_FILLED('practice')));
    if (r && r.current && r.current.hover !== true) {
      fail('H desktop: the pointer must still REST on the clicked pill '
        + '(:hover true) for this leg to prove anything: ' + JSON.stringify(r.current));
    }
    judgeCurrentPill('H desktop (real click, pointer resting)', r, 'practice');
    // the hover rung itself still stands on a NON-current pill: hover
    // 'replays' without clicking → --ob-bg-2 (the fix narrows the rung,
    // it must not remove it)
    const pt2 = await c.eval(`(() => {
      const r = document.querySelector('#ob-shell-rail [data-place="replays"]')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt2.x, y: pt2.y });
    const r2 = await c.eval(pillSettledExpr(PILL_HOVER_RUNG('replays'))); // GH-1111: bounded wait, not 300 ms
    if (!r2.hovered || r2.hovered.place !== 'replays' || r2.hovered.bg !== r2.ref.hover) {
      fail('H desktop: a hovered NON-current pill must take the hover rung '
        + `(${r2.ref.hover}): ` + JSON.stringify({ ...r2.hovered, settle: r2.settle }));
    } else if (r2.current.bg !== r2.ref.fill) {
      fail('H desktop: the current pill lost its fill when the pointer left: '
        + JSON.stringify(r2.current));
    } else {
      console.log(`H desktop OK: hovered non-current '${r2.hovered.place}' takes `
        + `the hover rung (${r2.hovered.bg}); current stays FILLED`);
    }
    await gateErrors(c, errs, 'H desktop');
  }
  c.close();
}
{ // phone: a REAL tap, then NO further input — the touch hover is sticky
  const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('H phone: real-user boot never became ready');
  else if (!(await waitLanded(c, 'play', 60))) fail('H phone: settle never landed');
  else {
    const pt = await c.eval(`(() => {
      const r = document.querySelector('#ob-shell-rail [data-place="practice"]')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await touchStart(c, [pt]);
    await touchEnd(c);
    if (!(await waitLanded(c, 'practice'))) fail('H phone: rail tap → practice never landed');
    const r = await c.eval(pillSettledExpr(PILL_FILLED('practice'))); // GH-1111: bounded wait, not 300 ms
    // hover after a tap is Chrome's sticky touch-hover (the probe recorded
    // TRUE on this build); the law is about the PAINT, so it is judged
    // regardless and the hover state is disclosed in the line
    judgeCurrentPill(`H phone (real tap, no further input, :hover=${r?.current?.hover})`,
      r, 'practice');
    await gateErrors(c, errs, 'H phone');
  }
  c.close();
}

// ---- Q) S4 journey-QA fix round (GH-676/678/679/682/685) ------------------
// Shared helpers: REAL key presses (the kbd-exit-focus verifier shape), a
// focus sampler, a scroll-into-view + hit-checked centre, phone hold gestures.
const Q_KEYS = {
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
};
async function qPress(c, name) {
  const k = Q_KEYS[name];
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk, modifiers: 0 };
  await c.send('Input.dispatchKeyEvent',
    k.text ? { type: 'keyDown', text: k.text, ...base } : { type: 'rawKeyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function qWaitFor(c, expr, tries = 60, ms = 100) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
}
const qCentre = (c, sel) => c.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
/** scrolled into view + hit-checked centre (a real user scrolls to it).
 * GH-668 S5 slice 4 verifier fix round 1 (integrator-authorized shared-suite
 * hunk #2): the rect and the hit test are read AFTER the 250 ms settle. The
 * programmatic scroll's own scroll event fires inside that window and a
 * column with a fold-snap law (the practice place, kit foldsnap) re-snaps to
 * its stop there — a point read before the settle was STALE by the snap
 * (Q4(3) '#ob-practice-assist-title': title read at 158, held at 195 = the
 * Free-practice button under the finger). For a target that does not move
 * during the settle the reorder changes nothing.
 * #1116: the fixed 250 ms was itself a guess. The practice column's
 * fold-snap answers the instant scroll to centre (37 px) with a SMOOTH
 * scroll back to its stop; under load that slide outlived 250 ms, the point
 * was read mid-slide, the hold landed while the column still moved (the
 * card hold disarms on any scroll) and the release clicked the
 * Free-practice button that slid under the finger. The point is now read
 * only once the element RESTS — its rect unchanged across 4 animation
 * frames AND >= 150 ms since the last document scroll event — bounded at
 * 4 s: `settled: false` (with `waitedMs`) is the callers' named red, never
 * a skip. */
async function qVisibleCentre(c, sel) {
  return c.eval(`(async () => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    let lastScroll = performance.now();
    const onScroll = () => { lastScroll = performance.now(); };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    const t0 = performance.now();
    let prev = null;
    let same = 0;
    const rested = () => same >= 4 && performance.now() - lastScroll >= 150;
    while (!rested() && performance.now() - t0 < 4000) {
      await new Promise((res) => requestAnimationFrame(res));
      const r = el.getBoundingClientRect();
      const key = r.x.toFixed(1) + ',' + r.y.toFixed(1);
      same = key === prev ? same + 1 : 0;
      prev = key;
    }
    document.removeEventListener('scroll', onScroll, true);
    const b = el.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, settled: rested(), waitedMs: Math.round(performance.now() - t0),
      onTarget: !!hit && (hit === el || el.contains(hit)),
      hit: hit ? hit.tagName + '.' + hit.className : null };
  })()`);
}
async function qMouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent',
    { type, x, y, button: 'left', clickCount: 1 });
}
const Q_AE = `(() => { const a = document.activeElement; return a ? { tag: a.tagName,
  id: a.id, ob: a.dataset?.ob ?? null, body: a === document.body,
  vis: typeof a.checkVisibility === 'function' ? a.checkVisibility() : null } : null; })()`;
async function qSampleFocus(c, ms = 600, step = 50) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { out.push(await c.eval(Q_AE)); await sleep(step); }
  return out;
}
function qJudgeFocus(tag, samples) {
  const bad = samples.filter((s) => !s || s.body || s.vis === false);
  if (bad.length) {
    fail(`${tag}: focus on <body>/invisible at ${bad.length}/${samples.length} samples: `
      + JSON.stringify(samples.map((s) => (s ? (s.id || s.ob || s.tag) : 'null'))));
  } else console.log(`${tag} OK: focus never on <body>; landed ${JSON.stringify(samples.at(-1))}`);
}
/** Boot precondition for the Q arms: ready, the opening settle LANDED at
 * play (the suite's own arm idiom — under a loaded runner the boot settle
 * can outlive a bare arrival-flag wait, and a rail click that lands on the
 * overlay never lands the place) and the arrival flag. */
async function qBoot(c, tag) {
  if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return false; }
  if (!(await waitLanded(c, 'play', 100))) { fail(`${tag}: the boot settle never landed at play`); return false; }
  await qWaitFor(c, `window.__obShellArrival === 'done'`, 50);
  return true;
}
/** REAL rail click → landed at `id` (one retry: a click inside a late
 * settle is a lawful cut whose landing poll may expire under load) */
async function qRailTo(c, id) {
  for (let i = 0; i < 2; i++) {
    await clickEl(c, `#ob-shell-rail [data-place="${id}"]`);
    if (await waitLanded(c, id)) return true;
  }
  return false;
}
async function qTabTo(c, pred, max = 10) {
  for (let i = 0; i < max; i++) {
    await qPress(c, 'Tab');
    await sleep(60);
    if (await c.eval(pred)) return true;
  }
  return false;
}
async function qTap(c, pt) {
  await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
  await sleep(40);
  await touchEnd(c);
}
async function qHold(c, pt, { rest = 700, moves = [] } = {}) {
  await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
  await sleep(rest);
  let { x, y } = pt;
  for (const m of moves) {
    x += m.dx; y += m.dy;
    await touchMove(c, [{ x, y, id: 1 }]);
    await sleep(m.wait);
  }
  await touchEnd(c);
}
// ---- Q1) GH-678: #ob-shell-open accessible name from first paint ------------
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  const readPill = `(() => { const p = document.getElementById('ob-shell-open');
    return p ? { title: p.title || null, aria: p.getAttribute('aria-label'),
      want: window.__i18n?.t?.('shell.open') ?? null, hidden: p.hidden } : null; })()`;
  const named = (r) => !!r && !!r.want && r.title === r.want && r.aria === r.want;
  if (await qBoot(c, 'Q1')) {
    const a = await c.eval(readPill);
    if (!named(a)) fail('Q1(a) boot: the hall pill has no accessible name: ' + JSON.stringify(a));
    else console.log('Q1(a) OK: pill named at boot ' + JSON.stringify(a));
    await clickEl(c, '#ob-shell-quickplay'); // REAL Play now
    await sleep(400);
    const b = await c.eval(readPill);
    if (!named(b) || b.hidden) fail('Q1(b) after Play now: ' + JSON.stringify(b));
    else console.log('Q1(b) OK: pill named after a real Play now ' + JSON.stringify(b));
    await c.send('Accessibility.enable');
    const tree = await c.send('Accessibility.getFullAXTree', {});
    const buttons = (tree.nodes || []).filter((n) => !n.ignored && n.role?.value === 'button');
    const empty = buttons.filter((n) => !(n.name?.value));
    const pillNode = buttons.find((n) => n.name?.value === b?.want);
    const src = pillNode?.name?.sources?.some((x) => x.attribute === 'aria-label' && x.value?.value === b?.want);
    if (empty.length || !pillNode || !src) {
      fail(`Q1(b) AX: ${empty.length} empty-named button(s) of ${buttons.length}; `
        + `pill node ${pillNode ? 'found' : 'missing'}, aria-label source ${src ? 'yes' : 'no'}`);
    } else console.log(`Q1(b) OK: AX tree has 0 empty-named buttons of ${buttons.length}; pill named by aria-label`);
    // the flips are AWAITED and the pill read SETTLED (the K05 / GH-1110
    // law, web/tools/lib/locale-settle.mjs): the fixed 200 ms sleep read the
    // en name under de whenever a starved host served the dictionary late
    const fde = await flipLocale(c, 'de');
    if (!fde?.applied) fail(`Q1(c) de: the locale switch did not land cleanly (${JSON.stringify(fde)})`);
    const d = (await settledRead(c, readPill)).value;
    if (!named(d) || d.title === b?.title) fail('Q1(c) de: ' + JSON.stringify(d));
    const fen = await flipLocale(c, 'en');
    if (!fen?.applied) fail(`Q1(c) back to en: the locale switch did not land cleanly (${JSON.stringify(fen)})`);
    const e = (await settledRead(c, readPill)).value;
    if (!named(e) || e.title !== b?.title) fail('Q1(c) back to en: ' + JSON.stringify(e));
    else console.log(`Q1(c) OK: locale round-trip de "${d?.title}" → en "${e.title}"`);
    await gateErrors(c, errs, 'Q1 desktop');
  }
  c.close();
  // (d) the phone register — named from first paint regardless of the
  // ob-touch register flip ordering (the incidental relabel path)
  const pErrs = [];
  const p = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(p, pErrs);
  if (await qBoot(p, 'Q1(d) phone')) {
    const r = await p.eval(readPill);
    if (!named(r)) fail('Q1(d) phone boot: ' + JSON.stringify(r));
    else console.log('Q1(d) OK: phone pill named at boot ' + JSON.stringify(r));
    await gateErrors(p, pErrs, 'Q1 phone');
  }
  p.close();
}
// ---- Q2) GH-679: same-task re-racking pick after the gate's cutToEnd -------
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  const anchorDist = `(() => {
    const a = window.__atelier.registry().find((s) => s.id === 'balls').anchor;
    const p = window.__shell.pose();
    return { d: Math.hypot(p.target[0] - a.tx, p.target[1] - a.ty, p.target[2] - a.tz,
      p.radius - a.radius, p.theta - a.theta, p.phi - a.phi),
    moving: window.__shell.moving(), kit: window.__test.equipment().ballset_id,
    txbar: document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false,
    station: window.__atelier.station() }; })()`;
  const CARD = '.ob-cardrail-card[data-id="pool_black_cap"]';
  // cues (settled) → balls: returns once the balls flight is IN PROGRESS
  const stage = async () => {
    await clickEl(c, '#ob-atelier-carousel [data-station="cues"]');
    if (!(await qWaitFor(c, `window.__shell.moving() === false && window.__atelier.station() === 'cues'`, 60))) return false;
    await sleep(200);
    await clickEl(c, '#ob-atelier-carousel [data-station="balls"]');
    return qWaitFor(c, `window.__shell.moving() === true`, 20, 10);
  };
  const landed = (r) => r.kit === 'pool_black_cap' && r.txbar && !r.moving && r.d <= 1e-6;
  const revert = async () => { await clickEl(c, '[data-ob="atelier-revert"]'); await sleep(400); };
  if (await qBoot(c, 'Q2')) {
    if (!(await qRailTo(c, 'equipment'))) fail('Q2: equipment never landed');
    else if (!(await qWaitFor(c, `typeof window.__atelier === 'object' && !!document.querySelector('#ob-atelier-carousel [data-station="balls"]')`, 80))) fail('Q2: atelier never mounted');
    else {
      // (a) REAL Enter on the focused rail card mid-flight (keydown activation
      // = the same input task as the gate's cutToEnd)
      if (!(await stage())) fail('Q2(a): the balls flight never started');
      else {
        await c.eval(`document.querySelector(${JSON.stringify(CARD)}).focus(), true`);
        await qPress(c, 'Enter');
        await sleep(1000);
        const r = await c.eval(anchorDist);
        if (!landed(r)) fail('Q2(a) Enter mid-flight stranded the camera off the balls anchor: ' + JSON.stringify(r));
        else console.log('Q2(a) OK: Enter mid-flight → kit applied, camera ON the anchor ' + JSON.stringify(r));
        await revert();
      }
      // (b) a 0 ms mouse press/release on the (scrolled-into-view) card centre
      if (!(await stage())) fail('Q2(b): the balls flight never started');
      else {
        const pt = await c.eval(`(() => { const el = document.querySelector(${JSON.stringify(CARD)});
          el.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
          const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
          return { x, y, onCard: document.elementFromPoint(x, y)?.closest('[data-id]') === el,
            moving: window.__shell.moving() }; })()`);
        if (!pt.onCard || !pt.moving) fail('Q2(b) precondition: card not hittable mid-flight: ' + JSON.stringify(pt));
        await qMouse(c, 'mousePressed', pt.x, pt.y);
        await qMouse(c, 'mouseReleased', pt.x, pt.y);
        await sleep(1000);
        const r = await c.eval(anchorDist);
        if (!landed(r)) fail('Q2(b) 0 ms click mid-flight stranded the camera: ' + JSON.stringify(r));
        else console.log('Q2(b) OK: 0 ms click mid-flight → kit applied, camera ON the anchor ' + JSON.stringify(r));
        await revert();
      }
      // controls: a canvas press mid-flight cuts to the anchor (§3(3)) with the
      // kit untouched; a SETTLED pick leaves the pose on the anchor
      if (!(await stage())) fail('Q2(c): the balls flight never started');
      else {
        await qMouse(c, 'mousePressed', 640, 60);
        await qMouse(c, 'mouseReleased', 640, 60);
        await sleep(300);
        const r = await c.eval(anchorDist);
        if (r.d > 1e-6 || r.kit === 'pool_black_cap') fail('Q2(c) canvas click mid-flight: ' + JSON.stringify(r));
        else console.log('Q2(c) OK: canvas click mid-flight cuts to the anchor, kit untouched');
        await c.eval(`document.querySelector(${JSON.stringify(CARD)}).scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' }), true`);
        await sleep(50);
        await clickEl(c, CARD);
        await sleep(600);
        const s = await c.eval(anchorDist);
        if (!landed(s)) fail('Q2(d) settled pick moved the camera / never applied: ' + JSON.stringify(s));
        else console.log('Q2(d) OK: settled pick applies with the pose untouched');
      }
    }
    await gateErrors(c, errs, 'Q2');
  }
  c.close();
}
// ---- Q3) GH-682: hall→table exits hand focus to a visible successor -------
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  const reopen = async () => { await clickEl(c, '#ob-shell-open'); await sleep(600); };
  if (await qBoot(c, 'Q3')) {
    // (A) keyboard: Tab to Play now + Enter; the next Tab is a live control
    if (!(await qTabTo(c, `document.activeElement?.id === 'ob-shell-quickplay'`))) fail('Q3(A): Tab never reached Play now');
    else {
      await qPress(c, 'Enter');
      qJudgeFocus('Q3(A) Enter on Play now', await qSampleFocus(c));
      await qPress(c, 'Tab');
      await sleep(80);
      const t = await c.eval(Q_AE);
      if (!t || t.body || t.vis === false) fail('Q3(A): the next Tab after the exit is a dead press: ' + JSON.stringify(t));
      else console.log('Q3(A) OK: next Tab → ' + JSON.stringify(t));
    }
    // (D) a REAL mouse click on Play now
    await reopen();
    await clickEl(c, '#ob-shell-quickplay');
    qJudgeFocus('Q3(D) real click on Play now', await qSampleFocus(c));
    // (B) switch-game confirm → Continue (the dialog's prevFocus is the card
    // the exit hid; its close must not land on <body>)
    await reopen();
    if (!(await qTabTo(c, `document.activeElement?.dataset?.ob === 'play-game'`, 12))) fail('Q3(B): Tab never reached a game card');
    else {
      await qPress(c, 'ArrowRight');
      await sleep(100);
      const g = await c.eval(`document.activeElement?.dataset?.game ?? null`);
      await qPress(c, 'Enter');
      if (!(await qWaitFor(c, `!!document.querySelector('[data-ob="confirm-accept"]')`, 30))) fail('Q3(B): no switch-game confirm for ' + g);
      else if (!(await qTabTo(c, `document.activeElement?.dataset?.ob === 'confirm-accept'`, 3))) fail('Q3(B): Tab never reached Continue');
      else {
        await qPress(c, 'Enter');
        qJudgeFocus(`Q3(B) Continue in the switch-game confirm (${g})`, await qSampleFocus(c, 900));
        // build 20: the switch progress overlay shields input until the new
        // table's first settled frame — the next leg's reopen waits it out
        if (!(await qWaitFor(c, `!document.querySelector('[data-ob="switch-progress"]')`, 300))) fail('Q3(B): the switch overlay never left');
      }
    }
    // (C) practice card Drills → Escape: returns to #ob-drills or the
    // documented successor (#shoot — the exit's handoff is the dialog's
    // captured prevFocus)
    await reopen();
    if (!(await qRailTo(c, 'practice'))) fail('Q3(C): practice never landed');
    else if (!(await qWaitFor(c, `!!document.querySelector('[data-ob="practice-drills"] button')`, 60))) fail('Q3(C): practice content never mounted');
    else {
      await c.eval(`document.querySelector('[data-ob="practice-drills"] button').focus(), true`);
      await qPress(c, 'Enter');
      if (!(await qWaitFor(c, `document.activeElement?.id === 'ob-drills-close'`, 30))) fail('Q3(C): the drills dialog never took focus: ' + JSON.stringify(await c.eval(Q_AE)));
      else {
        await qPress(c, 'Escape');
        const s = await qSampleFocus(c, 700);
        qJudgeFocus('Q3(C) Escape from the practice-opened drills dialog', s);
        const last = s.at(-1);
        if (last && !['ob-drills', 'shoot'].includes(last.id)) fail('Q3(C): focus must return to #ob-drills or the documented successor #shoot, got ' + JSON.stringify(last));
      }
    }
    await gateErrors(c, errs, 'Q3');
  }
  c.close();
}
// ---- Q3P) GH-682 review r1 P2: the successor law WITHOUT checkVisibility ---
// iOS 16–17.3 WKWebView (a supported floor) has no Element.checkVisibility.
// Phone layout: touch.css hides `#hud > .row` (display:none — #power's
// ancestor), and with #shoot DISABLED (flow.js setButtons: canShoot is false
// outside AIM/BALL_IN_HAND — the WIN button law; pinned on the button
// directly because a WIN under the OPEN shell auto-reracks in 2.6 s — arm D
// — and would re-enable #shoot before a real exit lands) the pre-fix
// predicate accepted #power, focus() was a no-op on it and no canvas/pill
// fallback ran: focus stayed in the hidden hall or fell to <body>. A
// test-only shim deletes the API BEFORE boot; the exit must land focus on a
// VISIBLE control or the canvas — never a display:none ancestor's child,
// never <body>. Desktop control (same shim, same disabled #shoot): the
// successor is a visible #hud control, not the canvas — the fallback walk
// must not over-reject.
{
  const SHIM = { source: 'delete Element.prototype.checkVisibility;' };
  const VIS = `(() => { const a = document.activeElement;
    if (!a) return null;
    let hiddenAnc = null;
    for (let n = a; n && n.nodeType === 1; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') { hiddenAnc = n.id || n.className || n.tagName; break; }
    }
    return { tag: a.tagName, id: a.id, ob: a.dataset?.ob ?? null, body: a === document.body,
      api: typeof a.checkVisibility, box: a.getClientRects().length > 0, hiddenAnc,
      cssVis: getComputedStyle(a).visibility, hud: !!a.closest('#hud'),
      shootDisabled: document.getElementById('shoot')?.disabled ?? null,
      open: window.__shell.isOpen() }; })()`;
  const landedVisible = (s) => !!s && !s.body && s.box && !s.hiddenAnc && s.cssVis === 'visible';
  // (a) PHONE: the red arm
  {
    const errs = [];
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?u=cv0`,
      { cdpPort: CDP_PORT + 5, tool: false });
    watchErrors(c, errs);
    await c.send('Page.addScriptToEvaluateOnNewDocument', SHIM);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=cv1` });
    if (await qBoot(c, 'Q3P phone')) {
      const api = await c.eval(`typeof Element.prototype.checkVisibility`);
      if (api !== 'undefined') fail('Q3P phone: the checkVisibility shim did not land: ' + api);
      await c.eval(`document.getElementById('shoot').disabled = true;
        document.getElementById('ob-shell-quickplay').focus(); true`);
      await qTap(c, await qCentre(c, '#ob-shell-quickplay')); // REAL Play now tap
      await sleep(500);
      const s = await c.eval(VIS);
      if (!s || s.open) fail('Q3P phone: the Play now tap did not exit the hall: ' + JSON.stringify(s));
      else if (s.shootDisabled !== true) fail('Q3P phone: precondition lost — #shoot re-enabled before the sample: ' + JSON.stringify(s));
      else if (!landedVisible(s)) fail('Q3P phone: exit with #shoot disabled and no checkVisibility left focus on ' + JSON.stringify(s));
      else console.log('Q3P phone OK: exit landed a visible successor ' + JSON.stringify(s));
      await gateErrors(c, errs, 'Q3P phone');
    }
    c.close();
  }
  // (b) DESKTOP control: a visible #hud control is still preferred over the canvas
  {
    const errs = [];
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=cv2`,
      { port: CDP_PORT + 6, tool: false });
    watchErrors(c, errs);
    await c.send('Page.addScriptToEvaluateOnNewDocument', SHIM);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=cv3` });
    if (await qBoot(c, 'Q3P desktop')) {
      const api = await c.eval(`typeof Element.prototype.checkVisibility`);
      if (api !== 'undefined') fail('Q3P desktop: the checkVisibility shim did not land: ' + api);
      await c.eval(`document.getElementById('shoot').disabled = true, true`);
      if (!(await qTabTo(c, `document.activeElement?.id === 'ob-shell-quickplay'`))) fail('Q3P desktop: Tab never reached Play now');
      else {
        await qPress(c, 'Enter');
        await sleep(500);
        const s = await c.eval(VIS);
        if (!s || s.open) fail('Q3P desktop: Enter on Play now did not exit the hall: ' + JSON.stringify(s));
        else if (!landedVisible(s) || !s.hud || s.id === 'shoot') fail('Q3P desktop: expected a visible #hud control (not #shoot, not the canvas), got ' + JSON.stringify(s));
        else console.log('Q3P desktop OK: exit landed ' + JSON.stringify(s));
      }
      await gateErrors(c, errs, 'Q3P desktop');
    }
    c.close();
  }
}
// ---- Q3U) GH-682 review r2 P2: the successor law WITHOUT navigator.userActivation
// iOS 16.0–16.3 WKWebView (feature 016 (internal spec): the 16.0 floor) has no
// navigator.userActivation, and on every WebKit a button tap never moves
// focus (activeElement stays <body>). r1 read focus AFTER exitToTable hid
// the shell and rescued the <body> state ONLY through hasBeenActive — so a
// real Play now tap there exited with focus stranded on <body>. Test-only
// shim, installed BEFORE boot: delete the API from Navigator.prototype and
// reproduce the WebKit tap law (a button's mousedown is default-prevented —
// Blink's in-engine form of "the tap never focuses the button"; the click
// still fires). (a) PHONE: a REAL Play now tap with nothing focused must
// land a visible successor (#shoot / a visible #hud control / the canvas),
// never <body>. (b) DESKTOP: Enter at the root with nothing focused (the
// FR-007(1) activation path) under the same shim must land the same law.
// Pre-fix bytes: both arms sample <body> (red-proved, GH-682 review r2).
{
  const SHIM = { source: 'delete Navigator.prototype.userActivation;'
    + " addEventListener('mousedown', (e) => { if (e.target?.closest?.('button')) e.preventDefault(); }, true);" };
  const VIS = `(() => { const a = document.activeElement;
    if (!a) return null;
    let hiddenAnc = null;
    for (let n = a; n && n.nodeType === 1; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') { hiddenAnc = n.id || n.className || n.tagName; break; }
    }
    return { tag: a.tagName, id: a.id, ob: a.dataset?.ob ?? null, body: a === document.body,
      ua: typeof navigator.userActivation, box: a.getClientRects().length > 0, hiddenAnc,
      cssVis: getComputedStyle(a).visibility, hud: !!a.closest('#hud'), canvas: a.tagName === 'CANVAS',
      inShell: !!a.closest('#ob-shell'), open: window.__shell.isOpen() }; })()`;
  const landedLawful = (s) => !!s && !s.body && !s.inShell && s.box && !s.hiddenAnc
    && s.cssVis === 'visible' && (s.id === 'shoot' || s.hud || s.canvas);
  // (a) PHONE: a REAL Play now tap, nothing focused (the WebKit tap law)
  {
    const errs = [];
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?u=ua0`,
      { cdpPort: CDP_PORT + 5, tool: false });
    watchErrors(c, errs);
    await c.send('Page.addScriptToEvaluateOnNewDocument', SHIM);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ua1` });
    if (await qBoot(c, 'Q3U phone')) {
      const api = await c.eval(`typeof navigator.userActivation`);
      if (api !== 'undefined') fail('Q3U phone: the userActivation shim did not land: ' + api);
      const pre = await c.eval(VIS);
      if (!pre?.body) fail('Q3U phone: precondition lost — something holds focus before the tap: ' + JSON.stringify(pre));
      await qTap(c, await qCentre(c, '#ob-shell-quickplay')); // REAL Play now tap
      await sleep(500);
      const s = await c.eval(VIS);
      if (!s || s.open) fail('Q3U phone: the Play now tap did not exit the hall: ' + JSON.stringify(s));
      else if (!landedLawful(s)) fail('Q3U phone: exit without navigator.userActivation left focus on ' + JSON.stringify(s));
      else console.log('Q3U phone OK: exit landed a visible successor ' + JSON.stringify(s));
      await gateErrors(c, errs, 'Q3U phone');
    }
    c.close();
  }
  // (b) DESKTOP: Enter at the root with nothing focused (FR-007(1))
  {
    const errs = [];
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=ua2`,
      { port: CDP_PORT + 6, tool: false });
    watchErrors(c, errs);
    await c.send('Page.addScriptToEvaluateOnNewDocument', SHIM);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ua3` });
    if (await qBoot(c, 'Q3U desktop')) {
      const api = await c.eval(`typeof navigator.userActivation`);
      if (api !== 'undefined') fail('Q3U desktop: the userActivation shim did not land: ' + api);
      const pre = await c.eval(VIS);
      if (!pre?.body) fail('Q3U desktop: precondition lost — something holds focus before Enter: ' + JSON.stringify(pre));
      await qPress(c, 'Enter');
      await sleep(500);
      const s = await c.eval(VIS);
      if (!s || s.open) fail('Q3U desktop: Enter at the root did not exit the hall: ' + JSON.stringify(s));
      else if (!landedLawful(s)) fail('Q3U desktop: exit without navigator.userActivation left focus on ' + JSON.stringify(s));
      else console.log('Q3U desktop OK: exit landed ' + JSON.stringify(s));
      await gateErrors(c, errs, 'Q3U desktop');
    }
    c.close();
  }
}
// ---- Q4) GH-676: card hold = still press, commit on release, no ghost click
{
  const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  const STATE = `({ open: window.__shell.isOpen(), picker: window.__drills?.isOpen?.() ?? null,
    drill: window.__drills?.state?.()?.id ?? null, mode: window.__settings?.get?.().mode ?? null,
    clicks: window.__qaClicks ?? null, scroll: document.getElementById('ob-practice')?.scrollTop ?? null })`;
  // capture-phase click counter: ANY click into the picker / DVR chrome
  // after a hold is a ghost click. ONE listener per pass, removed after the
  // pass (#1116: a listener per pass that was never removed stacked, so one
  // click read as clicks.all 2 on the second pass)
  const COUNTER = `(() => { window.__qaClicksOff?.(); window.__qaClicks = { all: 0, ghost: 0 };
    const count = (e) => { window.__qaClicks.all++;
      if (e.target.closest?.('[data-drill], #ob-drills-close, .ob-pb-root, #ob-drills-panel')) window.__qaClicks.ghost++; };
    window.addEventListener('click', count, true);
    window.__qaClicksOff = () => { window.removeEventListener('click', count, true); window.__qaClicksOff = null; };
    return true; })()`;
  const COUNTER_OFF = '(window.__qaClicksOff?.(), true)';
  const toPractice = async () => {
    await c.eval(`window.__drills?.close?.(), true`); await sleep(200);
    await c.eval(`__shell.isOpen() || __shell.openShell(), true`); await sleep(300);
    await qTap(c, await qCentre(c, '#ob-shell-rail [data-place="practice"]')); // REAL rail tap
    if (!(await waitLanded(c, 'practice'))) return false;
    return qWaitFor(c, `!!document.querySelector('#ob-practice-assist-title') && window.__shell.contentState().mounted.includes('practice')`, 60);
  };
  if (await qBoot(c, 'Q4 phone')) {
    // 1. REST-THEN-SCROLL: 650 ms still, then a flick — scrolls, never fires
    if (!(await toPractice())) fail('Q4(1): practice never mounted on the phone');
    else {
      const s0 = await c.eval(STATE);
      await qHold(c, await qCentre(c, '#ob-practice-assist-title'),
        { rest: 650, moves: Array.from({ length: 8 }, () => ({ dx: 0, dy: -10, wait: 30 })) });
      await sleep(400);
      const s1 = await c.eval(STATE);
      if (!s1.open || s1.picker) fail('Q4(1) rest-then-scroll fired the card primary: ' + JSON.stringify(s1));
      else console.log(`Q4(1) OK: rest-then-scroll → shell open, no picker (scrollTop ${s0.scroll} → ${s1.scroll})`);
    }
    // 2. CREEP: 1 px / 100 ms for 1 s inside the browser's pan slop
    if (!(await toPractice())) fail('Q4(2): practice never re-landed');
    else {
      await qHold(c, await qCentre(c, '#ob-practice-assist-title'),
        { rest: 0, moves: Array.from({ length: 10 }, () => ({ dx: 0, dy: -1, wait: 100 })) });
      await sleep(400);
      const s2 = await c.eval(STATE);
      if (!s2.open || s2.picker) fail('Q4(2) creep fired the card primary: ' + JSON.stringify(s2));
      else console.log('Q4(2) OK: 1 px creep → shell open, no picker');
    }
    // 3. HOLD-RELEASE: a 700 ms still hold commits the primary ONCE on
    // release (exit + picker) and the release never clicks into the picker.
    // #1116: each hold is judged against the mode at its OWN start, so one
    // miss is one red (a playground exit used to fail the next row too).
    for (const sel of ['[data-ob="practice-last"] p', '#ob-practice-assist-title',
      'section[data-place="practice"] h2']) {
      if (!(await toPractice())) { fail('Q4(3): practice never re-landed'); break; }
      const pt = await qVisibleCentre(c, sel);
      if (pt && !pt.settled) { fail(`Q4(3) ${sel}: the column never rested after the scroll into view: ` + JSON.stringify(pt)); continue; }
      if (!pt?.onTarget) { fail(`Q4(3) ${sel} not hittable: ` + JSON.stringify(pt)); continue; }
      const modeAt = await c.eval(`window.__settings?.get?.().mode ?? null`);
      await c.eval(COUNTER);
      await qHold(c, pt, { rest: 700 });
      await sleep(500);
      const s3 = await c.eval(STATE);
      await c.eval(COUNTER_OFF);
      if (s3.open || !s3.picker || s3.clicks.ghost !== 0 || s3.drill !== null || s3.mode !== modeAt) {
        fail(`Q4(3) hold-release at ${sel}: ` + JSON.stringify(s3));
      } else console.log(`Q4(3) OK: hold-release at ${sel} → exit + picker, 0 ghost clicks, no drill, mode ${s3.mode}`);
    }
    // 3b. the Replays card body: the hold exits to the DVR, no ghost click
    await c.eval(`window.__drills?.close?.(), true`); await sleep(200);
    await c.eval(`__shell.isOpen() || __shell.openShell(), true`); await sleep(300);
    await qTap(c, await qCentre(c, '#ob-shell-rail [data-place="replays"]'));
    if (!(await waitLanded(c, 'replays'))) fail('Q4(3b): replays never landed');
    else {
      await sleep(400);
      await c.eval(COUNTER);
      await qHold(c, await qCentre(c, 'section[data-place="replays"] h2'), { rest: 700 });
      await sleep(600);
      const s = await c.eval(STATE);
      await c.eval(COUNTER_OFF);
      if (s.open || s.clicks.ghost !== 0) fail('Q4(3b) replays hold-release: ' + JSON.stringify(s));
      else console.log('Q4(3b) OK: replays hold-release → exit, 0 ghost clicks');
    }
    await gateErrors(c, errs, 'Q4 phone');
  }
  c.close();
}
// ---- Q4L) GH-676 surface B: lighting brightness drag / hold is inert -------
{
  const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  const SLIDER = '[data-ob="atelier-brightness"]';
  const WATCH = `(() => { window.__qaGear = { flips: 0 }; const g = document.getElementById('ob-gear');
    new MutationObserver(() => { if (g.getAttribute('aria-expanded') === 'true') window.__qaGear.flips++; })
      .observe(g, { attributes: true, attributeFilter: ['aria-expanded'] }); return true; })()`;
  const STATE = `({ station: window.__atelier.station(),
    txbar: document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false,
    gear: document.getElementById('ob-gear')?.getAttribute('aria-expanded'),
    flips: window.__qaGear?.flips ?? null, value: +document.querySelector(${JSON.stringify(SLIDER)})?.value })`;
  const thumb = () => c.eval(`(() => { const s = document.querySelector(${JSON.stringify(SLIDER)});
    const r = s.getBoundingClientRect(); const f = (+s.value - +s.min) / (+s.max - +s.min); const pad = 8;
    return { x: r.x + pad + f * (r.width - 2 * pad), y: r.y + r.height / 2, v: +s.value }; })()`);
  const inert = (r) => r.station === 'lighting' && r.txbar && r.gear !== 'true' && r.flips === 0;
  if (await qBoot(c, 'Q4L')) {
    if (!(await qRailTo(c, 'equipment'))) fail('Q4L: equipment never landed');
    else if (!(await qWaitFor(c, `typeof window.__atelier === 'object' && !!document.querySelector('#ob-atelier-carousel [data-station="lighting"]')`, 80))) fail('Q4L: atelier never mounted');
    else {
      await clickEl(c, '#ob-atelier-carousel [data-station="lighting"]');
      if (!(await qWaitFor(c, `window.__shell.moving() === false && window.__atelier.station() === 'lighting'`, 60))) fail('Q4L: lighting never landed');
      await c.eval(`document.querySelector('.ob-cardrail-card[data-id="pendant_bar"]')?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' }), true`);
      await sleep(100);
      await clickEl(c, '.ob-cardrail-card[data-id="pendant_bar"]');
      if (!(await qWaitFor(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false && !!document.querySelector(${JSON.stringify(SLIDER)})`, 40))) fail('Q4L: the pendant bar never staged (txbar + slider)');
      else {
        await c.eval(WATCH);
        // (i) a slow drag from the thumb: +24 px in 12 steps over ~1.2 s
        const t0 = await thumb();
        await qMouse(c, 'mousePressed', t0.x, t0.y);
        const vals = [];
        for (let i = 1; i <= 12; i++) {
          await qMouse(c, 'mouseMoved', t0.x + 2 * i, t0.y);
          await sleep(100);
          vals.push(await c.eval(`+document.querySelector(${JSON.stringify(SLIDER)}).value`));
        }
        await qMouse(c, 'mouseReleased', t0.x + 24, t0.y);
        await sleep(400);
        const r = await c.eval(STATE);
        const mono = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
        if (!inert(r) || !(r.value > t0.v) || !mono) fail('Q4L(i) slow brightness drag: ' + JSON.stringify({ ...r, vals, v0: t0.v }));
        else console.log(`Q4L(i) OK: slow drag ${t0.v} → ${r.value} monotonic, gear never flipped, station lighting, txbar on`);
        // (ii) 800 ms holds with no move: on the thumb, on the lux note text
        for (const [tag, pt] of [['thumb', await thumb()], ['luxnote', await qCentre(c, '.ob-atelier-luxnote')]]) {
          if (!pt) { fail('Q4L(ii): no ' + tag); continue; }
          await qMouse(c, 'mousePressed', pt.x, pt.y);
          await sleep(800);
          await qMouse(c, 'mouseReleased', pt.x, pt.y);
          await sleep(1200);
          const h = await c.eval(STATE);
          if (!inert(h)) fail(`Q4L(ii) 800 ms hold on the ${tag}: ` + JSON.stringify(h));
          else console.log(`Q4L(ii) OK: 800 ms hold on the ${tag} is inert (flips 0)`);
        }
      }
    }
    await gateErrors(c, errs, 'Q4L');
  }
  c.close();
}
// ---- Q4M) #1168: a card hold the column's own motion cancelled releases
// inert (arm body in ./e2e-shell-movedhold.mjs; reuses the +5 phone slot
// after Q4L — PORT_INVENTORY unchanged)
await armMovedHold({ PORT, CDP_PORT, fail });
// ---- Q5) GH-685: Spin & elevation is hidden/inert under the phone prompt --
{
  const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  const UP = `getComputedStyle(document.getElementById('hud-decision')).display !== 'none'`;
  const SPIN_OPEN = `getComputedStyle(document.getElementById('ob-spin-modal')).display !== 'none'`;
  const PROBE = `(() => { const d = document.getElementById('hud-decision'), s = document.getElementById('ob-spin-btn');
    const dr = d.getBoundingClientRect(), sr = s.getBoundingClientRect();
    const inter = !(sr.right <= dr.left || sr.left >= dr.right || sr.bottom <= dr.top || sr.top >= dr.bottom);
    let hits = 0, n = 0;
    for (let x = dr.left; x <= dr.right; x += 4) for (let y = dr.top; y <= dr.bottom; y += 4) {
      n++; const e = document.elementFromPoint(x, y); if (e && (e === s || s.contains(e))) hits++; }
    const btns = [...d.querySelectorAll('.hd-btns button')].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    return { spinVis: s.checkVisibility({ visibilityProperty: true }), spinDisabled: s.disabled, inter, hits, n, btns, spinX: sr.left + sr.width / 2,
      pending: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null }; })()`;
  // GH-909 item 2 / GH-966 (B): seed after the fresh shell's own first
  // ob-shell-v1 write (GH-1090), then accept only the NEW document — the old
  // one answered __test.ready until the reload committed — once it is at the
  // table under the seeded game; scaled wall-clock budgets, no sleep. A
  // failure names the clause (first-write / seed / new-document / landed).
  const seed = async (game) => {
    const r = await seedReload(c, {
      'ob-settings-v1': { game },
      'ob-shell-v1': { v: 1, lastPlace: 'play', startAtTable: true },
    }, `window.__test?.state?.() != null && window.__shell && !window.__shell.isOpen()
      && window.__rules?.game?.() === ${JSON.stringify(game)}`);
    if (!r.ok) console.log(`Q5 seed ${game}: stopped at the ${r.stage} clause`);
    return r.ok;
  };
  const judge = async (tag) => {
    if (!(await qWaitFor(c, UP, 150))) { fail(`${tag}: no decision prompt: ` + JSON.stringify(await c.eval(`({ state: window.__test.state(), power: document.getElementById('power')?.value })`))); return; }
    await sleep(300);
    const p = await c.eval(PROBE);
    if (!((!p.spinVis || p.spinDisabled || !p.inter) && p.hits === 0)) fail(`${tag}: Spin is live under the prompt: ` + JSON.stringify(p));
    else console.log(`${tag} OK: Spin ${p.spinVis ? 'clear of' : 'hidden under'} the prompt (sweep hits ${p.hits}/${p.n}, ${p.pending})`);
    let opened = 0;
    for (let i = 0; i + 1 < p.btns.length; i++) { // a REAL tap in every seam,
      // in the Spin button's own column (clamped inside the option width)
      const a = p.btns[i], b = p.btns[i + 1];
      const x = Math.min(Math.max(p.spinX, a[0] + 4), a[2] - 4);
      await qTap(c, { x, y: (a[3] + b[1]) / 2 });
      await sleep(250);
      if (await c.eval(SPIN_OPEN)) {
        opened++;
        fail(`${tag}: seam tap ${i} at (${x.toFixed(0)},${((a[3] + b[1]) / 2).toFixed(0)}) opened #ob-spin-modal under a pending decision`);
        await c.eval(`document.querySelector('#ob-spin-modal button')?.click(), true`);
      }
    }
    if (!opened) console.log(`${tag} OK: ${Math.max(0, p.btns.length - 1)} seam tap(s) in the Spin column, the spin modal stayed closed`);
    // control: resolve (REAL tap on option 1) → Spin is back and opens again
    const b0 = p.btns[0];
    await qTap(c, { x: (b0[0] + b0[2]) / 2, y: (b0[1] + b0[3]) / 2 });
    if (!(await qWaitFor(c, `!(${UP}) && document.getElementById('ob-spin-btn').checkVisibility({ visibilityProperty: true })`, 40))) { fail(`${tag}: Spin not back after the decision resolved`); return; }
    await qTap(c, await qCentre(c, '#ob-spin-btn'));
    await sleep(300);
    if (!(await c.eval(SPIN_OPEN))) fail(`${tag}: Spin did not open the modal after the decision`);
    else console.log(`${tag} OK: control — Spin visible and opens again after the decision`);
    await c.eval(`document.querySelector('#ob-spin-modal button')?.click(), true`);
    await sleep(200);
  };
  if (!(await waitReady(c))) fail('Q5: phone boot never became ready');
  else {
    // carom: break_spot (2 options) pends at the table right after boot
    if (!(await seed('carom_3cushion'))) fail('Q5: the carom seed never reached the table');
    else await judge('Q5 carom break_spot');
    // 8-ball: a 1.0 m/s break from BALL_IN_HAND → dry_break (3 options)
    for (const [w, h] of [[844, 390], [667, 375]]) {
      await setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 });
      if (!(await seed('eight_ball'))) { fail(`Q5 ${w}x${h}: the 8-ball seed never reached the table`); continue; }
      if (!(await qWaitFor(c, `window.__test.state() === 'BALL_IN_HAND'`, 40))) { fail(`Q5 ${w}x${h}: not at BALL_IN_HAND`); continue; }
      await c.eval(`(() => { const p = document.getElementById('power'); p.value = '1';
        p.dispatchEvent(new Event('input', { bubbles: true })); p.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await qTap(c, await qCentre(c, '#shoot')); // REAL Fire tap
      await judge(`Q5 8-ball dry_break ${w}x${h}`);
    }
    await gateErrors(c, errs, 'Q5');
  }
  c.close();
}

// ---- R) GH-696 / GH-697: the finished shared replay under / after the hall
// (S4 journey-QA round 2, journey link-recipient F1/F2; coordinator
// rulings). A recipient boots a REAL same-kernel share link (minted by a
// sender leg of this run), the replay runs to "REPLAY finished", the hall
// opens on a REAL pill press. (696) #ob-replay is a body-level surface:
// hidden + inert under the open hall (the body.ob-shell-open hide list,
// state kept), and a REAL press where prev / next sat never re-runs the
// replay under the open shell — never (PLAYBACK && open), done stays true
// while open. (697) a REAL Play now from that hall RESOLVES the finished
// replay first (the bar's own Exit path): replay.active false, #shoot
// enabled, no finished bar over the table, a REAL cue-ball drag moves the
// ball, and the BIH instruction never shows while Shoot is disabled.
// Desktop 1440x900 (CDP +6) and phone 844x390 coarse DPR3 (CDP +5), one
// browser at a time; each half boots a FRESH recipient profile (the 696
// half's blind presses may lawfully land on hall chrome and exit).
{
  let link = null;
  { // sender: real-user desktop boot → Play now → two shots → encode
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&u=rsend`,
      { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
    if (!(await waitReady(c))) fail('R: sender boot never became ready');
    else {
      await waitShell(c);
      if (await qWaitFor(c, 'window.__shell?.isOpen?.() === true', 40, 200)) {
        await clickEl(c, '#ob-shell-quickplay');
        await qWaitFor(c, 'window.__shell?.isOpen?.() === false', 30, 200);
      }
      await qWaitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 50, 200);
      for (let n = 1; n <= 2; n++) {
        await c.eval(`(() => {
          let e = window.__test.shoot({ v0: ${n === 1 ? 2.2 : 1.6}, phi: ${n === 1 ? 0 : 0.6} });
          if (e) { window.__test.placeCue(0.3, 0.5); e = window.__test.shoot({ v0: 1.5 }); }
          return e ?? null; })()`);
        if (!(await qWaitFor(c, `['AIM', 'BALL_IN_HAND', 'WIN'].includes(__test.state())
            && __share.log().shots >= ${n}`, 200, 250))) {
          fail(`R: sender shot ${n} never settled`);
        }
      }
      link = await c.eval('window.__share.encode()');
    }
    c.close();
    await sleep(1200);
  }
  const rLink = (tag) => { const u = new URL(link); u.searchParams.set('u', tag); return u.toString(); };
  const R_DONE = `(() => { const r = window.__share?.replay?.();
    return !!r && r.active === true && r.done === true; })()`;
  const R_SPOTS = `(() => { const at = (s) => { const e = document.querySelector(s);
      if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    return { prev: at('#ob-rp-prev'), next: at('#ob-rp-next'), pill: at('#ob-shell-open') }; })()`;
  const R_UNDER = (spots) => `(() => {
    const bar = document.getElementById('ob-replay');
    const rects = bar ? bar.getClientRects().length : 0;
    const cs = bar ? getComputedStyle(bar) : null;
    const inBar = (p) => { const e = document.elementFromPoint(p.x, p.y);
      return !!e && !!e.closest('#ob-replay'); };
    const card = document.querySelector('#ob-shell-cards section[data-place="play"]');
    const cr = card && card.getClientRects().length ? card.getBoundingClientRect() : null;
    const br = rects ? bar.getBoundingClientRect() : null;
    const painted = rects > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
      && parseFloat(cs.opacity) > 0;
    const ov = (a, b) => (a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0);
    return { open: __shell.isOpen(), body: document.body.classList.contains('ob-shell-open'),
      rects, vis: cs?.visibility ?? null, pe: cs?.pointerEvents ?? null, painted,
      prevInBar: inBar(${JSON.stringify(spots.prev)}), nextInBar: inBar(${JSON.stringify(spots.next)}),
      card: !!cr, cardCovered: painted && cr ? ov(br, cr) : 0,
      cardCentreInBar: cr ? inBar({ x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 }) : false };
  })()`;
  const R_SAMPLE = `(() => { const r = window.__share.replay();
    return { st: __test.state(), open: __shell.isOpen(), done: r.done, active: r.active, i: r.i }; })()`;
  const R_TABLE = `(() => { const q = (s) => document.querySelector(s);
    const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const hud = q('#hud'); const txt = (hud?.innerText || '').replace(/\\s+/g, ' ');
    return { st: __test.state(), open: __shell.isOpen(), active: window.__share.replay().active,
      shootDisabled: q('#shoot')?.disabled ?? null, rpExit: vis(q('#ob-rp-exit')),
      bih: vis(q('#state')) && /drag the cue ball|place the cue ball/i.test(txt) }; })()`;
  if (typeof link !== 'string' || !link.includes('#r=')) {
    fail('R: share link unavailable: ' + JSON.stringify(link));
  } else for (const leg of ['desktop', 'phone']) {
    const boot = (tag) => (leg === 'phone'
      ? launchPhone(rLink(tag), { cdpPort: CDP_PORT + 5, tool: false })
      : launchChrome(rLink(tag), { port: CDP_PORT + 6, width: 1440, height: 900, tool: false }));
    const press = async (c, pt) => {
      if (leg === 'phone') { await qTap(c, pt); return; }
      await qMouse(c, 'mouseMoved', pt.x, pt.y);
      await qMouse(c, 'mousePressed', pt.x, pt.y);
      await qMouse(c, 'mouseReleased', pt.x, pt.y);
    };
    const drag = async (c, from, to, steps = 8) => {
      const at = (i) => ({ x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps });
      if (leg === 'phone') {
        await touchStart(c, [{ ...from, id: 1 }]);
        for (let i = 1; i <= steps; i++) { await touchMove(c, [{ ...at(i), id: 1 }]); await sleep(30); }
        await touchEnd(c);
      } else {
        await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y,
          button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= steps; i++) {
          await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at(i),
            button: 'left', buttons: 1 });
          await sleep(30);
        }
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y,
          button: 'left', buttons: 0, clickCount: 1 });
      }
      await sleep(250);
    };
    const bootDone = async (c, tag) => {
      if (!(await waitReady(c)) || !(await waitShell(c))) { fail(`${tag}: recipient boot never ready`); return false; }
      if (!(await qWaitFor(c, R_DONE, 300, 200))) {
        fail(`${tag}: the shared replay never finished: `
          + JSON.stringify(await c.eval('window.__share.replay()').catch(() => null)));
        return false;
      }
      return true;
    };
    // ---- half 1 (696): the finished bar under the open hall ----------------
    {
      const tag = `R/696 ${leg}`;
      const errs = [];
      const c = await boot(`r696${leg}`);
      watchErrors(c, errs);
      if (await bootDone(c, tag)) {
        const spots = await c.eval(R_SPOTS);
        if (!spots.prev || !spots.next || !spots.pill) {
          fail(`${tag}: finished bar / pill not on screen: ` + JSON.stringify(spots));
        } else {
          await press(c, spots.pill); // REAL pill press over the finished replay
          if (!(await qWaitFor(c, '__shell.isOpen() === true', 30, 100))) {
            fail(`${tag}: the pill did not open the hall over the finished replay`);
          } else {
            await sleep(600); // the entry motion; the hide list is instant
            const u = await c.eval(R_UNDER(spots));
            const inert = u.rects === 0 || (!u.prevInBar && !u.nextInBar);
            if (!u.open || !inert) {
              fail(`${tag}: the finished bar stays live over the open hall: ` + JSON.stringify(u));
            } else if (u.cardCovered > 0 || u.cardCentreInBar) {
              fail(`${tag}: the bar covers the hall's Play card: ` + JSON.stringify(u));
            } else console.log(`${tag} OK: bar under the hall = ${JSON.stringify({ rects: u.rects, vis: u.vis, pe: u.pe, painted: u.painted })}`);
            // REAL presses where prev / next sat; 6 s of 100 ms samples
            const samples = [];
            for (const spot of [spots.prev, spots.next]) {
              await press(c, spot);
              for (let i = 0; i < 30; i++) {
                samples.push(await c.eval(R_SAMPLE).catch(() => null));
                await sleep(100);
              }
            }
            const got = samples.filter(Boolean);
            const rerun = got.filter((s) => s.st === 'PLAYBACK' && s.open);
            const undone = got.filter((s) => s.open && s.done !== true);
            const brief = (l) => JSON.stringify(l.slice(0, 3));
            if (got.length < 40) fail(`${tag}: sampler starved (${got.length}/60)`);
            if (rerun.length) {
              fail(`${tag}: prev/next re-ran the replay UNDER the open hall `
                + `(${rerun.length}/${got.length} samples PLAYBACK && open): ` + brief(rerun));
            } else if (undone.length) {
              fail(`${tag}: the finished replay left done while the hall stayed open: ` + brief(undone));
            } else {
              console.log(`${tag} OK: ${got.length} samples, never PLAYBACK under the open hall; `
                + `last ${JSON.stringify(got.at(-1))}`);
            }
          }
        }
      }
      await gateErrors(c, errs, tag);
      c.close();
      await sleep(1200);
    }
    // ---- half 2 (697): Play now from the post-replay hall -------------------
    {
      const tag = `R/697 ${leg}`;
      const errs = [];
      const c = await boot(`r697${leg}`);
      watchErrors(c, errs);
      if (await bootDone(c, tag)) {
        const pill = await qCentre(c, '#ob-shell-open');
        await press(c, pill);
        if (!(await qWaitFor(c, '__shell.isOpen() === true', 30, 100))) {
          fail(`${tag}: the pill did not open the hall over the finished replay`);
        } else {
          await sleep(600);
          await press(c, await qCentre(c, '#ob-shell-quickplay')); // REAL Play now
          if (!(await qWaitFor(c, '__shell.isOpen() === false', 30, 100))) {
            fail(`${tag}: Play now did not close the hall`);
          } else {
            const t = [];
            for (let i = 0; i < 10; i++) { t.push(await c.eval(R_TABLE).catch(() => null)); await sleep(100); }
            const got = t.filter(Boolean);
            const live = got.findIndex((s) => s.active === false && s.shootDisabled === false && !s.rpExit);
            const last = got.at(-1);
            const lured = got.filter((s) => s.bih && s.shootDisabled);
            if (live < 0 || !last || last.active || last.shootDisabled || last.rpExit) {
              fail(`${tag}: Play now landed a LOCKED table (the finished replay was not resolved): `
                + JSON.stringify(last));
            } else if (lured.length) {
              fail(`${tag}: the HUD instructed BALL IN HAND while Shoot was disabled `
                + `(${lured.length}/${got.length} samples): ` + JSON.stringify(lured[0]));
            } else console.log(`${tag} OK: live table ${live * 100} ms after the exit: ${JSON.stringify(last)}`);
            // a REAL cue-ball drag moves the ball (BALL_IN_HAND placement rights)
            if (await qWaitFor(c, `__test.state() === 'BALL_IN_HAND'`, 20, 100)) {
              let moved = false, from = null, pos0 = null;
              for (const dx of [110, -110]) {
                from = await c.eval('window.__aim?.ballScreen?.(0) ?? null');
                pos0 = await c.eval('__test.balls()[0].pos');
                if (!from) break;
                await drag(c, from, { x: from.x + dx, y: from.y });
                const pos1 = await c.eval('__test.balls()[0].pos');
                if (pos0.some((v, k) => Math.abs(v - pos1[k]) > 1e-6)) { moved = true; break; }
              }
              if (!moved) fail(`${tag}: a REAL cue-ball drag left the ball in place: ` + JSON.stringify({ from, pos0 }));
              else console.log(`${tag} OK: real cue-ball drag moved the ball`);
            } else console.log(`${tag}: machine not at BALL_IN_HAND after the exit (${await c.eval('__test.state()')}); drag leg skipped`);
          }
        }
      }
      await gateErrors(c, errs, tag);
      c.close();
      await sleep(1200);
    }
    // ---- half 3 (697 review r1 P2, PR #706): the Practice card's FALLBACK
    // action from the post-replay hall. practice.js is refused on this
    // recipient boot (the A3 poison idiom) so the shell's own stub stands;
    // its Free-practice action runs exitToTable() then changeMode
    // ('playground') in the SAME task — the finished replay must be torn
    // down synchronously inside exitToTable, or the replay lock refuses the
    // mode and the later observer only reracks (pre-fix: mode stayed 'play').
    {
      const tag = `R/697-practice ${leg}`;
      const errs = [];
      const c = leg === 'phone'
        ? await launchPhone(`http://127.0.0.1:${PORT}/`, { cdpPort: CDP_PORT + 5, tool: false })
        : await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
      watchErrors(c, errs);
      await a3Poison(c, /\/app\/practice\.js(\?|$)/, '*/app/practice.js*');
      await c.send('Page.navigate', { url: rLink(`r697pg${leg}`) });
      if (await bootDone(c, tag)) {
        await press(c, await qCentre(c, '#ob-shell-open'));
        if (!(await qWaitFor(c, '__shell.isOpen() === true', 30, 100))) {
          fail(`${tag}: the pill did not open the hall over the finished replay`);
        } else {
          await sleep(600);
          await press(c, await qCentre(c, '#ob-shell-rail [data-place="practice"]'));
          const SEL = '#ob-shell-cards > section[data-place="practice"] .ob-shell-actions [data-i18n="shell.card.playground"]';
          const SHOWN = `(() => { const e = document.querySelector(${JSON.stringify(SEL)});
            return !!e && !(e.closest('button') || e).hidden && e.getClientRects().length > 0; })()`;
          if (!(await waitLanded(c, 'practice'))) fail(`${tag}: rail press never landed at practice`);
          else if (!(await qWaitFor(c, SHOWN, 30, 100))) {
            fail(`${tag}: the stub Free-practice action never showed (practice.js refused): `
              + JSON.stringify(await c.eval(a3Stub('practice')).catch(() => null)));
          } else {
            const spot = await qVisibleCentre(c, SEL);
            if (spot && !spot.settled) fail(`${tag}: the hall column never rested before the Free-practice press: ` + JSON.stringify(spot));
            await press(c, spot); // REAL press: exitToTable() + changeMode('playground') in ONE task
            const R_PG = `(() => ({ open: __shell.isOpen(), active: window.__share.replay().active,
              done: window.__share.replay().done, mode: window.__settings?.get?.().mode ?? null,
              st: __test.state() }))()`;
            const ok = await qWaitFor(c, `(() => { const s = ${R_PG};
              return !s.open && s.active === false && s.mode === 'playground'; })()`, 30, 100);
            const s = await c.eval(R_PG).catch(() => null);
            if (!ok) {
              fail(`${tag}: the fallback Practice action did not reach mode playground on a live table `
                + '(one settle): ' + JSON.stringify(s));
            } else console.log(`${tag} OK: playground reached with the finished replay resolved: ${JSON.stringify(s)}`);
          }
        }
      }
      // the refused practice.js is this half's OWN poison — never a foreign error
      const foreign = errs.filter((e) => !/\/app\/practice\.js/.test(e));
      errs.length = 0; errs.push(...foreign);
      await gateErrors(c, errs, tag);
      c.close();
      await sleep(1200);
    }
  }
}

// ---- K05) GH-668 B-K05 shell seam: the published band geometry (slice 2) --
// (arm body in ./e2e-shell-k05.mjs; reuses the +6 desktop / +5 phone slots
// sequentially after R has closed — PORT_INVENTORY unchanged)
await armK05({ PORT, CDP_PORT, fail });
// G2 (GH-668 S5 slice 2): quick-play stack on kit parts, R4 fold, R16 verb,
// B-SH02 hold hint — web/tools/e2e-shell-g2.mjs (same +6 / +5 slots)
await armG2({ PORT, CDP_PORT, fail });
// G3 (GH-668 S5 slice 2): gear icon segment (R3), rail solid rung (B-K14 /
// A2), the leading labelled hall pill (B-SH06) — web/tools/e2e-shell-g3.mjs
await armG3({ PORT, CDP_PORT, fail });
// G4. GH-668 B-SH08 / B-PL05 — the notice + the decision prompt on the kit
// .ob-prompt registers — web/tools/e2e-shell-g4.mjs (same +6 / +5 slots)
await armG4({ PORT, CDP_PORT, fail });
// XD (#1202 build 21): the exit's lamp-degrade recheck after the entry-pose
// restore — web/tools/e2e-shell-xd.mjs (the +6 slot, after G4 has closed)
await armXD({ PORT, CDP_PORT, fail });
// SW (build 20): the game switch shows a progress overlay painted before the
// table build, advancing by phase, leaving at the settled frame, shielding
// input — web/tools/e2e-shell-switch.mjs (same +6 / +5 slots)
await armSwitch({ PORT, CDP_PORT, fail });
// ---- S) GH-709 / GH-710: the sender's OWN tab after Share ------------------
// (S4 journey-QA round 3, journey sender-keeps-playing; coordinator
// rulings.) Share must never leave the sender's tab in a replay URL: the
// polite path ("Link copied") writes NOTHING into location; only the
// clipboard-refused fallback ("the link is in the address bar") writes
// `#r=` and stamps the own-tab sessionStorage marker (tab restore keeps
// it — Page.reload models both). A reload over an OWN hash boots the
// NORMAL live table (boot 'returning', never 'blocked', never PLAYBACK,
// hash stripped, hall openable, Shoot live) while a RECIPIENT (fresh
// profile, no marker) still replays with the blocked-class refusal (709).
// The address-bar link never goes stale silently: the next live shot
// drops an own `#r=` + marker, and a second Share re-mints (710); review
// r3: so does an accepted decision annotation with no shot (log.calls is
// encoded), while a recipient's #r= is never touched. Review r5 P2 (desktop
// legs after 709c): the marker is written BEFORE the bar (history.state
// carries it when storage refuses; with neither no #r= is advertised) and
// a camera-plan edit / mid-rack cue swap drop the own link like a shot.
// Desktop 1440x900 real-user boot (CDP +6), phone 844x390 coarse DPR3
// (CDP +5), recipient on +5 after the phone leg — one browser at a time.
{
  const sOrigin = `http://127.0.0.1:${PORT}`;
  const S_SHOT = (n) => `(() => {
    let e = window.__test.shoot({ v0: ${n % 2 ? 2.0 : 1.5}, phi: ${n % 2 ? 0.1 : 0.7} });
    if (e) { window.__test.placeCue(0.3, 0.5); e = window.__test.shoot({ v0: 1.5 }); }
    return e ?? null; })()`;
  const sShots = async (c, tag, from, to) => {
    for (let n = from; n <= to; n++) {
      await c.eval(S_SHOT(n));
      if (!(await qWaitFor(c, `['AIM', 'BALL_IN_HAND', 'WIN'].includes(__test.state())
          && __share.log().shots >= ${n}`, 200, 250))) {
        fail(`${tag}: shot ${n} never settled`); return false;
      }
    }
    return true;
  };
  const sEncHash = async (c) => { // the current link's hash (null on a refused encode)
    const u = await c.eval('window.__share.encode()').catch(() => null);
    try { return typeof u === 'string' ? new URL(u).hash : null; } catch { return null; }
  };
  const S_STATE = `(() => ({ hash: location.hash, own: window.__share.own?.() ?? null,
    marker: (() => { try { return sessionStorage.getItem('ob-share-own') !== null; } catch { return null; } })(),
    pending: window.__share.pending?.() ?? null, active: window.__share.replay().active,
    n: window.__share.replay().n, shots: window.__share.log().shots, st: __test.state(),
    boot: window.__shell?.state?.().boot ?? null, open: window.__shell?.isOpen?.() ?? null,
    shootDisabled: document.getElementById('shoot')?.disabled ?? null,
    toast: document.getElementById('ob-share-toast')?.textContent ?? '' }))()`;
  const sPlayNow = async (c, phone = false) => {
    if (await qWaitFor(c, 'window.__shell?.isOpen?.() === true', 40, 200)) {
      if (phone) { const pt = await qCentre(c, '#ob-shell-quickplay'); if (pt) await qTap(c, pt); }
      else await clickEl(c, '#ob-shell-quickplay');
      await qWaitFor(c, 'window.__shell?.isOpen?.() === false', 30, 200);
    }
    return qWaitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 50, 200);
  };
  const grantClipboard = (c) => c.send('Browser.grantPermissions',
    { origin: sOrigin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  const resetPerms = (c) => c.send('Browser.resetPermissions', {});
  /** a NORMAL boot after a reload: never PLAYBACK / replay over 5 s of
   * samples, boot 'returning' (never 'blocked'), no pending intent, no
   * `#r=` left in the bar (the reader stripped an own hash), hall open */
  const sNormalBoot = async (c, tag) => {
    if (!(await waitReady(c)) || !(await waitShell(c))) { fail(`${tag}: reload never ready`); return false; }
    let last = null;
    for (let i = 0; i < 25; i++) {
      const s = await c.eval(S_STATE).catch(() => null);
      if (s) {
        last = s;
        if (s.active || s.st === 'PLAYBACK') {
          fail(`${tag}: the sender's own tab replayed its own shots after the reload: ${JSON.stringify(s)}`);
          return false;
        }
      }
      await sleep(200);
    }
    if (!last || last.boot !== 'returning' || last.pending !== false || /[#&]r=/.test(last.hash) || !last.open) {
      fail(`${tag}: expected a normal RETURNING boot (hall open, no #r=, no pending intent), got ${JSON.stringify(last)}`);
      return false;
    }
    console.log(`${tag} OK: normal returning boot ${JSON.stringify({ boot: last.boot, hash: last.hash, shots: last.shots })}`);
    return true;
  };
  const sShareTap = async (c, phone) => {
    if (!phone) { await clickEl(c, '#ob-share'); await sleep(600); return true; }
    // phone: gear → Settings → the "Share replay" row (touchwidgets rows[0]).
    // Selector: `#ob-touch-drawer-rows .ob-btn` — inside the 015 settings
    // mount the rows are intrinsic kit pills (GH-668 S5 slice 2 B-SH01:
    // `ob-btn`, no `.ob-touch-row`); the drawer-era fallback still wears
    // `ob-btn ob-touch-row`, so `.ob-btn` reads both registers (the
    // e2e-touch / e2e-settings idiom). The Share row is rows[0] by contract.
    const g = await qCentre(c, '#ob-gear'); if (!g) return false;
    await qTap(c, g);
    if (!(await qWaitFor(c, `(() => { const r = document.querySelector('#ob-touch-drawer-rows .ob-btn');
        return !!r && r.getClientRects().length > 0; })()`, 40, 150))) return false;
    const pt = await qVisibleCentre(c, '#ob-touch-drawer-rows .ob-btn'); if (!pt) return false;
    if (!pt.settled) { fail('S share row: the settings drawer never rested before the Share-row tap: ' + JSON.stringify(pt)); return false; }
    await qTap(c, pt); await sleep(600);
    return true;
  };
  // ---- review r5 P2 legs (desktop, after 709c) ------------------------------
  // GH-709 P2-1 mark FIRST, advertise SECOND: (d) sessionStorage.setItem
  // stubbed to throw -> the fallback rides history.state.obOwn (link in the
  // bar, own true, NO storage marker) and a reload still boots the sender's
  // tab normally (RED on a57f242a: the unmarked #r= replayed the sender's
  // own shots); (e) storage AND history.replaceState stubbed -> NO #r=
  // written, the copy-failure toast (RED: #r= in the bar + "in the address
  // bar"). GH-710 P2-2: after a fallback Share, a camera-plan edit on the
  // live session (the setCutPlan seam the e2e-share cp arm uses) drops the
  // own #r= (RED: it stayed), so does a mid-rack cue swap (RED: an
  // unshareable link stayed in the bar); the recipient's #r= is untouched.
  const S_STUB = `(() => { const s = window.__sStub = window.__sStub || {};
    if (!s.set) { s.set = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new Error('e2e stub: storage refused'); }; } return true; })()`;
  const S_STUB_HIST = `(() => { const s = window.__sStub = window.__sStub || {};
    if (!s.rs) { s.rs = History.prototype.replaceState;
      History.prototype.replaceState = function () { throw new Error('e2e stub: history refused'); }; } return true; })()`;
  const S_UNSTUB = `(() => { const s = window.__sStub || {};
    if (s.set) Storage.prototype.setItem = s.set; if (s.rs) History.prototype.replaceState = s.rs;
    window.__sStub = {}; return true; })()`;
  const S_STATE2 = `(() => { const st = ${S_STATE}; st.stateOwn = history.state?.obOwn ?? null; return st; })()`;
  const sR5 = async (c, tag) => {
    const barTxt = await c.eval(`__i18n.t('share.inAddressBar')`);
    // (e) neither marker -> the bar stays clean, the copy-failure toast
    if (!(await sShots(c, tag, 1, 2))) return;
    await c.eval(S_STUB); await c.eval(S_STUB_HIST);
    await sShareTap(c, false);
    const e = await c.eval(S_STATE2);
    await c.eval(S_UNSTUB);
    const failTxt = await c.eval(`__i18n.t('share.failed', { error: 'clipboard refused and no own-tab marker could be kept' })`);
    if (/[#&]r=/.test(e.hash) || e.own !== false || e.marker !== false || e.stateOwn !== null || e.toast !== failTxt) {
      fail(`${tag} (709 r5 e): with NO durable marker the fallback must not advertise #r=: ${JSON.stringify({ hashLen: e.hash.length, own: e.own, marker: e.marker, stateOwn: e.stateOwn, toast: e.toast })}`);
    } else console.log(`${tag} OK (709 r5 e): no marker -> no #r=, copy-failure toast`);
    // (d) storage refused -> the history.state marker carries the fallback
    await c.eval(S_STUB);
    await sShareTap(c, false);
    const d = await c.eval(S_STATE2);
    const encD = await sEncHash(c);
    await c.eval(S_UNSTUB);
    if (d.toast !== barTxt || encD === null || d.hash !== encD || d.own !== true || d.marker !== false
      || d.stateOwn === null || !d.hash.includes(d.stateOwn)) {
      fail(`${tag} (709 r5 d): with sessionStorage refused the fallback must ride history.state.obOwn: ${JSON.stringify({ toast: d.toast, same: d.hash === encD, own: d.own, marker: d.marker, stateOwn: !!d.stateOwn })}`);
    } else console.log(`${tag} OK (709 r5 d): storage refused -> history.state marker holds the own link`);
    await c.send('Page.reload', {});
    if (!(await sNormalBoot(c, `${tag} reload-after-state-marker`))) {
      // (red recovery) the own replay owns the recorder: re-open a clean
      // document so the 710 legs below still report on their own terms
      await c.send('Page.navigate', { url: `${sOrigin}/app.html?seed=1&u=s709desktop` });
      if (!(await waitReady(c)) || !(await waitShell(c))) { fail(`${tag}: recovery boot never ready`); return; }
    }
    if (!(await sPlayNow(c, false))) { fail(`${tag}: Play now after the state-marker reload never reached the table`); return; }
    if (!(await sShots(c, tag, 1, 2))) return;
    // (710 r5 plan) a fallback Share, then a camera-plan edit on the live session
    await sShareTap(c, false);
    const p0 = await c.eval(S_STATE2);
    if (p0.own !== true) { fail(`${tag} (710 r5 plan): re-mint failed: ${JSON.stringify({ own: p0.own, toast: p0.toast })}`); return; }
    await c.eval('window.__archive.flush()');
    const sid = await c.eval('window.__archive.current()');
    if (await c.eval(`window.__playback.openSession(${JSON.stringify(sid)})`) !== true) { fail(`${tag} (710 r5 plan): openSession refused`); return; }
    if (!(await qWaitFor(c, 'window.__playback.playerOpen() === true', 50, 200))) { fail(`${tag} (710 r5 plan): player never opened`); return; }
    await sleep(300);
    const p1 = await c.eval(S_STATE2); // the open alone restores nothing new: the link stays
    const set = await c.eval(`window.__playback.setCutPlan({ cuts: [
      { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 }, { seg: 0, t: 0.8, cam: 5, transitionIn: 0, dur: 0 } ], poses: [] })`);
    await sleep(300);
    const p2 = await c.eval(S_STATE2);
    await c.eval('window.__playback.close(), true');
    await qWaitFor(c, 'window.__playback.playerOpen() === false', 30, 200);
    if (set !== true) fail(`${tag} (710 r5 plan): setCutPlan refused the plan`);
    else if (p1.own !== true) fail(`${tag} (710 r5 plan): opening the DVR on the live session (no edit) must keep the own link: ${JSON.stringify({ own: p1.own, hashLen: p1.hash.length })}`);
    else if (/[#&]r=/.test(p2.hash) || p2.marker !== false || p2.stateOwn !== null) {
      fail(`${tag} (710 r5 plan): a camera-plan edit must drop the stale own link: ${JSON.stringify({ hashLen: p2.hash.length, marker: p2.marker, stateOwn: p2.stateOwn })} (RED pre-fix: the pre-edit link stayed in the bar)`);
    } else console.log(`${tag} OK (710 r5 plan): the camera-plan edit dropped the stale own link`);
    // (710 r5 cue) a fallback Share (now carrying the plan), then a mid-rack cue swap
    await sShareTap(c, false);
    const q0 = await c.eval(S_STATE2);
    if (q0.own !== true) { fail(`${tag} (710 r5 cue): re-mint failed: ${JSON.stringify({ own: q0.own, toast: q0.toast })}`); return; }
    const cur = await c.eval('window.__settings.get().equipment.cue_id');
    const next = cur === 'low_deflection' ? 'standard' : 'low_deflection';
    const sw = await c.eval(`__settings.changeEquipment('cue_id', ${JSON.stringify(next)}, { skipConfirm: true })`).catch((err) => String(err));
    await sleep(300);
    const q1 = await c.eval(S_STATE2);
    if (sw !== true) fail(`${tag} (710 r5 cue): the cue swap was refused (${JSON.stringify(sw)})`);
    else if (/[#&]r=/.test(q1.hash) || q1.marker !== false || q1.stateOwn !== null) {
      fail(`${tag} (710 r5 cue): a mid-rack cue swap must drop the stale own link: ${JSON.stringify({ hashLen: q1.hash.length, marker: q1.marker, stateOwn: q1.stateOwn })} (RED pre-fix: an unshareable link stayed in the bar)`);
    } else console.log(`${tag} OK (710 r5 cue): the cue swap dropped the stale own link`);
  };
  let minted = null; // the first fallback-minted link (the recipient leg)
  for (const leg of ['desktop', 'phone']) {
    const phone = leg === 'phone';
    const tag = `S/709 ${leg}`;
    const errs = [];
    const url = `${sOrigin}/app.html?seed=1&u=s709${leg}`;
    const c = phone ? await launchPhone(url, { cdpPort: CDP_PORT + 5, tool: false })
      : await launchChrome(url, { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c))) fail(`${tag}: boot never ready`);
    else {
      await waitShell(c);
      if (!(await sPlayNow(c, phone))) fail(`${tag}: Play now never reached the table`);
      else if (await sShots(c, tag, 1, 2)) {
        if (!phone) {
          // (709a) polite path: clipboard granted → "copied", location untouched;
          // three more shots, reload → normal boot
          await grantClipboard(c);
          await sShareTap(c, false);
          const p = await c.eval(S_STATE);
          const copiedTxt = await c.eval(`__i18n.t('share.copied')`);
          if (p.toast !== copiedTxt || p.hash !== '' || p.marker !== false) {
            fail(`${tag}: the polite Share must write NOTHING into location: ${JSON.stringify({ toast: p.toast, hashLen: p.hash.length, marker: p.marker })}`);
          } else console.log(`${tag} OK: polite Share left location untouched`);
          await sShots(c, tag, 3, 5);
          await c.send('Page.reload', {});
          if (!(await sNormalBoot(c, `${tag} reload-after-polite`))) {
            // a dead boot (the base defect: the own replay runs) — the rest
            // of this leg would read a replay-owned recorder; stop here
            await gateErrors(c, errs, tag); c.close(); await sleep(1200); continue;
          }
          if (!(await sPlayNow(c, false))) fail(`${tag}: Play now after the polite reload never reached the table`);
          await resetPerms(c);
          if (!(await sShots(c, tag, 1, 2))) { await gateErrors(c, errs, tag); c.close(); await sleep(1200); continue; }
        }
        // (709b) fallback path: clipboard refused → the CURRENT link in the
        // address bar + the own-tab marker; the link is copyable right there
        if (!(await sShareTap(c, phone))) fail(`${tag}: Share gesture unavailable`);
        const f = await c.eval(S_STATE);
        const encH = await sEncHash(c);
        const barTxt = await c.eval(`__i18n.t('share.inAddressBar')`);
        if (f.toast !== barTxt || encH === null || f.hash !== encH || f.own !== true) {
          fail(`${tag}: the fallback Share must put the CURRENT link in the address bar with the own-tab marker: ${JSON.stringify({ toast: f.toast, same: f.hash === encH, own: f.own, hashLen: f.hash.length })}`);
        } else console.log(`${tag} OK: fallback Share → address bar + own marker (hash ${f.hash.length})`);
        // the recipient leg needs a real minted link — on a red base too
        if (!minted && /[#&]r=/.test(f.hash)) minted = await c.eval('location.href');
        // (710) one more live shot supersedes the link: hash + marker gone
        await sShots(c, tag, 3, 3);
        const g = await c.eval(S_STATE);
        if (/[#&]r=/.test(g.hash) || g.marker !== false) {
          fail(`${tag} (710): a superseded own link must leave the address bar: ${JSON.stringify({ hashLen: g.hash.length, marker: g.marker, shots: g.shots })}`);
        } else console.log(`${tag} OK (710): the next shot dropped the stale own link`);
        // a second Share re-mints the current state
        await sShareTap(c, phone);
        const h = await c.eval(S_STATE);
        const encH2 = await sEncHash(c);
        if (encH2 === null || h.hash !== encH2 || h.own !== true) {
          fail(`${tag} (710): a second Share must re-mint the address-bar link: ${JSON.stringify({ same: h.hash === encH2, own: h.own, encodable: encH2 !== null })}`);
        }
        // (710 review r3) a recorded DECISION with no shot changes what the
        // link encodes (log.calls): accepting it into the recorder — the
        // flow adapter's decide path and this seam land in the same
        // annotate() — must drop the own link + marker at once
        const acc = await c.eval(`window.__share.annotate({ kind: 'decision', decision: 1, choice: 0 })`).catch((e) => String(e));
        const d = await c.eval(S_STATE);
        if (acc !== true) fail(`${tag} (710 r3): the recorder refused the decision annotation (${JSON.stringify(acc)})`);
        else if (/[#&]r=/.test(d.hash) || d.marker !== false) {
          fail(`${tag} (710 r3): an accepted decision must drop the stale own link from the address bar: ${JSON.stringify({ hashLen: d.hash.length, marker: d.marker, shots: d.shots })} (RED pre-fix: the pre-decision replay stayed in the bar until the next shot)`);
        } else console.log(`${tag} OK (710 r3): the accepted decision dropped the stale own link (calls ${(await c.eval('window.__share.calls().length'))})`);
        // a third Share re-mints the post-decision state (the reload below
        // must find an OWN hash in the bar)
        await sShareTap(c, phone);
        const h3 = await c.eval(S_STATE);
        const encH3 = await sEncHash(c);
        if (encH3 === null || h3.hash !== encH3 || h3.own !== true) {
          fail(`${tag} (710 r3): a Share after the decision must re-mint the address-bar link: ${JSON.stringify({ same: h3.hash === encH3, own: h3.own, encodable: encH3 !== null })}`);
        }
        // (709c) reload with the own #r= in the bar (tab restore = the same
        // sessionStorage) → NORMAL boot; Play now → Shoot live
        await c.send('Page.reload', {});
        if (await sNormalBoot(c, `${tag} reload-after-fallback`)) {
          if (!(await sPlayNow(c, phone))) fail(`${tag}: Play now after the own-link reload never reached the table`);
          else {
            const z = await c.eval(S_STATE);
            if (z.shootDisabled !== false || z.active) fail(`${tag}: Shoot must be live after the own-link reload: ${JSON.stringify(z)}`);
            else if (!phone) await sR5(c, tag); // review r5 P2 legs (desktop)
          }
        }
      }
    }
    await gateErrors(c, errs, tag);
    c.close();
    await sleep(1200);
  }
  // recipient contract holds: a FRESH profile (no marker) opening the
  // minted link still replays with the blocked-class refusal
  if (!minted) fail('S/709 recipient: no minted link (sender legs failed)');
  else {
    const tag = 'S/709 recipient';
    const errs = [];
    const u = new URL(minted); u.searchParams.set('u', 's709r');
    const c = await launchChrome(u.toString(), { port: CDP_PORT + 5, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c)) || !(await waitShell(c))) fail(`${tag}: recipient boot never ready`);
    else if (!(await qWaitFor(c, 'window.__share.replay().active === true', 100, 200))) {
      fail(`${tag}: the recipient must still replay the shared link: ${JSON.stringify(await c.eval(S_STATE).catch(() => null))}`);
    } else {
      const s = await c.eval(`(() => { const st = ${S_STATE}; st.opened = window.__shell.openShell(); return st; })()`);
      // blocked-class = the hall REFUSES entry (and never auto-opened) while
      // the shared replay runs; a fresh profile reads boot 'fresh' with the
      // hall held closed, a returning one reads 'blocked' — never 'returning'
      if (s.opened !== false || s.open !== false || s.boot === 'returning' || s.own !== false) {
        fail(`${tag}: recipient boot must stay blocked-class while the replay runs: ${JSON.stringify(s)}`);
      } else console.log(`${tag} OK: recipient replays (boot ${s.boot}), hall refused, no own marker`);
      // (710 review r3) a decision annotation on the RECIPIENT tab (the
      // replay runs: the recorder ignores it) leaves the recipient's #r=
      // untouched — the invalidation is own-link scoped
      const before = await c.eval('location.hash');
      const acc = await c.eval(`window.__share.annotate({ kind: 'decision', decision: 1, choice: 0 })`).catch((e) => String(e));
      const after = await c.eval('location.hash');
      if (acc !== false || after !== before || !/[#&]r=/.test(after)) {
        fail(`${tag} (710 r3): a recipient's #r= must stay untouched by a decision annotation: ${JSON.stringify({ acc, same: after === before, hasR: /[#&]r=/.test(after) })}`);
      } else console.log(`${tag} OK (710 r3): recipient hash untouched (annotation ignored during the replay)`);
      // (710 r5) the plan-write broadcast on the RECIPIENT (a replay runs,
      // no own link) leaves its #r= untouched too
      await c.eval(`window.dispatchEvent(new CustomEvent('ob:cameraplan', { detail: { rev: -1, restore: false, session: null } })), true`);
      await sleep(300);
      const after2 = await c.eval('location.hash');
      if (after2 !== before) fail(`${tag} (710 r5): a plan broadcast must leave the recipient's #r= untouched: ${JSON.stringify({ same: after2 === before })}`);
      else console.log(`${tag} OK (710 r5): recipient hash untouched by the plan broadcast`);
      await c.eval('window.__share.exit(), true');
      await sleep(600);
    }
    await gateErrors(c, errs, tag);
    c.close();
    await sleep(1200);
  }
}

// ---- T) GH-719: the shared replay by keyboard ------------------------------
// (S4 journey-QA round 3, journey keyboard-replay-reviewer; coordinator
// rulings.) The replay bar (#ob-replay) and the kernel-gate banner are
// announced (role=region + localized aria-label; the label / message is a
// polite status), reachable (the bar is the FIRST body child — within two
// Tabs of the document start, no positive tabindex) and focus-managed: the
// first control takes focus on present (the replay IS the page's primary
// content on a recipient boot), and Exit / Dismiss / View anyway by Enter
// hand focus to a visible successor (the GH-682 focusSuccessor idiom) —
// never <body>, and the Tab after is never dead. The stale link is FORGED
// via the dist codec (decodeShare → kernelVersion '0.0.1+deadbeef' →
// encodeShare — the verifier's recipe). Desktop 1280x800 real-user boots
// on fresh profiles (CDP +5), sender on +6, one browser at a time.
{
  const tOrigin = `http://127.0.0.1:${PORT}`;
  const T_AE = `(() => { const a = document.activeElement; if (!a) return null;
    const r = a.getBoundingClientRect();
    return { tag: a.tagName, id: a.id || null, body: a === document.body,
      inBar: !!a.closest?.('#ob-replay'), visible: r.width > 0 && r.height > 0 }; })()`;
  const tAttrs = (c) => c.eval(`(() => { const e = document.getElementById('ob-replay'); if (!e) return null;
    return { role: e.getAttribute('role'), label: e.getAttribute('aria-label'),
      liveInside: !!e.querySelector('[role=status][aria-live=polite]'),
      first: document.body.firstElementChild === e,
      positiveTabindex: [...e.querySelectorAll('[tabindex]')].some((n) => +n.getAttribute('tabindex') > 0) }; })()`);
  // Tab from the DOCUMENT START: park focus on <body> (transient tabindex) so
  // the sequential-focus starting point is the top of the document
  const tFromStart = (c) => c.eval(`(() => { document.body.tabIndex = -1; document.body.focus();
    document.body.removeAttribute('tabindex'); return document.activeElement === document.body; })()`);
  const tTabsTo = async (c, pred, max) => {
    const stops = [];
    for (let i = 1; i <= max; i++) {
      await qPress(c, 'Tab'); await sleep(60);
      const a = await c.eval(T_AE).catch(() => null);
      stops.push(a?.id || a?.tag || '?');
      if (a && pred(a)) return { i, a, stops };
    }
    return { i: null, stops };
  };
  const tBannerLaw = async (c, tag, labelKey, firstId) => {
    const at = await tAttrs(c);
    const lab = await c.eval(`__i18n.t(${JSON.stringify(labelKey)})`);
    if (!at || at.role !== 'region' || at.label !== lab || !at.liveInside || !at.first || at.positiveTabindex) {
      fail(`${tag}: #ob-replay must be role=region + aria-label "${lab}" with a polite status inside, first in body, no positive tabindex: ${JSON.stringify(at)}`);
    }
    const ae0 = await c.eval(T_AE);
    if (!ae0 || ae0.id !== firstId) fail(`${tag}: ${firstId} must hold focus on present, got ${JSON.stringify(ae0)}`);
    await tFromStart(c);
    const reach = await tTabsTo(c, (a) => a.inBar, 3);
    if (reach.i === null || reach.i > 2) {
      fail(`${tag}: the banner must sit within 2 Tabs of the document start (stops ${reach.stops.join(' > ')})`);
    } else console.log(`${tag} OK: ${reach.i} Tab(s) from the document start → ${reach.a.id}`);
  };
  /** Enter on the focused exit control → a visible successor, never <body>,
   * and the next Tab is not dead */
  const tExitByEnter = async (c, tag) => {
    await qPress(c, 'Enter'); await sleep(150);
    const a1 = await c.eval(T_AE);
    if (!a1 || a1.body || !a1.visible) { fail(`${tag}: Enter must hand focus to a visible successor, got ${JSON.stringify(a1)}`); return null; }
    await qPress(c, 'Tab'); await sleep(80);
    const a2 = await c.eval(T_AE);
    if (!a2 || a2.body) { fail(`${tag}: the Tab after the exit must not be dead, got ${JSON.stringify(a2)}`); return null; }
    console.log(`${tag} OK: successor ${a1.tag}#${a1.id} → Tab ${a2.tag}#${a2.id}`);
    return a1;
  };
  let good = null, stale = null;
  { // sender: mint a same-kernel link (seams), forge its stale sibling
    const c = await launchChrome(`${tOrigin}/app.html?seed=11&u=t719s`,
      { port: CDP_PORT + 6, width: 1280, height: 800, tool: false });
    if (!(await waitReady(c))) fail('T/719: sender boot never ready');
    else {
      await waitShell(c);
      if (await qWaitFor(c, 'window.__shell?.isOpen?.() === true', 40, 200)) {
        await clickEl(c, '#ob-shell-quickplay');
        await qWaitFor(c, 'window.__shell?.isOpen?.() === false', 30, 200);
      }
      await qWaitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 50, 200);
      for (let n = 1; n <= 2; n++) {
        await c.eval(`(() => {
          let e = window.__test.shoot({ v0: ${n === 1 ? 2.2 : 1.2}, phi: ${n === 1 ? 1.35 : -1.2} });
          if (e) { window.__test.placeCue(0.3, 0.5); e = window.__test.shoot({ v0: 1.5 }); }
          return e ?? null; })()`);
        if (!(await qWaitFor(c, `['AIM', 'BALL_IN_HAND', 'WIN'].includes(__test.state())
            && __share.log().shots >= ${n}`, 200, 250))) fail(`T/719: sender shot ${n} never settled`);
      }
      const raw = await c.eval('window.__share.encode()');
      if (typeof raw === 'string' && raw.includes('#r=')) {
        const r = raw.split('#r=')[1].split('&')[0];
        good = `${tOrigin}/app.html?u=t719g#r=${r}`;
        try {
          const { decodeShare, encodeShare } = await import('../dist/pool-sdk/share.js');
          const dec = await decodeShare(r);
          dec.kernelVersion = '0.0.1+deadbeef';
          stale = `${tOrigin}/app.html?u=t719x#r=${await encodeShare(dec)}`;
        } catch (e) { fail('T/719: stale-link forge failed: ' + (e?.message ?? e)); }
      } else fail('T/719: sender link unavailable: ' + JSON.stringify(raw));
    }
    c.close();
    await sleep(1200);
  }
  if (good) { // ---- good link: bar law, Exit by Enter --------------------------
    const tag = 'T/719 good';
    const errs = [];
    const c = await launchChrome(good, { port: CDP_PORT + 5, width: 1280, height: 800, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c)) || !(await qWaitFor(c, 'window.__share.replay().active === true', 150, 200))) {
      fail(`${tag}: the shared replay never started`);
    } else {
      await sleep(500);
      await tBannerLaw(c, tag, 'share.barLabel', 'ob-rp-prev');
      const ex = await tTabsTo(c, (a) => a.id === 'ob-rp-exit', 8);
      if (ex.i === null) fail(`${tag}: Tab never reached Exit (stops ${ex.stops.join(' > ')})`);
      else if (await tExitByEnter(c, `${tag} Exit`)) {
        const r = await c.eval('({ active: window.__share.replay().active, hash: location.hash })');
        if (r.active !== false || r.hash !== '') fail(`${tag}: Exit by Enter did not exit: ${JSON.stringify(r)}`);
      }
    }
    await gateErrors(c, errs, tag);
    c.close();
    await sleep(1200);
  }
  if (stale) { // ---- forged stale link: gate law, Dismiss, View anyway, done Exit
    const tag = 'T/719 stale';
    const errs = [];
    const c = await launchChrome(stale, { port: CDP_PORT + 5, width: 1280, height: 800, tool: false });
    watchErrors(c, errs);
    const gateUp = `!!document.getElementById('ob-rp-dismiss')`;
    if (!(await waitReady(c)) || !(await qWaitFor(c, gateUp, 150, 200))) fail(`${tag}: kernel-gate banner never presented`);
    else {
      await sleep(400);
      await tBannerLaw(c, tag, 'share.gateLabel', 'ob-rp-view-anyway');
      await tFromStart(c);
      const d = await tTabsTo(c, (a) => a.id === 'ob-rp-dismiss', 3);
      if (d.i === null) fail(`${tag}: Dismiss must be within 3 Tabs of the document start (stops ${d.stops.join(' > ')})`);
      else if (await tExitByEnter(c, `${tag} Dismiss`)) {
        const st = await c.eval('({ hash: location.hash, pending: window.__share.pending(), bar: !!document.getElementById("ob-replay") })');
        if (st.hash !== '' || st.pending !== false) fail(`${tag}: Dismiss must clear the hash + release the intent: ${JSON.stringify(st)}`);
      }
      // View anyway (a second load of the same forged link): Enter starts the
      // replay with focus inside the bar; at done, Exit by Enter → successor
      await c.send('Page.navigate', { url: stale.replace('u=t719x', 'u=t719v') });
      if (!(await waitReady(c)) || !(await qWaitFor(c, gateUp, 150, 200))) fail(`${tag}: second gate never presented`);
      else {
        await sleep(400);
        await tFromStart(c);
        const v = await tTabsTo(c, (a) => a.id === 'ob-rp-view-anyway', 3);
        if (v.i === null) fail(`${tag}: View anyway must be within 3 Tabs (stops ${v.stops.join(' > ')})`);
        else {
          await qPress(c, 'Enter'); await sleep(400);
          const a1 = await c.eval(T_AE);
          const act = await c.eval('window.__share.replay().active');
          if (!a1 || !a1.inBar || act !== true) {
            fail(`${tag}: View anyway by Enter must start the replay with focus inside the bar: ${JSON.stringify({ a1, act })}`);
          } else console.log(`${tag} OK: View anyway → replay running, focus on ${a1.id}`);
          if (!(await qWaitFor(c, 'window.__share.replay().done === true', 300, 200))) fail(`${tag}: forged replay never finished`);
          else {
            await sleep(300);
            await tFromStart(c);
            const ex = await tTabsTo(c, (a) => a.id === 'ob-rp-exit', 8);
            if (ex.i === null) fail(`${tag}: Tab never reached the finished bar's Exit (stops ${ex.stops.join(' > ')})`);
            else if (await tExitByEnter(c, `${tag} done-Exit`)) {
              const r = await c.eval('({ active: window.__share.replay().active, hash: location.hash })');
              if (r.active !== false || r.hash !== '') fail(`${tag}: done-Exit did not exit: ${JSON.stringify(r)}`);
            }
          }
        }
      }
    }
    await gateErrors(c, errs, tag);
    c.close();
    await sleep(1200);
  }
}

// ---- QA3 (S4 journey-QA round 3): GH-711 locked face over a finished shared
// replay + GH-713 post-activation tap shield — the leg module (its own
// header documents the arms; standalone-runnable for red/green isolation).
await runQa3ShellArms({ PORT, CDP_PORT: CDP_PORT + 10, fail });

await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-SHELL FAIL' : 'E2E-SHELL PASS');
