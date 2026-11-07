// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play.mjs — play-place gate (feature 034, program #525 S4; the
// e2e-shell dedicated-driver precedent, protocol R3). Drives the contract
// surface of the play contract (feature 034, internal) end-to-end — every
// play arm lives HERE; web/tools/e2e-shell.mjs is byte-untouched by the 034
// sub-slices (spec ruling 23). Arm ids per plan §8.1:
//
//   P2.  healthy mount (`obshell=1` at play): `.ob-play-host`, the S1 stub
//        lines `display:none`, `[data-ob="play-summary"]` text (FR-004: the
//        unpinned nine_ball rules line = t('settings.variantDefault') on the
//        stub line AND the play summary), `__play.registry()` shape, the
//        `ob:play-mounted` mark once, zero console errors.
//   P-A2. `[data-ob="play-conditions"]` exists, `hidden`, zero height (FR-019).
//   P1b. readiness fixture: `__play.previewCatalog([...])` renders ONE
//        `data-playable="false"` card AFTER the playable set labelled by its
//        `display_name`, focusable, badge = t('settings.gameBadge.<r>'),
//        pick ⇒ false with the blob unchanged; a nameless entry is rejected;
//        `null` restores (the catalog ships no readiness entry — review r1 P1-3).
//   P5.  rail keyboard isolation: ArrowRight BROWSES (aria-selected follows
//        focus, aria-current stays, NO confirm), all six exempted keys on the
//        rail card ⇒ gameplay blob byte-unchanged; the variant-list leg on a
//        snooker boot (SKIP-with-reason while `__settings.variantRows` is
//        absent — 034a-front; mandatory from 034a-mig T024b (4)); trusted
//        Escape at the rail root is SWALLOWED by the gate (shell stays open,
//        place play, blob unchanged; review round 2 P1-2).
//   P-F3. GH-534 F3 mirror: `__play.pick('ten_ball')` raises the kit confirm;
//        trusted Escape declines it; shell stays; blob unchanged.
//   P4.  back-to-play: API `changeMode('playground')` ⇒ `[data-ob="play-back"]`
//        visible; `__play.back()` ⇒ mode play, shell CLOSED, AIM/BIH; from
//        `practice` ⇒ shell stays open; Back FOCUSED + trusted Enter from
//        practice ⇒ focus rests on a VISIBLE play control (the rail's roving
//        card), never <body> / the hidden button (review code review r4 P2-2).
//   P-MIX. mixed-version cache (contract §7 degrade row; review code review r4
//        P2-3): `window.__settings` stubbed WITHOUT changeGame ⇒ every playable
//        card aria-disabled="true" (still focusable), `__play.pick()` false +
//        `#ob-shell-note` = t('shell.place.play.shim.stale'), a tap raises no
//        confirm; restoring the seam re-enables the cards in place.
//   P3.  localized card text ×7: nine_ball (unpinned default line), snooker
//        and carom boots — the summary carries t('game.<id>') and never a raw
//        `wpbsa-`/`umb-` id in any locale.
//   P1.  poisoned degrade — (a) module leg: `/app/play.js` blocked ⇒ no host
//        class, stub visible, `__play` undefined, the stub action poses the
//        RESIDENT `game` section (034a-front; 034a-mig T024b (1) flips this ONE
//        expectation to "NO modal; #ob-shell-note = shim.stale"); (b) leaf
//        leg: `/app/ui/cardrail.js` blocked ⇒ host class, `[data-ob="play-game"]`
//        count === the VISIBLE set (GAME_CATALOG minus heyball unless
//        `capabilities().heyball` / current heyball — review round 2 P1-1),
//        buttons keyboard-reachable through the rung-1 roving handler.
//   P2c. css-blocked leg: `/app/ui/play.css` blocked ⇒ play.js resident but NO
//        host class, stub visible AND ticking (FR-004 default line), `__play`
//        undefined, the stub action poses the resident `game` (034a-mig T024b
//        (2) flips it), zero console errors (review round 3 P2-3 / round 4 P2-1).
//   P2p. phone height cap (844×390 coarse): the section's bottom edge stays
//        above `#ob-shell-quickplay-wrap`; every visible play control ≥ 44 pt.
//   P2p-fade. the de carom fork on the same register (the card overflows the
//        212 px cap): each option focused in turn ⇒ its LABEL box sits WHOLE
//        inside the scroller's visible box minus the scrollfade band wherever
//        the band is drawn (play.css scroll-padding-block on the .ob-scrollfade
//        register + play.js reveal-on-focus; review visual audit round 2,
//        finding 1 — the focused "Markiertes Weiß (UMB-Wortlaut)" label lost
//        its second line under the bottom band); two starts per option (from
//        the top; tail-clipped with the radio visible) + the audited path
//        (focused in en, the locale swap to de reflows the label under focus;
//        the growth is a test-only block under the fork's head with the
//        scroller's scroll anchoring off, sized from the en frame, never the
//        shipped copy).
//   P-E1. discipline pick under a pending decision: PRISTINE carom rack +
//        break_spot ⇒ `__play.pick('nine_ball')` reaches the confirm (declined);
//        PROGRESSED 14.1 rack + break_violation ⇒ pick refused, `#ob-shell-note`
//        = t('shell.notice.decision'), `#ob-shell-decision` still answerable.
//   P-E2. playground→play under a pending decision: place-side `__play.back()`
//        refused with the notice, prompt survives (the direct
//        `__settings.changeMode('play')` API leg is 034a-mig T024b (3)).
//   P-RL. shared-replay lock (e2e-variants V4 staging): at play every commit
//        control `aria-disabled`, `registry().locked === true`, `pick` ⇒ false
//        with no confirm and both blobs byte-identical; `done === true` keeps
//        the lock (review round 2 P1-3); `__share.exit()` ⇒ `active === false`
//        ⇒ `locked === false`, controls re-enabled.
//   P-A11Y. the discipline listbox has an accessible NAME: `aria-labelledby`
//        → the DISCIPLINE h3 (`#ob-play-choose`) inside the section, text ===
//        t('shell.place.play.choose'), and it follows a locale switch; the
//        rung-1 register (P1b-leaf) carries the same name as a group
//        (review code review, fix round 1 P2-3).
//   P-HOLD. a 900 ms mouse hold on the carom fork's "marked" radio label
//        operates the setting and NEVER fires the shell's card long-press
//        (shell stays open at play); the CONTROL hold on the section's h2
//        still fires quick-play (shell closes) — proves the handler is live
//        (review code review, fix round 1 P2-2).
//   P-UPG. delayed-leaf upgrade keeps focus: `ui/cardrail.js` HELD at the
//        network past RAIL_LEAF_WAIT_MS ⇒ the rung-1 register mounts; focus
//        on a fallback card (snooker); the leaf released ⇒ the cardrail
//        register replaces the mount and focus is RE-SEATED on the same-id
//        cardrail card (highlight follows, aria-current + game + blob
//        unchanged, no confirm); an arrow key keeps walking
//        (review code review, fix round 1 P2-1).
//   P2p-sa. the P2p-fade carom phone boot under NOTCH emulation (CDP
//        Emulation.setSafeAreaInsetsOverride — the e2e-ui phone walker's
//        47/47/21 px iPhone landscape profile): `#ob-shell-decision` ∩ the
//        play section = ∅, the prompt inside the horizontal safe region and
//        above the quick-play stack, and the rule's own width BOUND (the
//        computed max-width from the computed right offset) clears the card
//        column — de + en; the routed prompt rule adds the right inset to
//        its offset and subtracts both insets from its width bound (review
//        code review r3 P2-1). CDP-only: no CSS seam can
//        override env(); an absent override FAILS loudly (touch-e2e.md §4.1).
//        667 sub-leg (review code review r4 P2-1): the same browser at 667×375
//        under the notch profile AND at zero insets, ALL SEVEN locales, with
//        the boot's break_spot copies and the locale's LONGEST decision option
//        swapped into the second button ⇒ every button inside the prompt box
//        (text inside the button), no horizontal overflow, the 844 lines, AND
//        (integrator shell pass, lane question 34 → GATE) the quick-play
//        stack YIELDS while the prompt is up: `#ob-shell` carries
//        `ob-shell-decision-up`, the stack is visibility:hidden +
//        pointer-events:none + opacity 0 and a hit test at the pill's centre
//        never reaches it (a two-row prompt is 202 px against a 179 / 158 px
//        band — the prompt ∩ stack numbers are still printed); then the
//        prompt is ANSWERED ⇒ prompt gone, class gone, the stack visible,
//        pointer-events auto, opacity 1 and hit-testable at its pill.
//        P2p-sa-W width table (lane question 32 + the coordinator's width
//        ruling): the centred prompt's left edge is W/2 − min(content, W/2,
//        560)/2 — a WIDTH condition; measured on the centred law across
//        904..1240 px at coarse AND fine pointers the last card overlap is
//        at 1144 px (both), so the routed placement query is pointer-
//        agnostic `(max-width: 1180px)`. Rows 926×428 coarse, 1024×768
//        coarse + fine (ROUTED) and 1280×800, 1440×900 fine (CENTRED), 7
//        locales × native + longest copy (both inset states on the coarse
//        rows) ⇒ the expected law in force (transform + anchor read from
//        the box), prompt ∩ card = ∅, ∩ the VISIBLE quick-play stack = ∅,
//        safe region, buttons inside, the routed bound clears the card.
//        The fine rows ride a second desktop-register browser
//        (CDP_PORT + 9).
//   P2p-fold. the FOLD-SNAP law (ui/foldsnap.js; GH-525 integrator, combined
//        review visual audit r1 finding 7): on 844×390 × 7 locales and
//        667×375 / 926×428 en, with the synthetic readiness card staged and
//        the rail panned to it, the body's clip edge cuts no text-line /
//        glyph atom at rest, ends on a boundary, keeps the first block
//        whole; every scrolled stop, the settle from an arbitrary offset and
//        the end state are clean at BOTH edges; with the leaf switched off
//        the budget layout cuts (the probe is not blind). Shared probe:
//        web/tools/foldsnap-probe.mjs (one law, one scan). Browser +10.
//   P-VN. deferred variant feedback in the shell (FR-008 shot > 0): eight_ball
//        boot (the family with a real non-alias explicit preset, `apa-8ball`;
//        nine_ball ships none), quick-play, one stroke, the shell re-opened,
//        `__play.pickVariant(<non-current explicit preset>)` ⇒ true,
//        `#ob-shell-note` = t('settings.variantNextRack'), shell open, NO
//        rerack (ball positions byte-equal), the row `aria-current`. Rows
//        are settings-owned (`__settings.variantRows`, 034a-mig T009); while
//        the seam is ABSENT the leg installs a SCRIPTED STAND-IN built from
//        the source settings.js itself reads (rulesCatalogJson presets of the
//        family whose default row aliases the game's ruleset id; `value` per
//        the settings.js:2612 law; `current` from variantFor) and says so on
//        its OK line (review code review r3 P2-2).
//   P-DRILLS-SEAM. the boot-time runner seam under the play arrival (GH-668
//        S5 play r3, the e2e-practice P-H regression round;
//        web/tools/e2e-play-seam.mjs): `window.__drills` is main.js's leaf
//        chain (drills.js → drills/catalog.js + ui/dialog.js), NOT the
//        practice place's, and lands 0.4-1.0 s after `__shell` on main and
//        this branch alike (the main thread yields once after ready); after
//        the healthy play mount + `go('practice')` the seam is published
//        within the plan §1.4 budget (2.5 s measured IN-PAGE from the
//        `__shell` publish to the `__drills` publish through a stamp
//        installed before the judged navigation — r3b, the P-H checker's
//        P2: the r3 clock zero was the arm's first CDP observation of the
//        open shell, displaced by the very sync stall it exists to catch;
//        #1120: judged on that window MINUS the render loop's frames — the
//        long-animation-frame attribution of main.js `frame`, the whole
//        callback (frame hooks included: the ruling's accepted blind spot);
//        UNJUDGEABLE, and red, without the entry type; a verdict a late
//        entry could flip waits until the attribution settles past the
//        window end, UNJUDGEABLE when it never does within 5 s (review r1
//        P2); the window, both shares and both stamps logged), and a second
//        document with
//        `app/drills/catalog.js` refused at the network keeps it ABSENT
//        (the detector's teeth). The +0 slot after its owners closed. r4
//        (review r3 F3): both judged documents carry `sw=0` and the target
//        bypasses the service worker (Network.setBypassServiceWorker) — a
//        registered worker answered leg (b)'s catalog leaf from Cache
//        Storage, so page-level Fetch never saw it (0 refusals, seam
//        published = a false red).
//   P-STALE-SHELL / P-NOTCH-FALLBACK. the mixed-cache pairing FRESH play.css
//        + a cached pre-B-K05 shell.js (GH-668 S5 play r4, review r3 F1 / F2;
//        web/tools/e2e-play-stale.mjs): the stale shell is DERIVED from the
//        current module (the five band-var publish lines of writeBands
//        stripped — never git history) and served at the network
//        (Fetch.fulfillRequest; sw=0 + the worker bypass). shell.css
//        declares the seam's :root default 0px, so a fallback inside var()
//        never engaged on that pairing (the cap read 100vh − 14, the content
//        ran under the quick-play band); play.css now gates the consumption
//        on the PUBLISH MARKER (the inline declaration only the observer
//        writes on :root) and restates the pre-seam caps as the base rule —
//        coarse vh − 212 − sa-top − sa-bottom (the safe-area-bottom term the
//        r1 fallback dropped), desktop vh − 130 − sa-top. Judged: the cap =
//        that law, the long-posed content's visible bottom ≤ the quick-play
//        / rail band top (844x390 coarse + 1024x768, en + de), the notch
//        profile 47/47/21 REBOOTED under the insets (cap 157; the panel's
//        bottom ≤ vh − inset), the fresh pairing unchanged (cap 232 / 638 =
//        vh − 14 − var). After P-RESERVE on the +0 / +4 slots.
//   P-STALE-KIT-STATES. the mixed-cache pairing FRESH play.js + play.css
//        over a DERIVED pre-part kit.css (GH-668 S5 play r5, review r4 F1 +
//        the round-5 census (a); web/tools/e2e-play-stale-kit.mjs): the
//        current kit.css minus the --row rules and the whole B-K12 block,
//        served at the network; play.js probes the part (the computed
//        --ob-card-option-reserve on a rail card) and marks the host
//        data-ob-part-fallback="card-option"; play.css paints the kit's
//        current face + the disabled 0.38 under that marker only. Judged:
//        staged (no part rule in the CSSOM, the marker present), the
//        aria-current pick distinct from its sibling and moving with
//        pickVariant, the committed card = the selected face under a live
//        playable browse, the locked picks at 0.38 (the P-RL staging); the
//        fresh pairing carries no marker. 844x390 + 1024x768; after
//        P-STALE-SHELL on the +0 / +4 slots.
//   P-BROWSE-SYNC. the KEEP LAW (GH-668 S5 play r5, review r4 F2 + the
//        census (b); e2e-play-browse.mjs armPBrowseSync): after ArrowRight →
//        End (the leaf's selection on a browsed PLAYABLE card, the readiness
//        card browsed) every sync path keeps the browsed card whole inside
//        the rail viewport with the scroll + the leaf's aria-selected
//        unchanged and Details bound to it — __play.refresh, a locale
//        repaint, ob:settings / ob:capability / ob:perftier, a shell exit
//        (quickPlay) + re-enter (openShell). After P-BROWSE on +0 / +4.
//   P-STALE-DICT. the MIXED-DICTIONARY pairing (GH-668 S5 play r6, review r5
//        F1 + the round-6 census (a); web/tools/e2e-play-stale-dict.mjs): a
//        fresh play.js over a DERIVED stale ACTIVE dictionary (the current
//        <loc>.json minus the five lane keys; en fresh) served at the
//        network — every lane-gated feature HIDDEN (the Details toggle with
//        no data-i18n label, its body, the fork hint; the fork on the
//        locale's legacy register), zero English lane copy in the play
//        place, zero missing-key warnings, at boot AND after a live repaint
//        (en → the stale locale); the fresh pairing shows the locale's own
//        label / Sections prefix / hint. 1024x768 × {ja, de, ko, fr, es,
//        zh-CN} + 844x390 ja; after P-FORK-LOCALE on the +0 / +4 slots.
//   P-FOCUS-BROWSE. the COMMON BROWSE-STATE CONTRACT (GH-668 S5 play r6,
//        review r5 F2 + the round-6 census (b); web/tools/
//        e2e-play-focus-browse.mjs): focus on ANY card in EITHER rail mode
//        routes through browseTo — FALLBACK-PENDING (cardrail.js HELD past
//        RAIL_LEAF_WAIT_MS, every rung-1 card tabbable): Tab / Tab /
//        Shift+Tab across playable cards, focus() + Tab onto the readiness
//        card, Shift+Tab back, End; LEAF: End → Shift+Tab (the roving stop),
//        ArrowRight → End → Shift+Tab (the browsed playable card), End →
//        ArrowLeft — focus, aria-selected / the marker and Details agree at
//        every step; blob unchanged. 1024x768 + 844x390; after P-STALE-DICT
//        on the +0 / +4 slots.
//   P-PRESS-COMMIT. the POINTER-PRESS GUARD (GH-668 S5 play r6b, the round-6
//        checker's P1 + ruling R1 + the round-6b census (c); web/tools/
//        e2e-play-press-commit.mjs): a pointer press never moves the rail
//        under the pointer — a REAL mouse press (1024 fine) / touch press
//        (844 coarse) held 400 ms on a whole, a trailing half-visible and a
//        leading half-visible playable leaf card: scrollLeft + the card rect
//        unchanged at 80 / 250 / 400 ms, focus on the card; the release
//        activates EXACTLY once (one confirm); the confirm declined by a
//        real pointer → the pressed card stays browsed (focus, aria-selected,
//        Details), the game unchanged, the card whole after the post-release
//        snap. After P-FOCUS-BROWSE on the +0 / +4 slots.
//        r6c leg (v) — the round-6b
//        checker's P2 + ruling R1 + census (e): the same holds with
//        ob:settings / ob:perftier / __play.refresh() fired at 150 / 250 /
//        350 ms into the hold — the rail still (renderRail's keep law keeps
//        the leaf's LIVE selection while a press holds a deferred browse).
//        r6d leg (vi) — the round-6c checker's P2 + ruling R1: the same on
//        the FALLBACK (rung-1 button) register under the P-FOCUS-BROWSE
//        pending-leaf hold — the 1024 mouse press held on the trailing /
//        leading half-visible button with ob:settings at 150 and
//        __play.refresh() at 250 ms: the rail still (the rung-1 branch's
//        keep-law reveal is skipped under a held press too), one confirm;
//        844 touch for the record.
//   P-SLOT-RESTORE. the KEEP LAW's SLOT-RESTORE clause (GH-668 S5 play r7,
//        review review r6 P2 on f819c812 + ruling R1 + the round-7 census (g);
//        web/tools/e2e-play-slot-restore.mjs): after ANY rail slot /
//        scrollport change — Quick Play → reopen Play (three cycles,
//        scrollLeft stable), the REAL reopen pill, a synthetic --sf-slot 0px
//        → restore, the leaf's arrival over the rung-1 register — the
//        COMMITTED card stands whole in the rail viewport when no browse is
//        live and the BROWSED card when one is (readiness + playable). 844 +
//        667 coarse (ten_ball; one_pocket at 844), 1024 fine (ten_ball).
//        (h) KF-017 (#1155), 1280 fine (one_pocket): an arrival after a hide
//        lands the committed card whole in its OWN task (the scripted
//        re-entry and the real reopen pill, judged in the task, at the first
//        frame and settled) and after a place switch away and back; with
//        no browse live, a re-present of play never moves a user's pan.
//        After P-PRESS-COMMIT on the +0 / +4 slots.
//
// Conventions per cdp.mjs suites: hermetic Chrome profiles, self-served
// web/, console error gates per arm. Needs Chrome + node ≥ 22.
// Run: node web/tools/run-gate.mjs --band <lane band> -- node web/tools/e2e-play.mjs
//   (CI's own band is a row of web/tools/ci-bands.json; a local claim inside the
//   CI reserved range is refused — GH-687)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, cdpReplyDetail,
} from './cdp.mjs';
import { launchPhone, setPhoneMetrics, setSafeAreaInsets } from './touch-cdp.mjs';
import { foldProbeJs, judgeRest, judgeEdges, judgeStop, stopFacts } from './foldsnap-probe.mjs';
// #928: P-HOLD judges each hold as the PAGE saw it (target + duration), the
// #878 page-timed press pattern (lib/page-press.mjs)
import { pagePress } from './lib/page-press.mjs';
import { armPKit } from './e2e-play-kit.mjs';
import { armPFork } from './e2e-play-fork.mjs';
import { armPReserve } from './e2e-play-reserve.mjs';
import { armPStaleShell } from './e2e-play-stale.mjs';
import { armPStaleKitStates } from './e2e-play-stale-kit.mjs';
import { armPCard } from './e2e-play-card.mjs';
import { armPDetailsInk } from './e2e-play-details-ink.mjs';
import { armPOnce } from './e2e-play-once.mjs';
import { armPOnceDegrade } from './e2e-play-once-degrade.mjs';
import { armPBrowse, armPBrowseSync } from './e2e-play-browse.mjs';
import { armPBrowseFallback } from './e2e-play-browse-fallback.mjs';
import { armPForkLocale } from './e2e-play-fork-locale.mjs';
import { armPStaleDict } from './e2e-play-stale-dict.mjs';
import { armPFocusBrowse } from './e2e-play-focus-browse.mjs';
import { armPPressCommit } from './e2e-play-press-commit.mjs';
import { armPDeclineResync } from './e2e-play-decline-resync.mjs';
import { armPSlotRestore } from './e2e-play-slot-restore.mjs';
import { armPHud } from './e2e-play-hud.mjs';
import { armPFade } from './e2e-play-fade.mjs';
import { armPReadyInk } from './e2e-play-readyink.mjs';
import { armPCite } from './e2e-play-cite.mjs';
import { armPDrillsSeam } from './e2e-play-seam.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// defaults sit BELOW the CI reserved range (8600/8615 — GH-687); run-gate --band
// pins them the same way
const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
// run-gate band sizing (GH-410 law): one static server + CDP endpoints
// CDP_PORT..+10 (the healthy desktop arm family, P1a, P1b, P2c, P2p phone,
// P-E1/P-E2, P-RL, P-UPG, P2p-sa-W's fine-register browser at +9, P2p-fold
// at +10 — one browser each, sequential)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
// --selftest-cdp-row (#1238's row plant) takes no value and opens no port; its name only reads as port-like
export const PORT_FLAGS = { '--selftest-cdp-row': 'none' };

