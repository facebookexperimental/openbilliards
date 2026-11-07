// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
/** The `snooker-v1` ruleset (WPBSA Official Rules Revised Sept 2024,
 * Sec. 3). Feature 013 (T034): every method delegates to the pool-rules
 * crate through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export const snookerRuleset = {
    id: 'snooker-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('snooker-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('snooker-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('snooker-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('snooker-v1', JSON.stringify(state)));
    },
};
