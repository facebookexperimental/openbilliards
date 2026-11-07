// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli task-hash` — the native leg of the feature 022 task-config
//! identity surface (the registry API contract §2): parse a
//! `task-config-v1` envelope through the pool-rules crate and print the
//! `task_hash` (SHA-256 lowercase hex over the canonical envelope bytes)
//! or, with `--canonical`, the canonical envelope bytes themselves. Both
//! outputs are crate bytes VERBATIM — this module never re-serializes
//! and never re-hashes (SC-007 is a byte comparison across the cli, py,
//! and committed-wasm surfaces). Errors ship the crate's structured
//! `{"error":{"code","message"}}` payload bytes with exit code 1.

use std::process::ExitCode;

use crate::cliargs;

const USAGE: &str = "\
pool-cli task-hash — task-config identity via the pool-rules crate (022)

usage:
  pool-cli task-hash --config <envelope.json> [--canonical] [--out <file>]

Reads a task-config-v1 envelope and writes the task_hash (SHA-256
lowercase hex over the canonical envelope bytes) to stdout or --out,
newline-terminated. --canonical writes the canonical envelope bytes
instead of the hash. Invalid envelopes write the canonical
{\"error\":{\"code\":\"invalid-task-config\",…}} payload and exit 1.";

/// The pure core: `(bytes, ok)` — hash hex or canonical envelope bytes on
/// success, the structured error payload on failure.
fn task_hash_bytes(envelope: &str, canonical: bool) -> (String, bool) {
    let out = if canonical {
        pool_rules::canonical_task_config_json(envelope)
    } else {
        pool_rules::task_hash(envelope)
    };
    match out {
        Ok(bytes) => (bytes, true),
        Err(e) => (e.to_json(), false),
    }
}

pub fn cmd_task_hash(args: &[String]) -> ExitCode {
    if cliargs::wants_help(args) {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    }
    match inner(args) {
        Ok(code) => code,
        Err(msg) => {
            eprintln!("error: {msg}");
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

fn inner(args: &[String]) -> Result<ExitCode, String> {
    let kv = cliargs::parse_kv_flags(args, &["canonical"])?;
    let config_path = cliargs::get(&kv, "config")
        .ok_or("--config is required")?;
    let envelope = std::fs::read_to_string(config_path)
        .map_err(|e| format!("--config {config_path}: {e}"))?;
    let (bytes, ok) =
        task_hash_bytes(&envelope, cliargs::get(&kv, "canonical").is_some());
    let line = format!("{bytes}\n");
    match cliargs::get(&kv, "out") {
        Some(path) => std::fs::write(path, &line)
            .map_err(|e| format!("--out {path}: {e}"))?,
        None => print!("{line}"),
    }
    Ok(if ok { ExitCode::SUCCESS } else { ExitCode::FAILURE })
}

#[cfg(test)]
mod tests {
    use super::task_hash_bytes;

    const MINIMAL: &str = concat!(
        "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
        "\"family\":\"eightball\",\"config\":{}}"
    );

    #[test]
    fn hash_and_canonical_are_crate_bytes_verbatim() {
        let (hash, ok) = task_hash_bytes(MINIMAL, false);
        assert!(ok);
        assert_eq!(hash, pool_rules::task_hash(MINIMAL).unwrap());
        assert_eq!(hash.len(), 64);
        let (canonical, ok) = task_hash_bytes(MINIMAL, true);
        assert!(ok);
        assert_eq!(canonical,
            pool_rules::canonical_task_config_json(MINIMAL).unwrap());
    }

    #[test]
    fn invalid_envelope_ships_the_structured_payload() {
        let (bytes, ok) = task_hash_bytes("{}", false);
        assert!(!ok);
        assert!(bytes.starts_with(
            "{\"error\":{\"code\":\"invalid-task-config\""), "{bytes}");
    }
}
