// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { BallBallFriction, BallParams, CushionFriction, CushionResponse, EquipmentIds } from './types.js';
import type { ClothPreset, CueParams, CushionModel, MiscueGeometry } from './shot.js';
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
export declare const CATALOG_VERSION = 21;
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
export type Calibration = {
    Calibrated: {
        source: string;
    };
} | {
    Literature: {
        source: string;
    };
} | {
    Estimated: {
        note: string;
    };
} | {
    Measured: {
        session: string;
        date: string;
        values: MeasuredParam[];
        doc: string;
    };
};
/** Lower-case calibration kind (badge rendering: 标定/文献/估计/实测). */
export type CalibrationKind = 'calibrated' | 'literature' | 'estimated' | 'measured';
export declare function calibrationKind(c: Calibration): CalibrationKind;
/** Default equipment ids — the composition of the kernel-default pipeline
 * (catalog.rs DEFAULT_*_ID constants). */
export declare const DEFAULT_EQUIPMENT: Readonly<EquipmentIds>;
/** True iff `ids` equals the kernel-default composition (the serde skip
 * predicate: default equipment is OMITTED from serialized scenarios). */
export declare function isDefaultEquipment(ids: EquipmentIds): boolean;
/** Per-discipline DEFAULT cue ids (catalog v14, issue #283 owner decision
 * 1; kernel mirror: catalog.rs `DISCIPLINE_DEFAULT_CUE_IDS`), keyed by
 * the game catalog's `discipline_family`. Consumed by the app's
 * per-discipline equipment defaults (feature 012 `defaultEquipmentFor` /
 * `equipmentByGame`) in the follow-up UI slice — unknown families fall
 * back to the caller's own default (the per-axis-validation law). */
export declare const DISCIPLINE_DEFAULT_CUE_IDS: Readonly<Record<string, string>>;
export interface TableEntry {
    id: string;
    display_name: string;
    calibration: Calibration;
    /** Geometry family selector (unit serde variant; the concrete table is
     * built at resolve time from the ballset radius at the entry's own nose
     * fraction — feature 009 per-entry pocket geometry). */
    geometry: 'Wpa9Ft' | 'DiamondProAm9Ft' | 'PredatorApex9Ft' | 'WpaSpec9Ft' | 'DiamondRedLabel9Ft' | 'WpbsaSnooker12Ft' | 'CaromUmb284' | 'Chinese8Pro9Ft' | 'DiamondProAm8Ft' | 'DiamondProAm7Ft' | 'RassonOx9Ft' | 'PoolPro9Ft' | 'PoolPro8Ft' | 'PoolPro7Ft' | 'PoolPro9FtMetalRim' | 'PoolPro9FtK55' | 'PoolPro9FtOlderGen';
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
export declare const CATALOG: EquipmentCatalog;
/** The five equipment axes, keyed by the EquipmentIds field that selects
 * from each (share codec + settings pickers iterate this). */
export declare const EQUIPMENT_AXES: Readonly<{
    readonly table_id: "tables";
    readonly cloth_id: "cloths";
    readonly ballset_id: "ballsets";
    readonly cue_id: "cues";
    readonly cushion_model_id: "cushion_models";
}>;
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
export declare function catalogEntries(axis: EquipmentAxis): readonly EntryCommon[];
/** Entry lookup by axis + id (undefined for unknown ids). */
export declare function catalogEntry(axis: EquipmentAxis, id: string): EntryCommon | undefined;
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
export declare function miscueGeometryOf(ids: EquipmentIds): MiscueGeometry;
/** Thrown on unknown equipment ids (mirror of the kernel's per-category
 * `SimError::InvalidInput` from `EquipmentCatalog::resolve`). */
export declare class EquipmentError extends Error {
    name: string;
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
export declare const CATALOG_ALIAS_DIGESTS: readonly CatalogAliasDigest[];
/** FNV-1a 64 over the UTF-8 bytes of `s` (offset basis
 * 0xcbf29ce484222325, prime 0x100000001b3, multiply modulo 2^64), as 16
 * lowercase hex digits: the kernel's alias digest in a synchronous BigInt
 * form. Exported by name for the drift test's published vectors only. */
export declare function fnv1a64Hex(s: string): string;
/** Validate every id of a spec against the registry mirror; throws
 * EquipmentError naming the axis and the offending id (the kernel
 * re-validates on resolve — this fails fast with the same semantics).
 * Catalog v20 (#789): an id the mirror does not carry is accepted when a
 * digest alias row maps it to a twin (the kernel's resolve does the same),
 * and the spec is returned unchanged, so the sender's id reaches the
 * kernel and the record bytes stay identical. */
export declare function validateEquipmentIds(ids: EquipmentIds): EquipmentIds;
