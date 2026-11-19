// Copyright (c) Meta Platforms, Inc. and affiliates.

export type { CitedText, DisciplineFamily, FoulDef, GameEntry, GameId, GameProvenance, Readiness, ReadinessPrerequisite, TableClassRef, } from './catalog.js';
export { DEFAULT_GAME, GAME_CATALOG, GameCatalogError, getGameEntry, validateGameCatalog, validateGameEntry, } from './catalog.js';
export type { RackTemplate, RackTemplateId } from './rack.js';
export { RACK_TEMPLATES, RACK_TEMPLATE_CITES, RackTemplateError, applyRackTemplate, resolveRackTemplate, } from './rack.js';
