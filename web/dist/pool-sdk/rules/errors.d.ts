// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Thrown on rules-engine programming errors (unknown ruleset, decision
 * with nothing pending, out-of-range choice, missing mandatory call). */
export declare class RulesError extends Error {
    name: string;
}
