// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
/** The two foot corner pockets as kernel Table.pockets indices. The pool
 * builder (crates/pool-core table.rs `from_pocket_spec`) orders pockets
 * lb=0 lc=1 lt=2 rb=3 rc=4 rt=5 with +y toward the foot end, so the foot
 * corners are 'lt' (left, viewed from the head — x < 0) and 'rt'. Every
 * one-pocket table (wpa_9ft class + chinese8_pro_9ft) shares that same
 * spec path (FR-015). Pure data — stays TS; drift-gated against the
 * crate catalog `config.footPockets`. */
export const ONE_POCKET_FOOT_POCKETS = Object.freeze({ left: 2, right: 5 });
/** WPA 12.3 default pocket choice: absent an indication from the breaker,
 * the assignment defaults to the foot pocket OPPOSITE the side of the
 * head string the cue ball was placed on for the break. `cueX` is the
 * kernel x of the break placement (left, viewed from the head = x < 0).
 * A dead-centre placement has no opposite side — choice 1 (left) is the
 * documented tie convention. Returns the decision-6 choice enum. */
export function defaultBreakPocketChoice(cueX) {
    return cueX < 0 ? 2 : 1;
}
/** The `onepocket-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 12). Feature 013: every method delegates to the pool-rules crate
 * through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export const onepocketRuleset = {
    id: 'onepocket-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('onepocket-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('onepocket-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('onepocket-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('onepocket-v1', JSON.stringify(state)));
    },
};
