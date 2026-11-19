// Copyright (c) Meta Platforms, Inc. and affiliates.

// sdk/ts/src/rules — game-rules engine (STREAM-B, see the ownership ledger, internal).
// Rules consume ShotRecord events from the kernel — they NEVER re-simulate
// physics (constitution P-II). The browser adapter is web/app/flow.js.
// Not exported from the frozen SDK barrel (src/index.ts); consumers
// deep-import 'rules/index.js' (or the modules) directly.
//
// Feature 011 (multi-game support): this module owns the shared Ruleset
// interface + registry frozen in the ruleset-api contract (feature 011,
// internal). A ruleset is PURE: verdicts derive exclusively from
// serializable inputs — prior match state, the kernel ShotRecord event
// stream, and recorded nominations/decisions. Order-of-events questions
// resolve by EVENT-STREAM POSITION (the nineball.ts:93–99 convention),
// never by timestamp comparison.
//
// The nineball-v1 Ruleset ADAPTER lives HERE (not in nineball.ts):
// flow.js statically imports nineball.js on the app BOOT path, and the
// cache-poison contract (the ownership ledger, internal) forbids new cross-file
// named exports from shipped boot-path modules. Feature 013: this
// adapter (and nineball.ts's legacy judgeShot) delegate to the
// pool-rules CRATE through ./backend.js — the per-ruleset migration
// seam; verdict bytes are frozen by the harvested corpus.

import type { ShotRecord } from '../record.js';
import * as backend from './backend.js';
import { deriveOnTable } from './nineball.js';
import { eightballRuleset } from './eightball.js';
import { onepocketRuleset } from './onepocket.js';
import { snookerRuleset } from './snooker.js';
import { caromRuleset } from './carom3c.js'; // feature 012 US3 (carom lane)
import { fourteenoneRuleset } from './fourteenone.js'; // feature 025 (#65)
import { tenballRuleset } from './tenball.js'; // feature 026 (GH-343)
import { heyballRuleset } from './heyball.js'; // GH-491 (build 18)

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
export type RulesetId =
  | 'nineball-v1' | 'eightball-v1'                  // frozen
  | 'snooker-v1' | 'carom3c-v1' | 'onepocket-v1'    // feature 012 slots
  | 'eightball-v2'                                  // feature 022 variants
  | 'fourteenone-v1'                                // feature 025 (issue #65)
  | 'tenball-v1'                                    // feature 026 (GH-343)
  | 'carom3c-v2'                                    // GH-383 carom variants
  | 'snooker-v2'                                    // GH-382 (build 17)
  | 'heyball-v1';                                   // GH-491 (build 18)

export type {
  NineBallFoul, NineBallGameState, NineBallJudgment,
} from './nineball.js';
export { FOUL_LABELS, deriveOnTable, judgeShot } from './nineball.js';

export type { SpotXY } from './respot.js';
export {
  PLACE_CLEARANCE, clampToBed, footSpot, placementFits, respotBallSpot,
  respotNineSpot,
} from './respot.js';
// GH-370 class 3 (frozen in-hand placement, WPA 1.6/3.7): the snap-to-
// contact resolver rides THIS dynamically-imported barrel — flow.js
// feature-detects it per the cache-poison contract. NAMESPACE binding,
// not a named re-export (review r1 P1): a fresh index.js paired with a
// CACHED pre-370 respot.js would fail module LINKING on the new names
// and drop the whole registry (ownership-ledger rule-5 corollary — new names
// on an existing edge poison the graph); the namespace always links and
// a stale respot.js just answers undefined, keeping the refusal law.
import * as respotContact from './respot.js';
export const snapToContact = (respotContact as {
  snapToContact?: typeof import('./respot.js').snapToContact;
}).snapToContact;
export const CONTACT_EPS = (respotContact as {
  CONTACT_EPS?: number;
}).CONTACT_EPS;

export type {
  EightBallConfig, EightBallMatchState, Group, PendingDecision,
} from './eightball.js';
export { EIGHTBALL_V1_CONFIG, eightballRuleset } from './eightball.js';

// ---- feature 012, US1: one-pocket (contracts/rulesets-012.md §6) -----------
export type { OnePocketDecision, OnePocketMatchState } from './onepocket.js';
export {
  defaultBreakPocketChoice, ONE_POCKET_FOOT_POCKETS, onepocketRuleset,
} from './onepocket.js';

// feature 012 US2 (snooker story lane): the snooker-v1 registration —
// consumers with a STALE cached index.js simply lack the entry and
// getRuleset('snooker-v1') keeps throwing (flow.js degrades per the
// cache-poison contract).
export type {
  SnookerColourId, SnookerMatchState, SnookerPendingDecision, SnookerPhase,
} from './snooker.js';
export { snookerRuleset } from './snooker.js';

