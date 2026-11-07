// Copyright (c) Meta Platforms, Inc. and affiliates.

// clothvisuals.js — VISUAL-ONLY cloth appearance variants keyed to the
// kernel equipment catalog's cloth ids (crates/pool-core/src/catalog.rs /
// sdk catalog mirror). Physics never reads this table: a variant changes the
// cloth material's shading response, not u_s/u_r/spin decay.
//
// simonis_860_tournament carries two looks: the app-default 'classic_green'
// and 'steel_gray' — the tournament-broadcast reference cloth. The 'tournament'
// look (scene/look.js) selects steel_gray; measurements from the reference
// broadcast frames (2026-07-05 GI wave):
// dead-NEUTRAL gray (R≈G≈B ±1 across the lamp pool: 148-150 center, ~135
// mid, ~100 shaded corners), uniform fine weave (no low-frequency mottle),
// soft broad sheen, nap brushing barely directional. Reconcile with the
// cloth-forensics ledger at integration if its measured targets differ.
//
// Weave axes (issue #52, per-discipline cloth): OPTIONAL per-variant fields
// applied by table.js styleMaterials (the owner of the shared material's
// texture instances — applyClothVisual below never touches textures beyond
// the caller-passed mottle map, so look.js's 'tournament' regrade call site stays
// valid). Absent fields mean the build-time worsted defaults:
//   nap          'napped' → the coarse directional-fuzz nap normal
//                (table.js NAPPED_NAP); absent/other → the fine worsted
//                field (seed-777 default — capture-pinned)
//   roughness    base GGX roughness (default 0.92)
//   normalScale  nap normal strength (default 0.8)
//   detail       closeup terlenka twill (default true; napped wool carries
//                no woven twill — the twill is a worsted weave scan)
export const CLOTH_VISUALS = {
  simonis_860_tournament: {
    default: 'classic_green',
    variants: {
      // == the table.js build-time material (values must stay in sync with
      // buildTable's clothMat so 'classic_green' is a no-op re-apply).
      // NOTE (cloth-sheen wave, feature 010): the per-variant 'anisotropy'
      // param was dropped everywhere — the sheen lobe is isotropic (Charlie
      // direct and the CINEMA LTC fit alike) and the base GGX at roughness
      // 0.92 contributes ~nothing, so it was a near-placebo costing real
      // per-fragment work on the largest surface. Nap direction stays
      // carried by table.js makeNapNormal.
      // Post-merge calibration (feature 010 final): hue moved from the old
      // yellow-green (screen H~114) into the Simonis 860 Green family —
      // anchor swatch ~RGB(49,115,95) H162; measured wide-shot cloth now
      // lands H~163 / S~44 (headless probe protocol).
      // Sheen 0.55 -> 0.46 keeps the lamp-sheen luma contribution under the
      // ~2% wide/mid guardrail that steel_gray passes.
      classic_green: {
        color: 0x054046, sheen: 0.46, sheenColor: 0x26807a, sheenRoughness: 0.45,
        envMapIntensity: 0.18, mottle: true,
      },
      // Broadcast-reference "steel gray" tournament cloth. The reference
      // frames measure
      // dead-neutral ON SCREEN (148/148/148 in the pool, ~135 mid, ~100
      // shaded corners; band ratio ~0.81 at the nose) — paired with the 'tournament'
      // look's near-neutral lamp (look.js), a neutral gray albedo with a
      // hair of cool renders neutral. Sheen lobe widened vs worsted green
      // (fine uniform reference weave).
      // Post-merge calibration (feature 010 final): the lamp-fed sheen +
      // GI sheen route added ~+1.7% wide-shot luma over the reference-calibrated
      // anchors — albedo −2 levels, sheen 0.35 -> 0.30, env 0.12 -> 0.11
      // land the wide anchors back on the pre-wave calibration (measured
      // 166.6/161.8/151.3 vs pre-merge 166.7/162.1/151.9 center/mid/corner
      // in the probe protocol; reference-frame equivalents 148/135/100).
      steel_gray: {
        color: 0x494c4e, sheen: 0.30, sheenColor: 0xa2a6a9, sheenRoughness: 0.5,
        envMapIntensity: 0.11, mottle: false,
      },
      // Simonis 860 "Tournament Blue" — the factory-recommended color on the
      // feature-009 branded tables (Diamond poster: 860 Tournament Blue;
      // Predator Arcadia Reserve ships the same tone). Same worsted sheen
      // family as classic_green with the hue moved to the saturated
      // tournament blue of the Pro-Am/Apex photo refs.
      // (feature 010 final calibration: sheen 0.5 -> 0.46, same ~2% lamp-
      // sheen guardrail; screen hue H~202 sits in the Tournament Blue
      // anchor family RGB(32,141,184) H197.)
      tournament_blue: {
        color: 0x0c5a9c, sheen: 0.46, sheenColor: 0x4f9fd4, sheenRoughness: 0.45,
        envMapIntensity: 0.16, mottle: true,
      },
      // GH-488P (Predator Apex, wave P-A2) — "Predator Arcadia Pro by
      // Simonis", tournament variant (FT-CLOTH). A SIBLING of
      // tournament_blue, not an edit of it: tournament_blue is the Diamond
      // entry's cloth and is pinned by the app-side contrast receipts
      // (the ownership ledger (internal), preview.js, aim.js), so it may not move.
      //
      // Calibrated on a DIVERSE source set, never on one image. Measured
      // r/b over the saturated-blue mask of every Apex reference held:
      //   controlled photos   fulltable 0.305 · arc-compare 0.317 · rail-03 0.296
      //   arena broadcast     hero1 0.603 · hero2 0.703
      //   showroom (warm)     product087 0.891
      //   MARKETING RENDERS   sidepocket-topdown 0.024 · yt-pockets-04 0.071
      // The two renders are synthetic frames under a neutral studio rig;
      // chasing their 0.02-0.07 would author a neon cloth that is wrong under
      // every real light in the set. The calibration target is therefore the
      // controlled-photo cluster, ~0.30, and the accepted band is 0.30-0.60
      // (controlled through arena).
      //
      // Delta vs tournament_blue is in the SHEEN, not the albedo: the
      // rendered r/b 0.428 comes from the sheen lobe carrying the canopy
      // lamp (0xfff1da, r/b 1.170) — the albedo is already r/b 0.077 and
      // re-hueing it would be two-errors-cancelling. Arcadia is a tighter,
      // harder-finished worsted than 860: narrower sheen lobe, less of it,
      // and a sheen tint that stays in the cloth's own hue family.
      arcadia_tournament: {
        color: 0x0a5498, sheen: 0.34, sheenColor: 0x2f8ecd, sheenRoughness: 0.34,
        envMapIntensity: 0.12, mottle: true,
      },
    },
  },
  simonis_760_fast: { default: 'classic_green', variants: null }, // → 860's
  // worn_slow keeps the 860 family on purpose: it IS a worsted cloth, worn.
  // Its differentiation is a CONDITION, not a family — see CLOTH_CONDITIONS
  // and clothConditionSpec below (GH-542).
  worn_slow: { default: 'classic_green', variants: null },
  // feature 012 (contracts/render-capacity.md §3): the two non-860 cloth
  // entries of catalog v6 get their own visual sets. VISUAL ONLY, as ever —
  // the physics trios live on the kernel catalog entries.
  snooker_napped: {
    default: 'snooker_green',
    variants: {
      // West-of-England napped wool (WPBSA 12-ft + Joy Q8 pairing):
      // tournament green, heavier directional nap than worsted — stronger
      // and rougher sheen lobe, batch mottle on. Issue #52 (per-discipline
      // cloth): the variant now NAMES its weave family — the napped nap
      // normal (coarser, longer combed-fiber streaks, stronger relief),
      // higher roughness and a wider softer sheen than the worsted 860s,
      // env response trimmed (matte wool), and NO closeup twill (the
      // terlenka scan is a diagonal twill we READ as worsted; fibre unknown).
      // Issue #228 color calibration, round 2 (owner verdict on round 1:
      // blotches fixed, HUE still off vs real tables — anchor on
      // MANUFACTURER swatches, not photos). The pro snooker cloth is
      // Strachan 6811 / No.10 "English Green" (WSC/WPBSA + Xingpai event
      // tables; Strachan's only published colour — "traditional olive
      // green"). Strachan/WSP publishes no swatch chip, but Simonis OWNS
      // Strachan and publishes one: the official English Green chip
      // (simoniscloth.com/color-styles thumb-english-green.jpg) samples
      // #2c5327 — H113 S53 V33, a YELLOW-leaning deep olive, corroborated
      // by their table-render presentation (#2b5126, H113.5) and
      // Hainsworth's English Green install photo (H106). Round 1's
      // 0x054522 sat at H147 (blue-leaning teal-green) — the wrong hue
      // CLASS. Albedo hue is pinned to the chip (H114); S/V run deeper
      // than the chip (S70 V28 vs S53 V33) per this renderer's
      // established albedo convention — every accepted felt calibration
      // (classic_green, tournament_blue, carom_blue) carries albedo S
      // 85-93 because the lamp + ACES pipeline desaturates ~2x on screen
      // (chip-exact albedo renders a washed sage, sweep s1). Owner-angle
      // device-class screen: H112 S42 V58 (12-ft pre-GI lighting) — in
      // the English-green presentation band (chip H113, Hainsworth H106).
      // GH-489 W3 amendment (gate r6 finding 6, amended gestalt-first
      // law — owner override 2026-08-11): the rendered READ is re-solved
      // to the tournament reference photos (the GH-490 round-12 method).
      // The #228 chip anchor (#2c5327 H113 flat scan) stays the identity
      // CLASS record, but the amended law judges the RENDERED read
      // against the pack's primary references — Strachan No.10 under
      // real table light reads cyan-emerald, not chip-flat: S1 club
      // aerial H153.2/S.99 (refs/s1-middle-aerial-51222671393.jpg,
      // auditor ROI) and the Star XW101 middle-mouth closeup H143.4/S.98
      // (cxr-489-r6 pixel_metrics.json). Albedo 0x035C32 (H152 S97 V36)
      // pre-compensates the same GI-lamp/ACES hue pull + desat measured
      // on this pipeline so the S1-register rendered read lands in the
      // primary band H[143,153] / sat_median >= 0.80 (posegate cloth
      // bars; before: rendered H116.7/S.56 at the corrected register).
      // WPBSA-green identity kept: deep tournament green, hue class
      // bounded well short of teal.
      // 489 REBUILD R0 (2026-08-19, ONE-TABLE LAW): the s1-club term of
      // the W3 joint solve (S1 aerial H153.2 — a DIFFERENT physical
      // table) is RETIRED as a calibration target; the re-solve against
      // pure XW101 frames (middle-mouth closeup H143.4 primary + arena
      // secondary) is convergence round 2 of docs/fidelity/
      // 489-xw101-one-table-retirement.md §5.
      // 489 REBUILD R1 (2026-08-19, the re-solve itself): judged through
      // the cammatch harness at HEAD-SOLVED registers under the FROZEN
      // studio_xw101 preset (brightness 1.4 × exposure 1.891 — the
      // photo-family exposure). Pure-XW101 identity target across all
      // three frames: H≈145 / S≈0.98 / V≈0.50 (middle-mouth macro bgr
      // [52,123,3], mouth field [53,128,3], corner cell H146.5/.99/.52).
      // Two rendered-read defects cured together: (a) the
      // MeshPhysicalMaterial DEFAULT specularIntensity 1.0 washed the
      // field with white GGX (the GH-490 r13 finding, same physics —
      // spec pinned 0.02, applyClothSpec restores the 1.0 default for
      // every variant that doesn't carry the field); (b) the old albedo
      // sat in the ACES shoulder under photo-family exposure —
      // channel-crosstalk desaturation is what the probe ladder measured
      // (albedo V 36→29% moved the rendered V only 0.91→0.83; the
      // rendered read only unpins below the shoulder). Albedo re-solved
      // 0x035C32 → 0x041d08: rendered plate read [53,128,0]
      // H144.8/S1.0/V0.50 vs target [52,123,3] (dE76 ≈ 3). The rendered
      // read under the SHIPPED venue rig darkens correspondingly — the
      // rig currently under-lights ~2.65× vs the studio family; its
      // structural re-fit to photo-family exposure rides the
      // corner-rebuild round (R0 record §1) over this SAME albedo.
      // WPBSA-green identity kept (albedo H130, rendered H144.8 — deep
      // tournament green, bounded well short of teal).
      // 489 BLOCKER-CURE (B12/B13, finale adversarial review): nap moves
      // to the PURIFIED snooker family 'napped_snk' (table.js
      // NAPPED_NAP_SNK — cross-axis-smoothed height, reduced relief) and
      // normalScale 1.35 -> 1.05: the shipped salt-noise nap tilted
      // facets into the sheen rim lobe at grazing bearings (pastel-mint
      // junction wash, probe-ablated) and resolved as white-dot speckle
      // at the corner orbit's closest approach (the dossier retail page
      // advertises 无白点、无杂质). Sheen itself stays — the official
      // video's cushion sheen band is a real napped-wool read.
      snooker_green: {
        color: 0x041d08, sheen: 0.50, sheenColor: 0x05743F,
        sheenRoughness: 0.62, envMapIntensity: 0.03, mottle: true,
        specularIntensity: 0.02,
        nap: 'napped_snk', roughness: 0.97, normalScale: 1.05, detail: false,
      },
      // Chinese eight-ball green — GH-490 round-12 GESTALT retarget
      // (issue #490 comment 5248893464 gap (a)/(a2), owner-override
      // round): the round-2 albedo solved against Joy's saturation-
      // boosted MARKETING presentation; the adjudication re-anchors on
      // the pack's own scene references (TPT/Joy-macro pose-matched
      // reads H 144-147 / S 80-90 / V 45-56 rendered at the C1-family
      // register). Albedo re-solved against rendered reads under the
      // round-12 class key (tools/audit/gestalt_490.py cloth.color
      // bar, both tiers). Texture (gap a2): the references read as
      // SMOOTH nap at 1.8-3.4 px/mm — nap normal amplitude cut ~3x
      // (normalScale 1.35 -> 0.10) and the mottle at 1/3 amplitude (the
      // full tuft octaves were the 0.15-0.9 c/mm band load; a zero map
      // starved the r9 gate's weave-band lag-1 basis - mottle:'faint'). Weave family axes otherwise
      // unchanged (#52); snooker_green untouched (zero-drift).
      // ROUND-13 (gate r11 finding 1 — C1s wash): the live A/B traced
      // the side-register wash (S 47-54 / V 67-72 at grazing) to the
      // BASE GGX dielectric specular — the material rode the
      // constructor default specularIntensity 1.0, whose Fresnel term
      // floods the far bed with white lamp light at grazing incidence
      // (kill test: S 47.5 -> 65.8 at C1s, corner reads near-static).
      // Matte wool carries no such lacquer response: specularIntensity
      // pinned low (the leather 0.02 class), sheen trimmed 0.50 ->
      // 0.38, and the albedo re-solved (R/B floor up) because the
      // corner read's in-window S 85-92 was PART white-spec wash — on
      // the pure diffuse response the old albedo clips to S 100.
      // REBUILD R0 r4 (ONE-TABLE LAW cloth re-solve): the frozen
      // joy_lowrect venue key EXPOSED the r13 albedo as washed (pocket
      // register dS −0.24 / dV +0.16 through the whole-frame harness —
      // the retired keyTrim had been hiding it by dimming the scene
      // onto the albedo).  Re-solved LIVE against the SOLVED tpt
      // frames under the frozen rig (48+27+12-cell HSV grids,
      // /tmp clothfit record in the round commit): 0x2d7a4c
      // (H146 S63 V48) -> 0x225e2f (H133 S64 V37) lands the venue
      // frame's cloth rows dH +1.3 / dS −0.024 / dV 0.000 (bands
      // 6/0.08/0.06); S>=0.75 cells CLIP rendered S at 1.0 (the r13
      // clipping class, avoided), and the darker V restores the ACES
      // saturation the wash was eating.  The flash-lit hero catalog
      // frame's dS (−0.58 after WB) is un-landable by ANY albedo cell
      // (min |dS| 0.38 at the clip ceiling) — a marketing-saturation
      // context row, disclosed in solves-490.json, never a target.
      chinese8_green: {
        color: 0x225e2f, sheen: 0.38, sheenColor: 0x123f27,
        sheenRoughness: 0.62, envMapIntensity: 0.03, mottle: 'faint',
        // Combed wool, shared with snooker; keep the accepted dye and mottle.
        nap: 'napped_snk', roughness: 0.97, normalScale: 0.85, detail: false,
        specularIntensity: 0.02,
      },
    },
  },
  carom_worsted_heated: {
    default: 'carom_blue',
    variants: {
      // heated fast worsted (UMB World Cup convention: Simonis blue on the
      // 2.84 m table) — fine uniform weave: tighter sheen, no mottle. The
      // Art 11.9 heating is physics-side (named residual on the catalog
      // entry); visually the cloth just reads crisp and fast.
      carom_blue: {
        color: 0x0e4f8e, sheen: 0.40, sheenColor: 0x5290c8,
        sheenRoughness: 0.42, envMapIntensity: 0.16, mottle: false,
      },
    },
  },
};
// The neutral twins of the renamed cloth ids bind the same variant objects.
CLOTH_VISUALS.pool_worsted_new = CLOTH_VISUALS.simonis_860_tournament;
CLOTH_VISUALS.pool_worsted_fast = CLOTH_VISUALS.simonis_760_fast;

