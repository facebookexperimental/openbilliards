// Copyright (c) Meta Platforms, Inc. and affiliates.

// playback.js — the Playback (回放) DVR browser + timeline player + save flow
// (issue GH-225, 030 Phase C; owner-signed mockups feature 030 (internal spec)
// mockups/01..03 are the visual contract). Three surfaces:
//   1. session LIST (#ob-pb-panel): __archive.sessions() newest-first, rows
//      with mode icon / names / marker glyph strips / old-kernel badge /
//      per-row delete; storage-usage footer.
//   2. timeline PLAYER (#ob-pb-player): floating glass chrome over the LIVE
//      WebGL bed (WYSIWYG law — no <video>); scrub = game.loadRecord quiet
//      staging + game.seek via __test.renderAt (rAF-throttled fast path,
//      owner refinement 4); play/pause, in/out trim, per-segment camera
//      shelf, 1×/½×/¼× speed detents, montage cap chip.
//   3. SAVE flow (#ob-pb-card): __export.renderDrill over the trimmed
//      timeline (keepBlob + noDownload) → capability-aware destination card
//      (Photos/Files/Share via the obSaveVideo bridge — the CHUNKED
//      obSaveVideoStream transfer since GH-256, dest 'share' streamed too
//      since its P1 follow-up; obPhotos mp4 fallback, navigator.share on
//      plain web, web download) + the v5 replay-link
//      row (LIVE session only, per the __archive.current() note). Since
//      GH-252 a webm render can reach Photos too: the GH-157 transcode tier
//      (transcode.js, guarded dynamic import) runs IN FRONT of the same
//      wire when its capability probe passed at card open — see destsFor()/
//      transcodeAttempt().
//
// LEAF module (cache-poison contract, the ownership ledger (internal)): reached ONLY
// via the guarded dynamic import() in main.js beside the help/drills/archive
// seams. Static imports: ./i18n.js (the help/drills law) and kernel_version
// (the archive.js dynamically-imported-leaf precedent). Everything else is
// feature-detected at call time — window.__archive, __export.renderDrill,
// __test.renderAt/setCamera/setManual, __track, ui/dialog.js, ui/icons.js,
// ./ballset.js colors — and every absence degrades honestly (missing seam =
// localized notice or hidden control, never a throw).
//
// STATE SAFETY (the offline-render.js restore model): the player owns the
// live table while open — __archive.suspend(true) brackets it; entry is
// game.loadRecord({ stage: 'playback' }) from ANY state (issue GH-257 — the
// open-anything law: ONE bare PLAYBACK emission, which no lane treats as a
// fresh table), a bed that cannot host the session is re-equipped and
// re-racked QUIETLY for the duration, scrub staging is
// loadRecord({ stage: 'quiet' }), and close re-stages the pre-open record
// with its ORIGINAL identity (recordRef) exactly like renderTimeline's
// finally — restoring the captured rack bytes first when the bed was
// swapped. The player never calls machine.to() itself and never touches
// shot inputs (GH-14 determinism guard); every state transition it needs is
// a documented game.js seam (loadRecord stage:'playback', restoreRack).
// planPlayback is a BOOT-ORIGINAL framestep.js export (the engine's ONE
// timeline arithmetic) — a named import of an old name is link-safe for
// any cache pairing (rule-5 corollary bars only NEW names). GH-305:
// plannedFullFrames() mirrors renderDrill's per-segment frame count with
// the renderer's own rounding, the planFits agree-at-the-boundary law.
import { planPlayback } from './framestep.js';
import * as framestepNs from './framestep.js'; // GH-489 #637 LAND-17 PM2: the completion term through a namespace binding (boot-cache rule, the ownership ledger:42-53)
import { applyDom, getLocale, has, onLocaleChange, t } from './i18n.js';
// GH-313 (GH-304 residual 1): the namespace binding reaches the ADDITIVE
// hasLocal() without a new NAME on this edge (OWNERSHIP rule 5 — a fresh
// playback.js over a stale cached i18n.js must keep linking; the named-import
// form would die as a SyntaxError before any error handler exists).
import * as i18nNs from './i18n.js';
import { kernel_version } from '../dist/pool-wasm/pool_wasm.js';
// namespace import on purpose (GH-318, cache-poison contract):
// `lineageCompatible` is a NEW dist share.js export — a named import over
// a stale cached copy would kill this whole leaf at link time, the
// namespace access just answers undefined and the badge degrades to the
// pre-318 raw stamp compare.
import * as shareSdk from '../dist/pool-sdk/share.js';

// ui/playback.css version — bump on EVERY change to that sheet (the
// help.css/settings-modal.css ?v= law: the version lives in the module
// that builds the DOM, so DOM and skin can never drift).
// v8: pinned card head/foot frame + the setup estimate line + the kit-select
// control rail and its coarse floor (the owner three-defect fix)
// v9: coarse 44pt floors for .ob-pb-dismiss + .ob-pb-pcancel (GH-238 f1)
// v10: touch-action pan-y on .ob-pb-card-body / .ob-pb-list (GH-238 f4)
// v11: toolbar pill de-accented to the neutral #ob-help family register
//      (build-11 owner feedback: an always-accent pill reads as ACTIVE).
//      Cherry-picked as GH-225 Part 1 ONTO the save-card wave, so the
//      de-accent takes the next rung past v10 — not the v8 it carried on
//      its own branch, which would have re-served the v10 skin from cache
//      and shown the owner the accent pill again on the next device build.
// v12: GH-242 marker vocabulary — the foul mark becomes the ui/icons.js
//      `foul` CROSS in a 12px glyph box (the old 2.5x11 danger BAR read as a
//      divider), the player track restates its own foul size instead of
//      stretching that box, the marker strip CLIPS at its own grid column so
//      the widened cap can never paint into the timestamp (review round 1 P2),
//      and the list footer gains the teaching legend with its own-line
//      relayout below 750 CSS px.
// v13: the strip's own `overflow: hidden` clamp landed after v12 was already
//      spent on this branch — the law is one key per SHEET EDIT, so the
//      clipping fix takes its own rung rather than riding a spent key.
// v14: GH-225 Phase D Part 2 lands on top of v13. Its own branch spent v9
//      (drop `#ob-record-dock` from the ob-pb-live stand-down list) and v10
//      (RESTORE it as a stale-graph guard — a cached pre-Phase-D record.js
//      still mounts that BODY-level dock, which standing #ob-toolbar down
//      cannot hide; review round 1 P2), and those two rungs NET OUT: the
//      selector is byte-identical to v13's, so the only sheet delta is the
//      comment that records WHY a selector matching nothing is kept. Rung
//      spent anyway — the law is one key per sheet edit, and a merge is not
//      an exemption. Part 1's de-accent already landed on main as v11.
// v15: GH-246 — the pill's text-metric declarations are re-documented as the
//      STALE-playback.js register only (the shipped pill now inlines its own
//      SVG mark and can never paint '▸'). Comment-only, but the law is one key
//      per sheet edit, not per visual delta.
// v16: GH-255 — the destination tiles lose the STATIC `--primary` accent (a
//      permanent chalk-blue Photos tile read as "selected"; the rules are
//      deleted, not recolored) and gain the three per-attempt state registers
//      `--working` / `--done` / `--failed`, which must out-order the
//      `:disabled` dim they legitimately overlap with.
// v18: GH-274 (option a) — the save card's SETUP state explains its grey
//      destination preview: one localized hint line (.ob-pb-desthint) under
//      the tile row, the muted .ob-pb-platform voice, wrap-allowed and
//      never ellipsized; playback.js syncDestHint() is its one writer.
// v19: GH-299 — the .ob-pb-beatwarn amber over-cap notice (--ob-warn voice,
//      the desthint wrap/never-ellipsize rules): over-budget one-take walk
//      beats degrade to hard cuts and the save card says so.
// v20: GH-245 wave B — every one-off DVR control adopts the kit .ob-btn
//      family (--icon circles, --primary Save, --ghost Advanced/Clear/
//      Cancel, --tile camera/destination tiles), so this sheet keeps ONLY
//      surface-owned geometry (sizes, glass voices, per-state hue
//      restatements) plus documented stale-kit belts; the two segmented
//      chip strips (.ob-pb-filters/.ob-pb-speed) stay hand-rolled — kit
//      .ob-segmented is radio-input based (interaction-model change,
//      recorded on GH-245). (Numbered v19 on the GH-245 branch; renumbered
//      at the build-15 merge — main's v19 was already spent by GH-299, and
//      the law is one key per sheet edit, merge included.)
// v21: GH-245 review round 1 — the .ob-pb-dest stale-kit belt completed
//      (padding/gap/white-space restated beside column/radius: a
//      column+radius-only belt left the supported pre-v015-kit pairing on
//      the kit base's pill padding and nowrap, overflow risk on long
//      localized labels). One key per sheet edit; v20 was spent on this
//      branch.
// v22: GH-245 — .ob-pb-dest states `transition: none`: the GH-255
//      per-attempt OUTCOME states must paint on the tap's own frame (the
//      kit transition interpolated the flip; e2e-playback 7e measures the
//      material on pixels and caught the in-between tile). v21 spent.
// v23: GH-245 review round 2 — keyboard-activation rungs: the danger ink on
//      del/clear/pcancel and the selected cam tile's accent restated at
//      :active too (a Space press is :active with NO :hover, and the kit
//      ghost/neutral active rungs would repaint them neutral). v22 spent.
// v24: GH-301 director strip — the strip lane/blocks/seams (A1 adaptive
//      labels, snap/lock states), the transition picker + slot flyout
//      popovers, the slot pills (A2: the .ob-pb-cam geometry verbatim),
//      the capture bar, the #ob-pb-fade dip-to-black layer, and the strip
//      controls' coarse floors.
// v25: GH-301 review round 4 — the picker's Remove-cut action (danger-ink
//      kit ghost + its coarse floor): the keyboard path to cut deletion.
// v26: GH-301 review round 5 — #ob-pb-fade gains its literal black fallback
//      (tokens.css is data-optional; the degraded sheet must stay WYSIWYG
//      with the export's composited black).
// v27: GH-314 immersive console — the [data-ui] three-state overlay rules
//      (hidden / shown / pinned: opacity+transform transitions on the
//      chrome children, NEVER on #ob-pb-fade — that layer is CONTENT), the
//      director-strip sliver visuals (--ob-pb-strip-sliver) + the
//      expand/collapse toggle. DEGRADE BY CONSTRUCTION: every new rule
//      keys on the [data-ui] attribute / .ob-pb-strip--sliver class that
//      only the FRESH module writes, so a stale playback.js over this
//      sheet paints the build-15 static console byte-identically; a fresh
//      module over a stale (cache-poisoned) sheet finds no [data-ui] rules
//      and the console simply never hides — controls are never stranded.
// v28: GH-314 review round 1 — the reduced-motion override restates the
//      [data-ui="hidden"] selector verbatim: the hide rule's attribute
//      outranked the bare child selector, so the HIDE still animated
//      200 ms while only the reveal snapped. One key per sheet edit.
// v29: GH-331 — .ob-pb-strip-hint drops 91 → 89: the passive
//      pointer-events:none banner must paint UNDER the interactive
//      popovers (.ob-pb-pop 90; on the 852x393 phone profile it covered
//      the transition picker's Move row). Stale-module belt for the
//      strip-side syncHint fix.
// v30: GH-305 — the save-card export-mode row (.ob-pb-moderow/.ob-pb-mode/
//      .ob-pb-modenote) + its coarse 44 px floor join the sheet.
// v31: GH-364 — the strike-point preview layer (#ob-pb-strike — CONTENT
//      like #ob-pb-fade: excluded from the chrome hide rules) + the
//      save-card overlay toggle (.ob-pb-striketog).
// v32: GH-363 — the pre-strike lead-in toggle (.ob-pb-lead) joins the
//      Advanced grid as a third labelled pair.
// v33: GH-363 — the toggle joins the enumerated coarse 44 px sweep (the
//      arm-8e DOM sweep caught the 39 px miss).
// v34: GH-362 layer 3 — the crash-resume banner (#ob-resume-banner +
//      #ob-resume-scrim) joins the sheet (the layer-3 lane reserved 32/33
//      for GH-363 when it renumbered; the ledger composes here).
// v35: GH-475 — the strike-plate annotation knob rows (.ob-pb-strikeanno:
//      the overlay row's anatomy indented one step, disabled-dim via :has).
// v39: GH-668 fix round 5 (review r2 P2, C1) — the export-mode pill pair's
//      rules scoped under .ob-pb-moderow (the session-row face carries the
//      legacy .ob-pb-mode name as its fold hook), the cached-face belt at
//      :where() specificity, the pressed hover under the fine-pointer guard
// v38: GH-668 B-K23 / B-K24 — hairline dividers (dashed out), z rungs, the
//      title role on the head h2, glyph line heights, card body scrollbar via
//      kit .ob-scroll (the DVR's own ::-webkit-scrollbar recipe retired)
// v37: GH-668 B-K07 / B-K08 — the row renderer: game-disc / chip face
//      (no well tile), title wraps (the kit's last ellipsis is gone), marks
//      inline on the title baseline, one 12 px clock · meta line, tracks
//      derived from --del / --chev, trash reveal, 16 px foul chip, day voice
//      12 / 620 sentence case, DVR measure 640.
// v42: GH-668 S5 replays G4 (B-RP03 / B-K16 / B-K15 / B-K06) — the filter
//      and speed strips ARE the kit .ob-segmented (the two hand-rolled
//      strips + their [aria-pressed] registers deleted; the kit composes
//      ring + register on the focused checked segment), the two DATA
//      readouts (.ob-pb-chip-t, .ob-pb-lurl) wrap (A8 no-ellipsis; the link shows compact since GH-1023, v54 on main), every
//      remaining :hover rides the fine-pointer guard, the three caps voices
//      wear the kit .ob-caps (no uppercase literal left in the sheet).
const PB_CSS_V = '56'; // v56: #1180 — the coarse strip block's hit box from the track's edge to (reach + 1) px above the shelf's edge (the paint stays the lane band; --ob-pb-lane-h, --ob-pb-shelf-pad, --ob-pb-touch-reach), the 10 px Latin camera captions recorded as an accepted dense register; the lead-in switch rides the overlay row's existing classes (the .ob-pb-lead rule stays for a cached pre-#1180 module); v55: comments only (stale A8 wording after GH-1023); v54 carries both v53 sheets: GH-1023 card 39 v2 (compact link row + visually-hidden full twin) and uiaudit #1011 (transport / steppers / strip toggle on the height ladder, caps camera captions) (net-zero lines: K1 pins playback.js lines)

// ---- the toolbar pill's OWN glyph (GH-246 defect 1) -------------------------
// The #ob-playback mark may NOT depend on `ui/icons.js` resolving. That module
// arrives through a GUARDED DYNAMIC IMPORT (the cache-poison contract in
// the ownership ledger (internal) deliberately allows the pairing "fresh app, stale/absent
// icons.js"), and in that register the pill used to paint a bare text '▸' — a
// play triangle that says "play", not "replay / history". The owner rejected it
// in the GH-243 review pack, so the path data lives HERE as a module constant
// and is emitted as inline SVG the moment the pill is built: zero import edge,
// nothing to fail, no boot-graph change (#49 doctrine rule 5).
//
// `ui/icons.js` keeps its own `playback` entry (exports are FROZEN-STABLE and
// the panel-head .ob-pb-mark below still routes through face()), so the same
// drawing lives in two places. `node web/tools/glyph-audit.mjs` gates the two
// copies BYTE-IDENTICAL and e2e-playback arm 6d gates the RENDERED markup
// against iconHtml() with icons.js blocked; the mark's COUNTER is measured on
// PIXELS by arm 6e. The marker convention is
// `/* OB-GLYPH:<icons.js name> */` followed by a plain string concatenation.
const PILL_GLYPH = /* OB-GLYPH:playback */ '<path d="M4 10A6 6 0 1 0 10 4"/>'
  + '<path d="M10 2.5L7.3 4L10 5.5Z" fill="currentColor" stroke="none"/>'
  + '<path d="M8.73 7.8L12.54 10L8.73 12.2Z" fill="currentColor" stroke="none"/>';
/** Inline-SVG markup for inlined path data — byte-identical to what
 * ui/icons.js `iconHtml(name, { size })` emits, so the icons-absent register is
 * INDISTINGUISHABLE from the normal one (that identity is the whole point, and
 * arm 6d asserts it). Decorative: the OWNING control carries the voice. */
const inlineGlyph = (paths, name, size = 20) => `<svg viewBox="0 0 20 20"`
  + ` width="${size}" height="${size}"`
  + ` fill="none" stroke="currentColor" stroke-width="1.5"`
  + ` stroke-linecap="round" stroke-linejoin="round"`
  + ` aria-hidden="true" focusable="false" data-icon="${name}">${paths}</svg>`;

const CLIP_CAP_SEC = 60;    // offline-render.js ruling (montage chip math) —
// since GH-304 the HONEST FLOOR: planBudget() below replaces it with the
// byte-derived budget only when the whole chain measured one
// ---- GH-314 immersive console ------------------------------------------------
// The overlay auto-hides after this many seconds of no interaction while
// PLAYING (state 2 → state 1). Accumulated on the RENDER CLOCK — the same
// rAF dt stream setPlaying's step loop advances playback on (deterministic-
// friendly: no wall-clock setTimeout chain to survive scrubs or drift; the
// timer only ever ticks while the play loop is live, because every
// non-playing state is a PIN).
const UI_HIDE_SEC = 3;
const BED_TAP_SLOP_PX = 8; // a bed press that moves past this is a camera
// gesture (orbit/pan), never a reveal tap
// GH-314 owner amendment (2026-08-02, QuickTime semantics — desktop/mouse
// only): the pointer LEAVING the document hides the overlay after this
// grace (edge-flicker protection), unless pinned. Accumulated on the SAME
// render clock as UI_HIDE_SEC (the outSec branch in the play step) — no
// setTimeout; 'shown' only exists while playing, so the loop is live
// whenever the grace matters.
const UI_LEAVE_GRACE_SEC = 0.3;
const INNER_TAIL = 0.25;    // renderDrill non-final settle beat (mirror)
const FINAL_TAIL = 0.5;     // framestep TAIL_SEC (mirror, chip estimate only)
// ---- GH-299 one-take walk-beat constants (owner verdict on GH-299) -------------
// The POV→POV boundary transition is a WALK: the risen-watch pose holds
// BEAT_HOLD s, then the camera walks a rail-following ring path around the
// table at WALK_V m/s (duration = real arc path length / speed, min
// BEAT_MIN_WALK), arriving at the next segment's address pose. The beat is
// an inter-segment window over the NEXT segment's INITIAL ball state
// (round-2.1 state-handoff law): BIH/respotted balls exist from the first
// beat frame, never popping in at the cut. v_walk 1.3 is the owner-approved
// centerpiece speed (round-2 sweep: 1.2 deliberate / 1.4 brisk).
const WALK_V = 1.3;         // m/s (owner verdict GH-299, decision 2)
const BEAT_HOLD = 0.3;      // risen-watch hold at beat start [s]
const BEAT_MIN_WALK = 0.6;  // min clamp on walkTime [s]
const WALK_CLEAR = 0.45;    // human clearance outside the cushion line [m]
// ---- GH-363 pre-strike lead-in constants (owner verdict on GH-363) --------
// Every segment whose slice starts at its record head gains a LEAD window
// before play frame 0: the staged cue lives its pre-strike choreography
// (v2 population-median practice strokes per discipline; v1 static address
// hold on the degrade ladder) on the segment's own NEGATIVE clock, contact
// converging on the play start. Lead seconds are FIXED output frames at
// rate 1 (the beat/tail law). FUSION (design 363 §5, REVISED by the GH-474
// camera-settle law): a kept POV→POV walk INTO the segment still arms the
// staged cue through the walk (`fuse`), but the cue HOLDS its static
// address stance there — the choreography clock starts at the walk's
// arrival (camera settle), so T_add = T_pre with no overlap subtraction
// (the old T_pre − (T_beat − BEAT_HOLD) started feathers mid-transition,
// the owner-reported build-17 defect). The montage budget
// degrades v2 → v1 → v1s → none (amber notice, the walkCuts idiom);
// full-mode plans render leads 1:1 (budget-exempt BY DESIGN, GH-305).
const LEAD_HOLD_V1 = 1.8;   // cuepostlive.js LEAD_HOLD_V1 (literal mirror)
const LEAD_HOLD_V1S = 0.6;  // cuepostlive.js LEAD_HOLD_V1S (literal mirror)
const LEAD_TIERS = ['v2', 'v1', 'v1s']; // the degrade ladder, in order
// ---- GH-452 reset-boundary fade (replace-class state discontinuity) -------
// A segment whose record stages a BIT-EXACT copy of its predecessor's
// initial ball census is a RESET boundary: the table was put back by rule
// (GH-382 WPBSA R14(b) miss-REPLACE restores the judged stroke's address
// byte-identically — a played stroke can never return every ball
// bit-exactly). The GH-299 walk-beat state handoff covers POV→POV pairs;
// everywhere else the boundary hard-cut on an unchanged camera and read as
// a single-frame ball teleport (GH-452). The bridge is the EXISTING GH-301
// fade element — dip-to-black, exactly black at the boundary instant (the
// edit-law non-continuous-state marker; the round-2.1 state-handoff law's
// "never popping in at the cut" intent) — derived from record truth, never
// written into the user's cameraPlan model. Duration = the strip UI's
// shipped FADE_DEFAULT (playback-strip.js literal mirror).
const RESET_FADE_SEC = 1.0;
// camera shelf tiles (mockup 02): id → { icon, preset } where preset is a
// camerapresets.js name, { track } for the __track chase rig, or { pov }
// for the camerascript.js first-person rig (GH-275, owner decision B —
// a recorded deviation from the owner-signed shelf); rail/close are
// desktop-only (CSS .ob-pb-cam--desktop). Measured tile-band ruling for
// the 4th phone tile: at the 852×393 phone geometry the row1 budget is
// ~800 CSS px and 4 tiles (4×78 + 3×gap) + the speed detents + a lit
// montage chip total ~610 px worst case — POV fits with ~190 px slack,
// so no desktop-only split and no narrower tile.
const CAMS = [
  { id: 'broadcast', icon: 'cam-broadcast', preset: 'side' },
  { id: 'chase', icon: 'cam-chase', preset: { track: { target: 'cue' } } },
  { id: 'pov', icon: 'cam-pov', preset: { pov: true } },
  { id: 'overhead', icon: 'cam-overhead', preset: 'top' },
  { id: 'rail', icon: 'cam-rail', preset: 'follow', desktop: true },
  { id: 'close', icon: 'cam-close', preset: 'closeup', desktop: true },
];
// GH-301 phone row1 budget RE-MEASURE (contract §3.3, recorded before
// merge; measured by e2e-playback arm 16's phone register): with the
// compound `CAM ▾` slot pill beside the 4 phone tiles, the speed detents
// AND a lit montage chip, the 852×393 row1 measures 738 CSS px of its
// 798 px width — 60 px slack in the worst case. The compound pill costs
// one 78 px tile + gap, which is why the phone takes ONE compound pill and
// never three inline slot pills (those would cost 258 px and overrun by
// ~198 px). Desktop (≥1000 CSS px) carries CAM 1/2/3 inline via the
// rail/close `.ob-pb-cam--desktop` split.
const SPEEDS = [0.25, 0.5, 1];

// ---- GH-301 director strip: the cameraPlan model (contract §1, FROZEN) -----
// cuts[{seg, t, cam, transitionIn, dur}] sorted by (seg, t), ≤ 128;
// poses[{slot, eye, look, fov}] custom tripods, slots 0-7 (UI: CAM 1/2/3).
// Registries (§1.4, append-only): camId 0..5 = the CAMS row order above,
// 6-7 reserved future presets, 8-15 custom slots (8 + slot); transId
// 0 cut | 1 move | 2 fade. Unknown ids in a decoded/stale plan degrade at
// APPLY time (unknown cam → CAMS[0], unknown transition → hard cut) and
// never throw — camera is a presentation axis.
// QUANTIZE-AT-SAVE law (§1.1): the model NEVER holds unquantized values —
// anchors/durations are INTEGER centiseconds (the 10 ms grid), poses are
// integer millimetres / decidegrees, written quantized at capture time so
// the live player, savePlan/renderDrill and a future share decode all
// evaluate byte-identical numbers.
const CUT_MAX = 128;      // model-level caps (§1.5 — the codec mirrors these)
const SLOT_MAX = 8;
const FADE_CAP_CS = 500;  // fade dur ceiling: 5.00 s on the 10 ms grid
const qCs = (sec) => {
  const v = Math.round(Number(sec) * 100);
  return Number.isFinite(v) && v > 0 ? v : 0; // non-finite pins to the grid 0
};
const csSec = (cs) => cs / 100; // exact IEEE division — identical everywhere
const camIdOf = (name) => CAMS.findIndex((c) => c.id === name);
const isDynamicCamId = (n) => n === 1 || n === 2; // chase, pov: whole-segment
// spans only in v1 (§1.5 — no deterministic mid-segment entry state)
const isCustomCamId = (n) => n >= 8 && n < 8 + SLOT_MAX;
const emptyPlan = () => ({ cuts: [], poses: [] });
const clonePlan = (p) => ({
  cuts: (p?.cuts ?? []).map((c) => ({ seg: c.seg, t: c.t, cam: c.cam,
    transitionIn: c.transitionIn, dur: c.dur })),
  poses: (p?.poses ?? []).map((x) => ({ slot: x.slot, eye: [...x.eye],
    look: [...x.look], fov: x.fov })),
});
// archive gameId → raw kernel rack kind (the rack the session's records need
// under them; 'fifteen' covers every pool rack but 9-ball)
const RACK_KIND = {
  nine_ball: 'nine', eight_ball: 'fifteen', one_pocket: 'fifteen',
  straight_pool: 'fifteen', snooker: 'snooker', carom_3cushion: 'carom',
};
// rack-kind → equipment CLASS (the pool kinds share table dims + ball-set
// visuals; snooker/carom are kind-locked in the kernel), plus the ballset
// census fingerprints (nine=10, fifteen=16, snooker=22, carom=3 — the
// main.js rerackKind doc). Review merge-gate P1: loadRecord's ball-id check
// is a SUBSET check, so a cross-class session whose ids all exist in the
// active rack staged silently on the wrong equipment (a 9-ball session on
// the snooker table, carom on pool) — this detection is proactive, never
// error-driven, and it STAYS. GH-257 changes only what it decides: a
// mismatch now SWAPS the bed to the session's own kind + equipment for the
// duration of playback instead of refusing to open the session at all.
// Same-class staging (9-ball rows on a fifteen rack) still rides the live
// bed untouched: dims/ball paint are identical and absent balls park as
// pocketed.
const KIND_CLASS = { nine: 'pool', fifteen: 'pool', snooker: 'snooker', carom: 'carom' };
const CENSUS_CLASS = { 3: 'carom', 10: 'pool', 16: 'pool', 22: 'snooker' };
// census → rack kind, the fallback for a stale game.js that has no
// `rackKind` truth (the pool ambiguity resolves by ball count)
const CENSUS_KIND = { 3: 'carom', 10: 'nine', 16: 'fifteen', 22: 'snooker' };
// GH-319: per-kind ball-id domains (kernel truth, rack.rs ball_ids_are_stable
// — every kind's ids are contiguous 0..max: nine = cue 0 + 1..9, fifteen =
// 0..15, snooker = cue 0 + reds 1..15 + colours 16..21, carom = 0..2) and the
// KIND-LOCKED discipline table dims (wpbsa_snooker_12ft 3.569×1.778,
// umb_carom_284 2.84×1.42 — kernel constants; pool dims follow the equipment
// spec and every catalog pool table is the 9-ft 2.54×1.27 class, so neither
// discipline print collides with a pool record's).
const KIND_MAX_ID = { nine: 9, fifteen: 15, snooker: 21, carom: 2 };
const SNOOKER_DIMS = [3.569, 1.778];
const CAROM_DIMS = [2.84, 1.42];

/** GH-319 (the GH-257 open-anything law): the rack kind whose bed hosts
 * EVERY record of the session — decided by the RECORDS' own truth, with the
 * session's gameId stamp only as the tiebreak among id-compatible pool
 * kinds. The stamp names the GAME, but drill sessions rack on the DRILL's
 * kind (drills.js start(): the lineup family / circle / penalty drills are
 * rack:'fifteen' under the nine_ball game), so a stamp-derived kind
 * under-provisioned the bed and an archived "9-ball" lineup session refused
 * with "record balls [10..15] not in the current rack" from every
 * non-fifteen live bed — including its own game's. The id domain is the
 * UNION across the session (review r2 P2: attempt layouts lay DIFFERENT
 * subsets per record with no session split — progressive-lineup opens at
 * ids 0..5 and later lays 10..15, so the first record alone would still
 * under-provision the later segments' quiet stages). Ids give the floor
 * (16..21 exist on the snooker bed alone); the kind-locked discipline dims
 * split the id-compatible classes (a pool drill rack recorded under a
 * snooker-stamped session must not stage on the 12-ft bed, and ids 0..2
 * fit everywhere until the carom print names the carom bed); a
 * recordless/malformed session keeps the stamp. */
function recordKind(recs, metaKind) {
  let maxId = -1;
  let t = null;
  for (const rec of recs ?? []) {
    for (const b of rec?.initial?.balls ?? []) {
      const n = Number(b?.id);
      if (Number.isFinite(n) && n > maxId) maxId = n;
    }
    t = t ?? rec?.initial?.table ?? null; // dims are session-constant
  }
  if (maxId < 0) return metaKind;
  const dims = (d) => !!t && Math.abs(t.length - d[0]) < 1e-6
    && Math.abs(t.width - d[1]) < 1e-6;
  if (maxId > KIND_MAX_ID.fifteen) return 'snooker';
  if (maxId > KIND_MAX_ID.nine) return dims(SNOOKER_DIMS) ? 'snooker' : 'fifteen';
  // small-census session (ids ≤ 9 — e.g. plain 9-ball, or a carom session):
  // every kind's domain hosts it, so the discipline prints outrank the
  // stamp, then a pool stamp that hosts the ids stands, then the smallest
  // pool bed that does.
  if (dims(SNOOKER_DIMS)) return 'snooker';
  if (dims(CAROM_DIMS)) return 'carom';
  if (KIND_CLASS[metaKind] === 'pool' && maxId <= (KIND_MAX_ID[metaKind] ?? -1)) {
    return metaKind;
  }
  return 'nine';
}

/** GH-452: reset-boundary detection — original segment indices r (≥ 1) whose
 * record's initial ball census is BIT-EXACT identical (ids + positions) to
 * segment r−1's. That is the replace-class signature (GH-382 restores the
 * judged stroke's address byte-identically; a played stroke can never return
 * every ball bit-exactly), pure in record bytes so archived sessions detect
 * on open with no schema change. Drill sessions are excluded: attempt loops
 * restage the same layout BY DESIGN and their boundaries read as "next
 * attempt" under the shipped montage grammar, not as an official's reset. */
function resetBoundsOf(recs, meta) {
  if (meta?.drill) return [];
  const key = (rec) => {
    const balls = rec?.initial?.balls;
    if (!Array.isArray(balls) || !balls.length) return null;
    return balls
      .map((b) => `${b?.id}:${b?.state?.pos?.x},${b?.state?.pos?.y},${b?.state?.pos?.z}`)
      .sort().join('|');
  };
  const out = [];
  let prev = key(recs?.[0]);
  for (let r = 1; r < (recs?.length ?? 0); r++) {
    const cur = key(recs[r]);
    if (cur !== null && cur === prev) out.push(r);
    prev = cur;
  }
  return out;
}

const fmtT = (sec) => {
  // round to tenths FIRST: 59.96 must read 1:00.0, never "0:60.0"
  const d = Math.round(Math.max(0, sec) * 10);
  return `${Math.floor(d / 600)}:${((d % 600) / 10).toFixed(1).padStart(4, '0')}`;
};

let created = false;

/** Idempotent entry point (the guarded main.js seam). The kit is optional:
 * dialog.js/icons.js absence degrades to the module scrim + text glyphs
 * (the record-quality.js nokit register) — the pill always installs. */
export function createPlayback({ machine, game }) {
  if (created || !machine || !game || window.__playback) return;
  created = true;

  let kv = null;
  try { kv = String(kernel_version()); } catch { kv = null; }

  /** GH-318 lineage-aware kernel-stamp mismatch: true only for a
   * GENUINELY different engine. A KERNEL_COMPAT_LINEAGE-proven pair
   * (version-only repin, Gate G-KERNEL byte-identity proof) is the same
   * engine byte-for-byte, so neither the old-kernel badge nor the
   * view-only/diagnostic path may fire for it — the badge used to lie on
   * every pre-repin archived session after a restamp. Feature-detected
   * TWICE (cache-poison register): a stale dist share.js has no
   * lineageCompatible, and a stale game.js loadRecord is strictly
   * pre-318 (no lineageAware marker) and would REFUSE the un-flagged
   * load — either degrades to the raw compare, i.e. exact pre-fix
   * behavior (badge over-shows, view-anyway held; never a broken open).
   * P-III strict replay for truly different kernels is untouched. */
  const kernelMismatch = (recorded) => !!(recorded && kv && recorded !== kv
    && !(game.loadRecord?.lineageAware === true
      && shareSdk.lineageCompatible?.(recorded, kv) === true));

  // guarded kit/icon/color/coords imports — null until (and unless) they
  // resolve; every consumer degrades honestly on null (leaf contract)
  let dialog = null, icons = null, colors = null, coords = null, selMod = null;
  let povMod = null; // GH-911: the POV pose leaf; null until and unless the guarded import resolves
  // GH-911 (plan C3 site 3, OQ-2 (a), OQ-10 (a)): the record-bound rod's
  // guarded sources, latched the same way: the planner (cuepost.js
  // planRecordRod), the spec (cuepostlive.js liveCuePostSpec) and route (1)'s
  // engine, with the reason the engine is absent for the per-open engine line.
  let cuepostMod = null, cuepostliveMod = null, povEngine = null, povEngineWhy = 'unsettled';
  let ctl = null; // ui/controls.js — makeButton/setButtonFace (GH-245 wave B)
  let stripMod = null, stripUi = null; // GH-301 director strip (guarded leaf)
  // GH-668 S5 replays r4 (review r2 P2, C1b): the DVR head's filter FORM is
  // decided by the kit dialog's capability (buildPanel), so a cold open
  // awaits the leaf's settle (one microtask once resolved; bounded). r5
  // (checker P3): ONE bounded wait for both panel builders — openList and
  // openSession — so a rail-row tap before the leaf settles never builds
  // the legacy form under a fresh kit for the rest of the session.
  let dialogLoad = Promise.resolve();
  const DIALOG_SETTLE_MS = 1500; // a stalled leaf builds the legacy form
  const settleDialog = () => Promise.race([dialogLoad, new Promise((r) => setTimeout(r, DIALOG_SETTLE_MS))]);
  let povLoad = Promise.resolve();
  // GH-911 (plan C3 site 2, r6 C-settle): the planner, spec and engine loads
  // join the leaf's one bounded race; each ends in .catch, so none rejects.
  let cuepostLoad = Promise.resolve(), cuepostliveLoad = Promise.resolve(), engineLoad = Promise.resolve();
  const POV_SETTLE_MS = 2000; // GH-911 OQ-5: the 1500 ms dialog settle (DIALOG_SETTLE_MS) plus one 500 ms frame margin
  const settlePov = () => Promise.race([Promise.all([povLoad, cuepostLoad, cuepostliveLoad, engineLoad]), new Promise((r) => setTimeout(r, POV_SETTLE_MS))]);
  // GH-668 S5 replays r8 (review r5 P2): the KEYBOARD cancellation of a
  // PENDING open. The base installed its fallback Escape (escList) in the
  // same synchronous turn as the open; the r4 bounded wait left BOTH the kit
  // trap and escList uninstalled until the leaf settled, so an Escape pressed
  // during a cold open cancelled nothing and the list (or the player) opened
  // afterwards — the round-6 openGen guard covered `close()` only. Every
  // pending open arms ONE document-capture Escape handler BEFORE its first
  // await (refcounted across concurrent opens) that bumps `openGen` exactly
  // like close() — the open judges the token after each await and returns —
  // and disarms it when the wait settles, so the kit trap (or escList on the
  // kit-less path) takes over and a press is never doubled. Arm F1i (the
  // Escape legs, list + session paths).
  let pendingEsc = 0;
  function escPending(e) {
    if (e.key !== 'Escape') return;
    openGen++;
    if (opening) cancelArchiveHold(staging);
  }
  /** Arm the pending-open Escape; returns the idempotent disarm. */
  function armPendingEsc() {
    if (pendingEsc++ === 0) document.addEventListener('keydown', escPending, true);
    let armed = true;
    return () => {
      if (!armed) return;
      armed = false;
      if (--pendingEsc === 0) document.removeEventListener('keydown', escPending, true);
    };
  }
  // GH-668 S5 replays r9 (round-8 checker P3): openPlayer's OWN arming slot.
  // openSession disarms its handler before the launch, and openPlayer's
  // bounded cue-readiness wait (openPlayerInner) was the one window left
  // where a press met no handler. One openPlayer is in flight at a time
  // (the `opening` latch), so one slot is sound; the release is idempotent
  // and runs from openPlayer's finally on every exit as well.
  let openEscDisarm = null;
  const disarmOpenEsc = () => { const d = openEscDisarm; openEscDisarm = null; d?.(); };
  try {
    dialogLoad = import('./ui/dialog.js').then((m) => { dialog = m; }).catch(() => {});
    import('./ui/icons.js').then((m) => { icons = m; retrofitIcons(); })
      .catch(() => {});
    import('./ballset.js').then((m) => { colors = m; }).catch(() => {});
    import('./coords.js').then((m) => { coords = m; }).catch(() => {});
    povLoad = import('./povpose.js').then((m) => { povMod = m; }).catch(() => {});
    // GH-911 (plan C3 site 3): the rod's planner and spec leaves, the same
    // guarded form; a stale module is read at the open as absent.
    cuepostLoad = import('./cuepost.js').then((m) => { cuepostMod = m; }).catch(() => {});
    cuepostliveLoad = import('./cuepostlive.js').then((m) => { cuepostliveMod = m; }).catch(() => {});
    // GH-911 route (1)'s engine (plan C2 engine bullet, B18): main.js's two
    // module URLs (main.js:7-8), so the same module instances, then the
    // feature-detected init over the glue; the glue's own init is idempotent
    // (engine.js:48), so the Engine wraps the wasm instance the replay uses.
    let povSdk = null, povGlue = null;
    engineLoad = Promise.all([
      import('../dist/pool-sdk/index.js').then((m) => { povSdk = m; }).catch(() => {}),
      import('../dist/pool-wasm/pool_wasm.js').then((m) => { povGlue = m; }).catch(() => {}),
    ]).then(async () => {
      if (!povSdk || !povGlue) { povEngineWhy = povSdk ? 'wasm import failed' : 'sdk import failed'; return; }
      if (typeof povSdk.init !== 'function') { povEngineWhy = 'no init'; return; }
      try {
        povEngine = (await povSdk.init(povGlue)) ?? null;
        if (!povEngine) povEngineWhy = 'init returned no engine';
      } catch (e) { povEngineWhy = `init threw: ${e?.message ?? e}`; }
    }).catch(() => {});
    // ui/controls.js: the kit button factory + the hoisted face swap. A
    // stale/absent module leaves mkBtn()'s hand-rolled twin and face()'s
    // legacy path in charge — same classes, same anatomy, never a throw.
    import('./ui/controls.js').then((m) => { ctl = m; }).catch(() => {});
    // GH-301 director strip: the cut-list EDITOR leaf (lane, seams, slot
    // pills, capture). The MODEL lives HERE — an absent/stale strip module
    // is the recorded degrade (contract §3.4): no lane, no capture, pill
    // taps write boundary-only assignments = the exact GH-273 player, and
    // savePlan still emits a valid plan.
    import('./playback-strip.js').then((m) => { stripMod = m; initStrip(); })
      .catch(() => {});
    // ui/select.js: the card's resolution picker is a KIT combobox, never
    // the native system menu (owner defect C). A stale/absent module leaves
    // the native <select> in place and working — never a throw (the
    // retrofitIcons late-load pattern).
    import('./ui/select.js').then((m) => { selMod = m; retrofitSelect(); })
      .catch(() => {});
  } catch { /* degrade paths handle null */ }

  // GH-461: CRITICAL pill skin, SYNCHRONOUS (the settings.js GH-246 gear
  // precedent) — the async leaf sheet left the toolbar pill first-painting
  // as the UA default button (blank white disc) which its own `transition:
  // background` then animated dark through the boot overlay fade. Settled
  // base skin verbatim, injected BEFORE the link so the arriving sheet
  // stays authoritative on every equal-specificity tie; the the ownership ledger
  // e2e-playback leaf-sheet anti-flake note records the retired mechanism.
  if (!document.getElementById('ob-pb-crit')) {
    const crit = document.createElement('style');
    crit.id = 'ob-pb-crit';
    crit.textContent = `
      #ob-toolbar > #ob-playback { order: 0; }
      /* GH-668 B-K16: fixed offset = the stale-app.html fallback ONLY;
         material, rungs, coarse 44 and reduced motion are the kit toolbar
         part (.ob-btn--glass + .ob-toolbar-pill) */
      #ob-playback { position: fixed; top: 142px; right: 10px; }
    `;
    document.head.appendChild(crit);
  }

  // LEAF stylesheet with the ?v= cache-bust law (help.js precedent)
  if (!document.getElementById('ob-pb-css')) {
    const link = document.createElement('link');
    link.id = 'ob-pb-css';
    link.rel = 'stylesheet';
    link.href = new URL(`./ui/playback.css?v=${PB_CSS_V}`, import.meta.url);
    document.head.appendChild(link);
  }

  // `typeof` rather than `icons?.icon(...)`: a resolved-but-shapeless leaf
  // (a pre-icon cached ui/icons.js, or one served as an empty register) is a
  // module OBJECT with no `icon` export, where optional chaining stops
  // guarding and the call throws. Absence must reach the text fallback.
  const ico = (name, size) => (typeof icons?.icon === 'function'
    ? icons.icon(name, size ? { size } : undefined) : null);
  /** Set `el`'s face to icon `name`, falling back to `text` (GH-49 law).
   * IDEMPOTENT per face (QA wave): syncTransport re-faces the play button
   * on EVERY rendered frame during play — an unconditional replaceChildren
   * detached the mousedown-target svg before mouseup, so Chrome never
   * synthesized the click and real pause clicks on the glyph were eaten.
   * The key tracks icon-vs-text so a late icons.js load still upgrades. */
  const face = (el, name, text, size) => {
    const g = ico(name, size);
    // GH-245: route through the kit's hoisted swap when it resolved — this
    // module was one of the seven private copies setButtonFace() exists to
    // hoist. Same idempotence guarantee (the per-frame play/pause reface),
    // anatomy-aware (a factory-built button gets its .ob-btn__icon slot, a
    // bare holder span keeps the direct write). The legacy body below stays
    // as the stale/absent-controls.js register.
    if (typeof ctl?.setButtonFace === 'function') {
      try { ctl.setButtonFace(el, g, text); return; } catch { /* legacy */ }
    }
    const key = `${g ? 'i' : 't'}:${name}:${size ?? ''}`;
    if (el.dataset.obFace === key) return;
    el.dataset.obFace = key;
    if (g) el.replaceChildren(g);
    else el.textContent = text;
  };
  /** Kit-anatomy icon+label button THROUGH ui/controls.js makeButton()
   * (GH-245 wave B — the factory's first real shipped callers), with a
   * hand-rolled twin for the stale/absent-module register: same classes,
   * same two-slot anatomy, so the skin and the audit see one shape either
   * way (the `ctl.makeButton?.(…) ?? handRolledFallback` contract). */
  const mkBtn = (o) => {
    if (typeof ctl?.makeButton === 'function') {
      try { return ctl.makeButton(o); } catch { /* twin below */ }
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ['ob-btn', o.variant ? `ob-btn--${o.variant}` : '',
      o.iconOnly ? 'ob-btn--icon' : ''].filter(Boolean).join(' ');
    if (o.title) {
      b.title = o.title;
      if (!o.label) b.setAttribute('aria-label', o.title);
    }
    if (o.titleKey) b.dataset.i18nTitle = o.titleKey;
    if (o.icon || o.fallbackGlyph) {
      const slot = document.createElement('span');
      slot.className = 'ob-btn__icon';
      slot.setAttribute('aria-hidden', 'true');
      if (o.icon) slot.replaceChildren(o.icon);
      else slot.textContent = o.fallbackGlyph;
      b.appendChild(slot);
    }
    if (o.label) {
      const lab = document.createElement('span');
      lab.className = 'ob-btn__label';
      if (o.i18nKey) lab.dataset.i18n = o.i18nKey;
      lab.textContent = o.label;
      b.appendChild(lab);
    }
    return b;
  };
  let retrofitIcons = () => {}; // reassigned once the surfaces exist
  // build-once faces that no later render rebuilds (the footer legend): a
  // LATE icons.js resolve must still upgrade them off their text fallback.
  // Rows do not need this — renderList() rebuilds them on every open.
  const lateFaces = [];
  let retrofitSelect = () => {}; // reassigned once the card exists (late
  // select.js load upgrades an already-open card's resolution picker)

  // ---- toolbar pill (mockup 01 slot: leftmost, order 0 — but the NEUTRAL
  //      toolbar-family voice, not the mockup's accent; see the deviation
  //      note atop ui/playback.css) -------------------------------------------
  const pill = document.createElement('button');
  pill.id = 'ob-playback';
  pill.type = 'button';
  pill.className = 'ob-btn ob-btn--icon ob-btn--glass ob-toolbar-pill'; // GH-668 B-K16 toolbar part
  pill.dataset.i18nTitle = 'playback.open';
  pill.setAttribute('aria-haspopup', 'dialog');
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  // GH-246: the real vector mark, inlined — never a text glyph, never a
  // dependency on the icons import (no `face()` here, and retrofitIcons no
  // longer touches it)
  glyph.innerHTML = inlineGlyph(PILL_GLYPH, 'playback');
  pill.appendChild(glyph);
  pill.addEventListener('click', () => openList());
  (() => {
    // insert sorted by toolbar order so TAB order matches the visual order
    // (the help.js/gear shape verbatim); stale app.html → fixed offset
    const tb = document.getElementById('ob-toolbar');
    if (!tb) { document.body.appendChild(pill); return; }
    pill.dataset.tbOrder = '0';
    const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > 0);
    tb.insertBefore(pill, next || null);
  })();

  const relabel = () => {
    pill.title = t('playback.open');
    pill.setAttribute('aria-label', t('playback.open'));
  };
  onLocaleChange(relabel);
  relabel();

  // ---- session list (mockup 01) ---------------------------------------------
  let panel = null, listEl = null, footUse = null, scrim = null;
  let filter = 'all';
  let listOpen = false;
  // 035a (the replays contract (feature 035, internal) §3.2 `mountList`):
  // additive list HOSTS. The modal `listEl` stays the DEFAULT host (every
  // shipped call site is byte-equivalent); a registered host carries its
  // own activation (`onOpen`), `controls` (per-row delete), `limit` (cap
  // applied BEFORE the detail sweep), `markers` ('eager' | 'meta' = lazy
  // strips) and `onChange`; every renderList() pass paints ALL hosts.
  const listHosts = new Map(); // host element → record
  // 035a: the openSession seam's pending window — true from its FIRST line
  // (before the archive read) until openPlayer returns; opening() ORs it
  // with the openPlayer latch so the shell's entry gate sees ONE truth.
  let pendingSession = false;
  let noteTimer = 0;

  const arch = () => window.__archive;
  const nameOfGame = (gid) => (gid && has(`game.${gid}`) ? t(`game.${gid}`) : (gid ?? '—'));
  const nameOfDrill = (id) => (id && has(`drills.name.${id}`) ? t(`drills.name.${id}`) : (id ?? '—'));
  const modeOf = (m) => (m.drill ? 'practice'
    : m.playground || m.mode === 'playground' ? 'playground'
      : m.mode === 'practice' ? 'practice' : 'match');

  async function confirmKit(kind) {
    try {
      if (typeof dialog?.confirmDialog === 'function') {
        return await dialog.confirmDialog({
          title: t(`playback.${kind}.title`), body: t(`playback.${kind}.body`),
          confirmLabel: t(`playback.${kind}.confirm`),
          cancelLabel: t('confirm.cancel'),
        });
      }
    } catch { /* fall through to the native confirm */ }
    return window.confirm(t(`playback.${kind}.title`));
  }

  /** Transient notice inside the list (honest degradation surface). */
  function note(msg) {
    if (!listEl) return;
    let el = listEl.querySelector('.ob-pb-empty[data-note]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ob-pb-empty';
      el.dataset.note = '1';
      listEl.prepend(el);
    }
    el.textContent = msg;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => el.remove(), 6000);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'ob-pb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.display = 'none';
    const head = document.createElement('div');
    head.className = 'ob-pb-head';
    const mark = document.createElement('span');
    mark.className = 'ob-pb-mark';
    mark.setAttribute('aria-hidden', 'true');
    face(mark, 'playback', '▸', 22);
    const h = document.createElement('h2');
    h.className = 'ob-title'; // B-K24 title role (16 / 620 / tight) from the kit
    h.dataset.i18n = 'playback.title';
    // GH-668 B-K06 focus-on-present: the list's open lands focus on its
    // TITLE (script-focusable, never a Tab stop) instead of the first filter
    // segment — a programmatic open no longer rings the selected chip
    // (critique R-15); dialog.js openPanel prefers this anchor.
    h.tabIndex = -1;
    h.dataset.obPresentFocus = '';
    // GH-668 S5 G4 (B-RP03 / B-K16): the filter strip IS the kit
    // `.ob-segmented[role=radiogroup]` — the kit's own markup (label > radio
    // + span.ob-control; kit.css: intrinsic width, nowrap at kit
    // specificity, checked = bg-3 / accent ink / el-1, ring + register
    // COMPOSED on the focused checked segment — critique R-15 / R-06). Arrow
    // keys move the selection inside the group, Tab enters once (radio
    // semantics — the GH-245 recorded residual is now the model; the strip's
    // title says so, playback.help.filterKeys). `data-filter` stays on the
    // LABEL for the frozen tools (kit follow-up F4: data-* pass-through).
    // Class + role are set synchronously; the guarded kit leaf only arms the
    // GH-667 stack fallback when it settles (a stale kit still paints).
    // GH-668 S5 replays r4 (review r2 P2, C1b — the mixed-cache rule both
    // ways): the radio form is CAPABILITY-GATED on the kit dialog's registry
    // key `DIALOG_CAPS.trapRadioGroups` (r5 checker ruling: ONE registry —
    // the r4 standalone `TRAP_RADIO_GROUPS` export is folded into it;
    // ui/dialog.js focusables(): a radio GROUP is one stop of the trap's
    // cycle). A fresh playback.js under a STALE pre-r3 dialog.js listed
    // every radio as a member — Shift+Tab from a checked non-All segment
    // walked OUT of the modal. The kit leaf IS in the sw BOOT precache
    // (content-hashed; a sw'd update refreshes both together) — the mixed
    // pairing is the no-sw / HTTP-cache / cache-poison class the
    // the ownership ledger mixed-freshness law names, and the gate stands on THAT
    // law. Without the capability the strip is the LEGACY form: four kit
    // toggle buttons (`.ob-btn--toggle`, B-K16 — pressed = the segmented
    // "checked" register), `data-filter` on each, aria-pressed as the
    // painted truth, the same ONE filter seam (setFilter writes both
    // forms). Contract §7 rows 49 / 51; e2e-replays F1i serves a dialog.js
    // WITHOUT the key (derived from the current leaf — arms never read git
    // history) and proves it.
    const radioTrap = dialog?.DIALOG_CAPS?.trapRadioGroups === true;
    const filters = document.createElement('span');
    filters.className = radioTrap ? 'ob-pb-filters ob-segmented' : 'ob-pb-filters';
    filters.setAttribute('role', radioTrap ? 'radiogroup' : 'group');
    // r8: hasLocal-gated (review r5 P3); r9 (review r6 P3): the RADIO form only
    // — the legacy toggles answer clicks alone, so "arrow keys move the
    // selection" would be false there (no matching copy exists under a
    // gated key, and no key is added: the legacy form carries no hint)
    if (radioTrap) helpTitle(filters);
    for (const f of ['all', 'match', 'practice', 'playground']) {
      if (!radioTrap) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ob-btn ob-btn--toggle';
        b.dataset.filter = f;
        b.setAttribute('aria-pressed', String(f === filter));
        const lab = document.createElement('span');
        lab.className = 'ob-btn__label'; // the kit makeButton label slot
        lab.dataset.i18n = `playback.filter.${f}`;
        lab.textContent = t(`playback.filter.${f}`);
        b.appendChild(lab);
        b.addEventListener('click', () => {
          filter = f;
          for (const x of filters.children) x.setAttribute('aria-pressed', String(x.dataset.filter === f));
          renderList('filter');
        });
        filters.appendChild(b);
        continue;
      }
      const lab = document.createElement('label');
      lab.dataset.filter = f;
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'ob-pb-filter';
      inp.value = f;
      inp.checked = f === filter;
      // `change` fires once, on the segment that became checked — the ONE
      // filter truth; every host follows through renderList (035a)
      inp.addEventListener('change', () => {
        if (!inp.checked) return;
        filter = f;
        renderList('filter');
      });
      const txt = document.createElement('span');
      txt.className = 'ob-control';
      txt.dataset.i18n = `playback.filter.${f}`;
      lab.append(inp, txt);
      filters.appendChild(lab);
    }
    if (radioTrap) {
      import('./ui/controls.js').then((m) => { m.upgradeSegmented?.(filters); })
        .catch(() => { /* stale kit: the strip is still a segmented */ });
    }
    const close = document.createElement('button');
    close.type = 'button';
    // GH-245: the unified kit close register (ghost icon circle) —
    // .ob-pb-close stays as the structure hook (frozen tools key on it)
    close.className = 'ob-btn ob-btn--ghost ob-btn--icon ob-pb-close';
    close.dataset.i18nTitle = 'playback.close';
    close.setAttribute('aria-label', t('playback.close'));
    face(close, 'close', '✕', 16);
    close.addEventListener('click', () => dismissList()); // r10: a dismissal cancels a pending launch
    // GH-668 S5 G7 fix 3 (the pack's 667 ×7 head sheet): the head has TWO
    // registers — ONE line (mark · title · strip · close) while the strip
    // shares the title's line; else `.ob-pb-head--stack`: the close stays on
    // the TITLE's line (the dialog convention) and the strip drops WHOLE
    // onto its own end-aligned line. Before: the phone head flex-wrapped
    // child by child and a kit strip wider than the title's line left the
    // close ORPHANED on a row of its own under the strip (fr at 667). Judged
    // after layout in the unstacked form (the close's centre leaves the
    // title's line, or the head overflows), re-judged on resize
    // (ResizeObserver on the head, rAF-coalesced so a register flip never
    // lands inside the observer's own delivery) and on re-text (a
    // MutationObserver on the strip: locale switches re-text the labels).
    // TWO MEASURERS, ONE STRIP (F1e after the kit FIT LADDER merge,
    // playback.css .ob-pb-tools): the kit's ladder (controls.js
    // fitSegmented) judges the strip against its own well and may change
    // the strip's pole (`.ob-segmented--stack`); this judge owns the LINE.
    // The tools cell never shrinks on the line (playback.css flex-shrink
    // 0), so the kit only ever measures a well this judge chose — the
    // intrinsic pill on the title's line, the full head width once
    // stacked. A strip the kit stacked anyway (the head narrower than the
    // pill's intrinsic width, a 320 px phone) keeps the head stacked:
    // unstacking would hand the kit a narrower well, whose stack would
    // re-stack the head — the two judges would alternate every frame. The
    // strip's class flips are observed so a kit pole change re-judges the
    // head in the same frame cadence as a resize.
    const tools = document.createElement('div');
    tools.className = 'ob-pb-tools';
    tools.appendChild(filters);
    head.append(mark, h, tools, close);
    const STACK_HEAD = 'ob-pb-head--stack';
    let headRaf = 0;
    const judgeHead = () => {
      headRaf = 0;
      if (!head.isConnected || head.clientWidth === 0) return; // hidden: keep the last decision
      head.classList.remove(STACK_HEAD);
      const hr = h.getBoundingClientRect(), cr = close.getBoundingClientRect();
      const offLine = Math.abs((cr.top + cr.height / 2) - (hr.top + hr.height / 2)) > 4 || head.scrollWidth > head.clientWidth + 1;
      const stripStacked = filters.classList.contains('ob-segmented--stack'); // the kit's pole (two-measurer rule above)
      head.classList.toggle(STACK_HEAD, offLine || stripStacked);
    };
    const queueHead = () => { if (!headRaf) headRaf = requestAnimationFrame(judgeHead); };
    if (typeof ResizeObserver === 'function') new ResizeObserver(queueHead).observe(head);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(queueHead).observe(filters, { childList: true, subtree: true, characterData: true });
      new MutationObserver(queueHead).observe(filters, { attributes: true, attributeFilter: ['class'] }); // the kit's pole flips
    }
    listEl = document.createElement('div');
    listEl.className = 'ob-pb-list';
    const foot = document.createElement('div');
    foot.className = 'ob-pb-foot';
    footUse = document.createElement('span');
    footUse.className = 'ob-nums';
    const clear = document.createElement('button');
    clear.type = 'button';
    // GH-245: kit ghost voice; .ob-pb-clear keeps the danger ink + footer
    // metrics (and restates the ink on hover — the ghost rung must never
    // read a destructive control as safe)
    clear.className = 'ob-btn ob-btn--ghost ob-pb-clear';
    clear.dataset.i18n = 'playback.clearAll';
    clear.addEventListener('click', async () => {
      if (!(await confirmKit('confirmClear'))) return;
      await arch()?.purge?.();
      renderList('mutation');
    });
    // GH-242 decision 3a: the marker vocabulary is TAUGHT here — one inline
    // line beside the storage note. It is the only option that teaches with
    // no interaction, which the phone forces: a 7px pot dot yields a ~19x26px
    // hit box, far under the feature-014 44pt coarse floor, so a per-glyph
    // tooltip could never be the touch story. The samples ARE the row glyph
    // elements (same classes, same face()), so the lesson cannot drift from
    // the strip. Ordered AFTER footUse so `.ob-pb-foot span` still resolves
    // to the storage note (arm 0's probe), and 3b relayouts it onto its own
    // line under 750 CSS px (playback.css).
    // `legend.pot` is deliberately QUALIFIED ("Potted / off table", review
    // round 2): the ball-colour dot marks a ball that left the table, and
    // BallOffTable also parks a ball as Pocketed, so a bare "Pot" would teach
    // sighted readers a pot the rules never recorded — and carom has no
    // pockets at all. It costs width: es/fr take a SECOND legend line below
    // ~1000 CSS px, which is the wrap-never-ellipsize law working (gated).
    const legend = document.createElement('span');
    legend.className = 'ob-pb-legend';
    for (const [cls, key, name, text, size] of [
      ['ob-pb-pot', 'playback.legend.pot', null, '', 0],
      ['ob-pb-foul', 'playback.legend.foul', 'foul', '✕', 12],
      ['ob-pb-star', 'playback.legend.win', 'sparkle', '✦', 13],
    ]) {
      const item = document.createElement('span');
      item.className = 'ob-pb-lg';
      const g = document.createElement('span');
      g.className = cls;
      g.setAttribute('aria-hidden', 'true'); // the label beside it IS the name
      if (name) {
        const reface = () => face(g, name, text, size);
        lateFaces.push(reface);
        reface();
      }
      const lab = document.createElement('span');
      lab.dataset.i18n = key;
      item.append(g, lab);
      legend.appendChild(item);
    }
    foot.append(footUse, legend, clear);
    panel.append(head, listEl, foot);
    document.body.appendChild(panel);
    applyDom(panel);
  }

  /** GH-668 B-K24 (ruling R15): the DVR list is titled by its LAUNCHER. The
   * place that opens it passes the place noun as an i18n key (slice 6 /
   * B-RP04: `open({ title: 'shell.place.replays' })`); the toolbar pill and
   * every bare `open()` keep 'playback.title'. The key rides `data-i18n`
   * so a locale change re-titles it like every other string. */
  function setListTitle(key) {
    const h = panel?.querySelector('.ob-pb-head h2');
    if (!h) return;
    const k = typeof key === 'string' && key && has(key) ? key : 'playback.title';
    h.dataset.i18n = k;
    h.textContent = t(k);
  }
  // GH-668 S5 replays r8 (review r5 P3): the strips' keyboard hint
  // (`playback.help.filterKeys`, a G4 key) is judged on the ACTIVE
  // dictionary. A returning no-sw client pairs this playback.js with a
  // cached pre-G4 dictionary, and t()'s last fallback is the literal key —
  // so the title is gated on the ADDITIVE hasLocal() (namespace-reached,
  // feature-detected; an i18n.js without it degrades to has()): absent →
  // no title; present → the title. The hint carries NO data-i18n-title: a
  // locale listener registered before this one runs applyDom over the
  // panel and would repaint the attribute through t() under the stale
  // dictionary (measured: one missing-key warn per switch), so the judge
  // OWNS the title and re-judges it on every locale change for every strip
  // still in the document (OWNERSHIP stale-dictionary law; e2e-playback arm
  // 25, the help-key leg).
  const HELP_KEYS = 'playback.help.filterKeys';
  const helpTitled = new Set();
  const hasHelpKey = () => (typeof i18nNs.hasLocal === 'function'
    ? i18nNs.hasLocal(HELP_KEYS) : has(HELP_KEYS));
  function judgeHelpTitle(el) {
    if (hasHelpKey()) el.title = t(HELP_KEYS);
    else el.removeAttribute('title');
  }
  /** Give `el` the strips' keyboard hint under the stale-dictionary law. */
  function helpTitle(el) { helpTitled.add(el); judgeHelpTitle(el); }
  // GH-668 S5 replays r9 (review r6 P2): the Set is STRONG — a closed player's
  // speed strip left in it pinned the whole detached #ob-pb-player subtree
  // (listeners included) until the next locale change, one per replay visit.
  // Belt: the owner releases its strip when it closes (closePlayer →
  // releaseHelpTitle(P.speed)); braces: the re-judge below enumerates
  // CONNECTED strips only and drops the rest. Arm X3 R-HELP-REGISTRY reads
  // the registry through the `__playback.helpTitles()` diagnostics seam.
  function releaseHelpTitle(el) { if (el) helpTitled.delete(el); }
  function helpTitleCensus() {
    let connected = 0, detached = 0;
    for (const el of helpTitled) {
      if (el.isConnected) connected += 1;
      else if (el.closest?.('#ob-pb-player')) detached += 1;
    }
    return { size: helpTitled.size, connected, detached };
  }
  onLocaleChange(() => {
    for (const el of helpTitled) {
      if (el.isConnected) judgeHelpTitle(el); else helpTitled.delete(el);
    }
  });
  /** r12 (review r7 P2-1): the hall's open truth at a list-open boundary —
   * the shell's published seam (`window.__shell.isOpen()`, `open` itself),
   * else its root-class twin (`html.ob-shell-open` / `body.ob-shell-open`,
   * flipped in the same synchronous turn as `open` on both entry and exit;
   * an older shell.js without the seam — the cache-poison contract's stale
   * rung). Never throws. */
  function hallOpen() {
    try {
      const s = window.__shell;
      if (s && typeof s.isOpen === 'function') return s.isOpen() === true;
    } catch { /* seam absent or throwing: fall through to the class twin */ }
    return document.documentElement.classList.contains('ob-shell-open')
      || document.body.classList.contains('ob-shell-open');
  }
  /** r12b (the round-12 checker P3): the hall's ENTRY latched across a
   * list-open wait. `hallOpen()` before / after the await is a boundary-
   * STATE comparison — a hall entered AND left during the held import read
   * closed on both sides, and the stale toolbar tap listed at the table
   * after the release (measured on b372a7d2, seam leave and a REAL
   * quick-play click alike: gates/r12b/measure/measure-b372a7d2.log).
   * shell.js publishes no entry event or subscription seam (its one window
   * event, `ob:shell-bands`, is band geometry), so the latch rides the
   * root-class twin: a MutationObserver on the `class` attribute of BOTH
   * roots (`attributeOldValue` — every state the records passed through is
   * judged, so an open-and-close inside one turn still counts) records any
   * absent → present flip of `ob-shell-open` while armed. `stop()` drains
   * the pending records (`takeRecords`) and disconnects; it is called in
   * the caller's `finally`. Never throws: without a MutationObserver the
   * watch is inert and the state comparison below stays the law. Arm F1j
   * (the open-and-close leg). */
  function watchHallEntry() {
    const CLS = 'ob-shell-open';
    const roots = [document.documentElement, document.body];
    const has = (s) => typeof s === 'string' && s.split(/\s+/).includes(CLS);
    const prev = new Map(roots.map((r) => [r, r.classList.contains(CLS)]));
    let entered = false, mo = null;
    const absorb = (records) => {
      for (const rec of records) {
        if (!prev.has(rec.target)) continue;
        const before = has(rec.oldValue); // the state BEFORE this record
        if (!prev.get(rec.target) && before) entered = true;
        prev.set(rec.target, before);
      }
      for (const r of roots) {
        const now = r.classList.contains(CLS);
        if (!prev.get(r) && now) entered = true;
        prev.set(r, now);
      }
    };
    try {
      mo = new MutationObserver(absorb);
      for (const r of roots) mo.observe(r, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    } catch { mo = null; }
    return {
      /** Drain + disconnect; true iff the hall was ENTERED while armed. */
      stop() {
        if (mo) { try { absorb(mo.takeRecords()); mo.disconnect(); } catch { /* inert */ } mo = null; }
        return entered;
      },
    };
  }
  async function openList(opts) {
    if (listOpen) return;
    if (!panel) {
      // r4 C1b: the panel's filter form reads the kit dialog's capability —
      // an import still in flight is awaited (bounded: a stalled leaf builds
      // the legacy form, the kit-less scrim path below stays as it was).
      // r5 (checker P3): the wait is open-generation guarded — close()
      // bumps openGen, so a dismissal while the import is pending is never
      // followed by the list opening after the fact (arm F1i, dismiss leg).
      // r8 (review r5 P2): Escape is armed BEFORE the await — the base's
      // synchronous fallback register — and disarmed when the wait settles
      // (the kit trap / escList take over below; arm F1i, Escape leg)
      // r12 (review r7 P2-1): the wait is judged against the HALL as well.
      // The list's pending window publishes no `opening()` (the shell's
      // entry gate — shell.js, not this lane's to change — admits the hall
      // meanwhile), so a hall entered while the import is in flight WINS:
      // the boundary reads the shell's open truth before and after the
      // await and stands down when the hall opened meanwhile — no list, no
      // backdrop, nothing staged, focus untouched; the same discipline as
      // openPlayerInner's cancelled(). `openGen` IS the list generation
      // (bumped by close(), dismissList, the panel's onClose and the
      // pending Escape). Arm F1j.
      // r12b (the round-12 checker P3): the boundary-STATE comparison alone
      // missed a hall entered AND left during the wait (closed on both
      // sides → the stale tap listed at the table after the release), so
      // the hall's ENTRY is latched across the wait (watchHallEntry, the
      // root-class twin observed) and the judgement is: the generation
      // moved OR the hall was entered meanwhile OR the hall is open now.
      // Arm F1j, the open-and-close leg.
      const gen = openGen;
      const hall0 = hallOpen();
      const hallWatch = watchHallEntry();
      const disarm = armPendingEsc();
      let hallEntered = false;
      try { await settleDialog(); } finally { disarm(); hallEntered = hallWatch.stop(); }
      if (gen !== openGen) return; // dismissed (Escape / close()) or superseded during the wait
      if (hallEntered) return; // the hall was ENTERED during the wait — even if left again, the stale tap never lists (r12b)
      if (!hall0 && hallOpen()) return; // the hall opened during the wait — its entry wins (r12; the state law, restated: the fallback where no MutationObserver armed)
      if (listOpen) return; // a second open landed during the wait
      if (!panel) buildPanel();
    }
    setListTitle(opts?.title);
    listOpen = true;
    panel.style.pointerEvents = ''; // re-arm after the exit-fade inerting below
    // GH-717: remember the element that opened the list (the DVR pill, the
    // hall's table successor) — a reopen from a closing player finds focus
    // on <body>, so dialog.js's captured prevFocus is unusable and its
    // Escape falls back to `restoreTo` (leg D: list → row → player → Back
    // to recordings → Escape lands on the pill, never <body>)
    const opener = document.activeElement;
    if (focusUsable(opener) && !panel.contains(opener)
      && !(player && player.contains(opener))) listInvoker = opener;
    if (dialog?.openPanel) {
      dialog.openPanel(panel, {
        backdrop: true, display: 'flex',
        // r10 (round-9 checker P2): a DISMISSED launcher cancels the launch
        // it started. The kit trap claims Escape FIRST (ui/dialog.js:
        // stopImmediatePropagation → requestClose → this callback), so the
        // pending-open handler registered later in the capture list never
        // sees the press — the bump here IS that press's (and a backdrop
        // click's) cancellation, exactly like close(); openPlayer's
        // readiness wait judges the token and unwinds instead of building
        // the player over the closed list (arm F1i, the list-path Escape leg)
        onClose: () => { listOpen = false; openGen++; if (opening) cancelArchiveHold(staging); },
        restoreTo: listReturnTarget,
      });
      const bd = panel.previousElementSibling;
      if (bd?.classList.contains('ob-backdrop')) bd.classList.add('ob-backdrop--top');
    } else {
      // kit-less degrade: module scrim + Escape (record-quality register)
      scrim = document.createElement('div');
      scrim.className = 'ob-pb-scrim';
      scrim.addEventListener('click', () => dismissList());
      document.body.insertBefore(scrim, panel);
      panel.style.display = 'flex';
      document.addEventListener('keydown', escList, true);
    }
    await renderList();
  }

  function escList(e) {
    if (e.key === 'Escape') closeList();
  }

  /** r10 (round-9 checker P2): a user dismissal of the list through its own
   * chrome (the ✕, the kit-less scrim) cancels any open it launched — the
   * same `openGen` bump as close() and the pending-open Escape (the kit's
   * Escape / backdrop dismissals bump through the panel's onClose above). */
  function dismissList() { openGen++; closeList(); }

  function closeList() {
    if (!listOpen || !panel) return;
    listOpen = false;
    // CLASS B4: a list dismissal during an async open cancels it — the DVR
    // player must not pop up seconds after the user left — and supersedes
    // its hold so no wasted apply lands. Programmatic closes while opening
    // are harmless: no gen check runs after the open's own closeList,
    // resume captures its gen later, and the close seam already bumps.
    if (opening) { openGen++; cancelArchiveHold(staging); }
    // inert during the ~120ms kit exit fade: the fading panel (z:70, over
    // the player's z:55 chrome) must never eat the first tap on the player
    // that replaces it (QA wave: back-pill taps right after a multi-shot
    // session's player opened were silently swallowed)
    panel.style.pointerEvents = 'none';
    if (dialog?.closePanel) dialog.closePanel(panel);
    else panel.style.display = 'none';
    scrim?.remove();
    scrim = null;
    document.removeEventListener('keydown', escList, true);
  }

  // ---- list rendering ---------------------------------------------------------
  function dayLabel(ts) {
    const d = new Date(ts), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return t('playback.today');
    if (diff === 1) return t('playback.yesterday');
    return d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
  }

  /** Ball hex for a pot marker glyph (module-painted game content — the
   * playback.css header note). Stale ballset.js → neutral grey dots. */
  function potColor(gid, ballId) {
    if (!colors) return ['#888888', false]; // ob-color-exempt: ball paint
    if (gid === 'snooker') {
      return [colors.SNOOKER_BALL_COLORS?.[ballId] ?? '#b81220', false]; // ob-color-exempt: ball paint
    }
    if (gid === 'carom_3cushion') {
      // GH-383 review r5 (P3): the marker dot follows the PAINTED variant
      // — under the marked-white fork ball 1 is white, not yellow (stale
      // ballset.js lacks the marked table → yellow-era degrade)
      const palette = (game.caromSecondBallPainted === 'marked'
        && colors.CAROM_BALL_COLORS_MARKED)
        ? colors.CAROM_BALL_COLORS_MARKED : colors.CAROM_BALL_COLORS;
      return [palette?.[ballId] ?? '#888888', false]; // ob-color-exempt: ball paint
    }
    const e = colors.BALL_COLORS?.[ballId];
    return e ? [e[0], e[1] === true] : ['#888888', false]; // ob-color-exempt: ball paint
  }

  /** The REAL ball name behind a pot marker's accessible label (GH-242 3c):
   * the numeral for pool ids, the localized colour for a snooker set (the
   * `snooker.ball.*` keys already ship ×7; a WPBSA red carries no numeral so
   * it reads "red"), the raw index otherwise. Never a hex — this is the
   * screen-reader voice, not paint. */
  function ballLabel(gid, id) {
    if (gid === 'snooker') {
      if (has(`snooker.ball.${id}`)) return t(`snooker.ball.${id}`);
      return has('snooker.ball.red') ? t('snooker.ball.red') : String(id);
    }
    // carom sets carry NO numerals (ballset.js: 1 = Aramith yellow, 2 = red),
    // so the internal id would name nothing a reader can see (review round 2)
    if (gid === 'carom_3cushion' && has(`playback.ball.carom.${id}`)) {
      // GH-383 visual fork: under the 'marked' second-ball paint, ball 1
      // is the dot-marked white, not the yellow — the name follows the
      // PAINTED variant (review r5: a mid-rack settings flip defers the
      // repaint; game.caromSecondBallPainted is the table truth, the
      // settings seam is the stale-game fallback — rule 5)
      if (id === 1
        && (game.caromSecondBallPainted
          ?? window.__settings?.get?.()?.caromSecondBall) === 'marked'
        && has('carom.ballName.marked')) {
        return t('carom.ballName.marked');
      }
      return t(`playback.ball.carom.${id}`);
    }
    return String(id);
  }

  /** Accessible name for one pot marker (GH-242 3c; review round 1 P2). The
   * marker's `pots` list rides `outcome.pocketed`, i.e. the kernel's
   * `Pocketed` MOTION state — which `BallOffTable` ALSO sets (event_loop.rs
   * parks a jumped ball as Pocketed so it stops taking part), so the dot
   * alone cannot say whether the ball was SUNK or driven OFF. The rules
   * ledger separates them: `judgment.pocketed`, which archive.js copies onto
   * the marker, carries only balls a BallPocket event actually sank (striker
   * excluded). No judgment array at all = playground, where the archive
   * suppresses adjudication by design — with no rules there is no "pot" to
   * claim, so the name covers both readings instead of guessing. */
  function potName(gid, m, id) {
    const ball = ballLabel(gid, id);
    const potted = Array.isArray(m.pocketed) && m.pocketed.includes(id);
    return t(potted ? 'playback.mark.pot' : 'playback.mark.gone', { ball });
  }

  // marker glyph -> its own name FUNCTION, so a live locale switch can
  // re-apply it (review round 3). renderList() rebuilds the list on every
  // locale change, but the player track's markers are built ONCE per open:
  // without this their aria-labels stayed stranded in the boot locale beside
  // freshly re-localized player chrome. WeakMap, not a DOM expando — the
  // nodes are discarded wholesale when the player closes.
  const markerNames = new WeakMap();
  /** Name `el` as a marker image and remember how to re-name it. */
  function nameMarker(el, name) {
    markerNames.set(el, name);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', name());
    return el;
  }
  /** Re-apply every registered marker name below `root` (locale switch). */
  function relabelMarkers(root) {
    if (!root) return;
    for (const el of root.querySelectorAll('[role="img"]')) {
      const name = markerNames.get(el);
      if (name) el.setAttribute('aria-label', name());
    }
  }

  function potDot(gid, m, ballId) {
    const dot = document.createElement('span');
    dot.className = 'ob-pb-pot';
    // GH-242 3c: the strip used to be MUTE to assistive tech (bare spans for
    // the pots and the foul, aria-hidden on the sparkle). Every marker is now
    // a role=img named off the archive record's OWN ball id — "Potted 9",
    // never silence and never a colour guess.
    nameMarker(dot, () => potName(gid, m, ballId));
    const [hex, stripe] = potColor(gid, ballId);
    if (stripe) {
      dot.style.backgroundImage = 'linear-gradient(to bottom, '
        + `#f3eedd 0 20%, ${hex} 20% 80%, #f3eedd 80%)`; // ob-color-exempt: stripe-ball ivory (game content)
    } else {
      dot.style.background = hex;
    }
    if (hex === '#191919') dot.classList.add('ob-pb-pot--dark'); // ob-color-exempt: 8-ball black probe
    return dot;
  }

  /** The ivory sparkle. `kind` names WHICH terminal it marks (GH-242 3c): one
   * glyph carries both a game WIN and a drill COMPLETION, and the old
   * aria-hidden span left them indistinguishable to a screen reader. */
  const sparkle = (kind = 'win') => {
    const s = document.createElement('span');
    s.className = 'ob-pb-star';
    nameMarker(s, () => t(`playback.mark.${kind}`));
    face(s, 'sparkle', '✦', 13);
    return s;
  };

  // GH-668 B-K08 (R15): the row's face names the GAME, never the mode — a
  // ball-number disc in the money ball's own paint (9 / 10 / 8; heyball is
  // an 8-ball family, one_pocket / straight_pool / snooker / carom carry no
  // money ball and wear a 12 px caps discipline chip = the kit badge voice).
  // Pure DOM + inline ball paint: no icons.js dependency, so the icons-less
  // degrade renders the SAME face (the old '?' fallback is retired with the
  // rack / target / move mode glyphs). Mode stays in the title's words.
  const FACE_BALL = { nine_ball: 9, ten_ball: 10, eight_ball: 8, heyball: 8 };
  function gameFace(el, gid) {
    el.replaceChildren();
    el.classList.remove('ob-pb-face--disc', 'ob-pb-face--chip', 'ob-pb-face--dark',
      'ob-badge');
    el.style.background = '';
    el.style.backgroundImage = '';
    const ball = FACE_BALL[gid];
    if (!ball && gid && has(`playback.face.${gid}`)) {
      el.classList.add('ob-pb-face--chip', 'ob-badge');
      el.textContent = t(`playback.face.${gid}`);
      return el;
    }
    el.classList.add('ob-pb-face--disc');
    if (!ball) return el; // unknown game: a blank neutral disc, never a glyph
    const [hex, stripe] = potColor(gid, ball);
    if (stripe) {
      el.style.backgroundImage = 'linear-gradient(to bottom, '
        + `#f3eedd 0 22%, ${hex} 22% 78%, #f3eedd 78%)`; // ob-color-exempt: stripe-ball ivory (game content)
    } else {
      el.style.background = hex;
    }
    if (hex === '#191919') el.classList.add('ob-pb-face--dark'); // ob-color-exempt: 8-ball black probe
    const n = document.createElement('span');
    n.className = 'ob-pb-face__n ob-nums';
    n.textContent = String(ball);
    el.appendChild(n);
    return el;
  }

  /** Marker glyphs for one shot marker (list strip + player track share it):
   * pots as ball-color dots, foul as the danger CROSS (GH-242 — the old
   * 2.5x11 bar read as a divider, so a pot-plus-scratch row looked like
   * "pot, then a gap"), terminal as a sparkle. */
  function markerGlyphs(gid, m) {
    const out = [];
    // The SCRATCH claim comes from the ruleset's OWN cited foul id, never from
    // `pots.includes(0)` (review round 1 P2): a striker in `pots` may have been
    // driven off the table rather than pocketed, and carom has no scratch
    // concept at all — carom3c pushes only `ball-off-table`. Foul entries
    // arrive as bare strings (nine-ball legacy ledger rows) or {code, cite}
    // objects (registry rulesets); this is flow.js's normalization.
    const foulIds = (Array.isArray(m.fouls) ? m.fouls : [])
      .map((f) => (typeof f === 'string' ? f : f?.code)).filter(Boolean);
    const scratched = foulIds.includes('scratch');
    for (const id of m.pots ?? []) {
      // a scratched cue reads as the foul cross — EXCEPT in carom
      // (GH-383 review r6): the pocketless table has no scratch, and under
      // the two-cue variant ball 0 is the second seat's OBJECT ball — a
      // driven-off white deserves its own marker dot
      if (id === 0 && gid !== 'carom_3cushion') continue;
      out.push(potDot(gid, m, id));
    }
    if (m.legal === false || (Array.isArray(m.fouls) && m.fouls.length)) {
      const f = document.createElement('span');
      f.className = 'ob-pb-foul';
      // the SCRATCH is folded into this ONE mark (no white cue dot is ever
      // drawn), so the accessible name is the only surface that can say so
      nameMarker(f,
        () => t(scratched ? 'playback.mark.scratch' : 'playback.mark.foul'));
      face(f, 'foul', '✕', 12);
      out.push(f);
    }
    if (m.terminal) out.push(sparkle());
    return out;
  }

  /** Session duration + shot-count line for the list row AND the player
   * chip. Singular form at shots=1 (GH-328: "1 min · 1 shots" — the
   * playback.usageOne law); has() guards a stale locale dict. */
  function rowMetaText(meta) {
    const shots = meta.shots ?? 0;
    return t(shots === 1 && has('playback.rowMetaOne')
      ? 'playback.rowMetaOne' : 'playback.rowMeta', {
      min: Math.max(1, Math.round(((meta.endTs ?? 0) - (meta.startTs ?? 0)) / 60000)),
      shots,
    });
  }

  /** The row's clock cell ("14:32" — GH-668 B-K07: a sort key, not identity). */
  function rowClockText(meta) {
    return new Date(meta.startTs ?? Date.now())
      .toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  }
  /** The row's WHOLE when-line text ("14:32 · 12 min · 9 shots") — the
   * replays card's line 2 reads it through `sessionSummary().when` (GH-668
   * S5 B-RP01: the card = the newest row, one voice; 035 contract §7 entry
   * 36), so the card and the row can never drift. */
  const rowWhenText = (meta) => `${rowClockText(meta)} · ${rowMetaText(meta)}`;

  function rowTitle(meta) {
    const title = document.createElement('div');
    title.className = 'ob-pb-title';
    const b = document.createElement('span');
    const sub = document.createElement('span');
    sub.className = 'ob-pb-sub';
    const mode = modeOf(meta);
    if (meta.drill) {
      b.textContent = nameOfDrill(meta.drill.id);
      sub.textContent = ' · ' + t('playback.sub.practice', { game: nameOfGame(meta.gameId) });
    } else if (mode === 'playground') {
      b.textContent = t('settings.mode.playground');
      sub.textContent = ' · ' + t('playback.sub.playground');
    } else if (mode === 'practice') {
      b.textContent = nameOfGame(meta.gameId);
      sub.textContent = ' · ' + t('settings.mode.practice');
    } else {
      b.textContent = nameOfGame(meta.gameId);
      sub.textContent = ' · ' + t('playback.sub.match');
    }
    title.append(b, sub);
    if (meta.drill && Number.isFinite(meta.drill.score) && Number.isFinite(meta.drill.max)) {
      const sc = document.createElement('span');
      sc.className = 'ob-pb-score ob-nums';
      sc.textContent = ` ${meta.drill.score} / ${meta.drill.max}`;
      title.appendChild(sc);
    }
    if (kernelMismatch(meta.kernelVersion)) {
      const badge = document.createElement('span');
      // GH-668 B-K16: the kit badge in its warn voice (the third badge
      // recipe is gone); .ob-pb-badge keeps the row's placement only
      badge.className = 'ob-badge ob-badge--warn ob-pb-badge';
      badge.dataset.i18n = 'playback.oldKernel';
      badge.dataset.i18nTitle = 'playback.oldKernelTitle';
      title.appendChild(badge);
    }
    return title;
  }

  /** Paint one row's marker strip from the session detail (list strip; the
   * eager AND the lazy 'meta' host path share it — one glyph vocabulary). */
  function paintMarks(marks, meta, detail) {
    marks.replaceChildren();
    const shotMarkers = (detail?.markers ?? []).filter((x) => x.kind === 'shot');
    for (const sm of shotMarkers) {
      for (const g of markerGlyphs(meta.gameId, sm)) {
        if (marks.children.length >= 24) break; // strip stays one line
        marks.appendChild(g);
      }
    }
    if ((detail?.markers ?? []).some((x) => x.kind === 'drill' && x.ev === 'complete')
      && marks.children.length < 24) {
      marks.appendChild(sparkle('drill'));
    }
  }
  // 035a `markers: 'meta'` hosts: a row paints from the index meta alone and
  // fills its strip on first focus / hover or when it scrolls into the host
  // (IntersectionObserver rooted at the host — contract §6: the detail read
  // count never exceeds the visible band; no IO support = fill at once).
  const lazyFill = new WeakMap(); // row → fill()
  function lazyObserver(rec) {
    if (typeof IntersectionObserver !== 'function') return null;
    if (!rec.io) {
      rec.io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) lazyFill.get(e.target)?.();
      }, { root: rec.el, threshold: 0.01 });
    }
    return rec.io;
  }
  function armLazyMarks(row, marks, meta, rec) {
    let done = false;
    const fill = async () => {
      if (done) return;
      done = true;
      rec.io?.unobserve(row);
      let detail = null;
      try { detail = await arch()?.session?.(meta.id); } catch { detail = null; }
      if (!row.isConnected) return;
      paintMarks(marks, meta, detail);
    };
    lazyFill.set(row, fill);
    row.addEventListener('focus', fill, { once: true });
    row.addEventListener('pointerenter', fill, { once: true });
    const io = lazyObserver(rec);
    if (io) io.observe(row);
    else queueMicrotask(fill);
  }

  /** One session row. `rec` = the list-host record (035a): `controls:
   * false` omits the per-row delete; `onOpen` replaces openPlayer for this
   * host's rows; `markers: 'meta'` defers the strip. The modal passes its
   * own record (controls on, eager markers, openPlayer) — byte-equivalent
   * to the pre-035 row. */
  function sessionRow(meta, detail, rec = MODAL_REC) {
    const row = document.createElement('div');
    row.className = 'ob-pb-row';
    row.dataset.sid = String(meta.id);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    const mode = document.createElement('span');
    // `.ob-pb-face` names the face; the legacy `.ob-pb-mode` rides along
    // as the FOLD HOOK only (GH-668 review r2 P2, OWNERSHIP mixed-cache
    // rule): a cached replays.js scans `.ob-pb-mode` for its fold atoms —
    // without the old name a fold could land through the disc / chip. The
    // export-mode pill pair used to share that class (width 100 %, coarse
    // 44 sweep — the well silhouette was partly that collision); its rules
    // are now scoped under `.ob-pb-moderow`, so the name carries no paint
    // here. Fresh replays.js recognises both names (its scanAtoms).
    mode.className = 'ob-pb-face ob-pb-mode';
    mode.setAttribute('aria-hidden', 'true');
    // GH-668 B-K08 / R15: the face names the GAME (disc / chip, gameFace);
    // the GH-242 '?' degrade is retired with the mode glyphs — this face
    // never depends on icons.js, so it renders identically without it.
    gameFace(mode, meta.gameId);
    const what = document.createElement('span');
    what.className = 'ob-pb-what';
    what.appendChild(rowTitle(meta));
    const marks = document.createElement('div');
    marks.className = 'ob-pb-marks';
    if (rec.markers === 'meta' && !detail) armLazyMarks(row, marks, meta, rec);
    else paintMarks(marks, meta, detail);
    what.appendChild(marks);
    // GH-668 B-K07: the clock is a sort key, not identity — ONE 12 px line
    // under the title ("14:32 · 12 min · 9 shots") inside the body, so the
    // title keeps the row's measure and the rail carries no trailing column.
    const when = document.createElement('div');
    when.className = 'ob-pb-when';
    const tl = document.createElement('span');
    tl.className = 'ob-pb-t ob-nums';
    tl.textContent = rowClockText(meta);
    const ml = document.createElement('span');
    ml.className = 'ob-pb-m ob-nums';
    ml.textContent = rowMetaText(meta);
    when.append(tl, ' \u00b7 ', ml);
    what.appendChild(when);
    let del = null;
    if (rec.controls !== false) {
      del = document.createElement('button');
      del.type = 'button';
      // GH-245: kit ghost icon circle; .ob-pb-del keeps the quiet-to-danger
      // ink walk
      del.className = 'ob-btn ob-btn--ghost ob-btn--icon ob-pb-del';
      del.dataset.i18nTitle = 'playback.delete';
      del.setAttribute('aria-label', t('playback.delete'));
      // B-K08: a destructive verb wears its own glyph (icons.js `trash`),
      // never the dismiss cross — the phone DVR row showed three ✕ at one
      // weight (foul, delete, close); text fallback = the erase key, not ✕
      face(del, 'trash', '⌫', 16);
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!(await confirmKit('confirmDelete'))) return;
        await arch()?.deleteSession?.(meta.id);
        renderList('mutation');
      });
    }
    // R15: the chevron is DVR-only — on the rail the row IS the button, and
    // the 14 px column only floated the gap it cost (B-K07)
    let chev = null;
    if (rec.variant !== 'rail') {
      chev = document.createElement('span');
      chev.className = 'ob-pb-chev';
      chev.setAttribute('aria-hidden', 'true');
      face(chev, 'chevron-right', '›', 14);
    }
    // grid tracks derive from what the row CARRIES (playback.css
    // `:has(> .ob-pb-del)` / `:has(> .ob-pb-chev)`): controls:false drops the
    // delete column, the rail drops the chevron — and the class-set stays
    // ONE `.ob-pb-row` across hosts (035 contract §4 law 3, e2e-replays 2)
    row.append(mode, what, ...(del ? [del] : []), ...(chev ? [chev] : []));
    // the host record owns the activation: the modal opens the player
    // directly; a 035a rail host supplies its launcher (exit-then-open)
    const activate = () => (rec.onOpen ? rec.onOpen(meta.id) : openPlayer(meta, detail));
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
      // ROW-only: Enter/Space bubbling up from the focused per-row delete
      // BUTTON must keep its native activation (WAI-ARIA button idiom —
      // QA wave: the old unguarded preventDefault cancelled the delete
      // confirm and opened the player instead)
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    return row;
  }

  // the modal's own host record (the DEFAULT host; `el` resolves at render
  // time because buildPanel creates listEl lazily)
  const MODAL_REC = { modal: true, controls: true, markers: 'eager', onOpen: null,
    onChange: null, limit: null, variant: null, count: 0, io: null, gen: 0,
    get el() { return listEl; } };
  /** Render ONE host: the host's cap slices the filtered metas BEFORE the
   * detail sweep (035a `limit`; a function is re-read every render), 'meta'
   * hosts skip the sweep entirely (lazy strips). */
  async function renderHost(rec, a, shownAll, gen = rec.gen) {
    const host = rec.el;
    // `gen` = the host's mount generation as the caller read it BEFORE its
    // archive await; unmountList() bumps it, so a render still in flight
    // when the host is unmounted never repopulates the cleared host or
    // re-arms its observer (review r1 PR #655 P2)
    if (!host || gen !== rec.gen) return;
    const cap = typeof rec.limit === 'function' ? rec.limit() : rec.limit;
    const shown = Number.isFinite(cap) && cap >= 0 ? shownAll.slice(0, cap) : shownAll;
    // per-row marker strips need the session detail (markers) — fetched in
    // one parallel sweep; each is a single small IDB read
    const details = rec.markers === 'meta' ? shown.map(() => null)
      : await Promise.all(shown.map((m) => a.session(m.id).catch(() => null)));
    if (gen !== rec.gen) return; // unmounted during the detail sweep
    // the previous pass's lazy targets — rows that never intersected (a
    // hidden band, rows below the fold) — would stay registered with the
    // persistent observer, retaining their nodes and closures across every
    // filter / locale / modal render (review r1 PR #655 P2): disconnect it
    // here; lazyObserver() recreates it for the rows painted below
    if (rec.io) { rec.io.disconnect(); rec.io = null; }
    host.replaceChildren();
    if (rec.head) rec.head.replaceChildren();
    if (!shown.length && rec.modal) {
      const empty = document.createElement('div');
      empty.className = 'ob-pb-empty';
      empty.dataset.i18n = 'playback.empty';
      host.appendChild(empty);
    }
    let lastDay = null;
    shown.forEach((meta, i) => {
      const label = dayLabel(meta.startTs ?? Date.now());
      if (label !== lastDay) {
        const first = lastDay === null;
        lastDay = label;
        const day = document.createElement('div');
        day.className = 'ob-pb-day';
        day.textContent = label;
        // GH-668 S5 replays r3 (review visual audit r1 F3, integrator ruling
        // (b)): a host with a HEAD slot (mountList `head`, ADDITIVE) takes
        // its FIRST day label there — the group label ABOVE the scrollport
        // (the B-RP04 caps-role precedent) — so the scroll content starts
        // on a row and the band's end residual can be flush (contract §7
        // row 44); later labels stay in the flow. Same renderer, same node,
        // one voice (`--head` = the rail inset only, ui/playback.css).
        if (first && rec.head) { day.classList.add('ob-pb-day--head'); rec.head.appendChild(day); rec.headFirst = label; }
        else host.appendChild(day);
      }
      const row = sessionRow(meta, details[i], rec);
      // GH-668 S5 B-RP03 (RP:R-16): the replays place's band marks its
      // NEWEST row — index 0 of the rendered, filter-applied list — with
      // `aria-current="true"` (the G9 register, ui/playback.css); re-set on
      // every render (a fresh row set each pass), rail hosts only: the DVR
      // modal lists sessions without a "current" one
      if (i === 0 && rec.variant === 'rail') row.setAttribute('aria-current', 'true');
      host.appendChild(row);
    });
    rec.count = shown.length;
    applyDom(host);
    trackHead(rec);
  }
  /** GH-668 S5 replays r4 (review visual audit r2 F5, integrator ruling;
   * contract §7 row 48): a host's HEAD slot names the group at the TOP of
   * its scroll window — not the first group for ever. The r3 form hoisted
   * the first day label and left it there, so at the band's END stop the
   * slot still read 'Today' over the older rows whose in-flow label had
   * scrolled away (an information error). Judged on every scroll of the
   * host (rAF-coalesced; the settle's own scroll included), on its resize
   * (the coarse register re-budgets the band) and after every render: the
   * first in-flow child — label or row — whose bottom is below the clip
   * top decides, and ITS group's label is written into the slot's node
   * (the renderer's own day node: one voice, one owner). An in-flow label
   * that would sit at the very top under an identical head is hidden by
   * VISIBILITY only (`.ob-pb-day--twin`, ui/playback.css) — its box, the
   * fold atoms and the stop lattice are unchanged — so no two identical
   * labels are ever visible; every other in-flow label stays in the flow.
   * The slot's height never moves with its text (same node, one line). A
   * host without a head slot (an old replays.js) never reaches here. */
  const TWIN = 'ob-pb-day--twin';
  function trackHead(rec) {
    const head = rec.head, host = rec.el;
    const node = head?.firstElementChild;
    if (!node || !host.isConnected) return;
    const clipTop = host.getBoundingClientRect().top + host.clientTop;
    let group = rec.headFirst ?? node.textContent; // the first group (before any in-flow label)
    let top = null; // { label, el (its in-flow label or null), day (the label itself is the top) }
    for (const ch of host.children) {
      const isDay = ch.classList.contains('ob-pb-day');
      if (isDay) { group = ch.textContent; ch.classList.remove(TWIN); }
      if (top) continue; // past the top: only the twin reset above remains
      const r = ch.getBoundingClientRect();
      if (r.height > 0 && r.bottom > clipTop + 0.5) top = { label: group, el: isDay ? ch : null };
    }
    if (!top) return; // nothing in the window (a render in flight)
    if (node.textContent !== top.label) node.textContent = top.label;
    if (top.el) top.el.classList.add(TWIN); // the in-flow twin at the very top
  }
  /** Arm the head tracking for one registration (scroll + resize of the
   * host, one rAF per burst); torn down with the record (unmountList). */
  function armHead(rec) {
    if (!rec.head || typeof AbortController !== 'function') return;
    const ac = new AbortController();
    rec.headAc = ac;
    let raf = 0;
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!ac.signal.aborted) trackHead(rec); }); };
    rec.el.addEventListener('scroll', queue, { passive: true, signal: ac.signal });
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(queue);
      ro.observe(rec.el);
      ac.signal.addEventListener('abort', () => ro.disconnect());
    }
  }
  /** Render the modal list (if built) AND every registered host from ONE
   * archive read; `reason` rides each host's onChange ('filter' |
   * 'mutation' | 'render'); `only` = a single host (a handle's render()). */
  async function renderList(reason = 'render', only = null, preread = null) {
    const hosts = only ? [only]
      : [...(listEl ? [MODAL_REC] : []), ...listHosts.values()];
    if (!hosts.length) return;
    const gens = hosts.map((rec) => rec.gen); // mount generations at issue
    const a = arch();
    // `preread` (a handle's render({ metas }) — 035 contract §3.2; GH-525
    // integrator, audit r3 finding 1): the caller's OWN archive index skips
    // this read, so a 'meta'-marker host's rows land SYNCHRONOUSLY inside
    // the render() call (renderHost has no await before its replaceChildren
    // on that path) — the replays arrival paints body + rows in one task
    const metas = Array.isArray(preread) ? preread : (a ? await a.sessions() : []);
    const shown = metas.filter((m) => filter === 'all' || modeOf(m) === filter);
    await Promise.all(hosts.map((rec, i) => renderHost(rec, a, shown, gens[i])));
    hosts.forEach((rec, i) => {
      if (rec.gen !== gens[i] || typeof rec.onChange !== 'function') return;
      try { rec.onChange({ filter, reason, count: rec.count }); } catch { /* consumer's */ }
    });
    if (only || !footUse) return;
    {
      const u = a ? await a.usage() : { sessions: 0, bytes: 0 };
      // singular form at n=1 (QA wave: "1 sessions"/"1 Sitzungen" read
      // wrong in en/de/es/fr); has() guards a stale locale dict
      footUse.textContent = t(u.sessions === 1 && has('playback.usageOne')
        ? 'playback.usageOne' : 'playback.usage', {
        used: (u.bytes / 1048576).toFixed(1), // MiB — matches the 50 MB cap
        cap: Math.round((u.caps?.maxBytes ?? 50 * 1048576) / 1048576),
        n: u.sessions,
      });
    }
  }

  /** 035a (contract §3.2 `sessionSummary`): ONE session's row vocabulary
   * as DATA — day / meta / title / mode / glyphs (ts-ordered; the caller
   * slices) / stale — composed from the SAME helpers the rows use, so the
   * replays place never re-implements the GH-242 glyphs or the GH-318
   * badge. `null` when the session is gone. Glyph entries carry the text
   * face + the accessible name + (pots) the dot paint as data. */
  async function sessionSummary(id) {
    let detail = null;
    try { detail = await arch()?.session?.(id); } catch { detail = null; }
    if (!detail) return null;
    const tt = rowTitle(detail);
    const title = tt.children[0]?.textContent ?? '';
    const mode = (tt.querySelector('.ob-pb-sub')?.textContent ?? '').replace(/^ · /, '');
    const glyphs = [];
    const asData = (g, kind) => ({
      glyph: kind === 'pot' ? '' : (kind === 'foul' ? '✕' : '✦'),
      kind,
      title: g.getAttribute('aria-label') ?? '',
      color: kind === 'pot' ? (g.style.background || '') : '',
      image: kind === 'pot' ? (g.style.backgroundImage || '') : '',
      dark: g.classList.contains('ob-pb-pot--dark'),
    });
    for (const sm of (detail.markers ?? []).filter((x) => x.kind === 'shot')) {
      for (const g of markerGlyphs(detail.gameId, sm)) {
        glyphs.push(asData(g, g.classList.contains('ob-pb-pot') ? 'pot'
          : g.classList.contains('ob-pb-foul') ? 'foul' : 'win'));
      }
    }
    if ((detail.markers ?? []).some((x) => x.kind === 'drill' && x.ev === 'complete')) {
      glyphs.push(asData(sparkle('drill'), 'drill'));
    }
    return {
      id: detail.id,
      day: dayLabel(detail.startTs ?? Date.now()),
      meta: rowMetaText(detail),
      // ADDITIVE (035 contract §7 entry 36, GH-668 S5 B-RP01): the row's
      // when-line as the card's line 2 — an old replays.js ignores it, a
      // fresh one under an old DVR (no `when`) keeps `meta` as its line 2
      when: rowWhenText(detail),
      title, mode, glyphs,
      stale: !!kernelMismatch(detail.kernelVersion),
      // ADDITIVE (GH-668 S5 vfix1, verifier P3; 035 contract §3.2): the
      // record this summary was read from, so a caller that also wants the
      // `marks` node hands it back instead of a second `archive.session(id)`
      // read per snapshot (one IDB read per session per snapshot). An old
      // replays.js ignores it; `marks(id)` still reads for a bare id.
      detail,
    };
  }
  /** 035a: forget a registered list host (rows removed). */
  function unmountList(host) {
    const rec = listHosts.get(host);
    if (!rec) return;
    rec.gen += 1; // cancels every render still in flight for this record
    rec.io?.disconnect();
    rec.io = null;
    rec.headAc?.abort(); // r4 F5: the head tracking listeners go with the record
    listHosts.delete(host);
    if (rec.variant) host.classList.remove(`ob-pb-list--${rec.variant}`);
    host.replaceChildren();
    rec.head?.replaceChildren();
  }

  // ---- timeline player: state safety (the offline-render restore model) ------
  let pb = null; // open-player state; null = player closed
  // GH-273 latch law, generalized by GH-301 (§1.3): the CAMERA PLAN is USER
  // STATE and survives a player close/reopen within the app session. Keyed
  // by session id, written on close as { plan, segs }, seeded on open only
  // while the segment count still matches (a session that grew shots
  // restarts clean). Bounded FIFO — the same guards, now latching the whole
  // cut list + tripod poses instead of the per-segment assignment array.
  const camLatch = new Map();
  const CAM_LATCH_MAX = 16;
  let pendingSince = null; // performance.now() at the pending open's FIRST line (openSession's or openPlayer's, whichever came first); null when nothing is pending — the read-only openingSince() seam (r11, harness bound)
  let opening = false; // openPlayer is async (archive reads await BEFORE pb
  // is set) — without this latch a double-click on a row (or two rows) runs
  // TWO interleaved opens: the second captures the FIRST's staged record as
  // its "pre-open" identity and the close restore loses the live shot
  let playGen = 0; // play-loop generation: a pause+play inside one frame
  // must retire the old rAF loop (two loops = double-speed playback)
  let openGen = 0; // open-generation token (dismissal during async opens)
  // Open and resume can overlap. Every hold retains its resolver until it
  // settles; a new hold explicitly supersedes the older ones. The table's
  // request id, not its alias, identifies preparation ownership.
  let archiveHoldSeq = 0;
  const archiveHolds = new Map(); // holdId -> { resolve, table, requestId, owner }
  let archiveEquipmentSeq = 0;
  function holdArchiveEquipment(owner) {
    owner.equipmentHold ??= `archive:${++archiveEquipmentSeq}`;
    window.__settings?.preview?.holdEquipment?.(owner.equipmentHold);
  }
  function releaseArchiveEquipment(owner) {
    window.__settings?.preview?.releaseEquipment?.(owner?.equipmentHold ?? null);
  }

  function archiveRequestId() {
    try {
      const id = window.__tableBuild?.status?.().request_id;
      return Number.isSafeInteger(id) ? id : null;
    } catch { return null; }
  }
  function settleArchiveHold(id, result) {
    const hold = archiveHolds.get(id);
    if (!hold) return;
    archiveHolds.delete(id);
    hold.resolve(result);
  }
  // Settle even if settings has taken over. Only our own preparation may
  // be cancelled; a same-alias settings request is still a different owner.
  function cancelArchiveHold(owner = undefined) {
    for (const [id, hold] of archiveHolds) {
      if (owner !== undefined && hold.owner !== owner) continue;
      if (hold.requestId !== null && archiveRequestId() === hold.requestId) {
        try {
          window.__tableBuild?.cancelPreparation?.();
          // Cancellation advances the real request counter. Carry our
          // cancellation's token into its unwind; a later takeover still
          // differs and must keep its table while we restore only the rack.
          if (hold.owner) hold.owner.tableRequestId = archiveRequestId();
        } catch { /* stale seam */ }
      }
      settleArchiveHold(id, 'superseded');
    }
  }
  function supersedeArchiveHold() {
    if (!archiveHolds.size) return null;
    cancelArchiveHold();
    // Resolving the old hold queues its call site's synchronous unwind
    // before this checkpoint. Snapshot and mutate the next rack only after
    // that unwind, otherwise the old restore can overwrite the new rack.
    return Promise.resolve();
  }
  let staging = null; // the open BRACKET while openPlayerInner runs, at
  // module scope precisely so a THROW can unwind it (GH-257 lane-3 P0: a
  // throw after __archive.suspend(true) stranded the DVR suspended in
  // PLAYBACK with no player to close and nothing ever recorded again).
  // { snap, rackChanged, appliedEquipment, appliedTemplate }; handed to pb on success.

  const recDurOf = (rec) => (rec.events?.length
    ? rec.events[rec.events.length - 1].t : 0);

  /** Quiet-stage segment `i`'s record (machine already in PLAYBACK). */
  function stageShot(i) {
    if (!pb || i === pb.curIdx) return true;
    const err = game.loadRecord(pb.records[i],
      { stage: 'quiet', allowVersionMismatch: pb.vm || undefined });
    if (typeof err === 'string') {
      note(t('playback.stageFailed', { message: err }));
      return false;
    }
    pb.curIdx = i;
    // camera application moved to renderAtT (GH-273): staging poses balls
    // at the record INITIAL, so a chase seed taken here framed the wrong
    // ball pose — the one camera authority now applies AFTER the seek
    return true;
  }

  // ---- post-strike cue in the player (design 277 slice 3 PR-1) --------------
  /** Keep the cuepost engine's arm in lockstep with the STAGED segment so
   * every player frame shows the staged record's own cue life (strike →
   * follow-through → stay-down → withdrawal; web/app/cuepost.js — a pure
   * function of the emitted 'frame' clock, so scrubs/seeks/speed detents
   * come free and scrub parity is byte-stable). Arm changes happen ONLY at
   * staging boundaries — here, before any frame of the new segment renders
   * — never inside a frame hook (a mid-frame re-arm would render one frame
   * of the OLD record's cue over the NEW record's balls and break seek
   * parity). BEAT frames disarm: a GH-299 walk window stages the NEXT
   * record's initial state while the camera clock walks past the previous
   * segment's end — a post-strike cue there would describe a strike that
   * has not happened yet (the state-handoff law). A record the engine
   * refuses (rail-unsafe framing etc.) is latched per segment and plays
   * pre-277, fail-closed. Everything reaches the engine through the
   * __test trampolines, feature-detected (rule 5): a stale main.js /
   * cuepostlive.js keeps the pre-277 player, never an error. */
  /** Kernel-seconds of cue life past the record end for `record` —
   * LITERAL MIRROR of offline-render.js probeCueTail (the WYSIWYG law:
   * both sides must derive the same per-segment geometry from the same
   * records; keep the clamp and the seam checks byte-equivalent when
   * editing either). Runs before the first syncCueArm arm, so no
   * standing arm can be replaced; leaves the engine disarmed. */
  const CUE_TAIL_MAX = 1.0; // offline-render.js CUE_TAIL_MAX (D4 law)
  /** { tail, cueable } — tail mirrors offline-render.js probeCueTail
   * (keep the clamp + the seam/hatch/two-rig checks equivalent when
   * editing either); `cueable` (review r7 P1) records that the engine
   * WOULD arm this record at all — a valid plan with tHide ≤ duration
   * probes tail 0 but still wears the cue through the whole shot, and
   * the export capability belt must gate on THAT, not on the tail. */
  function probeCueInfo(record, duration, index = 0) {
    const none = { tail: 0, cueable: false, lead: null };
    const tp = window.__test;
    if (typeof tp?.cuePost !== 'function') return none;
    try {
      if (tp.cuePostState?.() === null) return none; // engine loading
      // the setEnabled(false) escape hatch stands the WHOLE cue feature
      // down (review r1 P2): a scripted pre-277 baseline must get the
      // pre-PR-2 timeline geometry too, never a cue-less blank tail
      if (tp.cuePostLive?.state?.()?.enabled === false) return none;
      // two-rig law (review r6 P2, the offline-render mirror): no tail
      // geometry while a harness strike rig owns the frame
      if (tp.cueStrikeActive?.() === true) return none;
      const spec = tp.cuePostLive?.specFor?.(record);
      const plan = spec ? tp.cuePost(spec) : false;
      if (!plan) return none;
      tp.cuePost(null);
      const tail = (plan.tHide ?? 0) - duration;
      // GH-363 lead metrics — probe the v2 lead arm once (arm+disarm, the
      // "arm IS the plan computation" idiom): the resolved plan discloses
      // the deterministic jittered schedule, and because every tier shares
      // the approach geometry (the builder's ONE-probe law) it decomposes
      // into every tier's T_pre: v2 = tc − practice.start; v1/v1s =
      // (tc − from) + hold. A stale cuepostlive (spec without practice) or
      // a stale cuepost engine (practice spec rejected) probes lead:null —
      // the session plans no leads, the cue itself is untouched (rule 5).
      let lead = null;
      try {
        const ls = tp.cuePostLive?.specFor?.(record, { tier: 'v2', index });
        const lp = ls?.practice ? tp.cuePost(ls) : false;
        if (lp) {
          tp.cuePost(null);
          const start = lp.practice?.start;
          const tc = lp.t_contact;
          if (Number.isFinite(start) && Number.isFinite(lp.from)
            && Number.isFinite(tc) && start < tc) {
            const gap = tc - lp.from; // final stroke incl the rear pause
            lead = { v2: tc - start,
              v1: gap + LEAD_HOLD_V1, v1s: gap + LEAD_HOLD_V1S };
          }
        }
      } catch { lead = null; }
      return { tail: Math.max(0, Math.min(tail, CUE_TAIL_MAX)),
        cueable: true, lead };
    } catch { return none; }
  }

  function syncCueArm(at) {
    if (!pb) return;
    const beat = at === true || at?.beat === true;
    // GH-363 fusion: a beat window whose NEXT segment leads in arms the
    // STAGED record's lead spec on the emission→record clock map (design
    // 363 §5 — the pre-363 "disarm during tail" law flips to "armed with
    // the next segment's spec"); want-keys: `f<idx>` for the fused window,
    // the segment index for play/lead/tail (ONE arm covers lead + play +
    // withdrawal — no re-arm at the lead→play boundary).
    const fuseIdx = beat && typeof at === 'object'
      && pb.leadTier?.[at.i + 1] ? at.i + 1 : null;
    const want = beat ? (fuseIdx !== null ? `f${fuseIdx}` : null) : pb.curIdx;
    const tp = window.__test;
    if (typeof tp?.cuePost !== 'function') return; // stale seam — pre-277
    // cuepostlive escape hatch (reconciliation review P2): the documented
    // setEnabled(false) switch governs the DVR surface too — a scripted
    // boot (A/B captures, pre-277 baselines) that threw it gets NO
    // design-277 cue from the player either, and a standing DVR arm
    // disarms on the next staged render rather than surviving the switch.
    // Checked BEFORE the want-idempotence return so a mid-open disable
    // lands without needing a segment boundary. NOT a refusal: no
    // cueArmFail latch — re-enable + rescrub re-arms. A loading or stale
    // cuepostlive (state() null/undefined) falls through: enabled is the
    // shipped default and the switch is harness-only.
    if ((pb.cueArm !== null || want !== null)
      && (tp.cuePostLive?.state?.()?.enabled === false
        || pb.cueOff === true)) {
      // enabled === false: the harness escape hatch. pb.cueOff: the
      // session-scoped loading latch (review r9 P2) — the timeline was
      // built cue-less, so a late-resolving engine must not draw into
      // geometry with no withdrawal frames.
      if (pb.cueArm !== null) {
        try { tp.cuePost(null); } catch { /* stale seam */ }
        pb.cueArm = null;
      }
      return;
    }
    if (pb.cueArm === want) return;
    if (want === null) {
      try { tp.cuePost(null); } catch { /* stale seam */ }
      pb.cueArm = null;
      return;
    }
    // the refusal latch is keyed by SEGMENT index (a fused arm and the
    // segment's own arm are one spec family — refuse together)
    const latchKey = fuseIdx !== null ? fuseIdx : want;
    if (pb.cueArmFail?.has(latchKey)) {
      // latched refusal — this segment plays pre-277. Disarm FIRST (review
      // r1 P2): arriving here from a successfully armed segment would
      // otherwise leave the PREVIOUS record's cue posed over this
      // segment's balls — exactly the stale-arm class syncCueArm exists
      // to prevent.
      if (pb.cueArm !== null) {
        try { tp.cuePost(null); } catch { /* stale seam */ }
        pb.cueArm = null;
      }
      return;
    }
    let plan = false;
    try {
      if (tp.cuePostState?.() === null) return; // engine loading — retry
      // on the next staged render (no latch: loading is not a refusal)
      if (tp.cuePostLive?.state?.() === null) return; // spec-builder module
      // loading too (review r3 P2: its parallel dynamic import can resolve
      // after cuepost.js — latching here would disable the cue for the
      // segment forever; a stale main.js WITHOUT the trampoline still
      // falls through to the honest pre-277 latch below)
      let spec;
      if (fuseIdx !== null) {
        // fused beat-tail arm: the staged record is segment fuseIdx's
        // (renderAtT staged at.i+1). Emissions during the beat run
        // E_i..E_i+beatSec on the OWNING segment's clock (GH-864: the beat
        // departs at E_i = segEndSec(i, tails[i])); the staged cue's record
        // clock must hit 0 at cum[fuseIdx] — offset = E_i + beatSec + lead
        // (rate 1: live beats play at rate 1). The
        // visibility window opens at the staging boundary (walk start).
        const w = pb.beats[at.i];
        const off = pb.segEndSec(at.i, pb.tails?.[at.i] ?? 0) + w.beatSec + (pb.leads[fuseIdx] ?? 0);
        spec = tp.cuePostLive?.specFor?.(game.record, {
          tier: pb.leadTier[fuseIdx], index: fuseIdx,
          vw0: -(w.beatSec + (pb.leads[fuseIdx] ?? 0)),
          clock: { offset_s: off, rate: 1 } });
      } else {
        // GH-363: a lead-carrying segment arms with its tier — the SAME
        // arm covers the lead window (negative emissions), play and the
        // withdrawal (a stale trampoline/builder drops the descriptor,
        // but the open-time probe already zeroed the schedule there)
        const lead = pb.leadTier?.[want]
          ? { tier: pb.leadTier[want], index: want,
            vw0: -(pb.leads?.[want] ?? 0) }
          : undefined;
        spec = tp.cuePostLive?.specFor?.(game.record, lead);
      }
      plan = spec ? tp.cuePost(spec) : false;
    } catch { plan = false; /* stale seam */ }
    if (plan === false) {
      (pb.cueArmFail ??= new Set()).add(latchKey);
      try { tp.cuePost(null); } catch { /* stale seam */ }
      pb.cueArm = null;
      return;
    }
    pb.cueArm = want;
  }

  /** Disarm the player's cue arm (close / offline-render bracket). */
  function disarmCue() {
    if (pb?.cueArm != null) {
      try { window.__test.cuePost?.(null); } catch { /* stale seam */ }
    }
    if (pb) pb.cueArm = null;
  }

  // ---- the open-anything law (GH-257) ---------------------------------------
  // EVERY archived session opens, from EVERY entry state, and can be
  // exported. The only refusal left is TRANSIENT — a shot physically in
  // flight — and even there the honest behaviour is to say what is happening
  // and AWAIT the settle, never to answer no. The permanent refusals this
  // replaces (playback.notNow for any non-AIM stage; playback.switchBlocked
  // for a cross-game or cross-rack session) were implementation guards that
  // leaked into product behaviour, and the owner rejected them: past data
  // must always be viewable and exportable.
  //
  // What makes it safe — each piece measured before the refusals came out
  // (GH-257 lanes 2+3, the audit in feature 030 (internal spec) design charter):
  //  * the bed swap is QUIET: game.rerackKind(kind, seed, { quiet: true })
  //    and game.restoreRack() skip applyRack's setState('AIM', { seed })
  //    fresh-table emission — the ONE signal flow.js (match fold + rack
  //    ordinal), drills.js (live run), share.js (recorder log, which splits
  //    the archive session) and archive.js (rack segments) key off. A
  //    playback swap is therefore invisible to all four, in BOTH directions.
  //  * entry is ONE emission: loadRecord({ stage: 'playback' }) enters
  //    PLAYBACK from any state and emits nothing else. No lane treats a bare
  //    PLAYBACK transition as a fresh table.
  //  * the pre-open bed is captured VERBATIM and keyed BY BALL ID — rack
  //    template bytes + kernel kind + seed + equipment spec + per-ball
  //    pose/quat/baseQuat/scale/pocketed/visible/sinkT + the machine state.
  //    A re-rack REBUILDS every ball object, so the old snapshot's direct
  //    object references made its pose restore a silent no-op after a swap
  //    (measured: 0 of 10 pre-rerack meshes survive).
  //  * a THROW anywhere inside the open unwinds the WHOLE bracket
  //    (restoreLive) instead of stranding suspend(true) + PLAYBACK with no
  //    player to close — the measured P0 soft-lock that killed the DVR for
  //    the rest of the session.
  // Kept exactly: the archive suspend brackets, the WYSIWYG law, the
  // replay-identity restore (recordRef) and the strict-replay/view-anyway
  // semantics for old kernel stamps.

  // The machine states in which the table is settled and the player may take
  // it over. WIN is included deliberately: the table IS settled (flow's
  // banner beat re-racks a moment later, and entering PLAYBACK cancels that
  // timer — the bare WIN re-emission on close re-arms it, so the pre-open
  // semantics resume instead of being lost).
  const QUIET_STAGES = ['AIM', 'BALL_IN_HAND', 'WIN'];
  const SETTLE_TRIES = 120; // x 200 ms = 24 s (the measured worst settle on
  // this app is ~8.2 s; a shot that outlives this is a renderer problem, not
  // a wait, and the honest transient notice is the answer)

  /** True while the GAME's own shot sequencer owns the table: a shared
   * replay fires scheduled shots and would inject one into a borrowed bed
   * (flow.js's replay-lock note — the shot gets rejected and the replay
   * silently continues on a diverged table). Transient and self-clearing,
   * so it gets the same honest treatment as a shot in flight. */
  function sharedReplayLive() {
    try {
      const r = window.__share?.replay?.();
      return !!r?.active && r.done !== true;
    } catch { return false; }
  }

  /** Await a settled table, telling the user what we are waiting for.
   * Returns true when the table is ours, false after an honest transient
   * notice (never a permanent refusal). A RUNNING shared replay is the
   * SAME transient class (GH-257 review P2: the early return this replaces
   * REFUSED while playback.replayRunning's copy promised a wait): its
   * scheduler self-clears when share.js flips replay.done, so it is
   * awaited inside the one SETTLE_TRIES bound. The replay check outranks
   * the quiet check — between scheduled shots the machine flickers
   * through AIM while the next shot's timer is already armed, and opening
   * there would borrow the bed that shot is about to need. */
  async function awaitSettle() {
    if (!sharedReplayLive() && machine.is(...QUIET_STAGES)) return true;
    // repainted EVERY tick, not once per reason (review round-2 P2): note()'s
    // element self-removes after 6 s, so a 6-24 s wait went BLANK while the
    // open was still pending — each repaint re-arms that reaper for exactly
    // as long as the wait is honest, and the final paint still self-clears.
    const say = (key) => note(t(key));
    say(sharedReplayLive() ? 'playback.replayRunning' : 'playback.settling');
    // a tap that came FROM the list stands down if the user dismisses it
    // mid-wait; the __playback.openSession seam has no list to watch
    const fromList = listOpen;
    for (let i = 0; i < SETTLE_TRIES; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (fromList && !listOpen) return false; // the user left — stand down
      if (sharedReplayLive()) { say('playback.replayRunning'); continue; }
      if (machine.is(...QUIET_STAGES)) return true;
      say('playback.settling');
    }
    note(t('playback.notNow'));
    return false;
  }

  /** Pre-open snapshot of the LIVE bed — everything the close restore needs,
   * keyed by ball ID because a swap rebuilds every ball object. */
  function snapLive() {
    const balls = game.ballSet?.balls ?? [];
    const cam = window.__dbg?.camera;
    const orb = window.__dbg?.orbit;
    return {
      state: machine.state,
      record: game.record ?? null,
      // is that record still the LIVE table's routing identity? GH-158
      // keeps record/sampler through a drill re-lay and the playground
      // clear, so `record` alone cannot distinguish "settled table at this
      // record's final position" from "authored layout laid AFTER it" —
      // and re-settling the latter re-adjudicated the stroke (review
      // round-6 P1). flow.js owns the identity; feature-detected: a stale
      // flow.js has no seam and keeps today's re-settle (recorded degrade).
      recordLive: game.record
        ? (typeof window.__rules?.settledRecord === 'function'
          ? window.__rules.settledRecord() === game.record : true)
        : false,
      json: game.record ? JSON.stringify(game.record) : null,
      // the rack, verbatim: composeRack() could not rebuild it after the
      // player changed the equipment spec out from under it
      rack: {
        template: game.template
          ? JSON.parse(JSON.stringify(game.template)) : null,
        kind: game.rackKind ?? CENSUS_KIND[balls.length] ?? 'nine',
        seed: game.seed,
        equipment: game.equipment ? { ...game.equipment } : null,
      },
      scalars: {
        shotIndex: game.shotIndex, phi: game.phi, duration: game.duration,
        clock: game.clock, lastOutcome: game.lastOutcome ?? null,
        // GH-383 review r4 (P1): the pre-open per-seat cue assignment —
        // quiet record staging rebinds the register per archived record
        cueBallId: game.cueBallId ?? 0,
      },
      // FULL ball-set pose snapshot (QA wave + GH-257): balls pocketed in
      // EARLIER shots are absent from the pre-open record's initial.balls,
      // so the restore's quiet stage + seek never re-poses them; the
      // respotted cue's texture phase rides the quat; and an AUTHORED
      // layout (playground placements, a drill attempt) exists ONLY here —
      // no record and no rack template carries it.
      poses: balls.map((b) => ({
        id: b.id,
        p: b.mesh.position.clone(),
        q: b.mesh.quaternion.clone(),
        s: b.mesh.scale.x,
        base: b.baseQuat.clone(),
        pocketed: !!b.pocketed,
        visible: !!b.mesh.visible,
        sinkT: b.sinkT,
      })),
      // GH-626 review r4 P2: the solid-closure occupancy (a ball resting ON
      // the Predator plug holds its cup until the cup clears) is live-bed
      // truth too, and neither the pose snapshot nor the pre-open record
      // carries it — the poses are flags and transforms, and a ball potted
      // in an EARLIER shot is absent from the record. The quiet staging
      // below clears it with the table state it replaces; the close
      // restores it by ball id through the game.js seam pair
      // (snapshotRests / restoreRests), feature-detected: a stale game.js
      // keeps the pose-only restore (recorded degrade — the ball stands
      // on the plug with no owner until the next rack).
      rests: typeof game.snapshotRests === 'function'
        ? game.snapshotRests() : null,
      paused: game.paused,
      cam: cam ? {
        pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov,
        orbit: orb?.state ? { target: orb.state.target.clone(),
          radius: orb.state.radius, theta: orb.state.theta,
          phi: orb.state.phi } : null,
      } : null,
    };
  }

  /** Re-apply a snapshot's ball poses to the CURRENT ball objects, by id. */
  function restorePoses(snap) {
    const balls = game.ballSet?.balls ?? [];
    for (const s of snap.poses ?? []) {
      const b = balls.find((x) => x.id === s.id);
      if (!b) continue;
      b.mesh.position.copy(s.p);
      b.mesh.quaternion.copy(s.q);
      b.mesh.scale.setScalar(s.s);
      b.baseQuat.copy(s.base);
      b.pocketed = s.pocketed;
      b.mesh.visible = s.visible;
      b.sinkT = s.sinkT;
    }
    // GH-626 review r4 P2: the closure occupancy goes back WITH the poses
    // (map first, then syncShadows re-binds and re-poses from the entry —
    // the same station the settle derived, so nothing moves on screen).
    // Idempotent: afterSettle() re-applies this snapshot once more.
    if (snap.rests && typeof game.restoreRests === 'function') {
      try { game.restoreRests(snap.rests); } catch { /* stale game.js */ }
    }
    try { game.syncShadows?.(); } catch { /* stale game.js */ }
  }

  /** Does the LIVE bed host EVERY record of the session faithfully? Ball
   * ids must all exist (the loadRecord subset check — across ALL records,
   * GH-319 review r2 P2: attempt layouts lay different subsets per record,
   * and a first record that fits must not commit later segments to a bed
   * they cannot stage on), the equipment CLASS must match (a subset check
   * alone staged 9-ball on the snooker table — the recorded review P1) and
   * the table geometry must agree (game.js only warns; on this path a
   * mismatch means the session gets its OWN table instead). */
  function bedFits(recs, wantKind) {
    const balls = game.ballSet?.balls ?? [];
    if (!balls.length) return false;
    const live = CENSUS_CLASS[balls.length];
    if (live != null && KIND_CLASS[wantKind] !== live) return false;
    const ids = new Set(balls.map((b) => b.id));
    const at = game.template?.system?.table;
    // GH-534 G1 (round-2 QA, promoted from GH-536 item 3): EQUIPMENT
    // IDENTITY joins the fit — footprint alone staged the POST-swap
    // table/cue for pre-swap sessions whenever length/width matched (all
    // 9-ft pool tables tie at 2.54×1.27; they differ in pockets/facings/
    // nose height and the whole visual identity). "Faithfully" (this
    // function's own contract) means the RECORDED pairing: canonicalize
    // each record's initial.equipment tag per the GH-319 all-records law
    // (absent tag == the kernel-default pairing == null — exactly what
    // swapBed(…, null) selects) and require identity with the live
    // template's tag. Any mismatch routes into the proven swapBed path,
    // which stages the session's OWN equipment. VISUAL-PROVENANCE class
    // only: replay physics always re-sample the RECORD (no corruption —
    // the defect was the painted/kernel-staged bed identity). Rare cross
    // case (one side null, the other an explicit tuple that spells the
    // defaults) yields a spurious-but-faithful quiet swap, never a lie.
    const eqIdent = (e) => (e
      ? ['table_id', 'cloth_id', 'ballset_id', 'cushion_model_id', 'cue_id']
        .map((k) => e[k] ?? '').join('|')
      : null);
    const liveEq = eqIdent(game.template?.system?.equipment ?? null);
    for (const rec of recs ?? []) {
      if (!(rec.initial?.balls ?? []).every((rb) => ids.has(rb.id))) return false;
      const rt = rec.initial?.table;
      if (rt && at && (Math.abs(rt.length - at.length) > 1e-9
        || Math.abs(rt.width - at.width) > 1e-9)) return false;
      if (eqIdent(rec.initial?.equipment ?? null) !== liveEq) return false;
    }
    return true;
  }

  /** True when THIS game.js carries the GH-257 quiet swap/restore seams. A
   * stale cached game.js (cache-poison contract) keeps the pre-GH-257
   * behaviour: same-bed sessions still open, a foreign bed gets the honest
   * localized notice instead of a swap that could not be undone. */
  const swapSeams = () => typeof game.restoreRack === 'function'
    && typeof game.rerackKind === 'function';

  // A cold preparation may outlive another owner's rerack/placement. Save
  // the state actually borrowed by this PLAYBACK entry, not the older
  // pre-open snapshot. The finally also records an entry whose listener
  // throws after the state transition, so its failure unwind can release it.
  function loadArchiveRecord(owner, record, options) {
    const before = machine.state;
    try { return game.loadRecord(record, options); }
    finally {
      if (owner && before !== 'PLAYBACK' && machine.state === 'PLAYBACK') {
        owner.playbackEntryState = before;
      }
    }
  }

  // A kind/seed does not identify the composer: rerack applies the game's
  // seeded ID permutation; rerackKind only builds its raw kernel lattice.
  // Record successful public owner calls against the template they publish.
  // Unknown/older writers keep the full-snapshot fallback. The other two
  // template writers invalidate an enclosing call's receipt if a synchronous
  // state listener reracks again; wrappers preserve returns, throws and this.
  // The same SDK composer used by game.js, reached through a guarded leaf
  // import. A missing/stale leaf selects the full pre-open snapshot; the
  // close path must never substitute a raw lattice for a seeded game.
  let archiveRackGames = null;
  import('../dist/pool-sdk/games/index.js').then((m) => {
    if (typeof m.getGameEntry === 'function'
      && typeof m.resolveRackTemplate === 'function'
      && typeof m.applyRackTemplate === 'function') archiveRackGames = m;
  }).catch(() => {});
  const archiveRackRecipes = new WeakMap();
  let archiveRackWrite = 0;
  for (const name of ['rerack', 'rerackKind', 'restoreRack']) {
    const call = game[name];
    if (typeof call !== 'function') continue;
    const tracked = function (...args) {
      const write = ++archiveRackWrite;
      const before = game.template, gameId = game.gameId, equipment = game.equipment;
      const result = call.apply(this, args);
      if (name === 'rerack' && write === archiveRackWrite
        && game.template && game.template !== before && typeof result !== 'string'
        && game.gameId === gameId && game.equipment === equipment) {
        archiveRackRecipes.set(game.template,
          { rerack: tracked, gameId, kind: game.rackKind, seed: game.seed });
      }
      return result;
    };
    game[name] = tracked;
  }

  /** The refusal copy for an archived tuple the verbatim gate refuses. A
   * returning user can pair this playback.js with a stale cached locale
   * dictionary that predates playback.equipmentRefused, so the key is judged
   * on the ACTIVE dictionary (the webKeyOk form of the GH-313 hasLocal law:
   * namespace-reached; an i18n.js without hasLocal trusts has() only when en
   * is the active locale). Without the key the copy composes existing keys
   * and names no id: localized old prose beats a missing-key warn, and the
   * refused id stays console-only either way. */
  function equipmentRefusedCopy() {
    const keyOk = typeof i18nNs.hasLocal === 'function'
      ? i18nNs.hasLocal('playback.equipmentRefused')
      : (getLocale() === 'en' && has('playback.equipmentRefused'));
    return keyOk ? t('playback.equipmentRefused')
      : t('playback.stageFailed', { message: t('error.reloadPage') });
  }

  /** The open-path failure copy for a swapBed error: the 'refused' sentinel
   * maps to the refusal copy (the refused id is console-only); any other
   * error keeps the stage-failed copy. */
  function swapFailCopy(swapErr) {
    return swapErr === 'refused' ? equipmentRefusedCopy()
      : t('playback.stageFailed', { message: swapErr });
  }

  /** Re-equip + re-rack the live bed for the session, QUIETLY. The session's
   * own equipment provenance lands first: pool rack kinds compose from the
   * ACTIVE spec (game.js composeKindScenario), so a 9-ball session opened
   * while snooker equipment is live would otherwise be built on the 12-ft
   * snooker table. An untagged record was simulated on the kernel default
   * pairing (default compositions serde-skip the equipment tag), which is
   * exactly what `null` selects. Returns null, an error string ('refused'
   * when the verbatim gate refuses the archived tuple), or — on a
   * cold table — the readiness thenable resolving to null, an error
   * string, or 'superseded' when a dismissal wins the hold race (CLASS C1:
   * every call site awaits it). NOT async: the warm path must stay a
   * synchronous non-thenable return. */
  function swapBed(wantKind, seed, equipment, owner = null) {
    // #789 (census E19, S2/S3): an archived tag the loaded kernel or scene
    // cannot stage is refused BEFORE the re-equip and the re-broadcast (the
    // call sites show it as playback.equipmentRefused, never the id). The
    // settings api's commit gate judges it in VERBATIM mode, the replay law
    // (an archive re-simulates on the recorded ids, never on a twin): an id
    // is kept when it, or its canonical id (a retired digest-row id plays as
    // its neutral twin), is one the loaded kernel lists and, for a table, the
    // loaded scene builds; any other id refuses. Verbatim never degrades, and
    // an id only the SDK catalog rejects (a stale cached catalog) stages the
    // tag as recorded, since the SDK catalog plays no part in staging.
    // The gate is reached on the settings api this module already reads
    // (window.__settings) and feature-detected per use (the ownership ledger rule-5
    // corollary: no new named import; a stale settings.js without the gate
    // keeps the pre-#789 swap; an untagged record stages the kernel default
    // pairing). Inline, so a sliced swapBed carries its own gate.
    const archiveGate = window.__settings?.equipmentGate;
    const judged = typeof archiveGate === 'function' && equipment && typeof equipment === 'object'
      ? archiveGate(equipment, [], { verbatim: true }) : null;
    if (judged && judged.ok === false) {
      const refused = `${judged.axis} ${judged.id}: ${judged.reason}`;
      // the refused id stays in the console: a raw id (a retired digest-row
      // id included) never reaches UI copy; callers map the sentinel to
      // playback.equipmentRefused
      console.warn(`[playback] archived equipment refused: ${refused}`);
      return 'refused';
    }
    try {
      game.setEquipment?.(equipment ?? null);
      if (owner) owner.appliedEquipment = game.equipment;
      game.rerackKind(wantKind, seed, { quiet: true });
      if (owner) owner.appliedTemplate = game.template;
    } catch (e) {
      console.warn('[playback] rack swap failed:', e);
      return 'rack swap failed';
    }
    return rebroadcastEquipment(owner);
  }

  /** Restore the table state this open still owns and close the
   * brackets. ONE function for both exits — closePlayer and the open-failure
   * unwind — so a failed open can never leave a half-restored bed (lane-3
   * P0). Never throws: every leg is guarded, because this IS the recovery. */
  function restoreLive(s, { reopenList = false } = {}) {
    const snap = s?.snap;
    if (!snap) {
      try { arch()?.suspend?.(false); } finally { releaseArchiveEquipment(s); }
      return;
    }
    // setEquipment and restoreRack allocate the kernel's spec object. Keep
    // a foreign committed write; otherwise restore the pre-open spec, not
    // the session spec swapBed installed before awaiting preparation.
    const ownsEquipment = game.equipment === s.appliedEquipment;
    const equipment = ownsEquipment
      ? snap.rack?.equipment : game.equipment;
    // restoreRack publishes the spec and template together. Carry the
    // kept spec's tag at that boundary too; refresh its resolved options
    // through the kernel seam below, before the restore paint/state emit.
    const template = !ownsEquipment && snap.rack?.template
      ? { ...snap.rack.template, system: { ...snap.rack.template.system } }
      : snap.rack?.template;
    if (!ownsEquipment && template) {
      if (equipment) template.system.equipment = { ...equipment };
      else delete template.system.equipment;
    }
    // applyRack installs the freshly composed/cloned template. A foreign
    // template means another owner reracked: keep its rack AND live poses,
    // not a pre-open template combined with its newer equipment spec.
    const ownsRack = game.template === s.appliedTemplate;
    // A rerack can replace our template WITHOUT replacing our borrowed
    // spec (leaving playground, flow/drills/share). Return that spec too;
    // keeping such a rack would leave session geometry under the old scene.
    const borrowedRack = !ownsRack && ownsEquipment;
    const rackChanged = s.rackChanged || borrowedRack;
    const restoreResolvedEquipment = () => {
      if (ownsEquipment && !borrowedRack) return;
      // swapCue is the kernel-backed composition seam: re-resolve options
      // AND provenance after restoreRack copied the old snapshot. Its
      // in-place writer is invisible to the template-identity predicate.
      // A cached game without this seam cannot take settings' in-place
      // cue path; it retains the historic confirm/rerack path instead.
      const err = game.swapCue?.();
      if (typeof err === 'string') console.error('[playback] ' + err);
    };
    const restoreEquipment = () => {
      // Even when the rack is still ours, a newer settings/boot request
      // owns its equipment broadcast: restoring ours would supersede the
      // user's new preparation, including a pick of the same alias.
      if (s.tableRequestId !== undefined
        && (s.tableRequestId === null || archiveRequestId() !== s.tableRequestId)) return;
      rebroadcastEquipment();
    };
    // EVERY leg is individually guarded: this IS the recovery, so one
    // throwing seam must not skip the legs after it (measured with an
    // injected throw — the un-run tail left manual render mode latched on).
    const step = (fn) => {
      try { fn(); } catch (e) {
        console.error('[playback] restore step failed: ' + (e?.message ?? e));
      }
    };
    // camera pose/fov + orbit rig truth back to the user's framing
    step(() => {
      const cam = window.__dbg?.camera;
      if (!snap.cam || !cam) return;
      const orb = window.__dbg?.orbit;
      if (snap.cam.orbit && orb?.state) {
        orb.state.target.copy(snap.cam.orbit.target);
        orb.state.radius = snap.cam.orbit.radius;
        orb.state.theta = snap.cam.orbit.theta;
        orb.state.phi = snap.cam.orbit.phi;
      }
      cam.position.copy(snap.cam.pos);
      cam.quaternion.copy(snap.cam.quat);
      cam.fov = snap.cam.fov;
      cam.updateProjectionMatrix();
    });
    let returnedRack = false;
    const recipe = borrowedRack ? archiveRackRecipes.get(game.template) : null;
    if (recipe && recipe.rerack === game.rerack && recipe.gameId === game.gameId
      && recipe.kind === game.rackKind && recipe.seed === game.seed
      && ['nine', 'ten', 'fifteen'].includes(recipe.kind)
      && Number.isSafeInteger(recipe.seed) && recipe.seed >= 0
      && typeof game.setEquipment === 'function'
      && typeof game.rerackKind === 'function'
      && typeof game.restoreRack === 'function'
      && (recipe.gameId === 'nine_ball' || archiveRackGames)) {
      // Reproduce the owner's composition without its fresh-table event:
      // quiet kernel lattice, the same SDK permutation, quiet installation.
      // Raw/unknown writers, discipline kinds or a missing composer leaf
      // take the full pre-open snapshot path below.
      const { kind, seed } = recipe;
      step(() => {
        const definition = recipe.gameId === 'nine_ball' ? null
          : archiveRackGames.resolveRackTemplate(
            archiveRackGames.getGameEntry(recipe.gameId)?.rack_template);
        if (recipe.gameId !== 'nine_ball' && definition?.kernel_kind !== kind) return;
        game.setEquipment(equipment ?? null);
        game.rerackKind(kind, seed, { quiet: true });
        const composed = definition ? JSON.parse(archiveRackGames.applyRackTemplate(
          definition, JSON.stringify(game.template), seed)) : game.template;
        const err = game.restoreRack({ template: composed, kind, seed, equipment });
        if (err) throw new Error(err);
        returnedRack = game.rackKind === kind;
      });
    }
    if (borrowedRack) {
      if (!returnedRack) {
        // Unknown/raw writers cannot supply a proved game composition.
        // Restore the complete pre-open rack/poses/scalars quietly. A cold
        // foreign rerack already freed the old playback assets; do not
        // enter PLAYBACK merely to re-stage them during a cancellation.
        step(() => {
          const rr = game.restoreRack?.({ ...snap.rack, template, equipment, scalars: snap.scalars });
          if (typeof rr === 'string') console.error('[playback] ' + rr);
          restoreResolvedEquipment();
        });
        step(() => {
          if (!snap.record || machine.state !== 'PLAYBACK') return;
          const err = game.loadRecord(snap.json, { stage: 'quiet',
            recordRef: snap.record, allowVersionMismatch: true });
          if (typeof err === 'string') console.error('[playback] asset re-stage failed: ' + err);
          game.setPhi?.(snap.scalars.phi);
          if (Number.isFinite(snap.scalars.clock)) game.seek(snap.scalars.clock);
          if (Number.isFinite(snap.scalars.cueBallId)) game.cueBallId = snap.scalars.cueBallId;
        });
        step(() => restorePoses(snap));
      }
      step(() => restoreEquipment());
      step(() => { game.paused = snap.paused; });
      step(() => window.__test.setManual(false));
      // Cold cancellation emits nothing. Only our observed PLAYBACK entry
      // is released, once, through the existing DVR seam (never a seed).
      // A later owner that already left PLAYBACK keeps its current state.
      step(() => {
        if (s.playbackEntryState !== undefined && machine.state === 'PLAYBACK') {
          if (typeof game.emitRestoredState === 'function') {
            game.emitRestoredState(s.playbackEntryState);
          } else {
            // Cached quiet-restore graph before the emit-last companion:
            // keep its existing restoreRack(state) ordering and reapply
            // the current poses. No new state API or fresh-rack event.
            const live = snapLive();
            const rr = game.restoreRack({ ...live.rack, scalars: live.scalars,
              state: s.playbackEntryState });
            if (typeof rr === 'string') console.error('[playback] ' + rr);
            restorePoses(live);
          }
        }
      });
    } else if (!ownsRack && !borrowedRack) {
      // Close our pause/manual-render brackets without re-staging a record,
      // seeking, re-posing, or emitting state over the committed rack.
      step(() => { game.paused = snap.paused; });
      step(() => window.__test.setManual(false));
    } else if (snap.record && snap.recordLive === false
      && typeof game.emitRestoredState === 'function') {
      // (the emit seam gates the LEG: a stale game.js without it keeps the
      // seek-to-settle restore below — the recorded degrade — because a
      // quiet re-stage with no way out of PLAYBACK would be a soft-lock)
      // the retained record is NOT the live routing identity (a drill
      // re-lay or playground clear landed AFTER it settled — GH-158 keeps
      // the assets; review round-6 P1: seek-to-settle here re-emitted its
      // shotComplete against a NULLED flow.lastRecord, re-adjudicating the
      // stroke and re-scheduling the drill). Re-stage the ASSETS quietly
      // (Replay/export stay alive), re-apply the authored poses, and emit
      // the pre-open state directly — no settle, no shotComplete.
      step(() => {
        if (rackChanged && typeof game.restoreRack === 'function') {
          const rr = game.restoreRack({ ...snap.rack, template, equipment, scalars: snap.scalars });
          if (typeof rr === 'string') console.error('[playback] ' + rr);
          restoreResolvedEquipment();
          restoreEquipment();
        }
      });
      step(() => {
        // pre-entry unwind with the live assets untouched: nothing to
        // re-stage. A pre-entry unwind that DID swap the rack destroyed
        // the retained assets with the ball set (review round-7 P2), so it
        // re-stages through the 'playback' stage — which enters PLAYBACK —
        // and the emission step below exits to the pre-open state.
        if (machine.state !== 'PLAYBACK' && !rackChanged) return;
        const err = game.loadRecord(snap.json, {
          stage: machine.state === 'PLAYBACK' ? 'quiet' : 'playback',
          recordRef: snap.record, allowVersionMismatch: true });
        if (typeof err === 'string') {
          console.error('[playback] asset re-stage failed: ' + err);
        }
        game.setPhi?.(snap.scalars.phi);
        // the quiet staging zeroed the clock (review round-8 P2): re-seek
        // the captured value so the live clock leaves exactly as it came
        // (restorePoses below re-applies the authored layout over the
        // seek's sampler poses)
        if (Number.isFinite(snap.scalars.clock)) game.seek(snap.scalars.clock);
        // GH-383 review r4 (P1): the loadRecord re-stage above rebound the
        // cue register to the PRE-OPEN record's striker — the LIVE seat
        // assignment is the snapshot's (a two-cue carom on the other
        // seat's turn would otherwise shoot a spurious wrong-ball)
        if (Number.isFinite(snap.scalars.cueBallId)) {
          game.cueBallId = snap.scalars.cueBallId;
        }
      });
      step(() => restorePoses(snap));
      step(() => { game.paused = snap.paused; });
      step(() => window.__test.setManual(false));
      step(() => {
        if (machine.state !== snap.state) game.emitRestoredState(snap.state);
      });
      // NO afterSettle here (review round-10 P2): this leg restored poses
      // and emitted the state SYNCHRONOUSLY — there is no settle routing
      // left to out-wait, and the bounded poll could instead sit through a
      // brand-new shot and stamp the old snapshot over its table.
    } else if (snap.record) {
      // a swap rebuilt the ball set: put the pre-open RACK back first
      // (verbatim template bytes + the live equipment spec), then re-stage
      // the pre-open record with its ORIGINAL identity so the post-close
      // settle routes the replay-identity paths (flow/share/drills
      // lastRecord) instead of judging the shot a second time
      if (rackChanged) {
        step(() => {
          // scalars too: applyRack zeroes shotIndex, and the shot seed is
          // `seed * 1000 + shotIndex` — a restore that dropped it would make
          // the NEXT live shot reuse the previous shot's seed (measured by
          // arm 10a: shotIndex 1 -> 0). loadRecord below then re-derives
          // duration/clock/phi from the record itself.
          const rr = game.restoreRack?.({ ...snap.rack, template, equipment, scalars: snap.scalars });
          if (typeof rr === 'string') console.error('[playback] ' + rr);
          restoreResolvedEquipment();
          restoreEquipment();
        });
      }
      step(() => {
        // stale game.js (the cache-poison register — no swap seams means
        // no 'playback' stage either): its loadRecord reads an unknown
        // stage as the NON-quiet default and refuses outside AIM, so the
        // close restore logged "not in an aiming state" on every stale
        // round trip (GH-257 review finding). The pre-GH-257 close restore
        // is the 'quiet' stage that graph DOES know — valid whenever the
        // machine is in PLAYBACK, which is every close and every
        // post-entry unwind; a pre-entry unwind (machine still AIM/BIH)
        // keeps 'playback', which that graph reads as the plain AIM-side
        // restore it always ran.
        const stage = !swapSeams() && machine.state === 'PLAYBACK'
          ? 'quiet' : 'playback';
        const err = game.loadRecord(snap.json, { stage,
          recordRef: snap.record, allowVersionMismatch: true });
        if (typeof err === 'string') {
          console.error('[playback] live state restore failed: ' + err);
        }
        game.setPhi?.(snap.scalars.phi);
        game.seek(game.duration); // settled table; the RAF settle takes over
        // GH-383 review r5 (P1): this close path's loadRecord ALSO rebinds
        // the cue register to the pre-open record's striker — the live
        // seat assignment is the snapshot's (same law as the quiet leg)
        if (Number.isFinite(snap.scalars.cueBallId)) {
          game.cueBallId = snap.scalars.cueBallId;
        }
      });
      // poses LAST (the seek re-poses from the sampler): pocketed parks,
      // the respotted cue's quat, and any authored layout
      step(() => restorePoses(snap));
      step(() => { game.paused = snap.paused; });
      step(() => window.__test.setManual(false));
      // ...and once more after the settle routes, which re-poses from the
      // sampler and (for an authored layout) would otherwise win
      step(() => afterSettle(snap));
    } else {
      // no live record: the pre-open bed was a rack with no staged shot.
      // Re-apply it VERBATIM and hand the machine back to its pre-open state
      // with a BARE emission (no {seed}/{layout} info = no fresh table: the
      // match fold, a live drill run and the recorder log all survive).
      step(() => window.__test.setManual(false));
      step(() => { game.paused = snap.paused; });
      step(() => {
        if (typeof game.restoreRack === 'function' && snap.rack.template) {
          // state emission LAST (review round-4 P2): restoreRack's own
          // emission painted flow's rack tracker/aim hints from the FULL
          // rebuilt rack, and restorePoses then re-applied the sparse
          // authored layout silently — rebuild first, pose, then emit
          // over the table the state actually describes. Feature-detected
          // for a cached game.js carrying restoreRack without the
          // companion seam (the recorded old ordering).
          const emitLast = typeof game.emitRestoredState === 'function';
          const rr = game.restoreRack({ ...snap.rack, template, equipment, scalars: snap.scalars,
            state: emitLast ? null : snap.state });
          if (typeof rr === 'string') console.error('[playback] ' + rr);
          restoreResolvedEquipment();
          if (rackChanged) restoreEquipment();
          restorePoses(snap);
          if (emitLast) game.emitRestoredState(snap.state);
        } else {
          // stale game.js: the pre-GH-257 restore (a same-seed rerack)
          game.rerack(snap.rack.seed);
          if (rackChanged) restoreEquipment();
        }
      });
    }
    step(() => arch()?.suspend?.(false));
    step(() => releaseArchiveEquipment(s));
    step(() => releaseBlob()); // belt: the card normally released it already
    if (reopenList) step(() => openList());
  }

  /** Re-apply the pre-open truth once the close settle has routed. The
   * settle re-poses every ball from the sampler and flow may respot, so an
   * AUTHORED layout (playground placements, a drill attempt) and a captured
   * BALL_IN_HAND placement only survive if they land after it. Bounded poll,
   * ~4 s, and it stands down the moment a new player opens. */
  function afterSettle(snap, tries = 240) {
    const tick = () => {
      if (pb) return; // player reopened before the settle — stand down
      if (machine.state !== 'PLAYBACK') {
        restorePoses(snap);
        if (snap.bihPos && machine.is('BALL_IN_HAND')) {
          try { game.placeCue(snap.bihPos.x, snap.bihPos.y); } catch { /* clamped */ }
        }
        return;
      }
      if (--tries > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Open the player over session `meta`. The ONLY thing that can stop it is
   * a table that is not settled YET — awaitSettle() waits that out. */
  async function openPlayer(meta, detail) {
    if (pb || opening) return;
    opening = true;
    if (pendingSince === null) pendingSince = performance.now();
    // GH-717: the INVOKER is read synchronously at entry — inside the row's
    // Enter/click dispatch, or right after the hall's exitToTable handed
    // focus to its table successor (#shoot) — before any await; the memo
    // rides onto pb at build time (pendingLaunch idiom) and is cleared in
    // the finally, so a refused open never leaks it onto a later one.
    pendingInvoker = captureInvoker();
    try {
      if (!(await awaitSettle())) return;
      await openPlayerInner(meta, detail);
    } catch (e) {
      // lane-3 P0: a throw after suspend(true) used to strand the DVR
      // suspended in PLAYBACK forever, with no player to close and nothing
      // ever recorded again. Unwind the WHOLE bracket instead.
      console.error('[playback] open failed: ' + (e?.message ?? e));
      if (staging) { const s = staging; staging = null; restoreLive(s); }
      else if (pb) {
        // a throw AFTER the player took the bracket (buildPlayer/applyCam):
        // the chrome may be half-built with no way out, so tear it down
        // through the same restore path rather than leave ob-pb-live on
        try { closePlayer(false); } catch { /* this IS the recovery */ }
      }
      note(t('playback.stageFailed', { message: e?.message ?? String(e) }));
    } finally { opening = false; if (!pendingSession) pendingSince = null; pendingInvoker = null; disarmOpenEsc(); }
  }

  async function openPlayerInner(meta, detail) {
    // open-generation token (review final round + CLASS C5): capture at
    // ENTRY — the archive reads below (records/flush/session/awaitSettle)
    // can hold this open while the user dismisses, and the pre-staging
    // check unwinds then too.
    const gen = ++openGen;
    const a = arch();
    // r10 (round-9 checker P2, belt): a launch that came FROM the list stands
    // down if the list is gone by the time the readiness wait ends — the
    // same rule awaitSettle applies mid-wait (the ✕, a backdrop tap or an
    // Escape the kit trap claimed all leave listOpen false; the generation
    // bump is the primary cancellation, this one is shape-independent)
    const fromList = listOpen;
    // r11 (round-10 checker P3): the pending-open Escape is armed at ENTRY —
    // before the first archive await — not after them. openSession releases
    // its own handler before the launch and the r9 slot was taken only after
    // the archive reads below (records → awaitSettle → flush → records →
    // session), so with the list CLOSED (a rail row / openSession) an
    // Escape landing during those reads cancelled nothing and the player
    // opened afterwards. gen0 is this span's token: a press (or close(), or
    // the launching list's dismissal) bumps openGen and the judgement after
    // the reads returns quietly — nothing is staged yet, nothing to unwind.
    // The same slot then rides through the readiness wait below (one
    // openPlayer in flight at a time) and is released right after it, or
    // from openPlayer's finally on every other exit. Still unarmed, and the
    // ONLY gap left: openPlayer's own pre-bracket awaitSettle() on a
    // still-rolling live shot (synchronous `true` on a settled table, so no
    // key can land between openSession's release and this line). Arm F1i,
    // the esc-session-archive leg (the archive read HELD in the document).
    openEscDisarm = armPendingEsc();
    const gen0 = openGen;
    const cancelled = () => gen0 !== openGen || (fromList && !listOpen);
    let records = a ? await a.records(meta.id) : [];
    if (cancelled()) return; // dismissed (Escape / close() / the list) during the read
    if (!records.length) { note(t('playback.stageFailed', { message: 'no records' })); return; }
    // re-check after the archive await: a deferred timer (drill re-lay, flow
    // routing) or a shared replay may have moved the machine while the read
    // was in flight — await the settle again rather than refuse. Called
    // UNCONDITIONALLY (GH-257 review P2): the old machine.is() fast path
    // skipped the shared-replay check, and between scheduled shots the
    // machine reads AIM while the replay's next shot is already timed.
    if (!(await awaitSettle())) return;
    // the wait may have just SETTLED a shot of THIS very session, whose
    // zero-delay archive write lands after the read above (review round-10
    // P2) — flush and re-read so the player and its chip/marker metadata
    // carry the shot the user watched land, never a stale pairing.
    try {
      await a?.flush?.();
      const fresh = await a.records(meta.id);
      if (fresh?.length >= records.length) records = fresh;
      // detail refreshes UNCONDITIONALLY (review round-11 P2): openPlayer's
      // own pre-wait means the first records read can already carry the
      // just-settled shot while meta/detail still predate it — a
      // length-gated reload left the chip count and marker strip stale
      // beside the fresh record.
      const fd = await a.session?.(meta.id);
      if (fd) { meta = fd; detail = fd; }
    } catch { /* the pre-wait read stands */ }
    if (cancelled()) return; // dismissed during the settle / flush / re-read (r11)
    const recs = records.map((r) => JSON.parse(r));
    const vm = kernelMismatch(meta.kernelVersion);
    if (gen !== openGen) return;
    const priorArchive = supersedeArchiveHold();
    if (priorArchive) await priorArchive;
    const snap = snapLive();
    // BIH placement snapshot (review merge-gate P2): entry from BALL_IN_HAND
    // bypasses hud.onReplay's savedBihPos capture, so flow's routeReplay
    // would respot the cue at the default spot and discard the placement the
    // user had already lined up. Mirror the capture (kernel frame via
    // coords.threePosToK; stale coords.js = today's respot behavior).
    if (machine.is('BALL_IN_HAND')
      && typeof coords?.threePosToK === 'function' && game.cueBall?.()) {
      snap.bihPos = coords.threePosToK(game.cueBall().mesh.position);
    }
    // ---- does the live bed host this session, or does it need its own? ----
    // GH-319: the RECORDS pick their bed (drill sessions rack on the drill's
    // kind, not the stamped game's, and attempt layouts vary per record —
    // see recordKind); the stamp tiebreaks.
    const wantKind = recordKind(recs, RACK_KIND[meta.gameId] ?? 'fifteen');
    const fits = bedFits(recs, wantKind);
    if (!fits && !swapSeams()) {
      // stale cached game.js (cache-poison register): the swap seams are
      // absent, so the pre-GH-257 honest notice stands — it is TRUE here.
      note(t('playback.switchBlocked'));
      return;
    }
    // ---- the bracket opens: everything past here unwinds through
    // restoreLive(), including on a throw (openPlayer's catch) ----
    // CLASS C5: dismissed during the pre-staging awaits — unwind before
    // anything is staged (nothing acquired yet: suspend runs below).
    if (gen !== openGen) return;
    staging = { snap, rackChanged: false, appliedEquipment: game.equipment, appliedTemplate: game.template };
    holdArchiveEquipment(staging);
    a?.suspend?.(true);
    const fail = (msg) => {
      const s = staging;
      staging = null;
      if (s) restoreLive(s);
      note(msg);
    };
    /** Pre-mutation refusal (review round-8 P1): the bed was never touched,
     * and on the stale graph restoreLive's no-record fallback is a
     * DESTRUCTIVE same-seed rerack — the exact state the refusal exists to
     * protect. Release the bracket, restore nothing. */
    const refuse = (msg) => {
      const s = staging;
      staging = null;
      try { a?.suspend?.(false); } finally { releaseArchiveEquipment(s); }
      note(msg);
    };
    if (!fits) {
      const eq = recs[0]?.initial?.equipment ?? null;
      // CLASS B1: the re-rack runs synchronously inside swapBed — mark it
      // BEFORE the hold, so a dismissal unwinds through restoreRack and the
      // retained rebroadcast (even a failed swap may have re-racked)
      staging.rackChanged = true;
      const swapErr = await swapBed(wantKind, snap.rack.seed, eq, staging);
      if (gen !== openGen) {
        // dismissed during the table hold (CLASS A1): unwind the staging
        // bracket quietly — never build a player over a closed dialog
        const s = staging;
        staging = null;
        if (s) restoreLive(s);
        return;
      }
      if (swapErr) { fail(swapFailCopy(swapErr)); return; }
    }
    // ---- enter PLAYBACK: ONE emission, from ANY state ----
    let err;
    if (!swapSeams()) {
      // stale game.js (cache-poison register; GH-257 review P1): that graph
      // has no 'playback' stage — loadRecord reads it as the NON-quiet
      // default, which from AIM/BIH is the FULL fresh-load path (layout()
      // plus the match/drill reset no close restore can undo). Take the
      // LEGACY entry that graph was built for: the replay-identity entry
      // over the live sampler + a quiet re-stage; a virgin rack keeps the
      // plain load (which enters PLAYBACK from AIM/BIH and refuses other
      // states honestly — the recorded stale degrade, arm 6 family).
      if (game.record && game.sampler) {
        game.replay();
        err = game.loadRecord(records[0],
          { stage: 'quiet', allowVersionMismatch: vm || undefined });
      } else if (window.__drills?.state?.()
        && window.__drills.state().done !== true) {
        // a LIVE drill on a no-record bed (review round-2 P2): the plain
        // load below emits the layout transition that STOPS the run, and
        // no stale close restore can reconstruct it — refuse honestly
        // instead (the recorded stale degrade; the copy's instruction is
        // true here too: finish the current game first). Feature-detected:
        // an absent/stale drills leaf answers undefined and proceeds.
        refuse(t('playback.switchBlocked'));
        return;
      } else if (machine.is('BALL_IN_HAND')) {
        // recordless BALL_IN_HAND on the stale graph (review round-5 P2:
        // e.g. a carom break spot just chosen): the only close restore
        // that graph leaves is a same-seed rerack, which would discard
        // the placement and any pending decision — refuse honestly.
        refuse(t('playback.switchBlocked'));
        return;
      } else {
        err = game.loadRecord(records[0],
          { allowVersionMismatch: vm || undefined });
      }
    } else {
      err = loadArchiveRecord(staging, records[0],
        { stage: 'playback', allowVersionMismatch: vm || undefined });
    }
    if (typeof err === 'string' && /not in the current rack/.test(err)
      && !staging.rackChanged && swapSeams()) {
      // same-class rack miss (a 9-ball bed asked to host a 15-ball session):
      // swap to the session's kind and retry — the census/geometry gate
      // cannot see an id permutation, only a shape
      // CLASS B1: mark the synchronous re-rack BEFORE the hold (see above)
      staging.rackChanged = true;
      const swapErr = await swapBed(wantKind, snap.rack.seed,
        recs[0]?.initial?.equipment ?? null, staging);
      if (gen !== openGen) {
        // dismissed during the table hold (CLASS A1): unwind the staging
        // bracket quietly — never build a player over a closed dialog
        const s = staging;
        staging = null;
        if (s) restoreLive(s);
        return;
      }
      if (swapErr === 'refused') { fail(swapFailCopy(swapErr)); return; }
      if (!swapErr) {
        err = loadArchiveRecord(staging, records[0],
          { stage: 'playback', allowVersionMismatch: vm || undefined });
      }
    }
    if (typeof err === 'string') {
      // stale-graph same-class rack miss: the recorded degrade copy (its
      // instruction is TRUE there — see the switchBlocked ruling above)
      fail(!swapSeams() && /not in the current rack/.test(err)
        ? t('playback.switchBlocked')
        : t('playback.stageFailed', { message: err }));
      return;
    }
    game.paused = true;
    // #983: the LIVE latch — the player presents the live view, so main.js
    // applies window resizes at once (the export's own setManual re-defers)
    window.__test.setManual(true, { live: true });
    // one camera writer (concat-plan risk G3): disarm the scripted rig +
    // any chase before the shelf takes over
    try { window.__test.cameraScript?.(null); } catch { /* stale */ }
    window.__track?.stop?.();
    const durs = recs.map(recDurOf);
    // design 277 slice 3 PR-2: per-segment cue-life overhang (tHide past
    // the record end, the PR-1 deferred review item) — the timeline gives
    // the withdrawal frames to play in. Probed by arm+disarm (the engine
    // has no pure plan seam) BEFORE the first syncCueArm arm, with the
    // SAME clamp renderDrill's probe applies (offline-render.js
    // probeCueTail — the WYSIWYG mirror: live scrub and export agree on
    // every segment's geometry). Stale/loading seams probe 0 — the exact
    // pre-PR-2 timeline. tails0 = record truth; refreshSchedule derives
    // the EFFECTIVE pb.tails (a walk beat replaces the withdrawal — the
    // beat departs at the record end, so beat segments carry no tail).
    // bounded readiness wait (≤1.5 s, usually 0): the engine + spec
    // builder load via guarded dynamic imports at boot — probing while
    // they still load would build a TAIL-LESS timeline that diverges from
    // the export's (renderDrill probes at render time, engine long
    // loaded). A truly stale seam skips instantly (undefined, not null)
    // and probes 0 — the consistent pre-PR-2 degrade on both sides.
    for (let w = 0; w < 30 && (window.__test?.cuePostState?.() === null
      || window.__test?.cuePostLive?.state?.() === null); w++) {
      await new Promise((r) => { setTimeout(r, 50); });
    }
    await settlePov(); // GH-911: the leaf is latched once per open, after a bounded settle
    disarmOpenEsc(); // r9: the wait is over — the trap below owns Escape from this turn
    // loading LATCH (review r9 P2): if the engine is STILL loading past the
    // bound, this player session runs pre-277 wholesale — the probes below
    // would record no tails, and a module resolving mid-session would
    // otherwise let syncCueArm draw a cue the timeline has no withdrawal
    // frames for (and renderDrill, probing at render time over a LOADED
    // engine, would extend a geometry the card never showed). The latch
    // rides savePlan's cueOff carry into the exporter; reopening the
    // player after the modules resolve probes fresh.
    const cueOff = window.__test?.cuePostState?.() === null
      || window.__test?.cuePostLive?.state?.() === null;
    if (gen !== openGen || (fromList && !listOpen)) {
      // dismissed during the wait (review final round; r10: or the launching
      // list itself is gone): unwind the staging bracket quietly — never
      // build a player over a closed dialog
      const s = staging;
      staging = null;
      if (s) restoreLive(s);
      return;
    }
    // STAGE-THEN-PROBE (review r1 P1): the engine's plan clamps against the
    // LOADED record's ball trajectories (intrusion/rest are sampler truth,
    // not spec fields), so probing record i over record 0's staged bed
    // would mis-time every later segment's tail. Quiet-stage each record
    // before its probe — exactly what renderTimeline does per segment —
    // and put segment 0 back for the player's first frame. A staging
    // refusal probes that record at 0 (the segment will latch pre-277 in
    // syncCueArm anyway).
    const probed = recs.map((rec, i) => {
      if (i > 0 && typeof game.loadRecord(records[i],
        { stage: 'quiet', allowVersionMismatch: vm || undefined }) === 'string') {
        return { tail: 0, cueable: false, lead: null, completion: durs[i] };
      }
      // GH-489 #637 LAND-17 PM2: the STAGED record's sink completion (the last
      // pocket drop's end, framestep.js sinkCompletionSec over the index
      // game.loadRecord just rebuilt for THIS record) — the term renderDrill's
      // per-segment plan takes by max (offline-render.js, the staging probe),
      // mirrored here so the fullFits wall and the engine agree EXACTLY at the
      // boundary; a stale leaf degrades to the kernel duration on both sides.
      const completion = framestepNs.sinkCompletionSec?.(durs[i], game.sinkEntries?.() ?? []) ?? durs[i];
      // index rides into the GH-363 lead probe: it is part of the
      // deterministic jitter seed, so the probed T_pre is the exact
      // schedule the render arms
      return { ...probeCueInfo(rec, durs[i], i), completion };
    });
    const tails0 = probed.map((p) => p.tail);
    const completions = probed.map((p) => p.completion);
    if (records.length > 1) {
      const back = game.loadRecord(records[0],
        { stage: 'quiet', allowVersionMismatch: vm || undefined });
      if (typeof back === 'string') {
        fail(t('playback.stageFailed', { message: back }));
        return;
      }
    }
    const cum = [];
    let total = 0;
    for (const d of durs) { cum.push(total); total += d; }
    const latched = camLatch.get(meta.id);
    // GH-684: the launch intent is consumed HERE, before buildPlayer, so
    // the back pill names its destination from its first paint (the
    // openSession post-hoc `pb.launch` write below stays as the seam law)
    const launch = pendingLaunch ?? { reopenList: true };
    pendingLaunch = null;
    // GH-717: the close-time focus target (null when the open started with
    // focus on <body> or inside a player — the successor walk then decides)
    const invoker = pendingInvoker;
    pendingInvoker = null;
    // GH-911 (plan C3 site 5, C2 engine bullet B21): the engine is read once
    // per open, after the settle and before the first rod, and named by one
    // line: present only when the Engine has a sampler and its own version()
    // equals the replay kernel's stamp (kv, :482).
    let povEng = null, povWhy = povEngineWhy, povV = null;
    try {
      if (povEngine && typeof povEngine.sampler !== 'function') povWhy = 'no sampler';
      else if (povEngine) {
        povV = String(povEngine.version());
        if (povV === kv) povEng = povEngine;
        else povWhy = `version ${povV} != kv ${kv}`;
      }
    } catch (e) { povWhy = `version threw: ${e?.message ?? e}`; }
    console.info(povEng ? `pov-rod engine: present kv=${povV}` : `pov-rod engine: absent (${povWhy})`);
    // GH-911 (plan C3 site 5, r5 B16, r6 C-splice, r9; OQ-9 (a), addendum
    // A1): one rod per record string, over one fresh parse of it. The three
    // shot fields are tested first (I1(ii): the only null). The planner is
    // cuepost.js planRecordRod with the no-lead spec (liveCuePostSpec, OQ-36)
    // and a kernel sampler over the record, spliced to kv under game.js's own
    // rule (game.js:1060-1085): splice when the stamps differ and the pair is
    // lineage-compatible or this is a version-mismatch open (vm, set from
    // kernelMismatch above, the flag the open's loadRecord calls take),
    // refuse otherwise. A refusal, an absent or stale leaf, an absent engine
    // and any throw take OQ-9's rod named from the record (cuepost.js
    // refusalRodOf's form), counted by kind and printed once per open; never
    // a throw out of the open.
    const povNo = {};
    const povRodOf = (s) => {
      const rec = JSON.parse(s);
      const sh = rec?.shot;
      if (![sh?.a, sh?.b, sh?.theta].every(Number.isFinite)) return null;
      const refuse = (kind) => {
        povNo[kind] = (povNo[kind] ?? 0) + 1;
        return { thetaDeg: sh.theta / (Math.PI / 180), a: sh.a, b: sh.b, followThroughM: 0, flexM: 0 };
      };
      const planRod = cuepostMod?.planRecordRod, specOf = cuepostliveMod?.liveCuePostSpec;
      if (typeof planRod !== 'function' || typeof specOf !== 'function') return refuse('leaf');
      if (!povEng) return refuse('engine');
      const lineageOk = shareSdk.lineageCompatible?.(rec.kernel_version, kv) === true;
      if (rec.kernel_version !== kv && !lineageOk && !vm) return refuse('version');
      let sampler = null;
      try {
        sampler = povEng.sampler(rec.kernel_version === kv ? s : JSON.stringify({ ...rec, kernel_version: kv }));
        const r = planRod(rec, specOf(rec), sampler);
        if (!r) return null;
        if (r.kind !== 'plan') povNo[r.kind] = (povNo[r.kind] ?? 0) + 1;
        return r.rod;
      } catch { return refuse('throw'); } finally { try { sampler?.free?.(); } catch { /* freed or stale */ } }
    };
    const rods = records.map((s) => povRodOf(s)); // GH-911: record-bound rods (record data + shipped code); bound to the record, not to the active table or look, so a table or look change inside the open does not re-derive them
    console.info(`pov-rod refused: ${Object.values(povNo).reduce((n, k) => n + k, 0)} of ${records.length} ${JSON.stringify(povNo)}`);
    pb = {
      meta, detail, records, recs, durs, cum, total, launch, invoker,
      // GH-452: replace-class reset boundaries (record truth, immutable per
      // open) — the derived fade schedule's input (keptResetBounds).
      resetB: resetBoundsOf(recs, meta),
      tails0, tails: tails0.slice(),
      completions, // LAND-17 PM2: per-record sink completion (record truth, immutable per open)
      // GH-489 #637 LAND-18 X2 (review 775r5 P2 (b)): the ONE completion-aware
      // segment end every export estimate plans with — max(kernel + the tail the
      // caller grants, this record's sink completion). plannedFullFrames (the
      // engine's frame wall), plannedFull() (the windowed-audio byte cap) and
      // plannedMontage() (the degrade sweep) read it; the engine (renderDrill)
      // plans each segment to the same max. The DVR LIVE schedule
      // (refreshSchedule, locate, setPlaying and the other span readers) ends
      // each segment at the same E_i (GH-864, class (a)); segExtSec below is
      // its post-record span.
      segEndSec(i, tailSec) {
        return Math.max(pb.durs[i] + tailSec, pb.completions?.[i] ?? pb.durs[i]);
      },
      // GH-864: the post-record span E_i - durs[i] that the live clocks add back,
      // written as max(tails, completion - durs) rather than segEndSec - durs.
      segExtSec(i) {
        return Math.max(pb.tails?.[i] ?? 0, (pb.completions?.[i] ?? pb.durs[i]) - pb.durs[i]);
      },
      cueable: probed.map((p) => p.cueable),
      // GH-363: per-record lead metrics (probeCueInfo — null = the record
      // cannot lead in: refused cue, stale seams, or no practice support).
      // refreshSchedule derives the EFFECTIVE pb.leads/leadTier from these
      // + the beats + the option state.
      leadPre: probed.map((p) => p.lead ?? null),
      leads: probed.map(() => 0), leadTier: probed.map(() => null),
      cueOff,
      povLeaf: povMod,
      rods,
      vm, snap, rackChanged: staging.rackChanged, tableRequestId: staging.tableRequestId,
      appliedEquipment: staging.appliedEquipment, appliedTemplate: staging.appliedTemplate,
      equipmentHold: staging.equipmentHold,
      playbackEntryState: staging.playbackEntryState,
      // reopen READS the latched camera PLAN (GH-273 law, GH-301 §1.3 —
      // the same segment-count guard, now over the whole cut list)
      plan: latched && latched.segs === records.length
        && (latched.plan?.cuts ?? []).every((c) => c.seg < records.length)
        ? clonePlan(latched.plan) : emptyPlan(),
      planRev: 0,        // bumps on every plan write (the §2.1 re-apply key)
      compiled: new Map(), // compiledSpec cache, cleared per write
      appliedKey: null,  // `${seg}|${planRev}` of the ARMED directive
      captureLatch: false, // GH-301 §3.2: suppresses every camera writer
      tileCam: null,     // the pill row's lit camera (syncCamTiles cache)
      // GH-299: beats[i] = the walk after segment i (refreshSchedule owns
      // it); camSeg = the segment whose camera directive is armed (a beat
      // window stages i+1 while the CAMERA stays segment i's script)
      beats: Array(records.length).fill(null), camSeg: 0,
      speed: 1, tIn: 0, tOut: total, T: 0, curIdx: 0,
      playing: false, raf: 0, lastNow: 0, pendingT: null,
      // GH-314: the immersive-console overlay state (syncUi is the ONE
      // writer of player.dataset.ui). wantShown = the transient-reveal
      // latch (true after a reveal tap / a pin release, false after the
      // render-clock timer or a dismiss tap); idleSec = render-clock
      // seconds since the last interaction; trackDrag mirrors wireTrack's
      // closure state ('head'|'in'|'out'|null) so scrub and trim pins are
      // enumerable; holdIds = pointers currently PRESSED inside the
      // console (any held press pins — the belt that covers a stale
      // playback-strip.js whose drags this module cannot see); eatClick
      // arms the one-shot click eater after a bed reveal tap; bedPress =
      // the candidate reveal tap in flight.
      ui: { wantShown: true, idleSec: 0, lastState: 'pinned',
        trackDrag: null, holdIds: new Set(), bedIds: new Set(),
        eatClick: false, bedPress: null,
        // GH-314 owner amendment (QuickTime desktop semantics): mouseSeen
        // latches once a REAL mouse pointermove is observed (touch-compat
        // mouse events never set it, so the phone register stays exactly
        // as shipped); pointerOut/outSec drive the hide-on-leave grace on
        // the render clock.
        mouseSeen: false, pointerOut: false, outSec: 0 },
    };
    staging = null; // the player owns the bracket from here (closePlayer)
    refreshSchedule(); // GH-299: latched POV pairs seed their walk beats
    // into the timeline BEFORE the track geometry builds
    closeList();
    document.documentElement.classList.add('ob-pb-live');
    buildPlayer();
    // GH-302: a decoded share camera plan (`&cp=`) seeds the DVR player
    // of THE SESSION IT DESCRIBES, once that session stages. CONTENT-
    // ADDRESSED BY RECORD BYTES: the replay's re-simulated record JSONs
    // (byte-identical to the recording device's archived originals — the
    // P-III determinism law) must be a byte-exact PREFIX of this
    // session's records. Record bytes carry EVERYTHING — initial state,
    // placements, equipment, events — so the plan can never land on a
    // foreign session (same-seed same-params sessions with different
    // placements do not byte-match; review GH-302 r1 P2), and same-seed
    // rulebook re-racks need no seed arithmetic (review GH-302 r1 P1).
    // Shared replays themselves are never archived (ARCHIVE-PHASE-A
    // law), but the AUTHOR's original session persists, and reopening
    // one's own link restores the plan the in-memory camLatch lost
    // across app sessions (shots played after the share keep matching:
    // inherited anchors stay valid, new shots extend the last span).
    // Applied through the setCutPlan validator (setPlanChecked): the
    // GH-301 edit-time law and the apply-time unknown-id degrade hold
    // verbatim; a structurally illegal decoded plan REFUSES wholesale
    // with one warn (default cameras — never a throw). DVR user state
    // always wins: any camLatch entry for this session (including a
    // deliberately EMPTIED plan) suppresses the seed. Feature-detected
    // on both sides (stale share.js = no seam, nothing to seed).
    if (!latched) {
      const sp = window.__share?.cameraPlan?.();
      // stamp-normalized compare (review GH-302 r2 P2): after a proven
      // version-only kernel restamp the re-simulated records carry the
      // NEW kernel_version while the archived originals keep the old one
      // — raw equality would refuse the restore forever. Everything
      // ELSE must still byte-match, and that is the proof itself: a
      // kernel whose physics actually diverged produces different EVENT
      // bytes, so content-equality-modulo-stamp can only mean the same
      // game (the legacy-links "version-only splice" law).
      const nk = (j) => (typeof j === 'string'
        ? j.replace(/"kernel_version":"[^"]*"/, '"kernel_version":""') : j);
      // the address must be COMPLETE (review GH-302 r3 P2): an
      // early-exited replay leaves a partial record prefix, and a plan
      // whose later cuts index unverified shots must not ride a match
      // on the opening shots alone — every shared shot re-simulated, or
      // no seed.
      const matches = !!sp && Array.isArray(sp.records)
        && sp.records.length > 0 && sp.records.length === sp.expected
        && sp.records.length <= records.length
        && sp.records.every((r, i) => nk(r) === nk(records[i]));
      if (matches
        && ((sp.plan?.cuts?.length ?? 0) || (sp.plan?.poses?.length ?? 0))) {
        const ok = setPlanChecked({
          cuts: (sp.plan.cuts ?? []).map((c) => ({
            seg: c.seg, t: csSec(c.t ?? 0), cam: c.cam,
            transitionIn: c.transitionIn, dur: csSec(c.dur ?? 0) })),
          poses: sp.plan.poses ?? [],
        });
        if (!ok) {
          console.warn('[playback] shared camera plan refused — '
            + 'default cameras');
        }
      }
    }
    // the open reads the plan too (GH-273/GH-301): a latched session
    // reopens on ITS cameras; a fresh one on the broadcast default —
    // renderAtT's null appliedKey arms segment 0's directive (armSeg)
    renderAtT(0);
  }

  /** After a rack swap in EITHER direction: the rack the kernel simulates on
   * and the table the scene PAINTS are two truths, and only an ob:settings
   * equipment broadcast moves the second one — re-broadcast whatever the
   * active template now carries so table.js rebuilds to match (review
   * merge-gate P1: a rerack alone left the pool simulation rendered on the
   * 12-ft snooker scene). GH-257 calls it on the way in AND out. */
  function rebroadcastEquipment(owner = null) {
    // DEFAULT pool compositions serde-skip the equipment tag (the game.js
    // applyRack note), so a table_id guard here would skip the only restore
    // broadcast and strand the session's table scene (review re-gate P1).
    // Dispatch unconditionally: table.js maps a missing/unknown table_id to
    // the same kernel-default pin the sim itself uses.
    const eq = game.template?.system?.equipment;
    // `transient: true` (ADDITIVE, review r4 P2): this is a PAINT-ONLY
    // broadcast — the archived bed's spec on the way in, the live spec on
    // the way out — never a settings commit. share.js's mid-rack cue-swap
    // poison must ignore it (an archived cue differing from the live one
    // would otherwise read as a real swap and disable sharing); scene
    // listeners key off the value alone and are unaffected.
    const dispatch = () => {
      window.dispatchEvent(new CustomEvent('ob:settings',
        { detail: { key: 'equipment', value: eq ? { ...eq } : {},
          transient: true } }));
    };
    // CLASS A1 (FIX15, review 748r12 P2): hold the table-readiness
    // transaction HERE. A raw broadcast cannot be awaited, so on the first
    // cn8 switch of a page the player staged records on the RETAINED table
    // while the geometry swapped in later. Call prepareEquipment directly
    // (the main.js bindReplayTableReadiness idiom): the WARM path creates no
    // promise and dispatches in the same tick; the COLD path defers the raw
    // broadcast until READY and returns the thenable so the swapBed call
    // sites can await it. A stale table without the seam keeps the pre-A1
    // fire-and-forget broadcast.
    const tableBuild = window.__tableBuild;
    if (typeof tableBuild?.prepareEquipment !== 'function') {
      dispatch();
      return null;
    }
    let ready;
    try {
      ready = tableBuild.prepareEquipment(eq ? { ...eq } : {});
    } catch (e) {
      console.warn('[playback] table not ready:', e);
      return 'table not ready';
    }
    const requestId = archiveRequestId();
    if (owner && requestId !== null) owner.tableRequestId = requestId;
    const settle = (ok) => {
      if (requestId !== null && archiveRequestId() !== requestId) {
        return 'table preparation superseded';
      }
      if (ok === false) {
        const status = tableBuild.status?.().status ?? 'REFUSED';
        // CLASS B1 (P3): after a supersede the table reads READY — say so
        // instead of 'not ready'
        return status === 'READY' ? 'table preparation superseded'
          : `table not ready: ${status}`;
      }
      dispatch();
      // The synchronous paint broadcast also passes through table.js.
      // Retain that request's identity for a later close/unwind.
      if (owner && requestId !== null) owner.tableRequestId = archiveRequestId();
      return null;
    };
    if (!ready?.then) return settle(ready);
    // Cached capabilities without request ids keep the synchronous path.
    // A cold preparation cannot be owned safely: cancel what we started,
    // then let the failure bracket restore the pre-open rack and paint.
    if (requestId === null) {
      tableBuild.cancelPreparation?.();
      return 'ARCHIVE_TABLE_REQUEST_ID_UNAVAILABLE';
    }
    // An overlapping open/resume must release the older awaiting call
    // site even while its download remains held. Its unwind sees our new
    // request id and restores its rack without rebroadcasting over us.
    for (const id of archiveHolds.keys()) settleArchiveHold(id, 'superseded');
    const holdId = ++archiveHoldSeq;
    return new Promise((resolveHold) => {
      archiveHolds.set(holdId, { resolve: resolveHold, table: eq?.table_id ?? null, requestId, owner });
      Promise.resolve(ready).then((ok) => {
        if (!archiveHolds.has(holdId)) return; // already explicitly settled
        settleArchiveHold(holdId, settle(ok));
      }, () => {
        // A capability from a mixed graph may reject rather than resolve
        // false. It must enter the existing fail/restore path, not hang.
        settleArchiveHold(holdId, 'table not ready: REFUSED');
      });
    });
  }

  /** Timeline position for global second T (GH-299 beat-aware): the owning
   * segment, whether T sits inside its trailing BEAT window, and the local
   * offset (play: local kernel seconds; beat: beat-local tau). The live
   * timeline is beat-INCLUSIVE — pb.cum[i] is where segment i starts after
   * every earlier segment's duration + beat. */
  function locate(T) {
    if (!pb) return { i: 0, beat: false, local: 0 };
    let i = 0;
    for (let k = pb.cum.length - 1; k > 0; k--) {
      if (T >= pb.cum[k]) { i = k; break; }
    }
    // GH-363: LEAD windows — pb.cum[i] is the PLAY start; segment i's lead
    // occupies [cum[i] − leads[i], cum[i]) and reports a NEGATIVE local:
    // the local IS the segment's lead clock (renderAtT emits it verbatim —
    // the cue feathers toward contact at 0). Segment 0's lead sits below
    // cum[0]; a later segment's lead is the span past its predecessor's
    // E_i + beat.
    if (T < pb.cum[0]) {
      return { i: 0, beat: false, lead: true, local: T - pb.cum[0] };
    }
    const local = T - pb.cum[i];
    const E = pb.segEndSec(i, pb.tails?.[i] ?? 0);
    if (T >= pb.cum[i] + E) {
      const post = E + (pb.beats?.[i]?.beatSec ?? 0);
      // GH-864: the lead test compares in the schedule's own sums: setPlaying's
      // beat-phase bnd (cum[i] + E_i) + beat, or liveChorStart's cum[i+1] - leads[i+1].
      if (i + 1 < pb.durs.length && (pb.leads?.[i + 1] ?? 0) > 0
        && (T >= pb.cum[i] + E + (pb.beats?.[i]?.beatSec ?? 0)
          || T >= pb.cum[i + 1] - pb.leads[i + 1])) {
        return { i: i + 1, beat: false, lead: true,
          local: Math.max(local - post - pb.leads[i + 1],
            -pb.leads[i + 1]) };
      }
      // `>=`: the boundary INSTANT already belongs to the beat (the
      // export's first tail frame stages the next record at/after the
      // exit — the live scrubber agrees at the exact boundary sample)
      // GH-864: the play/post gate compares T against cum[i] + E_i, the
      // schedule's own sum (setPlaying's bnd), never local >= E_i; a
      // subtraction re-derives the boundary and can lose the ulp that makes
      // bnd resolve to the next lead.
      if (pb.beats?.[i]) {
        return { i, beat: true,
          local: Math.min(local - E, pb.beats[i].beatSec) };
      }
    }
    return { i, beat: false, local };
  }

  // ---- GH-299: the LIVE beat schedule -----------------------------------------
  /** THE beat-schedule builder over the live timeline: beats[i] = the walk
   * after segment i (null = hard cut), for every consecutive pair whose
   * effectiveCam are BOTH the POV preset; any other pair keeps the hard
   * cut (the disarm-at-dispatch law unchanged). Pure in (records, cams).
   * The export mirror (exportBeats below) runs the SAME builder AFTER trim
   * slicing plus the 60 s montage-budget law — no second derivation
   * anywhere. Gated on the __test.twoClock seam: a stale cached main.js
   * cannot split the ball/camera clocks, so the whole feature stands down
   * to the pre-299 hard cuts in BOTH the live player and the plan
   * (consistent recorded degrade, never a live/export divergence). */
  function liveBeats() {
    const out = Array(pb.recs.length).fill(null);
    if (window.__test?.twoClock !== true) return out;
    for (let i = 0; i + 1 < pb.recs.length; i++) {
      // GH-301: the pair law reads the PLAN — POV ruling segment i's EXIT
      // and segment i+1's head, with the boundary seam WALK-willing
      // (span-interior = the GH-299 default; an explicit seam must say
      // MOVE — cut/fade hard-cut the camera there, §1.5/§2.4)
      if (camAtSegEnd(i) !== 'pov' || effectiveCam(i + 1) !== 'pov') continue;
      if (!seamWalks(i + 1)) continue;
      out[i] = beatFor(i, pb.durs[i]);
    }
    return out;
  }

  /** Recompute the beats + the beat-inclusive timeline (cum/total), remap
   * the playhead/trim onto it by CONTENT anchor, and re-lay the built
   * track. Called on open (latched POV pairs) and on every camera-
   * assignment write (a POV pair inserts its walk into the live timeline;
   * un-assigning removes it). */
  function refreshSchedule() {
    if (!pb) return;
    const oldCum = pb.cum, oldDurs = pb.durs, oldTotal = pb.total;
    pb.beats = liveBeats();
    // PR-2: effective cue tails — a walk beat replaces the withdrawal, so
    // beats and tails never coexist on one segment. GH-864: the beat departs
    // at E_i. On a beat segment tails[i] is 0, so E_i = max(durs, completion),
    // which is where renderDrill ends a beat segment. The GH-299 boundary key
    // stays beatFor at durs[i]: the walk is keyed on the record, not on its end.
    pb.tails = (pb.tails0 ?? pb.durs.map(() => 0))
      .map((v, i) => (pb.beats[i] ? 0 : v));
    // GH-363: the LIVE lead schedule — always the v2 tier (the montage
    // degrade ladder is an export-budget construct; the live player, like
    // its beats, shows the undegraded plan), quantized to the frame grid
    // (the beatSec law) so the live boundaries land exactly where the
    // export's head frames do.
    // GH-474 CAMERA-SETTLE LAW (supersedes the GH-363 §5 walk-overlay
    // arithmetic; owner design feedback on the build-17 exports): the
    // choreography clock starts at CAMERA SETTLE, never mid-transition —
    // a kept walk INTO segment i arrives (C2 trapezoid speed reaching 0,
    // gaze arrival-locked on the address look) exactly at the lead window
    // start, so the lead window carries the FULL T_pre and the walk
    // frames show the fused cue holding a STATIC address stance (the
    // engine's own t < practice.start pose — a player waiting at address).
    // The old overlap subtraction (T_pre − (T_beat − BEAT_HOLD)) started
    // feathers inside the moving walk — the GH-474 red proof measured
    // feather cycles at 1.9 m/s of camera speed. Hard-cut and static-mount
    // segments settle AT the cut by construction (camerascript's
    // boundary-hold law: emissions before the first move hold its start
    // pose), so their lead windows are already settle-aligned.
    // Gates: the option, the two-clock seam, the engine capability chain
    // and the session's cueOff latch — any missing piece zeroes the
    // schedule (the consistent pre-363 degrade on both sides).
    const leadsOk = leadInOn && !pb.cueOff
      && window.__test?.twoClock === true
      && window.__export?.leadInCapable === true;
    pb.leadTier = pb.durs.map((_, i) => (leadsOk
      && (pb.leadPre?.[i]?.v2 > 0) ? 'v2' : null));
    pb.leads = pb.durs.map((_, i) => {
      if (!pb.leadTier[i]) return 0;
      return Math.round(pb.leadPre[i].v2 * 60) / 60;
    });
    const cum = [];
    let total = 0;
    for (let i = 0; i < pb.durs.length; i++) {
      total += pb.leads[i]; // the lead window PRECEDES the play start
      cum.push(total);
      total += pb.segEndSec(i, pb.tails[i]) + (pb.beats[i]?.beatSec ?? 0);
    }
    pb.cum = cum;
    pb.total = total;
    if (total === oldTotal && cum.every((v, i) => v === oldCum[i])) return;
    const remap = (x) => {
      if (x <= 1e-9) return 0; // the timeline head stays the head (GH-363:
      // segment 0's lead must not fall outside a fresh window)
      if (x >= oldTotal - 1e-9) return pb.total;
      for (let i = oldCum.length - 1; i >= 0; i--) {
        if (x >= oldCum[i]) {
          const local = x - oldCum[i];
          if (local <= oldDurs[i]) return pb.cum[i] + local;
          // past the record end (old cue TAIL or old beat window): keep
          // the post-end offset, clamped to the NEW segment's post-end
          // span — Ext_i + beat (the extension is the tail or the
          // completion overhang, whichever is longer; a POV-pair assignment
          // swaps the withdrawal tail for the walk and back, and a
          // playhead inside either lands on the same offset into the
          // replacement, or the boundary when the span shrank).
          return pb.cum[i] + oldDurs[i]
            + Math.min(local - oldDurs[i],
              pb.segExtSec(i) + (pb.beats[i]?.beatSec ?? 0));
        }
      }
      return 0;
    };
    pb.tIn = remap(pb.tIn);
    pb.tOut = remap(pb.tOut);
    pb.T = remap(pb.T);
    // the 0.1 s minimum trim window survives the remap (review round-4 P2:
    // BOTH handles inside a REMOVED beat collapse onto one boundary —
    // includedSegments() then answers empty and the Export CTA dies while
    // every trim input path promises a >= 0.1 s window)
    if (pb.tOut - pb.tIn < 0.1) {
      pb.tOut = Math.min(pb.total, pb.tIn + 0.1);
      pb.tIn = Math.max(0, pb.tOut - 0.1);
    }
    relayoutTrack();
    if (player) { syncMontage(); syncTransport(); }
  }

  /** Re-lay the ONCE-BUILT track geometry after a schedule change: segment
   * ticks, marker positions (content-anchored via dataset.seg/rel), the
   * total label and the session chip's duration. */
  function relayoutTrack() {
    if (!player || !P.track || !pb) return;
    for (const el of P.track.querySelectorAll('.ob-pb-seg')) {
      const i = Number(el.dataset.seg);
      if (Number.isFinite(i) && i < pb.cum.length) {
        el.style.left = `${(100 * pb.cum[i] / pb.total).toFixed(2)}%`;
      }
    }
    for (const m of P.markers ?? []) {
      if (m.dataset.end === '1') { m.dataset.t = String(pb.total); continue; }
      const i = Number(m.dataset.seg);
      if (!Number.isFinite(i)) continue;
      const at = pb.cum[i] + Number(m.dataset.rel);
      m.dataset.t = String(at);
      m.style.left = `${(100 * at / pb.total).toFixed(2)}%`;
    }
    if (P.ttot) P.ttot.textContent = fmtT(pb.total);
    syncSliderRange(); // GH-718 review r1: the AT range follows the total
    if (P.chipM) P.chipM.textContent = playerChipMeta(pb.meta);
    // GH-301 §3.1: the strip lane re-derives its geometry from the SAME
    // schedule (never from raw durations once beats exist)
    try { stripUi?.layout?.(); } catch { /* strip leaf degrade */ }
  }

  // ---- GH-301 §1.2: the cameraPlan read law (generalizes GH-273) ------------
  /** Nearest cut at or before (seg, tCs); before the FIRST cut, backfill
   * from it (the GH-273 owner-defect fix verbatim: "tap CHASE, scrub
   * anywhere" covers the whole timeline in both scrub directions —
   * broadcast remains only the never-chosen default). null = empty plan. */
  function cutAtCs(seg, tCs) {
    const cs = pb?.plan?.cuts ?? [];
    let best = null;
    for (const c of cs) {
      if (c.seg < seg || (c.seg === seg && c.t <= tCs)) best = c;
      else break;
    }
    return best ?? cs[0] ?? null;
  }
  /** cameraAt(seg, localT) → the RAW small-int camId ruling that instant.
   * The read FLOORS onto the grid (review r7 P3): a playhead at 0.796 s
   * must not read the 0.800 s cut's camera — the compiled script switches
   * at the anchor, and the lit pill must never lead the rendered frame. */
  function camIdAt(seg, tSec) {
    const c = cutAtCs(seg, Math.floor(Number(tSec) * 100 + 1e-6));
    return c ? c.cam : 0;
  }
  /** APPLY-time unknown-id degrade (§1.4): unknown/reserved camIds and
   * empty custom slots degrade to CAMS[0] — never a throw (camera is a
   * presentation axis, unlike variant/rules ids). */
  function appliedCamId(n) {
    if (n >= 0 && n <= 5) return n;
    if (isCustomCamId(n) && pb?.plan?.poses?.some((p) => p.slot === n - 8)) {
      return n;
    }
    return 0;
  }
  /** GH-273 name kept for the legacy arms: the camera RULING segment i's
   * HEAD, as the preset id string ('custom' = a tripod slot — those arm
   * through the compiled camerascript spec, never through applyCam). */
  function effectiveCam(i) {
    if (!pb) return 'broadcast';
    const n = appliedCamId(camIdAt(i, 0));
    return isCustomCamId(n) ? 'custom' : CAMS[n].id;
  }
  /** The camera ruling segment i's EXIT (walk-beat pairing reads it). */
  function camAtSegEnd(i) {
    if (!pb) return 'broadcast';
    const n = appliedCamId(camIdAt(i, (pb.durs[i] ?? 0) + 1));
    return isCustomCamId(n) ? 'custom' : CAMS[n].id;
  }
  /** Does the boundary INTO segment j walk when its cameras pair POV→POV
   * (§1.5/§2.4)? A span-INTERIOR boundary (no anchor at (j, 0)) keeps the
   * GH-299 default walk; an explicit seam walks only when its transition
   * is MOVE — cut/fade hard-cut the camera (a fade dips over it). */
  function seamWalks(j) {
    const c = (pb?.plan?.cuts ?? []).find((x) => x.seg === j && x.t === 0);
    return !c || c.transitionIn === 1;
  }

  // ---- GH-301 §1.1/§1.3: plan writers (quantize-at-save; edit-time law) -----
  /** Is cut `c` a legal MOVE seam (§1.5 — v1: POV→POV boundary seams
   * only)? Shared by the picker's legality read AND the post-write
   * normalization below. */
  function moveSeamLegal(c) {
    return !!c && c.t === 0 && c.seg > 0 && appliedCamId(c.cam) === 2
      && appliedCamId(camIdAt(c.seg - 1, (pb?.durs?.[c.seg - 1] ?? 0) + 1)) === 2;
  }
  /** Post-write transition normalization (review GH-301 round-1 P2): a
   * camera edit beside a MOVE seam can strand `transitionIn: 1` on a seam
   * that is no longer POV→POV — liveBeats would (rightly) schedule no
   * walk while the picker still displayed MOVE. The seam downgrades to
   * the hard cut the engine will actually render. */
  function normalizeMoves() {
    for (const c of pb.plan.cuts) {
      if (c.transitionIn !== 1) continue;
      // pair legality AND an affordable walk (review r6 P2) — the glyph
      // must describe the transition the engine will render
      if (!moveSeamLegal(c)
        || beatFor(c.seg - 1, pb.durs[c.seg - 1]) === null) {
        c.transitionIn = 0;
      }
    }
  }
  /** Every plan write funnels here: normalize stranded move seams, bump
   * the re-apply key, drop the compiled-spec cache, re-derive the beat
   * schedule + track geometry. */
  function planChanged({ restore = false } = {}) {
    if (!pb) return;
    normalizeMoves();
    pb.planRev = (pb.planRev + 1) | 0;
    pb.compiled = new Map();
    pb.appliedKey = null; // force the re-arm through the next renderAtT
    refreshSchedule();
    stripUi?.render?.();
    // GH-710 review r5 P2 (ADDITIVE): the plan-write broadcast — share.js's
    // own address-bar link encodes the LIVE session's plan (`&cp=`) and
    // drops itself when that plan's bytes move (content-addressed on its
    // side; `restore` rides along for readers that want to tell a seed
    // from an edit). Fire-and-forget: no listener, no effect.
    try {
      window.dispatchEvent(new CustomEvent('ob:cameraplan',
        { detail: { rev: pb.planRev, restore, session: pb.meta?.id ?? null } }));
    } catch { /* no CustomEvent / no window */ }
    // GH-314 (D-lite): a USER plan edit while PAUSED expands the resting
    // sliver — an edit reveals the editing surface it just wrote into
    // (writeCut/deleteCut/setTransition/writePose: the pill taps, seam
    // drags and picker actions). While PLAYING a pill tap deliberately
    // does NOT expand (a quick re-cam keeps the immersive register), and
    // a wholesale RESTORE (the GH-302 decoded share seed / the setCutPlan
    // seam) never does — a share viewer opens on the resting sliver, the
    // same register a camLatch reopen gets. Feature-detected: a stale
    // strip has no setExpanded and keeps its build-15 always-expanded
    // lane.
    if (!restore && !pb.playing) {
      // GH-361: the expansion is a SIDE EFFECT of the edit (auto) — it
      // rests on resume instead of latching the strip pin forever (the
      // build-16 device defect: one paused tile tap and the immersive
      // console never auto-hid nor tap-dismissed again). A stale strip
      // ignores the extra argument and keeps its shipped latch.
      try {
        stripUi?.seams?.setExpanded?.(true, { auto: true });
      } catch { /* stale strip */ }
    }
  }
  /** The ruling camera at (seg, tCs) over an arbitrary cut ARRAY (the
   * writers validate candidate plans before committing them). */
  function readCam(cuts, seg, tCs) {
    let best = null;
    for (const c of cuts) {
      if (c.seg < seg || (c.seg === seg && c.t <= tCs)) best = c;
      else break;
    }
    const hit = best ?? cuts[0] ?? null;
    return hit ? hit.cam : 0;
  }
  /** §1.5 edit-time grammar for a MID-SEGMENT anchor: it may neither
   * target a dynamic rig nor leave a dynamic-ruled span mid-segment (every
   * seam adjacent to a chase/POV span sits at t = 0). `all` is the WHOLE
   * candidate plan INCLUDING `c` — the ruling-before read must see §1.2's
   * backfill exactly as cameraAt will (when c IS the first cut, the span
   * before it wears c's own cam by backfill, so the seam is same-cam and
   * trivially legal — evaluating over a c-less array mis-read the NEXT
   * cut's cam as the predecessor). */
  function midCutLegal(c, all) {
    if (c.t === 0) return true;
    if (isDynamicCamId(c.cam)) return false;
    return !isDynamicCamId(readCam(all, c.seg, c.t - 1));
  }
  /** The ONE cut writer (§1.1): `cut` carries SECONDS, the model stores
   * integer centiseconds (quantize-at-save). Duplicate (seg, t) anchors =
   * last write wins; caps enforced; §1.5 enforced at write time — dynamic
   * targets pin to t = 0 and sweep their span's mid-segment anchors, an
   * illegal mid-segment write into a dynamic span is REFUSED (null).
   * `opts.replace` names the cut object a seam drag or block re-target is
   * MOVING; `opts.drag` marks the seam drag's CONTINUING write stream
   * (GH-324: only that stream refuses an occupied target anchor); a
   * `opts.degenerate` write (pill tap / setCam — §1.3) keeps the GH-299
   * walk default: a POV boundary anchor beside a POV exit seams as MOVE.
   * Returns the stored cut object, or null on refusal. */
  /** Canonicalize a (seg, tCs) anchor: an anchor landing EXACTLY on the
   * segment's end grid line IS the next boundary — it canonicalizes to
   * (seg+1, 0) so the compiler/fade filters (which treat a segment's end
   * as exclusive) can never orphan it (review r5 P2); the FINAL segment
   * pins one grid step inside instead (an anchor at the absolute timeline
   * end cuts nothing). */
  function canonAnchor(seg, tCs) {
    const endCs = qCs(pb.durs[seg]);
    if (tCs < endCs) return { seg, t: tCs };
    if (seg + 1 < pb.recs.length) return { seg: seg + 1, t: 0 };
    return { seg, t: Math.max(0, endCs - 1) };
  }
  function writeCut(cut, opts = {}) {
    if (!pb) return null;
    const seg0 = Math.min(Math.max(0, cut.seg | 0), pb.recs.length - 1);
    const at = canonAnchor(seg0, Math.min(qCs(cut.t), qCs(pb.durs[seg0])));
    const seg = at.seg;
    const c = {
      seg,
      t: at.t,
      cam: Math.max(0, cut.cam | 0),
      transitionIn: Math.max(0, cut.transitionIn | 0),
      dur: Math.min(qCs(cut.dur ?? 0), FADE_CAP_CS),
    };
    if (isDynamicCamId(c.cam)) c.t = 0; // whole-segment law (§1.5)
    // dur canonicalization (review r6 P2): only fades carry one — a fade
    // written without a duration takes the picker's 1.00 s default
    if (c.transitionIn !== 2) c.dur = 0;
    else if (!(c.dur > 0)) c.dur = 100;
    // GH-324: the seam drag's CONTINUING write stream (opts.drag, set by
    // the strip's dragSeamTo beside opts.replace) must never DESTROY
    // another cut. Pre-fix the duplicate-anchor filter below silently
    // swallowed the cut anchored on a shot boundary the instant a dragged
    // seam snapped onto it — a continuing drag THROUGH the snap zone
    // deleted it with no gesture ending and no way back (losing a POV/
    // CHASE cut also rescales the timeline under the pointer). An occupied
    // target anchor now REFUSES the drag step (null): the dragged seam
    // holds its last anchor and no other cut is touched. Deletion stays an
    // EXPLICIT act — the picker's Remove or the long-press. EXPLICIT
    // one-shot writes keep §1.1 last-write-wins re-cam semantics: pill
    // taps / setCam / insertAtPlayhead (no `replace`) AND the selected-
    // block re-target (`replace` without `drag` — review round-1 P2: a
    // mid-segment block re-cammed to a DYNAMIC rig canonicalizes onto
    // (seg, 0), and that deliberate tap must win an occupied boundary,
    // never be silently consumed). A stale strip passing only `replace`
    // degrades to its own build-15 gesture semantics — honest pairing.
    if (opts.drag && pb.plan.cuts.some((x) => x !== opts.replace
      && x.seg === c.seg && x.t === c.t)) return null;
    let cuts = pb.plan.cuts.filter((x) => x !== opts.replace
      && !(x.seg === c.seg && x.t === c.t));
    if (!midCutLegal(c, [...cuts, c]
      .sort((a, b) => (a.seg - b.seg) || (a.t - b.t)))) return null;
    if (isDynamicCamId(c.cam)) {
      // the dynamic span swallows its segments' mid-segment anchors
      // (edit-time normalization: the write is one-gesture user intent and
      // the engine must never see a seam leaving a dynamic rig mid-segment)
      const nextBoundary = cuts.reduce((m, y) =>
        (y.t === 0 && y.seg > seg ? Math.min(m, y.seg) : m), Infinity);
      cuts = cuts.filter((x) => !(x.t > 0 && x.seg >= seg
        && x.seg < nextBoundary));
    }
    if (cuts.length + 1 > CUT_MAX) return null; // §1.5 model cap
    cuts.push(c);
    cuts.sort((a, b) => (a.seg - b.seg) || (a.t - b.t));
    if (opts.degenerate && c.t === 0 && c.cam === 2 && c.transitionIn === 0) {
      // GH-299 semantics preserved through the degenerate write (§1.3 +
      // §1.5): a POV assignment landing where the previous segment EXITS
      // POV keeps the walk — the seam defaults to MOVE (the picker can
      // still hard-cut/fade it explicitly).
      if (seg > 0
        && appliedCamId(readCam(cuts, seg - 1, qCs(pb.durs[seg - 1]) + 1)) === 2) {
        c.transitionIn = 1;
      }
      // …and the mirrored default for the NEXT boundary when this write
      // makes that pair POV→POV over a still-degenerate seam
      const j = cuts.indexOf(c);
      const n = cuts[j + 1];
      if (n && n.t === 0 && n.cam === 2 && n.transitionIn === 0
        && n.dur === 0) n.transitionIn = 1;
    }
    pb.plan.cuts = cuts;
    planChanged();
    return c;
  }
  /** Delete cut i — the block merges into its predecessor (§3.2). The
   * merged predecessor span may be DYNAMIC (review GH-301 round-1 P1):
   * mid-segment anchors the extended span now rules go with the deleted
   * seam (writeCut's sweep law — the engine never sees a seam leaving a
   * dynamic rig mid-segment). Bounded re-sweep: dropping one anchor can
   * expose the next. */
  function deleteCut(i) {
    if (!pb || !pb.plan.cuts[i]) return false;
    const cuts = pb.plan.cuts.filter((_, k) => k !== i);
    for (let guard = 0; guard < CUT_MAX; guard++) {
      const bad = cuts.findIndex((c) => !midCutLegal(c, cuts));
      if (bad < 0) break;
      cuts.splice(bad, 1);
    }
    pb.plan.cuts = cuts;
    planChanged();
    return true;
  }
  /** Seam transition write (§1.1): move stores dur 0 (DERIVED — the GH-299
   * walk law owns the duration; the stored value is advisory-max), fade
   * durs clamp to (0, 5.00] on the 10 ms grid. */
  function setTransition(i, trans, durSec) {
    if (!pb || !pb.plan.cuts[i]) return false;
    const c = pb.plan.cuts[i];
    c.transitionIn = Math.max(0, trans | 0);
    c.dur = c.transitionIn === 2
      ? Math.min(FADE_CAP_CS, Math.max(1, qCs(durSec ?? 1))) : 0;
    planChanged();
    return true;
  }
  /** Tripod pose write (§1.1 quantize-at-save): metres/degrees in, INTEGER
   * millimetres/decidegrees stored — exactly the numbers camerascript pose
   * moves consume after the /1000 · /10 read-back. */
  function writePose(slot, pose) {
    if (!pb || !(slot >= 0 && slot < SLOT_MAX)) return false;
    const mm = (v) => Math.round(v * 1000);
    if (pose?.fov !== undefined && pose?.fov !== null
      && !Number.isFinite(pose.fov)) return false; // pre-clamp gate (r10)
    const p = { slot: slot | 0,
      eye: (pose?.eye ?? []).map(mm), look: (pose?.look ?? []).map(mm),
      fov: Math.min(1790, Math.max(10, Math.round((pose?.fov ?? 60) * 10))) };
    if (p.eye.length !== 3 || p.look.length !== 3
      || ![...p.eye, ...p.look, p.fov].every(Number.isFinite)) return false;
    pb.plan.poses = pb.plan.poses.filter((x) => x.slot !== p.slot);
    pb.plan.poses.push(p);
    pb.plan.poses.sort((a, b) => a.slot - b.slot);
    planChanged();
    return true;
  }
  /** The __playback.setCutPlan seam: validate + quantize a WHOLE plan
   * (cuts carry seconds; poses carry the stored integer mm/dd shape).
   * Structural illegality — over-cap, non-finite, a mid-segment cut into a
   * dynamic span (§1.5) — REFUSES the whole plan (false): the edit-time
   * law, so the engine never sees an illegal plan. Unknown cam/transition
   * IDS are legal (they degrade at apply time, §1.4). */
  function setPlanChecked(input) {
    if (!pb || typeof input !== 'object' || input === null) return false;
    const rawCuts = Array.isArray(input.cuts) ? input.cuts : [];
    const rawPoses = Array.isArray(input.poses) ? input.poses : [];
    if (rawCuts.length > CUT_MAX || rawPoses.length > SLOT_MAX) return false;
    const poses = [];
    for (const x of rawPoses) {
      if (!(x?.slot >= 0 && x.slot < SLOT_MAX)) return false;
      // RAW finiteness BEFORE the clamp (review r10 P2): Infinity would
      // clamp into range and defeat the documented edit-time rejection
      if (x.fov !== undefined && x.fov !== null
        && !Number.isFinite(x.fov)) return false;
      // non-array eye/look must REFUSE, never throw (review r11 P2 — the
      // validation contract on decoded/stale presentation data)
      if (!Array.isArray(x.eye) || !Array.isArray(x.look)) return false;
      const p = { slot: x.slot | 0,
        eye: x.eye.map((v) => Math.round(v)),
        look: x.look.map((v) => Math.round(v)),
        fov: Math.min(1790, Math.max(10, Math.round(x.fov ?? 600))) };
      // fov joins the finite gate (review r3 P2): a malformed pose fov
      // rides NaN through min/max and the armed script would reject at
      // export time — refuse the plan at the EDIT-time door instead
      if (p.eye.length !== 3 || p.look.length !== 3
        || ![...p.eye, ...p.look, p.fov].every(Number.isFinite)) return false;
      if (poses.some((y) => y.slot === p.slot)) return false;
      poses.push(p);
    }
    poses.sort((a, b) => a.slot - b.slot);
    const cuts = [];
    for (const x of rawCuts) {
      if (!Number.isInteger(x?.seg) || x.seg < 0 || x.seg >= pb.recs.length
        || !Number.isFinite(x?.t)) return false;
      // dur joins the finite gate (review r6 P2): a NaN would ride qCs into
      // the model, and a FADE with dur 0 would display as a fade evalAlpha
      // and savePlan rightly skip — reject the malformation, canonicalize
      // non-fade durs to 0.
      if (x.dur !== undefined && x.dur !== null
        && !Number.isFinite(x.dur)) return false;
      const at = canonAnchor(x.seg, Math.min(qCs(x.t), qCs(pb.durs[x.seg])));
      const c = { seg: at.seg,
        t: at.t,
        cam: Math.max(0, x.cam | 0),
        transitionIn: Math.max(0, x.transitionIn | 0),
        dur: Math.min(qCs(x.dur ?? 0), FADE_CAP_CS) };
      if (c.transitionIn === 2 && !(c.dur > 0)) return false;
      if (c.transitionIn !== 2) c.dur = 0;
      if (isDynamicCamId(c.cam) && c.t !== 0) return false; // §1.5, strict
      const dup = cuts.findIndex((y) => y.seg === c.seg && y.t === c.t);
      if (dup >= 0) cuts.splice(dup, 1); // duplicate anchor: last write wins
      cuts.push(c);
    }
    cuts.sort((a, b) => (a.seg - b.seg) || (a.t - b.t));
    // §1.5 across the WHOLE candidate: no seam may leave a dynamic span
    // mid-segment (covers inherited dynamic spans too; the read includes
    // the cut itself so §1.2's backfill is honored — midCutLegal's law)
    const posesBak = pb.plan.poses;
    pb.plan.poses = poses; // appliedCamId below reads slot occupancy
    const legal = cuts.every((c) => midCutLegal(c, cuts));
    if (!legal) { pb.plan.poses = posesBak; return false; }
    pb.plan.cuts = cuts;
    // restore semantics (GH-314): a wholesale plan replacement is a
    // SEED (the GH-302 decoded share plan / the e2e seam), not a user
    // edit — the D-lite sliver must not expand under a share viewer's
    // feet (planChanged's restore doc)
    planChanged({ restore: true });
    return true;
  }

  // chase-CLASS = the __track moving rig (GH-275 fix: the old `preset !==
  // 'string'` test classified EVERY non-string preset as chase, which
  // would send the POV script down renderAtT's chase scrub-reseed branch)
  const isChaseId = (id) =>
    !!(CAMS.find((c) => c.id === id) ?? CAMS[0]).preset?.track;

  /** Deterministic chase eye for segment i, kernel-frame `[kx, ky, h]`
   * (the `__track.start` cam field; cameratrack.js header convention
   * three.x = k.y / three.y = h / three.z = k.x). Mirrors the broadcast
   * 'side' framing's eye — low behind the short rail nearest the CUE —
   * computed from PURE RECORD DATA (the segment record's initial cue pos)
   * + the active table dims, so the seed is a function of the SEGMENT,
   * never of scrub history (GH-273: the pre-fix rig inherited
   * `camera.position`, so re-entering a chase segment framed it from
   * wherever the last scrub happened to leave the camera). NOT physics:
   * reads recorded initial state only. null = unreadable record (stale
   * shape) → the rig's own eye-inherit degrade. */
  /** The record's own struck-ball id (GH-383, review r1 P2: carom seat-2
   * records strike ball 1 — every record-based camera planner frames the
   * STRUCK ball, not literal id 0; the Strike event is the truth). */
  function recCueId(rec) {
    const k = rec?.events?.[0]?.kind;
    return (k && typeof k !== 'string' && Number.isFinite(k.Strike?.ball))
      ? k.Strike.ball : 0;
  }
  function chaseEye(i) {
    try {
      const rec0 = pb?.recs?.[i];
      const cue = rec0?.initial?.balls?.find((b) => b.id === recCueId(rec0));
      const ky = Number(cue?.state?.pos?.y);
      if (!Number.isFinite(ky)) return null;
      // 2.54 = the 9-ft baseline (scene/table.js TABLE.length; the leaf
      // law forbids importing it) — camerapresets.js 'side' scale mirror
      const L = Number(game.template?.system?.table?.length) || 2.54;
      const scale = Math.max(1, L / 2.54);
      return [0, (ky >= 0 ? 1 : -1) * (L / 2 + 0.95 * scale), 0.34 * scale];
    } catch { return null; }
  }

  // ---- POV "address then rise" (GH-275, owner decision B) --------------------
  // tImpact for segment record `rec`: the first BallBall event's t, else
  // the first CUE BallLinearCushion's t, else 0.5 s — the decision
  // comment's fallback ladder. Reads recorded event TIMES only (the
  // drills.js/preview-compute.js event-read pattern), never physics.
  // A matched event with a NON-FINITE t (malformed record) takes the same
  // 0.5 s default as a no-event record (review nit): povScript validates
  // only the cue pose + phi, so an unguarded NaN rode into the moves spec,
  // camerascript rejected it at arm time, and an EXPORT threw the honest
  // stale-module error about what is actually bad data — arm 12g.
  function povTImpact(rec) {
    const evs = rec?.events ?? [];
    for (const e of evs) {
      const k = e?.kind;
      if (k && typeof k !== 'string' && k.BallBall) {
        return Number.isFinite(e.t) ? e.t : 0.5;
      }
    }
    const cueId = recCueId(rec); // GH-383: the record's struck ball
    for (const e of evs) {
      const k = e?.kind;
      if (k && typeof k !== 'string' && k.BallLinearCushion?.ball === cueId) {
        return Number.isFinite(e.t) ? e.t : 0.5;
      }
    }
    return 0.5;
  }

  /** camerascript.js moves spec for the POV preset over segment record
   * `rec` — the pose math VERBATIM from the GH-275 owner decision:
   * A-identical address until tImpact+0.3 s (eye = cue0 − 1.05·d raised
   * 0.36, or higher by povpose.js's class A-rise lift where the
   * record-bound rod would pass too close to that eye; look = cue0 +
   * 1.40·d at ball height, fov 60; d from
   * record.shot.phi), then ONE C2-smootherstep rise over 1.4 s to a
   * standing eye at cue0 − 1.75·d, world h 0.81 (FLOOR-relative 1.60 m —
   * bed-relative heights collide with the y=1.02 lamp canopy, proven by
   * capture), watching the table centroid [0, 0, 0.02]. The rig holds the
   * end pose past t1 (the free settle tail) and re-poses on every 'frame'
   * emission, so the pose is a pure function of the render clock t, record
   * data and shipped code, with no live-state read — scrub-safe by
   * construction (GH-273 render-clock law)
   * and the ONE builder both the live tap and savePlan consume (WYSIWYG).
   * Kernel-frame [kx, ky, h] arrays (the camerascript header convention;
   * d three-frame (sinφ, 0, cosφ) = kernel (cosφ, sinφ)). NOT physics:
   * reads the recorded initial cue pose, shot.phi, event times and the
   * record-bound rod (povRod) only.
   * null = unreadable record (stale shape) — the live arm degrades to the
   * previous framing and savePlan falls back to the broadcast preset. */
  function povScript(rec) {
    const a = povAnchors(rec);
    if (!a) return null;
    const tRise = a.ti + 0.3;
    return { moves: [
      { kind: 'pose', t0: 0, t1: tRise,
        cam: a.addrCam, look: a.addrLook, fov: POV_FOV },
      { kind: 'dolly', t0: tRise, t1: tRise + 1.4, ease: 'smoother',
        fov: POV_FOV,
        path: [{ cam: a.addrCam, look: a.addrLook },
          { cam: a.standCam, look: a.standLook }] },
    ] };
  }
  const POV_FOV = 60; // the decision comment's address/rise projection

  // GH-911 (C3 site 7): rec's record-bound rod, the pb.rods row at rec's
  // pb.recs index; null for a record outside pb.recs or a null row (I1(ii)).
  function povRod(rec) { const i = pb?.recs?.indexOf(rec) ?? -1; return i >= 0 ? pb.rods?.[i] ?? null : null; }

  /** The GH-275 POV anchor set for record `rec` — the ONE pose-math source
   * povScript and the GH-299 walk builder both consume (expressions verbatim
   * from the owner decision, so the refactor is byte-identical to the
   * pre-299 povScript). null = unreadable record (stale shape). */
  function povAnchors(rec) {
    try {
      const ball = rec?.initial?.balls
        ?.find((b) => b.id === recCueId(rec)); // GH-383
      const p = ball?.state?.pos;
      const phi = Number(rec?.shot?.phi);
      if (!p || ![p.x, p.y, p.z, phi].every(Number.isFinite)) return null;
      const pose = pb?.povLeaf?.povPose?.(ball, phi, povRod(rec)) ?? null;
      return pose ? { ti: povTImpact(rec), ...pose } : null;
    } catch { return null; }
  }

  // ---- GH-299: the one-take WALK-BEAT builder ---------------------------------
  // Ported from the round-2.1 validated prototype (Drive pack
  // preview-299r2-walk-2026-08-01/harness-r21/inject21.js — owner-approved
  // on the r21 clips): rail-following ring path (play rect ⊕ WALK_CLEAR,
  // shorter side around, structurally never over the bed), aim-line exit
  // with the last-35% step-in along the shot line, C2 trapezoid speed,
  // monotonic eye height, rate-budgeted C2 gaze sweep (≤ 90 deg/s predicted
  // peak) with the ROUND-2.1 ARRIVAL LOCK — over the final lean-in
  // (arc-u ≥ 0.65) the look POINT C2-blends onto the SHIPPED address look
  // target (cue0 + 1.40·d at ball height), settled before the beat ends.
  // PURE functions of record data + constants (no live state, no playhead):
  // deterministic and playhead-independent by construction.
  const wS = (u) => (u <= 0 ? 0 : u >= 1 ? 1
    : u * u * u * (u * (6 * u - 15) + 10)); // C2 smootherstep, clamped
  // antiderivative of smootherstep on [0,1]: wIS(1) = 0.5
  const wIS = (u) => ((u <= 0) ? 0 : (u >= 1) ? 0.5
    : u * u * u * u * (u * (u - 3) + 2.5));
  const lerp3 = (A, B, t) => [A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];

  /** Rig pose of `rec`'s POV script at local time tExit (closed form —
   * prevEndPose in the prototype): the walk's departure pose. */
  function prevEndPose(rec, tExit) {
    const a = povAnchors(rec);
    if (!a) return null;
    const tRise = a.ti + 0.3;
    if (tExit <= tRise) return { cam: a.addrCam, look: a.addrLook };
    const s = wS(Math.min(1, (tExit - tRise) / 1.4));
    return { cam: lerp3(a.addrCam, a.standCam, s),
      look: lerp3(a.addrLook, a.standLook, s) };
  }

  /** GH-315: povScript with its motion CLIPPED at `exitT` — the base spec
   * for a segment whose record ends (or whose export exit is trimmed)
   * INSIDE its own POV motion when a rise-carrying walk beat follows
   * (beatFor's rise-incomplete class). The rendered trajectory on
   * [0, exitT] is the shipped GH-275 curve exactly; a shorter smoother
   * dolly would re-ease over the clipped window (wrong speed profile), so
   * the clipped rise is WAYPOINTED on the 60 Hz frame grid with linear
   * legs — the walk-path convention, and the same sub-leg lerp the rig
   * renders anyway. Clipping exists so the appended beat moves can start
   * AT the exit without violating camerascript's no-overlap law; segments
   * whose rise completes keep the shipped povScript byte-identical (the
   * arm-3h plan-stability law). null = unreadable record. */
  function povScriptClipped(rec, exitT) {
    const a = povAnchors(rec);
    if (!a || !Number.isFinite(exitT) || exitT <= 0) return null;
    const tRise = a.ti + 0.3;
    if (exitT <= tRise) {
      return { moves: [{ kind: 'pose', t0: 0, t1: exitT,
        cam: a.addrCam, look: a.addrLook, fov: POV_FOV }] };
    }
    const K = Math.max(2, Math.round((exitT - tRise) * 60));
    const path = [];
    for (let j = 0; j <= K; j++) {
      const s = wS(((j / K) * (exitT - tRise)) / 1.4);
      path.push({ cam: lerp3(a.addrCam, a.standCam, s),
        look: lerp3(a.addrLook, a.standLook, s) });
    }
    return { moves: [
      { kind: 'pose', t0: 0, t1: tRise,
        cam: a.addrCam, look: a.addrLook, fov: POV_FOV },
      { kind: 'dolly', t0: tRise, t1: exitT, fov: POV_FOV, path },
    ] };
  }

  /** The walk ring for play half-dims (hxp, hyp): play rect ⊕
   * disc(WALK_CLEAR), arc-length parameterized CCW from s=0 at
   * (hxp+CLEAR, −hyp). Cached per table dims (records carry them). */
  const walkRings = new Map();
  function ringFor(hxp, hyp) {
    const key = `${hxp}|${hyp}`;
    let ring = walkRings.get(key);
    if (ring) return ring;
    const R = WALK_CLEAR, q = Math.PI / 2 * R;
    const pieces = [];
    let s = 0;
    const add = (len, fn) => { pieces.push({ s0: s, len, fn }); s += len; };
    add(2 * hyp, (u) => [hxp + R, -hyp + u * 2 * hyp]);          // right
    add(q, (u) => { const a = u * Math.PI / 2;                    // TR corner
      return [hxp + R * Math.cos(a), hyp + R * Math.sin(a)]; });
    add(2 * hxp, (u) => [hxp - u * 2 * hxp, hyp + R]);            // top
    add(q, (u) => { const a = Math.PI / 2 + u * Math.PI / 2;      // TL corner
      return [-hxp + R * Math.cos(a), hyp + R * Math.sin(a)]; });
    add(2 * hyp, (u) => [-(hxp + R), hyp - u * 2 * hyp]);         // left
    add(q, (u) => { const a = Math.PI + u * Math.PI / 2;          // BL corner
      return [-hxp + R * Math.cos(a), -hyp + R * Math.sin(a)]; });
    add(2 * hxp, (u) => [-hxp + u * 2 * hxp, -(hyp + R)]);        // bottom
    add(q, (u) => { const a = 3 * Math.PI / 2 + u * Math.PI / 2;  // BR corner
      return [hxp + R * Math.cos(a), -hyp + R * Math.sin(a)]; });
    const perim = s;
    const ringPoint = (sig) => {
      const x = ((sig % perim) + perim) % perim;
      for (const pc of pieces) {
        if (x <= pc.s0 + pc.len + 1e-12) return pc.fn((x - pc.s0) / pc.len);
      }
      return pieces[0].fn(0);
    };
    const sOf = (cx, cy, nx, ny) => {
      const onX = Math.abs(cx) === hxp, onY = Math.abs(cy) === hyp;
      if (onX && onY) { // corner arc
        let a = Math.atan2(ny, nx);
        if (a < 0) a += 2 * Math.PI;
        if (cx === hxp && cy === hyp) return pieces[1].s0 + (a / (Math.PI / 2)) * q;
        if (cx === -hxp && cy === hyp) {
          return pieces[3].s0 + ((a - Math.PI / 2) / (Math.PI / 2)) * q;
        }
        if (cx === -hxp && cy === -hyp) {
          return pieces[5].s0 + ((a - Math.PI) / (Math.PI / 2)) * q;
        }
        if (a < Math.PI) a += 2 * Math.PI; // BR range is [3π/2, 2π]
        return pieces[7].s0 + ((a - 3 * Math.PI / 2) / (Math.PI / 2)) * q;
      }
      if (nx > 0.5) return pieces[0].s0 + ((cy + hyp) / (2 * hyp)) * pieces[0].len;
      if (nx < -0.5) return pieces[4].s0 + ((hyp - cy) / (2 * hyp)) * pieces[4].len;
      if (ny > 0.5) return pieces[2].s0 + ((hxp - cx) / (2 * hxp)) * pieces[2].len;
      return pieces[6].s0 + ((cx + hxp) / (2 * hxp)) * pieces[6].len;
    };
    /** arc position s of the ring point nearest [x, y]. Exterior/boundary:
     * radial from the clamped rect point. Interior: nearest edge,
     * deterministic tie order +x, -x, +y, -y. */
    const ringS = (x, y) => {
      let cx = Math.min(hxp, Math.max(-hxp, x));
      let cy = Math.min(hyp, Math.max(-hyp, y));
      let dx = x - cx, dy = y - cy;
      if (dx === 0 && dy === 0) {
        const cand = [
          [hxp - x, 1, 0, hxp, cy], [hxp + x, -1, 0, -hxp, cy],
          [hyp - y, 0, 1, cx, hyp], [hyp + y, 0, -1, cx, -hyp]];
        let best = cand[0];
        for (const c of cand) if (c[0] < best[0] - 1e-12) best = c;
        dx = best[1]; dy = best[2]; cx = best[3]; cy = best[4];
      }
      const L = Math.hypot(dx, dy);
      return sOf(cx, cy, dx / L, dy / L);
    };
    const distRect = (x, y) => {
      const dx = Math.max(0, Math.abs(x) - hxp), dy = Math.max(0, Math.abs(y) - hyp);
      return Math.hypot(dx, dy);
    };
    const insideRing = (x, y) => distRect(x, y) < WALK_CLEAR;
    /** aim-line exit: march back from addrCam along −aim until outside the
     * ring, then 40-iteration bisection. If addrCam is already outside the
     * ring, fall back to its nearest ring point. Deterministic. */
    const aimExit = (a) => {
      const p = a.addrCam, b = [-a.d[0], -a.d[1]];
      if (!insideRing(p[0], p[1])) {
        const s1 = ringS(p[0], p[1]);
        return { s1, exit: ringPoint(s1) };
      }
      let k0 = 0, k1 = 0;
      for (let k = 0.01; k <= 6; k += 0.01) {
        if (!insideRing(p[0] + b[0] * k, p[1] + b[1] * k)) { k1 = k; k0 = k - 0.01; break; }
      }
      if (k1 === 0) { const s1 = ringS(p[0], p[1]); return { s1, exit: ringPoint(s1) }; }
      for (let i = 0; i < 40; i++) {
        const m = (k0 + k1) / 2;
        if (insideRing(p[0] + b[0] * m, p[1] + b[1] * m)) k0 = m; else k1 = m;
      }
      const k = (k0 + k1) / 2;
      const e = [p[0] + b[0] * k, p[1] + b[1] * k];
      return { s1: ringS(e[0], e[1]), exit: e };
    };
    ring = { perim, ringPoint, ringS, insideRing, aimExit };
    walkRings.set(key, ring);
    return ring;
  }

  const WALK_GRID = 800; // fixed arc-table grid (determinism: pure arithmetic)

  /** Build the walk for the boundary prevRec→rec: hold pose P0 (the rig at
   * prevExitT), waypointed dolly path in BEAT-LOCAL time, quantized beat
   * length (contract (1): beatSec = 0.3 + max(0.6, pathLen/v), quantized
   * round(beatSec·60)/60 so live and export agree exactly). `o.noLock`
   * disables the round-2.1 gaze arrival lock — the e2e red-proof knob, no
   * production caller passes it. null = unreadable records (hard-cut
   * degrade). */
  function buildWalk(prevRec, prevExitT, rec, vWalk = WALK_V, o = {}) {
    const P0 = prevEndPose(prevRec, prevExitT);
    const a = povAnchors(rec);
    if (!P0 || !a) return null;
    const tbl = rec?.initial?.table;
    const hxp = (Number(tbl?.width) > 0 ? tbl.width : 1.27) / 2;
    const hyp = (Number(tbl?.length) > 0 ? tbl.length : 2.54) / 2;
    const ring = ringFor(hxp, hyp);
    const P1 = { cam: a.addrCam, look: a.addrLook };
    const s0 = ring.ringS(P0.cam[0], P0.cam[1]);
    const r0 = ring.ringPoint(s0);
    const { s1, exit } = ring.aimExit(a);
    const D0 = [P0.cam[0] - r0[0], P0.cam[1] - r0[1]];
    const D1 = [P1.cam[0] - exit[0], P1.cam[1] - exit[1]];
    // side selection: shorter way around; tie → CCW (+s). Ring travel is
    // structurally bed-free (the ring is WALK_CLEAR outside the cushions).
    const raw = ((s1 - s0) % ring.perim + ring.perim) % ring.perim;
    const ds = (raw <= ring.perim - raw + 1e-12) ? raw : raw - ring.perim;
    const z0 = P0.cam[2], z1 = P1.cam[2];
    // composite curve C(u): ring travel + C2 deviation blends + monotone z
    const C = (u) => {
      const rp = ring.ringPoint(s0 + ds * u);
      const w0 = 1 - wS(u / 0.3);
      const w1 = wS((u - 0.65) / 0.35);
      return [rp[0] + D0[0] * w0 + D1[0] * w1,
        rp[1] + D0[1] * w0 + D1[1] * w1,
        z0 + (z1 - z0) * wS((u - 0.3) / 0.7)]; // monotonic, no bob
    };
    // arc-length table over the fixed grid
    const M = WALK_GRID;
    const pts = [], cum = [0];
    for (let i = 0; i <= M; i++) pts.push(C(i / M));
    for (let i = 1; i <= M; i++) {
      const A = pts[i - 1], B = pts[i];
      cum.push(cum[i - 1] + Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]));
    }
    const len = cum[M];
    const invLen = (sig) => { // arc position → u (monotone table inverse)
      if (sig <= 0) return 0;
      if (sig >= len) return 1;
      let lo = 0, hi = M;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] <= sig) lo = m; else hi = m;
      }
      const f = (sig - cum[lo]) / (cum[hi] - cum[lo]);
      return (lo + f) / M;
    };
    // gaze: a rate-budgeted C2 DIRECTION sweep leading the body (the round-2a
    // finding: blending 3D lead points spiked pan to 160-230 deg/s when a
    // target passed near the camera path — translation leaked into rotation).
    // Yaw/pitch sweep from the settle-watch direction to the new aim-line
    // direction, monotone C2, advancing at the fastest rate that keeps the
    // predicted peak pan ≤ 90 deg/s (peak = 1.875·|dYaw|·adv/T), advance
    // capped at 1.3. The ROUND-2.1 ARRIVAL LOCK then blends the look POINT
    // onto the shipped address look target over the final lean-in.
    // (Computed BEFORE the walk time: the sweep also FLOORS it below.)
    const gazeOf = (P) => {
      const g = [P.look[0] - P.cam[0], P.look[1] - P.cam[1],
        P.look[2] - P.cam[2]];
      const h = Math.hypot(g[0], g[1]);
      return { yaw: Math.atan2(g[1], g[0]), pitch: Math.atan2(g[2], h) };
    };
    const G0 = gazeOf(P0), G1 = gazeOf(P1);
    let dyawG = G1.yaw - G0.yaw;
    while (dyawG > Math.PI) dyawG -= 2 * Math.PI;
    while (dyawG < -Math.PI) dyawG += 2 * Math.PI;
    // near-180 swings rotate WITH the ring travel (deterministic side law)
    if (Math.abs(dyawG) > Math.PI * 170 / 180
      && Math.sign(dyawG) !== Math.sign(ds) && ds !== 0) {
      dyawG -= Math.sign(dyawG) * 2 * Math.PI;
    }
    const BUDGET = Math.PI / 2; // 90 deg/s predicted-peak gaze budget
    // quantized beat length (contract (1)); everything downstream consumes
    // the QUANTIZED walk time so live windows and export tail frames agree.
    // The THIRD max term is the TURN floor (review GH-299 round-1 P1): a
    // short walk with a large view-direction change — the two address eyes
    // near each other, the aim line swung across the room — would otherwise
    // whip the sweep past the budget (adv floors at 1, so the predicted
    // peak 1.875·|dYaw|/T exceeds 90 deg/s the moment T < 1.875·|dYaw|/
    // BUDGET; a ~90° sweep over the 0.6 s minimum predicts ~281 deg/s).
    // A real person turning in place takes time exactly like one walking —
    // the prototype's own ruling: "never exceed the budget". The floor
    // never binds on the owner-approved corpus (worst 155.4°: 3.24 s <
    // the 3.68 s path time; mild: 0.60 < 1.31).
    const dpitchG = G1.pitch - G0.pitch;
    /** The walk at floor time `floorT` (quantized to the frame grid). All
     * T-dependent pieces live here so the MEASURED-peak enforcement below
     * can lengthen the walk and rebuild — pure in floorT. */
    const turnT = 1.875 * Math.abs(dyawG) / BUDGET; // the 90 deg/s floor
    const buildAt = (floorT) => {
      let beatSec = Math.round((BEAT_HOLD + floorT) * 60) / 60;
      // round() may dip T up to half a frame UNDER the requested floor —
      // harmless for the path/min floors (8 ms of walk), but the TURN
      // floor is the 90 deg/s budget invariant itself (review round-4 P2:
      // a 1.004 s floor quantized to 1.000 s ships a 90.4 deg/s sweep) —
      // bump one frame rather than undercut it. Never binds on the
      // approved corpus (both boundaries are path-floored).
      if (beatSec - BEAT_HOLD < turnT - 1e-12) {
        beatSec = (Math.round((BEAT_HOLD + floorT) * 60) + 1) / 60;
      }
      const T = beatSec - BEAT_HOLD;
      // C2 trapezoid speed profile: smootherstep ramps, cruise between.
      // Ramp fraction bounded so peak speed stays near v_walk (avg/(1−rho)):
      // an unbounded ease-in/out doubled the peak on short walks (jog read).
      const rho = Math.min(0.35, Math.max(0.15, 0.35 / T));
      const prof = (x) => {
        const c = Math.min(1, Math.max(0, x));
        let pos;
        if (c < rho) pos = rho * wIS(c / rho);
        else if (c <= 1 - rho) pos = rho * 0.5 + (c - rho);
        else pos = (1 - rho) - rho * wIS((1 - c) / rho);
        return pos / (1 - rho);
      };
      // with the turn floor below, BUDGET·T/(1.875·|dYaw|) ≥ 1 always, so
      // this `max(1, ·)` never lies and the predicted peak stays ≤ BUDGET
      const adv = Math.min(1.3, Math.max(1,
        BUDGET * T / (1.875 * Math.max(1e-6, Math.abs(dyawG)))));
      // arrival-lock instants as TIME fractions: the arc marks (arc-u 0.65
      // = lean-in start, arc-u 0.90) mapped through the fixed arc table +
      // the monotone speed profile (40-iteration bisection — pure)
      const profInv = (p) => {
        let lo = 0, hi = 1;
        for (let i = 0; i < 40; i++) {
          const m2 = (lo + hi) / 2;
          if (prof(m2) <= p) lo = m2; else hi = m2;
        }
        return (lo + hi) / 2;
      };
      const arcFrac = (u) => cum[Math.round(u * M)] / len;
      const xLean = profInv(arcFrac(0.65));
      // settle ≥ 0.5 s before the beat end when the walk affords it, never
      // later than the arc-u 0.90 mark, always a real C2 window after xLean
      const xSettle = Math.max(xLean + 0.15 * (1 - xLean),
        Math.min(profInv(arcFrac(0.90)), 1 - 0.5 / T));
      const look = (x, cam) => {
        const e = wS(Math.min(1, x * adv));
        const yaw = G0.yaw + dyawG * e;
        const pitch = G0.pitch + dpitchG * e;
        const cp = Math.cos(pitch);
        const sweep = [cam[0] + 3 * cp * Math.cos(yaw),
          cam[1] + 3 * cp * Math.sin(yaw), cam[2] + 3 * Math.sin(pitch)];
        // arrival lock: C2 blend of the look POINT onto the shipped address
        // look target (ball height — the depression comes with it)
        const wl = o.noLock ? 0 : wS((x - xLean) / (xSettle - xLean));
        return lerp3(sweep, a.addrLook, wl);
      };
      // waypoints at equal TIME steps (profile baked into spacing; the
      // rig's dolly ease stays linear) — 60 waypoints/s, ≥ 2 legs
      const N = Math.min(361, Math.max(25, Math.ceil(T * 60) + 1));
      const path = [];
      for (let j = 0; j < N; j++) {
        const x = j / (N - 1);
        const cam = C(invLen(len * prof(x)));
        path.push({ cam, look: look(x, cam) });
      }
      // MEASURED peak view-rotation rate over the waypointed path (rad/s):
      // the shipped rig lerps cam/look THROUGH each leg (camerascript.js
      // applyMove), so the emitted angular speed is non-constant inside a
      // leg — measure at sub-leg resolution with the rig's exact lerp
      // arithmetic (review GH-299 rounds 2+3: endpoint-only measurement
      // under-read mid-leg look-point parallax by >10 deg/s). Measured,
      // never assumed: the yaw-sweep model cannot see the pitch component
      // or the arrival lock's parallax when the path passes the target.
      // 4 sub-steps per 1/60 s leg = 240 Hz, finer than the comfort gate.
      const fwd = (cam, look) => {
        const g = [look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]];
        const n = Math.hypot(g[0], g[1], g[2]) || 1;
        return [g[0] / n, g[1] / n, g[2] / n];
      };
      const SUB = 4;
      let ratePeak = 0;
      const dtS = T / (N - 1) / SUB;
      let prev = fwd(path[0].cam, path[0].look);
      for (let j = 1; j < N; j++) {
        const A = path[j - 1], B = path[j];
        for (let s = 1; s <= SUB; s++) {
          const w = s / SUB;
          const cur = fwd(lerp3(A.cam, B.cam, w), lerp3(A.look, B.look, w));
          const dot = prev[0] * cur[0] + prev[1] * cur[1] + prev[2] * cur[2];
          const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
          if (ang / dtS > ratePeak) ratePeak = ang / dtS;
          prev = cur;
        }
      }
      return { beatSec, T, rho, adv, xLean, xSettle, path, ratePeak };
    };
    // floor: min walk, the path at v_walk, and the TURN (review round-1 P1 —
    // predicted peak 1.875·|dYaw|/T must not bust the 90 deg/s budget)…
    let W = buildAt(Math.max(BEAT_MIN_WALK, len / vWalk, turnT));
    // …then the MEASURED wall (review round-2 P1): geometries the yaw model
    // cannot price (pitch + lock parallax) lengthen the walk until the
    // 100 deg/s comfort CEILING holds on the built path itself. The ceiling
    // (not the 90 budget) is the enforcement line on purpose: the owner-
    // approved worst boundary measures 90.3 deg/s and must stay
    // byte-identical (its first build passes untouched). Rate ≈ 1/T, so
    // this converges in 1-2 passes; deterministic pure arithmetic.
    const CEIL = Math.PI / 1.8; // 100 deg/s in rad/s
    for (let it = 0; it < 5 && W.ratePeak > CEIL; it++) {
      W = buildAt(W.T * (W.ratePeak / CEIL) * 1.05);
    }
    // postcondition, not hope (review round-3 P2): quantization + the
    // rebuilt lock windows make convergence non-guaranteed in bounded
    // passes — a walk still over the ceiling DEGRADES to the hard cut
    // rather than shipping the whip the law forbids.
    if (W.ratePeak > CEIL) return null;
    return {
      beatSec: W.beatSec, holdSec: BEAT_HOLD, walkTime: W.T, fov: POV_FOV,
      p0: { cam: P0.cam, look: P0.look }, path: W.path,
      meta: { pathLen: len, walkTime: W.T, beatSec: W.beatSec, rho: W.rho,
        vPeak: (len / W.T) / (1 - W.rho),
        gazeSweepDeg: dyawG * 180 / Math.PI, gazeAdv: W.adv,
        gazePeakPred: 1.875 * Math.abs(dyawG) * W.adv / W.T * 180 / Math.PI,
        ratePeakDegS: W.ratePeak * 180 / Math.PI,
        xLean: W.xLean, xSettle: W.xSettle,
        settleLeadSec: W.T * (1 - W.xSettle), s0, s1, ds },
    };
  }

  /** GH-315: the beat for a boundary whose exit lands INSIDE the previous
   * segment's own POV motion — a record shorter than its rise (the owner's
   * build-15 one-take: a 1.47 s tap against the ~1.8 s rise hard-cut at
   * output 45.383 s while every other boundary walked), or an exit trimmed
   * into the rise. The GH-299 law still holds — the WALK departs from the
   * risen watch pose — the player just FINISHES STANDING UP first, exactly
   * as a real player does after a quick shot: the beat opens with the
   * remainder of the shipped GH-275 rise (from the exact exit pose, on the
   * shipped curve), takes the shipped BEAT_HOLD watch, then walks the
   * approved ring path built from the SAME risen anchors a completed rise
   * departs from (buildWalk at the rise end — the walk geometry class is
   * untouched, no new motion vocabulary). Emitted as ONE composite 60 Hz
   * waypointed dolly with holdSec 0 (zero-length hold pose): a shape
   * already inside the beat contract, so offline-render.js places it
   * verbatim (a cached pre-315 copy included) and camerascript renders it
   * with the arithmetic it already ships. Pure in (records, exitT). */
  function buildRiseWalk(prevRec, exitT, nextRec, vWalk = WALK_V, o = {}) {
    const a = povAnchors(prevRec);
    if (!a) return null;
    const tRise = a.ti + 0.3;
    const W = buildWalk(prevRec, tRise + 1.4, nextRec, vWalk, o);
    if (!W) return null;
    // remaining rise TIME at the exit, frame-quantized (contract (1) — the
    // composite beat must stay on the output-frame grid); a pre-rise exit
    // rises in full: the player gets up at once rather than sitting out
    // the remaining address hold.
    const u0 = Math.min(1, Math.max(0, (exitT - tRise) / 1.4));
    const riseN = Math.max(1, Math.round(1.4 * (1 - u0) * 60));
    const holdN = Math.round(W.holdSec * 60);
    const path = [];
    for (let j = 0; j < riseN; j++) {
      const s = wS(u0 + (1 - u0) * (j / riseN));
      path.push({ cam: lerp3(a.addrCam, a.standCam, s),
        look: lerp3(a.addrLook, a.standLook, s) });
    }
    // the risen watch hold, baked as repeated waypoints (every leg of the
    // composite dolly must span exactly 1/60 s for its linear clock to be
    // the beat clock)
    for (let j = 0; j < holdN; j++) {
      path.push({ cam: a.standCam.slice(), look: a.standLook.slice() });
    }
    // the approved walk path — already 60 Hz waypoints when unclamped
    // (N = T·60 + 1); a length-clamped path (walks past the 361-waypoint
    // ceiling) is resampled onto the frame grid with the rig's own
    // per-leg lerp so every composite leg keeps the 1/60 s span
    const wN = Math.round(W.walkTime * 60);
    if (W.path.length === wN + 1) {
      path.push(...W.path);
    } else {
      const legs = W.path.length - 1;
      for (let j = 0; j <= wN; j++) {
        const x = (j / wN) * legs;
        const i0 = Math.min(legs - 1, Math.floor(x));
        const f = x - i0;
        path.push({ cam: lerp3(W.path[i0].cam, W.path[i0 + 1].cam, f),
          look: lerp3(W.path[i0].look, W.path[i0 + 1].look, f) });
      }
    }
    const riseSec = riseN / 60;
    const beatSec = Math.round((riseSec + W.beatSec) * 60) / 60;
    const p0 = prevEndPose(prevRec, exitT);
    return {
      beatSec, holdSec: 0, walkTime: W.walkTime, fov: POV_FOV,
      p0: { cam: p0.cam, look: p0.look }, path,
      meta: { ...W.meta, beatSec, riseSec },
    };
  }

  /** The beat for the boundary AFTER segment i at exit time `exitT`, or
   * null (= the hard cut stands: unreadable records, or a walk the comfort
   * ceiling refuses). A beat DEPARTS from the risen watch pose — an exit
   * at/after the previous segment's rise end (tImpact + 0.3 + 1.4) walks
   * from it directly (the shipped GH-299 build, byte-identical); an exit
   * INSIDE the segment's own motion first finishes the rise on the shipped
   * curve inside the beat (GH-315 — buildRiseWalk above; pre-315 this
   * class kept the INNER_TAIL hard cut, the owner-reported one-take jump).
   * renderDrill re-checks the emitted spec against its ACTUAL trims (a
   * seam caller may override trims after planning; the truncated base
   * script keeps that guard honest). MEMOIZED per player-open (review
   * GH-299 round-2 P2): the trim drag reaches the schedule synchronously
   * through syncMontage on every pointer event, and the walk is pure in
   * (records, exitT) — records are fixed for the open and a UI trim only
   * ever moves the LAST included exit, which never carries a beat, so
   * drags are all cache hits. The noLock debug rebuild stays unmemoized
   * (never a production caller). */
  function beatFor(i, exitT, o = {}) {
    const prevRec = pb?.recs?.[i], nextRec = pb?.recs?.[i + 1];
    if (!prevRec || !nextRec) return null;
    const prev = povAnchors(prevRec);
    // a non-positive exit is a degenerate (empty/eventless) record — no
    // segment to depart from, the hard cut stands (pre-315 behaviour)
    if (!prev || !(exitT > 0)) return null;
    const build = exitT >= prev.ti + 0.3 + 1.4 ? buildWalk : buildRiseWalk;
    if (o.noLock) return build(prevRec, exitT, nextRec, WALK_V, o);
    const key = `${i}|${exitT}`;
    pb.walkCache ??= new Map();
    if (!pb.walkCache.has(key)) {
      pb.walkCache.set(key, build(prevRec, exitT, nextRec, WALK_V));
    }
    return pb.walkCache.get(key);
  }

  // Canonical chase projection (review GH-273 round-2 P2): the rig eases
  // fov, so chase INHERITED whatever the previous preset left (78° after
  // overhead) — history, not state. 40 = the non-top preset projection
  // (camerapresets.js setFov). `fovSnap` makes the RIG apply it at
  // start() — the one snap both the live tap and the exported directive
  // ride (review round 3: the round-2 fix snapped only the LIVE camera
  // through __dbg.camera while renderDrill's rig eased 78→40 across the
  // cut — a WYSIWYG divergence; arm 11h fingerprints both paths).
  // Stale-rig degrade: a cached cameratrack.js without the flag eases in
  // BOTH paths — consistent live/export, just pre-fix.
  const CHASE_FOV = 40;

  /** Live POV spec for segment i: the shipped povScript plus — when walk
   * `w` follows i (GH-299; defaults to the live schedule's beat) — the
   * appended risen-watch hold + walk dolly on the segment's OWN clock at
   * [durs[i], durs[i]+beatSec]. For the shipped walk class beatFor
   * guarantees durs[i] ≥ the rise end, so the append never overlaps the
   * base moves; the GH-315 rise-carrying class (holdSec 0 — the record
   * ends inside its own rise) instead rides the exit-CLIPPED base script,
   * whose last move ends exactly at durs[i] where the composite beat
   * dolly begins. ONE spec covers the segment's play AND beat windows. */
  function livePovSpec(i, w = pb?.beats?.[i]) {
    const spec = w && w.holdSec === 0
      ? povScriptClipped(pb?.recs?.[i], pb?.durs?.[i])
      : povScript(pb?.recs?.[i]);
    if (!spec || !w) return spec;
    const tW = pb.segEndSec(i, pb.tails?.[i] ?? 0);
    spec.moves.push(
      { kind: 'pose', t0: tW, t1: tW + w.holdSec,
        cam: w.p0.cam, look: w.p0.look, fov: POV_FOV },
      { kind: 'dolly', t0: tW + w.holdSec, t1: tW + w.beatSec,
        fov: POV_FOV, path: w.path });
    return spec;
  }

  // ---- GH-301 §2.1: the compiler — cut list → per-segment directives --------
  // ONE compiler feeds the live arm point (armSeg below) AND savePlan's
  // perShotCamera (WYSIWYG by construction, the povScript precedent). A
  // segment fully covered by one static preset keeps today's string-preset
  // emission byte-identical (the arm-3h plan-stability law); mid-segment
  // cuts between static cameras/tripods compile to ONE camerascript spec of
  // zero-length pose moves — the vehicle's boundary-hold law yields hard
  // cuts for free, fov static per move (§2.3 fovSnap by construction), and
  // pose(t) purity/determinism is inherited, not re-proven.
  /** Tripod pose (poses[slot], §1.1): mm/decidegrees → the kernel-frame
   * metres/degrees camerascript pose moves consume. null = empty slot. */
  function tripodPoseK(n) {
    const p = pb?.plan?.poses?.find((x) => x.slot === n - 8);
    if (!p) return null;
    return { cam: p.eye.map((v) => v / 1000), look: p.look.map((v) => v / 1000),
      fov: p.fov / 10 };
  }
  // orbit.js clamps — the presets pose THROUGH the orbit rig, so the
  // mirrored math must clamp exactly like camerapresets.js pose() +
  // orbit.apply(): polar [0.16, 1.44] AND radius [0.7, 6.5] (review GH-301
  // round-1 P2 — a compact close-up action box requests ~0.5-0.7 m, and
  // the rig would have pushed it back out to 0.7).
  const ORB_PHI_MIN = 0.16, ORB_PHI_MAX = 1.44;
  const ORB_R_MIN = 0.7, ORB_R_MAX = 6.5;
  /** Eye/target (three-frame) → the ORBIT-rig pose → kernel [kx, ky, h]
   * arrays (three.x = k.y, three.y = h, three.z = k.x — the coords.js
   * bridge). Mirrors camerapresets.js pose() + orbit.apply() so a compiled
   * span frames like the live preset it names. */
  function orbitPoseK(eye3, target3, fov) {
    const d = [eye3[0] - target3[0], eye3[1] - target3[1], eye3[2] - target3[2]];
    const r = Math.min(ORB_R_MAX,
      Math.max(ORB_R_MIN, Math.hypot(d[0], d[1], d[2]) || 1e-6));
    const rRaw = Math.hypot(d[0], d[1], d[2]) || 1e-6;
    const phi = Math.min(ORB_PHI_MAX,
      Math.max(ORB_PHI_MIN, Math.acos(Math.min(1, Math.max(-1, d[1] / rRaw)))));
    const theta = Math.atan2(d[0], d[2]);
    const e = [target3[0] + r * Math.sin(phi) * Math.sin(theta),
      target3[1] + r * Math.cos(phi),
      target3[2] + r * Math.sin(phi) * Math.cos(theta)];
    return { cam: [e[2], e[0], e[1]], look: [target3[2], target3[0], target3[1]],
      fov };
  }
  /** Static-preset pose for segment i in kernel coordinates — the
   * camerapresets.js math mirrored over PURE RECORD DATA (the chaseEye
   * precedent): segment-initial cue/ball poses + shot.phi + active table
   * dims. NOT physics: reads recorded initial state only. Unreadable
   * record fields degrade toward the broadcast 'side' framing. */
  function presetPoseK(n, i) {
    const rec = pb?.recs?.[i];
    const L = Number(rec?.initial?.table?.length) > 0 ? rec.initial.table.length
      : (Number(game.template?.system?.table?.length) || 2.54);
    const scale = Math.max(1, L / 2.54);
    const cue = rec?.initial?.balls
      ?.find((b) => b.id === recCueId(rec))?.state?.pos; // GH-383
    const cue3 = cue && [cue.x, cue.y, cue.z].every(Number.isFinite)
      ? [cue.y, cue.z, cue.x] : [0, 0.028, 0]; // kernel → three
    const phi = Number(rec?.shot?.phi);
    const dir = Number.isFinite(phi) ? [Math.sin(phi), Math.cos(phi)] : [0, 1];
    if (n === 3) {
      // 'top': under-light overhead — radius pinned below the fixture
      // clearance, fov widened for long tables (the camerapresets formula).
      // The fit ASPECT is the EXPORT-CANONICAL 16:9 (review GH-301 round-1
      // P2): every export resolution is 16:9, so the compiled span renders
      // its exact fit in the clip — the WYSIWYG surface this ONE-spec
      // compiler exists for — while a live viewport at another aspect
      // shows the same number (wider-than-16:9 sees strictly more table,
      // never a crop). Baking the LIVE viewport aspect instead exported
      // whatever window the plan happened to be built in. 9-ft tables
      // under the default canopy keep the constant 78 either way.
      const clearY = window.__lighting?.state?.()?.clearanceY ?? 1.02;
      const topR = Math.min(0.985, clearY - 0.035);
      let fov = 78;
      const aspect = 16 / 9;
      if (scale > 1) {
        const ha = Math.atan((L * 0.53) / 0.985);
        fov = Math.min(110, Math.max(78,
          2 * (180 / Math.PI) * Math.atan(Math.tan(ha) / aspect)));
      }
      if (topR < 0.985) {
        const ha = Math.atan((L * 0.53) / topR);
        fov = Math.min(110, Math.max(fov,
          2 * (180 / Math.PI) * Math.atan(Math.tan(ha) / aspect)));
      }
      // orbit state radius topR, theta 0, phi at the polar clamp floor —
      // eye = target + r·(sinφ·sinθ, cosφ, sinφ·cosθ)
      return orbitPoseK(
        [0, topR * Math.cos(ORB_PHI_MIN), topR * Math.sin(ORB_PHI_MIN)],
        [0, 0, 0], fov);
    }
    if (n === 4) {
      // 'follow': behind the cue ball, down the aim line
      return orbitPoseK(
        [cue3[0] - dir[0] * 0.80, 0.33, cue3[2] - dir[1] * 0.80],
        [cue3[0] + dir[0] * 0.9, 0.0, cue3[2] + dir[1] * 0.9], 40);
    }
    if (n === 5) {
      // 'closeup': tight on the action cluster (segment-initial ball box)
      let min = null, max = null;
      for (const b of rec?.initial?.balls ?? []) {
        // the legacy preset boxes ACTIVE balls only (review r10 P2): a
        // parked/pocketed entry in the record initial must not stretch
        // the frame toward empty table (both serde shapes covered)
        const mo = b?.state?.motion;
        if (mo === 'Pocketed' || (mo && typeof mo === 'object'
          && mo.Pocketed !== undefined)) continue;
        const p = b?.state?.pos;
        if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) continue;
        const v = [p.y, p.z, p.x];
        min = min ? min.map((m, k) => Math.min(m, v[k])) : v.slice();
        max = max ? max.map((m, k) => Math.max(m, v[k])) : v.slice();
      }
      if (!min) { min = cue3.slice(); max = cue3.slice(); }
      const c3 = min.map((m, k) => (m + max[k]) / 2);
      const spread = Math.hypot(max[0] - min[0], max[2] - min[2]);
      const dist = Math.min(2.0, Math.max(0.5, spread * 1.15 + 0.28));
      return orbitPoseK(
        [c3[0] - dir[0] * dist * 0.9, dist * 0.55, c3[2] - dir[1] * dist * 0.9],
        [c3[0], 0.02, c3[2]], 40);
    }
    // 'side' (broadcast) — also the degrade target for any non-static id a
    // stale plan sneaks past the edit law (belt; §1.4 apply-time degrade)
    const sign = cue3[0] >= 0 ? 1 : -1;
    return orbitPoseK(
      [sign * (L / 2 + 0.95 * scale), 0.34 * scale, 0],
      [-sign * L * 0.12, 0.02, 0], 40);
  }
  /** The compiled camerascript spec for segment i over the (optionally
   * trimmed — §2.6 clip law) window, or null when the segment rides the
   * legacy whole-segment arms (string preset / chase rig / povScript):
   * planless sessions therefore emit byte-identical plans (arm 3h). Cuts
   * whose anchors are trimmed away are DROPPED; the nearest surviving
   * earlier cut rules the surviving span (cameraAt's backfill covers the
   * head) — deterministic and order-independent. */
  function compiledSpec(i, startT = 0, endLocal = null) {
    const key = `${i}|${startT}|${endLocal ?? ''}`;
    if (pb.compiled.has(key)) return pb.compiled.get(key);
    // EXACT trim bounds (review r4 P2): the handles are continuous floats,
    // and rounding them to the anchor grid flips which side of a cut the
    // first/last rendered frame uses (a trim at 0.796 s must keep the
    // PRE-cut camera for its first frame; one ending 0.804 s still renders
    // the 0.800 s frame and must keep the cut). Quantized anchors compare
    // against the UNROUNDED bounds; an anchor exactly AT an explicit end
    // is excluded — its cut frame is trimmed away (§2.6, and the fade
    // filter mirrors the exclusivity).
    const lo = startT;
    const hi = endLocal === null ? pb.durs[i] : Math.min(endLocal, pb.durs[i]);
    const anchors = pb.plan.cuts.filter((c) => c.seg === i
      && csSec(c.t) > lo + 1e-9 && csSec(c.t) < hi - 1e-9);
    // the ruling head at the EXACT slice start (nearest anchor ≤ lo,
    // earlier segments and the §1.2 backfill included)
    let headCut = null;
    for (const c of pb.plan.cuts) {
      if (c.seg < i || (c.seg === i && csSec(c.t) <= lo + 1e-9)) headCut = c;
      else break;
    }
    const head = appliedCamId((headCut ?? pb.plan.cuts[0])?.cam ?? 0);
    let spec = null;
    if (anchors.length || isCustomCamId(head)) {
      const spans = [{ tCs: qCs(lo), cam: head },
        ...anchors.map((c) => ({ tCs: c.t, cam: appliedCamId(c.cam) }))];
      const moves = [];
      for (const sp of spans) {
        const p = isCustomCamId(sp.cam) ? tripodPoseK(sp.cam)
          : presetPoseK(sp.cam, i);
        if (!p) continue;
        // zero-length pose moves: camerascript's boundary-hold law holds
        // each pose to the next anchor — hard cuts at the anchors for free
        moves.push({ kind: 'pose', t0: csSec(sp.tCs), t1: csSec(sp.tCs),
          cam: p.cam, look: p.look, fov: p.fov });
      }
      spec = moves.length ? { moves } : null;
    }
    pb.compiled.set(key, spec);
    return spec;
  }

  // ---- GH-301 §2.2/§2.4: fade = alpha(t) on the OUTPUT clock -----------------
  // Live output clock = the beat-inclusive player timeline MAPPED THROUGH
  // the speed detent (review GH-301 round-1 P1): play windows advance the
  // output clock at 1/speed (a ½× detent plays — and therefore OUTPUTS —
  // twice the wall seconds per content second, exactly like the export's
  // slowmo frame plan), while beat windows are RATE-1 fixed output seconds
  // (the setPlaying pacing law). A 1 s fade therefore spans 1 s of the
  // clock the viewer actually watches at EVERY detent — the same 60 output
  // frames the export composites (offline-render.js fadeAlphaAt over frame
  // index K, windows placed post-convergence). Alpha is presentation-only
  // (never touches pose or ball state): C2 smootherstep down, EXACTLY
  // black at the cut instant, smootherstep up.
  const fadeS = (u) => (u <= 0 ? 0 : u >= 1 ? 1
    : u * u * u * (u * (6 * u - 15) + 10));
  /** Timeline seconds → live OUTPUT seconds (play/speed + rate-1 beats). */
  function outClockSec(T) {
    const at = locate(T);
    let play = 0, fixed = 0;
    for (let i = 0; i < at.i; i++) {
      play += pb.durs[i];
      fixed += (pb.beats[i]?.beatSec ?? 0) + (pb.leads?.[i] ?? 0);
    }
    // GH-363 (review r5 P2): lead windows are FIXED rate-1 output time
    // exactly like beats — a fade anchored past a lead must not see the
    // output clock jump backward at the lead start (double dip) or scale
    // the lead by the speed detent. Inside a lead the negative local IS
    // the remaining window (elapsed = lead + local).
    const curLead = pb.leads?.[at.i] ?? 0;
    if (at.lead) {
      fixed += curLead + at.local; // local ∈ [−lead, 0)
      return play / pb.speed + fixed;
    }
    fixed += curLead;
    if (at.beat) {
      play += pb.durs[at.i];
      fixed += at.local;
    } else play += Math.min(at.local, pb.durs[at.i]);
    return play / pb.speed + fixed;
  }
  function evalAlpha(T) {
    let a = 0;
    const To = outClockSec(T);
    // GH-433: the lead-ASSOCIATED parent (if any) ships as a FULL slice —
    // its fades survive the compile, so the preview must keep dipping
    // where the export dips (the r13 P2 mirror law, association direction)
    // GH-864 fade clock F1: the cut-fade compare runs on the same EXTENSION-
    // inclusive clock as the reset dips below (outClockSec collapses Ext_i).
    const atF = locate(T);
    const extTo = (n) => { let s = 0; for (let i = 0; i < n; i++) s += pb.segExtSec(i); return s; };
    const ovF = atF.lead ? 0 : atF.beat ? pb.segExtSec(atF.i) : Math.max(0, atF.local - pb.durs[atF.i]);
    const ToG = To + (extTo(atF.i) + ovF) / pb.speed;
    const assoc = leadAssocSeg();
    for (const c of pb?.plan?.cuts ?? []) {
      if (c.transitionIn !== 2 || !(c.dur > 0)) continue;
      // the §2.6 fade-drop law, LIVE (review r13 P2): an anchor outside the
      // trim window vanished from the compile — the preview must not dip
      // where the export is clear. Mirrors the savePlan filter exactly
      // (slice start inclusive, explicit out-trim exclusive).
      const s0 = pb.cum[c.seg];
      const s1 = s0 + pb.durs[c.seg];
      const tA = csSec(c.t);
      let sliceStart, sliceEnd;
      if (s1 <= pb.tIn + 1e-6 || s0 >= pb.tOut - 1e-6) { // dropped seg…
        if (c.seg !== assoc) continue; // …unless it is the associated parent
        sliceStart = 0;
        sliceEnd = null;
      } else {
        sliceStart = Math.max(0, pb.tIn - s0);
        sliceEnd = pb.tOut < s1 - 1e-6 ? pb.tOut - s0 : null;
      }
      if (tA < sliceStart - 1e-9) continue;
      if (sliceEnd !== null ? tA >= sliceEnd - 1e-9
        : tA > pb.durs[c.seg] + 1e-9) continue;
      const A = outClockSec(s0 + Math.min(tA, pb.durs[c.seg])) + extTo(c.seg) / pb.speed;
      const h = csSec(c.dur) / 2;
      if (ToG < A - h || ToG > A + h) continue;
      a = Math.max(a, fadeS(1 - Math.abs(ToG - A) / h));
    }
    // GH-452: the derived reset-boundary dips — the savePlan mirror (same
    // C2 window, exactly black at the boundary instant). Evaluated on an
    // EXTENSION-INCLUSIVE output clock (review r3 P2; GH-864): outClockSec
    // collapses every post-record span Ext_i (the PR-2 withdrawal tail or
    // the completion overhang), so a window anchored AT a boundary would pin
    // black across the whole span and — worse — zero abruptly past the
    // adjacent segments while the export's fadeAlphaAt keeps dipping on
    // the global frame index. Adding every earlier segment's Ext_i span
    // (rate 1/speed — the strikeAlphaLive overhang law, globalized) makes
    // the clock continuous through play/span/beat/lead flips, so the
    // window evaluates globally exactly like the export's, short
    // neighbors included. (The export additionally appends settle-beat
    // frames the live timeline never had — the strike-linger RULED-limit
    // asymmetry, accepted shape.)
    const dips = keptResetBounds((r) => pb.beats?.[r - 1]);
    if (dips.length) {
      const at = locate(T);
      const h = RESET_FADE_SEC / 2;
      const tailsTo = (n) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += pb.segExtSec(i);
        return s;
      };
      const overhang = at.lead ? 0 : at.beat ? pb.segExtSec(at.i) : Math.max(0, at.local - pb.durs[at.i]);
      const ToG = To + (tailsTo(at.i) + overhang) / pb.speed;
      for (const r of dips) {
        // the boundary instant resolves to segment r's lead/play head
        // (locate's `>=` law), so its global anchor carries every span
        // BEFORE r and no overhang
        const A = outClockSec(pb.cum[r] - (pb.leads?.[r] ?? 0))
          + tailsTo(r) / pb.speed;
        if (Math.abs(ToG - A) < h) {
          a = Math.max(a, fadeS(1 - Math.abs(ToG - A) / h));
        }
      }
    }
    return a;
  }
  /** The live dip-to-black layer (#ob-pb-fade — the identical function of
   * t the export composites into its frames). */
  function setLiveFade(alpha) {
    if (!P.fade) return;
    const v = alpha > 0 ? Math.min(1, alpha).toFixed(4) : '0';
    if (P.fade.style.opacity !== v) P.fade.style.opacity = v;
  }

  // ---- GH-364: the live strike-point preview --------------------------------
  /** Per-segment plate truth ({ glyph, tOff } | null) — derived once per
   * segment from the RECORD through the strikeglyph.js leaf, the SAME
   * derivation the export engine runs (glyphFor/impactTimeFor), so the
   * preview and the burned plate read one truth. Cached on pb (records are
   * immutable per open). */
  function strikeInfoFor(i) {
    if (!pb || !sgMod) return null;
    pb.strikeInfo ??= {};
    let v = pb.strikeInfo[i];
    if (v === undefined) {
      const rec = pb.recs[i];
      const glyph = rec ? sgMod.glyphFor(rec) : null;
      v = glyph ? { glyph, tOff: sgMod.impactTimeFor(rec, pb.durs[i]) } : false;
      pb.strikeInfo[i] = v;
    }
    return v || null;
  }

  /** The live plate alpha at timeline time T — the identical function of
   * the OUTPUT clock the export composites into its frames (the
   * offline-render.js strikeAlphaAt law). Lead-KEEPING slices (GH-474):
   * a C2 ramp-in synchronized with the FIRST BACKSWING (the choreography
   * start), a C2 bow-out ENDING at the strike — the plate never shows
   * during transitions. Lead-less slices keep the pre-474 teaching
   * window byte-identically: alpha 1 from the segment's start
   * through its impact anchor, then a C2 smootherstep bow-out over one
   * settle beat of the timeline's cadence (INNER_TAIL — the renderDrill
   * innerTail mirror, on the output clock exactly like the fade dur), and
   * 0 through walk-beat windows (the staged balls there belong to the NEXT
   * record — its own segment re-shows its plate). */
  function strikeAlphaLive(at, T) {
    if (!pb || at.beat || !strikeArmed()) return 0;
    const info = strikeInfoFor(at.i);
    if (!info) return 0;
    // the §2.6 drop law, LIVE (review r1 P2 — the evalAlpha trim mirror):
    // the preview must not show a plate the export dropped. Mirrors the
    // renderDrill mapping's own tests over the live trim window: a segment
    // outside the window, or an in-trim landing at/after the impact
    // anchor, ships plate-less; an out-trim before the impact bows the
    // plate out at the slice end (tOff clamps to it).
    const s0 = pb.cum[at.i];
    const s1 = s0 + pb.segEndSec(at.i, pb.tails?.[at.i] ?? 0);
    let sliceStart, sliceEnd;
    if (s1 <= pb.tIn + 1e-6 || s0 >= pb.tOut - 1e-6) {
      // GH-433: the lead-ASSOCIATED parent ships as a FULL slice — its
      // plate keeps the live/export mirror too (the r1 P2 law,
      // association direction: never a plate-less preview of a plated file)
      if (at.i !== leadAssocSeg()) return 0;
      sliceStart = 0;
      sliceEnd = pb.durs[at.i];
    } else {
      sliceStart = Math.max(0, pb.tIn - s0);
      sliceEnd = pb.tOut < s1 - 1e-6
        ? Math.min(pb.tOut - s0, pb.durs[at.i]) : pb.durs[at.i];
    }
    // GH-474: a slice that KEEPS its lead synchronizes the plate with the
    // stroke — it fades in WITH the first backswing (the choreography
    // start; the live player plays the v2 tier, whose first feather
    // begins at the lead window start = the camera-settle point) and
    // hides AT the strike. It never shows during transitions: walk beats
    // gate above, and nothing paints before the backswing. Lead-kept
    // replication of the export grammar: untrimmed slice head
    // (sliceStart 0) + the exportLeads first-slice gate (tIn at/before
    // the choreography start — a tIn inside it cut the lead deliberately
    // and the export ships the bare pre-474 window). The export mirror is
    // offline-render.js strikeAlphaAt's kBack law, and the CAPABILITY
    // gate (review r1 P1) keeps the pairing honest: a cached pre-474
    // engine burns the old window, so the preview only promises the new
    // one against an engine that implements it (savePlan's window474
    // flag closes the opposite direction — a stale planner's plan keeps
    // the old window on a fresh engine).
    if (pb.leadTier?.[at.i] && sliceStart === 0
      && window.__export?.strikeWindowCapable === true
      && pb.tIn <= liveChorStart(at.i) + 1e-6) {
      // the EXPORT law on the output frame grid (offline-render.js
      // strikeAlphaAt, kBack = −H for the live v2 tier): kp = frames
      // since the backswing, k = the play-clock index — alpha > 0 exactly
      // from the backswing frame, 0 at/after the strike frame.
      const To = outClockSec(T);
      const Tb = outClockSec(liveChorStart(at.i));
      const Ts = outClockSec(pb.cum[at.i]);
      const kp = Math.floor((To - Tb) * 60 + 1e-6);
      const H = Math.round((Ts - Tb) * 60);
      const k = kp - H;
      const h = Math.max(1, Math.round(INNER_TAIL * 60));
      if (kp < 0 || k >= 0) return 0;
      return Math.min(fadeS((kp + 1) / h), fadeS(-k / h));
    }
    const tOff = Math.min(info.tOff, sliceEnd);
    // STRICT inequality (review r2 P2): a frozen-contact record's impact at
    // t=0 — and a trim landing exactly ON the impact — keeps the impact
    // frame + linger (the engine's kImp = 0 case), it is not trimmed away
    if (sliceStart > tOff + 1e-9) return 0;
    // the strike clock adds the cue-tail overhang back (review r2 P2):
    // outClockSec clamps play at durs[i], but the PR-2 withdrawal tail IS
    // play time — the export keeps stepping frames through it, so a linger
    // that straddles the record end must keep ramping live too.
    // RULED limit (review r4, answered by the GH-301 §2.2 precedent): a
    // linger still running when the LIVE timeline parks at its last
    // content frame holds that frame's alpha, while the export keeps
    // ramping through its appended SETTLE-TAIL frames — output-clock
    // layers ramp through tails BY CONSTRUCTION ("a fade riding the
    // output clock keeps ramping through tails and trims"), and the live
    // player has no settle-tail span to ride. Same accepted shape as the
    // live dip (evalAlpha) at a final-cut fade.
    const To = outClockSec(T)
      + (at.beat ? 0 : Math.max(0, at.local - pb.durs[at.i]) / pb.speed);
    const Ti = outClockSec(s0 + tOff);
    if (To <= Ti + 1e-9) return 1;
    const u = (To - Ti) / INNER_TAIL;
    return u >= 1 ? 0 : 1 - fadeS(u);
  }

  /** Paint the preview layer for the CURRENT pose — renderAtT's per-frame
   * call (the setLiveFade drive point). The canvas backing store rides the
   * device DPR so the plate previews at the sharpness it burns at; the
   * geometry itself is a pure function of the layer HEIGHT (strikeglyph.js
   * u = H/1080), the same law the export applies to spec.height. Skipped
   * repaints: same (segment, alpha) as the last paint. */
  function syncLiveStrike(at, T) {
    const el = P.strike;
    if (!el || !pb) return;
    const a = pb.captureLatch ? 0 : strikeAlphaLive(at, T);
    if (a <= 0) {
      if (pb.strikePaint) {
        pb.strikePaint = null;
        el.getContext('2d')?.clearRect(0, 0, el.width, el.height);
      }
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(el.clientWidth * dpr));
    const h = Math.max(1, Math.round(el.clientHeight * dpr));
    const key = `${at.i}|${a.toFixed(4)}|${w}x${h}|${getLocale()}`
      + `|${strikeElevOn ? 1 : 0}${strikePowerOn ? 1 : 0}`;
    if (pb.strikePaint === key) return;
    pb.strikePaint = key;
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const info = strikeInfoFor(at.i);
    // GH-475: the preview paints the SAME plate the export burns — the
    // legacy combined line retired on the user path (readout false), the
    // knob-selected annotation halves in its place (default OFF = clean).
    sgMod.drawStrikePlate(ctx, { W: w, H: h, alpha: a, glyph: info.glyph,
      title: t('playback.strikeTitle'), readout: false,
      elev: strikeElevOn, power: strikePowerOn });
  }

  function applyCam(id, seg = pb?.curIdx ?? 0) {
    if (pb?.captureLatch) return; // GH-301 §3.2: the capture latch
    // suppresses EVERY camera writer (rig disarm included) while the user
    // frames a tripod slot with the live gesture stack
    const cam = CAMS.find((c) => c.id === id) ?? CAMS[0];
    // ONE camera writer (the GH-273 law, extended to the scripted rig for
    // GH-275): stop BOTH moving rigs before arming any directive — an
    // armed pose(t) script re-poses on every 'frame' emission and would
    // silently override every other preset on the next render
    window.__track?.stop?.();
    try { window.__test.cameraScript?.(null); } catch { /* stale rig */ }
    if (typeof cam.preset === 'string') {
      // anchor the framing at the SEGMENT INITIAL state (review round-2
      // P1: side/follow/closeup read live ball poses, so the pose
      // depended on WHERE the playhead sat at apply time — while the
      // export renderer frames each segment over its staged initial).
      // Every caller re-seeks to the playhead right after (renderAtT).
      if (pb) try { game.seek?.(0); } catch { /* stale seam */ }
      try { window.__test.setCamera?.(cam.preset); } catch { /* stale rig */ }
    } else if (cam.preset.track) {
      if (typeof window.__track?.start === 'function') {
        const eye = chaseEye(seg);
        window.__track.start({ ...cam.preset.track, fov: CHASE_FOV,
          fovSnap: true, ...(eye ? { cam: eye } : {}) });
      }
    } else if (cam.preset.pov) {
      // POV (GH-275): arm the pure pose(t) script for THIS segment's
      // record — with its trailing walk-beat moves when a beat follows
      // (GH-299). The trampoline answers false while camerascript.js is
      // still loading (or on a stale graph) — the previous framing holds,
      // an honest live no-op (offline-render.js throws instead, so an
      // export can never silently ship the wrong camera).
      const spec = livePovSpec(seg);
      if (spec) {
        try { window.__test.cameraScript?.(spec); } catch { /* stale rig */ }
      }
    }
    if (pb) pb.camSeg = seg;
  }

  /** GH-301 §2.1: arm segment i's camera directive at the ONE live arm
   * point. A compiled spec (mid-segment cuts / tripods) rides the pure
   * camerascript vehicle; everything else keeps the exact legacy applyCam
   * emissions. `key` = `${i}|${planRev}` — the §2.1 re-apply-key
   * generalization: between crossings there is still no dispatch, and a
   * plan write re-arms exactly because the key changes. */
  function armSeg(i, key) {
    if (pb?.captureLatch) return; // §3.2 capture latch
    const spec = compiledSpec(i);
    if (!spec) {
      applyCam(effectiveCam(i), i);
    } else {
      window.__track?.stop?.();
      if (pb) try { game.seek?.(0); } catch { /* stale seam */ }
      try {
        // false (loading/stale camerascript.js) = the previous framing
        // holds — the honest live no-op (the POV degrade; the EXPORT
        // throws instead so it can never silently ship the wrong camera)
        window.__test.cameraScript?.(spec);
      } catch { /* stale rig */ }
      if (pb) pb.camSeg = i;
    }
    if (pb) pb.appliedKey = key;
  }

  /** Pose the live bed at global time T — the fast scrub path (owner
   * refinement 4): quiet staging + __test.renderAt (seek + frame hooks).
   * The ONE camera authority (GH-273): every path that re-stages or
   * re-poses a segment READS the per-segment assignment here.
   *   - SCRUB (viaPlay false) into a chase segment re-seeds the __track
   *     rig AT THE SCRUB POSITION: seek the balls first, seed the rig
   *     (deterministic per-segment eye + look at the target's scrub-t
   *     pose), then renderAt — whose frame emission is exactly idempotent
   *     over a fresh seed at the same t, so the pose is a pure function of
   *     T (render-clock law: same scrub position = same pose, byte-stable)
   *     and play resumes tracking from there with no snap.
   *   - PLAY (viaPlay true) re-applies the camera at EVERY segment
   *     crossing (review round-2 P1): a static preset re-anchors over the
   *     newly staged segment's initial state and a chase run restarts per
   *     segment — exactly the export's per-segment emission (savePlan
   *     emits every segment's camera explicitly; renderDrill cuts per
   *     segment — WYSIWYG). Between crossings an unchanged id is never
   *     re-applied.
   * One writer per segment holds (risk G3): applyCam stops the rig before
   * every static preset. */
  function renderAtT(T, viaPlay = false) {
    if (!pb) return;
    pb.T = Math.min(Math.max(T, 0), pb.total);
    const at = locate(pb.T);
    // A BEAT window belongs to the NEXT shot (GH-299 round-2.1 state-
    // handoff law): stage segment i+1's INITIAL ball state (ball seek 0)
    // while the CAMERA — segment i's armed script, whose spec carries the
    // appended hold+walk moves — steps through the beat on its OWN clock
    // (the renderAt two-clock split). BIH/respotted balls therefore exist
    // from the first beat frame, never popping in at the arrival, and the
    // pose stays a pure function of T (scrub-safe in both directions).
    const stageIdx = at.beat ? at.i + 1 : at.i;
    if (!stageShot(stageIdx)) return;
    // post-strike cue rides the staged segment (design 277 slice 3 PR-1;
    // arm changes only at staging boundaries — syncCueArm doc). GH-363:
    // the whole locate result rides in — a fused beat window arms the
    // STAGED next segment's lead spec on the emission→record clock map.
    syncCueArm(at);
    const ballT = at.beat || at.lead ? 0
      : Math.min(at.local, pb.durs[at.i]);
    const id = effectiveCam(at.i);
    const key = `${at.i}|${pb.planRev}`;
    if (pb.captureLatch) {
      // GH-301 §3.2: the capture latch suppresses the crossing re-apply
      // AND the chase scrub re-seed — the user's framing survives every
      // scrub while a tripod slot is being captured
    } else if (!viaPlay && !at.beat && isChaseId(id)
      && typeof window.__track?.start === 'function') {
      // pose the balls BEFORE the seed so the look point frames the
      // scrub-t pose, not the record initial (feature-detected: a stale
      // game.js without seek degrades to the pre-seed pose for one frame)
      try { game.seek?.(ballT); } catch { /* stale seam */ }
      applyCam(id, at.i);
      pb.appliedKey = key;
    } else if (pb.appliedKey !== key) {
      // every segment crossing re-applies (review round-2 P1): a static
      // preset re-anchors over the newly staged segment's initial state
      // exactly like the export renderer (savePlan emits it per segment),
      // and a chase run restarts per segment like renderDrill's one-writer
      // cut. GH-301 generalizes the re-apply key from the cam id to the
      // per-segment PLAN fingerprint (`seg|planRev`): mid-segment cuts
      // live INSIDE the armed compiled script, so between crossings there
      // is still no dispatch. Entering a BEAT is deliberately NOT a
      // crossing — locate() keeps at.i on the beat's owning segment, whose
      // armed spec already carries the beat moves; leaving it into segment
      // i+1's play window re-keys and re-arms.
      armSeg(at.i, key);
    }
    // GH-404 staging-boundary law (scene/lampfade.js header): every
    // NON-PLAY entry here is random access — open, seek, scrub, capture
    // entry — so the luminaire fade must derive memorylessly from the
    // staged pose, never rate-limit from the live viewport's residue
    // (pre-404, seek(T) x2 rendered different bytes: the 3t parity arms).
    // PLAY crossings (viaPlay) are continuous frames and keep the ramp —
    // exactly the exported clip's in-run behavior (WYSIWYG). Feature-
    // detected: a stale lampfade.js without the seam keeps pre-404 bytes.
    if (!viaPlay) window.__lampfade?.snapNext?.();
    try {
      // PR-2 cue tails: past the record end (local > durs, non-beat) the
      // frame clock keeps ADVANCING — renderAt(local) seeks the balls
      // through game.seek's internal duration clamp (settled hold) while
      // the 'frame' emission (the clock the post-strike cue rides) plays
      // the withdrawal. No clock split needed; beats keep theirs.
      // GH-363 lead windows: ball pinned at 0 (the staged initial state),
      // 'frame' emission = the NEGATIVE lead-local — the armed cue plays
      // its pre-strike choreography toward contact at 0 while the
      // segment's own camera script holds its head pose (the camerascript
      // boundary-hold law). Exactly the export's head-frame clocks.
      window.__test.renderAt(at.beat || at.lead ? ballT : at.local, undefined,
        at.beat ? pb.segEndSec(at.i, pb.tails?.[at.i] ?? 0) + at.local
          : at.lead ? at.local : undefined);
    } catch { /* renderer hiccup */ }
    // GH-301 §2.4: the live dip-to-black layer — the identical alpha(t)
    // function of the output clock the export composites into its frames
    setLiveFade(pb.captureLatch ? 0 : evalAlpha(pb.T));
    // GH-364: the strike-point preview layer — the identical alpha law the
    // export composites (strikeAlphaAt); sits UNDER the fade like the
    // burned plate sits under the burned dip
    syncLiveStrike(at, pb.T);
    syncCamTiles(at, ballT);
    syncTransport();
  }

  /** rAF-throttled scrub: pointer moves park the target time; one render
   * per frame (the perf law — drags never outrun the renderer). */
  function scrubTo(T) {
    if (!pb) return;
    pb.pendingT = T;
    if (pb.raf) return;
    pb.raf = requestAnimationFrame(() => {
      if (!pb) return;
      pb.raf = 0;
      if (pb.pendingT !== null) { const x = pb.pendingT; pb.pendingT = null; renderAtT(x); }
    });
  }

  function setPlaying(on) {
    if (!pb) return;
    if (on && pb.captureLatch) return; // GH-301 review r7 P2: capture is
    // pause → frame → save — play stays parked until the latch releases
    pb.playing = on && pb.total > 0;
    if (pb.playing) {
      // GH-361: resume releases the strip's AUTO-expansion latch (the
      // GH-314 contract pins editing engagement "until playback resumes")
      // — the D-lite sliver returns as the resting register, so the strip
      // pin below releases into the re-armed transient. The user's own
      // toggle expansion stays (arm 19e: it pins through play). Feature-
      // detected: a stale strip has no seam and keeps its shipped latch.
      try { stripUi?.seams?.releaseAutoExpand?.(); } catch { /* stale strip */ }
    }
    syncTransport();
    syncUi(); // GH-314: paused is a pin; a resume releases it (re-arm)
    const gen = ++playGen; // retire any previous loop (double-tap race)
    if (!pb.playing) return;
    // GH-433: the loop rides the EFFECTIVE window — for a lead-associated
    // selection the export delivers lead + strike + full shot, so the
    // preview plays exactly that span (raw bounds otherwise, unchanged).
    // BOTH bounds (review r2 P2): a tIn parked inside the lead CUT the lead
    // (the r5 P2 grammar) — effWindow().tIn advances to the strike address
    // while pb.T still sits at the raw in point, and an upper-bound-only
    // guard would preview practice strokes the export discarded. A
    // playhead PARKED AT the raw out point restarts too (review r6 P2): an
    // out-handle drag leaves pb.T exactly there, which for an associated
    // selection sits INSIDE the expanded window — Play must open the
    // deliverable from its start, not mid-lead. Parked ONLY (review r7
    // P2): the associated preview legitimately crosses the raw endpoint,
    // and a pause past it must RESUME from the pause point, never bounce
    // back to the prologue (raw windows: parked == the >= tOut term).
    const w0 = effWindow();
    if (pb.T >= w0.tOut - 1e-6 || pb.T < w0.tIn - 1e-6
      || Math.abs(pb.T - pb.tOut) <= 1e-4) pb.T = w0.tIn;
    pb.lastNow = performance.now();
    const step = (now) => {
      if (!pb || !pb.playing || playGen !== gen) return;
      const dt = Math.min(0.1, (now - pb.lastNow) / 1000);
      pb.lastNow = now;
      // GH-299 (review rounds 1+2 P2): beats advance at RATE 1 whatever the
      // speed detent says — walk beats are fixed OUTPUT seconds in the
      // export (tails never slow down; only play rides slowmo), so the
      // live play must pace them the same way or ½× would walk a 0.9 s
      // beat over 1.8 wall seconds the export renders in 0.9 (WYSIWYG).
      // The tick SPLITS at phase boundaries: one rate applied to a whole
      // crossing dt would skip up to dt·(1−speed) of the next phase.
      let next = pb.T, rem = dt;
      for (let g = 0; g < 8 && rem > 1e-9; g++) {
        const at = locate(next);
        // GH-363: LEAD windows advance at RATE 1 exactly like beats —
        // lead seconds are fixed output frames in the export (the
        // pre-strike choreography never rides the speed detent)
        const rate = at.beat || at.lead ? 1 : pb.speed;
        // PR-2: the cue tail is PLAY time (rides the speed detent exactly
        // like the export prices it through the montage loop), so the
        // phase boundary sits after it; beat segments carry no tail.
        // GH-864: the play phase ends at E_i — the tail or the completion
        // overhang, both play time.
        // A lead window's boundary is its own play start (cum[i]).
        const bnd = at.lead ? pb.cum[at.i]
          : pb.cum[at.i] + pb.segEndSec(at.i, pb.tails?.[at.i] ?? 0)
          + (at.beat ? pb.beats[at.i].beatSec : 0);
        const need = (bnd - next) / rate;
        if (!(need > 0) || need >= rem) { next += rem * rate; break; }
        next = bnd;
        rem -= need;
      }
      const wOut = effWindow().tOut; // GH-433: the associated span's end
      if (next >= wOut) {
        renderAtT(wOut, true); // play path: the tracked pose holds
        pb.playing = false;
        syncTransport();
        syncUi(); // GH-314: playback end = the paused pin — console returns
        return;
      }
      renderAtT(next, true);
      // GH-314: the auto-hide timer ticks on THIS render clock — the same
      // dt stream playback advances on. It only accumulates in the SHOWN
      // state ('hidden' needs no timer; every pin blocks it by definition),
      // and 'shown' can only exist while playing, so the loop is always
      // live when the timer matters.
      if (player?.dataset.ui === 'shown') {
        pb.ui.idleSec += dt;
        if (pb.ui.idleSec >= UI_HIDE_SEC) pb.ui.wantShown = false;
      }
      // GH-314 owner amendment (QuickTime semantics): the hide-on-leave
      // grace rides the SAME render clock — the mouse left the document
      // (onBedLeave) and did not come back within the grace, so the
      // overlay hides now; a pin simply outranks the wantShown drop in
      // syncUi, and the resume re-arm law is untouched (a pin releasing
      // with the pointer still out re-shows, then hides one grace later).
      if (pb.ui.pointerOut) {
        pb.ui.outSec += dt;
        if (pb.ui.outSec >= UI_LEAVE_GRACE_SEC) pb.ui.wantShown = false;
      }
      syncUi();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Close the player and put the live table back. ONE restore path
   * (restoreLive) shared with the open-failure unwind: the pre-open record
   * re-stages with its ORIGINAL identity so the post-close settle routes the
   * replay-identity paths, and a bed that was swapped for the session is
   * re-racked from the captured template bytes. */
  function closePlayer(reopenList = true) {
    if (!pb) return;
    if (rendering) {
      // a live save render owns the table and its finally re-stages LAST —
      // a teardown now would be overwritten (staged record + paused latch
      // left behind = PLAYBACK soft-lock). Cancel instead; close after the
      // abort unwinds (the closeCard law).
      try { window.__export?.cancel?.(); } catch { /* stale seam */ }
      return;
    }
    disarmCue(); // post-strike cue dies with the player (design 277 s3);
    // the close restore's live-state emission is dvr-marked, so the live
    // lane (cuepostlive.js) never mistakes it for a stroke of its own
    const s = pb;
    pb = null;
    // latch the camera assignments for a same-session reopen (GH-273)
    if (s.meta?.id != null) {
      camLatch.delete(s.meta.id); // re-insert = refresh FIFO position
      camLatch.set(s.meta.id, { plan: clonePlan(s.plan), segs: s.records.length });
      if (camLatch.size > CAM_LATCH_MAX) {
        camLatch.delete(camLatch.keys().next().value);
      }
    }
    if (s.raf) cancelAnimationFrame(s.raf);
    window.__track?.stop?.();
    // disarm the POV script too (GH-275, one-writer law): an armed
    // pose(t) rig would re-pose the RESTORED live camera on every RAF
    // frame after the close — the same class __track.stop() guards
    try { window.__test.cameraScript?.(null); } catch { /* stale rig */ }
    try { stripUi?.unmount?.(); } catch { /* strip leaf degrade */ }
    unwireBedTap(); // GH-314: the document-level observers die with the player
    // GH-364 (review r12 P2): release the preview canvas's DPR-scaled
    // backing store WITH the player — a detached canvas referenced by
    // P.strike would pin ~12 MiB (phone DPR3) to tens of MiB (desktop)
    // until the next open
    if (P.strike) {
      P.strike.width = 0;
      P.strike.height = 0;
      P.strike = null;
    }
    P.back = null; // GH-684: the pill dies with the player
    releaseHelpTitle(P.speed); // r9 (review r6 P2): the strip leaves the registry with its player
    P.speed = null;
    player?.remove();
    player = null;
    // r10 (round-9 checker P4): every OTHER P.* handle into the removed
    // subtree is dropped too — track, playhead, chips, the button maps —
    // so the last closed player's chrome (listeners included) is
    // collectable, not pinned by the module closure until the next open;
    // readers guard on `pb && player` (resize, locale). Node-valued keys
    // whose nodes are ALL disconnected only: the list's handles stay.
    releasePlayerHandles();
    document.documentElement.classList.remove('ob-pb-live');
    // 035a no-reopen law (contract §4 law 1): a wall launch opened with
    // `openSession(id, { reopenList: false })` lands on the LIVE table when
    // the user closes it; every other caller keeps today's flag
    const reopen = reopenList && s.launch?.reopenList !== false;
    restoreLive(s, { reopenList: reopen });
    // GH-717: the exit hands focus on — to the invoker when it is still
    // visible, else the table successor walk. A reopened list owns focus
    // through the kit's focus-on-present anchor (its Escape returns to the
    // list's own invoker via restoreTo); only a refused reopen falls here.
    if (!(reopen && listOpen)) focusAfterClose(s.invoker);
  }

  // ---- player DOM (mockup 02) -------------------------------------------------
  let player = null;
  const P = {}; // live element refs: track, playhead, bubble, tcur, ttot, …
  // r10 (round-9 checker P4): the handle census. A P.* value that is a node,
  // or an array / Map / plain object of nodes, every one of them
  // disconnected, is a DETACHED handle — the only reference keeping that
  // subtree alive once its owner removed it.
  const isPNode = (v) => typeof Node === 'function' && v instanceof Node;
  const pNodesOf = (v) => (isPNode(v) ? [v]
    : Array.isArray(v) ? v
      : v instanceof Map ? [...v.values()]
        : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
          ? Object.values(v) : null);
  /** Keys of P whose value holds only disconnected nodes (read-only census). */
  function detachedHandles() {
    const out = [];
    for (const k of Object.keys(P)) {
      const ns = pNodesOf(P[k]);
      if (ns && ns.length && ns.every((n) => isPNode(n) && !n.isConnected)) out.push(k);
    }
    return out;
  }
  function releasePlayerHandles() { for (const k of detachedHandles()) P[k] = null; }
  /** GH-684: launch intent handed from `openSession` to the NEXT player
   * build (consumed at `pb = {…}`, cleared in openSession's finally so a
   * refused open never leaks it onto a later list-row open). */
  let pendingLaunch = null;
  // ---- GH-717: DVR focus law (entry INTO the player, exit to the INVOKER) --
  // buildPlayer adds html.ob-pb-live, which stands the HUD down (visibility)
  // under the focused control — Blink's focus fixup then dropped focus to
  // <body> on every launch path, and closePlayer's player.remove() did the
  // same on every exit (ledger #703 R2-L3, verifier dvr-focus-body: six
  // legs). Entry now lands on the first transport control (Play), and every
  // exit hands focus to the invoker when it is still visible, else to the
  // table register's primary — the GH-682 successor walk (#shoot, a HUD
  // control, the scene canvas, the DVR pill, the hall pill) — never <body>.
  // A list reopen (Back to recordings) leaves the handoff to the kit's
  // focus-on-present anchor; the list's own Escape restores through
  // `restoreTo` = the element that opened the list (leg D).
  let pendingInvoker = null; // captured at openPlayer entry, consumed at pb = {…}
  let listInvoker = null;    // the element that opened the list (outside it)
  const focusVisible = (el) => {
    if (!el?.isConnected || el.getClientRects().length === 0) return false;
    if (getComputedStyle(el).visibility !== 'visible') return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false;
    }
    return true;
  };
  const focusUsable = (el) => !!el && el !== document.body && !el.hidden
    && el.disabled !== true && typeof el.focus === 'function'
    && !el.closest?.('[inert]') && focusVisible(el);
  function captureInvoker() {
    const ae = document.activeElement;
    return focusUsable(ae) && !(player && player.contains(ae)) ? ae : null;
  }
  /** Walk the candidates in law order until one ACTUALLY holds focus. */
  function focusFirst(cands) {
    const seen = new Set();
    for (const el of cands) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (!focusUsable(el)) continue;
      try { el.focus({ preventScroll: true }); } catch { continue; }
      if (document.activeElement === el) return el;
    }
    return null;
  }
  function tableSuccessors() {
    const hud = document.getElementById('hud');
    const cands = [document.getElementById('shoot'),
      ...(hud?.querySelectorAll('button, input, select') ?? [])];
    const cv = document.querySelector('body > canvas');
    if (cv) { if (!cv.hasAttribute('tabindex')) cv.tabIndex = -1; cands.push(cv); }
    cands.push(document.getElementById('ob-playback'),
      document.getElementById('ob-shell-open'));
    return cands;
  }
  /** Entry: the first transport control, else the session chip (a
   * script-focusable anchor — the kit's focus-on-present idiom). */
  function focusIntoPlayer() {
    if (!player) return null;
    const cands = [P.play, ...player.querySelectorAll('button:not([disabled])')];
    let got = focusFirst(cands);
    if (!got && P.chip) {
      P.chip.tabIndex = -1;
      P.chip.dataset.obPresentFocus = '';
      got = focusFirst([P.chip]);
    }
    return got;
  }
  /** Exit: the invoker when still visible, else the table successor walk.
   * Re-checked on the next task: restoreLive's state emission (which
   * re-enables #shoot) and the kit's exit fades can land after this call. */
  function focusAfterClose(invoker) {
    const walk = () => focusFirst([invoker, ...tableSuccessors()]);
    const got = walk();
    setTimeout(() => {
      const now = document.activeElement;
      if (!now || now === document.body) walk();
    }, 0);
    return got;
  }
  /** The list's close-time fallback (dialog.js restoreTo): the element that
   * opened it, else the DVR pill, else the table walk. */
  function listReturnTarget() {
    const cands = [listInvoker, ...tableSuccessors()];
    return cands.find((el) => focusUsable(el)) ?? null;
  }
  /** The back pill's key names its DESTINATION: a wall launch
   * (`openSession(id, { reopenList: false })`, replays.md §4 law 1) lands
   * on the LIVE table → `playback.backToTable`; the modal's own row path
   * re-opens the list → `playback.back`. 035c's `#ob-pb-return` (FR-026)
   * is the full cure; until it ships the label must not promise the list. */
  function backKey() {
    return pb?.launch?.reopenList === false ? 'playback.backToTable' : 'playback.back';
  }
  /** (Re)name the back pill from backKey(): data-i18n-title carries the key
   * so applyDom re-keys title + aria-label on a live locale switch. */
  function relabelBack() {
    const b = P.back;
    if (!b) return;
    const key = backKey();
    b.dataset.i18nTitle = key;
    b.title = t(key);
    b.setAttribute('aria-label', t(key));
  }

  // ---- GH-314: the immersive-console 3-state overlay machine -------------------
  // States (the owner-approved A+C+D-lite contract on GH-314):
  //   'hidden'  — state 1: nothing covers the video (chrome children at
  //               opacity 0 / visibility hidden; #ob-pb-fade stays — it is
  //               rendered CONTENT, not chrome).
  //   'shown'   — state 2: the transient reveal; the render-clock timer in
  //               setPlaying's step loop hides it after UI_HIDE_SEC.
  //   'pinned'  — state 3: any editing engagement holds the overlay.
  // The video NEVER resizes: the player was always a fixed inset-0 layer
  // over the live WebGL bed, and every state transition below is
  // opacity/transform-only CSS on the overlay children (e2e-playback arm
  // 18 asserts the renderer size byte-constant across all three states).
  //
  // PIN CONDITIONS — enumerated, each e2e-armed (arm 18d):
  //   paused    — !pb.playing (the player opens paused; playback end pins)
  //   scrub     — a wireTrack playhead drag in progress
  //   trim      — a wireTrack in/out handle drag in progress
  //   strip     — the director strip is EXPANDED (D-lite: expanded strip =
  //               pinned overlay, playing or not)
  //   stripEngage — a seam/anchor interaction: seam drag, block selection,
  //               slot flyout (fresh playback-strip.js seams.engaged())
  //   picker    — the transition picker stands (read off the DOM id so a
  //               STALE strip module still pins it)
  //   capture   — the tripod capture latch (pb.captureLatch)
  //   card      — the save card is open (rendering rides this: the card
  //               cannot close mid-render)
  //   hold      — any pointer currently PRESSED inside the console (the
  //               belt that keeps a stale-strip drag or any long press
  //               from losing its surface mid-gesture)
  function uiPins() {
    if (!pb) return null;
    let stripExpanded = false, stripEngaged = false;
    try {
      const seams = stripUi?.seams;
      if (seams?.mounted?.() === true) {
        // a STALE pre-314 strip (mounted, but no expanded/engaged seams)
        // IS the build-15 always-expanded lane, and its selections show a
        // body-level hint this machine cannot see — treat it as EXPANDED,
        // so the whole console stands down to the build-15 static
        // register instead of auto-hiding under orphaned strip chrome
        // (review GH-314 r1 P2). An ABSENT strip (16z: no lane at all) has
        // nothing to orphan and keeps the full overlay machine.
        stripExpanded = typeof seams.expanded === 'function'
          ? seams.expanded() === true : true;
        stripEngaged = seams.engaged?.() === true;
      }
    } catch { /* stale strip leaf — the picker/hold pins still stand */ }
    return {
      paused: !pb.playing,
      scrub: pb.ui.trackDrag === 'head',
      trim: pb.ui.trackDrag === 'in' || pb.ui.trackDrag === 'out',
      strip: stripExpanded,
      stripEngage: stripEngaged,
      picker: !!document.getElementById('ob-pb-transpick')
        || !!document.getElementById('ob-pb-slotfly'),
      capture: !!pb.captureLatch,
      card: !!card,
      hold: pb.ui.holdIds.size > 0,
    };
  }

  /** The ONE writer of player.dataset.ui. Called per rendered frame from
   * the play loop (the render clock), and at every discrete edge (play/
   * pause, card open/close, capture latch, strip notifications via
   * ctx.ui.sync, bed taps). A pin RELEASE re-arms the transient reveal
   * (pinned → shown with a fresh idle clock — the resume re-arm law), so
   * resuming playback always shows the console once more before the timer
   * hides it. */
  function syncUi() {
    if (!pb || !player) return;
    const pins = uiPins();
    const pinned = Object.values(pins).some(Boolean);
    let next;
    if (pinned) next = 'pinned';
    else {
      if (pb.ui.lastState === 'pinned') { // resume re-arm
        pb.ui.wantShown = true;
        pb.ui.idleSec = 0;
      }
      next = pb.ui.wantShown ? 'shown' : 'hidden';
    }
    pb.ui.lastState = next;
    if (player.dataset.ui !== next) player.dataset.ui = next;
  }

  // ---- GH-314: bed-tap reveal wiring -------------------------------------------
  // The player surface is pointer-events: none, so taps on the video land
  // on the app canvas. These document-level CAPTURE listeners are pure
  // OBSERVERS of that traffic — they never preventDefault/stopPropagation
  // a console or canvas gesture (the gesture-byte-identity law: wireTrack /
  // trim / strip pointer streams are untouched) — with ONE exception: the
  // click synthesized by a REVEAL tap is eaten (capture, one-shot), so the
  // tap that shows the console can never also press a control that just
  // appeared under the finger. (What a bed tap did on build 15: NOTHING —
  // touch.js only resolves taps in AIM/BALL_IN_HAND and orbit.js only
  // claims right/middle/shift drags — so consuming the reveal tap changes
  // no shipped behavior, and a tap has never toggled play/pause.)
  //   tap while hidden → reveal (state 2)
  //   tap while shown  → dismiss (touch/pen ONLY; back to state 1, still
  //                      never play/pause)
  //   tap while pinned → no state change (the pin owns the overlay)
  // A press that grows a second pointer or moves past BED_TAP_SLOP_PX is a
  // camera gesture and never a tap.
  //
  // OWNER AMENDMENT (2026-08-02, QuickTime semantics — MOUSE only, the
  // phone register byte-unchanged): mouse MOTION is the desktop reveal
  // signal (onBedMove resets the idle clock and reveals a hidden console);
  // the mouse LEAVING the document hides after UI_LEAVE_GRACE_SEC on the
  // render clock unless pinned (onBedLeave/onBedEnter + the play-step
  // grace); the 3 s idle-hide still applies while the pointer rests
  // inside; a mouse dismiss-click is a no-op (motion would re-reveal it
  // instantly — desktop dismissal is the idle timer or pointer-leave);
  // the keydown reveal stays for a11y.
  const inConsole = (el) => !!(el instanceof Element && (player?.contains(el)
    || el.closest?.('.ob-pb-pop, .ob-pb-capbar, .ob-pb-strip-hint,'
      + ' #ob-pb-card, #ob-pb-panel')));
  function onBedDown(e) {
    if (!pb || !player) return;
    pb.ui.eatClick = false;
    // any press proves pointer PRESENCE — the hide-on-leave grace disarms
    // (a stale pointerOut surviving a leave would otherwise re-hide the
    // console one grace after a tap reveal)
    pb.ui.pointerOut = false;
    pb.ui.outSec = 0;
    if (inConsole(e.target)) {
      pb.ui.holdIds.add(e.pointerId);
      pb.ui.idleSec = 0; // any console interaction re-arms the timer
      pb.ui.bedPress = null;
      syncUi();
      return;
    }
    // a candidate tap exists ONLY while exactly one bed pointer is down —
    // a second finger is a camera gesture, and a LATER extra finger (3rd
    // of a pan) must not re-arm a candidate mid-gesture. PRIMARY and
    // UNMODIFIED only (review r2 P2): orbit.js claims middle/right/
    // shift-left presses as camera gestures, and a stationary camera
    // press must never flip the overlay on release.
    pb.ui.bedIds.add(e.pointerId);
    const primary = e.button === 0 && !e.shiftKey && !e.ctrlKey
      && !e.altKey && !e.metaKey;
    pb.ui.bedPress = primary && pb.ui.bedIds.size === 1
      ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  }
  function onBedMove(e) {
    if (!pb || !player) return;
    // GH-314 owner amendment (2026-08-02, QuickTime semantics): on the
    // DESKTOP register, MOUSE MOTION is the reveal signal — any mouse
    // pointermove over the (full-viewport) player re-arms the idle clock
    // and reveals a hidden console. Strictly pointerType 'mouse': touch
    // moves are gestures (the phone register keeps its shipped tap
    // semantics) and pens keep the tap grammar too. Pure observer — the
    // move itself is never consumed.
    if (e.pointerType === 'mouse') {
      pb.ui.mouseSeen = true;
      pb.ui.pointerOut = false;
      pb.ui.outSec = 0;
      pb.ui.idleSec = 0;
      if (player.dataset.ui === 'hidden') {
        pb.ui.wantShown = true;
        syncUi();
      }
    }
    const p = pb.ui.bedPress;
    if (!p || p.id !== e.pointerId) return;
    if (Math.abs(e.clientX - p.x) > BED_TAP_SLOP_PX
      || Math.abs(e.clientY - p.y) > BED_TAP_SLOP_PX) pb.ui.bedPress = null;
  }
  function onBedUp(e) {
    if (!pb || !player) return;
    pb.ui.holdIds.delete(e.pointerId);
    pb.ui.bedIds.delete(e.pointerId);
    const p = pb.ui.bedPress;
    if (p && p.id === e.pointerId) {
      pb.ui.bedPress = null;
      if (e.type === 'pointerup'
        && Math.abs(e.clientX - p.x) <= BED_TAP_SLOP_PX
        && Math.abs(e.clientY - p.y) <= BED_TAP_SLOP_PX) {
        const st = player.dataset.ui;
        if (st === 'hidden') {
          pb.ui.wantShown = true;
          pb.ui.idleSec = 0;
          pb.ui.eatClick = true; // the reveal tap is CONSUMED (contract)
        } else if (st === 'shown' && e.pointerType !== 'mouse') {
          // TOUCH/pen dismiss (the shipped phone semantics, byte-kept).
          // A MOUSE dismiss-click is deliberately a no-op since the owner
          // amendment (QuickTime semantics): motion re-reveals instantly,
          // so a mouse dismiss would be self-defeating — desktop
          // dismissal is the idle timer or pointer-leave.
          pb.ui.wantShown = false;
          pb.ui.eatClick = true;
        }
        // pinned: the tap neither hides nor toggles anything
      }
    }
    syncUi();
  }
  function onBedClick(e) {
    if (!pb?.ui.eatClick) return;
    pb.ui.eatClick = false;
    e.stopPropagation();
    e.preventDefault();
  }
  /** Keyboard reveal (a11y): a hidden console leaves the focus order with
   * its visibility, so a keyboard-only user would have NO path back to the
   * controls — any keydown re-arms the transient reveal instead. Pure
   * observer for every key EXCEPT Escape (GH-334, below). */
  function onBedKey(e) {
    if (!pb || !player) return;
    // GH-334: Escape closes the player like every other surface — but only
    // as the LAST layer. The strip's onDocKey registers BEFORE this
    // listener (buildPlayer mounts the strip, then wireBedTap), so a press
    // that dismissed the transition picker / slot flyout / capture bar
    // arrives here ALREADY CLAIMED (stopPropagation → cancelBubble) with
    // the surface gone from the DOM — honor the claim. dialog.js (card)
    // and select.js (combobox popover) register AFTER this listener, so
    // for them the gate is the open-layer predicate below, never reliance
    // on being pre-empted. A scrub/trim drag in flight keeps Escape inert
    // too: tearing the player down under a held pointer is no dismissal.
    // The close path is the existing back-pill one (closePlayer →
    // restoreLive), restore law and list reopen included.
    if (e.key === 'Escape' && !e.cancelBubble) {
      // review r4 P2: ANY open kit panel is a layer above the player — the
      // global `?` shortcut can stand Help over an open player, and every
      // backdropped panel (help/settings/card/confirm) owns its own Escape
      // through dialog.js. `.ob-backdrop` is the kit's one marker for them.
      const layered = document.getElementById('ob-pb-transpick')
        || document.getElementById('ob-pb-slotfly')
        || document.getElementById('ob-pb-capture')
        || document.getElementById('ob-pb-card')
        || document.querySelector('.ob-backdrop')
        || document.querySelector('[data-ob="select-list"]');
      // review r1+r2 P2: trackDrag only mirrors the scrub-bar's own drags —
      // holdIds is the ANY-held-CONSOLE-press belt (it also covers a stale
      // strip's drags, the same belt uiPins leans on) and bedIds the held
      // BED pointers (orbit/touch camera gestures): Escape never tears the
      // player down under any captured pointer.
      const held = pb.ui.trackDrag !== null || pb.ui.holdIds.size > 0
        || pb.ui.bedIds.size > 0;
      if (!layered && !held) {
        if (stripUi?.seams?.engaged?.() === true) {
          // a standing strip engagement is its own dismissal layer. The
          // FRESH strip's onDocKey clears a selection itself and claims
          // the press (cancelBubble — this branch never sees it); a
          // CACHED pre-GH-334 strip keeps engaged() true on a selection
          // it never clears, which would lock keyboard users out of the
          // close (review r2 P2) — dismiss through its own seams.dismiss()
          // (shipped on every strip build) and let the NEXT press close.
          try { stripUi.seams.dismiss?.(); } catch { /* stale seam */ }
        } else {
          e.preventDefault();
          e.stopImmediatePropagation();
          closePlayer();
          return;
        }
      }
    }
    pb.ui.idleSec = 0;
    // a keyboard reveal must STICK for the full idle window even when the
    // mouse sits outside the window (a11y: the keyboard user may have no
    // pointer in play at all) — the leave grace disarms with the keydown
    pb.ui.pointerOut = false;
    pb.ui.outSec = 0;
    if (player.dataset.ui === 'hidden') {
      pb.ui.wantShown = true;
      syncUi();
    }
  }
  /** GH-314 owner amendment (2026-08-02, QuickTime semantics): the MOUSE
   * leaving the document arms the hide-on-leave grace — the play step
   * hides the overlay UI_LEAVE_GRACE_SEC later unless a pin holds or the
   * pointer returns (onBedEnter / any mouse move cancels). Gated on
   * mouseSeen: touch-compat mouse events must never arm it, so the phone
   * register keeps its shipped tap semantics byte-identically. */
  function onBedLeave() {
    if (!pb || !player || !pb.ui.mouseSeen) return;
    pb.ui.pointerOut = true;
    pb.ui.outSec = 0;
  }
  function onBedEnter() {
    if (!pb) return;
    pb.ui.pointerOut = false;
    pb.ui.outSec = 0;
  }
  function wireBedTap() {
    document.addEventListener('pointerdown', onBedDown, true);
    document.addEventListener('pointermove', onBedMove, true);
    document.addEventListener('pointerup', onBedUp, true);
    document.addEventListener('pointercancel', onBedUp, true);
    document.addEventListener('click', onBedClick, true);
    document.addEventListener('keydown', onBedKey, true);
    document.documentElement.addEventListener('mouseleave', onBedLeave);
    document.documentElement.addEventListener('mouseenter', onBedEnter);
  }
  function unwireBedTap() {
    document.removeEventListener('pointerdown', onBedDown, true);
    document.removeEventListener('pointermove', onBedMove, true);
    document.removeEventListener('pointerup', onBedUp, true);
    document.removeEventListener('pointercancel', onBedUp, true);
    document.removeEventListener('click', onBedClick, true);
    document.removeEventListener('keydown', onBedKey, true);
    document.documentElement.removeEventListener('mouseleave', onBedLeave);
    document.documentElement.removeEventListener('mouseenter', onBedEnter);
  }

  function playerChipMeta(meta) {
    const when = new Date(meta.startTs ?? Date.now());
    return `${dayLabel(meta.startTs ?? Date.now())} `
      + `${when.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}`
      + ` · ${rowMetaText(meta)} · ${fmtT(pb.total)}`;
  }

  function buildPlayer() {
    player = document.createElement('div');
    player.id = 'ob-pb-player';
    // GH-314: the overlay opens PINNED (the player opens paused — a pin
    // condition), so the console is always visible on entry. syncUi is the
    // one writer from here on.
    player.dataset.ui = 'pinned';
    // GH-301 §2.4: the live dip-to-black fade layer — FIRST child, under
    // every piece of chrome (the export composites the same black into the
    // encoded frames; live keeps the controls readable over the dip)
    // GH-364: the strike-point PREVIEW layer — CONTENT like the fade (the
    // export burns the same plate), so it lives UNDER #ob-pb-fade in source
    // order (the export composites the plate BEFORE the dip — a cut's
    // dip-to-black darkens it with the scene) and playback.css excludes it
    // from the chrome hide rules exactly like the fade. Painted by
    // syncLiveStrike with the SAME strikeglyph.js draw the export burns.
    P.strike = document.createElement('canvas');
    P.strike.id = 'ob-pb-strike';
    P.strike.setAttribute('aria-hidden', 'true');
    player.appendChild(P.strike);
    P.fade = document.createElement('div');
    P.fade.id = 'ob-pb-fade';
    P.fade.setAttribute('aria-hidden', 'true');
    P.fade.style.opacity = '0';
    player.appendChild(P.fade);
    const shade = document.createElement('div');
    shade.className = 'ob-pb-shade';
    // top chrome: back pill + session chip + copy-link + Save
    const top = document.createElement('div');
    top.className = 'ob-pb-top';
    const back = document.createElement('button');
    back.type = 'button';
    // GH-245: kit icon pill under the glass chrome voice (.ob-pb-pillico
    // keeps the 44px over-bed size + glass-thin material)
    back.className = 'ob-btn ob-btn--icon ob-pb-pillico';
    P.back = back;
    relabelBack(); // GH-684: the pill names its DESTINATION (table / list)
    face(back, 'chevron-left', '‹');
    back.addEventListener('click', () => closePlayer());
    const chip = document.createElement('span');
    chip.className = 'ob-pb-chip';
    const chipT = document.createElement('span');
    chipT.className = 'ob-pb-chip-t';
    chipT.appendChild(rowTitle(pb.meta));
    chipT.title = chipT.textContent; // full text (A8: the readout wraps, never clips)
    const chipM = document.createElement('span');
    chipM.className = 'ob-pb-chip-m ob-nums';
    chipM.textContent = playerChipMeta(pb.meta);
    chip.append(chipT, chipM);
    // live-locale recompose hooks (drills #81 finding-6 law): the chip is
    // t()-composed textContent, invisible to applyDom — onLocaleChange
    // below re-runs these (QA wave: a locale switch with the player open
    // left an English chip beside 保存/转播)
    P.chipT = chipT;
    P.chipM = chipM;
    P.chip = chip; // GH-717: the controls-less entry anchor
    const grow = document.createElement('span');
    grow.className = 'ob-pb-grow';
    top.append(back, chip, grow);
    // v5 replay link (LIVE session only — archive.current() note)
    if (arch()?.current?.() === pb.meta.id
      && typeof window.__share?.encode === 'function') {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ob-btn ob-btn--icon ob-pb-pillico'; // GH-245 (back's twin)
      link.dataset.i18nTitle = 'playback.copyLink';
      link.setAttribute('aria-label', t('playback.copyLink'));
      face(link, 'share', '⇗');
      link.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(String(await window.__share.encode()));
          // GH-302 honest degrade: the encode may have DROPPED an
          // over-envelope camera plan — the chip must say so (feature-
          // detected: a stale share.js has no seam and no plan concept)
          chipM.textContent = t(window.__share.planDropped?.() === true
            ? 'playback.copiedNoPlan' : 'playback.copied');
          setTimeout(() => { if (pb) chipM.textContent = playerChipMeta(pb.meta); }, 2000);
        } catch { /* clipboard unavailable — chip stays */ }
      });
      top.appendChild(link);
    }
    // GH-245: the primary CTA through the kit factory (icon+label anatomy;
    // .ob-pb-save keeps the 44px over-bed height + glass blur). The primary
    // voice now walks its OWN hue ladder on hover/active (kit doctrine) —
    // the old hand-rolled hover dropped to a grey wash.
    const save = mkBtn({
      label: t('playback.save'), i18nKey: 'playback.save',
      icon: ico('export', 17), fallbackGlyph: '↓', variant: 'primary',
    });
    save.classList.add('ob-pb-save');
    save.addEventListener('click', () => openCard());
    if (pb.vm) {
      // view-only law (review merge-gate P2): renderDrill stages segments
      // under the STRICT version policy, so saving an old-kernel session
      // always failed AFTER the full card open + render start — disable at
      // the source, tooltip = the badge's own view-only wording
      save.disabled = true;
      save.dataset.i18nTitle = 'playback.oldKernelTitle';
      save.title = t('playback.oldKernelTitle');
    }
    top.appendChild(save);
    // shelf: camera tiles + montage chip + speed detents + transport row
    const shelf = document.createElement('div');
    shelf.className = 'ob-pb-shelf';
    const row1 = document.createElement('div');
    row1.className = 'ob-pb-row1';
    P.camBtns = new Map();
    for (const c of CAMS) {
      const b = document.createElement('button');
      b.type = 'button';
      // GH-245: the kit --tile primitive (kit rungs + focus ring);
      // .ob-pb-cam keeps the shelf's own 78px/dense-padding geometry and
      // the aria-pressed accent state
      b.className = 'ob-btn ob-btn--tile ob-pb-cam'
        + (c.desktop ? ' ob-pb-cam--desktop' : '');
      b.dataset.cam = c.id; // e2e hook (GH-273 real-input tile arms)
      b.setAttribute('aria-pressed', 'false');
      const gi = document.createElement('span');
      gi.setAttribute('aria-hidden', 'true');
      face(gi, c.icon, '◇', 19);
      const l = document.createElement('span');
      // kit .ob-caps = the caps voice (uppercase / tracking / weight); the
      // sheet keeps only the tile's own 10 px size + inherited ink
      l.className = 'ob-caps ob-pb-cam-l';
      l.dataset.i18n = `playback.cam.${c.id}`;
      b.append(gi, l);
      b.addEventListener('click', () => {
        if (!pb || pb.captureLatch) return;
        const n = camIdOf(c.id);
        // GH-301 §3.2: while a block is SELECTED the pill re-cams THAT
        // span; otherwise the tap inserts/updates a cut at the QUANTIZED
        // playhead, snap-assisted (at a shot boundary this is
        // byte-identical to the GH-273 write). Strip absent (stale leaf) =
        // the exact GH-273 boundary write — the recorded degrade (§3.4).
        // planChanged() inside the write owns the schedule refresh + the
        // re-apply key; the repaint below keeps the paused-tap WYSIWYG law.
        if (!stripUi?.retarget?.(n)) {
          if (stripUi?.seams?.mounted?.()) stripUi.insertAtPlayhead(n);
          else {
            writeCut({ seg: pb.curIdx, t: 0, cam: n, transitionIn: 0, dur: 0 },
              { degenerate: true });
          }
        }
        // WYSIWYG while paused: the player holds manual mode (the RAF loop
        // stands down), so a tile tap must repaint the bed itself — without
        // this the new framing only appeared on the next scrub/play (QA)
        renderAtT(pb.T);
      });
      P.camBtns.set(c.id, b);
      row1.appendChild(b);
    }
    const grow1 = document.createElement('span');
    grow1.className = 'ob-pb-grow';
    P.montage = document.createElement('span');
    P.montage.className = 'ob-caps ob-pb-montage ob-nums'; // caps voice = kit
    // GH-668 S5 G4 (B-RP03 / B-K16): the speed detents are kit
    // `.ob-segmented` radios (same law as the list's filter strip —
    // intrinsic segments, checked register + ring composed by the kit,
    // arrow keys move the detent). P.speedBtns maps detent → its radio so
    // the setSpeed seam writes ONE truth (`checked`).
    const speed = document.createElement('span');
    P.speed = speed; // r9: closePlayer's help-title release handle (review r6 P2)
    speed.className = 'ob-pb-speed ob-segmented';
    speed.setAttribute('role', 'radiogroup');
    helpTitle(speed); // r8: hasLocal-gated (review r5 P3)
    P.speedBtns = new Map();
    for (const s of SPEEDS) {
      const lab = document.createElement('label');
      lab.dataset.speed = String(s);
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'ob-pb-speed';
      inp.value = String(s);
      inp.checked = s === pb.speed;
      const txt = document.createElement('span');
      txt.className = 'ob-control ob-nums';
      // the detents read 1× / ½× / ¼× (the shelf's recorded vocabulary —
      // header + OWNERSHIP): ratio glyphs keep the kit's equal-to-longest
      // segments narrow, so the phone row1 keeps its slack (arm 16's A2
      // preset-pill equality: a tile must never be squeezed by the strip)
      txt.textContent = s === 1 ? '1×' : s === 0.5 ? '½×' : s === 0.25 ? '¼×' : `${s}×`;
      lab.append(inp, txt);
      inp.addEventListener('change', () => {
        if (!pb || !inp.checked) return;
        pb.speed = s;
        syncMontage();
        // GH-301 review round-2 P2: fade alpha rides the speed-mapped
        // output clock — a paused playhead inside a window repaints NOW
        setLiveFade(pb.captureLatch ? 0 : evalAlpha(pb.T));
        // GH-364 (review r3 P2): the strike alpha rides the same clock —
        // a paused playhead inside the linger repaints with the detent
        syncLiveStrike(locate(pb.T), pb.T);
      });
      P.speedBtns.set(s, inp);
      speed.appendChild(lab);
    }
    import('./ui/controls.js').then((m) => { m.upgradeSegmented?.(speed); })
      .catch(() => { /* stale kit: the strip is still a segmented */ });
    row1.append(grow1, P.montage, speed);
    P.row1 = row1; // GH-301: the strip's slot pills insert before .ob-pb-grow
    shelf.append(row1, buildTransportRow());
    player.append(shade, top, shelf);
    document.body.appendChild(player);
    applyDom(player);
    syncMontage();
    syncTransport();
    // GH-301: mount the director strip once the player DOM is attached
    // (geometry measures the LAID-OUT track); absent/stale leaf = the
    // GH-273 pill-only player, exactly (§3.4)
    try { stripUi?.mount?.(); } catch { /* strip leaf degrade */ }
    wireBedTap(); // GH-314: tap-to-reveal observers (unwired at close)
    // GH-717: focus moves INTO the player on every launch path — in the
    // same task as the ob-pb-live stand-down, before Blink's focus fixup
    // can drop the hidden HUD control's focus to <body>
    focusIntoPlayer();
  }

  function buildTransportRow() {
    const row2 = document.createElement('div');
    row2.className = 'ob-pb-row2';
    P.row2 = row2; // GH-301: the strip lane mounts as a SIBLING under P.track
    P.play = document.createElement('button');
    P.play.type = 'button';
    // GH-245: kit icon pill; .ob-pb-play keeps the 38px transport size.
    // Face stays a DIRECT write (no anatomy slot): syncTransport re-faces
    // it per rendered frame and face() handles the idempotence either way.
    P.play.className = 'ob-btn ob-btn--icon ob-pb-play';
    P.play.addEventListener('click', () => setPlaying(!pb?.playing));
    P.tcur = document.createElement('span');
    P.tcur.className = 'ob-pb-tcur ob-nums';
    P.track = document.createElement('div');
    P.track.className = 'ob-pb-track';
    // GH-718: the scrub track IS the seek slider — a real, focusable
    // role=slider (the shipped track visuals, no new chrome) whose value is
    // the playhead time; wireSeekKeys owns the keyboard, syncTransport the
    // aria value (valuetext = the same mm:ss.t the readout paints).
    P.track.setAttribute('role', 'slider');
    P.track.tabIndex = 0;
    P.track.setAttribute('aria-label', t('playback.seek'));
    P.track.setAttribute('aria-valuemin', '0');
    syncSliderRange(); // valuemax = the schedule total, valuenow/valuetext
    // the playhead (GH-718 review r1: republished by relayoutTrack on every
    // pb.total change — a lead-in / camera-walk toggle re-lengthens the clip)
    // shot-boundary ticks (dataset.seg anchors the GH-299 relayout — a
    // camera-assignment change inserts/removes walk beats mid-session)
    for (let i = 1; i < pb.cum.length; i++) {
      const seg = document.createElement('span');
      seg.className = 'ob-pb-seg';
      seg.dataset.seg = String(i);
      seg.style.left = `${(100 * pb.cum[i] / pb.total).toFixed(2)}%`;
      P.track.appendChild(seg);
    }
    // trim selection band + dimmed out-takes
    P.dimL = document.createElement('span');
    P.dimL.className = 'ob-pb-dim ob-pb-dim--l';
    P.dimR = document.createElement('span');
    P.dimR.className = 'ob-pb-dim ob-pb-dim--r';
    P.trim = document.createElement('span');
    P.trim.className = 'ob-pb-trim';
    P.track.append(P.dimL, P.dimR, P.trim);
    // key-moment markers off the session detail (judgment ledger)
    P.markers = [];
    const shotMarkers = (pb.detail?.markers ?? []).filter((x) => x.kind === 'shot');
    for (const sm of shotMarkers) {
      const i = sm.idx ?? 0;
      if (i >= pb.durs.length) continue;
      const end = pb.cum[i] + pb.durs[i];
      const glyphs = markerGlyphs(pb.meta.gameId, sm);
      glyphs.forEach((g, k) => {
        const holder = document.createElement('span');
        holder.className = 'ob-pb-mark';
        const at = Math.max(pb.cum[i], end - 0.35 * (glyphs.length - 1 - k));
        holder.dataset.t = String(at);
        // content anchor for the GH-299 relayout: segment + offset from its
        // start (beat-independent — the offset lives inside the segment)
        holder.dataset.seg = String(i);
        holder.dataset.rel = String(at - pb.cum[i]);
        holder.style.left = `${(100 * at / pb.total).toFixed(2)}%`;
        holder.appendChild(g);
        P.markers.push(holder);
        P.track.appendChild(holder);
      });
    }
    if ((pb.detail?.markers ?? []).some((x) => x.kind === 'drill' && x.ev === 'complete')) {
      const holder = document.createElement('span');
      holder.className = 'ob-pb-mark';
      holder.dataset.t = String(pb.total);
      holder.dataset.end = '1'; // GH-299 relayout: pinned to the total
      holder.style.left = '99%';
      holder.appendChild(sparkle('drill'));
      P.markers.push(holder);
      P.track.appendChild(holder);
    }
    // trim handles + playhead + scrub bubble
    P.hIn = document.createElement('span');
    P.hIn.className = 'ob-pb-handle';
    P.hOut = document.createElement('span');
    P.hOut.className = 'ob-pb-handle';
    P.playhead = document.createElement('span');
    P.playhead.className = 'ob-pb-playhead';
    P.bubble = document.createElement('span');
    P.bubble.className = 'ob-pb-bubble ob-nums';
    P.track.append(P.hIn, P.hOut, P.playhead, P.bubble);
    P.ttot = document.createElement('span');
    P.ttot.className = 'ob-pb-ttot ob-nums';
    P.ttot.textContent = fmtT(pb.total);
    row2.append(P.play, P.tcur, P.track, P.ttot);
    wireTrack();
    return row2;
  }

  /** Pointer wiring: handle drags trim, anywhere else drags the playhead
   * (rAF-throttled live scrub either way). touch-action none rides the CSS. */
  function wireTrack() {
    let dragging = null; // 'head' | 'in' | 'out'
    const timeOf = (ev) => {
      const r = P.track.getBoundingClientRect();
      const x = Math.min(Math.max(ev.clientX - r.left, 0), r.width);
      return pb ? (x / Math.max(r.width, 1)) * pb.total : 0;
    };
    const move = (ev) => {
      if (!pb || !dragging) return;
      const T = timeOf(ev);
      if (dragging === 'in') pb.tIn = Math.min(T, pb.tOut - 0.1);
      else if (dragging === 'out') pb.tOut = Math.max(T, pb.tIn + 0.1);
      P.bubble.classList.add('on');
      P.bubble.style.left = `${(100 * (dragging === 'head' ? T : dragging === 'in' ? pb.tIn : pb.tOut) / pb.total).toFixed(2)}%`;
      P.bubble.textContent = fmtT(dragging === 'head' ? T : dragging === 'in' ? pb.tIn : pb.tOut);
      syncMontage();
      scrubTo(dragging === 'head' ? T : dragging === 'in' ? pb.tIn : pb.tOut);
    };
    P.track.addEventListener('pointerdown', (ev) => {
      if (!pb) return;
      setPlaying(false);
      dragging = ev.target === P.hIn ? 'in' : ev.target === P.hOut ? 'out' : 'head';
      // GH-314: mirror the drag kind so the scrub/trim pins are enumerable
      // (ADDITIVE state write — the gesture stream itself is untouched)
      pb.ui.trackDrag = dragging;
      syncUi();
      P.track.setPointerCapture(ev.pointerId);
      move(ev);
    });
    P.track.addEventListener('pointermove', move);
    const up = () => {
      dragging = null;
      P.bubble.classList.remove('on');
      if (pb) { pb.ui.trackDrag = null; syncUi(); } // GH-314 pin release
    };
    P.track.addEventListener('pointerup', up);
    P.track.addEventListener('pointercancel', up);
    wireSeekKeys();
  }

  /** GH-718: keyboard seek — consumed ONLY while the slider itself holds
   * focus (a Tab stop of the transport row), so the aim widget's arrow
   * keys and the strip's own key surfaces never see a press meant for the
   * track. Steps: ←/→ ±1 s (±5 s with Shift), PageUp/PageDown ±10 s,
   * Home/End = clip start/end; ↑/↓ mirror ←/→ (WAI-ARIA slider pattern).
   * The seek renders synchronously (renderAtT, not the pointer path's
   * rAF-batched scrubTo) so the readout, the thumb and the aria value
   * agree on the very press; play state is left as it was. */
  const SEEK_STEP = 1, SEEK_STEP_BIG = 5, SEEK_PAGE = 10;
  function wireSeekKeys() {
    P.track.addEventListener('keydown', (e) => {
      if (!pb || document.activeElement !== P.track) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      let T;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowUp':
          T = pb.T + (e.shiftKey ? SEEK_STEP_BIG : SEEK_STEP); break;
        case 'ArrowLeft': case 'ArrowDown':
          T = pb.T - (e.shiftKey ? SEEK_STEP_BIG : SEEK_STEP); break;
        case 'PageUp': T = pb.T + SEEK_PAGE; break;
        case 'PageDown': T = pb.T - SEEK_PAGE; break;
        case 'Home': T = 0; break;
        case 'End': T = pb.total; break;
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
      pb.pendingT = null; // a batched pointer scrub must not overwrite this seek
      pb.ui.idleSec = 0;  // GH-314: a seek is an interaction (keeps the console)
      renderAtT(Math.min(Math.max(T, 0), pb.total));
      syncMontage();
    });
  }

  /** renderDrill's HARD floor, mirrored (review rounds 3+4 P2; see planFits).
   * The settle beats are FIXED output frames — the montage rate only
   * compresses PLAY time — and every positive segment costs at least one
   * play frame on top, so past a certain segment count the cap is
   * unreachable no matter how fast the montage runs. Uses the renderer's
   * own rounding (`Math.round(tailSec * 60)` per segment) so the two agree
   * exactly at the boundary: at the 60 s floor, 224 included shots is the
   * last feasible plan at the shipped 0.25 / 0.5 s beats (GH-304: a derived
   * budget moves the wall with the same arithmetic). Past it the CTA used
   * to promise an ETA for a render that could only throw; now the card says
   * so and disables. */
  /** The plan's quality resolution ({ hh, qual, tier }) — ONE reader for
   * savePlan and planBudget (GH-304: the budget must price the exact
   * tier/height the plan will render — a second copy of this ternary could
   * silently diverge). GH-259 quality picker: an ABSENT select (no card,
   * stale export.js, or a float-blend-gated GPU that never rendered it)
   * resolves to 'auto', and 'auto' keeps the EXACT pre-GH-259 ternary —
   * the default plan stays JSON-byte-identical (e2e-playback arm 3h pins
   * it against the degraded card). */
  function planQuality() {
    const hh = P.resSel ? Number(P.resSel.value) : 1080;
    const qual = P.qualSel?.value ?? 'auto';
    return { hh, qual,
      // width MUST pair with height (the savePlan law): drillRender fills a
      // missing width from tier.defaultRes — one map, shared with the
      // transcode-provenance check below
      width: { 720: 1280, 1080: 1920, 2160: 3840 }[hh]
        ?? Math.round(hh * 8 / 9) * 2,
      tier: qual === 'auto' ? (hh === 2160 ? 'ultra4k' : 'standard')
        : 'cinematic' };
  }

  /** GH-304 (review round-1 P2): the PLAN-level Photos-via-transcode truth.
   * photosBridge() alone priced the 192 MiB transcode wall even when the
   * settled probe says this engine cannot transcode the plan's own webm —
   * halving the budget (and degrading walk beats) for a destination
   * destsFor could never offer. Mirrors transcodeOkFor()'s clip law over
   * the PLAN's provenance instead of a rendered blob's: the offline webm
   * sink encodes vp9, savePlan pins withAudio, dims come from the picker.
   * A PENDING probe answers true (the tight wall — see the null branch);
   * a settled UNUSABLE probe answers false (the wire wall). Either settle
   * drops the card snapshot so the press reads the settled truth. */
  function planPhotosTranscode() {
    const p = transcodeCap;
    // PENDING probe (review round-4 P2): answer TRUE — the tight transcode
    // wall stands until the probe rules Photos out. The CTA only waits for
    // the ENCODER probe, so a quick press could otherwise snapshot the
    // wire-wall budget and render a webm the settled probe then earns a
    // Photos offer for — over TRANSCODE_MAX_BYTES, Photos silently gone
    // after an expensive render. Pending→true only ever SHRINKS a
    // pre-settle plan (conservative, never a broken promise); the settle
    // invalidates the snapshot and re-derives the honest wall either way.
    if (p === null) return true;
    if (p?.ok !== true) return false;
    if (!p.vp9 || !(p.opus && p.aacEnc)) return false;
    const { hh, width } = planQuality();
    if (width > 1920 || hh > 1080) {
      if (!(p.avcUhd && p.vp9Uhd === true)) return false;
    }
    return true;
  }

  /** GH-304: THE plan-time budget — the one number every consumer of the
   * export ceiling reads (exportBeats' degrade sweep, and through its
   * return value planFits, plannedMontage, the card copy and the plan's
   * opts.budgetSec into renderDrill's cap loop — no second derivation
   * anywhere; the seconds arithmetic itself lives in offline-render.js
   * exportBudgetSec, reached through the __export.exportBudget seam).
   * Two-layer honesty chain (the walkBeatCapable shape): a non-floor
   * budget exists only when export.js AND the linked engine are
   * budget-capable — a stale layer anywhere floors the mirrors AND the
   * render together, so the card and the file can never disagree. The
   * floor is the pre-304 CLIP_CAP_SEC constant, never a larger guess.
   * While a card is open the result is SNAPSHOTTED per (tier, height,
   * photos) tuple — see the cardBudget doc for the paint/press law. */
  function planBudget() {
    const floor = { sec: CLIP_CAP_SEC, derived: false };
    try {
      if (window.__export?.byteBudgetCapable !== true
        || typeof window.__export.exportBudget !== 'function') return floor;
      // GH-304 (review round-3 P1): a shell whose save/photos bridge lacks
      // the CHUNKED stream (streamBridge null) delivers through the v1
      // whole-string base64 postMessage — the measured jetsam wire GH-256
      // replaced (~4x the clip in page-side peak). A derived budget could
      // grow clips toward the 326 MiB class there; the floor is the only
      // honest ceiling on that wire (the shipped 60 s behavior it already
      // survives). Bridge presence is documentStart-static, so this never
      // flips under an open card.
      {
        const b = bridges();
        if ((b.saveVideo || b.photos) && streamBridge() === null) return floor;
      }
      const { hh, tier } = planQuality();
      const photos = photosBridge() && planPhotosTranscode();
      const key = `${tier}:${hh}:${photos}`;
      if (card && cardBudget?.key === key) {
        return { sec: cardBudget.sec, derived: cardBudget.derived };
      }
      // GH-313 review r2 P2 (the B2 follow-through): while the card shows a
      // DELIVERED file, the press-time snapshot IS the budget truth for
      // every repaint — a probe settle may flip the PHOTOS half of the key
      // under a DONE card, and a later repaint (locale switch) deriving
      // through the new key would paint a budget that did not produce the
      // delivered blob. Latched to the same (tier, height): a USER pick
      // change exits the delivered state through its own invalidation and
      // derives fresh. Conservative by construction — pending→true only
      // ever SHRINKS the pre-settle plan, so the retained value never
      // over-promises; the next press re-derives at the top of startRender.
      if (card && lastBlob && cardBudget?.key?.startsWith(`${tier}:${hh}:`)) {
        return { sec: cardBudget.sec, derived: cardBudget.derived };
      }
      const b = window.__export.exportBudget({ tier, height: hh, photos });
      const out = Number.isFinite(b?.sec) && b.sec >= 1
        ? { sec: Math.floor(b.sec), derived: b.derived === true } : floor;
      // never REPLACE the delivered state's snapshot (same law as above:
      // the transient mismatched-key derivations around a pick change must
      // not overwrite what the delivered copy stands on)
      if (card && !lastBlob) cardBudget = { key, ...out };
      return out;
    } catch { return floor; }
  }

  /** GH-299: the EXPORT beat schedule — the SAME builder (beatFor) over the
   * trim-sliced included segments: walks only between CONSECUTIVE included
   * POV→POV pairs, computed AFTER trim slicing (tIn inside segment k drops
   * k−1 entirely, so no half-beats; a trimmed exit recomputes the walk from
   * the trimmed exit pose) — then the montage-budget law (owner verdict on
   * GH-299, over-cap call): beats are FIXED output frames exactly like the
   * 0.25/0.5 s settle tails, so when they would leave the budget (GH-304:
   * planBudget()'s byte-derived seconds; the 60 s floor uncalibrated)
   * INFEASIBLE (renderDrill's planFits floors: ≥ max(60, n) play frames),
   * walks are kept FIRST-FIT in play order — a boundary whose walk no
   * longer fits the remaining tail budget DEGRADES to the INNER_TAIL hard
   * cut and the sweep continues, so a later, shorter walk may still keep
   * its beat (deliberately not a strict prefix: same determinism, strictly
   * more one-take per budget — review GH-299 round 1 pinned the docs to the
   * behaviour). The amber card notice (cardQuality.refresh) states the
   * degraded count. Deterministic pure arithmetic; savePlan, planFits,
   * plannedMontage and (through the plan) renderDrill all consume THIS one
   * schedule — and THIS one budget, returned as budgetSec/budgetDerived. */
  function exportBeats(inc, uncapped = false) {
    const n = inc.length;
    const beats = Array(n).fill(null);
    const { sec: budgetSec, derived: budgetDerived } = planBudget();
    if (window.__test?.twoClock !== true) {
      return { beats, degraded: 0, budgetSec, budgetDerived };
    }
    for (let j = 0; j + 1 < n; j++) {
      const a = inc[j], b = inc[j + 1];
      if (b.i !== a.i + 1) continue; // never across a dropped segment
      // GH-301: the SAME plan-aware pair law as liveBeats (one builder)
      if (camAtSegEnd(a.i) !== 'pov' || effectiveCam(b.i) !== 'pov') continue;
      if (!seamWalks(b.i)) continue;
      beats[j] = beatFor(a.i, a.endT ?? pb.durs[a.i]);
    }
    // GH-305 (`uncapped` — the full-game mode): the budget sweep below is
    // the MONTAGE ceiling's arithmetic, and a streamed full-length plan is
    // exempt from it BY DESIGN (no ArrayBufferTarget to bound) — every
    // built walk keeps its beat, exactly like the live player.
    if (uncapped) return { beats, degraded: 0, budgetSec, budgetDerived };
    const innerF = Math.round(INNER_TAIL * 60);
    const budget = budgetSec * 60 - Math.round(FINAL_TAIL * 60)
      - Math.max(60, n); // the planFits play floor, reserved up front
    let degraded = 0, spent = 0, later = Math.max(0, n - 1) * innerF;
    for (let j = 0; j + 1 < n; j++) {
      later -= innerF; // the later boundaries' minimum (hard-cut) cost
      if (!beats[j]) { spent += innerF; continue; }
      const cost = Math.round(beats[j].beatSec * 60);
      if (spent + cost + later <= budget) { spent += cost; continue; }
      beats[j] = null; // over-budget: this boundary exports as a hard cut
      degraded += 1;
      spent += innerF;
    }
    return { beats, degraded, budgetSec, budgetDerived };
  }

  /** GH-363: the EXPORT lead-in schedule — leads[j] = { sec, tier, fuse }
   * for included slice j (null = no lead). THE one builder beside
   * exportBeats: savePlan, planFits, plannedMontage, plannedFull(Frames)
   * and (through the plan) renderDrill all consume THIS schedule.
   * `sec` is the FULL tier T_pre (GH-474 camera-settle law — choreography
   * starts at the walk's arrival, so no overlap subtraction remains);
   * `fuse` marks the kept walk that survived exportBeats' budget sweep
   * (its frames show the fused cue holding static address). Quantized to
   * the frame grid (the beatSec law — live boundaries and
   * export head frames agree exactly). `uncapped` (the full-game mode)
   * keeps every lead at the v2 tier 1:1 — the mode is budget-exempt BY
   * DESIGN (GH-305), the fusion rule still applies (overlay, not budget).
   * Montage plans ride the SAME budget pool the beat sweep spent from:
   * the remainder is swept first-fit in play order down the tier ladder
   * v2 → v1 → v1s → none (design 363 §5 — Williams 2002: time pressure
   * compresses the feathering phase first, never the stroke). `degraded`
   * counts slices below the v2 tier (the amber notice input).
   * Eligibility: an untrimmed slice head (startT 0; a mid-shot slice has
   * no address to lead into), a probed lead-capable record (pb.leadPre),
   * and — for the FIRST slice — an in-point at/before its live lead
   * window (a tIn inside the lead cut the lead deliberately). */
  function exportLeads(inc, beats, uncapped, budgetSec) {
    const n = inc.length;
    const leads = Array(n).fill(null);
    if (!pb || !leadInOn || pb.cueOff
      || window.__test?.twoClock !== true
      || window.__export?.leadInCapable !== true) {
      return { leads, degraded: 0 };
    }
    const quant = (s) => Math.round(s * 60) / 60;
    const preOf = (j, tier) => {
      const p = pb.leadPre?.[inc[j].i];
      if (!p || !(p.v2 > 0)) return 0;
      return tier === 'v2' ? p.v2 : tier === 'v1' ? p.v1 : p.v1s;
    };
    const addOf = (j, tier) => {
      const pre = preOf(j, tier);
      if (!(pre > 0)) return null;
      const w = j > 0 ? beats[j - 1] : null; // the kept walk INTO slice j
      // GH-474 camera-settle law: the lead window carries the FULL T_pre
      // — choreography starts at the walk's ARRIVAL (the settle point),
      // never inside the moving transition (the old overlap subtraction
      // is retired; see refreshSchedule). `fuse` still marks the kept
      // walk: the fused arm shows the staged cue holding a STATIC
      // address stance through the walk frames.
      return { sec: quant(pre), tier, fuse: !!w };
    };
    // first-slice gate (review r5 P2): the trim must sit at/before the
    // live choreography start (liveChorStart — under the GH-474 law the
    // lead window start itself); a tIn inside the choreography cuts the
    // lead deliberately, and the compacted slice must not regain a FULL
    // standalone T_pre the user just trimmed away. ONE formula: the
    // GH-433 effective window reads the same boundary.
    const eligible = (j) => inc[j].startT === 0 && preOf(j, 'v2') > 0
      && (j > 0 || pb.tIn <= liveChorStart(inc[0].i) + 1e-6);
    if (uncapped) {
      for (let j = 0; j < n; j++) {
        if (eligible(j)) leads[j] = addOf(j, 'v2');
      }
      return { leads, degraded: 0 };
    }
    // replay the beat sweep's spend arithmetic to find the remainder —
    // same budget pool, deterministic pure arithmetic (no second budget)
    const innerF = Math.round(INNER_TAIL * 60);
    const budget = budgetSec * 60 - Math.round(FINAL_TAIL * 60)
      - Math.max(60, n);
    let spent = 0;
    for (let j = 0; j + 1 < n; j++) {
      spent += beats[j] ? Math.round(beats[j].beatSec * 60) : innerF;
    }
    let degraded = 0;
    for (let j = 0; j < n; j++) {
      if (!eligible(j)) continue;
      let took = null;
      for (const tier of LEAD_TIERS) {
        const c = addOf(j, tier);
        if (!c) break;
        const cost = Math.round(c.sec * 60);
        if (spent + cost <= budget) { took = c; spent += cost; break; }
      }
      leads[j] = took;
      if (!took || took.tier !== 'v2') degraded += 1;
    }
    return { leads, degraded };
  }

  function planFits(n) {
    if (!n) return true;
    // GH-299: the tail frames ride the ONE beat schedule (kept walks cost
    // their beatSec; degraded/absent boundaries the INNER_TAIL hard cut).
    // exportBeats' budget degrade guarantees a beat plan is feasible
    // exactly when the all-hard-cuts plan is. GH-304: the budget is the
    // builder's OWN returned budgetSec — at the 60 s floor the 224-shot
    // wall below is unchanged; a derived budget moves the wall with the
    // same arithmetic (renderDrill's floors scale with capFrames).
    // GH-363: lead head frames join the fixed side — exportLeads' sweep
    // degraded them against the same budget, so feasibility is unchanged
    // in kind (a lead can always degrade to none).
    const inc = includedSegments();
    const { beats, budgetSec } = exportBeats(inc);
    const { leads } = exportLeads(inc, beats, false, budgetSec);
    let tailFrames = Math.round(FINAL_TAIL * 60);
    for (let j = 0; j + 1 < n; j++) {
      tailFrames += Math.round((beats[j]?.beatSec ?? INNER_TAIL) * 60);
    }
    for (const l of leads) {
      if (l) tailFrames += Math.round(l.sec * 60);
    }
    const playBudget = budgetSec * 60 - tailFrames;
    // BOTH renderer floors: the explicit "settle beats alone exceed the cap"
    // throw needs a full second of play budget, and planPlayback's
    // `ceil((endT - startT) / (FDT * slowmo))` is >= 1 for every positive
    // segment however high the montage rate climbs — so the convergence loop
    // cannot get below one play frame PER segment either (review round 4 P2:
    // the beats-only form still passed 225..235 shots, which then die in the
    // convergence tripwire). At the 60 s floor, 224 included shots is the
    // last feasible plan.
    return playBudget >= 60 && playBudget >= n;
  }

  /** Estimated montage rate for the CURRENT trim/speed (renderDrill's cap
   * arithmetic mirrored for the chip; the render's onMontage is the truth).
   * GH-299: walk beats join the fixed-tail side of the arithmetic, and
   * `degraded` reports how many over-budget walks fell back to hard cuts
   * (the amber card notice's input). GH-304: `budgetSec` is the builder's
   * returned budget — every consumer paints THAT number, never its own. */
  function plannedMontage() {
    if (!pb) {
      return { sec: 0, rate: 1, degraded: 0, leadDegraded: 0,
        budgetSec: CLIP_CAP_SEC };
    }
    const inc = includedSegments();
    const { beats, degraded, budgetSec } = exportBeats(inc);
    if (!inc.length) {
      return { sec: 0, rate: 1, degraded: 0, leadDegraded: 0, budgetSec };
    }
    // GH-363: lead head frames sit on the fixed side exactly like beats
    const { leads, degraded: leadDegraded } =
      exportLeads(inc, beats, false, budgetSec);
    // PR-2: the natural end includes the cue tail (renderDrill extends
    // the segment's play time by the same probed overhang — one geometry)
    const play = inc.reduce((s, x) => s
      + (x.endT ?? pb.segEndSec(x.i, pb.tails?.[x.i] ?? 0)) - x.startT, 0) / pb.speed; // LAND-18 X2
    let tails = FINAL_TAIL;
    for (let j = 0; j + 1 < inc.length; j++) {
      tails += beats[j]?.beatSec ?? INNER_TAIL;
    }
    for (const l of leads) {
      if (l) tails += l.sec;
    }
    const sec = play + tails;
    // GH-304 (review round-2 P2): a derived budget at/below the fixed tails
    // cannot montage-compress anything — planFits refuses such a plan (the
    // CTA disables and the estimate line says clipTooLong), so the chip
    // must stand DOWN rather than divide into ×Infinity (budget == tails)
    // or a negative rate that clamps back to a lying ×1
    const rate = sec > budgetSec && budgetSec > tails
      ? play / (budgetSec - tails) : 1;
    return { sec, rate: rate > 1 ? rate : 1, degraded, leadDegraded,
      budgetSec };
  }

  function syncMontage() {
    if (!pb || !P.montage) return;
    const { rate, budgetSec } = plannedMontage();
    P.montage.classList.toggle('on', rate > 1);
    if (rate > 1) {
      // GH-304 copy law: the budget-referencing copy moved to ADDITIVE
      // versioned keys ({dur} — minutes past 90 s) so a CACHED pre-304
      // playback.js over a fresh dictionary keeps its own intact {sec}
      // templates, and tBudget degrades a FRESH module over a STALE
      // dictionary back to the legacy {sec} copy (review rounds 1+4 P2)
      P.montage.textContent = tBudget('playback.montageDur',
        'playback.montage', { rate: rate.toFixed(1) }, budgetSec);
    }
    P.cardQuality?.refresh?.(); // (the card re-derives sec/rate itself)
  }

  /** GH-301: the pill row's lit tile = the camera RULING the playhead
   * (cameraAt over the plan — mid-segment cuts move it mid-segment; a
   * custom tripod lights the slot pill through the strip instead). Cached
   * on pb.tileCam so the per-frame call writes aria only on change. */
  function syncCamTiles(at, ballT) {
    if (!P.camBtns || !pb) return;
    const n = appliedCamId(camIdAt(at.i,
      at.beat ? pb.durs[at.i] + 1 : (ballT ?? 0)));
    if (pb.tileCam === n) return;
    pb.tileCam = n;
    const name = isCustomCamId(n) ? null : CAMS[n]?.id;
    for (const [k, b] of P.camBtns) {
      b.setAttribute('aria-pressed', String(k === name));
    }
    stripUi?.syncPressed?.(n);
  }

  /** GH-718 review r1 P2: the slider's RANGE follows pb.total. Built once
   * at the track and republished by relayoutTrack — the one seam every
   * schedule change (refreshSchedule: lead-in / camera-walk toggles, the
   * GH-299 relayout) passes through — so keyboard End, the playhead and
   * AT's reported range agree; valuenow is clamped into [0, total] and
   * force-written (syncTransport's valuetext gate would skip a total-only
   * change). */
  function syncSliderRange() {
    if (!pb || !P.track) return;
    const total = Math.round(pb.total * 10) / 10;
    const now = Math.min(Math.max(Math.round(pb.T * 10) / 10, 0), total);
    P.track.setAttribute('aria-valuemax', total.toFixed(1));
    P.track.setAttribute('aria-valuenow', now.toFixed(1));
    P.track.setAttribute('aria-valuetext', fmtT(pb.T));
  }

  function syncTransport() {
    if (!pb || !P.playhead) return;
    P.playhead.style.left = `${(100 * pb.T / Math.max(pb.total, 1e-6)).toFixed(2)}%`;
    P.tcur.textContent = fmtT(pb.T);
    // GH-718: the slider value follows the playhead at the readout's own
    // tenth-second resolution (one attribute write per visible change)
    const vt = fmtT(pb.T);
    if (P.track.getAttribute('aria-valuetext') !== vt) {
      P.track.setAttribute('aria-valuenow', (Math.round(pb.T * 10) / 10).toFixed(1));
      P.track.setAttribute('aria-valuetext', vt);
    }
    const l = 100 * pb.tIn / Math.max(pb.total, 1e-6);
    const r = 100 * pb.tOut / Math.max(pb.total, 1e-6);
    P.hIn.style.left = `${l.toFixed(2)}%`;
    P.hOut.style.left = `${r.toFixed(2)}%`;
    P.trim.style.left = `${l.toFixed(2)}%`;
    P.trim.style.width = `${(r - l).toFixed(2)}%`;
    P.dimL.style.width = `${l.toFixed(2)}%`;
    P.dimR.style.width = `${(100 - r).toFixed(2)}%`;
    for (const m of P.markers ?? []) {
      const at = Number(m.dataset.t);
      m.classList.toggle('ob-pb-mark--out', at < pb.tIn - 1e-6 || at > pb.tOut + 1e-6);
    }
    face(P.play, pb.playing ? 'pause' : 'play', pb.playing ? '❚❚' : '▶', 18);
    P.play.setAttribute('aria-label', t(pb.playing ? 'playback.pause' : 'playback.play'));
  }

  // ---- save flow (mockup 03): trimmed timeline → renderDrill → card ---------
  /** GH-433: the lead-ASSOCIATED segment for the CURRENT trim window — the
   * segment whose live lead CHOREOGRAPHY interval [liveChorStart, cum)
   * overlaps [tIn, tOut) while NO play span does (−1 otherwise). A lead is
   * prologue to its parent shot, never content on its own, so a selection
   * living entirely inside one MEANS that shot (the ASSOCIATE ruling on
   * the issue; the GH-380 no-silent-state-change doctrine): the parent
   * rides the plan as ONE full slice — the delivered clip opens at the
   * lead the eligibility grammar grants (a tIn at/before the choreography
   * start keeps it; a tIn inside the choreography cut it deliberately —
   * the exportLeads review r5 P2 law, unchanged) and ALWAYS includes the
   * strike. At most one segment can associate: two choreography intervals
   * always bracket a play span, and any window touching that span
   * short-circuits to the WYSIWYG slices below. Windows overlapping
   * NEITHER play nor choreography (a walk beat's risen-watch hold, or
   * past the content on the setTrim seam) stay honestly empty —
   * syncDestHint paints the refusal line for exactly that state, never a
   * silent disarm. */
  function leadAssocSeg() {
    if (!pb) return -1;
    for (let i = 0; i < pb.durs.length; i++) {
      const s0 = pb.cum[i], s1 = s0 + pb.segEndSec(i, pb.tails?.[i] ?? 0);
      if (s1 > pb.tIn + 1e-6 && s0 < pb.tOut - 1e-6) return -1; // play wins
    }
    for (let i = 0; i < pb.durs.length; i++) {
      // the choreography interval [liveChorStart, cum): under the GH-474
      // camera-settle law practice motion starts AT the lead window start
      // (the walk's arrival) — walk frames hold a static address stance
      // and belong to the TRANSITION, so a window parked wholly inside
      // the walk is zero-content exactly like the pre-363 walks (the
      // risen-watch hold always was). A window overlapping the
      // choreography interval contains lead content and must associate.
      if (!pb.leadTier?.[i]) continue;
      if (pb.cum[i] > pb.tIn + 1e-6
        && liveChorStart(i) < pb.tOut - 1e-6) return i;
    }
    return -1;
  }

  /** GH-363: the live CHOREOGRAPHY start for segment i — the lead window
   * start. Under the GH-474 camera-settle law this IS the settle point:
   * a kept incoming walk arrives exactly here and the fused cue only
   * HOLDS address inside the walk (static stance, not choreography), so
   * the walk-extension term is retired with the overlap arithmetic. ONE
   * formula: the exportLeads first-slice gate (the review r5 P2 grammar)
   * and the GH-433 effective window below read the same boundary —
   * association SEMANTICS unchanged (a lead is prologue to its parent),
   * only the boundary value derives from the new grammar. */
  function liveChorStart(segI) {
    return pb.cum[segI] - (pb.leads?.[segI] ?? 0);
  }

  /** GH-433 (review r1 P1): the EFFECTIVE play/capture window — the raw
   * trim window unless the selection is lead-ASSOCIATED, in which case it
   * is the associated slice's live span: from the choreography start the
   * export's lead grammar keeps (liveChorStart — the exportLeads
   * first-slice gate, verbatim), or the strike address when a tIn inside
   * the lead cut it deliberately, to the segment's natural end. The live
   * play loop, the realtime capture and its wall-clock preflight all
   * consume THIS window, so every tier delivers the same content class
   * the plan promises — offline-only association let the preview stop
   * before the strike and a MediaRecorder-only capture ship pure practice
   * strokes under a card promising the shot. Non-associated windows
   * return the raw trim bounds byte-identically.
   * The kept-lead start is the parent's OWN live lead span (cum − leads),
   * NEVER liveChorStart (review r3 P2): the compacted single-slice plan
   * has no incoming beat — the export renders an UNFUSED lead under the
   * parent's camera — so a preview/capture opening inside the previous
   * walk would ship walk-camera frames the export omits. The benign
   * asymmetry direction is accepted instead (the export's unfused head
   * carries MORE prologue than the live excess span shows — the same
   * accepted class as renderDrill's un-fuse-on-trim law). */
  function effWindow() {
    if (!pb) return { tIn: 0, tOut: 0 };
    const a = leadAssocSeg();
    if (a < 0) return { tIn: pb.tIn, tOut: pb.tOut };
    const kept = pb.tIn <= liveChorStart(a) + 1e-6;
    // the natural-end INSTANT already belongs to the next phase when a
    // follower exists — locate() resolves it to the trailing beat / the
    // next segment (its staged balls), so a preview/capture ending
    // exactly there would close on one frame of content the single-slice
    // export plan does not contain (review r4 P2). A boundary EPSILON, not
    // a frame (review r5 P2: a fixed 1/60 of TIMELINE time is speed-many
    // output frames at a slow-mo detent — ¼× would stop three output
    // frames before the export's final pose): the last rendered sample
    // sits just inside the segment, holding its true terminal pose at
    // every speed. The LAST segment's end is boundary-free and exact.
    const end = pb.cum[a] + pb.segEndSec(a, pb.tails?.[a] ?? 0);
    return {
      tIn: kept ? Math.max(0, pb.cum[a] - (pb.leads?.[a] ?? 0)) : pb.cum[a],
      tOut: a + 1 < pb.durs.length ? Math.max(pb.cum[a], end - 1e-4) : end,
    };
  }

  /** Map the global trim window onto per-segment slices — EXACTLY the
   * renderDrill trims shape ({ startT, endT } kernel-time per record;
   * fully-outside segments are dropped from records[]). GH-433: a window
   * with no play content but a lead overlap yields its parent shot as ONE
   * full slice (leadAssocSeg above — the same association the live
   * fade/plate mirrors consult, so preview and export keep one truth). */
  function includedSegments() {
    if (!pb) return [];
    const out = [];
    for (let i = 0; i < pb.durs.length; i++) {
      // PR-2: a segment's playable window includes its cue tail — a trim
      // handle inside the withdrawal maps to endT PAST the record
      // duration (renderDrill extends the segment by the same probed
      // overhang, and the trim law holds the frozen out-frame there).
      const s0 = pb.cum[i], s1 = pb.cum[i] + pb.segEndSec(i, pb.tails?.[i] ?? 0);
      if (s1 <= pb.tIn + 1e-6 || s0 >= pb.tOut - 1e-6) continue;
      out.push({
        i,
        startT: Math.max(0, pb.tIn - s0),
        endT: pb.tOut < s1 - 1e-6 ? pb.tOut - s0 : null,
      });
    }
    if (!out.length) {
      const a = leadAssocSeg();
      if (a >= 0) out.push({ i: a, startT: 0, endT: null });
    }
    return out;
  }

  /** GH-452: the reset boundaries the CURRENT trim window keeps — original
   * segment indices r from pb.resetB whose seam (r−1 → r) survives with both
   * sides intact (segment r−1 kept to its natural end, segment r kept from
   * its record head — any other shape is a user-authored cut, not this
   * seam) and no walk beat covering it (`beatAt(r)` answers the walk AFTER
   * r−1: the LIVE schedule for the player/capture surfaces, the PLAN
   * schedule for savePlan — GH-299's state handoff already bridges covered
   * boundaries). Gated on the capability chain like GH-363's leads: a stale
   * engine anywhere keeps the recorded pre-452 hard cut on BOTH surfaces
   * (consistent degrade, never a live/export divergence), and reset-less
   * sessions answer [] so every existing plan stays JSON-byte-identical
   * (the arm-3h plan-stability law). */
  function keptResetBounds(beatAt) {
    if (!pb?.resetB?.length) return [];
    if (window.__export?.resetFadeCapable !== true) return [];
    return pb.resetB.filter((r) => {
      if (beatAt(r)) return false;
      const Tb = pb.cum[r] - (pb.leads?.[r] ?? 0); // the boundary instant
      return pb.tIn < Tb - 1e-6 && pb.tOut - 1e-6 > pb.cum[r];
    });
  }

  /** The renderDrill call args for the CURRENT editor state — also the e2e
   * assertion surface (__playback.plan()). */
  function savePlan() {
    const inc = includedSegments();
    // GH-305: the full-game mode plans UNBUDGETED (every walk kept, no
    // budgetSec emitted — see the exportBeats note); montage plans are
    // byte-identical to pre-305 (the arm-3h plan-stability law).
    const full = fullMode();
    // GH-299: the walk-beat schedule for THIS plan (the ONE builder —
    // exportBeats — that the live player's schedule, planFits and
    // plannedMontage mirror; renderDrill consumes it verbatim and only
    // PLACES the moves after its cap-convergence loop fixes the final
    // speed). Path/hold data ride beat-LOCAL time on purpose: tail frames
    // advance the export clock at FDT·finalSpeed, and the montage rate is
    // unknowable before the cap loop runs — baking kernel-time moves here
    // would be the round-2 catch (3)(b) bug.
    const { beats, budgetSec, budgetDerived } = exportBeats(inc, full);
    // GH-363: the lead-in schedule over the SAME beats/budget (full plans
    // keep every lead 1:1 — the budget exemption; montage plans carry the
    // sweep-degraded tiers). Lead-off plans stay JSON-byte-identical (the
    // arm-3h plan-stability law — see the opts.leads emission below).
    const { leads } = exportLeads(inc, beats, full, budgetSec);
    // GH-259 quality resolution: planQuality() — 'auto'/absent-select keeps
    // the EXACT pre-GH-259 ternary, so the default plan stays
    // JSON-byte-identical (arm 3h). 'cinelight' is the ONLY quality option
    // that adds a key to the plan.
    const { hh, qual, tier, width } = planQuality();
    return {
      records: inc.map((x) => pb.records[x.i]),
      opts: {
        // 4K rides the ultra4k tier's ruled knobs (shutter/dof — the owner
        // 4K look + its dedicated encoder probes); 720/1080 stay standard
        tier,
        ...(qual === 'cinelight' ? { cinelight: true } : {}),
        // width MUST pair with height: drillRender fills a missing width
        // from tier.defaultRes (1920) — a bare height:720 rendered 1920x720
        height: hh,
        width,
        slowmo: pb.speed,
        // PR-2 + GH-299 interplay (review r4 P2): a segment with a LIVE
        // walk beat carries no tail in the player geometry (the walk
        // replaces the withdrawal) — but if the PLAN's beat degrades
        // (budget) or the pair leaves the trim window, renderDrill would
        // see a beat-less segment and RE-GROW the probed tail past the
        // live natural end. Pin those segments' endT to E_i with tail 0 —
        // pb.segEndSec(x.i, 0) = max(durs, completion) (GH-864 ruling 1: the
        // record end durs[i] cut a late pocket drop short) — explicitly;
        // every other segment keeps the null/pre-PR-2 shape (cue-less plans
        // stay JSON-byte-identical — the arm-3h law; where completion == durs
        // the pin value is durs bit-for-bit, since durs + 0 === durs).
        trims: inc.map((x, j) => ({
          startT: x.startT,
          endT: x.endT ?? ((pb.beats?.[x.i] && !beats[j]
            && (pb.tails0?.[x.i] ?? 0) > 0) ? pb.segEndSec(x.i, 0) : null),
        })),
        // GH-304: the plan-time byte-derived budget — the SAME number the
        // schedule above degraded against, so renderDrill's cap loop and
        // the card's promises can never diverge. Emitted only when DERIVED
        // from a real measurement (floor plans stay JSON-byte-identical to
        // pre-304 plans — the arm-3h plan-stability law). GH-305: full-game
        // plans NEVER emit it — the mode is budget-exempt by design.
        ...(budgetDerived && !full ? { budgetSec } : {}),
        // GH-299: emitted only when a walk survived the budget, so every
        // beat-less plan stays JSON-byte-identical to the pre-299 plan
        // (the arm-3h plan-stability law)
        ...(beats.some(Boolean) ? { beats: beats.map((w) => (w ? {
          beatSec: w.beatSec, holdSec: w.holdSec, walkTime: w.walkTime,
          fov: w.fov, p0: w.p0, path: w.path } : null)) } : {}),
        // GH-363: the pre-strike lead-in schedule — emitted only when one
        // exists (lead-off / option-off / incapable plans stay
        // JSON-byte-identical, the same stability law). `index` = the
        // ORIGINAL segment index (review r2 P2): it seeds the deterministic
        // jitter, and a trim that drops earlier shots compacts the array —
        // the engine must arm the schedule the probe priced, not the
        // slice position's.
        ...(leads.some(Boolean) ? { leads: leads.map((l, j) => (l ? {
          sec: l.sec, tier: l.tier, fuse: l.fuse,
          index: inc[j].i } : null)) } : {}),
        // GH-301 §2.4: fade windows — (slice index, kernel anchor, output
        // dur); offline-render maps them to OUTPUT frames AFTER its
        // convergence loop (§2.5). A cut whose anchor is trimmed away
        // vanishes with its fade (§2.6). Emitted only when one exists (the
        // arm-3h plan-stability law).
        ...(() => {
          const fades = [];
          inc.forEach((x, j) => {
            for (const c of pb.plan.cuts) {
              if (c.seg !== x.i || c.transitionIn !== 2 || !(c.dur > 0)) continue;
              const tA = csSec(c.t);
              if (tA < x.startT - 1e-9) continue;
              // an EXPLICIT out-trim is EXCLUSIVE (review r4 P2 — the
              // compiler drops a cut anchored exactly at endT, so its
              // fade vanishes with it; §2.6): a fade may not orphan onto
              // the tail frames of a cut the camera never makes
              if (x.endT !== null && x.endT !== undefined
                ? tA >= x.endT - 1e-9 : tA > pb.durs[x.i] + 1e-9) continue;
              fades.push({ i: j, t: tA, dur: csSec(c.dur) });
            }
          });
          // GH-452: reset-boundary fades — the SAME dip-to-black element,
          // boundary-anchored (b: 1 → the slice's FIRST output frame, its
          // head frame when a lead exists: exactly black at the state
          // swap). Derived per plan from record truth (keptResetBounds),
          // never stored in the user's cameraPlan; the beat gate reads the
          // PLAN schedule so a montage-degraded walk still gets its dip.
          for (const r of keptResetBounds((x) => {
            const j = inc.findIndex((s) => s.i === x);
            return j > 0 ? beats[j - 1] : true; // no kept predecessor slice
          })) {
            fades.push({ i: inc.findIndex((s) => s.i === r), t: 0,
              dur: RESET_FADE_SEC, b: 1 });
          }
          return fades.length ? { fades } : {};
        })(),
        // GH-364: the strike-point teaching plate — emitted ONLY while the
        // card's toggle is armed AND the delivery chain exists (default
        // OFF), so plate-less plans stay JSON-byte-identical (the arm-3h
        // plan-stability law). The caption resolves HERE (the one
        // localized text source both surfaces paint — i18n ×7); the
        // per-segment glyph geometry and impact timing re-derive in the
        // ENGINE from each record through the SAME strikeglyph.js leaf the
        // live preview reads (record truth — no copyable fields to drift).
        // GH-475: the legacy combined readout retires on the user path
        // (readout false — clean plate by default); the knob-selected
        // annotation halves ride in its place. A stale renderDrill honors
        // readout (a GH-364 field) and ignores the halves — the knob rows
        // never mount against that pairing (strikeAnnoCapable).
        // window474 (review r1 P1 + r2 P1): the plan DECLARES the
        // backswing-synchronized window — a fresh engine applies the new
        // timing only to plans that promise it, so a stale planner's
        // persisted plan keeps the pre-474 window it previewed. Declared
        // from the SAME capability truth the preview gate reads (r2 P1:
        // a stale export.js between fresh playback and a fresh engine
        // reports no capability — the preview shows the old window, so
        // the plan must not promise the new one).
        ...(strikeArmed() ? { strike: { title: t('playback.strikeTitle'),
          readout: false, elev: strikeElevOn === true,
          power: strikePowerOn === true,
          window474: window.__export?.strikeWindowCapable === true } } : {}),
        perShotCamera: inc.map((x, j) => {
          // GH-301 §2.1: a segment carrying mid-segment cuts (or a custom
          // tripod) compiles to ONE camerascript spec through the SAME
          // compiler the live arm consumes — WYSIWYG by construction; the
          // §2.6 clip law trims it (dropped anchors, backfilled head).
          const spec = compiledSpec(x.i, x.startT, x.endT ?? null);
          if (spec) return { script: spec };
          // §2.6: the nearest surviving earlier cut rules the surviving
          // span — the slice HEAD camera, not the segment-0 head (equal on
          // boundary-only plans, so planless emissions stay byte-identical)
          const n = appliedCamId(camIdAt(x.i, x.startT));
          const id = isCustomCamId(n) ? 'broadcast' : CAMS[n].id;
          const cam = CAMS.find((c) => c.id === id) ?? CAMS[0];
          if (typeof cam.preset === 'string') {
            // explicit PER SEGMENT (review round-2 P1): renderDrill
            // re-frames the preset over each segment's staged initial
            // state exactly like the live player's boundary re-anchor —
            // the pre-273 null-inherit froze the previous segment's
            // framing while the live player re-framed per crossing
            return cam.preset;
          }
          if (cam.preset.pov) {
            // POV (GH-275): the per-segment scripted directive — the SAME
            // pure povScript builder the live tap arms, so live and export
            // are WYSIWYG by construction; playhead-independent (pure
            // record data), explicit per segment like every moving rig
            // (renderTimeline disarms the script at each cut). An
            // unreadable record (stale shape) falls back to the broadcast
            // preset — the framing the live degrade holds too. A GH-315
            // rise-carrying beat (holdSec 0 — the exit lands inside the
            // segment's own rise) rides the exit-CLIPPED base script, the
            // same spec the live arm renders: its last move ends exactly
            // at the exit, so renderDrill's trim re-check and the
            // camerascript no-overlap law both hold by construction.
            const w = beats[j];
            const script = w && w.holdSec === 0
              ? povScriptClipped(pb.recs[x.i], x.endT ?? pb.durs[x.i])
              : povScript(pb.recs[x.i]);
            return script ? { script } : CAMS[0].preset;
          }
          // chase NEVER null-inherits (GH-273): renderDrill stops a moving
          // rig at ITS segment's cut (one-writer law, offline-render.js),
          // so an inherited chase segment rendered WRITER-LESS (frozen
          // pose) while the live player tracked — re-emit the directive
          // with the SAME deterministic per-segment eye + canonical fov
          // + start-snap the live path seeds (WYSIWYG: one assignment map,
          // one rig mechanism — see the CHASE_FOV note)
          const eye = chaseEye(x.i);
          return { track: { ...cam.preset.track, fov: CHASE_FOV,
            fovSnap: true, ...(eye ? { cam: eye } : {}) } };
        }),
        withAudio: true,
        keepBlob: true,
        noDownload: true,
        // the loading latch rides into the exporter (review r9 P2;
        // ADDITIVE — emitted only on cueOff sessions, so ordinary plans
        // stay JSON-byte-identical): renderDrill keeps the cue off for
        // the whole render instead of probing a NOW-loaded engine into
        // geometry the card never showed.
        ...(pb.cueOff ? { cueOff: true } : {}),
      },
    };
  }

  // ---- destination capability matrix (honest degradation) -------------------
  const bridges = () => ({
    // EITHER save bridge arms the tiles (GH-256: the chunked
    // obSaveVideoStream is the one the page prefers, and a shell is free to
    // ship it alone — the v1 handler is only the degrade). obShare handler
    // presence is deliberately NOT read here any more (GH-256 P1): it only
    // ever fed the v1 whole-string post — the measured crash wire — so the
    // Share tile now gates on the STREAMED share capability instead.
    saveVideo: !!(window.webkit?.messageHandlers?.obSaveVideo
      || window.webkit?.messageHandlers?.obSaveVideoStream),
    photos: !!window.webkit?.messageHandlers?.obPhotos,
    shell: !!window.webkit?.messageHandlers,
  });

  /** Web Share support for THIS clip (review merge-gate P2): canShare can
   * exist yet refuse video files — a Share tile that silently falls
   * through to download while the card reports "saved" is dishonest.
   * Pre-render (blob null) stays optimistic: tiles are disabled until the
   * blob lands and renderDests re-runs the matrix with the real file. */
  function canShareBlob(blob) {
    if (typeof navigator.share !== 'function'
      || typeof navigator.canShare !== 'function') return false;
    if (!blob) return true;
    try {
      return navigator.canShare({ files: [new File([blob],
        `clip.${blob.type === 'video/mp4' ? 'mp4' : 'webm'}`,
        { type: blob.type })] });
    } catch { return false; }
  }

  /** The documentStart capability hint (GH-225, ShellCore/
   * SaveVideoCapability): window.__obSaveVideo = { v: 1, chunk: <bytes>,
   * dests: [...] } — iOS ['photos','files'], macOS ['files']. null =
   * absent/malformed hint (plain web, or a stale shell predating the hint).
   * `chunk` (GH-256) is read separately by streamChunkBytes(); a hint
   * without it is a shell that only has the v1 whole-string post. */
  function saveVideoCaps() {
    const h = window.__obSaveVideo;
    return h && h.v === 1 && Array.isArray(h.dests) ? h.dests : null;
  }

  /** True when THIS shell takes dest 'share' over the CHUNKED bridge
   * (GH-256 P1: the review measured the Share tile still shipping the v1
   * obShare whole-string post — verbatim the +363 MB wire — because tile
   * membership keyed on handler PRESENCE while only photos/files ever
   * streamed). Strictly capability-gated: dests must NAME 'share' AND the
   * chunked bridge must be LIVE (handler + chunk hint, the streamBridge()
   * gate), so a stale shell (obShare handler, no streamed share) gets NO
   * Share tile instead of the crash wire — Photos/Files still cover saving
   * there, the recorded honest degrade; the tile and the route read the
   * same predicate and can never disagree. */
  const streamedShare = () => (saveVideoCaps()?.includes('share') ?? false)
    && streamBridge() !== null;

  /** A Photos destination is REACHABLE on this shell (the destsFor
   * membership law, factored so planBudget (GH-304) prices the same truth
   * the tile row renders: dests membership over the save bridge, or the
   * legacy obPhotos handler). Says nothing about the CLIP — mime/transcode
   * honesty stays with destsFor's photosOk. */
  function photosBridge() {
    const b = bridges();
    const caps = saveVideoCaps();
    return (b.saveVideo && (caps ? caps.includes('photos') : true)) || b.photos;
  }

  function destsFor(blob) {
    const b = bridges();
    const caps = saveVideoCaps();
    // capability law (GH-225 shell review): dests MEMBERSHIP gates the
    // bridge tiles — handler presence alone showed a DEAD Photos tile on
    // the files-only macOS shell. Handler without the hint keeps both
    // (the stale-shell degrade).
    const via = (dest) => b.saveVideo && (caps ? caps.includes(dest) : true);
    // GH-305 full-game mode: the tiles are STARTERS (dest chosen at the v3
    // `begin`, before a byte exists) — only the v3 shell wire can deliver
    // (fullMode() implies streamBridge()), so the matrix is the shell
    // tiles only: no download tile (plain web has no disk stream and never
    // offers the mode), and Photos gates on mp4 AT ENCODE (fullPlanFormat
    // — full mode never transcodes; a webm-negotiating device keeps
    // Files/Share, the recorded mime-honesty degrade).
    if (fullMode()) {
      const out = [];
      if (fullPlanFormat() === 'mp4' && via('photos')) {
        out.push({ id: 'photos', icon: 'photos' });
      }
      if (via('files')) out.push({ id: 'files', icon: 'folder' });
      if (streamedShare()) out.push({ id: 'share', icon: 'share' });
      return out;
    }
    const isMp4 = blob ? blob.type === 'video/mp4' : true;
    const out = [];
    // mime honesty, amended by GH-252: PHPhotoLibrary imports H.264/HEVC
    // MP4 only. An mp4 clip earns the Photos tile directly; a webm clip
    // earns it ONLY when the GH-157 transcode tier PROBED ok at card open
    // (transcodeCap) — the tile click then re-encodes to mp4 IN FRONT of
    // the same wire (transcodeAttempt below), so the mime that crosses the
    // bridge stays honest end-to-end. An unsettled or failed probe keeps
    // the tile hidden — never a Photos tile the shell must reject
    // (unsupported-container). Pre-render (blob null) stays optimistic:
    // tiles are disabled until the blob lands and renderDests re-runs.
    const photosOk = isMp4
      || (blob?.type === 'video/webm' && transcodeOkFor()
        && blob.size <= TRANSCODE_MAX_BYTES);
    // NO tile is accented at rest (GH-255): Photos used to carry
    // `primary: true` → `.ob-pb-dest--primary`'s accent wash forever, and the
    // owner read that as "this one is selected" — the SAME accent misuse the
    // build-11 report caught on the toolbar DVR pill (the design charter toolbar
    // family: chalk blue is action / selection / LIVE values, and a tinted
    // control in this app means "this is RUNNING"). The recommendation cue is
    // gone rather than recolored: the matrix is already capability-filtered,
    // and DOM ORDER (Photos first where it exists) is the non-accent cue that
    // remains. The accent now FOLLOWS THE LIVE ATTEMPT — see syncDestFx().
    if (photosOk && photosBridge()) {
      out.push({ id: 'photos', icon: 'photos' });
    }
    if (via('files')) out.push({ id: 'files', icon: 'folder' });
    // Share (GH-256 P1): in a shell the tile exists ONLY when dest 'share'
    // rides the chunked bridge (streamedShare) — an obShare handler alone
    // means the v1 whole-string wire, the measured crash path, and a tile
    // is never worth that; plain web keeps navigator.share as before.
    if (streamedShare() || (!b.shell && canShareBlob(blob))) {
      out.push({ id: 'share', icon: 'share' });
    }
    // shells WITHOUT the save bridge fall back to the anchor download (the
    // pre-obSaveVideo macOS wrapper had ZERO tiles: no save bridges yet
    // b.shell hid download); with the bridge, Photos/Files cover saving.
    if (!b.saveVideo) out.push({ id: 'download', icon: 'export' });
    return out;
  }

  // ShareMessage.maxBytes mirror (share-bridge.md §3; record.js #51 review
  // F1 law): the native gate silently drops oversize posts, so pre-flight
  // BEFORE any read/encode. NOT a memory bound (GH-256 measured ~5.5 GB for
  // one "legal" 384 MiB v1 post) — with the chunked transfer below it is a
  // DISK/wire bound the shell enforces on the running total.
  const BRIDGE_MAX_BYTES = 384 * 1024 * 1024;
  // The transcode IN-MEMORY budget (review round-6 P1): transcodeWebmToMp4
  // materializes the whole source (blob.arrayBuffer) and accumulates the
  // whole mp4 beside it, so a wire-legal 384 MiB webm would peak near
  // ~2× that plus codec buffers inside an iOS WebView — the jetsam class
  // the chunked wire exists to kill. Above this budget the Photos offer is
  // WITHHELD (mime honesty holds; Files/Share still deliver the webm).
  const TRANSCODE_MAX_BYTES = 192 * 1024 * 1024;

  // ---- the CHUNKED save transfer (GH-256) -------------------------------------
  // The v1 handoff posted the whole clip as ONE base64 string. Measured in
  // real WebKit (the GH-256 lane-1 probe): a 90 MiB clip cost the APP
  // process +368 MB (4.1x) and ~1.19 GB across the three processes, because
  // WebContent holds the dataURL AND the `String(r.result).split(',')[1]`
  // copy (JSC copies where V8 does not), then WebKit materializes the body
  // in the UI process as a UTF-16 NSString and Swift bridges another copy.
  // On a phone that is a jetsam kill = the owner's 闪退. The measured
  // alternatives ruled out everything else: a custom-scheme POST reaches
  // WKURLSchemeHandler with httpBody=nil, and a blob: URL is unreadable
  // natively. So the clip goes over in BOUNDED chunks, each one AWAITED —
  // the reply is the backpressure, so at most one chunk exists anywhere in
  // the pipeline and the transient cost of any clip is one chunk.
  //
  // Payload chunk size is a multiple of 3 (768 KiB = 262144x3), so every
  // non-final chunk's base64 is padding-free by construction — the shell's
  // chunk-wise decode then agrees byte for byte with the v1 whole-string
  // decoder (ShellCore SaveVideoMessage.isCanonicalBase64, the round-8
  // parity law).
  const CHUNK_BYTES = 768 * 1024;

  /** Bounded base64 of one chunk. btoa over 32 KiB slices: no dataURL, no
   * `split(',')` copy of the whole file, nothing retained past the chunk. */
  function chunkB64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  /** The shell's chunk ceiling from the capability hint (ShellCore
   * SaveVideoStreamMessage.maxChunkBytes); null = no chunked bridge. */
  function streamChunkBytes() {
    const h = window.__obSaveVideo;
    const max = Number(h?.chunk);
    if (!Number.isFinite(max) || max < 4096) return null;
    const want = Math.min(CHUNK_BYTES, Math.floor(max));
    return want - (want % 3); // keep the padding-free law
  }

  /** The chunked bridge, or null (plain web / a shell predating GH-256 —
   * which then takes the v1 post, the recorded degrade). */
  function streamBridge() {
    const b = window.webkit?.messageHandlers?.obSaveVideoStream;
    return typeof b?.postMessage === 'function' && streamChunkBytes() !== null
      ? b : null;
  }

  // ---- the FULL-GAME streaming export (GH-305) --------------------------------
  // A second save-card mode beside the montage: every included segment
  // renders 1:1 (no montage rate, no byte-derived duration budget — the
  // GH-304 exemption recorded in the ownership ledger) and the encoded bytes cross
  // the v3 deferred-total save wire DURING encode, so WebContent memory
  // stays flat whatever the session length. Dest is chosen at `begin`, so
  // the TILES are the starters (no separate CTA — a pre-selected tile
  // would violate the GH-255 no-rest-accent law) and the shell's ONE
  // 'ob:save-video-result' resolves the same saveWait latch every awaited
  // montage save uses.

  /** The shell's v3 extent cap from the capability hint
   * (SaveVideoStreamMessage.maxStreamBytes — the advertised value IS the
   * wire's own cap, so pre-flight and wire can never disagree); null = no
   * v3 wire (a v2-only shell, or plain web). */
  function fullStreamBytes() {
    const v = Number(window.__obSaveVideo?.full);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
  }

  /** The full-game mode's availability chain: the v3 shell wire (hint
   * `full` + a live chunked bridge) AND the streaming-capable exporter
   * (fullStreamCapable propagates the linked ENGINE's FULLSTREAM_CAPABLE —
   * the camScriptCapable two-layer honesty, so a stale layer anywhere
   * withholds the OFFER instead of wedging a press). */
  function fullModeOk() {
    try {
      return streamBridge() !== null && fullStreamBytes() !== null
        && window.__export?.fullStreamCapable === true
        && typeof window.__export?.planFormat === 'function'
        && !realtimeMode && !noEncoder;
    } catch { return false; }
  }

  /** True while the OPEN card is in full-game mode (the availability chain
   * re-checked live: a mode that lost its wire mid-card degrades to
   * montage rather than arming tiles it cannot start). */
  const fullMode = () => exportMode === 'full' && fullModeOk();

  /** The full plan's container at ENCODE time ('mp4' | 'webm' | null) —
   * export.js's ONE formatFor over the probed support. Photos in full
   * mode gates on 'mp4' here: mime honesty is decided at encode, because
   * full mode NEVER transcodes (the in-memory transcode tier is the exact
   * accumulation class this mode exists to kill). */
  function fullPlanFormat() {
    try {
      const { hh, tier } = planQuality();
      return window.__export?.planFormat?.({ tier, height: hh }) ?? null;
    } catch { return null; }
  }

  /** Full-game plan geometry: output seconds of the UNBUDGETED plan (play
   * at the displayed speed + every settle tail + every walk beat — no
   * degrade sweep) and the included-shot count. */
  function plannedFull() {
    if (!pb) return { sec: 0, shots: 0 };
    const inc = includedSegments();
    if (!inc.length) return { sec: 0, shots: 0 };
    const { beats } = exportBeats(inc, true);
    // GH-363: full-mode leads render 1:1 (uncapped — the budget exemption)
    const { leads } = exportLeads(inc, beats, true, CLIP_CAP_SEC);
    const play = inc.reduce((s, x) => s
      + (x.endT ?? pb.segEndSec(x.i, pb.tails?.[x.i] ?? 0)) - x.startT, 0) // LAND-18 X2
      / pb.speed;
    let tails = FINAL_TAIL;
    for (let j = 0; j + 1 < inc.length; j++) {
      tails += beats[j]?.beatSec ?? INNER_TAIL;
    }
    for (const l of leads) {
      if (l) tails += l.sec;
    }
    return { sec: play + tails, shots: inc.length };
  }

  /** The full plan's size estimate against the advertised extent cap —
   * the ONE pre-flight wall this mode answers to (bytes stream to disk;
   * the shell's writeFailed stays the honest backstop for the disk
   * itself). estimateDrill quotes the VIDEO rate (display voice); the CAP
   * gate prices the WHOLE file (review round-2 P2): + the 128 kbps audio
   * track savePlan always muxes (16 kB/s) + 2% container overhead — near
   * the 4 GiB cap the audio alone is ~46 MB, and an approved plan the v3
   * writer then rejects would waste the entire render.
   * Returns { ok, bytes, cap }. */
  // offline-render.js FULLSTREAM_AUDIO_CAP_SEC mirror (the BRIDGE_MAX_BYTES
  // documented-mirror precedent): the v1 with-sound wall, since GH-373 a
  // STALE-PAIRING wall only — a capable engine pairing renders the bed in
  // exact-state windows (O(window) transient) and with-sound plans price
  // on the extent cap alone, so the gate applies exactly while
  // __export.fullAudioWindowed reads false (cached pre-373
  // export-audio.js/offline-render.js — savePlan always muxes sound, and
  // the card must gate where the engine would bail).
  const FULL_AUDIO_WALL_SEC = 390;

  /** The engine's OWN frame count for the full plan (review round-4 P2):
   * planPlayback per segment over the SAME inputs renderDrill's timeline
   * uses — per-segment ceil + tail rounding included, so the fullFits wall
   * and the engine bail agree EXACTLY at the boundary (the planFits
   * agree-at-the-boundary law; a seconds-sum mirror could arm a tile the
   * engine then rejects after `begin` by a frame per segment). */
  function plannedFullFrames() {
    if (!pb) return 0;
    const inc = includedSegments();
    if (!inc.length) return 0;
    const { beats } = exportBeats(inc, true);
    // GH-363: the engine plans head frames per segment (planPlayback
    // headSec) — mirror them with the SAME uncapped schedule so the
    // fullFits wall and the engine bail agree exactly at the boundary
    const { leads } = exportLeads(inc, beats, true, CLIP_CAP_SEC);
    const trims = savePlan().opts.trims; // incl the beat-degrade endT pins
    let frames = 0;
    inc.forEach((x, j) => {
      const beat = j + 1 < inc.length ? beats[j] : null;
      // the engine extends non-beat segments by the probed cue tail —
      // pb.tails is the DVR's one-geometry mirror of that probe (PR-2);
      // beat segments stay unextended and cueOff sessions extend nothing
      // GH-489 #637 LAND-17 PM2: the engine plans each segment to
      // max(kernel + cue tail, the record's sink completion) — the same max,
      // the same per-record completion (pb.completions, probed at staging)
      const duration = pb.segEndSec(x.i, // LAND-18 X2: the one helper
        beat || pb.cueOff ? 0 : (pb.tails?.[x.i] ?? 0));
      frames += planPlayback({
        duration, slowmo: pb.speed,
        startT: trims[j].startT, endT: trims[j].endT,
        tailSec: j === inc.length - 1 ? FINAL_TAIL
          : (beat ? beat.beatSec : INNER_TAIL),
        headSec: leads[j]?.sec ?? 0,
        maxSec: Infinity }).frames;
    });
    return frames;
  }

  function fullFits() {
    const cap = fullStreamBytes();
    if (cap === null) return { ok: false, bytes: 0, cap: 0 };
    if (window.__export?.fullAudioWindowed !== true
      && plannedFullFrames() > FULL_AUDIO_WALL_SEC * 60) {
      return { ok: false, tooLong: true,
        min: Math.floor(FULL_AUDIO_WALL_SEC / 60), bytes: 0, cap };
    }
    const { sec } = plannedFull();
    let bytes = 0;
    try {
      const { width, height, tier, cinelight } = savePlan().opts;
      const video = window.__export?.estimateDrill?.({ tier, width, height,
        sec, cinelight: cinelight === true })?.bytes ?? 0;
      bytes = Math.ceil((video + sec * 16_000) * 1.02);
    } catch { bytes = 0; }
    return { ok: !(bytes > cap), bytes, cap };
  }

  /** Post one op and AWAIT the shell's reply (WKScriptMessageHandlerWithReply
   * resolves a promise per op; a rejection carries a short machine token —
   * busy / unsupported-container / write-failed / malformed). Resolves the
   * token on failure, null on success. */
  async function streamOp(bridge, msg) {
    try {
      const r = await bridge.postMessage(msg);
      // a shell that answers anything but {ok:true} refused the op
      if (r && r.ok === true) return null;
      return 'save-failed';
    } catch (e) {
      const tok = String(e?.message ?? e ?? 'save-failed').trim();
      return /^[a-z-]{1,40}$/.test(tok) ? tok : 'save-failed';
    }
  }

  /** streamOp with the REPLY payload (GH-362 layer 3: the `resume` op's
   * { ok, extent, hash } — extent/hash feed the fast-forward wire's
   * boundary check). Same refusal grammar as streamOp: `err` is the
   * shell's short machine token, null payload on any refusal. */
  async function streamOpResult(bridge, msg) {
    try {
      const r = await bridge.postMessage(msg);
      if (r && r.ok === true) return { reply: r, err: null };
      return { reply: null, err: 'save-failed' };
    } catch (e) {
      const tok = String(e?.message ?? e ?? 'save-failed').trim();
      return { reply: null,
        err: /^[a-z-]{1,40}$/.test(tok) ? tok : 'save-failed' };
    }
  }

  /** The v3 wire driver's chunk poster (GH-305, factored for GH-362 layer
   * 3): re-slices the engine's (data, at) pieces to the negotiated chunk
   * ceiling, keeps seq monotonic and `at` absolute, and tracks the extent
   * for `end`'s exactness law. `planHash` (layer 3) rides `plan`+`frame`
   * onto every chunk op so the shell's writer maintains the resume
   * manifest; null = the pre-layer-3 wire, byte-identical. `frame` is the
   * engine's ADDITIVE third post argument — undefined (finalize's drain,
   * or a stale engine behind a null planHash) keeps the last known. */
  function makeStreamPoster(bridge, name, planHash) {
    const chunkCap = streamChunkBytes() ?? CHUNK_BYTES;
    const st = { seq: 0, extent: 0, frame: 0 };
    const post = async (data, at, frame) => {
      if (Number.isFinite(frame)) st.frame = frame;
      for (let off = 0; off < data.length; off += chunkCap) {
        const piece = data.subarray(off, Math.min(off + chunkCap, data.length));
        const err = await streamOp(bridge, { v: 3, op: 'chunk', name,
          seq: st.seq, at: at + off, b64: chunkB64(piece),
          ...(planHash ? { plan: planHash, frame: st.frame } : {}) });
        if (err) throw new Error(err); // fails the render honestly (the
        // engine's drainWire throw path); the caller's unwind posts abort
        st.seq += 1;
        st.extent = Math.max(st.extent, at + off + piece.length);
      }
    };
    return { post, st };
  }


  /** Stream `blob` to the shell in bounded awaited chunks. `onDrop(kind,
   * code)` fires when NO 'ob:save-video-result' is coming (the b64Post
   * contract): 'blocked' = size pre-flight (painted here, synchronously
   * with the click), 'dropped' = the transfer failed — `code` is the
   * shell's own token so the caller can paint the honest localized reason.
   * A refused/failed transfer is ABORTED so the shell frees its slot and
   * its partial file instead of waiting out the idle watchdog. */
  async function streamPost(bridge, blob, name, dest, onDrop, onSent) {
    if (!sizeOk(blob, onDrop)) return;
    await releaseHeldSalvage(); // GH-997: the held stream owns the slot
    const chunk = streamChunkBytes() ?? CHUNK_BYTES;
    const total = Math.max(1, Math.ceil(blob.size / chunk));
    let err = await streamOp(bridge, { v: 2, op: 'begin', name,
      mime: blob.type, dest, bytes: blob.size });
    if (err) { onDrop?.('dropped', err); return; }
    for (let seq = 0; seq < total; seq++) {
      const start = seq * chunk;
      let b64;
      try {
        // one slice at a time: the ArrayBuffer and its base64 are the ONLY
        // copies of any part of the clip that ever exist page-side
        const buf = await blob.slice(start, Math.min(start + chunk, blob.size))
          .arrayBuffer();
        b64 = chunkB64(new Uint8Array(buf));
      } catch { b64 = null; }
      if (b64 === null) {
        await streamOp(bridge, { v: 2, op: 'abort', name });
        onDrop?.('dropped', 'read-failed');
        return;
      }
      err = await streamOp(bridge, { v: 2, op: 'chunk', name, seq, b64 });
      if (err) {
        // free the slot NOW, not at the 30 s watchdog (review nit): the
        // shipped shells discard their own stream on the refusals THEY
        // generate, but the 'no-stream' race reply and any foreign shell
        // do not — abort is name-scoped and idempotent, so at worst it is
        // an acknowledged no-op.
        await streamOp(bridge, { v: 2, op: 'abort', name });
        onDrop?.('dropped', err);
        return;
      }
    }
    err = await streamOp(bridge, { v: 2, op: 'end', name, chunks: total });
    if (err) {
      await streamOp(bridge, { v: 2, op: 'abort', name }); // same slot law
      onDrop?.('dropped', err);
      return;
    }
    // THE HANDOFF HAPPENED: the acknowledged `end` — the whole clip is on
    // the shell's disk. Recorded precisely (review nit — the first record
    // overclaimed this as the GH-255 paint moment): on a real chunked
    // shell the attempt is LATCHED (`chunk` and the caps hint ship
    // together), the caller's onSent is deliberately a no-op there, and
    // the shell's ONE 'ob:save-video-result' does the painting — the
    // stronger ack subsumes GH-255's "the post left" beat. This onSent is
    // load-bearing only in the skew where `chunk` is advertised without a
    // well-formed dests list (streamed transfer, UNLATCHED attempt): that
    // caller paints its recorded optimistic verdict from here, at the
    // honest moment instead of at click time.
    onSent?.();
  }

  /** The size pre-flight, shared by both transfers (painted synchronously
   * with the click so the refusal lands on the tap, not on a later beat). */
  function sizeOk(blob, onDrop) {
    if (blob.size <= BRIDGE_MAX_BYTES) return true;
    if (P.ptext) {
      P.ptext.textContent = t('export.failed', {
        message: `clip too large for the bridge (${(blob.size / 1e6).toFixed(0)} MB `
          + `> ${(BRIDGE_MAX_BYTES / 1e6).toFixed(0)} MB cap)`,
      });
    }
    onDrop?.('blocked');
    return false;
  }

  /** `onDrop(kind)` fires when NO valid post will reach the shell — i.e. no
   * 'ob:save-video-result' is coming, and an awaiting caller must unlatch:
   * 'blocked' = size-cap pre-flight (painted here, synchronously with the
   * click), 'dropped' = read error / throwing bridge (nothing delivered,
   * nothing painted — the CALLER paints behind its render-generation gate;
   * round 8 P2: these fire late, and a direct write here could stamp an old
   * blob's failure over a newer render).
   *
   * EVERY bridge route passes it, not just obSaveVideo (GH-255 review r1 P2):
   * the legacy obPhotos route also returns BEFORE the
   * FileReader resolves, so without the callback an over-cap or unreadable
   * blob left the card claiming a handoff that never happened — the shared row
   * saying "clip too large" beside a success-coloured tile. It still gets no
   * RESULT event; the callback only reports that the post never left.
   *
   * `onSent()` is its mirror (GH-255 review r2 P2): the post LEFT. Nothing may
   * acknowledge a handoff before this fires — a click starts a FileReader read
   * that runs for SECONDS on a phone-sized clip, so an acknowledgement painted
   * when deliver() returns claims a handoff that has not happened yet, and if
   * the read then fails after the card closed there is nothing left to correct
   * it. Fired OUTSIDE the post's try/catch so a throwing listener can never be
   * misread as a dropped post.
   *
   * GH-256: this v1 whole-string post survives ONLY as the degrade for a
   * shell without the chunked bridge (obPhotos, and any obSaveVideo shell
   * predating GH-256) — deliver() prefers streamPost() for every obSaveVideo
   * route, and the obShare leg is GONE (GH-256 P1: dest 'share' streams or
   * is not offered in shells). It is the measured crash path; nothing new
   * rides it. */
  function b64Post(bridge, blob, name, extra = {}, onDrop, onSent) {
    if (!sizeOk(blob, onDrop)) return;
    const r = new FileReader();
    r.onload = () => {
      let sent = false;
      try {
        const b64 = String(r.result).split(',')[1] ?? '';
        bridge.postMessage({ v: 1, name, mime: blob.type, b64, ...extra });
        sent = true;
      } catch { onDrop?.('dropped'); /* a throwing bridge drops the handoff */ }
      if (sent) onSent?.();
    };
    // blob read failed inside the shell: the old anchor fallback was a
    // DEAD END in the wrappers (no WKDownload handling — the bridges
    // exist precisely because blob downloads dead-end there), so the
    // failure surfaces honestly instead of a fake rescue painting
    // "Saved" over nothing (round 7 P2)
    r.onerror = () => onDrop?.('dropped');
    r.readAsDataURL(blob);
  }

  /** Clip file name — built by the CALLER of deliver() so the awaited
   * attempt's identity (name+dest) exists before any async work (review
   * re-gate P2: the result listener matches on it). The 4-hex suffix
   * makes the shell-echoed name a per-ATTEMPT correlation token (round 5
   * P2: the stamp is second-granular, so a late result surviving a
   * WebView reload could otherwise match a new same-second attempt).
   * `ext` overrides the blob-derived extension (GH-252: the transcode leg
   * names the FUTURE mp4 container before any async work, so the attempt
   * identity is the delivered file's, not the source webm's). */
  const clipName = (blob, ext) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const tok = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `openbilliards-playback-${stamp}-${tok}`
      + `.${ext ?? (blob.type === 'video/mp4' ? 'mp4' : 'webm')}`;
  };

  /** Route dest → bridge/web delivery (`name` from clipName). Returns the
   * ROUTE it took, which the caller reads for two different facts:
   *   'obSaveVideo' — the save bridge, the ONE route that reports back through
   *     'ob:save-video-result' (so an awaited attempt latches on it);
   *   'obPhotos' — legacy bridge: fire-and-forget, and DEFERRED
   *     (nothing has left the browser until b64Post calls `onSent`);
   *   'shareApi' — the Web Share API: also DEFERRED, because share() is a
   *     PROMISE that can reject without ever opening a sheet (review r3 P2);
   *   'download' — the ONE immediate route: the anchor was already clicked,
   *     synchronously, before this function returned.
   * The deferred/immediate split is what lets the caller acknowledge only what
   * actually happened (GH-255 review r2 P2). `hooks` = { onDrop, onSent }; the
   * two bridge routes pass BOTH. */
  function deliver(dest, blob, name, hooks = {}) {
    const { onDrop, onSent } = hooks;
    const wk = window.webkit?.messageHandlers;
    // GH-256: every obSaveVideo route prefers the CHUNKED bridge — the v1
    // whole-string post is the measured crash path and is reached only on a
    // shell that never advertised `chunk`. Dest 'share' has NO v1 leg at
    // all (GH-256 P1): it streams when the shell advertises it and is
    // otherwise not offered in shells — the obShare route this replaced
    // was the exact wire measured at +363 MB app-process for a 90 MiB
    // clip, i.e. the crash class the chunked transfer exists to kill.
    const stream = (dest === 'photos' || dest === 'files'
      || (dest === 'share' && streamedShare()))
      ? streamBridge() : null;
    if (stream) {
      streamPost(stream, blob, name, dest, onDrop, onSent);
      return 'obSaveVideo';
    }
    if (dest === 'photos') {
      if (wk?.obSaveVideo) {
        b64Post(wk.obSaveVideo, blob, name, { dest: 'photos' }, onDrop, onSent);
        return 'obSaveVideo';
      }
      if (wk?.obPhotos) {
        b64Post(wk.obPhotos, blob, name, {}, onDrop, onSent);
        return 'obPhotos';
      }
    }
    if (dest === 'files' && wk?.obSaveVideo) {
      b64Post(wk.obSaveVideo, blob, name, { dest: 'files' }, onDrop, onSent);
      return 'obSaveVideo';
    }
    if (dest === 'share') {
      // no obShare leg here any more (GH-256 P1): in shells the tile only
      // renders when streamedShare() routed above, so this branch is the
      // plain-web Web Share API path.
      try {
        const file = new File([blob], name, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) {
          // navigator.share() is ASYNCHRONOUS and its rejection is not one
          // thing (GH-255 review r3 P2). The blanket `.catch(() => {})` that
          // used to sit here was written for the GH-225 claim "a user who
          // dismisses the sheet did not hit a defect" — true, and that case is
          // `AbortError`. Every OTHER rejection (InvalidStateError,
          // NotAllowedError, DataError…) means the sheet NEVER OPENED, and
          // swallowing it left the card acknowledging a handoff that did not
          // happen. Split it: resolve = shared; AbortError = the user's own
          // decision, which retires the tile to REST exactly like the shell's
          // `cancelled` result; anything else = the honest failure.
          navigator.share({ files: [file] }).then(
            () => onSent?.(),
            (e) => onDrop?.(e?.name === 'AbortError' ? 'cancelled' : 'dropped'));
          return 'shareApi';
        }
      } catch { /* fall through to download */ }
    }
    // web download (and the last-resort fallback for every miss above)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return 'download';
  }

  /** GH-252: run the retained GH-157 transcode tier IN FRONT of the normal
   * delivery wire for a webm clip bound to Photos. The tile that leads here
   * exists only when probeTranscodeSupport().ok settled true at card open
   * (destsFor), so this is never a blind attempt. transcode.js arrives via
   * guarded dynamic import (cache-poison contract): an absent/stale module
   * or any reject counts as a failed transcode, never a throw into the tap.
   *
   * Progress paints on the card's PINNED-FOOT bar — the one progress
   * surface this card owns — a recorded deviation from the record.js
   * precedent, whose #ob-prepare banner stays record.js-local. Every paint
   * sits behind the same gates as the other late callbacks: the attempt's
   * own identity (never a superseded tap), its render generation, a card
   * that still exists.
   *
   * Failure is HONEST and never strands bytes (the delivery law): the
   * result event is never coming because nothing will be posted, so the
   * awaited latch unlatches (the onDrop shape), the shared row states the
   * localized reason, the tapped tile fails — and the ORIGINAL webm stays
   * deliverable through Files/Share/download. Success re-enters the
   * unchanged wire: `dispatch(mp4)` is the exact deliver() path every mp4
   * clip takes, so mime honesty (begin op mime = video/mp4, .mp4 name)
   * holds end-to-end and the 384 MiB pre-flights all still apply. */
  async function transcodeAttempt(src, wait, phase, dispatch) {
    const live = () => wait === lastAttempt && wait.gen === paintGen && !!card;
    // GH-362 landing review r12+r13 (P1): the Photos transcode is ANOTHER
    // long WebCodecs pass that starts AFTER the render's own keep-awake
    // hold has released, and its chunked Photos handoff keeps the page
    // working long after dispatch() returns (deliver() fires streamPost
    // without awaiting it) — Auto-Lock either way freezes the page
    // mid-flight and the watchdogs discard the save on thaw. The hold
    // therefore rides the transcodeBusy latch EXACTLY: taken here beside
    // the latch, released inside releaseTranscodeBusy — the failure
    // unwind, onSent ("the post left") and onDrop all funnel there,
    // identity-guarded, so the pairing is exactly-once. Same refcounted
    // owner through the ADDITIVE seam the realtime tier rides (review r2
    // P1); a stale export.js lacks the seam — the recorded pre-362
    // degrade.
    try { window.__export?.keepAwake?.(true); } catch { /* stale seam */ }
    try {
      // page-side transcode latch (review round-2 P2): on a HINT-LESS shell
      // nothing latches saveWait, so without this a second Photos tap could
      // start a CONCURRENT full-file decode/encode — tiles disarm behind it
      // exactly like the awaited latch, and the tap gate reads it too
      transcodeBusy = wait; // the OWNING attempt's identity (round-5 P2)
      syncDestArm();
      syncCardActions(); // the CTA locks with the latch (round-7 P1)
      // the bar restarts at the JOB's zero before the source is buffered/
      // demuxed (review round-6 P2: a settled render left it at 100%, and a
      // large clip showed a full bar for seconds before the first progress
      // callback snapped it backwards)
      if (live()) {
        P.bar.style.width = '0%';
        P.ptext.textContent = t('record.preparing', { pct: 0 });
      }
      let mp4 = null;
      try {
        const mod = await import('./transcode.js');
        let lastPct = -1;
        mp4 = await mod.transcodeWebmToMp4?.(src, {
          onProgress: (done, total) => {
            const pct = total > 0 ? Math.min(99, Math.floor(100 * done / total)) : 0;
            if (pct === lastPct || !live()) return;
            lastPct = pct;
            P.bar.style.width = `${pct}%`;
            P.ptext.textContent = t('record.preparing', { pct }); // reuse ×7
          },
        }) ?? null;
        if (!(mp4 instanceof Blob) || mp4.type !== 'video/mp4'
          || !(mp4.size > 0) || mp4.size > BRIDGE_MAX_BYTES) mp4 = null;
      } catch { mp4 = null; }
      if (!mp4) {
        // the no-post unwind: unlatch (awaited attempts only — identity-scoped
        // exactly like onDrop), say why, fail the tapped tile.
        // releaseTranscodeBusy also retires a reopened card's parked busy
        // notice (round-10 P2 — this path's own paint is generation-gated).
        releaseTranscodeBusy(wait);
        if (saveWait === wait) saveWait = null;
        syncDestArm(); // busy latch released (and/or the unlatch) — re-derive
        if (live()) {
          P.bar.style.width = '0%';
          P.ptext.textContent = t('playback.transcodeFailed');
        }
        phase('failed');
        return;
      }
      // the busy latch HOLDS through the bridge handoff (review round-3 P2):
      // on a hint-less shell nothing else disarms the tiles while dispatch's
      // FileReader/post is still in flight, and a second tap there would
      // start a duplicate full transcode — the route's own onSent/onDrop
      // releases it (releaseTranscodeBusy, wired in the click handler).
      if (live()) {
        P.bar.style.width = '100%';
        P.ptext.textContent = t('playback.saving');
      }
      dispatch(mp4);
    } catch (e) {
      // a THROW is the failure unwind too — the latch (and its wake hold)
      // must not wedge the tiles; the rethrow keeps the fire-and-forget
      // caller's error surface exactly as recorded
      releaseTranscodeBusy(wait);
      throw e;
    }
  }

  /** Release the page-side transcode latch (review round-3 P2) — called from
   * the delivery hooks so the tiles re-arm only once the transcoded post
   * actually left (or provably never will). SCOPED to the OWNING attempt
   * (review round-5 P2: an OLDER attempt's late FileReader hook must not
   * release a newer transcode's latch and re-arm tiles over its running
   * encode — the latch stores the attempt identity, not a boolean). */
  function releaseTranscodeBusy(wait) {
    if (!transcodeBusy || transcodeBusy !== wait) return;
    transcodeBusy = false;
    // GH-362 landing review r13 (P1): the keep-awake hold has the latch's
    // EXACT lifetime — released here and only here, so the page stays
    // awake through the chunked Photos handoff (until onSent/onDrop says
    // the post left or provably never will), not just the transcode
    // compute. The identity guard above makes the release exactly-once.
    try { window.__export?.keepAwake?.(false); } catch { /* stale seam */ }
    syncDestArm();
    syncCardActions(); // the CTA lock releases with the latch (round-7 P1)
    // the REOPENED-card busy notice retires with the latch (review round-10
    // P2): its attempt's result paints are generation-retired on a
    // reopened card, so the release is the one event that knows the job
    // settled — without this the row said "a save is already running"
    // beside a re-armed CTA forever.
    if (card && P.ptext?.textContent === t('playback.saveBusy')) {
      P.ptext.textContent = '';
      P.progress?.classList.remove('on');
    }
  }

  // ---- destination card -------------------------------------------------------
  let card = null, cardScrim = null;
  // GH-720 review r6: the kit-less card's own focus law. dialog.js records
  // its opener (prevFocus) and restores it on close; when the guarded
  // ui/dialog.js import is pending/absent the module fallback must keep the
  // same promise (the ownership ledger cache-poison contract: a working degrade
  // path) — the opener is captured at openCard entry and closeCard hands
  // focus back to it while it is still visible, else to the player's first
  // control (the GH-717 focusIntoPlayer law), never <body>. cardKitless
  // pins the teardown to the path the card was OPENED on: a dialog.js that
  // resolves mid-life never closePanel()s a card it never opened.
  let cardInvoker = null, cardKitless = false;
  // GH-305: the save card's export mode — 'montage' (the pre-305 card,
  // byte-identical plans) | 'full' (the streaming full-game export).
  // Session-persistent across card opens; re-validated against the
  // availability chain at every consumer (fullMode()), so a mode that lost
  // its wire silently degrades to montage rather than arming dead tiles.
  let exportMode = 'montage';
  // GH-363: the pre-strike lead-in option — default ON (the issue's
  // "naturalness is the point" law), toggleable in the save card.
  // Session-persistent across card opens (the exportMode shape); governs
  // BOTH the live player schedule and the export plans (WYSIWYG: one
  // schedule, one toggle — an export can never lead-in where the player
  // did not).
  let leadInOn = true;
  // GH-364: the strike-point teaching-overlay option (击球点 — issue brief).
  // DEFAULT OFF; session-persistent across card opens like exportMode. The
  // glyph leaf (strikeglyph.js — the ONE draw/derivation module the export
  // compositor also consumes) arrives through a guarded dynamic import per
  // the cache-poison contract: a stale/absent leaf keeps the pre-364 card
  // (no toggle, no preview, plans never carry opts.strike) — the same
  // consistent degrade on BOTH surfaces, never a live/export divergence.
  let strikeOn = false;
  // GH-475: the plate's elevation/power annotation knobs (Advanced pairs
  // under the overlay row). DEFAULT OFF — clean clips unless opted in
  // (owner request); session-persistent like strikeOn. Values on the
  // burned plate are the RECORDED shot params (glyphFor), never
  // re-derived; the knob rows mount only against a capable chain
  // (strikeglyph fmtElev + the engine's STRIKEANNO_CAPABLE via
  // __export.strikeAnnoCapable + the ×7 dictionary keys).
  let strikeElevOn = false;
  let strikePowerOn = false;
  let sgMod = null; // the strikeglyph.js namespace once loaded
  import('./strikeglyph.js').then((m) => {
    if (typeof m?.drawStrikePlate === 'function'
      && typeof m?.glyphFor === 'function'
      && typeof m?.impactTimeFor === 'function') {
      sgMod = m;
      mountStrikeRow(); // review r4 P2: a card opened before this resolved
      // must not stay option-less until a reopen (the retrofitSelect shape)
    }
  }).catch(() => { /* leaf absent — the pre-364 degrade */ });
  // a viewport resize/rotation re-sizes the preview layer's backing store
  // (review r13 P2: a paused armed plate would CSS-stretch until the next
  // scrub). CANVAS-ONLY repaint — never renderAtT: the bed is untouched
  // and an export may own the renderer (the r6 law). The paint key carries
  // w×h, so syncLiveStrike re-derives the geometry by itself. (#983: the
  // bed itself is resized and repainted by main.js under the live latch.)
  window.addEventListener('resize', () => {
    if (pb && player && P.strike) syncLiveStrike(locate(pb.T), pb.T);
  });
  // plate text renders through the app font stack — repaint the armed
  // preview once the faces settle (review r4 P2: a fallback-font paint must
  // not stand after the webfont lands; the export latches fonts.ready
  // before frame zero in offline-render.js — this is the live mirror)
  try {
    document.fonts?.ready?.then?.(() => {
      // pb.strikePaint busts first (review r9 P2): the settle changes no
      // paint-key input, so the skip-cache would swallow the repaint and
      // the fallback-font pixels would stand. The bust is UNCONDITIONAL
      // (landing review round: fonts settling DURING an export skipped
      // both the bust and the redraw behind one !rendering guard — the
      // post-render restore then saw an unchanged paint key and the
      // fallback-font pixels stood); only the REDRAW defers to the
      // exporter-owned-renderer law (review r6 P2: never seek the shared
      // bed between exported frames — the post-render restore repaints
      // through the cleared key).
      if (pb) pb.strikePaint = null;
      if (pb && player && !rendering && strikeArmed()) {
        renderAtT(pb.T);
      }
    });
  } catch { /* no Font Loading API — the fallback stack stands */ }
  /** The ONE armed-truth predicate: the user flipped the toggle AND the
   * whole delivery chain exists (leaf loaded; export.js propagates the
   * engine's STRIKEGLYPH_CAPABLE marker). Consumed by savePlan (plan
   * emission) and the live preview — one truth, so the preview can never
   * promise a plate the plan will not carry. */
  /** The ACTIVE dictionary carries every strike key (hasLocal ONLY — no
   * has() fallback: this option has no legacy copy, and the en fallback
   * would burn an ENGLISH caption over a stale non-English dictionary —
   * review r2/r3 P2). Consumed by the offer gate AND re-checked live by
   * strikeArmed(): a mid-session switch to a stale dictionary disarms the
   * plan and the preview together. */
  const strikeDictOk = () => typeof i18nNs.hasLocal === 'function'
    && i18nNs.hasLocal('playback.strikeOverlay')
    && i18nNs.hasLocal('playback.strikeTitle')
    && i18nNs.hasLocal('playback.strikeChanged');
  const strikeArmed = () => strikeOn && sgMod !== null && !realtimeMode
    && strikeDictOk()
    && window.__export?.strikeGlyphCapable === true;
  // review r5 P2: a locale switch while a render/transcode/awaited save
  // holds the card cannot invalidate THEN — the settling run's output
  // (old-caption snapshot) must retire when the latches clear.
  // syncCardActions drains this on the first clear lifecycle flip.
  let strikeStalePending = false;
  // …and the run's own press-time caption snapshot (landing review round):
  // the drain COMPARES instead of blanket-invalidating, so an A→B→A
  // locale round-trip mid-run never retires a blob whose burned caption
  // matches the current promise again. Written at every run-starting
  // press beside its savePlan (the plan truth the render burns).
  let strikeRunTitle = null;
  // (!realtimeMode — review r1 P2: a live capture records the WebGL canvas
  // and can never burn the plate, so an armed preview there would promise
  // pixels the file must omit; the realtime settle path below also
  // disarms, this is the derived-truth belt)
  // GH-304 (review round-1 P1): the per-card budget SNAPSHOT — the copy the
  // user reads and the plan a press submits must be the SAME number, so the
  // first in-card derivation for a given (tier, height, photos) tuple
  // latches until a budget INPUT settles or changes: the encoder-support
  // probe (formatFor answers null before it), the transcode probe (a wall
  // input via planPhotosTranscode), a completed render (it writes a fresh
  // calibration sample), or a fresh card open. Each of those nulls the
  // latch AND repaints the budget-dependent lines through the app's own
  // writers, so paint and press can never straddle two derivations (a
  // quality-picker change re-keys the tuple and re-derives by itself).
  let cardBudget = null; // { key, sec, derived } while latched
  let paintGen = 0; // bumps on EVERY startRender (so per card open too) —
  // save feedback paints ONLY against the exact rendered blob it was
  // posted from (review re-gate rounds 5+6 P2: a result landing after
  // close→retrim→reopen, or after a mid-await Advanced res re-render in
  // the SAME card, must not stamp Saved/error over the NEW clip; the
  // latch/tile re-arm is generation-independent, the paint is not)
  let rendering = false;
  // hdInfo() + support() said no offline encoder config exists on this
  // engine (review round 1 P2). Re-derived per card OPEN; keeps the Export
  // CTA disabled behind the honest export.noneAvailable notice instead of
  // offering a button whose every press throws.
  let noEncoder = false;
  // TRI-STATE, not a boolean pair (review round 3 P2): encoder capability is
  // UNKNOWN until the async hdInfo()/detectExportSupport() probe settles, and
  // an armed CTA in that window enters renderDrill only to throw. The export
  // DIALOG has the same precedent — it awaits `support` before it computes
  // #ob-x-start.disabled at all. Deliberately NOT watchdog-bounded (review
  // round 4 P2): re-arming the CTA over a still-pending probe is the WORST
  // outcome, because drillRender only assigns its AbortController AFTER its
  // own detectExportSupport() await — startRender would have set
  // `rendering = true` (Close blocked) with nothing for Cancel to abort, i.e.
  // a wedged card. A probe that never answers leaves a disabled CTA on a
  // CLOSABLE card instead, which is also what the export dialog does.
  let probingEncoder = false;
  // GH-274 review round-2 P2: a cached exporter that predates keepBlob can
  // resolve a render WITHOUT a blob — the card paints the stale-export
  // error, and the setup hint must NOT stand beside it instructing another
  // press of a pipeline that cannot arm the destinations. Latched in the
  // no-blob branch; re-derived per card open and per Export attempt.
  let noBlobExport = false;
  let lastBlob = null, lastBlobId = 0; // #1180: lastBlobId counts the clips that land in lastBlob, so the tile reveal's marker never holds the Blob
  // GH-252: the transcode-capability probe result — the honest gate on the
  // webm→Photos offer. Tri-state: null until the per-card-open probe
  // settles, then the FULL probe object (review round-1 P2: `.ok` alone is
  // (vp9||vp8)+avcHd, which offers a tile transcodeWebmToMp4 then
  // deterministically rejects for an audio-carrying webm without opus/AAC
  // legs or a >1080p webm without the UHD AVC probe — transcodeOkFor()
  // below reads the CLIP's own requirements against the matrix). Re-probed
  // per OPEN (not cached for the session) so a scripted boot can flip the
  // engine's decode surface between opens; destsFor() reads it
  // synchronously, so an unsettled probe simply withholds the Photos tile
  // until the settle re-renders the row.
  let transcodeCap = null;
  let tcGen = 0; // the card-OPEN generation, bumped once per openCard
  // (review rounds 5+7 P2: a probe — hdInfo or transcode — outliving its
  // card must neither write a later card's capability snapshot nor flip
  // its mode/probing state; deliberately NOT paintGen, which also bumps
  // mid-open and would orphan a slow probe on its own card)
  // A page-side transcode is running (review round-2 P2): the hint-less
  // shells never latch saveWait, so this is the latch that stops a second
  // tap from starting a concurrent full-file decode/encode. Read beside
  // saveWait by every tile-arm derivation and the tap gate.
  let transcodeBusy = false;
  // What the LAST BLOB is made of, from its own producer (never a demux):
  // { uhd, audio, codec } written by the render-done path (plan dims,
  // withAudio, the offline sink's vp9) and the realtime-capture path
  // (video-only + the negotiated mime + the canvas's real backing-store
  // dims — review rounds 1/2/4). `uhd` mirrors transcode.js's avcCodecFor
  // predicate (w > 1920 || h > 1080). Released with the blob.
  let lastBlobMeta = null;
  // GH-997: a clip render the delivery wall refused as visibly broken
  // (more encoder loss than the hold policy hides) — its container still
  // exists, so the card offers "Save anyway" (install it as the delivered
  // blob) beside "Export again" (the CTA). { blob, meta, size, ext, lost,
  // want } while the offer stands; a press, a close or a re-render drops it.
  let cardSalvage = null;
  /** True when the PROBED transcode matrix covers THIS clip's needs
   * (review rounds 1+2 P2: `.ok` alone is EITHER-VP + HD-AVC — a vp9 blob
   * on a vp8-only decoder, an audio-carrying webm without the opus/AAC
   * legs, or a >1080p source without the UHD AVC probe would all earn a
   * tile transcodeWebmToMp4 then deterministically rejects). An UNKNOWN
   * codec keeps the either-VP gate; the honest-failure paint stays the
   * belt for whatever no probe can see. */
  function transcodeOkFor() {
    const p = transcodeCap;
    if (p?.ok !== true) return false;
    const m = lastBlobMeta ?? {};
    if (m.codec === 'vp9' && !p.vp9) return false;
    if (m.codec === 'vp8' && !p.vp8) return false;
    if (m.audio === true && !(p.opus && p.aacEnc)) return false;
    if (m.uhd === true) {
      // an above-HD source needs BOTH ends probed at source scale (review
      // rounds 3+4 P2: the decoder configures at the SOURCE dimensions, so
      // HD-only VP decoding fails a 4K job even with UHD AVC encode green;
      // `uhd` mirrors transcode.js's own avcCodecFor predicate — width
      // OVER 1920 OR height over 1080, so a portrait 780×1688 canvas
      // counts). A stale transcode.js without the additive vp*Uhd fields
      // reads undefined — the offer is withheld, the honest degrade.
      const vpUhd = m.codec === 'vp8' ? p.vp8Uhd
        : m.codec === 'vp9' ? p.vp9Uhd : (p.vp9Uhd || p.vp8Uhd);
      if (!(p.avcUhd && vpUhd === true)) return false;
    }
    return true;
  }
  // GH-250: the card is in REALTIME-CAPTURE mode — no offline encoder
  // config exists on this engine (the hdInfo/support probe said so) but the
  // MediaRecorder machinery can capture the live bed AND hand the blob back
  // (__record.supported + the ADDITIVE lastRecording getter). Re-derived
  // per card open, set only from the settled probe; a parallel marker, so
  // savePlan()/plan() stay byte-identical for the offline path (arm 3h).
  let realtimeMode = false;
  let rtCancel = null; // the running realtime capture's cancel hook (the
  // Cancel button routes here instead of __export.cancel() while set)
  let saveWait = null; // the in-flight AWAITED obSaveVideo attempt's
  // identity {dest, name}: every tile disarms while set and the MATCHING
  // 'ob:save-video-result' re-arms (the shell contract guarantees exactly
  // ONE result per valid attempt; the await is only ever armed under the
  // __obSaveVideo hint, so a stale shell can never wedge the card — it
  // stays on the optimistic paint). The latch survives card close/reopen
  // (review re-gate P1: releasing it there let a reopened card post a
  // SECOND near-cap body while the native save still ran — WebKit
  // materializes the body before the shell's busy check) and unlatches
  // only from its own result or no-post callback.

  let lastAttempt = null; // the identity object of the MOST RECENT tap (GH-255
  // review r1 P2). `paintGen` cannot tell two attempts apart inside ONE render:
  // the hint-less bridge route never latches, so its tiles stay armed while the
  // FileReader is still reading, and a second tap starts a second attempt at
  // the SAME generation. The first attempt's late no-post callback then passed
  // the `wait.gen === paintGen` gate and stamped ITS failure over the newer
  // tile — the exact class the identity token exists to stop, one layer in.
  // A superseded attempt paints NOTHING (row or tile); its unlatch is separate
  // and stays identity-scoped on `saveWait === wait`.
  let destFx = null; // the per-tile phase of the last attempt:
  // { dest, phase: 'working'|'done'|'handoff'|'failed', gen }. Module scope,
  // NOT the DOM node — renderDests() replaceChildren()s the row from five call
  // sites, so a state stored on the button is wiped by the next re-render
  // (which would be the GH-255 defect one layer deeper). Retired by `paintGen`
  // exactly like the P.ptext paint it accompanies, so a stale/mismatched result
  // lights NOTHING.
  //   An AWAITED attempt never stores 'working' here: it is DERIVED from the
  // `saveWait` latch in syncDestFx(), which makes the highlight and the
  // collective disarm one truth that cannot desync (and lets it survive card
  // close/reopen with the latch — the reopened card's disarmed tiles then SAY
  // why they are disarmed instead of looking broken). The UNLATCHED routes have
  // no latch to derive from and DO store it (GH-255 review r2 P2): they must
  // read as in-flight from the tap until b64Post reports the post actually
  // left, because a FileReader read of a phone-sized clip runs for seconds.

  /** The ONE tile-disarm predicate (GH-305 refactor): montage tiles arm on
   * a rendered blob with no save in flight (fix 4, GH-225); full-game
   * tiles are the STARTERS — armed in the SETUP state (no blob exists or
   * ever will page-side) whenever nothing is running and the plan
   * pre-flights under the extent cap. renderDests' initial state and
   * syncDestArm read the SAME truth so no call-site ordering can strand a
   * dead starter row. */
  function destsDisabled() {
    return fullMode()
      ? (rendering || saveWait !== null || transcodeBusy || probingEncoder
        || !includedSegments().length || !fullFits().ok)
      : (!lastBlob || saveWait !== null || transcodeBusy);
  }

  /** Disarm/re-arm every destination tile (see destsDisabled). */
  function syncDestArm() {
    if (!P.dests) return;
    const disabled = destsDisabled(), reveal = !disabled && !fullMode() && !!lastBlob && P.dests.obRevealed !== lastBlobId;
    for (const x of P.dests.querySelectorAll('.ob-pb-dest')) {
      x.disabled = disabled;
    }
    syncDestFx(); if (reveal) { P.dests.obRevealed = lastBlobId; try { P.dests.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old engines */ } } // #1180 item 8: tiles armed by a render come into the body's view (the pinned foot sliced them at rest on a 375–390 px phone); the marker is the clip's id, never the Blob (releaseBlob owns its life)
  }

  /** Paint the per-tile attempt feedback (GH-255): the ONE writer of the
   * `.ob-pb-dest--*` state classes and of each tile's status sub-label.
   * Called from syncDestArm() (so every arm flip re-derives it) and from the
   * tail of renderDests() (so a re-rendered row inherits the live state).
   *
   * Gates: an expired `destFx` (its render generation retired) is DROPPED, so
   * a stale or mismatched RESULT paints nothing anywhere. The LATCH-derived
   * working phase is generation-INDEPENDENT on purpose — it is the label of the
   * `saveWait` disarm, which is itself generation-independent (review re-gate:
   * the shell's one result must always unlatch), so the two can never disagree:
   * a card reopened over a live latch shows disarmed tiles AND says which one is
   * still saving, and the res-change invalidation leaves that true statement
   * standing while the shared row says `playback.resChanged`. The unlatched
   * routes' STORED working phase is generation-bound like every other `destFx`
   * value, which is right: their read is against a clip that render retired.
   *
   * The status text is swapped as the sub-label's OWN `dataset.i18n` (then
   * painted from that same key), never as a bare string over a stale key:
   * onLocaleChange runs applyDom(card) across every [data-i18n] node, so a raw
   * write would revert to "on this device" the moment the user switched
   * language mid-save — and the dataset swap makes that path repaint the
   * STATUS for free. Every status key is paramless; the long per-code honesty
   * stays in the shared P.ptext row. */
  function syncDestFx() {
    if (!P.dests) return;
    if (destFx && destFx.gen !== paintGen) destFx = null;
    const live = saveWait ? saveWait.dest : null;
    for (const b of P.dests.querySelectorAll('.ob-pb-dest')) {
      const id = b.dataset.dest;
      const phase = live === id ? 'working'
        : (destFx && destFx.dest === id ? destFx.phase : null);
      // append-only class names: arm 8e keys its coarse-floor map by the FIRST
      // class on each control, so `ob-pb-dest` must stay in front
      b.classList.toggle('ob-pb-dest--working', phase === 'working');
      b.classList.toggle('ob-pb-dest--done',
        phase === 'done' || phase === 'handoff');
      b.classList.toggle('ob-pb-dest--failed', phase === 'failed');
      if (phase === 'working') b.setAttribute('aria-busy', 'true');
      else b.removeAttribute('aria-busy');
      const key = {
        working: 'playback.saving',
        done: 'playback.saved',
        handoff: 'playback.destHandoff',
        failed: 'playback.destFailed',
      }[phase] ?? `playback.dest.${id}Sub`;
      const s = b.querySelector('small');
      if (s && s.dataset.i18n !== key) {
        s.dataset.i18n = key;
        s.textContent = t(key);
      }
    }
  }

  /** Localized honest text for a shell save-result error token (GH-225,
   * SaveVideoController): reuse the record.js/export.js delivery strings
   * where the situation is identical; unknown codes fall back to the
   * generic key carrying the machine token. */
  function saveErrorText(code) {
    const key = {
      denied: 'record.saveFailed', // the Photos-permission wording, ×7
      cancelled: 'export.cancelled', // user closed the panel — no file
      busy: 'playback.saveBusy',
      'photos-unavailable': 'playback.saveNoPhotos',
      'unsupported-container': 'playback.saveBadContainer',
    }[code];
    if (key && has(key)) return t(key);
    return t('playback.saveFailed', { code: String(code ?? 'unknown') });
  }

  // Shell save-result callback (GH-225, ShellCore/SaveVideoResult): after
  // every VALID obSaveVideo attempt the shell dispatches EXACTLY ONE
  // CustomEvent('ob:save-video-result', {detail: {ok, name, dest,
  // error?}}). Malformed details drop silently (the FR-011 regime,
  // record.js ob:photos-result mirror); results that do not MATCH the
  // awaited attempt's name+dest drop and KEEP the latch (review re-gate
  // P2: a late result from a pre-reload attempt could clear a newer
  // attempt's latch and paint the old outcome — the shell echoes the
  // posted name verbatim, so identity is exact); results nobody awaits
  // drop too (stale-shell optimistic path).
  window.addEventListener('ob:save-video-result', (e) => {
    const d = e?.detail;
    if (!d || typeof d.ok !== 'boolean') return;
    if (!saveWait || d.name !== saveWait.name || d.dest !== saveWait.dest) return;
    const w = saveWait;
    saveWait = null;
    if (!card) return; // latch released; the native save settled on its own
    syncDestArm();
    syncCardActions(); // GH-305: the latch also locks the mode row (and the
    // full-mode hint rides the same derive) — every latch release re-runs
    // the one lifecycle writer; idempotent for the montage card
    // the paint binds to the ORIGINATING render (rounds 5+6 P2) and
    // never to a running re-render's progress line
    if (rendering || w.gen !== paintGen) return;
    P.ptext.textContent = d.ok ? t('playback.saved') : saveErrorText(d.error);
    // the SAME outcome resolves on the SAME tile the user tapped (GH-255).
    // `cancelled` is the one error token that resolves back to REST: the user
    // closed the native panel themselves, so painting a failure on their tile
    // would call their own decision a defect (the shared row still states
    // export.cancelled). Everything else is an honest per-code failure.
    destFx = d.ok || d.error !== 'cancelled'
      ? { dest: w.dest, phase: d.ok ? 'done' : 'failed', gen: w.gen }
      : null;
    syncDestFx();
    P.progress.classList.add('on');
    P.cancel.style.display = 'none';
  });
  // LEGACY-shell result correction (GH-251 review round-1 P1): a shell with
  // obPhotos but NO obSaveVideo takes deliver()'s legacy b64Post, whose
  // controller reports back through 'ob:photos-result' — and record.js's
  // listener left with its rescue machinery, so the CARD now owns the
  // correlated paint for ITS OWN legacy attempts. Without this, a denied
  // Photos write stood behind the optimistic "Saved" forever. Identity is
  // the shell-echoed name against the MOST RECENT attempt (this route never
  // latches — fire-and-forget — so there is no saveWait to release; the
  // correction is paint-only and sits behind the same gates as every late
  // callback: identity, generation, a live card, no running render).
  // Malformed details drop silently (the FR-011 regime, mirrored page-side).
  window.addEventListener('ob:photos-result', (e) => {
    const d = e?.detail;
    if (!d || typeof d.ok !== 'boolean' || typeof d.name !== 'string') return;
    if (saveWait) return; // an AWAITED attempt is spoken for by its own
    // 'ob:save-video-result' — this event belongs to the legacy route only
    if (!lastAttempt || lastAttempt.dest !== 'photos'
      || lastAttempt.name !== d.name) return;
    if (!card || rendering || lastAttempt.gen !== paintGen) return;
    P.ptext.textContent = d.ok ? t('playback.saved') : saveErrorText(d.error);
    destFx = { dest: 'photos', phase: d.ok ? 'done' : 'failed',
      gen: lastAttempt.gen };
    syncDestFx();
    P.progress.classList.add('on');
    P.cancel.style.display = 'none';
  });
  // (the mid-render cancel-and-re-render path of 6c2d3ba5 is GONE: with the
  // confirm-first flow the resolution picker is LOCKED while the encode runs,
  // so its WYSIWYG intent — the delivered container always matches the
  // displayed options — is now an invariant of the lifecycle, not a repair)
  let cardRealRate = null; // the renderer's onMontage truth (review P2): the
  // chip estimate mirrors the cap arithmetic CONTINUOUSLY, but per-segment
  // frame rounding can montage a clip the estimate still calls 1× — once
  // the render reports, its rate wins; reset per run and on card close

  function closeCard() {
    if (!card) return;
    if (rendering) return; // the Cancel button is the only path out mid-render
    const c = card;
    card = null;
    cardBudget = null; // GH-304: the budget snapshot lives per card view
    // popover hygiene BEFORE closePanel (kit contract, ui-kit.md §dialog):
    // refresh() sweeps any open .ob-select__list so a resolution popover can
    // never strand over the canvas after the card leaves
    try { P.resSelW?.refresh?.(); } catch { /* stale select.js */ }
    try { P.qualSelW?.refresh?.(); } catch { /* stale select.js */ }
    // kit TEARDOWN (GH-668 S5 kit, review r3 P2): refresh() alone left each
    // widget's clamp ResizeObserver alive on the removed card — it retained
    // the detached buttons and, through them, the whole card subtree (+2
    // observers per open/close cycle, unbounded). destroy() disconnects
    // them; it runs right before the node removal (after the exit tween)
    // because destroy() also unhides the native <select> — the kit face
    // must hold through the fade. Captured now: the P.* handles null below.
    const widgets = [P.resSelW, P.qualSelW];
    const dropCard = () => {
      for (const w of widgets) { try { w?.destroy?.(); } catch { /* stale */ } }
      c.remove();
    };
    c.style.pointerEvents = 'none'; // inert during the exit fade (same law
    // as closeList — the node is removed after the tween, never reused)
    if (!cardKitless && dialog?.closePanel) {
      dialog.closePanel(c).then(dropCard); // the kit restores its prevFocus
    } else {
      // GH-720 review r6: the kit-less teardown restores focus itself. The
      // removal drops focus to <body> (the card held it since open), so
      // the hand-off runs whenever focus is on body / inside the removed
      // card — a usable focus elsewhere (a programmatic close under a
      // surface the user moved to) is left alone, the kit's r11 choice-
      // survival law. Target: the opener while still visible, else the
      // player's first control (focusIntoPlayer, GH-717) — never <body>.
      document.removeEventListener('keydown', escCard, true);
      dropCard();
      const now = document.activeElement;
      if (!now || now === document.body || c.contains(now)) {
        if (!focusFirst([cardInvoker])) focusIntoPlayer();
      }
    }
    cardInvoker = null;
    cardKitless = false;
    cardScrim?.remove();
    cardScrim = null;
    P.cardQuality = null;
    P.resSelW = null;
    P.qualSel = null;  // GH-259: a closed card's picker must not steer plan()
    P.qualSelW = null;
    P.modeBtns = null; // GH-305: a closed card's mode row leaves with it
    P.modeNote = null; // (exportMode itself persists for the next open)
    P.strikeTog = null; // GH-364: the toggle leaves with the card
    P.strikeRow = null;
    unmountStrikeAnno(); // GH-475: the knob rows leave with it
    P.advRow = null;
    strikeStalePending = false; // releaseBlob below retires the output the
    // pending stale referred to (full-mode paints leave with the card)
    // (strikeOn itself persists — the LIVE preview keeps mirroring the
    // armed option after close, exactly what the next render will burn)
    cardRealRate = null;
    // saveWait deliberately SURVIVES the close (review re-gate P1): the
    // native save is still running — a reopened card must stay disarmed
    // until the attempt's own result/no-post callback unlatches, or a
    // second near-cap post could stack in WebKit before the shell's busy
    // check. The hint-gated contract guarantees that callback comes.
    releaseBlob();
    cardSalvage = null; // GH-997: the offer's bytes leave with the card
    // GH-304 (review round-8 P2): the snapshot released above may have held
    // a press-time budget older than the store (a render calibrated while
    // the card described its delivered file) — the OUTER chip re-derives
    // now instead of standing on the old rate until the next trim edit
    syncMontage();
    syncUi(); // GH-314: the card pin releases (paused still pins here)
  }

  /** GH-720 review r6: the kit-less card's Escape (the escList twin), the
   * kit's own layered law restated: an open select popover is the topmost
   * layer (select.js closes it — this runs in the document CAPTURE phase,
   * before the combobox's handler); mid-render the card is not dismissable
   * and the press falls through untouched (onBedKey's layer predicate
   * still sees #ob-pb-card, so the player never closes on it). Otherwise
   * the press is CLAIMED (stopImmediatePropagation -> cancelBubble) BEFORE
   * the synchronous removal: onBedKey, which would no longer see the card
   * layer, honours the claim instead of reading a player dismissal. */
  function escCard(e) {
    if (e.key !== 'Escape' || !card) return;
    if (document.querySelector('[data-ob="select-list"]')) return;
    if (rendering) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    closeCard();
  }

  /** Drop BOTH retaining roots of the rendered clip (QA wave: closing the
   * card/player used to pin the last blob — playback's lastBlob AND
   * export.js's module-scope lastResult — in blob storage until the next
   * render or a full reload; real pressure inside an iOS WebView). */
  function releaseBlob() {
    lastBlob = null;
    lastBlobMeta = null;
    cardSalvage = null; // GH-997: a standing salvage offer is output too
    try { window.__export?.releaseDrill?.(); } catch { /* stale export.js */ }
    // review round-1 P2 (GH-250): record.js's module-scoped lastBlob is a
    // THIRD retaining root for a realtime capture — release it through the
    // ADDITIVE seam member wherever this card releases its own reference
    // (a stale record.js simply lacks the member and keeps its pre-GH-251
    // retention, which is the recorded degrade).
    try { window.__record?.releaseRecording?.(); } catch { /* stale seam */ }
  }

  function fmtEta(sec) {
    return sec < 90 ? t('export.etaSec', { s: Math.max(1, Math.round(sec)) })
      : t('export.etaMin', { m: Math.floor(sec / 60), s: Math.round(sec % 60) });
  }

  /** GH-313 (GH-304 residual 1): the *Dur-family register question, asked of
   * the ACTIVE dictionary ALONE. has() consults the en fallback, so a fresh
   * playback.js + fresh en.json over a STALE non-English locale JSON answered
   * true and t() then painted the fresh ENGLISH *Dur copy into a localized UI
   * (plus one missing-key warn per key) instead of the retained legacy
   * localized {sec} template. hasLocal() is ADDITIVE on i18n.js, reached via
   * the namespace binding + feature detection (rule 5): a fresh playback.js
   * over a stale cached i18n.js lacks it and degrades to the pre-313 has()
   * register — never a boot-killing missing-export error. */
  const hasBudgetKey = (key) => (typeof i18nNs.hasLocal === 'function'
    ? i18nNs.hasLocal(key) : has(key));

  /** GH-304: the budget length for the montage chip / amber notice /
   * infeasible copy — minutes past 90 s (budgets vary now; "327 s" reads
   * like an error code), the fmtEta thresholds without its ~ (a budget is
   * exact in frames, never an estimate). Returns NULL when the cached
   * dictionaries predate the *Dur key family (a fresh playback.js over a
   * stale locale JSON is a supported pairing — review round-4 P2): the
   * caller then paints the retained legacy {sec} template instead of raw
   * key names. hasBudgetKey() first, per the i18n missing-key-detector law
   * (GH-313: judged on the ACTIVE dictionary, not the en fallback). */
  function fmtDur(sec) {
    if (!hasBudgetKey('playback.durSec')) return null; // stale dict: legacy
    if (sec < 90) return t('playback.durSec', { s: sec });
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return s ? t('playback.durMin', { m, s }) : t('playback.durMinOnly', { m });
  }

  /** The versioned budget copy with its stale-dictionary degrade: the
   * *Dur key when the ACTIVE dictionary carries it (fresh pairing), the
   * retained legacy {sec} key otherwise — one seam, every budget copy site. */
  function tBudget(durKey, legacyKey, params, budgetSec) {
    const dur = fmtDur(budgetSec);
    return dur !== null && hasBudgetKey(durKey)
      ? t(durKey, { ...params, sec: budgetSec, dur })
      : t(legacyKey, { ...params, sec: budgetSec });
  }

  /** #983: the player's live manual latch again after a capture that held
   * resizes back (a resize it deferred lands now, repainted by main.js). */
  function relatchLive() {
    if (!pb) return;
    try { window.__test.setManual(true, { live: true }); } catch { /* stale seam */ }
  }

  /** Put the paused live bed back under the open player after an in-player
   * render (review merge-gate P2): renderDrill's finally re-stages the
   * save-time record but seeks its END, drops manual mode and stops any
   * chase rig — without this the bed showed a stale end frame under an
   * unmoved playhead (and Chase stayed inert) until the next scrub.
   * Re-latch manual, re-arm the segment camera, re-pose at the playhead. */
  function restorePlayerBed() {
    if (!pb) return;
    // PR-2 bookkeeping reconcile: the offline renderer exit-disarms the
    // ENGINE on every path — a pb.cueArm still claiming the pre-render
    // segment would make syncCueArm's idempotence return skip the re-arm
    // below and the restored bed would lose its cue until the next
    // boundary crossing. Clear it first; renderAtT → syncCueArm re-arms
    // fresh over the restored bed.
    disarmCue();
    // #983: re-latch LIVE (a resize the render deferred lands here)
    try { window.__test.setManual(true, { live: true }); } catch { /* stale seam */ }
    pb.appliedKey = null; // GH-301: renderAtT re-arms the segment directive
    renderAtT(pb.T);
  }

  /** Open the save card in its SETUP state (the owner two-step-save fix,
   * defect A): NOTHING renders until the Export CTA is pressed. The card is
   * a three-row frame — pinned head (title + ✕), scrolling body (quality
   * line, Advanced resolution picker, the pre-render estimate, the
   * destination preview, platform note, replay link) and pinned foot
   * (progress + the Export CTA). Lifecycle: SETUP → (Export) RENDERING →
   * DONE/CANCELLED/FAILED → back to SETUP-with-CTA on any settled outcome.
   * Changing a setting in SETUP costs nothing (there is no render to
   * cancel); changing it after a render INVALIDATES the blob so the
   * delivered container can never disagree with the displayed options. */
  function openCard() {
    if (!pb || card) return;
    // GH-720 review r6: the opener (a keyboard Save = the Save button; a
    // pointer Save on engines that do not focus buttons = null -> the
    // player's first control at close), read before any DOM mutation
    cardInvoker = focusUsable(document.activeElement) ? document.activeElement : null;
    if (pb.captureLatch) {
      // GH-301 review r7 P2: Save mid-capture abandons the framing honestly
      // (cancel restores cameraAt) — the card must never open over a live
      // latch, or a realtime run would record the unsaved manual camera
      try { stripUi?.seams?.cancelCapture?.(); } catch { /* strip degrade */ }
      pb.captureLatch = false; // belt: a throwing strip may not clear it
    }
    // …and every strip overlay stands down (review r11 P2: a KEYBOARD Save
    // fires no pointerdown, so the picker/selection hint would float at
    // z 90/91 over the z 70 card)
    try { stripUi?.seams?.dismiss?.(); } catch { /* strip degrade */ }
    setPlaying(false);
    noEncoder = false; // re-derived per open by the hdInfo probe below
    noBlobExport = false; // per-open re-derive (review round-2 P2)
    realtimeMode = false; // GH-250: re-derived per open, same probe
    tcGen += 1; // THIS open's probe generation (review rounds 5+7 P2): both
    // async probes below — hdInfo AND transcode — bind to it, so a probe
    // outliving its card can neither write a later card's capability
    // snapshot nor flip its mode/probing state (the global `card` check
    // alone sees "some card exists", not "MY card")
    const openGen = tcGen;
    lastBlob = null; // (saveWait intentionally NOT reset — re-gate P1)
    cardBudget = null; // GH-304: a fresh card derives its own snapshot
    // paintGen bumps per card OPEN as well as per startRender: card open used
    // to imply a render (and so a bump). With the confirm-first flow it no
    // longer does, and a late 'ob:save-video-result' from a surviving latch
    // must never paint Saved/error into a freshly opened card (rounds 5+6 P2).
    paintGen += 1;
    card = document.createElement('div');
    card.id = 'ob-pb-card';
    card.className = 'ob-panel';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    syncUi(); // GH-314: the card pin arms (paused already pins — belt)
    const head = document.createElement('div');
    head.className = 'ob-pb-card-head';
    const h = document.createElement('h2');
    h.dataset.i18n = 'playback.saveTitle';
    // GH-720: the dialog is NAMED by its title, and the kit's focus-on-
    // present law (B-K06) lands focus on that title when the card opens —
    // the script-focusable anchor dialog.js prefers over the first control
    // (the same idiom as the list panel's title), so a keyboard Save moves
    // focus into the card with no phantom ring on a pointer open (GH-226).
    h.id = 'ob-pb-card-title';
    h.tabIndex = -1;
    h.dataset.obPresentFocus = '';
    card.setAttribute('aria-labelledby', h.id);
    const close = document.createElement('button');
    close.type = 'button';
    // GH-245: the unified kit close register — the card's old 30px one-off
    // joins the 34px circle (the close-geometry unification sheet)
    close.className = 'ob-btn ob-btn--ghost ob-btn--icon ob-pb-close';
    close.dataset.i18nTitle = 'playback.close';
    close.setAttribute('aria-label', t('playback.close'));
    face(close, 'close', '✕', 15);
    close.addEventListener('click', () => closeCard());
    head.append(h, close);
    // quality line + Advanced (resolution) row
    const quality = document.createElement('div');
    quality.className = 'ob-pb-quality';
    const qLine = document.createElement('span');
    qLine.className = 'ob-nums';
    // GH-245: the owner-benchmark button itself (the build-11 2.50px gear)
    // through the kit factory — ghost voice, kit anatomy; .ob-pb-adv keeps
    // the quality line's small metrics
    const adv = mkBtn({
      label: t('playback.advanced'), i18nKey: 'playback.advanced',
      icon: ico('gear', 14), fallbackGlyph: '⚙', variant: 'ghost',
    });
    adv.classList.add('ob-pb-adv');
    quality.append(qLine, adv);
    const advRow = document.createElement('div');
    advRow.className = 'ob-pb-advrow';
    const resLabel = document.createElement('span');
    resLabel.className = 'ob-caps';
    resLabel.dataset.i18n = 'export.resolution';
    P.resSel = document.createElement('select');
    const fillRes = (hs) => {
      const cur = Number(P.resSel.value || 1080);
      const pick = hs.includes(cur) ? cur : 1080;
      P.resSel.replaceChildren();
      for (const hh of hs) {
        const o = document.createElement('option');
        o.value = String(hh);
        o.textContent = hh === 2160 ? '4K' : `${hh}p`;
        o.selected = hh === pick;
        P.resSel.appendChild(o);
      }
    };
    const tiers = (() => { try { return window.__export?.tiers?.() ?? {}; } catch { return {}; } })();
    const heights = [720, 1080];
    if (tiers.ultra4k) heights.push(2160);
    // GH-259: the probed offerable list (the hdInfo callback below may replace
    // it) and its quality-coupled VIEW — the cinematic tier renders at
    // ≤1080p only (its ruled resolutions list), auto shows the full list
    let probedHeights = heights;
    const qualHeights = () => (P.qualSel && P.qualSel.value !== 'auto'
      ? probedHeights.filter((h) => h <= 1080) : probedHeights);
    fillRes(heights);
    // probe-gated refresh (review merge-gate P2): tiers() reads export.js's
    // support cache, which stays null until an export surface probed the
    // encoders — on a fresh boot the first card never offered 4K on capable
    // devices. hdInfo() (the GH-197 seam) probes the configs itself and
    // returns the offerable heights; a stale export.js (no hdInfo) keeps
    // the baseline list. replaceChildren fires no 'change' — a running
    // render is never restarted by the refresh.
    probingEncoder = true; // CTA stays disabled until this settles
    const probeSettled = () => {
      if (openGen !== tcGen) return; // a LATER open owns the state now
      probingEncoder = false;
      // GH-304 (review round-1 P1): the support probe just settled, so the
      // budget can now RESOLVE (formatFor answers null before it) — drop
      // the per-card snapshot and repaint every budget-dependent line
      // through the app's own writers (the heights-unchanged early return
      // above deliberately skips its own refresh on HD-only devices, which
      // left the card promising the 60 s floor while the press would
      // submit the derived budget). The CTA arms with this settle, so no
      // press can read a pre-settle snapshot.
      cardBudget = null;
      if (card) {
        // GH-364 (review r8 P2): the toggle mounts only against a SETTLED
        // capable probe (mountStrikeRow gates on !probingEncoder/
        // !noEncoder/!realtimeMode) — an offline-capable settle mounts it
        // here; the realtime/noEncoder settles leave it withheld
        mountStrikeRow();
        syncMontage(); // chip + cardQuality.refresh in one writer
        syncCardActions();
        // GH-305: the settle also resolves the full-mode plan container
        // (planFormat answers null before it) — the starter tiles re-arm
        // and the matrix re-derives (the transcode-probe finally's own
        // want/have law, mirrored for the probe full mode gates on)
        syncDestArm();
        if (P.dests && !rendering) {
          const want = destsFor(lastBlob).map((d) => d.id).join();
          const have = [...P.dests.querySelectorAll('.ob-pb-dest')]
            .map((b) => b.dataset.dest).join();
          if (want !== have) renderDests();
        }
      }
    };
    try {
      Promise.resolve(window.__export?.hdInfo?.()).then((info) => {
        if (!card || openGen !== tcGen) return; // never a LATER card's
        // mode/pickers off THIS open's detached DOM (review round-7 P2)
        if (!Array.isArray(info?.heights) || !info.heights.length) {
          // ENCODER HONESTY (review round 1 P2): hdInfo() resolves to null /
          // no heights when NO offline encoder config is supported. renderDrill
          // still EXISTS there, so under the confirm-first lifecycle the CTA
          // stayed enabled with a full ETA beside it and every press threw
          // 'no supported encoder for this tier' and then re-armed itself —
          // the same dead-button dishonesty the stale-export.js branch above
          // already refuses. support() separates that from hdInfo's BENIGN
          // nulls (no sampler / no staged record), which must not disable it.
          let s = null;
          try { s = window.__export?.support?.() ?? null; } catch { /* stale */ }
          if (s && !(s.mp4 || s.webm)) {
            // GH-250: no offline encoder on this engine. The card offers
            // the REALTIME-CAPTURE tier when the MediaRecorder machinery
            // can both capture the live bed AND hand the finished blob
            // back (the ADDITIVE __record.lastRecording getter — a stale
            // record.js without it cannot feed the card's own delivery,
            // so that pairing keeps the honest unavailable state; the
            // cache-poison contract). Only when NEITHER path exists does
            // the card paint export.noneAvailable — the export dialog's
            // honesty-ladder law, now on this surface too.
            let rec = null;
            try { rec = window.__record ?? null; } catch { rec = null; }
            if (rec?.supported === true
              && typeof rec.lastRecording === 'function') {
              realtimeMode = true;
              // WYSIWYG: a live capture promises no resolution/quality —
              // the pickers leave with the whole Advanced row, and the
              // quality/estimate lines restate the realtime promise
              // (refresh() below carries the realtimeMode branch).
              adv.style.display = 'none';
              advRow.classList.remove('on');
              adv.setAttribute('aria-expanded', 'false');
              // GH-364 (review r1 P2): the strike toggle left with the row,
              // but an arm placed BEFORE this probe settled would keep the
              // preview promising a plate the live capture must omit —
              // disarm it with the mode flip (strikeArmed()'s !realtimeMode
              // belt covers the same truth for un-carded previews)
              if (strikeOn) setStrikeOn(false);
              // clear any OFFLINE-tier open-time notice (review round-5 P2:
              // a cached exporter without renderDrill/camScript paints its
              // stale-export failure at open — offline truths that do not
              // apply to the realtime tier this card just became, and a
              // working fallback must not stand labeled unavailable) — but
              // NEVER the reopened card's ACTIVE-SAVE notice (review
              // round-11 P2): while a hint-less transcode still holds the
              // busy latch, playback.saveBusy is the one explanation for
              // the disabled controls, and releaseTranscodeBusy retires it
              if (!transcodeBusy) {
                P.progress.classList.remove('on');
                P.bar.style.width = '0%';
                P.ptext.textContent = '';
              }
              P.cardQuality?.refresh?.();
              syncCardActions(); // the CTA arms for the realtime run
            } else {
              noEncoder = true;
              P.progress.classList.add('on');
              P.cancel.style.display = 'none';
              P.ptext.textContent = t('export.noneAvailable'); // reuse ×7
              syncCardActions();
            }
          }
          return;
        }
        if (info.heights.join() === probedHeights.join()) return;
        probedHeights = info.heights;
        fillRes(qualHeights()); // GH-259: through the quality-coupled view
        // kit contract: refresh() after ANY option repopulation, or the
        // combobox label keeps the pre-4K list's text (ui-kit.md §select)
        try { P.resSelW?.refresh?.(); } catch { /* stale select.js */ }
        P.cardQuality?.refresh?.();
      }).catch(() => {}).finally(probeSettled);
    } catch { probeSettled(); /* stale export.js: nothing to wait for */ }
    // GH-252: the transcode-capability probe — per card OPEN, and only where
    // a Photos tile could ever render (a shell save/photos bridge; plain web
    // never offers Photos, so it never pays the import). destsFor() reads
    // the settled boolean synchronously; the settle re-renders the tile row
    // (tiles stay disabled behind !lastBlob / a live latch, so a tile that
    // appears late can never route anything). Guarded dynamic import
    // (cache-poison contract): an absent/stale transcode.js or a throwing
    // probe reads as capability FALSE — the webm→Photos offer is withheld
    // (mime honesty holds) and the mp4 paths are untouched.
    transcodeCap = null;
    if (bridges().saveVideo || bridges().photos) {
      // bound to THIS open (tcGen bumped once at openCard top — review
      // rounds 5+7 P2): a probe still pending when the card closed and a
      // new one opened writes NOTHING — the new open runs its own probe
      // and its snapshot is the only one that may gate its tiles. tcGen is
      // its OWN counter (paintGen also bumps mid-open on render/invalidate,
      // which must not orphan a slow probe on the SAME card).
      const probeGen = openGen;
      import('./transcode.js')
        .then((m) => Promise.resolve(m.probeTranscodeSupport?.()))
        .then((r) => { if (probeGen === tcGen) transcodeCap = r?.ok === true ? r : { ok: false }; })
        .catch(() => { if (probeGen === tcGen) transcodeCap = { ok: false }; })
        .finally(() => {
          if (probeGen !== tcGen) return;
          // GH-304 (review rounds 1+8): the transcode truth is a budget-wall
          // input (planPhotosTranscode) — drop the snapshot and repaint so
          // the next paint/press derives against the settled probe. NOT
          // mid-render (round-8 P2): the latch then holds the PRESS-time
          // budget the running render was planned under, and the success
          // path's delivered-clip repaint must read exactly that (cancel/
          // failure re-derive on their own exits).
          // GH-313 (GH-304 residual 2): the latch EXTENDS to the delivered
          // state — a settle over a DONE card (lastBlob armed) must not
          // repaint the SETUP estimate lines against the settled budget
          // while the card describes the delivered file (a transient
          // copy-vs-file window). The settled truth still reaches the NEXT
          // plan: planPhotosTranscode flips the snapshot KEY, so any later
          // planBudget/press re-derives against it. Tile re-render + CTA
          // sync stay — the settle's honest offer flip must still land.
          const delivered = lastBlob !== null;
          if (!rendering && !delivered) cardBudget = null;
          if (!card || rendering || !P.dests) return;
          if (!delivered) syncMontage();
          syncCardActions(); // GH-304 (review round-2 P2): planFits rides
          // the budget this settle may have re-walled — the CTA must
          // follow the repaint, never stand armed over an infeasible plan
          // re-render ONLY when the settle changes the offer: a gratuitous
          // replaceChildren can land between a real tap's press and release
          // and eat the click (the arm-7 reachability wall measured it)
          const want = destsFor(lastBlob).map((d) => d.id).join();
          const have = [...P.dests.querySelectorAll('.ob-pb-dest')]
            .map((b) => b.dataset.dest).join();
          if (want !== have) renderDests();
        });
    }
    P.resSel.addEventListener('change', () => {
      // GH-304 (review rounds 2+4): the budget is height-keyed, so a pick
      // change re-derives it — the delivered rate belonged to the OLD
      // key's render (post-304 the montage rate rides the budget), the
      // outer chip repaints with the card, and the CTA follows planFits
      // (pre-304 feasibility never depended on the resolution)
      cardRealRate = null;
      syncMontage(); // chip + cardQuality.refresh in one writer
      syncCardActions();
      // GH-305: the full-mode matrix is height-keyed too (planFormat at 4K
      // can negotiate a different container → the Photos starter follows);
      // a SETTLED full save's paint retires with the re-key (review round-4
      // P2 — no blob release does it in this mode)
      if (fullMode()) { retireFullPaint(); renderDests(); syncDestArm(); }
      // WYSIWYG (the 6c2d3ba5 law, re-derived for the confirm-first flow):
      // the delivered container ALWAYS matches the options on display. The
      // old cancel-and-re-render path is gone — a render can no longer be
      // running under a live picker (startRender locks it) — so the only
      // dishonest state left is a SETTLED blob under a changed label, and
      // that blob is invalidated here. In SETUP there is nothing to undo:
      // changing the pick is free and costs no render.
      if (rendering) return; // locked; kept as a belt for a stale skin
      if (lastBlob || cardSalvage) { // GH-997: an offer is output too
        // RETIRE any pending save feedback with the blob it belongs to
        // (review round 2 P2): an obSaveVideo attempt over the now-stale clip
        // is still in flight, and its matching result used to pass the
        // generation guard and stamp Saved/error over playback.resChanged —
        // making the NEWLY displayed resolution look delivered. The latch
        // release + tile re-arm stay generation-independent (the shell's one
        // result must always unlatch); only the PAINT is retired.
        paintGen += 1;
        releaseBlob();
        renderDests();      // tiles disarm behind the now-stale file
        syncCardActions();  // the CTA comes back
        P.progress.classList.add('on');
        P.cancel.style.display = 'none';
        P.bar.style.width = '0%';
        P.ptext.textContent = t('playback.resChanged');
      }
    });
    // GH-259 quality picker: rendered ONLY when the live export.js OFFERS the
    // cinematic tier (tiers() carries the key — export.js OMITS it when the
    // float-blend gate fails; encoder-probe honesty stays with the noEncoder
    // path above). Stale export.js or a gated GPU: no select at all — the
    // card stays byte-identical to the pre-GH-259 card (arm 3h pins it).
    // Identical construction to P.resSel (native select + kit upgrade); the
    // lighting variant IS an option, so no new control type enters the
    // audit surface and OFF-by-default is structural.
    P.qualSel = null;
    P.qualSelW = null;
    let qualLabel = null;
    if ('cinematic' in tiers) {
      qualLabel = document.createElement('span');
      qualLabel.className = 'ob-caps';
      qualLabel.dataset.i18n = 'export.quality';
      P.qualSel = document.createElement('select');
      P.qualSel.id = 'ob-pb-qual';
      for (const [v, key] of [['auto', 'playback.qualityAuto'],
        ['cinematic', 'export.tier.cinematic.name'],
        ['cinelight', 'playback.qualityCineLight']]) {
        const o = document.createElement('option');
        o.value = v;
        o.dataset.i18n = key; // applyDom(card) localizes, locale switch too
        o.selected = v === 'auto';
        P.qualSel.appendChild(o);
      }
      P.qualSel.addEventListener('change', () => {
        // resolution coupling: cinematic prunes 4K from the picker (fillRes
        // keeps a surviving selection; replaceChildren fires no 'change');
        // back to auto restores the probed list
        fillRes(qualHeights());
        try { P.resSelW?.refresh?.(); } catch { /* stale select.js */ }
        // GH-304 (review rounds 2+4): the tier re-key re-derives the budget
        // — delivered rate dropped, chip + card repainted, CTA follows
        // planFits (the resSel handler's law)
        cardRealRate = null;
        syncMontage();
        syncCardActions();
        // GH-305: the tier re-key re-derives the full-mode matrix too, and
        // retires a settled full save's paint (review round-4 P2)
        if (fullMode()) { retireFullPaint(); renderDests(); syncDestArm(); }
        // …then the EXACT resSel invalidation contract (the WYSIWYG law):
        // a settled blob under a changed label is the one dishonest state
        // left, and it is invalidated here — never auto-rendered
        if (rendering) return; // locked; kept as a belt for a stale skin
        if (lastBlob || cardSalvage) { // GH-997: an offer is output too
          paintGen += 1;
          releaseBlob();
          renderDests();      // tiles disarm behind the now-stale file
          syncCardActions();  // the CTA comes back
          P.progress.classList.add('on');
          P.cancel.style.display = 'none';
          P.bar.style.width = '0%';
          P.ptext.textContent = t('playback.resChanged');
        }
      });
    }
    advRow.append(resLabel, P.resSel);
    if (qualLabel) advRow.append(qualLabel, P.qualSel);
    // GH-363: the pre-strike lead-in toggle — default ON (the issue's
    // "naturalness is the point" law), session-persistent (the exportMode
    // shape). Gated on the ACTIVE dictionary carrying the key (the
    // mode-row hasBudgetKey law — no raw key names in chrome; the shipped
    // DEFAULT behavior stands either way, only the control hides).
    // #1180 (#1011: one component per setting type): the KIT SWITCH, the
    // overlay row's wrapping-label recipe (mountStrikeRow) — the caps label
    // localizes through applyDom; P.leadBtn is the row's checkbox.
    P.leadBtn = null;
    if (hasBudgetKey('playback.leadIn')) {
      const leadRow = document.createElement('label'); // the whole row is the tap target
      leadRow.className = 'ob-pb-strikerow ob-pb-leadrow';
      const leadLabel = document.createElement('span'); leadLabel.className = 'ob-caps';
      leadLabel.dataset.i18n = 'playback.leadIn';
      P.leadBtn = document.createElement('input');
      P.leadBtn.type = 'checkbox'; P.leadBtn.id = 'ob-pb-leadin';
      P.leadBtn.className = 'ob-pb-striketog';
      P.leadBtn.addEventListener('change', () => { setLeadIn(P.leadBtn.checked); syncLeadBtn(); }); // a refused flip snaps back
      leadRow.append(leadLabel, P.leadBtn); try { ctl?.upgradeToggle?.(P.leadBtn); } catch { /* native degrade */ }
      syncLeadBtn(); advRow.append(leadRow);
    }
    // GH-364: the strike-point overlay toggle — DEFAULT OFF (owner brief).
    // OFFERED only when the whole chain can deliver, structural absence
    // otherwise (the GH-259 quality-picker law — the card stays
    // byte-identical to the pre-364 card, and OFF-by-default is
    // structural): the ACTIVE dictionary carries the keys (hasLocal — the
    // GH-305 mode-row lesson), the glyph leaf loaded, export.js propagates
    // the engine's STRIKEGLYPH_CAPABLE marker, and an OFFLINE encoder
    // exists (realtimeMode captures the WebGL canvas — a DOM preview would
    // never reach the file, the GH-301 realtime-fades refusal class, so
    // the option is withheld rather than offered-and-refused).
    P.strikeTog = null;
    P.strikeRow = null;
    unmountStrikeAnno(); // GH-475: fresh card, fresh knob rows
    P.advRow = advRow; // the strike-row mount point (late-load retrofit)
    strikeStalePending = false; // a fresh card has no settled output to stale
    mountStrikeRow();
    advRow.id = 'ob-pb-advrow';
    adv.setAttribute('aria-controls', 'ob-pb-advrow');
    adv.setAttribute('aria-expanded', 'false');
    adv.addEventListener('click', () => {
      const on = advRow.classList.toggle('on');
      adv.setAttribute('aria-expanded', String(on));
    });
    // GH-305: the export-mode row (montage | full game) — a two-button
    // segmented pair over the same kit anatomy as the destination tiles.
    // Gated on the DICTIONARY carrying the mode keys (has() — the i18n
    // missing-key-detector law): a fresh playback.js over a stale cached
    // locale JSON keeps the pre-305 montage-only card instead of painting
    // raw key names into chrome. exportMode survives card opens; its
    // validity re-derives here (fullMode() consumers re-check live).
    P.modeBtns = null;
    P.modeNote = null;
    let modeRow = null;
    // hasBudgetKey (= the ADDITIVE i18n hasLocal, feature-detected) not
    // bare has() (landing review P2): has() consults the en fallback, so a
    // fresh en.json over a cached non-English dictionary would render the
    // mode row in ENGLISH instead of preserving the montage-only card —
    // the ACTIVE locale must carry the keys for the row to exist.
    if (hasBudgetKey('playback.modeFull')) {
      modeRow = document.createElement('div');
      modeRow.className = 'ob-pb-moderow';
      modeRow.setAttribute('role', 'group');
      modeRow.setAttribute('aria-label', t('playback.saveTitle'));
      P.modeBtns = {};
      for (const [id, key] of [['montage', 'playback.modeMontage'],
        ['full', 'playback.modeFull']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ob-btn ob-pb-mode';
        b.dataset.mode = id;
        b.dataset.i18n = key;
        b.addEventListener('click', () => setExportMode(id));
        P.modeBtns[id] = b;
        modeRow.appendChild(b);
      }
      P.modeNote = document.createElement('div');
      P.modeNote.className = 'ob-pb-modenote';
      if (exportMode === 'full' && !fullModeOk()) exportMode = 'montage';
    } else {
      exportMode = 'montage'; // no row, no mode — the pre-305 card
    }
    const estLine = document.createElement('div');
    estLine.className = 'ob-pb-estimate ob-nums';
    // GH-299 (owner verdict, over-cap default): the AMBER notice — when the
    // montage budget degrades over-budget walk beats to hard cuts, the card
    // SAYS so instead of silently diverging from the live preview's walks.
    // ONE writer (cardQuality.refresh below); tokens-only voice (--ob-warn,
    // ui/playback.css .ob-pb-beatwarn); born hidden, wrap-allowed, never
    // ellipsized (the desthint line's rules).
    P.beatNote = document.createElement('div');
    P.beatNote.className = 'ob-pb-beatwarn';
    // GH-363: the lead-in degrade notice — same amber voice, same ONE
    // writer (cardQuality.refresh), same born-hidden rules. Montage-only
    // by construction: full-mode plans are budget-exempt and never degrade.
    P.leadNote = document.createElement('div');
    P.leadNote.className = 'ob-pb-beatwarn';
    P.cardQuality = {
      /** Repaint the two SETUP truth lines: the quality/montage line and the
       * shots · size · ETA estimate. `probe` (card open only) lets export.js
       * refine its machine factor with the 10-frame probeMachineFactor run —
       * the caller re-poses the paused bed right after. */
      refresh: (arg) => {
        if (!pb || !card) return;
        if (realtimeMode) {
          // GH-250: the realtime promise, honestly — a WALL-CLOCK capture
          // of the trim window as it plays (the displayed speed included:
          // ½× plays and therefore records at half speed), the NEGOTIATED
          // container, realtime quality. No montage cap (nothing is
          // compressed), no size/ETA model (no renderer agreed to one) —
          // quoting the offline estimate here would be the exact
          // dishonesty the noEncoder path already refuses.
          const wallSec = realtimeWallSec();
          let ext = 'webm';
          try { ext = window.__record?.ext ?? 'webm'; } catch { /* seam */ }
          qLine.textContent = t('playback.realtimeLine',
            { sec: Math.max(1, Math.round(wallSec)), ext });
          // review round-1 P2: an over-cap trim says WHY the CTA is dead
          // (the 384 MiB bridge pre-flight priced at the recorder's
          // worst-case bitrate) instead of promising a capture every
          // destination must refuse.
          // GH-301 review round-2 P1: FADE plans refuse the realtime tier
          // honestly — the capture records the WebGL canvas, and the fade
          // is a DOM layer the file would silently omit (the exact
          // mute-file class transcode.js refuses).
          estLine.textContent = planHasFades()
            ? t('playback.realtimeFades')
            : wallSec > RT_CAP_SEC
              ? t('playback.realtimeTooLong', { sec: RT_CAP_SEC })
              : t('playback.realtimeNote');
          // a live capture records the beat-inclusive playback — nothing
          // degrades, so the over-cap notice never applies here (GH-299)
          P.beatNote?.classList.remove('on');
          P.leadNote?.classList.remove('on'); // GH-363: same law
          return;
        }
        // GH-305 full-game mode: the promise is 1:1 — the whole trimmed
        // session at the displayed speed, every walk kept (no montage
        // prefix, no amber degrade notice: nothing degrades by design).
        // The estimate line stays the SAME estimateDrill machinery over
        // the UNBUDGETED seconds, so the wall-clock ETA is honest for a
        // render that scales with session length; an over-extent plan
        // states the cap instead of quoting a file the wire must refuse.
        if (fullMode()) {
          const { sec, shots } = plannedFull();
          const hh2 = Number(P.resSel?.value ?? 1080);
          const dur = fmtDur(Math.round(sec)) ?? `${Math.round(sec)} s`;
          qLine.textContent = t('playback.fullLine',
            { dur, res: hh2 === 2160 ? '4K' : `${hh2}p` });
          P.beatNote?.classList.remove('on');
          // GH-363: full-mode leads are budget-exempt — never degraded
          P.leadNote?.classList.remove('on');
          const fits = fullFits();
          let e2 = null;
          try {
            const { width, height, tier, cinelight } = savePlan().opts;
            e2 = window.__export?.estimateDrill?.({ tier, width, height,
              sec, probe: arg === true, cinelight: cinelight === true });
          } catch { e2 = null; }
          const one2 = shots === 1 ? 'One' : '';
          estLine.textContent = !fits.ok
            ? (fits.tooLong
              ? t('playback.fullTooLong', { min: fits.min })
              : t('playback.fullTooBig', {
                size: `${(fits.bytes / 1e6).toFixed(0)} MB`,
                cap: `${Math.round(fits.cap / 2 ** 30)} GB` }))
            : shots && Number.isFinite(e2?.etaSec)
              ? t(`playback.clipPlan${one2}`, { shots,
                size: `${(e2.bytes / 1e6).toFixed(e2.bytes < 3e6 ? 1 : 0)} MB`,
                eta: fmtEta(e2.etaSec) })
              : t(`playback.clipShots${one2}`, { shots });
          return;
        }
        const probe = arg === true; // strictly opt-in: no caller can stall
        // the frame loop by passing an incidental truthy argument
        const { sec, rate: est, degraded, leadDegraded, budgetSec } =
          plannedMontage();
        // GH-299 amber notice: over-budget walks export as hard cuts.
        // GH-304: the copy states the DERIVED budget through the ADDITIVE
        // versioned {dur} keys (see the syncMontage copy-law note)
        if (P.beatNote) {
          P.beatNote.classList.toggle('on', degraded > 0);
          if (degraded > 0) {
            P.beatNote.textContent = degraded === 1
              ? tBudget('playback.walkCutsOneDur', 'playback.walkCutsOne',
                { n: degraded }, budgetSec)
              : tBudget('playback.walkCutsDur', 'playback.walkCuts',
                { n: degraded }, budgetSec);
          }
        }
        // GH-363 amber notice: over-budget lead-ins export shortened (a
        // lower tier) or cut. Gated on the ACTIVE dictionary carrying the
        // keys (the mode-row hasBudgetKey law — a stale locale JSON keeps
        // the notice dark, never raw key names).
        if (P.leadNote) {
          const leadWarn = leadDegraded > 0 && hasBudgetKey('playback.leadCuts');
          P.leadNote.classList.toggle('on', leadWarn);
          if (leadWarn) {
            P.leadNote.textContent = t(leadDegraded === 1
              ? 'playback.leadCutsOne' : 'playback.leadCuts',
            { n: leadDegraded });
          }
        }
        const rate = Number.isFinite(cardRealRate) ? cardRealRate : est;
        const hh = Number(P.resSel?.value ?? 1080);
        // GH-259: auto keeps playback.qualityLine byte-identical; the
        // cinematic options paint the qualityLineCine copy (same params,
        // same montage prefix composition below)
        const qual = P.qualSel?.value ?? 'auto';
        let line = t(qual === 'auto' ? 'playback.qualityLine'
          : 'playback.qualityLineCine', {
          sec: Math.round(Math.min(sec, budgetSec)),
          res: hh === 2160 ? '4K' : `${hh}p`,
        });
        if (rate > 1) {
          line = `${t('playback.qualityMontage', { rate: rate.toFixed(1) })} · ${line}`;
        }
        qLine.textContent = line;
        // honest pre-render promise (defect A): the export.js estimate seam
        // is the single source for both the ETA and the size — a stale
        // export.js without it degrades to the shot count alone, never a
        // number the renderer never agreed to.
        const shots = includedSegments().length;
        const { width, height, tier, cinelight } = savePlan().opts;
        let e = null;
        try {
          e = window.__export?.estimateDrill?.({
            tier, width, height, sec: Math.min(sec, budgetSec), probe,
            // GH-259 review r2: the studio-lighting variant prices its own
            // per-subframe cost — a stale export.js ignores the extra key
            cinelight: cinelight === true });
        } catch { e = null; }
        const one = shots === 1 ? 'One' : ''; // the playback.usageOne law
        // ZERO included segments (GH-238 review finding 7): estimateDrill
        // floors frames at 1 and always adds the 160 kB container constant,
        // so an empty plan printed "0 shots · ~0.2 MB · ~1 s" — a promise for
        // a file that will never exist. Nothing to render, no number: the
        // line degrades to the shot count, next to the CTA syncCardActions
        // already disables on `!includedSegments().length`. Not reachable by
        // pointer (the trim drag clamps to a >= 0.1 s window inside
        // [0, total] and the segments tile that span), but `setTrim(total,
        // total)` on the public __playback seam lands here — arm 3e gates it.
        // an INFEASIBLE plan says why (review round 3 P2) rather than quoting
        // a size/ETA for a render offline-render.js refuses before frame one
        estLine.textContent = !planFits(shots)
          ? tBudget('playback.clipTooLongDur', 'playback.clipTooLong',
            { shots }, budgetSec)
          : shots && Number.isFinite(e?.etaSec)
            ? t(`playback.clipPlan${one}`, { shots,
              size: `${(e.bytes / 1e6).toFixed(e.bytes < 3e6 ? 1 : 0)} MB`,
              eta: fmtEta(e.etaSec) })
            : t(`playback.clipShots${one}`, { shots });
      },
    };
    // the pinned frame (defect B): head | scrolling body | pinned foot
    const bodyEl = document.createElement('div');
    bodyEl.className = 'ob-pb-card-body ob-scroll';
    if (modeRow) bodyEl.append(modeRow, P.modeNote);
    bodyEl.append(quality, advRow, estLine, P.beatNote, P.leadNote,
      buildCardBody());
    card.append(head, bodyEl, buildCardFoot());
    document.body.appendChild(card);
    applyDom(card);
    // kit combobox over the native picker (defect C) — value-authoritative
    // native stays in the DOM for app/e2e drive; null when select.js is
    // stale/absent, and the native select simply keeps working
    P.resSelW = (() => {
      try { return selMod?.upgradeSelect?.(P.resSel) ?? null; } catch { return null; }
    })();
    P.qualSelW = P.qualSel ? (() => {
      try { return selMod?.upgradeSelect?.(P.qualSel) ?? null; } catch { return null; }
    })() : null;
    // SETUP preview: CAPABILITY-OPTIMISTIC, not the final routing (GH-238
    // review finding 6 — calling it "the honest routing" overstated it).
    // destsFor(null) assumes the plan's container will be mp4 and
    // canShareBlob(null) answers only "does this engine have share+canShare",
    // never "will it accept THIS file", so a Photos or Share tile shown here
    // can disappear when the blob lands and renderDests re-runs the matrix
    // with the real File. Deliberate: the alternative is a second writer of
    // export.js's container ladder inside playback.js. The tiles are DISABLED
    // for the whole preview (no blob, and 4h keeps them disarmed while an
    // awaited save is still in flight), so the optimism never routes anything.
    renderDests();
    P.cardQuality.refresh(true);
    restorePlayerBed(); // the estimate probe hands the RAF loop back
    syncCardActions();
    if (transcodeBusy) {
      // a REOPENED card over a live hint-less transcode says WHY its
      // controls are disabled (review round-9 P2): the busy latch is
      // generation-independent exactly like the awaited saveWait, but its
      // progress paints are (rightly) retired with the old card's
      // generation — so the shared row states the situation instead of
      // standing silent beside dead controls.
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('playback.saveBusy');
    }
    if (!hasRenderDrill()) {
      // stale export.js: say so at card OPEN. With the render behind a CTA
      // the old "press it and find out" moment is gone — a dead button with
      // no reason is exactly the dishonesty this surface refuses.
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'drill render unavailable (stale export.js)' });
    } else if (!camScriptOk()) {
      // same open-time honesty for a POV/fade plan against a merge-base-
      // cached export.js (review round-2 P1; r13 P3 — the notice names the
      // capability that is actually missing): the CTA is disabled by the
      // same predicate, and the reason stands beside it instead of a dead
      // button — or worse, a silent wrong-camera/un-faded export.
      let why = 'scripted camera unavailable (stale export.js) — reload the app';
      try {
        const opts = savePlan().opts;
        const scriptBad = (opts.perShotCamera ?? []).some((c) => c
          && typeof c === 'object' && c.script)
          && window.__export?.camScriptCapable !== true;
        const beatBad = (opts.beats ?? []).some(Boolean)
          && window.__export?.walkBeatCapable !== true;
        const fadeBad = (opts.fades ?? []).length
          && window.__export?.fadeCapable !== true;
        if (!scriptBad && !beatBad && fadeBad) {
          why = 'fade transitions unavailable (stale export.js) — reload the app';
        } else if (!scriptBad && beatBad) {
          why = 'walk transitions unavailable (stale export.js) — reload the app';
        } else if (!scriptBad && !beatBad && !fadeBad && opts.strike
          && window.__export?.strikeGlyphCapable !== true) {
          // GH-364: the notice names the missing capability (the r13 P3 law)
          why = 'strike-point overlay unavailable (stale export.js) — reload the app';
        }
      } catch { /* the generic copy stands */ }
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed', { message: why });
    }
    cardKitless = !dialog?.openPanel;
    if (!cardKitless) {
      dialog.openPanel(card, {
        backdrop: true,
        // GH-720: focus-on-present through the title anchor (the GH-226
        // phantom-ring law holds: the anchor rings only on keyboard modality)
        autofocus: true,
        onClose: () => { if (!rendering) closeCard(); },
        dismissable: () => !rendering, // a running encode ignores Escape
      });
      const bd = card.previousElementSibling;
      if (bd?.classList.contains('ob-backdrop')) bd.classList.add('ob-backdrop--top');
    } else {
      cardScrim = document.createElement('div');
      cardScrim.className = 'ob-pb-scrim';
      cardScrim.style.zIndex = '61';
      cardScrim.addEventListener('click', () => closeCard());
      document.body.insertBefore(cardScrim, card);
      // GH-720 review r6: the kit-less card owns its Escape exactly like the
      // list's escList register (capture, claimed) — before this the press
      // was inert: onBedKey treats #ob-pb-card as a layer and the fallback
      // registered no listener of its own, so a keyboard user had no exit
      document.addEventListener('keydown', escCard, true);
      try { h.focus({ preventScroll: true }); } catch { /* kit-less degrade */ }
    }
    // NO render here — the owner presses Export (defect A).
  }

  /** Upgrade a live card's resolution picker when select.js resolves AFTER
   * the card opened (the retrofitIcons late-load pattern). */
  retrofitSelect = () => {
    if (!card) return;
    if (P.resSel && !P.resSelW) {
      try { P.resSelW = selMod?.upgradeSelect?.(P.resSel) ?? null; } catch { /* stale */ }
    }
    if (P.qualSel && !P.qualSelW) { // GH-259: the quality picker upgrades too
      try { P.qualSelW = selMod?.upgradeSelect?.(P.qualSel) ?? null; } catch { /* stale */ }
    }
  };

  /** The pinned foot: progress block (bar + text + Cancel) above the action
   * row (Export + Close). Mockup 03 shows neither — both are RECORDED
   * deviations (the progress bar predates this change; the confirm CTA is
   * the owner two-step-save fix). */
  function buildCardFoot() {
    const foot = document.createElement('div');
    foot.className = 'ob-pb-card-foot';
    P.progress = document.createElement('div');
    P.progress.className = 'ob-pb-progress';
    const barWrap = document.createElement('div');
    barWrap.className = 'ob-pb-bar';
    P.bar = document.createElement('div');
    barWrap.appendChild(P.bar);
    const ptext = document.createElement('div');
    ptext.className = 'ob-pb-ptext';
    P.ptext = document.createElement('span');
    P.ptext.className = 'ob-nums';
    P.cancel = document.createElement('button');
    P.cancel.type = 'button';
    // named so the coarse 44pt floor can address it and arm 8e's enumerated
    // sweep reports it by name — mid-render this is the ONLY way out of the
    // card (dismissal is blocked), so it is not exempt from the tap law
    // GH-245: kit ghost voice; .ob-pb-pcancel keeps the outlined danger-ink
    // register (restated on hover) + the progress-row metrics
    P.cancel.className = 'ob-btn ob-btn--ghost ob-pb-pcancel';
    P.cancel.dataset.i18n = 'export.cancel';
    P.cancel.addEventListener('click', () => {
      if (rtCancel) { rtCancel(); return; } // GH-250: the realtime run's own
      // abort — __export.cancel() has nothing of ours to abort there
      try { window.__export?.cancel?.(); } catch { /* stale seam */ }
    });
    ptext.append(P.ptext, P.cancel);
    P.progress.append(barWrap, ptext);
    P.actions = document.createElement('div');
    P.actions.className = 'ob-pb-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    // .ob-btn base added (GH-245): the variant class alone never carried
    // the kit layout contract
    closeBtn.className = 'ob-btn ob-pb-dismiss ob-btn--ghost';
    closeBtn.dataset.i18n = 'playback.close';
    closeBtn.addEventListener('click', () => closeCard());
    P.go = document.createElement('button');
    P.go.type = 'button';
    P.go.className = 'ob-btn ob-pb-go ob-btn--primary'; // GH-245: base added
    // text-only primary, exactly like the export dialog's #ob-x-start; the
    // 'Export' wording is the SAME key ×7 locales (reuse-over-duplicate law)
    P.go.dataset.i18n = 'export.start';
    P.go.addEventListener('click', () => {
      if (realtimeMode) startRealtime(); // GH-250: the fallback tier
      else startRender();
    });
    // GH-997: "Save anyway" over a salvaged render (syncCardActions owns
    // its visibility; hidden on every other state)
    P.salvage = document.createElement('button');
    P.salvage.type = 'button';
    P.salvage.className = 'ob-btn ob-pb-salvage';
    P.salvage.dataset.i18n = 'export.salvage.save';
    P.salvage.style.display = 'none';
    P.salvage.addEventListener('click', () => acceptSalvage());
    P.actions.append(closeBtn, P.salvage, P.go);
    foot.append(P.progress, P.actions);
    return foot;
  }

  const hasRenderDrill = () => {
    try { return typeof window.__export?.renderDrill === 'function'; } catch { return false; }
  };

  /** True when the CURRENT plan's camera directives can really be
   * delivered (GH-275 review round-2 P1): a plan carrying { script }
   * segments (the POV preset) needs a post-GH-275 export.js — detected
   * through the ADDITIVE `camScriptCapable` seam key, whose presence also
   * guarantees the CAMSCRIPT_CAPABLE engine check one layer down. A
   * merge-base-cached export.js forwards the directive to an engine that
   * silently ignores it and "succeeds" with the wrong camera — the exact
   * silent WYSIWYG lie both markers exist to kill. Script-less plans are
   * always deliverable; unreadable state answers true (the other gates
   * own their own honesty). */
  function camScriptOk() {
    try {
      if (!pb) return true;
      const opts = savePlan().opts;
      const cams = opts.perShotCamera ?? [];
      if (cams.some((c) => c && typeof c === 'object' && c.script)
        && window.__export?.camScriptCapable !== true) return false;
      // GH-299: a plan carrying walk beats needs the beat-capable exporter
      // — the SAME two-layer honesty chain (walkBeatCapable propagates the
      // linked engine's WALKBEAT_CAPABLE marker). A merge-base-cached
      // export.js would silently drop opts.beats and ship hard cuts the
      // live player walked — the exact WYSIWYG lie this gate exists for.
      if ((opts.beats ?? []).some(Boolean)
        && window.__export?.walkBeatCapable !== true) return false;
      // GH-301: the same chain for fade windows — a stale exporter would
      // silently ship un-faded frames the live player dipped to black
      if ((opts.fades ?? []).length
        && window.__export?.fadeCapable !== true) return false;
      // GH-364: the same chain for the strike plate — a stale exporter
      // would silently ship plate-less frames the preview promised. Near-
      // unreachable (the toggle offer gates on the same seam) — the belt
      // covers a seam flipped between card open and press.
      if (opts.strike && window.__export?.strikeGlyphCapable !== true) {
        return false;
      }
      return true;
    } catch { return true; }
  }

  /** GH-274 (option a): the ONE writer of the setup hint's visibility —
   * shown exactly while the card sits in a WORKABLE setup state: no
   * rendered blob (the tiles' own arm condition), no encode running, and
   * an Export CTA the user can actually press. The pressability half
   * mirrors syncCardActions' own disable conditions VERBATIM (review
   * GH-274 P2: a slow encoder probe, an empty trim or an infeasible plan
   * all disable the CTA — "Export the clip first" beside an unusable
   * button is a lie). Hidden the moment the render completes or starts;
   * BACK after cancel/failure and after the res/quality invalidation
   * releases the blob (the card is setup again); never shown over the
   * stale-export or no-encoder notices. */
  /** Wall seconds a realtime run will take: the trim window at the
   * displayed speed (GH-250 — wall-clock by nature; ½× plays, and
   * therefore records, twice the content seconds). GH-299: measured on the
   * beat-INCLUSIVE timeline — a live capture plays through the walk beats
   * too (the pre-299 per-segment sum under-counted them), and beat spans
   * cost RATE-1 wall time whatever the detent says (the setPlaying pacing
   * law: beats are fixed output seconds, only play rides the speed). */
  function realtimeWallSec() {
    if (!pb) return 0;
    // GH-433: price the EFFECTIVE window (the associated span for a
    // lead-only selection — the capture records exactly that; raw trim
    // bounds otherwise, byte-identical arithmetic)
    const { tIn, tOut } = effWindow();
    // beats AND lead windows advance at RATE 1 whatever the speed detent
    // says (the setPlaying split law) — both sit on the fixed side of the
    // wall-clock estimate (GH-363 review r1 P2: a ½× capture otherwise
    // prices each lead at 2× and the RT_CAP_SEC wall rejects valid runs)
    let fixedIn = 0;
    for (let i = 0; i < pb.durs.length; i++) {
      const w = pb.beats?.[i];
      if (w) {
        const b0 = pb.cum[i] + pb.segEndSec(i, pb.tails?.[i] ?? 0);
        fixedIn += Math.max(0,
          Math.min(tOut, b0 + w.beatSec) - Math.max(tIn, b0));
      }
      const L = pb.leads?.[i] ?? 0;
      if (L > 0) {
        fixedIn += Math.max(0,
          Math.min(tOut, pb.cum[i]) - Math.max(tIn, pb.cum[i] - L));
      }
    }
    return (tOut - tIn - fixedIn) / pb.speed + fixedIn;
  }
  // The honest realtime ceiling (review round-1 P2): a live capture has no
  // montage cap, but every delivery bridge pre-flights 384 MiB — and at the
  // recorder's 40 Mbps worst-case bitrate ~80 s already exceeds it, so an
  // unbounded run would accumulate a phone-crushing blob that every
  // destination then refuses. 75 s keeps the worst case under the cap with
  // margin; the card states the limit and disables the CTA instead.
  const RT_CAP_SEC = 75;
  // GH-1099: a live capture whose recorder never starts (no native start event
  // and no encoded byte — an encoder that died before its first frame) fails
  // honestly after this long instead of holding the locked card to the cap
  const RT_START_SEC = 10;

  /** GH-305: the ONE writer of the mode row's pressed/disabled/note state.
   * Rides syncCardActions (every lifecycle flip re-derives it). The FULL
   * option is DISABLED-not-hidden when the chain is missing a layer — the
   * honest reason stands under the row (the GH-274 "explain, never a bare
   * dead control" law): a v2-only shell / plain web names the wire; a
   * fresh-page-stale-engine pairing names the reload. */
  function syncModeRow() {
    if (!card || !P.modeBtns) return;
    const ok = fullModeOk();
    if (!ok && exportMode === 'full') exportMode = 'montage';
    const locked = rendering || !!transcodeBusy || saveWait !== null;
    for (const [id, b] of Object.entries(P.modeBtns)) {
      b.setAttribute('aria-pressed', String(exportMode === id));
      b.disabled = locked || (id === 'full' && !ok);
    }
    if (P.modeNote) {
      P.modeNote.classList.toggle('on', !ok);
      if (!ok) {
        // per-cause honesty (review round-2 P2): a missing v3 WIRE says
        // "update the app"; a v3 shell whose OFFLINE ENCODER is absent
        // (realtime-tier card / noEncoder) must not — the wire is fine and
        // an update fixes nothing there. The remaining cause is the mixed
        // cache (stale export.js under a capable wire+encoder): the
        // reload voice, English-in-export.failed by the openCard notices'
        // precedent. GH-438: the update prompt is SHELL-audience copy —
        // plain web has no app to update, so a missing wire with NO shell
        // at all names the real constraint (the browser has no streaming
        // save) and the supported path (the highlight clip) instead.
        const wireOk = streamBridge() !== null && fullStreamBytes() !== null;
        // review r2 P2: a returning user can pair THIS fresh playback.js
        // with a stale cached locale dictionary that predates the
        // web-voice key — detect it on the ACTIVE dictionary (the
        // hasBudgetKey/hasLocal law, GH-313 register; namespace-reached so
        // a stale i18n.js degrades to has()) and fall back to the legacy
        // shell copy: localized old prose beats a missing-key warn plus an
        // English leak inside a non-English UI.
        const webKeyOk = typeof i18nNs.hasLocal === 'function'
          ? i18nNs.hasLocal('playback.fullNeedsWeb')
          // ancient i18n.js without hasLocal (predates GH-313): has()
          // consults the en fallback too, which can vouch for a key the
          // ACTIVE stale dictionary lacks (review r4 P2 — a fresh en.json
          // beside a stale de.json would leak English) — trust it only
          // when en IS the active locale; every other locale degrades to
          // the legacy shell copy.
          : (getLocale() === 'en' && has('playback.fullNeedsWeb'));
        const key = !wireOk
          ? (bridges().shell || !webKeyOk ? 'playback.fullNeedsShell'
            : 'playback.fullNeedsWeb')
          : (realtimeMode || noEncoder) ? 'playback.fullNeedsEncoder' : null;
        // the two LEGACY capability reasons ride dataset.i18n (applyDom
        // re-localizes them — the syncDestFx dataset-swap law; both keys
        // exist in every cached dictionary generation); the stale-export
        // branch is a PARAMETERIZED compose applyDom cannot rebuild, so
        // it drops the dataset and the locale callback's syncModeRow()
        // re-derive owns its repaint (review round-3 P3). The WEB-VOICE
        // key drops the dataset too (review r3 P2): the locale callback
        // runs applyDom(card) BEFORE syncModeRow(), so a live switch onto
        // a stale cached dictionary would t() the dataset key into a
        // missing-key warn + an English flash before the re-derive could
        // re-key it — the re-derive owns this repaint instead (it picks
        // the web voice or the legacy shell copy per the NEW dictionary).
        if (key === 'playback.fullNeedsWeb') {
          delete P.modeNote.dataset.i18n;
          P.modeNote.textContent = t(key);
        } else if (key) {
          P.modeNote.dataset.i18n = key;
          P.modeNote.textContent = t(key);
        } else {
          delete P.modeNote.dataset.i18n;
          P.modeNote.textContent = t('export.failed',
            { message: 'full-length streaming export unavailable '
              + '(stale export.js) — reload the app' });
        }
      }
    }
  }

  /** GH-305: the mode switch — SETUP-state only (the pickers' WYSIWYG
   * lock law: a running render/save owns the card), and a settled montage
   * blob is INVALIDATED on the way out (the resSel invalidation contract:
   * a blob under a mode it was not rendered for is the same dishonest
   * state as a changed resolution label). */
  /** GH-305 (review round-4 P2): retire a SETTLED full-export attempt's
   * paint when the plan re-keys — full mode has no blob whose release
   * would do it (the montage invalidation path), so a mode/res/quality
   * change must drop the Saved row + the done tile itself or the new
   * plan would stand labeled already-saved. Blob-owning states keep
   * their own contract (the lastBlob branches); live latches never
   * reach here (the callers are locked behind saveWait/rendering). */
  function retireFullPaint() {
    if (lastBlob || saveWait !== null || rendering) return;
    if (!destFx && !P.ptext?.textContent) return;
    paintGen += 1;
    destFx = null;
    syncDestFx();
    if (P.progress) {
      P.progress.classList.remove('on');
      P.bar.style.width = '0%';
      P.ptext.textContent = '';
    }
  }

  /** GH-363: the lead-in toggle's ONE state writer — since #1180 the kit
   * switch's checked state, the accessible truth (#1011: one component per
   * setting type; the overlay row beside it is the same switch). The On /
   * Off words (playback.leadInOn / leadInOff) stay in the dictionaries for
   * a cached pre-#1180 playback.js, whose pill still paints them through
   * dataset.i18n. */
  function syncLeadBtn() {
    if (!P.leadBtn) return;
    P.leadBtn.checked = leadInOn;
  }

  /** GH-363: flip the pre-strike lead-in option — the ONE toggle for both
   * the live player schedule and the export plans (WYSIWYG). Mirrors the
   * setExportMode invalidation contract: the plan changed shape, so a
   * settled blob retires and every promise line re-derives. */
  function setLeadIn(on) {
    const want = on !== false;
    if (rendering || transcodeBusy || saveWait !== null) return;
    if (leadInOn === want) { syncLeadBtn(); return; }
    leadInOn = want;
    if (pb) {
      // live mirror: the standing cue arm was built for the other option
      // shape — clear it (syncCueArm re-arms fresh over the new schedule)
      pb.cueArm = null;
      try { window.__test.cuePost?.(null); } catch { /* stale seam */ }
      refreshSchedule();
      renderAtT(pb.T);
    }
    syncLeadBtn();
    if (!card) return;
    cardRealRate = null;
    if (lastBlob || cardSalvage) { // GH-997: an offer is output too
      paintGen += 1;
      releaseBlob();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.bar.style.width = '0%';
      P.ptext.textContent = t('playback.resChanged');
      renderDests();
    } else {
      // a settled FULL save has no lastBlob to invalidate — its Saved
      // paint must not label a plan the toggle just changed (the
      // setExportMode contract; review 363 r1 P2)
      retireFullPaint();
    }
    syncMontage(); // chip + cardQuality.refresh in one writer
    syncCardActions();
    syncDestArm();
  }

  function setExportMode(id) {
    if (!card) return;
    const want = id === 'full' && fullModeOk() ? 'full' : 'montage';
    if (rendering || transcodeBusy || saveWait !== null) return;
    if (exportMode === want) { syncModeRow(); return; }
    exportMode = want;
    cardRealRate = null;
    cardBudget = null; // mode re-keys the plan — derive fresh either way
    if (lastBlob || cardSalvage) { // GH-997: an offer is output too
      paintGen += 1;
      releaseBlob();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.bar.style.width = '0%';
      P.ptext.textContent = t('playback.resChanged');
    } else {
      retireFullPaint(); // a settled full save must not label the new mode
    }
    renderDests(); // the matrix differs per mode (starters vs deliverers)
    syncMontage(); // chip + cardQuality.refresh in one writer
    syncCardActions(); // CTA visibility + mode row + hint re-derive
    syncDestArm();
  }

  /** GH-364: build the strike-overlay toggle row into the OPEN card's
   * Advanced grid — called at card build AND retrofitted when the glyph
   * leaf resolves late (review r4 P2: the sgMod import races only a
   * pathological cold boot, but a successful late resolution must not
   * strand the open card option-less until a reopen; the retrofitSelect
   * shape). OFFERED only when the whole chain can deliver, structural
   * absence otherwise (the GH-259 quality-picker law — the card stays
   * byte-identical to the pre-364 card, and OFF-by-default is
   * structural): the ACTIVE dictionary carries the keys (strikeDictOk —
   * hasLocal ONLY, no has() fallback: this option has NO legacy copy, and
   * the fallback consults the fresh en dictionary, so a stale non-English
   * dictionary would offer the toggle and BURN an English caption into an
   * otherwise localized export; a stale i18n.js withholds it wholly), the
   * glyph leaf loaded, export.js propagates the engine's
   * STRIKEGLYPH_CAPABLE marker, and an OFFLINE encoder exists
   * (realtimeMode captures the WebGL canvas — a DOM preview would never
   * reach the file, the GH-301 realtime-fades refusal class, so the
   * option is withheld rather than offered-and-refused). */
  function mountStrikeRow() {
    if (!card || !P.advRow || P.strikeTog) return;
    // probe-settled offline capability only (review r8 P2): a pending probe
    // defers to the probeSettled() mount call; a noEncoder/realtime settle
    // withholds the row — a toggle that no export path can burn is a dead
    // control beside the export.noneAvailable / realtime notices
    if (probingEncoder || noEncoder || realtimeMode || sgMod === null
      || window.__export?.strikeGlyphCapable !== true
      || !strikeDictOk()) return;
    // a WRAPPING label (the export dialog's #ob-x-audio shape): the whole
    // row is the control's tap target (coarse 44 px floor in the sheet)
    // and the caption labels the input with no aria plumbing
    P.strikeRow = document.createElement('label');
    P.strikeRow.className = 'ob-pb-strikerow';
    const cap = document.createElement('span');
    cap.className = 'ob-caps';
    cap.dataset.i18n = 'playback.strikeOverlay';
    cap.textContent = t('playback.strikeOverlay'); // retrofit path: the
    // card's applyDom already ran — paint the label now
    P.strikeTog = document.createElement('input');
    P.strikeTog.type = 'checkbox';
    P.strikeTog.id = 'ob-pb-strike-tog';
    P.strikeTog.className = 'ob-pb-striketog';
    P.strikeTog.checked = strikeOn;
    P.strikeTog.addEventListener('change', () => {
      setStrikeOn(P.strikeTog.checked);
    });
    P.strikeRow.append(cap, P.strikeTog);
    // kit switch over the native checkbox (upgradeToggle adds .ob-toggle
    // to THIS label + the track span — the 8d no-native-controls audit;
    // the sheet then stretches the invisible input over the whole row so
    // the 8e coarse floor measures the REAL tap target). Feature-detected
    // (cache-poison contract): a stale/absent controls.js keeps the
    // native checkbox — unstyled but functional, never a dead control.
    try { ctl?.upgradeToggle?.(P.strikeTog); } catch { /* native degrade */ }
    // born under the CURRENT lifecycle lock (review r9 P3): a late mount
    // (leaf resolve / locale restore / probe settle) can land mid-render
    // or mid-save, and no action-state sync follows the mount — the
    // syncCardActions term, verbatim
    P.strikeTog.disabled = rendering || !!transcodeBusy
      || (fullMode() && saveWait !== null);
    P.advRow.append(P.strikeRow);
    mountStrikeAnnoRows();
  }

  /** GH-475: the annotation knob rows — mounted WITH the overlay row (and
   * retrofittable after a locale switch to a capable dictionary), only
   * against a fully capable chain: leaf fmtElev/fmtPower + the engine's
   * burn marker (__export.strikeAnnoCapable — a cached pre-475
   * offline-render.js ignores the fields silently) + the dictionary keys;
   * structural absence otherwise, the quality-picker law. Disabled while
   * the overlay itself is off (a knob without the plate burns nothing)
   * and under the same lifecycle locks as the overlay toggle. */
  function mountStrikeAnnoRows() {
    if (!card || !P.advRow || !P.strikeRow || P.strikeAnnoRows) return;
    if (typeof sgMod?.fmtElev !== 'function'
      || typeof sgMod?.fmtPower !== 'function'
      || window.__export?.strikeAnnoCapable !== true
      || typeof i18nNs.hasLocal !== 'function'
      || !i18nNs.hasLocal('playback.strikeElev')
      || !i18nNs.hasLocal('playback.strikePower')) return;
    P.strikeAnnoRows = [];
    const mkAnnoRow = (key, checked, onChange) => {
      const row = document.createElement('label');
      row.className = 'ob-pb-strikerow ob-pb-strikeanno';
      const c = document.createElement('span');
      c.className = 'ob-caps';
      c.dataset.i18n = key;
      c.textContent = t(key);
      const tog = document.createElement('input');
      tog.type = 'checkbox';
      tog.className = 'ob-pb-striketog';
      tog.checked = checked;
      tog.addEventListener('change', () => onChange(tog.checked));
      row.append(c, tog);
      try { ctl?.upgradeToggle?.(tog); } catch { /* native degrade */ }
      tog.disabled = !strikeOn || rendering || !!transcodeBusy
        || (fullMode() && saveWait !== null);
      P.advRow.append(row);
      P.strikeAnnoRows.push(row);
      return tog;
    };
    P.strikeElevTog = mkAnnoRow('playback.strikeElev', strikeElevOn,
      (on) => setStrikeAnno('elev', on));
    P.strikePowerTog = mkAnnoRow('playback.strikePower', strikePowerOn,
      (on) => setStrikeAnno('power', on));
  }

  /** GH-475: drop the knob rows (locale/lifecycle removal — they live and
   * die with the overlay row). */
  function unmountStrikeAnno() {
    for (const r of P.strikeAnnoRows ?? []) r.remove();
    P.strikeAnnoRows = null;
    P.strikeElevTog = null;
    P.strikePowerTog = null;
  }

  /** GH-475: the ONE writer of the annotation knobs — the card rows and
   * the __playback.setStrikeAnno seam both land here. Same lifecycle
   * contract as setStrikeOn: locked while a render/transcode/full-save is
   * in flight, live preview repaints immediately (WYSIWYG), and a settled
   * blob under a changed option invalidates — never auto-re-rendered. */
  function setStrikeAnno(kind, on) {
    on = on === true;
    const cur = kind === 'elev' ? strikeElevOn : strikePowerOn;
    const tog = kind === 'elev' ? P.strikeElevTog : P.strikePowerTog;
    if (cur === on) return;
    if (card && (rendering || transcodeBusy
      || (fullMode() && saveWait !== null))) {
      if (tog) tog.checked = cur; // belt: stale skin
      return;
    }
    if (kind === 'elev') strikeElevOn = on; else strikePowerOn = on;
    if (tog && tog.checked !== on) tog.checked = on;
    if (pb && player) renderAtT(pb.T);
    strikeInvalidate();
  }

  /** GH-364: the ONE writer of the strike-overlay arm — the card toggle
   * and the __playback.setStrike seam both land here. Flips the LIVE
   * preview immediately (WYSIWYG: the player behind the card shows what
   * the next render burns — the 11h identity-arm surface), then re-runs
   * the resSel invalidation contract: with a render locked nothing moves,
   * and a SETTLED blob under a changed option is the one dishonest state
   * left, so it is invalidated here — never auto-re-rendered. */
  function setStrikeOn(on) {
    on = on === true;
    if (strikeOn === on) return;
    // locked lifecycle BEFORE any mutation (review r1 P2: a flip during a
    // Photos transcode used to change the armed state while skipping the
    // invalidation — the settled clip stayed deliverable under the new
    // option label). The toggle itself disables under the same latches;
    // this is the seam-route belt. The card-less path stays free (no
    // deliverable exists — closeCard released the blob). A MONTAGE awaited
    // save is deliberately NOT a lock (review r7 P2 — the pickers' stance:
    // the flip's blob invalidation runs and the identity-scoped save
    // feedback retires the in-flight paint); full mode keeps it (its
    // streamed output has no page blob to invalidate — the option must
    // hold still until the shell's one result lands).
    if (card && (rendering || transcodeBusy
      || (fullMode() && saveWait !== null))) {
      if (P.strikeTog) P.strikeTog.checked = strikeOn; // belt: stale skin
      return;
    }
    strikeOn = on;
    if (P.strikeTog && P.strikeTog.checked !== on) P.strikeTog.checked = on;
    // GH-475: the knob rows arm/disarm with the overlay (their values
    // persist — re-enabling the overlay restores the chosen annotations)
    for (const tog of [P.strikeElevTog, P.strikePowerTog]) {
      if (tog) tog.disabled = !on || rendering || !!transcodeBusy
        || (fullMode() && saveWait !== null);
    }
    // the live preview follows NOW (paused bed included): renderAtT's
    // per-frame drive point repaints the layer at the current playhead
    if (pb && player) renderAtT(pb.T);
    strikeInvalidate();
  }

  /** GH-364: the settled-output invalidation for a changed option/caption
   * — the resSel contract in ONE writer (setStrikeOn, the locale handler
   * and syncCardActions' deferred drain all route here; callers guarantee
   * the render/transcode/save latches are clear). */
  function strikeInvalidate() {
    if (!card) return;
    if (lastBlob || cardSalvage) { // GH-997: an offer is output too
      // the resSel law verbatim (incl. the review round-2 P2 paint retire):
      // the delivered clip no longer matches the options on display
      paintGen += 1;
      releaseBlob();
      renderDests();
      syncCardActions();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.bar.style.width = '0%';
      // stale-dictionary degrade (review r10 P2 — the tBudget copy law):
      // the drain can run right after a switch INTO a pre-364 dictionary;
      // an English fallback in a localized card is forbidden, so the copy
      // falls back to the LEGACY localized invalidation message
      P.ptext.textContent = t(strikeDictOk()
        ? 'playback.strikeChanged' : 'playback.resChanged');
    } else {
      // full-mode settled saves have NO page-side blob — their Saved/done
      // paint must not label the newly changed option state (review r1 P2;
      // the setExportMode lifecycle verbatim)
      retireFullPaint();
      renderDests();
      syncCardActions();
      syncDestArm();
    }
  }

  function syncDestHint() {
    if (!P.destHint) return;
    const n = includedSegments().length;
    // GH-305: in full-game mode the hint IS the instruction ("pick a
    // destination to start") and shows exactly while the starter tiles
    // are armed — the dataset swap keeps locale switches repainting the
    // live copy (the syncDestFx dataset-swap law).
    const full = fullMode();
    // GH-433 (the GH-274 "explain" surface, the GH-414 hint-gap family): a
    // window intersecting NO content — no play span and no lead to
    // associate (a selection inside a walk beat, or past the content on
    // the setTrim seam) — used to disarm every tile with the hint HIDDEN
    // in both modes: dead buttons beside a visibly nonempty selection, the
    // silent-disarm class the GH-380 doctrine forbids. The hint line IS
    // the refusal: one localized reason, shown exactly while the window
    // is the only thing between the user and armed tiles (each mode's own
    // run latches and a delivered blob keep their paints — the GH-274
    // mirror law). Dictionary-gated (review GH-433 r1+r2 P2, the
    // strikeDictOk register VERBATIM): a fresh module over a STALE cached
    // dictionary must not paint the raw key — or the en fallback into a
    // non-English UI (the GH-414 literal class) — so a dictionary without
    // the key degrades to the pre-433 hidden hint. A stale cached i18n.js
    // (no hasLocal export) degrades the same way (r2: falling back to
    // has() there reads the FRESH en dictionary through the stale module
    // and paints English into a non-English UI — exactly the leak the
    // gate exists to close).
    const refusalOk = !n && typeof i18nNs.hasLocal === 'function'
      && i18nNs.hasLocal('playback.trimNoContent');
    const key = refusalOk ? 'playback.trimNoContent'
      : full ? 'playback.fullHint' : 'playback.destHint';
    if (P.destHint.dataset.i18n !== key) {
      P.destHint.dataset.i18n = key;
      P.destHint.textContent = t(key);
    }
    if (!n) {
      // capability gates outrank the refusal (review r4 P2): on a boot
      // whose export is unavailable ANYWAY (no encoder, probe in flight,
      // no blob route, stale export.js/camerascript) the card already
      // paints its own honest unavailability notice — "widen the trim"
      // beside it would instruct a step that cannot arm anything. The
      // realtime tier needs none of the offline gates (its capture is the
      // live bed — the GH-250 mirror), and full mode's availability story
      // is the mode row's (fullModeOk gates entry).
      P.destHint.classList.toggle('off', !refusalOk || (full
        ? (rendering || !!transcodeBusy || saveWait !== null)
        : realtimeMode
          ? (!!lastBlob || rendering || !!transcodeBusy)
          : (!!lastBlob || rendering || !!transcodeBusy || noEncoder
            || probingEncoder || noBlobExport || !hasRenderDrill()
            || !camScriptOk())));
      return;
    }
    if (full) {
      P.destHint.classList.toggle('off', rendering || !!transcodeBusy
        || saveWait !== null || !n || !fullFits().ok);
      return;
    }
    // GH-250: the realtime tier's pressability mirrors ITS CTA conditions
    // verbatim (the GH-274 law) — no renderer, no encoder probe, no
    // CLIP_CAP montage arithmetic apply to a live capture (its own cap is
    // the RT_CAP_SEC wall ceiling).
    // !!transcodeBusy in BOTH branches (review round-8 P2): a res-change or
    // close/reopen mid-transcode clears lastBlob while the latch still
    // disables the CTA — "Export the clip first" beside a dead button is
    // the exact lie the GH-274 mirror law forbids
    P.destHint.classList.toggle('off', realtimeMode
      ? (!!lastBlob || rendering || !!transcodeBusy || !n
        || realtimeWallSec() > RT_CAP_SEC || planHasFades())
      : (!!lastBlob || rendering || !!transcodeBusy || noEncoder
        || probingEncoder || noBlobExport
        || !hasRenderDrill() || !camScriptOk() || !n || !planFits(n)));
  }

  /** GH-301 review round-2 P1: does the TRIMMED plan carry a fade window?
   * The realtime-capture tier records the WebGL canvas only, and the fade
   * is a DOM presentation layer — a captured file would silently omit the
   * dip the live player showed, so realtime refuses fade plans honestly
   * (the CTA gate + copy above; offline renders composite them). */
  function planHasFades() {
    if (!pb) return false;
    // GH-452: a kept reset boundary dips live exactly like a user fade —
    // the DOM layer a canvas capture would silently omit, so it joins the
    // same refusal truth (live-beat gate: the capture records the walks
    // the live player shows, and a walked boundary never dips).
    if (keptResetBounds((r) => pb.beats?.[r - 1]).length) return true;
    // the savePlan fade filter's window, mirrored (explicit endT EXCLUSIVE
    // — review r4 P2): the realtime tier refuses exactly the plans whose
    // offline export would composite a fade, no more
    return includedSegments().some((x) => pb.plan.cuts.some((c) => {
      if (c.seg !== x.i || c.transitionIn !== 2 || !(c.dur > 0)) return false;
      const tA = csSec(c.t);
      if (tA < x.startT - 1e-9) return false;
      return x.endT !== null && x.endT !== undefined
        ? tA < x.endT - 1e-9 : tA <= pb.durs[x.i] + 1e-9;
    }));
  }

  /** SETUP ⇄ RENDERING chrome: the CTA is the only way into a render, and a
   * running render hides it (Cancel is the only way out) and LOCKS the
   * options so the encode can never drift from the labels. */
  function syncCardActions() {
    if (!card || !P.actions) return;
    // GH-364 (review r5 P2): drain the deferred caption-stale latch on the
    // first lifecycle flip with the run latches clear — the settled run's
    // output carries the OLD-locale caption and must not stand deliverable
    // under a plan promising the new one. OUTPUT-AWARE (review r6 P2: the
    // first post-render sync can land BEFORE the completed blob installs —
    // an early drain would retire nothing and the old-caption blob would
    // stand): a montage drain waits for lastBlob; the full mode's paint
    // (destFx, no page blob) drains on the cleared latches. A run with NO
    // output (cancel/failure) leaves the latch parked harmlessly — nothing
    // is deliverable, and a NEW press resets it at startRender entry (the
    // fresh plan re-derives the caption at the current locale).
    // strikeInvalidate re-enters this function latch-cleared: runs once.
    // MONTAGE-BLOB-only by design (review r12 ruling — see the locale
    // handler note: a full-mode Saved state is shell-owned history, never
    // retired by a language switch; failed/cancelled runs leave no
    // deliverable and the latch parks until the next press/open resets
    // it). The success path's post-install syncCardActions (review r7)
    // guarantees a drain flip once the blob exists; a failed montage
    // transcode's release drains here too (review r8 — saveWait is not a
    // gate: the montage invalidation is save-safe, identity-scoped
    // feedback retires in-flight paints).
    if (strikeStalePending && !rendering && !transcodeBusy
      && lastBlob !== null) {
      strikeStalePending = false;
      // landing review round: retire ONLY when the installed blob's
      // press-time caption no longer matches the CURRENT promise — an
      // A→B→A locale round-trip mid-run re-matches and the delivered
      // output stands (the r12 honesty scope, now symmetric: neither a
      // stale caption standing NOR a valid export discarded).
      if ((strikeArmed() ? t('playback.strikeTitle') : null)
        !== strikeRunTitle) {
        strikeInvalidate();
        return;
      }
    }
    P.actions.classList.toggle('off', rendering);
    const n = includedSegments().length;
    // GH-305: full-game mode has NO Export CTA — the destination tiles are
    // the starters (dest is chosen at the v3 `begin`), so the button
    // leaves and the setup hint carries the instruction. The mode row
    // itself re-derives with every lifecycle flip (one writer).
    syncModeRow();
    P.go.style.display = fullMode() ? 'none' : '';
    // GH-997: while a salvage offer stands the CTA reads "Export again"
    // beside "Save anyway"; every other state keeps the plain Export
    const salvageUp = !!cardSalvage && !rendering && !fullMode();
    if (P.salvage) P.salvage.style.display = salvageUp ? '' : 'none';
    P.go.dataset.i18n = salvageUp ? 'export.salvage.retry' : 'export.start';
    P.go.textContent = t(P.go.dataset.i18n);
    // GH-250: in realtime mode the CTA needs a non-empty trim under the
    // wall-clock ceiling ONLY — the renderer/encoder/cap gates are
    // offline-tier truths that would dead-button the one capture path this
    // engine has (realtimeMode is set strictly AFTER the probe settled, so
    // probingEncoder is spent; RT_CAP_SEC is the review round-1 bridge-cap
    // honesty gate).
    P.go.disabled = rendering || !!transcodeBusy || !n || (realtimeMode
      ? (realtimeWallSec() > RT_CAP_SEC || planHasFades())
      : (!hasRenderDrill() || noEncoder || probingEncoder
        || !camScriptOk() || !planFits(n)));
    // (!!transcodeBusy — review round-7 P1: an Export press over a running
    // Photos transcode would stack a second full codec pipeline beside the
    // retained source; the latch releases through syncCardActions again)
    // GH-305 (review round-3 P2): full mode keeps the pickers locked through
    // the NATIVE delivery too — after the render, `rendering` drops while
    // `saveWait` still owns the streamed file, and full mode has no
    // lastBlob whose invalidation would retire the paint generation; an
    // unlocked picker there could relabel the card before the shell's
    // result paints Saved beside settings the file was never rendered at.
    const optLock = rendering || (fullMode() && saveWait !== null);
    if (P.resSel) P.resSel.disabled = optLock;
    if (P.qualSel) P.qualSel.disabled = optLock; // GH-259: same WYSIWYG lock
    // GH-363: the lead toggle rides the same option lock (setLeadIn's
    // in-flight guard already refuses — the control must SAY so, never
    // stand visibly actionable while taps do nothing; review 363 r1 P2).
    // Full-mode saveWait included: transcodeBusy/saveWait guard the press
    // path, and the broader lock is honest for the montage tier too.
    if (P.leadBtn) {
      P.leadBtn.disabled = optLock || !!transcodeBusy || saveWait !== null;
    }
    // GH-364: the pickers' lock + the transcode latch — a flip
    // mid-transcode must be refused at the CONTROL, not only in the
    // writer (review r1 P2). A montage AWAITED SAVE deliberately does NOT
    // disable it (review r7 P2: saveWait clears without a follow-up sync
    // on some transcode-failure paths, which stranded the control; the
    // pickers take the same stance — a flip during an awaited save runs
    // the blob invalidation, and the identity-scoped save feedback
    // machinery already retires the in-flight paint).
    if (P.strikeTog) {
      P.strikeTog.disabled = optLock || !!transcodeBusy;
    }
    // GH-475: the knob rows take the overlay toggle's locks PLUS the
    // overlay arm itself (a knob without the plate burns nothing)
    for (const tog of [P.strikeElevTog, P.strikePowerTog]) {
      if (tog) tog.disabled = !strikeOn || optLock || !!transcodeBusy;
    }
    // syncLabel() is the only thing that mirrors sel.disabled onto the kit
    // button — refresh() is mandatory after every flip (select.js contract)
    try { P.resSelW?.refresh?.(); } catch { /* stale select.js */ }
    try { P.qualSelW?.refresh?.(); } catch { /* stale select.js */ }
    syncDestHint(); // GH-274: every lifecycle flip re-derives the hint
  }

  // GH-1023 link-note begin (lifted verbatim by web/tools/test-share-link-base.mjs;
  // factory scope, not the file end: test-povpose-k1 appends its K1 plants
  // after the factory's closing lines)
  // The export card's replay-link note. A browser page shares its own https
  // address, which anyone can open (playback.linkNote). Inside the macOS/iOS
  // shells share.js mints openbilliards://replay#r=…, which opens only where
  // the app is installed, so the note says so (playback.linkNoteApp) — the same
  // honesty as the Share toast (share.copiedApp).
  function linkNoteKey(url) {
    return /^https?:\/\//i.test(String(url)) ? 'playback.linkNote' : 'playback.linkNoteApp';
  }
  // The row SHOWS the link compact (owner, card 39 v2: 「链接显示太长了, 需要
  // 缩短 … 可以 truncate」): where it points — the app scheme, or a web page's
  // host and file — then the payload's head … tail, e.g.
  // openbilliards://replay#r=VY5B…SMj1Bw. Display only: the title, the
  // visually-hidden twin and Copy all carry the full link.
  function compactLink(url) {
    const s = String(url);
    const hash = s.indexOf('#');
    if (hash < 0) return s;
    let where = s.slice(0, hash);
    const web = /^https?:\/\/([^/?#]+)((?:\/[^/?#]*)*)/i.exec(where);
    if (web) {
      const segs = web[2].split('/').filter(Boolean);
      const file = segs.pop();
      where = web[1] + (file ? (segs.length ? '/…/' : '/') + file : '');
    }
    const frag = s.slice(hash + 1);
    return `${where}#${frag.length > 14 ? `${frag.slice(0, 6)}…${frag.slice(-6)}` : frag}`;
  }
  // GH-1023 link-note end

  function buildCardBody() {
    const body = document.createElement('div');
    P.dests = document.createElement('div');
    P.dests.className = 'ob-pb-dests';
    // GH-274 (owner pick: option a "explain"): the SETUP-state hint under
    // the tile row — build 13 showed three grey tiles with no reason and
    // the owner read the two-step flow as broken. A SIBLING of P.dests
    // (renderDests() replaceChildren()s the row and must never touch it),
    // never a child; syncDestHint() below is its ONE writer, and the
    // GH-255 tile machine (syncDestArm/syncDestFx/saveWait) is untouched.
    // Born hidden: syncCardActions() reveals it only once the open
    // settles into a TRUE setup state.
    P.destHint = document.createElement('div');
    P.destHint.className = 'ob-pb-desthint off';
    P.destHint.dataset.i18n = 'playback.destHint';
    const platform = document.createElement('div');
    platform.className = 'ob-pb-platform';
    platform.dataset.i18n = 'playback.platformNote';
    // the progress block moved to the PINNED foot (buildCardFoot) so it
    // stays visible while the body scrolls
    body.append(P.dests, P.destHint, platform);
    // v5 replay-link row (LIVE session only — archive.current() note; the
    // deferral for closed sessions is recorded in the OWNERSHIP ledger)
    if (arch()?.current?.() === pb.meta.id
      && typeof window.__share?.encode === 'function') {
      const block = document.createElement('div');
      block.className = 'ob-pb-linkblock';
      const row = document.createElement('div');
      row.className = 'ob-pb-linkrow';
      const lico = document.createElement('span');
      lico.className = 'ob-pb-lico';
      lico.setAttribute('aria-hidden', 'true');
      face(lico, 'link', '∞');
      const label = document.createElement('span');
      label.className = 'ob-pb-llabel';
      label.dataset.i18n = 'playback.link';
      const url = document.createElement('span');
      url.className = 'ob-pb-lurl';
      // GH-1023 (owner, card 39 v2): SHOWN compact; the full link is the
      // shown text's tooltip, a visually-hidden twin for assistive tech (the
      // tooltip sits inside the aria-hidden span, so nothing is read twice),
      // what Copy writes, and what a selection inside the link copies
      const urlShown = document.createElement('span');
      urlShown.className = 'ob-pb-lurl-shown';
      urlShown.setAttribute('aria-hidden', 'true');
      const urlFull = document.createElement('span');
      urlFull.className = 'ob-pb-lurl-full';
      url.append(urlShown, urlFull);
      let fullLink = '';
      url.addEventListener('copy', (e) => {
        const sel = document.getSelection();
        if (!fullLink || !e.clipboardData || !sel
          || !url.contains(sel.anchorNode) || !url.contains(sel.focusNode)) return;
        e.clipboardData.setData('text/plain', fullLink);
        e.preventDefault();
      });
      const noteEl = document.createElement('div');
      noteEl.className = 'ob-pb-linknote';
      Promise.resolve(window.__share.encode())
        .then((u) => {
          fullLink = String(u);
          urlShown.textContent = compactLink(fullLink);
          urlFull.textContent = fullLink;
          urlShown.title = fullLink;
          // GH-1023: the note follows the minted link — a shell link opens
          // only where the app is installed, so it never promises "anyone"
          noteEl.dataset.i18n = linkNoteKey(fullLink);
          noteEl.textContent = t(noteEl.dataset.i18n);
          // GH-302 honest degrade on THIS surface too: the encode may
          // have DROPPED an over-envelope camera plan — say so with a
          // wrapping note line (the linkNote voice; never a silently
          // plan-less link). Feature-detected: a stale share.js has no
          // seam and no plan concept.
          if (window.__share.planDropped?.() === true) {
            const drop = document.createElement('div');
            drop.className = 'ob-pb-linknote';
            drop.dataset.i18n = 'playback.planLeftOut';
            drop.textContent = t('playback.planLeftOut');
            block.appendChild(drop);
          }
        })
        .catch(() => { block.remove(); });
      // GH-245: kit factory (neutral voice — the kit base IS this button's
      // old hand-rolled recipe); .ob-pb-copy keeps the link-row padding
      const copy = mkBtn({
        label: t('playback.copy'), i18nKey: 'playback.copy',
        icon: ico('copy', 14), fallbackGlyph: '⧉',
      });
      copy.classList.add('ob-pb-copy');
      const clbl = copy.querySelector('.ob-btn__label');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(fullLink);
          if (clbl) {
            clbl.textContent = t('playback.copied');
            setTimeout(() => { clbl.textContent = t('playback.copy'); }, 2000);
          }
        } catch { /* clipboard unavailable */ }
      });
      row.append(lico, label, url, copy);
      block.append(row, noteEl);
      body.appendChild(block);
    }
    return body;
  }

  function renderDests() {
    if (!P.dests) return;
    P.dests.replaceChildren();
    for (const d of destsFor(lastBlob)) {
      const b = document.createElement('button');
      b.type = 'button';
      // GH-245: the kit --tile primitive (rungs + focus ring); state
      // classes are APPENDED by syncDestFx (classList.toggle — safe over
      // the kit classes)
      b.className = 'ob-btn ob-btn--tile ob-pb-dest';
      b.dataset.dest = d.id;
      b.disabled = destsDisabled(); // the ONE predicate (GH-305 refactor)
      const gi = document.createElement('span');
      gi.setAttribute('aria-hidden', 'true');
      face(gi, d.icon, '·', 21);
      const l = document.createElement('span');
      l.dataset.i18n = `playback.dest.${d.id}`;
      const s = document.createElement('small');
      s.dataset.i18n = `playback.dest.${d.id}Sub`;
      b.append(gi, l, s);
      b.addEventListener('click', () => {
        // GH-305 full-game mode: the tile IS the starter — dest chosen at
        // `begin`, render + wire + shell dest leg all ride one attempt.
        if (fullMode()) {
          if (rendering || saveWait !== null || transcodeBusy) return;
          startFullExport(d.id);
          return;
        }
        if (!lastBlob || saveWait !== null || transcodeBusy) return;
        // GH-252: a webm clip bound for Photos runs the GH-157 transcode
        // tier FIRST (the tile only rendered because the probe said ok) —
        // everything below builds the attempt's identity on the FUTURE mp4
        // container, BEFORE any async work (the re-gate P2 law).
        const toMp4 = d.id === 'photos' && lastBlob.type === 'video/webm';
        // the disarm-await gate (GH-225): only a shell that injected the
        // __obSaveVideo hint guarantees ONE 'ob:save-video-result' per
        // valid attempt — and only the two exact containers survive the
        // shell's FR-011 wire gate (anything else drops silently, so
        // awaiting it would wedge). Everything else keeps today's
        // optimistic "saved" paint (the recorded stale-shell degrade).
        const awaited = saveVideoCaps() !== null
          && (lastBlob.type === 'video/mp4' || lastBlob.type === 'video/webm');
        P.progress.classList.add('on');
        P.cancel.style.display = 'none';
        // EVERY route opens on Saving… (GH-255 review r2 P2). The optimistic
        // "Saved" of the fire-and-forget routes used to be painted here, on the
        // CLICK — before deliver() had read a byte — so it claimed a delivery
        // that had not happened. It now lands from `onSent`, i.e. when the post
        // actually left; the END state of the recorded degrade is unchanged.
        P.ptext.textContent = t('playback.saving');
        const name = clipName(lastBlob, toMp4 ? 'mp4' : undefined);
        const wait = { dest: d.id, name, gen: paintGen }; // attempt identity
        lastAttempt = wait; // ...and the one every late callback is judged by
        destFx = null; // a NEW attempt retires the previous tile's outcome:
        // exactly ONE tile ever carries a state, and it is this one
        /** This attempt's tile phase, behind every paint gate: its own render
         * generation, its own identity (never a superseded attempt), and a card
         * that still exists. `phase(null)` RETIRES the tile to rest. */
        const phase = (p) => {
          if (wait !== lastAttempt || wait.gen !== paintGen || !card) return;
          destFx = p ? { dest: wait.dest, phase: p, gen: wait.gen } : null;
          syncDestFx();
        };
        // WORKING from the tap: derived from the latch when there is one,
        // stored when there is not (the unlatched routes still have an
        // asynchronous read in front of them and must read as in-flight).
        if (awaited) { saveWait = wait; syncDestArm(); } else phase('working');
        /** Route `blob` down the UNCHANGED delivery wire (GH-252: the
         * transcode leg re-enters here with its mp4, every other tap comes
         * straight through with lastBlob — one wire, two entries). */
        const dispatch = (blob) => {
          // filled in from the ROUTE below; onSent always fires strictly
          // later — inside FileReader.onload, or a share() promise callback —
          // so it reads the final value. `null` = this attempt is spoken for
          // by the latch and resolves on the shell's result event instead.
          let sentPhase = 'handoff';
          const via = deliver(d.id, blob, name, { onDrop: (kind, code) => {
            releaseTranscodeBusy(wait); // the post provably never left (r3 P2)
            // no-post unwind: the result event is never coming — unlatch
            // (awaited attempts only; the optimistic path never latched)
            if (saveWait === wait) {
              saveWait = null;
              syncDestArm();
              syncCardActions(); // GH-305: the mode row locks with the latch
            }
            // honest failure paint for BOTH paths, bound to the attempt's
            // render (round 8 P2: a late reader error must not stamp an
            // old blob's failure over a newer render or reopened card) AND to
            // its own identity (GH-255 review r1 P2: a SUPERSEDED attempt at the
            // same generation must not stamp its failure over the tile the user
            // tapped after it — the row belongs to the live attempt);
            // 'blocked' painted synchronously in b64Post already
            if (wait === lastAttempt && wait.gen === paintGen && card) {
              // GH-256: a refused CHUNKED transfer carries the SHELL's own
              // token (busy / unsupported-container / write-failed), so the
              // localized reason is the real one, not a generic failure
              if (kind === 'dropped') {
                P.ptext.textContent = saveErrorText(code ?? 'save-failed');
              }
              // 'cancelled' is the Web Share AbortError: the user dismissed the
              // sheet, so the row states it in the same words the shell's
              // `cancelled` result gets (review r3 P2)
              else if (kind === 'cancelled') P.ptext.textContent = saveErrorText('cancelled');
            }
            // the TILE states every no-post kind (GH-255): 'blocked' already
            // has its size-cap wording in the shared row, and a tile left in
            // the working state over an attempt that never left the browser
            // would be the dishonest half of the same paint. 'cancelled' is the
            // one kind that goes back to REST rather than to the danger register
            // — the SAME decision the shell's `cancelled` result gets, because
            // calling the user's own dismissal a failure is calling their
            // decision a defect.
            phase(kind === 'cancelled' ? null : 'failed');
          }, onSent: (() => {
            releaseTranscodeBusy(wait); // the post left — the tiles may re-arm
            // (awaited attempts stay disarmed behind saveWait; r3 P2)
            // THE POST LEFT — the only moment a fire-and-forget route may claim
            // anything (GH-255 review r2 P2)
            if (!sentPhase) return; // awaited: the shell's result speaks, not this
            if (wait === lastAttempt && wait.gen === paintGen && card) {
              P.ptext.textContent = t('playback.saved');
            }
            phase(sentPhase);
          }) });
          if (via !== 'obSaveVideo' && saveWait === wait) {
            // hint present but the dest routed off-bridge (obPhotos/share/
            // download fallbacks): fire-and-forget, so nothing will ever resolve
            // the await — unlatch now, and hold the tile at WORKING (the latch it
            // was deriving that from is gone) until the route reports.
            saveWait = null;
            syncDestArm();
            phase('working');
          }
          // ACKNOWLEDGEMENT, per route (GH-255 + its review rounds). No route
          // outside obSaveVideo-with-hint ever learns whether the FILE was kept,
          // so the honest claim is `handoff`: it went to the OS, not "saved".
          // Silence was the reported defect; claiming it early was the review's.
          //   'obSaveVideo' with the hint → null: the latch + result event own it
          //   'obSaveVideo' without       → 'done' on the post (the shared row's
          //                                  recorded optimistic verdict, echoed)
          //   'obPhotos'                  → 'handoff' on the post
          //   'shareApi'                  → 'handoff' when share() RESOLVES; its
          //                                  AbortError retires to rest and every
          //                                  other rejection fails (review r3 P2)
          //   'download'                  → 'handoff' NOW, the one route with
          //                                  nothing to wait for: the anchor was
          //                                  already clicked inside deliver()
          if (via === 'obSaveVideo') sentPhase = awaited ? null : 'done';
          if (via === 'download') {
            releaseTranscodeBusy(wait); // the one route with no async hooks
            if (wait === lastAttempt && wait.gen === paintGen && card) {
              P.ptext.textContent = t('playback.saved');
            }
            phase('handoff');
          }
        };
        // GH-252: the webm→Photos tap transcodes FIRST (async, page-side),
        // then re-enters the exact wire above with the mp4; every other tap
        // is byte-identical to the pre-GH-252 flow.
        if (toMp4) transcodeAttempt(lastBlob, wait, phase, dispatch);
        else dispatch(lastBlob);
      });
      P.dests.appendChild(b);
    }
    applyDom(P.dests);
    syncDestArm(); // its syncDestFx: a re-rendered row (five call sites) re-inherits the live
    // attempt state from module scope — never from the replaced DOM nodes; #1180: the render-done reveal rides it
    syncDestHint(); // GH-274: the row's arm truth changed with it — the
    // render-DONE path re-renders the row AFTER lastBlob lands (its
    // syncCardActions ran before the assignment), so the row re-render is
    // the flip that must hide the hint there
  }

  /** GH-305: the FULL-GAME streaming export — reached ONLY from a starter
   * tile (dest chosen at the v3 `begin`; there is no CTA in this mode).
   * One attempt owns render + wire + shell dest leg: `begin` takes the
   * shell slot, the engine's StreamTarget pieces cross as v3 positioned
   * chunks WHILE the encode runs (renderTimeline drains the sink's queue
   * per output frame — that awaited post is the wire backpressure), `end`
   * closes with the exactness law, the shell's dest leg runs, and the ONE
   * 'ob:save-video-result' resolves the same saveWait latch every awaited
   * montage save uses (the tile wears working→done/failed exactly like a
   * delivery). Every failure/cancel path posts `abort` so the shell frees
   * its slot and partial file NOW, never at the idle watchdog. */
  async function startFullExport(dest) {
    if (rendering || transcodeBusy || saveWait !== null || !pb || !card) return;
    if (!fullMode()) return;
    const bridge = streamBridge();
    const rd = window.__export?.renderDrill;
    if (typeof rd !== 'function' || !bridge) return;
    paintGen += 1; // pending save feedback stays off this attempt (the
    // startRender law)
    cardBudget = null; // plan time is press time (GH-304 round-6 law) —
    // montage consumers re-derive; the full plan itself is budget-exempt
    releaseBlob(); // no montage blob may outlive the mode's promise
    const { records, opts } = savePlan();
    strikeRunTitle = opts.strike?.title ?? null; // press-time caption truth
    if (!records.length) { closeCard(); return; }
    const fits = fullFits();
    if (!fits.ok) {
      // press-time belt behind the tile disable (the planFits belt shape)
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = fits.tooLong
        ? t('playback.fullTooLong', { min: fits.min })
        : t('playback.fullTooBig', {
          size: `${(fits.bytes / 1e6).toFixed(0)} MB`,
          cap: `${Math.round(fits.cap / 2 ** 30)} GB` });
      return;
    }
    const fmt = fullPlanFormat();
    if (fmt !== 'mp4' && fmt !== 'webm') {
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.noneAvailable');
      return;
    }
    // mime honesty at ENCODE (destsFor withheld Photos on webm; belt here)
    if (dest === 'photos' && fmt !== 'mp4') return;
    const mime = fmt === 'mp4' ? 'video/mp4' : 'video/webm';
    const name = clipName(null, fmt); // ext explicit — no blob exists
    const wait = { dest, name, gen: paintGen }; // the attempt identity
    lastAttempt = wait;
    destFx = null;
    // RESERVE the attempt BEFORE the awaited `begin` (review round-1 P2): a
    // delayed shell reply must not leave the card unlocked — a second tile
    // tap could race a second begin, a close could detach the render from
    // its only Cancel, and an option change could relabel a plan already
    // snapshotted at the press. saveWait disarms the tiles and puts the
    // chosen tile in its derived 'working' (the GH-255 one-truth law);
    // `rendering` locks the card (dismissal blocked, pickers disabled,
    // CTA/mode row locked) — the documented whole-attempt latch now covers
    // the begin await too. A refused begin unwinds both.
    saveWait = wait;
    rendering = true;
    cardRealRate = null;
    renderDests();
    syncCardActions(); // mode row + pickers lock (the WYSIWYG invariant)
    syncDestArm();
    P.progress.classList.add('on');
    P.cancel.style.display = 'none'; // nothing to cancel until the render
    P.ptext.textContent = t('playback.saving');
    // GH-997: a held salvage stream owns the shell slot — release it
    // before this attempt asks for the slot (its banner offer is
    // superseded by the new export either way)
    await releaseHeldSalvage();
    // `begin` FIRST — the dest leg is promised before a frame renders, so
    // a refused slot (busy shell) costs nothing. Awaited like every op.
    const bErr = await streamOp(bridge, { v: 3, op: 'begin', name, mime, dest });
    if (bErr) {
      rendering = false;
      if (saveWait === wait) saveWait = null;
      syncDestArm();
      if (!card) return;
      syncCardActions();
      P.ptext.textContent = saveErrorText(bErr);
      destFx = { dest, phase: 'failed', gen: wait.gen };
      syncDestFx();
      return;
    }
    P.ptext.textContent = '…';
    // GH-362 layer 3 (review r2 P2): the accepted begin just SUPERSEDED any
    // preserved partial shell-side — a standing resume offer is dead now,
    // and its Discard must never reach the NEW export's persisted plan.
    closeResumeBanner();
    // GH-362 layer 3: persist the crash-resume plan + earn the shell-side
    // manifest by riding plan/frame onto every chunk op. Capability-gated
    // end to end (leaf import + the engine's resumeFrameCapable marker
    // through export.js — the camScriptCapable chain); anything stale →
    // planHash null → EXACTLY the pre-layer-3 wire (no manifest, no
    // resume offer after a crash, the honest degrade). The persisted JSON
    // is the canonical hash input: relaunch re-hashes what it loads, so a
    // corrupt store or a foreign plan can never match the manifest.
    let resumeLeaf = null;
    let planHash = null;
    let planJsonKept = null; // GH-472: the persisted plan string — the
    // truncation-class failure unwind mounts its draft offer from it
    // the export's REAL begin time (review r8 P2): the streamed muxer pins
    // its container stamp to it, so metadata consumers see the honest date
    // while the original run, a crash-resume re-render and the e2e control
    // all reproduce the same bytes (the stamp is plan state — captured
    // once, never wall clock twice).
    const planOpts = { ...opts, creationTime: Math.floor(Date.now() / 1000) };
    if (window.__export?.resumeFrameCapable === true) {
      try {
        const leaf = await import('./export-resume.js');
        if (leaf.RESUME_CAPABLE === true
          && typeof leaf.persistPlan === 'function') {
          // plan schema v2 (review r6 P2): a plan carrying the GH-474/475
          // strike promises (window474/elev/power) must be REFUSED by a
          // cached pre-474 playback.js at relaunch — its offer path pins
          // plan.v === 1 and would resume through a renderer that
          // silently drops the promises. Promise-less plans stay v1
          // (fully resumable under stale code); the fresh reader accepts
          // both.
          const stkP = planOpts.strike;
          const planV = stkP && (stkP.window474 === true
            || stkP.elev === true || stkP.power === true) ? 2 : 1;
          const planJson = JSON.stringify({ v: planV, name, mime, dest,
            kernel: kv, ua: navigator.userAgent,
            game: pb.meta?.gameId ?? null,
            frames: plannedFullFrames(),
            records: records.map((r) => (typeof r === 'string'
              ? r : JSON.stringify(r))),
            opts: planOpts });
          const hash = leaf.planHashOf(planJson);
          // manifest gated on a SUCCESSFUL persist (review r7 P2): a
          // refused store (disabled/blocked IndexedDB) resolves null —
          // plan-carrying chunks would then earn a shell checkpoint no
          // relaunch can ever match, offer or discard (a multi-GB partial
          // parked until expiry). No persisted plan → the pre-layer-3
          // wire, honestly.
          if ((await leaf.persistPlan(planJson, hash)) !== null) {
            planHash = hash;
            resumeLeaf = leaf;
            planJsonKept = planJson; // GH-472
          }
        }
      } catch { /* leaf unavailable — the pre-layer-3 wire */ }
    }
    // the v3 wire driver (factored — makeStreamPoster): re-slice to the
    // negotiated chunk ceiling, seq monotonic, `at` absolute, extent
    // tracked for `end`'s exactness law.
    const { post, st } = makeStreamPoster(bridge, name, planHash);
    // Cancel appears only once the renderer is cancellable (review r6 P2):
    // shown any earlier — e.g. across a slow IndexedDB persist above — a
    // click reaches window.__export.cancel() before any AbortController
    // exists and the render starts anyway.
    P.cancel.style.display = '';
    let res = null;
    let failed = null;
    try {
      res = await rd(records, {
        ...planOpts,
        stream: { post },
        onProgress: (done, total, ema) => {
          if (!card) return;
          P.bar.style.width = `${(100 * done / total).toFixed(1)}%`;
          P.ptext.textContent = t('export.progress', {
            pct: Math.round(100 * done / total),
            eta: fmtEta((total - done) * ema / 1000), done, total,
          });
        },
        // GH-362: the paused-state line (the startRender law incl. its
        // stale-dictionary fallback — review r8 P2)
        onPause: (p) => {
          if (p && card) {
            P.ptext.textContent = has('export.paused') ? t('export.paused')
              : 'paused (app in background) — resumes automatically';
          }
        },
      });
    } catch (e) {
      failed = e;
    }
    // the render settled — nothing is cancellable while the wire closes,
    // and `rendering` HOLDS through the end/abort handshake (review round-4
    // P2: dropping it first re-enabled close/Escape mid-handshake, and a
    // card gone there skipped restorePlayerBed on both terminal paths)
    if (card) P.cancel.style.display = 'none';
    if (res && !failed) {
      // the whole file is on the shell's disk: close the wire (exactness:
      // chunks == seq && bytes == extent — the shell verified every write)
      const eErr = await streamOp(bridge,
        { v: 3, op: 'end', name, chunks: st.seq, bytes: st.extent });
      if (eErr) {
        failed = new Error(eErr);
      } else {
        // delivered to the dest leg — the result listener owns the rest
        // (saveWait resolves on the shell's ONE result; paint = Saved /
        // the honest per-code failure, tile done/failed — the montage
        // awaited path, verbatim). Restore the bed under the wait.
        // GH-362 layer 3: the export left the crash window — drop the
        // persisted resume plan (the shell's finish() already dropped its
        // sidecar; a dest-leg failure is not resumable, only retryable).
        try { resumeLeaf?.clearPlan(); } catch { /* storage refusal */ }
        rendering = false;
        if (card) {
          syncCardActions();
          restorePlayerBed();
          syncMontage();
          P.bar.style.width = '100%';
          P.ptext.textContent = t('playback.saving');
        }
        return;
      }
    }
    // failure/cancel unwind: free the shell's slot + partial file NOW, and
    // release the latch — no result event is coming for an aborted stream.
    // GH-362 layer 3: the abort deletes the shell partial, so the persisted
    // plan is debt too — a crash-resume offer must never outlive the bytes
    // it would resume from.
    // GH-472 EXCEPTION: a truncation-class failure (the engine's ADDITIVE
    // obTruncated marker — the delivery wall refused a silently-short
    // file) on a resume-capable attempt KEEPS the persisted plan: the
    // render is deterministic, so the plan IS the resumable draft, and
    // the banner below offers to finish the job (the owner's 5804/5806
    // report lost a whole session here). The shell partial is still
    // aborted: a hole-carrying file cannot be spliced in place (muxer
    // timelines are append-monotonic) and the restart flow's fresh
    // `begin` would supersede it anyway — the no-short-file wall stands
    // at full strength either way. Stale engines carry no marker and
    // take the pre-472 path verbatim.
    const keepDraft = !!(failed?.obTruncated && resumeLeaf && planHash
      && planJsonKept);
    // GH-997: hold the refused-but-complete file for the banner's "Save
    // anyway" — only when the engine's salvage extent IS the wire's own
    // extent (every byte the muxer wrote crossed the wire)
    const sv = failed?.obSalvage;
    const salvage = keepDraft && Number.isFinite(sv?.streamedBytes)
      && sv.streamedBytes === st.extent
      ? { name, dest, chunks: st.seq, bytes: st.extent, lost: sv.lost,
        want: sv.frames } : null;
    if (!keepDraft) {
      try { resumeLeaf?.clearPlan(); } catch { /* storage refusal */ }
    } else {
      // GH-472 review r1 P2: re-persist the SAME hashed bytes with the
      // kept-draft marker — the abort below deletes the shell partial and
      // with it the only boot hint, so the marker is what lets a reload
      // re-offer this draft (maybeOfferKeptDraft). Marker BEFORE abort
      // (review r4 P2): a death between the two leaves marked-plan + live
      // sidecar — the boot then takes the ORDINARY crash offer, which is
      // safe by construction (outside-the-class plans restart; an
      // in-class fast-forward — sound-off, or sound-on via the GH-435
      // exact bed — refuses at the hole's boundary hash into the honest
      // restart) — while the reverse order left an unreachable markerless
      // orphan. A refused store keeps the in-session offer regardless.
      // Capability-gated (review r2 P2): a cached pre-472 leaf ignores the
      // third argument silently — skip the write there (the in-session
      // offer needs no new leaf API; the row then degrades to the
      // pre-472 bounded-orphan shape, no reload re-offer — the honest
      // stale-pairing behavior).
      try {
        if (resumeLeaf.DRAFT_CAPABLE === true) {
          await resumeLeaf.persistPlan(planJsonKept, planHash,
            { draft: { got: failed.obTruncated.got,
              want: failed.obTruncated.want } });
        }
      } catch { /* storage refusal */ }
    }
    if (!salvage) await streamOp(bridge, { v: 3, op: 'abort', name });
    if (keepDraft) {
      // the offer mounts INSIDE the attempt latch (review r3 P2):
      // `rendering`/saveWait hold the card disarmed until here, so a
      // rapid retry can never start a NEW attempt whose fresh plan the
      // marker write above would clobber (or mount a stale banner over)
      offerTruncatedResume({
        hint: { v: 1, name, mime, dest, extent: st.extent, chunks: st.seq,
          planHash, frame: failed.obTruncated.got ?? 0 },
        plan: planJsonKept, json: planJsonKept, hash: planHash,
        leaf: resumeLeaf,
      }, failed.obTruncated, salvage);
    }
    rendering = false;
    if (saveWait === wait) saveWait = null;
    syncDestArm();
    if (!card) return;
    cardBudget = null;
    P.cancel.style.display = 'none';
    syncCardActions();
    restorePlayerBed();
    syncMontage();
    if (!failed) {
      // cancelled (renderDrill returned null on AbortError): no partial
      // file anywhere — the SETUP card returns, tile back to rest
      destFx = null;
      syncDestFx();
      P.ptext.textContent = t('export.cancelled');
      P.bar.style.width = '0%';
      return;
    }
    const tok = String(failed?.message ?? failed);
    P.ptext.textContent = /^[a-z-]{1,40}$/.test(tok)
      ? saveErrorText(tok) // a shell wire token (busy/write-failed/…)
      : t('export.failed', { message: tok });
    destFx = { dest, phase: 'failed', gen: wait.gen };
    syncDestFx();
  }

  // ---- GH-362 layer 3: the crash-grade resume surface -------------------------
  // A relaunch after a mid-export death finds the shell's documentStart
  // `window.__obResume` hint (built from the preserved partial's sidecar
  // manifest) and matches it against the plan export-resume.js persisted
  // at `begin` — planHash equality plus a kernel pin (determinism is
  // per-binary, so an app update refuses the offer honestly; the shell
  // debt ages out in 24 h). Match → a small banner offers "continue
  // export". Continue re-posts the v3 `resume` op ({ ok, extent, hash }),
  // re-renders the SAME persisted plan deterministically and fast-forwards
  // the wire (export-resume's byte-drop + boundary-hash law), so the
  // delivered file is byte-identical to an uninterrupted export — enforced
  // at runtime: corrupt/foreign disk bytes (or a genuinely
  // non-deterministic platform encoder) fail the boundary check into the
  // honest restart offer, never a silently broken file.
  let resumeCtx = null;   // { hint, plan, json, hash, leaf } while an offer stands
  // GH-997: a full-mode render the delivery wall refused as visibly broken
  // is still COMPLETE on the shell's disk (finalize drained the tail), so
  // the failure unwind HOLDS its v3 stream open instead of aborting it —
  // { name, dest, chunks, bytes, lost, want } — and the 'truncated' draft
  // banner offers "Save anyway" (the held stream's `end`) beside Start
  // over / Discard. Exactly one attempt owns the shell slot, so every path
  // that leaves the offer, or starts a new save, releases it first
  // (releaseHeldSalvage — the name-scoped abort).
  let heldSalvage = null;
  let resumeUi = null;    // the banner root while mounted
  let resumeState = null; // offer|running|saving|saved|cancelled|
                          // resumeFailed|truncated|failed (e2e seam;
                          // 'truncated' = the GH-472 kept-draft offer)
  let resumeGen = 0;      // offer generation (review r13 P2): bumped by
                          // every banner close — a maybeOfferResume still
                          // awaiting storage must not mount a superseded
                          // offer over a fresh export
  let resumeMsg = null;   // the terminal 'failed' paint DESCRIPTOR
                          // ({code}|{key}|{stage}|{failedMsg}) — re-derived
                          // through t() on every paint (review r10 P3)
  let resumeProg = null;  // the running progress line's DESCRIPTOR
                          // ({key, params, fallback} — GH-1046): Preparing…
                          // → Checking the saved part… n % → the main bar
  let resumeRestart = false; // the attempt is restart-class (GH-1046): its
                          // running copy says so. Kept OUT of resumeMsg — a
                          // stand-down repaints the prior state's own
                          // descriptor (the truncated {got, want})
  let resumeCancelled = false; // Cancel pressed during the SETUP phase
                          // (review r3 P2) — checked at phase boundaries
  let resumeStaging = null; // the resume-owned bracket during table preparation
  let resumeUnwind = null; // the suspend bracket also survives a thrown load

  async function maybeOfferResume() {
    try {
      const gen = resumeGen; // r13 P2: stale checks never mount
      const hint = window.__obResume;
      if (!hint || hint.v !== 1 || typeof hint.name !== 'string'
        || typeof hint.planHash !== 'string'
        || !Number.isFinite(hint.extent) || hint.extent < 1) {
        // GH-472 (review r1 P2): no shell hint can exist for a KEPT DRAFT
        // (the truncation abort deleted the partial + sidecar) — the
        // plan row's own `draft` marker is the warrant for a boot offer
        await maybeOfferKeptDraft(gen);
        return;
      }
      let leaf;
      try { leaf = await import('./export-resume.js'); } catch { return; }
      if (leaf.RESUME_CAPABLE !== true
        || typeof leaf.loadPlan !== 'function') return;
      const stored = await leaf.loadPlan();
      if (!stored || stored.hash !== hint.planHash) return; // foreign plan
      let plan;
      try { plan = JSON.parse(stored.json); } catch { return; }
      if ((plan?.v !== 1 && plan?.v !== 2) || plan.name !== hint.name
        || plan.mime !== hint.mime || plan.dest !== hint.dest
        || !Array.isArray(plan.records) || !plan.records.length
        || !plan.opts) return;
      if (!kv || plan.kernel !== kv) return; // the kernel pin
      // the BROWSER pin (beside the kernel pin): encoded bytes are only
      // reproducible on the same engine build — an OS/app update between
      // the crash and the relaunch refuses the offer honestly (the shell
      // debt ages out in 24 h)
      if (plan.ua !== navigator.userAgent) return;
      // the wire + engine chain (fullModeOk's shape, resume-extended) —
      // polled briefly: export.js wires window.__export from startLoop,
      // which can land AFTER this module's boot import resolves.
      for (let i = 0; i < 40; i++) {
        if (window.__export !== undefined) break;
        await new Promise((r) => { setTimeout(r, 250); });
      }
      if (streamBridge() === null
        || window.__export?.fullStreamCapable !== true
        || window.__export?.resumeFrameCapable !== true
        || typeof window.__export?.renderDrill !== 'function') return;
      // GH-474/475 (review r4 P2): the plan's STRIKE SUBFEATURE promises
      // pin the offer exactly like the engine chain above — a cached
      // pre-474/475 exporter would forward the plan to a renderer that
      // silently drops the promised timing/annotations (a fresh export.js
      // refuses at drillRender; a stale one cannot), so the offer itself
      // refuses honestly and the shell debt ages out like every other
      // pin miss.
      if (plan.opts.strike?.window474 === true
        && window.__export?.strikeWindowCapable !== true) return;
      if (plan.opts.strike?.elev === true || plan.opts.strike?.power === true) {
        if (window.__export?.strikeAnnoCapable !== true) return;
        // the GLYPH LEAF half (review r5 P2): strikeAnnoCapable vouches for
        // offline-render.js only — renderDrill re-imports the leaf and
        // would refuse fmtElev-less annotations AFTER an accepted offer
        // (an honest failure, but the offer must not advertise it). Same
        // module instance as the render's own import.
        let sgOff = null;
        try { sgOff = await import('./strikeglyph.js'); } catch { return; }
        if (typeof sgOff?.fmtElev !== 'function'
          || typeof sgOff?.fmtPower !== 'function') return;
      }
      // the RAW stored json rides along (review r3 P2): re-persisting at a
      // resume attempt must reuse the exact hashed bytes — a re-serialize
      // of the parsed object need not byte-match the hash
      if (gen !== resumeGen) return; // superseded while we awaited (r13)
      resumeCtx = { hint, plan, json: stored.json, hash: stored.hash, leaf };
      mountResumeBanner();
      setResumeUi('offer');
    } catch { /* no offer — never a boot break */ }
  }

  /** GH-472 (review r1 P2): the kept-draft boot offer. A truncation-class
   * failure kept the persisted plan as a RESTART-ONLY draft (marked
   * `draft` — the honest deficit) while its shell partial was aborted, so
   * a reload arrives with no `__obResume` hint and the crash offer path
   * stands down. The marker is the warrant instead: the same
   * kernel/UA/engine pins as the crash offer, then the SAME 'truncated'
   * banner the in-session failure mounts (Continue = restart flow,
   * Discard = clear). A marker-less row is exactly the pre-472 orphan
   * shape and offers nothing (overwritten by the next export — the
   * bounded single-row law). */
  async function maybeOfferKeptDraft(gen) {
    try {
      let leaf;
      try { leaf = await import('./export-resume.js'); } catch { return; }
      if (leaf.RESUME_CAPABLE !== true
        || typeof leaf.loadPlan !== 'function') return;
      const stored = await leaf.loadPlan();
      if (!stored?.draft) return; // no marker → no warrant
      let plan;
      try { plan = JSON.parse(stored.json); } catch { return; }
      if ((plan?.v !== 1 && plan?.v !== 2) || typeof plan.name !== 'string'
        || !Array.isArray(plan.records) || !plan.records.length
        || !plan.opts) return;
      if (!kv || plan.kernel !== kv) return; // the kernel pin
      if (plan.ua !== navigator.userAgent) return; // the browser pin
      for (let i = 0; i < 40; i++) {
        if (window.__export !== undefined) break;
        await new Promise((r) => { setTimeout(r, 250); });
      }
      if (streamBridge() === null
        || window.__export?.fullStreamCapable !== true
        || window.__export?.resumeFrameCapable !== true
        || typeof window.__export?.renderDrill !== 'function') return;
      // GH-474/475 (review r4 P2): the plan's STRIKE SUBFEATURE promises
      // pin the offer exactly like the engine chain above — a cached
      // pre-474/475 exporter would forward the plan to a renderer that
      // silently drops the promised timing/annotations (a fresh export.js
      // refuses at drillRender; a stale one cannot), so the offer itself
      // refuses honestly and the shell debt ages out like every other
      // pin miss.
      if (plan.opts.strike?.window474 === true
        && window.__export?.strikeWindowCapable !== true) return;
      if (plan.opts.strike?.elev === true || plan.opts.strike?.power === true) {
        if (window.__export?.strikeAnnoCapable !== true) return;
        // the GLYPH LEAF half (review r5 P2): strikeAnnoCapable vouches for
        // offline-render.js only — renderDrill re-imports the leaf and
        // would refuse fmtElev-less annotations AFTER an accepted offer
        // (an honest failure, but the offer must not advertise it). Same
        // module instance as the render's own import.
        let sgOff = null;
        try { sgOff = await import('./strikeglyph.js'); } catch { return; }
        if (typeof sgOff?.fmtElev !== 'function'
          || typeof sgOff?.fmtPower !== 'function') return;
      }
      if (gen !== resumeGen) return; // superseded while we awaited
      offerTruncatedResume({ hint: null, plan,
        json: stored.json, hash: stored.hash, leaf }, stored.draft);
    } catch { /* no offer — never a boot break */ }
  }

  let resumeScrim = null; // the running/saving input lock (review r6 P1)
  let resumeTrap = null;  // its keyboard half (review r11 P2)

  /** GH-472: the truncation-class DRAFT offer — mounted straight from the
   * full-mode card's failure unwind (no relaunch hint involved: the plan
   * string and its hash are already in hand; `ctx.plan` may still be the
   * JSON string here and is parsed once). The banner's restart flow
   * finishes the SAME persisted plan; Discard clears it. */
  function offerTruncatedResume(ctx, deficit, salvage = null) {
    let plan;
    try {
      plan = typeof ctx.plan === 'string' ? JSON.parse(ctx.plan) : ctx.plan;
    } catch { plan = null; }
    if (!plan || !Array.isArray(plan.records) || !plan.records.length) {
      // no banner can carry the offer — never strand the held stream
      if (salvage) {
        heldSalvage = salvage;
        releaseHeldSalvage();
      }
      return;
    }
    closeResumeBanner(); // supersede any standing offer (the gen bump)
    heldSalvage = salvage; // GH-997 (after the close: it releases a prior one)
    resumeCtx = { ...ctx, plan };
    mountResumeBanner();
    setResumeUi('truncated',
      { got: deficit?.got ?? 0, want: deficit?.want ?? 0 });
  }

  function mountResumeBanner() {
    if (resumeUi) return;
    // input lock UNDER the banner (review r6 P1): while the recovered
    // export owns the table (staged records, manual render mode), the app
    // chrome stays visible but must not accept input — a confirmed rerack
    // or equipment change mid-render would free the sampler under
    // renderDrill and the export could silently finish on a fresh rack.
    // Same modality the save card gets from its backdrop; shown only for
    // the running/saving states (setResumeUi toggles it).
    const scrim = document.createElement('div');
    scrim.id = 'ob-resume-scrim';
    scrim.style.display = 'none';
    document.body.appendChild(scrim);
    resumeScrim = scrim;
    const el = document.createElement('div');
    el.id = 'ob-resume-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.tabIndex = -1; // focusable modal surface for the busy states
    // keyboard modality (review r11 P2): the scrim swallows pointer hits
    // only — while the recovered export owns the table, a Tab could still
    // reach Re-rack/settings. Capture-phase: keys outside the banner
    // refocus its surface instead (Cancel while running).
    const trap = (e) => {
      if (resumeState !== 'running' && resumeState !== 'saving') return;
      if (resumeUi && resumeUi.contains(e.target)) {
        // banner-focused keys stay IN the banner (review r13 P2): stop the
        // propagation so aim/help/global shortcuts never see them — the
        // focused button's own activation is a DEFAULT action and still
        // fires (no preventDefault here)
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const btn = resumeUi?.querySelector('.ob-pb-resume-discard');
      if (btn && btn.style.display !== 'none') btn.focus();
      else resumeUi?.focus();
    };
    document.addEventListener('keydown', trap, true);
    resumeTrap = trap;
    el.innerHTML = `
      <div class="ob-pb-resume-text"></div>
      <div class="ob-pb-resume-prog ob-nums"></div>
      <div class="ob-pb-resume-row">
        <button type="button" class="ob-btn ob-btn--primary ob-pb-resume-go"></button>
        <button type="button" class="ob-btn ob-pb-resume-save" style="display:none"></button>
        <button type="button" class="ob-btn ob-btn--ghost ob-pb-resume-discard"></button>
      </div>`;
    el.querySelector('.ob-pb-resume-save').addEventListener('click', () => {
      salvageSave();
    });
    el.querySelector('.ob-pb-resume-go').addEventListener('click', () => {
      if (resumeState === 'offer') resumeRun(false);
      else if (resumeState === 'resumeFailed'
        || resumeState === 'truncated') resumeRun(true); // GH-472: the
      // truncation draft finishes through the same honest restart flow
    });
    el.querySelector('.ob-pb-resume-discard').addEventListener('click', () => {
      if (resumeState === 'running') {
        // review r1 P2: a recovered export can run for minutes with no card
        // attached — the running banner's one button is Cancel, wired to
        // the exporter's own abort (renderDrill returns null on AbortError
        // and the run unwinds through the cancelled path: abort posted,
        // plan cleared, honest paint). The latch (review r3 P2) covers the
        // SETUP phase too — settle wait / bed staging / the resume op's
        // native prefix hash all precede the exporter's AbortController,
        // where cancel() alone is a no-op; resumeRun checks it at every
        // phase boundary.
        resumeCancelled = true;
        if (resumeStaging) cancelArchiveHold(resumeStaging);
        try { window.__export?.cancel?.(); } catch { /* stale seam */ }
        return;
      }
      if (resumeState === 'saving') return; // the dest leg owns the finish
      resumeDiscard();
    });
    document.body.appendChild(el);
    resumeUi = el;
  }

  /** The running progress line from its descriptor — has() first (the
   * review r8 P2 law): a stale dictionary paints the readable English
   * fallback, never the bare key. */
  function resumeProgText() {
    if (!resumeProg) return '';
    return has(resumeProg.key) ? t(resumeProg.key, resumeProg.params)
      : resumeProg.fallback ?? '';
  }

  /** One writer over the banner (state + copy). Locale switches re-run it
   * (registered below) so every visible string re-derives through t(). */
  function setResumeUi(state, msg) {
    resumeState = state;
    if (msg !== undefined) resumeMsg = msg;
    if (!resumeUi) return;
    if (resumeScrim) { // the input lock rides the busy states (r6 P1)
      resumeScrim.style.display = (state === 'running' || state === 'saving')
        ? '' : 'none';
    }
    const q = (c) => resumeUi.querySelector(c);
    const text = q('.ob-pb-resume-text');
    const prog = q('.ob-pb-resume-prog');
    const go = q('.ob-pb-resume-go');
    const discard = q('.ob-pb-resume-discard');
    // GH-997: "Save anyway" exists only beside a held salvage stream
    const save = q('.ob-pb-resume-save');
    save.style.display = state === 'truncated' && heldSalvage ? '' : 'none';
    save.textContent = t('export.salvage.save');
    const frames = Number(resumeCtx?.plan?.frames);
    const pct = frames > 0
      ? Math.max(0, Math.min(99,
        Math.round(100 * (resumeCtx?.hint?.frame ?? 0) / frames)))
      : 0;
    const paintRow = (goKey, discardKey) => {
      go.style.display = goKey ? '' : 'none';
      discard.style.display = discardKey ? '' : 'none';
      if (goKey) go.textContent = t(goKey);
      if (discardKey) discard.textContent = t(discardKey);
    };
    switch (state) {
      case 'offer':
        text.textContent = t('export.resume.notice', { pct });
        prog.textContent = '';
        paintRow('export.resume.continue', 'export.resume.discard');
        break;
      case 'running':
        // GH-1046: "Finishing" is the fast-forward's copy — a restart-class
        // run (outside ffEligible, a refused probe, Start over) says so
        text.textContent = !resumeRestart ? t('export.resume.resuming')
          : has('export.resume.restarting') ? t('export.resume.restarting')
            : 'Starting the export over…';
        prog.textContent = resumeProgText();
        // Cancel stays reachable for the whole re-render (review r1 P2)
        paintRow(null, 'export.cancel');
        break;
      case 'saving':
        // GH-997: a salvage save is not a resumed export (GH-1046: nor is
        // a restart)
        text.textContent = resumeMsg?.salvage || resumeRestart ? ''
          : t('export.resume.resuming');
        prog.textContent = t('playback.saving');
        paintRow(null, null);
        break;
      case 'saved':
        text.textContent = t('playback.saved');
        prog.textContent = '';
        paintRow(null, 'export.close');
        break;
      case 'cancelled':
        text.textContent = t('export.cancelled');
        prog.textContent = '';
        paintRow(null, 'export.close');
        break;
      case 'resumeFailed':
        // the preserved part could not be used (missing/corrupt chunks,
        // or a re-render that did not reproduce it byte-for-byte): the
        // HONEST restart offer — never a silently broken file
        text.textContent = t('export.resume.failed');
        prog.textContent = '';
        paintRow('export.resume.restart', 'export.resume.discard');
        break;
      case 'truncated':
        // GH-472: the encoder surrendered frames the pause seam could not
        // repair in place — the wall refused the short file (no silent
        // truncation, ever) and the export PLAN was kept as the draft.
        // resumeMsg carries {got, want}; the paint re-derives through t()
        // on locale switches (the review r10 P3 descriptor law).
        // GH-997: with a held salvage the file is not lost — the copy
        // names the stutter and offers to save it anyway
        text.textContent = heldSalvage
          ? t('export.resume.salvage',
            { lost: heldSalvage.lost, want: heldSalvage.want })
          : t('export.resume.truncated',
            { got: resumeMsg?.got ?? 0, want: resumeMsg?.want ?? 0 });
        prog.textContent = '';
        paintRow('export.resume.restart', 'export.resume.discard');
        break;
      case 'failed': {
        // resumeMsg is a DESCRIPTOR (review r10 P3): the paint re-derives
        // through t() so a runtime locale change re-localizes the failure
        // text, not just the button
        const d = resumeMsg;
        text.textContent = !d ? t('playback.saveFailed', { code: 'unknown' })
          : d.code ? saveErrorText(d.code)
            : d.key === 'playback.equipmentRefused' ? equipmentRefusedCopy()
              : d.key ? t(d.key)
                : d.stage ? t('playback.stageFailed', { message: d.stage })
                  : t('export.failed', { message: d.failedMsg ?? '' });
        prog.textContent = '';
        paintRow(null, 'export.close');
        break;
      }
      default:
        break;
    }
  }

  function closeResumeBanner() {
    resumeGen += 1; // r13 P2: any in-flight offer check stands down
    releaseHeldSalvage(); // GH-997: the offer leaves — so does its stream
    resumeCtx = null;
    resumeState = null;
    resumeUi?.remove();
    resumeUi = null;
    resumeScrim?.remove();
    resumeScrim = null;
    if (resumeTrap) {
      document.removeEventListener('keydown', resumeTrap, true);
      resumeTrap = null;
    }
  }

  /** GH-997: drop the held salvage stream (the shell discards its
   * partial). Idempotent; the abort is name-scoped, so a stream already
   * gone is an acknowledged no-op. */
  async function releaseHeldSalvage() {
    const h = heldSalvage;
    if (!h) return;
    heldSalvage = null;
    // a standing banner loses its "Save anyway" with the stream
    if (resumeUi && resumeState === 'truncated') setResumeUi('truncated');
    const bridge = streamBridge();
    if (bridge) await streamOp(bridge, { v: 3, op: 'abort', name: h.name });
  }

  /** GH-997 "Save anyway": close the held stream with its exact totals —
   * the shell runs the dest leg on the complete (stuttering) file and its
   * ONE result settles the banner. The kept draft is spent only by a
   * delivered save; a cancelled/failed leg leaves it for Start over. */
  async function salvageSave() {
    const h = heldSalvage;
    const ctx = resumeCtx;
    if (!h || !ctx || resumeState !== 'truncated') return;
    heldSalvage = null; // the `end` below hands the stream to the shell
    setResumeUi('saving', { salvage: true });
    const bridge = streamBridge();
    const onResult = (e) => {
      const d = e?.detail;
      if (!d || typeof d.ok !== 'boolean' || d.name !== h.name
        || d.dest !== h.dest) return;
      window.removeEventListener('ob:save-video-result', onResult);
      if (d.ok && typeof ctx.leaf?.clearPlanIf === 'function') {
        ctx.leaf.clearPlanIf(ctx.hash).catch(() => { /* storage refusal */ });
      }
      if (!resumeUi) return;
      // a cancelled/failed dest leg discarded the file but the draft plan
      // stands — back to the plain draft offer (Start over / Discard)
      setResumeUi(d.ok ? 'saved' : 'truncated', d.ok ? undefined
        : { got: (h.want ?? 0) - (h.lost ?? 0), want: h.want ?? 0 });
    };
    window.addEventListener('ob:save-video-result', onResult);
    const eErr = bridge ? await streamOp(bridge, { v: 3, op: 'end',
      name: h.name, chunks: h.chunks, bytes: h.bytes }) : 'save-failed';
    if (eErr) {
      window.removeEventListener('ob:save-video-result', onResult);
      if (bridge) await streamOp(bridge, { v: 3, op: 'abort', name: h.name });
      setResumeUi('failed', { code: eErr });
    }
  }

  /** Discard/Close: at the OFFER (and restart-offer) states this is the
   * user's decision to drop the preserved partial — the name-scoped abort
   * deletes it shell-side and the persisted plan goes with it. Terminal
   * states (saved/cancelled/failed) just dismiss. */
  async function resumeDiscard() {
    const ctx = resumeCtx;
    const state = resumeState;
    closeResumeBanner();
    if (!ctx || (state !== 'offer' && state !== 'resumeFailed'
      && state !== 'truncated')) return; // GH-472: the draft offer's
    // Discard clears the kept plan exactly like the crash offer's
    try {
      // belt (review r2 P2 + r13 P2): clear ONLY this offer's own plan,
      // ATOMICALLY — a fresh export's persistPlan can queue between a
      // separate read and delete; the compare-and-delete rides one
      // readwrite transaction (older leaf: fall back to the read+clear).
      if (typeof ctx.leaf.clearPlanIf === 'function') {
        await ctx.leaf.clearPlanIf(ctx.hash);
      } else {
        const stored = await ctx.leaf.loadPlan();
        if (stored && stored.hash === ctx.hash) await ctx.leaf.clearPlan();
      }
    } catch { /* storage refusal */ }
    const bridge = streamBridge();
    if (bridge) {
      await streamOp(bridge, { v: 3, op: 'abort', name: ctx.plan.name });
    }
  }

  /** The crash-resume DETERMINISM-CLASS law (GH-362 layer 3, widened by
   * GH-435) — pure over the persisted plan shape, so the e2e-playback
   * contract arm can pin the truth table without a wire:
   *   • mp4-only (review r12 P2): webm-muxer rewrites CLUSTER sizes
   *     mid-stream (whenever the next keyframe closes one), so a webm
   *     disk prefix carries positioned overwrites the append-order hash
   *     cannot fold — the boundary would refuse every time and the
   *     catch-up render would be pure waste; mp4's flat mdat appends only
   *     backpatch at finalize (the RULED window).
   *   • sound-off plans qualify outright (GH-362 layer 3, measured
   *     2026-08-06: the render is pure post-GH-404, AAC/Opus
   *     deterministic, software AVC deterministic — offline-render's
   *     preferSw probe pins it identically on both runs).
   *   • with-sound plans qualify IFF this runtime renders streamed sound
   *     on the GH-435 windowed-EXACT bed (__export.fullAudioExact — the
   *     plain OfflineAudioContext bed measured ±ulp float-summing jitter,
   *     the exact bed is byte-reproducible by construction and admits the
   *     sound-on software-encoder class; a stale pre-435 module pairing
   *     reads false and keeps the honest restart flow).
   * Everything outside the class goes STRAIGHT to the restart flow: one
   * fresh begin, one clean full render — never a boundary render wasted
   * on a hash that cannot verify, and never a spliced file. The runtime
   * boundary hash stays the guard EITHER WAY (a cross-version resume —
   * plan rendered pre-435, resumed post-435 — simply refuses there into
   * the same honest restart). */
  function ffEligible(plan) {
    if (plan?.mime !== 'video/mp4') return false;
    if (plan.opts?.withAudio === false) return true;
    return window.__export?.fullAudioExact === true;
  }

  /** The resume run (restart=false: fast-forward over the preserved
   * partial; restart=true: the honest start-over after a refused resume —
   * fresh begin, same persisted plan). One attempt owns bed + wire +
   * render, exactly like startFullExport; the module `rendering` latch
   * keeps the card/CTA machinery off the wire meanwhile. */
  async function resumeRun(restart) {
    // keep-awake across the WHOLE attempt (review r18 P2): the resume op's
    // native prefix hash can run long before renderDrill takes its own
    // hold — Auto-Lock in that window would background the very attempt.
    // Refcounted seam (the save card's realtime-tier precedent); a stale
    // export.js simply lacks it. Released on every terminal path by the
    // finally.
    const wakeSeam = window.__export?.keepAwake;
    const held = typeof wakeSeam === 'function';
    if (held) { try { wakeSeam(true); } catch { /* stale seam */ } }
    try {
      await resumeRunInner(restart);
    } finally {
      resumeUnwind?.();
      if (held) { try { wakeSeam(false); } catch { /* stale seam */ } }
    }
  }

  async function resumeRunInner(restart) {
    const ctx = resumeCtx;
    if (!ctx || resumeState === 'running' || resumeState === 'saving') return;
    if (rendering || transcodeBusy || saveWait !== null) return;
    // review r4 P1: the toolbar exporter's own busy states (dialog run /
    // drill render) live outside this module's latches — arming the wire
    // while one is live would CONSUME the checkpoint (resume op taken,
    // then renderDrill refuses 'export already running' and the unwind
    // aborts the partial). Refuse up front; the offer stands.
    if (window.__export?.state?.() === 'exporting'
      || window.__export?.drillProgress?.() != null) return;
    const bridge = streamBridge();
    const rd = window.__export?.renderDrill;
    if (!bridge || typeof rd !== 'function') {
      setResumeUi('failed', { code: 'save-failed' });
      return;
    }
    // ---- the DETERMINISM-CLASS gate (measured, 2026-08-06; widened by
    // GH-435, measured 2026-08-09): the fast-forward byte-drop is only
    // safe when the re-render can reproduce the flushed prefix
    // BIT-EXACTLY — see ffEligible() for the full class law. The boundary
    // hash remains the fast path's own guard: a wrong class call refuses
    // into the honest restart, never a spliced file.
    const canFastForward = ffEligible(ctx.plan);
    if (!restart && !canFastForward) restart = true;
    // re-entrancy latch BEFORE the settle wait (a second tap during the
    // up-to-6 s awaitSettle must not arm a second wire attempt)
    const prev = resumeState;
    resumeCancelled = false;
    // an open DVR surface would sit under the lock holding PLAYBACK for
    // the whole settle wait (review r12 P2) — close it through its own
    // restore paths first; the resume owns the table next.
    try { closeCard(); closePlayer(false); closeList(); } catch { /* the
      close paths are self-guarded */ }
    // GH-1046: the setup phase (settle wait, staging, the resume op's
    // native prefix hash — tens of seconds) is not an empty line
    resumeProg = { key: 'export.resume.preparing', fallback: 'Preparing…' };
    resumeRestart = restart;
    setResumeUi('running');
    // GH-997: Start over from a salvage offer — the held stream (same plan
    // name) must leave the shell slot before the restart's `begin`. AFTER
    // the 'running' latch (review r1 P2): a delayed native abort must not
    // leave Start over / Discard live — a second press re-entered the run,
    // and Discard removed the banner under a still-rendering attempt.
    // Discard reads Cancel from here; a press during this await is judged
    // at the next phase boundary (setupCancelled below).
    await releaseHeldSalvage();
    // Cancel-during-SETUP (review r3 P2): before renderDrill installs its
    // AbortController, cancel() is a no-op — the latch is checked at every
    // phase boundary and unwinds through the same cancelled shape (the
    // name-scoped abort discards whatever the attempt owns: the standing
    // candidate before the resume op, the live stream after).
    const setupCancelled = async () => {
      if (!resumeCancelled) return false;
      try { await ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
      await streamOp(bridge, { v: 3, op: 'abort', name: ctx.plan.name });
      setResumeUi('cancelled');
      return true;
    };
    if (!(await awaitSettle())) {
      // Cancel during the wait outranks the offer restore (review r4 P2)
      if (await setupCancelled()) return;
      setResumeUi(prev); // note() said why; the offer stands
      return;
    }
    if (await setupCancelled()) return;
    // review r5 P1: REVALIDATE the shared-exporter guards after the wait —
    // an export started during it owns `rendering`/the exporter now, and
    // proceeding would consume the checkpoint (or clobber the live run's
    // latch). The offer simply stands.
    if (rendering || transcodeBusy || saveWait !== null
      || window.__export?.state?.() === 'exporting'
      || window.__export?.drillProgress?.() != null) {
      setResumeUi(prev);
      return;
    }
    // review GH-435 r1 P1 — the VIDEO-ENCODER leg of the class, probed at
    // gate time (inside the running latch — the probe is an await, and a
    // second tap must keep bouncing off resumeState): without
    // prefer-software support the re-render keeps the platform-default
    // hardware encoder (measured nondeterministic), so the boundary hash
    // could never verify — spending a whole catch-up render to discover
    // that is not the honest Continue. The probe is the render-time
    // preferSw probe itself (offline-render swVideoSupported — the same
    // codec-string law at the plan's own dims), so the gate, the original
    // run and the resumed run all answer identically. A stale pairing
    // (null seam) keeps the pre-435 gate shape: sound-off proceeds on the
    // boundary hash alone, and sound-on never reaches here
    // (fullAudioExact is absent for the same stale pairing).
    if (!restart) {
      const probe = window.__export?.swVideoSupported;
      if (typeof probe === 'function') {
        let sw = false;
        try {
          // width/height/format only — the seam derives the bitrate the
          // render will REALLY configure (review r3 P2: drillRender always
          // encodes at bitrateFor(height); plans persist no bitrate)
          sw = (await probe({ format: 'mp4',
            width: ctx.plan.opts?.width,
            height: ctx.plan.opts?.height })) === true;
        } catch { sw = false; }
        if (!sw) restart = true;
      }
      if (await setupCancelled()) return; // Cancel landed inside the probe
      // review r3 P2 (the r5-P1 revalidation law, applied to THIS await):
      // an export started while the probe was pending owns the exporter
      // now — staging and arming the wire would consume the checkpoint
      // when drillRender refuses 'export already running'. The offer
      // simply stands.
      if (rendering || transcodeBusy || saveWait !== null
        || window.__export?.state?.() === 'exporting'
        || window.__export?.drillProgress?.() != null) {
        setResumeUi(prev);
        return;
      }
      // GH-1046: a refused probe moved this run to the restart class
      if (restart) {
        resumeRestart = true;
        setResumeUi('running');
      }
    }
    rendering = true;
    const { plan } = ctx;
    // ---- stage the bed (openPlayerInner's minimal core: the records pick
    // their bed; the ONE-emission playback stage on the GH-257 seams; the
    // same-class rack-miss retry) ----
    let recs;
    try { recs = plan.records.map((r) => JSON.parse(r)); } catch {
      rendering = false;
      setResumeUi('failed', { stage: 'bad plan' });
      return;
    }
    const wantKind = recordKind(recs, RACK_KIND[plan.game] ?? 'fifteen');
    const priorArchive = supersedeArchiveHold();
    if (priorArchive) await priorArchive;
    const staging = { snap: snapLive(), rackChanged: false, appliedEquipment: game.equipment, appliedTemplate: game.template };
    resumeStaging = staging;
    let unwound = false;
    const unwind = () => {
      if (unwound) return;
      unwound = true;
      if (resumeUnwind === unwind) resumeUnwind = null;
      if (resumeStaging === staging) resumeStaging = null;
      rendering = false;
      try { restoreLive(staging); } catch { /* every leg self-guards */ }
    };
    resumeUnwind = unwind;
    holdArchiveEquipment(staging);
    arch()?.suspend?.(true); // playback staging must never archive
    // terminal staging failures clear BOTH debts (review r6 P2): the same
    // unusable offer would otherwise return on every launch until the
    // 24 h expiry — 'failed' is a dead end by design, so the checkpoint
    // goes with it (the name-scoped abort discards the shell partial).
    const stageFail = async (msg) => {
      unwind();
      try { await ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
      await streamOp(bridge, { v: 3, op: 'abort', name: ctx.plan.name });
      setResumeUi('failed', msg === 'refused' ? { key: 'playback.equipmentRefused' } : { stage: msg });
    };
    if (resumeCancelled) {
      unwind();
      await setupCancelled();
      return;
    }
    // Open-list generations also advance for abandoned archive reads.
    // Only a superseded resume hold belongs to that cancellation; an
    // unrelated open dismissal must not discard this owner's ready result.
    const gen = openGen;
    if (!bedFits(recs, wantKind)) {
      if (!swapSeams()) {
        unwound = true;
        if (resumeUnwind === unwind) resumeUnwind = null;
        if (resumeStaging === staging) resumeStaging = null;
        try { arch()?.suspend?.(false); } finally { releaseArchiveEquipment(staging); }
        rendering = false;
        try { await ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
        await streamOp(bridge, { v: 3, op: 'abort', name: ctx.plan.name });
        setResumeUi('failed', { key: 'playback.switchBlocked' });
        return;
      }
      // CLASS B1: mark the synchronous re-rack BEFORE the hold (see open)
      staging.rackChanged = true;
      const swapErr = await swapBed(wantKind, staging.snap.rack.seed,
        recs[0]?.initial?.equipment ?? null, staging);
      if (resumeCancelled) {
        unwind();
        await setupCancelled();
        return;
      }
      if (gen !== openGen && swapErr === 'superseded') {
        // superseded during the table hold (CLASS A1): unwind quietly and
        // leave the offer standing — the checkpoint is NOT consumed
        unwind();
        setResumeUi(prev);
        return;
      }
      if (swapErr) { await stageFail(swapErr); return; }
    }
    let err;
    if (swapSeams()) {
      err = loadArchiveRecord(staging, plan.records[0], { stage: 'playback' });
      if (typeof err === 'string' && /not in the current rack/.test(err)
        && !staging.rackChanged) {
        // CLASS B1: mark the synchronous re-rack BEFORE the hold (see open)
        staging.rackChanged = true;
        const swapErr = await swapBed(wantKind, staging.snap.rack.seed,
          recs[0]?.initial?.equipment ?? null, staging);
        if (resumeCancelled) {
          unwind();
          await setupCancelled();
          return;
        }
        if (gen !== openGen && swapErr === 'superseded') {
          // superseded during the table hold (CLASS A1): unwind quietly and
          // leave the offer standing — the checkpoint is NOT consumed
          unwind();
          setResumeUi(prev);
          return;
        }
        if (swapErr === 'refused') { await stageFail(swapErr); return; }
        if (!swapErr) err = loadArchiveRecord(staging, plan.records[0], { stage: 'playback' });
      }
    } else if (game.record && game.sampler) {
      game.replay();
      err = game.loadRecord(plan.records[0], { stage: 'quiet' });
    } else {
      err = game.loadRecord(plan.records[0]);
    }
    if (resumeStaging === staging) resumeStaging = null;
    if (typeof err === 'string') { await stageFail(err); return; }
    // review r22 P1 (the round-6 no-re-adjudication invariant): freeze the
    // staged bed NOW — openPlayerInner's own law (paused + manual latch),
    // which this staging path had skipped. Without it the setup awaits
    // below (the hdInfo probe; the resume op's potentially hundreds-of-MB
    // native prefix hash) leave the staged record advancing under the
    // LIVE RAF loop: it settles as if the user had just shot it, and its
    // object is not flow.lastRecord, so flow adjudicates a stroke that
    // never happened — match state mutated where restoreLive can only
    // restore poses. snapLive() above captured the pre-stage paused
    // truth; the unwind's restoreLive restores it and drops manual on
    // every terminal path.
    game.paused = true;
    try { window.__test.setManual(true); } catch { /* stale seam */ }
    if (resumeCancelled) { // the staging window (review r3 P2)
      unwind();
      await setupCancelled();
      return;
    }
    // pre-warm the exporter's support probe BEFORE arming the wire
    // (review r11 P1): on a crash-reload boot drillRender's cache is cold
    // and its own detectExportSupport() await precedes its
    // AbortController — probing now (bed already staged; hdInfo needs the
    // record) shrinks that uncancellable window to nothing on the happy
    // path; the pump below is the belt.
    try { await window.__export?.hdInfo?.(); } catch { /* probe refusal */ }
    if (resumeCancelled) { // Cancel landed inside the probe (review r15 P2)
      unwind();
      await setupCancelled();
      return;
    }
    // ---- arm the wire ----
    let ff = null;
    let baseExtent = 0;
    if (!restart) {
      const { reply, err: rErr } = await streamOpResult(bridge,
        { v: 3, op: 'resume', name: plan.name });
      const ext = Number(reply?.extent);
      if (rErr || !Number.isFinite(ext) || ext < 1
        || typeof reply?.hash !== 'string') {
        unwind();
        if (resumeCancelled) { await setupCancelled(); return; } // r15 P2:
        // the user's Cancel outranks the restart offer
        // the preserved partial is gone/invalid (truncated file, aged
        // manifest, busy shell): the honest restart offer — plan kept
        setResumeUi('resumeFailed');
        return;
      }
      baseExtent = ext;
      ff = ctx.leaf.createFastForward({ extent: ext, hash: reply.hash });
    } else {
      const bErr = await streamOp(bridge, { v: 3, op: 'begin',
        name: plan.name, mime: plan.mime, dest: plan.dest });
      if (bErr) {
        unwind();
        if (resumeCancelled) { await setupCancelled(); return; } // r15 P2
        // the refusal RULING (review r6/r16/r20 reconciled): 'busy' is
        // TRANSIENT (another attempt holds the shell slot) — the debts
        // stay and the banner returns to the ACTIONABLE restart offer
        // (Start over retries; Discard is the exit). Every other code
        // (write-failed = disk, etc.) is a dead end: 'failed' clears both
        // debts so the same offer can never loop on reload (the
        // terminal-path cleanup contract).
        if (bErr === 'busy') {
          setResumeUi('resumeFailed');
          return;
        }
        try { await ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
        await streamOp(bridge, { v: 3, op: 'abort', name: ctx.plan.name });
        setResumeUi('failed', { code: bErr });
        return;
      }
    }
    if (resumeCancelled) { // the wire-arm window (review r3 P2)
      await streamOp(bridge, { v: 3, op: 'abort', name: plan.name });
      unwind();
      try { await ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
      setResumeUi('cancelled');
      return;
    }
    // the plan is LOADED data under the single-clock law — the resumed
    // wire keeps riding its hash (a second crash re-offers against the
    // shell's own renewed window)
    const poster = makeStreamPoster(bridge, plan.name, ctx.hash);
    poster.st.extent = baseExtent; // `end` answers for the WHOLE file
    const post = ff
      ? async (data, at, frame) => {
        for (const p of ff.take(data, at)) await poster.post(p.data, p.at, frame);
      }
      : poster.post;
    // ---- the deterministic re-render ----
    let res = null;
    let failed = null;
    // cancel PUMP (review r11 P1): a Cancel landing inside renderDrill's
    // own pre-controller awaits would otherwise be lost — re-fire the
    // exporter abort until it bites (the controller aborts, rd returns
    // null, the cancelled path unwinds) or the run settles.
    const cancelPump = setInterval(() => {
      if (resumeCancelled) {
        try { window.__export?.cancel?.(); } catch { /* stale seam */ }
      }
    }, 200);
    // GH-1046: the fast-forward re-renders the flushed prefix only to hash
    // and drop it — those frames paint as their own step ("Checking the
    // saved part… n %"), and from the checkpoint frame on the main bar
    // picks up at the pct the offer named (the same formula), never a 0 %
    // bar under "Finishing…". The step is anchored on the manifest's frame
    // (the offer's own progress anchor); without one it lasts until the
    // boundary verifies, n = the prefix hashed so far. The main bar's floor
    // is the offer's pct itself, anchor or not (a hint past plan.frames
    // still painted a clamped 99 %).
    const ckFrames = Number(plan.frames);
    const ckFrame = Number(ctx.hint?.frame);
    const ckAt = ff && ckFrame > 0 ? ckFrame : 0;
    const ckPct = ff && ckFrames > 0
      ? Math.max(0, Math.min(99, Math.round(100 * (ckFrame > 0 ? ckFrame : 0) / ckFrames)))
      : 0;
    const paintProg = () => {
      if (resumeUi) resumeUi.querySelector('.ob-pb-resume-prog').textContent = resumeProgText();
    };
    try {
      // format PINNED to the persisted mime (review r5 P2): a normal saved
      // plan carries no opts.format, and a re-negotiation across relaunch
      // (encoder support drift) could otherwise stream webm bytes into the
      // mp4 `begin` the shell already accepted — the container and the
      // bytes must come from ONE source of truth, the plan.
      res = await rd(plan.records, { ...plan.opts,
        format: plan.mime === 'video/mp4' ? 'mp4' : 'webm',
        stream: { post },
        onProgress: (done, total, ema) => {
          if (ff && (ckAt ? done < ckAt : !ff.verified())) {
            const part = ckAt ? done / ckAt
              : typeof ff.progress === 'function' ? ff.progress() : 0;
            const pct = Math.max(0, Math.min(99, Math.floor(100 * part)));
            resumeProg = { key: 'export.resume.checking', params: { pct },
              fallback: `Checking the saved part… ${pct}%` };
          } else {
            resumeProg = { key: 'export.progress', params: {
              pct: Math.max(ckPct, Math.round(100 * done / total)),
              eta: fmtEta((total - done) * ema / 1000), done, total } };
          }
          paintProg();
        },
        onPause: (p) => {
          if (p) {
            resumeProg = { key: 'export.paused',
              fallback: 'paused (app in background) — resumes automatically' };
            paintProg();
          }
        },
      });
    } catch (e) {
      failed = e;
    } finally {
      clearInterval(cancelPump);
    }
    // belt: a resumed render that never reproduced the whole flushed
    // prefix must not close the wire (end would be malformed anyway —
    // this just names the failure honestly)
    if (res && !failed && ff && !ff.verified()) {
      failed = new Error('resume-mismatch');
    }
    if (res && !failed) {
      // non-cancellable BEFORE the end handshake (review r10 P2): the
      // render settled — a Cancel over a delayed shell `end` reply could
      // only lie (the latch is never consulted again on this path)
      setResumeUi('saving', null); // GH-997: no salvage copy carried over
      // subscribe BEFORE `end` (review r3 P2): a fast dest leg (pre-
      // authorized Photos) can dispatch the ONE result between the end
      // acknowledgement and a later registration — the banner would hang
      // in 'saving' forever
      const unResult = armResumeResultWait(plan.name, plan.dest);
      const eErr = await streamOp(bridge, { v: 3, op: 'end',
        name: plan.name, chunks: poster.st.seq, bytes: poster.st.extent });
      if (eErr) {
        unResult(); // no result is coming for a refused end
        failed = new Error(eErr);
      } else {
        // delivered to the dest leg — the export left the crash window
        try { ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
        unwind();
        return;
      }
    }
    // failure/cancel: free the shell slot + partial NOW (a mismatched
    // partial is debt by definition), restore the bed, paint honestly
    if (failed?.obTruncated) {
      // GH-472: a truncated resume/restart run keeps the draft too — the
      // engine's pause seam repairs in-render losses, so this wall only
      // fires for seam-evading drops, and the plan can still finish the
      // job on the next attempt (Discard remains the exit). Re-persist
      // the kept-draft marker (the exact hashed bytes — ctx.json) so a
      // reload re-offers this draft too (review r1 P2); capability-gated
      // (r2 P2 — a pre-472 leaf ignores it); marker BEFORE the abort
      // (r4 P2 — a death between the two must leave the crash offer, not
      // an unreachable markerless orphan).
      try {
        if (ctx.leaf.DRAFT_CAPABLE === true) {
          await ctx.leaf.persistPlan(ctx.json, ctx.hash,
            { draft: { got: failed.obTruncated.got,
              want: failed.obTruncated.want } });
        }
      } catch { /* storage refusal */ }
    }
    // GH-997: the same held-stream salvage as the card's failure unwind —
    // when every byte the muxer wrote crossed THIS wire (a restart, or a
    // fast-forward whose boundary verified)
    const sv = failed?.obSalvage;
    const salvage = failed?.obTruncated && (restart || ff?.verified?.())
      && Number.isFinite(sv?.streamedBytes) && sv.streamedBytes === poster.st.extent
      ? { name: plan.name, dest: plan.dest, chunks: poster.st.seq,
        bytes: poster.st.extent, lost: sv.lost, want: sv.frames } : null;
    if (!salvage) await streamOp(bridge, { v: 3, op: 'abort', name: plan.name });
    unwind();
    const tok = String(failed?.message ?? failed);
    if (failed?.obTruncated) {
      heldSalvage = salvage;
      setResumeUi('truncated',
        { got: failed.obTruncated.got, want: failed.obTruncated.want });
      return;
    }
    if (failed && tok === 'resume-mismatch' && !restart) {
      // the disk bytes were not reproduced — offer the honest start-over
      // (the persisted plan stays for it)
      setResumeUi('resumeFailed');
      return;
    }
    try { ctx.leaf.clearPlan(); } catch { /* storage refusal */ }
    if (!failed) { // rd returned null: AbortError (seam cancel)
      setResumeUi('cancelled');
      return;
    }
    setResumeUi('failed', /^[a-z-]{1,40}$/.test(tok)
      ? { code: tok } : { failedMsg: tok });
  }

  /** One-shot result wait for the resume surface's delivery (the shell's
   * ONE 'ob:save-video-result' after the dest leg) — deliberately NOT the
   * card's saveWait latch: the banner owns its own paint, and the card
   * machinery stays untouched by a bannered attempt. Registered BEFORE the
   * `end` op posts (review r3 P2); returns the unsubscribe for the
   * refused-end path (no result is coming there). */
  function armResumeResultWait(name, dest) {
    const onResult = (e) => {
      const d = e?.detail;
      if (!d || typeof d.ok !== 'boolean'
        || d.name !== name || d.dest !== dest) return;
      window.removeEventListener('ob:save-video-result', onResult);
      if (!resumeUi) return;
      if (d.ok) setResumeUi('saved');
      else if (d.error === 'cancelled') setResumeUi('cancelled');
      else setResumeUi('failed', { code: d.error });
    };
    window.addEventListener('ob:save-video-result', onResult);
    return () => window.removeEventListener('ob:save-video-result', onResult);
  }

  onLocaleChange(() => { if (resumeUi) setResumeUi(resumeState); });
  maybeOfferResume(); // fire-and-forget; guarded head to toe
  // review r18 P2: a checkpoint whose promotion raced the recovery
  // reload's script rebuild arrives as a PUSHED hint (assignment + this
  // event) — re-run the offer check, but never over a live attempt.
  window.addEventListener('ob:resume-hint', () => {
    if (rendering || resumeState === 'running' || resumeState === 'saving') return;
    closeResumeBanner();
    maybeOfferResume();
  });

  /** RENDERING state — reached ONLY from the Export CTA (defect A). */
  async function startRender() {
    if (rendering || transcodeBusy || !pb || !card) return; // the transcode
    // latch is a render lock too (review round-7 P1)
    if (fullMode()) return; // GH-305: full mode has no CTA — belt for a
    // stale skin / seam caller (the starter tiles own that mode)
    paintGen += 1; // pending save feedback stays off this render's blob
    // (rounds 5+6 P2 — a reopened card must not inherit a stale paint)
    // GH-364 (review r6 P2): a parked caption-stale latch refers to the
    // PREVIOUS run's output — this press re-derives the plan (and its
    // caption) at the CURRENT locale, so the latch must not drain onto
    // the fresh, honest blob later
    strikeStalePending = false;
    cardSalvage = null; // GH-997: a fresh press supersedes the offer
    const rd = window.__export?.renderDrill;
    if (typeof rd !== 'function') {
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'drill render unavailable (stale export.js)' });
      syncCardActions();
      return;
    }
    // GH-304 (review round-6 P2): plan time IS press time — the press drops
    // the snapshot and derives fresh, so a calibration/probe move since the
    // last paint can never ride an old latch into the render (the belts
    // below then judge feasibility against the SAME fresh number)
    cardBudget = null;
    const { records, opts } = savePlan();
    strikeRunTitle = opts.strike?.title ?? null; // press-time caption truth
    if (!records.length) { closeCard(); return; }
    if (!planFits(records.length)) {
      // GH-304 (review round-2 P2) press-time belt behind the CTA disable:
      // planFits now rides the derived budget, and a budget input can
      // settle between the last repaint and a racing press — never hand
      // renderDrill a plan its cap loop can only throw on (the camScript/
      // walkBeat belts' two-layer shape); the repaint below restates why
      const { budgetSec } = plannedMontage();
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = tBudget('playback.clipTooLongDur',
        'playback.clipTooLong', { shots: records.length }, budgetSec);
      syncCardActions();
      return;
    }
    if (opts.perShotCamera?.some((c) => c && typeof c === 'object' && c.script)
      && window.__export?.camScriptCapable !== true) {
      // press-time belt behind the openCard notice + CTA disable (review
      // round-2 P1, the hasRenderDrill two-layer shape): never hand a
      // { script } plan to an exporter that would silently drop it
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'scripted camera unavailable (stale export.js) — reload the app' });
      syncCardActions();
      return;
    }
    if ((opts.beats ?? []).some(Boolean)
      && window.__export?.walkBeatCapable !== true) {
      // GH-299 press-time belt (the camScriptCapable shape, replayed for
      // the walk-beat schedule): never hand a beats plan to an exporter
      // that would silently ship hard cuts the live player walked
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'walk transitions unavailable (stale export.js) — reload the app' });
      syncCardActions();
      return;
    }
    if ((opts.fades ?? []).length && window.__export?.fadeCapable !== true) {
      // GH-301 press-time belt: never hand a fades plan to an exporter
      // that would silently ship un-faded frames the live player dipped
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'fade transitions unavailable (stale export.js) — reload the app' });
      syncCardActions();
      return;
    }
    if (opts.strike && window.__export?.strikeGlyphCapable !== true) {
      // GH-364 press-time belt (the fadeCapable shape): never hand a
      // strike plan to an exporter that would silently ship plate-less
      // frames the live player previewed with the plate armed
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'strike-point overlay unavailable (stale export.js) — reload the app' });
      syncCardActions();
      return;
    }
    if (includedSegments().some((x) => pb.cueable?.[x.i] === true)
      && window.__export?.cuePostTailCapable !== true) {
      // design 277 slice 3 PR-2 press-time belt (the walkBeatCapable
      // shape), widened per review r1 P2 and again per r7 P1: ANY plan
      // with a CUE-BEARING included segment — not only tailed ones —
      // must refuse on a cached pre-PR-2 offline-render.js. A valid plan
      // whose tHide fits inside the record probes tail 0 yet wears the
      // cue through the whole shot in the player; the old renderer would
      // ship it cue-less (and tail-bearing plans shorter than the card
      // promised — untrimmed endT-null plans and trims STARTING inside a
      // tail bypassed the original endT check entirely).
      renderDests();
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('export.failed',
        { message: 'cue timeline unavailable (stale export.js) — reload the app' });
      syncCardActions();
      return;
    }
    noBlobExport = false; // a fresh attempt re-derives it (round-2 P2)
    rendering = true;
    // design 277 slice 3 PR-2: the DVR arm now stays UP at this boundary
    // — offline-render.js owns the whole cue bracket (entry disarm
    // through the lane, per-segment arming, exit disarm), so the pre-PR-1
    // "disarm before the render" seam is gone and e2e-playback arm 3's
    // WYSIWYG pin reads cueArmed === true here (the designed forcing
    // function of the PR-1 recorded seam). The render's .finally below
    // still reconciles pb.cueArm with the engine the renderer left
    // disarmed, and restorePlayerBed()'s renderAtT re-arms over the
    // restored bed on every settled outcome.
    // a re-render must disarm the previous file's tiles AND drop the previous
    // payload. `lastBlob = null` alone left export.js's module-scope
    // lastResult.blob alive for the WHOLE next encode (review round 1 P2) —
    // harmless when a render implied a fresh card, but the confirm-first CTA
    // makes "Export again" a one-tap loop, so a 4K re-render would hold the
    // old ~100 MB container beside the new encoder buffers in an iOS WebView.
    releaseBlob();
    cardRealRate = null; // each run reports its own montage truth
    renderDests(); // disabled tiles preview the routing while the bar runs
    syncCardActions(); // CTA away, options LOCKED (the WYSIWYG invariant)
    P.progress.classList.add('on');
    P.cancel.style.display = '';
    P.ptext.textContent = '…';
    try {
      const res = await rd(records, {
        ...opts,
        onProgress: (done, total, ema) => {
          if (!card) return;
          P.bar.style.width = `${(100 * done / total).toFixed(1)}%`;
          P.ptext.textContent = t('export.progress', {
            pct: Math.round(100 * done / total),
            eta: fmtEta((total - done) * ema / 1000), done, total,
          });
        },
        onMontage: (rate) => {
          cardRealRate = Number.isFinite(rate) ? rate : null;
          if (card) P.cardQuality?.refresh?.();
        },
        // GH-362: the backgrounded render PARKS — say so instead of a
        // stuck bar (the next onProgress after resume repaints the line).
        // has() first (review r8 P2): a stale dictionary paints readable
        // English, never the bare key (the tBudget/fmtDur law).
        onPause: (p) => {
          if (p && card) {
            P.ptext.textContent = has('export.paused') ? t('export.paused')
              : 'paused (app in background) — resumes automatically';
          }
        },
      });
      rendering = false;
      if (!card) return;
      P.cancel.style.display = 'none';
      syncCardActions(); // every settled outcome re-arms the CTA + picker
      restorePlayerBed(); // every settled outcome: cancel, no-blob, done
      if (!res) { // cancelled: no file (abort=no-partial) — the SETUP card
        // returns, so the budget copy re-derives and repaints (review
        // round-3 P2: a probe settle mid-render deferred its repaint
        // behind the `rendering` guard)
        cardBudget = null;
        P.ptext.textContent = t('export.cancelled');
        P.bar.style.width = '0%';
        syncMontage();
        return;
      }
      // SUCCESS deliberately does NOT re-derive the budget (review round-6
      // P2): the snapshot still holds the PRESS-time value this render was
      // planned under, so the delivered-clip repaint below describes the
      // retained blob — never the calibration this render just wrote,
      // which reaches the NEXT plan through the press-time re-derivation
      // at the top of this function (probe settles repaint as before).
      lastBlob = res.blob ?? null; lastBlobId += 1;
      // the blob's provenance, from its own producer (transcodeOkFor —
      // review rounds 1/2/4 P2): the plan's output dims (the avcCodecFor
      // predicate: EITHER side above HD), whether the render muxed sound
      // (savePlan pins withAudio: true today), and the codec a webm render
      // carries (the offline sink encodes vp09 — never vp8)
      lastBlobMeta = lastBlob
        ? { uhd: (opts.width ?? 0) > 1920 || (opts.height ?? 0) > 1080,
          audio: opts.withAudio !== false,
          codec: res.ext === 'webm' ? 'vp9' : null }
        : null;
      if (!lastBlob) {
        // stale export.js without keepBlob: the render already download()ed
        // nothing (noDownload) — degrade honestly. The setup hint stands
        // DOWN with it (review round-2 P2): "Export the clip first" beside
        // an exporter that can never arm the destinations is a lie.
        noBlobExport = true;
        syncDestHint();
        P.ptext.textContent = t('export.failed',
          { message: 'no blob from renderDrill (stale export.js)' });
        return;
      }
      P.ptext.textContent = t('export.done', {
        size: `${(res.size / 1e6).toFixed(1)} MB`, ext: res.ext,
        frames: res.frames, sec: res.wallSec?.toFixed(1),
      });
      renderDests();
      // GH-304 (review round-7 P2): the delivered clip's montage truth
      // INCLUDING the no-montage case — renderDrill reports onMontage only
      // when compression occurred, so a re-export that STOPPED montaging
      // (a calibration-widened budget) must not keep the previous run's
      // rate painted beside the new 1× blob. res.montageRate is 1 there;
      // the refresh then paints the delivered rate (the pre-304 semantics
      // of the quality line after a render).
      cardRealRate = Number.isFinite(res.montageRate) ? res.montageRate : null;
      P.cardQuality?.refresh?.();
      // GH-364 (review r7 P2): the caption-stale drain waits for the blob
      // to INSTALL — every earlier syncCardActions on this path ran before
      // the assignment above, so a locale switch that landed mid-render
      // drains HERE (retiring this old-caption blob) or never
      syncCardActions();
    } catch (e) {
      rendering = false;
      if (!card) return;
      cardBudget = null; // failed: the SETUP card returns — re-derive
      P.cancel.style.display = 'none';
      const sv = e?.obSalvage;
      if (sv?.blob instanceof Blob) {
        // GH-997: refused as visibly broken, but the file exists — offer
        // it instead of throwing a near-complete render away
        cardSalvage = { blob: sv.blob, ext: sv.ext, lost: sv.lost,
          want: sv.frames,
          meta: { uhd: (opts.width ?? 0) > 1920 || (opts.height ?? 0) > 1080,
            audio: opts.withAudio !== false,
            codec: sv.ext === 'webm' ? 'vp9' : null } };
        P.ptext.textContent = t('export.salvage.prompt',
          { lost: sv.lost, want: sv.frames });
      } else {
        P.ptext.textContent = t('export.failed', { message: e?.message ?? String(e) });
      }
      syncCardActions();
      restorePlayerBed();
      syncMontage(); // the budget copy repaints on the failed outcome too
      // (review round-3 P2 — the cancel path's law; a probe settle during
      // the failed render deferred its repaint behind `rendering`)
    }
  }

  /** GH-997 "Save anyway": install the salvaged container as the card's
   * delivered blob — the success path's install, with the honest
   * missing-frames line instead of export.done; the destination tiles
   * then route it like any finished clip. */
  function acceptSalvage() {
    const sv = cardSalvage;
    if (!sv || rendering || !card) return;
    cardSalvage = null;
    lastBlob = sv.blob; lastBlobId += 1;
    lastBlobMeta = sv.meta;
    P.ptext.textContent = t('export.salvage.kept', {
      size: `${(sv.blob.size / 1e6).toFixed(1)} MB`, ext: sv.ext,
      lost: sv.lost, want: sv.want });
    renderDests();
    syncCardActions();
  }

  /** GH-250: the REALTIME-CAPTURE run — the fallback tier when no offline
   * encoder config exists (realtimeMode, set by the settled open-time
   * probe). Rides the SAME lifecycle as startRender (rendering locks the
   * card; Cancel is the only way out; paintGen retires stale paints) but
   * the "renderer" is the LIVE player bed: seek the in point, MediaRecorder
   * ON over the canvas the player paints, play the trim window at the
   * DISPLAYED speed, stop at the out point, take the finished blob back
   * through the ADDITIVE __record.lastRecording() seam and arm the same
   * destination card + chunked delivery wire every offline clip takes.
   *
   * WALL-CLOCK BY NATURE — the one sanctioned exception to the
   * deterministic render clock (recorded in the ownership ledger): a live capture
   * records real elapsed time, so its cost IS the trim window's wall
   * seconds and its quality IS what the screen showed. The card's copy
   * says exactly that (playback.realtimeLine/Note — no slowmo/4K/quality
   * promises). The modal card + backdrop block orbit/gesture input for the
   * whole run, and the DOM overlay never reaches the file:
   * canvas.captureStream records the WebGL canvas, not the compositor.
   *
   * Delivery honesty is downstream and unchanged: the container is the
   * NEGOTIATED one (webm on Chrome-family — where the GH-252 probe decides
   * the Photos offer; mp4 on WebKits that negotiate it — Photos direct). */
  async function startRealtime() {
    if (rendering || transcodeBusy || !pb || !card) return; // same lock
    let rec = null;
    try { rec = window.__record ?? null; } catch { rec = null; }
    if (!rec?.supported || typeof rec.lastRecording !== 'function') return;
    if (rec.recording() || rec.hdSaving?.()) {
      // never stack a second MediaRecorder over a live one (start() would
      // refuse anyway — this paints the reason instead of a dead press)
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('playback.saveBusy');
      return;
    }
    paintGen += 1; // pending save feedback stays off this capture's blob
    if (!includedSegments().length) { closeCard(); return; }
    if (realtimeWallSec() > RT_CAP_SEC) {
      // press-time belt behind the CTA disable (review round-1 P2): never
      // capture a clip every delivery bridge must then refuse (384 MiB)
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('playback.realtimeTooLong', { sec: RT_CAP_SEC });
      return;
    }
    if (planHasFades()) {
      // GH-301 review round-2 P1 press-time belt: the capture records the
      // canvas — a fade plan would ship a file silently missing the dips
      P.progress.classList.add('on');
      P.cancel.style.display = 'none';
      P.ptext.textContent = t('playback.realtimeFades');
      return;
    }
    rendering = true;
    // GH-362 (review r2 P1): this capture bypasses start()/drillRender —
    // the ONE refcounted keep-awake owner is reached through the ADDITIVE
    // seam instead (a stale export.js lacks it: the pre-362 degrade). Up
    // to 75 s of wall-clock capture under common Auto-Lock settings would
    // otherwise background mid-run. Released beside BOTH rendering
    // releases below (every terminal path).
    try { window.__export?.keepAwake?.(true); } catch { /* stale seam */ }
    releaseBlob();
    renderDests(); // disabled tiles preview the routing while the bar runs
    syncCardActions(); // CTA away, card locked (the WYSIWYG invariant)
    P.progress.classList.add('on');
    P.cancel.style.display = '';
    P.bar.style.width = '0%';
    P.ptext.textContent = t('export.recording'); // reuse ×7
    const before = rec.lastRecording(); // identity: onstop is ASYNC, so the
    // finished blob is "the one that is not this" (never a stale capture)
    // GH-433: frame one is the EFFECTIVE window's start (the associated
    // span for a lead-only selection — the capture must open at the lead
    // and run through the strike, exactly what the plan promises; the raw
    // trim start otherwise, unchanged)
    renderAtT(effWindow().tIn);
    // #983: the recorder captures THIS canvas — a resize mid-capture must
    // not change its size, so the live latch drops for the capture (main.js
    // defers the resize) and returns on every settled path (relatchLive)
    try { window.__test.setManual(true); } catch { /* stale seam */ }
    // the size this capture records, read now: relatchLive() applies a
    // deferred resize before the blob's meta is written below
    let capDims = null;
    try { const c = document.querySelector('body > canvas'); capDims = { w: c?.width ?? 0, h: c?.height ?? 0 }; } catch { capDims = null; }
    let startFailed = false;
    let finished = false; let stopBefore = before; // #1129: the end poll's identity, re-read just before THIS stop
    try {
      finished = await new Promise((resolve) => {
        // VIDEO-ONLY on purpose (review round-1 P2): sound.js clears its cue
        // list on the dvr-marked PLAYBACK transition, so the bed replays
        // SILENT — muxing the live tap here would sell a silent audio track
        // as sound-on (the exact mute-file lie transcode.js refuses). The
        // card's realtimeNote copy says "video only" in the same breath.
        let began = false;
        // a throwing MediaRecorder constructor (review round-1 P1) must land
        // in the honest-failure paint below, never reject this promise with
        // `rendering` latched and no rtCancel — that wedges the card shut
        try { began = rec.start(false) === true; } catch { began = false; }
        if (!began) { startFailed = true; resolve(false); return; }
        let settled = false;
        const stopRec = (ok) => {
          if (settled) return;
          settled = true;
          rtCancel = null;
          clearInterval(wallDog);
          document.removeEventListener('visibilitychange', onHide);
          try { stopBefore = rec.lastRecording(); } catch { /* stale seam */ } try { rec.stop(false); } catch { /* stale seam */ }
          resolve(ok);
        };
        rtCancel = () => { setPlaying(false); stopRec(false); };
        // GH-1099: accepting start() is earlier than the native start event.
        // Keep producing the initial pose while the backend warms up, so a
        // short trim cannot finish before the recorder receives any frames.
        setPlaying(false);
        let playbackStarted = false;
        const rtT0 = performance.now();
        // RAF-independent guards (review round-7 P1): browsers SUSPEND
        // requestAnimationFrame in background, so the tick below cannot
        // enforce the wall cap exactly when throttling makes it matter —
        // and the recorder keeps eating wall time while the bed is frozen.
        // A hidden page ends the run NOW (what played is what it shows;
        // recording a suspended canvas is nothing but bytes), and a plain
        // interval backstops the cap even while visible-but-throttled.
        const onHide = () => {
          if (document.hidden) { setPlaying(false); stopRec(true); }
        };
        document.addEventListener('visibilitychange', onHide);
        const wallDog = setInterval(() => {
          const sec = (performance.now() - rtT0) / 1000;
          if (sec > RT_CAP_SEC) {
            setPlaying(false);
            stopRec(true);
          } else if (!playbackStarted && sec > RT_START_SEC) {
            startFailed = true; // GH-1099: the recorder never started
            stopRec(false);
          }
        }, 1000);
        const tick = () => {
          if (settled) return;
          if (!pb || !card) { stopRec(false); return; } // safety net only —
          // rendering=true blocks close/dismiss for the whole run
          // HARD wall-clock ceiling (review rounds 6+8 P1): setPlaying
          // clamps every RAF delta to 0.1 s, so under low FPS / background
          // throttling a run PLANNED under RT_CAP_SEC records longer wall
          // time than its content seconds — and the recorder keeps eating
          // wall time either way. The stop lands AT the budget (the 1 s
          // watchdog can already add ~1 s of slack; 75+1 s at the 40 Mbps
          // worst case stays under the 384 MiB wire cap — +5 s of grace
          // did not) and delivers what actually played — a live capture
          // is what the screen showed.
          if ((performance.now() - rtT0) / 1000 > RT_CAP_SEC) {
            setPlaying(false);
            stopRec(true);
            return;
          }
          if (!playbackStarted) {
            let ready;
            try {
              if (!rec.recording()) { startFailed = true; stopRec(false); return; }
              // A stale record.js keeps its synchronous-start behavior.
              ready = typeof rec.started !== 'function' || rec.started() === true;
            } catch { startFailed = true; stopRec(false); return; }
            if (!ready) {
              if ((performance.now() - rtT0) / 1000 > RT_START_SEC) {
                startFailed = true; // GH-1099: the recorder never started
                stopRec(false);
                return;
              }
              renderAtT(effWindow().tIn);
              requestAnimationFrame(tick);
              return;
            }
            playbackStarted = true;
            setPlaying(true);
          }
          // GH-433: stop + progress ride the same EFFECTIVE window frame
          // one opened at (the associated span for a lead-only selection)
          const { tIn: wIn, tOut: wEnd } = effWindow();
          if (!pb.playing || pb.T >= wEnd - 1e-6) { stopRec(true); return; }
          const denom = Math.max(wEnd - wIn, 1e-6);
          const pct = Math.max(0, Math.min(100, 100 * (pb.T - wIn) / denom));
          P.bar.style.width = `${pct.toFixed(1)}%`;
          P.ptext.textContent = t('export.recordingPct', { pct: Math.round(pct) });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    } catch {
      // belt (review round-1 P1): nothing above should reject, but a wedged
      // card — `rendering` latched forever, Close blocked — is the one
      // outcome this lifecycle may never reach
      finished = false;
      startFailed = true;
    }
    rtCancel = null;
    // the card STAYS LOCKED (rendering) until record.js's ASYNCHRONOUS
    // onstop hands the blob over (review round-2 P1): re-arming Export
    // while the recorder is still assembling let a second run start
    // mid-poll — resetting the shared chunks array and mis-attributing the
    // previous run's blob — and a slow finalize read as a false no-file
    // failure. Both polls below are bounded, so the lock always releases.
    if (P.cancel) P.cancel.style.display = 'none';
    if (!finished) { // cancelled or never-started: no delivery, nothing armed
      // wait out the recorder's settle (bounded) so the dropped capture
      // can never be read as a LATER run's blob, then drop its bytes —
      // nothing is delivered from this path
      for (let i = 0; i < 100 && !startFailed; i++) {
        const b = rec.lastRecording();
        if (!rec.recording() && b && b !== before) break;
        await new Promise((r) => { setTimeout(r, 50); });
      }
      try { rec.releaseRecording?.(); } catch { /* stale seam */ }
      rendering = false;
      relatchLive();
      try { window.__export?.keepAwake?.(false); } catch { /* stale seam */ }
      if (!card) return;
      syncCardActions(); // every settled outcome re-arms the CTA
      P.bar.style.width = '0%';
      P.ptext.textContent = startFailed
        ? t('playback.realtimeStartFailed') // ×7 (review round-2 P2)
        : t('export.cancelled');
      return;
    }
    // rec.onstop is asynchronous — poll the additive getter for the NEW
    // blob, generously (review round-2 P1: a big capture can finalize for
    // many seconds — a 24 s bound was measured expiring under real load —
    // a slow finalize is not a failure), still bounded (60 s) so a never-
    // arriving capture fails honestly; a NEW blob lands whole, so an EMPTY one fails at once (#1129).
    if (card) P.ptext.textContent = '…';
    let blob = null;
    for (let i = 0; i < 600; i++) {
      const b = rec.lastRecording();
      if (b && b !== stopBefore) { blob = b.size > 0 ? b : null; break; }
      await new Promise((r) => { setTimeout(r, 100); });
    }
    rendering = false;
    relatchLive();
    try { window.__export?.keepAwake?.(false); } catch { /* stale seam */ }
    if (!blob) {
      // the recorder missed the deadline or finalized EMPTY: SUPERSEDE it (the
      // cancel path's own law — review round-6 P2) so a later-landing blob
      // cannot stay pinned in record.js, inaccessible to any card
      try { rec.releaseRecording?.(); } catch { /* stale seam */ }
    }
    if (!card) return;
    syncCardActions(); // every settled outcome re-arms the CTA
    if (!blob) {
      P.bar.style.width = '0%';
      P.ptext.textContent = t('playback.realtimeNoFile'); // ×7
      return;
    }
    lastBlob = blob; lastBlobId += 1;
    lastBlobMeta = { // video-only by construction; codec from the
      // NEGOTIATED mime, dims from the canvas the capture recorded
      // (backing-store pixels, BOTH sides — the avcCodecFor predicate, so
      // a portrait 780×1688 retina bed honestly demands the UHD probes;
      // review rounds 2+4 P2), as read at the capture's start (#983)
      uhd: capDims ? capDims.w > 1920 || capDims.h > 1080 : true, // unreadable = conservative
      audio: false,
      codec: /vp9/.test(rec.mime ?? '') ? 'vp9'
        : /vp8/.test(rec.mime ?? '') ? 'vp8' : null,
    };
    P.bar.style.width = '100%';
    P.ptext.textContent = t('playback.realtimeDone', {
      size: `${(blob.size / 1e6).toFixed(1)} MB`,
      ext: blob.type === 'video/mp4' ? 'mp4' : 'webm',
    });
    renderDests(); // the tiles arm off the capture blob — mp4 → Photos
    // direct; webm → Photos only through the GH-252 probed transcode tier
  }

  // ---- late-icon retrofit + locale re-render ---------------------------------
  retrofitIcons = () => {
    // the pill glyph is INLINED (GH-246) — there is nothing to retrofit on it;
    // the build-once panel faces still upgrade off their text fallback
    for (const f of lateFaces) f();
    // GH-301 (review r9 P3): the strip's built-once slot pills upgrade too
    try { stripUi?.refreshIcons?.(); } catch { /* strip degrade */ }
  };
  retrofitIcons();
  onLocaleChange(() => {
    if (panel) { applyDom(panel); if (listOpen) renderList(); }
    if (player) {
      if (pb) { // recompose the t()-built session chip (no data-i18n hooks)
        P.chipT?.replaceChildren(rowTitle(pb.meta));
        if (P.chipT) P.chipT.title = P.chipT.textContent;
        if (P.chipM) P.chipM.textContent = playerChipMeta(pb.meta);
      }
      applyDom(player);
      relabelMarkers(P.track); // built once per open — applyDom cannot see them
      P.track?.setAttribute('aria-label', t('playback.seek')); // GH-718
      syncTransport();
      syncMontage();
      if (pb?.captureLatch) { // GH-330: disabled-pill reasons re-localize
        for (const b of P.camBtns?.values?.() ?? []) {
          b.title = t('playback.strip.capturing');
        }
      }
      try { stripUi?.relabel?.(); } catch { /* strip leaf degrade */ }
      // GH-364 (review r1 P2): the plate caption is LOCALIZED BURNED text —
      // a paused armed preview repaints in the new language NOW (the
      // syncLiveStrike paint key carries getLocale(), renderAtT is the
      // drive point), and a SETTLED clip carrying the old-language caption
      // is the resSel dishonest state under the new plan — invalidated
      // through the same writer path as an option flip.
      if (strikeOn) { // raw arm, not strikeArmed(): a switch INTO a stale
        // dictionary just disarmed the derived truth — the repaint below
        // must still run so the standing plate CLEARS (review r3 P2).
        // NEVER while the exporter owns the renderer (review r6 P2): a
        // renderAtT between exported frames would restage/seek the shared
        // bed mid-segment — the post-render restore repaints instead
        // (restorePlayerBed → renderAtT, locale-keyed paint key).
        if (pb && !rendering) renderAtT(pb.T);
        // the locale-stale law, SCOPED TO THE PAGE-SIDE DELIVERABLE
        // (review r12 ruling): only a retained montage blob can be
        // deliverable under a caption the plan no longer promises. A
        // full-mode Saved state describes a file the SHELL already owns —
        // delivered honestly under the locale of its render; a later app-
        // language switch does not retire history (and wiping destFx here
        // erased terminal failure states, r12 P2/P3). Option FLIPS keep
        // the full retire (setStrikeOn → strikeInvalidate — they relabel
        // the card's promise, the setExportMode lifecycle).
        if (card && lastBlob && !rendering && !transcodeBusy) {
          strikeInvalidate();
        } else if (card && (rendering || transcodeBusy)) {
          // the run in flight snapshotted the OLD caption at press time
          // (review r5 P2) — its blob must not stand deliverable when it
          // installs; syncCardActions drains this once the latches clear
          // and the blob exists.
          strikeStalePending = true;
        }
      }
    }
    if (card) {
      // GH-364 (review r4/r5/r10 P2): a switch INTO a dictionary lacking
      // the strike keys just disarmed the derived truth (strikeArmed's
      // strikeDictOk re-check) — the CONTROL must not stand checked and
      // enabled over a plan that dropped the option. DETACHED before
      // applyDom runs (r10: a hidden-in-place row's data-i18n span would
      // still be visited — a missing-key warn + an English caption in a
      // localized card); intent preserved (strikeOn survives — switching
      // back re-mounts the row in its armed state via mountStrikeRow,
      // which also covers a card OPENED under the stale dictionary).
      if (P.strikeRow && !strikeDictOk()) {
        P.strikeRow.remove();
        P.strikeRow = null;
        P.strikeTog = null;
        unmountStrikeAnno(); // GH-475: the knob rows ride the same law
      } else if (!P.strikeRow) {
        mountStrikeRow();
      } else if (P.strikeAnnoRows
        && !(i18nNs.hasLocal('playback.strikeElev')
          && i18nNs.hasLocal('playback.strikePower'))) {
        // GH-475: a locale whose stale dictionary lacks only the KNOB keys
        // drops the knob rows while the overlay row stands (the r10
        // detach-before-applyDom register; knob intent persists — a
        // capable locale re-mounts them armed below)
        unmountStrikeAnno();
      } else if (!P.strikeAnnoRows) {
        mountStrikeAnnoRows(); // switch INTO a knob-capable dictionary
      }
      // GH-433 (review r2 P2, the strikeRow r10 register): the hint REKEYS
      // BEFORE applyDom visits it — a switch to a locale whose stale
      // dictionary lacks playback.trimNoContent must swap the dataset back
      // to the legacy key first, or the sweep below would t() the missing
      // key (a missing-key warn + an English line in a localized card)
      // before syncDestHint could hide it. Idempotent under fresh
      // dictionaries: the same key paints twice.
      syncDestHint();
      applyDom(card);
      try { P.resSelW?.refresh?.(); } catch { /* stale select.js */ }
      try { P.qualSelW?.refresh?.(); } catch { /* stale select.js */ }
      P.cardQuality?.refresh?.();
      syncModeRow(); // GH-305 (review round-3 P3): the mode-row reason is a
      // t()-composed writer (its stale-export branch carries a message
      // param applyDom cannot recompose) — re-derive it whole
      syncDestHint(); // …and the full-mode hint's dataset swap repaints
    }
  });

  // ---- GH-301: the director-strip EDITOR wiring (guarded leaf) ---------------
  /** Camera pose extraction for the tripod capture flow (§3.2/§1.1): the
   * live camera through coords.threePosToK — kernel [kx, ky, h] metres +
   * fov degrees; the look point is the forward ray's bed-plane intersection
   * (2 m ahead for shallow rays). null = stale coords.js / no camera —
   * capture degrades to cancel, never a throw. */
  function cameraPoseK() {
    const cam = window.__dbg?.camera;
    if (!cam || typeof coords?.threePosToK !== 'function') return null;
    const q = cam.quaternion;
    // rotate three-frame forward (0, 0, -1) by the camera quaternion
    const tx = 2 * (q.y * -1 - q.z * 0), ty = 2 * (q.z * 0 - q.x * -1);
    const tz = 2 * (q.x * 0 - q.y * 0);
    const fx = 0 + q.w * tx + (q.y * tz - q.z * ty);
    const fy = 0 + q.w * ty + (q.z * tx - q.x * tz);
    const fz = -1 + q.w * tz + (q.x * ty - q.y * tx);
    const p = cam.position;
    let d = 2;
    if (fy < -1e-4) d = Math.min(12, (0.02 - p.y) / fy);
    const eyeK = coords.threePosToK(p);
    const lookK = coords.threePosToK({ x: p.x + fx * d, y: p.y + fy * d,
      z: p.z + fz * d });
    if (![eyeK.x, eyeK.y, eyeK.z, lookK.x, lookK.y, lookK.z, cam.fov]
      .every(Number.isFinite)) return null;
    return { eye: [eyeK.x, eyeK.y, eyeK.z], look: [lookK.x, lookK.y, lookK.z],
      fov: cam.fov };
  }
  /** v1 move legality for cut i (§1.5): POV→POV boundary seams only, AND
   * a walk the GH-299 builder actually affords (review r6 P2: a rise-
   * incomplete exit or a comfort-rejected path answers null — MOVE would
   * render as the hard cut the picker must then say). The ONE predicate
   * normalizeMoves also enforces post-write. */
  function moveLegalAt(i) {
    const c = pb?.plan?.cuts?.[i];
    if (!moveSeamLegal(c)) return false;
    return beatFor(c.seg - 1, pb.durs[c.seg - 1]) !== null;
  }
  /** The derived walk duration a MOVE seam would take (read-only in the
   * picker — the GH-299 walk law owns it; null = the hard-cut degrade). */
  function walkDurAt(i) {
    const c = pb?.plan?.cuts?.[i];
    if (!c || !moveLegalAt(i)) return null;
    return beatFor(c.seg - 1, pb.durs[c.seg - 1])?.beatSec ?? null;
  }
  function initStrip() {
    if (!stripMod || typeof stripMod.createStrip !== 'function' || stripUi) {
      return;
    }
    try {
      stripUi = stripMod.createStrip({
        pb: () => pb,
        P: () => P,
        ico,
        fmtT,
        model: {
          cuts: () => (pb ? pb.plan.cuts : []),
          poses: () => (pb ? pb.plan.poses : []),
          writeCut, deleteCut, setTransition, writePose,
          camIdAt: (seg, tSec) => (pb ? appliedCamId(camIdAt(seg, tSec)) : 0),
          appliedCam: (n) => (pb ? appliedCamId(n) : 0),
          camLabel: (n) => {
            const a = pb ? appliedCamId(n) : 0;
            return isCustomCamId(a) ? t('playback.cam.slot', { n: a - 7 })
              : t(`playback.cam.${CAMS[a].id}`);
          },
          camIcon: (n) => {
            const a = pb ? appliedCamId(n) : 0;
            return isCustomCamId(a) ? 'cam-tripod' : CAMS[a].icon;
          },
          isDynamic: isDynamicCamId,
          moveLegal: moveLegalAt,
          walkDur: walkDurAt,
          planRev: () => pb?.planRev ?? 0,
        },
        view: {
          repaint: () => { if (pb) scrubTo(pb.T); },
          renderNow: () => { if (pb) renderAtT(pb.T); },
          pause: () => setPlaying(false), // capture is pause → frame → save
          outT: (seg, tCs) => (pb
            ? pb.cum[seg] + Math.min(csSec(tCs), pb.durs[seg]) : 0),
          // §3.2 pill law: within the snap radius of a shot boundary the
          // insert takes the boundary write (byte-identical to GH-273
          // there); inside a beat window it belongs to the NEXT segment
          snapAssist: (T, radius) => {
            if (!pb) return { seg: 0, t: 0 };
            // the NEAREST boundary wins (review r8 P2 — a first-match scan
            // could attach the cut to the PREVIOUS shot when the radius
            // overlaps two boundaries)
            let best = null, bd = Infinity;
            for (let s = 1; s < pb.cum.length; s++) {
              const d = Math.abs(T - pb.cum[s]);
              if (d <= radius && d < bd) { best = s; bd = d; }
            }
            if (best !== null) return { seg: best, t: 0 };
            if (T <= radius) return { seg: 0, t: 0 };
            const at = locate(T);
            if (at.beat) return { seg: at.i + 1, t: 0 };
            return { seg: at.i, t: Math.min(at.local, pb.durs[at.i]) };
          },
        },
        // GH-314: the strip pings this on every engagement edge (select /
        // popover / drag / capture / expand-collapse) so the overlay pin
        // re-evaluates without polling. ADDITIVE ctx member: a STALE strip
        // never calls it (its presses are covered by the hold pin), and a
        // stale playback.js pairing a fresh strip leaves the strip's
        // ctx.ui?.sync?.() optional chain a no-op.
        ui: { sync: () => syncUi() },
        capture: {
          setLatch: (on) => {
            if (!pb) return;
            pb.captureLatch = !!on;
            // GH-330: while the latch holds, every preset CAM pill tap is
            // this module's guarded no-op (the click handler's
            // captureLatch return) — wear the kit :disabled state + the
            // localized reason for exactly the latch's lifetime instead
            // of staying silently tappable. The strip mirrors this on its
            // own slot pills (syncCaptureDisable).
            for (const b of P.camBtns?.values?.() ?? []) {
              b.disabled = !!on;
              if (on) b.title = t('playback.strip.capturing');
              else b.removeAttribute('title');
            }
            syncUi(); // GH-314: the capture pin arms/releases with the latch
            if (on) {
              // the framing must be VISIBLE (review r5 P1): the player holds
              // manual mode, so orbit/touch gestures mutate the camera with
              // no renderer behind them — a presentation-only rAF loop
              // (composer.render, no seek, no frame emission: ball state
              // never moves) paints the framing until the latch releases.
              const loop = () => {
                if (!pb?.captureLatch) return;
                try { window.__dbg?.composer?.render?.(); } catch { /* stale */ }
                requestAnimationFrame(loop);
              };
              requestAnimationFrame(loop);
              // an active fade must not black out the framing view
              // (review r5 P2) — the latch forces alpha 0 until exit
              setLiveFade(0);
              // GH-364 (review r3 P2): the plate stands down with the fade
              // while the user frames a tripod slot (the same latch law)
              syncLiveStrike(locate(pb.T), pb.T);
              // disarm the rigs ONCE on entry so the armed pose(t) script
              // cannot stomp the user's framing per frame (§3.2); the
              // latch then suppresses every re-apply until exit
              window.__track?.stop?.();
              try { window.__test.cameraScript?.(null); } catch { /* stale */ }
              // …and SYNC the orbit rig onto the CURRENT camera (review
              // GH-301 round-2 P2): scripted/tracked rigs pose the camera
              // directly and leave orbit.state stale, so the first framing
              // gesture would orbit.apply() a jump away from the very pose
              // being captured. Mirror of camerapresets.js pose() with the
              // rig's own clamps; feature-detected (stale orbit = the
              // pre-fix jump, the recorded degrade).
              try {
                const cam = window.__dbg?.camera;
                const orb = window.__dbg?.orbit;
                const k = cameraPoseK();
                if (cam && orb?.state?.target && k) {
                  orb.state.target.set(k.look[1], k.look[2], k.look[0]);
                  const d = cam.position.clone().sub(orb.state.target);
                  const r = Math.min(6.5, Math.max(0.7, d.length() || 1e-6));
                  orb.state.radius = r;
                  orb.state.phi = Math.min(1.44, Math.max(0.16,
                    Math.acos(Math.min(1, Math.max(-1, d.y / (d.length() || 1e-6))))));
                  orb.state.theta = Math.atan2(d.x, d.z);
                }
              } catch { /* stale debug handles */ }
            }
          },
          applyAt: () => {
            if (!pb) return;
            pb.appliedKey = null;
            renderAtT(pb.T); // re-apply cameraAt at the playhead (§3.2)
          },
          poseFromCamera: cameraPoseK,
        },
      });
    } catch { stripUi = null; return; }
    // a LATE module resolve mounts onto an already-open player
    if (pb && player) { try { stripUi.mount(); } catch { /* degrade */ } }
  }

  // ---- the ONE window seam (e2e + debug) --------------------------------------
  window.__playback = {
    /** `open({ title })` — optional launcher noun (B-K24); bare open() = 'playback.title' */
    open: (opts) => openList(opts && typeof opts === 'object' ? opts : undefined),
    close: () => {
      openGen++; // cancel any open still inside its readiness wait
      // Teardown owns every archive hold, including a running resume.
      // List dismissals cancel only their open bracket's holds instead.
      cancelArchiveHold();
      closeCard(); closePlayer(false); closeList();
    },
    isOpen: () => listOpen,
    playerOpen: () => !!pb,
    cardOpen: () => !!card,
    /** Open session `id` straight into the player (list bypassed). 035a:
     * the second argument is OPTIONAL and additive — `reopenList: false`
     * makes the user's close land on the live table instead of the modal
     * (recorded on the opened player as `pb.launch`); `opening()` is true
     * from this seam's FIRST line until openPlayer returns. */
    openSession: async (id, { reopenList = true } = {}) => {
      pendingSession = true;
      if (pendingSince === null) pendingSince = performance.now();
      // r6 (review r3 P2): openList's cancellation rule — close() bumps
      // openGen; the token is read at the seam's FIRST line and judged after
      // EACH await below, so a close() during the archive read or during
      // the bounded dialog wait returns BEFORE buildPanel and the launch (a
      // cold open + close never opens the player after the user closed it;
      // arm F1i, session leg). r8 (review r5 P2): Escape is armed at the
      // same first line — a press during the archive read or the dialog
      // wait bumps openGen exactly like close() — and disarmed before the
      // launch (the player's own keys take over; arm F1i, Escape legs)
      const gen = openGen;
      const disarm = armPendingEsc();
      try {
        const detail = await arch()?.session?.(id);
        if (!detail) return false;
        if (gen !== openGen) return false; // dismissed (Escape / close()) during the archive read
        // r5 (checker P3): the same bounded settle as openList — a rail-row
        // tap before the kit leaf lands must not build the LEGACY filter form
        // under a fresh kit (the panel persists for the session)
        if (!panel) {
          await settleDialog();
          if (gen !== openGen) return false; // dismissed (Escape / close()) or superseded during the wait
          if (!panel) buildPanel();
        }
        disarm(); // the pending window is over: the launch owns the keys
        pendingLaunch = { reopenList: reopenList !== false }; // GH-684
        await openPlayer(detail, detail);
        if (pb && String(pb.meta?.id) === String(detail.id)) {
          pb.launch = { reopenList: reopenList !== false };
          relabelBack(); // GH-684: the pill follows the recorded intent
        }
        return !!pb;
      } finally { disarm(); pendingSession = false; if (!opening) pendingSince = null; pendingLaunch = null; }
    },
    // ---- 035a additive seams (the replays contract (feature 035, internal)
    // §3.2; every consumer feature-detects) ------------------------------
    /** Register `host` as a list host; returns { unmount, render }. */
    mountList: (host, opts = {}) => {
      if (!(host instanceof Element)) return null;
      unmountList(host); // re-mount = replace the record
      const rec = {
        el: host, modal: false,
        variant: typeof opts.variant === 'string' ? opts.variant : null,
        onOpen: typeof opts.onOpen === 'function' ? opts.onOpen : null,
        onChange: typeof opts.onChange === 'function' ? opts.onChange : null,
        controls: opts.controls !== false,
        limit: opts.limit ?? null,
        markers: opts.markers === 'meta' ? 'meta' : 'eager',
        // GH-668 S5 replays r3 (audit r1 F3, ruling (b)): an optional HEAD
        // slot — the host's FIRST day label renders there, above its
        // scrollport (contract §7 row 44); absent = every label in the flow
        head: opts.head instanceof Element ? opts.head : null,
        count: 0, io: null,
        gen: 0, // mount generation: unmount() bumps it (in-flight renders cancel)
      };
      if (rec.variant) host.classList.add(`ob-pb-list--${rec.variant}`);
      listHosts.set(host, rec);
      armHead(rec); // r4 F5: the head slot follows the window (contract §7 row 48)
      // review r2 PR #655 P2: the handle is bound to THIS registration — the
      // record and its mount generation at issue. After unmount(), or
      // after the same host was re-mounted (a NEWER record owns it), a
      // stale handle's render() is a no-op (it never repopulates the
      // cleared host) and its unmount() never removes the newer
      // registration (the ownership ledger host-lifecycle law: a host's rows and
      // observer belong to the registration that mounted it, and only
      // that registration's handle may tear them down).
      const token = rec.gen;
      const live = () => listHosts.get(host) === rec && rec.gen === token;
      return {
        unmount: () => { if (live()) unmountList(host); },
        // render({ metas }) renders from the caller's pre-read index (no
        // archive await — rows land inside the call); render() reads
        render: (opts = null) => (live()
          ? renderList('render', rec, Array.isArray(opts?.metas) ? opts.metas : null)
          : Promise.resolve()),
      };
    },
    unmountList: (host) => unmountList(host),
    /** The ONE filter truth (the closure `filter`). */
    filter: () => filter,
    /** Pending-open latch: the openSession seam's window OR-ed with the
     * openPlayer latch — the shell's entry gate refuses the hall meanwhile. */
    opening: () => opening || pendingSession,
    /** r11 (round-10 checker P4, harness bound): `performance.now()` at the
     * pending open's FIRST line — openSession's or openPlayer's, whichever
     * came first — null when nothing is pending. Read-only; the F1i Escape
     * legs bound a "judgeable" press by the seam's OWN wait start instead of
     * the harness's launch clock. */
    openingSince: () => pendingSince,
    /** r9 read-only diagnostics seam (review r6 P2; arm X3): the help-title
     * registry census `{ size, connected, detached }` — `detached` counts
     * strips whose closed #ob-pb-player the registry would otherwise pin. */
    helpTitles: () => helpTitleCensus(),
    /** r10 read-only diagnostics seam (round-9 checker P4; arm X3): the P.*
     * handle census `{ total, detached }` — `detached` lists the keys whose
     * nodes are all disconnected (a closed player's chrome a live handle
     * would otherwise pin). */
    handles: () => ({ total: Object.keys(P).length, detached: detachedHandles() }),
    sessionSummary: (id) => sessionSummary(id),
    /** GH-668 S5 B-RP03 (035 contract §3.2 `marks`, ADDITIVE): the session's
     * marker strip as the ROW's own node — a `div.ob-pb-marks` painted by
     * the same `paintMarks` every list row uses (pot dot / foul chip / win
     * / drill sparkle: one renderer, contract §4 law 3 extended to marks).
     * Accepts an id (one archive read) or a detail record; resolves `null`
     * when the session is gone. The replays card appends it to its line 2
     * and never restyles it (the strip is playback.css markup). */
    marks: async (idOrDetail) => {
      let detail = idOrDetail && typeof idOrDetail === 'object' ? idOrDetail : null;
      if (!detail) {
        try { detail = await arch()?.session?.(idOrDetail); } catch { detail = null; }
      }
      if (!detail) return null;
      const marks = document.createElement('div');
      marks.className = 'ob-pb-marks';
      paintMarks(marks, detail, detail);
      return marks;
    },
    state: () => (pb ? {
      shot: pb.curIdx, t: pb.T, tIn: pb.tIn, tOut: pb.tOut,
      // cams DERIVED from the plan (GH-301 §1.3 — the degenerate view the
      // GH-273 seams promised: explicit t=0 boundary assignments, or null)
      speed: pb.speed, total: pb.total,
      cams: pb.recs.map((_, i) => {
        const c = pb.plan.cuts.find((x) => x.seg === i && x.t === 0);
        if (!c) return null;
        return isCustomCamId(c.cam) ? `custom${c.cam - 8}`
          : (CAMS[c.cam]?.id ?? 'broadcast');
      }),
      playing: pb.playing, clock: game.clock,
      // GH-299 (ADDITIVE): the live beat schedule + timeline geometry
      durs: pb.durs.slice(), cum: pb.cum.slice(),
      beats: pb.beats.map((w) => (w ? w.beatSec : null)),
      // design 277 slice 3 PR-2 (ADDITIVE): per-segment cue-life tails +
      // whether the engine would arm each record at all (belt input)
      tails: (pb.tails ?? pb.durs.map(() => 0)).slice(),
      cueable: (pb.cueable ?? pb.durs.map(() => false)).slice(),
      // GH-489 #637 LAND-17 PM2 (ADDITIVE): per-record sink completions (the
      // engine's plan term; the fullFits wall mirrors it) — the kernel
      // duration where no drop outlasts the record or the leaf is stale
      completions: (pb.completions ?? pb.durs.slice()).slice(),
      // GH-363 (ADDITIVE): the live lead schedule (seconds before each
      // segment's play start) — cum is lead-inclusive (cum[i] = play start)
      leads: (pb.leads ?? pb.durs.map(() => 0)).slice(),
      // GH-911 OQ-22 (a) (ADDITIVE): the per-record record-bound rods (copies;
      // null = a record without finite shot.a, shot.b or shot.theta)
      rods: (pb.rods ?? pb.durs.map(() => null)).map((r) => (r ? { ...r } : null)),
    } : null),
    seek: (T) => { if (pb) renderAtT(T); return pb ? pb.T : null; },
    setTrim: (tin, tout) => {
      if (!pb) return false;
      pb.tIn = Math.min(Math.max(0, tin), pb.total);
      pb.tOut = Math.max(pb.tIn + 0.1, Math.min(pb.total, tout));
      syncMontage();
      syncTransport();
      return true;
    },
    setSpeed: (s) => {
      if (!pb || !SPEEDS.includes(s)) return false;
      pb.speed = s;
      for (const [k, x] of P.speedBtns ?? []) x.checked = k === s;
      syncMontage();
      // GH-301 review round-2 P2: same repaint law as the detent chips
      setLiveFade(pb.captureLatch ? 0 : evalAlpha(pb.T));
      // GH-364 (review r3 P2): the strike alpha follows the same repaint
      syncLiveStrike(locate(pb.T), pb.T);
      return true;
    },
    setCam: (id) => {
      if (!pb || !CAMS.some((c) => c.id === id)) return false;
      // GH-301 §1.3: setCam keeps its EXACT semantics as the degenerate
      // boundary write for pb.curIdx (planChanged() inside owns the
      // GH-299 schedule refresh + the re-apply key)
      writeCut({ seg: pb.curIdx, t: 0, cam: camIdOf(id),
        transitionIn: 0, dur: 0 }, { degenerate: true });
      renderAtT(pb.T); // paused-tap repaint, same as the shelf tiles
      return true;
    },
    // GH-301 §1.3 (ADDITIVE): the cameraPlan seams — setCutPlan validates
    // + quantizes a whole plan (edit-time law; illegal plans REFUSE);
    // getCutPlan returns the stored integer-quantized model verbatim.
    setCutPlan: (p) => (pb ? (() => {
      const ok = setPlanChecked(p);
      if (ok) renderAtT(pb.T);
      return ok;
    })() : false),
    getCutPlan: () => (pb ? clonePlan(pb.plan) : null),
    // GH-302 (ADDITIVE, read-only): the LIVE session's camera plan for the
    // share codec — the open player's plan when the player is ON the live
    // session, else the GH-273/301 close-latch for it. null = no DVR user
    // state exists (share.js then falls back to a decoded incoming plan);
    // an EMPTY plan is returned as-is (deliberate user state — it encodes
    // as no `&cp=` param).
    livePlan: () => {
      const live = arch()?.current?.();
      if (live == null) return null;
      if (pb?.meta?.id === live) return clonePlan(pb.plan);
      const latched = camLatch.get(live);
      return latched ? clonePlan(latched.plan) : null;
    },
    // GH-301 §2.4 (ADDITIVE, read-only): the live output-clock fade alpha
    fadeAlphaAt: (T) => (pb ? evalAlpha(T) : null),
    // GH-301 (ADDITIVE): the strip editor's e2e/debug seams — null while
    // the leaf is absent/stale (the degrade arm reads exactly this)
    strip: () => (stripUi?.seams ?? null),
    // GH-314 (ADDITIVE, read-only): the immersive-console overlay state —
    // the machine state, the enumerated pins and the render-clock idle
    // seconds (e2e arm 18 reads exactly this; writes go through REAL
    // input, never a seam shortcut)
    ui: () => (pb && player ? {
      state: player.dataset.ui ?? null,
      pins: uiPins(),
      idleSec: pb.ui.idleSec,
      wantShown: pb.ui.wantShown,
      // GH-314 owner amendment (ADDITIVE): the QuickTime leave-grace state
      pointerOut: pb.ui.pointerOut,
      outSec: pb.ui.outSec,
      mouseSeen: pb.ui.mouseSeen,
    } : null),
    plan: () => (pb ? savePlan() : null),
    // GH-305 (ADDITIVE): the save card's export mode + its availability
    // chain — e2e asserts the v2-only degrade here (mode not offered) and
    // drives the REAL mode buttons for the offered path. The setter goes
    // through the same guarded switch a click takes (refuses when the
    // chain is missing a layer or a run holds the card).
    exportMode: () => exportMode,
    fullModeOk: () => fullModeOk(),
    // GH-363 (ADDITIVE): the pre-strike lead-in option + schedule readouts
    // — the e2e determinism/WYSIWYG arms drive the toggle and assert the
    // live schedule (leads/leadTier per segment) against the plan.
    leadIn: () => leadInOn,
    setLeadIn: (on) => {
      setLeadIn(on);
      return leadInOn;
    },
    leads: () => (pb ? { leads: pb.leads.slice(),
      tiers: pb.leadTier.slice(),
      pre: pb.leadPre.map((p) => (p ? { ...p } : null)) } : null),
    // GH-433 (ADDITIVE, read-only): the effective play/capture window —
    // the raw trim bounds, or the lead-ASSOCIATED slice's live span (the
    // e2e assocation arms assert the one window every tier consumes).
    effWindow: () => (pb ? effWindow() : null),
    // GH-362 layer 3 (ADDITIVE, read-only): the crash-resume surface's
    // state — e2e asserts the offer/terminal paints here and drives the
    // REAL banner buttons for the flows.
    resumeState: () => resumeState,
    resumeOffer: () => (resumeCtx ? {
      name: resumeCtx.plan.name,
      // hint is null on a GH-472 kept-draft offer (no shell partial exists)
      extent: resumeCtx.hint?.extent ?? 0,
      frame: resumeCtx.hint?.frame ?? 0,
      frames: resumeCtx.plan.frames ?? 0,
    } : null),
    // GH-362 layer 3 (ADDITIVE, e2e): re-run the boot-time offer check —
    // the crash arms fabricate hint + persisted plan mid-session and need
    // the REAL matching/mount path, not a seam shortcut around it.
    resumeCheck: () => {
      closeResumeBanner();
      return maybeOfferResume();
    },
    // GH-435 (ADDITIVE, read-only): the determinism-class decision on a
    // fabricated plan shape — the e2e-playback contract arm pins the
    // fast-forward/restart truth table (mp4/webm × sound-off/sound-on ×
    // capability) against THIS exact predicate, the one resumeRunInner
    // consults.
    ffEligible: (plan) => ffEligible(plan),
    setExportMode: (id) => {
      if (!card || (id !== 'montage' && id !== 'full')) return false;
      setExportMode(id);
      return exportMode === id;
    },
    // GH-364 (ADDITIVE): the strike-overlay option + its live-preview truth
    // — e2e drives the REAL writer via setStrike (the setExportMode shape;
    // works card-open or not, exactly like the toggle → preview flow) and
    // the WYSIWYG identity arm reads strikeLive() against the plan's own
    // record-derived mapping. strikeRect proxies the leaf's plateRect so
    // the localization arm can pin the burned region without re-deriving
    // the geometry.
    strikeOn: () => strikeOn,
    strikeArmed: () => strikeArmed(),
    setStrike: (on) => { setStrikeOn(on === true); return strikeOn; },
    // GH-475 (ADDITIVE): the annotation knobs — same real-writer shape
    strikeAnno: () => ({ elev: strikeElevOn, power: strikePowerOn }),
    setStrikeAnno: (kind, on) => {
      if (kind !== 'elev' && kind !== 'power') return null;
      setStrikeAnno(kind, on === true);
      return kind === 'elev' ? strikeElevOn : strikePowerOn;
    },
    strikeLive: () => {
      if (!pb) return null;
      const at = locate(pb.T);
      const info = strikeInfoFor(at.i);
      return { armed: strikeArmed(), seg: at.i, beat: at.beat,
        alpha: strikeAlphaLive(at, pb.T),
        tOff: info ? info.tOff : null,
        glyph: info ? { ...info.glyph } : null,
        // timeline context so the identity arm can compute scrub targets
        // (T→track fraction) without a second timeline derivation
        T: pb.T, total: pb.total, segStart: pb.cum[at.i],
        dur: pb.durs[at.i] };
    },
    strikeRect: (o) => (sgMod?.plateRect ? sgMod.plateRect(o ?? {}) : null),
    // GH-299 e2e/debug surfaces (ADDITIVE, read-only): the walk meta for
    // the boundary after segment i, and the segment's live armed spec —
    // `o.noLock` rebuilds it WITHOUT the gaze arrival lock, the red-proof
    // knob the CB-in-frame gate uses to prove its own teeth (no production
    // caller passes options).
    walkMeta: (i) => (pb?.beats?.[i]?.meta
      ? JSON.parse(JSON.stringify(pb.beats[i].meta)) : null),
    walkSpec: (i, o = {}) => {
      if (!pb) return null;
      const w = o?.noLock
        ? beatFor(i, pb.durs[i], { noLock: true })
        : pb.beats?.[i];
      const spec = w ? livePovSpec(i, w) : null;
      return spec ? JSON.parse(JSON.stringify(spec)) : null;
    },
    save: () => openCard(),
    setFilter: (f) => {
      if (!['all', 'match', 'practice', 'playground'].includes(f)) return false;
      filter = f;
      if (panel) { // the kit segmented's radio is the painted truth (r4 C1b: or the legacy toggle's aria-pressed)
        for (const x of panel.querySelectorAll('.ob-pb-filters input[type="radio"]')) x.checked = x.value === f;
        for (const b of panel.querySelectorAll('.ob-pb-filters button[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === f));
      }
      // every host follows the ONE filter truth (a rail host renders even
      // while the modal panel was never built — 035a)
      renderList('filter');
      return true;
    },
  };
}
