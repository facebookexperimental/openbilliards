# three.js r170 addons added for the `club` look

Nine files under `web/vendor/jsm/` were added for the opt-in `club` look (ruling 9c58a075 item 5, accepted as seam 4 of
ASK-0002): the four named addons (GTAOPass, SMAAPass, BokehPass, RGBELoader) and their direct imports that were not vendored
yet. Each file is byte-for-byte the file of the same path under `package/examples/jsm/` in the npm package **three@0.170.0**.
Nothing was edited, renamed or re-indented.

They are imported only by modules under `web/scene/club/`, which are themselves reached only through the one guarded dynamic
import of the `club` look. No existing module imports them, so a page that does not boot
the `club` look never requests them.

## The package

| what | value |
|---|---|
| package | `three@0.170.0` (npm), `https://registry.npmjs.org/three/-/three-0.170.0.tgz` |
| registry `dist.shasum` (sha1 of the tarball) | `6087f97aab79e9e9312f9c89fcef6808642dfbb7` |
| registry `dist.integrity` | `sha512-FQK+LEpYc0fBD+J8g6oSEyyNzjp+Q7Ks1C568WWaoMRLW+TkNNWmenWeGgJjV105Gd+p/2ql1ZcjYvNiPZBhuQ==` |
| sha256 of the tarball | `4a608a355dcaba72e0e5383cdc814303f5b6060b43c238cdf6932dceb699238d` |
| git head recorded by the registry | `beab9e845f9e5ae11d648f55b24a0e910b56a85a` |

The lane's saved copy of the tarball was hashed on 2026-11-14: its sha1 and its sha512 equal the two registry values above.

## The files

sha256 and size of each vendored file. Each was compared on 2026-11-14 with the file read straight out of the tarball
(`tar -xOzf three-0.170.0.tgz package/examples/jsm/<path>`): equal in all nine cases.

| file under `web/vendor/jsm/` | bytes | sha256 | why it is here |
|---|---:|---|---|
| `postprocessing/GTAOPass.js` | 16582 | `980b036767c439cf2aadd0e869b2e51b2ec00736a75a5ad1bb69dddb03254fe8` | named addon: ambient occlusion pass |
| `postprocessing/SMAAPass.js` | 49467 | `f3508e3e17f40c1358921b5c7eb3ab60460d97b06fdadf6b0d40b52d3842c44a` | named addon: anti-aliasing pass |
| `postprocessing/BokehPass.js` | 3394 | `581ad606035764f92a6c5124980ddeb78c09cb076d2bdeb6c760ca9d0a8332ec` | named addon: depth-of-field pass |
| `loaders/RGBELoader.js` | 11377 | `f0e87d0008d9484d31358b32befd1bf80e4301f77573cc9a7cf7d871cc3f64b4` | named addon: RGBE environment loader |
| `shaders/GTAOShader.js` | 12990 | `e1f5dd89bca4ee679a4aca50c3ef3513926be71f6860c38e31a62cc9d7120b39` | imported by `GTAOPass.js` |
| `shaders/PoissonDenoiseShader.js` | 6614 | `3dab419b23529f8fd59e2713458502f9f51d2dd3af3e1285dc671fcc451d49fb` | imported by `GTAOPass.js` |
| `math/SimplexNoise.js` | 14351 | `9b8d541b77b0ddc79afaa6a1de8941452c191b8b9006f04e7b8fc422e2b263f7` | imported by `GTAOPass.js` |
| `shaders/SMAAShader.js` | 14628 | `3c7e942a25cb09dd431e395e6e91904715a834b2a6e62ec0b9b77c2f8655c369` | imported by `SMAAPass.js` |
| `shaders/BokehShader.js` | 5769 | `a6558cc4baf2c372c192828e9fffcf088d22f80291ac72a13a5be6d3b7a18ddc` | imported by `BokehPass.js` |

Total: 9 files, 135172 bytes.

## Import closure

Every relative import of the nine files resolves to a vendored file:

- `GTAOPass.js` -> `./Pass.js`, `../shaders/CopyShader.js` (both vendored before this lane), `../shaders/GTAOShader.js`,
  `../shaders/PoissonDenoiseShader.js`, `../math/SimplexNoise.js`
- `SMAAPass.js` -> `./Pass.js`, `../shaders/SMAAShader.js`
- `BokehPass.js` -> `./Pass.js`, `../shaders/BokehShader.js`
- `RGBELoader.js`, the four shader files and `SimplexNoise.js` import only `three` (or nothing)

`three` resolves through the app's import map to `web/vendor/three.module.min.js`, the same r170 build the app already ships.

## Licence

MIT, Copyright 2010-2024 Three.js Authors. The notice the app already ships, `web/vendor/LICENSE-three.txt`, is a verbatim
copy of the package's `LICENSE` file (sha256 `4c40a1ef62450b857c3b2aaf294936304cd552d965fbcd9d32d4c5bcf4ba4454`, equal to
the file in the tarball) and covers these files too; it stays as it is. The file list of the three.js section in
`web/vendor/LICENSES.md` names each vendored file and needs the nine paths above added to it.

## How to re-check

```
tar -xOzf three-0.170.0.tgz package/examples/jsm/postprocessing/GTAOPass.js | shasum -a 256
shasum -a 256 web/vendor/jsm/postprocessing/GTAOPass.js
```
and the same for the other eight paths; the two digests must be equal and must equal the table.