// ---- curated cloth COLORS (issue GH-229) -----------------------------------
// The Settings → Equipment → Cloth swatch palette: a VISUAL-ONLY color key
// LAYERED on the cloth axis (the look/lighting #89 precedent — never an
// equipment-tuple axis, never kernel/ShotRecord/share-codec visible; cloth
// TYPE stays the physics axis). Each entry carries exactly the SIX
// shading-response fields applyClothSpec writes; the weave axes
// (nap/roughness/normalScale/detail — issue #52) always stay the ACTIVE
// cloth family's, so a color reads as "that color of the same cloth".
//
// Derivation (the #228 calibration record):
//   tournament_blue / classic_green / snooker_green / steel_gray are the
//   calibrated variants above VERBATIM (single source of truth for the
//   values is still CLOTH_VISUALS; these four are documented copies — the
//   swatch resolver composes them over any family).
//   burgundy / camel are NEW, derived per the recorded albedo convention:
//   anchor on manufacturer swatches (Simonis color-styles chips: burgundy
//   ≈ #6b2033 H346 S70 V42, camel ≈ #b6996b H36 S41 V71), keep the chip
//   HUE, run albedo S ≈ 2× chip S (capped near the accepted felts' 85-93
//   band) and V ≈ 0.85× chip V because the lamp + ACES pipeline
//   desaturates ~2× and lifts luma ~2× on screen (#228 round-2 lesson —
//   chip-exact albedo renders washed). Sheen family = the 860 worsted
//   response (0.46 / 0.45 / env 0.16) with sheenColor a lighter
//   hue-preserved rung, the classic_green→0x26807a pattern. PENDING the
//   owner device-class screen verdict loop (the #228 protocol) — retune
//   here only.
export const CLOTH_COLORS = {
  tournament_blue: {
    color: 0x0c5a9c, sheen: 0.46, sheenColor: 0x4f9fd4, sheenRoughness: 0.45,
    envMapIntensity: 0.16, mottle: true,
  },
  classic_green: {
    color: 0x054046, sheen: 0.46, sheenColor: 0x26807a, sheenRoughness: 0.45,
    envMapIntensity: 0.18, mottle: true,
  },
  // the tournament snooker green — swatch rung kept in lockstep with the
  // snooker_napped factory variant (GH-489 R1: pure-XW101 rendered-read
  // re-solve through the cammatch harness — see the variant's provenance
  // block; #228 chip anchor = identity class record)
  snooker_green: {
    color: 0x041d08, sheen: 0.50, sheenColor: 0x05743F, sheenRoughness: 0.62,
    envMapIntensity: 0.03, mottle: true, specularIntensity: 0.02,
  },
  burgundy: {
    color: 0x590b1d, sheen: 0.46, sheenColor: 0x8c3142, sheenRoughness: 0.45,
    envMapIntensity: 0.16, mottle: true,
  },
  // the #227 gap: the 'tournament' capture look, finally reachable as equipment-side
  // color — uniform fine weave, so mottle drops (stains-on-gray lesson)
  steel_gray: {
    color: 0x494c4e, sheen: 0.30, sheenColor: 0xa2a6a9, sheenRoughness: 0.5,
    envMapIntensity: 0.11, mottle: false,
  },
  camel: {
    color: 0x99671c, sheen: 0.46, sheenColor: 0xc79f59, sheenRoughness: 0.45,
    envMapIntensity: 0.16, mottle: true,
  },
};

