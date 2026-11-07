// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Equipment catalog: the unified registry of brand/environment-dependent,
//! calibration-needing parameter sets (GitHub issue #15).
//!
//! One registry replaces five scattered switching mechanisms: cushion-model
//! `SimOptions` constructors, `ClothPreset` constructors, `BallParams`
//! game-type sets, `Table::wpa_9ft` geometry, and the Diamond-brand bank
//! bias (previously only a `docs/verification/banking-report.md` finding).
//!
//! Rules (issue #15):
//! - EVERY entry carries `id`, `display_name`, `params`, and a
//!   [`Calibration`] status with a provenance pointer (no anonymous numbers,
//!   constitution P-IV).
//! - The catalog is versioned ([`CATALOG_VERSION`]) and IMMUTABLE once
//!   shipped: new measurements/calibrations get a NEW entry id (e.g.
//!   `diamond_redlabel_9ft_v2`), never a silent value change — replays and
//!   golden scenarios reference ids, so calibration updates stay diffable.
//! - ADDITIVE to the frozen kernel serde formats: the default
//!   [`EquipmentSpec`] resolves BIT-exactly to today's default pipeline
//!   (`Table::wpa_9ft(BallParams::default().r)` + `BallParams::default()` +
//!   `CueParams::default()` + `SimOptions::default()`), pinned by tests.

use crate::params::{
    BallParams, ClothPreset, CueParams, CushionFriction, CushionResponse,
};
use crate::shot::{CushionModel, SimError, SimOptions};
use crate::table::{CurvedPocketTableSpec, PocketTableSpec, Table};
use serde::{Deserialize, Serialize};

/// Catalog schema/data version. Bump ONLY when entries are added or a new
/// entry id supersedes an old one — existing entries never change values
/// (immutable-once-shipped rule above). v2: `aramith_pool_worn` ballset
/// (ball-CONDITION variant carrying a fitted μ_bb curve, issue #16
/// arbitration). v3: measured-geometry table entries `diamond_proam_9ft` +
/// `predator_apex_9ft` and the Platinum/pivot cue entries (feature 009,
/// `feature 009 (internal spec)`). v4: referenced-only catalog policy
/// (`feature 009 (internal spec)` product-owner ruling):
/// tables gain [`TableEntry::ui_hidden`]; `wpa_generic_9ft` is relabeled to
/// its honest legacy provenance (pooltool geometry measured from a 7-ft
/// Showood HOME table — the ID string is serde-frozen, so honesty lands in
/// the metadata) and leaves the user-facing picker; NEW `wpa_spec_9ft`
/// builds the WPA Equipment Specifications nominal values; and
/// `diamond_redlabel_9ft` is re-derived from the AZB 48606 community
/// measurements instead of the mislabeled pooltool geometry (the ruling
/// explicitly supersedes the immutability rule for that entry). v5: KNOWING
/// geometry change to the two Diamond entries under the referenced-only
/// ruling (same precedent as the v4 redlabel re-derivation — replays
/// pinning these ids re-simulate on the new geometry): the 2026-07-08
/// pocket-angle audit found the v3/v4 WPA-nominal facings (142°/104°)
/// justified by a falsified "no Diamond-specific number is published"
/// claim, while RKC (Glen Hancock, Diamond's table mechanic) published the
/// Diamond FACTORY cuts — corner 141°, side 102° (AZB 2010 "diamond
/// pockets" thread 184759 post #4; 2017 "Pocket angles" thread 445936) —
/// so `diamond_proam_9ft`/`diamond_redlabel_9ft` now build 141°/102°.
/// Strict-WPA 142°/104° geometry remains available via `wpa_spec_9ft`
/// (untouched); the Diamond-authentic-vs-WPA-conformant split is
/// intentional (102° falls outside WPA §9's [104°, 105°] band) and is
/// documented in the catalog-policy addendum. v6 (feature 012,
/// `the equipment-additions contract (feature 012, internal)`):
/// ADDITIVE ONLY — three discipline tables `wpbsa_snooker_12ft`,
/// `umb_carom_284` (the first pocketless geometry), `joy_q8_9ft`, plus the
/// `carom_worsted_heated` cloth; NO new ballsets or cushion-model entries
/// (snooker/carom ballsets and the Mathavan models shipped pre-012); every
/// v5 entry byte-identical (drift-pinned against
/// `tests/fixtures/catalog_v5.json`). v7 (post-012 defect fix,
/// equipment-additions.md Amendment A1 / kernel-api.md Amendment 016):
/// KNOWING geometry change to the just-shipped `wpbsa_snooker_12ft` and
/// `joy_q8_9ft` entries (v5-Diamond-repin precedent — replays pinning
/// these ids re-simulate on the new geometry): the v6 jaw radii
/// (0.0397/0.0179 m snooker, 0.0231/0.0142 m joy) were FULL-CIRCLE
/// model-limit clamps — an artifact of the span-less
/// `CircularCushionSegment` (full circles at the template's true radii
/// crossed the mouth and sealed it), NOT a dimension finding: the 52.5 mm
/// ball clears the true receding-arc corner throat with +28.8 mm to
/// spare. The kernel gained arc-span capability, so both entries now
/// build the CEBP template's TRUE construction: tangent two-arc jaws
/// (corner 76.2/114.3 mm, middle 79.4/53.2 mm before the Joy scales)
/// with angular spans, rails ending at the tangency points, no straight
/// facings, and the template FALL circles as the capture discs
/// (replacing the throat/2 discs for the snooker family). Every
/// pool-family entry stays byte-identical (v5 dump pin + Gate G-KERNEL).
/// v8 (2026-07-11 owner Pro-Am calibration session,
/// `docs/verification/owner-proam-calibration-2026-07.md`): ADDITIVE ONLY —
/// the [`Calibration::Measured`] provenance tier (first-hand measurement by
/// THIS project: session id + date + per-parameter values WITH
/// uncertainties + the verification-doc reference; additive serde — every
/// pre-v8 entry keeps its variant and serializes byte-identically) and the
/// first two Measured entries: `owner_proam_9ft_2026_07` (reuses the
/// `diamond_proam_9ft` geometry, independently confirmed at 0.33–0.38 mm
/// sight-grid RMS; cushion response KEPT at the kernel model — the measured
/// low-spin band 0.84–0.94 brackets e0 = 0.85 and two spin-confounded
/// tiers cannot support an e(v) refit) and `owner_proam_cloth_2026_07`
/// (measured u_s 0.247, representative u_r 0.0103 from the speed-dependent
/// band, u_sp_scale 0.370). v9 (issue #91): ADDITIVE ONLY — two
/// visual-variant pool ballsets, `aramith_black` (Aramith Tournament
/// Black, Duramith) and `arcos_reserve` (Predator Arcos II Reserve, Super
/// Aramith Pro formula). Both are 57.15 mm regulation phenolic sets whose
/// `params` byte-copy the `aramith_pool` class (`BallParams::default()`,
/// no `bb_friction` override — no set-specific friction/COR is published,
/// and inventing one would violate P-IV); the ids exist so the per-set
/// VISUALS key off the kernel-truth equipment tag exactly like every
/// other ballset. Every pre-v9 entry stays byte-identical (v5 dump pin).
/// v10 (issue #168, kernel-api.md Amendment 021): ADDITIVE ONLY — the
/// `masse_trick` cue entry, the first carrier of the per-cue
/// `miscue_contact_cap_r` parameter (cap 0.58 R vs the 0.5 R default:
/// Venom W2 measured 0.567–0.579 R contact offsets on hard
/// pressed-leather massé tips; cue mass 0.62 kg = the W3 shot-2 fit
/// pegged at its declared bracket top). Every pre-v10 entry stays
/// byte-identical (the new CueParams field serde-skips at its 0.5
/// default, so existing cue entries carry no new key).
/// v11 (issue #212, kernel-api.md Amendment 024): ADDITIVE FIELDS on the
/// v10 `masse_trick` entry — the only carrier of the four Amendment-024
/// finite-dwell CueParams fields (pinch_dwell_gain 0.54, pinch_jam 1.0,
/// pinch_end_mass 0.0209 kg, pinch_press_scale 0.1725: the masse-shot-1
/// refit inside the design-declared brackets, verdict GAP → REPRODUCED
/// at cb_path_rms 6.08σ → 1.58σ; provenance on the entry). Every v10
/// value of the entry (m 0.62, cap 0.58, nickel tip, standard
/// end_mass/tip_cor) is UNTOUCHED — the entry gains keys, never changes
/// one — and every other entry stays byte-identical (all four fields
/// serde-skip at their defaults, so no other entry carries a new key).
/// v12 (issue #232, post-merge ultra audit of PR #222): the v11 change
/// was an immutability VIOLATION despite its additive-fields framing —
/// non-default dwell fields on the SHIPPED v10 `masse_trick` entry
/// silently changed the elevated-strike physics of every persisted
/// selection and share payload pinning that id (contrast the #87
/// grip_fitted precedent: UI-side demotion, persisted selections
/// grandfathered, values never touched). v12 REVERTS `masse_trick` to
/// its exact v10 bytes (the dwell quartet back to its serde-skip
/// defaults; the entry's serialized form is byte-identical to v10,
/// pinned by `v12_masse_trick_reverted_to_v10_bytes`) and moves the
/// Amendment-024 dwell calibration to the NEW `masse_trick_dwell`
/// entry — the only carrier of the four pinch_* fields, carrying the
/// FULL fitted operating point the 024 acceptance actually ran,
/// including the masse-shot-1 fitted cue mass 0.737611 kg (v11 had
/// paired the quartet with masse_trick's 0.62 kg W3 shot-2 mass, a
/// combination no acceptance run exercised; difference documented on
/// the entry). Persisted `masse_trick` selections resolve to v10
/// physics again, per contract. Every other entry stays byte-identical.
/// v13 (issue #277, kernel-api.md Amendment 025, design 277 slice 1):
/// SCHEMA-ONLY — `CueParams` gains the two structural shaft fields
/// `shaft_first_mode_hz` (default 27.0, DBKcues ring-down) and
/// `shaft_damping_ratio` (default originally 0.02 tuned-by-eye; revised
/// to 0.08 by the Amendment-025 revision note 2026-07-31 — in-stroke
/// footage tracking of HSV A.25, `docs/research/whip-calibration-277.md`),
/// consumed by the render-side cue
/// visual dynamics engine and NEVER read by the strike solve. NO entry
/// is added, removed, or changed: both fields serde-skip at their
/// defaults, so every shipped cue entry keeps byte-identical
/// serialization and picks up the defaults implicitly (the #232 lesson
/// applied in the strictest form — the version bump records the schema
/// extension, not an entry mutation; a default revision on a
/// solver-unread field changes no entry bytes and no physics bytes).
/// v14 (issue #283, owner decisions comment 2026-08-01): ADDITIVE — four
/// new cue archetypes (`carbon_ld`, `jump_phenolic`, `snooker_ash`,
/// `carom_conical`; every value carries per-value Measured/Literature/
/// Estimated provenance in the entry note), three fully generic-id
/// de-branding twins (`pro_ld_pivot_141`/`pro_ld_pivot_118`/
/// `pro_ld_pivot_101` — the published pivot length in tenths of an inch
/// IS the honest spec) whose params are BYTE-IDENTICAL to the three
/// branded v3 entries (pinned), and the new [`CueEntry::superseded_by`]
/// metadata field marking those three branded ids picker-hidden (owner
/// decision 2: internal identifiers de-branded too). The branded entries
/// keep resolving FOREVER with untouched `params` bytes (#232: shipped
/// records/share payloads pin them; the metadata key is the v4
/// `ui_hidden` class — entry METADATA, never physics; the v5 drift gate
/// pins their id/display_name/calibration/params bytes unchanged). Brand
/// names survive ONLY inside Calibration provenance strings and code
/// comments as factual data-source citations (nominative use). Also
/// ADDITIVE DATA: the per-discipline default-cue map
/// [`DISCIPLINE_DEFAULT_CUE_IDS`] (pool→standard, snooker→snooker_ash,
/// carom→carom_conical) for the app's feature-012 per-discipline
/// equipment defaults; `EquipmentSpec::{snooker,carom}_default()` keep
/// the v6 pairing (cue = DEFAULT_CUE_ID) so no composed no-spec rack
/// scenario changes a single byte in this bump.
/// v15 (GH-490; GH-484 owner decision card 2026-08-09, decisions ⑨/⑩):
/// KNOWING geometry change + de-brand rename for the Chinese-eight class
/// (v5-Diamond-repin precedent — replays pinning either id below
/// re-simulate on the new geometry). (a) Width repin 2.54 × 1.27 →
/// 2.54 × 1.26 m: the v6/v7 note's "the manufacturer 1270 mm width wins"
/// rationale is FALSIFIED — the manufacturer's own official site
/// publishes 1260 mm, agreeing with the WPA Rules of Heyball
/// (2540 × 1260 ± 9); the 1270 reading traced to a dealer spec sheet +
/// the CBSA Chinese-rules text (both recorded on the new entry).
/// (b) De-brand rename per the #283 equipment-program convention
/// (internal identifiers too): the NEW picker-visible entry
/// `chinese8_pro_9ft` (display "Chinese 8-ball tournament 9-ft") carries
/// the class; the geometry variant is renamed `Chinese8Pro9Ft` (its
/// serialized name rides this bump); `joy_q8_9ft` stays FOREVER as a
/// deprecated resolve-only alias — `ui_hidden`, the `wpa_generic_9ft`
/// legacy-resolution regime, because replays/persisted selections pin
/// table ids — resolving to the SAME repinned geometry per (a). Brand
/// names survive only inside provenance strings and code comments as
/// factual data-source citations (nominative use). Provenance upgrades
/// ride the new entry's note (GH-484 synthesis): nose height now
/// retailer-cited (36–38 mm band), middle mouth 100 mm twice-corroborated
/// (comparable-class 89/101 pairing + the CBSA corner+15 convention), the
/// 85-vs-105 measurement-convention warning (fall opening at the noses vs
/// leather-ring inner edge — different datums), and the WPA UNITY
/// ball-set mandate note (from 2025-08-25).
/// v16 (calibration wave B1; the #484-registered chinese8 jaw/fall
/// divergence, owner decision card ③「校准波再动」+ b18 close-down
/// dispatch): KNOWING corner-geometry repin for `chinese8_pro_9ft` (and
/// its `joy_q8_9ft` resolve-only alias) under the v5-Diamond precedent —
/// replays pinning either id re-simulate on the new geometry, and NO
/// `KERNEL_COMPAT_LINEAGE` pair is added (a real geometry change cannot
/// prove byte identity — the v15 law; cross-version opens warn +
/// view-anyway). The v7–v15 corner construction (scaled-CEBP two-arc
/// horns r 76.97/115.45 mm + template fall disc Ø179.6 at the slate-edge
/// intersection) is FALSIFIED as a snooker-template artifact: every real
/// datum family sits far inside it (Joy official mouth 85 mm; the
/// CBSA-circulating 105 ± 1 mm leather-ring inner edge; the GH-490
/// photo-measured horn-end gap 111–120 mm and fall-rim radial
/// 125–140 mm), and the two-layer ruling had already shipped the
/// real construction render-side (GH-490 R82 drawing lane) with the
/// kernel registered as the outlier (finale INDEX 「内核碰撞面与照片袋弧
/// 偏差」). v16 adopts the SAME R82 drawing construction for the kernel
/// collision surfaces (`CornerPocketFamily::Cn8Molded`, table.rs `cn8`
/// constants): R45 nose rolls departing at Y_N = 78.744 mm (derived from
/// the 85 mm mouth) and running onto the capture disc = the Ø105 mouth
/// circle about the drawing O_f, 3.5 mm beyond BOTH nose lines (the
/// render bed-hole / cammatch mouth-gate datum) — the ADR-0015
/// single-source convergence (the visible bed hole, the drop-steer
/// target and the capture disc are now the same circle; the drawing's
/// throat-wall/R10 lines are liner construction inside the disc,
/// collision-unreachable). Middle pockets
/// deliberately UNTOUCHED (no middle-pocket photo evidence — the JOY
/// dossier gap is a ledgered owner-deferred item). Snooker, pool and
/// carom entries byte-identical (spec-dump-proven on the PR).
///
/// v17 (calibration wave B2 item CAL-1, GH-484; owner-approved ruling
/// d601pred, PR #601): KNOWING side-mouth repin for `predator_apex_9ft` —
/// the official Predator Apex product-page spec lists the side mouth at
/// 4.92 in / 124.968 mm, superseding the dealer-relayed 5.0 in / 127 mm
/// assumption the entry shipped with (docs/geometry canonical r4 closes
/// conflict CFL-2). Under the v15/v16 lineage law there is NO
/// `KERNEL_COMPAT_LINEAGE` pair: a real geometry change cannot prove byte
/// identity, so replays pinning `predator_apex_9ft` re-simulate on the new
/// geometry and cross-version opens warn + view-anyway. `side_pocket_radius`
/// / `side_pocket_depth` stay throat-based and fixed (the Diamond
/// precedent); corner mouth and every other entry byte-identical
/// (spec-dump-proven on the PR).
///
/// v18 (GH-621, Diamond size variants; declared kernel branch
/// `diamond-variants-2026-09`): APPENDS `diamond_proam_8ft` and
/// `diamond_proam_7ft` — the Pro-Am pocket furniture on the official
/// 90" × 45" and 80" × 40" beds (Diamond factory dimension drawings,
/// dossier `01-official/official-specsheet-{8,7}ft-proam.png`). Both specs
/// are the `diamond_proam_9ft` spec by struct update (only length/width
/// differ), so the shared pocket bytes are a compile-time fact. Additive
/// only: every existing entry byte-identical (spec-dump-proven on the PR),
/// order frozen (appended after `chinese8_pro_9ft`). No
/// `KERNEL_COMPAT_LINEAGE` pair is added HERE: an additive bump CAN prove
/// byte-identical streams for every pre-existing id, but that proof (Gate
/// G-KERNEL on the rebaked canonical wasm) belongs to the landing ceremony,
/// which adds the pair only after the gate has run.
///
/// v19 (Rasson tables lane, Table 2 wave OX-A1 — landed SECOND, after the v18 Diamond
/// size variants, so this is the re-bump the v18 note below foresaw; owner ruling 2026-09-01
/// 「就用我买的那个…建模一个美式桌子」): APPENDS `rasson_ox_9ft` — the Rasson OX
/// 9-ft American-pool table as a [`PocketTableSpec`] sibling of
/// `predator_apex_9ft` ([`PocketTableSpec::rasson_ox_9ft`]; canonical
/// definition docs/geometry/rasson-ox-9ft-table-definition.json
/// OB-ROX-GEO-001). Official OX truth pins the datum (2540 × 1270,
/// retail 4.5"/5.0" cut, K55 cushion); the purchased reference model is
/// the BASELINE under LAW-PURCHASED-BASELINE (r6): facings
/// 141.2509°/99.978° (MODEL), jaw radii 8.645/2.962 mm (MODEL), side
/// shelf 8.695 mm (MODEL, C12/C16, O14), corner shelf 45.429 mm DERIVED
/// at the MFR mouth (CP-05/C6); every model-vs-official delta is
/// disclosed in the JSON. Additive only:
/// every prior entry byte-identical; NOTE the parallel GH-621 Diamond
/// variants lane also bumps to v18 — whichever lands second re-bumps to
/// v19 (mechanical: this constant, the len/id-list pins, the v5-dump
/// delta) — the canonical wasm is NOT rebaked on this branch (landing
/// ceremony).
///
/// v20 (#789, internal catalog id de-branding): APPENDS 14 de-branded twins
/// after the v19 entries (7 tables, 3 cloths, 4 ballsets), each carrying its
/// old entry's params byte-identically (pinned by
/// `v20_debranding_twins_byte_identical`), and the six neutral
/// [`TableGeometry`] variants `PoolPro9Ft`, `PoolPro8Ft`, `PoolPro7Ft`,
/// `PoolPro9FtMetalRim`, `PoolPro9FtK55` and `PoolPro9FtOlderGen`, each
/// sharing the `pocket_spec()` arm of the variant it twins. R10 metadata:
/// [`TableEntry::superseded_by`] (also on cloths and ballsets) and
/// `ui_hidden` on cloths and ballsets. Each kept old entry is a `ui_hidden`
/// rename alias superseded by its twin, with params unchanged; the three
/// branded cues gain `ui_hidden` beside their `superseded_by`. The 16
/// branded display names (tables, cloths, ballsets and the three cues)
/// become neutral in place: an old entry reads as its twin's name plus
/// " (legacy alias)". The two v8 Measured entries leave the served catalog;
/// their twins `pool_pro_9ft_measured` and `pool_worsted_measured` carry the
/// same params, and a private digest alias resolves records that pinned the
/// old ids to the twins ([`catalog_alias_digests_json`]). The v8
/// measured-response calibration dossier moves to
/// docs/verification/pool-9ft-measured-calibration.md (session
/// `pool-9ft-measured-s1`). No `KERNEL_COMPAT_LINEAGE` pair is added HERE:
/// the landing ceremony rebakes the canonical wasm and adds a pair only
/// after its proofs hold.
///
/// v21 (GH-1080, Chinese-8 pocket mouths; card 41 corner F2 + middle M-c):
/// KNOWING corner AND middle geometry repin for `chinese8_pro_9ft` (and its
/// `joy_q8_9ft` resolve-only alias) under the v5-Diamond precedent - replays
/// pinning either id re-simulate on the new geometry. Corner: the v16
/// [`CornerPocketFamily::Cn8Molded`] construction keeps one arc per jaw,
/// re-fitted to calibrated broadcast photos: a nose fillet R72.199 mm
/// departing each rail at 90.151 mm (was R45 from 78.744 mm), running onto
/// the same Ø105 mouth-circle capture disc; the throat wall and its sharp
/// junction with the leather ring stay inside the disc. Middle: the new
/// [`MiddlePocketFamily::Cn8Arc1`], arc 1 of the CEBP template (the uniform
/// 1.0079 scale unchanged) swept on to the template capture circle, one arc
/// per jaw (chinese8 circular segments 16 -> 12); the render's 90° end face
/// at an 87 mm nose width lies inside the disc. LINEAGE - a HYBRID posture
/// that departs from the v15-v17 "no pair" rule on purpose: the landing
/// ceremony appends `KERNEL_COMPAT_LINEAGE` pairs from the prior stamps only
/// after the pair legs prove byte-identical corpus streams (a pool-only
/// corpus: the legs prove pool identity), and the SDK refuses
/// `chinese8_pro_9ft` / `joy_q8_9ft` shares minted before the new stamp with
/// the existing cross-version warning + view-anyway. The outcome change the
/// v15 law exists to surface stays surfaced, without warning on every
/// unchanged pool link. Every other table entry is byte-identical by the
/// spec dump at the pool, snooker and carom ball radii (on the PR); snooker
/// and carom rest on that dump alone.
pub const CATALOG_VERSION: u32 = 21;

/// O15 A2 — the served `Calibration::Measured.date` of the two measured
/// entries (`tables/pool_pro_9ft_measured`, `cloths/pool_worsted_measured`).
/// Owner decision 2026-09-20 (relayed via the Fleet Steward, verbatim
/// 「改：本版改成「采纳时」字样」): no personal calendar date leaves the served
/// catalog — the served-strings privacy gate (web/tools/test-served-strings-privacy.mjs,
/// class C) counts any date shape under `calibration.Measured.*` as a carrier, so the
/// field carries this sentinel instead of the session day. The field stays a required
/// `String`; `every_entry_has_calibration_provenance` admits exactly this value beside
/// the YYYY-MM-DD form every other Measured entry keeps. The TS mirror
/// (sdk/ts/src/catalog.ts) carries the same literal through the W-3 splice.
pub const CALIBRATION_DATE_AT_ADOPTION: &str = "at adoption";

/// Calibration status + provenance of a catalog entry (issue #15: every
/// entry must say where its numbers come from; constitution P-IV honesty).
///
/// Catalog v8 adds [`Calibration::Measured`]; the enum loses its `Eq`
/// derive because measured values carry `f64` uncertainties (`PartialEq`
/// everywhere in the catalog is unchanged — no entry type derived `Eq`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Calibration {
    /// Fitted against measured data by THIS project (harness + fit run
    /// documented at `source`).
    Calibrated { source: String },
    /// Taken from published literature / first-hand external measurement
    /// (citation at `source`).
    Literature { source: String },
    /// No measurement exists; engineering estimate (`note` records the
    /// reasoning and the research gap).
    Estimated { note: String },
    /// First-hand measurement by THIS project (catalog v8): a physical
    /// calibration session whose per-parameter values land on the entry
    /// WITH their uncertainties. Distinct from [`Calibration::Calibrated`]
    /// (a model FIT against data) — Measured entries carry instrument
    /// readings of the parameters themselves.
    Measured {
        /// Calibration session id (e.g. `owner-proam-2026-07-11`), the key
        /// into the verification doc's audit trail.
        session: String,
        /// Session date, ISO 8601 (`YYYY-MM-DD`).
        date: String,
        /// Per-parameter measured values with 1-sigma uncertainties.
        values: Vec<MeasuredParam>,
        /// Repo-relative provenance document
        /// (`docs/verification/...`) recording method, uncertainty
        /// budget, and adjudication history.
        doc: String,
    },
}

/// One measured parameter of a [`Calibration::Measured`] entry: which
/// kernel parameter the number lands on, its central value, its 1-sigma
/// uncertainty, and the method/caveat note (n, speed range, systematics).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MeasuredParam {
    /// Kernel parameter path the value lands on (e.g. `cloth.u_s`), or a
    /// `validation:`-prefixed path for measurements that VALIDATE a kept
    /// kernel value instead of replacing it.
    pub param: String,
    /// Measured central value (SI units of the target parameter).
    pub value: f64,
    /// 1-sigma uncertainty (statistical, over-session repeats; systematics
    /// belong in `note` and the provenance doc).
    pub sigma: f64,
    /// Method / caveat note (sample size, speed range, known systematics).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub note: String,
}

/// Default equipment ids — the exact composition of today's kernel-default
/// pipeline (each pinned by `catalog::tests`).
pub const DEFAULT_TABLE_ID: &str = "wpa_generic_9ft";
pub const DEFAULT_CLOTH_ID: &str = "simonis_860_tournament";
pub const DEFAULT_BALLSET_ID: &str = "aramith_pool";
pub const DEFAULT_CUE_ID: &str = "standard";
pub const DEFAULT_CUSHION_MODEL_ID: &str = "han2005_default";

/// Per-discipline DEFAULT cue ids (catalog v14, issue #283 owner decision
/// 1: "snooker mode auto-defaults to the snooker cue; carom discipline
/// defaults to [the carom cue]"), keyed by the game catalog's
/// `discipline_family` values. DATA ONLY in this slice: the consumer is
/// the app's per-discipline equipment defaults (feature 012
/// `settings.js defaultEquipmentFor` / `equipmentByGame`, adopted in the
/// follow-up UI slice; the TS SDK mirrors this map as
/// `DISCIPLINE_DEFAULT_CUE_IDS`). `EquipmentSpec::{snooker,carom}_default()`
/// deliberately KEEP the v6 pairing (cue = [`DEFAULT_CUE_ID`]): they feed
/// the no-spec wasm/pool-py rack scenarios, whose strike physics must not
/// move; the app racks snooker/carom on the player's SELECTED spec instead
/// (game.js composeKindScenario, GH-1042), so the chosen cue strikes there.
pub const DISCIPLINE_DEFAULT_CUE_IDS: [(&str, &str); 3] = [
    ("pool", DEFAULT_CUE_ID),
    ("snooker", "snooker_ash"),
    ("carom", "carom_conical"),
];

/// The v14 per-discipline default cue id for a game catalog
/// `discipline_family` (`None` for unknown families — callers fall back
/// to their own defaults, the settings.js per-axis-validation law).
pub fn discipline_default_cue_id(discipline_family: &str) -> Option<&'static str> {
    DISCIPLINE_DEFAULT_CUE_IDS
        .iter()
        .find(|(f, _)| *f == discipline_family)
        .map(|(_, id)| *id)
}

/// Equipment composition by catalog ids (issue #15). Embedded in scenarios
/// and (through `SystemState`) in shot records, so replays pin the exact
/// equipment they were simulated with.
///
/// serde: `Default` = the ids of today's kernel-default pipeline, and the
/// struct-level `#[serde(default)]` fills every missing field — old
/// scenario/record JSON (no `equipment` key, or a partial one) parses to
/// current behavior unchanged.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct EquipmentSpec {
    pub table_id: String,
    pub cloth_id: String,
    pub ballset_id: String,
    pub cue_id: String,
    pub cushion_model_id: String,
}

impl Default for EquipmentSpec {
    fn default() -> Self {
        EquipmentSpec {
            table_id: DEFAULT_TABLE_ID.to_string(),
            cloth_id: DEFAULT_CLOTH_ID.to_string(),
            ballset_id: DEFAULT_BALLSET_ID.to_string(),
            cue_id: DEFAULT_CUE_ID.to_string(),
            cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
        }
    }
}

impl EquipmentSpec {
    /// Serde skip predicate: the default spec is OMITTED from serialized
    /// scenarios/records, keeping pre-catalog byte parity (pinned test).
    pub fn is_default(&self) -> bool {
        *self == EquipmentSpec::default()
    }

    /// Default snooker pairing (catalog v6, feature 012 — data-model.md
    /// §1.1): WPBSA 12-ft table, Mathavan 2010 napped cloth + snooker
    /// ballset + Mathavan fitted cushion model (all pre-existing entries
    /// except the table, FR-014).
    pub fn snooker_default() -> EquipmentSpec {
        EquipmentSpec {
            table_id: "wpbsa_snooker_12ft".to_string(),
            cloth_id: "snooker_napped".to_string(),
            ballset_id: "snooker".to_string(),
            cue_id: DEFAULT_CUE_ID.to_string(),
            cushion_model_id: "mathavan_fitted".to_string(),
        }
    }

    /// Default carom pairing (catalog v6, feature 012 — data-model.md
    /// §1.2): UMB 2.84 m pocketless table, heated-worsted cloth (new v6
    /// entry), carom ballset, constant-COR baseline cushion model (van
    /// Balen note on the table entry).
    pub fn carom_default() -> EquipmentSpec {
        EquipmentSpec {
            table_id: "umb_carom_284".to_string(),
            cloth_id: "carom_worsted_heated".to_string(),
            ballset_id: "carom".to_string(),
            cue_id: DEFAULT_CUE_ID.to_string(),
            cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
        }
    }
}

/// Table geometry family — a constructor selector, NOT stored geometry
/// (cushion nose height depends on the resolved ballset's radius, so the
/// concrete [`Table`] is built at [`EquipmentCatalog::resolve`] time).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TableGeometry {
    /// WPA 9-ft playing surface (100" × 50" nose-to-nose), pooltool
    /// pocket/jaw layout, WPA nose height 63.5 % of ball diameter
    /// ([`Table::wpa_9ft`] = [`PocketTableSpec::wpa_generic`]).
    Wpa9Ft,
    /// Diamond Pro-Am 9-ft, Pro Cut pockets — measured true mouths
    /// 4.5"/5.0", RKC factory-cut 141°/102° facings (catalog v5; 142°/104°
    /// WPA nominals before), 1 7/16" nose
    /// ([`PocketTableSpec::diamond_proam_9ft`]; catalog v3, feature 009).
    DiamondProAm9Ft,
    /// Predator Apex 9-ft — dealer-official 4.25"/5.0" mouths, WPA-assumed
    /// facings/nose/shelves ([`PocketTableSpec::predator_apex_9ft`];
    /// catalog v3, feature 009).
    PredatorApex9Ft,
    /// WPA Equipment Specifications 9-ft, nominal band values — mouths
    /// 4.5625"/5.0625", facings 142°/104°, nose 63.5 %
    /// ([`PocketTableSpec::wpa_spec_9ft`]; catalog v4, catalog-policy
    /// ruling item 3).
    WpaSpec9Ft,
    /// Diamond Red Label 9-ft, older-generation profile — community-
    /// measured 4 9/16" corner mouth (AZB 48606), RKC factory-cut
    /// 141°/102° facings (catalog v5), remaining dimensions derived from
    /// the shared Pro-Am hardware dossier
    /// ([`PocketTableSpec::diamond_redlabel_9ft`]; catalog v4,
    /// catalog-policy ruling item 4).
    DiamondRedLabel9Ft,
    /// WPBSA 12-ft snooker table
    /// ([`CurvedPocketTableSpec::wpbsa_snooker_12ft`]; catalog v6, feature
    /// 012; catalog v7 arc-span re-derivation — the CEBP template's TRUE
    /// jaw radii as tangent two-arc composites with angular spans, fall
    /// circles as capture discs; the v6 full-circle radius clamps are
    /// retired).
    WpbsaSnooker12Ft,
    /// UMB 2.84 m pocketless carom table
    /// ([`crate::table::CaromTableSpec::umb_284`]; catalog v6, feature
    /// 012). The only variant with NO pocket spec — 4 linear cushions,
    /// no arcs, no pockets.
    CaromUmb284,
    /// Chinese 8-ball tournament 9-ft, steel-cushion class
    /// ([`CurvedPocketTableSpec::chinese8_pro_9ft`]; catalog v6, feature
    /// 012 FR-015 as `joy_q8_9ft`; catalog v7 arc-span re-derivation,
    /// fall-opening-pinned template scales; catalog v15 de-brand rename +
    /// width repin 1270 → 1260 mm, GH-490 — the serialized variant name
    /// moved with the rename, covered by the same v15 bump).
    Chinese8Pro9Ft,
    /// Diamond Pro-Am 8-ft — the Pro-Am pocket furniture (the 9-ft spec by
    /// struct update, only length/width differ) on the official 90" × 45"
    /// bed ([`PocketTableSpec::diamond_proam_8ft`]; catalog v18, GH-621).
    DiamondProAm8Ft,
    /// Diamond Pro-Am 7-ft bar box — the Pro-Am pocket furniture on the
    /// official 80" × 40" bed ([`PocketTableSpec::diamond_proam_7ft`];
    /// catalog v18, GH-621).
    DiamondProAm7Ft,
    /// Rasson OX 9-ft American pool — official 2540 × 1270 surface and the
    /// published 4.5"/5.0" retail cut; under LAW-PURCHASED-BASELINE (r6)
    /// the purchased reference model is the baseline: facings
    /// 141.2509°/99.978°, jaw radii 8.645/2.962 mm and side shelf 8.695 mm
    /// are MODEL reads, the corner shelf 45.429 mm is DERIVED at the MFR
    /// mouth (CP-05/C6, C12/C16) ([`PocketTableSpec::rasson_ox_9ft`];
    /// catalog v18, Rasson tables lane OX-A1, OB-ROX-GEO-001).
    RassonOx9Ft,
    /// Pool tournament 9-ft, 4.5"/5.0" mouths: the de-branded twin of
    /// [`TableGeometry::DiamondProAm9Ft`] (catalog v20, #789). Additive: the
    /// old variant stays for the entries that name it, and both select the
    /// same pocket-table constructor, so the built [`Table`] is identical.
    PoolPro9Ft,
    /// Pool tournament 8-ft, 4.5"/5.0" mouths: the de-branded twin of
    /// [`TableGeometry::DiamondProAm8Ft`] (catalog v20, #789; same
    /// constructor, identical built geometry).
    PoolPro8Ft,
    /// Pool tournament 7-ft bar box, 4.5"/5.0" mouths: the de-branded twin
    /// of [`TableGeometry::DiamondProAm7Ft`] (catalog v20, #789; same
    /// constructor, identical built geometry).
    PoolPro7Ft,
    /// Pool tournament 9-ft, metal-rim cushion class, 4.25" corner mouths:
    /// the de-branded twin of [`TableGeometry::PredatorApex9Ft`] (catalog
    /// v20, #789; same constructor, identical built geometry).
    PoolPro9FtMetalRim,
    /// Pool tournament 9-ft, K55 cushion profile, 4.5"/5.0" mouths: the
    /// de-branded twin of [`TableGeometry::RassonOx9Ft`] (catalog v20,
    /// #789; same constructor, identical built geometry).
    PoolPro9FtK55,
    /// Pool tournament 9-ft, older-generation profile, 4 9/16" corner
    /// mouth: the de-branded twin of [`TableGeometry::DiamondRedLabel9Ft`]
    /// (catalog v20, #789; same constructor, identical built geometry).
    PoolPro9FtOlderGen,
}

