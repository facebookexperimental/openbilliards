// Copyright (c) Meta Platforms, Inc. and affiliates.

// previewink.js — GH-260 W1: adaptive assist-line ink (STREAM-A leaf).
//
// The GH-199/227 per-ball line inks are picked scene-referred against the
// cloth BASE hex; measured on rendered pixels (issue GH-260 round 1: 71,828
// segments, 252 cells) the display transform (lamp/GI felt lift + ACES +
// sheen) collapses that contrast to a 1.22 median WCAG — 252/252 cells
// under the 3.0 SC 1.4.11 floor. This module implements the owner-approved
// W1 treatment (issue GH-260 round 3 + the 2026-07-30 decision comment):
// 2 CSS px ribbon strokes whose per-vertex luminance is SOLVED against the
// live post-tonemap background to a dual floor (APCA Lc 60+8 target AND a
// predicted-WCAG 3.8 ceiling — model-error margin, do NOT tune down), with
// the dual-polarity chroma rule: per line solve the dark CEILING and the
// light FLOOR (both floor-compliant), evaluate the sRGB gamut-edge OKLCH
// chroma each polarity can carry at its solved luminance ALONG THAT BALL'S
// OWN HUE (read LIVE per pose — the RAW palette hex preview.js publishes
// on userData.obBallHex at its recolor writes, falling back to
// material.color for a stale preview.js; round-3 stale-hue finding +
// review round-5 ivory-mix finding), pick the higher-chroma polarity,
// tie-break toward the smaller luminance departure.
//
// Architecture (the round-1 "honest B" requirement): a pre-line pass runs
// the composer's OutputPass into a small OWNED render target from
// composer.writeBuffer — NOT readBuffer: the falloff ShaderPass swap leaves
// its output in readBuffer, but the OutputPass (Pass-default needsSwap)
// swaps AGAIN after rendering to screen, so at end-of-frame readBuffer
// holds the PRE-falloff bloom output and writeBuffer the post-falloff
// pre-tonemap HDR (review round-1 P1; two-swap detail at sampleStep). The
// sample is of the LAST frame — machine.emit('frame') precedes
// composer.render in main.js, so sampling carries one frame of latency,
// absorbed by the hysteresis — and reads back via an OWNED WebGL2 fence +
// PBO loop (the prototype synchronous canvas readback, 9–22 ms, must NOT
// ship). GH-320: the readback was three's readRenderTargetPixelsAsync
// until build 15 — its probe loop feeds fenceSync's return STRAIGHT to
// clientWaitSync inside a bare setTimeout, so a context loss landing while
// the preview is hidden (PLAYBACK; the owner's iOS memory-pressure class)
// made the first post-close kick throw WebKit's uncatchable TypeError
// ("Argument 1 ('sync') … must be an instance of WebGLSync") AND left the
// vendor promise permanently unsettled — the in-flight latch wedged and
// the sampler never re-armed (Chrome presents the same transition as a
// WAIT_FAILED rejection ×3 = a PERMANENT degrade). Owning the loop makes
// that impossible by construction: the sync handle and its owning context
// are validated before EVERY clientWaitSync, every GL touch is try/caught,
// a context loss abandons the in-flight readback and DEGRADES to the
// static cores (the degrade law), and the canvas restore event re-arms —
// ribbons resume within a bounded number of frames. CPU per-line solves
// write instanced-ribbon vertex colors; the THREE.Line cores keep their
// scene-referred GH-199 inks (material.color + the previewInks() side
// records stay the identity carrier — e2e-equipment's byte pins hold) and
// are draw-disabled via material.visible while the ribbons are live.
//
// Contrast level (issue GH-417): the dual-floor solve TARGET is a user
// preference — Settings → Assists, stepped low|standard|high|maximum
// (CONTRAST_LEVELS below carries the full derivation; fix round 2026-08-07:
// low re-anchored fainter at the APCA Lc-15 discernibility tier, maximum
// made hue-preserving via the identity-band clamp). HISTORY: the
// round-3 "NOT tunable down" owner decision governed the SHIPPED CONSTANT,
// and it still does — 'standard' IS that constant set byte-identically and
// remains the default; GH-417 adds an explicit USER preference around it
// (defaults stay WCAG-compliant; a user choosing lower contrast is a
// legitimate preference, cf. reduced-motion). The level is consumed ONLY
// by this adaptive solver: the static scene-referred path (the GH-199/227
// inks every degrade route renders — WebGL1, readback failure, context
// loss, stale graph) stays FIXED at the shipped constants, because that
// picker chooses from a discrete palette against the cloth BASE hex with
// no measured-contrast authority (round 1: the display transform collapses
// its scene-referred ratios to a 1.22 median) — a level-scaled threshold
// there could not deliver the promised target and would break the
// identity-carrier byte pins. Scripted boots pin the static path (below),
// so the level can never leak into captures, renders or replays.
//
// Zone-decal channel (issue GH-442; owner fix round 2026-08-09 — white
// boundary): the drill objective-zone decal (aim.js restGroup — the "paper
// target") splits into a PHYSICAL white outline and an assist-ink wash.
// The outline is paper-white paint owned by aim.js (a lit material the
// scene's own lamp renders — not an ink, so it is not solved here); this
// channel's boundary output is only lineA, the GH-417 level's COVERING
// POWER for that white stroke (the anchor-ratio ladder — see the zone
// channel note at zoneStep). The WASH stays a true assist ink solved HERE
// by the same machinery: one additional single-channel solve (zoneStep,
// after solveStep) samples the rendered cloth at the interior anchors
// aim.js publishes on __aim.zoneDecalState(), runs the NEUTRAL-line
// dual-floor law at the live GH-417 contrast level (luminance-only
// adaptation, scale + desaturate-on-overflow — the cueApproach/cuePost
// role family), walks the same rung ladder/EMA grammar, and publishes the
// carrier on __aim.zoneDecal() (linear RGB + receipts). aim.js reads it
// per frame, feature-detected; every degrade route of THIS module
// (scripted pin, WebGL1, readback failure, context loss) leaves
// zoneDecal() inactive and the decal falls back to the static assist-tone
// wash + shipped-covering-power white — the assist-line degrade law
// verbatim, and the GH-417 level can never leak into scripted registers
// because the channel never runs there. During PLAYBACK (lines hidden, the
// hook's anyVisible early-return) the last solved carrier stays LATCHED —
// the decal keeps its ink through the shot; a settings discontinuity
// (stateReset with the grace open) clears the latch instead, exactly like
// the line re-latch law.
//
// Determinism / OWNERSHIP (the ownership ledger (internal), GH-260 note):
//   - SCRIPTED boots (?obtool/?cinema — the shading.js CINEMA convention)
//     pin the STATIC ink path: this module stays inert, so every committed
//     capture, offline render and ink pin stays byte-stable at DPR 1.
//   - Interactive temporal state advances on the frame-hook clock (the dt
//     argument), never wall time; __aim.inkFreeze latches all state for
//     manual renderAt sequences (the e2e sampler protocol).
//   - Consumed seams, ALL feature-detected with a static-path degrade:
//     window.__dbg.composer (GH-263 probe seam), composer.__obCine
//     {renderer, output}, the falloff ShaderPass strength uniform. Any
//     absence, WebGL1, an import failure, or 3 consecutive readback
//     failures ⇒ the shipped static inks render exactly as before.
import * as THREE from 'three';

// scripted-boot detection — the ONE convention (main.js / scene/shading.js):
// bare ?obtool counts, ?obtool=0 opts out, sessionStorage carries the pin.
const SCRIPTED = (() => {
  try {
    const q = new URLSearchParams(location.search);
    const on = (k) => q.has(k) && q.get(k) !== '0';
    if (on('cinema') || on('obtool')) return true;
    if (q.get('obtool') === '0') return false;
    return sessionStorage.getItem('ob-scripted') === '1';
  } catch { return false; }
})();

// ---- GH-417 contrast-level ladder ------------------------------------------
// Four stepped solve profiles. EVERY number is DERIVED from the shipped
// standard row (the frozen round-3 W1 profile — issue GH-260, Drive pack
// preview-260r3-2026-07-30/data), never invented:
//   measured-WCAG anchors  1.5 / 3.0 / 4.5 / 7.0 — 3.0 is the shipped
//     SC 1.4.11 non-text guarantee; 4.5 / 7.0 are the WCAG 1.4.3 AA and
//     1.4.6 AAA text ratios (the defensible upward rungs); 1.5 is the
//     downward rung, re-derived in the fix round below (owner 2026-08-07;
//     it replaced the original 2.0 = 3.0 / 1.5 ladder step).
//   wcagPred = ceil((measured / 0.79) × 10) / 10 — the light-polarity inks
//     measure ~0.79x the luminance-scalar model on the worst calibrated
//     cell (round 1), so the PREDICTED solve target is the measured anchor
//     inverted through that model error, rounded UP at one decimal (the
//     conservative direction): 1.9 / 3.8 / 5.7 / 8.9. The standard row is
//     the shipped 3.8 BYTE-IDENTICALLY (3.0 / 0.79 = 3.797 → 3.8).
//   wcagGate = wcagPred − 0.2 — the shipped 3.8→3.6 polarity-vote slack
//     held constant across levels: it absorbs solve-clamp jitter in the
//     vote, it is not itself a contrast target.
//   wcagPredD = wcagPred — the shipped equality: the hued dark CEILING
//     targets the same predicted ratio as the light floor.
//   floorLc 15 / 60 / 75 / 90 — anchored at this module's own calibrated
//     pairing (measured-3.0 ↔ Lc 60, the GH-260 decision) and stepped
//     ±15 Lc per WCAG rung, the APCA readability-level spacing (the
//     bronze-table 3:1 / 4.5:1 / 7:1 equivalents sit 15 Lc apart) — for
//     the UPWARD rungs; the low rung takes the Lc-15 non-text tier
//     directly (fix round below: the linear ±15 extrapolation diverges
//     from the true Lc↔WCAG correspondence at the bottom of the curve).
//   marginLc +8 at every level — the round-3 ABSOLUTE model-error margin,
//     not a contrast target; scaling it would change the standard row.
//   feasVote — the non-default levels' polarity-vote feasibility fallback
//     (see the vote() note in solveStep): when the level's gate exceeds
//     what EITHER polarity can carry at a vertex-neighborhood, the binary
//     floor-pass bonus loses all discrimination and the chroma/departure
//     terms decide — measured 2026-08-06 on the shipped-default cell at
//     'maximum': 4/13 lines (the lamp-sheen crossers) latched the
//     display-CAPPED polarity and collapsed to measured WCAG 1.6–1.8,
//     under even the shipped 3.0 floor. The fallback grades the bonus by
//     the ACHIEVED predicted ratio instead. false at standard BY LAW: the
//     shipped both-fail semantics are part of the owner-approved round-3
//     profile and must stay byte-identical (the default-unchanged law).
//
// FIX ROUND (owner review 2026-08-07, issue GH-417):
//   low — 「low 的那个档位可以再降低一些」: re-anchored from 2.0 to
//     measured-WCAG 1.5 — deliberately BELOW SC 1.4.11 (a pure user
//     preference, like reduced-motion; the shipped default keeps the
//     guarantee). How low it can go is DERIVED, not tasted: the visibility
//     floor is APCA Lc 15, the documented minimum for discernible non-text
//     elements (the Lc < ~10 band is APCA's documented invisibility
//     point). Translated through the actual SAPC power curves at the
//     shipped felt backgrounds (arm-L receipts: bg display-Y ≈ 0.33–0.45
//     on the lit blue cell), the Lc-15 tier sits at measured-WCAG ≈ 1.4
//     (light polarity) / ≈ 1.6 (dark polarity) — 1.5 is that tier's
//     WCAG-space band, one conservative step above the light-side
//     crossing; anything under ~1.4 enters the invisibility band on the
//     bright cloth. floorLc 15 IS the tier itself (replacing the ±15/rung
//     extrapolation, which diverges from the true Lc↔WCAG correspondence
//     at the bottom of the curve and would over-deliver ≈ 2.6 measured);
//     with the +8 absolute margin it rides every light/neutral solve.
//     wcagPred = ceil((1.5 / 0.79) × 10) / 10 = 1.9 (chain law unchanged).
//     VISIBILITY LAW (two-axis; review fix-round r2): "functionally
//     visible" is Lc ≥ 15 OR displayed deltaE-OK vs the local background
//     ≥ 0.10 (2× the suites' 0.05 tellability bar) — the same philosophy
//     as the owner dual-polarity chroma rule: hued lines are seen by
//     COLOR as much as by luminance. This is not a solver knob but the
//     MEASURED per-line gate (e2e-aim arm L, both cloths): where the
//     display/tonemap model caps a line's deliverable luminance contrast
//     under the Lc tier (measured 2026-08-07: one vignette-corner light
//     line on the green cell delivered Lc 12.9 from a 23 request — the
//     0.79 light shortfall plus the falloff-model residual), the line
//     still measures deltaE-OK ≥ 0.2 against the felt (a vivid-orange
//     stroke on green cloth) — plainly visible by hue. Neutral-identity
//     lines carry ~zero chroma, so the deltaE route never masks a
//     luminance failure there: they must clear the Lc tier itself
//     (measured ≥ 23.1). Raising floorLc instead (15 → 20/25 swept) fed
//     the deep/neutral solves and made the whole tier LOUDER (blue cell
//     median 2.52 → 2.88+, one neutral line to 5.66) — the opposite of
//     the owner's ask; the two-axis law keeps the tier faint AND gated.
//   maximum — owner decision 最高档保色相: hue-preserving trade. The hued
//     (per-ball) lines give up contrast target rather than ball identity:
//     their solve is clamped into the IDENTITY BAND [hueYFloor, hueYCeil]
//     = the display-Y range where the sRGB gamut edge along the ball's own
//     hue still carries OKLCH chroma ≥ CID = 0.0647 — the raw chroma of
//     snooker brown 0x5d3a1e, the least-chromatic ball identity the game
//     asks players to recognize (this module's own measured "weakest hued
//     ball"). A line inside the band can always render at least as
//     colorful as a brown ball reads; outside it, no shipped hue can.
//     Derived crossings (bisected on this module's own okmath):
//       hueYFloor = 0.031 — the WORST dark-side crossing over the shipped
//         line-hue palette (WPA yellow 0xeeb200, 0.03041; rounded shallow,
//         the identity-conservative direction). UNIFORM by design: per-hue
//         floors would ride blue down to Y ≈ 0.004 where OKLab chroma is
//         known to overstate perceived color (gamut-edge navy at Y 0.004
//         reads black — exactly the collapse the owner rejected); the
//         uniform worst-hue floor sidesteps that failure mode and keeps
//         the fan's depth consistent across balls.
//       hueYCeil = 0.65 — the worst bright-side crossing (WPA blue
//         0x1b56ad, 0.65633; rounded down, conservative) — the near-white
//         mirror of the same collapse on dark felts.
//     Retrodiction receipt: the owner's own pack verdicts bracket the
//     boundary — high's delivered dark depth on the blue cell (≈ Y 0.029,
//     where yellow's edge chroma ≈ CID) read as identity-preserved, while
//     maximum's yMin slam (Y 0.004) read as collapsed; the derived floor
//     sits exactly at the verified-good edge. The request chain (7.0
//     anchor → 8.9 predicted, floorLc 90, feasVote) is UNCHANGED: hues
//     with band room still take it, and the NEUTRAL-identity lines (cue
//     ivory / 8-black — the deep path) are not clamped at all, because
//     their identity IS white/black: maximum keeps the full 7.0-anchor
//     slam there. Delivered hued contrast becomes min(request, band
//     ceiling) ≈ measured-WCAG 4–6 on the shipped cells (arm-L receipts) —
//     the highest hue-retaining contrast the display can carry, per cell.
//   hueYFloor/hueYCeil are additive fields: 0 / 1 = clamp disabled (exact
//     no-op guards in solveStep), so every pre-existing row's five solve
//     constants — the standard row above all — stay byte-identical.
// yMin/yMax (rung-ladder span), minC0 (hue classification) and chromaW
// (vote weights) are NOT contrast targets and stay level-independent.
// HISTORY (round-3 owner decision, preserved): the shipped constants are
// NOT tunable down — that law governs the DEFAULT, which is and stays the
// standard row byte-identically; GH-417 adds the user preference around it.
const CONTRAST_LEVELS = Object.freeze({
  low: Object.freeze({ floorLc: 15, marginLc: 8,
    wcagPred: 1.9, wcagGate: 1.7, wcagPredD: 1.9, feasVote: true,
    hueYFloor: 0, hueYCeil: 1 }),
  standard: Object.freeze({ floorLc: 60, marginLc: 8,
    wcagPred: 3.8, wcagGate: 3.6, wcagPredD: 3.8, feasVote: false,
    hueYFloor: 0, hueYCeil: 1 }),
  high: Object.freeze({ floorLc: 75, marginLc: 8,
    wcagPred: 5.7, wcagGate: 5.5, wcagPredD: 5.7, feasVote: true,
    hueYFloor: 0, hueYCeil: 1 }),
  maximum: Object.freeze({ floorLc: 90, marginLc: 8,
    wcagPred: 8.9, wcagGate: 8.7, wcagPredD: 8.9, feasVote: true,
    hueYFloor: 0.031, hueYCeil: 0.65 }),
});
const DEFAULT_CONTRAST = 'standard';
// settings.js persist() mirrors the panel value here (the preview.js
// 'ob.settings.assist' boot-read precedent: this leaf boots before
// settings.js runs); the ob:settings broadcast re-asserts it live.
const CONTRAST_KEY = 'ob.settings.assistContrast';