/** Resolve a variant spec (falls back to the 860 table for cloths that
 * don't carry their own visual set, then to classic_green). */
export function clothVisual(clothId, variantName) {
  const entry = CLOTH_VISUALS[clothId];
  const variants = entry?.variants ?? CLOTH_VISUALS.simonis_860_tournament.variants;
  return variants[variantName ?? entry?.default ?? 'classic_green']
    ?? variants.classic_green;
}

/** GH-229 color resolver: compose a curated color's shading-response
 * fields over the ACTIVE cloth family's variant (weave axes stay the
 * family's). Unknown/empty colorId returns the family variant untouched —
 * the identity default. */
export function clothColorSpec(clothId, variantName, colorId) {
  const base = clothVisual(clothId, variantName);
  const c = CLOTH_COLORS[colorId];
  if (!c) return base;
  // specularIntensity is a SHADING-RESPONSE field (GH-489 R1): it rides
  // the color entry, never the family base — composing burgundy over the
  // snooker family must NOT inherit snooker_green's 0.02 GGX suppression
  // (review R1 P2: applyClothSpec restores the 1.0 default only when the
  // resolved spec omits the field, so the base's value has to be dropped
  // here or every non-green snooker swatch would keep it).
  const { specularIntensity: _familySpec, ...weave } = base;
  return { ...weave, ...c };
}

