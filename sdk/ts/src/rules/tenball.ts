// Copyright (c) Meta Platforms, Inc. and affiliates.

// tenball.ts — the `tenball-v1` ruleset: WPA Rules of Play (effective
// 2025-09-15), Section 6 "10-Ball" (6.1–6.11), shared Section 3 fouls
// via 6.9/6.10, standard call shot via 1.7 — feature 026, GH-343. The
// EIGHTH registered ruleset (the seventh playable discipline),
// crate-backed from birth (the fourteenone precedent): every method
// delegates to crates/pool-rules/src/rulesets/tenball.rs through the
// committed wasm artifact (./backend.js), whose canonical bytes the
// frozen conformance slice
// (scripts/fixtures/rules-corpus-variants/wpa-10ball.json) pins; crate
// RulesError messages rethrow verbatim (backend.js unwrap).
//
// Ruleset semantics (enforced crate-side; the module doc of tenball.rs
// is the transcription authority; the feature-026 spec (internal) records the
// two verified issue-brief deltas):
//   6.3(b)  break: four object balls to rails on a dry break, else
//           `illegal-break` — a STANDARD foul (BIH anywhere, 6.9; no
//           kitchen relief in 10-ball).
//   6.4     push out on the shot after a foul-free break (calls-axis
//           kind `push`); 3.2/3.3 suspended; a clean push out surfaces
//           decision id 12 `pushout_response` (opponent chooses who
//           shoots next).
//   6.5     CALL SHOT via 1.7 — ball + pocket (kind 0) or the declared
//           no-call stance (kind 1 wire; there is NO safety call at
//           10-Ball — the rules text abolishes it); the break is never
//           called.
//   6.6     wrongful pot (pot without the call, no foul) → decision id
//           13 `wrongful_pot` (opponent option); balls stay down.
//   6.7     win ONLY on the called lone 10; an early called 10 spots
//           and continues; legal scoring break continues without a call.
//   6.8     the 10 spots (ids-only respot — XY geometry rides
//           respot.ts `respotBallSpot`); no other ball ever spots.
//   6.10    three consecutive fouls (3.13) = loss of the RACK.

import type { ShotRecord } from '../record.js';
import type {
  CitedFoul, Decision, Judgment, Ruleset, ShotCall,
} from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';

/** A pending rulebook option (WPA 6.4 / 6.6). */
export interface TenBallPending {
  kind: 'pushout_response' | 'wrongful_pot';
  chooser: 1 | 2;
}

/** Complete 10-ball match state (tenball.rs `TenBallMatchState`; serde
 * declaration order is the conformance-slice byte contract). */
export interface TenBallMatchState {
  /** `pushout` = the 6.4 window is OPEN for the shot being addressed. */
  phase: 'break' | 'pushout' | 'play' | 'over';
  shooter: 1 | 2;
  breaker: 1 | 2;
  onTable: number[];
  /** The 3.13 counter (reset on any legal shot). */
  consecutiveFouls: { 1: number; 2: number };
  pendingDecision: TenBallPending | null;
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2 };
  result: null | { winner: 1 | 2; reason: string; cite: string };
}

/** The `tenball-v1` ruleset (WPA Rules of Play eff. 2025-09-15, Sec. 6).
 * Crate-backed: canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export const tenballRuleset: Ruleset<TenBallMatchState> = {
  id: 'tenball-v1',

  initialState(breaker: 1 | 2): TenBallMatchState {
    return JSON.parse(initialStateJson(
      'tenball-v1', breaker)) as TenBallMatchState;
  },

  judge(
    state: TenBallMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<TenBallMatchState> {
    return JSON.parse(judgeJson(
      'tenball-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<TenBallMatchState>;
  },

  applyDecision(
    state: TenBallMatchState, d: Decision,
  ): TenBallMatchState {
    return JSON.parse(applyDecisionJson(
      'tenball-v1', JSON.stringify(state), JSON.stringify(d),
    )) as TenBallMatchState;
  },

  hudState(state: TenBallMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'tenball-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
