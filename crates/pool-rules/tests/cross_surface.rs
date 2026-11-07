// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Feature 022, lane L-TDL (task T021): SC-007 cross-surface
//! task-hash identity — the TDL-bridge proof that the WPA and APA preset
//! configs hashed from Rust, Python, and the COMMITTED wasm artifact
//! produce identical bytes per preset and distinct hex between presets
//! (the feature data-model §10; the registry API contract §2 binding rule:
//! wrappers pass bytes through verbatim — no surface re-serializes, no
//! surface re-hashes, so any byte difference here is a defect, never a
//! formatting nit).
//!
//! Legs:
//! - **Rust**: `pool_rules::{canonical_task_config_json, task_hash}`
//!   in-process — the ONE serializer/hasher (FR-001).
//! - **wasm**: `node` + `web/dist/pool-sdk/rules/backend.js` loading the
//!   COMMITTED `web/dist/pool-rules` artifact (P-III doctrine: never a
//!   local rebuild). node is mandatory repo tooling (conformance,
//!   freshness, e2e all require it), so an unavailable node FAILS the
//!   leg rather than skipping it.
//! - **py**: `pool_py` via `$POOL_PY_PYTHON` (the rules-conformance.sh
//!   convention) or a probed `python3`. A machine without a pool_py
//!   build skips the leg LOUDLY; the leg is still exercised at battery
//!   scale by scripts/rules-conformance.sh, whose py leg judges variant
//!   slice cases whose bytes embed `variant.task_hash`.
//!
//! Inputs are the crate-resolved canonical envelopes (`ResolvedPreset::
//! canonical_envelope`) fed to every surface as the SAME bytes; the T003
//! idempotence pin (`canonical(canonical(x)) == canonical(x)`) makes the
//! round-trip byte-exact by construction, so `cmp`-strength equality is
//! the correct oracle.

use std::path::PathBuf;
use std::process::Command;

/// The two shipped task points (the feature data-model §2/§3).
const PRESET_IDS: [&str; 2] = ["wpa-8ball", "apa-8ball"];

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root resolves")
}

/// The Rust leg for one preset: resolved envelope bytes, canonical
/// re-emission, and hash — cross-pinned against the preset's registered
/// identity (`ResolvedPreset::task_hash`, the lint-gate pin).
fn rust_leg(preset_id: &str) -> (String, String, String) {
    let preset = pool_rules::task_config::preset_by_id(preset_id)
        .expect("shipped preset resolves");
    let envelope = preset.canonical_envelope.clone();
    let canonical = pool_rules::canonical_task_config_json(&envelope)
        .expect("canonical envelope re-canonicalizes");
    let hash = pool_rules::task_hash(&envelope).expect("envelope hashes");
    assert_eq!(canonical, envelope,
        "{preset_id}: canonical idempotence broke (T003 pin)");
    assert_eq!(hash, preset.task_hash,
        "{preset_id}: task_hash(envelope) != the registered preset pin");
    (envelope, canonical, hash)
}

/// Run one subprocess leg: feed `envelope` via the environment, expect
/// stdout bytes exactly `"<hash>\n<canonical>"`.
fn run_leg(mut cmd: Command, surface: &str, preset_id: &str,
           envelope: &str, want_hash: &str, want_canonical: &str) {
    let out = cmd
        .env("OB_TASK_CONFIG_ENVELOPE", envelope)
        .output()
        .unwrap_or_else(|e| panic!("{surface} leg failed to spawn: {e}"));
    assert!(out.status.success(),
        "{surface} leg exited nonzero for {preset_id}: {}\n{}",
        out.status, String::from_utf8_lossy(&out.stderr));
    let got = String::from_utf8(out.stdout)
        .unwrap_or_else(|e| panic!("{surface} leg wrote non-UTF8: {e}"));
    let want = format!("{want_hash}\n{want_canonical}");
    assert_eq!(got, want,
        "{surface} leg bytes differ from the crate leg for {preset_id} \
         (SC-007 is a byte comparison — a surface re-serialized or \
         re-hashed)");
}

