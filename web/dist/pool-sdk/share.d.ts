// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { ClothPresetId } from './shot.js';
import type { EquipmentIds } from './types.js';
import type { GameId } from './games/catalog.js';
/** Version tag for the share-string format (bump on breaking changes).
 * v7 (replay seat identity, GH-448 — contracts/share-codec.md Amendment
 * v7) appends ONE element at index 12: `breaker` — the hotseat seat
 * (1 | 2) that broke the recorded session's first rack. Encoders ALWAYS
 * write it explicitly (recorded provenance is self-describing — the v5
 * discipline); replay pins its match fold to it, so a transport scrub
 * (⏮) re-folds the identical frame instead of inheriting whatever seat
 * the previous pass left live. v1–v6 links decode as `breaker: 1` — the
 * seat every legacy replay's fresh-boot FIRST pass always folded on
 * (flow.js boots the hotseat at seat 1), derived from the wire alone,
 * never from live UI state — so historic links replay every scrub pass
 * exactly like their reference first pass.
 * v6 (playground share fidelity, issue #68 follow-up —
 * contracts/share-codec.md Amendment v6) appends TWO elements:
 * index 10, the FREE-PLACEMENT axis — every committed sandbox placement
 * event `[shotIndex, ball, x, y]` (any ball id, cue = 0) in COMMIT
 * ORDER, tagged with the shot index it precedes (undo/redo restores are
 * just more committed events in order — the axis is an event log, never
 * a keyed map); and index 11, the SENDER-MODE flag (0 judged play /
 * practice, 1 playground) so the replay lane suppresses rules judgment
 * exactly like the sender's session did. v1–v5 links decode as
 * `moves: []`, `mode: 'play'` — byte-identical replay, never prompting.
 * v5 (rule variants, feature 022 — contracts/share-codec.md, FROZEN)
 * appends ONE element at index 9: `variant` — the session's rules-variant
 * preset id (string). Encoders ALWAYS write it explicitly (a default
 * session writes the family default id, e.g. `"wpa-8ball"`): recorded
 * provenance is self-describing, never implicit. v1–v4 links decode to
 * the decoded game's DEFAULT preset and replay byte-identically to their
 * pre-022 behavior (decode rule 1 — the default preset routes through the
 * frozen v1 ruleset id per the catalog `aliases` row); an UNKNOWN variant
 * id throws (never a silent fallback to a different rulebook).
 * v4 (multi-game wave, feature 011 — contracts/share-codec-v4.md, FROZEN)
 * appends the GAME AXIS: the GameCatalog id plus the recorded per-shot
 * calls/decisions tuples `[shotIndex, kind, a, b]` (called ball+pocket,
 * safety calls, rulebook option choices) — without them an 8-ball replay
 * could not reproduce its adjudications (FR-006). v1–v3 links decode as
 * `game: 'nine_ball'`, `calls: []`, never prompting.
 * v3 (equipment-catalog wave, issue #15) encodes the FULL equipment
 * composition (five catalog ids) and RETIRES the v2 `preset` + `cloth`
 * pair — the options preset was always the cushion-model axis in disguise,
 * so it folds into `equipment.cushion_model_id`. Older shares stay
 * decodable: v2's preset/cloth map into the spec
 * (preset→cushion_model_id, cloth→cloth_id, other axes default); v1
 * predates cloth selection (preset→cushion_model_id, all else default). */
export declare const SHARE_FORMAT_VERSION = 7;
/** One committed free-placement event (codec v6 moves axis): ball `ball`
 * (kernel id; 0 = cue) was committed at kernel (x, y) through the
 * playground free-placement primitive BEFORE shot `shotIndex` fired.
 * Array order is the sender's commit order (shot indices non-decreasing);
 * an undo restore is simply the next committed event. Coordinates are the
 * FINAL landing point (post clamp/snap/nudge) — replay re-applies them
 * verbatim, so the re-simulated scenario is byte-identical. */
