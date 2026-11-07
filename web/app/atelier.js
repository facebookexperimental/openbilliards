// Copyright (c) Meta Platforms, Inc. and affiliates.

// atelier.js — the five-station equipment atelier controller (feature 032,
// program 525 S2). Contract of record:
// the atelier contract (feature 032, internal) (station registry §2 —
// THIS module's STATIONS constant is its code truth; chrome DOM + __atelier
// surface §3; station laws §4).
//
// ALTITUDE LAW (coordinator ruling 1): stations are CONTENT of the S1
// `equipment` place — sub-anchors on the S1 places registry, never places.
// The frozen shell contract (the shell contract (feature 031, internal)) is
// inherited by reference: station switching rides the ONE S1 mover
// (bounded / interrupt-to-end / reduced-motion instant / one-in-flight /
// orbit write-through — §3), entry states and input isolation are the
// shell's (§7), and the atelier changes NO boot shape (§4 — default
// scripted boots never construct the shell, so they never construct this).
//
// Reached ONLY via the guarded dynamic import in shell.js's equipment-place
// arrival (shell.md §9 deviation 9 — the ONE sanctioned S2 shell touch):
// an absent/stale module degrades to the S1 stub cards, never a black page.
// Do NOT add this module to any static import graph.
//
// Swap law (research R1 — the 015 kit-confirm law inherited VERBATIM):
// every station swap calls the EXISTING settings api (changeEquipment with
// its confirm classes untouched, the cue_id fast path, the clothColor /
// fixture / brightness set() paths). No new persistence keys, no new event
// grammar, no atelier-local confirm dialogs. The D14 place analog: a
// CONFIRMED re-racking change exits to the table through the shell's
// state-preserving exit; a declined confirm stays at the station.
import { t, has, onLocaleChange } from './i18n.js';
// GH-668 S5 review r2 P2-3: the copy slice 5 ADDED (arrival hint,
// preview badge, rail count, put-back notice, leave confirm, stat legend) is
// hasLocal()-gated — i18n.js fetchDict() is an unversioned default-cache
// request, so fresh atelier.js can pair with a cached pre-S5 dictionary (the
// OWNERSHIP mixed-cache deployment; red-proven S5-D: raw keys painted). The
// gate is reached through the NAMESPACE (OWNERSHIP rule 5 / the GH-313
// hasLocal law: no new named import on an existing boot-graph edge), so an
// ancient i18n.js without hasLocal degrades to "no key is local" — legacy
// copy where a legacy key exists, the optional addition hidden otherwise —
// instead of a boot-killing SyntaxError. Re-judged on every locale change.
import * as i18nNs from './i18n.js';
const hasLocal = (key) => i18nNs.hasLocal?.(key) === true;
/** the put-back notice: the S5 sentence when the active dictionary carries
 * it, else the legacy "Put back" label (every locale since GH-534). */
const putBackKey = () => (hasLocal('atelier.preview.putBack') ? 'atelier.preview.putBack' : 'atelier.preview.revert');
// pool-sdk barrel: pre-existing exports on the boot graph (the settings.js
// import precedent — a NEW file consuming long-shipped exports cannot be
// cache-poisoned into a SyntaxError pairing).
import {
  calibrationKind, catalogEntries, catalogEntry,
} from '../dist/pool-sdk/index.js';
import { getGameEntry } from '../dist/pool-sdk/games/index.js';

// ui/atelier.css version — bump on EVERY change to that sheet (?v= law).
const ATELIER_CSS_V = '059'; // GH-1001 #1191 follow-up (review's batch-8 review, P2): FULL VIEW's wrappers leave hit-testing too — html.ob-atelier-clear makes #ob-atelier-rail and #ob-shell-cards hit-transparent (the bar and the column's other children keep their targets), so wheel zoom, orbit drags and scene taps over the cleared region reach the scene (058 was GH-1001 re-target onto batch 5 (maintainer ruling 1, option (a)): the fine cue card keeps the F31 floor where the band above the showroom rail's seat is shorter, extending down over the rail to one sp-1 above the shell reserve (batch 4's taller reserve: 1024x640 de covered the summaries again) (057 was GH-1001 card 32 v4 (signed layout (2), atelier.md §7 B20-2 amendment v4): on the phone's tall rail every label sits under the face in a card as wide as the face (or the locale's two-line name / meta row), the station controls in ONE side column beside the card row, the preview bar seated in the host's strip row while a preview is staged (the card counter on it) and Full view gliding it to the rail's bottom row (056 was GH-1001 card 32 v2 (atelier.md §7 B20-2): THE TALL PHONE CARD — on the phone's wide rail the preview face stands at 2F x F over the name at the card's full measure (the chip and the Equipped marker beside the face; F measured from the live band, every first row on one height) and Full view glides the bar to the rail's bottom row (055 was GH-1001 (atelier.md §7 B20-1): THE EQUAL-HEIGHT CARD LAW — every rail card stands at the reserve (top-anchored content, the meta row a fixed one-badge height pinned to the foot), the WIDE coarse rail (host left edge → the quick-play wrap, the large 128x64 face) the kit .ob-status state marker on the bar / the equipped tick, the bar's full view (sign-off card 32 B1), the one-row host on every station (F35), the cue card's title rung / dismiss clearance / 336 px floor (F30–F32), the lux readout (F33) and the summaries on the control rung (F36) (054 was GH-668 S5 r11 (review r11 P2; atelier.md §7 S5-32): THE PUBLISHER-FALLBACK LAW — a sheet geometry derived from a module-published variable keeps its legacy value when the publisher is absent: the coarse rail host's cap is the S5 shell-band cap only while --ob-eq-host-b resolves (a 0px term of the publisher's variable inside the cap's custom property; invalid at computed-value time without it) and the pre-S5 --rail / --railsub caps verbatim otherwise (a cached pre-S5 atelier.js under this sheet publishes nothing: measured 844x390 Table host 14–246 over the rail 150–230, every card centre hit-testing the host — census (f), five stations × four registers) (053 was GH-668 S5 r10 (landing classification row 4a; atelier.md §7 S5-31): THE EXIT-BRIDGE LAW's sheet-side belt — a hidden #ob-atelier-cue is never under the finger (pointer-events: none while [hidden]: the kit's unmount() keeps a dismissed sheet painted through its exit bridge, and a tap in that beat falls through to what has returned beneath it, never to the leaving surface; the stale-module leg of the mixed-cache law — a cached pre-r10 atelier.js still returns the rail at once, this sheet alone keeps that tap on the card) (052 was review r9: the yield's FOCUS-TREE leg (visibility: hidden on the yielded rail + its (1,2,1) decision-up twin; publishBands sets inert beside the class and hands focus to the sheet first — P2-1: a real tap left focus on a card inside the 0 px rail, ArrowRight walked the selection behind the sheet, a Tab walk entered it) + the LEGACY-MODULE BELT over the CONTAINERS (the strip, the rail's secondary row, the Advanced pane, the provenance block restate the kit solid rung under `:not(.ob-mat-solid)` — P2-2: a cached pre-G2 atelier.js under this sheet painted all four transparent) (051 was review r8 + the fixer's cascade census: THE CASCADE LAW — three state rules that lost the cascade: the hidden txbar composes :not([hidden]) onto the --narrow grid rule (P2-1: a bar hidden by Keep / Put back while narrow kept painting + focusable), the yielded coarse rail restates max-height 0 / overflow hidden for the both-classes decision-up state (P2-2: ghost cards through the sheet's glass), and the FINE rail's cap reads max(host band, prompt edge) under a pending decision (R8-F3, measured under the integrator's pose: the docked bar's Keep hit-tested to an answer button) (050 was review r7: the LEGACY-MODULE BELT — a cached pre-S5 atelier.js / ateliercue.js under the fresh sheet keeps a styled face at every site the branch moved onto a kit class the old module never stamps (the Advanced pick rows on the kit ghost row-pill face + 44 floor, the cue-sheet close on the icon-pill rung, the rail cards' radius / name weight / badge chips), each under `.local:not(.kit)` so the fresh module's face is untouched (049 was review r6: the coarse host fold keys on the module's own `ob-atelier-host--rehomed` marker (worn while homeSecondary has the secondary controls in the rail row) — a cached pre-S5 atelier.js under the fresh sheet keeps its cards box and with it the brightness slider + Advanced disclosure (048 was review r4b (checker of the r4 fix round): under a pending in-shell decision the coarse cue sheet is a ONE-ROW ACTION STRIP (the actions row first — Equip / Try it / Full spec whole in the visible box, the title by the sheet's own scroll; block padding = clamp(0, (band − one row) / 2, sp-2), the cap = one row + that padding; 667x375: 46 = 44 + 2 borders, no growth) + the docked transaction bar's ground is the kit's opaque action-footer rung (the Advanced summary label read through its glass — r3 TASTE) (047 was review r4 fix round: the coarse cue sheet yields to a pending in-shell decision (the cap's host term becomes max(host band, prompt edge + sp-2) — P2-2) + the one-row bar form keyed on the MEASURED rail (fitTxBar writes --narrow when the sentence cannot stand on one line in a fine rail; the same ladder — P2-3) (046 was review r3 fix round: the desktop cue card yields to a pending in-shell decision (the step above the shell drops, the band seats under the prompt's published edge, the floor extends over the rail's seat when it must — P2-1) + the option-row register reaches the coarse rail's re-homed cushion rows (P2-2) (045 was review r2: the desktop cue card keeps a usable height in short fine windows (one clamp: centred on 50vh while the window affords the 224 px floor, then top-seated, then the band above the rail — P2-1) (044 was review r1: the ja / zh card names honour their joins (line-break loose) + the compact card row fits the band through its own block padding (K-17b; a band cap was measured and withdrawn) (043 was vfix2 (R-1): the coarse txbar's fit ladder (--tight / --small steps, the badge yields last) + the compact card row aligns start (042 was vfix1 (R-EQ-P1): the coarse rail law — TWO-row non-scrolling rail [bar | control row] over [cards] above the SHELL rail, count in the strip, one-row txbar, compact card; 041 was the gate runner: the stale-kit belt on the degrade pick rows (G8 was 040: kit icon close / row pick / hint stats, mount law, flash = --ob-t-med — B-EQ08 / B-EQ09))))))))))))))))
// GH-668 S5 G8 (B-K22 mount law, A11): the host ENTERS through the kit —
// ui/motion.js by guarded import (the shell.js idiom; cache-poison
// contract: a missing or stale leaf degrades to the plain append the host
// always carried). The PROMISE is the load state: the first mount awaits
// it (a pending leaf is a degraded state until it settles — the ownership ledger).
let motion = null; // ui/motion.js namespace once it lands, else null
const motionReady = import('./ui/motion.js').then((m) => { motion = m; return m; }).catch(() => { motion = null; return null; });
// ---- stylesheet (?v= leaf law; module level — the replays idiom) ---------
// Linked ahead of the first arrival, by the shell's boot-idle preload (#811;
// adopted below when its href is ours, else unlinked: a stale shell's ?v=) or
// by its LAW 1 `prefetch()` hook, whichever comes first: the S1 stub kill and
// the rail register both ride this sheet (the factory's sheet gate below), and
// the shell's arrival hold caps at ARRIVAL_HOLD_MS — with the link made inside
// the factory the stub PAINTED from that cap until the sheet landed (issue
// #811: e2e-shell `A3 rm rail → equipment`). `load` OR `error` settles it
// (a 404 = the degrade register stands); a present link with an applied sheet
// settles at once, never re-injected; idempotent.
let sheetPromise = null;
function ensureSheet() {
  if (sheetPromise) return sheetPromise;
  sheetPromise = new Promise((resolve) => {
    let link = document.getElementById('ob-atelier-css'), href = new URL(`./ui/atelier.css?v=${ATELIER_CSS_V}`, import.meta.url).href;
    const pre = link ? null : document.getElementById('ob-atelier-css-pre'); if (pre && pre.href === href) { pre.id = 'ob-atelier-css'; link = pre; } else pre?.remove();
    if (link && link.sheet) { resolve(); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = 'ob-atelier-css';
      link.rel = 'stylesheet'; link.href = href;
    }
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    if (!link.isConnected) document.head.appendChild(link);
  });
  return sheetPromise;
}
/** LAW 1 prefetch hook (shell.js): link the sheet in idle time. */
export function prefetch() {
  return ensureSheet();
}

const STATION_IDS = ['cues', 'table', 'cloth', 'balls', 'lighting'];

// Station registry (contracts/atelier.md §2 — FROZEN ids, order, ownership;
// anchors are S2 implementation outputs validated by the capture pack, then
// recorded back into the contract — the S1 §2 freeze idiom). Anchor
// derivations (research R3, scene ground truth):
//   cues     — rack framing: obCueRack AABB x [4.407,4.498] y [-0.555,0.965]
//              z [-1.075,0.015] (room.js:262-291); fixed wall prop, no bed
//              scale; tighter radius than the S1 equipment overview (2.7).
//   table    — wide bed framing (distinct from the play/practice anchors);
//              radius scales with the active bed like camerapresets.
//   cloth    — close-low raking framing over the felt (phi near the 1.45
//              orbit clamp; the raking angle is what makes nap/color read).
//   balls    — mid framing over the FOOT (rack) area: foot spot sits at
//              three.x = +bedLength/4.
//   lighting — lamp-canopy framing within orbit clamps: the canopy hangs at
//              y ≈ 1.14 (lightingvisuals canopy y = 45 in); radius damped
//              like the S1 play anchor (fixtures span the bed).
// GH-668 S5 G6 (B-EQ06): the pointer register the anchors split on — the
// SAME predicate ateliercue.js frames the float with (the phone rail band
// sits mid-screen, where the desktop balls framing put the rack).
const coarsePointer = () => {
  try { return window.matchMedia?.('(pointer: coarse)').matches === true; }
  catch { return false; }
};
const STATIONS = [
  { id: 'cues', labelKey: 'atelier.station.cues',
    anchor: () => ({ tx: 4.44, ty: 0.2, tz: -0.53, radius: 2.3, theta: -1.22, phi: 1.22, fov: 40 }) },
  { id: 'table', labelKey: 'atelier.station.table',
    anchor: (s) => ({ tx: 0, ty: 0.05, tz: 0, radius: 3.2 * s, theta: -0.55, phi: 1.02, fov: 40 }) },
  { id: 'cloth', labelKey: 'atelier.station.cloth',
    // G6 (B-EQ06) MEASURED: the racked balls project at y ≈ 370–460 while
    // the desktop quick-play stack starts at 792 (1440×900; 334–408 vs 692
    // at 1280×800) — the T030 tuple already clears the stack, the S5-M arm
    // guards it (rack ∩ bands().quickPlay = ∅, the foot spot outside it)
    anchor: (s) => ({ tx: 0.35 * s, ty: 0, tz: -0.25, radius: 1.15 * s, theta: -0.62, phi: 1.36, fov: 40 }) },
  { id: 'balls', labelKey: 'atelier.station.balls',
    // G6 coarse register: higher / wider / lifted so the rack projects into
    // the upper third (AABB bottom ≤ 0.40·vh) above the phone rail band;
    // the desktop tuple is the T030 record (untouched)
    // MEASURED (S5-M receipts, 844×390): the plan's lift (ty +0.02) put the
    // foot spot at 0.52·vh — raising the target LOWERS the scene on screen.
    // The rack rises by a ground shift of the target TOWARD the camera
    // (basis (sinθ, 0, cosθ), the orbit pan law's screen-down direction):
    // 0.30 m at θ −0.95 → Δtx −0.24, Δtz +0.18 (bed-scaled with the rack).
    anchor: (s) => (coarsePointer()
      ? { tx: 0.40 * s, ty: 0.03, tz: 0.18 * s, radius: 1.20 * s, theta: -0.95, phi: 0.78, fov: 40 }
      : { tx: 0.64 * s, ty: 0.03, tz: 0, radius: 1.05 * s, theta: -0.95, phi: 0.85, fov: 40 }) },
  // lighting: the camera must sit BELOW the lamp plane or the occluder
  // fade (scene/lampfade.js — cameras above the plane fade the fixture so
  // it never blocks gameplay views) hides the very thing the station
  // frames: cam y = ty + r·cos(phi) = 0.7 + 2.4·cos(1.45) ≈ 0.99, under
  // both the pool canopy plane (~1.14) and the snooker luminaire (~1.02);
  // phi rides the orbit clamp (1.45), looking level-up at the fixture.
  { id: 'lighting', labelKey: 'atelier.station.lighting',
    anchor: () => ({ tx: 0, ty: 0.7, tz: 0, radius: 2.4, theta: -0.7, phi: 1.45, fov: 40 }) },
];

/** The re-racking catalog axes (R1): a CONFIRMED change on these exits to
 * the table (D14 place analog). cue_id is the fast path — never re-racks. */
const RERACK_AXES = ['table_id', 'cloth_id', 'ballset_id', 'cushion_model_id'];

/** MIRRORS of settings.js module registries (the FIXTURE_IDS duplicated-
 * literal law — settings.js:236/242; change together). Read-only display
 * inventory; every COMMIT still routes through the settings api, whose own
 * sanitation is the truth. */
const FIXTURE_IDS = ['canopy_panel', 'perimeter_ring', 'pendant_bar',
  'snooker_luminaire', 'carom_luminaire'];
const CLOTH_COLOR_IDS = ['tournament_blue', 'classic_green', 'snooker_green',
  'burgundy', 'steel_gray', 'camel'];
const BRIGHTNESS_MIN = 0.6, BRIGHTNESS_MAX = 1.4;
const WPA_LUX = 520; // settings.js WPA_LUX mirror (brightness 1.0 detent)