/// Rust leg: pins, idempotence, catalog registration consistency, and
/// the hash-separation kernel of the TASK-OOS law (task points differing
/// only by variant NEVER collide — SC-007, the feature data-model §10).
#[test]
fn cross_surface_rust_leg_pins_and_task_oos_separation() {
    let legs: Vec<(String, String, String)> =
        PRESET_IDS.iter().map(|id| rust_leg(id)).collect();

    for (id, (_, _, hash)) in PRESET_IDS.iter().zip(&legs) {
        assert_eq!(hash.len(), 64, "{id}: task_hash is not 64 hex chars");
        assert!(hash.chars().all(
                |c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
            "{id}: task_hash is not lowercase hex");
    }
    // TASK-OOS kernel: the two task points' hash sets are disjoint.
    assert_ne!(legs[0].2, legs[1].2,
        "wpa-8ball and apa-8ball hashed identically — variant identity \
         collapsed (TASK-OOS exclusion-by-hash would be vacuous)");

    // Registration surface consistency: the catalog rows (the picker /
    // TDL-visible registration surface) carry the same identities.
    let catalog: serde_json::Value =
        serde_json::from_str(&pool_rules::catalog_json())
            .expect("catalog parses");
    let rows = catalog["rulesets"]
        .as_array().expect("rulesets array")
        .iter()
        .find(|e| e["id"] == "eightball-v2")
        .expect("eightball-v2 registered")["presets"]
        .as_array().expect("presets rows").clone();
    for (id, (envelope, _, hash)) in PRESET_IDS.iter().zip(&legs) {
        let row = rows.iter().find(|r| &r["id"] == id)
            .unwrap_or_else(|| panic!("catalog row for {id}"));
        assert_eq!(row["taskHash"].as_str(), Some(hash.as_str()),
            "{id}: catalog taskHash pin != crate hash");
        let envelope_json: serde_json::Value =
            serde_json::from_str(envelope).expect("envelope parses");
        assert_eq!(row["config"], envelope_json["config"],
            "{id}: catalog resolved config != envelope config");
    }
}

/// wasm leg: the COMMITTED artifact returns byte-identical canonical
/// envelope + hash for both presets (never a local rebuild — the same
/// bytes the app, share replay, and TDL registrations ride).
#[test]
fn cross_surface_committed_wasm_leg_byte_identical() {
    let backend = repo_root().join("web/dist/pool-sdk/rules/backend.js");
    assert!(backend.exists(),
        "committed SDK rules backend missing at {}", backend.display());
    const SCRIPT: &str = "\
import { pathToFileURL } from 'node:url';\n\
const { wasm } = await import(\
pathToFileURL(process.env.OB_RULES_BACKEND_JS).href);\n\
const envelope = process.env.OB_TASK_CONFIG_ENVELOPE;\n\
process.stdout.write(wasm.rules_task_hash(envelope) + '\\n' \
+ wasm.rules_canonical_task_config_json(envelope));\n";
    for id in PRESET_IDS {
        let (envelope, canonical, hash) = rust_leg(id);
        let mut cmd = Command::new("node");
        cmd.args(["--input-type=module", "-e", SCRIPT])
            .env("OB_RULES_BACKEND_JS", &backend);
        run_leg(cmd, "committed-wasm", id, &envelope, &hash, &canonical);
    }
}

/// py leg: `pool_py` wrappers return byte-identical canonical envelope +
/// hash for both presets. Skips LOUDLY when no pool_py build is
/// importable (see module docs); `$POOL_PY_PYTHON` forces the leg.
#[test]
fn cross_surface_py_leg_byte_identical() {
    const SCRIPT: &str = "\
import os, sys\n\
import pool_py as pp\n\
envelope = os.environ['OB_TASK_CONFIG_ENVELOPE']\n\
sys.stdout.write(pp.rules_task_hash(envelope) + '\\n' \
+ pp.rules_canonical_task_config_json(envelope))\n";
    let python = match std::env::var("POOL_PY_PYTHON") {
        Ok(p) => p,
        Err(_) => {
            let probe = Command::new("python3")
                .args(["-c", "import pool_py; pool_py.rules_task_hash"])
                .output();
            match probe {
                Ok(out) if out.status.success() => "python3".to_string(),
                _ => {
                    eprintln!(
                        "cross_surface: SKIPPING py leg — no pool_py \
                         with the 022 task-config surface importable \
                         (set POOL_PY_PYTHON; the leg also runs inside \
                         scripts/rules-conformance.sh)");
                    return;
                }
            }
        }
    };
    for id in PRESET_IDS {
        let (envelope, canonical, hash) = rust_leg(id);
        let mut cmd = Command::new(&python);
        cmd.args(["-c", SCRIPT]);
        run_leg(cmd, "pool_py", id, &envelope, &hash, &canonical);
    }
}
