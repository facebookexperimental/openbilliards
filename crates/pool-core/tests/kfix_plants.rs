// Copyright (c) Meta Platforms, Inc. and affiliates.

//! K-fix plants (BRIEF-KFIX-v1): F1 leading-coefficient underflow, F2 certified geometric refinement of
//! cushion times, F3 certified-miss rejection of phantom cushion contacts.
//!
//! Inputs and exact-oracle expectations are produced by `tests/kfix_prepare.py` (exact `Fraction`
//! arithmetic on the binary64 inputs) into `tests/data/kfix/`. Every binary64 value is stored as its
//! 16-hex-digit bit pattern. `base-outputs.json` is today's output, captured from the UNMODIFIED base
//! tree (77c52baf) before any detect change:
//!
//! ```text
//! KFIX_CAPTURE=1 cargo test -p pool-core --release --test kfix_plants -- --ignored capture
//! ```

use pool_core::sim::detect;
use pool_core::table::{ArcSpan, CircularCushionSegment, LinearCushionSegment, Pocket};
use pool_core::{PosPoly, Vec3};
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;

fn data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/kfix")
}

fn load(name: &str) -> Value {
    let path = data_dir().join(name);
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap()
}

fn unhex(s: &str) -> f64 {
    f64::from_bits(u64::from_str_radix(s, 16).unwrap())
}

fn hex(x: f64) -> String {
    format!("{:016x}", x.to_bits())
}

/// One detect call: the adapter name and its binary64 arguments in the Rust call order.
struct Args {
    adapter: String,
    f: Vec<f64>,
    span: Option<ArcSpan>,
}

fn args(v: &Value) -> Args {
    let f = v["f"]
        .as_array()
        .unwrap()
        .iter()
        .map(|h| unhex(h.as_str().unwrap()))
        .collect();
    let span = v["span"].as_array().map(|s| ArcSpan {
        start: unhex(s[0].as_str().unwrap()),
        sweep: unhex(s[1].as_str().unwrap()),
    });
    Args {
        adapter: v["adapter"].as_str().unwrap().to_string(),
        f,
        span,
    }
}

fn poly(f: &[f64]) -> PosPoly {
    PosPoly {
        c0: Vec3::new(f[0], f[1], f[2]),
        c1: Vec3::new(f[3], f[4], f[5]),
        c2: Vec3::new(f[6], f[7], f[8]),
    }
}

fn arc(a: &Args) -> CircularCushionSegment {
    CircularCushionSegment {
        center: Vec3::new(a.f[9], a.f[10], a.f[11]),
        radius: a.f[12],
        height: a.f[13],
        span: a.span,
    }
}

fn seg(a: &Args) -> LinearCushionSegment {
    LinearCushionSegment {
        p1: Vec3::new(a.f[9], a.f[10], a.f[11]),
        p2: Vec3::new(a.f[12], a.f[13], a.f[14]),
        height: a.f[15],
    }
}

/// The detect call exactly as perf's K harness makes it (adapter name = public detect function).
fn run(a: &Args) -> Option<f64> {
    let f = &a.f;
    let p = poly(&f[0..9]);
    match a.adapter.as_str() {
        "ball_ball_time" => detect::ball_ball_time(&p, &poly(&f[9..18]), f[18], f[19], f[20]),
        "ball_pocket_time" => {
            let pocket = Pocket {
                center: Vec3::new(f[9], f[10], f[11]),
                radius: f[12],
            };
            detect::ball_pocket_time(&p, &pocket, f[13])
        }
        "ball_circular_cushion_time" => {
            detect::ball_circular_cushion_time(&p, &arc(a), f[14], f[15], f[16])
        }
        "ball_circular_cushion_time_airborne" => {
            detect::ball_circular_cushion_time_airborne(&p, &arc(a), f[14], f[15], f[16])
        }
        "ball_linear_cushion_time" => {
            detect::ball_linear_cushion_time(&p, &seg(a), f[16], f[17], f[18])
        }
        "ball_linear_cushion_time_airborne" => {
            detect::ball_linear_cushion_time_airborne(&p, &seg(a), f[16], f[17])
        }
        other => panic!("unknown adapter {other}"),
    }
}

fn out_value(t: Option<f64>) -> Value {
    t.map_or(Value::Null, |t| Value::String(hex(t)))
}

