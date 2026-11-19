// Copyright (c) Meta Platforms, Inc. and affiliates.

// heyball.ts — the `heyball-v1` ruleset: WPA Rules of Heyball (effective
// 2025-08-16; pin + digest at
// docs/research/rules-audit/heyball-rulebook-pin.md) — GH-491, build 18.
// The ELEVENTH registered ruleset (the eighth playable discipline),
// crate-backed from birth (the tenball precedent): every method
// delegates to crates/pool-rules/src/rulesets/heyball.rs through the
// committed wasm artifact (./backend.js), whose canonical bytes the
// frozen conformance slice
// (scripts/fixtures/rules-corpus-variants/wpa-heyball.json) pins; crate
// RulesError messages rethrow verbatim (backend.js unwrap).
//
// Ruleset semantics (enforced crate-side; the module doc of heyball.rs
// is the transcription authority):
//   II.11    NO call shot, ever — flukes count, the 8 included; the
//            judge accepts only a null call (the 9-ball convention).
//   II.6     break option matrices (decisions 18–22): illegal break
//            (<4 rails, no pot — no BIH), break foul (kitchen-only BIH
//            among re-rack arms), the 8 on the break (spot/re-break),
//            miscue-short-of-the-rack (no BIH).
//   II.10.3  the table opens after the break REGARDLESS of pocketed
//            balls; II.12.1 fixes groups only by a legal first-contact-
//            group pot.
//   II.8     ball in hand behind the head string after break fouls; the
//            armed `kitchenBih` stroke may not directly contact a
//            behind-string ball (App-A 3.11 backs the no-exit arm).
//   II.15.2  frozen-to-cushion escape law (geometric address detection).
//   II.12.3  object balls off the table stay OUT (foul, no respot); the
//            8 off the table loses the rack (II.20(c)).
//   II.20    loss family: 8-with-foul, 8-with-last-own-ball, early 8.
//   II.21    stalemate agreement (decision 23) re-racks for the
//            ORIGINAL breaker. Alternating breaks (I.12) are the
//            adapter's rack liturgy.

import type { ShotRecord } from '../record.js';
import type {
  CitedFoul, Decision, Judgment, Ruleset, ShotCall,
} from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';

/** A pending rulebook option (WPA Heyball II.6). */
export interface HeyballPending {
  kind: 'illegal_break' | 'break_foul' | 'eight_break_pot'
    | 'eight_break_foul' | 'break_miscue';
  chooser: 1 | 2;
}

/** Complete heyball match state (heyball.rs `HeyballMatchState`; serde
 * declaration order is the conformance-slice byte contract). */
export interface HeyballMatchState {
  phase: 'break' | 'open' | 'grouped' | 'over';
  shooter: 1 | 2;
  breaker: 1 | 2;
  /** `null` until fixed by a legal first-contact-group pot (II.12.1). */
  groups: null | { 1: 'solids' | 'stripes'; 2: 'solids' | 'stripes' };
  onTable: number[];
  pendingDecision: HeyballPending | null;
  result: null | { winner: 1 | 2; reason: string; cite: string };
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2 };
  /** The next stroke plays from in-hand behind the head string (II.8) —
   * armed only by the break-foul resolutions (19/21 choice 1). */
  kitchenBih: boolean;
}

/** The `heyball-v1` ruleset (WPA Rules of Heyball eff. 2025-08-16).
 * Crate-backed: canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export const heyballRuleset: Ruleset<HeyballMatchState> = {
  id: 'heyball-v1',

  initialState(breaker: 1 | 2): HeyballMatchState {
    return JSON.parse(initialStateJson(
      'heyball-v1', breaker)) as HeyballMatchState;
  },

  judge(
    state: HeyballMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<HeyballMatchState> {
    return JSON.parse(judgeJson(
      'heyball-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<HeyballMatchState>;
  },

  applyDecision(
    state: HeyballMatchState, d: Decision,
  ): HeyballMatchState {
    return JSON.parse(applyDecisionJson(
      'heyball-v1', JSON.stringify(state), JSON.stringify(d),
    )) as HeyballMatchState;
  },

  hudState(state: HeyballMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'heyball-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
