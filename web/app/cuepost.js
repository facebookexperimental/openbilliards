// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuepost.js — cue POST-STRIKE visual dynamics engine (design 277 §4,
// GitHub issue #277 slice 2; owner-approved contract at
// docs/research/design-277-cue-poststrike.md). Exposed by main.js as
// `__test.cuePost` — a HARNESS surface only (the cuestrike.js precedent):
// no player-facing UI, nothing runs until a spec is armed, and the live
// app (aim.js/flow.js/game.js) is untouched — surface adoption is slice 3.
//
// What it renders (§4 revision, owner round-3 model 2026-07-31 — the
// choreographed pendulum dip is REMOVED; it read as staged): the cue does
// NOT vanish at contact. It extends ALONG THE STRIKE LINE with the
// per-class deceleration profile (1–2 ball diameters, more on breaks). If
// and only if that extended line geometrically brings the tip to the
// cloth (elevated shots; the break throw/slide), contact happens
// naturally: jump/masse ARREST there, shallow classes RIDE the floor via
// a constraint-derived rotation about the grip hand, and the sustained
// lean/push drives a FORCE-BASED bow (the bend model block below).
// Low-elevation short follow-throughs finish HOVERING above the cloth —
// correct and desired; no artificial dip-to-cloth. The cue then stays
// down (min(3 s, all-rest) — Ford/Eberle) and withdraws with a
// player-like lift-and-pull-back (D4) that dissolves over its terminal
// WD_FADE_S while the motion continues (a hard hide at tHide read as the
// object ceasing to exist whenever part of the rod was still in frame —
// the near-vertical masse worst case) — or, ONLY when the intrusion
// budget is too tight for the full withdrawal, fades out in place (last
// resort, "the player standing up, not the object ceasing to exist").
//
// Determinism doctrine (the cuestrike/camerascript purity law): the posed
// cue is a PURE function of the playback clock t and the ARMED spec. Every
// number is resolved STATICALLY at arm time — the cue-ball anchor (the
// record's t<=0 rest pose), the elevation floor, the whole stroke +
// post-strike motion (phase boundaries, follow-through distance, the
// cloth-touch time, cloth/nose/arrest clamps), the D4 withdrawal plan
// (t_lift, mode), the flex amplitudes and the bend-model statics — so the
// same record + spec steps a byte-identical frame sequence under
// chronological stepping AND random access. No dt, no wall clock: poseCue
// runs with dt = 0 (cuestick's stateful render flex stays frozen) and
// every flex term is closed-form in t, re-asserted per armed frame.
//
// D1 — strictly visual, kernel zero awareness: the engine READS the
// record's kernel truth (batch sampler — physics is NEVER re-implemented
// here) and clamps its own choreography so that
//   • the tip may TOUCH the cloth, never penetrate (TIP_FLOOR clamp;
//     jump/masse ARREST downward at cloth contact, shallow classes RIDE
//     the floor via the grip-pivot escape rotation, and the advance
//     cloth-arrests wherever the escape interval cannot buy the tip back
//     above the floor — the draw-B fix); table contact drives the
//     FORCE-BASED constraint bow (uBendC channel; the reference-footage C read, §4
//     revision) whose belly sags TOWARD the cloth under the DERIVED
//     beam shape (GH-293) and is floor-capped so it may touch, never
//     penetrate, and the whip amplitude is clamped by the available cloth
//     clearance (realism doctrine 2026-07-31: near-cloth vibration is
//     quenched by the table, never rendered through it);
//   • the tip never crosses the cushion nose line (NOSE_INSET advance cap);
//   • rails/pockets are never penetrated: the address pose is floored by
//     cueMinElevationDeg (the cuestrike mirror), and the escape rotation
//     is clamped to the [railLo, 0] interval the SAME geometry owner
//     certifies over the whole advance/withdrawal path (each candidate
//     pose re-expressed as a virtual zero-offset address and re-floored —
//     review r2 P1 lineage: the escape's tip-up rotation lowers the BUTT
//     section behind the grip pivot);
//   • no ball EVER intersects the cue (issue #64 extended to the TIME
//     domain): t_intrusion is computed at arm time from the record's
//     closed-form trajectories vs the posed rod capsule (flex envelope
//     included) on an event-aware grid, and the D4 law
//     t_lift = min(3 s, t_rest, t_intrusion − withdraw − margin) plus the
//     withdrawal-path re-scan (violation ⇒ fade fallback, which freezes
//     the already-cleared stay pose and completes before t_intrusion)
//     makes the invariant hold BY CONSTRUCTION from contact onward, and
//     the PRE-CONTACT stroke (address/pullback/thrust vs the RESTING
//     balls; the cue ball is the stroke's target and is excluded until
//     separation) is swept at arm time too — a framing whose stroke would
//     pass through a resting ball REJECTS fail-closed (review r1 P2: no
//     withdrawal can fix a stroke invalid before it began).
//
// Spec (`cuePost(spec)`; `cuePost(null)` disarms and hides the cue). Arm
// one scripted cue rig at a time — this OR `__test.cueStrike`, never both
// (two rigs would render two cues; the camerascript "don't arm both"
// precedent). Strike params (v0/phi/theta/a/b) are read OFF THE LOADED
// RECORD (kernel truth — the choreography and the intrusion math must
// describe the shot that actually simulated), never from the spec:
//   {
//     t_contact,                    // playback time of tip-ball contact [s]
//                                   // — must EQUAL the record's Strike
//                                   // event time (0 for a whole-shot
//                                   // record; the playback clock IS
//                                   // record time)
//     approach: { from_s,           // stroke start (< t_contact)
//                 pullback_m,       // max pull-back [m], (0, 0.6]
//                 ease?,            // 'smooth' (default) | 'linear'
//                 pause_s? },       // ABSOLUTE rear-pause override [s]
//                                   // (GH-363: the 0.08·W share cannot
//                                   // express a deliberate 0.1-0.6 s back
//                                   // pause — a measured, per-discipline
//                                   // vocabulary)
//     practice?: {                  // GH-363 v2 practice strokes (来回运杆)
//                                   // BEFORE the final stroke; occupies
//                                   // [from_s - hold_s - Σdur_i, from_s]:
//       count,                      //   feathers (pull+return cycles), 1..12
//       amp_m,                      //   median tip travel per feather [m];
//                                   //   must be <= pullback_m (the practice
//                                   //   envelope stays inside the certified
//                                   //   backswing clearance — #64 law)
//       period_s,                   //   median per-feather period [s]
//       hold_s,                     //   front pause at address AFTER the
//                                   //   last feather, before the backswing
//       taper?,                     //   last/first amp ratio (default 1.0)
//       jitter?,                    //   ± fractional per-feather amp/period
//                                   //   variation (default 0.10)
//       seed?,                      //   uint32 PRNG seed (default 1) — the
//                                   //   jitter stream is DETERMINISTIC in
//                                   //   (seed, count): same spec = byte-
//                                   //   identical frames (kernel replay law)
//     }
//                                   // Feather waveform: one raised-cosine
//                                   // pull cycle 0 -> amp_i -> 0 per feather
//                                   // (C1 at both ends — fitted against the
//                                   // measured traces, not authored; see
//                                   // docs/research/design-363-practice-
//                                   // strokes.md §2). pull >= 0 always: a
//                                   // feather can NEVER touch the ball.
//     cue?: {                       // optional overrides (preview tuning):
//       id?,                        //   aesthetics-registry key; default =
//                                   //   the record's equipment cue_id
//       shaft_first_mode_hz?,       //   [8, 200]; default = the record's
//                                   //   resolved cue, else 27.0 (Am. 025)
//       shaft_damping_ratio?,       //   (0, 1); default likewise, else 0.02
//     },
//     aesthetics?: {                // optional per-arm overrides of the
//       style?, exaggeration?,      //   cuevisuals.js registry entry (the
//       withdrawDuration?,          //   owner-preview tuning seam); same
//       withdrawMargin?,            //   fields + domains as the registry
//     },
//     visible_window?: [t0, t1],    // default [practice start | from_s,
//                                   //   t_hide]; t1: null = engine-resolved
//                                   //   (the plan's own t_hide — GH-363)
//     clock?: { offset_s, rate? },  // GH-363 beat-tail FUSION seam: the arm
//                                   //   plays on an emission clock that runs
//                                   //   offset (and possibly montage-rate-
//                                   //   scaled) from record time — applyAt
//                                   //   evaluates at (t − offset_s)/rate.
//                                   //   The renderer arms the STAGED next
//                                   //   segment's spec during a GH-299 walk
//                                   //   tail, whose 'frame' emissions ride
//                                   //   the PREVIOUS segment's camera clock;
//                                   //   this maps them onto the staged
//                                   //   record's negative pre-strike clock
//                                   //   (contact converges on segment start
//                                   //   — design 363 §5). Model/plan times
//                                   //   stay record-time; default {0, 1}.
//   }
// arm() returns the RESOLVED PLAN object on success (class, mode,
// t_lift/t_hide/t_intrusion, flex numbers — the timeline is engine-derived
// so the harness cannot know it a priori), false on rejection (fail-closed
// whole-spec rejection, validate-before-disarm) and false while the module
// is still loading (poll for non-false).
//
// Shot classification (thresholds are app-side constants against design
// §2.1's qualitative classes; the aesthetics registry can force a style):
//   masse   theta >= 60 deg — the kernel's own pinch domain boundary
//           (kernel-api.md Amendments 022/024: lambda(theta) > 0 above 60
//           deg) and §2.1's "follow through into the table" stroke
//   jump    theta >= 25 deg AND v0 >= 2.5 — §2.1 "elevated downward
//           follow-through" with enough speed to compress the bed
//   break   v0 >= 6.5 m/s — §2.1 "very high v0"; finishes on the table
//           and slides (Crimi/Strickland)
//   draw    b <= −0.3 — §2.1 "strong negative b" (the 0.5R draw drills)
//   normal  everything else
//
// Cache-poison contract (the ownership ledger rule 5): loaded via a guarded dynamic
// import from main.js; reaches cuestick.js AND cuevisuals.js through
// NAMESPACE imports + feature detection — a stale cached module without the
// exports degrades (arm rejects fail-closed for the geometry owner; the
// registry falls back to the literal-mirrored defaults below), never a
// module-graph error. Scalar constants below are LITERAL mirrors of
// cuestick.js internals on purpose (the camerascript DEFAULT_FOV / cuestrike
// precedent): importing them by name would poison a returning user's mixed
// cache, and drift is cosmetic-only.
import * as THREE from 'three';
import * as coords from './coords.js';
import * as cueMod from '../scene/cuestick.js';
import * as visualsMod from './cuevisuals.js';
// per-cue LOOK registry (feature 032 S2.5 — GH-525 D5): the post-strike
// whip rod must MATCH the gameplay cue (no material/length flash at the
// aim→post swap), so the armed cue id threads into buildCue AND
// parameterizes the model's rod profile below. Namespace import + feature
// detection (rule 5): a stale cache missing cuelooks.js degrades to the
// literal-mirrored default rod — today's exact numbers.
import * as looksMod from '../scene/cuelooks.js';

// ---- literal mirrors (cuestick.js; the cuestrike mirror discipline) ----
const TIP_GAP = 0.010;    // cuestick.js TIP_GAP (tip rest gap, poseCue)
const BALL_R = 0.028575;  // scene/balls.js R — the POOL default; the engine
                          // geometry runs on the RECORD cue ball's own
                          // radius (review P2: snooker/carom records differ
                          // by ~2 mm), threaded through poseCue's design-277
                          // trailing ballR parameter; this mirror remains
                          // only as the anchor-height fallback scale
const CUE_LEN = 1.477;    // cuestick.js CUE_LEN (0.012+0.021+1.02+0.012+0.40+0.012)
const R_TIP = 0.00625, R_FERRULE = 0.0064, R_BUTT = 0.0146; // cuestick radii
const R_JOINT = 0.0108;   // cuestick.js R_JOINT (shaft→joint radius)
// TRUE tapered radius profile r(s), s = arc behind the tip face [m] —
// literal mirror of cuestick.js buildCue's segment stack (GH-293 review
// r2 P2: the scan's linear ferrule→butt capsule OVER-bounds the tip taper
// and UNDER-bounds nothing — right for ball clearance, wrong for a
// surface-vs-cloth bound, where it would force a zero cap at shallow
// elevations even for a straight rod).
// Feature 032 S2.5: this DEFAULT profile stays the literal mirror; a
// non-default armed cue id re-derives the same seven breakpoints from the
// cuelooks.js registry dims (rodPackFor below) so the model's surface
// bounds track the rod that actually renders.
const ROD_PROFILE = [
  [0, R_TIP * 0.94], [0.012, R_TIP], [0.033, R_FERRULE],
  [1.053, R_JOINT], [1.065, R_JOINT + 0.0004], [1.465, R_BUTT],
  [CUE_LEN, R_BUTT * 0.92],
];
function rodRadiusAt(profile, s) {
  for (let i = 1; i < profile.length; i++) {
    const [s1, r1] = profile[i];
    if (s <= s1) {
      const [s0, r0] = profile[i - 1];
      return r0 + ((r1 - r0) * (s - s0)) / (s1 - s0);
    }
  }
  return profile[profile.length - 1][1];
}
const WHIP_GRIP_S = 0.78; // cuestick.js WHIP_GRIP_S (uFlex2S default)
// 250 Hz end-ring mirrors (cuestick.js RING_* / cuestrike.js)
const RING_F = 250, RING_TAU = 0.010, RING_LIFE = 0.06;
const RING_REF_A = 0.004, RING_REF_V = 8, RING_MAX_A = 0.005;
const BOW_PER_MPS = 0.0004, BOW_MAX = 0.003;
// visible-window edge tolerance (seconds) — float dust only, never a frame:
// spec vw edges are sums of seconds while frame clocks are frame-grid
// arithmetic; the doubles can differ by ulps (see applyAt). Twin constant
// in cuestrike.js (the leaf-parity law — neither module imports the other).
const VW_EPS_S = 1e-9;
// stroke phase split (cuestrike.js literal mirror — same approach model so
// harness specs port by renaming, and the strike look stays the accepted one)
const PAUSE_FRAC = 0.08;
const THRUST_FRAC = 0.35;
const THRUST_MAX_S = 0.12;

// ---- aesthetics defaults (literal mirror of cuevisuals.js
// CUE_VISUAL_DEFAULTS — rule-5 degrade when the registry module is stale) --
const AES_DEFAULTS = {
  style: 'standard', exaggeration: 1.0,
  withdrawDuration: 0.6, withdrawMargin: 0.12,
};
// 'break-slide' (§4 revision): the Strickland/SVB release-and-slide break
// look — classifies as 'break' (same follow-through/slide geometry) but
// selects the BEND_CLASS['break-slide'] force profile instead of the
// default pin-and-lean (Crimi documents BOTH styles; pin-and-lean is the
// documented C-bend technique and the default).
const STYLES = ['standard', 'masse', 'jump', 'break', 'break-slide', 'draw',
  'normal'];

// ---- shot classification thresholds (design §2.1; header table) ----
const CLASS_MASSE_THETA = 60 * Math.PI / 180;
const CLASS_JUMP_THETA = 25 * Math.PI / 180;
const CLASS_JUMP_V0 = 2.5;
const CLASS_BREAK_V0 = 6.5;
const CLASS_DRAW_B = -0.3;

// ---- follow-through profile (design §2.1) ----
// normal family: 1 ball diameter at soft speed rising to 2 at power speed —
// "tip finishes 1–2 ball diameters (57–114 mm) past the CB's original
// position; longer on power shots (~5–15 cm typical range)" (Dr. Dave draw
// drills). break: past the 15 cm typical top per the "more on breaks"
// clause, presentation-capped at 25 cm (the slide look carries the rest —
// Crimi on Strickland: "extended all the way down the table"). `ballD` is
// the RECORD cue ball's diameter (the §2.1 lengths are stated in ball
// diameters, so discipline records scale honestly).
const FT_V_LO = 1.5, FT_V_HI = 6.0;    // v0 ramp ends for the 1D→2D law
const FT_BREAK_CAP = 0.25;
const followThroughM = (cls, v0, ballD) => (cls === 'break'
  ? Math.min(FT_BREAK_CAP, 2 * ballD + 0.015 * v0)
  : ballD * (1 + Math.min(1, Math.max(0, (v0 - FT_V_LO) / (FT_V_HI - FT_V_LO)))));