/// Every plant input, keyed `<set>:<id>` (the F1 1e-150 variants as `f1:<id>/e150`).
fn all_rows() -> Vec<(String, Args)> {
    let mut rows = Vec::new();
    for (set, file) in [
        ("f1", "inputs-f1.json"),
        ("f1c", "inputs-f1c.json"),
        ("f2", "inputs-f2.json"),
        ("f3", "inputs-f3.json"),
        ("f3b", "inputs-f3b.json"),
        ("cov", "inputs-cov.json"),
        ("k2", "inputs-k2.json"),
    ] {
        for row in load(file).as_array().unwrap() {
            let id = row["id"].as_str().unwrap();
            rows.push((format!("{set}:{id}"), args(&row["args"])));
            if set == "f1" {
                rows.push((format!("{set}:{id}/e150"), args(&row["args150"])));
            }
        }
    }
    rows
}

fn base() -> Map<String, Value> {
    load("base-outputs.json").as_object().unwrap().clone()
}

#[test]
#[ignore = "writes base-outputs.json; run only on the unmodified base tree"]
fn capture() {
    assert_eq!(
        std::env::var("KFIX_CAPTURE").as_deref(),
        Ok("1"),
        "set KFIX_CAPTURE=1 to overwrite the captured base outputs"
    );
    let mut out = Map::new();
    for (key, a) in all_rows() {
        out.insert(key, out_value(run(&a)));
    }
    let text = serde_json::to_string_pretty(&Value::Object(out)).unwrap() + "\n";
    fs::write(data_dir().join("base-outputs.json"), text).unwrap();
}

/// The harness reproduces K's NEW values bit for bit (same kernel source as perf's NEW build).
#[test]
fn kfix_harness_matches_k_new() {
    let base = base();
    let mut checked = 0;
    for (set, file) in [
        ("f1", "inputs-f1.json"),
        ("f2", "inputs-f2.json"),
        ("f3", "inputs-f3.json"),
    ] {
        for row in load(file).as_array().unwrap() {
            let Some(new_k) = row["new_k"].as_str() else {
                continue;
            };
            let key = format!("{set}:{}", row["id"].as_str().unwrap());
            assert_eq!(base[&key].as_str(), Some(new_k), "{key}");
            checked += 1;
        }
    }
    assert_eq!(checked, 229 + 253 + 70);
}

fn rows_of(file: &str) -> Vec<Value> {
    load(file).as_array().unwrap().clone()
}

/// Rows the F1 guard may change: the leading-coefficient underflow inputs
/// (round-2 rows are asserted by their own test).
fn f1_scope(key: &str) -> bool {
    (key.starts_with("f1:") && !key.ends_with("/e150"))
        || key.starts_with("f1c:")
        || key.starts_with("k2:")
}

fn is_cushion(a: &Args) -> bool {
    a.adapter.contains("cushion")
}

fn accept_of(v: &Value) -> Vec<String> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|h| h.as_str().unwrap().to_string())
        .collect()
}

/// Pair and pocket rows outside the F1 class reproduce the captured base bit
/// for bit (cushion rows are covered by the F2/F3 plants).
#[test]
fn kfix_off_scope_bit_identical() {
    let base = base();
    let rows = all_rows();
    assert_eq!(rows.len(), base.len());
    let mut n = 0;
    for (key, a) in rows {
        if f1_scope(&key) || is_cushion(&a) {
            continue;
        }
        assert_eq!(out_value(run(&a)), base[&key], "{key}");
        n += 1;
    }
    println!("off-scope pair/pocket rows bit-identical to the base capture: {n}");
}

