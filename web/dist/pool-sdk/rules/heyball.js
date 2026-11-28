// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
/** The `heyball-v1` ruleset (WPA Rules of Heyball eff. 2025-08-16).
 * Crate-backed: canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export const heyballRuleset = {
    id: 'heyball-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('heyball-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('heyball-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('heyball-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('heyball-v1', JSON.stringify(state)));
    },
};