// SHARED_DEFAULT_WINDOW (e2e-play) — the capture rides the suite's own ports (8600/8615) so a capture reproduces
// exactly what the suite drove; the two never run at the same time.
export const SHARED_DEFAULT_WINDOW = 'e2e-play';
let failCount = 0;
const fail = (msg) => {
  console.error('E2E-PLAY FAIL:', msg);
  process.exitCode = 1;
  failCount += 1;
};
// #1238 (KF-025): a CDP protocol-error reply that no arm catches (Chrome's own text, e.g. 'Promise was collected')
// ended the suite with a bare stack and no FAIL line, so the run could not say which request the reply answered.
// An uncaught-exception MONITOR names it in one FAIL row and leaves Node's own crash path unchanged: the stack is
// still printed and the exit code is the same. Not a retry; any other uncaught error prints nothing extra.
//   E2E-PLAY FAIL: CDP: <method> "<expression head>" (code <code>) -> <Chrome's text>
// The row is the request the reply answered (cdp.mjs's `cdp` reply detail) without its id and CDP port, and with
// every loopback host:port inside the expression head written as <host>:<port>: an arm's navigation head carries the
// band's HTTP port (e2e-play-card's location.assign(url(...))), and run-gate picks the band, so a raw head would split
// one failure into a row per band. The same failure prints the same row on every run and band, so it keys one
// CI-ledger row; the raw detail line follows it (not a row). --selftest-cdp-row checks that with a two-band plant.
const CDP_ROW_PORT_RE = /(?<![\w.-])(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}(?!\d)/g;
const cdpFailRow = (d, text) => `E2E-PLAY FAIL: CDP: ${d.method}`
  + `${d.head === null || d.head === undefined ? '' : ` ${JSON.stringify(String(d.head).replace(CDP_ROW_PORT_RE, '$1:<port>'))}`}`
  + `${d.code === null || d.code === undefined ? '' : ` (code ${d.code})`} -> ${text}`;
if (process.argv.includes('--selftest-cdp-row')) {
  // the plant: one failure (a stand-in for e2e-play-card's navigation head) under two port bands must print ONE row,
  // while the raw heads differ (so the plant is not vacuous). The row is formatted from each error's own e.cdp FIRST,
  // as the monitor does, and only then is the detail line read from that same object: a formatter that normalized
  // the head in place would pass the row checks and strip the raw port from the detail line (review r2 P2). The two
  // ports are never bound; they stay outside the CI reserved range and every declared lane band (ci-bands-lint).
  const head = (port) => `(location.assign("http://127.0.0.1:${port}/app.html?obtool=1&u=cardfull&obcite=full"), true)`;
  const reply = (port) => ({ method: 'Runtime.evaluate', head: head(port), id: 7, port: port + 15, code: -32000, data: null });
  const errs = [23150, 21150].map((p) => Object.defineProperty(new Error('Promise was collected'), 'cdp',
    { enumerable: false, value: reply(p) }));
  const rows = errs.map((e) => cdpFailRow(e.cdp, 'Promise was collected'));
  const checks = [
    ['one row for one failure across two bands', rows[0] === rows[1]],
    ['the row writes the port as <port>', rows[0].includes('127.0.0.1:<port>/app.html')],
    ['the plant is not vacuous: the raw heads differ', head(23150) !== head(21150)],
    ['after the row, the detail line from the same e.cdp keeps the raw head',
      (cdpReplyDetail(errs[0]) ?? '').includes('127.0.0.1:23150/app.html')
        && (cdpReplyDetail(errs[1]) ?? '').includes('127.0.0.1:21150/app.html')],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'FAIL'}: ${name}`);
  const bad = checks.filter(([, ok]) => !ok).length;
  console.log(`E2E-PLAY-SELFTEST cdp-row: ${bad ? 'FAILED' : 'PASS'} (${checks.length - bad}/${checks.length})`);
  process.exit(bad ? 1 : 0);
}
process.on('uncaughtExceptionMonitor', (e) => {
  const d = e?.cdp;
  if (!d) return;
  let text;
  try { text = String(e?.message ?? e).replace(/[\r\n]+/g, ' '); } catch { text = '<unprintable error>'; }
  console.error(cdpFailRow(d, text));
  console.error(`e2e-play: CDP reply detail: ${cdpReplyDetail(e)}`);
});
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
async function waitReady(c, tries = (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitShell(c, tries = 60 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('typeof window.__shell === "object" && window.__shell.isOpen()')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
/** the healthy mount: host class + the published test surface */
async function waitPlay(c, tries = 100 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`typeof window.__play === 'object'
        && !!document.querySelector('section[data-place="play"].ob-play-host')`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
async function settleTable(c, tries = 120 * SCALE) {
  for (let i = 0; i < tries; i++) {
    const st = await c.eval('__test.state()').catch(() => null);
    if (st === 'AIM' || st === 'BALL_IN_HAND') return st;
    await sleep(250);
  }
  return null;
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
  sink.length = 0;
};
// GH-558 per-arm verdict honesty: the OK line prints ONLY when the arm
// recorded no failure since its own snapshot
const armOk = async (c, errs, f0, msg) => {
  await gateErrors(c, errs, msg.split(' ')[0]);
  if (failCount === f0) console.log(msg);
  else console.log(`${msg.split(' ')[0]} RED (${failCount - f0} failure line(s) above)`);
};
// trusted keys (CDP Input domain — the real-user register)
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Home: 36, End: 35, Escape: 27, Enter: 13 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key, code: key,
      windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
  }
}
/** trusted Enter WITH its character (the keypress a focused <button>
 * activates on) — pressKey's bare keyDown never clicks */
async function pressEnter(c) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter',
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter',
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
}
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
// Wait until SEL's viewport rect has been STILL for `still` consecutive
// samples `step` ms apart (default 300 ms of rest), capped. A synthesized
// press must not land while the port is moving: after scrollIntoView the
// fold-snap leaf re-settles the scroller onto its nearest stop 200 ms after
// the scroll goes quiet (ui/foldsnap.js SCROLL_QUIET_MS) and a loaded box
// stretches both the smooth scroll and that timer past any fixed sleep
// (battery runs 4/5: P-HOLD(a) at load 115, P-MIX's tap at load ~100 —
// the release landed beside the label / card). Staging only: no assertion
// reads the result; a wedged port still fails downstream.
async function settleRect(c, sel, { still = 4, step = 100, cap = 2500 } = {}) {
  let last = null, n = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    const r = await c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null; const b = el.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map((v) => Math.round(v)).join(','); })()`).catch(() => null);
    if (r !== null && r === last) { if (++n >= still) return true; } else { n = 1; last = r; }
    await sleep(step);
  }
  return last !== null;
}
// the e2e-shell E(:957-966) blob probe: gameplay + persisted state that
// browsing must never change
const SNAP = `(() => JSON.stringify({
  state: __test.state(),
  phi: window.__aim?.getPhi?.() ?? null,
  power: document.getElementById('power')?.value ?? null,
  elev: document.getElementById('elev')?.value ?? null,
  cue: __test.balls().find((b) => b.id === 0)?.pos ?? null,
  settings: localStorage.getItem('ob-settings-v1'),
  shell: localStorage.getItem('ob-shell-v1'),
}))()`;
// the settings blob alone (persisted truth; FR-018 no-write law)
const BLOBS = `JSON.stringify({ s: localStorage.getItem('ob-settings-v1'),
  h: localStorage.getItem('ob-shell-v1') })`;
/** CDP Fetch block-URL idiom (e2e-shell A2b :334): fail every request whose
 * URL matches `re`; returns the enable promise. */
async function blockUrl(c, re, pattern) {
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (re.test(params.request.url)) {
      // fire-and-forget: a paused request the page has already abandoned
      // (navigation / close) answers "Invalid InterceptionId" — never let
      // that rejection escape the event handler (it killed a whole run twice
      // on a loaded host; GH-668 S5 slice 3 G1)
      c.send('Fetch.failRequest', { requestId: params.requestId,
        errorReason: 'ConnectionRefused' }).catch(() => {});
    } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  // Network.enable MUST precede setCacheDisabled (the P-UPG hole, :1670):
  // without the renderer-side Network agent the cache flag never reaches
  // Blink, and the second document reuses the first boot's leaf from the
  // renderer MemoryCache — no request exists for Fetch to pause, so the
  // "blocked" module / leaf / stylesheet loads and the arm reads a mounted
  // play (P2c red 1/2, checker r2 2026-09-10; landing prep P2c cure). The
  // service-worker bypass is the same belt P-UPG wears (a real-user boot
  // registers sw.js; Cache Storage hits never reach page-level Fetch).
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}
// scripted boots (`obshell=1` rides obtool); a DEFAULT scripted boot never
// constructs the shell (shell.md §4 / e2e-shell B), so the real-user arms
// (P-E1, P-E2, P-RL — returning/table boots) use realUrl (NO obtool stamp,
// the e2e-shell E idiom)
const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&${q}`;
const realUrl = (q) => `http://127.0.0.1:${PORT}/app.html?${q}`;
// the notch profile of the e2e-ui phone walker (e2e-ui.mjs PHONE_SA; iPhone
// landscape: 47 px each side, 21 px home indicator, no top inset)
const PHONE_SA = { top: 0, left: 47, right: 47, bottom: 21 };
// every shipped locale (web/app/locales) — the 667 / 926 legs walk all seven
const LOCALES_ALL = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
// the shell's answerable decision kinds — mirrored BY HAND from shell.js
// SHELL_DECISION_CHOICES (the hud.js DECISION_CHOICES mirrored-literal law);
// P2p-sa 667 measures the widest `decision.opt.<kind>.<n>` copy per locale
const SHELL_DECISION_KINDS = ['dry_break', 'eight_legal_break', 'eight_foul_break', 'break_foul',
  'stalemate', 'break_pocket', 'stalemate_lag', 'break_spot', 'play_again', 'respotted_black_toss',
  'break_violation', 'pushout_response', 'wrongful_pot', 'foul_and_a_miss', 'illegal_break',
  'heyball_break_foul', 'eight_break_pot', 'eight_break_foul', 'break_miscue'];
// safe-area geometry probe: the in-force env() insets read back through a
// fixed probe's padding (the only way CSS exposes them), the in-shell prompt,
// the play section (the card column's visible box) and the quick-play stack
const SA_PROBE = `(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) '
    + 'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const sa = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight),
    bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
  probe.remove();
  const rd = (v) => Math.round(v * 10) / 10;
  const rect = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect();
    return { l: rd(r.left), r: rd(r.right), t: rd(r.top), b: rd(r.bottom), w: Math.round(r.width) }; };
  const p = document.getElementById('ob-shell-decision');
  const prompt = rect(p);
  const card = rect(document.querySelector('section[data-place="play"]'));
  const qpEl = document.getElementById('ob-shell-quickplay-wrap');
  const qp = rect(qpEl);
  const ovl = (a, b) => a && b
    ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
    : null;
  const overlap = ovl(prompt, card);
  // the quick-play stack's state (integrator shell pass, lane question 34):
  // computed visibility / pointer-events / opacity, the stack's box, its
  // overlap with the prompt, and a HIT TEST at the pill's centre (what a
  // finger there would reach — the yield's operable truth, not its style)
  const qcs = qpEl ? getComputedStyle(qpEl) : null;
  const pill = document.getElementById('ob-shell-quickplay');
  const pr = pill && pill.getClientRects().length ? pill.getBoundingClientRect() : null;
  const hitEl = pr ? document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2) : null;
  const qpState = qpEl ? { vis: qcs.visibility, pe: qcs.pointerEvents, op: parseFloat(qcs.opacity),
    hit: hitEl ? (qpEl.contains(hitEl) ? 'quickplay' : (hitEl.id || hitEl.className || hitEl.tagName)) : null,
    overlap: overlap === null ? null : Math.round(ovl(prompt, qp) ?? 0) } : null;
  const shellCls = document.getElementById('ob-shell')?.className ?? null;
  // the rule's own numbers: Chrome resolves min()/calc()/env() to px here
  const pcs = p ? getComputedStyle(p) : null;
  // the answer buttons against the prompt box (review code review r4 P2-1):
  // every button inside the box with its own text inside the button, the
  // box itself not scrolling horizontally
  const btns = p ? [...p.querySelectorAll('.osd-btns button')] : [];
  const btnIn = prompt ? btns.every((b) => { const q = b.getBoundingClientRect();
    return q.left >= prompt.l - 0.5 && q.right <= prompt.r + 0.5 && q.top >= prompt.t - 0.5
      && q.bottom <= prompt.b + 0.5 && b.scrollWidth <= b.clientWidth + 1; }) : null;
  return { vw: innerWidth, vh: innerHeight, sa, prompt, card, qpTop: qp?.t ?? null, qp: qpState, shellCls,
    overlap: overlap === null ? null : Math.round(overlap), locale: window.__i18n.locale(),
    bound: pcs ? parseFloat(pcs.maxWidth) : null, rightOff: pcs ? parseFloat(pcs.right) : null,
    transform: pcs ? pcs.transform : null,
    btnIn, btnRows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size,
    hOverflow: p ? p.scrollWidth > p.clientWidth : null,
    btnW: btns.map((b) => Math.round(b.getBoundingClientRect().width)),
    // GH-699 / GH-702: the shortest answer button (the 44 pt pointer law)
    // and the card column's top (the 14px + env(top) datum the routed
    // prompt's 12px + env(top) top must sit 2px above)
    btnH: btns.length ? Math.min(...btns.map((b) => rd(b.getBoundingClientRect().height))) : null,
    cardsT: rect(document.getElementById('ob-shell-cards'))?.t ?? null };
})()`;

