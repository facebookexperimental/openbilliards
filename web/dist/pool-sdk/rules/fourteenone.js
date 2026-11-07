// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
/** Race-to target default (WPA Sec. 7 intro / 7.4; the shipped default
 * distance). Drift-gated against the crate catalog `config.targetDefault`. */
export const FOURTEENONE_TARGET_DEFAULT = 100;
/** The sanctioned target domain of the 022 `fourteenone` task-config
 * family (task_config.rs strict parse: 75 | 100 | 125). Pure data —
 * drift-gated against the crate catalog preset row + family config. */
export const FOURTEENONE_TARGETS = Object.freeze([75, 100, 125]);
/** The `fourteenone-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 7). Crate-backed: canonical bytes in, frozen RulesError texts
 * rethrown verbatim by backend.js. */
export const fourteenoneRuleset = {
    id: 'fourteenone-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('fourteenone-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('fourteenone-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('fourteenone-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('fourteenone-v1', JSON.stringify(state)));
    },
};
