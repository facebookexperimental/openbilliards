// Copyright (c) Meta Platforms, Inc. and affiliates.

// sdk/ts/src/games — the GameCatalog module barrel (feature 011). LEAF
// MODULE: deep-imported by the app as web/dist/pool-sdk/games/index.js (or
// the modules directly), NEVER exported from the frozen SDK barrel
// (src/index.ts) — plan.md Structure Decision + the ownership ledger (internal)
// cache-poison contract (new modules are leaves; app consumers
// feature-detect via dynamic import).

export type {
  CitedText, DisciplineFamily, FoulDef, GameEntry, GameId, GameProvenance,
  Readiness, ReadinessPrerequisite, TableClassRef,
} from './catalog.js';
export {
  DEFAULT_GAME, GAME_CATALOG, GameCatalogError, getGameEntry,
  validateGameCatalog, validateGameEntry,
} from './catalog.js';

export type { RackTemplate, RackTemplateId } from './rack.js';
export {
  RACK_TEMPLATES, RACK_TEMPLATE_CITES, RackTemplateError, applyRackTemplate,
  resolveRackTemplate,
} from './rack.js';