// ---- healthy desktop family: P2 → P-A2 → P1b → P5 → P-F3 → P4 → P3 -------
{
  const errs = [];
  const c = await launchChrome(url('obshell=1&seed=1'), { port: CDP_PORT, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('P2: obshell boot never became ready');
  else if (!(await waitShell(c))) fail('P2: obshell boot never opened the shell');
  else if (!(await waitPlay(c))) {
    fail('P2: play never mounted (host class + __play): ' + JSON.stringify(await c.eval(
      `({ cls: document.querySelector('section[data-place="play"]')?.className,
        play: typeof window.__play, css: !!document.getElementById('ob-play-css')?.sheet })`)));
  } else {
    // ---- P2 host class + stub retired + summary + registry shape ----------
    {
      const f0 = failCount;
      const s = await c.eval(`(() => {
        const sec = document.querySelector('#ob-shell-cards > section[data-place="play"]');
        const cs = (n) => getComputedStyle(n).display;
        const stubLines = [...sec.querySelectorAll(':scope > p.ob-shell-line')];
        const actions = sec.querySelector(':scope > .ob-shell-actions');
        const sum = sec.querySelector('[data-ob="play-summary"]');
        const reg = window.__play.registry();
        return {
          host: sec.classList.contains('ob-play-host'),
          h2: sec.querySelector('h2').getClientRects().length > 0,
          stubLines: stubLines.length,
          stubHidden: stubLines.every((p) => cs(p) === 'none') && cs(actions) === 'none',
          stubRules: stubLines[1]?.querySelector('span')?.textContent ?? null,
          sumLines: [...sum.querySelectorAll('p')].map((p) => p.textContent),
          sumRules: sum.querySelectorAll('p')[1]?.querySelector('span')?.textContent ?? null,
          vdefault: window.__i18n.t('settings.variantDefault'),
          g9: window.__i18n.t('game.nine_ball'),
          game: window.__settings.get().game,
          vf: window.__settings.variantFor('nine_ball'),
          bodyVis: sec.querySelector('[data-ob="play-body"]').getClientRects().length > 0,
          regKeys: Object.keys(reg).sort().join(),
          games: reg.games.length, current: reg.games.filter((g) => g.current).map((g) => g.id).join(),
          variants: Array.isArray(reg.variants), mode: reg.mode, carom2b: reg.carom2b, locked: reg.locked,
          mark: performance.getEntriesByName('ob:play-mounted').length,
          members: ['registry', 'pick', 'pickVariant', 'back', 'refresh', 'previewCatalog']
            .filter((k) => typeof window.__play[k] !== 'function').join(),
          h3s: [...sec.querySelectorAll('h3')].map((h) => h.dataset.i18n).join(),
        };
      })()`);
      if (!s.host || !s.h2 || s.stubLines !== 2 || !s.stubHidden || !s.bodyVis) {
        fail('P2: host class / stub retirement / body paint broke: ' + JSON.stringify(s));
      }
      if (s.game !== 'nine_ball' || s.vf !== null) {
        fail('P2: expected a fresh unpinned nine_ball boot: ' + JSON.stringify({ game: s.game, vf: s.vf }));
      }
      // FR-004: the rules line is PRESENT and equals the default label on the
      // S1 stub line (rendered by the shell branch at boot) AND the play summary
      if (s.stubRules !== s.vdefault || s.sumRules !== s.vdefault
        || !s.sumLines[0].includes(s.g9) || s.sumLines.some((l) => !l.trim())) {
        fail('P2: FR-004 rules line / summary text wrong: ' + JSON.stringify(s));
      }
      if (s.regKeys !== 'carom2b,games,locked,mode,variants' || s.games < 1
        || s.current !== 'nine_ball' || !s.variants || s.mode !== 'play'
        || s.carom2b !== false || s.locked !== false || s.members !== '') {
        fail('P2: __play.registry() shape / members wrong: ' + JSON.stringify(s));
      }
      if (s.mark !== 1) fail('P2: ob:play-mounted mark count ' + s.mark);
      await armOk(c, errs, f0, 'P2 OK: host class present, stub retired, FR-004 summary, __play surface');
    }
    // ---- P-A11Y discipline listbox accessible name (review code review fix round 1 P2-3)
    {
      const f0 = failCount;
      const NAME = `(() => {
        const sec = document.querySelector('section[data-place="play"]');
        const rail = sec.querySelector('[data-ob="play-games"]');
        const ids = (rail.getAttribute('aria-labelledby') ?? '').split(/\\s+/).filter(Boolean);
        const els = ids.map((id) => document.getElementById(id));
        return { role: rail.getAttribute('role'), ids, inSection: els.every((n) => !!n && sec.contains(n)),
          name: els.map((n) => n?.textContent?.trim() ?? '').join(' '),
          expected: window.__i18n.t('shell.place.play.choose'), locale: window.__i18n.locale() };
      })()`;
      const en = await c.eval(NAME);
      if (en.role !== 'listbox' || en.ids.length !== 1 || !en.inSection || !en.name || en.name !== en.expected) {
        fail('P-A11Y: the discipline listbox must be NAMED by the DISCIPLINE heading (aria-labelledby, in-section, text = t(shell.place.play.choose)): '
          + JSON.stringify(en));
      }
      await c.eval(`window.__i18n.setLocale('de')`);
      await sleep(250);
      const de = await c.eval(NAME);
      await c.eval(`window.__i18n.setLocale('en')`);
      await sleep(250);
      if (de.locale !== 'de' || !de.name || de.name !== de.expected || de.name === en.name) {
        fail('P-A11Y: the listbox name must follow the locale (the heading is data-i18n): ' + JSON.stringify({ en, de }));
      }
      await armOk(c, errs, f0, 'P-A11Y OK: discipline listbox named by the DISCIPLINE heading; the name follows the locale');
    }
    // ---- P-A2 conditions slot ------------------------------------------------
    {
      const f0 = failCount;
      const a = await c.eval(`(() => { const n = document.querySelector(
        'section[data-place="play"] [data-ob="play-conditions"]');
        return { exists: !!n, hidden: n?.hidden, h: n?.getBoundingClientRect().height,
          kids: n?.childElementCount }; })()`);
      if (!a.exists || a.hidden !== true || a.h !== 0 || a.kids !== 0) {
        fail('P-A2: conditions slot must exist, be hidden, zero height, empty: ' + JSON.stringify(a));
      }
      await armOk(c, errs, f0, 'P-A2 OK: conditions slot reserved (hidden, zero pixels)');
    }
    // ---- P1b readiness fixture (scripted-only seam) ---------------------------
    {
      const f0 = failCount;
      const b0 = await c.eval(BLOBS);
      const n0 = await c.eval(`document.querySelectorAll('[data-ob="play-game"]').length`);
      const r = await c.eval(`(() => {
        const ok = window.__play.previewCatalog([{ id: 'fixture_game', display_name: 'Fixture Game',
          readiness: 'config_ready', prerequisites: [{ id: 'fixture-rules', kind: 'ruleset' }],
          provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
        const cards = [...document.querySelectorAll('[data-ob="play-game"]')];
        const b = cards.find((x) => x.dataset.game === 'fixture_game') ?? null;
        const playableIdx = cards.map((x, i) => (x.dataset.playable === 'true' ? i : -1)).filter((i) => i >= 0);
        b?.focus();
        return { ok, n: cards.length, has: !!b, idx: cards.indexOf(b), lastPlayable: Math.max(...playableIdx),
          playable: b?.dataset.playable, dis: b?.getAttribute('aria-disabled'),
          label: b?.querySelector('.ob-play-card__name')?.textContent,
          badge: b?.querySelector('.ob-cardrail-chip')?.textContent,
          badgeExp: window.__i18n.t('settings.gameBadge.config_ready'),
          focused: document.activeElement === b };
      })()`);
      if (r.ok !== true || !r.has || r.n !== n0 + 1 || r.idx <= r.lastPlayable
        || r.playable !== 'false' || r.dis !== 'true' || r.label !== 'Fixture Game'
        || r.badge !== r.badgeExp || !r.focused) {
        fail('P1b: fixture readiness card wrong: ' + JSON.stringify(r));
      }
      // click + pick ⇒ changeGame never called (blob unchanged), no confirm
      await clickEl(c, '[data-ob="play-game"][data-game="fixture_game"]');
      await sleep(300);
      const pk = await c.eval(`window.__play.pick('fixture_game')`);
      const after = await c.eval(`({ confirm: !!document.querySelector('[data-ob="confirm"]'),
        game: __settings.get().game })`);
      if (pk !== false || after.confirm || after.game !== 'nine_ball' || await c.eval(BLOBS) !== b0) {
        fail('P1b: a fixture card must never reach changeGame: ' + JSON.stringify({ pk, after }));
      }
      const bad = await c.eval(`window.__play.previewCatalog([{ id: 'nameless_game', readiness: 'config_ready' }])`);
      const nBad = await c.eval(`document.querySelectorAll('[data-ob="play-game"]').length`);
      if (bad !== false || nBad !== n0 + 1) {
        fail('P1b: a fixture entry without a locale key AND display_name must be rejected: '
          + JSON.stringify({ bad, nBad }));
      }
      const restored = await c.eval(`(window.__play.previewCatalog(null),
        document.querySelectorAll('[data-ob="play-game"]').length)`);
      if (restored !== n0) fail('P1b: previewCatalog(null) must restore the live catalog');
      await armOk(c, errs, f0, 'P1b OK: readiness fixture renders after the playable set, browse-only, restores');
    }
    // ---- P5 rail keyboard isolation (FR-018) --------------------------------
    {
      const f0 = failCount;
      await c.eval(`document.querySelector('[data-ob="play-game"][data-game="nine_ball"]').focus()`);
      const b0 = await c.eval(SNAP);
      await pressKey(c, 'ArrowRight');
      await sleep(200);
      const br = await c.eval(`({
        sel: document.querySelector('[data-ob="play-games"] [aria-selected="true"]')?.dataset.game ?? null,
        cur: document.querySelector('[data-ob="play-games"] [aria-current="true"]')?.dataset.game ?? null,
        focus: document.activeElement?.dataset?.game ?? null,
        confirm: !!document.querySelector('[data-ob="confirm"]'),
        open: __shell.isOpen(), place: __shell.place() })`);
      if (br.sel !== 'eight_ball' || br.cur !== 'nine_ball' || br.focus !== 'eight_ball'
        || br.confirm || !br.open || br.place !== 'play') {
        fail('P5: ArrowRight must BROWSE (selection follows focus, current unchanged, no confirm): '
          + JSON.stringify(br));
      }
      // every exempted key on a rail card ⇒ gameplay blob byte-unchanged
      for (const k of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'ArrowLeft']) {
        await pressKey(c, k);
        await sleep(80);
        const inRail = await c.eval(`!!document.activeElement?.closest?.('[data-ob="play-games"]')`);
        if (!inRail) fail(`P5: ${k} moved focus out of the rail`);
      }
      await sleep(200);
      const b1 = await c.eval(SNAP);
      if (b0 !== b1) fail('P5: a rail key changed gameplay/persisted state: ' + b0 + ' -> ' + b1);
      if (await c.eval(`!!document.querySelector('[data-ob="confirm"]')`)) {
        fail('P5: a rail arrow key raised a confirm (browse must never commit)');
      }
      // trusted Escape at the rail root is SWALLOWED by the gate (review r2 P1-2)
      await c.eval(`document.querySelector('[data-ob="play-game"][data-game="nine_ball"]').focus()`);
      await pressKey(c, 'Escape');
      await sleep(300);
      const esc = await c.eval(`({ open: __shell.isOpen(), place: __shell.place() })`);
      if (!esc.open || esc.place !== 'play' || await c.eval(SNAP) !== b0) {
        fail('P5: trusted Escape at the rail root must be swallowed (shell stays, blob unchanged): '
          + JSON.stringify(esc));
      }
      // variant-list leg (034a-mig T024b (4) — MANDATORY: the T009 seam is on
      // the tree by construction, so an absent `variantRows` is a defect, never
      // a skip; review round 4 P1-3). nine_ball is a single-preset family
      // (variantRows ⇒ [] ⇒ the list hides — contract §7), so the leg stages
      // eight_ball (two rows: the WPA alias default + apa-8ball) through the
      // skipConfirm API on the pristine rack and restores nine_ball after.
      const hasRows = await c.eval(`typeof window.__settings.variantRows === 'function'`);
      if (!hasRows) {
        fail('P5.variants: __settings.variantRows is absent (034a-mig T009 must be on the tree)');
      } else {
        const staged = await c.eval(`__settings.changeGame('eight_ball', { skipConfirm: true })`);
        if (staged !== true) fail('P5.variants: eight_ball staging refused: ' + JSON.stringify(staged));
        let vs = null;
        for (let i = 0; i < 40 * SCALE; i++) {
          vs = await c.eval(`(() => { const rows = [...document.querySelectorAll(
            '[data-ob="play-variants"] [data-variant-pick]')];
            return { n: rows.length, hidden: document.querySelector('[data-ob="play-variants"]').hidden,
              api: (__settings.variantRows('eight_ball') ?? []).length }; })()`);
          if (vs.n >= 2 && !vs.hidden) break;
          await sleep(150);
        }
        await c.eval(`document.querySelector('[data-ob="play-variants"] [data-variant-pick]')?.focus(); true`);
        if (vs.n < 2 || vs.hidden || vs.api !== vs.n) fail('P5.variants: the variant list must render the eight_ball rows: ' + JSON.stringify(vs));
        const vb0 = await c.eval(SNAP);
        const seq = [];
        for (const k of ['ArrowDown', 'ArrowUp', 'End', 'Home', 'ArrowRight', 'ArrowLeft']) {
          await pressKey(c, k);
          seq.push(await c.eval(`document.activeElement?.dataset?.variantPick ?? null`));
        }
        if (seq.some((x) => x === null) || (vs.n > 1 && seq[0] === seq[1])) {
          fail('P5.variants: the six keys must rove within the list: ' + JSON.stringify(seq));
        }
        if (await c.eval(SNAP) !== vb0) fail('P5.variants: a list key changed gameplay/persisted state');
        const back = await c.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
        if (back !== true) fail('P5.variants: nine_ball restore refused: ' + JSON.stringify(back));
        await sleep(400);
      }
      await armOk(c, errs, f0, 'P5 OK: rail keys browse in-container, blob byte-unchanged, Escape swallowed; variant list roves (eight_ball rows)');
    }
    // ---- P-F3 confirm layering (GH-534 F3 mirror) ----------------------------
    {
      const f0 = failCount;
      const b0 = await c.eval(SNAP);
      await c.eval(`window.__pfPick = window.__play.pick('ten_ball'); true`);
      let up = false;
      for (let i = 0; i < 40 * SCALE && !up; i++) {
        up = await c.eval(`!!document.querySelector('[data-ob="confirm"]')`);
        if (!up) await sleep(150);
      }
      if (!up) fail('P-F3: __play.pick must raise the kit confirm (no skipConfirm)');
      else {
        await pressKey(c, 'Escape');
        await sleep(700);
        const a = await c.eval(`(async () => ({ r: await window.__pfPick,
          confirm: !!document.querySelector('[data-ob="confirm"]'), open: __shell.isOpen(),
          game: __settings.get().game,
          cur: document.querySelector('[data-ob="play-games"] [aria-current="true"]')?.dataset.game }))()`);
        if (a.r !== false || a.confirm || !a.open || a.game !== 'nine_ball' || a.cur !== 'nine_ball'
          || await c.eval(SNAP) !== b0) {
          fail('P-F3: trusted Escape must decline the confirm over the shell, gameplay-inert: '
            + JSON.stringify(a));
        }
      }
      await armOk(c, errs, f0, 'P-F3 OK: pick raises the kit confirm; trusted Escape declines; shell stays');
    }
    // ---- P4 back-to-play visibility ------------------------------------------
    {
      const f0 = failCount;
      const p1 = await c.eval(`(() => { const ok = __settings.changeMode('playground');
        const b = document.querySelector('[data-ob="play-back"]');
        return { ok, hidden: b.hidden, h: b.getBoundingClientRect().height,
          mode: __play.registry().mode }; })()`);
      if (!p1.ok || p1.hidden || p1.h < 44 || p1.mode !== 'playground') {
        fail('P4: back-to-play must show (>= 44 pt) after an API changeMode(playground): ' + JSON.stringify(p1));
      }
      const p2 = await c.eval(`(() => { const ok = __play.back(); return { ok,
        mode: __settings.get().mode, open: __shell.isOpen(),
        hidden: document.querySelector('[data-ob="play-back"]').hidden }; })()`);
      const st = await settleTable(c);
      if (!p2.ok || p2.mode !== 'play' || p2.open || !p2.hidden || !st) {
        fail('P4: back() from playground must re-rack and exit to the table: ' + JSON.stringify({ ...p2, st }));
      }
      await c.eval('__shell.openShell({}), true');
      await sleep(400);
      const p3 = await c.eval(`(() => { __settings.changeMode('practice');
        const vis = !document.querySelector('[data-ob="play-back"]').hidden;
        const ok = __play.back(); return { vis, ok, mode: __settings.get().mode,
          open: __shell.isOpen(), hidden: document.querySelector('[data-ob="play-back"]').hidden }; })()`);
      if (!p3.vis || !p3.ok || p3.mode !== 'play' || !p3.open || !p3.hidden) {
        fail('P4: back() from practice must keep the shell open: ' + JSON.stringify(p3));
      }
      // keyboard focus stop on the non-exiting path (review code review r4
      // P2-2): Back FOCUSED, a trusted Enter — changeMode('play') hides the
      // button synchronously (sync() on the ob:settings broadcast) while the
      // shell stays open; focus must rest on a VISIBLE play control (the
      // rail's roving stop = the current discipline card), never on <body>
      // or on the now-hidden button
      const p4 = await c.eval(`(() => { const ok = __settings.changeMode('practice');
        const b = document.querySelector('[data-ob="play-back"]'); b.focus();
        return { ok, focused: document.activeElement === b, hidden: b.hidden }; })()`);
      if (!p4.ok || !p4.focused || p4.hidden) {
        fail('P4: staging — Back must be visible and take focus from practice: ' + JSON.stringify(p4));
      } else {
        await pressEnter(c);
        await sleep(300);
        const p5 = await c.eval(`(() => { const ae = document.activeElement;
          const sec = document.querySelector('section[data-place="play"]');
          return { mode: __settings.get().mode, open: __shell.isOpen(),
            hidden: document.querySelector('[data-ob="play-back"]').hidden,
            ae: ae === document.body ? 'body' : (ae.dataset.ob ?? ae.id ?? ae.tagName) + (ae.dataset.game ? ':' + ae.dataset.game : ''),
            inPlay: ae !== document.body && sec.contains(ae), visible: ae.getClientRects().length > 0,
            current: ae.getAttribute('aria-current'), stop: ae.tabIndex === 0 }; })()`);
        if (p5.mode !== 'play' || !p5.open || !p5.hidden) {
          fail('P4: staging — Enter on the focused Back must commit play with the shell open: ' + JSON.stringify(p5));
        } else if (!p5.inPlay || !p5.visible) {
          fail("P4: after Enter on Back (practice → play, shell open) focus must rest on a VISIBLE play control — the rail's roving stop — not on <body> or the hidden button: " + JSON.stringify(p5));
        }
      }
      await armOk(c, errs, f0, 'P4 OK: back-to-play follows the mode commits; playground exits, practice stays; Enter on the focused Back keeps a focus stop (the rail\'s roving card)');
    }
    // ---- P-MIX mixed-version cache (review code review r4 P2-3; contract §7
    // degrade row): a fresh play.js over a stale settings.js WITHOUT
    // changeGame — the read surface is stubbed without that member and play
    // re-synced: browsing stays (cards focusable, never native disabled) but
    // every playable card reads aria-disabled="true"; pick() is false AND
    // answers with the shim's reload hint (shell.place.play.shim.stale via
    // #ob-shell-note); a tap on a card raises no confirm; restoring the seam
    // re-enables the cards in place.
    {
      const f0 = failCount;
      const r = await c.eval(`(async () => {
        const real = window.__settings;
        if (typeof real?.changeGame !== 'function') return { staging: 'no changeGame on the real seam' };
        const stub = {}; for (const k of Object.keys(real)) if (k !== 'changeGame') stub[k] = real[k];
        window.__obRealSettings = real; window.__settings = stub; __play.refresh();
        const cards = [...document.querySelectorAll('[data-ob="play-game"][data-playable="true"]')];
        const cur = __play.registry().games.find((g) => g.current)?.id ?? null;
        const target = cards.map((b) => b.dataset.game).find((g) => g !== cur) ?? null;
        const disabled = cards.map((b) => b.getAttribute('aria-disabled'));
        const focusable = cards.every((b) => !b.disabled && b.tabIndex >= -1);
        document.getElementById('ob-shell-note')?.remove();
        const ok = await __play.pick(target);
        const note = document.getElementById('ob-shell-note')?.textContent ?? null;
        return { cur, target, n: cards.length, disabled, focusable, ok, note,
          expected: window.__i18n.t('shell.place.play.shim.stale'),
          confirm: !!document.querySelector('[data-ob="confirm"]'), game: real.get().game, open: __shell.isOpen() };
      })()`);
      if (r.staging) fail('P-MIX: staging — ' + r.staging);
      else {
        if (r.n < 2 || !r.target || !r.disabled.every((d) => d === 'true') || !r.focusable) {
          fail('P-MIX: with changeGame absent every playable card must read aria-disabled="true" and stay focusable (browsing kept): ' + JSON.stringify(r));
        }
        if (r.ok !== false || r.note !== r.expected || r.confirm || r.game !== r.cur || !r.open) {
          fail('P-MIX: pick() under the stale seam must return false, raise NO confirm and answer with the shim hint in #ob-shell-note: ' + JSON.stringify(r));
        }
        // a real tap on the card (the cardrail leaf swallows a disabled activation) answers too
        await c.eval(`(() => { document.getElementById('ob-shell-note')?.remove();
          document.querySelector('[data-ob="play-game"][data-game="${r.target}"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); return true; })()`);
        await sleep(200);
        await settleRect(c, `[data-ob="play-game"][data-game="${r.target}"]`); // the re-snap window (battery run 5)
        const clicked = await clickEl(c, `[data-ob="play-game"][data-game="${r.target}"]`);
        await sleep(300);
        const r2 = await c.eval(`(() => ({ note: document.getElementById('ob-shell-note')?.textContent ?? null,
          confirm: !!document.querySelector('[data-ob="confirm"]'), game: window.__settings.get().game, open: __shell.isOpen() }))()`);
        if (!clicked || r2.note !== r.expected || r2.confirm || r2.game !== r.cur || !r2.open) {
          fail('P-MIX: a tap on a playable card under the stale seam must answer with the shim hint and raise no confirm: ' + JSON.stringify({ clicked, ...r2 }));
        }
        const r3 = await c.eval(`(() => { window.__settings = window.__obRealSettings; delete window.__obRealSettings; __play.refresh();
          document.getElementById('ob-shell-note')?.remove();
          return [...document.querySelectorAll('[data-ob="play-game"][data-playable="true"]')].map((b) => b.getAttribute('aria-disabled')); })()`);
        if (!r3.length || !r3.every((d) => d === 'false')) fail('P-MIX: restoring the seam must re-enable the playable cards in place: ' + JSON.stringify(r3));
      }
      await armOk(c, errs, f0, 'P-MIX OK: stale settings.js without changeGame — playable cards aria-disabled, pick() false + shim hint, tap raises no confirm, restore re-enables');
    }
    // ---- P3 localized card text ×7 (nine_ball unpinned, snooker, carom) ------
    {
      const f0 = failCount;
      const locales = await c.eval('window.__i18n.locales()');
      if (!Array.isArray(locales) || locales.length !== 7) fail('P3: expected 7 locales, got ' + JSON.stringify(locales));
      const boots = [['nine_ball', true], ['snooker', false], ['carom_3cushion', false]];
      for (const [gid, unpinned] of boots) {
        if (gid !== 'nine_ball') {
          await c.eval(`(() => { localStorage.setItem('ob-settings-v1', JSON.stringify({ game: '${gid}' }));
            location.reload(); return true; })()`);
          await sleep(1200);
          if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) {
            fail(`P3: ${gid} boot never mounted play`);
            continue;
          }
        }
        for (const loc of locales) {
          await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
          await sleep(250);
          const r = await c.eval(`(() => {
            const sec = document.querySelector('section[data-place="play"]');
            const sum = sec.querySelector('[data-ob="play-summary"]').textContent;
            const rules = sec.querySelectorAll('[data-ob="play-summary"] p')[1].querySelector('span').textContent;
            const cur = sec.querySelector('[data-ob="play-games"] [aria-current="true"]');
            return { loc: window.__i18n.locale(), sum, rules,
              name: window.__i18n.t('game.${gid}'), vdefault: window.__i18n.t('settings.variantDefault'),
              cardName: cur?.querySelector('.ob-play-card__name')?.textContent ?? null,
              h3: [...sec.querySelectorAll('h3')].map((h) => h.textContent).join('|'),
              raw: /wpbsa-|umb-|wpa-|apa-/.test(sum + (cur?.textContent ?? '')) };
          })()`);
          if (r.loc !== loc || !r.sum.includes(r.name) || r.raw || r.cardName !== r.name
            || (unpinned && r.rules !== r.vdefault) || !r.rules.trim() || /\|\s*\|/.test(r.h3)) {
            fail(`P3: ${gid} @ ${loc}: card text not localized / raw id leaked: ` + JSON.stringify(r));
          }
        }
        await c.eval(`window.__i18n.setLocale('en')`);
      }
      await armOk(c, errs, f0, 'P3 OK: play card text localized ×7 (nine_ball default line, snooker, carom)');
    }
    // ---- P-HOLD carom fork vs the shell's card long-press (review code review fix round 1 P2-2)
    // shell.js FR-007(2): a pointerdown inside the section that is not on a
    // <button> arms a 550 ms hold that fires the card's primary (quick-play
    // ⇒ exitToTable). The fork's radios/labels are not buttons — play ends
    // the pointerdown's bubble at the radiogroup. Staging: the P3 carom boot
    // (pristine rack ⇒ the commit gate passes), locale en.
    {
      const f0 = failCount;
      const staged = await c.eval(`(() => { const k = document.querySelector('[data-ob="play-carom2b"]');
        return __settings.get().game === 'carom_3cushion' && !!k && !k.hidden && __shell.isOpen(); })()`);
      if (!staged) fail('P-HOLD: staging expects the P3 carom boot with the fork visible and the shell open');
      else {
        // #928: 19 reds in 399 runs, always (a) {checked: false, c2b unchanged,
        // shell open} — the held press never operated the radio: the release
        // landed beside the label (the port re-settled under the resting
        // pointer; the settleRect note above, battery runs 4/5). Each hold is
        // now judged as the PAGE saw it: both the pointerdown and the
        // pointerup must land inside the target and the page must time the
        // press past shell.js's HOLD_MS — else it is pressed again (up to 3,
        // the shell re-opened at play if a stray press fired quick-play) and a
        // run-out is named UNJUDGEABLE, never read as a product red.
        const P_HOLD_MS = 550; // app/shell.js HOLD_MS (the mirrored-literal law)
        const pressOn = async (sel) => {
          await c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
            if (el) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); return !!el; })()`);
          // the fold-snap leaf re-settles the scroller onto its nearest stop
          // 200 ms after a scroll goes quiet (ui/foldsnap.js SCROLL_QUIET_MS)
          // — press only once the port is at rest (GH-668 S5 slice 3 G1;
          // battery run 4: 450 ms lost to the re-snap at load 115)
          await sleep(450);
          await settleRect(c, sel);
          return c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        };
        // A REJECTED press can still operate the target: a release beside the
        // span but inside its wrapping <label> clicks the radio (review r1 P2).
        // `pre` is read as each attempt starts and `restore` puts the
        // precondition back before the next one, so the ACCEPTED press has to
        // show the transition itself; a precondition that does not come back
        // is UNJUDGEABLE.
        const hold = async (sel, ms, tag, { retry = true, pre = null, restore = null } = {}) => {
          let last = null;
          for (let i = 1; i <= (retry ? 3 : 1); i++) {
            const pt = await pressOn(sel);
            if (!pt) return { found: false };
            const p = pre ? await c.eval(pre) : null;
            last = await pagePress(c, pt, ms, { sel });
            if (last.downOn && last.upOn && last.ms !== null && last.ms >= P_HOLD_MS) return { found: true, r: last, pre: p };
            console.log(`${tag}: hold ${i} was not a held press on the target as the page saw it `
              + `(${JSON.stringify(last)}; load1 ${os.loadavg()[0].toFixed(1)}) — pressed again`);
            await c.eval(`__shell.isOpen() || __shell.openShell(), __shell.go('play'), true`);
            await sleep(300);
            if (restore && !(await restore())) return { found: true, r: null, last, unrestored: true };
          }
          return { found: true, r: null, last };
        };
        const C2B = `(() => ({ c2b: __settings.get().caromSecondBall ?? null,
          checked: document.querySelector('[data-ob="play-carom2b"] input[value="marked"]').checked }))()`;
        // back to unmarked through the fork's own user-change path (a radio
        // click ⇒ change ⇒ commitCarom2b), polled until the setting follows
        const unmark = async () => {
          await c.eval(`(() => { const y = document.querySelector('[data-ob="play-carom2b"] input[value="yellow"]');
            if (y && !y.checked) y.click(); return true; })()`);
          for (let i = 0; i < 30 * SCALE; i++) {
            const s = await c.eval(C2B);
            if (s.c2b !== 'marked' && !s.checked) return true;
            await sleep(100);
          }
          return false;
        };
        const before = await c.eval(`__settings.get().caromSecondBall ?? null`);
        // (a) a 900 ms hold on the "marked" radio's LABEL text (the touch
        // target a thumb lands on): the fork commits, the shell STAYS
        const ha = await hold('[data-ob="play-carom2b"] input[value="marked"] + span', 900, 'P-HOLD(a)', { pre: C2B, restore: unmark });
        if (!ha.found) fail('P-HOLD(a): the marked radio label was not found');
        else if (ha.unrestored) fail('P-HOLD(a): UNJUDGEABLE — a rejected hold operated the radio and the unmarked precondition did not come back: ' + JSON.stringify(ha.last));
        else if (!ha.r) fail('P-HOLD(a): UNJUDGEABLE — 3 holds were not seen by the page as a held press on the label: ' + JSON.stringify(ha.last));
        else {
          await sleep(300);
          const a = await c.eval(`(() => ({ open: __shell.isOpen(), place: __shell.place?.() ?? null,
            c2b: __settings.get().caromSecondBall ?? null,
            checked: document.querySelector('[data-ob="play-carom2b"] input[value="marked"]').checked,
            fork: __play.registry().carom2b }))()`);
          if (before === 'marked' || ha.pre.c2b === 'marked' || ha.pre.checked
            || !a.open || a.place !== 'play' || a.c2b !== 'marked' || !a.checked || a.fork !== true) {
            fail('P-HOLD(a): a HELD carom radio must operate the setting and never fire the card long-press (unmarked as the accepted press starts; shell open at play, caromSecondBall = marked): '
              + JSON.stringify({ before, pre: ha.pre, ...a, press: ha.r }));
          }
        }
        // (b) CONTROL: the same hold on the section's h2 (the press point)
        // fires quick-play — proves the long-press handler is live on this
        // section, so (a) tested the exclusion and not a dead handler. One
        // press: the hold that lands closes the shell, so it cannot be
        // retried; the page's facts ride the failure line.
        const hb = await hold('section[data-place="play"] h2', 900, 'P-HOLD(b)', { retry: false });
        if (!hb.found) fail('P-HOLD(b): the play h2 was not found');
        else {
          await sleep(400);
          const b = await c.eval(`({ open: __shell.isOpen(), c2b: __settings.get().caromSecondBall ?? null })`);
          if (!hb.r) fail('P-HOLD(b): UNJUDGEABLE — the page did not see a held press on the h2: ' + JSON.stringify({ ...b, press: hb.last }));
          else if (b.open !== false || b.c2b !== 'marked') {
            fail('P-HOLD(b): the CONTROL hold on the h2 must fire the S1 quick-play (shell closes; the fork setting stays): '
              + JSON.stringify({ ...b, press: hb.r }));
          }
        }
      }
      await armOk(c, errs, f0, 'P-HOLD OK: a held carom radio operates the fork with the shell open; the h2 hold still fires quick-play');
    }
    // ---- P-VN deferred variant feedback in the shell (review code review r3 P2-2)
    // FR-008 shot > 0 ⇒ `settings.variantNextRack`: settings.js hands it to
    // the HUD hint, which is hidden under the open shell and expires on its
    // own — play.js ALSO surfaces it through shell.notice (#ob-shell-note),
    // the carom fork's idiom. Staging: eight_ball scripted boot (the family whose rows carry a real non-alias explicit preset, `apa-8ball` — the e2e-variants V1 row; nine_ball ships no presets), quick-play
    // closes the shell, one stroke (the P-RL recording stroke), the shell
    // re-opened at play on the PROGRESSED rack (no pending decision, so the
    // commit gate passes). The list's rows are settings-owned
    // (`__settings.variantRows`, 034a-mig T009): while the seam is ABSENT the
    // leg installs a SCRIPTED STAND-IN from the same source settings.js reads
    // (rulesCatalogJson presets of the family whose default row aliases the
    // game's ruleset id; `value` per the settings.js:2612 law — '' for the
    // alias row of a non-live-default family, eight_ball is one; `current`
    // from variantFor) and names it on the OK line; with the real seam
    // present nothing is installed.
    {
      const f0 = failCount;
      await c.eval(`(() => { localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball' }));
        location.reload(); return true; })()`);
      await sleep(1200);
      if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P-VN: eight_ball boot never mounted play');
      else {
        await c.eval('__shell.quickPlay(), true');
        await sleep(300);
        await c.eval('__test.rerack(1)');
        await sleep(300);
        const rej = await c.eval('__test.shoot({ power: 6, phi: Math.PI / 2, a: 0, b: -0.1 })');
        let st = null;
        if (rej) fail('P-VN: staging stroke refused: ' + rej);
        else if (!(st = await settleTable(c))) fail('P-VN: staging stroke never settled');
        if (st === 'BALL_IN_HAND') await c.eval('__test.placeCue(0, -0.6)');
        const stage = await c.eval(`({ pristine: __settings.rackPristine(),
          pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null, open: __shell.isOpen() })`);
        if (st === null || stage.pristine !== false || stage.pend !== null || stage.open) {
          fail('P-VN: staging expects a PROGRESSED eight_ball rack, no pending decision, shell closed: ' + JSON.stringify({ st, ...stage }));
        } else {
          const reopened = await c.eval('__shell.openShell()');
          if (reopened !== true || !(await waitPlay(c))) fail('P-VN: the shell must re-open at play on the progressed rack: ' + reopened);
          else {
            const seam = await c.eval(`(async () => {
              if (typeof __settings.variantRows === 'function') return 'real';
              const [{ GAME_CATALOG }, be] = await Promise.all([
                import('/dist/pool-sdk/games/index.js'), import('/dist/pool-sdk/rules/backend.js')]);
              const catalog = JSON.parse(be.rulesCatalogJson());
              __settings.variantRows = (gid) => { // SCRIPTED STAND-IN (034a-mig T009 absent)
                const g = GAME_CATALOG.find((e) => e.id === gid);
                const entry = g && catalog.rulesets.find((e) => (e.presets ?? []).some((r) => r.aliases === g.ruleset_id));
                if (!entry) return null;
                const sel = __settings.variantFor(gid) ?? null;
                return entry.presets.map((r) => ({ id: r.id, value: r.aliases ? '' : r.id, label: r.id,
                  tier: r.tier, desc: r.sourceTitle + ' — ' + r.sourceEdition,
                  current: sel === null ? !!r.aliases : sel === r.id }));
              };
              window.__play.refresh();
              return 'stand-in';
            })()`);
            await sleep(200);
            const vs = await c.eval(`(() => {
              const picks = [...document.querySelectorAll('section[data-place="play"] [data-variant-pick]')];
              const rows = __settings.variantRows(__settings.get().game) ?? [];
              const target = rows.find((r) => r.current !== true && r.value !== '') ?? null;
              return { n: picks.length, hidden: !picks.length || picks.some((b) => !b.getClientRects().length),
                target: target?.id ?? null, rendered: !!target && picks.some((b) => b.dataset.variantPick === target.id) }; })()`);
            if (vs.n < 2 || vs.hidden || !vs.target || !vs.rendered) {
              fail(`P-VN: staging — the variant list must render its rows with a non-current explicit preset (${seam}): ` + JSON.stringify(vs));
            } else {
              const r = await c.eval(`(async () => {
                const balls0 = JSON.stringify(__test.balls().map((b) => b.pos));
                const ok = window.__play.pickVariant(${JSON.stringify(vs.target)});
                await new Promise((f) => setTimeout(f, 250));
                const row = document.querySelector('section[data-place="play"] [data-variant-pick=' + JSON.stringify(${JSON.stringify(vs.target)}) + ']');
                return { ok, note: document.getElementById('ob-shell-note')?.textContent ?? null,
                  exp: window.__i18n.t('settings.variantNextRack'), open: __shell.isOpen(),
                  vf: __settings.variantFor('eight_ball'), pristine: __settings.rackPristine(),
                  noRerack: JSON.stringify(__test.balls().map((b) => b.pos)) === balls0,
                  current: row?.closest('[aria-current]')?.getAttribute('aria-current') ?? null }; })()`);
              if (r.ok !== true || r.note !== r.exp || !r.open || r.vf !== vs.target || r.pristine !== false
                || !r.noRerack || r.current !== 'true') {
                fail('P-VN: a variant picked after shot > 0 with the shell open must surface settings.variantNextRack in #ob-shell-note (shell open, pin persisted, no rerack, row current): '
                  + JSON.stringify({ target: vs.target, seam, ...r }));
              }
            }
            await armOk(c, errs, f0, `P-VN OK: deferred variant pick surfaces settings.variantNextRack in #ob-shell-note (rows: ${seam})`);
          }
        }
      }
    }
  }
  c.close();
}

