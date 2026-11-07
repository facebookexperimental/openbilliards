// Copyright (c) Meta Platforms, Inc. and affiliates.

// sw.js — offline app-shell service worker (branch pwa-standalone).
//
// WHY: iPhone "Add to Home Screen" must launch app.html with zero browser
// chrome (manifest.webmanifest display: standalone) and keep working with
// NO network — the whole runtime-fetched tree lands in one versioned cache
// snapshot: the BOOT set (PRECACHE) at install, the rest (PRECACHE_FILL) by
// a chunked background fill after activation (GH-714: one atomic addAll of
// the whole tree hit Chromium's 5-minute install kill on Slow 3G — the
// worker went redundant, nothing ever activated). Registered from app.html as
// './sw.js', so the scope is the web/ dir in every serving layout (Pages
// /web/, repo-root /web/, web/-alone /).
//
// LAWS this file obeys:
//   * dependency-free vanilla JS — no imports, no build step;
//   * NEVER intercepts cross-origin or non-GET requests (pass-through);
//   * never changes degradation behavior: '../tools/render/grade.json' is
//     404-tolerant in the app (bare web/-alone serve); it is a NORMAL
//     digested fill entry when it existed at generation (a 404 at fill time
//     is one refused entry, a miss falls to the network exactly like the
//     no-SW app) and absent from the manifest otherwise — review r2 ruling:
//     NOTHING enters the snapshot without a digest, there is no optional /
//     digest-less asset class;
//   * cache-poison doctrine (the ownership ledger): exact-URL matching, query
//     INCLUDED — the app's ?v= stylesheet discipline stays load-bearing
//     (an ignoreSearch match would pair a stale cached kit.css with a
//     fresh DOM, the exact defect class the ?v= params exist to kill);
//     ONE consistent snapshot per VERSION: every manifest entry carries
//     its sha256 prefix and EVERY cache write is digest-verified (GH-714:
//     a lazily filled cache spans boots, so a deploy between install and
//     fill must be refused, never mixed in); verification and STORAGE are
//     separate laws (review r1v): a fill miss whose bytes match the ACTIVE
//     manifest is served from the verified buffer even when the snapshot
//     cannot store them (QuotaExceededError — logged, retried by a later
//     fill pass), only a digest MISMATCH is the 503 + update-waiting;
//     no skipWaiting at install and no
//     clients.claim (a mid-session cache swap is a mixed module graph by
//     construction — updates apply between sessions, stale-but-consistent
//     beats fresh-but-mixed); the ONE skipWaiting is the update notice's
//     explicit Reload ({ob:'skip-waiting'}, issue #1047, app/swupdate.js),
//     after which every controlled app page reloads at its
//     controllerchange — a page never runs two generations, with one
//     repaired exception (#1173): a navigation THIS worker serves while the
//     waiting one takes over (the 10 s belt, a reload, another tab) is the
//     old app.html under the new controller with no controllerchange; every
//     module still comes from the new snapshot, and app/swupdate.js
//     verifyGeneration finds the HTML by app.html's data-ob-html id after
//     load and reloads once (when the snapshot copy carries an id, the
//     fetch answers and sessionStorage holds the id pair; otherwise the
//     page stays as it is — the degradation law);
//   * INSTALL BUDGET (GH-714): the boot set installs through LANES-wide
//     pools with a size-aware per-request timeout inside a total budget far
//     under the kill; the fill runs <= CHUNK entries per message-loop turn
//     (LANES <= 12 in flight): its FIRST turn rides activate's waitUntil
//     (review r4 P2 — one bounded chunk, so every activation caches at
//     least that much before the browser may stop the worker), every later
//     turn rides a self-message's waitUntil, a resumed fill never runs
//     ahead of a fetch event (2.5 s deferral), and an incomplete fill
//     resumes on every worker start (the first fetch event) and on every
//     loaded page's {ob:'fill'} re-arm message;
//     fill failures are CLASSIFIED (review r3 P2): 404 / 410 and a digest
//     mismatch are refused for this generation; timeouts, network errors,
//     other non-2xx and store failures stay eligible and retry on the next
//     fetch-armed kick (backoff, <= 5 kicks per worker life) — "fill
//     complete" is logged only when nothing retryable remains;
//   * GENERATION ATOMICITY (review P1): navigations serve from the SAME
//     snapshot as every subresource — a network-first navigation would
//     pair a fresh deploy's HTML with the old snapshot's cache-first
//     modules, the exact mixed-generation graph the contract above
//     forbids. A deploy ships a byte-different sw.js; the browser
//     installs the NEW generation in the background and the swap happens
//     only at activation (last client closed, or the update notice's
//     Reload), never mid-session (the take-over gap: #1173 above);
//   * boot-guard heal cooperation: app.html's one-shot self-heal refetches
//     every seen .js/.css with cache:'reload' — those requests go NETWORK
//     first here and the fresh bytes are written back into the snapshot
//     when their digest matches the manifest, so the heal repairs this
//     cache exactly like the HTTP cache without ever admitting a foreign
//     generation.
//
// VERSION derives from the shipped kernel stamps (web/dist/pool-wasm and
// web/dist/pool-rules glue binaries) plus a sha-256 over every precached
// byte, this file's own bytes outside the AUTOGEN block (a handler-only
// edit must rename the cache too: the new worker's install would otherwise
// addAll fresh server bytes INTO the cache the old active worker is still
// serving — a mid-session generation mix). grade.json is a manifest entry
// like any other, so a grade-only recalibration (a supported pages.yml
// deploy trigger) opens a new generation too — grade data stays
// generation-consistent with the tree it graded. ANY dist rebuild or
// app-tree change MUST regenerate it:
//     node web/tools/gen-sw-precache.mjs        (rewrites the block below
//                                                and app.html's data-ob-html
//                                                id: commit both files)
// scripts/repin-wasm-fixtures.mjs runs that as the final step of the
// canonical-wasm repin ceremony; pages.yml runs `--check` in its build job
// so a stale VERSION/PRECACHE can never ship.

