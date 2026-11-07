// Copyright (c) Meta Platforms, Inc. and affiliates.

// tablesoil.js — the table SOIL layer's model constants (craft-uplift 2026-08,
// item 4). Sibling of clothvisuals.js CLOTH_TRAFFIC: the renderer cannot read a
// manifest, so every number the shader needs is mirrored here as a literal and
// tools/derive-cloth-traffic.mjs --gate re-reads THIS module and fails if any
// of them has drifted from web/assets/table/soil.json.
//
// WHAT THE LAYER IS
// -----------------
// Rail wood, pocket collars and pocket leather carry a settled particulate
// layer — room dust plus airborne chalk — and the table is not cleaned evenly:
// it is cleaned by being PLAYED. So the visible pattern is not a dirt map, it
// is the NEGATIVE of a contact map, and the contact maps are derived from the
// shipped kernel over the same 41 316-shot 9-ball ensemble the GH-542 cloth
// traffic field was baked from (identical ensemble, not a replay — the two
// artifacts come out of one run of one tool, and the tool re-emits the cloth
// field bit-for-bit to prove the soil legs perturbed nothing).
//
//   R channel — HAND: one unit of dose per stroke, spread over a modelled
//     bridge-hand disc placed a bridge length behind the cue ball along the aim
//     line, counted only where that lands OFF the bed.
//   G channel — MOUTH: one unit of dose per BallPocket event, continued 2R into
//     the throat along the sampled entry heading.
//
// Neither channel carries a free amplitude: the dose per event is one unit by
// construction and both channels ship peak-normalised.
//
// THE RESPONSE MODEL lives in shading.js SPIKE_SOIL (linearised steady state of
// a settling/removal balance). The two knobs it needs beyond the derived field
// are `amp` and `beta`, both stated below.
//
// WHAT IS NOT DERIVED, stated once and honestly:
//   * bridge LENGTH has no citation anywhere in this repo. The derivation
//     integrates a stated-ignorance uniform prior over the taught 6–10 in range
//     with 5-node midpoint quadrature (so it draws no RNG and cannot perturb
//     the ensemble) and publishes the sensitivity: the band-restricted Pearson
//     r between the two ENDPOINT fields is 0.4259. That is LOW. The shipped
//     field is the marginal over the prior and its cross-rail profile is
//     correspondingly broad; a table whose players all bridge long would wear a
//     visibly different stripe. Disclosed, not hidden.
//   * hand FOOTPRINT is a modelled uniform disc of radius 35 mm. Under the
//     sigma = R_ball bake it carries no spectral content the Gaussian does not
//     already dominate.
//   * hip and forearm lean on the rail is NOT modelled — nothing published.
//   * the 1:1 weighting between the two mechanisms is authored (see `beta`).
export const TABLE_SOIL = {
  url: './assets/table/soil_168x296.png',
  // web/assets/table/soil.json derived.* — mirrored literals, gated.
  handBandMeanOverPeak: 0.208302,
  mouthBandMeanOverPeak: 0.016399,
  // The field's footprint is the bed plus a 20-cell rail band on every side.
  // The runtime maps the two halves DIFFERENTLY (shading.js SPIKE_SOIL): the
  // bed half is a game-geometry pattern and scales with the table, the band is
  // hand-and-ball geometry measured in metres out from the nose line and does
  // not scale — bridge length is set by the player's arm, not by how wide this
  // table's rail happens to be. bandFrac* locates the seam; bandM walks out
  // from it.
  bandFracX: 0.238095,   // width axis
  bandFracY: 0.135135,   // length axis
  bandM: 0.198438,       // = TABLE_SPECS default frameWidth 0.145 + WPA 2" cushion
  // beta = b/b0, contact removal over background removal. Estimated(no
  // published deposition-rate or removal-rate figure exists for a billiard
  // rail; nothing in docs/research/ carries one). beta = 1 states that at the
  // band-MEAN contact rate contact removal exactly balances background removal,
  // which puts a mean-traffic cell at a third of an untouched one and a peak
  // hand cell at about a sixth. Any other value is equally arbitrary, so the
  // one that needs no justification is the one that ships.
  //
  // The same Estimated tag covers the 1:1 weighting of the two mechanisms
  // (both channels enter the removal factor divided by their own band mean, so
  // the dirtiest hand spot and the dirtiest pocket mouth end up equally
  // clean): no transfer coefficient relating hand-oil pickup to ball-borne
  // pickup is published anywhere.
  //
  // It lives in the DERIVATION, not here: the removal factor r cannot be
  // written without beta and K cannot be derived without r, so the tool owns
  // both and this file mirrors them under gate.
  beta: 1,
  // K = <r> over the rail band, from the ENCODED texels (what the sampler will
  // actually read). The shipped layer is the signed residual about this, so the
  // rail band mean is preserved and no identity register can move.
  removalBandMean: 0.502065,
  // Deposit areal COVERAGE on a horizontal, never-abraded band cell (r = 1),
  // per table style — a physical fraction, not a look knob; shading.js turns it
  // into the signed residual about K. A style with no entry gets 0 and emits
  // pre-craft pixels exactly.
  //
  // The wave lands one table at a time and its stop law gates each round on
  // `crosstable-spot-488p` staying bit-quiet on the tables it has not reached,
  // so an entry is per style and never a default.
  //
  // HOW THE VALUE WAS SET, and what it is NOT. There is no photometric
  // reference for rail soiling CONTRAST in the pack, and the purchased-model
  // study renders cannot supply one: those files ship with unresolvable texture
  // paths, so every study render was made with PROXY materials (flat green /
  // brown / tan plus procedural noise) and carries no dirt information at all.
  // That is a real gap in the wave's "magnitude vetted against reference
  // imagery" clause and it is ledgered as such, not papered over.
  //
  // So the value is adjudicated the way clothvisuals.js adjudicates chalk
  // loading — the largest loading a HARD bound permits, then reported against a
  // SOFT one:
  //   CEILING (hard, identity): no rail fragment may sit further from its
  //     anchored albedo than the 490 station registers' own published "still
  //     the same rail" tolerance, dV 0.06 — the tightest owner-adjudicated
  //     step available anywhere in this repo for this surface.
  //   FLOOR (soft, visibility): the change should clear the published naked-eye
  //     threshold, dE76 ~ 3-4 — the same citation clothvisuals.js uses for the
  //     chalk floor, and quoted there as a RANGE, not a number.
  // Both are MEASURED on-screen in the real app, at all nine pinned look-loop
  // poses, against the same build with ?ablate=soil — never computed from
  // mirrored literals. Full table in the craft-uplift report.
  //
  // THE TABLE IS EMPTY. No class enables the layer in round 1, so `soilAny` in
  // table.js is false, the splice never happens, and every chinese8 pixel is
  // pre-craft. Two measurements put it there, and both are recorded because
  // either one alone would have been the wrong reason to stop.
  //
  // (1) At the ceiling the layer is BELOW THE VISIBILITY FLOOR on this table.
  // The largest loading the hard bound permits is cn8 = 0.03:
  //   ceiling  max |dV| = 0.0549 over all nine poses (vs 0.06) — 8.5% headroom,
  //            and the layer's own mean shift is at most 0.0137.
  //   floor    median dE76 over moved pixels 0.62-1.03 by pose; the most
  //            legible 64 px tile anywhere in the nine frames is dE76 1.18;
  //            only the top ~1% of moved pixels reaches 3-4. Side-by-side at
  //            1:1 on the rail top and on the pocket leather: no perceptible
  //            difference.
  // The cause is physical, not a modelling failure: a chinese8 rail is
  // near-black lacquer whose albedo is photo-anchored, so a deposit thin enough
  // to leave the anchor intact is also thin enough to be invisible on it. The
  // ceiling binds on the DOWN direction (clean, hand-polished patches going
  // darker), because sRGB has its steepest slope where this table is darkest.
  //
  // On its own this would NOT have stopped the layer: clothvisuals.js sets the
  // precedent of shipping a ceiling-below-floor case at the ceiling with the
  // shortfall disclosed, and dropping a derived quantity because it fails to
  // impress is precisely the appearance-driven move the realism rule forbids.
  //
  // (2) At the ceiling it turns tools/audit/jawstep_490.py RED — pooled
  // curl_deck p95 1.940 -> 2.055 against a frozen ceiling of 2.0. That gate is
  // owner-adjudicated and the wave's first law is that gates stay green, so
  // this is the binding constraint. What it is NOT is evidence of a seam
  // defect: per-sample, the station's NUMERATOR (the seam step it exists to
  // measure) moves 0.2-3.5%, at or under one 8-bit LSB, while its denominator's
  // local-slope term moves 10-19% and drags the ratio 8-11% with it. That slope
  // is a difference of two 4-px means on near-flat cloth: on the rows that
  // crossed, it is worth 4-18 quanta of the smallest step one moved pixel can
  // produce, i.e. one or two significant bits. The soil layer touches no cloth
  // at all — it reaches those pixels only through the env probe re-bake, at
  // ~1 LSB. The instrument's fragility is a real finding and it is ledgered in
  // the craft-uplift report as an instrument disclosure; it is emphatically not
  // a licence to re-tune a frozen ceiling to fit this branch.
  //
  // So: a layer that buys nothing an eye can see is not worth a red on a frozen
  // gate. Were it above the floor, (2) would have been a problem to solve
  // rather than a reason to stop. The whole mechanism ships — derivation, field,
  // drift gate, shader — dormant, so rounds 2 and 3 inherit it working.
  //
  // WHAT ROUND 2/3 OWES BEFORE ADDING AN ENTRY: its own ceiling/floor
  // measurement (snooker and pool rails are lighter and may well clear the
  // floor) AND a re-run of its table's own station gates, because the coupling
  // above is not specific to soil — anything that perturbs cloth by an LSB can
  // do it.
  amp: {},
};
