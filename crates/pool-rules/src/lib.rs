// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! pool-rules — the single source of rules truth for openbilliards
//! (feature 013): pool/snooker/carom adjudication as PURE functions over
//! recorded shot event streams. No physics, no clock, no randomness, no
//! I/O — verdicts derive exclusively from serializable inputs (prior
//! match state, the recorded event stream, recorded calls/decisions).
//!
//! # Open boundary (issue #24, research R13)
//!
//! This crate is OPEN source (MIT), deliberately independent of the
//! pool-core physics kernel: it depends on NO other workspace crate and
//! parses its own lenient mirror of the ShotRecord wire schema
//! ([`wire`]). The rules transcribe PUBLIC rulebooks (WPA, WPBSA, UMB);
//! per-verdict rule citations are the public trust asset — every foul and
//! terminal verdict carries its pinned rule number.
//!
//! # One serializer, three transports (research R2)
//!
//! The five `_json` functions below are THE canonical boundary: the wasm
//! (`pool-rules-wasm`), Python (`pool-py`), and CLI (`pool-cli judge`)
//! surfaces return these bytes verbatim, and the byte-oracle conformance
//! gate (`scripts/fixtures/rules-corpus.json`, harvested from the shipped
//! TS implementation) compares them with `cmp`-strength equality. The
//! output domain is ints/strings/bools/null only — never floats
//! ([`judgment`] enforces this structurally).

pub mod error;
pub mod judgment;
pub mod primitives;
pub mod rulesets;
pub mod task_config;
pub mod wire;

pub use error::RulesError;
pub use judgment::{
    Chooser, CitedFoul, DecisionRequired, Judgment, PlacementRight, SeatPair,
    Terminal, Turn,
};

/// Seat number: `1 | 2` (validated at boundaries).
pub type Seat = u8;

/// The embedded stamp, newline-delimited so the freshness gate's
/// `grep -aoE '[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]+(-dirty)?'` over the raw
/// `.wasm` bytes can never absorb hex-looking NEIGHBOR bytes from
/// adjacent rodata strings (the rules-artifact contract §3 — the match must be the
/// stamp, exactly).
const RULES_VERSION_PADDED: &str = concat!(
    "\n", env!("CARGO_PKG_VERSION"), "+", env!("POOL_RULES_BUILD_HASH"), "\n"
);

/// `"0.1.0+<git>"` — independent of pool-core's `KERNEL_VERSION`
/// (FR-006). Judgment bytes never embed it (verdicts from different
/// builds of the same rules stay byte-comparable). A const subslice of
/// the padded rodata copy: exactly ONE stamp lives in the artifact.
pub const RULES_VERSION: &str = RULES_VERSION_PADDED.trim_ascii();

/// Registry catalog: ids, foul codes, cites, configs, decision tables
/// (grows per ruleset port; the TS pure-data drift gate pins against it).
pub fn catalog_json() -> String {
    rulesets::registry::catalog_json()
}

/// Initial match state for a fresh rack, as canonical state bytes.
pub fn initial_state_json(ruleset: &str, breaker: u8)
    -> Result<String, RulesError> {
    (rulesets::registry::lookup(ruleset)?.initial_state)(breaker)
}

/// Judge one settled shot: canonical [`Judgment`] bytes. MUST NOT be
/// called with a decision pending or after terminal (frozen `RulesError`).
/// `call_json` is `"null"` for games without call inputs.
pub fn judge_json(ruleset: &str, state_json: &str, record_json: &str,
    call_json: &str) -> Result<String, RulesError> {
    (rulesets::registry::lookup(ruleset)?.judge)(
        state_json, record_json, call_json)
}

/// Resolve a pending rulebook option: canonical next-state bytes.
pub fn apply_decision_json(ruleset: &str, state_json: &str,
    decision_json: &str) -> Result<String, RulesError> {
    (rulesets::registry::lookup(ruleset)?.apply_decision)(
        state_json, decision_json)
}

/// Match-state summary for HUD/e2e introspection (serializable).
pub fn hud_state_json(ruleset: &str, state_json: &str)
    -> Result<String, RulesError> {
    (rulesets::registry::lookup(ruleset)?.hud_state)(state_json)
}

/// Parse + validate a `task-config-v1` envelope, re-emit canonical bytes
/// (feature 022, the registry API contract §2 — the ONE serializer).
pub fn canonical_task_config_json(json: &str) -> Result<String, RulesError> {
    task_config::canonical_task_config_json(json)
}

/// SHA-256 lowercase hex over `canonical_task_config_json(json)`
/// (feature 022 — the ONE hasher; bindings never re-hash, SC-007).
pub fn task_hash(json: &str) -> Result<String, RulesError> {
    task_config::task_hash(json)
}

/// THE one registration/entry mechanism (feature 022, FR-001;
/// the registry API contract §2): routes on the envelope's kind/family
/// (the STRICT parse rejects everything unshipped) and returns the
/// initial match state — the `eightball` family embeds the resolved
/// config + `task_hash` as the state's `variant` block
/// (config-in-state, §3); the `fourteenone` family (feature 025) carries
/// its single config axis natively as the state's `target` (the state IS
/// the resolved config — carom precedent, rationale in
/// `rulesets/fourteenone.rs`); the `carom3c` family (GH-383) rides the
/// config-in-state carriage like eightball.
pub fn task_initial_state_json(task_config_json: &str, breaker_seat: u8)
    -> Result<String, RulesError> {
    match task_config::parse_task_config(task_config_json)? {
        task_config::TaskConfig::Eightball(config) => {
            rulesets::eightball_v2::initial_state_for_config(
                config, breaker_seat)
        }
        task_config::TaskConfig::FourteenOne(config) => {
            rulesets::fourteenone::initial_state_for_config(
                &config, breaker_seat)
        }
        task_config::TaskConfig::Carom3c(config) => {
            rulesets::carom3c_v2::initial_state_for_config(
                config, breaker_seat)
        }
        task_config::TaskConfig::Snooker(config) => {
            rulesets::snooker_v2::initial_state_for_config(
                config, breaker_seat)
        }
    }
}

/// The snooker-v2 address examination (feature GH-382): the Sec 3 R8
/// touching-ball called set and the Sec 2 R17 snookered fact (Sec 3
/// R12 FREE BALL when the state carries the mechanical eligibility),
/// over the LIVE positions the adapter owns (post-respot,
/// post-placement — respot XY derives adapter-side, the research notes R6).
/// `positions_json`: `{r, baulkY, cue: {x,y}|null, balls: [{id,x,y}]}`
/// — a null cue is in-hand (the R17(a) from-the-D arm).
pub fn snooker_address_facts_json(state_json: &str, positions_json: &str)
    -> Result<String, RulesError> {
    rulesets::snooker_v2::address_facts_json(state_json, positions_json)
}

/// Preset lookup for surfaces that start from a preset id (share replay,
/// settings): resolves the catalog row and delegates to
/// [`task_initial_state_json`]. Unknown id ⇒ the structured
/// `unknown-preset` error (the registry API contract §2/§5).
pub fn preset_initial_state_json(preset_id: &str, breaker_seat: u8)
    -> Result<String, RulesError> {
    let preset = task_config::preset_by_id(preset_id)?;
    task_initial_state_json(&preset.canonical_envelope, breaker_seat)
}
