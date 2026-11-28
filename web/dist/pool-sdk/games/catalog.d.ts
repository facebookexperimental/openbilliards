// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { RulesetId } from '../rules/index.js';
import type { RackTemplateId } from './rack.js';
export type GameId = 'nine_ball' | 'eight_ball' | 'snooker' | 'carom_3cushion' | 'one_pocket' | 'straight_pool' | 'ten_ball' | 'heyball';
export type DisciplineFamily = 'pool' | 'snooker' | 'carom';
export type Readiness = 'playable' | 'config_ready';
/** Single provenance tier — the game-catalog analogue of catalog.ts
 * `Calibration`. Exactly one tier exists (Rulebook); there is deliberately
 * no `Estimated` equivalent: uncited entries are invalid, not lower-tier. */
export interface GameProvenance {
    body: string;
    rulebook: string;
    edition: string;
    url: string;
    sections: string;
}
export interface CitedText {
    text: string;
    cite: string;
}
export interface FoulDef {
    code: string;
    cite: string;
    detection: 'events' | 'nomination' | 'out_of_scope';
}
export type TableClassRef = {
    kind: 'catalog';
    table_ids: string[];
} | {
    kind: 'missing';
    prerequisite: string;
};
export interface ReadinessPrerequisite {
    id: string;
    kind: 'equipment' | 'rack_template' | 'ruleset' | 'ui';
    description: string;
    cite: string;
}
export interface GameEntry {
    id: GameId;
    display_name: string;
    discipline_family: DisciplineFamily;
    provenance: GameProvenance;
    readiness: Readiness;
    ball_count: number;
    ballset_ids: string[];
    table_class: TableClassRef;
    rack_template: RackTemplateId;
    break_requirements: CitedText;
    legal_shot: CitedText;
    foul_taxonomy: FoulDef[];
    scoring_win: CitedText;
    respot_rules: CitedText;
    turn_rotation: CitedText;
    call_shot: CitedText | null;
    ruleset_id: RulesetId | null;
    prerequisites: ReadinessPrerequisite[];
}
/** Thrown on unknown ids and on every validation rejection (V1-V8). */
export declare class GameCatalogError extends Error {
    name: string;
}
/** The shipped catalog — the 5-entry content freeze of
 * contracts/game-catalog.md: the two feature-011 playable entries (trunk,
 * T005) plus the three former `config_ready` readiness entries
 * (catalog-data lane, T027-T029) FLIPPED to `playable` by feature 012
 * T048 (research.md R12): their rulesets registered (US1-US3 story
 * lanes), their tables shipped (equipment catalog v6), their rack
 * templates resolve (T021), so every prerequisite is met and the
 * inventory lists are now empty. */
export declare const GAME_CATALOG: readonly GameEntry[];
/** The app's default game (FR-003: 9-ball behaves exactly as before). */
export declare const DEFAULT_GAME: GameId;
/** Entry lookup. Throws GameCatalogError on unknown ids. */
export declare function getGameEntry(id: string): GameEntry;
/**
 * Validate one entry against rules V1-V8 (data-model.md §1.2). Pure;
 * throws GameCatalogError naming the entry and the violated rule. There is
 * NO bypass tier: a citation-less entry is invalid, never lower-tier
 * (FR-002, US4-AS3).
 */
export declare function validateGameEntry(e: GameEntry): void;
/** Validate a whole catalog: every entry validates and ids are unique
 * (V8; immutability-once-shipped is a review-time rule — corrections get
 * NEW ids, equipment-catalog convention). */
export declare function validateGameCatalog(c: readonly GameEntry[]): void;