export function createAtelier(ctx) {
  // ctx (from the shell.js §9-deviation hunk): { scene, camera, orbit,
  // machine, game, mover, section (the equipment place's card section),
  // bedScale(), shell: { isOpen, place, goTo, exitToTable, instant } }
  // Handle: { go, setPlace, onShellExit, propTap, primary } — `primary` is
  // the R0 (f) card-primary hook (GH-677: the S1 settings-fronting stub
  // never fires under a mounted atelier).
  const { mover, section, bedScale, shell } = ctx;
  if (!section || !mover) return null;

  const stationOf = (id) => STATIONS.find((s) => s.id === id);
  const anchorOf = (id) => stationOf(id).anchor(bedScale());

  // ---- settings seams (feature-detected; the atelier NEVER re-implements
  // the swap machinery — research R1) -----------------------------------
  const sapi = () => window.__settings ?? null;
  let sctx = null; // settings.js module ctx (cueSwap seam — the hud.js path)
  import('./settings.js').then((m) => { sctx = m.ctx ?? null; })
    .catch(() => { /* seam absent: fall back to window.__settings */ });

  // ---- stylesheet (?v= leaf law) ---------------------------------------
  // The RAIL register waits for this sheet to SETTLE (sheetSettled gates the
  // cardrail leaf mount below): `.ob-atelier--rail` keys every rail-register
  // rule (the station h3 retired, the cards box folded, the strip host, the
  // cue card's with-rail band), so a flip before the sheet applies paints
  // the degrade layout wearing the rail register's DOM for as long as the
  // fetch takes — 250–1040 ms on a loaded box (probe 2026-09-09; the R13
  // audit read the station h3 painted with the rail live). OWNERSHIP mount
  // law: a pending leaf is a degraded state until it settles — the sheet is
  // a leaf. `load` OR `error` settles it (a 404 = the degrade register
  // stands, exactly as an absent cardrail.js); an already-present link with
  // an applied sheet settles at once (mixed cache: a second evaluation never
  // re-injects). Linked by the LAW 1 prefetch already (module level, above);
  // idempotent here for a factory reached without it.
  const sheetSettled = ensureSheet();

  // ---- chrome DOM (contract §3 — ALL present from build; hidden toggles) --
  // The S1 stub content (summary lines + the equipment-settings card action)
  // retires from view while the atelier owns the section: the pane it
  // fronted migrates HERE in this same slice (D10 complete-pane rule). A
  // failed atelier import never reaches this line — the stubs then stand
  // (cache-poison degrade).
  const stubHidden = [];
  for (const child of [...section.children]) {
    if (child.tagName === 'H2') continue; // the place heading stays
    child.hidden = true;
    stubHidden.push(child);
  }
  section.classList.add('ob-atelier-host');

  const root = document.createElement('div');
  root.id = 'ob-atelier';
  root.setAttribute('aria-label', t('atelier.aria.root'));
  root.dataset.i18nAria = 'atelier.aria.root';

  const carouselMount = document.createElement('nav');
  carouselMount.id = 'ob-atelier-carousel';
  // GH-534 round 7: the station strip is a consumer of the ONE kit
  // segmented-strip control — geometry rides kit.css .ob-strip (stamped
  // here so the degrade register keeps it); behavior rides ui/strip.js.
  carouselMount.classList.add('ob-strip');
  // kit material (GH-668 S5 G2, B-EQ02): the strip band — sticky over the
  // scene on coarse — rides the ladder's SOLID rung (the 52 % smoke measured
  // 4.42:1 in ko); the kit class states it, atelier.css paints nothing here
  carouselMount.classList.add('ob-mat-solid');
  carouselMount.setAttribute('aria-label', t('atelier.aria.carousel'));
  root.appendChild(carouselMount);

  const cards = document.createElement('div');
  cards.id = 'ob-atelier-cards';
  const stationSections = new Map();
  for (const s of STATIONS) {
    const sec = document.createElement('section');
    sec.dataset.station = s.id;
    sec.hidden = true;
    const h = document.createElement('h3');
    h.dataset.i18n = s.labelKey;
    h.textContent = t(s.labelKey);
    sec.appendChild(h);
    cards.appendChild(sec);
    stationSections.set(s.id, sec);
  }
  root.appendChild(cards);
  // GH-668 S5 G5 (B-EQ05, ruling R13): the ARRIVAL line — station null is
  // no longer a strip over a blank pane: one kit .ob-body line under the
  // strip says what to do ("Pick a station to open the showroom"). Both
  // registers (the degrade register's arrival was the same blank pane); a
  // sibling of the cards box, not a child — the coarse rail register
  // folds the (empty) cards box away (R13 interim, atelier.css) and the
  // line must still paint there. The R13 alternative ("arrive at the
  // last-used station with the rail live") is a setPlace behaviour change
  // and is NOT taken (disclosed on the card as the default).
  const arrival = document.createElement('p');
  arrival.className = 'ob-body';
  arrival.dataset.ob = 'atelier-arrival';
  arrival.dataset.i18n = 'atelier.arrival.hint';
  arrival.textContent = hasLocal('atelier.arrival.hint') ? t('atelier.arrival.hint') : ''; // P2-3 gate (presentStation hides it too)
  root.appendChild(arrival);
  /** review r2 P2-3: the gated S5 copy re-judged against the ACTIVE dictionary
   * — called after the [data-i18n] passes on a locale change (those repaint a
   * raw key wherever the served dictionary is stale). */
  let txBadge = null, txNote = null; // the "Previewing" badge + its note box (bound in the bar block below)
  let txView = null, txViewLabel = null, txRevert = null; // the FULL VIEW pill (GH-1001 B1) + its label + its anchor (bound below)
  let clearView = false;
  let onClearChange = null; // the at-rest turntable's re-sync (bound with syncLiveCard below)
  let tfSync = null, tfPoseOf = null, tfReturn = null; // the phone table-preview framing (B20-2; bound in its block below)
  /** GH-1001 (B1, sign-off card 32): FULL VIEW — the host card and the
   * rail's rows fade (html.ob-atelier-clear, atelier.css) so the staged
   * equipment is seen whole in the live scene; the bar stays. Only while a
   * preview is staged: the bar hiding (Keep / Put back / a station or
   * place change) always ends it. */
  function setClear(on) {
    clearView = !!on && !!txView?.isConnected && !txBar.hidden;
    document.documentElement.classList.toggle('ob-atelier-clear', clearView);
    if (txView) {
      txView.setAttribute('aria-pressed', String(clearView));
      txViewLabel.dataset.i18n = clearView ? 'atelier.preview.viewBack' : 'atelier.preview.view';
      txViewLabel.textContent = t(txViewLabel.dataset.i18n);
    }
    onClearChange?.();
  }
  function syncGatedCopy() {
    const arr = hasLocal('atelier.arrival.hint');
    arrival.textContent = arr ? t('atelier.arrival.hint') : '';
    arrival.hidden = active !== null || !arr;
    // the marker is PRESENT or ABSENT, never `hidden`: the kit .ob-status is
    // display inline-flex (the attribute loses but for the [hidden] belt)
    // and the vfix2 fit ladder (fitTxBar) owns its hidden as the last yield
    // step — an absent marker is invisible to both, and the legacy note is
    // the whole sentence then
    if (txBadge && txNote) {
      if (hasLocal('atelier.preview.badge')) {
        txBadge.textContent = t('atelier.preview.badge');
        if (!txBadge.isConnected) txNote.prepend(txBadge);
      } else txBadge.remove();
    }
    // GH-1001 B1: the full-view pill exists only while the served dictionary carries its copy (the P2-3 gate — never a raw key on the bar)
    // and the bar is docked in the rail (review r1 P2: the leaf-absent degrade keeps the bar in the host, which the full view hides)
    syncStationHints(); // GH-1001 F35
    if (txView && txRevert) {
      if (txBar.parentElement === rail && hasLocal('atelier.preview.view') && hasLocal('atelier.preview.viewBack')) {
        if (!txView.isConnected) txRevert.before(txView);
        setClear(clearView);
      } else { setClear(false); txView.remove(); }
    }
  }

  // ---- preview transaction bar (GH-534 owner ruling R3, 2026-08-16) ------
  // Visible exactly while a swap transaction is staged (__settings.preview
  // — the settings-store seam owns the transaction; this bar is only its
  // chrome): Keep commits under the R1 semantics (pristine = silent,
  // progressed = kit confirm + re-rack + D14 exit), Revert restores
  // exactly, and leaving the station/atelier without Keep reverts too
  // (presentStation above).
  // GH-668 S5 G1 (B-EQ01, ruling R12): the bar is the showroom rail's FIRST
  // row once the cardrail leaf arrives (rail.prepend below — Keep sits one
  // card-height from the card that staged it, inside the viewport on both
  // registers); the leaf-absent degrade keeps it here in the host column
  // (the OWNERSHIP mixed-cache rule: a cached cardrail-less graph keeps
  // the S2 geometry). Anatomy = kit parts only: .ob-body note led by the
  // ONE "Previewing" state marker (the state named once per frame; GH-1001:
  // the kit .ob-status — a live state, never the pill voice, so it no longer
  // reads as a third button beside the 40 / 44 px pills),
  // Put back = ghost pill, Keep = the frame's only primary while staged.
  // No --row class on either pill: the kit controls.js auto-row belt
  // judges wrap itself (data-ob-autorow).
  let keepStaged = async () => ({}); // bound inside the block below
  const txBar = document.createElement('div');
  txBar.dataset.ob = 'atelier-txbar';
  txBar.hidden = true;
  // vfix1 (R-EQ-P1): which rail row the staged preview came from — 'card'
  // (a station rail axis: table / cloth / balls / fixture) or 'control' (a
  // chip / the brightness range / a cushion row); null while nothing is
  // staged. The coarse bar takes the OTHER row's slot (syncRailCount).
  let txFrom = null;
  {
    const note = document.createElement('span');
    note.className = 'ob-atelier-txnote ob-body';
    const badge = document.createElement('span');
    badge.className = 'ob-status ob-caps'; // the kit state marker on the kit caps role (GH-1001)
    badge.dataset.ob = 'atelier-txstate'; // the marker's hook (fitTxBar + the arms; the class is the kit's)
    badge.dataset.i18n = 'atelier.preview.badge';
    badge.textContent = hasLocal('atelier.preview.badge') ? t('atelier.preview.badge') : ''; // P2-3 gate (syncGatedCopy)
    txBadge = badge; txNote = note;
    const noteText = document.createElement('span');
    noteText.className = 'ob-atelier-txnote__text'; // hidden on the coarse one-row bar (vfix1)
    noteText.dataset.i18n = 'atelier.preview.note';
    noteText.textContent = t('atelier.preview.note');
    if (hasLocal('atelier.preview.badge')) note.append(badge); // P2-3: absent under a stale dictionary (syncGatedCopy re-judges)
    note.append(noteText);
    const revertBtn = document.createElement('button');
    revertBtn.type = 'button';
    revertBtn.className = 'ob-btn ob-btn--ghost';
    revertBtn.dataset.ob = 'atelier-revert';
    const rl = document.createElement('span');
    rl.dataset.i18n = 'atelier.preview.revert';
    rl.textContent = t('atelier.preview.revert');
    revertBtn.appendChild(rl);
    revertBtn.addEventListener('click', () => {
      sapi()?.preview?.revert?.();
      syncRows();
      syncTxBar();
    });
    const keepBtn = document.createElement('button');
    keepBtn.type = 'button';
    keepBtn.className = 'ob-btn ob-btn--primary';
    keepBtn.dataset.ob = 'atelier-keep';
    const kl = document.createElement('span');
    kl.dataset.i18n = 'atelier.preview.keep';
    kl.textContent = t('atelier.preview.keep');
    keepBtn.appendChild(kl);
    keepBtn.addEventListener('click', () => keepStaged());
    // GH-1001 (B1, sign-off card 32): the FULL VIEW pill — a ghost pill
    // before Put back; a toggle (aria-pressed), its label names the way
    // back while the view is clear
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'ob-btn ob-btn--ghost';
    viewBtn.dataset.ob = 'atelier-view';
    viewBtn.setAttribute('aria-pressed', 'false');
    const vwl = document.createElement('span');
    vwl.dataset.i18n = 'atelier.preview.view';
    vwl.textContent = t('atelier.preview.view');
    viewBtn.appendChild(vwl);
    viewBtn.addEventListener('click', () => { setClear(!clearView); fitTxBar(); });
    txView = viewBtn; txViewLabel = vwl; txRevert = revertBtn;
    // review r1 P2: docked as the rail's first row (G1) the bar
    // sits inside the shell's KEY_GATE_EXEMPT lane (#ob-atelier-rail) but
    // OUTSIDE the cards listbox handler, so the deferred keys reached
    // aim.js from a focused pill (red-proven S5-Z: ArrowLeft stepped
    // game.phi, ArrowUp raised #power). The bar CONSUMES the exempted keys
    // itself (the cloth-chip row idiom): arrows / Home / End are no bar
    // gesture (preventDefault + stopPropagation); Enter / Space keep their
    // NATIVE button activation (stopPropagation only — the default action
    // survives; no gameplay window handler acts on them, shell §9 R0(i));
    // Tab is never touched (focus order intact). Register-agnostic: in the
    // degrade register (bar in the host) the shell gate already covers it.
    txBar.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    });
    // the ONE Keep path (the button and the S5-1 leave confirm share it):
    // resolves { refused } (decision conflict — the transaction stays),
    // { committed, reracked } from the seam, or {} on a declined re-rack
    // confirm (still staged). Callers that MOVE afterwards read it.
    keepStaged = async () => {
      // GH-541 (atelier.md §7 entry 17): a pending rules decision blocks a
      // CONFLICTING commit — a RE-RACKING transaction whose re-rack would
      // destroy a pending POST-SHOT option (progressed rack). Fresh-
      // address decisions (a PRISTINE rack's initialState-born break_spot/
      // break_pocket) are EXEMPT per the GH-541 remedy: the commit's
      // re-rack re-raises the same fresh-address prompt, nothing is lost —
      // and without the exemption a pristine carom Keep would wedge
      // forever (every fresh carom rack pends break_spot; red row of
      // record in the I arm). Scalar-only transactions never re-rack and
      // commit freely (review P2). Refusal = the shell's honest notice; the
      // transaction stays staged. Fail-closed on the pristine read (the
      // F2 consent-law idiom); feature-detected on the shell seam (a stale
      // shell.js refuses ENTRY under the old FR-016(d) — unreachable) and
      // BACKSTOPPED core-side (settings.js decisionConflict at
      // preview.keep/changeMode — the mixed-vintage cache-poison law).
      if (shell.decisionPending?.() === true
        && sapi()?.rackPristine?.() !== true
        && sapi()?.preview?.active?.()?.reracking === true) {
        shell.notice?.('shell.notice.decision');
        return { refused: true };
      }
      const r = await sapi()?.preview?.keep?.();
      if (r?.notice) shell.notice?.(r.notice);
      syncRows();
      syncTxBar();
      // D14 place analog: a committed RE-RACKING keep exits to the table
      // through the shell's state-preserving exit; scalar-only keeps
      // (lighting, cloth color) stay at the station (non-re-racking law),
      // and a declined confirm leaves the transaction staged right here.
      // GH-682 review r2: after the await (the re-rack confirm's accept) —
      // outside any event dispatch — the exit is told it was user-activated
      if (r?.committed && r?.reracked) shell.exitToTable({ activated: true });
      return { committed: r?.committed === true, reracked: r?.reracked === true };
    };
    txBar.append(note, revertBtn, keepBtn);
    // the full-view pill joins only once the bar docks in the rail (syncGatedCopy at the dock; review r1 P2)
  }
  root.appendChild(txBar);
  /** The bar control that takes focus when the row holding it leaves: Put back — present while anything is staged and
   * never hidden by either fit ladder (Keep hides while reverting; the full-view pill yields on the legacy ladder's
   * last rung — review re-check 2: a de portrait refit hid the pill the hand-off had just focused). */
  const txFocusTarget = () => txBar.querySelector('[data-ob="atelier-revert"]') ?? [...txBar.querySelectorAll('button')].find((b) => !b.hidden);
  /** card 32 v4 (signed layout (2), atelier.md §7 B20-2 amendment v4): while a preview is staged the bar seats
   * over the host card's strip row (the host hidden) — only the bar docked in the live v4 rail at the equipment
   * place (the leaf-absent degrade keeps its bar in the host it would hide; a place change never leaves it set). */
  function syncBarTop() {
    const on = !txBar.hidden && txBar.parentElement === rail && !rail.hidden
      && rail.classList.contains('ob-atelier-rail--tall') && rail.classList.contains('ob-atelier-rail--below')
      && shell.isOpen?.() === true && shell.place?.() === 'equipment';
    const root = document.documentElement;
    if (root.classList.contains('ob-atelier-bartop') === on) return;
    // the host leaves the focus walk while the bar sits over it (review review P1: a rotation into the phone
    // register with focus on a strip pill left focus on hidden chrome) — the bar's first live control takes it
    if (on && section.contains(document.activeElement)) {
      const to = txFocusTarget();
      root.classList.toggle('ob-atelier-bartop', on);
      to?.focus({ preventScroll: true });
      return;
    }
    root.classList.toggle('ob-atelier-bartop', on);
    // the host the seat hid comes back through the kit enter in the same task (B-K22, the shell's releaseHold idiom):
    // its first painted frame is the enter pose, never the rest pose (e2e-ui --audit A11 after Put back / Keep)
    if (!on && !section.hidden && typeof motion?.enter === 'function') motion.enter(section);
  }
  function syncTxBar() {
    const act = sapi()?.preview?.active?.() ?? null;
    txBar.hidden = !act;
    syncBarTop(); // card 32 v4 '2': the bar's seat (and the count it carries) before its fit is judged
    homeRailCount();
    if (!act && clearView) setClear(false); // GH-1001 B1: no staged preview, no full view
    const reverting = !!act?.reverting?.length;
    txBar.querySelector('[data-ob="atelier-keep"]').hidden = reverting;
    // Keep the main badge and fit ladder; only the sentence changes state.
    const noteText = txBar.querySelector('.ob-atelier-txnote__text');
    noteText.dataset.i18n = reverting ? 'atelier.preview.reverting' : 'atelier.preview.note';
    noteText.textContent = t(noteText.dataset.i18n);
    if (!act) txFrom = null;
    else {
      const keys = [...Object.keys(act.equipment ?? {}), ...Object.keys(act.scalars ?? {})];
      txFrom = keys.some((k) => Object.values(RAIL_AXIS).includes(k)) ? 'card' : 'control';
    }
    fitTxBar();
    syncRailCount?.(); // coarse: the bar takes a rail row's slot (vfix1)
    tfSync?.(); // card 32 v2 (B20-2): the phone table-preview framing follows the transaction
  }
  // GH-668 S5 vfix1 (R-EQ-P1): the coarse bar is ONE row — badge + Put back
  // + Keep (the sentence is CSS-hidden there). The 288 px rail cannot hold
  // the badge beside two coarse pills in every locale (de "Zurücksetzen" +
  // "Behalten" + "Vorschau" ≈ 320 px, es 304), and a label never truncates
  // (kit law), so the bar climbs a FIT LADDER by measure — the shell strip's
  // strip-then-measure idiom: default → pills at the strip's pad floor
  // (--tight, sp-3) → pill labels at the caption size (--small, --ob-fs--1)
  // → the badge yields (hidden; the staged card's own --staged paint still
  // names the state), the pills back at their default register. Every step
  // is re-judged on every stage / locale / bands write.
  // vfix2 (re-verifier P1 R-1): the judge is the NOTE CELL + the geometry,
  // never the bar's own overflow — the grid's note track is min-width 0, so
  // the bar NEVER reports overflow: the badge overflowed its cell and painted
  // over the Put-back pill (de −34 px, es −18.5 px at 844 and 667; S5-X).
  // Fine register (review r4 P2-3; red-proven S5-X2): the flex
  // SENTENCE form stands exactly while the sentence is ONE line box inside
  // its note cell — keyed on the MEASURED rail, never the pointer. A fine
  // 800x600 window docks the bar into the rail's 288 px floor: the note cell
  // shrank to 33 px beside the 85 px "Vorschau" badge and the sentence broke
  // one glyph per line (a 417 px bar over the cards, the badge over Put
  // back; ja 81 px; 1024x640 de 60 px on two lines — over the two-row
  // budget). Otherwise the bar wears --narrow (atelier.css: the coarse
  // one-row grid, the sentence hidden, the badge naming the state) and
  // climbs the same ladder below. Re-judged on every stage / locale /
  // bands write like the coarse steps.
  // Review r5 P2-2 (red-proven S5-X2 stale leg): the ladder
  // runs WITH OR WITHOUT the badge. The supported stale-dictionary degrade
  // (syncGatedCopy: a cached pre-S5 dictionary has no badge key, so the
  // badge is ABSENT) used to trip the `!badge` early return, and the narrow
  // ladder never ran: 800x600 de the legacy sentence broke into ten line
  // boxes in a 33 px note cell and the bar stood 228 px over the cards.
  // Only the badge-yield rungs are skipped when the badge is absent; the
  // legacy sentence is whole or hidden (--narrow), never cut.
  // Review r8 P2-1 (red-proven S5-X2 HIDE-AFTER): a bar that goes
  // hidden (Keep / Put back) sheds its rungs BEFORE the hidden return. The
  // --narrow grid rule is later in the sheet than the [hidden] rule at the
  // same specificity, so a hidden bar still wearing --narrow kept painting
  // (800x600 de: a 288x46 grid, both pills focusable, a real Tab walk landed
  // in it, at the next station too). The sheet now composes :not([hidden])
  // as well — either end alone is whole (the mixed-cache law).
  // card 32 v4 (the seated bar on the v4 rail): the marker NEVER yields (card 32 C); the bar climbs one row
  // (default -> --small -> --small + --tight) and then the 2x2 block (--grid2: marker | full view over put back |
  // keep, the same two rungs). Judged with the wider of the full-view pill's two labels, so entering Full view never
  // changes the rung. A bar that fits no rung keeps the last one and says so (data-ob-fit="over").
  function fitTxBarV4(badge, viewPill) {
    if (!rail.classList.contains('ob-atelier-rail--below')) return false;
    const label = txViewLabel?.isConnected ? txViewLabel : null;
    const shown = label?.textContent ?? '';
    if (label && hasLocal('atelier.preview.view') && hasLocal('atelier.preview.viewBack')) {
      const a = t('atelier.preview.view'), b = t('atelier.preview.viewBack');
      label.textContent = a; const wa = label.getBoundingClientRect().width;
      label.textContent = b; const wb = label.getBoundingClientRect().width;
      label.textContent = wa >= wb ? a : b;
    }
    const parts = [badge, viewPill, txBar.querySelector('[data-ob="atelier-revert"]'), txBar.querySelector('[data-ob="atelier-keep"]')];
    const over = () => {
      if (txBar.scrollWidth > txBar.clientWidth + 0.5) return true;
      if (txNote && txNote.scrollWidth > txNote.clientWidth + 0.5) return true;
      const bb = txBar.getBoundingClientRect();
      const rs = parts.filter((e) => e && !e.hidden && e.getClientRects().length).map((e) => e.getBoundingClientRect());
      for (const r of rs) if (r.left < bb.left - 0.5 || r.right > bb.right + 0.5) return true;
      for (let i = 0; i < rs.length; i += 1) {
        for (let j = i + 1; j < rs.length; j += 1) {
          const a = rs[i], b = rs[j];
          if (a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right - 0.5 && b.left < a.right - 0.5) return true;
        }
      }
      return false;
    };
    // the caption-size labels come BEFORE the strip's pad floor here: the seated pills keep the kit pad law (inline
    // pad >= 0.4 h, e2e-ui --audit A6). With the caps counter es climbs to --small on the 496 px bar (the counter
    // keeps one line); every other shipped locale fits the default rung; --tight stays the last rung (§7 (8)(g))
    let fit = false;
    for (const grid of [false, true]) {
      txBar.classList.toggle('ob-atelier-txbar--grid2', grid);
      txBar.classList.remove('ob-atelier-txbar--tight', 'ob-atelier-txbar--small');
      if (!over()) { fit = true; break; }
      txBar.classList.add('ob-atelier-txbar--small');
      if (!over()) { fit = true; break; }
      txBar.classList.add('ob-atelier-txbar--tight');
      if (!over()) { fit = true; break; }
    }
    if (!fit) txBar.dataset.obFit = 'over';
    if (label) label.textContent = shown;
    return true;
  }
  function fitTxBar() {
    if (txBar.hidden) { txBar.classList.remove('ob-atelier-txbar--tight', 'ob-atelier-txbar--small', 'ob-atelier-txbar--narrow', 'ob-atelier-txbar--grid2'); delete txBar.dataset.obFit; return; }
    const badge = txBar.querySelector('[data-ob="atelier-txstate"]'); // null under a stale dictionary
    txBar.classList.remove('ob-atelier-txbar--tight', 'ob-atelier-txbar--small', 'ob-atelier-txbar--narrow', 'ob-atelier-txbar--grid2');
    delete txBar.dataset.obFit;
    if (badge) badge.hidden = false;
    const viewPill = txBar.querySelector('[data-ob="atelier-view"]'); // GH-1001 B1 (absent under a stale dictionary)
    if (viewPill) viewPill.hidden = false;
    if (fitTxBarV4(badge, viewPill)) return;
    // the pill the marker must clear: the full-view pill while it paints, else Put back
    const back = () => (viewPill && !viewPill.hidden ? viewPill : txBar.querySelector('[data-ob="atelier-revert"]'));
    const note = txNote;
    if (!note) return;
    if (!eqCoarse()) {
      const text = note.querySelector('.ob-atelier-txnote__text');
      const oneLine = () => {
        if (!text || !text.textContent) return true; // no sentence (a stale dictionary hid it): nothing to wrap
        if (note.scrollWidth > note.clientWidth + 0.5) return false;
        const range = document.createRange();
        range.selectNodeContents(text);
        let n = 0;
        for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) n += 1;
        return n <= 1;
      };
      if (oneLine()) return;
      txBar.classList.add('ob-atelier-txbar--narrow');
    }
    const gap = parseFloat(getComputedStyle(txBar).columnGap) || 0;
    const over = () => {
      if (txBar.scrollWidth > txBar.clientWidth + 0.5) return true;
      if (!badge || badge.hidden) return false;
      if (note.scrollWidth > note.clientWidth + 0.5) return true;
      const k = back()?.getBoundingClientRect(), b = badge.getBoundingClientRect();
      return !!k && b.right > k.left - gap + 0.5;
    };
    for (const shown of (badge ? [true, false] : [false])) { // no badge: the one badge-less pass (the yield rung is moot)
      if (badge) badge.hidden = !shown;
      txBar.classList.remove('ob-atelier-txbar--tight', 'ob-atelier-txbar--small');
      if (!over()) return;
      txBar.classList.add('ob-atelier-txbar--tight');
      if (!over()) return;
      txBar.classList.add('ob-atelier-txbar--small');
      if (!over()) return;
    }
    // GH-1001 B1: the LAST rung — the full-view pill yields before a transaction
    // pill could leave the bar (measured 800x600 de: the 288 px docked bar put
    // Keep 10 px outside it); the view it opened ends with it
    if (viewPill && !viewPill.hidden) {
      if (clearView) setClear(false);
      viewPill.hidden = true;
      txBar.classList.remove('ob-atelier-txbar--tight', 'ob-atelier-txbar--small');
      if (!over()) return;
      txBar.classList.add('ob-atelier-txbar--tight');
      if (!over()) return;
      txBar.classList.add('ob-atelier-txbar--small');
    }
  }

  // the host reveal rides the kit enter (hidden pose set in the mount's own
  // task, B-K22); the section's own enter is the shell's (slice 2) — this
  // covers the host's FIRST paint into an already-presented section
  root.hidden = true;
  section.appendChild(root);
  // review r1 P1 (the mixed-cache law, the ownership ledger :2652): a
  // CACHED pre-step-7 leaf resolves TRUTHY without mount()/unmount(), so the
  // HELPER is feature-detected, not the namespace — on any miss the plain
  // visibility flip stands (red-proven S5-Y: the pre-fix continuation threw
  // with root.hidden still true and the equipment place never painted)
  motionReady.then((m) => {
    if (typeof m?.mount === 'function') { try { m.mount(root); return; } catch { /* fall through */ } }
    root.hidden = false;
  });

  // cues deep surface (contract §3; §7 deviation 3): the card the
  // ateliercue module fills, hidden until a cue is staged. Mounted at BODY
  // level, NOT inside #ob-atelier — the host section's smoked-glass
  // backdrop-filter makes it the CONTAINING BLOCK for fixed descendants
  // (CSS filter-effects law), so an in-tree fixed card would paint inside
  // the host column and swallow its row clicks (red-proven: cue rows under
  // the mispositioned card became unclickable). The card is still torn
  // down/hidden with the station (presentStation/onShellExit).
  const cueCard = document.createElement('div');
  cueCard.id = 'ob-atelier-cue';
  cueCard.hidden = true;
  // GH-534 F5 (QA, phone register): the card mounts BEFORE #ob-shell in the
  // body order — equal z-index (8), so the SHELL chrome (rail, cards,
  // quick-play) paints and hit-tests ABOVE the sheet band. The pre-fix
  // later-sibling order painted the 38vh bottom sheet over the whole rail
  // with no dismiss: every place pill dead, the tap landing on the card's
  // disclosure summary instead. The shell root is pointer-events: none, so
  // taps AROUND its chrome still reach the sheet.
  const shellRoot = document.getElementById('ob-shell');
  if (shellRoot) document.body.insertBefore(cueCard, shellRoot);
  else document.body.appendChild(cueCard);

  // ---- showroom card rail (GH-525 S2.5 item B; design of record:
  // docs/research/design-525-carousel-taste.md §3; atelier.md §7 dev 12).
  // THE VIEW-SWAP LAW: the rail is a VIEW replacement for the option-row
  // lists — every card activation drives EXACTLY the row's handler path
  // (selectCue / stageAxis), zero selection-semantics change; the
  // `.ob-eq-prov-row` register survives verbatim as the degrade + settings
  // register (cardrail import failed → the lists render as today).
  // BODY-level mount like #ob-atelier-cue (dev 3 — the glass host's
  // backdrop-filter is a containing block for fixed descendants), inserted
  // BEFORE the cue card: paint order rail < spec sheet < #ob-shell, so the
  // phone summary sheet reads above the rail band and shell chrome above
  // both (the F5 mount-order law).
  const rail = document.createElement('div');
  rail.id = 'ob-atelier-rail';
  rail.hidden = true;
  // the cloth color chips' home while the rail is live — the GH-229 chip
  // block is a SUB-AXIS of the focused cloth (design note §3.6) and rides
  // as the secondary row above the cards strip
  const railSub = document.createElement('div');
  railSub.dataset.ob = 'atelier-rail-sub';
  railSub.classList.add('ob-mat-solid'); // one row, solid rung (G2)
  railSub.hidden = true;
  const railCards = document.createElement('div');
  railCards.dataset.ob = 'atelier-rail-cards';
  railCards.setAttribute('aria-label', t('atelier.aria.rail'));
  railCards.dataset.i18nAria = 'atelier.aria.rail';
  rail.append(railSub, railCards);
  // GH-668 S5 G4 (B-EQ04): the "k / n" position COUNT — a kit .ob-badge in
  // the secondary row's trailing slot, fed by the kit PEEK LAW helper's
  // published data-ob-rail-k / -n (ui/scrollfade.js fitPeek: the card
  // nearest the scrollport centre, 1-based, and the count) — no scroll
  // listener, no maths on this surface. aria-hidden: the listbox's
  // aria-label carries the same text (both registers). PAINTED on the
  // coarse register only — the one-card-per-view rail; the fine register
  // reads 2.75 cards at rest and keeps the label. The fine/coarse flip and
  // the station present both re-sync (presentRail).
  const railCount = document.createElement('span');
  railCount.className = 'ob-badge';
  railCount.dataset.ob = 'atelier-rail-count';
  railCount.setAttribute('aria-hidden', 'true');
  railCount.hidden = true;
  railSub.appendChild(railCount);
  let subBlockLive = false; // presentRail: the row carries the station's block
  // GH-668 S5 vfix1 (verifier P1 / ruling R-EQ-P1): the badge's HOME on the
  // coarse register is the station strip's trailing slot (ui/strip.js
  // fitStripPad budgets non-seg `others` children — the shell gear
  // precedent) while it shows, and no coarse home while hidden (#1223); the secondary row is its fine-register home (hidden there).
  // The count-only sub row was the P1 band thief (60 px over 124 px cards in
  // a 140 px scroller): no row exists for the count any more.
  const homeRailCount = () => {
    // card 32 v4 '2': while the bar is seated over the strip row (the strip hidden) the count rides the bar's
    // note cell after the PREVIEWING marker, so 「第几张 / 共几张」 never leaves the screen
    const seated = !!txNote && document.documentElement.classList.contains('ob-atelier-bartop');
    const home = seated ? txNote : !eqCoarse() ? railSub : railCount.hidden ? null : carouselMount; // #1223: no coarse home while hidden
    if (!home) railCount.remove(); else if (railCount.parentNode !== home) home.appendChild(railCount); // never the strip's hidden last child (kit edge auto margins) nor the sub row
    // on the bar it speaks in the caps voice, not as a pill: an r-full badge beside the bar's 44 px pills reads as
    // a fourth button (kit A13, one height per row)
    railCount.classList.toggle('ob-badge', !seated);
    railCount.classList.toggle('ob-caps', seated);
  };
  const railCountText = () => {
    const { obRailK: k, obRailN: n } = railCards.dataset;
    return (k && n && hasLocal('atelier.rail.count')) ? t('atelier.rail.count', { k, n }) : ''; // P2-3 gate: the badge hides under a stale dictionary
  };
  const syncRailCount = () => {
    // a CONTROL stage yields the card row (vfix1) and the kit helper drops
    // k / n with the zero clip — the badge keeps the row's last count rather
    // than blinking out of the strip (the pills would re-space on every chip)
    const txt = railCountText()
      || (rail.classList.contains('ob-atelier-rail--txcontrol') && !rail.hidden ? railCount.textContent : '');
    const reFit = railCount.textContent !== txt && railCount.parentNode === txNote; // the seated count's width moved
    if (railCount.textContent !== txt) railCount.textContent = txt;
    const label = t('atelier.aria.rail');
    railCards.setAttribute('aria-label', txt ? `${label}, ${txt}` : label);
    // the badge's own slot keeps the secondary row up on the coarse
    // register while the rail holds > 1 card (the helper publishes n only
    // then); a stale leaf without fitPeek publishes nothing → row as G2
    railCount.hidden = !(txt && !rail.hidden && eqCoarse());
    homeRailCount();
    if (reFit) fitTxBar();
    // the row shows exactly while it carries the station's own block; on
    // the coarse register the TRANSACTION BAR takes its slot while a
    // preview is staged (vfix1, R-EQ-P1): the rail is two rows — [control
    // row | bar] over [cards] — so the stack is bounded in every locale
    // (measured: a station whose row holds a 3-line name stands 86.7 px, de
    // cloth 105.6, and a three-row stack overflowed 202 / 187 px), and the
    // bottom anchor keeps the card row where the finger left it
    const txUp = eqCoarse() && !txBar.hidden;
    // card 32 v4: the v4 rail seats the bar in the host's strip row, so no rail row yields to it
    const below = rail.classList.contains('ob-atelier-rail--below');
    const subHide = !subBlockLive || (txUp && txFrom === 'card' && !below);
    // card 32 v4 (review review P2): a row that leaves with focus inside it (a rotation off the v4 rail while the
    // Advanced summary holds focus) hands it to the bar's first live control first — focus never rests on <body>
    if (subHide && !railSub.hidden && railSub.contains(document.activeElement) && !txBar.hidden) {
      txFocusTarget()?.focus({ preventScroll: true });
    }
    railSub.hidden = subHide;
    // a preview staged FROM the control row (a colour chip, the brightness
    // range, a cushion row) keeps that row alive — the drag / the next pick
    // / the open disclosure stay under the finger — and the bar takes the
    // CARD row's slot instead (atelier.css hides the cards row on coarse)
    const cardsHide = txUp && txFrom === 'control' && !below;
    // (the same hand-off for the card row a control stage hides — a rotation off the v4 rail with focus on a card)
    if (cardsHide && !rail.classList.contains('ob-atelier-rail--txcontrol') && railCards.contains(document.activeElement) && !txBar.hidden) {
      txFocusTarget()?.focus({ preventScroll: true });
    }
    rail.classList.toggle('ob-atelier-rail--txcontrol', cardsHide);
    // card 32 v4: a side column with nothing in it leaves the rail at the card column's width
    rail.classList.toggle('ob-atelier-rail--sideless', below && railSub.hidden);
    // census marker only since G2 (capture-525-shell reads it)
    section.classList.toggle('ob-atelier-host--railsub', !railSub.hidden);
  };
  new MutationObserver(syncRailCount).observe(railCards,
    { attributes: true, attributeFilter: ['data-ob-rail-k', 'data-ob-rail-n'] });
  // GH-668 S5 G3 (B-EQ03): the rail card ADOPTS the kit .ob-card-option part
  // on the solid rung (hover / active / selected / focus registers are the
  // kit's B-K15 ladder + the G9 selected register), its name the control
  // role, its class chip the kit .ob-badge voice; the equipped tick is the
  // kit .ob-status STATE marker (GH-1001 — a live state, not a provenance
  // chip) carrying the leaf's equippedLabel text, not a glyph.
  // Stamped on the MOUNT: ui/cardrail.js is a shared leaf (play.js consumes
  // it on its own mount) and gains no atelier skin; the leaf's build()
  // rewrites className on every update, so the observer re-stamps after
  // each rebuild (childList only — its own class writes never re-fire it).
  const stampRailCards = () => {
    for (const b of railCards.querySelectorAll('.ob-cardrail-card')) {
      b.classList.add('ob-card-option', 'ob-mat-solid');
      b.querySelector('.ob-cardrail-name')?.classList.add('ob-control');
      b.querySelector('.ob-cardrail-chip')?.classList.add('ob-badge');
      const tick = b.querySelector('.ob-cardrail-tick');
      if (tick && !tick.classList.contains('ob-status')) {
        tick.classList.add('ob-status', 'ob-caps');
        tick.dataset.i18n = 'atelier.card.equipped';
        tick.textContent = t('atelier.card.equipped');
      }
    }
  };
  new MutationObserver(stampRailCards).observe(railCards, { childList: true });
  document.body.insertBefore(rail, cueCard);

  // ---- the coarse geometry publisher (GH-668 S5 G2 — B-EQ02 / B-EQ04 /
  // B-EQ06; atelier.md §7 entry S5-2). ONE measured publisher, the shell's
  // --ob-shell-decision-bottom precedent (a body-level consumer reading
  // RENDERED edges — never a CSS guess at another surface's height): three
  // px properties on :root that atelier.css reads for the coarse host /
  // rail / sheet stack —
  //   --ob-eq-host-b    the host card's rendered bottom (100vh while hidden)
  //   --ob-eq-rail-h    the rail's rendered height (0 while hidden)
  //   --ob-eq-sheet-top the cue sheet's rendered top while presented on the
  //                     coarse register; else 100vh − --ob-shell-reserve-b
  //                     (the shell seam, PLAN §2), written as the number
  // rAF-coalesced + change-only writes behind a 0.5 px deadband (the K05
  // idiom): the rail's max-height reads --ob-eq-host-b while a
  // ResizeObserver watches the rail — without the deadband + coalescing
  // that is a layout feedback loop (slice-5 PLAN §5 risk 4; the S5-G arm
  // counts ≤ 2 writes after settle). Re-run on ob:shell-bands, resize,
  // presentStation and every observed box change (a cue present / dismiss
  // flips the sheet's box 0 ↔ n, which the observer reports). A stale
  // atelier.js (OWNERSHIP mixed cache) never writes them → every atelier.css
  // consumer carries today's literal as its var() fallback.
  const eqVars = { '--ob-eq-host-b': NaN, '--ob-eq-rail-h': NaN, '--ob-eq-sheet-top': NaN,
    '--ob-eq-rail-b': NaN, '--ob-eq-rail-dx': NaN, '--ob-eq-rail-l': NaN, '--ob-eq-rail-w': NaN,
    '--ob-eq-face-h': NaN };
  let eqWrites = 0, eqRaf = 0;
  const eqCoarse = () => {
    try { return window.matchMedia?.('(pointer: coarse)').matches === true; }
    catch { return false; }
  };
  // GH-1001 card 32 v2 (signed 2026-10-11: "a bigger phone preview card, its
  // text below the preview, taller"; atelier.md §7 B20-2): THE TALL PHONE
  // CARD. Phone landscape only — the short-viewport predicate the shell's
  // decision seat uses — so coarse tablets keep the wide 82 px card. On the
  // wide rail the preview face stands at 2F x F over the name at the card's
  // full measure, the chip and the Equipped marker beside the face (the one
  // anatomy that grows the face inside the band: a meta row under the name
  // costs it the gain). F is MEASURED from the live band, never reserved:
  // the rail's cap (shell rail top − sp-2 − the strip's bottom edge − sp-2)
  // less the one first-row height every first row wears on this register
  // (--ob-eq-tall-row1), the rows' gap, the card row's block pads, the
  // card's own chrome and L name lines, with a 2 px guard for the exact-fit
  // band (scrollHeight is an integer). The strip, not the host, is read: the
  // host grows by the cues hint line, the strip never does, so every
  // station and pose shares one F (the one-height law). F under 70 keeps
  // the wide card; 104 keeps every face medium (224x112 intrinsic) filling
  // its well by max-width / max-height.
  const eqPhone = () => {
    try { return window.matchMedia?.('(pointer: coarse) and (max-height: 520px)').matches === true; }
    catch { return false; }
  };
  const EQ_FACE_MIN = 70, EQ_FACE_MAX = 104;
  /** px of a CSS length resolved on a body-level probe (tokens and :root custom properties apply). */
  const eqLen = (expr) => {
    try {
      const pr = document.createElement('div');
      pr.style.cssText = 'position:fixed;width:0;visibility:hidden;pointer-events:none';
      pr.style.height = expr;
      document.body.appendChild(pr);
      const v = pr.getBoundingClientRect().height;
      pr.remove();
      return v;
    } catch { return NaN; }
  };
  const eqPx = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  /** L: 1 when every station's widest card name fits one line at the card's inner measure, else 2. */
  let eqLinesKey = '', eqLines = 2;
  const eqNameLines = (inner, nameEl) => {
    const key = `${document.documentElement.lang}|${Math.round(inner)}`;
    if (key === eqLinesKey) return eqLines;
    let widest = 0;
    try {
      const m = document.createElement('span');
      const cs = getComputedStyle(nameEl);
      m.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;white-space:nowrap;pointer-events:none';
      m.style.font = cs.font;
      m.style.letterSpacing = cs.letterSpacing;
      m.style.fontFeatureSettings = cs.fontFeatureSettings;
      document.body.appendChild(m);
      for (const st of STATION_IDS) {
        for (const it of railItems(st) ?? []) {
          m.textContent = it.label();
          widest = Math.max(widest, m.getBoundingClientRect().width);
        }
      }
      m.remove();
    } catch { return eqLines; }
    eqLinesKey = key;
    eqLines = widest <= inner ? 1 : 2;
    return eqLines;
  };
  // GH-1001 card 32 v4 (signed 2026-10-12, layout (2); atelier.md §7 B20-2 amendment v4 — the v3 reply: the tier
  // tag alone in the face's empty right half; 「文字全放下面」): every label under the face in a card max(2F,
  // the locale's two-line name measure, the widest meta row) + its pads wide, the station controls in ONE side
  // column beside the narrowed card row (one card + fitPeek's two peeks), and the preview bar seated in the host's
  // strip row while a preview is staged (syncBarTop; the host hidden, the card counter riding the bar). The bar
  // row and the controls leave the card band, so F grows into it.
  const EQ_FACE_V4_MAX = 95; // the S1 strips (336x168) stay at <= 1.70x on a 3x phone (v2 shipped 1.71x)
  const EQ_PEEK = 40; // fitPeek's peek on the card row (the v4 card column = one card + 2 x EQ_PEEK)
  /** A measure cache key: the locale and whether its webfont has settled (a fallback-font measure is not kept). */
  let eqFontGen = 0;
  try {
    document.fonts?.addEventListener?.('loadingdone', () => { eqFontGen += 1; scheduleBands(); });
  } catch { /* no font loading API: one generation */ }
  const eqFontKey = () => {
    let n = 0;
    try { for (const st of STATION_IDS) for (const it of railItems(st) ?? []) n += 1 + it.label().length; } catch { /* no inventory */ }
    return `${document.documentElement.lang}|${document.fonts?.status ?? 'loaded'}|${eqFontGen}|${n}`;
  };
  /** The widest card name's line count at a text measure (px), in the name's own font, every station's items. */
  const eqLinesAtKey = new Map();
  const eqLinesAt = (width, nameEl, fk = eqFontKey()) => {
    const key = `${fk}|${Math.round(width)}`;
    if (eqLinesAtKey.has(key)) return eqLinesAtKey.get(key);
    let worst = 1;
    try {
      const cs = getComputedStyle(nameEl);
      const lh = eqPx(cs.lineHeight) || 18;
      const m = document.createElement('div');
      m.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;overflow-wrap:anywhere';
      m.style.width = `${width}px`;
      m.style.font = cs.font;
      m.style.lineHeight = cs.lineHeight;
      m.style.letterSpacing = cs.letterSpacing;
      m.style.fontFeatureSettings = cs.fontFeatureSettings;
      if (cs.lineBreak) m.style.lineBreak = cs.lineBreak;
      if (cs.textSpacingTrim) m.style.textSpacingTrim = cs.textSpacingTrim; // ja / zh names keep the full advance (atelier.css)
      document.body.appendChild(m);
      for (const st of STATION_IDS) {
        for (const it of railItems(st) ?? []) {
          m.textContent = it.label();
          worst = Math.max(worst, Math.round(m.getBoundingClientRect().height / lh));
        }
      }
      m.remove();
    } catch { return 2; }
    eqLinesAtKey.set(key, worst);
    return worst;
  };
  /** The narrowest text measure (px) at which every station's card name fits two lines. */
  const eqTwoLineKey = new Map();
  const eqTwoLineW = (nameEl, fk = eqFontKey()) => {
    const key = fk;
    if (eqTwoLineKey.has(key)) return eqTwoLineKey.get(key);
    let lo = 80, hi = 448;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (eqLinesAt(mid, nameEl, fk) <= 2) hi = mid; else lo = mid + 1; }
    eqTwoLineKey.set(key, lo);
    return lo;
  };
  /** The widest meta row of every station's cards (the class chip + sp-1 + the Equipped marker), in px. */
  const eqMetaWKey = new Map();
  const eqMetaW = (fk = eqFontKey()) => {
    const key = fk;
    if (eqMetaWKey.has(key)) return eqMetaWKey.get(key);
    let w = 0;
    try {
      const m = document.createElement('div');
      m.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;display:flex;align-items:center;white-space:nowrap';
      m.style.gap = `${eqSp1()}px`;
      const chip = document.createElement('span');
      chip.className = 'ob-cardrail-chip ob-badge';
      const tick = document.createElement('span');
      tick.className = 'ob-cardrail-tick ob-status ob-caps';
      tick.textContent = t('atelier.card.equipped');
      m.append(chip, tick);
      document.body.appendChild(m);
      for (const st of STATION_IDS) {
        for (const it of railItems(st) ?? []) {
          const c = it.chip?.() ?? null;
          chip.style.display = c ? '' : 'none';
          chip.textContent = c ?? '';
          w = Math.max(w, m.getBoundingClientRect().width);
        }
      }
      m.remove();
    } catch { return 0; }
    eqMetaWKey.set(key, w);
    return w;
  };
  let eqTallLast = null, eqRow1Px = null;
  /** { f, lines } of the tall card from the live band, or null (the wide card stands). */
  const eqTallFace = (shellTop, spanW) => {
    const strip = eqHostRect(carouselMount);
    const card = railCards.querySelector('.ob-cardrail-card');
    const name = card?.querySelector('.ob-cardrail-name');
    if (!strip || !card || !name) return eqTallLast; // host or rail without a box: the last measure
    if (!(eqRow1Px > 0)) eqRow1Px = eqLen('var(--ob-eq-tall-row1)'); // a token calc: resolved once the sheet applies
    const row1 = eqRow1Px;
    if (!(row1 > 0)) return (eqTallLast = null); // a sheet without the tall register
    const cs = getComputedStyle(card);
    const inner = card.getBoundingClientRect().width - eqPx(cs.borderLeftWidth) - eqPx(cs.borderRightWidth)
      - eqPx(cs.paddingLeft) - eqPx(cs.paddingRight);
    const rowCs = getComputedStyle(railCards);
    const lh = eqPx(getComputedStyle(name).lineHeight);
    const band = (shellTop - 8) - (strip.bottom + eqPx(getComputedStyle(section).borderBottomWidth)) - eqSp2()
      - row1 - eqPx(getComputedStyle(rail).rowGap) - eqPx(rowCs.paddingTop) - eqPx(rowCs.paddingBottom);
    const pads = eqPx(cs.borderTopWidth) + eqPx(cs.borderBottomWidth) + eqPx(cs.paddingTop) + eqPx(cs.paddingBottom);
    const gap = eqSp1();
    const meta = card.querySelector('.ob-cardrail-meta');
    const metaH = (meta && eqPx(getComputedStyle(meta).minHeight)) || 22;
    // a sheet without the v4 block (a cached 056 atelier.css) keeps the v3 tall card (the mixed-cache law)
    if (!(eqLen('var(--ob-eq-v4-sheet, 0px)') > 0)) {
      const chrome = pads + eqPx(cs.rowGap);
      const lines = eqNameLines(inner, name);
      const f = Math.min(EQ_FACE_MAX, Math.floor(band - 2 - chrome - lines * lh));
      return (eqTallLast = f >= EQ_FACE_MIN ? { f, lines, layout: null } : null);
    }
    // the card band WITHOUT row1 (the bar and the station controls leave the card column): the largest F whose
    // card — max(2F, the two-line name measure, the widest meta row) wide — holds the face, the widest name in L
    // lines and the meta row, one height for every station
    const fk = eqFontKey(); // one key per derivation (it walks every station's labels)
    const bandB = band + row1 + eqPx(getComputedStyle(rail).rowGap);
    const padsX = eqPx(cs.borderLeftWidth) + eqPx(cs.borderRightWidth) + eqPx(cs.paddingLeft) + eqPx(cs.paddingRight);
    const floorW = Math.max(eqTwoLineW(name, fk), Math.ceil(eqMetaW(fk)));
    const sideMin = eqLen('calc(3 * var(--ob-h-coarse) + 4 * var(--ob-sp-2) + 2px)') || 166;
    for (let f = EQ_FACE_V4_MAX; f >= EQ_FACE_MIN; f -= 1) {
      const w = Math.max(2 * f, floorW);
      const lines = eqLinesAt(w, name, fk);
      const h = f + pads + gap + lines * lh + gap + metaH;
      if (h > bandB - 2) continue;
      // the span must also hold the side column at its floor (the cloth row's three swatches): else the wide
      // card stands (667x375 with insets, en / de / es)
      if (Number.isFinite(spanW) && spanW < w + padsX + 2 * EQ_PEEK + eqSp2() + sideMin) continue;
      return (eqTallLast = { f, lines, layout: 'below', cw: w + padsX, colH: h + eqPx(rowCs.paddingTop) + eqPx(rowCs.paddingBottom) });
    }
    return (eqTallLast = null);
  };
  // ---- THE EXIT-BRIDGE LAW (GH-668 S5 r10, atelier.md §7 S5-31; red-proven
  // by arm H's rude-timing leg on 891c252b): a yielded region returns only
  // after the leaving surface has cleared hit-testing. The kit's unmount()
  // (ui/motion.js, B-K22) sets `hidden` SYNCHRONOUSLY and keeps the dismissed
  // sheet painted AND hit-testable through its T_FAST exit with an inline
  // display bridge; publishBands read `hidden` as "no sheet" and returned the
  // rail at once, so for the rest of the bridge the leaving sheet's band still
  // covered the returned card row (844x390: the lower ~40 px of it) and the
  // very next tap there was delivered to the leaving sheet (measured served
  // on 891c252b: the touch events target the card, the synthesized click
  // retargets to #ob-atelier-cue — a 150 ms window, floated 0/5 at 0 ms).
  // The publisher HOLDS the yield (max-height 0, inert, visibility hidden)
  // while the sheet is hidden-but-displayed and releases it on the kit's own
  // settle — the inline display leaves — a DOM signal read the same under
  // every kit (a leaf without the bridge lands display:none at once and never
  // holds), bounded by twice the kit's documented exit bridge read from the
  // kit itself (motion.T_FAST, else the --ob-t-fast token; no bridge token =
  // no hold — the mixed-cache law, never a bare literal). The dismiss's focus
  // hand-off (focusRailCard) rides the same return. Seam census of record:
  // the the ownership ledger atelier paragraph + slice5 journal (r10).
  const eqSheetLeaving = () => {
    if (!cueCard.hidden || !cueCard.isConnected) return false;
    try { return getComputedStyle(cueCard).display !== 'none'; } catch { return false; }
  };
  /** The kit's exit bridge in ms, from the kit's own token; null without one. */
  const eqBridgeMs = () => {
    const t = Number(motion?.T_FAST);
    if (Number.isFinite(t) && t > 0) return t * 1000;
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--ob-t-fast').trim();
      const v = parseFloat(raw);
      if (Number.isFinite(v) && v > 0) return /ms$/i.test(raw) ? v : v * 1000;
    } catch { /* no token */ }
    return null;
  };
  let eqBridgeMo = null, eqBridgeTimer = 0, eqBridgeExpired = false;
  let eqPendingFocus = null; // { id, run } — a dismiss hand-off waiting for the rail's return
  const eqBridgeDisarm = () => {
    eqBridgeMo?.disconnect();
    if (eqBridgeTimer) { clearTimeout(eqBridgeTimer); eqBridgeTimer = 0; }
  };
  /** Watch the leaving sheet: republish on its settle, else after the bound. */
  const eqBridgeArm = () => {
    if (eqBridgeTimer) return; // armed
    const ms = eqBridgeMs();
    if (ms === null) { eqBridgeExpired = true; return; } // no kit bridge to wait for
    if (!eqBridgeMo && typeof MutationObserver === 'function') {
      eqBridgeMo = new MutationObserver(() => {
        // r10b R2 (THE SYNCHRONOUS SETTLE): republish in the settle's OWN
        // task — the un-yield + the parked hand-off land before the next
        // rendering update, so focus never rests on <body> for a frame
        // between the kit's settle and a rAF republish (measured on
        // 4313a7da: BODY@294 → card@311; S5-T7B). The bounded fallback
        // below is unchanged (scheduled).
        if (!eqSheetLeaving()) { eqBridgeDisarm(); publishBands(); }
      });
    }
    eqBridgeMo?.observe(cueCard, { attributes: true, attributeFilter: ['style', 'hidden'] });
    eqBridgeTimer = setTimeout(() => {
      eqBridgeTimer = 0;
      eqBridgeMo?.disconnect();
      eqBridgeExpired = true; // the bound: the rail must never stay away
      scheduleBands();
    }, 2 * ms);
  };
  const eqRect = (el) => (el && !el.hidden && el.getClientRects().length
    ? el.getBoundingClientRect() : null);
  /** --ob-sp-2 in px, resolved ONCE through a probe box (the token is
   * authored in rem; the arms' own idiom) — the kit gap the JS side reads
   * by name, never a literal mirror (review r4b hygiene). Fallback = the
   * token's documented value when the probe cannot resolve. */
  let eqSp2Px = null;
  const eqSp2 = () => {
    if (eqSp2Px !== null) return eqSp2Px;
    let v = NaN;
    try {
      const pr = document.createElement('div');
      pr.style.cssText = 'position:fixed;width:var(--ob-sp-2);height:0;visibility:hidden';
      document.body.appendChild(pr);
      v = parseFloat(getComputedStyle(pr).width);
      pr.remove();
    } catch { v = NaN; }
    eqSp2Px = Number.isFinite(v) && v > 0 ? v : 8;
    return eqSp2Px;
  };
  /** --ob-sp-1 in px (the eqSp2 idiom). */
  let eqSp1Px = null;
  const eqSp1 = () => {
    if (eqSp1Px !== null) return eqSp1Px;
    const v = eqLen('var(--ob-sp-1)');
    eqSp1Px = Number.isFinite(v) && v > 0 ? v : 4;
    return eqSp1Px;
  };
  const eqReserveB = () => {
    const v = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--ob-shell-reserve-b'));
    return Number.isFinite(v) ? v : 78; // the seam's own fallback literal
  };
  /** The shell's published rail-band top (px from the viewport top), null without the seam. */
  const eqShellTop = () => {
    const v = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--ob-shell-rail-top'));
    return Number.isFinite(v) ? v : null;
  };
  /** The shell's quick-play wrap rect (null while hidden / yielded). */
  const eqQuickPlay = () => {
    const el = document.getElementById('ob-shell-quickplay-wrap');
    const r = eqRect(el);
    if (!r || !r.width) return null;
    try { if (getComputedStyle(el).visibility === 'hidden') return null; } catch { /* keep */ }
    return r;
  };
  /** ty of an element's computed 2D transform (0 when none / not a 2D matrix). */
  const transformTy = (el) => {
    try {
      const m = getComputedStyle(el).transform;
      if (!m || m === 'none' || !m.startsWith('matrix(')) return 0;
      const ty = parseFloat(m.slice(7, -1).split(',')[5]);
      return Number.isFinite(ty) ? ty : 0;
    } catch { return 0; }
  };
  /** a host element's LAYOUT rect: the section's kit enter (translateY 8 → 0, on arrival and when the seat lets the
   * host back) moves every rect inside it for --ob-t-med, so the band, the seat and the host edge read the rest box */
  const eqHostRect = (el) => {
    const r = eqRect(el);
    const ty = r ? transformTy(section) : 0;
    return ty ? { left: r.left, right: r.right, width: r.width, height: r.height, top: r.top - ty, bottom: r.bottom - ty } : r;
  };
  function publishBands() {
    eqRaf = 0;
    const vh = window.innerHeight;
    const hostR = eqHostRect(section), railR = eqRect(rail);
    const sheetR = eqCoarse() ? eqRect(cueCard) : null;
    // GH-668 S5 G8: the sheet ENTERS through the kit (motion.mount — an
    // inline translateY(8px → 0) tween); the ResizeObserver fires on the
    // reveal, so a client-rect read here is up to 8 px LOW mid-tween and the
    // rail's band (bottom / yield) would be derived from a transient pose
    // (measured: S5-G 926x428 gap 3.3 < 4, the phone walker's 1–3 px rail /
    // sheet overlaps). The seam reads the sheet's LAYOUT top: the rect minus
    // the current 2D transform's ty (motion writes translateY / scale only).
    const sheetTop = sheetR ? sheetR.top - transformTy(cueCard) : null;
    // GH-668 S5 vfix1 (verifier P1 / ruling R-EQ-P1): the coarse rail's
    // bottom EDGE (--ob-eq-rail-b, px from the viewport top) + a leftward
    // nudge (--ob-eq-rail-dx, <= 0). The rail anchors one sp-2 above the
    // SHELL RAIL band — not above the quick-play wrap it never meets
    // horizontally (844x390: 93 px clear; the reserve-b anchor cost the band
    // 70 px and made it a scroller) — while its un-nudged box clears the
    // wrap by >= sp-2; a deficit <= 16 px is absorbed by the nudge (667x375
    // fr: 3 px); a larger deficit (the wrap in the rail's column) or no
    // shell seam falls back to today's reserve-b law. A presented sheet
    // still caps it (the yield rule below is unchanged). sp-1 / sp-2 = 4 /
    // 8 px (the kit tokens; the CSS side reads them by name).
    const reserveB = eqReserveB();
    let railB = vh - reserveB - 4, dx = 0, anchor = 'reserve';
    const shellTop = eqShellTop(), qpR = eqCoarse() ? eqQuickPlay() : null;
    // (the shell's body.ob-shell-stacked is NOT read: it flags the wrap
    // sitting anywhere above the shell rail — true at the right corner of
    // every phone landscape — while the clearance below is the whole law)
    if (railR && shellTop !== null && qpR) {
      const dxNow = Number.isFinite(eqVars['--ob-eq-rail-dx']) ? eqVars['--ob-eq-rail-dx'] : 0;
      const deficit = (railR.right - dxNow) + 8 - qpR.left;
      if (deficit <= 16) { railB = shellTop - 8; dx = Math.min(0, -deficit); anchor = 'shell'; }
    }
    if (sheetR) railB = Math.min(railB, sheetTop - 4);
    if (rail.dataset.obRailAnchor !== anchor) rail.dataset.obRailAnchor = anchor;
    // GH-1001 (atelier.md §7 B20-1): THE WIDE COARSE RAIL. The rail spans
    // from the host card's left edge to one sp-2 short of the quick-play
    // wrap — the only chrome that shares its band. The corner law's
    // symmetric 266 px reserve (atelier.css) left the band's left half
    // empty and held every phone card at 208 px with a 56x28 face.
    // Measured, never reserved: l = the host's left edge (the last one
    // while the host has no box), w = wrap left − sp-2 − l. Under the
    // 288 px floor, or without the wrap / shell seam, the class is not
    // written and the sheet's centred corner-law geometry stands (the
    // mixed-cache law: a stale sheet ignores the class, a stale module
    // never writes it).
    let wide = null;
    if (eqCoarse() && shellTop !== null) {
      const l = hostR && hostR.width ? hostR.left : eqVars['--ob-eq-rail-l'];
      const w = qpR ? qpR.left - eqSp2() - l : eqVars['--ob-eq-rail-w']; // a hidden wrap keeps the last span
      if (Number.isFinite(l) && Number.isFinite(w) && w >= 288) wide = { l, w };
    }
    if (rail.classList.contains('ob-atelier-rail--wide') !== !!wide) rail.classList.toggle('ob-atelier-rail--wide', !!wide);
    // GH-1001 card 32 v2 (B20-2): the tall phone card (the block at eqTallFace)
    const tall = wide && eqPhone() && shellTop !== null ? eqTallFace(shellTop, wide.w) : null;
    if (rail.classList.contains('ob-atelier-rail--tall') !== !!tall) rail.classList.toggle('ob-atelier-rail--tall', !!tall);
    // card 32 v4: the v4 class rides the LIVE tall class (a module without its publisher — the stale fixture's
    // T18 — never wears it)
    const below = rail.classList.contains('ob-atelier-rail--tall') && tall?.layout === 'below';
    const v4Flip = rail.classList.contains('ob-atelier-rail--below') !== below;
    if (v4Flip) rail.classList.toggle('ob-atelier-rail--below', below);
    if (v4Flip) { homeSecondary(); syncSubBlock(railStation ?? active, !rail.hidden); syncHostLine(); }
    syncBarTop();
    homeRailCount();
    const nameLines = tall ? String(tall.lines) : null;
    if ((rail.dataset.obNameLines ?? null) !== nameLines) {
      if (nameLines === null) delete rail.dataset.obNameLines;
      else rail.dataset.obNameLines = nameLines;
    }
    const next = {
      '--ob-eq-host-b': hostR ? hostR.bottom : vh,
      '--ob-eq-rail-h': railR ? railR.height : 0,
      '--ob-eq-sheet-top': sheetR ? sheetTop : vh - reserveB,
      '--ob-eq-rail-b': railB,
      '--ob-eq-rail-dx': dx,
    };
    if (wide) { next['--ob-eq-rail-l'] = wide.l; next['--ob-eq-rail-w'] = wide.w; }
    if (tall) next['--ob-eq-face-h'] = tall.f;
    if (tall?.layout === 'below') {
      // the card column (one card + the two 40 px peeks, fitPeek's) and its one height; '2' seats the staged
      // bar over the host's strip row (the strip's own box: hidden, never collapsed, while the bar is up)
      next['--ob-eq-cardcol-w'] = tall.cw + 2 * EQ_PEEK;
      next['--ob-eq-cardcol-h'] = tall.colH;
      const seat = eqHostRect(carouselMount);
      if (seat) { next['--ob-eq-seat-t'] = seat.top; next['--ob-eq-seat-l'] = seat.left; next['--ob-eq-seat-w'] = seat.width; next['--ob-eq-seat-h'] = seat.height; }
    }
    const st = document.documentElement.style;
    for (const k of Object.keys(next)) {
      const v = Math.round(next[k] * 100) / 100;
      if (Number.isFinite(eqVars[k]) && Math.abs(eqVars[k] - v) < 0.5) continue;
      eqVars[k] = v;
      st.setProperty(k, `${v}px`);
      eqWrites += 1;
    }
    // the rail YIELDS whole when a presented coarse sheet leaves it less than
    // one 44 px row between the host edge and the sheet (measured: a 23 px
    // sliver of card tops at 844x390 — not a control, the sheet's close is
    // the way back to the strip); the sheet never reads --ob-eq-rail-h, so
    // hiding the rail moves nothing else (no feedback)
    // review r4 P2-2: under a pending decision the rail is top-anchored one
    // sp-2 under max(host band, prompt edge) (atelier.css, the GH-712 yield)
    // and the sheet now seats under the same edge — the band is measured
    // from the rail's law top, so a sheet that fills the prompt's band
    // yields the rail whole (it would paint nothing but under the sheet)
    const decUp = document.documentElement.classList.contains('ob-shell-decision-up');
    const decB = decUp ? parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--ob-shell-decision-bottom')) : NaN;
    const railTopLaw = Math.max(next['--ob-eq-host-b'], Number.isFinite(decB) ? decB : 0);
    const band = sheetR ? sheetTop - railTopLaw - 12 : Infinity;
    let yielded = band < 44;
    // THE EXIT-BRIDGE LAW (r10, S5-31; the block at eqSheetLeaving): a hidden
    // sheet the kit still paints through its exit bridge is still under the
    // finger — the yield HOLDS until the bridge settles (or its bound)
    const leaving = !sheetR && eqCoarse() && eqSheetLeaving();
    if (!leaving) eqBridgeExpired = false;
    if (sheetR) eqPendingFocus = null; // a present owns its own hand-off
    if (!yielded && leaving && !eqBridgeExpired
      && rail.classList.contains('ob-atelier-rail--yield')) {
      eqBridgeArm();
      if (!eqBridgeExpired) yielded = true;
    }
    if (rail.classList.contains('ob-atelier-rail--yield') !== yielded) {
      // GH-668 S5 review r9 P2-1 (red-proven S5-Q2 KEYBOARD): the
      // yield leaves the FOCUS + ACCESSIBILITY tree, not only paint and
      // hit-testing — measured served on 5f07282a: the 0 px clipped rail kept
      // 27 focusable descendants, a real tap on a card left focus ON it inside
      // the yielded box, ArrowRight walked the selection behind the sheet, a
      // Tab walk from the sheet entered the rail. Focus is handed to the
      // presented sheet FIRST (the same target the sheet's own hand-off picks
      // on this register; a focused control must never be made inert under
      // the user), then the box goes inert (feature-detected: a UA without
      // `inert` has the sheet's visibility: hidden — the mixed-cache law,
      // either end alone is whole) and the class flips.
      if (yielded && rail.contains(document.activeElement)) {
        const to = cueCard.querySelector('[data-ob="atelier-cue-close"]')
          ?? cueCard.querySelector('.ob-atelier-actions .ob-btn:not(:disabled)');
        try { to?.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
      }
      if ('inert' in rail) rail.inert = yielded;
      rail.classList.toggle('ob-atelier-rail--yield', yielded); if (!yielded && cardRail && !railPressHeld) recentreAfterYield(railCards, railSelectedId()); // #1217 (fn at EOF)
      if (!yielded && eqPendingFocus) { // the dismiss's hand-off rides the return (r10)
        const p = eqPendingFocus; eqPendingFocus = null;
        // r10b R1 (THE HAND-OFF GUARD): the parked hand-off runs ONLY while
        // focus is still where the dismiss left it — <body>, or inside the
        // [hidden] sheet (the leaving close; inert for input by the
        // pointer-events belt). A LATER interaction inside the hold owns
        // focus (measured on 4313a7da: a station pill tapped 0-40 ms after
        // the close lost focus to the new rail's selected card 6/6) — the
        // hand-off is dropped without moving it (S5-T7B).
        const ae = document.activeElement;
        if (!ae || ae === document.body || (cueCard.hidden && cueCard.contains(ae))) p.run();
      }
    }
    fitTxBar(); // the bar's width follows the rail's (vfix1)
  }
  const scheduleBands = () => {
    if (!eqRaf) eqRaf = requestAnimationFrame(publishBands);
  };
  if (typeof ResizeObserver === 'function') {
    const eqRo = new ResizeObserver(scheduleBands);
    for (const el of [section, rail, cueCard]) eqRo.observe(el);
  }
  window.addEventListener('ob:shell-bands', scheduleBands);
  window.addEventListener('resize', scheduleBands);
  scheduleBands();

  // ---- carousel: kit leaf via guarded dynamic import; degrade = plain kit
  // buttons in the same container (every station reachable — FR-002) ------
  let carousel = null;
  const stationDescs = STATIONS.map((s) => ({
    id: s.id, labelKey: s.labelKey, label: () => t(s.labelKey),
  }));
  const degradeButtons = () => {
    carouselMount.textContent = '';
    for (const d of stationDescs) {
      const b = document.createElement('button');
      b.type = 'button';
      // ob-strip__seg: the degrade register rides the SAME kit pill
      // geometry (44/48pt floors included — review visual-audit round-7
      // MAJOR: an id-scoped degrade min-height rule was silently beating
      // the coarse floor on the healthy pills too); no .ob-atelier-station
      // (the degrade register stays selector-distinguishable — e2e B2)
      b.className = 'ob-btn ob-strip__seg';
      b.dataset.station = d.id;
      b.setAttribute('aria-current', 'false');
      const lab = document.createElement('span');
      lab.dataset.i18n = d.labelKey;
      lab.textContent = d.label();
      b.appendChild(lab);
      b.addEventListener('click', () => go(d.id));
      carouselMount.appendChild(b);
    }
    homeRailCount(); // the count's strip slot survives the rebuild (vfix1)
    // the degrade register must CONSUME every key the shell gate exempts
    // for this container (review review r1 P1: with the kit leaf absent the
    // exempted arrows fell through to the gameplay window handlers) — same
    // radiogroup semantics as the kit carousel
    carouselMount.addEventListener('keydown', (e) => {
      const at = e.target?.closest?.('[data-station]')?.dataset.station;
      if (at === undefined) return;
      const i = STATION_IDS.indexOf(at);
      let next = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = STATION_IDS[(i - 1 + STATION_IDS.length) % STATION_IDS.length];
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = STATION_IDS[(i + 1) % STATION_IDS.length];
      } else if (e.key === 'Home') next = STATION_IDS[0];
      else if (e.key === 'End') next = STATION_IDS[STATION_IDS.length - 1];
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      carouselMount.querySelector(`[data-station="${next}"]`)?.focus();
      go(next);
    });
  };
  const syncStationButtons = () => {
    if (carousel) { carousel.set(active); return; }
    for (const b of carouselMount.querySelectorAll('[data-station]')) {
      b.setAttribute('aria-current', String(b.dataset.station === active));
    }
  };
  // GH-534 round 7: ui/strip.js is the ONE segmented-strip control (the
  // shell place rail consumes the same leaf); ui/carousel.js retired in
  // this slice — the strip carries its behavior verbatim.
  import('./ui/strip.js').then((m) => {
    if (typeof m.createStrip !== 'function') { degradeButtons(); return; }
    carousel = m.createStrip(carouselMount, stationDescs, (id) => go(id),
      { dataKey: 'station', segClass: 'ob-atelier-station' });
    carousel.set(active);
    homeRailCount(); // createStrip empties the mount first (vfix1)
  }).catch(() => degradeButtons());

  // ---- scroll-edge fades (GH-534 round 7 owner finding: "scroll 的时候
  // 下端没有渐隐"): the kit fade utility arms the two block-axis scrollers
  // this surface owns — the station cards box (whose hand-rolled always-on
  // mask this replaces) and the cues spec card (which had NO fade). Kit
  // leaf via guarded dynamic import; degrade = affordance-only (scrollers
  // stay fully functional with no fade — cache-poison contract). On the
  // phone rail-host register the HOST owns scrolling and the utility's
  // overflow predicate keeps both boxes fade-free (never a lying fade).
  import('./ui/scrollfade.js').then((m) => {
    m.attachScrollFade?.(cards);
    m.attachScrollFade?.(cueCard);
    // GH-668 B-K13 / B-K04 (visual audit r1 P1 — a regression cure, so the
    // kit-slice PR adopts the kit leaf on this consumer): the station strip
    // pans inline and CLIPPED its last pill at rest on the de / fr phone
    // register ("Beleuchtung" cut mid-glyph with no affordance). The kit's
    // inline scroll-edge fade paints a truthful end / start band while the
    // strip clips (the strip owns paint → band mode) and the strip keeps
    // panning; the peek lock is the card rail's law — strips pan (A4).
    m.attachScrollFade?.(carouselMount, { axis: 'inline' });
    // GH-668 S5 G4 (B-EQ04 — the ledgered A4 gap): the cards strip owns no
    // paint → the kit inline MASK; the kit PEEK LAW helper writes the
    // component-local --sf-slot (clip − 2 × peek; atelier.css sizes the
    // coarse card on it), locks the mask band at peek + 16 and publishes
    // data-ob-rail-k / -n for the count badge. peek = 32 (the kit floor —
    // A4: a clipped neighbour shows >= 32 px of card FACE inside the mask)
    // + the strip's sp-2 gap, which sits inside the peek. A stale leaf
    // without fitPeek keeps the fade alone (no --sf-slot → the sheet's
    // 100 % fallback = the one-card view; no count published → no badge).
    m.attachScrollFade?.(railCards, { axis: 'inline' });
    m.fitPeek?.(railCards, { peek: EQ_PEEK });
    // the cloth colour scroller — a nowrap pan row of 44 px swatches on the
    // coarse register: the 7th swatch never hard-clips (the fine register's
    // row wraps, so the fade stays truthfully off there)
    if (clothChipsEl) m.attachScrollFade?.(clothChipsEl, { axis: 'inline' });
  }).catch(() => { /* affordance-only degrade */ });

  // ---- station switching (the S1 mover — D6 by reference) ----------------
  let active = null; // null = the equipment-place overview (S1 anchor pose)

  function presentStation(id) {
    // GH-534 owner ruling R3 (2026-08-16): leaving a station (or the
    // atelier — setPlace/onShellExit both land here) without Keep is an
    // EXACT revert of any staged preview. After keep() the transaction is
    // already cleared, so the commit's own exit never re-reverts.
    if (active !== id) sapi()?.preview?.revert?.();
    if (clearView) setClear(false); // GH-1001 B1: the full view never outlives its station
    if (tableAdv && id !== 'table') tableAdv.open = false; // GH-1001 F35: every return to the table lands at the host's rest height
    active = id;
    if (id === null && cuesHint) cuesHint.hidden = false; // next visit says it again (vfix1)
    for (const s of STATIONS) {
      const sec = stationSections.get(s.id);
      if (sec) sec.hidden = s.id !== id;
    }
    arrival.hidden = id !== null || !hasLocal('atelier.arrival.hint'); // the R13 arrival line (G5); P2-3 gate
    // the cards box carries nothing at arrival (every section hidden): fold
    // it so the line sits one gap under the strip on both registers, never
    // a padded blank pane (G5; atelier.css belts the display)
    cards.hidden = id === null;
    syncStationButtons();
    syncTxBar();
    if (id !== 'cues') cueMod?.clear?.(); // float removed exactly on station exit
    presentRail(id); // showroom rail follows the station (hidden on null)
    scheduleBands(); // the host / rail boxes just changed (G2 publisher)
  }

  /** Navigate to a station (carousel, rack delegation, __atelier.go).
   * No-op-on-unknown; returns the active station id. */
  function go(id, { force = false } = {}) {
    if (!STATION_IDS.includes(id)) return active;
    if (!shell.isOpen() || shell.place() !== 'equipment') {
      // live-while-closed grammar (__shell precedent): pose for the next
      // equipment arrival instead of moving a camera the shell owns
      // elsewhere (or not at all).
      pending = id;
      return active;
    }
    // GH-668 S5 G1 (B-EQ01): leaving a station with a STAGED preview is
    // never silent — the kit confirm gates the move (atelier.md §7 entry
    // S5-1); `force` is the answered / test-surface path.
    if (!force && active !== null && active !== id
      && (sapi()?.preview?.active?.() ?? null)) {
      leaveConfirm(id);
      return active;
    }
    presentStation(id);
    if (!tfReturn?.(id)) mover.moveTo(anchorOf(id), { instant: shell.instant() }); // B20-2: a staged phone table re-flies its framing
    if (id === 'cues') armCueStation();
    return active;
  }
  let pending = null;

  // ---- the S5-1 leave gate (GH-668 S5 G1, B-EQ01 / ruling R12) ------------
  // In-atelier station switches (strip pill, rack prop tap, __atelier.go)
  // while a preview is staged raise the KIT confirm (ui/dialog.js
  // confirmDialog — feature-detected dynamic import per the cache-poison
  // contract): Keep = the txbar's own Keep path (GH-541 refusal and the D14
  // re-rack exit included; a scalar commit then moves), Put back = the R3
  // exact revert then the move, dismiss (Esc / scrim) = stay, nothing
  // moves. The kit part resolves decline AND dismiss as `false` (kit
  // follow-up K-4: a neutral pair) — the decline is told apart through the
  // part's own data-ob hook. Shell-driven exits the atelier cannot veto
  // (setPlace / onShellExit) keep the exact revert and SPEAK instead (the
  // shell's notice register). No kit confirm in the cache → the notice
  // path covers this too (revert, speak, move).
  // Review r5 P2-1 (red-proven S5-L): the VISIT EPOCH. A
  // deferred continuation of this gate (the dialog.js import — held at the
  // network while the user leaves Equipment and comes back; the answer of
  // a confirm that outlived the visit through a shell-driven exit) must
  // never act on a LATER visit: the stale confirm opened over an unrelated
  // brightness preview and its Put back reverted THAT preview and moved
  // the station. `visitEpoch` moves on every arrival at and every leave /
  // close of the place (setPlace / onShellExit); every continuation here
  // captures it and drops silently — no confirm, no revert, no notice, no
  // move — when it moved or the place is no longer the leaving one. The
  // bump also releases the `leaving` latch (a hanging import must not make
  // the next visit's leave a silent no-op), and a stale settle never clears
  // a newer latch.
  let visitEpoch = 0;
  function bumpVisit() { visitEpoch += 1; leaving = false; }
  let leaving = false;
  function leaveConfirm(id) {
    if (leaving) return;
    leaving = true;
    syncStationButtons(); // the strip snaps back while the gate is up
    const epoch = visitEpoch;
    const live = () => epoch === visitEpoch && shell.isOpen() && shell.place() === 'equipment';
    const fallback = () => {
      if (!live()) return; // the visit moved on: nothing to revert, say or move
      sapi()?.preview?.revert?.();
      syncRows();
      syncTxBar();
      shell.notice?.(putBackKey());
      go(id, { force: true });
    };
    import('./ui/dialog.js').then(async (m) => {
      if (!live()) return; // the visit moved while the leaf loaded (S5-L)
      // P2-3: the confirm's copy is S5's own — under a stale dictionary the
      // pre-S5 path (exact revert, the notice, the move) is the honest degrade
      if (typeof m.confirmDialog !== 'function' || !hasLocal('atelier.leave.title') || !hasLocal('atelier.leave.body')) { fallback(); return; }
      let putBack = false;
      const answer = m.confirmDialog({
        title: t('atelier.leave.title'),
        body: t('atelier.leave.body'),
        confirmLabel: t('atelier.preview.keep'),
        cancelLabel: t('atelier.preview.revert'),
      });
      const panels = document.querySelectorAll('.ob-confirm[data-ob="confirm"]');
      const cancel = panels[panels.length - 1]?.querySelector('[data-ob="confirm-cancel"]');
      cancel?.addEventListener('click', () => { putBack = true; }, { once: true, capture: true });
      // review r1 P2: the kit settles Enter on the FOCUSED
      // button in its own keydown (preventDefault — no native click
      // follows), so the click marker alone read Enter on the initially
      // focused Put back as a dismissal (the dialog closed, nothing
      // reverted, nothing moved — red-proven S5-Z2). The keyboard
      // activation marks the explicit discard too; Space keeps native
      // click semantics and lands on the click marker. Capture on the
      // button itself: the target phase runs before the panel's bubble
      // handler settles. (dialog.js is frozen; its false is decline AND
      // dismiss — kit follow-up K-4.)
      cancel?.addEventListener('keydown', (e) => { if (e.key === 'Enter') putBack = true; }, { capture: true });
      const keep = await answer;
      if (!live()) return; // the confirm outlived the visit (a shell-driven exit under it): its answer is void
      if (keep) {
        const r = await keepStaged();
        // committed scalar → move on; a re-racking commit already exited
        // (D14); refused / declined → the transaction stays, so do we
        if (r?.committed && !r?.reracked && live()) go(id, { force: true });
      } else if (putBack) {
        sapi()?.preview?.revert?.();
        syncRows();
        syncTxBar();
        go(id, { force: true });
      }
      syncStationButtons();
    }).catch(fallback).finally(() => { if (epoch === visitEpoch) leaving = false; });
  }

  // ---- shell integration callbacks (called by the shell.js hunk) ----------
  /** Place change while the shell is open. Arriving AT equipment presents
   * the overview (station null — the S1 anchor pose the shell just drove);
   * leaving tears the deep surface down. */
  function setPlace(id) {
    bumpVisit(); // r5 P2-1: an arrival or a leave — either ends the deferred continuations of the visit before
    if (id === 'equipment') {
      const want = pending;
      pending = null;
      if (want) {
        // DEFER past the shell's own place move (review review r2 P2):
        // presentPlace runs BEFORE goTo/openShell issue the equipment
        // overview move, so a synchronous station move here would be cut
        // and overwritten by it — the microtask runs after the caller's
        // synchronous moveTo, so the station flight supersedes it (the
        // one-in-flight law cuts the overview move to its end first).
        queueMicrotask(() => {
          if (shell.isOpen() && shell.place() === 'equipment') go(want);
        });
        return;
      }
      presentStation(null);
    } else {
      cueAutoDismissed = false; // the atelier visit ends with the place
      cueUserPicked = false;
      speakPutBack(); // S5-1 (b): the shell moved us — say what the revert did
      presentStation(null);
    }
  }
  /** Shell exit: the float/deep surface never survives it (FR-004). */
  function onShellExit() {
    bumpVisit(); // r5 P2-1: the visit ends with the shell
    pending = null;
    cueAutoDismissed = false; // the atelier visit ends with the shell
    cueUserPicked = false;
    speakPutBack(); // S5-1 (b)
    presentStation(null);
  }
  /** Shell-driven exits keep the R3 exact revert (presentStation) but are
   * never silent: the notice names the put-back through the shell's own
   * key-based register (kit follow-up K-6 would let the confirm veto). */
  function speakPutBack() {
    if (sapi()?.preview?.active?.() ?? null) shell.notice?.(putBackKey());
  }
  /** Rack prop tap while open AT the equipment place (FR-001 — the ONE
   * prop delegation; shell.md §9 deviation 9). */
  function propTap() {
    go('cues');
    return true;
  }
  /** The equipment card's OWN primary action (shell.js R0 (f): a mounted
   * content module MAY own the card primary; GH-677, S4 journey QA). The
   * shell's long-press act-now on the card's non-button surfaces (the
   * brightness slider, the lux note, the card padding) used to fall
   * through to the S1 stub `showThenOpen('equipment')` — a re-pose to the
   * overview (the R3 exact-revert law then retired the STAGED fixture +
   * txbar on a gesture no user read as "leave") and the Settings modal at
   * its GAME pane (the equipment pane migrated HERE in S2). The atelier's
   * primary PRESENTS the current station: one bounded mover move back to
   * the station's own anchor (the mover is the one camera owner; no
   * station change, so presentStation's revert never runs and the staged
   * transaction survives). At the overview (station null) there is
   * nothing to present — inert by design; the settings-fronting
   * destination is gone for good. Returns the presented station id. */
  function primary() {
    if (!active || !shell.isOpen() || shell.place() !== 'equipment') return null;
    if (!tfReturn?.(active)) mover.moveTo(anchorOf(active), { instant: shell.instant() }); // B20-2: the framing, while engaged
    return active;
  }

  // ---- shared row builders (the settings provenance-card anatomy; the
  // classes deliberately carry the settings register so the e2e-ui
  // rolled-own ledger lines stay alive on the atelier walk) ----------------
  const eqName = (e) => (e.legacyOf ? legacyName(e)
    : has(`equipment.${e.id}`) ? t(`equipment.${e.id}`)
    : e.display_name);
  const provSummary = (e) => {
    if (has(`equipment.desc.${e.id}`)) return t(`equipment.desc.${e.id}`);
    const c = e.calibration ?? {};
    if (c.Measured) {
      const n = c.Measured.values?.length ?? 0;
      const s = t('settings.provSummary.measured.v2', { n });
      // cache-poison contract (the ownership ledger:43-46): a cached locale may lack the v2 key (t() returns the key)
      // or, under the OLD key, carry a `{date}` template; the fallback is a literal with no Measured read.
      return (s === 'settings.provSummary.measured.v2' || s.includes('{')) ? `First-hand measurement, ${n} values with uncertainties` : s;
    }
    return t(`settings.provSummary.${calibrationKind(c)}`);
  };
  const provDetail = (e) => { // equipment.provDetail.<id>: neutral override of branded catalog text (check-competitor-brands)
    if (has(`equipment.provDetail.${e.id}`)) return t(`equipment.provDetail.${e.id}`); const c = e.calibration ?? {};
    if (c.Measured) {
      const m = c.Measured;
      // O15 v2 (GH-789): the session id, date and doc path are provenance
      // KEYS, not display text — a Measured entry's private record never
      // reaches a card. The count is the only public fact of the tier.
      return `First-hand measurement, ${m.values?.length ?? 0} recorded values with uncertainties`;
    }
    const rec = c.Calibrated ?? c.Literature ?? c.Estimated ?? {};
    return rec.source ?? rec.note ?? '';
  };
  /** #789 legacy-alias cards: a retired digest-row id (a verbatim replay
   * can leave one in the store; no current catalog serves its row) lists as
   * ONE card keyed `<twin>~legacy` (real ids never hold `~`), named by the
   * settings display-name law and drawn with the twin's render, so the id
   * reaches no data-id, label or asset URL. The digest law is the settings
   * api's (equipmentDigestTwin / equipmentDisplayName, feature-detected
   * through sapi(): no import edge); a settings without it keeps the
   * pre-#789 listing. heldForKey maps a card key back to the held id it
   * stands for (the store value or the committed base), so a pick on the
   * legacy card re-stages that id; any other key is its own id. */
  const LEGACY_KEY = '~legacy';
  const digestTwin = (axis, id) => {
    const twin = sapi()?.equipmentDigestTwin?.(axis, id);
    return typeof twin === 'string' && twin !== id ? twin : null;
  };
  const cardKey = (axis, id) => {
    const twin = digestTwin(axis, id);
    return twin ? twin + LEGACY_KEY : id;
  };
  const keyTwin = (key) => (typeof key === 'string' && key.endsWith(LEGACY_KEY)
    ? key.slice(0, -LEGACY_KEY.length) : key);
  const heldForKey = (axis, key) => [railCurrent(axis), railCommitted(axis)]
    .find((id) => typeof id === 'string' && cardKey(axis, id) === key) ?? key;
  /** The legacy card's name: the settings law on the held id; a settings
   * without it gets the twin's name under the alias template, judged on the
   * ACTIVE dictionary (GH-313: a stale one shows the twin's name alone). */
  const legacyName = (e) => {
    const held = heldForKey(e.axis, e.id);
    const name = held !== e.id ? sapi()?.equipmentDisplayName?.(e.axis, held) : null;
    if (typeof name === 'string' && name) return name;
    const twin = eqName({ id: e.legacyOf, display_name: e.display_name ?? '—' });
    return hasLocal('equipment.legacyAlias') ? t('equipment.legacyAlias', { name: twin }) : twin;
  };
  /** Superseded/demoted ids hidden from NEW selection, grandfathered while
   * CURRENT (the settings uiDemoted law at the atelier's narrowed D2b
   * scope: persisted-current visibility — spec assumption; replay-lane
   * resolution is untouched settings/kernel machinery). MIRROR of the
   * settings.js UI_DEMOTED registry (change together — the duplicated-
   * literal law): pool_pro_9ft_measured is the measured-response table,
   * demoted from every selection surface by the entry-22 directive
   * (atelier.md §7 entry 22; calibration lineage unaffected);
   * pool_worsted_measured is the same session's companion CLOTH,
   * demoted by the companion ruling A (atelier.md §7 entry 23,
   * the same precedent verbatim). */
  const demoted = (axis, id) => !!catalogEntry(axis, id)?.superseded_by
    || (axis === 'cushion_model_id' && id === 'grip_fitted')
    || (axis === 'table_id' && id === 'pool_pro_9ft_measured')
    || (axis === 'cloth_id' && id === 'pool_worsted_measured');
  /** Legal table ids for the ACTIVE game (null = unrestricted) — the
   * settings.js legalTableIds mirror (change together). */
  const legalTables = () => {
    try {
      const tc = getGameEntry(sapi()?.get?.().game).table_class;
      return tc.kind === 'catalog' ? tc.table_ids : null;
    } catch { return null; }
  };
  // Every VISIBLE catalog entry LISTS (the T052/SC-004 catalog-browse law:
  // dossiers stay user-readable for every entry — snooker approximations,
  // carom residuals); out-of-class tables render with the pick DISABLED
  // (the 015 §7 D11 pick-state idiom — changeEquipment refuses them too).
  // #789: the EQUIPPED id always lists, ui_hidden or demoted (a finished
  // legacy replay or a stale sibling session can leave one in the store;
  // its card shows under the entry's own display name): the store value and,
  // while a preview is staged, the committed base the equipped tick keys on
  // (railCommitted). NEW selection keeps the hidden/demoted law.
  const equippedIds = (axis) => [sapi()?.get?.().equipment?.[axis], railCommitted(axis)];
  // #789: a digest-row id never lists under its own id (a stale SDK can
  // still carry its row): a held one lists as ONE synthetic legacy card
  // named on the twin, never on the stale row (it may carry personal
  // fields). The card carries no calibration: its provenance renders
  // from the twin's own entry (legacyEntry), so no record is copied.
  /** The catalog entry a card's provenance renders from: the twin's for
   * a legacy card, else the card's own. A loaded SDK without the twin's row
   * (one that predates it) gets a bare twin-id entry with an empty
   * calibration (the estimated tier), never a field of the stale row. */
  const legacyEntry = (axis, card) => (card.legacyOf
    ? catalogEntry(axis, card.legacyOf) ?? { id: card.legacyOf, calibration: {} } : card);
  const optionEntries = (axis) => {
    const kept = equippedIds(axis);
    const listed = catalogEntries(axis).filter((e) => !digestTwin(axis, e.id)
      && (!e.ui_hidden || kept.includes(e.id))
      && (!demoted(axis, e.id) || kept.includes(e.id)));
    const twin = kept.map((id) => digestTwin(axis, id)).find(Boolean);
    if (!twin) return listed;
    return [...listed, { id: twin + LEGACY_KEY, display_name: catalogEntry(axis, twin)?.display_name,
      legacyOf: twin, axis, ui_hidden: true, superseded_by: twin }];
  };
  /** #789: an out-of-class table card renders DISABLED unless it is
   * equipped (what is already equipped cannot be refused: changeEquipment's
   * ui_hidden class exemption); the support refusal still applies. */
  const tableCardOutOfClass = (legal, id) => !equippedIds('table_id').map((x) => cardKey('table_id', x)).includes(id)
    && tableOutOfClass(sapi(), legal, id);

  /** One catalog option row (name + tier badge + browse line + optional
   * dossier disclosure). `disabled` = the D11 pick-state law (out-of-class
   * tables under the active game; the dossier stays browsable). */
  const optionRow = (axis, card, onPick, { details = false, disabled = false } = {}) => {
    const e = legacyEntry(axis, card); // #789: provenance from the twin's entry
    const row = document.createElement('div');
    row.className = 'ob-eq-prov-row';
    row.dataset.id = card.id;
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.disabled = disabled && !card.legacyOf; // #789: the legacy card is the equipped id
    pick.className = 'ob-btn ob-btn--row ob-btn--ghost ob-eq-prov-row__pick'; // G8: the kit row pill (the last local pill)
    const name = document.createElement('span');
    name.className = 'ob-eq-prov-row__name';
    const label = document.createElement('span');
    label.textContent = eqName(card);
    const badge = document.createElement('span');
    const kind = calibrationKind(e.calibration);
    badge.className = 'ob-badge' + (kind === 'calibrated' ? ' ob-badge--accent' : '');
    badge.textContent = t(`settings.badge.${kind}`);
    name.append(label, badge);
    const desc = document.createElement('span');
    desc.className = 'ob-eq-prov-row__desc';
    desc.textContent = provSummary(e);
    pick.append(name, desc);
    pick.addEventListener('click', () => onPick(card.id));
    row.append(pick);
    if (details) {
      const dossier = provDetail(e);
      if (dossier) {
        const det = document.createElement('details');
        det.className = 'ob-eq-prov-row__details';
        const summary = document.createElement('summary');
        summary.className = 'ob-caps';
        summary.dataset.i18n = 'settings.provDetails';
        summary.textContent = t('settings.provDetails');
        const text = document.createElement('span');
        text.className = 'ob-eq-prov-row__text';
        text.textContent = dossier;
        det.append(summary, text);
        row.append(det);
      }
    }
    return row;
  };

  /** Commit a re-racking axis through the shipped confirm flow; the D14
   * place analog on COMMIT (value actually changed + confirmed): exit to
   * the table through the shell's state-preserving exit. Declines and
   * same-id picks stay at the station. GH-534 R3: this is now the DEGRADE
   * path only (a stale settings.js without the preview lane) — live picks
   * ride stageAxis below. */
  async function commitAxis(axis, id) {
    const api = sapi();
    if (typeof api?.changeEquipment !== 'function') return;
    const before = api.get?.().equipment?.[axis];
    const ok = await api.changeEquipment(axis, id);
    const after = api.get?.().equipment?.[axis];
    if (ok && RERACK_AXES.includes(axis) && after !== before) {
      shell.exitToTable({ activated: true }); // D14 place analog (confirm-commit → the table; GH-682 review r2: after the confirm await the gesture is stated explicitly)
    } else {
      syncRows(); // decline / same-id / refusal: reflect truth, stay here
    }
  }

  /** GH-534 owner ruling R3 (2026-08-16, PREVIEW-THEN-COMMIT): a station
   * pick stages a LIVE preview on the real table — no confirm at select.
   * The Keep affordance (txBar) commits; leaving without Keep reverts
   * exactly. Degrade: a stale settings.js without the preview seam keeps
   * the shipped select-time confirm flow (never a dead row). */
  function stageAxis(kind, id) {
    const api = sapi();
    if (typeof api?.preview?.stage !== 'function') {
      if (RERACK_AXES.includes(kind)) commitAxis(kind, id);
      else api?.set?.(kind, id); // fixture/clothColor degrade: live setter
      return;
    }
    const result = api.preview.stage(kind, id);
    if (result?.notice) shell.notice?.(result.notice);
    syncRows();
    syncTxBar();
  }

  /** Visual audit r4 P2 (GPT-6; red-proven S5-R2): a control-row stage on
   * the coarse rail presents the sticky bar over the rows' scroll band —
   * the staged row (aria-current) is revealed in the clear band below the
   * MEASURED bar + the kit gap (sp-2), also when the stage itself moved
   * nothing (844x390: bar 81..131, the tapped Han row from 81 — its name
   * under the glass while the user chooses Keep / Put back); a row clipped
   * by the rail's far edge instead comes up to read whole, never past the
   * clear band's top (667x375 en: the 89 px row's last 7 px). The scroller
   * is the nearest scrolling ancestor up to the rail (the rail itself on
   * every shipped register — the bar pins at ITS top); measured after the
   * bar's present has laid out (one frame). Fine register: the rows live
   * in the host column with no bar over them — no-op by construction. */
  function revealStagedRow(sel, id) {
    let row = null;
    try { row = document.querySelector(`${sel} .ob-eq-prov-row[data-id="${CSS.escape(String(id))}"]`); } catch { row = null; }
    if (!row || !row.closest('#ob-atelier-rail')) return;
    requestAnimationFrame(() => {
      if (txBar.hidden || row.getAttribute('aria-current') !== 'true') return;
      const bar = eqRect(txBar);
      if (!bar) return;
      let scroller = row.parentElement;
      while (scroller && scroller !== rail) {
        const oy = getComputedStyle(scroller).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 1) break;
        scroller = scroller.parentElement;
      }
      if (!scroller) scroller = rail;
      const r = row.getBoundingClientRect(), k = scroller.getBoundingClientRect();
      // the kit gap, resolved by name (r4b; the CSS side reads the same token); card 32 v4: the bar raises the band
      // only where it covers the scroller (a bar seated elsewhere or beside it clears nothing)
      const covers = bar.left < k.right && bar.right > k.left && bar.bottom > k.top && bar.top < k.bottom;
      const top = covers ? Math.max(k.top, bar.bottom + eqSp2()) : k.top;
      let delta = 0;
      if (r.top < top - 0.5) delta = r.top - top; // under the bar: the content comes down
      // clipped by the scroller's far edge: the row comes up to read WHOLE, never past the clear band's top
      else if (r.bottom > k.bottom + 0.5) delta = Math.min(r.bottom - k.bottom, r.top - top);
      if (Math.abs(delta) > 0.5) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
    });
  }

  // ---- station content ----------------------------------------------------
  // cues: hint + the picker-visible cue rows (selection → inspect via the
  // ateliercue deep module; degrade without it = the shipped between-shots
  // fast-path equip — a plain cue picker, never a dead station).
  let cueMod = null, cueModPromise = null;
  // FLOAT perf ledger (GH-525 round-4 owner finding — "the float waits
  // seconds"): selectCue stamps the selection event, ateliercue's frame
  // hook closes the tuple on the first frame that renders the new float
  // (ms = select→float-visible). Contract budget: ≤300 ms on both pointer
  // registers (design-525-carousel-taste.md choreography law; the e2e
  // latency arm asserts it, red-proven against the pre-fix bake stall).
  let cueSelPerf = null; // { id, t0, floatAt?, ms?, drawn? }
  const cueCtx = () => ({
    scene: ctx.scene, camera: ctx.camera, orbit: ctx.orbit,
    machine: ctx.machine, game: ctx.game, mover, shell,
    card: cueCard, anchor: () => anchorOf('cues'),
    settings: () => sapi(), cueSwap: () => sctx?.cueSwap ?? null,
    onEquip: () => syncRows(),
    selPerf: () => cueSelPerf,
    motion: () => motion, // the settled kit leaf (B-K22; null = degraded flip)
    visit: () => visitEpoch, // r5 P2-1: the visit epoch for the cue sheet's own deferred confirm (feature-detected there)
    // B-K06 (G8): the sheet's dismiss returns focus to the staged rail card
    // (the shell's keyboard-repair idiom) — the cues strip pill when the
    // rail is not live; never <body>
    focusRailCard: (id) => {
      // review r9 P2-1 follow-through (the FULL's S5-T T7 on 844x390 after the
      // yield joined the focus tree): the sheet's dismiss hands focus back
      // while the rail is still YIELDED — motion.unmount hides the sheet
      // SYNCHRONOUSLY, but the band is republished on the next RO tick, so
      // the target card still sat in an inert, visibility-hidden box and
      // focus() was refused (focus fell to neither the card nor <body>).
      // Republish NOW: a hidden sheet reads as no sheet, the rail leaves the
      // yield (inert off, class off) before the hand-off. Idempotent with the
      // scheduled publish.
      if (rail.classList.contains('ob-atelier-rail--yield')) publishBands();
      const run = () => {
        const sel = id ? `.ob-cardrail-card[data-id="${String(id).replace(/"/g, '')}"]` : null;
        const b = (!rail.hidden && ((sel && railCards.querySelector(sel))
          || railCards.querySelector('.ob-cardrail-card[aria-selected="true"]')))
          || carouselMount.querySelector('[data-station="cues"]');
        try { b?.focus({ preventScroll: true }); } catch { /* ok */ }
      };
      // THE EXIT-BRIDGE LAW (r10, S5-31): while the leaving sheet is still
      // hit-testable the rail stays yielded (inert, visibility hidden —
      // nothing in it can take focus); the hand-off rides the rail's return
      // (publishBands runs it the moment the yield lifts — one kit exit beat
      // at most, the bound above). The focus law itself is unchanged: the
      // staged card, never <body>.
      if (rail.classList.contains('ob-atelier-rail--yield')) { eqPendingFocus = { id, run }; return; }
      run();
    },
  });
  /** Arm the deep module; the PROMISE is the load state (review review r1
   * P1: a cue picked while the guarded import was still in flight fell
   * through to the fallback EQUIP — a persistent live-cue change where the
   * user asked to inspect). selectCue awaits it; only a REJECTED import
   * (true cache-poison absence) takes the fast-path degrade. */
  function armCueStation() {
    if (!cueModPromise) {
      cueModPromise = import('./ateliercue.js')
        .then((m) => { cueMod = m.createAtelierCue?.(cueCtx()) ?? null; })
        .catch(() => {
          cueMod = null; /* degrade: plain picker */
          // GH-534 G6 (round-2 QA): the build-time hint promises "inspect
          // it up close" while THIS branch equips immediately (the fast
          // path) — swap to the degrade-register copy. The dataset flip
          // keeps it honest across locale switches (onLocaleChange
          // re-reads data-i18n).
          const hint = cuesHint;
          if (hint) {
            hint.dataset.i18n = 'atelier.cues.hintDegraded';
            hint.textContent = t('atelier.cues.hintDegraded');
          }
        });
    }
    return cueModPromise;
  }
  async function selectCue(id) {
    cueSelPerf = { id, t0: performance.now() }; // the selection event stamp
    await armCueStation(); // resolves immediately once settled either way
    // revalidate AFTER the await (review review r2 P1): the user may have
    // left the cues station / the place / the shell while the first module
    // fetch was in flight — a stale selection must neither float a card
    // over another surface nor equip after departure
    if (!shell.isOpen() || shell.place() !== 'equipment'
      || active !== 'cues') {
      return;
    }
    if (cueMod) { cueMod.inspect(id); return; }
    // degrade path — the shipped fast path (no confirm, no re-rack)
    const swap = sctx?.cueSwap;
    if (swap?.change) await swap.change(id);
    else await sapi()?.changeEquipment?.('cue_id', id, { skipConfirm: true });
    syncRows();
  }
  // GH-668 S5 G2 (B-EQ02 / R13): the per-station SECONDARY controls — the
  // cues hint, the table Advanced disclosure, the lighting brightness row —
  // are captured by reference: on the coarse register they ride the rail's
  // secondary row (homeSecondary), so lookups never assume #ob-atelier.
  let cuesHint = null, tableAdv = null, brightRow = null;
  let brightSlider = null, luxEl = null;
  {
    const sec = stationSections.get('cues');
    const hint = document.createElement('p');
    hint.className = 'ob-atelier-hint ob-body'; // text-1 14 px (B-EQ03, G3)
    hint.dataset.i18n = 'atelier.cues.hint';
    hint.textContent = t('atelier.cues.hint');
    sec.appendChild(hint);
    cuesHint = hint;
    const list = document.createElement('div');
    list.dataset.ob = 'atelier-cues';
    sec.appendChild(list);
  }
  // GH-1001 F35: the cloth / balls stations' ONE host row on the fine rail
  // register — every station's host card stands at one height (main: cloth
  // / balls carried an empty 33 px band, the real macOS app measured the
  // card at 128 / 147 / 178 / 152 px across the stations). A one-line hint
  // in the cues hint's voice; hasLocal-gated (syncGatedCopy) — a stale
  // dictionary paints none; the row keeps its reserve (one height, blank).
  const stationHints = ['cloth', 'balls'].map((id) => {
    const p = document.createElement('p');
    p.className = 'ob-atelier-hint ob-body';
    p.dataset.ob = 'atelier-station-hint';
    p.dataset.key = `atelier.${id}.hint`;
    p.hidden = true;
    stationSections.get(id).appendChild(p);
    return p;
  });
  function syncStationHints() {
    const rail = root.classList.contains('ob-atelier--onerow');
    for (const p of stationHints) {
      const on = rail && hasLocal(p.dataset.key);
      p.textContent = on ? t(p.dataset.key) : '';
      p.hidden = !on;
    }
  }

  /** Left-column provenance block (GH-525 S2.5 item B, rail register only
   * — hidden until the cardrail leaf arrives): the rail demotes the option
   * rows (which carried name+badge+summary+dossier), so the focused/
   * selected card's provenance re-homes HERE, keeping the T052/SC-004
   * catalog-browse law alive (cardrail focus walks EVERY card, disabled
   * table picks included, and drives syncProv without staging). */
  const provBlock = () => {
    const box = document.createElement('div');
    box.dataset.ob = 'atelier-prov';
    box.hidden = true;
    // GH-668 S5 G3 (B-EQ03): the block is an inner card on the kit solid rung
    // (its dossier text read the balls scene through the pane at 3.35:1)
    box.classList.add('ob-mat-solid');
    const line = document.createElement('div');
    line.className = 'ob-atelier-prov__line';
    const name = document.createElement('b');
    name.className = 'ob-atelier-prov__name';
    const badge = document.createElement('span');
    badge.className = 'ob-badge ob-atelier-prov__badge';
    line.append(name, badge);
    const sum = document.createElement('div');
    sum.className = 'ob-atelier-prov__sum ob-body'; // text-1 14 px (B-EQ03, G3)
    const det = document.createElement('details');
    det.className = 'ob-atelier-prov__details';
    const dsum = document.createElement('summary');
    dsum.className = 'ob-caps';
    dsum.dataset.i18n = 'settings.provDetails';
    dsum.textContent = t('settings.provDetails');
    const text = document.createElement('span');
    text.className = 'ob-atelier-prov__text';
    det.append(dsum, text);
    box.append(line, sum, det);
    return box;
  };

  // table: table cards (with dossier disclosures — the settings D11
  // register) + the cushion model behind the Advanced tier (coordinator
  // ruling 2: physically part of the table; plain-language first).
  {
    const sec = stationSections.get('table');
    sec.appendChild(provBlock());
    const list = document.createElement('div');
    list.dataset.ob = 'atelier-table';
    sec.appendChild(list);
    const adv = document.createElement('details');
    // GH-668 S5 G3 (B-EQ03): the disclosure + its rows sit on the kit solid
    // rung as an inner card (the pane glass read the table scene through
    // the text-2 caps summary: 3.8:1 in ja); the summary wears the control
    // role — a disclosure summary is a control, its label carries a decision
    adv.className = 'ob-atelier-adv ob-mat-solid';
    adv.dataset.ob = 'atelier-advanced';
    const sum = document.createElement('summary');
    sum.className = 'ob-control ob-atelier-sublabel';
    sum.dataset.i18n = 'atelier.table.advanced';
    sum.textContent = t('atelier.table.advanced');
    const body = document.createElement('div');
    body.dataset.ob = 'atelier-cushion';
    adv.append(sum, body);
    sec.appendChild(adv);
    tableAdv = adv;
  }

  // cloth: cloth rows + the color chips (the GH-229 swatch grammar —
  // visual-only, no confirm). The chip block's ELEMENTS are captured
  // outside the block: while the card rail is live the whole block (label
  // + chips + name line) reparents into the rail's secondary row (sub-axis
  // law, design note §3.6) — listeners and selectors travel with the
  // nodes, so both mounts run the same GH-229 machinery.
  let clothChipsEl = null, clothNameEl = null, clothChipBlock = [];
  {
    const sec = stationSections.get('cloth');
    sec.appendChild(provBlock());
    const list = document.createElement('div');
    list.dataset.ob = 'atelier-cloth';
    sec.appendChild(list);
    const capsHead = document.createElement('b');
    // GH-668 S5 G3 (B-EQ03): the "Colour" label is a control-role text-1
    // line on the desktop sub-row (the caps voice read 1.93:1 over the
    // felt); the coarse row drops it (B-EQ04 — the radiogroup keeps the
    // aria-labelledby name; a display:none referent still names it)
    capsHead.className = 'ob-control ob-atelier-sublabel';
    capsHead.id = 'ob-atelier-clothcolor-label';
    capsHead.dataset.i18n = 'settings.clothColor';
    capsHead.textContent = t('settings.clothColor');
    sec.appendChild(capsHead);
    const chips = document.createElement('div');
    chips.dataset.ob = 'atelier-cloth-colors';
    chips.setAttribute('role', 'radiogroup');
    chips.setAttribute('aria-labelledby', 'ob-atelier-clothcolor-label');
    for (const c of ['', ...CLOTH_COLOR_IDS]) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ob-cloth-chip' + (c ? '' : ' ob-cloth-chip--factory');
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', 'false');
      chip.tabIndex = -1;
      chip.dataset.color = c;
      chips.appendChild(chip);
    }
    sec.appendChild(chips);
    const nameLine = document.createElement('div');
    nameLine.className = 'ob-atelier-clothname ob-body'; // text-1 14 px (G3)
    nameLine.dataset.ob = 'atelier-clothname';
    sec.appendChild(nameLine);
    clothChipsEl = chips;
    clothNameEl = nameLine;
    clothChipBlock = [capsHead, chips, nameLine];
    chips.addEventListener('click', (e) => {
      const chip = e.target?.closest?.('[data-color]');
      if (chip) commitClothChip(chip);
    });
    chips.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const jump = e.key === 'Home' ? 0 : e.key === 'End' ? -1 : null;
      if (!step && jump === null) return;
      e.preventDefault();
      // the shell key gate defers these keys to this container (shell.js
      // §9 dev 9) — CONSUME every exempted key here (incl. Home/End, the
      // radio first/last convention) so the aim.js window-bubble handler
      // never steps phi/power off a chip keystroke (FR-017; review r1 P1)
      e.stopPropagation();
      const all = [...chips.querySelectorAll('.ob-cloth-chip')];
      const at = all.indexOf(e.target?.closest?.('[data-color]'));
      if (at < 0 || !all.length) return;
      const next = jump !== null
        ? all[(jump + all.length) % all.length]
        : all[(at + step + all.length) % all.length];
      next.focus();
      commitClothChip(next);
    });
  }
  function commitClothChip(chip) {
    // R3 unified transaction grammar (visual-only axis): the chip previews
    // live; Keep persists; leaving the station reverts the tint exactly
    stageAxis('clothColor', chip.dataset.color);
    // the txbar presenting shrinks the scroll area (review visual-audit
    // round-2: the swatch row read as occluded at the fold) — keep the
    // control the user is working fully in view
    chip.closest('[data-ob="atelier-cloth-colors"]')
      ?.scrollIntoView({ block: 'nearest' });
  }
  /** Paint the felt swatches through the table.js seam (the settings
   * refreshClothChips recipe — real tinted felt, degrade to registry fill,
   * unpainted-but-functional last). */
  async function paintClothChips() {
    try {
      const [tMod, cvMod] = await Promise.all([
        import('../scene/table.js'), import('../scene/clothvisuals.js')]);
      for (const chip of clothChipsEl.querySelectorAll('.ob-cloth-chip')) {
        const id = chip.dataset.color;
        if (id === '' || chip.dataset.painted === '1') continue;
        let felt = null;
        if (typeof tMod.clothSwatchCanvas === 'function') {
          felt = tMod.clothSwatchCanvas(id, 88);
        } else if (cvMod.CLOTH_COLORS?.[id]) {
          felt = document.createElement('canvas');
          felt.width = felt.height = 88;
          const fctx = felt.getContext('2d');
          fctx.fillStyle = '#'
            + cvMod.CLOTH_COLORS[id].color.toString(16).padStart(6, '0');
          fctx.fillRect(0, 0, 88, 88);
        }
        if (felt) {
          chip.replaceChildren(felt);
          chip.dataset.painted = '1';
        }
      }
    } catch { /* chips stay unpainted; the strip still commits ids */ }
  }
  paintClothChips();

  // balls: ball-set rows.
  {
    const sec = stationSections.get('balls');
    sec.appendChild(provBlock());
    const list = document.createElement('div');
    list.dataset.ob = 'atelier-balls';
    sec.appendChild(list);
  }

  // lighting: fixture rows (auto + the five ids) + the brightness slider —
  // the EXISTING setters (ob:settings commit wire); §7.1 composition is the
  // S1 provenance-rebase, verified in research R7 (no new event grammar).
  {
    const sec = stationSections.get('lighting');
    sec.appendChild(provBlock());
    const list = document.createElement('div');
    list.dataset.ob = 'atelier-lighting';
    sec.appendChild(list);
    const row = document.createElement('div');
    row.className = 'ob-atelier-brightrow';
    const lab = document.createElement('label');
    lab.id = 'ob-atelier-bright-label';
    const labText = document.createElement('span');
    labText.dataset.i18n = 'settings.brightness';
    labText.textContent = t('settings.brightness');
    const lux = document.createElement('span');
    // GH-1001 F33: a live READOUT, not the provenance chip (the kit badge
    // note: "a READOUT is not a badge") — tabular digits in the body voice;
    // sentence case keeps the SI "lx"
    lux.className = 'ob-nums';
    lux.dataset.ob = 'atelier-lux';
    lab.append(labText, lux);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(BRIGHTNESS_MIN);
    slider.max = String(BRIGHTNESS_MAX);
    slider.step = '0.01';
    slider.dataset.ob = 'atelier-brightness';
    slider.setAttribute('aria-labelledby', 'ob-atelier-bright-label');
    row.append(lab, slider);
    sec.appendChild(row);
    brightRow = row; brightSlider = slider; luxEl = lux;
    const note = document.createElement('div');
    note.className = 'ob-atelier-luxnote ob-body'; // text-1 14 px (B-EQ03, G3)
    note.dataset.i18n = 'settings.lightingLuxNote';
    note.textContent = t('settings.lightingLuxNote');
    sec.appendChild(note);
    slider.addEventListener('input', () => {
      let b = Number(slider.value);
      // the marked WPA detent (settings.js recipe: ±0.024 snap window)
      if (b !== 1 && Math.abs(b - 1) <= 0.024) {
        b = 1;
        slider.value = '1';
        slider.__obSlider?.sync?.();
      }
      // R3 unified transaction grammar: the slider previews live through
      // the same lighting apply the setter used; Keep persists
      stageAxis('brightness', b);
      syncLux();
    });
  }
  function syncLux() {
    const lux = luxEl;
    const slider = brightSlider;
    if (!lux || !slider) return;
    const b = Number(slider.value);
    // 489 corner graft (review graft-r4 P2, ported here with the readout —
    // feature 032 moved it from settings.js): where the class-scoped
    // ONE-TABLE gain is in effect (the XW101 photo-fit snooker venue —
    // read from the window.__lighting seam, feature-detected per the
    // cache-poison contract), the 520-lux WPA claim is materially false,
    // so the badge drops the lux claim and shows the bare ×b multiplier.
    const gain = window.__lighting?.state?.().oneTableGain ?? 1;
    if (gain !== 1) {
      lux.textContent = t('settings.brightnessGain',
        { b: b.toFixed(2).replace(/0$/, '') });
      return;
    }
    // GH-490 round-12 (review r12-r4 P2, re-hosted here with the pane —
    // feature 032 migration): the chinese8 venue key rides a class trim
    // (lightingvisuals CLASS_FIXTURES keyTrim) — the readout reports the
    // EFFECTIVE level (≈520·b·trim lx) instead of claiming the WPA detent
    // it no longer delivers (the LG4 honesty-note precedent). Feature-
    // detected: everywhere the trim is inert (trim 1) this is
    // byte-identical to the issue-#89 readout. syncLux runs on every
    // reflect (ob:settings), which covers the r12-r5 fixture/open re-read.
    const trim = window.__lighting?.state?.()?.keyTrim ?? 1;
    lux.textContent = (trim === 1 && Math.abs(b - 1) < 1e-9)
      ? t('settings.brightnessWpa')
      : t('settings.brightnessLux', { lux: Math.round(WPA_LUX * b * trim) });
  }
  // review graft-r5 P2 (ported): on an initial snooker boot the lighting
  // module's dynamic import lands AFTER the first sync, so the gain read
  // falls back to 1 and the badge would show the false 520-lux claim until
  // some other settings event. main.js announces lighting arrival AND every
  // table/fixture relight on the dedicated ob:relight wire — re-render the
  // badge on it (idempotent, reads the live seam; atelier mounts once per
  // boot, the ob:perftier listener precedent).
  window.addEventListener('ob:relight', syncLux);

  // ---- showroom rail wiring (GH-525 S2.5 item B; atelier.md §7 dev 12) ----
  let cardRail = null;    // kit-leaf api or null (degrade = the row register)
  let railStation = null; // station the rail's cards currently render

  // ---- arrival ruling (atelier.md §7 entry 12 amendment, the wave lead
  // 2026-08-17 — the GT7 arrival grammar, hero-first): on the FINE-POINTER
  // register (the same `(pointer: coarse)` predicate the atelier.css layout
  // splits on), arriving at the cues station with a healthy rail
  // AUTO-inspects the EQUIPPED cue through the exact card-pick path
  // (railSelect → selectCue → float + ledger; a cue inspect never stages a
  // transaction, so no txbar) — the stage is never empty. The coarse
  // register keeps tap-to-inspect (the 38vh sheet must not self-open); a
  // user dismissal of the card suppresses re-opens for the REST OF THE
  // VISIT (reset on leaving the equipment place / shell exit); degrade
  // (row-list) boots keep today's behavior (cardRail null → never fires);
  // reduced motion inherits the existing instant-presentation law
  // (inspect's first-staging pose + the shell.instant() framing move).
  let cueAutoDismissed = false; // per-visit dismissal memory
  // GH-525 bare review review round-2 (finding 1): per-visit USER-PICK
  // intent memory (the dismissal-memory plumbing pattern). With a SLOW
  // armCueStation() both maybeAutoInspect and a user's card pick await the
  // same module promise; the continuations run in await-registration order
  // (auto first), so the auto's railSelect → selectCue continuation landed
  // AFTER the user's and overwrote the pick with the equipped cue. Any
  // card activation (pointer or keyboard — both funnel through the
  // cardrail onSelect wire below) during the pending window flips this
  // flag; the auto re-checks it immediately before its railSelect. Reset
  // with the visit (setPlace/onShellExit), exactly like cueAutoDismissed.
  let cueUserPicked = false;
  const coarseRegister = () => {
    try { return window.matchMedia?.('(pointer: coarse)').matches === true; }
    catch { return false; }
  };
  // dismissal detection: the card hiding WHILE the cues station is active
  // is a user dismissal (station/place exits flip `active` first via
  // presentStation, so their clear() never records one)
  new MutationObserver(() => {
    if (cueCard.hidden && active === 'cues') cueAutoDismissed = true;
  }).observe(cueCard, { attributes: true, attributeFilter: ['hidden'] });
  async function maybeAutoInspect() {
    if (!cardRail || coarseRegister() || cueAutoDismissed
      || cueUserPicked) return;
    await armCueStation();
    // the INSPECT path only: with ateliercue poisoned a card pick degrades
    // to the fast-path EQUIP — an ARRIVAL must never mutate equipment
    if (!cueMod) return;
    // revalidate after the await (the selectCue discipline) and never
    // override a pick the user already floated OR a pick still in flight
    // behind this same await (finding 1: cueUserPicked is the in-flight
    // truth — floatState alone lags one continuation behind the user)
    if (!shell.isOpen() || shell.place() !== 'equipment' || active !== 'cues'
      || cueAutoDismissed || cueUserPicked
      || cueMod.floatState?.().staged === true) return;
    const id = railCurrent('cue_id');
    if (id) railSelect(id);
  }

  /** Per-station selection axes — the view-swap law's routing table (card
   * select == the row's own pick; cues ride selectCue, never an axis). */
  const RAIL_AXIS = { table: 'table_id', cloth: 'cloth_id',
    balls: 'ballset_id', lighting: 'fixture' };

  // -- thumb sources (all guarded dynamic imports; an absent module means
  // text-led/glyph cards — never a broken station) --------------------------
  let cueThumbsMod = null; // the parallel thumbs lane (web/app/cuethumbs.js)
  const cueThumbsP = import('./cuethumbs.js')
    .then((m) => { cueThumbsMod = m; }).catch(() => { cueThumbsMod = null; });
  let cueLooksMod = null;  // class chips (scene/cuelooks.js — the item-A registry)
  import('../scene/cuelooks.js')
    .then((m) => {
      cueLooksMod = m;
      cardRail?.refresh?.();
      // GH-525 round-4 float-latency law: pre-warm every look class's maps
      // at equipment-place entry (this module is constructed exactly there),
      // equipped cue first — by the time a hand reaches the rail, every
      // class map is a cache hit and select→float stays under the 300 ms
      // budget. The kick-off DEFERS one beat (600 ms) so the warm-up's
      // sync slices (five 512 px wood bakes ~27 ms each) never contend
      // with the arrival auto-inspect + framing flight — measured: the
      // immediate kick pushed the arrival float from ~180 to ~300 ms.
      // Feature-detected (rule 5): a stale registry without the seam
      // simply skips the warm-up (the progressive preview still bounds a
      // cold selection at ~1 frame + build cost).
      setTimeout(() => {
        try { m.prewarmCueLookMaps?.([railCurrent('cue_id')]); }
        catch { /* warm-up is an optimization, never a boot risk */ }
      }, 600);
    })
    .catch(() => { cueLooksMod = null; });
  let clothVisMod = null;
  const clothVisP = import('../scene/clothvisuals.js')
    .then((m) => { clothVisMod = m; }).catch(() => { clothVisMod = null; });
  // GH-542: the fallback cloth chip needs the felt family the BED is on, not
  // the 860 default (clothThumb below). Guarded like every other seam — a
  // stale cached table.js without the export degrades to the pre-542 read.
  let clothTblMod = null;
  const clothTblP = import('../scene/table.js')
    .then((m) => { clothTblMod = m; }).catch(() => { clothTblMod = null; });
  let ballColsMod = null;
  const ballColsP = import('./ballset.js')
    .then((m) => { ballColsMod = m; }).catch(() => { ballColsMod = null; });
  // classDefaultFixture for the AUTO lighting card's strip resolution
  // (owner override 2026-08-19: the auto card shows the ACTIVE table
  // class's venue-default HARDWARE — never a fixture the class would not
  // hang). Guarded like every thumb source; absent/stale module (no
  // export) degrades the auto card to its dashed glyph — an honest
  // "follows the venue" mark, never a wrong-fixture claim.
  let lightVisMod = null;
  import('../scene/lightingvisuals.js')
    .then((m) => { lightVisMod = m; }).catch(() => { lightVisMod = null; });

  // ---- baked REAL-render card media (owner directive 2026-08-18: "选择
  // 卡片上都是实物的渲染小图, 甚至可以旋转着" — every station card carries a
  // real rendered thumb, turntable rotation on the focused card; owner
  // design REVISION same day: ISOLATED PRODUCT RENDERS — "桌子就是一个纯桌子,
  // 没有环境背景, 透明背景" — tables/balls ride alpha WebP strips and cloths
  // an alpha PNG floating swatch, the object alone on the card well;
  // owner OVERRIDE 2026-08-19 ("灯也要是那种没有其他背景的, 透明背景的,
  // 然后灯具模型旋转着", atelier.md §7 entry 18): LIGHTING joins the alpha
  // WebP turntable register — the FIXTURE model alone, the prior
  // venue-stills ruling superseded). Bake provenance:
  // tools/render/bake-station-thumbs.mjs
  // --isolated (real-scene, real-user bakealpha boots) +
  // bake-cue-thumbs.mjs --sprite (studio long-axis spin); v2 recipes +
  // fleet ledger (internal bake-recipe records). The v1 glyph
  // painters below stay as the HONEST DEGRADE (asset 404/stale cache →
  // the shipped glyph card, never a broken tile — the cache-poison
  // degrade grammar for imagery). Turntable playback is budgeted (D7):
  // ONE card animates at a time (hover wins over focus), the low perf
  // tier (window.__obPerfTier — the shell's D7 seam) and reduced motion
  // stay on the static frame-0 face.
  const SPRITE_FRAMES = 30; // bake-recipe frame law (24-36 ruled)
  const mediaProbe = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(true);
    im.onerror = () => res(false);
    im.src = src;
  });
  /** Turntable-strip thumb (tables/balls): frame-0 static face; the
   * --live card's CSS steps() animation spins it. Degrade = glyph. */
  const bakedSpinThumb = (src, fallback) => async (slots) => {
    try {
      if (!(await mediaProbe(src))) { fallback(slots); return; }
      const { img, canvas, wrap } = slots;
      img.hidden = true;
      canvas.hidden = true;
      const spin = document.createElement('span');
      spin.className = 'ob-cardrail-spin ob-cardrail-spin--turn';
      spin.style.backgroundImage = `url("${src}")`;
      spin.style.setProperty('--ob-spin-frames', String(SPRITE_FRAMES));
      wrap.appendChild(spin);
    } catch { try { fallback(slots); } catch { slots.wrap.hidden = true; } }
  };
  /** Baked still thumb (cloths — the one STATIC category left by bake
   * ruling; lighting joined the turntable register 2026-08-19): the real
   * render in the img slot. Degrade = glyph. opts.alpha marks an ISOLATED
   * alpha still (the cloth swatch): the CSS gives it the floating-object
   * drop shadow — opaque stills must never grow a silhouette shadow. */
  const bakedStillThumb = (src, fallback, opts) => async (slots) => {
    try {
      const { img } = slots;
      const ok = await new Promise((res) => {
        img.addEventListener('load', () => res(true), { once: true });
        img.addEventListener('error', () => res(false), { once: true });
        img.src = src;
      });
      if (ok) {
        img.hidden = false;
        if (opts?.alpha) img.classList.add('ob-thumb-alpha');
        return;
      }
      img.removeAttribute('src');
      fallback(slots);
    } catch { try { fallback(slots); } catch { slots.wrap.hidden = true; } }
  };
  /** Cue-card rotation overlay: the studio long-axis sprite fades in over
   * the shipped baked still on the live card only (the still IS frame 0's
   * pose family — consistency treatment, not a face swap). LAZY by law
   * (review review P2, 2026-08-18): the 13 strips decode to ~9 MiB EACH —
   * an eager per-card attach fetched all of them on station entry even in
   * modes that can never animate. The overlay attaches on a card's FIRST
   * live beat only (syncLiveCard below), so static modes (reduced motion,
   * the D7 low tier, an untouched rail) fetch zero strips. */
  const attachCueOverlay = async (btn) => {
    try {
      if (!btn || active !== 'cues' || !catalogEntry('cue_id', btn.dataset.id)) return; // #1220: a cue's own card only (a switch INTO cues blurs the left station's focused card mid-rebuild, active already 'cues')
      if (btn.querySelector('.ob-cardrail-spin--overlay')) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return; // static mode: the shipped still stays the read, no fetch
      }
      const id = btn.dataset.id;
      const wrap = btn.querySelector('.ob-cardrail-thumb');
      if (!id || !wrap) return;
      const src = `assets/cues/sprites/${id}.png`;
      if (!(await mediaProbe(src))) return; // no overlay — the still stands
      const spin = document.createElement('span');
      spin.className = 'ob-cardrail-spin ob-cardrail-spin--turn'
        + ' ob-cardrail-spin--overlay';
      spin.style.backgroundImage = `url("${src}")`;
      spin.style.setProperty('--ob-spin-frames', String(SPRITE_FRAMES));
      wrap.appendChild(spin);
    } catch { /* overlay is an enhancement — the still card stands */ }
  };
  // one-card-at-a-time turntable control (hover ?? focus; D7 low tier off)
  let spinHover = null, spinFocus = null;
  const perfTierLow = () => {
    try {
      const t = window.__obPerfTier;
      return (typeof t === 'function' ? t() : t) === 'low';
    } catch { return false; }
  };
  // GH-1001 card 32 v2 (B20-2): on the phone the LOOKED-AT card turns at
  // rest — the owner reads the face as the "3D orbit" preview, and a tapped
  // button takes no focus on iOS, so hover ?? focus left it on frame 0. Never
  // under reduced motion, and paused whenever nobody can see it: the page
  // hidden, the rail hidden or yielded, the full view on, the shell closed.
  const reducedMotion = () => {
    try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }
    catch { return false; }
  };
  const spinAtRest = () => {
    if (!eqPhone() || reducedMotion() || document.visibilityState === 'hidden') return null;
    if (rail.hidden || rail.classList.contains('ob-atelier-rail--yield') || clearView || !shell.isOpen()) return null;
    return railCards.querySelector('.ob-cardrail-card[aria-selected="true"]');
  };
  const syncLiveCard = () => {
    // stale-ref sanitation: a station switch REBUILDS the rail (new card
    // nodes) — a hover/focus ref into the old tree must never outrank a
    // live focus (hover-wins would pin an invisible detached card;
    // red-proven by the C-arm lazy leg's live:false diagnostic)
    if (spinHover && !spinHover.isConnected) spinHover = null;
    if (spinFocus && !spinFocus.isConnected) spinFocus = null;
    const want = perfTierLow() ? null : (spinHover ?? spinFocus ?? spinAtRest());
    for (const b of railCards.querySelectorAll('.ob-cardrail-card--live')) {
      if (b !== want) b.classList.remove('ob-cardrail-card--live');
    }
    want?.classList.add('ob-cardrail-card--live');
    if (want) attachCueOverlay(want); // lazy overlay: first live beat only
  };
  railCards.addEventListener('focusin', (e) => {
    spinFocus = e.target.closest?.('.ob-cardrail-card') ?? null;
    syncLiveCard();
  });
  railCards.addEventListener('focusout', () => {
    spinFocus = null;
    syncLiveCard();
  });
  railCards.addEventListener('pointerover', (e) => {
    spinHover = e.target.closest?.('.ob-cardrail-card') ?? null;
    syncLiveCard();
  });
  railCards.addEventListener('pointerleave', () => {
    spinHover = null;
    syncLiveCard();
  });
  window.addEventListener('ob:perftier', syncLiveCard);
  onClearChange = syncLiveCard;
  document.addEventListener('visibilitychange', syncLiveCard);
  try { window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', syncLiveCard); }
  catch { /* no media-query events: the next selection re-syncs */ }
  // the at-rest card follows the selection (the leaf flips aria-selected) and the rail's visibility
  if (typeof MutationObserver === 'function') {
    new MutationObserver(syncLiveCard).observe(railCards, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    new MutationObserver(syncLiveCard).observe(rail, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }

  /** Canvas ink from the token sheet (glyph tiles stay on-token; the
   * literal fires only when the computed lookup itself throws — tokens.css
   * mirrors, change together). */
  const tokenInk = (token, fallback) => {
    try {
      const v = getComputedStyle(document.body).getPropertyValue(token).trim();
      return v || fallback;
    } catch { return fallback; }
  };
  const INK_MUTED = () => tokenInk('--ob-text-2', '#9a9484'); // ob-color-exempt: getComputedStyle-failure fallback (--ob-text-2 painted value)
  const glyphCtx = (canvas, w = 112, h = 56) => {
    canvas.width = w * 2; // 2x for DPR
    canvas.height = h * 2;
    const g = canvas.getContext('2d');
    g.scale(2, 2);
    return g;
  };

  /** cues — the §3.7 thumb pipeline: baked render via the thumbs lane's
   * cueThumbSrc (feature-detected), img-fetch failure falls to the
   * registry-drawn silhouette (paintCueSilhouette), lane absent = text-led
   * card with the class chip (still fully functional). */
  const cueThumb = (id) => async ({ img, canvas, wrap }) => {
    try {
      await cueThumbsP;
      const src = typeof cueThumbsMod?.cueThumbSrc === 'function'
        ? cueThumbsMod.cueThumbSrc(id) : null;
      const silhouette = () => {
        try {
          if (typeof cueThumbsMod?.paintCueSilhouette !== 'function') return false;
          const ok = cueThumbsMod.paintCueSilhouette(canvas, id) !== false;
          canvas.hidden = !ok;
          return ok;
        } catch { return false; }
      };
      if (src) {
        img.addEventListener('load', () => { img.hidden = false; }, { once: true });
        img.addEventListener('error', () => {
          if (!silhouette()) wrap.hidden = true;
        }, { once: true });
        img.src = src;
      } else if (!silhouette()) wrap.hidden = true;
    } catch { wrap.hidden = true; }
  };

  /** cloth — the runtime swatch read per cloth id: clothVisual(id)'s felt
   * base through the GH-229 swatch presentation transform (scene/table.js
   * clothSwatchCanvas — duplicated-literal law, change together: gamma-0.5
   * lift + 25% desat toward luma, else raw albedo paints near-black). */
  const clothThumb = (key) => async ({ canvas, wrap }) => {
    const id = keyTwin(key); // #789: repaintClothThumbs passes card keys
    try {
      await Promise.all([clothVisP, clothTblP]);
      // GH-542: a cloth id may name a CONDITION over the felt family
      // (worn_slow), so the degrade painter composes it the way the bed does
      // — else the fallback chip claims a pristine cloth the app will not
      // render. Feature-detected: a stale clothvisuals.js keeps the family.
      const probe = clothVisMod?.clothVisual?.(id, undefined);
      // Is `id` a CONDITION rather than a family? clothConditionSpec returns
      // its argument UNCHANGED for every non-condition id, so this asks the
      // resolver instead of keeping a second list of condition ids in sync.
      // Bind it FIRST: an optional call on a stale module yields `undefined`,
      // and `undefined !== probe` would answer "condition" for every cloth
      // (review r6 P2) — the feature detection has to be the existence check,
      // never the comparison, or the degrade path inverts.
      const conditionOf = typeof clothVisMod?.clothConditionSpec === 'function'
        ? clothVisMod.clothConditionSpec : null;
      const isCondition = !!probe && !!conditionOf
        && conditionOf(probe, id) !== probe;
      // A condition has no felt family of its own: the bed composes it over
      // the ACTIVE VENUE's cloth (032 atelier.md §7 entry 15 remedial (b)),
      // so the chip must too — otherwise the worn chip advertises 860
      // classic_green while the table is dressed in Tournament Blue or
      // snooker green (review r4 P2). family -> color -> condition, the same
      // order table.js styleCloth uses. Degrades to the plain read when the
      // scene table is not built yet or table.js is a stale cached copy.
      const fam = isCondition ? clothTblMod?.clothFamilyBase?.() : null;
      const famSpec = fam
        ? (clothVisMod?.clothColorSpec?.(fam.clothId, fam.variant, fam.colorId)
          ?? clothVisMod?.clothVisual?.(fam.clothId, fam.variant))
        : probe;
      const spec = (conditionOf ? conditionOf(famSpec, id) : null) ?? famSpec;
      if (!Number.isFinite(spec?.color)) { wrap.hidden = true; return; }
      const [r0, g0, b0] = [(spec.color >> 16) & 255,
        (spec.color >> 8) & 255, spec.color & 255];
      const lift = (v) => 255 * Math.sqrt(v / 255);
      let [cr, cg, cb] = [lift(r0), lift(g0), lift(b0)];
      const luma = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      const desat = (v) => v + (luma - v) * 0.25;
      [cr, cg, cb] = [desat(cr), desat(cg), desat(cb)];
      const g = glyphCtx(canvas);
      g.fillStyle = `rgb(${cr | 0}, ${cg | 0}, ${cb | 0})`; // ob-color-exempt: computed felt tint (canvas content, not chrome)
      g.fillRect(0, 0, 112, 56);
      const gr = g.createLinearGradient(0, 0, 0, 56);
      gr.addColorStop(0, 'rgba(255,255,255,0.12)'); // ob-color-exempt: the table.js swatch sheen literal (canvas content)
      gr.addColorStop(0.55, 'rgba(255,255,255,0)'); // ob-color-exempt: the table.js swatch sheen literal (canvas content)
      g.fillStyle = gr;
      g.fillRect(0, 0, 112, 56);
      canvas.hidden = false;
    } catch { wrap.hidden = true; }
  };

  /** GH-542 visual-audit r6 P1-3: a CONDITION cloth card's live swatch is
   * composed over the ACTIVE VENUE's felt (family → colour → condition), so
   * it is the rail's first venue-DEPENDENT thumb — and that silently voids
   * the invariant cardrail.js's update() states in its own contract: an
   * UNCHANGED id inventory takes the refresh path, which never re-runs a
   * thumb because "thumbs are id-keyed, so no thumb can go stale". They can
   * now, and the audit caught it: re-entering the cloth station on a new
   * venue kept the previous venue's worn swatch (measured — one page, four
   * venues: 1 distinct worn chip of 4, against 4 of 4 on a fresh page each).
   * The leaf's contract is left alone (it is true for every other station,
   * and only this station reads scene state off a card): the station that
   * broke the assumption repaints its own thumbs.
   *
   * Only a live CANVAS is repainted. A committed still is one bake of one
   * venue and is venue-blind by construction — the recorded register seam
   * above, reported to 032, not this function's to paper over.
   * Signature-guarded: the syncRows echo runs on every store beat (a
   * brightness drag included) and costs one clothFamilyBase() read here. */
  let clothThumbSig = null;
  async function repaintClothThumbs({ force = false } = {}) {
    if (!cardRail || railStation !== 'cloth') return;
    try {
      // Ride the SAME import-resolution queue the composition inputs are
      // applied on: settings' clothColor path is
      // `import('../scene/table.js').then((m) => m.setClothColor(v))` queued
      // BEFORE its broadcast, and a dynamic import of an already-evaluated
      // module still resolves later than an await on a long-settled promise.
      // Awaiting clothTblP here instead reads table.js one step too early —
      // measured as an exact one-colour lag across a four-colour walk.
      await Promise.all([clothVisP, import('../scene/table.js')]);
      const fam = clothTblMod?.clothFamilyBase?.() ?? null;
      // null (scene table not built / stale table.js) is a real signature:
      // the chips then read the plain per-id swatch, and must repaint once
      // the venue resolves.
      const sig = fam ? `${fam.clothId}|${fam.variant}|${fam.colorId}` : '';
      if (sig === clothThumbSig && !force) return;
      clothThumbSig = sig; // before the loop — a re-entrant beat must not restack
      for (const card of railCards.querySelectorAll('.ob-cardrail-card')) {
        const wrap = card.querySelector('.ob-cardrail-thumb');
        const canvas = wrap?.querySelector('canvas');
        // canvas visible == the live painter owns this chip (bakedStillThumb
        // hides it and returns the moment the still decodes); hidden wrap ==
        // a card the builder already gave up on, never resurrected here
        if (!canvas || canvas.hidden || wrap.hidden) continue;
        await clothThumb(card.dataset.id)(
          { img: wrap.querySelector('img'), canvas, wrap, id: card.dataset.id });
      }
    } catch { /* chips keep their last paint; the cards stay functional */ }
  }

  // ballset.js SNOOKER_RED mirror (unexported const — the FIXTURE_IDS
  // duplicated-literal law; change together)
  const SNOOKER_RED = '#b81220'; // ob-color-exempt: ball-face color (ballset.js mirror, canvas content)
  /** The set's REAL key colors from ballset.js's exported tables, or null
   * (→ the honest uncolored outline glyph). aramith_black/arcos_reserve:
   * their published hues live UNEXPORTED in POOL_SET_STYLES — feature-
   * detected here so a future export lights the trio up; until then the
   * outline tile, never a WPA-hue claim on a set whose real paint differs
   * (realism doctrine / invented-detail screen). */
  const ballTrio = (id, m) => {
    if (!m) return null;
    if ((id === 'aramith_pool' || id === 'aramith_pool_worn' || id === 'pool_standard' || id === 'pool_used') && m.BALL_COLORS) {
      // the legacy WPA paint these ids actually ship (ballset.js
      // poolSetStyle: unknown/worn ids keep WPA byte-identically)
      return [{ fill: m.BALL_COLORS[0]?.[0] }, { fill: m.BALL_COLORS[1]?.[0] },
        { fill: m.BALL_COLORS[0]?.[0], band: m.BALL_COLORS[9]?.[0] }];
    }
    if (id === 'snooker' && m.SNOOKER_BALL_COLORS) {
      return [{ fill: SNOOKER_RED }, { fill: m.SNOOKER_BALL_COLORS[20] },
        { fill: m.SNOOKER_BALL_COLORS[21] }];
    }
    if (id === 'carom' && m.CAROM_BALL_COLORS) {
      return [0, 1, 2].map((i) => ({ fill: m.CAROM_BALL_COLORS[i] }));
    }
    const s = m.POOL_SET_STYLES?.[id];
    if (s?.colors) {
      return [{ fill: s.white }, { fill: s.colors[1] }, { fill: s.colors[8] }];
    }
    return null;
  };
  const ballThumb = (id) => async ({ canvas, wrap }) => {
    try {
      await ballColsP;
      const trio = ballTrio(id, ballColsMod);
      const g = glyphCtx(canvas);
      let x = 20;
      for (let i = 0; i < 3; i++) {
        const b = trio?.[i];
        g.beginPath();
        g.arc(x, 28, 14, 0, Math.PI * 2);
        if (b?.fill) { g.fillStyle = b.fill; g.fill(); } else {
          g.strokeStyle = INK_MUTED();
          g.lineWidth = 2;
          g.stroke();
        }
        if (b?.band) {
          g.save();
          g.beginPath();
          g.arc(x, 28, 14, 0, Math.PI * 2);
          g.clip();
          g.fillStyle = b.band;
          g.fillRect(x - 14, 21, 28, 14);
          g.restore();
        }
        x += 36;
      }
      canvas.hidden = false;
    } catch { wrap.hidden = true; }
  };

  /** table — v1 honest iconography (design note §3.6: glyph + name, no
   * fake renders): the 2:1 bed outline; pocket marks only on pocketed
   * geometries (a carom card must never claim pockets). */
  const tableThumb = (entry) => ({ canvas, wrap }) => {
    try {
      const g = glyphCtx(canvas);
      g.strokeStyle = INK_MUTED();
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(20, 10, 72, 36, 5);
      g.stroke();
      g.globalAlpha = 0.55;
      g.beginPath();
      g.roundRect(26, 16, 60, 24, 2);
      g.stroke();
      g.globalAlpha = 1;
      if (!/carom/i.test(String(entry.geometry ?? ''))) {
        g.fillStyle = INK_MUTED();
        for (const [px, py] of [[20, 10], [56, 9], [92, 10],
          [20, 46], [56, 47], [92, 46]]) {
          g.beginPath();
          g.arc(px, py, 2.6, 0, Math.PI * 2);
          g.fill();
        }
      }
      canvas.hidden = false;
    } catch { wrap.hidden = true; }
  };

  /** lighting — per-fixture glyphs (same honesty register): drop + shade
   * form per id, dashed for auto (follows the venue), soft pool below. */
  const lampThumb = (f) => ({ canvas, wrap }) => {
    try {
      const g = glyphCtx(canvas);
      const ink = INK_MUTED();
      g.strokeStyle = ink;
      g.fillStyle = ink;
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(56, 4);
      g.lineTo(56, 14);
      g.stroke();
      if (f === 'auto') g.setLineDash([4, 3]);
      if (f === 'pendant_bar') {
        g.beginPath();
        g.moveTo(26, 14);
        g.lineTo(86, 14);
        g.stroke();
        for (const px of [34, 56, 78]) {
          g.beginPath();
          g.moveTo(px - 6, 24);
          g.lineTo(px + 6, 24);
          g.lineTo(px + 3, 16);
          g.lineTo(px - 3, 16);
          g.closePath();
          g.stroke();
        }
      } else if (f === 'perimeter_ring') {
        g.beginPath();
        g.roundRect(24, 14, 64, 12, 6);
        g.stroke();
      } else {
        const w = f === 'snooker_luminaire' ? 76
          : f === 'carom_luminaire' ? 56 : 64;
        g.beginPath();
        g.roundRect(56 - w / 2, 14, w, 12, 3);
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 0.3;
      g.beginPath();
      g.moveTo(40, 28);
      g.lineTo(72, 28);
      g.lineTo(88, 50);
      g.lineTo(24, 50);
      g.closePath();
      g.fill();
      canvas.hidden = false;
    } catch { wrap.hidden = true; }
  };

  // -- transaction-aware card state (the R2/R3 semantics, caller-driven) ----
  /** Store truth for an axis (STAGED-or-committed — preview stages ride the
   * transient set() path, so get() already reflects them). */
  function railCurrent(axis) {
    const v = sapi()?.get?.();
    if (!v) return null;
    if (axis === 'cue_id') return v.equipment?.cue_id ?? null;
    if (axis === 'fixture') return v.fixtureAuto ? 'auto' : v.fixture;
    return v.equipment?.[axis] ?? null;
  }
  /** Committed base for an axis — the preview transaction's recorded base
   * while staged (__settings.preview.active() bases are COMMITTED truth):
   * the equipped-tick chip keys on THIS, so a staged preview shows the
   * staged ring on the new card while the tick stays on the base. */
  function railCommitted(axis) {
    const p = sapi()?.preview?.active?.() ?? null;
    if (axis === 'fixture') {
      const base = p?.scalars?.fixture;
      return base ? (base.setter ?? 'auto') : railCurrent('fixture');
    }
    const base = p?.equipment?.[axis];
    return base !== undefined ? base : railCurrent(axis);
  }
  const railStaged = (axis) => {
    const p = sapi()?.preview?.active?.() ?? null;
    return axis === 'fixture'
      ? p?.scalars?.fixture !== undefined
      : p?.equipment?.[axis] !== undefined;
  };

  /** Card descriptors per station — the SAME option inventories the row
   * register renders (cueSwap seam / optionEntries / FIXTURE_IDS mirror). */
  function railItems(station) {
    if (station === 'cues') {
      const ids = (sctx?.cueSwap?.options?.() ?? optionEntries('cue_id'))
        .map((o) => o.id);
      return ids.map((id) => {
        const e = catalogEntry('cue_id', id);
        if (!e) return null;
        return {
          id,
          label: () => eqName(e),
          chip: () => {
            const cls = cueLooksMod?.cueLookFor?.(id)?.class;
            return cls && has(`atelier.class.${cls}`)
              ? t(`atelier.class.${cls}`) : null;
          },
          equipped: () => railCurrent('cue_id') === id,
          staged: () => false, // cue equip is the fast path — no transaction
          disabled: () => equipmentPickRefused(sapi(), 'cue_id', id),
          // face = the shipped baked still; the rotation overlay attaches
          // LAZILY on the card's first live beat (attachCueOverlay)
          thumb: cueThumb(id),
        };
      }).filter(Boolean);
    }
    if (station === 'lighting') {
      // isolated FIXTURE turntables (owner override 2026-08-19, atelier.md
      // §7 entry 18 — supersedes the venue-stills ruling): the card shows
      // the HARDWARE, the fixture model alone on alpha, riding the exact
      // tables/balls strip machinery (focused-card-only spin, reduced
      // motion static). The light FIELD stays the live preview's job.
      // 'auto' owns no hardware — its card resolves to the ACTIVE table
      // class's venue-default fixture (classDefaultFixture; degrade =
      // the dashed auto glyph, never a wrong-fixture claim).
      const stripId = (f) => (f === 'auto'
        ? lightVisMod?.classDefaultFixture?.() ?? null
        : f);
      return ['auto', ...FIXTURE_IDS].map((f) => ({
        id: f,
        label: () => t(`settings.fixture.${f}`),
        chip: () => null,
        equipped: () => railCommitted('fixture') === f,
        staged: () => railStaged('fixture') && railCurrent('fixture') === f,
        disabled: () => false,
        thumb: stripId(f)
          ? bakedSpinThumb(`assets/stations/lighting/${stripId(f)}.webp`,
            lampThumb(f))
          : lampThumb(f),
      }));
    }
    const axis = RAIL_AXIS[station];
    if (!axis) return [];
    // #789: a retired card (superseded_by; a legacy key) draws its twin; a
    // stale SDK row without superseded_by asks the settings api for the
    // kernel row's (feature-detected; the id itself without it)
    const media = (id) => {
      const m = sapi()?.equipmentMediaId?.(axis, id);
      return typeof m === 'string' && m ? m : id;
    };
    const vid = (e) => e.superseded_by ?? media(e.id);
    return optionEntries(axis).map((e) => ({
      id: e.id,
      label: () => eqName(e),
      // the calibration-tier badge is the card's type chip (the row
      // register's badge voice — existing keys, no new strings)
      chip: () => t(`settings.badge.${calibrationKind(legacyEntry(axis, e).calibration)}`),
      equipped: () => cardKey(axis, railCommitted(axis)) === e.id,
      staged: () => railStaged(axis) && cardKey(axis, railCurrent(axis)) === e.id,
      disabled: () => {
        if (e.legacyOf) return false;
        if (axis !== 'table_id') return equipmentPickRefused(sapi(), axis, e.id);
        const legal = legalTables();
        return tableCardOutOfClass(legal, e.id) || equipmentPickRefused(sapi(), axis, e.id);
      },
      // isolated product renders (owner design revision 2026-08-18; the
      // atelier.md §7 isolated product-render entry): alpha WebP strips /
      // alpha PNG swatch stills — the object alone floats on the card well
      //
      // RECORDED SEAM (GH-542 review r5 P2, reported to 032 on GH-525): a
      // committed cloth still is ONE bake of ONE venue, and under the §7
      // entry 15 remedial (b) rule the bed's felt family comes from the
      // VENUE — so every cloth card, not just the condition one, shows the
      // default venue's felt on a snooker/carom/chinese8 table, on
      // wpa_spec_9ft (classic_green), and under any GH-229 colour override.
      // MEASURED on the shipped build: all five family cloth ids render the
      // SAME bed (0c5a9c) on the default venue, while the committed
      // snooker_napped and carom_worsted_heated stills are green and
      // blue-grey — two of the six chips already contradict the rule. The
      // fix is a register decision (venue-keyed bakes, or a live-composed
      // swatch for the whole station) inside a FROZEN contract, so it is
      // reported up rather than taken here; the live fallback below composes
      // over the venue because it CAN, and that asymmetry is deliberate.
      thumb: axis === 'cloth_id'
        ? bakedStillThumb(`assets/stations/cloths/${vid(e)}.png`,
          clothThumb(vid(e)), { alpha: true })
        : axis === 'ballset_id'
          ? bakedSpinThumb(`assets/stations/balls/${vid(e)}.webp`,
            ballThumb(vid(e)))
          : bakedSpinThumb(`assets/stations/tables/${vid(e)}.webp`,
            tableThumb(catalogEntry(axis, vid(e)) ?? e)),
    }));
  }

  /** The rail's selected card: the INSPECTED cue on the cues station
   * (falls to the equipped id before the first pick — the Forza-2023
   * lesson: the rail initializes AT the equipped item), the staged-or-
   * committed store value elsewhere. */
  function railSelectedId() {
    if (active === 'cues') {
      return cueMod?.floatState?.().id ?? railCurrent('cue_id');
    }
    return RAIL_AXIS[active] ? cardKey(RAIL_AXIS[active], railCurrent(RAIL_AXIS[active])) : null;
  }

  /** Present/hide the rail for a station — the #ob-atelier-cue lifecycle
   * discipline: shown only while the atelier is the active place's content
   * (presentStation), torn down with it on place/shell exit. */
  /** GH-668 S5 G2 (B-EQ02 / ruling R13): on the COARSE register the
   * live-rail host is heading + strip — the station's secondary control
   * (lighting brightness row, table Advanced disclosure, cues hint) rides
   * the rail's secondary row beside the cloth chips: the chips' own
   * reparent idiom (listeners travel with the nodes); the fine register
   * keeps them in the host column. Re-homed on a pointer-register flip. */
  // GH-668 S5 vfix1 (R-EQ-P1): the cues HINT is the arrival line — it stays
  // in the HOST under the strip and is said ONCE per visit (syncHostLine);
  // the lighting brightness row and the table Advanced disclosure are the
  // station's CONTROL rows and ride the rail's secondary row (the coarse
  // Advanced summary in the host would cost the 667x375 table-staged stack
  // its whole-card budget: 44 px floor + pads vs 187 px).
  const secondaryOf = () => [['lighting', brightRow], ['table', tableAdv]];
  /** The coarse live-rail host paints its station box only while it carries
   * the (unsaid) cues hint — atelier.css .ob-atelier-host--line. */
  function syncHostLine() {
    const line = !!cardRail && eqCoarse() && active === 'cues'
      && !!cuesHint && !cuesHint.hidden && cuesHint.parentNode !== railSub;
    section.classList.toggle('ob-atelier-host--line', line);
  }
  const secondaryHome = new Map();
  // review r2 P2-2: re-homed into railSub the Advanced summary,
  // its cushion picks and the brightness range sit inside the shell's
  // KEY_GATE_EXEMPT lane (#ob-atelier-rail) but OUTSIDE the cards listbox
  // handler, so the deferred keys reached aim.js from a focused control on a
  // coarse device with an external keyboard (red-proven S5-Z3: ArrowLeft
  // stepped game.phi, ArrowUp raised #power; the host column is shell-gated).
  // The row CONSUMES the exempted keys itself — the txBar idiom above:
  // arrows / Home / End are no row gesture (preventDefault + stopPropagation)
  // EXCEPT on the brightness range, whose native arrow step is the control
  // (stopPropagation only — the default action survives); Enter / Space keep
  // their native activation (summary toggle, pick click; stopPropagation
  // only). Tab is never touched. The cloth chips' own handler stops first.
  railSub.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      const range = e.target instanceof HTMLInputElement && e.target.type === 'range';
      if (!range) e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  });
  function homeSecondary() {
    const toRail = !!cardRail && eqCoarse();
    // GH-668 S5 review r6 P2: the coarse host FOLD (atelier.css
    // `.ob-atelier-host--rehomed:not(.ob-atelier-host--line) #ob-atelier-cards`)
    // is keyed on THIS marker — worn exactly while the station's secondary
    // controls live in the rail row. A cached pre-S5 module (the supported
    // fresh-CSS / stale-JS pairing) never sets it and keeps its cards box,
    // where it still homes the brightness slider + the Advanced disclosure
    // (pre-fix the fold keyed on `--line` alone and hid both — arm S5-HF).
    section.classList.toggle('ob-atelier-host--rehomed', toRail);
    // card 32 v4: on the 'below' rail the cues arrival line rides the side column (the host keeps no line, so
    // its one-height band is never cut by the host growing at cues)
    if (cuesHint) {
      const toSide = toRail && rail.classList.contains('ob-atelier-rail--tall') && rail.classList.contains('ob-atelier-rail--below');
      if (toSide && cuesHint.parentNode !== railSub) {
        secondaryHome.set(cuesHint, { parent: cuesHint.parentNode, next: cuesHint.nextSibling });
        railSub.appendChild(cuesHint);
      } else if (!toSide && cuesHint.parentNode === railSub) {
        const h = secondaryHome.get(cuesHint);
        cuesHint.classList.remove('ob-atelier-hint--away');
        h?.parent?.insertBefore(cuesHint, h.next?.parentNode === h.parent ? h.next : null);
      }
    }
    for (const [, node] of secondaryOf()) {
      if (!node) continue;
      if (toRail && node.parentNode !== railSub) {
        secondaryHome.set(node, { parent: node.parentNode, next: node.nextSibling });
        railSub.appendChild(node);
      } else if (!toRail && node.parentNode === railSub) {
        const h = secondaryHome.get(node);
        node.hidden = false; // the station section governs it again
        h?.parent?.insertBefore(node, h.next?.parentNode === h.parent ? h.next : null);
      }
    }
  }
  let railSettle = null; // the pending at-rest judge (one per arrival)
  function settleRailAtRest(station) {
    if (railSettle) { railCards.removeEventListener('scrollend', railSettle); clearTimeout(railSettle.timer); }
    let tries = 0;
    const lookedAt = () => {
      const id = railSelectedId();
      return id === null ? null
        : railCards.querySelector(`.ob-cardrail-card[data-id="${CSS.escape(String(id))}"]`);
    };
    const whole = (b) => { // #1206: inside the strip's inline padding, the edge gap the leaf's own snap clamps to
      if (!b) return true;
      const r = b.getBoundingClientRect(), m = railCards.getBoundingClientRect(), pad = parseFloat(getComputedStyle(railCards).paddingLeft) || 0;
      return r.left >= m.left + pad - 0.5 && r.right <= m.right - pad + 0.5;
    };
    // the judge acts on the strip's OWN drift only (measured 2–44 px): a hand
    // on the strip or a navigation-sized scroll (>= 64 px from the arrival
    // snap — a card is 208 + 8) disarms it, so a swipe right after arrival is
    // never pulled back (S5-B/G's cloth pick found the pull-back)
    let x0 = null;
    const disarm = () => { if (railSettle === judge) { railSettle = null; clearTimeout(judge.timer); } };
    for (const ev of ['pointerdown', 'touchstart', 'wheel', 'keydown']) railCards.addEventListener(ev, disarm, { once: true, passive: true });
    const judge = () => {
      if (railSettle !== judge) return; // superseded by a later arrival
      clearTimeout(judge.timer);
      if (x0 === null) x0 = railCards.scrollLeft;
      if (Math.abs(railCards.scrollLeft - x0) >= 64) { railSettle = null; return; }
      const b = lookedAt();
      if (!cardRail || railStation !== station || rail.hidden || whole(b) || tries >= 2) { railSettle = null; return; }
      tries += 1;
      // the leaf's arrival snap is already instant (a fresh present) and a
      // same-id select is a no-op; the drift is re-centred INSTANTLY by the
      // card itself — inline 'center' + the clip clamp is the leaf's own
      // fully-inside rest (no maths duplicated), nothing left to interrupt
      try { b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }); } catch { /* old engines */ }
      railCards.addEventListener('scrollend', judge, { once: true });
      judge.timer = setTimeout(judge, 400);
    };
    railSettle = judge;
    // any drift ends in a scrollend; a strip that drifted without one is judged by the timer
    railCards.addEventListener('scrollend', judge, { once: true });
    judge.timer = setTimeout(judge, 900);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (railSettle !== judge) return;
      x0 = railCards.scrollLeft; // the arrival snap's rest = the drift's origin
      if (whole(lookedAt()) === false) judge();
    }));
  }
  // THE SLOT-RESTORE clause (play.js's, the ownership ledger "after ANY slot /
  // scrollport change the COMMITTED card is restored whole") on the cards
  // strip. The coarse card takes its width from the kit-written --sf-slot;
  // a strip read while hidden carries --sf-slot 0px (cards at the 44 px
  // floor), and presentRail's arrival snap runs synchronously on unhide —
  // before fitPeek's next frame widens the cards — so a selected card past
  // the first rested outside the strip (the S5-W arrival class: measured
  // cr-snap sw 330 bw 44, card later at 718 vs the 278..566 strip) and the
  // at-rest judge, which had seen a whole 44 px card, was already done.
  // Fires only when the slot VALUE changes (never on the fade's
  // scroll-driven style writes) and only on the coarse register (the fine
  // card width never reads --sf-slot, so a fine resize keeps the user's
  // pan); nothing under a held press, nothing while the rail is hidden. A
  // keyboard-focused card (a disabled card is focus/browse-only) is the one
  // revealed, as play.js reveals the browsed card; otherwise the selected
  // card is re-centred instantly by the judge's own call when not whole. The sync path is not a trigger
  // (a store echo must never fight a user pan). One observer for the
  // strip's life: railCards is built once per page and never replaced (the
  // leaf rebuilds its children, not the mount), like the observers above.
  let railPressHeld = false;
  railCards.addEventListener('pointerdown', () => { railPressHeld = true; }, { capture: true, passive: true });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(type, () => { railPressHeld = false; }, { capture: true, passive: true });
  }
  window.addEventListener('blur', () => { railPressHeld = false; });
  if (typeof MutationObserver === 'function') {
    let lastSlot = railCards.style.getPropertyValue('--sf-slot');
    new MutationObserver(() => {
      const slot = railCards.style.getPropertyValue('--sf-slot');
      if (slot === lastSlot) return;
      lastSlot = slot;
      if (!cardRail || rail.hidden || !eqCoarse() || railCards.clientWidth === 0 || railPressHeld) return;
      const focused = document.activeElement;
      const committed = railSelectedId();
      const card = focused instanceof Element && railCards.contains(focused) && focused.matches('.ob-cardrail-card')
        ? focused
        : committed === null ? null : railCards.querySelector(`.ob-cardrail-card[data-id="${CSS.escape(String(committed))}"]`);
      if (!card) return;
      const box = card.getBoundingClientRect(), strip = railCards.getBoundingClientRect(), pad = parseFloat(getComputedStyle(railCards).paddingLeft) || 0;
      if (box.left >= strip.left + pad - 0.5 && box.right <= strip.right - pad + 0.5) return; // the arrival judge's band (#1206)
      try { card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }); } catch { /* old engines: the next slot change retries */ }
    }).observe(railCards, { attributes: true, attributeFilter: ['style'] });
  }
  function syncSubBlock(station, live) {
    let subLive = live && station === 'cloth';
    for (const el of clothChipBlock) el.hidden = station !== 'cloth';
    for (const [st, node] of secondaryOf()) {
      if (!node || node.parentNode !== railSub) continue;
      node.hidden = st !== station;
      if (live && st === station) subLive = true;
    }
    // card 32 v4: the cues arrival line in the side column (homeSecondary) keeps its said-once state and only
    // steps aside at the other stations
    if (cuesHint?.parentNode === railSub) {
      cuesHint.classList.toggle('ob-atelier-hint--away', station !== 'cues');
      if (live && station === 'cues' && !cuesHint.hidden) subLive = true;
    }
    // the row shows while it carries the station's block OR (coarse, > 1
    // card) the G4 count badge's slot — syncRailCount owns the hidden flip
    // + the census marker (the coarse host cap the marker keyed is gone
    // since G2 — the host has its real height and the rail yields through
    // the measured --ob-eq-host-b (publishBands))
    subBlockLive = subLive;
    syncRailCount();
  }
  function presentRail(station) {
    const live = !!cardRail && station !== null;
    rail.hidden = !live;
    // the secondary row: the cloth chips at cloth (both registers) + the
    // coarse register's re-homed station control (G2 — homeSecondary);
    // one row, shown exactly while it carries the station's own block
    syncSubBlock(station, live);
    syncHostLine();
    syncBarTop(); // card 32 v4: a hidden rail never keeps the seat (or the host hidden under it)
    homeRailCount();
    if (!live) { railStation = null; return; }
    if (railStation !== station) {
      railStation = station;
      cardRail.update(railItems(station));
      stampRailCards(); // synchronous twin of the observer (no unstamped frame)
    }
    // station ENTRY is the venue-staleness path the audit shot: the rail is
    // torn down on shell exit and rebuilt on re-entry, and an unchanged id
    // inventory keeps the old thumbs (see repaintClothThumbs). FORCED — the
    // reflect path can only cache the signature it could read at the time,
    // so entry is the one beat that must not trust that cache.
    repaintClothThumbs({ force: true });
    const sel = railSelectedId();
    cardRail.select(sel);
    // GH-668 S5 vfix1: the coarse card row's height now varies per station
    // (70 / 86.7 px), so the kit peek helper's ResizeObserver re-fits DURING
    // the select's smooth scroll and the strip rested off-snap (measured:
    // scrollLeft 2 at ee9047b6 already, 13–44 with the compact row — the
    // first card cut under the mask at cloth arrival; timing-dependent under
    // load). The rest position is judged AT REST (scrollend): when the
    // looked-at card is not whole inside the strip the select is re-issued
    // (same id: no state change, one settle scroll), at most twice.
    if (eqCoarse()) settleRailAtRest(station);
    syncProv(sel);
    // arrival ruling (dev 12 amendment): the async path re-guards register/
    // dismissal/liveness itself, and its framing move lands AFTER the
    // caller's own station move (the await defers past this microtask)
    if (station === 'cues') maybeAutoInspect();
  }

  /** Card activation — THE ROW'S OWN HANDLER PATH, nothing else (view-swap
   * law): cues → selectCue (inspect/equip semantics untouched), other
   * stations → stageAxis (R3 preview-then-commit untouched). */
  function railSelect(id) {
    if (active === 'cues') {
      cardRail?.select(id); // immediate luminance; float + ledger follow
      // the arrival line is said once per visit (vfix1, R-EQ-P1): the first
      // card activation retires it from the coarse host
      if (eqCoarse() && cuesHint && !cuesHint.hidden) {
        cuesHint.hidden = true; syncHostLine();
        if (cuesHint.parentNode === railSub) syncSubBlock(active, !rail.hidden); // card 32 v4: the side column empties
      }
      selectCue(id);
    } else if (RAIL_AXIS[active]) {
      stageAxis(RAIL_AXIS[active], heldForKey(RAIL_AXIS[active], id));
    }
  }

  /** Left-column provenance line (rail register only): the focused or
   * selected entry's name + tier badge + browse summary + dossier
   * disclosure — the T052/SC-004 catalog-browse law with the row lists
   * demoted (cardrail focus walks EVERY card, disabled table picks
   * included, and lands here WITHOUT staging). */
  function syncProv(id) {
    if (!cardRail || !active || active === 'cues' || id === null) return;
    const box = stationSections.get(active)
      ?.querySelector('[data-ob="atelier-prov"]');
    if (!box) return;
    const nameEl = box.querySelector('.ob-atelier-prov__name');
    const badgeEl = box.querySelector('.ob-atelier-prov__badge');
    const sumEl = box.querySelector('.ob-atelier-prov__sum');
    const det = box.querySelector('details');
    const textEl = box.querySelector('.ob-atelier-prov__text');
    if (active === 'lighting') {
      // fixtures are settings mirrors, not catalog entries — name only
      nameEl.textContent = t(`settings.fixture.${id}`);
      badgeEl.hidden = true;
      sumEl.textContent = '';
      det.hidden = true;
      return;
    }
    const card = catalogEntry(RAIL_AXIS[active], id)
      ?? optionEntries(RAIL_AXIS[active]).find((x) => x.id === id);
    if (!card) return;
    const e = legacyEntry(RAIL_AXIS[active], card); // #789: provenance from the twin's entry
    nameEl.textContent = eqName(card);
    const kind = calibrationKind(e.calibration);
    badgeEl.hidden = false;
    badgeEl.className = 'ob-badge ob-atelier-prov__badge'
      + (kind === 'calibrated' ? ' ob-badge--accent' : '');
    badgeEl.textContent = t(`settings.badge.${kind}`);
    sumEl.textContent = provSummary(e);
    const dossier = provDetail(e);
    det.hidden = !dossier;
    textEl.textContent = dossier;
  }

  // the leaf import — DEGRADE REGISTER: an absent/stale cardrail.js keeps
  // the shipped option-row lists byte-exactly (they remain the settings
  // register too; none of the rail chrome flips below run)
  // (sheetSettled: the rail register never precedes its sheet — see the
  // stylesheet block; S5-S is the arm)
  Promise.all([import('./ui/cardrail.js'), sheetSettled]).then(([m]) => {
    if (typeof m.createCardRail !== 'function') return;
    cardRail = m.createCardRail(railCards, {
      onSelect: (id) => {
        // finding 1: a USER card activation (pointer or keyboard — the
        // leaf's only onSelect sources) at the cues station cancels any
        // pending arrival auto-inspect for the rest of the visit. Set
        // HERE, not in railSelect — the auto path drives railSelect
        // directly and must not count as user intent (re-arrivals within
        // the visit keep re-floating the equipped cue as shipped).
        if (active === 'cues') cueUserPicked = true;
        railSelect(id);
      },
      onBrowse: (id) => syncProv(id),
      equippedLabel: () => t('atelier.card.equipped'),
      reducedMotion: () => {
        try {
          return window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches === true;
        } catch { return false; }
      },
    });
    // rail-register chrome flips (CSS keys on these classes; without them
    // — the degrade — every geometry stays the shipped S2 register)
    root.classList.add('ob-atelier--rail');
    // GH-1001 F35: the fresh module's ONE-ROW host marker (atelier.css keys the
    // row reserve on it, never on --rail — a cached module wears --rail too)
    root.classList.add('ob-atelier--onerow');
    syncStationHints();
    section.classList.add('ob-atelier-host--rail');
    cueCard.classList.add('ob-atelier-cue--withrail');
    // the cloth chips ride ABOVE the cards strip (sub-axis law) — one-time
    // reparent; the GH-229 listeners travel with the nodes
    railSub.append(...clothChipBlock);
    homeSecondary(); // the coarse register's secondary controls (G2)
    try {
      window.matchMedia?.('(pointer: coarse)').addEventListener?.('change',
        () => { homeSecondary(); if (cuesHint && !eqCoarse()) cuesHint.hidden = false; presentRail(active); scheduleBands(); });
    } catch { /* no matchMedia: the fine register stands */ }
    // the preview transaction bar docks as the rail's FIRST row (GH-668 S5
    // G1, B-EQ01): Keep lands one card-height from the card that staged it
    rail.prepend(txBar); syncGatedCopy(); // docked: the full-view pill may join now (review r1 P2)
    // GH-668 S5 G5 (B-EQ05, ruling R13): the provenance block is NOT
    // unhidden here any more — the rail card already carries the name +
    // tier badge (the G9 "one selected register said once"), so the host
    // under the strip is heading + strip (+ the ONE station line); the
    // block stays the degrade register's (its rules keep it for that
    // register; syncProv still writes it for the browse census).
    if (active) presentRail(active); // arrived before the leaf settled
  }).catch(() => { /* degrade: the plain option-row register stands */ });

  // phone summary-bar expand affordance (design note §3.8): the collapsed
  // sheet face keeps name + descriptor + actions inside the shipped 38vh
  // fold (F4/F5 geometry BYTE-UNTOUCHED — the arms stay the law for that
  // band); the stat strip and both expanders live behind this toggle on
  // the coarse register only (atelier.css scopes it; desktop face
  // unchanged). renderCard re-renders wipe the card, so the affordance
  // re-arms via a childList observer — each fresh present starts
  // collapsed (the F4 "expanders closed at present" register).
  // GH-525 review visual-audit round-1 finding 3 (the half-cut descriptor):
  // the COLLAPSED summary face must end on WHOLE descriptor lines — the
  // 38vh fold sheared the descriptor mid-glyph on every class. Pure CSS
  // cannot know the fold budget (38vh minus title/actions varies per
  // locale/viewport), so this measures the room under the descriptor's top
  // at the present scroll origin and writes the whole-line clamp the
  // stylesheet consumes (--ob-cue-desc-lines; the --desc0 class = not even
  // one line fits — the expand affordance carries the text). The expanded
  // face stays a scroll surface (untouched by design; F4/F5 laws hold).
  const fitCollapsedDesc = () => {
    if (!cardRail || !coarseRegister() || cueCard.hidden) return;
    if (!cueCard.getClientRects().length) return;
    const plain = cueCard.querySelector('.ob-atelier-plain');
    if (!plain) return;
    cueCard.classList.remove('ob-atelier-cue--desc0');
    cueCard.style.removeProperty('--ob-cue-desc-lines');
    if (cueCard.classList.contains('ob-atelier-cue--expanded')) return;
    cueCard.scrollTop = 0; // the clamp is a property of the present face
    const lh = parseFloat(getComputedStyle(plain).lineHeight) || 24;
    const room = cueCard.getBoundingClientRect().bottom
      - plain.getBoundingClientRect().top - 2; // subpixel guard
    const lines = Math.floor(room / lh);
    if (lines < 1) cueCard.classList.add('ob-atelier-cue--desc0');
    else cueCard.style.setProperty('--ob-cue-desc-lines', String(lines));
  };
  window.addEventListener('resize', () => fitCollapsedDesc());

  const armExpand = () => {
    if (!cardRail || !cueCard.childElementCount) return;
    if (!cueCard.querySelector('[data-ob="atelier-cue-expand"]')) {
      cueCard.classList.remove('ob-atelier-cue--expanded');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-btn ob-btn--ghost ob-atelier-cue-expand'; // GH-668 S5 G5: a ghost pill in the actions row (no --row: the kit auto-row belt judges wrap)
      b.dataset.ob = 'atelier-cue-expand';
      b.setAttribute('aria-expanded', 'false');
      const lab = document.createElement('span');
      lab.dataset.i18n = 'atelier.card.expand';
      lab.textContent = t('atelier.card.expand');
      b.appendChild(lab);
      b.addEventListener('click', () => {
        const on = cueCard.classList.toggle('ob-atelier-cue--expanded');
        b.setAttribute('aria-expanded', String(on));
        lab.dataset.i18n = on ? 'atelier.card.collapse' : 'atelier.card.expand';
        lab.textContent = t(lab.dataset.i18n);
        fitCollapsedDesc(); // re-collapse re-measures; expand clears
      });
      // GH-525 r1 finding 3: the affordance rides IN the actions row
      // (third control, DOM-last — one 44 pt band for all three controls,
      // buying the descriptor its fold room); a card without the row
      // (defensive: renderCard always builds one) keeps the old card-level
      // home so the affordance never vanishes.
      (cueCard.querySelector('.ob-atelier-actions') ?? cueCard).appendChild(b);
    }
    fitCollapsedDesc();
  };
  new MutationObserver(armExpand).observe(cueCard, { childList: true });

  // ---- row (re)builders + current-state sync ------------------------------
  function rebuildRows() {
    const api = sapi();
    // cues (the cueSwap seam owns the option law — picker-visible +
    // grandfathered current; fall back to the local filter); a cue a loaded
    // sibling rejects lists with its pick disabled (#789, census E20)
    {
      const list = root.querySelector('[data-ob="atelier-cues"]');
      list.textContent = '';
      const opts = sctx?.cueSwap?.options?.()
        ?? optionEntries('cue_id').map((e) => ({ id: e.id, name: eqName(e) }));
      for (const o of opts) {
        const e = catalogEntry('cue_id', o.id);
        if (!e) continue;
        list.appendChild(optionRow('cue_id', e, (id) => selectCue(id),
          { disabled: equipmentPickRefused(api, 'cue_id', e.id) }));
      }
    }
    const fill = (sel, axis, onPick, details = false) => {
      const list = document.querySelector(sel); // atelier-cushion may ride the rail row (G2)
      list.textContent = '';
      const legal = axis === 'table_id' ? legalTables() : null;
      const pickHeld = (id) => onPick(heldForKey(axis, id)); // #789: a legacy key stages its held id
      for (const e of optionEntries(axis)) {
        list.appendChild(optionRow(axis, e, pickHeld, { details,
          disabled: tableCardOutOfClass(legal, e.id)
            || equipmentPickRefused(sapi(), axis, e.id) }));
      }
    };
    fill('[data-ob="atelier-table"]', 'table_id',
      (id) => stageAxis('table_id', id), true);
    fill('[data-ob="atelier-cushion"]', 'cushion_model_id',
      (id) => { stageAxis('cushion_model_id', id); revealStagedRow('[data-ob="atelier-cushion"]', id); });
    fill('[data-ob="atelier-cloth"]', 'cloth_id',
      (id) => stageAxis('cloth_id', id));
    fill('[data-ob="atelier-balls"]', 'ballset_id',
      (id) => stageAxis('ballset_id', id));
    // lighting fixture rows: auto + the five ids (display mirrors; commits
    // ride api.set('fixture') — the GH-386 venue-default grammar)
    {
      const list = root.querySelector('[data-ob="atelier-lighting"]');
      list.textContent = '';
      for (const f of ['auto', ...FIXTURE_IDS]) {
        const row = document.createElement('div');
        row.className = 'ob-eq-prov-row';
        row.dataset.id = f;
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'ob-btn ob-btn--row ob-btn--ghost ob-eq-prov-row__pick'; // G8: the kit row pill (the last local pill)
        const name = document.createElement('span');
        name.className = 'ob-eq-prov-row__name';
        const label = document.createElement('span');
        label.dataset.i18n = `settings.fixture.${f}`;
        label.textContent = t(`settings.fixture.${f}`);
        name.append(label);
        pick.append(name);
        pick.addEventListener('click', () => {
          // R3 unified transaction grammar: non-re-racking, previews live,
          // Keep persists, leaving reverts — stays at the station either way
          stageAxis('fixture', f);
        });
        row.append(pick);
        list.appendChild(row);
      }
    }
    const b = api?.get?.().brightness;
    const slider = brightSlider;
    if (slider && Number.isFinite(b)) slider.value = String(b);
    // rail register: the card inventory follows the same rebuild triggers
    // (equipment/game commits, locale) as the row lists
    if (cardRail && railStation && railStation === active) {
      cardRail.update(railItems(active));
      stampRailCards();
    }
    syncRows();
  }

  /** aria-current + chip/slider state follow the store (ob:settings). */
  function syncRows() {
    const api = sapi();
    const v = api?.get?.();
    if (!v) return;
    const mark = (sel, id) => {
      for (const row of document.querySelectorAll(`${sel} .ob-eq-prov-row`)) {
        row.setAttribute('aria-current', String(row.dataset.id === id));
      }
    };
    mark('[data-ob="atelier-cues"]', v.equipment.cue_id);
    mark('[data-ob="atelier-table"]', cardKey('table_id', v.equipment.table_id));
    mark('[data-ob="atelier-cushion"]', v.equipment.cushion_model_id);
    mark('[data-ob="atelier-cloth"]', cardKey('cloth_id', v.equipment.cloth_id));
    mark('[data-ob="atelier-balls"]', cardKey('ballset_id', v.equipment.ballset_id));
    mark('[data-ob="atelier-lighting"]', v.fixtureAuto ? 'auto' : v.fixture);
    // cloth chips (roving tabindex — one stop, the checked chip); queried
    // off the captured block — the chips live in the RAIL sub-row while
    // the card rail is live, in the section otherwise (degrade)
    const chips = [...clothChipsEl.querySelectorAll('.ob-cloth-chip')];
    for (const chip of chips) {
      chip.setAttribute('aria-checked', String(chip.dataset.color === v.clothColor));
      const name = chip.dataset.color
        ? (has(`settings.clothColor.${chip.dataset.color}`)
          ? t(`settings.clothColor.${chip.dataset.color}`) : chip.dataset.color)
        : t('settings.clothColor.factory');
      chip.setAttribute('aria-label', name);
      chip.title = name;
    }
    const stop = chips.find((c) => c.dataset.color === v.clothColor) ?? chips[0];
    for (const chip of chips) chip.tabIndex = chip === stop ? 0 : -1;
    const nameEl = clothNameEl;
    if (nameEl) {
      nameEl.textContent = v.clothColor && has(`settings.clothColor.${v.clothColor}`)
        ? t(`settings.clothColor.${v.clothColor}`)
        : t('settings.clothColor.factory');
    }
    const slider = brightSlider;
    if (slider && Number.isFinite(v.brightness)
      && Number(slider.value) !== v.brightness) {
      slider.value = String(v.brightness);
      slider.__obSlider?.sync?.();
    }
    syncLux();
    syncTxBar(); // R3: the bar follows the transaction on every reflect
    // rail register: flags (equipped tick / staged ring / disabled) +
    // selection follow the store on the same reflect (a same-id re-select
    // never re-snaps — the leaf guards it, so store echoes cannot fight a
    // user pan)
    if (cardRail && !rail.hidden && railStation === active) {
      cardRail.refresh();
      const sel = railSelectedId();
      cardRail.select(sel);
      syncProv(sel);
      // in-station composition moves land here: an equipment/game commit
      // (rebuildRows ends in this reflect) and a clothColor stage/commit,
      // which reaches this reflect twice over — stageAxis calls syncRows
      // directly, and settings' own broadcast re-enters through onSettings
      repaintClothThumbs();
    }
  }
  rebuildRows();
  // settings commits from ANY surface reflect here (the one store truth);
  // equipment commits also retry the swatch painter (table rebuild)
  const onSettings = (e) => {
    if (e?.detail?.key === 'equipment' || e?.detail?.key === 'game') {
      rebuildRows();
      paintClothChips();
    } else syncRows();
  };
  window.addEventListener('ob:settings', onSettings);

  // ---- locale switching ----------------------------------------------------
  onLocaleChange(() => {
    for (const el of root.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n);
    }
    // the rail is a body-level mount (dev 12) — its own [data-i18n] pass
    // (covers the reparented cloth-color label + the expand affordance)
    for (const el of rail.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n);
    }
    syncGatedCopy(); // P2-3: after the passes above (they repaint raw keys under a stale dictionary)
    root.setAttribute('aria-label', t('atelier.aria.root'));
    carouselMount.setAttribute('aria-label', t('atelier.aria.carousel'));
    syncRailCount(); // the rail's aria-label (+ the "k / n" count, G4)
    carousel?.refresh?.();
    rebuildRows(); // localized names/badges/summaries (rail items included)
    // vfix2 (R-1): the bar's badge / labels changed width — re-judge its fit
    // ladder now and once the locale's webfont has settled (ja / ko swap-ins)
    fitTxBar();
    document.fonts?.ready?.then?.(() => fitTxBar());
  });

  // ---- kit upgrade (guarded — native slider keeps working without it) ----
  import('./ui/controls.js').then((kit) => {
    const slider = brightSlider;
    if (slider && kit.upgradeSlider) kit.upgradeSlider(slider);
  }).catch(() => { /* native range stands */ });

  // G6 subject projection (no THREE import: the ball meshes' own Vector3s
  // carry project(); the canvas rect maps NDC — the shell's propPlaceAt idiom)
  function subjectRect(st) {
    if (st === 'cues') return cueMod?.floatRect?.() ?? null;
    const cam = ctx.camera, cv = document.querySelector('body > canvas');
    const balls = ctx.game?.ballSet?.balls;
    if (!cam || !cv || !Array.isArray(balls)) return null;
    // the RACK = the visible OBJECT balls (the cue ball waits behind the head
    // string — it is not the subject); each ball is projected as its own
    // screen circle (centre + radius / view depth) — a world AABB's corners
    // can fall beside a low raking camera and explode the projection
    const vis = balls.filter((b) => b?.mesh?.visible && b.mesh.parent && b.id !== 0);
    if (!vis.length) return null;
    cam.updateMatrixWorld(true);
    const cr = cv.getBoundingClientRect();
    const half = cr.height / 2, k = half / Math.tan((cam.fov * Math.PI / 180) / 2);
    const w = vis[0].mesh.position.clone(), v = w.clone();
    const px = (x, y, z) => { v.set(x, y, z).project(cam);
      return [cr.left + (v.x + 1) / 2 * cr.width, cr.top + (1 - v.y) / 2 * cr.height]; };
    let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity, ySum = 0, n = 0;
    for (const b of vis) {
      b.mesh.getWorldPosition(w);
      const r = b.mesh.geometry?.parameters?.radius ?? b.mesh.geometry?.boundingSphere?.radius ?? 0.028575;
      const d = -v.copy(w).applyMatrix4(cam.matrixWorldInverse).z; // view depth
      if (!(d > cam.near)) continue; // beside / behind the camera: not on screen
      const rp = r * k / d, [cx, cy] = px(w.x, w.y, w.z);
      l = Math.min(l, cx - rp); rr = Math.max(rr, cx + rp); t = Math.min(t, cy - rp); bb = Math.max(bb, cy + rp);
      ySum += w.y; n += 1;
    }
    if (!n) return null;
    // the foot spot: three.x = +bedLength/4 (header derivation), at ball height
    const L = ctx.game?.template?.system?.table?.length ?? 2.54;
    const [fx, fy] = px(L / 4, ySum / n, 0);
    const rd = (q) => Math.round(q * 10) / 10;
    return { left: rd(l), top: rd(t), right: rd(rr), bottom: rd(bb), width: rd(rr - l), height: rd(bb - t),
      n, foot: { x: rd(fx), y: rd(fy) } };
  }

  // ---- GH-1001 card 32 v2 (signed 2026-10-11: "镜头要"; atelier.md §7 B20-2):
  // THE PHONE TABLE-PREVIEW FRAMING. While a TABLE is previewed on the phone
  // (a table_id stage at the table station, the staged build READY) the
  // camera steps back to a pose that holds the WHOLE table: the rail-top
  // outline of the staged build inside the safe area, above the bar's full-
  // view seat (the rail's bottom row — the bar glides there in Full view)
  // and clear of the quick-play stack. The pose is a LAW, not a tuple (the
  // §2 amendment (b) idiom): the table anchor's azimuth, a fixed tilt, and
  // the radius + a ground shift of the target toward the eye (the balls G6
  // precedent — lifting the target would drop the eye under the lamp plane)
  // solved from the live chrome, verified once at settle. One shell-mover
  // move (900 ms, any input cuts it, reduced motion and scripted boots
  // snap), scheduled two frames after the READY broadcast. The preview's own
  // rerack runs inside READY's task (synchronously for a built table, in
  // READY's microtask chain after a first Chinese 8-ball download), so the
  // deferral starts the move after it, on an idle mover, and the shell's D15
  // hold puts the last-frame pose back, lens included. A pick of another
  // table HOLDS the framing on screen while that build prepares and re-fits
  // from it at READY (never a trip back to the anchor); a refused build ends
  // the hold. The framing's own moves (framing and restore) record their
  // start and end lens: a fresh-rack re-home that lands while one is in the
  // air (a timer-driven rerack — the WIN continuation — or a programmatic
  // one) finds the D15 hold standing down for the moving mover, which writes
  // the orbit terms every frame but the lens only when the move changes it,
  // so a constant-lens move (45 -> 45) re-asserts its lens in that emission
  // and the overhead register's lens never reaches a frame. Put back / a
  // re-pick of the base card fly back to the anchor; Keep exits through the
  // shell's instant gameplay pose; a station or place change flies to its
  // own anchor. Fine pointers and coarse tablets never frame (the phone
  // predicate).
  const TF_THETA = -0.55, TF_PHI = 0.82, TF_TY = 0.05, TF_FOV = 40, TF_FOV_MAX = 50;
  const tf = { engaged: false, id: null, pose: null, win: null, quad: null, rect: null,
    fitted: false, verified: false, corrections: 0, tok: 0, req: 0, pending: false, yielded: false, moves: 0, lastFlight: null,
    inputs0: null, dragged: false };
  const TF_HOLD = 'hold'; // a staged table still preparing: the framing on screen stands
  /** The staged table's canonical id when the framing should engage, TF_HOLD while the staged build prepares,
   * else null (no framing: the anchor). */
  const tfWanted = () => {
    if (!eqPhone() || !shell.isOpen() || shell.place() !== 'equipment' || active !== 'table') return null;
    if (!railStaged('table_id') || railCurrent('table_id') === railCommitted('table_id')) return null;
    const tb = window.__tableBuild;
    const st = tb?.status?.()?.status ?? 'READY';
    if (st === 'PENDING') return TF_HOLD;
    const id = tb?.tableId?.() ?? null;
    return st === 'READY' && id ? id : null;
  };
  /** The rail-top outline of a built table (four world corners), null without the scene module. */
  const tfOutline = (id) => {
    try {
      const g = clothTblMod?.makeGeom?.(id);
      if (!g || !g.render) return null;
      const hx = g.L / 2 + g.CW + g.render.frameWidth, hz = g.W / 2 + g.CW + g.render.frameWidth;
      const y = g.render.frameTop ?? 0.047;
      return [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
    } catch { return null; }
  };
  /** The viewport window the outline must sit in (CSS px), from the live chrome. */
  const tfWindow = () => {
    const sp2 = eqSp2();
    let ins = { t: 0, r: 0, b: 0, l: 0 };
    try {
      const pr = document.createElement('div');
      pr.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(pr);
      const c = getComputedStyle(pr);
      ins = { t: eqPx(c.paddingTop), r: eqPx(c.paddingRight), b: eqPx(c.paddingBottom), l: eqPx(c.paddingLeft) };
      pr.remove();
    } catch { /* no insets */ }
    const vw = window.innerWidth, vh = window.innerHeight;
    const b = window.__shell?.bands?.() ?? null;
    let bottom = vh - ins.b - sp2;
    if (b?.rail) bottom = Math.min(bottom, b.rail.top - sp2);
    // the bar's full-view seat on the tall rail: its bottom on the rail's bottom edge (atelier.css F-B); off
    // the tall register the bar never moves and the table reads under it in Full view (the relaxed envelope)
    const railB = eqVars['--ob-eq-rail-b'];
    const barH = !txBar.hidden && txBar.getClientRects().length ? txBar.getBoundingClientRect().height : (eqRow1Px || 0);
    if (rail.classList.contains('ob-atelier-rail--tall') && Number.isFinite(railB) && barH > 0) {
      bottom = Math.min(bottom, railB - barH - sp2);
    }
    const qp = b?.quickPlay ?? null;
    return { top: ins.t + sp2, left: ins.l + sp2, right: vw - ins.r - sp2, bottom,
      qp: qp ? { top: qp.top - sp2, left: qp.left - sp2, right: qp.right + sp2, bottom: qp.bottom + sp2 } : null };
  };
  /** Screen px of world points under an orbit pose (the orbit.js law, pure math: no THREE here). */
  const tfProject = (pose, pts, cvR) => {
    const st = Math.sin(pose.theta), ct = Math.cos(pose.theta), sf = Math.sin(pose.phi), cf = Math.cos(pose.phi);
    const o = [sf * st, cf, sf * ct], xh = [ct, 0, -st], yh = [-cf * st, sf, -cf * ct];
    const f = cvR.height / (2 * Math.tan((pose.fov * Math.PI / 180) / 2));
    const cx = cvR.left + cvR.width / 2, cy = cvR.top + cvR.height / 2;
    return pts.map(([x, y, z]) => {
      const q = [x - pose.tx, y - pose.ty, z - pose.tz];
      const d = pose.radius - (q[0] * o[0] + q[1] * o[1] + q[2] * o[2]);
      if (!(d > 0.05)) return null; // at / behind the eye
      return [cx + f * (q[0] * xh[0] + q[2] * xh[2]) / d, cy - f * (q[0] * yh[0] + q[1] * yh[1] + q[2] * yh[2]) / d];
    });
  };
  const tfInside = (quad, w) => quad.every((p) => p && p[0] >= w.left && p[0] <= w.right && p[1] >= w.top && p[1] <= w.bottom);
  const tfHitsQp = (quad, qp) => !!qp && quad.some((p) => p && p[0] >= qp.left && p[0] <= qp.right && p[1] >= qp.top && p[1] <= qp.bottom);
  /** The framing pose for an outline in a window: the smallest radius over the ground shift (the largest table). */
  const tfSolve = (pts, w, cvR, phi, fov) => {
    let best = null;
    for (let i = 0; i <= 100; i++) {
      const g = i * 0.02;
      const base = { tx: g * Math.sin(TF_THETA), ty: TF_TY, tz: g * Math.cos(TF_THETA), theta: TF_THETA, phi, fov };
      const ok = (r) => { const q = tfProject({ ...base, radius: r }, pts, cvR); return tfInside(q, w) && !tfHitsQp(q, w.qp); };
      if (!ok(6.5)) continue;
      let lo = 0.7, hi = 6.5;
      if (ok(lo)) hi = lo;
      else for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      if (!best || hi < best.radius - 1e-9) best = { ...base, radius: hi };
    }
    return best;
  };
  /** The framing pose with the lamp-plane and room guards (raise the tilt, then widen the lens). */
  const tfFit = (id) => {
    const pts = tfOutline(id), cv = document.querySelector('body > canvas');
    if (!pts || !cv) return null;
    const cvR = cv.getBoundingClientRect(), w = tfWindow();
    if (!(cvR.width > 0 && cvR.height > 0 && w.bottom > w.top + 40)) return null;
    const plane = (() => { try { return window.__lampfade?.plane?.(); } catch { return null; } })();
    for (let phi = TF_PHI; phi >= 0.5; phi -= 0.05) {
      for (let fov = TF_FOV; fov <= TF_FOV_MAX; fov += 5) {
        const p = tfSolve(pts, w, cvR, phi, fov);
        if (!p) continue;
        const sf = Math.sin(p.phi);
        const eye = [p.tx + p.radius * sf * Math.sin(p.theta), p.ty + p.radius * Math.cos(p.phi), p.tz + p.radius * sf * Math.cos(p.theta)];
        if (Number.isFinite(plane) && eye[1] < plane + 0.15) break; // under the lamp plane: tilt further up
        if (Math.abs(eye[0]) > 4.45 || Math.abs(eye[2]) > 2.95 || eye[1] > 2.4) continue; // outside the room: widen the lens
        return { pose: p, win: w, quad: tfProject(p, pts, cvR) };
      }
    }
    return null;
  };
  const tfRect = (quad) => {
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    const rd = (v) => Math.round(v * 10) / 10;
    return { left: rd(Math.min(...xs)), top: rd(Math.min(...ys)), right: rd(Math.max(...xs)), bottom: rd(Math.max(...ys)) };
  };
  const tfSame = (a, b) => !!a && !!b && ['tx', 'ty', 'tz', 'radius', 'theta', 'phi', 'fov']
    .every((k) => Math.abs(a[k] - b[k]) < 1e-3);
  const tfReset = () => { Object.assign(tf, { engaged: false, id: null, pose: null, win: null, quad: null, rect: null,
    fitted: false, verified: false, corrections: 0, pending: false, yielded: false, inputs0: null, dragged: false }); };
  /** True when the shell saw user input since the framing's last verification, or a drag pressed before it was still
   * held then — its later moves reach orbit.js uncounted (#1191); a stale shell.js without the count leaves the decision
   * to the pose test alone (the mixed-cache degrade). */
  const tfInputSince = () => typeof shell.inputs !== 'function' || tf.inputs0 === null || tf.dragged || shell.inputs() !== tf.inputs0;
  /** True when the live camera has left a framing pose (the orbit.js law; the framing's radius and tilt sit inside
   * orbit.apply's clamps, so a landed or cut-to-end flight reads exactly the pose): something moved it — the user's input
   * or, rarely, a camera write with none (the same-table re-judge also asks for input, #1191). */
  const tfMoved = (pose) => {
    const cam = ctx.camera;
    if (!cam || !pose) return false;
    const sf = Math.sin(pose.phi);
    const dx = cam.position.x - (pose.tx + pose.radius * sf * Math.sin(pose.theta));
    const dy = cam.position.y - (pose.ty + pose.radius * Math.cos(pose.phi));
    const dz = cam.position.z - (pose.tz + pose.radius * sf * Math.cos(pose.theta));
    return Math.hypot(dx, dy, dz) > 1e-3 || Math.abs(cam.fov - pose.fov) > 1e-3;
  };
  /** Verify the landed framing through the LIVE camera (two frames after landing); at most one correction. */
  const tfVerify = (tok) => {
    if (tok !== tf.tok || !tf.engaged) return;
    tf.inputs0 = typeof shell.inputs === 'function' ? shell.inputs() : null; // a later re-judge yields only to input after this
    tf.dragged = ctx.orbit?.isOrbiting?.() === true; // ... or to a drag already under way (its moves come later)
    // the user took the camera (a wheel zoom or a drag cut the flight to its end pose and moved on from it): the
    // framing yields — a corrective move would undo the user's own input
    if (tfMoved(tf.pose)) { tf.yielded = true; tf.pending = false; return; }
    const cam = ctx.camera, cv = document.querySelector('body > canvas'), pts = tfOutline(tf.id);
    if (!cam || !cv || !pts) { tf.pending = false; return; }
    cam.updateMatrixWorld(true);
    const cr = cv.getBoundingClientRect(), w = tfWindow();
    const live = pts.map(([x, y, z]) => {
      const v = cam.position.clone().set(x, y, z).project(cam);
      return [cr.left + (v.x + 1) / 2 * cr.width, cr.top + (1 - v.y) / 2 * cr.height];
    });
    tf.quad = live; tf.rect = tfRect(live); tf.win = w;
    const slack = { ...w, left: w.left - 1, right: w.right + 1, top: w.top - 1, bottom: w.bottom + 1 };
    if (tfInside(live, slack) && !tfHitsQp(live, w.qp)) { tf.verified = true; tf.pending = false; return; }
    if (tf.corrections >= 1) { tf.pending = false; return; }
    tf.corrections += 1;
    const fit = tfFit(tf.id);
    if (!fit) { tf.pending = false; return; }
    tf.pose = fit.pose;
    tfMove(tok);
  };
  /** The framing's own in-flight move (a framing or its restore): its start and end lens. */
  let tfFlight = null;
  const tfFly = (pose) => {
    const run = mover.moveTo(pose, { instant: shell.instant() });
    // moveTo cut any older move and snapshotted its start synchronously: the live lens IS the move's start lens
    const rec = { lens: ctx.camera?.fov, fov: Number.isFinite(pose.fov) ? pose.fov : 40 };
    tfFlight = rec;
    const done = () => { if (tfFlight === rec) tfFlight = null; };
    Promise.resolve(run).then(done, done);
    return run;
  };
  const tfMove = (tok) => {
    tf.pending = true;
    tf.moves += 1;
    // a cut lands on the move's own end pose (the mover law), so a cut flight is verified like a landed one —
    // unless the input that cut it then moved the camera off that pose (tfVerify yields)
    Promise.resolve(tfFly(tf.pose)).then((how) => {
      if (tok !== tf.tok) return;
      tf.lastFlight = how;
      requestAnimationFrame(() => requestAnimationFrame(() => tfVerify(tok)));
    }, () => { if (tok === tf.tok) tf.pending = false; });
  };
  // a fresh-rack re-home inside a constant-lens framing / restore move (registered after main.js's re-home and the
  // shell's D15 hold — the same emission): the mover rewrites the orbit terms on its next frame, the lens is ours
  ctx.machine?.on?.('stateChange', (next, prev, info) => {
    const f = tfFlight;
    if (next !== 'AIM' || info?.seed === undefined || !f || f.lens !== f.fov || !mover.moving()) return;
    const cam = ctx.camera;
    if (cam && cam.fov !== f.fov) { cam.fov = f.fov; cam.updateProjectionMatrix(); }
  });
  /** Re-judge the framing (scheduled: never inside the stage's own broadcast). */
  function syncTableFrame() {
    // the request serial coalesces re-judges; the move token (tf.tok) changes only below, with a new move or a
    // reset, so an unchanged framing keeps its in-flight completion and verification
    const req = ++tf.req;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (req !== tf.req) return;
      const id = tfWanted();
      if (id === TF_HOLD) return; // the next table prepares: hold what is on screen (READY / REFUSED re-judge)
      if (id) {
        const fit = tfFit(id);
        if (!fit) return;
        // a drag or a zoom after the framing landed (its flight and verification done: tfVerify records only an input
        // that cut the flight) yields too — user input since the verification AND the camera off the landed pose, judged
        // before the record takes the new fit; a camera write with no input re-fits (#1191; #1192: no boot re-home inside the shell)
        if (tf.engaged && tf.id === id && !tf.yielded && !tf.pending && !mover.moving() && tfInputSince() && tfMoved(tf.pose)) tf.yielded = true;
        const same = tf.engaged && tf.id === id && tfSame(fit.pose, tf.pose);
        // the user holds the camera: a band change that moves the fit for the SAME table only updates the record (a new
        // table, a re-entry into the phone register or an explicit return to the station frames again)
        const held = tf.engaged && tf.yielded && tf.id === id;
        Object.assign(tf, { engaged: true, id, pose: fit.pose, win: fit.win, quad: fit.quad, rect: tfRect(fit.quad), fitted: true });
        if (same || held) return; // the framing stands (landed, or its flight and verification are under way), or yields
        tf.verified = false;
        tf.corrections = 0;
        tf.yielded = false;
        tfMove(++tf.tok);
        return;
      }
      if (!tf.engaged) return;
      const restore = active === 'table' && shell.isOpen() && shell.place() === 'equipment';
      tf.tok += 1; // the framing's in-flight completion and verification end here
      tfReset();
      if (restore) tfFly(anchorOf('table'));
    }));
  }
  tfSync = syncTableFrame;
  tfPoseOf = (id) => (id === 'table' && tf.engaged && tfWanted() !== null ? tf.pose : null);
  // an explicit return to the table station (go / the card primary) while the framing is engaged: fly the framing again
  // under a fresh token — the move is verified and a yield ends (the user asked for the framing back)
  tfReturn = (id) => {
    if (!tfPoseOf(id)) return false;
    tf.yielded = false;
    tf.verified = false;
    tf.corrections = 0;
    tfMove(++tf.tok);
    return true;
  };
  window.addEventListener('ob:table-state', (e) => { if (e?.detail?.status !== 'PENDING') tfSync?.(); });
  window.addEventListener('ob:shell-bands', () => tfSync?.()); // engaged or not: a rotation can make the framing due

  // ---- test/deep-link surface (contract §3 — the __shell grammar) ---------
  window.__atelier = {
    /** Navigate to a station (open at equipment) or pose for the next
     * arrival; no-op-on-unknown; returns the active station id. */
    go: (id, opts) => go(id, opts),
    station: () => active,
    registry: () => STATIONS.map((s) => ({ id: s.id, anchor: anchorOf(s.id) })),
    floatState: () => cueMod?.floatState?.()
      ?? { staged: false, id: null, turning: false, layer: null },
    /** select→float-visible perf tuple for the LAST cue selection (GH-525
     * round-4 latency law): { id, t0, floatAt?, ms?, drawn? } — ms closes on
     * the first frame rendering the new float (camera layer 1, #1225); null before any pick. */
    floatPerf: () => (cueSelPerf ? { ...cueSelPerf } : null),
    cardState: () => cueMod?.cardState?.() ?? null,
    tryIt: () => cueMod?.tryIt?.() ?? Promise.resolve(false),
    /** The card primary the shell's hold reaches through R0 (f) (GH-677):
     * present the current station; null at the overview / while away. */
    primary: () => primary(),
    /** Showroom-rail state (S2.5 item B — additive, the __shell grammar):
     * live=false is the degrade register (row lists render). */
    rail: () => ({
      live: !!cardRail,
      station: railStation,
      hidden: rail.hidden,
      count: railCards.querySelectorAll('.ob-cardrail-card').length,
      selected: railCards
        .querySelector('.ob-cardrail-card[aria-selected="true"]')
        ?.dataset.id ?? null,
    }),
    /** The G2 geometry publisher's last written values (px numbers) + the
     * write count since mount (the S5-G settle law reads it). */
    bands: () => ({ ...eqVars, writes: eqWrites }),
    /** G6 (B-EQ06): the staged float's swept AABB projected through the
     * live camera → DOM px rect; null while nothing is staged / no module. */
    floatRect: () => cueMod?.floatRect?.() ?? null,
    /** The float fit record ({ rect, window, corrections, verified, fitted,
     * pending, pose }); null without the deep module. */
    floatFrame: () => cueMod?.floatFrame?.() ?? null,
    /** The station's scene SUBJECT projected through the live camera (DOM
     * px): 'cues' → the float; 'balls' / 'cloth' / 'table' → the visible
     * balls' AABB (the rack on the foot spot) + the foot-spot point. Null
     * when the subject is absent (no balls visible, no canvas). */
    subjectRect: (st) => subjectRect(st),
    /** GH-1001 card 32 v2 (B20-2): the phone table-preview framing record —
     * { engaged, id, pose, window, quad, rect, fitted, verified, corrections,
     * pending }; engaged false off the phone or while nothing is staged. */
    tableFrame: () => ({ engaged: tf.engaged, id: tf.id, pose: tf.pose ? { ...tf.pose } : null,
      window: tf.win ? { ...tf.win } : null, quad: tf.quad ? tf.quad.map((p) => (p ? [...p] : null)) : null,
      rect: tf.rect ? { ...tf.rect } : null, fitted: tf.fitted, verified: tf.verified,
      corrections: tf.corrections, yielded: tf.yielded, moves: tf.moves, lastFlight: tf.lastFlight, inputSince: tfInputSince(),
      pending: tf.pending || (tf.engaged && mover.moving()) }),
  };

  console.log('[atelier] ready (032 S2)');
  return { go, setPlace, onShellExit, propTap, primary };
}

