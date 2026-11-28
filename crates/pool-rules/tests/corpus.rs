// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T020 — the generic corpus harness (migration-gate checks M1/M4,
//! the conformance-gate contract §2): load the frozen byte oracle
//! `scripts/fixtures/rules-corpus.json`, dispatch every case for every
//! REGISTERED ruleset through the public `_json` API, and byte-compare
//! the crate output against the harvested `expect` (plus the sha256
//! pin — corpus integrity AND output identity in one assertion). Every
//! later port re-uses this file unchanged: registering a ruleset
//! automatically activates its subset.
//!
//! A byte diff here is ALWAYS resolved by fixing the crate — never by
//! editing the corpus (behavior freeze beats correctness).

use serde::Deserialize;
use serde_json::Value;

use pool_rules::rulesets::registry::lookup;
use pool_rules::{
    apply_decision_json, hud_state_json, initial_state_json, judge_json,
};

#[derive(Deserialize)]
struct Corpus {
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    id: String,
    ruleset: String,
    kind: String,
    #[serde(default)]
    breaker: Option<u8>,
    #[serde(default)]
    state: Option<Value>,
    #[serde(default)]
    record: Option<Value>,
    #[serde(default)]
    call: Option<Value>,
    #[serde(default)]
    decision: Option<Value>,
    expect: String,
    #[serde(rename = "expectSha256")]
    expect_sha256: String,
}

fn load_corpus() -> Corpus {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// A case runs when its ruleset is registered, or when it pins the
/// registry-miss itself (the stub-v0 unknown-ruleset case).
fn runnable(case: &Case) -> bool {
    lookup(&case.ruleset).is_ok()
        || case.expect.starts_with("{\"error\":{\"code\":\"unknown-ruleset\"")
}

/// Dispatch one case through the `_json` boundary, returning the bytes a
/// surface would ship (error cases ship the canonical error payload).
fn run_case(case: &Case) -> String {
    let json = |v: &Option<Value>| {
        v.as_ref().map_or_else(|| "null".to_string(), |x| x.to_string())
    };
    let state = json(&case.state);
    let out = match case.kind.as_str() {
        "initialState" => {
            initial_state_json(&case.ruleset, case.breaker.expect("breaker"))
        }
        "judge" | "judge-error" => judge_json(
            &case.ruleset, &state, &json(&case.record), &json(&case.call)),
        "applyDecision" | "applyDecision-error" => apply_decision_json(
            &case.ruleset, &state, &json(&case.decision)),
        "hudState" => hud_state_json(&case.ruleset, &state),
        other => panic!("{}: unknown corpus case kind {other:?}", case.id),
    };
    let is_error_kind = case.kind.ends_with("-error");
    match out {
        Ok(bytes) => {
            assert!(!is_error_kind,
                "{}: expected an error, judged fine: {bytes}", case.id);
            bytes
        }
        Err(e) => {
            assert!(is_error_kind,
                "{}: unexpected RulesError: {e}", case.id);
            e.to_json()
        }
    }
}

/// M4: every runnable case byte-matches the harvested oracle, and the
/// oracle line itself still matches its recorded sha256 (tamper check).
#[test]
fn registered_subsets_byte_match_the_corpus() {
    let corpus = load_corpus();
    let mut ran = 0usize;
    let mut nineball = 0usize;
    let mut carom = 0usize;
    let mut onepocket = 0usize;
    let mut eightball = 0usize;
    let mut snooker = 0usize;
    for case in &corpus.cases {
        if !runnable(case) {
            continue;
        }
        assert_eq!(sha256_hex(case.expect.as_bytes()), case.expect_sha256,
            "{}: corpus expect/sha mismatch — oracle tampered?", case.id);
        let got = run_case(case);
        assert_eq!(got, case.expect, "{}: crate bytes diverge", case.id);
        assert_eq!(sha256_hex(got.as_bytes()), case.expect_sha256,
            "{}: sha divergence", case.id);
        ran += 1;
        if case.ruleset == "nineball-v1" {
            nineball += 1;
        }
        if case.ruleset == "carom3c-v1" {
            carom += 1;
        }
        if case.ruleset == "onepocket-v1" {
            onepocket += 1;
        }
        if case.ruleset == "eightball-v1" {
            eightball += 1;
        }
        if case.ruleset == "snooker-v1" {
            snooker += 1;
        }
    }
    // The nineball-v1 subset (this port's gate): 72 judge + 2 judge-error
    // + 1 applyDecision-error + 18 hudState + 2 initialState = 95 cases,
    // frozen with the corpus; +5 issue-#92 additive pins (2 judge +
    // 2 judge-error + 1 hudState, current-crate harvest) = 100.
    assert_eq!(nineball, 100, "nineball-v1 subset incomplete");
    // The carom3c-v1 subset (T024 gate): 38 judge + 6 judge-error +
    // 4 applyDecision + 5 applyDecision-error + 14 hudState +
    // 2 initialState = 69 cases, frozen with the corpus; +2 issue-#92
    // additive judge pins (current-crate harvest) = 71; +4 GH-371
    // additive judge pins (UMB Art 27.2/41.8 frozen-cushion-play, incl.
    // the review-r1 corner-travel legal boundary) +2 GH-371
    // contact_respot decision pins (current-crate harvest) = 77.
    assert_eq!(carom, 77, "carom3c-v1 subset incomplete");
    // The onepocket-v1 subset (T027 gate): 35 judge + 9 judge-error +
    // 7 applyDecision + 10 applyDecision-error + 7 hudState +
    // 2 initialState = 70 cases, frozen with the corpus; +2 issue-#92
    // additive judge pins (current-crate harvest) = 72; +3 GH-371
    // additive judge pins (WPA 12.8 via 3.11 kitchen-shot fouls) +2
    // GH-371 spot_nearest decision pins (current-crate harvest) = 77.
    assert_eq!(onepocket, 77, "onepocket-v1 subset incomplete");
    // The eightball-v1 subset (T030 gate): 60 judge + 14 judge-error +
    // 18 applyDecision + 11 applyDecision-error + 6 hudState +
    // 2 initialState = 111 cases, frozen with the corpus.
    assert_eq!(eightball, 111, "eightball-v1 subset incomplete");
    // The snooker-v1 subset (T033 gate): 41 judge + 18 judge-error +
    // 8 applyDecision + 7 applyDecision-error + 8 hudState +
    // 2 initialState = 84 cases, frozen with the corpus; +3 issue-#92
    // additive judge pins (current-crate harvest) = 87.
    assert_eq!(snooker, 87, "snooker-v1 subset incomplete");
    assert!(ran > nineball + carom + onepocket + eightball + snooker,
        "the stub unknown-ruleset pin must also run");
}

// ---- SHA-256 (FIPS 180-4), test-local -----------------------------------
// The corpus carries per-case sha256 pins; the crate itself must stay
// serde/serde_json-only (the rules-crate API contract §1), so the
// digest lives here in the test harness. Integer ops only (the R11
// float lint stays trivially clean).

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

fn sha256_hex(data: &[u8]) -> String {
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
        for (slot, v) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(v);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

#[test]
fn sha256_known_answer() {
    assert_eq!(
        sha256_hex(b"abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_eq!(
        sha256_hex(b""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}