export interface FreePlacement {
    shotIndex: number;
    ball: number;
    x: number;
    y: number;
}
/** Sender session mode (codec v6): `'playground'` = the issue-#68 sandbox
 * (rules judgment suppressed at record time — replay suppresses it the
 * same way); `'play'` = every judged mode (play AND practice). */
export type SenderMode = 'play' | 'playground';
/** Known rules-variant preset ids per game, DEFAULT id FIRST. Pure data
 * (T009 mirror discipline): the eight_ball row mirrors the committed rules
 * artifact's catalog `presets` rows for `eightball-v2` (drift-pinned by
 * share.test.ts against `rules_catalog_json()`); disciplines the catalog
 * ships no preset rows for carry exactly their family default id — the
 * pinned-rulebook v1 behavior every default session records (WPA Rules of
 * Play for 9-ball/one-pocket, WPBSA for snooker, UMB for carom — the
 * 011/012 pinned editions). Future preset families APPEND behind their
 * default (registry-growth repin protocol, registry-api.md §6). */
export declare const GAME_VARIANTS: Readonly<Record<GameId, readonly string[]>>;
/** The family DEFAULT preset id for a game (decode rule 1: every v1–v4
 * link resolves here; the default routes through the frozen v1 ruleset
 * id — FR-005 alias law, never re-adjudicated by a variant engine). */
export declare function defaultVariantFor(game: GameId): string;
/** RULES_VERSION (semver part) of the rules catalog this codec's variant
 * table mirrors — named by the unknown-variant decode error so the reader
 * knows which catalog generation refused the id (contracts/share-codec.md
 * decode rule 3). Drift-pinned against `rules_version()` in share.test.ts;
 * bumps ride the registry-growth repin like every other mirror pin. */
export declare const RULES_CATALOG_VERSION = "0.1.10";
/** Upper bound (inclusive) for rack seeds. This is the CONSUMER's domain:
 * web/app/game.js rerack() clamps seeds to [0, 2^31] so that the derived
 * kernel shot seed (rackSeed * 1000 + shotIndex) stays an exact safe
 * integer / u64. The codec rejects anything above it — otherwise a crafted
 * share would pass validation yet silently re-simulate a DIFFERENT rack,
 * breaking the byte-exact reconstruction contract in the header. */
export declare const MAX_RACK_SEED: number;
/** Rack kinds the kernel can seed (engine.ts `Engine.rack`). Feature 012
 * appends the discipline layouts (`new_rack_scenario` kinds; the
 * game→rack-kind cross-check rides the GameCatalog rack templates:
 * snooker → 'snooker', carom_3cushion → 'carom', one_pocket →
 * 'fifteen'). */
export type RackKind = 'nine' | 'ten' | 'fifteen' | 'snooker' | 'carom';
/** SimOptions preset ids of the v1/v2 wire formats (shot.ts preset
 * factories). Kept for decoding legacy shares — each maps 1:1 onto a
 * cushion-model catalog entry (see PRESET_TO_CUSHION_MODEL). */
export type PresetId = 'default' | 'realistic' | 'mathavan-fitted' | 'grip-fitted';
export declare const PRESET_IDS: readonly PresetId[];
/** Cloth preset ids of the v2 wire format (kernel `ClothPreset::by_name`;
 * kept for decoding legacy shares — 'default' IS the 860-class catalog
 * entry, the rest are already catalog cloth ids). */
export declare const CLOTH_PRESET_IDS: readonly ClothPresetId[];
/** v1/v2 options preset → the equivalent cushion-model catalog id (the
 * app's physics preset was always exactly this axis). */
export declare const PRESET_TO_CUSHION_MODEL: Readonly<Record<PresetId, string>>;
/** One shot's cue-strike params. The kernel ShotParams.seed is DERIVED
 * (game.js: rackSeed * 1000 + shotIndex), so it is not stored. */
export interface SharedShot {
    v0: number;
    phi: number;
    theta: number;
    a: number;
    b: number;
}
/** Sparse per-shot rule inputs beyond physics (codec v4 calls axis; wire
 * tuple `[shotIndex, kind, a, b]`, contracts/share-codec-v4.md). A
 * `decision` with `shotIndex = k` applies AFTER shot k settles and before
 * shot k+1; ordering within equal shotIndex is array order. */
