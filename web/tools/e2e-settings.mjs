// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-settings.mjs — settings-modal gate (feature 015,
// feature 015 (internal spec) tasks.md T019). Drives the contract surface
// end-to-end on the frozen §2/§3 selectors (as amended by the §7 deviation
// log):
//
//   A. modal open/close through the gear: backdrop, HUD-inert carry-over,
//      aria-expanded, default section `assists` on every open (feature 034:
//      `game` migrated to the shell's play place), close button + Escape
//      paths, deep-link pose while closed (__settings.show), and the gear
//      OPENING under a pending decision (§7 D18 — the §2 lock retired,
//      GH-1053; the real-decision legs ride arm A-1053 below F2)
//   A2. feature 034 (525 S4a-mig) `show('game')` SHIM: with the modal open
//      it closes the modal and opens the shell at the play place; with the
//      shell closed it opens the shell at play; activeSection() never
//      reports `game`
//   B. FOUR-section registry walk (§3 as renegotiated by features 032 and
//      034 — equipment migrated to the atelier, game to the play place;
//      survivor order + assists default asserted): every id activates via
//      __settings.show(...), exactly one pane visible (hidden-toggle only,
//      node identity stable), aria-current follows on the nav rail, the
//      section head fills; About kernel stamp === rail-foot mirror
//   B2. the About Licences row (§7 D19): it expands the read-only region
//      with exactly the two served notice files, English, inside the plate
//      and scrolling under its cap, and collapses again
//   C. kit-confirm both branches through the play place's `__play.pick`
//      (the discipline surface since feature 034: decline keeps the SHELL
//      open at play, accept re-racks + lands AIM/BIH with the shell closed
//      — the D14 place analog) + the zero-native probe: window.confirm AND
//      window.alert invocation count === 0 across the flows (SC-001)
//   C2. RETIRED (feature 032 — equipment pane migrated): the table
//      provenance-card switch flows are owned by e2e-atelier arm D at the
//      table station (confirm branches, cushion pairing, D14 exit).
//      #121: the C accept still asserts the AUTO-close (auto-close-iff-
//      rerack — the accepted re-rack confirm closes the modal itself into
//      AIM through the close-button teardown)
//   C3. #121 auto-close-iff-rerack boundaries: non-re-racking tweaks
//      (assist contrast, volume) keep the modal open; a DECLINED discipline
//      switch keeps the SHELL open at play (feature 034 re-cut); the mode
//      legs split exactly on the rerack (→ playground via the practice
//      card exits to the table by design, positions kept; playground →
//      play via `play-back` re-racks + exits)
//   C4. RETIRED (feature 034 — the practice pane migrated to the practice
//      place; 036a's LIVE P-arms own `[data-ob="practice-drills"]` /
//      `[data-ob="practice-last"]` + the toolbar drills pill; the ≤3-card
//      recency ladder is an accepted bounded gap until 036b). Historical
//      description kept for the record: #135 practice pane (up to THREE recent drills since GH-182):
//      fresh drills state → NO recent-drill cards, the browse button
//      alone with the live catalog count; browse tap = sequential
//      close-then-open into the tier-grouped picker; a seam-seeded
//      start/stop renders exactly ONE card (picker voice: name, badges,
//      not-played best, continue line); card tap = commit-and-go
//      (shell closed cleanly, THAT drill active in its opening state);
//      C4e (GH-182): a staged 3-played blob (fixture write + reload, the
//      arm-D convention — complete() is the only ts writer) renders
//      THREE cards sorted ts desc with the persisted `last` id leading
//      and the pluralized heading key; tapping the SECOND card
//      commit-and-goes into THAT drill, never the lead card's;
//      C4b (#135 review finding 2, per card since GH-182): badge-rendered
//      geometry — the staged discipline mismatch (persisted+active
//      snooker, pool drills recent) renders the "switches the table"
//      requirement badge on EVERY card, measured INSIDE each card border
//      (no overflow) at 844x390 + 390x844 + 667x375 in en/de/fr (the
//      long-prose locales that painted past the border);
//      C4c (#135 review finding 1): active-vs-persisted correctness —
//      the sandbox-pin divergence (__rules.setGame nine_ball, persisted
//      snooker) keeps the badge ABSENT on every card: it derives from the
//      ACTIVE game (the #81 law + the picker wire), never persisted
//      settings;
//      C4d (GH-151 part 2, per card since GH-182): the tab group leads
//      the pane fully visible at rest; every card sits below it and is
//      REACHABLE (fully visible where it fits, else via scroll — the
//      recorded 667x375 fold trade) with zero horizontal overflow past
//      the card borders at 667x375 + 844x390;
//      C4f (GH-200): the recent-card best line is ASSIST-KEYED — a staged
//      v2 blob (per-assist records) lists cards by the newest ts ACROSS
//      modes while each best line shows the ACTIVE assist mode's record
//      (+ its assist tag; not-played when that mode has no record), and
//      flipping the REAL assists-section select re-renders the lines live
//      (the GH-200 assist-mode read seam)
//   D. persistence fixture compare (SC-003): a PRE-015 legacy blob
//      (preset/cloth era) boots into today's resolved values and the
//      written top-level shape stays byte-compatible (key set, equipment
//      axes, equipmentByGame lockstep, preview mirror keys)
//   D2. grip_fitted grandfathering (issue #87 component 4; 032 RE-CUT to
//      the machinery half): a persisted demoted selection keeps resolving
//      end-to-end (blob + kernel); the picker-option law rides the
//      atelier rows (e2e-atelier arm D)
//   D2b. catalog v14 superseded_by demotion + migration (issue #283
//      decision 2; 032 RE-CUT to the NARROWED scope; #789 R8): hidden from
//      NEW selection on the cueSwap option seam; a PERSISTED branded
//      superseded cue migrates to its pro_ld_pivot_* twin on load (blob,
//      kernel rack, option seam) and the boot re-persist writes the twin;
//      replay-pinned RESOLUTION unchanged; the modal's transient picker
//      echo asserted RETIRED (no successor surface — the pane is gone)
//   D2d. retired-id digest migration (#789 C5): a persisted blob holding
//      the two retired v8 Measured ids loads as pool_pro_9ft_measured /
//      pool_worsted_measured (settings, blob, kernel, and the built scene
//      on an obtool=0 boot); a transient sender spec keeps its ids while
//      the scene builds the twin; restore returns the twins; a ?table=
//      boot with the retired table id builds the twin; the scripted flag
//      is re-armed for the arms after it
//   D2c. per-discipline default cues (catalog v14, issue #283 decision 1):
//      first snooker/carom visit adopts DISCIPLINE_DEFAULT_CUE_IDS
//      (snooker_ash / carom_conical) via defaultEquipmentFor; a persisted
//      equipmentByGame choice always wins on return; the dime-tip snooker
//      miscue scale is pinned as observed (≈1.34095, under the SDK-builder
//      ceiling — settings.js ctx.miscue note); the kernel rack template
//      carries the adopted cue (GH-1042: the discipline racks compose on
//      the selected spec, so the template cue IS the selection)
//   D2g. the discipline cue strikes (GH-1042): real hall clicks into
//      snooker; the template and the shot record pin snooker_ash with the
//      catalog's cue params; a HUD cue swap (real kit-select clicks) shows
//      the next-shot hint only when the template already carries the new
//      cue, and the next record pins break_phenolic (tip_cor 0.85); carom
//      the same with carom_conical; a share link minted on the pre-fix
//      app (old stamp, encodes snooker_ash, struck standard) meets the
//      kernel gate first (GH-1195 option B: the banner, no replay before
//      consent), and after View anyway replays its one shot on the kernel
//      pairing with the sender's event bytes (a pinned observation); a link
//      minted now replays on the selected cue
//   D2h. Playback reopens a snooker session played on the 57.15 mm pool set from
//      a 9-ball table on its RECORDED equipment (the quiet swapBed rerack keeps
//      every recorded axis, not just the cue; GH-1042 review r1)
//   D3. power-response toggle round-trip (issue #142, SC-003 policy):
//      the additive visual/input-only `powerResponse` key defaults to
//      'perceptual' (incl. on pre-#142 blobs — recorded upgrade
//      semantics), the REAL assists-section select commits + persists
//      'linear', a reload resolves it and the UI reflects it, and an
//      unknown persisted value sanitizes LOUD to the default
//   D5. assist-line contrast round-trip (issue GH-417, SC-003 policy):
//      the additive `assistContrast` key defaults to 'standard' (incl. on
//      pre-417 blobs — the default-unchanged law), the REAL assists-
//      section select commits + persists 'high' AND writes the
//      'ob.settings.assistContrast' mirror key (previewink.js boot-reads
//      it — the preview.js assist precedent, a RECORDED mirror-key
//      extension unlike assistWrongBall/snapGrid), a reload resolves it
//      and the UI reflects it, an unknown persisted value sanitizes LOUD
//      to the default, and the panel commit broadcasts ob:settings with
//      key 'assistContrast' (the previewink.js live re-solve wire)
//   E. reduced-motion arm (SC-007): open/close are instant, zero residue
//   F. phone-sheet arm at 844x390 + 667x375 (SC-005): full-screen sheet,
//      five-pill tab strip (same .ob-set-nav buttons, pan-x, single row,
//      >=44pt), pan-y content, #ob-settings-actions mount, 44pt close
//   G. stale-graph degradation arm (SC-007): navmodal.js poisoned ->
//      settings degrades to the stacked fallback register (open/close
//      still works, ALL sections visible, never a black page); B2's
//      degrade rides the same page: the notice fetch is planted to fail
//      and the Licences row must end disabled
//   X1 / X2 / T1. build 20 (web/tools/e2e-settings-persist.mjs, its own
//      real-user browser): a cue picked after a cross-game shared-replay
//      Continue is saved for the game on the table and the saved game keeps
//      its own (#1034, desktop HUD + atelier, phone atelier); two tabs on
//      one profile keep each other's saved settings, equipment, game and
//      hall memory (#1019). NAMED-ONLY here (OB_PERSIST_ARMS=X1,X2,T1): the
//      per-PR job's suite budget; CI runs the module standalone instead —
//      `--fastlane` cores per PR (ci.yml e2e-fastlane), the full arms in
//      e2e-nightly.yml
//
// Conventions per cdp.mjs suites: hermetic Chrome profile + obtool stamp,
// self-served web/ on a suite-unique port, error gates. The stale arm (G)
// runs LAST; its expected navmodal parse noise is filtered from the
// console gate. Needs Chrome + node >= 22.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';
// GH-668 S5 slice 2 G5 (B-SH01 + B-SH07): the settings surface on the kit
// parts — rows / toggles / About actions / voices / the phone action bar —
// web/tools/e2e-settings-g5.mjs (own browsers on CDP_PORT + 6 / + 5; the
// standalone entry is the red-proof runner)
import { armG5 } from './e2e-settings-g5.mjs';
// GH-1042 D2g: catalog truth for the cue params a record must carry (pure
// data leaf, loads in node — the e2e-equipment precedent), the en hint
// strings, and the pre-fix share fixture
import { catalogEntries } from '../dist/pool-sdk/index.js';
import { readFileSync } from 'node:fs';
// build 20 (issues #1034 + #1019): saved choices across a cross-game shared-
// replay Continue and across two tabs on one profile —
// web/tools/e2e-settings-persist.mjs (own real-user browser on CDP_PORT + 7)
import { armPersist } from './e2e-settings-persist.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// suite-unique defaults; env-overridable for parallel worktree lanes
const PORT = Number(process.env.OB_E2E_PORT ?? 8201);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16301);
// GH-410 port inventory under the GH-687 lint law (ONE bare line; the CI
// job's band width and pin tails are derived from it): one static server +
// the main page's CDP endpoint at +0, plus the G5 arm's own desktop / phone
// browsers at +6 / +5 (e2e-settings-g5.mjs) and the persistence arms' own
// browser at +7 (e2e-settings-persist.mjs — the reader cannot see an
// imported module's offsets, so the count is stated here: slots +0..+7).
export const PORT_INVENTORY = { http: 1, cdp: 8 };
// SHARED_DEFAULT_WINDOW — the leg module e2e-settings-g5 declares this window; a window is an agreement on both files
export const SHARED_DEFAULT_WINDOW = 'e2e-settings';
const APP_URL = `http://127.0.0.1:${PORT}/app.html?seed=1`;
let nPass = 0, nFail = 0, nSkip = 0; // #170 scoreboard (printed in finally)
const fail = (msg) => {
  nFail++; console.error('E2E-SETTINGS FAIL:', msg); process.exitCode = 1;
};
const check = (name, ok, detail = '') => {
  if (ok) { nPass++; console.log('[e2e-settings] PASS', name); }
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};
/** #170 containment marker for sub-steps whose PRECONDITION check already
 * failed (e.g. no stable card point → the dependent click+confirm legs are
 * unrunnable). A skip is never a pass: the precondition failure above it has
 * already made the invocation red — skipping only keeps the remaining arms
 * running so the scoreboard stays complete instead of aborting ~70 checks. */
const skip = (name, why) => {
  nSkip++; console.log('[e2e-settings] SKIP', name, '—', why);
};

/** #170 invocation watchdog (the e2e-touch-disciplines pattern): under
 * containment a FAILING invocation keeps running past failed checks, so its
 * wall time is the green-path work PLUS the sum of every timed-out poll's
 * (POLL_SCALE-multiplied) budget — arithmetic ci.yml's retry x timeout
 * budget cannot bound on its own. OB_E2E_WATCHDOG_MS hard-caps ONE
 * invocation; ci.yml sizes the job as setup + 2 x cap. Unset/0 DISABLES it,
 * keeping local behavior byte-identical (this suite's healthy runtime is
 * ~10+ min, well past the touch suites' 420000 ms default, so no default cap
 * is safe here). The unref'd timer never holds an otherwise-finished
 * process; the handler prints the scoreboard-so-far because process.exit
 * skips the finally block. Exit 2 is red — the ci retry still fires. */
const WATCHDOG_MS = Number(process.env.OB_E2E_WATCHDOG_MS ?? 0);
if (WATCHDOG_MS > 0) {
  setTimeout(() => {
    console.error(`[e2e-settings] WATCHDOG: invocation exceeded ${WATCHDOG_MS} ms — hard exit`);
    console.error(`[e2e-settings] SCOREBOARD (at watchdog): ${nPass} passed, `
      + `${nFail} failed, ${nSkip} skipped — remaining checks NOT run`);
    try { chrome.close(); } catch { /* launch still in flight / already gone */ }
    stopStaticServer(server); // sync group SIGTERM; the exit backstop finishes the reap
    process.exit(2);
  }, WATCHDOG_MS).unref();
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
let plantedNoticeErrors = 0; // arm G's planted notice fetch failures (see below)
const chrome = await launchChrome(APP_URL, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    // arm G's planted notice fetch failure (B2's degrade) is EXPECTED; a
    // network entry names its target only in entry.url ("Failed to load
    // resource: …"), so it is told apart by that URL and kept out of the gate
    if (/\/vendor\/NOTICE-pooltool\.txt(\?|$)/.test(params.entry.url ?? '')) plantedNoticeErrors++;
    else consoleErrors.push(params.entry.text);
  }
});

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error('app never became ready');
}

/** Bounded node-side condition polls (821324a precedent: page-side timers
 * and rAF stretch arbitrarily on a GPU-less CI runner — software-GL frames
 * starve the event loop, so motion enter/exit tweens and dynamic-import
 * continuations land SECONDS after the triggering click. Poll the settled
 * condition from node; never trust a fixed sleep across a motion boundary).
 * pollFor resolves false on timeout (assertable); waitFor throws (gates the
 * arm's preconditions: shell mounted, touch leaf installed).
 *
 * #170 load-tolerance knob (the OB_E2E_READY_TRIES precedent): OB_E2E_POLL_SCALE
 * multiplies every bounded poll budget in this suite — pollFor/waitFor tries
 * and cardPoint's stability budget — for degraded runners (ci.yml sets 3 on
 * the 2-core fleet). Default 1 keeps local behavior byte-identical. NOT a
 * sync loosening: budgets stay bounded and a timed-out poll still FAILS its
 * check. */