/* >>> AUTOGEN — node web/tools/gen-sw-precache.mjs; do not edit by hand */
const VERSION = '0.1.0+snapshot_rules-0.1.10+snapshot_tree-43c4b0c2';
// [url, sha256 prefix, bytes] — BOOT set: 167 files, 13.31 MB (installed before activation)
const PRECACHE = [
  ['./app.html', 'e97a29fe8769b5f3', 58280],
  ['./manifest.webmanifest', '935296f42db565d1', 561],
  ['./app/aim.js', 'fb572811a883b650', 151614],
  ['./app/aimwidgets.js', 'f427a4a26deeea9a', 48430],
  ['./app/archive.js', '77eeae46b8131182', 26915],
  ['./app/atelier.js', 'e4db12b339a2fee7', 229959],
  ['./app/ballset.js', '65fa99281ef04568', 16642],
  ['./app/camerapresets.js', '5bf5e6802dc8c845', 11505],
  ['./app/camerascript.js', '2ebd1a74be717445', 20557],
  ['./app/cameratrack.js', '2b3dbc7624e6d918', 7620],
  ['./app/coords.js', 'ef20b1d8656b6c94', 1549],
  ['./app/cuepost.js', 'cfb582be55c26578', 120278],
  ['./app/cuepostlive.js', '2a76f4148165e9a9', 21486],
  ['./app/cuestrike.js', '6f8e16e2170c1a25', 25077],
  ['./app/cuevisuals.js', 'f38425667b050c31', 4451],
  ['./app/drills/catalog.js', '2b56e92a6c6c2edb', 65464],
  ['./app/drills.js', '2a5e0113198dd0cf', 176168],
  ['./app/export-audio.js', '3dcb826a523efa60', 19951],
  ['./app/export-resume.js', '4c68d6aaf6f35d28', 11409],
  ['./app/export.js', 'adbe42cbf5e65cf9', 94111],
  ['./app/flow.js', '44acf7645341d896', 250616],
  ['./app/framestep.js', '4d79925ab8391bd8', 11783],
  ['./app/game.js', '69131a05daeed074', 158683],
  ['./app/help.js', 'bb6851ad119a4cc8', 35366],
  ['./app/hud.js', '65575b60ace0c0ed', 81336],
  ['./app/i18n.js', 'eebe412369aaa41b', 11517],
  ['./app/inputclock.js', '10b3c712206593b4', 1233],
  ['./app/locales/boot.js', '8fb92d33acc044bb', 860],
  ['./app/locales/de.json', '1db2d655b8d44ac3', 89134],
  ['./app/locales/en.json', '93d9a07e98271ad8', 82682],
  ['./app/locales/es.json', 'f3f206ab3aa3a4e1', 89593],
  ['./app/locales/fr.json', '1d7ec114f5499135', 91561],
  ['./app/locales/ja.json', '580bc2550c12cd36', 102989],
  ['./app/locales/ko.json', 'ed05b8568806edb1', 93826],
  ['./app/locales/zh-CN.json', '889a4846fc777833', 83225],
  ['./app/main.js', 'b55ba95ee86eeb59', 247704],
  ['./app/offline-render.js', '3879fd4000e2bb6a', 196656],
  ['./app/orbit.js', 'b9a3b0a824670c00', 5504],
  ['./app/play.js', '42fb49a760776d5e', 102896],
  ['./app/playback-strip.js', '7fd54f7ad8dbc1c5', 50005],
  ['./app/playback.js', '835aff43070dffe8', 681371],
  ['./app/povpose.js', '33a80c9036106468', 5992],
  ['./app/practice.js', '43d1318f02711608', 54540],
  ['./app/preview-compute.js', '9eb42d4f9aa6704e', 10620],
  ['./app/preview-worker.js', '78d621708af91b82', 1385],
  ['./app/preview.js', '4a221f2e2d3152d0', 33428],
  ['./app/previewink.js', 'cbdca29495a23eef', 126632],
  ['./app/record.js', '6b63e7efaab97bf0', 23438],
  ['./app/replays.js', '527b5c643db08f74', 87413],
  ['./app/rollcorrect.js', 'f7e8771dc4e55622', 26072],
  ['./app/settings.js', '1a2ddeac6b28cc9c', 228239],
  ['./app/share.js', '5967f3be892d92be', 103574],
  ['./app/shell.js', '0ba30e97881148f9', 210098],
  ['./app/shellmover.js', 'faf34bcae9fd36a7', 10412],
  ['./app/sinkpivot.js', 'c8a1b5d6e850bacc', 36326],
  ['./app/sound.js', 'ff3a7722141532e7', 14448],
  ['./app/state.js', 'c921b2bb321d6097', 2787],
  ['./app/strikeglyph.js', '0668d451e036f103', 14227],
  ['./app/swupdate.js', '486af2b3e22ded84', 11930],
  ['./app/synth.js', '745a66976d4c21eb', 25030],
  ['./app/touch.js', 'da4b65fd8ab7dab3', 66277],
  ['./app/touchwidgets.js', 'd0fd2edf48f4c176', 51045],
  ['./app/ui/atelier.css?v=059', '33053bd0fbc434b6', 151702],
  ['./app/ui/cardrail.js', '086bb64611c4d516', 12881],
  ['./app/ui/controls.js', '2682f87cb18438bc', 30035],
  ['./app/ui/dialog.js', '32c407765cd6ff3f', 27680],
  ['./app/ui/drills.css?v=22', 'b106df4dea6d8985', 25114],
  ['./app/ui/foldsnap.js', 'eabd7e334d5f1c83', 37513],
  ['./app/ui/help.css?v=8', 'a189f4e4ce64e37e', 10693],
  ['./app/ui/icons.js', '7addf00a3c3614c4', 15449],
  ['./app/ui/keygate.js', 'bf3f1cfad1a82d7e', 2859],
  ['./app/ui/kit.css?v=043', '712718c254c2ccac', 98994],
  ['./app/ui/modes.css?v=5', '9ef7a16516db20df', 4930],
  ['./app/ui/motion.js', '00a726e9baa7f574', 11545],
  ['./app/ui/navmodal.js', 'ef03808867cc1a73', 14346],
  ['./app/ui/play.css?v=023', 'f6ba332cbf9dfa09', 38494],
  ['./app/ui/playback.css?v=56', '03811e8f6e4bd6a1', 85624],
  ['./app/ui/practice.css?v=015', '25e4b1ea8da7e2d4', 16260],
  ['./app/ui/replays.css?v=018', '96e54902f10ea4b4', 17113],
  ['./app/ui/scrollfade.js', '671d2a9f23c64416', 19427],
  ['./app/ui/select.js', 'dcf74232bd2ddad8', 18570],
  ['./app/ui/settings-modal.css?v=032', '85938e35a1a81d51', 29133],
  ['./app/ui/shell.css?v=027', '6d0ffeb5ff88c9f6', 30866],
  ['./app/ui/strip.js', '8bc80639cb36a8b3', 11105],
  ['./app/ui/tokens.css?v=016', '843be65abce318c0', 17891],
  ['./app/ui/touch.css?v=041', 'a4759a59d266ae1d', 79384],
  ['./scene/ballreturn/assembly.js', '6255575712bc3f45', 5945],
  ['./scene/ballreturn/furniture.js', '3856597b6b24389a', 54184],
  ['./scene/ballreturn/hardware.js', '17429d860556b7c5', 5636],
  ['./scene/ballreturn/index.js', 'f428687486117acd', 129691],
  ['./scene/ballreturn/jsonschema.js', '818ae3f5501c79ab', 8254],
  ['./scene/ballreturn/kinematics.js', '2d7939b816ac316f', 223233],
  ['./scene/ballreturn/schema.js', '6674d580d8c034a1', 35074],
  ['./scene/ballreturn/tableid.js', 'e9c10a03cd58b2f8', 2219],
  ['./scene/ballreturn/track-schema.js', 'a5b27b12d95f5c31', 23392],
  ['./scene/ballreturn/track.js', '7f66aa33cf474b23', 113013],
  ['./scene/balls.js', '5f13659ee0f400ca', 21250],
  ['./scene/clothvisuals.js', '240abd24ba418a5f', 51245],
  ['./scene/cn8-boot-copy.js', '8fb92d33acc044bb', 860],
  ['./scene/cn8furniture.js', 'd111ee7ffe8b077e', 19077],
  ['./scene/cn8mid.js', '84a4835cfbc9ecc3', 24597],
  ['./scene/cn8midlaw.js', '3601d45565c7c2fa', 4324],
  ['./scene/cn8pockets.js', '7c758c77f6eb9ef5', 12459],
  ['./scene/cn8ringtex.js', '94b79c2486c1b997', 287404],
  ['./scene/cuelooks.js', '0c88479e43ebcec3', 94789],
  ['./scene/cuestick.js', '2f877d6ce28eb5cf', 116707],
  ['./scene/diamondproam_corner.js', '22a8e16a97536e01', 10572],
  ['./scene/diamondproam_nose.js', '6e350377b4f5b2d7', 1453],
  ['./scene/equipmentalias.js', '640edc7e76882ef2', 2473],
  ['./scene/gi.js', 'd4c6ccacec819d14', 64815],
  ['./scene/lampfade.js', '3ca5079048e2cca1', 14623],
  ['./scene/lightingvisuals.js', '582ec44dd83db05e', 185741],
  ['./scene/look.js', 'e1084b105cbb864b', 18658],
  ['./scene/ltcsheen.js', '959428484a6eb354', 12596],
  ['./scene/occlusionlut.js', 'bafb101f652f152c', 43301],
  ['./scene/postfx.js', '1fa34f0b2e3442cd', 9470],
  ['./scene/room.js', '2b27a6bcf5535ef8', 41691],
  ['./scene/shading.js', 'adf2a4385146b013', 182775],
  ['./scene/table.js', '9bd28a87faf2fe37', 2707104],
  ['./scene/tablesoil.js', '52c448fb63ee0cdf', 10319],
  ['./scene/venueflag.js', '7e480743bd0e67ae', 2377],
  ['./vendor/jsm/lights/RectAreaLightTexturesLib.js', '438c9aa76f101f1f', 314097],
  ['./vendor/jsm/lights/RectAreaLightUniformsLib.js', 'b35b74887bd558a0', 516],
  ['./vendor/jsm/postprocessing/EffectComposer.js', 'd234e578618fa816', 4651],
  ['./vendor/jsm/postprocessing/MaskPass.js', '328cf7db0da5d9be', 2231],
  ['./vendor/jsm/postprocessing/OutputPass.js', '32f879d217908767', 2524],
  ['./vendor/jsm/postprocessing/Pass.js', 'b3c6128340eaa37e', 1706],
  ['./vendor/jsm/postprocessing/RenderPass.js', '6c9b8a539ea16e89', 1941],
  ['./vendor/jsm/postprocessing/ShaderPass.js', '3b28a1ee27e0eb96', 1576],
  ['./vendor/jsm/postprocessing/UnrealBloomPass.js', '3bd23a1097af75c7', 12410],
  ['./vendor/jsm/shaders/CopyShader.js', '4e3346db194db56a', 571],
  ['./vendor/jsm/shaders/LuminosityHighPassShader.js', '9f4866f9abb2d96f', 1147],
  ['./vendor/jsm/shaders/OutputShader.js', '4944cecd49c0d4d1', 1490],
  ['./vendor/mp4-muxer/mp4-muxer.mjs', '85cce0ddfe195f61', 71860],
  ['./vendor/three.module.min.js', '08fd7545d13d2c7f', 691648],
  ['./vendor/webm-muxer/webm-muxer.mjs', '53710543cecc4db7', 64944],
  ['./dist/pool-rules/pool_rules_bg.wasm', 'c372512ce636f807', 863551],
  ['./dist/pool-rules/pool_rules.js', 'a72c81e2ac681dc1', 14718],
  ['./dist/pool-sdk/catalog.js', 'c0e5145883718324', 91123],
  ['./dist/pool-sdk/engine.js', '38308fff3e30fc70', 8221],
  ['./dist/pool-sdk/games/catalog.js', '41f6d5eab88dae19', 45917],
  ['./dist/pool-sdk/games/index.js', '1e0460091ebc1bef', 311],
  ['./dist/pool-sdk/games/layouts.js', 'c5e6689aa32952b0', 1730],
  ['./dist/pool-sdk/games/rack.js', '1583fad544d6b497', 10140],
  ['./dist/pool-sdk/index.js', '20827eeeb2d35ebc', 949],
  ['./dist/pool-sdk/record.js', '4e62a8b615100704', 10022],
  ['./dist/pool-sdk/rules/backend.js', 'dcc17f505eba91db', 4792],
  ['./dist/pool-sdk/rules/carom3c.js', 'ec465fe9c8808790', 2405],
  ['./dist/pool-sdk/rules/eightball.js', 'a5898b60e2a4fda5', 1208],
  ['./dist/pool-sdk/rules/errors.js', '5b258b04abbb2782', 1056],
  ['./dist/pool-sdk/rules/fourteenone.js', 'ce33a6963b60978e', 1394],
  ['./dist/pool-sdk/rules/heyball.js', '2aaf80105af6cddb', 884],
  ['./dist/pool-sdk/rules/index.js', '9761e8d2885836e3', 7743],
  ['./dist/pool-sdk/rules/nineball.js', '2d3f6c843d5e0b4c', 1882],
  ['./dist/pool-sdk/rules/onepocket.js', 'de7ebfd955236d9f', 2065],
  ['./dist/pool-sdk/rules/respot.js', 'dd4f6bb34c469e79', 15614],
  ['./dist/pool-sdk/rules/snooker.js', 'e0fa87e9bd5a43ce', 990],
  ['./dist/pool-sdk/rules/tenball.js', '80285494448f1c11', 889],
  ['./dist/pool-sdk/sampler.js', '1a5deddd6156b502', 2628],
  ['./dist/pool-sdk/scenario.js', '3a23b8f0e0068b8f', 13085],
  ['./dist/pool-sdk/share.js', 'bafbb300a964471c', 65399],
  ['./dist/pool-sdk/shot.js', '7113459c7406da12', 12624],
  ['./dist/pool-sdk/types.js', '725c394dfe2ed0da', 646],
  ['./dist/pool-wasm/pool_wasm_bg.wasm', '677a354817ea1b0b', 820244],
  ['./dist/pool-wasm/pool_wasm.js', '1462a10290440d18', 20354],
  ['./assets/gi/gi-manifest.json', 'ecab92a101283994', 21035],
  ['./assets/gi/gi-tournament-probes.json', '3afc16712c6e70c7', 16177],
];
// FILL set: 239 files, 20.43 MB (background fill after activation)
const PRECACHE_FILL = [
  ['./app/ateliercue.js', '69a30d5536c617a6', 57746],
  ['./app/bugreport.js', '3de2f21527c9ce25', 10082],
  ['./app/cinelight.js', '626906a7d32efe64', 18564],
  ['./app/cuethumbs.js', '0430d4aa84f4cf2e', 6747],
  ['./app/haptics.js', '94f0d54c9fabe6f5', 5067],
  ['./app/icons/apple-touch-icon.png', '801b1afbb5f0be25', 2977],
  ['./app/icons/icon-192.png', '1f822fb8e3dc44f9', 6701],
  ['./app/icons/icon-512.png', '18215ee9e900201c', 22534],
  ['./app/transcode.js', '741760320904a94e', 31796],
  ['./app/ui/switchprogress.css?v=002', '60c9bf119ce188b1', 3668],
  ['./app/ui/switchprogress.js', 'e9dec08b9450a214', 14870],
  ['./app/ui/swupdate.css?v=001', '45ccc88c2800d4c5', 2472],
  ['./scene/ballreturn/assemblies/pool_pro_9ft_k55.json', '9c313bdc70e0f416', 15058],
  ['./scene/ballreturn/assemblies/pool_pro_9ft.json', '80781f4501a92dc7', 25791],
  ['./scene/ballreturn/assemblies/wpa_generic_9ft.json', 'f072b7273b886651', 2353],
  ['./scene/ballreturn/assemblies/wpbsa_snooker_12ft.json', '28fd195576f296fe', 20711],
  ['./scene/ballreturn/debugvisual.js', '72c8745751887108', 4915],
  ['./scene/ballreturn/design-worker.js', 'c7c41a1fe78a3a8e', 1285],
  ['./scene/ballreturn/hardware/diamond_proam_9ft-gully.json', 'd353416bdef6df6c', 10956],
  ['./scene/ballreturn/hardware/wpbsa_snooker_12ft-xw101-slides.json', '351aeeebcce03857', 7663],
  ['./scene/ballreturn/proposals/wpbsa_snooker_12ft-xw101-slides.proposal.json', '9e1f7fe25fecb2e6', 26210],
  ['./scene/ballreturn/tracks/diamond_proam_9ft-gully.json', 'aa342ec3edcd8c93', 20055],
  ['./scene/ballreturn/tracks/TEST-alias-diamond-wire-slide.json', '3ab10b8cb71328a2', 8265],
  ['./scene/ballreturn/tracks/TEST-bend-90.json', 'f9191d8487889296', 7559],
  ['./scene/ballreturn/tracks/TEST-crossing-wire-slide.json', 'c1748c12dfcc1cbf', 9141],
  ['./scene/ballreturn/tracks/TEST-hairpin-170.json', 'c77a9b6b62d0b559', 7488],
  ['./scene/ballreturn/tracks/TEST-midedge-landing.json', 'f8a705fa970d5bce', 10454],
  ['./scene/ballreturn/tracks/TEST-obtuse-merge.json', '6c834be02c2a7c8d', 10698],
  ['./scene/ballreturn/tracks/TEST-shallow-merge.json', '5242b70561f18cf9', 9996],
  ['./scene/ballreturn/tracks/TEST-synthetic-wire-slide.json', '8eaf816e594ded26', 9180],
  ['./scene/ballreturn/tracks/TEST-terminal-chutes-high.json', 'f48e4f4b80e5e4e3', 8548],
  ['./scene/ballreturn/tracks/TEST-terminal-chutes.json', '63019a37be6f4cbd', 10767],
  ['./scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json', 'f91171b3af501432', 41673],
  ['./scene/cn8transport-codec.js', '3697eafe5ca3b1ec', 3330],
  ['./scene/cn8transport-core.js', '0722fc164c55bb57', 8523],
  ['./scene/cn8transport-data.js', '0b0fc8ad358e3d88', 4998784],
  ['./scene/cn8transport.js', '8ba538a6043e92cf', 4591],
  ['./scene/snktransport-data.js', 'e03d3e855c714585', 668179],
  ['./scene/snktransport.js', '53ff745255bc5349', 2724],
  ['./vendor/fonts/InterVariable-subset.woff2', '6729dfb89cf83319', 99732],
  ['./vendor/fonts/SpaceGroteskVariable-latin.woff2', '0640890476fc1198', 22288],
  ['./assets/cloth/terlenka_nor_gl_512.png', '7f1bb64c4a0d1e54', 501803],
  ['./assets/cloth/traffic_128x256.png', '076f8bb7f776245c', 40028],
  ['./assets/cloth/traffic.json', '674b0cee2db484c8', 7250],
  ['./assets/cues/break_phenolic.png', '96dd12746f2cdf45', 11330],
  ['./assets/cues/carbon_ld.png', '35655005172d7376', 6270],
  ['./assets/cues/carom_conical.png', '4206807e883edbba', 10579],
  ['./assets/cues/jump_phenolic.png', 'd0eed79b0b6e0fdc', 11533],
  ['./assets/cues/low_deflection.png', 'ff4b71ee25873c16', 10352],
  ['./assets/cues/masse_trick_dwell.png', '8938f13f321705fc', 10518],
  ['./assets/cues/masse_trick.png', '74d015cb182bec1f', 10481],
  ['./assets/cues/pro_ld_pivot_101.png', 'ff4b71ee25873c16', 10352],
  ['./assets/cues/pro_ld_pivot_118.png', 'ff4b71ee25873c16', 10352],
  ['./assets/cues/pro_ld_pivot_141.png', 'ff4b71ee25873c16', 10352],
  ['./assets/cues/snooker_ash.png', '7952accf1229780b', 10096],
  ['./assets/cues/sprites/break_phenolic.png', 'e356473fdccec21d', 334838],
  ['./assets/cues/sprites/carbon_ld.png', '04be9bf229b00dcb', 126465],
  ['./assets/cues/sprites/carom_conical.png', '426d16b0a61f58f6', 329276],
  ['./assets/cues/sprites/jump_phenolic.png', 'b1bd364f36ba1f70', 350425],
  ['./assets/cues/sprites/low_deflection.png', 'ffb88f3105709a74', 310751],
  ['./assets/cues/sprites/masse_trick_dwell.png', '421a4cc2379e470e', 304043],
  ['./assets/cues/sprites/masse_trick.png', '46e18dea0d8b0c77', 304015],
  ['./assets/cues/sprites/pro_ld_pivot_101.png', 'ffb88f3105709a74', 310751],
  ['./assets/cues/sprites/pro_ld_pivot_118.png', 'ffb88f3105709a74', 310751],
  ['./assets/cues/sprites/pro_ld_pivot_141.png', 'ffb88f3105709a74', 310751],
  ['./assets/cues/sprites/snooker_ash.png', 'd7c0f722c759f59c', 295023],
  ['./assets/cues/sprites/standard_dime_tip.png', '3e714d5b58e476a8', 287333],
  ['./assets/cues/sprites/standard.png', '3e714d5b58e476a8', 287333],
  ['./assets/cues/standard_dime_tip.png', '00322dea8b4312c4', 10315],
  ['./assets/cues/standard.png', '00322dea8b4312c4', 10315],
  ['./assets/gi/gi-default-carom_284-carom_luminaire-flank.png', '5a1af2e2f692f088', 79899],
  ['./assets/gi/gi-default-carom_284-carom_luminaire-floor.png', 'b8723d625d3676e4', 35373],
  ['./assets/gi/gi-default-carom_284-carom_luminaire-floorshadow.png', '05c5b2a8d5696fa2', 8984],
  ['./assets/gi/gi-default-carom_284-carom_luminaire-plan.png', 'c342cdca75bbeac0', 57168],
  ['./assets/gi/gi-default-carom_284-carom_luminaire-probes.json', '47696a91ab1be1c6', 17278],
  ['./assets/gi/gi-default-carom_284-flank.png', 'c825baad58f27023', 82200],
  ['./assets/gi/gi-default-carom_284-floor.png', 'f91139f0bb7ebdc1', 36310],
  ['./assets/gi/gi-default-carom_284-floorshadow.png', '75749f9a08028f4c', 9276],
  ['./assets/gi/gi-default-carom_284-plan.png', '44f57e6a63e3f13f', 60315],
  ['./assets/gi/gi-default-carom_284-probes.json', 'c21539838e7c5b29', 17728],
  ['./assets/gi/gi-default-chinese8_9ft-flank.png', 'ccbd7b29661d5a9a', 86361],
  ['./assets/gi/gi-default-chinese8_9ft-floor.png', '46c25d2edb0b82c7', 44198],
  ['./assets/gi/gi-default-chinese8_9ft-floorshadow.png', '30c3e4dd2eea0136', 8401],
  ['./assets/gi/gi-default-chinese8_9ft-joy_lowrect-flank.png', 'fed59f097a3f0b9a', 83145],
  ['./assets/gi/gi-default-chinese8_9ft-joy_lowrect-floor.png', '76761e17356b2c8a', 42386],
  ['./assets/gi/gi-default-chinese8_9ft-joy_lowrect-floorshadow.png', '85e6d138755e0776', 6504],
  ['./assets/gi/gi-default-chinese8_9ft-joy_lowrect-plan.png', '5c3f64e9ab58158e', 57425],
  ['./assets/gi/gi-default-chinese8_9ft-joy_lowrect-probes.json', 'f100d3b1771a737c', 17435],
  ['./assets/gi/gi-default-chinese8_9ft-plan.png', '333e294942204564', 60957],
  ['./assets/gi/gi-default-chinese8_9ft-probes.json', '52a9ef7e985789e7', 17692],
  ['./assets/gi/gi-default-flank.png', 'b4d58a36d298bb7a', 98295],
  ['./assets/gi/gi-default-floor.png', 'a70a294934a633c4', 36412],
  ['./assets/gi/gi-default-floorshadow.png', '2221b28c5fcead1a', 8869],
  ['./assets/gi/gi-default-pdt_studio-flank.png', 'ec7b72496db24883', 98653],
  ['./assets/gi/gi-default-pdt_studio-floor.png', 'dd8e36d65f626545', 36957],
  ['./assets/gi/gi-default-pdt_studio-floorshadow.png', 'b59b1a44f0d7684f', 7979],
  ['./assets/gi/gi-default-pdt_studio-plan.png', '0c1c11c1b31a9466', 80228],
  ['./assets/gi/gi-default-pdt_studio-probes.json', 'fcf1990020037da9', 16052],
  ['./assets/gi/gi-default-plan.png', '36da0e7c14b62e37', 76075],
  ['./assets/gi/gi-default-pool_7ft-flank.png', '8cf385851ed0af34', 103537],
  ['./assets/gi/gi-default-pool_7ft-floor.png', '4bf4f7fa090561dc', 31981],
  ['./assets/gi/gi-default-pool_7ft-floorshadow.png', '5c9aa5b4024926ef', 7452],
  ['./assets/gi/gi-default-pool_7ft-plan.png', 'edb1a389c6674f3d', 81210],
  ['./assets/gi/gi-default-pool_7ft-probes.json', 'be13fd653f02666b', 16174],
  ['./assets/gi/gi-default-pool_8ft-flank.png', 'cba4ae5e2b6e73de', 105223],
  ['./assets/gi/gi-default-pool_8ft-floor.png', '73bef1066d1e0902', 34294],
  ['./assets/gi/gi-default-pool_8ft-floorshadow.png', '2edb68739f121283', 8118],
  ['./assets/gi/gi-default-pool_8ft-plan.png', '20998533b8b944e4', 80386],
  ['./assets/gi/gi-default-pool_8ft-probes.json', 'ac34f1b595d2806b', 16151],
  ['./assets/gi/gi-default-probes.json', 'd06806a3affbfe19', 16190],
  ['./assets/gi/gi-default-snooker_12ft-flank.png', '106b5657ad68131e', 76240],
  ['./assets/gi/gi-default-snooker_12ft-floor.png', '2d3cba5361a7fc3d', 53470],
  ['./assets/gi/gi-default-snooker_12ft-floorshadow.png', '39c698f39ab36e0d', 11641],
  ['./assets/gi/gi-default-snooker_12ft-plan.png', 'f4dfa89ed8f92b74', 54211],
  ['./assets/gi/gi-default-snooker_12ft-probes.json', '95b49321483061ad', 29665],
  ['./assets/gi/gi-default-snooker_12ft-snooker_luminaire-flank.png', 'ff3aa0299a921f32', 67323],
  ['./assets/gi/gi-default-snooker_12ft-snooker_luminaire-floor.png', '2b8d5a4cddf8162e', 51171],
  ['./assets/gi/gi-default-snooker_12ft-snooker_luminaire-floorshadow.png', 'efb3f2d1210836f7', 9945],
  ['./assets/gi/gi-default-snooker_12ft-snooker_luminaire-plan.png', 'f1476fd3e98e1d28', 45811],
  ['./assets/gi/gi-default-snooker_12ft-snooker_luminaire-probes.json', 'e7057aebe5e5d1ab', 28037],
  ['./assets/gi/gi-tournament-carom_284-carom_luminaire-flank.png', 'fdbc9ab5924c1a35', 79181],
  ['./assets/gi/gi-tournament-carom_284-carom_luminaire-floor.png', 'dc78da77cf6f5b46', 36009],
  ['./assets/gi/gi-tournament-carom_284-carom_luminaire-floorshadow.png', '05c5b2a8d5696fa2', 8984],
  ['./assets/gi/gi-tournament-carom_284-carom_luminaire-plan.png', 'a6d134097317e5b6', 57430],
  ['./assets/gi/gi-tournament-carom_284-carom_luminaire-probes.json', '5d00c0f7b8894ff5', 17293],
  ['./assets/gi/gi-tournament-carom_284-flank.png', 'c8ba9edc4c8b1de4', 80388],
  ['./assets/gi/gi-tournament-carom_284-floor.png', 'd30b94a0567f6a48', 36613],
  ['./assets/gi/gi-tournament-carom_284-floorshadow.png', '75749f9a08028f4c', 9276],
  ['./assets/gi/gi-tournament-carom_284-plan.png', '0669b2f153751916', 60788],
  ['./assets/gi/gi-tournament-carom_284-probes.json', '418e44ae62986041', 17674],
  ['./assets/gi/gi-tournament-chinese8_9ft-flank.png', '0003414829ccd853', 87172],
  ['./assets/gi/gi-tournament-chinese8_9ft-floor.png', '141509b76205ea7e', 44939],
  ['./assets/gi/gi-tournament-chinese8_9ft-floorshadow.png', '30c3e4dd2eea0136', 8401],
  ['./assets/gi/gi-tournament-chinese8_9ft-joy_lowrect-flank.png', 'bd6244ffa6ae3195', 84339],
  ['./assets/gi/gi-tournament-chinese8_9ft-joy_lowrect-floor.png', 'e2dc6b23097a9e63', 42391],
  ['./assets/gi/gi-tournament-chinese8_9ft-joy_lowrect-floorshadow.png', '85e6d138755e0776', 6504],
  ['./assets/gi/gi-tournament-chinese8_9ft-joy_lowrect-plan.png', '59d7e53631b4cf9a', 62843],
  ['./assets/gi/gi-tournament-chinese8_9ft-joy_lowrect-probes.json', 'aa834bb8f975cebe', 17430],
  ['./assets/gi/gi-tournament-chinese8_9ft-plan.png', 'fcbb2a5d9460d42b', 61844],
  ['./assets/gi/gi-tournament-chinese8_9ft-probes.json', 'a19dae674ee72d6d', 17618],
  ['./assets/gi/gi-tournament-flank.png', 'cac624cc61df021f', 105769],
  ['./assets/gi/gi-tournament-floor.png', 'cbcc251e2645a55c', 36270],
  ['./assets/gi/gi-tournament-floorshadow.png', '2221b28c5fcead1a', 8869],
  ['./assets/gi/gi-tournament-pdt_studio-flank.png', 'f13ef938e64af641', 102711],
  ['./assets/gi/gi-tournament-pdt_studio-floor.png', 'ddaa09ccbfae70a6', 36120],
  ['./assets/gi/gi-tournament-pdt_studio-floorshadow.png', 'b59b1a44f0d7684f', 7979],
  ['./assets/gi/gi-tournament-pdt_studio-plan.png', '4920acd4d8c8b67b', 79098],
  ['./assets/gi/gi-tournament-pdt_studio-probes.json', '6a27a2c6a5b57959', 16026],
  ['./assets/gi/gi-tournament-plan.png', 'a3f1bce38265071a', 78191],
  ['./assets/gi/gi-tournament-pool_7ft-flank.png', '6ad80f6568bb782a', 109633],
  ['./assets/gi/gi-tournament-pool_7ft-floor.png', '3e067adae42b5945', 33006],
  ['./assets/gi/gi-tournament-pool_7ft-floorshadow.png', '5c9aa5b4024926ef', 7452],
  ['./assets/gi/gi-tournament-pool_7ft-plan.png', 'bf68e13b2448a162', 82875],
  ['./assets/gi/gi-tournament-pool_7ft-probes.json', '1637d7e1c0fce867', 16099],
  ['./assets/gi/gi-tournament-pool_8ft-flank.png', 'b23e2884e68ae42d', 106323],
  ['./assets/gi/gi-tournament-pool_8ft-floor.png', 'c566f05c242d3ea3', 34342],
  ['./assets/gi/gi-tournament-pool_8ft-floorshadow.png', '2edb68739f121283', 8118],
  ['./assets/gi/gi-tournament-pool_8ft-plan.png', '7e8ab06dbab3c88c', 80128],
  ['./assets/gi/gi-tournament-pool_8ft-probes.json', '8cb2a26ec8b34d0b', 16090],
  ['./assets/gi/gi-tournament-snooker_12ft-flank.png', '9f810b8080d719fb', 77961],
  ['./assets/gi/gi-tournament-snooker_12ft-floor.png', 'dc59ca942df57817', 55503],
  ['./assets/gi/gi-tournament-snooker_12ft-floorshadow.png', '39c698f39ab36e0d', 11641],
  ['./assets/gi/gi-tournament-snooker_12ft-plan.png', 'b75e0e45e536fa35', 55971],
  ['./assets/gi/gi-tournament-snooker_12ft-probes.json', '0c2c71215a90607a', 29604],
  ['./assets/gi/gi-tournament-snooker_12ft-snooker_luminaire-flank.png', 'cac24a8d97eb1963', 68456],
  ['./assets/gi/gi-tournament-snooker_12ft-snooker_luminaire-floor.png', '8a1310c220ba1b14', 52954],
  ['./assets/gi/gi-tournament-snooker_12ft-snooker_luminaire-floorshadow.png', 'efb3f2d1210836f7', 9945],
  ['./assets/gi/gi-tournament-snooker_12ft-snooker_luminaire-plan.png', '7840e64fe1e66e0e', 48471],
  ['./assets/gi/gi-tournament-snooker_12ft-snooker_luminaire-probes.json', '2a67a7271400363b', 27946],
  ['./assets/sfx/click-h1.wav', '15c75e6428ead866', 44144],
  ['./assets/sfx/click-h2.wav', 'e170f658a96ff64f', 44144],
  ['./assets/sfx/click-h3.wav', '0e16f18c7d07da32', 44144],
  ['./assets/sfx/click-h4.wav', '7bcfbc7a9f94570a', 44144],
  ['./assets/sfx/click-m1.wav', '6c87e6e4b97bb9db', 44144],
  ['./assets/sfx/click-m2.wav', '6e6de3b14432c89f', 44144],
  ['./assets/sfx/click-m3.wav', '25e4ecbc08256a8e', 44144],
  ['./assets/sfx/click-m4.wav', '553dd5b679c18c37', 10654],
  ['./assets/sfx/click-s1.wav', '4d9ce3c89afdf3fa', 44144],
  ['./assets/sfx/click-s2.wav', '55d5b0ba572d5ad8', 44144],
  ['./assets/sfx/click-s3.wav', '434c3acfea2b8f47', 11660],
  ['./assets/sfx/click-s4.wav', '7985fa563315e757', 44144],
  ['./assets/sfx/cue-h1.wav', '457897e07355ec58', 28974],
  ['./assets/sfx/cue-h2.wav', '506ee3cae4659cfb', 28886],
  ['./assets/sfx/cue-h3.wav', 'e15a6bd943e8df0e', 39116],
  ['./assets/sfx/cue-h4.wav', '08cfc5ffaea8f3b9', 30738],
  ['./assets/sfx/cue-m1.wav', '91806172906b6ba1', 40334],
  ['./assets/sfx/cue-m2.wav', '4dd77e090393dfda', 38944],
  ['./assets/sfx/cue-m3.wav', '5ad4aaeef3d34e91', 39382],
  ['./assets/sfx/cue-m4.wav', '639229000c92e912', 39218],
  ['./assets/sfx/cushion-h1.wav', '5641abcec3d71128', 26504],
  ['./assets/sfx/cushion-h2.wav', 'ec9c01399e1cab24', 26504],
  ['./assets/sfx/cushion-h3.wav', '641168480f09a1cd', 26504],
  ['./assets/sfx/cushion-h4.wav', '9111013150bbc281', 26504],
  ['./assets/sfx/cushion-m1.wav', '860c3937fc81fffb', 26504],
  ['./assets/sfx/cushion-m2.wav', '34e7f3aba61c2318', 26504],
  ['./assets/sfx/cushion-m3.wav', 'b69b90a3281fef35', 25916],
  ['./assets/sfx/cushion-m4.wav', 'd82f6ffc52c54f16', 26504],
  ['./assets/sfx/cushion-s1.wav', 'ab90c5de25748af0', 26504],
  ['./assets/sfx/cushion-s2.wav', '2b28cc6b9f844d96', 21078],
  ['./assets/sfx/cushion-s3.wav', '0f45166c38a4cf26', 20460],
  ['./assets/sfx/cushion-s4.wav', '69bd1f3f67add0a0', 18404],
  ['./assets/sfx/pocket-d1.wav', '0560f23bd8deaf73', 48712],
  ['./assets/sfx/pocket-d2.wav', 'da1d275fb7e84e95', 51784],
  ['./assets/sfx/pocket-d3.wav', '15f1c27754e85f8c', 105884],
  ['./assets/sfx/pocket-d4.wav', 'f3ced87776fee600', 14980],
  ['./assets/sfx/pocket-r1.wav', '3fb7e340b28fdbcf', 13620],
  ['./assets/sfx/pocket-r2.wav', '9487c0702cb2dd28', 10994],
  ['./assets/sfx/pocket-r3.wav', '12dacdec7be58f59', 12020],
  ['./assets/stations/balls/carom.webp', '5536076478cc5d5c', 190882],
  ['./assets/stations/balls/pool_black_cap.webp', '86e36d598c730e27', 195388],
  ['./assets/stations/balls/pool_ivory_gunsight.webp', '55ee53ba54d3c311', 197760],
  ['./assets/stations/balls/pool_standard.webp', '27b8c2b909c615cd', 197542],
  ['./assets/stations/balls/pool_used.webp', '27b8c2b909c615cd', 197542],
  ['./assets/stations/balls/snooker.webp', 'f92ee304be35ccc2', 253082],
  ['./assets/stations/cloths/carom_worsted_heated.png', 'f6c8c6d0f7d90ee2', 36207],
  ['./assets/stations/cloths/pool_worsted_fast.png', '6a42b09324557adc', 49270],
  ['./assets/stations/cloths/pool_worsted_measured.png', '6a42b09324557adc', 49270],
  ['./assets/stations/cloths/pool_worsted_new.png', '6a42b09324557adc', 49270],
  ['./assets/stations/cloths/snooker_napped.png', 'dd0950bdffac4d62', 58590],
  ['./assets/stations/cloths/worn_slow.png', '08e6626501f78a74', 31225],
  ['./assets/stations/lighting/canopy_panel.webp', 'dc3baeee617737a7', 130352],
  ['./assets/stations/lighting/carom_luminaire.webp', '34a048b475d4713d', 120416],
  ['./assets/stations/lighting/pendant_bar.webp', 'cbd52d3dc7dc3a43', 139946],
  ['./assets/stations/lighting/perimeter_ring.webp', '935fa1d80d9ae325', 162656],
  ['./assets/stations/lighting/snooker_luminaire.webp', '5be884419cdeee62', 109056],
  ['./assets/stations/tables/chinese8_pro_9ft.webp', '8cbb49ca8865beb5', 218500],
  ['./assets/stations/tables/pool_pro_7ft.webp', '4f59773fb57dd029', 139554],
  ['./assets/stations/tables/pool_pro_8ft.webp', '7fdd676729949a99', 138832],
  ['./assets/stations/tables/pool_pro_9ft_k55.webp', '9fd5a7d1e262ef53', 155000],
  ['./assets/stations/tables/pool_pro_9ft_measured.webp', 'e48f05f8a299c51d', 131168],
  ['./assets/stations/tables/pool_pro_9ft_metal_rim.webp', '7b536f2b9241252f', 157534],
  ['./assets/stations/tables/pool_pro_9ft_older_gen.webp', '375b955a87113b32', 130926],
  ['./assets/stations/tables/pool_pro_9ft.webp', 'e48f05f8a299c51d', 131168],
  ['./assets/stations/tables/umb_carom_284.webp', 'bd77a0b19eef7e92', 124100],
  ['./assets/stations/tables/wpa_spec_9ft.webp', 'e070f14c53a88525', 145756],
  ['./assets/stations/tables/wpbsa_snooker_12ft.webp', '2e1f54acefa18643', 195414],
  ['./assets/table/soil_168x296.png', 'bcfdcd0fd9b2dd14', 25988],
  ['./assets/table/soil.json', 'e344693b76898b43', 2050],
  ['../tools/render/grade.json', '340d3b95cbadb7a2', 775],
];
/* <<< AUTOGEN */