export type ShotAnnotation = {
    shotIndex: number;
    kind: 'call';
    ball: number;
    pocket: number;
} | {
    shotIndex: number;
    kind: 'safety';
} | {
    shotIndex: number;
    kind: 'nominate';
    ball: number;
    freeBall?: true;
} | {
    shotIndex: number;
    kind: 'push';
} | {
    shotIndex: number;
    kind: 'decision';
    decision: number;
    choice: number;
};
/** A complete shareable game. `equipment` is the full catalog-id
 * composition the game was simulated on (replays re-simulate on the
 * SENDER's equipment; v1/v2 shares decode their preset/cloth into it).
 * `placements` records where the cue ball was placed (kernel x, y) before
 * a ball-in-hand shot, keyed by shot index. `game` + `calls` are the v4
 * game axis — legacy v1–v3 strings decode as `game: 'nine_ball'`,
 * `calls: []` (never prompting). `variant` (v5, feature 022) pins the
 * session's rules-variant preset id — legacy v1–v4 strings decode to the
 * game's DEFAULT preset (byte-identical replay, FR-005/FR-007).
 * `moves` + `mode` (v6, issue #68) are the playground axes — the
 * committed free-placement event log and the sender's session mode;
 * legacy v1–v5 strings decode as `moves: []`, `mode: 'play'`.
 * `breaker` (v7, GH-448) pins the hotseat seat (1 | 2) that broke the
 * recorded session's first rack — the replay lane folds its match state
 * from it on every scrub pass; legacy v1–v6 strings decode as
 * `breaker: 1` (the fresh-boot fold seat their first pass always used). */
export interface SharedGame {
    kernelVersion: string;
    formatV: number;
    rackKind: RackKind;
    seed: number;
    equipment: EquipmentIds;
    shots: SharedShot[];
    placements: Record<number, {
        x: number;
        y: number;
    }>;
    game: GameId;
    calls: ShotAnnotation[];
    variant: string;
    moves: FreePlacement[];
    mode: SenderMode;
    breaker: 1 | 2;
}
/** Thrown on malformed/incompatible share strings. */
export declare class ShareError extends Error {
    name: string;
}
/** Encode a game into a URL-safe share string (put it after `#r=`).
 * Always writes the CURRENT format version (v6: game axis + variant id +
 * the playground axes). Transition seam for pre-v4/v5/v6 callers (a stale
 * web/app/share.js): a missing `game`/`calls` encodes as the default
 * nine_ball game with no calls, a missing `variant` encodes as the game's
 * DEFAULT preset id (contracts/share-codec.md §1: encoders always write
 * it explicitly), missing `moves`/`mode` encode as the empty axis in
 * judged play, and a missing `breaker` (pre-v7 caller) encodes seat 1 —
 * identical semantics to every legacy link. */
export declare function encodeShare(game: SharedGame): Promise<string>;
/** Decode a share string. Throws ShareError with a clear message on
 * malformed input or a format-version mismatch. Kernel-version mismatch is
 * NOT an error here — check with `kernelGate` (the UI offers view-anyway). */
