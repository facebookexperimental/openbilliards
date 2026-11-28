// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `task-config-v1` / `rules-preset-v1` (feature 022, T003/T004) — the
//! FR-001 "one mechanism" config surface, frozen by
//! the variant-config contract §1–§4: ONE envelope, ONE canonical
//! serializer, ONE hash serve product rule variants today and `drill-v1`
//! TDL task points later.
//!
//! Disciplines enforced here, BEFORE any judging behavior exists:
//! - STRICT parse: unknown fields/kinds/families/values ⇒
//!   `invalid-task-config` — config is a determinism key; lenient parsing
//!   would let two spellings of one task hash differently or two tasks
//!   collide. Missing config fields take the documented WPA-baseline
//!   defaults (canonicalization re-emits them, so partial and full
//!   spellings of the same point hash identically).
//! - Canonical bytes: compact `serde_json` of the envelope, struct
//!   declaration order, EVERY field present (defaults not elided), value
//!   domain ints/strings/bools only — no floats, no null inside `config`.
//! - `task_hash` = SHA-256 lowercase hex over the canonical envelope
//!   bytes. The pool-rules crate is the ONLY serializer and the ONLY
//!   hasher: cli/py/wasm bindings pass these bytes through verbatim
//!   (SC-007 is a byte comparison).
//! - Preset files (`rules-preset-v1`, contract §3) are
//!   `include_str!`-embedded, parsed once, linted (FR-003/SC-003:
//!   non-empty `cite` on every judged/adapter entry, complete source
//!   header) — the `adapter` section NEVER reaches the config struct,
//!   the canonical bytes, or the hash (FR-012).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;

use crate::error::RulesError;

// ---- EightBallVariantConfig (contract §2; canonical order = declaration
// order; WPA defaults) --------------------------------------------------------

/// Call-shot regime (contract §2 row 1). `full` = WPA 1.7/4.6 (every
/// non-break shot calls or declares safety); `eight_only` = slop counts,
/// only the 8's pocket is marked (APA); `none` = no call exists (UNSLICED
/// schema point — cataloged consumers: CN8/VNEA families).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum CallShot {
    #[default]
    #[serde(rename = "full")]
    Full,
    #[serde(rename = "eight_only")]
    EightOnly,
    #[serde(rename = "none")]
    None,
}

/// Open-table group-assignment law (contract §2 row 4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum OpenTableAssignment {
    #[default]
    #[serde(rename = "called_pot")]
    CalledPot,
    #[serde(rename = "any_legal_pot")]
    AnyLegalPot,
    #[serde(rename = "first_hit_group")]
    FirstHitGroup,
    #[serde(rename = "take_what_you_make")]
    TakeWhatYouMake,
}

/// The 8 pocketed on the break (contract §2 row 5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum EightOnBreak {
    #[default]
    #[serde(rename = "option_tree")]
    OptionTree,
    #[serde(rename = "win")]
    Win,
    #[serde(rename = "win_unless_scratch")]
    WinUnlessScratch,
}

/// Cue scratch while shooting the 8 (contract §2 row 6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum ScratchOnEight {
    #[default]
    #[serde(rename = "foul")]
    Foul,
    #[serde(rename = "loss")]
    Loss,
}

/// Object ball driven off the table (contract §2 row 7). The 8 off the
/// table stays the terminal it is today under every value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum JumpedBall {
    #[default]
    #[serde(rename = "foul_stay_down")]
    FoulStayDown,
    #[serde(rename = "spot_no_foul")]
    SpotNoFoul,
    #[serde(rename = "spot_foul")]
    SpotFoul,
}

/// Consequence of a dry break under the rail minimum (contract §2 row 9).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum DryBreakConsequence {
    #[default]
    #[serde(rename = "option_tree")]
    OptionTree,
    #[serde(rename = "re_break")]
    ReBreak,
    #[serde(rename = "loss")]
    Loss,
}

/// Ball-in-hand domain after a break foul (contract §2 row 10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum BreakScratchBih {
    #[default]
    #[serde(rename = "kitchen")]
    Kitchen,
    #[serde(rename = "anywhere")]
    Anywhere,
}

/// WPA 3.11 kitchen-shot law (contract §2 row 11 — the GH-371 schema
/// growth of the deferred "WPA 3.10/3.11 kitchen enforcement" axis,
/// the variant catalog §5, internal). `wpa` judges 3.11 ¶1/¶2 on
/// strokes that began from a kitchen-restricted in-hand grant (the
/// WPA-baseline behavior per the schema-evolution law,
/// the variant-config contract §6); `off` is the pre-371 non-judging
/// point (UNSLICED schema point — the eightball-v1 parity consumers,
/// FR-009: no preset may ship it before its own slice freezes bytes).
/// 3.10 (bad placement) stays adapter-owned at placement time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum KitchenRule {
    #[default]
    #[serde(rename = "wpa")]
    Wpa,
    #[serde(rename = "off")]
    Off,
}

/// The shipped family struct (contract §2 VERBATIM: field names, domains,
/// declaration order, WPA defaults are FROZEN). Serde declaration order =
/// the canonical byte order; `#[serde(default)]` fills missing fields
/// with the WPA baseline; `deny_unknown_fields` is the STRICT-parse gate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct EightBallVariantConfig {
    pub call_shot: CallShot,
    pub safety_call: bool,
    pub safety_pot_stays_down: bool,
    pub open_table_assignment: OpenTableAssignment,
    pub eight_on_break: EightOnBreak,
    pub scratch_on_eight: ScratchOnEight,
    pub jumped_ball: JumpedBall,
    /// u8, 0..=15 (0 = off) — validated post-parse ([`validate_config`]).
    pub dry_break_rail_minimum: u8,
    pub dry_break_consequence: DryBreakConsequence,
    pub break_scratch_bih: BreakScratchBih,
    /// Appended LAST by the GH-371 schema-evolution event (canonical
    /// order stable; every preset hash changed — the §6 full-repin law).
    pub kitchen_rule: KitchenRule,
}