// ---- finish/withdrawal constants ----
const HOLD_MIN_S = 0.35;   // earliest lift after contact [s]: the finish
                           // must settle before the player stands (the D4
                           // stay-law floor; §2.1 stay-down "~1–3+ s")
const STAY_MAX_S = 3.0;    // D4: min(3.0 s, ...) — §2.1 stay-down "~1–3+ s"
const S_GRIP_M = 0.78 * CUE_LEN; // DEFAULT-look grip-hand station [m behind
                           // the tip] — the escape-rotation pivot AND the
                           // bend/whip clamp point (literal mirror of
                           // cuestick.js WHIP_GRIP_S · CUE_LEN: one hand,
                           // one story). Feature 032 S2.5: per-armed-look
                           // value is m.rod.sGrip (WHIP_GRIP_S · look len —
                           // the shader's uFlex2S stays the 0.78 FRACTION,
                           // so the fraction law holds for every length).
                           // §4 revision: the pendulum-dip bridge fulcrum
                           // (S_BRIDGE 0.25) is GONE with the dip — the
                           // only remaining rotation is the constraint-
                           // derived escape about the hand that holds the
                           // cue, so a mm-scale floor deficit reads as the
                           // rod flattening (deficit/1.15 m of angle), not
                           // a staged butt lift
const TIP_FLOOR = R_TIP;   // DEFAULT-look lowest allowed tip-face-center
                           // height: the tip SURFACE touches the cloth at
                           // y = r·cos(theta) <= R_TIP, so flooring the
                           // center at R_TIP can only over-clear — touch,
                           // never penetrate. Feature 032 S2.5: frame-time
                           // consumers use the armed look's own tip radius
                           // (m.rod.rTip); this mirror remains for the
                           // resolve-time nose inset below (default-safe:
                           // every look's tip is within 0.75 mm of it).
const NOSE_INSET = R_TIP + 0.010; // tip stays a cm short of the cushion
                           // nose line — the follow-through never rams a
                           // cushion face (rails never penetrated)
const WD_LIFT_M = 0.25;    // withdrawal lift (player standing up)
const WD_PULL_M = 0.35;    // withdrawal pull-back along the cue axis
const WD_FADE_S = 0.18;    // terminal micro-fade of the WITHDRAWAL [s]: the
                           // lift/pull-back keeps easing while opacity
                           // ramps to 0 over the final ~11 frames at
                           // 60 fps (smoothstep peak step ≈ 0.14/frame —
                           // reads as a dissolve riding the decelerating
                           // motion, never a single-frame pop). D4 spirit:
                           // a near-vertical masse rod can still be in
                           // frame at tHide after only a 0.25 m lift — a
                           // hard hide there read as the object ceasing
                           // to exist (preview-pack defect, 2026-07-31).
                           // Camera-agnostic on purpose: the engine never
                           // reads the camera; compressed to the whole
                           // withdrawal when withdrawDuration < WD_FADE_S.
const FADE_S = 0.25;       // last-resort fade duration
const FADE_MARGIN_S = 0.05; // fade completes this early vs t_intrusion

// ---- whole-cue first-mode whip: CALIBRATION BLOCK (design §2.2;
// footage-calibrated per docs/research/whip-calibration-277.md) ----
// DOCTRINE (owner ruling, round-2 preview feedback 2026-07-31):
// REALISM-FIRST — the closer to real physics the better; exaggerated
// vibration amplitudes read as fake and are banned. Every constant below
// now carries FOOTAGE provenance (2026-07 tracking of Dr. Dave HSV A.25 /
// NV L.21 A6 / the SVB break clip — measurement tables and frame
// references in the doc above); when in doubt the doc's doctrine picked
// the SMALLER amplitude.
// The envelope RAMP models the mode assembling from the dispersive contact
// wave (Cross 2008: the wave reaches the butt in 2–4 ms) and is what keeps
// the rendered during-contact bend sub-mm (TP B-19 ~0.97 mm; NV L.21 A6
// measured sagitta 1.4–3.0 mm on the most violent stroke filmed). The
// rendered amplitude is additionally clamped per frame by the AVAILABLE
// CLEARANCE above the cloth (near-cloth vibration is quenched by the
// table — the draw-B fix below; never rendered through the bed).
const WHIP_REF_A = 0.010;  // [m] tip antinode at v0 = WHIP_REF_V, full
                           // offset. HSV A.25: 5–7 mm ± 2 one-sided peak
                           // at cue ≈ 5 m/s large offset (where the old
                           // 0.03 rendered 15–18 mm — the owner's "too
                           // big"); linear back-scaling to 8 m/s gives
                           // 8–11 mm, doctrine low-middle = 10 mm
                           // (defensible range 0.008–0.012)
const WHIP_REF_V = 8;      // [m/s] reference cue speed
const WHIP_V_EXP = 1.0;    // velocity exponent — LINEAR: only two clean
                           // speed classes measured (firm ~5, break
                           // ~10.5, the fast one offset-confounded); no
                           // basis for superlinear
const WHIP_MAX_A = 0.02;   // hard cap [m]: nothing in any clip — the
                           // extreme fouetté included — shows elastic
                           // deflection beyond ~1 cm; 2 cm keeps <= 2x
                           // exaggeration headroom while making "rubbery"
                           // renders unreachable
const WHIP_RAMP_S = 0.008; // mode-assembly ramp [s] (A6-confirmed:
                           // mm-scale bend through contact/clearance)
// Render-side zeta fallback when neither the spec nor the record carries
// the field: MUST mirror the kernel serde default (params.rs
// default_shaft_damping_ratio — 0.08 since the Amendment-025 revision
// note: HSV A.25 in-stroke peak-ratio 0.08–0.12, ring-down < 2 mm within
// 100–150 ms; the original 0.02 lingered ~4x longer than footage).
const SHAFT_ZETA_DEFAULT = 0.08;

// ---- FORCE-BASED table-contact bend (design-277 §4 revision, owner
// round-3 model 2026-07-31; grounded by the 2026-08-01 press-force deep
// search — full derivation chain + measurement tables in
// docs/research/press-bend-calibration-277.md; renders on the whip
// variant's uBendC C channel — tip pinned at the cloth, clamped at the
// grip, apex sagitta = the amplitude below) ----
// The v1 penetration-based bow (bend = min(2 cm, commanded press deficit),
// CLOTH_PRESS_M 8 mm) did not read ("非常 stiff") and the choreographed
// press behind it is gone. v2: the bend is driven by the tip's TABLE
// REACTION under a sustained lean/push F along the cue axis — the
// documented pro pin-and-lean break mechanic (AZB thread 212453: de
// Luna/Sigel, "happens long after the tip hits the cueball" =
// quasi-static body-weight lean with the tip pinned; Fran Crimi, Dr. Dave
// break FAQ: lean-into-the-shot "will definitely bend the shaft").
//   Load path (quasi-static; the tip does NOT arrest the cue axially —
//   Kornfeind/Baca 2015, Procedia Eng. 112:540, 20 elite players, 5 kHz
//   butt accelerometer: longitudinal accel at contact ≈ 0 on all
//   non-break shots — so the sliding tip carries only the lean's
//   VERTICAL component, never the full axial push):
//     N      = F·sinθ                          vertical cloth reaction
//     N_perp = N·cosθ + μN·sinθ = F·sinθ·(cosθ + μ·sinθ)
//   (μ = kinetic tip–cloth friction adds the drag component; from the
//   record cue ball's kernel cloth params u_s — the kernel exposes no
//   tip–cloth coefficient, so leather-on-cloth ≈ u_s is a DOCUMENTED
//   ESTIMATE, default 0.2, Dr. Dave typical.)
//   Deflection with the P-δ axial magnifier (the principled form of
//   "pushing along a shallow cue amplifies the bow": axial compression
//   P ≈ F magnifies transverse deflection; this REPLACES the earlier
//   F/tanθ divergence hypothesis, which presumed the tip axially arrests
//   the cue — contradicted by the Kornfeind coasting measurement):
//     δ = (N_perp / k) · 1/(1 − min(F, BEND_F_CLAMP)/BEND_PCR_N)
//   BEND_PCR_N = π²·EI_eff/L² = 384 N, pinned-pinned over the
//   grip-to-tip column (L = 1.152 m; EI_eff = 51.6 N·m² back-derived
//   from the MEASURED TP B.19 full-shaft stiffness over its 29 in test
//   lever — computed and pinned 2026-08-01; the search tracks' own
//   assumption spread runs 75–990 N). BEND_F_CLAMP = P_cr/2 = 192 N
//   keeps the magnifier ≤ 2 and every force under the derived maple
//   failure band (~220–350 N mid-span — cues DO snap doing this: Crimi
//   "crack or break it"; AZB repairman anecdotes; derived, not measured).
//   k per class from the TP B.19 static transverse stiffness anchors
//   (Predator Z-2, MEASURED: 3.1 lbf → 1.4 in full shaft = 2.214 lbf/in
//   = 0.39 N/mm; last 8 in 0.156 in = 19.87 lbf/in = 3.5 N/mm;
//   cross-validated by hard-maple MOE 12.62 GPa beam theory, same
//   order): break = 0.39 N/mm (bridge hand off in the lean/throw — rod
//   clamped only at the grip); masse/jump = 3.5 N/mm (elevated bridge
//   close to the tip — the short stiff lever); normal/draw = 1.5 N/mm
//   (bridge down at the finish lever ≈ 0.33 m: two-anchor power law
//   k(L) = 2.214·(29 in/L)^1.70 lbf/in through both TP B.19 points). The
//   anchor measures TIP deflection under TIP load; identifying it with
//   the constrained bow's APEX sagitta is the stated O(1) engineering
//   step (longer grip lever vs stiffer tip pin — offsetting).
// CONSISTENCY LOOP (independent routes agree): the TP B.4 stroke-force
// model (m_c 0.539 kg, 0.305 m stroke, v_f 6.706 m/s) gives 39.7 N
// average / 62–80 N peak for a firm 15 mph stroke, independently
// matching Jal's 15–20 lbf peak estimate (Dr. Dave stroke-acceleration
// FAQ); 40–80 N × sin(3–6°) ⇒ 2–8 N tip load ⇒ 5–20+ mm through the
// MEASURED k — exactly the footage-measured sagitta band (de Luna
// pin-and-lean break ≈ 11–27 mm; SVB release-slide 1.5–4.8 mm;
// press-bend-calibration-277.md §2).
// CAP INDEPENDENCE: the whip-calibration memo's ceilings govern the FREE
// whip mode only; this channel's bound is the compliance/buckling-derived
// peak perM·F0·mag (plan.bend.peakM — replaces v1's flat 2 cm cap), under
// a last-resort never-rubbery ceiling mirroring cuestick.js RAIL_MAX. The
// bend is CONSTRAINT-DRIVEN and deliberately NOT under
// aesthetics.exaggeration (exaggeration scales the free vibration only).
//
// ========== F_lean / stiffness CONSTANTS (delimited block) ==========
// Provenance per line (2026-08-01 deep search + footage pass). The
// searched-and-not-found ledger (press-bend-calibration-277.md §4) is
// explicit: NO source anywhere reports a directly measured player push
// force in newtons, and NO published on-table bend sagitta exists — so
// F0/ramp/tau are DERIVED from the grounded chain above and FITTED to
// the measured footage, per-class:
//   break (pin-and-lean — the DEFAULT break profile; documented pro
//     technique, AZB 212453 de Luna/Sigel + Crimi): F0 70 N = the TP B.4
//     firm-stroke peak band 62–80 N sustained as the body-weight lean;
//     ramp 0.12 s (the bow builds over ~100–150 ms: A.122 sub-span arc,
//     SVB settle); tau 0.45 s (the de Luna bow decays over ~0.2+ s).
//     Renders ≈ 23 mm at θ 6° — inside the de Luna measurement 11–27 mm.
//   break-slide (release-and-slide, Strickland/SVB — forced via the
//     cuevisuals/aesthetics style key): F0 12 N = cue weight (0.539 kg ⇒
//     5.3 N) + residual slide deceleration ~7 N; renders ≈ 3.4 mm at
//     θ 6° — inside the SVB close-view measurement 1.5–4.8 mm.
//   masse/jump (arrest): F0 45/40 N = the arrest spike (a TP B.4-scale
//     stroke killed over ~2–3 cm of cloth + grip yield; Kornfeind:
//     breaks are still accelerating AT contact, +3.9 m/s² — the hand is
//     still driving when the tip lands), fast ramp/decay 0.02/0.06 s —
//     a spike, not a lean. The only high-speed massé follow-through
//     clips (HSV A.60/A.61) are tip close-ups with no measurable span
//     (ledger §4); doctrine picks the low side. Renders ≈ 8 mm (θ 65°) /
//     ≈ 6 mm (θ 30°) — UNDER the break via the stiffness route (short
//     elevated-bridge lever), the owner's own massé-smaller expectation.
//   normal/draw (finish press; fires only when the line reaches cloth):
//     F0 15 N = the MEASURED post-impact grip "hump" (TP A.9 butt
//     accelerometer, a few g on the 0.539 kg cue ⇒ ~5–30 N; Kornfeind:
//     non-break strokes COAST at contact, so no sustained push), brief
//     0.06/0.10 s profile. Renders ≈ 0.5–1.5 mm — subtle by
//     measurement, not by timidity.
const BEND_CLASS = {
  break: { F0: 70, rampS: 0.12, tauS: 0.45, kNpm: 390 },
  'break-slide': { F0: 12, rampS: 0.1, tauS: 0.3, kNpm: 390 },
  masse: { F0: 45, rampS: 0.02, tauS: 0.06, kNpm: 3500 },
  jump: { F0: 40, rampS: 0.02, tauS: 0.06, kNpm: 3500 },
  normal: { F0: 15, rampS: 0.06, tauS: 0.1, kNpm: 1500 },
  draw: { F0: 15, rampS: 0.06, tauS: 0.1, kNpm: 1500 },
};
const BEND_PCR_N = 384;      // Euler critical load [N] — pinned-pinned
                             // grip-to-tip column, EI_eff from TP B.19
                             // (derivation above; pinned 2026-08-01)
const BEND_F_CLAMP = BEND_PCR_N / 2; // P-δ magnifier hard clamp [N]:
                             // mag ≤ 2, force far below the derived
                             // ~220–350 N maple failure band
const BEND_HARD_MAX = 0.05;  // last-resort visual ceiling [m] (cuestick.js
                             // RAIL_MAX mirror — never rubbery; the model
                             // peak binds first for every shipped class)
const MU_TIP_DEFAULT = 0.2;  // tip–cloth slide fallback when the record
                             // carries no finite u_s (documented estimate)
// Derived chord-deviation shape statics (GH-293 — mirror of the
// FLEX2_GLSL derivation in cuestick.js; the beam equation, not an
// authored bump): on the tip→grip span the bend displaces by
// S(bb) = (3√3/2)·bb·(1 − bb²) TOWARD the cloth (apex 1 at bb = 1/√3,
// opposite the tip's perpendicular table reaction), and behind the grip
// the rigid butt tail counter-lifts off the chord by the C¹ continuation
// −3√3·(bb − 1) — max |S| over the whole rod is the tail at the bumper.
const BEND_SHAPE_NORM = 3 * Math.sqrt(3) / 2; // apex normalizer ≈ 2.598
const BEND_ENV_MAX = 3 * Math.sqrt(3) * (CUE_LEN / S_GRIP_M - 1);
                             // ≈ 1.466 — max |S(bb)| anywhere on the rod
                             // (the bumper tail): the omnidirectional
                             // capsule-inflation gain on fx.bend