// Generation names carry this registration's scope (#1169): Cache Storage is per
// origin, and one origin can hold two registrations of this app (two forks on
// one GitHub Pages user site, or a dev server serving both the repo-root and
// the web/-alone layout). PREFIX = 'ob-sws-' + an 8-hex FNV-1a hash of the
// scope + '-'; a sweep only ever deletes names under it. Every worker from
// before scope tags sweeps every other name that starts with 'ob-sw-' as its
// own generation; PREFIX does not start with it, so a registration still
// running such a worker never deletes these snapshots. A name from before
// scope tags ('ob-sw-<VERSION>') is never deleted, by any sweep (below).
const scopeTag = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};
const SCOPE = (self.registration && self.registration.scope) || new URL('./', self.location.href).href;
const PREFIX = `ob-sws-${scopeTag(SCOPE)}-`;
const CACHE = `${PREFIX}${VERSION}`;
const abs = (p) => new URL(p, self.location.href).href;
// every manifest entry by absolute URL: { sha, bytes } (the fill order is
// PRECACHE first — a budget-cut install's leftovers land before any media)
const ALL_HREFS = PRECACHE.concat(PRECACHE_FILL).map(([p]) => abs(p));
const ENTRY = new Map(PRECACHE.concat(PRECACHE_FILL).map(([p, sha, bytes]) => [abs(p), { sha, bytes }]));
// every URL this worker owns = the manifest, nothing else (review r2 ruling:
// no digest-less optional tail). Interception is client-scoped, not
// path-scoped, so the above-root '../tools/render/grade.json' entry — when
// the generator listed it — is reachable here like any in-scope URL.
const HANDLED_URLS = new Set(ALL_HREFS);

