// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Catalog v20 (#789): the pool-wasm export `catalog_alias_digests_json`
//! parses back into exactly the kernel's two digest alias rows, and
//! `table_geometry_json_for` builds a retired v8 Measured id's twin. The test is
//! a native integration test (the crate is an `rlib` as well as a
//! `cdylib`), so `src/lib.rs` carries the export wrapper and nothing else.

use serde_json::Value;

#[test]
fn catalog_alias_digests_json_round_trips_the_two_rows() {
    let rows: Value = serde_json::from_str(&pool_wasm::catalog_alias_digests_json())
        .expect("the export is JSON");
    let rows = rows.as_array().expect("the export is a JSON array");
    let parsed: Vec<(&str, &str, &str)> = rows
        .iter()
        .map(|row| {
            let obj = row.as_object().expect("each row is an object");
            let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
            keys.sort_unstable();
            assert_eq!(keys, ["axis", "digest", "neutral_id"], "row keys");
            (
                row["axis"].as_str().expect("axis"),
                row["digest"].as_str().expect("digest"),
                row["neutral_id"].as_str().expect("neutral_id"),
            )
        })
        .collect();
    assert_eq!(
        parsed,
        [
            ("table", "8223852648be1aa5", "pool_pro_9ft_measured"),
            ("cloth", "906c9b774047f8a4", "pool_worsted_measured"),
        ]
    );

    // Each neutral id is a served entry on its axis of `catalog_json`.
    let catalog: Value =
        serde_json::from_str(&pool_wasm::catalog_json()).expect("the catalog is JSON");
    for (axis, _, neutral) in &parsed {
        let key = match *axis {
            "table" => "tables",
            "cloth" => "cloths",
            other => panic!("{other}: not an alias axis"),
        };
        let entries = catalog[key].as_array().expect("catalog axis array");
        assert!(
            entries.iter().any(|e| e["id"] == *neutral),
            "{neutral} is not a {axis} entry"
        );
    }
}

/// A retired v8 Measured table id builds the same geometry bytes as its
/// neutral twin, at the default radius and at an explicit one, and an
/// unknown id still returns an error object.
#[test]
fn table_geometry_json_for_builds_the_twin_of_a_retired_id() {
    for r in [None, Some(0.028575), Some(0.02625)] {
        let twin = pool_wasm::table_geometry_json_for("pool_pro_9ft_measured", r);
        let retired = pool_wasm::table_geometry_json_for("owner_proam_9ft_2026_07", r);
        assert!(!twin.contains("\"error\""), "{twin}");
        assert_eq!(retired, twin, "ball_r {r:?}");
    }
    let unknown = pool_wasm::table_geometry_json_for("unlisted_table_8ft", None);
    assert!(unknown.contains("\"error\""), "{unknown}");
}
