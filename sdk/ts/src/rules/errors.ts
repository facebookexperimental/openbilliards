// Copyright (c) Meta Platforms, Inc. and affiliates.

// errors.ts — the rules-engine error class as a LEAF module (feature 013
// T028 boot-graph fix). `RulesError` is (re-)exported by ./index.js —
// every existing import path keeps working with the SAME class identity —
// but ./backend.js imports it from HERE, so the shipped app boot path
// (web/app/flow.js → rules/nineball.js → rules/backend.js) no longer
// pulls the whole ruleset registry (./index.js and its five ruleset
// modules) into the STATIC module graph. That preserves the pre-013
// loading property the app relies on: `import('rules/index.js')` in
// flow.js settles by its own fetch chain, not instantly from the module
// cache, so the games-catalog dynamic import (web/app/game.js) keeps
// winning the boot race it always won (e2e-onepocket S1 pins it).

/** Thrown on rules-engine programming errors (unknown ruleset, decision
 * with nothing pending, out-of-range choice, missing mandatory call). */
export class RulesError extends Error {
  override name = 'RulesError';
}
