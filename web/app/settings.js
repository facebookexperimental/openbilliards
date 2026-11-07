// Copyright (c) Meta Platforms, Inc. and affiliates.

// settings.js — gear-icon settings panel: GAME selector + catalog browse
// view (feature 011: playable GameCatalog entries in the selector; ALL
// entries in the browse view with provenance line + readiness badge,
// readiness entries disabled), aim-assist level (broadcast to STREAM-A's
// preview via the `ob:settings` window CustomEvent), sound on/off + master
// volume, and the default camera mode. Persisted to localStorage; every
// default matches today's behavior (default ids + the stronge_realistic
// cushion model == the old 'realistic' preset template bit-exactly; game
// defaults to nine_ball — FR-003).
//
// EQUIPMENT PANE MIGRATED (feature 032, program 525 S2): the equipment
// SECTION (five catalog-axis pickers, cloth-color chips, table provenance
// cards, lighting fixture/brightness) lives in the shell's equipment
// place — the five-station atelier (web/app/atelier.js). The equipment
// MACHINERY stays here: changeEquipment + its confirm classes, the cue_id
// fast path, set('clothColor'/'fixture'/'brightness'), load-path
// sanitation, per-game persistence, ctx.cueSwap/ctx.miscue. The
// __settings.show('equipment') deep link routes to the place (api.show —
// the D1 annex SHIMMED row).
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-C (share/sound/settings).
// This file also hosts `ctx`, the tiny context shared by the three co-owned
// STREAM-C modules (share.js contributes game/hud, sound.js contributes the
// audio handle; main.js only passes { machine } here).
//
// AUTO-CLOSE-IFF-RERACK (issue GH-121, recorded rule): a USER-CONFIRMED
// change that RESETS THE TABLE closes the settings shell right after the
// commit — the confirm IS the commit-and-go intent. Applies to: an
// equipment-axis change (changeEquipment), a game/discipline switch
// (changeGame), and the ONE re-racking mode leg (changeMode
// playground → play/practice, fresh rack). Non-re-racking tweaks (volume,
// sound, look, lighting fixture/brightness, assist toggles, camera,
// language, play ↔ practice, → playground) NEVER auto-close — the player
// may be adjusting several. Scripted `skipConfirm: true` pins and every
// transient replay path (setTransient*/restorePersisted*) never close
// anything. changeVariant is EXCLUDED: its fresh-rack path is a same-seed
// in-place re-fold with no confirm dialog (comparing citation cards IS the
// adjusting-several case). The close rides api.close → closeShell(), the
// SAME teardown as the close button (no leaked backdrop / inert HUD).
// (calibrationKind left this list with the equipment pane — feature 032:
// the badge/dossier renderers live in the atelier now)
import {
  catalogEntries, catalogEntry,
} from '../dist/pool-sdk/index.js';
// Catalog v14 per-discipline default cues (issue GH-283 decision 1): reached
// through a NAMESPACE binding, never a new named import on the existing
// edge — the ownership ledger rule-5 corollary: a returning user's heuristic cache
// can pair THIS fresh module with a stale pool-sdk missing the export, and
// a named import would kill the whole boot graph as a SyntaxError. The
// namespace always links; consumers feature-detect per use and degrade to
// the pre-v14 pairing (standard cue everywhere).
import * as sdk from '../dist/pool-sdk/index.js';
// Equipment id aliases (#789): a NAMESPACE binding under the same rule-5
// corollary; every use feature-detects and degrades to identity.
import * as equipmentAlias from '../scene/equipmentalias.js';
// About-section kernel stamp (feature 015 §3): read from the EXISTING glue
// export — kernel_version has shipped on pool_wasm.js since the share codec
// (share.js statically imports it on this same boot graph), so a
// heuristically-stale pool_wasm.js still carries it (no NEW named import
// between same-deploy modules — the the ownership ledger rule-5 corollary).
import { kernel_version } from '../dist/pool-wasm/pool_wasm.js';
// Kernel catalog read (#789 mixed-cache degrade, kernelEquipmentKnown): a
// NAMESPACE binding on the same glue edge (rule-5 corollary) — catalog_json
// is feature-detected per use and any failure reads as "no verdict".
import * as poolWasm from '../dist/pool-wasm/pool_wasm.js';
// GameCatalog (feature 011): deep import of the games LEAF module (contracts/
// game-catalog.md placement rule — never via the frozen SDK barrel).
// Cache-poison note (the ownership ledger): games/*.js are NEW files, so no stale
// cached copy can exist; their only runtime dependency is the PRE-EXISTING
// `catalogEntry` export of catalog.js — a mixed-freshness graph still loads.
// The dist codec (pool-sdk/share.js) already rides them on this boot graph.
import {
  DEFAULT_GAME, GAME_CATALOG, getGameEntry,
} from '../dist/pool-sdk/games/index.js';
import {
  LOCALES, LOCALE_NAMES, applyDom, getLocale, has, onLocaleChange, setLocale, t,
} from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5 / GH-313 hasLocal law):
// hasLocal() is a post-freeze export — reached via the namespace so a fresh
// settings.js over a stale cached i18n.js keeps linking and degrades to the
// pre-313 has() register.
import * as i18nNs from './i18n.js';
import * as bootCopy from './locales/boot.js';

/** Cross-module context for STREAM-C modules (filled in creation order:
 * share → sound → settings; see main.js). */
export const ctx = { game: null, hud: null, sound: null, settings: null };

/** localStorage key. main.js's pre-boot look read duplicates this literal
 * ON PURPOSE instead of importing it: a new named export consumed by
 * main.js in the same deploy is a module-graph cache poison for returning
 * users (no Cache-Control on python -m http.server ⇒ heuristic freshness
 * can pair a fresh main.js with a stale settings.js — the 2026-07 user-boot
 * black-page regression; see the app.html boot guard). */
const KEY = 'ob-settings-v1';

/** ui/switchprogress.css version — bump on EVERY edit to that sheet (the
 * OWNERSHIP CSS addendum: the version lives in the module that links it).
 * 001: build 20 — the game-switch progress overlay.
 * 002: the accepted confirm is clipped under the overlay (a visibility flip
 * blurred its focused Continue onto <body>). */
const SWITCH_CSS_V = '002';
/** the sheet's href, resolved inside buildPanel (createSettings calls it at
 * boot): import.meta lives only there — the L81 harness
 * (test-ballreturn-lifecycle.mjs) runs every top-level declaration of this
 * module as a node:vm script with buildPanel stubbed, where import.meta is a
 * syntax error (the settings-modal.css precedent). */
let switchSheetHref = null;

/** GH-382 decision 1 (owner sign-off recorded on issue GH-382, 2026-08-07):
 * live snooker's DEFAULT rulebook is the COMPLETED one — an unpinned
 * fresh frame folds the `wpbsa-snooker-full` preset (Foul and a Miss,
 * Free Ball, Touching Ball). The default is resolved at READ time in
 * `variantFor` (replay-aware), never seeded into the profile blob
 * (contrast the GH-383 carom fresh-profile seed): a shared REPLAY
 * resolves the RECORDED default instead (`null` → the FR-005 v1 alias),
 * so every legacy/keyless link byte-replays under the frozen snooker-v1
 * engine and a Continue-from-here re-share keeps the sender's rulebook.
 * An EXPLICIT selection of either row always wins — the picker writes
 * the v1 alias id explicitly for live-default families (below). */
const LIVE_VARIANT_DEFAULTS = Object.freeze({
  snooker: 'wpbsa-snooker-full',
});

/** Kernel-default miscue limit 1 + tip_radius/R (nickel 10.6 mm tip on the
 * 57.15 mm pool ball — CueParams/BallParams defaults): the ctx.miscue
 * fallback AND the app-side commanded-cap ceiling (see ctx.miscue below). */
const DEFAULT_MISCUE_LIMIT = 1 + 0.0106 / 0.028575;

/** App-default composition (feature 010, catalog-policy item 1): the game
 * defaults to the measured pro 9-ft table. SPLIT-BRAIN NOTE: this is
 * the WEB default only — the kernel/SDK serde default stays FROZEN on the
 * ui_hidden legacy 'wpa_generic_9ft' (catalog.rs DEFAULT_TABLE_ID, sdk
 * DEFAULT_EQUIPMENT) for replay/share byte parity, and scene/table.js
 * APP_DEFAULT_TABLE_ID mirrors THIS value (boot does not broadcast
 * ob:settings, so the two web sites must flip together). The cushion stays
 * 'stronge_realistic' — it IS the table entry's recommended pairing, so
 * the composition matches what the table picker itself would compose. */
export const DEFAULTS = Object.freeze({
  equipment: Object.freeze({
    table_id: 'pool_pro_9ft',
    cloth_id: 'pool_worsted_new',
    ballset_id: 'pool_standard',
    cue_id: 'standard',
    cushion_model_id: 'stronge_realistic',
  }),
  // STREAM-A preview levels (preview.js LEVELS): 'standard' is the preview's
  // own boot default — the two modules MUST agree or a fresh profile shows a
  // panel value the preview isn't using.
  assist: 'standard',   // 'off' | 'standard' | 'practice'
  assistCuePath: true,  // cue-ball post-contact path line (feature 007)
  // Pre-shot wrong-ball warning chip (issue #88): warn while aiming when
  // the PREDICTED first contact is an illegal target under the active
  // rules. Assist-class (rides the aim preview — no prediction when the
  // assist level is 'off'), default ON: it is a rules reminder (referee
  // knowledge), never a physics oracle. Consumed LIVE by aim.js via the
  // ob:settings broadcast (`detail.all` snapshot; one ctx.settings.get()
  // boot seed — never per frame, review nit) — deliberately NO
  // localStorage mirror key (the preview 'ob.settings.*' convention is
  // not extended; SC-003 mirror arm untouched).
  assistWrongBall: true,
  // Adaptive assist-line contrast level (issue GH-417): the previewink.js
  // GH-260 dual-floor solve target, stepped low|standard|high|maximum
  // (derivation lives in previewink.js CONTRAST_LEVELS). 'standard' IS the
  // shipped GH-260 profile byte-identically — the round-3 owner 'NOT
  // tunable down' decision governs this DEFAULT; GH-417 adds the explicit
  // USER preference around it (cf. reduced-motion). Consumed by
  // previewink.js via the 'ob.settings.assistContrast' mirror key at boot
  // (the preview.js assist precedent: that leaf boots before this module
  // runs) + the ob:settings broadcast. Scripted boots pin the static ink
  // path, so the level never touches captures/renders/replays; every
  // static degrade path stays fixed too (previewink.js header note).
  assistContrast: 'standard',
  soundOn: true,
  volume: 0.8,
  // Default camera register (GH-441 — live since build 18; the key shipped
  // persisted-but-dead from 940537f3 through build 17, so blobs of either
  // value exist in the wild). 'orbit' = the classic boot pose, camera only
  // ever moves by the player's hand; 'overhead' = the derived top-down
  // near-orthographic register (camerapresets.js overheadRegister) applied
  // at real-user boot, on every fresh rack, and on the control flip itself
  // (the flip doubles as 'return home'). Consumed via the feature-detected
  // window.__camhome seam main.js publishes (the __lighting shape).
  // Scripted boots pin 'orbit' (main.js — the bootLook law); broadcast/
  // export rigs never read it.
  camera: 'orbit',      // 'orbit' | 'overhead' (default camera mode)
  // Active game (feature 011, data-model.md §7): a PLAYABLE GameCatalog id,
  // persisted in this same blob; share replays override it transiently
  // exactly like setTransientEquipment. Default nine_ball (FR-003).
  game: DEFAULT_GAME,
  // Cloth/room LOOK (visual-only — scene/look.js regrade; physics and the
  // share codec never see it). 'tournament' = the tournament steel-gray
  // grade the flagship renders use — the in-game default since the app-perf
  // wave so the live table matches the videos; 'green' = the classic green.
  look: 'tournament',
  // UI language: '' = auto (navigator.language match, else en — resolved by
  // i18n.js at boot); an explicit picker choice persists one of i18n LOCALES.
  language: '',
  // Session mode (issue #68): 'play' (full rules judgment — today's
  // behavior), 'practice' (the #66 drill layer over play semantics), or
  // 'playground' (free sandbox — flow.js suppresses judgment and the ball
  // drag generalizes to every ball). Persisted; unknown values fall back
  // to 'play' on load.
  mode: 'play',
  // Playground snap-to-grid placement aid (issue GH-140 — VISUAL-ONLY, the
  // mode/fixture precedent: placement UI geometry only, never codec/kernel
  // visible). Default OFF so every pre-GH-140 placement path and committed
  // capture stays byte-identical; flow.js consumes it live through the
  // ob:settings broadcast and toggles it from the playground chip strip.
  snapGrid: false,
  // GH-383 visual fork (VISUAL-ONLY, the `look` precedent — never
  // codec/kernel-visible): the carom SECOND cue ball's paint. 'yellow' =
  // worldwide practice (the shipped default, byte-identical captures);
  // 'marked' = the UMB Art 22.1 letter (two whites, the second dot-marked,
  // the starter's plain). Owner pick (2026-08-06): YELLOW — UMB
  // world-championship practice; 'marked' stays selectable.
  caromSecondBall: 'yellow',
  // Lighting fixture + brightness (issue #89 — VISUAL-ONLY, the `look`
  // precedent: never an equipment-tuple axis, never codec/kernel-visible).
  // 'canopy_panel' × 1.0 IS today's rig (the identity default — zero drift
  // on every existing capture). Brightness is a 0.6–1.4 linear scale over
  // the rig with the 520-lux WPA detent at 1.0 (scene/lightingvisuals.js).
  fixture: 'canopy_panel',
  // GH-386 venue default: while true, the room hangs each table CLASS's
  // own lamp (pool canopy / snooker luminaire / carom luminaire —
  // scene/lightingvisuals.js CLASS_FIXTURES) and `fixture` above is only
  // the last explicit pick. MIGRATION SEMANTICS (recorded, the
  // powerResponse precedent): pre-386 blobs persisted fixture:
  // 'canopy_panel' whether or not the player ever touched it (persist()
  // writes the full blob), so on an install without THIS key a canopy
  // fixture is ambiguous and resolves to the venue default (the owner
  // order: every class gets its right lamp), while a persisted NON-canopy
  // fixture is unambiguous evidence of an explicit pick and stays
  // explicit (review GH-386 r1 P2 — load() below). An explicit post-386
  // pick persists fixtureAuto:false and survives every reload.
  fixtureAuto: true,
  brightness: 1,
  // Power-response curve (issue GH-142 — VISUAL/INPUT-ONLY, additive key):
  // how the two slider-fraction seams (aimwidgets aw-track, touchwidgets
  // gauge) map travel x to v0. 'perceptual' = powerCurve's x^γ taper
  // (see POWER_CURVE_GAMMA below); 'linear' = the exact pre-GH-142 mapping
  // (muscle-memory protection + on-device A/B). MIGRATION SEMANTICS
  // (recorded, owner-approved): existing installs without the key resolve
  // to THIS default on upgrade — the feel change for existing muscle
  // memory is intentional (the owner A/Bs on device; Linear is one toggle
  // away). #power's VALUE stays the true v0 everywhere (codec/replay/
  // scripted seams never see the curve).
  powerResponse: 'perceptual',
  // Cloth color override (issue GH-229 — VISUAL-ONLY, the look/fixture
  // precedent: a color key LAYERED on the cloth axis, never an
  // equipment-tuple axis, never codec/kernel-visible; the cloth TYPE stays
  // the physics axis). '' IS the active cloth's own calibrated factory base
  // (the identity default — zero drift on every existing capture; an absent
  // key resolves here). A curated color id re-tints the felt and re-derives
  // every cloth-aware dependent (the GH-59/GH-199/GH-227 assist inks, the
  // GH-198 env re-bake) through scene/table.js's feature-detected
  // setClothColor seam. Replays render the VIEWER's color (no transient
  // path — the look/lighting law).
  clothColor: '',
});

/** The pre-rename app-default ids (#789): each is the ui_hidden +
 * superseded_by twin of its DEFAULTS.equipment id in the served catalog.
 * A returning browser can pair this module with a stale cached SDK catalog
 * or kernel that does not know the neutral ids yet (the ownership ledger mixed-cache
 * contract); appDefaultEquipment serves these for such an axis instead. */
const LEGACY_DEFAULT_EQUIPMENT = Object.freeze({
  table_id: 'diamond_proam_9ft',
  cloth_id: 'simonis_860_tournament',
  ballset_id: 'aramith_pool',
});

/** The five lighting fixture ids (issue #89 + the GH-386 carom luminaire)
 * — MIRROR of the leaf module's FIXTURE_IDS (scene/lightingvisuals.js is
 * reached only via the guarded window.__lighting seam, so the registry is
 * duplicated here on purpose — the SETTINGS_KEY duplicated-literal law).
 * Change them together. */
const FIXTURE_IDS = ['canopy_panel', 'perimeter_ring', 'pendant_bar',
  'snooker_luminaire', 'carom_luminaire'];
/** The six curated cloth colors (issue GH-229) — MIRROR of the scene
 * registry (scene/clothvisuals.js CLOTH_COLORS is reached only via guarded
 * dynamic import, so the id list is duplicated here on purpose — the
 * FIXTURE_IDS duplicated-literal law). Change them together. */
const CLOTH_COLOR_IDS = ['tournament_blue', 'classic_green', 'snooker_green',
  'burgundy', 'steel_gray', 'camel'];
const BRIGHTNESS_MIN = 0.6, BRIGHTNESS_MAX = 1.4;
// (the WPA_LUX slider-readout constant moved to the atelier's lighting
// station with the pane — feature 032; the load-path clamp above stays)

/** The three session modes (issue #68) — the mode selector's registry. */
const MODE_IDS = ['play', 'practice', 'playground'];

// ---- power-response curve (issue GH-142) --------------------------------------
/** #power slider parity (FR-005): 0.5–12 m/s, deliberately duplicated BY
 * HAND from aim.js:36 / touchwidgets.js:29 (the SETTINGS_KEY duplicated-
 * literal law — no new cross-module constant import on the boot graph;
 * comments at both sites cross-point). Change all three together. */
const POWER_MIN = 0.5;
const POWER_MAX = 12;
/** The ONE feel constant (owner A/B parameter — issue GH-142 item 1).
 * Rationale (recorded, owner-approved 2026-07-23): the player controls
 * power through the VISUAL OUTCOME channel (resulting ball speed /
 * distance), which follows Weber's law — a roughly constant ~5–8 %
 * RELATIVE JND for speed — so equal slider travel should produce equal
 * speed RATIOS, not equal m/s increments; rolling distance d ∝ v² doubles
 * the argument (a linear-in-v bar squeezes all position-play softness
 * into its bottom band). Same shape as the audio-taper industry standard:
 * Microsoft Win32 audio-tapered volume docs, Discord's perceptual volume
 * library, and the dr-lex.be volume-control guide all replace linear
 * sliders with a power/log taper for the same perceptual reason.
 * γ = 2.0 chosen over an exponential taper: it reaches the exact rail
 * floor (no vmin discontinuity), is trivially invertible, and is
 * near-identical to an exponential with dynamic range R ≈ 20–22 over the
 * useful span. TOP-END GUARDRAIL (issue GH-142 item 2, verified): the break
 * region v > 0.7·POWER_MAX = 8.4 m/s occupies x > √((8.4−0.5)/11.5)
 * ≈ 0.829, i.e. ~17.1 % of slider travel — inside the required 15–20 %
 * floor (the pure vmax·x² form gives ~16.3 %; the affine-span form below
 * keeps the exact 0.5/12 endpoints AND the guardrail). Retune here only;
 * e2e-touch S22 mirrors this constant (POWER_GAMMA) like GAUGE_PAD. */
const POWER_CURVE_GAMMA = 2.0;
/** The valid persisted values for `powerResponse` (loud load sanitation). */
const POWER_RESPONSES = ['perceptual', 'linear'];
/** THE one curve (issue GH-142 item 3 — single seam): slider-travel fraction
 * x ∈ [0, 1] → v0 [m/s]. 'perceptual' (default) is the x^γ taper over the
 * 0.5–12 span; 'linear' is byte-exact the pre-GH-142 mapping. Endpoints are
 * EXACT in both modes: powerCurve(0) = 0.5, powerCurve(1) = 12 (FR-005
 * rail-end saturation; e2e-touch S7). Consumed only where a POSITION
 * FRACTION becomes v0 — every direct-velocity path (native #power slider,
 * wheel/arrow nudges, __aim.setPowerBar, scripted __test.shoot fire seams,
 * share codec/replay) stays in v-space and never sees it. */
function powerCurve(x, mode) {
  x = Math.min(1, Math.max(0, x));
  const f = mode === 'linear' ? x : Math.pow(x, POWER_CURVE_GAMMA);
  return POWER_MIN + f * (POWER_MAX - POWER_MIN);
}
/** Exact inverse of powerCurve (fill/readout painting on both widgets). */
function powerCurveInv(v, mode) {
  const f = (Math.min(POWER_MAX, Math.max(POWER_MIN, v)) - POWER_MIN)
    / (POWER_MAX - POWER_MIN);
  return mode === 'linear' ? f : Math.pow(f, 1 / POWER_CURVE_GAMMA);
}
/** THE write-time quantization law (issue GH-184): the old flat 0.1
 * quantize-at-write was a 5–10 % value jump at 1–2 m/s — at or above the
 * ~5–8 % relative speed JND the perceptual curve is built on (see the
 * POWER_CURVE_GAMMA rationale) — destroying exactly the fine adjustments
 * the curve creates. Perceptual mode therefore releases onto a PIECEWISE
 * DECADE GRID (issue GH-184 option c; chosen over an x-space or geometric
 * grid because every committed value stays a SHORT EXACT DECIMAL — the
 * readout-truth law can print the value verbatim, the #power range
 * sanitizer composes via the step pin below, and scripted/e2e closed loops
 * keep exact targets):
 *   step 0.01 for v < 2        (1.25 % of v at 0.8, 0.67 % at 1.5)
 *   step 0.05 for 2 ≤ v < 3    (2.5 % at 2.0, 1.7 % at 2.95)
 *   step 0.1  for v ≥ 3        (3.3 % at 3.0, 1.7 % at 6, 0.83 % at 12)
 * — the relative step stays ≤ 3.3 % of v everywhere (under half the JND),
 * and the grid's decimals boundary coincides with the honest-readout law
 * (2 decimals below 3 m/s, 1 at/above). Integer-scaled rounding keeps every
 * grid value f64-exact (String(v) prints the short decimal). LINEAR mode
 * keeps the pre-184 0.1 rounding BYTE-EXACT (muscle memory + the
 * scripted-seam pins). Consumed by the two fraction seams AT THE WRITE
 * (the GH-70/GH-142 unquantized x-accumulators are untouched); mirrored in
 * e2e-touch.mjs `quantV` (the POWER_GAMMA two-file-retune law). */
function powerQuant(v, mode) {
  v = Math.min(POWER_MAX, Math.max(POWER_MIN, v));
  if (mode === 'linear' || v >= 3) return Math.round(v * 10) / 10;
  return v < 2 ? Math.round(v * 100) / 100 : Math.round(v * 20) / 20;
}

/** The five picker axes — panel labels come from t('settings.axis.<axis>'),
 * calibration badges from t('settings.badge.<kind>') per catalog entry. */
const AXES = ['table_id', 'cloth_id', 'ballset_id', 'cue_id', 'cushion_model_id'];

// pre-equipment saves carried a physics preset + cloth — fold both into the
// equipment spec (the preset was always the cushion-model axis in disguise;
// same mapping the share codec uses for v1/v2 links)
const LEGACY_PRESET_TO_MODEL = {
  default: 'han2005_default',
  realistic: 'stronge_realistic',
  'mathavan-fitted': 'mathavan_fitted',
  'grip-fitted': 'grip_fitted',
};

// #87 component 4 (preset dispositions, owner-approved plan): catalog ids
// DEMOTED from NEW selection at the UI layer ONLY. The kernel keeps the
// model and the catalog entry stays validation-visible (deliberately NOT
// ui_hidden: sanitizeSpec's load path must keep honoring a persisted
// selection — grandfathering; flipping ui_hidden would silently migrate
// existing profiles). Legacy share links keep replaying through the sdk
// legacyEquipment mapping (PresetId 'grip-fitted' → setTransientEquipment,
// which never consults this registry), and the programmatic
// __settings.changeEquipment pin stays sanctioned for scripted/e2e boots
// (the ui_hidden-table precedent). ONLY the picker option list drops the
// id — since feature 032 the picker surfaces are the atelier's option
// rows + ctx.cueSwap.options (same uiDemoted mechanism, below).
// grip_fitted: corroborated SUSPECT in three independent measurement
// frames — generalization-audit Jewett speed-independence gate; paper
// experiment C1 through-diamond banks (shorter than every measured
// TP B.28 table at shallow aims, with reversed speed dependence); paper
// experiment C3 kick-window breach at 3 m/s full english
// (the #87 generalization audit, component 4 addendum).
// pool_pro_9ft_measured: the measured-response table leaves every
// selection surface (the entry-22 directive). UI demotion ONLY: its
// catalog Measured entry, its record-tier anchors
// (tests/anchors_pool_9ft_measured.rs) and the calibration dossier (the
// internal calibration record) stay the canonical physics/provenance
// record; persisted-current saves, replay-pinned specs
// (setTransientEquipment never consults this registry) and
// the scripted changeEquipment pin keep resolving — the grip_fitted
// grandfathering above verbatim (NOT ui_hidden: flipping it would migrate
// existing saves AND break the games-catalog invariant that every
// non-ui_hidden table is selectable for some game). The table axis is
// FILTERED by the atelier's own `demoted` mirror (atelier.js — change
// together) and asserted by e2e-ui auditShellChrome's expected-table list.
// Contract: the atelier contract (feature 032, internal) §7 entry 22.
// pool_worsted_measured: the companion ruling A on the entry-22 flag: the
// same session's Measured CLOTH entry follows the same directive and the
// same precedent verbatim — UI demotion only, grandfathered while
// current/record-pinned, calibration lineage
// (pool_9ft_measured_cloth_friction anchor + the same dossier) stays
// canonical. The preview.stage backstop below is registry-driven and
// covers this axis with no further code. Contract: atelier.md §7 entry 23.
const UI_DEMOTED = Object.freeze({
  cushion_model_id: Object.freeze(['grip_fitted']),
  table_id: Object.freeze(['pool_pro_9ft_measured']),
  cloth_id: Object.freeze(['pool_worsted_measured']),
});
// Catalog v14 (issue GH-283 decision 2): an entry carrying `superseded_by`
// (it names the entry's byte-identical neutral twin) is demoted EXACTLY
// like UI_DEMOTED — dropped from NEW selection, kept while it IS the
// current spec value, unless it is also ui_hidden (never listed for NEW
// selection; ctx.cueSwap still lists a hidden CURRENT cue, #789). On the
// load path sanitizeSpec renames an entry carrying BOTH ui_hidden and
// `superseded_by` to its live twin (migratedEquipmentId; the branded cues
// become their pro_ld_pivot_* twins), so a persisted save keeps only a
// `superseded_by`-alone entry, and a replay-pinned sender spec keeps its
// ids as sent. The programmatic changeEquipment pin stays sanctioned (the
// grip_fitted precedent). Field feature-detect: a stale catalog without
// `superseded_by` demotes nothing extra. #789: a retired digest-row id (a
// stale SDK can still list its row) is demoted the same way (the atelier's
// digest filter mirrors this; change together).
const uiDemoted = (axis, id) => (UI_DEMOTED[axis]?.includes(id) ?? false)
  || !!catalogEntry(axis, id)?.superseded_by || equipmentDigestTwin(axis, id) !== null;