/** Additive decode options (GH-491 review r7 P1). */
export interface DecodeOptions {
    /** Games ADDED to the codec after v6 that the CONSUMER declares it can
     * replay. A returning browser can pair a cached pre-GH-491 app
     * `share.js`/`flow.js` with this fresh SDK graph — the stale adapters
     * carry no heyball replay gate, no decision 18-23 map and no heyball
     * fold, so handing them a decoded heyball payload mints a silently
     * divergent replay. Default OFF: a stale caller (no opts — the old
     * call shape) is refused with the actionable update message; a fresh
     * `web/app/share.js` passes `['heyball']` explicitly. */
    acceptGames?: readonly string[];
}
export declare function decodeShare(text: string, opts?: DecodeOptions): Promise<SharedGame>;
/** Kernel compatibility lineage (feature 012, research R7 step 5 —
 * contracts/equipment-additions.md §4): `(old_hash, new_hash)` pairs whose
 * event streams were PROVEN byte-identical by Gate G-KERNEL (the blocking
 * `e2e-share.mjs --corpus` CI job re-simulates the pinned legacy corpus +
 * break fixture on both binaries and byte-diffs). The list is DATA with a
 * CI-enforced proof obligation, not a trust declaration — never add a pair
 * the gate has not proven. [`kernelGate`] suppresses the version warning
 * for lineage-connected versions, with ONE exception: a share on a
 * [`CHINESE8_POCKET_TABLE_IDS`] table minted on the pre-v21 pockets
 * ([`chinese8PocketsMoved`], GH-1080) keeps the warning, because the pairs
 * prove the corpus streams, not those pockets. Every other gate semantic
 * is unchanged. */
export declare const KERNEL_COMPAT_LINEAGE: readonly (readonly [string, string])[];
/** True when `from` reaches `to` through KERNEL_COMPAT_LINEAGE pairs
 * (direct pair or a proven chain old→mid→new). Exported for the DVR's
 * lineage-aware old-kernel badge + diagnostic path (GH-318). NOTE:
 * identical versions return FALSE (there is no self-pair in the ledger)
 * — callers gate on `from !== to` first, or use [`kernelGate`]. */
export declare function lineageCompatible(from: string, to: string): boolean;
/** Kernel-version gate (constitution P-III: cross-version re-simulation is
 * not bit-reproducible). `ok: false` ⇒ show `message` and offer view-anyway.
 * Feature 012: versions connected through [`KERNEL_COMPAT_LINEAGE`] pass
 * silently — their byte identity is mechanically proven by Gate G-KERNEL,
 * so a scary banner on every pre-012 link would be a behavior regression
 * (US4-AS3). GH-1080 exception: a lineage-connected share on a
 * [`CHINESE8_POCKET_TABLE_IDS`] table minted on the pre-v21 pockets is
 * still refused ([`chinese8PocketsMoved`]) — its re-simulation lands on
 * different pockets. */
export declare function kernelGate(game: SharedGame, engineKernelVersion: string): {
    ok: boolean;
    message?: string;
};
/** GH-1042: the kernel stamps whose app racked snooker and carom on the
 * kernel's OWN default pairing (cue `standard` and the discipline's v6
 * table, cloth, ball set and cushion model) whatever equipment the player
 * had selected — and whatever equipment the share link encodes, because
 * the codec writes the selected spec. A snooker/carom share minted on one
 * of these stamps must re-simulate on that pairing to reproduce what the
 * sender saw; the app applies it to the discipline kinds only (game.js
 * composeRack). FROZEN at the fix: every stamp of KERNEL_COMPAT_LINEAGE up
 * to and including `0.1.0+206ceb55` (build 19, the last pre-fix build).
 * Never append to it — a stamp built after the fix racks on the selected
 * spec. Stamps outside the lineage already fail [`kernelGate`] (their
 * view-anyway re-simulation is an informed divergence). */
export declare const KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS: readonly string[];
/** True when a shared game was minted on a kernel stamp whose app racked
 * snooker/carom on the kernel's default pairing
 * ([`KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS`], GH-1042). */
export declare function kernelDefaultDisciplinePairing(game: Pick<SharedGame, 'kernelVersion'>): boolean;
/** GH-1080 (catalog v21): the catalog table ids whose pocket geometry v21
 * moved — `chinese8_pro_9ft` and its resolve-only alias `joy_q8_9ft`
 * (heyball racks on chinese8_pro_9ft, so heyball shares carry it). */
