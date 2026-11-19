// Copyright (c) Meta Platforms, Inc. and affiliates.

use kroots::{earliest_root_in, real_roots_in, WindowRoots};
use serde_json::Value;
mod support;

#[cfg(feature = "decision-trace")]
thread_local! {static COUNTS:std::cell::RefCell<std::collections::BTreeMap<String,usize>>=const {std::cell::RefCell::new(std::collections::BTreeMap::new())};}
#[cfg(feature = "decision-trace")]
fn account(kind: &str) {
    let records = kroots::decision_trace::take();
    let refinements = records
        .iter()
        .filter(|s| s.starts_with("roots.refine."))
        .count();
    COUNTS.with(|c| {
        let mut c = c.borrow_mut();
        for id in records {
            *c.entry(format!("{kind}/{id}")).or_default() += 1;
        }
        let maximum = c
            .entry(format!("{kind}/maximum_refinement_steps"))
            .or_default();
        *maximum = (*maximum).max(refinements);
    });
}

fn from_bits(v: &Value) -> f64 {
    f64::from_bits(v.as_str().unwrap().parse().unwrap())
}
fn check(c: [f64; 5], lo: f64, hi: f64, expected: &[u64]) -> Result<(), String> {
    #[cfg(feature = "decision-trace")]
    kroots::decision_trace::begin();
    let result = real_roots_in(&c, lo, hi);
    #[cfg(feature = "decision-trace")]
    account("full");
    let actual: Vec<u64> = result.as_slice().iter().map(|v| v.to_bits()).collect();
    if !support::acceptable(c, lo, hi, expected, &actual) {
        return Err(format!(
            "expected {expected:x?}, got {actual:x?}; coefficients {c:?}, window ({lo:?},{hi:?}]"
        ));
    }
    assert!(result.len <= 4);
    assert!(result.t[result.len as usize..]
        .iter()
        .all(|v| v.to_bits() == 0));
    assert!(result.as_slice().windows(2).all(|p| p[0] < p[1]));
    assert!(result
        .as_slice()
        .iter()
        .all(|x| x.is_finite() && *x > lo && *x <= hi));
    #[cfg(feature = "decision-trace")]
    kroots::decision_trace::begin();
    let first = earliest_root_in(&c, lo, hi).map(f64::to_bits);
    #[cfg(feature = "decision-trace")]
    account("earliest");
    if first != actual.first().copied() {
        return Err(format!(
            "earliest expected {:?}, got {first:?}",
            expected.first()
        ));
    }
    Ok(())
}
#[test]
fn edge_table() {
    let rows: Value = serde_json::from_str(include_str!("data/edges.json")).unwrap();
    let mut failures = Vec::new();
    for row in rows.as_array().unwrap() {
        let mut c = [0.; 5];
        for (i, x) in c.iter_mut().enumerate() {
            *x = from_bits(&row["c"][i]);
        }
        let expected: Vec<u64> = row["roots"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().parse().unwrap())
            .collect();
        if let Err(err) = check(c, from_bits(&row["lo"]), from_bits(&row["hi"]), &expected) {
            failures.push(format!("{}: {err}", row["id"]));
        }
    }
    assert!(
        failures.is_empty(),
        "{} edge failures:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

#[test]
fn zero_factor_subnormal_completion() {
    let rows: Value = serde_json::from_str(include_str!("data/f-defects.json")).unwrap();
    for row in rows.as_array().unwrap() {
        let c = std::array::from_fn(|i| from_bits(&row["c"][i]));
        check(c, from_bits(&row["lo"]), from_bits(&row["hi"]), &[1]).unwrap();
    }
}

fn hex(s: &str) -> f64 {
    let negative = s.starts_with('-');
    let s = s.trim_start_matches('-').trim_start_matches("0x");
    let (mantissa, exponent) = s.split_once('p').unwrap();
    let exponent: i32 = exponent.parse().unwrap();
    let (whole, frac) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    let digits = format!("{whole}{frac}");
    let mut x = u64::from_str_radix(&digits, 16).unwrap() as f64;
    let e = exponent - 4 * frac.len() as i32;
    for _ in 0..e.max(0) {
        x *= 2.;
    }
    for _ in 0..(-e).max(0) {
        x *= 0.5;
    }
    if negative {
        -x
    } else {
        x
    }
}
fn vectors(data: &str, name: &str) {
    #[cfg(feature = "decision-trace")]
    COUNTS.with(|c| c.borrow_mut().clear());
    let pack: Value = serde_json::from_str(data).unwrap();
    let mut failures = Vec::new();
    let mut total = 0;
    for row in pack["cases"].as_array().unwrap() {
        let mut c = [0.; 5];
        for (i, x) in c.iter_mut().enumerate() {
            *x = hex(row["coeffs_hex"][i].as_str().unwrap());
        }
        let number = |v: &Value| {
            v.as_f64()
                .unwrap_or_else(|| v.as_str().unwrap().parse::<f64>().unwrap())
        };
        let lo = number(&row["lo"]);
        let hi = number(&row["hi"]);
        let mut expected: Vec<u64> = row["roots"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| hex(r["nearest_f64_hex"].as_str().unwrap()))
            .filter(|x| x.is_finite() && *x > lo && *x <= hi)
            .map(|x| if x == 0. { 0 } else { x.to_bits() })
            .collect();
        expected.dedup();
        total += 1;
        if let Err(err) = check(c, lo, hi, &expected) {
            failures.push(format!(
                "{} {} {} ambiguous={}: {err}",
                row["id"], row["stratum"], row["family"], row["ambiguous"]
            ));
        }
    }
    println!("{name}: {total} cases, {} failures", failures.len());
    #[cfg(feature = "decision-trace")]
    COUNTS.with(|c| {
        println!(
            "{name} path counts: {}",
            serde_json::to_string(&*c.borrow()).unwrap()
        )
    });
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
#[test]
fn vectors_v2() {
    vectors(include_str!("data/roots-dev-v2.json"), "v2");
}
#[test]
fn vectors_v3() {
    vectors(include_str!("data/roots-dev-v3.json"), "v3");
}

#[test]
fn manual_access_copy_equality() {
    for len in 0..=255 {
        let a = WindowRoots {
            len,
            t: [2., -5., 7., 9.],
        };
        assert_eq!(a.as_slice().len(), usize::from(len).min(4));
        assert_eq!(a.first(), if len == 0 { None } else { Some(2.) });
    }
    let a = WindowRoots {
        len: 1,
        t: [2., -0., f64::INFINITY, 7.],
    };
    let b = a;
    assert_eq!(a, b);
    assert_eq!(a.t.map(f64::to_bits), b.t.map(f64::to_bits));
    let mut b = a;
    b.t[1] = 0.;
    assert_eq!(a, b);
    b.t[3] = 8.;
    assert_ne!(a, b);
    let n = WindowRoots {
        len: 0,
        t: [f64::NAN, 0., 0., 0.],
    };
    assert_ne!(n, n);
    assert_eq!(WindowRoots::EMPTY.t.map(f64::to_bits), [0; 4]);
}
#[test]
fn behavior_witnesses() {
    assert_eq!(
        real_roots_in(&[24., -44., 24., -4., 0.], 0., 4.).as_slice(),
        &[1., 2., 3.]
    );
    let time = f64::from_bits(1523_u64 << 52);
    let scaled = [
        0.,
        0.,
        -f64::from_bits(1003_u64 << 52),
        0.,
        f64::from_bits(3_u64 << 52),
    ];
    assert_eq!(
        real_roots_in(&scaled, -2. * time, 2. * time).as_slice(),
        &[-time, 0., time]
    );
    let c = [24., -50., 35., -10., 1.];
    let all = real_roots_in(&c, 0., 5.);
    assert_eq!(all.as_slice().iter().find(|x| **x > 2.5), Some(&3.));
    for factor in [-2., 0.25, 1048576.] {
        assert_eq!(real_roots_in(&c.map(|x| x * factor), 0., 5.), all);
    }
    assert_eq!(
        real_roots_in(&[1., 0., 1., 0., 0.], 0., 2.),
        WindowRoots::EMPTY
    );
    assert_eq!(
        real_roots_in(&[-1., 0., 1., 0., 0.], 0., 2.).as_slice(),
        &[1.]
    );
    assert_eq!(
        real_roots_in(&[2., -3., 1., -0., -0.], 0., 3.).as_slice(),
        &[1., 2.]
    );
}
