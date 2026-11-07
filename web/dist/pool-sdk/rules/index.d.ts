// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { ShotRecord } from '../record.js';
/** Ruleset discriminator for the rules engine. Feature 012
 * (contracts/rulesets-012.md §1, additive): the union gains the three
 * discipline REGISTRY SLOTS — their `Ruleset` implementations register
 * here when the story lanes land (`snooker.ts` / `carom3c.ts` /
 * `onepocket.ts`); `getRuleset` keeps throwing for not-yet-registered
 * ids. Feature 022 (contracts/registry-api.md §1, additive registry
 * growth): `eightball-v2`, the config-in-state variant engine — a
 * crate-side id with NO TS `Ruleset` wrapper (the app routes variants
 * through the committed artifact's `task_initial_state_json` path;
 * `getRuleset` throws for it, exactly like an unregistered 012 slot). */
export type RulesetId = 'nineball-v1' | 'eightball-v1' | 'snooker-v1' | 'carom3c-v1' | 'onepocket-v1' | 'eightball-v2' | 'fourteenone-v1' | 'tenball-v1' | 'carom3c-v2' | 'snooker-v2' | 'heyball-v1';
export type { NineBallFoul, NineBallGameState, NineBallJudgment, } from './nineball.js';
export { FOUL_LABELS, deriveOnTable, judgeShot } from './nineball.js';
export type { SpotXY } from './respot.js';
export { PLACE_CLEARANCE, clampToBed, footSpot, placementFits, respotBallSpot, respotNineSpot, } from './respot.js';
import * as respotContact from './respot.js';
export declare const snapToContact: typeof respotContact.snapToContact | undefined;
export declare const CONTACT_EPS: number | undefined;
export type { EightBallConfig, EightBallMatchState, Group, PendingDecision, } from './eightball.js';
export { EIGHTBALL_V1_CONFIG, eightballRuleset } from './eightball.js';
export type { OnePocketDecision, OnePocketMatchState } from './onepocket.js';
export { defaultBreakPocketChoice, ONE_POCKET_FOOT_POCKETS, onepocketRuleset, } from './onepocket.js';
export type { SnookerColourId, SnookerMatchState, SnookerPendingDecision, SnookerPhase, } from './snooker.js';
export { snookerRuleset } from './snooker.js';
export type { CaromMatchState, CaromReason } from './carom3c.js';
export { CAROM_BALL_BREAKER, CAROM_BALL_OPPONENT, CAROM_BALL_RED, CAROM_TARGET_DEFAULT, caromBallsInContact, caromRuleset, } from './carom3c.js';
export type { RespotPlacement } from './respot.js';
export { caromRespotPlan } from './respot.js';
export type { CaromLayout } from '../games/layouts.js';
export { CAROM_LAYOUT } from '../games/layouts.js';
export type { FourteenOneMatchState, FourteenOnePending, FourteenOneRerack, } from './fourteenone.js';
export { FOURTEENONE_TARGET_DEFAULT, FOURTEENONE_TARGETS, fourteenoneRuleset, } from './fourteenone.js';
export type { FourteenOneRerackPlan } from './respot.js';
export { centerSpot, fourteenOneRerackPlacements, headSpot, } from './respot.js';
export type { TenBallMatchState, TenBallPending } from './tenball.js';
export { tenballRuleset } from './tenball.js';
export type { HeyballMatchState, HeyballPending } from './heyball.js';
export { heyballRuleset } from './heyball.js';
/** Foul with its rulebook citation — FR-009's "foul reason with rule
 * reference" is data. `code` is the stable wire/i18n key (foul.<code>);
 * `cite` is the pinned rule number (research.md R1 map). */
export interface CitedFoul {
    code: string;
    cite: string;
}
/** Recorded per-shot rule inputs (mirrors the share codec v4 calls axis). */
export type ShotCall = {
    kind: 'call';
    ball: number;
    pocket: number;
} | {
    kind: 'safety';
} | {
    kind: 'nominate';
    ball: number;
    freeBall?: true;
} | {
    kind: 'push';
} | null;
/** Recorded resolution of a PendingDecision (decision/choice enums are
 * per-game; wire encoding frozen in contracts/share-codec-v4.md). */
export interface Decision {
    decision: number;
    choice: number;
}
/** Cue-ball placement right granted to the incoming shooter.
 * `d_zone` (feature 012): snooker in-hand — on/within the D (WPBSA Sec3
 * R5; Sec2 R9); the adapter clamps beside the existing kitchen clamp
 * (game.js placement seam). */
export type PlacementRight = 'none' | 'anywhere' | 'kitchen' | 'd_zone';
export interface Judgment<S> {
    legal: boolean;
    fouls: CitedFoul[];
    pocketed: number[];
    ballInHand: PlacementRight;
    respot: number[];
    turn: 'continue' | 'pass';
    decisionRequired: null | {
        kind: string;
        chooser: 1 | 2 | 'both';
    };
    terminal: null | {
        winner: 0 | 1 | 2;
        reason: string;
        cite: string;
    };
    next: S;
}
export interface Ruleset<S> {
    id: RulesetId;
    /** Initial match state for a fresh rack. Pure. */
    initialState(breaker: 1 | 2): S;
    /** Judge one settled shot. Pure; MUST NOT mutate its inputs; MUST NOT be
     * called when a decision is pending or the match is over (adapter
     * contract). */
    judge(state: S, record: ShotRecord, call: ShotCall): Judgment<S>;
    /** Resolve a pending rulebook option. Pure. Throws RulesError if no
     * matching decision is pending or the choice is out of range. */
    applyDecision(state: S, d: Decision): S;
    /** Match-state summary for HUD/e2e introspection (serializable). */
    hudState(state: S): Record<string, unknown>;
}
export { RulesError } from './errors.js';
/** Wrapper match state for `nineball-v1` (nineball.ts itself only tracks
 * `onTable`; the shared interface additionally needs the seat + result). */
export interface NineBallMatchState {
    shooter: 1 | 2;
    onTable: number[];
    result: null | {
        winner: 1 | 2;
        reason: string;
        cite: string;
    };
}
export declare const nineballRuleset: Ruleset<NineBallMatchState>;
/** Derive the wrapper state for a shot straight from its record (the
 * flow.js seam: prior onTable = the record's initial snapshot). */
export declare function nineballStateFromRecord(record: ShotRecord, shooter: 1 | 2): NineBallMatchState;
/** REGISTERED ruleset ids (the union additionally declares the feature-012
 * slots; the story lanes append here as their implementations land). */
export declare const RULESET_IDS: readonly RulesetId[];
/** Registry lookup. Throws RulesError on an unknown id. */
export declare function getRuleset(id: RulesetId): Ruleset<unknown>;
/** RAW crate judgment bytes from the committed pool-rules wasm artifact —
 * the cross-surface conformance hook (contracts/rules-crate-api.md §4b:
 * additive export, NOT in the frozen SDK barrel). No `JSON.parse`, no
 * exception mapping: `{"error":…}` payloads return as bytes too, exactly
 * as `scripts/rules-conformance.mjs` writes them ("write it raw"). `call`
 * is the JSON text `'null'` for games without call inputs. */
export declare function judgeRaw(rulesetId: string, stateJson: string, recordJson: string, callJson: string): string;