const ASSIST_LEVELS = ['off', 'standard', 'practice'];
// pre-integration saves used 'basic'/'full' — map onto the preview levels
const ASSIST_MIGRATE = { basic: 'standard', full: 'practice' };
/** The four assist-line contrast levels (issue GH-417) — MIRROR of the
 * previewink.js CONTRAST_LEVELS keys (that leaf is reached only by guarded
 * dynamic import, so the registry is duplicated here on purpose — the
 * FIXTURE_IDS duplicated-literal law). Change them together. */
const ASSIST_CONTRAST_LEVELS = ['low', 'standard', 'high', 'maximum'];

// ---- per-game equipment pairing (feature 012 US4/T049) ---------------------
// Each PLAYABLE discipline keeps its OWN persisted equipment spec
// (`equipmentByGame` in the same blob); switching disciplines adopts the
// target's saved spec — or its cited pairing default on first visit — and
// never leaks the previous game's leftovers (spec edge case "switching
// disciplines mid-session preserves each discipline's persisted equipment
// pairing"). The blob's top-level `equipment` stays the ACTIVE game's spec
// so pre-012 readers (scene/table.js resolveBootTableId, the e2e suites)
// keep working unchanged.

/** Cited per-discipline cloth pairings (research.md R8) — the cloth axis is
 * not part of a GameEntry, so the pairing default lives here: snooker plays
 * on the Mathavan-cited napped wool, carom on the heated worsted entry. */
const DISCIPLINE_CLOTH = Object.freeze({
  snooker: 'snooker_napped',
  carom: 'carom_worsted_heated',
});

/** GH-491 review r3/r4 P1 (the GH-382 cache-poison degrade on the GAME
 * axis): is heyball offered by this boot's chain? MODULE-scoped — the
 * changeGame backstop (createSettings api) and the selection surfaces
 * (buildPanel) share the one verdict. Initialized + settle-updated in
 * buildPanel (createSettings runs after createFlow — main.js order —
 * so ctx.rulesBackendReady / rulesCapabilities are already published
 * by a fresh flow when it reads them). */
let heyballOffered = false;

/** Cited per-GAME cloth overrides (GH-491 review r3 P1): heyball is
 * pool-FAMILY but plays on napped wool — the FR-015 Joy Q8 pairing
 * (research.md: manufacturer ships Strachan; 2025 Asian Heyball Open used
 * LiberWin; `snooker_napped` is the nearest CITED napped parameter set).
 * Without this row the pool fall-through left the worsted pool cloth
 * under the default heyball rack — wrong friction coefficients. */
const GAME_CLOTH = Object.freeze({
  heyball: 'snooker_napped',
});

/** Legal table ids for a game (game-catalog `table_class`, research.md
 * R12 / FR-015): the GameEntry enumerates the ONLY tables its discipline
 * plays on (pool = the 9-ft class + chinese8_pro_9ft; snooker/carom are locked
 * to their single kernel-paired table). ENFORCED on the equipment axis:
 * game.js composes snooker/carom racks on the kernel's kind-locked default
 * pairing and pool racks carry no pocket re-validation, so an out-of-class
 * table splits the VISUAL table from the physics (22-ball snooker rack
 * rendered beyond a 9-ft table's cushions) or composes a pool rack on the
 * pocketless carom table (unwinnable — one-pocket's foot-pocket indices
 * don't exist). Returns null when the game or its class is unknown
 * (no restriction — stale-games-module fallback). */
function legalTableIds(gameId) {
  try {
    const tc = getGameEntry(gameId).table_class;
    return tc.kind === 'catalog' ? tc.table_ids : null;
  } catch { return null; }
}

/** #789 mixed-cache degrade: whether the LOADED kernel's catalog lists `id`
 * on `axis`, directly or through one of the kernel's own alias digest rows
 * whose twin the list holds (the SDK's rule: a digest row counts only when
 * its target entry exists) — true / false, or null (no verdict) when the
 * glue export is missing, the glue is not initialised yet, or the axis has
 * no list. A kernel without the digest export (or a leaf without
 * aliasDigestTarget) answers from its list alone. Only a successful read is
 * memoised. */
let kernelCatalogMemo = null;
let kernelAliasMemo = null;
/** The loaded kernel's catalog entries on `axis`, or null (no verdict) under
 * the same conditions; shared by kernelEquipmentKnown and the superseded_by
 * reverse of equipmentTwinCandidates. */
function kernelCatalogList(axis) {
  const key = sdk.EQUIPMENT_AXES?.[axis];
  if (!key) return null;
  if (!kernelCatalogMemo) {
    try {
      if (typeof poolWasm.catalog_json !== 'function') return null;
      kernelCatalogMemo = JSON.parse(poolWasm.catalog_json());
    } catch { return null; }
  }
  const list = kernelCatalogMemo?.[key];
  return Array.isArray(list) ? list : null;
}
/** The loaded kernel's alias digest rows (catalog_alias_digests_json,
 * feature-detected), or null when the export is missing or unreadable. */
function kernelAliasRows() {
  if (!kernelAliasMemo) {
    try {
      if (typeof poolWasm.catalog_alias_digests_json !== 'function') return null;
      const rows = JSON.parse(poolWasm.catalog_alias_digests_json());
      if (!Array.isArray(rows)) return null;
      kernelAliasMemo = rows;
    } catch { return null; }
  }
  return kernelAliasMemo;
}
function kernelEquipmentKnown(axis, id) {
  const list = kernelCatalogList(axis);
  if (!list) return null;
  if (list.some((e) => e?.id === id)) return true;
  const rows = kernelAliasRows();
  if (!rows || typeof equipmentAlias.aliasDigestTarget !== 'function') return false;
  let target;
  try { target = equipmentAlias.aliasDigestTarget(rows, axis, id); } catch { return false; }
  return typeof target === 'string' && list.some((e) => e?.id === target);
}

/** DEFAULTS.equipment gated on what the loaded siblings support (#789,
 * the ownership ledger mixed-cache contract): every axis goes through
 * equipmentSupported, and an axis whose default id a loaded sibling (the SDK
 * catalog, the kernel, or the scene's resolvesTable probe) rejects takes the
 * predicate's twin (for the renamed defaults, LEGACY_DEFAULT_EQUIPMENT), with
 * one console note per axis; an axis with no twin keeps its default id. With
 * a `held` object, each degraded axis records { saved: the default id, shown:
 * the twin, reason } there (a first-visit pairing holds it, never saves the
 * twin as the choice). All siblings fresh = a copy of DEFAULTS.equipment. */
const equipmentDegradeNoted = new Set();
/** #789: set once this module has met a stale sibling (an app-default axis
 * the loaded SDK catalog, kernel or scene lacks, or a sibling-rejected id in
 * sanitizeSpec). bootWriteBack then keeps the saved blob as it is: a
 * temporary cache mismatch must never overwrite the saved choice. */
let staleSiblingSeen = false;
function appDefaultEquipment(held = null) {
  const spec = { ...DEFAULTS.equipment };
  for (const [kind, axis] of Object.entries(EQUIPMENT_KIND_AXIS)) {
    const v = equipmentSupported(spec[axis], kind);
    if (v.ok) continue;
    staleSiblingSeen = true;
    if (v.twin === null) continue;
    if (!equipmentDegradeNoted.has(axis)) {
      equipmentDegradeNoted.add(axis);
      console.warn(`[settings] default ${v.reason} — keeping ${v.twin}`);
    }
    if (held) held[axis] = { saved: spec[axis], shown: v.twin, reason: v.reason };
    spec[axis] = v.twin;
  }
  return spec;
}

/** The predicate's kinds -> the equipment axis each one names. */
const EQUIPMENT_KIND_AXIS = Object.freeze({
  table: 'table_id', cloth: 'cloth_id', ballset: 'ballset_id',
  cushion: 'cushion_model_id', cue: 'cue_id',
});

/** #789 a retired digest-row id's twin (equipmentalias.js canonicalEquipmentId,
 * feature-detected) when it differs from the id; null otherwise. */
function equipmentDigestTwin(axis, id) {
  if (typeof id !== 'string') return null;
  const c = equipmentAlias.canonicalEquipmentId?.(axis, id) ?? id;
  return c !== id ? c : null;
}

/** #789 the id whose render (station asset, live painter) stands for `id`:
 * the loaded kernel catalog row's superseded_by (a stale SDK row of a
 * retired id may lack it; the kernel row carries it), else the digest twin,
 * else the id itself. Feature-detected reads; never throws. */
function equipmentMediaId(axis, id) {
  if (typeof id !== 'string') return id;
  try {
    const newer = (kernelCatalogList(axis) ?? []).find((e) => e?.id === id)?.superseded_by;
    if (typeof newer === 'string' && newer) return newer;
    return equipmentDigestTwin(axis, id) ?? id;
  } catch { return id; }
}

/** #789 the SDK axis of equipmentSupported: the loaded SDK catalog has the
 * entry (true), or, for a retired digest-row id (the leaf's
 * canonicalEquipmentId differs), the loaded SDK's validateEquipmentIds
 * accepts it on this axis over DEFAULT_EQUIPMENT (both feature-detected; a
 * throw = false); otherwise false, or null when there is no catalog. */
function sdkEquipmentKnown(axis, id) {
  let entry = null;
  try { entry = typeof catalogEntry === 'function' ? catalogEntry(axis, id) ?? false : null; } catch { entry = null; }
  if (entry !== false) return entry === null ? null : true;
  if (equipmentDigestTwin(axis, id) === null) return false;
  if (typeof sdk.validateEquipmentIds !== 'function' || !sdk.DEFAULT_EQUIPMENT) return false;
  try { sdk.validateEquipmentIds({ ...sdk.DEFAULT_EQUIPMENT, [axis]: id }); return true; } catch { return false; }
}

/** #789 scene axis of equipmentSupported: can the LOADED scene build table
 * `id`? true / false, or null (no verdict). The probe is the additive
 * `resolvesTable` method on the table build handle the app already holds
 * (main.js hands it over as ctx.tableBuild; window.__tableBuild is the
 * existing seam set() already falls back to), feature-detected per use: the
 * the ownership ledger rule-5 corollary ("Reach new exports via `import * as ns` +
 * feature detection ... with a working degrade path"), the same form as the
 * handle's activeGeom / syncEnvExtent capabilities. scene/table.js cannot be
 * imported here (the cache-poison rule; TABLE_SPECS is out of reach). No
 * handle yet = no verdict. A handle without the probe is a pre-rename scene:
 * its TABLE_SPECS holds the pre-rename ids only, so a pre-rename id
 * (a TABLE_RENAMES key, or a retired id a digest row maps) is buildable, a
 * neutral id (a TABLE_RENAMES value or a digest-row twin) is not, and any
 * other id has no verdict. */
function sceneTableVerdict(id, scene) {
  if (!scene || (typeof scene !== 'object' && typeof scene !== 'function')) return null;
  if (typeof scene.resolvesTable === 'function') {
    try { return typeof scene.resolvesTable(id) === 'string'; } catch { return null; }
  }
  const renames = equipmentAlias.TABLE_RENAMES ?? {};
  if (Object.hasOwn(renames, id)) return true;
  if (equipmentDigestTwin('table_id', id) !== null) return true;
  if (Object.values(renames).includes(id)) return false;
  const digests = Array.isArray(equipmentAlias.ALIAS_DIGESTS) ? equipmentAlias.ALIAS_DIGESTS : [];
  return digests.some((r) => r?.axis === 'table' && r.neutral_id === id) ? false : null;
}

/** The twin candidates of `id` on `axis`, in the ruled order: the id
 * itself, its pre-rename table id (TABLE_RENAMES reversed), the entries
 * whose superseded_by names it in the loaded SDK catalog and then in the
 * loaded kernel catalog (either sibling may be the stale one) together with,
 * for a digest-row twin, the entries of those lists a leaf digest row maps
 * to it (a stale sibling lists the retired id itself), then the
 * axis's pre-rename app default (LEGACY_DEFAULT_EQUIPMENT) unless `legacy` is
 * false (the rename twins alone, sanitizeSpec). No duplicates. */
function equipmentTwinCandidates(axis, id, legacy = true) {
  const out = [id];
  const add = (c) => { if (typeof c === 'string' && !out.includes(c)) out.push(c); };
  if (axis === 'table_id') {
    const renames = equipmentAlias.TABLE_RENAMES ?? {};
    for (const old of Object.keys(renames)) if (renames[old] === id) add(old);
  }
  let sdkList = [];
  try { sdkList = catalogEntries(axis) ?? []; } catch { sdkList = []; }
  const digests = Array.isArray(equipmentAlias.ALIAS_DIGESTS) ? equipmentAlias.ALIAS_DIGESTS : [];
  const kernelAxis = typeof axis === 'string' ? axis.replace(/_id$/, '') : '';
  const digestTwin = typeof equipmentAlias.aliasDigestTarget === 'function'
    && digests.some((r) => r?.axis === kernelAxis && r.neutral_id === id);
  for (const list of [sdkList, kernelCatalogList(axis) ?? []]) {
    for (const e of Array.isArray(list) ? list : []) {
      if (e?.superseded_by === id) add(e.id);
      if (digestTwin && typeof e?.id === 'string'
        && equipmentAlias.aliasDigestTarget(digests, axis, e.id) === id) add(e.id);
    }
  }
  if (legacy) add(LEGACY_DEFAULT_EQUIPMENT[axis]);
  return out;
}

/** #789: whether table `id` is in the game class `legal` (a table_ids list;
 * null = no restriction) through the twins the predicate resolves: the id,
 * its pre-rename twins (equipmentTwinCandidates without the legacy default:
 * a stale games class lists the old id) and its renamed twin (a stale SDK
 * catalog offers the old id under a fresh class). sanitizeSpec's class check
 * accepts the same pairs. The one class test of every interactive path:
 * changeEquipment, preview.stage and the atelier's card legality
 * (api.tableInClass). */
function tableInClass(legal, id) {
  if (!legal) return true;
  const twins = equipmentTwinCandidates('table_id', id, false);
  const renamed = equipmentAlias.renamedTableId?.(id);
  if (typeof renamed === 'string') twins.push(renamed);
  return twins.some((t) => legal.includes(t));
}

/** #789 THE equipment-support predicate (mixed-cache contract): may the
 * loaded siblings play `id` of `kind` (table | cloth | ballset | cushion |
 * cue)? Each axis verdict is true / false / null (no verdict): sdkCatalog
 * (the loaded SDK catalog has the entry or accepts the digest-row id,
 * sdkEquipmentKnown), kernelIds (the loaded kernel's catalog lists it or
 * maps it through its own digest rows, kernelEquipmentKnown) and
 * sceneSpecs (tables only, the loaded scene builds it, sceneTableVerdict).
 * `ok` = no axis says false.
 * `twin` = the first equipmentTwinCandidates entry no axis rejects (`id`
 * itself when ok), or null = refuse. `reason` names the rejecting axes of
 * `id` (null when ok). `axes.scene` overrides the scene handle probed
 * (default: the held table build handle). Pure: it never persists, notes,
 * or marks a stale sibling; the caller decides what a degrade does. */
function equipmentSupported(id, kind, axes = {}) {
  const axis = EQUIPMENT_KIND_AXIS[kind];
  const none = { sdkCatalog: null, kernelIds: null, sceneSpecs: null };
  if (!axis) return { ok: false, verdict: none, twin: null, reason: `unknown equipment kind ${kind}` };
  if (typeof id !== 'string' || !id) return { ok: false, verdict: none, twin: null, reason: `no ${axis}` };
  const scene = axes && Object.hasOwn(axes, 'scene') ? axes.scene
    : ctx.tableBuild ?? (typeof window === 'undefined' ? null : window.__tableBuild);
  const judge = (c) => ({
    sdkCatalog: sdkEquipmentKnown(axis, c),
    kernelIds: kernelEquipmentKnown(axis, c),
    sceneSpecs: axis === 'table_id' ? sceneTableVerdict(c, scene) : null,
  });
  const passes = (v) => v.sdkCatalog !== false && v.kernelIds !== false && v.sceneSpecs !== false;
  const verdict = judge(id);
  if (passes(verdict)) return { ok: true, verdict, twin: id, reason: null };
  const why = [verdict.sdkCatalog === false ? 'the loaded SDK catalog' : '',
    verdict.kernelIds === false ? 'the loaded kernel' : '',
    verdict.sceneSpecs === false ? 'the loaded scene' : ''].filter(Boolean).join(', ');
  const twin = equipmentTwinCandidates(axis, id).slice(1).find((c) => passes(judge(c))) ?? null;
  return { ok: false, verdict, twin, reason: `${axis} ${id} is unknown to ${why}` };
}

/** #789 the commit gate of set(): every axis of `spec` through
 * equipmentSupported BEFORE the table is prepared or anything persists. An
 * id is judged as given, then by its canonical id (a retired digest-row id is
 * the table or cloth the scene builds for it), and kept as requested when
 * either passes. An
 * axis in `chosen` (the axes the user picked in this commit) that the loaded
 * siblings reject refuses the whole commit, and so does any rejected axis
 * without a twin; any other rejected axis degrades to its twin and is
 * returned in `degraded` ({ saved: the requested id, shown: the twin,
 * reason }), which the commit records as a hold, never as the choice.
 * `notes` discloses a chosen id the loaded kernel marks superseded by a twin
 * the loaded SDK catalog lacks (a pre-rename pick under a stale catalog).
 * `axes.verbatim` (a replay, setTransientEquipment): no axis ever degrades,
 * since a replay re-simulates on the sender's ids and no twin is a
 * physics equivalent. A rejected id the loaded kernel lists (and, for a
 * table, the loaded scene builds) is kept as given, its SDK catalog miss
 * disclosed in `notes` (labels never show the id: equipmentDisplayName names
 * a digest hit as the twin's name marked as a legacy alias); any other
 * rejected id refuses.
 * `axes.inherited` (the tuple Continue inherited from a replay, axis -> id):
 * an axis outside `chosen` that still carries its inherited id is judged by
 * the verbatim rule, since the session plays on as recorded; an inherited id
 * the verbatim rule would refuse is judged in ordinary mode.
 * Pure: { ok: true, spec, degraded, notes } or { ok: false, axis, id,
 * reason }. */
function equipmentCommitGate(spec, chosen = [], axes = {}) {
  const out = { ...spec };
  const degraded = {};
  const notes = [];
  for (const [kind, axis] of Object.entries(EQUIPMENT_KIND_AXIS)) {
    const id = out[axis];
    if (typeof id !== 'string') continue;
    // the id as given first (a stale sibling knows a pre-rename id itself);
    // then its canonical id (a retired digest id plays as its neutral twin)
    let v = equipmentSupported(id, kind, axes);
    const canonical = equipmentAlias.canonicalEquipmentId?.(axis, id) ?? id;
    let w = null;
    if (!v.ok && canonical !== id) {
      w = equipmentSupported(canonical, kind, axes);
      if (w.ok) v = w;
    }
    const inherited = !chosen.includes(axis) && axes.inherited?.[axis] === id;
    if (!v.ok && (axes.verbatim || inherited)) {
      const known = [v, w].some((c) => c?.verdict.kernelIds === true && c.verdict.sceneSpecs !== false);
      if (!known && axes.verbatim) return { ok: false, axis, id, reason: v.reason };
      if (known) {
        if (v.verdict.sdkCatalog === false) {
          notes.push(`${axis} ${id} plays as recorded: the loaded kernel lists it, the loaded SDK catalog lacks it`);
        }
        continue;
      }
    }
    if (!v.ok && (chosen.includes(axis) || v.twin === null)) return { ok: false, axis, id, reason: v.reason };
    if (!v.ok) {
      out[axis] = v.twin;
      degraded[axis] = { saved: id, shown: v.twin, reason: v.reason };
      continue;
    }
    const newer = chosen.includes(axis)
      ? (kernelCatalogList(axis) ?? []).find((e) => e?.id === id)?.superseded_by : undefined;
    if (typeof newer === 'string' && !catalogEntry(axis, newer)) {
      notes.push(`${axis} ${id} is the pre-rename id of ${newer}, which the loaded SDK catalog lacks`);
    }
  }
  return { ok: true, spec: out, degraded, notes };
}

/** Pairing DEFAULT for a game, derived mechanically from the catalogs:
 * pool disciplines (9-ball / 8-ball / one-pocket) keep the app-default
 * composition; non-pool disciplines pair their table class's first entry
 * (snooker → wpbsa_snooker_12ft + 52.5 mm set, carom → umb_carom_284 +
 * 61.5 mm set once their US4 readiness flips land), the entry's
 * recommended cushion model, the discipline cloth above, and — catalog
 * v14, issue GH-283 decision 1 — the discipline's default CUE from the SDK's
 * DISCIPLINE_DEFAULT_CUE_IDS map (snooker → snooker_ash, carom →
 * carom_conical; the map's pool → standard IS the app default the early
 * return already carries, so the two paths agree). Every derived id goes
 * through equipmentSupported (#789: the loaded SDK catalog, kernel and
 * scene; the heyball ballset too): a rejected id takes the predicate's twin
 * (a table twin only inside the class), else the app default's axis stays.
 * With a `held` object, each degraded axis records { saved, shown, reason }
 * there (appDefaultEquipment's contract). First-visit only by construction: set('game') consults
 * this ONLY when equipmentByGame has no persisted spec for the target
 * discipline, so an existing per-game choice always wins. GH-1042: the
 * snooker/carom KERNEL racks compose on this selected spec (game.js
 * composeRack: its table is in the entry's class; off-class racks take
 * the kernel pairing with the selected cue), so the adopted cue drives
 * the SELECTION surfaces (picker, miscue disc/dial) and the strike; the
 * kernel's no-spec pairing stays on cue 'standard' (catalog.rs note);
 * e2e-settings D2c and D2g gate the selection and the strike. */
function defaultEquipmentFor(gameId, held = null) {
  const base = appDefaultEquipment(held);
  let entry;
  try { entry = getGameEntry(gameId); } catch { return { ...base }; }
  // GH-491: the early return applies only when the app-default TABLE is
  // itself IN the entry's class — heyball is pool-family but its class is
  // the Chinese eight-ball table alone (chinese8_pro_9ft, WPA Heyball II.3(a)),
  // so it derives its pairing from the class below exactly like the
  // non-pool disciplines (sanitizeSpec's class enforcement needs an
  // in-class base, its documented construction). Every pre-491 entry
  // keeps its byte-identical path: the 9-ft pool classes contain the app
  // default, and snooker/carom never took the pool early return.
  // #789: a stale games class carries the pre-rename table id, which the
  // gated base then holds under a stale kernel (appDefaultEquipment), so it
  // matches too; under a fresh kernel the class lists the TABLE_RENAMES twin
  // of the app default and the gated base keeps the neutral id (scene/table.js
  // bootClassDefaultTableId mirrored: both sides play the same table).
  const renames = equipmentAlias.TABLE_RENAMES ?? {};
  if (entry.table_class.kind !== 'catalog'
    || entry.table_class.table_ids.includes(DEFAULTS.equipment.table_id)
    || entry.table_class.table_ids.includes(base.table_id)
    || entry.table_class.table_ids.some((t) => renames[t] === DEFAULTS.equipment.table_id)) {
    return { ...base };
  }
  const spec = { ...base };
  // #789: a derived id the loaded siblings reject plays its twin (held, never
  // the choice); no twin (or an out-of-class table twin) keeps the base axis
  const derive = (kind, id, legal = () => true) => {
    const v = equipmentSupported(id, kind);
    if (v.ok) return { id, hold: null };
    staleSiblingSeen = true;
    if (v.twin !== null && !equipmentDegradeNoted.has(`${gameId} ${kind}`)) {
      equipmentDegradeNoted.add(`${gameId} ${kind}`);
      console.warn(`[settings] ${gameId} pairing ${v.reason} — `
        + (legal(v.twin) ? `playing ${v.twin}` : `keeping the default ${kind}`));
    }
    return v.twin !== null && legal(v.twin)
      ? { id: v.twin, hold: { saved: id, shown: v.twin, reason: v.reason } } : { id: null, hold: null };
  };
  const take = (axis, d) => {
    if (d.id === null) return;
    spec[axis] = d.id;
    if (held && d.hold) held[axis] = d.hold;
    else if (held) delete held[axis];
  };
  const classIds = entry.table_class.table_ids;
  const table = derive('table', classIds[0], (t) => classIds.includes(t) || classIds.includes(renames[t]));
  const te = table.id === null ? null : catalogEntry('table_id', table.id);
  if (te && (!te.ui_hidden || table.hold)) {
    take('table_id', table);
    const rec = te.recommended_cushion_model_id;
    if (rec) take('cushion_model_id', derive('cushion', rec));
  }
  const cloth = GAME_CLOTH[gameId] ?? DISCIPLINE_CLOTH[entry.discipline_family];
  if (cloth) take('cloth_id', derive('cloth', cloth));
  const ballset = entry.ballset_ids[0];
  if (ballset) take('ballset_id', derive('ballset', ballset));
  // feature-detected on the NAMESPACE binding (rule-5 corollary, import
  // note above): a stale pool-sdk has no map → the standard-cue pre-v14
  // pairing stands. The id still goes through the predicate.
  const cue = sdk.DISCIPLINE_DEFAULT_CUE_IDS?.[entry.discipline_family];
  if (cue) take('cue_id', derive('cue', cue));
  return spec;
}

/** #789 the display name of an equipped id (a verbatim replay can leave a
 * retired digest-row id in the store): its locale name; else, for a digest
 * hit, the twin's name marked as a legacy alias (the raw id never reaches UI
 * copy); else the catalog display name; else '—', with the id named on the
 * console only. The alias template is judged on the ACTIVE dictionary (the
 * webKeyOk form of the GH-313 hasLocal law: an i18n.js without hasLocal
 * trusts has() only when en is the active locale); a stale dictionary
 * without it shows the twin's name alone, never an English suffix. */
function equipmentDisplayName(axis, id) {
  if (typeof id !== 'string' || !id) return '—';
  if (has(`equipment.${id}`)) return t(`equipment.${id}`);
  const entryOf = (x) => { try { return catalogEntry(axis, x) ?? null; } catch { return null; } };
  const twin = equipmentDigestTwin(axis, id);
  if (twin) {
    const name = has(`equipment.${twin}`) ? t(`equipment.${twin}`) : entryOf(twin)?.display_name ?? '—';
    const aliasOk = typeof i18nNs.hasLocal === 'function'
      ? i18nNs.hasLocal('equipment.legacyAlias')
      : (getLocale() === 'en' && has('equipment.legacyAlias'));
    return aliasOk ? t('equipment.legacyAlias', { name }) : name;
  }
  const entry = entryOf(id);
  if (typeof entry?.display_name === 'string' && entry.display_name) return entry.display_name;
  console.warn(`[settings] no display name for ${axis} ${id}`);
  return '—';
}

/** The shared migration step of sanitizeSpec and previewTemplateMismatch
 * (no id literal): a retired id served only as a digest row becomes its twin
 * (equipmentalias.js, feature-detected, identity when absent), then an entry
 * carrying ui_hidden AND a live superseded_by twin becomes that twin. One
 * hop, no chain walk; a non-string value comes back unchanged. */
