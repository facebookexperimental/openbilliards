// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
/** The `tenball-v1` ruleset (WPA Rules of Play eff. 2025-09-15, Sec. 6).
 * Crate-backed: canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export const tenballRuleset = {
    id: 'tenball-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('tenball-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('tenball-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('tenball-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('tenball-v1', JSON.stringify(state)));
    },
};