// ---- P1 (a) module leg: /app/play.js POISONED ⇒ the S1 stub stands ---------
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url('obshell=1&seed=1&u=playdeg'), { port: CDP_PORT + 1, tool: false });
  watchErrors(c, errs);
  await blockUrl(c, /\/app\/play\.js(\?|$)/, '*play.js*');
  await c.send('Page.navigate', { url: url('obshell=1&seed=1&u=playdeg2') });
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('P1a: poisoned boot never opened the shell');
  else {
    await sleep(1500); // the import rejects; the stub must still stand
    const s = await c.eval(`(() => {
      const sec = document.querySelector('#ob-shell-cards > section[data-place="play"]');
      const lines = [...sec.querySelectorAll(':scope > p.ob-shell-line')];
      return { host: sec.classList.contains('ob-play-host'),
        linesVis: lines.length === 2 && lines.every((p) => p.getClientRects().length > 0),
        rules: lines[1]?.querySelector('span')?.textContent ?? null,
        vdefault: window.__i18n.t('settings.variantDefault'),
        action: !!sec.querySelector(':scope > .ob-shell-actions button'),
        play: typeof window.__play, playNodes: sec.querySelectorAll('[data-ob^="play-"]').length,
        place: __shell.place(), open: __shell.isOpen() };
    })()`);
    if (s.host || !s.linesVis || s.rules !== s.vdefault || !s.action || s.play !== 'undefined'
      || s.playNodes !== 0 || s.place !== 'play' || !s.open) {
      fail('P1a: with play.js poisoned the S1 stub must stand (FR-004 line live, no play nodes): '
        + JSON.stringify(s));
    }
    // 034a-mig T024b (1): the poisoned stub action opens NO modal — the
    // settings shim's poison probe (shell open at play, `window.__play`
    // undefined) lands the HUD hint and shell.js's showThenOpen 'play' twin
    // surfaces the SAME key through the shell notice and skips the gear:
    // `#ob-settings` stays closed, activeSection() unchanged, shell still
    // open at play, zero console errors (review round 3 P2-1 / round 4 P2-1)
    const before = await c.eval(`({ sect: window.__settings.activeSection?.() ?? null,
      modalRects: document.getElementById('ob-settings')?.getClientRects().length ?? 0 })`);
    await clickEl(c, 'section[data-place="play"] > .ob-shell-actions button');
    await sleep(900 * SCALE);
    const after = await c.eval(`({ sect: window.__settings.activeSection?.() ?? null,
      modalRects: document.getElementById('ob-settings')?.getClientRects().length ?? 0,
      note: document.getElementById('ob-shell-note')?.textContent ?? null,
      exp: window.__i18n.t('shell.place.play.shim.stale'),
      hint: document.getElementById('hud-hint')?.textContent ?? null,
      place: __shell.place(), open: __shell.isOpen(), play: typeof window.__play })`);
    if (before.modalRects !== 0 || after.modalRects !== 0 || after.sect !== before.sect || after.sect === 'game'
      || after.note !== after.exp || after.hint !== after.exp || after.place !== 'play' || !after.open
      || after.play !== 'undefined') {
      fail('P1a: the poisoned stub action must open NO modal and surface shell.place.play.shim.stale (shell note + HUD hint), shell still at play: '
        + JSON.stringify({ before, after }));
    }
  }
  await armOk(c, errs, f0, 'P1a OK: play.js poisoned ⇒ S1 stub stands; the action opens NO modal and lands shell.place.play.shim.stale (shell note + HUD hint)');
  c.close();
}

// ---- P1 (b) leaf leg: ui/cardrail.js POISONED ⇒ rung-1 button register ----
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url('obshell=1&seed=1&u=raildeg'), { port: CDP_PORT + 2, tool: false });
  watchErrors(c, errs);
  await blockUrl(c, /\/app\/ui\/cardrail\.js(\?|$)/, '*cardrail.js*');
  await c.send('Page.navigate', { url: url('obshell=1&seed=1&u=raildeg2') });
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) {
    fail('P1b-leaf: cardrail-poisoned boot never mounted play');
  } else {
    const s = await c.eval(`(async () => {
      const { GAME_CATALOG } = await import('./dist/pool-sdk/games/index.js');
      const caps = window.__settings.capabilities?.() ?? null;
      const heyballOk = caps ? caps.heyball === true : window.__settings.get().game === 'heyball';
      const expected = GAME_CATALOG.filter((e) => e.id !== 'heyball' || heyballOk).length;
      const sec = document.querySelector('section[data-place="play"]');
      const cards = [...sec.querySelectorAll('[data-ob="play-game"]')];
      const mount = sec.querySelector('[data-ob="play-games"]');
      const label = document.getElementById(mount.getAttribute('aria-labelledby') ?? '');
      return { host: sec.classList.contains('ob-play-host'), rail: !!sec.querySelector('.ob-cardrail-card'),
        n: cards.length, expected, catalog: GAME_CATALOG.length,
        rows: cards.every((b) => b.classList.contains('ob-card-option') && b.classList.contains('ob-play-card') && b.tagName === 'BUTTON'), // the rung-1 register wears the kit part too (GH-668 S5 slice 3 G1)
        current: cards.find((b) => b.getAttribute('aria-current') === 'true')?.dataset.game ?? null,
        tabs: cards.map((b) => b.tabIndex).join(), minH: Math.min(...cards.map((b) => b.getBoundingClientRect().height)),
        // 034a-mig T009: with capabilities() on the tree the heyball card
        // is OFFERED (contract §4 law 6) — the visible set is the whole
        // catalog and End lands on its last card; the old "catalog - 1"
        // clause encoded the 034a-front window (heyball hidden unless current)
        last: cards.at(-1)?.dataset.game ?? null, heyballOk,
        // review code review fix round 1 P2-3: the rung-1 register is NAMED by
        // the heading; review r1 checker P3 (merge round) RESTATED its role:
        // a LISTBOX of role=option cards (the leaf's own pair — the
        // aria-selected mirror of review r1 P2-1 is valid on that tree only)
        role: mount.getAttribute('role'), options: cards.every((k) => k.getAttribute('role') === 'option'),
        named: !!label && sec.contains(label)
          && label.textContent.trim() === window.__i18n.t('shell.place.play.choose') };
    })()`);
    if (!s.host || s.rail || s.n !== s.expected || s.n !== s.catalog - (s.heyballOk ? 0 : 1) || !s.rows
      || s.current !== 'nine_ball' || s.minH < 44) {
      fail('P1b-leaf: cardrail poisoned ⇒ rung-1 button register with the visible-set count: '
        + JSON.stringify(s));
    }
    if (s.role !== 'listbox' || !s.options || !s.named) {
      fail('P1b-leaf: the rung-1 register must be a LISTBOX of role=option cards NAMED by the DISCIPLINE heading (aria-labelledby; the named-group clause of code-review fix round 1 P2-3 restated by review r1 checker P3): '
        + JSON.stringify({ role: s.role, options: s.options, named: s.named }));
    }
    // keyboard-reachable through the rung-1 roving handler; blob unchanged
    await c.eval(`document.querySelector('[data-ob="play-game"][data-game="nine_ball"]').focus()`);
    const b0 = await c.eval(SNAP);
    await pressKey(c, 'ArrowRight');
    const f1 = await c.eval(`document.activeElement?.dataset?.game ?? null`);
    await pressKey(c, 'ArrowDown');
    await pressKey(c, 'End');
    const f2 = await c.eval(`document.activeElement?.dataset?.game ?? null`);
    await pressKey(c, 'Home');
    const f3 = await c.eval(`document.activeElement?.dataset?.game ?? null`);
    await sleep(200);
    if (f1 !== 'eight_ball' || f2 !== s.last || f3 !== 'nine_ball' || await c.eval(SNAP) !== b0) {
      fail('P1b-leaf: the rung-1 register must rove with the six keys, blob unchanged: '
        + JSON.stringify({ f1, f2, f3, last: s.last }));
    }
  }
  await armOk(c, errs, f0, 'P1b-leaf OK: cardrail poisoned ⇒ plain button register (a named listbox of role=option cards), visible-set count, keyboard-reachable');
  c.close();
}

// ---- P2c css-blocked leg: ui/play.css blocked ⇒ stub stands, __play absent -
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url('obshell=1&seed=1&u=cssdeg'), { port: CDP_PORT + 3, tool: false });
  watchErrors(c, errs);
  await blockUrl(c, /\/app\/ui\/play\.css(\?|$)/, '*play.css*');
  await c.send('Page.navigate', { url: url('obshell=1&seed=1&u=cssdeg2') });
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('P2c: css-blocked boot never opened the shell');
  else {
    // play.js is resident (the module import succeeds) — wait for it, then
    // give the css error time to fire
    for (let i = 0; i < 40 * SCALE; i++) {
      if (await c.eval(`!!document.getElementById('ob-play-css')`)) break;
      await sleep(150);
    }
    await sleep(1500);
    const s = await c.eval(`(() => {
      const sec = document.querySelector('#ob-shell-cards > section[data-place="play"]');
      const lines = [...sec.querySelectorAll(':scope > p.ob-shell-line')];
      return { link: !!document.getElementById('ob-play-css'), host: sec.classList.contains('ob-play-host'),
        linesVis: lines.length === 2 && lines.every((p) => p.getClientRects().length > 0),
        rules: lines[1]?.querySelector('span')?.textContent ?? null,
        vdefault: window.__i18n.t('settings.variantDefault'),
        play: typeof window.__play, bodyIn: !!sec.querySelector('[data-ob="play-body"]'),
        mark: performance.getEntriesByName('ob:play-mounted').length };
    })()`);
    if (!s.link || s.host || !s.linesVis || s.rules !== s.vdefault || s.play !== 'undefined'
      || s.bodyIn || s.mark !== 0) {
      fail('P2c: with play.css blocked nothing may mount (stub live + ticking, __play undefined): '
        + JSON.stringify(s));
    }
    // the stub keeps ticking through R0's summaries closure (host guard inactive)
    await c.eval(`window.__settings.changeVariant('nine_ball', null), true`);
    // 034a-mig T024b (2): the poisoned stub action opens NO modal — the
    // settings shim's poison probe (shell open at play, `window.__play`
    // undefined) lands the HUD hint and shell.js's showThenOpen 'play' twin
    // surfaces the SAME key through the shell notice and skips the gear:
    // `#ob-settings` stays closed, activeSection() unchanged, shell still
    // open at play, zero console errors (review round 3 P2-1 / round 4 P2-1)
    const before = await c.eval(`({ sect: window.__settings.activeSection?.() ?? null,
      modalRects: document.getElementById('ob-settings')?.getClientRects().length ?? 0 })`);
    await clickEl(c, 'section[data-place="play"] > .ob-shell-actions button');
    await sleep(900 * SCALE);
    const after = await c.eval(`({ sect: window.__settings.activeSection?.() ?? null,
      modalRects: document.getElementById('ob-settings')?.getClientRects().length ?? 0,
      note: document.getElementById('ob-shell-note')?.textContent ?? null,
      exp: window.__i18n.t('shell.place.play.shim.stale'),
      hint: document.getElementById('hud-hint')?.textContent ?? null,
      place: __shell.place(), open: __shell.isOpen(), play: typeof window.__play })`);
    if (before.modalRects !== 0 || after.modalRects !== 0 || after.sect !== before.sect || after.sect === 'game'
      || after.note !== after.exp || after.hint !== after.exp || after.place !== 'play' || !after.open
      || after.play !== 'undefined') {
      fail('P2c: the poisoned stub action must open NO modal and surface shell.place.play.shim.stale (shell note + HUD hint), shell still at play: '
        + JSON.stringify({ before, after }));
    }
  }
  await armOk(c, errs, f0, 'P2c OK: play.css blocked ⇒ stub stands and ticks, __play undefined; the action opens NO modal and lands shell.place.play.shim.stale');
  c.close();
}

