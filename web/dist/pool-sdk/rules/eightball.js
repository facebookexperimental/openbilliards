// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
export const EIGHTBALL_V1_CONFIG = Object.freeze({
    callShot: 'explicit',
    breakFoulPlacement: 'kitchen',
    standardFoulPlacement: 'anywhere',
    dryBreakRailMinimum: 4,
    threeFoulRule: false,
});
/** The `eightball-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 4). Feature 013 (T031): every method delegates to the pool-rules
 * crate through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export const eightballRuleset = {
    id: 'eightball-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('eightball-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('eightball-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('eightball-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('eightball-v1', JSON.stringify(state)));
    },
};