// Solve + stroke parameters — the round-3 W1 profile (issue GH-260, Drive
// pack preview-260r3-2026-07-30/data). The wcag*/Lc floors are the ACTIVE
// GH-417 contrast level's row (default = the shipped standard constants,
// byte-identical; see CONTRAST_LEVELS for the calibration/derivation).
const ST = {
  ...CONTRAST_LEVELS[DEFAULT_CONTRAST], // floorLc/marginLc/wcagPred/
                                        // wcagGate/wcagPredD/feasVote/
                                        // hueYFloor/hueYCeil (level-swapped)
  yMin: 0.004, yMax: 0.90,    // display-Y clamp = the rung ladder's span
  // hued/neutral split on RAW palette chroma (review round-5: the ivory-
  // mixed INK cannot classify — on camel the escalated blue ink's chroma
  // lands at 0.005, BELOW the cue/8 ivory band at 0.023). Measured raw
  // bands: neutrals (cue ivory 0xf3eedd / 8-black 0x191919) top out at
  // 0.0231; the weakest hued ball (snooker brown 0x5d3a1e) sits at
  // 0.0647 — ~2x margin both ways. On the ink-color FALLBACK (stale
  // preview.js without the userData seam) this threshold errs NEUTRAL —
  // luminance-only adaptation, never a wrong-hue gamut pump.
  minC0: 0.045,
  chromaW: 300,               // chroma weight vs the 1000 floor-pass bonus
};
// device-class stroke width (issue GH-285, owner build-14 report: 2 CSS px
// on a ~6-inch phone reads physically heavier than the same 2 px on a
// desktop monitor). Pointer class from the pure pointer:coarse register —
// the export.js effectiveKnobs / main.js touch-install precedent, NOT
// html.ob-touch (touch.js loads later; this leaf must not depend on it).
// Desktop keeps the round-2 2.0 px. Phone 1.0 px = the THINNEST swept
// width holding the owner floor (2026-07-31 sweep, phone full-DPR leg
// 852x393 DSF3, widths 1.0/1.25/1.5/1.75/2.0 x shipped-default + worst-6
// + boundary cells, gate A/B/M sampler): every cell median WCAG >= 4.38
// at 1.0 px (floor 3.0; the solver's floors are width-independent),
// identity 27/28 pairs. Owner capture sheet published (Drive
// preview-285-width-2026-07-31) — the floor decides the lower bound, the
// owner vetoes the look. RENDER-RATIO GUARD (external review 2026-07-31):
// that sweep ran the DPR-3 phone leg only, where the GH-263 composer
// ratio is 2 — 1.0 CSS px rasterizes as TWO device px and the AA-diluted
// stroke clears the floor. On a coarse-pointer DPR-1 device 1.0 CSS px is
// ONE device px, and the round-2 1-px measurement (WCAG capped ~2-3 at
// low coverage) applies verbatim — so the thin width ALSO requires
// composer ratio >= 2, TRACKED per hook frame against the live GH-263
// record (widthFor below; review round P2 — one-shot discovery could
// latch inside the offline-render export pin's ratio-1 window); until
// discovery SPEC errs THICK (2.0, the floor-safe direction — ribbons
// cannot draw before discovery anyway). Scripted boots pin the static
// path before any of this.
const COARSE = (() => {
  try { return window.matchMedia?.('(pointer: coarse)').matches === true; }
  catch { return false; }
})();
const widthFor = (ratio) => (COARSE && ratio >= 2 ? 1.0 : 2.0);
const SPEC = { widthCss: 2.0, alpha: 0.95, dashEps: 0.006 };
const AD = {
  ds: 16,                     // device px per background-grid cell
  tau: 0.2,                   // low-pass time constant [s]
  rungs: 26,                  // geometric luminance ladder yMin..yMax
  hyst: 0.6,                  // rungs of hysteresis before a step
  minHold: 0.25,              // [s] between applied-rung steps (±1/step)
  // polarity flip threshold — re-derived from the GH-284 at-rest score
  // measurements (2026-07-31, desktop DPR-2 shipped-default cell, 10 Hz x
  // 30 s): every non-oscillating line's smoothed other/current ratio stays
  // <= 0.928, while the self-feedback oscillation swings 0.08..6.5 and
  // genuine class differences measure >= 3.3 — 1.25 sits in the wide gap
  // (was 1.08, which the feedback swing crossed every ~1 s). The ratio can
  // NOT carry the at-rest guarantee alone (no finite threshold is outside
  // a 6.5x swing): that is polDwell's + the static-scene freeze's job.
  polLatch: 1.25,
  // GH-284 dwell floor: once a polarity commits (or fresh-latches), it
  // holds >= this long on the render clock — the measured at-rest flap
  // half-period is 0.84..1.36 s, so 6 s is >4x the worst measured cycle
  // (issue band 5-10 s). ABSOLUTE by measurement: the at-rest feedback
  // swing reaches 6.5x, so any "material change" ratio bypass would re-arm
  // the flap; the only bypass is a settings broadcast (stateReset =>
  // fresh latch + resetGrace, a material change by definition).
  polDwell: 6,
  // post-broadcast grace: lighting/equipment broadcasts settle
  // ASYNCHRONOUSLY (lightingvisuals scheduleRebake re-bakes the env
  // cubemap on a 120 ms debounce, gi gain follows) — the fresh latch can
  // land between the synchronous intensity write and the rebake, picking
  // the polarity of a background that is about to shift. For resetGrace
  // seconds after a stateReset the SHIPPED continuous-adaptation
  // semantics stay fully live (dwell suspended, sampling never stops,
  // the static freeze never latches), so the debounced polLatch flip can
  // correct the pick exactly as the owner-approved round-3 profile did;
  // at rest no broadcast arrives, so the grace never opens there.
  resetGrace: 3,
  // GH-284 static-scene freeze (solve-on-change): when the deterministic
  // render state is byte-identical for stillHold seconds, background
  // sampling stops (breaking the self-feedback loop — scores become pure
  // functions of the frozen buffer); after quietHold further seconds with
  // zero rung/polarity activity the solver freezes entirely, so a static
  // scene renders a byte-stable line. Any fingerprint change or ob:settings
  // broadcast resumes on the SAME frame.
  stillHold: 0.5,             // [s] fingerprint-stable before sampling stops
  quietHold: 0.25,            // [s] of zero output activity before full freeze
  // GH-1114 line law: a LINE-only fingerprint change (the aim moved the
  // preview lines / cue stick over an unchanged background) re-solves
  // against the cached background buffer instead of re-arming the readback
  // — in Chrome every resolve is a synchronous GPU round trip
  // (getBufferSubData blocks even after its fence signals; measured
  // 137-190 ms per call under load, one per 4 frames of an aim drag). Once
  // the lines have held still for lineSettleFrames hook frames AND
  // lineSettle seconds of render clock, ONE refresh window opens (stillHold
  // of live sampling, at least one readback kicked after it opened) — main's
  // re-sample of a still fingerprint, so the at-rest ink, the freeze and the
  // canonical-endpoint snap are solved exactly as before. The debounce keeps
  // SPARSE input from opening a window per gap: a slow drag delivers a
  // pointer event every few frames and key repeat runs at 10-30 Hz, and a
  // window opened on the first still frame would read back once per gap —
  // main's rate exactly where fine aiming needs smoothness. Both bounds
  // hold: frames alone are short on a fast display, time alone is one frame
  // on a storm-loaded page. A fresh line keeps the review r3 P1 law: it
  // votes only on a buffer kicked after the lines last moved (see the vote
  // in solveStep), never on the cache — so its seed follows the window.
  lineSettle: 0.1,            // [s] render clock the lines must hold still
  lineSettleFrames: 6,        // ...and hook frames (10 Hz key repeat = 6)
};

// ---- display-referred contrast math (sRGB bytes / display luminances) -----
const srgbChan = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** [apca-Y (0.022-lifted), plain WCAG relative luminance] of an sRGB byte
 * triple — the two tracks the dual-floor solve runs on. */
function byteY(r, g, b) {
  let y = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4
    + 0.0721750 * (b / 255) ** 2.4;
  if (y < 0.022) y += (0.022 - y) ** 1.414;
  return [y, 0.2126 * srgbChan(r) + 0.7152 * srgbChan(g) + 0.0722 * srgbChan(b)];
}
const clamp022 = (y) => (y < 0.022 ? y + (0.022 - y) ** 1.414 : y);
/** |APCA Lc| between two display luminances (SAPC power curves). */
function lcOf(Yt, Yb) {
  const t = clamp022(Yt), b = clamp022(Yb);
  const s = b >= t ? (b ** 0.56 - t ** 0.57) * 1.14
    : -((b ** 0.65 - t ** 0.62) * 1.14);
  return s < 0.1 ? 0 : (s - 0.027) * 100;
}
/** Display Y required for |Lc| >= floor+margin against bg apca-Y, both
 * polarities (dark = NaN when the Lc floor is unreachable downward). */
function solveInkY(Ybg) {
  const T = ((ST.floorLc + ST.marginLc) / 100 + 0.027) / 1.14;
  const light = (Ybg ** 0.65 + T) ** (1 / 0.62);
  const darkBase = Ybg ** 0.56 - T;
  return { light, dark: darkBase > 0 ? darkBase ** (1 / 0.57) : NaN };
}

// ---- OKLab machinery (round-3 okmath, validated offline) ------------------
// All rgb triples LINEAR sRGB 0..1. maxChromaLinAtY = the sRGB gamut-edge
// chroma a hue can carry at an exact linear luminance — the owner rule's
// "most colourful compliant direction" evaluator.
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function oklabFromLin(c) {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function linFromOk(L, C, h) {
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamutL = (c) => c[0] >= -1e-4 && c[0] <= 1.0001
  && c[1] >= -1e-4 && c[1] <= 1.0001 && c[2] >= -1e-4 && c[2] <= 1.0001;
function solveLForY(Y, C, h) {
  let lo = 0, hi = 1.4;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (lumOf(linFromOk(mid, C, h)) < Y) lo = mid; else hi = mid;
  }
  return linFromOk((lo + hi) / 2, C, h);
}
function maxChromaLinAtY(h, Y) {
  if (Y <= 1e-5) return { lin: [0, 0, 0], C: 0 };
  if (Y >= 0.9995) return { lin: [1, 1, 1], C: 0 };
  const feasible = (C) => {
    const lin = solveLForY(Y, C, h);
    return inGamutL(lin) && Math.abs(lumOf(lin) - Y) < 1e-3 ? lin : null;
  };
  let lo = 0, hi = 0.4;
  if (feasible(hi)) lo = hi;
  else {
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (feasible(mid)) lo = mid; else hi = mid;
    }
  }
  const lin = solveLForY(Y, lo, h);
  return { lin: [Math.max(0, Math.min(1, lin[0])), Math.max(0, Math.min(1, lin[1])),
    Math.max(0, Math.min(1, lin[2]))], C: lo };
}
// memo keyed on (domain, quantized hue, log-quantized Y: 48 steps/decade —
// ~2.4% Y resolution, far under the 26-rung ladder). Hue is IN the key
// (round-3 stale-hue law: practice-line materials are recolored per pose).
const chromaMemo = new Map();
function memoChroma(domain, h, Y) {
  const key = domain + Math.round(h * 100) + '_'
    + Math.round(Math.log(Math.max(1e-5, Y)) * 48);
  let v = chromaMemo.get(key);
  if (!v) { v = maxChromaLinAtY(h, Y); chromaMemo.set(key, v); }
  if (chromaMemo.size > 60000) chromaMemo.clear();
  return v;
}

// ---- app display-transform model: linear HDR → falloff → ACES(1.05) -------
// (main.js: toneMappingExposure 1.05 + ACESFilmicToneMapping, whose three.js
// implementation scales by exposure/0.6 before the RRT fit; the falloff pass
// is scene/postfx.js ExposureFalloffShader — strength read LIVE per frame,
// looks retune it.)
// EXPO is DELIBERATELY the 1.05 constant, not a live
// renderer.toneMappingExposure read (review 2026-07-30, reaffirmed): the
// tournament look runs exposure 0.85, and that mismatch IS the round-1-calibrated
// "light-polarity inks achieve ~0.79x the model" error the wcagPred 3.8
// margin absorbs (3.8 x 0.79 ≈ the 3.0 floor). The (EXPO const, margin)
// pair reproduces the round-3 measured, owner-approved W1 treatment;
// reading exposure live would require re-deriving the margin, which the
// owner froze ("not tunable down"). Look coverage is MEASURED, not
// promised (review 2026-07-31): tournament is the interactive boot default
// (766e49e9), so every GH-260 e2e-aim cell measures under exposure 0.85 —
// and the desktop leg PINS that exposure, so a default-look flip fails
// the gate loudly instead of silently changing what the arms measure; a
// dedicated ?look=green fresh-boot cell measures the 1.05 case (this
// model's exact EXPO). A future look must ship with its own floor cell.
const EXPO = 1.05;
const RRT = (v) => (v * (v + 0.0245786) - 0.000090537)
  / (v * (0.983729 * v + 0.4329510) + 0.238081);
function invRRT(y) {
  y = Math.min(y, 0.999);
  const A = 1 - 0.983729 * y, B = 0.0245786 - 0.4329510 * y,
    C = -(0.000090537 + 0.238081 * y);
  const d = Math.sqrt(Math.max(0, B * B - 4 * A * C));
  return (-B + d) / (2 * A);
}
function falloffAt(strength, u, v) {
  const dx = (u - 0.5) * 1.22, dy = v - 0.5;
  const d = Math.hypot(dx, dy);
  const t = Math.min(1, Math.max(0, (d - 0.52) / (1.18 - 0.52)));
  return 1 - strength * (t * t * (3 - 2 * t));
}
const fwdTone = (L, s, u, v) =>
  Math.max(0, Math.min(1, RRT(L * falloffAt(s, u, v) * EXPO / 0.6)));
const invTone = (y, s, u, v) =>
  invRRT(y) * 0.6 / (EXPO * Math.max(0.05, falloffAt(s, u, v)));

