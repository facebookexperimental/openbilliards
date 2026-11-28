# Club look: asset credits

Every file in this directory is derived from a CC0 (public-domain dedication) original. Nothing here needs attribution;
this file and `credits.json` record provenance: where each original came from, who made it, its licence, when it was
downloaded, the sha256 of the original and of the shipped derivative, and what was done to it.
Written by `web/tools/club/asset-build.mjs` (the club venue's rows), `web/tools/club/asset-arena.mjs` (the arena venue's rows) and `web/tools/club/bake-room.mjs` (the baked light files); do not edit by hand.

Shipped set: 32 files, 9676069 bytes (cap 12000000); largest side 2048 px (cap 2048). The high tier's pack (`high/`: requested only with the desktop high tier selected, never precached, counted apart): 8 files, 17949291 bytes; largest side 4096 px.

## Sources

| asset | provider | page | author(s) | licence | published |
|---|---|---|---|---|---|
| Wood Floor (`wood_floor`) | Poly Haven | https://polyhaven.com/a/wood_floor | Dimitrios Savva | CC0-1.0 | 2023-10-24 |
| Dark Wood (`dark_wood`) | Poly Haven | https://polyhaven.com/a/dark_wood | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0-1.0 | 2022-12-15 |
| Beige Wall 001 (`beige_wall_001`) | Poly Haven | https://polyhaven.com/a/beige_wall_001 | Dimitrios Savva, Rico Cilliers | CC0-1.0 | 2021-07-20 |
| Leather Red 02 (`leather_red_02`) | Poly Haven | https://polyhaven.com/a/leather_red_02 | Rob Tuytel | CC0-1.0 | 2020-06-18 |
| Rosewood Veneer1 (`rosewood_veneer1`) | Poly Haven | https://polyhaven.com/a/rosewood_veneer1 | Jenelle van Heerden | CC0-1.0 | 2024-03-28 |
| Terlenka (`terlenka`) | Poly Haven | https://polyhaven.com/a/terlenka | colormass, Rico Cilliers | CC0-1.0 | 2025-09-05 |
| Metal 009 (`Metal009`) | ambientCG | https://ambientcg.com/a/Metal009 | ambientCG | CC0-1.0 | 2018-08-16 |
| Warm Bar (`warm_bar`) | Poly Haven | https://polyhaven.com/a/warm_bar | Greg Zaal, Jarod Guest | CC0-1.0 | 2024-10-14 |
| Carpet 016 (`Carpet016`) | ambientCG | https://ambientcg.com/a/Carpet016 | ambientCG | CC0-1.0 | 2023-11-05 |
| Velour Velvet (`velour_velvet`) | Poly Haven | https://polyhaven.com/a/velour_velvet | colormass, Rico Cilliers | CC0-1.0 | 2025-09-05 |
| Caban (`caban`) | Poly Haven | https://polyhaven.com/a/caban | colormass, Rico Cilliers | CC0-1.0 | 2025-09-05 |

Licence evidence:

- https://polyhaven.com/license (site-wide: every asset is CC0; the asset API carries no per-asset licence field)
- https://docs.ambientcg.com/license/ (site-wide: every asset is CC0 1.0 Universal; the asset API carries no per-asset licence field)

## Files

### `floor-color.jpg` (floor.color)

- shipped: 2048 x 2048 JPEG, 730131 bytes, sRGB colour, sha256 `256a81ef011538a3fea89d33586ed94d8e7f12f4aeec11c13b3d4745c2850f1b`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_floor/wood_floor_diff_2k.jpg
- original sha256 `7c3ff1164c8dd0758ef2c048e9a266d28174120de01052ec40e6ca486177345c` (2983667 bytes), downloaded 2026-11-14T01:32:42Z
- asset page: https://polyhaven.com/a/wood_floor; author(s): Dimitrios Savva; licence: CC0-1.0
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 55.
- notes: Smoked-oak planks, 9 boards across one repeat, boards run along V (image vertical). One repeat covers 1.7 m in the source.

### `floor-color-1024.jpg` (floor.color, lite tier)

- shipped: 1024 x 1024 JPEG, 191071 bytes, sRGB colour, sha256 `6ff5c2a00fcdba6c85ceb04998ca1c2c68362a5d0c68b200ce0b9dccb046c82f`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_floor/wood_floor_diff_2k.jpg
- original sha256 `7c3ff1164c8dd0758ef2c048e9a266d28174120de01052ec40e6ca486177345c` (2983667 bytes), downloaded 2026-11-14T01:32:42Z
- asset page: https://polyhaven.com/a/wood_floor; author(s): Dimitrios Savva; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60.
- notes: Smoked-oak planks, 9 boards across one repeat, boards run along V (image vertical). One repeat covers 1.7 m in the source.

### `floor-normal.jpg` (floor.normal)

- shipped: 2048 x 2048 JPEG, 762233 bytes, linear data, sha256 `9dbdd1c2b0d75f49e053c76f9fd238905bf8af67807fa20b44bd4a2c9f3eb54c`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/wood_floor/wood_floor_nor_gl_2k.png
- original sha256 `2364421a19aba9392bcd0ba14617e7e91ac2869ca3fab16d83563b5250d71bc8` (19399802 bytes), downloaded 2026-11-14T01:39:13Z
- asset page: https://polyhaven.com/a/wood_floor; author(s): Dimitrios Savva; licence: CC0-1.0
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 88.
- notes: OpenGL convention (+Y up), from the lossless PNG original. One repeat covers 1.7 m in the source.

### `floor-normal-1024.jpg` (floor.normal, lite tier)

- shipped: 1024 x 1024 JPEG, 142905 bytes, linear data, sha256 `c302ffcfe6fc58c444672e6c5f0ab103e76a8ba95b98561dd34ff4b4960f404e`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/wood_floor/wood_floor_nor_gl_2k.png
- original sha256 `2364421a19aba9392bcd0ba14617e7e91ac2869ca3fab16d83563b5250d71bc8` (19399802 bytes), downloaded 2026-11-14T01:39:13Z
- asset page: https://polyhaven.com/a/wood_floor; author(s): Dimitrios Savva; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 90.
- notes: OpenGL convention (+Y up), from the lossless PNG original. One repeat covers 1.7 m in the source.

### `floor-rough.jpg` (floor.rough)

