// Copyright (c) Meta Platforms, Inc. and affiliates.

// lightingvisuals.js — issue #89 lighting axis: five visually-distinct table
// fixtures (perimeter LED ring / canopy panel / pendant bar / snooker
// luminaire / carom luminaire) + a 0.6–1.4× brightness scale with the
// 520-lux WPA detent in the settings UI, and the GH-386 VENUE DEFAULT: the
// room hangs each table class's own lamp (CLASS_FIXTURES below) unless the
// player explicitly picked one. LEAF module (cache-poison contract,
// the ownership ledger rule 5):
// reached ONLY via a guarded dynamic import from main.js; a stale/missing
// copy leaves today's canopy rig untouched. Its imports are namespace +
// optional-chained so a stale room.js/shading.js degrades, never dies.
//
// Architecture laws (issue #89, binding):
//   - VISUAL-ONLY: never touches the kernel, ShotRecord, scenario bytes or
//     the share codec — the `look` precedent, not an equipment axis.
//   - IDENTITY DEFAULT: lightingProfile('canopy_panel', 1.0) returns today's
//     literal rig (RectAreaLight 0xfff1da / 7.6 / 2.05×0.66 @ y=1.02, hemi
//     0.22, fill 2.2, lamp face (10, 9, 7.1) — scene/room.js), and applying
//     it is a NO-OP: zero capture re-baselining, every existing pin holds.
//   - BRIGHTNESS never writes renderer.toneMappingExposure (look-owned,
//     e2e-pinned 1.05/0.85 to 1e-9): it linearly scales the rect emitters,
//     the emissive faces, the warm fill and the baked-GI gain (gi.setGain).
//     The hemi bounce stand-in is deliberately EXCLUDED: its level is
//     already co-owned by gi.js (default-look ×0.5 dim) and look.js (tournament
//     async re-assert) — scaling it here would race both writers for a
//     few-percent luminance term (recorded decision).
//   - COMPOSE ORDER: lighting applies AFTER a look regrade, scaling from the
//     look's bases (look.js calls window.__lighting.regrade(name) — the
//     LOOK_BASES table below is a documented mirror of room.js defaults +
//     look.js tournament constants; change them together).
//   - BAKE HONESTY: per-fixture baked-GI sets ride the gi-manifest fixture
//     dimension (gi.setFixture). A fixture without a committed bake is
//     honesty-gated by gi.js (uGiOn = 0, documented pre-GI lighting) — the
//     #52 recorded-downgrade precedent, never someone else's shadows.
import * as THREE from 'three';
// namespace imports ON PURPOSE (cache-poison contract): stale copies of
// room.js/shading.js/table.js without the newer exports degrade via
// optional chaining.
import * as roomMod from './room.js';
import * as shadingMod from './shading.js';
import * as tableMod from './table.js';

export const FIXTURE_IDS = Object.freeze([
  'canopy_panel', 'perimeter_ring', 'pendant_bar', 'snooker_luminaire',
  'carom_luminaire']);
export const BRIGHTNESS_MIN = 0.6;
export const BRIGHTNESS_MAX = 1.4;

const IN = 0.0254; // catalog dimensions are inch-sourced (issue #89 table)
const CEIL_Y = 2.45; // room.js ceiling (suspension rods reach it)

/** Fixture catalog (issue #89, owner-approved dedup to FOUR types).
 * `emitters` = down-facing rect emitters {x, z, y, w, d} (w = x span,
 * d = z span, metres, bed y = 0). `ratio` = per-emitter radiance multiplier
 * over the active look's lamp intensity. CALIBRATION (issue #117 owner
 * retune, 2026-07-22): the canopy panel is the perceived-brightness truth;
 * each non-canopy `ratio` is solved so the RENDERED PLAYFIELD-CENTER cloth
 * luminance at brightness 1.0 matches the canopy's (rendered-pixel match,
 * tournament look, hero view — the eye lives at the centre). This SUPERSEDES the
 * #89 average-illuminance calibration, which left edge-bright/center-dim
 * fixtures (ring/pendant) reading ~0.3x the canopy at the centre — the owner
 * defect. Evidence + before/after: the internal lighting-tune record.
 * `cct` = fixed emitter color (canopy: null — the look's lamp color IS the
 * canopy color). `face` = emissive-face color scale (the room.js ×10 lamp-face
 * law: faces stay ~10× so ball crowns read structure without feeding bloom
 * halos — room.js:107-111 lesson; ×1.4 brightness stays under the 20× halo
 * regime; the #117 ratio lift is a LIGHT-radiance change only, faces held).
 */
const FIXTURES = Object.freeze({
  canopy_panel: {
    // today's rig verbatim (room.js literals) — the identity default
    emitters: [{ x: 0, z: 0, y: 1.02, w: 2.05, d: 0.66 }],
    ratio: 1, cct: null, faceMul: null, clearanceY: 1.02,
  },
  perimeter_ring: {
    // rect ring of 2.75 in LED strip, 53×102.4 in outer, ~45 in above bed,
    // 5000–5500 K: four specular streaks per ball (4 rect emitters in the LTC
    // direct + sheen paths + 4 emissive strips in the env cubemap).
    // ISSUE #117 owner retune (2026-07-22): the canopy panel is the
    // perceived-brightness reference; every other fixture must read as bright
    // AT THE PLAYFIELD CENTER as the canopy at brightness 1.0 / WPA 520 detent.
    // The prior ratio (4.736) equalized AVERAGE bed illuminance, but a ring is
    // physically edge-bright/center-dim, so the centre — where the eye lives —
    // read ~0.30x the canopy (rendered-pixel measure, tournament look, hero view;
    // internal lighting-tune record). Two changes: (a) clearance 52→45 in so
    // it stops floating above where the canopy sat (still inside the real
    // 45–60 in range); (b) ratio re-solved by rendered-center match to the
    // canopy (center Y ≈ canopy, brighter rails accepted — the ring's real
    // signature). Lowering the ring 11% cut the ratio the center match needs
    // (evidence-based: the internal lighting-tune record).
    emitters: (() => {
      const ow = 102.4 * IN, od = 53 * IN, sw = 2.75 * IN, y = 45 * IN;
      return [
        { x: 0, z: -(od - sw) / 2, y, w: ow - 2 * sw, d: sw },
        { x: 0, z: +(od - sw) / 2, y, w: ow - 2 * sw, d: sw },
        { x: -(ow - sw) / 2, z: 0, y, w: sw, d: od },
        { x: +(ow - sw) / 2, z: 0, y, w: sw, d: od },
      ];
    })(),
    ratio: 14.381, cct: 0xffeed6, faceMul: 11, clearanceY: 45 * IN,
  },
  pendant_bar: {
    // 3× ~15 in shades on a ~57 in bar, shade aperture ~35 in above bed,
    // 2700–3000 K: overlapping warm pools, MULTIPLE penumbral shadows per
    // ball (3 emitter lobes), scalloped banding from the 3 hot pools.
    // ISSUE #117 owner retune: audited against the canopy reference — the warm
    // pools read ~0.32x the canopy center (rendered-pixel measure, perceived
    // luminance not raw lux since it is warm). ratio re-solved so the center
    // matches the canopy at brightness 1.0; the 3 small shade apertures need a
    // high radiance for that (small emitter area). Faces (faceMul) unchanged —
    // the halo guardrail (room.js:107-111) holds (no bloom at the tuned ratio).
    // GH-975 RIG SCALING: these three shades at 0.55 m are the catalog's
    // 9-ft literal only; the hung rig spreads its shades along the ACTIVE bed
    // (pendantEmitters below — rigFor()).
    emitters: [-0.55, 0, 0.55].map((x) =>
      ({ x, z: 0, y: 0.90, w: 0.26, d: 0.26 })),
    ratio: 20.516, cct: 0xffb875, faceMul: 9, clearanceY: 0.90,
    scalesWithTable: true,
  },
  snooker_luminaire: {
    // 2984×200 mm thin strip at 1150 mm (10/12-ft table sizing — lux labels
    // carry the CIBSE / Sport England LG4 honesty note in settings, WPBSA
    // publishes no lighting spec): highly uniform, one long thin specular
    // streak per ball. Single emitter — the identity shader path.
    // ISSUE #117 owner retune: audited against the canopy reference — the strip
    // read ~0.50x the canopy center (rendered-pixel measure, tournament look). ratio
    // re-solved so the center matches the canopy at brightness 1.0 / WPA detent
    // (properly-lit table for the discipline default). No halo at the tuned ratio.
    // GH-386: this fixture is now the snooker_12ft VENUE DEFAULT
    // (CLASS_FIXTURES below) — its class bake set is committed; the ratio's
    // rendered-center match was re-verified ON the snooker table (numbers in
    // the GH-386 evidence pack).
    // 489 REBUILD R0 (2026-08-19, ONE-TABLE LAW — canonical 星牌 XW101):
    // this rig's provenance (CIBSE/LG4 sizing + the #117 canopy-center
    // ratio) is RETIRED as a MATERIAL-judgment basis — it was never
    // photo-fit to any real snooker venue (docs/fidelity/
    // 489-xw101-one-table-retirement.md §1). Material rows are judged
    // under the XW101 photo-fit presets in tools/render/
    // cammatch-489-registry.json.
    // 489 CORNER GRAFT (2026-08-20) — STRUCTURAL RE-FIT, the R0/R1
    // named rider: after the R1 pure-XW101 albedo re-solves the shipped
    // rig under-lit the identity family ~2.65× — exactly the frozen
    // studio_xw101 runtime preset's total gain (brightness 1.4 ×
    // exposure_mul 1.891 = 2.647, fitted against the XW101 studio
    // frames, objective Σ|log g| 0.413). That gain moves INTO the rig
    // as `oneTableGain`, CLASS-SCOPED (review graft-r2 P2): it applies
    // only where the ONE-TABLE law does — this fixture hanging over its
    // OWN venue class (the 12-ft snooker table, where the GI bake mirror
    // carries 6.994 × 2.647 = 18.514) — so a player manually hanging the
    // strip over pool/carom keeps the #117 family-normalized read, and
    // the 520-lux WPA readout stays scoped to the rigs it was solved
    // for (the snooker label already rides the CIBSE/LG4 honesty note).
    // The default snooker read carries the photo-fit exposure and the
    // studio preset re-fits to exposure_mul 1.0 exactly (registry
    // light_presets record). GI rebaked ×2 with it (A/B byte-identical).
    // GH-975: the 2.647 lives in MATCH_GAINS.wpbsa_snooker_12ft (byte-held for
    // this fixture) — it is the TABLE's photo-fit level, so every lamp
    // hung over the 12-ft bed is matched to it, not this lamp alone.
    emitters: [{ x: 0, z: 0, y: 1.15, w: 2.984, d: 0.20 }],
    ratio: 6.994,
    cct: 0xfdf9f2, faceMul: 10, clearanceY: 1.15,
  },
  carom_luminaire: {
    // GH-386: the carom_284 VENUE DEFAULT — match-table carom (UMB 2.84 m
    // playfield) is lit by ONE long linear luminaire spanning most of the
    // playfield (tournament practice; the classic 3-shade pendant tops out
    // at 9-ft tables). Footprint 2.60×0.35 m per the GH-381 decision-pack
    // reference measurements (the "carom-authentic slim rig"); hang height
    // PINNED at y = 1.02 by the owner's #381 Option A ruling (UMB World
    // Rules Ch. II Art. 15: light source >= 1 m over the bed, >= 520 lux;
    // the merged occluder-fade handles camera clearance at this hang).
    // Neutral-white tournament LED (~5000 K). `ratio` solved per the #117
    // law: rendered playfield-CENTER cloth luminance match with the canopy
    // at brightness 1.0, measured ON the carom table (tournament look, hero view —
    // evidence in the GH-386 pack).
    emitters: [{ x: 0, z: 0, y: 1.02, w: 2.60, d: 0.35 }],
    ratio: 2.74, cct: 0xfaf7f0, faceMul: 10, clearanceY: 1.02,
  },
  joy_lowrect: {
    // GH-490 REBUILD R0 (ONE-TABLE LAW): the chinese8 class's OWN venue
    // rig, photo-FIT against the canonical JOY Q8 dossier frames — this
    // RETIRES the borrowed snooker_luminaire numbers for the class (the
    // 2026-08-19 one-table adjudication: the shared snooker fixture was
    // a cross-discipline borrow whose 10/12-ft span + r12/r13 keyTrim
    // band-aid carried the chimera; owner decision ⑬'s low-rect CLASS
    // stands — only the numbers move to JOY-solved values).
    // Fit record (tools/render/cammatch/fit-rig-490.{mjs,py}, coarse 48
    // + fine 243 candidates on the SOLVED tpt showroom poses,
    // Drive dossier-joy-q8): span 2.536 m = the snooker strip's own
    // 0.836 playfield-coverage law scaled to the 2.54 m table (the fine
    // sweep preferred it over 2.984/3.521 in every top row), depth 0.20
    // (weakly resolved 0.17-0.236), hang 1.15 m kept, WARM 0xfff1da (the
    // warm cell beat 0xfdf9f2/0xf2f4f7 across the whole top-12 — the WB
    // fit's red-deficiency closed), delivered radiance ×1.375 over the
    // old trimmed level (venue score 1.45 → 0.99; rail-streak presence
    // term 0.61 → 0.21, boot dV 0.094 → 0.055).  ratio 4.260: the fit's
    // 5.092 first cut ran hot on the landed tree — the LIVE fit preview
    // rode the old snooker bake at the keyTrim'd 0.45 GI gain, while the
    // landed rig runs its OWN bake at gain 1 (keyTrim retired), so the
    // indirect term jumped ~2.2× beyond the preview (WB gains 0.78-0.92
    // on the venue frame).  The closed-loop iteration puts the DIRECT
    // term back on the fit's delivered level (4.260 × 7.6 = 32.4 ≈ the
    // fit's 32.9) with the bake re-run at the same ratio; the residual
    // cloth +0.16 V wash is ALBEDO-side (dS −0.24 co-signs — washed,
    // not just bright) and belongs to the cloth re-solve round, while
    // boot dV sits green at ±0.03 on both close-up frames.  The
    // r12/r13 keyTrim band-aid RETIRES with this entry (its photo-key
    // job is the solve itself now; single ratio solved on the default
    // tier, the tournament tier rides it until the tournament-tier harness runs
    // measure otherwise).  VENUE-ONLY: not in FIXTURE_IDS — the rig
    // follows the class (GH-386 auto mode); explicit picks keep the
    // user-facing catalog untouched (no i18n surface).
    emitters: [{ x: 0, z: 0, y: 1.15, w: 2.536, d: 0.20 }],
    ratio: 4.260, cct: 0xfff1da, faceMul: 10, clearanceY: 1.15,
  },
  pdt_studio: {
    // GH-488P wave M (ONE-TABLE LAW, maintainer ruling L-A/L-B): the
    // Predator Apex 9 ft's OWN venue rig. It is NOT a borrow — the frozen
    // -rig law protects the ACCEPTED tables' fitted rigs (joy_lowrect,
    // studio_xw101); it never required a new table to inherit one. This
    // table's footprint (2.54x1.27) is byte-identical to the generic pool
    // class, so the rig is routed by TABLE ID (see TABLE_FIXTURES) and
    // every other 9-ft pool table keeps canopy_panel byte-for-byte.
    //
    // WHY A NEW RIG AT ALL — the defect this closes (measured, wave M):
    //   register        reference (studio close-up)   canopy_panel render
    //   rail/cabinet    (38,38,38)  r/b 1.000         (40,35,26) r/b 1.538
    //   rim band        r/b 1.003 +- 0.006            (116,112,95) r/b 1.221
    //   plug/felt disc  (38,36,39)  r/b 0.974         (43,37,26) r/b 1.654
    // The reference's neutral materials read NEUTRAL; ours read warm by up
    // to +54%. An all-neutral ablation (every light white, environment
    // nulled, envMapIntensity 0, uGiIrr 0) renders the same bytes at rail
    // (18,18,18) r/b 1.000 and plug (6,6,6) r/b 1.000 — so the albedos are
    // already neutral by construction and 100% of the cast is RIG-side.
    // (That also refutes the table.js r4 note blaming the tone curve: ACES
    // has row-sum-1 matrices and measurably preserves neutral here.)
    //
    // CCT 0xf8faff — DERIVED, not dialled. Two independent lines converge:
    //  (a) DOSSIER. The Predator Pro Billiard Series arena luminaire's LED
    //      line was sampled directly in the two official frames that show
    //      it (05-broadcast-frames apex-9ft-arena-hero-1.jpg, 2023 World
    //      10-Ball Las Vegas; event-2026-pbs-stl-worldopen.webp, 2026 PBS
    //      STL). Mean colour over the near-clip luma band [200,246):
    //      hero (225,227,231) r/b 0.974 g/b 0.983; STL (239,239,239) r/b
    //      1.000 g/b 1.000. The hero reading is the less clipped of the
    //      two and therefore the more faithful hue, so 0xf8faff = (248,
    //      250,255) -> r/b 0.9725 g/b 0.9804 reproduces it to 0.002. The
    //      arena's grey carpet corroborates: (143,150,157) r/b 0.911.
    //      The frames' own venue wash (purple in STL, blue+yellow in LV)
    //      is why they are VALIDATION-tier for everything else — see the
    //      admissibility note below.
    //  (b) CLOSED LOOP on the render. Poking every RectAreaLight through a
    //      three-point key sweep moves the rim's r/b 1.221 (key 0xfff1da,
    //      r/b 1.1697) -> 1.083 (0xffffff) -> 1.028 (0xe8f0ff, r/b 0.9098),
    //      i.e. d(rim r/b)/d(key r/b) = 0.610. A neutral-to-slightly-cool
    //      key is exactly what lands the reference's 1.003 once the env
    //      cubemap follows the key — which a poke cannot do (it bypasses
    //      scheduleRebake) but a real fixture change does.
    //
    // FORM. Both official frames show the same family: >= 3 flat
    // parallelogram frames, each a black plate carrying a continuous
    // perimeter LED line, stacked at staggered heights and horizontal
    // offsets, spanning well beyond the table (the Predator wordmark is
    // printed on the top frame's plate). MEASUREMENT LIMIT, recorded: a
    // single wide-angle broadcast view with no in-frame scale at the lamp
    // plane does not permit a metric camera solve, so the frame COUNT,
    // limb width, stagger and true hang are NOT resolved. What is resolved
    // is the qualitative signature — multi-bar, filled and even across the
    // centre, wide, cool — and this entry reproduces that with a FOUR-BAR
    // reduction, disclosed as a reduction rather than a fit.
    //
    // SPAN 2.536 m — the repo's own coverage law, not a new number: the
    // snooker strip's 0.836 playfield-coverage fraction scaled to a 2.54 m
    // playfield (identical arithmetic to joy_lowrect, whose playfield is
    // also 2.54 m). CROSS-TABLE PLACEMENT by an explicit stated rule so it
    // is reproducible rather than tasteful: the four bars sit at the
    // centroids of four equal-width strips across the 1.27 m playfield,
    // z = +-1.27/8 and +-3*1.27/8. Bar depth 0.05 m matches the dossier's
    // ~1:60 limb-to-frame-length ratio at this span (0.042 m) rounded to a
    // plausible extrusion. Total emitter area 4 x 2.536 x 0.05 = 0.5072 m2
    // — identical to joy_lowrect's single strip, so `ratio` starts from
    // its solved 4.260 and is then closed on the #117 law (rendered
    // playfield-CENTER cloth luminance matched to the canopy at brightness
    // 1.0, measured on THIS table).
    //
    // HANG 1.15 m — PINNED by the renderer, disclosed as such. The real
    // arena rig hangs far higher, but hang is not metrically resolvable
    // from the dossier (above), and every shipped fixture sits in
    // 0.90-1.15 m because shared.uRoomMax.y (box-projection top), the
    // CEIL_Y rods, the lampfade clearance and camerapresets all key off
    // it. 1.15 is the established ceiling (snooker_luminaire, joy_lowrect).
    // Same precedent as carom_luminaire's owner-pinned 1.02.
    //
    // ADMISSIBILITY SPLIT (wave M): the broadcast frames are venue-lit
    // with heavy coloured LED wash and are photometrically INADMISSIBLE
    // for material or key colour — VALIDATION-tier only, the arena_gm2025
    // precedent. They supply FORM. The white-balanced studio close-up
    // (02-pocket-closeups/official-pocket-cushion-closeup.jpg, whose
    // neutral greys prove its balance) is the only photometric anchor and
    // is what the closed loop above is fitted against.
    // CLOSED-LOOP CORRECTION on the cct (wave M r1 -> r2; the joy_lowrect
    // precedent, where the dossier fit's first cut also ran off on the
    // landed tree and the loop put it back). Landing the r1 entry at the
    // raw dossier hue 0xf8faff and re-measuring gave, on the sidebore
    // register: rail r/b 1.538 -> 0.943, plug 1.654 -> 0.931, rim 1.221 ->
    // 0.872. The warm cast is gone but it OVERSHOT cool, because the
    // earlier poke-based key sweep held the env cubemap frozen at the warm
    // key (a poke bypasses scheduleRebake) and so measured only the direct
    // term's slope; a real fixture change rebakes the env, and both terms
    // move together. Fitting rendered r/b = gain * (linear key r/b)^power
    // through the two env-consistent points (canopy 0xfff1da, linear key
    // r/b 1.4263; r1 0xf8faff, 0.9387):
    //   rail  power 1.169 gain 1.0154 -> r/b 1.000 at linear key 0.9870
    //   plug  power 1.374 gain 1.0155 -> r/b 0.974 at linear key 0.9701
    //   rim   power 0.805 gain 0.9175 -> r/b 1.003 at linear key 1.1170
    // The two SETTLED materials (rail laminate, plug foam) agree to 1.7%;
    // the RIM demands a 14%-warmer key than either. No key colour lands
    // all three, so that gap is NOT rig-side — it is a hue error in the
    // rim's own BRDF, and it is handed to the L-C rim derivation rather
    // than hidden by detuning the key. The key is therefore solved on the
    // settled pair only: geometric mean linear r/b 0.9785 -> sRGB r 253.
    // The dossier's hue DIRECTION is preserved exactly (its white offset
    // was (-7,-5,0), i.e. dg = 5/7 dr) and only its MAGNITUDE is rescaled
    // by the loop, giving 0xfdfeff = (253,254,255). Predicted residuals
    // rail -1.2%, plug +1.4% — bracketing the target, which is the best a
    // single key can do.
    //
    // RATIO 4.643 — the #117 family law: this rig must deliver the SAME
    // playfield cloth exposure as the canopy at brightness 1.0, so lamp
    // choice never doubles as a brightness control. Measured on the
    // sidebore + full34 cloth boxes at the identical poses, the r1 rig ran
    // 130.75/135.44 and 131.81/137.85 encoded luma against the canopy —
    // 1.079x and 1.102x short in linear terms — so 4.260 x 1.09 = 4.643.
    // (The starting 4.260 is joy_lowrect's solved value, valid as a start
    // because the four bars' total emitter area 4 x 2.536 x 0.05 = 0.5072
    // m2 is identical to its single strip's, at the same 1.15 m hang.)
    // RECORDED CONSEQUENCE: #117 normalizes to the CANOPY, not to the
    // photograph. The studio reference's cloth sits at encoded luma 153.3
    // against its rail's 38.0, so this render stays ~13% dimmer than the
    // reference in absolute terms by design; the look-lines judge the
    // RATIOS (cloth/rail, band/rail, plug/rail), not the absolute level.
    emitters: [-3, -1, 1, 3].map((n) => (
      { x: 0, z: n * 1.27 / 8, y: 1.15, w: 2.536, d: 0.05 })),
    ratio: 4.643, cct: 0xfdfeff, faceMul: 10, clearanceY: 1.15,
  },
});

