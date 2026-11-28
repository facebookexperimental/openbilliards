// Copyright (c) Meta Platforms, Inc. and affiliates.
import * as backend from './backend.js';
import { deriveOnTable } from './nineball.js';
import { eightballRuleset } from './eightball.js';
import { onepocketRuleset } from './onepocket.js';
import { snookerRuleset } from './snooker.js';
import { caromRuleset } from './carom3c.js'; // feature 012 US3 (carom lane)
import { fourteenoneRuleset } from './fourteenone.js'; // feature 025 (#65)
import { tenballRuleset } from './tenball.js'; // feature 026 (GH-343)
import { heyballRuleset } from './heyball.js'; // GH-491 (build 18)
export { FOUL_LABELS, deriveOnTable, judgeShot } from './nineball.js';
export { PLACE_CLEARANCE, clampToBed, footSpot, placementFits, respotBallSpot, respotNineSpot, } from './respot.js';
// GH-370 class 3 (frozen in-hand placement, WPA 1.6/3.7): the snap-to-
// contact resolver rides THIS dynamically-imported barrel — flow.js
// feature-detects it per the cache-poison contract. NAMESPACE binding,
// not a named re-export (review r1 P1): a fresh index.js paired with a
// CACHED pre-370 respot.js would fail module LINKING on the new names
// and drop the whole registry (ownership-ledger rule-5 corollary — new names
// on an existing edge poison the graph); the namespace always links and
// a stale respot.js just answers undefined, keeping the refusal law.
import * as respotContact from './respot.js';
export const snapToContact = respotContact.snapToContact;
export const CONTACT_EPS = respotContact.CONTACT_EPS;
export { EIGHTBALL_V1_CONFIG, eightballRuleset } from './eightball.js';
export { defaultBreakPocketChoice, ONE_POCKET_FOOT_POCKETS, onepocketRuleset, } from './onepocket.js';
export { snookerRuleset } from './snooker.js';
export { CAROM_BALL_BREAKER, CAROM_BALL_OPPONENT, CAROM_BALL_RED, CAROM_TARGET_DEFAULT, caromBallsInContact, caromRuleset, } from './carom3c.js';
export { caromRespotPlan } from './respot.js';
export { CAROM_LAYOUT } from '../games/layouts.js';
export { FOURTEENONE_TARGET_DEFAULT, FOURTEENONE_TARGETS, fourteenoneRuleset, } from './fourteenone.js';
export { centerSpot, fourteenOneRerackPlacements, headSpot, } from './respot.js';
export { tenballRuleset } from './tenball.js';
export { heyballRuleset } from './heyball.js';
/** Thrown on rules-engine programming errors (unknown ruleset, decision
 * with nothing pending, out-of-range choice, missing mandatory call).
 * Feature 013 (T028): the class lives in the ./errors.js LEAF so the
 * crate backend can throw it without putting this registry barrel on the
 * app's static boot path (see errors.ts); this re-export keeps every
 * existing import path and the class identity unchanged. */
import { RulesError } from './errors.js';
export { RulesError } from './errors.js';
export const nineballRuleset = {
    id: 'nineball-v1',
    initialState(breaker) {
        return JSON.parse(backend.initialStateJson('nineball-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(backend.judgeJson('nineball-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        // the crate rejects unconditionally (9-ball v1 never surfaces a
        // rulebook decision) — the frozen no-pending RulesError rethrows here
        return JSON.parse(backend.applyDecisionJson('nineball-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(backend.hudStateJson('nineball-v1', JSON.stringify(state)));
    },
};
/** Derive the wrapper state for a shot straight from its record (the
 * flow.js seam: prior onTable = the record's initial snapshot). */
export function nineballStateFromRecord(record, shooter) {
    return { shooter, onTable: deriveOnTable(record), result: null };
}
// ---- registry ----------------------------------------------------------------
/** REGISTERED ruleset ids (the union additionally declares the feature-012
 * slots; the story lanes append here as their implementations land). */
export const RULESET_IDS = Object.freeze([
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
const RULESETS = {
    'nineball-v1': nineballRuleset,
    'eightball-v1': eightballRuleset, // 011;
    // crate-backed since 013 T031
    'onepocket-v1': onepocketRuleset, // 012
    // US1; crate-backed since 013 T028
    'snooker-v1': snookerRuleset, // 012
    // US2; crate-backed since 013 T034
    'carom3c-v1': caromRuleset, // 012 US3;
    // crate-backed since 013 T025
    'fourteenone-v1': fourteenoneRuleset,
    // feature 025 (#65); crate-backed
    // from birth
    'tenball-v1': tenballRuleset,
    // feature 026 (GH-343);
    // crate-backed from birth
    'heyball-v1': heyballRuleset,
    // GH-491 (build 18);
    // crate-backed from birth
};
/** Registry lookup. Throws RulesError on an unknown id. */
export function getRuleset(id) {
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
export function judgeRaw(rulesetId, stateJson, recordJson, callJson) {
    return backend.wasm.rules_judge_json(rulesetId, stateJson, recordJson, callJson);
}