// GH-714 budgets. Chromium kills an install / activate / message event whose
// waitUntil outlives kRequestTimeout = 5 min (KILL_ON_TIMEOUT); every event
// here is bounded far inside it. LANES <= 12 by law; 6 = Chrome's per-host
// HTTP/1.1 connection cap, so no request queues behind its own timer.
const LANES = 6;
const INSTALL_BUDGET_MS = 240000; // boot set, total
const CHUNK = 12; // fill entries per message-loop turn
const CHUNK_BUDGET_MS = 150000;
// 20 s + the bytes at 5 B/ms: a Slow-3G link (51.2 KB/s) shared by LANES
// lanes leaves each ~8 KB/s, so the floor never times out a live transfer
const timeoutFor = (bytes) => 20000 + Math.ceil(bytes / 5);

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const digest = async (buf) => hex(await crypto.subtle.digest('SHA-256', buf)).slice(0, 16);

/** The digest law: the body's sha256 prefix must equal the ACTIVE manifest's.
 * A URL without a manifest entry has no digest and NEVER verifies (review r2
 * ruling). Verification is separate from storage (review r1v P2): a body that
 * verifies is servable whether or not the snapshot can store it. */
async function verified(href, buf) {
  const meta = ENTRY.get(href);
  return !!meta && await digest(buf) === meta.sha;
}
/** A header-clean Response over the already-decoded body bytes (the form the
 * snapshot stores and the fill-miss path serves; content-encoding /
 * content-length / transfer-encoding described the wire body, not `buf`). */