export function createPreviewInk({ machine, camera, lines }) {
  const status = { active: false, reason: SCRIPTED ? 'scripted-pin' : 'warming',
    staticFrozen: false, widthCss: SPEC.widthCss,
    bootEmbargo: false }; // GH-1244: the boot readback embargo holds
  // GH-442 zone-decal channel output (shared mutable record — consumers
  // read, never write). Inert ({active:false} forever) on every path that
  // never reaches the solve: scripted boots, degrade, warming — aim.js then
  // renders the static assist tone on the WASH and the shipped covering
  // power on the white boundary (the degrade law). lineA = the GH-417
  // level's covering power for the white boundary stroke; rgbFill = the
  // adaptive paper-wash carrier (linear RGB).
  const zoneOut = { active: false, level: '', pol: 'light', lineA: 0.85,
    rungFill: -1, yFill: 0, rgbFill: [1, 1, 1], predW: 0, lc: 0 };
  const api = {
    adaptiveInk: () => ({ ...status }),
    zoneDecal: () => zoneOut,
  };
  window.__aim = Object.assign(window.__aim ?? {}, api);
  if (SCRIPTED) return api; // static pin: no hook, no ribbons, no readbacks
                            // (and no contrast level — GH-417 stays inert
                            // here BY CONSTRUCTION: the boot read below is
                            // never reached, so a persisted level cannot
                            // leak into scripted registers; the GH-442
                            // zone channel is pinned inert the same way)

  // GH-417 contrast level — interactive boots only (after the scripted pin
  // above). Unknown/stale persisted values keep the shipped default (the
  // settings.js load path sanitizes loudly; this is the leaf's own guard).
  let contrastLevel = DEFAULT_CONTRAST;
  status.contrastLevel = contrastLevel;
  function applyContrastLevel(level) {
    const p = CONTRAST_LEVELS[level];
    if (!p || level === contrastLevel) return false;
    contrastLevel = level;
    Object.assign(ST, p);
    status.contrastLevel = level;
    return true;
  }
  try {
    const stored = localStorage.getItem(CONTRAST_KEY);
    if (stored) applyContrastLevel(stored);
  } catch { /* storage may be unavailable */ }

  let composer = null;      // lazily discovered (createPostFX runs later)
  let renderer = null;
  let dead = null;          // permanent-degrade reason (string) or null
  const degrade = (why) => {
    dead = why;
    status.active = false;
    status.reason = why;
    status.bootEmbargo = false; // GH-1244: a dead module embargoes nothing
    zoneOut.active = false; // GH-442: the decal degrades to the static tone
    setRibbons(false);
  };

  // ---- ribbons: one instanced quad-strip per core line, geometry slaved to
  // the core via onBeforeRender (positions/lineDistances/drawRange copied per
  // draw — every preview.js write path stays byte-untouched). Screen-space
  // width in CSS px (uRes = CSS size) so the stroke is DPR-invariant.
  const VERT = `
    precision highp float;
    attribute vec3 instanceStart; attribute vec3 instanceEnd;
    attribute float instanceDistStart; attribute float instanceDistEnd;
    attribute vec3 instanceColorStart; attribute vec3 instanceColorEnd;
    uniform vec2 uRes; uniform float uWidth;
    varying float vDist; varying vec3 vColor;
    void main() {
      mat4 mvp = projectionMatrix * modelViewMatrix;
      vec4 s = mvp * vec4(instanceStart, 1.0);
      vec4 e = mvp * vec4(instanceEnd, 1.0);
      float dS = instanceDistStart; float dE = instanceDistEnd;
      vec3 cS = instanceColorStart; vec3 cE = instanceColorEnd;
      // both endpoints behind the w=eps camera plane: nothing visible
      if (s.w < 0.001 && e.w < 0.001) { gl_Position = vec4(0.,0.,-2.,1.); vDist = 0.; vColor = vec3(0.); return; }
      // ONE endpoint behind (review 2026-07-31): clip-space TRIM to w=eps
      // instead of dropping the whole segment — the screen-space extrusion
      // below needs a finite s.xy/s.w, and the trimmed point stays ON the
      // segment so direction/dash-distance/color interpolate correctly;
      // hardware clipping handles the rest of the quad. (Static cores get
      // this from the fixed-function clipper; ribbons are the live carrier
      // and must not lose a segment the cores would draw.)
      if (s.w < 0.001) {
        float t = (0.001 - s.w) / (e.w - s.w);
        s = mix(s, e, t); dS = mix(dS, dE, t); cS = mix(cS, cE, t);
      } else if (e.w < 0.001) {
        float t = (0.001 - e.w) / (s.w - e.w);
        e = mix(e, s, t); dE = mix(dE, dS, t); cE = mix(cE, cS, t);
      }
      vec2 sPx = s.xy / s.w * uRes * 0.5;
      vec2 ePx = e.xy / e.w * uRes * 0.5;
      vec2 d = ePx - sPx;
      float len = max(length(d), 1e-6);
      vec2 dir = d / len;
      vec2 n = vec2(-dir.y, dir.x);
      vec4 clip = mix(s, e, position.x);
      vec2 offPx = n * (position.y * uWidth * 0.5)
                 + dir * ((position.x * 2.0 - 1.0) * uWidth * 0.5);
      clip.xy += offPx / (uRes * 0.5) * clip.w;
      vDist = mix(dS, dE, position.x);
      vColor = mix(cS, cE, clamp(position.x, 0.0, 1.0));
      gl_Position = clip;
    }`;
  const FRAG = `
    precision highp float;
    uniform float uOpacity; uniform float uMask;
    uniform float uDash; uniform float uDashSize; uniform float uTotalSize; uniform float uEps;
    varying float vDist; varying vec3 vColor;
    void main() {
      if (uDash > 0.5) {
        float m = mod(vDist, uTotalSize);
        if (m > uDashSize + uEps && m < uTotalSize - uEps) discard;
      }
      if (uMask > 0.5) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
      gl_FragColor = vec4(vColor, uOpacity);
    }`;
  const RB = [];
  const uRes = new THREE.Vector2(1, 1);
  for (const { obj: core, role } of lines) {
    const nPts = core.geometry.getAttribute('position').count;
    const posArr = new Float32Array(nPts * 3);
    const distArr = new Float32Array(nPts);
    const colArr = new Float32Array(nPts * 3).fill(1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [0, -1, 0, 0, 1, 0, 1, 1, 0, 1, -1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const ib = new THREE.InstancedInterleavedBuffer(posArr, 3, 1);
    ib.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    const ibd = new THREE.InstancedInterleavedBuffer(distArr, 1, 1);
    ibd.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceDistStart', new THREE.InterleavedBufferAttribute(ibd, 1, 0));
    geo.setAttribute('instanceDistEnd', new THREE.InterleavedBufferAttribute(ibd, 1, 1));
    const ibc = new THREE.InstancedInterleavedBuffer(colArr, 3, 1);
    ibc.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(ibc, 3, 0));
    geo.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(ibc, 3, 3));
    geo.instanceCount = 0;
    const dashed = !!core.material.isLineDashedMaterial;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uRes: { value: uRes }, uWidth: { value: SPEC.widthCss },
        uOpacity: { value: SPEC.alpha }, uMask: { value: 0 },
        uDash: { value: dashed ? 1 : 0 },
        uDashSize: { value: dashed ? core.material.dashSize : 1 },
        uTotalSize: { value: dashed ? core.material.dashSize + core.material.gapSize : 2 },
        uEps: { value: SPEC.dashEps },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    // geometry sync — called from the frame hook BEFORE composer.render,
    // NOT from onBeforeRender (review round-5 P2): three r170 uploads
    // attribute buffers during projectObject (render-list collection),
    // before any onBeforeRender fires, so a copy made there reaches the
    // GPU one frame late — with the cores draw-disabled that meant a blank
    // first activation frame and a one-frame-stale ribbon trajectory on
    // every aim drag. The hook precedes composer.render by the same
    // main.js contract the background sampler already relies on.
    const sync = () => {
      const p = core.geometry.getAttribute('position');
      posArr.set(p.array.subarray(0, nPts * 3));
      ib.needsUpdate = true;
      if (dashed) {
        const ld = core.geometry.getAttribute('lineDistance');
        if (ld) { distArr.set(ld.array.subarray(0, nPts)); ibd.needsUpdate = true; }
      }
      geo.instanceCount = Math.max(0, core.geometry.drawRange.count - 1);
    };
    core.add(mesh);
    RB.push({ core, role, mesh, mat, nPts, colArr, ibc, dashed, sync,
      // ball lines get the chroma rule; cue approach/post keep their
      // near-white GH-199 identity by ROLE (luminance-only adaptation)
      hueRole: role === 'stub' || role === 'practice' });
  }
  let ribbonsOn = false;
  function setRibbons(on) {
    if (ribbonsOn === on) return;
    ribbonsOn = on;
    for (const r of RB) {
      r.mesh.visible = on;
      r.core.material.visible = !on;
    }
  }

  // ---- pre-line background pass: OutputPass(writeBuffer → small RT), then
  // an async PBO readback double-buffered so the solve always reads a fully
  // resolved frame (1–2 frame latency, absorbed by the hysteresis).
  // gen versions the readbacks (review P2 x2): a state reset (settings
  // discontinuity / hidden period) or an RT re-alloc (resize, rotation)
  // bumps it, invalidating the front buffer AND any in-flight resolve —
  // the solver then waits for a post-discontinuity frame instead of
  // re-latching from the previous scene's pixels.
  // cool = frames to SKIP kicking after an invalidation (review round 3):
  // this hook runs BEFORE composer.render, so the first post-reset kick
  // would still sample the PRE-change frame; two frames lets the settings
  // apply + render land before a new-generation readback is accepted.
  // pending = the ONE in-flight owned readback { gl, pbo, sync, bi, gw, gh,
  // devW, devH, gen, epoch } or null (GH-320: replaces the old inFlight
  // boolean around three's readRenderTargetPixelsAsync — see kickReadback).
  const SMP = { rt: null, buf: [null, null], front: -1, pending: null,
    fails: 0, gw: 0, gh: 0, devW: 0, devH: 0, gen: 0, cool: 0,
    // GH-284 signature epochs (review round-8 P2): epoch bumps on every
    // fingerprint change; frontEpoch is the epoch the front buffer's
    // readback was KICKED under. The freeze requires frontEpoch to catch
    // up, so a slow PBO in flight across a camera nudge can never latch
    // ribbons solved against the pre-nudge view.
    // lastEpoch = the epoch at the END of the previous hook frame — the
    // epoch whose scene actually PRODUCED composer.writeBuffer (the hook
    // precedes composer.render, so a kick on the change frame still reads
    // the pre-change render; review round-9 P2: stamping it with the new
    // epoch let a slow readback satisfy the gate with stale pixels).
    epoch: 0, frontEpoch: -1, lastEpoch: 0,
    // GH-496: consecutive-resolve byte-equality run length — the boot
    // latch gate's measured-settle meter (see pollReadback)
    stableRuns: 0,
    // GH-1114: readback sequence numbers — kicks issued and the kick seq of
    // the current front buffer (the line refresh window waits for a front
    // kicked after it opened) — and hook-frame stamps: the frame counter,
    // and the frame the front was kicked in (a fresh vote needs a front
    // kicked after the lines' last change, FRZ.lineFrame)
    kicks: 0, frontKick: 0, frame: 0, frontFrame: -1 };
  function sampleStep() {
    // review P1 (2026-07-30): the post-falloff pre-tonemap HDR lives in
    // composer.WRITEBUFFER at end-of-frame, not readBuffer — the falloff
    // ShaderPass swap leaves its output in readBuffer, but the OutputPass
    // (Pass-default needsSwap) swaps AGAIN after rendering to screen, so
    // the normal frame loop ends rb = pre-falloff bloom output / wb =
    // post-falloff. (The accumulator's readBuffer note in postfx.js holds
    // only because it DISABLES the OutputPass — one swap, not two.)
    // Sampling rb omitted the falloff and solved edge-region lines against
    // a brighter background than displayed.
    const rb = composer.writeBuffer;
    const output = composer.__obCine?.output;
    if (!rb || !rb.width || !output) return;
    const gw = Math.max(8, Math.round(rb.width / AD.ds));
    const gh = Math.max(8, Math.round(rb.height / AD.ds));
    if (!SMP.rt || SMP.rt.width !== gw || SMP.rt.height !== gh) {
      SMP.rt?.dispose();
      SMP.rt = new THREE.WebGLRenderTarget(gw, gh, { depthBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      SMP.gen++;      // resize: drop the old-size front + in-flight reads
      SMP.front = -1;
      SMP.cool = 2;
    }
    if (SMP.cool > 0) { SMP.cool--; return; } // pre-change frame: don't sample
    try {
      const rts = output.renderToScreen;
      output.renderToScreen = false;
      output.render(renderer, SMP.rt, rb); // post-tonemap sRGB bytes
      output.renderToScreen = rts;
      renderer.setRenderTarget(null);
      if (!SMP.pending) kickReadback(gw, gh, rb.width, rb.height);
    } catch {
      renderer.setRenderTarget(null);
      degrade('sampler-failed');
    }
  }
  // ---- GH-320 OWNED async readback (fence + PBO). Replaces three's
  // readRenderTargetPixelsAsync: the vendor helper's probe loop calls
  // clientWaitSync inside a bare setTimeout with whatever fenceSync
  // returned — on a context lost mid-PLAYBACK (the owner's iOS class,
  // discovered only at the first post-close kick because the hook
  // early-returns while the cores are hidden) WebKit's fenceSync returns
  // null and its clientWaitSync binding throws the GH-320 TypeError inside
  // that timer, uncatchable from here, with the vendor promise permanently
  // unsettled — the old inFlight latch wedged true and the sampler never
  // re-armed. Chrome's fenceSync hands back a dead-context WebGLSync
  // instead and clientWaitSync answers WAIT_FAILED, so three frames of
  // rejections tripped the PERMANENT 'readback-failed' degrade — same
  // no-recovery outcome, no console error. Owning the loop closes both:
  // no kick on a lost context, the sync handle AND its owning context
  // validated before EVERY clientWaitSync, every GL touch try/caught, and
  // fails count only on a LIVE context (a loss window can never poison the
  // permanent-degrade counter). Resolution rides the frame hook (one poll
  // per frame ≈ the vendor's 4 ms timer at the readback sizes here, well
  // inside the hysteresis' 1–2 frame latency absorption).
  function kickReadback(gw, gh, devW, devH) {
    const gl = renderer.getContext?.();
    if (!gl || gl.isContextLost() || typeof WebGLSync === 'undefined') return;
    const bi = SMP.front === 0 ? 1 : 0;
    if (!SMP.buf[bi] || SMP.buf[bi].length !== gw * gh * 4) {
      SMP.buf[bi] = new Uint8Array(gw * gh * 4);
    }
    let pbo = null, sync = null;
    try {
      renderer.setRenderTarget(SMP.rt); // public-API FBO bind (state-managed)
      pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, SMP.buf[bi].byteLength, gl.STREAM_READ);
      gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    } catch { sync = null; }
    // deterministic PIXEL_PACK unbind, throw paths included (GH-320 scope
    // extension: the vendor readback left the pack buffer bound across its
    // whole in-flight await window, so export.js probeMachineFactor's
    // synchronous 1-px readPixels burst INVALID_OPERATION — 'PIXEL_PACK
    // buffer should not be bound' — at every export-dialog open while a
    // readback was in flight, 11 entries per open. NOTHING may leave this
    // block with PIXEL_PACK bound.)
    try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } catch { /* lost */ }
    try { renderer.setRenderTarget(null); } catch { /* lost mid-kick */ }
    if (!sync) {
      // null fence = the context died inside this task (WebKit's lost-
      // context shape) or a GL throw. Clean up only on a LIVE context —
      // a lost context already owns its objects' lifetime.
      if (pbo && !gl.isContextLost()) {
        try { gl.deleteBuffer(pbo); } catch { /* raced loss */ }
        if (++SMP.fails >= 3) degrade('readback-failed');
      }
      return;
    }
    SMP.pending = { gl, pbo, sync, bi, gw, gh, devW, devH,
      gen: SMP.gen, epoch: SMP.lastEpoch, seq: ++SMP.kicks, frame: SMP.frame };
  }
  /** Frame-hook poll of the pending readback. Validation-first: the GH-320
   * law is that NOTHING reaches clientWaitSync unless the handle is a live
   * WebGLSync belonging to the CURRENT context — anything else abandons the
   * readback silently (the objects died with their context; deleting them
   * there is itself invalid). */
  function pollReadback() {
    const p = SMP.pending;
    if (!p) return;
    const gl = renderer.getContext?.();
    if (!gl || gl !== p.gl || gl.isContextLost()
      || typeof WebGLSync === 'undefined' || !(p.sync instanceof WebGLSync)) {
      SMP.pending = null; // stale handle: abandon, never touch GL
      return;
    }
    let st = null;
    try { st = gl.clientWaitSync(p.sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0); }
    catch { st = null; }
    if (st === gl.TIMEOUT_EXPIRED) return; // GPU still resolving: next frame
    SMP.pending = null;
    let ok = false;
    if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED) {
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, p.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, SMP.buf[p.bi]);
        ok = true;
      } catch { ok = false; }
      // deterministic unbind, throw path included (the export-dialog
      // readPixels interlock — see kickReadback's PIXEL_PACK note)
      try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } catch { /* lost */ }
    }
    try { gl.deleteSync(p.sync); } catch { /* raced loss */ }
    try { gl.deleteBuffer(p.pbo); } catch { /* raced loss */ }
    if (!ok) { // WAIT_FAILED or a live-context throw
      if (++SMP.fails >= 3) degrade('readback-failed');
      return;
    }
    SMP.fails = 0;
    if (p.gen !== SMP.gen) return; // pre-discontinuity data: discard
    SMP.front = p.bi; SMP.gw = p.gw; SMP.gh = p.gh;
    SMP.devW = p.devW; SMP.devH = p.devH;
    SMP.frontEpoch = p.epoch;
    SMP.frontKick = p.seq;
    SMP.frontFrame = p.frame;
    // GH-496: pre-latch buffer-stability meter — the boot latch gate
    // requires the SCENE measurably settled (3 consecutive resolves
    // byte-equal), not merely the render-state fingerprint still: the
    // boot light-up (env bake, gi gain follow, texture decodes) paints
    // with no fingerprint change, and no fixed grace can bound a
    // storm-held leg's settle tail (measured: a 1-LSB gi tail outlived
    // the 3 s window and forked one boot's stub ink). Double-buffered
    // resolves alternate bi, so buf[1-bi] holds the PREVIOUS resolve;
    // a gen bump / resize compares unequal and simply re-arms — the
    // meter can only DELAY the first latch, never corrupt a solve.
    if (!bootLatched) {
      // review r2 P2: a resolve KICKED under a previous epoch is evidence
      // of a change in flight, never settle evidence — reset, count only
      // current-epoch pairs (the gate below also refuses to open until
      // the front buffer itself is current-epoch).
      if (p.epoch !== SMP.epoch) {
        SMP.stableRuns = 0;
      } else {
        const a = SMP.buf[p.bi], b = SMP.buf[p.bi === 0 ? 1 : 0];
        let eq = !!b && a.length === b.length;
        if (eq) {
          for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) { eq = false; break; }
          }
        }
        SMP.stableRuns = eq ? SMP.stableRuns + 1 : 0;
      }
    }
  }
  /** Abandon the in-flight readback on a surface transition. live=true
   * additionally unbinds PIXEL_PACK and deletes the GL objects — the
   * composer-swap class, where the context is still current and owns them;
   * a LOST context owns its objects' lifetime, so live=false only drops
   * the reference (deleting there is itself an invalid call). */
  function dropPending(live) {
    const p = SMP.pending;
    SMP.pending = null;
    if (!p || !live) return;
    const gl = renderer?.getContext?.();
    if (!gl || gl !== p.gl || gl.isContextLost()) return;
    try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } catch { /* raced */ }
    try { gl.deleteSync(p.sync); } catch { /* raced */ }
    try { gl.deleteBuffer(p.pbo); } catch { /* raced */ }
  }
  /** [apcaY, wcagY] of the front buffer at grid (gx, gy — top-down). */
  function texY(gx, gy) {
    const buf = SMP.buf[SMP.front];
    gx = Math.max(0, Math.min(SMP.gw - 1, Math.round(gx)));
    gy = Math.max(0, Math.min(SMP.gh - 1, Math.round(gy)));
    const o = ((SMP.gh - 1 - gy) * SMP.gw + gx) * 4; // readPixels rows are bottom-up
    return byteY(buf[o], buf[o + 1], buf[o + 2]);
  }

  // ---- frame hook (ADDITIVE registration from this module's create* entry;
  // OWNERSHIP rule 2). Runs BEFORE main.js composer.render — see header.
  let frozen = false;
  let solveStep = () => {}; // assigned below (temporal layer)
  let zoneStep = () => {};  // assigned below (GH-442 zone-decal channel)
  let quietFrame = false;   // last solveStep produced zero output activity
  // GH-284 static-scene freeze (solve-on-change; owner build-14 report:
  // lines flapped dark<->light AT REST). Measured (2026-07-31, desktop
  // DPR-2 shipped-default cell): the at-rest background point-samples are
  // BYTE-STABLE over 30 s — the flap's food is the ribbon's OWN rendered
  // pixels contaminating its 1-frame-stale background samples through the
  // device/16 grid (self-feedback), flipping one borderline practice line
  // every 0.84..1.36 s. The kill: fingerprint the DETERMINISTIC render
  // state (camera matrices, per-line geometry versions/drawRange, material
  // + raw-palette hexes, visibility, falloff strength, CSS size, sampler
  // generation — NEVER the sampled background, which IS the feedback
  // channel, and never wall time); when it is byte-identical for stillHold
  // seconds, stop sampling (the frozen buffer breaks the loop: scores
  // become pure functions of a constant), and after quietHold further
  // seconds of zero output activity freeze the solver entirely — a static
  // scene renders a byte-stable line. Any fingerprint change or ANY
  // ob:settings broadcast (broader than stateReset's 5 keys by design)
  // resumes on the same frame WITHOUT invalidating SMP.front: the
  // 1-2-frame-stale background self-heals through the normal async
  // readback, while an invalidation would flash the static cores on every
  // camera nudge. Preview-line geometry versions are the ball/cue-pose
  // proxy: any ball or aim change in AIM recomputes the preview buffers,
  // and ball motion outside AIM hides the lines (the anyVisible branch).
  // GH-1114 split: renderSig() returns the BACKGROUND fingerprint (sig);
  // the aim-driven inputs — per-line geometry/draw range/inks and the cue
  // stick pose — form lineSigNow. A cue-ball MOVE stays background: the
  // approach line's first vertex (the cue ball center, invariant to aim)
  // rides the background sig. See AD for the GH-1114 line law.
  const FRZ = { sig: '', still: 0, quiet: 0, on: false, dirty: false,
    envSig: '', // GH-496 review r3 P2: last seen resource/env sub-sig
    // GH-1114: last line sig, the hook frame it last changed in, a line
    // change pending its refresh, render-clock seconds and hook frames the
    // lines have held still, the refresh window clock (-1 = none), the kick
    // seq the window must see land, "window open" this frame, and a fresh
    // line's 1 s escape asking for one readback
    lineSig: '', lineFrame: -1, linePend: false, lineStill: 0, lineFrames: 0,
    refresh: -1, refreshSeq: 0, refreshing: false, escWant: false };
  let envSigNow = ''; // set by every renderSig() call
  let lineSigNow = ''; // GH-1114: set by every renderSig() call
  window.addEventListener('ob:settings', () => { FRZ.dirty = true; });
  function renderSig() {
    const e = camera.matrixWorld.elements, p = camera.projectionMatrix.elements;
    let s = uRes.x + ',' + uRes.y + ',' + SMP.gen + ','
      + (falloffU ? falloffU.value : 'f');
    // async scene-dressing applies (review round-2 P1): gi.load()/setLook/
    // setFixture complete SECONDS after boot on a cold cache and the
    // lightingvisuals leaf lands its persisted boot apply after its dynamic
    // import — both change lightmaps/lights/materials without a broadcast.
    // Their completion signals are deterministic module state, not sampled
    // pixels: gi appliedSeq/ready (bumped on every COMPLETED apply) and the
    // __lighting seam's state. Feature-detected — absent modules pin 'x'.
    // general async-resource arrival signal (review round-5 P2: the cloth
    // close-up detail normal — table.js TextureLoader — lands after boot
    // and changes rendered felt with no other observable): a texture,
    // geometry, or shader program starting to render bumps these renderer
    // counters — deterministic module state, never sampled pixels.
    const inf = renderer.info;
    // GH-496 review r3 P2: the RESOURCE/ENV segment is captured separately
    // (envSigNow) — the boot-window polarity re-seed keys on IT alone, so
    // interactive churn (camera, aim geometry) keeps the shipped
    // ratio/debounce/dwell protections while a late resource completion
    // (gi apply, texture decode, lighting apply) still re-seeds.
    let env = inf.memory.textures + ',' + inf.memory.geometries + ','
      + (inf.programs?.length ?? 0);
    s += '|' + env;
    const gis = window.__gi?.state;
    env += '|' + (gis ? gis.appliedSeq + ',' + gis.ready : 'x');
    s += '|' + (gis ? gis.appliedSeq + ',' + gis.ready : 'x');
    const ls = window.__lighting?.state?.();
    env += '|' + (ls ? ls.fixture + ',' + ls.brightness + ',' + ls.look + ','
      + ls.touched : 'x');
    s += '|' + (ls ? ls.fixture + ',' + ls.brightness + ',' + ls.look + ','
      + ls.touched : 'x');
    envSigNow = env;
    // scene-only AIM mutations (review round-4 P2): pocket nomination /
    // call-ball / safety repaint the pocket discs and target rings
    // (aim.js paintCallScene) and the playground snap overlay toggles,
    // all WITHOUT a broadcast or a preview-geometry bump — read the
    // PAINTED state off the aim.js QA surfaces (feature-detected; a
    // stale aim.js pins 'x'). A mid-drag ball's own pixels stay outside
    // the fingerprint until the drop's layout recompute — bounded and
    // self-healing (see OWNERSHIP note).
    const A = window.__aim;
    const pm = A?.pocketMarks?.();
    s += '|' + (pm ? pm.map((m) => m.nominated + ',' + m.visible + ','
      + m.ink + ',' + m.opacity).join(';') : 'x');
    const ri = A?.ringInks?.();
    s += '|' + (ri ? ri.map((r) => r.ink + ',' + r.opacity).join(';') : 'x');
    const so = A?.snapOverlay?.();
    s += '|' + (so ? so.visible + ',' + so.x + ',' + so.y + ',' + so.ink : 'x');
    // drag lift (review round-7 P2): a playground ball released after a
    // stationary mid-air hold animates only mesh.position.y + shadow
    // uniforms (no broadcast, no x/z preview recompute) — the lift state
    // (with its per-frame y through the drop) keeps the solver live until
    // the ball lands, and the lift's end is the final sig change that
    // re-solves against the landed frame.
    const dl = A?.dragLift?.state?.();
    s += '|' + (dl ? dl.id + ',' + dl.phase + ',' + dl.y : 'x');
    // cue-stick pose (review round-8 P2): releasing a power drag resets
    // strokePull and poseCue() advances the cue ~7 cm + relaxes the flex
    // with NO broadcast and no preview-geometry change — tipWorld (the
    // group origin) + the flex state are the deterministic pose truth.
    // GH-1114: the pose follows the aim, so it rides the LINE sig.
    const tw = A?.tipWorld?.();
    let ln = tw ? tw[0] + ',' + tw[1] + ',' + tw[2] : 'x';
    const cf = A?.cueFlex?.();
    ln += '|' + (cf ? cf.bow + ',' + cf.ringT + ',' + cf.ringA + ','
      + cf.rail + ',' + cf.railS + ',' + cf.idle : 'x');
    // GH-442 objective-zone decal: a zone change repaints cloth pixels with
    // no broadcast and no preview-geometry bump — the zone KEY + visibility
    // are deterministic INPUTS and join the sig. The decal's applied ink
    // and fade are OUTPUTS of this module's own solve and stay OUT (the
    // header law above: never fingerprint the feedback channel — measured
    // 2026-08-08: with the ink in the sig, every rung step reset the
    // stillness clock, sampling never stopped, and the fill->background->
    // boundary feedback cycled ~15 s before converging; with it out, the
    // freeze breaks the loop exactly as it does for the ribbons' colArr).
    const rd = A?.restDecal?.();
    s += '|' + (rd ? rd.key + ',' + rd.visible : 'x');
    for (let i = 0; i < 16; i++) s += ',' + e[i];
    for (let i = 0; i < 16; i++) s += ',' + p[i];
    for (const r of RB) {
      if (!r.core.visible) { ln += '|h'; continue; }
      const pos = r.core.geometry.getAttribute('position');
      ln += '|' + pos.version
        + ':' + r.core.geometry.drawRange.count
        + ':' + r.core.material.color.getHex()
        + ':' + (r.core.userData?.obBallHex ?? 'n');
      // GH-1114: the cue ball's own position (the approach path starts at
      // its center whatever the aim) — a ball move repaints the background
      if (r.role === 'cueApproach') {
        s += '|' + pos.getX(0) + ',' + pos.getY(0) + ',' + pos.getZ(0);
      }
    }
    lineSigNow = ln;
    return s;
  }
  // GH-320 context lifecycle: the canvas events are the authoritative
  // loss/restore edges (the per-frame isContextLost() gate below covers the
  // same-frame window before the event task runs). Bound per canvas, once —
  // a composer swap re-runs discovery against the new renderer's canvas.
  const ctxBound = new WeakSet();
  function bindContextEvents(cv) {
    if (!cv || ctxBound.has(cv)) return;
    ctxBound.add(cv);
    cv.addEventListener('webglcontextlost', () => {
      SMP.pending = null; // in-flight objects died with the context
      SMP.gen++;          // the front buffer predates the loss
      SMP.front = -1;
    });
    cv.addEventListener('webglcontextrestored', () => {
      // the sampler RT's GL side died with the old context generation —
      // drop it so the next sampleStep re-allocates (gen bump + cool ride
      // along in the re-alloc branch); loss-window state must not poison
      // the re-arm.
      SMP.rt?.dispose();
      SMP.rt = null;
      SMP.pending = null;
      SMP.fails = 0;
      SMP.front = -1;
    });
  }
  // OB-INK-EMBARGO:BEGIN — GH-1244 boot readback embargo. Every resolve is
  // a synchronous GPU-process round trip in Chrome (the GH-1114 note in AD),
  // and GH-496's pre-latch gate samples on every hook frame, so the boot
  // hold resolved readbacks right through the boot overlay's fade and the
  // hall glide that starts with it (traced: a 1.69 s frame 52 ms after the
  // fade began, on a cold boot). From the first hook frame that sees #ob-boot
  // carry ob-boot--out, or sees the node gone after it was seen (reduced
  // motion removes it at once), no readback is kicked or resolved until the
  // node has been gone for goneFrames hook frames AND settle seconds of
  // render clock have passed after that frame (the hall glide shell.js
  // starts at the fade is <= 1.0 s, shellmover.js), or cap seconds in any
  // case (a fade whose removal is never seen). The clock is the embargo's
  // own sum of the hook's dt, not tClock, which stands still on warming
  // frames and would never let it end. The DOM state is the signal,
  // as for shell.js's overlay hand-off (shell.md pins the class and the 900
  // ms belt). No #ob-boot at the first hook frame (a stale app.html, a late
  // module) keeps the old behaviour. Entering drops the in-flight readback
  // without a round trip; leaving re-arms GH-496's settle meter and its cap,
  // so the first latch reads a post-embargo buffer. Hook frames and the
  // render clock only, never wall time. web/tools/test-ink-embargo.mjs runs
  // this block on a virtual frame clock: keep it self-contained.
  const EMB_LAW = { goneFrames: 6, settle: 1.0, cap: 3.0 };
  const EMB = { done: false, on: false, seen: false, t: 0, gone: 0 };
  function embargoStep(dtc) {
    if (EMB.done) return false;
    let el = null;
    try { el = document.getElementById('ob-boot'); } catch { el = null; }
    if (!EMB.on) {
      if (el) {
        EMB.seen = true;
        let out = false;
        try { out = el.classList.contains('ob-boot--out'); } catch { out = false; }
        if (!out) return false; // behind the opaque field: sample as before
      } else if (!EMB.seen) {
        EMB.done = true; // no overlay at the first hook frame: no embargo
        return false;
      }
      EMB.on = true;
      EMB.t = 0; // from the next hook frame: this frame's dt passed before the class was seen
      EMB.gone = el ? 0 : 1;
      dropPending(true);
      status.bootEmbargo = true;
      return true;
    }
    EMB.t += dtc;
    EMB.gone = el ? 0 : EMB.gone + 1;
    if ((EMB.gone >= EMB_LAW.goneFrames && EMB.t >= EMB_LAW.settle)
      || EMB.t >= EMB_LAW.cap) {
      EMB.on = false;
      EMB.done = true;
      status.bootEmbargo = false;
      if (!bootLatched) {
        SMP.stableRuns = 0;
        bootCapAt = Math.max(bootCapAt, tClock + 8);
      }
      return false;
    }
    return true;
  }
  // OB-INK-EMBARGO:END
  machine.on('frame', (t, dt) => {
    if (dead || frozen) return;
    // composer SWAP (GH-320: the playback/GH-314 pipeline-churn class): a
    // REPLACED __dbg.composer means every latched seam — renderer, falloff
    // uniform, the in-flight readback and the sampler RT — belongs to the
    // dead pipeline. Abandon them and rediscover below on the same frame.
    // (A composer that merely DISAPPEARS keeps the latch: feature-detect
    // once, per the cache-poison contract.)
    const cNow = window.__dbg?.composer;
    if (composer && cNow && cNow !== composer) {
      dropPending(true); // live context: unbind + delete the GL objects
      SMP.rt?.dispose();
      SMP.rt = null;
      SMP.front = -1;
      SMP.gen++;
      SMP.fails = 0;
      falloffU = null;
      composer = null;
      renderer = null;
    }
    if (!composer) {
      composer = cNow ?? null;
      if (!composer) return; // pre-postfx boot frames: keep the static path
      renderer = composer.__obCine?.renderer ?? null;
      if (!renderer?.capabilities?.isWebGL2
        || typeof renderer.getContext !== 'function'
        || typeof WebGLSync === 'undefined') {
        degrade('no-webgl2-readback');
        return;
      }
      renderer.getSize(uRes); // CSS size: the stroke width unit
      bindContextEvents(renderer.domElement);
    }
    SMP.frame++; // GH-1114: the hook-frame stamp (kicks, fronts, line changes)
    // dt is the frame-hook clock increment (main.js clamps it to 0.1 s);
    // guard NaN/0 so a degenerate manual emit cannot stall the low-pass.
    const dtc = Math.min(0.1, Math.max(0.001, dt || 1 / 60));
    const embargo = embargoStep(dtc); // GH-1244: no kick, no resolve
    if (!embargo) pollReadback(); // in-flight fence resolution rides the hook clock
    // GH-285 ratio-aware width: composer.__obCine.pixelRatio is the
    // GH-263 render-scale law's truthful record (min(dpr,2) interactive,
    // 1 scripted; kept current by the wrapped setPixelRatio); ?? 1 errs
    // THICK on a cache-poisoned seam. TRACKED per hook frame like uRes,
    // not one-shot at discovery (review round P2): a delayed module import
    // could otherwise discover the composer inside renderTimeline's
    // export pin (ratio 1, GH-263 WYSIWYG) and latch the desktop 2.0 on a
    // coarse phone for the whole session. The pin window runs with the
    // preview lines hidden (PLAYBACK), so a transient flip there is
    // invisible and self-heals with the export's finally-restore.
    const wNow = widthFor(composer.__obCine?.pixelRatio ?? 1);
    if (wNow !== SPEC.widthCss) {
      SPEC.widthCss = wNow;
      status.widthCss = wNow;
      for (const r of RB) r.mat.uniforms.uWidth.value = wNow;
    }
    // GH-320 context-validity gate: while the GL context is lost the layer
    // DEGRADES to the static cores (the documented degrade law) instead of
    // kicking readbacks that can only wedge or throw — NOT a permanent
    // degrade: the restore event re-arms the sampler and the ribbons
    // resume once a current-generation readback lands. Clocks keep aging
    // (the dwell law); temporal state drops exactly like the hidden branch
    // so the post-restore re-latch is fresh, not a walk through the
    // discontinuity.
    const glNow = renderer.getContext();
    if (!glNow || glNow.isContextLost()) {
      SMP.pending = null;
      setRibbons(false);
      status.active = false;
      status.reason = 'context-lost';
      zoneOut.active = false; // decal: static tone through the loss window
      if (lineState.size) stateReset(false);
      tClock += dtc;
      FRZ.sig = ''; FRZ.still = 0; FRZ.quiet = 0;
      FRZ.lineSig = ''; FRZ.linePend = false; FRZ.refresh = -1;
      if (FRZ.on) { FRZ.on = false; status.staticFrozen = false; }
      return;
    }
    const anyVisible = RB.some((r) => r.core.visible);
    // GH-442 (review r1 P1): with Aim assist 'off' preview.js hides every
    // core even at ADDRESS, so the hidden-branch return would starve the
    // zone channel and pin the decal on its static fallback — the GH-417
    // level would silently stop applying for assist-off players. A live
    // zone at address keeps the full sample+solve path instead (solveStep
    // no-ops over hidden cores; renderSig pins them '|h'); PLAYBACK and
    // SIMULATING still take the hidden branch — the latch law: the decal
    // holds its solved carrier through the shot, never re-solving against
    // balls rolling over its anchors.
    const zoneLive = !anyVisible && machine.is('AIM', 'BALL_IN_HAND')
      && (() => {
        try {
          const zst = window.__aim?.zoneDecalState?.();
          return !!(zst?.on && zst.pts?.length >= 6);
        } catch { return false; }
      })();
    if (!anyVisible && !zoneLive) {
      // GH-442 review r3 P2: an assist-off ADDRESS frame with no live zone
      // is a RESOLUTION GAP, not a shot window — clear the zone latch here
      // so the next attempt (same-key papers: bu-f2/f3/f4 re-lay identical
      // zones) gets its fresh-latch polarity decision, exactly as the
      // assist-on path does through zoneStep's no-zone reset. The
      // PLAYBACK/SIMULATING hidden windows keep the latch (the shot-latch
      // law): machine.is gates the reset to address states only.
      if (ZC.key !== '' && machine.is('AIM', 'BALL_IN_HAND')) zcReset();
      // PLAYBACK etc.: cores hidden, nothing to solve. Drop the temporal
      // state (review P2, 2026-07-30): after a shot the same line objects
      // come back with a NEW trajectory, so smoothed/applied rungs from the
      // previous pose are colors solved at unrelated screen positions —
      // re-latch fresh on the next visible frame instead of walking.
      // openGrace=false (review round-2 P1): no async settle pends here.
      if (lineState.size) stateReset(false);
      // ...and EXPIRE any open settings grace, ON THE TRANSITION ONLY
      // (review round-3 P1 + round-4 P1): tClock pauses while hidden, so a
      // broadcast <3 render-seconds before the shot would otherwise carry
      // its remaining grace across the whole playback and hand the AIM
      // re-entry a dwell-and-freeze-free window — by settle time every
      // async rebake has long landed. But a broadcast DURING the hidden
      // period must KEEP its grace (its async settle may still be landing
      // when the lines reappear), so only the first hidden frame (FRZ.sig
      // still non-empty) expires; later hidden frames leave resetAt alone.
      if (FRZ.sig !== '') resetAt = -1e9;
      // ...and the render clock AGES through the hidden period (review
      // round-5 P2): without this, a broadcast fired mid-playback would
      // grant its FULL grace on an AIM re-entry minutes later (tClock
      // frozen ⇒ the grace never ages) — dwell+freeze disabled long after
      // every async settle finished. lineState was cleared above, so no
      // per-line hold reads a hidden-time-advanced clock.
      tClock += dtc;
      // GH-284: a hidden period ends the static episode (balls move in
      // PLAYBACK without touching the fingerprint's inputs)
      FRZ.sig = ''; FRZ.still = 0; FRZ.quiet = 0;
      FRZ.lineSig = ''; FRZ.linePend = false; FRZ.refresh = -1;
      if (FRZ.on) { FRZ.on = false; status.staticFrozen = false; }
      return;
    }
    renderer.getSize(uRes);
    camera.updateMatrixWorld(true);
    const sig = renderSig();
    if (FRZ.dirty || sig !== FRZ.sig) {
      FRZ.dirty = false;
      FRZ.sig = sig;
      FRZ.still = 0;
      FRZ.quiet = 0;
      SMP.epoch++; // the front buffer now predates the scene (round-8 P2)
      SMP.stableRuns = 0; // review r2 P2: the settle meter measures the
      // NEW scene from zero — stale-epoch equality is not settle evidence
      // review r2 P1 (second cut): within the boot window, a discontinuity
      // RE-SEEDS every live line's polarity — a late resource completion
      // (gi.load flips __gi.state, i.e. THIS sig) is an unannounced
      // environment discontinuity, and a latch sealed against the
      // pre-resource frame would keep its polarity seed behind the 1.25
      // flip ratio forever. Re-seed only — never stateReset here: the
      // first cut reset the whole sampler per sig change, and scenes with
      // per-frame NUMERIC churn (pulsing marker opacities ride the sig
      // while the 16-px-grid buffer stays byte-stable) starved the
      // readback generation into a permanent 'warming' wedge. The re-seed
      // reads the CURRENT raw score means (sL/sD sentinel reset), so a
      // settled scene votes a constant, deterministic polarity; rungs
      // already re-converge canonically through the freeze snap.
      if (tClock < bootCapAt && envSigNow !== FRZ.envSig) {
        for (const s of lineState.values()) {
          s.fresh = true;
          s.freshAt = -1;
          s.sL = -1;
          s.sD = -1;
          s.polPendSince = -1;
        }
      }
      FRZ.envSig = envSigNow;
      // GH-1114: the background re-sample covers a same-frame line change
      if (lineSigNow !== FRZ.lineSig) FRZ.lineFrame = SMP.frame;
      FRZ.lineSig = lineSigNow; FRZ.linePend = false; FRZ.refresh = -1;
      if (FRZ.on) { FRZ.on = false; status.staticFrozen = false; }
    } else if (lineSigNow !== FRZ.lineSig) {
      // GH-1114: LINE-only change — re-solve this frame against the cached
      // background: no epoch bump and the stillness clock keeps running,
      // so a stopped sampler stays stopped while the aim moves
      FRZ.lineSig = lineSigNow;
      FRZ.lineFrame = SMP.frame;
      FRZ.linePend = true;
      FRZ.lineStill = 0;
      FRZ.lineFrames = 0;
      FRZ.refresh = -1; // a window still open re-opens once the lines hold
      FRZ.quiet = 0;
      FRZ.still += dtc;
      if (FRZ.on) { FRZ.on = false; status.staticFrozen = false; }
    } else {
      FRZ.still += dtc;
      FRZ.lineStill += dtc;
      FRZ.lineFrames++;
      if (FRZ.refresh >= 0) FRZ.refresh += dtc;
      if (FRZ.linePend && FRZ.lineFrames >= AD.lineSettleFrames
        && FRZ.lineStill >= AD.lineSettle) {
        FRZ.linePend = false; // the lines held still: open the refresh window
        FRZ.refresh = 0;
        FRZ.refreshSeq = SMP.kicks + 1;
        FRZ.quiet = 0;
      }
    }
    // GH-1114: the refresh window samples for stillHold AND until a
    // readback kicked inside it has landed (its kick reads the previous
    // frame's render, which already shows the settled lines)
    FRZ.refreshing = FRZ.refresh >= 0
      && (FRZ.refresh < AD.stillHold || SMP.frontKick < FRZ.refreshSeq);
    if (FRZ.refresh >= 0 && !FRZ.refreshing) FRZ.refresh = -1;
    if (FRZ.on) {
      // fully frozen: no sampling, no solving, no writes — but the render
      // clock KEEPS advancing (review 2026-07-31 P1): the polarity dwell
      // must mature during a freeze, or a camera move after a long-frozen
      // aim could arrive with lastFlip still "young" and have its
      // legitimate class flip dwell-blocked, then re-frozen — stranding
      // the obsolete polarity indefinitely.
      tClock += dtc;
      return;
    }
    // resetGrace: for a few seconds after a broadcast the scene is still
    // settling asynchronously (env rebake, GI gain) with NO fingerprint
    // change — keep the shipped continuous adaptation fully live there.
    const inGrace = tClock - resetAt <= AD.resetGrace;
    status.inGrace = inGrace; // pin surface (arm S3: a PLAYBACK reset must
    // not open the grace — deterministic, no timing race)
    // freeze stage 1: once still, STOP sampling — the background buffer
    // freezes, breaking the self-feedback loop; the solve below then
    // converges to a fixed point of the constant buffer. SMP.front < 0
    // keeps sampling regardless (review round-3 P2): after a resize
    // invalidation with a readback still in flight on a slow GPU, the
    // stillness window can expire before a CURRENT-generation sample ever
    // lands — stopping then would strand the module in 'warming' (static
    // cores) until the next scene change. The shipped pre-freeze code
    // sampled unconditionally; front < 0 restores exactly that case. The
    // GH-1244 boot embargo closes the gate whatever else wants a sample.
    if (!embargo && (FRZ.still < AD.stillHold || inGrace || SMP.front < 0
      || !bootLatched // GH-496: the latch gate needs a live sample stream
      || SMP.frontEpoch !== SMP.epoch
      || FRZ.refreshing // GH-1114: the still-lines window
      || FRZ.escWant)) { // GH-1114: a fresh line's 1 s escape asks one readback
      const k0 = SMP.kicks;
      sampleStep();
      if (SMP.kicks > k0) FRZ.escWant = false;
    }
    if (dead) return;           // a sampler throw mid-hook must not let the
    // solve below re-enable the ribbons degrade() just turned off (review r3)
    if (SMP.front < 0) {
      // no CURRENT-scene sample (warm-up, or a discontinuity invalidated
      // it): fall back to the static cores rather than holding ribbon
      // colors solved against the previous background (review r3) — the
      // GH-199 scene-referred inks are the always-safe treatment and
      // preview.js re-tints them on the same broadcasts.
      setRibbons(false);
      status.active = false;
      status.reason = 'warming';
      zoneOut.active = false; // no current-scene sample: static tone (the
      // same always-safe fallback the cores are — aim.js re-inks per frame)
      FRZ.quiet = 0;
      // composer.render still runs after this return — the frame renders
      // under the current epoch, so record it (review round-10: a stale
      // lastEpoch across warming frames stamped the first post-warm
      // readbacks old, costing an extra PBO cycle before the freeze gate
      // could close on slow GPUs).
      SMP.lastEpoch = SMP.epoch;
      return;
    }
    // GH-496 boot-settle hold: while the BOOT grace is still open (render
    // clock < resetGrace — the same async-settle constant every broadcast
    // uses) the solver does not seed at all: the fresh latch's polarity
    // vote and instant-round rung both read the FIRST accepted sample, and
    // at boot that sample is a mid-light-up frame whose content is a pure
    // timing race (measured: the GH-496 probe seeded cuePost 'light' on 2/5
    // boots, 'dark' on 3/5). Sampling stays LIVE through the hold (the
    // boot grace above keeps the sampleStep gate open), so the latch at
    // hold-end reads the SETTLED scene — identical bytes on every boot of
    // an identical tree — and the whole downstream walk is deterministic.
    // The static cores render through the hold (the always-safe GH-199
    // treatment, exactly the 'warming' degrade); the zone channel holds on
    // its static fallback the same way. A post-shot AIM re-entry is
    // unaffected (tClock has long aged past the window; hidden resets
    // re-latch fresh against a settled scene as before).
    // The hold ALSO spans any grace still open before the first latch
    // (GH-496 residue: a held lighting apply at 1.8 s re-opens the grace
    // via ob:relight — its rebake/gi tail is still painting at the fixed
    // 3 s mark, and a latch there read a mid-ramp frame; grace-aware, the
    // first latch always reads a SETTLED scene). Mid-session graces are
    // untouched: bootLatched flips at the first solve and the shipped
    // continuous adaptation (immediate re-latch, live sampling) owns
    // every later discontinuity.
    // ...and the measured-settle meter: the first latch waits for 3
    // consecutive byte-equal samples (the light-up's true end), capped —
    // a genuinely animated scene falls through at the cap rather than
    // never latching (determinism there is out of scope by definition).
    // GH-1244: no first latch while the boot embargo holds, cap or not (the
    // embargo's end re-arms the meter and re-anchors the cap).
    if (!bootLatched && (embargo || (tClock < bootCapAt
      && (tClock < AD.resetGrace || inGrace || SMP.stableRuns < 3
        || SMP.frontEpoch !== SMP.epoch)))) {
      setRibbons(false);
      status.active = false;
      status.reason = 'boot-settle';
      zoneOut.active = false;
      FRZ.quiet = 0;
      tClock += dtc;
      SMP.lastEpoch = SMP.epoch;
      return;
    }
    bootLatched = true;
    solveStep(dtc);
    if (!dead) zoneStep(dtc); // GH-442: the zone-decal channel rides the
    // same solved frame (and may clear quietFrame while it still steps)
    // freeze stage 2: full freeze after quietHold s of zero rung/polarity
    // activity — outputs are already value-stable there, so the latch only
    // stops redundant work (and any residual EMA drift toward a late flip).
    if (FRZ.still >= AD.stillHold && quietFrame && (ribbonsOn || zoneLive)
      && !inGrace && SMP.frontEpoch === SMP.epoch
      && !FRZ.linePend && !FRZ.refreshing) { // GH-1114: settled lines only
      FRZ.quiet += dtc;
      if (FRZ.quiet >= AD.quietHold) { FRZ.on = true; status.staticFrozen = true; }
    } else {
      FRZ.quiet = 0;
    }
    // ribbon geometry sync AFTER the solve (which may toggle the ribbons
    // on): buffers written here upload in THIS frame's projectObject pass,
    // so the ribbons carry the CURRENT trajectory the frame they appear.
    if (ribbonsOn) {
      for (const r of RB) { if (r.core.visible) r.sync(); }
    }
    SMP.lastEpoch = SMP.epoch; // this frame's render carries this epoch
  });
  // ---- temporal stability (the round-3 zero-flicker orbit profile): a
  // 26-rung geometric display-Y ladder over [yMin, yMax], a tau=0.2 low-pass
  // on the solved target, 0.6-rung hysteresis with a 250 ms min hold and at
  // most ±1 rung per frame per vertex, plus a per-line polarity latch that
  // flips only past a 1.08 score ratio. All holds run on tClock — the
  // accumulated frame-hook dt, i.e. the render clock, never wall time.
  const rungY = (k) => ST.yMin * (ST.yMax / ST.yMin) ** (k / (AD.rungs - 1));
  const rungIdxF = (y) => (AD.rungs - 1)
    * Math.log(Math.max(ST.yMin, Math.min(ST.yMax, y)) / ST.yMin)
    / Math.log(ST.yMax / ST.yMin);
  let tClock = 0;
  // GH-496: BOOT IS A DISCONTINUITY — the boot light-up settles
  // ASYNCHRONOUSLY (env-cubemap bake, GI gain follow, texture decodes)
  // with NO fingerprint change and NO ob:settings broadcast (the boot
  // re-broadcast keys — assist/assistCuePath/assistContrast/mode — are
  // not background discontinuities), so the pre-496 module froze its
  // background buffer 0.5 s after the first visible frame: an ARBITRARY
  // mid-light-up frame, different per boot. Measured (issue GH-496 probe,
  // 5 boots, identical tree): two boots froze early==late on a dark
  // transient (stub latched rung 7 forever) while three converged to
  // rung 0, and the cuePost polarity SEEDED light on two boots and dark
  // on three — the GH-488 zd captures' dash-color flip. Opening the
  // grace at create (resetAt = 0 on the render clock) gives the boot the
  // exact law every broadcast already has: dwell suspended, sampling
  // never stops, the freeze never latches, for resetGrace seconds.
  let resetAt = 0;     // last stateReset (render clock) — resetGrace
                       // anchor; 0 = the GH-496 boot grace (create IS a
                       // discontinuity); -1e9 after a hidden-period expiry
  let bootLatched = false; // GH-496: flips at the FIRST solve — the boot
                       // latch hold below applies only before it (and
                       // re-arms on ob:relight, review r1 P1)
  let bootCapAt = 8;   // GH-496: the latch hold's fall-through deadline
                       // (render clock) — re-anchored by a late relight
  let falloffU = null; // live falloff-strength uniform (postfx ShaderPass)
  const lineState = new Map(); // RB record -> temporal state
  const trace = []; // per-frame {t, maxStep, changed, polFlips, cost} ring
  const TRACE_CAP = 1400;
  const cost = { n: 0, tot: 0, max: 0 };
  let polFlipsTotal = 0;
  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  function stateReset(openGrace = true) {
    lineState.clear();
    // GH-442: a SETTINGS discontinuity clears the zone channel too (fresh
    // re-latch against the new background/target — the line law). A hidden-
    // period reset (openGrace=false, PLAYBACK entry) deliberately KEEPS the
    // latch: the decal holds its solved ink through the shot.
    if (openGrace) zcReset();
    SMP.gen++;      // the front buffer shows the PREVIOUS scene — a fresh
    SMP.front = -1; // latch must wait for a post-discontinuity readback
    SMP.cool = 2;   // ...rendered AFTER the change (hook precedes render)
    SMP.stableRuns = 0; // GH-496: a new scene re-arms the settle meter
    // resetGrace opens for SETTINGS-driven resets only (review round-2 P1):
    // the grace exists for the async lighting settle after a broadcast; a
    // PLAYBACK hidden-period reset has no pending async settle, and since
    // tClock pauses while the lines are hidden, an unconditional resetAt
    // would hand every post-shot AIM re-entry a full 3 s window with the
    // dwell and freeze disabled — re-admitting the measured 0.84-1.36 s
    // flap after every shot on a borderline cell.
    if (openGrace) resetAt = tClock;
  }
  // equipment / cloth-color / lighting / look broadcasts change the
  // background (and the scene-referred core inks) discontinuously — reset
  // the temporal state so the next solved frame re-latches directly instead
  // of walking the ladder through a discontinuity (one deterministic jump,
  // no flicker class: the ladder is for CONTINUOUS orbit/lighting drift).
  // GH-496: the lighting layer's ASYNC boot apply (fixture rig + env
  // rebake + gi follow) repaints the scene with no settings broadcast —
  // main.js announces it on the dedicated ob:relight wire; treat it
  // exactly like the 'fixture' broadcast below (fresh re-latch + settle
  // grace). Without this, a storm-delayed lighting module landed AFTER
  // the boot grace and the frozen solve kept the pre-apply scene's inks.
  window.addEventListener('ob:relight', () => {
    stateReset();
    // review r1 P1: a lighting apply landing AFTER the first latch (a
    // storm-held module) must RE-ARM the measured-settle gate, not just
    // take the fixed grace — its rebake/gi tail can outlive 3 s exactly
    // like the boot's. Re-anchor the fall-through deadline too (the
    // create-time cap may already be spent). The static cores render
    // through the re-hold — the repaint just landed, the degrade law.
    bootLatched = false;
    bootCapAt = tClock + 8;
  });
  window.addEventListener('ob:settings', (e) => {
    const k = e?.detail?.key;
    if (k === 'equipment' || k === 'clothColor' || k === 'fixture'
      || k === 'brightness' || k === 'look') stateReset();
    // GH-417: a contrast-level change is a solve-TARGET discontinuity —
    // same law as the background discontinuities above (one deterministic
    // re-latch). applyContrastLevel no-ops on the boot re-broadcast and on
    // unknown values, so a converged solve is never reset gratuitously.
    if (k === 'assistContrast' && applyContrastLevel(e.detail.value)) {
      stateReset();
    }
  });

  solveStep = (dt) => {
    const t0 = performance.now();
    if (!falloffU) {
      falloffU = composer.passes?.find(
        (p) => p.uniforms?.strength && p.uniforms?.tDiffuse)
        ?.uniforms.strength ?? null;
      if (!falloffU) {
        // review r4: a stale postfx graph without the falloff pass would
        // make fwdTone/invTone model a transform that does not run —
        // that is the static-fallback contract's case, not a guess at 0.62
        degrade('no-falloff-seam');
        return;
      }
    }
    const fs = falloffU.value;
    // GH-417 fix-round review r1 (P2): the feasVote both-fail grade
    // discounts the LIGHT candidate by the LIVE exposure shortfall against
    // the modeled EXPO — the first-order source of the calibrated 0.79
    // light-polarity model error (the tournament default look runs exposure 0.85:
    // 0.85 / 1.05 = 0.81 predicted, 0.79 measured). On a look whose
    // exposure matches the model (?look=green, 1.05) light DELIVERS the
    // prediction and takes no discount — a hard-coded global 0.79 would
    // undervalue it there and could latch the lower-contrast dark
    // polarity. The SOLVE model keeps the frozen (EXPO const, margin)
    // pair untouched: this factor grades the polarity vote at non-default
    // levels only (feasVote false at standard BY LAW), it is never a
    // contrast target.
    const gradeL417 = Math.min(1,
      (renderer?.toneMappingExposure ?? EXPO) / EXPO);
    tClock += dt;
    const alpha = 1 - Math.exp(-dt / AD.tau);
    // GH-496 canonical-endpoint law: once stillness has stopped the
    // sampling (FRZ.still >= stillHold — the background buffer is FROZEN
    // and smv is a pure function of it), the walk hysteresis tightens to
    // 0.5 rung: |target − applied| <= 0.5 admits exactly ONE integer, so
    // the settled ink is canonical to the frozen buffer instead of a
    // ±0.6-rung band whose side depended on the approach DIRECTION (boot
    // transient / EMA path — the GH-496 cross-boot rung flip: two boots of
    // one tree settled the stub at rung 7 vs rung 0). Live sampling keeps
    // the shipped 0.6-rung hysteresis — the measured zero-flicker orbit
    // profile is untouched where pixels still move. Review r1 P2: the
    // tighten condition mirrors the SAMPLING-STOP gate exactly — during a
    // grace (or an epoch catch-up) stillness accumulates while sampling
    // deliberately continues, and a 0.5-rung walk over a MOVING buffer
    // would re-admit the flicker class the 0.6 profile was measured for.
    // GH-1114: moving lines (or their refresh window) keep the live 0.6
    // profile exactly as a moving fingerprint did before the line split
    const hy = (FRZ.still >= AD.stillHold
      && tClock - resetAt > AD.resetGrace
      && SMP.frontEpoch === SMP.epoch
      && !FRZ.linePend && !FRZ.refreshing) ? 0.5 : AD.hyst;
    camera.updateMatrixWorld(true);
    const a = SPEC.alpha;
    const W = SMP.devW, H = SMP.devH;
    let maxStep = 0, changed = 0, solvedAny = false;
    let blockedWant = false; // dwell-blocked latch-exceeding flip want
    let stepPending = false; // a vertex's TARGET sits > hyst from applied
    let polUnsettled = false; // fixed-target scores want a flip the EMA
                              // has not yet delivered (review round-6 P1)
    let probeRung = null, probePol = null;
    let pols = ''; // per-visible-line polarity vector (orbit-arm forensics)
    for (const r of RB) {
      if (!r.core.visible) {
        lineState.delete(r); // partial hide = a new trajectory next show
        continue;
      }
      const attr = r.core.geometry.getAttribute('position');
      const dr = r.core.geometry.drawRange;
      const n = Math.min(dr.count === Infinity ? attr.count : dr.count, attr.count);
      if (n < 2) continue;
      r.core.updateMatrixWorld(true);
      // LIVE ink color read (round-3 stale-hue law): linear under r170 CM
      const mc0 = r.core.material.color;
      // hue/neutrality classify from the RAW palette hex preview.js
      // publishes on userData at the same per-pose recolor writes (review
      // round-5 P2: the material.color INK is an ivory-mix whose chroma
      // overlaps/inverts across cloth escalation — see the minC0 note —
      // and the raw hue is the owner rule's "that ball's OWN hue"
      // verbatim). Feature-detected: a stale preview.js without the seam
      // degrades to the ink color, where minC0 errs luminance-only.
      const rawHex = r.core.userData?.obBallHex;
      const hueSrc = typeof rawHex === 'number'
        ? [srgbChan((rawHex >> 16) & 255), srgbChan((rawHex >> 8) & 255),
          srgbChan(rawHex & 255)]
        : [mc0.r, mc0.g, mc0.b];
      const [, la0, lb0] = oklabFromLin(hueSrc);
      const okHue = Math.atan2(lb0, la0);
      const okC0 = Math.hypot(la0, lb0);
      const hasHue = r.hueRole && okC0 >= ST.minC0;
      const baseLin = [mc0.r, mc0.g, mc0.b];
      const baseLum = Math.max(1e-4, lumOf(baseLin));
      // DELIBERATE (review r4, reaffirmed): temporal state persists across
      // pose recomputes ON PURPOSE — preview.js rewrites these buffers on
      // EVERY aim/power pointer event, so a per-recompute reset would
      // defeat the whole hysteresis layer during aim drags (the flicker
      // class the round-3 zero-flicker contract forbids). A snapped
      // trajectory re-converges bounded and smooth: far-mode walks the
      // ladder at 1 rung/frame (~0.3 s) and the polarity EMA+debounce
      // re-latches in ~0.5-0.8 s; hue is read per frame, never cached.
      // The measured, owner-approved round-3 orbit/drag profile was taken
      // with exactly this persistence.
      let sst = lineState.get(r);
      if (!sst || sst.n !== n) {
        sst = { n, smooth: new Float32Array(n).fill(-1),
          applied: new Int16Array(n).fill(-1),
          lastChange: new Float64Array(n), pol: 'light', fresh: true,
          freshAt: -1, freshFrame: -1, sL: -1, sD: -1, polPendSince: -1,
          lastFlip: tClock };
        lineState.set(r, sst);
      }
      const tgtL = new Float32Array(n), tgtD = new Float32Array(n);
      const us = new Float32Array(n), vs = new Float32Array(n);
      const bgHdr = new Float32Array(n);
      let scoreL = 0, scoreD = 0, visN = 0;
      let prevX = null, prevYp = null;
      for (let i = 0; i < n; i++) {
        v3.fromBufferAttribute(attr, i).applyMatrix4(r.core.matrixWorld);
        v4.copy(v3).applyMatrix4(camera.matrixWorldInverse);
        const viewZ = v4.z;
        v4.copy(v3).project(camera);
        if (viewZ > -0.02 || Math.abs(v4.x) > 1 || Math.abs(v4.y) > 1) {
          tgtL[i] = -1;
          tgtD[i] = -1; // BOTH sentinels (review P2): a dark-polarity line
          // reads tgtD — a zero here would fold garbage into the spatial
          // smoothing of on-screen neighbors at the viewport edge
          continue;
        }
        const sx = (v4.x + 1) / 2 * W, sy = (1 - v4.y) / 2 * H;
        us[i] = (v4.x + 1) / 2; vs[i] = (v4.y + 1) / 2;
        // background: median-of-4 perpendicular grid samples at ±1/±2 cells
        // (rejects the line's own pixels in the 1-frame-stale background)
        let tx = 1, ty = 0;
        if (prevX !== null) { tx = sx - prevX; ty = sy - prevYp; }
        const tl = Math.hypot(tx, ty) || 1;
        const ox = -ty / tl, oy = tx / tl;
        const gx = sx / (W / SMP.gw), gy = sy / (H / SMP.gh);
        const t4 = [texY(gx + ox, gy + oy), texY(gx - ox, gy - oy),
          texY(gx + 2 * ox, gy + 2 * oy), texY(gx - 2 * ox, gy - 2 * oy)];
        const ys = t4.map((q) => q[0]).sort((q, w) => q - w);
        const yws = t4.map((q) => q[1]).sort((q, w) => q - w);
        const Yb = (ys[1] + ys[2]) / 2;      // median: blend estimate + Lc score
        const YbW = (yws[1] + yws[2]) / 2;
        // solve vs the WORST bg in the neighborhood PER POLARITY (the
        // round-3 static-solve law: within-neighborhood variation must not
        // sink the floor — a median solve measured 0.65x the model on the
        // dim boundary cells and flapped the light pass gate under orbit)
        const hiA = ys[3], loA = ys[0], hiW = yws[3], loW = yws[0];
        bgHdr[i] = invTone(Yb, fs, us[i], vs[i]);
        const capHi = fwdTone(a * 1.0 + (1 - a) * bgHdr[i], fs, us[i], vs[i]);
        const capLo = fwdTone(a * 0.0005 + (1 - a) * bgHdr[i], fs, us[i], vs[i]);
        const needL = solveInkY(hiA).light;
        const needDark = solveInkY(loA).dark;
        const needLW = ST.wcagPred * (hiW + 0.05) - 0.05;
        const needDW = (loW + 0.05) / ST.wcagPred - 0.05;
        const yL0 = Math.max(ST.yMin,
          Math.min(Math.max(needL, needLW), capHi, ST.yMax));
        // GH-417 hue-preserving levels (owner 2026-08-07): a hued line's
        // LIGHT ink never leaves the identity band upward — above hueYCeil
        // the ball's hue cannot carry the CID chroma (the near-white
        // collapse on dark felts). Exact no-op when hueYCeil == 1 (every
        // row but maximum), so the shipped standard solve is byte-identical.
        const yL = hasHue && ST.hueYCeil < 1
          ? Math.min(yL0, ST.hueYCeil) : yL0;
        // dark candidates: deep (Lc-floor slam — the V1 neutral path) and
        // the W ceiling (max Y still clearing the predicted-WCAG floor)
        let yDdeep = Number.isNaN(needDark) ? capLo : Math.max(needDark, capLo);
        yDdeep = Math.min(yDdeep, Math.max(needDW, capLo, 0));
        yDdeep = Math.max(ST.yMin, Math.min(yDdeep, ST.yMax));
        // DELIBERATE (round-3 W1 + owner round-1 Q2, re-affirmed vs review
        // 2026-07-30): the hued dark CEILING is WCAG-only — it does NOT
        // take the Lc-floor bound (needDark). Clamping it there is exactly
        // V1's near-black slam ("why are all the lines black"); the shipped
        // guarantee is measured WCAG >= 3.0 with APCA Lc REPORTED, and the
        // Lc target governs the light floor + the neutral deep path.
        const needDWc = (loW + 0.05) / ST.wcagPredD - 0.05;
        const yDceil0 = Math.max(Math.max(capLo, ST.yMin), Math.min(needDWc, ST.yMax));
        // GH-417 hue-preserving levels: the hued dark ceiling never leaves
        // the identity band downward — below hueYFloor no shipped hue can
        // carry the CID chroma (the maximum-level near-black collapse the
        // owner rejected 2026-08-07). On a background darker than the band
        // this candidate scores predWDceil < 1 and the graded vote discards
        // it — the light polarity carries the line, no special-casing.
        // Exact no-op when hueYFloor == 0.
        const yDceil = hasHue && ST.hueYFloor > 0
          ? Math.max(yDceil0, ST.hueYFloor) : yDceil0;
        const yD = hasHue ? yDceil : yDdeep;
        tgtL[i] = yL; tgtD[i] = yD;
        const predWL = (yL + 0.05) / (hiW + 0.05);
        const predWDdeep = (loW + 0.05) / (yDdeep + 0.05);
        const predWDceil = (loW + 0.05) / (yDceil + 0.05);
        // polarity floor-pass bonuses. GH-417 feasVote (non-default levels
        // ONLY — ST.feasVote is false at standard, so the shipped vote is
        // byte-identical by construction): when NEITHER polarity reaches
        // the level's gate — the level's target exceeds what the display
        // can carry at this vertex-neighborhood (yMax/capHi caps the light
        // solve, yMin/capLo the dark ceiling) — the binary bonus scores
        // 0/0 and the chroma/departure terms decide, which actively
        // prefers the display-CAPPED polarity (departure rewards
        // closeness to the background). Measured 2026-08-06, maximum on
        // the shipped-default cell: 4/13 lines (the lamp-sheen crossers)
        // collapsed to measured WCAG 1.6–1.8 — under even the shipped 3.0
        // floor. The fallback grades the both-fail bonus by the ACHIEVED
        // ratio (1000 x achieved/gate, both < 1000 by construction,
        // ordering == achievement), so the vote always prefers the
        // polarity delivering MORE of the requested target; any polarity
        // that passes the gate keeps the exact 1000. FIX ROUND
        // (2026-08-07): the grade compares in DELIVERED space — the light
        // candidate is discounted by gradeL417 (the live exposure
        // shortfall vs the modeled EXPO — the first-order source of the
        // calibrated 0.79 light-polarity model error the request chain
        // inverts on the way in; dark inks carry no such documented
        // error, and a look whose exposure matches the model takes no
        // discount — review fix-round r1 P2). Grading both candidates in
        // predicted space overstated light by exactly that factor:
        // measured 2026-08-07 on the green pack cell at hue-preserving
        // 'maximum', 2/13 hued lines latched the ceil-clamped LIGHT ink
        // at measured WCAG 2.28–2.30 while the floor-clamped dark
        // candidate delivered 3.4–3.55 — under even the shipped
        // standard's 4.2 on the same lines. The gate pass/fail test
        // itself stays in predicted space (the shipped request
        // semantics, byte-identical at standard where feasVote is false
        // BY LAW).
        const vote = (predL, predD) => {
          const passL = predL >= ST.wcagGate, passD = predD >= ST.wcagGate;
          if (ST.feasVote && !passL && !passD) {
            return [1000 * (predL * gradeL417) / ST.wcagGate,
              1000 * predD / ST.wcagGate];
          }
          return [passL ? 1000 : 0, passD ? 1000 : 0];
        };
        if (hasHue) {
          // OWNER dual-polarity chroma rule (issue GH-260 decision comment):
          // floor-pass dominates; then the gamut-edge chroma the ball hue
          // carries at each candidate's display Y; the 0.5-weight departure
          // term is the literal tie-break — "closer to the borderline"
          // (chroma differences > 0.002 always dominate a full departure
          // swing: 300 x 0.002 > 0.5).
          const cL = memoChroma('d', okHue, yL).C;
          const cD = memoChroma('d', okHue, yDceil).C;
          const [bL, bD] = vote(predWL, predWDceil);
          scoreL += bL + cL * ST.chromaW
            + 0.5 * (1 - Math.min(1, Math.abs(yL - YbW)));
          scoreD += bD + cD * ST.chromaW
            + 0.5 * (1 - Math.min(1, Math.abs(yDceil - YbW)));
        } else {
          const [bL, bD] = vote(predWL, predWDdeep);
          scoreL += bL + Math.min(lcOf(yL, Yb), ST.floorLc);
          scoreD += bD + Math.min(lcOf(yDdeep, Yb), ST.floorLc);
        }
        visN++;
        prevX = sx; prevYp = sy;
      }
      if (!visN) {
        // review round-6 P2: a visible line whose vertices all left the
        // frustum keeps its temporal state (deliberate), but an ARMED flip
        // debounce would hold pendAny true forever and block the static
        // freeze — no samples, no meaningful pending flip.
        sst.polPendSince = -1;
        continue;
      }
      // per-line polarity latch on the LOW-PASSED per-vertex-mean scores:
      // means, so the score does not jump when the in-frustum vertex count
      // changes under orbit; EMA (tau 0.3 s, render clock), so a pass-gate
      // bonus flickering at the 3.6 cliff on a noisy background cannot flap
      // the latch (measured: 512 flips/10 s raw vs 0 smoothed). The FIRST
      // vote of a fresh state seeds the polarity (not a flip); after that,
      // flip only past the 1.08 ratio.
      const mL = scoreL / visN, mD = scoreD / visN;
      // GH-496 review r3 P1: a FRESH vote (boot latch, re-seed) must read a
      // CURRENT-epoch buffer — the hook's 1-frame sample latency would
      // otherwise seed polarity from the pre-change frame and clear the
      // fresh flag, stranding a marginal wrong seed behind the 1.25 ratio.
      // Non-fresh EMA updates keep the shipped latency absorption.
      // review r4 P2: under CONTINUOUS motion the epoch bumps every frame
      // and the async readback always trails it — strict equality would
      // leave a fresh state unseeded (default polarity) until motion
      // stops. The 1 s fresh-age escape casts on the freshest available
      // buffer instead (the shipped latency-absorption behavior; motion
      // means live adaptation and the normal flip law re-corrects). At
      // rest the epoch catches up within 1-2 frames and the escape never
      // opens — boot determinism unaffected.
      // GH-1114: under the line law the epoch stays current while the aim
      // moves, so "current" also needs a front kicked AFTER the lines' last
      // change — a contact line appearing mid-drag never votes on the cached
      // pre-drag buffer (it stays unseeded, exactly as the bumping epoch kept
      // it before). The 1 s escape casts on a front kicked after the line
      // appeared, and asks the hook for that one readback if none exists or
      // is in flight — the freshest-available buffer, a few frames old.
      const frontCur = SMP.frontEpoch === SMP.epoch
        && SMP.frontFrame > FRZ.lineFrame;
      if (sst.fresh && sst.freshAt < 0) {
        sst.freshAt = tClock;
        sst.freshFrame = SMP.frame;
      }
      const escape = sst.fresh && tClock - sst.freshAt > 1;
      if (escape && !(SMP.frontFrame > sst.freshFrame)
        && !(SMP.pending && SMP.pending.frame > sst.freshFrame)) FRZ.escWant = true;
      const curEpoch = frontCur
        || (escape && SMP.frontFrame > sst.freshFrame);
      if (sst.sL < 0) {
        if (curEpoch) { sst.sL = mL; sst.sD = mD; }
      } else {
        const aP = 1 - Math.exp(-dt / 0.3);
        sst.sL += (mL - sst.sL) * aP;
        sst.sD += (mD - sst.sD) * aP;
        // review round-6 P1: once sampling stops, the RAW per-frame means
        // ARE the fixed point the 0.3 s EMA converges to — if they already
        // clear the flip latch, freezing now would strand the EMA short of
        // a flip it is guaranteed to reach; hold stage 2 open until the
        // flip resolves (debounce + dwell included) or the want subsides.
        const wantNow = sst.pol === 'light'
          ? mD > mL * AD.polLatch
          : mL > mD * AD.polLatch;
        if (wantNow) polUnsettled = true;
      }
      if (sst.fresh) {
        if (curEpoch && sst.sL >= 0) {
          sst.pol = sst.sD > sst.sL ? 'dark' : 'light';
          sst.fresh = false;
          sst.freshAt = -1;
          sst.lastFlip = tClock; // dwell starts at the latch (GH-284)
        }
        // stale epoch: keep the fresh flag armed — the vote casts on the
        // first current-epoch frame (review r3 P1) or via the 1 s
        // fresh-age escape under continuous motion (review r4 P2)
      } else {
        // flip DEBOUNCE on top of the ratio latch: the polLatch condition
        // must hold CONTINUOUSLY for 0.5 s (render clock) before a flip
        // commits. A genuine background-class transition just arrives 0.5 s
        // later (and fades through the ladder); a borderline line whose
        // smoothed scores graze the ratio under orbit/load noise never
        // accumulates the dwell — the oscillation class the orbit arm
        // forbids. GH-284 dwell floor UNDER the debounce: after any commit
        // (or the fresh latch) the flip cannot even re-ARM for polDwell
        // seconds — the measured at-rest self-feedback loop (the ribbon's
        // own pixels contaminating its 1-frame-stale background samples)
        // flipped every 0.84..1.36 s and swings the ratio up to 6.5x, so
        // the ratio alone can never carry the at-rest guarantee. A
        // settings broadcast bypasses via stateReset (fresh latch above).
        const dwellOk = tClock - sst.lastFlip >= AD.polDwell
          || tClock - resetAt <= AD.resetGrace;
        const rawWant = sst.pol === 'light'
          ? sst.sD > sst.sL * AD.polLatch
          : sst.sL > sst.sD * AD.polLatch;
        // a latch-exceeding want that only the dwell is holding back must
        // BLOCK the full freeze (review 2026-07-31 P1): the flip then
        // commits once at dwell expiry (sampling is already stopped, so
        // the feedback loop cannot re-arm — one deterministic transition)
        // instead of being frozen over and stranded.
        if (rawWant && !dwellOk) blockedWant = true;
        const wantFlip = dwellOk && rawWant;
        if (!wantFlip) {
          sst.polPendSince = -1;
        } else if (sst.polPendSince < 0) {
          sst.polPendSince = tClock;
        } else if (tClock - sst.polPendSince >= 0.5) {
          sst.pol = sst.pol === 'light' ? 'dark' : 'light';
          sst.polPendSince = -1;
          sst.lastFlip = tClock;
          polFlipsTotal++;
        }
      }
      const tgt = sst.pol === 'dark' ? tgtD : tgtL;
      for (let i = 0; i < n; i++) {
        if (tgt[i] < 0) continue;
        // spatial smoothing ±2 along the line
        let s = 0, c = 0;
        for (let k = -2; k <= 2; k++) {
          const j = i + k;
          if (j < 0 || j >= n || tgt[j] < 0) continue;
          s += tgt[j]; c++;
        }
        const smv = c ? s / c : tgt[i];
        if (sst.smooth[i] < 0) sst.smooth[i] = smv;
        else sst.smooth[i] += (smv - sst.smooth[i]) * alpha;
        const idxF = rungIdxF(sst.smooth[i]);
        const prevIdx = sst.applied[i];
        let idx = prevIdx < 0 ? Math.round(idxF) : prevIdx;
        // FAR mode (> 3 rungs out — a discontinuity: polarity flip, cell
        // change, camera preset jump): converge at 1 rung/FRAME instead of
        // 1 rung/250 ms, else a 16-rung walk takes 4 s of wrong-luminance
        // ink. Still <= 1 rung/frame (the orbit trace contract); the hold
        // re-engages once within 3 rungs, so smooth orbit drift never sees
        // this branch.
        const far = prevIdx >= 0 && Math.abs(idxF - prevIdx) > 3;
        // frozen (canonical) mode steps toward Math.round — the half-up
        // tie-break makes an EXACT k+0.5 target one-sided (review r3 P2:
        // with a plain <= 0.5 band both neighbors satisfied it and the
        // endpoint stayed approach-dependent for that input)
        const canon = hy !== AD.hyst;
        const wantStep = canon
          ? (prevIdx >= 0 && Math.round(idxF) !== prevIdx)
          : (prevIdx >= 0 && Math.abs(idxF - prevIdx) > hy);
        if (wantStep && (far || tClock - sst.lastChange[i] > AD.minHold)) {
          idx += Math.sign((canon ? Math.round(idxF) : idxF) - prevIdx);
          sst.lastChange[i] = tClock;
        }
        sst.applied[i] = idx;
        if (prevIdx >= 0 && idx !== prevIdx) {
          changed++;
          if (Math.abs(idx - prevIdx) > maxStep) maxStep = Math.abs(idx - prevIdx);
        }
        // stage-2 convergence gate (review round-5 P1): judge quiet against
        // the TARGET (smv — the fixed point the EMA converges to once
        // sampling stops), not the still-moving EMA: a final readback that
        // shifts a target by ~0.7-0.8 rung near stillHold would otherwise
        // let quietHold elapse before the low-pass crosses the hysteresis
        // and freeze the solver one required step short.
        if (canon ? Math.round(rungIdxF(smv)) !== idx
          : Math.abs(rungIdxF(smv) - idx) > hy) stepPending = true;
        // applied display Y → post-blend HDR → ink scene luminance → carrier
        const yD2 = rungY(idx);
        const Lb = invTone(yD2, fs, us[i], vs[i]);
        let Ll = (Lb - (1 - a) * bgHdr[i]) / Math.max(0.05, a);
        Ll = Math.max(0.0005, Ll);
        let rr, gg, bb;
        if (hasHue) {
          // gamut-edge chroma along the ball hue at EXACTLY the solved
          // luminance (no desat-to-white ramp, no black slam)
          const mc = memoChroma('k', okHue, Math.min(Ll, 0.999));
          rr = mc.lin[0]; gg = mc.lin[1]; bb = mc.lin[2];
        } else {
          // neutral path: scale the live base ink, desaturate on overflow
          const sc = Ll / baseLum;
          rr = baseLin[0] * sc; gg = baseLin[1] * sc; bb = baseLin[2] * sc;
          const mx = Math.max(rr, gg, bb);
          if (mx > 1) {
            const L2 = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
            rr /= mx; gg /= mx; bb /= mx;
            const L3 = L2 / mx;
            const w = Math.max(0, Math.min(1,
              (Math.min(L2, 3) - L3) / Math.max(1e-6, 1 - L3)));
            rr += (1 - rr) * w; gg += (1 - gg) * w; bb += (1 - bb) * w;
          }
        }
        r.colArr[i * 3] = rr; r.colArr[i * 3 + 1] = gg; r.colArr[i * 3 + 2] = bb;
      }
      // viewport-clipped endpoints (review r4): an off-frustum vertex still
      // colors the visible part of its clipped segment via interpolation —
      // fill unsolved vertices from their nearest solved neighbor so the
      // screen-edge run carries the boundary ink, never a stale/default one
      const copyCol = (dst, src) => {
        r.colArr[dst * 3] = r.colArr[src * 3];
        r.colArr[dst * 3 + 1] = r.colArr[src * 3 + 1];
        r.colArr[dst * 3 + 2] = r.colArr[src * 3 + 2];
      };
      let firstValid = -1, lastValid = -1;
      for (let i = 0; i < n; i++) {
        if (tgt[i] >= 0) {
          if (firstValid < 0) firstValid = i;
          lastValid = i;
        } else if (lastValid >= 0) copyCol(i, lastValid); // interior/trailing
      }
      for (let i = 0; i < firstValid; i++) copyCol(i, firstValid); // leading
      r.ibc.needsUpdate = true;
      solvedAny = true;
      pols += sst.pol === 'dark' ? 'D' : 'L';
      if (probeRung === null && r.hueRole && r.role === 'practice') {
        probeRung = sst.applied[Math.min(n - 1, 48)];
        probePol = sst.pol;
      }
    }
    if (solvedAny && !ribbonsOn) {
      setRibbons(true);
      status.active = true;
      status.reason = 'live';
    }
    // GH-284 stage-2 feed: zero rung steps, no polarity flip pending, and
    // no dwell-blocked flip want (review P1) — the colArr writes above were
    // value-idempotent, so the frame hook may latch the full freeze once
    // this holds for quietHold seconds.
    let pendAny = false;
    for (const s of lineState.values()) {
      if (s.polPendSince >= 0) { pendAny = true; break; }
    }
    quietFrame = changed === 0 && !pendAny && !blockedWant && !stepPending
      && !polUnsettled;
    const ms = performance.now() - t0;
    cost.n++; cost.tot += ms;
    if (ms > cost.max) cost.max = ms;
    trace.push({ t: +tClock.toFixed(4), maxStep, changed,
      polFlips: polFlipsTotal, probeRung, probePol, pols, cost: +ms.toFixed(2) });
    if (trace.length > TRACE_CAP) trace.shift();
  };

  // ---- GH-442: the objective-zone decal channel ------------------------------
  // ONE additional single-channel solve per frame (address states only —
  // the hook's anyVisible early-return latches it through PLAYBACK), for
  // aim.js's cloth decal. OWNER FIX ROUND (GH-442 verdict 2026-08-09 —
  // "can this zone be a white border?"): the decal anatomy is WHITE OUTLINE +
  // adaptive paper wash —
  //   BOUNDARY — a PHYSICAL paper-white owned by aim.js (a lit material
  //   the scene's own lamp/tonemap render; never an ink this channel
  //   solves — the first cut's polarity vote and dark-ceiling walk are
  //   GONE, and with them the black<->white flip class they existed to
  //   prevent). The channel's only boundary output is lineA: the GH-417
  //   level's COVERING POWER for the white stroke, derived from the level
  //   rows' own anchor ratios (ST.wcagPred / the standard row's wcagPred —
  //   the measured 1.5/3.0/4.5/7.0 anchor ladder through the
  //   level-constant 0.79 chain, so the ratio is anchor-exact), scaled
  //   onto the owner-accepted stroke alpha and display-capped at full
  //   opacity: 0.425 / 0.85 / 1.0 / 1.0 across low/standard/high/maximum.
  //   'low' therefore genuinely dims the white TOWARD THE FELT (the alpha
  //   blend is literally "toward the felt" — a chalk line half dusted
  //   into the nap), while high/maximum saturate at full covering power:
  //   a physical white has a physical cap (the arm-L display-capped
  //   top-rung law transposed — REPORTED, not hidden: the harness
  //   measures the flat top honestly). No invented constants — standard
  //   is the accepted 0.85 verbatim; every other rung is the level
  //   anchors' own ratio.
  //   FILL — the adaptive assist-ink machinery stays HERE verbatim for
  //   the light "paper" wash: the shipped dual-floor solve (APCA Lc +
  //   predicted-WCAG at the live level row, capped at the wash's blend
  //   capacity), pinned LIGHT by identity — it IS the paper (measured
  //   2026-08-08: light saturates at the display cap ~2.0 predicted on
  //   lit tournament_blue, which is exactly why the measured guarantee
  //   now rides the white boundary, not this wash), walking the same
  //   rung ladder + tau-0.2 low-pass against the aim-published INTERIOR
  //   felt anchors (read through its own 0.08 fill — a bounded
  //   self-feedback the rung hysteresis + static-scene freeze absorb).
  // The fill carrier = the base assist tone scaled to its solved scene
  // luminance with desaturate-on-overflow (the neutral carrier verbatim;
  // no ball hue, so the maximum level's identity-band clamp does not
  // apply).
  const ZC = { key: '', smoothF: -1, appliedF: -1, lastChangeF: 0 };
  function zcReset() {
    ZC.key = '';
    ZC.smoothF = -1;
    ZC.appliedF = -1;
    ZC.lastChangeF = 0;
    zoneOut.active = false;
  }
  zoneStep = (dt) => {
    const zst = window.__aim?.zoneDecalState?.();
    if (!zst?.on || !zst.pts?.length || zst.pts.length < 6) {
      if (zoneOut.active || ZC.key) zcReset();
      return;
    }
    if (zst.key !== ZC.key) {
      zcReset(); // a new attempt's zone: fresh latch, never a ladder walk
      ZC.key = zst.key;
    }
    // project the outward cloth anchors; sample the front buffer
    const W = SMP.devW, H = SMP.devH;
    const apc = [], wcg = [];
    for (let i = 0; i + 2 < zst.pts.length; i += 3) {
      v3.set(zst.pts[i], zst.pts[i + 1], zst.pts[i + 2]);
      v4.copy(v3).applyMatrix4(camera.matrixWorldInverse);
      if (v4.z > -0.02) continue;
      v4.copy(v3).project(camera);
      if (Math.abs(v4.x) > 1 || Math.abs(v4.y) > 1) continue;
      const t2 = texY((v4.x + 1) / 2 * W / (W / SMP.gw),
        (1 - v4.y) / 2 * H / (H / SMP.gh));
      apc.push(t2[0]);
      wcg.push(t2[1]);
    }
    if (apc.length < 3) return; // mostly off-frame: hold the last carrier
    // centre projection = the display-model (u,v) anchor
    v3.set(zst.ctr[0], zst.ctr[1], zst.ctr[2]);
    v4.copy(v3).applyMatrix4(camera.matrixWorldInverse);
    if (v4.z > -0.02) return;
    v4.copy(v3).project(camera);
    const u = Math.max(0, Math.min(1, (v4.x + 1) / 2));
    const v = Math.max(0, Math.min(1, (v4.y + 1) / 2));
    apc.sort((a2, b2) => a2 - b2);
    wcg.sort((a2, b2) => a2 - b2);
    const hiA = apc[apc.length - 1], loA = apc[0];
    const hiW = wcg[wcg.length - 1], loW = wcg[0];
    const Yb = apc[Math.floor(apc.length / 2)];
    const fs = falloffU ? falloffU.value : 0; // solveStep ran first: set or dead
    const bgHdr = invTone(Yb, fs, u, v);
    // fill candidate solve — the shipped dual floor (APCA Lc target +
    // predicted-WCAG at the live level row) capped at the WASH's blend
    // capacity; light polarity by identity (the paper wash — see the
    // channel note)
    const aF = zst.alphaFill ?? zst.alpha;
    const capHi = fwdTone(aF * 1.0 + (1 - aF) * bgHdr, fs, u, v);
    const needL = solveInkY(hiA).light;
    const needLW = ST.wcagPred * (hiW + 0.05) - 0.05;
    const yL = Math.max(ST.yMin,
      Math.min(Math.max(needL, needLW), capHi, ST.yMax));
    // rung ladder (tau low-pass + hysteresis + minHold + far mode — the
    // solveStep grammar, single-channel)
    let stepping = false;
    const walk = (tgt, sK, aK, cK) => {
      if (ZC[sK] < 0) ZC[sK] = tgt;
      else ZC[sK] += (tgt - ZC[sK]) * (1 - Math.exp(-dt / AD.tau));
      const idxF = rungIdxF(ZC[sK]);
      const prevIdx = ZC[aK];
      let idx = prevIdx < 0 ? Math.round(idxF) : prevIdx;
      const far = prevIdx >= 0 && Math.abs(idxF - prevIdx) > 3;
      if (prevIdx >= 0 && Math.abs(idxF - prevIdx) > AD.hyst
        && (far || tClock - ZC[cK] > AD.minHold)) {
        idx += Math.sign(idxF - prevIdx);
        ZC[cK] = tClock;
      }
      ZC[aK] = idx;
      // pending-step gate judges against the RAW target (review r1 P2 —
      // the solveStep smv law: the EMA is the still-moving value; freezing
      // on it can strand the carrier one required step short)
      if ((prevIdx >= 0 && idx !== prevIdx)
        || Math.abs(rungIdxF(tgt) - idx) > AD.hyst) stepping = true;
      return idx;
    };
    const idxFill = walk(yL, 'smoothF', 'appliedF', 'lastChangeF');
    // applied rung → post-blend HDR → ink scene luminance → carrier
    // (the neutral path verbatim: scale the base tone, desat on overflow)
    const bHex = zst.base >>> 0;
    const bl = [srgbChan((bHex >> 16) & 255), srgbChan((bHex >> 8) & 255),
      srgbChan(bHex & 255)];
    const bLum = Math.max(1e-4, lumOf(bl));
    const carrier = (yDisp, alpha, out) => {
      const Lb = invTone(yDisp, fs, u, v);
      let Ll = (Lb - (1 - alpha) * bgHdr) / Math.max(0.05, alpha);
      Ll = Math.max(0.0005, Ll);
      const sc = Ll / bLum;
      let rr = bl[0] * sc, gg = bl[1] * sc, bb = bl[2] * sc;
      const mx = Math.max(rr, gg, bb);
      if (mx > 1) {
        const L2 = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
        rr /= mx; gg /= mx; bb /= mx;
        const L3 = L2 / mx;
        const w = Math.max(0, Math.min(1,
          (Math.min(L2, 3) - L3) / Math.max(1e-6, 1 - L3)));
        rr += (1 - rr) * w; gg += (1 - gg) * w; bb += (1 - bb) * w;
      }
      out[0] = rr; out[1] = gg; out[2] = bb;
    };
    const yF2 = rungY(idxFill);
    carrier(yF2, aF, zoneOut.rgbFill);
    if (stepping) {
      quietFrame = false; // still stepping (or a step is pending): hold the
      // stage-2 freeze open — the solveStep stepPending law
    }
    // the white boundary's covering power for the live level — the anchor
    // ratio ladder, display-capped (see the channel note). Pure function
    // of the level row: no ladder walk, nothing for the freeze to chase.
    const lineA = Math.min(1, zst.alpha
      * (ST.wcagPred / CONTRAST_LEVELS[DEFAULT_CONTRAST].wcagPred));
    zoneOut.active = true;
    zoneOut.level = contrastLevel;
    zoneOut.pol = 'light'; // the WASH's polarity — pinned by identity
    zoneOut.lineA = +lineA.toFixed(3);
    zoneOut.rungFill = idxFill;
    zoneOut.yFill = +yF2.toFixed(4);
    zoneOut.predW = +((yF2 + 0.05) / (hiW + 0.05)).toFixed(3); // the WASH's
    // predicted ratio vs its worst bg (receipts only — the measured
    // guarantee rides the white boundary, which the harness measures
    // directly off rendered pixels; a lit material's output is not
    // predictable from here)
    zoneOut.lc = +lcOf(yF2, Yb).toFixed(1);
    zoneOut.dbg = { hiA: +hiA.toFixed(3), loA: +loA.toFixed(3),
      hiW: +hiW.toFixed(3), loW: +loW.toFixed(3),
      capHi: +capHi.toFixed(3), yLF: +yL.toFixed(3), n: apc.length };
  };

  // e2e / perf surfaces (window.__aim Object.assign pattern)
  api.inkTrace = () => trace.slice();
  api.inkResetTrace = () => {
    trace.length = 0;
    polFlipsTotal = 0;
    cost.n = 0; cost.tot = 0; cost.max = 0;
  };
  api.inkCost = () => ({ ...cost, avg: cost.n ? cost.tot / cost.n : 0 });
  // GH-496: colHash — a byte-exact receipt over the SOLVED ribbon vertex
  // colors (the pixels' sole color input; geometry/shader are already
  // deterministic), so the N-boot determinism arm can assert overlay
  // equality without a pixel readback. DJB2 over the Float32 bytes.
  const colHash = (arr) => {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let h = 5381;
    for (let i = 0; i < u8.length; i++) h = ((h * 33) ^ u8[i]) >>> 0;
    return h.toString(16);
  };
  api.inkLines = () => RB.filter((r) => r.core.visible && lineState.has(r))
    .map((r) => {
      const sst = lineState.get(r);
      const rungs = [...sst.applied].filter((k) => k >= 0).sort((a, b) => a - b);
      return { role: r.role, pol: sst.pol, colHash: colHash(r.colArr),
        rungMed: rungs.length ? rungs[Math.floor(rungs.length / 2)] : null,
        yMed: rungs.length ? +rungY(rungs[Math.floor(rungs.length / 2)]).toFixed(4) : null,
        // GH-284 forensics: the smoothed polarity scores + the flip-arming
        // ratio (other/current) — the at-rest arm asserts an absolute score
        // margin instead of relying on a borderline cell staying borderline
        sL: +sst.sL.toFixed(3), sD: +sst.sD.toFixed(3),
        ratio: +((sst.pol === 'light' ? sst.sD / sst.sL : sst.sL / sst.sD)
          || 0).toFixed(4) };
    });

  api.inkFreeze = (on) => { frozen = !!on; return frozen; };
  api.inkMask = (on) => {
    for (const r of RB) r.mat.uniforms.uMask.value = on ? 1 : 0;
    return !!on;
  };
  // test-only kill switch (e2e-aim GH-260 red-proof leg): permanently
  // degrade THIS session to the static path so the same sampler can prove
  // it still sees the round-1 defect on the shipped inks. Not a user
  // surface — a page reload restores the adaptive path.
  api.inkDisable = () => { degrade('test-disabled'); return true; };
  // re-assign: the boot-time Object.assign above copied only adaptiveInk
  // (Object.assign snapshots — later api.* additions don't propagate)
  Object.assign(window.__aim, api);
  return api;
}