// ---------------------------------------------------------------------------
// CONDITION layer (GH-542). The equipment `cloth_id` axis names a physics
// preset, and one of those presets — `worn_slow`, catalog display name
// "Worn/dirty slow cloth" — is not a cloth FAMILY but a cloth CONDITION. The
// 032 atelier contract (the atelier contract (feature 032, internal) §7
// entry 15 remedial (b)) keeps the felt FAMILY on the VENUE, so a condition
// may not replace the family: it composes OVER whatever family + GH-229 color
// is active. That is also the physically correct model — a deposit sits on
// whatever cloth happens to be underneath it.
//
// WHAT THE CONDITION IS, taken from the kernel rather than from taste.
// crates/pool-core/src/params.rs:146-159 gives worn_slow u_s 0.25 (ABOVE Dr.
// Dave's typical 0.2; published band 0.15-0.4) and u_r 0.016. Sliding friction
// goes UP, so the dominant process is chalk/dust/oil LOADING — not the
// fibrillation polish that on its own makes a cloth FASTER. The look must
// therefore lead with the deposit and keep fibrillation as the second term.
//
// TERM 1 — chalk deposit, `chalk`. A thin, partially covering layer of cue
// chalk over the fibre tips, composited in LINEAR light as an areal mix:
// c' = (1 - chalk) * c + chalk * deposit. The linear areal mix is the form the
// soiling literature supports for PARTIAL coverage: Kubelka-Munk has a closed
// solution only for optically semi-infinite samples and is documented as
// inaccurate for dark shades and thin films, i.e. exactly a sub-monolayer
// powder on cloth. One equation, no free shape function.
//
// The deposit is WHITE, and that is derived rather than chosen:
//   - the bulk of a chalk block is white mineral. US Patent 578,514 (Spinks &
//     Hoskins, 1897, public domain) gives the process as sifted, finely ground
//     SILICA with "a small percentage" each of glue, corundum and colouring
//     agent, and states corundum is present solely to roughen the tip. Silica
//     and corundum are both white.
//   - the coloured fraction contributes no hue shift, because it was DESIGNED
//     not to. Chalk was originally white and "made such a mess of the playing
//     surface"; green then blue chalks were introduced precisely because they
//     were "not so noticeable" on the cloth, the chalk colour was traditionally
//     chosen to MATCH the cloth, and matched chalk is still stocked today to
//     prevent different-coloured marks. (Billiard & Snooker Heritage
//     Collection; Janquitto, 3cushionbilliards.com.)
// So the honest deposit is the white mineral alone: the felt lifts in value and
// drops in chroma at CONSTANT HUE on every colourway. R1a's neutral grey
// deposit was an invented constant and it rotated hue differently on every
// substrate (burgundy toward pink, snooker green toward mint) — that drift was
// an artifact of the invented value, not an observation about wear.
//
// NOT MODELLED, and recorded rather than fudged: the non-chalk soil (skin oil,
// airborne dust, abraded fibre) is real, is what the kernel's raised friction
// is mostly about, and is achromatic-to-warm DARK — the opposite sign to the
// chalk. Nothing published gives its share of the deposit, so adding it would
// be a free knob. It is omitted, which makes this term an upper bound on the
// lightening.
//
// TERM 2 — fibre-tip abrasion, `wear`. Matusiak & Kosiuk, Materials 18(15):3636
// (2025), CC BY 4.0 — Martindale abrasion on woven wool. The paper hands over
// RATIOS, and two of them map onto exactly one sheen leg each:
//   - Rp (max peak height above the mean line) falls 54..64%, midpoint 59%.
//     The crests standing proud of the mean line ARE the coherent reflectors of
//     a worsted sheen, so this is the AMPLITUDE leg: sheen *= 1 - wear*0.59.
//   - Rku (kurtosis) falls 7.09 -> 3.59. Rku = 3 is the Gaussian value and a
//     Gaussian slope distribution is the reference case of every microfacet
//     model, so excess kurtosis 4.09 -> 0.59 means 85.6% of the non-Gaussian
//     structure is destroyed and the lobe is driven toward the model's fully
//     rough limit. This is the WIDTH leg: sheenRoughness moves 85.6% * wear of
//     the way to 1.
// `wear` is the position on that trajectory, and worn_slow sits at 1.0 — the
// paper's measured endpoint. That is not a picked number: the endpoint is the
// only point on the trajectory anyone has measured, so any other value would be
// interpolation with nothing behind it. The assumption it does carry, stated
// plainly: Martindale is a standardised destructive test run to a cycle count,
// not a portrait of a tournament cloth after a season, and equating its
// endpoint with "worn" is an interpretation.
//
// WHAT DELIBERATELY DOES NOT MOVE, and why:
//   roughness / normalScale — the same paper finds Ra and Rq NOT significantly
//     changed by abrasion, and our nap normal carries bulk amplitude, not the
//     extreme tail that Rz/Rku describe. There is nothing to move honestly.
//   envMapIntensity — GH-440 (2026-08-08, MEASURED: live ablations moved zero
//     pixels; see table.js styleMaterials). On the vendored three release this
//     is a DEAD KNOB for any material lit by scene.environment — the renderer
//     feeds the shader from scene.environmentIntensity and reads
//     material.envMapIntensity only when material.envMap is set directly.
//     R1a scaled it anyway, which put a number in the tests with no pixels
//     behind it. Routing it live is a separate rung (the env probe is baked at
//     room-box centre; the fix is its CONTENT, whole-project blast radius).
//   mottle — the GH-228 owner verdict (cloth-calibration evidence, internal)
//     is that a +-5% low-frequency map reads as a quilt and that real cloth
//     reads as a uniform fine weave. Raising it back restores the artifact
//     the owner rejected.
//   the weave axes — 032 entry 15(b): the family follows the venue.
//
// TERM 3 — WHERE terms 1 and 2 land, the traffic field. A uniform veil is not
// a weak version of wear, it is a different thing: real played-on cloth carries
// a rack burn at the foot spot, a break corridor down the long axis, tracks
// along the rails and scuffed pocket mouths, and that STRUCTURE is most of what
// makes a cloth read as worn at all. Both terms above are DOSE-driven, so the
// structure is not a look to be painted — it is the spatial distribution of the
// dose, and the kernel can integrate it.
//
// tools/derive-cloth-traffic.mjs plays a deterministic rules-driven 9-ball
// ensemble (32 racks x 22 break-position strata x 6 aim-fullness strata =
// 4224 games, 41316 shots) through the SHIPPED canonical wasm and integrates
// two dose fields over the bed on two different published laws:
//   ABRASION — Archard, J. Appl. Phys. 24(8):981-988 (1953): V = K*W*s/H, worn
//     volume proportional to SLIDING distance at fixed load. Under a ball the
//     load is fixed (its weight), so the dose is the slip-path density
//     (1/A) * sum_balls integral |u| dt, u = the contact-point relative
//     velocity. Rolling contributes exactly zero, because u = 0 is what rolling
//     means. Archard is also the law behind the measurement TERM 2 cites:
//     Martindale (ISO 12947) counts rubbing cycles, i.e. slip distance at fixed
//     load — so the field and the ratios are the same physics twice.
//   DEPOSIT — transport: chalk leaves the tip and rides the balls, so the dose
//     is the contact-path density (1/A) * sum_balls integral |v| dt: where ball
//     surface met cloth at all, sliding or rolling.
// Both integrals come from the kernel's own closed forms, not from differencing
// the sampler (the tool records why: the sampled orientation quaternion does not
// satisfy the rolling constraint to better than ~25% of |v| on some rolling
// legs, so a differenced omega would have written that error into the field).
// The slip integral is gated on the kernel's own Sliding->Rolling transition
// times and agrees to 8.9e-16 s over 408623 slides.
//
// ANCHORING — the field is a RELATIVE distribution; one scalar per term fixes
// its absolute level, and each is anchored where its evidence lives:
//   abrasion is PEAK-anchored (wearPeak = the Martindale endpoint at the
//     single most-worn point). The endpoint is the only measured point on the
//     trajectory, and peak-anchoring is the only assignment that never
//     extrapolates PAST it — mean-anchoring would put the hottest texel at
//     2.51x the measured endpoint. The bed then averages to wear 0.399.
//   deposit is MEAN-anchored (chalkMean = 0.0174), because the dE FLOOR that
//     it has to clear is a whole-cloth colour-read argument, not a hot-spot
//     one. The bed peak follows at 0.0174 / 0.627906 = 0.0277 — and the dE
//     CEILING is applied THERE, at the peak, because an identity claim fails
//     at the worst patch rather than on average. TERM 1 records why the two
//     measures differ and why applying both at once pins the value.
//
// WHAT THE ENSEMBLE IS NOT, recorded rather than hidden: it plays only the
// forced 9-ball pot (ghost-ball aim at the smallest cut, lowest speed on the
// ladder that reaches the pocket). No safeties, no position play, no kicks, no
// masse, and the spin-about-vertical patch slip is not integrated. Real play
// spreads dose more widely than this, so the derived CONTRAST is an upper
// bound and the true field is flatter. The cue-ball/object-ball deposit split
// is modelled (equal weighting) rather than measured, and it MATTERS: the tool
// reports Pearson r = 0.5228 between the equal-weighted field and a
// cue-ball-only field. That is a real structural difference, not a rounding
// one — the cue ball lives in the kitchen and on the break corridor, the object
// balls live near the pockets they are sunk into, so the two fields disagree
// most exactly where the eye looks. (The first cut of the tool quoted 0.96 here
// and concluded "the choice moves the pattern very little"; that figure was an
// UNCENTRED cosine between two mostly-positive fields, which is near 1 almost
// regardless of structure. Both the number and the conclusion drawn from it
// were wrong — review r1 P2.) The equal weighting is Estimated, and its blast
// radius is wide: the cue-ball-only extreme shares only r^2 = 0.27 of the
// equal-weighted field's variance. A measured split needs the same worn-cloth
// reference TERM 1 is waiting on, since both would be read off one photograph.
//
// PROVENANCE (ADR-0016). `wear` and both its response ratios are
// Estimated(published proxy) — the paper's endpoint and ratios are real
// measurements, but of a DIFFERENT worsted wool, transferred onto Simonis 860
// with nothing validating the transfer. They were carried as Published until
// the GH-542 visual audit (round 6, finding 4) refused the tier, correctly: a
// published number about another material is a defensible estimator for this
// one, not a published value of it. The distinction still bites — a proxy row
// names what it transfers FROM and dies to a measurement of 860 itself
// (MANIFEST gap 7 upgrade path (b), the CC0 BRDF), where the estimate below
// names only the band it had to sit inside. The field SHAPE is Derived (kernel
// integration under Archard, re-derivable and gated by the tool). `chalk` is the
// one scalar with no measurement anywhere behind it — Estimated(no measured soil
// loading for a played-on pool cloth exists anywhere: the estate holds no
// worn-cloth reference at all [docs/reference/MANIFEST.md gap 7], and its table
// photographs are freshly clothed tournament beds whose within-bed L* span from
// lamp falloff alone is 34-55 units, an order of magnitude over the effect being
// looked for).
//
// It is not free-floating, though. It is pinned between two grounded ends, and
// what makes them pin rather than merely bracket is that EACH APPLIES AT ITS
// OWN MEASURE — one to the bed mean, the other to the bed peak:
//   CEILING, at the bed PEAK — the tightest step on the shipped COLOUR axis is
//     17.75 dE76 (classic_green vs steel_gray). A condition that moved the felt
//     further than a colour change would be misrepresenting itself as a colour,
//     which is the exact failure the R1a visual audit named. That is an
//     IDENTITY claim, and an identity fails first where the cloth has changed
//     most — you do not stop recognising a colourway on average, you stop
//     recognising it at the patch that no longer looks like it. Bounding the
//     mean and letting the peak run past is the same error as quoting a
//     frame-wide pixel mean over a change that only touches one object (see the
//     capture-harness note on `meanSignedOn`): the worst region hides behind
//     the rest. So the ceiling binds the hottest texel on every colourway.
//   FLOOR, at the bed MEAN — soiling tests calibrate their cycle counts so the
//     soiled control lands at dE ~3-4, described as the naked-eye visibility
//     threshold. That is a claim about the ARTICLE, so it binds the bed mean: a
//     cloth whose only visible soiling is one hot texel is not what the catalog
//     means by "Worn/dirty".
//
// The two ends are not the same KIND of number, and the selection rule turns on
// that. The ceiling is EXACT — a dE between two colours this project itself
// ships, with no error bar to quote — so it is a hard bound. The floor is
// somebody else's threshold, published as a RANGE ("dE ~3-4"), so collapsing it
// to a midpoint and then treating 3.49 as a failure would be false precision
// about an approximation. It is therefore carried as the range it was published
// as.
//
// So the rule is: TAKE THE LARGEST LOADING THE HARD BOUND PERMITS, then report
// where that lands against the soft one. The direction matters and it is the
// opposite of R1b's. R1b also maximised, but against a ceiling applied at the
// wrong measure, which left it 92% of the way to a limit it had already
// overshot in the places that count. Here the ceiling is at the peak, where an
// identity actually fails, and there is a reason to sit at it rather than below
// it: the FLOOR is the constraint with no headroom left. The derived field's
// peak/mean is 1/0.627906 = 1.593, so the ceiling caps chalk at 0.01794 on
// snooker_green (burgundy bound it until #1209) — and the
// midpoint of the floor's range would want 0.01797. The two grounded
// constraints now sit 0.2% apart, well inside the precision of the floor's own
// citation ("dE ~3-4" is a 30% wide range). Anything lower than the ceiling
// makes the least responsive colourways less visible for no gain; nothing
// higher is available.
//
// Note the ORDER of those two, because it flipped when the R1d break sampler
// flattened the field (peak/mean 1.906 -> 1.593) and it is worth being explicit
// that nothing about the rule changed with it. Under the old field the ceiling
// (0.01686) sat BELOW the floor's midpoint (0.01797), so the selection was the
// ceiling holding the loading down away from where the floor would have liked
// it. Under the R1d field the ceiling (0.02018, burgundy) sat ABOVE that
// midpoint, so the same "largest the hard bound permits" selection cleared the
// floor's midpoint outright rather than falling short of it. The rule was
// unchanged and still bound at the ceiling; the flatter field simply bought
// headroom, which is exactly what a lower peak/mean buys when the ceiling is
// applied at the peak and the floor at the mean. #1209 spent that headroom
// without moving the field: snooker_green's GH-489 R1 re-solve (0x041d08) made
// it the most responsive colourway, its ceiling lands on the floor's midpoint,
// and the 8-bit step below takes the selection under it — so the ceiling holds
// the loading down again.
//
// One more step down from that cap, and it is not a taste. The shipped colour
// is an 8-bit sRGB triple, so dE against it moves in QUANTIZATION PLATEAUS: on
// snooker_green the continuous model crosses 17.75 at chalk 0.01794, but the
// rounded colour is already over at 0.0175 (17.78, a plateau through 0.0177),
// back under at 0.0178-0.0181 and over for good from 0.0182, purely because a
// channel rounds the other way (burgundy, under R1d: continuous 0.02018, rounded
// over at 0.0200). A value that passes only because an 8-bit step landed
// favourably is a rounding artifact wearing a bound's clothes, so the selection
// takes the largest 4-dp loading that clears the ceiling on BOTH the continuous
// model and the shipped 8-bit colour, i.e. the last one below the FIRST
// crossing.
//
// chalk = 0.0174, then. Bed mean / peak texel, in dE76, as capture-542-cloth.mjs
// measures them on the shipped 8-bit colours (its table is the gate; these are
// its numbers, so the two cannot disagree):
//   steel_gray 3.41 / 5.20, tournament_blue 3.96 / 6.16, classic_green 6.14 /
//   9.11, camel 6.83 / 10.46, burgundy 11.58 / 16.01, snooker_green 12.98 /
//   17.21.
// No texel anywhere on any colourway reads as a different product. Four
// colourways are clear of the visibility range; steel_gray (3.41) and
// tournament_blue (3.96) sit inside it rather than above it, which is the
// residual honest cost of the ceiling binding first — and it is stated in the
// capture sheet as `in range`, not passed off as a clean pass. At 0.0199 (R1d,
// before snooker_green's re-solve) that cost fell on steel_gray alone (3.8);
// under the pre-R1d field it fell on the same two as now (steel_gray 3.4,
// tournament_blue 3.9). The rule did not change either time; the cost it imposes
// moved with the field and the colourways. The 3.8x spread across substrates
// is physical, not a defect: a dark saturated cloth shows a white deposit more
// than a light grey one does, which is the same fact that makes matched chalk
// worth selling. It also means the two ends bind on DIFFERENT colourways —
// snooker_green sets the ceiling, steel_gray sets the floor — so no single
// substrate could have been used to pick this number.
//
// HISTORY, because the two wrong versions are instructive. R1a shipped 0.10,
// which is over the ceiling outright. R1b shipped 0.03 under the rule "the
// largest the upper end permits" — a preference wearing a rule's clothes; it
// sat at 92% of the way to a ceiling that was itself being applied at the wrong
// measure, and the R1b visual audit called the result bleach. Both errors were
// the same error: bounding an identity claim by an average. R1c's 0.0173 was
// the same rule as this one, applied to a traffic ensemble that kept playing
// racks the rules had already ended (review r4 P2); adjudicating the 9 moved the
// deposit peak/mean from 1.873 to 1.907 and the same rule returned 0.0166. That
// is the rule working, not a re-tune: nobody chose the new number. The visual
// audit then asked to SEE that adjudication (r5 P1), and the answer was to stop
// having one of our own: the derivation now judges every shot with the shipped
// `nineball-v1` referee and spots the 9 on the shipped WPA 1.5 geometry. The
// referee agreed with the hand-written version on all 4897 shots — the field
// moved only because the spot geometry did — peak/mean went 1.907 -> 1.906, and
// the rule returned 0.0166 again, unchanged to four places. A derivation whose
// answer survives having its rule engine replaced is the strongest statement
// available here that the number is not being steered.
//
// R1d is the third time the same rule has been re-run on a moved field, and the
// first time it returned a different number. The owner's physics review of the
// R1c pack asked whether the ensemble's BREAK PARAMETERS varied realistically
// across racks, and the honest answer was no: 5 fixed break positions over an
// uncited span, 3 fixed speeds, and a = b = theta = 0 with aim exactly at the
// apex on all 480 games. That is a scripted break, and a scripted break lays
// down a thin rut where reality lays a converging fan. Replacing it with a
// cited distribution (ICGA execution noise, Archibald/Altman/Shoham AAMAS 2010
// s2.2.1, over strata sized so the design comb's own Poisson ripple is under
// 1%) flattened the field: deposit peak/mean 1.906 -> 1.593, abrasion
// 3.351 -> 2.507. The rule then returned 0.0199 where it had returned 0.0166,
// and the CHALK PEAK it actually pins barely moved at all (0.031640 ->
// 0.031698) — which is the signature of a rule that binds at the peak doing
// exactly what it says: the ceiling held the hot texel still and the bed mean
// rose underneath it. Nobody chose 0.0199 either. #1209 is the first re-run on
// a moved COLOURWAY rather than a moved field: snooker_green's GH-489 R1
// re-solve (0x041d08) put its hottest texel at 18.92 under 0.0199, over the
// ceiling, and the same rule returned 0.0174 (chalk peak 0.031693 -> 0.027711).
// Nobody chose that one either.
//
// Replace the estimate with a measurement as soon as a controlled
// worn-vs-covered-control photograph or an RGL/EPFL BRDF scan of a worn offcut
// exists. Pinning it between two published constraints is a way of being honest
// about NOT having one, not a substitute for having one.