// ---- P2p phone height cap (844×390 coarse; FR-003 / FR-017) ---------------
{
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url('obshell=1&seed=1&u=phone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P2p: phone boot never mounted play');
  else {
    await sleep(400);
    const s = await c.eval(`(() => {
      const sec = document.querySelector('section[data-place="play"]');
      const r = sec.getBoundingClientRect();
      const qp = document.getElementById('ob-shell-quickplay-wrap')?.getBoundingClientRect();
      const ctrls = [...sec.querySelectorAll('button, input, [role="option"]')]
        .filter((n) => n.getClientRects().length > 0)
        .map((n) => { const b = n.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), t: n.dataset.game ?? n.dataset.ob ?? n.tagName }; });
      const h2 = sec.querySelector('h2').getBoundingClientRect();
      return { vw: innerWidth, vh: innerHeight, secTop: r.top, secBottom: r.bottom, qpTop: qp?.top ?? null,
        h2Top: h2.top, ctrls, minDim: Math.min(...ctrls.map((k) => Math.min(k.w, k.h))),
        rotate: !!document.getElementById('ob-rotate')?.getClientRects().length,
        scroller: getComputedStyle(sec.querySelector('[data-ob="play-body"]')).overflowY };
    })()`);
    if (s.vw !== 844 || s.vh !== 390 || s.rotate) fail('P2p: expected the 844×390 landscape register: ' + JSON.stringify(s));
    if (s.qpTop === null || s.secBottom > s.qpTop) {
      fail('P2p: FR-003 height cap — the section bottom must stay above #ob-shell-quickplay-wrap: ' + JSON.stringify(s));
    }
    if (!s.ctrls.length || s.minDim < 44) fail('P2p: every visible play control must be >= 44 pt both dims: ' + JSON.stringify(s.ctrls));
    if (s.h2Top < s.secTop - 1 || s.scroller !== 'auto') fail('P2p: the h2 press point must stay at the top over the body scroller: ' + JSON.stringify(s));
  }
  await armOk(c, errs, f0, 'P2p OK: 844×390 — section above quick-play, controls >= 44 pt, h2 on top');
  // ---- P2p-fade (review visual audit round 2, finding 1): the carom fork in
  // de on the same phone register — the locale whose focused "Markiertes
  // Weiß (UMB-Wortlaut)" label lost its second line under the bottom
  // scrollfade band (the browser's focus scroll had revealed only the 1 px
  // kit radio, not its label). Each option focused from the scroller's top:
  // the LABEL box must be whole inside [data-ob="play-body"]'s visible box
  // minus the fade band wherever the band is drawn (data-ob-fade-top /
  // -bottom; the band width is read from the sheet's scroll-padding).
  const f1 = failCount;
  await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion' })), location.reload(), true)`);
  await sleep(1200);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P2p-fade: carom phone boot never mounted play');
  else {
    await c.eval(`window.__i18n.setLocale('de')`);
    await sleep(400);
    const fork = await c.eval(`(() => { const f = document.querySelector('[data-ob="play-carom2b"]');
      const b = document.querySelector('[data-ob="play-body"]');
      return { hidden: !f || f.hidden, n: f ? f.querySelectorAll('input[type="radio"]').length : 0,
        overflow: b.scrollHeight - b.clientHeight, locale: window.__i18n.locale() }; })()`);
    if (fork.hidden || fork.n !== 2 || fork.locale !== 'de') fail('P2p-fade: staging — the carom fork must be visible with two options in de: ' + JSON.stringify(fork));
    // the leg proves nothing unless the de carom card overflows the cap by
    // more than the band (the audited frame had 240 px of scroll)
    if (fork.overflow < 48) fail('P2p-fade: staging — the de carom card must overflow the 212 px cap: ' + JSON.stringify(fork));
    // quiet = true adds the en settle's quiet time, read in the same evaluation as the geometry
    const measure = (v, quiet = false) => c.eval(`(() => { const b = document.querySelector('[data-ob="play-body"]'); const br = b.getBoundingClientRect();
      const inp = document.querySelector('[data-ob="play-carom2b"] input[value="${v}"]');
      const lab = inp.closest('label'); const r = lab.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(b).scrollPaddingTop) || 0;
      const topBand = b.dataset.obFadeTop === '1' ? pad : 0, botBand = b.dataset.obFadeBottom === '1' ? pad : 0;
      return { focused: document.activeElement === inp, pad, top: Math.round(b.scrollTop), max: b.scrollHeight - b.clientHeight,
        view: Math.round(br.height), labTop: Math.round(r.top - br.top), labBottom: Math.round(r.bottom - br.top), topBand, botBand,
        text: lab.textContent.trim(), locale: window.__i18n.locale(),
        whole: r.height > 0 && r.top >= br.top + topBand - 0.5 && r.bottom <= br.bottom - botBand + 0.5${quiet ? ', quiet: Math.round(window.__obP2pFadeQuiet.ms())' : ''} }; })()`);
    // two starts per option: from the scroller's TOP (the browser's own
    // focus scroll runs), and TAIL-CLIPPED — the label's head 30 px above
    // the bottom edge, its 1 px radio visible, its tail past the edge (a
    // tap on a half-visible option: the browser sees a visible input and
    // scrolls nothing — only play's reveal can bring the label whole)
    const startFrom = (v, mode) => c.eval(`(() => { const b = document.querySelector('[data-ob="play-body"]');
      document.activeElement?.blur?.(); b.scrollTop = 0;
      if (${JSON.stringify(mode)} === 'tail') {
        const lab = document.querySelector('[data-ob="play-carom2b"] input[value="${v}"]').closest('label');
        const off = lab.getBoundingClientRect().top - b.getBoundingClientRect().top;
        b.scrollTop = Math.max(0, off - (b.clientHeight - 30));
      }
      return Math.round(b.scrollTop); })()`);
    for (const v of ['marked', 'yellow']) {
      for (const mode of ['top', 'tail']) {
        const start = await startFrom(v, mode);
        await sleep(150);
        await c.eval(`document.querySelector('[data-ob="play-carom2b"] input[value="${v}"]').focus()`);
        await sleep(300);
        const m = await measure(v);
        if (!m.focused || !m.whole) {
          fail(`P2p-fade: "${v}" focused from the ${mode} (scrollTop ${start}) — its label must be whole inside the scroller minus the fade band: ` + JSON.stringify(m));
        }
        if (m.pad < 1) fail(`P2p-fade: the sheet's scroll-padding (the fade band as inset) is absent on the scroller: ` + JSON.stringify(m));
      }
    }
    // the AUDITED path was not a focus: "marked" focused in en (the scroller
    // parks at en's maximum), then the locale swap to de reflows the content
    // under the still-focused control — the label must stay whole. The
    // growth is STAGED, never read from the shipped copy (#1180's longer en
    // carom variant row left the en → de swap with no growth; PR #1279): a
    // test-only sheet hangs a block under the fork's head on <html lang="de">
    // only — i18n.js syncHtmlLang writes it before the locale listeners run,
    // so the block lands in the swap's own reflow. Its height comes from the
    // en frame: the label's tail drops to the scroller's bottom edge. The
    // same sheet turns the scroller's scroll anchoring off: an anchor below
    // the block would absorb it (scrollTop += the block, nothing moves on
    // screen), so only play's re-reveal and fold-snap's re-snap may keep
    // the label whole.
    await c.eval(`window.__i18n.setLocale('en')`);
    await sleep(300);
    await startFrom('marked', 'top');
    await sleep(150);
    // the en frame decides the staging (the premise, the block's height, the
    // parked frame), so it is read once it has SETTLED. Fold-snap moves the
    // scroller only at frames (its landing on scrollend, its smooth settle,
    // a re-snap deferred up to 200 ms after the last scroll), and on a loaded
    // host frames come ~100 ms apart, so two agreeing readings alone can
    // straddle no frame. Settled = two readings 100 ms apart agree on focus,
    // offset, the label's tail and the max, AND the second finds no scroll
    // event for 400 ms (a page-side stamp set up before the focus). Each
    // reading takes the geometry and the quiet time in ONE page evaluation:
    // read in two, a move between them could pass a stale frame as quiet
    // once 400 ms had gone by
    await c.eval(`(() => { const b = document.querySelector('[data-ob="play-body"]');
      const st = { at: performance.now() }; const on = () => { st.at = performance.now(); };
      b.addEventListener('scroll', on, { passive: true });
      window.__obP2pFadeQuiet = { ms: () => performance.now() - st.at, off: () => b.removeEventListener('scroll', on) };
      return true; })()`);
    let mEn, enReads = 0, enQuiet = 0, enSettled = false;
    try {
      await c.eval(`document.querySelector('[data-ob="play-carom2b"] input[value="marked"]').focus()`);
      await sleep(250);
      mEn = await measure('marked', true);
      enReads = 1;
      for (let i = 0; i < 30 * SCALE && !enSettled; i++) {
        await sleep(100);
        const m = await measure('marked', true);
        enQuiet = m.quiet;
        enReads += 1;
        enSettled = enQuiet >= 400 && m.focused === mEn.focused && m.top === mEn.top && m.labBottom === mEn.labBottom && m.max === mEn.max;
        mEn = m;
      }
    } finally {
      await c.eval(`(window.__obP2pFadeQuiet?.off(), delete window.__obP2pFadeQuiet, true)`).catch(() => {});
    }
    console.log(`P2p-fade INFO (the en frame): ${enReads} reading(s) 100 ms apart, ${enSettled ? 'settled' : 'not settled'}, the scroller quiet ${enQuiet} ms`);
    if (!enSettled) fail(`P2p-fade: staging — the en frame must settle (two readings 100 ms apart agree on focus, top, labBottom and max, the scroller quiet >= 400 ms) within ${30 * SCALE} readings: ` + JSON.stringify({ enReads, enQuiet, mEn }));
    // the swap must start from en: a page still in de matches the sheet's
    // html[lang="de"] block the moment it goes in, and the swap below is
    // then a no-op
    const enLoc = await c.eval(`({ locale: window.__i18n.locale(), lang: document.documentElement.lang })`);
    if (enLoc.locale !== 'en' || enLoc.lang !== 'en') fail('P2p-fade: staging — the page must be in en (__i18n and <html lang>) before the sheet goes in: ' + JSON.stringify(enLoc));
    if (!mEn.focused || !mEn.whole) fail('P2p-fade: staging — the en frame must hold the focused "marked" label whole before the swap: ' + JSON.stringify(mEn));
    const grow = Math.max(mEn.pad, mEn.view - mEn.labBottom);
    let mDe;
    try {
      await c.eval(`(() => { const s = document.createElement('style'); s.id = 'ob-e2e-p2p-fade-grow';
        s.textContent = '[data-ob="play-body"] { overflow-anchor: none; } '
          + 'html[lang="de"] [data-ob="play-carom2b"] > h3::after { content: ""; display: block; height: ${grow}px; }';
        document.head.append(s); return true; })()`);
      await c.eval(`window.__i18n.setLocale('de')`);
      await sleep(400);
      mDe = await measure('marked');
    } finally {
      await c.eval(`(document.getElementById('ob-e2e-p2p-fade-grow')?.remove(), true)`).catch(() => {});
    }
    // the staging is judged on the frames it produced: had the scroller
    // stayed where en left it, the de label's tail would sit under the
    // bottom band there (drawn wherever that offset is short of the de
    // maximum) or past the edge, so only a re-reveal keeps it whole
    const parked = { tail: mDe.labBottom + mDe.top - mEn.top, edge: mDe.view - (mEn.top < mDe.max ? mDe.pad : 0) };
    if (mDe.locale !== 'de' || !(parked.tail > parked.edge)) {
      fail('P2p-fade: staging — the de swap must drop the focused label\'s tail under the bottom band of the frame en left: ' + JSON.stringify({ grow, parked, mEn, mDe }));
    }
    if (!mDe.focused || !mDe.whole) {
      fail('P2p-fade: after the en → de locale swap under focus the "marked" label must stay whole (the audited frame: scroller left at 219 of 240): ' + JSON.stringify(mDe));
    }
  }
  await armOk(c, errs, f1, 'P2p-fade OK: de carom fork on 844×390 — each focused option whole inside the scroller minus the fade band');
  // ---- P2p-sa (review code review r3 P2-1): the same carom phone boot under
  // NOTCH emulation. shell.css shifts #ob-shell-cards by env(safe-area-
  // inset-left) and the quick-play stack by -right; the routed prompt rule
  // (shell.js #ob-shell-crit, the 034 exception hunk) adds the right inset
  // to the prompt's offset and subtracts BOTH insets from its width bound —
  // without that the prompt walks into the unsafe right band and, at its
  // width bound, back over the card column. Asserts per locale (de = the
  // widest prompt copy, en): (1) prompt ∩ play section = ∅; (2) the prompt
  // sits inside the horizontal safe region; (3) it stays above the
  // quick-play stack (the FR-017 phone law). CDP-only: a CSS seam cannot
  // override env(), so an unavailable override FAILS loudly (touch-e2e.md
  // §4.1 / the e2e-touch S1 law) instead of passing vacuously.
  const f2 = failCount;
  const saMode = await setSafeAreaInsets(c, PHONE_SA);
  if (saMode === null) {
    fail('P2p-sa: Emulation.setSafeAreaInsetsOverride is unavailable on this Chrome build — the leg needs the pinned chrome-headless-shell (touch-e2e.md §4.1)');
  } else {
    let prompted = false;
    for (let i = 0; i < 20 * SCALE && !prompted; i++) {
      prompted = await c.eval(`document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 2`);
      if (!prompted) await sleep(200);
    }
    if (!prompted) fail('P2p-sa: staging — the carom boot must carry the in-shell break_spot prompt');
    else {
      for (const loc of ['de', 'en']) {
        await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
        await sleep(300);
        const s = await c.eval(SA_PROBE);
        if (s.sa.left !== PHONE_SA.left || s.sa.right !== PHONE_SA.right || s.locale !== loc) {
          fail('P2p-sa: staging — the notch insets did not reach env() (mode=' + saMode + '): ' + JSON.stringify(s));
          break;
        }
        if (!s.card || s.card.l < 14 + PHONE_SA.left - 0.5) {
          fail('P2p-sa: staging — the card column must be shifted by the left inset (shell.css #ob-shell-cards): ' + JSON.stringify(s));
        }
        if (!s.prompt) { fail(`P2p-sa @ ${loc}: the in-shell prompt vanished under the notch emulation: ` + JSON.stringify(s)); continue; }
        if (s.overlap !== 0) fail(`P2p-sa @ ${loc}: prompt ∩ card must be EMPTY under the notch insets (${s.overlap} px² overlap): ` + JSON.stringify(s));
        if (s.prompt.l < s.sa.left - 0.5 || s.prompt.r > s.vw - s.sa.right + 0.5) {
          fail(`P2p-sa @ ${loc}: the prompt must sit inside the horizontal safe region [${s.sa.left}, ${s.vw - s.sa.right}]: ` + JSON.stringify(s));
        }
        if (s.qpTop === null || s.prompt.b > s.qpTop + 0.5) fail(`P2p-sa @ ${loc}: the prompt must stay above the quick-play stack: ` + JSON.stringify(s));
        if (s.btnIn !== true || s.hOverflow) fail(`P2p-sa @ ${loc}: every answer button must sit inside the prompt box, no horizontal overflow: ` + JSON.stringify(s));
        // (4) the rule's width BOUND itself — a prompt copy AT the bound
        // (longer decisions / locales) must still clear the card column:
        // (vw − right offset − max-width) ≥ card right. The natural de/en
        // copies (≈ 410 px) sit under both the old and the new bound, so
        // (1) alone cannot see the review claim; this line does.
        if (!Number.isFinite(s.bound) || !Number.isFinite(s.rightOff)) {
          fail(`P2p-sa @ ${loc}: the prompt's computed max-width / right must resolve to px: ` + JSON.stringify(s));
        } else if (s.vw - s.rightOff - s.bound < s.card.r - 0.5) {
          fail(`P2p-sa @ ${loc}: the prompt's width BOUND must keep it clear of the card column under the insets (bound ${s.bound} px from right ${s.rightOff} px reaches x=${s.vw - s.rightOff - s.bound}, card right ${s.card.r}): ` + JSON.stringify(s));
        }
      }
    }
    await setSafeAreaInsets(c, { top: 0, left: 0, right: 0, bottom: 0 });
  }
  await armOk(c, errs, f2, `P2p-sa OK: 844×390 under notch insets ${PHONE_SA.left}/${PHONE_SA.right} px (mode=${saMode}) — prompt clear of the card column (box AND width bound), inside the safe region, above quick-play (de, en)`);
  // ---- 667×375 (review code review r4 P2-1): the narrowest landscape
  // register the e2e-ui phone walker covers. The width bound is 349 px
  // (255 px under the 47 px side insets) against answer copies that
  // measure up to ~360 px nowrap; the routed rule's <= 700 px clause lets
  // a copy wider than its row wrap INSIDE its button. Per inset state
  // (notch profile, zero) and locale (de, en, zh-CN), with the boot's own
  // break_spot copies and again with the locale's LONGEST decision option
  // swapped into the second button (a CSS-geometry stand-in: the prompt
  // DOM persists until its signature changes, so the real eight-ball /
  // foul copies are measured without playing them): every button inside
  // the prompt box with its text inside the button, the box not scrolling
  // horizontally, plus the 844 lines (∩ card = ∅, safe region, width
  // bound). The vertical budget is REPORTED, not gated: a two-row prompt
  // (de's native copies; any long copy) is 202 px tall against a 179 px
  // band above the quick-play stack (158 px under the 21 px bottom inset)
  // — outside the routed rule (lane question 34).
  // rides AFTER the 844 verdict so each arm's OK line answers for its own
  // lines only (GH-558); needs the same CDP override (saMode) as the 844 leg
  const f3 = failCount;
  if (saMode === null) fail('P2p-sa-667: the safe-area override is unavailable (see P2p-sa)');
  else {
    await setPhoneMetrics(c, { width: 667, height: 375 });
    await c.eval('(location.reload(), true)');
    await sleep(1200);
    if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P2p-sa-667: carom boot never mounted play at 667×375');
    else {
      let up = false;
      for (let i = 0; i < 20 * SCALE && !up; i++) {
        up = await c.eval(`document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 2`);
        if (!up) await sleep(200);
      }
      if (!up) fail('P2p-sa-667: staging — the carom boot must carry the in-shell break_spot prompt');
      const notes = [];
      for (const [tag, ins] of [['insets', PHONE_SA], ['zero', { top: 0, left: 0, right: 0, bottom: 0 }]]) {
        if (!up) break;
        if ((await setSafeAreaInsets(c, ins)) === null) { fail('P2p-sa-667: the safe-area override vanished mid-leg'); break; }
        for (const loc of LOCALES_ALL) {
          await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
          await sleep(300);
          const s = await c.eval(SA_PROBE);
          if (s.vw !== 667 || s.sa.left !== ins.left || s.sa.right !== ins.right || s.locale !== loc || !s.prompt || !s.card) {
            fail(`P2p-sa-667 (${tag}) @ ${loc}: staging — 667×375 with the insets in force and the prompt up: ` + JSON.stringify(s));
            continue;
          }
          const geo = (what, g) => {
            if (g.overlap !== 0) fail(`P2p-sa-667 (${tag}) @ ${loc} ${what}: prompt ∩ card must be EMPTY: ` + JSON.stringify(g));
            if (g.prompt.l < g.sa.left - 0.5 || g.prompt.r > g.vw - g.sa.right + 0.5) fail(`P2p-sa-667 (${tag}) @ ${loc} ${what}: the prompt must sit inside the horizontal safe region: ` + JSON.stringify(g));
            if (!Number.isFinite(g.bound) || !Number.isFinite(g.rightOff) || g.vw - g.rightOff - g.bound < g.card.r - 0.5) fail(`P2p-sa-667 (${tag}) @ ${loc} ${what}: the width BOUND must clear the card column: ` + JSON.stringify(g));
            if (g.btnIn !== true || g.hOverflow) fail(`P2p-sa-667 (${tag}) @ ${loc} ${what}: every answer button must sit inside the prompt box with its text inside the button, and the box must not overflow horizontally (button widths ${g.btnW}, box ${g.prompt.w}): ` + JSON.stringify(g));
            // the quick-play YIELD (integrator ruling on lane question 34):
            // while the prompt is up on this register the stack must be
            // hidden AND inert AND unreachable by a finger at its pill —
            // whatever the prompt's height; the ∩ numbers stay on record
            const q = g.qp;
            const yielded = !!q && q.vis === 'hidden' && q.pe === 'none' && q.op === 0 && q.hit !== 'quickplay';
            if (!yielded || !/\bob-shell-decision-up\b/.test(g.shellCls || '')) {
              fail(`P2p-sa-667 (${tag}) @ ${loc} ${what}: the quick-play stack must YIELD while the prompt is up (#ob-shell.ob-shell-decision-up; visibility hidden, pointer-events none, opacity 0, pill centre not hit-testable): ` + JSON.stringify({ shellCls: g.shellCls, qp: q, promptBottom: g.prompt.b, qpTop: g.qpTop }));
            }
            notes.push(`${tag}/${loc}/${what}: ${g.btnRows} row(s), bottom ${g.prompt.b} vs stack top ${g.qpTop} (∩ ${q?.overlap ?? '?'} px², stack ${yielded ? 'YIELDED' : 'NOT yielded'})`);
          };
          geo('native', s);
          const swapped = await c.eval(`(() => { const kinds = ${JSON.stringify(SHELL_DECISION_KINDS)};
            const bs = document.querySelectorAll('#ob-shell-decision .osd-btns button'); if (bs.length !== 2) return null;
            const cv = document.createElement('canvas').getContext('2d'); cv.font = getComputedStyle(bs[1]).font;
            let best = null;
            for (const key of window.__i18n.keys()) {
              if (!key.startsWith('decision.opt.')) continue;
              const kind = key.slice('decision.opt.'.length, key.lastIndexOf('.'));
              if (!kinds.includes(kind)) continue;
              const txt = window.__i18n.t(key); const w = cv.measureText(txt).width;
              if (!best || w > best.w) best = { key, txt, w: Math.round(w) };
            }
            if (!best) return null;
            bs[1].dataset.obNative = bs[1].textContent; bs[1].textContent = best.txt; return best; })()`);
          if (!swapped) { fail(`P2p-sa-667 (${tag}) @ ${loc}: staging — no decision.opt.* copy to measure`); continue; }
          // the kit auto-row law flips an overflowing pill to --row on MutationObserver -> rAF (ui/controls.js autoRowQueue):
          // wait for that frame path itself (two rAFs) before the fixed settle, so a starved frame under a loaded box is not read mid-flip
          await c.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
          await sleep(150);
          geo(`longest ${swapped.key} (${swapped.w} px text)`, await c.eval(SA_PROBE));
          await c.eval(`(() => { const b = document.querySelectorAll('#ob-shell-decision .osd-btns button')[1];
            if (b?.dataset.obNative !== undefined) { b.textContent = b.dataset.obNative; delete b.dataset.obNative; } return true; })()`);
        }
      }
      if (notes.length) console.log('P2p-sa-667 INFO (prompt height vs the quick-play stack, gated by the yield; lane question 34 closed): ' + notes.join('; '));
      // the stack RETURNS with the answer (the prompt's resolve path is the
      // real one: window.__rules.decide through the button's own handler)
      if (up) {
        await setSafeAreaInsets(c, { top: 0, left: 0, right: 0, bottom: 0 });
        await c.eval(`window.__i18n.setLocale('en')`);
        await sleep(300);
        const before = await c.eval(SA_PROBE);
        if (!before.prompt || before.qp?.vis !== 'hidden') fail('P2p-sa-667 return: staging — the prompt must be up and the stack yielded before the answer: ' + JSON.stringify({ prompt: before.prompt, qp: before.qp }));
        await c.eval(`(document.querySelector('#ob-shell-decision .osd-btns button')?.click(), true)`);
        let after = null;
        for (let i = 0; i < 20 * SCALE; i++) {
          await sleep(100);
          after = await c.eval(SA_PROBE);
          if (!after.prompt && after.qp?.vis === 'visible' && after.qp.op === 1) break;
        }
        const shellOpen = await c.eval('window.__shell.isOpen()');
        if (after?.prompt) fail('P2p-sa-667 return: the answered prompt must be gone: ' + JSON.stringify(after));
        if (!after || after.qp?.vis !== 'visible' || after.qp.pe !== 'auto' || after.qp.op !== 1 || after.qp.hit !== 'quickplay' || /\bob-shell-decision-up\b/.test(after.shellCls || '') || shellOpen !== true) {
          fail('P2p-sa-667 return: the quick-play stack must be back the moment the prompt closes (visible, pointer-events auto, opacity 1, hit-testable at its pill; class gone; shell still open): ' + JSON.stringify({ qp: after?.qp, shellCls: after?.shellCls, shellOpen }));
        }
      }
    }
  }
  await armOk(c, errs, f3, 'P2p-sa-667 OK: 667×375 under the notch profile and at zero insets — every answer button inside the prompt box (native + longest localized copies, 7 locales), no horizontal overflow, clear of the card column, inside the safe region; the quick-play stack YIELDS while the prompt is up and RETURNS with the answer');
  // ---- P2p-sa-W: the WIDTH TABLE (lane question 32 + the coordinator's
  // width ruling, integrator shell pass 2026-09-05). The centred prompt is
  // a fixed box at left 50%: its shrink-to-fit width is capped at 50vw,
  // then bounded at 560px, and translated back by half — its left edge is
  // W/2 − min(content, W/2, 560)/2, a WIDTH condition, not a pointer one.
  // Measured on the centred law (904..1240px, step 8, coarse AND fine, 7
  // locales × native + longest copies) the last width with any card
  // overlap is 1144px at both pointers (analytic first-clear 1148); the
  // routed placement query reads `(max-width: 1180px)` pointer-agnostic
  // (1148 + the rule's 12px band ×2 = 1172, rounded to the next sweep
  // step). Rows: 926×428 coarse (iPhone 14 Pro Max), 1024×768 coarse
  // (iPad landscape) — routed; 1024×768 fine — routed on a desktop window;
  // 1280×800 and 1440×900 fine — centred. Every row, both inset states
  // (fine rows read env() = 0 — the zero profile only), 7 locales × native
  // + longest copy: the expected LAW in force (routed: computed right in
  // px + transform none; centred: a translate), prompt ∩ card = ∅, ∩ the
  // VISIBLE quick-play stack = ∅ (no yield above 700px), inside the safe
  // region, buttons inside the box, no horizontal overflow, and on the
  // routed rows the width BOUND clears the card column. The coarse rows
  // ride the phone browser (re-emulated); the fine rows ride a second,
  // desktop-register browser (launchChrome, no touch emulation).
  const f4 = failCount;
  // GH-699 / GH-702 (S4 journey QA round 2) rows: 1180×820 coarse (iPad
  // landscape, routed) and 1366×1024 coarse (centred) join; the coarse
  // rows >= 1024 ride the iPad landscape profile (24px status bar + 20px
  // home indicator, no side insets) instead of the iPhone notch profile —
  // every coarse row asserts the 44 pt answer floor (red on a0798726:
  // 39px at 1366 centred, and at 1024/1180 once the floor rode a width
  // gate) and every routed coarse row asserts top = 12px + env(top), 2px
  // above the card column's datum (red: top 12 under a 24px bar).
  const IPAD_SA = { top: 24, left: 0, right: 0, bottom: 20 };
  const WIDTH_TABLE = [
    { w: 926, h: 428, ptr: 'coarse', law: 'routed' }, { w: 1024, h: 768, ptr: 'coarse', law: 'routed', sa: IPAD_SA },
    { w: 1180, h: 820, ptr: 'coarse', law: 'routed', sa: IPAD_SA }, { w: 1366, h: 1024, ptr: 'coarse', law: 'centred', sa: IPAD_SA },
    { w: 1024, h: 768, ptr: 'fine', law: 'routed' }, { w: 1280, h: 800, ptr: 'fine', law: 'centred' },
    { w: 1440, h: 900, ptr: 'fine', law: 'centred' }];
  const ZERO = { top: 0, left: 0, right: 0, bottom: 0 };
  let fineC = null;
  const swapLongest = (cc) => cc.eval(`(() => { const kinds = ${JSON.stringify(SHELL_DECISION_KINDS)};
    const bs = document.querySelectorAll('#ob-shell-decision .osd-btns button'); if (bs.length !== 2) return null;
    const cv = document.createElement('canvas').getContext('2d'); cv.font = getComputedStyle(bs[1]).font;
    let best = null;
    for (const key of window.__i18n.keys()) {
      if (!key.startsWith('decision.opt.')) continue;
      const kind = key.slice('decision.opt.'.length, key.lastIndexOf('.'));
      if (!kinds.includes(kind)) continue;
      const txt = window.__i18n.t(key); const w = cv.measureText(txt).width;
      if (!best || w > best.w) best = { key, txt, w: Math.round(w) };
    }
    if (!best) return null;
    bs[1].dataset.obNative = bs[1].textContent; bs[1].textContent = best.txt; return best; })()`);
  const restoreNative = (cc) => cc.eval(`(() => { const b = document.querySelectorAll('#ob-shell-decision .osd-btns button')[1];
    if (b?.dataset.obNative !== undefined) { b.textContent = b.dataset.obNative; delete b.dataset.obNative; } return true; })()`);
  const promptUp = async (cc) => { let up = false;
    for (let i = 0; i < 20 * SCALE && !up; i++) { up = await cc.eval(`document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 2`); if (!up) await sleep(200); }
    return up; };
  if (saMode === null) fail('P2p-sa-W: the safe-area override is unavailable (see P2p-sa)');
  else for (const row of WIDTH_TABLE) {
    const id = `P2p-sa-W ${row.w}×${row.h} ${row.ptr}`;
    let cc = c;
    if (row.ptr === 'fine') {
      if (!fineC) { fineC = await launchChrome(url('obshell=1&seed=1&u=wtable'), { port: CDP_PORT + 9, tool: false, width: row.w, height: row.h }); watchErrors(fineC, errs); }
      else await fineC.send('Emulation.setDeviceMetricsOverride', { width: row.w, height: row.h, deviceScaleFactor: 1, mobile: false });
      cc = fineC;
      if (!fineC._booted) { if (!(await waitReady(cc))) { fail(`${id}: fine browser never became ready`); continue; }
        await cc.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion' })), location.reload(), true)`); fineC._booted = true; }
    } else await setPhoneMetrics(c, { width: row.w, height: row.h });
    if (row.ptr === 'coarse' || !fineC._mounted) { if (row.ptr === 'coarse') await cc.eval('(location.reload(), true)'); await sleep(1200);
      if (!(await waitReady(cc)) || !(await waitShell(cc)) || !(await waitPlay(cc))) { fail(`${id}: carom boot never mounted play`); continue; }
      if (row.ptr === 'fine') fineC._mounted = true; }
    if (!(await promptUp(cc))) { fail(`${id}: staging — the carom boot must carry the in-shell break_spot prompt`); continue; }
    const ptrOk = await cc.eval(`matchMedia('(pointer: ${row.ptr})').matches && innerWidth === ${row.w} && innerHeight === ${row.h}`);
    if (!ptrOk) { fail(`${id}: staging — the register (pointer + viewport) is not in force: ` + JSON.stringify(await cc.eval('({ w: innerWidth, h: innerHeight, coarse: matchMedia("(pointer: coarse)").matches, fine: matchMedia("(pointer: fine)").matches })'))); continue; }
    for (const [tag, ins] of row.ptr === 'coarse' ? [['insets', row.sa ?? PHONE_SA], ['zero', ZERO]] : [['zero', ZERO]]) {
      if (row.ptr === 'coarse' && (await setSafeAreaInsets(cc, ins)) === null) { fail(`${id}: the safe-area override vanished mid-leg`); break; }
      for (const loc of LOCALES_ALL) {
        await cc.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
        await sleep(300);
        const s = await cc.eval(SA_PROBE);
        if (s.sa.left !== ins.left || s.sa.right !== ins.right || s.sa.top !== ins.top || s.locale !== loc || !s.prompt || !s.card) { fail(`${id} (${tag}) @ ${loc}: staging — insets in force and the prompt up: ` + JSON.stringify(s)); continue; }
        const geo = (what, g) => {
          // the law in force, read from the box itself: routed = no
          // transform AND right-anchored at the computed offset (12px +
          // the right inset); centred = the box's centre on the viewport's
          // AND not right-anchored. GH-668 S5 slice 2 (B-PL05): the prompt
          // is the kit .ob-prompt--routed — kit.css centres it with
          // left/right 0 + margin-inline auto (no transform), so the old
          // translateX(-50%) matrix is no longer the centred law's
          // signature; the centre-on-centre read is (Chrome reports used
          // px for left/right on both laws — those cannot tell them apart)
          const anchoredRight = Math.abs(g.vw - g.rightOff - g.prompt.r) <= 1;
          const centred = Math.abs((g.prompt.l + g.prompt.r) / 2 - g.vw / 2) <= 1;
          const routed = g.transform === 'none' && anchoredRight && Number.isFinite(g.bound);
          const lawOk = row.law === 'routed' ? routed : (centred && !anchoredRight);
          if (!lawOk) fail(`${id} (${tag}) @ ${loc} ${what}: the ${row.law.toUpperCase()} law must be in force at ${row.w}px (transform ${g.transform}, right-anchored ${anchoredRight}, centred ${centred}, max-width ${g.bound}): ` + JSON.stringify(g));
          if (g.overlap !== 0) fail(`${id} (${tag}) @ ${loc} ${what}: prompt ∩ card must be EMPTY (${g.overlap} px²): ` + JSON.stringify(g));
          if (g.prompt.l < g.sa.left - 0.5 || g.prompt.r > g.vw - g.sa.right + 0.5) fail(`${id} (${tag}) @ ${loc} ${what}: the prompt must sit inside the horizontal safe region: ` + JSON.stringify(g));
          if (row.law === 'routed' && routed && g.vw - g.rightOff - g.bound < g.card.r - 0.5) fail(`${id} (${tag}) @ ${loc} ${what}: the width BOUND must clear the card column: ` + JSON.stringify(g));
          if (g.btnIn !== true || g.hOverflow) fail(`${id} (${tag}) @ ${loc} ${what}: every answer button inside the prompt box, no horizontal overflow: ` + JSON.stringify(g));
          // GH-699: 44 pt is a pointer law — every coarse row, both laws
          if (row.ptr === 'coarse' && !(g.btnH >= 43.5)) fail(`${id} (${tag}) @ ${loc} ${what}: every answer button must be >= 44px tall on a coarse register (shortest ${g.btnH}px): ` + JSON.stringify(g));
          // GH-702: the routed top offset carries env(safe-area-inset-top)
          // — 12px + the inset, i.e. 2px above the card column's 14px datum
          if (row.law === 'routed' && (Math.abs(g.prompt.t - (12 + g.sa.top)) > 1 || g.cardsT === null || Math.abs(g.cardsT - 2 - g.prompt.t) > 1)) fail(`${id} (${tag}) @ ${loc} ${what}: the routed prompt's top must be 12px + env(top) = ${12 + g.sa.top}px, 2px above the card column (${g.cardsT}px); got ${g.prompt.t}px: ` + JSON.stringify(g));
          if (g.qpTop === null || g.qp?.vis !== 'visible' || g.qp.overlap !== 0) fail(`${id} (${tag}) @ ${loc} ${what}: prompt ∩ the VISIBLE quick-play stack must be EMPTY (bottom ${g.prompt.b} vs top ${g.qpTop}, ∩ ${g.qp?.overlap} px²): ` + JSON.stringify(g));
        };
        geo('native', s);
        const swapped = await swapLongest(cc);
        if (!swapped) { fail(`${id} (${tag}) @ ${loc}: staging — no decision.opt.* copy to measure`); continue; }
        await sleep(150);
        geo(`longest ${swapped.key} (${swapped.w} px text)`, await cc.eval(SA_PROBE));
        await restoreNative(cc);
      }
    }
    if (row.ptr === 'coarse') await setSafeAreaInsets(cc, ZERO);
  }
  if (fineC) { await gateErrors(fineC, errs, 'P2p-sa-W'); fineC.close(); }
  await armOk(c, errs, f4, 'P2p-sa-W OK: width table — 926×428 coarse, 1024×768 + 1180×820 coarse (iPad insets 24/20) + 1024×768 fine ROUTED (right-anchored, top 12px + env(top) = 2px above the card datum, bound clear of the card), 1366×1024 coarse + 1280×800 + 1440×900 fine CENTRED; every coarse answer button >= 44px (GH-699/GH-702); prompt ∩ card = ∅ and ∩ the visible quick-play stack = ∅, inside the safe region, buttons inside the box (native + longest copies, 7 locales, both inset states on the coarse rows)');
  c.close();
}

// ---- P2p-fold the fold-snap law on the phone register (GH-525 integrator
// 2026-09-05; combined review visual audit r1 finding 7 — the 844×390 body
// showed and truncated a readiness card's "Not yet playable" row at the
// fold). ui/foldsnap.js (the replays entries 24 / 25 law generalised):
// at rest the body's clip edge cuts NO atom (text line box / inline glyph)
// and ends ON a boundary, the first block whole; every scrolled stop the
// settle can land on (0, max, each both-edge-clean boundary) is visited
// and judged at BOTH clip edges; an arbitrary offset settles onto a stop;
// the end state is clean. The audited state is staged: the SYNTHETIC
// previewCatalog readiness card after the playable set, the rail panned to
// its end (its status + prerequisite rows continue below the fold). 844×390
// × 7 locales, 667×375 / 926×428 en. RED-PROVE: with the leaf switched off
// the budget layout must cut a glyph at rest or at the end (else the probe
// is blind) — the pre-fix tree fails the rest law on the auditor's frame.
{
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url('obshell=1&seed=1&u=fold'), { cdpPort: CDP_PORT + 10, width: 844, height: 390 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P2p-fold: phone boot never mounted play');
  else {
    const SEL = '[data-ob="play-body"]';
    const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
      prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
      provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
    const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const probe = () => c.eval(foldProbeJs(SEL));
    const goTo = async (y) => {
      await c.eval(`(() => { document.querySelector(${JSON.stringify(SEL)}).scrollTo({ top: ${y}, behavior: 'instant' }); return true; })()`);
      await raf2();
      return probe();
    };
    const stage = async () => {
      await c.eval(`(window.__play.previewCatalog(${FIX}), document.activeElement?.blur?.(), true)`);
      await sleep(250);
      await c.eval(`(() => { const b = document.querySelector(${JSON.stringify(SEL)}); if (b) b.scrollTop = 0;
        const r = document.querySelector('[data-ob="play-games"]'); if (r) r.scrollLeft = r.scrollWidth; return true; })()`);
      await raf2();
    };
    const leafOn = (on) => c.eval(`(() => { const h = document.querySelector(${JSON.stringify(SEL)}).__obFoldSnap; if (h) h.enabled = ${on ? 'true' : 'false'}; return !!h; })()`);
    const legs = [[844, 390, LOCALES_ALL], [667, 375, ['en']], [926, 428, ['en']]];
    for (const [w, h, locs] of legs) {
      await setPhoneMetrics(c, { width: w, height: h });
      await sleep(400);
      for (const loc of locs) {
        const tag = `P2p-fold ${w}x${h} ${loc}`;
        await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)})`);
        await sleep(300);
        await stage();
        const L = await probe();
        if (!L) { fail(`${tag}: no play body to judge`); continue; }
        if (L.vw !== w || L.vh !== h) fail(`${tag}: expected the ${w}x${h} register, got ${L.vw}x${L.vh}`);
        if (!L.leaf) fail(`${tag}: ui/foldsnap.js never armed the body (no __obFoldSnap handle)`);
        judgeRest(tag, L, fail);
        console.log(`${tag} FOLD: clip y ${L.clip.toFixed(2)} H ${L.H} overflow ${L.overflow}px nearest ${L.nearestBot.toFixed(2)}px peek ${L.peekPx == null ? '—' : L.peekPx.toFixed(1) + 'px'} --fs-h ${L.fsH ?? '—'} --fs-pad ${L.fsPad ?? '—'} atoms ${L.atoms} cut ${L.cutBot.length} stops ${L.stops ? L.stops.length : '—'}`);
        if (L.overflow <= 0.5 || !L.stops) continue;
        if (Math.abs(L.stops[0]) > 0.5) fail(`${tag}: the stop set must start at 0: ${JSON.stringify(L.stops)}`);
        if (Math.abs(L.stops[L.stops.length - 1] - L.max) > 0.5) fail(`${tag}: the stop set must end at max ${L.max.toFixed(1)} (the end pad makes it a stop): ${JSON.stringify(L.stops)}`);
        for (const y of L.stops) judgeEdges(tag, `stop ${y.toFixed(1)}`, await goTo(y), fail);
        await goTo(Math.max(0, L.max - 7)); // ARBITRARY: no stop names it → the settle lands on one
        const r = await c.eval(`document.querySelector(${JSON.stringify(SEL)}).__obFoldSnap.settle('instant')`);
        await raf2();
        const La = await probe();
        const dpr = await c.eval('devicePixelRatio');
        const J = judgeStop(L.stops, La.scrollTop);
        console.log(`${tag} SETTLE: ${stopFacts(J, dpr)} from ${String(r.from)} to ${String(r.to)}`);
        if (!J.on) fail(`${tag}: settle from ${r.from.toFixed(1)} landed at ${La.scrollTop.toFixed(1)} — not a stop ${JSON.stringify(L.stops)} ${stopFacts(J, dpr)} r.to ${String(r.to)}`);
        judgeEdges(tag, `settle ${r.from.toFixed(1)} → ${r.to.toFixed(1)}`, La, fail);
        judgeEdges(tag, 'end', await goTo(1e9), fail); // the end state, both edges clean
        console.log(`${tag} STOPS: n=${L.stops.length} [${L.stops.map((y) => y.toFixed(1)).join(', ')}] max ${L.max.toFixed(1)} H ${L.H}`);
        await goTo(0);
      }
    }
    // RED-PROVE at the auditor's register (844×390 en, the staged state)
    await setPhoneMetrics(c, { width: 844, height: 390 });
    await sleep(300);
    await c.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);
    await stage();
    if (!(await leafOn(false))) fail('P2p-fold RED-PROVE: no leaf handle to switch off');
    else {
      await raf2();
      const R0 = await probe();
      const Rend = await goTo(1e9);
      await leafOn(true);
      await raf2();
      await goTo(0);
      const cuts = (R0?.cutBot.length ?? 0) + (Rend?.cutTop.length ?? 0);
      console.log(`P2p-fold RED-PROVE: leaf off → rest clip y ${R0?.clip.toFixed(1)} cuts ${R0?.cutBot.length} ${JSON.stringify((R0?.cutBot ?? []).slice(0, 2))}; end top-edge cuts ${Rend?.cutTop.length} --fs-h ${R0?.fsH ?? '—'}`);
      if (!cuts) fail('P2p-fold RED-PROVE: with the leaf off the budget layout must cut a glyph at rest or at the end state (else the probe is blind)');
    }
  }
  await armOk(c, errs, f0, 'P2p-fold OK: the body\'s fold cuts no glyph at rest, ends on a boundary, first block whole; every stop / the settle / the end state clean at both edges — 844×390 × 7 locales, 667×375 + 926×428 en; the leaf-off red-prove cuts');
  c.close();
}

// ---- P-UPG delayed-leaf upgrade keeps focus (review code review fix round 1 P2-1)
// ui/cardrail.js is HELD at the network (CDP Fetch pause, never failed) past
// RAIL_LEAF_WAIT_MS so the rung-1 button register mounts first; focus is put
// on a fallback card that is NOT the current game; the leaf is released —
// the upgrade must re-seat focus on the same-id cardrail card, the browse
// highlight follows it, aria-current / the game / the blob are unchanged
// and the keyboard walk continues.
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url('obshell=1&seed=1&sw=0&u=railhold'), { port: CDP_PORT + 8, tool: false });
  watchErrors(c, errs);
  let held = null; // the paused cardrail request id
  // hold ONLY the second document's leaf request: the launch document
  // (u=railhold) may still have its own cardrail.js in flight when the
  // interception arms (a loaded box makes that first boot slow); holding
  // THAT request lets the railhold2 document's leaf through and the rail
  // mounts "while held" (the staging red of runs under load 60-130). Two
  // belts, neither header-dependent (the same-origin module Referer does
  // not carry the query): (1) the launch document is SETTLED until its own
  // rail has mounted, so no doc-1 leaf request can be in flight; (2) the
  // hold is armed only immediately before the railhold2 navigation.
  // (3) NO service worker on either document (`sw=0` = app.html's opt-out;
  // `Network.setBypassServiceWorker` = the CDP belt): once a worker is
  // active (a fast doc-1 dwell, which belt 1 lengthens) it serves
  // railhold2's cardrail.js from Cache Storage, which page-level Fetch
  // interception never sees — a real hole (r4 measured it on the seam arm
  // with a worker kept on the judged document: 0 refusals, the leaf served
  // from the cache), though NOT the observed cause of the run-5/7 shape
  // (see belt 0). The earlier note "this launcher sets no
  // --enable-automation, so navigator.webdriver is false and a real-user
  // boot REGISTERS sw.js" is RESTATED as superseded: r4 measured
  // navigator.webdriver TRUE under this launcher's CDP attach, so app.html's
  // opt-out (`sw !== '1' && navigator.webdriver`) already drops a plain
  // URL's worker (unregister + reload); the belt stands for a launcher
  // where it reads false (a real browser) and for the forced `sw=1` path.
  let armed = false;
  const seen = []; // every paused URL (diagnostic for the staging line)
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (seen.length < 12) seen.push((armed ? '+' : '-') + params.request.url.replace(/^.*\/app\//, ''));
    if (/\/app\/ui\/cardrail\.js(\?|$)/.test(params.request.url) && held === null && armed) {
      held = params.requestId; // hold it — released below
      return;
    }
    c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); // (see blockUrl)
  });
  // (0) THE hole (battery runs 5-7, probe-upg2 2026-09-09): Network.enable
  // must precede setCacheDisabled — without the renderer-side Network agent
  // the cache flag never reaches Blink, and the railhold2 document reuses
  // the launch document's cardrail.js from the renderer MemoryCache (same
  // process, same origin): no request exists for Fetch to pause, the rail
  // mounts, "nothing was held" (seen = []). Arm-exact probe: NOT intercepted
  // 2/2; with Network.enable first: intercepted. A loaded box (run 4) had
  // pruned the dead resource before doc 2 asked — the only reason it was green.
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  // (1) settle the launch document: its rail mounted = its leaf request done
  if (await waitReady(c) && await waitShell(c) && await waitPlay(c)) {
    for (let i = 0; i < 100 * SCALE; i++) {
      if (await c.eval(`!!document.querySelector('section[data-place="play"] .ob-cardrail-card')`).catch(() => false)) break;
      await sleep(100);
    }
  }
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cardrail.js*' }] });
  armed = true; // (2) from here every cardrail.js request belongs to railhold2
  await c.send('Page.navigate', { url: url('obshell=1&seed=1&sw=0&u=railhold2') });
  // (4) the navigation must COMMIT before any readiness read: belt (1)
  // leaves the launch document fully ready, so waitReady/waitShell/waitPlay
  // answer at once on doc 1 while the commit is still pending under load,
  // and s0 could be read from doc 1. Kept as a belt; the run-5/7 shape
  // itself was belt 0's MemoryCache reuse (s0.q already read railhold2).
  // A context torn down mid-poll reads as "not yet".
  let nav2 = false;
  for (let i = 0; i < 200 * SCALE && !nav2; i++) {
    nav2 = await c.eval(`location.search.includes('u=railhold2')`).catch(() => false);
    if (!nav2) await sleep(50);
  }
  if (!nav2) fail('P-UPG: staging — the railhold2 navigation never committed');
  else if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P-UPG: held-leaf boot never mounted play');
  else {
    const s0 = await c.eval(`(() => { const sec = document.querySelector('section[data-place="play"]');
      return { rail: !!sec.querySelector('.ob-cardrail-card'), n: sec.querySelectorAll('[data-ob="play-game"]').length,
        snooker: !!sec.querySelector('[data-ob="play-game"][data-game="snooker"]'),
        q: location.search, ready: document.readyState }; })()`);
    if (held === null) fail('P-UPG: staging — the cardrail request was never intercepted (nothing was held): ' + JSON.stringify({ seen, s0 }));
    if (s0.rail || s0.n < 2 || !s0.snooker) {
      fail('P-UPG: staging — the rung-1 register must be up while the leaf is held: ' + JSON.stringify(s0));
    }
    await c.eval(`document.querySelector('[data-ob="play-game"][data-game="snooker"]').focus()`);
    const f1 = await c.eval(`document.activeElement?.dataset?.game ?? null`);
    if (f1 !== 'snooker') fail('P-UPG: staging — focus did not land on the fallback snooker card: ' + f1);
    const b0 = await c.eval(SNAP);
    if (held !== null) await c.send('Fetch.continueRequest', { requestId: held }).catch(() => {}); // release the leaf
    let up = false;
    for (let i = 0; i < 60 * SCALE && !up; i++) {
      up = await c.eval(`!!document.querySelector('[data-ob="play-games"] .ob-cardrail-card')`);
      if (!up) await sleep(150);
    }
    if (!up) fail('P-UPG: the released leaf never upgraded the mount to the cardrail register');
    else {
      await sleep(400);
      const a = await c.eval(`(() => { const ae = document.activeElement;
        const rail = document.querySelector('[data-ob="play-games"]');
        return { tag: ae?.tagName ?? null, focus: ae?.dataset?.game ?? null,
          isCard: !!ae?.classList?.contains('ob-cardrail-card'), inRail: rail.contains(ae),
          selected: rail.querySelector('[aria-selected="true"]')?.dataset.game ?? null,
          current: rail.querySelector('[aria-current="true"]')?.dataset.game ?? null,
          game: __settings.get().game, confirm: !!document.querySelector('[data-ob="confirm"]'),
          open: __shell.isOpen() }; })()`);
      if (!a.inRail || !a.isCard || a.focus !== 'snooker' || a.selected !== 'snooker'
        || a.current !== 'nine_ball' || a.game !== 'nine_ball' || a.confirm || !a.open
        || await c.eval(SNAP) !== b0) {
        fail('P-UPG: after the upgrade focus must sit on the same-id cardrail card (highlight follows; current/game/blob unchanged; no confirm): '
          + JSON.stringify(a));
      }
      // the keyboard walk continues from the re-seated card
      await pressKey(c, 'ArrowRight');
      await sleep(200);
      const f2 = await c.eval(`(() => { const ae = document.activeElement;
        return { focus: ae?.dataset?.game ?? null, isCard: !!ae?.classList?.contains('ob-cardrail-card'),
          confirm: !!document.querySelector('[data-ob="confirm"]') }; })()`);
      if (!f2.isCard || f2.focus === 'snooker' || f2.focus === null || f2.confirm || await c.eval(SNAP) !== b0) {
        fail('P-UPG: an arrow key after the upgrade must keep browsing the rail (no confirm, blob unchanged): ' + JSON.stringify(f2));
      }
    }
  }
  await armOk(c, errs, f0, 'P-UPG OK: leaf held past the fallback, released ⇒ cardrail register with focus re-seated on the same card; walk continues');
  c.close();
}

// ---- P-E1 discipline pick under a pending decision (the e2e-shell E(d)
// idiom moved into the play lane; GH-541 class (c)) -------------------------
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(realUrl('seed=1&u=dec'), { port: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('P-E1: boot never became ready');
  else {
    // (a) PRISTINE carom rack + pending break_spot: the pick proceeds to the
    // confirm (pristine racks are exempt — the re-rack re-raises the same
    // fresh-address prompt); decline it
    await c.eval(`(() => {
      localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion' }));
      localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: false }));
      location.reload(); return true; })()`);
    await sleep(1200);
    if (!(await waitReady(c))) fail('P-E1: carom returning boot never ready');
    else {
      let pend = false;
      for (let i = 0; i < 40 * SCALE && !pend; i++) {
        pend = await c.eval(`window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`).catch(() => false);
        if (!pend) await sleep(250);
      }
      if (!pend) fail('P-E1: carom boot never raised the break_spot decision');
      for (let i = 0; i < 60 * SCALE; i++) { // the shell module lands after ready
        if (await c.eval('typeof window.__shell === "object"').catch(() => false)) break;
        await sleep(150);
      }
      const entry = await c.eval(`window.__shell?.isOpen?.() || window.__shell?.openShell?.() === true`);
      if (!entry) fail('P-E1: shell entry under a pending decision must be allowed (GH-541)');
      if (!(await waitPlay(c))) fail('P-E1: play never mounted on the carom boot');
      else {
        let prompted = false;
        for (let i = 0; i < 20 * SCALE && !prompted; i++) {
          prompted = await c.eval(`document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 2`);
          if (!prompted) await sleep(200);
        }
        if (!prompted) fail('P-E1: the in-shell decision prompt must be up');
        const pristine = await c.eval(`__settings.rackPristine()`);
        if (pristine !== true) fail('P-E1: staging expects a PRISTINE carom rack, got rackPristine=' + pristine);
        const b0 = await c.eval(SNAP);
        await c.eval(`window.__pe1 = window.__play.pick('nine_ball'); true`);
        let up = false;
        for (let i = 0; i < 40 * SCALE && !up; i++) {
          up = await c.eval(`!!document.querySelector('[data-ob="confirm"]')`);
          if (!up) await sleep(150);
        }
        const noteA = await c.eval(`document.getElementById('ob-shell-note')?.textContent ?? null`);
        if (!up || noteA) {
          fail('P-E1(a): a pick on a PRISTINE rack with a pending break_spot must reach the confirm (no refusal): '
            + JSON.stringify({ up, noteA }));
        } else {
          await pressKey(c, 'Escape');
          // #1154: judge on settled state. A main-thread stall across the
          // dialog's close kept it in the DOM past the old fixed 600 ms read
          // while the decline itself was done; wait (bounded: the last read
          // comes 20 x 150 ms x SCALE after the first) for the confirm to
          // leave, red by name if it never does, then judge the rack, the
          // shell and the prompt (and a confirm back in the DOM after it left)
          let gone = false;
          for (let i = 0; i <= 20 * SCALE && !gone; i++) {
            if (i) await sleep(150);
            gone = await c.eval(`!document.querySelector('[data-ob="confirm"]')`);
          }
          if (!gone) fail(`P-E1(a): the confirm never left the DOM within ${(3 * SCALE).toFixed(1)} s of the trusted Escape (#1154)`);
          const a = await c.eval(`(async () => ({ r: await window.__pe1, confirm: !!document.querySelector('[data-ob="confirm"]'),
            open: __shell.isOpen(), game: __settings.get().game,
            prompt: document.querySelectorAll('#ob-shell-decision .osd-btns button').length }))()`);
          if (a.r !== false || (gone && a.confirm) || !a.open || a.game !== 'carom_3cushion' || a.prompt !== 2
            || await c.eval(SNAP) !== b0) {
            fail('P-E1(a): declining the confirm must leave the carom rack, the shell and the prompt: ' + JSON.stringify(a));
          }
        }
      }
    }
    // (b) PROGRESSED 14.1 rack + pending break_violation (a weak opening
    // break, WPA 14.1 — the opponent's accept-table option): the pick is
    // REFUSED with the honest notice; the prompt stays answerable
    await c.eval(`(() => {
      localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'straight_pool' }));
      localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: false }));
      location.reload(); return true; })()`);
    await sleep(1200);
    if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P-E1(b): 14.1 returning boot never mounted play');
    else {
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
      let pend = null;
      for (const pw of [1.2, 1.0, 1.5]) {
        await c.eval('__test.rerack(1)');
        await sleep(300);
        const rej = await c.eval('__test.shoot({ power: ' + pw + ', phi: Math.PI / 2, a: 0, b: 0 })');
        if (rej) { fail('P-E1(b): staging shot refused: ' + rej); break; }
        if (!(await settleTable(c))) { fail('P-E1(b): staging shot never settled'); break; }
        pend = await c.eval(`window.__rules?.matchState?.()?.pendingDecision ?? null`);
        if (pend) break;
      }
      if (pend?.kind !== 'break_violation') fail('P-E1(b): the weak 14.1 break must pend break_violation: ' + JSON.stringify(pend));
      else {
        const reopened = await c.eval('__shell.openShell({})');
        if (reopened !== true) fail('P-E1(b): re-entry under the pending decision must open');
        await sleep(500);
        const st = await c.eval(`({ pristine: __settings.rackPristine(), dp: true,
          prompt: document.querySelectorAll('#ob-shell-decision .osd-btns button').length })`);
        if (st.pristine !== false || st.prompt !== 2) fail('P-E1(b): staging expects a progressed rack + in-shell prompt: ' + JSON.stringify(st));
        const b0 = await c.eval(SNAP);
        const r = await c.eval(`(async () => { const r = await window.__play.pick('nine_ball'); await new Promise((f) => setTimeout(f, 200));
          return { r, confirm: !!document.querySelector('[data-ob="confirm"]'),
            note: document.getElementById('ob-shell-note')?.textContent ?? null,
            exp: window.__i18n.t('shell.notice.decision'), open: __shell.isOpen(), game: __settings.get().game,
            prompt: document.querySelectorAll('#ob-shell-decision .osd-btns button').length,
            pend: window.__rules.matchState()?.pendingDecision?.kind ?? null }; })()`);
        if (r.r !== false || r.confirm || r.note !== r.exp || !r.open || r.game !== 'straight_pool'
          || r.prompt !== 2 || r.pend !== 'break_violation' || await c.eval(SNAP) !== b0) {
          fail('P-E1(b): a pick on a PROGRESSED rack under a pending decision must be refused with the notice, prompt intact: '
            + JSON.stringify(r));
        }
        // the prompt is still answerable
        const ans = await c.eval(`(() => { const b = document.querySelector('#ob-shell-decision .osd-btns button');
          if (!b) return { clicked: false }; b.click();
          return { clicked: true, pend: window.__rules.matchState()?.pendingDecision ?? null,
            gone: !document.getElementById('ob-shell-decision'), open: __shell.isOpen() }; })()`);
        if (!ans.clicked || ans.pend !== null || !ans.gone || !ans.open) {
          fail('P-E1(b): the decision prompt must stay answerable through the shell: ' + JSON.stringify(ans));
        }
      }
      // (c) GH-1062: a CARRIED fold is progressed. The 7.3(b) re-break
      // (choice 2) re-deals the fifteen at shot 0 but restores the match
      // fold (the −2 stands), so a pending option there must refuse the pick
      // like (b), never reach the confirm (RED pre-fix: rackPristine read the
      // shot-0 rack as pristine). The re-break is the real 7.3(b)
      // consequence; the option on the carried rack is staged through the
      // seam (a real one needs another stroke, which un-carries the rack).
      let pendC = null;
      for (const pw of [1.2, 1.0, 1.5]) {
        await c.eval('__test.rerack(1)');
        await sleep(300);
        const rej = await c.eval('__test.shoot({ power: ' + pw + ', phi: Math.PI / 2, a: 0, b: 0 })');
        if (rej) { fail('P-E1(c): staging shot refused: ' + rej); break; }
        if (!(await settleTable(c))) { fail('P-E1(c): staging shot never settled'); break; }
        pendC = await c.eval(`window.__rules?.matchState?.()?.pendingDecision ?? null`);
        if (pendC) break;
      }
      if (pendC?.kind !== 'break_violation') fail('P-E1(c): the weak 14.1 break must pend break_violation: ' + JSON.stringify(pendC));
      else {
        const carried = await c.eval(`(() => { const ok = window.__rules.decide('break_violation', 2);
          const m = window.__rules.matchState();
          return { ok, phase: m?.phase, scores: m?.scores, pristine: __settings.rackPristine() }; })()`);
        if (carried.ok !== true || carried.phase !== 'break' || carried.pristine !== false) {
          fail('P-E1(c): the 7.3(b) re-break must carry the fold and read NOT pristine: ' + JSON.stringify(carried));
        } else {
          await c.eval(`window.__rules.setMatchState({ pendingDecision: { kind: 'break_violation', chooser: 2 } })`);
          if (!(await c.eval('__shell.isOpen()'))) await c.eval('__shell.openShell({})');
          await sleep(500);
          const r = await c.eval(`(async () => { const r = await window.__play.pick('nine_ball'); await new Promise((f) => setTimeout(f, 200));
            return { r, confirm: !!document.querySelector('[data-ob="confirm"]'),
              note: document.getElementById('ob-shell-note')?.textContent ?? null,
              exp: window.__i18n.t('shell.notice.decision'), game: __settings.get().game,
              scores: window.__rules.matchState()?.scores }; })()`);
          if (r.r !== false || r.confirm || r.note !== r.exp || r.game !== 'straight_pool'
            || JSON.stringify(r.scores) !== JSON.stringify(carried.scores)) {
            fail('P-E1(c) GH-1062: a pick under a pending decision on a CARRIED rack must be refused with the notice: '
              + JSON.stringify(r));
          }
          if (r.confirm) await pressKey(c, 'Escape');
          await c.eval(`window.__rules.setMatchState({ pendingDecision: null })`);
        }
      }
    }
  }
  await armOk(c, errs, f0, 'P-E1 OK: pristine pick reaches the confirm; progressed and carried (GH-1062) picks refused with the notice, prompt answerable');
  c.close();
}