- shipped: 1024 x 1024 JPEG, 145652 bytes, linear data, sha256 `4cac647e2655516384e1640abb35a1e39db9bb6c09f124aa528655fbce4671c3`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_floor/wood_floor_rough_2k.jpg
- original sha256 `297eda0d75f2020cc541dbf242e1f5fd058053249567f49a4506fc2c5b1a172b` (2267559 bytes), downloaded 2026-11-14T01:32:42Z
- asset page: https://polyhaven.com/a/wood_floor; author(s): Dimitrios Savva; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60.
- notes: Roughness, single channel (grey JPEG). One repeat covers 1.7 m in the source.

### `wood-dark-color.jpg` (wood_dark.color)

- shipped: 2048 x 2048 JPEG, 653527 bytes, sRGB colour, sha256 `1a7b9cc751d97e729921a37964323d7ce4ead18fe217a084941f979abf0d9661`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/dark_wood/dark_wood_diff_2k.jpg
- original sha256 `ff811f97ab46f1148f2753451fd9d64abf0ab9101e85922ed9f45fc3595a3cf2` (2894186 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/dark_wood; author(s): Dario Barresi, Dimitrios Savva, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 55.
- notes: Dark red-brown mahogany-type cabinet wood, grain runs along U (image horizontal). One repeat covers 2 m in the source.

### `wood-dark-color-1024.jpg` (wood_dark.color, lite tier)

- shipped: 1024 x 1024 JPEG, 203241 bytes, sRGB colour, sha256 `bbbc2ab8385178ba1ba6e3b146cd6e0000e6de8756ce95e79f62e9316488c931`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/dark_wood/dark_wood_diff_2k.jpg
- original sha256 `ff811f97ab46f1148f2753451fd9d64abf0ab9101e85922ed9f45fc3595a3cf2` (2894186 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/dark_wood; author(s): Dario Barresi, Dimitrios Savva, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60.
- notes: Dark red-brown mahogany-type cabinet wood, grain runs along U (image horizontal). One repeat covers 2 m in the source.

### `wood-dark-normal.jpg` (wood_dark.normal)

- shipped: 1024 x 1024 JPEG, 125257 bytes, linear data, sha256 `e813a62f74dfb00232b8edb021af72550e250104a2386960f9af2a56b63e76c9`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/dark_wood/dark_wood_nor_gl_2k.png
- original sha256 `5607cf76d8da2844ee285fbabdc79976e18240e13efe6927a368c8cb06bf9148` (18635244 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/dark_wood; author(s): Dario Barresi, Dimitrios Savva, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 90.
- notes: OpenGL convention (+Y up), from the lossless PNG original. One repeat covers 2 m in the source.

### `wood-dark-rough.jpg` (wood_dark.rough)

- shipped: 1024 x 1024 JPEG, 125258 bytes, linear data, sha256 `a108c528eb8db3e82e5aa3d357100205dbd5ea8c417baf2666b6c47fcf3b9ae5`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/dark_wood/dark_wood_rough_2k.jpg
- original sha256 `09eb42a24aeadcd5dd04d19f89d8df4116fd9cdbd405d0dab17e263b54ece133` (2325418 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/dark_wood; author(s): Dario Barresi, Dimitrios Savva, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 50.
- notes: Roughness. One repeat covers 2 m in the source.

### `wall-normal.jpg` (wall.normal)

- shipped: 1024 x 1024 JPEG, 253998 bytes, linear data, sha256 `48f1b4e44df712c584c792809a56fada216ea95682223407fd0d2dc461161e14`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/beige_wall_001/beige_wall_001_nor_gl_2k.jpg
- original sha256 `7f5cbecd6766f44034f3b78b4addb1559e12bdd5a77501bd418a736609e7cedc` (815507 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/beige_wall_001; author(s): Dimitrios Savva, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 75.
- notes: Smooth painted plaster, low relief; OpenGL convention (+Y up). One repeat covers 3 m in the source.

### `wall-rough.jpg` (wall.rough)

- shipped: 512 x 512 JPEG, 31460 bytes, linear data, sha256 `cf3c1c53c412ef0646574a34c72a39a252d55711c6b228f640a4fbc8f314f0d5`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/beige_wall_001/beige_wall_001_rough_2k.jpg
- original sha256 `a76e2307d8ec47d1be1d4710851fc4545db7aecfa176333738a6756358b64767` (656368 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/beige_wall_001; author(s): Dimitrios Savva, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 512 px and re-encoded as JPEG: sips -Z 512 -s format jpeg -s formatOptions 60.
- notes: Roughness. One repeat covers 3 m in the source.

### `leather-color.jpg` (leather.color)

- shipped: 1024 x 1024 JPEG, 260207 bytes, sRGB colour, sha256 `f1b5144564a15cc84fd9af497dba9ee5dc406c3c7daa65f93d19dbb3961b9097`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leather_red_02/leather_red_02_coll1_2k.jpg
- original sha256 `a900630e541991b7ee63aab820f425610fbf2db32f7ae6c63b6ef4fc2325ab60` (4160234 bytes), downloaded 2026-11-14T01:39:14Z
- asset page: https://polyhaven.com/a/leather_red_02; author(s): Rob Tuytel; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 50.
- notes: Dark brown pebbled upholstery leather (the source asset's colour variant 1). One repeat covers 0.6 m in the source.

### `leather-normal.jpg` (leather.normal)

- shipped: 1024 x 1024 JPEG, 280837 bytes, linear data, sha256 `37183887d5e734149dde9fa5265b109fc2f659aa81cd377c60879f95fa3dfb7d`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leather_red_02/leather_red_02_nor_gl_2k.jpg
- original sha256 `be8e0525fe6cc7d0215d4fc81f2761a2f8485f85baad3bcd4b9bcdeb843ea925` (4324549 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/leather_red_02; author(s): Rob Tuytel; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60.
- notes: OpenGL convention (+Y up). One repeat covers 0.6 m in the source.

### `leather-rough.jpg` (leather.rough)

- shipped: 512 x 512 JPEG, 75572 bytes, linear data, sha256 `011d08cd70597cae8d88a49dc095e974df20f252940f9d78b341dd2acde790a4`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leather_red_02/leather_red_02_rough_2k.jpg
- original sha256 `0dd604b493aef28488a7f8a4c86846c1ec7313c16bd5198a9deec8a7f880b43d` (3529399 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/leather_red_02; author(s): Rob Tuytel; licence: CC0-1.0
- processing: Resampled to fit 512 px and re-encoded as JPEG: sips -Z 512 -s format jpeg -s formatOptions 60.
- notes: Roughness. One repeat covers 0.6 m in the source.

### `veneer-color.jpg` (veneer.color)

- shipped: 2048 x 2048 JPEG, 809333 bytes, sRGB colour, sha256 `03c825fc1e6c40ee1e16216e4819c693c417292a8fc61ae2a34a83277cbaee12`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rosewood_veneer1/rosewood_veneer1_diff_2k.jpg
- original sha256 `4aae1766165d5058ae0311d94d53fb0d5c7cb55d3314916e801b9505cf34ed8e` (3294736 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/rosewood_veneer1; author(s): Jenelle van Heerden; licence: CC0-1.0
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 55.
- notes: Figured rosewood veneer, book-matched columns, grain runs along V (image vertical). One repeat covers 2.43 m in the source.

### `veneer-color-1024.jpg` (veneer.color, lite tier)

- shipped: 1024 x 1024 JPEG, 229773 bytes, sRGB colour, sha256 `8360fd5066dfc2300a01ad6c989578672db007f84eb497cf6961f273a6779194`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rosewood_veneer1/rosewood_veneer1_diff_2k.jpg
- original sha256 `4aae1766165d5058ae0311d94d53fb0d5c7cb55d3314916e801b9505cf34ed8e` (3294736 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/rosewood_veneer1; author(s): Jenelle van Heerden; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60.
- notes: Figured rosewood veneer, book-matched columns, grain runs along V (image vertical). One repeat covers 2.43 m in the source.

### `veneer-normal.jpg` (veneer.normal)

- shipped: 1024 x 1024 JPEG, 122608 bytes, linear data, sha256 `bbd355f766adfccfbd411506fb3cf23087b8782b91b1baba060a4393751eea8d`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rosewood_veneer1/rosewood_veneer1_nor_gl_2k.jpg
- original sha256 `9ae97e960494ffc5cd948ad89225f694a4624a228418f107bd7145d020dd728d` (1569067 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/rosewood_veneer1; author(s): Jenelle van Heerden; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 95.
- notes: OpenGL convention (+Y up). One repeat covers 2.43 m in the source.

### `felt-normal.jpg` (felt.normal)

- shipped: 1021 x 1024 JPEG, 385068 bytes, linear data, sha256 `765cc3634a7c92321d6bbca89394de9b423581e5817ece7708b59b5f542dabdb`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/terlenka/terlenka_nor_gl_2k.jpg
- original sha256 `7fd916e6d897dfe003dac3400c81dd919e11e3441558bac04c26e07be380e6a0` (4113359 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/terlenka; author(s): colormass, Rico Cilliers; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 90.
- notes: Fine twill weave, low relief, for small-scale tiling on the cloth; OpenGL convention (+Y up). One repeat covers 0.266 m in the source.

### `metal-normal.jpg` (metal.normal)

- shipped: 1024 x 1024 JPEG, 180266 bytes, linear data, sha256 `e138bdcf0d7561d58b238cf2fb7cf4f14dc88edd77e898dbe58325a27e3870a5`
- original: https://ambientcg.com/get?file=Metal009_2K-JPG.zip (archive member `Metal009_2K-JPG_NormalGL.jpg`, sha256 `8773d9e97a4b057ced3e538d8ecc6069d27c8948191d61daf79b9ad93d93e3b3`)
- original sha256 `6f79f53d5073e65707c5765316fa9257f4604e1790093be5a51ed8226761a7f0` (16660145 bytes), downloaded 2026-11-14T01:39:16Z
- asset page: https://ambientcg.com/a/Metal009; author(s): ambientCG; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 90. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: Brushed metal, brush lines run along U (image horizontal); OpenGL convention (+Y up). A procedural CC0 material, not a scan.

### `metal-rough.jpg` (metal.rough)

- shipped: 1024 x 1024 JPEG, 171122 bytes, linear data, sha256 `96ce2c8f3221cd5fed7b742ff2e43eefb56a2daba8248f8d992fbea8ec4a87dd`
- original: https://ambientcg.com/get?file=Metal009_2K-JPG.zip (archive member `Metal009_2K-JPG_Roughness.jpg`, sha256 `e802f013b93cb1bd4b55cd91f02a1863233475a7f8bd0e6755cfaa447a729674`)
- original sha256 `6f79f53d5073e65707c5765316fa9257f4604e1790093be5a51ed8226761a7f0` (16660145 bytes), downloaded 2026-11-14T01:39:16Z
- asset page: https://ambientcg.com/a/Metal009; author(s): ambientCG; licence: CC0-1.0
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: Roughness with brush streaks.

### `hdri-room.png` (hdri.room)

- shipped: 1024 x 512 PNG, 1095061 bytes, linear data, sha256 `7b3f697b31b506d2f32a1e0dbb7cab9da0ccc8717e8194f09063b50eaca36a94`
- original: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/warm_bar_1k.hdr
- original sha256 `610f4496687a175cca1d993f01931c1a0c42e81ad8878d3ada6363b2334c5555` (1487340 bytes), downloaded 2026-11-14T01:39:15Z
- asset page: https://polyhaven.com/a/warm_bar; author(s): Greg Zaal, Jarod Guest; licence: CC0-1.0
- processing: Radiance .hdr decoded (run-length RGBE) and its RGBE bytes written unchanged as an 8-bit RGBA PNG (asset-hdr-to-rgbe-png.mjs, PNG filter type 1 on every row, zlib level 9); no resize, no tone change.
- notes: Equirectangular interior (a warm bar at night), RGBE bytes in an RGBA PNG: linear RGB = (R, G, B) * 2^(A - 128) / 255; row 0 is the zenith. Alpha is data: decode before any filtering, never through a 2D canvas. Every row uses PNG filter type 1 (see asset-hdr-to-rgbe-png.mjs).

### `room-light.png` (room.light)

- shipped: 1024 x 1024 PNG (RGBA8), 901496 bytes, sha256 `35919e0802072ecebd8cd3cf399977982afa78f4dcbefe7f29796503b0741998`
- made by this project: a baked light map, no third-party input; licence: CC0-1.0
- inputs: `web/scene/club/room.js`, `web/scene/club/room/shell.js`, `web/scene/club/room/light.js`, `web/scene/club/room/lightmap.js`, `web/scene/club/room/props.js`, `web/scene/club/room/props/`, `web/scene/club/room/lamp.js`, `web/scene/club/room/lamp/`
- tool: web/tools/club/bake-room.html + bake-room-scene.mjs + bake-room-core.mjs + bake-room-worker.mjs (compute), web/tools/club/bake-room.mjs (file)
- bake: signature `d592cea3b9b6611d` (levels `46c222158e5e69e2`), 1 job(s), 39.1 s of page time on 8 workers, host: a Linux x86_64 host (software GL), browser: HeadlessChrome/151.0.7922.71; file written with node v26.3.1 (zlib 1.2.12)
- baked against: scene content hashes: geometry `618a81da6b039ed4` (shell `0343a402d7df5f7e`, props `612b3be1d6c97949`, luminaire `8ad52781ec21e18d`, table stand-in `072cf071f792357c`), emitters `0f7578cfc16a02fb`, albedo hints `57e8580024e2c089`; the tree it was written into built exactly that scene; its 24 source files (the inputs above and the bake tool) had the combined sha256 `d7e084a3ea5b82f0a88c70bc5e4eb4d4ecb7b2e4ca7dc9d6f2eae405dbcf5d8a` (per file in credits.json)
- processing: Light map of the club room's shell: for each texel of the shell's second UV set, the irradiance of every fixed emitter with soft shadows (CPU ray casting against the shell, the props, the luminaire and both tables), bounced light and an occlusion-weighted ambient, and in alpha the visible share of the main lamp. RGB = irradiance / 16 through the sRGB curve with a 4 x 4 ordered dither; 1024 x 1024 RGBA8 PNG, adaptive row filters, zlib level 6, the bake's record in a tEXt chunk. The same light on a 28 x 8 x 24 grid over the room (six receiver directions per grid point, the same encoding) rides in a private ancillary chunk (rlVo, 129024 bytes before zlib): the furniture reads it. Deterministic: the same tree gives the same bytes.
- notes: No third-party input: geometry, emitters and albedo hints all come from the code listed under inputs. At run time the room refuses the file when its signature (shell layout, light-map charts, emitter ids and positions, the props plan) does not equal the live room, then the analytic light is used. The exact test is the tool's: `node web/tools/club/bake-room.mjs check` rebuilds the room from the tree and compares content hashes of every blocker triangle, the emitter table and the albedo hints with the record in the file; re-bake when it reports a difference. Alpha is data: the loader decodes the PNG itself (web/scene/club/room/lightmap.js), never through an image element or a 2D canvas.

### `room-light-lite.png` (room.light.lite)

- shipped: 512 x 512 PNG (RGBA8), 296255 bytes, sha256 `455d60c2ef91ccfa0575fada797ffa933179e9b526f203dc852528e3d15e374d`
- made by this project: a baked light map, no third-party input; licence: CC0-1.0
- inputs: `web/scene/club/room.js`, `web/scene/club/room/shell.js`, `web/scene/club/room/light.js`, `web/scene/club/room/lightmap.js`, `web/scene/club/room/props.js`, `web/scene/club/room/props/`, `web/scene/club/room/lamp.js`, `web/scene/club/room/lamp/`
- tool: web/tools/club/bake-room.html + bake-room-scene.mjs + bake-room-core.mjs + bake-room-worker.mjs (compute), web/tools/club/bake-room.mjs (file)
- bake: signature `a728dc044201c9be` (levels `f059e76fc25d0dc1`), 1 job(s), 14.1 s of page time on 8 workers, host: a Linux x86_64 host (software GL), browser: HeadlessChrome/151.0.7922.71; file written with node v26.3.1 (zlib 1.2.12)
- baked against: scene content hashes: geometry `6ce775ae8f11b85e` (shell `bd583990c72371f1`, props `67dcb3b7ee6e76e7`, luminaire `d34428f58ed53dfa`, table stand-in `072cf071f792357c`), emitters `db6e343ffd94da6d`, albedo hints `9cf52d235f465d8f`; the tree it was written into built exactly that scene; its 24 source files (the inputs above and the bake tool) had the combined sha256 `d7e084a3ea5b82f0a88c70bc5e4eb4d4ecb7b2e4ca7dc9d6f2eae405dbcf5d8a` (per file in credits.json)
- processing: Light map of the club room's shell: for each texel of the shell's second UV set, the irradiance of every fixed emitter with soft shadows (CPU ray casting against the shell, the props, the luminaire and both tables), bounced light and an occlusion-weighted ambient, and in alpha the visible share of the main lamp. RGB = irradiance / 16 through the sRGB curve with a 4 x 4 ordered dither; 512 x 512 RGBA8 PNG, adaptive row filters, zlib level 6, the bake's record in a tEXt chunk. The same light on a 28 x 8 x 24 grid over the room (six receiver directions per grid point, the same encoding) rides in a private ancillary chunk (rlVo, 129024 bytes before zlib): the furniture reads it. Deterministic: the same tree gives the same bytes.
- notes: No third-party input: geometry, emitters and albedo hints all come from the code listed under inputs. At run time the room refuses the file when its signature (shell layout, light-map charts, emitter ids and positions, the props plan) does not equal the live room, then the analytic light is used. The exact test is the tool's: `node web/tools/club/bake-room.mjs check` rebuilds the room from the tree and compares content hashes of every blocker triangle, the emitter table and the albedo hints with the record in the file; re-bake when it reports a difference. Alpha is data: the loader decodes the PNG itself (web/scene/club/room/lightmap.js), never through an image element or a 2D canvas.

### `arena-light.png` (arena.light)

- shipped: 1024 x 1024 PNG (RGBA8), 899107 bytes, sha256 `5be536c6433b2ba0a6142c180353ca9d5108b2299165001bbdbf7d5667c3f399`
- made by this project: a baked light map, no third-party input; licence: CC0-1.0
- inputs: `web/scene/club/arena/room.js`, `web/scene/club/arena/shell.js`, `web/scene/club/arena/shell/`, `web/scene/club/arena/layout.js`, `web/scene/club/room/light.js`, `web/scene/club/room/lightmap.js`, `web/scene/club/arena/rig.js`, `web/scene/club/arena/rig/`, `web/scene/club/arena/surround.js`, `web/scene/club/arena/surround/`, `web/scene/club/arena/floor.js`, `web/scene/club/arena/floor/`
- tool: web/tools/club/bake-room.html + bake-room-scene.mjs + bake-room-core.mjs + bake-room-worker.mjs (compute), web/tools/club/bake-room.mjs (file)
- bake: signature `cbcae80195dfa4fd` (levels `a6e57337ab57980d`), 1 job(s), 197.1 s of page time on 6 workers, host: a Linux x86_64 host, software GL, page mode, browser: HeadlessChrome/151.0.7922.71; file written with node v26.3.1 (zlib 1.2.12)
- baked against: scene content hashes: geometry `96a6e07cadcfcbdc` (shell `78c9d2514975c9d4`, props `c1b94efd4f9130a8`, luminaire `e44558dc34ff7cfe`, table stand-in `fe44ef85a4c82228`, rig `42b6a59dc25cfe3c` (81990 triangles), surround `a327aa790dbc94d2` (226036 triangles), floor `8544ac7865634ff7` (35744 triangles)), emitters `647e839bf5f36792`, albedo hints `f1fb11eb18843a94`; the tree it was written into built exactly that scene; its 31 source files (the inputs above and the bake tool) had the combined sha256 `2852b4612161ccb3267f7069bfc876789d4cbf73b8d6a1c00af5781459e97f61` (per file in credits.json)
- processing: Light map of the arena hall's carpet and backdrop: for each texel of the shell's second UV set, the irradiance of every fixed emitter with soft shadows (CPU ray casting against the hall, the rig, the surround, the floor furniture and the table), bounced light and an occlusion-weighted ambient, and in alpha the visible share of the main lamp. RGB = irradiance / 32 through the sRGB curve with a 4 x 4 ordered dither; 1024 x 1024 RGBA8 PNG, adaptive row filters, zlib level 6, the bake's record in a tEXt chunk. The same light on a 31 x 24 x 31 grid over the room (six receiver directions per grid point, the same encoding) rides in a private ancillary chunk (rlVo, 553536 bytes before zlib): the furniture reads it. Deterministic: the same tree gives the same bytes.
- notes: No third-party input: geometry, emitters and albedo hints all come from the code listed under inputs. At run time the room refuses the file when the hall's signature (layout version, the lite or full plan, the hall's box, the island, the backdrop, the light-map charts) does not equal the live room, then the analytic light is used; a part (shell, rig, surround, floor furniture) or an emitter that changed since the bake is named in the room's state and the file stays in use. The exact test is the tool's: `node web/tools/club/bake-room.mjs check` rebuilds the room from the tree and compares content hashes of every blocker triangle, the emitter table and the albedo hints with the record in the file; re-bake when it reports a difference. Alpha is data: the loader decodes the PNG itself (web/scene/club/room/lightmap.js), never through an image element or a 2D canvas.

### `arena-carpet-color.jpg` (arena.carpet.color)

- shipped: 1024 x 1024 JPEG, 163324 bytes, sRGB colour, sha256 `768e0e7542ddfb70f10782521b2fdf9c79c1831f5d32271a5b6354c608e06a48`
- original: https://ambientcg.com/get?file=Carpet016_4K-JPG.zip (archive member `Carpet016_4K-JPG_Color.jpg`, sha256 `f457b9848d64647d9a64832f5464dd67eff9988d4d565b65fe6293ee02ae90a4`)
- original sha256 `a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c` (111252536 bytes), downloaded 2026-11-15T00:17:37Z
- asset page: https://ambientcg.com/a/Carpet016; author(s): ambientCG; licence: CC0-1.0 (the asset page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.")
- processing: Converted to neutral grey (sips -m, the system's "Generic Gray Gamma 2.2" profile), resampled to fit 1024 px and re-encoded as JPEG: sips -m <grey profile> -Z 1024 -s format jpeg -s formatOptions 55. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: Loop-pile carpet (a wool berber: loops about 7 mm wide at the source's scale, rows run along U), converted to neutral grey so that the material's colour sets the tint; the scan's darker flecks stay as darker specks. Tiles without a seam. One repeat covers 1.7 m in the source. Mean of the shipped file: 177.4, 177.4, 177.4 of 255 (linear 0.4421, 0.4421, 0.4421).

### `arena-carpet-normal.jpg` (arena.carpet.normal)

- shipped: 1024 x 1024 JPEG, 197043 bytes, linear data, sha256 `a1a99b0d4efd992ee6ff4ab5482bd0a35ef8f825e32cd428017a636db6adfc54`
- original: https://ambientcg.com/get?file=Carpet016_4K-JPG.zip (archive member `Carpet016_4K-JPG_NormalGL.jpg`, sha256 `6598bd96aeae5e63059f56359598a5472f6421d05dbf2fad7186cd6a0548ce43`)
- original sha256 `a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c` (111252536 bytes), downloaded 2026-11-15T00:17:37Z
- asset page: https://ambientcg.com/a/Carpet016; author(s): ambientCG; licence: CC0-1.0 (the asset page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.")
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 40. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: OpenGL convention (+Y up). Strong relief: the mean tilt of the 4096 px original is 18 degrees. At 1024 px a loop is about 4 px wide, so the default-tier file holds the pile as grain of the right strength rather than as loops. One repeat covers 1.7 m in the source.

### `arena-carpet-rough.jpg` (arena.carpet.rough)

- shipped: 1024 x 1024 JPEG, 103002 bytes, linear data, sha256 `47616715973f6f28dcb13444c9921a4449d08aaf54d211fd54d6eb22406c3538`
- original: https://ambientcg.com/get?file=Carpet016_4K-JPG.zip (archive member `Carpet016_4K-JPG_Roughness.jpg`, sha256 `5c92173e56a68661017d8ab7e015416bb97efb358f83d855a9a2ffc2bb8c462b`)
- original sha256 `a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c` (111252536 bytes), downloaded 2026-11-15T00:17:37Z
- asset page: https://ambientcg.com/a/Carpet016; author(s): ambientCG; licence: CC0-1.0 (the asset page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.")
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 35. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: Roughness, single channel (grey JPEG). One repeat covers 1.7 m in the source.

### `high/arena-carpet-color.jpg` (arena.carpet.color, high tier)

- shipped: 4096 x 4096 JPEG, 3060396 bytes, sRGB colour, sha256 `267f75a18b0e7ef76f981dc007d39388f57fa707f1bccd712366f1b38a30e70c` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://ambientcg.com/get?file=Carpet016_4K-JPG.zip (archive member `Carpet016_4K-JPG_Color.jpg`, sha256 `f457b9848d64647d9a64832f5464dd67eff9988d4d565b65fe6293ee02ae90a4`)
- original sha256 `a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c` (111252536 bytes), downloaded 2026-11-15T00:17:37Z
- asset page: https://ambientcg.com/a/Carpet016; author(s): ambientCG; licence: CC0-1.0 (the asset page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.")
- processing: Converted to neutral grey (sips -m, the system's "Generic Gray Gamma 2.2" profile), resampled to fit 4096 px and re-encoded as JPEG: sips -m <grey profile> -Z 4096 -s format jpeg -s formatOptions 80. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: Loop-pile carpet (a wool berber: loops about 7 mm wide at the source's scale, rows run along U), converted to neutral grey so that the material's colour sets the tint; the scan's darker flecks stay as darker specks. Tiles without a seam. One repeat covers 1.7 m in the source.

### `high/arena-carpet-normal.jpg` (arena.carpet.normal, high tier)

- shipped: 4096 x 4096 JPEG, 9642640 bytes, linear data, sha256 `d9d61c2652d3730cc1a0588845e151b13072cbf88b4bc15934fd80828036e8a7` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://ambientcg.com/get?file=Carpet016_4K-JPG.zip (archive member `Carpet016_4K-JPG_NormalGL.jpg`, sha256 `6598bd96aeae5e63059f56359598a5472f6421d05dbf2fad7186cd6a0548ce43`)
- original sha256 `a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c` (111252536 bytes), downloaded 2026-11-15T00:17:37Z
- asset page: https://ambientcg.com/a/Carpet016; author(s): ambientCG; licence: CC0-1.0 (the asset page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.")
- processing: Resampled to fit 4096 px and re-encoded as JPEG: sips -Z 4096 -s format jpeg -s formatOptions 62. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: OpenGL convention (+Y up). Strong relief: the mean tilt of the 4096 px original is 18 degrees. At 1024 px a loop is about 4 px wide, so the default-tier file holds the pile as grain of the right strength rather than as loops. One repeat covers 1.7 m in the source.

### `high/arena-carpet-rough.jpg` (arena.carpet.rough, high tier)

- shipped: 4096 x 4096 JPEG, 1282683 bytes, linear data, sha256 `676d947bb0fd2588e1bac80709ff7083c193f4d136b22922cd5f4e6fb71e492b` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://ambientcg.com/get?file=Carpet016_4K-JPG.zip (archive member `Carpet016_4K-JPG_Roughness.jpg`, sha256 `5c92173e56a68661017d8ab7e015416bb97efb358f83d855a9a2ffc2bb8c462b`)
- original sha256 `a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c` (111252536 bytes), downloaded 2026-11-15T00:17:37Z
- asset page: https://ambientcg.com/a/Carpet016; author(s): ambientCG; licence: CC0-1.0 (the asset page: "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.")
- processing: Resampled to fit 4096 px and re-encoded as JPEG: sips -Z 4096 -s format jpeg -s formatOptions 40. The original is one image member of the downloaded archive; nothing else from the archive is used.
- notes: Roughness, single channel (grey JPEG). One repeat covers 1.7 m in the source.

### `arena-seat-color.jpg` (arena.seat.color)

- shipped: 512 x 492 JPEG, 25470 bytes, sRGB colour, sha256 `0dd98131795d738a5fa3a273a843645e08c1856ef6a03e9083dcc14c95266d06`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/velour_velvet/velour_velvet_diff_4k.jpg
- original sha256 `c186d0c369aef2204be81f5eb8c9ca8b271d7480f65bb53785ed484647dfa7c6` (13005232 bytes), downloaded 2026-11-15T00:34:27Z
- asset page: https://polyhaven.com/a/velour_velvet; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Made neutral (each pixel's strongest channel, computed on the decoded original by web/tools/club/asset-arena.mjs), resampled to fit 512 px and re-encoded as JPEG: sips -Z 512 -s format jpeg -s formatOptions 70.
- notes: Short velour upholstery fabric, made neutral (the scan is red: each pixel keeps its strongest channel, so the map holds the nap's light and dark patches near full scale and the material's colour sets the hue). Low contrast by nature: the look of a velour is in its sheen, not in this map. One repeat covers 0.284 x 0.273 m in the source. Mean of the shipped file: 173.3, 173.3, 173.3 of 255 (linear 0.4194, 0.4194, 0.4194).

### `arena-seat-normal.jpg` (arena.seat.normal)

- shipped: 512 x 492 JPEG, 48202 bytes, linear data, sha256 `647bfab2dda8d132c1f698d18e41523d71258c36d771593b505e5f466c364880`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/velour_velvet/velour_velvet_nor_gl_4k.jpg
- original sha256 `2817fba6736d2dca3efbcf9b988421bf96ab206dfc833c2b77a8bd99368364fa` (9222989 bytes), downloaded 2026-11-15T00:34:30Z
- asset page: https://polyhaven.com/a/velour_velvet; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 512 px and re-encoded as JPEG: sips -Z 512 -s format jpeg -s formatOptions 75.
- notes: OpenGL convention (+Y up). Low relief (a napped surface). One repeat covers 0.284 x 0.273 m in the source.

### `arena-seat-rough.jpg` (arena.seat.rough)

- shipped: 512 x 492 JPEG, 72663 bytes, linear data, sha256 `d2f21ad72c3aedbae155ddd9210bad15761c57b872fd2cdf9a34abfdda7b17af`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/velour_velvet/velour_velvet_rough_4k.jpg
- original sha256 `3ae05783ad283854b588c01ec715805591881a74b45fed4b5a8913d21ed85bdd` (15136265 bytes), downloaded 2026-11-15T00:34:32Z
- asset page: https://polyhaven.com/a/velour_velvet; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 512 px and re-encoded as JPEG: sips -Z 512 -s format jpeg -s formatOptions 60.
- notes: Roughness, single channel (grey JPEG). One repeat covers 0.284 x 0.273 m in the source.

### `arena-drape-normal.jpg` (arena.drape.normal)

- shipped: 1024 x 1021 JPEG, 109363 bytes, linear data, sha256 `ab5bac8b2a670fc260d1480f6444037f259630108ee659779a3208d6d62a9b2d`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/caban/caban_nor_gl_4k.jpg
- original sha256 `74ac71b9557d29c60feb110693c3f5411d6d58ed12fc02c000de601478d3cf3c` (8440015 bytes), downloaded 2026-11-15T00:35:17Z
- asset page: https://polyhaven.com/a/caban; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 60.
- notes: Heavy napped wool cloth; OpenGL convention (+Y up). One repeat covers 0.274 x 0.273 m in the source.

### `arena-drape-rough.jpg` (arena.drape.rough)

- shipped: 1024 x 1021 JPEG, 176907 bytes, linear data, sha256 `86e71827dad40a2ea85740da0e9b1d882aeb80956e8788ec97988f8b8ee954fa`
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/caban/caban_rough_4k.jpg
- original sha256 `fb0666f72a7af51994c40a24c45c23e5e07538d91af9ed5d3c6bb2cffd86f9a0` (16811133 bytes), downloaded 2026-11-15T00:35:20Z
- asset page: https://polyhaven.com/a/caban; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 1024 px and re-encoded as JPEG: sips -Z 1024 -s format jpeg -s formatOptions 35.
- notes: Roughness, single channel (grey JPEG). One repeat covers 0.274 x 0.273 m in the source.

### `high/arena-seat-color.jpg` (arena.seat.color, high tier)

- shipped: 2048 x 1970 JPEG, 838791 bytes, sRGB colour, sha256 `63568150ad261af0026578f62b14bcba16e016cc6d138bbb3716ff46045f8dbd` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/velour_velvet/velour_velvet_diff_4k.jpg
- original sha256 `c186d0c369aef2204be81f5eb8c9ca8b271d7480f65bb53785ed484647dfa7c6` (13005232 bytes), downloaded 2026-11-15T00:34:27Z
- asset page: https://polyhaven.com/a/velour_velvet; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Made neutral (each pixel's strongest channel, computed on the decoded original by web/tools/club/asset-arena.mjs), resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 80.
- notes: Short velour upholstery fabric, made neutral (the scan is red: each pixel keeps its strongest channel, so the map holds the nap's light and dark patches near full scale and the material's colour sets the hue). Low contrast by nature: the look of a velour is in its sheen, not in this map. One repeat covers 0.284 x 0.273 m in the source.

### `high/arena-seat-normal.jpg` (arena.seat.normal, high tier)

- shipped: 2048 x 1970 JPEG, 894285 bytes, linear data, sha256 `c1730974cf6e4cbcd1ea47388e17a21e85c482e99d9179caee544725026e703e` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/velour_velvet/velour_velvet_nor_gl_4k.jpg
- original sha256 `2817fba6736d2dca3efbcf9b988421bf96ab206dfc833c2b77a8bd99368364fa` (9222989 bytes), downloaded 2026-11-15T00:34:30Z
- asset page: https://polyhaven.com/a/velour_velvet; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 80.
- notes: OpenGL convention (+Y up). Low relief (a napped surface). One repeat covers 0.284 x 0.273 m in the source.

### `high/arena-seat-rough.jpg` (arena.seat.rough, high tier)

- shipped: 2048 x 1970 JPEG, 690840 bytes, linear data, sha256 `e947cb72e7b18626ea9c1a670083d935a7ebee7feceb945f60cf6f15f52a7ed8` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/velour_velvet/velour_velvet_rough_4k.jpg
- original sha256 `3ae05783ad283854b588c01ec715805591881a74b45fed4b5a8913d21ed85bdd` (15136265 bytes), downloaded 2026-11-15T00:34:32Z
- asset page: https://polyhaven.com/a/velour_velvet; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 35.
- notes: Roughness, single channel (grey JPEG). One repeat covers 0.284 x 0.273 m in the source.

### `high/arena-drape-normal.jpg` (arena.drape.normal, high tier)

- shipped: 2048 x 2043 JPEG, 678246 bytes, linear data, sha256 `4561a89f732880f6fa27efb17a088bb7eead3e1d6772c1c32125238e7b17c30e` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/caban/caban_nor_gl_4k.jpg
- original sha256 `74ac71b9557d29c60feb110693c3f5411d6d58ed12fc02c000de601478d3cf3c` (8440015 bytes), downloaded 2026-11-15T00:35:17Z
- asset page: https://polyhaven.com/a/caban; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 75.
- notes: Heavy napped wool cloth; OpenGL convention (+Y up). One repeat covers 0.274 x 0.273 m in the source.

### `high/arena-drape-rough.jpg` (arena.drape.rough, high tier)

- shipped: 2048 x 2043 JPEG, 861410 bytes, linear data, sha256 `04ac5b8b44b05ade09bef8a4a02fe6ca3cb8dada295f4f5da49030bab1a291b3` (the high tier's file: requested only with the high tier selected, never precached)
- original: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/caban/caban_rough_4k.jpg
- original sha256 `fb0666f72a7af51994c40a24c45c23e5e07538d91af9ed5d3c6bb2cffd86f9a0` (16811133 bytes), downloaded 2026-11-15T00:35:20Z
- asset page: https://polyhaven.com/a/caban; author(s): colormass, Rico Cilliers; licence: CC0-1.0 (the asset page: "CC0 1.0 Universal - public domain dedication, no attribution required")
- processing: Resampled to fit 2048 px and re-encoded as JPEG: sips -Z 2048 -s format jpeg -s formatOptions 35.
- notes: Roughness, single channel (grey JPEG). One repeat covers 0.274 x 0.273 m in the source.

### `arena-light-lite.png` (arena.light.lite)

- shipped: 512 x 512 PNG (RGBA8), 281216 bytes, sha256 `d1b889ff7a4af46e30024b16e50d3e9ac8982a5cc50a8d184e58306ab373404c`
- made by this project: a baked light map, no third-party input; licence: CC0-1.0
- inputs: `web/scene/club/arena/room.js`, `web/scene/club/arena/shell.js`, `web/scene/club/arena/shell/`, `web/scene/club/arena/layout.js`, `web/scene/club/room/light.js`, `web/scene/club/room/lightmap.js`, `web/scene/club/arena/rig.js`, `web/scene/club/arena/rig/`, `web/scene/club/arena/surround.js`, `web/scene/club/arena/surround/`, `web/scene/club/arena/floor.js`, `web/scene/club/arena/floor/`
- tool: web/tools/club/bake-room.html + bake-room-scene.mjs + bake-room-core.mjs + bake-room-worker.mjs (compute), web/tools/club/bake-room.mjs (file)
- bake: signature `17f72611ae4fedfd` (levels `79a6d8cd2524e441`), 1 job(s), 23.8 s of page time on 6 workers, host: a Linux x86_64 host, software GL, page mode, browser: HeadlessChrome/151.0.7922.71; file written with node v26.3.1 (zlib 1.2.12)
- baked against: scene content hashes: geometry `a919cad9744ba08a` (shell `fa4e8665e834536d`, props `d81aedd503d2ac5a`, luminaire `01b8762594dd0ba1`, table stand-in `fe44ef85a4c82228`, rig `e0e6300f95d32b84` (8516 triangles), surround `b2d32ff1955c5469` (3948 triangles), floor `440884977784e277` (866 triangles)), emitters `b20032df9f9ca805`, albedo hints `f42622854de33455`; the tree it was written into built exactly that scene; its 31 source files (the inputs above and the bake tool) had the combined sha256 `2852b4612161ccb3267f7069bfc876789d4cbf73b8d6a1c00af5781459e97f61` (per file in credits.json)
- processing: Light map of the arena hall's carpet and backdrop: for each texel of the shell's second UV set, the irradiance of every fixed emitter with soft shadows (CPU ray casting against the hall, the rig, the surround, the floor furniture and the table), bounced light and an occlusion-weighted ambient, and in alpha the visible share of the main lamp. RGB = irradiance / 32 through the sRGB curve with a 4 x 4 ordered dither; 512 x 512 RGBA8 PNG, adaptive row filters, zlib level 6, the bake's record in a tEXt chunk. The same light on a 31 x 12 x 31 grid over the room (six receiver directions per grid point, the same encoding) rides in a private ancillary chunk (rlVo, 276768 bytes before zlib): the furniture reads it. Deterministic: the same tree gives the same bytes.
- notes: No third-party input: geometry, emitters and albedo hints all come from the code listed under inputs. At run time the room refuses the file when the hall's signature (layout version, the lite or full plan, the hall's box, the island, the backdrop, the light-map charts) does not equal the live room, then the analytic light is used; a part (shell, rig, surround, floor furniture) or an emitter that changed since the bake is named in the room's state and the file stays in use. The exact test is the tool's: `node web/tools/club/bake-room.mjs check` rebuilds the room from the tree and compares content hashes of every blocker triangle, the emitter table and the albedo hints with the record in the file; re-bake when it reports a difference. Alpha is data: the loader decodes the PNG itself (web/scene/club/room/lightmap.js), never through an image element or a 2D canvas.

### `arena-env.png` (arena.env)

- shipped: 768 x 252 PNG (RGBA8, RGBE-coded), 309370 bytes, sha256 `32f290b30805f3d04ae2f977b5d98c43db1549ce1b0e271e321d0348629c971e`
- made by this project: a baked picture of its own hall, no third-party input; licence: CC0-1.0
- inputs: `web/scene/club/arena/room.js`, `web/scene/club/arena/shell.js`, `web/scene/club/arena/shell/`, `web/scene/club/arena/layout.js`, `web/scene/club/room/light.js`, `web/scene/club/room/lightmap.js`, `web/scene/club/arena/rig.js`, `web/scene/club/arena/rig/`, `web/scene/club/arena/surround.js`, `web/scene/club/arena/surround/`, `web/scene/club/arena/floor.js`, `web/scene/club/arena/floor/`, `web/assets/club/arena-light.png`
- tool: web/tools/club/bake-room.html + bake-room-env.mjs (capture, chain, coding), web/tools/club/bake-room.mjs (file)
- capture: hall signature `cbcae80195dfa4fd` (levels `a6e57337ab57980d`), under the light map `cbcae80195dfa4fd` / `a6e57337ab57980d` (the file on disk); host: a Linux x86_64 host, software GL, page mode, browser: HeadlessChrome/151.0.7922.71; file written with node v26.3.1 (zlib 1.2.12)
- processing: The arena hall as seen from one point (0, 1.2 m over the floor, 0): six 90-degree views of the hall under its baked light map (no balls, no cue, no haze; the table as a matt stand-in), rendered linear without tone mapping at four times the face's size and averaged into faces of 128 px in the GL cube convention. 6 levels, each the cube through a cosine-power lobe for a roughness (0, 0.15, 0.3, 0.5, 0.75, 1), stacked top to bottom in one 768 x 252 RGBA8 PNG, six faces a row; RGBE (rgb x 2^(A - 136), scene-linear radiance); adaptive row filters, zlib level 6, the record in a tEXt chunk. No cube is rendered at run time.
- notes: No third-party input: a picture of this project's own hall. The env service (web/scene/club/env/hall.js) decodes the PNG itself and refuses a cube whose hall signature is not the light map's. `node web/tools/club/bake-room.mjs check` reads the record and tells whether the cube was captured under the light file on disk.

### `arena-env-lite.png` (arena.env.lite)

- shipped: 384 x 124 PNG (RGBA8, RGBE-coded), 80554 bytes, sha256 `3c57b420af18c02d3601f78e26a37c31743423175ff895292221c5664cc51937`
- made by this project: a baked picture of its own hall, no third-party input; licence: CC0-1.0
- inputs: `web/scene/club/arena/room.js`, `web/scene/club/arena/shell.js`, `web/scene/club/arena/shell/`, `web/scene/club/arena/layout.js`, `web/scene/club/room/light.js`, `web/scene/club/room/lightmap.js`, `web/scene/club/arena/rig.js`, `web/scene/club/arena/rig/`, `web/scene/club/arena/surround.js`, `web/scene/club/arena/surround/`, `web/scene/club/arena/floor.js`, `web/scene/club/arena/floor/`, `web/assets/club/arena-light-lite.png`
- tool: web/tools/club/bake-room.html + bake-room-env.mjs (capture, chain, coding), web/tools/club/bake-room.mjs (file)
- capture: hall signature `17f72611ae4fedfd` (levels `79a6d8cd2524e441`), under the light map `17f72611ae4fedfd` / `79a6d8cd2524e441` (the file on disk); host: a Linux x86_64 host, software GL, page mode, browser: HeadlessChrome/151.0.7922.71; file written with node v26.3.1 (zlib 1.2.12)
- processing: The arena hall as seen from one point (0, 1.2 m over the floor, 0): six 90-degree views of the hall under its baked light map (no balls, no cue, no haze; the table as a matt stand-in), rendered linear without tone mapping at four times the face's size and averaged into faces of 64 px in the GL cube convention. 5 levels, each the cube through a cosine-power lobe for a roughness (0, 0.3, 0.5, 0.75, 1), stacked top to bottom in one 384 x 124 RGBA8 PNG, six faces a row; RGBE (rgb x 2^(A - 136), scene-linear radiance); adaptive row filters, zlib level 6, the record in a tEXt chunk. No cube is rendered at run time.
- notes: No third-party input: a picture of this project's own hall. The env service (web/scene/club/env/hall.js) decodes the PNG itself and refuses a cube whose hall signature is not the light map's. `node web/tools/club/bake-room.mjs check` reads the record and tells whether the cube was captured under the light file on disk.
