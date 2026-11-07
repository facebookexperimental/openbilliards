// Copyright (c) Meta Platforms, Inc. and affiliates.

// harvest-intercept.mjs — feature 013 T002 companion (research R8): the
// judgment-capture interception layer for the ONE-TIME rules-corpus
// harvest. Imported with `node --import` in front of a compiled test
// suite (or by harvest-rules-corpus.mjs itself for its in-process
// supplements), it wraps the five shipped Ruleset objects so EVERY
// judgment-producing invocation — judge / applyDecision / initialState /
// hudState, successes AND RulesError paths — is recorded verbatim:
// snapshotted inputs + the exact `JSON.stringify` output bytes the
// pre-migration pure-TS implementation produced.
//
// Activated only when OB_HARVEST_FILE is set; otherwise importing this
// module is a no-op (the shipped test suites are NEVER edited — SC-001).

import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const OUT = process.env.OB_HARVEST_FILE;
export const CAPTURING = typeof OUT === 'string' && OUT.length > 0;

export const RULESET_IDS = Object.freeze([
  'nineball-v1', 'eightball-v1', 'onepocket-v1', 'snooker-v1', 'carom3c-v1',
]);

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** JSON round-trip snapshot: freezes the input bytes BEFORE the test can
 * mutate anything, and normalizes to plain JSON data. */
const snap = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/**
 * Map a pre-migration TS `RulesError` message onto the frozen crate error
 * code (contracts/rules-crate-api.md §5). The MESSAGE text is pinned
 * verbatim; only the code is assigned here — the crate must reproduce
 * both byte-for-byte. Unclassifiable messages FAIL the harvest.
 */
export function classifyRulesError(message) {
  if (message.startsWith("unknown ruleset '")) return 'unknown-ruleset';
  if (/judge called after the (match|frame) ended/.test(message)
    || /no decision can be applied after the (match|frame) ended/
      .test(message)) return 'match-over';
  if (/judge called while a rulebook decision is pending/.test(message)
    || /judge called while the break-spot option is pending/
      .test(message)) return 'decision-pending';
  if (/play phase without pocket assignments/.test(message)
    || /final_colours state has no colour left/.test(message)) {
    return 'bad-state';
  }
  if (/unknown decision id/.test(message)
    || /no rulebook decision is ever pending/.test(message)
    || /out of range for '/.test(message)
    || /does not match the pending option/.test(message)
    || /no break-pocket choice is pending/.test(message)
    || /stalemate cannot pre-empt/.test(message)) return 'bad-decision';
  if (/has no call\/safety inputs/.test(message)
    || /carries no call\/safety\/nomination inputs/.test(message)
    || /the break shot carries no call/.test(message)
    || /requires a call or a declared/.test(message)
    || /called ball/.test(message)
    || /called pocket/.test(message)
    || /carries no per-shot call/.test(message)
    || /a red shot carries no nomination/.test(message)
    || /a colour shot MUST carry/.test(message)
    || /nominated ball/.test(message)
    || /nominated colour/.test(message)
    || /the ball on is/.test(message)) return 'bad-call';
  throw new Error(`harvest: unclassifiable RulesError message: ${message}`);
}

/** Append one corpus case capture (data-model.md §5 field set). */
export function recordCase(ruleset, kind, inputs, expect) {
  appendFileSync(OUT, `${JSON.stringify(
    { ruleset, kind, ...inputs, expect, expectSha256: sha256(expect) })}\n`);
}

if (CAPTURING) {
  const rules = await import('../dist/src/rules/index.js');
  const { RulesError } = rules;

  const wrap = (id, rs) => {
    const invoke = (kind, inputs, fn) => {
      let out;
      try {
        out = fn();
      } catch (e) {
        if (e instanceof RulesError) {
          recordCase(id, `${kind}-error`, inputs, JSON.stringify({
            error: { code: classifyRulesError(e.message), message: e.message },
          }));
        }
        throw e;
      }
      recordCase(id, kind, inputs, JSON.stringify(out));
      return out;
    };
    const oJudge = rs.judge.bind(rs);
    rs.judge = (state, record, call) => invoke('judge',
      { state: snap(state), record: snap(record), call: snap(call) },
      () => oJudge(state, record, call));
    const oApply = rs.applyDecision.bind(rs);
    rs.applyDecision = (state, d) => invoke('applyDecision',
      { state: snap(state), decision: snap(d) },
      () => oApply(state, d));
    const oInitial = rs.initialState.bind(rs);
    rs.initialState = (breaker) => invoke('initialState',
      { breaker }, () => oInitial(breaker));
    const oHud = rs.hudState.bind(rs);
    rs.hudState = (state) => invoke('hudState',
      { state: snap(state) }, () => oHud(state));
  };

  for (const id of RULESET_IDS) wrap(id, rules.getRuleset(id));
}