// Floor-cap grid over the tip→grip span (GH-293 review r2 P2 — the belly's
// SURFACE, not just its axis, must respect the cloth): fixed stations
// with the TRUE taper radius and the derived shape, including every
// radius breakpoint and the shape apex. The per-frame cap is the pointwise
// min of (TIP_FLOOR − r·cosθe + s·sinθe)/(S·cosθe); station terms are
// linear/smooth in s, so the ≤ 12 mm grid pitch leaves sub-0.1 mm
// inter-grid slack — inside the tip-floor rule's own over-clearance class.
// Feature 032 S2.5: the grid (and the grip station / tip floor it keys on)
// is now PER-ARMED-LOOK — makeRodPack derives it from a look's own profile
// breakpoints exactly as the old module-const BEND_GRID derived it from the
// default profile (ROD_DEFAULT is bit-identical to the pre-032 grid). Note
// BEND_ENV_MAX above is look-INVARIANT: sGrip = WHIP_GRIP_S·len keeps
// len/sGrip = 1/0.78 for every look.
function makeRodPack(len, rTip, profile) {
  const sGrip = WHIP_GRIP_S * len;
  const set = new Set([sGrip / Math.sqrt(3)]);
  for (const [s] of profile) if (s > 0 && s < sGrip) set.add(s);
  for (let i = 1; i <= 96; i++) set.add((sGrip * i) / 96);
  const grid = [...set].filter((s) => s > 0 && s <= sGrip)
    .sort((a, b) => a - b)
    .map((s) => {
      const bb = s / sGrip;
      return { s, r: rodRadiusAt(profile, s),
        S: BEND_SHAPE_NORM * bb * (1 - bb * bb) };
    });
  // `profile` rides the pack (GH-525 bare review review round-2 finding 3):
  // arm() verifies a non-default pack against the six segments buildCue
  // ACTUALLY returned before trusting it (rodBuildMatches below).
  return { len, rTip, sGrip, grid, profile };
}
const ROD_DEFAULT = makeRodPack(CUE_LEN, R_TIP, ROD_PROFILE);
/** Rod pack for an armed cue id — the cuelooks.js registry via feature
 * detection (rule 5): stale/absent registry, or the defaults identity,
 * lands on ROD_DEFAULT (today's exact numbers). The returned pack is a
 * CANDIDATE: arm() installs a non-default pack only after rodBuildMatches
 * proves the built rod renders this profile (finding 3 below). */
function rodPackFor(cueId) {
  if (typeof looksMod.cueLookFor !== 'function') return ROD_DEFAULT;
  const lk = looksMod.cueLookFor(cueId);
  if (!lk || lk === looksMod.CUE_LOOK_DEFAULTS || !lk.dims) return ROD_DEFAULT;
  const d = lk.dims;
  const s1 = d.TIP_LEN, s2 = s1 + d.FERRULE_LEN, s3 = s2 + d.SHAFT_LEN;
  const s4 = s3 + d.JOINT_LEN, s5 = s4 + d.BUTT_LEN, len = s5 + d.CAP_LEN;
  return makeRodPack(len, d.R_TIP, [
    [0, d.R_TIP * 0.94], [s1, d.R_TIP], [s2, d.R_FERRULE],
    [s3, d.R_JOINT], [s4, d.R_JOINT + 0.0004], [s5, d.R_BUTT],
    [len, d.R_BUTT * 0.92],
  ]);
}
// GH-525 bare review review round-2 (finding 3): MIXED-CACHE rod mismatch.
// A current cuepost.js+cuelooks.js paired with a STALE cuestick.js (whose
// buildCue ignores opts.cueId) renders the default 1.477 m rod while the
// look-derived pack (e.g. the 1.041 m jump) drives the pivot/floor/bend
// model — model and shader disagree (grip station ~0.34 m off, floor caps
// solved for a rod that is not on screen, visible clipping). The pack is
// therefore verified against the ACTUAL BUILD: buildCue's six-segment law
// (cuestick.js header) makes every look a Group of 6 CylinderGeometry
// meshes in tip→cap order whose (radiusTop, radiusBottom, height) are
// exactly the pack profile's segment stations, so a per-segment compare
// within ROD_MATCH_EPS proves the rendered rod IS the pack's rod.
// Mismatch (or an unmeasurable build) falls to ROD_DEFAULT — rule-5
// fail-closed: the shared-envelope containment scans are look-invariant,
// and the default pack describes the rod a stale cuestick.js actually
// renders. 1 µm epsilon: float noise is ~1e-16 here (both sides carry the
// same registry doubles), while distinct looks differ by >= 0.3 mm.
const ROD_MATCH_EPS = 1e-6;
function rodBuildMatches(pack, group) {
  const prof = pack?.profile;
  const kids = group?.children;
  if (!Array.isArray(prof) || !Array.isArray(kids)
    || kids.length !== prof.length - 1) return false;
  for (let i = 0; i < kids.length; i++) {
    const p = kids[i]?.geometry?.parameters;
    if (!p) return false;
    const segLen = prof[i + 1][0] - prof[i][0];
    if (!(Math.abs(p.height - segLen) <= ROD_MATCH_EPS
      && Math.abs(p.radiusTop - prof[i][1]) <= ROD_MATCH_EPS
      && Math.abs(p.radiusBottom - prof[i + 1][1]) <= ROD_MATCH_EPS)) {
      return false;
    }
  }
  return true;
}
// ================== end grounded constants block ==================

// ---- time-domain intrusion scan (D4 / #64-in-time) ----
// Adaptive LIPSCHITZ-CONE subdivision (review r1 P1: endpoint sampling on a
// fixed grid can miss a fast crossing — a ball at 17 m/s traverses the
// whole rod between 2 ms samples with both endpoints clear, and a
// small-withdrawDuration lift can sweep a resting ball between its own
// endpoints). The clearance c(t) = min over balls of (ball-to-rod-capsule
// distance) is L-Lipschitz with L = max ball speed + max rod-point speed:
// |c(t) − c(t0)| <= L·|t − t0| holds ACROSS kernel events and choreography
// kinks (positions are continuous; only velocities jump, and their
// magnitudes stay under the bound), so an interval [t0, t1] is provably
// clear when min(c0, c1) − L·(t1 − t0)/2 >= CLEAR_M — otherwise it splits,
// down to SCAN_DT_MIN where a violation is declared (conservative: the
// residual cone slack L·SCAN_DT_MIN/2 only ever fires EARLIER). A ball
// leaving the min-set mid-interval (pocketing) weakens the right cone, so
// the skip additionally requires c0 − L·(t1 − t0) >= CLEAR_M (the left
// cone alone must cover the interval); balls never re-enter (the CB's
// post-contact arming time is a mandatory interval boundary).
const CLEAR_M = 0.003;       // required ball-to-rod clearance [m]
const SCAN_DT_MIN = 1 / 8192; // finest subdivision [s]
const ARM_CLEAR = 0.010;   // cue ball joins the scan once it has separated
                           // this far from the rod (the tip is ON the ball
                           // at contact BY DEFINITION — that is contact,
                           // not intrusion)
const CB_ARM_CAP_S = 0.5;  // if the CB has not separated by then, fail to
                           // the immediate-fade degenerate path
// Pocketed balls leave the KERNEL state instantly, but the renderer keeps
// the mesh visibly sinking through the pocket cup for a while (game.js
// poseSink / sinkpivot.js — review r2 P1). The scan therefore keeps a
// pocketed ball as an obstacle at its frozen capture position, inflated by
// the pocket-mouth-scale glide envelope, until the sink animation is over.
const SINK_GRACE_S = 0.8;  // covers the ~0.45 s sink TTL + slack
const SINK_PAD = 0.08;     // lateral glide bound: capture point → cup center

const DEG = Math.PI / 180;
const smooth = (u) => u * u * (3 - 2 * u);

