// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-drills.mjs — practice-mode gate (issue #66): drives four drills
// headlessly end-to-end through the window.__drills seam.
//
//   arms:
//   0. hermetic boot: virgin profile carries ZERO localStorage keys; the
//      drills module writes nothing before the first user-initiated start.
//   1. registry honesty: every published base_seed re-derives from
//      SHA-256(corpus_id) (the rl-research manifests.py audit-on-load law).
//   2. picker: pill present (tbOrder 6, computed flex order 6, renders
//      RIGHT of the help pill — app.html pins order 1..5 on the siblings),
//      opens/closes; cards render with a no-truncation probe under the
//      widest locales (de, fr). #81 finding 5: discipline-mismatched cards
//      carry the requirement badge (snake declares "switches to Snooker"
//      on a pool table; in-discipline cards stay unlabeled) and the badge
//      joins the no-truncation probe.
//   3. determinism: same drill+step ⇒ byte-identical layout JSON across two
//      boots, and the staged table matches the published layout exactly.
//   4. bu-f2 (BU ladder): scripted pass ⇒ position ADVANCES + streak/score;
//      scripted miss ⇒ position RETREATS (the BU protocol asserted).
//   5. bu-f6 (stations): pass scores 1; the verdict is RECOMPUTED in this
//      test from __test.events() + __rules.judgmentJson() and must agree
//      (objective honesty — the smoke.py law).
//   6. circle (run): pass counts potted balls; a containment-breaking miss
//      ends the drill; completion persists 'ob-drills-v1' bests, and the
//      drill-END NOTICE (GH-668 S5 slice 4 B-PR05 / R11: div#ob-drill-end,
//      the kit .ob-prompt--notice — title "{name} · {score}/{max}", body
//      the sentence-case verdict + fail reason; NO assist tag; #banner
//      stays EMPTY for the whole hold) survives flow's 1800 ms
//      BALL_IN_HAND banner clear WITHOUT EVER BLINKING (#81 finding 4: the
//      hold-through wrap swallows the clear — a 100 ms display poll across
//      the whole window replaces the old point probe, which slept exactly
//      over the ~0.9 s gap) + the register leg (no caps transform, 14 px
//      body, --ob-glass-solid rung, --ob-info-line edge, ≤ 60ch / 2 lines).
//      #81 finding 6: a mid-hold locale switch recomposes BOTH notice lines
//      in the new language; the ending settle paints NO per-shot hint
//      (one message per settle).
//  6b. tap-to-dismiss (issue #71): a real pointer tap dismisses the
//      drill-end notice AND cancels the FLOW_BANNER_MS re-assert chain —
//      the dismissed notice is NOT resurrected at ~2.7 s (arm 6's no-tap
//      survival path is unchanged).
//  6c. readout atoms + D-readout (GH-668 B-PR05 / B-K21): the counters are
//      div.ob-drills__readout (ONE badge = the name; body 14 / text-1,
//      tabular, no pill radius, ≤ 2 line boxes in the panel; each .seg on
//      one line; ja / de / en). Arm 13 carries the phone leg (ONE line).
//   7. l-drill (run): cue-cushion whitelist violation ends the run.
//   8. ghost9 (racks): every rack start is a genuine kitchen break
//      placement (BALL_IN_HAND, issue #79 defect 2); a legal dry break
//      continues; the post-break foul loses rack 1; an interloping stroke
//      inside the RACK_MS window is VOIDED (decided-rack latch — tally
//      unchanged); the drill's own seeded re-rack lands (asserted via the
//      '[drills] rerack' mirror + the judgment() reset — a dead rack also
//      shows 10 unpocketed); Replay pressed inside the NEXT rack-transition
//      window still re-racks on schedule (timer survives PLAYBACK), and the
//      in-app replay never exits the drill (chrome stays up).
//   9. persistence: reload restores bests through __drills.bests().
//  21. issue GH-200 — best keyed by the ASSIST mode: the same drill under
//      two assist modes keeps two INDEPENDENT bests (v2 blob
//      drills[id][assist]); bests() projects the ACTIVE mode (flat pre-200
//      shape), bestsByAssist() is the full map; picker best line +
//      completion banner carry the assist tag; a run latches its mode at
//      start and only ESCALATES on a mid-run flip.
//  22. issue GH-200 — v1 legacy-blob load-migration: flat records map to
//      the DEFAULT mode ('standard'), in-memory at boot (no write — the
//      hermetic law), v2 persisted on the first user-initiated write.
//  10. stale-kit degradation: with ui/dialog.js unavailable the module
//      installs NOTHING (no pill, no __drills) and logs zero errors.
//  11. issue #79 defect 1 — dangling STOP DRILL: EVERY exit path (user
//      stop, completion [in arm 6], foreign rerack — the settings
//      game/equipment-switch AND shared-replay-entry signature (share.js
//      gotoShot re-racks on the sender's seed) — and foreign layout) tears
//      down ALL drill chrome: the chip strip empties, #ob-drill-stop is
//      GONE, and a tap where the button was does nothing drill-related.
//  12. issue #79 defect 2 — cuePlacement law: an in-hand drill (bu-f7,
//      'anywhere') boots into BALL_IN_HAND and a REAL mouse drag through
//      the aim.js seam places the cue ball without disturbing object
//      balls; the retry re-lay re-places the cue and re-grants; a fixed
//      drill (bu-f2) stays in AIM with an undraggable cue; a kitchen
//      drill (ghost10 — issue GH-131 retargeted the leg off `lineup`,
//      which moved to the owner's in-hand-anywhere law) clamps placement
//      behind the head string.
//  16. issue GH-131 — the line-up (蛇彩) family (the owner verdict killed
//      the shipped half-BALL-gap line: half-table span, unpottable
//      1-ball). Five legs: (a) LAYOUT law per variant — half-diamond
//      slots / lateral row (all three owner orders: end-to-end,
//      lat-e2m, lat-m2e — review finding 1) / L legs / diagonal
//      endpoints + objective bytes (rotation everywhere; L/diagonal
//      only-pocket); (b) ORDER — the anywhere grant is live (a
//      foot-half placement sticks) and a wrong-order first contact ends
//      the run with reason 'contact'; (c) ONLY-POCKET — a real pot into
//      a NON-designated pocket ends the diagonal run with reason
//      'pocket'; (d) PLAYABILITY — a scripted REAL first-ball pot on
//      EVERY variant incl. progressive-lineup's N=5 lay (review finding
//      3; ghost-ball aim from live kernel facts; recipes pinned offline
//      by web/tools/find-lineup-recipes.mjs), the anti-regression that
//      makes an unpottable opening unshippable; (e) PLAY-COUNT
//      PERMUTATION (review finding 2) — lineup-random's attempt index k
//      derives from the persisted play count, so play n and play n+1
//      stage DIFFERENT permutations (layout(id, n) vs layout(id, n+1)),
//      each byte-stable on a reset() re-lay. Issue GH-136 geometry
//      corrections folded IN PLACE (no new arm numbers): the L rebuilt
//      to the owner photo spec (corner ball ON the center string at the
//      foot spot, 2-diamond legs WRAPPING the enclosed foot-right
//      pocket's quadrant, END-TO-END id order, rail-adjacent far ends at
//      the clampBed margin, pocket 5 only — 16c gains the L wrong-pocket
//      red leg) and the lateral row's uniform-16-gap law
//      (g = (w − 15·ball_d)/16, end gap == inter gap asserted); 16d
//      re-pinned (lineup-l → pocket 5; lateral legs re-centered on the
//      swept plateau).
//  17. issue GH-134 — the lineup family's clean-contact BASE rule: after
//      the cue's first contact, ANY further cue↔object contact ends the
//      run with the NEW reason 'crash' (cue↔cushion legal; object↔object
//      disturbance NOT a fail — recorded owner boundary). Three red legs
//      pin all three consumers — run evaluate() (lineup), the called
//      demotion (lineup-called: a would-be slop pass demotes to 'crash')
//      and the progressive gate (N retreats 5→4 on the crash) — plus a
//      green leg (clean pot continues, record honesty: EXACTLY one
//      cue↔object BallBall event). Recipes pinned offline by
//      find-lineup-recipes.mjs (crash-red blocks). Arm 16's playability
//      table re-certified under the rule (the diagonal default cue
//      flipped to the mirrored +45° cut side — GH-134 re-pin).
//  18. issue #144 — desktop compact strip (ordinal settled at the merge
//      wave: 15g/17 went to #133/#134, 19 to #138 — 18 stands as
//      claimed): with a live ladder drill the strip is TWO
//      segments (accent name pill + ONE ' · '-merged counters badge that
//      wraps internally, never clips ×7 locales), stays inside the #hud
//      right-panel slab (the desktop edge treatment) and never pushes the
//      panel past the viewport bottom at 1280x800 (#81 finding-3 guard).
//  19. issue GH-138 — the sandbox terminal gate (renumbered from its
//      parallel claim of arm 17 at merge: #134 kept 17, #144 took 18).
//      The §3.5 sandbox pin is a SESSION game switch only, so
//      the live nineball-v1 fold used to fire its match terminal on a
//      LEGAL 9-pot mid-lineup (winner banner + WIN routing + the 2600 ms
//      auto re-rack whose foreign {seed} killed the run). Legs: (a) an
//      offline-probed 15-leg lineup pot chain through ball 9 potted
//      LEGALLY — NO gameWon/WIN/winner banner, the
//      drillTerminalSuppressed mirror, drill ACTIVE at score 9, no
//      auto-rerack kill; (b) the run CONTINUES (leg 10 scores); (c) the
//      run COMPLETES cleanly through the full 15-ball clear
//      (drills.completeBanner, never flow.winBanner); (d) fold-observer
//      inverse: ghost9 exposes sandbox:false and its REAL terminal still
//      fires (offline-probed legal-9 break → machine WIN + gameWon +
//      the 'won' rack verdict; arm s5 is the sequence-observer tripwire).
//  23. issue #323 — Replay pressed AFTER the silent continue re-lay LANDED:
//      the nextFn latch re-runs the SAME re-lay the drill armed (never the
//      full-attempt fallback that reset the table while the run state
//      stayed advanced → wrong-first 'contact' foul). Legs: lineup red +
//      next-stroke no-foul probe; parked-window healthy control;
//      progressive-lineup mid-rack (reLayContinue class, red); bu-f2
//      ladder (applyAttempt class, green pin + scoring continuity).
//  snake arms (issue #80, discipline-aware drill contexts):
//  s1. snake start pins practice + the SNOOKER discipline (changeGame
//      path), stages the 22-ball frame then hides the reds — colours
//      byte-on their SNOOKER_LAYOUT spots, cue in hand in the D (the 'd'
//      grant clamps requests onto the D boundary), fold shaped to
//      final_colours with the yellow on;
//  s2. healthy-but-SLOW layouts leaf (the server HOLDS the module until
//      released): an immediate tap right after install parks on the
//      PENDING import and SUCCEEDS when it lands — never the pre-fix
//      spurious refusal (start is provably driven while the import is
//      still in flight);
//  s3. sequence law: the baked in-order yellow pot (offline-probed
//      recipe, find-snake-recipes.mjs) advances the step and the yellow
//      STAYS DOWN (j.respot empty — R3(h)(ii)); a no-contact stroke ends
//      the run as a foul with score 1, persisted to ob-drills-v1;
//  s4. order enforcement + respot cycle: potting the GREEN while the
//      yellow is on is a wrong-first-ball foul that ends the run scored
//      as a miss (0); judgment.respot carries [17] immediately, and the
//      fouled-in green returns to its OWN spot when the R13 play-again
//      option resolves (flow's snookerRespotPlan application — the
//      e2e-snooker S5 lane, never duplicated in the drill);
//  s5. black-terminal WIN window: a foul with the black on ends the
//      FRAME (R4(b)) — the runner's own fresh frame lands inside flow's
//      2600 ms WIN auto re-rack window and the completion banner
//      survives the hold;
//  s6. teardown from the snooker context: a foreign rerack silent-stops
//      the drill and tears all chrome (the arm-11 law, snooker leg);
//  s7. stale games/layouts.js server: snooker drills refuse cleanly
//      (start false, layout null, discipline untouched) and the refusal
//      restores the pre-pin session mode (no practice stranding) while
//      pool drills still run;
//  sL. snake-lateral layout probe: six colours evenly spaced across the
//      WPBSA width on the blue-spot cross line, ascending left→right.
//  13. coarse register (#81 findings 1 + 2 — the gap that hid them: this
//      suite was desktop-only): a REAL phone boot (touch-cdp emulation,
//      844x390 landscape + 390x844 portrait) opens the sheet picker and
//      asserts every card renders FULL-HEIGHT (description + best line
//      visible, nothing clipped — pre-fix the 100dvh body collapsed rows
//      to the 44px floor); then a landscape completion shows the banner
//      in its OWN band (.ob-drills-banner) with NO rect overlap against
//      the reason hint. (Finding 5's inverse leg — badge hidden once the
//      snooker discipline is active, pool cards labeled — rides arm s1.)
//      Issue #144 extends the live-drill window: the relocated chip strip
//      sits in the band-T CENTER span (two segments), clear of the felt
//      core (kernel pocket bbox via __tp.projectK, 24px edge margin — the
//      e2e-ui --audit occlusion derivation) and pointer-INERT (a tap at
//      its center falls through to the renderer canvas, #81a law).
//  24. GH-384 published-sheet alignment: bu-f1's stations are the F1
//      diagram's donut points (diamonds 1-7, one diamond off the rail; OB
//      at the one-ball-gap corner point) and its scratch gate is RETIRED
//      per the diagram letter ("you are allowed to scratch" — a scratch
//      stroke reads 'contact', never 'scratch'); bu-f5 is the sheet's
//      TARGET ladder (OB one ball below the table center, papers at
//      long-rail diamonds 5/6/7 + the foot-rail position 4, start 4,
//      cap 10) with the end-rail rebound REQUIRED for positions 5-7
//      (needFootCushion, reason 'norail') — layout/objective bytes +
//      scratch red/green + drift/rebound/norail behavioral pins.
//  25. GH-442 objective-zone decal — the paper target is VISIBLE. An
//      INTERACTIVE boot (tool:false — the e2e-aim GH-260/GH-417 measurement
//      register: the adaptive assist-ink path is scripted-pinned off under
//      ?obtool) proves, at bu-f5 (rect paper) + the bu-f2 circle sibling:
//      (a) zero-render law — outside a drill the seam reads null, the decal
//          group is invisible, and an A/B frame pair (decal live vs
//          force-hidden) is pixel-identical within 1 LSB;
//      (b) single-source law — the LIVE __drills.objectiveZone() bytes equal
//          the catalog re-derivation (__drills.layout(id, k).objective
//          .cueRest): the decal is a pure projection, no per-drill tuning;
//      (c) decal pixels PRESENT inside/on the published zone rect (A/B/M
//          rig — the e2e-aim INK_RIG anatomy: B = probe-hidden background,
//          M = magenta mask-swap locates the boundary stroke, A measures
//          it), contrast-measured (WCAG ratio + APCA Lc vs the adjacent
//          rendered cloth) at ALL FOUR GH-417 assist-contrast levels x
//          {tournament_blue, classic_green}. The decal is the WHITE-
//          outline + paper-wash anatomy (owner fix round, #442 verdict:
//          the BOUNDARY is physical paper-white on a lit material — it
//          must read LIGHTER than the felt at >= 90% of visible stations,
//          the white law; the FILL is the adaptive light paper wash) —
//          floors are the measured white-on-cloth deliverables (standard
//          >= 2.1 measured WCAG and >= Lc 40 on BOTH stock felts; the
//          bright blue felt physically caps a white stroke ~2.4-2.5,
//          REPORTED honestly, while green carries ~4.0), plus the GH-417
//          ladder as COVERING POWER: zoneDecal().lineA must equal the
//          anchor-ratio ladder EXACTLY (0.425/0.85/1/1 — low dims the
//          white toward the felt, high/maximum display-cap at full
//          opacity) and the optical ladder must point the same way (low
//          strictly below standard; high/maximum never below it beyond
//          jitter — the ACES chain compresses the optical steps, so the
//          mechanical lineA assertion carries the design and the optical
//          one proves direction). The adaptive channel must be LIVE
//          (zoneDecal().active — a broken previewink wire degrading the
//          wash to the static tone is a loud fail on this interactive
//          boot, the GH-260 rule-5 gate philosophy);
//      (d) visibility grammar — the decal shows at address (AIM +
//          BALL_IN_HAND), STAYS through the shot (PLAYBACK), the seam nulls
//          at resolution (the evaluate() edge) and the decal fades out, the
//          re-lay re-arms it, stop() clears it; non-drill modes never
//          render it;
//      (f) assist-off law (review r1 P1) — hiding every preview line must
//          not starve the zone channel: the decal stays adaptive at
//          address under __aim.setAssist('off');
//      (g) local-replay suppression (review r2 P2) — the Replay button
//          re-plays the PREVIOUS shot while the next attempt is laid: the
//          next paper must hide for the replay (restDecal().replayHeld)
//          and re-arm once real routing resumes.
//  28. GH-668 S5 slice 4 B-PR03 — the drill strip docks to band T's RENDERED
//      right edge: real coarse boots (844x390 en/de, 667x375 en, notch
//      insets on) prove the name badge clears the fifth toolbar pill by
//      sp-2, sits inside the shell's bands().bandT, the inline
//      --drills-slot-l equals the measured toolbar/hud difference and
//      re-derives on a toolbar re-size + a live viewport re-size; the
//      fine-pointer boot carries no inset (HUD panel flow).
//   Determinism arm 3 additionally byte-compares the snake layout across
//   boots (composed PRE-START on the pool table — active-table-independent
//   SNOOKER_LAYOUT ctx), and arm 2's no-truncation probe runs the drills
//   picker across ALL SEVEN locales (the #80 picker-category audit).
//
//   node web/tools/e2e-drills.mjs [--port 8187]   (needs Chrome + node ≥22)
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
// __tp.projectK (arm 12); phone emulation for the coarse register (arm 13);
// tap = real Input.dispatchTouchEvent press (the #120 dock coarse leg)
import { PAGE_HELPERS_JS, launchPhone, setPhoneMetrics, setSafeAreaInsets, tap,
  verifyCoarse } from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// GH-1078: `--fastlane` is the per-PR subset (ci.yml e2e-fastlane, measured ≤ 60 s): arms 0, 1, 3, 11, the