/// F1 plants (BRIEF-KFIX-v1): (a) every p1 underflow row (the 86 named rows
/// among them) returns None; (b) its 1e-300 -> 1e-150 variant keeps today's
/// bits; (c) genuine lower-order contacts keep today's bits.
#[test]
fn kfix_f1_plants() {
    let base = base();
    let (mut a_none, mut a86, mut kept, mut b_same) = (0, 0, 0, 0);
    for row in rows_of("inputs-f1.json") {
        let key = format!("f1:{}", row["id"].as_str().unwrap());
        let got = run(&args(&row["args"]));
        if row["p1"].as_bool().unwrap() {
            assert_eq!(got, None, "F1 (a) {key}: today {}", base[&key]);
            a_none += 1;
            a86 += usize::from(row["set"] == "f1a");
        } else {
            // The one underflow-class row outside p1 is a genuine contact
            // inside the horizon (0.282 s): today's bits.
            assert_eq!(out_value(got), base[&key], "F1 (c) real-data row {key}");
            kept += 1;
        }
        let key150 = format!("{key}/e150");
        assert_eq!(
            out_value(run(&args(&row["args150"]))),
            base[&key150],
            "F1 (b) {key150}"
        );
        b_same += 1;
    }
    assert_eq!((a_none, a86, kept, b_same), (229, 86, 1, 230));
    let mut c_same = 0;
    for row in rows_of("inputs-f1c.json") {
        let key = format!("f1c:{}", row["id"].as_str().unwrap());
        let a = args(&row["args"]);
        let got = run(&a);
        match row["kind"].as_str().unwrap() {
            "c" if is_cushion(&a) => {
                // The contact is kept; F2 then refines it onto the exact
                // crossing (or keeps today's value without a certificate).
                let t = got.unwrap_or_else(|| panic!("F1 (c) {key}: contact dropped"));
                let ok =
                    accept_of(&row["accept"]).contains(&hex(t)) || out_value(got) == base[&key];
                assert!(ok, "F1 (c) {key}: {t:e}");
                c_same += 1;
            }
            "c" | "far-spurious" => {
                assert_eq!(out_value(got), base[&key], "F1 (c) {key}");
                c_same += 1;
            }
            kind => {
                // Far roots of the exact quartic (A parallel to B) are reported,
                // not asserted: near t* ~ |B|/|A| the expanded quartic's
                // leading terms form a near-perfect square, so any binary64
                // coefficient vector moves or splits the root pair by about
                // sqrt(u) relative (see REPORT-KFIX-v1).
                let exact: f64 = row["far_root"][0].as_str().unwrap().parse().unwrap();
                let rel = got.map(|t| (t - exact).abs() / exact);
                println!(
                    "F1 {kind} {key}: today {} -> {got:?} (exact {exact:e}, rel {rel:?})",
                    base[&key]
                );
            }
        }
    }
    assert_eq!(c_same, 9);
    println!(
        "F1 plants: (a) {a_none} None ({a86} of the 86); (b) {b_same} bit-identical; (c) {} kept",
        c_same + kept
    );
}

/// F2 plants: the 253 registered residual rows return a float within one ulp
/// of the exact descending crossing (exact oracle; |g| ≤ 64u·M_pos there with
/// margin ≥ 65.9). Coverage rows refine onto an exact crossing or keep today's
/// value; None and Some(t_min) results are untouched.
#[test]
fn kfix_f2_plants() {
    let mut moved = 0;
    let rows = rows_of("inputs-f2.json");
    for row in &rows {
        let key = format!("f2:{}", row["id"].as_str().unwrap());
        let t = run(&args(&row["args"])).unwrap_or_else(|| panic!("{key}: contact lost"));
        let accept = accept_of(&row["accept"]);
        assert!(
            accept.contains(&hex(t)),
            "F2 {key}: {t:e} not within one ulp of the exact crossing {accept:?}"
        );
        moved += usize::from(Some(hex(t).as_str()) != row["new_k"].as_str());
    }
    assert_eq!(rows.len(), 253);
    let base = base();
    let expect = load("expect-cov.json");
    let (mut on_root, mut kept, mut untouched, mut kept_no_root, mut rejected) = (0, 0, 0, 0, 0);
    for row in rows_of("inputs-cov.json") {
        let id = row["id"].as_str().unwrap();
        let key = format!("cov:{id}");
        let got = out_value(run(&args(&row["args"])));
        match expect.get(id) {
            None => {
                assert_eq!(got, base[&key], "{key}: None/t_min path changed");
                untouched += 1;
            }
            Some(Value::Null) => {
                // No exact crossing near today's root: F3 may reject it.
                if got == base[&key] {
                    kept_no_root += 1;
                } else {
                    assert!(got.is_null(), "{key}: a null-oracle row returned {got}, not None");
                    rejected += 1;
                }
            }
            Some(e) => {
                if got == base[&key] {
                    kept += 1;
                } else {
                    let t = got
                        .as_str()
                        .unwrap_or_else(|| panic!("{key}: contact lost"));
                    assert!(
                        accept_of(&e["accept"]).iter().any(|a| a == t),
                        "{key}: {t} not on the exact crossing"
                    );
                    on_root += 1;
                }
            }
        }
    }
    println!(
        "F2 plants: 253/253 within one ulp ({moved} moved); coverage: {on_root} refined onto the exact crossing, \
         {kept} kept, {kept_no_root} kept and {rejected} rejected (F3) without a nearby exact crossing, \
         {untouched} None/t_min untouched"
    );
}

