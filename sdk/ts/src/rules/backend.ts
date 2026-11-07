// Copyright (c) Meta Platforms, Inc. and affiliates.

// backend.ts — PRIVATE crate-rules backend (feature 013, research R6;
// contracts/rules-crate-api.md §4b): loads the canonical pool-rules wasm
// artifact (web/dist/pool-rules, committed — never a local rebuild) with
// MODULE TOP-LEVEL AWAIT, so every importer (the per-ruleset wrappers as
// they swap, T022+) sees a synchronously callable backend with zero init
// hooks — the engine.ts dual-env precedent, and the property that lets
// the shipped scenario suites keep passing with ZERO edits (SC-001).
//
// Artifact discovery: ordered candidates relative to import.meta.url —
//   1. ../../pool-rules/pool_rules.js
//      (the web/dist/pool-sdk/rules/ mirror -> web/dist/pool-rules/)
//   2. ../../../../../web/dist/pool-rules/pool_rules.js
//      (repo-relative: node tests run from sdk/ts/dist/src/rules/)
// First hit wins; both name the SAME committed bytes.
//
// Environments: node reads the sibling _bg.wasm bytes via node:fs and
// feeds them to the glue init; the browser glue fetches its sibling
// (one `--target web` glue serves both — rules-artifact.md §4).
//
// Error contract: the wasm surface NEVER throws — failures cross as the
// structured `{"error":{"code","message"}}` payload, which the checked
// wrappers below rethrow as `RulesError` with the crate message
// VERBATIM (the 18 shipped assert.throws sites and the snooker
// message-pattern tests must keep passing unmodified).

// RulesError comes from the ./errors.js LEAF (same class identity as the
// ./index.js re-export): importing it from ./index.js here would put the
// ENTIRE ruleset registry on the app's static boot path (flow.js →
// nineball.js → this module) and turn flow.js's dynamic
// `import('rules/index.js')` into an instant cache hit — losing the
// boot race the games-catalog import must win (see errors.ts).
import { RulesError } from './errors.js';

/** The pool-rules wasm export surface (pool_rules.d.ts mirror). */
export interface RulesWasm {
  rules_version(): string;
  rules_catalog_json(): string;
  rules_initial_state_json(ruleset: string, breaker: number): string;
  rules_judge_json(
    ruleset: string, state: string, record: string, call: string): string;
  rules_apply_decision_json(
    ruleset: string, state: string, decision: string): string;
  rules_hud_state_json(ruleset: string, state: string): string;
}

interface RulesGlue extends RulesWasm {
  default(init?: { module_or_path: BufferSource }): Promise<unknown>;
}

const CANDIDATES = [
  '../../pool-rules/pool_rules.js',
  '../../../../../web/dist/pool-rules/pool_rules.js',
] as const;

const isNode = typeof process !== 'undefined'
  && process.versions?.node !== undefined;

async function load(): Promise<RulesGlue> {
  let lastErr: unknown = new Error('no artifact candidates');
  for (const rel of CANDIDATES) {
    const url = new URL(rel, import.meta.url);
    try {
      if (isNode) {
        const { fileURLToPath } = await import('node:url');
        const { readFile } = await import('node:fs/promises');
        const glue = (await import(url.href)) as RulesGlue;
        const wasmUrl = new URL(url.href.replace(/\.js$/, '_bg.wasm'));
        const bytes = await readFile(fileURLToPath(wasmUrl));
        await glue.default({ module_or_path: bytes });
        return glue;
      }
      const glue = (await import(url.href)) as RulesGlue;
      await glue.default(); // browser: the glue fetches its sibling wasm
      return glue;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new RulesError(
    'pool-rules wasm artifact not found (web/dist/pool-rules): '
    + `${(lastErr as Error)?.message ?? String(lastErr)}`);
}

/** The initialized glue — RAW crate bytes, no exception mapping (the
 * conformance runner's "write it raw" surface). Module TLA: settled
 * before any importer executes. */
export const wasm: RulesWasm = await load();

/** Rethrow helper: crate `{"error":…}` payloads become RulesError with
 * the frozen message text verbatim; judgment bytes pass through. */
export function unwrap(bytes: string): string {
  if (bytes.startsWith('{"error"')) {
    const payload =
      JSON.parse(bytes) as { error: { code: string; message: string } };
    throw new RulesError(payload.error.message);
  }
  return bytes;
}

/** RULES_VERSION (`0.1.0+<git>` — independent of the physics stamp). */
export function rulesVersion(): string {
  return wasm.rules_version();
}

/** Registry catalog bytes (TS pure-data drift-gate target). */
export function rulesCatalogJson(): string {
  return wasm.rules_catalog_json();
}

/** Canonical initial-state bytes; RulesError on failure. */
export function initialStateJson(ruleset: string, breaker: number): string {
  return unwrap(wasm.rules_initial_state_json(ruleset, breaker));
}

/** Canonical judgment bytes; RulesError on failure. `call` = `'null'`
 * for games without call inputs. */
export function judgeJson(
  ruleset: string, state: string, record: string, call: string,
): string {
  return unwrap(wasm.rules_judge_json(ruleset, state, record, call));
}

/** Canonical next-state bytes; RulesError on failure. */
export function applyDecisionJson(
  ruleset: string, state: string, decision: string,
): string {
  return unwrap(wasm.rules_apply_decision_json(ruleset, state, decision));
}

/** Canonical HUD-state bytes; RulesError on failure. */
export function hudStateJson(ruleset: string, state: string): string {
  return unwrap(wasm.rules_hud_state_json(ruleset, state));
}