function migratedEquipmentId(axis, id) {
  const c = equipmentAlias.canonicalEquipmentId?.(axis, id) ?? id;
  const old = catalogEntry(axis, c);
  if (old?.ui_hidden === true && typeof old.superseded_by === 'string') {
    const twin = catalogEntry(axis, old.superseded_by);
    if (twin && !twin.ui_hidden) return old.superseded_by;
  }
  return c;
}

/** Per-axis id validation over a base spec: unknown/stale ids, and ui_hidden
 * ids with no live twin, fall back to the base, as the pre-012 load path did
 * against DEFAULTS.equipment (catalog-policy item 5). With a `gameId`, the
 * table axis additionally enforces the game's table class (legalTableIds):
 * a persisted out-of-class table (written by a pre-guard build) falls back
 * to the base table, which is in-class by construction
 * (defaultEquipmentFor). First each axis passes migratedEquipmentId: a
 * retired id served only as a digest row becomes its twin, and an entry with
 * ui_hidden AND a live superseded_by twin is renamed to that twin (cues too).
 * An entry with superseded_by alone keeps GH-283 grandfathering (uiDemoted).
 * #789: with a `held` object, each axis replaced only because of a stale
 * sibling (a kernel-rejected id, an id a stale SDK catalog lacks, a table a
 * stale games class lacks) records { saved: raw saved id, shown: the id it
 * got } there, which persist() writes back (savedEquipmentBlob) until a
 * commit selects or owns that axis (commitSetting, releasedAxes). `baseHeld`
 * is the base's own record (defaultEquipmentFor's `held`): an axis the
 * degraded base filled or healed records the base's saved id, so a
 * degraded default is never persisted as the user's choice either. */
function sanitizeSpec(spec, base, gameId, held = null, baseHeld = null) {
  const raw = spec && typeof spec === 'object' ? spec : {};
  const v = { ...base, ...raw };
  // GH-490 de-brand RENAME migration (catalog v15): a persisted
  // 'joy_q8_9ft' selection is the SAME physical table as the new
  // chinese8_pro_9ft entry (identical repinned geometry), so it migrates
  // to the new id instead of falling to the app default through the
  // ui_hidden rule below — recorded migration semantics (the DEFAULTS
  // .powerResponse precedent). A literal, not the data rule below: the
  // catalog's joy_q8_9ft entry is ui_hidden with no superseded_by, so
  // migratedEquipmentId cannot rename it, and without this line the user
  // would silently land on a DIFFERENT table. Share-link replay fill
  // never passes through here (setTransientEquipment exemption), so
  // replays keep pinning the old id. scene/table.js resolveBootTableId
  // mirrors this rename (change together — split-brain law).
  if (v.table_id === 'joy_q8_9ft') v.table_id = 'chinese8_pro_9ft';
  // Data-driven rename (served catalog, no id literal): digest row, then one
  // hop of ui_hidden + superseded_by; the ui_hidden rule below keeps the rest.
  const pre = { ...v };
  for (const axis of AXES) v[axis] = migratedEquipmentId(axis, v[axis]);
  // #789: an id the loaded kernel rejects (a stale cached wasm) falls to the
  // base too, which appDefaultEquipment has already gated on that kernel;
  // a renamed id whose pre-rename id that kernel and the loaded catalog
  // both know keeps the pre-rename id (the same physical entry), and the
  // table class then accepts it through its renamed twin. An unrenamed
  // neutral table id takes its pre-rename twin (TABLE_RENAMES reversed)
  // under the same rule; scene/table.js resolveBootTableId mirrors both.
  const renames = equipmentAlias.TABLE_RENAMES ?? {};
  const sdkStale = Object.keys(LEGACY_DEFAULT_EQUIPMENT)
    .some((a) => !catalogEntry(a, DEFAULTS.equipment[a]));
  const kept = {};
  const stale = {};
  const kindOf = Object.fromEntries(Object.entries(EQUIPMENT_KIND_AXIS).map(([k, a]) => [a, k]));
  for (const axis of AXES) {
    const kind = kindOf[axis];
    const entry = catalogEntry(axis, v[axis]);
    // #789: the kernel and scene verdicts of equipmentSupported (the scene's
    // resolvesTable probe: a pre-rename scene cannot build a neutral table)
    const verdict = equipmentSupported(v[axis], kind).verdict;
    const rejected = verdict.kernelIds === false || verdict.sceneSpecs === false;
    // a sibling rejection is a stale sibling only when the loaded SDK catalog
    // knows the id (the siblings disagree); an id both lack is simply
    // unknown and heals to the base, written back at boot like any other
    const staleReject = rejected && !!entry;
    if (staleReject) staleSiblingSeen = true;
    const back = pre[axis] !== v[axis] ? pre[axis] : undefined;
    // the saved id before migration, else a rename twin (TABLE_RENAMES
    // reversed, catalog superseded_by reversed: cloth and ballset too) that
    // every loaded sibling supports; a stale SDK catalog that lacks a
    // neutral id keeps its pre-rename twin under the same rule (the scene,
    // which cannot see the SDK catalog, builds the neutral id: the same
    // TABLE_SPECS entry)
    const twin = rejected || (!entry && sdkStale)
      ? [back, ...equipmentTwinCandidates(axis, v[axis], false).slice(1)]
        .find((c) => typeof c === 'string' && equipmentSupported(c, kind).ok) : undefined;
    if (twin) {
      kept[axis] = v[axis];
      v[axis] = twin;
      stale[axis] = true;
      continue;
    }
    if (!entry || entry.ui_hidden || rejected) {
      stale[axis] = staleReject || (!entry && sdkStale);
      // the base must itself pass the predicate (defaultEquipmentFor builds
      // it so); a base axis a loaded sibling rejects takes its twin
      const b = equipmentSupported(base[axis], kind);
      v[axis] = b.ok || b.twin === null ? base[axis] : b.twin;
    }
  }
  // a class accepts a renamed table through its twin: a stale games class
  // lists the pre-rename id (scene/table.js resolveBootTableId mirrored), and
  // a stale SDK catalog leaves a saved pre-rename id unrenamed under a fresh
  // class (the scene renames it, so it needs no mirror of that half)
  const legal = gameId === undefined ? null : legalTableIds(gameId);
  if (legal && !legal.includes(v.table_id) && !legal.includes(kept.table_id)
    && !legal.some((t) => renames[t] === v.table_id)
    && !(Object.hasOwn(renames, v.table_id) && legal.includes(renames[v.table_id]))) {
    // a stale SDK catalog keeps a pre-rename id unrenamed, or a stale games
    // class still lists one (and lacks a table newer than it)
    const staleGames = legal.some((t) => Object.hasOwn(renames, t));
    if (staleGames) staleSiblingSeen = true;
    stale.table_id ||= sdkStale || staleGames;
    v.table_id = base.table_id;
  }
  for (const axis of AXES) {
    if (held && stale[axis] && typeof raw[axis] === 'string' && raw[axis] !== v[axis]) {
      held[axis] = { saved: raw[axis], shown: v[axis] };
    } else if (held && baseHeld?.[axis] && v[axis] === baseHeld[axis].shown && raw[axis] !== v[axis]) {
      held[axis] = { saved: baseHeld[axis].saved, shown: v[axis] };
    }
  }
  return v;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    // GH-701: the top-level tuple is NOT pre-filled from the pool kit
    // (DEFAULTS.equipment). Every axis the blob does not carry is filled by
    // the sanitizeSpec call below from the ACTIVE game's pairing default
    // (defaultEquipmentFor) — the same base equipmentByGame entries always
    // sanitized against — so a partial / hand-edited / future-axis-less
    // profile of a non-pool game lands on its discipline kit (napped cloth,
    // snooker/carom balls, recommended cushion model, discipline cue) exactly
    // like a card commit, instead of the pool default kit (cloth, balls,
    // cushion, standard cue) under a class-forced table (settings ≠ kernel
    // for snooker and carom; DIFFERENT heyball physics than the
    // app-written profile). Pool profiles are byte-identical: their
    // pairing default IS the pool kit. An explicit legal id in the blob
    // still wins on every axis (sanitizeSpec's {...base, ...spec} merge).
    const v = {
      ...DEFAULTS, ...saved,
      equipment: { ...(saved.equipment && typeof saved.equipment === 'object'
        ? saved.equipment : {}) },
    };
    if (!saved.equipment) { // legacy profile migration
      // pre-equipment saves had no table axis at all — sanitizeSpec below
      // lands them on the game's pairing default (policy item 5); the
      // folded preset/cloth ids ride the spec and are validated there
      const model = LEGACY_PRESET_TO_MODEL[saved.preset];
      if (model) v.equipment.cushion_model_id = model;
      if (saved.cloth && saved.cloth !== 'default') v.equipment.cloth_id = saved.cloth;
    }
    delete v.preset;
    delete v.cloth;
    v.assist = ASSIST_MIGRATE[v.assist] ?? v.assist;
    if (!ASSIST_LEVELS.includes(v.assist)) v.assist = DEFAULTS.assist;
    if (typeof v.assistCuePath !== 'boolean') v.assistCuePath = DEFAULTS.assistCuePath;
    if (typeof v.assistWrongBall !== 'boolean') {
      v.assistWrongBall = DEFAULTS.assistWrongBall; // issue #88, loud sanitation
    }
    // assist-line contrast level (issue GH-417): loud sanitation to the
    // shipped standard default — an ABSENT key (every pre-417 install)
    // lands here too, so upgrades keep today's behavior byte-identically
    if (!ASSIST_CONTRAST_LEVELS.includes(v.assistContrast)) {
      v.assistContrast = DEFAULTS.assistContrast;
    }
    // power-response curve (issue GH-142): loud sanitation to the perceptual
    // default. An ABSENT key — every pre-GH-142 install — lands here too:
    // recorded migration semantics (see DEFAULTS.powerResponse — the feel
    // change on upgrade is intentional, the owner A/Bs on device).
    if (!POWER_RESPONSES.includes(v.powerResponse)) {
      v.powerResponse = DEFAULTS.powerResponse;
    }
    if (v.look === 'sp') v.look = 'tournament'; if (v.look !== 'tournament' && v.look !== 'green') v.look = DEFAULTS.look; // 'sp': the legacy look id (GH-973)
    // default camera register (GH-441): loud sanitation to the orbit
    // default — the key was persisted-but-dead for a year of builds, so
    // any stale string may be in the wild; unknown values land on the
    // pre-441 behavior ('orbit'), never on a surprise pose.
    if (v.camera !== 'orbit' && v.camera !== 'overhead') {
      v.camera = DEFAULTS.camera;
    }
    if (v.language !== '' && !LOCALES.includes(v.language)) {
      v.language = DEFAULTS.language;
    }
    // session mode (issue #68): loud per-field sanitation — a stale/unknown
    // persisted mode falls back to 'play' (the settings load-path law)
    if (!MODE_IDS.includes(v.mode)) v.mode = DEFAULTS.mode;
    // playground snap-to-grid toggle (issue GH-140): loud boolean sanitation —
    // the assistWrongBall precedent
    if (typeof v.snapGrid !== 'boolean') v.snapGrid = DEFAULTS.snapGrid;
    // carom second-ball fork (GH-383): loud sanitation to the yellow
    // worldwide-practice default
    if (v.caromSecondBall !== 'yellow' && v.caromSecondBall !== 'marked') {
      v.caromSecondBall = DEFAULTS.caromSecondBall;
    }
    // lighting axis (issue #89): unknown fixture ids fall back to the canopy
    // identity default; brightness clamps to the 0.6–1.4 rig range (the
    // ACES/bloom guardrails — room.js halo lesson). GH-386 (review r2 P2):
    // discarding a stale explicit id also resets to the venue default —
    // the pick's object no longer exists, and the boot loader resolves the
    // same way (never an explicit-canopy/auto split-brain).
    if (!FIXTURE_IDS.includes(v.fixture)) {
      v.fixture = DEFAULTS.fixture;
      v.fixtureAuto = true;
    }
    // GH-386 venue default: loud boolean sanitation. An ABSENT key (every
    // pre-386 install) lands on the class-following default ONLY when the
    // legacy fixture is the canopy — pre-386 persist() wrote
    // fixture:'canopy_panel' whether or not the player ever touched it, so
    // canopy is ambiguous and the owner order (right lamp per class)
    // resolves it; a persisted NON-canopy fixture is unambiguous evidence
    // of an explicit pick and must survive the upgrade (review GH-386 r1
    // P2 — the explicit-choice invariant). Inspects the RAW blob: the
    // ...DEFAULTS spread already filled v.fixtureAuto with a boolean, so
    // `v` cannot distinguish an absent key. Runs AFTER the fixture-id
    // sanitation above so a stale unknown id (already reset to the canopy
    // default) lands on auto, not on a phantom explicit choice. The
    // main.js raw pre-boot read mirrors this rule — change together.
    if (typeof saved.fixtureAuto !== 'boolean') {
      v.fixtureAuto = v.fixture === DEFAULTS.fixture;
    }
    // cloth color (issue GH-229): loud sanitation — unknown/stale ids land
    // on the '' factory identity default. scene/table.js
    // resolveBootClothColor mirrors this rule for the boot-time paint
    // (the resolveBootTableId split-brain law).
    if (v.clothColor !== '' && !CLOTH_COLOR_IDS.includes(v.clothColor)) {
      v.clothColor = DEFAULTS.clothColor;
    }
    v.brightness = Number(v.brightness);
    if (!Number.isFinite(v.brightness)) v.brightness = DEFAULTS.brightness;
    v.brightness = Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, v.brightness));
    // game axis (feature 011): the persisted GameId must resolve to a
    // PLAYABLE catalog entry — unknown/stale ids and readiness entries fall
    // back to the nine_ball default (FR-003; selector rule in
    // contracts/game-catalog.md §4).
    try {
      if (getGameEntry(v.game).readiness !== 'playable') v.game = DEFAULTS.game;
    } catch {
      v.game = DEFAULTS.game;
    }
    // ids from stale saves that the shipped catalog no longer knows, PLUS
    // ui_hidden ids with no live twin (catalog-policy item 5: a persisted
    // legacy 'wpa_generic_9ft' falls to the app default on load; a ui_hidden
    // id with a live superseded_by twin migrates to it in sanitizeSpec) →
    // default per axis (the ACTIVE game's pairing default, which for every
    // pool discipline IS the app default — bit-identical fallback).
    // Share-link replay fill is EXEMPT (sdk legacyEquipment stays frozen;
    // it flows through setTransientEquipment, never through this load
    // path). scene/table.js resolveBootTableId mirrors this rule for the
    // boot-time scene build.
    // per-discipline rules-variant selection (feature 022 US2): preset id
    // strings keyed by PLAYABLE game id; an ABSENT key = the family
    // default (FR-005: the default plays the untouched frozen v1 path).
    // Ids are validated at CONSUMPTION (flow.js resolves them against the
    // committed rules artifact's catalog, which loads async — an id the
    // catalog no longer knows falls back to the default loudly there,
    // the same law the game/equipment axes apply on this load path).
    const variants = {};
    if (saved.variants && typeof saved.variants === 'object') {
      for (const [gid, pid] of Object.entries(saved.variants)) {
        if (typeof pid !== 'string' || pid.length === 0) continue;
        try {
          if (getGameEntry(gid).readiness !== 'playable') continue;
        } catch { continue; }
        variants[gid] = pid;
      }
    }
    // GH-383 owner decision (2026-08-06, world-competition practice):
    // a FRESH profile (no persisted blob at all) opens carom on the
    // two-cue professional standard (`umb-carom-2cue`); the classic
    // single-cue default stays one picker click away (the '' option
    // routes to the FR-005 v1 alias and persists as an ABSENT key). An
    // EXISTING blob is NEVER migrated: its recorded selection stands,
    // and an absent carom key keeps meaning the v1 family default —
    // e2e-userboot arm 8 pins both halves. The share-codec default
    // (GAME_VARIANTS order, decode rule 1) is untouched: this is a
    // profile seed, not a wire-format change.
    if (!raw) variants.carom_3cushion = 'umb-carom-2cue';
    v.variants = variants;
    // per-game equipment map (feature 012 US4): entries for games the
    // shipped catalog does not resolve as PLAYABLE are dropped (they can
    // never be switched to, and their defaults may not exist yet)
    const eq = loadEquipment(saved.equipmentByGame, v.equipment, v.game);
    v.equipment = eq.equipment;
    v.equipmentByGame = eq.byGame;
    v.heldEquipment = eq.held;
    return v;
  } catch {
    // full-reset path (corrupt blob / storage failure): the default
    // profile — which includes the GH-383 fresh-profile carom seed; a
    // degraded default axis is held (#789), never persisted as the choice
    const held = {};
    const equipment = appDefaultEquipment(held);
    return {
      ...DEFAULTS, equipment,
      equipmentByGame: { [DEFAULTS.game]: { ...equipment } },
      heldEquipment: Object.keys(held).length ? { [DEFAULTS.game]: held } : {},
      variants: { carom_3cushion: 'umb-carom-2cue' },
    };
  }
}

/** load()'s equipment half: every PLAYABLE game's saved spec and the
 * top-level `equipment` (the active game's) through sanitizeSpec. `held`
 * maps a game id to sanitizeSpec's record of the saved ids a stale sibling
 * replaced, the degraded base's fills included (#789). */
function loadEquipment(savedByGame, equipment, game) {
  const byGame = {};
  const held = {};
  const take = (gid, spec) => {
    const h = {};
    const baseHeld = {};
    const out = sanitizeSpec(spec, defaultEquipmentFor(gid, baseHeld), gid, h, baseHeld);
    if (Object.keys(h).length) held[gid] = h;
    else delete held[gid];
    return out;
  };
  if (savedByGame && typeof savedByGame === 'object') {
    for (const [gid, spec] of Object.entries(savedByGame)) {
      try {
        if (getGameEntry(gid).readiness !== 'playable') continue;
      } catch { continue; }
      byGame[gid] = take(gid, spec);
    }
  }
  const top = take(game, equipment);
  // the top-level spec IS the active game's (persist() writes both in
  // lockstep; the pre-boot scene read consumes the top-level one)
  byGame[game] = { ...top };
  return { equipment: top, byGame, held };
}

/** #789: the persisted equipment of persist(): `equipment` under `game` and
 * every `byGame` entry, each axis of `held[gid]` written back as its saved
 * id while the spec still shows the degraded id (a user pick on that axis
 * changes it and is written instead). A hold outlives commits on other
 * axes (commitSetting keeps it unless the commit selected or owns its axis,
 * releasedAxes), so an untouched axis keeps writing the saved id back. No
 * held axis = the plain specs. */
function savedEquipmentBlob(equipment, game, byGame, held) {
  const back = (gid, spec) => {
    const out = { ...spec };
    for (const [axis, h] of Object.entries(held[gid] ?? {})) {
      if (spec[axis] === h.shown) out[axis] = h.saved;
    }
    return out;
  };
  const all = { ...byGame, [game]: equipment };
  return {
    equipment: back(game, equipment),
    equipmentByGame: Object.fromEntries(Object.entries(all).map(([gid, spec]) => [gid, back(gid, spec)])),
  };
}

/** #789: the axes an equipment commit selected or owns (`chosen`: the
 * user's picks; `ownedAxes`: the axes the commit rewrote for them, e.g. a
 * table's recommended cushion). Only these axes end a hold (commitSetting);
 * every other axis is one the user never touched. */
function releasedAxes(options) {
  return new Set([...(options?.chosen ?? []), ...(options?.ownedAxes ?? [])]);
}

/** #1019: the stored blob as parsed JSON, or null (absent, unreadable, or
 * not an object). */
function readStoredBlob() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { return null; }
}

const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** #1019: two tabs on one profile share one blob, and each holds its own
 * copy in memory. A write therefore merges into what is stored NOW: a leaf
 * this tab changed since `base` (the blob it last read or wrote) takes this
 * tab's value; every other leaf keeps the stored one, so another tab's
 * choices survive. Plain objects (equipmentByGame -> game -> axis, variants)
 * merge per key; a key only another tab writes is kept; a key this tab
 * dropped since `base` stays dropped. */
function mergeStored(ours, base, theirs, { dropDeleted = false } = {}) {
  if (!isPlainObject(base) || !isPlainObject(theirs)) return ours;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = {};
  for (const [k, o] of Object.entries(ours)) {
    const b = base[k], t = theirs[k];
    // `variants`: an ABSENT discipline key means its family default, so a
    // key another tab removed (a reset to the default) is that tab's write
    if (dropDeleted && !(k in theirs) && k in base && same(o, b)) continue;
    if (isPlainObject(o) && isPlainObject(b) && isPlainObject(t)) {
      out[k] = mergeStored(o, b, t, { dropDeleted: dropDeleted || k === 'variants' });
    } else out[k] = k in theirs && same(o, b) ? t : o;
  }
  for (const [k, t] of Object.entries(theirs)) if (!(k in ours) && !(k in base)) out[k] = t;
  // fixture + fixtureAuto are ONE setting (fixtureBase): they move together
  if ('fixture' in ours && 'fixtureAuto' in ours) {
    const mine = !same(ours.fixture, base.fixture) || !same(ours.fixtureAuto, base.fixtureAuto);
    const src = mine || !('fixture' in theirs) ? ours : theirs;
    out.fixture = src.fixture;
    out.fixtureAuto = src.fixtureAuto;
  }
  return out;
}

/** The boot write-back (createSettings): ONLY when a persisted blob already
 * exists, and never after a stale sibling (#789, staleSiblingSeen), whose
 * degraded spec must not replace the saved choice. */
function bootWriteBack(persist) {
  try {
    if (localStorage.getItem(KEY) !== null && !staleSiblingSeen) persist();
    else return false; // #1019: nothing written (the caller takes its boot state as the merge base)
  } catch { return false; /* private mode etc. */ }
  return true;
}