/** Matusiak & Kosiuk 2025, Rp -54..-64% -> midpoint. Sheen AMPLITUDE leg. */
const ABRASION_RP_LOSS = 0.59;
/** Matusiak & Kosiuk 2025, excess kurtosis 7.09-3 -> 3.59-3: the fraction of
 * non-Gaussian surface structure destroyed. Sheen LOBE-WIDTH leg. */
const ABRASION_RKU_GAUSSIANIZATION = 1 - (3.59 - 3) / (7.09 - 3);

/** The TERM 3 traffic field: the committed derived artifact plus the two bed
 * means MIRRORED from its manifest (web/assets/cloth/traffic.json `derived`).
 * `node tools/derive-cloth-traffic.mjs` re-derives from the shipped wasm and
 * exits non-zero if either the artifact or these mirrors drift — the
 * derive-groove-occlusion.mjs gate idiom. Peak-normalised fields, so each mean
 * is that field's own mean/peak ratio. */
export const CLOTH_TRAFFIC = {
  url: './assets/cloth/traffic_128x256.png',
  abrasionMeanOverPeak: 0.398888,
  depositMeanOverPeak: 0.627906,
};

/** Each condition carries its two anchors AT THE PLACE ITS EVIDENCE LIVES (see
 * TERM 3 ANCHORING): the deposit as a bed MEAN, the abrasion as a bed PEAK. */