const POLL_SCALE = Math.max(1, Number(process.env.OB_E2E_POLL_SCALE) || 1);
async function pollFor(expr, tries = 75) {
  for (let i = 0, n = Math.round(tries * POLL_SCALE); i < n; i++) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
async function waitFor(expr, what, tries = 150) {
  if (!await pollFor(expr, tries)) throw new Error(`${what} never came up`);
}
/** Real mouse click at viewport CSS coordinates (Input domain): the card-
 * switch arm drives the OWNER's path — actual pointer events, not element
 * .click() — so an occlusion/z-order regression fails the gate. */
async function mouseClick(x, y) {
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
/** Real mouse click on an element's center (A0 arm: the owner's pointer
 * path for close/reopen — a TRUSTED click also flips Chrome's input-
 * modality heuristic, which element.click() never does). */
async function mouseClickOn(sel) {
  const p = await chrome.eval(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)})
      ?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  })()`);
  if (!p) throw new Error(`mouseClickOn: ${sel} not found`);
  await mouseClick(p.x, p.y);
}
/** Real keyboard input (A0 arm keyboard-a11y guard): rawKeyDown so the
 * trusted key drives native focus/modality exactly like a user keystroke
 * (the e2e-ui pressKey recipe, minus the text branch — incl. its macOS
 * key re-delivery storm brake). */
async function pressKey(key, code, vk) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await chrome.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(50);
  await chrome.send('Input.setIgnoreInputEvents', { ignore: true });
  await chrome.send('Input.setIgnoreInputEvents', { ignore: false });
}
const SHELL_UP = `!!document.getElementById('ob-settings')`;
const SHELL_GONE =
  `document.getElementById('ob-settings').getClientRects().length === 0`;
const CONFIRM_UP = `!!document.querySelector('[data-ob="confirm"]')`;

/** Stub the native dialogs with counters (per page — re-run after every
 * navigation): the SC-001 law is ZERO runtime invocations under web/app. */
const STUB_NATIVES = `(() => {
  window.__nativeCalls = { confirm: 0, alert: 0 };
  window.confirm = () => { window.__nativeCalls.confirm++; return false; };
  window.alert = () => { window.__nativeCalls.alert++; };
  return true;
})()`;
// FOUR sections since feature 034 (program 525 S4a-mig): `game` migrated
// WHOLESALE to the shell's play place (after `equipment` → the atelier in
// feature 032) — the sanctioned in-slice re-cut (spec 034 §14 closed list).
// Survivor order + the `assists` default are asserted below.
const SECTION_IDS = ['assists', 'display', 'language', 'about'];

try {
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell');
  await sleep(800); // kit upgrades resolve (guarded imports)
  await chrome.eval(STUB_NATIVES);

  // ---- A. open/close mechanics ---------------------------------------------
  const built = await chrome.eval(`({
    navmodal: !!document.querySelector('#ob-settings.ob-navmodal'),
    closed: document.getElementById('ob-settings').getClientRects().length === 0,
    gear: !!document.getElementById('ob-gear') })`);
  check('modal shell built on navmodal, closed at boot',
    built.navmodal && built.closed && built.gear, JSON.stringify(built));

  // ---- A0. GH-226 first-open focus discipline -------------------------------
  // The session's FIRST open (no trusted input dispatched yet — the
  // browser's boot-default input modality, exactly where a fresh device
  // boot lands) must paint NO phantom :focus-visible ring on the selected
  // tab: navmodal open()'s programmatic focus takes the quietFocus path
  // unless the open was keyboard-driven. Pre-fix, the --ob-focus box-shadow
  // painted here (the phone tab strip's overflow clip reduced it to the
  // stray thick blue right-edge bar of the owner screenshot, IMG_4358) and
  // vanished on the pointer-driven reopen — this arm pins first-open paint
  // + geometry to the second (pointer) open's. MUST run before any other
  // Input.dispatch* in the suite (a trusted event resets the modality).
  const TAB_PAINT = `(() => {
    const el = document.querySelector(
      '#ob-settings .ob-set-nav[aria-current="true"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const b = getComputedStyle(el, '::before');
    const a = getComputedStyle(el, '::after');
    const r = el.getBoundingClientRect();
    return {
      section: el.dataset.section,
      rect: [r.x, r.y, r.width, r.height]
        .map((v) => Math.round(v * 2) / 2).join(','),
      shadow: cs.boxShadow,
      outline: cs.outlineStyle + ' ' + cs.outlineWidth,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
      bg: cs.backgroundColor,
      pseudo: b.content + '/' + a.content, // GH-118 leftover guard
      focused: document.activeElement === el,
    };
  })()`;
  // paint sampler settles on TWO consecutive equal reads (enter motion
  // rides page rAF — a mid-tween rect on a starved runner is not a fail)
  const tabPaint = async () => {
    let prev = null;
    for (let i = 0, n = Math.round(25 * POLL_SCALE); i < n; i++) {
      const cur = await chrome.eval(TAB_PAINT).catch(() => null);
      if (cur && prev && JSON.stringify(cur) === JSON.stringify(prev)) return cur;
      prev = cur;
      await sleep(200);
    }
    return prev;
  };
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await pollFor(`document.getElementById('ob-settings').getClientRects().length > 0`);
  const firstOpen = await tabPaint();
  check('GH-226: first open paints NO phantom focus ring on the selected tab',
    !!firstOpen && firstOpen.shadow === 'none' && firstOpen.focused
    && firstOpen.pseudo === 'none/none', JSON.stringify(firstOpen));
  // keyboard a11y guard: a REAL ArrowDown moves selection + focus to the
  // next tab and the genuine focus indicator SHOWS (the fix is quiet-focus
  // discipline on the pointer path, never a blanket outline:none)
  await pressKey('ArrowDown', 'ArrowDown', 40);
  const kbd = await pollFor(`(() => {
    const f = document.activeElement?.closest?.('.ob-set-nav');
    return !!f && f.dataset.section !== 'game'
      && getComputedStyle(f).boxShadow !== 'none';
  })()`);
  check('GH-226: keyboard tab nav still shows the focus indicator', kbd);
  await pressKey('ArrowUp', 'ArrowUp', 38); // back to game for the compare
  // the owner's clearing path: REAL pointer close + reopen — first-open
  // paint/geometry must equal the second open's byte-for-byte
  await mouseClickOn('#ob-settings-close');
  await pollFor(SHELL_GONE);
  await mouseClickOn('#ob-gear');
  await pollFor(`document.getElementById('ob-settings').getClientRects().length > 0`);
  const secondOpen = await tabPaint();
  check('GH-226: first-open selected-tab paint/geometry == second (pointer) open',
    !!secondOpen && JSON.stringify(firstOpen) === JSON.stringify(secondOpen),
    JSON.stringify({ firstOpen, secondOpen }));
  await mouseClickOn('#ob-settings-close');
  await pollFor(SHELL_GONE);

  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500);
  const opened = await chrome.eval(`(() => {
    const el = document.getElementById('ob-settings');
    const hud = document.getElementById('hud');
    return {
      visible: el.getClientRects().length > 0,
      backdrop: !!document.querySelector('.ob-backdrop'),
      expanded: document.getElementById('ob-gear').getAttribute('aria-expanded'),
      active: window.__settings.activeSection(),
      hudInert: !!hud && hud.inert === true,
      visiblePanes: [...el.querySelectorAll('section[data-section]')]
        .filter((s) => !s.hidden).map((s) => s.dataset.section).join(','),
    };
  })()`);
  check('gear opens the modal: backdrop + aria-expanded + HUD inert',
    opened.visible && opened.backdrop && opened.expanded === 'true'
    && opened.hudInert, JSON.stringify(opened));
  check('default active section on open is assists (one visible pane)',
    opened.active === 'assists' && opened.visiblePanes === 'assists',
    JSON.stringify(opened));

  // ---- B. registry walk + kernel stamp --------------------------------------
  const walk = await chrome.eval(`(() => {
    const el = document.getElementById('ob-settings');
    el.querySelector('section[data-section="assists"]').__obStamp = 1;
    const out = [];
    for (const id of ${JSON.stringify(SECTION_IDS)}) {
      const active = window.__settings.show(id);
      const nav = el.querySelector('.ob-set-nav[aria-current="true"]');
      out.push({ id, active,
        api: window.__settings.activeSection(),
        nav: nav?.dataset.section ?? null,
        visible: [...el.querySelectorAll('section[data-section]')]
          .filter((s) => !s.hidden).map((s) => s.dataset.section).join(','),
        head: (document.getElementById('ob-settings-section-title')
          ?.textContent ?? '').length > 0 });
    }
    const stampAlive = el.querySelector(
      'section[data-section="assists"]').__obStamp === 1;
    const about = document.getElementById('ob-about-kernel')?.textContent ?? '';
    const railFoot = document.getElementById('ob-settings-kernel')?.textContent ?? '';
    window.__settings.show('assists'); // NEVER show('game') mid-arm: it routes to the shell (034)
    return { out, stampAlive, about, railFoot };
  })()`);
  for (const r of walk.out) {
    check(`registry: section '${r.id}' activates (show/activeSection/nav/pane)`,
      r.active === r.id && r.api === r.id && r.nav === r.id
      && r.visible === r.id && r.head, JSON.stringify(r));
  }
  check('registry: hidden-toggle only — the assists section node is never re-created',
    walk.stampAlive === true);
  // 032 + 034 migration law: FOUR sections, the survivors in their original
  // order, `equipment` AND `game` GONE from the modal (their homes are the
  // atelier and the play place) and never reported by activeSection()
  // (coordinator ruling 7 — modal truth; the show('equipment') SHIM routing
  // is e2e-atelier arm F's surface; the show('game') SHIM is arm A2 below —
  // both close the modal mid-arm by design, so neither is invoked here)
  const five = await chrome.eval(`(() => {
    const el = document.getElementById('ob-settings');
    const secs = [...el.querySelectorAll('section[data-section]')]
      .map((s) => s.dataset.section);
    const navs = [...el.querySelectorAll('.ob-set-nav')]
      .map((b) => b.dataset.section);
    return { secs: secs.join(','), navs: navs.join(','),
      active: window.__settings.activeSection() };
  })()`);
  check('034: the modal walks FOUR sections (equipment + game migrated; '
    + 'survivor order + nav rail unchanged) and activeSection() never returns '
    + "'equipment' or 'game'",
  five.secs === 'assists,display,language,about'
    && five.navs === 'assists,display,language,about'
    && five.active !== 'equipment' && five.active !== 'game',
  JSON.stringify(five));
  check('About kernel stamp verbatim (non-empty lowercase) + rail-foot mirror',
    walk.about.length > 0 && walk.about === walk.about.toLowerCase()
    && walk.about === walk.railFoot,
    JSON.stringify({ about: walk.about, railFoot: walk.railFoot }));

  // ---- B2. the About Licences row (015 §7 D19) ------------------------------
  // an ACTION that expands the read-only region with the two shipped notice
  // files: it must carry exactly their served text (NOTICE first, trailing
  // blank lines trimmed), stay English, wrap inside the plate and scroll on
  // its own under its cap; a second activation collapses it. The fetch-
  // failure degrade is arm G's (it needs a fresh page).
  await chrome.eval(`window.__settings.show('about'), true`);
  await sleep(150);
  const lic0 = await chrome.eval(`(() => {
    const b = document.getElementById('ob-about-licences');
    const pre = document.getElementById('ob-about-licences-text');
    if (!b || !pre) return { present: false };
    const before = { expanded: b.getAttribute('aria-expanded'), hidden: pre.hidden };
    b.click();
    return { present: true, before, label: b.textContent,
      want: window.__i18n.t('settingsModal.about.licences') };
  })()`);
  const licShown = lic0.present && await pollFor(`(() => {
    const pre = document.getElementById('ob-about-licences-text');
    return !!pre && !pre.hidden && pre.textContent.length > 0;
  })()`);
  const lic = licShown ? await chrome.eval(`(async () => {
    const b = document.getElementById('ob-about-licences');
    const pre = document.getElementById('ob-about-licences-text');
    const plate = pre.closest('.ob-about').getBoundingClientRect();
    const r = pre.getBoundingClientRect();
    const cs = getComputedStyle(pre);
    const edge = cs.boxSizing === 'border-box' ? 0 : ['paddingTop', 'paddingBottom',
      'borderTopWidth', 'borderBottomWidth'].reduce((s, k) => s + parseFloat(cs[k]), 0);
    const files = await Promise.all(['NOTICE-pooltool.txt', 'LICENSES.md']
      .map((f) => fetch('./vendor/' + f).then((res) => res.text())));
    const out = { expanded: b.getAttribute('aria-expanded'), lang: pre.lang,
      exact: pre.textContent === files.map((s) => s.trimEnd()).join('\\n\\n') + '\\n',
      inPlate: r.left >= plate.left - 0.5 && r.right <= plate.right + 0.5,
      hOverflow: pre.scrollWidth - pre.clientWidth,
      scrolls: pre.scrollHeight > pre.clientHeight,
      capped: cs.maxHeight !== 'none' && r.height <= parseFloat(cs.maxHeight) + edge + 1 };
    b.click();
    out.collapsed = pre.hidden && b.getAttribute('aria-expanded') === 'false';
    return out;
  })()`) : null;
  check('B2: the About Licences row expands the read-only notice region '
    + '(NOTICE-pooltool.txt + LICENSES.md as served, English, inside the plate, '
    + 'scrolling under its cap) and a second activation collapses it (015 §7 D19)',
  licShown && lic0.before.expanded === 'false' && lic0.before.hidden === true
    && lic0.label === lic0.want && lic.expanded === 'true' && lic.lang === 'en'
    && lic.exact && lic.inPlate && lic.hOverflow <= 1 && lic.scrolls && lic.capped
    && lic.collapsed, JSON.stringify({ lic0, licShown, lic }));

  // Escape closes the modal (top dialog layer)
  await chrome.eval(`(document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  const escGone = await pollFor(SHELL_GONE); // exit motion rides page rAF
  const escClosed = await chrome.eval(`({
    backdrops: document.querySelectorAll('.ob-backdrop').length,
    expanded: document.getElementById('ob-gear').getAttribute('aria-expanded'),
    hudBack: document.getElementById('hud')?.inert === false })`);
  check('Escape closes the modal + backdrop, HUD restored',
    escGone && escClosed.backdrops === 0
    && escClosed.expanded === 'false' && escClosed.hudBack,
    JSON.stringify({ escGone, ...escClosed }));

  // deep-link pose while closed (§3): show() poses the NEXT open; the open
  // after that reverts to the assists default (SECTION_IDS[0] since 034)
  const posed = await chrome.eval(`window.__settings.show('about')`);
  check('show() while closed returns the posed section', posed === 'about');
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(400);
  const posedOpen = await chrome.eval(`window.__settings.activeSection()`);
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  await sleep(600);
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(400);
  const defaultOpen = await chrome.eval(`window.__settings.activeSection()`);
  check('posed section opens once, then the default (assists) returns',
    posedOpen === 'about' && defaultOpen === 'assists',
    JSON.stringify({ posedOpen, defaultOpen }));
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  // settle to ZERO rects before the decision-lock probe below — a lingering
  // exit tween on the starved runner would read as openedUnderDecision
  const btnGone = await pollFor(SHELL_GONE);
  check('close button closes (aria-expanded false, zero backdrops)',
    btnGone && await chrome.eval(`document.getElementById('ob-gear')
      .getAttribute('aria-expanded') === 'false'
      && document.querySelectorAll('.ob-backdrop').length === 0`));

  // GH-1053 (§7 D18 — the §2 decision lock RETIRED): the gear OPENS while a
  // rules decision dialog is visible — forced via the decision node's
  // display (flow.js flips the same style synchronously); the real-decision
  // legs live in arm A-1053. RED pre-fix: openedUnderDecision was false.
  const lock = await chrome.eval(`(async () => {
    const d = document.getElementById('hud-decision');
    if (!d) return { present: false };
    d.style.display = 'block';
    document.getElementById('ob-gear').click();
    await new Promise((r) => setTimeout(r, 400));
    const openedUnderDecision =
      document.getElementById('ob-settings').getClientRects().length > 0;
    document.getElementById('ob-settings-close').click();
    await new Promise((r) => setTimeout(r, 600));
    d.style.display = '';
    const closes =
      document.getElementById('ob-settings').getClientRects().length === 0;
    return { present: true, openedUnderDecision, closes };
  })()`);
  check('gear OPENS under a pending decision dialog and closes cleanly (GH-1053)',
    lock.present === true && lock.openedUnderDecision === true
    && lock.closes === true, JSON.stringify(lock));
  await sleep(600);

  // ---- A2. feature 034 show('game') SHIM (FR-011) + C. confirm both branches
  // through the play place + zero-native (SC-001) ------------------------------
  // The discipline surface is the play card since 034 (spec §14 re-cut):
  // A2 (modal-open leg): show('game') with the modal open CLOSES the modal
  // and opens the shell at the play place; activeSection() never reports
  // `game`. C then drives `__play.pick` on that live card: the declined
  // confirm keeps the SHELL open at play with the game unchanged; the
  // accepted confirm re-racks and lands AIM/BIH with the shell closed (the
  // D14 place analog). A2 (shell-closed leg) closes the arm.
  const SHELL_AT_PLAY = `window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'`;
  const PLAY_MOUNTED = `typeof window.__play === 'object'
    && !!document.querySelector('section[data-place="play"].ob-play-host')`;
  // the shell exists on a scripted boot ONLY under the reserved `obshell=1`
  // opt-in (shell.md §4: createShell no-ops otherwise) — hop this page onto
  // it (the session keeps its scripted stamp); the instant boot pose opens
  // the shell at play, so close it first: A2's modal-open leg starts from a
  // CLOSED shell + open modal
  await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=play` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (obshell page)');
  await sleep(800); // kit upgrades resolve (guarded imports)
  await chrome.eval(STUB_NATIVES);
  await waitFor(SHELL_AT_PLAY, 'obshell boot pose (shell at play)');
  await chrome.eval(`window.__shell.quickPlay(); true`);
  await waitFor(`window.__shell.isOpen() === false`, 'shell closed before A2');
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(400);
  const a2 = await chrome.eval(`(() => {
    const before = window.__settings.activeSection();
    const r = window.__settings.show('game');
    return { before, r, after: window.__settings.activeSection() }; })()`);
  check("A2: show('game') with the modal open returns a RESIDENT section (never game)",
    a2.before === 'assists' && a2.r !== 'game' && a2.after !== 'game', JSON.stringify(a2));
  check("A2: show('game') closes the modal (teardown: zero rects)", await pollFor(SHELL_GONE));
  check("A2: show('game') opens the shell at the play place", await pollFor(SHELL_AT_PLAY));
  check('A2: the play card mounts (window.__play published, host class)',
    await pollFor(PLAY_MOUNTED, 150));
  check("A2: activeSection() never reports 'game' while the shell is at play",
    await chrome.eval(`window.__settings.activeSection() !== 'game'`));
  // C (decline): the pick raises the kit confirm; cancel keeps the shell open
  await chrome.eval(`window.__cPick = window.__play?.pick?.('eight_ball') ?? Promise.resolve('no-play'); true`);
  check('kit confirm raises for the game switch (play card pick)', await pollFor(CONFIRM_UP));
  await chrome.eval(`document.querySelector('[data-ob="confirm-cancel"]')?.click()`);
  await pollFor(`!document.querySelector('[data-ob="confirm"]')`);
  const declined = await chrome.eval(`(async () => ({
    r: await window.__cPick, game: window.__settings.get().game,
    shell: window.__shell.isOpen(), place: window.__shell.place(),
    cur: document.querySelector('[data-ob="play-games"] [aria-current="true"]')?.dataset.game ?? null }))()`);
  check('decline branch: game + card stay nine_ball, the SHELL stays open at play',
    declined.r === false && declined.game === 'nine_ball' && declined.cur === 'nine_ball'
    && declined.shell === true && declined.place === 'play', JSON.stringify(declined));
  // C (accept): re-rack + the D14 place analog exit
  await chrome.eval(`window.__cPick = window.__play?.pick?.('eight_ball') ?? Promise.resolve('no-play'); true`);
  check('kit confirm re-raises for the accept branch', await pollFor(CONFIRM_UP));
  await chrome.eval(`document.querySelector('[data-ob="confirm-accept"]')?.click()`);
  let accepted = null;
  for (let i = 0; i < 50 * POLL_SCALE; i++) {
    await sleep(200);
    accepted = await chrome.eval(`window.__settings.get().game`);
    if (accepted === 'eight_ball') break;
  }
  check('accept branch: game switches', accepted === 'eight_ball');
  const exited = await pollFor(`window.__shell?.isOpen?.() === false`, 150);
  const afterC = await chrome.eval(`({
    state: window.__test.state(),
    r: null, modalGone: document.getElementById('ob-settings').getClientRects().length === 0,
    backdrops: document.querySelectorAll('.ob-backdrop').length,
    expanded: document.getElementById('ob-gear').getAttribute('aria-expanded'),
    hudBack: document.getElementById('hud')?.inert === false })`);
  // GH-370: the fresh rack grants the opening BALL_IN_HAND (kitchen)
  check('D14 place analog: the accepted pick re-racks and EXITS the shell into the opening '
    + 'AIM/BALL_IN_HAND (modal down, zero backdrops, gear collapsed, HUD restored)',
  exited && (afterC.state === 'AIM' || afterC.state === 'BALL_IN_HAND')
    && afterC.modalGone && afterC.backdrops === 0
    && afterC.expanded === 'false' && afterC.hudBack,
  JSON.stringify({ exited, ...afterC }));
  // scripted skipConfirm restore: the pin law — never opens anything, and
  // the shell (already down) stays down
  await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await sleep(600);
  check('#121: skipConfirm restore leaves the modal AND the shell down',
    await chrome.eval(SHELL_GONE) === true
    && await chrome.eval(`window.__shell.isOpen() === false`) === true);
  // A2 (shell-closed leg): show('game') with everything closed opens the
  // shell at play; quickPlay() (the S1 exit) restores the table for the arms below
  const a2closed = await chrome.eval(`window.__settings.show('game')`);
  check("A2: show('game') with the shell closed opens the shell at the play place",
    a2closed !== 'game' && await pollFor(SHELL_AT_PLAY));
  await pollFor(PLAY_MOUNTED, 150);
  await chrome.eval(`window.__shell.quickPlay(); true`);
  check('A2: quickPlay() (the S1 exit) closes the shell again',
    await pollFor(`window.__shell.isOpen() === false`, 150));
  const natives = await chrome.eval('window.__nativeCalls');
  check('SC-001: zero window.confirm/window.alert invocations',
    natives.confirm === 0 && natives.alert === 0, JSON.stringify(natives));
  const errsA = await chrome.eval('window.__test.errors');
  if (errsA.length) fail('app errors (desktop page): ' + errsA.join(' | '));

  // ---- C1b/C2: RETIRED with the equipment pane (feature 032 — the
  // sanctioned in-slice re-cut). The tiered accordion, the relocated
  // lighting group, and the table provenance-card switch flows migrated to
  // the atelier's stations; their semantics are owned by e2e-atelier arm D
  // (per-station swap round-trips: confirm/decline branches, recommended
  // cushion pairing, the D14 place-analog exit) and the atelier's station
  // DOM arms. Nothing else in this suite changed for them.

  // ---- C3. #121 auto-close-iff-rerack boundaries ----------------------------
  // Non-re-racking tweaks NEVER auto-close (the player may be adjusting
  // several), a DECLINED re-rack confirm keeps the modal open unchanged,
  // and the mode legs split exactly on the rerack: play → playground keeps
  // the layout (stays open), playground → play re-racks (auto-closes).
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await waitFor(
    `document.getElementById('ob-settings').getClientRects().length > 0`,
    'settings shell (C3 arm)');
  // (a) non-re-racking tweak on a RESIDENT control (the lighting fixture
  // leg re-cut with the pane — 032; the fixture control's own never-closes
  // law is e2e-atelier arm D's): the assists contrast select commits live,
  // no confirm, no re-rack — the modal stays open
  await chrome.eval(`window.__settings.show('assists')`);
  await sleep(200);
  await chrome.eval(`(() => {
    const sel = document.getElementById('ob-set-assist-contrast');
    sel.value = 'high';
    sel.dispatchEvent(new Event('change'));
  })()`);
  await sleep(400);
  const tweak = await chrome.eval(`({
    contrast: window.__settings.get().assistContrast,
    open: document.getElementById('ob-settings').getClientRects().length > 0,
    confirms: document.querySelectorAll('[data-ob="confirm"]').length })`);
  check('#121: non-rerack tweak (assist contrast) commits, modal STAYS open',
    tweak.contrast === 'high' && tweak.open && tweak.confirms === 0,
    JSON.stringify(tweak));
  // (b) volume nudge (display register): same — never closes
  await chrome.eval(`window.__settings.show('display')`);
  await sleep(150);
  await chrome.eval(`(() => {
    const sl = document.getElementById('ob-set-volume');
    sl.value = '0.55';
    sl.dispatchEvent(new Event('input'));
  })()`);
  await sleep(300);
  const vol = await chrome.eval(`({
    volume: window.__settings.get().volume,
    open: document.getElementById('ob-settings').getClientRects().length > 0 })`);
  check('#121: volume tweak commits, modal STAYS open',
    vol.volume === 0.55 && vol.open, JSON.stringify(vol));
  // (c) DECLINED discipline switch keeps the SHELL open at play, nothing
  // changes — re-cut (feature 034) from the resident game select to the
  // play card: show('game') routes the OPEN modal to the play place first
  // (the A2 law), the pick raises the kit confirm, cancel keeps the shell
  // open with the game unchanged
  await chrome.eval(`window.__settings.show('game')`);
  check("#121/034: show('game') from the open modal lands the shell at play",
    await pollFor(SHELL_GONE) && await pollFor(SHELL_AT_PLAY)
    && await pollFor(PLAY_MOUNTED, 150));
  await chrome.eval(`window.__c3Pick = window.__play?.pick?.('eight_ball') ?? Promise.resolve('no-play'); true`);
  // #170: unchecked raise poll + unguarded cleanup click was the abort
  // pattern — assert the raise, guard the click (no-op when it never rose)
  check('#121: game re-rack confirm raises (play card pick)', await pollFor(CONFIRM_UP));
  await chrome.eval(`document.querySelector('[data-ob="confirm-cancel"]')?.click()`);
  await pollFor(`!document.querySelector('[data-ob="confirm"]')`);
  const decl = await chrome.eval(`(async () => ({
    r: await window.__c3Pick, game: window.__settings.get().game,
    shell: window.__shell.isOpen(), place: window.__shell.place() }))()`);
  check('#121/034: declined discipline switch keeps the SHELL open at play, no change',
    decl.r === false && decl.game === 'nine_ball' && decl.shell === true
    && decl.place === 'play', JSON.stringify(decl));
  // (d) mode legs (feature 034 re-cut): → playground via 036a's practice
  // card — the place action EXITS to the table by design (036 FR-007),
  // positions kept (same seed, same shot index: no re-rack); reopen the
  // shell at play → `play-back` (playground → play) re-racks and EXITS to
  // the table (the ONLY re-racking mode leg, GH-121)
  await chrome.eval(`window.__shell.go('practice'); true`);
  check('#121/034: the practice card mounts its playground action (handle + shown group)',
    await pollFor(`typeof window.__practice === 'object'
      && document.getElementById('ob-practice')?.hidden === false
      && !!document.querySelector('[data-ob="practice-playground"]')`, 150));
  const bed0 = await chrome.eval(`({ seed: window.__test.bed().seed, shot: window.__test.bed().shotIndex })`);
  await chrome.eval(`document.querySelector('[data-ob="practice-playground"] button').click(); true`);
  const pgExit = await pollFor(
    `window.__shell.isOpen() === false && window.__settings.get().mode === 'playground'`, 150);
  const toPg = await chrome.eval(`({
    mode: window.__settings.get().mode, shell: window.__shell.isOpen(),
    seed: window.__test.bed().seed, shot: window.__test.bed().shotIndex })`);
  check('#121/034: play → playground via the practice card EXITS to the table with the layout kept (no re-rack)',
    pgExit && toPg.mode === 'playground' && toPg.shell === false
    && toPg.seed === bed0.seed && toPg.shot === bed0.shot, JSON.stringify({ bed0, ...toPg }));
  await chrome.eval(`window.__shell.openShell({}); true`);
  await pollFor(`window.__shell.isOpen() === true`, 150);
  await chrome.eval(`window.__shell.go('play'); true`);
  check('034: the play card shows back-to-play while the mode is playground',
    await pollFor(`${PLAY_MOUNTED} && document.querySelector('[data-ob="play-back"]')?.hidden === false`, 150));
  await chrome.eval(`window.__c3Back = window.__play?.back?.() ?? 'no-play'; true`);
  const pgClosed = await pollFor(`window.__shell.isOpen() === false`, 150);
  const backPlay = await chrome.eval(`({
    r: window.__c3Back, mode: window.__settings.get().mode,
    state: window.__test.state(),
    modalGone: document.getElementById('ob-settings').getClientRects().length === 0,
    backdrops: document.querySelectorAll('.ob-backdrop').length })`);
  // GH-370: the play-mode fresh rack grants the opening BALL_IN_HAND
  check('#121/034: playground → play via play-back re-racks and EXITS to the table into the opening state',
    pgClosed && backPlay.r === true && backPlay.mode === 'play'
    && (backPlay.state === 'AIM' || backPlay.state === 'BALL_IN_HAND')
    && backPlay.modalGone && backPlay.backdrops === 0, JSON.stringify(backPlay));
  // restore the tweaked prefs for a clean page state
  await chrome.eval(`(() => {
    __settings.set('assistContrast', 'standard');
    __settings.set('volume', 0.8);
  })()`);
  await sleep(300);
  const natC3 = await chrome.eval('window.__nativeCalls');
  check('C3: zero native dialogs across the boundary flows',
    natC3.confirm === 0 && natC3.alert === 0, JSON.stringify(natC3));
  const errsC3 = await chrome.eval('window.__test.errors');
  if (errsC3.length) fail('app errors (C3 arm): ' + errsC3.join(' | '));

  // ---- C4 / GH-151 part 1 / C4e / C4b / C4c / C4d / C4f: RETIRED ------------
  // (feature 034, program 525 S4a-mig — spec 034 §14 + ruling 3; plan §8.3)
  // The #135/GH-182 practice pane (recent-drill cards, browse button + live
  // count, the GH-151 practice-select law, the C4b/C4c requirement-badge
  // geometry + active-vs-persisted correctness, the C4d fold/reachability
  // trade, the C4f assist-keyed best line) left the modal with the game
  // section. SUCCESSORS (feature 036a, LIVE on this tree — e2e-practice.mjs
  // arms P-A…P-I): `[data-ob="practice-drills"]` (browse → the tier-grouped
  // picker), `[data-ob="practice-last"]` (last drill, commit-and-go), the
  // toolbar drills pill (in-game re-entry), `[data-ob="practice-playground"]`
  // (the sandbox leg, driven by C3(d) above). ACCEPTED BOUNDED GAP until
  // 036b (`__drills.recent(n)`): the ≤3-card recency ladder (GH-182 ts
  // ordering, the ts-less `last` lead, the per-card discipline-mismatch
  // badge) has ONE successor card (the last drill) on the practice place —
  // recorded in feature 034 (internal spec) §10 and plan §15.

  // ---- D. persistence fixture compare (SC-003) ------------------------------
  await chrome.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('ob-settings-v1', JSON.stringify({
      preset: 'realistic', cloth: 'worn_slow', assist: 'basic',
      soundOn: false, volume: 0.5, camera: 'overhead',
    }));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=persist` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (persist arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const persisted = await chrome.eval(`({
    resolved: window.__settings.get(),
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')),
    mirrorAssist: localStorage.getItem('ob.settings.assist'),
    mirrorCuePath: localStorage.getItem('ob.settings.assistCuePath'),
    mirrorContrast: localStorage.getItem('ob.settings.assistContrast') })`);
  const rv = persisted.resolved;
  check('SC-003: pre-015 blob resolves (preset->cushion, cloth kept, '
    + 'assist migrated, sound/volume/camera kept, game/look defaulted)',
  rv.equipment.cushion_model_id === 'stronge_realistic'
    && rv.equipment.cloth_id === 'worn_slow'
    && rv.equipment.table_id === 'pool_pro_9ft'
    && rv.assist === 'standard' && rv.soundOn === false
    && rv.volume === 0.5 && rv.camera === 'overhead'
    && rv.game === 'nine_ball' && rv.look === 'tournament' && rv.language === '',
  JSON.stringify(rv));
  // #142 migration semantics pin (recorded): a pre-#142 blob has NO
  // powerResponse key and MUST resolve to the perceptual default on
  // upgrade — the feel change for existing installs is intentional
  // (owner A/B; Linear is one toggle away)
  check('SC-003: pre-#142 blob resolves powerResponse to the perceptual '
    + 'default (recorded upgrade semantics)',
  rv.powerResponse === 'perceptual', JSON.stringify(rv.powerResponse));
  // GH-386 migration semantics pin (recorded): a pre-386 blob has NO
  // fixtureAuto key and MUST resolve to the venue default on upgrade —
  // pre-386 persist() wrote fixture:'canopy_panel' whether or not the
  // player ever touched it, so the absent key is the only honest
  // "never chose" signal (the powerResponse precedent)
  check('SC-003: pre-386 blob resolves fixtureAuto to the venue default '
    + '(recorded upgrade semantics)',
  rv.fixtureAuto === true, JSON.stringify(rv.fixtureAuto));
  const keys = Object.keys(persisted.raw).sort().join(',');
  const WANT_KEYS = ['assist', 'assistContrast', 'assistCuePath',
    'assistWrongBall',
    'brightness', 'camera', 'caromSecondBall', 'clothColor', 'equipment',
    'equipmentByGame',
    'fixture', 'fixtureAuto', 'game',
    'language', 'look', 'mode', 'powerResponse', 'snapGrid', 'soundOn',
    'variants', 'volume'] // 'caromSecondBall': the GH-383 visual fork
    // (carom ball 1 paint, 'yellow'|'marked' — visual-only, the
    // look/#89/#140 precedent; no preview mirror key);
    // 'variants': the 022 per-discipline rules-variant
    // map; 'mode': the #68 session mode (play|practice|playground);
    // 'fixture'/'brightness': the #89 visual-only lighting axis (the look
    // precedent — recorded deviation, the ownership ledger lighting entry);
    // 'assistWrongBall': the #88 wrong-ball warning toggle
    // (no preview mirror key ON PURPOSE — the mirror arm below is untouched);
    // 'snapGrid': the #140 playground snap-to-grid toggle (visual-only,
    // default false; no preview mirror key — recorded deviation, the #68
    // 'mode' precedent, the ownership ledger #140 entry);
    // 'powerResponse': the #142 power-response curve
    // ('perceptual'|'linear', visual/input-only — again no mirror key);
    // 'clothColor': the GH-229 visual-only cloth-color override ('' =
    // factory identity default; no mirror key — recorded deviation, the
    // #89/#140/#142 precedent, the ownership ledger GH-229 entry);
    // 'fixtureAuto': the GH-386 venue-default flag (true = the room hangs
    // each table class's own lamp; absent-key migration lands here — the
    // powerResponse recorded-upgrade precedent; no mirror key)
    // 'assistContrast': the GH-417 assist-line contrast level (WITH a
    // preview mirror key — previewink.js boot-reads it, the preview.js
    // assist precedent; see the mirror arm below + arm D5)
    .join(',');
  const axes = Object.keys(persisted.raw.equipment ?? {}).sort().join(',');
  check('SC-003: written blob shape byte-compatible (top-level key set + '
    + '5 equipment axes + equipmentByGame lockstep + no legacy keys)',
  keys === WANT_KEYS
    && axes === 'ballset_id,cloth_id,cue_id,cushion_model_id,table_id'
    && JSON.stringify(persisted.raw.equipmentByGame?.nine_ball)
      === JSON.stringify(persisted.raw.equipment),
  JSON.stringify({ keys, axes }));
  check('SC-003: preview mirror keys follow the blob',
    persisted.mirrorAssist === 'standard' && persisted.mirrorCuePath === 'true'
    && persisted.mirrorContrast === 'standard', // GH-417 (pre-417 blob →
    // the shipped default, mirrored for previewink.js's boot read)
    JSON.stringify(persisted));

  // ---- D2. grip_fitted UI demotion + grandfathering (issue #87 comp 4) ------
  // RE-CUT (feature 032 — the sanctioned in-slice list): the cushion PICKER
  // migrated to the atelier's table station (its option-law DOM arms live
  // in e2e-atelier arm D); what stays HERE is the settings-machinery half —
  // the load path keeps honoring a persisted demoted selection end-to-end
  // (blob + kernel), and deselecting is permanent for NEW selection.
  await chrome.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('ob-settings-v1', JSON.stringify({
      equipment: { table_id: 'diamond_proam_9ft',
        cloth_id: 'simonis_860_tournament', ballset_id: 'aramith_pool',
        cue_id: 'standard', cushion_model_id: 'grip_fitted' },
    }));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=grip` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (grip arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  // kernel truth may land a beat after ready (first rack composition)
  await pollFor(`(window.__test.equipment() || {}).cushion_model_id`
    + ` === 'grip_fitted'`);
  const grand = await chrome.eval(`({
    resolved: window.__settings.get().equipment.cushion_model_id,
    kernel: (window.__test.equipment() || {}).cushion_model_id ?? null })`);
  check('D2: persisted grip_fitted grandfathered end-to-end '
    + '(blob resolves + kernel rack)',
  grand.resolved === 'grip_fitted' && grand.kernel === 'grip_fitted',
  JSON.stringify(grand));
  // switching away is permanent for NEW selection (the picker-visibility
  // law itself is asserted on the atelier rows — e2e-atelier arm D)
  await chrome.eval(`__settings.changeEquipment('cushion_model_id', `
    + `'stronge_realistic', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().equipment.cushion_model_id`
    + ` === 'stronge_realistic'`);
  check('D2: deselecting commits the replacement (machinery half)',
    await chrome.eval(`window.__settings.get().equipment.cushion_model_id`)
    === 'stronge_realistic');
  const errsD2 = await chrome.eval('window.__test.errors');
  if (errsD2.length) fail('app errors (grip arm): ' + errsD2.join(' | '));

  // ---- D2b. catalog v14 superseded_by demotion + migration (#283) -----------
  // RE-CUT to the NARROWED 032 scope (review r1+r2 on the S2 spec; research
  // R8): (1) hidden from NEW selection — the ONE remaining modal-side cue
  // option surface is ctx.cueSwap.options (the HUD between-shots control;
  // the atelier's cue rows consume the SAME seam, e2e-atelier owns their
  // DOM); (2) a PERSISTED branded superseded cue (ui_hidden + superseded_by)
  // migrates to its pro_ld_pivot_* twin on load and the boot re-persist
  // writes the twin (#789 R8; physics byte-identical, no cue is lost);
  // (3) replay-pinned RESOLUTION unchanged (the transient sender spec
  // reaches the resolution machinery exactly as today); (4) the modal's
  // TRANSIENT replay-pinned picker echo is RETIRED — no successor surface
  // (the shell is FR-016-forbidden during shared replays; asserted below
  // as the equipment pane's absence from the modal).
  const CUE_OPTS = `import('/app/settings.js').then((m) =>
    m.ctx.cueSwap.options().map((o) => o.id))`;
  const SUPERSEDED = ['predator_z2', 'predator_314', 'meucci_reddot'];
  const cueFresh = await chrome.eval(CUE_OPTS);
  check('D2b: the cue option seam lists NO superseded branded ids; the '
    + 'twins + the v14 archetypes are present',
  Array.isArray(cueFresh)
    && !SUPERSEDED.some((id) => cueFresh.includes(id))
    && ['pro_ld_pivot_141', 'pro_ld_pivot_118', 'pro_ld_pivot_101',
      'carbon_ld', 'jump_phenolic', 'snooker_ash', 'carom_conical']
      .every((id) => cueFresh.includes(id)),
  JSON.stringify(cueFresh));
  // migration boot: a blob that already selects a branded superseded id
  await chrome.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('ob-settings-v1', JSON.stringify({
      equipment: { table_id: 'diamond_proam_9ft',
        cloth_id: 'simonis_860_tournament', ballset_id: 'aramith_pool',
        cue_id: 'predator_z2', cushion_model_id: 'stronge_realistic' },
    }));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=superseded` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (superseded arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  await pollFor(`(window.__test.equipment() || {}).cue_id === 'pro_ld_pivot_141'`);
  const sup = await chrome.eval(`(async () => ({
    resolved: window.__settings.get().equipment.cue_id,
    kernel: (window.__test.equipment() || {}).cue_id ?? null,
    current: (await import('/app/settings.js')).ctx.cueSwap.current(),
    opts: await ${CUE_OPTS},
    raw: JSON.parse(localStorage.getItem('ob-settings-v1'))
      .equipment.cue_id }))()`);
  check('D2b: persisted branded superseded cue migrates to its twin end '
    + 'to end (blob resolves + kernel rack + current on the option seam, '
    + 'old id gone) AND the boot re-persist rewrites it to the twin',
  sup.resolved === 'pro_ld_pivot_141' && sup.kernel === 'pro_ld_pivot_141'
    && sup.current === 'pro_ld_pivot_141'
    && sup.opts.includes('pro_ld_pivot_141')
    && !sup.opts.includes('predator_z2') && sup.raw === 'pro_ld_pivot_141',
  JSON.stringify(sup));
  // replay-pinned transient spec: RESOLUTION keeps the sender's ids (the
  // transient path never passes sanitizeSpec, so the sender's superseded
  // cue is NOT migrated) — and the modal's transient picker ECHO is
  // RETIRED with the pane (narrowed scope: no successor surface; the shell
  // is FR-016-forbidden during shared replays)
  await chrome.eval(`window.__settings.setTransientEquipment({
    ...window.__settings.get().equipment, cue_id: 'meucci_reddot' })`);
  await pollFor(`window.__settings.get().equipment.cue_id`
    + ` === 'meucci_reddot'`);
  const trans = await chrome.eval(`({
    resolved: window.__settings.get().equipment.cue_id,
    paneGone: !document.querySelector(
      '#ob-settings section[data-section="equipment"]')
      && !document.getElementById('ob-eq-cue_id'),
    persisted: JSON.parse(localStorage.getItem('ob-settings-v1'))
      .equipment.cue_id })`);
  check('D2b: transient superseded pin RESOLVES unchanged while the '
    + "modal's picker echo is RETIRED with the pane (no successor surface; "
    + 'persisted value untouched)',
  trans.resolved === 'meucci_reddot' && trans.paneGone
    && trans.persisted === 'pro_ld_pivot_141',
  JSON.stringify(trans));
  await chrome.eval('window.__settings.restorePersistedEquipment()');
  await pollFor(`window.__settings.get().equipment.cue_id`
    + ` === 'pro_ld_pivot_141'`);
  const trans2 = await chrome.eval(`(async () => ({
    resolved: window.__settings.get().equipment.cue_id,
    opts: await ${CUE_OPTS} }))()`);
  check('D2b: restore drops the transient superseded id from the option '
    + 'seam, the persisted twin stays',
  trans2.resolved === 'pro_ld_pivot_141'
    && !trans2.opts.includes('meucci_reddot')
    && trans2.opts.includes('pro_ld_pivot_141'),
  JSON.stringify(trans2));
  // the migrated blob still holds the twin after the transient round trip
  // (after R8 the arm starts on the twin, so no switch-away leg is needed)
  const supBlob = await chrome.eval(`JSON.parse(localStorage.getItem(`
    + `'ob-settings-v1')).equipment.cue_id`);
  check('D2b: the migrated blob holds the twin, never the superseded id',
    supBlob === 'pro_ld_pivot_141', JSON.stringify(supBlob));
  const errsD2b = await chrome.eval('window.__test.errors');
  if (errsD2b.length) fail('app errors (superseded arm): ' + errsD2b.join(' | '));

  // ---- D2d. retired-id digest migration (#789 C5) ---------------------------
  // A persisted blob holding the two retired v8 Measured ids loads as the
  // twins pool_pro_9ft_measured / pool_worsted_measured through the digest
  // leaf (web/scene/equipmentalias.js). The boots use obtool=0: the launch
  // stamp stored sessionStorage 'ob-scripted', which pins the scene to the
  // scripted table; obtool=0 clears it so the scene reads the saved id. The
  // last leg re-arms the scripted flag for the arms after this one. No
  // message or detail names a retired id (redact() below).
  // the two retired v8 Measured ids
  const RETIRED_TABLE_ID = 'owner_proam_9ft_2026_07';
  const RETIRED_CLOTH_ID = 'owner_proam_cloth_2026_07';
  const redact = (s) => String(s).split(RETIRED_TABLE_ID).join('<retired table id>')
    .split(RETIRED_CLOTH_ID).join('<retired cloth id>');
  // the built table id, inlined from builtTableIdExpr
  // (tools/render/lib/table-ids.mjs; no new import)
  const BUILT_TABLE_ID = `(() => {
    const scene = window.__dbg && window.__dbg.scene; let table = null;
    if (scene) scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
    return (table && table.userData && table.userData.tableId) || null;
  })()`;
  await chrome.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('ob-settings-v1', JSON.stringify({
      equipment: { table_id: ${JSON.stringify(RETIRED_TABLE_ID)},
        cloth_id: ${JSON.stringify(RETIRED_CLOTH_ID)},
        ballset_id: 'pool_standard', cue_id: 'standard',
        cushion_model_id: 'stronge_realistic' },
    }));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=0&arm=retired` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (retired-id arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  await pollFor(`(window.__test.equipment() || {}).table_id`
    + ` === 'pool_pro_9ft_measured'`);
  const ret = await chrome.eval(`({
    settings: window.__settings.get().equipment,
    blob: JSON.parse(localStorage.getItem('ob-settings-v1')).equipment,
    kernel: (window.__test.equipment() || {}).table_id ?? null })`);
  check('D2d: the retired ids load as their twins (settings + re-persisted '
    + 'blob + kernel: pool_pro_9ft_measured / pool_worsted_measured)',
  ret.settings.table_id === 'pool_pro_9ft_measured'
    && ret.settings.cloth_id === 'pool_worsted_measured'
    && ret.blob.table_id === 'pool_pro_9ft_measured'
    && ret.blob.cloth_id === 'pool_worsted_measured'
    && ret.kernel === 'pool_pro_9ft_measured',
  redact(JSON.stringify(ret)));
  await pollFor(`${BUILT_TABLE_ID} === 'pool_pro_9ft_measured'`);
  const builtBoot = await chrome.eval(BUILT_TABLE_ID);
  check('D2d: the scene built pool_pro_9ft_measured at boot, not the '
    + 'scripted pin wpa_generic_9ft (obtool=0 boot)',
  builtBoot === 'pool_pro_9ft_measured', redact(builtBoot));
  // transient share replay: the sender's ids reach the resolution unchanged
  // (setTransientEquipment never sanitizes); the direct prepareEquipment call
  // in set() and the ob:settings listener both pass the digest, so the scene
  // builds the twin; the persisted blob is untouched
  await chrome.eval(`window.__settings.setTransientEquipment({
    ...window.__settings.get().equipment,
    table_id: ${JSON.stringify(RETIRED_TABLE_ID)},
    cloth_id: ${JSON.stringify(RETIRED_CLOTH_ID)} })`);
  await pollFor(`window.__settings.get().equipment.table_id === `
    + JSON.stringify(RETIRED_TABLE_ID));
  await pollFor(`${BUILT_TABLE_ID} === 'pool_pro_9ft_measured'`);
  const retT = await chrome.eval(`({
    resolved: window.__settings.get().equipment,
    built: ${BUILT_TABLE_ID},
    blob: JSON.parse(localStorage.getItem('ob-settings-v1')).equipment })`);
  check('D2d: a transient sender spec keeps the retired ids while the '
    + 'scene builds pool_pro_9ft_measured and the blob keeps the twins',
  retT.resolved.table_id === RETIRED_TABLE_ID
    && retT.resolved.cloth_id === RETIRED_CLOTH_ID
    && retT.built === 'pool_pro_9ft_measured'
    && retT.blob.table_id === 'pool_pro_9ft_measured'
    && retT.blob.cloth_id === 'pool_worsted_measured',
  redact(JSON.stringify(retT)));
  await chrome.eval('window.__settings.restorePersistedEquipment()');
  await pollFor(`window.__settings.get().equipment.table_id`
    + ` === 'pool_pro_9ft_measured'`);
  const retR = await chrome.eval('window.__settings.get().equipment');
  check('D2d: restore returns the twins (pool_pro_9ft_measured / '
    + 'pool_worsted_measured)',
  retR.table_id === 'pool_pro_9ft_measured'
    && retR.cloth_id === 'pool_worsted_measured', redact(JSON.stringify(retR)));
  const errsD2d = await chrome.eval('window.__test.errors');
  if (errsD2d.length) fail('app errors (retired-id arm): ' + redact(errsD2d.join(' | ')));
  // the ?table= digest path (D2): a fresh profile, so only the query can
  // name the twin; without the digest the boot builds the scripted pin
  await chrome.eval('localStorage.clear()');
  await chrome.send('Page.navigate', {
    url: `${APP_URL}&obtool=0&table=${RETIRED_TABLE_ID}&arm=retired-table` });
  await waitReady();
  await pollFor(`${BUILT_TABLE_ID} === 'pool_pro_9ft_measured'`);
  const builtQuery = await chrome.eval(BUILT_TABLE_ID);
  check('D2d: a ?table= boot with the retired table id builds '
    + 'pool_pro_9ft_measured (the digest path of resolveBootTableId)',
  builtQuery === 'pool_pro_9ft_measured', redact(builtQuery));
  // re-arm the scripted flag: D2c and the later arms navigate without obtool
  // and rely on sessionStorage 'ob-scripted'
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&arm=retired-reset` });
  await waitReady();

  // ---- D2e. the retired look id (GH-973) ------------------------------------
  // The retired look id 'sp' is now 'tournament'. Stored
  // settings (a native snapshot restore writes the same blob), a shared
  // ?look=sp link and the API entry points keep accepting the old id. This
  // boot is scripted, and a scripted boot pins bootLook to green unless ?look=
  // names an accepted id, so bootLook 'tournament' here is the URL alias itself
  // and not the real-user default (obtool=1 makes it scripted on its own). A
  // stored 'sp' falls to the default look even without its alias; the leg pins
  // that it stays the tournament look. The falloff sentinel makes the
  // __test.setLook('sp') leg read main.js's alias: look.js maps 'sp' by itself,
  // and only main.js's tournament branch re-writes the falloff to 0.62.
  await chrome.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('ob-settings-v1', JSON.stringify({ look: 'sp' }));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&look=sp&arm=legacy-look` });
  await waitReady();
  const legacyLook = await chrome.eval(`(async () => {
    const boot = { bootLook: window.__test.bootLook, stored: window.__settings.get().look };
    window.__settings.set('look', 'sp');
    const set = { look: window.__settings.get().look,
      raw: JSON.parse(localStorage.getItem('ob-settings-v1') || '{}').look ?? null };
    const fall = window.__dbg?.composer?.passes?.find((p) => p.uniforms?.strength);
    if (fall) fall.uniforms.strength.value = 0.5; // the sentinel
    const regrade = window.__test.setLook('sp');
    const falloff = fall ? fall.uniforms.strength.value : null;
    let gi;
    try {
      await window.__gi.setLook('sp');
      gi = window.__gi.state.requestedLook ?? null;
    } catch (e) { gi = 'threw: ' + (e && e.message); }
    return { ...boot, set, regrade, falloff, gi };
  })()`);
  check('D2e: the retired look id resolves to tournament (?look=sp boot, '
    + 'stored blob, settings.set, __test.setLook, __gi.setLook)',
  legacyLook.bootLook === 'tournament' && legacyLook.stored === 'tournament'
    && legacyLook.set.look === 'tournament' && legacyLook.set.raw === 'tournament'
    && legacyLook.regrade === true && legacyLook.falloff === 0.62
    && legacyLook.gi === 'tournament',
  JSON.stringify(legacyLook));

  // ---- D2f. the retired look id across a mixed cache (GH-973) ---------------
  // OWNERSHIP rule 5: a revalidated module can meet a cached pre-rename one.
  // The pre-rename look.js, gi.js and gi-manifest.json are the REAL base files
  // (web/tools/fixtures/gh973-legacy, each checked against its base blob id);
  // the pre-rename lightingvisuals.js is synthesized from the fresh file by
  // reversing PR-2's three id lines (each applies once or is already stale).
  // They are served through Fetch interception. Four pairings:
  //   1. old look.js + lightingvisuals.js + manifest under a fresh main.js and
  //      gi.js: main's calls carry the legacy id; gi.js adopts the old
  //      manifest, its sp keys and its gi-sp-* names (PR-2 renamed the files);
  //   2. a fresh look.js over an old lightingvisuals.js, a live regrade after
  //      the leaf landed: look.js hands the leaf the legacy id;
  //   3. old gi.js + manifest with the old gi-sp-* lightmaps still cached
  //      (served from the renamed files' bytes) under a fresh main.js: main
  //      retries gi with the legacy id when the canonical look is missing;
  //   4. old look.js + gi.js over the FRESH manifest: an old caller's
  //      gi.setLook('sp') finds the manifest's legacy alias entry.
  const LEGACY = path.join(webDir, 'tools/fixtures/gh973-legacy');
  const privateTree = fs.existsSync(path.join(webDir, '..', 'scripts/opensource/sync-public-snapshot'));
  if (!fs.existsSync(LEGACY)) {
    if (privateTree) check('D2f: the real-base fixtures exist (web/tools/fixtures/gh973-legacy)', false, 'missing');
    else console.log('[e2e-settings] SKIP D2f: the public snapshot excludes web/tools/fixtures/gh973-legacy');
  } else {
    const rec = JSON.parse(fs.readFileSync(path.join(LEGACY, 'BASE.json'), 'utf8'));
    const real = {};
    for (const [name, { path: rel, blob }] of Object.entries(rec.files)) {
      const b = fs.readFileSync(path.join(LEGACY, name));
      const id = createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
      if (id !== blob) throw new Error(`D2f: ${name} is not the base blob ${blob} (got ${id})`);
      real[rel.replace(/^web\//, '')] = b;
    }
    const STALE_LIGHTING = [
      ['  tournament: {\n    lamp: { color: 0xf6f7f9', '  sp: {\n    lamp: { color: 0xf6f7f9'],
      ["    look: (look === 'tournament' || look === 'sp') ? 'tournament' : 'default', // 'sp': the legacy look id (GH-973)",
        "    look: look === 'sp' ? 'sp' : 'default',"],
      ["      const next = (name === 'tournament' || name === 'sp') ? 'tournament' : 'default'; // 'sp': the legacy look id (GH-973)",
        "      const next = name === 'sp' ? 'sp' : 'default';"]];
    const staleLighting = () => {
      let s = fs.readFileSync(path.join(webDir, 'scene/lightingvisuals.js'), 'utf8');
      for (const [a, b] of STALE_LIGHTING) {
        const n = s.split(a).length - 1;
        if (n === 1) s = s.replace(a, b);
        else if (!(n === 0 && s.includes(b))) throw new Error(`D2f: scene/lightingvisuals.js carries ${n} of ${JSON.stringify(a.slice(0, 60))} (update the synthesis)`);
      }
      return Buffer.from(s);
    };
    let staleNow = null; // { bodies: { rel: Buffer }, cachedLightmaps } for the current leg (null: pass through)
    chrome.onEvent((method, params) => {
      if (!staleNow || method !== 'Fetch.requestPaused') return;
      const p = decodeURIComponent(new URL(params.request.url).pathname);
      let body = null;
      const hit = Object.keys(staleNow.bodies).find((k) => p.endsWith('/' + k));
      if (hit) body = staleNow.bodies[hit];
      const old = /\/assets\/gi\/gi-sp-([^/]+)$/.exec(p);
      if (!body && old && staleNow.cachedLightmaps) {
        body = fs.readFileSync(path.join(webDir, 'assets/gi', `gi-tournament-${old[1]}`));
      }
      if (body) {
        chrome.send('Fetch.fulfillRequest', {
          requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: p.endsWith('.json') ? 'application/json'
            : p.endsWith('.png') ? 'image/png' : 'text/javascript' }],
          body: body.toString('base64'),
        });
      } else chrome.send('Fetch.continueRequest', { requestId: params.requestId });
    });
    const MIXED_READ = `({ bootLook: window.__test.bootLook,
      exposure: window.__dbg.renderer.toneMappingExposure,
      lighting: window.__lighting?.state?.().look ?? null,
      gi: window.__gi?.state?.look ?? null, giOn: window.__gi?.uniforms?.uGiOn?.value ?? null,
      giError: window.__gi?.state?.loadError ?? null })`;
    const mixedLeg = async (bodies, url, settle, cachedLightmaps = false) => {
      staleNow = { bodies, cachedLightmaps };
      const patterns = Object.keys(bodies).map((rel) => ({ urlPattern: `*${rel}*` }));
      if (cachedLightmaps) patterns.push({ urlPattern: '*assets/gi/gi-sp-*' });
      await chrome.send('Fetch.enable', { patterns });
      await chrome.send('Network.enable');
      await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
      await chrome.eval('localStorage.clear()');
      await chrome.send('Page.navigate', { url });
      await waitReady();
      const extra = (await settle()) ?? {};
      const r = { ...(await chrome.eval(MIXED_READ)), ...extra };
      staleNow = null;
      await chrome.send('Fetch.disable');
      await chrome.send('Network.clearBrowserCache');
      await chrome.send('Network.setCacheDisabled', { cacheDisabled: false });
      return r;
    };
    const mixed1 = await mixedLeg({ 'scene/look.js': real['scene/look.js'],
      'scene/lightingvisuals.js': staleLighting(), 'assets/gi/gi-manifest.json': real['assets/gi/gi-manifest.json'] },
    `${APP_URL}&obtool=1&look=tournament&arm=legacy-mixed-1`,
    () => pollFor(`window.__gi?.state?.look === 'tournament' && window.__gi?.uniforms?.uGiOn?.value === 1`));
    check('D2f-1: a fresh main.js and gi.js land the tournament look on the cached pre-rename '
      + 'look.js, lightingvisuals.js and manifest (its gi-sp-* names remapped)',
    mixed1.bootLook === 'tournament' && Math.abs(mixed1.exposure - 0.85) < 1e-6
      && mixed1.lighting === 'sp' && mixed1.gi === 'tournament' && mixed1.giOn === 1
      && mixed1.giError === null,
    JSON.stringify(mixed1));
    const mixed2 = await mixedLeg({ 'scene/lightingvisuals.js': staleLighting() },
      `${APP_URL}&obtool=1&arm=legacy-mixed-2`,
      async () => {
        await pollFor("typeof window.__lighting?.state === 'function'");
        await chrome.eval("window.__test.setLook('tournament')");
      });
    check('D2f-2: a fresh look.js hands a cached pre-rename lightingvisuals.js the '
      + 'legacy id (a live regrade after the leaf landed)',
    mixed2.bootLook === 'green' && Math.abs(mixed2.exposure - 0.85) < 1e-6
      && mixed2.lighting === 'sp',
    JSON.stringify(mixed2));
    const mixed3 = await mixedLeg({ 'scene/gi.js': real['scene/gi.js'],
      'assets/gi/gi-manifest.json': real['assets/gi/gi-manifest.json'] },
    `${APP_URL}&obtool=1&look=tournament&arm=legacy-mixed-3`,
    () => pollFor(`window.__gi?.state?.look === 'sp' && window.__gi?.uniforms?.uGiOn?.value === 1`), true);
    check('D2f-3: a fresh main.js retries a cached pre-rename gi.js (its manifest and '
      + 'lightmaps cached too) with the legacy id when the canonical look is missing',
    mixed3.bootLook === 'tournament' && mixed3.gi === 'sp' && mixed3.giOn === 1
      && mixed3.giError === null,
    JSON.stringify(mixed3));
    const mixed4 = await mixedLeg({ 'scene/look.js': real['scene/look.js'], 'scene/gi.js': real['scene/gi.js'] },
      `${APP_URL}&obtool=1&look=tournament&arm=legacy-mixed-4`,
      async () => {
        await pollFor(`window.__gi?.uniforms?.uGiOn?.value === 1`);
        return { setLookSp: await chrome.eval(`(async () => {
          try { return await window.__gi.setLook('sp'); } catch (e) { return 'threw: ' + (e && e.message); } })()`) };
      });
    check("D2f-4: a cached pre-rename look.js and gi.js over the fresh manifest: gi.setLook('sp') "
      + 'finds the legacy alias entry and keeps the lightmaps on',
    mixed4.setLookSp === true && mixed4.gi === 'sp' && mixed4.giOn === 1 && mixed4.giError === null,
    JSON.stringify(mixed4));
  }

  // ---- D2c. per-discipline default cues (catalog v14, #283 decision 1) ------
  // A fresh profile's FIRST visit to snooker/carom adopts the SDK's
  // DISCIPLINE_DEFAULT_CUE_IDS pairing (snooker_ash / carom_conical)
  // through defaultEquipmentFor at the set('game') equipment swap — and an
  // existing persisted equipmentByGame choice always wins on return visits.
  // GH-1042 (the former RECORDED SEAM): the snooker/carom KERNEL racks
  // compose on the selected spec (game.js composeKindScenario), so the
  // kernel template carries the adopted discipline cue; until the fix it
  // stayed on the kernel default pairing (cue 'standard') whatever the
  // selection said. D2g below follows the cue into the shot records.
  // The miscue seam is pinned as OBSERVED (settings.js ctx.miscue): the
  // dime-tip snooker cue on the 52.5 mm ball commands S = 1 + 0.00895/
  // 0.02625 ≈ 1.34095, strictly UNDER the SDK-builder ceiling
  // 1 + 0.0106/0.028575 ≈ 1.37096 — the ceiling does NOT bind for the
  // discipline-default pairing (it only clips foreign compositions like
  // nickel-tip-on-snooker-ball; settings.js:66-69 note).
  await chrome.eval('localStorage.clear()');
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=eqdefaults` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (eqdefaults arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().equipment.cue_id === 'snooker_ash'
    && (window.__test.equipment() || {}).table_id === 'wpbsa_snooker_12ft'`);
  const snk = await chrome.eval(`({
    game: window.__settings.get().game,
    cue: window.__settings.get().equipment.cue_id,
    cloth: window.__settings.get().equipment.cloth_id,
    kernel: (window.__test.equipment() || {}).cue_id ?? null,
    sel: null })`);
  // (032 re-cut: the picker read moved to the cueSwap option seam — the
  // atelier rows consume the same seam and are e2e-atelier's surface)
  const snkCur = await chrome.eval(
    `import('/app/settings.js').then((m) => m.ctx.cueSwap.current())`);
  check('D2c: first snooker visit adopts the snooker_ash discipline default '
    + '(resolved spec + the option seam; cloth pairing intact) and the '
    + 'kernel rack carries it (GH-1042)',
  snk.game === 'snooker' && snk.cue === 'snooker_ash'
    && snkCur === 'snooker_ash' && snk.cloth === 'snooker_napped'
    && snk.kernel === 'snooker_ash',
  JSON.stringify(snk));
  const snkScale = await chrome.eval(
    `import('/app/settings.js').then((m) => m.ctx.miscue.scale())`);
  check('D2c: dime-tip snooker cue miscue scale ≈ 1.34095, strictly under '
    + 'the SDK-builder ceiling (observed behavior pinned, ceiling unchanged)',
  Math.abs(snkScale - (1 + 0.00895 / 0.02625)) < 1e-9
    && snkScale < 1 + 0.0106 / 0.028575,
  `scale=${snkScale}`);
  await chrome.eval(
    `__settings.changeGame('carom_3cushion', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().equipment.cue_id === 'carom_conical'
    && (window.__test.equipment() || {}).table_id === 'umb_carom_284'`);
  const car = await chrome.eval(`({
    cue: window.__settings.get().equipment.cue_id,
    kernel: (window.__test.equipment() || {}).cue_id ?? null })`);
  check('D2c: first carom visit adopts the carom_conical discipline default '
    + 'and the kernel rack carries it (GH-1042)',
  car.cue === 'carom_conical' && car.kernel === 'carom_conical',
  JSON.stringify(car));
  // an existing persisted per-discipline choice ALWAYS wins over the default
  await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().game === 'snooker'`);
  await chrome.eval(`__settings.changeEquipment('cue_id', `
    + `'standard_dime_tip', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().equipment.cue_id`
    + ` === 'standard_dime_tip'`);
  await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().game === 'nine_ball'
    && window.__settings.get().equipment.cue_id === 'standard'`);
  await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`);
  const kept = await pollFor(`window.__settings.get().game === 'snooker'
    && window.__settings.get().equipment.cue_id === 'standard_dime_tip'`);
  check('D2c: persisted per-discipline cue choice wins over the discipline '
    + 'default on return visits (pool round-trips on standard)',
  kept === true);
  const errsD2c = await chrome.eval('window.__test.errors');
  if (errsD2c.length) fail('app errors (eqdefaults arm): ' + errsD2c.join(' | '));

  // ---- D2g. the discipline cue strikes (GH-1042) -----------------------------
  // The player's path, on a fresh profile with the shell up (obshell): a real
  // click on the Snooker card, a real click on the confirm's Continue, the
  // HUD Shoot button, and the HUD cue select's kit popover. Rules decisions
  // between shots resolve through __rules.decide (not this arm's subject).
  // Red on the pre-fix tree: the template and the records stay on cue
  // 'standard', and the swap hint claims a cue the next shot does not use.
  const D2G_FX = JSON.parse(readFileSync(
    path.join(webDir, 'tools/fixtures/discipline-cue-1042.json'), 'utf8'));
  const EN = JSON.parse(readFileSync(path.join(webDir, 'app/locales/en.json'), 'utf8'));
  const cueParams = (id) => catalogEntries('cue_id').find((e) => e.id === id)?.params;
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const eventsSha = (rec) => createHash('sha256').update(JSON.stringify(rec.events)).digest('hex');
  const d2gShell = `window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'
    && !!document.querySelector('[data-ob="play-games"]')`;
  const settleD2g = async (what) => {
    // a swallowed Shoot click must fail by name, not hand a null record to the cue checks
    if (!await pollFor(`['PLAYBACK', 'SIMULATING'].includes(window.__test.state())`, 50)) {
      throw new Error(`${what}: the shot never started`);
    }
    const ok = await pollFor(`!['PLAYBACK', 'SIMULATING'].includes(window.__test.state())`, 600);
    if (!ok) throw new Error(`${what}: the shot never settled`);
    for (let d = 0; d < 4; d++) {
      const pend = await chrome.eval('window.__rules?.matchState?.()?.pendingDecision?.kind ?? null');
      if (!pend) break;
      await chrome.eval('window.__rules.decide(1)');
      await sleep(300);
    }
  };
  const lastRecord = () => chrome.eval(`(() => { const r = window.__aim?.record?.();
    return r ? JSON.parse(JSON.stringify(r)) : null; })()`);
  // the issue's own steps: a real click on the current hall card focuses the
  // rail, the arrow keys walk it to the target card (the rail scrolls it in),
  // a real click picks it, and a real click on the confirm's Continue
  const hallPick = async (gameId) => {
    // KF-017 (#1155): the opening click must land ON the current card. A hall
    // re-entry that left the rail at its scroll start put the committed card
    // outside the rail's scrollport; its box still reports a rect, so a click
    // at its centre hit the scene behind the rail, focus stayed on the shell's
    // quick-play control and the FR-017 key gate swallowed every arrow (28
    // presses, "the rail never focused the card"). The click point is
    // hit-tested first, and the walk starts only once that click focused the
    // card; each is a named failure, never retried.
    const opener = await chrome.eval(`(() => {
      const rail = document.querySelector('[data-ob="play-games"]');
      const card = rail?.querySelector('[data-ob="play-game"][aria-current="true"]');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      const m = rail.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { cur: card.dataset.game, x, y, onCard: !!hit && card.contains(hit),
        card: [Math.round(r.left), Math.round(r.right)], port: [Math.round(m.left), Math.round(m.right)],
        scrollLeft: Math.round(rail.scrollLeft), hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null };
    })()`);
    if (opener) {
      if (!opener.onCard) {
        throw new Error(`hall pick ${gameId}: the current card (${opener.cur}) is not under its own click point `
          + `(card x ${opener.card.join('-')}, the rail's scrollport x ${opener.port.join('-')} at scrollLeft `
          + `${opener.scrollLeft}; the point hits ${opener.hit})`);
      }
      await mouseClick(opener.x, opener.y);
      await sleep(300);
      if (!await pollFor(`document.activeElement?.dataset?.game === '${opener.cur}'`, 5)) {
        const focus = await chrome.eval(`(() => { const a = document.activeElement;
          return a ? a.tagName + (a.id ? '#' + a.id : '') + (a.dataset?.game ? ' [' + a.dataset.game + ']' : '') : null; })()`);
        throw new Error(`hall pick ${gameId}: the opening click on the current card (${opener.cur}) never focused it (focus on ${focus})`);
      }
    } else await sleep(300);
    const onTarget = `document.activeElement?.dataset?.game === '${gameId}'`;
    for (const [key, vk] of [['ArrowRight', 39], ['ArrowLeft', 37]]) {
      for (let i = 0; i < 14 && !await chrome.eval(onTarget); i++) {
        await pressKey(key, key, vk);
        await sleep(250);
      }
      if (await chrome.eval(onTarget)) break;
    }
    if (!await chrome.eval(onTarget)) throw new Error(`hall pick ${gameId}: the rail never focused the card`);
    await sleep(400); // the rail's scroll settles
    await mouseClickOn(`[data-ob="play-game"][data-game="${gameId}"]`);
    if (!await pollFor(CONFIRM_UP, 75)) {
      throw new Error(`hall pick ${gameId}: the switch confirm never rose`);
    }
    await mouseClickOn('[data-ob="confirm-accept"]');
    await waitFor(`window.__settings.get().game === '${gameId}'
      && window.__shell.isOpen() === false`, `${gameId} via the hall`);
    // #974: the confirmed switch raises the switch-progress overlay, and main.js's switch shield
    // swallows trusted clicks while html[data-ob-switching] is set. The overlay outlives the
    // shell close by its settle + MIN_SHOWN + leave tail, so wait for its own DOM contract (the
    // e2e-switch SWITCH_IDLE predicate) before the arm's next real click; 175 x 200 ms covers the
    // overlay's 30 s life cap.
    await waitFor(`!document.documentElement.hasAttribute('data-ob-switching')
      && !document.querySelector('[data-ob="switch-progress"]')`, `${gameId}: the switch overlay left`, 175);
  };
  // real clicks on the HUD cue select's kit popover
  const hudPickCue = async (id) => {
    const idx = await chrome.eval(`[...document.getElementById('cue-select').options]
      .findIndex((o) => o.value === '${id}')`);
    if (idx < 0) throw new Error(`HUD cue select has no ${id}`);
    await mouseClickOn('#cue-row [data-ob="select-button"]');
    await waitFor(`!!document.querySelector('[data-ob="select-list"]')`, 'cue popover');
    await chrome.eval(`document.querySelectorAll('[data-ob="select-list"] [data-ob="option"]')[${idx}]
      ?.scrollIntoView({ block: 'nearest' }), true`);
    await sleep(200);
    const p = await chrome.eval(`(() => { const r = document.querySelectorAll(
      '[data-ob="select-list"] [data-ob="option"]')[${idx}]?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    if (!p) throw new Error(`cue popover option ${id} not found`);
    await mouseClick(p.x, p.y);
  };
  await chrome.eval('localStorage.clear()');
  await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=discue` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (discue arm)');
  await sleep(800); // kit upgrades resolve (guarded imports)
  await chrome.eval(STUB_NATIVES);
  await waitFor(d2gShell, 'obshell boot pose (hall at play)');
  await hallPick('snooker');
  await waitFor(`(window.__test.equipment() || {}).table_id === 'wpbsa_snooker_12ft'`, 'snooker rack');
  const g1 = await chrome.eval(`({ sel: window.__settings.get().equipment.cue_id,
    kernel: (window.__test.equipment() || {}).cue_id ?? null })`);
  check('D2g: the hall switch into snooker racks on the selected snooker_ash '
    + '(the template cue equals the selection)',
  g1.sel === 'snooker_ash' && g1.kernel === 'snooker_ash', JSON.stringify(g1));
  await waitFor(`!document.getElementById('shoot').disabled`, 'Shoot enabled (snooker)');
  await mouseClickOn('#shoot');
  await settleD2g('snooker shot 1');
  const r1 = await lastRecord();
  check('D2g: the snooker record pins snooker_ash and the catalog cue params '
    + '(m 0.49, tip_radius 0.00895, end_mass 0.140/30 + 0.002, tip_cor 0.73)',
  r1?.initial?.equipment?.cue_id === 'snooker_ash'
    && sameJson(r1?.options?.cue, cueParams('snooker_ash')),
  JSON.stringify({ cue: r1?.initial?.equipment?.cue_id, opts: r1?.options?.cue }));
  // a link minted now (live stamp) — before the swap: a mid-rack swap
  // poisons the share recorder by design
  const newUrl = await chrome.eval(`(async () => { try { return await __share.encode(); }
    catch (e) { return 'ERR ' + (e?.message ?? e); } })()`);
  const r1Sha = r1 ? eventsSha(r1) : null;
  await hudPickCue('break_phenolic');
  await pollFor(`window.__settings.get().equipment.cue_id === 'break_phenolic'`);
  await sleep(400);
  const g2 = await chrome.eval(`({ sel: window.__settings.get().equipment.cue_id,
    kernel: (window.__test.equipment() || {}).cue_id ?? null,
    hint: document.getElementById('hud-hint')?.textContent ?? '' })`);
  check('D2g: the HUD swap to break_phenolic reaches the live template BEFORE '
    + 'the next shot, and only then shows the next-shot hint',
  g2.sel === 'break_phenolic' && g2.kernel === 'break_phenolic'
    && g2.hint === EN['settings.cueSwapNext'], JSON.stringify(g2));
  await waitFor(`!document.getElementById('shoot').disabled`, 'Shoot enabled (snooker 2)');
  await mouseClickOn('#shoot');
  await settleD2g('snooker shot 2');
  const r2 = await lastRecord();
  check('D2g: the next snooker record pins break_phenolic (tip_cor 0.85)',
    r2?.initial?.equipment?.cue_id === 'break_phenolic' && r2?.options?.cue?.tip_cor === 0.85
    && sameJson(r2?.options?.cue, cueParams('break_phenolic')),
    JSON.stringify({ cue: r2?.initial?.equipment?.cue_id, opts: r2?.options?.cue }));
  // carom through the hall again
  await chrome.eval(`window.__shell.openShell({}); true`);
  await pollFor(`window.__shell.isOpen() === true`, 150);
  await chrome.eval(`window.__shell.go('play'); true`);
  await waitFor(d2gShell, 'hall at play (carom leg)');
  await hallPick('carom_3cushion');
  await waitFor(`(window.__test.equipment() || {}).table_id === 'umb_carom_284'`, 'carom rack');
  for (let d = 0; d < 4; d++) { // the break-spot decision (decision 10)
    const pend = await chrome.eval('window.__rules?.matchState?.()?.pendingDecision?.kind ?? null');
    if (!pend) break;
    await chrome.eval('window.__rules.decide(1)');
    await sleep(300);
  }
  const g3 = await chrome.eval(`({ sel: window.__settings.get().equipment.cue_id,
    kernel: (window.__test.equipment() || {}).cue_id ?? null })`);
  await waitFor(`!document.getElementById('shoot').disabled`, 'Shoot enabled (carom)');
  await mouseClickOn('#shoot');
  await settleD2g('carom shot');
  const r3 = await lastRecord();
  check('D2g: carom racks and strikes on the selected carom_conical '
    + '(template, record and catalog cue params)',
  g3.sel === 'carom_conical' && g3.kernel === 'carom_conical'
    && r3?.initial?.equipment?.cue_id === 'carom_conical'
    && sameJson(r3?.options?.cue, cueParams('carom_conical')),
  JSON.stringify({ g3, cue: r3?.initial?.equipment?.cue_id, opts: r3?.options?.cue }));
  const errsD2g = await chrome.eval('window.__test.errors');
  if (errsD2g.length) fail('app errors (discue arm): ' + errsD2g.join(' | '));
  // pre-fix link: minted on the build-19 app (fixture), struck standard while
  // encoding snooker_ash — the replay must reproduce the sender's events
  const replayD2g = async (hash, arm) => {
    await chrome.eval('localStorage.clear()');
    await chrome.send('Page.navigate', { url: `${APP_URL}&arm=${arm}${hash}` });
    await waitReady();
    let rep = { done: false };
    for (let i = 0; i < 300 * POLL_SCALE && !rep.done; i++) {
      await sleep(400);
      rep = await chrome.eval('window.__share?.replay?.() ?? { done: false }');
    }
    return { rep, rec: await lastRecord() };
  };
  // GH-1195 option B: an old link shows the kernel warning first. Since the registered
  // flip of 0.1.0+206ceb55 (GH-1195), kernelGate refuses this link, so share.js shows its gate banner and starts no
  // replay until View anyway; the pairing law and the sender's bytes are judged after that consent
  const D2G_OLD = D2G_FX.snooker;
  await chrome.eval('localStorage.clear()');
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=discue-old${D2G_OLD.hash}` });
  await waitReady();
  await pollFor(`!!document.getElementById('ob-replay')`, 50);
  const gate = await chrome.eval(`(async () => { const b = document.getElementById('ob-replay');
    return { banner: !!b, view: !!document.getElementById('ob-rp-view-anyway'),
      dismiss: !!document.getElementById('ob-rp-dismiss'),
      status: b?.querySelector('[role="status"]')?.textContent ?? null,
      kernel: (await import(new URL('dist/pool-wasm/pool_wasm.js', document.baseURI).href)).kernel_version(),
      rep: window.__share?.replay?.() ?? null }; })()`);
  check(`D2g: the pre-fix snooker link (${D2G_OLD.kernel_version}, encodes ${D2G_OLD.selected_cue}) meets the `
    + 'kernel gate first: the banner with View anyway and Dismiss, its status naming the link\'s kernel against '
    + 'the build\'s, and nothing replaying before consent',
  gate.banner && gate.view && gate.dismiss && typeof gate.status === 'string'
    && gate.status.includes(D2G_OLD.kernel_version) && gate.status.includes(gate.kernel)
    && gate.kernel !== D2G_OLD.kernel_version && gate.rep?.active === false,
  JSON.stringify(gate));
  // consent: a real click on View anyway runs the replay to its end. A window capture listener armed before the click
  // counts the trusted clicks targeted at the button, so the detail reports the click apart from the button's presence
  let old = { rep: null, rec: null, clicks: null };
  if (gate.view) {
    await chrome.eval(`(() => { window.__d2gClicks = 0; window.addEventListener('click', (e) => {
      if (e.isTrusted && e.target?.closest?.('#ob-rp-view-anyway')) window.__d2gClicks++; }, true); })()`);
    await mouseClickOn('#ob-rp-view-anyway');
    let rep = { done: false };
    for (let i = 0; i < 300 * POLL_SCALE && !rep.done; i++) {
      await sleep(400);
      rep = await chrome.eval('window.__share?.replay?.() ?? { done: false }');
    }
    old = { rep, rec: await lastRecord(), clicks: await chrome.eval('window.__d2gClicks ?? null') };
  }
  check('D2g: View anyway on the pre-fix link replays its one shot to the end',
    old.rep?.done === true && old.rep?.n === 1,
    JSON.stringify({ viewAnywayPresent: gate.view, trustedClicks: old.clicks, rep: old.rep }));
  check(`D2g: the consented replay strikes on the kernel pairing (cue ${D2G_OLD.sender_cue}, no options.cue)`,
    !!old.rec && (old.rec.initial?.equipment?.cue_id ?? 'standard') === D2G_OLD.sender_cue
      && old.rec.options?.cue === undefined,
    JSON.stringify({ cue: old.rec?.initial?.equipment?.cue_id, opts: old.rec?.options?.cue }));
  // a PINNED OBSERVATION, not a contract: event bytes may diverge across a registered kernel flip (the banner says
  // so); measured equal on kernel 0.1.0+15210514, so a later registered flip may re-pin it
  check(`D2g: the consented replay reproduces the sender's event bytes on this kernel (pinned, `
    + `${D2G_OLD.sender_events_sha256.slice(0, 8)})`,
  !!old.rec && eventsSha(old.rec) === D2G_OLD.sender_events_sha256,
  JSON.stringify({ sha: old.rec ? eventsSha(old.rec) : null, want: D2G_OLD.sender_events_sha256 }));
  const fresh = typeof newUrl === 'string' && newUrl.includes('#')
    ? await replayD2g(newUrl.slice(newUrl.indexOf('#')), 'discue-new') : { rep: null, rec: null };
  check('D2g: a link minted now replays on the selected snooker_ash with the '
    + 'original shot\'s event bytes',
  fresh.rep?.done === true && fresh.rec?.initial?.equipment?.cue_id === 'snooker_ash'
    && fresh.rec && eventsSha(fresh.rec) === r1Sha,
  JSON.stringify({ url: typeof newUrl === 'string' ? newUrl.slice(0, 40) : newUrl,
    rep: fresh.rep, cue: fresh.rec?.initial?.equipment?.cue_id }));

  // ---- D2h. Playback restages a discipline session on its RECORDED equipment (GH-1042 review r1) ----
  // A snooker session played on a non-default ballset (the 57.15 mm pool set) and reopened from
  // a 9-ball table: Playback's swapBed re-equips the bed from the record's tag and re-racks
  // quietly (rerackKind). Before the fix that quiet rack kept only the recorded cue and built
  // the snooker set's 26.25 mm balls. The composed tag is what buildBallSet sizes the meshes
  // from (scenario ball params), so the staged tag's ballset is the mesh-radius truth.
  await chrome.eval('localStorage.clear()');
  await chrome.send('Page.navigate', { url: `${APP_URL}&archive=1&arm=disbed` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (disbed arm)');
  await chrome.eval(STUB_NATIVES);
  await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`);
  await waitFor(`(window.__test.equipment() || {}).table_id === 'wpbsa_snooker_12ft'`, 'snooker rack (disbed)');
  await chrome.eval(`__settings.changeEquipment('ballset_id', 'pool_standard', { skipConfirm: true })`);
  const onPoolSet = await pollFor(`(window.__test.equipment() || {}).ballset_id === 'pool_standard'`);
  for (let d = 0; d < 4; d++) {
    const pend = await chrome.eval('window.__rules?.matchState?.()?.pendingDecision?.kind ?? null');
    if (!pend) break;
    await chrome.eval('window.__rules.decide(1)');
    await sleep(300);
  }
  const shotErr = await chrome.eval(`__test.shoot({ v0: 2.0 })`);
  await settleD2g('disbed shot');
  const hRec = await lastRecord();
  await chrome.eval('window.__archive.flush()');
  await sleep(700);
  const hSid = await chrome.eval(`(async () => ((await window.__archive.sessions())
    .find((x) => x.gameId === 'snooker' && x.shots > 0) ?? {}).id ?? null)()`);
  await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await waitFor(`window.__settings.get().game === 'nine_ball' && window.__test.bed().rackKind === 'nine'`, '9-ball bed (disbed)');
  const hOpened = hSid !== null ? await chrome.eval(`window.__playback.openSession(${JSON.stringify(hSid)})`) : false;
  await pollFor(`window.__test.state() === 'PLAYBACK'`, 150);
  const hStaged = await chrome.eval(`({ eq: window.__test.equipment(), bed: window.__test.bed() })`);
  check('D2h: a snooker session on the 57.15 mm pool set reopens from a 9-ball table on its '
    + 'recorded equipment (staged tag ballset pool_standard, record ball r 0.028575)',
  onPoolSet === true && !shotErr && hOpened === true
    && hRec?.initial?.balls?.[0]?.params?.r === 0.028575
    && hStaged.eq?.ballset_id === 'pool_standard' && hStaged.eq?.table_id === 'wpbsa_snooker_12ft'
    && hStaged.bed.rackKind === 'snooker',
  JSON.stringify({ onPoolSet, shotErr, hSid, hOpened, r: hRec?.initial?.balls?.[0]?.params?.r,
    eq: hStaged.eq, rackKind: hStaged.bed.rackKind }));
  await chrome.eval('window.__playback.close()');
  await sleep(600);
  // restore the D-series page state for D3 (fresh default profile)
  await chrome.eval('localStorage.clear()');
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=d3` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (d3 arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);

  // ---- D3. power-response toggle round-trip (issue #142, SC-003 policy) -----
  // Additive visual/input-only key: the REAL assists-section select commits
  // through api.set, the blob persists it, a reload resolves it, the UI
  // reflects it; an unknown persisted value sanitizes LOUD to the
  // perceptual default (the assistWrongBall load-path shape).
  const d3Fresh = await chrome.eval(`({
    resolved: window.__settings.get().powerResponse,
    ui: document.getElementById('ob-set-power-response')?.value ?? null })`);
  check('D3: powerResponse defaults to perceptual (resolved + UI reflect)',
    d3Fresh.resolved === 'perceptual' && d3Fresh.ui === 'perceptual',
    JSON.stringify(d3Fresh));
  await chrome.eval(`(() => {
    const sel = document.getElementById('ob-set-power-response');
    sel.value = 'linear';
    sel.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  const d3Set = await chrome.eval(`({
    resolved: window.__settings.get().powerResponse,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).powerResponse })`);
  check('D3: select change commits + persists linear',
    d3Set.resolved === 'linear' && d3Set.raw === 'linear',
    JSON.stringify(d3Set));
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=power` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (power arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d3Back = await chrome.eval(`({
    resolved: window.__settings.get().powerResponse,
    ui: document.getElementById('ob-set-power-response')?.value ?? null })`);
  check('D3: reload round-trips the persisted linear choice (UI reflects)',
    d3Back.resolved === 'linear' && d3Back.ui === 'linear',
    JSON.stringify(d3Back));
  // unknown persisted value → loud sanitation to the default
  await chrome.eval(`(() => {
    const blob = JSON.parse(localStorage.getItem('ob-settings-v1'));
    blob.powerResponse = 'exponential';
    localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=power2` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (power sanitation arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d3San = await chrome.eval(`({
    resolved: window.__settings.get().powerResponse,
    ui: document.getElementById('ob-set-power-response')?.value ?? null,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).powerResponse })`);
  check('D3: unknown persisted value sanitizes loud to perceptual '
    + '(boot re-persist heals the blob)',
  d3San.resolved === 'perceptual' && d3San.ui === 'perceptual'
    && d3San.raw === 'perceptual', JSON.stringify(d3San));
  const errsD3 = await chrome.eval('window.__test.errors');
  if (errsD3.length) fail('app errors (power arm): ' + errsD3.join(' | '));

  // ---- D4. cloth-color round-trip (issue GH-229, SC-003 policy) --------------
  // RE-CUT (feature 032): the chip STRIP migrated to the atelier's cloth
  // station (chip DOM/click/caption laws live in e2e-atelier arm D); what
  // stays HERE is the settings-machinery half — the additive visual-only
  // key's api semantics, scene apply seam, persistence round-trip, the
  // ?clothcolor= boot override, and loud sanitation.
  const d4Fresh = await chrome.eval(`window.__settings.get().clothColor`);
  check("D4: clothColor defaults to '' (the factory identity default)",
    d4Fresh === '', JSON.stringify(d4Fresh));
  const d4Pick = await chrome.eval(`(async () => {
    window.__settings.set('clothColor', 'steel_gray');
    await new Promise((r) => setTimeout(r, 500));
    const t = await import('/scene/table.js');
    return {
      resolved: window.__settings.get().clothColor,
      raw: JSON.parse(localStorage.getItem('ob-settings-v1')).clothColor,
      applied: t.appliedClothVisual?.()?.color ?? null,
    };
  })()`);
  check('D4: steel_gray commit persists + re-tints the scene cloth '
    + '(0x494c4e) through the live seam',
  d4Pick.resolved === 'steel_gray' && d4Pick.raw === 'steel_gray'
    && d4Pick.applied === 0x494c4e, JSON.stringify(d4Pick));
  // named id == advertised id, ALWAYS (review P2): the scripted pin's
  // factory cloth IS classic_green and the commit STILL writes the id —
  // the '' identity default is its own path
  const d4Named = await chrome.eval(`(async () => {
    window.__settings.set('clothColor', 'classic_green');
    await new Promise((r) => setTimeout(r, 500));
    const t = await import('/scene/table.js');
    return {
      resolved: window.__settings.get().clothColor,
      raw: JSON.parse(localStorage.getItem('ob-settings-v1')).clothColor,
      applied: t.appliedClothVisual?.()?.color ?? null,
    };
  })()`);
  check('D4: classic_green commits its ADVERTISED id (curated twin paints '
    + "the same 0x054046) — no '' aliasing",
  d4Named.resolved === 'classic_green' && d4Named.raw === 'classic_green'
    && d4Named.applied === 0x054046, JSON.stringify(d4Named));
  const d4Factory = await chrome.eval(`(async () => {
    window.__settings.set('clothColor', '');
    await new Promise((r) => setTimeout(r, 500));
    const t = await import('/scene/table.js');
    return {
      resolved: window.__settings.get().clothColor,
      raw: JSON.parse(localStorage.getItem('ob-settings-v1')).clothColor,
      applied: t.appliedClothVisual?.()?.color ?? null,
    };
  })()`);
  check("D4: the '' identity default restores the factory 0x054046",
    d4Factory.resolved === '' && d4Factory.raw === ''
    && d4Factory.applied === 0x054046, JSON.stringify(d4Factory));
  // persistence round-trip: commit burgundy, reload — the PANEL resolves
  // the persisted id while the SCENE pins '' factory on this scripted boot
  // (the committed-capture law; user boots apply it via the same
  // resolveBootClothColor persisted branch)
  await chrome.eval(`window.__settings.set('clothColor', 'burgundy')`);
  await sleep(200);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=cloth` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (cloth arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d4Back = await chrome.eval(`(async () => {
    const t = await import('/scene/table.js');
    return {
      resolved: window.__settings.get().clothColor,
      sceneColor: t.clothColorId?.() ?? null,
      applied: t.appliedClothVisual?.()?.color ?? null,
    };
  })()`);
  check('D4: reload round-trips the persisted burgundy in the store while '
    + 'the SCRIPTED boot pins the scene to \'\' factory (capture law)',
  d4Back.resolved === 'burgundy'
    && d4Back.sceneColor === '' && d4Back.applied === 0x054046,
  JSON.stringify(d4Back));
  // explicit ?clothcolor= override proves the boot-apply path end-to-end
  // (the ?look= convention: same resolveBootClothColor branch the persisted
  // key takes on a real-user boot)
  await chrome.send('Page.navigate',
    { url: `${APP_URL}&clothcolor=burgundy&arm=cloth2` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (cloth boot-override arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d4Boot = await chrome.eval(`(async () => {
    const t = await import('/scene/table.js');
    return { sceneColor: t.clothColorId?.() ?? null,
      applied: t.appliedClothVisual?.()?.color ?? null };
  })()`);
  check('D4: explicit ?clothcolor=burgundy applies at BOOT '
    + '(scene painted 0x590b1d before first frame)',
  d4Boot.sceneColor === 'burgundy' && d4Boot.applied === 0x590b1d,
  JSON.stringify(d4Boot));
  // unknown persisted id → loud sanitation to the '' default (D3 shape)
  await chrome.eval(`(() => {
    const blob = JSON.parse(localStorage.getItem('ob-settings-v1'));
    blob.clothColor = 'neon_pink';
    localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=cloth3` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (cloth sanitation arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d4San = await chrome.eval(`({
    resolved: window.__settings.get().clothColor,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).clothColor })`);
  check('D4: unknown persisted clothColor sanitizes loud to \'\' '
    + '(boot re-persist heals the blob)',
  d4San.resolved === '' && d4San.raw === '', JSON.stringify(d4San));
  // leave the suite's shared state color-free for the arms below
  await chrome.eval(`window.__settings.set('clothColor', '')`);
  const errsD4 = await chrome.eval('window.__test.errors');
  if (errsD4.length) fail('app errors (cloth arm): ' + errsD4.join(' | '));

  // ---- D5. assist-line contrast round-trip (issue GH-417, SC-003 policy) ----
  // Additive assist-class key over the previewink.js solve target: defaults
  // to 'standard' (the shipped GH-260 profile — the default-unchanged law),
  // the REAL assists-section select commits through api.set (non-re-racking
  // GH-121 class — the D3 shape), the blob persists it, the
  // 'ob.settings.assistContrast' MIRROR key follows (previewink.js
  // boot-reads it — the RECORDED mirror-key extension, see WANT_KEYS), the
  // panel commit broadcasts key 'assistContrast' (previewink's live
  // re-solve wire), a reload resolves it, and an unknown persisted value
  // sanitizes LOUD to the default. The adaptive solver itself is inert on
  // this scripted boot (previewink scripted pin) — its measured per-level
  // behavior is e2e-aim's GH-417 arm.
  const d5Fresh = await chrome.eval(`({
    resolved: window.__settings.get().assistContrast,
    ui: document.getElementById('ob-set-assist-contrast')?.value ?? null,
    opts: [...(document.getElementById('ob-set-assist-contrast')?.options
      ?? [])].map((o) => o.value).join(',') })`);
  check('D5: assistContrast defaults to standard (resolved + UI reflect, '
    + 'four stepped levels listed)',
  d5Fresh.resolved === 'standard' && d5Fresh.ui === 'standard'
    && d5Fresh.opts === 'low,standard,high,maximum', JSON.stringify(d5Fresh));
  await chrome.eval(`(() => {
    window.__d5cast = null;
    window.addEventListener('ob:settings', (e) => {
      if (e.detail?.key === 'assistContrast') window.__d5cast = e.detail.value;
    }, { once: true });
    const sel = document.getElementById('ob-set-assist-contrast');
    sel.value = 'high';
    sel.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  const d5Set = await chrome.eval(`({
    resolved: window.__settings.get().assistContrast,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).assistContrast,
    mirror: localStorage.getItem('ob.settings.assistContrast'),
    cast: window.__d5cast })`);
  check('D5: select change commits + persists high + mirror key follows '
    + '+ ob:settings broadcast carries the key (api.set — the GH-121 '
    + 'non-re-racking class, never a rerack/close path)',
  d5Set.resolved === 'high' && d5Set.raw === 'high'
    && d5Set.mirror === 'high' && d5Set.cast === 'high',
  JSON.stringify(d5Set));
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=contrast` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (contrast arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d5Back = await chrome.eval(`({
    resolved: window.__settings.get().assistContrast,
    ui: document.getElementById('ob-set-assist-contrast')?.value ?? null,
    mirror: localStorage.getItem('ob.settings.assistContrast') })`);
  check('D5: reload round-trips the persisted high choice (UI + mirror '
    + 'reflect)',
  d5Back.resolved === 'high' && d5Back.ui === 'high'
    && d5Back.mirror === 'high', JSON.stringify(d5Back));
  // unknown persisted value → loud sanitation to the default (D3 shape)
  await chrome.eval(`(() => {
    const blob = JSON.parse(localStorage.getItem('ob-settings-v1'));
    blob.assistContrast = 'ultra';
    localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=contrast2` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (contrast sanitation arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d5San = await chrome.eval(`({
    resolved: window.__settings.get().assistContrast,
    ui: document.getElementById('ob-set-assist-contrast')?.value ?? null,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).assistContrast,
    mirror: localStorage.getItem('ob.settings.assistContrast') })`);
  check('D5: unknown persisted value sanitizes loud to standard '
    + '(boot re-persist heals blob + mirror)',
  d5San.resolved === 'standard' && d5San.ui === 'standard'
    && d5San.raw === 'standard' && d5San.mirror === 'standard',
  JSON.stringify(d5San));
  // restore the default for the arms below
  await chrome.eval(`window.__settings.set('assistContrast', 'standard')`);
  const errsD5 = await chrome.eval('window.__test.errors');
  if (errsD5.length) fail('app errors (contrast arm): ' + errsD5.join(' | '));

  // ---- D6. GH-441 default-camera register (Display; live since build 18) ----
  // The 'camera' key stops lying: the REAL Display select commits through
  // api.set (non-re-racking GH-121 class), the flip applies LIVE through
  // the window.__camhome seam (the flip doubles as 'return home'),
  // 'overhead' poses the DERIVED top-down register (camerapresets.js
  // overheadRegister: phi at the preset polar floor 0.16, target origin,
  // tight fov, radius fit from the ACTIVE bed + viewport aspect), every
  // fresh rack returns home with per-discipline re-derivation
  // (pool/snooker/carom), 'orbit' keeps the pre-441 never-touch-the-camera
  // behavior byte-identically, and both write paths sanitize unknown
  // values loud to 'orbit'. Boot-time application is e2e-userboot arm-10
  // territory (real-user boots apply; scripted boots pin orbit).
  const D6_POSE = `(() => { const s = window.__dbg.orbit.state; return {
    phi: +s.phi.toFixed(6), theta: +s.theta.toFixed(6),
    radius: +s.radius.toFixed(6), target: s.target.toArray(),
    fov: +window.__dbg.camera.fov.toFixed(4) }; })()`;
  const D6_FIT = `(() => {
    const cam = window.__dbg.camera;
    const L = __test.bed().tableLength, W = __test.bed().tableWidth;
    const xf = (e, v) => [
      e[0]*v[0] + e[4]*v[1] + e[8]*v[2] + e[12]*v[3],
      e[1]*v[0] + e[5]*v[1] + e[9]*v[2] + e[13]*v[3],
      e[2]*v[0] + e[6]*v[1] + e[10]*v[2] + e[14]*v[3],
      e[3]*v[0] + e[7]*v[1] + e[11]*v[2] + e[15]*v[3]];
    const proj = cam.projectionMatrix.elements;
    const view = cam.matrixWorldInverse.elements;
    let maxA = 0, clip = false;
    for (const p of [[L/2, 0, W/2], [L/2, 0, -W/2],
      [-L/2, 0, W/2], [-L/2, 0, -W/2]]) {
      const h = xf(proj, xf(view, [p[0], p[1], p[2], 1]));
      const nx = h[0] / h[3], ny = h[1] / h[3];
      maxA = Math.max(maxA, Math.abs(nx), Math.abs(ny));
      if (Math.abs(nx) > 0.97 || Math.abs(ny) > 0.97) clip = true;
    }
    return { maxA: +maxA.toFixed(3), clip }; })()`;
  const d6Fresh = await chrome.eval(`({
    resolved: window.__settings.get().camera,
    ui: document.getElementById('ob-set-camera')?.value ?? null,
    opts: [...(document.getElementById('ob-set-camera')?.options ?? [])]
      .map((o) => o.value).join(','),
    pose: ${D6_POSE} })`);
  check('D6: camera defaults to orbit (resolved + UI reflect, two modes '
    + 'listed) and the scripted boot pose is the untouched orbit rig',
  d6Fresh.resolved === 'orbit' && d6Fresh.ui === 'orbit'
    && d6Fresh.opts === 'orbit,overhead' && d6Fresh.pose.phi === 1.05
    && d6Fresh.pose.theta === -0.9 && d6Fresh.pose.radius === 2.7
    && d6Fresh.pose.fov === 40, JSON.stringify(d6Fresh));
  await chrome.eval(`(() => {
    window.__d6cast = null;
    window.addEventListener('ob:settings', (e) => {
      if (e.detail?.key === 'camera') window.__d6cast = e.detail.value;
    }, { once: true });
    const sel = document.getElementById('ob-set-camera');
    sel.value = 'overhead';
    sel.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  const d6Over = await chrome.eval(`({
    pose: ${D6_POSE}, fit: ${D6_FIT}, cast: window.__d6cast,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).camera })`);
  check('D6: select change applies the overhead register LIVE (phi 0.16, '
    + 'theta 0, target origin, tight fov, bed fits) + persists + '
    + 'broadcasts the key',
  Math.abs(d6Over.pose.phi - 0.16) < 1e-6 && d6Over.pose.theta === 0
    && d6Over.pose.target.every((v) => v === 0) && d6Over.pose.fov < 39
    && d6Over.pose.fov > 5 && !d6Over.fit.clip && d6Over.fit.maxA >= 0.6
    && d6Over.cast === 'overhead' && d6Over.raw === 'overhead',
  JSON.stringify(d6Over));
  // return home: orbit away by hand, then a fresh rack re-poses the
  // register (setState AIM+seed — the fresh-table signal; overhead only)
  const d6Away = await chrome.eval(`(() => { const o = window.__dbg.orbit;
    o.state.phi = 1.2; o.state.theta = 2.2; o.state.radius = 3.1;
    o.state.target.set(0.4, 0.05, 0.2); o.apply(); return ${D6_POSE}; })()`);
  await chrome.eval(`__test.rerack(7)`);
  await sleep(300);
  const d6Home = await chrome.eval(`(${D6_POSE})`);
  check('D6: a fresh rack returns home to the SAME derived register '
    + '(orbit-away pose abandoned)',
  Math.abs(d6Away.phi - 1.2) < 1e-6
    && JSON.stringify(d6Home) === JSON.stringify(d6Over.pose),
  JSON.stringify({ d6Away, d6Home, want: d6Over.pose }));
  // per-discipline re-derivation: the register follows the ACTIVE bed —
  // snooker (3.569 m) frames wider than carom (2.84) frames wider than
  // pool (2.54); each discipline's bed fits with the one margin law
  await chrome.eval(
    `window.__settings.changeGame('snooker', { skipConfirm: true })`);
  await sleep(400);
  const d6Snk = await chrome.eval(`({ pose: ${D6_POSE}, fit: ${D6_FIT} })`);
  await chrome.eval(
    `window.__settings.changeGame('carom_3cushion', { skipConfirm: true })`);
  await sleep(400);
  const d6Car = await chrome.eval(`({ pose: ${D6_POSE}, fit: ${D6_FIT} })`);
  await chrome.eval(
    `window.__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await sleep(400);
  const d6Pool = await chrome.eval(`({ pose: ${D6_POSE}, fit: ${D6_FIT} })`);
  check('D6: discipline switches re-derive the register (phi/theta hold; '
    + 'radius monotone with bed length; every bed fits, no clipping)',
  [d6Snk, d6Car, d6Pool].every((d) => Math.abs(d.pose.phi - 0.16) < 1e-6
      && d.pose.theta === 0 && !d.fit.clip && d.fit.maxA >= 0.6)
    && d6Snk.pose.radius > d6Car.pose.radius
    && d6Car.pose.radius > d6Pool.pose.radius,
  JSON.stringify({ snooker: d6Snk, carom: d6Car, pool: d6Pool }));
  // flip back to orbit: the flip is 'return home' for the classic pose too
  // (the 'default' preset — on the pool table byte-equal to the boot rig)
  await chrome.eval(`(() => {
    const sel = document.getElementById('ob-set-camera');
    sel.value = 'orbit';
    sel.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  const d6Orbit = await chrome.eval(`(${D6_POSE})`);
  check('D6: flipping back to orbit re-homes the classic pose (boot rig '
    + 'byte-equal on the pool table, fov 40 restored)',
  d6Orbit.phi === 1.05 && d6Orbit.theta === -0.9 && d6Orbit.radius === 2.7
    && d6Orbit.fov === 40 && d6Orbit.target[1] === 0.05,
  JSON.stringify(d6Orbit));
  // orbit mode keeps the pre-441 law: a fresh rack never touches the rig
  const d6Away2 = await chrome.eval(`(() => { const o = window.__dbg.orbit;
    o.state.phi = 0.9; o.state.theta = 1.7; o.state.radius = 4.0;
    o.apply(); return ${D6_POSE}; })()`);
  await chrome.eval(`__test.rerack(9)`);
  await sleep(300);
  const d6Stay = await chrome.eval(`(${D6_POSE})`);
  check('D6: in orbit mode a fresh rack leaves the camera alone '
    + '(pre-441 behavior byte-identical)',
  JSON.stringify(d6Stay) === JSON.stringify(d6Away2),
  JSON.stringify({ d6Away2, d6Stay }));
  // mixed-cache degrade gate (review r1 P2): without THIS deploy's aim.js
  // fov-chase capability the overhead register must be the pre-441
  // dead-control NO-OP (a stale chase would hold the tight fov through
  // every aim view) — flip with the marker removed, assert nothing moved
  const d6Degrade = await chrome.eval(`(() => {
    const saved = window.__aim.fovChase;
    delete window.__aim.fovChase;
    const before = ${D6_POSE};
    window.__settings.set('camera', 'overhead');
    const after = ${D6_POSE};
    const persisted = JSON.parse(localStorage.getItem('ob-settings-v1')).camera;
    window.__aim.fovChase = saved;
    window.__settings.set('camera', 'orbit');
    return { before, after, persisted };
  })()`);
  check('D6: a stale-aim.js graph degrades the overhead flip to the '
    + 'pre-441 no-op (pose untouched; the choice still persists)',
  JSON.stringify(d6Degrade.before) === JSON.stringify(d6Degrade.after)
    && d6Degrade.persisted === 'overhead',
  JSON.stringify(d6Degrade));
  await sleep(300);
  // write-path sanitation (the clothColor law): unknown value lands on
  // orbit, never persists junk
  const d6San = await chrome.eval(`(window.__settings.set('camera',
    'fisheye'), { resolved: window.__settings.get().camera,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).camera })`);
  check('D6: programmatic unknown value sanitizes loud to orbit on the '
    + 'write path', d6San.resolved === 'orbit' && d6San.raw === 'orbit',
  JSON.stringify(d6San));
  // load-path sanitation: a stale persisted string (the key was
  // persisted-but-dead for a year of builds) boots as orbit and heals
  await chrome.eval(`(() => {
    const blob = JSON.parse(localStorage.getItem('ob-settings-v1'));
    blob.camera = 'isometric';
    localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
  })()`);
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=cam2` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (camera sanitation arm)');
  await sleep(600);
  await chrome.eval(STUB_NATIVES);
  const d6San2 = await chrome.eval(`({
    resolved: window.__settings.get().camera,
    ui: document.getElementById('ob-set-camera')?.value ?? null,
    raw: JSON.parse(localStorage.getItem('ob-settings-v1')).camera })`);
  check('D6: unknown persisted value sanitizes loud to orbit '
    + '(boot re-persist heals the blob)',
  d6San2.resolved === 'orbit' && d6San2.ui === 'orbit'
    && d6San2.raw === 'orbit', JSON.stringify(d6San2));
  const errsD6 = await chrome.eval('window.__test.errors');
  if (errsD6.length) fail('app errors (camera arm): ' + errsD6.join(' | '));

  // ---- E. reduced-motion arm (SC-007) ---------------------------------------
  await chrome.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=rm` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (rm arm)');
  await sleep(800);
  await chrome.eval(STUB_NATIVES);
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(150); // reduced motion: enter is instant
  const rmOpen = await chrome.eval(
    `document.getElementById('ob-settings').getClientRects().length > 0`);
  await chrome.eval(`document.getElementById('ob-settings-close').click()`);
  await sleep(150);
  const rmClosed = await chrome.eval(`({
    gone: document.getElementById('ob-settings').getClientRects().length === 0,
    backdrops: document.querySelectorAll('.ob-backdrop').length })`);
  check('SC-007: reduced-motion open/close instant, zero residue',
    rmOpen === true && rmClosed.gone && rmClosed.backdrops === 0,
    JSON.stringify({ rmOpen, ...rmClosed }));
  await chrome.send('Emulation.setEmulatedMedia', { features: [] });

  // ---- F. phone-sheet arm (SC-005) ------------------------------------------
  for (const [w, h] of [[844, 390], [667, 375]]) {
    await setPhoneMetrics(chrome, { width: w, height: h });
    await chrome.send('Page.navigate', { url: `${APP_URL}&arm=phone${w}` });
    await waitReady();
    await waitFor(`document.documentElement.classList.contains('ob-touch')`,
      `touch leaf (phone ${w}x${h})`);
    await waitFor(SHELL_UP, `settings shell (phone ${w}x${h})`);
    await sleep(500); // touch restyle settles on the mounted shell
    await chrome.eval(STUB_NATIVES);
    const touch = await chrome.eval(
      `document.documentElement.classList.contains('ob-touch')`);
    check(`phone ${w}x${h}: touch mode installed`, touch === true);
    await chrome.eval(`document.getElementById('ob-gear').click()`);
    // enter motion (transform y-offset) rides page rAF — poll until the
    // sheet's rect actually covers the viewport before taking geometry
    await pollFor(`(() => {
      const el = document.getElementById('ob-settings');
      if (!el || !el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      return r.left <= 1 && r.top <= 1
        && r.right >= innerWidth - 1 && r.bottom >= innerHeight - 1;
    })()`);
    const sheet = await chrome.eval(`(() => {
      const el = document.getElementById('ob-settings');
      const r = el.getBoundingClientRect();
      const tabs = document.getElementById('ob-settings-tabs');
      const pills = [...(tabs?.querySelectorAll('.ob-set-nav') ?? [])];
      const close = document.getElementById('ob-settings-close')
        ?.getBoundingClientRect();
      const actions = document.getElementById('ob-settings-actions');
      return {
        fullscreen: r.left <= 1 && r.top <= 1
          && r.right >= innerWidth - 1 && r.bottom >= innerHeight - 1,
        pills: pills.length,
        pillFloor: pills.every((b) => {
          const pr = b.getBoundingClientRect();
          return Math.min(pr.width, pr.height) >= 43.5;
        }),
        oneRow: pills.every((b) => Math.abs(b.getBoundingClientRect().top
          - pills[0].getBoundingClientRect().top) < 2),
        tabsPan: tabs ? getComputedStyle(tabs).touchAction : null,
        bodyPan: getComputedStyle(
          document.getElementById('ob-settings-body')).touchAction,
        closeFloor: !!close && close.width >= 43.5 && close.height >= 43.5,
        // GH-668 S5 slice 2 (B-SH01): the rows are intrinsic kit pills in
        // the kit .ob-navmodal__bar (no .ob-touch-row register there)
        actionsRows: actions
          ? actions.querySelectorAll('#ob-touch-drawer-rows > .ob-btn').length : -1,
      };
    })()`);
    // 034: FOUR pills since the game migration (032 took equipment; the
    // sanctioned re-cut)
    check(`phone ${w}x${h}: FULL-SCREEN sheet + 4-pill pan-x strip (single `
      + `row, >=44pt) + pan-y body + 44pt close`,
    sheet.fullscreen && sheet.pills === 4 && sheet.pillFloor && sheet.oneRow
      && sheet.tabsPan === 'pan-x' && sheet.bodyPan === 'pan-y'
      && sheet.closeFloor, JSON.stringify(sheet));
    // GH-225 Phase D: the row set is EXACTLY [Share, Re-rack] — the Export
    // and Record rows are retired (030 the design charter DVR amendment clause 4).
    // Pinned to 2 rather than the old `>= 1` so a resurrected ghost row (or
    // a silently-dropped surviving one) fails here instead of passing.
    check(`phone ${w}x${h}: #ob-settings-actions carries the Share + Re-rack rows`,
      sheet.actionsRows === 2, `rows=${sheet.actionsRows}`);
    // grid-blowout gate (#81 QA finding 1 — the gap that hid it): the six
    // nowrap tab pills' min-content (~679px) used to propagate through the
    // rail into the navmodal 1-column grid track, so every <679px coarse
    // viewport (this suite's own 667x375 F-arm included) laid rail/head/
    // body out at 678.766px with NO horizontal pan — controls clipped to
    // slivers, LANGUAGE/ABOUT pills unreachable, close over DISPLAY. The
    // sheet.fullscreen probe above never saw it (the MODAL was 100vw; the
    // grid inside overflowed). Assert the track resolves to the viewport,
    // the body pane has no horizontal overflow, every tab pill is
    // reachable (pannable into view + hit-testable, not occluded by the
    // close circle), and every section's visible controls lay out inside
    // the viewport.
    const layout = await chrome.eval(`(async () => {
      const grid = document.querySelector('#ob-settings .ob-navmodal__grid');
      const body = document.getElementById('ob-settings-body');
      const out = {
        track: grid
          ? Math.round(parseFloat(getComputedStyle(grid).gridTemplateColumns))
          : -1,
        bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
        tabs: {}, sections: {},
      };
      for (const id of ${JSON.stringify(SECTION_IDS)}) {
        const pill = document.querySelector(
          '#ob-settings-tabs .ob-set-nav[data-section="' + id + '"]');
        if (!pill) { out.tabs[id] = { missing: true }; continue; }
        pill.scrollIntoView({ inline: 'center', block: 'nearest',
          behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 60));
        const pr = pill.getBoundingClientRect();
        const hit = document.elementFromPoint(
          pr.left + pr.width / 2, pr.top + pr.height / 2);
        out.tabs[id] = {
          inView: pr.width > 0 && pr.left >= -1 && pr.right <= innerWidth + 1,
          hit: hit === pill || pill.contains(hit),
        };
        pill.click();
        await new Promise((r) => setTimeout(r, 120));
        const sec = document.querySelector(
          '#ob-settings section[data-section="' + id + '"]');
        const bad = [];
        let controls = 0;
        for (const c of sec.querySelectorAll(
          'select, input, button, summary, a, [data-ob="select-button"]')) {
          if (!c.getClientRects().length) continue;
          const r = c.getBoundingClientRect();
          controls++;
          if (r.left < -1 || r.right > innerWidth + 1) {
            bad.push((c.id || c.className || c.tagName)
              + '@' + Math.round(r.left) + '..' + Math.round(r.right));
          }
        }
        out.sections[id] = {
          active: window.__settings.activeSection() === id, controls, bad };
      }
      return out;
    })()`);
    check(`phone ${w}x${h}: grid track resolves to the viewport, no body `
      + `h-overflow (no min-content blowout)`,
    layout.track > 0 && layout.track <= w + 1
      && layout.bodyOverflow >= 0 && layout.bodyOverflow <= 1,
    JSON.stringify({ track: layout.track, bodyOverflow: layout.bodyOverflow }));
    check(`phone ${w}x${h}: all FOUR tab pills reachable + hit-testable`,
      SECTION_IDS.every((id) => layout.tabs[id]?.inView && layout.tabs[id]?.hit),
      JSON.stringify(layout.tabs));
    for (const id of SECTION_IDS) {
      const s = layout.sections[id] ?? {};
      check(`phone ${w}x${h}: section '${id}' activates via its pill and `
        + `every visible control lays out inside the viewport`,
      s.active === true && s.controls > 0 && (s.bad ?? ['-']).length === 0,
      JSON.stringify(s));
    }
    // ---- F-AX (GH-668 S5 slice 2, review r1 P2): the pane HEADING stays in
    // the ACCESSIBILITY TREE on the coarse sheet. The kit takes the <h2>
    // out of the paint (.ob-navmodal__pane-title = sr-only) and the head
    // row collapses when the section has no hint — but the wrapper is never
    // display:none: read through CDP Accessibility (the computed tree, not
    // the DOM) that #ob-settings-pane holds EXACTLY ONE non-ignored heading
    // per section, named the pane title and backed by our h2, while the
    // empty hint paints no band (0 px head, no dashed edge). Red on
    // a4fc33a9: settings-modal.css hid #ob-settings-head outright and the
    // sheet had no heading at all.
    await chrome.send('Accessibility.enable').catch(() => {});
    for (const id of SECTION_IDS) {
      await chrome.eval(`document.querySelector(
        '#ob-settings-tabs .ob-set-nav[data-section="${id}"]')?.click()`);
      await sleep(200);
      const dom = await chrome.eval(`(() => {
        const h = document.getElementById('ob-settings-section-title');
        const hint = document.getElementById('ob-settings-section-hint');
        const head = document.getElementById('ob-settings-head');
        const vis = (el) => !!el && !!el.getClientRects().length
          && getComputedStyle(el).visibility !== 'hidden'
          && el.getBoundingClientRect().height > 0.5;
        return { active: window.__settings.activeSection(),
          title: (h?.textContent ?? '').trim(),
          hDisplay: h ? getComputedStyle(h).display : null,
          hintText: (hint?.textContent ?? '').trim(), hintVisible: vis(hint),
          headH: head ? head.getBoundingClientRect().height : null,
          headBorder: head ? getComputedStyle(head).borderBottomWidth : null,
          headDisplay: head ? getComputedStyle(head).display : null };
      })()`);
      let ax = { headings: [], ours: null, err: null };
      try {
        const doc = await chrome.send('DOM.getDocument', { depth: 0 });
        const pane = await chrome.send('DOM.querySelector',
          { nodeId: doc.root.nodeId, selector: '#ob-settings-pane' });
        const h2 = await chrome.send('DOM.querySelector',
          { nodeId: doc.root.nodeId, selector: '#ob-settings-section-title' });
        const paneBe = (await chrome.send('DOM.describeNode', { nodeId: pane.nodeId })).node.backendNodeId;
        const h2Be = (await chrome.send('DOM.describeNode', { nodeId: h2.nodeId })).node.backendNodeId;
        const q = await chrome.send('Accessibility.queryAXTree',
          { backendNodeId: paneBe, role: 'heading' });
        ax.headings = (q.nodes ?? []).filter((n) => !n.ignored).map((n) => ({
          name: n.name?.value ?? null, be: n.backendDOMNodeId,
          level: (n.properties ?? []).find((p) => p.name === 'level')?.value?.value ?? null }));
        ax.ours = ax.headings.find((n) => n.be === h2Be) ?? null;
      } catch (e) { ax.err = String(e && e.message || e); }
      const one = ax.headings.length === 1 && !!ax.ours && ax.ours.name === dom.title && dom.title.length > 0;
      check(`phone ${w}x${h}: section '${id}' — exactly ONE accessible heading `
        + `in the pane, named the pane title, backed by #ob-settings-section-title`,
      dom.active === id && one, JSON.stringify({ dom, ax }));
      const band = dom.hintText === ''
        ? (!dom.hintVisible && dom.headDisplay !== 'none' && dom.headH !== null
          && dom.headH < 0.5 && dom.headBorder === '0px')
        : (dom.hintVisible && dom.headH > 0.5);
      check(`phone ${w}x${h}: section '${id}' — no empty hint band `
        + `(head collapsed, never display:none; a hint that exists paints)`,
      band, JSON.stringify(dom));
    }
    await chrome.eval(`document.querySelector(
      '#ob-settings-tabs .ob-set-nav[data-section="display"]')?.click()`); // #170 guard
    await sleep(200);
    const tabbed = await chrome.eval(`window.__settings.activeSection()`);
    check(`phone ${w}x${h}: tab pill switches the section`,
      tabbed === 'display', JSON.stringify(tabbed));
    await chrome.eval(`document.getElementById('ob-settings-close').click()`);
    check(`phone ${w}x${h}: sheet closes`, await pollFor(SHELL_GONE));
    const natFone = await chrome.eval('window.__nativeCalls');
    check(`phone ${w}x${h}: zero native dialogs`,
      natFone.confirm === 0 && natFone.alert === 0, JSON.stringify(natFone));
  }
  // ---- F-T. GH-700 (S4 journey QA round 2): the TABLET register ----------
  // A coarse register >= 1024 logical px (iPad landscape 1024x768 / 1180x820
  // / 1366x1024, DPR 2) is phone-hud.md §6's "tablet landscape — phone rules
  // relax by media query": Settings mounts the DESKTOP modal register (the
  // kit's min(880px, 92vw) x min(620px, 86vh) centred panel with its 208px
  // rail), never the phone's 100vw/100dvh sheet. Red on a0798726: the sheet
  // at 0,0 1180x820, rows 1180px wide, label 620px from its control.
  for (const [w, h] of [[1024, 768], [1180, 820], [1366, 1024]]) {
    await setPhoneMetrics(chrome, { width: w, height: h, deviceScaleFactor: 2 });
    await chrome.send('Page.navigate', { url: `${APP_URL}&arm=tablet${w}` });
    await waitReady();
    await waitFor(`document.documentElement.classList.contains('ob-touch')`,
      `touch leaf (tablet ${w}x${h})`);
    await waitFor(SHELL_UP, `settings shell (tablet ${w}x${h})`);
    await sleep(500);
    await chrome.eval(STUB_NATIVES);
    const reg = await chrome.eval(`({ coarse: matchMedia('(pointer: coarse)').matches,
      tablet: matchMedia('(pointer: coarse) and (min-width: 1024px)').matches, w: innerWidth, h: innerHeight })`);
    check(`tablet ${w}x${h}: coarse >= 1024 register in force`,
      reg.coarse && reg.tablet && reg.w === w && reg.h === h, JSON.stringify(reg));
    await chrome.eval(`document.getElementById('ob-gear').click()`);
    await pollFor(`(() => { const el = document.getElementById('ob-settings');
      return !!el && el.getClientRects().length > 0 && getComputedStyle(el).opacity === '1'; })()`);
    await sleep(300); // enter motion settles
    const modal = await chrome.eval(`(() => {
      const el = document.getElementById('ob-settings');
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      const nav = document.getElementById('ob-settings-nav');
      const nr = nav?.getBoundingClientRect();
      const grid = el.querySelector('.ob-navmodal__grid');
      const actions = document.getElementById('ob-settings-actions');
      const rows = [...el.querySelectorAll('#ob-settings-body .ob-set-row')]
        .filter((row) => row.getClientRects().length).map((row) => {
          const lab = row.firstElementChild; const ctl = row.querySelector('.ob-set-ctl');
          if (!lab || !ctl || lab === ctl) return null;
          return Math.round(ctl.getBoundingClientRect().left - lab.getBoundingClientRect().left);
        }).filter((v) => v !== null);
      const pills = [...document.querySelectorAll('#ob-settings-tabs .ob-set-nav')];
      return { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top),
        centred: Math.abs((r.left + r.right) / 2 - innerWidth / 2) <= 1,
        radius: parseFloat(cs.borderTopLeftRadius), border: parseFloat(cs.borderTopWidth),
        navShown: !!nav && getComputedStyle(nav).display !== 'none' && nr.width > 0 && nr.height > 0,
        tracks: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        actionsHidden: !actions || getComputedStyle(actions).display === 'none',
        rows: rows.length, spanMax: rows.length ? Math.max(...rows) : null,
        pillFloor: pills.length > 0 && pills.every((b) => b.getBoundingClientRect().height >= 43.5) };
    })()`);
    const bound = Math.min(880, 0.92 * w);
    check(`tablet ${w}x${h}: Settings is the DESKTOP modal register — width <= min(880, 92vw) = ${Math.round(bound)}, centred, radius + border, not the 100vw sheet`,
      modal.w <= bound + 1 && modal.w >= 600 && modal.h < h - 40 && modal.centred && modal.radius > 0 && modal.border > 0,
      JSON.stringify(modal));
    check(`tablet ${w}x${h}: the 208px nav rail shows (two grid tracks), the phone actions bar stays hidden`,
      modal.navShown && modal.tracks === 2 && modal.actionsHidden, JSON.stringify(modal));
    check(`tablet ${w}x${h}: label -> control span stays within the desktop register (<= 320px; the sheet measured 620px at 1180)`,
      modal.rows > 0 && modal.spanMax <= 320, JSON.stringify({ rows: modal.rows, spanMax: modal.spanMax }));
    check(`tablet ${w}x${h}: nav pills keep the §6 44 pt floor`, modal.pillFloor, JSON.stringify(modal));
    await chrome.eval(`document.getElementById('ob-settings-close').click()`);
    check(`tablet ${w}x${h}: modal closes`, await pollFor(SHELL_GONE));
  }
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await chrome.send('Emulation.clearDeviceMetricsOverride');

  // ---- F2. GH-460: a discipline switch seeds a COLD-BOOT breaker ------------
  // A game switch abandons the running match — the fresh discipline's match
  // must seat P1 as breaker like a cold boot, never the abandoned game's
  // turn-holder (RED pre-fix: flow.js's module hotseat was never reset by
  // the game-switch rerack, so initialState(player) seeded the stale seat).
  // The seat carve-outs (replay wire pin, same-discipline rulebook re-racks)
  // are pinned green by e2e-share's 448 arms and e2e-carom V5/S9.
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=gh460` });
  await waitReady();
  await sleep(600);
  await chrome.eval(`__settings.changeGame('eight_ball', { skipConfirm: true })`);
  check('GH-460 setup: 8-ball fold live', await pollFor(
    `window.__settings.get().game === 'eight_ball'
     && window.__rules.matchState() !== null`));
  // hand the turn to seat 2 the way a judged turnover does (the seam
  // writes the same module hotseat register a foul's fold assigns)
  const seat460 = await chrome.eval(
    `window.__rules.setMatchState({ shooter: 2 })
     && window.__rules.player() === 2`);
  check('GH-460 setup: the abandoned match holds the turn on seat 2',
    seat460 === true);
  await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`);
  check('GH-460: snooker fold live after the switch', await pollFor(
    `window.__settings.get().game === 'snooker'
     && window.__rules.matchState() !== null`));
  const fresh460 = await chrome.eval(`({
    player: window.__rules.player(),
    ms: window.__rules.matchState() })`);
  check('GH-460: the switched discipline seats the cold-boot breaker (P1), '
    + 'never the abandoned game\'s turn-holder',
  fresh460.player === 1 && fresh460.ms?.shooter === 1,
  JSON.stringify(fresh460));
  const errs460 = await chrome.eval('window.__test.errors');
  if (errs460.length) fail('app errors (gh460 arm): ' + errs460.join(' | '));
  await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await pollFor(`window.__settings.get().game === 'nine_ball'`);

  // ---- A-1053 / GH-990: real pending decisions vs the gear and Re-rack -----
  // GH-1053 (§7 D18): the gear OPENS under a pending decision (RED pre-fix:
  // decisionLocked() returned before any feedback — dead at the start of
  // every carom rack), and the round trip leaves the decision, its prompt
  // and the shot gate exactly as they were, with focus back in the prompt.
  // GH-990: the HUD Re-rack is refused with the honest notice under a
  // PROGRESSED rack's decision (RED pre-fix: one click dealt a new rack and
  // wiped the score, the miss count and the opponent's option), asks first
  // on any other progressed rack, and stays one click on a pristine rack.
  // Decisions come from real strokes: a carom rack's initialState-born
  // break_spot, a snooker foul and a miss, an 8-ball no-contact break foul.
  {
    await chrome.send('Page.navigate', { url: `${APP_URL}&arm=gh1053` });
    await waitReady();
    await sleep(600);
    await chrome.eval(STUB_NATIVES);
    const DEC_UP = `(() => { const d = document.getElementById('hud-decision');
      return !!d && d.getClientRects().length > 0; })()`;
    const SNAP = `(() => { const m = window.__rules.matchState();
      return JSON.stringify({ pd: m?.pendingDecision ?? null,
        scores: m?.scores ?? null, points: m?.points ?? null,
        miss: m?.miss ?? null, shooter: m?.shooter ?? null,
        shoot: document.getElementById('shoot').disabled,
        dec: ${DEC_UP}, state: __test.state(),
        balls: JSON.stringify(__test.balls()) }); })()`;
    const settleShot = async () => {
      await pollFor(`__test.state() === 'PLAYBACK' || __test.state() === 'SIMULATING'`, 15);
      return pollFor(`__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'`, 150);
    };
    const gearRoundTrip = async (tag) => {
      const before = await chrome.eval(SNAP);
      await mouseClickOn('#ob-gear');
      check(`${tag}: the gear OPENS settings under the pending decision (GH-1053)`,
        await pollFor(`document.getElementById('ob-gear').getAttribute('aria-expanded') === 'true'
          && document.getElementById('ob-settings').getClientRects().length > 0`));
      check(`${tag}: the decision prompt yields (inert) under the modal`,
        await chrome.eval(`document.getElementById('hud-decision').inert === true`));
      await pressKey('Escape', 'Escape', 27);
      check(`${tag}: Escape closes settings`, await pollFor(SHELL_GONE)
        && await chrome.eval(`document.getElementById('ob-gear').getAttribute('aria-expanded') === 'false'`));
      check(`${tag}: focus returns into the decision prompt`,
        await pollFor(`document.getElementById('hud-decision').contains(document.activeElement)`),
        await chrome.eval('document.activeElement?.outerHTML?.slice(0, 80) ?? null'));
      const after = await chrome.eval(SNAP);
      check(`${tag}: decision, prompt and shot gate unchanged by the round trip`,
        after === before, JSON.stringify({ before, after }));
    };
    const rerackRefused = async (tag) => {
      const before = await chrome.eval(SNAP);
      await mouseClickOn('#rerack');
      await sleep(600);
      const hint = await chrome.eval(`({ text: document.getElementById('hud-hint')?.textContent,
        shown: document.getElementById('hud-hint')?.style.display === 'block',
        want: window.__i18n.t('shell.notice.decision') })`);
      check(`${tag}: Re-rack is refused with the honest notice (GH-990)`,
        hint.shown && hint.text === hint.want, JSON.stringify(hint));
      check(`${tag}: no confirm under a decision`, !await chrome.eval(CONFIRM_UP));
      const after = await chrome.eval(SNAP);
      check(`${tag}: the refused Re-rack leaves the table and the decision untouched`,
        after === before, JSON.stringify({ before, after }));
    };

    // carom: the fresh rack's break_spot (pristine, address-born)
    await chrome.eval(`__settings.changeGame('carom_3cushion', { skipConfirm: true })`);
    check('A-1053 carom: break_spot pends on the fresh rack', await pollFor(
      `window.__rules.matchState()?.pendingDecision?.kind === 'break_spot' && ${DEC_UP}`));
    await gearRoundTrip('A-1053 carom');
    // review r1 P2 boundary: #hud-decision is AIM-TRANSPARENT (ui/keygate.js) —
    // with focus on a decision option, an arrow key still steers the aim
    // (GH-447: keyboard aiming while a decision pends is lawful); the new
    // dialog-surface key gate must not swallow it
    {
      const inPrompt = await chrome.eval(`document.getElementById('hud-decision').contains(document.activeElement)`);
      const ph0 = await chrome.eval('window.__aim.getPhi()');
      await pressKey('ArrowLeft', 'ArrowLeft', 37);
      await sleep(200);
      const ph1 = await chrome.eval('window.__aim.getPhi()');
      check('A-1053 carom: keyboard aim stays live with focus in the decision prompt (aim-transparent)',
        inPrompt === true && ph1 !== ph0, JSON.stringify({ inPrompt, ph0, ph1 }));
    }
    // pristine carve-out: the address-born option re-raises on a re-rack, so
    // one click re-racks (the staged points are the re-rack's witness)
    await chrome.eval(`window.__rules.caromSetMatchState({ points: { 1: 3, 2: 0 } })`);
    await mouseClickOn('#rerack');
    check('A-1053 carom: a pristine Re-rack is one click, the option re-raises',
      await pollFor(`window.__rules.matchState()?.points?.[1] === 0
        && window.__rules.matchState()?.pendingDecision?.kind === 'break_spot'`)
      && !await chrome.eval(CONFIRM_UP));

    // snooker: a real foul and a miss (the GH-990 repro stroke from the D)
    await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`);
    await pollFor(`window.__rules.matchState()?.phase === 'reds'`);
    await chrome.eval(`(() => { __test.aim(0); const p = document.getElementById('power');
      p.value = '1.0'; p.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await mouseClickOn('#shoot');
    await settleShot();
    const fm = await pollFor(`window.__rules.matchState()?.pendingDecision?.kind === 'foul_and_a_miss' && ${DEC_UP}`);
    check('A-1053 snooker: the stroke leaves a foul-and-a-miss decision', fm,
      await chrome.eval(SNAP));
    if (fm) {
      await gearRoundTrip('A-1053 snooker');
      await rerackRefused('GH-990 snooker');
      // answer it (the first option: "I play from here") — the rack stays
      // progressed and undecided: Re-rack now ASKS; Cancel keeps the score
      await mouseClickOn('#hud-decision .hd-btns button');
      await pollFor(`window.__rules.matchState()?.pendingDecision === null && !${DEC_UP}`);
      const s0 = await chrome.eval(SNAP);
      await mouseClickOn('#rerack');
      const asked = await pollFor(CONFIRM_UP);
      check('GH-990 snooker: Re-rack on the progressed rack asks first', asked);
      if (!asked) {
        // #170 containment: the Cancel/Continue legs need the dialog
        skip('GH-990 snooker Cancel/Continue', 'no confirm opened (failed above)');
      } else {
        await mouseClickOn('[data-ob="confirm-cancel"]');
        await pollFor(`!document.querySelector('[data-ob="confirm"]')`);
        await sleep(300);
        check('GH-990 snooker: Cancel keeps the frame (score, miss, table)',
          await chrome.eval(SNAP) === s0);
        await mouseClickOn('#rerack');
        if (!await pollFor(CONFIRM_UP)) {
          check('GH-990 snooker: the confirm opens again', false);
        } else {
          await mouseClickOn('[data-ob="confirm-accept"]');
          check('GH-990 snooker: Continue deals the new frame',
            await pollFor(`(() => { const m = window.__rules.matchState();
              return m?.scores?.[1] === 0 && m?.scores?.[2] === 0 && m?.miss === null
                && m?.pendingDecision === null; })()`));
        }
      }
    }

    // 8-ball: a real no-contact break foul (WPA break_foul option)
    await chrome.eval(`__settings.changeGame('eight_ball', { skipConfirm: true })`);
    await pollFor(`window.__rules.matchState()?.phase === 'break'`);
    await chrome.eval('__test.shoot({ v0: 0.6, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    await settleShot();
    const bf = await pollFor(`window.__rules.matchState()?.pendingDecision?.kind === 'break_foul' && ${DEC_UP}`);
    check('A-1053 8-ball: the no-contact break leaves a break_foul decision', bf,
      await chrome.eval(SNAP));
    if (bf) {
      await rerackRefused('GH-990 8-ball');
      await gearRoundTrip('A-1053 8-ball');
      await mouseClickOn('#hud-decision .hd-btns button');
      await pollFor(`window.__rules.matchState()?.pendingDecision === null`);
    }
    const errs1053 = await chrome.eval('window.__test.errors');
    if (errs1053.length) fail('app errors (gh1053 arm): ' + errs1053.join(' | '));
    check('A-1053: zero native dialogs across the arm',
      await chrome.eval('window.__nativeCalls.confirm === 0 && window.__nativeCalls.alert === 0'));
    await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
    await pollFor(`window.__settings.get().game === 'nine_ball'`);
  }

  // ---- G. stale-graph degradation arm (SC-007) — LAST -----------------------
  chrome.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    // feature 034: play.js is poisoned on the SAME stale graph (a 200 body
    // without the createPlay export ⇒ the shell's content host degrades,
    // the S1 stub stands, window.__play is never published) — the
    // show('game') SHIM's honest-hint leg below reads that rung
    const stalePlay = /\/app\/play\.js(\?|$)/.test(params.request.url);
    // B2's degrade (015 §7 D19): the Licences row's notice fetch fails
    if (/\/vendor\/NOTICE-pooltool\.txt(\?|$)/.test(params.request.url)) {
      chrome.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Failed' });
    } else if (params.request.url.includes('navmodal.js') || stalePlay) {
      chrome.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(stalePlay
          ? 'export const stale = 1; // pre-034 stale play module\n'
          : 'export const stale = 1; // pre-015 stale kit\n')
          .toString('base64'),
      });
    } else chrome.send('Fetch.continueRequest', { requestId: params.requestId });
  });
  await chrome.send('Fetch.enable', { patterns: [
    { urlPattern: '*navmodal.js*' }, { urlPattern: '*app/play.js*' },
    { urlPattern: '*vendor/NOTICE-pooltool.txt*' }] });
  await chrome.send('Network.enable');
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  // (034: `obshell=1` so the shell exists for the show('game') shim leg
  // below — a scripted boot has no shell otherwise; the instant boot pose
  // is closed again before the modal checks)
  await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=stale` });
  await waitReady();
  await waitFor(SHELL_UP, 'settings shell (stale arm, fallback register)');
  await sleep(1000);
  await chrome.eval(STUB_NATIVES);
  await pollFor(`window.__shell?.isOpen?.() === true`);
  await chrome.eval(`window.__shell?.quickPlay?.(); true`);
  await pollFor(`window.__shell?.isOpen?.() === false`);
  const stale = await chrome.eval(`(async () => {
    const el = document.getElementById('ob-settings');
    if (!el) return { present: false };
    const out = { present: true,
      fallbackRegister: !el.classList.contains('ob-navmodal') };
    document.getElementById('ob-gear').click();
    await new Promise((r) => setTimeout(r, 300));
    out.opens = el.getClientRects().length > 0;
    out.allSectionsVisible = [...el.querySelectorAll('section[data-section]')]
      .every((s) => !s.hidden);
    out.active = window.__settings.activeSection();
    document.getElementById('ob-gear').click();
    await new Promise((r) => setTimeout(r, 300));
    out.closes = el.getClientRects().length === 0;
    return out;
  })()`);
  check('SC-007: stale navmodal graph degrades to the stacked register '
    + '(open/close + all sections wired, never a black page)',
  stale.present && stale.fallbackRegister && stale.opens
    && stale.allSectionsVisible && stale.active === 'assists' && stale.closes,
  JSON.stringify(stale));
  // B2's degrade (015 §7 D19): the notice fetch fails on this page (the Fetch
  // handler above), so activating the Licences row disables it (disabled +
  // aria-disabled, the bug-report degrade) and the region stays hidden
  const licPresent = await chrome.eval(`(() => {
    const b = document.getElementById('ob-about-licences');
    if (!b || !document.getElementById('ob-about-licences-text')) return false;
    document.getElementById('ob-gear').click();
    b.click();
    return true;
  })()`);
  const licDisabled = licPresent
    && await pollFor(`document.getElementById('ob-about-licences').disabled === true`);
  const licDegrade = await chrome.eval(`(() => {
    const b = document.getElementById('ob-about-licences');
    const out = { ariaDisabled: b?.getAttribute('aria-disabled') ?? null,
      expanded: b?.getAttribute('aria-expanded') ?? null,
      hidden: document.getElementById('ob-about-licences-text')?.hidden ?? null };
    document.getElementById('ob-gear').click();
    return out;
  })()`);
  check('B2 degrade: a failed notice fetch disables the Licences row '
    + '(disabled + aria-disabled, the region stays hidden)',
  licDisabled && licDegrade.ariaDisabled === 'true' && licDegrade.expanded === 'false'
    && licDegrade.hidden === true, JSON.stringify({ licPresent, licDisabled, plantedNoticeErrors, ...licDegrade }));
  // feature 034 (FR-011): the show('game') SHIM on the stale graph. With
  // everything closed the first call still routes to the shell (place =
  // play; play.js poisoned ⇒ the S1 stub stands, __play undefined); the
  // second call — shell open at play, __play undefined — lands the HONEST
  // reload hint in the HUD register (shell.place.play.shim.stale, the
  // closed-shell/shell-less register; the shell notice is the T022 twin's
  // surface for the stub action, e2e-play P1a) instead of a silent no-op.
  const staleShim = await chrome.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const r1 = window.__settings.show('game');
    for (let i = 0; i < 100 && !(window.__shell?.isOpen?.()
      && window.__shell.place() === 'play'); i++) await wait(100);
    await wait(1200); // the arrival hold (LAW 2) + the degrade settle
    const stub = !document.querySelector('section[data-place="play"].ob-play-host');
    const r2 = window.__settings.show('game');
    await wait(300);
    return { r1, r2, shellOpen: window.__shell?.isOpen?.() ?? null,
      place: window.__shell?.place?.() ?? null, play: typeof window.__play, stub,
      hint: document.getElementById('hud-hint')?.textContent ?? null,
      exp: window.__i18n.t('shell.place.play.shim.stale') };
  })()`);
  check("SC-007/034: stale show('game') routes to the shell; with play.js poisoned "
    + 'the second call lands the honest HUD reload hint (shell.place.play.shim.stale)',
  staleShim.r1 !== 'game' && staleShim.r2 !== 'game' && staleShim.shellOpen === true
    && staleShim.place === 'play' && staleShim.play === 'undefined' && staleShim.stub
    && staleShim.hint === staleShim.exp, JSON.stringify(staleShim));
  const errsG = await chrome.eval('window.__test.errors');
  if (errsG.length) fail('app errors (stale arm): ' + errsG.join(' | '));

  // console gate: the stale arm's navmodal parse noise is EXPECTED (B2's
  // planted notice fetch failure never enters consoleErrors: the collector)
  const badConsole = consoleErrors.filter((e) => !/navmodal/i.test(e));
  if (badConsole.length) fail('console errors: ' + badConsole.join(' | '));

  // ---- G5. GH-668 S5 slice 2 — the settings surface on the kit parts -------
  // (own real-user boots on CDP_PORT + 6 / + 5 against this suite's server;
  // every OK line is one scoreboard pass, every FAIL one fail)
  {
    const before = nFail;
    const g5ok = { n: 0 };
    const log = console.log;
    console.log = (...a) => { if (/^G5 .* OK/.test(String(a[0]))) g5ok.n++; log(...a); };
    try { await armG5({ PORT, CDP_PORT, fail }); } finally { console.log = log; }
    nPass += g5ok.n;
    check('G5: settings on the kit parts (rows / toggles / About actions / voices / phone bar) — arm ran with no fixture collapse',
      g5ok.n + (nFail - before) >= 8, `ok=${g5ok.n} fail=${nFail - before}`);
  }

  // ---- X1 / X2 / T1. build 20 — saved choices across a cross-game Continue
  // (#1034) and across two tabs on one profile (#1019); own real-user
  // browser on CDP_PORT + 7 against this suite's server. Named-only (header)
  if (process.env.OB_PERSIST_ARMS) {
    const before = nFail;
    const okLines = { n: 0 };
    const log = console.log;
    console.log = (...a) => { if (/^(X1|X2|T1) OK/.test(String(a[0]))) okLines.n++; log(...a); };
    try { await armPersist({ PORT, CDP_PORT, fail }); } finally { console.log = log; }
    nPass += okLines.n;
    const named = process.env.OB_PERSIST_ARMS.split(',').map((s) => s.trim());
    const want = ['X1', 'X2', 'T1'].filter((id) => named.includes(id) || (id === 'X1' && named.includes('X2'))).length;
    check('X1/X2/T1: persistence across a cross-game Continue and two tabs — every named arm reported',
      okLines.n + (nFail - before) >= want, `ok=${okLines.n} fail=${nFail - before} want=${want}`);
  }
} catch (e) {
  // Last-resort abort (#170 audit): every recoverable sub-step failure is
  // contained above (cardPoint fails loudly and its callers skip, cleanup
  // clicks are ?.guarded, defensive teardowns re-settle shared state) — what
  // still lands here is an arm PRECONDITION collapse (waitFor throw: app
  // never ready, shell never mounted, seam missing) after which no later arm
  // could run truthfully on this shared page. Fail loudly; the finally still
  // prints the scoreboard for everything that DID run.
  fail(e.stack ?? e);
} finally {
  console.log(`[e2e-settings] SCOREBOARD: ${nPass} passed, ${nFail} failed, `
    + `${nSkip} skipped`);
  chrome.close();
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-SETTINGS: FAILED' : 'E2E-SETTINGS: PASS');