// snake arms s1/s3/s4 and 9, then the error gates — deterministic DOM / data arms, desktop, no pixel reads. Every
// other arm sits in an unindented `if (!FASTLANE) { … }` block (the arm bodies keep their lines); the full suite
// is the e2e-nightly battery step.
const FASTLANE = args.includes('--fastlane');
// GH-1078: `--nightly` is the e2e-nightly battery step: every arm except the ones listed here, each red or flaky on main
// and tracked by the issue beside it (ci.yml's wiring law keeps a red suite unwired; 19e/19f flake on the #208 race
// that #605 names). Whoever closes the issue deletes the entry in the same PR. An entry no arm consults fails the run,
// so the list cannot drift from the arms it skips.
const NIGHTLY = args.includes('--nightly');
const NIGHTLY_UNWIRED = { 25: '#605', '19e': '#605', '19f': '#605' };
const unwiredSeen = new Set();
const unwiredNightly = (arm) => {
  if (!NIGHTLY || !(arm in NIGHTLY_UNWIRED)) return false;
  unwiredSeen.add(String(arm));
  console.log(`[e2e-drills] arm ${arm} not run: ${/^\d+$/.test(String(arm)) ? 'red' : 'flaky'} on main, tracked by ${NIGHTLY_UNWIRED[arm]}`);
  return true;
};
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8187);
const PORT2 = PORT + 1; // stale-kit arm server
// suite-unique CDP ports (parallel-worktree law: a shared default CDP port
// can attach a suite to the WRONG Chrome when two lanes run concurrently)
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 25450);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 4 / CDP 4 slots from the base.
export const PORT_INVENTORY = { http: 4, cdp: 4 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-DRILLS FAIL:', msg); process.exitCode = 1; };
// GH-668 S5 slice 4 (B-PR05 / R11): the drill END message is the kit notice
// div#ob-drill-end (title = "{name} · {score}/{max}", body = the sentence-case
// verdict), no longer #banner (flow's FOUL / WIN caps register, which stays
// EMPTY under the hold). Every drill-end reader below goes through this
// in-page snapshot; flow-banner readers (FOUL legs) keep reading #banner.
// GH-668 S5 slice 4 G6 (B-PR08): one in-page snapshot of the live dock's
// buttons — kit carrier classes, voice (title / aria-label vs t(key)), box.
const DOCK_VOICE_JS = `(() => {
  const t = window.__i18n.t;
  const KEYS = { 'ob-drill-open': 'drills.open', 'ob-drill-reset': 'drills.reset',
    'ob-drill-stop': 'drills.stop', 'ob-drill-bih': 'drills.takeBih' };
  const FAM = ['ob-btn', 'ob-btn--icon', 'ob-btn--glass', 'ob-toolbar-pill'];
  const out = [];
  for (const b of document.querySelectorAll('#ob-drill-dock > button')) {
    if (!b.getClientRects().length) continue;
    const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    out.push({ id: b.id, key: KEYS[b.id] ?? null, want: KEYS[b.id] ? t(KEYS[b.id]) : null,
      title: b.title, aria: b.getAttribute('aria-label'), cls: b.className,
      kit: FAM.every((c) => b.classList.contains(c)), w: r.width, h: r.height,
      radius: parseFloat(cs.borderTopLeftRadius) || 0, color: cs.color });
  }
  return out;
})()`;
/** Force a pseudo-class register on one element (the kit-laws A10 idiom) and
 * read its material tuple; [] reads the rest register the same way. */
async function forcedRegister(c, sel, ps) {
  const doc = await c.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
  if (!nodeId) return null;
  await c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ps });
  await sleep(320); // past the kit's --ob-t-fast transition
  const r = await c.eval(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(sel)}));
    return [s.backgroundColor, s.borderTopColor, s.boxShadow].join('|'); })()`);
  await c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  await sleep(320);
  return r;
}
const END_STATE = `(() => {
  const e = document.getElementById('ob-drill-end');
  const b = document.getElementById('banner');
  return { up: !!e && e.style.display === 'block',
    display: e ? e.style.display : 'absent',
    title: e?.querySelector('.ob-drill-end__title')?.textContent ?? '',
    body: e?.querySelector('.ob-prompt__body')?.textContent ?? '',
    text: e?.textContent ?? '',
    held: !!e && e.classList.contains('ob-drills-banner'),
    banner: b.textContent, bannerDisplay: b.style.display };
})()`;

// GH-668 S5 slice 4 (B-PR05): the LIVE-drill strip predicate the 036 capture
// driver runs on its `dock` cell (read from this file's source the way it
// reads e2e-ui's PRACTICE_GEO_WALKER — a module-private const, no export
// surface). Returns [] or the findings: A8 (never ellipsize / clip), A12 (no
// caps literal on the readout), B-K21 (one badge), the single-row law.
const DRILLS_BAND_WALKER = `(() => {
  const out = [];
  const c = document.getElementById('ob-drill-chips');
  if (!c || !c.classList.contains('on')) return ['strip not on'];
  const badges = c.querySelectorAll('.ob-badge');
  if (badges.length !== 1) out.push('badges ' + badges.length + ' (want 1: the name)');
  const r = c.querySelector('.ob-drills__readout');
  if (!r) { out.push('readout missing'); return out; }
  const cs = getComputedStyle(r);
  if (cs.textTransform !== 'none') out.push('readout caps literal ' + cs.textTransform);
  if ((parseFloat(cs.borderTopLeftRadius) || 0) >= r.getBoundingClientRect().height / 2) out.push('readout pill radius');
  for (const el of [...badges, r]) {
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push('clipped: ' + el.textContent.slice(0, 24));
    if (getComputedStyle(el).textOverflow === 'ellipsis') out.push('ellipsis: ' + el.textContent.slice(0, 24));
  }
  for (const seg of r.querySelectorAll('.seg')) if (seg.getClientRects().length > 1) out.push('atom broke: ' + seg.textContent);
  // CUT LAW (S5 slice 4 verifier round 1, P1-c): the strip box crops at its
  // cap and #hud crops at the band — scrollWidth on the READOUT never saw a
  // crop by an ANCESTOR (667×375: the readout's own box ran 32 px past the
  // strip's live cap, "Score (" cut mid-glyph, this walker green). Every
  // glyph rect of the badge and the readout must sit inside the clip rect =
  // the intersection of every overflow-clipping ancestor's padding box and
  // the viewport.
  let clip = { l: 0, t: 0, r: innerWidth, b: innerHeight };
  for (let a = c; a && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if ((s.overflowX !== 'visible' || s.overflowY !== 'visible') && a.getClientRects().length) {
      const b = a.getBoundingClientRect();
      const box = { l: b.left + parseFloat(s.borderLeftWidth), t: b.top + parseFloat(s.borderTopWidth),
        r: b.right - parseFloat(s.borderRightWidth), b: b.bottom - parseFloat(s.borderBottomWidth) };
      clip = { l: Math.max(clip.l, box.l), t: Math.max(clip.t, box.t), r: Math.min(clip.r, box.r), b: Math.min(clip.b, box.b) };
    }
  }
  const glyphRects = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const rs = []; const range = document.createRange();
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim()) continue; range.selectNodeContents(n);
      for (const q of range.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rs.push(q); }
    return rs;
  };
  for (const el of [...badges, r]) {
    // a text rect is the inline box's CONTENT AREA (ascent + descent): under
    // a tight line-height it overhangs the line box by the negative half-
    // leading on each side (14 px / 16.8 tight: ~0.9 px) with no ink there —
    // the vertical tolerance is that overhang; the horizontal law stays 0.5
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    for (const q of glyphRects(el)) {
      const vt = Math.max(0.5, Number.isFinite(lh) ? (q.height - lh) / 2 + 0.5 : 0.5);
      if (q.left < clip.l - 0.5 || q.right > clip.r + 0.5 || q.top < clip.t - vt || q.bottom > clip.b + vt) {
        out.push('cut: "' + el.textContent.slice(0, 40) + '" glyph rect ' + q.left.toFixed(1) + '..' + q.right.toFixed(1) + ' × ' + q.top.toFixed(1) + '..' + q.bottom.toFixed(1)
          + ' outside clip ' + clip.l.toFixed(1) + '..' + clip.r.toFixed(1) + ' × ' + clip.t.toFixed(1) + '..' + clip.b.toFixed(1)); break;
      }
    }
  }
  const lines = new Set([...r.querySelectorAll('.seg')].map((s) => Math.round(s.getBoundingClientRect().top))).size;
  const coarse = matchMedia('(pointer: coarse) and (max-width: 1023.98px)').matches;
  // the small phone (≤ 700 px, drills.css tight-phone fit) holds the readout's
  // two-row form; every other coarse register keeps the single-row law
  const tight = coarse && matchMedia('(max-width: 700px)').matches;
  if (coarse && !tight ? lines !== 1 : lines > 2) out.push('line boxes ' + lines + (tight ? ' (tight phone: ≤ 2)' : ''));
  return out;
})()`;

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

// ---- helpers ----------------------------------------------------------------
function watch(chrome, consoleErrors, consoleLogs) {
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
}
// load-tolerance knob (the e2e-userboot OB_E2E_READY_TRIES precedent):
// heavily loaded boxes can stretch the wasm+WebGL boot past the default
// 40 s budget — raise the env, never the default.
const READY_TRIES = Number(process.env.OB_E2E_READY_TRIES ?? 200);
async function waitReady(chrome, what = 'app') {
  let ready = false;
  for (let i = 0; i < READY_TRIES && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error(`${what} never became ready`);
}
async function waitDrills(chrome) {
  let ok = false;
  for (let i = 0; i < 50 && !ok; i++) {
    await sleep(200);
    ok = await chrome.eval('typeof window.__drills?.start === "function"');
  }
  if (!ok) throw new Error('__drills seam never installed');
}
// the settle poll snapshots state + judgment + banner in ONE page eval:
// a terminal edge is followed by fold-resetting continuations (flow's
// 2.6 s WIN re-rack; a drill runner's own 1.3 s fresh frame — arm s5),
// which null the judgment surface, so under load a separate post-settle
// read can land after that beat (GH-344; the e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner } at the settle edge
async function settle(chrome, tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 150 && (settled.state === 'PLAYBACK' || settled.state === 'SIMULATING'); i++) {
    await sleep(400);
    settled = await chrome.eval(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}
// ghost-ball aim: pure geometry from LIVE kernel facts (pockets + poses via
// the read surfaces) — the same aiming a player does, no physics re-derived
const aimJs = (obId, pocketI) => `(() => {
  const k = (b) => ({ x: b.pos[2], y: b.pos[0] });
  const balls = __test.balls();
  const cue = k(balls.find((b) => b.id === 0));
  const ob = k(balls.find((b) => b.id === ${obId}));
  const p = window.__rules.pockets()[${pocketI}];
  const r = window.__drills.ballR();
  const n = Math.hypot(p.x - ob.x, p.y - ob.y);
  const gx = ob.x - ((p.x - ob.x) / n) * 2 * r;
  const gy = ob.y - ((p.y - ob.y) / n) * 2 * r;
  return Math.atan2(gy - cue.y, gx - cue.x);
})()`;
async function fire(chrome, tag, params) {
  const err = await chrome.eval(`__test.shoot(${JSON.stringify(params)})`);
  if (err) fail(`${tag} shoot rejected: ${err}`);
  return settle(chrome, tag);
}
async function fireAt(chrome, tag, obId, pocketI, extra) {
  const phi = await chrome.eval(aimJs(obId, pocketI));
  return fire(chrome, tag, { phi, theta: 0, a: 0, ...extra });
}
const RELAY_MS = 2300; // drills.js NEXT_MS (1400) + margin for the re-lay

// ---- main run ---------------------------------------------------------------
const consoleErrors = [], consoleLogs = [];
let chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP });
watch(chrome, consoleErrors, consoleLogs);
const sawLog = (s) => consoleLogs.some((l) => l.includes(s));

// second boot handle for the determinism arm + stale-module servers (cleanup)
let chromeB = null;
/** Static file responder (mime map shared by every arm server). `before`
 * runs AFTER the file resolved — a genuine 404 can never hang on it. */
const serveFile = async (rel, res, { before } = {}) => {
  try {
    const p = path.join(webDir, path.normalize(rel).replace(/^\/+/, ''));
    const body = await readFile(p);
    if (before) await before();
    const mime = { '.html': 'text/html', '.js': 'text/javascript',
      '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
    }[path.extname(p)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
};
/** Static server that 404s any path ending in `blocked` (stale-cache arms). */
const blockServerFor = (blocked) => createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith(blocked)) { res.writeHead(404); res.end(); return; }
  serveFile(rel, res);
});
const blockServer = blockServerFor('/ui/dialog.js');
const PORT3 = PORT + 2; // stale games/layouts.js arm (issue #80, arm s7)
const blockServer2 = blockServerFor('/games/layouts.js');
// arm s2 (issue #80 review finding 2): a server that serves everything
// immediately but HOLDS /games/layouts.js until released — a deterministic
// healthy-but-SLOW leaf, so the immediate tap under test provably races a
// PENDING import, never a rejected one.
const PORT4 = PORT + 3;
let releaseLayouts = () => {};
let layoutsHeld = true;
const layoutsGate = new Promise((r) => {
  releaseLayouts = () => { layoutsHeld = false; r(); };
});
const slowServer = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  serveFile(rel, res, rel.endsWith('/games/layouts.js') && layoutsHeld
    ? { before: () => layoutsGate } : undefined);
});

try {
  await waitReady(chrome);
  await waitDrills(chrome);

  // ---- arm 0: hermetic virgin boot — zero localStorage keys ----------------
  const lsKeys = await chrome.eval('JSON.stringify(Object.keys(localStorage))');
  if (lsKeys !== '[]') fail(`virgin profile not hermetic: localStorage carries ${lsKeys}`);

  // ---- arm 1: base-seed registry honesty (audit-on-load law) ---------------
  const list = await chrome.eval('window.__drills.list()');
  if (list.length < 10) fail(`starter set too small: ${list.length} drills`);
  for (const d of list) {
    const digest = createHash('sha256').update(d.corpus, 'ascii').digest();
    const want = '0x' + digest.subarray(0, 8).toString('hex').toUpperCase();
    if (want !== d.base) {
      fail(`base seed drift for ${d.id}: published ${d.base}, derived ${want}`);
    }
  }

  if (!FASTLANE) { // GH-1078: arm 2 not in the --fastlane subset
  // ---- arm 2: picker + pill + widest-locale truncation probe ---------------
  // the help pill (024, dynamic leaf like drills) anchors the visual-order
  // assert — wait for it briefly so a slow leaf import can't flake the arm
  for (let i = 0; i < 25 && !(await chrome.eval(
    '!!document.getElementById("ob-help")')); i++) await sleep(200);
  // the pill's flex order rides ui/drills.css (a LEAF sheet loaded after
  // install) — on a loaded box the stylesheet can lag the pill itself, so
  // poll for the computed order briefly too (bounded: a genuinely missing
  // order rule still snapshots '0' below and fails the assert)
  for (let i = 0; i < 25 && (await chrome.eval(`(() => {
    const p = document.getElementById('ob-drills');
    return p ? getComputedStyle(p).order : '';
  })()`)) !== '6'; i++) await sleep(200);
  const pill = await chrome.eval(`(() => {
    const p = document.getElementById('ob-drills');
    if (!p) return null;
    const help = document.getElementById('ob-help');
    return { tb: p.dataset.tbOrder, inToolbar: p.parentElement?.id,
      order: getComputedStyle(p).order,
      x: p.getBoundingClientRect().left,
      helpX: help ? help.getBoundingClientRect().left : null };
  })()`);
  if (!pill || pill.tb !== '6' || pill.inToolbar !== 'ob-toolbar') {
    fail('drills pill missing or mis-slotted: ' + JSON.stringify(pill));
  }
  // app.html pins flex order 1..5 on the five sibling pills; without the
  // drills.css order rule this pill computes order 0 and renders LEFTMOST
  // (visual vs DOM/tab order inverted — review finding 1)
  if (pill && pill.order !== '6') {
    fail(`drills pill computed flex order '${pill.order}' != '6' (renders out of slot)`);
  }
  if (pill && (pill.helpX === null || !(pill.x > pill.helpX))) {
    fail('drills pill does not render right of the help pill: ' + JSON.stringify(pill));
  }
  await chrome.eval('window.__drills.open()');
  await sleep(400);
  if (!(await chrome.eval('window.__drills.isOpen()'))) fail('picker did not open');
  const cards = await chrome.eval(
    'document.querySelectorAll("#ob-drills-panel .ob-drills__card").length');
  if (cards !== list.length) fail(`picker cards ${cards} != drills ${list.length}`);
  // issue #119: cards are GROUPED by difficulty tier — the section headings
  // render (expert = the challenge category) and are additive (card count
  // unchanged). The headings join the ×7 no-truncation probe below.
  const tierHeads = await chrome.eval(`(() => {
    const hs = [...document.querySelectorAll('#ob-drills-panel .ob-drills__tier')];
    return { count: hs.length, keys: hs.map((h) => h.dataset.i18n).join(',') };
  })()`);
  if (tierHeads.count < 3 || !tierHeads.keys.includes('drills.tier.expert')
    || !tierHeads.keys.includes('drills.tier.intermediate')) {
    fail('picker tier grouping missing/incomplete: ' + JSON.stringify(tierHeads));
  }
  // #81 finding 5: on the POOL table every snooker drill card must declare
  // the persisted table switch (the #80 pin), while in-discipline cards
  // stay unlabeled — pre-fix a snake tap silently switched + persisted.
  const reqBadge = (id) => chrome.eval(`(() => {
    const el = document.querySelector('#ob-drills-panel [data-req="${id}"]');
    return el ? { display: getComputedStyle(el).display,
      text: el.textContent } : null;
  })()`);
  const snakeReq = await reqBadge("colours-clear");
  if (!snakeReq || snakeReq.display === 'none' || !snakeReq.text.length) {
    fail('snake card lacks the discipline-switch requirement badge: '
      + JSON.stringify(snakeReq));
  }
  const poolReq = await reqBadge('bu-f2');
  if (!poolReq || poolReq.display !== 'none') {
    fail('in-discipline bu-f2 card must NOT carry a requirement badge: '
      + JSON.stringify(poolReq));
  }
  // issue #80: the widest-locale pair grew to the FULL seven — the snooker
  // category badge + snake card names must never ellipsize in any locale
  // (#81: the requirement badge joins the probe — it is live on this
  // pool-table boot and must wrap, never clip, in every locale)
  for (const loc of ['de', 'fr', 'es', 'ja', 'ko', 'zh-CN', 'en']) {
    await chrome.eval(`window.__settings.set('language', '${loc}')`);
    await sleep(400);
    const bad = await chrome.eval(`(() => {
      const out = [];
      for (const el of document.querySelectorAll(
        '#ob-drills-panel .ob-drills__name, #ob-drills-panel .ob-drills__fam,'
        + ' #ob-drills-panel .ob-drills__req, #ob-drills-panel .ob-drills__tier,'
        + ' #ob-drills-panel h2, #ob-drill-chips .ob-badge, #ob-drill-chips .ob-drills__readout')) {
        if (el.scrollWidth > el.clientWidth + 1) out.push(el.textContent.slice(0, 24));
      }
      return out;
    })()`);
    if (bad.length) fail(`truncated picker labels [${loc}]: ${bad.join(', ')}`);
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  await chrome.eval('window.__drills.close()');
  await sleep(400);
  if (await chrome.eval('window.__drills.isOpen()')) fail('picker did not close');

  } // !FASTLANE (arm 2)

  // ---- arm 3: determinism — layout JSON byte-identical across boots --------
  // (issue #80: the snake layout is byte-compared too, composed PRE-START
  // on the POOL table — the SNOOKER_LAYOUT ctx is active-table-independent)
  const layoutA = await chrome.eval(
    'JSON.stringify(window.__drills.layout("bu-f2", 0))');
  const snakeLayoutA = await chrome.eval(
    'JSON.stringify(window.__drills.layout("colours-clear", 0))');
  if (snakeLayoutA === 'null') fail('snake layout unavailable on a healthy boot');
  chromeB = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
    { port: CDP + 1 });
  await waitReady(chromeB, 'boot B');
  await waitDrills(chromeB);
  const layoutB = await chromeB.eval(
    'JSON.stringify(window.__drills.layout("bu-f2", 0))');
  if (layoutA !== layoutB) fail('bu-f2 layout not byte-identical across boots');
  const snakeLayoutB = await chromeB.eval(
    'JSON.stringify(window.__drills.layout("colours-clear", 0))');
  if (snakeLayoutA !== snakeLayoutB) {
    fail('snake layout not byte-identical across boots');
  }
  // issue #119: the new pool challenge drills' layouts are byte-identical
  // across boots too (progressive probed at N=0 → the deterministic floor
  // rack; ghost10/mighty-x/lineup-called at k=0). rack/penalty/fourteenone
  // carry no per-attempt layout (layout() returns null there). Issue
  // GH-131: the whole lineup family joins the loop — lineup-random pins
  // the seeded LAYOUT_GAMMA shuffle byte-for-byte across boots.
  for (const id of ['lineup-called', 'progressive-lineup', 'ghost10', 'mighty-x',
    'lineup', 'lineup-e2m', 'lineup-m2e', 'lineup-random', 'lineup-lateral',
    'lineup-lat-e2m', 'lineup-lat-m2e', 'lineup-l', 'lineup-l-e2m',
    'lineup-diagonal']) {
    const a119 = await chrome.eval(`JSON.stringify(window.__drills.layout("${id}", 0))`);
    const b119 = await chromeB.eval(`JSON.stringify(window.__drills.layout("${id}", 0))`);
    if (a119 === 'null') fail(`${id} layout unavailable on a healthy boot`);
    if (a119 !== b119) fail(`${id} layout not byte-identical across boots`);
  }
  chromeB.close();
  chromeB = null;

  let st = null; // the drill state the bu-f2 / circle / dock arms reassign (hoisted out of the !FASTLANE blocks)
  let circleScore = null; // arm 6's persisted circle score, re-read by arm 9 after the reload
  if (!FASTLANE) { // GH-1078: arms 4-8 not in the --fastlane subset
  // ---- arm 4: bu-f2 BU ladder — advance on pass, retreat on miss -----------
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('bu-f2 start refused');
  await sleep(300);
  if (!sawLog('[drills] start {"id":"bu-f2"}')) fail('start mirror not printed');
  // GH-668 S5 slice 4 G6 (B-PR08 / B-K16 / B-K15): the LIVE dock's buttons
  // are kit toolbar carriers — the four family classes, the toolbar rung
  // (34 on this fine register), and the voice title === aria-label ===
  // t(key) that re-composes on a locale flip; the kit's fine-guarded hover
  // ladder moves the material under a forced :hover (drills.css draws no
  // circle, hover, ring or coarse 44 of its own any more — A10 / A12 static)
  await chrome.send('DOM.enable'); await chrome.send('CSS.enable');
  const dockVoice = await chrome.eval(DOCK_VOICE_JS);
  const judgeDockVoice = (tag, v, loc) => {
    if (!v || v.length < 3) { fail(`${tag}: live dock has ${v?.length ?? 0} buttons (want opener + Reset + STOP)`); return; }
    for (const b of v) {
      if (!b.kit) fail(`${tag}: ${b.id} is not a kit toolbar carrier: ${b.cls}`);
      if (!b.want || b.want === b.key || b.title !== b.want || b.aria !== b.want) {
        fail(`${tag}: ${b.id} voice title/aria must both be t(${b.key}) [${loc}]: ` + JSON.stringify(b));
      }
      if (Math.abs(b.h - 34) > 0.5 && Math.abs(b.h - 44) > 0.5) fail(`${tag}: ${b.id} height ${b.h} off the toolbar rungs {34, 44}`);
      if (Math.abs(b.w - b.h) > 0.5 || b.radius < b.h / 2 - 0.5) fail(`${tag}: ${b.id} is not the kit circle: ` + JSON.stringify(b));
    }
  };
  judgeDockVoice('arm 2 dock voice', dockVoice, 'en');
  const stopVoice = dockVoice?.find((b) => b.id === 'ob-drill-stop');
  const openVoice = dockVoice?.find((b) => b.id === 'ob-drill-open');
  if (stopVoice && openVoice && stopVoice.color === openVoice.color) {
    fail('arm 2 dock voice: STOP must rest one ink register quieter than the opener (drills.css --ob-text-1 override)');
  }
  const restReg = await forcedRegister(chrome, '#ob-drill-stop', []);
  const hoverReg = await forcedRegister(chrome, '#ob-drill-stop', ['hover']);
  if (!restReg || !hoverReg || restReg === hoverReg) {
    fail('arm 2 dock hover: a forced :hover must move the kit material on the fine register: ' + JSON.stringify({ restReg, hoverReg }));
  }
  await chrome.eval(`window.__settings.set('language', 'de')`);
  await sleep(500);
  const dockVoiceDe = await chrome.eval(DOCK_VOICE_JS);
  judgeDockVoice('arm 2 dock voice', dockVoiceDe, 'de');
  const openDe = dockVoiceDe?.find((b) => b.id === 'ob-drill-open');
  if (openVoice && openDe && openDe.title === openVoice.title) {
    fail('arm 2 dock voice: the opener title did not re-compose on the de flip: ' + JSON.stringify({ en: openVoice.title, de: openDe.title }));
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // staged table matches the published layout exactly (three-frame map:
  // three.x = kernel.y, three.z = kernel.x)
  const pub = JSON.parse(layoutA);
  const staged = await chrome.eval('__test.balls()');
  for (const b of pub.balls) {
    const m = staged.find((s) => s.id === b.id);
    if (!m || Math.abs(m.pos[2] - b.x) > 1e-9 || Math.abs(m.pos[0] - b.y) > 1e-9) {
      fail(`bu-f2 staged ball ${b.id} off the published layout`);
    }
  }
  const visible = staged.filter((s) => !s.pocketed).length;
  if (visible !== pub.balls.length) fail(`bu-f2 staged ${visible} balls, want ${pub.balls.length}`);
  // pass: straight stop shot (pot the 1 in pocket 2, cue dies on the ghost;
  // params probed live — v0 1.6 with a touch of draw stops dead at 1 diamond)
  await fireAt(chrome, 'bu-f2 pass', 1, 2, { v0: 1.6, b: -0.2 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.pos !== 2 || st.streak !== 1 || st.attempt !== 1) {
    fail('bu-f2 pass did not advance the ladder: ' + JSON.stringify(st));
  }
  if (!sawLog('"pass":true')) fail('bu-f2 pass mirror not printed');
  await sleep(RELAY_MS); // next-attempt re-lay (step 2 distance)
  // miss: a soft stroke into empty cloth (no contact → retreat)
  await fire(chrome, 'bu-f2 miss', { v0: 0.45, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.pos !== 1 || st.streak !== 0 || st.attempt !== 2) {
    fail('bu-f2 miss did not retreat the ladder: ' + JSON.stringify(st));
  }
  await chrome.eval('window.__drills.stop()');

  // ---- arm 5: bu-f6 stations + objective-honesty recomputation -------------
  if (!(await chrome.eval('window.__drills.start("bu-f6")'))) fail('bu-f6 start refused');
  await sleep(300);
  await fireAt(chrome, 'bu-f6 s1 pass', 1, 2, { v0: 2.1, b: -0.2 });
  // ONE atomic in-page snapshot, taken IMMEDIATELY at settle detection
  // (load-hardening, journey-QA wave-1 lane): the drill's own NEXT_MS
  // re-lay lands 1400 ms after the settle and RESETS the judgment
  // (game.layout → resetMatch). The old chain — a 600 ms sleep plus four
  // separate CDP round trips (state → events → judgmentJson) — drifted
  // past that window on a loaded CI box and read the reset fold: the
  // 'judgment bytes not legal on the pass' flake. No sleep is needed:
  // settle() can only observe the state leave PLAYBACK after the WHOLE
  // synchronous shotComplete dispatch (flow adjudication + the drill's
  // onSettle bookkeeping) completed — everything the snapshot reads is
  // already written. Same reads, same assertions, one RTT.
  const snap5 = await chrome.eval(`(() => ({
    st: window.__drills.state(),
    events: __test.events(),
    j: window.__rules.judgmentJson() }))()`);
  st = snap5.st;
  if (!st || st.score !== 1 || st.k !== 1) {
    fail('bu-f6 station 1 pass not scored: ' + JSON.stringify(st));
  }
  // objective honesty: recompute the verdict from record + judgment bytes
  const kinds = snap5.events.map((e) => e.kind);
  const potted1 = kinds.some((k) => k?.BallPocket?.ball === 1 && k.BallPocket.pocket === 2);
  const cueDown = kinds.some((k) => k?.BallPocket?.ball === 0 || k?.BallOffTable?.ball === 0);
  const firstBB = kinds.find((k) => k?.BallBall
    && (k.BallBall.b1 === 0 || k.BallBall.b2 === 0))?.BallBall;
  const firstContact = firstBB ? (firstBB.b1 === 0 ? firstBB.b2 : firstBB.b1) : null;
  const j = JSON.parse(snap5.j);
  const recomputed = potted1 && !cueDown && firstContact === 1 ? 1 : 0;
  if (recomputed !== 1) fail('honesty: record bytes disagree with the scored pass');
  if (!j || j.legal !== true) fail('honesty: judgment bytes not legal on the pass');
  await sleep(RELAY_MS);
  await fire(chrome, 'bu-f6 s2 miss', { v0: 0.45, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.score !== 1 || st.k !== 2) {
    fail('bu-f6 station 2 miss mis-scored: ' + JSON.stringify(st));
  }
  await chrome.eval('window.__drills.stop()');

  // ---- arm 6: circle run — pot counts, containment miss ends + persists ----
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail('circle start refused');
  await sleep(300);
  const circleBalls = (await chrome.eval('__test.balls()'))
    .filter((b) => !b.pocketed).length;
  if (circleBalls !== 16) fail(`circle staged ${circleBalls} balls, want 16`);
  await fireAt(chrome, 'circle pass', 5, 2, { v0: 1.8, b: -0.28 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.score < 1 || st.done) fail('circle pass not counted: ' + JSON.stringify(st));
  circleScore = st.score;
  await sleep(RELAY_MS); // rest-position re-lay (run continues)
  // miss: send the cue out through the head-side gap — run ends
  await fire(chrome, 'circle exit', { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done || st.score !== circleScore) {
    fail('circle exit did not end the drill: ' + JSON.stringify(st));
  }
  if (!sawLog('[drills] complete')) fail('circle complete mirror not printed');
  // issue #79 defect 1: completion tears ALL drill chrome down at the
  // settle (the banner + picker best line carry the score; the state()
  // wire stays readable via the finished snapshot asserted above)
  const doneDom = await chrome.eval(`(() => ({
    stop: !!document.getElementById('ob-drill-stop'),
    chips: document.getElementById('ob-drill-chips')?.childElementCount ?? -1,
  }))()`);
  if (doneDom.stop || doneDom.chips !== 0) {
    fail('completion left drill chrome up: ' + JSON.stringify(doneDom));
  }
  // #81 finding 6: a mid-hold locale switch recomposes the LIVE drill text
  // — the held completion banner AND the reason hint re-render in the new
  // language (pre-fix both kept the old language until the hold/hint died).
  // Load-hardening (journey-QA wave-1 lane): the switch fetches the locale
  // json ASYNCHRONOUSLY — a fixed 400 ms sleep raced it on a loaded CI box
  // and probed a still-English page (or, worse, drifted past the hold's
  // 5.7 s end). Poll for the LANDED locale instead (the e2e-playback
  // 16m-(s) precedent; recompose is synchronous with the locale flip).
  const waitLocale6 = async (loc) => {
    for (let i = 0; i < 40; i++) {
      if (await chrome.eval(`window.__i18n?.locale?.() === '${loc}'`)) return;
      await sleep(150);
    }
  };
  await chrome.eval(`window.__settings.set('language', 'de')`);
  await waitLocale6('de');
  const deText = await chrome.eval(`(() => { const t = window.__i18n.t;
    const reasons = ['miss', 'pocket', 'contact', 'scratch', 'cushion', 'crash', 'zone', 'norail', 'exit', 'foul'].map((r) => t('drills.reason.' + r));
    const e = ${END_STATE};
    return { ...e,
      hint: document.getElementById('hud-hint').textContent,
      hintUp: document.getElementById('hud-hint').style.display === 'block',
      // GH-668 S5 slice 4 round 10 (review r2 P2-3): the sentence verdict lives under drills.endRunEnded;
      // the legacy key is the pre-change interpolated template again (a stale dictionary keeps the legacy read)
      reasoned: reasons.some((r) => e.body === (window.__i18n.keys().includes('drills.endRunEnded') ? t('drills.endRunEnded') : t('drills.runEndedBanner')) + ' — ' + r),
      name: t('drills.name.circle') }; })()`);
  // issue #209 (Bug-1 labeling): the circle run ended at 1/15 (a containment
  // miss short of the 15-ball goal), so it holds the RUN ENDED verdict
  // ("Lauf beendet"), not the full-clear DRILL COMPLETE — the recompose still
  // re-renders BOTH notice lines in the new language (GH-668 B-PR05: the
  // title carries name · score, the body the verdict + the fail reason —
  // the reason rides the notice, so #hud-hint paints NO drills hint for the
  // ending settle: one message per settle, R11)
  if (!deText.up || !deText.body.includes('Lauf beendet') || !deText.reasoned) {
    fail('held notice did not recompose on the locale switch: ' + JSON.stringify(deText));
  }
  if (!deText.title.includes(deText.name) || !/\b1\/15\b/.test(deText.title)) {
    fail('notice title is not "{name} · {score}/{max}" in de: ' + deText.title);
  }
  if (deText.hintUp && deText.hint.includes('Verfehlt')) {
    fail('the ending settle painted the per-shot fail hint beside the notice (two messages): ' + deText.hint);
  }
  if (deText.held) { /* the hold marks the NOTICE (touch.css hint-yield seam) */ } else {
    fail('hold window lost the .ob-drills-banner mark on the notice');
  }
  if (deText.banner !== '') fail('#banner carried text under the hold (de leg): ' + deText.banner);
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await waitLocale6('en'); // same landed-locale poll as the de leg
  // finding-5b guard + #81 finding 4: this completion routed through
  // BALL_IN_HAND (the exit stroke is a no-contact foul), so flow armed a
  // 1800 ms banner clear on the SAME routing. The hold-through wrap must
  // swallow it SEAMLESSLY — a 100 ms display poll across the whole clear
  // window replaces the old single probe at 3.2 s, which slept exactly
  // over the ~0.9 s blink the pre-fix re-assert chain left.
  // IN-PAGE poll (load-hardening, journey-QA wave-1 lane): the hold ends
  // LEGITIMATELY at FLOW_BANNER_MS + BANNER_MS = 5.7 s after complete().
  // The old per-sample CDP round trips stretched the 21x100 ms window by
  // ~21 RTTs on a loaded CI box, drifting the tail PAST the hold end and
  // reading the honest clear as a 'blink' (monotonic 1→0 tail — never the
  // pre-#81 1→0→1 gap shape). One eval, wall-clock 100 ms cadence inside
  // the page; the samples and the assertion are unchanged.
  const blink = await chrome.eval(`(async () => {
    const out = [], leak = [];
    for (let i = 0; i < 21; i++) { // ~1.6 s → ~3.7 s after the settle
      out.push(document.getElementById('ob-drill-end')?.style.display ?? 'absent');
      const b = document.getElementById('banner');
      if (b.textContent !== '' || b.style.display === 'block') leak.push(i + ':' + b.textContent.slice(0, 24));
      await new Promise((r) => setTimeout(r, 100));
    }
    return { out, leak }; })()`);
  if (blink.out.includes('none') || blink.out.includes('absent')) {
    fail('drill-end notice blinked during the hold: '
      + blink.out.map((s) => (s === 'block' ? 1 : 0)).join(''));
  }
  // GH-668 B-PR05 red leg: #banner (flow's caps register) is EMPTY for the
  // whole hold — the verdict never rides it and flow's foul text never
  // comes back over the notice
  if (blink.leak.length) fail('#banner carried text under the hold: ' + blink.leak.join(' | '));
  // the notice IS the kit notice register: sentence case (no caps
  // transform), the body role at 14 px, the solid rung, the info top edge,
  // the 60ch measure on its lines — read off computed styles against
  // probes that resolve the same tokens in the same document
  const doneBanner = await chrome.eval(`(() => {
    const e = document.getElementById('ob-drill-end');
    if (!e) return null;
    const t = e.querySelector('.ob-drill-end__title'), b = e.querySelector('.ob-prompt__body');
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;background-color:var(--ob-glass-solid);border-top:1px solid var(--ob-info-line);width:60ch;font:inherit';
    b.appendChild(probe);
    const ps = getComputedStyle(probe);
    const want = { bg: ps.backgroundColor, edge: ps.borderTopColor, ch60: probe.getBoundingClientRect().width };
    probe.remove();
    const es = getComputedStyle(e), ts = getComputedStyle(t), bs = getComputedStyle(b);
    return { display: e.style.display, len: e.textContent.length,
      transform: [ts.textTransform, bs.textTransform], fs: bs.fontSize,
      bg: es.backgroundColor, edge: es.borderTopColor, want,
      width: Math.max(t.getBoundingClientRect().width, b.getBoundingClientRect().width),
      lines: Math.round(b.getBoundingClientRect().height / parseFloat(bs.lineHeight)),
      role: e.getAttribute('role'),
      banner: document.getElementById('banner').textContent };
  })()`);
  if (!doneBanner || doneBanner.display !== 'block' || doneBanner.len === 0) {
    fail('drill-end notice did not survive flow\'s banner-clear timer: '
      + JSON.stringify(doneBanner));
  } else {
    const d = doneBanner;
    if (d.transform.some((x) => x !== 'none') || d.fs !== '14px' || d.role !== 'status') {
      fail('drill-end notice is not the sentence-case body register: ' + JSON.stringify(d));
    }
    if (d.bg !== d.want.bg || d.edge !== d.want.edge) {
      fail('drill-end notice is not on the kit notice rung (--ob-glass-solid / --ob-info-line): ' + JSON.stringify(d));
    }
    if (d.width > d.want.ch60 + 0.5 || d.lines > 2) {
      fail('drill-end notice lines exceed the 60ch / 2-line measure: ' + JSON.stringify(d));
    }
    if (d.banner !== '') fail('#banner carried text at the hold tail: ' + d.banner);
  }
  // GH-200: the blob is v2 — best/plays keyed by {drill_id, assist_mode};
  // this scripted boot never touched the assist axis, so the record lands
  // under the settings default 'standard'
  const blob = JSON.parse(await chrome.eval('localStorage.getItem("ob-drills-v1")') ?? 'null');
  if (!blob || blob.v !== 2 || blob.drills?.circle?.standard?.best !== circleScore) {
    fail('ob-drills-v1 blob missing/wrong after completion: ' + JSON.stringify(blob));
  }
  await chrome.eval('window.__drills.stop()');
  if (await chrome.eval('window.__drills.state()') !== null) {
    fail('stop() after completion did not clear the state() wire');
  }

  // ---- arm 6b: tap-to-dismiss (issue #71) — a USER tap kills the banner
  // AND the FLOW_BANNER_MS re-assert chain: no resurrection at ~2.7 s (the
  // red pre-#71: the chain blindly re-showed the dismissed banner). The
  // no-tap survival path stays pinned by arm 6 above, byte-untouched. -----
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail('6b: circle start refused');
  await sleep(300);
  // complete immediately: the containment exit ends the run (arm-6 recipe)
  await fire(chrome, '6b circle exit', { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  st = await chrome.eval('window.__drills.state()');
  if (!st?.done) fail('6b: circle exit did not complete the drill: ' + JSON.stringify(st));
  // build-4 QA (solo addressee): the completion parks in BALL_IN_HAND and
  // the state line must not address a P2 — practice is a solo mode, the
  // player-rotation copy stays out (flow.ballInHandHintSolo)
  const soloLine = await chrome.eval(
    `document.getElementById('state').textContent`);
  if (/P\d+\s*[:：]/.test(soloLine)) {
    fail(`6b: solo practice completion addresses a player: "${soloLine}"`);
  }
  const tapAt = await chrome.eval(`(() => {
    const b = document.getElementById('ob-drill-end');
    if (!b || b.style.display !== 'block') return null;
    const r = b.getBoundingClientRect(); // notice tap: pass-through + dismiss
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!tapAt) fail('6b: drill-end notice not up before the tap');
  else {
    // a REAL pointer press (eval .click() dispatches no pointerdown and
    // would never exercise the hud.js dismiss listener)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await chrome.send('Input.dispatchMouseEvent',
        { type, x: tapAt.x, y: tapAt.y, button: 'left', clickCount: 1 });
    }
    let gone = false;
    for (let i = 0; i < 10 && !gone; i++) { // poll past the 120 ms exit fade
      await sleep(100);
      gone = (await chrome.eval('document.getElementById("ob-drill-end").style.display')) === 'none';
    }
    if (!gone) fail('6b: tap did not dismiss the drill-end notice');
    await sleep(2600); // past the FLOW_BANNER_MS (2700 ms) re-assert mark
    const re = await chrome.eval('document.getElementById("ob-drill-end").style.display');
    if (re !== 'none') fail('6b: dismissed notice was resurrected by the re-assert chain');
  }
  await chrome.eval('window.__drills.stop()');

  // ---- arm 6c (build-4 QA): merged-badge wrap points are segment-atomic ----
  // ja broke the desktop badge between スコア and its 0/15 value (dangling
  // numeral line — the CJK label ends in a breakable U+0020 before the
  // numeral). Segments ride nowrap <span>s now (drills.css): the badge may
  // still wrap BETWEEN segments (the GH-144 wrap-internally law) but a
  // span never fragments across lines, and textContent stays the joined
  // string byte-identical.
  if (!(await chrome.eval('window.__drills.start("circle")'))) {
    fail('6c: circle start refused');
  }
  await sleep(300);
  for (const loc of ['ja', 'de', 'en']) {
    await chrome.eval(`window.__settings.set('language', '${loc}')`);
    await sleep(400);
    const seg = await chrome.eval(`(() => {
      const strip = document.getElementById('ob-drill-chips');
      const badges = [...strip.querySelectorAll('.ob-badge')];
      const merged = strip.querySelector('.ob-drills__readout');
      if (!merged) return null;
      const spans = [...merged.querySelectorAll('span.seg')];
      const cs = getComputedStyle(merged);
      const r = merged.getBoundingClientRect();
      return { spans: spans.length, badges: badges.length,
        fragmented: spans.filter((s) => s.getClientRects().length > 1)
          .map((s) => s.textContent),
        clipped: merged.scrollWidth > merged.clientWidth + 1
          || merged.scrollHeight > merged.clientHeight + 1,
        joined: / · /.test(merged.textContent),
        // D-readout (GH-668 B-PR05 / B-K21): a readout is not a badge —
        // exactly ONE badge (the name), no pill radius, body register 14 /
        // text-1, tabular digits, ≤ 2 line boxes in the 236 px panel
        radius: parseFloat(cs.borderTopLeftRadius) || 0, h: r.height,
        fs: cs.fontSize, transform: cs.textTransform, nums: cs.fontVariantNumeric,
        lines: new Set(spans.map((s) => Math.round(s.getBoundingClientRect().top))).size };
    })()`);
    if (!seg || seg.spans < 2) {
      fail(`6c: readout lacks segment spans [${loc}]: ${JSON.stringify(seg)}`);
    } else if (seg.fragmented.length) {
      fail(`6c: segment broke across lines [${loc}]: ${seg.fragmented.join(', ')}`);
    } else if (seg.clipped) {
      fail(`6c: readout overflows its box [${loc}] (wrap-not-clip law)`);
    } else if (!seg.joined) {
      fail(`6c: readout lost the ' · ' joins [${loc}]`);
    }
    if (seg && (seg.badges !== 1 || seg.radius >= seg.h / 2 || seg.fs !== '14px'
      || seg.transform !== 'none' || !/tabular-nums/.test(seg.nums) || seg.lines < 1 || seg.lines > 2)) {
      fail(`6c D-readout: the counters are not the one-badge body readout [${loc}]: ${JSON.stringify(seg)}`);
    }
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  await chrome.eval('window.__drills.stop()');

  // ---- arm 7: l-drill — cushion whitelist violation ends the run -----------
  if (!(await chrome.eval('window.__drills.start("l-drill")'))) fail('l-drill start refused');
  await sleep(300);
  await fireAt(chrome, 'l-drill pass', 1, 2, { v0: 2.2, b: -0.35 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.score !== 1 || st.done) fail('l-drill pass not counted: ' + JSON.stringify(st));
  await sleep(RELAY_MS);
  await fire(chrome, 'l-drill cushion', { v0: 1.6, phi: 0, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done || st.score !== 1) {
    fail('l-drill cushion violation did not end the run: ' + JSON.stringify(st));
  }
  await chrome.eval('window.__drills.stop()');

  // ---- arm 8: ghost9 racks — a legal dry break CONTINUES the rack (breaks
  // carry no pot requirement); the post-break foul loses it; an interloping
  // stroke inside the RACK_MS window is VOIDED; the drill advances to rack 2
  // on its own seeded re-rack (rerack mirror + BIH→AIM flip — non-vacuous);
  // Replay inside the next window still re-racks on schedule ------------------
  if (!(await chrome.eval('window.__drills.start("ghost9")'))) fail('ghost9 start refused');
  await sleep(300);
  const rackBalls = (await chrome.eval('__test.balls()'))
    .filter((b) => !b.pocketed).length;
  if (rackBalls !== 10) fail(`ghost9 rack staged ${rackBalls} balls, want 10`);
  // issue #79 defect 2: every ghost rack start is a genuine kitchen break
  // placement — the runner enters the REAL BALL_IN_HAND affordance
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('ghost9 rack 1 did not grant the kitchen break placement');
  }
  await fire(chrome, 'ghost9 weak break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.k !== 0 || st.done) {
    fail('ghost9 legal dry break should continue the rack: ' + JSON.stringify(st));
  }
  // post-break no-contact foul: the ghost takes the rack. flow parks in
  // BALL_IN_HAND with shooting ENABLED — fire an interloping stroke
  // IMMEDIATELY (well inside the 1300 ms RACK_MS window; drill state was
  // already written synchronously at the foul's settle routing)
  await fire(chrome, 'ghost9 foul', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  // GH-436 premise capture (no page traffic — the settle poll already
  // snapshotted the banner at the foul's settle edge): a concrete reason
  // was displayed for THIS foul, arming the fallback contract probed
  // after the re-lay below.
  const foulEdgeBanner = settled.banner;
  await fire(chrome, 'ghost9 interloper', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(300); // console-event delivery slack
  if (!sawLog('"verdict":"lost"')) fail('ghost9 rack mirror not printed');
  // finding-3 assert: the decided-rack latch voided the interloper — the
  // rack tally is UNCHANGED (no second verdict against the decided rack)
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.k !== 1 || st.score !== 0 || st.done) {
    fail('ghost9 interloper re-scored the decided rack: ' + JSON.stringify(st));
  }
  if (!sawLog('[drills] void {"id":"ghost9"}')) {
    fail('ghost9 interloper stroke was not voided');
  }
  // finding-4 assert: the pending seeded re-rack still lands (deferred
  // through the interloper's playback). A dead rack ALSO shows 10 unpocketed
  // balls, so assert re-rack-only effects: the '[drills] rerack' mirror and
  // the judgment() reset (resetMatch nulls it on the {seed} transition) —
  // which distinguishes the fresh rack's kitchen-grant BALL_IN_HAND from
  // the parked post-foul BALL_IN_HAND (whose judgment() is non-null).
  await sleep(1800); // deferred timer fires ≤400 ms after the settle
  if (!sawLog('[drills] rerack {"id":"ghost9","rack":2}')) {
    fail('ghost9 rack-2 rerack mirror not printed — re-rack never landed');
  }
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('ghost9 rack 2 break placement not granted');
  }
  if (await chrome.eval('window.__rules.judgment()') !== null) {
    fail('ghost9 rack 2 not staged (machine still parked post-foul)');
  }
  const rack2 = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (rack2 !== 10) fail('ghost9 did not re-rack for rack 2');
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.k !== 1) fail('ghost9 ended early: ' + JSON.stringify(st));
  // ---- GH-436: the foul banner never degrades to the flow.foulFallback
  // composition ("FOUL — foul") once a concrete reason was displayed for
  // this foul. The drill re-lay resets the judgment surface (the {seed}
  // re-rack nulls lastJudgment) and the kitchen grant's synthetic
  // BALL_IN_HAND makes flow re-assert the banner over an info that
  // carries NO judgment — pre-436 that recomposed from the empty fouls
  // list and painted the fallback for the whole placement window.
  // Contract: the re-asserted banner is either EMPTY or still NAMES the
  // concrete reason (flow.js lastShownFouls cache).
  const g436 = await chrome.eval(`({
    banner: document.getElementById('banner').textContent,
    reason: window.__i18n.t('foul.no-contact'),
    fallback: window.__i18n.t('flow.foulBanner',
      { reason: window.__i18n.t('flow.foulFallback') }) })`);
  if (!foulEdgeBanner.includes(g436.reason)) {
    fail('GH-436 premise: the settle-edge banner never named the foul: "'
      + foulEdgeBanner + '"');
  }
  if (g436.banner === g436.fallback) {
    fail('GH-436: banner degraded to the foulFallback composition after '
      + 'the drill re-lay: "' + g436.banner + '"');
  }
  if (g436.banner !== '' && !g436.banner.includes(g436.reason)) {
    fail('GH-436: post-re-lay banner neither clears nor names the concrete '
      + 'reason: "' + g436.banner + '"');
  }
  console.log('[e2e-drills] arm 8 GH-436 ok (no foulFallback degrade across '
    + 'the drill re-lay)');
  // rack 2: open a second transition window (adaptive: rack 2's seeded
  // micro-gaps could flip the weak break's legality — a break foul loses
  // the rack directly under GHOST_BREAK_FOUL_LOSES, opening the window)
  await fire(chrome, 'ghost9 r2 break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done) fail('ghost9 rack 2 ended early: ' + JSON.stringify(st));
  if (st.k === 1) { // legal break — lose the rack with a no-contact foul
    await fire(chrome, 'ghost9 r2 foul', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    st = await chrome.eval('window.__drills.state()');
  }
  if (!st || st.k !== 2 || st.score !== 0 || st.done) {
    fail('ghost9 rack 2 not lost as scripted: ' + JSON.stringify(st));
  }
  // finding-2 assert: Replay pressed INSIDE the rack-transition window —
  // the pending seeded re-rack survives the replay (timer deferred through
  // PLAYBACK), the drill continues on schedule, rack count stays correct
  await chrome.eval('document.getElementById("replay").click()');
  if (await chrome.eval('__test.state()') !== 'PLAYBACK') {
    fail('ghost9 in-window replay did not start');
  }
  await settle(chrome, 'ghost9 in-window replay');
  await sleep(2200); // deferred re-rack lands ≤400 ms after the replay settles
  if (!sawLog('[drills] rerack {"id":"ghost9","rack":3}')) {
    fail('ghost9 replay inside the window dropped the rack-3 re-rack');
  }
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.k !== 2 || st.score !== 0) {
    fail('ghost9 replay corrupted the run: ' + JSON.stringify(st));
  }
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('ghost9 rack 3 break placement not granted');
  }
  if (await chrome.eval('window.__rules.judgment()') !== null) {
    fail('ghost9 rack 3 not staged after the in-window replay');
  }
  const rack3 = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (rack3 !== 10) fail('ghost9 rack 3 not fully staged');
  // issue #79 counter-assert: the IN-APP replay above never exits the drill
  // — the chip strip (incl. the stop button) must still be up
  if (!(await chrome.eval('!!document.getElementById("ob-drill-stop")'))) {
    fail('in-app replay tore down the drill chrome (it must survive)');
  }
  await chrome.eval('window.__drills.stop()');

  } // !FASTLANE (arms 4-8)

  // ---- arm 11 (issue #79 defect 1): dangling STOP DRILL teardown audit ------
  const drillDom = () => chrome.eval(`(() => ({
    stop: !!document.getElementById('ob-drill-stop'),
    chips: document.getElementById('ob-drill-chips')?.childElementCount ?? -1,
    on: document.getElementById('ob-drill-chips')?.classList.contains('on') ?? false,
  }))()`);
  const stopRect = () => chrome.eval(`(() => {
    const el = document.getElementById('ob-drill-stop');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  const clickAt = async (p) => {
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  async function assertTorn(tag, rect) {
    const dom = await drillDom();
    if (dom.stop || dom.chips !== 0 || dom.on) {
      fail(`${tag}: drill chrome not torn down: ${JSON.stringify(dom)}`);
      return;
    }
    // dead-tap probe: a REAL click where STOP DRILL used to be must do
    // nothing drill-related (button GONE, not merely inert — issue #79)
    const mark = consoleLogs.length;
    await clickAt(rect);
    await sleep(300);
    const leak = consoleLogs.slice(mark).filter((l) => l.includes('[drills]'));
    if (leak.length) fail(`${tag}: dead tap still drill-active: ${leak.join(' | ')}`);
    const stD = await chrome.eval('window.__drills.state()');
    if (stD && stD.done === false) {
      fail(`${tag}: a live run appeared after the dead tap: ${JSON.stringify(stD)}`);
    }
    // the collapsed post-teardown layout may place LEGITIMATE chrome under
    // the probe point: the dock collapses to its opener-only idle register
    // (#120 — the right-anchored #ob-drill-open slides into the rect the
    // STOP/Reset buttons vacated; the old flow.js practice-strip opener
    // chip is retired), and the tap rightfully opens the PICKER — visible,
    // labeled, not a dangling stop.
    // Reset it so the probe leaves no modal state behind for later arms
    // (pre-#81 this was silent: an open picker ate arm 12's placement drag).
    if (await chrome.eval('window.__drills.isOpen()')) {
      await chrome.eval('window.__drills.close()');
      await sleep(300);
    }
  }

  // (a) user stop
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('arm 11a start refused');
  await sleep(300);
  const dom11 = await drillDom();
  let rect11 = await stopRect();
  if (!dom11.stop || !dom11.on || dom11.chips === 0 || !rect11) {
    fail('arm 11a: drill chrome absent while running: ' + JSON.stringify(dom11));
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(150);
  await assertTorn('arm 11a user stop', rect11);

  // (b) silent stop via a FOREIGN rerack — the exact stateChange {seed}
  // signature of the settings game/equipment switch AND of shared-replay
  // entry (share.js gotoShot re-racks on the sender's seed)
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('arm 11b start refused');
  await sleep(300);
  rect11 = await stopRect();
  if (!rect11) fail('arm 11b: no STOP button on re-start');
  let mark11 = consoleLogs.length;
  await chrome.eval('__test.rerack(777)');
  await sleep(300);
  if (!consoleLogs.slice(mark11).some((l) => l.includes('[drills] stop {"id":"bu-f2"}'))) {
    fail('arm 11b: foreign rerack did not silent-stop the drill');
  }
  await assertTorn('arm 11b foreign rerack', rect11);

  // (c) silent stop via a FOREIGN layout (the scripted-capture/staging
  // stateChange {layout} signature)
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('arm 11c start refused');
  await sleep(300);
  rect11 = await stopRect();
  if (!rect11) fail('arm 11c: no STOP button on re-start');
  mark11 = consoleLogs.length;
  await chrome.eval('__test.layout([{ id: 0, x: 0, y: -0.5 }, { id: 1, x: 0, y: 0.5 }])');
  await sleep(300);
  if (!consoleLogs.slice(mark11).some((l) => l.includes('[drills] stop {"id":"bu-f2"}'))) {
    fail('arm 11c: foreign layout did not silent-stop the drill');
  }
  await assertTorn('arm 11c foreign layout', rect11);

  if (!FASTLANE) { // GH-1078: arms 12-21 not in the --fastlane subset
  // ---- arm 12 (issue #79 defect 2): cuePlacement law ------------------------
  await chrome.eval(PAGE_HELPERS_JS); // __tp.projectK (world → CSS px)
  const ballR12 = await chrome.eval('window.__drills.ballR()');
  const kcue = async () => {
    const b = (await chrome.eval('__test.balls()')).find((x) => x.id === 0);
    return { x: b.pos[2], y: b.pos[0] }; // kernel x = three z, kernel y = three x
  };
  const screenK = async (kx, ky) => JSON.parse(await chrome.eval(
    `JSON.stringify(window.__tp.projectK(${kx}, ${ky}, ${ballR12}))`));
  const dragMouse = async (from, to, steps = 8) => {
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
        button: 'left', buttons: 1 });
      await sleep(30);
    }
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(200);
  };
  const obPoses = async () => JSON.stringify((await chrome.eval('__test.balls()'))
    .filter((b) => b.id !== 0 && !b.pocketed).map((b) => b.pos));

  // (a) 'anywhere' (bu-f7 wagon wheel): boots into BALL_IN_HAND; a REAL
  // desktop drag through the aim.js seam places the cue ball, object balls
  // untouched; the retry re-lay re-places the published spot and re-grants
  if (!(await chrome.eval('window.__drills.start("bu-f7")'))) fail('bu-f7 start refused');
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('bu-f7 (anywhere) did not boot into BALL_IN_HAND');
  }
  let cue12 = await kcue();
  const obsBefore = await obPoses();
  const tgt = { x: cue12.x - 0.12, y: cue12.y - 0.35 }; // clear cloth, head side
  await dragMouse(await screenK(cue12.x, cue12.y), await screenK(tgt.x, tgt.y));
  const placed = await kcue();
  if (Math.hypot(placed.x - tgt.x, placed.y - tgt.y) > 0.05) {
    fail(`bu-f7 drag did not place the cue: (${placed.x.toFixed(3)}, `
      + `${placed.y.toFixed(3)}) want ~(${tgt.x.toFixed(3)}, ${tgt.y.toFixed(3)})`);
  }
  if (await obPoses() !== obsBefore) fail('bu-f7 drag disturbed object balls');
  await fire(chrome, 'bu-f7 miss', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(RELAY_MS); // spoke-2 re-lay lands
  const pub7 = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.layout("bu-f7", 1))'));
  const cue7 = pub7.balls.find((b) => b.id === 0);
  cue12 = await kcue();
  if (Math.abs(cue12.x - cue7.x) > 1e-9 || Math.abs(cue12.y - cue7.y) > 1e-9) {
    fail('bu-f7 retry did not re-place the laid cue spot after the drag');
  }
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('bu-f7 retry did not re-grant placement');
  }
  await chrome.eval('window.__drills.stop()');

  // (b) 'fixed' (bu-f2): stays in AIM; the same gesture must NOT move the cue
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('arm 12b start refused');
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'AIM') {
    fail('bu-f2 (fixed) must boot into AIM, not a placement state');
  }
  cue12 = await kcue();
  await dragMouse(await screenK(cue12.x, cue12.y),
    await screenK(cue12.x, cue12.y - 0.3));
  const cueFixed = await kcue();
  if (Math.hypot(cueFixed.x - cue12.x, cueFixed.y - cue12.y) > 1e-9) {
    fail('bu-f2 (fixed): the cue ball moved on a pre-shot drag');
  }
  await chrome.eval('window.__drills.stop()');

  // (c) 'kitchen' (ghost10): the placement affordance clamps behind the head
  // string — x tracks the pointer, y pins at the string, rack undisturbed.
  // (Issue GH-131 retarget: `lineup` moved to the owner's in-hand-ANYWHERE
  // law — arm 16b pins its foot-half placement — so the kitchen-clamp
  // specimen is now ghost10: still 'kitchen', non-null layout(), laid cue
  // on the head spot pt(2,2).)
  if (!(await chrome.eval('window.__drills.start("ghost10")'))) fail('arm 12c start refused');
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('ghost10 (kitchen) did not boot into BALL_IN_HAND');
  }
  const pubL = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.layout("ghost10", 0))'));
  const headY = pubL.balls.find((b) => b.id === 0).y; // pt(2,2) IS the head string
  cue12 = await kcue();
  const obsL = await obPoses();
  await dragMouse(await screenK(cue12.x, cue12.y),
    await screenK(cue12.x + 0.12, headY + 0.6), 10); // deep into the foot half
  const cueL = await kcue();
  if (cueL.y > headY + 1e-6) {
    fail(`ghost10 kitchen clamp breached: cue y ${cueL.y} > head string ${headY}`);
  }
  if (Math.abs(cueL.x - (cue12.x + 0.12)) > 0.05) {
    fail('ghost10 kitchen drag did not track x along the string: ' + cueL.x);
  }
  if (await obPoses() !== obsL) fail('ghost10 drag disturbed the rack');
  await chrome.eval('window.__drills.stop()');

  // ==== arm 15 (issue #120): icon dock + confirm-then-act ====================
  // The PRACTICE DRILLS / STOP DRILL text buttons moved off the aim zone
  // into the drills-owned icon dock (#ob-drill-dock: opener + Reset + STOP).
  // (a) practice-idle dock = the opener alone; a real click opens the picker
  //     with NO confirm (non-destructive law);
  // (b) STOP confirm-then-act: click → [data-ob=confirm] up; Cancel keeps
  //     the run live (chrome up, state untouched); Confirm stops IMMEDIATELY
  //     (stop mirror + full teardown, no further tap);
  // (c) Reset confirm-then-act: mid-run click → Cancel keeps progress;
  //     Confirm re-lays the attempt-0 layout, clears attempt/streak/score
  //     and PRESERVES the persisted ob-drills-v1 record byte-for-byte;
  // (d) the programmatic seams stay confirm-free: window.__drills.reset()
  //     re-lays + re-grants BALL_IN_HAND (bu-f7 'anywhere') with no dialog;
  // (e) geometry: the dock hugs the bottom-right corner, clear of the
  //     table-center aim zone (the cue ball's screen point);
  // (f) settle-vs-confirm race (#120 review finding 2): the run COMPLETES
  //     while a dock confirm is up → the completion teardown cancels the
  //     dialog through its own cancel path (stays-out no-op; held banner +
  //     finished snapshot survive), and a Confirm that still LANDS on the
  //     finished run (cancel path faulted out — the stale-kit degrade)
  //     restarts from the finished snapshot, printing the reset mirror
  //     AFTER the successful start (finding 1's ordering law).
  // (g) GH-133 post-completion register: a completed run keeps ↻ on the
  //     dock (opener + Reset; STOP gone — the #79 law binds STOP alone),
  //     and a real tap restarts IMMEDIATELY with NO confirm (the
  //     confirm-destructive-only law: best persisted, plays bumped once
  //     per completion — never per restart — record byte-preserved across
  //     the restart, superseded completion banner cleared); the live-run
  //     Reset confirm branches stay pinned by leg (c); a foreign stop
  //     (settings changeMode away) nulls `finished` and hides the dock.
  const rect15 = (id) => chrome.eval(`(() => {
    const el = document.getElementById('${id}');
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
      w: r.width, h: r.height, top: r.top, right: r.right, bottom: r.bottom };
  })()`);
  const confirmUp = () => chrome.eval(`(() => {
    const p = document.querySelector('[data-ob="confirm"]');
    return !!p && p.getClientRects().length > 0;
  })()`);
  // (a) practice-idle: opener only, click → picker, no confirm
  if (await chrome.eval(`window.__settings.changeMode('practice')`) !== true) {
    fail('arm 15a: could not enter practice mode');
  }
  await sleep(400);
  const dockIdle = await chrome.eval(`(() => {
    const d = document.getElementById('ob-drill-dock');
    if (!d) return null;
    return { on: d.classList.contains('on'), n: d.childElementCount,
      open: !!document.getElementById('ob-drill-open'),
      stop: !!document.getElementById('ob-drill-stop'),
      reset: !!document.getElementById('ob-drill-reset') };
  })()`);
  if (!dockIdle || !dockIdle.on || dockIdle.n !== 1 || !dockIdle.open
    || dockIdle.stop || dockIdle.reset) {
    fail('arm 15a: idle dock wrong (want opener alone): ' + JSON.stringify(dockIdle));
  }
  const openRect = await rect15('ob-drill-open');
  if (!openRect) fail('arm 15a: opener not measurable');
  await clickAt(openRect);
  await sleep(500);
  if (!(await chrome.eval('window.__drills.isOpen()'))) {
    fail('arm 15a: dock opener did not open the picker');
  }
  if (await confirmUp()) fail('arm 15a: the opener must NOT raise a confirm');
  await chrome.eval('window.__drills.close()');
  await sleep(400);
  // (b) STOP: cancel keeps the run; confirm stops immediately
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('arm 15b start refused');
  await sleep(400);
  const dockLive = await chrome.eval(`(() => {
    const d = document.getElementById('ob-drill-dock');
    return { n: d.childElementCount,
      stop: !!document.getElementById('ob-drill-stop'),
      reset: !!document.getElementById('ob-drill-reset') };
  })()`);
  if (dockLive.n !== 3 || !dockLive.stop || !dockLive.reset) {
    fail('arm 15b: live dock wrong (want opener+reset+stop): ' + JSON.stringify(dockLive));
  }
  // (e) aim-zone clearance: no dock button covers the cue ball's screen
  // point, and the dock rail hugs the viewport edge (bottom-right corner)
  const cue15 = await kcue();
  const cueScr = await screenK(cue15.x, cue15.y);
  const zone15 = await chrome.eval(`(() => {
    const out = [];
    for (const el of document.querySelectorAll('#ob-drill-dock button')) {
      const r = el.getBoundingClientRect();
      out.push({ id: el.id, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    return { btns: out, vw: innerWidth, vh: innerHeight };
  })()`);
  for (const b of zone15.btns) {
    if (cueScr.x >= b.l && cueScr.x <= b.r && cueScr.y >= b.t && cueScr.y <= b.b) {
      fail('arm 15e: dock button covers the cue-ball aim point: ' + JSON.stringify(b));
    }
    if (b.b > zone15.vh || b.t < zone15.vh * 0.6) {
      fail('arm 15e: dock button off the bottom edge band: ' + JSON.stringify(b));
    }
  }
  let stopRect15 = await rect15('ob-drill-stop');
  await clickAt(stopRect15);
  await sleep(400);
  if (!(await confirmUp())) fail('arm 15b: STOP click raised no confirm');
  await chrome.eval(`document.querySelector('[data-ob="confirm-cancel"]').click()`);
  await sleep(500);
  if (await confirmUp()) fail('arm 15b: cancel left the confirm up');
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.id !== 'bu-f2') {
    fail('arm 15b: cancel did not keep the run live: ' + JSON.stringify(st));
  }
  if (!(await chrome.eval('!!document.getElementById("ob-drill-stop")'))) {
    fail('arm 15b: cancel tore the dock down');
  }
  const stopMark15 = consoleLogs.length;
  await clickAt(stopRect15);
  await sleep(400);
  if (!(await confirmUp())) fail('arm 15b: second STOP click raised no confirm');
  await chrome.eval(`document.querySelector('[data-ob="confirm-accept"]').click()`);
  await sleep(500);
  if (!consoleLogs.slice(stopMark15).some((l) => l.includes('[drills] stop {"id":"bu-f2"}'))) {
    fail('arm 15b: confirm did not stop the drill');
  }
  if (await chrome.eval('window.__drills.state()') !== null) {
    fail('arm 15b: state() wire not cleared after the confirmed stop');
  }
  await assertTorn('arm 15b confirmed stop', stopRect15);
  // (c) Reset: cancel keeps progress; confirm re-lays attempt 0, best intact
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) fail('arm 15c start refused');
  await sleep(400);
  await fireAt(chrome, 'arm 15c pass', 1, 2, { v0: 1.6, b: -0.2 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.attempt !== 1 || st.pos !== 2) {
    fail('arm 15c: staging pass did not advance: ' + JSON.stringify(st));
  }
  await sleep(RELAY_MS); // the step-2 re-lay lands — stable mid-run state
  const bestsBefore15 = await chrome.eval('JSON.stringify(window.__drills.bests())');
  const resetRect15 = await rect15('ob-drill-reset');
  if (!resetRect15) fail('arm 15c: no Reset button on the live dock');
  await clickAt(resetRect15);
  await sleep(400);
  if (!(await confirmUp())) fail('arm 15c: Reset click raised no confirm');
  await chrome.eval(`document.querySelector('[data-ob="confirm-cancel"]').click()`);
  await sleep(500);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.attempt !== 1 || st.pos !== 2) {
    fail('arm 15c: cancel discarded the run progress: ' + JSON.stringify(st));
  }
  const resetMark15 = consoleLogs.length;
  await clickAt(resetRect15);
  await sleep(400);
  if (!(await confirmUp())) fail('arm 15c: second Reset click raised no confirm');
  await chrome.eval(`document.querySelector('[data-ob="confirm-accept"]').click()`);
  await sleep(1200); // start() re-runs the pins + rerack + attempt-0 re-lay
  if (!consoleLogs.slice(resetMark15).some((l) => l.includes('[drills] reset {"id":"bu-f2"}'))) {
    fail('arm 15c: reset mirror not printed');
  }
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.attempt !== 0 || st.pos !== 1 || st.streak !== 0
    || st.score !== 0) {
    fail('arm 15c: confirm did not reset the run to the opening state: '
      + JSON.stringify(st));
  }
  // the staged table is byte-back on the published attempt-0 layout
  const pub15 = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.layout("bu-f2", 0))'));
  const staged15 = await chrome.eval('__test.balls()');
  for (const b of pub15.balls) {
    const m = staged15.find((s) => s.id === b.id);
    if (!m || Math.abs(m.pos[2] - b.x) > 1e-9 || Math.abs(m.pos[0] - b.y) > 1e-9) {
      fail(`arm 15c: reset ball ${b.id} off the attempt-0 layout`);
    }
  }
  if (await chrome.eval('JSON.stringify(window.__drills.bests())') !== bestsBefore15) {
    fail('arm 15c: reset touched the persisted bests');
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(300);
  // (d) programmatic reset: confirm-free, BIH re-grant where the drill
  // grants placement (bu-f7 'anywhere')
  if (!(await chrome.eval('window.__drills.start("bu-f7")'))) fail('arm 15d start refused');
  await sleep(400);
  await fire(chrome, 'arm 15d miss', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.attempt !== 1) fail('arm 15d: staging miss not scored: ' + JSON.stringify(st));
  const resetP15 = chrome.eval('window.__drills.reset()').catch(() => null);
  await sleep(400);
  if (await confirmUp()) {
    fail('arm 15d: programmatic reset() must NEVER raise a confirm');
  }
  await resetP15;
  await sleep(800);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.attempt !== 0 || st.done) {
    fail('arm 15d: programmatic reset did not restart the run: ' + JSON.stringify(st));
  }
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('arm 15d: reset did not re-grant the in-hand placement');
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(300);

  // (f) settle-vs-confirm race (#120 review finding 2). Both legs stage the
  // arm-6b one-shot completion (circle: the containment exit ends the run
  // at settle) and raise the dock confirm WHILE the shot flies.
  const bannerHeld15f = () => chrome.eval(`(() => {
    const b = document.getElementById('ob-drill-end');
    return !!b && b.style.display === 'block'
      && b.classList.contains('ob-drills-banner');
  })()`);
  // f1 — STOP confirm up when the in-flight shot completes: the completion
  // teardown CANCELS the dialog (its own cancel path → stays-out no-op).
  // Pre-fix red: the dialog dangled over the finished run, and its Confirm
  // ran stop() on active=null — wiping the HELD completion banner and the
  // finished state() snapshot.
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail('arm 15f start refused');
  await sleep(400);
  const stopRect15f = await rect15('ob-drill-stop');
  if (!stopRect15f) fail('arm 15f: no STOP button on the live dock');
  const err15f = await chrome.eval(
    '__test.shoot({ v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err15f) fail('arm 15f shoot rejected: ' + err15f);
  await clickAt(stopRect15f); // raise the confirm while the shot flies
  let up15f = false; // tight poll: the dialog opens synchronously on click,
  for (let i = 0; i < 10 && !up15f; i++) { // the settle must not beat us
    await sleep(50);
    up15f = await confirmUp();
  }
  if (!up15f) fail('arm 15f: STOP click raised no confirm mid-flight');
  const mark15f = consoleLogs.length;
  await settle(chrome, 'arm 15f');
  await sleep(600); // complete() runs inside the settle dispatch
  if (!consoleLogs.slice(mark15f).some((l) => l.includes('[drills] complete {"id":"circle"'))) {
    fail('arm 15f: staging shot did not complete the run');
  }
  if (await confirmUp()) {
    fail('arm 15f: completion left the STOP confirm dangling (not auto-canceled)');
  }
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done) {
    fail('arm 15f: finished snapshot lost after the race: ' + JSON.stringify(st));
  }
  if (!(await bannerHeld15f())) {
    fail('arm 15f: held completion banner did not survive the race');
  }
  if (consoleLogs.slice(mark15f).some((l) => l.includes('[drills] stop'))) {
    fail('arm 15f: the canceled confirm still stopped the finished run');
  }
  // f2 — a Confirm that LANDS after completion must honor the confirmed
  // restart. Deterministic schedule: with the auto-cancel in place the
  // accept click either precedes complete() (act runs on the live run) or
  // follows the cancel (dialog gone), so the post-completion landing is
  // forced by FAULT-INJECTING the cancel path away (remove the dialog's
  // cancel button — the stale-kit degrade cancelPendingConfirm tolerates
  // via ?.click()): the dialog now survives complete(), and the accept
  // click resolves TRUE on a finished run. Green: restart from the
  // finished snapshot (fresh attempt-0 run, '[drills] reset' AFTER
  // '[drills] start' — finding 1's ordering law). Pre-fix red: reset()
  // saw active === null and silently dropped the user's confirmed intent.
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail('arm 15f2 start refused');
  await sleep(400);
  const resetRect15f = await rect15('ob-drill-reset');
  if (!resetRect15f) fail('arm 15f2: no Reset button on the live dock');
  const err15f2 = await chrome.eval(
    '__test.shoot({ v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err15f2) fail('arm 15f2 shoot rejected: ' + err15f2);
  await clickAt(resetRect15f);
  let up15f2 = false;
  for (let i = 0; i < 10 && !up15f2; i++) {
    await sleep(50);
    up15f2 = await confirmUp();
  }
  if (!up15f2) fail('arm 15f2: Reset click raised no confirm mid-flight');
  await chrome.eval( // fault injection: the cancel path dies under the dialog
    `document.querySelector('[data-ob="confirm-cancel"]')?.remove()`);
  const mark15f2 = consoleLogs.length;
  await settle(chrome, 'arm 15f2');
  await sleep(600);
  if (!consoleLogs.slice(mark15f2).some((l) => l.includes('[drills] complete {"id":"circle"'))) {
    fail('arm 15f2: staging shot did not complete the run');
  }
  if (!(await confirmUp())) {
    fail('arm 15f2: cancel-path fault injection did not hold the dialog open');
  }
  await chrome.eval(`document.querySelector('[data-ob="confirm-accept"]')?.click()`);
  await sleep(1200); // the confirmed restart rides start(): rerack + attempt-0 re-lay
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.id !== 'circle' || st.attempt !== 0 || st.score !== 0) {
    fail('arm 15f2: post-completion Confirm did not restart from the finished '
      + 'snapshot: ' + JSON.stringify(st));
  }
  const tail15f2 = consoleLogs.slice(mark15f2);
  const iStart15f2 = tail15f2.findIndex((l) => l.includes('[drills] start {"id":"circle"}'));
  const iReset15f2 = tail15f2.findIndex((l) => l.includes('[drills] reset {"id":"circle"}'));
  if (iStart15f2 === -1 || iReset15f2 === -1 || iReset15f2 < iStart15f2) {
    fail(`arm 15f2: reset mirror must follow the successful start `
      + `(start@${iStart15f2}, reset@${iReset15f2})`);
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(300);

  // (g) GH-133 — the post-completion register. Pre-fix red: renderDock
  // collapsed a completed run to the opener alone (Reset lived on the
  // live-`active` register only) and the reset handler's `if (!active)
  // return` made any surviving ↻ a dead tap — the player had to reopen the
  // picker to play again.
  const bests15gPre = await chrome.eval('JSON.stringify(window.__drills.bests())');
  const plays15g0 = JSON.parse(bests15gPre).circle?.plays ?? 0;
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail('arm 15g start refused');
  await sleep(400);
  await fire(chrome, 'arm 15g circle exit',
    { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600); // complete() runs inside the settle dispatch
  st = await chrome.eval('window.__drills.state()');
  if (!st?.done) fail('arm 15g: circle exit did not complete: ' + JSON.stringify(st));
  const dockDone15g = await chrome.eval(`(() => {
    const d = document.getElementById('ob-drill-dock');
    return { on: d.classList.contains('on'), n: d.childElementCount,
      open: !!document.getElementById('ob-drill-open'),
      reset: !!document.getElementById('ob-drill-reset'),
      stop: !!document.getElementById('ob-drill-stop') };
  })()`);
  if (!dockDone15g.on || dockDone15g.n !== 2 || !dockDone15g.open
    || !dockDone15g.reset || dockDone15g.stop) {
    fail('arm 15g: post-completion register wrong (want opener+Reset, STOP gone): '
      + JSON.stringify(dockDone15g));
  }
  // plays law: only complete() writes the record — bumped ONCE here
  const bests15gDone = await chrome.eval('JSON.stringify(window.__drills.bests())');
  const plays15g1 = JSON.parse(bests15gDone).circle?.plays ?? 0;
  if (plays15g1 !== plays15g0 + 1) {
    fail(`arm 15g: completion did not bump plays exactly once: ${plays15g0} -> ${plays15g1}`);
  }
  const resetRect15g = await rect15('ob-drill-reset');
  if (!resetRect15g) fail('arm 15g: post-completion ↻ not measurable');
  const mark15g = consoleLogs.length;
  await clickAt(resetRect15g);
  // the restart is IMMEDIATE — a confirm must NEVER appear across the
  // start window (pre-fix red was the dead tap; a dialog here would break
  // the confirm-destructive-only law: the finished run has nothing to lose)
  for (let i = 0; i < 8; i++) {
    if (await confirmUp()) fail('arm 15g: post-completion ↻ raised a confirm');
    await sleep(100);
  }
  await sleep(600); // rerack + attempt-0 re-lay slack
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.id !== 'circle' || st.attempt !== 0 || st.score !== 0) {
    fail('arm 15g: ↻ tap did not restart the run: ' + JSON.stringify(st));
  }
  const tail15g = consoleLogs.slice(mark15g);
  const iStart15g = tail15g.findIndex((l) => l.includes('[drills] start {"id":"circle"}'));
  const iReset15g = tail15g.findIndex((l) => l.includes('[drills] reset {"id":"circle"}'));
  if (iStart15g === -1 || iReset15g === -1 || iReset15g < iStart15g) {
    fail(`arm 15g: restart mirrors wrong (start@${iStart15g}, reset@${iReset15g})`);
  }
  // best byte-preserved + plays NOT re-bumped by the restart (start()
  // touches blob.last alone — the GH-120 record law holds on this path)
  if (await chrome.eval('JSON.stringify(window.__drills.bests())') !== bests15gDone) {
    fail('arm 15g: the no-confirm restart touched the persisted record');
  }
  // the superseded completion banner must not ride into the restarted run
  // (start()'s clearTimers ends the hold; applyAttempt stomps the text)
  const banner15g = await chrome.eval(`(() => {
    const b = document.getElementById('ob-drill-end');
    return { display: b ? b.style.display : 'none',
      held: !!b && b.classList.contains('ob-drills-banner') };
  })()`);
  if (banner15g.display === 'block' || banner15g.held) {
    fail('arm 15g: stale completion banner survived the restart: '
      + JSON.stringify(banner15g));
  }
  // foreign stop clears the register: complete again, then mode-away — the
  // settings.changeMode silent stop nulls `finished` and the mode broadcast
  // hides the dock (no live-looking ↻ over a non-practice mode)
  await fire(chrome, 'arm 15g second exit',
    { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st?.done) fail('arm 15g: second exit did not complete: ' + JSON.stringify(st));
  if (await chrome.eval(`window.__settings.changeMode('play')`) !== true) {
    fail('arm 15g: mode-away switch refused');
  }
  await sleep(400);
  const dockAway15g = await chrome.eval(`(() => {
    const d = document.getElementById('ob-drill-dock');
    return { on: d.classList.contains('on'), n: d.childElementCount,
      reset: !!document.getElementById('ob-drill-reset'),
      state: window.__drills.state() };
  })()`);
  if (dockAway15g.on || dockAway15g.n !== 0 || dockAway15g.reset
    || dockAway15g.state !== null) {
    fail('arm 15g: foreign stop did not clear the post-completion register: '
      + JSON.stringify(dockAway15g));
  }
  // leave the suite where arm 15 found it (practice-idle, opener-only dock)
  if (await chrome.eval(`window.__settings.changeMode('practice')`) !== true) {
    fail('arm 15g: could not restore practice mode');
  }
  await sleep(300);

  // ==== arm 14 (issue #119): challenge tier ==================================
  // The stacked line-up / triangle layouts make a real headless run-out
  // impractical (the pre-119 `lineup` arm likewise tests only placement), so
  // these arms assert the machine-checkable seams + terminals + deterministic
  // ladders — never a physics run. Every check reads kernel record/judgment
  // bytes or the drill state wire.
  let stc;
  // ---- lineup-called: the ball+pocket affordance is now REACHABLE (finding
  // 1). The drill runs on the phase-less 9-ball sandbox fold, so pre-fix
  // aim.js surfaced NO nomination and every stroke was slop — the "call every
  // pocket" mechanic was impossible. Assert the affordance surfaces, that
  // composing a call through the SAME __aim seams the pocket-marker click /
  // touch tap-up / touchwidgets picker use routes to __drills.call, and that
  // the armed nomination reaches the called evaluator's terminal. (A real
  // called POT from the stacked line-up is impractical headlessly — the
  // arm-14 note; the routing + terminal are the machine-checkable red/green.)
  if (!(await chrome.eval('window.__drills.start("lineup-called")'))) fail('14: lineup-called start refused');
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('14: lineup-called did not grant the in-hand placement');
  }
  const lcBalls = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (lcBalls !== 16) fail(`14: lineup-called staged ${lcBalls} balls, want 16`);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.kind !== 'called' || stc.tier !== 'expert') {
    fail('14: lineup-called state wire wrong: ' + JSON.stringify(stc));
  }
  await sleep(400); // aim.js re-derives its nomination on the frame hook
  // the affordance surfaces on the phase-less sandbox fold ONLY because a
  // called drill is live (pre-fix: false / empty — the mechanic unreachable)
  if (await chrome.eval('window.__aim.nominationRequired()') !== true) {
    fail('14: lineup-called did not surface the pocket-nomination affordance');
  }
  const lcTargets = await chrome.eval('window.__aim.legalTargets()');
  if (!Array.isArray(lcTargets) || !lcTargets.includes(1) || lcTargets.length < 15) {
    fail('14: lineup-called legal targets must be every object ball: ' + JSON.stringify(lcTargets));
  }
  if (!(await chrome.eval('window.__aim.pocketMarks()')).some((m) => m.visible)) {
    fail('14: lineup-called pocket markers not visible');
  }
  // call ball 1 into pocket 5 through the REAL affordance seams (what the
  // pocket-marker click, the touch tap-up, and the touchwidgets picker all
  // invoke) — the composition must route to the drills-owned call() seam
  const lcCallMark = consoleLogs.length;
  await chrome.eval('window.__aim.selectCallBall(1)');
  await chrome.eval('window.__aim.nominatePocket(5)');
  await sleep(150);
  if (!consoleLogs.slice(lcCallMark).some((l) =>
    l.includes('[drills] call {"id":"lineup-called","ball":1,"pocket":5'))) {
    fail('14: the affordance did not route the composed call to __drills.call');
  }
  // a dry stroke ends the run, and the armed nomination provably reached the
  // called evaluator (the attempt mirror carries the called ball+pocket —
  // impossible pre-fix, when nothing ever fed __drills.call)
  const lcAttMark = consoleLogs.length;
  await fire(chrome, '14 lineup-called dry', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(500);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || !stc.done || stc.score !== 0) {
    fail('14: lineup-called dry stroke did not end the run: ' + JSON.stringify(stc));
  }
  if (!consoleLogs.slice(lcAttMark).some((l) =>
    l.includes('[drills] attempt {"id":"lineup-called"') && l.includes('"called":{"ball":1,"pocket":5}'))) {
    fail('14: the affordance-armed nomination did not reach the called evaluator');
  }
  if (!sawLog('[drills] complete {"id":"lineup-called"')) fail('14: lineup-called complete mirror missing');
  await chrome.eval('window.__drills.stop()');
  await sleep(300);
  // the affordance stands down once no called drill is live (deriveNomination
  // returns null again on the sandbox fold) and the raw seam refuses
  if (await chrome.eval('window.__aim.nominationRequired()') === true) {
    fail('14: the called affordance did not stand down after the run ended');
  }
  if (await chrome.eval('window.__drills.call(1, 5)') !== false) {
    fail('14: call() must refuse with no called-shot drill live');
  }

  // ---- progressive-lineup: N=5 start; a fail retreats N (floor 3) + a rack try
  if (!(await chrome.eval('window.__drills.start("progressive-lineup")'))) fail('14: progressive start refused');
  await sleep(300);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.kind !== 'progressive' || stc.n !== 5) {
    fail('14: progressive state wire wrong: ' + JSON.stringify(stc));
  }
  const progBalls = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (progBalls !== 6) fail(`14: progressive staged ${progBalls} balls, want 6 (cue+5)`);
  await fire(chrome, '14 progressive miss', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(500);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.n !== 4 || stc.rackTries !== 1) {
    fail('14: progressive fail did not retreat N: ' + JSON.stringify(stc));
  }
  await sleep(RELAY_MS); // the N=4 rack re-lays (RACK_MS after the settle)
  const prog4 = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (prog4 !== 5) fail(`14: progressive N=4 re-lay staged ${prog4} balls, want 5 (cue+4)`);
  await chrome.eval('window.__drills.stop()');

  // ---- ghost10: a JS-laid ten-ball rack; a miss ends the rack + loops on
  if (!(await chrome.eval('window.__drills.start("ghost10")'))) fail('14: ghost10 start refused');
  await sleep(300);
  const g10Balls = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (g10Balls !== 11) fail(`14: ghost10 staged ${g10Balls} balls, want 11 (cue+10)`);
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') fail('14: ghost10 did not grant the kitchen break');
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.kind !== 'ten' || stc.k !== 0) fail('14: ghost10 state wire wrong: ' + JSON.stringify(stc));
  await fire(chrome, '14 ghost10 dry break', { v0: 0.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(300);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.k !== 1) fail('14: ghost10 dry break did not end rack 1: ' + JSON.stringify(stc));
  if (!sawLog('[drills] rack {"id":"ghost10","rack":1')) fail('14: ghost10 rack mirror missing');
  await sleep(1800); // relayTen lands (RACK_MS after the verdict)
  const g10r2 = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (g10r2 !== 11) fail(`14: ghost10 rack 2 not staged (${g10r2} balls, want 11)`);
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') fail('14: ghost10 rack 2 break not granted');
  await chrome.eval('window.__drills.stop()');

  // ---- rotation15: LOWER-is-better penalty accrual on a no-contact foul
  if (!(await chrome.eval('window.__drills.start("rotation15")'))) fail('14: rotation15 start refused');
  await sleep(300);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.kind !== 'penalty' || stc.low !== true) {
    fail('14: rotation15 state wire wrong: ' + JSON.stringify(stc));
  }
  const r15Balls = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
  if (r15Balls !== 16) fail(`14: rotation15 staged ${r15Balls} balls, want 16 (cue+15)`);
  await fire(chrome, '14 rotation15 foul', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(400);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.score < 3) fail('14: rotation15 penalty did not accrue: ' + JSON.stringify(stc));
  if (!sawLog('[drills] attempt {"id":"rotation15"')) fail('14: rotation15 attempt mirror missing');
  await chrome.eval('window.__drills.stop()');

  // ==== arm 370 (GH-370 class 5): drill grant zones ===========================
  // (a) rotation15 foul re-grant is ANYWHERE (WPA 5.7 via 1.6 — Dr Dave's
  //     15-ball rating rides standard 9-ball rules), never the break's
  //     kitchen class (pre-370 red-proof: the re-grant inherited 'kitchen'
  //     and the drills placeCue wrap clamped every drag behind the line);
  // (b) rotation15 voluntary BIH: the dock ✋ takes ball in hand anywhere
  //     for one penalty point (the sheet's core scoring affordance);
  // (c) ghost10 post-break BIH: after EVERY break — clean OR scratch —
  //     take ball in hand anywhere ("take ball in hand even if you
  //     scratch"); a break scratch is play-on (−2, potted balls spot);
  // (d) ghost9 post-break BIH: the customary ghost opener.
  {
    // ---- (a) foul → anywhere -------------------------------------------------
    if (!(await chrome.eval('window.__drills.start("rotation15")'))) fail('370a: rotation15 start refused');
    await sleep(300);
    if (await chrome.eval('window.__drills.grant()') !== 'kitchen') {
      fail('370a: break grant not kitchen');
    }
    const zoneB = await chrome.eval('__aim.zoneOverlay()');
    if (!zoneB?.visible || zoneB.kind !== 'kitchen') {
      fail('370a: kitchen zone overlay not painted during the break grant: '
        + JSON.stringify(zoneB));
    }
    await fire(chrome, '370a rotation15 foul', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(RELAY_MS);
    if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
      fail('370a: foul re-lay did not grant ball in hand');
    }
    if (await chrome.eval('window.__drills.grant()') !== 'anywhere') {
      fail('370a: foul re-grant zone is not anywhere (WPA 5.7 via 1.6): '
        + (await chrome.eval('window.__drills.grant()')));
    }
    const zoneF = await chrome.eval('__aim.zoneOverlay()');
    if (zoneF?.visible) fail('370a: anywhere grant must render no zone overlay');
    // the pre-370 kitchen pre-clamp is GONE: a foot-half placement lands
    if (!(await chrome.eval('__test.placeCue(0.2, 0.3)'))) {
      fail('370a: full-table foul placement refused');
    }
    const cue370 = (await chrome.eval('__test.balls()')).find((b) => b.id === 0).pos;
    if (Math.abs(cue370[0] - 0.3) > 1e-6 || Math.abs(cue370[2] - 0.2) > 1e-6) {
      fail('370a: foul BIH placement clamped away from the requested foot-half spot: ' + cue370);
    }

    // ---- (b) voluntary BIH (+1 penalty, anywhere) ------------------------------
    // park a legal-ish stroke first so the machine returns to AIM: place
    // the cue snug behind the lowest ball and push it softly (first
    // contact guaranteed by proximity)
    const low370 = await chrome.eval(`(() => {
      const obs = __test.balls().filter((b) => !b.pocketed && b.id !== 0);
      const low = obs.reduce((m, b) => (b.id < m.id ? b : m), obs[0]);
      return { id: low.id, x: low.pos[2], y: low.pos[0] };
    })()`);
    // approach from the table-centre side of the ball
    const ux370 = -Math.sign(low370.x) || 1, uy370 = -Math.sign(low370.y) || 1;
    const n370 = Math.hypot(ux370, uy370);
    const cx370 = low370.x + (ux370 / n370) * 0.12, cy370 = low370.y + (uy370 / n370) * 0.12;
    if (!(await chrome.eval(`__test.placeCue(${cx370}, ${cy370})`))) {
      fail('370b: setup placement refused');
    }
    const phi370 = await chrome.eval(`(() => {
      const c = __test.balls().find((b) => b.id === 0).pos;
      return Math.atan2(${low370.y} - c[0], ${low370.x} - c[2]);
    })()`);
    await fire(chrome, '370b soft legal stroke', { v0: 0.7, phi: phi370, theta: 0, a: 0, b: 0 });
    await sleep(RELAY_MS);
    const preBih = await chrome.eval('window.__drills.state()');
    const st370 = await chrome.eval('__test.state()');
    if (st370 === 'AIM') {
      // legal stroke: the continue re-lay plays where it lies — the dock ✋
      // now takes voluntary BIH for +1
      const mark370 = consoleLogs.length;
      await chrome.eval('document.getElementById("ob-drill-bih").click()');
      await sleep(200);
      const postBih = await chrome.eval('window.__drills.state()');
      if (postBih.score !== preBih.score + 1) {
        fail(`370b: voluntary BIH did not cost one penalty (${preBih.score} → ${postBih.score})`);
      }
      if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND'
        || await chrome.eval('window.__drills.grant()') !== 'anywhere') {
        fail('370b: voluntary BIH did not grant anywhere placement');
      }
      if (!consoleLogs.slice(mark370).some((l) => l.includes('[drills] bih {"id":"rotation15"'))) {
        fail('370b: voluntary BIH mirror not printed');
      }
    } else {
      // the soft stroke fouled (table-state dependent): the foul re-grant
      // already proves the anywhere zone; assert the ✋ no-ops while in hand
      await chrome.eval('document.getElementById("ob-drill-bih").click()');
      await sleep(200);
      const postBih = await chrome.eval('window.__drills.state()');
      if (postBih.score !== preBih.score) {
        fail('370b: voluntary BIH must no-op while already in hand');
      }
      console.log('[e2e-drills] arm 370b note: soft stroke fouled — asserted the in-hand no-op leg');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);

    // ---- (c) ghost10 post-break BIH + break-scratch play-on --------------------
    if (!(await chrome.eval('window.__drills.start("ghost10")'))) fail('370c: ghost10 start refused');
    await sleep(300);
    if (await chrome.eval('window.__drills.grant()') !== 'kitchen') {
      fail('370c: ghost10 break grant not kitchen');
    }
    // break SCRATCH without contact: roll the cue straight into the
    // head-left corner pocket (the rack sits at the foot; the path is
    // clear) — phi computed from the LIVE pocket center
    await chrome.eval('__test.placeCue(0, -0.9)');
    const phiScr = await chrome.eval(`(() => {
      const pks = window.__rules.pockets();
      const pk = pks.reduce((m, p) => (p.x + p.y < m.x + m.y ? p : m), pks[0]);
      const c = __test.balls().find((b) => b.id === 0).pos;
      return Math.atan2(pk.y - c[0], pk.x - c[2]);
    })()`);
    await fire(chrome, '370c ghost10 break scratch', { v0: 3.0, phi: phiScr, theta: 0, a: 0, b: 0 });
    await sleep(RELAY_MS);
    let g370 = await chrome.eval('window.__drills.state()');
    if (!g370 || g370.done !== false || g370.k !== 0) {
      fail('370c: a break scratch must be PLAY-ON (spot/−2/BIH), not rack over: '
        + JSON.stringify(g370));
    }
    // GH-459: the penalty is UNCONDITIONAL −2 (the sheet's law — no floor
    // documented anywhere): the early break scratch moves 0 → −2. RED
    // pre-fix: drills.js's Math.max(0, …) clamp absorbed it (score stayed
    // 0) and the chip never moved.
    if (g370.score !== -2) {
      fail('370c GH-459: the break scratch must cost the unconditional −2 '
        + `(0 → −2, no floor): score=${g370.score}`);
    }
    const chip459 = await chrome.eval(
      `document.querySelector('#ob-drill-chips')?.textContent ?? ''`);
    if (!chip459.includes('-2')) {
      fail('370c GH-459: the HUD score chip must show the signed total '
        + '(-2/100): ' + chip459);
    }
    if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND'
      || await chrome.eval('window.__drills.grant()') !== 'anywhere') {
      fail('370c: ghost10 break-scratch BIH (anywhere) not granted');
    }
    const g10balls = (await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length;
    if (g10balls !== 11) fail(`370c: ghost10 scratch re-lay staged ${g10balls} balls, want 11 (cue revived, pots spotted)`);
    // GH-436 (the issue's own repro class — a ghost10 foul whose re-lay
    // grants BIH): the banner flow re-asserts over the reset judgment
    // surface must NEVER be the flow.foulFallback composition ("FOUL —
    // foul") — it either clears or keeps the cached concrete reason
    // (code-agnostic here: ghost10 rides the registry ruleset's CitedFoul
    // codes; the arm-8 probe pins the concrete-reason clause).
    const g436c = await chrome.eval(`({
      banner: document.getElementById('banner').textContent,
      fallback: window.__i18n.t('flow.foulBanner',
        { reason: window.__i18n.t('flow.foulFallback') }) })`);
    if (g436c.banner === g436c.fallback) {
      fail('370c GH-436: banner degraded to the foulFallback composition '
        + 'after the ghost10 re-lay: "' + g436c.banner + '"');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);

    // ---- (d) ghost9 post-break BIH ---------------------------------------------
    if (!(await chrome.eval('window.__drills.start("ghost9")'))) fail('370d: ghost9 start refused');
    await sleep(300);
    await fire(chrome, '370d ghost9 dry break', { v0: 1.1, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(600); // the grant lands on a macrotask after the settle
    let g9370 = await chrome.eval('window.__drills.state()');
    if (!g9370 || g9370.done !== false || g9370.k !== 0) {
      fail('370d: ghost9 dry break should continue the rack: ' + JSON.stringify(g9370));
    }
    if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND'
      || await chrome.eval('window.__drills.grant()') !== 'anywhere') {
      fail('370d: ghost9 post-break BIH (anywhere) not granted — the ghost '
        + 'convention opener (pre-370 red-proof: the cue played the leave)');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
    console.log('[e2e-drills] arm 370 ok (rotation15 foul→anywhere + zone '
      + 'overlay + voluntary BIH; ghost10 post-break BIH + break-scratch '
      + 'play-on; ghost9 post-break BIH)');
  }

  // ---- mighty-x: the cue-rest tolerance ladder tightens 0.18 → 0.09 across
  // the five rungs (deterministic layout inspection — the ladder's machine-check)
  const mxTol = [];
  for (let k = 0; k < 5; k++) {
    const lay = JSON.parse(await chrome.eval(`JSON.stringify(window.__drills.layout("mighty-x", ${k}))`));
    mxTol.push(lay.objective.cueRest.r);
  }
  for (let k = 1; k < 5; k++) {
    if (!(mxTol[k] < mxTol[k - 1])) {
      fail('14: mighty-x tolerance ladder does not tighten: ' + JSON.stringify(mxTol));
    }
  }
  if (!(await chrome.eval('window.__drills.start("mighty-x")'))) fail('14: mighty-x start refused');
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'AIM') fail('14: mighty-x (fixed) must boot into AIM');
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.kind !== 'ladder' || stc.tier !== 'expert') fail('14: mighty-x state wire wrong: ' + JSON.stringify(stc));
  await chrome.eval('window.__drills.stop()');

  // ---- century: pins straight_pool SESSION-only + observes the 14.1 fold.
  // (a) finding 2: a LEGAL 14.1 opening break is a no-pot safety (WPA 7.3 —
  // legal, zero pocketed); it must NOT end the visit (pre-fix advanced=false
  // completed at score 0 on the first stroke, making the milestone ladder
  // unreachable). (b) a fouled break still ends the visit — the terminal is
  // intact. (A real 14.1 called run is impractical headlessly — arm-14 note.)
  await chrome.eval('__test.rerack(1)'); // pin the rack: seed 1 gives a legal
  await sleep(300);                       // NO-POT break with the params below
  if (!(await chrome.eval('window.__drills.start("century")'))) fail('14: century start refused');
  await sleep(500);
  if (await chrome.eval('window.__rules.game()') !== 'straight_pool') fail('14: century did not pin straight_pool');
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.kind !== 'fourteenone' || stc.tier !== 'expert') fail('14: century state wire wrong: ' + JSON.stringify(stc));
  if (await chrome.eval('window.__rules.matchState()') === null) fail('14: century 14.1 fold not active');
  // (a) a strong angled legal break into the rack (WPA 7.3(b): the cue + two
  // object balls reach cushions): play continues, the milestone ladder lives.
  // A dead-centre break stops in the pack and fouls, so the break carries a
  // slight angle + sidespin (offline-probed reliably legal across seeds).
  const cBreakMark = consoleLogs.length;
  await fire(chrome, '14 century legal break',
    { v0: 6, phi: Math.PI / 2 + 0.05, theta: 0, a: 0.3, b: 0 });
  await sleep(500);
  const cJudg = JSON.parse(await chrome.eval('JSON.stringify(window.__rules.judgment())'));
  if (cJudg?.legal !== true) {
    fail('14: century break was not legal (cannot test finding 2): ' + JSON.stringify(cJudg?.fouls));
  }
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || stc.done) {
    fail('14: century LEGAL break wrongly ended the visit (finding 2): ' + JSON.stringify(stc));
  }
  if (!consoleLogs.slice(cBreakMark).some((l) =>
    l.includes('[drills] attempt {"id":"century"') && l.includes('"pass":true'))) {
    fail('14: century legal break not scored as play-on');
  }
  if (cJudg.pocketed?.length !== 0 || stc.score !== 0) {
    fail('14: century legal break expected legal + zero-pot (finding-2 case): '
      + JSON.stringify({ pocketed: cJudg.pocketed?.length, score: stc.score }));
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(300);
  // (b) a fresh run whose OPENING break is a foul (weak, no rack contact):
  // the terminal still fires — a fouled break ends the visit
  if (!(await chrome.eval('window.__drills.start("century")'))) fail('14: century re-start refused');
  await sleep(400);
  await fire(chrome, '14 century foul break', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(500);
  stc = await chrome.eval('window.__drills.state()');
  if (!stc || !stc.done) fail('14: century foul break did not end the visit: ' + JSON.stringify(stc));
  await chrome.eval('window.__drills.stop()');
  // restore 9-ball for the colours arms below (century's pin was session-only)
  await chrome.eval("window.__rules.setGame('nine_ball')");
  await sleep(300);

  // ==== arm 16 (issue GH-131): the line-up (蛇彩) family ========================
  // Five legs: LAYOUT / ORDER / ONLY-POCKET / PLAYABILITY / PLAY-COUNT
  // PERMUTATION — every verdict reads kernel record bytes or the published
  // layout bytes.
  // D anchor: bu-f6 station 1's object ball sits at pt(1, 6) → y = l/4
  // = 2 diamonds (independent of the geometry under test; GH-384 moved
  // bu-f1's OB off the foot spot to the sheet's diagram point).
  const D16 = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.layout("bu-f6", 0))'))
    .balls.find((b) => b.id === 1).y / 2;
  const R16 = await chrome.eval('window.__drills.ballR()');
  const lay16 = async (id, k = 0) => JSON.parse(await chrome.eval(
    `JSON.stringify(window.__drills.layout("${id}", ${k}))`));
  const obs16 = (lay) => lay.balls.filter((b) => b.id !== 0)
    .sort((a, b) => a.id - b.id);
  const near16 = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
  const slotY16 = (dy) => (dy - 4) * D16; // diamond dy → kernel y

  // ---- (a) LAYOUT law per variant --------------------------------------------
  // base + order variants: 15 balls ON the center string, half-diamond
  // slots, 7-diamond span centered (foot end +3.5D … head end −3.5D); the
  // clear order is the id order (rotation enforces it)
  const LINE16 = {
    lineup: (i) => 7.5 - 0.5 * (i - 1),
    'lineup-e2m': (i) => (i % 2 ? 7.5 - 0.25 * (i - 1) : 0.5 + 0.25 * (i - 2)),
    'lineup-m2e': (i) => (i === 1 ? 4 : i % 2 ? 4 - 0.25 * (i - 1) : 4 + 0.25 * i),
  };
  for (const [id16, dyOf] of Object.entries(LINE16)) {
    const lay = await lay16(id16);
    const obs = obs16(lay);
    if (obs.length !== 15) fail(`16a ${id16}: ${obs.length} object balls, want 15`);
    for (const b of obs) {
      if (!near16(b.x, 0, 1e-9)) {
        fail(`16a ${id16}: ball ${b.id} off the center string (x=${b.x})`);
      }
      if (!near16(b.y, slotY16(dyOf(b.id)))) {
        fail(`16a ${id16}: ball ${b.id} off its half-diamond slot`
          + ` (y=${b.y}, want ${slotY16(dyOf(b.id))})`);
      }
    }
    if (lay.objective.rotation !== true || lay.objective.pot?.count !== 1
      || lay.objective.noScratch !== true
      || lay.objective.cleanContact !== true) { // GH-134 base rule
      fail(`16a ${id16}: objective lacks the ordered-clear law: `
        + JSON.stringify(lay.objective));
    }
  }
  // the base span law explicitly (the issue's first/last-ball assert):
  {
    const obs = obs16(await lay16('lineup'));
    if (!near16(obs[0].y, 3.5 * D16) || !near16(obs[14].y, -3.5 * D16)
      || !near16(obs[0].y - obs[1].y, 0.5 * D16)) {
      fail('16a lineup: span/spacing law broken (want 7D span, 0.5D gaps)');
    }
    // lineup-called shares the base string byte-for-byte
    const called = obs16(await lay16('lineup-called'));
    if (JSON.stringify(called) !== JSON.stringify(obs)) {
      fail('16a lineup-called: object layout must match the base 蛇彩 string');
    }
  }
  // random: the slot MULTISET is exactly the 15 half-diamond slots, on the
  // string, and the id→slot map is NOT the identity (the seeded shuffle
  // drew; byte-stability across boots is arm 3's leg)
  {
    const obs = obs16(await lay16('lineup-random'));
    const want = Array.from({ length: 15 }, (_, s) => slotY16(7.5 - 0.5 * s))
      .sort((a, b) => a - b);
    const got = obs.map((b) => b.y).sort((a, b) => a - b);
    if (obs.some((b) => !near16(b.x, 0, 1e-9))
      || !want.every((y, i) => near16(got[i], y))) {
      fail('16a random: slots are not the 15 half-diamond string slots');
    }
    if (obs.every((b) => near16(b.y, slotY16(7.5 - 0.5 * (b.id - 1))))) {
      fail('16a random: the shuffle produced the identity order');
    }
  }
  // lateral: one row on dy 4.5 (y = +0.5D, the foot side of the side-pocket
  // line). GH-136 owner correction: the row is FULLY UNIFORM — 15 balls
  // make 16 EQUAL gaps (14 inter-ball + the 2 cushion-to-end-ball gaps),
  // g = (w − 15·ball_d)/16, slot x = −w/2 + g + r + slot·(2r + g) (the
  // playfield width is 4 diamonds on every 2:1 table). GH-131 review
  // finding 1: the owner-spec ORDER VARIANTS lay the SAME row under
  // permuted id placement — lat-e2m converges on the middle ball (odd ids
  // left-end-in, even ids right-end-in, id 15 center), lat-m2e starts on
  // the center slot and alternates outward.
  const g16 = (4 * D16 - 30 * R16) / 16;
  const LAT16 = {
    'lineup-lateral': (i) => i - 1,
    'lineup-lat-e2m': (i) => (i % 2 ? (i - 1) / 2 : 14 - (i - 2) / 2),
    'lineup-lat-m2e': (i) => (i === 1 ? 7 : i % 2 ? 7 - (i - 1) / 2 : 7 + i / 2),
  };
  for (const [id16, slotOf] of Object.entries(LAT16)) {
    const lay = await lay16(id16);
    const obs = obs16(lay);
    const step = 2 * R16 + g16;
    if (obs.length !== 15) fail(`16a ${id16}: ${obs.length} object balls, want 15`);
    for (const b of obs) {
      if (!near16(b.y, 0.5 * D16)) fail(`16a ${id16}: ball ${b.id} off the row line`);
      if (!near16(b.x, -2 * D16 + g16 + R16 + slotOf(b.id) * step)) {
        fail(`16a ${id16}: ball ${b.id} off its slot`);
      }
    }
    if (lay.objective.rotation !== true || lay.objective.pot?.count !== 1
      || lay.objective.noScratch !== true
      || lay.objective.cleanContact !== true) { // GH-134 base rule
      fail(`16a ${id16}: objective lacks the ordered-clear law: `
        + JSON.stringify(lay.objective));
    }
    if (id16 !== 'lineup-lateral') continue; // row-shape asserts, once
    if (!near16(obs[0].x, -obs[14].x)) fail('16a lateral: row not centered');
    // GH-136 uniformity law: BOTH cushion-to-end-ball gaps and every
    // inter-ball surface gap equal g (end gap == inter gap within eps)
    const leftGap = (obs[0].x - R16) - (-2 * D16);
    const rightGap = 2 * D16 - (obs[14].x + R16);
    if (!near16(leftGap, g16) || !near16(rightGap, g16)) {
      fail(`16a lateral: cushion gaps not uniform (${leftGap}/${rightGap}, want ${g16})`);
    }
    for (let i = 1; i < 15; i++) {
      const gap = obs[i].x - obs[i - 1].x - 2 * R16;
      if (!near16(gap, g16)) {
        fail(`16a lateral: inter-ball gap ${i} not uniform (${gap}, want ${g16})`);
      }
    }
  }
  // L (GH-136 owner photo spec — REBUILT off the shipped rail-hugging
  // foot-left L): corner ball (id 8) ON the center string 2 diamonds off
  // the foot rail (0, 2D — the foot spot); leg A (ids 1..7) down the
  // center string with ball 1 just above the FOOT-RAIL MIDPOINT (y =
  // 4D − m at the clampBed margin m = r + 1e-3); leg B (ids 9..15) across
  // to the right long rail with ball 15 beside it (x = 2D − m); uniform
  // step (2D − m)/7 on both legs — the L WRAPS the quadrant containing
  // the foot-right pocket; clear order END-TO-END as ascending ids
  // (leg A far end → corner → leg B far end); enclosed pocket 5 ONLY
  {
    const lay = await lay16('lineup-l');
    const obs = obs16(lay);
    const M16 = R16 + 1e-3;
    const s7 = (2 * D16 - M16) / 7;
    for (const b of obs) {
      const want = b.id <= 7
        ? { x: 0, y: 4 * D16 - M16 - (b.id - 1) * s7 }
        : b.id === 8 ? { x: 0, y: 2 * D16 }
          : { x: (b.id - 8) * s7, y: 2 * D16 };
      if (!near16(b.x, want.x) || !near16(b.y, want.y)) {
        fail(`16a L: ball ${b.id} off the end-to-end L`);
      }
    }
    // the owner leg-end law explicitly: ball 1 above the bottom-rail
    // midpoint, ball 15 beside the long rail, corner ball at (center, 2D)
    if (!near16(obs[0].x, 0) || !near16(obs[0].y, 4 * D16 - M16)
      || !near16(obs[14].x, 2 * D16 - M16) || !near16(obs[14].y, 2 * D16)
      || !near16(obs[7].x, 0) || !near16(obs[7].y, 2 * D16)) {
      fail('16a L: leg far ends / corner off the owner spec');
    }
    if (lay.objective.pot?.pocket !== 5 || lay.objective.pot?.count !== 1
      || lay.objective.rotation !== true
      || lay.objective.cleanContact !== true) { // GH-134 base rule
      fail('16a L: enclosed-pocket objective wrong: ' + JSON.stringify(lay.objective));
    }
    // L ends-to-middle (GH-177): the IDENTICAL L layout under the
    // alternating id-placement permutation — shot order over lineup-l's
    // slots is 1,15,2,14,3,13,4,12,5,11,6,10,7,9,8 (owner verbatim:
    // 现在的15打第2杆, 2打第3杆, 14打第4杆, …, 8打第15杆 — the corner
    // ball, slot 8, is potted LAST). Three asserts: (1) BYTE-IDENTITY —
    // the object-ball position multiset (and the default cue) matches
    // lineup-l byte-for-byte; (2) the SLOT MAP — ball i sits exactly on
    // lineup-l's slot (i odd → (i+1)/2, i even → 16 − i/2), id 15 on the
    // corner; (3) the same enclosed-pocket-5 objective. The only-pocket
    // red law is SHARED with 16c's lineup-l leg (identical bytes, ids
    // don't touch physics).
    {
      const layE = await lay16('lineup-l-e2m');
      const obsE = obs16(layE);
      if (obsE.length !== 15) fail(`16a L-e2m: ${obsE.length} object balls, want 15`);
      const key = (b) => JSON.stringify([b.x, b.y]);
      const setL = obs.map(key).sort().join(';');
      const setE = obsE.map(key).sort().join(';');
      if (setE !== setL) fail('16a L-e2m: layout not byte-identical to lineup-l');
      if (key(lay.balls.find((b) => b.id === 0))
        !== key(layE.balls.find((b) => b.id === 0))) {
        fail('16a L-e2m: default cue drifted off lineup-l\'s');
      }
      const slotOf = (i) => (i % 2 ? (i + 1) / 2 : 16 - i / 2);
      for (const b of obsE) {
        const want = obs.find((l) => l.id === slotOf(b.id));
        if (key(b) !== key(want)) {
          fail(`16a L-e2m: ball ${b.id} off slot ${slotOf(b.id)} (the`
            + ' alternating permutation)');
        }
      }
      if (!near16(obsE[14].x, 0) || !near16(obsE[14].y, 2 * D16)) {
        fail('16a L-e2m: id 15 is not the corner ball (must pot LAST)');
      }
      if (layE.objective.pot?.pocket !== 5 || layE.objective.pot?.count !== 1
        || layE.objective.rotation !== true
        || layE.objective.cleanContact !== true) { // GH-134 base rule
        fail('16a L-e2m: enclosed-pocket objective wrong: '
          + JSON.stringify(layE.objective));
      }
    }
  }
  // diagonal: collinear, uniform, owner anchor pt(3.4,6.8)→pt(0.6,1.2);
  // ball 1 is the pocket-nearest ball. Issue #209: the objective is now the
  // family BASE any-pocket law (pocket 5 sat on the line's OWN collinear
  // extension — openable but not clearable into one pocket; relaxed to
  // any-pocket rotation, FORMAT.md §3.10). pot.count 1, NO pocket key.
  {
    const lay = await lay16('lineup-diagonal');
    const obs = obs16(lay);
    const a1 = obs[0], a15 = obs[14];
    if (!near16(a1.x, 1.4 * D16) || !near16(a1.y, 2.8 * D16)
      || !near16(a15.x, -1.4 * D16) || !near16(a15.y, -2.8 * D16)) {
      fail('16a diagonal: endpoints off the owner anchor');
    }
    for (const b of obs) {
      const t = (b.id - 1) / 14;
      if (!near16(b.x, a1.x + (a15.x - a1.x) * t)
        || !near16(b.y, a1.y + (a15.y - a1.y) * t)) {
        fail(`16a diagonal: ball ${b.id} off the line`);
      }
    }
    if (lay.objective.pot?.pocket !== undefined || lay.objective.pot?.count !== 1
      || lay.objective.rotation !== true
      || lay.objective.cleanContact !== true) { // GH-134 base rule
      fail('16a diagonal: any-pocket objective wrong (issue #209): '
        + JSON.stringify(lay.objective));
    }
  }
  // progressive scales N along the same string at the same half-diamond
  // law, span centered (N=5 ⇒ dy 5.0 … 3.0)
  {
    const obs = obs16(await lay16('progressive-lineup', 5));
    if (obs.length !== 5) fail(`16a progressive: ${obs.length} balls, want 5`);
    for (const b of obs) {
      if (!near16(b.x, 0, 1e-9) || !near16(b.y, (1 - 0.5 * (b.id - 1)) * D16)) {
        fail(`16a progressive: ball ${b.id} off the centered N=5 string`);
      }
    }
  }

  // custom-aim-point ghost-ball phi (the aimJs math with a free target —
  // corner pots aim at the bed corner pulled one ball radius into the
  // table; the kernel pocket-disc center sits deep behind the jaws and a
  // shallow cross-table pot aimed at it rattles the near facing — probed
  // offline, find-lineup-recipes.mjs)
  const aimPointJs = (obId, tx, ty) => `(() => {
    const k = (b) => ({ x: b.pos[2], y: b.pos[0] });
    const balls = __test.balls();
    const cue = k(balls.find((b) => b.id === 0));
    const ob = k(balls.find((b) => b.id === ${obId}));
    const r = window.__drills.ballR();
    const n = Math.hypot(${tx} - ob.x, ${ty} - ob.y);
    const gx = ob.x - ((${tx} - ob.x) / n) * 2 * r;
    const gy = ob.y - ((${ty} - ob.y) / n) * 2 * r;
    return Math.atan2(gy - cue.y, gx - cue.x);
  })()`;
  const corner16 = (i) => ({
    x: (i >= 3 ? 1 : -1) * (2 * D16 - R16),
    y: (i % 3 === 2 ? 1 : -1) * (4 * D16 - R16),
  });
  const fireAtPoint = async (tag, obId, t, extra) => {
    const phi = await chrome.eval(aimPointJs(obId, t.x, t.y));
    return fire(chrome, tag, { phi, theta: 0, a: 0, ...extra });
  };

  // ---- (b) ORDER — anywhere grant + wrong-order first contact ----------------
  if (!(await chrome.eval('window.__drills.start("lineup")'))) fail('16b: lineup start refused');
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('16b: lineup (anywhere) did not boot into BALL_IN_HAND');
  }
  // anywhere ≠ kitchen: a FOOT-half placement must stick (the pre-131
  // kitchen law clamped y to the head string)
  if (!(await chrome.eval(`__test.placeCue(${0.9 * D16}, ${0.5 * D16})`))) {
    fail('16b: foot-half placement rejected under the anywhere grant');
  }
  const cue16 = (await chrome.eval('__test.balls()')).find((b) => b.id === 0);
  if (Math.abs(cue16.pos[2] - 0.9 * D16) > 1e-6
    || Math.abs(cue16.pos[0] - 0.5 * D16) > 1e-6) {
    fail('16b: anywhere placement clamped (the kitchen ghost lives on)');
  }
  // wrong order: first-contact ball 15 (the head-most) — the run ends with
  // reason 'contact' whatever else the stroke does
  if (!(await chrome.eval(`__test.placeCue(${0.5 * D16}, ${-2.8 * D16})`))) {
    fail('16b: order-leg cue placement rejected');
  }
  const mark16b = consoleLogs.length;
  await fireAt(chrome, '16b wrong order', 15, 0, { v0: 1.4 });
  await sleep(500);
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done || st.score !== 0) {
    fail('16b: wrong-order first contact did not end the run: ' + JSON.stringify(st));
  }
  if (!consoleLogs.slice(mark16b).some((l) =>
    l.includes('[drills] attempt {"id":"lineup"') && l.includes('"reason":"contact"'))) {
    fail('16b: wrong-order attempt did not carry reason contact');
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(200);

  // ---- (c) ANY-POCKET — a free-pocket pot SCORES and CONTINUES (issue #209) --
  // lineup-diagonal (relaxed to the family any-pocket law — FORMAT.md §3.10):
  // ball 1 potted STRAIGHT into the foot-LEFT corner (pocket 2, a NON-nearest
  // pocket the pre-#209 only-pocket(5) law rejected as reason 'pocket') from a
  // near-rail cue 0.35D behind it on the pot line. RED on current main: the
  // only-pocket law ended the run at 0/15 (the owner's exact Bug-1 symptom).
  // GREEN after: the pot scores and the run continues.
  if (!(await chrome.eval('window.__drills.start("lineup-diagonal")'))) {
    fail('16c: lineup-diagonal start refused');
  }
  await sleep(300);
  {
    const a1 = { x: 1.4 * D16, y: 2.8 * D16 }; // ball 1 (asserted in 16a)
    const t2 = corner16(2);
    const n = Math.hypot(t2.x - a1.x, t2.y - a1.y);
    const cx = a1.x - ((t2.x - a1.x) / n) * 0.35 * D16;
    const cy = a1.y - ((t2.y - a1.y) / n) * 0.35 * D16;
    if (!(await chrome.eval(`__test.placeCue(${cx}, ${cy})`))) {
      fail('16c: near-rail cue placement rejected');
    }
    const mark16c = consoleLogs.length;
    await fireAtPoint('16c free pocket', 1, t2, { v0: 2.4, b: -0.2 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.score !== 1) {
      fail('16c: free-pocket pot did not score and continue (issue #209 Bug 1 '
        + 'regression — the only-pocket 0/15 dead-end): ' + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark16c).some((l) =>
      l.includes('[drills] attempt {"id":"lineup-diagonal"')
      && l.includes('"pass":true'))) {
      fail('16c: free-pocket pot did not record a pass');
    }
    // honesty: the record bytes really carry a ball-1 pot into pocket 2 (a
    // pocket the collinear-extension geometry never designated)
    const ev16 = await chrome.eval('__test.events()');
    if (!ev16.some((e) => e.kind?.BallPocket?.ball === 1
      && e.kind.BallPocket.pocket === 2)) {
      fail('16c: staging shot did not actually pot ball 1 into pocket 2');
    }
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(200);
  // GH-136: the L's only-pocket law, red side — ball 1 (just above the
  // foot-rail midpoint) potted STRAIGHT along the foot rail into the
  // foot-LEFT corner (pocket 2 — a NON-enclosed pocket; the enclosed
  // pocket is 5) from a near-rail cue 0.35D behind it on the pot line —
  // the run ends with reason 'pocket' (offline-probed recipe,
  // find-lineup-recipes.mjs only-pocket-red-L; the green side — a pot
  // into the ENCLOSED pocket continues — is 16d's lineup-l leg). GH-177:
  // this red leg is SHARED with lineup-l-e2m — the layouts are
  // byte-identical (16a's L-e2m assert) including ball 1's slot, and ids
  // never touch physics, so one staged wrong-pocket pot pins both.
  if (!(await chrome.eval('window.__drills.start("lineup-l")'))) {
    fail('16c: lineup-l start refused');
  }
  await sleep(300);
  {
    const M16 = R16 + 1e-3;
    const b1 = { x: 0, y: 4 * D16 - M16 }; // ball 1 (asserted in 16a)
    const t2 = corner16(2);
    const n = Math.hypot(t2.x - b1.x, t2.y - b1.y);
    const cx = b1.x - ((t2.x - b1.x) / n) * 0.35 * D16;
    const cy = b1.y - ((t2.y - b1.y) / n) * 0.35 * D16;
    if (!(await chrome.eval(`__test.placeCue(${cx}, ${cy})`))) {
      fail('16c: L near-rail cue placement rejected');
    }
    const mark16cL = consoleLogs.length;
    await fireAtPoint('16c L wrong pocket', 1, t2, { v0: 2.4, b: -0.2 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || !st.done || st.score !== 0) {
      fail('16c: L wrong-pocket pot did not end the run: ' + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark16cL).some((l) =>
      l.includes('[drills] attempt {"id":"lineup-l"')
      && l.includes('"reason":"pocket"'))) {
      fail('16c: L wrong-pocket attempt did not carry reason pocket');
    }
    // honesty: the record bytes really carry a ball-1 pot into pocket 2
    const evL = await chrome.eval('__test.events()');
    if (!evL.some((e) => e.kind?.BallPocket?.ball === 1
      && e.kind.BallPocket.pocket === 2)) {
      fail('16c: L staging shot did not actually pot ball 1 into pocket 2');
    }
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(200);

  // ---- (d) PLAYABILITY — a scripted real first-ball pot on EVERY variant ----
  // Recipes pinned offline (find-lineup-recipes.mjs: green across shot
  // seeds 1000..1003 and ±0.0015 rad phi jitter). The cue fires from the
  // catalog's DEFAULT laid spot — proving the laid attempt itself is
  // playable — except lineup-random, whose first ball moves with the
  // seeded shuffle: its cue placement rides the live anywhere grant, 1.5D
  // behind the ghost on the pot line.
  // (GH-131 review finding 3: progressive-lineup joins the table — its N=5
  // centered half-diamond lay is THIS diff's geometry; `prog: true` swaps
  // the run-score assert for the progressive wire, whose score stays 0
  // until a rack fully clears — the pass shows as streak 1 at n 5.)
  // GH-134: every recipe re-certified under the clean-contact law (offline
  // probe criterion now requires cueContacts === 1); lineup-diagonal
  // re-pinned — the catalog default cue flipped to the mirrored +45° cut
  // side (the old −55° side crashed the cue into the line on every v0/b).
  // GH-136 re-pins: lineup-l → the ENCLOSED foot-right pocket (5) under
  // the rebuilt geometry (near-straight rail shot from the default cue);
  // lineup-lateral/lat-e2m re-centered on the swept green plateau (the
  // uniform-16-gap law moved the end slots ~57 mm toward the cushions);
  // lat-m2e re-certified unchanged (its center slot stays x = 0).
  const PLAY16 = [
    { id: 'lineup', pocket: 2, v0: 2.2, b: -0.25 },
    { id: 'lineup-e2m', pocket: 2, v0: 2.2, b: -0.25 },
    { id: 'lineup-m2e', pocket: 1, v0: 1.9, b: -0.3 },
    { id: 'lineup-random', pocket: null, v0: 2.4, b: -0.3, place: true },
    { id: 'lineup-lateral', pocket: 2, v0: 2.4, b: -0.2 },
    { id: 'lineup-lat-e2m', pocket: 2, v0: 2.4, b: -0.2 },
    { id: 'lineup-lat-m2e', pocket: 2, v0: 2.4, b: -0.3 },
    { id: 'lineup-l', pocket: 5, v0: 2.0, b: -0.25 },
    // GH-177: ball 1 keeps lineup-l's slot 1 (the permutation moves only
    // ids 2..15), so the L recipe replays byte-identically — re-verified
    // offline under cueContacts === 1 (find-lineup-recipes.mjs)
    { id: 'lineup-l-e2m', pocket: 5, v0: 2.0, b: -0.25 },
    { id: 'lineup-diagonal', pocket: 5, v0: 2.0, b: -0.2 },
    { id: 'progressive-lineup', pocket: 2, v0: 2.4, b: -0.3, prog: true },
  ];
  const sidePockets16 = await chrome.eval('window.__rules.pockets()');
  for (const leg of PLAY16) {
    if (!(await chrome.eval(`window.__drills.start("${leg.id}")`))) {
      fail(`16d: ${leg.id} start refused`);
      continue;
    }
    await sleep(300);
    if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
      fail(`16d: ${leg.id} did not grant the in-hand start`);
    }
    let pocket = leg.pocket;
    if (leg.place) { // random: pocket by ball 1's table half, cue on the line
      const b1 = (await chrome.eval('__test.balls()')).find((b) => b.id === 1);
      const x1 = b1.pos[2], y1 = b1.pos[0];
      pocket = y1 >= 0.75 * D16 ? 2 : y1 <= -0.75 * D16 ? 0 : 1;
      const t = pocket === 1 ? sidePockets16[1] : corner16(pocket);
      const n = Math.hypot(t.x - x1, t.y - y1);
      const cx = x1 - ((t.x - x1) / n) * 1.5 * D16;
      const cy = y1 - ((t.y - y1) / n) * 1.5 * D16;
      if (!(await chrome.eval(`__test.placeCue(${cx}, ${cy})`))) {
        fail('16d: random cue placement rejected');
      }
    }
    const t = pocket === 1 || pocket === 4
      ? sidePockets16[pocket] : corner16(pocket);
    const mark = consoleLogs.length;
    await fireAtPoint(`16d ${leg.id} pot`, 1, t, { v0: leg.v0, b: leg.b });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    const potLanded = leg.prog // progressive: score stays 0 until a rack clears
      ? st && !st.done && st.streak >= 1 && st.n === 5
      : st && !st.done && st.score >= 1;
    if (!potLanded) {
      fail(`16d: ${leg.id} first-ball pot did not land (the unpottable-opening `
        + 'regression class): ' + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark).some((l) =>
      l.includes(`[drills] attempt {"id":"${leg.id}"`) && l.includes('"pass":true'))) {
      fail(`16d: ${leg.id} pass mirror missing`);
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
  }

  // ---- (e) PLAY-COUNT PERMUTATION (GH-131 review finding 2) ------------------
  // The run-kind attempt index k derives from the PERSISTED play count
  // (ob-drills-v1 plays), so lineup-random lays a FRESH permutation each
  // play: play n stages layout(id, n), play n+1 stages layout(id, n+1) —
  // both byte-stable on re-lay (reset() re-derives the SAME k mid-run).
  // The pure __drills.layout(id, k) wire is the oracle; arm 3's k = 0
  // cross-boot byte-compare is untouched. (k = 0 vs 1 permutations were
  // verified distinct offline — the 15!-space Fisher–Yates draw.)
  {
    const n16e = JSON.parse(await chrome.eval(
      'JSON.stringify(window.__drills.bests())'))['lineup-random']?.plays ?? 0;
    const layN = await chrome.eval(
      `JSON.stringify(window.__drills.layout("lineup-random", ${n16e}))`);
    const layN1 = await chrome.eval(
      `JSON.stringify(window.__drills.layout("lineup-random", ${n16e + 1}))`);
    if (layN === layN1) {
      fail(`16e: play-count ${n16e}/${n16e + 1} permutations coincide`);
    }
    const stagedIs = async (layJson, tag) => {
      const pub = JSON.parse(layJson);
      const staged = await chrome.eval('__test.balls()');
      for (const b of pub.balls) {
        if (b.id === 0) continue; // the cue rides the live in-hand grant
        const m = staged.find((s) => s.id === b.id);
        if (!m || Math.abs(m.pos[2] - b.x) > 1e-9
          || Math.abs(m.pos[0] - b.y) > 1e-9) {
          fail(`16e ${tag}: staged ball ${b.id} off the play-count layout`);
          return;
        }
      }
    };
    // play n: the laid table IS layout(id, n); reset re-lays it byte-back
    if (!(await chrome.eval('window.__drills.start("lineup-random")'))) {
      fail('16e: lineup-random start refused');
    }
    await sleep(300);
    await stagedIs(layN, `play ${n16e}`);
    await chrome.eval('window.__drills.reset()');
    await sleep(900);
    await stagedIs(layN, `play ${n16e} re-lay`);
    // a completing (failed) stroke bumps plays to n+1 …
    await fire(chrome, '16e complete', { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || !st.done) {
      fail('16e: staging stroke did not complete the run: ' + JSON.stringify(st));
    }
    const plays16e = JSON.parse(await chrome.eval(
      'JSON.stringify(window.__drills.bests())'))['lineup-random']?.plays;
    if (plays16e !== n16e + 1) {
      fail(`16e: plays ${plays16e} != ${n16e + 1} after the completion`);
    }
    // … and the NEXT play stages the fresh layout(id, n+1) permutation,
    // byte-stable on its own re-lay
    if (!(await chrome.eval('window.__drills.start("lineup-random")'))) {
      fail('16e: lineup-random restart refused');
    }
    await sleep(300);
    await stagedIs(layN1, `play ${n16e + 1}`);
    await chrome.eval('window.__drills.reset()');
    await sleep(900);
    await stagedIs(layN1, `play ${n16e + 1} re-lay`);
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
  }

  // ==== arm 17 (issue GH-134): the clean-contact law ==========================
  // After the cue's FIRST contact (order-enforcement pins it to the
  // designated ball), ANY further cue↔object contact ends the run with the
  // NEW reason 'crash'; cue↔cushion contact stays legal, and object↔object
  // disturbance is NOT a fail (recorded owner boundary — FORMAT.md §2).
  // Recipes pinned offline (find-lineup-recipes.mjs crash-red blocks, green
  // across shot seeds 1000..1003 × ±0.0015 rad phi jitter). NOTE: this arm's
  // number is CLAIMED against the #133/#135 parallel wave — renumber at
  // merge if a sibling lands 17 first.
  const cueContacts17 = (evs) => evs.filter((e) => e.kind?.BallBall
    && (e.kind.BallBall.b1 === 0 || e.kind.BallBall.b2 === 0)).length;
  // ---- 17-red (run evaluate()): lineup — pot ball 1 into the foot-left
  // corner from a foot-rail-right cue (dm(3.0, 7.5) → (1.0D, 3.5D)); the
  // stun tangent slides the cue down the string into ball 2.
  {
    if (!(await chrome.eval('window.__drills.start("lineup")'))) {
      fail('17-red: lineup start refused');
    }
    await sleep(300);
    if (!(await chrome.eval(`__test.placeCue(${1.0 * D16}, ${3.5 * D16})`))) {
      fail('17-red: crash-leg cue placement rejected');
    }
    const mark17 = consoleLogs.length;
    await fireAtPoint('17-red pot-then-crash', 1, corner16(2), { v0: 2.2, b: 0 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || !st.done || st.score !== 0) {
      fail('17-red: pot-then-crash did not end the run: ' + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark17).some((l) =>
      l.includes('[drills] attempt {"id":"lineup"') && l.includes('"reason":"crash"'))) {
      fail('17-red: crash attempt did not carry reason crash');
    }
    // record honesty: the bytes really carry the ball-1 pot AND >= 2
    // cue↔object BallBall events — the pot landed, the crash is real
    const ev17 = await chrome.eval('__test.events()');
    if (!ev17.some((e) => e.kind?.BallPocket?.ball === 1)) {
      fail('17-red: staging shot did not actually pot ball 1');
    }
    if (cueContacts17(ev17) < 2) {
      fail(`17-red: expected >=2 cue contacts in the record, got ${cueContacts17(ev17)}`);
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
  }
  // ---- 17-called (onCalledSettle demotion): lineup-called shares the base
  // string byte-for-byte, so the SAME recipe pots ball 1 (an un-nominated
  // SLOP stroke — a would-be pass) then crashes: the pass demotes to 'crash'
  // and the run ends.
  {
    if (!(await chrome.eval('window.__drills.start("lineup-called")'))) {
      fail('17-called: lineup-called start refused');
    }
    await sleep(300);
    if (!(await chrome.eval(`__test.placeCue(${1.0 * D16}, ${3.5 * D16})`))) {
      fail('17-called: crash-leg cue placement rejected');
    }
    const mark17 = consoleLogs.length;
    await fireAtPoint('17-called pot-then-crash', 1, corner16(2), { v0: 2.2, b: 0 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || !st.done || st.score !== 0) {
      fail('17-called: pot-then-crash did not end the called run: '
        + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark17).some((l) =>
      l.includes('[drills] attempt {"id":"lineup-called"')
      && l.includes('"reason":"crash"'))) {
      fail('17-called: crash attempt did not carry reason crash');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
  }
  // ---- 17-prog (onProgressiveSettle gate): N=5 lay — pot ball 1 (dy 5.0)
  // into the foot-left corner with draw from dm(2.4, 4.5) → (0.4D, 0.5D);
  // the curled cue re-contacts the string. The rack FAILS (N retreats 5→4)
  // but the drill continues (racks budget 8).
  {
    if (!(await chrome.eval('window.__drills.start("progressive-lineup")'))) {
      fail('17-prog: progressive-lineup start refused');
    }
    await sleep(300);
    if (!(await chrome.eval(`__test.placeCue(${0.4 * D16}, ${0.5 * D16})`))) {
      fail('17-prog: crash-leg cue placement rejected');
    }
    const mark17 = consoleLogs.length;
    await fireAtPoint('17-prog pot-then-crash', 1, corner16(2), { v0: 1.8, b: -0.3 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.n !== 4) {
      fail('17-prog: crash did not retreat the rack size 5→4: '
        + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark17).some((l) =>
      l.includes('[drills] attempt {"id":"progressive-lineup"')
      && l.includes('"reason":"crash"'))) {
      fail('17-prog: crash attempt did not carry reason crash');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
  }
  // ---- 17-green: a CLEAN designated pot continues the run — with record
  // honesty (EXACTLY one cue↔object BallBall event; 16d re-proves the
  // continue per variant, this leg pins the predicate's green side).
  {
    if (!(await chrome.eval('window.__drills.start("lineup")'))) {
      fail('17-green: lineup start refused');
    }
    await sleep(300);
    const mark17 = consoleLogs.length;
    await fireAtPoint('17-green clean pot', 1, corner16(2), { v0: 2.2, b: -0.25 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.score < 1) {
      fail('17-green: clean pot did not continue the run: ' + JSON.stringify(st));
    }
    if (!consoleLogs.slice(mark17).some((l) =>
      l.includes('[drills] attempt {"id":"lineup"') && l.includes('"pass":true'))) {
      fail('17-green: pass mirror missing');
    }
    const ev17 = await chrome.eval('__test.events()');
    if (cueContacts17(ev17) !== 1) {
      fail(`17-green: expected exactly 1 cue contact, got ${cueContacts17(ev17)}`);
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
  }

  // ==== arm 23 (issue #323): Replay AFTER the silent continue re-lay =========
  // The shotComplete replay-identity branch keyed 'reschedule a re-lay' on
  // nextTimer === 0 alone, which cannot distinguish 're-lay parked at
  // PLAYBACK entry' (nextFn preserved) from 're-lay already LANDED' (the
  // tick had consumed nextFn) — the landed case fell back to
  // applyAttempt(currentStep()): a FULL attempt lay + placement grant while
  // the run state (score, a.onTable) stayed advanced. The next natural
  // stroke then fouled 'contact' (wrong first ball — lowestOnTable() still
  // read {2..15} against a table wearing the restored ball 1) and killed
  // the run. Fix: nextFn is a LATCH across the landing, so the replay
  // re-settle re-runs the SAME re-lay the drill armed. Legs:
  //   (a) RED pre-fix — lineup ('run'): pot 1, wait for the continue re-lay
  //       to LAND, press HUD Replay, settle: the table must stay the
  //       14-ball continue (ball 1 down, NO ball-in-hand re-grant), the run
  //       state married (score 1 / attempt 1), and the next stroke must NOT
  //       foul wrong-first;
  //   (b) healthy control — Replay INSIDE the NEXT_MS window (timer parked,
  //       the pre-fix-correct path): identical end state;
  //   (c) RED pre-fix, reLayContinue class — progressive-lineup mid-rack:
  //       the landed continue survives a Replay (4-ball table, no phantom
  //       full rack, no BIH re-grant, rack counters untouched);
  //   (d) class pin, applyAttempt-fallback kinds — bu-f2 (ladder): the
  //       landed step-2 re-lay re-runs byte-identically after a Replay and
  //       scoring continuity holds (the pre-fix fallback was coincidentally
  //       correct here; this leg pins that the latch keeps it so).
  {
    const unpocketed = async () => (await chrome.eval('__test.balls()'))
      .filter((b) => !b.pocketed).length;
    const ball1Down = async () => (await chrome.eval('__test.balls()'))
      .find((b) => b.id === 1)?.pocketed === true;
    const replayNow = async (tag) => {
      await chrome.eval('document.getElementById("replay").click()');
      if (await chrome.eval('__test.state()') !== 'PLAYBACK') {
        fail(`${tag}: HUD Replay did not start`);
      }
      await settle(chrome, tag);
    };

    // ---- (a) replay AFTER the landed continue re-lay (RED pre-fix) ----------
    if (!(await chrome.eval('window.__drills.start("lineup")'))) {
      fail('23a: lineup start refused');
    }
    await sleep(300);
    await fireAtPoint('23a pot 1', 1, corner16(2), { v0: 2.2, b: -0.25 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.score !== 1 || st.attempt !== 1) {
      fail('23a: opening pot did not land: ' + JSON.stringify(st));
    }
    await sleep(RELAY_MS); // the silent continue re-lay LANDS (nextFn consumed)
    if (await unpocketed() !== 15 || !(await ball1Down())) {
      fail('23a: continue re-lay did not stage the 14-ball table');
    }
    await replayNow('23a replay');
    await sleep(RELAY_MS); // the replay-identity re-lay window
    if (await unpocketed() !== 15) {
      fail('23a: replay after the landed re-lay reset the table to the FULL '
        + 'attempt layout (15 object balls staged again)');
    }
    if (!(await ball1Down())) fail('23a: replay resurrected the potted ball 1');
    if (await chrome.eval('__test.state()') === 'BALL_IN_HAND') {
      fail('23a: replay after the landed re-lay re-granted BALL_IN_HAND '
        + '(the full-attempt-lay fallback fired)');
    }
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.score !== 1 || st.attempt !== 1) {
      fail('23a: run state diverged across the replay: ' + JSON.stringify(st));
    }
    if (!(await chrome.eval('!!document.getElementById("ob-drill-stop")'))) {
      fail('23a: the in-app replay tore down the drill chrome');
    }
    // the next NATURAL stroke: ghost-aim ball 2 (the lowest on-table ball)
    // — it must never read 'contact' (the wrong-first foul that killed the
    // run pre-fix; pass or plain miss are both healthy verdicts here)
    const mark23a = consoleLogs.length;
    await fireAtPoint('23a next stroke', 2, corner16(2), { v0: 2.2, b: -0.25 });
    await sleep(500);
    if (consoleLogs.slice(mark23a).some((l) =>
      l.includes('[drills] attempt {"id":"lineup"')
      && l.includes('"reason":"contact"'))) {
      fail('23a: the shot after the replay fouled wrong-first-ball '
        + '(run state divorced from the staged table)');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);

    // ---- (b) healthy control: replay INSIDE the window (timer parked) -------
    if (!(await chrome.eval('window.__drills.start("lineup")'))) {
      fail('23b: lineup start refused');
    }
    await sleep(300);
    await fireAtPoint('23b pot 1', 1, corner16(2), { v0: 2.2, b: -0.25 });
    // press Replay IMMEDIATELY — well inside NEXT_MS, the timer parks and
    // nextFn is preserved (the pre-fix-correct branch; must stay correct)
    await replayNow('23b early replay');
    await sleep(RELAY_MS);
    if (await unpocketed() !== 15 || !(await ball1Down())) {
      fail('23b: early replay broke the parked continue re-lay');
    }
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.score !== 1 || st.attempt !== 1) {
      fail('23b: run state diverged across the early replay: '
        + JSON.stringify(st));
    }
    if (await chrome.eval('__test.state()') === 'BALL_IN_HAND') {
      fail('23b: early replay landed a phantom placement grant');
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);

    // ---- (c) reLayContinue class (RED pre-fix): progressive mid-rack ---------
    if (!(await chrome.eval('window.__drills.start("progressive-lineup")'))) {
      fail('23c: progressive-lineup start refused');
    }
    await sleep(300);
    await fireAtPoint('23c pot 1', 1, corner16(2), { v0: 2.4, b: -0.3 });
    await sleep(500);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.streak !== 1 || st.n !== 5 || st.rackTries !== 0) {
      fail('23c: opening pot did not land: ' + JSON.stringify(st));
    }
    await sleep(RELAY_MS); // reLayContinue LANDS: 4 objects + cue
    if (await unpocketed() !== 5 || !(await ball1Down())) {
      fail('23c: mid-rack continue re-lay did not stage the 4-ball table');
    }
    await replayNow('23c replay');
    await sleep(RELAY_MS);
    if (await unpocketed() !== 5) {
      fail('23c: replay after the landed continue re-staged the FULL N=5 rack');
    }
    if (!(await ball1Down())) fail('23c: replay resurrected the potted ball 1');
    if (await chrome.eval('__test.state()') === 'BALL_IN_HAND') {
      fail('23c: replay re-granted BALL_IN_HAND mid-rack (fallback fired)');
    }
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.done || st.streak !== 1 || st.n !== 5 || st.rackTries !== 0
      || st.attempt !== 1) {
      fail('23c: progressive state diverged across the replay: '
        + JSON.stringify(st));
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);

    // ---- (d) applyAttempt-fallback class pin: bu-f2 ladder -------------------
    if (!(await chrome.eval('window.__drills.start("bu-f2")'))) {
      fail('23d: bu-f2 start refused');
    }
    await sleep(300);
    await fireAt(chrome, '23d pass', 1, 2, { v0: 1.6, b: -0.2 });
    await sleep(600);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.pos !== 2 || st.attempt !== 1) {
      fail('23d: step-1 pass did not advance: ' + JSON.stringify(st));
    }
    await sleep(RELAY_MS); // the step-2 attempt lay LANDS
    await replayNow('23d replay');
    await sleep(RELAY_MS);
    // the latched re-lay re-runs applyAttempt(pos - 1) — byte-identical to
    // the landed step-2 lay (and to the pre-fix fallback: green pin)
    const pub23 = JSON.parse(await chrome.eval(
      'JSON.stringify(window.__drills.layout("bu-f2", 1))'));
    const staged23 = await chrome.eval('__test.balls()');
    for (const b of pub23.balls) {
      const m = staged23.find((s) => s.id === b.id);
      if (!m || Math.abs(m.pos[2] - b.x) > 1e-9
        || Math.abs(m.pos[0] - b.y) > 1e-9) {
        fail(`23d: ball ${b.id} off the step-2 layout after the replay`);
      }
    }
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.pos !== 2 || st.attempt !== 1 || st.streak !== 1) {
      fail('23d: ladder state diverged across the replay: '
        + JSON.stringify(st));
    }
    // scoring continuity: the next stroke records attempt 2 (a scripted
    // miss retreats the ladder — table and counters still married)
    await fire(chrome, '23d miss', { v0: 0.45, phi: -Math.PI / 2, theta: 0,
      a: 0, b: 0 });
    await sleep(600);
    st = await chrome.eval('window.__drills.state()');
    if (!st || st.pos !== 1 || st.attempt !== 2) {
      fail('23d: post-replay miss mis-scored: ' + JSON.stringify(st));
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(200);
    console.log('[e2e-drills] arm 23 ok (replay after the landed re-lay keeps '
      + 'the continue table + run state married; parked-window control; '
      + 'progressive + ladder class legs)');
  }

  // ==== arm 19 (issue GH-138): the sandbox terminal gate =======================
  // (renumbered from the parallel claim of arm 17 at merge: #134 kept 17,
  // #144 took 18.)
  // Recipes probed OFFLINE against the committed canonical wasm on the
  // APP-DEFAULT equipment composition (diamond_proam_9ft +
  // stronge_realistic — what this hermetic boot racks; a throwaway clone
  // of the find-lineup-recipes.mjs prober, #134 owns that tool so it is
  // untouched). Chain-pinning discipline (recorded in the OWNERSHIP
  // drills ledger): the 15-leg chain propagates SAMPLER-float32 rest
  // positions (drills.js restPositions bytes — exactly what the run-drill
  // continue re-lays), shot seeds 1000..1014 (rack seed 1 × 1000 +
  // shotIndex), and EVERY leg holds under ±0.0015 rad phi jitter from its
  // in-chain state (leg-local; a fully jitter-PROPAGATED 15-leg chain
  // does not exist — compounding drift — so chain stability rides the
  // bit-exact replay law: the browser recomputes the identical ghost-ball
  // doubles from identical float32 rest positions on the identical wasm.
  // A wasm repin re-probes the chain — the seed-47 precedent).
  const CUE19 = { x: 0.1905, y: 0.53975 }; // (0.60D, 1.70D) — leg-1 'anywhere' grant
  // MERGE-WAVE RE-PIN (GH-134 x GH-138 cross-branch law change): the branch
  // chain was probed WITHOUT the clean-contact rule — its leg 4 potted ball 4
  // then slid the drawn cue into ball 5 ([0,4],[0,5] in the record bytes), a
  // legal pass pre-134 and a 'crash' run-ender post-134. Chain re-probed
  // offline on the merged tree under the SAME discipline (throwaway
  // find-lineup-recipes clone: app-default equipment composition, f64
  // sampler rest propagation, chain seeds 1000..1014, EVERY leg green under
  // +-0.0015 rad leg-local phi jitter, cueContacts === 1 per leg) with
  // backtracking across legs — the leg-4 lineage change re-pinned legs 4..15.
  const CHAIN19 = [
    { leg: 1, tx: -0.606425, ty: 1.241425, v0: 2, b: 0.15 },
    { leg: 2, tx: -0.606425, ty: 1.241425, v0: 2.8, b: 0 },
    { leg: 3, tx: 0.606425, ty: 1.241425, v0: 2.8, b: -0.48 },
    { leg: 4, tx: 0.606425, ty: 1.241425, v0: 1, b: -0.24 },
    { leg: 5, tx: -0.606425, ty: 1.241425, v0: 1, b: -0.36 },
    { leg: 6, tx: -0.606425, ty: 1.241425, v0: 1, b: -0.12 },
    { leg: 7, tx: 0.6905625, ty: 0, v0: 1.3, b: -0.24 },
    { leg: 8, tx: 0.606425, ty: 1.241425, v0: 2, b: 0.3 },
    { leg: 9, tx: -0.606425, ty: -1.241425, v0: 1.6, b: 0.3 },
    { leg: 10, tx: 0.606425, ty: 1.241425, v0: 1, b: -0.48 },
    { leg: 11, tx: 0.606425, ty: 1.241425, v0: 1.3, b: -0.48 },
    { leg: 12, tx: 0.606425, ty: 1.241425, v0: 2.8, b: -0.36 },
    { leg: 13, tx: 0.606425, ty: -1.241425, v0: 2.4, b: -0.48 },
    { leg: 14, tx: -0.606425, ty: -1.241425, v0: 2.4, b: -0.12 },
    { leg: 15, tx: -0.606425, ty: -1.241425, v0: 2, b: -0.36 },
  ];
  const banner19 = () => chrome.eval(`(() => {
    const e = ${END_STATE};
    return { display: e.display, text: e.body.slice(0, 60), title: e.title, banner: e.banner };
  })()`);

  // ---- (a) lineup through ball 9 potted LEGALLY — terminal suppressed --------
  if (!(await chrome.eval('window.__drills.start("lineup")'))) fail('19a: lineup start refused');
  await sleep(300);
  st = await chrome.eval('window.__drills.state()');
  if (st?.sandbox !== true) {
    fail('19a: lineup must carry sandbox:true on the state wire: ' + JSON.stringify(st));
  }
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('19a: lineup did not grant the in-hand start');
  }
  if (!(await chrome.eval(`__test.placeCue(${CUE19.x}, ${CUE19.y})`))) {
    fail('19a: probed cue placement rejected');
  }
  let mark19 = consoleLogs.length;
  for (const leg of CHAIN19) {
    const s = await fireAtPoint(`19 leg ${leg.leg}`, leg.leg,
      { x: leg.tx, y: leg.ty }, { v0: leg.v0, b: leg.b });
    if (leg.leg === 9) {
      // THE repro stroke: a LEGAL 9-pot over the live nineball-v1 fold.
      // Pre-fix this routed WIN ('PLAYER N WINS' + the 2600 ms auto
      // re-rack that killed the run) — the red arm of the red/green proof.
      if (s === 'WIN') fail('19a: legal 9-pot routed WIN during a sandbox drill (the #138 leak)');
      const logs9 = consoleLogs.slice(mark19);
      if (logs9.some((l) => l.includes('[flow] gameWon'))) {
        fail('19a: gameWon fired for a sandbox-drill 9-pot');
      }
      if (!logs9.some((l) => l.includes('[flow] drillTerminalSuppressed'))) {
        fail('19a: drillTerminalSuppressed mirror missing');
      }
      const b9 = await banner19();
      if (b9.display === 'block' && b9.text.includes('WINS')) {
        fail('19a: winner banner leaked: ' + b9.text);
      }
      st = await chrome.eval('window.__drills.state()');
      if (!st || st.done || st.sandbox !== true || st.score !== 9) {
        fail('19a: drill not ACTIVE at score 9 after the 9-pot: ' + JSON.stringify(st));
      }
      // flow's would-be 2600 ms WIN auto re-rack must not exist: no stop,
      // no foreign-seed kill, machine parked in AIM, drill still live
      await sleep(3200);
      if (consoleLogs.slice(mark19).some((l) => l.includes('[drills] stop'))) {
        fail('19a: the run was killed inside the would-be WIN re-rack window');
      }
      st = await chrome.eval('window.__drills.state()');
      if (!st || st.done) fail('19a: drill dead after the settle window: ' + JSON.stringify(st));
      if (await chrome.eval('__test.state()') !== 'AIM') {
        fail('19a: suppressed terminal did not land as a plain AIM settle');
      }
      mark19 = consoleLogs.length; // (b) watches the post-suppression legs
    } else if (leg.leg < 15) { // leg 15 completes the run — (c) asserts it
      await sleep(RELAY_MS); // the run-drill continue re-lay (NEXT_MS)
      st = await chrome.eval('window.__drills.state()');
      if (!st || st.done || st.score !== leg.leg) {
        fail(`19 leg ${leg.leg}: chain broke (want score ${leg.leg}): ` + JSON.stringify(st));
        break;
      }
      // ---- (b) the run CONTINUES past the suppressed terminal --------------
      if (leg.leg === 10) {
        if (!consoleLogs.slice(mark19).some((l) =>
          l.includes('[drills] attempt {"id":"lineup"') && l.includes('"pass":true'))) {
          fail('19b: post-suppression leg did not score');
        }
      }
    }
  }
  // ---- (c) the run COMPLETES cleanly through the full 15-ball clear ----------
  await sleep(500);
  // scoped to mark19 (reset after the leg-9 checks): a global sawLog would
  // false-pass off any earlier arm that happened to full-clear a lineup
  if (!consoleLogs.slice(mark19).some((l) =>
    l.includes('[drills] complete {"id":"lineup","score":15'))) {
    fail('19c: full clear did not complete the drill');
  }
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done || st.score !== 15 || st.sandbox !== true) {
    fail('19c: finished snapshot wrong: ' + JSON.stringify(st));
  }
  const bDone = await banner19();
  if (bDone.display !== 'block' || !bDone.text.includes('Drill complete')) {
    fail('19c: completion notice missing: ' + JSON.stringify(bDone));
  }
  if (bDone.text.includes('WINS') || /WINS/.test(bDone.banner)) {
    fail('19c: flow.winBanner leaked into the completion: ' + JSON.stringify(bDone));
  }
  await sleep(200);

  // ---- (d) fold-observer inverse: ghost9's REAL terminal still fires ---------
  // Offline-probed legal-9 break on ghost9's OWN rack-0 seed (judged legal
  // gameOver by the SDK's judgeShot). Break outcomes are chaotic — NO
  // probed break on racks 0..9 survives even ±0.0002 rad jitter — so this
  // is a BIT-EXACT pin (exact phi double passed through, exact placeCue,
  // the e2e.mjs seed-47 break-WIN precedent): re-probe on any wasm repin.
  const G9 = { rack: 0, cue: { x: -0.08, y: -0.7 }, v0: 8.5, b: 0,
    phi: 1.5059428096792227 };
  if (!(await chrome.eval('window.__drills.start("ghost9")'))) fail('19d: ghost9 start refused');
  await sleep(400);
  st = await chrome.eval('window.__drills.state()');
  if (st?.sandbox !== false) {
    fail('19d: ghost9 must be fold-observer (sandbox:false): ' + JSON.stringify(st));
  }
  for (let r = 0; r < G9.rack; r++) {
    // walk to the probed rack: a no-contact break foul loses each rack
    // (GHOST_BREAK_FOUL_LOSES) and the drill re-racks the next seed
    await fire(chrome, `19d lose rack ${r}`, { v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(2200); // rack verdict + the RACK_MS seeded re-rack
  }
  if (!(await chrome.eval(`__test.placeCue(${G9.cue.x}, ${G9.cue.y})`))) {
    fail('19d: kitchen break placement rejected');
  }
  const markG9 = consoleLogs.length;
  const sG9 = await fire(chrome, '19d ghost9 break',
    { v0: G9.v0, phi: G9.phi, theta: 0, a: 0, b: G9.b });
  if (sG9 !== 'WIN') {
    fail('19d: ghost9 legal-9 break did not route the REAL WIN: ' + sG9);
  }
  if (!consoleLogs.slice(markG9).some((l) => l.includes('[flow] gameWon'))) {
    fail('19d: gameWon mirror missing on the fold-observer terminal');
  }
  if (!consoleLogs.slice(markG9).some((l) =>
    l.includes('[drills] rack {"id":"ghost9"') && l.includes('"verdict":"won"'))) {
    fail('19d: ghost9 won-rack verdict missing');
  }
  await sleep(1600); // the drill's own seeded re-rack pre-empts flow's WIN timer
  await chrome.eval('window.__drills.stop()');
  await sleep(200);

  if (!unwiredNightly('19e')) { // GH-1078: --nightly leaves 19e out while it flakes on the #208 race (#605)
  // ==== arm 19e (issue #209): POST-COMPLETION terminal suppression + relay ====
  // GH-138 x GH-133 x #209 reconciliation. Once a sandbox drill has COMPLETED
  // it parks its `finished` snapshot (still sandbox:true — the GH-133 dock
  // register). The pre-#209 gate (`sandbox && done !== true`) stopped
  // suppressing there, so the still-pinned 9-ball fold went live and a
  // continued 9-pot leaked a REAL "PLAYER WINS" (the owner Bug-2 repro). The
  // relaxed gate suppresses on `sandbox` regardless of `done`, and a continued
  // shot is instead an implicit play-again → soft auto-reset (option b).
  // Repro: clear balls 1..8 (the CHAIN19 prefix), FAIL the run (parks it,
  // exercising the #209 Bug-1 "RUN ENDED" label), then pot the now-lowest
  // ball 9 (a would-be nineball terminal). The 9-pot is aimed LIVE from the
  // actual rest position (nearest pocket, cue on the pot line) — no bit-exact
  // 9-pot recipe is pinned, so this leg survives a wasm repin.
  if (!(await chrome.eval('window.__drills.start("lineup")'))) fail('19e: lineup start refused');
  await sleep(300);
  if (!(await chrome.eval(`__test.placeCue(${CUE19.x}, ${CUE19.y})`))) {
    fail('19e: probed cue placement rejected');
  }
  for (const leg of CHAIN19.slice(0, 8)) { // clear balls 1..8
    await fireAtPoint(`19e leg ${leg.leg}`, leg.leg, { x: leg.tx, y: leg.ty },
      { v0: leg.v0, b: leg.b });
    await sleep(RELAY_MS);
  }
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done || st.score !== 8) {
    fail('19e: CHAIN19 prefix did not clear 1..8 (score 8, active): ' + JSON.stringify(st));
  }
  // FAIL the run with minimal disturbance: a SOFT wrong-order stroke at the
  // head-most ball 15 (the lowest is 9). Low power keeps ball 9 (and its pot
  // lines) at essentially the bit-exact post-leg-8 rest — the same state
  // arm 19a's leg 9 pots from — so the clear-line finder below still has a
  // pocket. The run ends reason 'contact'/'miss'; parks at 8/15 → RUN ENDED.
  const mark19e = consoleLogs.length;
  await fireAt(chrome, '19e fail', 15, 0, { v0: 0.6, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done || st.score !== 8 || st.sandbox !== true) {
    fail('19e: the fail did not park the run at 8/15 sandbox: ' + JSON.stringify(st));
  }
  const b19e = await banner19();
  if (b19e.display !== 'block' || !b19e.text.includes('Run ended')) {
    fail('19e: failed run-end did not show the "Run ended" verdict (#209 Bug 1): '
      + JSON.stringify(b19e));
  }
  if (b19e.text.includes('Drill complete')) {
    fail('19e: a 0<score<15 run-end mislabeled "Drill complete": ' + b19e.text);
  }
  if (!/\b8\/15\b/.test(b19e.title)) fail('19e: notice title lacks the 8/15 score: ' + b19e.title);
  if (consoleLogs.slice(mark19e).some((l) => l.includes('[flow] gameWon'))) {
    fail('19e: the fail shot spuriously fired gameWon');
  }
  // ball 9 is now the LOWEST on the table — pot it (a would-be nineball
  // terminal). Find a pocket whose pot line for ball 9 is CLEAR of the other
  // balls, place the cue collinear behind it (a straight pot, draw to avoid a
  // scratch that would spoil the clean terminal), and fire. Computed LIVE, so
  // no bit-exact 9-pot recipe is pinned (survives a wasm repin).
  const pk19 = await chrome.eval('window.__rules.pockets()');
  const R19 = await chrome.eval('window.__drills.ballR()');
  const balls19 = (await chrome.eval('__test.balls()'))
    .filter((b) => !b.pocketed).map((b) => ({ id: b.id, x: b.pos[2], y: b.pos[0] }));
  const b9 = balls19.find((b) => b.id === 9);
  if (!b9) fail('19e: ball 9 left the table before the terminal probe');
  const segClear = (ax, ay, bx, by, ignore, clr) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    return balls19.every((o) => {
      if (o.id === 9 || o.id === 0 || ignore.includes(o.id)) return true;
      let t = ((o.x - ax) * dx + (o.y - ay) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(o.x - (ax + t * dx), o.y - (ay + t * dy)) >= clr;
    });
  };
  {
    let picked = null;
    for (let pi = 0; pi < pk19.length && !picked; pi++) {
      const p = pk19[pi];
      if (!segClear(b9.x, b9.y, p.x, p.y, [], 2.1 * R19)) continue; // ball9→pocket
      const nn = Math.hypot(p.x - b9.x, p.y - b9.y);
      const ux = (p.x - b9.x) / nn, uy = (p.y - b9.y) / nn;
      for (const dist of [1.4, 1.1, 1.8, 2.2]) {
        const cx = b9.x - ux * dist * D16, cy = b9.y - uy * dist * D16;
        if (Math.abs(cx) > 2 * D16 - R19 || Math.abs(cy) > 4 * D16 - R19) continue;
        if (!segClear(cx, cy, b9.x, b9.y, [], 2.1 * R19)) continue; // cue→ball9
        if (await chrome.eval(`__test.placeCue(${cx}, ${cy})`)) {
          picked = pi; break;
        }
      }
    }
    if (picked === null) {
      fail('19e: no clear 9-pot line found (re-tune on a wasm repin)');
    } else {
      const mark19e9 = consoleLogs.length;
      const s9 = await fireAt(chrome, '19e 9-pot', 9, picked, { v0: 2.6, b: -0.25 });
      await sleep(500);
      // honesty: the record really potted ball 9 (a genuine would-be terminal)
      const ev9 = await chrome.eval('__test.events()');
      if (!ev9.some((e) => e.kind?.BallPocket?.ball === 9)) {
        fail('19e: the staging shot did not actually pot ball 9 (no would-be '
          + 'terminal — re-tune the 9-pot on a wasm repin)');
      }
      // the would-be nineball terminal MUST be suppressed post-completion
      if (s9 === 'WIN') {
        fail('19e: continued 9-pot routed a match WIN after completion (#209 Bug-2 leak)');
      }
      if (consoleLogs.slice(mark19e9).some((l) => l.includes('[flow] gameWon'))) {
        fail('19e: gameWon fired for a post-completion sandbox 9-pot (#209 Bug-2 leak)');
      }
      if (!consoleLogs.slice(mark19e9).some((l) =>
        l.includes('[flow] drillTerminalSuppressed'))) {
        fail('19e: post-completion terminal not suppressed (mirror missing)');
      }
      const bWin = await banner19();
      if (bWin.display === 'block' && bWin.text.includes('WINS')) {
        fail('19e: winner banner leaked after completion: ' + bWin.text);
      }
    }
  }
  // option (b): the continued shot is an implicit play-again → soft auto-reset
  await sleep(RELAY_MS);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done !== false || st.id !== 'lineup' || st.score !== 0
    || st.sandbox !== true) {
    fail('19e: continued play did not auto-re-lay the drill (option b): '
      + JSON.stringify(st));
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(200);

  } // arm 19e (NIGHTLY_UNWIRED)

  if (!unwiredNightly('19f')) { // GH-1078: --nightly leaves 19f out while it flakes on the #208 race (#605)
  // ==== arm 19f (issue #208 review — auto-reset FIRE-TIME race) ===============
  // The option-(b) auto-reset (arm 19e) arms a NEXT_MS (1400 ms) setTimeout
  // when a continued shot settles over a PARKED sandbox drill. The pre-fix
  // fire-time guard re-checked only !active/finished.sandbox — NOT
  // machine.state — so a SECOND continued shot fired INSIDE that 1400 ms window
  // had the stale timer fire mid-PLAYBACK: restartRun → start →
  // game.layout()/rerack() setState('AIM') ABORTED the in-flight stroke and
  // misscored it. The fix re-checks PLAYBACK/SIMULATING at fire time so the
  // stale timer no-ops; the second shot's OWN settle re-arms a fresh
  // auto-reset, so the re-lay merely DEFERS until settle. RED on the pre-fix
  // tip (a [drills] reset fires mid-shot / the drill restarts); GREEN after.
  if (!(await chrome.eval('window.__drills.start("lineup")'))) fail('19f: lineup start refused');
  await sleep(300);
  if (!(await chrome.eval(`__test.placeCue(${CUE19.x}, ${CUE19.y})`))) {
    fail('19f: probed cue placement rejected');
  }
  // park a sandbox drill: one soft dry stroke (+x, away from the x≈0 ball
  // string — no pot, no contact) fails the run and parks it at 0/15
  await fire(chrome, '19f park', { v0: 0.6, phi: 0, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st || !st.done || st.sandbox !== true) {
    fail('19f: setup did not park a sandbox drill: ' + JSON.stringify(st));
  }
  // shot A: the FIRST continued shot → arms the auto-reset timer (+NEXT_MS).
  // Detect its settle TIGHTLY (≤50 ms) so the timer's fire time is known.
  {
    const errA = await chrome.eval(`__test.shoot(${JSON.stringify(
      { v0: 1.4, phi: 0, theta: 0, a: 0, b: 0 })})`);
    if (errA) fail('19f: continued shot A rejected: ' + errA);
    let sA = await chrome.eval('__test.state()');
    for (let i = 0; i < 40 && sA !== 'PLAYBACK' && sA !== 'SIMULATING'; i++) {
      await sleep(25); sA = await chrome.eval('__test.state()');
    }
    for (let i = 0; i < 400 && (sA === 'PLAYBACK' || sA === 'SIMULATING'); i++) {
      await sleep(50); sA = await chrome.eval('__test.state()');
    }
    if (sA === 'PLAYBACK' || sA === 'SIMULATING') fail('19f: shot A never settled');
  }
  // T0 ≈ now; the auto-reset timer fires in ~1400 ms. Fire the SECOND shot
  // INSIDE that window (well before 1400 ms) so the timer fires while this
  // stroke is still mid-PLAYBACK. 700 ms, not 1100 (GH-370 regate wall):
  // the timer anchors at shot A's SETTLE, the suite detects that settle up
  // to ~70 ms late, and on a loaded shared-CI box the two evals between
  // the sleep and the stroke can eat the remaining ~230 ms margin — the
  // timer then fires legitimately BETWEEN the shots (product-correct) and
  // the arm misreads it as the #208 race. The wider margin keeps the arm
  // deterministic; B's multi-second playback still spans the fire point.
  await sleep(700);
  const markB19 = consoleLogs.length;
  const errB = await chrome.eval(`__test.shoot(${JSON.stringify(
    { v0: 2.4, phi: Math.PI, theta: 0, a: 0, b: 0 })})`);
  if (errB) fail('19f: second shot B rejected: ' + errB);
  {
    let sB = await chrome.eval('__test.state()');
    for (let i = 0; i < 20 && sB !== 'PLAYBACK' && sB !== 'SIMULATING'; i++) {
      await sleep(20); sB = await chrome.eval('__test.state()');
    }
    if (sB !== 'PLAYBACK' && sB !== 'SIMULATING') {
      fail('19f: second shot did not enter playback (setup): ' + sB);
    }
  }
  // cross the timer's fire point (~250 ms into B's playback) and assert the
  // stale auto-reset did NOT restart the drill mid-shot
  await sleep(500);
  const stMid19 = await chrome.eval('window.__drills.state()');
  const resetMid19 = consoleLogs.slice(markB19).some((l) =>
    l.includes('[drills] reset') || l.includes('[drills] resetRefused'));
  if (resetMid19 || (stMid19 && stMid19.done === false)) {
    fail('19f: auto-reset fired during the in-flight second shot (issue #208 '
      + 'race) — the stroke was aborted/misscored: ' + JSON.stringify(stMid19));
  }
  // the re-lay only DEFERS: once the second shot settles, ITS own settle
  // re-arms a fresh auto-reset and the drill re-lays (option b, fresh run)
  await settle(chrome, '19f second shot');
  await sleep(RELAY_MS);
  st = await chrome.eval('window.__drills.state()');
  if (!st || st.done !== false || st.id !== 'lineup' || st.score !== 0
    || st.sandbox !== true) {
    fail('19f: deferred auto-reset did not re-lay after the second shot '
      + 'settled: ' + JSON.stringify(st));
  }
  console.log('[e2e-drills] arm 19f ok (second-shot auto-reset race: the stale '
    + 'timer no-ops mid-playback; the re-lay defers to settle)');
  await chrome.eval('window.__drills.stop()');
  await sleep(200);

  } // arm 19f (NIGHTLY_UNWIRED)

  // ==== arm 20 (issue #135): additive settings-card seam bytes ===============
  // (Renumbered at the merge wave from its arm-17 claim: 17/18/19 went
  // to #134/#144/#138.) The settings practice pane renders its
  // one-tap last-played card from two additive seam members: last() (the
  // persisted `last` id, KNOWN-id sanitized) and the rating chart cloned
  // onto list() entries (the #119 bands, so the pane can echo the picker's
  // rated best line). Assert last() mirrors the persisted blob bytes and
  // every list() rating deep-equals the catalog's published chart.
  const catalog20 = await import(
    pathToFileURL(path.join(webDir, 'app/drills/catalog.js')).href);
  const seam20 = JSON.parse(await chrome.eval(`JSON.stringify({
    last: window.__drills.last(),
    blobLast: JSON.parse(localStorage.getItem('ob-drills-v1') ?? 'null')
      ?.last ?? null,
    ratings: Object.fromEntries(window.__drills.list()
      .map((e) => [e.id, e.rating ?? null])) })`));
  if (typeof seam20.last !== 'string' || !seam20.last.length) {
    fail(`arm 20: last() not a drill id after the arms above: ${seam20.last}`);
  }
  if (seam20.last !== seam20.blobLast) {
    fail(`arm 20: last() '${seam20.last}' != blob.last '${seam20.blobLast}'`);
  }
  if (!catalog20.DRILLS.some((d) => Array.isArray(d.rating))) {
    fail('arm 20: no rated drill in the catalog (vacuous rating check)');
  }
  for (const d of catalog20.DRILLS) {
    const want = Array.isArray(d.rating)
      ? d.rating.map((b) => ({ max: b.max, label: b.label })) : null;
    if (JSON.stringify(seam20.ratings[d.id] ?? null) !== JSON.stringify(want)) {
      fail(`arm 20: list() rating for '${d.id}' diverges from the catalog`);
    }
  }
  console.log(`[e2e-drills] arm 20 ok (last '${seam20.last}' mirrors the `
    + `blob; ${catalog20.DRILLS.length} rating charts byte-equal)`);

  // ==== arm 21 (issue GH-200): best score keyed by the assist mode ===========
  // The same drill under two assist modes keeps two INDEPENDENT bests; the
  // seam splits into bests() (flat ACTIVE-mode projection — the pre-200
  // shape) and bestsByAssist() (the full v2 map); the picker best line
  // follows the active mode live and carries the assist tag; a run LATCHES
  // its mode at start and only ever ESCALATES on a mid-run flip.
  const pre21 = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.bestsByAssist())'));
  const std21 = pre21.circle?.standard;
  if (typeof std21?.best !== 'number' || pre21.circle?.off !== undefined) {
    fail('arm 21: expected a standard-only circle record after the arms above: '
      + JSON.stringify(pre21.circle));
  }
  await chrome.eval(`window.__settings.set('assist', 'off')`);
  await sleep(300);
  // (a) projection law: bests() is the ACTIVE mode's view — no off record yet
  if (await chrome.eval(
    'JSON.stringify(window.__drills.bests().circle ?? null)') !== 'null') {
    fail('arm 21: bests() leaked a foreign-mode record under assist=off');
  }
  // (b) the picker best line reads the ACTIVE mode: not-played under 'off'
  const line21 = await chrome.eval(`(() => {
    window.__drills.open();
    const s = document.querySelector('[data-best="circle"]').textContent;
    window.__drills.close();
    return { s, np: window.__i18n.t('drills.notPlayed'),
      tag: window.__i18n.t('drills.assist.off') };
  })()`);
  if (line21.s !== line21.np) {
    fail('arm 21: picker best line not not-played under the unplayed mode: '
      + line21.s);
  }
  // (c) complete a run under 'off' (the arm-6b instant-exit recipe): the
  // write lands under the latched mode, the standard best stays untouched
  if (!(await chrome.eval('window.__drills.start("circle")'))) {
    fail('arm 21: circle start refused');
  }
  await sleep(300);
  st = await chrome.eval('window.__drills.state()');
  if (st?.assist !== 'off') {
    fail('arm 21: run did not latch assist=off: ' + JSON.stringify(st));
  }
  await fire(chrome, 'arm 21 circle exit',
    { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  st = await chrome.eval('window.__drills.state()');
  if (!st?.done || st.score !== 0) {
    fail('arm 21: exit did not complete at 0: ' + JSON.stringify(st));
  }
  const b21 = await chrome.eval(END_STATE);
  // GH-668 B-PR05 / R11: the end notice names NO assist mode (the record is
  // keyed by mode; the picker best line — leg (d) — names it); it is up
  if (!b21.up || b21.text.includes(line21.tag)) {
    fail('arm 21: end notice must be up WITHOUT the assist tag (R11): ' + JSON.stringify(b21));
  }
  const blob21 = JSON.parse(await chrome.eval(
    'localStorage.getItem("ob-drills-v1")') ?? 'null');
  const c21 = blob21?.drills?.circle;
  if (blob21?.v !== 2 || c21?.off?.best !== 0 || c21?.off?.plays !== 1) {
    fail('arm 21: off-mode record wrong: ' + JSON.stringify(c21));
  }
  if (JSON.stringify(c21?.standard) !== JSON.stringify(std21)) {
    fail('arm 21: the standard-mode best was not independent: '
      + JSON.stringify({ was: std21, now: c21?.standard }));
  }
  if (!(c21.off.ts >= c21.standard.ts)) {
    fail('arm 21: off-mode ts not the newest (cross-mode recency source): '
      + JSON.stringify(c21));
  }
  const line21b = await chrome.eval(`(() => {
    window.__drills.open();
    const s = document.querySelector('[data-best="circle"]').textContent;
    window.__drills.close();
    return s;
  })()`);
  if (!line21b.includes('0/') || !line21b.includes(line21.tag)) {
    fail('arm 21: picker line not the active-mode best + tag: ' + line21b);
  }
  await chrome.eval('window.__drills.stop()'); // clear the banner chain
  // (d) mid-run latch: escalation only — off→practice sticks, a later
  // de-escalation to off never lowers the latched credit
  if (!(await chrome.eval('window.__drills.start("circle")'))) {
    fail('arm 21d: circle start refused');
  }
  await sleep(300);
  await chrome.eval(`window.__settings.set('assist', 'practice')`);
  await sleep(100);
  st = await chrome.eval('window.__drills.state()');
  if (st?.assist !== 'practice') {
    fail('arm 21d: mid-run flip did not escalate the latch: ' + JSON.stringify(st));
  }
  await chrome.eval(`window.__settings.set('assist', 'off')`);
  await sleep(100);
  st = await chrome.eval('window.__drills.state()');
  if (st?.assist !== 'practice') {
    fail('arm 21d: latch de-escalated on the off flip: ' + JSON.stringify(st));
  }
  await chrome.eval('window.__drills.stop()');
  // restore the default axis value for every arm below
  await chrome.eval(`window.__settings.set('assist', 'standard')`);
  await sleep(200);
  const back21 = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.bests().circle ?? null)'));
  if (back21?.best !== std21.best) {
    fail('arm 21: flipping back did not restore the standard projection: '
      + JSON.stringify(back21));
  }
  console.log('[e2e-drills] arm 21 ok (independent per-assist bests; '
    + 'active-mode projection + picker line + banner tag; latch escalation)');

  } // !FASTLANE (arms 12-21)

  // ==== snake arms (issue #80) ================================================
  // Baked physics recipes probed OFFLINE against the committed canonical
  // wasm (web/tools/find-snake-recipes.mjs — robust across the shot seeds
  // this scripted run produces, 1000..1003, and a ±0.0015 rad phi jitter).
  const SPOT = { // SNOOKER_LAYOUT colour spots (drift-tested kernel mirror)
    16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 },
    18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 },
    20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 },
  };
  const BAULK_Y = -1.0475, D_R = 0.292;
  const YEL = { cue: { x: -0.08, y: -1.2075 }, phi: 0.39018880241900006, v0: 2.6 };
  const GRN = { cue: { x: 0.12, y: -1.0475 }, phi: 3.1155926535897933, v0: 3.2 };
  // pin the rack seed the recipes were probed under (arm 11b left 777)
  await chrome.eval('__test.rerack(1)');
  await sleep(300);

  // ---- arm s1: discipline pin + layout exactness + the D grant --------------
  const snakePre = await chrome.eval(
    'JSON.stringify(window.__drills.layout("colours-clear", 0))');
  if (snakePre !== snakeLayoutA) {
    fail('s1: snake layout drifted with the active table (must be table-independent)');
  }
  if (!(await chrome.eval('window.__drills.start("colours-clear")'))) fail('snake start refused');
  await sleep(600); // game switch broadcast + table rebuild slack
  if (await chrome.eval('window.__rules.game()') !== 'snooker') {
    fail('s1: snake start did not pin the snooker discipline');
  }
  const pinned = await chrome.eval('window.__settings.get()');
  if (pinned.mode !== 'practice' || pinned.game !== 'snooker') {
    fail('s1: settings not pinned (mode/game): ' + JSON.stringify(
      { mode: pinned.mode, game: pinned.game }));
  }
  const snakeStage = await chrome.eval('__test.balls()');
  if (snakeStage.length !== 22) fail(`s1: snooker frame staged ${snakeStage.length} balls, want 22`);
  const upIds = snakeStage.filter((b) => !b.pocketed).map((b) => b.id).sort((a, b) => a - b);
  if (JSON.stringify(upIds) !== '[0,16,17,18,19,20,21]') {
    fail('s1: reds not hidden / colours missing: ' + JSON.stringify(upIds));
  }
  for (const id of [16, 17, 18, 19, 20, 21]) {
    const b = snakeStage.find((x) => x.id === id);
    if (Math.abs(b.pos[2] - SPOT[id].x) > 1e-9 || Math.abs(b.pos[0] - SPOT[id].y) > 1e-9) {
      fail(`s1: colour ${id} off its spot: ` + JSON.stringify(b.pos));
    }
  }
  const m1 = await chrome.eval('window.__rules.matchState()');
  if (m1?.phase !== 'final_colours' || m1?.ballOn !== 16) {
    fail('s1: fold not shaped to final_colours/yellow-on: ' + JSON.stringify(m1));
  }
  // GH-382 decision 2 (owner sign-off on issue #382, 2026-08-07: practice
  // does NOT follow the decision-1 default flip): the colours drill runs
  // the FROZEN snooker-v1 fold — the run pins the FR-005 v1 alias
  // transiently even though the live snooker default now resolves the
  // wpbsa-snooker-full completion preset. RED without the drills.js pin:
  // the fold below would carry the v2 variant block.
  if (await chrome.eval('window.__rules.variant()') !== null) {
    fail('s1: colours drill fold must be the frozen v1 engine (练习不跟): '
      + JSON.stringify(await chrome.eval('window.__rules.variant()')));
  }
  if (await chrome.eval(
    `window.__settings.variantFor('snooker')`) !== 'wpbsa-snooker') {
    fail('s1: colours drill must pin the v1 alias transiently');
  }
  if (await chrome.eval(
    `JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}')
      ?.variants?.snooker ?? null`) !== null) {
    fail('s1: the drill pin must never persist (transient lane only)');
  }
  if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
    fail('s1: snake did not grant the in-hand-in-the-D start');
  }
  // the 'd' grant clamps an out-of-D request onto the D boundary (the
  // game.js placeCueInD law — proves the grant routes the D clamp)
  if (!(await chrome.eval('__test.placeCue(0.6, -1.3)'))) fail('s1: D placement call failed');
  const dPos = (await chrome.eval('__test.balls()')).find((b) => b.id === 0).pos;
  const dScale = D_R / Math.hypot(0.6, -1.3 - BAULK_Y);
  if (Math.abs(dPos[2] - 0.6 * dScale) > 1e-6
    || Math.abs(dPos[0] - (BAULK_Y + (-1.3 - BAULK_Y) * dScale)) > 1e-6) {
    fail(`s1: out-of-D request did not clamp onto the D boundary: ${dPos}`);
  }
  let st80 = await chrome.eval('window.__drills.state()');
  if (!st80 || st80.discipline !== 'snooker' || st80.kind !== 'sequence'
    // issue GH-138: the sequence observer is FOLD-OBSERVER on the sandbox
    // wire — its real WIN routing (arm s5's winRelayTimer window) must
    // never be gated by flow's sandbox terminal gate
    || st80.sandbox !== false) {
    fail('s1: state wire lacks the discipline/kind/sandbox: ' + JSON.stringify(st80));
  }
  // #81 finding 5, inverse leg: with the snooker discipline ACTIVE the
  // snake card is in-discipline (no requirement badge) while pool cards
  // now declare the 9-Ball switch
  await chrome.eval('window.__drills.open()');
  await sleep(300);
  const reqS1 = await chrome.eval(`(() => {
    const g = (id) => {
      const el = document.querySelector('#ob-drills-panel [data-req="' + id + '"]');
      return el ? getComputedStyle(el).display : null;
    };
    return { snake: g("colours-clear"), pool: g('bu-f2') };
  })()`);
  if (reqS1.snake !== 'none' || reqS1.pool === null || reqS1.pool === 'none') {
    fail('s1: requirement badges wrong on the snooker table: '
      + JSON.stringify(reqS1));
  }
  await chrome.eval('window.__drills.close()');
  await sleep(200);

  // GH-1042: snooker racks strike with the SELECTED cue now, and the snake start's switch into snooker adopted the
  // discipline default snooker_ash. YEL / GRN were probed on eng.snookerRack(1), the kernel default pairing's
  // 'standard' cue (find-snake-recipes.mjs); with snooker_ash neither pots on any of the run's shot seeds 1000..1003.
  // These arms' subject is the sequence law and the respot cycle, not the strike, so they select the cue the recipes
  // were probed on — the in-place cue swap, which never re-racks, so the running drill is untouched; the discipline
  // cue's strike is e2e-settings D2g's subject.
  {
    await chrome.eval(`window.__settings.changeEquipment('cue_id', 'standard', { skipConfirm: true })`);
    let cuePinned = false;
    for (let i = 0; i < 60 && !cuePinned; i++) {
      cuePinned = await chrome.eval(`(window.__test.equipment() || {}).cue_id === 'standard'`);
      if (!cuePinned) await sleep(200);
    }
    if (!cuePinned) fail('snake arms: the standard cue never reached the snooker rack template (GH-1042 cue pin)');
    const live = await chrome.eval('window.__drills.state()');
    if (!live || live.k !== 0 || live.done || await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
      fail('snake arms: the cue pin disturbed the running drill: ' + JSON.stringify(live));
    }
  }

  // ---- arm s3: in-order yellow pot (stays down) + foul ends the run ---------
  if (!(await chrome.eval(`__test.placeCue(${YEL.cue.x}, ${YEL.cue.y})`))) {
    fail('s3: in-D cue address rejected');
  }
  await fire(chrome, 's3 yellow pot', { v0: YEL.v0, phi: YEL.phi, theta: 0, a: 0, b: 0 });
  await sleep(400);
  st80 = await chrome.eval('window.__drills.state()');
  if (!st80 || st80.k !== 1 || st80.score !== 1 || st80.streak !== 1 || st80.done) {
    fail('s3: yellow pot did not advance the sequence: ' + JSON.stringify(st80));
  }
  let j80 = await chrome.eval('window.__rules.judgment()');
  if (!j80?.legal || JSON.stringify(j80?.pocketed) !== '[16]'
    || (j80?.respot?.length ?? -1) !== 0) {
    fail('s3: yellow must stay DOWN (R3(h)(ii)): ' + JSON.stringify(
      { legal: j80?.legal, pocketed: j80?.pocketed, respot: j80?.respot }));
  }
  if (!(await chrome.eval('__test.balls()')).find((b) => b.id === 16).pocketed) {
    fail('s3: potted yellow returned to the table');
  }
  if (!sawLog('[drills] attempt {"id":"colours-clear","attempt":1,"pass":true')) {
    fail('s3: pass attempt mirror not printed');
  }
  // green on now — a soft no-contact stroke is a FOUL: the run ends at 1
  await fire(chrome, 's3 miss', { v0: 0.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(400);
  st80 = await chrome.eval('window.__drills.state()');
  if (!st80 || !st80.done || st80.score !== 1) {
    fail('s3: foul did not end the run at score 1: ' + JSON.stringify(st80));
  }
  if (!sawLog('"reason":"foul"')) fail('s3: foul reason mirror not printed');
  if (!sawLog('[drills] complete {"id":"colours-clear"')) fail('s3: complete mirror not printed');
  const blob80 = JSON.parse(await chrome.eval(
    'localStorage.getItem("ob-drills-v1")') ?? 'null');
  if (blob80?.drills?.["colours-clear"]?.standard?.best !== 1) { // GH-200 v2 shape
    fail('s3: snake best not persisted: ' + JSON.stringify(blob80?.drills?.["colours-clear"]));
  }

  // ---- arm s4: out-of-order pot = foul scored as a miss + the respot cycle --
  if (!(await chrome.eval('window.__drills.start("colours-clear")'))) fail('s4: restart refused');
  await sleep(400);
  if (!(await chrome.eval(`__test.placeCue(${GRN.cue.x}, ${GRN.cue.y})`))) {
    fail('s4: in-D cue address rejected');
  }
  await fire(chrome, 's4 green out of order', { v0: GRN.v0, phi: GRN.phi, theta: 0, a: 0, b: 0 });
  await sleep(400);
  st80 = await chrome.eval('window.__drills.state()');
  if (!st80 || !st80.done || st80.score !== 0 || st80.k !== 0) {
    fail('s4: out-of-order pot did not end the run at 0: ' + JSON.stringify(st80));
  }
  j80 = await chrome.eval('window.__rules.judgment()');
  if (j80?.legal !== false
    || !j80?.fouls?.some((f) => f.code === 'wrong-first-ball')
    || JSON.stringify(j80?.respot) !== '[17]') {
    fail('s4: expected the cited wrong-first-ball + respot [17]: '
      + JSON.stringify({ legal: j80?.legal, fouls: j80?.fouls, respot: j80?.respot }));
  }
  // the respot CYCLE: snooker law parks the foul on the R13 play-again
  // option first — the fouled-in colour returns when it resolves (the
  // e2e-snooker S5 lane; flow.js applies the pure snookerRespotPlan, the
  // drill never duplicates respot math). Resolve it: offender plays again.
  if (await chrome.eval('window.__rules.decide(2)') !== true) {
    fail('s4: play_again resolution rejected');
  }
  await sleep(200);
  const green4 = (await chrome.eval('__test.balls()')).find((b) => b.id === 17);
  if (green4.pocketed || Math.abs(green4.pos[2] - SPOT[17].x) > 1e-6
    || Math.abs(green4.pos[0] - SPOT[17].y) > 1e-6) {
    fail('s4: fouled-in green not respotted on its own spot: '
      + JSON.stringify(green4.pos));
  }
  if (!sawLog('[flow] respotApplied')) fail('s4: respotApplied wire not printed');
  const bests80 = await chrome.eval('window.__drills.bests()');
  if (bests80?.["colours-clear"]?.best !== 1 || bests80?.["colours-clear"]?.plays !== 2) {
    fail('s4: snake progress wrong after the 0 run: ' + JSON.stringify(bests80?.["colours-clear"]));
  }

  if (!FASTLANE) { // GH-1078: arms s5, s6, sL not in the --fastlane subset
  // ---- arm s5: black-terminal WIN window — the runner's own re-lay beats
  // flow's 2600 ms auto re-rack and the completion banner survives ------------
  if (!(await chrome.eval('window.__drills.start("colours-clear")'))) fail('s5: restart refused');
  await sleep(400);
  // shape the endgame through the sanctioned fold seam (the e2e-snooker
  // phase-shaping precedent): black on, scores not tied — ANY foul now
  // ends the FRAME (R4(b) foul-on-black), the cheapest terminal to script
  if (!(await chrome.eval('window.__rules.setMatchState({ phase: "final_colours",'
    + ' ballOn: 21, onTable: [21], scores: { 1: 30, 2: 0 }, shooter: 1 })'))) {
    fail('s5: fold shaping rejected');
  }
  if (await fire(chrome, 's5 black-on foul', { v0: 0.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('s5: black-on foul did not end the frame (WIN)');
  }
  st80 = await chrome.eval('window.__drills.state()');
  if (!st80 || !st80.done || st80.score !== 0) {
    fail('s5: terminal did not complete the drill: ' + JSON.stringify(st80));
  }
  // atomic with the WIN edge (see settle()) — the runner's own 1.3 s fresh
  // frame nulls the fold (asserted below), so a separate read races it
  j80 = settled.judgment;
  if (j80?.terminal?.reason !== 'foul-on-black') {
    fail('s5: expected the R4(b) foul-on-black terminal: ' + JSON.stringify(j80?.terminal));
  }
  const bannerNow = () => chrome.eval(`(() => {
    const e = ${END_STATE};
    const b = document.getElementById('banner');
    return { display: e.display, foul: b.classList.contains('foul') && b.style.display === 'block',
      text: e.body.slice(0, 40), banner: e.banner };
  })()`);
  let b5 = await bannerNow();
  if (b5.display !== 'block' || !b5.text.includes('Drill complete')) {
    fail('s5: completion banner not up at the terminal: ' + JSON.stringify(b5));
  }
  // the runner's own fresh frame lands at RACK_MS (1300 ms) — well before
  // flow's 2600 ms WIN re-rack, whose AIM transition it thereby cancels.
  // GH-370: the fresh frame then grants the opening in-hand right on/within
  // the D (WPBSA Sec2 R9(a)(i) + Sec3 R5) — BALL_IN_HAND, right 'd_zone'
  await sleep(1800);
  {
    let s5s = await chrome.eval('__test.state()');
    for (let i = 0; i < 15 && s5s !== 'BALL_IN_HAND'; i++) {
      await sleep(200); s5s = await chrome.eval('__test.state()');
    }
    if (s5s !== 'BALL_IN_HAND') {
      fail('s5: the post-terminal fresh frame did not land in the opening '
        + 'BALL_IN_HAND: ' + s5s);
    }
    if (await chrome.eval('window.__rules.placementRight()') !== 'd_zone') {
      fail('s5: fresh-frame opening right not d_zone (Sec3 R5)');
    }
  }
  if ((await chrome.eval('__test.balls()')).filter((b) => !b.pocketed).length !== 22) {
    fail('s5: post-terminal frame not a fresh 22-ball rack');
  }
  if (await chrome.eval('window.__rules.judgment()') !== null) {
    fail('s5: post-terminal frame did not reset the fold');
  }
  // past flow's 2600 ms mark + the drill's 2700 ms re-assert: still up.
  // (had flow's WIN re-rack fired, the post-run guard would have killed
  // the banner on that foreign {seed} — survival IS the pre-emption proof)
  await sleep(1400);
  b5 = await bannerNow();
  if (b5.display !== 'block' || b5.foul || b5.banner || !b5.text.includes('Drill complete')) {
    fail('s5: completion banner did not survive the WIN window: ' + JSON.stringify(b5));
  }

  // ---- arm s6: teardown from the snooker context (the arm-11 law) -----------
  if (!(await chrome.eval('window.__drills.start("colours-clear")'))) fail('s6: restart refused');
  await sleep(400);
  const rect6 = await stopRect();
  if (!rect6) fail('s6: no STOP button on the snake run');
  const mark6 = consoleLogs.length;
  await chrome.eval('__test.rerack(777)');
  await sleep(300);
  if (!consoleLogs.slice(mark6).some((l) => l.includes('[drills] stop {"id":"colours-clear"}'))) {
    fail('s6: foreign rerack did not silent-stop the snake drill');
  }
  await assertTorn('s6 foreign rerack (snooker)', rect6);
  // GH-382 decision 2, the release half: stop() restored the persisted
  // working map — with nothing persisted the NEXT fresh frame resolves
  // the decision-1 live default again (the pin is run-scoped, 练习不跟
  // never outlives the drill)
  if (await chrome.eval(
    `window.__settings.variantFor('snooker')`) !== 'wpbsa-snooker-full') {
    fail('s6: drill stop must release the transient v1 pin (live default '
      + 'resumes): ' + JSON.stringify(await chrome.eval(
      `window.__settings.variantFor('snooker')`)));
  }

  // ---- arm sL: snake-lateral layout probe ------------------------------------
  const lat = JSON.parse(await chrome.eval(
    'JSON.stringify(window.__drills.layout("colours-line", 0))'));
  if (!lat) fail('sL: snake-lateral layout unavailable');
  else {
    const W = 1.778; // SNOOKER_LAYOUT width
    [16, 17, 18, 19, 20, 21].forEach((id, i) => {
      const b = lat.balls.find((x) => x.id === id);
      const wantX = -W / 2 + ((i + 1) * W) / 7;
      if (!b || Math.abs(b.x - wantX) > 1e-9 || Math.abs(b.y) > 1e-9) {
        fail(`sL: colour ${id} off the lateral line: ` + JSON.stringify(b));
      }
    });
    if (JSON.stringify(lat.objective) !== '{"sequence":[16,17,18,19,20,21]}') {
      fail('sL: lateral objective wrong: ' + JSON.stringify(lat.objective));
    }
  }

  } // !FASTLANE (arms s5, s6, sL)

  // ---- arm 9: persistence across a reload -----------------------------------
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
  await waitReady(chrome, 'reload');
  await waitDrills(chrome);
  const bests = await chrome.eval('window.__drills.bests()');
  if (!FASTLANE && bests?.circle?.best !== circleScore) {
    fail('reload lost the persisted circle best: ' + JSON.stringify(bests));
  }
  if (bests?.["colours-clear"]?.best !== 1) { // issue #80: snooker progress persists too
    fail('reload lost the persisted snake best: ' + JSON.stringify(bests?.["colours-clear"]));
  }
  if (!FASTLANE) { // GH-1078: the circle best line needs arm 6's run
  const bestLine = await chrome.eval(`(() => {
    window.__drills.open();
    const el = document.querySelector('[data-best="circle"]');
    const text = el ? el.textContent : null;
    window.__drills.close();
    return text;
  })()`);
  if (!bestLine || !bestLine.includes(String(circleScore))) {
    fail('picker best line does not show the persisted score: ' + bestLine);
  }
  } // !FASTLANE (the circle best line)

  if (!FASTLANE) { // GH-1078: arms 22, 24 not in the --fastlane subset
  // ==== arm 22 (issue GH-200): v1 legacy-blob load-migration ==================
  // A pre-200 flat blob loads with every record mapped to the DEFAULT
  // assist mode ('standard' — the recorded choice, FORMAT.md §4), stays v1
  // ON DISK until the first user-initiated write (hermetic-boot law), then
  // upgrades to v2 with the legacy data carried through byte-meaningfully.
  await chrome.eval(`localStorage.setItem('ob-drills-v1', JSON.stringify({
    v: 1, last: 'circle', drills: {
      circle: { best: 3, plays: 2, ts: 1111 },
      'colours-clear': { best: 1, plays: 2, ts: 2222 },
      'not-a-drill': { best: 9, plays: 1, ts: 3333 } } }))`);
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
  await waitReady(chrome, 'migration reload');
  await waitDrills(chrome);
  const mig = JSON.parse(await chrome.eval(`JSON.stringify({
    flat: window.__drills.bests().circle ?? null,
    full: window.__drills.bestsByAssist(),
    raw: JSON.parse(localStorage.getItem('ob-drills-v1') ?? 'null') })`));
  if (JSON.stringify(mig.full.circle)
      !== JSON.stringify({ standard: { best: 3, plays: 2, ts: 1111 } })
    || JSON.stringify(mig.full['colours-clear'])
      !== JSON.stringify({ standard: { best: 1, plays: 2, ts: 2222 } })) {
    fail('arm 22: legacy records did not map to the default assist mode: '
      + JSON.stringify(mig.full));
  }
  if (mig.full['not-a-drill'] !== undefined) {
    fail('arm 22: stale-id sanitation lost in the migration');
  }
  if (mig.flat?.best !== 3 || mig.flat?.plays !== 2) {
    fail('arm 22: active-mode projection wrong after the migration: '
      + JSON.stringify(mig.flat));
  }
  if (mig.raw?.v !== 1) {
    fail('arm 22: load-migration wrote the blob at boot (hermetic-boot law): '
      + JSON.stringify(mig.raw));
  }
  // the first user-initiated activity persists v2; a 0-score completion is
  // NOT an improvement — best 3 stands, plays bumps (per-mode)
  const mark22 = consoleLogs.length;
  if (!(await chrome.eval('window.__drills.start("circle")'))) {
    fail('arm 22: circle start refused');
  }
  await sleep(300);
  await fire(chrome, 'arm 22 circle exit',
    { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  await sleep(600);
  const blob22 = JSON.parse(await chrome.eval(
    'localStorage.getItem("ob-drills-v1")') ?? 'null');
  if (blob22?.v !== 2
    || blob22.drills?.circle?.standard?.best !== 3
    || blob22.drills?.circle?.standard?.plays !== 3
    || blob22.drills?.['colours-clear']?.standard?.best !== 1
    || blob22.drills?.['not-a-drill'] !== undefined) {
    fail('arm 22: v2 upgrade on the first user write wrong: '
      + JSON.stringify(blob22));
  }
  if (!consoleLogs.slice(mark22).some((l) => l.includes('[drills] complete')
    && l.includes('"assist":"standard"'))) {
    fail('arm 22: complete mirror missing the assist field');
  }
  await chrome.eval('window.__drills.stop()');
  console.log('[e2e-drills] arm 22 ok (v1→v2 load-migration to the default '
    + 'mode; no boot write; v2 persisted on the first user write)');

  // ==== arm 24 (GH-384): BU F1/F5 published-sheet alignment ====================
  // The owner-ordered drill-family convention rulings (#384): bu-f1's seven
  // stations move to the F1 sheet's diagram points (long-rail diamonds 1-7,
  // one diamond off the rail; OB one diamond off the opposite rail with the
  // one-ball gap to the end nose) and its scratch gate is REMOVED (the F1
  // diagram letter: "you are allowed to scratch"); bu-f5 becomes the sheet's
  // TARGET ladder — OB one ball below the table center, papers on the center
  // string at long-rail diamonds 5/6/7 (position 4 long-edge against the
  // foot rail), start at position 4, diploma cap 10, ball-overlap "within or
  // overlapping" rects, and the end-rail REBOUND required for positions 5-7
  // (needFootCushion → reason 'norail'). Legs: (a) layout/objective bytes,
  // (b) the scratch red/green (pre-384 the same stroke read 'scratch'),
  // (c) ladder-start/target-zone/foot-rebound/norail behavioral pins.
  {
    // the s-arms' snooker pin PERSISTS (FORMAT.md §1b.1), so the active
    // table here is the WPBSA 12-ft — restore the pool pairing first (the
    // recipes below were probed on the kernel 9-ft) and re-derive the
    // diamond from the active table (bu-f6's pt(1,6) anchor, the arm-16
    // idiom) so the byte pins stay scale-honest on any 2:1 table.
    await chrome.eval(`window.__settings?.changeGame
      ? window.__settings.changeGame('nine_ball', { skipConfirm: true })
      : window.__rules.setGame('nine_ball')`);
    await sleep(1500); // equipment rebuild + seed re-rack settle
    const D24 = JSON.parse(await chrome.eval(
      'JSON.stringify(window.__drills.layout("bu-f6", 0))'))
      .balls.find((b) => b.id === 1).y / 2;
    const R24 = await chrome.eval('window.__drills.ballR()');
    const near24 = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
    const lay24 = async (id, k) => JSON.parse(await chrome.eval(
      `JSON.stringify(window.__drills.layout("${id}", ${k}))`));
    // ---- (a1) bu-f1 layout/objective bytes ------------------------------------
    for (let k = 0; k < 7; k++) {
      const lay = await lay24('bu-f1', k);
      const cue = lay.balls.find((b) => b.id === 0);
      const ob = lay.balls.find((b) => b.id === 1);
      if (!near24(cue.x, D24) || !near24(cue.y, (3 - k) * D24)) {
        fail(`arm 24a: bu-f1 station ${k + 1} off the sheet diamond point: `
          + JSON.stringify(cue));
      }
      if (!near24(ob.x, -D24) || !near24(ob.y, 4 * D24 - 3 * R24)) {
        fail('arm 24a: bu-f1 OB off the one-ball-gap corner point: '
          + JSON.stringify(ob));
      }
      const o = lay.objective;
      if (o.noScratch !== undefined || o.pot?.ball !== 1 || o.pot?.pocket !== 2
        || o.firstContact !== 1) {
        fail('arm 24a: bu-f1 objective wrong (the F1 sheet letter ALLOWS '
          + 'scratches — no noScratch word): ' + JSON.stringify(o));
      }
    }
    // ---- (a2) bu-f5 layout/objective bytes ------------------------------------
    for (let k = 0; k < 7; k++) {
      const lay = await lay24('bu-f5', k);
      const ob = lay.balls.find((b) => b.id === 1);
      if (!near24(ob.x, 2 * R24) || !near24(ob.y, 0)) {
        fail('arm 24a: bu-f5 OB off the one-ball-below-center station: '
          + JSON.stringify(ob));
      }
      const o = lay.objective;
      const z = o.cueRest;
      const wantCy = k <= 2 ? (k + 1) * D24
        : k === 3 ? 4 * D24 - (0.68 / 2) * D24 : (7 - k) * D24;
      const wantU = k === 3 ? [1, 0] : [0, 1];
      if (!z || !near24(z.cx, 0) || !near24(z.cy, wantCy)
        || !near24(z.ux, wantU[0]) || !near24(z.uy, wantU[1])
        || !near24(z.halfAlong, (0.88 * D24) / 2)
        || !near24(z.halfAcross, (0.68 * D24) / 2)
        || !near24(z.overlapR, R24)) {
        fail(`arm 24a: bu-f5 target paper wrong at position ${k + 1}: `
          + JSON.stringify(z));
      }
      if (o.pot?.ball !== 1 || o.pot?.pocket !== 4 || o.noScratch !== true
        || (k <= 2) !== (o.noCueCushion === true)
        || (k >= 4) !== (o.needFootCushion === true)) {
        fail(`arm 24a: bu-f5 path law wrong at position ${k + 1} (want `
          + 'noCueCushion for 1-3 ONLY, needFootCushion for 5-7 ONLY): '
          + JSON.stringify(o));
      }
    }
    // published diploma caps (the sheets' "maximum total score allowed is 10")
    const list24 = JSON.parse(await chrome.eval(
      'JSON.stringify(window.__drills.list())'));
    for (const id of ['bu-f1', 'bu-f5']) {
      const row = list24.find((d) => d.id === id);
      if (!row || row.max !== 10) {
        fail(`arm 24a: ${id} maxScore must be the published cap 10: `
          + JSON.stringify(row));
      }
    }
    // ---- (b) bu-f1: sheet start + the scratch red/green -----------------------
    if (!(await chrome.eval('window.__drills.start("bu-f1")'))) {
      fail('arm 24b: bu-f1 start refused');
    }
    await sleep(400);
    let st24 = await chrome.eval('window.__drills.state()');
    if (!st24 || st24.pos !== 4 || st24.score !== 0) {
      fail('arm 24b: bu-f1 must open at sheet position 4: '
        + JSON.stringify(st24));
    }
    // scratch with NO contact: station 4 sits on the side-right pocket's +x
    // line — the cue scratches, ball 1 stays untouched. Pre-384 (red) the
    // noScratch gate labeled this 'scratch'; the sheet's letter allows
    // scratching, so the verdict must now be the plain wrong-contact miss
    // and the ladder simply retreats.
    const mark24 = consoleLogs.length;
    await fire(chrome, 'arm 24 f1 scratch', { v0: 1.6, phi: 0, theta: 0, a: 0, b: 0 });
    await sleep(400);
    const scratchLine = consoleLogs.slice(mark24).find(
      (l) => l.includes('[drills] attempt {"id":"bu-f1"'));
    if (!scratchLine || !scratchLine.includes('"reason":"contact"')
      || scratchLine.includes('"reason":"scratch"')) {
      fail('arm 24b: the scratch stroke must fail as a plain contact miss '
        + '(the F1 scratch gate is retired): ' + scratchLine);
    }
    st24 = await chrome.eval('window.__drills.state()');
    if (!st24 || st24.pos !== 3) {
      fail('arm 24b: scratch stroke must retreat 4→3 (a miss, not a void): '
        + JSON.stringify(st24));
    }
    await sleep(RELAY_MS);
    // walk down to position 1 (the near-straight station) with two dry misses
    for (let i = 0; i < 2; i++) {
      await fire(chrome, `arm 24 f1 dry ${i}`,
        { v0: 0.45, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
      await sleep(RELAY_MS);
    }
    st24 = await chrome.eval('window.__drills.state()');
    if (!st24 || st24.pos !== 1) {
      fail('arm 24b: dry walk-down did not reach position 1: '
        + JSON.stringify(st24));
    }
    // position-1 pot: the sheet's pot line runs ~30° off the corner mouth
    // bisector (a rail-side entry), so a center-pocket aim hangs the near
    // jaw (probed live) — aim into the deep side of the mouth instead
    const phi24 = await chrome.eval(`(() => {
      const kk = (b) => ({ x: b.pos[2], y: b.pos[0] });
      const balls = __test.balls();
      const cue = kk(balls.find((b) => b.id === 0));
      const ob = kk(balls.find((b) => b.id === 1));
      const p = window.__rules.pockets()[2];
      const r = window.__drills.ballR();
      const tx = p.x - 0.05, ty = p.y - 0.02;
      const n = Math.hypot(tx - ob.x, ty - ob.y);
      const gx = ob.x - ((tx - ob.x) / n) * 2 * r;
      const gy = ob.y - ((ty - ob.y) / n) * 2 * r;
      return Math.atan2(gy - cue.y, gx - cue.x);
    })()`);
    await fire(chrome, 'arm 24 f1 pot',
      { v0: 2.2, phi: phi24, theta: 0, a: 0, b: 0.65 });
    await sleep(400);
    st24 = await chrome.eval('window.__drills.state()');
    if (!st24 || st24.pos !== 2 || st24.streak !== 1) {
      fail('arm 24b: position-1 pot did not advance the sheet ladder: '
        + JSON.stringify(st24));
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(400);
    // ---- (c) bu-f5: target ladder + rebound law behavioral pins ---------------
    if (!(await chrome.eval('window.__drills.start("bu-f5")'))) {
      fail('arm 24c: bu-f5 start refused');
    }
    await sleep(400);
    st24 = await chrome.eval('window.__drills.state()');
    if (!st24 || st24.pos !== 4) {
      fail('arm 24c: bu-f5 must open at sheet target position 4: '
        + JSON.stringify(st24));
    }
    if (await chrome.eval('__test.state()') !== 'BALL_IN_HAND') {
      fail('arm 24c: bu-f5 must grant the per-shot CB-in-hand affordance');
    }
    // one deterministic stroke shape for all three legs: cue placed a diamond
    // out on a 70° cut (head side of the ghost at table center), ghost-ball
    // aim at the side-right pocket, stun-ish b −0.1. v0 2.42 drifts the cue
    // down the center string to rest y≈1.058 — inside BOTH the position-4
    // rail paper and the position-5 diamond-7 paper (after a genuine foot-
    // rail rebound; probed live, deterministic per seed). v0 0.55 nudges
    // ball 1 and dies mid-table: contact without any end-rail rebound.
    const f5place = `(() => {
      const D = ${D24}, c = 70 * Math.PI / 180;
      return __test.placeCue(-Math.cos(c) * D, -Math.sin(c) * D);
    })()`;
    const f5legs = [
      { v0: 2.42, want: 5, label: 'position-4 target-paper pass' },
      { v0: 2.42, want: 6, label: 'position-5 foot-rebound pass' },
      { v0: 0.55, want: 5, label: 'position-6 norail red', red: true },
    ];
    for (const leg of f5legs) {
      if (!(await chrome.eval(f5place))) {
        fail(`arm 24c: cue placement refused before the ${leg.label}`);
      }
      const m = consoleLogs.length;
      await fireAt(chrome, `arm 24 f5 ${leg.label}`, 1, 4,
        { v0: leg.v0, b: -0.1 });
      await sleep(400);
      st24 = await chrome.eval('window.__drills.state()');
      if (!st24 || st24.pos !== leg.want) {
        fail(`arm 24c: ${leg.label} left the target ladder at `
          + `${st24?.pos}, want ${leg.want}`);
      }
      if (leg.red) {
        const line = consoleLogs.slice(m).find(
          (l) => l.includes('[drills] attempt {"id":"bu-f5"'));
        if (!line || !line.includes('"reason":"norail"')) {
          fail('arm 24c: a no-rebound stroke at positions 5-7 must fail with '
            + "the sheet's end-rail law (reason norail): " + line);
        }
      }
      await sleep(RELAY_MS);
    }
    await chrome.eval('window.__drills.stop()');
    await sleep(400);
    console.log('[e2e-drills] arm 24 ok (GH-384: BU F1 sheet stations + '
      + 'scratch-allowed; BU F5 target ladder + end-rail rebound law)');
  }


  } // !FASTLANE (arms 22, 24)

  // ---- error gates -----------------------------------------------------------
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  chrome.close();
  chrome = null;

  if (!FASTLANE) { // GH-1078: arms 10, s7, s2, 18, 13, 25-29 not in the --fastlane subset
  // ---- arm 10: stale-kit degradation (ui/dialog.js unavailable ⇒ inert) ----
  await new Promise((res) => blockServer.listen(PORT2, res));
  const errs2 = [], logs2 = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT2}/app.html?seed=1`,
    { port: CDP + 1 });
  watch(chrome, errs2, logs2);
  await waitReady(chrome, 'stale-kit boot');
  await sleep(2000); // give the guarded imports time to resolve/fail
  const inert = await chrome.eval(`(() => ({
    pill: !!document.getElementById('ob-drills'),
    seam: typeof window.__drills,
    chips: !!document.getElementById('ob-drill-chips'),
  }))()`);
  if (inert.pill || inert.seam !== 'undefined') {
    fail('stale-kit boot not inert: ' + JSON.stringify(inert));
  }
  const appErrors2 = await chrome.eval('__test.errors');
  if (appErrors2.length) fail('stale-kit app errors: ' + appErrors2.join(' | '));
  if (errs2.length) fail('stale-kit console errors: ' + errs2.join(' | '));
  // Teardown law (GH-294 class): the next arm relaunches on THIS SAME CDP
  // port immediately — a bare close() only signals, and a signalled Chrome
  // still owns :port and /tmp/obw-e2e-profile-<port> until it actually
  // exits (slow hosts: endpoint-never-came-up / profile ENOTEMPTY).
  // closeAndWait() is the confirmed-gone teardown; assertion-neutral.
  if (!await chrome.closeAndWait()) {
    throw new Error('stale-kit teardown: Chrome did not exit — it still '
      + `owns CDP ${CDP + 1} and its profile dir`);
  }
  chrome = null;

  // ---- arm s7 (issue #80): stale games/layouts.js — snooker drills refuse
  // cleanly (start false + layout null, zero errors), pool drills still run --
  await new Promise((res) => blockServer2.listen(PORT3, res));
  const errs3 = [], logs3 = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT3}/app.html?seed=1`,
    { port: CDP + 1 });
  watch(chrome, errs3, logs3);
  await waitReady(chrome, 'stale-layouts boot');
  await waitDrills(chrome);
  await sleep(1500); // let the guarded leaf import fail
  if (await chrome.eval('window.__drills.layout("colours-clear", 0)') !== null) {
    fail('s7: snake layout must be null without the layouts mirror');
  }
  // finding-3 stage: park the selector on a NON-practice mode — the refused
  // start below must put it back (a refusal used to strand the selector
  // pinned on practice with no drill running)
  if (await chrome.eval('window.__settings.changeMode("playground")') !== true) {
    fail('s7: could not stage the playground mode');
  }
  if (await chrome.eval('window.__drills.start("colours-clear")') !== false) {
    fail('s7: snake start must refuse without the layouts mirror');
  }
  if (await chrome.eval('window.__rules.game()') !== 'nine_ball') {
    fail('s7: a refused snake start must not switch the discipline');
  }
  if (await chrome.eval('window.__settings.get().mode') !== 'playground') {
    fail('s7: refused start stranded the session mode (playground not restored)');
  }
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) {
    fail('s7: pool drills must still run on a stale-layouts boot');
  }
  await sleep(300);
  const st7 = await chrome.eval('window.__drills.state()');
  if (!st7 || st7.id !== 'bu-f2' || st7.done) {
    fail('s7: bu-f2 not live on the stale-layouts boot: ' + JSON.stringify(st7));
  }
  await chrome.eval('window.__drills.stop()');
  const appErrors3 = await chrome.eval('__test.errors');
  if (appErrors3.length) fail('s7: app errors: ' + appErrors3.join(' | '));
  if (errs3.length) fail('s7: console errors: ' + errs3.join(' | '));
  // Same teardown law as arm 10 above: arm s2 relaunches on CDP+1
  // immediately — wait for the confirmed-gone proof, never the signal.
  if (!await chrome.closeAndWait()) {
    throw new Error('s7 teardown: Chrome did not exit — it still '
      + `owns CDP ${CDP + 1} and its profile dir`);
  }
  chrome = null;

  // ---- arm s2 (issue #80 review finding 2): healthy-but-SLOW layouts leaf —
  // an immediate tap parks on the PENDING import and succeeds when it lands.
  // The server holds the module until released, so start() is provably
  // driven while the import is in flight (the pre-fix runner returned false
  // right here: a spurious refusal in the first ~100 ms after install). ----
  await new Promise((res) => slowServer.listen(PORT4, res));
  const errs4 = [], logs4 = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT4}/app.html?seed=1`,
    { port: CDP + 1 });
  watch(chrome, errs4, logs4);
  await waitReady(chrome, 'slow-layouts boot');
  // the immediate tap: fire start() the moment the seam exists — a 5 ms
  // in-page poll, NOT the 200 ms waitDrills sleep (the tap must land inside
  // the pending-import window, which the held server keeps open regardless)
  const startP = chrome.eval(`(async () => {
    for (let i = 0; i < 12000
      && typeof window.__drills?.start !== 'function'; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    if (typeof window.__drills?.start !== 'function') return 'no-seam';
    return window.__drills.start("colours-clear");
  })()`);
  // while the leaf is HELD the start must be PARKED, not settled — a settled
  // value here is the pre-fix spurious refusal
  const earlyS2 = await Promise.race([startP, sleep(1500).then(() => 'parked')]);
  if (earlyS2 !== 'parked') {
    fail('s2: immediate tap settled while the leaf was still loading'
      + ' (spurious refusal): ' + JSON.stringify(earlyS2));
  }
  releaseLayouts(); // the slow-but-healthy leaf lands now
  const okS2 = await startP;
  if (okS2 !== true) {
    fail('s2: immediate tap did not start the snake drill: ' + JSON.stringify(okS2));
  }
  await sleep(600); // game-switch broadcast + table rebuild slack
  if (await chrome.eval('window.__rules.game()') !== 'snooker') {
    fail('s2: immediate-tap start did not pin the snooker discipline');
  }
  const stS2 = await chrome.eval('window.__drills.state()');
  if (!stS2 || stS2.id !== "colours-clear" || stS2.done) {
    fail('s2: snake not live after the immediate tap: ' + JSON.stringify(stS2));
  }
  if (await chrome.eval('window.__drills.layout("colours-clear", 0)') === null) {
    fail('s2: layout wire still null after the leaf landed');
  }
  await chrome.eval('window.__drills.stop()');
  const appErrors4 = await chrome.eval('__test.errors');
  if (appErrors4.length) fail('s2: app errors: ' + appErrors4.join(' | '));
  if (errs4.length) fail('s2: console errors: ' + errs4.join(' | '));
  chrome.close();
  chrome = null;

  // ==== arm 18 (issue #144): desktop compact strip — right-panel register ====
  // (ordinal settled at the merge wave: 15g/17 went to #133/#134, 19 to
  // #138 — 18 stands as claimed.)
  const errs18 = [], logs18 = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
    { port: CDP });
  watch(chrome, errs18, logs18);
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await waitReady(chrome, 'arm 18 desktop boot');
  await waitDrills(chrome);
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) {
    fail('arm 18: bu-f2 start refused');
  }
  await sleep(600);
  // ladder = the widest merged inventory (step + attempt + streak + score)
  for (const loc of ['de', 'fr', 'es', 'ja', 'ko', 'zh-CN', 'en']) {
    await chrome.eval(`window.__settings.set('language', '${loc}')`);
    await sleep(400);
    const s18 = await chrome.eval(`(() => {
      const hud = document.getElementById('hud').getBoundingClientRect();
      const c = document.getElementById('ob-drill-chips');
      const r = c.getBoundingClientRect();
      // GH-668 B-PR05: the two segments are the name BADGE + the body
      // READOUT (div.ob-drills__readout) — both walk the wrap-not-clip law
      const badges = [...c.querySelectorAll('.ob-badge, .ob-drills__readout')].map((b) => ({
        cls: b.className,
        clipW: b.scrollWidth > b.clientWidth + 1,
        clipH: b.scrollHeight > b.clientHeight + 1,
        sep: b.textContent.includes(' · '),
      }));
      return { on: c.classList.contains('on'), kids: c.childElementCount,
        hud: { l: Math.round(hud.left), r: Math.round(hud.right),
          b: Math.round(hud.bottom) },
        strip: { l: Math.round(r.left), r: Math.round(r.right),
          b: Math.round(r.bottom) },
        vh: innerHeight, badges };
    })()`);
    if (!s18.on || s18.kids !== 2) {
      fail(`arm 18 [${loc}]: strip anatomy wrong (want 2 segments): `
        + JSON.stringify(s18));
    } else {
      if (!s18.badges[0].cls.includes('ob-badge--accent')
        || !s18.badges[1]?.cls.includes('ob-drills__readout') || !s18.badges[1].sep) {
        fail(`arm 18 [${loc}]: merged register wrong (accent name pill + `
          + `' · '-joined body readout): ` + JSON.stringify(s18.badges));
      }
      if (s18.badges.some((b) => b.clipW || b.clipH)) {
        fail(`arm 18 [${loc}]: strip segment clips internally (wrap-not-clip law): `
          + JSON.stringify(s18.badges));
      }
      if (s18.strip.l < s18.hud.l || s18.strip.r > s18.hud.r + 1) {
        fail(`arm 18 [${loc}]: strip leaves the #hud panel slab: `
          + JSON.stringify(s18));
      }
      if (s18.hud.b > s18.vh) {
        fail(`arm 18 [${loc}]: HUD panel pushed past the viewport bottom `
          + '(#81 finding-3 class): ' + JSON.stringify(s18));
      }
    }
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  await chrome.eval('window.__drills.stop()');
  await sleep(300);
  const appErrors18 = await chrome.eval('__test.errors');
  if (appErrors18.length) fail('arm 18: app errors: ' + appErrors18.join(' | '));
  if (errs18.length) fail('arm 18: console errors: ' + errs18.join(' | '));
  chrome.close();
  chrome = null;

  // ---- arm 13 (#81 findings 1 + 2): the coarse register ----------------------
  // A REAL phone boot (touch-cdp emulation — the gap that hid finding 1:
  // this suite was desktop-only, so the 100dvh sheet body collapsing every
  // card to its 44px floor was invisible to the gates).
  const errs5 = [], logs5 = [];
  chrome = await launchPhone(`http://127.0.0.1:${PORT}/app.html?seed=1`,
    { cdpPort: CDP + 1 });
  watch(chrome, errs5, logs5);
  await waitReady(chrome, 'phone boot');
  await waitDrills(chrome);
  await verifyCoarse(chrome);
  if (!(await chrome.eval(
    'document.documentElement.classList.contains("ob-touch")'))) {
    fail('arm 13: coarse boot did not install the .ob-touch register');
  }
  // finding 1: every sheet card renders FULL-HEIGHT — description + best
  // line visible, nothing clipped, well above the 44px touch floor — in
  // BOTH orientations (844x390 landscape is launchPhone's default)
  const cardAudit = () => chrome.eval(`(() => {
    const out = { n: 0, bad: [] };
    for (const c of document.querySelectorAll(
      '#ob-drills-panel .ob-drills__card')) {
      out.n += 1;
      const desc = c.querySelector('.ob-drills__desc');
      const best = c.querySelector('.ob-drills__best');
      const clipped = c.scrollHeight > c.clientHeight + 1;
      const h = c.getBoundingClientRect().height;
      if (clipped || h < 60 || !desc?.offsetHeight || !best?.offsetHeight) {
        out.bad.push({ id: c.dataset.drill, h: Math.round(h), clipped,
          desc: desc?.offsetHeight ?? 0, best: best?.offsetHeight ?? 0 });
      }
    }
    return out;
  })()`);
  await chrome.eval('window.__drills.open()');
  await sleep(400);
  let audit13 = await cardAudit();
  if (!audit13.n || audit13.bad.length) {
    fail('arm 13: landscape sheet cards clipped/collapsed: '
      + JSON.stringify(audit13));
  }
  await setPhoneMetrics(chrome, { width: 390, height: 844 }); // portrait
  await sleep(400);
  audit13 = await cardAudit();
  if (!audit13.n || audit13.bad.length) {
    fail('arm 13: portrait sheet cards clipped/collapsed: '
      + JSON.stringify(audit13));
  }
  await setPhoneMetrics(chrome, { width: 844, height: 390 }); // landscape again
  await sleep(300);
  await chrome.eval('window.__drills.close()');
  await sleep(300);
  // finding 2: a landscape completion presents the banner in its OWN band
  // (.ob-drills-banner) with NO rect overlap against the reason hint —
  // pre-fix the 18% banner band ran into the 27% hint band on 390px heights
  if (!(await chrome.eval('window.__drills.start("circle")'))) {
    fail('arm 13: circle start refused');
  }
  await sleep(400);
  // issue #120 — the dock's coarse leg: while the drill is LIVE, the
  // STOP/Reset icon rail is up on the right column (44 pt, hit-testable,
  // hugging the right edge — never over the table-centre aim zone), the
  // dock opener is HIDDEN on phones (the band-T toolbar pill owns the
  // opener slot — recorded decision), and a REAL touch tap on STOP raises
  // the kit confirm (44 pt options); Cancel keeps the run live.
  const dock13 = await chrome.eval(`(() => {
    const out = { btns: [], vw: innerWidth, vh: innerHeight };
    for (const id of ['ob-drill-reset', 'ob-drill-stop']) {
      const el = document.getElementById(id);
      if (!el || !el.getClientRects().length) { out.btns.push({ id, missing: true }); continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out.btns.push({ id, w: r.width, h: r.height,
        l: Math.round(r.left), t: Math.round(r.top),
        rr: Math.round(r.right), b: Math.round(r.bottom),
        hit: !!hit && (hit === el || el.contains(hit)) });
    }
    const open = document.getElementById('ob-drill-open');
    out.openerHidden = !open || open.getClientRects().length === 0;
    return out;
  })()`);
  if (!dock13.openerHidden) {
    fail('arm 13: the dock opener must hide on the phone register (toolbar pill owns it)');
  }
  for (const b of dock13.btns) {
    if (b.missing || Math.min(b.w, b.h) < 43.5 || !b.hit) {
      fail('arm 13: dock button missing/small/covered: ' + JSON.stringify(b));
    } else if (b.l < dock13.vw * 0.8 || b.rr > dock13.vw || b.t < 0
      || b.b > dock13.vh) {
      fail('arm 13: dock button off the right-column rail: ' + JSON.stringify(b));
    }
  }
  // GH-668 S5 slice 4 G6 (B-PR08 / B-K15): on the COARSE register the same
  // kit carriers stand on the 44 rung (dock13 above) and a forced :hover
  // leaves the material byte-identical — the kit ladder rides the fine
  // guard, drills.css restates no hover of its own
  const dockVoice13 = await chrome.eval(DOCK_VOICE_JS);
  if (!dockVoice13 || dockVoice13.length < 2) {
    fail('arm 13 dock voice: live phone dock has ' + (dockVoice13?.length ?? 0) + ' visible buttons (want Reset + STOP)');
  }
  for (const b of dockVoice13 ?? []) {
    if (!b.kit) fail(`arm 13 dock voice: ${b.id} is not a kit toolbar carrier: ${b.cls}`);
    if (!b.want || b.title !== b.want || b.aria !== b.want) fail(`arm 13 dock voice: ${b.id} title/aria must be t(${b.key}): ` + JSON.stringify(b));
    if (Math.abs(b.h - 44) > 0.5 || Math.abs(b.w - 44) > 0.5) fail(`arm 13 dock voice: ${b.id} ${b.w}x${b.h} off the coarse 44 rung`);
  }
  await chrome.send('DOM.enable'); await chrome.send('CSS.enable');
  const rest13 = await forcedRegister(chrome, '#ob-drill-stop', []);
  const hover13 = await forcedRegister(chrome, '#ob-drill-stop', ['hover']);
  if (!rest13 || rest13 !== hover13) {
    fail('arm 13 dock hover: a forced :hover must NOT move the material on the coarse register: ' + JSON.stringify({ rest13, hover13 }));
  }
  const stop13 = dock13.btns.find((b) => b.id === 'ob-drill-stop');
  if (stop13 && !stop13.missing) {
    await tap(chrome, stop13.l + stop13.w / 2, stop13.t + stop13.h / 2);
    await sleep(500);
    const conf13 = await chrome.eval(`(() => {
      const p = document.querySelector('[data-ob="confirm"]');
      if (!p || !p.getClientRects().length) return null;
      const out = { small: [] };
      for (const b of p.querySelectorAll('.ob-btn')) {
        const r = b.getBoundingClientRect();
        if (Math.min(r.width, r.height) < 43.5) {
          out.small.push(b.dataset.ob + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0));
        }
      }
      return out;
    })()`);
    if (!conf13) fail('arm 13: coarse STOP tap raised no confirm');
    else if (conf13.small.length) {
      fail('arm 13: confirm options under the 44pt floor: ' + conf13.small.join(', '));
    }
    await chrome.eval(`document.querySelector('[data-ob="confirm-cancel"]')?.click()`);
    await sleep(500);
    const live13 = await chrome.eval('window.__drills.state()');
    if (!live13 || live13.done) {
      fail('arm 13: confirm-cancel did not keep the drill live: ' + JSON.stringify(live13));
    }
  }
  // issue #144 — the relocated strip (phone register): band-T CENTER span,
  // two segments, clear of the felt core (kernel pocket bbox projected via
  // __tp.projectK at ball height — the e2e-ui --audit occlusion
  // derivation, 24px edge margin) and pointer-INERT: a tap at its visible
  // center falls through to the renderer canvas (#81a law; pre-#144 the
  // band-S stack sat at y 112..130 INSIDE the felt and ate the tap).
  await chrome.eval(PAGE_HELPERS_JS);
  const strip13 = await chrome.eval(`(() => {
    const c = document.getElementById('ob-drill-chips');
    if (!c || !c.classList.contains('on')) return { err: 'strip not on' };
    const badges = [...c.querySelectorAll('.ob-badge')];
    const readout = c.querySelector('.ob-drills__readout');
    const t = window.__i18n.t;
    let f = null;
    for (const p of window.__rules.pockets()) {
      const s = window.__tp.projectK(p.x, p.y, 0.03);
      if (!s) continue;
      f = f ? { l: Math.min(f.l, s.x), t: Math.min(f.t, s.y),
        r: Math.max(f.r, s.x), b: Math.max(f.b, s.y) }
        : { l: s.x, t: s.y, r: s.x, b: s.y };
    }
    if (!f) return { err: 'felt rect unprojectable' };
    // visible rect: #hud (the only clipping ancestor) crops the strip box
    const hr = document.getElementById('hud').getBoundingClientRect();
    const r0 = c.getBoundingClientRect();
    const rect = { l: Math.max(r0.left, hr.left), t: Math.max(r0.top, hr.top),
      r: Math.min(r0.right, hr.right), b: Math.min(r0.bottom, hr.bottom) };
    const core = { l: f.l + 24, t: f.t + 24, r: f.r - 24, b: f.b - 24 };
    const ox = Math.min(rect.r, core.r) - Math.max(rect.l, core.l);
    const oy = Math.min(rect.b, core.b) - Math.max(rect.t, core.t);
    const cx = (Math.max(rect.l, 0) + Math.min(rect.r, innerWidth)) / 2;
    const cy = (Math.max(rect.t, 0) + Math.min(rect.b, innerHeight)) / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { kids: c.childElementCount,
      name: badges[0]?.textContent ?? '',
      wantName: t('drills.name.circle'),
      merged: readout?.textContent ?? '',
      // D-readout phone leg (GH-668 B-PR05): ONE line box in band T
      readoutLines: new Set([...(readout?.querySelectorAll('.seg') ?? [])].map((s) => Math.round(s.getBoundingClientRect().top))).size,
      badges: badges.length,
      wantStreak: t('drills.chip.streak', { n: 0 }),
      cy: Math.round((rect.t + rect.b) / 2), vh: innerHeight,
      feltHit: ox > 0.5 && oy > 0.5,
      hitTag: hit ? hit.tagName.toLowerCase() : 'none',
      hitInStrip: !!hit && (c.contains(hit) || hit === c) };
  })()`);
  if (strip13.err) {
    fail('arm 13 (#144): strip probe unavailable: ' + JSON.stringify(strip13));
  } else {
    if (strip13.kids !== 2 || strip13.name !== strip13.wantName
      || !strip13.merged.includes(' · ')
      || !strip13.merged.includes(strip13.wantStreak)) {
      fail('arm 13 (#144): strip content wrong (want accent name + merged '
        + 'counters): ' + JSON.stringify(strip13));
    }
    if (strip13.badges !== 1 || strip13.readoutLines !== 1) {
      fail('arm 13 D-readout: band T must hold ONE name badge + a ONE-line readout: '
        + JSON.stringify(strip13));
    }
    if (strip13.cy >= strip13.vh * 0.25) {
      fail('arm 13 (#144): strip not in the top band: ' + JSON.stringify(strip13));
    }
    if (strip13.feltHit) {
      fail('arm 13 (#144): strip intrudes into the felt core (24px margin): '
        + JSON.stringify(strip13));
    }
    if (strip13.hitInStrip || strip13.hitTag !== 'canvas') {
      fail('arm 13 (#144): strip not pointer-inert (tap must fall through '
        + 'to the canvas): ' + JSON.stringify(strip13));
    }
  }
  await fire(chrome, 'arm 13 circle exit',
    { v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
  const band = await chrome.eval(`(() => {
    const b = document.getElementById('ob-drill-end');
    const h = document.getElementById('hud-hint');
    if (!b) return { bd: 'absent' };
    const br = b.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const hidden = getComputedStyle(h).display === 'none' || hr.width === 0;
    const overlap = !hidden && !(br.right < hr.left || hr.right < br.left
      || br.bottom < hr.top || hr.bottom < br.top);
    return { bd: b.style.display, hd: h.style.display, hintHidden: hidden,
      marked: b.classList.contains('ob-drills-banner'), overlap,
      banner: [Math.round(br.top), Math.round(br.bottom)],
      hint: [Math.round(hr.top), Math.round(hr.bottom)], vh: innerHeight,
      flowBanner: document.getElementById('banner').textContent };
  })()`);
  // GH-668 B-PR05: the verdict (with its reason) rides the notice; the
  // touch.css §3.11 `:has(.ob-drills-banner) #hud-hint` seam yields the
  // hint band to it, so the two never share a pixel on the phone
  if (band.bd !== 'block' || !band.marked) {
    fail('arm 13: drill-end notice not up on the phone: ' + JSON.stringify(band));
  } else if (band.overlap) {
    fail('arm 13: drill-end notice overlaps the reason hint: '
      + JSON.stringify(band));
  }
  if (band.flowBanner) fail('arm 13: #banner carried text under the hold: ' + band.flowBanner);
  await chrome.eval('window.__drills.stop()');
  const appErrors5 = await chrome.eval('__test.errors');
  if (appErrors5.length) fail('arm 13: app errors: ' + appErrors5.join(' | '));
  if (errs5.length) fail('arm 13: console errors: ' + errs5.join(' | '));
  chrome.close();
  chrome = null;

  if (!unwiredNightly(25)) { // GH-1078: --nightly leaves arm 25's family out while #605 keeps it red on main
  // ==== arm 25 (GH-442): objective-zone decal — the paper target is VISIBLE ====
  // INTERACTIVE boot (tool:false): the decal's measured-contrast treatment
  // rides the previewink adaptive channel, which is scripted-pinned off
  // under ?obtool (the GH-417 leak law) — exactly the e2e-aim GH-260/L
  // measurement register. The A/B/M pixel rig is the INK_RIG anatomy
  // reduced to one polyline (the zone boundary): B = decal force-hidden
  // (background), M = magenta re-ink (locates the boundary stroke against
  // B), A = shipped presentation (measured against B at M's pixel).
  const errs25 = [], logs25 = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT}/`,
    { port: CDP + 2, tool: false });
  watch(chrome, errs25, logs25);
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
  await waitReady(chrome, 'arm 25 interactive boot');
  await waitDrills(chrome);
  const DECAL_RIG = `window.__zdRigReady = (async () => {
    const dbg = window.__dbg;
    const st = { frozen: false, imgA: null, imgB: null, imgM: null,
      W: 0, H: 0, cueHidden: [] };
    const cueMeshes = () => {
      const gs = [];
      dbg.scene.traverse((o) => {
        if (o.type === 'Group' && o.children.length === 6
          && o.children.every((c) => c.isMesh)
          && o.children.every((c) => c.geometry?.type === 'CylinderGeometry')) gs.push(o);
      });
      return gs.flatMap((g) => g.children);
    };
    function grab() {
      const gl = dbg.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = gl.width; c.height = gl.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(gl, 0, 0);
      return g.getImageData(0, 0, c.width, c.height);
    }
    const px = (img, x, y) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
      const i = (y * img.width + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    const maxDiff = (a, b) => Math.max(Math.abs(a[0] - b[0]),
      Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const wcagL = (c) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
    const wcagRatio = (a, b) => {
      const [hi, lo] = [wcagL(a), wcagL(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const apcaY = (c) => {
      let y = 0.2126729 * (c[0] / 255) ** 2.4 + 0.7151522 * (c[1] / 255) ** 2.4
        + 0.0721750 * (c[2] / 255) ** 2.4;
      if (y < 0.022) y += (0.022 - y) ** 1.414;
      return y;
    };
    const apcaLc = (txt, bg) => {
      const Yt = apcaY(txt), Yb = apcaY(bg);
      let s;
      if (Yb >= Yt) { s = (Yb ** 0.56 - Yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
      s = (Yb ** 0.65 - Yt ** 0.62) * 1.14;
      return s > -0.1 ? 0 : (s + 0.027) * 100;
    };
    // zone boundary polyline in THREE world coords, derived from the LIVE
    // seam bytes only (coords.js law: three = [k.y, lift, k.x]) — the rig
    // re-derives the shape the decal must cover, never reads the decal's
    // own geometry (an offset/scale bug in the projection must show up as
    // missing boundary pixels here).
    function zonePts() {
      const z = window.__drills.objectiveZone();
      if (!z) return null;
      const lift = window.__aim.restDecal().lift;
      const pts = [];
      const P = (kx, ky) => pts.push([ky, lift, kx]);
      if (z.kind === 'circle') {
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * 2 * Math.PI;
          P(z.x + z.r * Math.cos(a), z.y + z.r * Math.sin(a));
        }
      } else {
        for (const [sA, sC] of [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]]) {
          P(z.cx + sA * z.ux * z.halfAlong - sC * z.uy * z.halfAcross,
            z.cy + sA * z.uy * z.halfAlong + sC * z.ux * z.halfAcross);
        }
      }
      return pts;
    }
    // interior stations (fill-tint presence): center + an inset ring
    function zoneInterior() {
      const z = window.__drills.objectiveZone();
      if (!z) return [];
      const lift = window.__aim.restDecal().lift;
      const out = [];
      const P = (kx, ky) => out.push([ky, lift, kx]);
      if (z.kind === 'circle') {
        P(z.x, z.y);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 2 * Math.PI;
          P(z.x + 0.5 * z.r * Math.cos(a), z.y + 0.5 * z.r * Math.sin(a));
        }
      } else {
        for (const [fA, fC] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5],
          [0, -0.5], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
          P(z.cx + fA * z.ux * z.halfAlong - fC * z.uy * z.halfAcross,
            z.cy + fA * z.uy * z.halfAlong + fC * z.ux * z.halfAcross);
        }
      }
      return out;
    }
    function projector() {
      const cam = dbg.camera;
      cam.updateMatrixWorld(true);
      const gl = dbg.renderer.domElement;
      const W = gl.width, H = gl.height;
      const e = cam.matrixWorldInverse.elements, pr = cam.projectionMatrix.elements;
      return { W, H, proj: (p) => {
        const vx = e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12];
        const vy = e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];
        const vz = e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14];
        const cx = pr[0]*vx+pr[4]*vy+pr[8]*vz+pr[12];
        const cy = pr[1]*vx+pr[5]*vy+pr[9]*vz+pr[13];
        const cw = pr[3]*vx+pr[7]*vy+pr[11]*vz+pr[15];
        return { x: (cx/cw+1)/2*W, y: (1-cy/cw)/2*H, viewZ: vz };
      } };
    }
    function samplePoints(pts, pr, N) {
      const segs = [];
      let total = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pr.proj(pts[i]), b = pr.proj(pts[i + 1]);
        if (a.viewZ > -0.02 || b.viewZ > -0.02) continue;
        let t0 = 0, t1 = 1;
        const dx = b.x - a.x, dy = b.y - a.y;
        const clip = (p, q) => {
          if (p === 0) return q >= 0;
          const r = q / p;
          if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
          else { if (r < t0) return false; if (r < t1) t1 = r; }
          return true;
        };
        if (!clip(-dx, a.x) || !clip(dx, pr.W - 1 - a.x)
          || !clip(-dy, a.y) || !clip(dy, pr.H - 1 - a.y)) continue;
        const ax = a.x + t0 * dx, ay = a.y + t0 * dy;
        const bx = a.x + t1 * dx, by = a.y + t1 * dy;
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 0.5) continue;
        segs.push({ ax, ay, bx, by, len });
        total += len;
      }
      if (total < 1) return { total, samples: [] };
      const samples = [];
      for (let k = 0; k < N; k++) {
        let d = (k + 0.5) / N * total;
        for (const s of segs) {
          if (d > s.len) { d -= s.len; continue; }
          const t = d / s.len;
          const ux = (s.bx - s.ax) / s.len, uy = (s.by - s.ay) / s.len;
          samples.push({ x: s.ax + t * (s.bx - s.ax),
            y: s.ay + t * (s.by - s.ay), nx: -uy, ny: ux });
          break;
        }
      }
      return { total, samples };
    }
    window.__zd = {
      /** zero-render proof: live-vs-force-hidden frames identical (<=1 LSB
       * — the #345 envelope's per-channel tolerance) while NO zone is live. */
      zeroDiff() {
        window.__aim.inkFreeze?.(true);
        window.__test.renderAt(0); window.__test.renderAt(0);
        const A = grab();
        window.__aim.restDecalProbe('hide');
        window.__test.renderAt(0);
        const B = grab();
        window.__aim.restDecalProbe('live');
        window.__test.setManual(false);
        window.__aim.inkFreeze?.(false);
        let over = 0, max = 0;
        for (let i = 0; i < A.data.length; i++) {
          const d = Math.abs(A.data[i] - B.data[i]);
          if (d > max) max = d;
          if (d > 1) over++;
        }
        return { max, over, n: A.data.length / 4 };
      },
      freeze() {
        window.__aim.inkFreeze?.(true);
        st.cueHidden = cueMeshes().filter((m) => m.visible);
        st.cueHidden.forEach((m) => { m.visible = false; });
        window.__test.renderAt(0); window.__test.renderAt(0);
        const A = grab();
        window.__aim.restDecalProbe('hide');
        window.__test.renderAt(0);
        const B = grab();
        window.__aim.restDecalProbe('mask');
        window.__test.renderAt(0);
        const M = grab();
        window.__aim.restDecalProbe('live');
        window.__test.renderAt(0);
        st.imgA = A; st.imgB = B; st.imgM = M; st.frozen = true;
        st.W = A.width; st.H = A.height;
        return { ok: true, W: st.W, H: st.H };
      },
      analyze(N = 32) {
        if (!st.frozen) return { error: 'not frozen' };
        const pts = zonePts();
        if (!pts) return { error: 'no zone' };
        const pr = projector();
        const searchR = Math.max(4, Math.ceil(3 * st.W
          / (dbg.renderer.domElement.clientWidth || innerWidth)));
        const { total, samples } = samplePoints(pts, pr, N);
        const rows = [];
        for (const s of samples) {
          let best = null, bestD = 0;
          for (let o = -searchR; o <= searchR; o += 0.5) {
            const x = s.x + s.nx * o, y = s.y + s.ny * o;
            const m = px(st.imgM, x, y), b = px(st.imgB, x, y);
            if (!m || !b) continue;
            const d = maxDiff(m, b);
            if (d > bestD) { bestD = d; best = { x, y }; }
          }
          if (!best || bestD < 30) { rows.push({ status: 'occluded' }); continue; }
          const line = px(st.imgA, best.x, best.y);
          const bg = px(st.imgB, best.x, best.y);
          rows.push({ status: 'visible', d: maxDiff(line, bg),
            wcag: +wcagRatio(line, bg).toFixed(3),
            lc: +apcaLc(line, bg).toFixed(1),
            light: wcagL(line) > wcagL(bg) });
        }
        const inner = [];
        for (const p of zoneInterior()) {
          const q = pr.proj(p);
          if (q.viewZ > -0.02) continue;
          const a2 = px(st.imgA, q.x, q.y), b2 = px(st.imgB, q.x, q.y);
          if (a2 && b2) inner.push(maxDiff(a2, b2));
        }
        const vis = rows.filter((r) => r.status === 'visible');
        const ws = vis.map((r) => r.wcag).sort((a, b) => a - b);
        const lcs = vis.map((r) => Math.abs(r.lc)).sort((a, b) => a - b);
        return { lenPx: Math.round(total), n: rows.length, nVis: vis.length,
          nLight: vis.filter((r) => r.light).length,
          medW: ws.length ? ws[Math.floor(ws.length / 2)] : null,
          medLc: lcs.length ? lcs[Math.floor(lcs.length / 2)] : null,
          nInner: inner.length,
          innerHit: inner.filter((d) => d >= 2).length };
      },
      unfreeze() {
        st.cueHidden.forEach((m) => { m.visible = true; });
        st.cueHidden = [];
        st.frozen = false;
        st.imgA = st.imgB = st.imgM = null;
        window.__test.setManual(false);
        window.__aim.inkFreeze?.(false);
        return true;
      },
    };
    return true;
  })()`;
  // ---- (a) seams present + the zero-render law (no drill live) --------------
  const seam25 = await chrome.eval(`({
    zone: typeof window.__drills.objectiveZone,
    probe: typeof window.__aim.restDecalProbe,
    decal: typeof window.__aim.restDecal,
    solve: typeof window.__aim.zoneDecal,
  })`);
  if (seam25.zone !== 'function' || seam25.probe !== 'function'
    || seam25.decal !== 'function') {
    fail('arm 25: GH-442 seams missing (pre-fix tree — the zone decal does '
      + 'not exist): ' + JSON.stringify(seam25));
    throw new Error('arm 25: cannot continue without the decal seams');
  }
  if (await chrome.eval('window.__drills.objectiveZone()') !== null) {
    fail('arm 25a: objectiveZone must be null outside a drill');
  }
  const d25a = await chrome.eval('window.__aim.restDecal()');
  if (d25a.visible !== false) {
    fail('arm 25a: decal visible outside a drill: ' + JSON.stringify(d25a));
  }
  if ((await chrome.eval(DECAL_RIG)) !== true) {
    fail('arm 25: decal rig inject failed');
  }
  const zero25 = await chrome.eval('window.__zd.zeroDiff()');
  if (!zero25 || zero25.over !== 0) {
    fail('arm 25a: non-drill scene is NOT pixel-identical with the decal '
      + 'system force-hidden (zero-render law): ' + JSON.stringify(zero25));
  }
  console.log(`arm 25a zero-render: maxDelta=${zero25?.max} over=${zero25?.over}`
    + ` of ${zero25?.n}px`);
  // ---- (b) bu-f5: single-source law + presence -------------------------------
  if (!(await chrome.eval('window.__drills.start("bu-f5")'))) {
    fail('arm 25b: bu-f5 start refused');
  }
  await sleep(500);
  const src25 = await chrome.eval(`(() => {
    const live = window.__drills.objectiveZone();
    const cat = window.__drills.layout('bu-f5', 3).objective.cueRest;
    return { live: JSON.stringify(live), cat: JSON.stringify(cat) };
  })()`);
  if (!src25.live || src25.live === 'null' || src25.live !== src25.cat) {
    fail('arm 25b: live zone must be the catalog bytes verbatim (single-'
      + 'source law): ' + JSON.stringify(src25));
  }
  let vis25 = null;
  for (let i = 0; i < 20; i++) {
    vis25 = await chrome.eval('window.__aim.restDecal()');
    if (vis25?.visible === true && vis25?.fade >= 1) break;
    await sleep(150);
  }
  if (vis25?.visible !== true || vis25.kind !== 'rect') {
    fail('arm 25b: decal not visible at bu-f5 address: ' + JSON.stringify(vis25));
  }
  // ---- (c) contrast cells: 4 GH-417 levels x {blue, green} -------------------
  // Convergence gate: the adaptive channel must be LIVE on this interactive
  // boot (the GH-260 rule-5 philosophy: a broken previewink wire silently
  // regressing the decal to the static scene tone must fail LOUDLY), and
  // measurement waits for the GH-284 converged staticFrozen state exactly
  // like the e2e-aim measureCell law.
  const zdConverge = async (label) => {
    let conv = null;
    for (let i = 0; i < 80; i++) {
      conv = await chrome.eval(
        '({ ink: __aim.adaptiveInk?.(), zd: __aim.zoneDecal?.() })');
      if (conv?.ink?.staticFrozen === true && conv?.zd?.active === true) break;
      await sleep(250);
    }
    if (conv?.ink?.staticFrozen !== true || conv?.zd?.active !== true) {
      throw new Error(`arm 25 ${label}: adaptive zone channel never `
        + `converged: ${JSON.stringify(conv)}`);
    }
    return conv;
  };
  const zdCell = async (label) => {
    const conv = await zdConverge(label);
    const fz = await chrome.eval('window.__zd.freeze()');
    if (!fz?.ok) throw new Error(`arm 25 ${label}: freeze ${JSON.stringify(fz)}`);
    const res = await chrome.eval('window.__zd.analyze(32)');
    await chrome.eval('window.__zd.unfreeze()');
    await sleep(150);
    if (res?.error) throw new Error(`arm 25 ${label}: analyze ${res.error}`);
    res.zd = conv.zd; // the channel receipts (lineA ladder assertion below)
    console.log(`arm 25 ${label}: len=${res.lenPx}px vis=${res.nVis}/${res.n}`
      + ` light=${res.nLight}/${res.nVis}`
      + ` medW=${res.medW} medLc=${res.medLc}`
      + ` inner=${res.innerHit}/${res.nInner}`
      + ` level=${conv.zd.level} lineA=${conv.zd.lineA}`
      + ` washRung=${conv.zd.rungFill}`);
    return res;
  };
  const setLevel25 = async (level) => {
    await chrome.eval(`window.__settings.set('assistContrast', '${level}')`);
    await sleep(400);
  };
  const setCloth25 = async (cloth) => {
    await chrome.eval(`window.__settings.set('clothColor', '${cloth}')`);
    await sleep(700);
    const live = await chrome.eval('window.__drills.state()');
    if (!live || live.id !== 'bu-f5' || live.done) {
      throw new Error('arm 25c: clothColor flip must not kill the drill: '
        + JSON.stringify(live));
    }
  };
  // presence floor: >= 60% of boundary stations locate a decal stroke, and
  // the interior tint reads at >= 40% of the inset stations (fill 0.08 —
  // a subtle wash, but a measurable one; the LOW level keeps a reduced
  // floor since its solved ink sits deliberately near the felt).
  const zdPresence = (label, res, low) => {
    if (res.nVis < Math.ceil(res.n * 0.6)) {
      fail(`arm 25 ${label}: boundary stroke missing (${res.nVis}/${res.n} `
        + 'stations located it)');
    }
    const floor = low ? 0.15 : 0.4;
    if (res.nInner && res.innerHit < Math.ceil(res.nInner * floor)) {
      fail(`arm 25 ${label}: interior tint unreadable `
        + `(${res.innerHit}/${res.nInner} inset stations)`);
    }
  };
  // measured floors — white-on-cloth deliverables (owner fix round: the
  // boundary is physical paper-white, lit; the fill is the paper wash,
  // asserted by presence). Receipts (2026-08-09, DPR-2 default framing,
  // 5 mm lit white stroke): medW blue 2.24/2.43/2.47/2.47, green
  // 3.61/3.96/4.02/4.02 across low/standard/high/maximum (medLc blue
  // 44-51, green 62-70); every visible station read LIGHT on both felts.
  //   WHITE LAW: >= 90% of visible boundary stations lighter than the
  //     felt — the owner's white-border verdict, measured (the pre-revision
  //     dark outline scores 0 here: this is the round's red/green arm);
  //   standard >= 2.1 measured WCAG AND >= Lc 40 on BOTH felts — the
  //     bright blue felt physically caps ANY white stroke ~2.4-2.5
  //     (felt display-Y ~0.37; the pre-revision dark carrier's 3.0
  //     guarantee is NOT reachable by a white — reported honestly, owner
  //     flagged in the PR), while green carries ~4.0;
  //   GH-417 ladder = COVERING POWER: zoneDecal().lineA must equal the
  //     anchor-ratio ladder EXACTLY (0.425/0.85/1/1 — a pure derived
  //     constant, no jitter allowed), and the optical ladder must point
  //     the same way with honest slack for the ACES compression of an
  //     alpha step (low <= standard - 0.05 and never invisible via the
  //     two-axis tier; high/maximum >= standard - 0.05 — the top rungs
  //     are display-capped at full opacity and measure ~flat, the arm-L
  //     top-rung law transposed).
  const LINE_A_LADDER = { low: 0.425, standard: 0.85, high: 1, maximum: 1 };
  const cells25 = {};
  for (const cloth of ['tournament_blue', 'classic_green']) {
    if (cloth !== 'tournament_blue') await setCloth25(cloth);
    for (const level of ['standard', 'low', 'high', 'maximum']) {
      await setLevel25(level);
      cells25[`${cloth}/${level}`] = await zdCell(`c/${cloth}/${level}`);
    }
    await setLevel25('standard');
  }
  await setCloth25('tournament_blue');
  for (const cloth of ['tournament_blue', 'classic_green']) {
    const std = cells25[`${cloth}/standard`];
    const low = cells25[`${cloth}/low`];
    const high = cells25[`${cloth}/high`];
    const max = cells25[`${cloth}/maximum`];
    zdPresence(`${cloth}/standard`, std, false);
    zdPresence(`${cloth}/low`, low, true);
    zdPresence(`${cloth}/high`, high, false);
    zdPresence(`${cloth}/maximum`, max, false);
    for (const [name, cell] of [['standard', std], ['low', low],
      ['high', high], ['maximum', max]]) {
      if (!(cell.nLight >= Math.ceil(cell.nVis * 0.9))) {
        fail(`arm 25c ${cloth}/${name}: boundary is not WHITE-on-felt `
          + `(light at ${cell.nLight}/${cell.nVis} stations — the owner's `
          + 'white-border verdict)');
      }
      if (cell.zd.lineA !== LINE_A_LADDER[name]) {
        fail(`arm 25c ${cloth}/${name}: covering power ${cell.zd.lineA} != `
          + `the anchor-ratio ladder ${LINE_A_LADDER[name]}`);
      }
    }
    if (!(std.medW >= 2.1 && std.medLc >= 40)) {
      fail(`arm 25c ${cloth}/standard: white under the measured floor `
        + `(medW ${std.medW} want >= 2.1, medLc ${std.medLc} want >= 40)`);
    }
    if (!(low.medW >= 1.3 || low.medLc >= 12)) {
      fail(`arm 25c ${cloth}/low: decal under the visibility tier `
        + `(medW ${low.medW}, medLc ${low.medLc})`);
    }
    if (!(low.medW <= std.medW - 0.05)) {
      fail(`arm 25c ${cloth}/low: the covering-power dim must read `
        + `(${low.medW} vs std ${std.medW})`);
    }
    for (const [name, cell] of [['high', high], ['maximum', max]]) {
      if (!(cell.medW >= std.medW - 0.05 && cell.medW >= low.medW + 0.05)) {
        fail(`arm 25c ${cloth}/${name}: median WCAG ${cell.medW} under the `
          + `${name} rung (std ${std.medW}, low ${low.medW})`);
      }
    }
  }
  // ---- (d) visibility grammar: address -> shot -> resolution -> re-lay ------
  const watcher25 = chrome.eval(`(async () => {
    const t0 = performance.now();
    const before = JSON.stringify(window.__drills.objectiveZone());
    let sawShot = false, sawNull = false, sawHidden = false, back = null;
    while (performance.now() - t0 < 30000) {
      const z = window.__drills.objectiveZone();
      const d = window.__aim.restDecal();
      const s = window.__test.state();
      if ((s === 'PLAYBACK' || s === 'SIMULATING') && z && d.visible) sawShot = true;
      if (sawShot && !z) sawNull = true;
      if (sawNull && (!d.visible || d.fade < 1)) sawHidden = true;
      if (sawNull && z) { back = JSON.stringify(z); break; }
      await new Promise((r) => setTimeout(r, 30));
    }
    return { before, sawShot, sawNull, sawHidden, back };
  })()`);
  await fire(chrome, 'arm 25d bu-f5 soft miss',
    { v0: 0.7, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
  const lc25 = await watcher25;
  if (!lc25.sawShot) {
    fail('arm 25d: decal must stay visible DURING the shot: '
      + JSON.stringify(lc25));
  }
  if (!lc25.sawNull || !lc25.sawHidden) {
    fail('arm 25d: resolution must null the seam and fade the decal: '
      + JSON.stringify(lc25));
  }
  if (!lc25.back || lc25.back === lc25.before) {
    fail('arm 25d: the retreat re-lay must re-arm a DIFFERENT zone '
      + '(bu-f5 pos 4 -> 3): ' + JSON.stringify(lc25));
  }
  let vis25d = null;
  for (let i = 0; i < 20; i++) {
    vis25d = await chrome.eval('window.__aim.restDecal()');
    if (vis25d?.visible === true && vis25d?.fade >= 1) break;
    await sleep(150);
  }
  if (vis25d?.visible !== true) {
    fail('arm 25d: decal not re-armed after the re-lay: '
      + JSON.stringify(vis25d));
  }
  await chrome.eval('window.__drills.stop()');
  let gone25 = null;
  for (let i = 0; i < 20; i++) {
    gone25 = await chrome.eval(
      '({ z: window.__drills.objectiveZone(), d: window.__aim.restDecal() })');
    if (gone25?.z === null && gone25?.d?.visible === false) break;
    await sleep(150);
  }
  if (gone25?.z !== null || gone25?.d?.visible !== false) {
    fail('arm 25d: stop() must clear the zone + decal: '
      + JSON.stringify(gone25));
  }
  // ---- (e) circle sibling (bu-f2 stop-shot ghost zone) -----------------------
  if (!(await chrome.eval('window.__drills.start("bu-f2")'))) {
    fail('arm 25e: bu-f2 start refused');
  }
  await sleep(500);
  let vis25e = null;
  for (let i = 0; i < 20; i++) {
    vis25e = await chrome.eval('window.__aim.restDecal()');
    if (vis25e?.visible === true && vis25e?.fade >= 1) break;
    await sleep(150);
  }
  if (vis25e?.visible !== true || vis25e.kind !== 'circle') {
    fail('arm 25e: circle decal not visible at bu-f2 address: '
      + JSON.stringify(vis25e));
  }
  const circle25 = await zdCell('e/tournament_blue/standard/circle');
  zdPresence('e/circle', circle25, false);
  // white-law + measured floor (receipt 2026-08-09: medW 2.29, medLc 47.8,
  // 28/28 visible stations light — the ring sits nearer the lamp pool than
  // the bu-f5 foot-rail paper, so its blue-felt cap is a touch lower)
  if (!(circle25.nLight >= Math.ceil(circle25.nVis * 0.9))) {
    fail(`arm 25e circle/standard: boundary is not WHITE-on-felt `
      + `(light at ${circle25.nLight}/${circle25.nVis})`);
  }
  if (!(circle25.medW >= 2.0 && circle25.medLc >= 38)) {
    fail(`arm 25e circle/standard: white under the measured floor `
      + `(medW ${circle25.medW} want >= 2.0, medLc ${circle25.medLc} `
      + 'want >= 38)');
  }
  // ---- (f) assist-off law (review r1 P1): hiding every preview line must
  // NOT starve the zone channel — the decal is drill chrome, not an aim
  // line, and the GH-417 level keeps applying to it at address.
  await chrome.eval("__aim.setAssist('off')");
  await sleep(600);
  let off25 = null;
  for (let i = 0; i < 40; i++) {
    off25 = await chrome.eval(
      '({ zd: __aim.zoneDecal?.(), d: __aim.restDecal() })');
    if (off25?.zd?.active === true && off25?.d?.adaptive === true) break;
    await sleep(250);
  }
  if (off25?.zd?.active !== true || off25?.d?.adaptive !== true) {
    fail('arm 25f: assist-off starved the zone channel (decal fell back '
      + 'to the static tone): ' + JSON.stringify(off25));
  }
  await chrome.eval("__aim.setAssist('standard')");
  await sleep(300);
  // ---- (g) local-replay suppression (review r2 P2): after a miss re-lays
  // the next attempt, the Replay button re-plays the PREVIOUS shot — the
  // NEXT attempt's paper must not render over the archived shot (the
  // shared-replay ctx.replayActive law extended to the local payload).
  await fire(chrome, 'arm 25g bu-f2 soft miss',
    { v0: 0.7, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
  let vis25g = null;
  for (let i = 0; i < 25; i++) {
    vis25g = await chrome.eval('window.__aim.restDecal()');
    if (vis25g?.visible === true && vis25g?.fade >= 1) break;
    await sleep(150);
  }
  if (vis25g?.visible !== true) {
    fail('arm 25g: decal not re-armed before the replay leg: '
      + JSON.stringify(vis25g));
  }
  const watcher25g = chrome.eval(`(async () => {
    const t0 = performance.now();
    let sawHeld = false, sawHidden = false, backVisible = false;
    while (performance.now() - t0 < 20000) {
      const s = window.__test.state();
      const d = window.__aim.restDecal();
      if (s === 'PLAYBACK' && d.replayHeld) sawHeld = true;
      if (s === 'PLAYBACK' && d.replayHeld && !d.visible) sawHidden = true;
      if (sawHidden && s !== 'PLAYBACK' && s !== 'SETTLED'
        && d.visible && d.fade >= 1) { backVisible = true; break; }
      await new Promise((r) => setTimeout(r, 30));
    }
    return { sawHeld, sawHidden, backVisible };
  })()`);
  await chrome.eval('document.getElementById("replay").click()');
  const g25 = await watcher25g;
  if (!g25.sawHeld || !g25.sawHidden) {
    fail('arm 25g: local replay did not suppress the next-attempt decal: '
      + JSON.stringify(g25));
  }
  if (!g25.backVisible) {
    fail('arm 25g: decal did not re-arm after the local replay resolved: '
      + JSON.stringify(g25));
  }
  await chrome.eval('window.__drills.stop()');
  await sleep(400);
  const appErrors25 = await chrome.eval('__test.errors');
  if (appErrors25.length) fail('arm 25: app errors: ' + appErrors25.join(' | '));
  if (errs25.length) fail('arm 25: console errors: ' + errs25.join(' | '));

  } // arm 25 (NIGHTLY_UNWIRED)

  // ---- arm 26 (GH-680): a LIVE sandbox drill owns adjudication — the 9-ball
  // fold never calls a foul / grants ball-in-hand / revives the cue at the
  // head spot / rotates the seat under it. Circle drill, REAL-USER desktop
  // boot (no obtool), the issue's stroke: from the fixed centre spot straight
  // at the LEFT side pocket (phi = pi; ball 8 sits on that line) at v0 3.2 —
  // a legal pot for the drill ("Success") that the fold read as "wrong ball
  // first" (the 1 is the lowest). A 50 ms in-page poll over 4 s asserts the
  // fold surfaces never appear; a REAL mouse drag at the cue ball at dt 2.5 s
  // (the old BIH window) must not move the attempt-2 cue off the fixed spot.
  let fails26 = 0; // the OK line below is withheld under any arm-26 FAIL
  const fail26 = (m) => { fails26 += 1; fail(m); };
  chrome?.close(); // arm 25's browser; --nightly leaves arm 25 out (NIGHTLY_UNWIRED), so there may be none
  const errs26 = [], logs26 = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT}/`,
    { port: CDP + 3, tool: false });
  watch(chrome, errs26, logs26);
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
  await waitReady(chrome, 'arm 26 real-user boot');
  await waitDrills(chrome);
  const saw26 = (s) => logs26.some((l) => l.includes(s));
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail26('arm 26: circle start refused');
  await sleep(400);
  const fixed26 = await chrome.eval('__test.balls().find((b) => b.id === 0).pos');
  const HEAD26 = `(() => { const b = __test.balls().find((x) => x.id === 0);
    return Math.abs(b.pos[2]) < 1e-3 && Math.abs(b.pos[0] + 0.635) < 1e-3; })()`;
  // in-page poller: state / banner / cue-at-head-spot / player, 50 ms x 4 s
  // (window `ms`; `window.__poll26stop = true` ends it early once the
  // runner has seen the settle edge + the re-lay — load-tolerant timing)
  const POLL26 = (ms) => `window.__poll26stop = false; window.__poll26 = (async () => {
    const out = { bih: 0, foul: 0, head: 0, p2: 0, states: new Set(), banners: new Set() };
    const t0 = performance.now();
    while (performance.now() - t0 < ${ms} && !window.__poll26stop) {
      const st = window.__test.state();
      const b = document.getElementById('banner');
      const shown = b.style.display === 'block' && b.textContent.trim();
      out.states.add(st);
      if (st === 'BALL_IN_HAND') out.bih += 1;
      if (shown && /FOUL/i.test(b.textContent)) { out.foul += 1; out.banners.add(b.textContent); }
      if (${HEAD26}) out.head += 1;
      if (window.__rules.player() !== 1) out.p2 += 1;
      await new Promise((r) => setTimeout(r, 50));
    }
    return { ...out, states: [...out.states], banners: [...out.banners] };
  })(), true`;
  await chrome.eval(POLL26(20000));
  const mark26 = logs26.length;
  const rej26 = await chrome.eval('__test.shoot({ v0: 3.2, phi: Math.PI, theta: 0, a: 0, b: 0 })');
  if (rej26) fail26('arm 26: stroke refused: ' + rej26);
  // the settle edge (≈2.2 s calm; later under load) opens the old 1.4 s BIH
  // window — the drag lands right inside it
  const edge26 = async (tag) => {
    let st = 'PLAYBACK';
    for (let i = 0; i < 300 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
      await sleep(50);
      st = await chrome.eval('__test.state()').catch(() => st);
    }
    if (st === 'PLAYBACK') fail26(`${tag}: stroke never settled`);
    return st;
  };
  await edge26('arm 26 S1');
  await sleep(150);
  // the drill's law for a passing `run` stroke is rest-position continuation
  // (onSettle re-lays the KERNEL rest positions, FORMAT.md §3.5) — the cue
  // the attempt-2 address must show is the one at rest here, untouched by
  // any fold revive and by the drag below
  const rest26 = await chrome.eval('__test.balls().find((b) => b.id === 0).pos');
  // REAL drag at the cue ball inside the old BIH window
  const cs26 = await chrome.eval('window.__aim.ballScreen(0)');
  if (cs26) {
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: cs26.x, y: cs26.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 6; i++) {
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
        x: cs26.x + 15 * i, y: cs26.y + 12 * i, button: 'left', buttons: 1 });
      await sleep(30);
    }
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: cs26.x + 90, y: cs26.y + 72, button: 'left', buttons: 0, clickCount: 1 });
  } else fail26('arm 26: no cue screen position for the drag');
  await sleep(RELAY_MS); // the drill's re-lay lands
  await chrome.eval('window.__poll26stop = true, true');
  const poll26 = await chrome.eval('window.__poll26');
  const st26 = await chrome.eval('window.__drills.state()');
  const cue26 = await chrome.eval('__test.balls().find((b) => b.id === 0).pos');
  if (!st26 || st26.attempt !== 1 || st26.score < 1 || st26.done) {
    fail26('arm 26: circle attempt 1 not a live pass: ' + JSON.stringify(st26));
  }
  if (poll26.bih || poll26.foul || poll26.head || poll26.p2) {
    fail26('arm 26: the fold adjudicated under the live drill: ' + JSON.stringify(poll26));
  }
  const moved26 = Math.hypot(cue26[0] - rest26[0], cue26[2] - rest26[2]);
  if (moved26 > 1e-6) fail26(`arm 26: attempt-2 cue left the drill's rest lay by ${moved26} (drag / fold revive accepted)`);
  const left26 = Math.hypot(rest26[0] - fixed26[0], rest26[2] - fixed26[2]);
  if (left26 < 1e-3) fail26('arm 26: the stroke never moved the cue off the fixed spot (probe blind)');
  const l26 = logs26.slice(mark26);
  if (l26.some((l) => l.includes('[flow] foulCalled') || l.includes('[flow] playerChanged'))) {
    fail26('arm 26: foulCalled/playerChanged rode the wire under the drill');
  }
  if (!l26.some((l) => l.includes('[flow] drillFoulSuppressed'))) fail26('arm 26: no drillFoulSuppressed mirror');
  // S2: first contact on ball 3 (12 deg + 24 deg x 2 = 60 deg), a miss —
  // the run ends on the DRILL's terms only (no BIH, no foul, seat 1 kept)
  await chrome.eval(POLL26(30000));
  const mark26b = logs26.length;
  const rej26b = await chrome.eval('__test.shoot({ v0: 1.0, phi: Math.PI / 3, theta: 0, a: 0, b: 0 })');
  if (rej26b) fail26('arm 26 S2: stroke refused: ' + rej26b);
  await edge26('arm 26 S2');
  await sleep(1200); // the drill's verdict + complete() land on the settle
  await chrome.eval('window.__poll26stop = true, true');
  const poll26b = await chrome.eval('window.__poll26');
  const st26b = await chrome.eval('window.__drills.state()');
  const l26b = logs26.slice(mark26b);
  if (!st26b || !st26b.done) fail26('arm 26 S2: the miss did not end the run: ' + JSON.stringify(st26b));
  if (poll26b.bih || poll26b.foul || poll26b.p2) {
    fail26('arm 26 S2: the fold adjudicated the run-ending miss: ' + JSON.stringify(poll26b));
  }
  if (l26b.some((l) => l.includes('[flow] foulCalled') || l.includes('[flow] playerChanged'))) {
    fail26('arm 26 S2: foulCalled/playerChanged rode the wire under the drill');
  }
  if (await chrome.eval('window.__rules.player()') !== 1) fail26('arm 26 S2: the seat rotated inside a solo drill');
  // the post-completion table stays strokeable: cue on the table, AIM
  const post26 = await chrome.eval(`({ st: __test.state(),
    cue: __test.balls().find((b) => b.id === 0).pocketed })`);
  if (post26.st !== 'AIM' || post26.cue) fail26('arm 26 S2: post-run table not strokeable: ' + JSON.stringify(post26));
  // CONTROL: the 9-ball MATCH path (no drill) still calls "wrong ball
  // first" + ball-in-hand — the suppression is the sandbox drill's alone
  await chrome.eval('window.__drills.stop()');
  await chrome.eval(`window.__settings.changeMode('play'), true`);
  await chrome.eval('__test.rerack(1)');
  await sleep(600);
  await chrome.eval('__test.layout([{ id: 0, x: 0, y: -0.5 }, { id: 2, x: 0, y: 0.3 }, { id: 1, x: 0.4, y: 0.6 }])');
  await sleep(300);
  const mark26c = logs26.length;
  const rej26c = await chrome.eval('__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (rej26c) fail26('arm 26 control: stroke refused: ' + rej26c);
  await settle(chrome, 'arm 26 control');
  await sleep(300);
  const ctl26 = await chrome.eval(`({ st: __test.state(), banner: document.getElementById('banner').textContent })`);
  if (ctl26.st !== 'BALL_IN_HAND' || !logs26.slice(mark26c).some((l) => l.includes('[flow] foulCalled'))) {
    fail26('arm 26 control: the match path no longer calls the wrong-first foul: ' + JSON.stringify(ctl26));
  }
  if (!/FOUL/i.test(ctl26.banner)) fail26('arm 26 control: no FOUL banner on the match path: ' + JSON.stringify(ctl26));
  const appErrors26 = await chrome.eval('__test.errors');
  if (appErrors26.length) fail26('arm 26: app errors: ' + appErrors26.join(' | '));
  if (errs26.length) fail26('arm 26: console errors: ' + errs26.join(' | '));
  if (fails26 === 0) console.log('[e2e-drills] arm 26 GH-680 ok (sandbox drill owns adjudication; match control still fouls)');
  else console.error(`[e2e-drills] arm 26 GH-680 RED (${fails26} failure(s))`);

  // ---- arm 27 (GH-680 review r1 P1): Replay after a run-ENDING scratch -----
  // A sandbox stroke that scratches AND ends the run: flow's settleUnderDrill
  // lands it as a plain AIM settle (the drill is still live at that beat —
  // no fold revive), the drill's complete() revives the cue at the head
  // spot. Pressing Replay re-sinks the cue in the playback; routeReplay's
  // match-fold arm revived only for BALL_IN_HAND and drills.js ignores the
  // duplicate record — the player was left in AIM with a pocketed cue
  // (review r1 P1). The sandbox owns restoration (FORMAT.md §3.5): after the
  // replay settles the cue is back where the completion put it, the
  // parked drill snapshot is unchanged, no second play is recorded, the
  // table is strokeable. Circle drill, real-user boot: from the centre spot
  // straight at the RIGHT side pocket (phi = 0 — the half-slot-rotated ring
  // leaves that ray clear) at v0 2.2: noScratch → 'scratch' → run over.
  let fails27 = 0;
  const fail27 = (m) => { fails27 += 1; fail(m); };
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?seed=1&u=arm27` });
  await waitReady(chrome, 'arm 27 real-user boot');
  await waitDrills(chrome);
  const CUE27 = `(() => { const b = __test.balls().find((x) => x.id === 0);
    return { pocketed: b.pocketed, pos: b.pos, st: __test.state(),
      shoot: document.getElementById('shoot').disabled,
      drill: window.__drills.state(), plays: window.__drills.bests().circle?.plays ?? 0,
      player: window.__rules.player() }; })()`;
  const settle27 = async (tag) => {
    let st = 'PLAYBACK';
    for (let i = 0; i < 300 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
      await sleep(50);
      st = await chrome.eval('__test.state()').catch(() => st);
    }
    if (st === 'PLAYBACK' || st === 'SIMULATING') fail27(`${tag}: stroke never settled`);
    return st;
  };
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail27('arm 27: circle start refused');
  await sleep(400);
  const plays27a = (await chrome.eval(CUE27)).plays;
  const rej27 = await chrome.eval('__test.shoot({ v0: 2.2, phi: 0, theta: 0, a: 0, b: 0 })');
  if (rej27) fail27('arm 27: stroke refused: ' + rej27);
  await settle27('arm 27 S1');
  await sleep(1200); // the drill's verdict + complete() (cue revive) land
  const live27 = await chrome.eval(CUE27);
  // preconditions (probe blind otherwise): the stroke scratched, the run
  // ended on it, complete() revived the cue, one play recorded
  if (!live27.drill || live27.drill.id !== 'circle' || !live27.drill.done || live27.drill.sandbox !== true) {
    fail27('arm 27: the scratch did not end the sandbox run: ' + JSON.stringify(live27.drill));
  }
  if (live27.pocketed || live27.st !== 'AIM') fail27('arm 27: post-completion table not strokeable before the replay: ' + JSON.stringify({ pocketed: live27.pocketed, st: live27.st }));
  if (live27.plays !== plays27a + 1) fail27(`arm 27: completion recorded ${live27.plays - plays27a} play(s), expected 1`);
  const mark27 = logs26.length;
  if (!logs26.some((l) => l.includes('[drills] complete') || l.includes('"scratch"') || l.includes('drillFoulSuppressed'))) {
    // the wire mirror is advisory here: the byte facts above are the gate
    console.log('arm 27: (no scratch/complete mirror seen on the wire; byte facts gate)');
  }
  // REPLAY: the playback re-sinks the cue; the settle must restore the
  // completion's table — cue revived at the same spot, AIM, no new play
  await chrome.eval('document.getElementById("replay").click()');
  let started27 = false;
  for (let i = 0; i < 40 && !started27; i++) {
    await sleep(50);
    started27 = await chrome.eval('__test.state() === "PLAYBACK"').catch(() => false);
  }
  if (!started27) fail27('arm 27: Replay never entered PLAYBACK');
  await settle27('arm 27 replay');
  await sleep(600);
  const post27 = await chrome.eval(CUE27);
  if (post27.pocketed || post27.st !== 'AIM' || post27.shoot) {
    fail27('arm 27: replay of the run-ending scratch left the table unstrokeable: '
      + JSON.stringify({ pocketed: post27.pocketed, st: post27.st, shootDisabled: post27.shoot }));
  }
  const drift27 = Math.hypot(post27.pos[0] - live27.pos[0], post27.pos[2] - live27.pos[2]);
  if (!post27.pocketed && drift27 > 1e-6) fail27(`arm 27: the replayed cue revived ${drift27} m off the completion's spot`);
  if (post27.plays !== live27.plays) fail27(`arm 27: the replay recorded a duplicate play (${live27.plays} → ${post27.plays})`);
  if (!post27.drill || !post27.drill.done || post27.drill.id !== 'circle'
    || post27.drill.score !== live27.drill.score || post27.drill.attempt !== live27.drill.attempt) {
    fail27('arm 27: the parked drill snapshot changed across the replay: ' + JSON.stringify([live27.drill, post27.drill]));
  }
  if (post27.player !== 1) fail27('arm 27: the seat rotated across a sandbox replay');
  const l27 = logs26.slice(mark27);
  if (l27.some((l) => l.includes('[flow] foulCalled') || l.includes('[flow] playerChanged') || l.includes('[flow] gameWon'))) {
    fail27('arm 27: fold hooks rode the wire on the sandbox replay');
  }
  const appErrors27 = await chrome.eval('__test.errors');
  if (appErrors27.length) fail27('arm 27: app errors: ' + appErrors27.join(' | '));
  if (errs26.length) fail27('arm 27: console errors: ' + errs26.join(' | '));
  if (fails27 === 0) console.log('[e2e-drills] arm 27 GH-680 review r1 P1 ok (replay after a run-ending scratch restores the sandbox table)');
  else console.error(`[e2e-drills] arm 27 GH-680 review r1 P1 RED (${fails27} failure(s))`);

  // ==== arm 28 (GH-668 S5 slice 4 B-PR03): the drill strip docks to band T's
  // RENDERED right edge. touch.css §3.11 anchors #hud (the phone band-T status
  // row) at safe-l + --ob-corner-l — a FOUR-pill toolbar reservation — while
  // #ob-drills makes the toolbar FIVE pills wide: on the pre-fix bytes the
  // fifth pill (x 279..323 at 844x390 + the audit's 47 px notch) painted over
  // the strip's first ~48 px (name badge left 275). drills.js now derives the
  // strip's OWN inset — --drills-slot-l, inline, component-local — from
  // #ob-toolbar rect.right + sp-2 − #hud rect.left (uiaudit, the F37 strip
  // gap: the old max(--ob-shell-bandt-r, toolbar.right) term added a second
  // sp-2 — the seam is #hud's own left edge, already sp-2 past the toolbar),
  // and drills.css consumes it as margin-inline-start on the coarse register
  // only. Legs: (a) the FINE-pointer boot (arm 27's desktop chrome): no
  // property, computed margin 0, strip in the HUD panel flow; (b) real coarse
  // boots 844x390 en + de and 667x375 en under the audit's safe-area insets:
  // the name badge's left edge clears BOTH the pill's and the toolbar's right
  // edge by ≥ sp-2 and stands where the inset puts it, max(toolbar.right + sp-2,
  // #hud.left) ± 0.5 — exactly sp-2 right of the toolbar at every arm-28
  // register (the GAP law; 16 px was the doubled inset), the badge sits inside band T (the shell's bands().bandT
  // probe), the inline property equals the measured difference ± 0.5 and the
  // computed margin follows it; (c) RE-DERIVE: a 44 px probe pill appended to
  // #ob-toolbar widens the rendered toolbar → the strip's rendered left edge
  // moves by the same amount (the ResizeObserver path: the drills inset on
  // main's 4-pill band, #hud's left under uiaudit F37) and returns when the
  // probe leaves; a live
  // viewport re-size 844 → 667 re-judges the same law (resize path). Red
  // proof: the pre-fix app bytes (badge left 275 < pill right 323 + 8, no
  // property, margin 0 on the coarse register).
  let fails28 = 0;
  const fail28 = (m) => { fails28 += 1; fail(m); };
  const BAND28 = `(() => {
    const r = (el) => { if (!el || !el.getClientRects().length) return null;
      const b = el.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const html = document.documentElement, cs = getComputedStyle(html);
    const rem = parseFloat(cs.fontSize) || 16;
    const lenPx = (v) => (/rem\s*$/.test(v) ? parseFloat(v) * rem : parseFloat(v));
    const chips = document.getElementById('ob-drill-chips');
    const hud = document.getElementById('hud');
    return {
      on: !!chips?.classList.contains('on'), touch: html.classList.contains('ob-touch'),
      inHud: !!(hud && chips && hud.contains(chips)),
      badge: r(chips?.querySelector('.ob-badge:first-child')), chips: r(chips),
      pill: r(document.getElementById('ob-drills')), tb: r(document.getElementById('ob-toolbar')),
      hud: r(hud),
      slot: chips ? chips.style.getPropertyValue('--drills-slot-l') : '',
      ml: chips ? (parseFloat(getComputedStyle(chips).marginInlineStart) || 0) : null,
      seam: lenPx(cs.getPropertyValue('--ob-shell-bandt-r')) || 0,
      sp2: lenPx(cs.getPropertyValue('--ob-sp-2')) || 8,
      shell: typeof window.__shell, shellOpen: !!window.__shell?.isOpen?.(),
      bandT: window.__shell?.bands?.().bandT ?? null,
      vw: innerWidth, vh: innerHeight,
    };
  })()`;
  const want28 = (m) => Math.max(0, m.tb.r + m.sp2 - m.hud.l);
  const judge28 = (tag, m, phone) => {
    if (!m.on) return fail28(`${tag}: strip not on`);
    if (phone !== m.touch) return fail28(`${tag}: register mismatch (ob-touch=${m.touch}, expected ${phone})`);
    if (!m.inHud || !m.badge) return fail28(`${tag}: strip/badge not composed in #hud: ${JSON.stringify(m)}`);
    if (!phone) {
      if (m.slot !== '' || m.ml !== 0) fail28(`${tag}: the fine-pointer strip must carry no inset (slot='${m.slot}' margin=${m.ml})`);
      return;
    }
    if (!m.pill || !m.tb || !m.hud) return fail28(`${tag}: toolbar/hud geometry unreadable: ${JSON.stringify(m)}`);
    const want = want28(m), got = parseFloat(m.slot);
    if (!m.slot || !Number.isFinite(got)) fail28(`${tag}: --drills-slot-l absent on the coarse register (badge left ${m.badge.l.toFixed(1)}, pill right ${m.pill.r.toFixed(1)})`);
    else if (Math.abs(got - want) > 0.5) fail28(`${tag}: --drills-slot-l ${got} != measured ${want.toFixed(2)} (seam ${m.seam}, toolbar.right ${m.tb.r.toFixed(2)}, hud.left ${m.hud.l.toFixed(2)}, sp-2 ${m.sp2})`);
    if (Math.abs(m.ml - want) > 0.5) fail28(`${tag}: computed margin-inline-start ${m.ml} != ${want.toFixed(2)}`);
    if (m.badge.l < m.pill.r + m.sp2 - 0.5) fail28(`${tag}: name badge left ${m.badge.l.toFixed(1)} under the pill's right edge ${m.pill.r.toFixed(1)} + ${m.sp2}`);
    if (m.badge.l < m.tb.r + m.sp2 - 0.5) fail28(`${tag}: name badge left ${m.badge.l.toFixed(1)} under the toolbar's right edge ${m.tb.r.toFixed(1)} + ${m.sp2}`);
    // uiaudit (the F37 strip gap): the badge stands where the inset puts it — exactly sp-2 right of the toolbar while
    // #hud follows the toolbar (every arm-28 register: 5+ pills), #hud's own left edge where the toolbar is narrower
    const wantBadge = Math.max(m.tb.r + m.sp2, m.hud.l);
    if (Math.abs(m.badge.l - wantBadge) > 0.5) fail28(`${tag}: GAP the name badge stands ${(m.badge.l - m.tb.r).toFixed(1)} px right of the toolbar's right edge ${m.tb.r.toFixed(1)} (law: at max(toolbar.right + sp-2, #hud.left) = ${wantBadge.toFixed(1)} ± 0.5; 16 px was the doubled inset)`);
    if (!m.bandT || !(m.bandT.height > 0)) fail28(`${tag}: __shell.bands().bandT unreadable: ${JSON.stringify(m.bandT)}`);
    else if (m.badge.t < m.bandT.top - 0.5 || m.badge.b > m.bandT.top + m.bandT.height + 0.5) {
      fail28(`${tag}: name badge ${JSON.stringify(m.badge)} outside band T ${JSON.stringify(m.bandT)}`);
    }
    console.log(`arm 28 ${tag}: inset ${m.slot} (toolbar.right ${m.tb.r.toFixed(1)}, seam ${m.seam}, hud.left ${m.hud.l.toFixed(1)}) badge.left ${m.badge.l.toFixed(1)} (gap ${(m.badge.l - m.tb.r).toFixed(1)}) pill.right ${m.pill.r.toFixed(1)} bandT ${JSON.stringify(m.bandT)}`);
  };
  // the shell must be LIVE (it owns the fifth pill, #ob-shell-open, and the
  // band seam) and CLOSED (body.ob-shell-open hides the strip): scripted
  // boots opt in through obshell=1 (the e2e-practice idiom), then quick-play
  // takes the table — bounded waits, load-tolerant
  const closeShell28 = async (tag) => {
    let live = false;
    for (let i = 0; i < 50 && !live; i++) {
      live = await chrome.eval('typeof window.__shell?.quickPlay === "function"').catch(() => false);
      if (!live) await sleep(200);
    }
    if (!live) return fail28(`${tag}: window.__shell never installed (the band seam + the fifth pill live there)`);
    if (await chrome.eval('!!window.__shell.isOpen()')) await chrome.eval('window.__shell.quickPlay(), true');
    let closed = false;
    for (let i = 0; i < 50 && !closed; i++) {
      await sleep(200);
      closed = await chrome.eval('!window.__shell.isOpen() && !document.body.classList.contains("ob-shell-open")').catch(() => false);
    }
    if (!closed) fail28(`${tag}: the shell never closed onto the table`);
  };
  // (a) fine pointer — arm 27's desktop chrome, the parked run restarted
  await closeShell28('28a desktop');
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail28('arm 28a: circle start refused (desktop)');
  await sleep(400);
  judge28('28a desktop 1440x900 en', await chrome.eval(BAND28), false);
  await chrome.eval('window.__drills.stop(); true');
  await sleep(200);
  // (b) + (c) real coarse boots under the audit's notch emulation
  const PHONE_SA28 = { top: 0, left: 47, right: 47, bottom: 21 };
  const PROBE28_ADD = `(() => { const tb = document.getElementById('ob-toolbar');
    const d = document.createElement('div'); d.id = 'ob-arm28-probe';
    d.style.cssText = 'width:44px;min-width:44px;height:44px;flex:0 0 auto;';
    tb.appendChild(d); return true; })()`;
  const PROBE28_RM = '(() => { document.getElementById("ob-arm28-probe")?.remove(); return true; })()';
  const errs28 = [], logs28 = [];
  for (const [w, h, lang, live] of [[844, 390, 'en', true], [844, 390, 'de', false], [667, 375, 'en', false]]) {
    const tag = `28b ${w}x${h} ${lang}`;
    chrome.close();
    chrome = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=arm28-${w}-${lang}`,
      { cdpPort: CDP + 1, width: w, height: h });
    watch(chrome, errs28, logs28);
    const sa = await setSafeAreaInsets(chrome, PHONE_SA28);
    if (!sa) fail28(`${tag}: Emulation.setSafeAreaInsetsOverride unavailable on this Chrome`);
    await waitReady(chrome, `arm 28 ${tag} phone boot`);
    await waitDrills(chrome);
    await verifyCoarse(chrome);
    await closeShell28(tag);
    if (lang !== 'en') {
      await chrome.eval(`window.__settings.set('language', '${lang}')`);
      await sleep(450);
    }
    if (!(await chrome.eval('window.__drills.start("circle")'))) { fail28(`${tag}: circle start refused`); continue; }
    await sleep(500);
    const m1 = await chrome.eval(BAND28);
    judge28(tag, m1, true);
    // the strip predicate on every coarse preset (S5 slice 4 verifier round
    // 1, P1-c): no glyph outside the clip rect, no ellipsis, one badge, the
    // line law per register (667×375 = the two-row readout, ≤ 2 lines)
    const wb = await chrome.eval(DRILLS_BAND_WALKER);
    if (!Array.isArray(wb)) fail28(`${tag}: DRILLS_BAND_WALKER returned ${JSON.stringify(wb)}`);
    else if (wb.length) fail28(`${tag}: DRILLS_BAND_WALKER: ${wb.join('; ')}`);
    else console.log(`arm 28 ${tag}: DRILLS_BAND_WALKER clean (readout "${await chrome.eval(`document.querySelector('#ob-drill-chips .ob-drills__readout')?.textContent ?? ''`)}")`);
    if (!live) continue;
    // (c) re-derive — the ResizeObserver path: a 44 px probe pill widens the
    // rendered toolbar by 44 + the toolbar gap; the inset must follow within
    // a few frames and return when the probe leaves
    await chrome.eval(PROBE28_ADD);
    await sleep(250);
    const m2 = await chrome.eval(BAND28);
    judge28(`28c ${w}x${h} ${lang} +probe`, m2, true);
    // the strip's RENDERED left edge follows the toolbar's rendered right edge. Which leg carries the move depends on the
    // band geometry: under main's 4-pill reservation #hud stays put and the drills inset grows with the toolbar; under
    // uiaudit F37 #hud and the band seam follow the rendered toolbar width (--ob-corner-l-live), and the inset stays put
    // (0 since the strip-gap fix: #hud already stands sp-2 past the toolbar). So the arm judges the strip's own left
    // edge, not the inset alone. Measured at 844x390 en, both strips move +56: main hud.left 275 with inset 56 → 112;
    // F37 hud.left 331 → 387 with inset 8 → 8 (before the strip-gap fix; 0 → 0 after)
    const dTb = m2.tb && m1.tb ? m2.tb.r - m1.tb.r : NaN;
    const dStrip = m2.chips && m1.chips ? m2.chips.l - m1.chips.l : NaN;
    if (!(dTb > 40)) fail28(`28c: the probe pill did not widen the toolbar (Δright ${dTb})`);
    else if (!(Math.abs(dStrip - dTb) <= 0.5)) fail28(`28c: the strip moved ${dStrip} for a toolbar Δright of ${dTb.toFixed(2)} (inset ${m1.slot} → ${m2.slot}, hud.left ${m1.hud?.l} → ${m2.hud?.l}) — the ResizeObserver path is dead`);
    await chrome.eval(PROBE28_RM);
    await sleep(250);
    const m3 = await chrome.eval(BAND28);
    judge28(`28c ${w}x${h} ${lang} −probe`, m3, true);
    if (!(m3.chips && m1.chips && Math.abs(m3.chips.l - m1.chips.l) <= 0.5)) fail28(`28c: the strip did not return after the probe left (left ${m1.chips?.l} → ${m3.chips?.l}, inset ${m1.slot} → ${m3.slot})`);
    // (c) re-derive — the resize path: 844x390 → 667x375 live
    await setPhoneMetrics(chrome, { width: 667, height: 375 });
    await sleep(400);
    const m4 = await chrome.eval(BAND28);
    if (m4.vw !== 667) fail28(`28c: viewport did not re-size (vw ${m4.vw})`);
    judge28('28c 844→667 en (live resize)', m4, true);
  }
  const appErrors28 = await chrome.eval('__test.errors').catch(() => []);
  if (appErrors28.length) fail28('arm 28: app errors: ' + appErrors28.join(' | '));
  if (errs28.length) fail28('arm 28: console errors: ' + errs28.join(' | '));
  if (fails28 === 0) console.log('[e2e-drills] arm 28 GH-668 B-PR03 ok (the drill strip docks to band T\'s rendered right edge)');
  else console.error(`[e2e-drills] arm 28 GH-668 B-PR03 RED (${fails28} failure(s))`);

  // ==== arm 29 (GH-668 S5 slice 4 gate runner): the strip's inset derivation
  // NEVER observes #hud. touch.js's band ResizeObserver writes
  // --ob-corner-r-live SYNCHRONOUSLY inside its callback and §3.11's
  // `#hud:has(#hud-call.on) { right: … --ob-corner-r-live … }` resizes the
  // left-anchored #hud on that write; G4's slotRo observed #hud (a shallower
  // target than the pill being delivered), so every call-pill show raised
  // 'ResizeObserver loop completed with undelivered notifications' → main.js
  // reportError → #err-x visible (the e2e-ui --audit phone session's two
  // #err-x rows). Pose A = the syncCallHost move (hud.js #90: show
  // #hud-match, #hud-call.on with a label) ×2 at 667x375 coarse — the arm
  // proves the pose is LIVE (#hud's right edge retreats, the live token is
  // written) and demands zero RO-loop errors in __test.errors + the console;
  // pose B = the audit's block (live circle drill + de/ja/en). Red proof: the
  // 3543fd89 app bytes (1 error per show, #err-x visible); main 2fabbe4d and
  // the fix are clean.
  let fails29 = 0;
  const fail29 = (m) => { fails29 += 1; fail(m); };
  const errs29 = [], logs29 = [];
  const RO_RE29 = /ResizeObserver loop/;
  const HUD29 = `(() => { const h = document.getElementById('hud'), c = document.getElementById('hud-call'); if (!h) return null;
    const b = h.getBoundingClientRect(); return { r: b.right, call: !!c, inHud: !!(c && h.contains(c)),
      live: getComputedStyle(document.documentElement).getPropertyValue('--ob-corner-r-live').trim() }; })()`;
  const CALL29_ON = (txt) => `(() => { const c = document.getElementById('hud-call'), m = document.getElementById('hud-match');
    if (!c || !m) return false; m.style.display = 'block'; c.textContent = ${JSON.stringify(txt)}; c.classList.add('on'); return true; })()`;
  const CALL29_OFF = `(() => { const c = document.getElementById('hud-call'), m = document.getElementById('hud-match');
    if (!c || !m) return false; c.classList.remove('on'); c.textContent = ''; m.style.display = 'none'; return true; })()`;
  const roErrs29 = async () => ({
    app: await chrome.eval('(window.__test?.errors || []).filter((e) => /ResizeObserver loop/.test(String(e))).length').catch(() => -1),
    console: errs29.filter((e) => RO_RE29.test(e)).length });
  chrome.close();
  chrome = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=arm29`, { cdpPort: CDP + 1, width: 667, height: 375 });
  watch(chrome, errs29, logs29);
  if (!(await setSafeAreaInsets(chrome, PHONE_SA28))) fail29('arm 29: Emulation.setSafeAreaInsetsOverride unavailable on this Chrome');
  await waitReady(chrome, 'arm 29 phone boot');
  await waitDrills(chrome);
  await verifyCoarse(chrome);
  await closeShell28('arm 29');
  await sleep(400);
  const m29 = await chrome.eval(HUD29);
  if (!m29?.call || !m29.inHud) fail29('arm 29: #hud-call not under #hud — the pose cannot be posed: ' + JSON.stringify(m29));
  for (const [leg, txt] of [['A1', 'Nominated: black'], ['A2', 'Nominated: pink — free ball']]) {
    if (!(await chrome.eval(CALL29_ON(txt)))) { fail29(`arm 29 ${leg}: #hud-call / #hud-match missing`); break; }
    await sleep(350);
    const m = await chrome.eval(HUD29); const e = await roErrs29();
    console.log(`arm 29 ${leg}: #hud right ${m.r.toFixed(1)} (rest ${m29.r.toFixed(1)}) --ob-corner-r-live '${m.live}' RO-loop errors ${JSON.stringify(e)}`);
    if (!(m.r < m29.r - 1)) fail29(`arm 29 ${leg}: the §3.11 retreat did not move #hud's right edge (${m29.r} → ${m.r}) — vacuous pose`);
    if (!m.live) fail29(`arm 29 ${leg}: --ob-corner-r-live not written (touch.js band RO silent) — vacuous pose`);
    await chrome.eval(CALL29_OFF);
    await sleep(350);
  }
  if (!(await chrome.eval('window.__drills.start("circle")'))) fail29('arm 29 B: circle start refused');
  await sleep(500);
  for (const lang of ['de', 'ja', 'en']) {
    await chrome.eval(`window.__settings.set('language', '${lang}')`);
    await sleep(450);
  }
  await chrome.eval('window.__drills.stop(); true');
  await sleep(400);
  const e29 = await roErrs29();
  const errx29 = await chrome.eval('(() => { const x = document.getElementById("err-x"); return !!x && getComputedStyle(x).display !== "none" && x.getClientRects().length > 0; })()').catch(() => null);
  if (e29.app + e29.console > 0) fail29(`arm 29: ResizeObserver loop errors raised (app ${e29.app}, console ${e29.console}, #err-x visible ${errx29}) — a drills.js observer sits on #hud again`);
  if (errx29) fail29('arm 29: #err-x is visible after the poses (an app-captured error)');
  const other29 = errs29.filter((e) => !RO_RE29.test(e));
  if (other29.length) fail29('arm 29: console errors: ' + other29.join(' | '));
  if (fails29 === 0) console.log('[e2e-drills] arm 29 GH-668 slice-4 ok (no drills.js observer on #hud: the call-pill show + the locale walk raise zero RO-loop errors at 667x375)');
  else console.error(`[e2e-drills] arm 29 GH-668 slice-4 RED (${fails29} failure(s))`);

  } // !FASTLANE (arms 10, s7, s2, 18, 13, 25-29)

  if (NIGHTLY) {
    for (const [arm, issue] of Object.entries(NIGHTLY_UNWIRED)) {
      if (!/^#\d+$/.test(issue)) fail(`NIGHTLY_UNWIRED arm ${arm}: ${JSON.stringify(issue)} is not an issue number`);
      if (!unwiredSeen.has(arm)) fail(`NIGHTLY_UNWIRED lists arm ${arm}, but no arm consults it — the list drifted from the arms it skips`);
    }
  }
  if (!process.exitCode) {
    console.log(FASTLANE ? 'E2E-DRILLS PASS (fastlane: arms 0 1 3 11 s1 s3 s4 9)'
      : NIGHTLY ? `E2E-DRILLS PASS (nightly: all arms but ${Object.keys(NIGHTLY_UNWIRED).join(', ')})` : 'E2E-DRILLS PASS');
  }
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome?.close();
  chromeB?.close();
  blockServer.close();
  blockServer2.close();
  releaseLayouts(); // unblock any held response so the server can close
  slowServer.close();
  await stopStaticServer(server);
}