/// F3 plants: (a) the 3 regression and 67 inherited phantom contacts (exact
/// tangent misses) return None; (b) the 210 genuine shallow contacts at the
/// same geometries (exact minimum gap shifted to about −1e-18, −1e-15 and
/// −1e-12 m) keep a contact: on an exact crossing near today's root or at
/// today's value. Today's None would be a pre-existing case (reported).
#[test]
fn kfix_f3_plants() {
    let base = base();
    let mut none = 0;
    for row in rows_of("inputs-f3.json") {
        let key = format!("f3:{}", row["id"].as_str().unwrap());
        assert_eq!(
            run(&args(&row["args"])),
            None,
            "F3 (a) {key}: today {}",
            base[&key]
        );
        none += 1;
    }
    assert_eq!(none, 70);
    let expect = load("expect-f3b.json");
    let (mut on_root, mut kept, mut pre_none) = (0, 0, 0);
    for row in rows_of("inputs-f3b.json") {
        let id = row["id"].as_str().unwrap();
        let key = format!("f3b:{id}");
        let got = out_value(run(&args(&row["args"])));
        if base[&key].is_null() {
            pre_none += 1;
            println!("F3 (b) pre-existing None: {key}");
        } else if got == base[&key] {
            kept += 1;
        } else {
            let t = got
                .as_str()
                .unwrap_or_else(|| panic!("F3 (b) {key}: genuine contact dropped"));
            assert!(
                accept_of(&expect[id]["accept"]).iter().any(|a| a == t),
                "F3 (b) {key}: {t}"
            );
            on_root += 1;
        }
    }
    assert_eq!(on_root + kept + pre_none, 210);
    println!(
        "F3 plants: (a) {none}/70 None; (b) {} of 210 keep their contact ({on_root} refined onto an exact crossing, \
         {kept} at today's value), {pre_none} pre-existing None",
        on_root + kept
    );
}

/// Round-2 plants (review pre-check on b3f06148): (1) a refined time that
/// fails the caller's validator (airborne jaw height, linear segment span,
/// arc angle span) keeps the represented root t0 = today's bits; (2) a
/// certifiable far F1 contact (well-conditioned entry/exit pair narrower than
/// 2^-6 of its time) keeps a contact: today's value (it lies in the certified
/// bracket) or one within one ulp of the exact entry.
#[test]
fn kfix_round2_plants() {
    let base = base();
    let (mut validator, mut far) = (0, 0);
    for row in rows_of("inputs-k2.json") {
        let id = row["id"].as_str().unwrap();
        let key = format!("k2:{id}");
        let got = run(&args(&row["args"]));
        match row["kind"].as_str().unwrap() {
            "validator" => {
                assert!(base[&key].is_string(), "{key}: today must return a contact");
                assert_eq!(
                    out_value(got),
                    base[&key],
                    "{key}: the represented root must stay"
                );
                validator += 1;
            }
            _ => {
                let t = got.unwrap_or_else(|| panic!("{key}: certifiable far contact dropped"));
                let ok = accept_of(&row["accept"]).contains(&hex(t))
                    || base[&key].as_str() == Some(hex(t).as_str());
                println!(
                    "round-2 {key}: today {} -> {t:e} (exact entry {}, within one ulp: {})",
                    base[&key],
                    row["exact"],
                    accept_of(&row["accept"]).contains(&hex(t))
                );
                assert!(
                    ok,
                    "{key}: {t:e} neither today's value nor within one ulp of the exact entry"
                );
                far += 1;
            }
        }
    }
    assert_eq!((validator, far), (4, 27));
    // p1 rows with dc2 x dc1 == 0 in binary64 (6 exactly parallel, 35827 with an exact cross of -1e-600): the
    // exact quartic has no root (Sturm), so the certificate can never pass and they stay None.
    let mut parallel = Vec::new();
    for row in rows_of("inputs-f1.json") {
        if !row["p1"].as_bool().unwrap() {
            continue;
        }
        let a = args(&row["args"]);
        let f = &a.f;
        let par = if a.adapter == "ball_ball_time" {
            let (ax, ay, az) = (f[6] - f[15], f[7] - f[16], f[8] - f[17]);
            let (bx, by, bz) = (f[3] - f[12], f[4] - f[13], f[5] - f[14]);
            ay * bz - az * by == 0.0 && az * bx - ax * bz == 0.0 && ax * by - ay * bx == 0.0
        } else {
            f[6] * f[4] - f[7] * f[3] == 0.0
        };
        if par {
            assert_eq!(run(&a), None);
            parallel.push(row["id"].as_str().unwrap().to_string());
        }
    }
    println!("round-2 plants: {validator} validator rows keep t0; {far} far contacts kept; p1 rows with dc2 x dc1 == 0 (None): {parallel:?}");
}
