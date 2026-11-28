// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Hand-rolled `--key value` argument parsing (no clap; frozen dependency
//! policy — pool-cli stays serde_json-only).

/// Parse `--key value` pairs, treating any key in `flags` as a boolean
/// switch (present ⇒ `"true"`, no value consumed).
pub fn parse_kv_flags(args: &[String], flags: &[&str]) -> Result<Vec<(String, String)>, String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let key = &args[i];
        if !key.starts_with("--") {
            return Err(format!("unexpected argument: {key}"));
        }
        let name = &key[2..];
        if flags.contains(&name) {
            out.push((name.to_string(), "true".to_string()));
            i += 1;
            continue;
        }
        let val = args
            .get(i + 1)
            .ok_or_else(|| format!("missing value for {key}"))?;
        out.push((name.to_string(), val.clone()));
        i += 2;
    }
    Ok(out)
}

/// Parse `--key value` pairs by hand (no boolean flags).
pub fn parse_kv(args: &[String]) -> Result<Vec<(String, String)>, String> {
    parse_kv_flags(args, &[])
}

pub fn get<'a>(kv: &'a [(String, String)], key: &str) -> Option<&'a str> {
    kv.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

/// Parse an f64 option with a labeled error.
pub fn get_f64(kv: &[(String, String)], key: &str, default: f64) -> Result<f64, String> {
    get(kv, key).map_or(Ok(default), |s| {
        s.parse().map_err(|e| format!("--{key}: {e}"))
    })
}

/// `true` when the raw argument list contains `--help` (checked before
/// `parse_kv`, so `pool-cli <sub> --help` never trips a parse error).
pub fn wants_help(args: &[String]) -> bool {
    args.iter().any(|a| a == "--help" || a == "-h")
}

/// Parse a `A..B` (half-open) or `A..=B` (inclusive) seed range.
pub fn parse_seed_range(s: &str) -> Result<std::ops::Range<u64>, String> {
    let (a, b, incl) = if let Some((a, b)) = s.split_once("..=") {
        (a, b, true)
    } else if let Some((a, b)) = s.split_once("..") {
        (a, b, false)
    } else {
        return Err(format!("--seeds: expected A..B or A..=B, got {s:?}"));
    };
    let lo: u64 = a.parse().map_err(|e| format!("--seeds start: {e}"))?;
    let hi: u64 = b.parse().map_err(|e| format!("--seeds end: {e}"))?;
    let hi = if incl { hi + 1 } else { hi };
    if hi <= lo {
        return Err(format!("--seeds: empty range {s:?}"));
    }
    Ok(lo..hi)
}