// ---- feature 012 US3: carom3c-v1 (carom story lane) -------------------------
// The discipline respot geometry re-exports ride THIS module (the
// registry is already dynamically imported + feature-detected by
// flow.js), never respot.js's own boot-path import — adding names to a
// statically imported shipped module would violate the cache-poison
// contract (ownership-ledger rule 5, internal).
export type { CaromMatchState, CaromReason } from './carom3c.js';
export {
  CAROM_BALL_BREAKER, CAROM_BALL_OPPONENT, CAROM_BALL_RED,
  CAROM_TARGET_DEFAULT, caromBallsInContact, caromRuleset,
} from './carom3c.js';
export type { RespotPlacement } from './respot.js';
export { caromRespotPlan } from './respot.js';
export type { CaromLayout } from '../games/layouts.js';
export { CAROM_LAYOUT } from '../games/layouts.js';

// ---- feature 025 (issue #65): fourteenone-v1 (14.1 continuous) --------------
// Same lane discipline as the 012 story lanes: the registration + the
// discipline geometry re-exports ride THIS dynamically-imported module
// (flow.js feature-detects them per the cache-poison contract) — a stale
// cached index.js simply lacks the entry and getRuleset('fourteenone-v1')
// keeps throwing (flow.js degrades loudly, never a dead boot).
export type {
  FourteenOneMatchState, FourteenOnePending, FourteenOneRerack,
} from './fourteenone.js';
export {
  FOURTEENONE_TARGET_DEFAULT, FOURTEENONE_TARGETS, fourteenoneRuleset,
} from './fourteenone.js';
export type { FourteenOneRerackPlan } from './respot.js';
export {
  centerSpot, fourteenOneRerackPlacements, headSpot,
} from './respot.js';

// ---- feature 026 (GH-343): tenball-v1 (WPA 10-ball) --------------------------
// Same lane discipline: the registration rides THIS dynamically-imported
// module (flow.js feature-detects it per the cache-poison contract) — a
// stale cached index.js simply lacks the entry and
// getRuleset('tenball-v1') keeps throwing (flow.js degrades loudly,
// never a dead boot). The spotted-10 geometry reuses the shipped
// `respotBallSpot` (WPA 1.5 long-string placement) already exported above.
export type { TenBallMatchState, TenBallPending } from './tenball.js';
export { tenballRuleset } from './tenball.js';

// ---- GH-491 (build 18): heyball-v1 (WPA Rules of Heyball) --------------------
// Same lane discipline: the registration rides THIS dynamically-imported
// module (flow.js feature-detects it per the cache-poison contract) — a
// stale cached index.js simply lacks the entry and
// getRuleset('heyball-v1') keeps throwing (flow.js degrades loudly,
// never a dead boot). The 8-spot geometry reuses the shipped
// `respotBallSpot` (foot-spot long-string placement) already exported
// above.
export type { HeyballMatchState, HeyballPending } from './heyball.js';
export { heyballRuleset } from './heyball.js';

// ---- shared judgment types (contracts/ruleset-api.md, FROZEN) --------------

/** Foul with its rulebook citation — FR-009's "foul reason with rule
 * reference" is data. `code` is the stable wire/i18n key (foul.<code>);
 * `cite` is the pinned rule number (research.md R1 map). */
export interface CitedFoul { code: string; cite: string; }

/** Recorded per-shot rule inputs (mirrors the share codec v4 calls axis). */
export type ShotCall =
  | { kind: 'call'; ball: number; pocket: number } // pocket = kernel Table.pockets index
  | { kind: 'safety' }
  // Feature 012: snooker colour nomination (WPBSA Sec3 R3(h); wire
  // calls-axis kind 3, ball = colour id 16–21) — same adapter convention
  // as 8-ball calls: enforced BEFORE the stroke, missing = RulesError.
  | { kind: 'nominate'; ball: number;
      // GH-382 (snooker-v2): the referee's FREE BALL call riding the
      // nomination (WPBSA Sec3 R12; codec b-slot = 1) — the literal
      // matches the codec's true-or-omitted contract (review r17)
      freeBall?: true }
  // Feature 026 (GH-343): the declared 10-ball push out (WPA 6.4; wire
  // calls-axis kind 4) — declared BEFORE the stroke like every call. In
  // 10-ball the `safety` kind reads as the declared NO-CALL stance
  // (there is no safety call at 10-Ball, WPA 6.5).
  | { kind: 'push' }
  | null;                                          // games without call rules (9-ball)