/** GH-386 venue-default fixture per table class — the room hangs the RIGHT
 * lamp over each table (owner order; the #385 audit Q3 measured the pool
 * canopy over the 12-ft snooker bed at corner/center 0.46 — honest physics
 * of the wrong rig). Footprint literals MIRROR gi.js BAKED_FOOTPRINT +
 * tools/render/lib/scene.mjs TABLES (duplicated-literal law — change them
 * together); matching is footprint-level at 1e-6, the #52 pocket-cut
 * doctrine. Unknown footprints keep the canopy (the generic venue rig +
 * the #52 honest pre-GI neutral). */
const CLASS_FIXTURES = Object.freeze([
  { length: 2.54, width: 1.27, fixture: 'canopy_panel' },
  { length: 3.569, width: 1.778, fixture: 'snooker_luminaire' },
  { length: 2.84, width: 1.42, fixture: 'carom_luminaire' },
  // GH-490 REBUILD R0 (ONE-TABLE LAW): the Chinese-8 class hangs its OWN
  // JOY-fit low-rect rig — owner decision ⑬'s low-rect CLASS stands, the
  // borrowed snooker NUMBERS retire (see the joy_lowrect entry's fit
  // record).  The r12/r13 keyTrim band-aid retires WITH the borrow: its
  // job (landing the macro-register key on the tpt photo) is now the
  // fixture's own solved ratio — a trim on top would double-apply the
  // correction.  snooker_12ft keeps snooker_luminaire byte-identically;
  // every explicit fixture pick keeps today's catalog numbers.
  { length: 2.54, width: 1.26, fixture: 'joy_lowrect' },
]);

/** CENTRE-MATCH GAINS (GH-975): the #117 law ("every fixture reads as bright
 * as the canopy at the playfield centre", the canopy-truth anchor) held only
 * on each fixture's own calibration table — the b20 lighting matrix measured
 * 83 of 180 (table x fixture x brightness) cells out of range: every lamp but
 * the luminaire over the 12-ft snooker bed at 0.17-0.32x its approved look,
 * the metal-rim / Chinese-8 venue rigs at 0.59x the canopy, the ring and
 * pendant drifted to 0.86-0.93x. One multiplier per (user table, fixture)
 * restores the law on every table: the canopy at 1.0 is the reference
 * everywhere except the 12-ft snooker table, whose reference is its approved
 * photo-fit default (the luminaire at the 489 one-table gain 2.647,
 * byte-held) — so every lamp over the snooker bed is lifted to that look; the
 * metal-rim and Chinese-8 venue rigs are raised to the canopy level. DATA
 * solved from rendered pixels by tools/render/lighting-match-solve.mjs
 * (--per-table: each table's factory cloth, default look, brightness 1.0,
 * player camera, playfield-centre median — a cloth's sheen answers each
 * lamp's geometry differently, so one row per class could not hold every
 * cloth) and re-checked by web/tools/e2e-lighting-matrix.mjs; never solved
 * at runtime. A cloth-colour override keeps the lamp-colour x cloth-colour
 * residual. Keyed by matchKey(); a fixture with no entry reads 1 (today's
 * catalog numbers). */
/** Any other table id takes the row of its footprint class's representative
 * table (a hidden/legacy id, a future table until it is solved). */
const MATCH_FOOTPRINTS = Object.freeze([
  { length: 2.54, width: 1.27, key: 'pool_pro_9ft' },
  { length: 3.569, width: 1.778, key: 'wpbsa_snooker_12ft' },
  { length: 2.84, width: 1.42, key: 'umb_carom_284' },
  { length: 2.54, width: 1.26, key: 'chinese8_pro_9ft' },
  { length: 2.286, width: 1.143, key: 'pool_pro_8ft' },
  { length: 2.032, width: 1.016, key: 'pool_pro_7ft' },
]);
/** The #789 legacy ids, the UI-demoted measured twin and the generic legacy
 * 9-ft render their twin's spec (or style) — they take the twin's row. */
const MATCH_TABLE_TWINS = Object.freeze({
  wpa_generic_9ft: 'wpa_spec_9ft',
  diamond_proam_9ft: 'pool_pro_9ft',
  pool_pro_9ft_measured: 'pool_pro_9ft',
  diamond_redlabel_9ft: 'pool_pro_9ft_older_gen',
  predator_apex_9ft: 'pool_pro_9ft_metal_rim',
  rasson_ox_9ft: 'pool_pro_9ft_k55',
  diamond_proam_8ft: 'pool_pro_8ft',
  diamond_proam_7ft: 'pool_pro_7ft',
  joy_q8_9ft: 'chinese8_pro_9ft',
});
export const MATCH_GAINS = Object.freeze({
  pool_pro_9ft: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.0966, pendant_bar: 0.9344, snooker_luminaire: 0.9974, carom_luminaire: 0.9814 }),
  pool_pro_9ft_older_gen: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.0973, pendant_bar: 0.8931, snooker_luminaire: 1.0188, carom_luminaire: 1.018 }),
  pool_pro_9ft_k55: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.0989, pendant_bar: 0.9365, snooker_luminaire: 0.9997, carom_luminaire: 0.9814 }),
  wpa_spec_9ft: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.0434, pendant_bar: 0.7673, snooker_luminaire: 0.9735, carom_luminaire: 0.9814 }),
  pool_pro_9ft_metal_rim: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.1828, pendant_bar: 0.9734, snooker_luminaire: 1.0546, carom_luminaire: 1.0245, pdt_studio: 1.9306 }),
  pool_pro_8ft: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.107, pendant_bar: 0.8508, snooker_luminaire: 0.9987, carom_luminaire: 1.001 }),
  pool_pro_7ft: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.1125, pendant_bar: 0.7738, snooker_luminaire: 0.9924, carom_luminaire: 0.982 }),
  chinese8_pro_9ft: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.0557, pendant_bar: 0.8147, snooker_luminaire: 0.9498, carom_luminaire: 0.9598, joy_lowrect: 1.7948 }),
  wpbsa_snooker_12ft: Object.freeze({ canopy_panel: 5.9076, perimeter_ring: 2.3288, pendant_bar: 2.2765, snooker_luminaire: 2.647, carom_luminaire: 3.4921 }),
  umb_carom_284: Object.freeze({ canopy_panel: 1, perimeter_ring: 1.159, pendant_bar: 1.0366, snooker_luminaire: 1.0459, carom_luminaire: 1.021 }),
});
/** The gain a committed GI bake already carries (the snooker bake mirror
 * renders the luminaire at 6.994 x 2.647, see snooker_luminaire above) —
 * the baked irradiance follows the match gain only for the remainder. */
const BAKED_MATCH_GAINS = Object.freeze({
  wpbsa_snooker_12ft: Object.freeze({ snooker_luminaire: 2.647 }),
});

/** VENUE FILL (venue-lighting lane; issue #638; ORDER-LIGHT-5 R2).
 * A venue's fill — the light a ball receives from everywhere but the key —
 * is DERIVED from the scene, not authored: at apply time the room is
 * rendered into a small cube map from the table's centre at ball height,
 * lit ONLY by the venue's real emitters (the rig's RectAreaLights over the
 * class-albedo room dressing + the GI the room already carries; emissive
 * faces, balls, cue, hemi/fill stand-ins and every other probe hidden), and
 * that cube map is projected onto SH-L2 (the three.js LightProbeGenerator
 * algorithm, ported below) → 27 coefficients in ONE rig-owned uniform
 * `obVenueSH[9]` (ORDER-LIGHT-6 Q1). There are no `up`/`down` constants any
 * more (seal-1..4 carried an authored hemisphere pair; withdrawn). The fill
 * is for the UNBAKED objects only — balls and cue, the objects that move
 * and are outside the GI bake: their materials add
 * shGetIrradianceAt(worldNormal, obVenueSH) to their indirect term
 * (hookVenueFill below; the normal is taken to world space with
 * inverseTransformDirection(n, viewMatrix), as three's own probe term
 * does). No THREE.LightProbe is used at all: a LightProbe
 * is scene-global in three (once one is visible every lit program compiles
 * `getLightProbeIrradiance`), and seal-5's room-side exclusion hook was a
 * NO-OP — it replaced a line that only exists after `#include` resolution
 * (the round-4 verifier's compiled-GLSL census caught it: all 11 room
 * programs still carried the probe, walls +64 % Y). While the term is on
 * the superseded table-owned `obPdtVenueAmbient` is HIDDEN (visible =
 * false → not collected → numLightProbes 0), so room, table and fixture
 * programs contain no probe call; the capture tool's programs census
 * proves it per material class. Determinism: fixed pose (0, R_ball, 0), fixed
 * resolution (64² per face, float), captured once per apply after the GI
 * settles; the 27 coefficients are published on `__lighting.state().venue.sh`
 * and PINNED in the gate spec (a red arm: `?venue=off` has no derived probe).
 * The superseded table-owned `obPdtVenueAmbient` (9.91, a uniform upper
 * hemisphere = 4.4× the key) is hidden and driven to 0 while the derived fill
 * is on and restored byte-exact when off. `?venue=off|0` = the pre-lane rig AND the
 * legacy room dressing (room.js reads the same key) — main-identical;
 * `?venue=all` also enables HELD table terms. The canopy identity default
 * carries no term (issue #89 law 2). Keyed by TABLE ID first, then by the
 * venue-default FIXTURE id. */
export const VENUE_TERMS = Object.freeze({
  byTable: Object.freeze({
    // Predator Apex (issue #638; ORDER-LAND-638-FIX2 B1): the DERIVED room-only probe under EVERY fixture hung over
    // this table — the capture is generic (the room lit by the active fixture's emitters) and the authored 9.91
    // table-owned probe was a number for the old 0.012 dressing: it may never coexist with the class dressing, so it
    // exists only on `?venue=off`. Pinned per fixture (lighting-probe-pin.json `predator_apex_9ft@<fixture>`).
    predator_apex_9ft: { derived: true, supersedes: 'obPdtVenueAmbient' },
    pool_pro_9ft_metal_rim: { derived: true, supersedes: 'obPdtVenueAmbient' },
    // Diamond Pro-Am under the canopy identity rig — HELD (enabled: false):
    // the app-default table with sealed D621 cards in flight; the derived
    // probe would apply to it the same way (`?venue=all` renders it).
    diamond_proam_9ft: { derived: true, enabled: false },
    pool_pro_9ft: { derived: true, enabled: false },
    diamond_redlabel_9ft: { derived: true, enabled: false },
    pool_pro_9ft_older_gen: { derived: true, enabled: false },
    pool_pro_9ft_measured: { derived: true, enabled: false },
  }),
  byFixture: Object.freeze({
    // Predator Apex (issue #638): derived fill; supersedes the table-owned probe.
    pdt_studio: { derived: true, supersedes: 'obPdtVenueAmbient' },
    // JOY (chinese8) / Star (snooker): no term — the measured verdicts of
    // SPIKE-REPORT-LIGHTING.md §L2 stand (slot walls in band; the Star bed
    // strip is key geometry + cloth albedo, not fill).
    joy_lowrect: null,
    snooker_luminaire: null,
  }),
});

/** ORDER-LAND-638-FIX2 B1(b): the class dressing needs the venue term that replaces the table-owned probe — a room
 * dressed at class albedo under the authored 9.91 probe over-lights ×10. main.js (the only module holding both the
 * room and this leaf) reads this marker when the leaf lands and degrades the room to the legacy dressing when it is
 * absent (a cached older lightingvisuals.js) or the import rejects. room.js never imports this leaf (no boot-graph
 * edge; the leaf imports room.js). */
export const VENUE_ROOM_CAPABLE = true;

/** ORDER-LIGHT-FIX6 (review r10 P2): the ONE handshake value every participating venue leaf exports (gi.js, shading.js, room.js,
 * look.js, occlusionlut.js, venueflag.js, app/ballset.js and this leaf). main.js enables the venue path only when every loaded
 * participant reports exactly this integer, and passes it back here as `protocol`; this leaf additionally requires it of the two
 * leaves it reaches statically (room.js, shading.js). VENUE_ROOM_CAPABLE stays exported for the READY-LAND-7 main.js, which
 * reads nothing else; the protocol supersedes it. */
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)

/** The venue term for (tableId, fixture) or null. */
export function venueTermFor(tableId, fixture, { includeHeld = false } = {}) {
  const t = (tableId && VENUE_TERMS.byTable[tableId]) || VENUE_TERMS.byFixture[fixture] || null;
  if (!t || !t.derived) return null;
  if (t.enabled === false && !includeHeld) return null;
  return t;
}

/** Project a float cube render target onto SH-L2 radiance coefficients —
 * the three.js LightProbeGenerator.fromCubeRenderTarget algorithm (not
 * vendored here), in three's real-SH basis and convention (LightProbe.sh
 * holds RADIANCE coefficients; shGetIrradianceAt applies the cosine-lobe
 * constants). Returns 27 numbers [r,g,b × 9] and the per-axis irradiance
 * E(±x, ±y, ±z) in three's `irradiance` units for the census. */
/** ORDER-LAND-638-FIX3 (review r7 P2 #4): the venue probe renders to a FloatType cube target and reads it back as float.
 * WebGL2 makes float colour attachments renderable only with EXT_color_buffer_float (WebGL1: OES_texture_float +
 * WEBGL_color_buffer_float). Without it the capture would hit an incomplete framebuffer / a garbage readback while the
 * table-owned probe is suppressed — so the capability is checked at init and the term is NOT derivable without it.
 * `?venueFloat=0` forces the negative (the red arm). */
export function floatRenderTargetSupported(renderer, q = null) {
  try {
    // C2-FIX4 class D: the `0` seam is an ARM — honoured on a scripted boot only (`?cinema` / `?obtool` / the sessionStorage pin)
    if (q && q.get('venueFloat') === '0' && (() => { try { const on = (k) => q.has(k) && q.get(k) !== '0'; return on('cinema') || on('obtool') || sessionStorage.getItem('ob-scripted') === '1'; } catch { return false; } })()) return false;
    if (!renderer || !renderer.extensions) return false;
    const ext = renderer.extensions;
    if (renderer.capabilities && renderer.capabilities.isWebGL2) return !!ext.has('EXT_color_buffer_float');
    return !!(ext.has('OES_texture_float') && ext.has('WEBGL_color_buffer_float'));
  } catch { return false; }
}

export function shFromCubeTarget(renderer, rt, opts = {}) {
  const size = rt.width;
  const data = new Float32Array(size * size * 4);
  // ORDER-LIGHT-FIX5 P2#2 (review r9): three's readRenderTargetPixels LOGS and RETURNS on an incomplete framebuffer or a
  // type/format mismatch — it never throws — so a reused buffer would be accepted as a probe (all zero = a black fill).
  // Every face read starts from a sentinel no render can produce (negative radiance) and is validated after it: any texel
  // still sentinel = the read wrote nothing; all six faces zero = no radiance reached the attachment (one black face is
  // legitimate: the −y face sees only the black-occluder table). Either = a thrown, named reason — the caller's
  // runtime-failure path (not derivable, degrade). `?venueReadCheck=off` = the pre-FIX5 rule (the arm).
  const check = opts.check !== false; const SENTINEL = Math.fround(-1e30); // float32-exact: the buffer stores float32, `===` must hold
  let anyRadiance = false;
  const coord = new THREE.Vector3(), dir = new THREE.Vector3();
  const basis = new Array(9).fill(0);
  const sh = new THREE.SphericalHarmonics3();
  const c = sh.coefficients;
  let totalWeight = 0;
  const pixelSize = 2 / size;
  for (let face = 0; face < 6; face++) {
    if (check) data.fill(SENTINEL);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, data, face);
    if (check) {
      let untouched = 0;
      for (let i = 0; i < data.length; i++) { if (data[i] === SENTINEL) untouched++; else if ((i & 3) !== 3 && data[i] !== 0) anyRadiance = true; }
      if (untouched > 0) throw new Error('readback validation: cube face ' + face + ' has ' + untouched + '/' + data.length
        + ' texels untouched — readRenderTargetPixels returned without writing (three logs an incomplete framebuffer or a type/format mismatch; it does not throw)');
    }
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], bch = data[i + 2];
      if (!Number.isFinite(r + g + bch)) continue;
      const px = i / 4;
      const col = -1 + ((px % size) + 0.5) * pixelSize;
      const row = 1 - (Math.floor(px / size) + 0.5) * pixelSize;
      switch (face) {
        case 0: coord.set(1, row, -col); break;
        case 1: coord.set(-1, row, col); break;
        case 2: coord.set(col, 1, -row); break;
        case 3: coord.set(col, -1, row); break;
        case 4: coord.set(col, row, 1); break;
        default: coord.set(-col, row, -1); break;
      }
      const lengthSq = coord.lengthSq();
      const weight = 4 / (Math.sqrt(lengthSq) * lengthSq);
      totalWeight += weight;
      dir.copy(coord).normalize();
      THREE.SphericalHarmonics3.getBasisAt(dir, basis);
      for (let j = 0; j < 9; j++) {
        c[j].x += basis[j] * r * weight;
        c[j].y += basis[j] * g * weight;
        c[j].z += basis[j] * bch * weight;
      }
    }
  }
  if (check && !anyRadiance) throw new Error('readback validation: all six cube faces read back zero radiance — no emitter reached the float attachment');
  const norm = (4 * Math.PI) / totalWeight;
  for (let j = 0; j < 9; j++) c[j].multiplyScalar(norm);
  const E = {};
  const n = new THREE.Vector3(), e = new THREE.Vector3();
  for (const [k, v] of Object.entries({ px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] })) {
    sh.getIrradianceAt(n.set(...v), e);
    E[k] = Number((0.2126 * e.x + 0.7152 * e.y + 0.0722 * e.z).toFixed(5));
  }
  return { sh, coeffs: c.flatMap((v) => [v.x, v.y, v.z]).map((x) => Number(x.toFixed(6))), E };
}

/** GH-488P wave M: venue defaults routed by TABLE ID, consulted BEFORE the
 * footprint loop. Footprint matching is the #52 pocket-cut doctrine and it
 * works only while a footprint identifies a class — the Predator Apex 9 ft
 * ships kernel 2.54x1.27, byte-identical to the generic pool class, so no
 * CLASS_FIXTURES row can distinguish it and EDITING the 2.54x1.27 row would
 * re-hang every generic 9-ft pool table (forbidden: those rigs are gated).
 * A table-id key is the only additive resolution. Strictly additive: a table
 * absent from this map falls through to the unchanged footprint loop, so
 * every table that exists today keeps its fixture byte-for-byte. */
export const TABLE_FIXTURES = Object.freeze({
  predator_apex_9ft: 'pdt_studio',
  pool_pro_9ft_metal_rim: 'pdt_studio',
});

/** The ACTIVE table class's venue-default fixture id. Feature-detected
 * table.js read (namespace import + optional chaining): a stale table.js
 * reports the canopy — the pre-386 rig. */
/** GH-490: the ACTIVE table's class key for the env-bake staleness
 * tracking (state.klass) — footprint-level like the fixture matching;
 * null when the table module is stale/unbuilt. */
function currentKlass() {
  const id = tableMod.activeTableId?.();
  // GH-488P wave M: an id-routed table's key must be the ID, not its
  // footprint — the Predator shares the generic pool footprint, so a
  // footprint key would report "no class change" across a generic-pool ->
  // Predator switch and suppress the env rebake the new rig needs.
  if (id && TABLE_FIXTURES[id]) return id;
  const k = tableMod.specFor?.(id)?.kernel;
  return k ? `${k.length}x${k.width}` : null;
}

/** Mixed-cache handshake for the ONE-TABLE gain (close-out review r1 P1;
 * the ownership ledger rule 5). The 2.647x photo-fit gain is calibrated against
 * the GH-489 XW101 table MATERIALS — a returning browser can pair this
 * fresh module with a cached pre-489 table.js (which also answers
 * specFor/activeTableId, so classDefaultFixture alone cannot tell), and
 * the gain would re-expose the OLD bright materials. table.js's own 489
 * surface (`pocketVisualFalls`, the Amendment-026 export, namespace-read
 * per the cache-poison contract) is the capability marker: absent means
 * legacy calibration, gain 1. The REVERSE pairing (fresh table + stale
 * lighting: the dark calibration renders at 1x until revalidation) is a
 * RECORDED RESIDUAL of the same transient class as game.js Amendment
 * 026b — the stale module cannot be reached from here; it self-heals on
 * cache revalidation. */
function tableCal489() {
  return typeof tableMod.pocketVisualFalls === 'function';
}

/** GH-975 RIG SCALING: the pendant spreads its shades along the active bed —
 * three over a bed up to 3 m long, four over the 12-ft snooker bed — evenly
 * at length / n (a real three-shade bar spans the table; the 9-ft catalog's
 * three shades at 0.55 m left every table's corners at 0.24-0.32 of the
 * centre in the b20 matrix). A stale/absent table module keeps the catalog. */
function pendantEmitters() {
  const len = tableMod.specFor?.(tableMod.activeTableId?.())?.kernel?.length;
  if (!Number.isFinite(len)) return FIXTURES.pendant_bar.emitters;
  const n = len > 3 ? 4 : 3;
  const step = len / n;
  // the shade aperture is the catalog's ~15 in (0.33 m square-equivalent of
  // the 0.37 m face) — the 0.26 m literal lit the same flux through 1.6x the
  // radiance and clipped the cue ball (24 % of its disc at b 1.0 on main)
  return Array.from({ length: n }, (_, i) =>
    ({ x: (i - (n - 1) / 2) * step, z: 0, y: 0.90, w: 0.33, d: 0.33 }));
}

/** The fixture as hung over the ACTIVE table: the catalog entry, with the
 * emitters of a table-scaled rig (scalesWithTable) re-derived. */
function rigFor(id) {
  const f = FIXTURES[id] ?? FIXTURES.canopy_panel;
  if (!f.scalesWithTable) return f;
  return { ...f, emitters: pendantEmitters() };
}

/** GH-975: the ACTIVE table's centre-match key (MATCH_GAINS); null when the
 * table module is stale/unbuilt or the footprint has no class. */
export function matchKey() {
  const id = tableMod.activeTableId?.();
  // the table's own row (solved on its factory cloth: the cloth's sheen
  // answers each lamp's geometry differently, so one row per class cannot hold
  // every cloth), else its footprint class's representative table's row
  const own = MATCH_TABLE_TWINS[id] ?? id;
  if (own && MATCH_GAINS[own]) return own;
  const k = tableMod.specFor?.(id)?.kernel;
  if (!k) return null;
  for (const c of MATCH_FOOTPRINTS) {
    if (Math.abs(k.length - c.length) < 1e-6
      && Math.abs(k.width - c.width) < 1e-6) return c.key;
  }
  return null;
}

/** GH-975: the centre-match gain for `fixture` over the ACTIVE table. The
 * snooker row is the 489 photo-fit level, calibrated against the 489 table
 * materials — under a pre-489 table.js (tableCal489 false) it reads 1, the
 * legacy calibration (the one-table handshake below, unchanged). */
const PHOTO_FIT_KEYS = Object.freeze(['wpbsa_snooker_12ft']);
function matchGain(fixture) {
  const key = matchKey();
  if (PHOTO_FIT_KEYS.includes(key) && !tableCal489()) return 1;
  return MATCH_GAINS[key]?.[fixture] ?? 1;
}