export function createSettings({ machine }) {
  const values = load();
  // #1019: the merge base of persist() — the raw blob this boot read (so a
  // value load() migrated still counts as this tab's write at the boot
  // write-back); a boot that writes nothing takes this tab's boot state
  // below, so its untouched defaults never overwrite another tab's choices.
  let storedBase = readStoredBlob();
  // per-game persisted specs (feature 012 US4) live NEXT TO values, not in
  // it: api.get()/broadcast keep exposing exactly the pre-012 shape
  const equipmentByGame = values.equipmentByGame;
  delete values.equipmentByGame;
  // #789: raw saved ids a stale sibling replaced, by game (loadEquipment)
  const heldEquipment = values.heldEquipment ?? {};
  delete values.heldEquipment;
  let persistedEquipment = { ...values.equipment }; // restored post-replay
  let persistedGame = values.game;                  // restored post-replay
  // #789 (E16): the saved game a store-suppressed game commit replaced
  // ({ saved, shown }, the boot heyball fallback under a stale flow.js).
  // While the session still plays `shown`, persist() writes `saved` and its
  // spec, the way a held equipment axis writes its saved id; the next
  // persisted game commit that stores ends it.
  let heldGame = null;
  // #789 (C): the replay tuple a verbatim commit applied (axis -> id), which
  // Continue keeps playing. Its axes stay session-only: a later persisted
  // equipment commit stores only the axes it released (releasedAxes), and
  // the gate keeps an inherited id the verbatim rule admits. Ends on
  // restorePersistedEquipment or a persisted game switch.
  let inheritedEquipment = null;
  // #1034: the session-only game whose OWN tuple is on the table — a shared
  // replay's game (the transient game committed while the replay's verbatim
  // tuple is live). Persisted equipment commits store into its slot. A
  // session pin without that tuple (a drill's setTransientGame) keeps the
  // persisted game's slot: its table plays the persisted tuple. Ends with
  // restorePersistedEquipment and with any persisted game commit.
  let replayGame = null;
  // feature 022: `values.variants` is the WORKING per-discipline variant
  // map (a shared replay overlays it transiently); this copy is what
  // persist() writes — mirror of persistedEquipment/persistedGame
  const persistedVariants = { ...values.variants };

  // ---- GH-534 owner ruling R1 (2026-08-16): the PRISTINE-GAME predicate --
  // "Zero shots taken THIS rack" — the flow.js readiness catch-up's own
  // shotless-session idiom (flow.js re-racks silently on exactly this
  // read): game.shotIndex is 0 on every fresh rack, bumps at shoot() BEFORE
  // the strike simulates (an in-flight first shot already reads 1), and
  // rerack() resets it. Fail-closed: an absent game seam or a live shared
  // replay counts as PROGRESSED (the confirm stands). GH-1062: so does a
  // CARRIED fold — the rulebook re-racks that restore the match over the
  // fresh rack (14.1 7.11 / 7.3(b) re-breaks, one-pocket 12.10) reset
  // shotIndex but keep the scores (flow.js ctx.foldCarried; feature-
  // detected — a stale flow.js keeps the shot-0 read).
  const rackPristine = () => ctx.game?.shotIndex === 0
    && ctx.replayActive?.() !== true && ctx.foldCarried?.() !== true;

  // GH-541 review remedial (P1): the CORE-SIDE decision-conflict backstop.
  // A pending rules decision on a PROGRESSED rack is a live post-shot
  // option that a re-racking commit or a playground conversion would
  // DESTROY (a pristine rack's pending decision is address-born —
  // break_spot/break_pocket — and re-raises byte-identically on any
  // re-rack, so it never conflicts; atelier.md §7 entry 16). The atelier
  // gates carry the honest-notice UX; THIS predicate guards the
  // committing seams themselves, so a cached pre-GH-541 atelier/
  // ateliercue leaf (no gate, old Keep/try-it paths) stays safe under a
  // fresh shell.js that now allows entry with the decision pending (the
  // mixed-vintage cache-poison law). matchState-first read (the shell
  // idiom): while the shell covers the hud dialog, its DOM reads hidden.
  const decisionConflict = () => {
    try {
      if ((window.__rules?.matchState?.()?.pendingDecision ?? null) !== null) {
        return !rackPristine();
      }
    } catch { /* seam absent */ }
    return false;
  };

  // ---- GH-534 owner ruling R3 (2026-08-16): the atelier PREVIEW lane -----
  // ONE in-memory swap transaction (data-model.md "Swap transaction",
  // amended 2026-08-16) over the EXISTING store seam: staged values ride
  // the transient set() path (persist: false — the setTransientEquipment
  // grammar), committed truth stays persistedEquipment / the persisted
  // blob, and persist() SHIELDS staged scalar keys (equipment/game are
  // shielded by their persisted twins already; fixture/brightness/
  // clothColor persist straight from `values`, so an unrelated commit
  // mid-preview must substitute the recorded base). NO new persistence
  // keys, NO new event grammar — every apply is the shipped ob:settings
  // broadcast the scene consumers already follow.
  //   tx.eq: axis -> committed base id (re-racking axes only)
  //   tx.sc: key  -> committed base value ('fixture' base is the SETTER
  //          value: 'auto' while fixtureAuto, else the explicit id)
  //   tx.reracked: a PRISTINE preview re-composed the live rack (full
  //          visual truth — ball set, markings, rack on the new bed);
  //          restoration compares the live template identity, since a
  //          successor can re-rack after a progressed preview did not.
  let previewTx = null;
  const PREVIEW_EQ_AXES = ['table_id', 'cloth_id', 'ballset_id',
    'cushion_model_id'];
  const PREVIEW_SCALARS = ['fixture', 'brightness', 'clothColor'];
  const fixtureSetterValue = () => (values.fixtureAuto ? 'auto' : values.fixture);
  // the fixture base is a PAIR (review fix-round review r1 P2): under
  // auto-follow the setter value is 'auto' while values.fixture still
  // carries the last EXPLICIT pick — staging a fixture mutates that pick,
  // so the exact revert (and the persist shield) must restore BOTH fields.
  const fixtureBase = () => ({ setter: fixtureSetterValue(),
    explicit: values.fixture });
  const previewShield = () => {
    const out = {};
    if (!previewTx) return out;
    for (const [k, base] of Object.entries(previewTx.sc)) {
      if (k === 'fixture') {
        out.fixture = base.explicit;
        out.fixtureAuto = base.setter === 'auto';
      } else out[k] = base;
    }
    return out;
  };
  const previewDropIfEmpty = () => {
    if (previewTx && !Object.keys(previewTx.eq).length
      && !Object.keys(previewTx.sc).length && !Object.keys(previewTx.adopt ?? {}).length) previewTx = null;
  };
  /** #789 (D2): after Continue an inherited axis is session-only, so
   * picking the inherited id it shows is the adopt affordance: the pick
   * commits that axis as the user's choice (it joins releasedAxes) with
   * nothing visible to rebuild. */
  const adoptable = (axis, id) => inheritedEquipment?.[axis] === id && values.equipment[axis] === id;

  // GH-534 G5 (round-2 QA): storage-degrade HONESTY. The ruled degrade
  // semantics stand untouched (spec 032: "swaps still apply live for the
  // session — store semantics today"); what changes is that the write
  // failure now SPEAKS, exactly once per session: one console breadcrumb,
  // one non-blocking HUD hint, and a bugreport ledger marker
  // (window.__obStorage) so a quota/private-mode session is
  // distinguishable from "never saved". shell.js writeState shares the
  // marker through the same window slot.
  let storageDegradeSaid = false;
  function storageDegradeNotice(key) {
    const slot = (window.__obStorage ??= { persistFailed: 0, firstKey: null });
    slot.persistFailed += 1;
    slot.firstKey ??= key;
    if (storageDegradeSaid) return;
    storageDegradeSaid = true;
    console.warn('[settings] persist failed — choices apply for this '
      + 'session only');
    // DEFERRED past the failing commit's own ceremony: a re-racking swap
    // calls persist() BEFORE game.rerack(), and the rerack reset clears
    // hud hints — an immediate hint died the same tick it fired
    // (red-proven by the STORAGE arm). One macrotask beat later the
    // ceremony has settled and the hint gets its full dwell.
    setTimeout(() => {
      try { ctx.hud?.setHint?.(t('settings.storageDegraded')); } catch { /* hud absent */ }
    }, 600);
  }
  /** This tab's whole persisted state, as one blob. */
  function ownBlob() {
    const eq = savedEquipmentBlob(persistedEquipment, persistedGame, equipmentByGame, heldEquipment);
    const savedGame = heldGame?.shown === persistedGame ? heldGame.saved : persistedGame;
    return {
      ...values, ...previewShield(),
      equipment: eq.equipmentByGame[savedGame] ?? eq.equipment, game: savedGame,
      variants: { ...persistedVariants },
      equipmentByGame: eq.equipmentByGame,
    };
  }
  function persist() {
    try {
      const ours = ownBlob();
      // #1019: merge into the stored blob (another tab may have written
      // since this tab last did); the top-level tuple follows the merged
      // game's slot, as it does in ownBlob
      const blob = mergeStored(ours, storedBase, readStoredBlob());
      if (isPlainObject(blob.equipmentByGame?.[blob.game])) blob.equipment = { ...blob.equipmentByGame[blob.game] };
      localStorage.setItem(KEY, JSON.stringify(blob));
      storedBase = JSON.parse(JSON.stringify(ours));
      // preview.js reads THESE keys at boot (its documented settings contract)
      // — mirrored from the MERGED blob (#1019), never this tab's stale copy
      localStorage.setItem('ob.settings.assist', blob.assist);
      localStorage.setItem('ob.settings.assistCuePath', String(blob.assistCuePath));
      // previewink.js boot-reads THIS key (issue GH-417 — the mirror-key
      // convention IS extended here, unlike assistWrongBall/snapGrid: the
      // leaf boots before this module runs and needs the level at its
      // first solve, exactly the preview.js assist case)
      localStorage.setItem('ob.settings.assistContrast', blob.assistContrast);
    } catch {
      // private mode / quota — settings still apply for the session
      storageDegradeNotice(KEY); // GH-534 G5: say so, once
    }
  }
  // write the SANITIZED blob back once at boot: load() may have corrected a
  // stale persisted table outside the active game's class (sanitizeSpec —
  // feature 012 review fix), and scene/table.js resolveBootTableId reads
  // the raw blob BEFORE this module runs. Persisting now converges the two
  // boot readers by the NEXT boot (this boot's visual self-heals on the
  // first ob:settings broadcast, as any equipment/game change always did).
  // ONLY when a persisted blob already exists: a virgin profile has nothing
  // to sanitize, and seeding one at boot violates the issue-#14 determinism
  // doctrine (scripted boots carry NO ambient state — e2e.mjs hermetic
  // guard).
  // #1019: a boot that writes nothing (a virgin profile, a stale sibling)
  // takes this tab's boot state as its merge base, so a later write never
  // re-asserts a value this tab did not choose over another tab's choice
  if (!bootWriteBack(persist)) storedBase = JSON.parse(JSON.stringify(ownBlob()));

  function broadcast(key) {
    const detail = { key, value: values[key], all: { ...values } };
    // preview.js's contract (preview.js header): detail carries `assist`
    if (key === 'assist') detail.assist = values.assist;
    // `commit: true` (ADDITIVE, design 277 slice 3 PR-2 review r8 P2):
    // marks a REAL settings commit, distinguishing it from the paint-only
    // equipment rebroadcasts other modules dispatch on this wire
    // (playback.js bed swaps, flow.js discipline staging, the rerackKind
    // probe). share.js keys its mid-rack cue-swap poison on THIS flag —
    // fail-closed under mixed caches: an unmarked event can never poison,
    // and a stale settings.js (no flag, no cue fast path) still re-racks
    // every equipment change into resetLog.
    detail.commit = true;
    window.dispatchEvent(new CustomEvent('ob:settings', { detail }));
  }

  let equipmentRevision = 0, pendingSetting = null, pendingPreview = null;
  let equipmentOwner = null;
  // build 20: the progress overlay of the user game switch whose request is
  // in flight. A newer request (a scripted switch, a replay's transient game,
  // an equipment write) or the cancellation of this one supersedes that
  // switch, so its overlay ends at once — it never shields input until the
  // superseded switch's own await returns (behind a held CN8 transport: the
  // overlay's lifetime cap). switchSeq orders the switches past their
  // confirms: the newest one wins.
  let switchProgress = null, switchSeq = 0;
  const supersedeSwitch = () => { switchProgress?.end(); switchProgress = null; };
  // A caller retains its request through its guard, rerack and auto-close.
  // READY is a table event, not the end of that caller's transaction.
  const equipmentCalls = new Map();
  const settingsIssued = new Set();
  let equipmentHold = null;
  let previewRevision = 0, previewAttempt = 0, previewBatch = null;
  let transientEquipment = null;
  const tableBuild = () => ctx.tableBuild ?? window.__tableBuild;
  function recordSettingsPreparation() {
    const id = tableBuild()?.status?.().request_id;
    if (!Number.isSafeInteger(id)) return null;
    settingsIssued.add(id);
    return id;
  }
  function reflectPreview() {
    window.dispatchEvent(new CustomEvent('ob:settings', {
      detail: { key: 'preview', value: null, all: { ...values }, commit: false },
    }));
  }
  function previewDecision(tx, message) {
    if (tx.decision === message) return;
    tx.decision = message;
    console.info('[settings] ' + message);
    reflectPreview();
  }
  function previewTemplateMismatch() {
    // Kernel serde omits the equipment tag for its default composition.
    // This is catalog.rs's tuple, not the web app's default pairing.
    const defaults = sdk.DEFAULT_EQUIPMENT ?? {
      table_id: 'wpa_generic_9ft', cloth_id: 'simonis_860_tournament',
      ballset_id: 'aramith_pool', cue_id: 'standard', cushion_model_id: 'han2005_default',
    };
    const templateEquipment = ctx.game?.template?.system?.equipment ?? defaults;
    // Both sides pass migratedEquipmentId, so a neutral id and its old twin compare equal.
    return PREVIEW_EQ_AXES.filter(axis =>
      migratedEquipmentId(axis, templateEquipment[axis] ?? defaults[axis]) !== migratedEquipmentId(axis, values.equipment[axis] ?? defaults[axis]));
  }
  function consumePreviewKeys(keys, { preview = false, restoreTx = null } = {}) {
    const tx = previewTx;
    if (!tx || preview || (restoreTx && restoreTx !== tx)) return;
    const consumed = keys.filter(key => key in tx.eq);
    if (!consumed.length) return;
    const mismatch = restoreTx && !rackPristine() ? previewTemplateMismatch() : [];
    const kept = mismatch.length ? `template keeps ${mismatch.join(', ')} until the next rack` : null;
    // Record the progressed decision while its transaction is still live;
    // publish only after the empty transaction has been dropped.
    if (kept) tx.decision = kept;
    for (const key of consumed) delete tx.eq[key];
    previewDropIfEmpty();
    if (kept) {
      console.info('[settings] ' + kept);
      reflectPreview();
    } else if (!restoreTx || tx.decision) {
      previewDecision(tx, `${restoreTx ? 'revert restored' : 'owned at commit'}: ${consumed.join(', ')}`);
    } else reflectPreview();
  }
  function equipmentTail(request, result) {
    equipmentCalls.delete(request);
    settleDeferredRevert();
    return result;
  }
  function afterEquipment(result, request) {
    if (result?.then) return result.then(
      ok => equipmentTail(request, ok),
      error => { equipmentTail(request, false); throw error; });
    return equipmentTail(request, result);
  }
  function settleDeferredRevert() {
    const tx = previewTx;
    if (!tx?.reverting || tx.restoring || !Object.keys(tx.eq).length) return;
    const keys = Object.keys(tx.eq);
    const live = tableBuild()?.status?.();
    const foreign = live?.status === 'PENDING' && !settingsIssued.has(live.request_id);
    if (equipmentHold || equipmentCalls.size || foreign) {
      const by = equipmentHold ? `held by ${equipmentHold}`
        : equipmentCalls.size ? `waiting for request ${[...equipmentCalls.keys()].join(', ')}`
          : `foreign preparation in flight: ${live.request_id}`;
      previewDecision(tx, `revert deferred: ${keys.join(', ')} ${by}`);
      return;
    }
    // Only this write's commit consumes keys. A refused restoration keeps
    // them for a later caller tail or a re-entrant Revert, without a loop.
    tx.restoring = true;
    const restored = set('equipment', { ...values.equipment, ...tx.eq },
      { persist: false, restoreTx: tx, restoreKeys: keys });
    const request = equipmentRevision;
    const finish = ok => {
      equipmentCalls.delete(request);
      tx.restoring = false;
      if (previewTx === tx && request !== equipmentRevision) {
        previewDecision(tx, `revert superseded: ${Object.keys(tx.eq).join(', ')}`);
        settleDeferredRevert();
      } else if (ok === false && previewTx === tx) {
        previewDecision(tx, `revert deferred: ${Object.keys(tx.eq).join(', ')} restore refused`);
      } else if (ok !== false || previewTx !== tx) settleDeferredRevert();
      return ok;
    };
    const applied = afterSet(restored, () => {
      const mismatch = previewTemplateMismatch();
      if (mismatch.length && rackPristine()) ctx.game?.rerack(ctx.game.seed);
      else ctx.game?.syncShadows?.();
      return true;
    });
    if (applied?.then) applied.then(finish, () => finish(false));
    else finish(applied);
  }
  function previewRefusal(action) {
    if (!previewTx?.reverting) return null;
    const keys = Object.keys(previewTx.eq);
    console.info(`[settings] ${action} refused: revert pending for ${keys.join(', ')}`);
    return { committed: false, reracked: false, declined: false,
      reason: 'PREVIEW_REVERT_PENDING', notice: 'atelier.preview.revertPending' };
  }
  function cancelPendingEquipment(owner) {
    if (!owner) return false;
    if (owner.revision === equipmentRevision) {
      equipmentRevision++;
      supersedeSwitch();
      equipmentOwner = null;
      pendingSetting = null;
      ctx.equipmentPending = false;
      if (previewBatch?.request === owner) {
        previewRevision++; pendingPreview = null; previewBatch = null;
      }
    }
    const table = tableBuild(), live = table?.status?.();
    // An archive or another caller can own a newer table request without
    // passing through settings. Cancelling our commit cannot cancel it.
    if (owner.tableRequestId !== null && live?.request_id === owner.tableRequestId
      && live.status === 'PENDING') table.cancelPreparation?.();
    equipmentCalls.delete(owner.revision);
    settleDeferredRevert(); // same-key cancellation has no commit tail
    return true;
  }
  function prepareCurrentEquipment(key) {
    const owner = pendingSetting?.key === key ? pendingSetting.request : null;
    if (pendingSetting && !owner) return true;
    cancelPendingEquipment(owner);
    if (tableBuild()?.status?.().status === 'PENDING') return true;
    const ready = tableBuild()?.prepareEquipment?.(values.equipment) ?? true;
    recordSettingsPreparation();
    return ready;
  }
  function afterSet(result, apply) {
    const request = equipmentRevision;
    if (result?.then) return result.then(ok => ok === false || request !== equipmentRevision ? false : apply());
    return result === false ? false : apply();
  }
  /** Build the matching table before changing either the persisted tuple
   * or the game's next-rack inputs. Old table.js has no async leaf and no
   * capability: its existing synchronous broadcast still does the work.
   * The latest request owns the commit, including a return to the current
   * selection while another table's download is still pending. */
  function set(key, value, options = {}) {
    if (key !== 'equipment' && key !== 'game') return commitSetting(key, key === 'look' && value === 'sp' ? 'tournament' : value, options); // 'sp': the legacy look id (GH-973)
    // #789 the choke point: the tuple this commit would build and persist
    // goes through equipmentCommitGate before any preparation, persist or
    // broadcast. A refusal is a no-op (no request, no scene switch); a
    // degraded axis is built as its twin and held (commitSetting).
    const adopt = key === 'game' && options.persist !== false && value !== values.game;
    // a first-visit pairing records the axes defaultEquipmentFor degraded:
    // held like the gate's own degrades, never saved as the choice
    const pairHeld = {};
    const requested = key === 'equipment' ? value
      : adopt ? equipmentByGame[value] ?? defaultEquipmentFor(value, pairHeld) : values.equipment;
    const gated = key === 'equipment' || adopt;
    const gate = gated ? equipmentCommitGate(requested, options.chosen ?? [], options.verbatim ? { verbatim: true }
      : key === 'equipment' && inheritedEquipment ? { inherited: inheritedEquipment } : {})
      : { ok: true, spec: requested, degraded: {}, notes: [] };
    if (!gate.ok) {
      console.warn(`[settings] refused ${gate.axis} ${gate.id}: ${gate.reason}`);
      return false;
    }
    for (const note of gate.notes) console.warn(`[settings] ${note}`);
    for (const d of Object.values(gate.degraded)) console.warn(`[settings] ${d.reason} — playing ${d.shown}`);
    // An undegraded tuple stays the caller's own object: a preview batch
    // keeps adding accepted axes to it while its table is still pending,
    // and the late commit must carry them. A degrade builds a copy.
    const next = Object.keys(gate.degraded).length ? gate.spec : requested;
    const committed = key === 'equipment' ? next : value;
    const degraded = { ...gate.degraded };
    for (const [axis, h] of Object.entries(pairHeld)) {
      if (!degraded[axis] && next[axis] === h.shown) degraded[axis] = h;
    }
    options = { ...options, degraded, pairing: adopt ? next : null };
    if (!options.preview) {
      previewRevision++;
      pendingPreview = null;
      previewBatch = null;
    }
    const request = ++equipmentRevision;
    supersedeSwitch();
    const owner = { revision: request, key: options.requestKey ?? key, tableRequestId: null };
    equipmentOwner = owner;
    // A replacement request makes every older settings commit ineligible.
    // Its unresolved transport must not keep a cancelled preview held.
    equipmentCalls.clear();
    equipmentCalls.set(request, owner);
    if (options.preview && previewBatch) previewBatch.request = owner;
    const refuse = error => {
      if (request !== equipmentRevision) return false;
      window.dispatchEvent(new CustomEvent('ob:table-refused', { cancelable: true,
        detail: { error, recovery: 'reload', message: bootCopy.t('error.reloadMessage', {
          message: (error?.code ?? 'TABLE_BUILD_FAILED') + ': ' + String(error?.message ?? error),
        }) } }));
      return false;
    };
    let ready;
    let prepared = null;
    try {
      prepared = typeof tableBuild()?.prepareEquipment === 'function' ? tableBuild() : null;
      ready = prepared ? prepared.prepareEquipment(next) : ctx.prepareTable?.(next?.table_id);
      owner.tableRequestId = recordSettingsPreparation();
    } catch (error) { ready = refuse(error); }
    const commit = ok => {
      if (ok === false || request !== equipmentRevision) return false;
      // #789: the table the scene actually prepared, read back before the
      // commit. A scene that substituted another table (its probe said yes,
      // or it has none) is refused and the committed tuple is prepared again.
      const built = gated ? prepared?.status?.() : null;
      if (typeof built?.requested_table === 'string'
        && (owner.tableRequestId === null || built.request_id === owner.tableRequestId)) {
        const canonical = (id) => equipmentAlias.canonicalEquipmentId?.('table_id', id) ?? id;
        if (canonical(built.requested_table) !== canonical(next.table_id)) {
          console.warn(`[settings] refused table_id ${next.table_id}: the loaded scene `
            + `prepared ${built.requested_table}`);
          try {
            prepared.prepareEquipment(values.equipment);
            recordSettingsPreparation();
          } catch { /* the scene reports its own failure */ }
          return false;
        }
      }
      options.beforeCommit?.();
      return commitSetting(key, committed, options);
    };
    const result = ready?.then ? ready.then(commit, refuse) : commit(ready);
    if (!result?.then) {
      if (equipmentOwner === owner) {
        equipmentOwner = null; pendingSetting = null; ctx.equipmentPending = false;
      }
      return result;
    }
    ctx.equipmentPending = true;
    const pending = result.finally(() => {
      if (equipmentOwner === owner) {
        equipmentOwner = null; pendingSetting = null; ctx.equipmentPending = false;
      }
    });
    pendingSetting = Object.assign(pending, { key: owner.key, request: owner });
    return pending;
  }

  /** #789: a call-site refusal (equipmentCommitGate with the user's
   * `chosen` axes and the tuple Continue inherited), disclosed on the
   * console; true = refused. */
  function pickRefused(spec, chosen) {
    const gate = equipmentCommitGate(spec, chosen, inheritedEquipment ? { inherited: inheritedEquipment } : {});
    if (gate.ok) return false;
    console.warn(`[settings] refused ${gate.axis} ${gate.id}: ${gate.reason}`);
    return true;
  }

  /** #789: record the axes a commit degraded ({ saved, shown }) in `hold`;
   * an axis already held keeps its saved id (the choice it stands for). */
  function holdDegraded(hold, degraded) {
    for (const [axis, d] of Object.entries(degraded ?? {})) {
      hold[axis] = { saved: hold[axis]?.shown === d.saved ? hold[axis].saved : d.saved, shown: d.shown };
    }
    return hold;
  }

  /** Commit a value, persist, broadcast, and apply side effects. For the
   * 'game' key, returns game.js's ASYNC staging promise — callers that
   * re-rack right after MUST await it (game.setGame resolves the games
   * module on a microtask; a synchronous rerack would still compose the
   * OLD game's rack — the 10-ball-8-ball integration defect). */
  function commitSetting(key, value, options = {}) {
    // `skipStore` (#789): a persisted commit whose localStorage write is
    // suppressed (the boot heyball fallback under a stale flow.js: a degrade
    // is never saved as the choice); the in-memory persisted state still moves
    const { persist: doPersist = true, skipStore = false } = options;
    // GH-229 review nit: mirror load()'s clothColor sanitation on the WRITE
    // path — a programmatic bad id (console, stale caller) must not persist
    // a value the scene will never paint (scene/table.js setClothColor
    // sanitizes its own argument, so blob and scene would silently diverge
    // until the next load()).
    if (key === 'clothColor' && value !== '' && !CLOTH_COLOR_IDS.includes(value)) {
      value = DEFAULTS.clothColor;
    }
    // GH-441: mirror load()'s camera sanitation on the write path (the
    // clothColor law above) — a programmatic bad value must not persist a
    // register the consumer will never pose.
    if (key === 'camera' && value !== 'orbit' && value !== 'overhead') {
      value = DEFAULTS.camera;
    }
    let staged;
    let equipmentSwapped = false;
    if (key === 'equipment') {
      values.equipment = { ...value };
      if (!doPersist && options.verbatim) inheritedEquipment = { ...value };
      else if (options.endInherited) { inheritedEquipment = null; replayGame = null; }
      if (doPersist) {
        const released = releasedAxes(options);
        // #1034: the commit stores into the slot of the game whose tuple is
        // ON THE TABLE. After Continue from a shared replay of another game
        // that is the replay's game (replayGame): the pick belongs to the
        // game being played, and the saved game keeps its own tuple.
        // persistedEquipment (what a reload and restorePersistedEquipment
        // return to) moves only when the two are the same game.
        const slot = replayGame ?? persistedGame;
        const own = slot === persistedGame;
        const pairHeld = {}; // a first visit's degraded default axes (#789)
        // #789 (C): after Continue, only the axes this commit released are
        // stored. An inherited axis keeps playing the replay's id for the
        // session, while its stored id and its hold stay as saved (a reload
        // restores the viewer's own tuple).
        const inherited = inheritedEquipment;
        const base = own ? persistedEquipment : (equipmentByGame[slot] ?? defaultEquipmentFor(slot, pairHeld));
        const stored = inherited ? { ...base } : { ...value };
        if (inherited) {
          for (const axis of released) if (axis in value) stored[axis] = value[axis];
          inheritedEquipment = Object.fromEntries(Object.entries(inherited).filter(([axis]) => !released.has(axis)));
          if (!Object.keys(inheritedEquipment).length) inheritedEquipment = null;
        }
        if (own) persistedEquipment = { ...stored };
        equipmentByGame[slot] = { ...stored };
        // #789: an explicit commit ends the holds of the axes it selected
        // or owns (releasedAxes), even where the pick equals the degraded
        // id shown. The user chose only those axes: an untouched axis still
        // showing its held twin or default stays held, so persist() keeps
        // writing the saved id back and a later fresh boot restores it. A
        // hold whose axis no longer shows its degraded id is pruned (it
        // must not come back when a later commit returns to that id). An
        // axis this commit degraded is held (never saved as the choice); an
        // inherited axis it degraded is session-only, so it is not held.
        const kept = Object.entries({ ...pairHeld, ...heldEquipment[slot] })
          .filter(([axis, h]) => !released.has(axis) && stored[axis] === h.shown);
        const degraded = inherited ? Object.fromEntries(Object.entries(options.degraded ?? {})
          .filter(([axis]) => released.has(axis))) : options.degraded;
        const hold = holdDegraded(Object.fromEntries(kept), degraded);
        if (Object.keys(hold).length) heldEquipment[slot] = hold;
        else delete heldEquipment[slot];
      }
      // the game composes the NEXT rack template from this spec
      ctx.game?.setEquipment(values.equipment);
      const keys = options.restoreKeys ?? options.ownedAxes
        ?? (options.requestKey && options.requestKey !== 'equipment'
          ? [options.requestKey] : Object.keys(previewTx?.eq ?? {}));
      consumePreviewKeys(keys, options);
    } else if (key === 'game') {
      // Scalars stay revertible and shielded until Revert restores them.
      // Only a tuple actually rewritten by this commit owns its axes.
      const prev = values.game;
      values.game = value;
      // #1034: a transient game committed while a replay's verbatim tuple
      // is live is the game that tuple belongs to
      if (!doPersist) replayGame = inheritedEquipment ? value : null;
      if (doPersist) {
        replayGame = null;
        // per-game equipment pairing (feature 012 US4/T049): stash the
        // outgoing game's spec, adopt the incoming game's saved spec — or
        // its cited pairing default on first visit. Transient (replay)
        // game routing NEVER lands here: the sender's equipment flows
        // through setTransientEquipment, persist:false skips the swap.
        if (value !== prev) {
          inheritedEquipment = null; // #789 (C): the incoming game plays its own tuple
          // the outgoing PERSISTED game owns persistedEquipment (the
          // equipment branch's key above): under a session-only game (a
          // drill's sandbox pin, GH-980; a replay's Continue) values.game
          // names another game, and stashing under it overwrote that
          // game's own pairing with this one's tuple
          equipmentByGame[persistedGame] = { ...persistedEquipment };
          // #789: the pairing set() gated (twins in place, held below)
          const next = options.pairing ?? equipmentByGame[value] ?? defaultEquipmentFor(value);
          if (options.degraded && Object.keys(options.degraded).length) {
            heldEquipment[value] = holdDegraded({ ...heldEquipment[value] }, options.degraded);
          }
          persistedEquipment = { ...next };
          equipmentByGame[value] = { ...next };
          values.equipment = { ...next };
          ctx.game?.setEquipment(values.equipment);
          consumePreviewKeys(Object.keys(previewTx?.eq ?? {}), options);
          equipmentSwapped = true;
        }
        // #789 (E16): a store-suppressed switch holds the saved game (the
        // first one it replaced); a stored game commit releases the hold
        const saved = heldGame?.saved ?? persistedGame;
        heldGame = skipStore && value !== saved ? { saved, shown: value } : null;
        persistedGame = value;
      }
      // the NEXT rerack composes this game's rack template (feature 011
      // game.js dispatch — feature-detected: a pre-011 game.js has no
      // setGame and every rack stays the 9-ball template)
      staged = ctx.game?.setGame?.(value);
    } else if (key === 'fixture') {
      // GH-386 venue-default axis: 'auto' re-arms class-following (the
      // fixture then rides the active table's class); a concrete id is an
      // explicit override. `values.fixture` keeps the last explicit pick
      // (write-path sanitation mirrors load() — the clothColor precedent).
      if (value === 'auto') {
        values.fixtureAuto = true;
      } else {
        if (!FIXTURE_IDS.includes(value)) value = DEFAULTS.fixture;
        values.fixture = value;
        values.fixtureAuto = false;
      }
    } else {
      values[key] = value;
    }
    if (doPersist && !skipStore) persist();
    if (key === 'soundOn') ctx.sound?.setMuted(!value);
    if (key === 'volume') ctx.sound?.setVolume(value);
    // main.js wires ctx.applyLook: green→tournament regrades live (look.js is a
    // one-way per-page-load regrade), tournament→green offers a reload
    if (key === 'look') ctx.applyLook?.(value);
    // issue #89: live lighting apply via the feature-detected window seam
    // (scene/lightingvisuals.js leaf — a stale/missing module leaves the
    // canopy identity rig standing; the choice persists either way).
    // GH-386: class-following mode applies through the 'auto' sentinel —
    // the module resolves the active class's venue default itself (a stale
    // pre-386 module treats 'auto' as an unknown id → canopy, the pre-386
    // behavior).
    if (key === 'fixture' || key === 'brightness') {
      window.__lighting?.apply?.(
        values.fixtureAuto ? 'auto' : values.fixture, values.brightness);
      // GH-441 (review r6 P2): a live fixture swap can change whether the
      // ACTIVE luminaire is occluder-fadeable (a stale pre-381 lighting
      // layer lacks fixtureMeshes) — let the camera home re-check and heal
      // an overhead pose that would now stare into an opaque fixture.
      // Feature-detected seam; healthy graphs no-op inside.
      if (key === 'fixture') window.__camhome?.degradeCheck?.();
    }
    // GH-441: the default-camera register applies LIVE through the
    // feature-detected main.js seam (the __lighting shape) — the control
    // flip is also the 'return home' gesture, so the setting is visibly
    // alive the moment it changes. A stale cached main.js without the
    // seam leaves the choice persisted-but-inert, never an error.
    if (key === 'camera') window.__camhome?.apply?.(values.camera);
    // issue GH-229: live cloth re-tint via the feature-detected table.js
    // seam (guarded dynamic import — the aim/preview retuneAssistTone
    // precedent: the module already sits in the boot module map, so this
    // resolves without a fetch; a stale table.js without the export leaves
    // the choice persisted-but-inert, never an error). Runs BEFORE the
    // broadcast below only in .then-queue order — the aim/preview
    // 'clothColor' retunes ride the same resolved-promise queue and land
    // after the apply.
    if (key === 'clothColor') {
      import('../scene/table.js').then((m) => m.setClothColor?.(value))
        .catch(() => { /* persisted-but-inert */ });
    }
    // live locale switch (async dictionary fetch): i18n notifies every
    // onLocaleChange subscriber, which re-renders its own text in place
    if (key === 'language' && value) setLocale(value);
    // issue GH-184: a response-mode flip re-pins the #power step property
    // (fine 0.01 grid floor in perceptual, frozen 0.1 in linear — see
    // pinPowerStep below; hoisted declaration, safe from here)
    if (key === 'powerResponse') pinPowerStep();
    broadcast(key);
    if (key === 'equipment') recordSettingsPreparation();
    // a persisted game switch adopted that game's equipment spec above —
    // every equipment consumer (pickers, scene table rebuild, preview)
    // follows the same ob:settings wire it always has
    if (equipmentSwapped) {
      broadcast('equipment');
      recordSettingsPreparation();
    }
    return staged;
  }

  // ---- game-switch progress overlay (build 20; ui/switchprogress.js) ------
  // The guarded leaf goes on screen in the Continue click's own task, is
  // PRESENTED before set('game') runs the synchronous table build, advances
  // on the build/commit signals in changeGame and leaves at the first
  // settled frame (the leaf owns the paint and the minimum display; this
  // module owns the predicate). The leaf and its sheet are fetched when the
  // confirm opens, so both have normally landed by the time Continue is
  // pressed; a leaf still in flight is waited for at most SWITCH_LEAF_WAIT_MS
  // (review r1 P2: an unbounded wait left the hall live with no feedback for a
  // cold fetch) and past it the switch runs as before, without the overlay.
  const SWITCH_LEAF_WAIT_MS = 250;
  let switchLeaf = null, switchMod = null;
  function prefetchSwitchProgress() {
    if (switchSheetHref && !document.getElementById('ob-switchprogress-css')) {
      // a sheet that has not landed (or failed) leaves the leaf's inline
      // placement: a covering, input-absorbing scrim with readable copy
      const link = document.createElement('link');
      link.id = 'ob-switchprogress-css';
      link.rel = 'stylesheet';
      link.href = switchSheetHref;
      document.head.appendChild(link);
    }
    switchLeaf ??= import('./ui/switchprogress.js').then((m) => { switchMod = m; return m; }, () => null);
    return switchLeaf;
  }
  // settled = the new table is READY (REFUSED hands over to #err), no
  // settings request pending, the hall camera at rest and the lighting
  // rebake settled. The snooker occlusion bake is NOT waited for: it lands
  // in per-frame slices on a live, smooth table (aOccl absent reads fully
  // open until it lands) and can take seconds under load.
  const switchSettled = () => {
    const st = tableBuild()?.status?.()?.status ?? 'READY';
    if (st === 'REFUSED') return 'refused';
    return st === 'READY' && !ctx.equipmentPending
      && window.__shell?.moving?.() !== true
      && ctx.switchFrames?.quiet?.() !== false;
  };
  // the overlay's five strings must all live in the ACTIVE dictionary (the
  // GH-313 hasLocal law; review r2 P2): a cached pre-change dictionary shows no
  // overlay — never English, never a raw key — and the switch runs as before
  const SWITCH_KEYS = ['switch.title', 'switch.phase.table', 'switch.phase.fetch',
    'switch.phase.materials', 'switch.phase.settling'];
  const switchCopyLocal = () => SWITCH_KEYS.every((k) => (typeof i18nNs.hasLocal === 'function' ? i18nNs.hasLocal(k) : has(k)));
  async function beginSwitchProgress(id) {
    if (!switchCopyLocal()) return null;
    try {
      // a landed leaf is used synchronously: the overlay goes in within the
      // Continue click's own task
      const mod = switchMod ?? await Promise.race([prefetchSwitchProgress(),
        new Promise((r) => { setTimeout(() => r(null), SWITCH_LEAF_WAIT_MS); })]);
      if (typeof mod?.showSwitchProgress !== 'function') return null;
      let name = id;
      if (has(`game.${id}`)) name = t(`game.${id}`);
      else { try { name = getGameEntry(id).display_name || id; } catch { /* the id */ } }
      return await mod.showSwitchProgress({ // inserted synchronously; resolves once presented
        title: t('switch.title', { game: name }),
        labels: { table: t('switch.phase.table'), fetch: t('switch.phase.fetch'),
          materials: t('switch.phase.materials'), settling: t('switch.phase.settling') },
        frames: ctx.switchFrames ?? null,
        settled: switchSettled,
      });
    } catch { return null; } // a stale/missing leaf: the switch runs exactly as before
  }

  const api = {
    whenEquipmentReady: () => pendingPreview ?? pendingSetting ?? Promise.resolve(true),
    get: () => ({
      ...values, equipment: { ...values.equipment },
      variants: { ...values.variants },
    }),
    set(key, value, options) {
      const result = set(key, value, options);
      return key === 'equipment' || key === 'game'
        ? afterEquipment(result, equipmentRevision) : result;
    },
    /** Replay-time equipment override (share.js gotoShot): applied, NOT
     * persisted — a shared replay must re-simulate on the SENDER's
     * equipment, not the viewer's, or the records diverge (P-III
     * byte-match). Verbatim (#789): the sender's ids or a refusal, never a
     * twin (equipmentCommitGate). */
    setTransientEquipment(spec) {
      const result = set('equipment', spec, { persist: false, verbatim: true });
      transientEquipment = afterEquipment(result, equipmentRevision);
      return transientEquipment;
    },
    restorePersistedEquipment() {
      const result = set('equipment', persistedEquipment, { persist: false, endInherited: true });
      return afterEquipment(result, equipmentRevision);
    },
    /** Replay-time game override (share.js gotoShot, codec v4): the shared
     * replay re-racks + adjudicates as the SENDER's game; applied, never
     * persisted — mirror of setTransientEquipment (data-model.md §7).
     * Returns the async staging promise — AWAIT it before re-racking. */
    setTransientGame(id) {
      // Older share.js starts equipment synchronously, then awaits this
      // seam. Preserve that order through a first CN8 dependency download.
      const equipment = transientEquipment; transientEquipment = null;
      const applied = afterSet(equipment, () => {
        const result = set('game', id, { persist: false });
        return afterEquipment(result, equipmentRevision);
      });
      return afterEquipment(applied, null); // includes a refused/superseded equipment predecessor
    },
    restorePersistedGame() {
      const result = set('game', persistedGame, { persist: false });
      return afterEquipment(result, equipmentRevision);
    },
    /** User-initiated game switch: validate against the GameCatalog
     * (PLAYABLE entries only — readiness entries are browse-only), confirm
     * (re-rack!), set, re-rack. ASYNC (integration): the rack must not
     * compose before game.js's staging promise resolves — resolves false
     * when declined, unknown, not playable, or refused (replay active —
     * same reason as changeEquipment).
     * Pre-integration guard kept: without the per-game rack dispatch
     * (ctx.game.setGame), only the default game is selectable — otherwise
     * a share encoded as eight_ball would wrap shots that were actually
     * simulated on a 9-ball rack. */
    async changeGame(id, { skipConfirm = false } = {}) {
      if (ctx.replayActive?.()) return false;
      // GH-541 (spec 034 ruling 7, T008): a progressed rack's pending
      // post-shot decision refuses the discipline switch at the API too —
      // the play card's place-side gate covers a stale settings.js, this
      // one-liner covers every direct caller (mixed-vintage law).
      if (decisionConflict()) return false;
      let entry;
      try { entry = getGameEntry(id); } catch { return false; }
      if (entry.readiness !== 'playable') return false;
      // GH-491 review r4 P1: the programmatic backstop of the heyball
      // capability gate — every selection surface (native option,
      // browse card, ?game= boots, e2e drivers) funnels through here
      if (id === 'heyball' && !heyballOffered) return false;
      if (id !== DEFAULT_GAME && typeof ctx.game?.setGame !== 'function') {
        return false;
      }
      if (values.game === id) {
        return afterEquipment(prepareCurrentEquipment('game'), null);
      }
      if (!skipConfirm) {
        // Kit confirm dialog (dialog.js confirmDialog) via guarded dynamic
        // import (cache-poison contract): a stale cached graph missing the
        // new export degrades to window.confirm, never a broken switch.
        // Re-entrancy: while this await is pending the dialog's full-
        // viewport backdrop + focus trap block every user path back into
        // changeGame (select popover, browse rows); e2e drives skipConfirm.
        let ok;
        try { prefetchSwitchProgress(); } catch { /* the switch runs without the overlay */ }
        try {
          const { confirmDialog } = await import('./ui/dialog.js');
          ok = confirmDialog ? await confirmDialog({
            title: t('confirm.switchGameTitle'),
            body: t('settings.gameRerackConfirm'),
            confirmLabel: t('confirm.continue'),
            cancelLabel: t('confirm.cancel'),
          }) : window.confirm(t('settings.gameRerackConfirm'));
        } catch {
          ok = window.confirm(t('settings.gameRerackConfirm'));
        }
        if (!ok) return false;
      }
      // build 20: the progress overlay is on screen BEFORE the table build
      // blocks (never on skipConfirm: scripted pins stay byte-identical). A
      // switch that began while this one presented its overlay (a scripted
      // call: user input is shielded) is newer and wins.
      const seq = ++switchSeq;
      const progress = skipConfirm ? null : await beginSwitchProgress(id);
      if (seq !== switchSeq) { progress?.end(); return false; }
      try {
        const staged = set('game', id), request = equipmentRevision;
        switchProgress = progress; // until the request settles, a newer one ends this overlay (set)
        if (progress && tableBuild()?.status?.()?.status === 'PENDING') progress.pending(); // CN8 transport in flight
        const ok = await staged;
        if (switchProgress === progress) switchProgress = null;
        if (ok === false) {
          progress?.end();
          // Only a committed game-module failure takes the old default
          // fallback. A cancelled/refused table request never replaces the
          // previous game or a later selection.
          if (request === equipmentRevision && values.game === id) {
            const fallback = set('game', DEFAULT_GAME);
            await afterEquipment(fallback, equipmentRevision);
          }
          return equipmentTail(request, false);
        }
        if (request !== equipmentRevision) { progress?.end(); return equipmentTail(request, false); }
        progress?.built();
        ctx.game?.rerack(ctx.game.seed);
        // GH-993: the switched-in discipline starts its stroke like a fresh
        // entry (power, elevation, tip offsets) — the user path only, the
        // auto-close rule's scope below (scripted skipConfirm pins keep their
        // HUD state byte-identical); feature-detected for a stale hud.js
        if (!skipConfirm) ctx.hud?.resetStroke?.();
        // GH-121 auto-close-iff-rerack (header rule): the ACCEPTED confirm just
        // committed a re-racking change — close the shell into the fresh AIM
        // rack. Never on skipConfirm (scripted pins stay byte-identical),
        // never on declines/refusals, and never on the same-id early
        // `return true` above (no confirm, no rerack, no close).
        if (!skipConfirm) api.close?.();
        return equipmentTail(request, true);
      } catch (error) {
        if (switchProgress === progress) switchProgress = null;
        progress?.end(); // a throw inside the switch never leaves input shielded until the cap
        throw error;
      }
    },
    /** User-initiated session-mode switch (issue #68). Refused during a
     * shared replay (the changeGame/changeEquipment law — a mode flip
     * mid-replay would divert the replayed match). No confirm dialog by
     * design: a mode switch is cheap and reversible (recorded decision —
     * the destructive leg only discards an ephemeral sandbox layout).
     *
     * Transition semantics (recorded, issue #68):
     *   play/practice → playground  KEEPS the current table, equipment and
     *     ball layout — the sandbox opens on the position you were just
     *     looking at (flow.js reads the mode live, so judgment suppression
     *     starts with the next settle).
     *   playground → play/practice  FRESH RACK on the same seed — the
     *     sandbox layout is discarded and the rules fold re-seeds cleanly
     *     (and, GH-121, the settings shell auto-closes: this is the only
     *     re-racking mode leg — the auto-close-iff-rerack header rule).
     *   play ↔ practice  no re-rack — practice IS play semantics plus the
     *     #66 drill layer; the selector's Practice option opens the drill
     *     picker (the UI handler owns that hand-off, not this api).
     *
     * Mode ⟺ drill-layer agreement invariant (review F1): a drill may run
     * ONLY while mode === 'practice'. ANY switch to a non-practice mode
     * stops an active drill (its evaluator must never score play or
     * sandbox shots — the pre-fix playground-only stop left a practice →
     * play switch with the drill still running and scoring while the
     * selector claimed Play); the inverse leg lives in drills.js start(),
     * which PINS this selector to practice through this api before a
     * drill goes live (and refuses the start when the pin is refused).
     */
    changeMode(id) {
      if (ctx.replayActive?.()) return false;
      if (!MODE_IDS.includes(id)) return false;
      // GH-541 review remedial (P1 backstop): the playground conversion
      // suspends the fold and its exit re-racks — refuse while a
      // progressed rack's post-shot option pends (decisionConflict above);
      // the address-born pristine class converts freely. Guards the old
      // cached-atelier try-it path too (mixed-vintage law).
      if (id === 'playground' && decisionConflict()) return false;
      const prev = values.mode;
      // GH-541 (spec 034 ruling 7, T008): leaving the sandbox re-racks —
      // refused while a progressed rack's decision pends (the twin of the
      // playground-entry guard above; e2e-play P-E2 direct-API leg).
      if (prev === 'playground' && decisionConflict()) return false;
      if (prev === id) return true;
      set('mode', id);
      if (id !== 'practice') window.__drills?.stop?.(true);
      if (prev === 'playground') {
        // GH-982 (the J9-F5 leg): leaving the sandbox is a fresh ENTRY of
        // play/practice — a new match (breaker seat 1, flow newMatch), never
        // the abandoned game's turn holder; feature-detected (stale flow.js)
        try { window.__rules?.newMatch?.(); } catch { /* seat carries */ }
        ctx.game?.rerack(ctx.game.seed);
        // GH-121 auto-close-iff-rerack: leaving the sandbox is the ONLY
        // re-racking mode leg (fresh rack) — close into it. play ↔ practice
        // and → playground keep the table AND the modal (the playground
        // quick actions live inside it); scripted calls run with the shell
        // closed, where api.close is a no-op.
        api.close?.();
      }
      return true;
    },
    /** User-initiated equipment change on one axis: validate the id,
     * confirm (re-rack!), set, re-rack. ASYNC — Promise<boolean> (contract
     * 015 §4 sanctioned api change; `skipConfirm: true` paths resolve on
     * the same tick's microtask, CDP awaitPromise absorbs it). Resolves
     * false when declined or the
     * id is unknown to the shipped catalog. Refused while a shared replay
     * is active: `values.equipment` then holds the SENDER's transient spec,
     * so merging one axis into it and persisting would overwrite the
     * viewer's saved equipment with the sender's ids on every other axis.
     * Changing the TABLE also engages the entry's recommended cushion-model
     * pairing (the brand's calibrated bank envelope lives on the cushion
     * model, not the table's own geometry/response — catalog.rs
     * `recommended_cushion_model_id`, surfaced here, never by resolve). */
    async changeEquipment(axis, id, { skipConfirm = false } = {}) {
      if (ctx.replayActive?.()) return false;
      if (!AXES.includes(axis) || !catalogEntry(axis, id)) {
        return false;
      }
      // per-game table class (legalTableIds — feature 012 review fix):
      // refuse VISIBLE tables outside the ACTIVE game's class; the picker
      // never offers them, so this guards the programmatic path. ui_hidden
      // legacy ids stay class-EXEMPT — the sanctioned scripted-boot pin
      // ('wpa_generic_9ft', e2e/capture suites) resolves as before.
      if (axis === 'table_id' && !catalogEntry(axis, id).ui_hidden) {
        if (!tableInClass(legalTableIds(values.game), id)) return false;
      }
      if (values.equipment[axis] === id) {
        if (adoptable(axis, id)) {
          // #789 (D2): no confirm, re-rack or close; the gate judges the
          // adopted axis as chosen (a stale SDK without it refuses)
          const staged = set('equipment', { ...values.equipment }, { requestKey: axis, chosen: [axis] }),
            request = equipmentRevision;
          return equipmentTail(request, !(await staged === false || request !== equipmentRevision));
        }
        return afterEquipment(prepareCurrentEquipment(axis), null);
      }
      // review r1 P1 (cloth-demote slice; the the ownership ledger mixed-vintage
      // law): a PRE-R3 cached atelier.js commits DIRECTLY through this
      // seam — its option rows call changeEquipment(axis, id) with no
      // options — so fresh settings refuses NEW selection of a UI-demoted
      // id here too, closing the last picker-vintage route around the
      // preview.stage guard. `skipConfirm: true` IS the sanctioned
      // trusted-pin bypass (every repo scripted pin that stages demoted
      // ids passes it — e2e grandfather legs, e2e-equipment switchEquip;
      // no user-facing vintage ever did: the pre-R3 rows and the shipped
      // degrade commitAxis both call plain). The same-id early return
      // above keeps a grandfathered CURRENT re-commit a lawful no-op,
      // and replay staging (setTransientEquipment) never routes here.
      if (!skipConfirm && uiDemoted(axis, id)) return false;
      // design 277 slice 3 PR-2 (issue GH-283 decision 3): a CUE change is
      // WPA 1.3-legal between shots ("Player's Use of Equipment" — a
      // player may switch among playing/break/jump cues mid-rack), so it
      // costs NO confirm and NO re-rack. The game seam splices the live
      // template's resolved options + provenance tag in place (balls and
      // machine state untouched); the swap binds at the NEXT shot — an
      // in-flight playback keeps its record's cue (records pin the spec
      // at shoot time), which IS the queue semantics for mid-playback
      // swaps. The ob:settings equipment broadcast below repaints the
      // miscue disc (hud.js tip widget) and any other per-axis listener.
      // A stale game.js without the seam falls through to the historic
      // confirm+re-rack path (rule 5 — honest, never a silent no-op), and
      // so does a stale share.js without the cueSwapped recorder guard
      // (review r8 P1: the old recorder would encode a straddling rack
      // under one equipment tuple — the re-rack path resets its log
      // instead, safe on any cache; ctx.shareCueSwapGuard is share.js's
      // ADDITIVE handshake).
      if (axis === 'cue_id' && typeof ctx.game?.swapCue === 'function'
        && ctx.shareCueSwapGuard === true) {
        // #789: the picked cue is the chosen axis (refused, never degraded,
        // when the loaded siblings lack it; its hold ends on commit)
        const staged = set('equipment', { ...values.equipment, [axis]: id },
          { requestKey: axis, chosen: [axis] }), request = equipmentRevision;
        if (await staged === false || request !== equipmentRevision) return equipmentTail(request, false);
        const err = ctx.game.swapCue();
        if (typeof err === 'string' && err.startsWith('reload-required')) {
          // GH-1042 review r2: a cached pre-fix kernel racks snooker/carom on
          // its own cue all session, so no rerack applies the pick — say a
          // reload is needed. Optional copy (GH-313 hasLocal law, webKeyOk
          // form): a cached dictionary without the key falls back to the
          // long-shipped error.reloadPage, never the next-rack line, t()'s
          // en fallback or a raw key.
          console.warn('[settings] cue swap needs a reload:', err);
          const local = (k) => (typeof i18nNs.hasLocal === 'function'
            ? i18nNs.hasLocal(k) : (getLocale() === 'en' && has(k)));
          const key = ['settings.cueSwapReload', 'error.reloadPage'].find(local);
          if (key) ctx.hud?.setHint?.(t(key));
        } else if (err) {
          // splice refused (no active rack / compose error): the spec is
          // set — the NEXT rerack composes it — but the live rack keeps
          // its cue; say so honestly instead of pretending it swapped.
          console.warn('[settings] cue swap deferred to the next rack:', err);
          ctx.hud?.setHint?.(t('settings.cueSwapNextRack'));
        } else {
          ctx.hud?.setHint?.(t('settings.cueSwapNext'));
        }
        return equipmentTail(request, true);
      }
      // GH-534 owner ruling R1 (2026-08-16, PRISTINE-GAME FAST PATH): a
      // re-racking equipment swap on a rack with ZERO shots taken skips the
      // confirm — nothing the re-rack could destroy exists yet (the
      // predicate is the flow.js shotless-session idiom, rackPristine
      // above; fail-closed to the confirm). The commit still re-racks and
      // still auto-closes (GH-121: the close keys on the re-rack, not the
      // dialog). Any progressed rack keeps the shipped confirm verbatim.
      // Contract: the atelier contract (feature 032, internal) §7
      // deviation 5.
      // #789: a pick the loaded siblings cannot play is refused here,
      // before the confirm; set() judges the committed tuple again.
      const chosen = [axis];
      if (pickRefused({ ...values.equipment, [axis]: id }, chosen)) return false;
      if (!skipConfirm && !rackPristine()) {
        // Kit confirm dialog via guarded dynamic import — same degradation
        // law as changeGame above (cache-poison contract: a stale graph
        // missing the export falls back to window.confirm). Re-entrancy:
        // the dialog's backdrop + focus trap block every user path back
        // into changeEquipment while this await is pending.
        let ok;
        try {
          const { confirmDialog } = await import('./ui/dialog.js');
          ok = confirmDialog ? await confirmDialog({
            title: t('confirm.changeEquipmentTitle'),
            body: t('settings.rerackConfirm'),
            confirmLabel: t('confirm.continue'),
            cancelLabel: t('confirm.cancel'),
          }) : window.confirm(t('settings.rerackConfirm'));
        } catch {
          ok = window.confirm(t('settings.rerackConfirm'));
        }
        if (!ok) return false;
      }
      const next = { ...values.equipment, [axis]: id };
      const ownedAxes = [axis];
      if (axis === 'table_id') {
        const rec = catalogEntry(axis, id).recommended_cushion_model_id;
        if (rec && catalogEntry('cushion_model_id', rec)) {
          next.cushion_model_id = rec;
          ownedAxes.push('cushion_model_id');
        }
      }
      const staged = set('equipment', next, { requestKey: axis, ownedAxes, chosen }), request = equipmentRevision;
      if (await staged === false || request !== equipmentRevision) return equipmentTail(request, false);
      // GH-1018: a user commit abandons the rack in play — the new rack
      // re-breaks with the abandoned rack's breaker (flow.js resetMatch)
      ctx.game?.rerack(ctx.game.seed, { abandon: true });
      // GH-121 auto-close-iff-rerack (mirror of changeGame): the user-
      // confirmed equipment commit re-racked — close into the game. Never
      // on skipConfirm, declines, refusals, or the same-id early return
      // (clicking the ACTIVE table's card resolves true with no rerack).
      if (!skipConfirm) api.close?.();
      return equipmentTail(request, true);
    },
    /** GH-534 owner ruling R1 (2026-08-16): the pristine-rack read — zero
     * shots taken this rack (the flow.js shotless-session idiom). The R1
     * confirm fast path and the F2 try-it consent class both key on it. */
    rackPristine: () => rackPristine(),
    /** GH-534 owner ruling R3 (2026-08-16): PREVIEW-THEN-COMMIT — the
     * atelier swap transaction (data-model.md "Swap transaction", amended).
     * stage() applies LIVE through the transient set() path (persist:
     * false); keep() commits under the R1 semantics (pristine = silent,
     * progressed = kit confirm + re-rack); revert() is the exact restore.
     * Preview state is IN-MEMORY ONLY — persist() shields staged scalars,
     * equipment rides its persisted twin. A successor owns only the keys
     * its commit rewrites. Refused during shared replays (the changeEquipment
     * law: values.equipment then holds the sender's transient spec). */
    preview: {
      /** Stage one axis/key. True accepts the request; the table's named
       * pending state remains visible until an async preparation finishes.
       * Keep waits for it and Revert cancels it. False means refusal;
       * while reverting, the truthy refusal is { committed: false,
       * reracked: false, declined: false, reason: 'PREVIEW_REVERT_PENDING',
       * notice: 'atelier.preview.revertPending' }. */
      stage(kind, value) {
        const refusal = previewRefusal('stage');
        if (refusal) return refusal;
        if (ctx.replayActive?.()) return false;
        if (PREVIEW_EQ_AXES.includes(kind)) {
          const committedBase = previewTx?.eq && kind in previewTx.eq
            ? previewTx.eq[kind] : values.equipment[kind];
          // #789: the committed base needs no SDK entry (a held retired
          // digest-row id has none): re-picking it is the lawful un-stage
          const entry = catalogEntry(kind, value);
          if (!entry && value !== committedBase) return false;
          // the per-game table class law guards the preview lane too
          // (mirror of the changeEquipment refusal above)
          if (kind === 'table_id' && entry && !entry.ui_hidden) {
            if (!tableInClass(legalTableIds(values.game), value)) return false;
          }
          // review r1 P1 (table-demote slice; the the ownership ledger mixed-vintage
          // cache-poison law): a STALE cached atelier.js predating a
          // UI_DEMOTED entry still offers its card and stages through THIS
          // seam — the one staging path every picker vintage routes
          // through — so fresh settings enforces the demotion here. The
          // COMMITTED BASE stays exempt (grandfathering: re-picking the
          // base is the lawful un-stage/revert, in and out of a live tx),
          // and the scripted changeEquipment pin stays sanctioned (the
          // grip_fitted precedent) — only NEW user staging refuses.
          if (uiDemoted(kind, value) && value !== committedBase) {
            return false;
          }
          // #789: an id the loaded siblings cannot play is refused before it
          // joins the batch (no preparation, no scene switch, no transaction)
          const picked = [kind];
          if (pickRefused({ ...(previewBatch?.equipment ?? values.equipment), [kind]: value }, picked)) return false;
          // #789 (D2): re-picking the committed base is the un-stage, except
          // on an inherited axis, where it records an adopt for Keep
          if (value === committedBase && adoptable(kind, value)) {
            ((previewTx ??= { eq: {}, sc: {}, reracked: false }).adopt ??= {})[kind] = value;
            if (!previewBatch || previewBatch.equipment[kind] === value) {
              reflectPreview();
              return true;
            }
          } else if (previewTx?.adopt) delete previewTx.adopt[kind];
          const batch = previewBatch ?? { equipment: { ...values.equipment }, bases: {} };
          if (!(kind in batch.bases)) batch.bases[kind] = values.equipment[kind];
          batch.equipment[kind] = value;
          // Fold different axes into the pending spec. The builder reads
          // cloth at apply time; another cloth pick replaces that value.
          // A changed table restarts preparation, superseding the older
          // table request while retaining every other accepted axis.
          if (previewBatch && batch.preparedTable === batch.equipment.table_id) return true;
          previewBatch = batch;
          batch.preparedTable = batch.equipment.table_id;
          previewAttempt++;
          let tx;
          const applied = afterSet(set('equipment', batch.equipment,
            { persist: false, preview: true, requestKey: kind, chosen: picked, beforeCommit() {
              // Publish all accepted axes before synchronous consumers run.
              tx = (previewTx ??= { eq: {}, sc: {}, reracked: false });
              tx.request = batch.request;
              for (const [axis, base] of Object.entries(batch.bases)) {
                if (!(axis in tx.eq)) tx.eq[axis] = base;
                if (tx.eq[axis] === batch.equipment[axis]) delete tx.eq[axis];
              }
              previewDropIfEmpty();
            } }), () => {
            if (rackPristine() && typeof ctx.game?.rerack === 'function'
              && (Object.keys(tx.eq).length || tx.reracked)) {
              ctx.game.rerack(ctx.game.seed); tx.reracked = true;
            } else ctx.game?.syncShadows?.();
            previewDropIfEmpty();
            return true;
          });
          const settled = afterEquipment(applied, batch.request?.revision);
          if (settled?.then) {
            const pending = settled.finally(() => {
              if (pendingPreview === pending) { pendingPreview = null; previewBatch = null; }
            });
            pendingPreview = pending;
            return true;
          }
          pendingPreview = null;
          previewBatch = null;
          return settled;
        }
        if (PREVIEW_SCALARS.includes(kind)) {
          const tx = (previewTx ??= { eq: {}, sc: {}, reracked: false });
          if (!(kind in tx.sc)) {
            tx.sc[kind] = kind === 'fixture' ? fixtureBase() : values[kind];
          }
          set(kind, value, { persist: false });
          // back at the base → un-stage (fixture: BOTH fields must match —
          // 'auto' re-picked after an explicit stage still differs on the
          // mutated last-explicit pick and stays staged)
          const back = kind === 'fixture'
            ? (tx.sc[kind].setter === fixtureSetterValue()
              && tx.sc[kind].explicit === values.fixture)
            : tx.sc[kind] === values[kind];
          if (back) delete tx.sc[kind];
          previewDropIfEmpty();
          return true;
        }
        return false;
      },
      /** null when nothing is staged; otherwise { equipment (axis→base),
       * scalars (key→base), reracking } — bases are COMMITTED truth. */
      active() {
        if (!previewTx) return null;
        return {
          equipment: { ...previewTx.adopt, ...previewTx.eq },
          scalars: { ...previewTx.sc },
          reracking: Object.keys(previewTx.eq).length > 0,
          reverting: previewTx.reverting ? Object.keys(previewTx.eq) : [],
          held: equipmentHold,
        };
      },
      holdEquipment(token) {
        if (typeof token !== 'string' || !token || equipmentHold === token) return;
        equipmentHold = token;
        settleDeferredRevert();
        reflectPreview();
      },
      releaseEquipment(token) {
        if (token == null || token !== equipmentHold) return;
        equipmentHold = null;
        settleDeferredRevert();
        reflectPreview();
      },
      /** Commit the staged transaction (the Keep affordance). R1 semantics:
       * a re-racking stage on a PRISTINE rack commits silently; on a
       * PROGRESSED rack the shipped kit confirm runs first (decline keeps
       * the transaction staged — the caller stays at the station). Scalar
       * stages persist directly (non-re-racking — no confirm class ever).
       * Resolves { committed, reracked, declined }. */
      async keep({ skipConfirm = false } = {}) {
        const refusal = previewRefusal('keep');
        if (refusal) return refusal;
        const revision = previewRevision;
        while (pendingPreview) {
          const pending = pendingPreview, attempt = previewAttempt;
          const ok = await pending;
          if (revision !== previewRevision) {
            return { committed: false, reracked: false, declined: false };
          }
          if (attempt !== previewAttempt) continue; // Keep follows a newer table pick.
          if (ok === false) return { committed: false, reracked: false, declined: false };
          if (pendingPreview === pending) pendingPreview = null;
        }
        if (!previewTx || ctx.replayActive?.()) {
          return { committed: false, reracked: false, declined: false };
        }
        const eqAxes = Object.keys(previewTx.eq);
        // #789 (D2): adopted axes still showing their inherited id; an
        // adopt-only Keep commits them with no confirm, re-rack or close
        const adoptAxes = Object.keys(previewTx.adopt ?? {})
          .filter(axis => !eqAxes.includes(axis) && adoptable(axis, previewTx.adopt[axis]));
        // GH-541 review remedial (P1 backstop): a RE-RACKING commit under a
        // progressed rack's pending post-shot option would destroy the
        // option — refuse at the committing seam itself (the cached
        // pre-GH-541 atelier keepBtn lands here too; the fresh atelier's
        // own gate carries the honest notice). Scalar-only transactions
        // never re-rack and commit freely (review P2).
        if (eqAxes.length && decisionConflict()) {
          return { committed: false, reracked: false, declined: false };
        }
        if (eqAxes.length && !skipConfirm && !rackPristine()) {
          let ok;
          try {
            const { confirmDialog } = await import('./ui/dialog.js');
            ok = confirmDialog ? await confirmDialog({
              title: t('confirm.changeEquipmentTitle'),
              body: t('settings.rerackConfirm'),
              confirmLabel: t('confirm.continue'),
              cancelLabel: t('confirm.cancel'),
            }) : window.confirm(t('settings.rerackConfirm'));
          } catch {
            ok = window.confirm(t('settings.rerackConfirm'));
          }
          // the transaction may have died during the await (station leave
          // reverts; a game switch drops) — nothing left to commit
          if (!previewTx) return { committed: false, reracked: false, declined: false };
          if (!ok) return { committed: false, reracked: false, declined: true };
        }
        const tx = previewTx;
        const lateRefusal = previewRefusal('keep');
        if (lateRefusal) return lateRefusal;
        let next = null;
        // #789: the axes this keep rewrote for the user (releasedAxes) —
        // the staged ones plus an auto-paired recommended cushion, so a
        // held cushion ends exactly as changeEquipment's re-rack ends it
        const ownedAxes = [...eqAxes, ...adoptAxes];
        if (eqAxes.length || adoptAxes.length) {
          next = { ...values.equipment };
          // the recommended-cushion pairing (the changeEquipment law) —
          // unless the user explicitly staged a cushion model herself
          if ('table_id' in tx.eq && !('cushion_model_id' in tx.eq)) {
            const rec = catalogEntry('table_id', next.table_id)
              ?.recommended_cushion_model_id;
            if (rec && catalogEntry('cushion_model_id', rec)) {
              next.cushion_model_id = rec;
              ownedAxes.push('cushion_model_id');
            }
          }
          // #789: refused while the transaction is still live (Revert stays
          // exact): a staged id the loaded siblings can no longer play
          if (pickRefused(next, [...eqAxes, ...adoptAxes])) return { committed: false, reracked: false, declined: false };
        }
        previewTx = null; // committed: later revert hooks are no-ops
        let request = null;
        if (next) {
          const result = set('equipment', next, { chosen: [...eqAxes, ...adoptAxes], ownedAxes });
          request = equipmentRevision;
          if (await result === false || request !== equipmentRevision) {
            return equipmentTail(request, { committed: false, reracked: false, declined: false });
          }
          if (eqAxes.length) {
            ctx.game?.rerack(ctx.game.seed, { abandon: true }); // GH-1018 seat law
            if (!skipConfirm) api.close?.(); // GH-121 auto-close-iff-rerack
          }
        }
        for (const k of Object.keys(tx.sc)) {
          set(k, k === 'fixture' ? fixtureSetterValue() : values[k]);
        }
        return equipmentTail(request, { committed: true, reracked: eqAxes.length > 0, declined: false });
      },
      /** Exact restore of the committed truth (leaving the station or the
       * atelier without Keep). A pristine preview that re-composed the rack
       * re-racks once more on the same seed — byte-identical fresh rack. */
      revert() {
        if (!pendingPreview && !previewTx && !previewBatch) return false;
        const wasReverting = !!previewTx?.reverting;
        const hadPending = !!(pendingPreview || previewBatch);
        if (!previewTx?.reverting) {
          const owner = previewBatch?.request ?? previewTx?.request;
          if (equipmentHold && previewBatch) {
            const tx = (previewTx ??= { eq: {}, sc: {}, reracked: false });
            tx.request = owner;
            for (const [key, base] of Object.entries(previewBatch.bases)) {
              if (!(key in tx.eq) && previewBatch.equipment[key] !== base) tx.eq[key] = base;
            }
          }
          previewRevision++;
          pendingPreview = null;
          previewBatch = null;
          cancelPendingEquipment(owner);
        }
        if (!previewTx) return hadPending;
        const tx = previewTx;
        tx.reverting = true;
        for (const [k, base] of Object.entries(tx.sc)) {
          if (k === 'fixture') {
            // restore BOTH fields: the explicit pick first, then re-arm
            // auto-follow when the base rode it (set() keeps the explicit
            // pick in values.fixture on the 'auto' leg)
            set('fixture', base.explicit, { persist: false });
            if (base.setter === 'auto') {
              set('fixture', 'auto', { persist: false });
            }
          } else {
            set(k, base, { persist: false });
          }
          delete tx.sc[k];
        }
        delete tx.adopt; // #789 (D2): an adopt changed nothing visible
        const settlingEquipment = Object.keys(tx.eq).length > 0;
        const decision = tx.decision;
        previewDropIfEmpty();
        settleDeferredRevert();
        // A synchronous close or a new deferral decision already reflects.
        // An async immediate restore still needs its initial reverting paint.
        if (!wasReverting && (!settlingEquipment
          || (previewTx === tx && tx.decision === decision))) reflectPreview();
        return true;
      },
    },
    // ---- rules variants (feature 022 US2, contracts/registry-api.md §4) ----
    /** Active rules-variant preset id for a discipline: the persisted —
     * or, during a shared replay, the transient — selection. `null` = the
     * family default, which plays the untouched frozen v1 path (FR-005
     * alias law; flow.js resolves ids against the committed artifact's
     * catalog) — EXCEPT for the GH-382 decision-1 live-default families
     * (LIVE_VARIANT_DEFAULTS): an unpinned LIVE frame resolves the
     * completion preset instead. Replay-aware by design: while a shared
     * replay runs, an unpinned read keeps resolving `null` (the RECORDED
     * default — legacy links byte-replay under frozen v1, and the
     * recorder's Continue-from-here pin inherits the sender's rulebook).
     * Chain-gated (the r22 cache-poison law + review r33: the recorder/
     * fold pairing): the live default applies only while the WHOLE
     * GH-382 adapter chain reads true — a stale flow publishes no
     * capability (handing it the completion preset would wedge every
     * snooker frame), and a COLD BOOT's unsettled chain must resolve v1
     * so `share.resetLog`'s pin and `flow.resetMatch`'s fold can never
     * disagree (a short pre-readiness shot would otherwise mint a
     * diverging link: judged v1, recorded full). The flow.js readiness
     * catch-up re-racks the shotless session when the settle flips this
     * read, so the recorder re-pins the upgraded default. */
    variantFor(gameId) {
      const sel = values.variants[gameId] ?? null;
      if (sel !== null) {
        // review r34 P2: the completion preset is chain-bound even when
        // EXPLICITLY selected — a cold/mixed-cache boot resolves v1
        // until the chain reads true, so the recorder pin and the
        // judging fold can never disagree (the persisted twin of the
        // default gate below; the flow.js readiness catch-up re-racks
        // the shotless session when the settle upgrades this read).
        // REPLAYS are exempt: a v2 link's transient pin must reach
        // flow's replay gate as full and REFUSE loudly (fail closed —
        // review r6/r7), never silently downgrade.
        if (sel === 'wpbsa-snooker-full' && !ctx.replayActive?.()
          && ctx.rulesCapabilities?.snookerV2Chain?.() !== true) {
          return null;
        }
        return sel;
      }
      const dflt = LIVE_VARIANT_DEFAULTS[gameId];
      if (!dflt || ctx.replayActive?.()
        || ctx.rulesCapabilities?.snookerV2Chain?.() !== true) {
        return null;
      }
      return dflt;
    },
    /** User-initiated variant selection (settings picker). Persisted per
     * discipline. A live rack is NEVER re-adjudicated (US2 scenario 2):
     * a rack with no settled shot re-racks in place (same seed —
     * deterministic, nothing to lose), otherwise the change applies at
     * the NEXT fresh rack and the HUD says so. `presetId` null/'' = the
     * family default. Refused during a shared replay (the map then holds
     * the SENDER's transient pin).
     * GH-121 boundary: NEVER auto-closes (header rule) — the fresh-rack path
     * is a same-seed IN-PLACE re-fold of an untouched rack with no confirm
     * dialog; the player is comparing citation cards (the adjusting-several
     * case), and e2e-variants V1 drives it with the shell open. */
    changeVariant(gameId, presetId) {
      if (ctx.replayActive?.()) return false;
      const id = presetId || null;
      if ((values.variants[gameId] ?? null) === id) return true;
      if (id === null) delete values.variants[gameId];
      else values.variants[gameId] = id;
      delete persistedVariants[gameId];
      if (id !== null) persistedVariants[gameId] = id;
      persist();
      broadcast('variants');
      if (gameId === values.game && ctx.game) {
        if (ctx.game.shotIndex === 0) ctx.game.rerack(ctx.game.seed);
        else ctx.hud?.setHint?.(t('settings.variantNextRack'));
      }
      return true;
    },
    /** Replay-time variant override (share.js gotoShot, codec v5): the
     * shared replay adjudicates under the SENDER's pinned preset —
     * applied, never persisted (mirror of setTransientGame/-Equipment).
     * `presetId` null = the family default (every legacy link). */
    setTransientVariant(gameId, presetId) {
      const id = presetId || null;
      if (id === null) delete values.variants[gameId];
      else values.variants[gameId] = id;
      broadcast('variants');
    },
    restorePersistedVariants() {
      values.variants = { ...persistedVariants };
      broadcast('variants');
    },
  };
  // GH-382 (review r22 P1, the cache-poison degrade; decision-1 update):
  // the wpbsa-snooker-full preset must not reach rack composition when
  // the adapter chain cannot carry it — a stale flow.js has a generic
  // variant router and would activate snooker-v2 without decision-17/
  // nomination handling (a wedged frame). Since the decision-1 flip the
  // exposure covers the DEFAULT resolution too, not just a persisted
  // selection. A fresh flow publishes ctx.rulesBackendReady: await it,
  // then a still-false chain pins the WORKING selection to the EXPLICIT
  // v1 alias for the session (the persisted copy survives for the next
  // fully-fresh boot; the explicit pin — not a bare clear — keeps every
  // consumer byte-consistent under the flipped default: flow fold,
  // recorder wire, picker, the r15 diverging-link law). NO promise =
  // flow itself is stale: variantFor's default arm is already OFF for
  // it, so only a PERSISTED full selection needs the immediate pin.
  {
    const pinV1 = () => {
      if (ctx.rulesCapabilities?.snookerV2Chain?.() === true) return;
      // never rewrite an ACTIVE replay's transient pin: a v2 link on a
      // stale chain must reach flow's replay gate as 'wpbsa-snooker-full'
      // and REFUSE (fail closed, review r6/r7) — pinning the alias here
      // would fold frozen v1 under a v2 record silently. The live lane
      // re-degrades per-rack through flow's own guard after replay exit.
      if (ctx.replayActive?.()) return;
      // the RAW working value, not variantFor (review r34 P2: the read
      // itself now chain-gates the explicit full preset to null, which
      // is exactly the degrade — this block adds the LOUD warn and the
      // explicit alias pin for the picker/fold surfaces)
      if ((values.variants.snooker ?? null) !== 'wpbsa-snooker-full') {
        return;
      }
      values.variants.snooker = 'wpbsa-snooker';
      broadcast('variants');
      console.warn('[settings] the snooker completion preset '
        + "'wpbsa-snooker-full' needs the GH-382 adapter chain — "
        + 'playing the frozen v1 rules this session');
    };
    if (ctx.rulesBackendReady) {
      Promise.resolve(ctx.rulesBackendReady).then(pinV1, pinV1);
    } else {
      pinV1();
    }
  }

  // #789 the equipment-support predicate and the commit gate over it, on the
  // api object the consumers already hold (share.js ctx.settings, playback.js
  // and atelier.js window.__settings): no new named export into the boot
  // graph (the ownership ledger rule-5 corollary, "Reach new exports via `import *
  // as ns` + feature detection ... with a working degrade path"). Callers
  // feature-detect both per use; a stale settings.js without them keeps the
  // caller's pre-#789 behaviour. Pure reads: neither persists nor notes.
  api.equipmentSupported = (id, kind, axes) => equipmentSupported(id, kind, axes);
  api.tableInClass = (id) => tableInClass(legalTableIds(values.game), id);
  api.equipmentGate = (spec, chosen, opts) => equipmentCommitGate(spec, chosen, opts?.verbatim ? { verbatim: true } : {});
  // #789 the display-name law for equipped ids (shell.js card lines); same
  // api-object reach and feature detection as the gate above
  api.equipmentDigestTwin = (axis, id) => equipmentDigestTwin(axis, id);
  api.equipmentDisplayName = (axis, id) => equipmentDisplayName(axis, id);
  // #789 the render id of a retired card (atelier.js thumbs; same reach)
  api.equipmentMediaId = (axis, id) => equipmentMediaId(axis, id);
  ctx.settings = api;
  // issue GH-142: the ONE slider-fraction ⇄ v0 mapping, shared with the two
  // fraction seams (aimwidgets aw-track, touchwidgets gauge) through the
  // LONG-STANDING `ctx` export (the ctx.replayActive/ctx.applyLook
  // precedent — no new named export into the boot graph, the ownership ledger
  // rule-5 corollary). Consumers feature-detect ctx.powerMap?.* PER CALL
  // (createAim runs BEFORE createSettings — main.js 376 vs 388) and
  // degrade to their own exact linear math: a stale settings.js pairing
  // is pre-GH-142 behavior, never a broken widget. Closures read the LIVE
  // values blob, so a toggle flip needs no re-wiring.
  ctx.powerMap = {
    toV: (x) => powerCurve(x, values.powerResponse),
    toX: (v) => powerCurveInv(v, values.powerResponse),
    mode: () => values.powerResponse,
    // issue GH-184 (ADDITIVE key, same seam law): the write-time release
    // grid. Consumers feature-detect `quant` PER CALL and fall back to
    // their own exact 0.1 rounding — a stale settings.js pairing is
    // pre-184 behavior on the pre-184 step attribute, never a value the
    // un-pinned range sanitizer would eat.
    quant: (v) => powerQuant(v, values.powerResponse),
  };
  // issue GH-184 — #power step pin. MEASURED (Chrome headless-new,
  // 2026-07-25, recorded in the OWNERSHIP GH-184 ledger): the frozen
  // app.html `step="0.1"` attribute SANITIZES programmatic .value writes
  // ('1.53' → '1.5'), and the transient workaround fails too — restoring
  // the step after a step='any' write re-sanitizes the stored value right
  // back. Recorded workaround: pin the step IDL property (runtime
  // attribute only — the frozen app.html source is untouched) to the fine
  // grid's floor 0.01 while the perceptual response is active, back to
  // the frozen 0.1 in linear mode (native slider byte-exact there). Every
  // powerQuant grid value is a 0.01 multiple, so the sanitizer becomes a
  // no-op for grid writes and bounds ANY writer to two decimals (readout
  // honesty holds against every caller). The native #power slider keeps
  // its GH-142 recorded boundary — a DIRECT-VELOCITY v-space editor the
  // curve never touches — with its interaction granularity refined to
  // 0.01 in perceptual mode (recorded deviation; aim.js arrow keys keep
  // their own explicit ±0.1). A linear re-pin can silently snap a live
  // fine value (browser sanitization fires no event), so a changed value
  // re-dispatches 'input' to keep every readout truthful (the dispatch is
  // tick-silent by the touchwidgets producer law: ticks post only from
  // the gauge gesture path).
  function pinPowerStep() {
    const p = document.getElementById('power');
    if (!p) return;
    const v0 = p.value;
    p.step = values.powerResponse === 'linear' ? '0.1' : '0.01';
    if (p.value !== v0) {
      p.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  pinPowerStep();
  // issue GH-146 — cue-aware commanded miscue envelope for the spin dial,
  // shared through the SAME ctx seam as powerMap (rule-5 corollary; every
  // consumer feature-detects PER CALL and degrades to the legacy 0.5R
  // commanded cap). Kernel truth (kernel-api.md Amendment 020): the miscue
  // limit binds the CONTACT offset — a² + b² ≤ 0.25·(1 + tip_radius/R)² —
  // so the commanded radial cap is 0.5·(1 + tip_radius/R) for the EQUIPPED
  // cue and struck ball (nickel/pool ≈ 0.6855R, dime ≈ 0.6566R). Closures
  // read the LIVE values blob, so a cue/ballset switch re-scales the dial
  // with no re-wiring. `scale()` is CEILINGED at the kernel-default pair's
  // limit because the app's fire path validates through the SDK
  // ScenarioBuilder, whose miscue mirror uses the default geometry
  // (dist/pool-sdk/scenario.js build() → validateShot with no cue): a
  // snooker ball (R = 26.25 mm) under the nickel tip would otherwise
  // command up to 0.702R — kernel-legal but builder-rejected. Every pool/
  // carom composition sits under the ceiling; snooker+nickel reaches
  // contact 0.488R instead of 0.5R until the builder mirror is cue-aware.
  ctx.miscue = {
    /** Commanded↔dial scale S = 1 + tip_radius/R (commanded cap = 0.5·S). */
    scale: () => {
      const g = ctx.miscue.geometry();
      return Math.min(1 + g.tip_radius / g.ball_radius, DEFAULT_MISCUE_LIMIT);
    },
    /** Equipped-cue miscue geometry for the SDK validateShot mirror
     * (kernel field names — dist/pool-sdk/shot.js MiscueGeometry). */
    geometry: () => {
      const tip = catalogEntry('cue_id', values.equipment.cue_id)
        ?.params?.tip_radius;
      const ball = catalogEntry('ballset_id', values.equipment.ballset_id)
        ?.params?.r;
      return {
        tip_radius: Number.isFinite(tip) && tip > 0 ? tip : 0.0106,
        ball_radius: Number.isFinite(ball) && ball > 0 ? ball : 0.028575,
      };
    },
  };
  // design 277 slice 3 PR-2 (issue GH-283 decision 3) — the mid-rack cue
  // swap seam for the HUD control (hud.js reaches it via its guarded
  // dynamic settings import; the ctx.miscue precedent):
  ctx.cueSwap = {
    /** Selectable cues: non-demoted catalog entries plus the
     * grandfathered CURRENT id (catalog-v14 superseded law — a persisted
     * branded selection keeps displaying under its own name; it never
     * reappears once switched away from). Localized names via the
     * equipment.<id> keys, kernel display_name fallback (the settings
     * picker's eqName law). #789: a cue a loaded sibling rejects
     * (equipmentSupported, e.g. a stale kernel without a catalog cue) is
     * not listed either, unless it is the current id. */
    options: () => catalogEntries('cue_id')
      .filter((e) => (!e.ui_hidden || e.id === values.equipment.cue_id)
        && (!uiDemoted('cue_id', e.id) || e.id === values.equipment.cue_id)
        && (e.id === values.equipment.cue_id || equipmentSupported(e.id, 'cue').ok !== false))
      .map((e) => ({ id: e.id,
        name: has(`equipment.${e.id}`) ? t(`equipment.${e.id}`)
          : e.display_name })),
    current: () => values.equipment.cue_id,
    /** Between-shots swap — changeEquipment's cue_id fast path (no
     * confirm, no re-rack; binds at the NEXT shot). Promise<boolean>;
     * false during a shared replay (transient sender spec). */
    change: (id) => api.changeEquipment('cue_id', id, { skipConfirm: true }),
  };
  // main.js boot order: createShare filled ctx.game before us, and the
  // first rerack happens after createSettings — the persisted equipment
  // (and, feature 011, the persisted game) must reach the game BEFORE that
  // first rack is composed
  // GH-491 review r6 P1: the capability PRESENCE test — a pre-491 flow
  // ALSO publishes ctx.rulesBackendReady (the GH-382 promise), so the
  // promise cannot distinguish flow vintages; the heyballChain CLOSURE
  // itself can (createFlow declares it synchronously, before
  // createSettings runs — main.js order). No closure = stale flow: a
  // persisted heyball selection must not even STAGE below (the stale
  // generic setGame path would fold heyball without the discipline
  // adapters). The fallback is an HONEST PERSISTED game switch through
  // set('game') (review r9 P2: a bare transient values.game flip left
  // persistedGame at heyball, so the session's equipment edits and the
  // displayed game split-brained) — the per-game EQUIPMENT pairing
  // survives under equipmentByGame['heyball'] like any game switch,
  // and re-picking heyball after an update restores it wholesale.
  heyballOffered = typeof ctx.rulesCapabilities?.heyballChain === 'function';
  if (values.game === 'heyball' && !heyballOffered) {
    console.warn('[settings] heyball needs the GH-491 flow adapter chain '
      + '(stale cached flow.js) — falling back to the default game');
    // #789 (E16): a stale flow.js is itself a mixed-cache module, so the
    // fallback is a degrade, never the user's choice: the switch applies for
    // this session but never writes the blob, with or without another stale
    // sibling, and the saved game stays held (heldGame) until an explicit
    // game commit stores one
    api.set('game', DEFAULTS.game, { skipStore: true });
  }
  ctx.game?.setEquipment(values.equipment);
  const stagedGame = ctx.game?.setGame?.(values.game);
  // boot race (integration): main.js composes the FIRST rack right after
  // createSettings, but game.js's staging is ASYNC — for a persisted
  // non-default game the boot rack may compose as 9-ball before the games
  // module resolves. Re-rack once when the staging lands (same seed,
  // deterministic; no shot can have settled yet — mirror of flow.js's
  // rulesReady catch-up) unless a shared replay already took the table.
  if (values.game !== DEFAULTS.game && stagedGame?.then) {
    stagedGame.then((ok) => {
      if (ok && !ctx.replayActive?.() && ctx.game.shotIndex === 0) {
        ctx.game.rerack(ctx.game.seed);
      }
    }).catch((error) => {
      // #789 (E6): a refused staging or catch-up rack (a kernel that rejects
      // the staged game's equipment) is never swallowed: the boot rack stands,
      // and the refusal is disclosed with the reload recovery on set()'s
      // ob:table-refused wire (main.js reports it).
      console.warn('[settings] boot game staging failed — the boot rack stands:', error);
      window.dispatchEvent(new CustomEvent('ob:table-refused', { cancelable: true,
        detail: { error, recovery: 'reload', message: bootCopy.t('error.reloadMessage', {
          message: 'boot rack refused: ' + String(error?.message ?? error),
        }) } }));
    });
  }
  buildPanel(api);
  // apply persisted sound prefs once sound.js has registered (same tick);
  // re-assert the assist level so preview.js follows the persisted panel
  // value even if its own boot read missed (createPreview runs before us)
  queueMicrotask(() => {
    ctx.sound?.setMuted(!values.soundOn);
    ctx.sound?.setVolume(values.volume);
    broadcast('assist');
    broadcast('assistCuePath');
    // ...and the GH-417 contrast level, for the same reason: previewink.js
    // boot-reads the mirror key, but a blob edited outside persist() (or a
    // pre-heal stale mirror) must still converge on the panel value — the
    // leaf's listener no-ops when the level already matches.
    broadcast('assistContrast');
    // issue #68: announce the persisted mode once at boot so the flow-lane
    // mode indicator (chip strip) paints without waiting for a user switch
    broadcast('mode');
  });
  window.__settings = api; // e2e + STREAM-A read surface
  return api;
}

// ---- panel DOM (settings.js's OWN elements) -------------------------------
// Feature 015 (feature 015 (internal spec)): the 260px drawer is RETIRED. The
// panel is a kit MODAL built on ui/navmodal.js (contract §2 structure; §7 D8:
// the §2 instance ids are assigned HERE, at the consuming call site) with the
// frozen six-section registry (§3). Cache-poison law: navmodal is reached via
// a guarded dynamic import — a stale cached graph missing it degrades to a
// plain stacked panel with the SAME fully-wired native controls (drawer-era
// fallback register), never a black page.

/** Section registry — FIVE sections since feature 032 (program 525 S2):
 * the `equipment` section migrated WHOLESALE to the shell's equipment
 * place (the five-station atelier — the D1 annex RENEGOTIATED-IN-SLICE
 * row executing; contracts/atelier.md §4 law 5). Its complete control
 * inventory owns a named station home (D10 complete-pane rule);
 * `__settings.show('equipment')` routes to the place (the SHIMMED row —
 * api.show below). The S4 successor FOUR-section registry (`assists,
 * display, language, about`) stays frozen by the shell contract §8 annex —
 * effective since `game` migrated to the shell's play place (feature 034,
 * program 525 S4a-mig; default = SECTION_IDS[0] = assists by construction,
 * spec 034 ruling 8). `show('game')` routes to the place (api.show). */
const SECTION_IDS = ['assists', 'display', 'language', 'about'];

const REPO_URL = 'https://github.com/facebookexperimental/openbilliards';

// ---- the gear pill's OWN glyph (GH-246 defect 1) ----------------------------
// #ob-gear may NOT depend on `ui/icons.js` resolving: that module arrives via a
// guarded dynamic import (the cache-poison contract allows "fresh app, absent
// icons.js") and the pill then fell back to a '⚙' TEXT glyph — a visibly
// different, heavier mark that made the whole toolbar read as a cheaper app.
// The path data therefore lives HERE and is emitted as inline SVG at build
// time: zero import edge, nothing to fail, no boot-graph change (#49 rule 5).
// icons.js keeps its own `gear` entry (frozen-stable, still used by
// playback.js's Advanced face); `node web/tools/glyph-audit.mjs` gates the two
// copies BYTE-IDENTICAL, and e2e-playback arm 6d gates the RENDERED markup
// against iconHtml() with icons.js blocked. Convention: the
// `/* OB-GLYPH:<icons.js name> */` marker plus a plain string concatenation.
const GEAR_GLYPH = /* OB-GLYPH:gear */
  '<path d="M8.72 5.06L8.95 2.98A7.1 7.1 0 0 1 11.05 2.98L11.28 5.06'
  + 'A5.1 5.1 0 0 1 12.59 5.61L14.22 4.29A7.1 7.1 0 0 1 15.71 5.78'
  + 'L14.39 7.41A5.1 5.1 0 0 1 14.94 8.72L17.02 8.95A7.1 7.1 0 0 1 '
  + '17.02 11.05L14.94 11.28A5.1 5.1 0 0 1 14.39 12.59L15.71 14.22'
  + 'A7.1 7.1 0 0 1 14.22 15.71L12.59 14.39A5.1 5.1 0 0 1 11.28 14.94'
  + 'L11.05 17.02A7.1 7.1 0 0 1 8.95 17.02L8.72 14.94A5.1 5.1 0 0 1 '
  + '7.41 14.39L5.78 15.71A7.1 7.1 0 0 1 4.29 14.22L5.61 12.59'
  + 'A5.1 5.1 0 0 1 5.06 11.28L2.98 11.05A7.1 7.1 0 0 1 2.98 8.95'
  + 'L5.06 8.72A5.1 5.1 0 0 1 5.61 7.41L4.29 5.78A7.1 7.1 0 0 1 '
  + '5.78 4.29L7.41 5.61Z"/><circle cx="10" cy="10" r="1.9"/>';
/** Inline-SVG markup for inlined path data — byte-identical to what
 * ui/icons.js `iconHtml(name, { size })` emits, so the icons-absent register is
 * INDISTINGUISHABLE from the normal one. Decorative graphic: the OWNING control
 * keeps the localized title/aria-label. */
const inlineGlyph = (paths, name, size = 20) => `<svg viewBox="0 0 20 20"`
  + ` width="${size}" height="${size}"`
  + ` fill="none" stroke="currentColor" stroke-width="1.5"`
  + ` stroke-linecap="round" stroke-linejoin="round"`
  + ` aria-hidden="true" focusable="false" data-icon="${name}">${paths}</svg>`;

function buildPanel(api) {
  switchSheetHref = new URL(`./ui/switchprogress.css?v=${SWITCH_CSS_V}`, import.meta.url).href;
  // Module style consumes tokens.css --ob-* only (ui-kit.md CSS contract).
  // This block keeps ONLY the gear (its 34x34 footprint and 10px offsets are
  // FROZEN — ui-kit.md wave-scope arbitration). The old drawer positioning
  // block is deleted with the drawer (contract §2: no top:52px remnant);
  // every modal-register rule lives in ui/settings-modal.css below.
  const style = document.createElement('style');
  style.textContent = `
    /* GH-668 B-K16: fixed offset = the stale-app.html fallback ONLY
       (#ob-toolbar > * { position: static !important } neutralises it
       once containered); material, rungs, the coarse 44 circle and the
       reduced-motion zeroing are the kit's toolbar part (.ob-btn--glass +
       .ob-toolbar-pill). The pre-GH-246 '⚙' text counter-pad went with
       the id material: the shipped module inlines a symmetric SVG mark. */
    #ob-gear { position: fixed; top: 10px; right: 10px; }
  `;
  document.head.appendChild(style);
  // modal skin (desktop rail-ledger + phone sheet registers): a LEAF
  // stylesheet — if a stale cache never fetches it, the modal renders on
  // kit.css .ob-navmodal alone (skin degrades, function does not).
  // ?v= cache-bust (2026-07-13 owner bug): python -m http.server sends no
  // Cache-Control, so Chrome's heuristic cache pinned a pre-#36
  // settings-modal.css against the fresh #36 card DOM — kit.css's nowrap
  // panel-button recipe then clipped card text mid-word, overlapped tier
  // badges onto neighbor titles, and h-scrolled the modal body. The version
  // lives HERE, in the module that BUILDS the card DOM, so DOM and skin can
  // never drift: a stale settings.js asks for the old skin it matches, a
  // fresh one for the new. Bump on every settings-modal.css change
  // (app.html ?v= discipline; the sheet's own stream, kit/tokens stay 009).
  if (!document.getElementById('ob-settings-modal-css')) {
    const link = document.createElement('link');
    link.id = 'ob-settings-modal-css';
    link.rel = 'stylesheet';
    // v025: GH-245 — A2 range de-baseline (label-vs-slider 3.00px) + the
    // close circle's geometry moving to the kit .ob-btn--icon register
    // v026: feature 034 (525 S4a-mig) — the game-scoped rules left with the
    // pane (mode strip, practice cards, catalog/variant lists, carom row)
    // v027: GH-700 — the phone sheet block gated at the §6 tablet
    // threshold (max-width 1023.98px) + the tablet clause restating the
    // desktop modal register for coarse >= 1024
    // v028: GH-668 B-K23 (S5 kit) — the body's ::-webkit-scrollbar restyle
    // left the sheet (the body wears the kit .ob-scroll); the kit branch and
    // main both pinned 027 against different bytes, so the merge moves the
    // pin past both
    // v029: GH-668 S5 slice 2 G5 (B-SH01 + B-SH07) — rows / toggles / about
    // rows / the phone action bar ride the kit parts (.ob-navmodal__row /
    // __bar / __pane-title, .ob-toggle__state, .ob-control / .ob-caps,
    // .ob-btn--ghost); the sheet's own grid, caps and hover rules left
    // v032: the About plate's Licences region (.ob-about__licences)
    link.href = new URL('./ui/settings-modal.css?v=032', import.meta.url);
    document.head.appendChild(link);
  }

  // localized equipment display name (kernel display_name fallback for
  // future ids that predate their locale keys) — consumed by ctx.cueSwap
  // (the HUD between-shots swap control) and the shell-card summaries; the
  // PICKER surfaces migrated to the atelier (feature 032).
  const eqName = (e) => (has(`equipment.${e.id}`) ? t(`equipment.${e.id}`)
    : e.display_name);
  // control row: the kit .ob-navmodal__row (GH-668 B-K19 — label column +
  // the 320 px control rail; coarse 1fr / minmax(200px, 46%) + the 44 floor)
  // — the sheet owns no grid of its own since S5 slice 2 (B-SH07); the
  // label wears the kit control role (14 sentence, ruling R5) and binds its
  // control with for= (#1052: the kit select names its trigger from the
  // native select's labels — an unbound label named nothing)
  const row = (labelHtml, ctlHtml) =>
    `<div class="ob-set-row ob-navmodal__row">${labelHtml}<div class="ob-set-ctl">${ctlHtml}</div></div>`;
  // toggle row (B-SH07 / B-K19): the SAME row anatomy — label in column 1
  // (for= the checkbox), the checkbox inside its own label in the control
  // column so controls.upgradeToggle wraps THAT label as the kit .ob-toggle
  // (track + the localized state word at the START of the control column,
  // never 590 px from its label)
  const toggleRow = (key, id) => row(
    `<label class="ob-control" for="${id}" data-i18n="${key}"></label>`,
    `<label class="ob-set-toggle"><input type="checkbox" id="${id}"></label>`);

  const gear = document.createElement('button');
  gear.id = 'ob-gear';
  // GH-668 B-K16: the toolbar family part (kit.css); the style block below
  // keeps only the stale-app.html position fallback
  gear.className = 'ob-btn ob-btn--icon ob-btn--glass ob-toolbar-pill';
  gear.setAttribute('aria-haspopup', 'true');
  gear.setAttribute('aria-expanded', 'false');
  // GH-246 defect 1: the gear paints its OWN inlined mark, unconditionally.
  // It used to arrive through a guarded dynamic import of ui/icons.js with a
  // '⚙' TEXT glyph as the fallback — a legal degrade the cache-poison contract
  // allows, but a visibly different (heavier, differently drawn) gear, and the
  // owner rejected that register in the GH-243 review pack. No import edge, no
  // async, nothing to fail. icons.js keeps its own `gear` entry for the long
  // tail (playback.js's Advanced face still routes through it); the two copies
  // are gated BYTE-IDENTICAL by web/tools/glyph-audit.mjs.
  gear.innerHTML = inlineGlyph(GEAR_GLYPH, 'gear');
  // the style block's 1px bottom counter-pad exists only for a stale
  // settings.js's TEXT glyph; this SVG is symmetric, so flex centering alone
  // is exact (e2e-ui J4 asserts icon center == button center ±0.5px)
  gear.style.padding = '0';
  // GH-491 (review r3/r4/r6 P1, the GH-382 cache-poison degrade on the
  // GAME axis): a fresh catalog can carry a game entry the ACTIVATING
  // flow.js / rules chain predates — offer heyball only when the live
  // flow declared its adapter chain. The initial verdict was computed
  // in createSettings BEFORE the persisted-game staging (review r6 P1:
  // the heyballChain CLOSURE's presence is the flow-vintage test — a
  // pre-491 flow publishes ctx.rulesBackendReady too, so the promise
  // cannot serve). A fresh flow's PENDING chain keeps heyball offered
  // through the boot race (flow's own fold guard refuses honestly if
  // the settled chain turns out stale); the settle re-render below
  // withdraws it. Gates BOTH selection surfaces (review r4 P1, as
  // migrated by feature 034): the play card's discipline rail (it follows
  // the `ob:capability` event — contract §4 law 6; a persisted heyball
  // value keeps displaying as the current card) and the changeGame() path
  // itself (the programmatic backstop).
  if (heyballOffered && ctx.rulesBackendReady !== undefined) {
    Promise.resolve(ctx.rulesBackendReady).then(() => {
      const ok = ctx.rulesCapabilities?.heyballChain?.() === true;
      if (ok === heyballOffered) return;
      heyballOffered = ok;
      dispatchCapability(); // 034a-mig T009: the play card follows the flip
    });
  }

  // (the game selector — feature 011 US2 PLAYABLE entries + the readiness
  // browse cards — migrated to the play place's discipline rail with the
  // pane; feature 034. play.js renders it from GAME_CATALOG + the
  // capabilities() read; the selector rule lives there now.)

  // ---- section content (contract §3: every existing control id preserved;
  // <details> disclosure RETIRED for the game catalog — the game cards
  // render always-visible; the equipment section is now a per-axis
  // <details> accordion (issue GH-118 — supersedes the single #ob-eq-advanced
  // cushion disclosure), and the table cards carry a per-card Details
  // disclosure for their dossier text, §7 D11 owner-feedback amendment).
  // Nodes are built detached and adopted into the shell (navmodal `node`
  // option) once — never re-created after that.
  const mkSection = (id, html) => {
    const s = document.createElement('section');
    s.dataset.section = id;
    s.innerHTML = html;
    return s;
  };
  const secEls = {
    // The `game` section MIGRATED to the shell's play place (feature 034,
    // program 525 S4a-mig — the complete-pane rule, design-525:232-257):
    // the issue-#68 mode strip → the play card's back-to-play action + the
    // HUD mode chips; the GH-135/GH-182 practice cards + browse → the
    // practice place (036); the feature-011 game selector + catalog cards,
    // the 022 variant picker and the GH-383 carom fork → the play card's
    // rail / variant list / fork radios. The switch MACHINERY (changeGame,
    // changeVariant, changeMode, set('caromSecondBall'), the GH-541 guards,
    // persistence) all stays HERE — only the pane left; `api.variantRows` /
    // `api.capabilities` are the data seam the card reads. __settings
    // .show('game') routes to the place (api.show below — the annex
    // SHIMMED row analog of `equipment`).
    // The `equipment` section MIGRATED to the shell's equipment place
    // (feature 032, program 525 S2 — the five-station atelier owns the
    // complete pane inventory: cue picker → cues station; table picker +
    // cushion Advanced tier + provenance cards → table; cloth + color
    // chips → cloth; ball set → balls; fixture + brightness → lighting).
    // The swap MACHINERY (changeEquipment, the cue fast path, the
    // clothColor/fixture/brightness set() paths, sanitation, persistence)
    // all stays HERE — only the pane left. __settings.show('equipment')
    // routes to the place (api.show below — the D1 annex SHIMMED row).
    assists: mkSection('assists', `
      ${row('<label class="ob-control" for="ob-set-assist" data-i18n="settings.assist"></label>', `<select id="ob-set-assist">
        <option value="off" data-i18n="settings.assistOff"></option>
        <option value="standard" data-i18n="settings.assistStandard"></option>
        <option value="practice" data-i18n="settings.assistPractice"></option>
      </select>`)}
      ${row('<label class="ob-control" for="ob-set-assist-contrast" data-i18n="settings.assistContrast"></label>', `<select id="ob-set-assist-contrast">
        ${ASSIST_CONTRAST_LEVELS.map((l) => `<option value="${l}"
          data-i18n="settings.assistContrast.${l}"></option>`).join('')}
      </select>`)}
      ${toggleRow('settings.assistCuePath', 'ob-set-assist-cuepath')}
      ${toggleRow('settings.assistWrongBall', 'ob-set-assist-warnball')}
      ${row('<label class="ob-control" for="ob-set-power-response" data-i18n="settings.powerResponse"></label>', `<select id="ob-set-power-response">
        <option value="perceptual" data-i18n="settings.powerPerceptual"></option>
        <option value="linear" data-i18n="settings.powerLinear"></option>
      </select>`)}`),
    display: mkSection('display', `
      ${row('<label class="ob-control" for="ob-set-camera" data-i18n="settings.camera"></label>', `<select id="ob-set-camera">
        <option value="orbit" data-i18n="settings.cameraOrbit"></option>
        <option value="overhead" data-i18n="settings.cameraOverhead"></option>
      </select>`)}
      ${row('<label class="ob-control" for="ob-set-look" data-i18n="settings.look"></label>', `<select id="ob-set-look">
        <option value="tournament" data-i18n="settings.lookSp"></option>
        <option value="green" data-i18n="settings.lookGreen"></option>
      </select>`)}
      ${/* Fullscreen affordance (branch pwa-standalone): CAPABILITY row —
          built only where the element Fullscreen API exists. iPhone Safari
          has none (fullscreenEnabled falsy), so the row never renders
          there; the standalone A2HS launch is the zero-chrome path on that
          platform. Build-time gating (not [hidden]): the capability is
          static for the session, and the kit row / toggle parts pin
          author display, which would outrank a [hidden] row (the makeCard
          cascade law). Transient state, never persisted — wiring below. */
    document.fullscreenEnabled
    ? toggleRow('settings.fullscreen', 'ob-set-fullscreen')
    : ''}
      ${toggleRow('settings.sound', 'ob-set-sound')}
      ${row('<label class="ob-control" for="ob-set-volume" data-i18n="settings.volume"></label>',
    '<input type="range" id="ob-set-volume" min="0" max="1" step="0.05">')}`),
    language: mkSection('language', row(
      '<label class="ob-control" for="ob-set-language" data-i18n="settings.language"></label>',
      `<select id="ob-set-language">
        ${LOCALES.map((l) =>
    `<option value="${l}">${LOCALE_NAMES[l]}</option>`).join('')}
      </select>`)),
    // About (§3 #6): kernel stamp verbatim (lowercase hex from the glue),
    // app name, repo link — existing surfaces, no new data plumbing.
    // 024 help row (the help-overlay contract (feature 024, internal) §4):
    // ONE row in the frozen About section (the 015 six-id registry is
    // untouched). GH-668 S5 slice 2 (B-SH07): the help + bug-report rows
    // are ACTIONS, not citations — they ride the kit control rung as quiet
    // ghost pills (`ob-btn ob-btn--ghost`: 40 / 44 coarse, pill pad, the
    // B-K15 rest / hover / active / focus ladder); the 22 px text-link
    // register and its inline UA resets are gone. Only the real repo LINK
    // keeps the dashed `.ob-about__repo` info voice.
    // Built hidden: visibility is feature-detected against window.__help on
    // EVERY settings-modal open (openShell below), never at build time —
    // the guarded help.js import may still be in flight on a fast gear
    // click, and a stale graph without help.js must hide it harmlessly.
    // Licences row (015 contract §7 D19): an ACTION pill like help / bug
    // report that expands the read-only #ob-about-licences-text region with
    // the third-party notices (wired next to the bug-report row).
    about: mkSection('about', `<div class="ob-about">
      <div class="ob-about__name">openbilliards</div>
      <div class="ob-about__row"><span class="ob-caps" data-i18n="settingsModal.about.kernel"></span>
      <code id="ob-about-kernel" class="ob-about__stamp"></code></div>
      <a id="ob-about-repo" class="ob-about__repo" href="${REPO_URL}"
        target="_blank" rel="noopener noreferrer" data-i18n="settingsModal.about.repo"></a>
      <button type="button" id="ob-about-help" class="ob-btn ob-btn--ghost" hidden
        data-i18n="settingsModal.about.help"></button>
      <button type="button" id="ob-about-bugreport" class="ob-btn ob-btn--ghost"
        data-i18n="settingsModal.about.bugreport"></button>
      <button type="button" id="ob-about-licences" class="ob-btn ob-btn--ghost"
        aria-expanded="false" aria-controls="ob-about-licences-text"
        data-i18n="settingsModal.about.licences"></button>
      <pre id="ob-about-licences-text" class="ob-about__licences ob-scroll" lang="en"
        tabindex="0" hidden></pre>
    </div>`),
  };
  const sectionList = SECTION_IDS.map((id) => secEls[id]);
  // query helpers over the section nodes (they work detached, before the
  // shell mounts, and keep working after adoption — ids never move)
  const q = (sel) => {
    for (const s of sectionList) {
      const n = s.matches?.(sel) ? s : s.querySelector(sel);
      if (n) return n;
    }
    return null;
  };
  const qa = (sel) => sectionList.flatMap((s) => [...s.querySelectorAll(sel)]);

  let kernelStamp = '';
  try { kernelStamp = String(kernel_version()); } catch { /* stale glue */ }
  q('#ob-about-kernel').textContent = kernelStamp;

  (() => {
    // insert sorted by toolbar order so TAB order matches the visual order
    // (CSS `order` alone reorders pixels, not focus — QA minor)
    const tb = document.getElementById('ob-toolbar');
    if (!tb) { document.body.appendChild(gear); return; }
    gear.dataset.tbOrder = '4';
    const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > 4);
    tb.insertBefore(gear, next || null);
  })();

  // ---- kit state (filled by the guarded upgrade block at the bottom;
  // everything below stays fully functional when it never fills) ----------
  let motion = null;             // ui/motion.js namespace, or null (no kit)
  const selectWidgets = [];      // upgradeSelect handles for all 10 selects
  const refreshSelects = () => { // closes open popovers + re-syncs labels
    for (const w of selectWidgets) w.refresh();
  };

  // ---- shell state (modal register via navmodal, or the fallback) --------
  let modal = null;       // navmodal api once the kit shell mounted
  let fallbackEl = null;  // stale-cache stacked panel (drawer-era register)
  let shellEl = null;     // the #ob-settings root, whichever register built
  let open = false;       // explicit state — never read back style.display
  let closing = null;     // IN-FLIGHT close promise (single-flight, GH-121 race)
  let posed = null;       // __settings.show() while closed poses the NEXT open
  let headTitle = null;   // #ob-settings-section-title
  let headHint = null;    // #ob-settings-section-hint

  // per-section head (comp-a: caps title + inline hint; empty hint collapses)
  const syncHead = () => {
    if (!headTitle) return;
    const id = modal?.current() ?? posed ?? SECTION_IDS[0];
    headTitle.textContent = t(`settingsModal.section.${id}`);
    const hk = `settingsModal.hint.${id}`;
    headHint.textContent = has(hk) ? t(hk) : '';
  };

  // (the per-axis badges, group summaries, brightness lux readout and the
  // GH-229 cloth-color chips migrated to the atelier with the equipment
  // pane — feature 032; the atelier re-hosts the chip grammar verbatim)

  // ---- practice pane / mode selector / game catalog cards: MIGRATED ---------
  // (feature 034, program 525 S4a-mig — the complete-pane rule): the
  // GH-135/GH-182 recent-drill cards + browse button live on the practice
  // place (feature 036: `[data-ob="practice-last"]` / `[data-ob="practice-
  // drills"]`), the issue-#68 mode strip on the play place's back-to-play
  // action + the HUD `#ob-mode-chips`, the feature-011 catalog browse cards
  // on the play place's discipline rail (play.js carries the localized
  // display-name rule: game.<id> key, display_name fallback). MODE_IDS,
  // changeMode/changeGame/changeVariant, set('caromSecondBall') and the
  // ob:settings broadcast are UNTOUCHED (spec 034 rulings 2-4).

  // ---- rules-variant picker (feature 022 US2/FR-006, L-APP T019) -----------
  // Preset rows come EXCLUSIVELY from the committed rules artifact's
  // catalog (contracts/registry-api.md §4 — no app-side preset parsing),
  // reached via a guarded dynamic import of the rules backend (cache-
  // poison contract: a stale graph resolves NO rows — `variantRows` stays
  // null and the play card keeps its variant list hidden, degraded but
  // honest, never broken). The DOM half of the picker (select + citation
  // cards) migrated to the play place (feature 034); the DATA half stays
  // here as `api.variantRows` below (plan ruling P3).
  let variantPresets = null; // Map gameId -> catalog presets rows
  import('../dist/pool-sdk/rules/backend.js').then((m) => {
    if (typeof m.rulesCatalogJson !== 'function') return;
    const catalog = JSON.parse(m.rulesCatalogJson());
    variantPresets = new Map();
    for (const g of GAME_CATALOG) {
      if (g.readiness !== 'playable' || !g.ruleset_id) continue;
      // the family's rows are the entry whose default preset carries the
      // FR-005 `aliases` instruction naming this game's frozen ruleset id
      const entry = catalog.rulesets.find((e) =>
        (e.presets ?? []).some((r) => r.aliases === g.ruleset_id));
      if (entry) variantPresets.set(g.id, entry.presets);
    }
    dispatchCapability(); // 034a-mig T009: the play card re-reads variantRows
  }).catch(() => { /* backend absent — synthetic default card stands */ });

  // review GH-382 r25 P2: on a returning-user boot the direct backend
  // import above can resolve BEFORE the flow's capability chain — that
  // first sync reads v2Chain false and hides the completion row with
  // nothing scheduled to bring it back until an unrelated rebuild. One
  // forced resync when the chain's readiness settles (either way: a
  // still-false chain after readiness is genuine staleness and the
  // hidden row is then correct). NO promise = flow itself is stale —
  // the hidden row already tells the truth.
  {
    const resyncOnReady = () => {
      dispatchCapability(); // 034a-mig T009: v2Chain-gated rows re-read
    };
    if (ctx.rulesBackendReady) {
      Promise.resolve(ctx.rulesBackendReady)
        .then(resyncOnReady, resyncOnReady);
    }
  }

  // localized preset display name: the catalog row's displayKey
  // (settings.variant.<id>, all 7 locales) with the raw id fallback for
  // future rows that predate their locale keys
  const variantName = (r) => (r.displayKey && has(r.displayKey)
    ? t(r.displayKey) : r.id);

  // ---- 034a-mig T009: the settings-owned DATA seam for the play place ----
  // (the play contract (feature 034, internal) §7; plan ruling P3). Pure
  // reads — the play card renders its variant list from `variantRows` and
  // follows the `ob:capability` event for the heyball offer + catalog
  // readiness (contract §4 law 6/10). `value` is the alias-aware COMMIT
  // value the resident picker computed (`r.aliases && !liveDflt ? '' :
  // r.id` — a non-live-default family's alias row CLEARS the pin instead
  // of persisting it; review round 2 P2-2) and `current` = `shown ===
  // value` under the GH-382 decision-1 law carried verbatim from the pane.
  // A single-preset family answers [] (the card shows the default line in
  // its summary — spec FR-004); null = the catalog has not resolved yet.
  const variantRowsFor = (gameId) => {
    if (!variantPresets) return null;
    const rows0 = variantPresets.get(gameId) ?? null;
    if (!rows0) return [];
    // GH-382 (review r5, the cache-poison degrade): only offer the
    // completion preset when the live flow declared its adapter
    const v2Chain = ctx.rulesCapabilities?.snookerV2Chain?.() === true;
    const rows = v2Chain ? rows0
      : rows0.filter((r) => r.aliases || r.id !== 'wpbsa-snooker-full');
    const selected = api.variantFor?.(gameId) ?? null;
    const liveDflt = LIVE_VARIANT_DEFAULTS[gameId] ?? null;
    const selRow = rows.find((r) => r.id === selected);
    const shown = liveDflt
      ? (selected ?? rows.find((r) => r.aliases)?.id ?? '')
      : (selected === null || (selRow && selRow.aliases) ? '' : selected);
    return rows.map((r) => {
      const value = r.aliases && !liveDflt ? '' : r.id;
      return { id: r.id, value, tier: r.tier, label: variantName(r),
        desc: `${r.sourceTitle} — ${r.sourceEdition}`, current: shown === value };
    });
  };
  api.variantRows = (gameId) => variantRowsFor(gameId ?? api.get().game);
  api.capabilities = () => ({
    heyball: heyballOffered, variants: variantPresets !== null });
  const dispatchCapability = () => {
    try {
      window.dispatchEvent(new CustomEvent('ob:capability',
        { detail: api.capabilities() }));
    } catch { /* no window / stale graph — play feature-detects */ }
  };
  // localized texts for everything above; re-applied in place on every
  // locale switch — the picker keeps native-language names by design
  const relabel = () => {
    if (shellEl) applyDom(shellEl);
    else for (const s of sectionList) applyDom(s);
    gear.title = t('settings.title');
    shellEl?.querySelector('#ob-settings-close')
      ?.setAttribute('aria-label', t('export.close'));
    syncHead();
    refreshSelects(); // widgets re-read option text (no-op until kit loads)
  };
  relabel();
  onLocaleChange(relabel);

  // the modal covers the HUD's column; the HUD also must leave the TAB
  // order while covered — a keyboard user could focus the invisible #shoot
  // and fire behind the modal (QA major; drawer-era law carried over)
  const hudVis = (show) => {
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.style.opacity = show ? '' : '0';
    hud.style.pointerEvents = show ? '' : 'none';
    hud.inert = !show;
    hud.style.transition = 'opacity var(--ob-t-fast) var(--ob-ease)';
  };
  // Preparation releases its own lock before this synchronous notification.
  // An open settings modal retains its independent keyboard/input lock.
  window.addEventListener('ob:table-state', () => { if (open) hudVis(false); });
  // GH-1053 (settings-modal.md §7 D18, the GH-541 reasoning): the gear
  // is NO LONGER inert while a rules decision pends. The §2 lock kept
  // settings from stacking a re-racking commit (a game change) over a live
  // option; since the game and equipment panes moved to the hall's play and
  // equipment places (features 034/032 — both gate their commits on
  // decisionConflict), nothing left in this modal can re-rack or convert
  // the rack, so the lock protected nothing and left the gear dead with no
  // feedback (at the start of every carom rack: the initialState-born
  // break_spot option). The decision prompt yields under the modal and
  // takes focus back when it closes (dialog.js yieldToOpen + exposeTop,
  // GH-465); the phone sheet's Re-rack row lands on flow.js's own
  // decision gate (GH-990). Mixed-vintage degrade: a STALE flow.js has no
  // such gate (no ctx.rerackDecisionGate) and re-racks on one click, so
  // the pre-1053 lock stands there — matchState-first, the shell.js
  // decisionPending idiom, with the dialog-DOM mirror.
  const staleRerackUnderDecision = () => {
    if (ctx.rerackDecisionGate === true) return false;
    try {
      if ((window.__rules?.matchState?.()?.pendingDecision ?? null) !== null) {
        return true;
      }
    } catch { /* seam absent */ }
    const d = document.getElementById('hud-decision');
    return !!d && d.getClientRects().length > 0;
  };
  const onShellClosed = () => {
    open = false;
    hudVis(true);
    gear.setAttribute('aria-expanded', 'false');
    refreshSelects(); // popovers are body-level fixed ULs: never strand one
  };
  const openShell = () => {
    if (!shellEl) return; // shell still resolving (first-boot microtask)
    // 024 help row visibility law (help-overlay.md §4): re-evaluated on
    // EVERY open against !!window.__help?.open — a stale graph without
    // help.js hides the row harmlessly; a slow guarded import simply shows
    // it on the next open. Never cached at build time.
    const helpRow = q('#ob-about-help');
    if (helpRow) helpRow.hidden = !window.__help?.open;
    // (the issue-#66 drills row + the issue-#68 mode strip re-evaluated
    // their feature detection here on every open — migrated to the
    // practice / play places with the game pane, feature 034)
    // (GH-490 round-12 review r12-r5 P2 — the effective-lux badge re-read
    // on every open — migrated to the atelier's lighting station with the
    // pane; atelier.js syncLux carries the keyTrim honesty law now)
    open = true;
    hudVis(false);
    gear.setAttribute('aria-expanded', 'true');
    if (modal) {
      // default active section on EVERY open: game — unless a show() call
      // posed a section for this open (contract §3 deep-link seam)
      modal.open(posed ?? SECTION_IDS[0]);
      posed = null;
      syncHead();
    } else {
      fallbackEl.style.display = 'block';
    }
  };
  /** Close the shell and RETURN the teardown promise (GH-121 review fix,
   * single-flight): navmodal doClose is idempotent — a SECOND modal.close()
   * while the exit motion still runs resolves IMMEDIATELY (isOpen already
   * false), NOT with the in-flight closePanel. So the first real close is
   * captured in `closing` and handed to every later caller: an awaiter
   * (the practice hand-off below) joins the exit motion + dialog.js's
   * deferred focus-restore instead of racing past them. `closing` clears
   * once ITS close settles (guarded — a reopen-then-close overwrite must
   * survive the stale finally). The fallback register is synchronous. */
  const closeShell = () => {
    if (modal) {
      if (open || !closing) {
        const p = modal.close() // dialog.js exit; onClose resets our state
          .finally(() => { if (closing === p) closing = null; });
        closing = p;
      }
      return closing;
    }
    if (fallbackEl) {
      fallbackEl.style.display = 'none';
      onShellClosed();
    }
    return Promise.resolve();
  };
  gear.addEventListener('click', () => {
    motion?.press(gear);
    if (!open && staleRerackUnderDecision()) return; // stale-flow degrade
    if (open) closeShell(); else openShell();
  });
  // 024 help entry (help-overlay.md §4, FR-009): activation closes the
  // settings modal FIRST via its OWN close path — awaiting closeShell()
  // resolves dialog.js closePanel (panel off the dialog stack, backdrop
  // removed, exit motion done, focus restored to the gear) and onClose has
  // refreshed the popovers — THEN the overlay opens. Sequential hand-off by
  // construction: no double focus trap, no stacked/stranded backdrop. The
  // fallback shell closes synchronously (display flip + onShellClosed).
  // __help is feature-detected at click time (optional-chained): with the
  // overlay module gone the row is hidden anyway (openShell law above).
  q('#ob-about-help')?.addEventListener('click', async () => {
    await closeShell();
    window.__help?.open?.('settings');
  });
  // (the #66 drills entry, the GH-135 recent-drill card hand-off, the #68
  // mode selector and the playground quick actions migrated to the
  // practice / play places with the game pane — feature 034; changeMode
  // keeps the GH-121 auto-close-iff-rerack law byte-identical: leaving the
  // sandbox is the only re-racking mode leg)
  // 025 bug-report row (feature 025 (internal spec) FR-001): the leaf is fetched
  // at ACTIVATION via a guarded dynamic import — unlike the help row there
  // is no cross-module surface to feature-detect at open time, so the row is
  // always built and only degrades if the click-time import fails (disabled
  // + aria-disabled, zero page errors — the cache-poison law). The modal
  // stays open: the platform download UI is the feedback (plan D8), and
  // closing it would discard the user's context for no reason.
  const bugRow = q('#ob-about-bugreport');
  bugRow?.addEventListener('click', async () => {
    try {
      const m = await import('./bugreport.js');
      await m.collectAndDownload?.({ getSettings: api.get });
    } catch {
      bugRow.disabled = true;
      bugRow.setAttribute('aria-disabled', 'true');
    }
  });
  // Licences row (015 contract §7 D19): the third-party notices every bundle
  // must ship (web/vendor/NOTICE-pooltool.txt + LICENSES.md; the notice-
  // inventory gates require them) are shown INLINE, read-only. A link cannot do it: the iOS / macOS shells have no
  // WKUIDelegate, so a target=_blank link is dropped, and a same-frame link
  // would replace the game. Fetched on the first expand: the network on the
  // web (sw.js precaches no .txt / .md), the bundle scheme handler in the
  // apps. The texts stay English (lang="en"); only the label is localized.
  // A failed fetch disables the row until the page reloads (the bug-report
  // degrade above).
  const licRow = q('#ob-about-licences');
  const licText = q('#ob-about-licences-text');
  let licLoad = null;
  licRow?.addEventListener('click', async () => {
    if (licRow.getAttribute('aria-expanded') === 'true') {
      // WebKit does not focus a clicked button: focus left inside the region
      // would fall to <body> when it hides, so it moves to the row
      if (licText.contains(document.activeElement)) licRow.focus();
      licRow.setAttribute('aria-expanded', 'false');
      licText.hidden = true;
      return;
    }
    try {
      licLoad ??= Promise.all(['NOTICE-pooltool.txt', 'LICENSES.md'].map(async (f) => {
        const res = await fetch(new URL(`../vendor/${f}`, import.meta.url));
        if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
        return (await res.text()).trimEnd();
      }));
      licText.textContent = `${(await licLoad).join('\n\n')}\n`;
      licText.hidden = false;
      licRow.setAttribute('aria-expanded', 'true');
    } catch {
      licRow.disabled = true;
      licRow.setAttribute('aria-disabled', 'true');
    }
  });

  // ---- test/deep-link surface (contract §3): live even while closed ------
  api.show = (id) => {
    // D1 annex SHIMMED row, EXECUTED (feature 032 S2 — FR-007/coordinator
    // ruling 7): 'equipment' routes to the SHELL's equipment place (the
    // five-station atelier owns the pane now). Navigation intent honored —
    // the shell opens (or re-poses) at the place under its OWN FR-016
    // entry law: a forbidden state (shared replay, in-flight shot/
    // playback) presents the shell's honest transient refusal notice,
    // never a silent no-op and never a broken modal (GH-541: a pending
    // rules decision no longer forbids entry — it rides along as the
    // shell's answerable prompt and gates only conflicting commits). A
    // modal already open closes first through its own teardown (the
    // drills/help sequential hand-off precedent). Cache-poison degrade: a
    // stale/missing shell module leaves this a recorded no-op (there is
    // no notice surface without the shell chrome).
    if (id === 'equipment') {
      const route = () => {
        const s = window.__shell;
        // poisoned-atelier degrade (review review r2 P2): the shell is
        // healthy and already AT the equipment place but the atelier
        // module never mounted (shell.md §9 dev 9 poison path — the S1
        // stub cards stand with the current-kit summaries) — reselecting
        // the place would be a silent no-op, so say the honest thing: the
        // pane moved and a reload heals the stale cache.
        if (s?.isOpen?.() && s.place?.() === 'equipment'
          && typeof window.__atelier === 'undefined') {
          ctx.hud?.setHint?.(t('atelier.shim.stale'));
          return;
        }
        if (!s?.openShell) {
          // cache-poison degrade (review review r1 P1): a fresh settings.js
          // over a STALE shell-less graph has no place to route and no
          // pane to fall back on — say so honestly through the HUD hint
          // (the cueSwapNextRack register) instead of a silent no-op; the
          // HUD cue-swap control and the settings api remain the working
          // equipment surfaces on such a graph.
          ctx.hud?.setHint?.(t('atelier.shim.stale'));
          return;
        }
        if (s.isOpen?.()) s.go('equipment');
        else s.openShell({ animate: true, place: 'equipment' });
      };
      if (open) closeShell().then(route);
      else route();
      return api.activeSection();
    }
    // `game` MIGRATED to the shell's play place (feature 034, 525 S4a-mig —
    // the annex SHIMMED row analog of `equipment` above; FR-011). Same
    // navigation posture: the shell opens (or re-poses) at the play place
    // under its OWN entry law; an open modal closes first through its own
    // teardown; the poison probe reads `window.__play`, which play.js
    // publishes ONLY as the last statement of its stylesheet-gated
    // mount() — so BOTH degrade rungs (module absent, css failed) read as
    // poisoned and get the honest reload hint instead of a silent no-op.
    if (id === 'game') {
      const route = () => {
        const s = window.__shell;
        if (s?.isOpen?.() && s.place?.() === 'play'
          && typeof window.__play === 'undefined') {
          ctx.hud?.setHint?.(t('shell.place.play.shim.stale'));
          return;
        }
        if (!s?.openShell) {
          // shell-less stale graph: no place to route and no pane to fall
          // back on — say so through the HUD hint (the equipment idiom)
          ctx.hud?.setHint?.(t('shell.place.play.shim.stale'));
          return;
        }
        if (s.isOpen?.()) s.go('play');
        else s.openShell({ animate: true, place: 'play' });
      };
      if (open) closeShell().then(route);
      else route();
      return api.activeSection();
    }
    if (SECTION_IDS.includes(id)) {
      if (open && modal) modal.select(id);
      else posed = id;
      syncHead();
    }
    return api.activeSection();
  };
  api.activeSection = () => (open && modal
    ? modal.current()
    : posed ?? modal?.current() ?? SECTION_IDS[0]);
  /** GH-121 auto-close-iff-rerack seam (header rule): close the shell
   * through the SAME teardown as the close button — closeShell() rides
   * navmodal modal.close() (idempotent doClose → dialog.js closePanel +
   * onClose → onShellClosed: HUD un-inerted, aria-expanded reset,
   * popovers swept) or the stale-cache fallback's display flip. RETURNS
   * the teardown promise (single-flight — a call while a close is already
   * in flight joins it; see closeShell). No-op resolved promise while
   * closed or before the async shell mounts (`open` stays false until
   * openShell ran). */
  api.close = () => (open ? closeShell() : closing ?? Promise.resolve());

  // ---- shell construction: navmodal via guarded dynamic import (cache-
  // poison contract). Absence/failure degrades to the stacked fallback.
  const buildModalShell = (createNavModal) => {
    modal = createNavModal({
      title: t('settings.title'),
      closeLabel: t('export.close'),
      sections: SECTION_IDS.map((id) => ({
        id,
        label: t(`settingsModal.section.${id}`),
        node: secEls[id],
      })),
      onSelect: () => syncHead(),
      onClose: onShellClosed,
    });
    const el = modal.el;
    // contract §2 selector surface, assigned at the call site (§7 D8): the
    // e2e drivers key on these ids, never on .ob-navmodal__* internals
    el.id = 'ob-settings';
    el.classList.add('ob-settings-modal');
    const head = el.querySelector('.ob-navmodal__head');
    const title = head.querySelector('.ob-panel__title');
    title.setAttribute('data-i18n', 'settings.title');
    const closeBtn = el.querySelector('[data-ob="navmodal-close"]');
    closeBtn.id = 'ob-settings-close';
    // §5: the phone tabs are the SAME nav buttons restyled as a pill strip
    // (#ob-settings-tabs) — navmodal's mirrored radio-tab stub is unused
    el.querySelector('[data-ob="navmodal-tabs"]')?.remove();
    const grid = el.querySelector('.ob-navmodal__grid');
    const nav = el.querySelector('[data-ob="navmodal-nav"]');
    nav.id = 'ob-settings-nav';
    nav.querySelector('ul').id = 'ob-settings-tabs';
    for (const b of nav.querySelectorAll('[data-ob="navmodal-item"]')) {
      // the nav rail keeps the CAPS voice (ruling R5: caps for group heads,
      // the nav rail, badges) through the kit role class — the sheet
      // restates no caps literal (B-SH07 / A12)
      b.classList.add('ob-set-nav', 'ob-caps');
      b.setAttribute('data-i18n', `settingsModal.section.${b.dataset.section}`);
    }
    // rail (comp-a "rail ledger"): title + nav + kernel foot in the 208px
    // column; the close button becomes a floating circle on the panel
    const rail = document.createElement('div');
    rail.id = 'ob-settings-rail';
    rail.append(title, nav);
    const kern = document.createElement('div');
    kern.id = 'ob-settings-kernel';
    kern.textContent = kernelStamp; // About plate, mirrored small (§2)
    rail.append(kern);
    grid.prepend(rail);
    head.remove();
    el.append(closeBtn);
    // content pane: sticky section head (title + hint) above the scrolling
    // body — navmodal's holders move into #ob-settings-body ONCE at build
    // (the §2 no-reparent law governs SWITCHING, which stays hidden-only)
    const pane = el.querySelector('[data-ob="navmodal-pane"]');
    pane.id = 'ob-settings-pane';
    const headRow = document.createElement('div');
    headRow.id = 'ob-settings-head';
    headTitle = document.createElement('h2');
    headTitle.id = 'ob-settings-section-title';
    // kit title role (16 sentence, ruling R2) + the B-K19 pane title: on the
    // coarse sheet the SELECTED TAB is the heading, so the kit takes this
    // h2 out of the paint (sr-only) — DISPLAY said once (B-SH07)
    headTitle.className = 'ob-title ob-navmodal__pane-title';
    headHint = document.createElement('span');
    headHint.id = 'ob-settings-section-hint';
    headRow.append(headTitle, headHint);
    const body = document.createElement('div');
    body.id = 'ob-settings-body';
    body.className = 'ob-scroll'; // the kit's one thin-scrollbar rule (GH-668 B-K23)
    body.append(...pane.children);
    pane.append(headRow, body);
    // the shell CSS moves the scroll to the body (#ob-settings-pane is
    // overflow:hidden) — elect it so navmodal's per-section scroll memory
    // records/restores on the element that actually scrolls
    modal.setScroller?.(body);
    // phone-only actions region (§5): the stable mount for 014's
    // Share / Re-rack rows (touchwidgets.js dispatch-clicks mechanism).
    // GH-668 S5 slice 2 (B-SH01): the kit .ob-navmodal__bar — an IN-FLOW
    // footer of the pane under the elected scroller (not an overlay on the
    // modal root), so the VOLUME row scrolls into view and the kit block
    // fade on #ob-settings-body says "more below"; the sheet hides it while
    // the hall is open (body.ob-shell-open — FR-017: gameplay actions are
    // inert under the hall; the rows return the moment the hall closes).
    const actions = document.createElement('div');
    actions.id = 'ob-settings-actions';
    actions.className = 'ob-navmodal__bar';
    pane.append(actions);
    shellEl = el;
  };
  const buildFallbackShell = () => {
    // stale-cache register: one centered plain panel, ALL sections stacked
    // and visible, display-flip open/close + the drawer-era layered Escape
    const el = document.createElement('div');
    el.id = 'ob-settings';
    el.className = 'ob-panel';
    // GH-465 review r10: this shell display-flips itself and never rides
    // ui/dialog.js openPanel, so the kit's panel stack cannot see it —
    // the [data-ob-layer] marker declares it as an EXTERNAL covering
    // layer so below-able panels (the decision prompt) stand down while
    // it shows instead of trapping Tab/Escape beneath it. A stale cached
    // dialog.js ignores the attribute (inert data-*): pre-465 behavior.
    el.dataset.obLayer = 'modal';
    el.style.cssText = 'position:fixed;inset:0;margin:auto;z-index:70;'
      + 'display:none;width:min(720px,92vw);height:min(620px,86vh);'
      + 'overflow-y:auto;';
    const title = document.createElement('b');
    title.className = 'ob-panel__title';
    title.setAttribute('data-i18n', 'settings.title');
    el.append(title, ...sectionList);
    for (const s of sectionList) s.hidden = false; // all visible, stacked
    document.body.appendChild(el);
    fallbackEl = el;
    shellEl = el;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !open) return;
      // layered close: a FOCUSED combobox consumes its own Escape
      // (select.js stops propagation), so this sees at most a popover whose
      // button lost focus — close the popover first, the panel next.
      if (document.querySelector('[data-ob="select-list"]')) {
        refreshSelects();
        return;
      }
      closeShell();
    });
  };
  (async () => {
    let createNavModal = null;
    try {
      ({ createNavModal } = await import('./ui/navmodal.js'));
    } catch { /* kit absent: fall through to the stacked register */ }
    try {
      if (createNavModal) buildModalShell(createNavModal);
      else buildFallbackShell();
    } catch {
      if (!shellEl) buildFallbackShell();
    }
    relabel(); // shell chrome (nav labels, head, close) joins the i18n pass
    sync();
  })();

  const assist = q('#ob-set-assist');
  const assistContrast = q('#ob-set-assist-contrast'); // issue GH-417
  const sound = q('#ob-set-sound');
  const volume = q('#ob-set-volume');
  const cuePath = q('#ob-set-assist-cuepath');
  const warnBall = q('#ob-set-assist-warnball'); // issue #88
  const powerResp = q('#ob-set-power-response'); // issue GH-142
  const camera = q('#ob-set-camera');
  const look = q('#ob-set-look');
  const fullscreen = q('#ob-set-fullscreen'); // null where the API is absent
  const language = q('#ob-set-language');
  // (the five equipment-axis pickers + fixture/brightness controls
  // migrated to the atelier — feature 032; the demoted-option law now
  // lives on the atelier's option rows + ctx.cueSwap.options)
  // kit toggle STATE WORDS follow programmatic .checked writes (review r2 P2 on
  // the S5 slice-2 PR): assigned once the kit widgets mount; a no-op before.
  let syncToggleWords = () => {};
  const sync = () => {
    const v = api.get();
    // (the game selector's replay lock + the 022 variant controls
    // migrated to the play place — feature 034; changeGame still refuses
    // during a shared replay and play.js mirrors the lock on its cards)
    assist.value = v.assist;
    assistContrast.value = v.assistContrast; // issue GH-417
    cuePath.checked = v.assistCuePath;
    warnBall.checked = v.assistWrongBall; // issue #88
    powerResp.value = v.powerResponse; // issue GH-142
    sound.checked = v.soundOn; volume.value = String(v.volume);
    syncToggleWords(); // .checked writes emit no change event — the words re-sync here
    // silent .value write above → refill the kit slider track directly (an
    // 'input' dispatch here would re-enter set('volume') → broadcast → sync)
    volume.__obSlider?.sync?.();
    camera.value = v.camera;
    look.value = v.look;
    language.value = v.language || getLocale(); // '' (auto) shows the resolved locale
    // GH-383: game.js receives the persisted paint on every sync (boot +
    // broadcast) — no DOM dependency; spec 034 FR-009 boot law (the carom
    // fork's select migrated to the play place; this line is the ONLY
    // boot-time application, so a profile persisted as `marked` paints the
    // first rack on a straight-to-AIM boot where play never mounts)
    ctx.game?.setCaromSecondBall?.(v.caromSecondBall);
    refreshSelects(); // widget labels/disabled follow the silent writes above
  };
  sync();
  window.addEventListener('ob:settings', sync); // external set() → reflect
  assist.addEventListener('change', () => {
    api.set('assist', assist.value);
    // (GH-200: the assist-keyed recent-card best line re-rendered here —
    // the cards live on the practice place now, feature 034/036)
  });
  sound.addEventListener('change', () => api.set('soundOn', sound.checked));
  assistContrast.addEventListener('change', // issue GH-417 contrast level —
    // non-re-racking tweak (the GH-121 rule): commits live, never auto-closes
    () => api.set('assistContrast', assistContrast.value));
  cuePath.addEventListener('change', () => api.set('assistCuePath', cuePath.checked));
  warnBall.addEventListener('change', // issue #88 wrong-ball warning toggle
    () => api.set('assistWrongBall', warnBall.checked));
  powerResp.addEventListener('change', // issue GH-142 power-response curve
    // non-re-racking tweak (the GH-121 rule): commits live, never auto-closes
    () => api.set('powerResponse', powerResp.value));
  volume.addEventListener('input', () => api.set('volume', Number(volume.value)));
  camera.addEventListener('change', () => api.set('camera', camera.value));
  look.addEventListener('change', () => api.set('look', look.value));
  // Fullscreen toggle (branch pwa-standalone): TRANSIENT capability state,
  // never persisted (a saved "fullscreen: on" could not honor itself on the
  // next boot — requestFullscreen needs a user gesture). The row exists
  // only when document.fullscreenEnabled (built above); the checkbox always
  // mirrors the DOM truth: fullscreenchange covers Esc/system exits, and a
  // DENIED request (gesture credit expired, permissions policy) re-syncs
  // the knob instead of letting it lie.
  if (fullscreen) {
    const reflectFs = () => { fullscreen.checked = !!document.fullscreenElement; syncToggleWords(); }; // Esc / denied request: the word follows the knob
    document.addEventListener('fullscreenchange', reflectFs);
    fullscreen.addEventListener('change', () => {
      const p = fullscreen.checked
        ? document.documentElement.requestFullscreen()
        : (document.fullscreenElement ? document.exitFullscreen() : null);
      Promise.resolve(p).catch(() => {}).then(reflectFs);
    });
  }
  // (the fixture select + brightness slider — issue #89 — migrated to the
  // atelier's lighting station with the pane; set('fixture'/'brightness')
  // and the __lighting apply wires stay HERE, unchanged)
  language.addEventListener('change', () => api.set('language', language.value));

  // ---- progressive kit upgrade (cache-poison contract: guarded dynamic
  // import — a heuristic-stale cache graph missing ui/* degrades to the
  // fully-wired native controls above, never a black page). Runs after the
  // initial relabel(): upgradeSelect snapshots option text, which is empty
  // until relabel fills it. Motion helpers are only invoked from the event
  // handlers above (never at import time — motion.js is import-safe).
  (async () => {
    let kit;
    try {
      kit = {
        motion: await import('./ui/motion.js'),
        select: await import('./ui/select.js'),
        controls: await import('./ui/controls.js'),
      };
    } catch {
      return; // kit absent: native panel keeps working (cache-poison law)
    }
    motion = kit.motion;
    // (the game / variant / carom-fork selects left the loop with the game
    // pane — feature 034; the GH-443 short closed-label seam went with the
    // variant picker, whose card list on the play place needs no closed
    // control)
    for (const sel of [assist, assistContrast, powerResp, camera, look,
      language]) {
      selectWidgets.push(kit.select.upgradeSelect(sel, {}));
    }
    // toggles wear the kit state word beside the track (GH-668 B-K19 /
    // B-SH07: `states` = this surface's localized On / Off, ×7 locales);
    // re-labelled in place on every locale switch (idempotent per label).
    // review r3 P2: the state word is OPTIONAL kit copy, supplied only when
    // the ACTIVE dictionary carries BOTH keys (hasLocal — the slice-2 idiom;
    // the ownership ledger: dictionaries are cached independently of the modules, so
    // a fresh settings.js can meet a cached pre-slice dictionary). Otherwise
    // the toggle keeps the kit's pre-B-K19 rendering — track, no word: the
    // word (if an earlier fresh dictionary created it) is emptied through
    // the kit's own idempotent re-label and hidden, never t()'s en fallback
    // or a raw key. Re-picked on every locale switch (fresh -> stale empties,
    // stale -> fresh restores).
    const hasLocal = (k) => (typeof i18nNs.hasLocal === 'function' ? i18nNs.hasLocal(k) : has(k));
    const relabelToggles = () => {
      const local = hasLocal('settings.on') && hasLocal('settings.off');
      const states = local ? { on: t('settings.on'), off: t('settings.off') } : { on: '', off: '' };
      for (const el of [sound, cuePath, warnBall, fullscreen]) {
        if (!el) continue; // issue #88 warnBall; fullscreen capability-built (absent on iPhone)
        const label = kit.controls.upgradeToggle(el, { states });
        const word = label?.querySelector?.(':scope > .ob-toggle__state');
        if (word) word.hidden = !local;
      }
    };
    relabelToggles();
    syncToggleWords = relabelToggles; // upgradeToggle is idempotent per label and re-reads .checked
    onLocaleChange(relabelToggles);
    kit.controls.upgradeSlider(volume);
    sync(); // widget labels/disabled + slider fill reflect current values
  })();
}
