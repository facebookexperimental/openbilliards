// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuevisuals.js — app-side aesthetics registry for the cue post-strike
// visual dynamics engine (design 277 §4, web/app/cuepost.js; GitHub issue
// #277). D5 parameter placement (hybrid): the PHYSICAL structural fields
// (shaft_first_mode_hz, shaft_damping_ratio) live in the kernel catalog
// (v13, Amendment 025) and reach the engine through the record's resolved
// equipment cue; the AESTHETIC knobs — presentation choices with no
// physical claim — live here, keyed by catalog cue id. This file is the
// owner-tuning surface for the design-277 preview pack: after the owner
// reviews the five shot-class demos, per-cue entries land in CUE_VISUALS
// below; until then every cue rides the physically-grounded defaults.
//
// Knobs (all validated fail-closed by cuepost.js at arm time):
//   style              'standard' = the engine's shot classifier picks the
//                      stroke profile (masse/jump/break/draw/normal);
//                      naming a class forces that profile for this cue
//                      (e.g. a dedicated jump cue always reading jump-style).
//                      'break-slide' (§4 revision 2026-08-01): the
//                      Strickland/SVB release-and-slide break — class
//                      geometry 'break' with the small release bend
//                      profile instead of the default documented
//                      pin-and-lean C (Crimi, Dr. Dave break FAQ;
//                      cuepost.js BEND_CLASS provenance)
//   exaggeration       pure presentation multiplier on the POST-IMPACT flex
//                      amplitudes (whole-cue whip + 250 Hz end ring),
//                      applied INSIDE the never-rubbery physical clamps —
//                      the amplitude ceilings always bind last (an
//                      unclamped multiplier would demand absurd cloth
//                      clearance; review 277-r2). Validated domain: [0, 2]
//                      (owner API decision 2026-07-31, per the
//                      REALISM-FIRST DOCTRINE from the round-2 preview
//                      feedback: amplitudes must track real physics —
//                      exaggerated vibration reads as fake and is banned).
//                      1.0 (the default) = the footage-calibrated
//                      physical amplitudes, with
//                      the issue-277 whip-calibration record as the
//                      amplitude authority (cuepost.js calibration
//                      block); values above 1 are camera-legibility
//                      exceptions only, and >2 has no legitimate use.
//   withdrawDuration   D4 lift-and-pull-back duration [s] — the "player
//                      stands up" read; joins the D4 t_lift law
//                      t_lift = min(3 s, t_rest, t_intrusion − duration
//                      − margin)
//   withdrawMargin     D4 safety margin [s] between the withdrawal's end
//                      and the earliest ball intrusion time
//
// OWNERSHIP (module-ownership contract): leaf data module of the cuepost engine.
// cuepost.js reaches it via a NAMESPACE import + feature detection and
// literal-mirrors the defaults below (cache-poison contract, rule 5): a
// stale cache missing this module degrades to the defaults, never a
// module-graph error.

/** Physically-grounded defaults — the values every shipped cue uses today
 * (design 277: "Defaults = physically-grounded values (exaggeration 1.0)").
 * withdrawDuration/withdrawMargin: a player clearing the cue reads at
 * ~0.5–0.7 s (tune-by-eye presentation constant; §2.1's double-hit-rule
 * withdrawal validates the trigger, not a duration). */
export const CUE_VISUAL_DEFAULTS = Object.freeze({
  style: 'standard',
  exaggeration: 1.0,
  withdrawDuration: 0.6,
  withdrawMargin: 0.12,
});

/** Per-cue overrides, keyed by kernel catalog cue id (catalog.rs /
 * sdk CATALOG). Deliberately EMPTY at ship: owner tuning lands here after
 * the design-277 preview pack verdict. Partial entries are fine — absent
 * fields fall back to CUE_VISUAL_DEFAULTS. */
export const CUE_VISUALS = Object.freeze({});

/** Merged aesthetics for a cue id (unknown/absent id = pure defaults). */
export function cueVisualsFor(cueId) {
  const entry = typeof cueId === 'string' ? CUE_VISUALS[cueId] : undefined;
  return { ...CUE_VISUAL_DEFAULTS, ...(entry ?? {}) };
}