// GH-911 C2: `railGeom` is the rail geometry both floor calls take (railOK
// and resolve's geometry statics). The live instance omits it, so those calls
// keep cuestick.js's default, the ACTIVE table (activeRailGeom); only
// planRecordRod below passes the record's table (plan:342).
export function createCuePost({ machine, game, scene, railGeom }) {
  let armed = null; // resolved model — null = disarmed
  let cue = null;   // lazily built whip-variant cuestick instance
  let mats = null;  // its six materials (fade opacity re-assertion)
  // side record of the last applied frame (e2e instrument, the
  // previewInks side-record precedent — never a scene readback)
  let last = null;
  // GH-325 (journey-QA wave 1 console hygiene): framing-refusal LOG dedup.
  // The live/DVR adoption lanes arm real records sight-unseen and re-arm
  // the SAME record bytes on every render pass, so one routine near-rail /
  // near-ball record re-warned per pass (11 warnings in a short QA
  // session, both refusal variants confirmed verbatim). LOGGING ONLY — the
  // engine still fail-closes identically: the FIRST refusal of a
  // (record-identity, reason) pair logs console.warn, repeats demote to
  // console.debug, and the structured counter below keeps the diagnostic
  // trail (api.rejections(), surfaced read-only as
  // __test.cuePostRejections). Key = record fingerprint + spec JSON +
  // refusal message, where the fingerprint is the loaded record's shot
  // tuple + initial ball layout — exactly the inputs a framing refusal is
  // a pure function of, so byte-equal records (DVR/replay re-arms of the
  // same bytes) dedup while records that merely SHARE a spec and message
  // text never merge (review r1 P2: liveCuePostSpec does not encode ball
  // layout and the sweep-refusal text carries no record identity, so a
  // spec+message key alone collapsed distinct records). Computed on the
  // refusal path only (rare); growth is bounded by distinct refused
  // records per session (one small string entry each).
  const refusals = new Map(); // key -> count
  let refusalsTotal = 0;
  const recordFingerprint = () => {
    const rec = game.record;
    if (!rec) return 'no-record';
    // the COMPLETE record identity (review r2+r5 P2): resolve() consumes
    // the shot tuple, the initial section (table geometry, ball params,
    // layout, equipment provenance), rec.options.cue AND the event stream
    // (the sampler is event-derived), so the fingerprint hashes the WHOLE
    // parsed record — byte-identical records (DVR/replay re-arms) map to
    // identical JSON (parse preserves key order), distinct records never
    // hand-picked-field-collide. Hashed (length + DJB2-xor) so keys and
    // the rejections() diagnostic stay small; refusal-path only (rare —
    // sub-ms even on break-sized records), and a hash collision's worst
    // case is one demoted log line, never a behavior change
    // (logging-side map).
    const sInit = JSON.stringify(rec);
    let h = 5381 >>> 0;
    for (let i = 0; i < sInit.length; i++) {
      h = ((h * 33) ^ sInit.charCodeAt(i)) >>> 0;
    }
    return `${sInit.length}:${h.toString(36)}`;
  };

  const need = (cond, msg) => {
    if (!cond) throw new Error(`cuePost: ${msg}`);
  };
  const needNum = (v, at) => {
    need(Number.isFinite(v), `${at} must be a finite number, got ${v}`);
  };
  /** DATA-DEPENDENT framing refusal (design 277 slice 3): the spec is
   * well-formed but THIS record's geometry cannot host a safe cue path
   * (rail-unsafe framing, pre-contact sweep through a resting ball). The
   * live/DVR adoption lanes arm real records sight-unseen and degrade to
   * the pre-277 presentation on refusal — an EXPECTED, per-record outcome,
   * so arm() logs it as console.warn, not console.error (the zero-error
   * e2e gates stay meaningful). Spec-shape violations keep throwing plain
   * Errors and stay loud (harness programming errors). */
  const refuse = (cond, msg) => {
    if (cond) return;
    const e = new Error(`cuePost: ${msg}`);
    e.framingRefusal = true;
    throw e;
  };

  // per-cue look (feature 032 S2.5 — GH-525 D5): the whip rod renders the
  // armed record's cue id so the aim→post-strike swap carries no material/
  // length flash. Rebuild-on-change disposes the previous six-segment
  // build; a stale cuestick.js ignores opts.cueId harmlessly (rule 5).
  let cueLookId = null;
  function ensureCue(cueId) {
    const id = typeof cueId === 'string' ? cueId : 'standard';
    if (cue && cueLookId === id) return;
    need(typeof cueMod.buildCue === 'function'
      && typeof cueMod.poseCue === 'function',
    'cuestick.js buildCue/poseCue unavailable (stale module)');
    if (cue) {
      scene.remove(cue.group);
      for (const m of cue.group.children) {
        m.geometry.dispose();
        // cache-owned registry maps are never consumer-disposed
        // (cuelooks.js obCueLookCached — GH-525 round-4 latency law)
        if (m.material.map?.obCueLookCached !== true) {
          m.material.map?.dispose();
        }
        m.material.dispose();
      }
    }
    cue = cueMod.buildCue({ whip: true, cueId: id });
    cue.group.visible = false;
    // GH-967: the whip rod stays in the scene (hidden) between strokes and
    // shares the 'obCueStick' name — claim it so a name walk for the
    // GAMEPLAY cue (shell.js §7.1 fallback) can never resolve it
    cue.group.userData.obCueRole = 'post';
    mats = cue.group.children.map((m) => m.material);
    scene.add(cue.group);
    cueLookId = id;
  }

  function zeroFlex() {
    const u = cue?.flex?.u;
    if (!u) return;
    u.uFlexA.value.set(0, 0, 0);
    u.uRailA.value.set(0, 0, 0);
    u.uFlex2A?.value.set(0, 0, 0); // whip term (feature-detected: a stale
                                   // cuestick.js has no uFlex2A — rule 5)
    u.uBendC?.value.set(0, 0, 0);  // table-contact bow (same rule 5)
  }

  function setOpacity(o) {
    if (!mats) return;
    const fading = o < 1;
    for (const m of mats) {
      if (m.transparent !== fading) {
        m.transparent = fading;
        // three r170 bakes an OPAQUE define into the compiled program
        // (fragment alpha forced to 1 for non-transparent materials), and
        // flipping `transparent` does NOT bump material.version — without
        // needsUpdate the cached opaque program keeps rendering alpha = 1
        // and the dissolve exists only in the instrumentation while the
        // pixels still pop (review PR-280 P1; the e2e now proves the
        // dissolve on PIXELS). Recompile on the flip: both program
        // variants live in three's cache after the first fade, so
        // subsequent flips are a cache hit, and the visible life of the
        // cue stays on the ordinary opaque path.
        m.needsUpdate = true;
      }
      if (m.opacity !== o) m.opacity = o;
    }
  }

  // ---- closed-form geometry core (scalar; poseCue literal mirror) --------
  // poseCue's group origin IS the tip face center:
  //   tip(pull) = anchor + dirV·(−(R+TIP_GAP+pull)·cosT + b·R·sinT)
  //             + up·((R+TIP_GAP+pull)·sinT + b·R·cosT) + right·(a·R)
  // with right = dirV × up = (−dz, 0, dx). The tip→butt axis at rotation
  // angle d is axisDir(T+d) = (−dx·cos(T+d), sin(T+d), −dz·cos(T+d)) — a
  // rigid rotation by −d about the shooter-right axis through the GRIP
  // pivot (poseCue's elevation sense; §4 revision: the only rotation is
  // the constraint-derived escape, d <= 0, tip up / rod flattening), which
  // simply re-elevates the axis while the tip swings about the pivot.
  function tipAt(m, pull, out) {
    const g = m.ballR + TIP_GAP + pull;
    out.x = m.ax + m.dx * (-g * m.cosT + m.b * m.ballR * m.sinT)
      + (-m.dz) * (m.a * m.ballR);
    out.y = m.ay + g * m.sinT + m.b * m.ballR * m.cosT;
    out.z = m.az + m.dz * (-g * m.cosT + m.b * m.ballR * m.sinT)
      + m.dx * (m.a * m.ballR);
    return out;
  }

  /** Set the escape pivot (m.px/py/pz) to the CURRENT pose's grip
   * station: the hand holds the rod at S_GRIP_M behind the tip and RIDES
   * the stroke, so the pivot is a fixed ROD station with a moving world
   * position (review 277-r3 P2: a world-frozen contact-pose pivot drifts
   * to rod station ~0.94 after a full break advance while the shader's C
   * clamp stays at 0.78 — the rotation center and the bend clamp must be
   * the same hand). Every dipPoint/railOK consumer sets it for its own
   * pull first. */
  const tmpPivotTip = { x: 0, y: 0, z: 0 };
  function setPivot(m, pull) {
    tipAt(m, pull, tmpPivotTip);
    m.px = tmpPivotTip.x + (-m.dx * m.cosT) * m.rod.sGrip;
    m.py = tmpPivotTip.y + m.sinT * m.rod.sGrip;
    m.pz = tmpPivotTip.z + (-m.dz * m.cosT) * m.rod.sGrip;
  }

  /** Rotate point p about the GRIP pivot by −delta around shooter-right
   * (in place; the pivot fields are set per call via setPivot).
   * Decomposition: forward (dirV) / up / right; right-component
   * invariant; (vf, vu) → (vf·cos + vu·sin, −vf·sin + vu·cos). */
  function dipPoint(m, p, delta) {
    if (delta === 0) return p;
    const wx = p.x - m.px, wy = p.y - m.py, wz = p.z - m.pz;
    const vf = wx * m.dx + wz * m.dz;
    const vu = wy;
    const vr = wx * (-m.dz) + wz * m.dx;
    const c = Math.cos(delta), s = Math.sin(delta);
    const vf2 = vf * c + vu * s, vu2 = -vf * s + vu * c;
    p.x = m.px + m.dx * vf2 + (-m.dz) * vr;
    p.y = m.py + vu2;
    p.z = m.pz + m.dz * vf2 + m.dx * vr;
    return p;
  }

  const tmpP = { x: 0, y: 0, z: 0 };
  /** Tip-face-center height for (advance, rotation) — the cloth-clamp
   * probe. Pivot = this advance's own grip station (setPivot). */
  function tipYAt(m, adv, delta) {
    setPivot(m, m.pC - adv);
    tipAt(m, m.pC - adv, tmpP);
    dipPoint(m, tmpP, delta);
    return tmpP.y;
  }

  /** Whole-cue-mode displacement ENVELOPE at tau seconds past contact —
   * bounds |uFlex2A| (the rendered tip's shader displacement; the ring/bow
   * sin(pi·s) terms are exactly zero at the tip). Joins the cloth floor
   * (review r1 P1: the FLEX2 shape is maximal at the tip, so the nominal
   * pose must hover above the cloth by the vibration amplitude — the tip
   * settles onto the cloth as the mode decays) and inflates the intrusion
   * capsule. */
  function whipEnvAt(m, tau) {
    if (tau < 0 || m.whipA === 0) return 0;
    return m.whipA * smooth(Math.min(1, tau / WHIP_RAMP_S))
      * Math.exp(-2 * Math.PI * m.f1 * m.zeta * tau);
  }

  /** Rail-safety probe for a ROTATED/LIFTED pose (review r2 P1 lineage:
   * the escape's tip-up rotation lowers the BUTT section behind the grip
   * pivot, which near a cushion is exactly the section crossing the rail
   * the address floor was solved for). The rotated rod is a straight rod
   * at elevation thetaR + delta whose tip sits at the rotated(+lifted)
   * tip point — re-expressed as a virtual zero-offset poseCue address so
   * the GEOMETRY OWNER's cueMinElevationDeg (rail bands + pocket carve,
   * ACTIVE table) judges the exact rod line. Feature-detected (rule 5): a
   * stale cuestick.js without the export skips the clamp (pre-277
   * degrade). */
  function railOK(m, pull, delta, lift) {
    if (typeof cueMod.cueMinElevationDeg !== 'function') return true;
    const e = m.thetaR + delta;
    setPivot(m, pull);
    tipAt(m, pull, tmpP);
    dipPoint(m, tmpP, delta);
    const g = m.ballR + TIP_GAP;
    const ce = Math.cos(e), se = Math.sin(e);
    // invert poseCue at a = b = 0: pos = tip + dirV·g·cosE − up·g·sinE
    const pos = {
      x: tmpP.x + m.dx * g * ce,
      y: tmpP.y + lift - g * se,
      z: tmpP.z + m.dz * g * ce,
    };
    const floorDeg = cueMod.cueMinElevationDeg(pos, m.phi, 0, 0, railGeom,
      m.ballR);
    return !Number.isFinite(floorDeg) || e >= floorDeg * DEG - 1e-9;
  }

  /** Largest rotation <= want keeping the tip at/above `floor` (goes
   * NEGATIVE down to `lo0` — the §4-revision escape: the rod rotates
   * tip-up about the GRIP so the advancing declined cue RIDES the cloth
   * instead of sinking through it; `lo0` is the rail-safe lower bound).
   * Returns NaN when the floor is unreachable inside the rail-safe
   * domain — the caller hides the frame rather than render an unsafe
   * pose (review r2 P2, fail-closed). */
  function clothClamp(m, adv, want, floor, lo0) {
    if (tipYAt(m, adv, want) >= floor) return want;
    let lo = lo0, hi = want; // tipY is monotone decreasing in dip
    if (tipYAt(m, adv, lo) < floor) return NaN; // unreachable — hide
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (tipYAt(m, adv, mid) >= floor) lo = mid;
      else hi = mid;
    }
    return lo; // land ON the safe side
  }

  // ---- closed-form timeline (pure in t over the resolved model) ----------
  function advRaw(m, t) {
    const tau = t - m.tc;
    if (tau <= 0) return 0;
    if (m.dFt <= 0) return 0;
    if (tau >= m.dFt) return m.F;
    return m.vC * tau - (m.vC / (2 * m.dFt)) * tau * tau;
  }
  const advEff = (m, t) => Math.min(advRaw(m, t), m.advCap);

  const wdU = (m, t) => (m.mode === 'withdraw' && t >= m.tLift
    ? Math.min(1, (t - m.tLift) / m.wd) : 0);

  /** Effective rotation at t — §4 revision: NO choreographed dip exists
   * (the pendulum press read as staged and is removed). The only rotation
   * is the CONSTRAINT-DERIVED escape about the grip pivot: 0 while the
   * advancing line keeps the tip above the cloth (low-elevation short
   * follow-throughs finish HOVERING — desired), NEGATIVE (tip up, the rod
   * flattening in the hand) exactly as far as the floor requires when the
   * extended line reaches the cloth — cap (c) of the bend model: the rod
   * rotates instead of pressing ever deeper. Clamped to the arm-resolved
   * rail-safe interval [railLo, 0]; the advance is cloth-arrested at arm
   * time (advCap, the draw-B fix) wherever that interval cannot buy the
   * tip back above the floor, so clothClamp's NaN branch stays
   * unreachable by construction for on-bed anchors (defensive last
   * resort; the e2e visibility-contiguity law asserts it never fires).
   * The floor is bare TIP_FLOOR: the whip no longer raises the POSE — the
   * whip AMPLITUDE is clamped by the available clearance instead
   * (flexAt). */
  function deltaEff(m, t) {
    const tau = t - m.tc;
    if (tau <= 0) return 0;
    return clothClamp(m, advEff(m, t), 0, m.rod.rTip, m.railLo);
  }

  /** Axial pull at t — cuestrike's pre-contact stroke (literal mirror),
   * then contact-relative advance + the withdrawal pull-back. */
  function pullAt(m, t) {
    if (m.practice && t < m.from) {
      // GH-363 practice strokes (cuestrike.js literal twin): raised-cosine
      // feathers on the resolved schedule; pull >= 0 always, so the tip
      // never advances past the address rest gap — a feather physically
      // cannot touch the ball.
      const pr = m.practice;
      if (t < pr.start || t >= pr.holdFrom) return 0; // address / front hold
      for (const f of pr.feathers) {
        if (t < f.t0 + f.dur) {
          const u = (t - f.t0) / f.dur;
          return u <= 0 ? 0 : f.amp * 0.5 * (1 - Math.cos(2 * Math.PI * u));
        }
      }
      return 0;
    }
    if (t < m.from) return 0;
    if (t < m.tPause) return m.P * m.ease((t - m.from) / m.durPull);
    if (t < m.tThrust) return m.P;
    if (t < m.tc) {
      const u = (t - m.tThrust) / m.durThrust;
      return m.P - m.stroke * u * u;
    }
    return m.pC - advEff(m, t) + WD_PULL_M * smooth(wdU(m, t));
  }

  const liftAt = (m, t) => WD_LIFT_M * smooth(wdU(m, t));

  /** Post-impact flex, closed form in t: 250 Hz end ring (cuestrike
   * mirror), thrust bow pre-contact, the whole-cue first mode at the
   * catalog cue's (f1, zeta), and the FORCE-BASED table-contact bend (§4
   * revision). Returns scalars for the uniform writes AND the scan/e2e
   * envelope (`whipEnv` is the free-space ENVELOPE — the conservative
   * capsule bound; `whip` is the RENDERED value after the availability
   * clamp).
   *
   * Whip availability clamp (draw-B fix + realism doctrine 2026-07-31): a
   * real vibration a few mm above the bed is QUENCHED by the table — it
   * cannot swing 15 mm through the cloth, and hovering the whole pose to
   * make room (the old whip-raised floor) both looked wrong and collided
   * with the rail interval (the teleport). The rendered amplitude is
   * min(envelope, clearance of the CLAMPED tip above the floor), so the
   * flexed tip may touch, never penetrate — by construction. While the
   * tip rides the floor the gap is zero and the whip is fully quenched —
   * physical, and it keeps the whip and the bend from ever stacking.
   *
   * Bend (constants-block model; direction/shape derived — GH-293): fires
   * only from the arm-resolved cloth-touch time tTouch (hovering finishes
   * NEVER bend — tTouch is Infinity when the extended line stays above
   * the floor). Amplitude = min(perM · F(t) · mag(F(t)), BEND_HARD_MAX,
   * floor cap) with F(t) = F0 · smooth-ramp over rampS · exponential
   * decay over tauS past the ramp — the sustained lean building as the
   * tip lands and dying as the stroke ends — released by the withdrawal
   * ease (the press ends as the player stands). perM = sinθ·(cosθ +
   * μ·sinθ)/k [m/N] and the clamped P-δ magnifier are resolved statically
   * (resolve()/constants block); the peak perM·F0·mag(F0) is the
   * plan-disclosed compliance/buckling bound the e2e gate re-derives and
   * asserts. NOT under aesthetics.exaggeration — constraint-driven, not
   * presentation.
   *
   * Bend floor cap (the belly's touch-never-penetrate law, geometric): the
   * belly sags TOWARD the cloth (the derived S(bb) — GH-293), dropping
   * bend·S(bb)·cosθe below the chord while the chord rises bb·L_g·sinθe
   * above the pinned tip. Two bounds, both per-frame at θe (the escaped
   * elevation — a rod flattened by the escape has less belly room,
   * physically): (a) AXIS bound — S(bb)/bb = norm·(1 − bb²) is maximal at
   * bb→0, so bend <= tanθe·L_g/norm keeps every station's axis at/above
   * the tip's own floored center height, and it COMPOSES with the whip's
   * gap clamp (whip drop <= gap·(1−bb)² <= gap; bend drop <= chord rise;
   * their sum never outruns gap + chord rise); (b) SURFACE bound (review
   * r2 P2) — the tapered mesh is wider than the tip (ferrule 6.4 →
   * grip-station ~12 mm), so the cap is additionally the BEND_GRID
   * pointwise min of (TIP_FLOOR − r(s)·cosθe + s·sinθe)/(S(bb)·cosθe),
   * which keeps the belly's SURFACE at/above the cloth using the true
   * taper (a near-level touching rod gets almost no belly — correct: it
   * is lying on the table). The butt tail counter-lifts AWAY from the
   * cloth and needs no floor. */
  function flexAt(m, t) {
    let bow = 0;
    let v = 0;
    if (t >= m.tThrust && t < m.tc) {
      v = m.vC * ((t - m.tThrust) / m.durThrust);
    } else if (m.dFt > 0 && t >= m.tc && t < m.tFtEnd) {
      v = m.vC * (1 - (t - m.tc) / m.dFt);
    }
    bow = Math.min(BOW_MAX, v * BOW_PER_MPS);
    const tau = t - m.tc;
    let ring = 0, ringEnv = 0;
    if (tau >= 0 && tau < RING_LIFE) {
      ringEnv = m.ringA * Math.exp(-tau / RING_TAU);
      ring = ringEnv * Math.sin(2 * Math.PI * RING_F * tau);
    }
    const whipEnv = whipEnvAt(m, tau);
    let whip = 0;
    let bend = 0;
    if (tau >= 0) {
      // one pose probe serves both consumers: the whip's availability gap
      // and the bend's floor cap read the same escaped elevation
      const needPose = whipEnv > 0 || t >= m.tTouch;
      const delta = needPose ? deltaEff(m, t) : 0;
      const deltaOK = !Number.isNaN(delta);
      if (whipEnv > 0) {
        const gap = !deltaOK ? 0
          : Math.max(0, tipYAt(m, advEff(m, t), delta) + liftAt(m, t)
            - m.rod.rTip);
        const whipEff = Math.min(whipEnv, gap);
        whip = whipEff * Math.sin(2 * Math.PI * m.f1 * tau);
      }
      if (t >= m.tTouch) {
        const dt = t - m.tTouch;
        const F = m.bendF0 * smooth(Math.min(1, dt / m.bendRampS))
          * Math.exp(-Math.max(0, dt - m.bendRampS) / m.bendTauS);
        // P-δ magnifier on the instantaneous lean force (clamped; §4
        // revision constants block) — monotone in F, so the peak is
        // exactly plan.bend.peakM at F = F0
        const mag = 1 / (1 - Math.min(F, BEND_F_CLAMP) / BEND_PCR_N);
        // floor cap (doc above): the sagging belly may touch, never
        // penetrate. Axis bound bend <= tanθe·L_g/norm (every station's
        // drop bounded by the chord's rise off the pinned tip) AND the
        // SURFACE bound over BEND_GRID (GH-293 review r2 P2: the tapered
        // mesh is wider than the tip — a near-level touching rod has
        // almost no belly room even when its axis clears).
        const thetaE = m.thetaR + (deltaOK ? delta : 0);
        const cosE = Math.cos(thetaE), sinE = Math.sin(thetaE);
        let floorCap = Math.max(0, sinE / cosE) * m.rod.sGrip
          / BEND_SHAPE_NORM;
        for (const g of m.rod.grid) {
          const cap = (m.rod.rTip - g.r * cosE + g.s * sinE) / (g.S * cosE);
          if (cap < floorCap) floorCap = cap;
        }
        if (!(floorCap > 0)) floorCap = 0;
        bend = Math.min(m.bendPerM * F * mag, BEND_HARD_MAX, floorCap)
          * (1 - smooth(wdU(m, t)));
      }
    }
    return { bow, ring, ringEnv, whip, whipEnv, bend };
  }

  // ---- time-domain intrusion machinery (D4; #64 extended) ----------------
  /** Rod pose at scan/apply time t: tip point + unit tip→butt axis, with
   * the escape/advance/withdrawal motion applied. Pure and
   * allocation-free (module-scope out). */
  const rodOut = { tx: 0, ty: 0, tz: 0, bx: 0, by: 0, bz: 0, delta: 0 };
  function rodAt(m, t) {
    const pull = pullAt(m, t);
    const delta = t >= m.tc ? deltaEff(m, t) : 0;
    setPivot(m, pull); // deltaEff's probes set their own pivots — re-set
    tipAt(m, pull, tmpP);
    dipPoint(m, tmpP, delta);
    const lift = liftAt(m, t);
    rodOut.tx = tmpP.x; rodOut.ty = tmpP.y + lift; rodOut.tz = tmpP.z;
    const e = m.thetaR + delta;
    const ce = Math.cos(e), se = Math.sin(e);
    rodOut.bx = -m.dx * ce; rodOut.by = se; rodOut.bz = -m.dz * ce;
    rodOut.delta = delta;
    return rodOut;
  }

  /** Min clearance over the record's balls vs the posed rod capsule at t
   * (kernel sampler truth — physics never re-implemented). Flex envelope
   * inflates the rod; the cue ball joins once separated (t >= cbArmT —
   * the tip is ON it at contact by definition). A pocketed ball stays an
   * obstacle at its frozen capture position, SINK_PAD-inflated, until
   * SINK_GRACE_S past its BallPocket event (review r2 P1: the renderer's
   * sink animation keeps the mesh visible near the bed after the kernel
   * says Pocketed); airborne balls are ordinary obstacles (review r1 P1:
   * a jumping ball must not fly through the cue). */
  function clearanceAt(m, t, cbArmT) {
    const rod = rodAt(m, t);
    if (Number.isNaN(rod.delta)) return Infinity; // frame hidden — no cue
    const fx = flexAt(m, t);
    // fx.bend is the APEX sagitta; the derived shape's max |displacement|
    // over the rod is the bumper tail at BEND_ENV_MAX × apex (GH-293)
    const env = fx.ringEnv + fx.whipEnv + fx.bow + fx.bend * BEND_ENV_MAX;
    const buf = game.sampler.sampleAt(t);
    let min = Infinity;
    for (let i = 0; i < m.scanBalls.length; i++) {
      const sb = m.scanBalls[i];
      if (sb.isCue && t < cbArmT) continue;
      if (t > sb.pocketT + SINK_GRACE_S) continue; // sink animation over
      const sinking = t >= sb.pocketT;
      const pad = sinking ? SINK_PAD : 0;
      // kernel (x, y, z) → three (y, z, x) — coords.js kPosToThree mirror.
      // A sinking ball anchors at its PRE-CAPTURE jaw pose (review r3 P2:
      // the sampler parks pocketed balls below the bed, away from the
      // still-visible sink mesh), not at the sampled parked state.
      const o = sb.idx * 8;
      const px = sinking ? sb.sinkX : buf[o + 1];
      const py = sinking ? sb.sinkY : buf[o + 2];
      const pz = sinking ? sb.sinkZ : buf[o];
      const wx = px - rod.tx, wy = py - rod.ty, wz = pz - rod.tz;
      let s = wx * rod.bx + wy * rod.by + wz * rod.bz;
      if (s < 0) s = 0; else if (s > CUE_LEN) s = CUE_LEN;
      const qx = wx - rod.bx * s, qy = wy - rod.by * s, qz = wz - rod.bz * s;
      const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
      const rodR = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
      const c = d - sb.r - pad - rodR - env;
      if (c < min) min = c;
    }
    return min;
  }

  /** Earliest violation time in [a, b] under the Lipschitz-cone descent
   * (constants block above), or Infinity. `ca`/`cb` are clearanceAt values
   * at the endpoints; recursion depth is bounded by
   * log2((b − a)/SCAN_DT_MIN). */
  function descend(m, a, b, ca, cb, cbArmT, L) {
    const dt = b - a;
    // safe-skip: two-sided cone AND the left cone alone (a ball pocketing
    // mid-interval leaves only the left endpoint's evidence)
    if (Math.min(ca, cb) - L * dt / 2 >= CLEAR_M && ca - L * dt >= CLEAR_M) {
      return Infinity;
    }
    if (dt <= SCAN_DT_MIN) return a; // cannot prove clear — declare (early)
    const mid = (a + b) / 2;
    const cm = clearanceAt(m, mid, cbArmT);
    const left = descend(m, a, mid, ca, cm, cbArmT, L);
    if (left !== Infinity) return left;
    return descend(m, mid, b, cm, cb, cbArmT, L);
  }

  /** Earliest time in [t0, t1] where the posed rod cannot be proven
   * CLEAR_M-clear of every in-play ball, or Infinity. Choreography phase
   * boundaries and the CB arming time are mandatory seeds (the ball SET
   * changes at cbArmT; kinks elsewhere are covered by the Lipschitz bound
   * but seeds keep the descent shallow). */
  function firstIntrusion(m, t0, t1, cbArmT, extra) {
    if (!(t1 > t0)) return Infinity;
    const seeds = [t0, t1];
    for (const s of [m.tc, m.tFtEnd, m.tAdvEnd, m.tTouch,
      Number.isFinite(m.tTouch) ? m.tTouch + m.bendRampS : Infinity,
      m.tArrest, m.tLift,
      m.tHide, ...(m.sinkSeeds ?? []), ...(extra ?? [])]) {
      if (Number.isFinite(s) && s > t0 && s < t1) seeds.push(s);
    }
    seeds.sort((x, y) => x - y);
    let prevT = seeds[0];
    let prevC = clearanceAt(m, prevT, cbArmT);
    if (prevC < CLEAR_M) return prevT;
    for (let i = 1; i < seeds.length; i++) {
      if (!(seeds[i] - prevT > 1e-9)) continue;
      const c = clearanceAt(m, seeds[i], cbArmT);
      const hit = descend(m, prevT, seeds[i], prevC, c, cbArmT, m.scanL);
      if (hit !== Infinity) return hit;
      prevT = seeds[i];
      prevC = c;
    }
    return Infinity;
  }

  // ---- validation + static resolution -------------------------------------
  // `rodOverride` (finding 3): arm()'s build-verified re-resolve pins the
  // rod pack explicitly (ROD_DEFAULT) when the look pack failed the
  // measured-build match; null = the ordinary per-look candidate.
  function resolve(s, rodOverride = null) {
    need(s && typeof s === 'object', 'spec must be an object');
    needNum(s.t_contact, 't_contact');
    const ap = s.approach;
    need(ap && typeof ap === 'object', 'spec.approach is required');
    needNum(ap.from_s, 'approach.from_s');
    need(ap.from_s < s.t_contact, 'approach.from_s must be < t_contact');
    needNum(ap.pullback_m, 'approach.pullback_m');
    need(ap.pullback_m > 0 && ap.pullback_m <= 0.6,
      `approach.pullback_m must be in (0, 0.6], got ${ap.pullback_m}`);
    need(ap.ease === undefined || ap.ease === null || ap.ease === 'smooth'
      || ap.ease === 'linear', `approach.ease must be 'smooth'|'linear'`);
    if (ap.pause_s !== undefined && ap.pause_s !== null) {
      needNum(ap.pause_s, 'approach.pause_s');
      need(ap.pause_s >= 0 && ap.pause_s <= 3.0,
        `approach.pause_s must be in [0, 3.0], got ${ap.pause_s}`);
    }
    // ---- practice strokes (GH-363 v2 — cuestrike.js literal twin; the
    // jitter stream + schedule resolve HERE, at arm time: no PRNG, no
    // wall clock at frame time) ----
    let practice = null;
    if (s.practice !== undefined && s.practice !== null) {
      const pr = s.practice;
      need(typeof pr === 'object', 'practice must be an object');
      needNum(pr.count, 'practice.count');
      // count 0 = the GH-363 v1 STATIC ADDRESS HOLD tier expressed in the
      // same vocabulary: no feathers, just hold_s of address (pull 0)
      // before the final stroke — amp_m/period_s are unused and optional
      need(Number.isInteger(pr.count) && pr.count >= 0 && pr.count <= 12,
        `practice.count must be an integer in [0, 12], got ${pr.count}`);
      if (pr.count >= 1) {
        needNum(pr.amp_m, 'practice.amp_m');
        need(pr.amp_m > 0 && pr.amp_m <= 0.4,
          `practice.amp_m must be in (0, 0.4], got ${pr.amp_m}`);
        need(pr.amp_m <= ap.pullback_m,
          `practice.amp_m ${pr.amp_m} must be <= approach.pullback_m `
          + `${ap.pullback_m} (the practice envelope must stay inside the `
          + `certified backswing clearance — design 363 §2)`);
        needNum(pr.period_s, 'practice.period_s');
        need(pr.period_s >= 0.2 && pr.period_s <= 3.0,
          `practice.period_s must be in [0.2, 3.0], got ${pr.period_s}`);
      }
      needNum(pr.hold_s, 'practice.hold_s');
      need(pr.hold_s >= 0 && pr.hold_s <= 5.0,
        `practice.hold_s must be in [0, 5.0], got ${pr.hold_s}`);
      const taper = pr.taper === undefined ? 1.0 : pr.taper;
      needNum(taper, 'practice.taper');
      need(taper > 0 && taper <= 2.0, 'practice.taper must be in (0, 2]');
      const jitter = pr.jitter === undefined ? 0.10 : pr.jitter;
      needNum(jitter, 'practice.jitter');
      need(jitter >= 0 && jitter <= 0.35,
        'practice.jitter must be in [0, 0.35]');
      const seed = pr.seed === undefined ? 1 : pr.seed;
      need(Number.isInteger(seed) && seed >= 0, 'practice.seed must be a uint');
      // deterministic per-feather jitter: mulberry32 stream from the seed,
      // consumed in a FIXED order (amp_i, dur_i per feather) — same
      // (seed, count) = same schedule, bit-identical on any machine
      let st = (seed >>> 0) || 1;
      const rand = () => {
        st = (st + 0x6d2b79f5) >>> 0;
        let z = st;
        z = Math.imul(z ^ (z >>> 15), z | 1);
        z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
        return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
      };
      const feathers = [];
      for (let i = 0; i < pr.count; i++) {
        const g = pr.count > 1 ? i / (pr.count - 1) : 0;
        const ampScale = 1 + (taper - 1) * g;
        feathers.push({
          amp: Math.min(pr.amp_m * ampScale * (1 + jitter * (rand() * 2 - 1)),
            ap.pullback_m), // the clearance law survives taper>1 + jitter
          dur: pr.period_s * (1 + jitter * (rand() * 2 - 1)),
        });
      }
      let tAcc = ap.from_s - pr.hold_s;
      for (let i = feathers.length - 1; i >= 0; i--) {
        tAcc -= feathers[i].dur;
        feathers[i].t0 = tAcc;
      }
      practice = { feathers, start: tAcc, holdFrom: ap.from_s - pr.hold_s };
    }
    // ---- emission-clock mapping (GH-363 fusion seam — header doc) ----
    let clockOff = 0, clockRate = 1;
    if (s.clock !== undefined && s.clock !== null) {
      need(typeof s.clock === 'object', 'clock must be an object');
      needNum(s.clock.offset_s, 'clock.offset_s');
      clockOff = s.clock.offset_s;
      if (s.clock.rate !== undefined && s.clock.rate !== null) {
        needNum(s.clock.rate, 'clock.rate');
        // any finite positive rate is a valid linear map (review 363 r2 P2:
        // a long montage's convergence loop can push seg.speed past any
        // authored cap, and a rejected fused arm would render the walk
        // cue-less with the head starting mid-choreography)
        need(s.clock.rate > 0,
          `clock.rate must be > 0, got ${s.clock.rate}`);
        clockRate = s.clock.rate;
      }
    }
    if (s.cue !== undefined && s.cue !== null) {
      need(typeof s.cue === 'object', 'spec.cue must be an object');
      if (s.cue.id !== undefined) {
        need(typeof s.cue.id === 'string' && s.cue.id.length > 0,
          'cue.id must be a non-empty string');
      }
      if (s.cue.shaft_first_mode_hz !== undefined) {
        const hz = s.cue.shaft_first_mode_hz;
        need(Number.isFinite(hz) && hz >= 8 && hz <= 200,
          `cue.shaft_first_mode_hz must be finite in [8, 200], got ${hz}`);
      }
      if (s.cue.shaft_damping_ratio !== undefined) {
        const z = s.cue.shaft_damping_ratio;
        need(Number.isFinite(z) && z > 0 && z < 1,
          `cue.shaft_damping_ratio must be finite in (0, 1), got ${z}`);
      }
    }
    if (s.aesthetics !== undefined && s.aesthetics !== null) {
      const ae = s.aesthetics;
      need(typeof ae === 'object', 'spec.aesthetics must be an object');
      if (ae.style !== undefined) {
        need(STYLES.includes(ae.style),
          `aesthetics.style must be one of ${STYLES.join('|')}`);
      }
      if (ae.exaggeration !== undefined) {
        // Domain shrunk [0, 10] -> [0, 2] (owner realism doctrine,
        // 2026-07-31: match real physics, never exaggerate — it reads
        // fake). Amplitudes are footage-calibrated per
        // docs/research/whip-calibration-277.md (the amplitude authority),
        // so 1.0 = physically grounded and >2 has no legitimate use. The
        // physical ceiling still binds last (review 277-r2) — this domain
        // is independent of the never-rubbery clamps downstream.
        need(Number.isFinite(ae.exaggeration) && ae.exaggeration >= 0
          && ae.exaggeration <= 2,
        `aesthetics.exaggeration must be finite in [0, 2], got ${ae.exaggeration}`);
      }
      if (ae.withdrawDuration !== undefined) {
        need(Number.isFinite(ae.withdrawDuration) && ae.withdrawDuration > 0
          && ae.withdrawDuration <= 5,
        `aesthetics.withdrawDuration must be finite in (0, 5], got ${ae.withdrawDuration}`);
      }
      if (ae.withdrawMargin !== undefined) {
        need(Number.isFinite(ae.withdrawMargin) && ae.withdrawMargin >= 0
          && ae.withdrawMargin <= 1,
        `aesthetics.withdrawMargin must be finite in [0, 1], got ${ae.withdrawMargin}`);
      }
    }
    let vw = s.visible_window;
    // GH-363: t1 may be null — "engine-resolved" (the plan's own tHide).
    // A lead-in arm must open the window at the STAGED boundary (before
    // any feather starts) but cannot know tHide at spec time.
    need(vw === undefined || vw === null
      || (Array.isArray(vw) && vw.length === 2 && Number.isFinite(vw[0])
        && (vw[1] === null || Number.isFinite(vw[1]))
        && vw[0] < (vw[1] ?? Infinity)),
    'visible_window must be [t0, t1] (t0 finite, t1 finite or null) '
      + 'with t0 < t1');

    // ---- record truth (arm after loadRecord/shoot — the anchor law) ----
    const rec = game.record;
    need(rec && Array.isArray(rec.initial?.balls) && rec.shot
      && Array.isArray(rec.events) && game.sampler,
    'no loaded record + sampler — arm after loadRecord');
    const sh = rec.shot;
    for (const k of ['v0', 'phi', 'theta', 'a', 'b']) {
      needNum(sh[k], `record.shot.${k}`);
    }
    need(sh.v0 > 0 && sh.v0 <= 15,
      `record.shot.v0 must be in (0, 15], got ${sh.v0}`);
    need(sh.theta >= 0 && sh.theta < Math.PI / 2,
      `record.shot.theta must be in [0, pi/2), got ${sh.theta}`);
    const off2 = sh.a * sh.a + sh.b * sh.b;
    need(off2 < 1, `record tip offset |(a,b)| must be < 1, got ${Math.sqrt(off2)}`);
    const tbl = rec.initial.table;
    need(tbl && Number.isFinite(tbl.length) && tbl.length > 0
      && Number.isFinite(tbl.width) && tbl.width > 0,
    'record.initial.table must carry finite positive length/width');
    // GH-383: the cue is the record's own STRUCK ball (Strike event
    // truth — carom two-cue records strike ball 1; 0 everywhere else).
    // Named cueBallId: `cueId` below is the cue EQUIPMENT id.
    const cueBallId = rec.events?.[0]?.kind?.Strike?.ball ?? 0;
    const cbIdx = rec.initial.balls.findIndex((b) => b?.id === cueBallId);
    need(cbIdx >= 0, `record has no cue ball (id ${cueBallId})`);
    const kp = rec.initial.balls[cbIdx]?.state?.pos;
    need(kp && Number.isFinite(kp.x) && Number.isFinite(kp.y),
      'record cue ball has no finite initial position');
    // the RECORD cue ball's radius drives every contact/offset length
    // (review r1 P2: snooker/carom records differ from the pool default by
    // ~2 mm — poseCue takes it via the design-277 trailing parameter)
    const ballR = rec.initial.balls[cbIdx]?.params?.r;
    need(Number.isFinite(ballR) && ballR > 0,
      'record cue ball has no finite radius');
    const h = Number.isFinite(kp.z) ? kp.z : ballR;
    const anchor = new THREE.Vector3();
    if (coords.kPosToThree) coords.kPosToThree(anchor, kp.x, kp.y, h);
    else anchor.set(kp.y, h, kp.x); // literal mirror fallback (stale coords)

    // t_contact must BE the record's strike time (review r2 P2: the sampler
    // clock is record time — an offset t_contact would pose the stroke at
    // the anchor while the balls have already moved, corrupting arming and
    // intrusion timing). Canonical ShotRecords strike at t = 0.
    const strikeEv = rec.events.find((e) => e?.kind !== null
      && typeof e?.kind === 'object' && 'Strike' in e.kind);
    need(strikeEv !== undefined, 'record has no Strike event');
    need(Math.abs(s.t_contact - strikeEv.t) <= 1e-9,
      `t_contact ${s.t_contact} must equal the record's Strike time `
      + `${strikeEv.t} (the playback clock IS record time)`);

    // per-ball scan table (kernel radii; sampler row order = record order;
    // pocketT = the ball's BallPocket event time — the sink-grace window).
    // The sink obstacle anchors at the ball's PRE-CAPTURE jaw pose (review
    // r3 P2: the post-event sampler parks pocketed balls BELOW the bed at
    // kernel z ≈ −0.1 m, ~13 cm under the mesh the renderer keeps sinking
    // near bed level), sampled once here at pocketT − ε.
    const pocketAt = new Map();
    for (const e of rec.events) {
      const pk = e?.kind?.BallPocket;
      if (pk && !pocketAt.has(pk.ball)) pocketAt.set(pk.ball, e.t);
    }
    const scanBalls = rec.initial.balls.map((b, idx) => {
      need(Number.isFinite(b?.params?.r) && b.params.r > 0,
        `record ball ${b?.id} has no finite radius`);
      return { idx, id: b.id, r: b.params.r, isCue: b.id === cueBallId,
        pocketT: pocketAt.get(b.id) ?? Infinity,
        sinkX: 0, sinkY: 0, sinkZ: 0 };
    });
    for (const sb of scanBalls) {
      if (!Number.isFinite(sb.pocketT)) continue;
      const buf = game.sampler.sampleAt(Math.max(0, sb.pocketT - 1e-4));
      const o = sb.idx * 8;
      // kernel (x, y, z) → three (y, z, x)
      sb.sinkX = buf[o + 1]; sb.sinkY = buf[o + 2]; sb.sinkZ = buf[o];
    }
    const sinkSeeds = [];
    for (const t of pocketAt.values()) sinkSeeds.push(t, t + SINK_GRACE_S);

    // ---- structural cue fields (Amendment 025 resolution ladder:
    // spec override → the record's resolved equipment cue → defaults) ----
    const recCue = rec.options?.cue;
    const f1 = s.cue?.shaft_first_mode_hz
      ?? recCue?.shaft_first_mode_hz ?? 27.0;
    const zeta = s.cue?.shaft_damping_ratio
      ?? recCue?.shaft_damping_ratio ?? SHAFT_ZETA_DEFAULT;
    need(Number.isFinite(f1) && f1 >= 8 && f1 <= 200,
      `resolved shaft_first_mode_hz out of [8, 200]: ${f1}`);
    need(Number.isFinite(zeta) && zeta > 0 && zeta < 1,
      `resolved shaft_damping_ratio out of (0, 1): ${zeta}`);
    const cueId = s.cue?.id ?? rec.initial?.equipment?.cue_id ?? 'standard';

    // ---- aesthetics (registry defaults ← per-cue entry ← spec override;
    // registry via feature detection, rule 5) ----
    const reg = typeof visualsMod.cueVisualsFor === 'function'
      ? visualsMod.cueVisualsFor(cueId) : { ...AES_DEFAULTS };
    const aes = { ...AES_DEFAULTS, ...reg, ...(s.aesthetics ?? {}) };
    // exaggeration domain [0, 2] — same shrink as the spec check above
    // (owner realism doctrine 2026-07-31; whip-calibration-277.md is the
    // amplitude authority), re-applied to the MERGED registry values.
    need(STYLES.includes(aes.style)
      && Number.isFinite(aes.exaggeration) && aes.exaggeration >= 0
      && aes.exaggeration <= 2
      && Number.isFinite(aes.withdrawDuration) && aes.withdrawDuration > 0
      && aes.withdrawDuration <= 5
      && Number.isFinite(aes.withdrawMargin) && aes.withdrawMargin >= 0
      && aes.withdrawMargin <= 1,
    `registry aesthetics for cue "${cueId}" out of domain`);

    // ---- geometry statics ----
    // geometric rail floor at the ACTIVE table geometry with the record
    // ball's radius (F3 semantics; `undefined` geom keeps the default).
    // GH-911 C2: planRecordRod's instance passes the record's table instead.
    const floorDeg = cueMod.cueMinElevationDeg?.(anchor, sh.phi, sh.a, sh.b,
      railGeom, ballR);
    const thetaBase = Math.max(sh.theta,
      Number.isFinite(floorDeg) ? floorDeg * DEG : 0);
    const dx = Math.sin(sh.phi), dz = Math.cos(sh.phi);
    const sOff = (1 - Math.sqrt(1 - off2)) * ballR;
    const pC = -(TIP_GAP + sOff); // pull at contact: tip face ON the ball
    const W = s.t_contact - ap.from_s;
    const durThrust = Math.min(THRUST_FRAC * W, THRUST_MAX_S);
    // GH-363: optional ABSOLUTE rear pause (measured back-pause vocabulary
    // — the PAUSE_FRAC share under-expresses deliberate strokes)
    const durPause = ap.pause_s !== undefined && ap.pause_s !== null
      ? ap.pause_s : PAUSE_FRAC * W;
    const durPull = W - durPause - durThrust;
    need(durPull > 0.05, `approach window too tight: pullback needs > 0.05 s `
      + `(W ${W.toFixed(3)} - pause ${durPause.toFixed(3)} - thrust `
      + `${durThrust.toFixed(3)} = ${durPull.toFixed(3)})`);
    const stroke = ap.pullback_m - pC;
    const vC = 2 * stroke / durThrust; // animated contact speed [m/s]

    // ---- shot class + follow-through ----
    let cls;
    if (sh.theta >= CLASS_MASSE_THETA) cls = 'masse';
    else if (sh.theta >= CLASS_JUMP_THETA && sh.v0 >= CLASS_JUMP_V0) cls = 'jump';
    else if (sh.v0 >= CLASS_BREAK_V0) cls = 'break';
    else if (sh.b <= CLASS_DRAW_B) cls = 'draw';
    else cls = 'normal';
    // registry/spec forcing; 'break-slide' is the release-and-slide BREAK
    // (class geometry 'break', bend profile 'break-slide' — §4 revision)
    let bendProfile = cls;
    if (aes.style !== 'standard') {
      bendProfile = aes.style;
      cls = aes.style === 'break-slide' ? 'break' : aes.style;
    }
    const F = followThroughM(cls, sh.v0, 2 * ballR);
    const dFt = F > 0 ? 2 * F / vC : 0;
    const tFtEnd = s.t_contact + dFt;

    // partial model for the geometry probes below
    const m = {
      ax: anchor.x, ay: anchor.y, az: anchor.z, anchor, ballR,
      dx, dz, cosT: Math.cos(thetaBase), sinT: Math.sin(thetaBase),
      thetaR: thetaBase,
      a: sh.a, b: sh.b, v0: sh.v0, phi: sh.phi,
      tc: s.t_contact, from: ap.from_s,
      ease: ap.ease === 'linear' ? ((u) => u) : smooth,
      P: ap.pullback_m, pC, stroke, durPull, durThrust, vC,
      tPause: ap.from_s + durPull, tThrust: ap.from_s + durPull + durPause,
      practice, clockOff, clockRate, cls, F, dFt, tFtEnd,
      advCap: Infinity,
      tArrest: Infinity, tTouch: Infinity,
      mode: 'withdraw', tLift: Infinity, tHide: Infinity,
      wd: aes.withdrawDuration, margin: aes.withdrawMargin,
      f1, zeta, scanBalls, sinkSeeds,
      // per-look rod pack (feature 032 S2.5): the armed cue id's rendered
      // length/taper — the grip station, tip floor and belly-surface grid
      // below all key on it (defaults = today's exact numbers). The
      // intrusion/clearance SCANS keep the shared envelope rod (CUE_LEN /
      // R_FERRULE→R_BUTT) — containment law, cuelooks.js header.
      // Round-2 finding 3: this is the CANDIDATE pack — arm() measures the
      // rod buildCue actually returned (rodBuildMatches) and re-resolves on
      // ROD_DEFAULT when the build disagrees (stale-cuestick mixed cache),
      // so the model always describes the rod on screen.
      rod: rodOverride ?? rodPackFor(cueId),
      railLo: -0.6, // refined by the rail probe below (escape interval
                    // [railLo, 0] — §4 revision: no positive dips exist)
    };

    // ---- post-impact flex statics (theta-independent — the whip envelope
    // joins the rail probe below; the RENDERED amplitude is additionally
    // clamped by the cloth clearance per frame, flexAt). REALISM-FIRST
    // (owner ruling 2026-07-31): amplitudes must track real physics, never
    // exaggerate — the constants block above is footage-calibrated per
    // docs/research/whip-calibration-277.md (the amplitude authority), and
    // resolve() shrank the validated exaggeration domain [0, 10] -> [0, 2]
    // under the same doctrine. Exaggeration multiplies INSIDE the
    // never-rubbery clamps (review r2 P2: the physical ceiling binds last,
    // always).
    const offN = Math.sqrt(off2);
    m.ringA = Math.min(RING_MAX_A, RING_REF_A * (vC / RING_REF_V)
      * (0.4 + 0.6 * Math.min(1, offN / 0.5)) * aes.exaggeration);
    [m.ringX, m.ringY] = offN > 0.1 ? [-sh.a / offN, sh.b / offN] : [0, 1];
    // whole-cue mode: RECORD v0 (kernel truth, calibration exponent) × |tip
    // offset|, ZERO at center ball (§2.2: transverse ringing appears with
    // tip offset)
    m.whipA = Math.min(WHIP_MAX_A,
      WHIP_REF_A * Math.pow(sh.v0 / WHIP_REF_V, WHIP_V_EXP)
      * Math.min(1, offN / 0.5) * aes.exaggeration);

    // ---- theta-dependent statics + the rail-safe escape interval ----
    // §4 revision: no choreographed dip exists — the only rotation is the
    // constraint-derived escape (deltaEff <= 0). Its domain is clamped to
    // the interval [railLo, 0] the geometry owner's floor solve certifies
    // over the whole (pull, lift) path (the escape's tip-up rotation
    // lowers the BUTT section behind the grip pivot — review r2 P1
    // lineage): the hold curve (advance at lift 0) and the coupled
    // withdrawal curve — with the rod TRANSLATED DOWN by the
    // flex-amplitude ceiling (review r3 P1: the shader-flexed rod,
    // worst-case fully downward, must clear too; a vertical translation
    // bounds any transverse flex of that magnitude, and lateral crossing
    // shifts are second-order, partially covered by the floor solve's
    // JAW_MARGIN conservatism). The BEND joins this drop envelope since
    // GH-293: the derived shape sags the tip→grip belly TOWARD the
    // cloth/rails (the pre-fix upward arch was excluded as sign-definite
    // away — that exclusion died with the direction fix); its butt tail
    // counter-lifts and needs no drop. The bend's model peak grows with
    // theta, so each CANDIDATE elevation bounds its own frames' θe <=
    // cand after the escape. When the flexed envelope cannot clear at the
    // base elevation (a rail-riding level power stroke — the break),
    // theta is BUMPED in 0.25-degree steps until it does, exactly the
    // silent-elevation-floor family the address floor already applies
    // (render-only garnish); a framing that stays rail-unsafe after +6
    // degrees rejects fail-closed. Sampled probe (the updateFlex
    // 15-sample family precedent).
    // (bend class statics resolved HERE — the rail probe and the
    // per-frame model must share one profile/stiffness/mu story)
    const bc = BEND_CLASS[bendProfile] ?? BEND_CLASS[cls] ?? BEND_CLASS.normal;
    const uSRec = rec.initial.balls[cbIdx]?.params?.u_s;
    const bendMu = Number.isFinite(uSRec) && uSRec > 0 ? uSRec
      : MU_TIP_DEFAULT;
    const bendMagF0 = 1 / (1 - Math.min(bc.F0, BEND_F_CLAMP) / BEND_PCR_N);
    const flexDrop0 = m.whipA + m.ringA + BOW_MAX;
    let flexDrop = flexDrop0;
    let railSolved = false;
    for (let bump = 0; bump <= 24 && !railSolved; bump++) {
      const cand = thetaBase + bump * 0.25 * DEG;
      if (cand >= Math.PI / 2) break;
      m.thetaR = cand;
      m.cosT = Math.cos(cand);
      m.sinT = Math.sin(cand);
      m.advCap = Infinity;

      // (escape pivot: the grip station S_GRIP_M behind the tip, set PER
      // POSE via setPivot — the hand rides the stroke, review 277-r3 P2)
      tipAt(m, pC, tmpP);

      // nose-line advance cap: the tip's horizontal track must stay inside
      // the playing rect inset by NOSE_INSET. Axis convention (coords.js /
      // minRailClearance: three.x = kernel.y spans the LENGTH, three.z =
      // kernel.x spans the WIDTH — review r3 P1 caught these reversed):
      // kernel-y bound is length/2, kernel-x bound is width/2. Horizontal
      // advance per meter of axial advance is cosT (the escape rotation
      // only pulls the tip BACK toward the grip pivot, so capping the
      // un-rotated track is conservative).
      {
        const kx0 = tmpP.z, ky0 = tmpP.x;        // tip contact, kernel frame
        const kdx = dz, kdy = dx;                // horizontal strike dir
        const hX = tbl.width / 2 - NOSE_INSET;   // kernel-x half-extent
        const hY = tbl.length / 2 - NOSE_INSET;  // kernel-y half-extent
        let dMax = Infinity;
        if (kdx > 1e-12) dMax = Math.min(dMax, (hX - kx0) / kdx);
        if (kdx < -1e-12) dMax = Math.min(dMax, (-hX - kx0) / kdx);
        if (kdy > 1e-12) dMax = Math.min(dMax, (hY - ky0) / kdy);
        if (kdy < -1e-12) dMax = Math.min(dMax, (-hY - ky0) / kdy);
        const advNose = Math.max(0, m.cosT > 1e-6 ? dMax / m.cosT : Infinity);
        m.advCap = Math.min(m.advCap, advNose);
      }

      // rail probe over the flex-dropped (pull, lift) path (§4 revision:
      // no press/dip target — the advance ends at the per-class
      // follow-through, hovering wherever the line never meets the cloth)
      const advEnd = Math.min(F, m.advCap);
      // bend clearance only for a path that ACTUALLY reaches the cloth
      // (GH-293 review r1 P2: flexAt gates the bend on tTouch, so a
      // hovering finish never bends — reserving for a force that never
      // exists could bump theta into creating that very touch, or reject
      // a valid hovering arm). The candidate touches iff the zero-rotation
      // line reaches the floor within its capped advance (tipY is affine-
      // decreasing in adv). Consistent with the post-loop tTouch walk in
      // BOTH directions: the walk's advance cap only ever tightens to the
      // exact floor-touch point (cloth-arrest/arrest caps bind AT a
      // touch), and a hover here is a hover there (same max advance).
      const candTouches = tipYAt(m, advEnd, 0) <= m.rod.rTip + 1e-12;
      flexDrop = flexDrop0 + (candTouches ? Math.min(
        m.sinT * (m.cosT + bendMu * m.sinT) / bc.kNpm * bc.F0 * bendMagF0,
        BEND_HARD_MAX) : 0);
      const stations = [];
      const K = 8;
      for (let i = 0; i <= K; i++) {
        stations.push({ pull: m.pC - (advEnd * i) / K, lift: 0 });
      }
      for (let i = 1; i <= K; i++) {
        const su = smooth(i / K);
        stations.push({ pull: m.pC - advEnd + WD_PULL_M * su,
          lift: WD_LIFT_M * su });
      }
      const okAll = (d) => stations.every(
        (st) => railOK(m, st.pull, d, st.lift - flexDrop));
      if (!okAll(0)) continue; // bump theta and retry
      if (okAll(-0.6)) {
        m.railLo = -0.6;
      } else {
        let lo = -0.6, hi = 0;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2;
          if (okAll(mid)) hi = mid;
          else lo = mid;
        }
        m.railLo = hi;
      }
      // cloth-arrest advance cap (draw-B teleport fix, 2026-07-31; ALL
      // classes): the advance may not outrun the escape domain's ability
      // to keep the tip at/above the cloth floor. Where the rail interval
      // forbids the tip-up rotation (a butt riding a rail — the draw
      // whose butt hangs over the head cushion), the stroke ARRESTS at the
      // cloth instead: the old whip-raised floor + frame-hide combination
      // blanked the cue for ~0.16 s here. tipY(adv, railLo) is monotone
      // decreasing in adv, so the cap is a single bisection; with
      // adv <= this cap, clothClamp's domain always reaches the floor and
      // the NaN hide is unreachable by construction.
      if (tipYAt(m, advEnd, m.railLo) < m.rod.rTip) {
        let lo = 0, hi = advEnd;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (tipYAt(m, mid, m.railLo) >= m.rod.rTip) lo = mid;
          else hi = mid;
        }
        m.advCap = Math.min(m.advCap, lo);
      }
      railSolved = true;
    }
    refuse(railSolved,
      'no rail-safe cue path exists for this record framing — the stroke '
      + 'rides a rail that the flexed rod (whip/ring/bow/bend envelope '
      + `${(flexDrop * 1000).toFixed(1)} mm) cannot clear within +6 degrees `
      + 'of the record elevation; reframe (fail-closed; slice 3 may add a '
      + 'near-rail whip-damping policy)');

    // ---- cloth-touch time (§4 revision — the bend/arrest trigger) ----
    // First t where the STRIKE-LINE pose (rotation 0) reaches the bare
    // cloth floor. tipY is affine-decreasing in adv (slope −sinθ) and adv
    // is monotone until tFtEnd, so margin(t) is monotone non-increasing —
    // a grid walk brackets the single crossing, a bisection refines it.
    // Infinity = the extended line never meets the cloth: the finish
    // HOVERS, the bend never fires (owner model: "low-elevation short
    // follow-throughs finish hovering — correct and desired").
    {
      const margin = (t) => tipYAt(m, Math.min(advRaw(m, t), m.advCap), 0)
        - m.rod.rTip;
      const tEnd = m.tc + Math.max(dFt, 1e-3);
      const steps = Math.ceil((tEnd - m.tc) / 1e-3);
      let lo = m.tc, hi = null;
      if (margin(m.tc) <= 0) {
        m.tTouch = m.tc; // extreme-draw address already on the floor
      } else {
        for (let i = 1; i <= steps; i++) {
          const t = m.tc + (i * (tEnd - m.tc)) / steps;
          if (margin(t) <= 0) { hi = t; break; }
          lo = t;
        }
        if (hi !== null) {
          for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (margin(mid) > 0) lo = mid;
            else hi = mid;
          }
          m.tTouch = hi;
        }
      }
    }
    // jump/masse ARREST at cloth contact (§2.1: the elevated follow-through
    // ends at the table — no slide): the advance freezes AT the touch
    // point, so the deficit never grows, the escape stays 0 and the tip
    // holds exactly ON the floor while the arrest press (bend model)
    // decays. Shallow classes keep advancing — the tip RIDES the floor
    // through the escape rotation instead (the break slide).
    if ((cls === 'jump' || cls === 'masse') && Number.isFinite(m.tTouch)) {
      m.tArrest = m.tTouch;
      m.advCap = Math.min(m.advCap, advRaw(m, m.tTouch));
    }

    // effective advance END time (review 277-r3 P2): when advCap binds
    // (arrest, nose line, cloth-arrest), the motion stops at the cap
    // crossing, not at the uncapped tFtEnd — the lift-earliest gate and
    // the intrusion seeds must use the real stop time or a small-pullback
    // spec could stall the withdrawal into an unnecessary fade. advRaw is
    // monotone on [tc, tc+dFt], so the crossing is one bisection.
    m.tAdvEnd = m.tFtEnd;
    if (Number.isFinite(m.advCap) && m.advCap < F) {
      let lo = m.tc, hi = m.tFtEnd;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (advRaw(m, mid) < m.advCap) lo = mid;
        else hi = mid;
      }
      m.tAdvEnd = hi;
    }

    // ---- bend-model statics (constants-block model; §4 revision) ----
    // mu: the record cue ball's kernel cloth slide (u_s) — the kernel's
    // exposed cloth params; leather-tip-on-cloth ≈ ball-cloth u_s is the
    // documented estimate (bendMu, resolved with the class profile above
    // the rail loop). perM = per-newton apex sagitta of the lean force:
    // N_perp/F = sinθ·(cosθ + μ·sinθ), over the class stiffness; the P-δ
    // magnifier (clamped at BEND_F_CLAMP) rides F(t) in flexAt — the peak
    // is at F0 by monotonicity (the per-frame floor cap can only lower
    // the rendered value under this bound).
    {
      const cT = Math.cos(m.thetaR), sT = Math.sin(m.thetaR);
      m.bendProfile = BEND_CLASS[bendProfile] ? bendProfile : cls;
      m.bendMu = bendMu;
      m.bendF0 = bc.F0;
      m.bendRampS = bc.rampS;
      m.bendTauS = bc.tauS;
      m.bendK = bc.kNpm;                       // [N/m] (name: N per meter)
      m.bendPerM = sT * (cT + bendMu * sT) / bc.kNpm; // [m/N]
      m.bendPeak = Math.min(m.bendPerM * bc.F0 * bendMagF0, BEND_HARD_MAX);
    }

    // Lipschitz bound for the intrusion descent: kernel ball speed stays
    // under ~2·v0 (strike transfer ceiling; collisions only share it out);
    // rod-point speed under the animated contact speed + escape-rotation
    // slack (the +2: the escape's tip rides the floor at under the line
    // descent rate, butt-side levers are shorter than the grip pivot's)
    // + the WITHDRAWAL lift/pull peak rates, which scale as
    // 1/withdrawDuration (review r2 P1) + the flex-envelope inflation
    // rate (whip ramp + ring decay + bend build).
    m.scanL = 2 * sh.v0 + vC + 2
      + 1.5 * (WD_LIFT_M + WD_PULL_M) / m.wd
      + 1.5 * m.whipA / WHIP_RAMP_S + RING_MAX_A / RING_TAU
      + 1.5 * m.bendPeak * BEND_ENV_MAX / m.bendRampS;

    // ---- D4 withdrawal plan (the intrusion scan; kernel sampler truth) --
    const tRest = Math.max(recordDurationOf(rec), m.tc);
    m.tRest = tRest;
    // cue-ball separation time (grid-walk; the tip is ON the ball at tc).
    // The CB arms only once it clears the FLEX-INFLATED capsule by
    // ARM_CLEAR — arming against the bare rod would hand the intrusion
    // scan a ball still inside the whip envelope (whip peak ≈ cm-scale a
    // few ms post-separation) and trip a false immediate fade.
    let cbArmT = Infinity;
    {
      const tEnd = m.tc + CB_ARM_CAP_S;
      const n = Math.ceil((tEnd - m.tc) / (1 / 240));
      for (let i = 1; i <= n; i++) {
        const t = m.tc + (i * (tEnd - m.tc)) / n;
        const rod = rodAt(m, t);
        const fx = flexAt(m, t);
        const env = fx.ringEnv + fx.whipEnv + fx.bow
          + fx.bend * BEND_ENV_MAX; // tail-inflated (GH-293)
        const buf = game.sampler.sampleAt(t);
        const o = cbIdx * 8;
        const px = buf[o + 1], py = buf[o + 2], pz = buf[o];
        const wx = px - rod.tx, wy = py - rod.ty, wz = pz - rod.tz;
        let ss = wx * rod.bx + wy * rod.by + wz * rod.bz;
        if (ss < 0) ss = 0; else if (ss > CUE_LEN) ss = CUE_LEN;
        const qx = wx - rod.bx * ss, qy = wy - rod.by * ss, qz = wz - rod.bz * ss;
        const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
        const rodR = R_FERRULE + (R_BUTT - R_FERRULE) * (ss / CUE_LEN);
        if (d - scanBalls[cbIdx].r - rodR - env > ARM_CLEAR) {
          cbArmT = t;
          break;
        }
      }
    }
    m.cbArmT = cbArmT;

    // PRE-CONTACT sweep (review r1 P2): the visible address/pullback/thrust
    // stroke must not sweep the rod through a RESTING ball (the 0.6 m
    // pullback reaches well behind the address rod; the CB itself is the
    // stroke's target and stays excluded until separation). No withdrawal
    // can fix a stroke that was invalid before it began — a violating
    // framing REJECTS the whole spec, fail-closed.
    {
      // GH-363: a practice window extends the swept pre-contact interval;
      // feather poses are pulls in [0, amp <= P] on the SAME strike line —
      // a subset of the already-swept backswing family — but the sweep
      // stays honest over the real schedule (feather peaks seeded).
      const strokeStart = practice ? practice.start : ap.from_s;
      const preStart = Math.min(vw?.[0] ?? strokeStart, strokeStart);
      const preSeeds = [m.tPause, m.tThrust];
      if (practice) {
        for (const f of practice.feathers) preSeeds.push(f.t0 + f.dur / 2);
      }
      const preHit = firstIntrusion(m, preStart, m.tc, cbArmT, preSeeds);
      refuse(preHit === Infinity,
        `pre-contact stroke sweeps within ${CLEAR_M * 1000} mm of a resting `
        + `ball at t=${preHit.toFixed?.(4)} — reframe the approach`);
    }

    // the finish must settle before a lift: the stroke's own (capped)
    // advance must complete, and never under the D4 stay floor (the
    // EFFECTIVE end — review 277-r3 P2: the uncapped tFtEnd can run long
    // after a capped advance stopped and would stall the lift into an
    // unnecessary fade)
    const earliest = Math.max(m.tc + HOLD_MIN_S, m.tAdvEnd);
    if (!Number.isFinite(cbArmT)) {
      // degenerate: the CB never separated inside the cap — fade instantly
      m.mode = 'fade';
      m.tIntrusion = m.tc;
      m.fadeStart = m.tc;
      m.fadeEnd = m.tc + 1e-3;
      m.tHide = m.fadeEnd;
    } else {
      const scanEnd = Math.min(tRest, m.tc + STAY_MAX_S) + m.wd + m.margin
        + 0.05;
      const tIntrusion = firstIntrusion(m, m.tc, Math.max(scanEnd, m.tc + 0.1),
        cbArmT, [cbArmT]);
      m.tIntrusion = tIntrusion;
      const tBudget = tIntrusion - m.wd - m.margin;
      const tLiftD4 = Math.min(m.tc + STAY_MAX_S, tRest); // the D4 stay law
      const tLift = Math.max(Math.min(tLiftD4, tBudget), earliest);
      if (tLift > tBudget) {
        m.mode = 'fade';
      } else {
        // provisional withdrawal; verify the LIFTING rod also stays clear
        // (a ball can chase the lift) — violation ⇒ fade fallback
        m.mode = 'withdraw';
        m.tLift = tLift;
        m.tHide = tLift + m.wd;
        const hit = firstIntrusion(m, tLift, m.tHide, cbArmT, [cbArmT]);
        if (hit < Infinity) {
          m.mode = 'fade';
          m.tLift = Infinity;
          m.tHide = Infinity;
        }
      }
      if (m.mode === 'fade') {
        const fadeEnd = tIntrusion === Infinity
          ? Math.min(m.tc + STAY_MAX_S, tRest) + FADE_S
          : tIntrusion - FADE_MARGIN_S;
        m.fadeEnd = Math.max(fadeEnd, m.tc + 1e-3);
        m.fadeStart = Math.max(m.tc, m.fadeEnd - FADE_S);
        m.tHide = m.fadeEnd;
        m.tLift = Infinity;
      }
    }
    // withdraw mode ends in the terminal micro-fade (WD_FADE_S doc above):
    // opacity ramps to 0 over the withdrawal's last stretch while the
    // lift/pull-back motion continues, so the hide at tHide lands on an
    // already-invisible rod. tHide/tLift semantics are UNCHANGED.
    m.wdFadeStart = m.mode === 'withdraw'
      ? m.tHide - Math.min(WD_FADE_S, m.wd) : Infinity;

    m.vw0 = vw?.[0] ?? (practice ? practice.start : ap.from_s);
    m.vw1 = vw?.[1] ?? m.tHide; // vw[1] null → engine-resolved (GH-363)
    m.cueId = cueId;
    m.exagg = aes.exaggeration;
    return m;
  }

  /** record duration — last event time (sdk recordDuration mirror; the SDK
   * import edge is deliberately avoided: this module must stay a leaf). */
  function recordDurationOf(rec) {
    const lastEv = rec.events[rec.events.length - 1];
    return lastEv ? lastEv.t : 0;
  }

  // ---- per-frame application (pure in t over the armed model) -------------
  const qDip = new THREE.Quaternion();
  const rightAxis = new THREE.Vector3();
  function applyAt(t) {
    const m = armed;
    // GH-363 fusion seam: map the emission clock onto record time (a walk
    // tail's emissions ride the previous segment's camera clock — pure and
    // static, so random access and chronological stepping stay identical)
    if (m.clockOff !== 0 || m.clockRate !== 1) {
      t = (t - m.clockOff) / m.clockRate;
    }
    // VW_EPS_S: the window edges tolerate float dust (GH-363 landing
    // sweep): a fused spec's vw0 = −(beatSec + lead) is a SUM of seconds
    // while the first fused frame's mapped clock is frame-grid arithmetic
    // (−(beatF + H1)/60 through the clock map) — the two round to doubles
    // one ulp apart, and a strict >= hid the first walk frame for exactly
    // one frame (LD-c caught it when the kernel-hash jitter landed on the
    // edge). 1e-9 s covers every seconds-scale accumulation and cannot
    // reach a neighboring frame (1/60 apart). tHide stays STRICT — the
    // hide cut's semantics are unchanged (the withdraw fade owns it).
    const vis = t >= m.vw0 - VW_EPS_S && t <= m.vw1 + VW_EPS_S && t < m.tHide;
    cue.group.visible = vis; // stateless re-assert (the canopy lesson)
    if (!vis) {
      zeroFlex();
      setOpacity(1);
      last = { t, visible: false };
      return;
    }
    const delta = t >= m.tc ? deltaEff(m, t) : 0;
    if (Number.isNaN(delta)) {
      // fail-closed frame hide (review r2 P2): no pose satisfying BOTH the
      // rail interval and the whip-raised cloth floor exists at this t —
      // never render an unsafe pose. Continuous in t (the clamp inputs are
      // smooth), so this is a window, not flicker; unreachable for the
      // shipped physical amplitudes.
      cue.group.visible = false;
      zeroFlex();
      setOpacity(1);
      last = { t, visible: false, hiddenUnsafe: true };
      return;
    }
    const pull = pullAt(m, t);
    // dt = 0 on purpose: freezes cuestick's stateful render flex so the
    // group transform is the only (pure) output of the call; trailing
    // ballR = the record cue ball's radius (design-277 poseCue parameter —
    // a stale cuestick.js ignores it, a ~2 mm cosmetic degrade on
    // non-pool records, rule 5)
    cueMod.poseCue(cue, m.anchor, m.phi, m.thetaR, pull, m.a, m.b, 0,
      m.ballR);
    if (delta !== 0) {
      // rigid escape rotation about the GRIP pivot (world-frame
      // premultiply — the poseCue elevation sense: −delta about
      // shooter-right; delta <= 0 here, so the tip rides UP to the
      // floor). Pivot = THIS pose's grip station (setPivot — the hand
      // rides the stroke, matching the shader's uFlex2S clamp)
      setPivot(m, pull);
      rightAxis.set(-m.dz, 0, m.dx);
      qDip.setFromAxisAngle(rightAxis, -delta);
      cue.group.quaternion.premultiply(qDip);
      dipPoint(m, cue.group.position, delta);
    }
    const lift = liftAt(m, t);
    cue.group.position.y += lift;
    // closed-form flex → shared shader uniforms (cuestrike discipline)
    const fx = flexAt(m, t);
    const u = cue.flex?.u;
    if (u) {
      const fxx = m.ringX * fx.ring, fxy = m.ringY * fx.ring - fx.bow;
      u.uFlexA.value.set(fxx, 0, -fxy);
      // rail channel unused by the §4-revision engine (the v1 cloth press
      // rode it) — re-asserted at the build defaults, statelessly
      u.uRailA.value.set(0, 0, 0);
      u.uRailS.value = 0.5;
      // whip term: feature-detected (stale cuestick.js has no uFlex2A —
      // the mode simply does not render; rule-5 cosmetic degrade)
      u.uFlex2A?.value.set(m.ringX * fx.whip, 0, -(m.ringY * fx.whip));
      // FORCE-BASED table-contact bow (§4 revision; direction fixed —
      // GH-293): the whip variant's uBendC C channel — tip pinned at the
      // clamped pose, belly sagging TOWARD the cloth (segment-local +z =
      // cue-local −y = perpendicular-DOWN, opposite the tip's table
      // reaction — the derived chord-deviation sign; the owner-observed
      // upward arch was the old authored bump's flipped sense), clamped
      // at the grip station uFlex2S, with the C¹ butt tail counter-lift
      // carried by the shader shape. Feature-detected like uFlex2A — and
      // the channel is VERSIONED BY NAME (uBendA → uBendC with the
      // derivation, review r2 P2): a stale pre-derivation cuestick.js has
      // no uBendC, so a mixed-cache boot degrades to "no bend renders"
      // (rule 5, cosmetic), never to this amplitude driving the old
      // upward bump through the cloth.
      u.uBendC?.value.set(0, 0, fx.bend);
    }
    let opacity = 1;
    if (m.mode === 'fade' && t >= m.fadeStart) {
      opacity = 1 - smooth(Math.min(1,
        (t - m.fadeStart) / Math.max(m.fadeEnd - m.fadeStart, 1e-9)));
    } else if (m.mode === 'withdraw' && t >= m.wdFadeStart) {
      // terminal micro-fade: dissolve WHILE the withdrawal motion keeps
      // easing, so the tHide cut lands on an already-invisible rod
      opacity = 1 - smooth(Math.min(1,
        (t - m.wdFadeStart) / Math.max(m.tHide - m.wdFadeStart, 1e-9)));
    }
    setOpacity(opacity);
    last = {
      t,
      visible: true,
      tip: [cue.group.position.x, cue.group.position.y, cue.group.position.z],
      axis: [-m.dx * Math.cos(m.thetaR + delta), Math.sin(m.thetaR + delta),
        -m.dz * Math.cos(m.thetaR + delta)],
      pull, deltaDeg: delta / DEG, lift, opacity,
      flex: {
        flexA: [u?.uFlexA.value.x ?? 0, u?.uFlexA.value.y ?? 0,
          u?.uFlexA.value.z ?? 0],
        flex2A: u?.uFlex2A
          ? [u.uFlex2A.value.x, u.uFlex2A.value.y, u.uFlex2A.value.z] : null,
        flex2S: u?.uFlex2S?.value ?? null,
        railA: [u?.uRailA.value.x ?? 0, u?.uRailA.value.y ?? 0,
          u?.uRailA.value.z ?? 0],
        railS: u?.uRailS?.value ?? null,
        // §4 revision: the force-based bow's applied vector (instrument
        // key stays `bendA` across engine versions so cross-tree gates
        // read one name; SOURCED from the versioned uBendC channel —
        // null on a stale cuestick.js without it, rule-5 degrade)
        bendA: u?.uBendC
          ? [u.uBendC.value.x, u.uBendC.value.y, u.uBendC.value.z] : null,
      },
    };
  }

  machine.on('frame', (t) => {
    if (armed) applyAt(t);
  });

  const planOf = (m) => ({
    class: m.cls, mode: m.mode, cueId: m.cueId,
    t_contact: m.tc, tFtEnd: m.tFtEnd,
    // effective advance end (== tFtEnd unless advCap binds; review
    // 277-r3 P2 — the lift-earliest gate runs on THIS time)
    tAdvEnd: m.tAdvEnd,
    tArrest: Number.isFinite(m.tArrest) ? m.tArrest : null,
    // §4 revision: the arm-resolved cloth-touch time of the strike-line
    // pose; null = the extended line never meets the cloth (the finish
    // HOVERS and the bend never fires — the e2e hovering law)
    tTouch: Number.isFinite(m.tTouch) ? m.tTouch : null,
    tRest: m.tRest,
    tIntrusion: Number.isFinite(m.tIntrusion) ? m.tIntrusion : null,
    cbArmT: Number.isFinite(m.cbArmT) ? m.cbArmT : null,
    tLift: Number.isFinite(m.tLift) ? m.tLift : null,
    tHide: m.tHide,
    fadeStart: m.mode === 'fade' ? m.fadeStart : null,
    fadeEnd: m.mode === 'fade' ? m.fadeEnd : null,
    // ADDITIVE plan field (2026-07-31 withdraw-tail fix): the terminal
    // micro-fade start of withdraw mode; null in fade mode. tHide/tLift
    // semantics unchanged.
    wdFadeStart: m.mode === 'withdraw' ? m.wdFadeStart : null,
    followThroughM: m.F,
    vC: m.vC, whipA: m.whipA, ringA: m.ringA, f1: m.f1, zeta: m.zeta,
    exaggeration: m.exagg,
    // force-based bend statics (§4 revision) — full disclosure so the e2e
    // gate re-derives perM/mag/peak from (thetaDeg, mu, kNpm, F0, pcrN)
    // and bounds every frame's rendered bend by the model
    bend: {
      profile: m.bendProfile,
      thetaDeg: m.thetaR / DEG, mu: m.bendMu, kNpm: m.bendK,
      F0: m.bendF0, rampS: m.bendRampS, tauS: m.bendTauS,
      perM: m.bendPerM, pcrN: BEND_PCR_N, peakM: m.bendPeak,
    },
    visibleWindow: [m.vw0, m.vw1],
    // GH-363 lead-in disclosure (ADDITIVE): the resolved pre-strike
    // choreography. The schedule builders' ONE probe reads T_pre off the
    // armed plan (t_contact − practice.start — the deterministic jittered
    // schedule is engine truth, never re-derived), and the e2e gates
    // re-assert the feather law (amp <= pullback, pull >= 0) from it.
    from: m.from,
    practice: m.practice ? {
      start: m.practice.start, holdFrom: m.practice.holdFrom,
      feathers: m.practice.feathers.map((f) => ({ ...f })),
    } : null,
    clock: m.clockOff !== 0 || m.clockRate !== 1
      ? { offset_s: m.clockOff, rate: m.clockRate } : null,
  });

  return {
    /** Arm a post-strike spec (module doc above); `arm(null)` disarms and
     * hides the cue. Returns the RESOLVED PLAN on success; an INVALID spec
     * rejects WHOLE: console diagnostic + return false, previously armed
     * spec and scene untouched (validation and the full static resolution
     * run to completion first — the camerascript validate-before-disarm
     * law). */
    arm(s) {
      if (s === null || s === undefined) {
        armed = null;
        last = null;
        if (cue) {
          cue.group.visible = false;
          zeroFlex();
          setOpacity(1);
        }
        return true;
      }
      let resolved;
      try {
        resolved = resolve(s);
        // record-pinned cue look (S2.5) + may reject on a stale
        // cuestick.js — before disarm (validate-before-disarm law)
        ensureCue(resolved.cueId);
        // GH-525 bare review review round-2 (finding 3): trust the pack
        // only when the BUILT rod renders it — a stale cuestick.js ignores
        // opts.cueId and ships the default 1.477 m rod under a custom-look
        // pack. On mismatch, re-resolve pinned to ROD_DEFAULT (rule-5
        // fail-closed; the re-resolve re-runs the rail/floor/touch statics
        // on the rod that is actually on screen, and may itself refuse —
        // caught below like any first-pass refusal).
        if (resolved.rod !== ROD_DEFAULT
          && !rodBuildMatches(resolved.rod, cue.group)) {
          resolved = resolve(s, ROD_DEFAULT);
        }
      } catch (e) {
        // framing refusals (refuse() above) are EXPECTED per-record
        // outcomes on the live/DVR adoption lanes — warn ONCE per
        // (record, reason) then demote repeats to debug (GH-325 dedup,
        // header above), never error; spec-shape violations stay
        // console.error (programming errors), always loud.
        if (e?.framingRefusal) {
          // failure-safe key build (review r3 P3): a cyclic/BigInt spec
          // extension must never turn the fail-closed `return false` into
          // a throw — degrade to message-only dedup for that arm.
          let key;
          try {
            key = `${recordFingerprint()}|${JSON.stringify(s)}|${e.message ?? e}`;
          } catch {
            key = `unserializable-spec|${e.message ?? e}`;
          }
          const n = (refusals.get(key) ?? 0) + 1;
          refusals.set(key, n);
          refusalsTotal += 1;
          console[n === 1 ? 'warn' : 'debug'](
            `[cuepost] spec rejected: ${e.message ?? e}`
            + (n === 1 ? '' : ` (repeat ${n} of this record+reason)`));
        } else {
          console.error(`[cuepost] spec rejected: ${e.message ?? e}`);
        }
        return false;
      }
      armed = resolved;
      return planOf(resolved);
    },
    active: () => !!armed,
    /** Read-only side record of the last applied frame + the armed plan
     * (e2e instrument — the previewInks side-record precedent). */
    state: () => (armed
      ? { armed: true, plan: planOf(armed), frame: last }
      : { armed: false }),
    /** GH-325 structured framing-refusal counter (read-only diagnostics;
     * logging-side only — arm() behavior is byte-identical). NOT folded
     * into state(): the determinism arms byte-compare state() snapshots
     * and this counter is deliberately session-cumulative. */
    rejections: () => ({
      total: refusalsTotal,
      entries: [...refusals].map(([key, count]) => ({ key, count })),
    }),
  };
}