export const CLOTH_CONDITIONS = {
  // chalkMean is set by TERM 1's HARD end — the identity ceiling, applied at
  // the bed PEAK — and the soft visibility floor's midpoint lands 3.3% above it
  // (#1209: the ceiling binds first). Not a round number because it is not a
  // chosen one: it is the largest 4-dp loading whose hottest texel still clears
  // the ceiling on snooker_green, the most responsive shipped colourway since
  // its GH-489 R1 re-solve, on both the continuous model and the shipped 8-bit
  // colour. capture-542-cloth.mjs re-measures both ends on every colourway and
  // exits non-zero if this value stops satisfying them.
  worn_slow: { chalkMean: 0.0174, wearPeak: 1.0 },
};

const _s2l = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const _l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** Composite `hex` under a partially covering WHITE mineral deposit, per
 * channel, in LINEAR light — an sRGB-space mix would be a gamma artifact
 * rather than a layer. White is the deposit colour for the reasons in TERM 1;
 * because it is achromatic in linear light the mix preserves hue exactly. */
function depositMix(hex, coverage) {
  let out = 0;
  for (let s = 16; s >= 0; s -= 8) {
    const c = _s2l(((hex >> s) & 255) / 255);
    const v = Math.round(_l2s(c + (1 - c) * coverage) * 255);
    out = (out << 8) | Math.min(255, Math.max(0, v));
  }
  return out >>> 0;
}