impl Default for EightBallVariantConfig {
    /// The WPA-baseline config point (contract §2 default column) — the
    /// `wpa-8ball` preset resolves byte-identical to this.
    fn default() -> EightBallVariantConfig {
        EightBallVariantConfig {
            call_shot: CallShot::Full,
            safety_call: true,
            safety_pot_stays_down: true,
            open_table_assignment: OpenTableAssignment::CalledPot,
            eight_on_break: EightOnBreak::OptionTree,
            scratch_on_eight: ScratchOnEight::Foul,
            jumped_ball: JumpedBall::FoulStayDown,
            dry_break_rail_minimum: 4,
            dry_break_consequence: DryBreakConsequence::OptionTree,
            break_scratch_bih: BreakScratchBih::Kitchen,
            kitchen_rule: KitchenRule::Wpa,
        }
    }
}

// ---- FourteenOneVariantConfig (feature 025, issue #65) -------------------------

/// The `fourteenone` family config (14.1 Continuous, WPA Rules of Play
/// eff. 2025-09-15 Sec 7): the race-to target of the match. Domain is
/// STRICT — 75 | 100 | 125, the sanctioned match distances (default
/// 100); any other value rejects like an unknown enum value (P-VII).
/// Declaration order = the canonical byte order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct FourteenOneVariantConfig {
    pub target: i64,
}

impl Default for FourteenOneVariantConfig {
    fn default() -> FourteenOneVariantConfig {
        FourteenOneVariantConfig { target: 100 }
    }
}

/// Domain checks serde cannot express: `target` ∈ {75, 100, 125}.
pub(crate) fn validate_fourteenone_config(config: &FourteenOneVariantConfig)
    -> Result<(), RulesError> {
    if !matches!(config.target, 75 | 100 | 125) {
        return Err(invalid(format!(
            "task-config: fourteenone target {} out of domain \
             (75 | 100 | 125)",
            config.target
        )));
    }
    Ok(())
}

// ---- Carom3cVariantConfig (GH-383) ---------------------------------------------

/// The `carom3c` family config (UMB World Rules of Carom Billiard,
/// 1 Jan 1989, three cushions). Compiled by GH-383 (the family was
/// RESERVED since 022 — admitted here with its consumer, `carom3c-v2`,
/// per P-VII). Declaration order = the canonical byte order; every
/// default is the frozen `carom3c-v1` behavior point (the `umb-carom`
/// default preset routes through the untouched v1 id, FR-005).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct CaromVariantConfig {
    /// Race-to distance (UMB Art 29.1: "determined by the committee" —
    /// a bounded positive int, not an enum; default 15 = the spec-012
    /// Assumption the shipped app plays). Validated 1..=100 post-parse.
    pub target: i64,
    /// UMB Art 22.1/23.2/23.4: two cue balls (one plain white, one
    /// marked/yellow), the starter plays the plain white, each player
    /// keeps the same ball for the match; playing the opponent's ball is
    /// the Art 41.11 "wrong ball" foul. `false` = the documented v1
    /// shared-white residual (both seats strike ball 0, no 41.11).
    pub two_cue_balls: bool,
    /// UMB Art 83 letter: fewer than three cushions before the second
    /// object ball "there will be a foul (indicated by 'no cushion' or
    /// 'one cushion' or 'two cushions')". `false` = the v1
    /// classification (cited NON-scoring reason, `legal: true` — the
    /// audit-carom F1 surface; identical score/turn consequences).
    pub insufficient_cushions_foul: bool,
    /// UMB Art 29.3/29.4: the equal-innings regime — when the FINISHER
    /// opened the game, the opponent levels the innings from the
    /// respotted initial starting position; a draw is possible. `false`
    /// = the "without an even number of innings" regime (Art 29.3 makes
    /// both rulebook-legal; v1 ships without).
    pub equal_innings: bool,
}

impl Default for CaromVariantConfig {
    /// The frozen v1 behavior point (`umb-carom` resolves byte-identical
    /// to this).
    fn default() -> CaromVariantConfig {
        CaromVariantConfig {
            target: 15,
            two_cue_balls: false,
            insufficient_cushions_foul: false,
            equal_innings: false,
        }
    }
}

/// Domain checks serde cannot express: `target` ∈ 1..=100 (Art 29.1
/// leaves the distance to the committee — common sanctioned distances
/// run 15..=50; the bound refuses degenerate/absurd race lengths).
pub(crate) fn validate_carom_config(config: &CaromVariantConfig)
    -> Result<(), RulesError> {
    if !(1..=100).contains(&config.target) {
        return Err(invalid(format!(
            "task-config: carom3c target {} out of domain 1..=100",
            config.target
        )));
    }
    Ok(())
}

// ---- SnookerVariantConfig (feature GH-382, build 17) ---------------------------

/// The `snooker` family config (WPBSA Official Rules, Revised September
/// 2024): the three completion axes GH-382 added over the frozen
/// `snooker-v1` behavior — Foul and a Miss (Sec 3 R14), Free Ball
/// (Sec 2 R13 / Sec 3 R12), Touching Ball (Sec 3 R8). All-false IS the
/// v1 judgment point (the fidelity differential pins it); the shipped
/// `wpbsa-snooker-full` preset overlays all three `true` with cites.
/// Declaration order = the canonical byte order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct SnookerVariantConfig {
    pub miss_rule: bool,
    pub free_ball: bool,
    pub touching_ball: bool,
}

impl Default for SnookerVariantConfig {
    /// The v1-parity point (every axis off).
    fn default() -> SnookerVariantConfig {
        SnookerVariantConfig {
            miss_rule: false,
            free_ball: false,
            touching_ball: false,
        }
    }
}

// ---- envelope (contract §1) ---------------------------------------------------

/// Envelope literals (contract §1). RESERVED values (`"drill"` kind; the
/// `nineball`/`onepocket` families) are documented, NOT compiled —
/// admitted only with their consumer (P-VII); they reject exactly like
/// unknown values. The `fourteenone` family compiled with feature 025
/// (issue #65 — the second shipped family); `carom3c` compiled with
/// GH-383 (the third); the `snooker` family with feature GH-382 (the
/// fourth — the two build-17 growth events composed at the merge).
pub const TASK_CONFIG_SCHEMA: &str = "task-config-v1";
const KIND_RULES_VARIANT: &str = "rules-variant";
const FAMILY_EIGHTBALL: &str = "eightball";
const FAMILY_FOURTEENONE: &str = "fourteenone";
const FAMILY_CAROM3C: &str = "carom3c";
const FAMILY_SNOOKER: &str = "snooker";