function cleanCopy(res, buf) {
  const headers = new Headers(res.headers);
  for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) headers.delete(h);
  return new Response(buf, { status: res.status, statusText: res.statusText, headers });
}
/** Verified cache write (the fill path). Returns false on a mismatch — NOT
 * cached: a lazily filled snapshot must never mix generations. A store
 * failure (quota) throws .kind = 'store' to the caller — RETRYABLE (GH-714
 * review r3 P2): the entry stays eligible for a later fill kick. */
async function putVerified(cache, href, res) {
  const buf = await res.arrayBuffer();
  if (!(await verified(href, buf))) return false;
  try {
    await cache.put(href, cleanCopy(res, buf));
  } catch (e) {
    throw Object.assign(new Error(`store ${href}: ${e && e.message}`), { kind: 'store' });
  }
  return true;
}

/** One manifest entry into the cache, bounded by its own timer and the
 * caller's deadline. The HTTP cache is taken FIRST, fresh or stale
 * (cache:'force-cache' — the boot just loaded these bytes; the DIGEST
 * decides, not a freshness heuristic, so a first-visit install costs no
 * revalidation round trips); a copy whose digest differs is refetched ONCE
 * past the cache with cache:'reload'. Throws with
 * .kind = timeout | net | http (.status) | store | mismatch. */
