// Copyright (c) Meta Platforms, Inc. and affiliates.

// catalog.ts — typed mirror of the kernel equipment catalog
// (crates/pool-core/src/catalog.rs, GitHub issue #15): the versioned,
// immutable-once-shipped registry of brand/environment parameter sets. Every
// entry carries id + display_name + a Calibration provenance pointer.
//
// The DATA below is a hand-mirrored copy of the kernel registry, pinned
// against `catalog_json()` (the canonical wasm's own serialization) by the
// drift test in test/catalog.test.ts — the mirror exists so pickers and the
// share codec can validate ids without an instantiated engine. When the
// kernel catalog gains entries, this file gains the same entries (never
// changed values: new measurements get NEW ids, see catalog.rs).

import type {
  BallBallFriction, BallParams, CushionFriction, CushionResponse,
  EquipmentIds,
} from './types.js';
import type {
  ClothPreset, CueParams, CushionModel, MiscueGeometry,
} from './shot.js';

export type { EquipmentIds } from './types.js';

/** Kernel `CATALOG_VERSION` (bumped only when entries are added).
 * v2: `aramith_pool_worn` ballset condition variant (fitted worn μ_bb).
 * v3: measured-geometry table entries `diamond_proam_9ft` +
 * `predator_apex_9ft` and the Platinum/pivot cue entries (feature 009).
 * v4: referenced-only table policy (catalog-policy.md ruling): tables gain
 * `ui_hidden` (the legacy pooltool-spec default leaves the user-facing
 * pickers — its frozen id keeps resolving), NEW `wpa_spec_9ft` builds the
 * WPA Equipment Specifications nominal values, and `diamond_redlabel_9ft`
 * is re-derived from the AZB 48606 community measurements.
 * v5: KNOWING geometry change to the two Diamond entries (referenced-only
 * ruling, 2026-07-08 pocket-angle audit — same precedent as the v4
 * redlabel re-derivation; replays pinning these ids re-simulate on the new
 * geometry): facings repinned from the WPA 142°/104° nominals to RKC's
 * published Diamond FACTORY cuts 141°/102° (AZB threads 184759/445936);
 * `wpa_spec_9ft` keeps the spec as written.
 * v6 (feature 012, contracts/equipment-additions.md): ADDITIVE ONLY —
 * three discipline tables `wpbsa_snooker_12ft` (curved-jaw snooker,
 * community-measured CEBP template numbers, full-circle model-limit jaw
 * clamps documented), `umb_carom_284` (the first POCKETLESS geometry) and
 * `joy_q8_9ft` (Chinese eight-ball, manufacturer/Estimated), plus the
 * `carom_worsted_heated` cloth; NO new ballsets or cushion models; every
 * v5 entry byte-identical (kernel drift gate against the committed v5
 * dump).
 * v7 (post-012 defect fix, equipment-additions.md Amendment A1 /
 * kernel-api.md Amendment 016): KNOWING geometry change to the two
 * just-shipped curved-jaw entries `wpbsa_snooker_12ft` + `joy_q8_9ft`
 * (v5-Diamond-repin precedent) — the kernel gained jaw-arc angular spans,
 * so both entries now build the CEBP template's TRUE tangent two-arc jaws
 * (the v6 full-circle radius clamps were a model-expressiveness artifact)
 * with the template fall circles as capture discs; pool entries
 * byte-identical (Gate G-KERNEL).
 * v8 (the first measured calibration session): ADDITIVE ONLY — the
 * `Measured` provenance tier (first-hand measurement: session id + date +
 * per-parameter values WITH uncertainties + the verification-doc
 * reference, docs/verification/pool-9ft-measured-calibration.md) and
 * the first two Measured entries, served since v20 as their twins
 * `pool_pro_9ft_measured` (reused diamond_proam_9ft geometry; kernel
 * cushion response kept, the measured low-spin band 0.84-0.94 recorded as
 * a validation value) + `pool_worsted_measured` (measured u_s/u_r/u_sp_scale).
 * v9 (issue #91): ADDITIVE ONLY — two visual-variant pool ballsets
 * `aramith_black` (Aramith Tournament Black, Duramith) + `arcos_reserve`
 * (Predator Arcos II Reserve, Super Aramith Pro formula); params
 * byte-copy the `aramith_pool` class (no published set-specific
 * friction/COR — no invented numbers), no `bb_friction` override; the ids
 * exist so per-set visuals key off the kernel-truth equipment tag.
 * v10 (issue #168, kernel-api.md Amendment 021): ADDITIVE ONLY — the
 * `masse_trick` cue, first carrier of the per-cue miscue contact cap
 * (`miscue_contact_cap_r` 0.58 R vs the serde-skipped 0.5 default; Venom
 * W2 measured 0.567–0.579 R on hard pressed-leather massé tips; mass
 * 0.62 kg = the W3 shot-2 fit's declared bracket top); every pre-v10
 * entry keeps byte-identical serialization (the new CueParams field
 * skips at its default).
 * v11 (issue #212, kernel-api.md Amendment 024): ADDITIVE FIELDS on the
 * v10 `masse_trick` entry — the only carrier of the four Amendment-024
 * finite-dwell CueParams fields (pinch_dwell_gain 0.54, pinch_jam 1.0,
 * pinch_end_mass 0.0209 kg, pinch_press_scale 0.1725: the masse-shot-1
 * refit, verdict GAP → REPRODUCED at cb_path_rms 6.08σ → 1.58σ). Every
 * v10 value of the entry is untouched and every other entry stays
 * byte-identical (all four fields serde-skip at their defaults).
 * v12 (issue #232, post-merge ultra audit of PR #222): the v11 in-place
 * dwell addition violated immutable-once-shipped (persisted selections
 * and share payloads pinning `masse_trick` silently resolved to
 * different elevated-strike physics). v12 REVERTS `masse_trick` to its
 * exact v10 bytes and moves the dwell calibration to the NEW
 * `masse_trick_dwell` entry — the only pinch_* carrier, paired with the
 * masse-shot-1 fitted cue mass 0.737611 kg (the mass the Amendment-024
 * acceptance actually ran; v11 had paired the quartet with the 0.62 kg
 * W3 shot-2 mass, a combination no acceptance run exercised).
 * v13 (issue #277, kernel-api.md Amendment 025): SCHEMA-ONLY — kernel
 * `CueParams` gains the two render-side structural shaft fields
 * `shaft_first_mode_hz` (default 27.0) / `shaft_damping_ratio` (default
 * 0.08 since the Amendment-025 revision note 2026-07-31 — HSV A.25
 * footage tracking, docs/research/whip-calibration-277.md; originally a
 * tuned-by-eye 0.02), serde-skipped at their defaults and NEVER read by
 * the strike
 * solve (design 277 slice 1). No entry is added, removed, or changed:
 * every shipped cue keeps byte-identical serialization and picks up the
 * defaults implicitly.
 * v14 (issue #283, owner decisions 2026-08-01): ADDITIVE — four new cue
 * archetypes `carbon_ld` / `jump_phenolic` / `snooker_ash` /
 * `carom_conical` (per-value Measured/Literature/Estimated provenance in
 * each note; the first entries carrying non-default
 * `shaft_first_mode_hz`), three fully generic-id de-branding twins
 * `pro_ld_pivot_141` / `pro_ld_pivot_118` / `pro_ld_pivot_101` with
 * params BYTE-IDENTICAL to the three branded v3 entries, and the
 * `CueEntry.superseded_by` metadata field marking those branded ids
 * picker-hidden (owner decision 2: internal ids de-branded too; the
 * branded ids keep resolving forever — #232 — with untouched params;
 * pickers filter on the field app-side, the `ui_hidden` precedent).
 * Brand names survive only inside provenance strings as factual
 * data-source citations. Plus the per-discipline default-cue DATA
 * `DISCIPLINE_DEFAULT_CUE_IDS` (pool→standard, snooker→snooker_ash,
 * carom→carom_conical) for the feature-012 app defaults — data only,
 * the kernel discipline constructors keep the v6 pairing.
 * v15 (GH-490; GH-484 owner decision card 2026-08-09): KNOWING geometry
 * change + de-brand rename for the Chinese-eight class (v5-Diamond-repin
 * precedent — replays pinning either id re-simulate on the new
 * geometry): width repin 2.54 × 1.27 → 2.54 × 1.26 m (the manufacturer's
 * own site + the WPA Heyball rulebook agree at 1260; the v6/v7
 * dealer-sheet 1270 rationale is falsified and recorded), the NEW
 * picker entry `chinese8_pro_9ft` ('Chinese 8-ball tournament 9-ft',
 * geometry variant renamed `Chinese8Pro9Ft`), and `joy_q8_9ft` kept
 * FOREVER as a deprecated resolve-only alias (`ui_hidden`, the
 * wpa_generic_9ft legacy-resolution regime — replays/persisted
 * selections pin table ids). NO KERNEL_COMPAT_LINEAGE pair for this
 * repin: a real geometry change cannot prove byte identity for
 * chinese8-table records (flip-cascade.md §5) — cross-version opens
 * warn + view-anyway.
 * v16 (calibration wave B1, the #484-registered chinese8 jaw/fall
 * divergence): KNOWING corner-geometry repin for `chinese8_pro_9ft` (and
 * the `joy_q8_9ft` alias) — the kernel corners adopt the GH-490 R82
 * molded-mouth drawing construction (R45 nose rolls running onto the
 * capture disc = the Ø105 mouth circle about the drawing O_f, 3.5 mm
 * beyond both nose lines; mouth 85 mm between the rolls);
 * the scaled-CEBP corner (fall disc Ø179.6) is retired as a
 * snooker-template artifact. Same v15 lineage law: NO
 * KERNEL_COMPAT_LINEAGE pair (real geometry change — cross-version
 * opens warn + view-anyway). Middle pockets and every other entry are
 * byte-identical.
 * v17 (calibration wave B2 item CAL-1, GH-484; owner-approved ruling
 * d601pred, PR #601): KNOWING side-mouth repin for `predator_apex_9ft` —
 * the official Apex spec's 4.92 in / 124.968 mm supersedes the
 * dealer-relayed 5.0 in / 127 mm. Same lineage law: NO
 * KERNEL_COMPAT_LINEAGE pair (real geometry change — replays pinning the
 * id re-simulate; cross-version opens warn + view-anyway). Pocket
 * radius/depth stay throat-based; every other entry byte-identical.
 * v18 (GH-621, Diamond size variants; declared kernel branch
 * diamond-variants-2026-09): APPENDS `diamond_proam_8ft` and
 * `diamond_proam_7ft` — the Pro-Am pocket furniture on the official
 * 90x45 in and 80x40 in beds (Diamond factory dimension drawings). In the
 * kernel both specs are the diamond_proam_9ft spec by struct update (only
 * length/width differ). Additive only, order frozen; no lineage pair is
 * added here — the Gate G-KERNEL proof on the rebaked canonical wasm
 * belongs to the landing ceremony.
 * v18 (Rasson lane OX-A1, GH-641 / PR #642): `rasson_ox_9ft` APPENDED — the
 * Rasson OX gen-1 American-pool table on the manufacturer's 2540x1270 mm
 * playing surface with the factory-published 114 / 127 mm retail pocket
 * cut (canonical definition docs/geometry/rasson-ox-9ft-table-definition.json,
 * OB-ROX-GEO-001). Additive only; every pre-existing entry byte-identical;
 * cushion response = the kernel default (a Klematch P59 / K55 prior is
 * registered, never dialled). NOTE (ceremony-cascade-rox patch series):
 * this mirror is written against the OX branch's kernel at 18; the ONE
 * landing merges D621 too and re-bumps to 19 with `diamond_proam_8ft`,
 * `diamond_proam_7ft` ordered BEFORE `rasson_ox_9ft` (CEREMONY-PREP §3) —
 * the drift test below then deep-equals the REBAKED wasm's catalog_json().
 * v20 (#789, internal catalog id de-branding): APPENDS 14 de-branded twins
 * after the v19 entries (7 tables, 3 cloths, 4 ballsets), each carrying its
 * old entry's params byte-identically, and the six neutral geometry
 * variants `PoolPro9Ft`, `PoolPro8Ft`, `PoolPro7Ft`, `PoolPro9FtMetalRim`,
 * `PoolPro9FtK55` and `PoolPro9FtOlderGen`. Each kept old entry is a
 * `ui_hidden` rename alias whose `superseded_by` names its twin (tables,
 * cloths, ballsets), with params unchanged; the three branded cues gain
 * `ui_hidden` beside their `superseded_by`. The branded display names
 * become neutral in place: an old entry reads as its twin's name plus
 * " (legacy alias)". The two v8 Measured entries leave the served catalog;
 * their twins `pool_pro_9ft_measured` and `pool_worsted_measured` carry the
 * same params, and a private digest alias resolves records that pinned the
 * old ids to the twins (the kernel's `catalog_alias_digests_json()`,
 * mirrored by `CATALOG_ALIAS_DIGESTS` below, which `validateEquipmentIds`
 * consults only for an id the mirror does not carry). The v8
 * measured-response calibration dossier moves to
 * docs/verification/pool-9ft-measured-calibration.md (session
 * `pool-9ft-measured-s1`).
 * v21 (GH-1080, Chinese-8 pocket mouths; card 41 corner F2 + middle M-c):
 * KNOWING corner AND middle geometry repin for `chinese8_pro_9ft` (and the
 * `joy_q8_9ft` alias) — the corner keeps the v16 molded-mouth construction
 * with a photo-fit nose fillet (R72.199 mm from a 90.151 mm rail departure,
 * was R45 from 78.744 mm) onto the same Ø105 capture disc, and the middle
 * moves to `Cn8Arc1` (arc 1 of the CEBP template swept on to the template
 * capture circle; chinese8 circular segments 16 → 12). Every other entry is
 * byte-identical (spec-dump-proven). LINEAGE — a HYBRID posture that departs
 * from the v15–v17 "no pair" rule on purpose: KERNEL_COMPAT_LINEAGE gains
 * the pairs into the v21 stamp that the Gate G-KERNEL pair legs proved
 * byte-identical (pool corpus; snooker/carom by the spec dump), and
 * `kernelGate` refuses `chinese8_pro_9ft` / `joy_q8_9ft` shares minted on a
 * pre-v21 stamp (`CHINESE8_POCKETS_PRE_V21_STAMPS`, share.ts) with the
 * existing cross-version warning + view-anyway, so their outcome change is
 * surfaced instead of replayed silently. */