/** #789 (census E20, S2/S3): does the settings api's equipment predicate say
 * the loaded siblings (the kernel, the scene) cannot play catalog entry `id`
 * on `axis`? Such a card lists with its pick DISABLED (the D11 pick-state
 * idiom; the dossier stays browsable), BEFORE a pick the commit gate would
 * refuse. `api` is the settings api the atelier already holds (sapi()); its
 * equipmentSupported is feature-detected per use (the ownership ledger rule-5
 * corollary: atelier cannot import settings.js by name; a stale settings.js
 * without the predicate lists every card pickable, the pre-#789 listing).
 * Declared after createAtelier (hoisted) so the line pins above hold. */
// #789: whether a table card sits outside the active game's class `legal`
// (null = no restriction). Fresh settings answers through its alias-aware
// class predicate (api.tableInClass: renamed and pre-rename twins), so a
// stale games module or a stale equipment catalog never disables a renamed
// table; a settings without the seam keeps the exact-id check.
function tableOutOfClass(api, legal, id) {
  if (legal === null) return false;
  const inClass = api?.tableInClass;
  if (typeof inClass === 'function') return inClass(id) === false;
  return !legal.includes(id);
}

function equipmentPickRefused(api, axis, id) {
  const supported = api?.equipmentSupported;
  const kind = { table_id: 'table', cloth_id: 'cloth', ballset_id: 'ballset',
    cushion_model_id: 'cushion', cue_id: 'cue' }[axis];
  if (typeof supported !== 'function' || !kind) return false;
  return supported(id, kind)?.ok === false;
}