impl TableGeometry {
    /// The pocket-table spec this variant selects (feature 009: the
    /// measurable-quantity parameterization behind every geometry family).
    /// `None` for the pocketless carom variant (feature 012) AND for the
    /// curved-pocket snooker family (catalog v7 Amendment A1 — those two
    /// variants moved to [`TableGeometry::curved_spec`]; workspace-internal
    /// API, callers audited).
    pub fn pocket_spec(&self) -> Option<PocketTableSpec> {
        match self {
            TableGeometry::Wpa9Ft => Some(PocketTableSpec::wpa_generic()),
            // Catalog v20 (#789): each de-branded twin variant selects the
            // same constructor as the variant it twins.
            TableGeometry::DiamondProAm9Ft | TableGeometry::PoolPro9Ft => {
                Some(PocketTableSpec::diamond_proam_9ft())
            }
            TableGeometry::PredatorApex9Ft | TableGeometry::PoolPro9FtMetalRim => {
                Some(PocketTableSpec::predator_apex_9ft())
            }
            TableGeometry::WpaSpec9Ft => Some(PocketTableSpec::wpa_spec_9ft()),
            TableGeometry::DiamondRedLabel9Ft | TableGeometry::PoolPro9FtOlderGen => {
                Some(PocketTableSpec::diamond_redlabel_9ft())
            }
            TableGeometry::DiamondProAm8Ft | TableGeometry::PoolPro8Ft => {
                Some(PocketTableSpec::diamond_proam_8ft())
            }
            TableGeometry::DiamondProAm7Ft | TableGeometry::PoolPro7Ft => {
                Some(PocketTableSpec::diamond_proam_7ft())
            }
            TableGeometry::RassonOx9Ft | TableGeometry::PoolPro9FtK55 => {
                Some(PocketTableSpec::rasson_ox_9ft())
            }
            TableGeometry::WpbsaSnooker12Ft
            | TableGeometry::CaromUmb284
            | TableGeometry::Chinese8Pro9Ft => None,
        }
    }

    /// The curved-pocket (snooker-family) spec this variant selects
    /// (catalog v7, kernel-api.md Amendment 016 / equipment-additions.md
    /// Amendment A1).
    pub fn curved_spec(&self) -> Option<CurvedPocketTableSpec> {
        match self {
            TableGeometry::WpbsaSnooker12Ft => {
                Some(CurvedPocketTableSpec::wpbsa_snooker_12ft())
            }
            TableGeometry::Chinese8Pro9Ft => {
                Some(CurvedPocketTableSpec::chinese8_pro_9ft())
            }
            _ => None,
        }
    }

    /// The carom-table spec this variant selects (`Some` only for
    /// [`TableGeometry::CaromUmb284`]; catalog v6, feature 012).
    pub fn carom_spec(&self) -> Option<crate::table::CaromTableSpec> {
        match self {
            TableGeometry::CaromUmb284 => Some(crate::table::CaromTableSpec::umb_284()),
            _ => None,
        }
    }

    /// Cushion nose height as a fraction of ball diameter for this
    /// variant's builder input (feature 012: per-discipline fractions —
    /// research R2; pool 0.635-class, snooker 0.70, carom 0.6016).
    pub fn nose_height_frac(&self) -> f64 {
        if let Some(spec) = self.pocket_spec() {
            return spec.nose_height_frac;
        }
        if let Some(spec) = self.curved_spec() {
            return spec.nose_height_frac;
        }
        self.carom_spec()
            .expect("every variant has a pocket, curved or carom spec")
            .nose_height_frac
    }

    /// Build the concrete geometry for balls of radius `ball_r`. For
    /// [`TableGeometry::Wpa9Ft`] this is `Table::wpa_9ft(ball_r)`
    /// bit-exactly (`wpa_9ft` is itself the `from_pocket_spec` delegation
    /// on the same spec — pinned by `default_spec_is_todays_default_pipeline`);
    /// every pre-012 variant builds a BIT-IDENTICAL `Table` vs catalog v5
    /// (pinned by `v6_pre012_variants_build_bit_identical_tables`).
    pub fn build(&self, ball_r: f64) -> Table {
        if let Some(spec) = self.pocket_spec() {
            return Table::from_pocket_spec(&spec, ball_r);
        }
        if let Some(spec) = self.curved_spec() {
            return Table::from_curved_pocket_spec(&spec, ball_r);
        }
        Table::from_carom_spec(
            &self
                .carom_spec()
                .expect("pocketless variants carry a carom spec"),
            ball_r,
        )
    }
}

/// A table entry: geometry family + cushion response + the brand bank-bias
/// pairing (which cushion-model entry reproduces this brand's measured bank
/// envelope, per `docs/verification/banking-report.md`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TableEntry {
    pub id: String,
    pub display_name: String,
    pub calibration: Calibration,
    pub geometry: TableGeometry,
    /// Base cushion response (the fitted cushion-model entries override it,
    /// see [`CushionModelEntry::response_override`]).
    pub cushion_response: CushionResponse,
    /// The cushion-model entry id whose bank envelope matches this brand
    /// (banking-report provenance) — a recommendation surfaced to pickers,
    /// NOT applied implicitly by [`EquipmentCatalog::resolve`].
    pub recommended_cushion_model_id: String,
    /// `true` = internal compatibility entry: user-facing pickers filter it
    /// out of their lists, but the id keeps resolving (fixtures/goldens/
    /// legacy share links pin it). Catalog v4, catalog-policy ruling item 5
    /// — a table without a real reference has no reason to be OFFERED.
    /// serde: additive (missing key = false; false is skipped, so pre-v4
    /// entry JSON stays byte-identical).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub ui_hidden: bool,
    /// Catalog v20 (#789): the neutral-id entry that supersedes this one in
    /// user-facing pickers (the [`CueEntry::superseded_by`] precedent). The
    /// superseded entry keeps resolving forever with byte-identical
    /// parameters; its twin carries the same bytes (pinned by
    /// `v20_debranding_twins_byte_identical`). Entry METADATA only:
    /// `resolve()` never reads it.
    ///
    /// Rule (catalog v20, #789): `ui_hidden` + `superseded_by` = a RENAME
    /// migration (the app rewrites a persisted selection to the named
    /// twin); `superseded_by` alone = demote + grandfather (the picker
    /// demotes the entry and a persisted selection keeps it).
    ///
    /// Serde: defaulted to `None` AND skipped at `None`, so every entry that
    /// is not superseded serializes byte-identically.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
}

/// A cloth entry: the ball–cloth friction bundle ([`ClothPreset`]).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClothEntry {
    pub id: String,
    pub display_name: String,
    pub calibration: Calibration,
    pub params: ClothPreset,
    /// Catalog v20 (#789): `true` = pickers filter the entry out, but the id
    /// keeps resolving (the [`TableEntry::ui_hidden`] semantics). Serde:
    /// additive (missing key = false; false is skipped, so every existing
    /// entry serializes byte-identically).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub ui_hidden: bool,
    /// Catalog v20 (#789): the neutral-id twin that supersedes this entry
    /// (the [`TableEntry::superseded_by`] semantics; metadata only,
    /// skipped at `None`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
}

/// A ball-set entry: the per-ball parameter template. The resolved spec's
/// cloth REPLACES the friction trio (`u_s`/`u_r`/`u_sp`) via
/// [`ClothPreset::apply`]; mass/radius/restitutions/cushion friction come
/// from here.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BallSetEntry {
    pub id: String,
    pub display_name: String,
    pub calibration: Calibration,
    pub params: BallParams,
    /// Ball–ball friction curve override (ballset-CONDITION axis, catalog
    /// v2): `Some` = this ballset was fitted with its own μ_bb(v) —
    /// [`EquipmentCatalog::resolve`] routes it into
    /// [`SimOptions::bb_friction`](crate::shot::SimOptions::bb_friction).
    /// `None` (every pre-v2 entry; serde-skipped, so v1 catalog JSON is
    /// byte-identical) keeps the options' default curve — the literature
    /// Marlow/Alciatore fit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bb_friction: Option<crate::params::BallBallFriction>,
    /// Catalog v20 (#789): `true` = pickers filter the entry out, but the id
    /// keeps resolving (the [`TableEntry::ui_hidden`] semantics). Serde:
    /// additive (missing key = false; false is skipped, so every existing
    /// entry serializes byte-identically).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub ui_hidden: bool,
    /// Catalog v20 (#789): the neutral-id twin that supersedes this entry
    /// (the [`TableEntry::superseded_by`] semantics; metadata only,
    /// skipped at `None`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
}

/// A cue entry ([`CueParams`]: mass, tip radius, squirt end mass).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CueEntry {
    pub id: String,
    pub display_name: String,
    pub calibration: Calibration,
    pub params: CueParams,
    /// Catalog v14 (issue #283 de-branding decision): the generic-id
    /// entry that supersedes this one in user-facing pickers. `Some` =
    /// deprecated-but-resolving-forever: shipped records and share
    /// payloads pin this id and MUST keep resolving to byte-identical
    /// `params` (#232 immutability — the twin carries the SAME bytes,
    /// pinned by `v14_debranding_twins_and_supersession`), while pickers
    /// hide the entry and offer the named twin instead. The picker filter
    /// itself is app-side (the `ui_hidden` precedent, catalog v4) — this
    /// field is the kernel-truth DATA it filters on. Entry METADATA only:
    /// `resolve()` never reads it, so no value can move a physics byte.
    ///
    /// Serde: defaulted to `None` AND skipped at `None` — every
    /// non-superseded entry (including all pre-v14 fixtures/records)
    /// parses and re-serializes byte-identically.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
    /// Catalog v20 (#789): `true` = pickers filter the entry out, but the id
    /// keeps resolving (the [`TableEntry::ui_hidden`] semantics). Set only
    /// on the three cues whose `superseded_by` names a `pro_ld_pivot_*`
    /// twin, which turns their demotion into a rename migration.
    ///
    /// Rule (catalog v20, #789): `ui_hidden` + `superseded_by` = a RENAME
    /// migration (the app rewrites a persisted selection to the named
    /// twin); `superseded_by` alone = demote + grandfather (the picker
    /// demotes the entry and a persisted selection keeps it).
    ///
    /// Serde: additive (missing key = false; false is skipped, so every
    /// other entry serializes byte-identically).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub ui_hidden: bool,
}

/// A cushion-model entry: the ball–cushion resolver configuration slice of
/// [`SimOptions`] (model + friction hook + Zeno thresholds) plus the paired
/// table-response override the fit was performed with (the kernel pairing
/// rules previously documented only on the `SimOptions`/pool-py
/// constructors).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CushionModelEntry {
    pub id: String,
    pub display_name: String,
    pub calibration: Calibration,
    pub cushion_model: CushionModel,
    pub cushion_friction: CushionFriction,
    /// `Some` = this model was FITTED against a specific table cushion
    /// response; [`EquipmentCatalog::resolve`] applies it over the table
    /// entry's base response (e.g. `mathavan_fitted` ⇒ ee0 = 0.80).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_override: Option<CushionResponse>,
    /// [`SimOptions::bb_hop_min_height`] this model preset ships with.
    pub bb_hop_min_height: f64,
    /// [`SimOptions::bt_min_bounce_height`] this model preset ships with.
    pub bt_min_bounce_height: f64,
}

/// The embedded equipment registry (versioned; entries immutable once
/// shipped — see module doc). Obtain the shipped catalog via
/// [`EquipmentCatalog::get`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EquipmentCatalog {
    pub version: u32,
    pub tables: Vec<TableEntry>,
    pub cloths: Vec<ClothEntry>,
    pub ballsets: Vec<BallSetEntry>,
    pub cues: Vec<CueEntry>,
    pub cushion_models: Vec<CushionModelEntry>,
}

fn lit(source: &str) -> Calibration {
    Calibration::Literature {
        source: source.to_string(),
    }
}

fn cal(source: &str) -> Calibration {
    Calibration::Calibrated {
        source: source.to_string(),
    }
}

fn est(note: &str) -> Calibration {
    Calibration::Estimated {
        note: note.to_string(),
    }
}