async function fetchInto(cache, href, deadline) {
  const meta = ENTRY.get(href);
  for (const mode of ['force-cache', 'reload']) {
    const ctl = new AbortController();
    const ms = Math.max(1000, Math.min(timeoutFor(meta ? meta.bytes : 0), deadline - Date.now()));
    const timer = setTimeout(() => ctl.abort(), ms);
    let res;
    try {
      res = await fetch(new Request(href, { cache: mode, signal: ctl.signal }));
      if (!res.ok) throw Object.assign(new Error(`http ${res.status} ${href}`), { kind: 'http', status: res.status });
      if (await putVerified(cache, href, res)) return;
    } catch (e) {
      if (e && e.kind) throw e;
      const kind = ctl.signal.aborted ? 'timeout' : 'net';
      throw Object.assign(new Error(`${kind} ${href}`), { kind });
    } finally { clearTimeout(timer); }
  }
  throw Object.assign(new Error(`digest mismatch ${href}`), { kind: 'mismatch' });
}

/** N lanes over hrefs; returns the failures [{ href, kind, status, msg }]. */
async function pool(hrefs, worker) {
  const failed = []; let i = 0;
  const lane = async () => {
    while (i < hrefs.length) {
      const h = hrefs[i++];
      try { await worker(h); } catch (e) { failed.push({ href: h, kind: (e && e.kind) || 'net', status: e && e.status, msg: String(e && e.message) }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, hrefs.length) }, lane));
  return failed;
}
const cachedSet = async (cache) => new Set((await cache.keys()).map((r) => r.url));
// GH-1039 race (2): this generation's snapshot is opened by NAME once per
// worker life and the handle is reused. The next generation's activate
// deletes this cache by name; a fill turn still in flight here must never
// re-create it (an orphan of a retired generation that outlives the swap).
// A write through the held handle after that delete lands in a cache no name
// reaches, and the next fill turn stops (fillChunk's caches.has check). A
// rejected open is not kept: the next caller opens again.
let snapshotP = null;
const openSnapshot = () => snapshotP || (snapshotP = caches.open(CACHE).catch((e) => { snapshotP = null; throw e; }));
let retired = false; // set when this generation's snapshot was deleted under a live fill