/// A parsed, validated task config routed by family (the
/// `task_initial_state_json` dispatch input — the registry API contract
/// §2's "routes on the envelope's kind/family").
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskConfig {
    Eightball(EightBallVariantConfig),
    FourteenOne(FourteenOneVariantConfig),
    Carom3c(CaromVariantConfig),
    Snooker(SnookerVariantConfig),
}

impl TaskConfig {
    /// The family literal of this config point.
    pub fn family(&self) -> &'static str {
        match self {
            TaskConfig::Eightball(_) => FAMILY_EIGHTBALL,
            TaskConfig::FourteenOne(_) => FAMILY_FOURTEENONE,
            TaskConfig::Carom3c(_) => FAMILY_CAROM3C,
            TaskConfig::Snooker(_) => FAMILY_SNOOKER,
        }
    }

    /// Serialize the inner config as a JSON value (catalog preset rows).
    pub fn to_value(&self) -> Value {
        match self {
            TaskConfig::Eightball(c) => serde_json::to_value(c),
            TaskConfig::FourteenOne(c) => serde_json::to_value(c),
            TaskConfig::Carom3c(c) => serde_json::to_value(c),
            TaskConfig::Snooker(c) => serde_json::to_value(c),
        }
        .expect("config serialization is infallible")
    }

    /// The eightball config, if this is an eightball point.
    pub fn as_eightball(&self) -> Option<&EightBallVariantConfig> {
        match self {
            TaskConfig::Eightball(c) => Some(c),
            _ => None,
        }
    }

    /// The carom3c config, if this is a carom3c point (GH-383).
    pub fn as_carom3c(&self) -> Option<&CaromVariantConfig> {
        match self {
            TaskConfig::Carom3c(c) => Some(c),
            _ => None,
        }
    }

    /// Canonical envelope bytes for this config point (the ONE
    /// serializer, family-routed).
    pub fn canonical_envelope(&self) -> String {
        match self {
            TaskConfig::Eightball(c) => canonical_envelope_json(c),
            TaskConfig::FourteenOne(c) => {
                canonical_envelope_json_fourteenone(c)
            }
            TaskConfig::Carom3c(c) => canonical_envelope_json_carom3c(c),
            TaskConfig::Snooker(c) => canonical_envelope_json_snooker(c),
        }
    }
}

/// Serialization-side envelope: declaration order IS the canonical byte
/// order (`schema, kind, family, config`).
#[derive(Serialize)]
struct EnvelopeOut<'a, C: Serialize> {
    schema: &'static str,
    kind: &'static str,
    family: &'static str,
    config: &'a C,
}

fn invalid(msg: impl Into<String>) -> RulesError {
    RulesError::InvalidTaskConfig(msg.into())
}

/// Domain checks serde cannot express: `dry_break_rail_minimum` 0..=15.
pub(crate) fn validate_config(config: &EightBallVariantConfig)
    -> Result<(), RulesError> {
    if config.dry_break_rail_minimum > 15 {
        return Err(invalid(format!(
            "task-config: dry_break_rail_minimum {} out of domain 0..=15",
            config.dry_break_rail_minimum
        )));
    }
    Ok(())
}

/// STRICT envelope parse (contract §1): any unknown field, kind, family,
/// config field, or value ⇒ `invalid-task-config`. Routes on the
/// envelope's family (`eightball` | `fourteenone` — the two shipped
/// families).
pub fn parse_task_config(json: &str) -> Result<TaskConfig, RulesError> {
    let v: Value = serde_json::from_str(json)
        .map_err(|e| invalid(format!("task-config: malformed JSON: {e}")))?;
    let obj = v.as_object().ok_or_else(|| {
        invalid("task-config: the envelope must be a JSON object")
    })?;
    for key in obj.keys() {
        if !matches!(key.as_str(), "schema" | "kind" | "family" | "config") {
            return Err(invalid(format!(
                "task-config: unknown envelope field '{key}'"
            )));
        }
    }
    match obj.get("schema").and_then(Value::as_str) {
        Some(TASK_CONFIG_SCHEMA) => {}
        Some(other) => {
            return Err(invalid(format!(
                "task-config: unknown schema '{other}' \
                 (expected '{TASK_CONFIG_SCHEMA}')"
            )));
        }
        None => return Err(invalid("task-config: missing 'schema'")),
    }
    match obj.get("kind").and_then(Value::as_str) {
        Some(KIND_RULES_VARIANT) => {}
        Some(other) => {
            return Err(invalid(format!(
                "task-config: unknown kind '{other}' \
                 (shipped: '{KIND_RULES_VARIANT}')"
            )));
        }
        None => return Err(invalid("task-config: missing 'kind'")),
    }
    let family = match obj.get("family").and_then(Value::as_str) {
        Some(f @ (FAMILY_EIGHTBALL | FAMILY_FOURTEENONE | FAMILY_CAROM3C
            | FAMILY_SNOOKER)) => f,
        Some(other) => {
            return Err(invalid(format!(
                "task-config: unknown family '{other}' \
                 (shipped: '{FAMILY_EIGHTBALL}', '{FAMILY_FOURTEENONE}', \
                 '{FAMILY_CAROM3C}', '{FAMILY_SNOOKER}')"
            )));
        }
        None => return Err(invalid("task-config: missing 'family'")),
    };
    let config_v = obj
        .get("config")
        .ok_or_else(|| invalid("task-config: missing 'config'"))?;
    if !config_v.is_object() {
        return Err(invalid("task-config: 'config' must be a JSON object"));
    }
    if family == FAMILY_FOURTEENONE {
        let config: FourteenOneVariantConfig =
            serde_json::from_value(config_v.clone())
                .map_err(|e| invalid(format!("task-config: config: {e}")))?;
        validate_fourteenone_config(&config)?;
        return Ok(TaskConfig::FourteenOne(config));
    }
    if family == FAMILY_CAROM3C {
        let config: CaromVariantConfig =
            serde_json::from_value(config_v.clone())
                .map_err(|e| invalid(format!("task-config: config: {e}")))?;
        validate_carom_config(&config)?;
        return Ok(TaskConfig::Carom3c(config));
    }
    if family == FAMILY_SNOOKER {
        // booleans only — serde's strict parse IS the domain check
        let config: SnookerVariantConfig =
            serde_json::from_value(config_v.clone())
                .map_err(|e| invalid(format!("task-config: config: {e}")))?;
        return Ok(TaskConfig::Snooker(config));
    }
    let config: EightBallVariantConfig =
        serde_json::from_value(config_v.clone())
            .map_err(|e| invalid(format!("task-config: config: {e}")))?;
    validate_config(&config)?;
    Ok(TaskConfig::Eightball(config))
}