// ---- GH-911 C2: the record-bound rod plan (plan:256-434) ------------------
// The shipped planner over record data at open build time: a second
// createCuePost instance over a fabricated game (the record and a record
// sampler), a stub machine that subscribes nothing and a throwaway scene that
// is never rendered, armed with the record's spec on the record's table and
// the record's cue id. It reads no live sampler, no active table and no
// active cue (I1(i)); the live instance is untouched (OQ-2 (a), the
// second-instance form).
//
// The kernel-default table pin for an untagged record: a literal mirror of
// table.js:139 SCRIPTED_PIN_TABLE_ID (the mirror discipline above). table.js
// maps a missing or unknown table_id to the same pin (playback.js:3228-3229),
// and an unknown tag reaches it through specFor (table.js:1235) inside
// cuestick.js railGeomFor (OQ-7 (b), OQ-3).
const UNTAGGED_TABLE_ID = 'wpa_generic_9ft';

// GH-911 OQ-9 (a): the refusal rod, named from the record alone: the record's
// own elevation and tip offset, no follow-through and no flex. Finite whenever
// shot.a, shot.b and shot.theta are finite; never null.
const refusalRodOf = (sh) => ({
  thetaDeg: sh.theta / DEG, a: sh.a, b: sh.b, followThroughM: 0, flexM: 0,
});