// ---- stale generations (GH-1039 race 2, the browser re-creator; #1162) ----
// activate deletes the other generations' snapshots by name, but a deleted
// name can come back EMPTY: the browser stores V8 code cache for a script or
// wasm that an OLD page (or its worker) loaded from that snapshot by opening
// the cache BY NAME (Chrome: CodeCacheHost -> CacheStorage open -> side data,
// which finds no entry), and nothing orders that write-back after this
// delete. So the delete is a SWEEP, run again on the events that follow the
// old pages' departure: activate, every client's {ob:'fill'} (each reloaded
// page posts one), every navigation and the fill's end. It rides the event's
// waitUntil, never an answer: one caches.keys() (cache NAMES, usually 1-2),
// then a delete only when a stale name exists. It never deletes CACHE and
// never writes:
//   - at activate (the take-over) every other name of this scope, as before;
//   - later, only OLDER generations' names: those created before this
//     snapshot (keys() lists names in creation order), and those created
//     after it that hold none of the first install batch (PRECACHE's head,
//     one entry per install lane): a by-name re-creation is EMPTY, and is
//     recognised in any worker life (no in-memory record a restart could
//     lose). A newer generation's cache holds that batch once its install
//     cached any of it (a complete snapshot, or a failed install kept for
//     its resume: a revert deploy re-uses an older VERSION's name) and is
//     never touched. A failed install whose first-lane fetches all failed
//     holds none of it and is swept like an empty name: its next attempt
//     refetches what it had (force-cache first, so mostly from the HTTP
//     cache);
//   - nothing while a worker is installing or waiting (#1162: an older
//     activate deleted a newer install cache);
//   - nothing once this generation is retired: its snapshot gone by name or
//     back empty, or this worker redundant (a newer generation activated over
//     it; the browser also ends a replaced worker once its in-flight events
//     finish).
// Only this scope's names (PREFIX) are generations of this registration: a
// second registration of the app on the same origin keeps its snapshots
// (#1169). A name from before scope tags is left alone by every sweep: one
// worker cannot prove whose it is. Two registrations of one VERSION wrote into
// the same one, a nested scope's entries lie under the outer one's scope,
// another install can write into it during a sweep, and above-scope URLs
// resolve the same for both. The leftover, typically one generation per
// device, is a known storage cost (the ownership ledger (internal); reclamation: #1248).
// Those guards are read after every await, immediately before EACH delete:
// a worker can start installing, or a newer generation activate, while a
// probe is pending.
// Every sweep posts {ob:'swept'} once it settled, whatever it did (nothing to
// remove and deferred included): to the client whose {ob:'fill'} asked for it
// (its id echoed), else to every window client. Product code ignores it; the
// swupdate gate reads caches.keys() after its own ask is answered.
// match with cacheName never creates: a deleted name stays deleted
async function holdsBoot(name) {
  for (const h of ALL_HREFS.slice(0, LANES)) if (await caches.match(h, { cacheName: name })) return true;
  return false;
}
async function sweepStale(why, asker, id) {
  let removed = 0, held = null, keysMs = -1;
  try {
    const t0 = performance.now();
    const names = await caches.keys();
    keysMs = Math.round(performance.now() - t0);
    const mine = names.indexOf(CACHE);
    const reg = self.registration;
    const me = self.serviceWorker; // this worker (an engine without it relies on the snapshot probe)
    const guard = async () => (!(await holdsBoot(CACHE)) || retired || (me && me.state === 'redundant')
      ? 'this generation is retired (a newer worker activated)'
      : reg && (reg.installing || reg.waiting) ? 'a newer worker is installing or waiting' : null);
    for (const [i, n] of names.entries()) {
      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)
      const older = why === 'activate' || i < mine;
      if (!older && (await holdsBoot(n))) continue; // a newer generation's snapshot or resumable install
      held = await guard(); // read last: no task runs between it and the delete
      if (held) break;
      if (await caches.delete(n)) removed++;
    }
  } catch (e) { held = `failed: ${e && e.message}`; }
  if (removed) console.log(`[sw] swept stale caches (${why}): ${removed}`);
  if (held) console.log(`[sw] stale sweep deferred (${why}): ${held}`);
  const msg = { ob: 'swept', why, removed, deferred: held, keysMs, id: id === undefined ? null : id, version: VERSION };
  const to = asker ? [asker] : await self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => []);
  for (const c of to) { try { c.postMessage(msg); } catch (e) { /* gone */ } }
  return removed;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await openSnapshot();
    const deadline = Date.now() + INSTALL_BUDGET_MS;
    // a killed or failed earlier attempt left its entries in this versioned
    // cache (the digest law makes them trustworthy): resume, never redo
    const have = await cachedSet(cache);
    const todo = PRECACHE.map(([p]) => abs(p)).filter((h) => !have.has(h));
    let failed = await pool(todo, (h) => fetchInto(cache, h, deadline));
    // timeouts / network errors get ONE more pass inside the budget
    const soft = failed.filter((f) => f.kind === 'timeout' || f.kind === 'net').map((f) => f.href);
    if (soft.length && Date.now() < deadline - 5000) {
      const again = await pool(soft, (h) => fetchInto(cache, h, deadline));
      failed = failed.filter((f) => !soft.includes(f.href)).concat(again);
    }
    // ANY boot entry still missing after the retry pass fails the install
    // (GH-714 review r1 P1 — play.md: the boot set is COMPLETE at activation).
    // A refused byte (404 / digest mismatch = the served tree moved on) and
    // a timeout / network loss alike: the browser drops this worker, the
    // PREVIOUS snapshot stays active and serving, and the next visit
    // retries the install (the versioned cache keeps what landed — resume,
    // never redo). Activating with a hole handed a working offline install
    // over to one that 404s a core module at the first offline boot.
    if (failed.length) {
      throw new Error(`sw install: ${failed.length}/${todo.length} boot entries missing `
        + `(${failed[0].kind}: ${failed[0].msg}) — the previous generation stays active`);
    }
    console.log(`[sw] install ${todo.length}/${todo.length} boot entries in ${Date.now() - deadline + INSTALL_BUDGET_MS} ms`);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await sweepStale('activate'); // the older generations' snapshots (and their re-creations, later sweeps)
    // GH-714 review r4 P2: the fill's FIRST turn runs INSIDE this extendable
    // event — one chunk (<= CHUNK entries, the per-request timeouts and the
    // CHUNK_BUDGET_MS cap as on every turn), so an activation always
    // caches at least the first chunk before the browser may stop the
    // worker (timers extend nothing; pre-fix the kick was a bare
    // setTimeout after activate and an offline next launch could have
    // only PRECACHE). The remaining turns continue on the message loop.
    // GH-1039: activate JOINS a kick already in flight. A client's
    // {ob:'fill'} (app.html posts it from serviceWorker.ready, which resolves
    // while this worker is still activating) can start the first turn while
    // the sweep above awaits caches.keys(); pre-fix kickFill handed this
    // second caller a settled promise, so activation settled with the boot
    // set only and this line never printed.
    const left = await kickFill('activate');
    console.log(`[sw] fill first turn inside activate: ${fill ? fill.have.size : '?'} cached, ${left < 0 ? 'turn failed' : `${left} left`}`);
  })());
});

// ---- background fill (GH-714) ---------------------------------------------
// One chunk (<= CHUNK entries, LANES in flight) per message-loop turn: the
// worker posts itself a message per turn and does the chunk inside that
// event's waitUntil, so the browser keeps it alive between chunks without any
// single event outliving its 5-minute budget; fetch events interleave freely.
// Review r4 P2: a kick's FIRST turn runs inside the KICKING event's waitUntil
// (activate, a client's {ob:'fill'} re-arm message, a fetch) — a bare timer
// extends nothing, and a worker the browser stopped between activate and its
// first turn left an offline next launch with only PRECACHE.
// Progress lives in the cache itself, so an incomplete fill (worker stopped,
// page closed, link lost) resumes on the next worker start: the first fetch
// event of the next boot, or the re-arm message every loaded page posts.
// Should a self-message ever not dispatch, a plain async loop takes
// over (same chunks, no lifetime extension — the next boot resumes it).
// GH-714 review r3 P2: a fill failure is CLASSIFIED, never a life sentence.
// PERMANENT for this generation = HTTP 404 / 410 and a digest mismatch (the
// served tree moved on; the next sw.js generation carries the entry):
// suppressed and counted as `refused`. RETRYABLE = timeout, network error,
// any other non-2xx (5xx, 429 …) and a cache.put failure (quota): the URL
// stays ELIGIBLE — ONE attempt per kick, and a later kick (the next fetch
// event that re-arms the fill in this worker; every new worker start begins
// afresh) retries it after a small backoff (5 s after the first pause,
// doubling, capped at 20 s), for at most RETRY_KICKS = 5 kicks per worker
// life, after which it is counted as `exhausted` among the refused (the next
// worker start retries anyway — the cache is the progress record). "fill
// complete" is logged ONLY when no retryable entry remains; otherwise "fill
// paused (k retryable)" and fillKicked is RESET so the next fetch re-arms
// the fill. (Pre-fix: every failure joined one permanent `failed` set,
// completion was logged with the holes, and fillKicked kept every later
// fetch from restarting — a transient outage left the snapshot incomplete
// for the worker's life.)
let fill = null; // { have, refused: Map, strikes: Map, deferred: Set, turns, pauses, exhausted } for this worker's life
let fillKicked = false;
let kickTurn = null; // the in-flight kick's first-turn promise (a second caller joins it)
let fillDirect = false;
let turnTimer = null;
const RETRY_KICKS = 5;
const permanent = (f) => f.kind === 'mismatch' || (f.kind === 'http' && (f.status === 404 || f.status === 410));

/** The next <= CHUNK eligible entries: not cached, not refused, not deferred this kick. */
function fillTodo() {
  const todo = [];
  for (const h of ALL_HREFS) {
    if (fill.have.has(h) || fill.refused.has(h) || fill.deferred.has(h)) continue;
    todo.push(h);
    if (todo.length === CHUNK) break;
  }
  return todo;
}

async function fillChunk() {
  const cache = await openSnapshot();
  // race (2): a newer generation's activate deleted this snapshot — stop here
  // and never re-create it
  if (!(await caches.has(CACHE))) { retired = true; return 0; }
  if (!fill) fill = { have: await cachedSet(cache), refused: new Map(), strikes: new Map(), deferred: new Set(), turns: 0, pauses: 0, exhausted: 0 };
  fill.turns++;
  const todo = fillTodo();
  if (!todo.length) return 0; // nothing left this kick: both callers stop and call fillRest once
  const deadline = Date.now() + CHUNK_BUDGET_MS;
  const failed = await pool(todo, async (h) => { await fetchInto(cache, h, deadline); fill.have.add(h); });
  for (const f of failed) {
    if (permanent(f)) { fill.refused.set(f.href, f.kind === 'http' ? `http ${f.status}` : f.kind); continue; }
    const n = (fill.strikes.get(f.href) || 0) + 1;
    fill.strikes.set(f.href, n);
    if (n >= RETRY_KICKS) { fill.refused.set(f.href, `exhausted ${f.kind} x${n}`); fill.exhausted++; }
    else fill.deferred.add(f.href); // this kick is done with it; the next kick retries
  }
  return fillTodo().length;
}

/** The end of one kick: COMPLETE only when nothing retryable remains;
 * otherwise paused, and the next fetch event re-arms the fill. */
function fillRest(where) {
  if (retired) {
    console.log(`[sw] fill stopped (${where}this generation's snapshot was deleted: a newer worker activated)`);
    return;
  }
  const k = fill ? fill.deferred.size : 0;
  const refused = fill ? fill.refused.size : 0;
  const turns = fill ? fill.turns : 0;
  const ex = fill && fill.exhausted ? `, ${fill.exhausted} exhausted after ${RETRY_KICKS} kicks` : '';
  if (k > 0) {
    fill.pauses++;
    fillKicked = false; // the next fetch re-arms the fill (a retry kick)
    console.log(`[sw] fill paused (${k} retryable, ${where}${turns} turns, ${refused} refused${ex}) — the next fetch retries`);
    return;
  }
  console.log(`[sw] fill complete (${where}${turns} turns, ${refused} refused${ex})`);
}

/** A turn that THREW (caches.open, cache.keys …) is a pause, never a
 * completion (GH-1039): no "fill complete" line, and fillKicked is reset so
 * the next kick re-arms. Pre-fix the turn's catch returned 0, fillRest
 * logged a complete fill over the holes, and fillKicked kept every later
 * kick a no-op for the worker's life. */
function fillFailed(where, e) {
  if (fill) fill.pauses++;
  fillKicked = false;
  console.warn(`[sw] fill paused (turn failed, ${where}${e && e.message}) — the next fetch retries`);
}

