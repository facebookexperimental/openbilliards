// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! GH-491 (build 18): the heyball conformance-slice harness — the
//! corpus.rs discipline applied to the frozen per-discipline slice
//! `scripts/fixtures/rules-corpus-variants/wpa-heyball.json` (the
//! fourteenone additive-slice precedent: the 442-case legacy corpus is
//! byte-untouched; the new ruleset ships its OWN once-harvested-then-
//! frozen oracle). Every case replays through the public `_json`
//! boundary and byte-compares against the harvested `expect` (+ the
//! sha256 tamper pin). A byte diff here is ALWAYS resolved by fixing
//! the crate.

use serde_json::Value;

use pool_rules::{apply_decision_json, hud_state_json, judge_json};

fn load_slice() -> Value {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus-variants/wpa-heyball.json"
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn run_case(case: &Value) -> String {
    let field = |k: &str| case.get(k).unwrap_or(&Value::Null).to_string();
    let kind = case["kind"].as_str().unwrap();
    let ruleset = case["ruleset"].as_str().unwrap();
    let breaker = case.get("breaker").and_then(Value::as_u64)
        .unwrap_or(1) as u8;
    let out = match kind {
        "initialState" | "initialState-error" => {
            pool_rules::initial_state_json(ruleset, breaker)
        }
        "judge" | "judge-error" => judge_json(
            ruleset, &field("state"), &field("record"), &field("call")),
        "applyDecision" | "applyDecision-error" => apply_decision_json(
            ruleset, &field("state"), &field("decision")),
        "hudState" => hud_state_json(ruleset, &field("state")),
        other => panic!("unknown slice case kind {other:?}"),
    };
    let is_error_kind = kind.ends_with("-error");
    match out {
        Ok(bytes) => {
            assert!(!is_error_kind, "expected an error, judged fine: {bytes}");
            bytes
        }
        Err(e) => {
            assert!(is_error_kind, "unexpected RulesError: {e}");
            e.to_json()
        }
    }
}

#[test]
fn heyball_slice_byte_matches_the_frozen_oracle() {
    let slice = load_slice();
    assert_eq!(slice["slice"], "wpa-heyball");
    assert_eq!(slice["ruleset"], "heyball-v1");
    let cases = slice["cases"].as_array().unwrap();
    // frozen at the GH-491 harvest (3f41c726)
    assert_eq!(cases.len(), 59, "the frozen slice census");
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let expect = case["expect"].as_str().unwrap();
        assert_eq!(
            sha256_hex(expect.as_bytes()),
            case["expectSha256"].as_str().unwrap(),
            "{id}: slice expect/sha mismatch — oracle tampered?"
        );
        let got = run_case(case);
        assert_eq!(got, expect, "{id}: crate bytes diverge");
    }
}

// ---- SHA-256 (FIPS 180-4), test-local (corpus.rs twin) -----------------------

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
