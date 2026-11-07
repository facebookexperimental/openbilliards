// Copyright (c) Meta Platforms, Inc. and affiliates.

// eightball.ts — the `eightball-v1` ruleset: WPA Rules of Play (effective
// 2025-09-15), Section 4 (4.1–4.11) + shared fouls Section 3, transcribed
// per the ruleset-api contract (feature 011, internal) and the
// normative transition table in data-model.md §4.1 (T1–T19). The TYPE
// surface is FROZEN by the contract (feature 011 trunk stub, filled by
// T014); sdk/ts/test/eightball.test.ts is the T013 suite.
//
// Since feature 013 the VERDICTS come from the pool-rules crate
// (crates/pool-rules/src/rulesets/eightball.rs, reached through the
// committed wasm artifact via ./backend.js); this module keeps the frozen
// 011 API — every export name, type, and observable behavior
// byte-identical (SC-001), the import path unchanged. Judging logic no
// longer lives here: `eightballRuleset` delegates all four methods to the
// crate, whose canonical bytes the harvested corpus
// (scripts/fixtures/rules-corpus.json) pins; crate RulesError messages
// rethrow verbatim (backend.js unwrap). What STAYS TS: the pure-data
// `EIGHTBALL_V1_CONFIG` below (drift-gated against the crate catalog
// config — no house-rule toggles, FR-002) and every type.
//
// Ruleset semantics (unchanged, now enforced crate-side):
//   fouls      3.1 scratch/cue off table; 3.3 no-contact / 3.2 wrong
//              first ball (group- and open-table-aware per 4.4, incl. the
//              whole-group temporary claim); 3.3 no rail after contact;
//              3.5 ball driven off the table — the 8 excepted during
//              play (its off-table is the 4.8(d) terminal), included on
//              the break (a 4.3(g) break foul; the 8 returns via
//              applyDecision, WPA 4.7). Standard fouls remedy 4.9 via
//              1.6 (anywhere); break fouls 4.3(g),(h) (kitchen only).
//   calls      MANDATORY on every non-break shot (4.6 via 1.7,
//              strictest reading); the break carries none (4.3(a)). A
//              fulfilled call continues the turn; while open, the CALLED
//              ball assigns the groups (4.4).
//   the 8      decides the rack (4.8(a)–(d), never on the break): a
//              called, entitled, legal 8 wins; foul-while-potting /
//              early / wrong pocket / driven off lose. The 8 is the only
//              ball ever spotted, only via decision resolutions (4.7).
//   decisions  1 dry_break (4.3(d) three-way), 2 eight_legal_break
//              (4.3(e)), 3 eight_foul_break (4.3(f)), 4 break_foul
//              (4.3(g),(h)), 5 stalemate (4.11 via 1.13 — a recorded
//              hot-seat agreement, never pending; re-racks for the
//              ORIGINAL breaker).
//   3.13       three-foul rule: WPA 8-ball self-excludes it —
//              permanently false, not a toggle.
//
// v1 scope boundary (research.md R9, same discipline as nineball.ts):
// out of engine scope, documented with cites — 3.4 foot on floor, 3.6
// touched ball, 3.7 double hit/frozen balls, 3.8 push shot, 3.9 balls
// still moving, 3.12 out of turn, 3.14 slow play, 3.15 template foul,
// 3.16 unsportsmanlike (referee-judgment / physical-world fouls; the
// hot-seat app makes 3.9/3.12 structurally impossible).

import type { ShotRecord } from '../record.js';
import type {
  CitedFoul, Decision, Judgment, Ruleset, ShotCall,
} from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';

/** Ball groups (WPA 4.4): solids = 1–7, stripes = 9–15. */
export type Group = 'solids' | 'stripes';

/** Rulebook option awaiting a recorded choice (share codec v4 decision
 * enums, contracts/share-codec-v4.md). */
export type PendingDecision =
  | { kind: 'dry_break'; chooser: 1 | 2 }         // WPA 4.3(d)
  | { kind: 'eight_legal_break'; chooser: 1 | 2 } // WPA 4.3(e)
  | { kind: 'eight_foul_break'; chooser: 1 | 2 }  // WPA 4.3(f)
  | { kind: 'break_foul'; chooser: 1 | 2 }        // WPA 4.3(g),(h)
  | { kind: 'stalemate'; chooser: 'both' };       // WPA 4.11 via 1.13

/** Complete 8-ball match state (data-model.md §4) — a left fold of
 * (judge ∘ applyDecision) over the recorded shot list + calls axis. */
export interface EightBallMatchState {
  phase: 'break' | 'open' | 'grouped' | 'over';
  shooter: 1 | 2;                    // seat to shoot next
  breaker: 1 | 2;                    // original breaker (stalemate re-break)
  groups: null | { 1: Group; 2: Group };   // null until assigned (WPA 4.4)
  onTable: number[];                 // object-ball ids on the table (1–15)
  pendingDecision: PendingDecision | null;
  result: null | { winner: 1 | 2; reason: string; cite: string };
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2 };
}

/** v1 config — ALL values transcribed from the rulebook, no house-rule
 * toggles (FR-002; data-model.md §3). Pure data — stays TS; drift-gated
 * against the crate catalog config. */
export interface EightBallConfig {
  callShot: 'explicit';              // strictest 1.7 reading (spec Assumption)
  breakFoulPlacement: 'kitchen';     // WPA 4.3(g),(h)
  standardFoulPlacement: 'anywhere'; // WPA 4.9 via 1.6
  dryBreakRailMinimum: 4;            // WPA 4.3(d)
  threeFoulRule: false;              // WPA 3.13 self-exclusion (not a toggle)
}

export const EIGHTBALL_V1_CONFIG: Readonly<EightBallConfig> = Object.freeze({
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
export const eightballRuleset: Ruleset<EightBallMatchState> = {
  id: 'eightball-v1',

  initialState(breaker: 1 | 2): EightBallMatchState {
    return JSON.parse(initialStateJson(
      'eightball-v1', breaker)) as EightBallMatchState;
  },

  judge(
    state: EightBallMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<EightBallMatchState> {
    return JSON.parse(judgeJson(
      'eightball-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<EightBallMatchState>;
  },

  applyDecision(
    state: EightBallMatchState, d: Decision,
  ): EightBallMatchState {
    return JSON.parse(applyDecisionJson(
      'eightball-v1', JSON.stringify(state), JSON.stringify(d),
    )) as EightBallMatchState;
  },

  hudState(state: EightBallMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'eightball-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
