// Copyright (c) Meta Platforms, Inc. and affiliates.

//! The catalog v20 (#789) twin-text function, the rule that maps an old
//! entry's text to the text of its de-branded twin, and the normalization
//! N built on it, [`twin_content_sha256`].
//!
//! This file is not a test target of its own (its directory has no
//! `main.rs`, so cargo does not build it). `src/catalog.rs` compiles it
//! into its test build through a `#[path]` module declaration, so the twin
//! byte-identity test and the content-hash check read one definition. The
//! content-hash fixture `tests/fixtures/catalog_v20_retired_content.json`
//! records the sha256 of this file: the digests in it were taken with this
//! exact text, and any edit here turns the check red until they are
//! re-recorded.
//!
//! Rule: every whole-word old-id token is replaced by its neutral id. Word
//! characters are the alphanumerics and `_` (the `grep -w` class), so
//! `pool_pro_9ft` never matches inside `pool_pro_9ft_k55`. Brand words are
//! not ids and stay, as nominative citations. Two exemptions keep the old
//! token verbatim:
//! - Rust paths: a token right after `PocketTableSpec::`,
//!   `CurvedPocketTableSpec::` or `ClothPreset::` names a constructor, and
//!   the constructors are kept.
//! - Frozen wire strings: the v1/v2 `ClothPreset` preset strings keep their
//!   spelling where they are quoted as wire values, that is where the token
//!   sits directly between two `"` characters.

/// The (old id, neutral id) rename rows whose old entry stays in the
/// catalog: 6 tables, 2 cloths, 4 ballsets.
pub const TWIN_RENAMES: [(&str, &str); 12] = [
    ("diamond_proam_9ft", "pool_pro_9ft"),
    ("diamond_proam_8ft", "pool_pro_8ft"),
    ("diamond_proam_7ft", "pool_pro_7ft"),
    ("predator_apex_9ft", "pool_pro_9ft_metal_rim"),
    ("rasson_ox_9ft", "pool_pro_9ft_k55"),
    ("diamond_redlabel_9ft", "pool_pro_9ft_older_gen"),
    ("simonis_860_tournament", "pool_worsted_new"),
    ("simonis_760_fast", "pool_worsted_fast"),
    ("aramith_pool", "pool_standard"),
    ("aramith_pool_worn", "pool_used"),
    ("aramith_black", "pool_black_cap"),
    ("arcos_reserve", "pool_ivory_gunsight"),
];

/// The additive geometry variants: (old `TableGeometry` serde name, twin
/// variant serde name). Both members of a row select the same constructor.
pub const TWIN_GEOMETRY: [(&str, &str); 6] = [
    ("DiamondProAm9Ft", "PoolPro9Ft"),
    ("DiamondProAm8Ft", "PoolPro8Ft"),
    ("DiamondProAm7Ft", "PoolPro7Ft"),
    ("PredatorApex9Ft", "PoolPro9FtMetalRim"),
    ("RassonOx9Ft", "PoolPro9FtK55"),
    ("DiamondRedLabel9Ft", "PoolPro9FtOlderGen"),
];

/// The frozen v1/v2 `ClothPreset` wire strings.
const WIRE_PRESETS: [&str; 2] = ["simonis_860_tournament", "simonis_760_fast"];

/// Path prefixes after which a token names a kept constructor.
const CONSTRUCTOR_PATHS: [&str; 3] = [
    "PocketTableSpec::",
    "CurvedPocketTableSpec::",
    "ClothPreset::",
];

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// The neutral id for the token `s[start..end]`, or `None` when the token is
/// not a mapped old id or one of the two exemptions applies.
fn replacement(s: &str, start: usize, end: usize) -> Option<&'static str> {
    let token = &s[start..end];
    let neutral = TWIN_RENAMES
        .iter()
        .find(|(old, _)| *old == token)
        .map(|(_, new)| *new)?;
    let before = &s[..start];
    if CONSTRUCTOR_PATHS.iter().any(|p| before.ends_with(p)) {
        return None;
    }
    let quoted = before.ends_with('"') && s[end..].starts_with('"');
    if quoted && WIRE_PRESETS.contains(&token) {
        return None;
    }
    Some(neutral)
}

/// Apply the twin-text rule to `s`.
pub fn twin_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.char_indices().peekable();
    while let Some((start, c)) = chars.next() {
        if !is_word(c) {
            out.push(c);
            continue;
        }
        let mut end = s.len();
        while let Some(&(i, next)) = chars.peek() {
            if !is_word(next) {
                end = i;
                break;
            }
            chars.next();
        }
        out.push_str(replacement(s, start, end).unwrap_or(&s[start..end]));
    }
    out
}

/// The twin variant name of an old `TableGeometry` serde name, if any.
pub fn twin_geometry(name: &str) -> Option<&'static str> {
    TWIN_GEOMETRY
        .iter()
        .find(|(old, _)| *old == name)
        .map(|(_, new)| *new)
}

/// Apply [`twin_text`] to every string inside `v`.
fn map_strings(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::String(s) => *s = twin_text(s),
        serde_json::Value::Array(a) => a.iter_mut().for_each(map_strings),
        serde_json::Value::Object(o) => o.values_mut().for_each(map_strings),
        _ => {}
    }
}

/// Steps 1 to 5 of N, the entry's JSON with its identity fields removed and
/// its text mapped to the twin's:
/// 1. `serde_json::to_value` of the entry. serde_json is built without
///    `preserve_order`, so object keys are in sorted order.
/// 2. The top-level `id` is removed.
/// 3. `calibration.Measured.session` and `calibration.Measured.doc` are
///    removed; `date` stays.
/// 4. Every remaining string passes through [`twin_text`].
/// 5. The top-level `geometry` value, if [`twin_geometry`] maps it, becomes
///    the twin variant name.
pub fn twin_normalized<T: serde::Serialize>(entry: &T) -> serde_json::Value {
    let mut v = serde_json::to_value(entry).expect("a catalog entry serializes");
    let map = v.as_object_mut().expect("a catalog entry is a JSON object");
    map.remove("id");
    if let Some(measured) = map
        .get_mut("calibration")
        .and_then(|c| c.get_mut("Measured"))
        .and_then(|m| m.as_object_mut())
    {
        measured.remove("session");
        measured.remove("doc");
    }
    map_strings(&mut v);
    if let Some(g) = v.get_mut("geometry") {
        if let Some(twin) = g.as_str().and_then(twin_geometry) {
            *g = serde_json::Value::String(twin.to_string());
        }
    }
    v
}

/// N: steps 1 to 5 ([`twin_normalized`]), then 6. the compact
/// `serde_json::to_vec` bytes and 7. their SHA-256 as lowercase hex. A
/// retired entry hashed at record time and its twin hashed at test time
/// give the same hex when the twin carries the entry's content.
pub fn twin_content_sha256<T: serde::Serialize>(entry: &T) -> String {
    let bytes = serde_json::to_vec(&twin_normalized(entry)).expect("a JSON value serializes");
    sha256_hex(&bytes)
}

/// SHA-256 round constants.
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

/// SHA-256 of `data` as lowercase hex: a test-local copy of `sha256_hex` in
/// crates/pool-rules/tests/corpus.rs, since pool-core carries no hash
/// crate.
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
        for (slot, v) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(v);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}