/// Canonical envelope bytes for a validated eightball config (the ONE
/// serializer, eightball leg — `eightball_v2`'s `VariantBlock` rides it).
pub fn canonical_envelope_json(config: &EightBallVariantConfig) -> String {
    serde_json::to_string(&EnvelopeOut {
        schema: TASK_CONFIG_SCHEMA,
        kind: KIND_RULES_VARIANT,
        family: FAMILY_EIGHTBALL,
        config,
    })
    .expect("envelope serialization is infallible")
}

/// Canonical envelope bytes for a validated fourteenone config (the ONE
/// serializer, fourteenone leg — feature 025).
pub fn canonical_envelope_json_fourteenone(
    config: &FourteenOneVariantConfig,
) -> String {
    serde_json::to_string(&EnvelopeOut {
        schema: TASK_CONFIG_SCHEMA,
        kind: KIND_RULES_VARIANT,
        family: FAMILY_FOURTEENONE,
        config,
    })
    .expect("envelope serialization is infallible")
}

/// Canonical envelope bytes for a validated carom3c config (the ONE
/// serializer, carom3c leg — GH-383; `carom3c_v2`'s `VariantBlock` rides
/// it).
pub fn canonical_envelope_json_carom3c(config: &CaromVariantConfig) -> String {
    serde_json::to_string(&EnvelopeOut {
        schema: TASK_CONFIG_SCHEMA,
        kind: KIND_RULES_VARIANT,
        family: FAMILY_CAROM3C,
        config,
    })
    .expect("envelope serialization is infallible")
}

/// Canonical envelope bytes for a validated snooker config (the ONE
/// serializer, snooker leg — feature GH-382).
pub fn canonical_envelope_json_snooker(
    config: &SnookerVariantConfig,
) -> String {
    serde_json::to_string(&EnvelopeOut {
        schema: TASK_CONFIG_SCHEMA,
        kind: KIND_RULES_VARIANT,
        family: FAMILY_SNOOKER,
        config,
    })
    .expect("envelope serialization is infallible")
}

/// Parse + validate a task-config envelope, re-emit canonical bytes
/// (the registry API contract §2).
pub fn canonical_task_config_json(json: &str) -> Result<String, RulesError> {
    Ok(parse_task_config(json)?.canonical_envelope())
}

/// SHA-256 lowercase hex over `canonical_task_config_json(json)`
/// (the registry API contract §2).
pub fn task_hash(json: &str) -> Result<String, RulesError> {
    Ok(sha256_hex(canonical_task_config_json(json)?.as_bytes()))
}

// ---- preset files (`rules-preset-v1`, contract §3–§4) -------------------------

const WPA_8BALL_JSON: &str =
    include_str!("../presets/eightball/wpa-8ball.json");
const APA_8BALL_JSON: &str =
    include_str!("../presets/eightball/apa-8ball.json");
const WPA_14_1_JSON: &str =
    include_str!("../presets/fourteenone/wpa-14-1.json");
const UMB_CAROM_JSON: &str =
    include_str!("../presets/carom3c/umb-carom.json");
const UMB_CAROM_2CUE_JSON: &str =
    include_str!("../presets/carom3c/umb-carom-2cue.json");
const UMB_CAROM_2CUE_EI_JSON: &str =
    include_str!("../presets/carom3c/umb-carom-2cue-ei.json");
const WPBSA_SNOOKER_JSON: &str =
    include_str!("../presets/snooker/wpbsa-snooker.json");
const WPBSA_SNOOKER_FULL_JSON: &str =
    include_str!("../presets/snooker/wpbsa-snooker-full.json");

/// One judged overlay entry: the config value NEXT TO its rulebook clause
/// (research R3 — the US1 reviewer shape).
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JudgedEntry {
    value: Value,
    cite: String,
}

/// One adapter-owned environment fact. NEVER enters the config struct,
/// the canonical bytes, or the hash (FR-012).
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AdapterEntry {
    #[allow(dead_code)]
    value: Value,
    cite: String,
    owner: String,
}

