// Copyright (c) Meta Platforms, Inc. and affiliates.

// rules-backend.test.ts — feature 013 T018 (ADDITIVE file: SC-001
// forbids edits to existing suites, not additions): the crate-rules
// backend shim proven in the node environment BEFORE any ruleset swaps
// onto it — module top-level-await init over the COMMITTED
// web/dist/pool-rules artifact, version/catalog round-trip, and the
// full wasm error path via a deliberately-unknown stub ruleset id
// (`'stub-v0'` → `unknown-ruleset` payload → rethrown as RulesError
// with the crate message verbatim).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// importing backend.js settles its TLA before this module runs —
// exactly the property the per-ruleset swaps (T022+) will rely on
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
  rulesCatalogJson, rulesVersion, unwrap, wasm,
} from '../src/rules/backend.js';
import { RulesError } from '../src/rules/index.js';

const STUB_ERROR_BYTES =
  '{"error":{"code":"unknown-ruleset","message":"unknown ruleset \'stub-v0\'"}}';

test('TLA init: rules_version round-trips through the committed artifact', () => {
  const v = rulesVersion();
  // the build stamp is the short git hash (optionally -dirty), or the
  // deterministic `snapshot` marker on git-less source-snapshot builds
  assert.match(v, /^\d+\.\d+\.\d+\+([0-9a-f]+(-dirty)?|snapshot)$/,
    'RULES_VERSION = CARGO_PKG_VERSION+hash');
  assert.equal(v, wasm.rules_version(), 'raw surface agrees');
});

test('rules_catalog_json: parseable, stamped, registered set is frozen-slot-only', () => {
  const cat = JSON.parse(rulesCatalogJson()) as {
    rulesVersion: string; rulesets: { id: string }[];
  };
  assert.equal(cat.rulesVersion, rulesVersion());
  assert.ok(Array.isArray(cat.rulesets));
  const slots = new Set([
    'nineball-v1', 'eightball-v1', 'onepocket-v1', 'snooker-v1',
    'carom3c-v1',
    // feature 022 registry growth (T009 repin; contracts/registry-api.md
    // §1): the additive sixth slot — the five v1 slots stay byte-frozen
    'eightball-v2',
    // feature 025 registry growth (issue #65): the additive seventh slot
    'fourteenone-v1',
    // feature 026 registry growth (GH-343): the additive eighth slot
    'tenball-v1',
    // GH-383 registry growth: the additive ninth slot
    'carom3c-v2',
    // GH-382 registry growth (build 17): the additive tenth slot
    'snooker-v2',
    // GH-491 registry growth (build 18): the additive eleventh slot
    'heyball-v1']);
  for (const e of cat.rulesets) {
    assert.ok(slots.has(e.id), `${e.id} is a frozen registry slot`);
  }
});

test('stub id: every entry point rethrows the crate error as RulesError, message verbatim', () => {
  const wantMessage = "unknown ruleset 'stub-v0'";
  for (const call of [
    () => judgeJson('stub-v0', '{}', '{}', 'null'),
    () => initialStateJson('stub-v0', 1),
    () => applyDecisionJson('stub-v0', '{}', '{"decision":1,"choice":1}'),
    () => hudStateJson('stub-v0', '{}'),
  ]) {
    assert.throws(call, (e: unknown) => {
      assert.ok(e instanceof RulesError, 'rethrown as RulesError');
      assert.ok(e instanceof Error);
      assert.equal(e.message, wantMessage, 'crate message verbatim');
      return true;
    });
  }
});

test('raw surface ships crate bytes verbatim — byte-equal to the corpus pin', () => {
  const raw = wasm.rules_judge_json('stub-v0', '{}', '{}', 'null');
  assert.equal(raw, STUB_ERROR_BYTES);
  // the frozen corpus pins the exact same bytes (byte oracle seed)
  const corpus = JSON.parse(readFileSync(new URL(
    '../../../../scripts/fixtures/rules-corpus.json', import.meta.url),
  'utf8')) as { cases: { id: string; expect: string }[] };
  const pin = corpus.cases.find(
    (c) => c.id === 'stub-v0/judge-error-001-unknown-ruleset');
  assert.ok(pin, 'stub corpus case exists');
  assert.equal(raw, pin.expect);
});

test('unwrap: error payloads throw, judgment bytes pass through untouched', () => {
  assert.throws(() => unwrap(STUB_ERROR_BYTES), RulesError);
  const bytes = '{"legal":true,"fouls":[]}';
  assert.equal(unwrap(bytes), bytes);
});