/** One fill turn: a chunk, then the next turn on the message loop or the
 * kick's end. Settles when THIS turn's chunk is done — the callers inside
 * an extendable event await it — with the entries left (-1: the turn failed). */
async function fillTurn(why) {
  let left;
  try { left = await fillChunk(); } catch (e) { fillFailed('', e); return -1; }
  if (left > 0) nextTurn('turn');
  else {
    fillRest(why === 'activate' ? 'activate, ' : '');
    if (!retired) await sweepStale('fill end');
  }
  return left;
}

/** Kick (or re-arm) the fill. Returns a promise that settles after the
 * kick's FIRST turn (GH-714 review r4 P2): every caller sits inside an
 * extendable event — activate, a client's re-arm message, a fetch — and
 * hands it to waitUntil, so the browser keeps the worker alive through the
 * backoff wait and the first chunk (a bare timer extends nothing; pre-fix a
 * worker stopped right after activate had cached only PRECACHE). A second
 * caller while a kick is in flight JOINS that kick's first turn (GH-1039:
 * activate after a client's kick); once the kick has run, the same settled
 * promise. */
function kickFill(why) {
  if (fillKicked) return kickTurn || Promise.resolve();
  fillKicked = true;
  // a retry kick starts with the deferred set cleared and a backoff
  let wait = why === 'fetch' ? 2500 : 0;
  if (fill && fill.deferred.size) { fill.deferred.clear(); wait = Math.min(20000, 2500 * 2 ** fill.pauses); }
  kickTurn = new Promise((r) => setTimeout(r, wait)).then(() => fillTurn(why));
  return kickTurn;
}

function nextTurn(why) {
  const me = self.registration && self.registration.active;
  if (me && !fillDirect) {
    try {
      me.postMessage({ ob: 'fill', why, turn: true });
      clearTimeout(turnTimer);
      turnTimer = setTimeout(() => { fillDirect = true; directLoop(); }, 4000);
      return;
    } catch (e) { fillDirect = true; }
  }
  directLoop();
}

async function directLoop() {
  let left = 1;
  while (left > 0) {
    try { left = await fillChunk(); } catch (e) { fillFailed('direct loop, ', e); return; }
    await new Promise((r) => setTimeout(r, 0));
  }
  fillRest('direct loop, ');
  if (!retired) await sweepStale('fill end');
}

self.addEventListener('message', (event) => {
  // issue #1047: the update notice's Reload (app/swupdate.js) — the WAITING
  // worker takes over now; every controlled page reloads at the change. A
  // no-op on the active worker.
  if (event.data && event.data.ob === 'skip-waiting') { event.waitUntil(self.skipWaiting()); return; }
  if (!event.data || event.data.ob !== 'fill') return;
  // GH-714 review r4 P2: a CLIENT's re-arm — app.html posts {ob:'fill'} from
  // every loaded page (navigator.serviceWorker.ready, controlled or not) —
  // KICKS the fill inside this event's waitUntil: a no-op while a kick is
  // in flight, a resume after the browser stopped the worker before its
  // turns finished, a retry kick after a pause reset fillKicked. Only the
  // worker's own turn messages run a chunk directly (a client message run
  // as a bare turn would put two chunks in flight: 2 x LANES > the law).
  // GH-1039 race 2: the asking page's load followed an older page's
  // departure, so it also re-runs the stale sweep and hears {ob:'swept'}
  if (event.data.turn !== true) { event.waitUntil(Promise.all([kickFill('client'), sweepStale('client', event.source, event.data.id)])); return; }
  // GH-1039: a turn message delivered after the 4 s fallback already started
  // the direct loop is stale; running it too would put a second chain
  // (2 x LANES) in flight
  if (fillDirect) return;
  clearTimeout(turnTimer);
  event.waitUntil(fillTurn('turn'));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // pass-through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: untouched

  // navigations: SAME-GENERATION law (review P1) — the snapshot serves the
  // HTML too (query params like ?seed= ride app.html itself). Network-first
  // here would hand an installed client a fresh deploy's HTML over the OLD
  // snapshot's subresources: a mixed-generation graph. The deploy lands via
  // the sw.js update cycle instead — atomically, at activation. The shell
  // backstop is scoped to APP ROUTES ONLY (review r2 P2: an unconditional
  // backstop served app.html bytes to every uncached in-scope navigation —
  // spike.html got the shell even ONLINE, fetch(req) was unreachable);
  // every other in-scope navigation falls through to the network, and
  // offline it fails exactly like the no-SW app.
  if (req.mode === 'navigate') {
    event.waitUntil(kickFill('fetch')); // resume an incomplete fill (every worker start) — the event keeps the worker alive through the first turn
    event.waitUntil(sweepStale('navigation')); // GH-1039 race 2: beside the answer, never in it
    event.respondWith((async () => {
      const cache = await openSnapshot();
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (url.pathname.endsWith('/app.html')) {
        const shell = await cache.match('./app.html');
        if (shell) return shell;
      }
      return fetch(req);
    })());
    return;
  }

  // handled-set membership: the EXACT url first (stylesheets precache WITH
  // their authored ?v= — a version mismatch must MISS to the network, that
  // is the ?v= discipline), then the query-stripped url for bare entries
  // (the boot-guard heal refetches location.href, so app.html?seed=… must
  // land on — and refresh — the './app.html' snapshot entry).
  url.hash = '';
  if (!HANDLED_URLS.has(url.href)) {
    url.search = '';
    if (!HANDLED_URLS.has(url.href)) return; // pass-through otherwise
  }
  event.waitUntil(kickFill('fetch')); // resume an incomplete fill (one-shot per worker life; the event outlives the first turn)

  // precached URL: cache-first — except explicit revalidations (the boot
  // guard's cache:'reload' heal), which go network-first and REFRESH the
  // snapshot so a healed graph stays healed on the next boot. A miss (the
  // fill has not reached this entry yet, or a budget-cut install) falls to
  // the network and the verified copy joins the snapshot.
  const heal = req.cache === 'reload' || req.cache === 'no-cache'
    || req.cache === 'no-store';
  event.respondWith((async () => {
    const cache = await openSnapshot();
    if (!heal) {
      const hit = await cache.match(url.href);
      if (hit) return hit;
    }
    let res;
    try {
      res = await fetch(req);
    } catch (e) {
      const hit = await cache.match(url.href); // offline: snapshot backstop
      if (hit) return hit;
      throw e;
    }
    if (!res.ok) return res; // an error body is answered as served, never cached
    // GH-714 review r1 P1: a fill miss is VERIFIED before it is answered —
    // the old code returned the network bytes at once and rejected them
    // asynchronously, so a lazy module from a NEWER server tree executed
    // against this snapshot's older callers (the mixed-generation graph
    // the digest law exists to prevent). The body is read ONCE and digested
    // against the ACTIVE manifest: mismatch -> a synthetic 503 (never
    // executed) and the update-waiting message to every client (the page's
    // dynamic-import failure path is the degrade; app/swupdate.js asks the
    // browser for the new sw.js on it and offers the Reload — issue #1047).
    // A body cut mid-stream falls back to the snapshot like the offline
    // branch above.
    let buf;
    try {
      buf = await res.arrayBuffer();
    } catch (e) {
      const hit = await cache.match(url.href);
      if (hit) return hit;
      throw e;
    }
    if (!(await verified(url.href, buf))) {
      event.waitUntil(notifyStale(url.href));
      return new Response('', { status: 503, statusText: 'Service Unavailable',
        headers: { 'X-OB-SW': 'stale-generation', 'Cache-Control': 'no-store' } });
    }
    // review r1v P2: verification and STORAGE are separate laws. Matching
    // bytes are SERVED from the buffer whatever the snapshot does with them;
    // the cache.put rides the event's waitUntil and a store failure (a
    // QuotaExceededError under storage pressure) is logged and ignored —
    // the entry merely stays unfilled and the next fill pass retries it.
    // (The r1 code awaited the put in the answer path and turned its
    // failure into the 503 + update-waiting of a digest MISMATCH.)
    // GH-1039 P4: once the copy is written the requesting client hears it
    // (snapshot-joined) — the answer never waits for storage, so this is
    // the only point at which the join is true
    event.waitUntil(cache.put(url.href, cleanCopy(res, buf.slice(0))).then(
      () => notifyJoined(event.clientId, url.href),
      (e) => { console.warn(`[sw] fill-miss store failed, entry left unfilled: ${url.href}`, e && e.message); }));
    return cleanCopy(res, buf);
  })());
});

/** snapshot-joined (GH-1039 P4): a verified fill-miss copy has been written to
 * this generation's snapshot — posted to the requesting window only, after the
 * write settled (never on a store failure). The answer itself is not delayed
 * by storage (review r1v P2); this tells a client WHEN the copy joined. Product
 * code ignores it (app/swupdate.js acts on update-waiting only). */
async function notifyJoined(clientId, href) {
  if (!clientId) return;
  const c = await self.clients.get(clientId).catch(() => null);
  try { if (c) c.postMessage({ ob: 'snapshot-joined', url: href, version: VERSION }); } catch (e) { /* gone */ }
}

/** update-waiting message (GH-714 review r1): the served tree is a newer
 * generation than this ACTIVE snapshot — posted to every window client;
 * app/swupdate.js asks for the new sw.js and offers the reload (#1047). */
async function notifyStale(href) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => []);
  for (const c of list) { try { c.postMessage({ ob: 'update-waiting', reason: 'stale-generation', url: href, version: VERSION }); } catch (e) { /* gone */ } }
}