/// One honest-coverage row (FR-011).
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NotModeledRow {
    #[allow(dead_code)]
    axis: String,
    cite: String,
    #[allow(dead_code)]
    reason: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PresetSource {
    title: String,
    publisher: String,
    edition: String,
    url: String,
    tier: String,
    /// Schema-complete per contract §3; no shipped preset inherits yet.
    #[allow(dead_code)]
    #[serde(default)]
    inherits: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PresetFile {
    schema: String,
    preset: String,
    family: String,
    display_key: String,
    source: PresetSource,
    #[serde(default)]
    judged: serde_json::Map<String, Value>,
    #[serde(default)]
    adapter: serde_json::Map<String, Value>,
    #[serde(default)]
    not_modeled: Vec<Value>,
}

/// A shipped preset after resolution: header metadata (the catalog
/// `PresetRow` source), the resolved config, and its canonical identity.
/// `&'static str` fields are one-time leaks of the embedded file's
/// strings (parsed once per process; contract §4 `PresetRow` shape).
#[derive(Debug)]
pub struct ResolvedPreset {
    pub id: &'static str,
    pub family: &'static str,
    pub display_key: &'static str,
    pub source_title: &'static str,
    pub source_edition: &'static str,
    pub source_url: &'static str,
    /// `"primary" | "secondary"`.
    pub tier: &'static str,
    /// FR-005 default-routing instruction: `Some("eightball-v1")` on
    /// `wpa-8ball`, `Some("fourteenone-v1")` on `wpa-14-1` (registry-side
    /// data, contract §4 — not a file field).
    pub aliases: Option<&'static str>,
    /// The resolved config, family-routed (feature 025 grew this from
    /// the eightball-only struct).
    pub config: TaskConfig,
    /// Canonical envelope bytes of the resolved config.
    pub canonical_envelope: String,
    /// SHA-256 lowercase hex over `canonical_envelope`.
    pub task_hash: String,
}

fn leak(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

/// Parse + LINT + resolve one preset file (FR-003/SC-003 gate; the
/// negative fixture proves it fails loudly). Lint invariants per contract
/// §3: parseable; complete source header (tier ∈ primary|secondary);
/// non-empty `cite` on every judged/adapter/not_modeled entry; `judged`
/// overlays only known config fields; the overlay resolves to a valid §2
/// config. The `adapter` section is cite-linted but NEVER read into the
/// config (FR-012).
fn lint_and_resolve(text: &str) -> Result<ResolvedPreset, String> {
    let f: PresetFile = serde_json::from_str(text)
        .map_err(|e| format!("preset parse: {e}"))?;
    if f.schema != "rules-preset-v1" {
        return Err(format!("preset '{}': unknown schema '{}'", f.preset,
            f.schema));
    }
    if f.family != FAMILY_EIGHTBALL
        && f.family != FAMILY_FOURTEENONE
        && f.family != FAMILY_CAROM3C
        && f.family != FAMILY_SNOOKER
    {
        return Err(format!("preset '{}': unknown family '{}'", f.preset,
            f.family));
    }
    let src = &f.source;
    for (field, value) in [
        ("title", &src.title), ("publisher", &src.publisher),
        ("edition", &src.edition), ("url", &src.url), ("tier", &src.tier),
    ] {
        if value.is_empty() {
            return Err(format!(
                "preset '{}': source.{field} is empty (incomplete source \
                 header)", f.preset));
        }
    }
    if src.tier != "primary" && src.tier != "secondary" {
        return Err(format!("preset '{}': source.tier '{}' is not \
             primary|secondary", f.preset, src.tier));
    }
    if f.display_key.is_empty() || f.preset.is_empty() {
        return Err(format!("preset '{}': empty preset id or display_key",
            f.preset));
    }

    // judged overlay → valid config (family defaults + cited deltas)
    let default_value = if f.family == FAMILY_FOURTEENONE {
        serde_json::to_value(FourteenOneVariantConfig::default())
    } else if f.family == FAMILY_CAROM3C {
        serde_json::to_value(CaromVariantConfig::default())
    } else if f.family == FAMILY_SNOOKER {
        serde_json::to_value(SnookerVariantConfig::default())
    } else {
        serde_json::to_value(EightBallVariantConfig::default())
    };
    let mut cfg_map = match default_value {
        Ok(Value::Object(m)) => m,
        _ => unreachable!("default config serializes to an object"),
    };
    for (field, raw) in &f.judged {
        let entry: JudgedEntry = serde_json::from_value(raw.clone())
            .map_err(|e| format!(
                "preset '{}': judged.{field}: {e}", f.preset))?;
        if entry.cite.trim().is_empty() {
            return Err(format!(
                "preset '{}': judged.{field} has an EMPTY cite — every \
                 judged value must carry its rulebook clause (FR-003)",
                f.preset));
        }
        if !cfg_map.contains_key(field.as_str()) {
            return Err(format!(
                "preset '{}': judged.{field} is not a config field",
                f.preset));
        }
        cfg_map.insert(field.clone(), entry.value);
    }
    let config: TaskConfig = if f.family == FAMILY_FOURTEENONE {
        let c: FourteenOneVariantConfig =
            serde_json::from_value(Value::Object(cfg_map))
                .map_err(|e| format!("preset '{}': resolved config: {e}",
                    f.preset))?;
        validate_fourteenone_config(&c)
            .map_err(|e| format!("preset '{}': {e}", f.preset))?;
        TaskConfig::FourteenOne(c)
    } else if f.family == FAMILY_CAROM3C {
        let c: CaromVariantConfig =
            serde_json::from_value(Value::Object(cfg_map))
                .map_err(|e| format!("preset '{}': resolved config: {e}",
                    f.preset))?;
        validate_carom_config(&c)
            .map_err(|e| format!("preset '{}': {e}", f.preset))?;
        TaskConfig::Carom3c(c)
    } else if f.family == FAMILY_SNOOKER {
        let c: SnookerVariantConfig =
            serde_json::from_value(Value::Object(cfg_map))
                .map_err(|e| format!("preset '{}': resolved config: {e}",
                    f.preset))?;
        TaskConfig::Snooker(c)
    } else {
        let c: EightBallVariantConfig =
            serde_json::from_value(Value::Object(cfg_map))
                .map_err(|e| format!("preset '{}': resolved config: {e}",
                    f.preset))?;
        validate_config(&c)
            .map_err(|e| format!("preset '{}': {e}", f.preset))?;
        TaskConfig::Eightball(c)
    };

    // cite lint over the sections that never touch the config
    for (key, raw) in &f.adapter {
        let entry: AdapterEntry = serde_json::from_value(raw.clone())
            .map_err(|e| format!(
                "preset '{}': adapter.{key}: {e}", f.preset))?;
        if entry.cite.trim().is_empty() {
            return Err(format!(
                "preset '{}': adapter.{key} has an EMPTY cite (FR-003)",
                f.preset));
        }
        if entry.owner != "adapter" {
            return Err(format!(
                "preset '{}': adapter.{key} owner '{}' must be 'adapter'",
                f.preset, entry.owner));
        }
    }
    for (i, raw) in f.not_modeled.iter().enumerate() {
        let row: NotModeledRow = serde_json::from_value(raw.clone())
            .map_err(|e| format!(
                "preset '{}': not_modeled[{i}]: {e}", f.preset))?;
        if row.cite.trim().is_empty() {
            return Err(format!(
                "preset '{}': not_modeled[{i}] has an EMPTY cite (FR-003)",
                f.preset));
        }
    }

    let canonical_envelope = config.canonical_envelope();
    let hash = sha256_hex(canonical_envelope.as_bytes());
    let aliases = match f.preset.as_str() {
        // FR-005: the default preset plays through the registry id.
        "wpa-8ball" => Some("eightball-v1"),
        "wpa-14-1" => Some("fourteenone-v1"),
        "umb-carom" => Some("carom3c-v1"),
        "wpbsa-snooker" => Some("snooker-v1"),
        _ => None,
    };
    Ok(ResolvedPreset {
        id: leak(f.preset),
        family: leak(f.family),
        display_key: leak(f.display_key),
        source_title: leak(f.source.title),
        source_edition: leak(f.source.edition),
        source_url: leak(f.source.url),
        tier: leak(f.source.tier),
        aliases,
        config,
        canonical_envelope,
        task_hash: hash,
    })
}

/// The shipped presets (contract §4), parsed + linted once per process.
/// A defective EMBEDDED preset is a build defect: the lint unit tests
/// gate it in CI; at runtime it fails fast here.
pub fn shipped_presets() -> &'static [ResolvedPreset] {
    static PRESETS: OnceLock<Vec<ResolvedPreset>> = OnceLock::new();
    PRESETS.get_or_init(|| {
        let all: Vec<ResolvedPreset> = [
            WPA_8BALL_JSON, APA_8BALL_JSON, WPA_14_1_JSON,
            UMB_CAROM_JSON, UMB_CAROM_2CUE_JSON, UMB_CAROM_2CUE_EI_JSON,
            WPBSA_SNOOKER_JSON, WPBSA_SNOOKER_FULL_JSON,
        ]
            .iter()
            .map(|text| {
                lint_and_resolve(text)
                    .expect("embedded preset passes the lint gate")
            })
            .collect();
        for (i, a) in all.iter().enumerate() {
            for b in &all[i + 1..] {
                assert!(a.id != b.id,
                    "duplicate preset id '{}' (lint: unique ids)", a.id);
            }
        }
        all
    })
}

/// Preset lookup (the registry API contract §2). Unknown id ⇒ the
/// structured `unknown-preset` error.
pub fn preset_by_id(id: &str) -> Result<&'static ResolvedPreset, RulesError> {
    shipped_presets()
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| RulesError::unknown_preset(id))
}