// ---- P-E2 mode→play under a pending decision (FR-014 place-side gate) ------
// STAGING NOTE (034a-front, probe 2026-09-05): the playground conversion
// SUSPENDS the rules fold — `matchState().pendingDecision` is null inside
// playground even after a stroke and `setMatchState` cannot re-arm it — and
// a PROGRESSED pending state cannot enter playground at all (settings.js
// changeMode: decisionConflict refuses). The literal "playground + pending
// decision on a progressed rack" state is therefore unreachable on this
// tree; this arm asserts that refusal (the reason) and proves the SAME
// place-side gate on the `practice` leg, where the fold survives the mode
// switch: `[data-ob="play-back"]` visible, `__play.back()` refused with
// `shell.notice.decision`, the prompt survives, mode unchanged. The direct
// `__settings.changeMode('play')` API leg is 034a-mig T024b (3).
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(realUrl('seed=1&u=dec2'), { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('P-E2: boot never became ready');
  else {
    await c.eval(`(() => {
      localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'straight_pool' }));
      localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: false }));
      location.reload(); return true; })()`);
    await sleep(1200);
    if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P-E2: 14.1 returning boot never mounted play');
    else {
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
      let pend = null;
      for (const pw of [1.2, 1.0, 1.5]) {
        await c.eval('__test.rerack(1)');
        await sleep(300);
        const rej = await c.eval('__test.shoot({ power: ' + pw + ', phi: Math.PI / 2, a: 0, b: 0 })');
        if (rej) { fail('P-E2: staging shot refused: ' + rej); break; }
        if (!(await settleTable(c))) { fail('P-E2: staging shot never settled'); break; }
        pend = await c.eval(`window.__rules?.matchState?.()?.pendingDecision ?? null`);
        if (pend) break;
      }
      if (pend?.kind !== 'break_violation') fail('P-E2: the weak 14.1 break must pend break_violation: ' + JSON.stringify(pend));
      else {
        // the reason the playground leg is unreachable: a progressed pending
        // state cannot convert to playground (settings.js decisionConflict)
        const pg = await c.eval(`({ ok: __settings.changeMode('playground'), mode: __settings.get().mode,
          pend: window.__rules.matchState()?.pendingDecision?.kind ?? null })`);
        if (pg.ok !== false || pg.mode !== 'play' || pg.pend !== 'break_violation') {
          fail('P-E2: changeMode(playground) under a progressed pending decision must be refused (decisionConflict): '
            + JSON.stringify(pg));
        }
        // practice keeps the fold: the back leg is visible and the place gate refuses
        const pr = await c.eval(`({ ok: __settings.changeMode('practice'), mode: __settings.get().mode,
          pend: window.__rules.matchState()?.pendingDecision?.kind ?? null, pristine: __settings.rackPristine() })`);
        if (pr.ok !== true || pr.mode !== 'practice' || pr.pend !== 'break_violation' || pr.pristine !== false) {
          fail('P-E2: practice staging (mode practice, progressed, pending) failed: ' + JSON.stringify(pr));
        }
        // 034a-mig T024b (3) — the direct-API leg of the GH-541 guards (T008):
        // under the progressed pending decision `changeGame` refuses at the
        // API itself (skipConfirm never bypasses decisionConflict; the state
        // stays byte-identical — game, mode, prompt) and `changeMode('play')`
        // from PRACTICE proceeds (practice → play never re-racks; the guard is
        // the playground twin) with the fold intact. The playground → play
        // guard's natural state is unreachable on this tree (tasks §10 entry
        // 17); its shape is proven below on a scripted matchState stand-in.
        const apiA = await c.eval(`(async () => { const b = JSON.stringify(__settings.get());
          const ok = await __settings.changeGame('nine_ball', { skipConfirm: true });
          return { ok, same: JSON.stringify(__settings.get()) === b, mode: __settings.get().mode,
            game: __settings.get().game, pend: window.__rules.matchState()?.pendingDecision?.kind ?? null }; })()`);
        if (apiA.ok !== false || !apiA.same || apiA.game !== 'straight_pool' || apiA.mode !== 'practice'
          || apiA.pend !== 'break_violation') {
          fail('P-E2(api): changeGame(skipConfirm) under a progressed pending decision must be refused (T008): '
            + JSON.stringify(apiA));
        }
        const apiB = await c.eval(`(() => { const ok = __settings.changeMode('play');
          const back = __settings.changeMode('practice');
          return { ok, back, mode: __settings.get().mode, pend: window.__rules.matchState()?.pendingDecision?.kind ?? null }; })()`);
        if (apiB.ok !== true || apiB.back !== true || apiB.mode !== 'practice' || apiB.pend !== 'break_violation') {
          fail('P-E2(api): practice → play → practice under the pending decision must proceed with the fold intact: '
            + JSON.stringify(apiB));
        }
        const reopened = await c.eval('__shell.openShell({})');
        if (reopened !== true) fail('P-E2: re-entry under the pending decision must open');
        await sleep(500);
        const b0 = await c.eval(SNAP);
        const r = await c.eval(`(() => { const back = document.querySelector('[data-ob="play-back"]');
          const hidden = back.hidden; const ok = window.__play.back();
          return { hidden, ok, mode: __settings.get().mode, open: __shell.isOpen(),
            note: document.getElementById('ob-shell-note')?.textContent ?? null,
            exp: window.__i18n.t('shell.notice.decision'),
            prompt: document.querySelectorAll('#ob-shell-decision .osd-btns button').length,
            pend: window.__rules.matchState()?.pendingDecision?.kind ?? null }; })()`);
        if (r.hidden || r.ok !== false || r.mode !== 'practice' || !r.open || r.note !== r.exp
          || r.prompt !== 2 || r.pend !== 'break_violation' || await c.eval(SNAP) !== b0) {
          fail('P-E2: back() under a progressed pending decision must be refused with the notice, prompt intact: '
            + JSON.stringify(r));
        }
        // resolve through the prompt ⇒ back() proceeds (shell stays: practice→play never re-racks)
        const after = await c.eval(`(() => { document.querySelector('#ob-shell-decision .osd-btns button')?.click();
          const ok = window.__play.back(); return { ok, mode: __settings.get().mode, open: __shell.isOpen(),
            pend: window.__rules.matchState()?.pendingDecision ?? null }; })()`);
        if (after.ok !== true || after.mode !== 'play' || !after.open || after.pend !== null) {
          fail('P-E2: after resolving the decision back() must proceed and the shell stay open: ' + JSON.stringify(after));
        }
        // playground → play guard (T008, scripted stand-in): enter the sandbox on
        // the now-decision-free progressed rack, then a matchState stand-in
        // reports a pending decision — changeMode('play') must refuse (mode
        // stays playground, no re-rack, shell open); restoring the real read
        // lets the same call proceed (re-rack + GH-121 auto-close).
        const pgApi = await c.eval(`(async () => {
          const entered = __settings.changeMode('playground');
          const real = window.__rules.matchState;
          window.__rules.matchState = () => ({ ...(real.call(window.__rules) ?? {}), pendingDecision: { kind: 'stand_in' } });
          const pristine = __settings.rackPristine();
          const shot0 = __test.bed?.().shotIndex ?? null;
          const refused = __settings.changeMode('play');
          const mid = { mode: __settings.get().mode, open: __shell.isOpen(), shot: __test.bed?.().shotIndex ?? null };
          window.__rules.matchState = real;
          const ok = __settings.changeMode('play');
          await new Promise((r) => setTimeout(r, 400));
          return { entered, pristine, shot0, refused, mid, ok, mode: __settings.get().mode }; })()`);
        if (pgApi.entered !== true || pgApi.pristine !== false || pgApi.refused !== false
          || pgApi.mid.mode !== 'playground' || !pgApi.mid.open || pgApi.mid.shot !== pgApi.shot0
          || pgApi.ok !== true || pgApi.mode !== 'play') {
          fail('P-E2(api): playground → play under a pending decision (stand-in) must be refused by changeMode itself (T008): '
            + JSON.stringify(pgApi));
        }
      }
    }
  }
  await armOk(c, errs, f0, 'P-E2 OK: place-side gate refuses back() under a progressed pending decision (practice leg; playground provably unreachable); API legs: changeGame refused, practice↔play proceeds, playground→play refused on the stand-in (T008)');
  c.close();
}

// ---- P-RL shared-replay lock (contract §4 law 1; e2e-variants V4 staging) --
// The shell REFUSES entry while a shared replay is live-and-not-done (FR-016,
// shell.js sharedReplayLive) — so the lock is observed at play once
// `replay().done === true`, which is exactly the leg review round 2 P1-3
// demanded: `done` never clears `replay.active`, the lock is HELD, and only
// `__share.exit()` (active ⇒ false) lifts it.
{
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(realUrl('seed=1&u=rl'), { port: CDP_PORT + 7, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('P-RL: boot never became ready');
  else {
    await c.eval(`(() => {
      localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'nine_ball' }));
      localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true }));
      location.reload(); return true; })()`);
    await sleep(1000);
    if (!(await waitReady(c))) fail('P-RL: table boot never ready');
    else {
      // organic recording: two strokes on a fresh rack, then encode
      await c.eval('__test.rerack(1)');
      await sleep(300);
      for (const p of [{ power: 6, phi: Math.PI / 2, a: 0, b: -0.1 }, { power: 2, phi: 1.0, a: 0, b: 0 }]) {
        const rej = await c.eval(`__test.shoot(${JSON.stringify(p)})`);
        if (rej) { fail('P-RL: recording stroke refused: ' + rej); break; }
        const st = await settleTable(c);
        if (!st) { fail('P-RL: recording stroke never settled'); break; }
        if (st === 'BALL_IN_HAND') await c.eval('__test.placeCue(0, -0.6)');
      }
      const share = await c.eval('__share.encode()');
      const at = typeof share === 'string' ? share.indexOf('#r=') : -1;
      if (at < 0) fail('P-RL: __share.encode() produced no #r= link: ' + JSON.stringify(share));
      else {
        const hash = share.slice(at + 3);
        await c.send('Page.navigate', { url: realUrl('u=rl2') + '#r=' + hash });
        await sleep(800);
        if (!(await waitReady(c))) fail('P-RL: replay session never became ready');
        let active = false;
        for (let i = 0; i < 60 * SCALE && !active; i++) {
          active = await c.eval('__share.replay().active === true').catch(() => false);
          if (!active) await sleep(250);
        }
        if (!active) fail('P-RL: the shared replay never became active');
        // entry refusal while live-and-not-done (if playback is still running)
        const live = await c.eval(`(() => { const r = __share.replay(); return r.active && r.done !== true; })()`);
        if (live) {
          const o = await c.eval(`({ ok: window.__shell?.openShell?.({}) ?? null, open: window.__shell?.isOpen?.() ?? null })`);
          if (o.ok !== false || o.open !== false) fail('P-RL: the shell must refuse entry while the replay is live: ' + JSON.stringify(o));
        }
        let done = false;
        for (let i = 0; i < 600 * SCALE && !done; i++) {
          done = await c.eval('__share.replay().done === true').catch(() => false);
          if (!done) await sleep(300);
        }
        if (!done) fail('P-RL: the shared replay never reached done');
        else {
          const r0 = await c.eval('__share.replay()');
          if (r0.active !== true) fail('P-RL: done must NOT clear replay.active (review r2 P1-3): ' + JSON.stringify(r0));
          const opened = await c.eval(`window.__shell?.openShell?.({ place: 'play' }) ?? null`);
          if (opened !== true) fail('P-RL: the shell must open at done (sharedReplayLive false): ' + opened);
          else if (!(await waitPlay(c))) fail('P-RL: play never mounted under the done replay');
          else {
            await c.eval('__shell.go("play"), true');
            await sleep(400);
            const s = await c.eval(`(() => {
              const sec = document.querySelector('section[data-place="play"]');
              const ctrls = [...sec.querySelectorAll('[data-ob="play-game"], [data-variant-pick], [data-ob="play-back"], [data-ob="play-carom2b"] input')];
              return { locked: window.__play.registry().locked, n: ctrls.length,
                allDisabled: ctrls.every((n) => n.getAttribute('aria-disabled') === 'true'),
                focusable: ctrls.filter((n) => n.dataset.ob === 'play-game').some((n) => n.tabIndex === 0) }; })()`);
            if (s.locked !== true || s.n < 1 || !s.allDisabled || !s.focusable) {
              fail('P-RL: under the held lock every commit control must be aria-disabled (browsing live): ' + JSON.stringify(s));
            }
            const b0 = await c.eval(BLOBS);
            const pk = await c.eval(`(async () => { const r = await window.__play.pick('ten_ball');
              await new Promise((f) => setTimeout(f, 300));
              return { r, confirm: !!document.querySelector('[data-ob="confirm"]'),
                v: window.__play.pickVariant('apa-8ball'), b: window.__play.back(),
                game: window.__settings.get().game, replayGame: __share.replay().game }; })()`);
            if (pk.r !== false || pk.confirm || pk.v !== false || pk.b !== false || await c.eval(BLOBS) !== b0) {
              fail('P-RL: pick/pickVariant/back must return false before any __settings call (no confirm, blobs identical): '
                + JSON.stringify(pk));
            }
            // unlock ONLY through exit (active ⇒ false)
            await c.eval('__share.exit(), true');
            let cleared = false;
            for (let i = 0; i < 60 * SCALE && !cleared; i++) {
              cleared = await c.eval('__share.replay().active === false').catch(() => false);
              if (!cleared) await sleep(250);
            }
            if (!cleared) fail('P-RL: __share.exit() must clear replay.active');
            await sleep(500);
            if (!(await c.eval('__shell.isOpen()'))) {
              const re = await c.eval(`__shell.openShell({ place: 'play' })`);
              if (re !== true) fail('P-RL: the shell must re-open after the replay exit: ' + re);
              await sleep(400);
            }
            await c.eval('window.__play.refresh(), true');
            const u = await c.eval(`(() => {
              const cards = [...document.querySelectorAll('[data-ob="play-game"][data-playable="true"]')];
              return { locked: window.__play.registry().locked,
                enabled: cards.length > 0 && cards.every((n) => n.getAttribute('aria-disabled') === 'false') }; })()`);
            if (u.locked !== false || !u.enabled) fail('P-RL: after exit the lock must lift and the controls re-enable: ' + JSON.stringify(u));
          }
        }
      }
    }
  }
  await armOk(c, errs, f0, 'P-RL OK: replay lock held at done (controls aria-disabled, pick/back refused, blobs identical); exit lifts it');
  c.close();
}

// ---- P-KIT the kit .ob-card-option part on both card registers (GH-668 S5
// slice 3 G1; web/tools/e2e-play-kit.mjs — the LAST arm: it re-uses the +0
// desktop and +4 phone slots their owners closed above) --------------------
{
  const f0 = failCount;
  await armPKit({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-KIT OK: cards + variant picks are the kit part (radius / solid rung / no glow / text-1 hint / composed focus ring / hover + active / static sheet)');
  else console.log(`P-KIT RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-FORK the carom second-ball fork copy split (GH-668 S5 slice 3 G2,
// B-PL01; web/tools/e2e-play-fork.mjs — after P-KIT on the same +0 / +4
// slots: pill segments in 7 locales at both columns, one text line box per
// segment, equal widths, the kit .ob-hint qualifier line wired by
// aria-describedby) -------------------------------------------------------
{
  const f0 = failCount;
  await armPFork({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-FORK OK: the fork paints pill segments (nouns) + one hint line in every locale at 1440 and 844 (no stack, one line box, equal widths, aria-describedby resolved)');
  else console.log(`P-FORK RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-RESERVE the phone budget on the published shell reserve + the rail
// peek law (GH-668 S5 slice 3 G3, B-PL02 / B-K04 / B-K18; web/tools/
// e2e-play-reserve.mjs — after P-FORK on the same +0 / +4 slots: the cap
// inside bands().reserve.bottom and following a live 844→667 resize, the
// body budget >= 160 (view 160 / 144), the first card's head in the clean
// band, --sf-slot honoured, rail-k / -n published, no peek < 32) ----------
{
  const f0 = failCount;
  await armPReserve({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-RESERVE OK: the cap consumes --ob-shell-reserve-b (follows a live resize), body budget >= 160 at 844 / 667, first card head in the clean band, kit peek slot (--sf-slot, rail-k / -n, neighbour >= 32 px) on the phone, fixed 168 slot on desktop');
  else console.log(`P-RESERVE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-STALE-SHELL + P-NOTCH-FALLBACK the mixed-cache pairing: the fresh
// play.css over a DERIVED pre-B-K05 shell.js served at the network keeps
// the pre-seam caps (the publish-marker gate) and the long-posed content
// clear of the quick-play / rail band; the coarse fallback carries its
// safe-area-bottom term under the notch profile (GH-668 S5 play r4, review
// r3 F1 / F2; web/tools/e2e-play-stale.mjs — after P-RESERVE on the same
// +0 / +4 slots; RED on c25b6487 in every stale cell, GREEN ×3 on the fix)
{
  const f0 = failCount;
  await armPStaleShell({ PORT, CDP_PORT, fail, webDir });
  if (failCount !== f0) console.log(`P-STALE-SHELL / P-NOTCH-FALLBACK: ${failCount - f0} failure line(s) above (the arm printed its own verdict lines)`);
}

// ---- P-STALE-KIT-STATES the mixed-cache pairing FRESH play.js + play.css
// over a DERIVED pre-part kit.css served at the network (GH-668 S5 play r5,
// review r4 F1 + the census (a); web/tools/e2e-play-stale-kit.mjs — after
// P-STALE-SHELL on the same +0 / +4 slots): the host publishes the
// part-fallback marker, the aria-current pick is visibly distinct (and moves
// with pickVariant), the committed card wears the current face under a live
// playable browse, the locked picks dim to 0.38; the fresh pairing carries
// no marker. RED on 37a46b30, GREEN ×3 on the fix.
{
  const f0 = failCount;
  await armPStaleKitStates({ PORT, CDP_PORT, fail, webDir });
  if (failCount !== f0) console.log(`P-STALE-KIT-STATES: ${failCount - f0} failure line(s) above (the arm printed its own verdict line)`);
}

// ---- P-CARD the card copy budget + the Details expander (GH-668 S5 slice
// 3 G4, B-PL04 OWNER Q2 default A with the answer-B switch, B-PL09 line,
// B-PL02 whole-card gate; web/tools/e2e-play-card.mjs — after P-RESERVE on
// the same +0 / +4 slots: every card at the kit reserve (≤ 97, uniform ± 1,
// content ≤ 88) ×7 locales at 1440 and 844, issuer hint + Intl edition meta,
// ?obcite=full renders the S4 line, Details toggles by click / Enter with
// the raw edition + sections, follows a browse, writes nothing) ----------
{
  const f0 = failCount;
  await armPCard({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-CARD OK: rail cards at the kit --card reserve (uniform, ≤ 97, content ≤ 88) in 7 locales at 1440 and 844; issuer hint + Intl edition meta (no citation string / ISO date); ?obcite=full + previewCitation render answer B; Details ghost row toggles (click + Enter), carries the raw edition + sections, follows a browse, writes nothing');
  else console.log(`P-CARD RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-DETAILS-INK the EXPANDED Details body's ink + backing (GH-668 S5
// play review review r2, P2-2 + the fix check's follow-through;
// web/tools/e2e-play-details-ink.mjs — after P-CARD on the same +0 / +4
// slots; the scene posed LIGHT through the real clothColor / brightness /
// fixture seams, on the boot ORBIT frame and the TOP-DOWN frame
// (__test.setCamera('top'))): the body computes --ob-text-1 (the hint role
// on the section's smoke — DESIGN G7 ground law), wears the kit
// `.ob-mat-solid` strip (the carom fork's register; RED on d9345ecd: 2.83:1
// on glass over the bright cloth) and every painted citation / sections /
// prerequisites run keeps ≥ 4.5:1 against its RENDERED ground by the
// kit-laws A2 method — glass + solid × en / de × 1440 / 844 × 2 frames ------
{
  const f0 = failCount;
  await armPDetailsInk({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-DETAILS-INK OK: expanded Details body in --ob-text-1 on the kit .ob-mat-solid strip, every citation / sections / prerequisites run ≥ 4.5:1 (A2 ground) over the light scene on the orbit + top-down frames, glass + solid, en / de, 1440 + 844');
  else console.log(`P-DETAILS-INK RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-ONCE said-once (R7) + the readiness card copy + the h3 caps role
// (GH-668 S5 slice 3 G5, B-PL06 / B-PL07 / B-K24; web/tools/e2e-play-once.mjs
// — after P-CARD on the same +0 / +4 slots: the summary hidden under the
// host but still the S1 composition, the game name painted once, every h3
// .ob-caps with the kit tracking, a one-row variant list hidden, the
// readiness fixture = badge + kit register with prerequisites in Details) --
{
  const f0 = failCount;
  await armPOnce({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-ONCE OK: summary display:none (text = the S1 composition), the current game named once (the card), h3s wear .ob-caps with --ob-track-caps (CJK arm drops it), a list of one hides, the readiness card = one badge + 0.38 register at the card reserve with prerequisites in Details — 1440 + 844, en / de / ja');
  else console.log(`P-ONCE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-ONCE-DEGRADE the said-once rule on the DEGRADED registers (GH-668
// S5 play review review r2, P2-1; web/tools/e2e-play-once-
// degrade.mjs — after P-ONCE on the same +0 / +4 slots; every pose staged at
// the network on a second document): a stale settings module (no
// variantRows), the catalog import failing, the fail-closed snooker chain
// (one offered row) each paint the ACTIVE preset exactly ONCE — the compact
// Rules line in [data-ob="play-summary"] (kit --ob-fs--1 / --ob-text-1, the
// Game line hidden, FR-004 text intact); the normal two-row register keeps
// R7 (summary display:none, the picker row says it); nothing to name keeps
// the summary hidden; the game's name is painted once (the card) throughout
{
  const f0 = failCount;
  await armPOnceDegrade({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-ONCE-DEGRADE OK: stale settings / no catalog / degraded snooker / unlabelled lone row ⇒ ONE compact current-preset line (summary Rules line, kit fs-1 / text-1, Game line hidden, S1 text intact; the unlabelled row says its id); normal register ⇒ summary display:none beside the two-row picker (R7); nine_ball ⇒ hidden; game name once — 1440 + 844, en (+ de sync)');
  else console.log(`P-ONCE-DEGRADE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-BROWSE browse ≠ selection (GH-668 S5 play verifier fix round 1,
// F2; web/tools/e2e-play-browse.mjs — after P-ONCE on the same +0 / +4
// slots): a READINESS card is browsed through the data-ob-browsed marker
// (never selected), the browse survives ob:settings / ob:capability / a
// locale sync (no snap back, focus kept, card whole), Enter on it does
// nothing but keep the readiness copy in Details, click / tap browse it, a
// playable browse rides aria-selected and survives a sync too, blob unchanged
{
  const f0 = failCount;
  await armPBrowse({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-BROWSE OK: readiness card browsed via data-ob-browsed (aria-selected stays on the committed card), browse survives ob:settings / ob:capability / locale sync (scrollLeft + focus kept, card whole), Enter = no commit / no confirm, click + tap browse, playable browse (aria-selected) survives a sync, blob unchanged');
  else console.log(`P-BROWSE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-BROWSE-SYNC the KEEP LAW (GH-668 S5 play r5, review r4 F2 + the
// census (b); e2e-play-browse.mjs armPBrowseSync — after P-BROWSE on the
// same +0 / +4 slots): ArrowRight → End leaves the leaf's selection on the
// browsed playable card while the readiness card is browsed; every sync path
// (__play.refresh, a locale repaint, ob:settings / ob:capability /
// ob:perftier, a shell exit + re-enter) keeps the browsed card whole inside
// the rail viewport, the scroll unchanged (in-place syncs), the leaf's
// aria-selected unchanged, Details bound to it. RED on 37a46b30 (re-snap to
// the committed card, whole 1 → 0), GREEN ×3 on the fix. 1024x768 + 844x390.
{
  const f0 = failCount;
  await armPBrowseSync({ PORT, CDP_PORT, fail });
  if (failCount === f0) console.log('P-BROWSE-SYNC OK: after ArrowRight → End every sync (refresh, locale, ob:settings / capability / perftier, shell exit + re-enter) keeps the browsed readiness card whole in the rail viewport, scroll + aria-selected unchanged, Details bound — 1024 and 844');
  else console.log(`P-BROWSE-SYNC RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-BROWSE-FALLBACK the P-BROWSE law on the rung-1 button register
// (GH-668 S5 play review review r1, P2-1; web/tools/
// e2e-play-browse-fallback.mjs — after P-BROWSE on the same +0 / +4 slots,
// ui/cardrail.js BLOCKED at the network): arrows / Home / End / focus /
// click / tap browse through the ONE browseTo() — the readiness marker, the
// mirrored aria-selected, the Details body naming the BROWSED game's
// rulebook (a readiness card's prerequisites) — a sync never reverts it,
// Enter commits nothing, blob unchanged; the register carries the leaf's
// ARIA pair (mount role=listbox, card role=option — review r1 checker P3,
// merge round) at boot / after the fixture rebuild / after its retirement
{
  const f0 = failCount;
  await armPBrowseFallback({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-BROWSE-FALLBACK OK: cardrail blocked ⇒ the rung-1 register (role=listbox / role=option) browses (End / ArrowLeft / ArrowRight / Home / click / tap): readiness marker + committed aria-selected, playable browse rides aria-selected, Details names the browsed rulebook / prerequisites, survives ob:settings / locale / ob:capability, Enter = no commit, blob unchanged — 1440 + 844');
  else console.log(`P-BROWSE-FALLBACK RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-FORK-LOCALE the carom copy guard under a MIXED dictionary cache
// (GH-668 S5 play review review r1, P2-2; web/tools/
// e2e-play-fork-locale.mjs — after P-BROWSE-FALLBACK on the same +0 / +4
// slots; one dictionary served STALE at the network through CDP Fetch):
// de (fresh) over a stale en → the switch to en paints the retained legacy
// labels, no raw key, hint hidden, describedby consistent, missing() clean;
// back to de splits again; the reverse mix (stale de over a fresh en) boots
// with the de legacy labels, never the English nouns
{
  const f0 = failCount;
  await armPForkLocale({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-FORK-LOCALE OK: the carom guard follows the ACTIVE dictionary on every locale change — stale en: legacy labels / no raw key / hint hidden / no missing key; fresh de: nouns + hint + describedby; reverse mix (stale de): de legacy labels, never English nouns — 1440 (+ reverse) and 844');
  else console.log(`P-FORK-LOCALE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-STALE-DICT the mixed-dictionary pairing (GH-668 S5 play r6, review
// review r5 F1 + the round-6 census (a); web/tools/e2e-play-stale-dict.mjs —
// after P-FORK-LOCALE on the same +0 / +4 slots; the ACTIVE dictionary served
// STALE at the network = the current <loc>.json minus the five lane keys,
// en fresh): every lane-gated feature hidden — the Details toggle (no
// data-i18n label), its body, the fork hint (the fork on the legacy
// register) — zero English lane copy, zero missing-key warnings, at boot and
// after a live repaint; the fresh pairing shows the locale's own copy
{
  const f0 = failCount;
  await armPStaleDict({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-STALE-DICT OK: under a stale ACTIVE dictionary (ja / de / ko / fr / es / zh-CN at 1024, ja at 844) the Details toggle + body + fork hint are hidden, no data-i18n on the lane label, the fork on the legacy register, zero English lane copy, zero missing-key warnings — at boot and after en → stale repaint; the fresh pairing shows the locale\'s own Details / Sections / hint');
  else console.log(`P-STALE-DICT RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-FOCUS-BROWSE the common browse-state contract (GH-668 S5 play r6,
// review review r5 F2 + the round-6 census (b); web/tools/
// e2e-play-focus-browse.mjs — after P-STALE-DICT on the same +0 / +4 slots):
// focus on ANY card in EITHER rail mode routes through browseTo — the held
// (pending) leaf's all-tabbable rung-1 register under Tab / Shift+Tab /
// focus() / End, and the leaf register under End → Shift+Tab, ArrowRight →
// End → Shift+Tab, End → ArrowLeft: focus, aria-selected / the marker and
// the Details body agree at every step, the blob byte-unchanged
{
  const f0 = failCount;
  await armPFocusBrowse({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-FOCUS-BROWSE OK: focus on any card routes through browseTo on both registers — pending-leaf rung-1: Tab / Tab / Shift+Tab / focus() / Tab / Shift+Tab / Tab / End; leaf: End → Shift+Tab, ArrowRight → End → Shift+Tab, End → ArrowLeft — Details + aria-selected / marker follow focus, blob unchanged (1024 + 844)');
  else console.log(`P-FOCUS-BROWSE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-PRESS-COMMIT the pointer-press guard (GH-668 S5 play r6b, the
// round-6 checker's P1 + the integrator's ruling R1 + the round-6b census
// (c); web/tools/e2e-play-press-commit.mjs — after P-FOCUS-BROWSE on the same
// +0 / +4 slots): a POINTER press never moves the rail under the pointer —
// on 17f4d9f4 the r6 focus-browse snapped the rail 90 → 133 px under a held
// mouse press on the trailing half-visible leaf card and the release landed
// on the scrollfade (no confirm, no commit). Real mouse (1024) and touch
// (844) presses held 400 ms on a whole / trailing / leading card: the rail
// still, the release one confirm, the decline leaves the card browsed
{
  const f0 = failCount;
  await armPPressCommit({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-PRESS-COMMIT OK: a pointer press held 400 ms on a whole / trailing / leading playable leaf card never moves the rail under the pointer (1024 mouse + 844 touch; plain and with ob:settings / ob:perftier / refresh fired inside the hold — r6c leg v; and on the held-leaf FALLBACK register with ob:settings / refresh inside the hold — r6d leg vi), the release activates exactly once (one confirm) and the declined confirm re-selects the COMMITTED card, whole in the rail (#992)');
  else console.log(`P-PRESS-COMMIT RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-DECLINE-RESYNC (#992 ruling, build 20; spec 034 FR-006 —
// web/tools/e2e-play-decline-resync.mjs, after P-PRESS-COMMIT on the same
// +0 / +4 slots): a declined game switch re-selects the COMMITTED card —
// focus, aria-selected and Details on it, whole in the rail, the declined
// card unselected — and the picture holds across a table round trip and a
// Practice → Play switch (1024 mouse + 844 touch, real pointer on the card
// and on Cancel). On main the declined card stayed selected (r6b).
{
  const f0 = failCount;
  await armPDeclineResync({ PORT, CDP_PORT, fail });
  if (failCount === f0) console.log('P-DECLINE-RESYNC OK: a declined switch re-selects the committed card (focus, aria-selected, Details, whole) and it stays so after a table round trip and a place switch (1024 mouse + 844 touch)');
  else console.log(`P-DECLINE-RESYNC RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-SLOT-RESTORE the keep law's SLOT-RESTORE clause (GH-668 S5 play r7,
// review review r6 P2 on f819c812 + the integrator's ruling R1 + the round-7
// census (g); web/tools/e2e-play-slot-restore.mjs — after P-PRESS-COMMIT on
// the same +0 / +4 slots): after ANY rail slot / scrollport change — Quick
// Play → reopen Play (×3 cycles, scrollLeft stable), the REAL reopen pill, a
// synthetic --sf-slot 0px → restore, the leaf's arrival over the rung-1
// register — the COMMITTED card is restored whole when no browse is live and
// the BROWSED card when one is (readiness + playable, the r5 law). On
// f819c812 the hidden rail's 0px slot collapsed the coarse cards and the
// scroll, the restored slot left the rail at the start and the observer
// returned early on browsed === null: 10-Ball / one_pocket offscreen after
// Quick Play → reopen (review r6, browser-reproduced; the base keeps it).
// 844 + 667 coarse (ten_ball; one_pocket at 844) and 1024 fine (ten_ball);
// leg (h) KF-017 (#1155) at 1280 fine (one_pocket): an arrival lands the
// committed card whole in its own task (a re-entry, a place switch back);
// with no browse live, a re-present keeps a user's pan.
{
  const f0 = failCount;
  await armPSlotRestore({ PORT, CDP_PORT, fail });
  if (failCount === f0) console.log('P-SLOT-RESTORE OK: after Quick Play → reopen Play (×3 cycles, scrollLeft stable), the reopen pill, a synthetic --sf-slot 0px → restore and the leaf arrival, the committed card (no browse) / the browsed card (readiness + playable browse) stands whole in the rail viewport — 844 ten_ball + one_pocket, 667 ten_ball, 1024 ten_ball; (h) 1280 one_pocket: an arrival (the scripted re-entry, the reopen pill, a place switch back) lands it whole in its own task and at the first frame, with no browse live a re-present keeps a user\'s pan');
  else console.log(`P-SLOT-RESTORE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-HUD the HUD family's hud.js-resident rows (GH-668 S5 slice 3 G6;
// web/tools/e2e-play-hud.mjs — the LAST arm on the +0 slot, a table-register
// boot without the shell): the decision prompt speaks the slice-2 voice
// (decision.q.* title, chooser · decision.cite.* on the kit caps role),
// R6 neutral answers with focus-on-open + a REAL Tab ring, and #hud-action
// is the kit row register at the GH-371 spot-nearest pose (1440x900 de) --
{
  const f0 = failCount;
  await armPHud({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-HUD OK: #hud-decision title = decision.q.*, chooser = who decides · cite in .ob-caps, no --primary answer, first answer focused, Tab ring composed; #hud-action = ob-btn--row at --ob-r-m, <= 2 lines — 1440x900 de');
  else console.log(`P-HUD RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-FADE-CLEAR the rail's rest position (GH-668 S5 play visual audit r1
// V2 / V3b; web/tools/e2e-play-fade.mjs — the +0 desktop / +4 phone slots
// after P-HUD closed): on every rest (a non-first current card at boot, a
// keyboard browse, a pointer browse, End onto the readiness fixture) the
// presented card stands whole, the A4 peek law holds, and on the FINE
// register its text box clears the lit fade bands (centre snap); the coarse
// leading edge is measured and logged (kit-constant conflict, follow-up) --
{
  const f0 = failCount;
  await armPFade({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-FADE-CLEAR OK: desktop rests centred (text lead clear of the 48 px band, neighbours ≥ 32 px, no A4 sliver) on boot / keyboard / pointer / End; phone rests A4-legal, whole, trailing text clear');
  else console.log(`P-FADE-CLEAR RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-READY-INK the readiness card's muted voice (GH-668 S5 play visual
// audit r1 V4; web/tools/e2e-play-readyink.mjs): the NAME carries the kit
// aria-disabled 0.38, the card box paints at 1, the badge / hint / meta read
// at 1 and pass the A2 ground method (≥ 4.5 text, ≥ 3 badge) on glass /
// solid, en / de, rest / browsed, desktop / phone -------------------------
{
  const f0 = failCount;
  await armPReadyInk({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-READY-INK OK: readiness card box opacity 1, name 0.38, badge / hint / meta 1 with the A2 ground ≥ 4.5 (text) / ≥ 3 (badge) on glass + solid × en / de × rest / browsed × desktop / phone');
  else console.log(`P-READY-INK RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-CITE-RESERVE the full-citation reserve (GH-668 S5 play visual audit
// r1 V5; web/tools/e2e-play-cite.mjs): under data-ob-citation="full" every
// card equals the rail's content box (uniform, data-driven), Details follows
// at the default step; previewCitation(null) restores the kit reserve -----
{
  const f0 = failCount;
  await armPCite({ PORT, CDP_PORT, fail, webDir });
  if (failCount === f0) console.log('P-CITE-RESERVE OK: full-citation cards uniform = the rail content box (no empty band), Details gap = default, reversible');
  else console.log(`P-CITE-RESERVE RED (${failCount - f0} failure line(s) above)`);
}

// ---- P-DRILLS-SEAM the boot-time runner seam under the play arrival (GH-668
// S5 play r3; web/tools/e2e-play-seam.mjs — the +0 slot after its owners
// closed): `window.__drills` published within the §1.4 budget after the
// in-page `window.__shell` publish, judged outside the render loop's frames
// (#1120) (r3b: the stamps define the zero, the
// poll only reads them) through the play + practice mounts; the
// refused-catalog document keeps it absent (teeth) -------------------------
{
  const f0 = failCount;
  await armPDrillsSeam({ PORT, CDP_PORT, fail, webDir });
  if (failCount !== f0) console.log(`P-DRILLS-SEAM: ${failCount - f0} failure line(s) above (the arm printed its own verdict line)`);
}

await stopStaticServer(server);
if (process.exitCode) console.error('E2E-PLAY: FAIL');
else console.log('E2E-PLAY PASS');