export declare const CHINESE8_POCKET_TABLE_IDS: readonly string[];
/** GH-1080: the kernel stamps that racked chinese8 tables on the pre-v21
 * pockets. A share on a [`CHINESE8_POCKET_TABLE_IDS`] table minted on one
 * of these stamps re-simulates on DIFFERENT pockets under a v21-or-later
 * kernel, so [`kernelGate`] refuses it (the standard warning, view-anyway)
 * even where KERNEL_COMPAT_LINEAGE connects the stamps — the pairs prove
 * every OTHER table byte-identical. FROZEN at v21: every stamp of
 * KERNEL_COMPAT_LINEAGE up to and including `0.1.0+72a839f6`, the last
 * pre-v21 kernel. Never append to it: a stamp built after v21 racks on the
 * v21 pockets. Archived DVR records are untouched by this set: they replay
 * their recorded event streams, which a geometry change cannot alter. */
export declare const CHINESE8_POCKETS_PRE_V21_STAMPS: readonly string[];
/** True when a shared game racked on a chinese8 table was minted on the
 * pre-v21 pockets and is being re-simulated on a kernel that is not
 * ([`CHINESE8_POCKETS_PRE_V21_STAMPS`], GH-1080). A pair between two pre-v21
 * stamps is left as it was before v21: the four stamps that reach the v21
 * kernel (b6b5dc3f, a2b08c21, 206ceb55, 72a839f6; catalog v19-v20) rack
 * identical chinese8 pockets (spec dump), and the older pre-v21 pairs keep
 * their earlier silence, catalog v7's joy_q8_9ft re-derivation included. */
export declare function chinese8PocketsMoved(game: Pick<SharedGame, 'kernelVersion'> & {
    equipment?: Partial<EquipmentIds>;
}, engineKernelVersion: string): boolean;
/** One cut-list entry on the cp wire — the #301 model shape verbatim:
 * `seg` = shot index, `t` = segment-relative anchor in integer
 * centiseconds (0 = the snapped shot boundary), `cam`/`transitionIn` =
 * frozen small-int registry ids, `dur` = transition duration in integer
 * centiseconds (0 = hard cut). */
export interface CameraPlanCut {
    seg: number;
    t: number;
    cam: number;
    transitionIn: number;
    dur: number;
}
/** One custom-tripod pose on the cp wire — the #301 model shape verbatim:
 * `eye`/`look` = kernel-frame [kx, ky, h] in integer millimetres, `fov`
 * in integer decidegrees. */
export interface CameraPlanPose {
    slot: number;
    eye: number[];
    look: number[];
    fov: number;
}
/** The replay camera plan (GH-301 §1.1 frozen shape, integer-quantized). */
export interface CameraPlan {
    cuts: CameraPlanCut[];
    poses: CameraPlanPose[];
}
/** cp wire version tag (its own tiny version discipline, independent of
 * SHARE_FORMAT_VERSION). Bump on breaking cp-layout changes; older builds
 * ignore the whole param either way. */
export declare const CAMERA_PLAN_WIRE_VERSION = 1;
/** Practical share-URL envelope (chars, whole URL). Browsers/WKWebView
 * carry tens of KB (Safari ~80 K) — 8 K keeps a cap-worst plan on a long
 * game far inside every shipped carrier with an order-of-magnitude
 * margin. web/app/share.js enforces it at link build time and DROPS the
 * plan with a visible notice when exceeded (honest degrade — never a
 * silently truncated plan); share.test.ts asserts the measured cap-worst
 * URL sits under it. */
export declare const SHARE_URL_ENVELOPE = 8192;
/** Encode a camera plan into the `cp` param blob. Returns '' for an EMPTY
 * plan (no cuts, no poses) — the caller must then omit the param entirely
 * (empty plan = zero bytes over today's link). Throws ShareError on a
 * plan outside the envelope (the app-side consumer drops the plan with a
 * visible notice — honest degrade, never silent truncation). */
export declare function encodeCameraPlan(plan: CameraPlan, shotCount?: number): Promise<string>;
/** Decode a `cp` param blob. Throws ShareError on malformed/truncated
 * input or an unknown cp wire version — the consumer must catch and
 * IGNORE (one console warn; the replay plays with the default camera).
 * `shotCount` = the carrying share's shot count (open-time
 * cross-validation: every `seg` must index a shared shot). */
export declare function decodeCameraPlan(text: string, shotCount?: number): Promise<CameraPlan>;