export const CATALOG_VERSION = 21;

/** One measured parameter of a `Measured`-tier entry (catalog v8,
 * catalog.rs `MeasuredParam`): the kernel parameter path (or a
 * `validation:`-prefixed path for measurements that VALIDATE a kept kernel
 * value), the central value, its 1-sigma uncertainty, and the
 * method/caveat note (serde-skipped when empty). */
export interface MeasuredParam {
  param: string;
  value: number;
  sigma: number;
  note?: string;
}

/** Calibration status + provenance (catalog.rs `Calibration`, externally
 * tagged serde enum; `Measured` added in catalog v8). */
export type Calibration =
  | { Calibrated: { source: string } }
  | { Literature: { source: string } }
  | { Estimated: { note: string } }
  | { Measured: {
      session: string; date: string; values: MeasuredParam[]; doc: string;
    } };

/** Lower-case calibration kind (badge rendering: 标定/文献/估计/实测). */
export type CalibrationKind =
  'calibrated' | 'literature' | 'estimated' | 'measured';

export function calibrationKind(c: Calibration): CalibrationKind {
  if ('Calibrated' in c) return 'calibrated';
  if ('Literature' in c) return 'literature';
  if ('Measured' in c) return 'measured';
  return 'estimated';
}

/** Default equipment ids — the composition of the kernel-default pipeline
 * (catalog.rs DEFAULT_*_ID constants). */
export const DEFAULT_EQUIPMENT: Readonly<EquipmentIds> = Object.freeze({
  table_id: 'wpa_generic_9ft',
  cloth_id: 'simonis_860_tournament',
  ballset_id: 'aramith_pool',
  cue_id: 'standard',
  cushion_model_id: 'han2005_default',
});

/** True iff `ids` equals the kernel-default composition (the serde skip
 * predicate: default equipment is OMITTED from serialized scenarios). */
export function isDefaultEquipment(ids: EquipmentIds): boolean {
  return (Object.keys(DEFAULT_EQUIPMENT) as (keyof EquipmentIds)[])
    .every((k) => ids[k] === DEFAULT_EQUIPMENT[k]);
}

/** Per-discipline DEFAULT cue ids (catalog v14, issue #283 owner decision
 * 1; kernel mirror: catalog.rs `DISCIPLINE_DEFAULT_CUE_IDS`), keyed by
 * the game catalog's `discipline_family`. Consumed by the app's
 * per-discipline equipment defaults (feature 012 `defaultEquipmentFor` /
 * `equipmentByGame`) in the follow-up UI slice — unknown families fall
 * back to the caller's own default (the per-axis-validation law). */
export const DISCIPLINE_DEFAULT_CUE_IDS: Readonly<Record<string, string>> =
  Object.freeze({
    pool: 'standard',
    snooker: 'snooker_ash',
    carom: 'carom_conical',
  });

export interface TableEntry {
  id: string;
  display_name: string;
  calibration: Calibration;
  /** Geometry family selector (unit serde variant; the concrete table is
   * built at resolve time from the ballset radius at the entry's own nose
   * fraction — feature 009 per-entry pocket geometry). */
  geometry: 'Wpa9Ft' | 'DiamondProAm9Ft' | 'PredatorApex9Ft'
    | 'WpaSpec9Ft' | 'DiamondRedLabel9Ft'
    // catalog v6 (feature 012): snooker / pocketless carom / Chinese 8-ball
    // (v15/GH-490 de-brand: the v6 'JoyQ8Chinese8Ball' variant is renamed)
    | 'WpbsaSnooker12Ft' | 'CaromUmb284' | 'Chinese8Pro9Ft'
    // catalog v18 (GH-621): the Diamond Pro-Am 8-ft / 7-ft size variants
    // (the 9-ft PocketTableSpec by struct update, length/width only)
    | 'DiamondProAm8Ft' | 'DiamondProAm7Ft' | 'RassonOx9Ft'
    // catalog v20 (#789): the neutral twin variants, each sharing the
    // pocket geometry of the variant it twins (the old members above stay
    // for the kept old entries)
    | 'PoolPro9Ft' | 'PoolPro8Ft' | 'PoolPro7Ft' | 'PoolPro9FtMetalRim'
    | 'PoolPro9FtK55' | 'PoolPro9FtOlderGen';
  cushion_response: CushionResponse;
  /** Recommendation surfaced to pickers, NOT applied by resolve. */
  recommended_cushion_model_id: string;
  /** Catalog v4: internal compatibility entry — user-facing pickers filter
   * it out of their lists, but the id keeps resolving (legacy share links/
   * records pin it). serde-skipped when false (absent = false). */
  ui_hidden?: boolean;
  /** Catalog v20 (#789 de-branding): the neutral-id entry that supersedes
   * this one in user-facing pickers. Present = a kept old entry that
   * resolves forever (records/share payloads pin the id; the named twin
   * carries byte-identical params). The kernel resolve never reads it.
   * Absent = current entry. */
  superseded_by?: string;
}

export interface ClothEntry {
  id: string;
  display_name: string;
  calibration: Calibration;
  params: ClothPreset;
  /** Catalog v20 (#789): picker-hidden compatibility entry; the id keeps
   * resolving. serde-skipped when false (absent = false). */
  ui_hidden?: boolean;
  /** Catalog v20 (#789): the neutral-id twin that supersedes this entry
   * (byte-identical params). Absent = current entry. */
  superseded_by?: string;
}

export interface BallSetEntry {
  id: string;
  display_name: string;
  calibration: Calibration;
  params: BallParams;
  /** Catalog v20 (#789): picker-hidden compatibility entry; the id keeps
   * resolving. serde-skipped when false (absent = false). */
  ui_hidden?: boolean;
  /** Catalog v20 (#789): the neutral-id twin that supersedes this entry
   * (byte-identical params). Absent = current entry. */
  superseded_by?: string;
  /** Ball–ball friction curve override (ballset-CONDITION axis, catalog
   * v2): present = this ballset was fitted with its own μ_bb(v), routed
   * into `SimOptions.bb_friction` by the kernel's resolve. Absent = the
   * default literature curve. */
  bb_friction?: BallBallFriction;
}

export interface CueEntry {
  id: string;
  display_name: string;
  calibration: Calibration;
  params: CueParams;
  /** Catalog v14 (issue #283 de-branding): the generic-id entry that
   * supersedes this one in user-facing pickers. Present = deprecated-
   * but-resolving-forever (records/share payloads pin the id; the named
   * twin carries byte-identical params). Pickers filter on it app-side;
   * the kernel resolve never reads it. Absent = current entry. */
  superseded_by?: string;
  /** Catalog v20 (#789): the three superseded cues are also picker-hidden;
   * the ids keep resolving. serde-skipped when false (absent = false). */
  ui_hidden?: boolean;
}

export interface CushionModelEntry {
  id: string;
  display_name: string;
  calibration: Calibration;
  cushion_model: CushionModel;
  cushion_friction: CushionFriction;
  /** Fitted table-response pairing, applied over the table entry's base
   * response by the kernel's resolve. Absent = keep the table's own. */
  response_override?: CushionResponse;
  bb_hop_min_height: number;
  bt_min_bounce_height: number;
}

export interface EquipmentCatalog {
  version: number;
  tables: TableEntry[];
  cloths: ClothEntry[];
  ballsets: BallSetEntry[];
  cues: CueEntry[];
  cushion_models: CushionModelEntry[];
}

/** The shipped registry, mirrored verbatim from the kernel
 * (`catalog_json()`); pinned by the drift test in test/catalog.test.ts. */