// #1217: publishBands calls this as the coarse rail RETURNS from the yield. The rail yields whole to a
// presented cue sheet (max-height 0, visibility hidden, inert), and Chrome never moves the cardrail leaf's
// eased selection snap on that hidden, 0 px strip: no scroll event, scrollLeft unchanged, then a scrollend
// with the old offset when the animation would have ended. A TOUCH pick disarms the arrival judge, so the
// rail came back with the picked card cut at the strip edge (measured at 844x390 on b3984579: 64 px of a
// 208-225 px peek card, a far pick wholly off-screen, 7/7 locales each). The looked-at card is re-centred
// into #1206's band (inside the strip's inline padding), instantly — the arrival judge's own re-centre. On
// the return only: inside the yield the box is 0 px tall and clipped, where block 'nearest' would also
// scroll the rail itself.
function recentreAfterYield(strip, id) {
  if (id === null || id === undefined || strip.clientWidth === 0) return;
  const card = strip.querySelector(`.ob-cardrail-card[data-id="${CSS.escape(String(id))}"]`);
  if (!card) return;
  const box = card.getBoundingClientRect(), m = strip.getBoundingClientRect(), pad = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
  if (box.left >= m.left + pad - 0.5 && box.right <= m.right - pad + 0.5) return; // #1206's band
  try { card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }); } catch { /* old engines */ }
}
