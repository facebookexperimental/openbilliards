# Third-party notices

OpenBilliards includes code derived from a third-party project and links
third-party code. This file lists them; the licence texts are in
`web/vendor/`, and each binary carries its notices next to it.

## pooltool — Apache License 2.0

Parts of the physics kernel are derived from pooltool,
main @ 9a8abfe0da4c3b588dd7779e7f8530123170e742 (v0.6.0-39-g9a8abfe),
https://github.com/ekiefl/pooltool — Copyright (c) Evan Kiefl and
contributors, licensed under the Apache License, Version 2.0. The derived
code was translated from Python to Rust and JavaScript and modified by the
OpenBilliards authors. The derived portions remain under the Apache License
2.0.

- Licence text: `web/vendor/LICENSE-Apache-2.0.txt` (a byte copy of
  pooltool's LICENSE.txt), also next to the kernel binary in
  `web/dist/pool-wasm/` and in each `pool_py` wheel.
- Notice: `web/vendor/NOTICE-pooltool.txt`, also next to the kernel binary
  in `web/dist/pool-wasm/` and in each `pool_py` wheel.
- Citation: Kiefl, E. (2024). Pooltool: A Python package for realistic
  billiards simulation. Journal of Open Source Software, 9(101), 7301.
  https://doi.org/10.21105/joss.07301

The binaries that contain derived code are the kernel wasm
(`web/dist/pool-wasm/pool_wasm_bg.wasm`, also bundled in the iOS and macOS
apps) and the `pool_py` extension module of the wheels; `web/scene/table.js`
and `web/scene/cuestick.js` ship as source in the web build and both apps.

### Derived source files

A file is listed when it translates pooltool's code, directly or by
re-implementing or copying the construction of a listed file (the table layout
of `Table::from_pocket_spec`, for example). A file that only calls a listed
file, reads its results, or copies its geometry numbers is not derived and is
not listed. Each file listed below is derived from pooltool and modified by the
OpenBilliards authors, and says so near its top. Two kinds of file carry the
notice in this list instead: a file whose existing header another check pins
byte for byte (marked "header frozen"; that header states the lineage), and
an exact historical copy kept as a test fixture (marked "frozen copy"). The
public-snapshot sync refuses while a listed file lacks its notice, or while a
file that is not listed declares a pooltool lineage.

<!-- derived-files:begin -->
- `crates/pool-core/src/evolve.rs` — upstream: pooltool `pooltool/physics/evolve/__init__.py`, `pooltool/physics/utils.py`, `pooltool/ptmath/utils.py` (`coordinate_rotation`), `pooltool/evolution/event_based/cache.py` (`_next_transition`), `pooltool/evolution/event_based/detect/ball_position_polynomial.py`
- `crates/pool-core/src/params.rs` — upstream: pooltool `pooltool/objects/ball/params.py` (parameter defaults)
- `crates/pool-core/src/sample.rs` — upstream: pooltool `pooltool/evolution/continuous.py`
- `crates/pool-core/src/resolve/ball_ball.rs` — upstream: pooltool `pooltool/physics/resolve/ball_ball/`, `pooltool/ptmath/roots/core.py` (the kiss root filter), `pooltool/physics/utils.py` (`surface_velocity`, `tangent_surface_velocity`), `pooltool/ptmath/utils.py` (the contact-frame rotation)
- `crates/pool-core/src/resolve/ball_table.rs` — upstream: pooltool `pooltool/physics/resolve/ball_table/`
- `crates/pool-core/src/resolve/cushion.rs` — upstream: pooltool `pooltool/physics/resolve/ball_cushion/han_2005/`, `pooltool/objects/table/components.py` (`CircularCushionSegment.get_normal_xy`), `pooltool/ptmath/utils.py` (`coordinate_rotation`)
- `crates/pool-core/src/resolve/cushion_stronge.rs` — upstream: pooltool `pooltool/physics/resolve/stronge_compliant.py`, `pooltool/physics/resolve/ball_cushion/stronge_compliant/`, `pooltool/physics/utils.py` (`surface_velocity`), `pooltool/ptmath/utils.py` (`decompose_normal_tangent`), `pooltool/objects/table/components.py` (the circular-cushion normal, as `CircularCushionSegment.get_normal_xy`), `pooltool/physics/resolve/ball_cushion/han_2005/` (the contact angle sinθ = h/R − 1, through `resolve/cushion.rs`)
- `crates/pool-core/src/resolve/cushion_mathavan.rs` — upstream: pooltool `pooltool/physics/resolve/ball_cushion/mathavan_2010/`, `pooltool/objects/table/components.py` (`CircularCushionSegment.get_normal_xy`), `pooltool/ptmath/utils.py` (the contact-frame rotation)
- `crates/pool-core/src/resolve/cushion_airborne.rs` — upstream: pooltool `pooltool/physics/resolve/sphere_half_space_collision.py`, `pooltool/physics/utils.py` (`tangent_surface_velocity`), `pooltool/physics/resolve/ball_table/frictional_inelastic/` (the slip/stick impulse, generalized through `resolve/ball_table.rs`), `pooltool/objects/table/components.py` (the cushion and jaw normals)
- `crates/pool-core/src/resolve/strike.rs` — upstream: pooltool `pooltool/physics/resolve/stick_ball/`, `pooltool/physics/utils.py`, `pooltool/physics/resolve/ball_table/frictional_inelastic/` (the slip/stick bed impulse), `pooltool/ptmath/utils.py` (`coordinate_rotation`)
- `crates/pool-core/src/sim/detect.rs` — upstream: pooltool `pooltool/evolution/event_based/detect/`, `pooltool/physics/utils.py` (`get_airborne_time`), `pooltool/ptmath/utils.py` (`is_overlapping`), `pooltool/ptmath/roots/core.py` (the real-root filter)
- `crates/pool-core/src/table.rs` — upstream: pooltool `pooltool/objects/table/layout.py`, `pooltool/objects/table/specs.py` [header frozen: the GH-1080 KERNEL-ADDITIVE proof of tools/render/ghrox pins every pre-existing line; its "Geometry attribution" header states the lineage and the deviations]
- `crates/pool-core/src/cue_clearance.rs` — upstream: pooltool, through the pocket-mouth carve of `web/scene/cuestick.js`, ported line for line
- `crates/pool-core/src/math/quartic.rs` — upstream: pooltool `pooltool/ptmath/roots/_quartic_numba.py`, pooltool's translation of ACM Algorithm 1010 (Orellana & De Michele 2020, ACM TOMS 46(2))
- `crates/pool-core/src/math/cubic.rs` — upstream: pooltool `pooltool/ptmath/roots/_quartic_numba.py` (its depressed-cubic machinery), pooltool's translation of ACM Algorithm 1010 (Orellana & De Michele 2020)
- `crates/pool-core/src/math/quadratic.rs` — upstream: pooltool `pooltool/ptmath/roots/quadratic.py`
- `crates/pool-core/src/math/mod.rs` — upstream: pooltool `pooltool/ptmath/roots/core.py` (`get_real_positive_smallest_root`)
- `web/scene/table.js` — upstream: pooltool, through the table-layout math of `crates/pool-core/src/table.rs`, mirrored in JavaScript
- `web/scene/cuestick.js` — upstream: pooltool, through the pocket-jaw math of `web/scene/table.js` (the cue clearance strips)
- `tools/render/gh488predator/generate.py` — upstream: pooltool, through the jaw construction of `crates/pool-core/src/table.rs`, mirrored in Python
- `tools/render/gh488p-chains.mjs` — upstream: pooltool, through `tools/render/gh488predator/generate.py` (a port of its jaw construction)
- `tools/render/gh488d/gen_drawing_488d.py` — upstream: pooltool, through the pocket and cushion construction of `crates/pool-core/src/table.rs` and `web/scene/table.js`
- `tools/render/lib/scene.mjs` — upstream: pooltool, through the rail and jaw construction of `Table::from_pocket_spec` and `web/scene/table.js`, mirrored for the offline lightmap bake
- `tools/render/ghrox/gen_drawing_rox.py` — upstream: pooltool, through the `from_pocket_spec` construction lines it quotes and ports
- `crates/pool-core/tests/fixtures/catalog_v5.json` — upstream: pooltool, through the legacy 9-ft table entry of the v5 equipment catalog (pooltool's pocket-table specs, as its calibration note says) [frozen copy: the byte-frozen v5 catalog dump that a kernel test compares the live catalog against]
- `tools/render/ghrox/fixtures/pocket-cut-lane-base.txt` — upstream: pooltool, as a slice of an earlier `web/scene/table.js` (`makeGeom` and its helpers) [frozen copy: an exact historical slice that tools/render/ghrox/benchmark_pocket_cut_rox.mjs reads]
<!-- derived-files:end -->

## Rust code in the wasm binaries

The physics kernel (`web/dist/pool-wasm/pool_wasm_bg.wasm`) and the rules
engine (`web/dist/pool-rules/pool_rules_bg.wasm`) contain third-party Rust
crates and the Rust standard library, under MIT or MIT-compatible terms.
Their versions and notices, verbatim, are in
`web/vendor/LICENSE-rust-crates.txt` (generated from `Cargo.lock` by
`tools/gen-rust-notices.mjs`; a copy sits next to each binary).

## Vendored web libraries, fonts and assets

`web/vendor/LICENSES.md` lists the vendored JavaScript libraries, fonts and
assets of the web app and their licences; `web/vendor/LICENSE-Apache-2.0.txt`
is the Apache License 2.0 text that the ltc-sheen data and the
pooltool-derived code need.