/** The share of matchGain() a committed GI bake already carries. */
function bakedMatchGain(fixture) {
  const key = matchKey();
  if (PHOTO_FIT_KEYS.includes(key) && !tableCal489()) return 1;
  return BAKED_MATCH_GAINS[key]?.[fixture] ?? 1;
}

/** GH-975: the photo-fit ONE-TABLE gain of the active table (2.647 over the
 * 12-ft snooker bed under the 489 calibration, else 1) — the settings lux
 * readout drops the 520-lux WPA claim wherever it is not 1, whatever lamp
 * hangs (every lamp there is matched to the photo-fit look). */
function oneTableGain() {
  return (PHOTO_FIT_KEYS.includes(matchKey()) && tableCal489())
    ? MATCH_GAINS.wpbsa_snooker_12ft.snooker_luminaire : 1;
}

export function classDefaultFixture() {
  const id = tableMod.activeTableId?.();
  if (id && TABLE_FIXTURES[id]) return TABLE_FIXTURES[id];
  const k = tableMod.specFor?.(id)?.kernel;
  if (!k) return 'canopy_panel';
  for (const c of CLASS_FIXTURES) {
    if (Math.abs(k.length - c.length) < 1e-6
      && Math.abs(k.width - c.width) < 1e-6) return c.fixture;
  }
  return 'canopy_panel';
}

/** Look bases the fixture layer scales from (issue #89 compose order).
 * MIRROR of scene/room.js build literals (default) and scene/look.js tournament
 * constants — change them together (cross-referenced comments there). */
const LOOK_BASES = Object.freeze({
  default: {
    lamp: { color: 0xfff1da, intensity: 7.6 },
    fill: 2.2,
    face: [10, 9, 7.1],
  },
  tournament: {
    lamp: { color: 0xf6f7f9, intensity: 7.8 },
    fill: 2.2,
    // look.js lampFaceRGB() — the tournament neutral-key inverse-tube-tint trim
    face: [19.4 * 1.015, 19.4 / 0.9301, 19.4 / 0.7605 * 0.985],
  },
});

export function clampBrightness(b) {
  const n = Number(b);
  if (!Number.isFinite(n)) return 1;
  return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, n));
}

/** Absolute rig numbers for (fixture, brightness) under a look base — the
 * e2e identity surface: lightingProfile('canopy_panel', 1.0) must equal
 * today's room.js literals exactly (issue #89 law 2). */
export function lightingProfile(fixture, brightness, look = 'default') {
  const f = rigFor(fixture);
  const base = LOOK_BASES[look] ?? LOOK_BASES.default;
  const b = clampBrightness(brightness);
  const id = FIXTURES[fixture] ? fixture : 'canopy_panel';
  // GH-975 centre-match gain for (active table class, fixture) — the 489
  // one-table gain is its snooker row (byte-held for the luminaire); stale
  // or absent table info reads 1, today's catalog numbers.
  const gain = matchGain(id);
  return {
    fixture: id,
    brightness: b,
    emitters: f.emitters.map((e) => ({
      ...e,
      color: f.cct ?? base.lamp.color,
      intensity: base.lamp.intensity * f.ratio * gain * b,
    })),
    hemi: 0.22, // room.js build value — look/gi-owned at runtime (see header)
    fill: base.fill * b,
    face: (f.faceMul === null ? base.face : hexRGB(f.cct, f.faceMul))
      .map((c) => c * b),
    clearanceY: f.clearanceY,
  };
}

function hexRGB(hex, mul) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
    .map((c) => c * mul);
}

// ---- fixture mesh builders -------------------------------------------------
// Visible geometry per type (issue #89: "each fixture type ships its visible
// geometry"). Emissive faces are MeshBasicMaterial in the room.js lamp-face
// register (HDR color, feeds the env cubemap → ball-crown reflections).
const rodMatOf = () => new THREE.MeshStandardMaterial(
  { color: 0x2a2a2a, roughness: 0.4, metalness: 0.7 });

function addRods(group, xs, topY, fromY) {
  const mat = rodMatOf();
  for (const [rx, rz] of xs) {
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, topY - fromY, 10), mat);
    rod.position.set(rx, (topY + fromY) / 2, rz);
    group.add(rod);
  }
}

function buildRingMeshes(f) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial(
    { color: 0x1c201c, roughness: 0.5, metalness: 0.35 });
  const faces = [];
  for (const e of f.emitters) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(e.w, e.d),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    face.rotation.x = Math.PI / 2; // face down
    face.position.set(e.x, e.y, e.z);
    faces.push(face);
    group.add(face);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(e.w + 0.02, 0.035, e.d + 0.02), frameMat);
    frame.position.set(e.x, e.y + 0.022, e.z);
    group.add(frame);
  }
  const cx = f.emitters[2].x, cz = f.emitters[0].z;
  addRods(group, [[-cx, -cz], [-cx, cz], [cx, -cz], [cx, cz]],
    CEIL_Y, f.emitters[0].y + 0.04);
  return { group, faces };
}

function buildPendantMeshes(f) {
  const group = new THREE.Group();
  const barY = 1.18;
  const barMat = new THREE.MeshStandardMaterial(
    { color: 0x241a10, roughness: 0.55, metalness: 0.2 });
  // GH-975: the bar and its suspension follow the table-scaled shade span
  const span = f.emitters[f.emitters.length - 1].x - f.emitters[0].x;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(span + 0.35, 0.035, 0.05), barMat);
  bar.position.set(0, barY, 0);
  group.add(bar);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0x14351f, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
  const faces = [];
  for (const e of f.emitters) {
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.19, 0.20, 24, 1, true), shadeMat);
    shade.position.set(e.x, e.y + 0.10, e.z);
    group.add(shade);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, barY - (e.y + 0.20), 8), barMat);
    stem.position.set(e.x, (barY + e.y + 0.20) / 2, e.z);
    group.add(stem);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.185, 24), // GH-975: the 15 in aperture the emitter now matches
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    face.rotation.x = Math.PI / 2;
    face.position.set(e.x, e.y + 0.005, e.z);
    faces.push(face);
    group.add(face);
  }
  addRods(group, [[-(span / 2 + 0.05), 0], [span / 2 + 0.05, 0]], CEIL_Y, barY + 0.02);
  return { group, faces };
}

function buildLuminaireMeshes(f) {
  const group = new THREE.Group();
  const e = f.emitters[0];
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(e.w + 0.07, 0.09, e.d + 0.08),
    new THREE.MeshStandardMaterial(
      { color: 0xe8e6e0, roughness: 0.6, metalness: 0.1 }));
  housing.position.set(e.x, e.y + 0.048, e.z);
  group.add(housing);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(e.w, e.d),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  face.rotation.x = Math.PI / 2;
  face.position.set(e.x, e.y, e.z);
  group.add(face);
  addRods(group, [[-1.2, 0], [1.2, 0]], CEIL_Y, e.y + 0.09);
  return { group, faces: [face] };
}

/** GH-488P wave M: the Predator arena rig's visible geometry — one black
 * plate per bar carrying its LED line on the underside, which is the
 * dossier's own construction (a flat frame plate + a continuous perimeter
 * LED). The four-bar reduction of the real >= 3 staggered frames is
 * recorded in the FIXTURES entry; the plate is deliberately DARK (the
 * dossier frames read near-black off-LED) rather than the pale housing the
 * long-box builder ships, so it does not become a second soft source in
 * the env cubemap. Fully emitter-driven like the other builders. */
function buildBarArrayMeshes(f) {
  const group = new THREE.Group();
  const faces = [];
  const plateMat = new THREE.MeshStandardMaterial(
    { color: 0x14141a, roughness: 0.55, metalness: 0.25 });
  const rods = [];
  for (const e of f.emitters) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(e.w + 0.10, 0.035, e.d + 0.10), plateMat);
    plate.position.set(e.x, e.y + 0.0225, e.z);
    group.add(plate);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(e.w, e.d),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    face.rotation.x = Math.PI / 2; // face down
    face.position.set(e.x, e.y, e.z);
    faces.push(face);
    group.add(face);
    rods.push([e.x - e.w / 2 + 0.12, e.z], [e.x + e.w / 2 - 0.12, e.z]);
  }
  addRods(group, rods, CEIL_Y, f.emitters[0].y + 0.04);
  return { group, faces };
}

const MESH_BUILDERS = {
  perimeter_ring: buildRingMeshes,
  pendant_bar: buildPendantMeshes,
  snooker_luminaire: buildLuminaireMeshes,
  // GH-386: the carom rig is the same long-box luminaire family (housing +
  // diffuser face + two ceiling rods) at its own footprint — the builder is
  // fully emitter-driven, so it is shared, not forked.
  carom_luminaire: buildLuminaireMeshes,
  // GH-490 REBUILD R0: the JOY-fit chinese8 venue rig shares the same
  // emitter-driven long-box builder at its own footprint.
  joy_lowrect: buildLuminaireMeshes,
  // GH-488P wave M: the Predator arena rig is a multi-BAR array, not a
  // single long box — it gets its own emitter-driven builder.
  pdt_studio: buildBarArrayMeshes,
};

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.dispose?.();
      }
    }
  });
}

/** Flag every spike-injected material for recompile (the emitter count is a
 * compile-time axis — shading.js customProgramCacheKey carries it). */
function recompileSpike(scene) {
  scene.traverse((o) => {
    const mats = o.material
      ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      try {
        if (typeof m.customProgramCacheKey === 'function'
          && String(m.customProgramCacheKey()).startsWith('spike')) {
          m.needsUpdate = true;
        }
      } catch { /* default material key — not ours */ }
    }
  });
}

/** Create the lighting runtime. Wired by main.js (guarded dynamic import):
 * `{ scene, shared, gi, rebakeEnv, fixture, brightness, look, auto }`.
 * `fixture` is the RESOLVED boot id (main.js resolves the venue default
 * before gi.load so the boot lightmaps key to the true rig — GH-386);
 * `auto` marks it as the venue default rather than an explicit choice, so
 * a live table switch re-resolves it (tableChanged below). Publishes the
 * ONE window seam `window.__lighting` (the __drills/__playground precedent)
 * consumed by settings.js (feature-detected set() side effect), look.js
 * (regrade), camerapresets.js (top-preset clearance), scene/lampfade.js
 * (fixtureMeshes + clearanceY) and scene/table.js (tableChanged). */