/** The condition model at ONE point of the bed: `chalk` = the locally covered
 * fibre-tip fraction (TERM 1), `wear` = the local position on the Martindale
 * abrasion trajectory (TERM 2). Every consumer goes through this — the CPU
 * resolver below evaluates it at the bed MEAN, and the bed shader reproduces
 * the same three lines per fragment off the TERM 3 field. */
function conditionAt(spec, chalk, wear) {
  // the chalk-covered fraction of the fibre tips cannot produce the coherent
  // lobe at all (occlusion), and what is left of it is abraded — so the two
  // terms multiply on the amplitude leg rather than competing.
  const lobeWidening = wear * ABRASION_RKU_GAUSSIANIZATION;
  return {
    ...spec,
    color: depositMix(spec.color, chalk),
    sheen: +(spec.sheen * (1 - chalk)
      * (1 - wear * ABRASION_RP_LOSS)).toFixed(4),
    sheenColor: depositMix(spec.sheenColor, chalk),
    sheenRoughness: +(spec.sheenRoughness
      + (1 - spec.sheenRoughness) * lobeWidening).toFixed(4),
    // envMapIntensity intentionally untouched — dead knob here, see GH-440
    // above. Scaling it would put a number in the tests with no pixels behind
    // it, which is what R1a did.
  };
}