fn tables() -> Vec<TableEntry> {
    vec![
        // Catalog v4 (catalog-policy ruling item 2/5): the kernel-default
        // geometry, HONESTLY labeled. The ID string is frozen (serde fill
        // for every legacy scenario/record + v1/v2 share links + fixtures),
        // so the ruling's "honest id" lands in the metadata instead: the
        // display name says what it is, the provenance names the real
        // source, and ui_hidden removes it from user-facing pickers.
        // Geometry/response are UNCHANGED (fixtures/goldens/reference calibration
        // pin them bit-exactly): pooltool's PocketTableSpecs — measured
        // from a 7-ft Showood HOME table — on the WPA 9-ft surface, whose
        // effective mouths/facings violate the WPA bands (corner 5.07" /
        // side 5.94", facings 140.3°/97.1° — the honesty-baseline table in
        // docs/verification/table-dimension-audit.md).
        TableEntry {
            id: DEFAULT_TABLE_ID.to_string(),
            display_name: "Legacy 9-ft (pooltool-derived)".to_string(),
            calibration: est(
                "legacy compatibility geometry, NOT a WPA reference despite \
                 the frozen id: pooltool layout.py/specs.py PocketTableSpecs \
                 (measured from a 7-ft Showood HOME table) on the WPA 9-ft \
                 100\"x50\" surface with the WPA 63.5% nose; effective \
                 mouths 5.07\"/5.94\" and facings 140.3/97.1 deg violate \
                 the WPA S9 bands (honesty baseline, \
                 table-dimension-audit.md (internal)); response \
                 docs/research/gap-k66-cushion-params.md",
            ),
            geometry: TableGeometry::Wpa9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: true,
            superseded_by: None,
        },
        // Catalog v4 (catalog-policy ruling item 3): the WPA Equipment
        // Specifications AS WRITTEN — "the specification as written" is a
        // legitimate reference; a home-table measurement wearing the spec's
        // name is not. Literature tier, cited to the WPA document. Cushion
        // pairing: stronge_realistic, the model the WPA-band-geometry
        // tables in this catalog pair with (diamond_proam_9ft precedent —
        // no WPA-specific bank fit exists; documented estimate, not a fit).
        TableEntry {
            id: "wpa_spec_9ft".to_string(),
            display_name: "WPA spec 9-ft (nominal)".to_string(),
            calibration: lit(
                "WPA Recommended Equipment Specifications (Nov 2001 ed., \
                 wpapool.com), nominal band values: 100\"x50\" surface \
                 (S5), nose 63.5% of ball diameter (S7 nominal), TRUE \
                 mouths 4.5625\"/5.0625\" (S9 band centers of 4.5-4.625 / \
                 5-5.125), facings 142/104 deg (S9), shelves 1.625\"/3/16\" \
                 (S9 band centers); disc radii ~ throat/2 (BU TDF \
                 convention) — per-value notes on \
                 PocketTableSpec::wpa_spec_9ft; the stronge_realistic \
                 pairing is the diamond_proam_9ft precedent, not a \
                 WPA-specific fit",
            ),
            geometry: TableGeometry::WpaSpec9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v4 (catalog-policy ruling item 4): re-derived from the
        // captured community measurements — the pre-v4 entry built the
        // pooltool geometry and was therefore MISLABELED (the ruling
        // supersedes the immutability rule for this entry). The calibrated
        // datum remains the PAIRING: the brand's measured SHORT bank
        // envelope (TP B.28 Diamond rows) is reproduced by the
        // stronge_realistic cushion model, which tracks the 9' Diamond Red
        // Label ladder 5/6 and the 7' Diamond bar-box ladder 6/6 at mean
        // dev 0.03 diamond (docs/verification/banking-report.md). Pickers
        // surface the pairing via `recommended_cushion_model_id`; `resolve`
        // never applies it implicitly. Named after the MEASURED table
        // generation: TP B.28 has no Pro-Am row, and current Blue Label
        // tables bank longer than this Red-Label envelope (Dr. Dave
        // Diamond FAQ, docs/research/banking-systems.md).
        TableEntry {
            id: "diamond_redlabel_9ft".to_string(),
            display_name: "Pool tournament 9-ft, older gen (4.56 in pockets) (legacy alias)".to_string(),
            calibration: cal(
                "geometry: AZB thread 48606 community measurement — 4 9/16\" \
                 corner mouth with single 1/8\" facings, the older-Diamond \
                 Red Label profile; side mouth 5 1/16\" DERIVED via \
                 Diamond's factory +1/2\" corner->side pairing (TrxR AZB \
                 540288); nose 1 7/16\" + corner shelf 1 3/4\" inferred \
                 from the shared Pro-Am hardware dossier \
                 (table-dimension-audit.md (internal) D2/D7; RKC's \
                 AZB 465370 names the red-label subrail); facings 141/102 \
                 deg (catalog v5) are RKC's published Diamond FACTORY cuts \
                 (AZB 2010 thread 184759 post #4 + 2017 thread 445936, \
                 mechanic testimony covering the Red Label era — a \
                 brand-level assumption upgraded from the pre-v5 WPA \
                 142/104 assumption; Diamond-authentic 102 sits OUTSIDE \
                 the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as \
                 written); side shelf 3/16\" stays a WPA assumption (D8). \
                 Bank pairing CALIBRATED by this project: \
                 stronge_realistic matches the TP B.28 9' Red Label ladder \
                 5/6 (banking-report.md (internal))",
            ),
            geometry: TableGeometry::DiamondRedLabel9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: true,
            superseded_by: Some("pool_pro_9ft_older_gen".to_string()),
        },
        // Catalog v3 (feature 009): FIRST entry whose GEOMETRY actually
        // differs from the WPA/pooltool default — measured Diamond Pro-Am
        // Pro-Cut pockets (true mouths 4.5"/5.0", 1 7/16" nose, 1 3/4"
        // corner shelf; facings 141°/102° since the catalog-v5 factory-cut
        // repin — RKC's published Diamond numbers replace the v3/v4 WPA
        // 142°/104° nominals). Cushion pairing: Diamond
        // ships the K-55 profile with Artemis Intercontinental No. 66
        // rubber on 9-footers (Diamond product page); NO catalog
        // cushion-model entry is a K-55/Artemis-specific fit, so this
        // entry pairs the CLOSEST existing model — stronge_realistic, the
        // model that reproduces the TP B.28 Diamond-brand short-bank
        // envelope (docs/verification/banking-report.md, the same
        // precedent as diamond_redlabel_9ft). DOCUMENTED GAP (follow-up
        // research item, audit doc §gaps): TP B.28 has no Pro-Am row and
        // no K-55/Artemis bank fit exists — do not read the pairing as a
        // Pro-Am-specific calibration.
        TableEntry {
            id: "diamond_proam_9ft".to_string(),
            display_name: "Pool tournament 9-ft (4.5 in pockets) (legacy alias)".to_string(),
            calibration: lit(
                "table-dimension-audit.md (internal) (feature 009 \
                 dossier D1-D13 + catalog-v5 facing repin): mouths \
                 4.5\"/5.0\" (West State dealer sheet; TrxR/rexus31 AZB \
                 threads), nose 1 7/16\" (RKC factory target, AZB 465370), \
                 corner shelf 1 3/4\" (jay helfert measurements); facings \
                 141/102 deg are RKC's published Diamond FACTORY cuts (AZB \
                 2010 'diamond pockets' thread 184759 post #4; 2017 \
                 'Pocket angles' thread 445936; JoeyInCali angle-finder \
                 spread ~+-1 deg) — mechanic testimony, not an official \
                 sheet; Diamond-authentic 102 sits OUTSIDE the WPA S9 \
                 104-105 band (wpa_spec_9ft keeps the spec as written); \
                 side shelf 3/16\" stays a WPA assumption — per-value \
                 tiers on PocketTableSpec::diamond_proam_9ft",
            ),
            geometry: TableGeometry::DiamondProAm9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: true,
            superseded_by: Some("pool_pro_9ft".to_string()),
        },
        // Catalog v3 (feature 009): Predator Apex 9-ft — mixed-tier record,
        // honestly Estimated. Cushion pairing gap: the Apex uses a K55
        // "Pro Speed" profile hard-bonded to an extruded-aluminium subrail
        // (SAM lineage) and NO bank-envelope data exists at all, so the
        // recommendation stays the kernel-default model (estimate, not a
        // fit).
        TableEntry {
            id: "predator_apex_9ft".to_string(),
            display_name: "Pool tournament 9-ft, metal-rim (4.25 in pockets) (legacy alias)".to_string(),
            calibration: est(
                "mixed-tier record (table-dimension-audit.md (internal) \
                 P1-P10): OFFICIAL dealer numbers are the 100\"x50\" surface \
                 and the 4.25\"/108 mm corner Pro Cut mouth (Knightshot/Beckmann \
                 spec tables + Predator email via AZB TrxR); the side mouth is \
                 4.92\"/124.97 mm from the official Predator Apex product-page \
                 spec (CAL-1, GH-484 dossier + P-A1 PR #590), superseding the \
                 dealer-relayed 5.0\"/127 mm; facings 142/104 deg, nose 63.5 %, shelves \
                 1.5\"/3/16\" are WPA assumptions (nothing published); no \
                 Apex bank data exists, so the recommended cushion model is \
                 the kernel default (estimate)",
            ),
            geometry: TableGeometry::PredatorApex9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: true,
            superseded_by: Some("pool_pro_9ft_metal_rim".to_string()),
        },
        // Catalog v6 (feature 012): WPBSA 12-ft snooker. Recommended
        // cushion pairing: mathavan_fitted — the Mathavan 2010 snooker
        // fits (e_e = 0.98, mu_w = 0.14, Riley Renaissance table) the
        // kernel already reproduces (Figs 7-10 anchors) are the ONLY
        // snooker-equipment cushion calibration in the catalog.
        TableEntry {
            id: "wpbsa_snooker_12ft".to_string(),
            display_name: "WPBSA 12-ft snooker".to_string(),
            calibration: cal(
                "playing area 3.569x1.778 m and all spot/baulk/D markings \
                 are official-spec (WPBSA Official Rules Rev. Sep 2024 Sec1 \
                 R1); pocket geometry is community-measured: the WPBSA \
                 2024-25 edition names pocket LOCATIONS only, the historical \
                 'templates authorised by the WPBSA' clause is gone and the \
                 official World Snooker templates are deliberately \
                 unpublished (4 physical templates, 'very secretly guarded' \
                 - Betway Insider, Jason Ferguson/Barry Hearn), so the best \
                 public numbers are the CEBP 'rationalised layout that \
                 closely matched the current TV templates as applied 2005/6' \
                 drawings (Dec 2007/Apr 2009, rulesofsnooker.ca via Wayback), \
                 independently corroborated by John Virgo via Northern \
                 Snooker & Pool Services (corner 3 5/16 in at the fall = the \
                 drawing's 3.313 in; ~3.5 in corner / 4 in middle at cushion \
                 top). 'There is no undercut of the cushion' (CEBP drawing \
                 note) - the builder produces none. CATALOG v7 (Amendment \
                 A1): the entry builds the CEBP template construction \
                 EXACTLY - label-exact tangent two-arc jaws (corner 3/4.5 \
                 in radii, junction 118.61 deg from the drawing's \
                 construction offsets; middle 3.125/2.094 in radii, drawn \
                 54 deg junction) as spanned CircularCushionSegments, rails \
                 ending at the jaw tangency points, NO straight facings, \
                 and the template fall circles (corner R 3.5 in on the \
                 slate-edge intersection, middle R 2.094 in on the centre \
                 line) as the point-of-no-return discs. The v6 full-circle \
                 jaw-radius clamps (documented FR-005 approximation) are \
                 RETIRED - they were a model-expressiveness artifact, not a \
                 dimension finding. Documented drawing-label residuals: the \
                 drawn arcs close the corner fall at 81.3 mm vs the label's \
                 3.313 in = 84.15 mm and the middle at 98.2 vs 99.21 mm \
                 (label rounding; the optional 58.816 deg middle-junction \
                 exactness knob is documented, not taken). Named residuals: \
                 directional nap effects (no citable quantitative model), \
                 rounded slate-fall roll-in behind the fall lip, \
                 pocket-template exactness. Nose 7R/5 (Mathavan 2010, \
                 Literature - the snooker-only convention). Bank pairing \
                 CALIBRATED: mathavan_fitted reproduces the Mathavan 2010 \
                 Figs 7-10 snooker-cushion anchors (research R1/R2/R8)",
            ),
            geometry: TableGeometry::WpbsaSnooker12Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "mathavan_fitted".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v6 (feature 012): UMB 2.84 m pocketless carom table —
        // the first pocketless geometry. Constant-COR baseline pairing:
        // van Balen showed constant COR beats Han's e(v) on carom
        // equipment (docs/research/gap-k66-cushion-params.md), and
        // han2005_default IS the constant-e0 model.
        TableEntry {
            id: "umb_carom_284".to_string(),
            display_name: "UMB carom 2.84 m (pocketless)".to_string(),
            calibration: lit(
                "UMB World Rules of Carom Billiard (1 Jan 1989): playing \
                 surface 2.84x1.42 m +-5 mm (Art 11.4), cushion nose 37 mm \
                 +-1 (Art 11.3 - the only discipline whose governing body \
                 publishes an actual nose height, official-spec), mandatory \
                 slate heating (Art 11.9 - named as an UNQUANTIFIED residual \
                 on the carom_worsted_heated cloth entry; Shamos: ~5 degC \
                 above ambient for 'best possible rolling'). Corner \
                 junctions: two segments meeting at 90 deg, \
                 collision-complete via the inclusive span check; the ~mm \
                 mitred-rubber fillet of a real corner is a documented \
                 unmodeled residual (research R3). Official World Cup \
                 hardware for context (UMB World Cup rules 15.12.2025 p9): \
                 VECTOR cushions 'same profile and same dimensions as the \
                 Kleber P37 type', Simonis cloth, Aramith balls. Cushion \
                 pairing: constant-COR baseline han2005_default - van Balen \
                 showed constant COR beats Han's e(v) on carom equipment \
                 (docs/research/gap-k66-cushion-params.md); Han-2005 \
                 tangential parameters non-public beyond the abstract",
            ),
            geometry: TableGeometry::CaromUmb284,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v6 (feature 012 FR-015) shipped this id as the
        // Chinese-eight class; catalog v15 (GH-490) de-brands the class to
        // chinese8_pro_9ft and keeps this id as a deprecated RESOLVE-ONLY
        // alias (replays/persisted selections pin table ids — the
        // wpa_generic_9ft legacy-resolution regime). It resolves to the
        // SAME repinned geometry as the new entry (the owner-approved v15
        // width repin applies to this id too, v5-Diamond precedent).
        TableEntry {
            id: "joy_q8_9ft".to_string(),
            display_name: "Chinese 8-ball tournament 9-ft (legacy alias)".to_string(),
            calibration: est(
                "DEPRECATED de-brand alias (GH-490, catalog v15): \
                 superseded by chinese8_pro_9ft - this id stays resolve-only \
                 because replays and persisted selections pin table ids \
                 (the wpa_generic_9ft legacy-resolution regime; \
                 picker-hidden via ui_hidden). Resolves to the SAME \
                 repinned geometry as chinese8_pro_9ft: 2540x1260 mm - the \
                 v6/v7 width 1270 followed a dealer spec sheet, but the \
                 manufacturer's own official site and the WPA Rules of \
                 Heyball agree on 1260, so the old note's 'manufacturer \
                 1270 mm width wins' rationale was falsified; approved \
                 repin (GH-484 decision card 2026-08-09, v5-Diamond \
                 precedent - replays pinning this id re-simulate on the new \
                 geometry). Full provenance dossier: the chinese8_pro_9ft \
                 entry",
            ),
            geometry: TableGeometry::Chinese8Pro9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: true,
            superseded_by: None,
        },
        // Catalog v21 (GH-1080, card 41): corner F2 (photo-fit nose
        // fillet) and middle M-c (`MiddlePocketFamily::Cn8Arc1`) repin; the
        // note below records both and the corrected middle-estimate history.
        // Catalog v15 (GH-490; GH-484 owner decision card 2026-08-09):
        // the de-branded Chinese-eight tournament class — supersedes
        // joy_q8_9ft (kept above as a resolve-only alias) and carries the
        // owner-approved width repin 1270 -> 1260 mm plus the GH-484
        // research-synthesis provenance upgrades. Honest Estimated tier —
        // manufacturer mouths + snooker-template-scaled internals;
        // pool-default cushion pairing (no bank/COR data for the steel
        // cushion exists anywhere, documented estimate pending the
        // broadcast-footage calibration program).
        TableEntry {
            id: "chinese8_pro_9ft".to_string(),
            display_name: "Chinese 8-ball tournament 9-ft".to_string(),
            calibration: est(
                "De-branded Chinese-eight tournament class (GH-490; the \
                 v6/v7 joy_q8_9ft entry is its deprecated resolve-only \
                 alias - replays pin table ids). Playing surface \
                 2540x1260 mm: the manufacturer's own official site AND \
                 the WPA Rules of Heyball (eff. 2025) 2540x1260 mm +-9 \
                 AGREE at 1260; the v6/v7 width 1270 followed a dealer \
                 spec sheet + the CBSA Chinese-rules text - REPINNED under \
                 the v5-Diamond precedent (decision card 2026-08-09; \
                 replays pinning either id re-simulate on this geometry). \
                 Corner mouth 85 mm ('Curved Pockets ... 3.84 inch (85mm) \
                 wide open' - the inch figure is an internal conversion \
                 typo, 85 mm = 3.35 in) is the FALL opening measured at \
                 the cushion noses; the CBSA-circulating 105+-1 mm figure \
                 (traced to a nine-ball equipment paragraph, GH-1080 D1) \
                 is measured at the leather-ring inner edge - a DIFFERENT \
                 measurement datum, not a conflict (recorded so future \
                 audits never 'fix' 85 to 105). CORNER pockets (catalog \
                 v21, GH-1080 F2 - a photo-fit repin of the v16 GH-490 \
                 R82 molded-mouth construction for the kernel collision \
                 surfaces): each rail nose departs at Y_N 90.151 mm into \
                 a nose fillet R72.199 mm (PHOTO-FIT nominal: the \
                 clamp-free pooled fit over four calibrated broadcast \
                 frames, zero edge offset; the fit met its fixed 85 mm \
                 constraint at a deep R12.6 wall-to-ring blend, so the \
                 nose was effectively free; the later sharp R0 junction \
                 ruling removed that blend) and runs onto the capture \
                 disc = the O105 mouth circle about the drawing O_f, 3.5 \
                 mm beyond both nose lines (the 105 datum; = the visible \
                 bed hole and the cammatch mouth-gate datum - ADR-0015 \
                 single-source convergence; the collision fillet ends at \
                 the drawing's X_N station, where the two jaws stand \
                 87.10 mm apart). The rest of the fillet (with the \
                 narrowest nose gap, 85.200 mm), the throat wall beyond \
                 it (opening 3.411 deg per side) and its sharp junction \
                 with the leather ring (on the disc rim) lie within the \
                 disc, collision-unreachable. F2 supersedes the v16 R45 \
                 nose rolls from Y_N 78.744 mm as the selected nominal; \
                 the four frames alone do not exclude R45 (a 1 px common \
                 edge offset reorders R45, F2 and the wider F1, GH-1080 \
                 D2a). The v7-v15 scaled-CEBP corner (two-arc horns r \
                 76.97/115.45, fall disc O179.6) stays retired: the \
                 GH-490 photo measurement chain read horn-end gap 111-120 \
                 mm / fall-rim ~105 mm against that template, and the \
                 two-layer ruling had shipped the real construction \
                 render-side with the kernel registered as the outlier. \
                 MIDDLE pockets (catalog v21, GH-1080 M-c): arc 1 of the \
                 CEBP snooker template under the UNIFORM scale pinned to \
                 the fall opening - middle 100/99.21 = 1.0079 - swept \
                 from its rail tangency on to the template capture \
                 circle, one arc per jaw (the template's second arc \
                 leaves the collision surfaces). The rendered 90 deg end \
                 face at a nose width of 87 mm (GB/T 22751 middle \
                 86+-1 read at nose height plus the photo deck-slot \
                 reading; flush-face assumption) lies inside the capture \
                 disc. The ~100 mm scale basis keeps its v7 role but not \
                 its v7 corroboration: the comparable Xingjue 89/101 mm \
                 corner/middle pairing is a snooker specification and \
                 the CBSA corner+15 mm text is a nine-ball convention \
                 (GH-1080 D1), while the four-frame broadcast photo \
                 check (GH-1080 D2a) finds the template arc fits the \
                 visible middle jaw points as well as a free photo arc. \
                 The middle scale deliberately pins against the \
                 PUBLISHED opening, never the drawn-arc closure value \
                 (drawing-label rounding). Cushion width 47.625 mm x the \
                 corner scale 85/84.15 = 1.0101 (template-family \
                 assumption, research R8; the corner scale no longer \
                 drives the jaw/fall construction). \
                 Nose height 0.635 = 36.29 mm on the 57.15 mm ball \
                 (Estimated, retailer-cited: steel-cushion fitting guides \
                 quote 36-38 mm ~ 63-64% of the ball, bracketing the WPA \
                 S7 window default we keep; the manufacturer publishes \
                 none). Cushion construction: patented inverted-L steel \
                 frame - NO published rebound data, so the recommended \
                 cushion model stays the pool default (estimate pending \
                 the dedicated broadcast calibration wave). Cloth pairing: \
                 snooker_napped as the nearest CITED napped-wool set (the \
                 manufacturer-confirmed official cloth is LiberWin 8848 \
                 napped wool ~730 g/m^2 - no published friction data; \
                 documented approximation). Balls: aramith_pool 57.15 mm \
                 (WPA Heyball band 156-170 g; NOTE: the WPA mandates the \
                 UNITY ball set from 2025-08-25 - an equipment-styling \
                 note, the 57.15 mm pairing stays physically compliant \
                 per the decision record)",
            ),
            geometry: TableGeometry::Chinese8Pro9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v18 (GH-621): the Diamond Pro-Am SIZE VARIANTS — additive
        // only, appended in order (8 ft, then 7 ft); no existing entry
        // moves (spec-dump-proven on the PR). Geometry = the
        // diamond_proam_9ft spec by struct update with only length/width
        // changed: the pocket furniture is ONE part across sizes (see
        // PocketTableSpec::diamond_proam_8ft for the manufacturer sources
        // and the honest limit — the official drawings dimension the bed,
        // envelope and legs, NOT the pockets). Cushion pairing:
        // stronge_realistic, the Diamond-brand precedent; TP B.28 has no
        // 8-ft row, so for THIS size the pairing is the brand estimate,
        // not a fit (Literature tier, like the 9-ft Pro-Am).
        TableEntry {
            id: "diamond_proam_8ft".to_string(),
            display_name: "Pool tournament 8-ft (4.5 in pockets) (legacy alias)".to_string(),
            calibration: lit(
                "GH-621 size variant of diamond_proam_9ft: bed 90\"x45\" \
                 (official Diamond 8 ft Pro-Am dimension drawing, dossier \
                 01-official/official-specsheet-8ft-proam.png — overall \
                 104\"x59\", legs 89.75\"x44.75\", rail-top height 32\", \
                 clearance 15\"); pocket furniture BYTE-IDENTICAL to the \
                 9-ft entry by struct update (mouths 4.5\"/5.0\", facings \
                 141/102 deg = RKC's published Diamond FACTORY cuts, AZB \
                 184759 post #4 / 445936, nose 1 7/16\", shelves \
                 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA \
                 S9 104-105 band, wpa_spec_9ft keeps the spec as written); \
                 the invariance is corroborated by size-agnostic \
                 manufacturer statements (factory pro-cut 4 1/2\" 'DID YOU \
                 KNOW' block; ONE OEM pocket SKU for Pro-Am and Smart \
                 tables; the identical 7.0\" rail band on all three official \
                 drawings) — the drawings carry NO pocket dimension; rubber: \
                 Black Diamond K55 on 7'/8' (Artemis IC66 K55 on 9'/10'), \
                 same profile, no published rebound, response unchanged; \
                 bank pairing stronge_realistic = the diamond_proam_9ft \
                 brand precedent (TP B.28 has no 8-ft row)",
            ),
            geometry: TableGeometry::DiamondProAm8Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: true,
            superseded_by: Some("pool_pro_8ft".to_string()),
        },
        // Catalog v18 (GH-621): the 7-ft bar box. Same derivation; this is
        // the ONE size with a direct bank datum — TP B.28's "7' Diamond bar
        // box" row, which the stronge_realistic ladder tracks 6/6 at mean
        // dev 0.03 diamond (docs/verification/banking-report.md) — so the
        // pairing is CALIBRATED tier here (the diamond_redlabel_9ft
        // precedent), read as brand+size class evidence: TP B.28 does not
        // name the model generation of its bar box.
        TableEntry {
            id: "diamond_proam_7ft".to_string(),
            display_name: "Pool tournament 7-ft, bar box (4.5 in pockets) (legacy alias)".to_string(),
            calibration: cal(
                "geometry: GH-621 size variant of diamond_proam_9ft — bed \
                 80\"x40\" (official Diamond 7 ft Pro-Am dimension drawing, \
                 dossier 01-official/official-specsheet-7ft-proam.png — \
                 overall 94\"x54\", legs 79.75\"x39.75\", rail-top height \
                 32\", clearance 15\"); pocket furniture BYTE-IDENTICAL to \
                 the 9-ft entry by struct update (mouths 4.5\"/5.0\", facings \
                 141/102 deg = RKC's published Diamond FACTORY cuts, AZB \
                 184759 post #4 / 445936, nose 1 7/16\", shelves \
                 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA \
                 S9 104-105 band, wpa_spec_9ft keeps the spec as written), \
                 invariance corroborated by size-agnostic manufacturer \
                 statements (see the 8-ft entry) — the drawings carry NO \
                 pocket dimension; rubber: Black Diamond K55 on 7'/8', same \
                 profile as the 9-ft Artemis, no published rebound, response \
                 unchanged. Bank pairing CALIBRATED by this project: \
                 stronge_realistic matches the TP B.28 7' Diamond bar-box \
                 ladder 6/6 at mean dev 0.03 diamond \
                 (banking-report.md (internal)) — brand+size class \
                 evidence, TP B.28 does not name the bar box's model \
                 generation",
            ),
            geometry: TableGeometry::DiamondProAm7Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: true,
            superseded_by: Some("pool_pro_7ft".to_string()),
        },
        // Catalog v18 (Rasson tables lane, Table 2 wave OX-A1): Rasson OX
        // 9-ft American pool. Owner ruling 2026-09-01: modelled FROM the
        // purchased Rasson OX reference model; official OX truth is the
        // dimensional datum; deltas disclosed in OB-ROX-GEO-001. Honest
        // Estimated tier — official surface/mouths/cushion identity; under
        // LAW-PURCHASED-BASELINE (r6) the facings, jaw radii and side
        // shelf are MODEL reads and the corner shelf is DERIVED at the
        // MFR mouth (corner CP-05/C6, side C12/C16); Klematch P59
        // (K55) datasheet (Shore A 43 +- 3, DIN 53512 rebound 75 +- 5 %) is
        // REGISTERED as a calibration prior, never dialled: the recommended
        // cushion model stays the kernel default (no OX bank data exists).
        TableEntry {
            id: "rasson_ox_9ft".to_string(),
            display_name: "Pool tournament 9-ft, K55 cushion (4.5 in pockets) (legacy alias)".to_string(),
            calibration: est(
                "Rasson OX (gen-1) American-pool table, canonical definition \
                 docs/geometry/rasson-ox-9ft-table-definition.json \
                 (OB-ROX-GEO-001, the only canonical source; the Drive \
                 dossier it cites, openbilliards/dossier-rasson-9ft/, is a \
                 read-back-verified working set on the Drive desktop mount \
                 - 1772 files, verified at adoption - not a second canonical \
                 source). \
                 OFFICIAL (rasson.cn design sheet + 配置单): playing surface \
                 2540x1270 mm = 100\"x50\", pocket openings 'WPA 标准 中袋 127 mm, \
                 角袋 114 mm' = the 4.5\"/5.0\" retail cut (this entry); the \
                 Matchroom 4\"/4.5\" event cut, the EPBF 110/125 cut and the \
                 post-Apr-2022 factory default 4\"/5\" are documented VARIANTS, \
                 not this entry (conflict C4). PROVENANCE LAW (lane ruling, \
                 r6): purchased model = baseline, Rasson/WPA data \
                 corrects, nothing authored; every number is tagged. MODEL \
                 (raw mm reads; the A1 ball-scale k is rejected): cushion \
                 width 48.072, facings 141.25/99.98 deg (planar cheek fits; \
                 the side lies outside WPA 104+-1 - ruling O3 = A for the \
                 model), jaw radii 8.645/2.962 mm (nose-tip round at the \
                 ball equator, bed+28.575, strict tangent window, 8 tips / 4 \
                 ends), side shelf 8.695 (C16 fillet tangent of the slate top \
                 round, the corner's lip definition). \
                 DERIVED: throats 98.10/110.95 = MFR mouth - MODEL cheek \
                 setback; corner shelf 45.43 = MODEL slate lip on the \
                 diagonal + MFR mouth/2. MFR(WPA): nose 63.5 % - the model's \
                 0.615 is outside the 63.5+-1 % band (C3). Reference \
                 model = 3dsky 'rasson_9ft' (an 8-ft-pro-size OX cut at the \
                 Matchroom 4\" mouth): numbers only, no asset bytes. Cushion \
                 Klematch P59 (K55): Shore A 43+-3, DIN 53512 rebound 75+-5 % \
                 registered as a calibration prior (never dialled); no OX bank \
                 data exists, so the recommended cushion model is the kernel \
                 default (estimate)",
            ),
            geometry: TableGeometry::RassonOx9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: true,
            superseded_by: Some("pool_pro_9ft_k55".to_string()),
        },
        // Catalog v20 (#789): the de-branded twins of the pool tables above,
        // appended in their old entries' catalog order (the v5 gate compares
        // the first v5.len() entries by position, so a twin placed among them
        // would shift a pinned entry). Each twin carries its old entry's
        // calibration text with the old ids mapped to the neutral ids
        // (brand words stay as nominative citations; a constructor path such
        // as a `PocketTableSpec::` name is kept verbatim), the same cushion
        // response and pairing, and a `PoolPro*` geometry variant that
        // selects the same constructor. The old entries stay resolvable,
        // `ui_hidden` and superseded by these twins.
        // Pinned by `v20_debranding_twins_byte_identical`.
        TableEntry {
            id: "pool_pro_9ft_older_gen".to_string(),
            display_name: "Pool tournament 9-ft, older gen (4.56 in pockets)".to_string(),
            calibration: cal(
                "geometry: AZB thread 48606 community measurement — 4 9/16\" \
                 corner mouth with single 1/8\" facings, the older-Diamond \
                 Red Label profile; side mouth 5 1/16\" DERIVED via \
                 Diamond's factory +1/2\" corner->side pairing (TrxR AZB \
                 540288); nose 1 7/16\" + corner shelf 1 3/4\" inferred \
                 from the shared Pro-Am hardware dossier \
                 (table-dimension-audit.md (internal) D2/D7; RKC's \
                 AZB 465370 names the red-label subrail); facings 141/102 \
                 deg (catalog v5) are RKC's published Diamond FACTORY cuts \
                 (AZB 2010 thread 184759 post #4 + 2017 thread 445936, \
                 mechanic testimony covering the Red Label era — a \
                 brand-level assumption upgraded from the pre-v5 WPA \
                 142/104 assumption; Diamond-authentic 102 sits OUTSIDE \
                 the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as \
                 written); side shelf 3/16\" stays a WPA assumption (D8). \
                 Bank pairing CALIBRATED by this project: \
                 stronge_realistic matches the TP B.28 9' Red Label ladder \
                 5/6 (banking-report.md (internal))",
            ),
            geometry: TableGeometry::PoolPro9FtOlderGen,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        TableEntry {
            id: "pool_pro_9ft".to_string(),
            display_name: "Pool tournament 9-ft (4.5 in pockets)".to_string(),
            calibration: lit(
                "table-dimension-audit.md (internal) (feature 009 \
                 dossier D1-D13 + catalog-v5 facing repin): mouths \
                 4.5\"/5.0\" (West State dealer sheet; TrxR/rexus31 AZB \
                 threads), nose 1 7/16\" (RKC factory target, AZB 465370), \
                 corner shelf 1 3/4\" (jay helfert measurements); facings \
                 141/102 deg are RKC's published Diamond FACTORY cuts (AZB \
                 2010 'diamond pockets' thread 184759 post #4; 2017 \
                 'Pocket angles' thread 445936; JoeyInCali angle-finder \
                 spread ~+-1 deg) — mechanic testimony, not an official \
                 sheet; Diamond-authentic 102 sits OUTSIDE the WPA S9 \
                 104-105 band (wpa_spec_9ft keeps the spec as written); \
                 side shelf 3/16\" stays a WPA assumption — per-value \
                 tiers on PocketTableSpec::diamond_proam_9ft",
            ),
            geometry: TableGeometry::PoolPro9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        TableEntry {
            id: "pool_pro_9ft_metal_rim".to_string(),
            display_name: "Pool tournament 9-ft, metal-rim (4.25 in pockets)".to_string(),
            calibration: est(
                "mixed-tier record (table-dimension-audit.md (internal) \
                 P1-P10): OFFICIAL dealer numbers are the 100\"x50\" surface \
                 and the 4.25\"/108 mm corner Pro Cut mouth (Knightshot/Beckmann \
                 spec tables + Predator email via AZB TrxR); the side mouth is \
                 4.92\"/124.97 mm from the official Predator Apex product-page \
                 spec (CAL-1, GH-484 dossier + P-A1 PR #590), superseding the \
                 dealer-relayed 5.0\"/127 mm; facings 142/104 deg, nose 63.5 %, shelves \
                 1.5\"/3/16\" are WPA assumptions (nothing published); no \
                 Apex bank data exists, so the recommended cushion model is \
                 the kernel default (estimate)",
            ),
            geometry: TableGeometry::PoolPro9FtMetalRim,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v20 (#789): the neutral twin of the v8 Measured table
        // entry, with the same params and the neutral session, doc and
        // param key. Geometry REUSES the pool_pro_9ft spec: the session's
        // sight-grid homography confirms that playing field independently
        // at 0.33-0.38 mm RMS. Cushion response stays the kernel model
        // (constant e0 = 0.85), which the measured low-spin band brackets;
        // no e(v) curve is fitted. Cushion pairing: stronge_realistic, as
        // on the pool_pro_9ft entry. Record-tier anchors:
        // tests/anchors_pool_9ft_measured.rs; provenance:
        // docs/verification/pool-9ft-measured-calibration.md.
        TableEntry {
            id: "pool_pro_9ft_measured".to_string(),
            display_name: "Pool tournament 9-ft (measured response)".to_string(),
            calibration: Calibration::Measured {
                session: "pool-9ft-measured-s1".to_string(),
                date: CALIBRATION_DATE_AT_ADOPTION.to_string(),
                values: vec![
                    MeasuredParam {
                        param: "validation:geometry.pool_pro_9ft".to_string(),
                        value: 0.00035,
                        sigma: 0.00003,
                        note: "diamond-sight homography fit RMS [m] across the \
                               four overhead clips (0.33-0.38 mm) on the \
                               2540x1270 mm L/8 = 317.5 mm sight grid - \
                               independently confirms the reused \
                               pool_pro_9ft playing-field geometry"
                            .to_string(),
                    },
                    MeasuredParam {
                        param: "validation:cushion_response.e0".to_string(),
                        value: 0.867,
                        sigma: 0.058,
                        note: "B-set tier2 low-spin (still-sliding) arrivals \
                               1.42-1.69 m/s, n=5; full low-spin band \
                               0.84-0.94 over 1.4-2.9 m/s BRACKETS the kernel \
                               constant e0 = 0.85 - response KEPT at the \
                               kernel model, no e(v) refit from two \
                               spin-confounded tiers (fixture gaps)"
                            .to_string(),
                    },
                    MeasuredParam {
                        param: "validation:cushion.pure_roll_rebound".to_string(),
                        value: 0.645,
                        sigma: 0.032,
                        note: "pure-roll arrivals 0.48-0.85 m/s (n=5, roll \
                               ratio 1.02-1.03; independent c0-slide pipeline \
                               0.670+-0.018 agrees): spin-cushion coupling \
                               consistent with the TP B.6 rolling-arrival \
                               anchor ~0.7, a cushion-MODEL observable, not a \
                               restitution deficit"
                            .to_string(),
                    },
                ],
                doc: "pool-9ft-measured-calibration.md (internal)".to_string(),
            },
            geometry: TableGeometry::PoolPro9Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        TableEntry {
            id: "pool_pro_8ft".to_string(),
            display_name: "Pool tournament 8-ft (4.5 in pockets)".to_string(),
            calibration: lit(
                "GH-621 size variant of pool_pro_9ft: bed 90\"x45\" \
                 (official Diamond 8 ft Pro-Am dimension drawing, dossier \
                 01-official/official-specsheet-8ft-proam.png — overall \
                 104\"x59\", legs 89.75\"x44.75\", rail-top height 32\", \
                 clearance 15\"); pocket furniture BYTE-IDENTICAL to the \
                 9-ft entry by struct update (mouths 4.5\"/5.0\", facings \
                 141/102 deg = RKC's published Diamond FACTORY cuts, AZB \
                 184759 post #4 / 445936, nose 1 7/16\", shelves \
                 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA \
                 S9 104-105 band, wpa_spec_9ft keeps the spec as written); \
                 the invariance is corroborated by size-agnostic \
                 manufacturer statements (factory pro-cut 4 1/2\" 'DID YOU \
                 KNOW' block; ONE OEM pocket SKU for Pro-Am and Smart \
                 tables; the identical 7.0\" rail band on all three official \
                 drawings) — the drawings carry NO pocket dimension; rubber: \
                 Black Diamond K55 on 7'/8' (Artemis IC66 K55 on 9'/10'), \
                 same profile, no published rebound, response unchanged; \
                 bank pairing stronge_realistic = the pool_pro_9ft \
                 brand precedent (TP B.28 has no 8-ft row)",
            ),
            geometry: TableGeometry::PoolPro8Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        TableEntry {
            id: "pool_pro_7ft".to_string(),
            display_name: "Pool tournament 7-ft, bar box (4.5 in pockets)".to_string(),
            calibration: cal(
                "geometry: GH-621 size variant of pool_pro_9ft — bed \
                 80\"x40\" (official Diamond 7 ft Pro-Am dimension drawing, \
                 dossier 01-official/official-specsheet-7ft-proam.png — \
                 overall 94\"x54\", legs 79.75\"x39.75\", rail-top height \
                 32\", clearance 15\"); pocket furniture BYTE-IDENTICAL to \
                 the 9-ft entry by struct update (mouths 4.5\"/5.0\", facings \
                 141/102 deg = RKC's published Diamond FACTORY cuts, AZB \
                 184759 post #4 / 445936, nose 1 7/16\", shelves \
                 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA \
                 S9 104-105 band, wpa_spec_9ft keeps the spec as written), \
                 invariance corroborated by size-agnostic manufacturer \
                 statements (see the 8-ft entry) — the drawings carry NO \
                 pocket dimension; rubber: Black Diamond K55 on 7'/8', same \
                 profile as the 9-ft Artemis, no published rebound, response \
                 unchanged. Bank pairing CALIBRATED by this project: \
                 stronge_realistic matches the TP B.28 7' Diamond bar-box \
                 ladder 6/6 at mean dev 0.03 diamond \
                 (banking-report.md (internal)) — brand+size class \
                 evidence, TP B.28 does not name the bar box's model \
                 generation",
            ),
            geometry: TableGeometry::PoolPro7Ft,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: "stronge_realistic".to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
        TableEntry {
            id: "pool_pro_9ft_k55".to_string(),
            display_name: "Pool tournament 9-ft, K55 cushion (4.5 in pockets)".to_string(),
            calibration: est(
                "Rasson OX (gen-1) American-pool table, canonical definition \
                 docs/geometry/rasson-ox-9ft-table-definition.json \
                 (OB-ROX-GEO-001, the only canonical source; the Drive \
                 dossier it cites, openbilliards/dossier-rasson-9ft/, is a \
                 read-back-verified working set on the Drive desktop mount \
                 - 1772 files, verified at adoption - not a second canonical \
                 source). \
                 OFFICIAL (rasson.cn design sheet + 配置单): playing surface \
                 2540x1270 mm = 100\"x50\", pocket openings 'WPA 标准 中袋 127 mm, \
                 角袋 114 mm' = the 4.5\"/5.0\" retail cut (this entry); the \
                 Matchroom 4\"/4.5\" event cut, the EPBF 110/125 cut and the \
                 post-Apr-2022 factory default 4\"/5\" are documented VARIANTS, \
                 not this entry (conflict C4). PROVENANCE LAW (lane ruling, \
                 r6): purchased model = baseline, Rasson/WPA data \
                 corrects, nothing authored; every number is tagged. MODEL \
                 (raw mm reads; the A1 ball-scale k is rejected): cushion \
                 width 48.072, facings 141.25/99.98 deg (planar cheek fits; \
                 the side lies outside WPA 104+-1 - ruling O3 = A for the \
                 model), jaw radii 8.645/2.962 mm (nose-tip round at the \
                 ball equator, bed+28.575, strict tangent window, 8 tips / 4 \
                 ends), side shelf 8.695 (C16 fillet tangent of the slate top \
                 round, the corner's lip definition). \
                 DERIVED: throats 98.10/110.95 = MFR mouth - MODEL cheek \
                 setback; corner shelf 45.43 = MODEL slate lip on the \
                 diagonal + MFR mouth/2. MFR(WPA): nose 63.5 % - the model's \
                 0.615 is outside the 63.5+-1 % band (C3). Reference \
                 model = 3dsky 'rasson_9ft' (an 8-ft-pro-size OX cut at the \
                 Matchroom 4\" mouth): numbers only, no asset bytes. Cushion \
                 Klematch P59 (K55): Shore A 43+-3, DIN 53512 rebound 75+-5 % \
                 registered as a calibration prior (never dialled); no OX bank \
                 data exists, so the recommended cushion model is the kernel \
                 default (estimate)",
            ),
            geometry: TableGeometry::PoolPro9FtK55,
            cushion_response: CushionResponse::default(),
            recommended_cushion_model_id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            ui_hidden: false,
            superseded_by: None,
        },
    ]
}

fn cloths() -> Vec<ClothEntry> {
    // Migration of the four ClothPreset constructors (cloth-presets wave) —
    // the constructors stay as thin aliases; per-value provenance lives on
    // them (crate::params) and is summarized here.
    vec![
        ClothEntry {
            id: DEFAULT_CLOTH_ID.to_string(),
            display_name: "Worsted tournament cloth (new) (legacy alias)".to_string(),
            calibration: lit(
                "Dr. Dave physical-properties FAQ u_s=0.2; Waldron \
                 stimpmeter u_r; pooltool default spin decay \
                 (docs/research/cloth-calibration.md) — identical to the \
                 kernel default",
            ),
            params: ClothPreset::simonis_860_tournament(),
            ui_hidden: true,
            superseded_by: Some("pool_worsted_new".to_string()),
        },
        ClothEntry {
            id: "simonis_760_fast".to_string(),
            display_name: "Worsted tournament cloth (fast) (legacy alias)".to_string(),
            calibration: est(
                "u_r=0.008 from AzBilliards installer estimate (760 ~30% \
                 faster roll than 860, MEDIUM confidence); no published 760 \
                 u_s or spin-decay measurement (research GAP) — \
                 docs/research/cloth-calibration.md",
            ),
            params: ClothPreset::simonis_760_fast(),
            ui_hidden: true,
            superseded_by: Some("pool_worsted_fast".to_string()),
        },
        ClothEntry {
            id: "worn_slow".to_string(),
            display_name: "Worn/dirty slow cloth".to_string(),
            calibration: est(
                "u_r=0.016 mid of Jewett-slow..Marlow band; u_s=0.25 \
                 direction from Dr. Dave cloth-effects FAQ, no instrumented \
                 number — docs/research/cloth-calibration.md",
            ),
            params: ClothPreset::worn_slow(),
            ui_hidden: false,
            superseded_by: None,
        },
        ClothEntry {
            id: "snooker_napped".to_string(),
            display_name: "Snooker napped wool".to_string(),
            calibration: lit(
                "Mathavan et al. 2010 first-hand measurements: u_s \
                 0.178-0.245 (avg 0.212), u_r 0.0127-0.0129, sidespin decay \
                 22 rad/s^2 — docs/research/literature.md",
            ),
            params: ClothPreset::snooker_napped(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v6 (feature 012): heated worsted carom cloth — honest
        // Estimated tier; no params.rs preset constructor (catalog-only
        // entry, unlike the four v1 cloths that alias ClothPreset
        // constructors for the legacy v2-wire ids).
        ClothEntry {
            id: "carom_worsted_heated".to_string(),
            display_name: "Carom worsted (heated slate)".to_string(),
            calibration: est(
                "pooltool params.py BILLIARD_GENERIC friction trio: u_s \
                 0.2, u_r 0.01, R-proportional spin-decay default (the \
                 same u_sp convention as the pool cloths; the trio pairs \
                 with the carom ballset's f_c = 0.15) - pooltool's own \
                 NOTE says these values are 'not well researched'; no \
                 better citable carom-cloth measurement was found \
                 (research R8). NAMED UNQUANTIFIED RESIDUAL: UMB Art 11.9 \
                 mandates slate heating (Shamos: ~5 degC above ambient, \
                 purpose 'best possible rolling') but no citable \
                 quantitative friction model of the heating delta exists - \
                 heated worsted carom cloth is qualitatively faster than \
                 pool cloth in every source, so this Estimated-tier \
                 generic set with the residual named is more honest than \
                 a wrong Literature-tier pairing",
            ),
            params: ClothPreset {
                u_s: 0.2,
                u_r: 0.01,
                // pooltool u_sp_proportionality = 10*2/5/9 (R-scaled),
                // identical convention to the pool cloths.
                u_sp_scale: 10.0 * 2.0 / 5.0 / 9.0,
                // no ball–slate restitution override (keeps the carom
                // ballset's e_t; the trio is the cited surface here)
                e_t: None,
            },
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v20 (#789): the de-branded twins of the two pool cloths
        // above, appended in their old entries' catalog order; the same
        // params constructor and the calibration text with the old ids
        // mapped (the `ClothPreset::` constructor paths are kept). Pinned by
        // `v20_debranding_twins_byte_identical`.
        ClothEntry {
            id: "pool_worsted_new".to_string(),
            display_name: "Worsted tournament cloth (new)".to_string(),
            calibration: lit(
                "Dr. Dave physical-properties FAQ u_s=0.2; Waldron \
                 stimpmeter u_r; pooltool default spin decay \
                 (docs/research/cloth-calibration.md) — identical to the \
                 kernel default",
            ),
            params: ClothPreset::simonis_860_tournament(),
            ui_hidden: false,
            superseded_by: None,
        },
        ClothEntry {
            id: "pool_worsted_fast".to_string(),
            display_name: "Worsted tournament cloth (fast)".to_string(),
            calibration: est(
                "u_r=0.008 from AzBilliards installer estimate (760 ~30% \
                 faster roll than 860, MEDIUM confidence); no published 760 \
                 u_s or spin-decay measurement (research GAP) — \
                 docs/research/cloth-calibration.md",
            ),
            params: ClothPreset::simonis_760_fast(),
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v20 (#789): the neutral twin of the v8 Measured cloth
        // entry, with the same params and the neutral session and doc
        // (pairs with pool_pro_9ft_measured). u_r is a REPRESENTATIVE
        // constant: the arithmetic mid of the two measured plateaus of the
        // speed-dependent rolling resistance; the full band lives on the
        // Measured values.
        ClothEntry {
            id: "pool_worsted_measured".to_string(),
            display_name: "Tournament cloth (measured friction)".to_string(),
            calibration: Calibration::Measured {
                session: "pool-9ft-measured-s1".to_string(),
                date: CALIBRATION_DATE_AT_ADOPTION.to_string(),
                values: vec![
                    MeasuredParam {
                        param: "cloth.u_s".to_string(),
                        value: 0.247,
                        sigma: 0.0066,
                        note: "two-phase slide->roll position-domain fits, \
                               n=4 (per-shot bootstrap sd 0.0013-0.0050); \
                               heavy-draw launches 1.96-2.25 m/s, slip speed \
                               ~2-4.5 m/s in phase 1; scale systematic \
                               ~+-0.3%; sits at the top of the 0.178-0.245 \
                               literature range for other cloths"
                            .to_string(),
                    },
                    MeasuredParam {
                        param: "cloth.u_r".to_string(),
                        value: 0.0103,
                        sigma: 0.0017,
                        note: "REPRESENTATIVE constant from the measured \
                               speed-dependent band: 0.0086+-0.0004 @ \
                               0.3-0.55 m/s (return legs) and \
                               0.01195+-0.0001 @ 0.8-1.1 m/s (outbound \
                               phase-2); value = arithmetic mid of the two \
                               plateaus, sigma = the half-band (a model-form \
                               allowance, larger than either plateau's \
                               statistical sd)"
                            .to_string(),
                    },
                    MeasuredParam {
                        param: "cloth.u_sp_scale".to_string(),
                        value: 0.370,
                        sigma: 0.018,
                        note: "spin-decay alpha 9.06+-0.46 rad/s^2 from 4 \
                               stripe-phase PLL spin-downs (rotation is \
                               scale-free on the exact pts clock), converted \
                               via u_sp_scale = alpha*2/(5*G); constant-alpha \
                               regime holds down to ~5 rad/s; this cloth \
                               spins ~17% longer than the kernel default \
                               0.4444"
                            .to_string(),
                    },
                ],
                doc: "pool-9ft-measured-calibration.md (internal)".to_string(),
            },
            params: ClothPreset {
                u_s: 0.247,
                u_r: 0.0103,
                u_sp_scale: 0.370,
                // no ball-slate restitution measurement in the session
                e_t: None,
            },
            ui_hidden: false,
            superseded_by: None,
        },
    ]
}

fn ballsets() -> Vec<BallSetEntry> {
    vec![
        // Today's default: 57.15 mm / 170.097 g US pool ball
        // (BallParams::default; Dr. Dave physical-properties FAQ via
        // pooltool params.py POOL_GENERIC).
        BallSetEntry {
            id: DEFAULT_BALLSET_ID.to_string(),
            display_name: "Pool (57.15 mm) (legacy alias)".to_string(),
            calibration: lit(
                "Dr. Dave physical-properties FAQ / pooltool params.py \
                 POOL_GENERIC (m=0.170097 kg, R=28.575 mm) — the kernel \
                 default parameter set (crate::params provenance)",
            ),
            params: BallParams::default(),
            bb_friction: None,
            ui_hidden: true,
            superseded_by: Some("pool_standard".to_string()),
        },
        // Ball-CONDITION variant (catalog v2, issue #16 arbitration): the
        // SAME Aramith ball, worn/used surface — identical mass/radius/
        // restitutions, only the ball-ball friction curve differs.
        BallSetEntry {
            id: "aramith_pool_worn".to_string(),
            display_name: "Pool, worn/used (57.15 mm) (legacy alias)".to_string(),
            calibration: cal(
                "BallBallFriction::worn_fitted joint fit on reference slow-motion \
                 footage (examples/fit_mu_bb.rs over the staged \
                 observables: topspin-hop apex \
                 1.1-3.1 mm + both solved-camera cut throws + stun-B null, \
                 loss 0.49 vs 4.40 for the Marlow fit; report under \
                 docs/research/). Literature \
                 support for the raised floor: Alciatore TP B.3 Colenso-refit \
                 shape (ball condition unstated in TP B.3; worn/used is our \
                 inference) + 1.5-2.5x dirty-band (TP A-14 cling section), \
                 Mathavan 2014 constant mu=0.05, Dr. Dave BD Jul/Aug 2014 \
                 dirty-ball throw measurements",
            ),
            params: BallParams::default(),
            bb_friction: Some(crate::params::BallBallFriction::worn_fitted()),
            ui_hidden: true,
            superseded_by: Some("pool_used".to_string()),
        },
        // Snooker: Mathavan 2010 first-hand (M=0.1406 kg, R=26.25 mm;
        // docs/research/softbody-cushion.md §1.3) + their measured cushion
        // friction u_w=0.14 as f_c. The friction trio stays at the pool
        // defaults — cloth is a SEPARATE axis (pair with snooker_napped).
        BallSetEntry {
            id: "snooker".to_string(),
            display_name: "Snooker (52.5 mm)".to_string(),
            calibration: lit(
                "Mathavan et al. 2010: M=0.1406 kg, R=26.25 mm, cushion \
                 mu_w=0.14 (docs/research/softbody-cushion.md §1.3); \
                 restitutions keep kernel defaults (no snooker-specific \
                 measurement)",
            ),
            params: BallParams {
                m: 0.1406,
                r: 0.02625,
                f_c: 0.14,
                ..BallParams::default()
            },
            bb_friction: None,
            ui_hidden: false,
            superseded_by: None,
        },
        // Carom: 61.5 mm / 210 g (pooltool BILLIARD_GENERIC — its source
        // notes "nothing here is well-researched"; mass/diameter match the
        // UMB equipment norm, f_c=0.15 is pooltool's estimate).
        BallSetEntry {
            id: "carom".to_string(),
            display_name: "Carom (61.5 mm)".to_string(),
            calibration: est(
                "pooltool params.py BILLIARD_GENERIC (m=0.210 kg, \
                 R=30.75 mm, f_c=0.15); mass/diameter match the UMB norm, \
                 friction/restitution values are pooltool estimates (its \
                 own NOTE: not well-researched)",
            ),
            params: BallParams {
                m: 0.210,
                r: 0.0615 / 2.0,
                f_c: 0.15,
                ..BallParams::default()
            },
            bb_friction: None,
            ui_hidden: false,
            superseded_by: None,
        },
        // Catalog v9 (issue #91): visual-variant commercial pool sets. Both
        // reuse the aramith_pool phenolic parameter class BYTE-IDENTICALLY
        // (BallParams::default(), no bb_friction override) — the Duramith /
        // Super Aramith Pro formula distinction has no published friction or
        // COR numbers, so a new physics class would be an invented number
        // (P-IV). The ids are physics-visible only as the equipment tag the
        // renderer keys its per-set procedural textures off.
        BallSetEntry {
            id: "aramith_black".to_string(),
            display_name: "Black-cap tournament (legacy alias)".to_string(),
            calibration: est(
                "visual variant (issue #91): Aramith Tournament Black \
                 (Duramith) — physics params are the aramith_pool class \
                 verbatim (BallParams::default, 57.15 mm / 170.097 g \
                 phenolic); no set-specific friction/COR measurement is \
                 published, so no numeric deviation is claimed",
            ),
            params: BallParams::default(),
            bb_friction: None,
            ui_hidden: true,
            superseded_by: Some("pool_black_cap".to_string()),
        },
        BallSetEntry {
            id: "arcos_reserve".to_string(),
            display_name: "Ivory gunsight (legacy alias)".to_string(),
            calibration: est(
                "visual variant (issue #91): Predator Arcos II Reserve \
                 (Super Aramith Pro formula) — physics params are the \
                 aramith_pool class verbatim (BallParams::default, 57.15 mm \
                 / 170.097 g phenolic); no set-specific friction/COR \
                 measurement is published, so no numeric deviation is \
                 claimed",
            ),
            params: BallParams::default(),
            bb_friction: None,
            ui_hidden: true,
            superseded_by: Some("pool_ivory_gunsight".to_string()),
        },
        // Catalog v20 (#789): the de-branded twins of the four pool ballsets
        // above, appended in their old entries' catalog order; the same
        // params (including the worn set's fitted bb_friction curve) and the
        // calibration text with the old ids mapped. Pinned by
        // `v20_debranding_twins_byte_identical`.
        BallSetEntry {
            id: "pool_standard".to_string(),
            display_name: "Pool (57.15 mm)".to_string(),
            calibration: lit(
                "Dr. Dave physical-properties FAQ / pooltool params.py \
                 POOL_GENERIC (m=0.170097 kg, R=28.575 mm) — the kernel \
                 default parameter set (crate::params provenance)",
            ),
            params: BallParams::default(),
            bb_friction: None,
            ui_hidden: false,
            superseded_by: None,
        },
        BallSetEntry {
            id: "pool_used".to_string(),
            display_name: "Pool, worn/used (57.15 mm)".to_string(),
            calibration: cal(
                "BallBallFriction::worn_fitted joint fit on reference slow-motion \
                 footage (examples/fit_mu_bb.rs over the staged \
                 observables: topspin-hop apex \
                 1.1-3.1 mm + both solved-camera cut throws + stun-B null, \
                 loss 0.49 vs 4.40 for the Marlow fit; report under \
                 docs/research/). Literature \
                 support for the raised floor: Alciatore TP B.3 Colenso-refit \
                 shape (ball condition unstated in TP B.3; worn/used is our \
                 inference) + 1.5-2.5x dirty-band (TP A-14 cling section), \
                 Mathavan 2014 constant mu=0.05, Dr. Dave BD Jul/Aug 2014 \
                 dirty-ball throw measurements",
            ),
            params: BallParams::default(),
            bb_friction: Some(crate::params::BallBallFriction::worn_fitted()),
            ui_hidden: false,
            superseded_by: None,
        },
        BallSetEntry {
            id: "pool_black_cap".to_string(),
            display_name: "Black-cap tournament".to_string(),
            calibration: est(
                "visual variant (issue #91): Aramith Tournament Black \
                 (Duramith) — physics params are the pool_standard class \
                 verbatim (BallParams::default, 57.15 mm / 170.097 g \
                 phenolic); no set-specific friction/COR measurement is \
                 published, so no numeric deviation is claimed",
            ),
            params: BallParams::default(),
            bb_friction: None,
            ui_hidden: false,
            superseded_by: None,
        },
        BallSetEntry {
            id: "pool_ivory_gunsight".to_string(),
            display_name: "Ivory gunsight".to_string(),
            calibration: est(
                "visual variant (issue #91): Predator Arcos II Reserve \
                 (Super Aramith Pro formula) — physics params are the \
                 pool_standard class verbatim (BallParams::default, 57.15 mm \
                 / 170.097 g phenolic); no set-specific friction/COR \
                 measurement is published, so no numeric deviation is \
                 claimed",
            ),
            params: BallParams::default(),
            bb_friction: None,
            ui_hidden: false,
            superseded_by: None,
        },
    ]
}

/// Squirt end mass \[kg\] from a robot-measured pivot length \[in\]
/// (catalog v3, feature 009 K2). Shepard 2001 small-offset inversion of the
/// TP A-31 endmass model: aiming through the pivot compensates squirt,
/// `tan ψ = a·R/L_p`, and eq. 13 at small `a` gives
/// `tan ψ = (5/2)·a / (1 + M_b/M_e + 5/2)`, so
/// `M_b/M_e = 2.5·L_p/R − 3.5` (R = 1.125" ball radius) — reproducing
/// Shepard's own 10" → M_b/M_tip ≈ 20 (8.5 g) anchor; his longer-pivot rows
/// (30" → ~50) diverge because his 2001 model is "slightly different" from
/// TP A-31 (TP A-31 page 1 note; docs/research/literature.md §2.4).
fn end_mass_from_pivot_in(pivot_in: f64) -> f64 {
    0.170097 / (2.5 * (pivot_in / 1.125) - 3.5)
}

fn cues() -> Vec<CueEntry> {
    // Catalog v3 (feature 009 K2): per-shaft entries calibrated from the
    // Platinum Billiards robot squirt test (Billiards Digest 2008; 48
    // shafts, community-measured pivot lengths) through the Shepard pivot
    // inversion above, with the measured tip CORs (leather 0.73 typ,
    // HSV B.42; phenolic 0.85 typ, TP B.22). NOTE the pre-v3 `standard`
    // entry's end_mass = m_ball/30 (5.67 g) sits at the LOW-squirt end of
    // the Platinum-derived family — it is the frozen kernel default
    // (immutable entry), not a robot-measured shaft; within the v3 family
    // the robot ORDERING (Z-2 < 314 < Red Dot < break) is the datum.
    vec![
        // Today's default: 20 oz cue, endmass = m_ball/30 (TP A-31 squirt
        // model; CueParams::default).
        CueEntry {
            id: DEFAULT_CUE_ID.to_string(),
            display_name: "Standard maple cue".to_string(),
            calibration: lit(
                "Dr. Dave TP A-30/31 endmass squirt model: m=0.567 kg \
                 (20 oz), end_mass=m_ball/30 (~5.7 g, mid of Shepard 2001's \
                 real-cue Mb/Mtip 20-100 band) — CueParams::default \
                 provenance",
            ),
            params: CueParams::default(),
            superseded_by: None,
            ui_hidden: false,
        },
        // Low-deflection shaft: Shepard 2001 (Everything About Cue Ball
        // Squirt): tan(squirt) depends only on Mb/Mtip; Mb/Mtip=100 is his
        // low-squirt end (0.49 deg @ b/R=3/8, pivot ~49") — the regime of
        // modern carbon-fiber LD shafts (Kim 2021: only the light cue END
        // participates; docs/research/literature.md squirt section).
        CueEntry {
            id: "low_deflection".to_string(),
            display_name: "Low-deflection shaft".to_string(),
            calibration: lit(
                "Shepard 2001 squirt endmass table: Mb/Mtip=100 low-squirt \
                 end (squirt 0.49 deg @ b/R=3/8, pivot ~49\"), the \
                 carbon-fiber LD regime; Kim 2021 arXiv:2104.11232 endmass \
                 physics — docs/research/literature.md",
            ),
            params: CueParams {
                end_mass: 0.170097 / 100.0,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        CueEntry {
            id: "predator_z2".to_string(),
            display_name: "Pro LD shaft, 14.1 in pivot (leather tip) (legacy alias)".to_string(),
            calibration: lit(
                "Platinum Billiards 2008 robot test: pivot 14.1 in, squirt \
                 1.3 deg (lowest of 48 shafts) -> end mass 6.11 g via the \
                 Shepard pivot inversion (end_mass_from_pivot_in); leather \
                 tip_cor 0.73 (HSV B.42, Dr. Dave cue-tip efficiency FAQ)",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(14.1),
                tip_cor: 0.73,
                ..CueParams::default()
            },
            // Catalog v14 (issue #283 owner decision 2): the id carries a
            // registered mark — picker-hidden in favor of the byte-
            // identical generic twin below; params/provenance FROZEN.
            superseded_by: Some("pro_ld_pivot_141".to_string()),
            ui_hidden: true,
        },
        CueEntry {
            id: "predator_314".to_string(),
            display_name: "Pro LD shaft, 11.8 in pivot (leather tip) (legacy alias)".to_string(),
            calibration: lit(
                "Platinum Billiards 2008 robot test: pivot 11.8 in -> end \
                 mass 7.49 g via the Shepard pivot inversion; leather \
                 tip_cor 0.73 (HSV B.42)",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(11.8),
                tip_cor: 0.73,
                ..CueParams::default()
            },
            // Catalog v14 (issue #283): see predator_z2 above.
            superseded_by: Some("pro_ld_pivot_118".to_string()),
            ui_hidden: true,
        },
        CueEntry {
            id: "meucci_reddot".to_string(),
            display_name: "Pro LD shaft, 10.1 in pivot (leather tip) (legacy alias)".to_string(),
            calibration: lit(
                "Platinum Billiards 2008 robot test: pivot 10.1 in -> end \
                 mass 8.98 g via the Shepard pivot inversion (matches \
                 Shepard's 10 in ~ 8.5 g anchor); leather tip_cor 0.73",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(10.1),
                tip_cor: 0.73,
                ..CueParams::default()
            },
            // Catalog v14 (issue #283): see predator_z2 above.
            superseded_by: Some("pro_ld_pivot_101".to_string()),
            ui_hidden: true,
        },
        CueEntry {
            id: "break_phenolic".to_string(),
            display_name: "Break cue (phenolic tip)".to_string(),
            calibration: lit(
                "Platinum Billiards 2008 robot test: break-cue pivot 7.6 in, \
                 squirt 2.3 deg (highest band) -> end mass 12.7 g via the \
                 Shepard pivot inversion; phenolic tip_cor 0.85 (TP B.22 \
                 0.81-0.87 band)",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(7.6),
                tip_cor: 0.85,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // Tip-CURVATURE variant of the default cue (feature 009 K2): dime
        // radius 0.00895 m vs the default's nickel 0.0106 m (Dr. Dave
        // TP B.1). Only the tip->contact offset correction changes.
        CueEntry {
            id: "standard_dime_tip".to_string(),
            display_name: "Standard maple cue, dime tip".to_string(),
            calibration: lit(
                "Dr. Dave TP B.1 tip curvature standards: dime radius \
                 0.352 in = 8.95 mm (default entry = nickel 10.6 mm); all \
                 other parameters identical to the `standard` entry",
            ),
            params: CueParams {
                tip_radius: 0.00895,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // Catalog v10 (issue #168, Amendment 021): masse/trick cue — the
        // first per-cue miscue envelope carrier. Massé cues run short and
        // heavy with hard pressed-leather tips that sustain contact
        // offsets past the standard 0.5-0.55R miscue bracket.
        // Catalog v12 (issue #232): REVERTED to its exact v10 bytes — the
        // catalog v11 in-place dwell-quartet addition violated
        // immutable-once-shipped (persisted selections and share payloads
        // pinning this id silently resolved to different elevated-strike
        // physics). The Amendment-024 dwell calibration lives on the NEW
        // `masse_trick_dwell` entry below; persisted `masse_trick`
        // selections resolve to v10 physics again, per contract.
        CueEntry {
            id: "masse_trick".to_string(),
            display_name: "Massé/trick cue (hard pressed tip)".to_string(),
            calibration: cal(
                "Venom footage program W2/W3 (issues #154/#168, \
                 venom/report.md (internal)): Dr. Dave's overlaid \
                 tip-position crosshairs, measured through the verified \
                 homographies, put the contact offsets at 0.572/0.579/\
                 0.567 R on shots 3/1/2 -> miscue_contact_cap_r 0.58 \
                 covers the measured band (the W3 fits had to clamp every \
                 strike to the 0.5 R boundary, gap +0.067..+0.079 R); cue \
                 mass 0.62 kg = the W3 shot-2 fit pegged at its declared \
                 trick-cue bracket top; tip curvature nickel-class \
                 (extraction note: dime-to-near-flat band, nickel held); \
                 end_mass/tip_cor stay at the `standard` values — no \
                 squirt/efficiency measurement exists for this cue class \
                 (P-IV: not invented)",
            ),
            params: CueParams {
                m: 0.62,
                miscue_contact_cap_r: 0.58,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // Catalog v12 (issue #232): the Amendment-024 (issue #212) dwell
        // calibration, moved OFF the shipped masse_trick entry (catalog
        // v11 had mutated it in place — see the module docstring). The
        // only catalog carrier of the four pinch_* finite-dwell fields.
        // The entry carries the FULL masse-shot-1 fitted operating point
        // the 024 acceptance actually ran — including the fitted cue mass
        // 0.737611 kg, NOT masse_trick's 0.62 kg (the quartet and the
        // mass were fitted jointly; pairing the quartet with 0.62 was a
        // v11 combination no acceptance run exercised).
        CueEntry {
            id: "masse_trick_dwell".to_string(),
            display_name: "Massé/trick cue, dwell-calibrated (soft pressed tip)"
                .to_string(),
            calibration: cal(
                "Amendment-024 finite-dwell refit (issue #212; moved to \
                 this NEW entry by issue #232 — immutable-once-shipped): \
                 the masse-shot-1 refit inside the design-declared \
                 brackets (records/venom/\
                 masse-shot-1.fit.json (internal); design-212-masse-curve-\
                 authority.md section 8) -> pinch_dwell_gain 0.54, \
                 pinch_end_mass 0.0209 kg, pinch_press_scale 0.1725 \
                 (fitted; verdict GAP -> REPRODUCED, cb_path_rms 6.08 -> \
                 1.58 sigma), pinch_jam 1.0 HELD for the soft-tip family \
                 (narration-digest rows 4/19: 1.5-1.9 ms dwell, ball \
                 'jammed down into the table'; jump cues keep jam 0); \
                 cue mass 0.737611 kg = the SAME fit's value inside the \
                 record's declared in-video bracket [0.7, 0.78] — the \
                 mass the 024 acceptance actually ran (the masse_trick \
                 entry's 0.62 kg is the W3 shot-2 fit's bracket top for \
                 a DIFFERENT cue; the mass and the quartet were fitted \
                 jointly, so this entry keeps the joint operating point); \
                 miscue_contact_cap_r 0.58 = the Venom W2 measured band \
                 0.567-0.579 R (issue #168, the masse_trick envelope); \
                 tip curvature nickel-class and end_mass/tip_cor at the \
                 `standard` values (held, not fitted — the fit record's \
                 tip_curvature_radius_m note; P-IV: not invented)",
            ),
            params: CueParams {
                m: 0.737611,
                miscue_contact_cap_r: 0.58,
                pinch_dwell_gain: 0.54,
                pinch_jam: 1.0,
                pinch_end_mass: 0.0209,
                pinch_press_scale: 0.1725,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // ---- Catalog v14 (issue #283, owner decisions 2026-08-01) ------
        // Four new archetypes + three de-branding twins, appended in
        // order. Every value below states its OWN provenance tier
        // (Measured/Literature/Estimated) in the entry note — most f1
        // values are Estimated and say so (constitution P-IV honesty;
        // the issue-283 honesty ledger disposes each gap).
        //
        // Generic carbon-fiber ultra-LD playing shaft (Tier 1 item 3).
        CueEntry {
            id: "carbon_ld".to_string(),
            display_name: "Carbon-fiber ultra-LD shaft (leather tip)".to_string(),
            calibration: est(
                "mixed-tier record (issue #283; per-value tiers): end_mass \
                 = the `low_deflection` entry's Mb/Mtip=100 CF-LD regime \
                 value BYTE-EXACTLY (Literature: Shepard 2001 low-squirt \
                 end, squirt 0.49 deg @ b/R=3/8; Kim 2021 arXiv:2104.11232 \
                 - only the light cue END participates). The published \
                 Revo-class pivot ~19 in (Billiards Digest Jan 2019 pivot \
                 table) maps to ~4.4 g through end_mass_from_pivot_in, but \
                 the small-offset inversion is validated only inside the \
                 Platinum robot band 7.6-14.1 in and documentedly diverges \
                 from Shepard's own long-pivot rows (his 30 in -> ~50 \
                 anchor vs the formula's 63), so the entry keeps Shepard's \
                 published regime value instead of extrapolating the \
                 inversion - the tension is recorded, not hidden. m 0.567 \
                 kg + nickel tip_radius 0.0106 = playing-cue class defaults \
                 (total cue weight is player-configured, the shaft material \
                 does not move it; no CF-specific crown radius published). \
                 tip_cor 0.73 Literature: a LEATHER tip on the CF shaft - \
                 the TIP sets the restitution class, not the shaft (HSV \
                 B.42 leather band; params.rs tip_cor doctrine, BD June \
                 2014). shaft_first_mode_hz 40 Hz Estimated: NO published \
                 CF whole-cue mode measurement exists; direction argument \
                 only - laterally stiffer at lower linear density than \
                 maple (Predator patent US7431655B2 claims modulus >= 29.6 \
                 GPa vs hard maple E 12.62 GPa / rho 705 kg/m^3, Wood \
                 Database), and Euler-Bernoulli f1 ~ sqrt(E*I/(rho*A))/L^2 \
                 rises with both, so the mode sits ABOVE the 27 Hz maple \
                 anchor (DBKcues ring-down); 40 Hz is a stated engineering \
                 estimate inside the [8, 200] Hz validation band. \
                 shaft_damping_ratio keeps the 0.08 default (HSV A.25 \
                 in-stroke tracking; no CF-specific measurement)",
            ),
            params: CueParams {
                end_mass: 0.170097 / 100.0,
                tip_cor: 0.73,
                shaft_first_mode_hz: 40.0,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // Dedicated jump cue (Tier 1 item 5) — the light mass is the
        // physics-load-bearing value: the TP A-30 strike delivery divides
        // by the (1 + m_ball/m_cue)-family denominator, so a 0.26 kg cue
        // materially changes the strike at the same stroke speed. Cue
        // LENGTH (~41 in class) is a render-side property, NOT a
        // CueParams field — it enters only through the f1 scaling below.
        CueEntry {
            id: "jump_phenolic".to_string(),
            display_name: "Jump cue (phenolic tip)".to_string(),
            calibration: est(
                "mixed-tier record (issue #283; per-value tiers): m 0.26 \
                 kg (~9.2 oz) Literature-band - dedicated jump cues run \
                 8-12 oz, ~9 typical (Dr. Dave jump FAQ + retailer survey, \
                 issue #283 research digest; WPA \u{a7}17 constrains only \
                 >= 40 in length / <= 25 oz mass). tip_cor 0.85 Literature \
                 (phenolic band 0.81-0.87, TP B.22). pinch_jam 0.0 (the \
                 serde default) is a POSITIVE statement, not an omission: \
                 phenolic jump tips keep the Amendment-023 masse-jump \
                 flight channel OPEN (params.rs pinch_jam doctrine + the \
                 Amendment-024 shot-4 regression guard: 'jump cues keep \
                 jam 0'). tip_radius 0.0106 Estimated nickel-class: 14 mm \
                 phenolic crowns publish no radius (issue #283 honesty \
                 ledger) - nickel default, stated. end_mass 12.7 g \
                 Estimated: no jump-cue squirt/pivot measurement is \
                 published; adopts the Platinum robot break-cue band \
                 BYTE-EXACTLY (end_mass_from_pivot_in(7.6), the \
                 `break_phenolic` entry) as the nearest measured datum for \
                 the same stiff-short-shaft phenolic construction family \
                 (jump/break combo heritage); a stiff short front recruits \
                 MORE transverse mass, so the break band's high-squirt end \
                 is the honest direction. shaft_first_mode_hz 57 Hz \
                 Estimated via Euler-Bernoulli length scaling f1 ~ 1/L^2: \
                 the jump class at the WPA 40-in floor vs the 58-in \
                 reference cue gives (58/40)^2 x 27 Hz = 56.8 -> 57 Hz \
                 (the formula is the provenance; a 48-in jumper would \
                 read ~39 Hz - the class is genuinely stiffer-faster). \
                 shaft_damping_ratio keeps the 0.08 default",
            ),
            params: CueParams {
                m: 0.26,
                tip_cor: 0.85,
                end_mass: end_mass_from_pivot_in(7.6),
                shaft_first_mode_hz: 57.0,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // Snooker ash cue (Tier 2 item 7, pulled to now by owner decision
        // 1) — the v14 default cue of the snooker discipline
        // (DISCIPLINE_DEFAULT_CUE_IDS).
        CueEntry {
            id: "snooker_ash".to_string(),
            display_name: "Snooker ash cue, 9.5 mm brass ferrule".to_string(),
            calibration: est(
                "mixed-tier record (issue #283; per-value tiers): m 0.49 \
                 kg (17.3 oz) Literature-band - snooker cues run 16-18.5 \
                 oz (issue #283 research digest; pooltool CueSpecs \
                 SNOOKER_GENERIC ships M = 0.478 kg in the same band). \
                 tip_radius 0.00895 Estimated dime-class convention: no \
                 snooker crown radius is published; the 9.5 mm tip is \
                 conventionally dressed to the tighter dime curvature \
                 (Dr. Dave TP B.1 dime 0.352 in - small tips take the \
                 smaller standard crown), a convention pick, not a \
                 measurement. end_mass 6.67 g Estimated: base = the \
                 pooltool SNOOKER_GENERIC anchor end_mass = 0.140/30 kg \
                 = 4.67 g (pooltool objects/cue/datatypes.py CUE_SPECS - \
                 the reference implementation's snooker cue, the 140 g \
                 ball's m/30 convention) plus an Estimated +2.0 g \
                 brass-ferrule bump: a ~9.5 mm OD x ~10 mm brass collar \
                 masses ~2 g (rho 8.5 g/cm^3 thin-wall annulus) at the \
                 very tip, entirely inside the squirt-effective end zone \
                 (Kim 2021: only the last ~12 cm participates), the \
                 standing explanation for snooker cues squirting MORE \
                 than their slim tips suggest; no snooker robot/pivot \
                 measurement exists - bump declared, not laundered. \
                 tip_cor 0.73 Literature (leather band, HSV B.42). \
                 shaft_first_mode_hz 28 Hz Estimated near the 27 Hz maple \
                 anchor: same 57-58 in length, and ash/maple E-to-rho \
                 ratios are nearly equal (Wood Database), so no measurable \
                 frequency shift is defensible; 28 Hz encodes the \
                 community 'ash plays slightly stiffer' direction within \
                 the A25 fit's own +-5 Hz noise (docs/research/\
                 whip-calibration-277.md) - a direction marker, not a \
                 measurement. shaft_damping_ratio keeps the 0.08 default",
            ),
            params: CueParams {
                m: 0.49,
                tip_radius: 0.00895,
                end_mass: 0.140 / 30.0 + 0.002,
                tip_cor: 0.73,
                shaft_first_mode_hz: 28.0,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // Carom/3-cushion cue (Tier 2 item 8, pulled to now by owner
        // decision 1) — the v14 default cue of the carom discipline.
        CueEntry {
            id: "carom_conical".to_string(),
            display_name: "Carom cue, conical taper".to_string(),
            calibration: est(
                "mixed-tier record (issue #283; per-value tiers): m 0.52 \
                 kg Literature-band - dedicated 3-cushion cues run \
                 520-540 g (= 18.3-19.0 oz; issue #283 research digest), \
                 and the band FLOOR 520 g is the representative pick, \
                 stated. RECORDED DISCREPANCY (review r1): the same digest \
                 row also quotes a broader/lighter all-carom envelope \
                 16.5-18.5 oz (= 468-524 g) that cannot bracket the 3C \
                 band it parenthesizes - the 3C-specific gram band governs \
                 this entry, the oz row is recorded as the source's \
                 inconsistency, not laundered into agreement. tip_radius \
                 0.0106 Estimated nickel-class for the \
                 11.5-12 mm tip (no published carom crown radius; nickel \
                 default, stated). tip_cor 0.73 Literature (leather band, \
                 HSV B.42). end_mass 4.5 g Estimated: no carom \
                 robot/pivot measurement exists; direction from \
                 construction - carom cues are DELIBERATELY low-squirt \
                 for the 61.5 mm ball (research digest: wood ferrule \
                 ~0.6 g/cm^3 vs the pool cue's denser synthetic, slim \
                 11.5-12 mm front), so the value sits ~20% below the \
                 `standard` maple 5.67 g and far above the CF ultra-LD \
                 regime 1.70 g. NOTE the discipline's BALL parameters \
                 (61.5 mm / 210 g / f_c 0.15) live on the `carom` BALLSET \
                 entry - the cue entry carries cue properties only; \
                 pairing them is the equipment spec's job \
                 (DISCIPLINE_DEFAULT_CUE_IDS + the feature-012 app map). \
                 shaft_first_mode_hz 35 Hz Estimated: extra-stiff full- \
                 conical taper (no pro-taper constant-diameter front) \
                 plus the shorter 55-56 in class both raise the mode \
                 above the 27 Hz pro-taper maple anchor - length scaling \
                 alone gives (58/55.5)^2 x 27 = 29.5 Hz, the conical \
                 stiffness carries the rest of the estimate; no published \
                 measurement. shaft_damping_ratio keeps the 0.08 default",
            ),
            params: CueParams {
                m: 0.52,
                tip_cor: 0.73,
                end_mass: 0.0045,
                shaft_first_mode_hz: 35.0,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        // De-branding twins (issue #283 owner decision 2): the three v3
        // ids above carry registered marks (issue-283 trade-dress
        // findings; '314' is itself a registered mark, so no pro_ld_314).
        // The honest published spec IS the robot-measured pivot length,
        // so the generic id encodes it in tenths of an inch. Params are
        // BYTE-IDENTICAL to the branded entries (pinned) — records
        // pinning either id resolve to the same physics forever. Brand
        // names below are factual data-source citations (nominative use).
        CueEntry {
            id: "pro_ld_pivot_141".to_string(),
            display_name: "Pro LD shaft, 14.1 in pivot (leather tip)".to_string(),
            calibration: lit(
                "generic-id twin of the shipped `predator_z2` entry \
                 (catalog v14, issue #283 de-branding decision; \
                 params byte-identical, pinned by \
                 v14_debranding_twins_and_supersession). Platinum \
                 Billiards 2008 robot test: pivot 14.1 in, squirt 1.3 deg \
                 (lowest of 48 shafts) -> end mass 6.11 g via the Shepard \
                 pivot inversion (end_mass_from_pivot_in); leather \
                 tip_cor 0.73 (HSV B.42, Dr. Dave cue-tip efficiency \
                 FAQ). Measured shaft: Predator Z-2 (data-source \
                 citation, nominative use only)",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(14.1),
                tip_cor: 0.73,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        CueEntry {
            id: "pro_ld_pivot_118".to_string(),
            display_name: "Pro LD shaft, 11.8 in pivot (leather tip)".to_string(),
            calibration: lit(
                "generic-id twin of the shipped `predator_314` entry \
                 (catalog v14, issue #283 de-branding decision; \
                 params byte-identical, pinned). Platinum Billiards 2008 \
                 robot test: pivot 11.8 in -> end mass 7.49 g via the \
                 Shepard pivot inversion; leather tip_cor 0.73 (HSV \
                 B.42). Measured shaft: Predator 314 (data-source \
                 citation, nominative use only)",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(11.8),
                tip_cor: 0.73,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
        CueEntry {
            id: "pro_ld_pivot_101".to_string(),
            display_name: "Pro LD shaft, 10.1 in pivot (leather tip)".to_string(),
            calibration: lit(
                "generic-id twin of the shipped `meucci_reddot` entry \
                 (catalog v14, issue #283 de-branding decision; \
                 params byte-identical, pinned). Platinum Billiards 2008 \
                 robot test: pivot 10.1 in -> end mass 8.98 g via the \
                 Shepard pivot inversion (matches Shepard's 10 in ~ 8.5 g \
                 anchor); leather tip_cor 0.73. Measured shaft: Meucci \
                 Red Dot (data-source citation, nominative use only)",
            ),
            params: CueParams {
                end_mass: end_mass_from_pivot_in(10.1),
                tip_cor: 0.73,
                ..CueParams::default()
            },
            superseded_by: None,
            ui_hidden: false,
        },
    ]
}

fn cushion_models() -> Vec<CushionModelEntry> {
    use crate::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
    use crate::resolve::ball_table::{BT_MIN_BOUNCE_HEIGHT_REALISTIC, MIN_BOUNCE_HEIGHT};
    use crate::resolve::cushion_stronge::OMEGA_RATIO_REALISTIC;

    vec![
        // Kernel/serde default = SimOptions::default() (frozen v1 physics).
        CushionModelEntry {
            id: DEFAULT_CUSHION_MODEL_ID.to_string(),
            display_name: "Han 2005 (kernel default)".to_string(),
            calibration: lit(
                "Han 2005 rigid-body impulse model with Kiefl's corrections \
                 (docs/research/literature.md); flat friction mu=f_c, \
                 constant kinematic e0=0.85 — the frozen v1 baseline",
            ),
            cushion_model: CushionModel::Han2005,
            cushion_friction: CushionFriction::default(),
            response_override: None,
            bb_hop_min_height: MIN_BOUNCE_HEIGHT,
            bt_min_bounce_height: MIN_BOUNCE_HEIGHT,
        },
        // = SimOptions::realistic() (current app default).
        CushionModelEntry {
            id: "stronge_realistic".to_string(),
            display_name: "Stronge compliant (realistic)".to_string(),
            calibration: cal(
                "calibrated cushion-friction curve fitted on reference \
                 slow-motion footage (params.rs provenance); \
                 omega_ratio=1.8 adopted from pooltool's shipped resolver \
                 default — the SC-002 kick anchors are all gross-slip and \
                 cannot calibrate it (resolve/cushion_stronge.rs provenance)",
            ),
            cushion_model: CushionModel::stronge_compliant(OMEGA_RATIO_REALISTIC),
            cushion_friction: CushionFriction::sp_calibrated(),
            response_override: None,
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
        },
        // = pool-py SimOptions.mathavan_fitted() + table response
        // "hsv_fitted" (the joint-fit pairing rule, now explicit data).
        CushionModelEntry {
            id: "mathavan_fitted".to_string(),
            display_name: "Mathavan 2010 (HSV joint fit)".to_string(),
            calibration: cal(
                "eval_mathavan joint2 sweep (issue #9 stage 3): \
                 TangentialCompliance::hsv_fitted (chi=0.8, e_x=0.9) + \
                 CushionFriction::hsv_fitted + ee0=0.80 \
                 (CushionResponse::EE0_HSV_FITTED); gates/residuals on \
                 TangentialCompliance::hsv_fitted",
            ),
            cushion_model: CushionModel::mathavan_2010_fitted(),
            cushion_friction: CushionFriction::hsv_fitted(),
            response_override: Some(CushionResponse {
                ee0: CushionResponse::EE0_HSV_FITTED,
                ..CushionResponse::default()
            }),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
        },
        // = pool-py SimOptions.grip_fitted() + table response "grip_fitted".
        CushionModelEntry {
            id: "grip_fitted".to_string(),
            display_name: "Mathavan 2010 grip mode (cushion v5)".to_string(),
            calibration: cal(
                "eval_mathavan v5probe/v5fit sweeps (issues #9/#13): \
                 TangentialCompliance::grip_fitted (chi=1.2, e_x=0.9, \
                 grip_ratio=2.5, grip_capture=0.6) + \
                 CushionResponse::grip_fitted velocity-sloped energetic \
                 restitution; provenance on TangentialCompliance::grip_fitted",
            ),
            cushion_model: CushionModel::mathavan_2010_grip(),
            cushion_friction: CushionFriction::hsv_fitted(),
            response_override: Some(CushionResponse::grip_fitted()),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
        },
    ]
}

impl EquipmentCatalog {
    /// Build the shipped catalog (owned copy; prefer [`EquipmentCatalog::get`]).
    pub fn shipped() -> EquipmentCatalog {
        EquipmentCatalog {
            version: CATALOG_VERSION,
            tables: tables(),
            cloths: cloths(),
            ballsets: ballsets(),
            cues: cues(),
            cushion_models: cushion_models(),
        }
    }

    /// The shipped catalog (lazily built once per process).
    pub fn get() -> &'static EquipmentCatalog {
        static CATALOG: std::sync::OnceLock<EquipmentCatalog> = std::sync::OnceLock::new();
        CATALOG.get_or_init(EquipmentCatalog::shipped)
    }

    pub fn table(&self, id: &str) -> Option<&TableEntry> {
        self.tables.iter().find(|e| e.id == id)
    }

    pub fn cloth(&self, id: &str) -> Option<&ClothEntry> {
        self.cloths.iter().find(|e| e.id == id)
    }

    pub fn ballset(&self, id: &str) -> Option<&BallSetEntry> {
        self.ballsets.iter().find(|e| e.id == id)
    }

    pub fn cue(&self, id: &str) -> Option<&CueEntry> {
        self.cues.iter().find(|e| e.id == id)
    }

    pub fn cushion_model(&self, id: &str) -> Option<&CushionModelEntry> {
        self.cushion_models.iter().find(|e| e.id == id)
    }

    /// The table entry for an id that may come from outside the catalog (a
    /// scenario or record file, a CLI argument, a JS/WASM export argument):
    /// the exact [`Self::table`] lookup, then, on a miss, the catalog v20
    /// digest alias rows, so a retired v8 Measured id reaches its neutral
    /// twin. Ids the catalog itself supplies use the exact accessor.
    pub fn table_by_any_id(&self, id: &str) -> Option<&TableEntry> {
        self.table(id)
            .or_else(|| alias_digest_target("table", id).and_then(|twin| self.table(twin)))
    }

    /// The cloth counterpart of [`Self::table_by_any_id`].
    pub fn cloth_by_any_id(&self, id: &str) -> Option<&ClothEntry> {
        self.cloth(id)
            .or_else(|| alias_digest_target("cloth", id).and_then(|twin| self.cloth(twin)))
    }

    /// Resolve a spec into concrete parameter sets. Unknown ids are
    /// rejected with `SimError::InvalidInput` naming the category and id.
    ///
    /// Composition rules:
    /// - the table geometry is built for the BALLSET's radius (cushion nose
    ///   height scales with the ball);
    /// - the table's cushion response is the table entry's base response,
    ///   overridden by the cushion-model entry's fitted pairing when
    ///   present ([`CushionModelEntry::response_override`]);
    /// - the ball template is the ballset's params UNMODIFIED — apply the
    ///   returned cloth via [`ClothPreset::apply`] (or use
    ///   [`ResolvedEquipment::ball_params`]);
    /// - options are [`SimOptions::default`] budgets + the cushion-model
    ///   entry's model/friction/threshold slice + the cue entry's params
    ///   (`SimOptions::cue`, Amendment 012) + the ballset's μ_bb curve
    ///   override when present ([`BallSetEntry::bb_friction`], catalog v2).
    pub fn resolve(&self, spec: &EquipmentSpec) -> Result<ResolvedEquipment, SimError> {
        let missing = |category: &str, id: &str| {
            SimError::InvalidInput(format!("unknown equipment {category} id \"{id}\""))
        };
        // Catalog v20 (#789): a table or cloth id with no entry is looked up
        // once more through the digest alias rows, which map the two retired
        // v8 Measured ids to their twins; `spec` keeps the id as given.
        let table_entry = self
            .table_by_any_id(&spec.table_id)
            .ok_or_else(|| missing("table", &spec.table_id))?;
        let cloth_entry = self
            .cloth_by_any_id(&spec.cloth_id)
            .ok_or_else(|| missing("cloth", &spec.cloth_id))?;
        let ballset_entry = self
            .ballset(&spec.ballset_id)
            .ok_or_else(|| missing("ballset", &spec.ballset_id))?;
        let cue_entry = self
            .cue(&spec.cue_id)
            .ok_or_else(|| missing("cue", &spec.cue_id))?;
        let model_entry = self
            .cushion_model(&spec.cushion_model_id)
            .ok_or_else(|| missing("cushion_model", &spec.cushion_model_id))?;

        let mut table = table_entry.geometry.build(ballset_entry.params.r);
        table.cushion_response = model_entry
            .response_override
            .unwrap_or(table_entry.cushion_response);
        let options = SimOptions {
            cushion_model: model_entry.cushion_model,
            cushion_friction: model_entry.cushion_friction,
            bb_hop_min_height: model_entry.bb_hop_min_height,
            bt_min_bounce_height: model_entry.bt_min_bounce_height,
            // Amendment 012: the cue rides on SimOptions so the resolved
            // options alone reproduce the equipment's strike model.
            cue: cue_entry.params,
            // Catalog v2: a ballset CONDITION variant may carry its own
            // fitted μ_bb(v) (None = the default literature curve).
            bb_friction: ballset_entry.bb_friction.unwrap_or_default(),
            ..SimOptions::default()
        };

        Ok(ResolvedEquipment {
            spec: spec.clone(),
            table,
            cloth: cloth_entry.params,
            ball_template: ballset_entry.params,
            cue: cue_entry.params,
            options,
        })
    }
}

/// Catalog v20 (#789): the digest alias rows for the two retired v8
/// Measured ids. Each row maps the FNV-1a 64 digest of a retired id (16
/// lowercase hex digits; the plaintext id is not kept) to its neutral twin
/// on the same axis, which carries the same params and geometry: the table
/// row to `pool_pro_9ft_measured`, the cloth row to `pool_worsted_measured`.
/// [`EquipmentCatalog::table_by_any_id`] and
/// [`EquipmentCatalog::cloth_by_any_id`] consult the rows only after the
/// plain lookup misses, so an id that has a catalog entry never reaches
/// them; [`EquipmentCatalog::resolve`] and every consumer of an id from
/// outside the catalog go through them, so a spec that pins a retired id
/// resolves to the twin while keeping its own id. The plain accessors
/// [`EquipmentCatalog::table`] and [`EquipmentCatalog::cloth`] stay exact. The rows are not part of
/// `catalog_json`; [`catalog_alias_digests_json`] publishes them as digests
/// only.
#[cfg_attr(test, derive(Serialize))]
struct CatalogAliasDigest {
    axis: &'static str,
    digest: &'static str,
    neutral_id: &'static str,
}

const CATALOG_ALIAS_DIGESTS: [CatalogAliasDigest; 2] = [
    CatalogAliasDigest {
        axis: "table",
        digest: "8223852648be1aa5",
        neutral_id: "pool_pro_9ft_measured",
    },
    CatalogAliasDigest {
        axis: "cloth",
        digest: "906c9b774047f8a4",
        neutral_id: "pool_worsted_measured",
    },
];

/// FNV-1a 64 over `bytes` (offset basis `0xcbf29ce484222325`, prime
/// `0x100000001b3`, multiplication modulo 2^64): the digest of the alias
/// rows above. pool-core carries no hash crate, so it is a `const fn` with
/// `wrapping_mul`.
const fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    let mut i = 0;
    while i < bytes.len() {
        hash ^= bytes[i] as u64;
        hash = hash.wrapping_mul(0x100000001b3);
        i += 1;
    }
    hash
}

/// The lookup branch of [`EquipmentCatalog::table_by_any_id`] and
/// [`EquipmentCatalog::cloth_by_any_id`] after a plain-lookup miss: the neutral id of the alias row on `axis` whose digest is the
/// FNV-1a 64 of `id`, if there is one.
fn alias_digest_target(axis: &str, id: &str) -> Option<&'static str> {
    let digest = format!("{:016x}", fnv1a_64(id.as_bytes()));
    CATALOG_ALIAS_DIGESTS
        .iter()
        .find(|row| row.axis == axis && row.digest == digest)
        .map(|row| row.neutral_id)
}

/// The digest alias rows as JSON, `[{"axis", "digest", "neutral_id"}, ...]`
/// in row order, with no plaintext retired id. pool-wasm exports it under
/// the same name.
///
/// Built by hand rather than through `serde_json::to_string(..).expect(..)`
/// (#958): the `expect` put this file's panic location into the canonical
/// wasm. Every row field is a static lowercase id or hex digest, so no
/// character needs JSON escaping; the unit test
/// `alias_digests_json_matches_serde` pins the output byte-equal to serde's
/// serialization and the field alphabet.
pub fn catalog_alias_digests_json() -> String {
    let mut out = String::from("[");
    for (i, row) in CATALOG_ALIAS_DIGESTS.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"axis\":\"");
        out.push_str(row.axis);
        out.push_str("\",\"digest\":\"");
        out.push_str(row.digest);
        out.push_str("\",\"neutral_id\":\"");
        out.push_str(row.neutral_id);
        out.push_str("\"}");
    }
    out.push(']');
    out
}

/// Concrete parameter sets resolved from an [`EquipmentSpec`]
/// ([`EquipmentCatalog::resolve`]).
#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedEquipment {
    /// The spec this equipment was resolved from (embedded into the
    /// `SystemState::equipment` of the rack constructors below).
    pub spec: EquipmentSpec,
    /// Geometry (built for the ballset's radius) + effective cushion
    /// response.
    pub table: Table,
    /// The cloth friction bundle (NOT yet applied to `ball_template`).
    pub cloth: ClothPreset,
    /// Per-ball parameter template from the ballset (pre-cloth).
    pub ball_template: BallParams,
    pub cue: CueParams,
    /// Default-budget [`SimOptions`] carrying the cushion-model slice.
    pub options: SimOptions,
}

impl ResolvedEquipment {
    /// The effective per-ball parameters: cloth applied over the ballset
    /// template (the same composition `SystemState::with_cloth` performs).
    pub fn ball_params(&self) -> BallParams {
        self.cloth.apply(self.ball_template)
    }

    /// Seeded 9-ball rack composed from this equipment: the M7 rack builder
    /// on the resolved table (nose height at the ballset radius) with the
    /// cloth-applied ball params, `equipment` tagged with the source spec.
    /// The default spec reproduces `SystemState::nine_ball_rack` bit-exactly
    /// (pinned test).
    pub fn nine_ball_rack(&self, seed: u64) -> crate::SystemState {
        crate::SystemState {
            balls: crate::rack::nine_ball_rack(&self.table, &self.ball_params(), seed),
            table: self.table.clone(),
            equipment: self.spec.clone(),
        }
    }

    /// Seeded 15-ball rack composed from this equipment (see
    /// [`ResolvedEquipment::nine_ball_rack`]).
    pub fn fifteen_ball_rack(&self, seed: u64) -> crate::SystemState {
        crate::SystemState {
            balls: crate::rack::fifteen_ball_rack(&self.table, &self.ball_params(), seed),
            table: self.table.clone(),
            equipment: self.spec.clone(),
        }
    }

    /// Seeded 10-ball rack composed from this equipment (GH-343 additive;
    /// see [`ResolvedEquipment::nine_ball_rack`]).
    pub fn ten_ball_rack(&self, seed: u64) -> crate::SystemState {
        crate::SystemState {
            balls: crate::rack::ten_ball_rack(&self.table, &self.ball_params(), seed),
            table: self.table.clone(),
            equipment: self.spec.clone(),
        }
    }

    /// Seeded snooker frame composed from this equipment (feature 012;
    /// see [`ResolvedEquipment::nine_ball_rack`] for the composition
    /// rules). The layout constants are the `wpbsa_snooker_12ft` table's
    /// rulebook coordinates — resolve a snooker-table spec
    /// ([`EquipmentSpec::snooker_default`]).
    pub fn snooker_rack(&self, seed: u64) -> crate::SystemState {
        crate::SystemState {
            balls: crate::rack::snooker_rack(&self.table, &self.ball_params(), seed),
            table: self.table.clone(),
            equipment: self.spec.clone(),
        }
    }

    /// Carom starting position composed from this equipment (feature 012;
    /// UMB Art 23). Layout constants are the `umb_carom_284` table's —
    /// resolve a carom-table spec ([`EquipmentSpec::carom_default`]).
    pub fn carom_start(&self, breaker_start_right: bool) -> crate::SystemState {
        crate::SystemState {
            balls: crate::rack::carom_start(
                &self.table,
                &self.ball_params(),
                breaker_start_right,
            ),
            table: self.table.clone(),
            equipment: self.spec.clone(),
        }
    }
}

/// The catalog v20 (#789) twin-text function, shared by the twin tests
/// below (the file lives under `tests/support/`, which cargo does not build
/// as a test target of its own).
#[cfg(test)]
#[path = "../tests/support/catalog_twin_norm.rs"]
mod catalog_twin_norm;

#[cfg(test)]
mod tests {
    use super::*;

    /// Schema/versioning: the shipped catalog carries CATALOG_VERSION,
    /// serializes to JSON, round-trips losslessly, has unique non-empty
    /// ids per category, and every display name is non-empty.
    #[test]
    fn catalog_versioned_unique_ids_and_serde_round_trip() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        let categories: [(&str, Vec<&String>); 5] = [
            ("tables", c.tables.iter().map(|e| &e.id).collect()),
            ("cloths", c.cloths.iter().map(|e| &e.id).collect()),
            ("ballsets", c.ballsets.iter().map(|e| &e.id).collect()),
            ("cues", c.cues.iter().map(|e| &e.id).collect()),
            (
                "cushion_models",
                c.cushion_models.iter().map(|e| &e.id).collect(),
            ),
        ];
        for (cat, ids) in &categories {
            assert!(!ids.is_empty(), "{cat} empty");
            let mut sorted: Vec<_> = ids.clone();
            sorted.sort();
            sorted.dedup();
            assert_eq!(sorted.len(), ids.len(), "{cat} has duplicate ids");
            for id in ids {
                assert!(!id.is_empty(), "{cat} empty id");
                assert!(
                    id.chars()
                        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_'),
                    "{cat} id {id:?} not snake_case"
                );
            }
        }
        let json = serde_json::to_string(c).expect("catalog serializes");
        let back: EquipmentCatalog = serde_json::from_str(&json).expect("catalog parses");
        assert_eq!(&back, c);
    }

    /// Calibration coverage: NO entry ships without provenance — every
    /// source/note is a non-trivial pointer.
    #[test]
    fn every_entry_has_calibration_provenance() {
        fn check(what: &str, cal: &Calibration) {
            let text = match cal {
                Calibration::Calibrated { source } => source,
                Calibration::Literature { source } => source,
                Calibration::Estimated { note } => note,
                // Measured (catalog v8): the provenance pointer is the
                // verification doc; a session + at least one measured
                // value with a real uncertainty and note are mandatory.
                Calibration::Measured {
                    session,
                    date,
                    values,
                    doc,
                } => {
                    assert!(!session.is_empty(), "{what}: empty session id");
                    // O15 A2 (owner decision 2026-09-20): the two owner-measured entries
                    // carry the named adoption sentinel (no personal calendar date leaves
                    // the catalog); every other Measured entry keeps the YYYY-MM-DD form.
                    assert!(
                        date == CALIBRATION_DATE_AT_ADOPTION || date.len() == 10,
                        "{what}: date must be YYYY-MM-DD or CALIBRATION_DATE_AT_ADOPTION"
                    );
                    assert!(!values.is_empty(), "{what}: Measured without values");
                    for v in values {
                        assert!(!v.param.is_empty(), "{what}: unnamed measured param");
                        assert!(v.value.is_finite() && v.sigma.is_finite(), "{what}");
                        assert!(v.sigma > 0.0, "{what}: {} without uncertainty", v.param);
                        assert!(v.note.len() >= 20, "{what}: {} note too thin", v.param);
                    }
                    doc
                }
            };
            assert!(text.len() >= 20, "{what}: provenance too thin: {text:?}");
        }
        let c = EquipmentCatalog::get();
        for e in &c.tables {
            check(&e.id, &e.calibration);
        }
        for e in &c.cloths {
            check(&e.id, &e.calibration);
        }
        for e in &c.ballsets {
            check(&e.id, &e.calibration);
        }
        for e in &c.cues {
            check(&e.id, &e.calibration);
        }
        for e in &c.cushion_models {
            check(&e.id, &e.calibration);
        }
    }

    /// Every entry resolves: sweep each category axis against the default
    /// spec; all combinations along one axis must resolve, with finite
    /// parameters and geometry built for the ballset radius.
    #[test]
    fn every_entry_resolves() {
        let c = EquipmentCatalog::get();
        let base = EquipmentSpec::default();
        let mut specs = vec![base.clone()];
        for e in &c.tables {
            specs.push(EquipmentSpec {
                table_id: e.id.clone(),
                ..base.clone()
            });
        }
        for e in &c.cloths {
            specs.push(EquipmentSpec {
                cloth_id: e.id.clone(),
                ..base.clone()
            });
        }
        for e in &c.ballsets {
            specs.push(EquipmentSpec {
                ballset_id: e.id.clone(),
                ..base.clone()
            });
        }
        for e in &c.cues {
            specs.push(EquipmentSpec {
                cue_id: e.id.clone(),
                ..base.clone()
            });
        }
        for e in &c.cushion_models {
            specs.push(EquipmentSpec {
                cushion_model_id: e.id.clone(),
                ..base.clone()
            });
        }
        for spec in specs {
            let r = c.resolve(&spec).unwrap_or_else(|e| panic!("{spec:?}: {e}"));
            let bp = r.ball_params();
            assert!(bp.m > 0.0 && bp.r > 0.0, "{spec:?}");
            assert!(r.cue.end_mass > 0.0 && r.cue.m > 0.0, "{spec:?}");
            // Nose height tracks the resolved ballset radius at the ENTRY's
            // own nose fraction (feature 009: per-entry geometry — Diamond
            // builds 63.8889 %, snooker 70 %, carom 60.16 %, everything
            // else the WPA 63.5 %).
            let frac = c
                .table(&spec.table_id)
                .unwrap()
                .geometry
                .nose_height_frac();
            let h = frac * 2.0 * r.ball_template.r;
            for s in &r.table.linear {
                assert!((s.height - h).abs() < 1e-12, "{spec:?}");
            }
        }
    }

    /// Unknown ids are rejected per category, naming the offending id.
    #[test]
    fn unknown_ids_rejected() {
        let c = EquipmentCatalog::get();
        let base = EquipmentSpec::default();
        let cases = [
            EquipmentSpec {
                table_id: "unlisted_table_8ft".into(),
                ..base.clone()
            },
            EquipmentSpec {
                cloth_id: "nylon_speedway".into(),
                ..base.clone()
            },
            EquipmentSpec {
                ballset_id: "russian_pyramid".into(),
                ..base.clone()
            },
            EquipmentSpec {
                cue_id: "broomstick".into(),
                ..base.clone()
            },
            EquipmentSpec {
                cushion_model_id: "trampoline".into(),
                ..base.clone()
            },
        ];
        for (bad, wrong_id) in cases.iter().zip([
            "unlisted_table_8ft",
            "nylon_speedway",
            "russian_pyramid",
            "broomstick",
            "trampoline",
        ]) {
            match c.resolve(bad) {
                Err(SimError::InvalidInput(msg)) => {
                    assert!(msg.contains(wrong_id), "{msg}");
                }
                other => panic!("expected InvalidInput for {wrong_id}, got {other:?}"),
            }
        }
    }

    /// The default spec resolves BIT-exactly to today's default pipeline:
    /// Table::wpa_9ft(default r) + default response, BallParams::default,
    /// CueParams::default, SimOptions::default (the kernel-default-
    /// unchanged guarantee of the catalog wave).
    #[test]
    fn default_spec_is_todays_default_pipeline() {
        let r = EquipmentCatalog::get()
            .resolve(&EquipmentSpec::default())
            .expect("default spec resolves");
        assert_eq!(r.table, Table::wpa_9ft(BallParams::default().r));
        assert_eq!(r.ball_template, BallParams::default());
        assert_eq!(r.ball_params(), BallParams::default());
        assert_eq!(r.cloth, ClothPreset::default());
        assert_eq!(r.cue, CueParams::default());
        assert_eq!(r.options, SimOptions::default());
        // Byte-level: the resolved table/options serialize to the same
        // bytes the default constructors produce.
        assert_eq!(
            serde_json::to_string(&r.table).unwrap(),
            serde_json::to_string(&Table::wpa_9ft(BallParams::default().r)).unwrap()
        );
        assert_eq!(
            serde_json::to_string(&r.options).unwrap(),
            serde_json::to_string(&SimOptions::default()).unwrap()
        );
    }

    /// Catalog v2 ballset-condition axis: `aramith_pool_worn` is the SAME
    /// Aramith ball (identical BallParams) carrying the fitted worn μ_bb
    /// curve, which resolve() routes into the options; every other ballset
    /// keeps `bb_friction: None` → the default literature curve, and the
    /// optional field is serde-skipped at None (v1 entry byte parity).
    #[test]
    fn worn_ballset_routes_fitted_bb_friction() {
        use crate::params::BallBallFriction;
        let c = EquipmentCatalog::get();
        let worn = c.ballset("aramith_pool_worn").expect("worn entry");
        assert_eq!(worn.params, BallParams::default());
        assert_eq!(worn.bb_friction, Some(BallBallFriction::worn_fitted()));
        let resolved = c
            .resolve(&EquipmentSpec {
                ballset_id: "aramith_pool_worn".into(),
                ..EquipmentSpec::default()
            })
            .expect("worn spec resolves");
        assert_eq!(resolved.options.bb_friction, BallBallFriction::worn_fitted());
        // Only the μ_bb slice differs from the default resolution.
        assert_eq!(
            SimOptions {
                bb_friction: BallBallFriction::default(),
                ..resolved.options
            },
            SimOptions::default()
        );
        // v20 (#789): the pool_used twin carries the same fitted curve.
        assert_eq!(c.ballset("pool_used").unwrap().bb_friction, worn.bb_friction);
        for e in &c.ballsets {
            if !matches!(e.id.as_str(), "aramith_pool_worn" | "pool_used") {
                assert_eq!(e.bb_friction, None, "{}", e.id);
                let json = serde_json::to_string(e).unwrap();
                assert!(!json.contains("bb_friction"), "{}: {json}", e.id);
            }
        }
        // Additive serde: a pre-v2 ballset entry JSON (no bb_friction key)
        // parses to bb_friction = None.
        let legacy: BallSetEntry = serde_json::from_str(
            &serde_json::to_string(c.ballset(DEFAULT_BALLSET_ID).unwrap()).unwrap(),
        )
        .unwrap();
        assert_eq!(legacy.bb_friction, None);
    }

    /// Cloth migration compat: the catalog cloth entries stay in bit-sync
    /// with the ClothPreset constructors (kept as thin aliases) and cover
    /// exactly the ids `ClothPreset::by_name` publishes.
    #[test]
    fn cloth_entries_alias_the_preset_constructors() {
        let c = EquipmentCatalog::get();
        for (id, want) in [
            ("simonis_860_tournament", ClothPreset::simonis_860_tournament()),
            ("simonis_760_fast", ClothPreset::simonis_760_fast()),
            ("worn_slow", ClothPreset::worn_slow()),
            ("snooker_napped", ClothPreset::snooker_napped()),
        ] {
            assert_eq!(c.cloth(id).expect(id).params, want, "{id}");
            assert_eq!(ClothPreset::by_name(id), Some(want), "{id} by_name");
        }
        // v6 adds carom_worsted_heated, v8 owner_proam_cloth_2026_07 —
        // both catalog-only entries (no preset constructor:
        // ClothPreset::by_name covers only the legacy v2-share-wire cloth
        // ids, a frozen decode surface). v20 (#789) appends the three
        // de-branded cloth twins, also catalog-only ids, and removes the v8
        // Measured cloth, whose twin carries it.
        assert_eq!(c.cloths.len(), 8);
        assert_eq!(ClothPreset::by_name("carom_worsted_heated"), None);
        assert_eq!(ClothPreset::by_name("owner_proam_cloth_2026_07"), None);
    }

    /// Cushion-model entries reference the existing SimOptions/CushionModel
    /// constructors exactly (the pairing rules become data):
    /// han2005_default = SimOptions::default, stronge_realistic =
    /// SimOptions::realistic, mathavan_fitted/grip_fitted = the pool-py
    /// fitted pairings incl. their table-response overrides.
    #[test]
    fn cushion_model_entries_match_preset_constructors() {
        let c = EquipmentCatalog::get();
        let slice = |id: &str| {
            let e = c.cushion_model(id).expect(id);
            SimOptions {
                cushion_model: e.cushion_model,
                cushion_friction: e.cushion_friction,
                bb_hop_min_height: e.bb_hop_min_height,
                bt_min_bounce_height: e.bt_min_bounce_height,
                ..SimOptions::default()
            }
        };
        assert_eq!(slice(DEFAULT_CUSHION_MODEL_ID), SimOptions::default());
        assert_eq!(slice("stronge_realistic"), SimOptions::realistic());
        assert_eq!(
            c.cushion_model(DEFAULT_CUSHION_MODEL_ID)
                .unwrap()
                .response_override,
            None
        );
        assert_eq!(
            c.cushion_model("stronge_realistic").unwrap().response_override,
            None
        );

        let mf = c.cushion_model("mathavan_fitted").unwrap();
        assert_eq!(mf.cushion_model, CushionModel::mathavan_2010_fitted());
        assert_eq!(mf.cushion_friction, CushionFriction::hsv_fitted());
        assert_eq!(
            mf.response_override.unwrap().ee0,
            CushionResponse::EE0_HSV_FITTED
        );
        let gf = c.cushion_model("grip_fitted").unwrap();
        assert_eq!(gf.cushion_model, CushionModel::mathavan_2010_grip());
        assert_eq!(gf.cushion_friction, CushionFriction::hsv_fitted());
        assert_eq!(gf.response_override, Some(CushionResponse::grip_fitted()));

        // The fitted overrides land on the resolved table.
        let cat = EquipmentCatalog::get();
        let spec = EquipmentSpec {
            cushion_model_id: "grip_fitted".into(),
            ..EquipmentSpec::default()
        };
        let resolved = cat.resolve(&spec).unwrap();
        assert_eq!(
            resolved.table.cushion_response,
            CushionResponse::grip_fitted()
        );
    }

    /// Ballset pins: aramith_pool IS the kernel default; snooker carries the
    /// Mathavan 2010 first-hand mass/radius/mu_w; carom the pooltool
    /// BILLIARD_GENERIC set. Diamond table: same geometry, stronge pairing.
    #[test]
    fn ballset_cue_and_table_entries_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(
            c.ballset(DEFAULT_BALLSET_ID).unwrap().params,
            BallParams::default()
        );
        let sn = &c.ballset("snooker").unwrap().params;
        assert_eq!((sn.m, sn.r, sn.f_c), (0.1406, 0.02625, 0.14));
        let ca = &c.ballset("carom").unwrap().params;
        assert_eq!((ca.m, ca.r, ca.f_c), (0.210, 0.03075, 0.15));

        assert_eq!(c.cue(DEFAULT_CUE_ID).unwrap().params, CueParams::default());
        let ld = &c.cue("low_deflection").unwrap().params;
        assert!((ld.end_mass - 0.170097 / 100.0).abs() < 1e-15);
        assert_eq!((ld.m, ld.tip_radius), (0.567, 0.0106));

        // Catalog v4: the Red Label entry now builds its OWN re-derived
        // geometry (catalog-policy ruling item 4) — pairing unchanged.
        let diamond = c.table("diamond_redlabel_9ft").unwrap();
        assert_eq!(diamond.geometry, TableGeometry::DiamondRedLabel9Ft);
        assert_eq!(diamond.cushion_response, CushionResponse::default());
        assert_eq!(diamond.recommended_cushion_model_id, "stronge_realistic");
        assert!(matches!(
            diamond.calibration,
            Calibration::Calibrated { .. }
        ));
        let generic = c.table(DEFAULT_TABLE_ID).unwrap();
        assert_eq!(
            generic.recommended_cushion_model_id,
            DEFAULT_CUSHION_MODEL_ID
        );
        // Every recommended pairing must point at a real entry.
        for t in &c.tables {
            assert!(
                c.cushion_model(&t.recommended_cushion_model_id).is_some(),
                "{}: dangling recommended_cushion_model_id",
                t.id
            );
        }
    }

    /// Catalog v3 table entries (feature 009): the Diamond Pro-Am carries
    /// the measured-geometry variant at Literature tier with the
    /// Diamond-brand cushion pairing (closest existing model — the K-55/
    /// Artemis gap is documented on the entry); the Predator Apex ships
    /// honestly Estimated with the default-model pairing; both build
    /// geometry DIFFERENT from the default table; and `wpa_generic_9ft`
    /// stays bit-identical to it (immutability — v4 changed only its
    /// metadata, see `v4_table_entries_pinned`).
    #[test]
    fn v3_table_entries_pinned() {
        let c = EquipmentCatalog::get();

        let proam = c.table("diamond_proam_9ft").unwrap();
        assert_eq!(proam.geometry, TableGeometry::DiamondProAm9Ft);
        assert!(matches!(proam.calibration, Calibration::Literature { .. }));
        assert_eq!(proam.recommended_cushion_model_id, "stronge_realistic");
        assert_eq!(proam.cushion_response, CushionResponse::default());

        let apex = c.table("predator_apex_9ft").unwrap();
        assert_eq!(apex.geometry, TableGeometry::PredatorApex9Ft);
        assert!(matches!(apex.calibration, Calibration::Estimated { .. }));
        assert_eq!(apex.recommended_cushion_model_id, DEFAULT_CUSHION_MODEL_ID);

        // Audit-table numbers land on the specs (true mouths, facings,
        // nose, shelves — docs/verification/table-dimension-audit.md).
        let d = TableGeometry::DiamondProAm9Ft.pocket_spec().unwrap();
        assert_eq!(d.corner_mouth, 0.11430);
        assert_eq!(d.side_mouth, 0.12700);
        // Catalog v5 facing repin: RKC Diamond factory cuts — corner
        // 141 deg ⇒ deviation 141 − 135 = 6.0, side 102 deg ⇒ deviation
        // 102 − 90 = 12.0 (exact f64 literals, bit-pinned below in
        // v5_diamond_factory_cut_facings_pinned).
        assert_eq!(d.corner_facing_deviation_deg, 6.0);
        assert_eq!(d.side_facing_deviation_deg, 12.0);
        assert_eq!(d.nose_height_frac, 0.638889);
        assert!((d.corner_shelf() - 0.04445).abs() < 1e-15);
        assert!((d.side_shelf() - 0.0047625).abs() < 1e-15);
        let p = TableGeometry::PredatorApex9Ft.pocket_spec().unwrap();
        assert_eq!(p.corner_mouth, 0.10795);
        assert_eq!(p.side_mouth, 0.124968); // 4.92 in official (CAL-1)
        assert_eq!(p.nose_height_frac, 0.635);
        assert!((p.corner_shelf() - 0.0381).abs() < 1e-15);
        assert!((p.side_shelf() - 0.0048).abs() < 1e-15);

        // Geometry actually differs from the default build (first
        // non-default-geometry entries), at the default ball radius.
        let r = crate::params::BallParams::default().r;
        let base = Table::wpa_9ft(r);
        for geom in [
            TableGeometry::DiamondProAm9Ft,
            TableGeometry::PredatorApex9Ft,
        ] {
            assert_ne!(geom.build(r), base, "{geom:?} must differ");
        }
        // The default entry: still the default geometry, bit-exact.
        let e = c.table(DEFAULT_TABLE_ID).unwrap();
        assert_eq!(e.geometry, TableGeometry::Wpa9Ft);
        assert_eq!(e.geometry.build(r), base, "{DEFAULT_TABLE_ID} drifted");
    }

    /// Catalog v4 table entries (catalog-policy ruling,
    /// feature 009 (internal spec)):
    /// - `wpa_generic_9ft` keeps its frozen id + bit-exact geometry but is
    ///   honestly relabeled (legacy display name, Estimated tier naming the
    ///   Showood/pooltool source) and leaves the user-facing list
    ///   (ui_hidden);
    /// - NEW `wpa_spec_9ft` builds the WPA Equipment Specifications nominal
    ///   band values (Literature tier);
    /// - `diamond_redlabel_9ft` is re-derived from the AZB 48606 community
    ///   measurement (its pins below are DERIVED from that source, not
    ///   repins of the old pooltool geometry);
    /// - `ui_hidden` serde is additive (missing = false, false skipped —
    ///   pre-v4 entry JSON byte parity).
    #[test]
    fn v4_table_entries_pinned() {
        let c = EquipmentCatalog::get();
        // v5: Diamond factory-cut facing repin (see CATALOG_VERSION doc +
        // v5_diamond_factory_cut_facings_pinned); the v4 entry SET and all
        // non-Diamond pins below are unchanged. v6 (feature 012) APPENDS
        // the three discipline tables — additive only, order frozen. v7
        // re-derives the snooker/joy geometry (Amendment A1) — entry set
        // and every pool pin below unchanged. v8 APPENDS the Measured-tier
        // owner Pro-Am entry (additive only, order frozen). v15 (GH-490)
        // APPENDS the de-branded chinese8_pro_9ft entry; joy_q8_9ft stays
        // IN PLACE as its picker-hidden resolve-only alias (order frozen).
        // v18 (GH-621) APPENDS the two Diamond Pro-Am size variants
        // (additive only, order frozen).
        assert_eq!(c.version, CATALOG_VERSION);
        // v19: rasson_ox_9ft appended after the v18 Diamond variants; v20
        // (#789) appended the seven de-branded table twins after it and
        // removed the v8 Measured table, whose twin carries it.
        assert_eq!(c.tables.len(), 19);
        assert_eq!(
            c.tables.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            [
                "wpa_generic_9ft",
                "wpa_spec_9ft",
                "diamond_redlabel_9ft",
                "diamond_proam_9ft",
                "predator_apex_9ft",
                "wpbsa_snooker_12ft",
                "umb_carom_284",
                "joy_q8_9ft",
                "chinese8_pro_9ft",
                "diamond_proam_8ft",
                "diamond_proam_7ft",
                "rasson_ox_9ft",
                "pool_pro_9ft_older_gen",
                "pool_pro_9ft",
                "pool_pro_9ft_metal_rim",
                "pool_pro_9ft_measured",
                "pool_pro_8ft",
                "pool_pro_7ft",
                "pool_pro_9ft_k55",
            ]
        );

        // The legacy default: honest metadata, untouched geometry, hidden.
        let legacy = c.table(DEFAULT_TABLE_ID).unwrap();
        assert_eq!(legacy.display_name, "Legacy 9-ft (pooltool-derived)");
        assert!(matches!(legacy.calibration, Calibration::Estimated { .. }));
        let note = match &legacy.calibration {
            Calibration::Estimated { note } => note,
            other => panic!("expected Estimated, got {other:?}"),
        };
        for needle in ["pooltool", "Showood", "NOT a WPA reference"] {
            assert!(note.contains(needle), "legacy note missing {needle:?}");
        }
        assert!(legacy.ui_hidden, "legacy entry must leave the picker");
        // Everything else stays user-facing — except the v15 joy_q8_9ft
        // de-brand alias, which is resolve-only by design (GH-490).
        // v20 (#789): and every entry superseded by a de-branded twin (a
        // rename alias: hidden, still resolving, pointing at a twin that is
        // picker-visible). The rule is structural; the pairs themselves are
        // pinned by v20_debranding_twins_byte_identical.
        for e in &c.tables {
            assert_eq!(
                e.id == DEFAULT_TABLE_ID || e.id == "joy_q8_9ft" || e.superseded_by.is_some(),
                e.ui_hidden,
                "{}",
                e.id
            );
            if let Some(twin) = &e.superseded_by {
                let t = c
                    .table(twin)
                    .unwrap_or_else(|| panic!("{}: superseded_by target {twin} missing", e.id));
                assert!(!t.ui_hidden, "{}: superseded_by target {twin} is hidden", e.id);
            }
        }
        assert_eq!(c.tables.iter().filter(|e| e.superseded_by.is_some()).count(), 6);

        // wpa_spec_9ft: WPA nominal band values (source: WPA Recommended
        // Equipment Specifications — corner mouth = mid of 4.5-4.625" =
        // 4.5625" = 0.1158875 m; side = mid of 5-5.125" = 5.0625" =
        // 0.1285875 m; facings 142/104 deg; nose 63.5 %; shelves at band
        // centers 1.625" = 0.041275 m and 3/16" = 0.0047625 m).
        let ws = c.table("wpa_spec_9ft").unwrap();
        assert_eq!(ws.geometry, TableGeometry::WpaSpec9Ft);
        assert!(matches!(ws.calibration, Calibration::Literature { .. }));
        assert_eq!(ws.recommended_cushion_model_id, "stronge_realistic");
        assert_eq!(ws.cushion_response, CushionResponse::default());
        let s = TableGeometry::WpaSpec9Ft.pocket_spec().unwrap();
        // meter literals, decimal-exact inch conversions (4.5625 in =
        // 0.1158875 m, 5.0625 in = 0.1285875 m — same literal style as the
        // v3 Diamond/Predator specs)
        assert_eq!(s.corner_mouth, 0.1158875);
        assert_eq!(s.side_mouth, 0.1285875);
        assert_eq!(s.corner_facing_deviation_deg, 7.0); // 142 deg
        assert_eq!(s.side_facing_deviation_deg, 14.0); // 104 deg
        assert_eq!(s.nose_height_frac, 0.635);
        assert_eq!((s.length, s.width), (2.54, 1.27));
        assert!((s.corner_shelf() - 0.041275).abs() < 1e-15);
        assert!((s.side_shelf() - 0.0047625).abs() < 1e-15);
        assert!(s.exact_side_facing);

        // diamond_redlabel_9ft: corner mouth 4 9/16" = 0.1158875 m (AZB
        // 48606 measurement); side mouth = corner + 1/2" (Diamond factory
        // pairing, AZB 540288) = 5 1/16" = 0.1285875 m; nose 1 7/16" of
        // 2.25" = 0.638889 and corner shelf 1 3/4" = 0.04445 m shared with
        // the Pro-Am dossier (D2/D7); facings 141/102 deg RKC factory cuts
        // (v5 repin); side shelf 3/16" stays a WPA assumption.
        let rl = c.table("diamond_redlabel_9ft").unwrap();
        assert_eq!(rl.geometry, TableGeometry::DiamondRedLabel9Ft);
        assert!(matches!(rl.calibration, Calibration::Calibrated { .. }));
        assert_eq!(rl.recommended_cushion_model_id, "stronge_realistic");
        let g = TableGeometry::DiamondRedLabel9Ft.pocket_spec().unwrap();
        assert_eq!(g.corner_mouth, 0.1158875); // 4 9/16 in
        assert_eq!(g.side_mouth, 0.1285875); // 5 1/16 in
        // v5 facing repin (RKC factory cuts, brand-level upgrade of the
        // v4 WPA assumption): 141 − 135 = 6.0, 102 − 90 = 12.0.
        assert_eq!(g.corner_facing_deviation_deg, 6.0); // 141 deg
        assert_eq!(g.side_facing_deviation_deg, 12.0); // 102 deg
        assert_eq!(g.nose_height_frac, 0.638889); // 1 7/16" (RKC target)
        assert!((g.corner_shelf() - 0.04445).abs() < 1e-15);
        assert!((g.side_shelf() - 0.0047625).abs() < 1e-15);
        assert!(g.exact_side_facing);

        // Both v4 geometries actually differ from the legacy default build
        // AND from each other (the nose fraction + corner shelf separate
        // the Red Label from the WPA nominal despite the shared mouths).
        let r = crate::params::BallParams::default().r;
        let base = Table::wpa_9ft(r);
        let ws_t = TableGeometry::WpaSpec9Ft.build(r);
        let rl_t = TableGeometry::DiamondRedLabel9Ft.build(r);
        assert_ne!(ws_t, base);
        assert_ne!(rl_t, base);
        assert_ne!(ws_t, rl_t);

        // ui_hidden serde: additive (missing key parses to false), skipped
        // at false (pre-v4 byte parity), present when true.
        let legacy_json: TableEntry = serde_json::from_str(
            r#"{"id":"x","display_name":"X","calibration":{"Estimated":
                {"note":"n"}},"geometry":"Wpa9Ft","cushion_response":
                {"e0":0.85,"k_v":0.0,"v_ref":1.0,"e_min":0.6,"e_max":0.98},
                "recommended_cushion_model_id":"han2005_default"}"#,
        )
        .expect("pre-v4 table JSON parses");
        assert!(!legacy_json.ui_hidden);
        let visible_json = serde_json::to_string(ws).unwrap();
        assert!(!visible_json.contains("ui_hidden"), "{visible_json}");
        let hidden_json = serde_json::to_string(legacy).unwrap();
        assert!(hidden_json.contains("\"ui_hidden\":true"), "{hidden_json}");
        let back: TableEntry = serde_json::from_str(&hidden_json).unwrap();
        assert_eq!(&back, legacy);
    }

    /// Catalog v5 (referenced-only ruling, 2026-07-08 pocket-angle audit):
    /// the two Diamond entries build RKC's published Diamond FACTORY cuts
    /// — corner 141°, side 102° (AZB 184759 post #4 / AZB 445936) — as f64
    /// BIT pins, and ONLY the two facing-deviation fields moved: every
    /// other spec field of both Diamond entries, and the entire specs of
    /// the three non-Diamond entries, are pinned to their v4 values.
    #[test]
    fn v5_diamond_factory_cut_facings_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION); // v6 keeps every v5 pin below

        // Bit pins for the changed fields. Derivations (per-facing
        // rail-to-facing convention, kernel deviation form):
        //   corner: 141 deg − 135 deg baseline = 6.0  (v4: 142 ⇒ 7.0)
        //   side:   102 deg − 90 deg baseline  = 12.0 (v4: 104 ⇒ 14.0)
        // 6.0 = 0x4018000000000000, 12.0 = 0x4028000000000000 (exact).
        // v18 (GH-621): the 8/7 ft size variants are the Pro-Am spec by
        // struct update, so they carry the same factory-cut bits.
        for geom in [
            TableGeometry::DiamondProAm9Ft,
            TableGeometry::DiamondRedLabel9Ft,
            TableGeometry::DiamondProAm8Ft,
            TableGeometry::DiamondProAm7Ft,
        ] {
            let s = geom.pocket_spec().unwrap();
            assert_eq!(
                s.corner_facing_deviation_deg.to_bits(),
                0x4018000000000000,
                "{geom:?} corner deviation"
            );
            assert_eq!(
                s.side_facing_deviation_deg.to_bits(),
                0x4028000000000000,
                "{geom:?} side deviation"
            );
        }

        // Everything else on the Diamond specs is v4-frozen: overwriting
        // the two changed fields with the old WPA nominals must reproduce
        // the v4 spec structs exactly (mouths/shelves/nose/radii/depths/
        // jaw radii/exact_side_facing all untouched).
        let v4_proam = PocketTableSpec {
            corner_facing_deviation_deg: 7.0,
            side_facing_deviation_deg: 14.0,
            ..TableGeometry::DiamondProAm9Ft.pocket_spec().unwrap()
        };
        assert_eq!(v4_proam.corner_mouth, 0.11430);
        assert_eq!(v4_proam.side_mouth, 0.12700);
        assert_eq!(v4_proam.nose_height_frac, 0.638889);
        assert_eq!(v4_proam.corner_pocket_radius, 0.09652 / 2.0);
        assert_eq!(v4_proam.side_pocket_radius, 0.1016 / 2.0);
        assert!((v4_proam.corner_shelf() - 0.04445).abs() < 1e-15);
        assert!((v4_proam.side_shelf() - 0.0047625).abs() < 1e-15);
        let v4_redlabel = PocketTableSpec {
            corner_facing_deviation_deg: 7.0,
            side_facing_deviation_deg: 14.0,
            ..TableGeometry::DiamondRedLabel9Ft.pocket_spec().unwrap()
        };
        assert_eq!(v4_redlabel.corner_mouth, 0.1158875);
        assert_eq!(v4_redlabel.side_mouth, 0.1285875);
        assert_eq!(v4_redlabel.nose_height_frac, 0.638889);
        assert_eq!(v4_redlabel.corner_pocket_radius, 0.0981075 / 2.0);
        assert_eq!(v4_redlabel.side_pocket_radius, 0.10325 / 2.0);
        assert!((v4_redlabel.corner_shelf() - 0.04445).abs() < 1e-15);
        assert!((v4_redlabel.side_shelf() - 0.0047625).abs() < 1e-15);

        // Unchanged entries' pins MUST NOT move: legacy default stays the
        // wpa_generic spec (and builds bit-identical geometry, re-checked
        // in v3/v4 tests), wpa_spec_9ft keeps the WPA band nominals
        // 142/104, predator keeps its WPA-assumed 142/104.
        assert_eq!(
            TableGeometry::Wpa9Ft.pocket_spec(),
            Some(PocketTableSpec::wpa_generic())
        );
        let ws = TableGeometry::WpaSpec9Ft.pocket_spec().unwrap();
        assert_eq!(ws.corner_facing_deviation_deg.to_bits(), 7.0f64.to_bits());
        assert_eq!(ws.side_facing_deviation_deg.to_bits(), 14.0f64.to_bits());
        let p = TableGeometry::PredatorApex9Ft.pocket_spec().unwrap();
        assert_eq!(p.corner_facing_deviation_deg.to_bits(), 7.0f64.to_bits());
        assert_eq!(p.side_facing_deviation_deg.to_bits(), 14.0f64.to_bits());

        // The v5 provenance names the RKC citations and the intentional
        // Diamond-authentic-vs-WPA-conformant split on BOTH entries (and,
        // v18, on the two size variants that inherit the cut).
        for id in [
            "diamond_proam_9ft",
            "diamond_redlabel_9ft",
            "diamond_proam_8ft",
            "diamond_proam_7ft",
        ] {
            let text = match &c.table(id).unwrap().calibration {
                Calibration::Calibrated { source } => source.clone(),
                Calibration::Literature { source } => source.clone(),
                Calibration::Estimated { note } => note.clone(),
                Calibration::Measured { .. } => {
                    panic!("{id} is a pre-v8 entry, never Measured")
                }
            };
            for needle in ["141/102", "184759", "445936", "wpa_spec_9ft"] {
                assert!(text.contains(needle), "{id} provenance missing {needle:?}");
            }
        }
        // Tier split preserved: proam stays Literature (dossier +
        // factory-cut testimony), redlabel stays Calibrated (bank pairing).
        assert!(matches!(
            c.table("diamond_proam_9ft").unwrap().calibration,
            Calibration::Literature { .. }
        ));
        assert!(matches!(
            c.table("diamond_redlabel_9ft").unwrap().calibration,
            Calibration::Calibrated { .. }
        ));
    }

    /// Catalog v18 (GH-621): the Diamond Pro-Am size variants. Both
    /// entries are APPENDED (order frozen), non-hidden, pair with the
    /// Diamond-brand cushion model, and build the `diamond_proam_9ft`
    /// spec by struct update — only `length`/`width` differ, and those
    /// are the official drawings' 90" × 45" / 80" × 40" beds. The 8-ft
    /// entry is Literature tier (brand-precedent pairing, no 8-ft bank
    /// row exists); the 7-ft entry is Calibrated tier (TP B.28's
    /// "7' Diamond bar box" row, banking-report: ladder 6/6 at mean dev
    /// 0.03) — the same tier split the 9-ft Pro-Am / Red Label pair uses.
    #[test]
    fn v18_diamond_size_variants_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        assert_eq!(CATALOG_VERSION, 21);
        let ids: Vec<&str> = c.tables.iter().map(|e| e.id.as_str()).collect();
        // v19: the ceremony landed #644 first and #642 second — rasson_ox_9ft is the last id
        // v20 (#789): the de-branded twins are appended after it; the last
        // three are the twins of the two size variants and of rasson_ox_9ft
        assert_eq!(&ids[ids.len() - 3..], ["pool_pro_8ft", "pool_pro_7ft", "pool_pro_9ft_k55"]);

        let nine = PocketTableSpec::diamond_proam_9ft();
        let cases: [(&str, TableGeometry, f64, f64, &str, &str); 2] = [
            (
                "diamond_proam_8ft",
                TableGeometry::DiamondProAm8Ft,
                2.286,
                1.143,
                "Pool tournament 8-ft (4.5 in pockets) (legacy alias)",
                "pool_pro_8ft",
            ),
            (
                "diamond_proam_7ft",
                TableGeometry::DiamondProAm7Ft,
                2.032,
                1.016,
                "Pool tournament 7-ft, bar box (4.5 in pockets) (legacy alias)",
                "pool_pro_7ft",
            ),
        ];
        for (id, geom, len_m, wid_m, name, twin) in cases {
            let e = c.table(id).unwrap();
            assert_eq!(e.geometry, geom, "{id}");
            assert_eq!(e.display_name, name, "{id}");
            // v20 (#789): the old id is a hidden rename alias; its
            // de-branded twin is the picker-visible size variant
            assert!(e.ui_hidden, "{id}: superseded by {twin}");
            assert_eq!(e.superseded_by.as_deref(), Some(twin), "{id}");
            assert!(!c.table(twin).unwrap().ui_hidden, "{twin}: size variants are picker-visible");
            assert_eq!(e.cushion_response, CushionResponse::default(), "{id}");
            assert_eq!(e.recommended_cushion_model_id, "stronge_realistic", "{id}");
            let s = geom.pocket_spec().unwrap();
            // exact decimal metres of the drawing's inch labels (bit pins,
            // the diamond_proam_9ft 2.54/1.27 idiom)
            assert_eq!(s.length.to_bits(), len_m.to_bits(), "{id} length");
            assert_eq!(s.width.to_bits(), wid_m.to_bits(), "{id} width");
            // struct-update invariance: put the 9-ft bed back and the spec
            // IS the 9-ft spec, field for field
            assert_eq!(
                PocketTableSpec { length: 2.54, width: 1.27, ..s },
                nine,
                "{id}: a pocket-furniture field differs from the 9-ft spec"
            );
            // the resolved table builds and carries six pockets on the
            // variant's own bed
            let t = geom.build(BallParams::default().r);
            assert_eq!(t.pockets.len(), 6, "{id}");
            assert_eq!(t.length.to_bits(), len_m.to_bits(), "{id}");
            assert_eq!(t.width.to_bits(), wid_m.to_bits(), "{id}");
            // provenance: the drawing file, the struct-update claim and
            // the honest limit are all named on the entry
            let text = match &e.calibration {
                Calibration::Calibrated { source } => source.clone(),
                Calibration::Literature { source } => source.clone(),
                other => panic!("{id}: unexpected tier {other:?}"),
            };
            for needle in [
                "official-specsheet-",
                "struct update",
                "NO pocket dimension",
                "Black Diamond K55",
                "stronge_realistic",
            ] {
                assert!(text.contains(needle), "{id} provenance missing {needle:?}");
            }
        }
        // tier split: 8-ft Literature (brand estimate), 7-ft Calibrated
        // (TP B.28 7' bar-box row named on the entry)
        assert!(matches!(
            c.table("diamond_proam_8ft").unwrap().calibration,
            Calibration::Literature { .. }
        ));
        match &c.table("diamond_proam_7ft").unwrap().calibration {
            Calibration::Calibrated { source } => {
                assert!(source.contains("7' Diamond bar-box ladder 6/6"), "{source}");
                assert!(source.contains("banking-report.md"), "{source}");
            }
            other => panic!("7 ft: expected Calibrated, got {other:?}"),
        }
        // the appended entries did not move anything before them: the
        // first nine ids are the surviving v15 ids verbatim (v20, #789,
        // removed the v8 Measured table from that list)
        assert_eq!(
            &ids[..9],
            [
                "wpa_generic_9ft",
                "wpa_spec_9ft",
                "diamond_redlabel_9ft",
                "diamond_proam_9ft",
                "predator_apex_9ft",
                "wpbsa_snooker_12ft",
                "umb_carom_284",
                "joy_q8_9ft",
                "chinese8_pro_9ft",
            ]
        );
        // and neither retired v8 Measured id is anywhere in the list: no
        // table id hashes to a digest alias row
        for id in &ids {
            assert_eq!(alias_digest_target("table", id), None, "{id}");
            assert_eq!(alias_digest_target("cloth", id), None, "{id}");
        }
    }

    /// Catalog v3 cue entries (feature 009 K2): Platinum-derived end
    /// masses keep the robot squirt ORDERING (Z-2 < 314 < Red Dot <
    /// break), leather/phenolic tip CORs land on the entries, the dime-tip
    /// variant only changes curvature, and tip_cor serde stays additive
    /// (pre-v3 cue JSON parses to 1.0; default-tip entries serialize
    /// without the key — byte parity).
    #[test]
    fn v3_cue_entries_pinned() {
        let c = EquipmentCatalog::get();
        let em = |id: &str| c.cue(id).unwrap().params.end_mass;
        assert!(em("predator_z2") < em("predator_314"));
        assert!(em("predator_314") < em("meucci_reddot"));
        assert!(em("meucci_reddot") < em("break_phenolic"));
        // Pivot inversion spot checks (formula doc): 14.1" -> 6.11 g,
        // 10.1" -> 8.98 g (Shepard's ~8.5 g @ 10" anchor neighborhood).
        assert!((em("predator_z2") - 0.170097 / (2.5 * (14.1 / 1.125) - 3.5)).abs() < 1e-18);
        assert!((em("predator_z2") - 6.11e-3).abs() < 5e-5);
        assert!((em("meucci_reddot") - 8.98e-3).abs() < 5e-5);
        for id in ["predator_z2", "predator_314", "meucci_reddot"] {
            assert_eq!(c.cue(id).unwrap().params.tip_cor, 0.73, "{id}");
        }
        assert_eq!(c.cue("break_phenolic").unwrap().params.tip_cor, 0.85);
        let dime = &c.cue("standard_dime_tip").unwrap().params;
        assert_eq!(dime.tip_radius, 0.00895);
        assert_eq!(
            CueParams {
                tip_radius: 0.0106,
                ..*dime
            },
            CueParams::default()
        );
        // Untouched pre-v3 entries keep the elastic default.
        assert_eq!(c.cue(DEFAULT_CUE_ID).unwrap().params.tip_cor, 1.0);
        assert_eq!(c.cue("low_deflection").unwrap().params.tip_cor, 1.0);
        // Serde: additive + skipped at default.
        let legacy: CueParams =
            serde_json::from_str(r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699}"#)
                .unwrap();
        assert_eq!(legacy.tip_cor, 1.0);
        let dflt_json = serde_json::to_string(&c.cue(DEFAULT_CUE_ID).unwrap().params).unwrap();
        assert!(!dflt_json.contains("tip_cor"), "{dflt_json}");
        let z2_json = serde_json::to_string(&c.cue("predator_z2").unwrap().params).unwrap();
        assert!(z2_json.contains("\"tip_cor\":0.73"), "{z2_json}");
        let back: CueParams = serde_json::from_str(&z2_json).unwrap();
        assert_eq!(back, c.cue("predator_z2").unwrap().params);
    }

    /// Equipment rack composition: the default spec's racks are bit-exactly
    /// today's `SystemState::{nine,fifteen}_ball_rack` (plus the equipment
    /// tag, skipped at default ⇒ byte parity too); a non-default ballset
    /// re-racks at ITS radius (lattice pitch + z), overlap-free.
    #[test]
    fn equipment_racks_default_parity_and_ballset_radius() {
        let c = EquipmentCatalog::get();
        let dflt = c.resolve(&EquipmentSpec::default()).unwrap();
        for seed in [0u64, 1, 42] {
            let ours = dflt.nine_ball_rack(seed);
            assert_eq!(ours, crate::SystemState::nine_ball_rack(seed));
            assert_eq!(
                serde_json::to_string(&ours).unwrap(),
                serde_json::to_string(&crate::SystemState::nine_ball_rack(seed)).unwrap()
            );
            assert_eq!(
                dflt.fifteen_ball_rack(seed),
                crate::SystemState::fifteen_ball_rack(seed)
            );
        }
        let spec = EquipmentSpec {
            ballset_id: "snooker".into(),
            ..EquipmentSpec::default()
        };
        let sys = c.resolve(&spec).unwrap().nine_ball_rack(7);
        assert_eq!(sys.equipment, spec);
        let r = c.ballset("snooker").unwrap().params.r;
        for b in &sys.balls {
            assert_eq!(b.params.r, r);
            assert_eq!(b.state.pos.z, r);
        }
        for i in 0..sys.balls.len() {
            for j in (i + 1)..sys.balls.len() {
                let d = (sys.balls[i].state.pos - sys.balls[j].state.pos).norm();
                assert!(d >= 2.0 * r, "balls {i}/{j} overlap: {d}");
            }
        }
        // Nose height follows the snooker radius on the rack's own table.
        for s in &sys.table.linear {
            assert!((s.height - 0.635 * 2.0 * r).abs() < 1e-12);
        }
    }

    /// Amendment 012: the resolved options carry the cue entry's params
    /// (serde-skipped at the default cue), and a non-default cue actually
    /// changes the simulated strike (endmass squirt: same sidespin shot,
    /// different cue-ball line).
    #[test]
    fn resolved_options_carry_cue_and_squirt_differs() {
        let c = EquipmentCatalog::get();
        let ld = EquipmentSpec {
            cue_id: "low_deflection".into(),
            ..EquipmentSpec::default()
        };
        let r = c.resolve(&ld).unwrap();
        assert_eq!(r.cue, c.cue("low_deflection").unwrap().params);
        assert_eq!(r.options.cue, r.cue);
        // Serde: default cue omitted (pre-catalog byte parity), non-default
        // cue present and round-tripping.
        let dflt = c.resolve(&EquipmentSpec::default()).unwrap();
        assert!(!serde_json::to_string(&dflt.options).unwrap().contains("\"cue\""));
        let json = serde_json::to_string(&r.options).unwrap();
        assert!(json.contains("\"cue\""));
        let back: SimOptions = serde_json::from_str(&json).unwrap();
        assert_eq!(back, r.options);

        // Physics: max-side sidespin shot, one ball — the squirt angle must
        // differ between the standard and low-deflection cues.
        let sys = crate::SystemState {
            balls: vec![crate::Ball {
                id: crate::BallId(0),
                params: dflt.ball_params(),
                state: crate::BallState {
                    pos: crate::Vec3::new(0.0, 0.0, dflt.ball_params().r),
                    vel: crate::Vec3::ZERO,
                    avel: crate::Vec3::ZERO,
                    motion: crate::MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: dflt.table.clone(),
            equipment: EquipmentSpec::default(),
        };
        let shot = crate::ShotParams {
            v0: 2.0,
            phi: std::f64::consts::FRAC_PI_2,
            theta: 0.0,
            a: 0.4,
            b: 0.0,
            seed: 0,
        };
        let rec_std = crate::simulate(&sys, &shot, &dflt.options).unwrap();
        let rec_ld = crate::simulate(&sys, &shot, &r.options).unwrap();
        let dir = |rec: &crate::ShotRecord| {
            let mut out = Vec::new();
            rec.sample_at(1e-3, &mut out);
            libm::atan2(out[0].pos.y, out[0].pos.x)
        };
        let (d_std, d_ld) = (dir(&rec_std), dir(&rec_ld));
        // Low-deflection squirts LESS: its line lies closer to phi = π/2.
        let err = |d: f64| (d - std::f64::consts::FRAC_PI_2).abs();
        assert!(
            err(d_ld) < err(d_std) && (d_std - d_ld).abs() > 1e-4,
            "squirt must differ: std {d_std}, ld {d_ld}"
        );
    }

    /// Catalog v6 (feature 012, contracts/equipment-additions.md §1.1):
    /// every PRE-012 `TableGeometry` variant builds a BIT-IDENTICAL
    /// `Table` vs catalog v5 — the additive-only claim at the geometry
    /// level: the dispatch merely wraps the unchanged `from_pocket_spec`
    /// path, proven by value + serialized-byte comparison against the
    /// spec-direct build for every pre-012 variant.
    #[test]
    fn v6_pre012_variants_build_bit_identical_tables() {
        for r in [crate::params::BallParams::default().r, 0.02625, 0.03] {
            for (geom, spec) in [
                (TableGeometry::Wpa9Ft, PocketTableSpec::wpa_generic()),
                (TableGeometry::DiamondProAm9Ft, PocketTableSpec::diamond_proam_9ft()),
                (TableGeometry::PredatorApex9Ft, PocketTableSpec::predator_apex_9ft()),
                (TableGeometry::WpaSpec9Ft, PocketTableSpec::wpa_spec_9ft()),
                (TableGeometry::DiamondRedLabel9Ft, PocketTableSpec::diamond_redlabel_9ft()),
            ] {
                let built = geom.build(r);
                let direct = Table::from_pocket_spec(&spec, r);
                assert_eq!(built, direct, "{geom:?} at r={r}");
                assert_eq!(
                    serde_json::to_string(&built).unwrap(),
                    serde_json::to_string(&direct).unwrap(),
                    "{geom:?} bytes at r={r}"
                );
            }
            assert_eq!(TableGeometry::Wpa9Ft.build(r), Table::wpa_9ft(r));
        }
    }

    /// Catalog v6 byte-drift gate (feature 012): every v5 entry serializes
    /// BYTE-IDENTICALLY to the committed pre-012 dump
    /// (`tests/fixtures/catalog_v5.json`, captured from the shipped v5
    /// catalog before the bump) — across all five categories. The v6
    /// additions are exactly three tables + one cloth, appended.
    ///
    /// Catalog v14 (issue #283): the three branded cue entries gain the
    /// `superseded_by` METADATA key (the v4 `ui_hidden` class — entry
    /// metadata `resolve()` never reads, zero physics bytes; predating
    /// the v5 fixture, `ui_hidden` is simply IN the dump). The cue arm
    /// therefore compares with exactly that one key stripped, asserts the
    /// key appears ONLY on the three branded ids, and keeps the strict
    /// full-byte pin for everything else — id/display_name/calibration/
    /// params bytes of every v5 entry remain frozen verbatim.
    ///
    /// Catalog v20 (#789): the v5 entries that gained a de-branded twin
    /// (three tables, two cloths, two ballsets) carry `superseded_by` +
    /// `ui_hidden` (the same metadata class), and so do the three branded
    /// cues. Each key is stripped only on its listed ids and only at its
    /// documented value. Their neutral `display_name` (the twin's name plus
    /// " (legacy alias)") is spliced back: the live text must equal the
    /// documented literal, the v5 value is substituted, and the full-byte
    /// pin then holds for everything else in the entry.
    #[test]
    fn v5_entries_byte_frozen_against_committed_dump() {
        let v5: serde_json::Value = serde_json::from_str(include_str!(
            "../tests/fixtures/catalog_v5.json"
        ))
        .expect("committed v5 dump parses");
        assert_eq!(v5["version"], 5);
        let c = serde_json::to_value(EquipmentCatalog::get()).unwrap();
        let superseded_v14 = ["predator_z2", "predator_314", "meucci_reddot"];
        let twins_v14 = ["pro_ld_pivot_141", "pro_ld_pivot_118", "pro_ld_pivot_101"];
        // v20 (#789): (category, v5 id, documented superseded_by twin) of
        // the non-cue v5 entries that gained a de-branded twin.
        let superseded_v20: [(&str, &str, &str); 7] = [
            ("tables", "diamond_redlabel_9ft", "pool_pro_9ft_older_gen"),
            ("tables", "diamond_proam_9ft", "pool_pro_9ft"),
            ("tables", "predator_apex_9ft", "pool_pro_9ft_metal_rim"),
            ("cloths", "simonis_860_tournament", "pool_worsted_new"),
            ("cloths", "simonis_760_fast", "pool_worsted_fast"),
            ("ballsets", "aramith_pool", "pool_standard"),
            ("ballsets", "aramith_pool_worn", "pool_used"),
        ];
        let documented_twin = |cat: &str, id: &str| -> Option<&str> {
            if cat == "cues" {
                superseded_v14
                    .iter()
                    .position(|b| *b == id)
                    .map(|i| twins_v14[i])
            } else {
                superseded_v20
                    .iter()
                    .find(|(k, old, _)| *k == cat && *old == id)
                    .map(|(_, _, twin)| *twin)
            }
        };
        // v20 (#789, R6): (category, v5 id, documented live display_name)
        // of the ten v5 entries renamed in place.
        let display_v20: [(&str, &str, &str); 10] = [
            ("tables", "diamond_redlabel_9ft", "Pool tournament 9-ft, older gen (4.56 in pockets) (legacy alias)"),
            ("tables", "diamond_proam_9ft", "Pool tournament 9-ft (4.5 in pockets) (legacy alias)"),
            ("tables", "predator_apex_9ft", "Pool tournament 9-ft, metal-rim (4.25 in pockets) (legacy alias)"),
            ("cloths", "simonis_860_tournament", "Worsted tournament cloth (new) (legacy alias)"),
            ("cloths", "simonis_760_fast", "Worsted tournament cloth (fast) (legacy alias)"),
            ("ballsets", "aramith_pool", "Pool (57.15 mm) (legacy alias)"),
            ("ballsets", "aramith_pool_worn", "Pool, worn/used (57.15 mm) (legacy alias)"),
            ("cues", "predator_z2", "Pro LD shaft, 14.1 in pivot (leather tip) (legacy alias)"),
            ("cues", "predator_314", "Pro LD shaft, 11.8 in pivot (leather tip) (legacy alias)"),
            ("cues", "meucci_reddot", "Pro LD shaft, 10.1 in pivot (leather tip) (legacy alias)"),
        ];
        // GH-973: the Calibration source text of these v5 entries names
        // reference slow-motion footage instead of its earlier source and drops
        // an internal staging path. Like the CAL-1 note below, the text is
        // calibration METADATA (`resolve()` never reads it; params are
        // unchanged). Splice-proof: the live text must be exactly the
        // documented GH-973 text, then the dump's text goes back and the full
        // byte compare runs. (The old wording is not quoted here. Build 20's
        // open-source pass also reworded the old attribution in the dump's
        // two source strings, so the dump is no longer the exact captured v5
        // bytes there; the verbatim v5 wording is kept in an internal
        // provenance record, and the dump still keeps a wording of its own,
        // distinct from the live text.)
        let debrand_973: [(&str, &str, &str); 2] = [
            (
                "ballsets",
                "aramith_pool_worn",
                "BallBallFriction::worn_fitted joint fit on reference slow-motion \
                 footage (examples/fit_mu_bb.rs over the staged observables: \
                 topspin-hop apex 1.1-3.1 mm + both solved-camera cut throws + \
                 stun-B null, loss 0.49 vs 4.40 for the Marlow fit; report under \
                 docs/research/). Literature support for the raised floor: \
                 Alciatore TP B.3 Colenso-refit shape (ball condition unstated in \
                 TP B.3; worn/used is our inference) + 1.5-2.5x dirty-band (TP \
                 A-14 cling section), Mathavan 2014 constant mu=0.05, Dr. Dave BD \
                 Jul/Aug 2014 dirty-ball throw measurements",
            ),
            (
                "cushion_models",
                "stronge_realistic",
                "calibrated cushion-friction curve fitted on reference slow-motion \
                 footage (params.rs provenance); omega_ratio=1.8 adopted from \
                 pooltool's shipped resolver default — the SC-002 kick anchors \
                 are all gross-slip and cannot calibrate it \
                 (resolve/cushion_stronge.rs provenance)",
            ),
        ];
        // Open source (F6): Calibration text compiled into the wasm names no
        // docs/verification path; a pointer reads "<path> (internal)". The
        // text is METADATA (`resolve()` never reads it). Splice-proof for
        // the v5 tables it touches (predator_apex_9ft's note is restored
        // whole by the CAL-1 arm): the live text carries exactly the listed
        // labels and no docs/verification path, the v5 pointers go back, and
        // the full byte compare runs, so any other drift still fails.
        let f6_v5: [(&str, &str, &str, usize); 3] = [
            ("wpa_generic_9ft", "Estimated", "note", 1),
            ("diamond_redlabel_9ft", "Calibrated", "source", 2),
            ("diamond_proam_9ft", "Literature", "source", 1),
        ];
        let f6_labels: [(&str, &str); 2] = [
            ("table-dimension-audit.md (internal)", "docs/verification/table-dimension-audit.md"),
            ("banking-report.md (internal)", "docs/verification/banking-report.md"),
        ];
        let mut f6_spliced = 0;
        let mut debranded = 0;
        let mut stripped = 0;
        let mut spliced = 0;
        for cat in ["tables", "cloths", "ballsets", "cues", "cushion_models"] {
            let old = v5[cat].as_array().unwrap();
            let new = c[cat].as_array().unwrap();
            assert!(new.len() >= old.len(), "{cat} shrank");
            for (i, e) in old.iter().enumerate() {
                let mut entry = new[i].clone();
                if cat == "tables" && e["id"] == "predator_apex_9ft" {
                    // v17 CAL-1 exception (GH-484, PR #601): the entry's
                    // side-mouth geometry adopted the official 4.92 in and
                    // its provenance NOTE moved with it. The note is
                    // calibration METADATA (`resolve()` never reads it), and
                    // the v5 fixture stays frozen verbatim — the drift is
                    // recorded HERE explicitly instead of by rewriting the
                    // historical dump. Splice-proof: assert the live note is
                    // exactly the documented v17 text, then substitute the
                    // v5 note back and require full byte identity, so ANY
                    // other movement in this entry still fails the pin.
                    let live = entry["calibration"]["Estimated"]["note"]
                        .as_str()
                        .expect("predator note is a string");
                    assert!(
                        live.contains("4.92\"/124.97 mm")
                            && live.contains("CAL-1")
                            && live.contains("superseding the dealer-relayed 5.0\"/127 mm"),
                        "{cat}[{i}]: predator note must be the documented \
                         v17 CAL-1 text, got: {live}"
                    );
                    entry["calibration"]["Estimated"]["note"] =
                        e["calibration"]["Estimated"]["note"].clone();
                }
                if let Some((_, _, live_973)) = debrand_973
                    .iter()
                    .find(|(k, old, _)| *k == cat && e["id"] == *old)
                {
                    assert_eq!(
                        entry["calibration"]["Calibrated"]["source"], *live_973,
                        "{cat}[{i}]: the live source must be the documented GH-973 text"
                    );
                    assert_ne!(
                        e["calibration"]["Calibrated"]["source"], *live_973,
                        "{cat}[{i}]: the v5 dump keeps its own wording"
                    );
                    entry["calibration"]["Calibrated"]["source"] =
                        e["calibration"]["Calibrated"]["source"].clone();
                    debranded += 1;
                }
                if let Some((_, tier, key, n)) = f6_v5
                    .iter()
                    .find(|(id, ..)| cat == "tables" && e["id"] == *id)
                {
                    let live = entry["calibration"][*tier][*key]
                        .as_str()
                        .expect("F6 calibration text is a string")
                        .to_string();
                    assert!(!live.contains("docs/verification"), "{cat}[{i}]: {live}");
                    let mut back = live.clone();
                    let mut hits = 0;
                    for (label, v5_pointer) in f6_labels {
                        hits += back.matches(label).count();
                        back = back.replace(label, v5_pointer);
                    }
                    assert_eq!(hits, *n, "{cat}[{i}]: the documented F6 labels, got: {live}");
                    entry["calibration"][*tier][*key] = serde_json::Value::String(back);
                    f6_spliced += 1;
                }
                // v14 + v20 metadata keys: `superseded_by` is allowed ONLY
                // on the listed ids and ONLY with the documented twin, and
                // every listed entry is `ui_hidden` (a rename alias). Both
                // keys are stripped for the byte compare below. An unlisted
                // entry keeps its v5 bytes, `ui_hidden` included (the
                // legacy default table's `ui_hidden` predates the dump).
                let id = e["id"].as_str().unwrap();
                let map = entry.as_object_mut().unwrap();
                let took = map.remove("superseded_by");
                match documented_twin(cat, id) {
                    Some(twin) => {
                        assert_eq!(
                            took.as_ref().and_then(|v| v.as_str()),
                            Some(twin),
                            "{cat}[{i}] ({id}): superseded_by must be the documented twin"
                        );
                        assert_eq!(
                            map.remove("ui_hidden"),
                            Some(serde_json::Value::Bool(true)),
                            "{cat}[{i}] ({id}): a superseded v5 entry is ui_hidden"
                        );
                        stripped += 1;
                    }
                    None => assert!(
                        took.is_none(),
                        "{cat}[{i}] ({id}): superseded_by is only on the listed ids"
                    ),
                }
                // R6 display splice: assert the documented live text, then
                // substitute the v5 value back.
                if let Some((_, _, live)) =
                    display_v20.iter().find(|(k, old, _)| *k == cat && *old == id)
                {
                    assert_eq!(
                        map["display_name"], *live,
                        "{cat}[{i}] ({id}): display_name must be the documented v20 literal"
                    );
                    map.insert("display_name".to_string(), e["display_name"].clone());
                    spliced += 1;
                }
                assert_eq!(
                    serde_json::to_string(e).unwrap(),
                    serde_json::to_string(&entry).unwrap(),
                    "{cat}[{i}] ({}) drifted from v5",
                    e["id"]
                );
            }
        }
        // v6 appended three tables + one cloth; v8 appended one Measured
        // table + one Measured cloth; v9 appended two visual-variant
        // ballsets (issue #91); v15 appended the de-branded
        // chinese8_pro_9ft table (GH-490 — its joy_q8_9ft alias is a v6
        // entry, outside the v5 pin set); v18 appended the two Diamond
        // Pro-Am size variants (GH-621). All additive-only claims hold
        // through the per-entry byte pins above.
        // v19 (Rasson OX-A1, landed second) appended the rasson_ox_9ft table.
        // v20 (#789) appended the de-branded twins (7 tables, 3 cloths, 4 ballsets)
        // and removed the two v8 Measured entries, whose twins carry them.
        assert_eq!(stripped, 10, "every listed v5 entry was stripped once");
        assert_eq!(spliced, 10, "every documented v20 display literal was spliced once");
        assert_eq!(debranded, 2, "every GH-973 Calibration text was spliced once");
        assert_eq!(f6_spliced, 3, "every F6 v5 table text was spliced once");
        assert_eq!(
            c["tables"].as_array().unwrap().len(),
            v5["tables"].as_array().unwrap().len() + 14
        );
        assert_eq!(
            c["cloths"].as_array().unwrap().len(),
            v5["cloths"].as_array().unwrap().len() + 4
        );
        assert_eq!(
            c["ballsets"].as_array().unwrap().len(),
            v5["ballsets"].as_array().unwrap().len() + 6,
            "ballsets: the two v9 visual-variant entries + the four v20 twins"
        );
        // Cues: the v10 masse_trick (issue #168) + the v12
        // masse_trick_dwell (issue #232) + the seven v14 entries (issue
        // #283: four archetypes + three de-branding twins). v13 was
        // schema-only (issue #277).
        assert_eq!(
            c["cues"].as_array().unwrap().len(),
            v5["cues"].as_array().unwrap().len() + 9,
            "cues: v10 masse_trick + v12 masse_trick_dwell + the 7 v14 entries"
        );
        // NO new cushion-model entries in v6-v14.
        assert_eq!(
            c["cushion_models"].as_array().unwrap().len(),
            v5["cushion_models"].as_array().unwrap().len(),
            "cushion_models must not gain v6-v14 entries"
        );
    }

    /// Catalog v9 entry pins (issue #91): the two visual-variant pool
    /// ballsets carry the frozen ids in order, Estimated tier with the
    /// visual-variant rationale, and params BYTE-IDENTICAL to the
    /// aramith_pool class (BallParams::default, no bb_friction override) —
    /// identical trajectories to aramith_pool by construction.
    #[test]
    fn v9_visual_variant_ballsets_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        assert_eq!(
            c.ballsets.iter().map(|b| b.id.as_str()).collect::<Vec<_>>(),
            ["aramith_pool", "aramith_pool_worn", "snooker", "carom",
             "aramith_black", "arcos_reserve",
             // v20 (#789): the four de-branded twins, appended
             "pool_standard", "pool_used", "pool_black_cap", "pool_ivory_gunsight"]
        );
        let pool = c.ballset("aramith_pool").unwrap();
        for (id, name) in [
            ("aramith_black", "Black-cap tournament (legacy alias)"),
            ("arcos_reserve", "Ivory gunsight (legacy alias)"),
        ] {
            let e = c.ballset(id).unwrap();
            assert_eq!(e.display_name, name);
            assert_eq!(e.params, pool.params, "{id}: params must byte-copy the aramith_pool class");
            assert_eq!(e.params, BallParams::default(), "{id}: params are the kernel default set");
            assert!(e.bb_friction.is_none(), "{id}: no invented friction curve");
            let note = match &e.calibration {
                Calibration::Estimated { note } => note,
                other => panic!("{id} tier: {other:?}"),
            };
            for needle in ["visual variant", "aramith_pool", "issue #91"] {
                assert!(note.contains(needle), "{id} provenance missing {needle:?}");
            }
            // serialized-byte proof: the params slice is byte-identical
            assert_eq!(
                serde_json::to_string(&e.params).unwrap(),
                serde_json::to_string(&pool.params).unwrap(),
            );
        }
        // resolve() attaches the class exactly like aramith_pool: same ball
        // template, same table build radius, no SimOptions friction override.
        for id in ["aramith_black", "arcos_reserve"] {
            let spec = EquipmentSpec {
                ballset_id: id.to_string(),
                ..EquipmentSpec::default()
            };
            let resolved = c.resolve(&spec).unwrap();
            let base = c.resolve(&EquipmentSpec::default()).unwrap();
            assert_eq!(resolved.ball_template, base.ball_template, "{id}");
            assert_eq!(resolved.table, base.table, "{id}");
            assert_eq!(
                resolved.options.bb_friction, base.options.bb_friction,
                "{id}"
            );
        }
    }

    /// Catalog v12 (issue #232): `masse_trick` is REVERTED to its exact
    /// v10 bytes — the restored v10 entry pin (issue #168, kernel-api.md
    /// Amendment 021): frozen id (appended in v10 order), the Venom W2/W3
    /// provenance, the measured-band cap 0.58 R (< the 0.6 R physical
    /// ceiling), the W3 bracket-top mass 0.62 kg, nickel-class tip,
    /// `standard`-entry end_mass/tip_cor (not invented). The v11 dwell
    /// quartet is GONE from this entry: params equal the v10 struct, the
    /// serialized entry carries the cap key and NO pinch_* key, and the
    /// provenance carries NO Amendment-024 passage. The full serialized
    /// ENTRY (id + display_name + calibration + params) is pinned
    /// byte-identical to the v10 serialization (captured from the
    /// pre-#222 build at cbe17312, `pool-cli catalog show masse_trick`).
    #[test]
    fn v12_masse_trick_reverted_to_v10_bytes() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);

        let e = c.cue("masse_trick").unwrap();
        assert_eq!(e.display_name, "Massé/trick cue (hard pressed tip)");
        assert_eq!(
            e.params,
            CueParams {
                m: 0.62,
                miscue_contact_cap_r: 0.58,
                ..CueParams::default()
            }
        );
        assert!(e.params.miscue_contact_cap_r < CueParams::MISCUE_CONTACT_CAP_MAX);
        // Calibrated tier with the v10 W2/W3 provenance passages pinned —
        // and the v11 Amendment-024 passages ABSENT (the reversion).
        let src = match &e.calibration {
            Calibration::Calibrated { source } => source,
            other => panic!("masse_trick tier: {other:?}"),
        };
        for needle in [
            "Venom",
            "#168",
            "venom/report.md (internal)",
            "0.567",
            "0.579",
            "0.58",
            "0.62 kg",
        ] {
            assert!(src.contains(needle), "provenance missing {needle:?}");
        }
        for gone in ["#212", "Amendment-024", "masse-shot-1", "dwell"] {
            assert!(
                !src.contains(gone),
                "v10 provenance must NOT carry the v11 passage {gone:?}"
            );
        }

        // v10 serde shape: the cap key present, NO dwell key.
        let json = serde_json::to_string(&e.params).unwrap();
        assert!(json.contains("\"miscue_contact_cap_r\":0.58"), "{json}");
        assert!(!json.contains("pinch_"), "{json}");

        // Byte-identity to the shipped v10 entry: the exact serialization
        // of the whole entry, captured from the pre-#222 catalog (commit
        // cbe17312, catalog v10) via `pool-cli catalog show masse_trick`.
        let v10 = "{\"id\":\"masse_trick\",\"display_name\":\"Mass\u{e9}/trick \
                   cue (hard pressed tip)\",\"calibration\":{\"Calibrated\":\
                   {\"source\":\"Venom footage program W2/W3 (issues \
                   #154/#168, docs/verification/venom/report.md): Dr. Dave's \
                   overlaid tip-position crosshairs, measured through the \
                   verified homographies, put the contact offsets at \
                   0.572/0.579/0.567 R on shots 3/1/2 -> miscue_contact_cap_r \
                   0.58 covers the measured band (the W3 fits had to clamp \
                   every strike to the 0.5 R boundary, gap +0.067..+0.079 R); \
                   cue mass 0.62 kg = the W3 shot-2 fit pegged at its \
                   declared trick-cue bracket top; tip curvature nickel-class \
                   (extraction note: dime-to-near-flat band, nickel held); \
                   end_mass/tip_cor stay at the `standard` values \u{2014} no \
                   squirt/efficiency measurement exists for this cue class \
                   (P-IV: not invented)\"}},\"params\":{\"m\":0.62,\
                   \"tip_radius\":0.0106,\"end_mass\":0.0056699,\
                   \"miscue_contact_cap_r\":0.58}}";
        // Open source (F6): the provenance pointer reads as an "(internal)"
        // label in the shipped text. Splice-proof: the live entry carries
        // the label exactly once; the v10 pointer put back gives v10 bytes.
        let live = serde_json::to_string(e).unwrap();
        let f6_label = "venom/report.md (internal)";
        assert_eq!(live.matches(f6_label).count(), 1, "{live}");
        assert!(!live.contains("docs/verification"), "{live}");
        assert_eq!(
            live.replacen(f6_label, "docs/verification/venom/report.md", 1),
            v10,
            "masse_trick must serialize byte-identically to its v10 form"
        );

        // resolve() routes the reverted (v10) params onto SimOptions.cue:
        // persisted masse_trick selections get v10 physics again.
        let spec = EquipmentSpec {
            cue_id: "masse_trick".to_string(),
            ..EquipmentSpec::default()
        };
        let resolved = c.resolve(&spec).unwrap();
        assert_eq!(resolved.options.cue, e.params);
        assert_eq!(resolved.options.cue.pinch_dwell_gain, 0.0);
        assert_eq!(resolved.options.cue.pinch_press_scale, 1.0);
    }

    /// Catalog v12 entry pins (issue #232; calibration = the Amendment-024
    /// refit, issue #212): the NEW `masse_trick_dwell` cue is appended
    /// after `masse_trick`, carries the distinct display name, the FULL
    /// masse-shot-1 fitted operating point (cue mass 0.737611 kg — the
    /// mass the 024 acceptance actually ran, NOT masse_trick's 0.62 —
    /// plus the dwell quartet and the 0.58 R cap), and the refit
    /// provenance including the documented mass difference. Serde: this
    /// entry is the ONLY cue carrying any pinch_* dwell key; every other
    /// cue (masse_trick included) keeps its pre-024 byte shape.
    #[test]
    fn v12_masse_trick_dwell_cue_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        assert_eq!(
            c.cues.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            ["standard", "low_deflection", "predator_z2", "predator_314",
             "meucci_reddot", "break_phenolic", "standard_dime_tip",
             "masse_trick", "masse_trick_dwell",
             // catalog v14 (issue #283): archetypes + de-branding twins
             "carbon_ld", "jump_phenolic", "snooker_ash", "carom_conical",
             "pro_ld_pivot_141", "pro_ld_pivot_118", "pro_ld_pivot_101"],
            "v12/v14 entries are appended (immutable-order additive rule)"
        );

        let e = c.cue("masse_trick_dwell").unwrap();
        assert_eq!(
            e.display_name,
            "Massé/trick cue, dwell-calibrated (soft pressed tip)"
        );
        assert_ne!(
            e.display_name,
            c.cue("masse_trick").unwrap().display_name,
            "the dwell entry must be distinguishable in pickers"
        );
        assert_eq!(
            e.params,
            CueParams {
                m: 0.737611,
                miscue_contact_cap_r: 0.58,
                pinch_dwell_gain: 0.54,
                pinch_jam: 1.0,
                pinch_end_mass: 0.0209,
                pinch_press_scale: 0.1725,
                ..CueParams::default()
            }
        );
        assert!(e.params.miscue_contact_cap_r < CueParams::MISCUE_CONTACT_CAP_MAX);
        // Dwell values inside their design-declared brackets and the
        // kernel validation domains (gain [0, MAX], emp [end_mass, MAX]).
        assert!(e.params.pinch_dwell_gain <= CueParams::PINCH_DWELL_GAIN_MAX);
        assert!(
            e.params.pinch_end_mass >= e.params.end_mass
                && e.params.pinch_end_mass <= CueParams::PINCH_END_MASS_MAX
        );
        assert!((0.0..=1.0).contains(&e.params.pinch_jam));
        assert!((0.0..=1.0).contains(&e.params.pinch_press_scale));
        // Calibrated tier with the Amendment-024 refit provenance pinned,
        // including the fitted-mass basis and the documented 0.62 delta.
        let src = match &e.calibration {
            Calibration::Calibrated { source } => source,
            other => panic!("masse_trick_dwell tier: {other:?}"),
        };
        for needle in [
            "#212",
            "#232",
            "masse-shot-1.fit.json",
            "design-212-masse-curve-authority.md section 8",
            "0.54",
            "0.0209",
            "0.1725",
            "jam 1.0 HELD",
            "0.737611",
            "[0.7, 0.78]",
            "0.62 kg",
            "0.58",
        ] {
            assert!(src.contains(needle), "provenance missing {needle:?}");
        }

        // Serde: ONLY the dwell entry carries any pinch_* key; the cap key
        // stays confined to the two trick entries.
        for cue in &c.cues {
            let json = serde_json::to_string(&cue.params).unwrap();
            if cue.id == "masse_trick_dwell" {
                for frag in [
                    "\"m\":0.737611",
                    "\"miscue_contact_cap_r\":0.58",
                    "\"pinch_dwell_gain\":0.54",
                    "\"pinch_jam\":1.0",
                    "\"pinch_end_mass\":0.0209",
                    "\"pinch_press_scale\":0.1725",
                ] {
                    assert!(json.contains(frag), "missing {frag}: {json}");
                }
            } else {
                assert!(
                    !json.contains("pinch_"),
                    "{}: pre-024 byte shape must hold: {json}",
                    cue.id
                );
                if cue.id != "masse_trick" {
                    assert!(
                        !json.contains("miscue_contact_cap_r"),
                        "{}: pre-021 byte shape must hold: {json}",
                        cue.id
                    );
                }
            }
        }

        // resolve() routes the cap AND the dwell quartet onto
        // SimOptions.cue like any other cue param — the dwell physics
        // reaches simulate from the catalog id.
        let spec = EquipmentSpec {
            cue_id: "masse_trick_dwell".to_string(),
            ..EquipmentSpec::default()
        };
        let resolved = c.resolve(&spec).unwrap();
        assert_eq!(resolved.options.cue, e.params);
    }

    /// Catalog v13 (issue #277, kernel-api.md Amendment 025): SCHEMA-ONLY
    /// bump — the two structural shaft fields exist on `CueParams`, every
    /// PRE-v14 cue entry serializes WITHOUT either key (byte-identity to
    /// its v12 form: both fields serde-skip at their defaults and no
    /// pre-v14 entry carries a non-default value), and every such cue
    /// reports the defaults (27.0 Hz / ζ 0.08). The strictest reading of
    /// the #232 immutability lesson: v13 added no entry and mutated none.
    /// (Catalog v14, issue #283: the four NEW archetypes are the first
    /// entries carrying non-default `shaft_first_mode_hz` — pinned in
    /// `v14_cue_archetypes_pinned`; the pre-v14 pins below are scoped to
    /// the frozen v13 entry set.)
    #[test]
    fn v13_schema_only_shaft_fields_no_entry_moves() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        // v15 (GH-490), v16 (calibration B1), v17 (calibration B2
        // CAL-1, predator side mouth), v18 (GH-621 Diamond size
        // variants) and v21 (GH-1080 chinese8 corner + middle):
        // table-axis-only bumps — no cue entry moves.
        assert_eq!(CATALOG_VERSION, 21);
        for cue in c.cues.iter().take(9) {
            let json = serde_json::to_string(&cue.params).unwrap();
            assert!(
                !json.contains("shaft_"),
                "{}: v12 byte shape must hold (no shaft_ key): {json}",
                cue.id
            );
            assert_eq!(
                (cue.params.shaft_first_mode_hz, cue.params.shaft_damping_ratio),
                (27.0, 0.08),
                "{}: every pre-v14 cue picks up the structural defaults",
                cue.id
            );
        }
        // No shipped entry overrides the damping default (the v14
        // archetypes set f1 only; ζ has no cue-specific measurement).
        for cue in &c.cues {
            assert_eq!(cue.params.shaft_damping_ratio, 0.08, "{}", cue.id);
        }
        // resolve() routes the defaults like any other cue param.
        let resolved = c.resolve(&EquipmentSpec::default()).unwrap();
        assert_eq!(resolved.options.cue.shaft_first_mode_hz, 27.0);
        assert_eq!(resolved.options.cue.shaft_damping_ratio, 0.08);
    }

    /// Catalog v14 archetype pins (issue #283 owner decision 1): the four
    /// new cue entries carry the frozen ids in order, the researched
    /// parameter values, Estimated tier with per-value provenance
    /// (uncited-clone rejection: the REQUIRED passages are pinned), the
    /// documented byte-adoptions (carbon_ld end_mass == low_deflection's;
    /// jump_phenolic end_mass == break_phenolic's), the correct serde
    /// shape (f1 key present, ζ/pinch/cap keys absent), and resolution
    /// through the equipment spec.
    #[test]
    fn v14_cue_archetypes_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        // v15 (GH-490), v16 (calibration B1), v17 (calibration B2
        // CAL-1, predator side mouth), v18 (GH-621 Diamond size
        // variants) and v21 (GH-1080 chinese8 corner + middle):
        // table-axis-only bumps — no cue entry moves.
        assert_eq!(CATALOG_VERSION, 21);

        let cue = |id: &str| c.cue(id).unwrap();
        let note = |e: &CueEntry| -> String {
            match &e.calibration {
                Calibration::Estimated { note } => note.clone(),
                other => panic!("{} tier: {other:?}", e.id),
            }
        };

        // carbon_ld: the CF ultra-LD regime value byte-copied from
        // low_deflection; leather tip COR; Estimated 40 Hz mode.
        let cf = cue("carbon_ld");
        assert_eq!(cf.display_name, "Carbon-fiber ultra-LD shaft (leather tip)");
        assert_eq!(
            cf.params,
            CueParams {
                end_mass: 0.170097 / 100.0,
                tip_cor: 0.73,
                shaft_first_mode_hz: 40.0,
                ..CueParams::default()
            }
        );
        assert_eq!(
            cf.params.end_mass.to_bits(),
            cue("low_deflection").params.end_mass.to_bits(),
            "carbon_ld adopts the low_deflection CF-LD regime value byte-exactly"
        );
        for needle in [
            "Shepard 2001",
            "Revo-class pivot ~19 in",
            "end_mass_from_pivot_in",
            "7.6-14.1 in",
            "US7431655B2",
            "Euler-Bernoulli",
            "Estimated",
            "HSV B.42",
        ] {
            assert!(note(cf).contains(needle), "carbon_ld missing {needle:?}");
        }

        // jump_phenolic: the light-mass strike entry; phenolic COR band;
        // jam 0 flight channel stated; break-band end mass adopted;
        // length-scaled f1 with the formula in the provenance.
        let jp = cue("jump_phenolic");
        assert_eq!(jp.display_name, "Jump cue (phenolic tip)");
        assert_eq!(
            jp.params,
            CueParams {
                m: 0.26,
                tip_cor: 0.85,
                end_mass: end_mass_from_pivot_in(7.6),
                shaft_first_mode_hz: 57.0,
                ..CueParams::default()
            }
        );
        assert_eq!(
            jp.params.end_mass.to_bits(),
            cue("break_phenolic").params.end_mass.to_bits(),
            "jump_phenolic adopts the break-cue band byte-exactly"
        );
        assert_eq!(jp.params.pinch_jam, 0.0, "phenolic jump tips keep the flight channel");
        for needle in [
            "8-12 oz",
            "TP B.22",
            "jam 0",
            "(58/40)^2 x 27 Hz",
            "break_phenolic",
            "nickel default, stated",
        ] {
            assert!(note(jp).contains(needle), "jump_phenolic missing {needle:?}");
        }

        // snooker_ash: 9.5 mm dime-class tip on a brass ferrule; the
        // pooltool SNOOKER_GENERIC anchor + declared brass bump.
        let sa = cue("snooker_ash");
        assert_eq!(sa.display_name, "Snooker ash cue, 9.5 mm brass ferrule");
        assert_eq!(
            sa.params,
            CueParams {
                m: 0.49,
                tip_radius: 0.00895,
                end_mass: 0.140 / 30.0 + 0.002,
                tip_cor: 0.73,
                shaft_first_mode_hz: 28.0,
                ..CueParams::default()
            }
        );
        assert_eq!(sa.params.tip_radius, cue("standard_dime_tip").params.tip_radius);
        for needle in [
            "SNOOKER_GENERIC",
            "0.140/30",
            "brass-ferrule bump",
            "ash plays slightly stiffer",
            "TP B.1",
        ] {
            assert!(note(sa).contains(needle), "snooker_ash missing {needle:?}");
        }

        // carom_conical: the 3-cushion band mass, low-squirt Estimated
        // end mass, conical-taper f1; the ballset-owns-the-ball note.
        let cc = cue("carom_conical");
        assert_eq!(cc.display_name, "Carom cue, conical taper");
        assert_eq!(
            cc.params,
            CueParams {
                m: 0.52,
                tip_cor: 0.73,
                end_mass: 0.0045,
                shaft_first_mode_hz: 35.0,
                ..CueParams::default()
            }
        );
        assert!(
            cc.params.end_mass < CueParams::default().end_mass
                && cc.params.end_mass > 0.170097 / 100.0,
            "carom low-squirt estimate sits between standard and CF ultra-LD"
        );
        for needle in [
            "520-540 g",
            "DELIBERATELY low-squirt",
            "BALLSET",
            "conical taper",
            "55-56 in",
        ] {
            assert!(note(cc).contains(needle), "carom_conical missing {needle:?}");
        }

        // Shared v14 invariants: f1 inside the Amendment-025 domain,
        // ζ at the default, serde shape = f1 key only (no ζ/pinch/cap
        // key), and every entry resolves onto SimOptions.cue.
        for id in ["carbon_ld", "jump_phenolic", "snooker_ash", "carom_conical"] {
            let e = cue(id);
            assert!(
                e.params.shaft_first_mode_hz >= CueParams::SHAFT_FIRST_MODE_HZ_MIN
                    && e.params.shaft_first_mode_hz <= CueParams::SHAFT_FIRST_MODE_HZ_MAX,
                "{id}"
            );
            assert_eq!(e.params.shaft_damping_ratio, 0.08, "{id}");
            assert_eq!(e.superseded_by, None, "{id}: new entries are not superseded");
            let json = serde_json::to_string(&e.params).unwrap();
            assert!(json.contains("shaft_first_mode_hz"), "{id}: {json}");
            assert!(!json.contains("shaft_damping_ratio"), "{id}: {json}");
            assert!(!json.contains("pinch_"), "{id}: {json}");
            assert!(!json.contains("miscue_contact_cap_r"), "{id}: {json}");
            let resolved = c
                .resolve(&EquipmentSpec {
                    cue_id: id.to_string(),
                    ..EquipmentSpec::default()
                })
                .unwrap();
            assert_eq!(resolved.options.cue, e.params, "{id}");
        }
    }

    /// Catalog v14 de-branding (issue #283 owner decision 2): each
    /// generic-id twin serializes its `params` BYTE-IDENTICALLY to its
    /// branded counterpart; supersession metadata is exactly the three
    /// branded ids, points at existing non-superseded twins, and every
    /// picker-visible (non-superseded) cue display name is brand-free —
    /// the UI never needs a branded string after the app-side filter
    /// lands. resolve() keeps serving both ids (#232: records pin them).
    #[test]
    fn v14_debranding_twins_and_supersession() {
        let c = EquipmentCatalog::get();
        let pairs = [
            ("predator_z2", "pro_ld_pivot_141"),
            ("predator_314", "pro_ld_pivot_118"),
            ("meucci_reddot", "pro_ld_pivot_101"),
        ];
        for (branded, twin) in pairs {
            let b = c.cue(branded).unwrap();
            let t = c.cue(twin).unwrap();
            assert_eq!(b.superseded_by.as_deref(), Some(twin), "{branded}");
            assert_eq!(t.superseded_by, None, "{twin}: no supersession chains");
            // v20 (#789, R8): the branded id is a hidden rename alias; the
            // twin stays picker-visible.
            assert!(b.ui_hidden, "{branded}: ui_hidden rename alias");
            assert!(!t.ui_hidden, "{twin}: picker-visible");
            // Physics byte-identity: the twin IS the branded entry.
            assert_eq!(b.params, t.params, "{branded} vs {twin}");
            assert_eq!(
                serde_json::to_string(&b.params).unwrap(),
                serde_json::to_string(&t.params).unwrap(),
                "{branded} vs {twin}: params bytes"
            );
            // The twin resolves to the exact same strike model.
            let res = |id: &str| {
                c.resolve(&EquipmentSpec {
                    cue_id: id.to_string(),
                    ..EquipmentSpec::default()
                })
                .unwrap()
                .options
            };
            assert_eq!(
                serde_json::to_string(&res(branded)).unwrap(),
                serde_json::to_string(&res(twin)).unwrap(),
                "{branded}/{twin}: resolved options bytes"
            );
            // Twin provenance keeps the robot citation + the twin claim;
            // twin display names carry the pivot spec, never the brand.
            let src = match &t.calibration {
                Calibration::Literature { source } => source,
                other => panic!("{twin} tier: {other:?}"),
            };
            for needle in [
                "generic-id twin",
                branded,
                "Platinum Billiards 2008 robot test",
                "nominative use",
            ] {
                assert!(src.contains(needle), "{twin} missing {needle:?}");
            }
            assert!(t.display_name.contains("in pivot"), "{twin}");
        }
        // Supersession is exactly the three branded ids; every target
        // exists; no non-cue axis carries the concept. (v20, #789, gives
        // the table, cloth and ballset axes the same field; the v20 twin
        // test pins those.)
        let superseded: Vec<_> = c
            .cues
            .iter()
            .filter(|e| e.superseded_by.is_some())
            .map(|e| e.id.as_str())
            .collect();
        assert_eq!(superseded, ["predator_z2", "predator_314", "meucci_reddot"]);
        for e in &c.cues {
            if let Some(target) = &e.superseded_by {
                let t = c.cue(target).unwrap_or_else(|| {
                    panic!("{}: superseded_by target {target} missing", e.id)
                });
                assert_eq!(t.superseded_by, None, "{target}: chains forbidden");
            }
        }
        // Brand-free picker claim: no NON-superseded cue display name
        // contains a registered mark ("314" is itself a mark — issue
        // #283 trade-dress findings; brand words live only in
        // provenance strings as factual citations).
        for e in c.cues.iter().filter(|e| e.superseded_by.is_none()) {
            for mark in ["Predator", "Meucci", "314", "Z-2", "Red Dot", "Revo"] {
                assert!(
                    !e.display_name.contains(mark),
                    "{}: picker-visible display name carries {mark:?}",
                    e.id
                );
            }
        }
        // serde: the metadata key round-trips, absent key = None (every
        // pre-v14 CueEntry JSON parses unchanged), None is skipped.
        let z2 = c.cue("predator_z2").unwrap();
        let json = serde_json::to_string(z2).unwrap();
        assert!(json.contains("\"superseded_by\":\"pro_ld_pivot_141\""), "{json}");
        assert!(json.contains("\"ui_hidden\":true"), "{json}");
        let back: CueEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(&back, z2);
        let twin_json = serde_json::to_string(c.cue("pro_ld_pivot_141").unwrap()).unwrap();
        assert!(!twin_json.contains("superseded_by"), "{twin_json}");
        assert!(!twin_json.contains("ui_hidden"), "{twin_json}");
        let legacy: CueEntry = serde_json::from_str(
            "{\"id\":\"x\",\"display_name\":\"y\",\"calibration\":{\"Estimated\":\
             {\"note\":\"z\"}},\"params\":{\"m\":0.567,\"tip_radius\":0.0106,\
             \"end_mass\":0.0056699}}",
        )
        .unwrap();
        assert_eq!(legacy.superseded_by, None);
        assert!(!legacy.ui_hidden);
    }

    /// Catalog v14 per-discipline default-cue DATA (issue #283 owner
    /// decision 1): pool keeps the kernel default, snooker/carom pair
    /// their dedicated archetypes; every mapped id exists, resolves, and
    /// is not superseded. `EquipmentSpec::{snooker,carom}_default()` keep
    /// the v6 pairing (data-only slice — the doc on
    /// DISCIPLINE_DEFAULT_CUE_IDS): no no-spec rack scenario moves.
    #[test]
    fn v14_discipline_default_cue_ids() {
        let c = EquipmentCatalog::get();
        assert_eq!(discipline_default_cue_id("pool"), Some(DEFAULT_CUE_ID));
        assert_eq!(discipline_default_cue_id("snooker"), Some("snooker_ash"));
        assert_eq!(discipline_default_cue_id("carom"), Some("carom_conical"));
        assert_eq!(discipline_default_cue_id("bocce"), None);
        for (family, id) in DISCIPLINE_DEFAULT_CUE_IDS {
            let e = c.cue(id).unwrap_or_else(|| panic!("{family}: {id} missing"));
            assert_eq!(e.superseded_by, None, "{family}: default must be picker-visible");
            c.resolve(&EquipmentSpec {
                cue_id: id.to_string(),
                ..EquipmentSpec::default()
            })
            .unwrap_or_else(|err| panic!("{family}: {id}: {err}"));
        }
        // The kernel discipline constructors stay on the v6 pairing in
        // this slice (byte-frozen no-spec scenarios).
        assert_eq!(EquipmentSpec::snooker_default().cue_id, DEFAULT_CUE_ID);
        assert_eq!(EquipmentSpec::carom_default().cue_id, DEFAULT_CUE_ID);
    }

    /// Catalog v15 (GH-490; GH-484 owner decision card 2026-08-09,
    /// decisions ⑨/⑩): the Chinese-eight class width repin 1270 → 1260 mm
    /// (KNOWING geometry change, v5-Diamond precedent) + the de-brand
    /// rename — NEW picker entry `chinese8_pro_9ft`, OLD `joy_q8_9ft` kept
    /// as a deprecated resolve-only alias (replays pin table ids; the
    /// wpa_generic_9ft legacy-resolution regime). Red-proofed before the
    /// implementation landed.
    #[test]
    fn v15_chinese8_debrand_and_width_repin_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        // v16 (calibration B1) repins only the chinese8 CORNER geometry,
        // v17 (calibration B2 CAL-1) only the predator SIDE mouth, and v18
        // (GH-621) APPENDS two Diamond size variants, and v21 (GH-1080)
        // repins only the chinese8 corner + middle geometry; every
        // id/display/params pin below is unchanged.
        assert_eq!(CATALOG_VERSION, 21);

        // The NEW de-branded picker entry.
        let cn8 = c.table("chinese8_pro_9ft").expect("chinese8_pro_9ft entry");
        assert_eq!(cn8.display_name, "Chinese 8-ball tournament 9-ft");
        assert!(!cn8.ui_hidden);
        assert!(matches!(cn8.calibration, Calibration::Estimated { .. }));
        assert_eq!(cn8.recommended_cushion_model_id, DEFAULT_CUSHION_MODEL_ID);
        assert_eq!(cn8.cushion_response, CushionResponse::default());

        // The OLD branded id: deprecated, picker-hidden, still resolving.
        let joy = c.table("joy_q8_9ft").expect("joy_q8_9ft alias entry");
        assert!(joy.ui_hidden, "alias must be picker-hidden");
        assert_eq!(joy.geometry, cn8.geometry, "alias shares the geometry");

        // Width repin: BOTH ids resolve to the 2540 × 1260 mm surface
        // (the manufacturer's own site + WPA Heyball rulebook agree at
        // 1260; the v7 note's dealer-sheet 1270 rationale is falsified).
        for id in ["chinese8_pro_9ft", "joy_q8_9ft"] {
            let r = c
                .resolve(&EquipmentSpec {
                    table_id: id.into(),
                    cloth_id: "snooker_napped".into(),
                    ..EquipmentSpec::default()
                })
                .unwrap_or_else(|e| panic!("{id}: {e}"));
            assert_eq!((r.table.length, r.table.width), (2.54, 1.26), "{id}");
            assert_eq!(r.table.pockets.len(), 6, "{id}");
        }
        // Alias and entry build BIT-identical tables at the pool radius.
        assert_eq!(
            joy.geometry.build(0.028575),
            cn8.geometry.build(0.028575),
            "alias must build the identical Table"
        );

        // Provenance needles (the v6-pin pattern): the rewritten dossier
        // records the falsified-1270 history, the 85-vs-105 measurement-
        // convention warning, the middle-estimate history (v21 records its
        // two corroborations as misattributed, GH-1080 D1), the
        // retailer-cited nose band, and the UNITY ball-set mandate note.
        let text = match &cn8.calibration {
            Calibration::Estimated { note } => note,
            other => panic!("chinese8 entry tier: {other:?}"),
        };
        for needle in [
            "2540x1260 mm +-9",
            "dealer",
            "85/84.15",
            "100/99.21",
            "105",
            "leather-ring",
            "corner+15",
            "36-38 mm",
            "UNITY",
            "joy_q8_9ft",
        ] {
            assert!(text.contains(needle), "chinese8 provenance missing {needle:?}");
        }
        let alias_note = match &joy.calibration {
            Calibration::Estimated { note } => note,
            other => panic!("joy alias tier: {other:?}"),
        };
        for needle in ["DEPRECATED", "chinese8_pro_9ft", "1260"] {
            assert!(alias_note.contains(needle), "alias note missing {needle:?}");
        }
    }

    /// Catalog v6 entry pins (feature 012, data-model.md §1): the three
    /// discipline tables + the carom cloth carry the frozen ids, geometry
    /// variants, tiers, pairings, and the research R1/R8 provenance
    /// language (uncited-clone rejection: the provenance-coverage test
    /// above already rejects thin notes; here the REQUIRED passages are
    /// pinned).
    #[test]
    fn v6_discipline_entries_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION); // v7: Amendment A1 re-derivation

        let sn = c.table("wpbsa_snooker_12ft").unwrap();
        assert_eq!(sn.geometry, TableGeometry::WpbsaSnooker12Ft);
        assert!(matches!(sn.calibration, Calibration::Calibrated { .. }));
        assert_eq!(sn.recommended_cushion_model_id, "mathavan_fitted");
        assert_eq!(sn.cushion_response, CushionResponse::default());
        assert!(!sn.ui_hidden);
        let text = match &sn.calibration {
            Calibration::Calibrated { source } => source,
            other => panic!("snooker entry tier: {other:?}"),
        };
        // R1 provenance language anchors (FR-010) + the v7 Amendment A1
        // passages: template-exact spanned jaws, clamps retired, the
        // label-rounding residuals recorded.
        for needle in [
            "secretly guarded",
            "CEBP",
            "2005/6",
            "Virgo",
            "no undercut of the cushion",
            "RETIRED",
            "spanned CircularCushionSegments",
            "84.15",
            "58.816",
        ] {
            assert!(text.contains(needle), "snooker provenance missing {needle:?}");
        }

        let ca = c.table("umb_carom_284").unwrap();
        assert_eq!(ca.geometry, TableGeometry::CaromUmb284);
        assert!(matches!(ca.calibration, Calibration::Literature { .. }));
        assert_eq!(ca.recommended_cushion_model_id, DEFAULT_CUSHION_MODEL_ID);
        let text = match &ca.calibration {
            Calibration::Literature { source } => source,
            other => panic!("carom entry tier: {other:?}"),
        };
        for needle in ["Art 11.4", "Art 11.3", "Art 11.9", "van Balen", "Kleber P37"] {
            assert!(text.contains(needle), "carom provenance missing {needle:?}");
        }

        // v15 (GH-490): the class's dossier moved to chinese8_pro_9ft
        // (v15 pin test); the v6 id remains a resolve-only alias whose
        // note must keep the deprecation + repin history on record.
        let joy = c.table("joy_q8_9ft").unwrap();
        assert_eq!(joy.geometry, TableGeometry::Chinese8Pro9Ft);
        assert!(matches!(joy.calibration, Calibration::Estimated { .. }));
        assert_eq!(joy.recommended_cushion_model_id, DEFAULT_CUSHION_MODEL_ID);
        let cn8 = c.table("chinese8_pro_9ft").unwrap();
        let text = match &cn8.calibration {
            Calibration::Estimated { note } => note,
            other => panic!("chinese8 entry tier: {other:?}"),
        };
        // R8: the (falsified, now-recorded) width history stays on the
        // entry + the v7 fall-opening scale-pinning rationale (middle;
        // v16 moved the CORNER to the R82 molded-mouth construction and
        // its note must say so).
        for needle in [
            "85mm",
            "2540x1260 mm +-9",
            "LiberWin",
            "85/84.15",
            "100/99.21",
            "PUBLISHED opening",
            "R82 molded-mouth",
            "O105 mouth circle",
        ] {
            assert!(text.contains(needle), "chinese8 provenance missing {needle:?}");
        }

        let cloth = c.cloth("carom_worsted_heated").unwrap();
        assert!(matches!(cloth.calibration, Calibration::Estimated { .. }));
        assert_eq!(cloth.params.u_s, 0.2);
        assert_eq!(cloth.params.u_r, 0.01);
        assert_eq!(cloth.params.u_sp_scale, 10.0 * 2.0 / 5.0 / 9.0);
        let text = match &cloth.calibration {
            Calibration::Estimated { note } => note,
            other => panic!("carom cloth tier: {other:?}"),
        };
        for needle in ["BILLIARD_GENERIC", "Art 11.9", "not well researched"] {
            assert!(text.contains(needle), "cloth provenance missing {needle:?}");
        }

        // Discipline pairings resolve end-to-end (FR-014: pre-existing
        // entries except the new tables/cloth).
        let sn_r = c.resolve(&EquipmentSpec::snooker_default()).unwrap();
        assert_eq!(sn_r.table.length, 3.569);
        assert_eq!(sn_r.table.pockets.len(), 6);
        assert_eq!(sn_r.ball_template.r, 0.02625);
        // mathavan_fitted pairing patches the table response (ee0 0.80).
        assert_eq!(
            sn_r.table.cushion_response.ee0,
            CushionResponse::EE0_HSV_FITTED
        );
        let ca_r = c.resolve(&EquipmentSpec::carom_default()).unwrap();
        assert_eq!(ca_r.table.length, 2.84);
        assert!(ca_r.table.pockets.is_empty());
        assert!(ca_r.table.circular.is_empty());
        assert_eq!(ca_r.table.linear.len(), 4);
        assert_eq!(ca_r.ball_template.r, 0.03075);
        // The v6 id keeps resolving (v15 alias regime) — on the repinned
        // 1260 mm surface (GH-490; width pins in the v15 test).
        let joy_r = c
            .resolve(&EquipmentSpec {
                table_id: "joy_q8_9ft".into(),
                cloth_id: "snooker_napped".into(),
                ..EquipmentSpec::default()
            })
            .unwrap();
        assert_eq!((joy_r.table.length, joy_r.table.width), (2.54, 1.26));
        assert_eq!(joy_r.table.pockets.len(), 6);
    }

    /// Feature 012 rack composition: the resolved snooker frame carries 22
    /// balls (cue 0, reds 1–15 frozen-topology, colours 16–21 exactly on
    /// their spots), the carom start exactly 3 (ids 0/1/2 on the Art 23
    /// spots), both tagged with their specs; seeded determinism holds.
    #[test]
    fn equipment_snooker_and_carom_racks_compose() {
        let c = EquipmentCatalog::get();
        let sn = c.resolve(&EquipmentSpec::snooker_default()).unwrap();
        let sys = sn.snooker_rack(7);
        assert_eq!(sys.balls.len(), 22);
        assert_eq!(sys.equipment, EquipmentSpec::snooker_default());
        assert_eq!(sys, crate::SystemState::snooker_rack(7));
        assert_ne!(
            crate::SystemState::snooker_rack(7).balls,
            crate::SystemState::snooker_rack(8).balls
        );
        let ca = c.resolve(&EquipmentSpec::carom_default()).unwrap();
        let sys = ca.carom_start(true);
        assert_eq!(sys.balls.len(), 3);
        assert_eq!(sys.equipment, EquipmentSpec::carom_default());
        assert_eq!(sys, crate::SystemState::carom_start(true));
        assert_ne!(
            crate::SystemState::carom_start(true).balls,
            crate::SystemState::carom_start(false).balls
        );
    }

    /// Catalog v8 entry pins (2026-07-11 owner Pro-Am calibration,
    /// docs/verification/pool-9ft-measured-calibration.md): the two
    /// Measured-tier entries carry the frozen ids, the session/date/doc
    /// provenance, per-parameter values WITH uncertainties, the reused
    /// diamond_proam_9ft geometry (bit-identical build), the KEPT kernel
    /// cushion response with the measured low-spin band recorded as a
    /// validation value (no invented e(v) curve), and the measured cloth
    /// numbers; the Measured serde shape is externally tagged and
    /// round-trips (uncited-clone rejection: the provenance-coverage test
    /// above already rejects thin notes; here the REQUIRED passages are
    /// pinned — the same pattern as v6_discipline_entries_pinned).
    #[test]
    fn v8_measured_owner_entries_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        // v12: dwell calibration moved to masse_trick_dwell, masse_trick
        // reverted to v10 bytes (issue #232). v13: schema-only structural
        // shaft fields, no entry moves (issue #277). v14: seven appended
        // cue entries + supersession metadata, no prior entry's
        // params/provenance moves (issue #283). v15: Chinese-eight width
        // repin + de-brand rename (GH-490), v16 the chinese8 corner
        // repin (calibration B1), v17 the predator side mouth
        // (calibration B2 CAL-1), v18 the appended Diamond 8/7 ft size
        // variants (GH-621), v21 the chinese8 corner + middle repin
        // (GH-1080) — the owner entries below are untouched.
        assert_eq!(CATALOG_VERSION, 21);

        const DOC: &str = "pool-9ft-measured-calibration.md (internal)";
        let measured = |cal: &Calibration| -> (String, String, Vec<MeasuredParam>, String) {
            match cal {
                Calibration::Measured {
                    session,
                    date,
                    values,
                    doc,
                } => (session.clone(), date.clone(), values.clone(), doc.clone()),
                other => panic!("expected Measured tier, got {other:?}"),
            }
        };
        let value = |values: &[MeasuredParam], param: &str| -> MeasuredParam {
            values
                .iter()
                .find(|v| v.param == param)
                .unwrap_or_else(|| panic!("measured param {param} missing"))
                .clone()
        };

        // Table entry: reused Diamond Pro-Am geometry, kernel response kept.
        let t = c.table("pool_pro_9ft_measured").unwrap();
        assert_eq!(t.display_name, "Pool tournament 9-ft (measured response)");
        assert_eq!(t.geometry, TableGeometry::PoolPro9Ft);
        assert_eq!(t.cushion_response, CushionResponse::default());
        assert_eq!(t.recommended_cushion_model_id, "stronge_realistic");
        assert!(!t.ui_hidden);
        let (session, date, values, doc) = measured(&t.calibration);
        assert_eq!(session, "pool-9ft-measured-s1");
        assert_eq!(date, "at adoption");
        assert_eq!(doc, DOC);
        // Geometry independently confirmed, NOT re-derived: bit-identical
        // build to the cited entry.
        let r = crate::params::BallParams::default().r;
        assert_eq!(t.geometry.build(r), TableGeometry::DiamondProAm9Ft.build(r));
        let g = value(&values, "validation:geometry.pool_pro_9ft");
        assert_eq!((g.value, g.sigma), (0.00035, 0.00003));
        assert!(g.note.contains("pool_pro_9ft"), "{}", g.note);
        // Cushion response VALIDATION (not a refit): low-spin band brackets
        // the kernel e0 = 0.85; pure-roll coupling recorded separately.
        let e = value(&values, "validation:cushion_response.e0");
        assert_eq!((e.value, e.sigma), (0.867, 0.058));
        for needle in ["0.84-0.94", "e0 = 0.85", "no e(v) refit"] {
            assert!(e.note.contains(needle), "e0 note missing {needle:?}");
        }
        let roll = value(&values, "validation:cushion.pure_roll_rebound");
        assert_eq!((roll.value, roll.sigma), (0.645, 0.032));
        assert!(roll.note.contains("TP B.6"), "{}", roll.note);

        // Cloth entry: measured trio on the params, uncertainties on the
        // tier, the representative-u_r justification pinned.
        let cl = c.cloth("pool_worsted_measured").unwrap();
        assert_eq!(cl.display_name, "Tournament cloth (measured friction)");
        assert_eq!(
            cl.params,
            ClothPreset {
                u_s: 0.247,
                u_r: 0.0103,
                u_sp_scale: 0.370,
                e_t: None,
            }
        );
        let (session, date, values, doc) = measured(&cl.calibration);
        assert_eq!(session, "pool-9ft-measured-s1");
        assert_eq!(date, "at adoption");
        assert_eq!(doc, DOC);
        let us = value(&values, "cloth.u_s");
        assert_eq!((us.value, us.sigma), (0.247, 0.0066));
        let ur = value(&values, "cloth.u_r");
        assert_eq!((ur.value, ur.sigma), (0.0103, 0.0017));
        for needle in ["REPRESENTATIVE", "0.0086", "0.01195", "arithmetic mid"] {
            assert!(ur.note.contains(needle), "u_r note missing {needle:?}");
        }
        let usp = value(&values, "cloth.u_sp_scale");
        assert_eq!((usp.value, usp.sigma), (0.370, 0.018));
        assert!(usp.note.contains("9.06"), "{}", usp.note);
        // Every measured cloth value lands on the entry's params (tier and
        // params can never drift apart).
        assert_eq!(us.value, cl.params.u_s);
        assert_eq!(ur.value, cl.params.u_r);
        assert_eq!(usp.value, cl.params.u_sp_scale);

        // Serde: externally tagged Measured shape, lossless round-trip,
        // sigma present on every value.
        let json = serde_json::to_string(&t.calibration).unwrap();
        assert!(json.starts_with("{\"Measured\":{"), "{json}");
        assert!(json.contains("\"session\":\"pool-9ft-measured-s1\""));
        assert!(json.contains("\"sigma\""));
        let back: Calibration = serde_json::from_str(&json).unwrap();
        assert_eq!(back, t.calibration);

        // The measured pairing resolves end-to-end: owner table + owner
        // cloth compose over the default ballset, cloth applied on resolve.
        // v20 (#789): the two ids below are the retired v8 Measured ids,
        // which have no catalog entry; resolve() reaches the measured twins
        // through the digest alias rows.
        let resolved = c
            .resolve(&EquipmentSpec {
                table_id: "owner_proam_9ft_2026_07".into(),
                cloth_id: "owner_proam_cloth_2026_07".into(),
                cushion_model_id: "stronge_realistic".into(),
                ..EquipmentSpec::default()
            })
            .unwrap();
        assert_eq!(resolved.ball_params().u_s, 0.247);
        assert_eq!(resolved.ball_params().u_r, 0.0103);
        assert_eq!(
            resolved.ball_params().u_sp,
            0.370 * resolved.ball_template.r
        );
        assert_eq!(
            resolved.table,
            c.resolve(&EquipmentSpec {
                table_id: "diamond_proam_9ft".into(),
                cloth_id: "owner_proam_cloth_2026_07".into(),
                cushion_model_id: "stronge_realistic".into(),
                ..EquipmentSpec::default()
            })
            .unwrap()
            .table,
            "the measured table must build the diamond_proam_9ft geometry bit-exactly"
        );
    }

    /// EquipmentSpec serde: default omitted via is_default, missing/partial
    /// fields fill with the default ids, non-default round-trips.
    #[test]
    fn spec_serde_defaults_and_round_trip() {
        let d: EquipmentSpec = serde_json::from_str("{}").expect("empty spec parses");
        assert_eq!(d, EquipmentSpec::default());
        assert!(d.is_default());
        let partial: EquipmentSpec =
            serde_json::from_str(r#"{"cloth_id":"snooker_napped"}"#).expect("partial parses");
        assert_eq!(partial.cloth_id, "snooker_napped");
        assert_eq!(partial.table_id, DEFAULT_TABLE_ID);
        assert!(!partial.is_default());
        let json = serde_json::to_string(&partial).unwrap();
        let back: EquipmentSpec = serde_json::from_str(&json).unwrap();
        assert_eq!(back, partial);
    }

    /// v18 (Rasson tables lane, Table 2 wave OX-A1): the appended
    /// `rasson_ox_9ft` entry — official OX datum + MODEL facings, jaw
    /// radii and side shelf, DERIVED corner shelf and throats (LAW-
    /// PURCHASED-BASELINE, r6; CP-05/C6, C12/C16), bit-pinned; every
    /// prior entry untouched (the v5 dump
    /// pin + the id-list pin above cover that); the geometry is a REAL
    /// sibling (builds differ from every other US-pool entry).
    #[test]
    fn v18_rasson_ox_pinned() {
        let c = EquipmentCatalog::get();
        assert_eq!(c.version, CATALOG_VERSION);
        assert_eq!(CATALOG_VERSION, 21);
        let t = c.table("rasson_ox_9ft").unwrap();
        assert_eq!(t.display_name, "Pool tournament 9-ft, K55 cushion (4.5 in pockets) (legacy alias)");
        assert_eq!(t.geometry, TableGeometry::RassonOx9Ft);
        assert_eq!(t.cushion_response, CushionResponse::default());
        assert_eq!(t.recommended_cushion_model_id, DEFAULT_CUSHION_MODEL_ID);
        // v20 (#789): a hidden rename alias of its picker-visible twin
        assert!(t.ui_hidden);
        assert_eq!(t.superseded_by.as_deref(), Some("pool_pro_9ft_k55"));
        assert!(!c.table("pool_pro_9ft_k55").unwrap().ui_hidden);
        assert!(matches!(t.calibration, Calibration::Estimated { .. }));
        let note = match &t.calibration {
            Calibration::Estimated { note } => note.clone(),
            other => panic!("expected Estimated, got {other:?}"),
        };
        for needle in ["OB-ROX-GEO-001", "2540x1270", "4.5\"/5.0\" retail cut", "141.25/99.98", "8.645/2.962", "8.695", "Klematch P59"] {
            assert!(note.contains(needle), "rasson_ox_9ft note missing {needle:?}");
        }
        let p = TableGeometry::RassonOx9Ft.pocket_spec().unwrap();
        assert_eq!(p.length.to_bits(), 2.54f64.to_bits());
        assert_eq!(p.width.to_bits(), 1.27f64.to_bits());
        assert_eq!(p.nose_height_frac.to_bits(), 0.635f64.to_bits());
        // r5 (provenance law): MODEL raw reads / DERIVED formulas, tags in the constructor
        assert_eq!(p.cushion_width.to_bits(), 0.048072f64.to_bits()); // MODEL CU-04m
        assert_eq!(p.corner_mouth.to_bits(), 0.11430f64.to_bits()); // MFR 114 mm retail cut
        assert_eq!(p.side_mouth.to_bits(), 0.12700f64.to_bits()); // MFR 127 mm
        assert_eq!(p.corner_facing_deviation_deg.to_bits(), 6.2509f64.to_bits()); // MODEL 141.2509 deg
        assert_eq!(p.side_facing_deviation_deg.to_bits(), 9.978f64.to_bits()); // MODEL 99.978 deg
        assert_eq!(p.corner_jaw_radius.to_bits(), 0.008645f64.to_bits()); // MODEL nose-tip round, r6 strict window
        assert_eq!(p.side_jaw_radius.to_bits(), 0.002962f64.to_bits()); // MODEL, r6
        assert_eq!(p.corner_pocket_radius.to_bits(), (0.098103 / 2.0f64).to_bits()); // DERIVED throat
        assert_eq!(p.side_pocket_radius.to_bits(), (0.110954 / 2.0f64).to_bits()); // DERIVED throat
        assert!((p.corner_shelf() - 0.045429).abs() < 1e-15); // DERIVED (R2)
        assert!((p.side_shelf() - 0.008695).abs() < 1e-15); // MODEL SP-05, C16 fillet tangent (r6)
        assert!(p.exact_side_facing);
        let r = crate::params::BallParams::default().r;
        let built = TableGeometry::RassonOx9Ft.build(r);
        for other in [
            TableGeometry::Wpa9Ft,
            TableGeometry::WpaSpec9Ft,
            TableGeometry::DiamondProAm9Ft,
            TableGeometry::DiamondRedLabel9Ft,
            TableGeometry::PredatorApex9Ft,
        ] {
            assert_ne!(built, other.build(r), "rasson_ox_9ft must be a real sibling, not {other:?}");
        }
    }
    /// Catalog v20 (#789) de-branding twins: for each (old, twin) pair whose
    /// old entry stays, the twin IS the old entry under the twin-text rule.
    /// The old entry's JSON, minus `id`, `display_name` and the two
    /// metadata keys, with every string mapped through
    /// `catalog_twin_norm::twin_text` and its geometry mapped to the twin
    /// variant, equals the twin's JSON minus `id` and `display_name` byte
    /// for byte (so the twin carries neither metadata key). Params bytes and
    /// the resolved options bytes are equal, and for the tables the
    /// resolved `Table` is equal too: each twin geometry variant selects the
    /// same constructor as the variant it twins. The old entry is a hidden
    /// rename alias of its picker-visible twin, and its display name is the
    /// twin's plus " (legacy alias)".
    #[test]
    fn v20_debranding_twins_byte_identical() {
        use super::catalog_twin_norm::{twin_geometry, twin_text, TWIN_RENAMES, TWIN_GEOMETRY};

        fn map_strings(v: &mut serde_json::Value) {
            match v {
                serde_json::Value::String(s) => *s = twin_text(s),
                serde_json::Value::Array(a) => a.iter_mut().for_each(map_strings),
                serde_json::Value::Object(o) => o.values_mut().for_each(map_strings),
                _ => {}
            }
        }
        /// The comparable body of an entry: its JSON without the keys that
        /// differ by design.
        fn body(e: &impl Serialize, drop: &[&str]) -> serde_json::Value {
            let mut v = serde_json::to_value(e).unwrap();
            let map = v.as_object_mut().unwrap();
            for k in drop {
                map.remove(*k);
            }
            v
        }
        fn old_body(e: &impl Serialize) -> serde_json::Value {
            let mut v = body(e, &["id", "display_name", "ui_hidden", "superseded_by"]);
            map_strings(&mut v);
            if let Some(g) = v.get_mut("geometry") {
                let old = g.as_str().unwrap().to_string();
                let new = twin_geometry(&old).unwrap_or_else(|| panic!("{old}: no twin variant"));
                *g = serde_json::Value::String(new.to_string());
            }
            v
        }
        fn twin_body(e: &impl Serialize) -> serde_json::Value {
            body(e, &["id", "display_name"])
        }

        let c = EquipmentCatalog::get();
        let en = [
            ("pool_pro_9ft", "Pool tournament 9-ft (4.5 in pockets)"),
            ("pool_pro_8ft", "Pool tournament 8-ft (4.5 in pockets)"),
            ("pool_pro_7ft", "Pool tournament 7-ft, bar box (4.5 in pockets)"),
            ("pool_pro_9ft_metal_rim", "Pool tournament 9-ft, metal-rim (4.25 in pockets)"),
            ("pool_pro_9ft_k55", "Pool tournament 9-ft, K55 cushion (4.5 in pockets)"),
            ("pool_pro_9ft_older_gen", "Pool tournament 9-ft, older gen (4.56 in pockets)"),
            ("pool_worsted_new", "Worsted tournament cloth (new)"),
            ("pool_worsted_fast", "Worsted tournament cloth (fast)"),
            ("pool_standard", "Pool (57.15 mm)"),
            ("pool_used", "Pool, worn/used (57.15 mm)"),
            ("pool_black_cap", "Black-cap tournament"),
            ("pool_ivory_gunsight", "Ivory gunsight"),
        ];
        let en_name = |twin: &str| en.iter().find(|(id, _)| *id == twin).map(|(_, n)| *n).unwrap();
        let resolve = |spec: EquipmentSpec| c.resolve(&spec).unwrap();
        let (mut tables, mut cloths, mut ballsets) = (0, 0, 0);
        for (old_id, twin_id) in TWIN_RENAMES {
            let axis_spec = |id: &str| -> EquipmentSpec {
                let base = EquipmentSpec::default();
                if c.table(id).is_some() {
                    EquipmentSpec { table_id: id.to_string(), ..base }
                } else if c.cloth(id).is_some() {
                    EquipmentSpec { cloth_id: id.to_string(), ..base }
                } else {
                    EquipmentSpec { ballset_id: id.to_string(), ..base }
                }
            };
            let (old_b, twin_b, old_name, twin_name, old_meta, twin_meta) =
                if let (Some(o), Some(t)) = (c.table(old_id), c.table(twin_id)) {
                    tables += 1;
                    assert_eq!(o.cushion_response, t.cushion_response, "{old_id}");
                    assert_eq!(
                        twin_geometry(&format!("{:?}", o.geometry)),
                        Some(format!("{:?}", t.geometry).as_str()),
                        "{old_id}: twin geometry variant"
                    );
                    // The resolved Table: the twin variant builds the same
                    // geometry as the variant it twins.
                    assert_eq!(
                        resolve(axis_spec(old_id)).table,
                        resolve(axis_spec(twin_id)).table,
                        "{old_id} vs {twin_id}: resolved table"
                    );
                    (
                        old_body(o),
                        twin_body(t),
                        o.display_name.clone(),
                        t.display_name.clone(),
                        (o.ui_hidden, o.superseded_by.clone()),
                        (t.ui_hidden, t.superseded_by.clone()),
                    )
                } else if let (Some(o), Some(t)) = (c.cloth(old_id), c.cloth(twin_id)) {
                    cloths += 1;
                    assert_eq!(o.params, t.params, "{old_id}");
                    assert_eq!(
                        serde_json::to_string(&o.params).unwrap(),
                        serde_json::to_string(&t.params).unwrap(),
                        "{old_id} vs {twin_id}: params bytes"
                    );
                    (
                        old_body(o),
                        twin_body(t),
                        o.display_name.clone(),
                        t.display_name.clone(),
                        (o.ui_hidden, o.superseded_by.clone()),
                        (t.ui_hidden, t.superseded_by.clone()),
                    )
                } else {
                    let o = c.ballset(old_id).unwrap_or_else(|| panic!("{old_id} missing"));
                    let t = c.ballset(twin_id).unwrap_or_else(|| panic!("{twin_id} missing"));
                    ballsets += 1;
                    assert_eq!(o.params, t.params, "{old_id}");
                    assert_eq!(o.bb_friction, t.bb_friction, "{old_id}");
                    assert_eq!(
                        serde_json::to_string(&o.params).unwrap(),
                        serde_json::to_string(&t.params).unwrap(),
                        "{old_id} vs {twin_id}: params bytes"
                    );
                    (
                        old_body(o),
                        twin_body(t),
                        o.display_name.clone(),
                        t.display_name.clone(),
                        (o.ui_hidden, o.superseded_by.clone()),
                        (t.ui_hidden, t.superseded_by.clone()),
                    )
                };
            // Entry bytes under the twin-text rule.
            assert_eq!(
                serde_json::to_string(&old_b).unwrap(),
                serde_json::to_string(&twin_b).unwrap(),
                "{old_id} vs {twin_id}: entry bytes under the twin-text rule"
            );
            // The resolved options on the pair's axis.
            assert_eq!(
                serde_json::to_string(&resolve(axis_spec(old_id)).options).unwrap(),
                serde_json::to_string(&resolve(axis_spec(twin_id)).options).unwrap(),
                "{old_id} vs {twin_id}: resolved options bytes"
            );
            // Metadata: a hidden rename alias and a visible twin.
            assert_eq!(old_meta, (true, Some(twin_id.to_string())), "{old_id}");
            assert_eq!(twin_meta, (false, None), "{twin_id}");
            // Display names: the approved en literal on the twin, plus the
            // legacy suffix on the old entry.
            assert_eq!(twin_name, en_name(twin_id), "{twin_id}");
            assert_eq!(old_name, format!("{twin_name} (legacy alias)"), "{old_id}");
        }
        assert_eq!((tables, cloths, ballsets), (6, 2, 4));
        assert_eq!(TWIN_GEOMETRY.len(), tables);

        // The twin-text rule itself: whole-word tokens only, and the two
        // exemptions keep the old token verbatim.
        assert_eq!(twin_text("size variant of diamond_proam_9ft:"), "size variant of pool_pro_9ft:");
        assert_eq!(twin_text("diamond_proam_9ft_x rasson_ox_9ft-gully"), "diamond_proam_9ft_x pool_pro_9ft_k55-gully");
        assert_eq!(twin_text("the aramith_pool class"), "the pool_standard class");
        assert_eq!(twin_text("aramith_pool_worn"), "pool_used");
        assert_eq!(
            twin_text("tiers on PocketTableSpec::diamond_proam_9ft"),
            "tiers on PocketTableSpec::diamond_proam_9ft"
        );
        assert_eq!(twin_text("ClothPreset::simonis_760_fast()"), "ClothPreset::simonis_760_fast()");
        assert_eq!(twin_text("preset \"simonis_860_tournament\""), "preset \"simonis_860_tournament\"");
        assert_eq!(twin_text("\"aramith_pool\""), "\"pool_standard\"");

        // The two retired v8 Measured entries leave the pair list; their
        // content is kept by hash. The fixture records sha256(N(entry)) of
        // each, taken at its source commit with N from
        // `catalog_twin_norm::twin_content_sha256`, one row per axis and no
        // id text. The recorded N sha is checked against the file N is
        // compiled from here before any row is compared.
        use super::catalog_twin_norm::{sha256_hex, twin_content_sha256};
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            "sha256 test vector"
        );
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../tests/fixtures/catalog_v20_retired_content.json"
        ))
        .expect("committed retired-content fixture parses");
        assert_eq!(
            fixture["normalizer"]["path"],
            "crates/pool-core/tests/support/catalog_twin_norm.rs"
        );
        assert_eq!(
            sha256_hex(include_str!("../tests/support/catalog_twin_norm.rs").as_bytes()),
            fixture["normalizer"]["sha256"].as_str().expect("normalizer sha256"),
            "normalizer sha: N's source file is not the one the rows were recorded with"
        );
        let rows = fixture["rows"].as_array().expect("fixture rows");
        assert_eq!(rows.len(), 2, "exactly two fixture rows");
        for axis in ["table", "cloth"] {
            assert_eq!(
                rows.iter().filter(|r| r["axis"] == axis).count(),
                1,
                "one fixture row on the {axis} axis"
            );
        }
        for row in rows {
            let axis = row["axis"].as_str().expect("row axis");
            let neutral = CATALOG_ALIAS_DIGESTS
                .iter()
                .find(|a| a.axis == axis)
                .unwrap_or_else(|| panic!("{axis}: no digest alias row"))
                .neutral_id;
            let got = match axis {
                "table" => twin_content_sha256(c.table(neutral).expect("measured table twin")),
                "cloth" => twin_content_sha256(c.cloth(neutral).expect("measured cloth twin")),
                other => panic!("{other}: not a fixture axis"),
            };
            assert_eq!(
                got,
                row["sha256"].as_str().expect("row sha256"),
                "{axis} row: content-hash compare of the twin {neutral} against the recorded sha256"
            );
        }
    }

    /// Catalog v20 (#789) digest alias rows: FNV-1a 64 meets its published
    /// vectors; the private table holds exactly the two rows, as digests
    /// (a digest is not a plaintext id); the digests differ; each neutral
    /// id is an entry on its axis; and no current catalog id on any axis
    /// hashes to either digest, so only a retired id reaches a row.
    #[test]
    fn v20_catalog_alias_digests_pinned() {
        assert_eq!(fnv1a_64(b""), 0xcbf29ce484222325);
        assert_eq!(fnv1a_64(b"a"), 0xaf63dc4c8601ec8c);
        assert_eq!(fnv1a_64(b"foobar"), 0x85944171f73967e8);

        let rows: Vec<(&str, &str, &str)> = CATALOG_ALIAS_DIGESTS
            .iter()
            .map(|r| (r.axis, r.digest, r.neutral_id))
            .collect();
        assert_eq!(
            rows,
            [
                ("table", "8223852648be1aa5", "pool_pro_9ft_measured"),
                ("cloth", "906c9b774047f8a4", "pool_worsted_measured"),
            ]
        );
        assert_ne!(rows[0].1, rows[1].1);

        let c = EquipmentCatalog::get();
        assert!(c.table(rows[0].2).is_some(), "{}", rows[0].2);
        assert!(c.cloth(rows[1].2).is_some(), "{}", rows[1].2);
        let ids = c
            .tables
            .iter()
            .map(|e| &e.id)
            .chain(c.cloths.iter().map(|e| &e.id))
            .chain(c.ballsets.iter().map(|e| &e.id))
            .chain(c.cues.iter().map(|e| &e.id))
            .chain(c.cushion_models.iter().map(|e| &e.id));
        let mut n = 0;
        for id in ids {
            let digest = format!("{:016x}", fnv1a_64(id.as_bytes()));
            for (axis, row_digest, _) in &rows {
                assert_ne!(&digest, row_digest, "{id} hashes to the {axis} alias digest");
            }
            n += 1;
        }
        assert!(n > 0);
    }

    /// #958: the hand-built `catalog_alias_digests_json` is byte-equal to
    /// serde's serialization of the rows, and every field stays inside the
    /// alphabet that needs no JSON escaping (lowercase ASCII, digits, `_`),
    /// so adding a row with a quote or backslash fails here, not in a
    /// consumer.
    #[test]
    fn alias_digests_json_matches_serde() {
        let serde = serde_json::to_string(&CATALOG_ALIAS_DIGESTS).unwrap();
        assert_eq!(catalog_alias_digests_json(), serde);
        for row in &CATALOG_ALIAS_DIGESTS {
            for field in [row.axis, row.digest, row.neutral_id] {
                assert!(
                    !field.is_empty()
                        && field
                            .bytes()
                            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'),
                    "{field:?} leaves the no-escape alphabet"
                );
            }
        }
    }

    /// Catalog v20 (#789): the digest-aware accessors reach the twin from a
    /// retired v8 Measured id while the plain accessors stay exact, and a
    /// current id or an unknown id gets the same answer from both.
    #[test]
    fn v20_by_any_id_accessors_reach_the_twins() {
        let c = EquipmentCatalog::get();
        let twin = c.table("pool_pro_9ft_measured").expect("table twin");
        assert!(c.table("owner_proam_9ft_2026_07").is_none());
        assert!(std::ptr::eq(
            c.table_by_any_id("owner_proam_9ft_2026_07").expect("retired table id"),
            twin
        ));
        let cloth_twin = c.cloth("pool_worsted_measured").expect("cloth twin");
        assert!(c.cloth("owner_proam_cloth_2026_07").is_none());
        assert!(std::ptr::eq(
            c.cloth_by_any_id("owner_proam_cloth_2026_07").expect("retired cloth id"),
            cloth_twin
        ));
        // Each row answers on its own axis only.
        assert!(c.table_by_any_id("owner_proam_cloth_2026_07").is_none());
        assert!(c.cloth_by_any_id("owner_proam_9ft_2026_07").is_none());
        for e in &c.tables {
            assert!(std::ptr::eq(c.table_by_any_id(&e.id).unwrap(), e), "{}", e.id);
        }
        for e in &c.cloths {
            assert!(std::ptr::eq(c.cloth_by_any_id(&e.id).unwrap(), e), "{}", e.id);
        }
        assert!(c.table_by_any_id("unlisted_table_8ft").is_none());
        assert!(c.cloth_by_any_id("unlisted_cloth").is_none());
    }
}