export function createLighting({
  scene, shared, gi, rebakeEnv, fixture, brightness, look, auto, renderer,
  onDegrade, // ORDER-LAND-638-FIX4 (review r8 P2 #1): main.js's ONE degradeVenue — the runtime capture failure takes the same path as the init-time capability check
  protocol, // ORDER-LIGHT-FIX6: the owner's handshake value (VENUE_PROTOCOL) — absent or different = the legacy rig (a cached older main.js passes none)
  budgetMs, // ORDER-LIGHT-COMPANION: the lane's ONE budget (main.js VENUE_GI_WINDOW_MS) — the GI settle window and the GI-hold bound read it; no literal here
} = {}) {
  const state = {
    fixture: 'canopy_panel',
    brightness: 1,
    look: (look === 'tournament' || look === 'sp') ? 'tournament' : 'default', // 'sp': the legacy look id (GH-973)
    touched: false, // stays false while the identity default has never moved
    // GH-490 (review r4): the last table class seen by tableChanged — the
    // snooker and chinese8 classes SHARE the low-rect venue default, so a
    // class switch can keep the fixture id while the env cubemap and
    // uTableHalf still mirror the old table; tracking the class lets the
    // same-fixture path re-bake. null until the first auto table switch.
    klass: null,
    // GH-386 venue-default mode: the fixture follows the table class until
    // the player explicitly picks one. A stale main.js (pre-386) never
    // passes `auto`, so the pre-386 explicit behavior holds (cache-poison
    // contract — degrade, never surprise).
    auto: auto === true,
  };
  let fixtureGroup = null; // active non-canopy mesh group
  let fixtureLights = []; // active non-canopy RectAreaLights
  let fixtureFaces = []; // active emissive face meshes
  let appliedFixture = 'canopy_panel'; // GH-1202: the fixture whose lights hang now (state.fixture is the target)
  // GH-1202 (main.js's window.__obStage, seam contract v1.1): a light-set change re-keys every lit program. It covers RectAreaLights
  // in or out, the canopy's visibility, the emitter topology, the superseded probe's visibility and the venue fill hook. When main
  // offers the seam, such a change goes through it as an exact, synchronous, idempotent apply / revert pair: main compiles the next
  // state ahead while frames keep the current one, then applies once the programs linked. Without the seam (an older main.js, or
  // another seam version) every change applies at once, in today's order, and its follow-up runs in the same call.
  const stageSeam = () => {
    const s = window.__obStage;
    return s && s.version === 1 && typeof s.lightSet === 'function' ? s : null;
  };
  let stagesPending = 0; // changes handed to the seam whose follow-up has not run (readiness reads it: state().venue.pending)
  let lastLandAt = -Infinity; // when a follow-up last ran with none of the leaf's changes still staged (the re-bake waits a debounce after)
  // census: what main answered for each change, and when this leaf's env re-bakes fired with how many of its changes still staged
  // (the last 16 of each)
  const staging = { changes: 0, results: [], bakes: [], deferred: 0 }; // deferred: how often a change parked in a studio window (below)
  // a change its caller needs at once skips the seam: setVenue (main.js's degradeVenue bakes the env cube right after it) and a
  // rebuild (its rig and venue term land in the rebuild's own task, as before). Each such change bumps its kind's epoch, and a
  // staged change of that kind made before it goes stale: it lands as nothing (an exact no-op pair) or, if it had already
  // landed, keeps only its clean-up — so a change applied at once is never undone by an older one still waiting in main's queue
  let atOnce = 0;
  const epoch = { rig: 0, venue: 0 };
  const pendingStages = new Set(); // { kind, e } of each change handed over whose follow-up has not run
  const livePending = (kind = null) => { for (const p of pendingStages) if (p.e === epoch[p.kind] && (!kind || p.kind === kind)) return true; return false; };
  // GH-1202 (the batch-2 review finding at lightingvisuals.js:2192-2194, maintainer record dbed84ae): no staged change, and none of
  // its follow-up, lands inside the studio window (rigWindowOpen() below). cinelight's export rig snapshots the lamps hanging at its
  // install, normalizes them and restores that snapshot at revert, so a swap landing in the window bypassed the normalization, and
  // the revert then put the old fill back beside the new lamps. Inside the window main's apply of a change does nothing, and once
  // one apply of a hand was refused there (its compile pass or its real apply), the rest of that hand stays inert too: main compiled
  // the studio draw set, so an apply after the close would link the new rig's programs inside the next frame (the T3 review). A live
  // change whose follow-up comes due inside the window PARKS, still pending (readiness reads it). cinelight's revert announces the
  // close before its synchronous restore, so the close runs what parked in a microtask (gi.js's resume does the same;
  // renderTimeline's finally runs no await after the revert), in park order. A follow-up that finds its hand refused sends the
  // change back to the seam for a compile pass outside the window, unless a change of its kind was handed over after it (going
  // back behind that one, it would land over it): then it lands as stale. A change that hung before the window (cinelight
  // normalized it with the rig) runs its follow-up. Two other deferred landings park the same way, reading the window when they run
  // (the P-A / P-B class audit): the scene.add wrapper's fill hook (cinelight's own rims come through it just before the window
  // opens) and a table change's venue reapply. With the window closed nothing here runs.
  let stageN = 0; // the order changes are handed to the seam in, and per kind the newest one handed
  const handedN = { rig: 0, venue: 0 };
  const parked = []; // each landing parked in a studio window (a staged change's follow-up, the fill hook, a venue reapply), in park order
  const landParked = () => { for (const f of parked.splice(0)) f(); };
  /** Hand `change` (kind 'rig' | 'venue') to the seam. `then(fresh, late)` runs once after its real apply; fresh = it hangs and is
   * still the newest change of its kind (a change applied at once since then makes it stale); late = it runs after the call that
   * handed the change over (main staged it), not inside it ('immediate'). Neither lands inside a studio window (above). */
  function stageLightSet(seam, kind, change, then, why) {
    const entry = { kind, e: epoch[kind], n: ++stageN };
    handedN[kind] = entry.n;
    const live = () => entry.e === epoch[kind];
    let skipped = false; // this hand's compile pass (or apply) fell inside the window: nothing applies until the next hand
    const guarded = { apply: () => { if (!live()) return; if (rigWindowOpen()) { skipped = true; return; } if (!skipped) change.apply(); }, revert: change.revert };
    stagesPending++;
    pendingStages.add(entry);
    let followed = false;
    const follow = (late) => {
      if (followed) return;
      if (live() && rigWindowOpen()) { staging.deferred++; parked.push(() => follow(true)); return; } // until the close
      if (live() && skipped) {
        // the window refused this hand: back to the seam for a compile pass outside it, unless a newer change of its kind was handed
        if (entry.n < handedN[kind]) entry.e = -1; else { staging.deferred++; hand(); return; }
      }
      followed = true;
      stagesPending--;
      pendingStages.delete(entry);
      // apply() is a no-op once main applied it (it is idempotent) or once the change went stale, so a live change lands even
      // if main never ran it
      try { guarded.apply(); then(change.applied() && live(), late); } catch (e) { console.error('[lighting] a staged light-set change or its follow-up threw', e); }
      if (stagesPending === 0) lastLandAt = performance.now();
    };
    // the seam call, and main's answer, which runs the follow-up (both again when the window refused a hand: follow)
    const call = () => { skipped = false; try { return Promise.resolve(seam.lightSet({ apply: guarded.apply, revert: guarded.revert, why })); } catch (e) { return Promise.reject(e); } };
    const answer = (p) => p.then((how) => how, () => 'rejected').then((how) => {
      staging.changes++; staging.results.push(why + ' ' + how); if (staging.results.length > 16) staging.results.shift();
      follow(true);
    });
    const hand = () => answer(call());
    const p = call();
    // main applied it at once ('immediate': the overlay is up, a scripted boot, no parallel compile). Like a change applied at once
    // here, it overtakes every older staged change of its kind: the kind's epoch moves on and this change takes the new epoch, so a
    // stage still in flight lands as nothing. Its follow-up keeps today's synchronous order. A staged change applies in main's
    // stage (a later task, or a microtask of the stage's own task when its programs had already linked) and resolves there, so the
    // follow-up still runs before the next frame
    if (change.applied()) { epoch[kind]++; entry.e = epoch[kind]; follow(false); }
    answer(p);
  }
  let rebakeTimer = 0;
  // ORDER-LIGHT-C2-FIX8 H3 (the loop-available clock): the convergence loop polls every VENUE_POLL_MS; a main-thread stall longer than one poll is time in
  // which the loop could not even run (the pendant fixture's post-boot light join recompiles 29 programs synchronously: 8–13 s on a cold shader cache,
  // 0.6 s warm — measured 2026-09-13), so the settle budget counts elapsed − stall, where stall = Σ (rAF gap − VENUE_POLL_MS) over gaps longer than a poll
  const VENUE_POLL_MS = 50;

  const room = () => roomMod.activeRoom?.instance ?? null;

  // ORDER-LIGHT-C1 (review r1 P2 (b), lightingvisuals.js:1681): READINESS INCLUDES EVERY QUEUED MUTATION — the debounced env re-bake is the
  // one queue this leaf owns; it is armed here (rebakePending), fired by fireRebake (the timer, flushRebake or the arm's release) or cancelled
  // (cancelRebake: the degrade converges the cube itself, so its queued bake would be a redundant (N+1)th bake AFTER readiness). state().venue
  // .pending reads true while it is queued. Seams (diagnostic, never set by the app): `?venueDebounce=hold` arms the queue with NO timer
  // (released only by flushRebake), `?venueDebounce=hold:<ms>` = the debounce with <ms> instead of 120; `?venueReadiness=legacy` = the pre-C1
  // readiness (pending ignores the queue — the arm).
  // ORDER-LIGHT-C2-FIX1 class A (review r3 P2, lightingvisuals.js:1353): the venue CAPTURE and the env RE-BAKE never run inside the studio
  // window (web/app/cinelight.js: window.__cinelight === true from its announce until revert()'s first act). Both would photograph the
  // studio world — the capture into venue.sh, the re-bake into the SHARED gameplay cubemap — and cinelight's revert restores texture
  // REFERENCES, not contents: the gameplay lighting stayed contaminated after an export. Inside the window a scheduled / fired / flushed
  // re-bake is DEFERRED (rebakePending stays true, so readiness still reads pending) and the capture attempt PARKS; the ob:cinelight close
  // re-schedules the deferred bake (the debounce timer lands after cinelight's synchronous restore) and the parked attempt resumes through
  // its own rigQuiet wait. The same window the GI weight follows (gi.js applyRig).
  const rigWindowOpen = () => { try { return typeof window !== 'undefined' && window.__cinelight === true; } catch { return false; } };
  const fireRebake = () => { if (rigWindowOpen()) { rebakeTimer = 0; venue.heldRebake = false; venue.rebakePending = true; venue.rebakeDeferred = true; venue.rigWindowDeferrals = (venue.rigWindowDeferrals || 0) + 1; return; } rebakeTimer = 0; venue.heldRebake = false; venue.rebakePending = false; venue.lastRigWrite = performance.now();
    staging.bakes.push({ at: Math.round(performance.now()), queued: Math.round(venue.rebakeFirstQueuedAt ?? 0), staged: stagesPending }); if (staging.bakes.length > 16) staging.bakes.shift(); // GH-1202
    // C2-FIX5 E1: time the synchronous bake and record whether it compiled programs (renderer.info.programs grew = a COLD bake — the #756 step)
    const bakeT0 = performance.now(); const progs0 = programCount(); try { rebakeEnv?.(); } catch { /* ok */ } const bakeT1 = performance.now();
    venue.lastBakeAt = bakeT1; venue.tailPolls = 0; // E2: the tail restarts at every bake
    venue.bakes.push({ seq: venue.seq, queuedAt: Math.round(venue.rebakeQueuedAt || 0), firedAt: Math.round(bakeT0), ms: Math.round(bakeT1 - bakeT0), cold: programCount() > progs0 ? 1 : 0 });
    if (venue.bakes.length > 32) venue.bakes.shift();
    // C2-FIX6 H (the legacy arm's number): this bake fired AFTER a probe was accepted while it was queued — capture the room probe once more and record how far
    // the accepted probe is from the one the environment now gives (the stale probe, quantified); the accepted probe itself is left as the rule left it
    if (venue.staleWatch && venue.staleWatch.bakeSeq < venue.bakes.length) { const w = venue.staleWatch; venue.staleWatch = null;
      try { const c2 = captureVenueProbe(); if (c2) { const s2 = shFlat(c2); venue.staleProbeRel = maxAbsDelta(w.sh, s2) / Math.max(maxAbs(w.sh), 1e-9); venue.staleProbeAfterMs = Math.round(performance.now() - w.at); if (venue.applied && venue.applied.derived) { venue.applied.staleProbeRel = venue.staleProbeRel; venue.applied.staleProbeAfterMs = venue.staleProbeAfterMs; } } } catch { /* a diagnostic; never throws into the bake */ } } };
  // GH-1202: the debounce timer's re-bake never fires while one of this leaf's changes is staged in main.js, nor sooner than a
  // full debounce after the last of them landed (flushRebake, for a caller that needs the cube now, still bakes at once). The cube
  // camera draws the hall keys' other state, whose variants main.js's #1202 side compiles after a relight once no stage is pending
  // (compileHallOther); a bake inside a staged batch, or just after it, linked them inline: the #1202 calm campaign's 139-145 ms
  // fireRebake. While it waits the timer stays armed (the venue loop's owed schedule reads an armed timer as pending), and the
  // schedule keeps its seq while its due follows each re-arm.
  const fireQueuedRebake = () => {
    if (stagesPending > 0) { rebakeTimer = setTimeout(fireQueuedRebake, VENUE_POLL_MS); if (venue.rebakeSched) venue.rebakeSched.dueAt = performance.now() + VENUE_POLL_MS; return; }
    const wait = lastLandAt + (venue.debounceMs > 0 ? venue.debounceMs : 120) - performance.now();
    if (wait > 0) { rebakeTimer = setTimeout(fireQueuedRebake, wait); if (venue.rebakeSched) venue.rebakeSched.dueAt = performance.now() + wait; return; }
    fireRebake();
  };
  const programCount = () => { try { return renderer?.info?.programs?.length ?? -1; } catch { return -1; } };
  // C2-FIX5 E1: the longest RAF gap between the apply's start and its capture — a rAF sampler owned by the leaf (main.js's frameTimes are
  // the app's, not the apply's window); stopped when the capture lands or the apply is superseded
  const stopFrameSampler = () => { if (venue.frameSampler && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(venue.frameSampler); venue.frameSampler = 0; venue.samplerTicksAtStop = venue.samplerTicks || 0; };
  const startFrameSampler = () => {
    stopFrameSampler(); venue.longestFrameMs = 0; venue.stallMs = 0;
    if (typeof requestAnimationFrame !== 'function') return;
    let last = performance.now(); const token = (venue.samplerToken || 0) + 1; venue.samplerToken = token;
    const tick = (now) => {
      // ORDER-LIGHT-C2-FIX9 class N2 (review r9 P3, lightingvisuals.js:1390-1394): the sampler belongs to ONE pending apply — it stops itself when that apply
      // ended (pending false) or a later apply took the token, beside the explicit stops on every terminal path (accept, budget degrade, hold timeout,
      // null capture, the no-term apply). `?venueSampler=legacy` = the 6a076a6d tick (reschedules unconditionally; no stop on those three exits).
      if (venue.samplerMode !== 'legacy' && (!venue.pending || venue.samplerToken !== token)) { venue.frameSampler = 0; venue.samplerTicksAtStop = venue.samplerTicks || 0; return; }
      venue.samplerTicks = (venue.samplerTicks || 0) + 1;
      const gap = now - last; last = now; if (gap > venue.longestFrameMs) venue.longestFrameMs = gap; if (gap > VENUE_POLL_MS) venue.stallMs = (venue.stallMs || 0) + (gap - VENUE_POLL_MS);
      // C2-FIX9 N5 (refuter law F4): the frame that carried a bake — its rAF gap is the bake's real landing cost (the CPU submit is ~2 ms; the GPU cost is paid in this frame)
      const lb = venue.bakes.length ? venue.bakes[venue.bakes.length - 1] : null; if (lb && lb.frameMs == null && venue.lastBakeAt > now - gap && venue.lastBakeAt <= now) lb.frameMs = Math.round(gap);
      venue.frameSampler = requestAnimationFrame(tick); };
    venue.frameSampler = requestAnimationFrame(tick);
  };
  const scheduleRebake = () => {
    // debounced: slider drags re-scale live; the env cubemap follows once
    clearTimeout(rebakeTimer); rebakeTimer = 0;
    if (venue.rebakePending !== true) venue.rebakeFirstQueuedAt = performance.now(); // GH-1202: the census's queued time
    venue.rebakePending = true; venue.lastRigWrite = performance.now(); venue.rebakeQueuedAt = performance.now();
    if (rigWindowOpen()) { venue.rebakeDeferred = true; venue.rigWindowDeferrals = (venue.rigWindowDeferrals || 0) + 1; return; } // C2-FIX1 A: deferred to the window's close
    if (venue.debounceMode === 'hold') { venue.heldRebake = true; return; }
    const delay = venue.debounceMs > 0 ? venue.debounceMs : 120;
    rebakeTimer = setTimeout(fireQueuedRebake, delay);
    // C2-FIX8 H3: the schedule is a fact the gate reads — its ETA is known (dueAt); `bounded` false only under the H3-3 plant
    venue.rebakeSeq = (venue.rebakeSeq || 0) + 1;
    venue.rebakeSched = { seq: venue.rebakeSeq, armedAt: performance.now(), dueAt: performance.now() + delay, delayMs: delay, source: venue.debounceMs > 0 ? 'seam-timed' : 'loop', bounded: venue.rebakeBoundMode !== 'unbounded' };
  };
  /** Drop the queued re-bake without baking (the degrade path: its own fixed-point loop is the bake). */
  const cancelRebake = () => { const was = venue.rebakePending === true; clearTimeout(rebakeTimer); rebakeTimer = 0; venue.rebakePending = false; venue.heldRebake = false; venue.rebakeDeferred = false; return was; }; // (refuter) a cancel inside the window drops the deferral too — the close must not re-arm a cancelled bake
  /** Fire the queued re-bake now (the arm's release; a caller that must see the converged cube before it reads). */
  const flushRebake = () => { if (venue.rebakePending !== true) return false; clearTimeout(rebakeTimer); fireRebake(); return venue.rebakeDeferred !== true; }; // (inside the window fireRebake defers: false)
  try {
    if (typeof window !== 'undefined') window.addEventListener('ob:cinelight', () => {
      const open = rigWindowOpen(); venue.rigWindow = open;
      venue.studioGated = open; writeVenueUniform(); // C2-FIX9 N1: the fill uniform reads zero inside the window and the same coefficients after it (idempotent across cinelight's two open events)
      armBallKnee(); // GH-996: the studio rig ignores the slider (its lamps total the b = 1 canopy), so the ball knee re-bases with it (idempotent)
      if (open) { venue.rigWindowOpenedAt = performance.now(); return; }
      venue.rigResumedAt = performance.now();
      if (parked.length) queueMicrotask(landParked); // GH-1202: what parked lands after cinelight's synchronous restore
      if (venue.rebakeDeferred && venue.rebakePending === true) { venue.rebakeDeferred = false; venue.rebakePending = false; scheduleRebake(); } else venue.rebakeDeferred = false; // the deferred bake, debounced: it lands AFTER cinelight's synchronous restore (under the ?venueDebounce=hold seam it is HELD until a flush — diagnostic only)
    });
  } catch { /* headless */ }



  // ---- venue fill (VENUE_TERMS above): DERIVED probe --------------------
  // `venue.on` from ?venue=off|0 (default on); ?venue=all includes HELD
  // table terms. One probe, owned here, added to the room light group.
  const venue = (() => {
    let q = null;
    try { q = new URLSearchParams(window.location.search); } catch { q = null; }
    const flag = q?.get('venue'); // the lane's ONE runtime switch (product): read on every boot
    // ORDER-LIGHT-C2-FIX4 class D (maintainer): every other query-read flag below is an ARM (a legacy twin or a diagnostic seam) and takes effect
    // only on a SCRIPTED boot — the app's test/tool boot gate (`?cinema` / `?obtool`, cdp.mjs's stamp; `?obtool=0` opts out; the sessionStorage
    // pin app.html sets before any module runs). `qa` is the gated reader: null on a default boot, so every arm reads its default.
    const qa = (() => { try { const q = new URLSearchParams(window.location.search); const on = (k) => q.has(k) && q.get(k) !== '0'; return on('cinema') || on('obtool') || sessionStorage.getItem('ob-scripted') === '1'; } catch { return false; } })() ? q : null;
    // ORDER-LIGHT-FIX6 (review r10 P2 — main.js:795-797): the venue path is ON only under the protocol handshake — main.js passes its
    // expected value, and the two leaves this module reaches statically (room.js, shading.js) must carry it too (belt and braces on
    // the owner's decision: a stale room could otherwise be probed as if it were the class room). Anything else = the legacy rig,
    // exactly `?venue=off`, with the reason on state() / the census.
    // ORDER-LIGHT-COMPANION (refuter round): the budget is PART of the handshake — an owner that passes the protocol but no budget (there is none
    // after the bump to 2; belt and braces) gets the legacy rig with the reason named, never a zero window
    const budgetOk = Number.isFinite(budgetMs) && budgetMs > 0;
    const protoOk = protocol === VENUE_PROTOCOL && roomMod.VENUE_PROTOCOL === VENUE_PROTOCOL && shadingMod.VENUE_PROTOCOL === VENUE_PROTOCOL && budgetOk;
    const protoWhy = protoOk ? null : ((!budgetOk ? 'no boot budget handed over by main.js (budgetMs ' + String(budgetMs) + ') — ' : '') + 'venue protocol: main.js ' + (protocol ?? 'none') + ', room.js ' + (roomMod.VENUE_PROTOCOL ?? 'none') + ', shading.js '
      + (shadingMod.VENUE_PROTOCOL ?? 'none') + ' vs ' + VENUE_PROTOCOL + ' here — the venue fill is not derived, the legacy rig is kept (the legacy path for ALL leaves)');
    return {
      on: flag !== 'off' && flag !== '0' && protoOk,
      protocol: { ok: protoOk, budgetMs: budgetOk ? budgetMs : null, main: protocol ?? null, room: roomMod.VENUE_PROTOCOL ?? null, shading: shadingMod.VENUE_PROTOCOL ?? null, expected: VENUE_PROTOCOL, why: protoWhy },
      all: flag === 'all',
      applied: null, // last applied {tableId, fixture, derived, sh, E, res, pos, gain, scope, hooked}
      sh: null, // the 27 captured coefficients (full precision, unscaled)
      gain: 1, // diagnostic scale on the uniform (setVenueFill; the on/off room-mask test)
      uniform: { value: new Float32Array(27) }, // obVenueSH[9] — ONE object shared by every hooked program
      pending: false, // a capture is scheduled and not yet written (the capture tool's settle predicate)
      arm: qa?.get('venueArm') || null, // 'wallfill' = red arm: the wall material also takes the fill (must read RED)
      // ORDER-LIGHT-7 R-A: what the capture sees of the table — 'occluder' (default: the table stays as a BLACK
      // occluder, so the ball's lower hemisphere reads zero room and the horizon is the cushions, exactly the
      // geometry the ball has) or 'hidden' (diagnostic: the table removed, the bars' floor pool under the table
      // becomes visible — a term the ball never receives; recorded, never shipped)
      probeMode: qa?.get('venueProbe') === 'hidden' ? 'hidden' : 'occluder',
      settleMode: qa?.get('venueSettle') === 'legacy' ? 'legacy' : 'apply', // R-B arm: 'legacy' = the fixed 800 ms wait
      // ORDER-LIGHT-C2-FIX5 E3 (measured 2026-09-12: the probe's SH is bit-identical with the fade pinned authored): the venue probe is
      // captured inside the lamp-fade suspension main.js's cube bake already uses (suspendForBake), so the leaf no longer waits for the
      // fade to settle nor bakes once more after it. 'legacy' = the pre-FIX5 rule (fadeSettled + the post-fade bake) — the arm.
      probeFade: qa?.get('venueProbeFade') === 'legacy' ? 'legacy' : 'bracket',
      // ORDER-LIGHT-C2-FIX6 class H arm: 'legacy' = the 5667a488 rule (the bake-completion gate stops waiting at the settle budget; a convergence round may
      // accept a probe captured from the SAME cube while the queued bake is 50 ms away) — the red arm
      // ORDER-LIGHT-C2-FIX7 class H2: 'fix6' = the 7a522bd2 rule (a pending / timer-armed bake is WAITED for past the settle budget — 64.8 s under the
      // planted slow bake) — the H2-4 red plant; the shipped rule degrades BY NAME at the budget when a bake is still pending / queued / held
      // ORDER-LIGHT-C2-FIX8 class H3: 'fix7' = the fadd4ecb rule (ANY queued bake at the budget degrades — it made the budget the arbiter of shipped boots), the
      // H3-4 red plant; the shipped rule is the ONE-OWED-SCHEDULE rule (maintainer ruling (B), 2026-09-13 15:4xZ). `?venueRebakeBound=unbounded` = the H3-3
      // plant: the loop's own scheduled rebake is marked as having NO known ETA, so a boot with a rebake queued at the budget degrades at the budget.
      acceptMode: qa?.get('venueAccept') === 'legacy' ? 'legacy' : (qa?.get('venueAccept') === 'fix6' ? 'fix6' : (qa?.get('venueAccept') === 'fix7' ? 'fix7' : 'bakeseq')),
      rebakeBoundMode: qa?.get('venueRebakeBound') === 'unbounded' ? 'unbounded' : 'schedule',
      // ORDER-LAND-638-FIX2 B1 (round-trip arm) test seam: 'off' = ONE comparison round (no iteration — records the first
      // fixed-point step as lastDeltaRel; the red arm of FIX-settle-rel / -converged after a large rig change), 'strict' =
      // tolerance 0 (never converges; runs to the bound). Default 'iterate' = the law.
      convergeMode: ['off', 'strict'].includes(qa?.get('venueConverge')) ? qa.get('venueConverge') : 'iterate',
      // ORDER-LAND-638-FIX4 (review r8 P2 #1) test seam: 'render' throws inside the cube render, 'readback' inside the float readback —
      // the red arm of the runtime-failure degradation (FIX-throw* rows). Default null = the law.
      throwMode: ['render', 'readback'].includes(qa?.get('venueThrow')) ? qa.get('venueThrow') : null,
      // ORDER-LIGHT-C2-FIX9 arm-only seams (each names the 6a076a6d rule so the arms run on the fixed export; refused by run-gate outside a declared arm):
      //   ?venueStudioGate=legacy  the fill uniform stays LIVE inside the cinelight studio window (review r9 P2 — class N1)
      //   ?venueSampler=legacy     the E1 rAF sampler is not stopped on the no-term / hold-timeout / null-capture exits and its tick never self-terminates (review r9 P3 — N2)
      //   ?venueOwedClock=wall     the owed schedule's bound is judged on the WALL clock and an ARMED timer past due + one poll reads "overrun" (refuter law F1 — N3)
      //   ?venueStallStraddle=<ms> plants ONE synchronous busy loop of <ms> starting 300 ms before the owed schedule's due — the F1 straddle (the h3stallstraddle arm)
      //   ?venueCancelAt=<ms>      cancels the pending apply <ms> after its start (venue.on = false, the no-term apply) — the N2 cancel form
      studioGateMode: qa?.get('venueStudioGate') === 'legacy' ? 'legacy' : 'gated', studioGated: false,
      samplerMode: qa?.get('venueSampler') === 'legacy' ? 'legacy' : 'stops', samplerTicks: 0, samplerTicksAtStop: 0, samplerToken: 0,
      owedClockMode: qa?.get('venueOwedClock') === 'wall' ? 'wall' : 'effective',
      stallStraddleMs: /^\d+$/.test(qa?.get('venueStallStraddle') || '') ? Number(qa.get('venueStallStraddle')) : 0, stallPlant: null,
      cancelAtMs: /^\d+$/.test(qa?.get('venueCancelAt') || '') ? Number(qa.get('venueCancelAt')) : 0, cancelPlant: null,
      // ORDER-LIGHT-C2-FIX10 class B (review r10 P2, the product finding): the venue capture hides BALLS by their material marker (userData.giBallOn / giSH —
      // every ball material carries them, shading.js:2447/2451), never by position: a replay paused mid-jump above the old 0.25 m height filter used to
      // leave the airborne ball visible to the room-only capture, and its radiance entered the SH and persisted after playback resumed. Seams (arm-only):
      //   ?venueBallHide=height  the pre-FIX10 rule (position filter) — the balliftlegacy twin
      //   ?venueBallLift=<m>     lifts ONE ball by <m> metres for the duration of the capture (restored after) — the mid-jump plant
      ballHideMode: qa?.get('venueBallHide') === 'height' ? 'height' : 'marker',
      ballLiftM: /^\d+(\.\d+)?$/.test(qa?.get('venueBallLift') || '') ? Number(qa.get('venueBallLift')) : 0, ballLiftApplied: 0, hiddenBalls: 0, hiddenBallsAbove: 0,
      // ORDER-LIGHT-C1 (b) seams: the held / slowed debounce and the pre-C1 readiness rule (see scheduleRebake)
      debounceMode: /^hold(:\d+)?$/.test(qa?.get('venueDebounce') || '') ? (qa.get('venueDebounce') === 'hold' ? 'hold' : 'timed') : null,
      debounceMs: /^hold:\d+$/.test(qa?.get('venueDebounce') || '') ? Number(qa.get('venueDebounce').slice(5)) : 0,
      readinessMode: qa?.get('venueReadiness') === 'legacy' ? 'legacy' : 'queued', heldRebake: false, rebakeQueuedAt: 0,
      // ORDER-LIGHT-FIX5 (review r9) test seams — each names the pre-FIX5 rule so the arms run on the fixed export:
      //   ?venueReadNoop=1    the cube readback is stubbed to a no-op for every venue capture (a PERSISTENT readback failure —
      //                       three's log-and-return class; a one-shot stub would be healed by the convergence loop under the
      //                       pre-fix rule and prove nothing)
      //   ?venueReadCheck=off the pre-FIX5 rule (no sentinel fill, no validation: zeros accepted as a probe)
      //   ?venueGiWait=timeout the pre-FIX5 rule (a GI apply outstanding past the 15 s window is captured against anyway)
      //   ?venueHook=termonly the pre-FIX5 wrapper rule (arms on venue.on + active term, derivable ignored)
      readNoop: qa?.get('venueReadNoop') === '1', readCheck: qa?.get('venueReadCheck') !== 'off',
      giWait: qa?.get('venueGiWait') === 'timeout' ? 'timeout' : 'hold', hold: null, heldMs: 0, holdLegacy: null,
      // ORDER-LIGHT-FIX7 test seams — each names the pre-FIX7 rule so the arms run on the fixed export:
      //   ?venueGiHold=forever   the unbounded hold (a stalled GI request holds the term, and readiness, forever)
      //   ?venueRegrade=touched  regrade() re-derives the probe only on a touched rig (an untouched identity default keeps a stale probe)
      giHold: qa?.get('venueGiHold') === 'forever' ? 'forever' : 'bounded', giHoldTimedOut: null,
      regradeMode: qa?.get('venueRegrade') === 'touched' ? 'touched' : 'inputs',
      captureError: null, // the message of a runtime capture throw (state() / census venueCaptureError)
      degradeSignalled: false, // onDegrade called at most once per boot
      hookMode: qa?.get('venueHook') === 'leak' ? 'leak' : (qa?.get('venueHook') === 'termonly' ? 'termonly' : 'gated'), // R-C arm: 'leak' = the seal-6 wrapper (hooks on venue.on alone); FIX5 P3 arm: 'termonly' = the pre-FIX5 wrapper (derivable ignored)
      captures: 0, // captures performed this boot (R-B arm: a fixture change during capture re-runs it)
      legacy: new Map(), // superseded probe uuid -> its build intensity (restored when off)
      // ORDER-LAND-638-FIX P2-a: the ONE table-owned probe an apply suppressed, held by OBJECT handle (not by the
      // fixture id: after a fixture change state.fixture no longer names it) — restored before any other apply
      suppressed: null, // { obj, intensity, visible, name }
      // ORDER-LAND-638-FIX P2-b: the venue fill is DERIVED from a cube capture and needs the renderer; a cached older
      // main.js passes none (cache-poison contract) — then the term is NOT derivable and nothing is suppressed or hooked
      derivable: !!renderer && floatRenderTargetSupported(renderer, q) && protoOk,
      // ORDER-LAND-638-FIX3 (review r7 P2 #4): WHY the term is not derivable — main.js reads it through state() and degrades the
      // whole feature (legacy dressing, main's shading, the look re-applied); the census carries it as venueError
      // ORDER-LIGHT-FIX6: the protocol mismatch is the first reason (it precedes every capability question)
      derivableReason: !protoOk ? protoWhy
        : !renderer ? 'no renderer: the venue fill cannot be derived (a cached older main.js passes none) — legacy rig kept (cache-poison degrade)'
        : (floatRenderTargetSupported(renderer, q) ? null : 'no float render target (EXT_color_buffer_float absent, or ?venueFloat=0): the venue fill cannot be derived — legacy rig + legacy dressing kept (law)'),
      // ORDER-LAND-638-FIX P2-c: main.js never starts a GI load under ?nogi — disabled GI is settled by definition
      nogi: q?.has('nogi') === true,
      // ORDER-LAND-638-FIX (P2-a arms): every rig write stamps lastRigWrite and schedules the debounced env re-bake;
      // the capture attempt waits until that bake has FIRED (rebakePending false) — the cube it sees is the settled rig's
      lastRigWrite: 0, rebakePending: false,
      rigWindow: false, rebakeDeferred: false, rigWindowDeferrals: 0, rigParked: 0, rigWindowOpenedAt: 0, rigResumedAt: 0, // C2-FIX1 class A: the studio window's deferrals
      parkedAt: 0, parkedMs: 0, resumeAwaitingBake: false, resumeCaptureAfterBake: 0, parkBudget: qa?.get('venueParkBudget') === 'legacy' ? 'legacy' : 'paused', // (refuter P2) the park pauses the budget; the seam names the pre-fix rule
      // C2-FIX1 A(ii) (land16 full capture, capture-studiofail): the resume OWES the post-resume bake — it queues one itself when the window left
      // nothing queued; `?venueResumeBake=legacy` = the pre-fix rule (waits for a bake nobody fires — the arm exhausts its attempts)
      resumeBake: qa?.get('venueResumeBake') === 'legacy' ? 'legacy' : 'owed', resumeBakeOwed: 0,
      // ORDER-LAND-638-FIX (P2-a arms, measured): the fill is accepted only when a SECOND capture 250 ms later agrees
      // with the first (a fixture swap leaves a sub-second transient in the room the probe sees: tournament look E(+y) ×1.6 at
      // +160 ms, gone by +1.5 s — no rig / GI predicate names it, so stillness is measured on the quantity itself)
      pendingCap: null, stillness: null,
      // ORDER-LAND-638-FIX (measured, §L20): the ~1 s the lamp fade ramps after a fixture swap / table rebuild is the
      // window in which an env bake records a transient room (tournament look: side faces ×1.6; the round trip: ×0.8). The capture
      // waits for the fade to SETTLE (lampfade.value() unchanged across polls ≥ 250 ms apart), bakes ONCE if the last
      // bake predates that, then captures — the cube it sees is the settled rig's on every path
      fadeSample: null, fadeSettledAt: 0, postFadeBake: false, lastBakeAt: 0,
      // ORDER-LIGHT-C2-FIX5 E1 (the #756 instrument): every env bake this apply fired ({ seq, queuedAt, firedAt, ms, cold }), the apply's
      // start and capture stamps, the longest RAF gap inside the wait (a rAF sampler the leaf runs itself) — census RECORD rows, no judge
      bakes: [], applyStartedAt: 0, capturedAt: 0, longestFrameMs: 0, frameSampler: 0,
      // ORDER-LIGHT-C2-FIX5 E2: attempt polls seen since the last bake fired — the shipped rule captures on the FIRST poll after its last bake
      // (1 by construction: rigQuiet is the only gate left); the legacy settle rules keep polling through their fixed waits (many). The gate's
      // time-free witness for 'the capture does not wait for an apply that failed / never comes' (replaces the wall-clock bound).
      tailPolls: 0,
      // ORDER-LIGHT-C2-FIX6 class H: the acceptance trace ({ t, rel, n, pending, queued, held, bakeSeq }), how many acceptances happened while a bake was
      // pending / queued (0 on the shipped rule by construction), the by-name budget degrade, and — on the legacy arm — the relative change of the
      // probe the NEXT bake produced against the probe accepted while that bake was queued (the stale probe, quantified)
      accepts: [], acceptWhileQueued: 0, budgetDegrade: 0, staleWatch: null, staleProbeRel: null, budgetDegradeRecord: null,
      rt: null, cam: null, timer: 0, seq: 0, addWrapped: false,
    };
  })();
  const PROBE_RES = 64;
  // ORDER-LAND-638-FIX2 B1 (the fixture round-trip arm): the room's walls and props are env-lit by the cube of the room
  // itself, so every env bake is one step of a fixed-point iteration (bake N renders the walls under the prefiltered
  // cube of bake N-1; measured ratio ≈ 0.22 per step on the Predator club room). One post-settle bake left the cube two
  // steps short after a large rig change (pdt → canopy → ring → pdt: a deterministic −4e-4 frame shift, 5 % of pixels
  // flipping one level — no state leak: the converged round trip equals the converged straight state to 5e-7). The
  // settle law therefore ITERATES: bake → capture the room-only probe → compare with the previous round's probe, and
  // accepts when the relative change is ≤ VENUE_CONVERGE_REL or VENUE_CONVERGE_MAX rounds ran (bounded). The tolerance
  // is DERIVED from the identity gate: a systematic shift of 2e-4 flips ~2 % of 8-bit pixels (the gate's own flip
  // budget); half of it. The old stillness witness (two captures 250 ms apart over the SAME cube, tol 1e-3) could not
  // see the shortfall at all — it is subsumed (a round with no scene change converges at once).
  const VENUE_CONVERGE_REL = 1e-4, VENUE_CONVERGE_MAX = 8;
  // ORDER-LIGHT-FIX5 P2#1's GI settle window = ORDER-LIGHT-FIX7's GI-hold bound = ORDER-LIGHT-COMPANION's optional-leaf import bound: ONE
  // budget, declared once in main.js (VENUE_GI_WINDOW_MS) and handed here as `budgetMs`. A missing or non-positive value FAILS the handshake
  // above (protoOk false: not derivable, the reason named — no capture ever runs), so the 0 below is never a window; never a second literal.
  const VENUE_GI_WINDOW_MS = (Number.isFinite(budgetMs) && budgetMs > 0) ? budgetMs : 0;
  const shFlat = (cap) => cap.sh.coefficients.flatMap((v) => [v.x, v.y, v.z]);
  const maxAbsDelta = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
  const maxAbs = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  function activeVenueTerm() {
    const tableId = tableMod.activeTableId?.() ?? null;
    return venueTermFor(tableId, state.fixture, { includeHeld: venue.all });
  }
  function ballRadius() {
    const d = tableMod.specFor?.(tableMod.activeTableId?.())?.render?.profileBallD;
    return Number.isFinite(d) ? d / 2 : 0.028575;
  }
  /** The derived fill rides a UNIFORM on the UNBAKED objects' programs
   * (balls, cue) — see the header. Chained after any existing hook
   * (shading.js injectAnalytic on balls, cuestick.js flex on the cue); the
   * program cache key gains '|venuefill' so the program recompiles once.
   * Anchors: `#include <common>` (uniform) and `#include <lights_fragment_begin>`
   * (the term, added right after three's own indirect term where
   * `irradiance` and `geometryNormal` are in scope). Idempotent. */
  const hookedMats = new WeakSet(); // hooked materials — a WeakSet, not a userData key (material.userData is identity)
  const hookPrev = new WeakMap(); // material → { compile, key } it had before the hook (R-C: unhook when the table has no term)
  const VENUE_FILL_PARS = 'uniform vec3 obVenueSH[ 9 ];\n';
  // WORLD-space normal, exactly as three's getLightProbeIrradiance does (the SH is a world-frame field; the s6 run
  // evaluated it with the VIEW-space geometryNormal and the ball rows moved with the camera: under/crown 0.1716 →
  // 0.1895, equator 0.229 → 0.271 — caught by the numbers, fixed before the seal)
  const VENUE_FILL_APPLY = '#if defined( RE_IndirectDiffuse )\n\tirradiance += shGetIrradianceAt( inverseTransformDirection( geometryNormal, viewMatrix ), obVenueSH );\n#endif\n';
  function hookVenueFill(mat) {
    if (!mat || !mat.isMaterial || mat.isMeshBasicMaterial || hookedMats.has(mat)) return false;
    const proto = Object.getPrototypeOf(mat);
    const prevCompile = mat.onBeforeCompile !== proto.onBeforeCompile ? mat.onBeforeCompile : null;
    const prevKey = mat.customProgramCacheKey !== proto.customProgramCacheKey ? mat.customProgramCacheKey : null;
    mat.onBeforeCompile = function (shader, rend) {
      if (typeof prevCompile === 'function') prevCompile.call(this, shader, rend);
      shader.uniforms.obVenueSH = venue.uniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + VENUE_FILL_PARS)
        .replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n' + VENUE_FILL_APPLY);
    };
    mat.customProgramCacheKey = function () { return (prevKey ? String(prevKey.call(this)) : '') + '|venuefill'; };
    hookedMats.add(mat);
    hookPrev.set(mat, { compile: mat.onBeforeCompile, key: mat.customProgramCacheKey, prevCompile, prevKey, proto });
    mat.needsUpdate = true;
    return true;
  }
  /** R-C: remove the fill hook from a material — restores the hooks it had (or the prototype's), so its
   * program cache key and compiled source are main's again. */
  function unhookVenueFill(mat) {
    if (!mat || !hookedMats.has(mat)) return false;
    const p = hookPrev.get(mat);
    if (p) {
      if (mat.onBeforeCompile === p.compile) mat.onBeforeCompile = p.prevCompile || p.proto.onBeforeCompile;
      if (mat.customProgramCacheKey === p.key) mat.customProgramCacheKey = p.prevKey || p.proto.customProgramCacheKey;
    }
    hookedMats.delete(mat); hookPrev.delete(mat);
    mat.needsUpdate = true;
    return true;
  }
  function unhookAll() {
    let n = 0;
    if (!scene) return n;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (unhookVenueFill(m)) n++;
      if (o.userData && o.userData.obVenueClass && o.userData.obVenueClass !== 'fixture') delete o.userData.obVenueClass;
    });
    return n;
  }
  function writeVenueUniform() {
    const u = venue.uniform.value;
    // ORDER-LIGHT-C2-FIX9 class N1 (review r9 P2, lightingvisuals.js:1089): inside the cinelight studio window the fill is SILENT — zeros are written
    // and the coefficients are KEPT; the ob:cinelight close writes the same coefficients back. A uniform write, never an unhook: the export's ball /
    // cue programs and cache keys do not move (no #785-class recompile mid-export). The studio-rig contract (the ownership ledger (internal) "Venue queues across
    // the window") names the capture, the re-bake and the GI weight as the gameplay terms silent inside the window — the fill is the third.
    if (!venue.sh || (venue.studioGated === true && venue.studioGateMode !== 'legacy')) { u.fill(0); return; }
    for (let i = 0; i < 27; i++) u[i] = venue.sh[i] * venue.gain;
  }
  /** Hook every unbaked object's material (balls: MeshPhysical spheres of
   * the unnamed ball-set root or any material carrying shading.js' giSH;
   * cue: every mesh under an obCueStick / obAtelierCue group) and tag the
   * object for the capture tool's programs census (object userData is not a
   * material identity field). Cue rebuilds (aim.js rebuildCue → scene.add)
   * re-run this through a scene.add wrapper installed once. Returns the
   * hooked-material totals per class. */
  function hookUnbaked() {
    const counts = { balls: 0, cue: 0, arm: 0 };
    if (!scene) return counts;
    if (venue.derivable === false && venue.hookMode === 'gated') return counts; // FIX5 P3: a term that cannot be derived hooks nothing
    const r = room();
    const roomRoot = r?.lightRefs?.group ?? null;
    const isCueRoot = (o) => /^obCueStick|^obAtelierCue/.test(o.name || '');
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let cls = null, a = o, root = o;
      while (a && a !== scene) { if (isCueRoot(a)) cls = 'cue'; root = a; a = a.parent; }
      if (!cls && root !== roomRoot && !root.name && o.geometry?.type === 'SphereGeometry'
        && mats.some((m) => m && (m.isMeshPhysicalMaterial || m.isMeshStandardMaterial))) cls = 'balls';
      if (!cls && mats.some((m) => m?.userData?.giSH)) cls = 'balls';
      if (!cls) return;
      for (const m of mats) hookVenueFill(m);
      o.userData.obVenueClass = cls;
      counts[cls] += mats.filter((m) => hookedMats.has(m)).length;
    });
    if (venue.arm === 'wallfill') {
      const w = r?.lightRefs?.walls;
      if (w) { hookVenueFill(w.material); counts.arm = hookedMats.has(w.material) ? 1 : 0; }
    }
    if (!venue.addWrapped) {
      const add0 = scene.add;
      scene.add = function (...objs) {
        const out = add0.apply(this, objs);
        // R-C: hook new unbaked objects ONLY while the ACTIVE table carries a derived term (the seal-6 wrapper
        // hooked on venue.on alone and leaked `|venuefill` programs onto later tables; `?venueHook=leak` = that arm)
        // ORDER-LIGHT-FIX5 P3 (review r9): gated on derivable too — after a runtime failure (derivable false) a rerack's new
        // ball/cue materials arrive through this wrapper and used to be hooked (|venuefill programs under a zero uniform);
        // `?venueHook=termonly` = that pre-FIX5 rule (the arm)
        const armed = () => venue.hookMode === 'leak' ? venue.on
          : (venue.hookMode === 'termonly' ? (venue.on && !!activeVenueTerm()) : (venue.on && venue.derivable !== false && !!activeVenueTerm()));
        // GH-1202: while one of our light-set changes is staged and still the newest of its kind, it (or its follow-up's venue
        // apply) hooks the new objects too; hooking every unbaked material here would land the fill hook outside the seam. The hook
        // reads both again when it runs, and one that comes due inside the studio window waits for its close: cinelight's own rims
        // come through here, and a hook landing in the window would re-key a ball or cue the export already drew (C2-FIX9 N1)
        if (armed() && !livePending()) queueMicrotask(function hookAdded() {
          if (rigWindowOpen()) { parked.push(hookAdded); return; }
          try { if (armed() && !livePending()) hookUnbaked(); } catch { /* ok */ }
        });
        return out;
      };
      venue.addWrapped = true;
    }
    return counts;
  }
  /** Render the bar-lit room from the table centre at ball height into the
   * float cube target with every non-venue light source hidden, and project
   * it to SH-L2. Returns null when the renderer is unavailable. */
  function captureVenueProbe() {
    const r = room();
    if (!renderer || !scene || !r || !venue.derivable) return null; // FIX3: never render to a float target the context cannot attach
    const lr = r.lightRefs;
    if (!venue.rt) {
      venue.rt = new THREE.WebGLCubeRenderTarget(PROBE_RES, { type: THREE.FloatType });
      venue.cam = new THREE.CubeCamera(0.01, 40, venue.rt);
    }
    const R = ballRadius();
    venue.cam.position.set(0, R, 0);
    // ORDER-LIGHT-6 wanted the probe to see the env cube of the rig it measures (a boot could leave it one bake behind)
    // and called main.js' rebakeEnv HERE. ORDER-LAND-638-FIX (P2-a arms, measured): that extra call, made after a
    // TABLE REBUILD, carries main.js' bake-time side effects (the env-extent sync on the boot table object, the cube
    // recentre) a second time and left the scene ~20 % darker for good (table 0.61–0.79, walls 0.86; a forced bake
    // later stayed dark) and the re-derived fill 4.7× darker overhead — the debounced bake alone never does. The
    // capture now RELIES on that bake instead: attempt() waits for the pending debounce (venue.rebakePending), so
    // the cube it sees is the settled rig's, in the same order on every boot, with no second bake.
    const restore = [];
    // ORDER-LIGHT-C2-FIX5 E3: the probe renders inside the lamp-fade suspension (window.__lampfade.suspendForBake — main.js:723 brackets its cube
    // bake the same way), so what the probe sees never depends on the CAMERA height the fade follows; measured bit-identical either way on
    // 2026-09-12 (the fixture meshes are blacked below), so the wait the leaf spent on the fade was pure cost. 'legacy' keeps the pre-FIX5 rule.
    if (venue.probeFade !== 'legacy') { try { const rf = window.__lampfade?.suspendForBake?.(); if (typeof rf === 'function') restore.push(rf); } catch { /* no seam */ } }
    const hide = (o) => { if (o && o.visible) { restore.push(() => { o.visible = true; }); o.visible = false; } };
    const setI = (l, v) => { if (l && typeof l.intensity === 'number') { const p = l.intensity; restore.push(() => { l.intensity = p; }); l.intensity = v; } };
    // ORDER-LIGHT-7 R-A (energy accounting): the runtime term carries ONLY what the bake does not — the ROOM. The
    // balls already receive the bake's per-ball SH-L2 probe grid (gi.js, bar → cloth / room-at-bake-albedo → ball,
    // uGiIrr 2.0); seal 5/6 captured the room AND the lit table and added the same cloth-bounce family a second
    // time (review round 1: pinned E(−y) 0.90 / 0.92 against 1.00 / 1.50 already applied). Here the whole table
    // becomes a BLACK OCCLUDER (every obTable mesh rendered with an unlit black material: it blocks exactly what
    // it blocks for the ball — the floor below, the walls under the rail horizon — and radiates nothing), the
    // fixture meshes are hidden (the emitters stay), the table's own LED spots are off. `?venueProbe=hidden`
    // removes the table instead (the order's literal reading) and is a recorded diagnostic: it lets the probe see
    // the bars' floor pool under the table, a term no ball on the cloth ever receives.
    if (!venue.blackMat) venue.blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const tableRoot = scene.getObjectByName?.('obTable') ?? null;
    if (tableRoot) {
      if (venue.probeMode === 'hidden') hide(tableRoot);
      else {
        tableRoot.traverse((o) => {
          if (o.isMesh) { const m = o.material; restore.push(() => { o.material = m; }); o.material = venue.blackMat; }
          if (o.isLight && !o.isLightProbe) setI(o, 0); // the table's LED spots: not the venue's emitters
        });
      }
    }
    // fixture meshes (housings, plates, rods, canopy hood + lamp face): hidden — the key is the RectAreaLights
    hide(lr.lampFace); hide(lr.hood);
    for (const rod of lr.rods ?? []) hide(rod);
    if (fixtureGroup) hide(fixtureGroup);
    for (const f of fixtureFaces) hide(f);
    // balls, cue, aim: not part of the venue. C2-FIX10 class B: a ball is a mesh whose material carries the ball markers (userData.giBallOn / giSH),
    // wherever it is — the old position filter (|y| < 0.25) let an airborne ball into the room-only capture. The plant lifts one ball first so the arm
    // can show the two rules disagree exactly there.
    const isBallMesh = (o) => !!(o.isMesh && o.material && o.material.userData && (o.material.userData.giBallOn || o.material.userData.giSH));
    venue.ballLiftApplied = 0; venue.hiddenBalls = 0; venue.hiddenBallsAbove = 0;
    if (venue.ballLiftM > 0) {
      let lifted = null; scene.traverse((o) => { if (!lifted && isBallMesh(o)) lifted = o; });
      if (lifted) { const y0 = lifted.position.y; lifted.position.y = y0 + venue.ballLiftM; lifted.updateMatrixWorld(true); restore.push(() => { lifted.position.y = y0; lifted.updateMatrixWorld(true); }); venue.ballLiftApplied = venue.ballLiftM; }
    }
    scene.traverse((o) => {
      const byHeight = o.isMesh && o.geometry?.type === 'SphereGeometry' && Math.abs(o.position.y) < 0.25 && Math.abs(o.position.x) < 2.2 && Math.abs(o.position.z) < 1.2;
      const hit = venue.ballHideMode === 'height' ? byHeight : isBallMesh(o);
      if (hit) { hide(o); venue.hiddenBalls++; if (Math.abs(o.position.y) >= 0.25) venue.hiddenBallsAbove++; }
      if (/^obAim|^obCueStick|^obAtelierCue/.test(o.name || '')) hide(o);
    });
    // room stand-in lights and every other probe: OFF during the capture
    setI(lr.hemi, 0); setI(lr.fill, 0);
    const sup = activeVenueTerm()?.supersedes ?? VENUE_TERMS.byFixture[state.fixture]?.supersedes;
    if (sup) { const legacy = scene.getObjectByName?.(sup); if (legacy) setI(legacy, 0); }
    if (venue.readNoop) { // FIX5 P2#2 arm: the readback writes nothing and does not throw (three's log-and-return class)
      const orig = renderer.readRenderTargetPixels; restore.push(() => { renderer.readRenderTargetPixels = orig; });
      renderer.readRenderTargetPixels = function () { /* venueReadNoop=1 (test seam) */ };
    }
    let out = null;
    try {
      if (venue.throwMode === 'render') throw new Error('venueThrow=render (test seam): the cube render threw');
      venue.cam.update(renderer, scene);
      if (venue.throwMode === 'readback') throw new Error('venueThrow=readback (test seam): the float readback threw');
      out = shFromCubeTarget(renderer, venue.rt, { check: venue.readCheck });
    } catch (e) {
      // ORDER-LAND-638-FIX4 (review r8 P2 #1): a throw in the cube render or the float readback used to escape attempt()'s
      // timer callback — venue.pending stayed true, the suppressed table-owned probe and the hooks stayed, __test.ready never
      // turned true. It now takes the SAME degradation path as the init-time capability check: derivable false with a
      // stated reason; the caller's null-capture branch restores the probe and the hooks and clears pending, and main.js's
      // ONE degradeVenue runs through onDegrade (legacy dressing, main's shading, the look re-applied, the cube converged,
      // the law line) — no second path. Later applies take the not-derivable branch (nothing suppressed again).
      venue.captureError = String(e && e.message || e);
      venue.derivable = false;
      venue.derivableReason = 'venue probe capture threw at runtime (' + venue.captureError + '): the venue fill cannot be derived — legacy rig + legacy dressing kept (law)';
      out = null;
    } finally {
      for (const f of restore.reverse()) f();
    }
    if (out) venue.captures++;
    return out ? { ...out, res: PROBE_RES, pos: [0, Number(R.toFixed(6)), 0], mode: venue.probeMode } : null;
  }
  /** Write the venue term for the CURRENT (table, fixture, look). The
   * capture waits for the GI runtime to settle (its lightmaps are part of
   * the room the probe sees), then runs once; idempotent per apply. */
  /** ORDER-LAND-638-FIX P2-a/P2-b: put the suppressed table-owned probe back exactly as it was built. */
  function restoreSuppressed() {
    const s = venue.suppressed;
    if (!s) return false;
    if (s.obj) { s.obj.intensity = s.intensity; s.obj.visible = s.visible; }
    venue.suppressed = null;
    return true;
  }
  /** ORDER-LIGHT-FIX5 P2#1: suppress the table-owned probe again after a GI hold put it back (the applyVenue rule, by handle). */
  function suppressLegacy(legacy) {
    if (!legacy || venue.suppressed) return;
    venue.suppressed = { obj: legacy, intensity: legacy.intensity, visible: legacy.visible, name: legacy.name };
    legacy.intensity = 0; legacy.visible = false;
  }
  /** ORDER-LIGHT-FIX7 → ORDER-LIGHT-COMPANION (review r12 P2): the bounded hold expired on a GI request that never settled. The term is
   * cleared and readiness released (FIX7), and the fallback is the SAME degrade as every other failure path — main.js's ONE degradeVenue
   * through onDegrade: venue OFF for the table (the probe restored by the off apply, the legacy dressing, main's shading, the look
   * re-applied, the cube converged), never the 9.91 probe under the class room. The FIX7 watch (re-derive on a late completion) is
   * superseded: a degraded boot stays legacy, like every other degraded boot. Census: gi-hold-timeout + the degrade record. */
  // ORDER-LIGHT-C2-FIX6 class H: a bake that cannot fire by itself (held debounce, or window-deferred with nothing to re-arm it) past the settle budget —
  // the venue path degrades BY NAME through the owner's one degradeVenue (the gi-hold-timeout shape); an unchanged cube is never accepted as convergence
  function degradeOnBudgetBakeHeld(elapsed) { degradeOnBudgetBake(elapsed, 'held'); }
  function degradeOnBudgetBake(elapsed, kind) {
    venue.pendingCap = null; clearTimeout(venue.timer); venue.budgetDegrade = 1;
    const st = { pending: venue.rebakePending === true ? 1 : 0, queued: rebakeTimer !== 0 ? 1 : 0, held: venue.heldRebake === true ? 1 : 0, deferred: venue.rebakeDeferred === true ? 1 : 0, elapsedMs: Math.round(elapsed), budgetMs: VENUE_GI_WINDOW_MS };
    venue.budgetDegradeState = st; venue.budgetDegradeKind = kind;
    // C2-FIX7 H2: a DURABLE record — the owner's degrade runs the off apply, which replaces venue.applied and resets the per-apply counters, so the
    // census would read nothing of the degrade; the record survives until the next successful derivation and the state snapshot spreads it
    venue.budgetDegradeRecord = { tableId: tableMod.activeTableId?.() ?? null, fixture: state.fixture, look: state.look,
      // C2-FIX8 (land24 check-arms NO-READ on FIX-gidelay-gisettled): the durable record carries the GI-side fields the derived record carries, so a degraded boot reads them too
      giSeq: giSeq(), giSettled: giIdle(), giHeldMs: venue.heldMs ?? 0, giWait: venue.giWait, hold: null, giHoldTimeout: false, settle: venue.settleMode, hookMode: venue.hookMode, captures: venue.captures,
      stallMs: Math.round(venue.stallMs || 0), waitedEffMs: Math.round(elapsed - (venue.stallMs || 0)), longestFrameMs: Math.round(venue.longestFrameMs || 0), idleTailMs: venue.idleTailMs ?? null,
      bake1Ms: venue.bakes[0] ? venue.bakes[0].ms : null, bake2Ms: venue.bakes[1] ? venue.bakes[1].ms : null, bakeCold1: venue.bakes[0] ? venue.bakes[0].cold : null,
      h3Class: (venue.h3 || {}).cls ?? null, h3BoundMs: (venue.h3 || {}).boundMs ?? null, h3Rounds: (venue.h3 || {}).rounds ?? 0, h3Why: (venue.h3 || {}).why ?? null, h3Owed: (venue.h3 || {}).owed ? JSON.stringify((venue.h3 || {}).owed) : null, error: null, budgetDegrade: 1, degradeName: kind === 'pending' ? 'settle-budget-bake-pending' : 'settle-budget-bake-held', budgetDegradeState: st, waitedMs: Math.round(elapsed),
      acceptWhileQueued: venue.acceptWhileQueued, acceptMode: venue.acceptMode, accepts: venue.accepts.slice(), acceptTraceN: venue.accepts.length, bakes: venue.bakes.slice(), bakeCount: venue.bakes.length, tailPolls: venue.tailPolls, degraded: true };
    const name = kind === 'pending' ? 'settle-budget-bake-pending' : 'settle-budget-bake-held';
    const H = venue.h3 || {}; const h3s = (H.cls ? ' ' + H.cls : '') + (H.boundMs ? ' bound' + H.boundMs : '') + (H.rounds ? ' r' + H.rounds : '') + (venue.stallMs ? ' stall' + Math.round(venue.stallMs) : '');
    const errName = name + '(p' + st.pending + ' q' + st.queued + ' h' + st.held + ' d' + st.deferred + ' ' + st.elapsedMs + 'ms/' + st.budgetMs + h3s + ')';
    venue.budgetDegradeRecord.error = errName;
    const reason = kind === 'pending'
      ? name + ': a rebake was still pending / queued / held (' + errName + ') when the ' + VENUE_GI_WINDOW_MS + ' ms settle budget ran out — the venue path DEGRADES to off for this table BY NAME (C2-FIX7 class H2: never accepted from the pre-bake cube, never waited for past the budget)'
      : 'settle-budget-bake-held: a rebake was still queued (held / window-deferred, no timer armed) when the ' + VENUE_GI_WINDOW_MS + ' ms settle budget ran out — the venue path DEGRADES to off for this table (C2-FIX6 class H: a probe is accepted only when no bake is pending or queued)';
    venue.applied = { tableId: tableMod.activeTableId?.() ?? null, fixture: state.fixture, look: state.look, derived: false, sh: null, error: errName, degradeName: name, budgetDegradeState: st, degraded: true, budgetDegrade: 1,
      waitedMs: Math.round(elapsed), giSeq: giSeq(), giSettled: giIdle(), hookMode: venue.hookMode, captures: venue.captures, settle: venue.settleMode, accepts: venue.accepts.slice(), acceptWhileQueued: venue.acceptWhileQueued, bakeCount: venue.bakes.length };
    venue.pending = false; stopFrameSampler();
    console.info('[venue] law: ' + reason);
    if (typeof onDegrade === 'function' && !venue.degradeSignalled) { venue.degradeSignalled = true; try { onDegrade(reason); return; } catch { /* fall through */ } }
    restoreSuppressed(); const un = venue.hookMode === 'leak' ? 0 : unhookAll(); venue.sh = null; writeVenueUniform(); venue.applied.unhooked = un;
  }
  function degradeOnHoldTimeout(elapsed) {
    const h = venue.hold; const heldMs = h ? Math.round(performance.now() - h.since) : 0;
    venue.hold = null; venue.heldMs = heldMs; venue.pendingCap = null; clearTimeout(venue.timer);
    venue.giHoldTimedOut = { at: Math.round(performance.now()), heldMs, waitedMs: Math.round(elapsed), budgetMs: VENUE_GI_WINDOW_MS,
      reason: 'gi-hold-timeout: the GI apply did not complete within the ' + VENUE_GI_WINDOW_MS + ' ms hold budget (FIX5\'s settle window) — the venue path DEGRADES to off for this table (probe, dressing, shading together; the same degrade as every other failure path)' };
    venue.applied = { tableId: tableMod.activeTableId?.() ?? null, fixture: state.fixture, look: state.look, derived: false, sh: null, error: 'gi-hold-timeout',
      giHoldTimeout: true, degraded: true, giHeldMs: heldMs, waitedMs: Math.round(elapsed), giSeq: giSeq(), giSettled: false, giWait: venue.giWait,
      hookMode: venue.hookMode, captures: venue.captures, settle: venue.settleMode };
    venue.pending = false; if (venue.samplerMode !== 'legacy') stopFrameSampler(); // C2-FIX9 N2 (b): the hold-timeout degrade ends the apply — and its sampler
    console.info('[venue] law: ' + venue.giHoldTimedOut.reason);
    if (typeof onDegrade === 'function' && !venue.degradeSignalled) {
      venue.degradeSignalled = true;
      try { onDegrade(venue.giHoldTimedOut.reason); return; } catch { /* fall through to the leaf-local off */ }
    }
    // no owner degrade (a stale main.js, which never dressed the class room): the leaf turns its own venue off — the off apply restores
    // the probe and unhooks the fill (applyVenue's no-term branch); never a probe under a class dressing this leaf cannot see
    venue.on = false; applyVenue();
  }
  /** FIX5 P2#1: hold the term — poll the GI apply (an event) every 250 ms. ORDER-LIGHT-COMPANION (review r12 P2, lightingvisuals.js:1213):
   * the table-owned 9.91 probe is NEVER put back while the class dressing and the venue shading are active (that pairing over-lights the
   * room ~10×, §L21 / FIX2 B1(b)); during the hold it stays suppressed and the balls carry no fill until the apply lands or the hold expires
   * into the full degrade (venue OFF for the table: probe, dressing, shading together — never a hybrid). */
  function enterHold(reason) {
    if (!venue.hold) venue.hold = { since: performance.now(), reason };
    venue.timer = setTimeout(venue.attempt, 250);
  }
  // (ORDER-LIGHT-FIX7: hoisted out of applyVenue so the late-completion WATCH can read them too — they depend on `gi` and the boot flag only)
  const giSeq = () => ({ started: gi?.state?.applySeq ?? null, completed: gi?.state?.appliedSeq ?? null, ready: !!gi?.state?.ready });
  const giIdle = () => {
    // P2-c: no GI object, GI disabled by the boot flag, or a GI runtime whose load was never requested → settled
    if (!gi || venue.nogi || gi.state?.loadRequested === false) return true;
    // ORDER-LAND-638-FIX2 C2 (review r6 P1): a REJECTED load (manifest / texture fetch) is an error state and an error
    // state is a settled state — gi.js records it (state.loadError) and concludes the apply (appliedSeq = applySeq)
    if (gi.state?.loadError) return true;
    const g = giSeq();
    if (g.started === null) return g.ready && (g.completed ?? 0) >= 1; // stale gi.js without the mirror
    return g.ready && g.completed === g.started && g.completed >= 1;
  };
  function applyVenue() {
    const r = room();
    if (!r) return;
    // GH-1202: the light-set part (the superseded probe's hide or restore, the fill hook) goes through main's staging seam as an
    // exact pair when main offers it, and the rest of the apply follows the real apply. Without the seam both run here, as before.
    const seam = atOnce ? null : stageSeam();
    if (!seam) { epoch.venue++; const v = venueInputs(); applyVenueRest(v, venueLightSet(v)); return; }
    const change = venueChange(venueInputs());
    if (!livePending()) {
      change.apply();
      // nothing that keys a program moved (the slider, the look, a re-assert): the apply completes here, as before
      if (!change.moved()) { applyVenueRest(change.inputs, change.unhooked()); return; }
      change.revert();
    }
    // a change behind one of ours that is still staged is staged too, so it lands after it. The previous apply's capture loop
    // stops here, so it cannot accept (and hook) or degrade around the staged change; the follow-up starts the next one
    clearTimeout(venue.timer);
    venue.seq++;
    stageLightSet(seam, 'venue', change, (fresh) => { if (fresh) applyVenueRest(change.inputs, change.unhooked()); }, 'lighting:venue');
  }
  /** GH-1202: what a venue apply acts on — read when the apply is asked for, so a staged change applies what main compiled. */
  function venueInputs() {
    // P2-b: no renderer (a cached older main.js) → no derivable term → nothing suppressed, nothing hooked: main's rig
    const t = (venue.on && venue.derivable) ? activeVenueTerm() : null;
    // the superseded table-owned probe (Predator): 0 while our term is on,
    // its own build literal otherwise (remembered HERE, never written into
    // the table-owned object). P2-a: whatever an EARLIER apply suppressed is
    // restored first, by handle — a fixture change (pdt_studio → canopy) or a
    // table change no longer names it through state.fixture.
    const sup = VENUE_TERMS.byFixture[state.fixture]?.supersedes ?? t?.supersedes;
    const legacy = (t && sup) ? (scene?.getObjectByName?.(sup) ?? null) : null;
    return { t, sup, legacy };
  }
  /** GH-1202: a venue apply's light-set part — the superseded probe and the fill hook. Returns the no-term apply's unhook count. */
  function venueLightSet({ t, legacy }) {
    if (venue.suppressed && venue.suppressed.obj !== legacy) restoreSuppressed();
    if (legacy) {
      if (!venue.legacy.has(legacy.uuid)) venue.legacy.set(legacy.uuid, legacy.intensity);
      if (!venue.suppressed) venue.suppressed = { obj: legacy, intensity: legacy.intensity, visible: legacy.visible, name: legacy.name };
      legacy.intensity = 0;
      // ORDER-LIGHT-6 Q1: HIDDEN while the term is on — an invisible light is not collected,
      // so numLightProbes = 0 and no program (room, table, fixture, ball) compiles a probe line
      legacy.visible = false;
    }
    // R-C: a table without a derived term carries NO fill hook — its ball/cue programs and cache keys are main's
    // (`?venueHook=leak` keeps the seal-6 behaviour for the arm: hooks stay, uniform zero)
    if (!t) return venue.hookMode === 'leak' ? 0 : unhookAll();
    hookUnbaked();
    return 0;
  }
  // GH-1202: the venue light-set part as an exact pair. apply() snapshots what the part can touch (every mesh material's own
  // onBeforeCompile / customProgramCacheKey and hook records, the census tags, the probes, the suppression records, the scene.add
  // wrapper), then runs it; revert() puts all of it back and flags the materials it re-keys.
  const NO_OWN = Symbol('no own property');
  const ownOf = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : NO_OWN);
  const putOwn = (o, k, v) => { if (v === NO_OWN) delete o[k]; else o[k] = v; };
  function venueSnap(legacy) {
    const mats = new Map(), tags = new Map();
    scene?.traverse((o) => {
      if (!o.isMesh) return;
      tags.set(o, ownOf(o.userData, 'obVenueClass'));
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m && !mats.has(m)) mats.set(m, { compile: ownOf(m, 'onBeforeCompile'), key: ownOf(m, 'customProgramCacheKey'), hooked: hookedMats.has(m), rec: hookPrev.get(m) });
      }
    });
    const probes = [venue.suppressed?.obj, legacy].filter(Boolean).map((o) => ({ o, intensity: o.intensity, visible: o.visible }));
    return { mats, tags, probes, suppressed: venue.suppressed, legacy, legacyHad: !!legacy && venue.legacy.has(legacy.uuid),
      legacyBuild: legacy ? venue.legacy.get(legacy.uuid) : undefined, add: scene ? ownOf(scene, 'add') : NO_OWN, addWrapped: venue.addWrapped };
  }
  const matMoved = (m, e) => hookedMats.has(m) !== e.hooked || ownOf(m, 'onBeforeCompile') !== e.compile || ownOf(m, 'customProgramCacheKey') !== e.key;
  function venueMoved(snap) {
    for (const [m, e] of snap.mats) if (matMoved(m, e)) return true;
    return snap.probes.some((p) => p.o.visible !== p.visible);
  }
  function venueRestore(snap) {
    for (const [m, e] of snap.mats) {
      if (!matMoved(m, e)) continue;
      putOwn(m, 'onBeforeCompile', e.compile);
      putOwn(m, 'customProgramCacheKey', e.key);
      if (e.hooked) { hookedMats.add(m); hookPrev.set(m, e.rec); } else { hookedMats.delete(m); hookPrev.delete(m); }
      m.needsUpdate = true; // the program key is read again at the next use
    }
    for (const [o, v] of snap.tags) putOwn(o.userData, 'obVenueClass', v);
    for (const p of snap.probes) { p.o.intensity = p.intensity; p.o.visible = p.visible; }
    venue.suppressed = snap.suppressed;
    if (snap.legacy) { if (snap.legacyHad) venue.legacy.set(snap.legacy.uuid, snap.legacyBuild); else venue.legacy.delete(snap.legacy.uuid); }
    if (scene && !snap.addWrapped && venue.addWrapped) { putOwn(scene, 'add', snap.add); venue.addWrapped = snap.addWrapped; }
  }
  function venueChange(inputs) {
    let snap = null, unhooked = 0;
    return {
      inputs,
      apply() {
        if (snap) return;
        snap = venueSnap(inputs.legacy);
        unhooked = venueLightSet(inputs);
      },
      revert() {
        if (!snap) return;
        venueRestore(snap);
        snap = null;
      },
      applied: () => !!snap,
      moved: () => !!snap && venueMoved(snap),
      unhooked: () => unhooked,
    };
  }
  /** The rest of a venue apply, after its light-set part (GH-1202: after the real apply when it was staged). */
  function applyVenueRest({ t, sup, legacy }, unhooked) {
    venue.holdLegacy = legacy; // FIX5 P2#1 → COMPANION: stays suppressed through a GI hold (never put back under the class room); the release re-asserts the suppression
    clearTimeout(venue.timer);
    venue.pendingCap = null; // a new apply starts a new stillness measurement
    venue.hold = null; venue.heldMs = 0; // FIX5 P2#1: a new apply starts without a hold
    venue.fadeSample = null; venue.fadeSettledAt = 0; venue.postFadeBake = false;
    if (!t) {
      venue.sh = null; writeVenueUniform(); venue.pending = false;
      if (venue.samplerMode !== 'legacy') stopFrameSampler(); // C2-FIX9 N2 (a): a superseding no-term apply / setVenue(false) / the leaf's own off ends the previous apply's sampler
      // P2-b: a venue that is ON but cannot be derived is RECORDED as such (the state() surface / census read it)
      venue.applied = (venue.on && !venue.derivable)
        ? { derived: false, sh: null, error: venue.derivableReason || 'the venue fill cannot be derived — legacy rig kept' }
        : null;
      venue.lastUnhook = unhooked;
      return;
    }
    venue.pending = true;
    const seq = ++venue.seq;
    let started = performance.now(); // FIX5 P2#1: re-based when a GI hold is released
    venue.applyStartedAt = started; venue.capturedAt = 0; venue.bakes = []; venue.tailPolls = 0; startFrameSampler(); // C2-FIX5 E1 / E2
    if (venue.cancelAtMs > 0) { // C2-FIX9 N2 cancel form (arm seam): the pending apply is cancelled from outside <ms> after ITS start, the no-term apply must end its sampler.
      // Armed per apply (the boot's look / fixture reapply supersedes the first apply within a second; the plant follows the CURRENT apply — the smoke's first form never fired)
      const plant = { atMs: venue.cancelAtMs, seq, fired: 0, firedMs: null }; venue.cancelPlant = plant;
      setTimeout(() => { if (seq === venue.seq && venue.pending) { plant.fired = 1; plant.firedMs = Math.round(performance.now() - started); venue.on = false; applyVenue(); } }, venue.cancelAtMs);
    }
    venue.accepts = []; venue.acceptWhileQueued = 0; venue.budgetDegrade = 0; venue.staleWatch = null; venue.staleProbeRel = null; // C2-FIX6 H
    venue.h3 = { owed: null, cls: null, boundMs: null, rounds: 0, why: null }; if (venue.on) venue.budgetDegradeRecord = null; // C2-FIX8 H3 bookkeeping; a new venue-ON apply retires the durable degrade record (the off apply keeps it)
    let settledAt = 0, retries = 0;
    // R-B: the capture is tied to the CURRENT GI apply's completion — gi.state.applySeq (last STARTED, mirrored by
    // gi.js for this) must equal gi.state.appliedSeq (last COMPLETED) with the runtime ready; a live fixture/look
    // change starts a new apply, the predicate goes false again and the capture waits for THAT apply. No fixed
    // wait: the env term is re-baked inside captureVenueProbe itself. A capture that lands while a newer apply
    // started in between is discarded and re-run. `?venueSettle=legacy` = the seal-6 rule (ready && appliedSeq ≥ 1,
    // then a fixed 800 ms) — the arm.
    // ORDER-LAND-638-FIX (P2-a arms): the capture also waits for the debounced env re-bake of the last rig write to
    // have FIRED (venue.rebakePending) — the cube it captures is then the settled rig's (see captureVenueProbe)
    const rigQuiet = () => !venue.rebakePending; // the debounced env re-bake of the last rig write has fired (event, not a time window)
    const lfValue = () => { try { const v = window.__lampfade?.value?.(); return Number.isFinite(v) ? v : null; } catch { return null; } };
    // the lamp fade has settled: the same value on two polls ≥ 250 ms apart (a rate-limited ramp moves every frame);
    // no lampfade seam (stale leaf) → nothing to wait for
    const fadeSettled = () => {
      const v = lfValue(); if (v === null) return true;
      const now = performance.now(); const smp = venue.fadeSample;
      if (!smp || smp.v !== v) { venue.fadeSample = { v, t: now }; return false; }
      return now - smp.t >= 250;
    };
    // once the fade has settled, the cube must be a POST-settle bake: schedule exactly one if the last predates it
    const cubeCurrent = () => {
      if (!venue.fadeSettledAt) venue.fadeSettledAt = performance.now();
      if ((venue.lastBakeAt || 0) >= venue.fadeSettledAt) return true;
      if (!venue.postFadeBake) { venue.postFadeBake = true; scheduleRebake(); }
      return false; // rigQuiet() turns true when that bake has fired (lastBakeAt then ≥ fadeSettledAt)
    };
    const attempt = () => {
      if (seq !== venue.seq) return; // superseded by a later apply
      if (venue.lastBakeAt) venue.tailPolls = (venue.tailPolls || 0) + 1; // E2: one more poll after the last bake
      if (rigWindowOpen()) { // C2-FIX1 A: no capture inside the studio window
        venue.rigParked = (venue.rigParked || 0) + 1; if (!venue.parkedAt) venue.parkedAt = performance.now();
        venue.timer = setTimeout(attempt, 100); return;
      }
      if (venue.parkedAt) {
        // (refuter P2) the PARK pauses the settle budget and a hold's clock — an export longer than VENUE_GI_WINDOW_MS used to let the
        // resumed attempt skip the rigQuiet / cubeCurrent wait (elapsed already past the window) and capture against the stale
        // pre-export cube, or expire a hold into the degrade because of an export. `?venueParkBudget=legacy` = the pre-fix rule (the arm).
        const span = performance.now() - venue.parkedAt; venue.parkedAt = 0; venue.parkedMs = (venue.parkedMs || 0) + span;
        if (venue.parkBudget !== 'legacy') { started += span; if (venue.hold) venue.hold.since += span; }
        venue.resumeAwaitingBake = venue.parkBudget !== 'legacy'; // the first capture after a window must follow a bake fired after the resume
        // C2-FIX1 A(ii) (land16 attempt 5 — the FULL capture — capture-studiofail): the gate below waits for a bake fired after the resume, but a
        // window that left NOTHING queued never fires one: a live look apply that FAILED inside it settles through gi.js settleOnError (the
        // fallback lands with no rig write) and cinelight's revert restores its snapshot by ref (no rig write either) — the parked capture
        // the look change requested waited forever (venue pending, queued false; the capture tool's settle predicate exhausted every attempt;
        // pre-FIX1 and ?venueParkBudget=legacy both settle: output/lighting/l31-studiofail-repro). The resume OWES that bake: when none is
        // queued and the last one predates the resume, the resumed attempt queues it itself — exactly one; the debounce coalesces it with any
        // rig write the restore makes, and a deferred bake re-armed at the window's close (rebakePending) is left alone.
        if (venue.resumeAwaitingBake && venue.resumeBake !== 'legacy' && venue.rebakePending !== true && (venue.lastBakeAt || 0) < (venue.rigResumedAt || 0)) {
          venue.resumeBakeOwed = (venue.resumeBakeOwed || 0) + 1; scheduleRebake();
        }
      }
      if (venue.resumeAwaitingBake) {
        // (refuter P2, belt and braces) whatever the budget says, no capture until the post-resume bake has FIRED: the deferred bake is
        // re-scheduled at the window's close and lands after cinelight's restore; a capture before it would read the pre-export cube
        if (!((venue.lastBakeAt || 0) >= (venue.rigResumedAt || 0)) || venue.rebakePending) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        venue.resumeAwaitingBake = false; venue.resumeCaptureAfterBake = (venue.resumeCaptureAfterBake || 0) + 1;
      }
      const elapsed = performance.now() - started;
      if (venue.settleMode === 'legacy') {
        const giOk = !gi || (gi.state?.ready && (gi.state.appliedSeq ?? 0) >= 1) || elapsed > 4000;
        if (!giOk) { venue.timer = setTimeout(attempt, 100); return; }
        if (!settledAt) settledAt = performance.now();
        if (performance.now() - settledAt < 800) { venue.timer = setTimeout(attempt, 100); return; }
      } else {
        // ORDER-LIGHT-FIX5 P2#1 (review r9): a GI apply is an EVENT the capture waits for, not a time window. Before: an
        // apply slower than the 15 s window was captured AGAINST (giSettled false) and its later completion — floor
        // lightmap, hemi, ball probes, uGiOn — never re-scheduled the capture: a stale probe for the rest of the boot.
        // Now the term is HELD while the apply is outstanding: nothing is accepted; the bounded conditions (rig quiet,
        // fade settled, cube current) keep their window from the moment the apply lands. `?venueGiWait=timeout` = the
        // pre-FIX5 rule (the arm). ORDER-LIGHT-COMPANION: the table-owned probe is NOT put back during the hold (it stays
        // suppressed — no fill until the apply lands or the hold expires into the full degrade, see enterHold).
        if (!giIdle()) {
          if (elapsed < VENUE_GI_WINDOW_MS && !venue.hold) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; } // inside the window: the bounded wait, as before
          // the TIMED-OUT path (or a hold already in force): refuse the capture and hold until the apply completes
          if (venue.giWait === 'hold') {
            // ORDER-LIGHT-FIX7 (review r11 P2, lightingvisuals.js:1282): the hold is BOUNDED by the same budget as the settle window
            // (VENUE_GI_WINDOW_MS — FIX5's one constant, not a second one). A GI request that stalls without rejecting (giIdle() never
            // true) used to reschedule the hold forever: venue.pending stayed true, venueSettled() gated __test.ready and the boot sat
            // behind the loading overlay. ORDER-LIGHT-COMPANION (review r12 P2): on expiry the venue path DEGRADES to off for this table
            // through main.js's one degradeVenue (degradeOnHoldTimeout: probe, dressing, shading together — never the 9.91 probe under
            // the class room), readiness is released and the census records gi-hold-timeout by name; a degraded boot stays legacy (FIX7's
            // late-completion watch is superseded). `?venueGiHold=forever` = the pre-FIX7 rule (the arm).
            if (venue.hold && venue.giHold !== 'forever' && performance.now() - venue.hold.since >= VENUE_GI_WINDOW_MS) { degradeOnHoldTimeout(elapsed); return; }
            enterHold('GI apply outstanding past the ' + VENUE_GI_WINDOW_MS + ' ms settle window: the venue term is HELD (the table-owned probe stays suppressed, no fill) until the apply completes or the hold expires into the degrade (venue OFF for this table)'); return;
          }
        } else if (venue.hold) {
          venue.heldMs = Math.round(performance.now() - venue.hold.since); venue.hold = null; started = performance.now();
          suppressLegacy(venue.holdLegacy);
        }
        // C2-FIX5 E3: the probe is captured inside the lamp-fade suspension (captureVenueProbe), so the fade wait and the post-fade bake are the
        // legacy rule's alone (`?venueProbeFade=legacy`); the shipped rule waits for the rig's bake only
        const fadeLaw = venue.probeFade === 'legacy';
        // ORDER-LIGHT-C2-FIX6 class H (review r8 P2, lightingvisuals.js:1443-1444): the bake-completion gate reads the BAKE state, never the clock — a
        // queued rebake (its debounce timer armed, or the bake in flight) is waited for past the settle budget too (it fires within its own debounce);
        // only a bake that CANNOT fire by itself past the budget — held (?venueDebounce=hold) or deferred by an open studio window with nothing to
        // re-arm it — degrades the venue path BY NAME (settle-budget-bake-held), recorded in the census, never accepted as a converged probe.
        // `?venueAccept=legacy` = the 5667a488 rule (the clock released the gate: the review sequence — accept at +50 ms from the same cube, the
        // queued bake at +120 ms changes the environment, the accepted probe is stale).
        const bakeQueued = () => venue.rebakePending === true || rebakeTimer !== 0 || venue.heldRebake === true;
        const stallMs = venue.stallMs || 0; const elapsedEff = (performance.now() - started) - stallMs; // H3: loop-available time — main-thread stalls the loop could not poll through are not the loop's wait
        const pastBudget = elapsedEff >= VENUE_GI_WINDOW_MS;
        if (venue.acceptMode === 'legacy') {
          if ((!rigQuiet() || (fadeLaw && (!fadeSettled() || !cubeCurrent()))) && !pastBudget) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        } else if (venue.acceptMode === 'fix6') {
          // C2-FIX7 H2-4 plant: the 7a522bd2 rule — only a bake that CANNOT fire by itself degrades at the budget; a timer-armed bake is waited for
          if (bakeQueued() && pastBudget && rebakeTimer === 0 && (venue.heldRebake === true || venue.rebakeDeferred === true)) { degradeOnBudgetBake(elapsed, 'held'); return; }
          if (bakeQueued() || (fadeLaw && (!fadeSettled() || !cubeCurrent()) && !pastBudget)) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        } else if (venue.acceptMode === 'fix7') {
          // C2-FIX8 H3-4 plant: the fadd4ecb (H2) rule — ANY queued bake at the budget degrades by name; it made the undocumented budget the arbiter of
          // whether a shipped boot has venue lighting (the maintainer's 15:09Z field witness; 7 of 222 shipped-form cells cross 15 s on this box)
          if (bakeQueued()) { if (pastBudget) { venue.h3.cls = 'fix7-plant'; venue.h3.why = 'fix7: any queued bake at the budget'; degradeOnBudgetBake(elapsed, 'pending'); return; } venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
          if (fadeLaw && (!fadeSettled() || !cubeCurrent()) && !pastBudget) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        } else {
          // ORDER-LIGHT-C2-FIX8 class H3 — the ONE-OWED-SCHEDULE rule (ruling (B)): inside the budget a queued bake is waited for. At the first decision
          // point PAST the budget the scheduled rebake pending there (any origin, its ETA known from the schedule) is OWED: it is waited for, bounded by
          // its due time + the longest bake FRAME measured in this apply + one poll. When that bake lands and the loop must re-arm AGAIN past the budget,
          // the venue path degrades BY NAME at that first re-arm — the ONE-OWED-SCHEDULE POLICY of ruling (B) (2026-09-13; main.js VENUE_GI_WINDOW_MS):
          // the shipped loop's further rounds are bounded too (VENUE_CONVERGE_MAX rounds × a schedule + a bake each), so the cut at one owed schedule is a
          // DECLARED policy, not a derivation from the loop model (C2-FIX9 N6a, refuter law F2). A held / window-deferred bake has no schedule → unbounded at the budget (H2 as built);
          // a schedule marked unbounded (the H3-3 plant) is not owed. The census carries class / bound / wait / rounds past the budget per boot.
          if (bakeQueued()) {
            if (!pastBudget) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
            const nowT = performance.now(); const sch = venue.rebakeSched; const H = venue.h3;
            if (venue.heldRebake === true || venue.rebakeDeferred === true) { H.cls = 'unbounded'; H.why = venue.heldRebake ? 'held: no schedule' : 'window-deferred: no schedule'; degradeOnBudgetBake(elapsed, 'pending'); return; }
            if (!H.owed) {
              if (sch && sch.bounded && rebakeTimer !== 0) {
                // C2-FIX9 N5 (refuter law F4): the bound uses the bake's FRAME cost (the rAF gap that carried it, measured by the E1 sampler) — the CPU submit
                // (bakes[].ms, ~2 ms) is not the landing; both are recorded (bakeCpuMs / bakeFrameMs) and bakeEstMs is the larger
                const estCpu = venue.bakes.reduce((m, b) => Math.max(m, b.ms || 0), 0); const estFrame = venue.bakes.reduce((m, b) => Math.max(m, b.frameMs || 0), 0); const est = Math.max(estCpu, estFrame);
                H.owed = { seq: sch.seq, armedMs: Math.round(sch.armedAt - started), dueMs: Math.round(sch.dueAt - started), delayMs: sch.delayMs, bakeEstMs: est, bakeCpuMs: estCpu, bakeFrameMs: estFrame, stallAtOwedMs: Math.round(stallMs), source: sch.source };
                H.cls = 'bounded'; H.boundMs = H.owed.dueMs + est + VENUE_POLL_MS; H.why = 'owed: the schedule pending at the first post-budget decision';
                if (venue.stallStraddleMs > 0 && !venue.stallPlant) { // the h3stallstraddle arm seam: ONE synchronous busy loop straddling the owed due (refuter law F1's smoke, declared)
                  const ms = venue.stallStraddleMs, at = sch.dueAt - 300; venue.stallPlant = { ms, dueMs: H.owed.dueMs, plannedMs: Math.round(at - started), startedMs: null, endedMs: null, ran: 0 };
                  setTimeout(() => { const s0 = performance.now(); venue.stallPlant.startedMs = Math.round(s0 - started); while (performance.now() - s0 < ms) { /* a main-thread stall across the owed due */ } venue.stallPlant.endedMs = Math.round(performance.now() - started); venue.stallPlant.ran = 1; }, Math.max(0, at - performance.now()));
                }
              } else { H.cls = 'unbounded'; H.why = sch ? (sch.bounded ? 'no timer armed for the pending bake' : 'the schedule is marked unbounded (H3-3 plant)') : 'no schedule for the pending bake'; degradeOnBudgetBake(elapsed, 'pending'); return; }
            }
            if (sch && sch.seq === H.owed.seq) {
              // C2-FIX9 N3 (refuter law F1; its smoke: a 900 ms main-thread hitch straddling dueAt made the delayed poll run before the rebake timer task and
              // the owed timer was degraded as "overran" — bake 2 never fired): the owed schedule is judged on the SAME clock as pastBudget (loop-available
              // time past its due), and a timer that is still ARMED is pending by definition — it fires in the next task, a setTimeout is never lost — never
              // overrun. Only a pending bake with NO timer armed and NO bake landed past its due (in loop-available time) is unbounded here; the held /
              // deferred cases were classed above. `?venueOwedClock=wall` = the 6a076a6d rule (wall clock, no armed test) — the arm.
              const armed = rebakeTimer !== 0; const pastDueEff = (nowT - sch.dueAt) - (stallMs - (H.owed.stallAtOwedMs || 0));
              const stillPending = venue.owedClockMode === 'wall' ? (nowT <= sch.dueAt + 50) : (armed || pastDueEff <= VENUE_POLL_MS);
              if (stillPending) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
              H.cls = 'unbounded'; H.why = venue.owedClockMode === 'wall' ? 'the owed timer overran its due time (wall clock, 6a076a6d rule)' : 'the owed schedule is past due in loop-available time with no timer armed and no bake landed'; degradeOnBudgetBake(elapsed, 'pending'); return;
            }
            H.rounds = (H.rounds || 0) + 1; H.cls = 'unbounded'; H.why = 'the loop re-armed past the budget after its owed schedule landed'; degradeOnBudgetBake(elapsed, 'pending'); return;
          }
          if (fadeLaw && (!fadeSettled() || !cubeCurrent()) && !pastBudget) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        }
      }
      const before = giSeq();
      const cap = captureVenueProbe();
      if (!cap) {
        // P2-b (belt and braces): a capture that could not run leaves NOTHING suppressed or hooked behind
        restoreSuppressed(); const un = venue.hookMode === 'leak' ? 0 : unhookAll();
        venue.sh = null; writeVenueUniform();
        venue.applied = { derived: false, sh: null, error: venue.derivableReason || 'no renderer', captureError: venue.captureError, unhooked: un }; venue.pending = false;
        if (venue.samplerMode !== 'legacy') stopFrameSampler(); // C2-FIX9 N2 (c): the runtime capture failure ends the apply — and its sampler
        // FIX4: a RUNTIME failure hands over to main.js's one degradeVenue (the init-time case main.js already handled itself)
        if (venue.captureError && !venue.degradeSignalled && typeof onDegrade === 'function') { venue.degradeSignalled = true; try { onDegrade(venue.derivableReason); } catch { /* the degrade must not throw back into the timer */ } }
        return;
      }
      const after = giSeq();
      if (venue.settleMode !== 'legacy' && (after.started !== before.started || after.completed !== before.completed)) {
        if (retries++ < 5) { venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; } // a GI apply moved under the capture: capture again
        // FIX5 P2#1: five captures in a row raced a moving GI apply — never accept against it: hold (stillness restarts) and resume
        // when it lands (`?venueGiWait=timeout` = the pre-FIX5 rule: accept the sixth capture regardless)
        if (venue.giWait === 'hold' && !giIdle()) { venue.pendingCap = null; enterHold('GI apply kept moving under five captures: the venue probe is HELD until it completes'); return; }
      }
      if (venue.settleMode !== 'legacy') {
        // convergence on the quantity (see VENUE_CONVERGE_REL): every round re-bakes the env cube and re-captures the
        // room-only probe; accept when consecutive rounds agree to the relative tolerance (or the bounded maximum ran)
        const prev = venue.pendingCap; const cur = shFlat(cap);
        if (!prev) { venue.pendingCap = { sh: cur, n: 0 }; scheduleRebake(); venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        const d = maxAbsDelta(prev.sh, cur); const rel = d / Math.max(maxAbs(prev.sh), 1e-9);
        const tol = venue.convergeMode === 'strict' ? 0 : VENUE_CONVERGE_REL, maxR = venue.convergeMode === 'off' ? 1 : VENUE_CONVERGE_MAX;
        if (rel > tol && prev.n + 1 < maxR) { venue.pendingCap = { sh: cur, n: prev.n + 1 }; scheduleRebake(); venue.timer = setTimeout(attempt, VENUE_POLL_MS); return; }
        // C2-FIX6 H: the acceptance trace — a bake pending / queued / held at this instant is the finding (0 on the shipped rule by construction)
        { const q = venue.rebakePending === true, tm = rebakeTimer !== 0, hd = venue.heldRebake === true;
          venue.accepts.push({ t: Math.round(performance.now() - venue.applyStartedAt), rel, n: prev.n + 1, pending: q ? 1 : 0, queued: tm ? 1 : 0, held: hd ? 1 : 0, bakeSeq: venue.bakes.length, pastBudgetWall: (performance.now() - started) >= VENUE_GI_WINDOW_MS ? 1 : 0, pastBudgetEff: ((performance.now() - started) - (venue.stallMs || 0)) >= VENUE_GI_WINDOW_MS ? 1 : 0 }); // C2-FIX9 N4 (refuter law F6): one word, one clock — the gate judges the EFFECTIVE one, the wall one is recorded beside it
          if (venue.accepts.length > 32) venue.accepts.shift();
          if (q || tm || hd) { venue.acceptWhileQueued++; venue.staleWatch = { sh: cur.slice(), at: performance.now(), bakeSeq: venue.bakes.length }; } }
        // confirmations = rounds after the first capture = post-settle bakes beyond the first; lastDelta absolute, lastDeltaRel relative
        venue.stillness = { confirmations: prev.n + 1, bakes: prev.n + 2, lastDelta: d, lastDeltaRel: rel, settled: rel <= tol, tol, max: maxR, mode: venue.convergeMode };
        venue.pendingCap = null;
      }
      venue.capturedAt = performance.now(); stopFrameSampler(); // C2-FIX5 E1
      venue.sh = cap.sh.coefficients.flatMap((v) => [v.x, v.y, v.z]);
      writeVenueUniform();
      const hooked = hookUnbaked();
      venue.pending = false;
      venue.budgetDegradeRecord = null; // C2-FIX7 H2: a successful derivation retires the durable degrade record
      venue.applied = { tableId: tableMod.activeTableId?.() ?? null, fixture: state.fixture, look: state.look,
        derived: true, sh: cap.coeffs, E: cap.E, res: cap.res, pos: cap.pos, mode: cap.mode, supersedes: sup ?? null,
        gain: venue.gain, scope: 'unbaked (balls, cue): the ROOM term only — the bake owns the cloth bounce', hooked, arm: venue.arm,
        stallMs: Math.round(venue.stallMs || 0), waitedEffMs: Math.round(elapsed - (venue.stallMs || 0)),
        h3Class: (venue.h3 || {}).cls ?? 'within-budget', h3BoundMs: (venue.h3 || {}).boundMs ?? null, h3Rounds: (venue.h3 || {}).rounds ?? 0, h3Why: (venue.h3 || {}).why ?? null, h3Owed: (venue.h3 || {}).owed ? JSON.stringify((venue.h3 || {}).owed) : null,
        settle: venue.settleMode, hookMode: venue.hookMode, captures: venue.captures, retries, waitedMs: Math.round(elapsed), stillness: venue.stillness, fadeSettledAt: Math.round(venue.fadeSettledAt), postFadeBake: venue.postFadeBake, lampfade: lfValue(),
        giSeq: after, giSettled: giIdle(), giHeldMs: venue.heldMs, giWait: venue.giWait,
        // C2-FIX5 E1 (RECORD): the per-bake trace and the wait's decomposition — bake 1 / bake 2 cost, whether bake 1 compiled programs (cold),
        // the longest RAF gap inside the wait, the idle tail from the last bake to the capture; E3: which probe-fade rule ran
        probeFade: venue.probeFade, bakes: venue.bakes.slice(), bakeCount: venue.bakes.length,
        bake1Ms: venue.bakes[0] ? venue.bakes[0].ms : null, bake2Ms: venue.bakes[1] ? venue.bakes[1].ms : null, bakeCold1: venue.bakes[0] ? venue.bakes[0].cold : null,
        longestFrameMs: Math.round(venue.longestFrameMs), idleTailMs: Math.round(venue.capturedAt - (venue.lastBakeAt || venue.capturedAt)),
        applyStartedAt: Math.round(venue.applyStartedAt), capturedAt: Math.round(venue.capturedAt), tailPolls: venue.tailPolls | 0,
        // C2-FIX6 H: the acceptance trace and its counters (acceptWhileQueued 0 on the shipped rule by construction; the legacy arm's stale probe is
        // quantified by staleProbeRel once the queued bake fires — written onto this record by fireRebake)
        acceptMode: venue.acceptMode, accepts: venue.accepts.slice(), acceptWhileQueued: venue.acceptWhileQueued, budgetDegrade: venue.budgetDegrade, staleProbeRel: venue.staleProbeRel };
    };
    venue.attempt = attempt; // FIX5 P2#1: enterHold re-schedules the CURRENT apply's attempt
    venue.timer = setTimeout(attempt, VENUE_POLL_MS);
  }

  /** GH-490 round-12 class key trim: the ACTIVE table class's
   * CLASS_FIXTURES entry may carry a keyTrim that scales the rig ONLY
   * while that class is under its own venue fixture (gestalt gap (f)
   * — the chinese8 macro key). Every other class/fixture combination
   * reads 1 (identity — the pre-490 numbers byte-hold). GH-1202: `fx` is the
   * fixture trimmed (callers pass the one that hangs). */
  function keyTrim(fx) {
    // review r12-r1 P2: the trim is VENUE-DEFAULT semantics only — an
    // explicit fixture pick keeps the catalog's untrimmed numbers
    // ("the user hung that lamp on purpose", GH-386 law)
    if (!state.auto) return 1;
    const k = tableMod.specFor?.(tableMod.activeTableId?.())?.kernel;
    if (!k) return 1;
    for (const c of CLASS_FIXTURES) {
      if (Math.abs(k.length - c.length) < 1e-6
        && Math.abs(k.width - c.width) < 1e-6) {
        if (!c.keyTrim || fx !== c.fixture) return 1;
        return (typeof c.keyTrim === 'number'
          ? c.keyTrim : c.keyTrim[state.look] ?? c.keyTrim.default) || 1;
      }
    }
    return 1;
  }

  /** Write the absolute rig for the CURRENT (fixture, brightness, look). */
  /** GH-996 (card 45): arm the ball diffuse knee (shading.js setBallKnee: T = 1.6·b, M = 2.0·b; feature-detected — a stale
   * shading.js has no knee) at the slider, or at b = 1 inside the cinelight studio window, whose rig ignores the slider. */
  function armBallKnee() {
    shadingMod.setBallKnee?.({ brightness: rigWindowOpen() ? 1 : state.brightness });
  }
  function applyValues() {
    venue.lastRigWrite = performance.now(); // ORDER-LAND-638-FIX: a rig write
    const r = room();
    if (!r) return;
    const lr = r.lightRefs;
    const fx = appliedFixture; // GH-1202: the rig that hangs (state.fixture names a staged swap's target before it lands)
    const p = lightingProfile(fx, state.brightness, state.look);
    const trim = keyTrim(fx);
    const lights = fx === 'canopy_panel'
      ? [r.rectLight] : fixtureLights;
    p.emitters.forEach((e, i) => {
      const l = lights[i];
      if (!l) return;
      l.color.setHex(e.color);
      l.intensity = e.intensity * trim;
    });
    lr.fill.intensity = p.fill * trim;
    const faces = fx === 'canopy_panel'
      ? [lr.lampFace] : fixtureFaces;
    for (const face of faces) {
      face.material.color.setRGB(...p.face.map((c) => c * trim));
    }
    // GH-975: the baked irradiance follows the centre-match gain (minus the
    // share the bake already carries) so direct and baked indirect stay in
    // the bake's own proportion under every (table, fixture)
    gi?.setGain?.(state.brightness * trim
      * matchGain(fx) / bakedMatchGain(fx));
    // GH-975: the gain this write applied — a table switch whose footprint
    // class stays (pool_pro_9ft <-> wpa_spec_9ft) can still move it
    state.appliedGain = matchGain(fx);
    armBallKnee(); // GH-996 (card 45): the ball diffuse knee follows the slider
    // venue fill: re-derive the probe for the applied rig (async, GI-settled)
    applyVenue();
    // GH-489 PASS-2 CURE (boot bloom halo): the bloom kill tracks the
    // applied rig — see postfx.js __obBloom (feature-detected; review
    // pass2-r2 P2: fixture-scoped — the halo mechanism is the XW101
    // brass-glint family under the re-lit snooker rig, so pool/carom
    // user-brightness stays untouched).
    // review pass2-r6 P1: the class comes from the ACTIVE TABLE, never
    // the async GI state — on a cold boot (or ?nogi) gi.state.bakeClass
    // is null/stale when applyValues runs and nothing retracks after
    // GI settles; activeTableId is synchronous with every equipment
    // switch (tableChanged() re-runs applyValues on the snooker
    // oneTableGain path).
    // (Merge fold: keyTrim is class-scoped to the chinese8 venue key —
    // trim === 1 on the snooker rig, so the tracked brightness equals
    // the 489-audited value there.)
    window.__obBloom?.track?.(state.brightness, fx,
      tableMod.activeTableId?.() === 'wpbsa_snooker_12ft'
        ? 'snooker_12ft' : null);
  }

  // GH-1202: the fixture pair's snapshot helpers (the emitter uniforms, the rig group's child slots)
  const cloneVecs = (u) => (u && Array.isArray(u.value) ? u.value.map((v) => v.clone()) : null);
  function snapEmitters() {
    return { pos: shared.uLightPos.value.clone(), posN: cloneVecs(shared.uLightPosN), half: shared.uLightHalf?.value?.clone?.() ?? null,
      halfN: cloneVecs(shared.uLightHalfN), count: shared.uLightCount?.value, spike: shadingMod.SPIKE_EMITTERS?.count };
  }
  function restoreEmitters(e) {
    shared.uLightPos.value.copy(e.pos);
    if (e.posN) e.posN.forEach((v, i) => shared.uLightPosN.value[i].copy(v));
    if (e.half) shared.uLightHalf.value.copy(e.half);
    if (e.halfN) e.halfN.forEach((v, i) => shared.uLightHalfN.value[i].copy(v));
    if (e.count !== undefined) shared.uLightCount.value = e.count;
    if (shadingMod.SPIKE_EMITTERS && e.spike !== undefined) shadingMod.SPIKE_EMITTERS.count = e.spike;
  }
  // detach children of the rig group, recording each one's slot at its removal, and put them back in reverse order, so every
  // child returns to its slot (the light order is the uniform order of the lit programs)
  function detachFrom(group, objs) {
    const out = [];
    for (const o of objs) { const idx = group.children.indexOf(o); if (idx >= 0) { out.push([o, idx]); group.remove(o); } }
    return out;
  }
  function reattachTo(group, recs) {
    for (const [o, idx] of recs.slice().reverse()) {
      group.add(o);
      const a = group.children;
      a.splice(a.indexOf(o), 1);
      a.splice(Math.min(idx, a.length), 0, o);
    }
  }

  /** The swap to `next` as an exact apply / revert pair (GH-1202). The new fixture's meshes and RectAreaLights are built here,
   * detached. What the swap replaces is read at each apply(), because main serializes staged changes and the rig hanging then is
   * the one this change really replaces. commit() runs once, after the real swap. */
  function fixtureChange(r, next) {
    const lr = r.lightRefs;
    const canopy = next === 'canopy_panel';
    const f = rigFor(next);
    const set = { group: null, lights: [], faces: [] };
    if (!canopy) {
      const built = MESH_BUILDERS[next](f);
      set.group = built.group;
      set.group.userData.obVenueClass = 'fixture'; // programs-census class tag (object userData, not identity)
      set.faces = built.faces;
      for (const e of f.emitters) {
        const l = new THREE.RectAreaLight(0xffffff, 1, e.w, e.d);
        l.position.set(e.x, e.y, e.z);
        l.lookAt(e.x, 0, e.z);
        set.lights.push(l);
      }
    }
    // analytic shadow/sheen emitter topology (compile-time in shading.js;
    // stale shading.js without setEmitters degrades to the centroid write).
    // GH-385: per-emitter footprint half-extents feed the derived area-
    // source penumbra (a stale shading.js simply ignores the extra arg).
    const positions = f.emitters.map((e) => new THREE.Vector3(e.x, e.y, e.z));
    const halves = f.emitters.map((e) => new THREE.Vector2(e.w / 2, e.d / 2));
    const writeEmitters = () => {
      if (shadingMod.setEmitters) {
        shadingMod.setEmitters(shared, positions, halves);
      } else if (positions.length === 1) {
        shared.uLightPos.value.copy(positions[0]);
      } else {
        const c = new THREE.Vector3();
        for (const q of positions) c.add(q);
        shared.uLightPos.value.copy(c.multiplyScalar(1 / positions.length));
      }
    };
    let prev = null, replaced = null;
    const release = () => { if (replaced && replaced !== fixtureGroup) disposeGroup(replaced); };
    return {
      apply() {
        if (prev) return;
        prev = { group: fixtureGroup, lights: fixtureLights, faces: fixtureFaces, fixture: appliedFixture, rectLights: lr.rectLights,
          vis: [lr.lampFace.visible, lr.hood.visible, lr.rods.map((rod) => rod.visible), r.rectLight.visible],
          emitters: snapEmitters(), roomMaxY: shared.uRoomMax.value.y,
          slots: detachFrom(lr.group, [fixtureGroup, ...fixtureLights].filter(Boolean)) };
        replaced = prev.group;
        // canopy meshes + light: visibility-toggled, never rebuilt (identity)
        lr.lampFace.visible = canopy;
        lr.hood.visible = canopy;
        for (const rod of lr.rods) rod.visible = canopy;
        r.rectLight.visible = canopy;
        if (set.group) lr.group.add(set.group);
        for (const l of set.lights) lr.group.add(l);
        fixtureGroup = set.group;
        fixtureLights = set.lights.slice();
        fixtureFaces = set.faces;
        // look.js regrades whatever THIS array holds (explicit-refs contract)
        lr.rectLights = canopy ? [r.rectLight] : set.lights.slice();
        writeEmitters();
        recompileSpike(scene);
        // box-projected reflections: the parallax box TOP is the emitter plane
        // (room.js ROOM law) — crowns anchor the new fixture correctly
        shared.uRoomMax.value.y = f.emitters[0].y;
        appliedFixture = next;
      },
      revert() {
        if (!prev) return;
        detachFrom(lr.group, [set.group, ...set.lights].filter(Boolean));
        lr.lampFace.visible = prev.vis[0];
        lr.hood.visible = prev.vis[1];
        lr.rods.forEach((rod, i) => { rod.visible = prev.vis[2][i]; });
        r.rectLight.visible = prev.vis[3];
        reattachTo(lr.group, prev.slots);
        fixtureGroup = prev.group;
        fixtureLights = prev.lights;
        fixtureFaces = prev.faces;
        lr.rectLights = prev.rectLights;
        restoreEmitters(prev.emitters);
        recompileSpike(scene);
        shared.uRoomMax.value.y = prev.roomMaxY;
        appliedFixture = prev.fixture;
        prev = null;
      },
      applied: () => !!prev,
      /** after the real swap: the replaced non-canopy fixture's meshes go, and the baked GI re-keys to the new fixture
       * (per-fixture baked-GI dimension + honesty gate inside gi.js) */
      commit() {
        release();
        gi?.setFixture?.(next);
      },
      /** a swap that hung, then went stale (a swap applied at once replaced it): only the meshes it replaced go */
      release,
      /** a stale swap that never hung: its detached meshes go */
      discard() { if (!prev && set.group) disposeGroup(set.group); },
    };
  }

  /** Swap the visible fixture + emitter set (staged when main offers the seam, GH-1202). `then` is the caller's follow-up —
   * the values, the GI gain and the env re-bake — and runs once, after the real swap. */
  function applyFixture(next, then) {
    const r = room();
    if (!r) { if (then) then(); return; }
    venue.lastRigWrite = performance.now(); // ORDER-LAND-638-FIX: a rig write
    const change = fixtureChange(r, next);
    state.fixture = next; // the target at once (no-op guards and state() read it); appliedFixture follows the real swap
    const follow = () => { change.commit(); if (then) then(); };
    const seam = atOnce ? null : stageSeam();
    if (!seam) { epoch.rig++; change.apply(); follow(); return; }
    stageLightSet(seam, 'rig', change, (fresh, late) => {
      if (!fresh) { if (change.applied()) change.release(); else change.discard(); return; }
      follow();
      // a swap main staged lands after the settings broadcast: announce it on main.js's async-repaint wire, so readers of the
      // installed rig (the shell's glare dim, table.js's snooker lamp gate, previewink, the atelier readout) re-read it. An
      // 'immediate' one landed inside the call, before the broadcast, as an unstaged swap does
      if (late) window.dispatchEvent(new CustomEvent('ob:relight'));
    }, 'lighting:rig ' + next);
  }

  /** Re-write the venue term for the current state. */
  function venueReapply() {
    if (!room()) return;
    applyVenue();
  }

  // ORDER-LIGHT-C2-FIX9 state surface (read by state().venue on both branches): N1 the studio gate + the uniform's L1 norm (0 inside the window under the
  // gate, > 0 in gameplay when derived); N2 the sampler's life (active handle, ticks, ticks since the last stop — 0 when every terminal path stopped it);
  // N3 the owed-clock rule in force; the arm plants (stall straddle, cancel) with their stamps; N5 per-bake frame cost rides venue.bakes[].frameMs.
  function fix9State() {
    let l1 = 0; try { const u = venue.uniform && venue.uniform.value; if (u) for (let i = 0; i < u.length; i++) l1 += Math.abs(u[i]); } catch { l1 = -1; }
    return { studioGated: venue.studioGated === true, studioGateMode: venue.studioGateMode, uniformL1: Number(l1.toFixed(6)),
      samplerActive: venue.frameSampler !== 0, samplerTicks: venue.samplerTicks || 0, samplerTicksSinceStop: Math.max(0, (venue.samplerTicks || 0) - (venue.samplerTicksAtStop || 0)), samplerMode: venue.samplerMode,
      owedClockMode: venue.owedClockMode, stallPlant: venue.stallPlant || null, cancelPlant: venue.cancelPlant || null,
      ballHideMode: venue.ballHideMode, ballLiftM: venue.ballLiftM || 0, ballLiftApplied: venue.ballLiftApplied || 0, hiddenBalls: venue.hiddenBalls || 0, hiddenBallsAbove: venue.hiddenBallsAbove || 0,
      bakeFrames: venue.bakes.map((b) => (b.frameMs == null ? null : b.frameMs)) };
  }

  const api = {
    /** Settings side effect (settings.js set('fixture'/'brightness')).
     * `nextFixture === 'auto'` (GH-386) selects the venue default for the
     * ACTIVE table class and re-arms class-following (tableChanged). */
    apply(nextFixture, nextBrightness) {
      const wantAuto = nextFixture === 'auto';
      const fx = wantAuto ? classDefaultFixture()
        : FIXTURES[nextFixture] ? nextFixture : 'canopy_panel';
      const b = clampBrightness(nextBrightness);
      const prevAuto = state.auto;
      state.auto = wantAuto; // bookkeeping only — safe before the no-op guards
      // GH-490 (review r5): (re)arming auto refreshes the tracked class —
      // explicit-mode table switches never rebake, so the env bake can
      // mirror an OLDER table even when the fixture id is a no-op here
      // (cn8 auto → explicit → class switch → auto again). A stale klass
      // would then suppress the next shared-fixture tableChanged rebake.
      if (wantAuto && room()) {
        const klass = currentKlass();
        if (klass !== state.klass) {
          state.klass = klass;
          // same-fixture no-op below: the bake still needs the refresh;
          // a fixture change falls through to applyFixture + rebake.
          if (fx === state.fixture) scheduleRebake();
        }
      }
      if (fx === state.fixture && b === state.brightness) {
        // GH-490 round-12 (review r12-r1 P2): flipping auto <-> explicit
        // on the SAME fixture moves the class key trim's scope — the
        // rig values must re-write here or an explicit pick would stay
        // venue-trimmed through the no-op guard (and vice versa). The
        // untouched identity default never reaches this (trim 1 -> 1).
        if (prevAuto !== wantAuto && state.touched && room()) {
          applyValues();
          scheduleRebake();
        }
        return true;
      }
      if (!state.touched && fx === 'canopy_panel' && b === 1) return true;
      if (!room()) return false;
      state.touched = true;
      state.klass = currentKlass(); // the fresh bake mirrors THIS table
      state.brightness = b;
      // GH-1202: the values and the re-bake follow the real swap (at once without main's staging seam)
      const follow = () => { applyValues(); scheduleRebake(); };
      if (fx !== state.fixture) applyFixture(fx, follow); else follow();
      return true;
    },
    /** GH-386 class-follow seam (scene/table.js rebuild, feature-detected):
     * in venue-default mode a live table switch re-hangs the class's own
     * lamp (rig + emitters + gi fixture re-key + env rebake). An explicit
     * fixture choice never moves — the user hung that lamp on purpose. */
    tableChanged() {
      venue.lastRigWrite = performance.now(); // ORDER-LAND-638-FIX: an equipment broadcast is a rig write
      // venue term: a table rebuild re-creates any superseded table-owned
      // probe at its build literal and may change the table id the term is
      // keyed on — re-write it on EVERY equipment broadcast (idempotent).
      // Runs after the paths below settle the fixture; see venueReapply.
      const now = atOnce > 0; // GH-1202: a rebuild's venue term lands at once too (see api.tableChanged below)
      // (never inside the studio window: a reapply that comes due there waits for its close, then lands as decided here)
      const reapply = () => { if (rigWindowOpen()) { parked.push(reapply); return; } if (now) atOnce++; try { venueReapply(); } catch { /* ok */ } finally { if (now) atOnce--; } };
      queueMicrotask(reapply);
      if (!state.auto) {
        // GH-975: the applied intensity depends on the ACTIVE table
        // (MATCH_GAINS rows are per table), so a switch under an explicit
        // fixture must re-apply the profile and re-bake the env whenever the
        // footprint class OR the match gain moves — two tables can share a
        // footprint and differ in gain (review r1 P2: pool_pro_9ft ->
        // wpa_spec_9ft kept the pendant at 0.9344 instead of 0.7673). An
        // untouched identity default whose gain stays 1 stays a no-op.
        const klass = currentKlass();
        const classMoved = klass !== state.klass;
        // (GH-1202: a staged swap's follow-up writes the values for the table active when it lands)
        const gainMoved = appliedFixture === state.fixture && matchGain(state.fixture) !== (state.appliedGain ?? 1);
        if ((classMoved || gainMoved) && room()) {
          state.klass = klass;
          if (state.touched || gainMoved) {
            state.touched = true;
            const follow = () => { applyValues(); scheduleRebake(); };
            // a table-scaled rig is re-hung for the new bed
            if (classMoved && FIXTURES[state.fixture]?.scalesWithTable) applyFixture(state.fixture, follow); else follow();
          }
        }
        return false;
      }
      const fx = classDefaultFixture();
      const klass = currentKlass();
      if (fx === state.fixture) {
        // GH-975: the same venue rig over a table with another match gain
        // re-writes its values (the footprint test alone would keep the old
        // table's level)
        const gainMoved = appliedFixture === state.fixture && matchGain(fx) !== (state.appliedGain ?? 1);
        // GH-490 (review r4): snooker ↔ chinese8 share this venue default —
        // a class switch under the SAME fixture id previously early-returned
        // and left the env cubemap + uTableHalf on the previous table (the
        // pre-490 pairs always changed fixture here, so the rebake rode
        // applyFixture). Re-bake without re-hanging the identical rig.
        // review r9: a null klass is the BOOT reconciliation, not a class
        // transition — the boot cubemap already mirrors the boot table, so
        // adopt the class without scheduling a redundant six-face rebake.
        if (state.klass === null && !gainMoved) {
          state.klass = klass;
          return true;
        }
        if ((klass !== state.klass || gainMoved) && room()) {
          state.klass = klass;
          // GH-490 round-12: the class key trim can change across a
          // SAME-FIXTURE class switch (chinese8 <-> snooker share the
          // low-rect rig) — re-write the rig values so the trim never
          // lingers on the wrong class
          applyValues();
          scheduleRebake();
        }
        return true;
      }
      if (!room()) return false;
      // the rig moves off the identity, so later look regrades must
      // re-apply values (the `touched` contract) — not a user touch, but
      // the same compose-order obligation
      state.klass = klass;
      state.touched = true;
      applyFixture(fx, () => { applyValues(); scheduleRebake(); });
      return true;
    },
    /** look.js compose-order seam: re-scale from the NEW look's bases after
     * a regrade. Synchronous, no own rebake (applyLook's rebake follows).
     * A never-touched identity default stays a strict no-op. */
    regrade(name) {
      const next = (name === 'tournament' || name === 'sp') ? 'tournament' : 'default'; // 'sp': the legacy look id (GH-973)
      const changed = next !== state.look;
      state.look = next;
      // `touched` gates the legacy-look side effects only: a touched rig re-scales from the new look's bases (applyValues, which
      // ends in applyVenue). ORDER-LIGHT-FIX7 (review r11 P2, lightingvisuals.js:1680): an UNTOUCHED identity default (an explicit
      // canopy_panel @ 1) still owns a venue probe on a venue table, and that probe is an OUTPUT of the look — the cube camera sees
      // the regraded room — so a look change re-derives it regardless of `touched`. Every other input already re-derives: fixture and
      // brightness through apply() → applyValues → applyVenue, the table class through tableChanged() → venueReapply, the GI state
      // through the hold / watch. `?venueRegrade=touched` = the pre-FIX7 rule (the arm).
      if (state.touched) { applyValues(); return; }
      if (changed && venue.regradeMode !== 'touched') venueReapply();
    },
    /** e2e / camerapresets read surface. */
    state() {
      return {
        // GH-1202: every rig field describes the rig that HANGS, as before the seam: lampfade's bake bracket, camerascript's canopy
        // hide, the shell's glare signature and table.js's snooker lamp sync read it as the installed fixture. While a staged swap
        // waits for its programs, targetFixture already names the selection; the leaf announces ob:relight once the swap lands.
        fixture: appliedFixture,
        targetFixture: state.fixture,
        staging: { pending: stagesPending, changes: staging.changes, results: staging.results.slice(), bakes: staging.bakes.slice(), deferred: staging.deferred, parked: parked.length },
        brightness: state.brightness,
        look: state.look,
        touched: state.touched,
        auto: state.auto, // GH-386 venue-default mode
        emitters: rigFor(appliedFixture).emitters.length,
        clearanceY: FIXTURES[appliedFixture].clearanceY,
        // GH-490 round-12 (review r12-r4 P2): the ACTIVE class key trim,
        // exposed so the settings lux readout can report the EFFECTIVE
        // level instead of the untrimmed 520·b figure (feature-detected
        // consumer; 1 everywhere the trim is inert)
        keyTrim: keyTrim(appliedFixture),
        // class-scoped ONE-TABLE gain in effect (489 corner graft, review
        // graft-r4 P2): 1 everywhere the 520-lux WPA readout stays a
        // lawful claim; ≠ 1 on the photo-fit venue, where settings.js
        // syncBrightnessLux drops the lux claim for the ×b readout
        oneTableGain: oneTableGain(),
        // GH-975: the centre-match key + gain in effect (read-only census)
        matchKey: matchKey(),
        matchGain: matchGain(appliedFixture),
        // ORDER-LIGHT-FIX5 P1: the LUT leaf law (bound before createShared, or the fallback with its reason)
        occLut: shadingMod.occlusionLutState?.() ?? null,
        // GH-996: the ball diffuse knee's armed thresholds and its compile gate (shading.js ballKneeState; null on a stale shading.js)
        ballKnee: shadingMod.ballKneeState?.() ?? null,
        // venue fill term in effect (venue-lighting lane): null = identity
        venue: venue.applied ? { ...venue.applied, ...(venue.budgetDegradeRecord || {}), on: venue.on, all: venue.all, gain: venue.gain, pending: venue.pending || stagesPending > 0 || (venue.readinessMode !== 'legacy' && venue.rebakePending === true), capturePending: venue.pending, rebakeQueued: venue.rebakePending === true, readinessMode: venue.readinessMode, debounceMode: venue.debounceMode,
            rigWindow: venue.rigWindow === true, ...fix9State(), rebakeDeferred: venue.rebakeDeferred === true, rigWindowDeferrals: venue.rigWindowDeferrals || 0, rigParked: venue.rigParked || 0, rigResumedAt: venue.rigResumedAt || 0, parkedMs: Math.round(venue.parkedMs || 0), parkBudget: venue.parkBudget, resumeCaptureAfterBake: venue.resumeCaptureAfterBake || 0, resumeBake: venue.resumeBake, resumeBakeOwed: venue.resumeBakeOwed || 0, lastBakeAt: Math.round(venue.lastBakeAt || 0), convergeRel: VENUE_CONVERGE_REL, protocol: venue.protocol, giHoldTimedOut: venue.giHoldTimedOut, giHold: venue.giHold, regradeMode: venue.regradeMode, budgetMs: VENUE_GI_WINDOW_MS, derivable: venue.derivable, derivableReason: venue.derivableReason || null, captureError: venue.captureError || null, nogi: venue.nogi, hold: venue.hold, giWait: venue.giWait, giHeldMs: venue.heldMs, readCheck: venue.readCheck, readNoop: venue.readNoop, legacyBuild: Array.from(venue.legacy.values()), suppressed: venue.suppressed ? { name: venue.suppressed.name, intensity: venue.suppressed.intensity, visible: venue.suppressed.visible } : null }
          : { ...(venue.budgetDegradeRecord || {}), on: venue.on, all: venue.all, gain: venue.gain, pending: venue.pending || stagesPending > 0 || (venue.readinessMode !== 'legacy' && venue.rebakePending === true), capturePending: venue.pending, rebakeQueued: venue.rebakePending === true, readinessMode: venue.readinessMode, debounceMode: venue.debounceMode, applied: null,
            probeMode: venue.probeMode, settle: venue.settleMode, hookMode: venue.hookMode, captures: venue.captures, unhooked: venue.lastUnhook ?? 0,
            rigWindow: venue.rigWindow === true, ...fix9State(), rebakeDeferred: venue.rebakeDeferred === true, rigWindowDeferrals: venue.rigWindowDeferrals || 0, rigParked: venue.rigParked || 0, rigResumedAt: venue.rigResumedAt || 0, parkedMs: Math.round(venue.parkedMs || 0), parkBudget: venue.parkBudget, resumeCaptureAfterBake: venue.resumeCaptureAfterBake || 0, resumeBake: venue.resumeBake, resumeBakeOwed: venue.resumeBakeOwed || 0, lastBakeAt: Math.round(venue.lastBakeAt || 0), convergeRel: VENUE_CONVERGE_REL, protocol: venue.protocol, giHoldTimedOut: venue.giHoldTimedOut, giHold: venue.giHold, regradeMode: venue.regradeMode, budgetMs: VENUE_GI_WINDOW_MS, derivable: venue.derivable, derivableReason: venue.derivableReason || null, captureError: venue.captureError || null, nogi: venue.nogi, hold: venue.hold, giWait: venue.giWait, giHeldMs: venue.heldMs, readCheck: venue.readCheck, readNoop: venue.readNoop, legacyBuild: Array.from(venue.legacy.values()), suppressed: venue.suppressed ? { name: venue.suppressed.name, intensity: venue.suppressed.intensity, visible: venue.suppressed.visible } : null },
      };
    },
    /** ORDER-LIGHT-C1 (b): the queued env re-bake — dropped by the degrade (its own loop bakes), fired on demand by a caller that must read
     * the converged cube (the arm's release). Feature-detected by main.js (a stale leaf has neither). */
    cancelRebake() { return cancelRebake(); },
    flushRebake() { return flushRebake(); },
    /** ORDER-LIGHT-C2-FIX2 class A test seam (the runtime twin of ?venueThrow=): arms the throw for the NEXT captures — the lifecycle fixture
     * plays a shot, then forces a venue-capture failure and reads the SH blocks across the degrade. null disarms. Diagnostic only. */
    armThrow(mode) { venue.throwMode = ['render', 'readback'].includes(mode) ? mode : null; return venue.throwMode; },
    /** C1 (b) arm seam (runtime twin of ?venueDebounce=hold, engaged AFTER boot so the boot's own re-bake fires): later schedules are held
     * until flushRebake / cancelRebake. Diagnostic only. */
    holdDebounce(on) { venue.debounceMode = on === false ? null : 'hold'; return venue.debounceMode; },
    /** Venue-term toggle (tools/e2e; the ?venue= flag's runtime twin). */
    setVenue(on) {
      venue.on = on !== false;
      atOnce++; // GH-1202: at once — main.js's degradeVenue bakes the env cube right after this call
      try { venueReapply(); } finally { atOnce--; }
      scheduleRebake();
      return venue.on;
    },
    /** Diagnostic scale on the derived fill's uniform (1 = as captured, 0 =
     * off) — the on/off room-mask test (ORDER-LIGHT-6 Q1b) toggles this in
     * one boot; the coefficients themselves never move. */
    setVenueFill(gain) {
      venue.gain = Number.isFinite(+gain) ? +gain : 1;
      writeVenueUniform();
      return venue.gain;
    },
    /** GH-381 occluder-fade seam (scene/lampfade.js): the ACTIVE
     * non-canopy fixture's meshes — housings, stems AND emissive faces
     * (the whole assembly dims together so no glowing panel floats
     * alone); the per-fixture fade plane already rides state().clearanceY.
     * null under the canopy (its meshes ride room.js lightRefs directly).
     * The fade module feature-detects this getter, so a stale copy here
     * degrades it to canopy-only fading (cache-poison contract). Material
     * fade properties (transparent/opacity/depthWrite/material.visible)
     * are lampfade.js-owned; this layer keeps Object3D.visible and
     * material.color — disjoint writers by property. */
    fixtureMeshes() {
      if (!fixtureGroup) return null;
      const out = [];
      fixtureGroup.traverse((o) => { if (o.isMesh) out.push(o); });
      return out;
    },
    profile: lightingProfile,
  };
  if (renderer && !venue.derivable && venue.on) console.info('[venue] law: ' + venue.derivableReason); // ORDER-LAND-638-FIX3: the one law line (info, not an error)
  if (!venue.protocol.ok) console.info('[venue] law: ' + venue.protocol.why); // ORDER-LIGHT-FIX6: the handshake verdict (info, not an error)
  // GH-1202: a rebuild commits its rig and venue term at once, in the rebuild's own task (table.js calls tableChanged right after
  // it shows the table), so no frame draws the new table under the old rig or with its re-created table-owned probe. A rebuild
  // shows as a new table id or a new superseded probe object (a rebuild that keeps the id: the retained table rebuilt after a
  // refused Chinese-8 transport); a reconcile on the same build (an equipment rebroadcast, the boot tail below) stages as usual
  const SUPERSEDED = [...new Set([...Object.values(VENUE_TERMS.byTable), ...Object.values(VENUE_TERMS.byFixture)]
    .map((t) => t?.supersedes).filter(Boolean))];
  const buildMark = () => [tableMod.activeTableId?.() ?? null, ...SUPERSEDED.map((n) => scene?.getObjectByName?.(n) ?? null)];
  let lastBuild = buildMark();
  const reconcileTable = api.tableChanged;
  api.tableChanged = function tableChanged() {
    const mark = buildMark();
    const rebuilt = mark.some((x, i) => x !== lastBuild[i]);
    lastBuild = mark;
    if (!rebuilt) return reconcileTable();
    atOnce++;
    try {
      const out = reconcileTable();
      // a swap still staged lands at once as well: its target can already be the rebuilt table's rig (the reconcile then kept it)
      if (livePending('rig')) applyFixture(state.fixture, () => { applyValues(); scheduleRebake(); });
      return out;
    } finally { atOnce--; }
  };
  window.__lighting = api;
  // boot state (main.js raw pre-boot read): apply the persisted choice once.
  // GH-386: a venue-default boot applies through the 'auto' path so the
  // class-follow mode survives the apply (main.js already resolved
  // `fixture` to the class default, so both paths hang the same lamp).
  if ((FIXTURES[fixture] && fixture !== 'canopy_panel')
    || clampBrightness(brightness) !== 1) {
    api.apply(state.auto ? 'auto' : fixture, brightness);
  }
  // GH-386 class-follow reconciliation rides the settings wire too: the
  // table.js rebuild hook alone can miss a switch that lands before this
  // module's guarded import resolves (boot race), or one whose rebuild
  // early-outs because the scene table already switched (next === built.id
  // — observed once as a mid-flight race in the e2e-equipment gi-race arm
  // under runner load). tableChanged() is idempotent and cheap (fx ===
  // state.fixture returns immediately), so every equipment broadcast —
  // real commits, transient replay specs and paint-only rebroadcasts alike
  // — simply re-checks the class. ONE lighting runtime exists per page
  // (main.js boot), so the listener never stacks.
  window.addEventListener('ob:settings', (e) => {
    if (e?.detail?.key === 'equipment') api.tableChanged();
  });
  api.tableChanged(); // reconcile a switch that beat the import
  // venue term on the boot state (the identity default never reaches
  // applyValues; a boot on a venue table with a derived term must still
  // receive it — and its superseded probe must stand down)
  venueReapply();
  armBallKnee(); // GH-996: the identity default never reaches applyValues either — arm the ball knee on the boot brightness
  return api;
}