/** GH-911 C2: the record-bound rod of record `rec` (a parsed ShotRecord) for
 * the spec `spec` (cuepostlive.js liveCuePostSpec(rec), the caller's read,
 * OQ-36) and the record sampler `sampler` (route (1): the caller builds it
 * over the record JSON, spliced to the engine's kernel_version, and frees
 * it). Returns `{ kind, rod, plan }`:
 *   kind 'plan'        rod from the planner's plan (R1): thetaDeg =
 *                      plan.bend.thetaDeg, followThroughM =
 *                      plan.followThroughM, flexM = plan.bend.peakM +
 *                      plan.whipA + plan.ringA (OQ-6 (c)); `plan` is the
 *                      planOf object;
 *   kind 'refused'     a framing refusal (RAIL or SWEEP, refuse() above);
 *   kind 'error'       a non-framing arm() rejection (console.error above);
 *   kind 'spec-null'   no spec (liveCuePostSpec returned null);
 *   kind 'no-sampler'  no record sampler (engine absent, version refused or
 *                      sampler build failed; the caller's decision);
 *   kind 'no-geom'     a stale cuestick.js without railGeomFor: the record's
 *                      table cannot be taken, so the planner does not run
 *                      on the active one.
 * Every kind but 'plan' carries the refusal rod and `plan: null` (OQ-9 (a)).
 * `a` and `b` are always rec.shot.a and rec.shot.b, never the plan's (R1).
 * Returns null only when shot.a, shot.b or shot.theta is not finite (I1(ii)).
 * The rod pack is rodPackFor(rec's cue id), confirmed by arm()'s rebuild
 * check against the hidden cue it builds in the throwaway scene (OQ-2). */