/** GH-542 condition resolver: compose the wear condition named by the
 * equipment `cloth_id` over an already-resolved family/color spec (so the
 * order is family -> color -> condition). Returns the SAME OBJECT for every
 * id without a condition record — the identity default, so every committed
 * capture and ink pin stays byte-identical.
 *
 * This is the BED-AVERAGE answer, and deliberately so. It is what a 2 cm swatch
 * chip, a picker preview and an off-table cloth surface can honestly say (they
 * have no bed position to look up), and it is what the shared material carries
 * so that a failed or stale traffic texture degrades to the correct mean rather
 * than to a pristine felt. The bed itself then renders the RESIDUAL around this
 * mean per fragment — see clothConditionField.
 *
 * Precisely: this is the condition evaluated AT the mean dose, which is not in
 * general the mean of the condition over the bed. For the colour and the lobe
 * width it is the same thing — both are linear in their dose, so E[f(d)] =
 * f(E[d]) exactly. The sheen AMPLITUDE leg is the product (1-chalk)(1-wear*Rp)
 * of two fields that are positively correlated (both are traffic-driven), so
 * there the two differ by their covariance term. At the shipped anchors that is
 * bounded by 0.0174 * 0.59 ~ 0.4% of the amplitude, i.e. under the 1e-4 this
 * function rounds to; the measured bed-average shift with the field on versus
 * off is under one sRGB level. Evaluating at the mean dose is also the only one
 * of the two a swatch chip could compute, since it has no bed to average over. */
export function clothConditionSpec(spec, clothId) {
  const k = CLOTH_CONDITIONS[clothId];
  if (!k || !spec) return spec;
  return conditionAt(spec, k.chalkMean,
    k.wearPeak * CLOTH_TRAFFIC.abrasionMeanOverPeak);
}

/** GH-542 TERM 3: the per-fragment model the bed shader needs — the two peak
 * scalars the traffic field multiplies, the two bed means the CPU spec above
 * already applied (so the shader can render the residual and not double-count),
 * and the two published response ratios. null for every id without a condition
 * record, which is the shader's identity default. */
export function clothConditionField(clothId) {
  const k = CLOTH_CONDITIONS[clothId];
  if (!k) return null;
  return {
    url: CLOTH_TRAFFIC.url,
    chalkPeak: k.chalkMean / CLOTH_TRAFFIC.depositMeanOverPeak,
    chalkMean: k.chalkMean,
    wearPeak: k.wearPeak,
    wearMean: k.wearPeak * CLOTH_TRAFFIC.abrasionMeanOverPeak,
    rpLoss: ABRASION_RP_LOSS,
    rkuGaussianization: ABRASION_RKU_GAUSSIANIZATION,
  };
}

/** Apply a resolved spec to the shared cloth material (GH-229 split: the
 * color-composed specs flow through the SAME writes as the variants —
 * applyClothVisual below stays byte-behavior-identical). */
export function applyClothSpec(clothMat, v, { mottleMap } = {}) {
  clothMat.color.setHex(v.color);
  clothMat.sheen = v.sheen;
  clothMat.sheenColor.setHex(v.sheenColor);
  clothMat.sheenRoughness = v.sheenRoughness;
  clothMat.envMapIntensity = v.envMapIntensity;
  // GH-490 round-13 origin (chinese8_green grazing-wash fix), generalized
  // by GH-489 R1: a variant may pin the white-GGX lobe (snooker_green 0.02
  // — the default-1.0 lobe washed the rendered field at photo-family
  // exposure). Every variant WITHOUT the field restores the
  // MeshPhysicalMaterial constructor default 1.0, so a variant switch can
  // never inherit another cloth's specular response (write-always, the
  // #52 empty-slot lesson).
  clothMat.specularIntensity = v.specularIntensity ?? 1.0;
  if (!v.mottle) clothMat.map = null;
  else if (mottleMap) clothMat.map = mottleMap;
  clothMat.needsUpdate = true;
  // GH-490 review r31-r2 P1: materials LINKED to the shared cloth (the
  // cn8 unlit dim-curl family — table.js registers them in
  // userData.linkedCloth) share the Color INSTANCE (in-place setHex
  // above propagates) but a map REPLACEMENT is an instance swap the
  // link cannot see — mirror the swap onto every linked material so a
  // live variant change never strands a stale map on the curl.
  for (const m of clothMat.userData.linkedCloth ?? []) {
    m.map = clothMat.map;
    m.needsUpdate = true;
  }
  return v;
}

/** Apply a visual variant to the shared cloth material (bed + cushions).
 * `mottleMap` = the build-time low-frequency cloth map (kept by the caller;
 * variants with mottle:false drop it — a uniform fine weave reads as stains
 * once the cloth goes gray). Returns the applied spec. */
export function applyClothVisual(clothMat, clothId, variantName, opts = {}) {
  return applyClothSpec(clothMat, clothVisual(clothId, variantName), opts);
}