/** Recorded resolution of a PendingDecision (decision/choice enums are
 * per-game; wire encoding frozen in contracts/share-codec-v4.md). */
export interface Decision { decision: number; choice: number; }

/** Cue-ball placement right granted to the incoming shooter.
 * `d_zone` (feature 012): snooker in-hand — on/within the D (WPBSA Sec3
 * R5; Sec2 R9); the adapter clamps beside the existing kitchen clamp
 * (game.js placement seam). */
export type PlacementRight = 'none' | 'anywhere' | 'kitchen' | 'd_zone';

export interface Judgment<S> {
  legal: boolean;
  fouls: CitedFoul[];                 // every detected foul; legal === (length === 0)
  pocketed: number[];                 // object balls pocketed, pocketing order, cue excluded
  ballInHand: PlacementRight;         // 'none' when legal
  respot: number[];                   // ball ids to return to the foot spot (spot-occlusion
                                      // fallback = respot.ts long-string geometry)
  turn: 'continue' | 'pass';          // seat consequence (adapter applies it)
  decisionRequired: null | { kind: string; chooser: 1 | 2 | 'both' };
  // winner 0 = the DRAW sentinel (GH-383: carom3c-v2 equal innings,
  // UMB Art 29.4 — the only ruleset that can emit one; every other
  // terminal keeps 1 | 2)
  terminal: null | { winner: 0 | 1 | 2; reason: string; cite: string };
  next: S;                            // complete post-shot match state
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

/** Thrown on rules-engine programming errors (unknown ruleset, decision
 * with nothing pending, out-of-range choice, missing mandatory call).
 * Feature 013 (T028): the class lives in the ./errors.js LEAF so the
 * crate backend can throw it without putting this registry barrel on the
 * app's static boot path (see errors.ts); this re-export keeps every
 * existing import path and the class identity unchanged. */
import { RulesError } from './errors.js';
export { RulesError } from './errors.js';

// ---- nineball-v1 adaptation (verdict-freeze) --------------------------------
// Feature 013 (T022): nineball-v1 is the first CRATE-BACKED registry
// entry — every method delegates to crates/pool-rules through the
// committed wasm artifact (./backend.js, module-TLA loaded). The frozen
// 011 surface is unchanged: same exports, same types, same verdict
// bytes (the harvested corpus + the zero-edit test battery pin them),
// crate RulesError messages rethrown verbatim. T025 swapped carom3c-v1,
// T028 onepocket-v1, T031 eightball-v1, and T034 snooker-v1 the same
// way (their adapters live in carom3c.ts / onepocket.ts / eightball.ts
// / snooker.ts) — all five registry entries now judge crate-side; no
// judging logic remains in sdk/ts/src/rules (research R10 per-ruleset
// seam, feature 013 Phase B exit).

/** Wrapper match state for `nineball-v1` (nineball.ts itself only tracks
 * `onTable`; the shared interface additionally needs the seat + result). */
export interface NineBallMatchState {
  shooter: 1 | 2;
  onTable: number[];                 // object-ball ids (1..9) on the table
  result: null | { winner: 1 | 2; reason: string; cite: string };
}

export const nineballRuleset: Ruleset<NineBallMatchState> = {
  id: 'nineball-v1',

  initialState(breaker: 1 | 2): NineBallMatchState {
    return JSON.parse(backend.initialStateJson(
      'nineball-v1', breaker)) as NineBallMatchState;
  },

  judge(
    state: NineBallMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<NineBallMatchState> {
    return JSON.parse(backend.judgeJson(
      'nineball-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<NineBallMatchState>;
  },

  applyDecision(state: NineBallMatchState, d: Decision): NineBallMatchState {
    // the crate rejects unconditionally (9-ball v1 never surfaces a
    // rulebook decision) — the frozen no-pending RulesError rethrows here
    return JSON.parse(backend.applyDecisionJson(
      'nineball-v1', JSON.stringify(state), JSON.stringify(d),
    )) as NineBallMatchState;
  },

  hudState(state: NineBallMatchState): Record<string, unknown> {
    return JSON.parse(backend.hudStateJson(
      'nineball-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};

/** Derive the wrapper state for a shot straight from its record (the
 * flow.js seam: prior onTable = the record's initial snapshot). */
export function nineballStateFromRecord(
  record: ShotRecord, shooter: 1 | 2,
): NineBallMatchState {
  return { shooter, onTable: deriveOnTable(record), result: null };
}

// ---- registry ----------------------------------------------------------------

/** REGISTERED ruleset ids (the union additionally declares the feature-012
 * slots; the story lanes append here as their implementations land). */
export const RULESET_IDS: readonly RulesetId[] =
  Object.freeze([
    'nineball-v1', 'eightball-v1',
    'onepocket-v1', 'snooker-v1', 'carom3c-v1', // feature 012 story lanes
    // feature 022 registry growth (T009 pure-data mirror repin): the five
    // v1 slots above are byte-untouched; eightball-v2 is appended LAST,
    // mirroring the crate's RULESET_IDS [&str; 6]. Pure data — no RULESETS
    // map entry (variants ride task_initial_state_json, never getRuleset).
    'eightball-v2',
    // feature 025 registry growth (issue #65): fourteenone-v1 appended
    // LAST, mirroring the crate's RULESET_IDS [&str; 7] — the six existing
    // slots are byte-untouched (registry-api.md §6 growth protocol).
    'fourteenone-v1',
    // feature 026 registry growth (GH-343): tenball-v1 appended LAST,
    // mirroring the crate's RULESET_IDS [&str; 8] — the seven existing
    // slots are byte-untouched (registry-api.md §6 growth protocol).
    'tenball-v1',
    // GH-383 registry growth: carom3c-v2 appended, mirroring the
    // crate's RULESET_IDS — the eight existing slots are byte-untouched.
    // Pure data — like eightball-v2, NO RULESETS map entry (carom
    // variants ride the preset/task_initial_state path, never
    // getRuleset).
    'carom3c-v2',
    // GH-382 registry growth (build 17): snooker-v2 appended LAST,
    // mirroring the crate's RULESET_IDS [&str; 10] (the two build-17
    // growth events composed at the merge; carom3c-v2 keeps its landed
    // index) — the nine existing slots are byte-untouched. Pure data,
    // NO RULESETS map entry (the eightball-v2 convention: the completion
    // preset rides the committed artifact's preset/task_initial_state
    // path through the app's variant engine; getRuleset throws for it).
    'snooker-v2',
    // GH-491 registry growth (build 18): heyball-v1 appended LAST,
    // mirroring the crate's RULESET_IDS [&str; 11] — the ten existing
    // slots are byte-untouched (registry-api.md §6 growth protocol). A
    // PLAYABLE plain entry (the tenball convention): registered in the
    // RULESETS map below, crate-backed from birth.
    'heyball-v1',
  ]);

const RULESETS: Partial<Record<RulesetId, Ruleset<unknown>>> = {
  'nineball-v1': nineballRuleset as unknown as Ruleset<unknown>,
  'eightball-v1': eightballRuleset as unknown as Ruleset<unknown>, // 011;
                                       // crate-backed since 013 T031
  'onepocket-v1': onepocketRuleset as unknown as Ruleset<unknown>, // 012
                                       // US1; crate-backed since 013 T028
  'snooker-v1': snookerRuleset as unknown as Ruleset<unknown>, // 012
                                       // US2; crate-backed since 013 T034
  'carom3c-v1': caromRuleset as unknown as Ruleset<unknown>, // 012 US3;
                                          // crate-backed since 013 T025
  'fourteenone-v1': fourteenoneRuleset as unknown as Ruleset<unknown>,
                                          // feature 025 (#65); crate-backed
                                          // from birth
  'tenball-v1': tenballRuleset as unknown as Ruleset<unknown>,
                                          // feature 026 (GH-343);
                                          // crate-backed from birth
  'heyball-v1': heyballRuleset as unknown as Ruleset<unknown>,
                                          // GH-491 (build 18);
                                          // crate-backed from birth
};

/** Registry lookup. Throws RulesError on an unknown id. */
export function getRuleset(id: RulesetId): Ruleset<unknown> {
  const r = RULESETS[id];
  if (r === undefined) {
    throw new RulesError(`unknown ruleset '${String(id)}'`);
  }
  return r;
}

// ---- feature 013: crate-conformance hook -------------------------------------

/** RAW crate judgment bytes from the committed pool-rules wasm artifact —
 * the cross-surface conformance hook (contracts/rules-crate-api.md §4b:
 * additive export, NOT in the frozen SDK barrel). No `JSON.parse`, no
 * exception mapping: `{"error":…}` payloads return as bytes too, exactly
 * as `scripts/rules-conformance.mjs` writes them ("write it raw"). `call`
 * is the JSON text `'null'` for games without call inputs. */
export function judgeRaw(
  rulesetId: string, stateJson: string, recordJson: string, callJson: string,
): string {
  return backend.wasm.rules_judge_json(
    rulesetId, stateJson, recordJson, callJson);
}
