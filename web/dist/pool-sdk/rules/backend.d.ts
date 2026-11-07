// Copyright (c) Meta Platforms, Inc. and affiliates.

/** The pool-rules wasm export surface (pool_rules.d.ts mirror). */
export interface RulesWasm {
    rules_version(): string;
    rules_catalog_json(): string;
    rules_initial_state_json(ruleset: string, breaker: number): string;
    rules_judge_json(ruleset: string, state: string, record: string, call: string): string;
    rules_apply_decision_json(ruleset: string, state: string, decision: string): string;
    rules_hud_state_json(ruleset: string, state: string): string;
}
/** The initialized glue — RAW crate bytes, no exception mapping (the
 * conformance runner's "write it raw" surface). Module TLA: settled
 * before any importer executes. */
export declare const wasm: RulesWasm;
/** Rethrow helper: crate `{"error":…}` payloads become RulesError with
 * the frozen message text verbatim; judgment bytes pass through. */
export declare function unwrap(bytes: string): string;
/** RULES_VERSION (`0.1.0+<git>` — independent of the physics stamp). */
export declare function rulesVersion(): string;
/** Registry catalog bytes (TS pure-data drift-gate target). */
export declare function rulesCatalogJson(): string;
/** Canonical initial-state bytes; RulesError on failure. */
export declare function initialStateJson(ruleset: string, breaker: number): string;
/** Canonical judgment bytes; RulesError on failure. `call` = `'null'`
 * for games without call inputs. */
export declare function judgeJson(ruleset: string, state: string, record: string, call: string): string;
/** Canonical next-state bytes; RulesError on failure. */
export declare function applyDecisionJson(ruleset: string, state: string, decision: string): string;
/** Canonical HUD-state bytes; RulesError on failure. */
export declare function hudStateJson(ruleset: string, state: string): string;