// ---- SHA-256 (FIPS 180-4) ------------------------------------------------------
// The 022 contract makes the crate the ONE hasher (task_hash), and the
// crate stays serde/serde_json-only (the rules-crate API contract §1) — so the
// digest is implemented here, integer ops only (the R11 float lint stays
// trivially clean). Known-answer tests pin it below.

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// SHA-256, lowercase hex (FIPS 180-4).
pub fn sha256_hex(data: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f,
        0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let mut msg = data.to_vec();
    let bit_len = (data.len() as u64) * 8;
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for block in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, word) in block.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes(word.try_into().unwrap());
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7)
                ^ w[i - 15].rotate_right(18)
                ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17)
                ^ w[i - 2].rotate_right(19)
                ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11)
                ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13)
                ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    h.iter().map(|word| format!("{word:08x}")).collect()
}

// ---- tests (T003 gate: `cargo test -p pool-rules --lib task_config`;
// T004 gate: `cargo test -p pool-rules --lib -- preset`) ------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// The pure-defaults canonical envelope, byte-pinned (contract §1–§2:
    /// declaration order, defaults not elided, compact, no floats).
    const DEFAULT_ENVELOPE: &str = concat!(
        "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
        "\"family\":\"eightball\",\"config\":{",
        "\"call_shot\":\"full\",\"safety_call\":true,",
        "\"safety_pot_stays_down\":true,",
        "\"open_table_assignment\":\"called_pot\",",
        "\"eight_on_break\":\"option_tree\",",
        "\"scratch_on_eight\":\"foul\",",
        "\"jumped_ball\":\"foul_stay_down\",",
        "\"dry_break_rail_minimum\":4,",
        "\"dry_break_consequence\":\"option_tree\",",
        "\"break_scratch_bih\":\"kitchen\",",
        "\"kitchen_rule\":\"wpa\"}}"
    );

    /// A minimal spelling of the pure-defaults point (empty config).
    const MINIMAL: &str = concat!(
        "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
        "\"family\":\"eightball\",\"config\":{}}"
    );

    #[test]
    fn task_config_canonical_bytes_pinned_for_pure_defaults() {
        assert_eq!(canonical_task_config_json(MINIMAL).unwrap(),
            DEFAULT_ENVELOPE);
        // full spelling canonicalizes to the same bytes
        assert_eq!(canonical_task_config_json(DEFAULT_ENVELOPE).unwrap(),
            DEFAULT_ENVELOPE);
        // key order in the INPUT is irrelevant; canonical bytes are fixed
        let shuffled = concat!(
            "{\"config\":{\"safety_call\":true,\"call_shot\":\"full\"},",
            "\"family\":\"eightball\",\"kind\":\"rules-variant\",",
            "\"schema\":\"task-config-v1\"}"
        );
        assert_eq!(canonical_task_config_json(shuffled).unwrap(),
            DEFAULT_ENVELOPE);
    }

    #[test]
    fn task_config_canonical_is_idempotent() {
        for input in [MINIMAL, DEFAULT_ENVELOPE] {
            let once = canonical_task_config_json(input).unwrap();
            let twice = canonical_task_config_json(&once).unwrap();
            assert_eq!(once, twice, "canonical(canonical(x)) == canonical(x)");
        }
        let apa = preset_by_id("apa-8ball").unwrap();
        let once = apa.canonical_envelope.clone();
        assert_eq!(canonical_task_config_json(&once).unwrap(), once);
    }

    #[test]
    fn task_config_hash_separates_wpa_from_apa() {
        let wpa = preset_by_id("wpa-8ball").unwrap();
        let apa = preset_by_id("apa-8ball").unwrap();
        assert_eq!(wpa.task_hash.len(), 64);
        assert_eq!(apa.task_hash.len(), 64);
        assert!(wpa.task_hash.chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_ne!(wpa.task_hash, apa.task_hash,
            "distinct config points must hash apart (TASK-OOS)");
        // the pinned identity pair (SC-007 cross-surface reference; the
        // catalog rows cross-check these in tests/variants_registry.rs)
        assert_eq!(wpa.task_hash, task_hash(MINIMAL).unwrap());
        assert_eq!(wpa.task_hash, sha256_hex(DEFAULT_ENVELOPE.as_bytes()));
    }

    #[test]
    fn task_config_strict_parse_rejects() {
        let cases: &[(&str, &str)] = &[
            // unknown envelope field
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{},\"extra\":1}"), "unknown envelope field"),
            // wrong schema literal
            (concat!("{\"schema\":\"task-config-v2\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{}}"), "unknown schema"),
            // reserved-but-uncompiled kind
            (concat!("{\"schema\":\"task-config-v1\",\"kind\":\"drill\",",
                "\"family\":\"eightball\",\"config\":{}}"), "unknown kind"),
            // reserved-but-uncompiled family
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"nineball\",",
                "\"config\":{}}"), "unknown family"),
            // unknown config field
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{\"golden_break\":true}}"), "config"),
            // unknown enum value
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{\"call_shot\":\"strict\"}}"), "config"),
            // out-of-domain int
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{\"dry_break_rail_minimum\":16}}"),
             "out of domain"),
            // floats are not a legal value domain
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{\"dry_break_rail_minimum\":4.0}}"), "config"),
            // null inside config
            (concat!("{\"schema\":\"task-config-v1\",",
                "\"kind\":\"rules-variant\",\"family\":\"eightball\",",
                "\"config\":{\"safety_call\":null}}"), "config"),
            // missing envelope members
            ("{\"config\":{}}", "missing"),
            ("[]", "object"),
            ("not json", "malformed"),
        ];
        for (input, needle) in cases {
            let err = canonical_task_config_json(input).unwrap_err();
            assert_eq!(err.code(), "invalid-task-config", "{input}");
            assert!(err.message().contains(needle),
                "message {:?} lacks {needle:?}", err.message());
            // hash fails identically (same parse)
            assert_eq!(task_hash(input).unwrap_err().code(),
                "invalid-task-config");
        }
    }

    #[test]
    fn sha256_known_answers() {
        assert_eq!(sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    // ---- preset lint (T004) --------------------------------------------------

    #[test]
    fn preset_files_pass_the_lint_gate() {
        // parse + cite + source-header lint runs inside resolution;
        // feature 025 grew the table 2 → 3 (fourteenone); GH-383 grows it
        // 3 → 6 (the carom3c family); GH-382 grows it 6 → 8 (the snooker
        // family: the FR-005 default alias row + the completion preset)
        let all = shipped_presets();
        assert_eq!(all.len(), 8);
        let ids: Vec<&str> = all.iter().map(|p| p.id).collect();
        assert_eq!(ids, ["wpa-8ball", "apa-8ball", "wpa-14-1",
            "umb-carom", "umb-carom-2cue", "umb-carom-2cue-ei",
            "wpbsa-snooker", "wpbsa-snooker-full"]);
        for p in all {
            assert_eq!(p.family, p.config.family());
            assert!(p.display_key.starts_with("settings.variant."));
            assert!(!p.source_title.is_empty());
            assert!(!p.source_edition.is_empty());
            assert!(!p.source_url.is_empty());
            assert!(p.tier == "primary" || p.tier == "secondary");
            assert_eq!(p.task_hash,
                sha256_hex(p.canonical_envelope.as_bytes()));
        }
    }

    #[test]
    fn preset_wpa_resolves_byte_identical_to_pure_defaults() {
        let wpa = preset_by_id("wpa-8ball").unwrap();
        assert_eq!(wpa.config,
            TaskConfig::Eightball(EightBallVariantConfig::default()));
        assert_eq!(wpa.canonical_envelope, DEFAULT_ENVELOPE);
        assert_eq!(wpa.tier, "primary");
        assert_eq!(wpa.aliases, Some("eightball-v1"),
            "FR-005: the default preset routes through the frozen v1 id");
    }

    #[test]
    fn preset_apa_resolves_the_r5_delta_table() {
        let apa = preset_by_id("apa-8ball").unwrap();
        assert_eq!(apa.tier, "secondary");
        assert_eq!(apa.aliases, None);
        let c = apa.config.as_eightball().unwrap();
        assert_eq!(c.call_shot, CallShot::EightOnly);
        assert!(!c.safety_call);
        assert!(!c.safety_pot_stays_down);
        assert_eq!(c.open_table_assignment,
            OpenTableAssignment::TakeWhatYouMake);
        assert_eq!(c.eight_on_break, EightOnBreak::WinUnlessScratch);
        assert_eq!(c.scratch_on_eight, ScratchOnEight::Loss);
        assert_eq!(c.jumped_ball, JumpedBall::SpotNoFoul);
        assert_eq!(c.dry_break_rail_minimum, 0,
            "spec-frozen R5 row 6 (harvest finding HF-1 recorded)");
        assert_eq!(c.dry_break_consequence, DryBreakConsequence::ReBreak);
        assert_eq!(c.break_scratch_bih, BreakScratchBih::Kitchen,
            "row 8: NO delta — BCAPL is the cataloged 'anywhere' consumer");
    }

    // ---- fourteenone family (feature 025, issue #65) -----------------------

    /// The pure-defaults fourteenone envelope, byte-pinned (canonical
    /// order, defaults not elided, compact).
    const DEFAULT_141_ENVELOPE: &str = concat!(
        "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
        "\"family\":\"fourteenone\",\"config\":{\"target\":100}}"
    );

    #[test]
    fn fourteenone_canonical_bytes_and_domain() {
        // an empty config spells the default target 100
        let minimal = concat!(
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
            "\"family\":\"fourteenone\",\"config\":{}}"
        );
        assert_eq!(canonical_task_config_json(minimal).unwrap(),
            DEFAULT_141_ENVELOPE);
        assert_eq!(canonical_task_config_json(DEFAULT_141_ENVELOPE).unwrap(),
            DEFAULT_141_ENVELOPE);
        // the sanctioned domain points canonicalize + hash apart
        let mut hashes = Vec::new();
        for target in [75, 100, 125] {
            let env = format!(
                "{{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
                 \"family\":\"fourteenone\",\"config\":{{\"target\":{target}}}}}"
            );
            assert_eq!(canonical_task_config_json(&env).unwrap(), env);
            hashes.push(task_hash(&env).unwrap());
        }
        hashes.sort();
        hashes.dedup();
        assert_eq!(hashes.len(), 3, "distinct targets hash apart");
        // out-of-domain and unknown-field rejects (STRICT parse)
        for bad in [
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"fourteenone\",\"config\":{\"target\":50}}",
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"fourteenone\",\"config\":{\"target\":100.0}}",
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"fourteenone\",\"config\":{\"race_to\":100}}",
        ] {
            let err = canonical_task_config_json(bad).unwrap_err();
            assert_eq!(err.code(), "invalid-task-config", "{bad}");
        }
    }

    // ---- carom3c family (GH-383) --------------------------------------------

    /// The pure-defaults carom3c envelope, byte-pinned (canonical order =
    /// declaration order, defaults not elided, compact).
    const DEFAULT_CAROM_ENVELOPE: &str = concat!(
        "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
        "\"family\":\"carom3c\",\"config\":{\"target\":15,",
        "\"two_cue_balls\":false,\"insufficient_cushions_foul\":false,",
        "\"equal_innings\":false}}"
    );

    #[test]
    fn carom_canonical_bytes_and_domain() {
        // an empty config spells the frozen v1 behavior point
        let minimal = concat!(
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
            "\"family\":\"carom3c\",\"config\":{}}"
        );
        assert_eq!(canonical_task_config_json(minimal).unwrap(),
            DEFAULT_CAROM_ENVELOPE);
        assert_eq!(
            canonical_task_config_json(DEFAULT_CAROM_ENVELOPE).unwrap(),
            DEFAULT_CAROM_ENVELOPE);
        // distinct config points hash apart
        let two_cue = concat!(
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
            "\"family\":\"carom3c\",\"config\":{\"two_cue_balls\":true,",
            "\"insufficient_cushions_foul\":true}}"
        );
        assert_ne!(task_hash(minimal).unwrap(), task_hash(two_cue).unwrap());
        // out-of-domain / unknown-field / float rejects (STRICT parse)
        for bad in [
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"carom3c\",\"config\":{\"target\":0}}",
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"carom3c\",\"config\":{\"target\":101}}",
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"carom3c\",\"config\":{\"target\":15.0}}",
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"carom3c\",\"config\":{\"yellow_ball\":true}}",
            "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
             \"family\":\"carom3c\",\"config\":{\"two_cue_balls\":null}}",
        ] {
            let err = canonical_task_config_json(bad).unwrap_err();
            assert_eq!(err.code(), "invalid-task-config", "{bad}");
        }
    }

    #[test]
    fn preset_umb_carom_resolves_the_frozen_v1_point() {
        let p = preset_by_id("umb-carom").unwrap();
        assert_eq!(p.family, "carom3c");
        assert_eq!(p.tier, "primary");
        assert_eq!(p.aliases, Some("carom3c-v1"),
            "FR-005: the default preset routes through the frozen v1 id");
        assert_eq!(p.config,
            TaskConfig::Carom3c(CaromVariantConfig::default()));
        assert_eq!(p.canonical_envelope, DEFAULT_CAROM_ENVELOPE);
        assert_eq!(p.task_hash,
            sha256_hex(DEFAULT_CAROM_ENVELOPE.as_bytes()));
    }

    #[test]
    fn preset_umb_carom_2cue_variants_resolve_the_gh383_deltas() {
        let p = preset_by_id("umb-carom-2cue").unwrap();
        assert_eq!(p.aliases, None);
        let c = p.config.as_carom3c().unwrap();
        assert_eq!(c.target, 15);
        assert!(c.two_cue_balls, "Art 22.1/23.2/23.4");
        assert!(c.insufficient_cushions_foul, "Art 83 letter");
        assert!(!c.equal_innings, "Art 29.3 default regime (owner: OFF)");

        let ei = preset_by_id("umb-carom-2cue-ei").unwrap();
        assert_eq!(ei.aliases, None);
        let c = ei.config.as_carom3c().unwrap();
        assert!(c.two_cue_balls && c.insufficient_cushions_foul);
        assert!(c.equal_innings, "Art 29.4 equal-innings regime");
        assert_ne!(p.task_hash, ei.task_hash);
    }

    #[test]
    fn preset_wpa_14_1_resolves_the_default_target() {
        let p = preset_by_id("wpa-14-1").unwrap();
        assert_eq!(p.family, "fourteenone");
        assert_eq!(p.tier, "primary");
        assert_eq!(p.aliases, Some("fourteenone-v1"),
            "the default preset routes through the registry id");
        assert_eq!(p.config,
            TaskConfig::FourteenOne(FourteenOneVariantConfig::default()));
        assert_eq!(p.canonical_envelope, DEFAULT_141_ENVELOPE);
        assert_eq!(p.task_hash,
            sha256_hex(DEFAULT_141_ENVELOPE.as_bytes()));
    }

    /// SC-003 negative evidence: the RECORDED fixture with one missing
    /// cite fails the lint LOUDLY (tests/fixtures/preset-missing-cite.json
    /// is committed as the negative half of the citation gate).
    #[test]
    fn preset_lint_negative_fixture_fails_loudly() {
        let fixture = include_str!(
            "../tests/fixtures/preset-missing-cite.json");
        let err = lint_and_resolve(fixture)
            .expect_err("a cite-less judged entry MUST fail the lint");
        assert!(err.contains("EMPTY cite"), "lint error: {err}");
        assert!(err.contains("scratch_on_eight"), "lint error: {err}");
    }

    #[test]
    fn preset_unknown_id_is_the_structured_error() {
        let err = preset_by_id("tap-8ball").unwrap_err();
        assert_eq!(err.code(), "unknown-preset");
        assert_eq!(err.message(), "unknown preset 'tap-8ball'");
        assert_eq!(err.to_json(),
            "{\"error\":{\"code\":\"unknown-preset\",\
             \"message\":\"unknown preset 'tap-8ball'\"}}");
    }

    /// FR-012: the `adapter` section provably never reaches the config
    /// bytes or the hash — stripping it (or rewriting its values) leaves
    /// the resolved identity byte-identical.
    #[test]
    fn preset_adapter_section_never_reaches_config_bytes_or_hash() {
        let apa = preset_by_id("apa-8ball").unwrap();
        let mut v: Value = serde_json::from_str(APA_8BALL_JSON).unwrap();
        assert!(!v["adapter"].as_object().unwrap().is_empty(),
            "the fixture must actually carry adapter keys");
        // rewrite the adapter section wholesale
        v["adapter"] = serde_json::json!({
            "rack_pattern": {"value": "stripe_solid_corners",
                "cite": "test", "owner": "adapter"},
            "break_order": {"value": "winner_breaks",
                "cite": "test", "owner": "adapter"}
        });
        let rewritten = lint_and_resolve(&v.to_string()).unwrap();
        assert_eq!(rewritten.canonical_envelope, apa.canonical_envelope);
        assert_eq!(rewritten.task_hash, apa.task_hash);
        // and strip it entirely
        v.as_object_mut().unwrap().remove("adapter");
        v.as_object_mut().unwrap().remove("not_modeled");
        let stripped = lint_and_resolve(&v.to_string()).unwrap();
        assert_eq!(stripped.canonical_envelope, apa.canonical_envelope);
        assert_eq!(stripped.task_hash, apa.task_hash);
    }
}
