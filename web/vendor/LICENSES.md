# Vendored third-party code

## three.js r170 (0.170.0) — MIT

- `three.module.min.js` — core module build
- `jsm/lights/RectAreaLightUniformsLib.js`, `jsm/lights/RectAreaLightTexturesLib.js`
- `jsm/postprocessing/EffectComposer.js`, `jsm/postprocessing/Pass.js`,
  `jsm/postprocessing/RenderPass.js`, `jsm/postprocessing/ShaderPass.js`,
  `jsm/postprocessing/MaskPass.js`, `jsm/postprocessing/UnrealBloomPass.js`,
  `jsm/postprocessing/OutputPass.js`
- `jsm/shaders/CopyShader.js`, `jsm/shaders/LuminosityHighPassShader.js`,
  `jsm/shaders/OutputShader.js`

Source: https://unpkg.com/three@0.170.0/ (npm package `three`).
License: MIT — Copyright 2010-2024 Three.js Authors.
Full text: `LICENSE-three.txt` (verbatim copy of the package LICENSE file).

## mp4-muxer 5.2.2 — MIT

- `mp4-muxer/mp4-muxer.mjs` — ESM build (in-page MP4 muxing for the
  WebCodecs video exporter, `web/app/offline-render.js`)

Source: https://registry.npmjs.org/mp4-muxer/-/mp4-muxer-5.2.2.tgz
(npm package `mp4-muxer`, https://github.com/Vanilagy/mp4-muxer).
License: MIT — Copyright (c) 2023 Vanilagy. Full text: `mp4-muxer/LICENSE`.

## webm-muxer 5.1.4 — MIT

- `webm-muxer/webm-muxer.mjs` — ESM build (webm/VP9+opus fallback container
  for the video exporter when avc1/AAC WebCodecs support is missing)

Source: https://registry.npmjs.org/webm-muxer/-/webm-muxer-5.1.4.tgz
(npm package `webm-muxer`, https://github.com/Vanilagy/webm-muxer).
License: MIT — Copyright (c) 2023 Vanilagy. Full text: `webm-muxer/LICENSE`.

## Inter 4.1 (variable, latin subset) — SIL OFL 1.1

- `fonts/InterVariable-subset.woff2` — variable weight axis, latin subset
  (UI typeface, declared in `web/app/ui/tokens.css`)

Source: https://registry.npmjs.org/inter-ui/-/inter-ui-4.1.1.tgz (npm package
`inter-ui`, https://rsms.me/inter/). License: SIL Open Font License 1.1 —
Copyright (c) 2016-2018 The Inter Project Authors. Full text:
`fonts/LICENSE-Inter.txt`.

## Space Grotesk (variable, latin subset) — SIL OFL 1.1

- `fonts/SpaceGroteskVariable-latin.woff2` — variable weight axis (300–700),
  latin subset (brand typeface, declared in `web/app/ui/tokens.css`; same
  file as `site/assets/fonts/`)

Source: fontsource latin subset (npm package `@fontsource-variable/space-grotesk`,
https://github.com/floriankarsten/space-grotesk). License: SIL Open Font
License 1.1 — Copyright 2020 The Space Grotesk Project Authors. Full text:
`fonts/LICENSE-SpaceGrotesk.txt`.

## ltc-sheen (Zeltner/Burley/Chiang 2022) — Apache-2.0

- `../scene/ltcsheen.js` — the fitted 32×32 LTC sheen lookup table
  (`ltc_table_sheen_volume.npy`, "volume" fit) converted to a base64
  float16 DataTexture module by `tools/render/build-ltc-sheen.mjs`
  (data only; no source files copied). Used by the CINEMA cloth tier in
  `web/scene/shading.js` for exact rectangular-area-light sheen with
  multiple scattering.

Source: https://github.com/tizian/ltc-sheen — reference implementation of
"Practical Multiple-Scattering Sheen Using Linearly Transformed Cosines",
Zeltner, Burley, Chiang 2022. License: Apache License 2.0 — Copyright
The Walt Disney Company / the ltc-sheen authors. Full text:
`LICENSE-Apache-2.0.txt`.

## terlenka — CC0 1.0 (Poly Haven)

- `../assets/cloth/terlenka_nor_gl_512.png` — cloth closeup detail normal:
  512 px seamless quarter-tile crop of `terlenka_nor_gl_2k.png` (fine
  diagonal twill, 2048×2053 resampled square; prepared by
  `tools/render/build-cloth-detail.py`).

Source: https://polyhaven.com/a/terlenka
(https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/terlenka/terlenka_nor_gl_2k.png).
License: CC0 1.0 Universal (public domain) — Poly Haven asset library.

## pooltool — Apache-2.0 (derived code in the physics kernel)

- `../dist/pool-wasm/pool_wasm_bg.wasm` — the physics kernel binary. Parts of
  its source (`crates/pool-core`: ball motion, the ball–ball, ball–table,
  cushion and cue-strike resolvers, event detection, shot sampling, the ball
  parameter defaults and the table layout) are translated from pooltool and
  modified.
- `../scene/table.js` and `../scene/cuestick.js` — mirror the same
  table-layout math in JavaScript.

Source: https://github.com/ekiefl/pooltool, main @ 9a8abfe0
(v0.6.0-39-g9a8abfe). License: Apache License 2.0 — Copyright (c) Evan
Kiefl and contributors; translated to Rust/JavaScript and modified by the
OpenBilliards authors. Full text: `LICENSE-Apache-2.0.txt` (a byte copy of
pooltool's LICENSE.txt). Notice: `NOTICE-pooltool.txt`. The list of derived
files is in THIRD_PARTY_NOTICES.md at the root of the source tree. Both files
also sit next to the binary in `../dist/pool-wasm/`.

## Rust code compiled into the wasm binaries — MIT and MIT-compatible

- `../dist/pool-wasm/pool_wasm_bg.wasm` (physics kernel) and
  `../dist/pool-rules/pool_rules_bg.wasm` (rules engine) contain these
  third-party crates: libm (kernel only) and zmij (MIT); memchr
  (Unlicense OR MIT); unicode-ident ((MIT OR Apache-2.0) AND Unicode-3.0);
  cfg-if, itoa, once_cell, serde, serde_core, serde_json, wasm-bindgen and
  wasm-bindgen-shared (MIT OR Apache-2.0); and the Rust standard library
  (core, alloc, compiler-builtins; MIT OR Apache-2.0). Where a crate offers
  a choice, it is used under MIT.

Versions, repositories and each notice, verbatim: `LICENSE-rust-crates.txt`
(generated from `Cargo.lock` by `tools/gen-rust-notices.mjs`; a copy sits
next to each binary).

## Shader techniques referenced (not copied files)

- Closed-form sphere soft shadow and sphere ambient occlusion in
  `../spike.html` are ports of Inigo Quilez's published analytic formulas
  (https://iquilezles.org/articles/spheresoftshadow/,
  https://iquilezles.org/articles/sphereao/), MIT-licensed example code.
- Box-projected (parallax-corrected) cubemap reflection follows the classic
  technique described by Lagarde (gamedeveloper.com, "Image-based Lighting
  approaches and parallax-corrected cubemap") and three.js issue #15704;
  implementation in `../spike.html` is original.