export function planRecordRod(rec, spec, sampler) {
  const sh = rec?.shot;
  if (![sh?.a, sh?.b, sh?.theta].every(Number.isFinite)) return null;
  const refused = (kind) => ({ kind, rod: refusalRodOf(sh), plan: null });
  if (spec === null || spec === undefined) return refused('spec-null');
  if (!sampler) return refused('no-sampler');
  if (typeof cueMod.railGeomFor !== 'function') return refused('no-geom');
  const tid = rec.initial?.equipment?.table_id;
  const tableId = typeof tid === 'string' ? tid : UNTAGGED_TABLE_ID;
  const scene = new THREE.Scene();
  try {
    const post = createCuePost({
      machine: { on() {} },
      game: { record: rec, sampler },
      scene,
      railGeom: cueMod.railGeomFor(tableId),
    });
    const before = post.rejections().total;
    const plan = post.arm(spec);
    if (plan === false) {
      return refused(post.rejections().total > before ? 'refused' : 'error');
    }
    return {
      kind: 'plan',
      rod: {
        thetaDeg: plan.bend.thetaDeg, a: sh.a, b: sh.b,
        followThroughM: plan.followThroughM,
        flexM: plan.bend.peakM + plan.whipA + plan.ringA,
      },
      plan,
    };
  } finally {
    releaseScene(scene);
  }
}

// GH-911 C3 (addendum A2): the throwaway scene's hidden cue is released once
// the record is planned, so the planner holds no cue build per record. Each
// group is removed and disposed as ensureCue's rebuild disposes a replaced
// build: geometry and material per segment, and a map only when the
// cuelooks.js cache does not own it (obCueLookCached, the GH-525 round-4
// latency law).
function releaseScene(scene) {
  for (const g of [...scene.children]) {
    scene.remove(g);
    for (const m of g.children) {
      m.geometry?.dispose();
      if (m.material?.map?.obCueLookCached !== true) {
        m.material?.map?.dispose();
      }
      m.material?.dispose();
    }
  }
}