export const CATALOG: EquipmentCatalog = {
  "version": 21,
  "tables": [
    {
      "id": "wpa_generic_9ft",
      "display_name": "Legacy 9-ft (pooltool-derived)",
      "calibration": {
        "Estimated": {
          "note": "legacy compatibility geometry, NOT a WPA reference despite the frozen id: pooltool layout.py/specs.py PocketTableSpecs (measured from a 7-ft Showood HOME table) on the WPA 9-ft 100\"x50\" surface with the WPA 63.5% nose; effective mouths 5.07\"/5.94\" and facings 140.3/97.1 deg violate the WPA S9 bands (honesty baseline, table-dimension-audit.md (internal)); response docs/research/gap-k66-cushion-params.md"
        }
      },
      "geometry": "Wpa9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default",
      "ui_hidden": true
    },
    {
      "id": "wpa_spec_9ft",
      "display_name": "WPA spec 9-ft (nominal)",
      "calibration": {
        "Literature": {
          "source": "WPA Recommended Equipment Specifications (Nov 2001 ed., wpapool.com), nominal band values: 100\"x50\" surface (S5), nose 63.5% of ball diameter (S7 nominal), TRUE mouths 4.5625\"/5.0625\" (S9 band centers of 4.5-4.625 / 5-5.125), facings 142/104 deg (S9), shelves 1.625\"/3/16\" (S9 band centers); disc radii ~ throat/2 (BU TDF convention) — per-value notes on PocketTableSpec::wpa_spec_9ft; the stronge_realistic pairing is the diamond_proam_9ft precedent, not a WPA-specific fit"
        }
      },
      "geometry": "WpaSpec9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic"
    },
    {
      "id": "diamond_redlabel_9ft",
      "display_name": "Pool tournament 9-ft, older gen (4.56 in pockets) (legacy alias)",
      "calibration": {
        "Calibrated": {
          "source": "geometry: AZB thread 48606 community measurement — 4 9/16\" corner mouth with single 1/8\" facings, the older-Diamond Red Label profile; side mouth 5 1/16\" DERIVED via Diamond's factory +1/2\" corner->side pairing (TrxR AZB 540288); nose 1 7/16\" + corner shelf 1 3/4\" inferred from the shared Pro-Am hardware dossier (table-dimension-audit.md (internal) D2/D7; RKC's AZB 465370 names the red-label subrail); facings 141/102 deg (catalog v5) are RKC's published Diamond FACTORY cuts (AZB 2010 thread 184759 post #4 + 2017 thread 445936, mechanic testimony covering the Red Label era — a brand-level assumption upgraded from the pre-v5 WPA 142/104 assumption; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as written); side shelf 3/16\" stays a WPA assumption (D8). Bank pairing CALIBRATED by this project: stronge_realistic matches the TP B.28 9' Red Label ladder 5/6 (banking-report.md (internal))"
        }
      },
      "geometry": "DiamondRedLabel9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic",
      "ui_hidden": true,
      "superseded_by": "pool_pro_9ft_older_gen"
    },
    {
      "id": "diamond_proam_9ft",
      "display_name": "Pool tournament 9-ft (4.5 in pockets) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "table-dimension-audit.md (internal) (feature 009 dossier D1-D13 + catalog-v5 facing repin): mouths 4.5\"/5.0\" (West State dealer sheet; TrxR/rexus31 AZB threads), nose 1 7/16\" (RKC factory target, AZB 465370), corner shelf 1 3/4\" (jay helfert measurements); facings 141/102 deg are RKC's published Diamond FACTORY cuts (AZB 2010 'diamond pockets' thread 184759 post #4; 2017 'Pocket angles' thread 445936; JoeyInCali angle-finder spread ~+-1 deg) — mechanic testimony, not an official sheet; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band (wpa_spec_9ft keeps the spec as written); side shelf 3/16\" stays a WPA assumption — per-value tiers on PocketTableSpec::diamond_proam_9ft"
        }
      },
      "geometry": "DiamondProAm9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic",
      "ui_hidden": true,
      "superseded_by": "pool_pro_9ft"
    },
    {
      "id": "predator_apex_9ft",
      "display_name": "Pool tournament 9-ft, metal-rim (4.25 in pockets) (legacy alias)",
      "calibration": {
        "Estimated": {
          "note": "mixed-tier record (table-dimension-audit.md (internal) P1-P10): OFFICIAL dealer numbers are the 100\"x50\" surface and the 4.25\"/108 mm corner Pro Cut mouth (Knightshot/Beckmann spec tables + Predator email via AZB TrxR); the side mouth is 4.92\"/124.97 mm from the official Predator Apex product-page spec (CAL-1, GH-484 dossier + P-A1 PR #590), superseding the dealer-relayed 5.0\"/127 mm; facings 142/104 deg, nose 63.5 %, shelves 1.5\"/3/16\" are WPA assumptions (nothing published); no Apex bank data exists, so the recommended cushion model is the kernel default (estimate)"
        }
      },
      "geometry": "PredatorApex9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default",
      "ui_hidden": true,
      "superseded_by": "pool_pro_9ft_metal_rim"
    },
    {
      "id": "wpbsa_snooker_12ft",
      "display_name": "WPBSA 12-ft snooker",
      "calibration": {
        "Calibrated": {
          "source": "playing area 3.569x1.778 m and all spot/baulk/D markings are official-spec (WPBSA Official Rules Rev. Sep 2024 Sec1 R1); pocket geometry is community-measured: the WPBSA 2024-25 edition names pocket LOCATIONS only, the historical 'templates authorised by the WPBSA' clause is gone and the official World Snooker templates are deliberately unpublished (4 physical templates, 'very secretly guarded' - Betway Insider, Jason Ferguson/Barry Hearn), so the best public numbers are the CEBP 'rationalised layout that closely matched the current TV templates as applied 2005/6' drawings (Dec 2007/Apr 2009, rulesofsnooker.ca via Wayback), independently corroborated by John Virgo via Northern Snooker & Pool Services (corner 3 5/16 in at the fall = the drawing's 3.313 in; ~3.5 in corner / 4 in middle at cushion top). 'There is no undercut of the cushion' (CEBP drawing note) - the builder produces none. CATALOG v7 (Amendment A1): the entry builds the CEBP template construction EXACTLY - label-exact tangent two-arc jaws (corner 3/4.5 in radii, junction 118.61 deg from the drawing's construction offsets; middle 3.125/2.094 in radii, drawn 54 deg junction) as spanned CircularCushionSegments, rails ending at the jaw tangency points, NO straight facings, and the template fall circles (corner R 3.5 in on the slate-edge intersection, middle R 2.094 in on the centre line) as the point-of-no-return discs. The v6 full-circle jaw-radius clamps (documented FR-005 approximation) are RETIRED - they were a model-expressiveness artifact, not a dimension finding. Documented drawing-label residuals: the drawn arcs close the corner fall at 81.3 mm vs the label's 3.313 in = 84.15 mm and the middle at 98.2 vs 99.21 mm (label rounding; the optional 58.816 deg middle-junction exactness knob is documented, not taken). Named residuals: directional nap effects (no citable quantitative model), rounded slate-fall roll-in behind the fall lip, pocket-template exactness. Nose 7R/5 (Mathavan 2010, Literature - the snooker-only convention). Bank pairing CALIBRATED: mathavan_fitted reproduces the Mathavan 2010 Figs 7-10 snooker-cushion anchors (research R1/R2/R8)"
        }
      },
      "geometry": "WpbsaSnooker12Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "mathavan_fitted"
    },
    {
      "id": "umb_carom_284",
      "display_name": "UMB carom 2.84 m (pocketless)",
      "calibration": {
        "Literature": {
          "source": "UMB World Rules of Carom Billiard (1 Jan 1989): playing surface 2.84x1.42 m +-5 mm (Art 11.4), cushion nose 37 mm +-1 (Art 11.3 - the only discipline whose governing body publishes an actual nose height, official-spec), mandatory slate heating (Art 11.9 - named as an UNQUANTIFIED residual on the carom_worsted_heated cloth entry; Shamos: ~5 degC above ambient for 'best possible rolling'). Corner junctions: two segments meeting at 90 deg, collision-complete via the inclusive span check; the ~mm mitred-rubber fillet of a real corner is a documented unmodeled residual (research R3). Official World Cup hardware for context (UMB World Cup rules 15.12.2025 p9): VECTOR cushions 'same profile and same dimensions as the Kleber P37 type', Simonis cloth, Aramith balls. Cushion pairing: constant-COR baseline han2005_default - van Balen showed constant COR beats Han's e(v) on carom equipment (docs/research/gap-k66-cushion-params.md); Han-2005 tangential parameters non-public beyond the abstract"
        }
      },
      "geometry": "CaromUmb284",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default"
    },
    {
      "id": "joy_q8_9ft",
      "display_name": "Chinese 8-ball tournament 9-ft (legacy alias)",
      "calibration": {
        "Estimated": {
          "note": "DEPRECATED de-brand alias (GH-490, catalog v15): superseded by chinese8_pro_9ft - this id stays resolve-only because replays and persisted selections pin table ids (the wpa_generic_9ft legacy-resolution regime; picker-hidden via ui_hidden). Resolves to the SAME repinned geometry as chinese8_pro_9ft: 2540x1260 mm - the v6/v7 width 1270 followed a dealer spec sheet, but the manufacturer's own official site and the WPA Rules of Heyball agree on 1260, so the old note's 'manufacturer 1270 mm width wins' rationale was falsified; approved repin (GH-484 decision card 2026-08-09, v5-Diamond precedent - replays pinning this id re-simulate on the new geometry). Full provenance dossier: the chinese8_pro_9ft entry"
        }
      },
      "geometry": "Chinese8Pro9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default",
      "ui_hidden": true
    },
    {
      "id": "chinese8_pro_9ft",
      "display_name": "Chinese 8-ball tournament 9-ft",
      "calibration": {
        "Estimated": {
          "note": "De-branded Chinese-eight tournament class (GH-490; the v6/v7 joy_q8_9ft entry is its deprecated resolve-only alias - replays pin table ids). Playing surface 2540x1260 mm: the manufacturer's own official site AND the WPA Rules of Heyball (eff. 2025) 2540x1260 mm +-9 AGREE at 1260; the v6/v7 width 1270 followed a dealer spec sheet + the CBSA Chinese-rules text - REPINNED under the v5-Diamond precedent (decision card 2026-08-09; replays pinning either id re-simulate on this geometry). Corner mouth 85 mm ('Curved Pockets ... 3.84 inch (85mm) wide open' - the inch figure is an internal conversion typo, 85 mm = 3.35 in) is the FALL opening measured at the cushion noses; the CBSA-circulating 105+-1 mm figure (traced to a nine-ball equipment paragraph, GH-1080 D1) is measured at the leather-ring inner edge - a DIFFERENT measurement datum, not a conflict (recorded so future audits never 'fix' 85 to 105). CORNER pockets (catalog v21, GH-1080 F2 - a photo-fit repin of the v16 GH-490 R82 molded-mouth construction for the kernel collision surfaces): each rail nose departs at Y_N 90.151 mm into a nose fillet R72.199 mm (PHOTO-FIT nominal: the clamp-free pooled fit over four calibrated broadcast frames, zero edge offset; the fit met its fixed 85 mm constraint at a deep R12.6 wall-to-ring blend, so the nose was effectively free; the later sharp R0 junction ruling removed that blend) and runs onto the capture disc = the O105 mouth circle about the drawing O_f, 3.5 mm beyond both nose lines (the 105 datum; = the visible bed hole and the cammatch mouth-gate datum - ADR-0015 single-source convergence; the collision fillet ends at the drawing's X_N station, where the two jaws stand 87.10 mm apart). The rest of the fillet (with the narrowest nose gap, 85.200 mm), the throat wall beyond it (opening 3.411 deg per side) and its sharp junction with the leather ring (on the disc rim) lie within the disc, collision-unreachable. F2 supersedes the v16 R45 nose rolls from Y_N 78.744 mm as the selected nominal; the four frames alone do not exclude R45 (a 1 px common edge offset reorders R45, F2 and the wider F1, GH-1080 D2a). The v7-v15 scaled-CEBP corner (two-arc horns r 76.97/115.45, fall disc O179.6) stays retired: the GH-490 photo measurement chain read horn-end gap 111-120 mm / fall-rim ~105 mm against that template, and the two-layer ruling had shipped the real construction render-side with the kernel registered as the outlier. MIDDLE pockets (catalog v21, GH-1080 M-c): arc 1 of the CEBP snooker template under the UNIFORM scale pinned to the fall opening - middle 100/99.21 = 1.0079 - swept from its rail tangency on to the template capture circle, one arc per jaw (the template's second arc leaves the collision surfaces). The rendered 90 deg end face at a nose width of 87 mm (GB/T 22751 middle 86+-1 read at nose height plus the photo deck-slot reading; flush-face assumption) lies inside the capture disc. The ~100 mm scale basis keeps its v7 role but not its v7 corroboration: the comparable Xingjue 89/101 mm corner/middle pairing is a snooker specification and the CBSA corner+15 mm text is a nine-ball convention (GH-1080 D1), while the four-frame broadcast photo check (GH-1080 D2a) finds the template arc fits the visible middle jaw points as well as a free photo arc. The middle scale deliberately pins against the PUBLISHED opening, never the drawn-arc closure value (drawing-label rounding). Cushion width 47.625 mm x the corner scale 85/84.15 = 1.0101 (template-family assumption, research R8; the corner scale no longer drives the jaw/fall construction). Nose height 0.635 = 36.29 mm on the 57.15 mm ball (Estimated, retailer-cited: steel-cushion fitting guides quote 36-38 mm ~ 63-64% of the ball, bracketing the WPA S7 window default we keep; the manufacturer publishes none). Cushion construction: patented inverted-L steel frame - NO published rebound data, so the recommended cushion model stays the pool default (estimate pending the dedicated broadcast calibration wave). Cloth pairing: snooker_napped as the nearest CITED napped-wool set (the manufacturer-confirmed official cloth is LiberWin 8848 napped wool ~730 g/m^2 - no published friction data; documented approximation). Balls: aramith_pool 57.15 mm (WPA Heyball band 156-170 g; NOTE: the WPA mandates the UNITY ball set from 2025-08-25 - an equipment-styling note, the 57.15 mm pairing stays physically compliant per the decision record)"
        }
      },
      "geometry": "Chinese8Pro9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default"
    },
    {
      "id": "diamond_proam_8ft",
      "display_name": "Pool tournament 8-ft (4.5 in pockets) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "GH-621 size variant of diamond_proam_9ft: bed 90\"x45\" (official Diamond 8 ft Pro-Am dimension drawing, dossier 01-official/official-specsheet-8ft-proam.png — overall 104\"x59\", legs 89.75\"x44.75\", rail-top height 32\", clearance 15\"); pocket furniture BYTE-IDENTICAL to the 9-ft entry by struct update (mouths 4.5\"/5.0\", facings 141/102 deg = RKC's published Diamond FACTORY cuts, AZB 184759 post #4 / 445936, nose 1 7/16\", shelves 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as written); the invariance is corroborated by size-agnostic manufacturer statements (factory pro-cut 4 1/2\" 'DID YOU KNOW' block; ONE OEM pocket SKU for Pro-Am and Smart tables; the identical 7.0\" rail band on all three official drawings) — the drawings carry NO pocket dimension; rubber: Black Diamond K55 on 7'/8' (Artemis IC66 K55 on 9'/10'), same profile, no published rebound, response unchanged; bank pairing stronge_realistic = the diamond_proam_9ft brand precedent (TP B.28 has no 8-ft row)"
        }
      },
      "geometry": "DiamondProAm8Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic",
      "ui_hidden": true,
      "superseded_by": "pool_pro_8ft"
    },
    {
      "id": "diamond_proam_7ft",
      "display_name": "Pool tournament 7-ft, bar box (4.5 in pockets) (legacy alias)",
      "calibration": {
        "Calibrated": {
          "source": "geometry: GH-621 size variant of diamond_proam_9ft — bed 80\"x40\" (official Diamond 7 ft Pro-Am dimension drawing, dossier 01-official/official-specsheet-7ft-proam.png — overall 94\"x54\", legs 79.75\"x39.75\", rail-top height 32\", clearance 15\"); pocket furniture BYTE-IDENTICAL to the 9-ft entry by struct update (mouths 4.5\"/5.0\", facings 141/102 deg = RKC's published Diamond FACTORY cuts, AZB 184759 post #4 / 445936, nose 1 7/16\", shelves 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as written), invariance corroborated by size-agnostic manufacturer statements (see the 8-ft entry) — the drawings carry NO pocket dimension; rubber: Black Diamond K55 on 7'/8', same profile as the 9-ft Artemis, no published rebound, response unchanged. Bank pairing CALIBRATED by this project: stronge_realistic matches the TP B.28 7' Diamond bar-box ladder 6/6 at mean dev 0.03 diamond (banking-report.md (internal)) — brand+size class evidence, TP B.28 does not name the bar box's model generation"
        }
      },
      "geometry": "DiamondProAm7Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic",
      "ui_hidden": true,
      "superseded_by": "pool_pro_7ft"
    },
    {
      "id": "rasson_ox_9ft",
      "display_name": "Pool tournament 9-ft, K55 cushion (4.5 in pockets) (legacy alias)",
      "calibration": {
        "Estimated": {
          "note": "Rasson OX (gen-1) American-pool table, canonical definition docs/geometry/rasson-ox-9ft-table-definition.json (OB-ROX-GEO-001, the only canonical source; the Drive dossier it cites, openbilliards/dossier-rasson-9ft/, is a read-back-verified working set on the Drive desktop mount - 1772 files, verified at adoption - not a second canonical source). OFFICIAL (rasson.cn design sheet + 配置单): playing surface 2540x1270 mm = 100\"x50\", pocket openings 'WPA 标准 中袋 127 mm, 角袋 114 mm' = the 4.5\"/5.0\" retail cut (this entry); the Matchroom 4\"/4.5\" event cut, the EPBF 110/125 cut and the post-Apr-2022 factory default 4\"/5\" are documented VARIANTS, not this entry (conflict C4). PROVENANCE LAW (lane ruling, r6): purchased model = baseline, Rasson/WPA data corrects, nothing authored; every number is tagged. MODEL (raw mm reads; the A1 ball-scale k is rejected): cushion width 48.072, facings 141.25/99.98 deg (planar cheek fits; the side lies outside WPA 104+-1 - ruling O3 = A for the model), jaw radii 8.645/2.962 mm (nose-tip round at the ball equator, bed+28.575, strict tangent window, 8 tips / 4 ends), side shelf 8.695 (C16 fillet tangent of the slate top round, the corner's lip definition). DERIVED: throats 98.10/110.95 = MFR mouth - MODEL cheek setback; corner shelf 45.43 = MODEL slate lip on the diagonal + MFR mouth/2. MFR(WPA): nose 63.5 % - the model's 0.615 is outside the 63.5+-1 % band (C3). Reference model = 3dsky 'rasson_9ft' (an 8-ft-pro-size OX cut at the Matchroom 4\" mouth): numbers only, no asset bytes. Cushion Klematch P59 (K55): Shore A 43+-3, DIN 53512 rebound 75+-5 % registered as a calibration prior (never dialled); no OX bank data exists, so the recommended cushion model is the kernel default (estimate)"
        }
      },
      "geometry": "RassonOx9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default",
      "ui_hidden": true,
      "superseded_by": "pool_pro_9ft_k55"
    },
    {
      "id": "pool_pro_9ft_older_gen",
      "display_name": "Pool tournament 9-ft, older gen (4.56 in pockets)",
      "calibration": {
        "Calibrated": {
          "source": "geometry: AZB thread 48606 community measurement — 4 9/16\" corner mouth with single 1/8\" facings, the older-Diamond Red Label profile; side mouth 5 1/16\" DERIVED via Diamond's factory +1/2\" corner->side pairing (TrxR AZB 540288); nose 1 7/16\" + corner shelf 1 3/4\" inferred from the shared Pro-Am hardware dossier (table-dimension-audit.md (internal) D2/D7; RKC's AZB 465370 names the red-label subrail); facings 141/102 deg (catalog v5) are RKC's published Diamond FACTORY cuts (AZB 2010 thread 184759 post #4 + 2017 thread 445936, mechanic testimony covering the Red Label era — a brand-level assumption upgraded from the pre-v5 WPA 142/104 assumption; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as written); side shelf 3/16\" stays a WPA assumption (D8). Bank pairing CALIBRATED by this project: stronge_realistic matches the TP B.28 9' Red Label ladder 5/6 (banking-report.md (internal))"
        }
      },
      "geometry": "PoolPro9FtOlderGen",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic"
    },
    {
      "id": "pool_pro_9ft",
      "display_name": "Pool tournament 9-ft (4.5 in pockets)",
      "calibration": {
        "Literature": {
          "source": "table-dimension-audit.md (internal) (feature 009 dossier D1-D13 + catalog-v5 facing repin): mouths 4.5\"/5.0\" (West State dealer sheet; TrxR/rexus31 AZB threads), nose 1 7/16\" (RKC factory target, AZB 465370), corner shelf 1 3/4\" (jay helfert measurements); facings 141/102 deg are RKC's published Diamond FACTORY cuts (AZB 2010 'diamond pockets' thread 184759 post #4; 2017 'Pocket angles' thread 445936; JoeyInCali angle-finder spread ~+-1 deg) — mechanic testimony, not an official sheet; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band (wpa_spec_9ft keeps the spec as written); side shelf 3/16\" stays a WPA assumption — per-value tiers on PocketTableSpec::diamond_proam_9ft"
        }
      },
      "geometry": "PoolPro9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic"
    },
    {
      "id": "pool_pro_9ft_metal_rim",
      "display_name": "Pool tournament 9-ft, metal-rim (4.25 in pockets)",
      "calibration": {
        "Estimated": {
          "note": "mixed-tier record (table-dimension-audit.md (internal) P1-P10): OFFICIAL dealer numbers are the 100\"x50\" surface and the 4.25\"/108 mm corner Pro Cut mouth (Knightshot/Beckmann spec tables + Predator email via AZB TrxR); the side mouth is 4.92\"/124.97 mm from the official Predator Apex product-page spec (CAL-1, GH-484 dossier + P-A1 PR #590), superseding the dealer-relayed 5.0\"/127 mm; facings 142/104 deg, nose 63.5 %, shelves 1.5\"/3/16\" are WPA assumptions (nothing published); no Apex bank data exists, so the recommended cushion model is the kernel default (estimate)"
        }
      },
      "geometry": "PoolPro9FtMetalRim",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default"
    },
    {
      "id": "pool_pro_9ft_measured",
      "display_name": "Pool tournament 9-ft (measured response)",
      "calibration": {
        "Measured": {
          "session": "pool-9ft-measured-s1",
          "date": "at adoption",
          "values": [
            {
              "param": "validation:geometry.pool_pro_9ft",
              "value": 0.00035,
              "sigma": 0.00003,
              "note": "diamond-sight homography fit RMS [m] across the four overhead clips (0.33-0.38 mm) on the 2540x1270 mm L/8 = 317.5 mm sight grid - independently confirms the reused pool_pro_9ft playing-field geometry"
            },
            {
              "param": "validation:cushion_response.e0",
              "value": 0.867,
              "sigma": 0.058,
              "note": "B-set tier2 low-spin (still-sliding) arrivals 1.42-1.69 m/s, n=5; full low-spin band 0.84-0.94 over 1.4-2.9 m/s BRACKETS the kernel constant e0 = 0.85 - response KEPT at the kernel model, no e(v) refit from two spin-confounded tiers (fixture gaps)"
            },
            {
              "param": "validation:cushion.pure_roll_rebound",
              "value": 0.645,
              "sigma": 0.032,
              "note": "pure-roll arrivals 0.48-0.85 m/s (n=5, roll ratio 1.02-1.03; independent c0-slide pipeline 0.670+-0.018 agrees): spin-cushion coupling consistent with the TP B.6 rolling-arrival anchor ~0.7, a cushion-MODEL observable, not a restitution deficit"
            }
          ],
          "doc": "pool-9ft-measured-calibration.md (internal)"
        }
      },
      "geometry": "PoolPro9Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic"
    },
    {
      "id": "pool_pro_8ft",
      "display_name": "Pool tournament 8-ft (4.5 in pockets)",
      "calibration": {
        "Literature": {
          "source": "GH-621 size variant of pool_pro_9ft: bed 90\"x45\" (official Diamond 8 ft Pro-Am dimension drawing, dossier 01-official/official-specsheet-8ft-proam.png — overall 104\"x59\", legs 89.75\"x44.75\", rail-top height 32\", clearance 15\"); pocket furniture BYTE-IDENTICAL to the 9-ft entry by struct update (mouths 4.5\"/5.0\", facings 141/102 deg = RKC's published Diamond FACTORY cuts, AZB 184759 post #4 / 445936, nose 1 7/16\", shelves 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as written); the invariance is corroborated by size-agnostic manufacturer statements (factory pro-cut 4 1/2\" 'DID YOU KNOW' block; ONE OEM pocket SKU for Pro-Am and Smart tables; the identical 7.0\" rail band on all three official drawings) — the drawings carry NO pocket dimension; rubber: Black Diamond K55 on 7'/8' (Artemis IC66 K55 on 9'/10'), same profile, no published rebound, response unchanged; bank pairing stronge_realistic = the pool_pro_9ft brand precedent (TP B.28 has no 8-ft row)"
        }
      },
      "geometry": "PoolPro8Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic"
    },
    {
      "id": "pool_pro_7ft",
      "display_name": "Pool tournament 7-ft, bar box (4.5 in pockets)",
      "calibration": {
        "Calibrated": {
          "source": "geometry: GH-621 size variant of pool_pro_9ft — bed 80\"x40\" (official Diamond 7 ft Pro-Am dimension drawing, dossier 01-official/official-specsheet-7ft-proam.png — overall 94\"x54\", legs 79.75\"x39.75\", rail-top height 32\", clearance 15\"); pocket furniture BYTE-IDENTICAL to the 9-ft entry by struct update (mouths 4.5\"/5.0\", facings 141/102 deg = RKC's published Diamond FACTORY cuts, AZB 184759 post #4 / 445936, nose 1 7/16\", shelves 1 3/4\"/3/16\"; Diamond-authentic 102 sits OUTSIDE the WPA S9 104-105 band, wpa_spec_9ft keeps the spec as written), invariance corroborated by size-agnostic manufacturer statements (see the 8-ft entry) — the drawings carry NO pocket dimension; rubber: Black Diamond K55 on 7'/8', same profile as the 9-ft Artemis, no published rebound, response unchanged. Bank pairing CALIBRATED by this project: stronge_realistic matches the TP B.28 7' Diamond bar-box ladder 6/6 at mean dev 0.03 diamond (banking-report.md (internal)) — brand+size class evidence, TP B.28 does not name the bar box's model generation"
        }
      },
      "geometry": "PoolPro7Ft",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "stronge_realistic"
    },
    {
      "id": "pool_pro_9ft_k55",
      "display_name": "Pool tournament 9-ft, K55 cushion (4.5 in pockets)",
      "calibration": {
        "Estimated": {
          "note": "Rasson OX (gen-1) American-pool table, canonical definition docs/geometry/rasson-ox-9ft-table-definition.json (OB-ROX-GEO-001, the only canonical source; the Drive dossier it cites, openbilliards/dossier-rasson-9ft/, is a read-back-verified working set on the Drive desktop mount - 1772 files, verified at adoption - not a second canonical source). OFFICIAL (rasson.cn design sheet + 配置单): playing surface 2540x1270 mm = 100\"x50\", pocket openings 'WPA 标准 中袋 127 mm, 角袋 114 mm' = the 4.5\"/5.0\" retail cut (this entry); the Matchroom 4\"/4.5\" event cut, the EPBF 110/125 cut and the post-Apr-2022 factory default 4\"/5\" are documented VARIANTS, not this entry (conflict C4). PROVENANCE LAW (lane ruling, r6): purchased model = baseline, Rasson/WPA data corrects, nothing authored; every number is tagged. MODEL (raw mm reads; the A1 ball-scale k is rejected): cushion width 48.072, facings 141.25/99.98 deg (planar cheek fits; the side lies outside WPA 104+-1 - ruling O3 = A for the model), jaw radii 8.645/2.962 mm (nose-tip round at the ball equator, bed+28.575, strict tangent window, 8 tips / 4 ends), side shelf 8.695 (C16 fillet tangent of the slate top round, the corner's lip definition). DERIVED: throats 98.10/110.95 = MFR mouth - MODEL cheek setback; corner shelf 45.43 = MODEL slate lip on the diagonal + MFR mouth/2. MFR(WPA): nose 63.5 % - the model's 0.615 is outside the 63.5+-1 % band (C3). Reference model = 3dsky 'rasson_9ft' (an 8-ft-pro-size OX cut at the Matchroom 4\" mouth): numbers only, no asset bytes. Cushion Klematch P59 (K55): Shore A 43+-3, DIN 53512 rebound 75+-5 % registered as a calibration prior (never dialled); no OX bank data exists, so the recommended cushion model is the kernel default (estimate)"
        }
      },
      "geometry": "PoolPro9FtK55",
      "cushion_response": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98
      },
      "recommended_cushion_model_id": "han2005_default"
    }
  ],
  "cloths": [
    {
      "id": "simonis_860_tournament",
      "display_name": "Worsted tournament cloth (new) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "Dr. Dave physical-properties FAQ u_s=0.2; Waldron stimpmeter u_r; pooltool default spin decay (docs/research/cloth-calibration.md) — identical to the kernel default"
        }
      },
      "params": {
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp_scale": 0.4444444444444444
      },
      "ui_hidden": true,
      "superseded_by": "pool_worsted_new"
    },
    {
      "id": "simonis_760_fast",
      "display_name": "Worsted tournament cloth (fast) (legacy alias)",
      "calibration": {
        "Estimated": {
          "note": "u_r=0.008 from AzBilliards installer estimate (760 ~30% faster roll than 860, MEDIUM confidence); no published 760 u_s or spin-decay measurement (research GAP) — docs/research/cloth-calibration.md"
        }
      },
      "params": {
        "u_s": 0.2,
        "u_r": 0.008,
        "u_sp_scale": 0.4444444444444444
      },
      "ui_hidden": true,
      "superseded_by": "pool_worsted_fast"
    },
    {
      "id": "worn_slow",
      "display_name": "Worn/dirty slow cloth",
      "calibration": {
        "Estimated": {
          "note": "u_r=0.016 mid of Jewett-slow..Marlow band; u_s=0.25 direction from Dr. Dave cloth-effects FAQ, no instrumented number — docs/research/cloth-calibration.md"
        }
      },
      "params": {
        "u_s": 0.25,
        "u_r": 0.016,
        "u_sp_scale": 0.4444444444444444
      }
    },
    {
      "id": "snooker_napped",
      "display_name": "Snooker napped wool",
      "calibration": {
        "Literature": {
          "source": "Mathavan et al. 2010 first-hand measurements: u_s 0.178-0.245 (avg 0.212), u_r 0.0127-0.0129, sidespin decay 22 rad/s^2 — docs/research/literature.md"
        }
      },
      "params": {
        "u_s": 0.212,
        "u_r": 0.0128,
        "u_sp_scale": 0.8970438328236493
      }
    },
    {
      "id": "carom_worsted_heated",
      "display_name": "Carom worsted (heated slate)",
      "calibration": {
        "Estimated": {
          "note": "pooltool params.py BILLIARD_GENERIC friction trio: u_s 0.2, u_r 0.01, R-proportional spin-decay default (the same u_sp convention as the pool cloths; the trio pairs with the carom ballset's f_c = 0.15) - pooltool's own NOTE says these values are 'not well researched'; no better citable carom-cloth measurement was found (research R8). NAMED UNQUANTIFIED RESIDUAL: UMB Art 11.9 mandates slate heating (Shamos: ~5 degC above ambient, purpose 'best possible rolling') but no citable quantitative friction model of the heating delta exists - heated worsted carom cloth is qualitatively faster than pool cloth in every source, so this Estimated-tier generic set with the residual named is more honest than a wrong Literature-tier pairing"
        }
      },
      "params": {
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp_scale": 0.4444444444444444
      }
    },
    {
      "id": "pool_worsted_new",
      "display_name": "Worsted tournament cloth (new)",
      "calibration": {
        "Literature": {
          "source": "Dr. Dave physical-properties FAQ u_s=0.2; Waldron stimpmeter u_r; pooltool default spin decay (docs/research/cloth-calibration.md) — identical to the kernel default"
        }
      },
      "params": {
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp_scale": 0.4444444444444444
      }
    },
    {
      "id": "pool_worsted_fast",
      "display_name": "Worsted tournament cloth (fast)",
      "calibration": {
        "Estimated": {
          "note": "u_r=0.008 from AzBilliards installer estimate (760 ~30% faster roll than 860, MEDIUM confidence); no published 760 u_s or spin-decay measurement (research GAP) — docs/research/cloth-calibration.md"
        }
      },
      "params": {
        "u_s": 0.2,
        "u_r": 0.008,
        "u_sp_scale": 0.4444444444444444
      }
    },
    {
      "id": "pool_worsted_measured",
      "display_name": "Tournament cloth (measured friction)",
      "calibration": {
        "Measured": {
          "session": "pool-9ft-measured-s1",
          "date": "at adoption",
          "values": [
            {
              "param": "cloth.u_s",
              "value": 0.247,
              "sigma": 0.0066,
              "note": "two-phase slide->roll position-domain fits, n=4 (per-shot bootstrap sd 0.0013-0.0050); heavy-draw launches 1.96-2.25 m/s, slip speed ~2-4.5 m/s in phase 1; scale systematic ~+-0.3%; sits at the top of the 0.178-0.245 literature range for other cloths"
            },
            {
              "param": "cloth.u_r",
              "value": 0.0103,
              "sigma": 0.0017,
              "note": "REPRESENTATIVE constant from the measured speed-dependent band: 0.0086+-0.0004 @ 0.3-0.55 m/s (return legs) and 0.01195+-0.0001 @ 0.8-1.1 m/s (outbound phase-2); value = arithmetic mid of the two plateaus, sigma = the half-band (a model-form allowance, larger than either plateau's statistical sd)"
            },
            {
              "param": "cloth.u_sp_scale",
              "value": 0.37,
              "sigma": 0.018,
              "note": "spin-decay alpha 9.06+-0.46 rad/s^2 from 4 stripe-phase PLL spin-downs (rotation is scale-free on the exact pts clock), converted via u_sp_scale = alpha*2/(5*G); constant-alpha regime holds down to ~5 rad/s; this cloth spins ~17% longer than the kernel default 0.4444"
            }
          ],
          "doc": "pool-9ft-measured-calibration.md (internal)"
        }
      },
      "params": {
        "u_s": 0.247,
        "u_r": 0.0103,
        "u_sp_scale": 0.37
      }
    }
  ],
  "ballsets": [
    {
      "id": "aramith_pool",
      "display_name": "Pool (57.15 mm) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "Dr. Dave physical-properties FAQ / pooltool params.py POOL_GENERIC (m=0.170097 kg, R=28.575 mm) — the kernel default parameter set (crate::params provenance)"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      },
      "ui_hidden": true,
      "superseded_by": "pool_standard"
    },
    {
      "id": "aramith_pool_worn",
      "display_name": "Pool, worn/used (57.15 mm) (legacy alias)",
      "calibration": {
        "Calibrated": {
          "source": "BallBallFriction::worn_fitted joint fit on reference slow-motion footage (examples/fit_mu_bb.rs over the staged observables: topspin-hop apex 1.1-3.1 mm + both solved-camera cut throws + stun-B null, loss 0.49 vs 4.40 for the Marlow fit; report under docs/research/). Literature support for the raised floor: Alciatore TP B.3 Colenso-refit shape (ball condition unstated in TP B.3; worn/used is our inference) + 1.5-2.5x dirty-band (TP A-14 cling section), Mathavan 2014 constant mu=0.05, Dr. Dave BD Jul/Aug 2014 dirty-ball throw measurements"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      },
      "bb_friction": {
        "a": 0.035,
        "b": 0.219,
        "c": 0.691
      },
      "ui_hidden": true,
      "superseded_by": "pool_used"
    },
    {
      "id": "snooker",
      "display_name": "Snooker (52.5 mm)",
      "calibration": {
        "Literature": {
          "source": "Mathavan et al. 2010: M=0.1406 kg, R=26.25 mm, cushion mu_w=0.14 (docs/research/softbody-cushion.md §1.3); restitutions keep kernel defaults (no snooker-specific measurement)"
        }
      },
      "params": {
        "m": 0.1406,
        "r": 0.02625,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.14,
        "e_t": 0.5
      }
    },
    {
      "id": "carom",
      "display_name": "Carom (61.5 mm)",
      "calibration": {
        "Estimated": {
          "note": "pooltool params.py BILLIARD_GENERIC (m=0.210 kg, R=30.75 mm, f_c=0.15); mass/diameter match the UMB norm, friction/restitution values are pooltool estimates (its own NOTE: not well-researched)"
        }
      },
      "params": {
        "m": 0.21,
        "r": 0.03075,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.15,
        "e_t": 0.5
      }
    },
    {
      "id": "aramith_black",
      "display_name": "Black-cap tournament (legacy alias)",
      "calibration": {
        "Estimated": {
          "note": "visual variant (issue #91): Aramith Tournament Black (Duramith) — physics params are the aramith_pool class verbatim (BallParams::default, 57.15 mm / 170.097 g phenolic); no set-specific friction/COR measurement is published, so no numeric deviation is claimed"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      },
      "ui_hidden": true,
      "superseded_by": "pool_black_cap"
    },
    {
      "id": "arcos_reserve",
      "display_name": "Ivory gunsight (legacy alias)",
      "calibration": {
        "Estimated": {
          "note": "visual variant (issue #91): Predator Arcos II Reserve (Super Aramith Pro formula) — physics params are the aramith_pool class verbatim (BallParams::default, 57.15 mm / 170.097 g phenolic); no set-specific friction/COR measurement is published, so no numeric deviation is claimed"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      },
      "ui_hidden": true,
      "superseded_by": "pool_ivory_gunsight"
    },
    {
      "id": "pool_standard",
      "display_name": "Pool (57.15 mm)",
      "calibration": {
        "Literature": {
          "source": "Dr. Dave physical-properties FAQ / pooltool params.py POOL_GENERIC (m=0.170097 kg, R=28.575 mm) — the kernel default parameter set (crate::params provenance)"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      }
    },
    {
      "id": "pool_used",
      "display_name": "Pool, worn/used (57.15 mm)",
      "calibration": {
        "Calibrated": {
          "source": "BallBallFriction::worn_fitted joint fit on reference slow-motion footage (examples/fit_mu_bb.rs over the staged observables: topspin-hop apex 1.1-3.1 mm + both solved-camera cut throws + stun-B null, loss 0.49 vs 4.40 for the Marlow fit; report under docs/research/). Literature support for the raised floor: Alciatore TP B.3 Colenso-refit shape (ball condition unstated in TP B.3; worn/used is our inference) + 1.5-2.5x dirty-band (TP A-14 cling section), Mathavan 2014 constant mu=0.05, Dr. Dave BD Jul/Aug 2014 dirty-ball throw measurements"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      },
      "bb_friction": {
        "a": 0.035,
        "b": 0.219,
        "c": 0.691
      }
    },
    {
      "id": "pool_black_cap",
      "display_name": "Black-cap tournament",
      "calibration": {
        "Estimated": {
          "note": "visual variant (issue #91): Aramith Tournament Black (Duramith) — physics params are the pool_standard class verbatim (BallParams::default, 57.15 mm / 170.097 g phenolic); no set-specific friction/COR measurement is published, so no numeric deviation is claimed"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      }
    },
    {
      "id": "pool_ivory_gunsight",
      "display_name": "Ivory gunsight",
      "calibration": {
        "Estimated": {
          "note": "visual variant (issue #91): Predator Arcos II Reserve (Super Aramith Pro formula) — physics params are the pool_standard class verbatim (BallParams::default, 57.15 mm / 170.097 g phenolic); no set-specific friction/COR measurement is published, so no numeric deviation is claimed"
        }
      },
      "params": {
        "m": 0.170097,
        "r": 0.028575,
        "u_s": 0.2,
        "u_r": 0.01,
        "u_sp": 0.0127,
        "e_b": 0.95,
        "e_c": 0.85,
        "f_c": 0.2,
        "e_t": 0.5
      }
    }
  ],
  "cues": [
    {
      "id": "standard",
      "display_name": "Standard maple cue",
      "calibration": {
        "Literature": {
          "source": "Dr. Dave TP A-30/31 endmass squirt model: m=0.567 kg (20 oz), end_mass=m_ball/30 (~5.7 g, mid of Shepard 2001's real-cue Mb/Mtip 20-100 band) — CueParams::default provenance"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.0056699
      }
    },
    {
      "id": "low_deflection",
      "display_name": "Low-deflection shaft",
      "calibration": {
        "Literature": {
          "source": "Shepard 2001 squirt endmass table: Mb/Mtip=100 low-squirt end (squirt 0.49 deg @ b/R=3/8, pivot ~49\"), the carbon-fiber LD regime; Kim 2021 arXiv:2104.11232 endmass physics — docs/research/literature.md"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.00170097
      }
    },
    {
      "id": "predator_z2",
      "display_name": "Pro LD shaft, 14.1 in pivot (leather tip) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "Platinum Billiards 2008 robot test: pivot 14.1 in, squirt 1.3 deg (lowest of 48 shafts) -> end mass 6.11 g via the Shepard pivot inversion (end_mass_from_pivot_in); leather tip_cor 0.73 (HSV B.42, Dr. Dave cue-tip efficiency FAQ)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.006111269461077844,
        "tip_cor": 0.73
      },
      "superseded_by": "pro_ld_pivot_141",
      "ui_hidden": true
    },
    {
      "id": "predator_314",
      "display_name": "Pro LD shaft, 11.8 in pivot (leather tip) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "Platinum Billiards 2008 robot test: pivot 11.8 in -> end mass 7.49 g via the Shepard pivot inversion; leather tip_cor 0.73 (HSV B.42)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.007485931540342298,
        "tip_cor": 0.73
      },
      "superseded_by": "pro_ld_pivot_118",
      "ui_hidden": true
    },
    {
      "id": "meucci_reddot",
      "display_name": "Pro LD shaft, 10.1 in pivot (leather tip) (legacy alias)",
      "calibration": {
        "Literature": {
          "source": "Platinum Billiards 2008 robot test: pivot 10.1 in -> end mass 8.98 g via the Shepard pivot inversion (matches Shepard's 10 in ~ 8.5 g anchor); leather tip_cor 0.73"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.008978727272727274,
        "tip_cor": 0.73
      },
      "superseded_by": "pro_ld_pivot_101",
      "ui_hidden": true
    },
    {
      "id": "break_phenolic",
      "display_name": "Break cue (phenolic tip)",
      "calibration": {
        "Literature": {
          "source": "Platinum Billiards 2008 robot test: break-cue pivot 7.6 in, squirt 2.3 deg (highest band) -> end mass 12.7 g via the Shepard pivot inversion; phenolic tip_cor 0.85 (TP B.22 0.81-0.87 band)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.012704340248962656,
        "tip_cor": 0.85
      }
    },
    {
      "id": "standard_dime_tip",
      "display_name": "Standard maple cue, dime tip",
      "calibration": {
        "Literature": {
          "source": "Dr. Dave TP B.1 tip curvature standards: dime radius 0.352 in = 8.95 mm (default entry = nickel 10.6 mm); all other parameters identical to the `standard` entry"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.00895,
        "end_mass": 0.0056699
      }
    },
    {
      "id": "masse_trick",
      "display_name": "Massé/trick cue (hard pressed tip)",
      "calibration": {
        "Calibrated": {
          "source": "Venom footage program W2/W3 (issues #154/#168, venom/report.md (internal)): Dr. Dave's overlaid tip-position crosshairs, measured through the verified homographies, put the contact offsets at 0.572/0.579/0.567 R on shots 3/1/2 -> miscue_contact_cap_r 0.58 covers the measured band (the W3 fits had to clamp every strike to the 0.5 R boundary, gap +0.067..+0.079 R); cue mass 0.62 kg = the W3 shot-2 fit pegged at its declared trick-cue bracket top; tip curvature nickel-class (extraction note: dime-to-near-flat band, nickel held); end_mass/tip_cor stay at the `standard` values — no squirt/efficiency measurement exists for this cue class (P-IV: not invented)"
        }
      },
      "params": {
        "m": 0.62,
        "tip_radius": 0.0106,
        "end_mass": 0.0056699,
        "miscue_contact_cap_r": 0.58
      }
    },
    {
      "id": "masse_trick_dwell",
      "display_name": "Massé/trick cue, dwell-calibrated (soft pressed tip)",
      "calibration": {
        "Calibrated": {
          "source": "Amendment-024 finite-dwell refit (issue #212; moved to this NEW entry by issue #232 — immutable-once-shipped): the masse-shot-1 refit inside the design-declared brackets (records/venom/masse-shot-1.fit.json (internal); design-212-masse-curve-authority.md section 8) -> pinch_dwell_gain 0.54, pinch_end_mass 0.0209 kg, pinch_press_scale 0.1725 (fitted; verdict GAP -> REPRODUCED, cb_path_rms 6.08 -> 1.58 sigma), pinch_jam 1.0 HELD for the soft-tip family (narration-digest rows 4/19: 1.5-1.9 ms dwell, ball 'jammed down into the table'; jump cues keep jam 0); cue mass 0.737611 kg = the SAME fit's value inside the record's declared in-video bracket [0.7, 0.78] — the mass the 024 acceptance actually ran (the masse_trick entry's 0.62 kg is the W3 shot-2 fit's bracket top for a DIFFERENT cue; the mass and the quartet were fitted jointly, so this entry keeps the joint operating point); miscue_contact_cap_r 0.58 = the Venom W2 measured band 0.567-0.579 R (issue #168, the masse_trick envelope); tip curvature nickel-class and end_mass/tip_cor at the `standard` values (held, not fitted — the fit record's tip_curvature_radius_m note; P-IV: not invented)"
        }
      },
      "params": {
        "m": 0.737611,
        "tip_radius": 0.0106,
        "end_mass": 0.0056699,
        "miscue_contact_cap_r": 0.58,
        "pinch_dwell_gain": 0.54,
        "pinch_jam": 1,
        "pinch_end_mass": 0.0209,
        "pinch_press_scale": 0.1725
      }
    },
    {
      "id": "carbon_ld",
      "display_name": "Carbon-fiber ultra-LD shaft (leather tip)",
      "calibration": {
        "Estimated": {
          "note": "mixed-tier record (issue #283; per-value tiers): end_mass = the `low_deflection` entry's Mb/Mtip=100 CF-LD regime value BYTE-EXACTLY (Literature: Shepard 2001 low-squirt end, squirt 0.49 deg @ b/R=3/8; Kim 2021 arXiv:2104.11232 - only the light cue END participates). The published Revo-class pivot ~19 in (Billiards Digest Jan 2019 pivot table) maps to ~4.4 g through end_mass_from_pivot_in, but the small-offset inversion is validated only inside the Platinum robot band 7.6-14.1 in and documentedly diverges from Shepard's own long-pivot rows (his 30 in -> ~50 anchor vs the formula's 63), so the entry keeps Shepard's published regime value instead of extrapolating the inversion - the tension is recorded, not hidden. m 0.567 kg + nickel tip_radius 0.0106 = playing-cue class defaults (total cue weight is player-configured, the shaft material does not move it; no CF-specific crown radius published). tip_cor 0.73 Literature: a LEATHER tip on the CF shaft - the TIP sets the restitution class, not the shaft (HSV B.42 leather band; params.rs tip_cor doctrine, BD June 2014). shaft_first_mode_hz 40 Hz Estimated: NO published CF whole-cue mode measurement exists; direction argument only - laterally stiffer at lower linear density than maple (Predator patent US7431655B2 claims modulus >= 29.6 GPa vs hard maple E 12.62 GPa / rho 705 kg/m^3, Wood Database), and Euler-Bernoulli f1 ~ sqrt(E*I/(rho*A))/L^2 rises with both, so the mode sits ABOVE the 27 Hz maple anchor (DBKcues ring-down); 40 Hz is a stated engineering estimate inside the [8, 200] Hz validation band. shaft_damping_ratio keeps the 0.08 default (HSV A.25 in-stroke tracking; no CF-specific measurement)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.00170097,
        "tip_cor": 0.73,
        "shaft_first_mode_hz": 40
      }
    },
    {
      "id": "jump_phenolic",
      "display_name": "Jump cue (phenolic tip)",
      "calibration": {
        "Estimated": {
          "note": "mixed-tier record (issue #283; per-value tiers): m 0.26 kg (~9.2 oz) Literature-band - dedicated jump cues run 8-12 oz, ~9 typical (Dr. Dave jump FAQ + retailer survey, issue #283 research digest; WPA §17 constrains only >= 40 in length / <= 25 oz mass). tip_cor 0.85 Literature (phenolic band 0.81-0.87, TP B.22). pinch_jam 0.0 (the serde default) is a POSITIVE statement, not an omission: phenolic jump tips keep the Amendment-023 masse-jump flight channel OPEN (params.rs pinch_jam doctrine + the Amendment-024 shot-4 regression guard: 'jump cues keep jam 0'). tip_radius 0.0106 Estimated nickel-class: 14 mm phenolic crowns publish no radius (issue #283 honesty ledger) - nickel default, stated. end_mass 12.7 g Estimated: no jump-cue squirt/pivot measurement is published; adopts the Platinum robot break-cue band BYTE-EXACTLY (end_mass_from_pivot_in(7.6), the `break_phenolic` entry) as the nearest measured datum for the same stiff-short-shaft phenolic construction family (jump/break combo heritage); a stiff short front recruits MORE transverse mass, so the break band's high-squirt end is the honest direction. shaft_first_mode_hz 57 Hz Estimated via Euler-Bernoulli length scaling f1 ~ 1/L^2: the jump class at the WPA 40-in floor vs the 58-in reference cue gives (58/40)^2 x 27 Hz = 56.8 -> 57 Hz (the formula is the provenance; a 48-in jumper would read ~39 Hz - the class is genuinely stiffer-faster). shaft_damping_ratio keeps the 0.08 default"
        }
      },
      "params": {
        "m": 0.26,
        "tip_radius": 0.0106,
        "end_mass": 0.012704340248962656,
        "tip_cor": 0.85,
        "shaft_first_mode_hz": 57
      }
    },
    {
      "id": "snooker_ash",
      "display_name": "Snooker ash cue, 9.5 mm brass ferrule",
      "calibration": {
        "Estimated": {
          "note": "mixed-tier record (issue #283; per-value tiers): m 0.49 kg (17.3 oz) Literature-band - snooker cues run 16-18.5 oz (issue #283 research digest; pooltool CueSpecs SNOOKER_GENERIC ships M = 0.478 kg in the same band). tip_radius 0.00895 Estimated dime-class convention: no snooker crown radius is published; the 9.5 mm tip is conventionally dressed to the tighter dime curvature (Dr. Dave TP B.1 dime 0.352 in - small tips take the smaller standard crown), a convention pick, not a measurement. end_mass 6.67 g Estimated: base = the pooltool SNOOKER_GENERIC anchor end_mass = 0.140/30 kg = 4.67 g (pooltool objects/cue/datatypes.py CUE_SPECS - the reference implementation's snooker cue, the 140 g ball's m/30 convention) plus an Estimated +2.0 g brass-ferrule bump: a ~9.5 mm OD x ~10 mm brass collar masses ~2 g (rho 8.5 g/cm^3 thin-wall annulus) at the very tip, entirely inside the squirt-effective end zone (Kim 2021: only the last ~12 cm participates), the standing explanation for snooker cues squirting MORE than their slim tips suggest; no snooker robot/pivot measurement exists - bump declared, not laundered. tip_cor 0.73 Literature (leather band, HSV B.42). shaft_first_mode_hz 28 Hz Estimated near the 27 Hz maple anchor: same 57-58 in length, and ash/maple E-to-rho ratios are nearly equal (Wood Database), so no measurable frequency shift is defensible; 28 Hz encodes the community 'ash plays slightly stiffer' direction within the A25 fit's own +-5 Hz noise (docs/research/whip-calibration-277.md) - a direction marker, not a measurement. shaft_damping_ratio keeps the 0.08 default"
        }
      },
      "params": {
        "m": 0.49,
        "tip_radius": 0.00895,
        "end_mass": 0.006666666666666667,
        "tip_cor": 0.73,
        "shaft_first_mode_hz": 28
      }
    },
    {
      "id": "carom_conical",
      "display_name": "Carom cue, conical taper",
      "calibration": {
        "Estimated": {
          "note": "mixed-tier record (issue #283; per-value tiers): m 0.52 kg Literature-band - dedicated 3-cushion cues run 520-540 g (= 18.3-19.0 oz; issue #283 research digest), and the band FLOOR 520 g is the representative pick, stated. RECORDED DISCREPANCY (review r1): the same digest row also quotes a broader/lighter all-carom envelope 16.5-18.5 oz (= 468-524 g) that cannot bracket the 3C band it parenthesizes - the 3C-specific gram band governs this entry, the oz row is recorded as the source's inconsistency, not laundered into agreement. tip_radius 0.0106 Estimated nickel-class for the 11.5-12 mm tip (no published carom crown radius; nickel default, stated). tip_cor 0.73 Literature (leather band, HSV B.42). end_mass 4.5 g Estimated: no carom robot/pivot measurement exists; direction from construction - carom cues are DELIBERATELY low-squirt for the 61.5 mm ball (research digest: wood ferrule ~0.6 g/cm^3 vs the pool cue's denser synthetic, slim 11.5-12 mm front), so the value sits ~20% below the `standard` maple 5.67 g and far above the CF ultra-LD regime 1.70 g. NOTE the discipline's BALL parameters (61.5 mm / 210 g / f_c 0.15) live on the `carom` BALLSET entry - the cue entry carries cue properties only; pairing them is the equipment spec's job (DISCIPLINE_DEFAULT_CUE_IDS + the feature-012 app map). shaft_first_mode_hz 35 Hz Estimated: extra-stiff full- conical taper (no pro-taper constant-diameter front) plus the shorter 55-56 in class both raise the mode above the 27 Hz pro-taper maple anchor - length scaling alone gives (58/55.5)^2 x 27 = 29.5 Hz, the conical stiffness carries the rest of the estimate; no published measurement. shaft_damping_ratio keeps the 0.08 default"
        }
      },
      "params": {
        "m": 0.52,
        "tip_radius": 0.0106,
        "end_mass": 0.0045,
        "tip_cor": 0.73,
        "shaft_first_mode_hz": 35
      }
    },
    {
      "id": "pro_ld_pivot_141",
      "display_name": "Pro LD shaft, 14.1 in pivot (leather tip)",
      "calibration": {
        "Literature": {
          "source": "generic-id twin of the shipped `predator_z2` entry (catalog v14, issue #283 de-branding decision; params byte-identical, pinned by v14_debranding_twins_and_supersession). Platinum Billiards 2008 robot test: pivot 14.1 in, squirt 1.3 deg (lowest of 48 shafts) -> end mass 6.11 g via the Shepard pivot inversion (end_mass_from_pivot_in); leather tip_cor 0.73 (HSV B.42, Dr. Dave cue-tip efficiency FAQ). Measured shaft: Predator Z-2 (data-source citation, nominative use only)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.006111269461077844,
        "tip_cor": 0.73
      }
    },
    {
      "id": "pro_ld_pivot_118",
      "display_name": "Pro LD shaft, 11.8 in pivot (leather tip)",
      "calibration": {
        "Literature": {
          "source": "generic-id twin of the shipped `predator_314` entry (catalog v14, issue #283 de-branding decision; params byte-identical, pinned). Platinum Billiards 2008 robot test: pivot 11.8 in -> end mass 7.49 g via the Shepard pivot inversion; leather tip_cor 0.73 (HSV B.42). Measured shaft: Predator 314 (data-source citation, nominative use only)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.007485931540342298,
        "tip_cor": 0.73
      }
    },
    {
      "id": "pro_ld_pivot_101",
      "display_name": "Pro LD shaft, 10.1 in pivot (leather tip)",
      "calibration": {
        "Literature": {
          "source": "generic-id twin of the shipped `meucci_reddot` entry (catalog v14, issue #283 de-branding decision; params byte-identical, pinned). Platinum Billiards 2008 robot test: pivot 10.1 in -> end mass 8.98 g via the Shepard pivot inversion (matches Shepard's 10 in ~ 8.5 g anchor); leather tip_cor 0.73. Measured shaft: Meucci Red Dot (data-source citation, nominative use only)"
        }
      },
      "params": {
        "m": 0.567,
        "tip_radius": 0.0106,
        "end_mass": 0.008978727272727274,
        "tip_cor": 0.73
      }
    }
  ],
  "cushion_models": [
    {
      "id": "han2005_default",
      "display_name": "Han 2005 (kernel default)",
      "calibration": {
        "Literature": {
          "source": "Han 2005 rigid-body impulse model with Kiefl's corrections (docs/research/literature.md); flat friction mu=f_c, constant kinematic e0=0.85 — the frozen v1 baseline"
        }
      },
      "cushion_model": "Han2005",
      "cushion_friction": {
        "k": 0,
        "v_ref": 1,
        "mu_min": 0,
        "mu_max": 1
      },
      "bb_hop_min_height": 0.005,
      "bt_min_bounce_height": 0.005
    },
    {
      "id": "stronge_realistic",
      "display_name": "Stronge compliant (realistic)",
      "calibration": {
        "Calibrated": {
          "source": "calibrated cushion-friction curve fitted on reference slow-motion footage (params.rs provenance); omega_ratio=1.8 adopted from pooltool's shipped resolver default — the SC-002 kick anchors are all gross-slip and cannot calibrate it (resolve/cushion_stronge.rs provenance)"
        }
      },
      "cushion_model": {
        "StrongeCompliant": {
          "omega_ratio": 1.8
        }
      },
      "cushion_friction": {
        "k": -0.4,
        "v_ref": 1,
        "mu_min": 0.2,
        "mu_max": 0.4
      },
      "bb_hop_min_height": 0.00001,
      "bt_min_bounce_height": 0.00001
    },
    {
      "id": "mathavan_fitted",
      "display_name": "Mathavan 2010 (HSV joint fit)",
      "calibration": {
        "Calibrated": {
          "source": "eval_mathavan joint2 sweep (issue #9 stage 3): TangentialCompliance::hsv_fitted (chi=0.8, e_x=0.9) + CushionFriction::hsv_fitted + ee0=0.80 (CushionResponse::EE0_HSV_FITTED); gates/residuals on TangentialCompliance::hsv_fitted"
        }
      },
      "cushion_model": {
        "Mathavan2010": {
          "max_steps": 1000,
          "delta_p_scale": 0.1,
          "tangential_compliance": {
            "freq_ratio": 0.8,
            "e_x": 0.9
          }
        }
      },
      "cushion_friction": {
        "k": -0.4,
        "v_ref": 1,
        "mu_min": 0.16,
        "mu_max": 0.28
      },
      "response_override": {
        "e0": 0.85,
        "k_v": 0,
        "v_ref": 1,
        "e_min": 0.6,
        "e_max": 0.98,
        "ee0": 0.8
      },
      "bb_hop_min_height": 0.00001,
      "bt_min_bounce_height": 0.00001
    },
    {
      "id": "grip_fitted",
      "display_name": "Mathavan 2010 grip mode (cushion v5)",
      "calibration": {
        "Calibrated": {
          "source": "eval_mathavan v5probe/v5fit sweeps (issues #9/#13): TangentialCompliance::grip_fitted (chi=1.2, e_x=0.9, grip_ratio=2.5, grip_capture=0.6) + CushionResponse::grip_fitted velocity-sloped energetic restitution; provenance on TangentialCompliance::grip_fitted"
        }
      },
      "cushion_model": {
        "Mathavan2010": {
          "max_steps": 1000,
          "delta_p_scale": 0.1,
          "tangential_compliance": {
            "freq_ratio": 1.2,
            "e_x": 0.9,
            "grip_ratio": 2.5,
            "grip_capture": 0.6
          }
        }
      },
      "cushion_friction": {
        "k": -0.4,
        "v_ref": 1,
        "mu_min": 0.16,
        "mu_max": 0.28
      },
      "response_override": {
        "e0": 0.85,
        "k_v": 0.18,
        "v_ref": 1,
        "e_min": 0.5,
        "e_max": 0.98,
        "ee0": 0.65
      },
      "bb_hop_min_height": 0.00001,
      "bt_min_bounce_height": 0.00001
    }
  ]
};

// ---- registry helpers -------------------------------------------------------

/** The five equipment axes, keyed by the EquipmentIds field that selects
 * from each (share codec + settings pickers iterate this). */
export const EQUIPMENT_AXES = Object.freeze({
  table_id: 'tables',
  cloth_id: 'cloths',
  ballset_id: 'ballsets',
  cue_id: 'cues',
  cushion_model_id: 'cushion_models',
} as const);

export type EquipmentAxis = keyof typeof EQUIPMENT_AXES;

interface EntryCommon {
  id: string;
  display_name: string;
  calibration: Calibration;
  /** Catalog v4 (tables; since v20 also cloths, ballsets and cues): filter
   * these OUT of user-facing pickers; the id still validates/resolves.
   * Absent = visible. */
  ui_hidden?: boolean;
  /** Catalog v14 (cues; since v20 also tables, cloths and ballsets):
   * superseded ids are picker-hidden in
   * favor of the named byte-identical twin; the id still
   * validates/resolves forever. Absent = current entry. */
  superseded_by?: string;
}

/** All entries along one axis (picker population order = kernel order),
 * INCLUDING ui_hidden ones — validation must keep accepting hidden ids
 * (legacy share links/records pin them); user-facing pickers filter on
 * `ui_hidden` themselves. */
export function catalogEntries(axis: EquipmentAxis): readonly EntryCommon[] {
  return CATALOG[EQUIPMENT_AXES[axis]];
}

/** Entry lookup by axis + id (undefined for unknown ids). */
export function catalogEntry(
  axis: EquipmentAxis, id: string,
): EntryCommon | undefined {
  return catalogEntries(axis).find((e) => e.id === id);
}

/** Miscue geometry of an equipment composition (kernel-api.md Amendments
 * 020/021, issues #146/#168): the equipped cue's tip radius + PER-CUE
 * contact cap (`masse_trick` carries 0.58 R) and the ball set's radius, in
 * the exact `MiscueGeometry` shape `validateShot` takes. An equipment-
 * tagged surface (share links, app settings) must validate shots against
 * ITS composition, not the kernel defaults — a legal trick-cue shot with
 * contact offset in (0.5, 0.58]R would otherwise fail the mirror while the
 * kernel accepts it. Unknown ids yield `undefined` fields (= the kernel
 * defaults in `validateShot`) — run `validateEquipmentIds` first where ids
 * must be known-good. The kernel (`simulate`) stays authoritative. */
export function miscueGeometryOf(ids: EquipmentIds): MiscueGeometry {
  const cue = CATALOG.cues.find((c) => c.id === ids.cue_id)?.params;
  const ballset = CATALOG.ballsets.find((b) => b.id === ids.ballset_id)?.params;
  return {
    ...(cue !== undefined && { tip_radius: cue.tip_radius }),
    ...(ballset !== undefined && { ball_radius: ballset.r }),
    ...(cue?.miscue_contact_cap_r !== undefined
      && { miscue_contact_cap_r: cue.miscue_contact_cap_r }),
  };
}

/** Thrown on unknown equipment ids (mirror of the kernel's per-category
 * `SimError::InvalidInput` from `EquipmentCatalog::resolve`). */
export class EquipmentError extends Error {
  override name = 'EquipmentError';
}

/** One digest alias row (catalog v20, #789): the FNV-1a 64 digest of a
 * retired id on one kernel axis, and the twin id it resolves to. */
export interface CatalogAliasDigest {
  readonly axis: string;
  readonly digest: string;
  readonly neutral_id: string;
}

/** Catalog v20 (#789): the private digest alias rows, a hand-written mirror
 * of the kernel's `catalog_alias_digests_json()` (pinned by the drift test
 * in test/catalog.test.ts). The two retired v8 Measured ids left the served
 * catalog; each row maps one of their digests to its twin, so a record or
 * share that pinned an old id still validates while no plaintext old id is
 * served. Exported by name for the drift test only (the barrel does not
 * re-export it). */
export const CATALOG_ALIAS_DIGESTS: readonly CatalogAliasDigest[] =
  Object.freeze([
    Object.freeze({
      axis: 'table', digest: '8223852648be1aa5',
      neutral_id: 'pool_pro_9ft_measured',
    }),
    Object.freeze({
      axis: 'cloth', digest: '906c9b774047f8a4',
      neutral_id: 'pool_worsted_measured',
    }),
  ]);

const FNV1A64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV1A64_PRIME = 0x100000001b3n;

/** FNV-1a 64 over the UTF-8 bytes of `s` (offset basis
 * 0xcbf29ce484222325, prime 0x100000001b3, multiply modulo 2^64), as 16
 * lowercase hex digits: the kernel's alias digest in a synchronous BigInt
 * form. Exported by name for the drift test's published vectors only. */
export function fnv1a64Hex(s: string): string {
  let h = FNV1A64_OFFSET_BASIS;
  for (const b of new TextEncoder().encode(s)) {
    h = BigInt.asUintN(64, (h ^ BigInt(b)) * FNV1A64_PRIME);
  }
  return h.toString(16).padStart(16, '0');
}

/** The twin id a digest alias row maps `id` to on `axis`, or undefined.
 * Consulted only after the mirror lookup misses, so a current id never
 * goes through it. */
function aliasDigestTarget(
  axis: EquipmentAxis, id: string,
): string | undefined {
  const kernelAxis = axis.slice(0, -'_id'.length);
  const digest = fnv1a64Hex(id);
  const row = CATALOG_ALIAS_DIGESTS.find(
    (r) => r.axis === kernelAxis && r.digest === digest);
  return row !== undefined && catalogEntry(axis, row.neutral_id) !== undefined
    ? row.neutral_id : undefined;
}

/** Validate every id of a spec against the registry mirror; throws
 * EquipmentError naming the axis and the offending id (the kernel
 * re-validates on resolve — this fails fast with the same semantics).
 * Catalog v20 (#789): an id the mirror does not carry is accepted when a
 * digest alias row maps it to a twin (the kernel's resolve does the same),
 * and the spec is returned unchanged, so the sender's id reaches the
 * kernel and the record bytes stay identical. */
export function validateEquipmentIds(ids: EquipmentIds): EquipmentIds {
  for (const axis of Object.keys(EQUIPMENT_AXES) as EquipmentAxis[]) {
    const id = ids[axis];
    if (typeof id !== 'string' || (catalogEntry(axis, id) === undefined
      && aliasDigestTarget(axis, id) === undefined)) {
      throw new EquipmentError(
        `unknown equipment ${EQUIPMENT_AXES[axis]} id '${String(id)}'`);
    }
  }
  return ids;
}
