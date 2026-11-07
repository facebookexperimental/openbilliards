// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-pocket-construction.mjs — GH-489 W6 CONSTRUCTION-CORRESPONDENCE gate.
// The owner's construction-level rejection of rev-11 (#489 c5259714909) was
// adjudicated into per-element drawings (corner c5259957376, middle
// c5260535193, owner rulings c5260294606); this tool measures the LIVE
// RENDER (scene raycasts against the booted app — no code numbers are
// trusted, the scene graph is the measured artifact) and gates the
// adjudicated bars:
//
//   corner:  C1 visible fall Ø 84–90 mm             (delta: rev-11 Ø 185.8)
//   [#637 main merge: the rows above are the pre-R3 ids; on this tree C1 is the CEBP-disc arris law (RULING R-S8-2 + BODY-2), C2a/b/c the MODEL plate datum (RULING-SNK-DATUM), B3 the net-mouth saddle — see the bar texts]
//            C2 wood end-face stations on the kernel mouth-line crossing
//               ±3 mm; wood-end gap chord on the mouth line 103±8 mm;
//               onset 54.9–55.7 (±3) mm from the measured fall centre
//            C3 ZERO wood along the outside diagonal (plank heights)
//            C4 throat: cloth wall at −20/−30 mm; KNIT (not cloth wall) at
//               −40 mm — the 25–45 mm net-top band  (delta: 0 mm cloth
//               below bed, net top −78.5 mm)
//            C5 stitch row on the OUTER face ≈ 11 mm under the crest; NO
//               dashes on the crown (delta: crown-top ring at fall+6.6 mm)
//            C6 boot leather CREAM (owner ruling; delta: near-black 0x1c1210)
//   middle:  M1 visible fall ≈ Ø 94–101 mm          (delta: rev-11 Ø 114.4)
//            M2 wood end faces at ± uFaceM (R3-SNK-10: the purchased Star model's ± 41.92 planes, live), squared
//            M3 cloth wall persists at −45 mm (the 50–65 mm below-bed law)
//
// GH-489 W7 EXTENSIONS (gate r10 verdict c5264581300 — bars that would
// have caught the r10 blockers, each red-proofed on the rev-12 bytes
// @8b93c61e with the r10 numbers):
//   B1 bed protrusion: straight-down rays INBOARD of both nose lines
//      (the corner diagonal band + laterals, the region balls can
//      legally occupy) must first-hit AT/below bed level — rev-12 read
//      obSnkPost standing +20.5 mm proud on the playing bed;
//   B2 outside-assembly legibility at the S2b register (rev-4-cleared
//      law restored): ≥ 10/64 ring-centreline sightlines reach the
//      corner ring iron, ≥ 15/64 reach hanging furniture (ring/wires),
//      the boot wrap-down face and the below-plate sock band are the
//      first hits on their staked rays — rev-12 read 0/64 (opaque
//      casting box);
//   B3 middle knit-top band: the first obPocketNet surface on vertical
//      rays at 0.9 of the fall radius sits in the adjudicated 50–65 mm
//      below-bed band — rev-12 read −88 mm (dark sleeve + deep bag);
//   C4b TIGHTENED to knit-only: the −40 mm through-mouth read must be
//      obPocketNet — rev-12 satisfied the old bar with the RING IRON at
//      the wall (the r10 audit named the gate gap), and the W6 tree also
//      read bare slate bore ahead of the collar.
//
//   C14 (2026-08-24 owner annotation on the ASBUILT-R9 H1 sheet) is the
//      first bar here that is NOT a raycast law: section curves that cross
//      are invisible to a first-hit probe. It sections the bay triangle soup
//      and judges that no jaw-wrap curtain stands on the play side of the
//      cushion facing. Its brief-literal companion census rides a MEASURED
//      row — see the block comment at the bar itself for why that one can
//      never be judged.
//
//   M4 (GH-568, pocket-physics close-out 2026-08-26) middle-jaw contact-
//      height concordance: the cloth facing must ride the KERNEL's own
//      middle-jaw arcs (chainsFromKernel over the wasm
//      table_geometry_json_for serialization — review r4 P1: a JS-mirror
//      reference would move with the very mesh it judges) at the arcs'
//      own contact height on ALL FOUR middle flanks — 144/144 station
//      bins covered, first-contact envelope within [−0.10, +0.05] mm
//      with zero beyond-corridor play-side outliers, wall top at/above
//      contact height at every station, and the JS CEBP mirror within
//      1 µm of the kernel arcs (M4d). Section-plane instrument (the C14
//      sectioner family), measured in Node by
//      tools/render/midjaw-concord.mjs over a middle-bay extraction that
//      OWNS ITS ROI — the close-out's first middle read inherited a
//      corner-scoped dump filter and produced a false "air slot" (PR
//      #498 comment 5434858058); the --midjaw-red arm replays exactly
//      that artifact and must fire
//      (tools/render/midjaw-red-basis-568.json is the archived proof).
//
// READINESS + INSTRUMENT-BASIS LAW (COMPANION-1d FIX4, the chain95 row-19 record on #761):
//   the fixed 1.5 s sleep after the game switch was the only readiness signal, and every instrument
//   cast against the WHOLE scene (scene.children) with an object-only visibility filter. The switch
//   re-racks, and the app's aim-preview family (web/app/preview.js, group 'obAimPreview' — hidden as a
//   GROUP while the shell owns the screen, its line meshes still `visible`) recomputes over the table
//   in the seconds after it; a top-down instrument ray that met one of its meshes read the preview,
//   not the pocket: M1 Ø 91.5 mm (green 98.0), M2 faces 91.5 / 91.5 (green 54.5 / 54.5), B3 one knit
//   read of four — numbers of a complete pocket seen through a foreign mesh, printed as a verdict.
//   The law now:
//   (1) READINESS = the settle law (lib/settle.mjs, NOTE-CENSUS-SETTLE): after the switch the per-mesh
//       geometry signature must hold still for 5 reads x 500 ms (cap 30 s), else REFUSED by name;
//   (2) INSTRUMENT BASIS = the table group only: every raycast intersects [obTable] — the aim preview,
//       the cue stick, the balls and the room are never an instrument's first hit (object visibility
//       inside obTable is judged as before);
//   (3) POCKET-BUILD-COMPLETE precondition, read BEFORE any instrument: the snooker assembly's
//       furniture under obTable at its full count (obPocketNet 4, obPocketNetSkirt 2, obPocketCap 1,
//       obPocketShade 2, obPocketRing 1, obPocketWire 1, obPocketTrack 1, obPocketFallWall 2), else
//       REFUSED naming the short element — never a number from a half-built pocket;
//   (4) POST-SAMPLE law: the signature read after the last instrument must equal the settled one,
//       else REFUSED (the scene was written while the instruments ran). The readiness and post-sample
//       signatures cover the instrument basis [obTable] only (GH-1080 r3). Excluded: everything outside it
//       — the aim preview (web/app/preview.js, obAimPreview), the cue stick, the aim helpers, the balls,
//       the room and the lights. The rays meet only [obTable] (2). The aim preview rewrites its line
//       meshes on its own after the switch (instance attributes v0 -> 35 in one refused window, with no
//       table mesh moved), and no instrument reads instance attributes;
//   (5) B3 requires ALL FOUR knit stations to read obPocketNet — a missing station is a FAIL that
//       names it (a geometry verdict), never a silent max over the stations that answered;
//   (6) bars and INFO rows are buffered and printed together after (4) — a refusal prints NO number.
//   Refusals exit 3 (`[check-pocket-construction] REFUSED — …`); no report is written for them (the
//   prior report at --out was already invalidated as the first effect).
//   PLANTS `--perturb=pocket-write-during` / `--perturb=preview-write-during` (GH-1080 r3): just before the
//   post-sample read, the first writes an obPocketCap attribute (inside the basis: the run must REFUSE) and
//   the second rewrites every obAimPreview line mesh's attributes (outside it: the run must NOT refuse).
//   RED PLANT `--perturb=early-sample`: the settle wait is skipped and the instruments run on the very
//   next command after the switch; afterwards the settle law runs and the settled signature is compared
//   with the pre-sample one. Where the switch still writes the basis after that command (the asynchronous
//   pocket occlusion bake before GH-1131), the run REFUSES by name (exit 3) and prints no bar. Where the
//   basis is complete at that command (GH-1131 ships the snooker occlusion precomputed), nothing in it
//   moves, the run prints the named did-not-fire line, and pocket-write-during is the post-sample arm.
//
// Usage:
//   node tools/render/check-pocket-construction.mjs [--web <dir>] [--expect-red]
//     [--out <report.json>] [--c14-all-corners] [--c14-json <record.json>]
//     [--midjaw-red <basis.json>] [--perturb=slow-server|slow-server-only|early-sample|cast-miss|furniture-short|pocket-write-during|preview-write-during] [--arm <name>]
//     (cast-miss: the instrument basis is pointed at a name no scene carries → REFUSED by name, no bar printed — the #637 main merge, condition 3;
//      --arm: the snooker lane's construction red arms on the page URL, SNK-R30..R37, scripted boots only per landing rule L3)
// --web points at another tree's web/ (the rev-11 red-proof runs it against
// the ob-489-w5 worktree bytes @476de447); --expect-red asserts the
// construction bars FAIL there and prints which (a gate that cannot red is
// not a gate). --c14-all-corners extends C14 from the +x+z corner every other
// bar here measures to all four (the mirrored-corner audit; ~4x the CDP
// transfer and the census time, so it is opt-in, not the routine gate).
//     (furniture-short: one obPocketNet mesh is removed under obTable before the completeness census → REFUSED by name
//      `pocket build incomplete under obTable: obPocketNet 2/3`, exit 3, no bar printed — never a crash, never a pass; #637 main merge,
//      condition 2 of the 0f5ffe32 acceptance: the arm proves #827's serialization fix and the census law in one run)
//
// FIX4 (3) COMPLETENESS CENSUS — wpbsa_snooker_12ft pocket furniture (the #637 R3-SNK build). The NEED table in the measurement
// script pins every `^obPocket` mesh class the build EMITS under obTable at its built count. Each row cites the row that DEFINES it
// (the creation site in web/scene/table.js + the drawing / order / ruling row); the sealed identity dump (R37 seal b2183aa7 → C1 seal
// f43a9df2, /tmp/craftr3/r43/identity-b2183aa7/new/wpbsa_snooker_12ft.json) CONFIRMS the table, it does not author it. Each site
// emits ONE merged mesh — through `put(geos, mat, name)` (table.js:29379, null on an empty geometry list) or a direct `new THREE.Mesh`
// + `group.add` (boots/stitches/skirts/embosses, the corner fall walls, the three net meshes, the board) — so a count > 1 is a class
// built from more than one geometry family:
//
//   class               count  defining row (creation site → drawing / order / ruling)
//   obPocketCap           1    table.js:26300 boots — visuals §GH-489 assembly item 4 "saddle leather caps" (SADDLE_PROF); R3-SNK-2
//                              (the Magnum's construction); SNK-R32 OCCL-COVER; the R33/R36/R37 capture-disc rows measure it
//   obPocketStitch        1    table.js:26304 — assembly item 3 stitch dash row (`stitchDashes`); drawing E4 (the stitch row at the D3
//                              meridian, asmodeled-drawings-489); R3-SNK-3: ONE row per pocket (obPocketStitch2 RETIRED with its row)
//   obPocketValance       1    table.js:26315 skirts — assembly item 3 "scalloped stitched leather valances"; SNK-R32 OCCL-COVER
//   obPocketEmboss        1    table.js:26323 — W14 E19 (drawing element E19, the embossed cap)
//   obPocketFallWall      2    table.js:29416 corner throat walls + :29421 wallsMid (W9 u-aware mid canvas) — assembly item 1 "open fall
//                              throat"; drawing frames obPocketFallWall / obPocketFallWall@mid (asmodeled-drawings-489)
//   obPocketFallRoll      1    table.js:29419 rolls — assembly item 4b the rolled bound edge (owner 「皮质的包边」); R3-SNK-5 plate/roll/skirt contour
//   obPocketRing          1    table.js:29422 rings — assembly item 2 (owner ⑥) brass ring iron; drawing frame obPocketRing
//   obPocketNet           3    table.js:29522 mC cords + :29527 mK knots + :29532 mB whipped band and gathered tail knot — assembly item 2
//                              cotton net; R3-SNK-5 N1/N2/N3/N5 (form-level net/knot rebuild); SNK-R31 NET-BRIDGES / WIND-NORMAL reads
//   obPocketLining        2    table.js:29536 linings + :29540 liningMirrors — SNK-R31 (the corner sheets' flesh sides, mirror-wound
//                              strips, FrontSide + a back material); R3-SNK-5 plate contour
//   obPocketStrap         1    table.js:29597 — W12 corner rail strap (gate r15 P2-4, the cream leather band); W15 (gate r18 P2-2) stitched-strap
//                              texture (signed-E20 scope)
//   obPocketStrapIron     1    table.js:29624 — W13 (gate r16 P2-3) the buckle brass (emissive-dominant); W15 residual metal-lobe leg; E20 family
//   obPocketPlate         1    table.js:29635 — assembly item 2 the leather drop-plate shell on the INWARD side (the Star hardware
//                              backplate); R3-SNK-3 (the plate is peach); R3-SNK-5 contour
//   obPocketShade         1    table.js:29636 — visuals Rev-5 / Rev-6 (#498 gate r2/r3): the near-black interior shade disc (S2b law)
//   obPocketMouthShade    1    table.js:29637 — W10 rim occlusion; assembly item 1 mouth-shadow gradient
//   obPocketBoard         1    table.js:29645 — 489 ENV ROUND under-frame cross boards behind the bay (visuals item 5 "cavity re-sealed by
//                              construction": under-frame cross boards; addSnookerPocketAssembly header :27818, GH-387); SNK-R30 S-BOARD
//                              (the corner jamb board retired; `--arm board-inject` re-plants it)
//   obPocketStrapPlate    1    table.js:29649 — W14 E20 (drawing element E20, the backplate); W15 P5 finish
//   obPocketRingGather    1    table.js:29670 — 489 PASS-2 B14b / PASS-3 C3+B3 (the studded gather ring); assembly item 2 hardware
//   obPocketTrack         1    table.js:29671 — R3-SNK-BODY-1 (owner card 18b: the ball slide rails — six chutes, 24 wires, E20 family);
//                              SNK-R33 chute record (`userData.obChutes`)
//
//   Sites that emit NOTHING on wpbsa_snooker_12ft (not pinned, by construction): obPocketWire — table.js:29541 `put(wires, …)` over the
//   `wires` list declared at :28031 and never filled on this build (the corner suspension wires became the chute wires under
//   obPocketTrack, R3-SNK-BODY-1 / SNK-R33); obPocketStitch2 — RETIRED by R3-SNK-3 (table.js:26309–26312, no site); obPocketNetSkirt —
//   no site in this table.js (main's pre-R3 census carried 2). obSnkSlideRing (table.js:29672) is outside the `^obPocket` census.
//   Classes present in the sealed dump with no defining row: NONE (18 dump classes, 18 sites).
//   main's pre-R3 census, SUPERSEDED: { obPocketNet: 4, obPocketNetSkirt: 2, obPocketCap: 1, obPocketShade: 2, obPocketRing: 1,
//   obPocketWire: 1, obPocketTrack: 1, obPocketFallWall: 2 } (main's own record run on its export: obPocketNet 4, obPocketNetSkirt 2,
//   obPocketShade 2, obPocketWire 1, obPocketStitch2 1, obPocketLining 1).
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'check-pocket-construction', value: ['--out', '--web', '--c14-json', '--midjaw-red', '--perturb', '--arm'], bool: ['--expect-red', '--c14-all-corners'] }) // --arm: the snooker lane's construction red arms (SNK-R30..R37), declared at the #637 main merge; // --midjaw-red is a PATH value (Fable pass 1 on FIX10)
const outPath = __P.value('--out') ? path.resolve(__P.value('--out')) : null;
// FIX3 (P2 (a)) → FIX10: the prior report at the PARSED destination is removed as the first effect after the parse, before any input guard
if (outPath) { const { invalidatePrior } = await import('./lib/serve-check.mjs'); invalidatePrior([outPath], 'check-pocket-construction'); }
if (outPath) { try { (await import('node:fs')).mkdirSync(path.dirname(outPath), { recursive: true }); } catch (e) { console.error(`[check-pocket-construction] REFUSED — --out ${outPath}: its parent cannot be a directory (${e.code || e.message})`); process.exit(2); } } // FIX11: the tool owns its destination directory (after the parse and the first effect); refused by name, never a raw stack
const webDir = path.resolve(__pathOpt('--web', { default: new URL('../../web', import.meta.url).pathname, tag: 'check-pocket-construction', mustExist: 'dir' }));
const expectRed = args.includes('--expect-red');
// R3-SNK-12: `--arm plank-lids` inverts P1's facing test (counts the UP-facing
// lid triangles as inverted) — the census arithmetic must then FAIL on any
// tree, which proves the bar sees the lids and judges them; the bar's other
// arm is an older tree (8c4021a5), whose planks still carry the slivers.
const armPlankLids = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'plank-lids';
// R3-SNK-BODY-1 (review r3 D): `--arm lid-cover` carries `?obArm=lid-cover` on the
// page URL; table.js dropCoveredInvertedLids then withholds one cover triangle
// per lid, so the covered slivers it alone hid stay in the mesh and P1's
// census must FAIL — the sampling law's own red arm (judged on the P1 row).
const armLidCover = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'lid-cover';
// BODY-3: `--arm plank-dense` carries `?obArm=plank-dense` — table.js skips the
// bevel-safe plank contour pass (bevelSafeContour), so P1 must count the folded lids.
const armPlankDense = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'plank-dense';
// BODY-3B (R-lidcover): `--arm lid-inject` carries `?obArm=lid-inject` — table.js appends one
// covered inverted duplicate to each plank's top lid and lets dropCoveredInvertedLids run:
// P1 must read 0 (the green control); `--arm lid-cover` now injects the same sliver and
// withholds its covers, so P1 must count it.
const armLidInject = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'lid-inject';
// CEREMONY MERGE (ORDER-CRAFT-R3-CEREMONY-MERGE §1.4): `--arm shield-slip` lowers the
// parsed game.js shield line by 100 mm for the S-SHIELD row only — the sink-visible
// ball then hands over far below the chute entry and the row must FLIP to PASS on a
// tree where it reads FAIL; the flip proves the read is live (judged on the row).
const armShieldSlip = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'shield-slip';
// SNK-R30 (S-BOARD): `--arm board-inject` carries `?obArm=board-inject` — table.js re-injects the
// retired corner jamb board; S-BOARD-CLEAR must FAIL naming obPocketBoard on the corner chutes.
const armBoardInject = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'board-inject';
// SNK-R31 (review r5 P2 a/b): `--arm flip-net-winding` restores the cords' pre-fix quad order (WIND-NORMAL must
// FAIL naming obPocketNet); `--arm bridge-prefix` restores the copy-lookup in the phase-slip bridge (NET-BRIDGES
// must FAIL with 0 emitted).
const armFlipNet = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'flip-net-winding';
const armBridgePrefix = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'bridge-prefix';
// SNK-R32 (review r6 P2 b): `--arm occl-flats-off` carries `?obArm=occl-flats-off` — table.js restores the pre-fix
// leather merge (the planar end caps counted into the strip branch, never baked): OCCL-COVER must FAIL with 800 uncovered (812 on 9558b2e6).
const armOcclFlatsOff = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'occl-flats-off';
// SNK-R32 (ballreturn cross-lane finding): `--arm occl-early-read` reads every aOccl attribute at the earliest
// moment after the scene exists, BEFORE the bake is flushed — OCCL-DETERMINISM must read that early digest as
// refused (jobs pending) or different from the settled one.
const armOcclEarlyRead = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'occl-early-read';
// SNK-R33 (review r7 P2 A): `--arm wires-prefix` carries `?obArm=wires-prefix` — table.js restores the upper wire pair's
// pre-fix offset (g/2 + 4): S-WIRE-CLEAR must FAIL naming the chute and piece with the penetration (entry −8.62 mm, lead −8.55, slopes −6.7…−7.9).
const armWiresPrefix = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'wires-prefix';
// SNK-R34 (open row S-RINGWIRE): `--arm wires-ringstart` carries `?obArm=wires-ringstart` — table.js keeps the upper pair's pre-fix
// start P0' inside the slide ring (0.6 rRing along): S-RINGWIRE-CLEAR must FAIL naming the wire with the number (≈ −1.6 mm).
const armWiresRingstart = args.includes('--arm') && args[args.indexOf('--arm') + 1] === 'wires-ringstart';
// --out <path>: machine-readable report (W6-finish pack law: burned
// sheet/INDEX numbers are read from this report, never hand-typed).
// The gate measures the LIVE SCENE, so the basis it records is the web
// tree (git sha when resolvable), not input-file digests.

const PORT = Number(process.env.OB_E2E_PORT ?? 24010);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 24011); // #725 (main 2fabbe4d): the relocated default; the lane band 9550-9579 is claimed at run time by `run-gate --band` (SNK-R30 / GH-687)
// GH-687: one static server + one CDP port from the pins
export const PORT_INVENTORY = { http: 1, cdp: 1 };

const { launchChrome, sleep, spawnStaticServer, stopStaticServer } =
  await import(pathToFileURL(path.join(webDir, 'tools/cdp.mjs')).href);

// FIX11 (review round 11 on #731 P2 A): ONE readiness law — the shared preflight's bounded wait, then the FIX3 checks (the listener is
// OURS by pid lineage; the served /sw.js + /app.html bytes are the requested --web tree's); a server that never binds inside the bound
// exits 78 by name. `--perturb=slow-server` (the arm) binds the same owned server 4 s late.
const __PERTURB = __P.value('--perturb');
if (__PERTURB !== null && __PERTURB !== 'slow-server' && __PERTURB !== 'slow-server-only' && __PERTURB !== 'early-sample' && __PERTURB !== 'cast-miss' && __PERTURB !== 'furniture-short' && __PERTURB !== 'pocket-write-during' && __PERTURB !== 'preview-write-during') { console.error(`[check-pocket-construction] REFUSED — unknown perturbation ${JSON.stringify(__PERTURB)} (known: slow-server, slow-server-only, early-sample, cast-miss, furniture-short, pocket-write-during, preview-write-during)`); process.exit(2); }
const { awaitOwnedServer, spawnOwnedServerDelayed, refusal: __refusal } = await import('./lib/serve-check.mjs');
const { awaitGeometrySettle: __awaitSettle, GEOMETRY_SIGNATURE_EXPR: __SIG } = await import('./lib/settle.mjs'); // FIX4: the readiness law
// FIX4 (4), GH-1080 r3: the same per-mesh signature over the instrument basis [obTable] only.
const __SIG_TABLE = __SIG.replace('scene.traverse((o) => {', "const root = scene.getObjectByName('obTable'); if (!root) return 'no-table';\n  root.traverse((o) => {");
if (__SIG_TABLE === __SIG) throw new Error('check-pocket-construction: the shared signature expression changed shape; cannot scope it to obTable');
const __evalSig = (x) => chrome.eval(x === __SIG ? __SIG_TABLE : x);
const __t0r = Date.now();
const server = (__PERTURB === 'slow-server' || __PERTURB === 'slow-server-only') ? spawnOwnedServerDelayed(webDir, PORT, 4000) : spawnStaticServer(webDir, PORT);
try { await awaitOwnedServer(server, PORT, webDir, 'check-pocket-construction'); }
catch (e) { console.error(e.message); await stopStaticServer(server); process.exit(e.exitCode ?? 2); }
// `slow-server-only` (the battery's arm row): the law is the subject — the tool stops here, before the browser, once its late-bound owned server
// passed the readiness law; the full run through the browser is the tool's ordinary path (its CDP stall under load is an OPEN row, not this law's)
if (__PERTURB === 'slow-server-only') { console.log(`[check-pocket-construction] readiness: the owned server bound late and the law proceeded after ${Date.now() - __t0r} ms (perturb slow-server-only) — stopping before the browser`); await stopStaticServer(server); process.exit(0); }
// GH-489 SNK-R35 (review r9 P2 A): the served-tree identity is judged against the tree this run MEANS to serve (--web) — cdp.mjs preflightServedTree through launchChrome's preflightWebDir; the URL carries the lane's red arms (SNK-R30..R37)
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html${armWiresRingstart ? '?obArm=wires-ringstart' : armWiresPrefix ? '?obArm=wires-prefix' : armOcclFlatsOff ? '?obArm=occl-flats-off' : armLidCover ? '?obArm=lid-cover' : armPlankDense ? '?obArm=plank-dense' : armLidInject ? '?obArm=lid-inject' : armBoardInject ? '?obArm=board-inject' : armFlipNet ? '?obArm=flip-net-winding' : armBridgePrefix ? '?obArm=bridge-prefix' : ''}`,
  { port: CDP, tool: false, preflightWebDir: webDir });
let failures = 0;
const bars = [];
const __lines = []; // FIX4 (6): bars and INFO rows are buffered and printed together after the post-sample law — a refusal prints no number
// R3-SNK-12: the N4 ray evidence has to outlive the try/finally that owns
// `m`, because the --out report is written after the browser is closed.
let netDump = null;
// SNK-R32 OCCL-DETERMINISM: the in-page aOccl multiset digest — per mesh carrying aOccl, sha256 of the raw
// Float32 bytes repeated per instance (exactly what clay-study-489 writes to the dump, so
// tools/render/occl-hash-489.mjs on a dump prints the same digests); rows sorted by name:count:sha256.
const OCCL_DIGEST_JS = `(async () => {
  const s = window.__snkOccl; const pending = s && s.pending ? s.pending() : null;
  const scene = window.__dbg.scene; const rows = [];
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const meshes = []; scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('aOccl')) meshes.push(o); });
  for (const o of meshes) {
    const a = o.geometry.getAttribute('aOccl'); const inst = o.isInstancedMesh ? o.count : 1; const src = a.array; const per = a.itemSize * a.count;
    const rep = new src.constructor(per * inst); for (let t = 0; t < inst; t++) rep.set(src.subarray(0, per), t * per);
    const h = hex(await crypto.subtle.digest('SHA-256', rep.buffer.slice(rep.byteOffset, rep.byteOffset + rep.byteLength)));
    rows.push({ name: o.name || '(anon)', count: a.count * inst, sha256: h });
  }
  const keyOf = (r) => r.name + ':' + r.count + ':' + r.sha256; rows.sort((p, q) => (keyOf(p) < keyOf(q) ? -1 : keyOf(p) > keyOf(q) ? 1 : 0)); // code-point order (host-locale independent)
  const enc = new TextEncoder().encode(rows.map((r) => r.name + ':' + r.count + ':' + r.sha256).join('\\n'));
  const digest = hex(await crypto.subtle.digest('SHA-256', enc));
  return JSON.stringify({ pending, meshes: rows.length, digest, rows });
})()`;
let occlEarly = null;
let occlReport = null;
const bar = (name, ok, detail) => {
  bars.push([name, ok, detail]);
  __lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok) failures += 1;
};
const infos = [];
/** MEASURED-only row (fullview-overlay-489's `info` convention): printed and
 * written to the report, never judged, never in the verdict. Used where the
 * measurement is real and wanted but the pass/fail law lives elsewhere — a red
 * bar nobody can close is noise; a printed number with its cause named is
 * evidence. */
const info = (name, detail) => {
  infos.push([name, detail]);
  __lines.push(`INFO  ${name} — ${detail}`);
};
let __refused = 0; // FIX4: a refusal's exit code (3) — set in the catch, applied after the finally
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(300);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never ready');
  // GH-489 SNK-R37 (landing rule L3): a URL arm fires only on a SCRIPTED boot (table.js obArmOn). This tool boots the
  // app as a real user (tool:false) and switches to snooker below, so an ARMED run declares the app's own scripted
  // carry (the sessionStorage flag main.js writes on ?obtool boots) before the snooker build — the boot itself, the
  // green run and the pins the carry governs at boot are untouched (the flag is set after the default table exists).
  if (await chrome.eval('location.search.includes("obArm=")').catch(() => false)) {
    await chrome.eval("sessionStorage.setItem('ob-scripted', '1')");
  }
  const g = await chrome.eval(
    "__settings.changeGame('snooker', { skipConfirm: true })");
  if (g !== true) throw new Error(`game switch failed: ${g}`);
  // SNK-R32 occl-early-read: the page boots the DEFAULT table (diamond_proam, no aOccl) and this gate switches it to
  // snooker here — the earliest meaningful read is right after the switch, before the 1.5 s settle sleep below
if (armOcclEarlyRead) {
    // the earliest MEANINGFUL moment: the scene exists AND at least one geometry carries the aOccl attribute (the
    // leather merge allocates it synchronously when its jobs are queued; the bake lands later) — reading before the
    // table is built would only hash an empty set (dev: "0 meshes, e3b0c442…"), which proves nothing about the race
    await chrome.eval(`(async () => { const has = () => { let n = 0; window.__dbg.scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('aOccl')) n++; }); return n; };
      const t0 = Date.now(); while (!(window.__dbg && window.__dbg.scene && has() > 0)) { if (Date.now() - t0 > 60000) return 'timeout'; await new Promise((r) => setTimeout(r, 10)); } return 'occl-attributes-present'; })()`).then((r) => { if (r === 'timeout') console.log('[occl-early-read] no aOccl attribute appeared within 60 s — the arm reads NOT ARMED by name'); });
    occlEarly = JSON.parse(await chrome.eval(OCCL_DIGEST_JS));
    console.log(`[occl-early-read] read at the earliest moment: pending ${occlEarly.pending}, ${occlEarly.meshes} meshes, digest ${occlEarly.digest.slice(0, 16)}`);
  }
  // FIX4 (1): READINESS = the settle law, not a fixed sleep. The plant skips it and samples at once.
  let __sigBefore;
  if (__PERTURB === 'early-sample') {
    __sigBefore = String(await chrome.eval(__SIG_TABLE));
    console.log('[check-pocket-construction] perturb early-sample: the settle law is SKIPPED — the instruments run on the very next command after the switch');
  } else {
    const st = await __awaitSettle(__evalSig, { tag: 'check-pocket-construction' });
    __sigBefore = String(await chrome.eval(__SIG_TABLE));
    console.log(`[check-pocket-construction] readiness: geometry settled after the switch — ${st.meshes} meshes, ${st.reads} reads, ${st.changes} change(s) (last at +${st.lastChangeMs} ms), ${st.ms} ms`);
  }
  const m = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const T = await import('./scene/table.js');
    const G = T.makeGeom('wpbsa_snooker_12ft');
    const scene = window.__dbg.scene;
    // FIX4 (2)+(3): the instrument basis is the table group; the pocket build must be complete before any instrument
    const ROOT = scene.getObjectByName(${__PERTURB === 'cast-miss' ? "'obTable-planted-misscope'" : "'obTable'"}); // --perturb=cast-miss (the #637 main merge, condition 3): a mis-scoped instrument basis must REFUSE by name, never print a bar
    if (!ROOT) return JSON.stringify({ refused: 'no obTable group in the scene — the instruments have no table to measure' }); // the eval contract is a JSON string (the caller parses); a raw object here crashed the tool with SyntaxError instead of refusing by name (#637 main merge, seen on the R3-SNK furniture)
    ${__PERTURB === 'furniture-short' ? "{ const victim = ROOT.getObjectByName('obPocketNet'); if (victim && victim.parent) victim.parent.remove(victim); } // --perturb=furniture-short: one net mesh removed before the census (must REFUSE by name: obPocketNet 2/3)" : ''}
    const inventory = {};
    ROOT.traverse((o) => { if (o.isMesh && /^obPocket/.test(o.name)) inventory[o.name] = (inventory[o.name] || 0) + 1; });
    // R3-SNK furniture census — class | count | DEFINING ROW in the file header (FIX4 (3) COMPLETENESS CENSUS); the sealed identity dump confirms it (meshes ^obPocket under obTable).
    // main's pre-R3 list { obPocketNet: 4, obPocketNetSkirt: 2, obPocketCap: 1, obPocketShade: 2, obPocketRing: 1, obPocketWire: 1, obPocketTrack: 1, obPocketFallWall: 2 } described the
    // pre-R3 pocket (SUPERSEDED by the R3-SNK rebuild: NetSkirt and Wire no longer exist as meshes, Net 4→3, Shade 2→1, Lining 1→2); every class the R3 build emits is pinned at its built count.
    const NEED = { obPocketBoard: 1, obPocketCap: 1, obPocketEmboss: 1, obPocketFallRoll: 1, obPocketFallWall: 2, obPocketLining: 2, obPocketMouthShade: 1, obPocketNet: 3, obPocketPlate: 1, obPocketRing: 1, obPocketRingGather: 1, obPocketShade: 1, obPocketStitch: 1, obPocketStrap: 1, obPocketStrapIron: 1, obPocketStrapPlate: 1, obPocketTrack: 1, obPocketValance: 1 };
    const short = Object.entries(NEED).filter(([k, n]) => (inventory[k] || 0) < n).map(([k, n]) => k + ' ' + (inventory[k] || 0) + '/' + n);
    if (short.length) return JSON.stringify({ refused: 'pocket build incomplete under obTable: ' + short.join(', ') + ' — no instrument is read from a half-built pocket', inventory });
    const CAST = [ROOT];
    const rc = new THREE.Raycaster();
    const hitAt = (x, z) => {
      rc.set(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0, -1, 0));
      return rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh)[0] ?? null;
    };
    const hHit = (x, y, z, dx, dz) => {
      rc.set(new THREE.Vector3(x, y, z),
        new THREE.Vector3(dx, 0, dz).normalize());
      return rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh)[0] ?? null;
    };
    // wood material identity from a mid-rail plank pin
    const woodPin = hitAt(0.5, G.W / 2 + G.CW + G.render.frameWidth / 2);
    const woodUuid = woodPin?.object.material?.uuid ?? null;
    const isWood = (h) => !!h && h.object.material?.uuid === woodUuid;
    // R3-SNK-11 B2: the CLOTH material identity, pinned the way C14 pins
    // it (bed-height down-rays at the same five off-spot stations). The
    // cushion loft carries the bed's cloth material — that is what makes
    // C14's 'cloth' family the cushion section — so this uuid is what
    // names "the crown" for C12 below.
    let clothPin = null;
    for (const [cx, cz] of [[0.42, 0.31], [-0.42, 0.31], [0.42, -0.31],
      [-0.42, -0.31], [0.2, 0.35]]) {
      const hc = hitAt(cx, cz);
      if (hc && Math.abs(hc.point.y) < 0.004) { clothPin = hc; break; }
    }
    const clothUuid = clothPin?.object.material?.uuid ?? null;
    // ---------- corner instruments (rt pocket, +x+z) ----------
    const nc = { x: G.L / 2, z: G.W / 2 };           // nose corner point
    const dg = Math.SQRT1_2;
    // open = the mouth-open test: straight-down first hit below the cull line
    // craft R3-SNK-5: the net's funnel hangs INSIDE the fall opening (the
    // Magnum's funnel reaches 0.78 r_flap 34 mm under the flap foot), so a
    // down-ray may meet a cord before the depth test — the OPENNESS read
    // (the fall Ø, the cup centre) looks through obPocketNet: the first
    // SOLID hit decides; the net's presence has its own rows (N1–N5, C4b)
    const hitSolid = (x, z) => {
      rc.set(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0, -1, 0));
      return rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name !== 'obPocketNet')[0] ?? null;
    };
    const open = (x, z) => { const h = hitSolid(x, z); return !h || h.point.y < -0.055; };
    // diagonal scan for the visible fall aperture
    let sIn = null, sOut = null;
    for (let s = -0.07; s <= 0.24; s += 0.0005) {
      const o = open(nc.x + s * dg, nc.z + s * dg);
      if (o && sIn === null) sIn = s;
      if (sIn !== null) { if (o) sOut = s; else if (sOut !== null) break; }
    }
    const sMid = (sIn + sOut) / 2;
    // R3-SNK-9 (RULING R-S8-2): the render fall is the kernel disc about the
    // slate corner, not a hole about the plate — the openness scan no
    // longer bounds a hole (it runs from the cloth arris to the flap's
    // inboard face), so the MEASURED PLATE CENTRE is read from the FLAP
    // CIRCLE itself: horizontal rays at the flap's mid height from a seed
    // inside the mouth (the live plate datum) to the first obPocketCap hit
    // at 16 azimuths, one circle fit (Kåsa) → cup = the fitted centre,
    // flapDia = its diameter. The seed only has to lie inside the flap.
    const seedC = ((T.pocketPlateDatums ?? T.pocketVisualFalls) ? (T.pocketPlateDatums ?? T.pocketVisualFalls)('wpbsa_snooker_12ft') : [])
      .find((q) => q.x > 0 && q.z > 0) ?? { x: nc.x + sMid * dg, z: nc.z + sMid * dg, r: 0.0421 };
    const flapPts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      rc.set(new THREE.Vector3(seedC.x, 0.0090, seedC.z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      const h = rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name === 'obPocketCap')[0];
      if (h && h.distance < 0.080) flapPts.push([h.point.x, h.point.z]);
    }
    const fitK = (P2) => {
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = P2.length;
      for (const [x, y] of P2) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
      const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [sxz, syz, sz];
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const d0 = det(A); const sub = (c) => A.map((row, i) => row.map((v, j) => (j === c ? B[i] : v)));
      const a = det(sub(0)) / d0, b = det(sub(1)) / d0, c = det(sub(2)) / d0;
      const cx = a / 2, cy = b / 2; return { cx, cy, r: Math.sqrt(Math.max(0, c + cx * cx + cy * cy)) };
    };
    const flapFit = flapPts.length >= 8 ? fitK(flapPts) : null;
    const cup = flapFit ? { x: flapFit.cx, z: flapFit.cy } : { x: seedC.x, z: seedC.z };
    const flapDia = flapFit ? 2 * flapFit.r : NaN;
    // the plate's inner datum radius (the former CEBP label, now the plate's
    // rv only — SNK_FALL.cornerDia / 2) keeps its consumers (the ring-iron
    // mirror, the skirt-row lip offset) on the same datum as the build
    const holeDia = 2 * (seedC.r ?? 0.0421);
    // the kernel FALL disc read: from the slate corner K (nose corner + CW
    // on both axes) march outward along rays across the inboard quarter
    // (± 40° about the inboard diagonal) with down-rays: the first station
    // whose top hit is the bed cloth at y ≈ 0 is the cloth edge (arris);
    // a circle fit of those stations → the fall disc (expected R + lip =
    // 92.9 about K; the wall itself sits at R 88.9)
    const K = { x: nc.x + G.CW, z: nc.z + G.CW };
    const fallEdge = [];
    for (let k = -4; k <= 4; k++) {
      const a = Math.atan2(-1, -1) + (k * 10 * Math.PI) / 180; // inboard diagonal ± 40°
      const ux = Math.cos(a), uz = Math.sin(a);
      for (let r = 0.075; r <= 0.115; r += 0.0005) {
        const h = hitSolid(K.x + r * ux, K.z + r * uz);
        if (h && h.point.y > -0.0015 && h.point.y < 0.0015 && /cloth|obSnkBed|^$/.test(h.object.name || '')) { fallEdge.push([K.x + r * ux, K.z + r * uz, r]); break; }
      }
    }
    const fallFit = fallEdge.length >= 5 ? fitK(fallEdge.map(([x, z]) => [x, z])) : null;
    const fallDisc = fallFit ? { r: fallFit.r, dx: (fallFit.cx - K.x), dz: (fallFit.cy - K.z), n: fallEdge.length,
      rMin: Math.min(...fallEdge.map((e) => e[2])), rMax: Math.max(...fallEdge.map((e) => e[2])) } : null;
    // kernel mouth line: world jaw tips from the canonical corner
    // construction (canonical (u,v) → rt corner world (L/2−u? no: the rt
    // corner's rails run −x (long) and −z (end): u along the long rail
    // toward the table = −x; v behind the end-rail nose = +z beyond W/2)
    const [tu, tv] = G.corner.x;
    const T1 = { x: G.L / 2 - tu, z: G.W / 2 - tv }; // long-rail jaw tip
    const T2 = { x: G.L / 2 - tv, z: G.W / 2 - tu }; // end-rail jaw tip
    const mid = { x: (T1.x + T2.x) / 2, z: (T1.z + T2.z) / 2 };
    const el = Math.hypot(T2.x - T1.x, T2.z - T1.z);
    const ex = (T2.x - T1.x) / el, ez = (T2.z - T1.z) / el;
    // wood onsets along the mouth line (top-down, plank heights)
    const onset = (sgn) => {
      for (let t = el / 2 - 0.006; t <= 0.09; t += 0.0005) {
        const h = hitAt(mid.x + sgn * t * ex, mid.z + sgn * t * ez);
        if (isWood(h) && h.point.y > 0.02) return t;
      }
      return null;
    };
    const w1 = onset(1), w2 = onset(-1);
    const chord = (w1 ?? 0) + (w2 ?? 0);
    const cupDist = w1 === null ? null : Math.hypot(
      mid.x + w1 * ex - cup.x, mid.z + w1 * ez - cup.z);
    // face-plane station along the long rail. R3-SNK-7: read on the PLANK's
    // own vertices (the wood-material meshes' max x in the long-rail band
    // near the corner, above the seat) — the extrude's end face is exact
    // there; the former top-down "first wood" scan was biased 1–2 mm
    // inside the plane by the leather's 0.9 mm lap (E15) and the flare
    // roof, and by the retired end-grain veneer standing 0.15 mm inside
    let faceX = null;
    {
      const vtx = new THREE.Vector3();
      scene.traverse((o) => {
        if (!o.isMesh || o.material?.uuid !== woodUuid) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          vtx.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (vtx.z > G.W / 2 + 0.03 && vtx.z < G.W / 2 + 0.14 && vtx.x > G.L / 2 - 0.12
            && vtx.x < G.L / 2 && vtx.y > 0.02 && (faceX === null || vtx.x > faceX)) faceX = vtx.x;
        }
      });
    }
    if (faceX === null) {
      for (let x = G.L / 2 + 0.02; x >= G.L / 2 - 0.12; x -= 0.0005) {
        const h = hitAt(x, G.W / 2 + G.CW + G.render.frameWidth / 2);
        if (isWood(h) && h.point.y > 0.02) { faceX = x; break; }
      }
    }
    // predicted crossing of the mouth line with the long-rail face plane:
    // the face is ⊥ the rail through the mouth line by construction — the
    // bar measures |measured face station − mouth-line crossing at the
    // plank band|; the mouth line crosses x = mid.x + t*ex ... solve t at
    // z = plank mid-band? the face is ⊥x: report the face's offset from
    // the mouth line measured ⊥ (distance from the face plane to the
    // line's crossing of the band centre)
    const zBand = G.W / 2 + G.CW + G.render.frameWidth / 2;
    // mouth line: p = mid + t·ê ; at the face plane x = faceX:
    const tAtFace = faceX === null ? null : (faceX - mid.x) / ex;
    const zLineAtFace = tAtFace === null ? null : mid.z + tAtFace * ez;
    // wood-face inner corner ≈ (faceX, wood onset in z going inward):
    let faceInnerZ = null;
    if (faceX !== null) {
      // W11 r8 amendment: the scan moves INSIDE the plank (−2 mm) and
      // reads THROUGH the jaw drape — the pre-fix probe scanned +2 mm
      // BEYOND the face and measured the folded-outline SHARD wedge as
      // the inner corner (the r8 plank-filter fix removed the fold);
      // the wood ends are cloth-wrapped by construction, so the first
      // sub-cloth surface within the ply class is the wood read
      for (let z = G.W / 2 - 0.01; z <= G.W / 2 + 0.14; z += 0.0005) {
        rc.set(new THREE.Vector3(faceX - 0.002, 0.5, z),
          new THREE.Vector3(0, -1, 0));
        const hits = rc.intersectObjects(CAST, true)
          .filter((i) => i.object.visible !== false && i.object.isMesh);
        let h = hits[0] ?? null;
        if (h && h.object.name === 'obSnkJawWrap') {
          const under = hits.find((i) => i.object.name !== 'obSnkJawWrap'
            && i.point.y > h.point.y - 0.0026);
          h = under ?? null;
        }
        if (isWood(h) && h.point.y > 0.02) { faceInnerZ = z; break; }
      }
    }
    const mouthLineOff = (faceInnerZ === null || tAtFace === null) ? null
      : Math.abs((faceInnerZ - zLineAtFace) * ex); // ⊥ distance component
    // R3-SNK-7: the expected offset AT THE SCAN STATION (faceX − 2 mm, and
    // faceX itself reads ≈ 1 mm inside the true face because the leather
    // laps the end plane) — the plank-side band (kernel circle c2 offset
    // by the 8 mm wall − 0.5 tuck, table.js snkJawBandPts mirror) at that
    // u, ⊥ the kernel mouth line through the tips
    let mouthOffPred = null;
    if (faceX !== null) {
      const uScan = G.L / 2 - (faceX - 0.002);
      // R3-SNK-8 mirror of snookerFallCtx.jawExt: the continuation circle is
      // tangent to c2 at the kernel tip and passes through the flap
      // crossing on the end plane (flap r = rv + lip 4 + flapOut 2.1); the
      // plank-side band is its parallel curve at r − 7.5 (wall 8 − tuck 0.5)
      const cupU = -(Math.abs(cup.x) - G.L / 2); // canonical cup offset (negative outboard)
      const uFaceK = G.L / 2 - (T.pocketFaceStations('wpbsa_snooker_12ft').xFace);
      const rFlapK = T.pocketFaceStations('wpbsa_snooker_12ft').rvC + 0.004 + 0.0021;
      const duK = uFaceK - cupU;
      const rootK = rFlapK * rFlapK - duK * duK;
      let vB;
      if (rootK > 0) {
        const E = [uFaceK, cupU - Math.sqrt(rootK)];
        const n = [(G.corner.c2[0] - tu) / G.corner.r2, (G.corner.c2[1] - tv) / G.corner.r2];
        const ex = E[0] - tu, ey = E[1] - tv;
        const sR = (ex * ex + ey * ey) / (2 * (ex * n[0] + ey * n[1]));
        const C = [tu + sR * n[0], tv + sR * n[1]];
        const rOffB = sR - 0.0075;
        // the band = the offset arc, closed by the round end cap (radius
        // 7.5) about the wall end E where the arc's offset cannot reach the
        // plane (the wall meets it at a grazing angle) — the scan station
        // 2 mm inside the plane lies on that cap
        const uCapMax = E[0] + 0.0075 * Math.cos(Math.atan2(Math.sin(Math.atan2(E[1] - C[1], E[0] - C[0]) + Math.PI), Math.cos(Math.atan2(E[1] - C[1], E[0] - C[0]) + Math.PI)));
        if (uScan <= uCapMax) vB = E[1] - Math.sqrt(Math.max(0, 0.0075 * 0.0075 - (uScan - E[0]) * (uScan - E[0])));
        else {
          const cB = Math.max(-1, Math.min(1, (uScan - C[0]) / rOffB));
          vB = C[1] + rOffB * Math.sin(Math.acos(cB));
        }
      } else {
        const rOffB = G.corner.r2 - 0.0075;
        const cB = Math.max(-1, Math.min(1, (uScan - G.corner.c2[0]) / rOffB));
        vB = G.corner.c2[1] + rOffB * Math.sin(Math.acos(cB));
      }
      mouthOffPred = Math.abs((uScan + vB) - (tu + tv)) / Math.SQRT2;
    }
    // zero-wood outside: diagonal + ±20° beyond the aperture
    let woodOutside = 0;
    for (const off of [-20, 0, 20]) {
      const a = Math.PI / 4 + (off * Math.PI) / 180;
      const dx = Math.sin(a), dz = Math.cos(a);
      for (let r = holeDia / 2 + 0.002; r <= 0.15; r += 0.001) {
        const h = hitAt(cup.x + r * dx, cup.z + r * dz);
        if (isWood(h) && h.point.y > 0.02) woodOutside += 1;
      }
    }
    // throat wall classification at depths (horizontal ray from the centre)
    const wallAt = (y) => {
      const h = hHit(cup.x, y, cup.z, dg, dg);
      return h ? { n: h.object.name || h.object.type, d: +h.distance.toFixed(4) } : null;
    };
    const th20 = wallAt(-0.020), th30 = wallAt(-0.030), th40 = wallAt(-0.040);
    // craft R3-SNK-2 (Magnum construction): the cloth-dressed fall face
    // exists on the TABLE-SIDE half of the throat; the outward half below
    // the leather flap is the pocket cavity (cord lattice over the dark
    // leather-back lining). Probe both halves: the inward ray (toward the
    // table centre) and the outward ray (the retired W6 probe direction).
    // R3-SNK-9 (RULING R-S8-2): the fall is the kernel disc, so the cords
    // now hang on the table side ahead of the cloth face (the Magnum's air
    // under the flap) — the inward probe reads the first NON-knit surface
    const wallInAt = (y) => {
      rc.set(new THREE.Vector3(cup.x, y, cup.z), new THREE.Vector3(-dg, 0, -dg).normalize());
      const h = rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh
          && i.object.name !== 'obPocketNet')[0] ?? null;
      return h ? { n: h.object.name || h.object.type, d: +h.distance.toFixed(4) } : null;
    };
    const tin20 = wallInAt(-0.020), tin30 = wallInAt(-0.030), tin35 = wallInAt(-0.035);
    const tin45 = wallInAt(-0.045);
    // C4b' knit presence at −40 on the outward half: 7 horizontal rays
    // fanned ±15° about the outward diagonal
    let knit40 = 0;
    const out40 = [];
    for (let k = -3; k <= 3; k++) {
      const a = Math.PI / 4 + (k * 5 * Math.PI) / 180;
      const h = hHit(cup.x, -0.040, cup.z, Math.sin(a), Math.cos(a));
      const n = h ? (h.object.name || h.object.type) : 'none';
      out40.push(n);
      if (n === 'obPocketNet') knit40++;
    }
    // W16 (gate audit #9): the slate-bore probes — (a) the −35 band
    // between the cloth-wall stop (−34) and the net top (−36), where the
    // bore was the FIRST hit; (b) at −45 the first NON-knit surface
    // behind the funnel (the sleeve must stand in front of the stone).
    const th35 = wallAt(-0.035);
    const boreAt = (y) => {
      rc.set(new THREE.Vector3(cup.x, y, cup.z),
        new THREE.Vector3(dg, 0, dg).normalize());
      const h = rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh
          && i.object.name !== 'obPocketNet')[0] ?? null;
      return h ? { n: h.object.name || h.object.type,
        d: +h.distance.toFixed(4) } : null;
    };
    const bore45 = boreAt(-0.045);
    // outward first NON-knit surface at −35 (the bore band above the old
    // net top) — the drilled stone may never read (C8')
    const bore35 = boreAt(-0.035);
    // stitch row placement (rt corner dashes) — R3-SNK-9 (RULING R-S8-1):
    // TWO rows per pocket; each dash's centre (mean of its V vertices) is
    // assigned to a row by its radius about the cup (the flap-face seam
    // row inside r < 70 mm, the outer skirt row beyond) and the per-row
    // statistics are kept apart (yMean / yMax / rMin / rMax / n)
    const rowsSt = { seam: [], outer: [] };
    scene.traverse((o) => {
      if (o.isMesh && o.name === 'obPocketStitch') {
        const pos = o.geometry.attributes.position;
        const V = o.userData?.obDash?.verts > 0 ? o.userData.obDash.verts : 24;
        for (let d0 = 0; d0 + V <= pos.count; d0 += V) {
          let sx = 0, sy = 0, sz = 0, yMax = -1, rMin = 1e9, rMax = 0;
          for (let i = d0; i < d0 + V; i++) {
            const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
            sx += wx / V; sy += wy / V; sz += wz / V;
            yMax = Math.max(yMax, wy);
            const r = Math.hypot(wx - cup.x, wz - cup.z);
            rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
          }
          if (!(sx > G.L / 2 - 0.2 && sz > G.W / 2 - 0.2)) continue;
          const rc0 = Math.hypot(sx - cup.x, sz - cup.z);
          (rc0 < 0.070 ? rowsSt.seam : rowsSt.outer).push({ y: sy, yMax, rMin, rMax, r: rc0 });
        }
      }
    });
    const rowStat = (a) => (a.length ? {
      n: a.length, yMean: a.reduce((q, d) => q + d.y, 0) / a.length,
      yMax: Math.max(...a.map((d) => d.yMax)), rMin: Math.min(...a.map((d) => d.rMin)),
      rMax: Math.max(...a.map((d) => d.rMax)), rMean: a.reduce((q, d) => q + d.r, 0) / a.length } : null);
    // the leaning flap face's radius at the seam-row height (live spec)
    const flapAtSeam = (() => {
      // outward rays from the cup axis 3 mm UNDER the row (on the straight
      // flap face, clear of the dashes and of the chamfer above the row),
      // median of three azimuths, brought up to the row height along the
      // MODEL lean 6.5° (the face's r grows 0.114 per mm of rise)
      const yS = (G.render.frameTop ?? 0.04018) - 0.02337;
      const rs = [];
      for (const dA of [-1.0, 0, 1.0]) {
        const a = Math.PI / 4 + dA;
        rc.set(new THREE.Vector3(cup.x, yS - 0.003, cup.z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
        const h = rc.intersectObjects(CAST, true)
          .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name === 'obPocketCap')[0];
        if (h) rs.push(Math.hypot(h.point.x - cup.x, h.point.z - cup.z));
      }
      rs.sort((a, b) => a - b);
      return rs.length ? rs[Math.floor(rs.length / 2)] + 0.003 * Math.tan((6.5 * Math.PI) / 180) : NaN;
    })();
    const stitch = rowStat(rowsSt.outer);     // the OUTER row (the R3-SNK-3 single row's successor)
    const stitchSeam = rowStat(rowsSt.seam);  // the flap-face NET-SEAM row (R3-SNK-9)
    // boot crest height at the diagonal (top-down onto the cap)
    let crest = null;
    for (let r = 0.04; r <= 0.11; r += 0.001) {
      const h = hitAt(cup.x + r * dg, cup.z + r * dg);
      if (h && h.object.name === 'obPocketCap') {
        crest = Math.max(crest ?? -1, h.point.y);
      }
    }
    // boot color (cream bar)
    let bootHex = null;
    scene.traverse((o) => {
      if (o.isMesh && o.name === 'obPocketCap' && bootHex === null) {
        bootHex = o.material?.color?.getHex?.() ?? null;
      }
    });
    // ---------- middle instruments (top middle, +z) ----------
    const mc = { x: 0, z: G.W / 2 + G.kernel.sidePocketDepth };
    let mIn = null, mOut = null;
    for (let s = -0.08; s <= 0.12; s += 0.001) {
      const o = open(mc.x, mc.z + s);
      if (o && mIn === null) mIn = s;
      if (mIn !== null) { if (o) mOut = s; else if (mOut !== null) break; }
    }
    let mxIn = null, mxOut = null;
    for (let t = -0.09; t <= 0.09; t += 0.001) {
      const o = open(mc.x + t, mc.z + (mIn + mOut) / 2);
      if (o && mxIn === null) mxIn = t;
      if (mxIn !== null) { if (o) mxOut = t; else if (mxOut !== null) break; }
    }
    const mHole = ((mOut - mIn) + (mxOut - mxIn)) / 2;
    // R3-SNK-10 (RULINGS (a)/(b)): the from-above aperture is no longer a
    // proxy for the fall radius — the slot (± 41.92) is narrower than the
    // kernel disc (R 53.19), so the x-span reads the wood ends and the
    // aperture centre drifts outward. The middle rows now read the fall
    // WALL itself: three horizontal rays at y −15 from the template centre
    // toward the table side (0 / ± 30°) → the first obPocketFallWall hit.
    const mRvRays = [];
    for (const a of [0, Math.PI / 6, -Math.PI / 6]) {
      rc.set(new THREE.Vector3(mc.x, -0.015, mc.z), new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)));
      const h = rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name === 'obPocketFallWall')[0];
      if (h) mRvRays.push(h.distance);
    }
    const mRv = mRvRays.length ? mRvRays.reduce((p, q) => p + q, 0) / mRvRays.length : null;
    const mRvSpread = mRvRays.length ? Math.max(...mRvRays) - Math.min(...mRvRays) : null;
    // middle wood end faces along the rail
    const mFace = (sgn) => {
      for (let x = 0.01 * sgn; Math.abs(x) <= 0.12; x += 0.0005 * sgn) {
        const h = hitAt(x, G.W / 2 + G.CW + G.render.frameWidth / 2);
        if (isWood(h) && h.point.y > 0.02) return Math.abs(x);
      }
      return null;
    };
    const mf1 = mFace(1), mf2 = mFace(-1);
    // middle throat at −45 mm: outward (+z, the retired W6 probe) and the
    // table-side half (−z, the cloth-dressed fall face — R3-SNK-2)
    const mWall45 = (() => {
      const h = hHit(mc.x, -0.045, mc.z, 0, 1);
      return h ? h.object.name || h.object.type : null;
    })();
    const mWallIn45 = (() => {
      const h = hHit(mc.x, -0.045, mc.z, 0, -1);
      return h ? h.object.name || h.object.type : null;
    })();
    // ---------- W7 extension instruments ----------
    const vis = (o) => {
      for (let q = o; q; q = q.parent) if (q.visible === false) return false;
      return true;
    };
    // B1 bed-protrusion ray set: inboard of BOTH nose lines around every
    // corner (diagonal band 95–165 mm from the cup + laterals) and the
    // middle bays; first hit must sit at/below bed level (a fall aperture
    // hit below the cull line also satisfies ≤ bed)
    const bedBad = [];
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      // R3-SNK-8: the ray set rides the LIVE cup (the plate datum), not the
      // retired 6.2 mm literal
      const ccup = (T.pocketPlateDatums ?? T.pocketVisualFalls)('wpbsa_snooker_12ft')
        .find((f) => Math.sign(f.x) === px && Math.sign(f.z) === pz);
      for (const dmm of [95, 105, 115, 130, 145, 160]) {
        for (const off of [-40, -20, 0, 20, 40]) {
          const d = dmm / 1000, o = off / 1000;
          const ux = -px * dg, uz = -pz * dg; // inward diagonal
          const x = ccup.x + ux * d - uz * o, z = ccup.z + uz * d + ux * o;
          if (Math.abs(x) >= G.L / 2 - 0.001
            || Math.abs(z) >= G.W / 2 - 0.001) continue;
          const h = hitAt(x, z);
          if (h && h.point.y > 0.0015) {
            bedBad.push([+x.toFixed(3), +z.toFixed(3),
              h.object.name || '?', +h.point.y.toFixed(4)]);
          }
        }
      }
    }
    for (const mzs of [1, -1]) {
      for (const dmm of [55, 70, 90]) {
        for (const off of [-45, 0, 45]) {
          const x = off / 1000, z = mzs * (G.W / 2 - dmm / 1000);
          const h = hitAt(x, z);
          if (h && h.point.y > 0.0015) {
            bedBad.push([+x.toFixed(3), +z.toFixed(3),
              h.object.name || '?', +h.point.y.toFixed(4)]);
          }
        }
      }
    }
    // B2 outside-assembly legibility at the S2b register (eye + the ring
    // fan convention of the rev-4-cleared arm; the ring's own live
    // geometry stakes the targets)
    const eye = new THREE.Vector3(2.32, 0.10, 1.20);
    const rtCup = { x: G.L / 2 + 0.0062, z: G.W / 2 + 0.0062 };
    let ringLo = 1, ringHi = -1, ringRad = 0;
    scene.traverse((o) => {
      if (!o.isMesh || o.name !== 'obPocketRing') return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i), wz = pos.getZ(i);
        const dr = Math.hypot(wx - rtCup.x, wz - rtCup.z);
        if (dr < 0.12) {
          ringLo = Math.min(ringLo, pos.getY(i));
          ringHi = Math.max(ringHi, pos.getY(i));
          ringRad = Math.max(ringRad, dr);
        }
      }
    });
    const ringMid = (ringLo + ringHi) / 2, ringCtr = ringRad - 0.004;
    const castTo = (tx, ty, tz) => {
      rc.set(eye, new THREE.Vector3(tx - eye.x, ty - eye.y, tz - eye.z)
        .normalize());
      const h = rc.intersectObjects(CAST, true)
        .filter((k) => k.object.isMesh && vis(k.object))[0];
      return h ? h.object.name || h.object.material?.type || '?' : null;
    };
    let ringSeen = 0, hangSeen = 0, underHemSeen = 0;
    const hangHist = {}, underHist = {};
    // W13 (gate r16 P1-1 iii): the hem now OVERLAPS the ring line by
    // mandate — the rev-4 ring-only fan is retired with its subject
    // (the rev-18 14/64 threaded the OLD hem's tooth gaps). The law's
    // spirit (the hanging assembly must read from outside, never a
    // walled box) counts the whole assembly class; the W6-box red basis
    // still fires (the box blocked every class).
    const HANG = ['obPocketRing', 'obPocketWire', 'obPocketNet',
      'obPocketStrapIron', 'obPocketPlate'];
    if (ringRad > 0) {
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * 2 * Math.PI;
        const n = castTo(rtCup.x + ringCtr * Math.sin(a), ringMid,
          rtCup.z + ringCtr * Math.cos(a));
        if (n === 'obPocketRing' || n === 'obPocketWire') ringSeen++;
        if (HANG.includes(n)) hangSeen++;
        hangHist[n ?? 'none'] = (hangHist[n ?? 'none'] ?? 0) + 1;
      }
    }
    const bootHit = castTo(rtCup.x + 0.066, -0.05, rtCup.z + 0.066);
    // W14 (E18): the sock band reads through the UNDER-HEM gap — the
    // S2b-height eye cannot see below the −105.5 hem lip at this plan
    // radius (the skirt seals it by design), so the sock stake rides a
    // grazing under-hem eye at the same azimuth
    const eyeU = new THREE.Vector3(2.32, -0.062, 1.20);
    const castFromU = (tx, ty, tz) => {
      rc.set(eyeU, new THREE.Vector3(tx - eyeU.x, ty - eyeU.y, tz - eyeU.z)
        .normalize());
      const h = rc.intersectObjects(CAST, true)
        .filter((k) => k.object.isMesh && vis(k.object))[0];
      return h ? h.object.name || h.object.material?.type || '?' : null;
    };
    // craft R3-SNK-5: the sock is a knotted CORD lattice (12 mm meshes,
    // Ø 2.2 cords) gathered to ~33 mm radius at −128 — one ray from the
    // S2b eye threads the meshes on luck (the R3-SNK-5 bytes: the single
    // ray passed the bag and met the far cabinet panel while 5 of 12
    // radial rays at −128 meet cords at r 31–34). The subject ("the sock
    // hangs through the open under-hem gap, not a walled box") is read by
    // a 3 × 3 fan about the same target (±6 mm vertical, ±6 mm lateral):
    // sockHit = the first obPocketNet met by any ray; if none, the centre
    // ray's hit (the rev-12 post-box class still reads its box on every ray)
    const sockFan = [];
    {
      const lat = new THREE.Vector3(-(rtCup.z - eyeU.z), 0, rtCup.x - eyeU.x).normalize();
      for (const dy of [-0.006, 0, 0.006]) {
        for (const dl of [-0.006, 0, 0.006]) {
          sockFan.push(castFromU(rtCup.x + lat.x * dl, -0.128 + dy, rtCup.z + lat.z * dl));
        }
      }
    }
    const sockHit = sockFan.find((n) => /^obPocketNet/.test(n ?? '')) ?? sockFan[4];
    // W14 (E10/E18/E20): the ring re-seats INSIDE the leather at −62.5,
    // so the rev-4/W13 ring-line fan reads leather BY DESIGN; the
    // hardware-visibility law moves BELOW THE HEM (−105.5): a 64-ray
    // fan at y −0.118 (between hem and leg-head top −141.5) must reach
    // the hanging classes (wires / knit / track).
    // A6 (twin row A6 / proposal_ext_r2_7): the fan casts from the
    // GRAZING under-hem eye (the gate's own E18 sock-stake precedent) —
    // the amended XW101-size skirt seals the S2b-height sightline to
    // this band BY MANDATE (the montage's own below-hem hardware read
    // is a downward view through the E9/E18 gap, which eyeU models);
    // the walled-box anti-subject stays guarded by B2b on the hang fan.
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      // LAW r3_4: the hem is MFR −0.1055 (OEM elevation) and the bag ends
      // at the MODEL band −0.111/−0.121 — the under-hem band stays
      // y −0.118 (between the hem and the band bottom)
      const n = castFromU(rtCup.x + 0.075 * Math.sin(a), -0.118,
        rtCup.z + 0.075 * Math.cos(a));
      // 489 PASS-2: the boot-width knit skirt (obPocketNetSkirt) IS the
      // under-hem knit read — same acceptance family as the sock
      if (n === 'obPocketWire' || n === 'obPocketNet'
        || n === 'obPocketNetSkirt' || n === 'obPocketTrack') underHemSeen++;
      underHist[n ?? 'none'] = (underHist[n ?? 'none'] ?? 0) + 1;
    }
    // B3 middle knit-top band: vertical first-net reads at 0.9 rv
    const netAt = (x, z) => {
      rc.set(new THREE.Vector3(x, 0.4, z), new THREE.Vector3(0, -1, 0));
      const h = rc.intersectObjects(CAST, true)
        .filter((k) => k.object.isMesh && vis(k.object)
          && k.object.name === 'obPocketNet')[0];
      return h ? h.point.y : null;
    };
    const mKnit = [], mKnitMiss = []; // FIX4 (5): every station answers or is named (main's hardening) — stations per R3-SNK-10 (the snooker lane's row set)
    const KNIT_STATIONS = [['+x', 0], ['+z', Math.PI / 2], ['-x', Math.PI], ['-z', -Math.PI / 2]];
    for (const [label, th] of KNIT_STATIONS) {
      const y = netAt(mc.x + Math.cos(th) * (mRv ?? mHole / 2) * 0.9,
        mc.z + Math.sin(th) * (mRv ?? mHole / 2) * 0.9); // R3-SNK-10: about the template centre, at 0.9 × the measured wall radius
      if (y !== null) mKnit.push(+y.toFixed(4)); else mKnitMiss.push(label);
    }
    const mKnitTop = mKnit.length ? Math.max(...mKnit) : null;
    // R3-SNK-2 B3': the net's MOUTH is a saddle — on the outward half the
    // first course hangs from the leather flap (row-1 knots right under
    // the flap edge, +2.6), on the table side it is laced to the ring
    // iron (−75): first obPocketNet on vertical rays at 0.9 rv, outward
    // (+z) and inward (−z) of the middle cup
    // R3-SNK-10: the fans and the knit rays originate at the TEMPLATE centre
    // (the fall's and the plate's centre by construction) — the aperture
    // centre (mIn + mOut) / 2 drifted 1–2 mm outward once the slot clipped
    // the x-span and biased every inward radius by that much
    const mzC = mc.z;
    const mKnitOut = netAt(mc.x, mzC + (mRv ?? mHole / 2) * 0.9);
    const mKnitIn = netAt(mc.x, mzC - (mRv ?? mHole / 2) * 0.9);
    // R3-SNK-2 middle net MOUTH (B3): horizontal 7-ray fans from the cup
    // axis — outward at +1.5 mm (the row-1 knots hang right under the
    // flap edge at +2.6), inward at the ring plane −75 (the cords are
    // laced to the ring iron there). Each fan reports the first
    // obPocketNet hit radii (the lattice is sparse: one hit in seven is
    // a positive read) and the first NON-net hit names.
    const mouthFan = (y, dirZ) => {
      const rs = [], others = [];
      for (let k = -3; k <= 3; k++) {
        const a = (k * 5 * Math.PI) / 180;
        const dx = Math.sin(a) * dirZ, dz = Math.cos(a) * dirZ;
        rc.set(new THREE.Vector3(mc.x, y, mzC), new THREE.Vector3(dx, 0, dz));
        const hits = rc.intersectObjects(CAST, true)
          .filter((i) => i.object.visible !== false && i.object.isMesh
            && i.distance < 0.2);
        const net = hits.find((i) => i.object.name === 'obPocketNet');
        if (net) rs.push(+net.distance.toFixed(4));
        const first = hits[0];
        if (first && first.object.name !== 'obPocketNet') others.push(first.object.name);
      }
      return { rs, others };
    };
    const mMouthOut = mouthFan(0.0015, 1), mMouthIn = mouthFan(-0.075, -1);
    // ---- 489 BLOCKER-CURE C9 (B9 collar-roll facets): the boot profile
    // STATION LAW measured on the live mesh — down-rays along the
    // outward diagonal across the dome/brim read geometric FACE normals
    // (raycast face normals are unsmoothed), so each adjacent-sample
    // normal step is the profile's own station angle. The identity
    // round's 15-deg stations survived at 1x video zoom (the
    // adversarial review's flat chord planes); the cure law is <= 9.5
    // deg (dome densified to <= 8, brim to 7.5).
    const profSteps = [];
    {
      let prevN = null;
      // dome/brim band only (0.054-0.118 from the cup), upper-surface
      // faces only (ny >= 0.5 on both samples): the near-vertical throat
      // lip, the dome-tail-to-roll tuck wall and the brim's fold-under /
      // silhouette flank are CONSTRUCTION transitions or radially
      // unresolvable (stations pack sub-sample near the silhouette) —
      // the law judges the visible roll's tessellation. Pitch +
      // consecutive-face dedupe: the pitch must be finer than the
      // smallest facet's plan width so ADJACENT hits are ADJACENT faces
      // — 0.5 mm resolved the dome/brim stations (dr >= 0.8 mm); the
      // R3-SNK-2 flush plate's 4 mm edge rounds run 3.9° facets 0.23 mm
      // wide in plan, so a 0.5 mm pitch skipped 2-3 facets and read
      // their SUM (11.6°) as one step. Pitch 0.1 mm (R3-SNK-2): the read
      // is the facet angle itself again; the identity round's 15°
      // stations still read 15° at any pitch (red basis unchanged).
      let prevFace = -1;
      for (let rr = 0.054; rr <= 0.118; rr += 0.0001) {
        rc.set(new THREE.Vector3(cup.x + rr * dg, 0.5, cup.z + rr * dg),
          new THREE.Vector3(0, -1, 0));
        const h = rc.intersectObjects(CAST, true)
          .filter((i) => i.object.visible !== false && i.object.isMesh)[0];
        if (h && h.object.name === 'obPocketCap' && h.face) {
          if (h.faceIndex === prevFace) continue;
          prevFace = h.faceIndex;
          const n = h.face.normal.clone()
            .transformDirection(h.object.matrixWorld);
          if (prevN && n.y >= 0.5 && prevN.y >= 0.5) {
            const d = Math.acos(Math.min(1, Math.max(-1, n.dot(prevN))))
              * 180 / Math.PI;
            profSteps.push([+rr.toFixed(4), +d.toFixed(2)]);
          }
          prevN = n;
        } else { prevN = null; prevFace = -1; }
      }
    }
    const profStepMax = profSteps.length
      ? Math.max(...profSteps.map((p2) => p2[1])) : null;
    // ---- 489 WEDGE+PLATFORM cure C11 (owner finale finding #2, blue
    // circle): the boot's UPPER SURFACE along the outward diagonal must
    // be a single monotone-convex fall from the dome crest through the
    // brim curl — the pre-cure ladder jumped from the dome tail onto the
    // brim tube's exposed upper quadrant (a 19.6 mm cliff, then the
    // surface ROSE 1.4 mm back onto the tube top), which read as a
    // protruding stepped platform ringing the boot. Down-ray height
    // profile h(r) at 0.5 mm pitch over r ∈ [0.086, 0.118]:
    //   (a) NO INTERIOR RISE: cumulative rise from any local min ≤ 0.4 mm
    //       (pre-cure: +1.4 mm onto the tube top);
    //   (b) TANGENT CONTINUITY: adjacent-station tangent turn ≤ 12°
    //       (pre-cure: ~37° entering the cliff, ~92° leaving it; the
    //       cure's Hermite shoulder turns ≤ ~3° per station).
    const stepProf = [];
    for (let rr = 0.086; rr <= 0.1181; rr += 0.0005) {
      const h = hitAt(cup.x + rr * dg, cup.z + rr * dg);
      if (h && h.object.name === 'obPocketCap') {
        stepProf.push([+rr.toFixed(4), h.point.y]);
      }
    }
    let stepRise = 0, stepTurn = 0;
    {
      let runMin = Infinity, prevSlope = null;
      // craft R3-SNK-5: the Magnum-measured padded band hangs its skirt
      // from UNDER the pad, 2.7 mm inside the pad's outer face — a down-
      // ray profile therefore DROPS from the pad's underside (22.9 under
      // the top) onto the skirt within ~3 mm of radial travel at the pad's
      // outer radius. That single measured drop is the construction, not
      // a platform: the turn law skips station pairs whose height falls by
      // more than 8 mm in one 0.5 mm step (a cliff DOWN); the no-RISE law
      // (a) is unchanged and still catches a stepped platform.
      for (let i2 = 1; i2 < stepProf.length; i2++) {
        const dr2 = stepProf[i2][0] - stepProf[i2 - 1][0];
        if (dr2 > 0.0011) { prevSlope = null; runMin = Infinity; continue; }
        const y2 = stepProf[i2][1];
        runMin = Math.min(runMin, stepProf[i2 - 1][1]);
        if (y2 - runMin > stepRise) stepRise = y2 - runMin;
        const sl = (y2 - stepProf[i2 - 1][1]) / dr2;
        if (stepProf[i2 - 1][1] - y2 > 0.008) { prevSlope = null; continue; } // the pad-underside drop
        if (prevSlope !== null) {
          const turn = Math.abs(Math.atan(sl) - Math.atan(prevSlope))
            * 180 / Math.PI;
          if (turn > stepTurn) stepTurn = turn;
        }
        prevSlope = sl;
      }
    }
    // ---- 489 WEDGE+PLATFORM cure C12 (owner finale finding #2, red
    // boxes): every crown crossing of the jaw wrap must be a GRAZE —
    // the pre-cure loft-side field dove 30–70° THROUGH the visible
    // cushion crown into a −2.5 mm valley and re-emerged onto the wood
    // roof: the two steep crossings + the shaded chute between them
    // drew the dark slot arc / standing wedge slab the owner boxed.
    // Rail-direction transects on both flanks (depth d ∈ {8,12,16,20}
    // mm behind the nose; the crown is constant along the transect, so
    // the crossing rate is the wrap's own slope): wherever the wrap
    // surface crosses the crown (|wrapY − crownY| ≤ 1.2 mm), the
    // per-mm change of that difference must stay ≤ 0.45 mm (≈ 24°) —
    // the cure's crown-merge family measures 0.30–0.33 at the tangency
    // hand-over and ≤ 0.16 on the tails, the pre-cure dive read up to
    // 1.3 mm/mm (fires at 2.9× the cap).
    const grazeRates = [];
    {
      const wrapAt2 = (x2, z2) => {
        rc.set(new THREE.Vector3(x2, 0.5, z2), new THREE.Vector3(0, -1, 0));
        const hh = rc.intersectObjects(CAST, true)
          .filter((i2) => i2.object.visible !== false && i2.object.isMesh);
        const w2 = hh.find((i2) => i2.object.name === 'obSnkJawWrap');
        const l2 = hh.find((i2) => i2.object.name !== 'obSnkJawWrap');
        return [w2 ? w2.point.y : null, l2 ? l2.point.y : null,
          l2 ? (l2.object.material?.uuid ?? null) : null];
      };
      // R3-SNK-11 B2: the depth set is a position RELATIVE TO THE KILL
      // BAND — the shipped 8/12/16/20 straddled a band that lived 4–10 mm
      // behind the nose. The Magnum section's face recedes to its FOOT
      // below the nose, so the band now descends behind the foot (table.js
      // ft(), §R3c.21 B2) and the shipped depths all land in the killed
      // strip: the instrument read ZERO crossing samples on the B2 bytes
      // (a blind gate, which fails closed here — grazeMax null is a FAIL).
      // The four depths are therefore READ FROM THE BAND'S DATUM: the
      // shipped 8/12/16/20 plus the LIVE profile foot (MODEL 14.44 mm on
      // the Magnum section; literal 0 on any family whose first row sits
      // on the nose plane, where the set stays byte-identical to the
      // shipped one). The count is unchanged — a union of both sets ran
      // 2x the rays and wedged the eval past its 600 s CDP ceiling, and
      // the shipped four measure nothing but killed strip on a footed
      // section (0 samples, the blind read above).
      const prof12 = T.cushionProfile(G.render.cushionFamily,
        G.kernel.noseHeightFrac * G.render.profileBallD, G.CW);
      const foot12 = prof12.rows.length && prof12.rows[0].o > 0
        ? prof12.rows[0].o : 0;
      const dSet = [0.008, 0.012, 0.016, 0.020]
        .map((d0) => +(d0 + foot12).toFixed(6));
      for (const fl of ['L', 'E']) {
        for (const dd of dSet) {
          let prevD = null, prevOwn = null;
          for (let s2 = 0.012; s2 <= 0.125; s2 += 0.001) {
            const x2 = fl === 'L' ? G.L / 2 - s2 : G.L / 2 + dd;
            const z2 = fl === 'L' ? G.W / 2 + dd : G.W / 2 - s2;
            const [wy, ly, lu] = wrapAt2(x2, z2);
            // crown samples only (the loft top face) — past the taper /
            // into the mouth the transect leaves the crown: reset.
            // R3-SNK-11 B2: the height window was the proxy for "the loft
            // top face" and it held while the depths sat 8–20 mm behind the
            // nose; read from the band's own datum (22–34 mm) the same
            // window also admits the plank / capping roof and the pocket
            // furniture at 37–40 mm, and a HAND-OVER between two such
            // surfaces reads as the wrap diving (measured on the B2 bytes:
            // 2.1 mm/mm at s 91→92, d 30.4, where the first hit changes
            // from a 38.8 mm roof to the 39.7 mm loft with the wrap flat at
            // 38.38 throughout; 7.5 mm/mm at s 34, d 34.4, the same
            // hand-over at the jaw end). The law's own sentence is "the
            // crown is constant along the transect, so the crossing rate is
            // the wrap's own slope" — so the owner is now named, not
            // guessed: the crown is the CLOTH-material surface, and any
            // change of owner resets the run exactly as leaving the window
            // does. (clothUuid null ⇒ no pin ⇒ the window alone, the
            // shipped behaviour.)
            if (wy === null || ly === null || ly < 0.035 || ly > 0.050
              || (clothUuid !== null && lu !== clothUuid)
              || (prevOwn !== null && lu !== prevOwn)) {
              prevD = null; prevOwn = lu; continue;
            }
            prevOwn = lu;
            const diff = wy - ly;
            if (prevD !== null
              && Math.min(Math.abs(diff), Math.abs(prevD)) <= 0.0012) {
              grazeRates.push([fl, dd, +s2.toFixed(3),
                +Math.abs(diff - prevD).toFixed(5)]);
            }
            prevD = diff;
          }
        }
      }
    }
    const grazeMax = grazeRates.length
      ? Math.max(...grazeRates.map((g2) => g2[3])) : null;
    // ---- 489 WEDGE+PLATFORM cure C13 (review wedge-cure r1 P2): the
    // sweep's boot_kinks pixel row ABSTAINS wherever the rail capping
    // occludes/contaminates the silhouette read (the occlusion-crossing
    // exemption family) — so a real azimuthal facet hiding under the
    // capping overhang needs a MESH-plane owner. Down-rays around
    // constant-radius arcs across the dome/brim band read geometric
    // FACE normals (raycast normals are unsmoothed, occlusion-free —
    // the ray comes from above the capping's z-order, geometry only):
    // adjacent-sample azimuthal normal steps at 0.5° pitch, upper
    // surface only (ny >= 0.5 both samples — the end-face clamps and
    // silhouette flanks are construction transitions, C9's own
    // exclusion), must stay <= 9.5° (the C9 station family cap).
    // Scope |az| <= 66° about the outward diagonal: the cure's horn
    // morph EXPLICITLY carries the pre-cure tip shape over the
    // face-clamp zone (t 0.64-0.84) — measured on the cure tree the
    // tip-zone construction steps onset at az ±68.5° (8.3-14.3°
    // there vs <= 4.1° on the drape); the tips are owned by their
    // own sealed laws (F3 jaw-end roundness, C9 diagonal stations).
    // C13 owns the cure-authored drape surface.
    const aziSteps = [];
    {
      for (const rr of [0.060, 0.068, 0.076, 0.084, 0.092,
        0.100, 0.108, 0.115]) {
        let prevN = null, prevFace = -1;
        for (let aDeg = -66; aDeg <= 66; aDeg += 0.5) {
          const th = Math.PI / 4 + (aDeg * Math.PI) / 180;
          rc.set(new THREE.Vector3(cup.x + rr * Math.cos(th), 0.5,
            cup.z + rr * Math.sin(th)), new THREE.Vector3(0, -1, 0));
          // review wedge-cure r2 P2: [0] returned the rail CAPPING where
          // it overhangs the boot — exactly the region the pixel judge
          // abstains on — so the scan reset there and never measured
          // the hidden cap face. The mesh law takes the first
          // obPocketCap hit from the FULL list (occluders above are
          // no obstacle to a geometry census).
          const h = rc.intersectObjects(CAST, true)
            .filter((i) => i.object.visible !== false && i.object.isMesh)
            .find((i) => i.object.name === 'obPocketCap');
          if (h && h.face) {
            if (h.faceIndex === prevFace) continue;
            prevFace = h.faceIndex;
            const n = h.face.normal.clone()
              .transformDirection(h.object.matrixWorld);
            if (prevN && n.y >= 0.5 && prevN.y >= 0.5) {
              const d = Math.acos(Math.min(1, Math.max(-1, n.dot(prevN))))
                * 180 / Math.PI;
              aziSteps.push([+rr.toFixed(3), +aDeg.toFixed(1),
                +d.toFixed(2)]);
            }
            prevN = n;
          } else { prevN = null; prevFace = -1; }
        }
      }
    }
    const aziStepMax = aziSteps.length
      ? Math.max(...aziSteps.map((p2) => p2[2])) : null;
    // ---- 489 BLOCKER-CURE C10 (B14 vestigial net): the sock below the
    // hem must be the dossier's slack BASKET, not a slim tube — first
    // obPocketNet hit on a horizontal ray at y = -0.112 (the bulge band
    // right under the -105.5 hem — deeper bands taper by the
    // FV489-NETCLEAR chamfer/leg clearances) aimed at the cup axis
    // along the outward diagonal must sit >= 40 mm off the axis (red
    // tree: tube r ~= 13-19 mm; montage basket ~0.4-0.6 of the O 229 mm
    // boot; cured bulge r ~= 50 mm).
    // R3-SNK-2: the net is a KNOTTED CORD LATTICE — a single horizontal
    // ray can pass between cords, so the bag's envelope at a height is
    // the MAX first-hit radius over a small fan (5 heights ± 4 mm × 3
    // azimuths ± 10° about the outward diagonal)
    const netEnvAt = (y0) => {
      let best = null;
      for (const dy of [-0.004, -0.002, 0, 0.002, 0.004]) {
        for (const da of [-10, 0, 10]) {
          const a = Math.PI / 4 + (da * Math.PI) / 180;
          const ux = Math.sin(a), uz = Math.cos(a);
          rc.set(new THREE.Vector3(cup.x + 0.30 * ux, y0 + dy, cup.z + 0.30 * uz),
            new THREE.Vector3(-ux, 0, -uz).normalize());
          const hits = rc.intersectObjects(CAST, true)
            .filter((i) => i.object.visible !== false && i.object.isMesh);
          // R3-SNK-BODY-1: THIS pocket's bag only — a ray that slips between the
          // cords of a ring-bound bag flies on across the table and would
          // otherwise read the opposite pocket's net (2585 mm on g3); the
          // envelope is bounded by the boot class (r ≤ 0.15)
          const nh = hits.find((i) => /^obPocketNet/.test(i.object.name)
            && Math.hypot(i.point.x - cup.x, i.point.z - cup.z) <= 0.15);
          if (nh) {
            const r = Math.hypot(nh.point.x - cup.x, nh.point.z - cup.z);
            if (best === null || r > best) best = r;
          }
        }
      }
      return best === null ? null : +best.toFixed(4);
    };
    const netR13 = netEnvAt(-0.112); // right under the MFR hem (−0.1055)
    // R3-SNK-2 C10c': the bag gathers to a whipped CLOSED bottom (the
    // XW101 knit's tail; the Magnum's bottom band) — the corner net's
    // lowest vertex and the max radius of its bottom 20 mm
    let netBottom = null, netBottomR = null;
    scene.traverse((o) => {
      if (!o.isMesh || o.name !== 'obPocketNet') return;
      const pos = o.geometry.attributes.position;
      let lo = 1;
      for (let i = 0; i < pos.count; i += 3) {
        const wx = pos.getX(i), wz = pos.getZ(i);
        if (Math.hypot(wx - cup.x, wz - cup.z) > 0.12) continue;
        lo = Math.min(lo, pos.getY(i));
      }
      if (lo < 1 && (netBottom === null || lo < netBottom)) netBottom = lo;
    });
    if (netBottom !== null) {
      scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'obPocketNet') return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) {
          const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
          const r = Math.hypot(wx - cup.x, wz - cup.z);
          // R3-SNK-2: the lowest 6 mm = the whipped tail itself (band +
          // tail knot + cord ends); the gather cone above it converges
          // from ~0.45 R and is judged by C10b, not here
          if (r > 0.12 || wy > netBottom + 0.006) continue;
          if (netBottomR === null || r > netBottomR) netBottomR = r;
        }
      });
    }
    // ---- 489 PASS-2 C10b (B14b boot-width knit): first obPocketNet on
    // the same horizontal ray right under the hem (y = -0.108) must sit
    // >= 85 mm off the axis (the hem circle is 114.5; the pass-2 skirt
    // reads ~108; the be56a831 tail read ~52 — the "1/6-width vestige").
    const netR108 = netEnvAt(-0.1085); // LAW: 3 mm under the MFR hem (−0.1055)
    // ---- 489 PASS-2 C10c (B14b studded gather ring): the visible brass
    // gather ring (obPocketRingGather — NOT the E10 throat ring) exists
    // at this corner, centred in the -168..-148 band at r 49-66 mm.
    let gather = null;
    scene.traverse((o) => {
      if (o.isMesh && o.name === 'obPocketRingGather') {
        const pos = o.geometry.attributes.position;
        const rhos = [];
        let n2 = 0, ySum = 0;
        for (let i = 0; i < pos.count; i += 16) {
          const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
          if (Math.hypot(wx - cup.x, wz - cup.z) < 0.12
            && wy < -0.10 && wy > -0.22) {
            n2++; ySum += wy;
            rhos.push(Math.hypot(wx - cup.x, wz - cup.z));
          }
        }
        if (n2 > 20) {
          rhos.sort((a2, b2) => a2 - b2);
          // ring radius from the torus INNER edge (p10 + tube 4.2 mm) —
          // the mixed median lands among the stud vertices themselves
          // (they are ~55% of the merged buffer) and cannot anchor it
          const p10 = rhos[Math.floor(rhos.length * 0.10)];
          const ringR = p10 + 0.0042;
          // review pass2-r5 P2: STUDS verified separately — only stud
          // vertices reach past the torus outer (ring + tube + 0.3 mm);
          // a bare ring may never satisfy the studded law
          const nStud = rhos.filter((r2) => r2 > ringR + 0.0045).length;
          gather = { y: +(ySum / n2).toFixed(4), r: +ringR.toFixed(4),
            n: n2, nStud };
        }
      }
    });
    // ---- 489 PASS-2 C5c (B14a second stitch row): the upper crown-seam
    // row (obPocketStitch2) — dash tops 4.5-11 mm under the local crest,
    // radially clear of the mouth lip (the montage's two-row law).
    const st2 = { n: 0, yMax: -1, rMin: 1e9 };
    scene.traverse((o) => {
      if (o.isMesh && o.name === 'obPocketStitch2') {
        const pos = o.geometry.attributes.position;
        const V = o.userData?.obDash?.verts > 0 ? o.userData.obDash.verts : 24;
        for (let i = 0; i < pos.count; i++) { // R3-SNK-2: every vertex
          const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
          if (wx > G.L / 2 - 0.2 && wz > G.W / 2 - 0.2) {
            const r = Math.hypot(wx - cup.x, wz - cup.z);
            if (i % V === 0) st2.n++;
            st2.yMax = Math.max(st2.yMax, wy);
            st2.rMin = Math.min(st2.rMin, r);
          }
        }
      }
    });
    const stitch2 = st2.n
      ? { n: st2.n, yMax: st2.yMax, rMin: st2.rMin } : null;
    // ---- craft R3-SNK-5 net-form and contour reads (review round 2
    // residuals 1 and 2), each a MESH read at the rt corner:
    //   cordDia    cord tube diameter from the first tube ring of the
    //              obPocketNet cords mesh (6 vertices about a centreline)
    //   knotAcross median knot body extent PERPENDICULAR to its own axis
    //              (PCA of each knot's vertices: the two minor extents)
    //   knotsPerCourse  knots whose centroid lies in the body course band
    //              −70…−62 mm (one course), counted round the cup
    //   netR100    the OUTWARD family's MEDIAN cord radius at -100 mm, read
    //              off the MESH: every net vertex within one MODEL cord radius
    //              (1.08 mm) of the datum that belongs to THIS cup by the
    //              nearest-cup test. A cord crossing the band contributes a
    //              full tube ring, so this is a CENTRELINE radius - the v1 ray
    //              read was a NEAR-SURFACE first hit, biased 0 .. -1.08 mm
    //              inward against the M2 fits, which fit cord-section centres.
    //   netCls     per-family {n, min, p10, med, p90, max} over the same
    //              vertices, split by |alpha| about the outward diagonal;
    //              netRsN = the banded vertex count, netForeign = vertices
    //              rejected as another cup's net
    //   netLegacy  the retired v1 statistic reproduced verbatim (12 rays at
    //              30 deg, name-only mesh filter, rs[floor(n/2)]), with
    //              netRays / netMiss its raw dump - INFO only, so the seal
    //              record's 42.3 / 43.1 reads stay checkable
    //   row1Y      highest knot centroid on the OUTWARD half above the bed
    //   padStep    flap radius (ray at +10) minus pad-face radius (ray at
    //              top − 15): the ledge step-in
    //   padOverhang pad outer face radius (ray from outside at top − 20)
    //              minus the skirt radius just under the pad (top − 26)
    //   flatWidth  down-ray plateau within 1.5 mm of the top along the
    //              diagonal (from the inner arc end to the outer round)
    let cordDia = null, knotAcross = null, knotsPerCourse = null, row1Y = null;
    const knotAcrossAll = [], knotCentsAll = []; // accumulated over every knots mesh
    // R3-SNK-12: the bag-radius family sample, read off the NET MESH rather
    // than off rays (see the N4 block for why the ray instrument was retired).
    const netVerts = [];       // {r, alpha} for every net vertex in the band
    let netVertForeign = 0;    // vertices nearer ANOTHER cup, rejected
    let netCordSides = 0;      // the cord tube's side count, from the build tag
    {
      const near = (x, z) => Math.hypot(x - cup.x, z - cup.z) < 0.16;
      const cupsAll = ((T.pocketPlateDatums ?? T.pocketVisualFalls) ? (T.pocketPlateDatums ?? T.pocketVisualFalls)('wpbsa_snooker_12ft') : []) || [];
      // nearest-cup test: a cord of THIS bag is always nearer to THIS cup than
      // to any other cup. Exact; no radius threshold is invented.
      const ownsXZ = (x, z) => {
        if (!cupsAll.length) return true;
        const d0 = Math.hypot(x - cup.x, z - cup.z);
        for (const q of cupsAll) {
          if (Math.hypot(q.x - cup.x, q.z - cup.z) < 1e-6) continue;
          if (Math.hypot(x - q.x, z - q.z) < d0) return false;
        }
        return true;
      };
      // the band is ONE MODEL cord radius either side of the -100 mm datum
      // (MODEL(Magnum, n1_sections) cord diameter 2.16 mm -> radius 1.08 mm),
      // so a cord crossing the datum contributes a full tube ring and its
      // radial MEDIAN is the centreline radius, not the near surface.
      const BAND_Y = 0.00108, DATUM_Y = -0.100;
      scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'obPocketNet') return;
        const pos = o.geometry.attributes.position;
        const idx = o.geometry.index;
        if (o.userData?.obCordSides > 0) netCordSides = o.userData.obCordSides;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          if (Math.abs(y - DATUM_Y) > BAND_Y) continue;
          const x = pos.getX(i), z = pos.getZ(i);
          if (!near(x, z)) continue;
          if (!ownsXZ(x, z)) { netVertForeign += 1; continue; }
          const azDeg = ((Math.atan2(z - cup.z, x - cup.x) * 180) / Math.PI + 360) % 360;
          netVerts.push({
            r: Math.hypot(x - cup.x, z - cup.z),
            alpha: Math.abs(((((azDeg - 45) % 360) + 540) % 360) - 180),
          });
        }
        // stride per knot: the build tags it (R3-SNK-5 coil = 96); the
        // R3-SNK-3 torus build carried no tag — its TorusGeometry(…, 5, 9)
        // is 6 × 10 = 60 vertices per knot, band + tail appended (red arm)
        let per = o.userData?.obKnotVerts ?? 0;
        // untagged: only a LARGE non-cord mesh can be the old knots mesh
        // (the R3-SNK-5 band + tail mesh is untagged too but small)
        if (!per && !o.userData?.obCordSides && o.geometry.index
          && o.geometry.index.count / 3 !== pos.count && pos.count > 10000) per = 60;
        if (per > 0) {
          // knots mesh: per vertices per knot (the coil tube)
          const across = knotAcrossAll, cents = knotCentsAll;
          const nK = Math.floor(pos.count / per);
          for (let k = 0; k < nK; k++) {
            let cx2 = 0, cy2 = 0, cz2 = 0;
            for (let i = k * per; i < (k + 1) * per; i++) { cx2 += pos.getX(i); cy2 += pos.getY(i); cz2 += pos.getZ(i); }
            cx2 /= per; cy2 /= per; cz2 /= per;
            if (!near(cx2, cz2)) continue;
            cents.push([cx2, cy2, cz2]);
            // covariance → principal axis; extents perpendicular to it
            let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
            for (let i = k * per; i < (k + 1) * per; i++) {
              const dx = pos.getX(i) - cx2, dy = pos.getY(i) - cy2, dz = pos.getZ(i) - cz2;
              xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
            }
            // power iteration for the major axis
            let ax = 1, ay = 0.3, az = 0.2;
            for (let it = 0; it < 24; it++) {
              const nx2 = xx * ax + xy * ay + xz * az, ny2 = xy * ax + yy * ay + yz * az, nz2 = xz * ax + yz * ay + zz * az;
              const nn = Math.hypot(nx2, ny2, nz2) || 1; ax = nx2 / nn; ay = ny2 / nn; az = nz2 / nn;
            }
            let maxPerp = 0;
            for (let i = k * per; i < (k + 1) * per; i++) {
              const dx = pos.getX(i) - cx2, dy = pos.getY(i) - cy2, dz = pos.getZ(i) - cz2;
              const along = dx * ax + dy * ay + dz * az;
              const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
              if (perp > maxPerp) maxPerp = perp;
            }
            across.push(2 * maxPerp);
          }
          // summaries after the traverse (accumulated over knots meshes)
        } else if ((o.userData?.obCordSides > 0 || (!o.userData?.obKnotVerts
          && o.geometry.index && o.geometry.index.count / 3 === pos.count)) && cordDia === null) {
          // cords mesh: the first ring of S vertices about the first node
          // (untagged R3-SNK-3 cords: 6-sided tubes, 12 tris per 12 verts)
          const S = o.userData?.obCordSides ?? 6;
          let cx2 = 0, cy2 = 0, cz2 = 0;
          for (let i = 0; i < S; i++) { cx2 += pos.getX(i); cy2 += pos.getY(i); cz2 += pos.getZ(i); }
          cx2 /= S; cy2 /= S; cz2 /= S;
          let rr = 0;
          for (let i = 0; i < S; i++) rr += Math.hypot(pos.getX(i) - cx2, pos.getY(i) - cy2, pos.getZ(i) - cz2) / S;
          cordDia = 2 * rr;
          void idx;
        }
      });
    }
    {
      const across = knotAcrossAll.slice().sort((a2, b2) => a2 - b2);
      if (across.length) knotAcross = across[Math.floor(across.length / 2)];
      // knots per course = knots in a 3-course window (29 mm: −81…−52,
      // the body zone) × pitch 9.6 / 29 — a one-pitch band catches only
      // the columns whose half-offset row falls inside it (the diamond
      // lattice offsets alternate columns by half a pitch)
      const win = knotCentsAll.filter(([, y]) => y > -0.081 && y < -0.052);
      // R3-SNK-6: knots per course = the SAME-COURSE count — cluster the
      // window's knots into levels (2 mm), take the median azimuth step
      // between neighbouring knots of one level, 360° / step — the read the
      // R3-SNK-5B mesh-to-mesh alignment used on both bodies (§R3c.14.1).
      // The R3-SNK-5 read counted distinct COLUMNS (0.5° azimuth bins),
      // which passed a lattice with half the meshes around (a diamond has
      // two column phases per mesh: 21 columns = 10.5 meshes); the older
      // window-count × 9.6 / 29 hit 21 on that lattice by cancelling
      // errors (doubled rows × halved meshes). Levels with < 4 knots are
      // skipped; the median over levels is reported.
      // level gap 0.5 mm, not 2 mm (R3-SNK-6 red-arm finding): the knots of
      // one built course share their y EXACTLY, while the head-hung and
      // ring-hung column families run at phases 2-3 mm apart — a 2 mm gap
      // merged two phases of the d69b7d33 lattice into 21-knot levels and
      // the red arm passed (the same cancellation the window count had);
      // at 0.5 mm the old lattice reads 10.5 per level, the new one 21
      const byY = win.slice().sort((a2, b2) => a2[1] - b2[1]);
      const levels = []; let cur = [];
      for (const k of byY) {
        if (cur.length && k[1] - cur[cur.length - 1][1] > 0.0005) { levels.push(cur); cur = []; }
        cur.push(k);
      }
      if (cur.length) levels.push(cur);
      const perLevel = [];
      for (const lv of levels) {
        if (lv.length < 4) continue;
        const az = lv.map(([x, , z]) => ((Math.atan2(z - cup.z, x - cup.x) * 180) / Math.PI + 360) % 360)
          .sort((a2, b2) => a2 - b2);
        const gaps = az.map((a2, i2) => (i2 + 1 < az.length ? az[i2 + 1] - a2 : az[0] + 360 - a2));
        // the leather window hides no knot from a full-ring level, but a
        // partial level (head-span edge) has one large gap: use the median
        const g = gaps.slice().sort((a2, b2) => a2 - b2)[Math.floor(gaps.length / 2)];
        if (g > 0) perLevel.push(360 / g);
      }
      perLevel.sort((a2, b2) => a2 - b2);
      knotsPerCourse = perLevel.length ? Math.round(perLevel[Math.floor(perLevel.length / 2)])
        : Math.round((win.length * 9.6) / 29);
      const outward = knotCentsAll.filter(([x, y, z]) => ((x - cup.x) * dg + (z - cup.z) * dg) > 0 && y > -0.02);
      if (outward.length) row1Y = Math.max(...outward.map(([, y]) => y));
    }
    // ---- R3-SNK-12 NET RADIUS INSTRUMENT v2. The judged radii come off the
    // MESH (netVerts, filled in the traverse above); the retired v1 RAY read
    // is reproduced verbatim alongside as an INFO row. Why the ray went:
    //
    //   v1 fired 12 rays at 30 deg from the cup axis at y = -100 mm and took
    //   rs[Math.floor(rs.length / 2)] of the HITS. The row's own text called
    //   that "the 7th smallest of 12". It is not, unless 12 rays hit. On this
    //   tree SIX of the twelve MISS - a zero-width ray at one fixed height
    //   threads a lattice cell whose MODEL(Magnum n3_mesh) side is 11.9 mm
    //   against a MODEL 2.16 mm cord - so the statistic silently became rs[3]
    //   of 6, an order statistic straddling two cord families whose radii
    //   differ by ~6 mm. One further ray (az 270) landed on ANOTHER pocket's
    //   obPocketNet 1797.3 mm away: the v1 filter matched the mesh NAME, so a
    //   threaded ray is not a miss, it enters the sample as a radius.
    //   Widening the fan does not cure this: 72 rays at 5 deg still MISS 43
    //   times (29 accepted, 1 cross-cup rejected) - 6 outward and 8 table
    //   hits, too few for a family median. The ray was always a proxy; the
    //   mesh is the thing itself.
    //
    // The mesh read takes every net vertex within ONE MODEL cord radius
    // (1.08 mm) of the -100 mm datum that belongs to THIS cup by the
    // nearest-cup test, and reports each |alpha| family's radius median. A
    // cord crossing the band contributes a full tube ring, so the family
    // median is a CENTRELINE radius: the 0 .. -1.08 mm near-surface bias that
    // v1 had to disclose is gone, not merely declared. The datum, the frame
    // and the family split are unchanged from v1.
    let netR100 = null, netRsN = 0, netMiss = 0, netCls = null;
    let netLegacy = null, netForeign = netVertForeign, netNRays = 12;
    const netRays = [];
    {
      const byCls = (lo, hi) => {
        const v = netVerts.filter((q) => q.alpha >= lo && q.alpha <= hi)
          .map((q) => q.r).sort((a2, b2) => a2 - b2);
        const at = (f) => (v.length ? v[Math.min(v.length - 1, Math.floor(v.length * f))] : null);
        return {
          n: v.length,
          min: v.length ? v[0] : null,
          max: v.length ? v[v.length - 1] : null,
          med: at(0.5), p10: at(0.1), p90: at(0.9),
        };
      };
      netCls = { outward: byCls(0, 45), blend: byCls(45.0001, 134.9999), table: byCls(135, 180) };
      netR100 = netCls.outward.med;   // the judged scalar is a FAMILY median
      netRsN = netVerts.length;
      // the v1 statistic, reproduced exactly, for continuity with the seal
      // record: 12 rays at 30 deg, mesh filter by NAME only, rs[floor(n/2)].
      {
        const rs12 = [];
        let miss12 = 0;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * 2 * Math.PI;
          rc.set(new THREE.Vector3(cup.x, -0.100, cup.z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
          const hits = rc.intersectObjects(CAST, true)
            .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name === 'obPocketNet');
          const h = hits[0];
          netRays.push({
            k,
            rayAzDeg: Number(((a * 180) / Math.PI).toFixed(1)),
            hitAzDeg: h ? Number((((Math.atan2(h.point.z - cup.z, h.point.x - cup.x) * 180) / Math.PI + 360) % 360).toFixed(2)) : null,
            r: h ? h.distance : null,
            obj: h ? (h.object.name || null) : null,
          });
          if (h) rs12.push(h.distance); else miss12 += 1;
        }
        netMiss = miss12;
        rs12.sort((a2, b2) => a2 - b2);
        netLegacy = {
          n: rs12.length, miss: miss12,
          value: rs12.length ? rs12[Math.floor(rs12.length / 2)] : null,
          index: rs12.length ? Math.floor(rs12.length / 2) : null,
          r: rs12.map((x) => Number((x * 1000).toFixed(2))),
        };
      }
    }

    // contour reads on the leather (obPocketCap) along the outward diagonal
    const capHitOut = (y, from) => { // horizontal ray toward the cup from from metres out
      rc.set(new THREE.Vector3(cup.x + from * dg, y, cup.z + from * dg), new THREE.Vector3(-dg, 0, -dg));
      const h = rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name === 'obPocketCap')[0];
      return h ? Math.hypot(h.point.x - cup.x, h.point.z - cup.z) : null;
    };
    const capHitIn = (y) => { // horizontal ray outward from the cup axis
      rc.set(new THREE.Vector3(cup.x, y, cup.z), new THREE.Vector3(dg, 0, dg));
      const h = rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh && i.object.name === 'obPocketCap')[0];
      return h ? Math.hypot(h.point.x - cup.x, h.point.z - cup.z) : null;
    };
    // R3-SNK-7: every probe height rides the entry's rail top (MODEL 40.18,
    // table.js SNK_RAIL_TOP), never the retired 47 literal
    const topY = G.render.frameTop;
    // R3-SNK-8: K1 reads the mouth run's JOG the way M1 defines it — the flap
    // face just under the chamfer's top (top − 23.5; the flap LEANS 6.5° on
    // the model, so a z-10 read understates the jog) minus the rim wall
    // (top − 15)
    const rFlapRead = capHitIn(topY - 0.0235), rPadRead = capHitIn(topY - 0.015);
    const padStep = (rFlapRead !== null && rPadRead !== null) ? rFlapRead - rPadRead : null;
    const rOutFace = capHitOut(topY - 0.020, 0.16), rUnderPad = capHitOut(topY - 0.026, 0.16);
    const padOverhang = (rOutFace !== null && rUnderPad !== null) ? rOutFace - rUnderPad : null;
    let flatWidth = null;
    {
      let first = null, last = null;
      for (let rr = 0.044; rr <= 0.16; rr += 0.0005) { // R3-SNK-6: the plateau reaches ~123 mm under the junction law
        const h = hitAt(cup.x + rr * dg, cup.z + rr * dg);
        const ok = h && h.object.name === 'obPocketCap' && h.point.y > topY - 0.0007;
        if (ok && first === null) first = rr;
        if (ok) last = rr;
      }
      if (first !== null) flatWidth = last - first;
    }
    // LAW-PURCHASED-BASELINE rows (R3-SNK-5): hem drop, plan legs, tooth pitch
    let hemTipY = null, legDelta60 = null, toothPitchRead = null, topR0Max = null;
    // R3-SNK-6 JUNCTION rows (§R3c.15.2): the leather's top edge at the long
    // rail's end plane vs the rail's outer FACE (J1), and the hem's leg vs
    // the APRON plane (J2) — both read on the obPocketCap vertices; the rail
    // face is the MFR frame (W/2 + CW + frameWidth − |cup z|), the apron
    // plane the frame's own face − 3
    const railFaceLat = G.W / 2 + G.CW + G.render.frameWidth - Math.abs(cup.z);
    // BODY-2 R4: the apron inset is the module's own constant (0 since the Magnum/PHOTO read), not a gate literal
    const apronLat = railFaceLat - (T.SNK_APRON_INSET ?? 0.003);
    let jTopEdge = -Infinity, jHemLeg = -Infinity;
    {
      // hem tips: lowest obPocketCap vertex per 1° azimuth bin about the cup
      // (|phi| ≤ 60° about the outward diagonal), within r 0.14
      const NB = 120, lowY = new Array(NB).fill(Infinity), lowR = new Array(NB).fill(0);
      const topR0 = [], topR60 = [];
      scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'obPocketCap') return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
          const ddx = wx - cup.x, ddz = wz - cup.z;
          if (faceX !== null) {
            // J1: the plan outline at z = top − 1.0 (± 0.4: the M1 R3 station the
            // Magnum/XW101 offsets were read at) within 3 mm of the end plane —
            // a wider band would catch the outer round / lean segment further out
            if (Math.abs(wy - (topY - 0.001)) <= 0.0004 && Math.abs(wx - faceX) <= 0.003 && ddz > jTopEdge) jTopEdge = ddz;
            // J2: the lowest 4 mm of the leather over the first 20 mm of the leg
            // R3-SNK-BODY-1 (r3_13): the hem-leg window rides the PHOTO hem drop 132 ±15 under the
            // rail top (official side elevation, two ends), not the retired MFR 148 read
            if (wy <= (topY - 0.132) + 0.004 && wx >= faceX - 0.001 && wx <= faceX + 0.02 && ddz > jHemLeg) jHemLeg = ddz;
          }
          const r = Math.hypot(ddx, ddz);
          if (r > 0.16 || r < 0.03) continue;
          let ph = Math.atan2(ddz, ddx) - Math.atan2(dg, dg);
          ph = Math.atan2(Math.sin(ph), Math.cos(ph));
          const dgr = (ph * 180) / Math.PI;
          if (Math.abs(dgr) <= 60) {
            const b = Math.min(NB - 1, Math.floor(dgr + 60));
            if (wy < lowY[b]) { lowY[b] = wy; lowR[b] = r; }
          }
          // top plateau outer edge: points within 0.6 mm of the top
          if (wy > topY - 0.0006) {
            if (Math.abs(dgr) <= 3) topR0.push(r);
            if (Math.abs(Math.abs(dgr) - 60) <= 3) topR60.push(r);
          }
        }
      });
      const ys = lowY.filter(Number.isFinite);
      if (ys.length > 60) {
        hemTipY = Math.min(...ys);
        // tooth pitch: count local minima (tips) of the per-bin hem y over the
        // 120° window; pitch = arc length / tips
        let tips = 0;
        for (let b = 1; b + 1 < NB; b++) {
          if (!Number.isFinite(lowY[b - 1]) || !Number.isFinite(lowY[b + 1])) continue;
          if (lowY[b] <= lowY[b - 1] && lowY[b] < lowY[b + 1] && lowY[b] < hemTipY + 0.0015) tips++;
        }
        const rHemMean = lowR.filter((v, i) => Number.isFinite(lowY[i]) && v > 0).reduce((a2, b2) => a2 + b2, 0)
          / Math.max(1, lowR.filter((v, i) => Number.isFinite(lowY[i]) && v > 0).length);
        if (tips > 3) toothPitchRead = ((120 * Math.PI) / 180 * rHemMean) / tips;
      }
      if (topR0.length && topR60.length) legDelta60 = Math.max(...topR60) - Math.max(...topR0);
      if (topR0.length) topR0Max = Math.max(...topR0);
    }
    // R3-SNK-12 P1 — PLANK LID HYGIENE (R3c.22.12). The planks are the ANONYMOUS
    // ExtrudeGeometry meshes carrying the rail-wood material (the same uuid pin
    // every wood read in this tool and in asmodeled-drawings-489 uses — the
    // planks stay unnamed by the r22 rule "no instrument elsewhere changes
    // subject"; naming them moved every '(anon)' railwood family and turned ten
    // letters red, measured 2026-09-04). For each, the top lid's triangles (all
    // three vertices on the mesh's own top plane, world y) are classed by
    // facing; an inverted one with area >= 1/64 mm2 (one pixel of the finest
    // battery render) is a fold the clay rig draws black. Fails CLOSED when the
    // pin finds no plank.
    const plankLids = { planks: 0, down: 0, downArea: 0, up: 0, per: [] };
    {
      const ARM_FLIP = ${armPlankLids ? 'true' : 'false'};
      const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
      let pk = 0;
      scene.traverse((o) => {
        if (!o.isMesh || o.name || o.material?.uuid !== woodUuid || o.geometry?.type !== 'ExtrudeGeometry') return;
        const pa = o.geometry.attributes.position; const idx = o.geometry.index;
        const nT = idx ? idx.count / 3 : pa.count / 3;
        let top = -Infinity;
        for (let i = 0; i < pa.count; i++) { vA.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); if (vA.y > top) top = vA.y; }
        let up = 0, down = 0, downArea = 0, worst = 0;
        for (let t = 0; t < nT; t++) {
          const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          vA.fromBufferAttribute(pa, ia).applyMatrix4(o.matrixWorld);
          vB.fromBufferAttribute(pa, ib).applyMatrix4(o.matrixWorld);
          vC.fromBufferAttribute(pa, ic).applyMatrix4(o.matrixWorld);
          if (Math.abs(vA.y - top) > 5e-5 || Math.abs(vB.y - top) > 5e-5 || Math.abs(vC.y - top) > 5e-5) continue;
          const ny = (vB.z - vA.z) * (vC.x - vA.x) - (vB.x - vA.x) * (vC.z - vA.z);
          const area = 0.5 * Math.abs(ny) * 1e6; // mm2
          if (area < 1 / 64) continue;
          if ((ny > 0) !== ARM_FLIP) up++; else { down++; downArea += area; if (area > worst) worst = area; }
        }
        plankLids.planks++; plankLids.up += up; plankLids.down += down; plankLids.downArea += downArea;
        plankLids.per.push({ plank: pk++, up, down, downArea: +downArea.toFixed(2), worst: +worst.toFixed(2) });
      });
    }
    return JSON.stringify({
      plankLids,   // R3-SNK-12 P1
      cordDia, knotAcross, knotsPerCourse, row1Y, netR100, padStep, padOverhang, flatWidth, topR0: topR0Max,
      netRays, netRsN, netMiss, netCls,   // R3-SNK-12 v2: full 72-ray dump + miss count
      netLegacy, netForeign, netNRays, netCordSides,   // R3-SNK-12 v2: retired v1 read + rejects
      jTopEdge: Number.isFinite(jTopEdge) ? jTopEdge : null, jHemLeg: Number.isFinite(jHemLeg) ? jHemLeg : null, railFaceLat, apronLat,
      hemTipY, legDelta60, toothPitchRead,
      rFlapRead, rPadRead, rOutFace, rUnderPad,
      profStepMax, profSteps, netR13, netR108, gather, stitch2,
      stepRise, stepTurn, stepProfN: stepProf.length,
      aziStepMax, aziStepN: aziSteps.length,
      aziTop: aziSteps.slice().sort((a2, b2) => b2[2] - a2[2])
        .slice(0, 5),
      grazeMax, grazeN: grazeRates.length,
      grazeTop: grazeRates.slice().sort((a2, b2) => b2[3] - a2[3])
        .slice(0, 5),
      holeDia, flapDia, fallDisc, cup, chord, cupDist, faceX, mouthLineOff, mouthOffPred, halfL: G.L / 2,
      woodOutside, th20, th30, th40, th35, bore45, bore35, stitch, crest, bootHex,
      tin20, tin30, tin35, tin45, knit40, out40, netBottom, netBottomR, stitchSeam, flapAtSeam,
      mHole, mRv, mRvSpread, mf1, mf2, mWall45, mWallIn45, mKnitOut, mKnitIn, mMouthOut, mMouthIn,
      // R3-SNK-10 (RULINGS (a)/(b)): the middle rows' TARGETS. M1's is the
      // KERNEL disc (G.pockets — the capture disc the physics runs on, not
      // the render's own pocketFallDiscs() export: the first cut read the
      // render export and could not red on the e18e0122 bytes, whose export
      // returned its own 49.61). M2's is the MODEL constant (below); the
      // tree's exports ride along for the record.
      mFallR: G.pockets.find((q) => !q.corner).r,
      // R3-SNK-12: RECORD-ONLY, and guarded. A RED ARM serves an OLDER
      // tree under --web, and pocketFallDiscs() does not exist before
      // R3-SNK-9 — on ef3f1bd3 the un-guarded call threw inside the page
      // eval and aborted the whole arm before a single bar was judged.
      // A missing export now reads null. That can only ever make a bar
      // FAIL (null fails every band test), never pass: this field is not
      // judged anywhere, and the JUDGED middle-fall target is mFallR,
      // the KERNEL disc, which every tree in scope exports.
      mFallRender: (typeof T.pocketFallDiscs === 'function'
        ? T.pocketFallDiscs('wpbsa_snooker_12ft')[4].r : null),
      mSlotHalf: T.pocketFaceStations('wpbsa_snooker_12ft').uFaceM,
      bedBad, ringSeen, hangSeen, hangHist, underHemSeen, underHist, sockFan,
      bellSeen: hangHist.obPocketCap ?? 0,
      boxSeen: (hangHist.obSnkPost ?? 0) + (hangHist.obSnkCasting ?? 0),
      bootHit, sockHit, mKnit, mKnitMiss, mKnitTop, inventory,
      ringBand: ringRad > 0 ? [+ringLo.toFixed(4), +ringHi.toFixed(4)] : null,
      xFacePred: null,
    });
  })()`, true).then(JSON.parse);
  // R3-SNK-12: keep the raw 12-ray evidence for the --out report (written
  // outside the scope of `m`). No number is computed here.
  netDump = {
    rays: m.netRays ?? null, n: m.netRsN ?? null,
    miss: m.netMiss ?? null, classes: m.netCls ?? null,
    nRays: m.netNRays ?? null, foreign: m.netForeign ?? null,
    cord_sides: m.netCordSides ?? null, band_mm: 1.08, datum_mm: -100,
    legacy_v1: m.netLegacy ?? null,
  };

  const mm = (v) => (v === null || v === undefined ? 'n/a' : (v * 1000).toFixed(1) + 'mm');
  // scan quantization: the open-run endpoints undershoot the true rim by
  // up to one 0.5 mm pitch per side → a true Ø 84.15 reads ≥ 83.2
  if (m && m.refused) throw __refusal('check-pocket-construction', m.refused);
  console.log(`[check-pocket-construction] pocket inventory under obTable: ${Object.entries(m.inventory).sort().map(([k, n]) => `${k} ${n}`).join(', ')}`);
  // main's pre-R3 rows C1 (visible fall Ø 84–90) / C2a (chord 103±8) / C2b (onset 54.9–55.7) / C2c (face ⊥ mouth line) — SUPERSEDED on this table by the
  // rows below (RULING R-S8-2 + BODY-2; RULING-SNK-DATUM item 2), measured in R3-SNK-7 / R3-SNK-9 / BODY-2; dropped at the #637 main merge, named in the HANDOFF
  // R3-SNK-9 (RULING R-S8-2): the corner FALL is the kernel's CEBP disc — the
  // cloth arris (the bed's edge) is the circle R + lip = 88.9 + 4 = 92.9 about
  // the slate-edge intersection K (nose corner + CW on both axes): the
  // down-ray march from K across the inboard quarter (9 rays, ± 40°) reads
  // the arris stations; one circle fit → R 92.9 ± 1.0 (the 0.5 mm march
  // pitch + the roll's 8-facet lathe), centre within 1.5 mm of K. The
  // former hole law (Ø 84–90 about the plate centre = the Amendment-026
  // chord-as-diameter misread) retires. [red: 9c0437a3 — its bed cloth
  // ends 52 mm from the PLATE centre: the march from K meets cloth at
  // r ≈ 80 with a centre 27 mm off K → fires]
  // R3-SNK-BODY-2 (R4/R5): the arris roll is the MODEL(Magnum) round R 6.4 (a 7 × 7
  // parabolic round's tangent-constrained equivalent; BODY-1's 4 was a held
  // deviation), so the cloth arris circle is R 88.9 + 6.4 = 95.3 — the same
  // derivation, one term re-read; the old 92.9 fails the new band.
  bar('C1 corner FALL = the kernel CEBP disc: cloth arris R 95.3 +- 1.0 mm (88.9 + the MODEL(Magnum) arris roll 6.4; BODY-2) about '
    + 'the slate-edge intersection (+- 1.5 mm), >= 5 of 9 rays (R3-SNK-9 RULING '
    + 'R-S8-2; the 9c0437a3 hole about the plate centre fires)',
    !!m.fallDisc && m.fallDisc.n >= 5 && Math.abs(m.fallDisc.r - 0.0953) <= 0.0010
    && Math.abs(m.fallDisc.dx) <= 0.0015 && Math.abs(m.fallDisc.dz) <= 0.0015,
    `arris fit R ${mm(m.fallDisc?.r)} about K + (${mm(m.fallDisc?.dx)}, ${mm(m.fallDisc?.dz)}), `
    + `stations ${m.fallDisc?.n ?? 0} (r ${mm(m.fallDisc?.rMin)}..${mm(m.fallDisc?.rMax)}); flap Ø ${mm(m.flapDia)} (plate datum Ø ${mm(m.holeDia)})`);
  // R3-SNK-7 (RULING-SNK-DATUM.md item 2 — the plate datum is the purchased
  // model's): the Amendment-026 photo-pin rows (chord 103 on the mouth line,
  // wood onset 55.3 from the fall centre, faces on the mouth line) are
  // retired; the wood ends stand at the MODEL station and the arms reach
  // them from the MODEL plate centre. Reads on the restored OBJ (M4,
  // /tmp/craftr3/snk7-datum/datum.json): end faces 12.42 / 14.61 / 14.11
  // inboard of the far nose line (built symmetric 13.39), plate centre →
  // wood onset 41.30 / 41.56 / 41.06 (built 41.3 by construction)
  const faceStation = m.faceX === null || m.faceX === undefined ? null : m.halfL - m.faceX;
  // the top-down read lands ≈ 0.9–1.4 mm inside the true plane: the leather
  // tips lap the end plane by 0.9 (clampP, E15) and the scan pitch is 0.5 —
  // the band on the READ is [station − 1.0, station + 2.0]
  bar('C2a end face station 13.39 ± 1.0 mm INBOARD of the far nose line (the plank\'s own end-face '
    + 'vertices) (MODEL: Magnum wood end faces, planar facets rms 0.06, mean of 12.42/14.61/14.11; '
    + 'was the mouth-line photo pin) [red: 1c4f0d06 44.6]',
    faceStation !== null && Math.abs(faceStation - 0.01339) <= 0.001,
    `face station ${mm(faceStation)} inboard (x ${m.faceX?.toFixed(4)})`);
  const onsetFromCup = (m.faceX === null || m.faceX === undefined || !m.cup) ? null : Math.abs(m.cup.x) - m.faceX;
  bar('C2b wood onset 41.3 ± 1.0 mm from the measured fall centre to the plank end face along the '
    + 'rail (MODEL: 41.30 / 41.56 / 41.06; the arms butt the end faces there) [red: 1c4f0d06 50.8]',
    onsetFromCup !== null && Math.abs(onsetFromCup - 0.0413) <= 0.001,
    `plate centre → end face ${mm(onsetFromCup)}`);
  bar('C2c face inner corner BEHIND the kernel mouth line by the band law\'s amount ± 3 mm at the scan '
    + 'station (DERIVED live: the plank-side band on the kernel circle c2 extended past the tip — '
    + '45.5 at the end plane (13.39, −61.15), ≈ 40 at the 2 mm-inside scan) [red: 1c4f0d06 ≤ 3]',
    m.mouthLineOff !== null && m.mouthOffPred !== null && Math.abs(m.mouthLineOff - m.mouthOffPred) <= 0.003,
    `⊥ offset ${mm(m.mouthLineOff)} vs predicted ${mm(m.mouthOffPred)} at the scan station (face x ${m.faceX?.toFixed(4)})`);
  bar('C3 zero wood along the outside diagonal (plank heights)',
    m.woodOutside === 0, `${m.woodOutside} wood hits beyond the aperture`);
  bar('C9 boot profile station law <= 9.5 deg (489 BLOCKER-CURE B9: the '
    + '15-deg stations still read as flat chord planes at 1x video zoom; '
    + 'dome <= 8 deg, brim 7.5 deg)',
    m.profStepMax !== null && m.profStepMax <= 9.5,
    `max adjacent face-normal step ${m.profStepMax} deg over `
    + `${m.profSteps?.length ?? 0} diagonal samples (top: `
    + `${(m.profSteps ?? []).slice().sort((a2, b2) => b2[1] - a2[1])
      .slice(0, 4).map(([r2, d2]) => `${d2}@${r2}`).join(' ')})`);
  bar('C11 boot dome->brim shoulder monotone-convex (489 WEDGE+PLATFORM '
    + 'cure, owner finale finding #2 blue: the exposed brim-tube upper '
    + 'quadrant + 19.6 mm cliff read as a stepped platform; rise <= 0.4 '
    + 'mm, adjacent tangent turn <= 12 deg over r 86-118 mm)',
    m.stepProfN > 30 && m.stepRise <= 0.0004 && m.stepTurn <= 12,
    `interior rise ${mm(m.stepRise)}, max tangent turn `
    + `${m.stepTurn?.toFixed(1)} deg over ${m.stepProfN} samples`);
  bar('C13 boot AZIMUTHAL station law <= 9.5 deg (review wedge-cure r1 '
    + 'P2: the sweep boot_kinks pixel row abstains on capping-occluded '
    + 'silhouette windows, so azimuthal facets under the overhang need '
    + 'a mesh-plane owner; constant-radius arc scans, C9 station family)',
    m.aziStepMax !== null && m.aziStepMax <= 9.5,
    `max adjacent azimuthal face-normal step ${m.aziStepMax} deg over `
    + `${m.aziStepN} arc samples (top: ${(m.aziTop ?? [])
      .map(([r2, a2, d2]) => `${d2}@r${r2}/az${a2}`).join(' ')})`);
  bar('C12 jaw wrap crown crossings are GRAZES <= 0.45 mm/mm (489 WEDGE+'
    + 'PLATFORM cure, owner finale finding #2 red: the 30-70 deg dive '
    + 'through the crown + re-emergence drew the dark slot arc and the '
    + 'standing wedge slab; cure family 0.30-0.33 at the tangency '
    + 'hand-over, pre-cure dive 1.3)',
    m.grazeMax !== null && m.grazeMax <= 0.00045,
    `max crossing rate ${mm(m.grazeMax)}/mm over ${m.grazeN} crossing `
    + `samples (top: ${(m.grazeTop ?? [])
      .map((g2) => `${g2[0]}/d${g2[1] * 1000}@s${g2[2] * 1000}:${mm(g2[3])}`)
      .join(' ')})`);

  // ---- C14 section-curve disjointness (owner annotation 2026-08-24) -------
  // 「这里两条相交的曲线像话吗? 直接都穿模了」 — two section curves crossing
  // on the as-built H1 sheet. Every bar above is a RAYCAST law: it asks what
  // the first surface along a probe is. A crossing between two curves is
  // invisible to that instrument — both surfaces are there, in the right
  // order, and the probe reports the right one. C14 therefore measures
  // TRIANGLES: the bay soup is extracted once and sectioned in Node by the
  // shared module tools/render/c14-disjoint.mjs.
  //
  // It ships as two rows because the bay has two different questions in it:
  //
  //   JUDGED (C14): no obSnkJawWrap arc may stand in the MOUTH — on the play
  //     side of the cushion facing — anywhere in the jaw span. That is the
  //     defect the owner circled, it is what the cure fixes, and it is a law
  //     the geometry can actually satisfy: as-built 28.16 mm of exposed
  //     curtain, cured 0.00 mm at every judged slice.
  //
  //   MEASURED (C14-CENSUS): the brief's literal disjointness census — zero
  //     crossings anywhere, WARN only under 2 mm embed and 15 mm arc. That
  //     rule is UNSATISFIABLE in this bay, and provably so rather than as an
  //     excuse: obSnkJawWrap is a polar HEIGHT FIELD whose domain boundaries
  //     rasterize as vertical curtains, a curtain crosses every slice it
  //     spans, and the r23 burial law (with the cure's own Part B) requires
  //     those curtains to END INSIDE a covering solid. A correctly buried
  //     curtain still reads as a crossing, and reads DEEPER the safer it is
  //     buried — the census score gets worse as the geometry gets better.
  //     So it is printed, archived and adjudicated, never judged.
  const c14 = await import(new URL('./c14-disjoint.mjs', import.meta.url).href);
  const c14All = args.includes('--c14-all-corners');
  const c14Cups = (c14All ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 1]])
    .map(([sx, sz]) => ({
      x: sx * m.cup.x, z: sz * m.cup.z,
      label: `${sx > 0 ? '+x' : '-x'}${sz > 0 ? '+z' : '-z'}`,
    }));
  // Admission is triangle-AABB vs the corner box — deliberately NOT the exact
  // triangle-box SAT the fullview extractor uses. There the ROI decides what
  // is JUDGED, so an over-admitted face is a false finding; here the ROI only
  // decides what is TRANSFERRED, and c14Run applies its own r <= 150 mm test
  // to reported crossings, never to the geometry. Over-admission is therefore
  // free, while under-admission would open a section curve that the
  // measurement needs shut. Verified: the census over this box reproduces the
  // one over the full fullview ROI exactly (154 FAIL / 43 contained / 309
  // WARN / 41 ADJUDICATE / 164 TOUCH on the as-built basis).
  const C14_BOX = { dxz: 0.22, y0: -0.15, y1: 0.08 };
  const c14Pins = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const scene = window.__dbg.scene;
    const CAST = [scene.getObjectByName('obTable')]; // FIX4 (2): the table group is the instrument basis here too
    const rc = new THREE.Raycaster();
    const hit = (x, z) => {
      rc.set(new THREE.Vector3(x, 0.6, z), new THREE.Vector3(0, -1, 0));
      return rc.intersectObjects(CAST, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh)[0] ?? null;
    };
    const T14 = await import('./scene/table.js');
    const G = T14.makeGeom('wpbsa_snooker_12ft');
    const wood = hit(0.5, G.W / 2 + G.CW + G.render.frameWidth / 2);
    let cloth = null;
    for (const [cx, cz] of [[0.42, 0.31], [-0.42, 0.31], [0.42, -0.31],
      [-0.42, -0.31], [0.2, 0.35]]) {
      const h = hit(cx, cz);
      if (h && Math.abs(h.point.y) < 0.004) { cloth = h; break; }
    }
    return JSON.stringify({
      woodUuid: wood?.object.material?.uuid ?? null,
      clothUuid: cloth?.object.material?.uuid ?? null,
      // nose corner |x|,|z| (m) — mouthExposure re-datums its corner-frame
      // stations onto each measured cup axis with this (review land r1 P2)
      nose: { x: G.L / 2, z: G.W / 2 },
      // R3-SNK-7: the judged band's top rides the live crown (the loft top
      // = the profile's zTop) and the jaw span starts at the live wood-end
      // meridian (the jaw wall now runs past the kernel tip to the MODEL
      // end plane, snookerFallCtx jawEnd = uFaceC) — no authored stations
      crownMm: T14.cushionProfile(G.render.cushionFamily,
        G.kernel.noseHeightFrac * G.render.profileBallD, G.CW).zTop * 1000,
      tipMm: T14.pocketFaceStations('wpbsa_snooker_12ft').uFaceC * 1000,
    });
  })()`).then(JSON.parse);
  const nC14 = await chrome.eval(`(() => {
    const BOX = ${JSON.stringify(C14_BOX)};
    const CUPS = ${JSON.stringify(c14Cups.map((c) => [c.x, c.z]))};
    const scene = window.__dbg.scene;
    scene.updateMatrixWorld(true);
    const list = [];
    const chainVisible = (o) => {
      for (let p = o; p; p = p.parent) if (p.visible === false) return false;
      return true;
    };
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !chainVisible(o)) return;
      if (/ball|cue|hud|marker/i.test(o.name)) return;
      if (!o.geometry.getAttribute('position')) return;
      list.push(o);
    });
    window.__c14 = { list, BOX, CUPS };
    window.__c14Info = (mi) => {
      const o = window.__c14.list[mi];
      const g = o.geometry;
      const pos = g.getAttribute('position');
      return JSON.stringify({
        name: o.name || '(anon)',
        nt: (g.index ? g.index.count : pos.count) / 3,
        matUuid: (o.material && o.material.uuid) || '',
      });
    };
    window.__c14Chunk = (mi, t0, t1) => {
      const o = window.__c14.list[mi];
      const { BOX: B, CUPS: C } = window.__c14;
      const g = o.geometry;
      const pos = g.getAttribute('position');
      const idx = g.index;
      const e = o.matrixWorld.elements;
      const nt = (idx ? idx.count : pos.count) / 3;
      const soup = [];
      const w = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let t = t0; t < Math.min(t1, nt); t++) {
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity,
          by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const vx = pos.getX(vi), vy = pos.getY(vi), vz = pos.getZ(vi);
          const x = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
          const y = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
          const z = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
          w[k][0] = x; w[k][1] = y; w[k][2] = z;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
          if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
        }
        if (by1 < B.y0 || by0 > B.y1) continue;
        let near = false;
        for (const c of C) {
          if (bx1 < c[0] - B.dxz || bx0 > c[0] + B.dxz) continue;
          if (bz1 < c[1] - B.dxz || bz0 > c[1] + B.dxz) continue;
          near = true; break;
        }
        if (!near) continue;
        for (let k = 0; k < 3; k++) {
          soup.push(Math.round(w[k][0] * 1e6) / 1e6,
            Math.round(w[k][1] * 1e6) / 1e6,
            Math.round(w[k][2] * 1e6) / 1e6);
        }
      }
      return JSON.stringify(soup);
    };
    return list.length;
  })()`);
  const c14Meshes = [];
  let c14Tris = 0;
  for (let mi = 0; mi < nC14; mi++) {
    const inf = JSON.parse(await chrome.eval(`window.__c14Info(${mi})`));
    const tris = [];
    for (let t0 = 0; t0 < inf.nt; t0 += 15000) {
      const part = JSON.parse(await chrome.eval(
        `window.__c14Chunk(${mi}, ${t0}, ${t0 + 15000})`));
      for (const f of part) tris.push(f);
    }
    if (!tris.length) continue;
    // Resolve the unnamed carcass meshes the same way every 489 instrument
    // does: by pinned material identity, so a crossing can be attributed to
    // "cloth" or "railwood" by name in the report instead of to "(anon)".
    const name = inf.name !== '(anon)' ? inf.name
      : (inf.matUuid === c14Pins.woodUuid ? 'railwood'
        : (inf.matUuid === c14Pins.clothUuid ? 'cloth' : '(anon)'));
    c14Meshes.push({ name, tris });
    c14Tris += tris.length / 9;
  }
  const c14Top = Math.floor(c14Pins.crownMm - 2.5);
  const mouth = c14.mouthExposure(c14Meshes, c14Cups, {
    noseMm: { x: c14Pins.nose.x * 1000, z: c14Pins.nose.z * 1000 },
    slices: c14.mouthSlices(c14Top),
    informational: [0, 4, 8, c14Top + 1, c14Top + 2],
    tipMm: c14Pins.tipMm });
  const mouthBad = mouth.corners.flatMap((c) => c.slices
    .filter((s) => s.judged && (s.worst > 0 || s.noCloth))
    .map((s) => `${c.cup.label}@y${s.y}:${s.noCloth ? 'NO-CLOTH'
      : `${s.worst.toFixed(2)}mm(L${s.L.toFixed(1)}/U${s.U.toFixed(1)})`}`));
  bar('C14 no jaw-wrap curtain stands in the MOUTH (owner 2026-08-24 '
    + '「两条相交的曲线…直接都穿模了」: past the rail tangency the B1 nose '
    + 'kill mask was datum\'d to the STRAIGHT kernel nose planes while the '
    + 'true front boundary is the jaw arc, so the wrap was masked down '
    + 'THROUGH the jaw facing and stood in open air on the play side; '
    + 'zero exposed arc over the jaw span at every judged slice)',
    mouthBad.length === 0 && mouth.judged > 0,
    `worst exposed run ${mouth.worst.toFixed(2)} mm over `
    + `${mouth.judged} judged slices x ${c14Cups.length} corner(s)`
    + (mouth.worstAt
      ? ` (at ${mouth.worstAt.corner} y=${mouth.worstAt.y}, sheet `
        + `${mouth.worstAt.u}, ${mouth.worstAt.v})` : '')
    + (mouthBad.length ? ` — ${mouthBad.slice(0, 6).join(' ')}` : ''));
  // review CURE-R10 land r11 P3: an unmeasurable slice must SAY so — the
  // --out report persists only this string, and a bare '0.0mm' would
  // archive the crest's known no-cloth stations as zero exposure.
  const c14Info = mouth.corners.flatMap((c) => c.slices
    .filter((s) => !s.judged)
    .map((s) => `${c.cup.label}@y${s.y}:${s.worst.toFixed(1)}mm`
      + (s.noCloth ? '(NO-CLOTH stations)' : '')));
  info('C14-BAND mouth exposure outside the judged band (below y=13 the '
    + 'cushion undercut recedes while the mask, datum\'d to the nose-height '
    + 'plan chain, does not; at y>=42 the wrap IS the visible crest skin and '
    + '"mouth side" is degenerate)', c14Info.join(' ') || 'none');
  const census = c14.c14Run(c14Meshes, c14Cups);
  const tally = {};
  const worstFail = [];
  for (const c of census.corners) {
    for (const s of c.slices) {
      for (const x of s.crossings ?? []) {
        tally[x.level] = (tally[x.level] ?? 0) + 1;
        if (x.level === 'FAIL') worstFail.push({ ...x, y: s.y, c: c.cup.label });
      }
      for (const x of s.containments ?? []) {
        const k = `CONTAINED-${x.level ?? 'FAIL'}`;
        tally[k] = (tally[k] ?? 0) + 1;
        if ((x.level ?? 'FAIL') === 'FAIL') {
          // Containments carry own/host/depth where crossings carry a/b/embed
          // — normalise so one ranking can read both.
          worstFail.push({ a: x.own, b: x.host, key: `${x.own}|${x.host}`,
            embed: x.depth, arc: null, u: x.u, v: x.v,
            y: s.y, c: c.cup.label, contained: true });
        }
      }
    }
  }
  worstFail.sort((a2, b2) => (b2.embed ?? 0) - (a2.embed ?? 0));
  const pairs = {};
  for (const f of worstFail) pairs[f.key] = (pairs[f.key] ?? 0) + 1;
  info('C14-CENSUS brief-literal section-curve disjointness (NOT judged: a '
    + 'buried termination curtain is a crossing by construction and scores '
    + 'deeper the better it is buried — see the block comment above)',
    `${census.slices ?? census.corners[0].slices.length} slices x `
    + `${c14Cups.length} corner(s), ${c14Tris} bay triangles: `
    + Object.entries(tally).sort().map(([k, v]) => `${k} ${v}`).join(', ')
    + ` | pairs ${Object.entries(pairs).sort((a2, b2) => b2[1] - a2[1])
      .slice(0, 4).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`
    + ` | deepest ${worstFail.slice(0, 3).map((f) => `${f.a}x${f.b}`
      + `${f.contained ? '(contained)' : ''}@y${f.y}(${f.u},${f.v}) `
      + `${f.embed}mm${f.arc === null ? '' : `/${f.arc}mm`}`)
      .join(' ') || 'none'}`);
  const c14JsonPath = __pathOpt('--c14-json', { default: null, tag: 'check-pocket-construction' }); // FIX2: blank / trailing refused
  if (c14JsonPath) {
    const fs14 = await import('node:fs');
    fs14.writeFileSync(c14JsonPath,
      JSON.stringify({ box: C14_BOX, bayTris: c14Tris, cups: c14Cups,
        mouth, census, tally }, null, 1));
    console.log(`C14 record -> ${c14JsonPath}`);
  }

  // ---- M4 middle-jaw contact-height concordance (GH-568) -----------------
  // The pocket-physics close-out gated CORNER visual–kernel concordance at
  // contact height (rails 0.0 µm, jaw worst 0.017 mm) but the MIDDLE-jaw
  // equivalent only ever ran ad hoc — and its first read was a false "air
  // slot" from an inherited corner-scoped ROI dump (x >= 1.2845 kept 0
  // local middle triangles; refutation: PR #498 comment 5434858058). The
  // row lives with the other section-plane instruments (the C14 sectioner
  // family) and OWNS ITS ROI: both middle bays are extracted with their
  // own boxes, reusing the C14 mesh list + transfer machinery. Admission
  // is triangle-AABB (the C14 rule: the ROI only decides what is
  // TRANSFERRED — the 12 mm correspondence corridor and the ±1.5 mm
  // wall-top scan decide what is judged, so over-admission is free).
  const mj = await import(new URL('./midjaw-concord.mjs',
    import.meta.url).href);
  // review GH-568 r4 P1: the judged reference is the KERNEL's own table —
  // the page imports the SAME pool_wasm module instance main.js already
  // initialized (ES module cache), so table_geometry_json_for is live.
  // The JS mirror's construction rides along only as the other side of
  // the M4d mirror-deviation check.
  const mjG = await chrome.eval(`(async () => {
    const T = await import('./scene/table.js');
    const G = T.makeGeom('wpbsa_snooker_12ft');
    const glue = await import('./dist/pool-wasm/pool_wasm.js');
    const kt = JSON.parse(glue.table_geometry_json_for(
      'wpbsa_snooker_12ft', G.render.profileBallD / 2));
    if (kt.error) throw new Error('kernel table: ' + kt.error);
    return JSON.stringify({ middle: G.middle, W: G.W, kt });
  })()`).then(JSON.parse);
  const mjChains = mj.chainsFromKernel(mjG.kt);
  const mjH = mjChains.HKernel; // the kernel arcs' own contact height
  const mjMirror = mj.middleChains(mjG.middle, mjG.W);
  const mjMirrorDev = Math.max(...Object.keys(mjChains.flanks).map((k) =>
    mj.chainDeviation(mjChains.flanks[k], mjMirror.flanks[k])));
  // slim contact-height band datum'd on the KERNEL middle pockets: the
  // chain spans |x| <= utm (110.3 mm), z within ~20 mm of the nose line;
  // the box carries the corridor + the wall-top scan with margin
  const MJ_BOXES = mjG.kt.pockets
    .map((p) => ({ x: p.center.y, z: p.center.x }))
    .filter((p) => Math.abs(p.x) < 0.2)
    .map((p) => ({ x0: p.x - 0.16, x1: p.x + 0.16,
      z0: p.z - (p.z > 0 ? 0.19 : 0.13), z1: p.z + (p.z > 0 ? 0.13 : 0.19),
      y0: 0.005, y1: 0.12 }));
  await chrome.eval(`(() => {
    const BOXES = ${JSON.stringify(MJ_BOXES)};
    window.__mjChunk = (mi, t0, t1) => {
      const o = window.__c14.list[mi];
      const g = o.geometry;
      const pos = g.getAttribute('position');
      const idx = g.index;
      const e = o.matrixWorld.elements;
      const nt = (idx ? idx.count : pos.count) / 3;
      const soup = [];
      const w = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let t = t0; t < Math.min(t1, nt); t++) {
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity,
          by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const vx = pos.getX(vi), vy = pos.getY(vi), vz = pos.getZ(vi);
          const x = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
          const y = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
          const z = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
          w[k][0] = x; w[k][1] = y; w[k][2] = z;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
          if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
        }
        let near = false;
        for (const B of BOXES) {
          if (bx1 < B.x0 || bx0 > B.x1 || by1 < B.y0 || by0 > B.y1
            || bz1 < B.z0 || bz0 > B.z1) continue;
          near = true; break;
        }
        if (!near) continue;
        for (let k = 0; k < 3; k++) {
          soup.push(Math.round(w[k][0] * 1e6) / 1e6,
            Math.round(w[k][1] * 1e6) / 1e6,
            Math.round(w[k][2] * 1e6) / 1e6);
        }
      }
      return JSON.stringify(soup);
    };
    return true;
  })()`);
  const mjMeshes = [];
  let mjTris = 0;
  for (let mi = 0; mi < nC14; mi++) {
    const inf = JSON.parse(await chrome.eval(`window.__c14Info(${mi})`));
    const tris = [];
    for (let t0 = 0; t0 < inf.nt; t0 += 15000) {
      const part = JSON.parse(await chrome.eval(
        `window.__mjChunk(${mi}, ${t0}, ${t0 + 15000})`));
      for (const f of part) tris.push(f);
    }
    if (!tris.length) continue;
    const name = inf.name !== '(anon)' ? inf.name
      : (inf.matUuid === c14Pins.woodUuid ? 'railwood'
        : (inf.matUuid === c14Pins.clothUuid ? 'cloth' : '(anon)'));
    mjMeshes.push({ name, tris });
    mjTris += tris.length / 9;
  }
  const mjRow = mj.midjawRow(mjMeshes, mjChains, mjH);
  const mjV = mj.verdicts(mjRow);
  const mjSum = Object.entries(mjRow.flanks).map(([n, f]) => {
    const wallMin = f.walls.reduce((a, w2) => (w2.topMm === null ? a
      : Math.min(a, w2.topMm - mjRow.HMm)), Infinity);
    return `${n} ${f.covered}/${f.nBins}`
      + (f.worstProudMm === null ? ' NO-CONTACT-FAMILY'
        : ` [${f.worstRecessedMm.toFixed(3)},+${
          f.worstProudMm.toFixed(3)}]mm`)
      + (f.proudOutliers
        ? ` PROUD-OUTLIERS ${f.proudOutliers} (worst ${f.proudOutlierFam
        } +${f.proudOutlierWorstMm.toFixed(2)}mm@s${f.proudOutlierAtMm})`
        : '')
      + (f.famProudWorstMm !== null && f.famProudWorstMm > 0.05
        ? ` FAM-PROUD ${f.famProudWorstFam} +${
          f.famProudWorstMm.toFixed(3)}mm` : '')
      + (f.wallBad.length
        ? ` wallTop ${f.wallBad.length} station(s) below H`
        : ` wallTop>=H+${wallMin === Infinity ? '?' : wallMin.toFixed(2)}mm`);
  }).join('; ');
  bar('M4a middle-jaw H-plane coverage 144/144 station bins on ALL FOUR '
    + 'flanks (GH-568: a middle row OWNS ITS ROI — the corner-scoped dump '
    + 'kept 0 local middle tris and read as an air slot)',
    mjV.coverage && mjTris > 0,
    `${mjTris} bay tris at kernel H=${mjRow.HMm.toFixed(2)}mm, chain `
    + `${mjRow.tipSMm}mm x ${mjRow.nBins} bins — ${mjSum}`);
  bar('M4b middle-jaw cloth first-contact envelope within [-0.10, +0.05] '
    + 'mm of the KERNEL two-arc chain (close-out measured +0.00/-0.03 mm '
    + 'on cup-4 +x; the row measures all four flanks, and play-side '
    + 'surfaces beyond the corridor fail as proud outliers)',
    mjV.envelope, mjSum);
  bar('M4c middle-jaw wall top at/above contact height at every 5 mm '
    + 'station (close-out measured 2.0-6.75 mm above H — a facing that '
    + 'concords in plan but stops below H still plays as an air slot)',
    mjV.wallTop, mjSum);
  bar('M4d JS CEBP mirror rides the kernel arcs <= 1 um (review GH-568 r4 '
    + 'P1: the judged M4 reference is chainsFromKernel over the wasm '
    + 'table serialization, so a mirror drift moves the MESH but not the '
    + 'reference and fires M4b; this bar names the drift directly — no '
    + 'pre-existing mirror check compared circular centers/radii/spans)',
    mjMirrorDev <= 1e-6,
    `max chain deviation ${(mjMirrorDev * 1000).toFixed(6)} mm across `
    + 'the 4 flanks (kernel arcs vs web/scene/table.js middleCanonical)');
  const mjRedPath = (() => { const o = __P.value('--midjaw-red'); /* FIX10 (Fable pass 1): read from the parse */ return o ? path.resolve(o) : null; })(); // FIX2
  if (mjRedPath) {
    // red-arm discipline: replay the artifact case (the corner-scoped
    // dump filter) against the live extraction — every M4 law must FIRE
    // on the void it leaves, and the basis is archived for the record
    const ablated = mj.cornerScopeAblation(mjMeshes);
    const redRow = mj.midjawRow(ablated, mjChains, mjH);
    const redV = mj.verdicts(redRow);
    // review GH-568 r5 P2: M4d needs its own red arm — a chainDeviation
    // that always reads zero must be caught here, not trusted. A 1 mm
    // perturbation of the JS mirror's arc-1 radius must read >> 1 um.
    const mjPerturb = { ...mjG.middle, r1: mjG.middle.r1 + 0.001 };
    const mirrorRed = mj.middleChains(mjPerturb, mjG.W);
    const mirrorRedDev = Math.max(...Object.keys(mjChains.flanks).map((k) =>
      mj.chainDeviation(mjChains.flanks[k], mirrorRed.flanks[k])));
    const mirrorFired = mirrorRedDev > 1e-6;
    const fired = !redV.coverage && !redV.envelope && !redV.wallTop
      && mirrorFired;
    const fsmj = await import('node:fs');
    const { execSync } = await import('node:child_process');
    // review GH-568 r3 P2: the archived proof binds its PRODUCING bytes —
    // a bare HEAD would let a run with uncommitted gate/helper edits
    // claim the previous commit. Same provenance law as the --out
    // report: tree + web tree object + web dirt, plus content hashes of
    // the gate file and the midjaw helper actually executed.
    let mjTree = null, mjWebTree = null, mjDirty = null;
    try {
      mjTree = execSync('git rev-parse HEAD',
        { cwd: path.dirname(webDir), encoding: 'utf8' }).trim();
      mjWebTree = execSync('git rev-parse HEAD:web',
        { cwd: path.dirname(webDir), encoding: 'utf8' }).trim();
      mjDirty = execSync('git status --porcelain -- web/ tools/render/',
        { cwd: path.dirname(webDir), encoding: 'utf8' }).trim()
        .split('\n').filter((l) => l
          && !l.endsWith(path.basename(mjRedPath))).length > 0;
    } catch { /* non-git web dir: hashes below are the binding */ }
    const mjCrypto = await import('node:crypto');
    const sha12 = (u) => mjCrypto.createHash('sha256').update(
      fsmj.readFileSync(new URL(u, import.meta.url).pathname))
      .digest('hex').slice(0, 12);
    fsmj.writeFileSync(mjRedPath, JSON.stringify({
      tool: 'tools/render/check-pocket-construction.mjs --midjaw-red',
      tool_sha12: sha12(import.meta.url),
      mj_helper: 'tools/render/midjaw-concord.mjs',
      mj_sha12: sha12('./midjaw-concord.mjs'),
      law: 'GH-568 M4a/M4b/M4c middle-jaw contact-height concordance',
      ablation: 'corner-scoped ROI filter x >= 1.2845 m replayed on the '
        + 'middle-bay soup (the PR #498 comment 5434858058 artifact: 0 '
        + 'local middle triangles)',
      tree: mjTree, web_tree: mjWebTree, src_dirty: mjDirty,
      when: new Date().toISOString(),
      reference: 'kernel table_geometry_json_for(wpbsa_snooker_12ft) '
        + 'circular arcs (chainsFromKernel)',
      mirror_dev_mm: +(mjMirrorDev * 1000).toFixed(6),
      mirror_red_arm: { perturb: 'middle r1 + 1 mm (JS mirror)',
        dev_mm: +(mirrorRedDev * 1000).toFixed(3), fired: mirrorFired },
      real: { verdicts: mjV, row: mjRow },
      ablatedRun: { verdicts: redV, fired, row: redRow },
    }, null, 1));
    console.log(`M4 red basis -> ${mjRedPath}`);
    bar('M4-RED corner-scope ablation FIRES every soup law AND a 1 mm '
      + 'mirror perturbation FIRES M4d (a gate that cannot red is not a '
      + 'gate)',
      fired,
      `ablated soup: ${ablated.reduce((a, m2) => a + m2.tris.length / 9, 0)}`
      + ` tris; verdicts coverage=${redV.coverage} envelope=${redV.envelope}`
      + ` wallTop=${redV.wallTop}; mirror-perturb dev `
      + `${(mirrorRedDev * 1000).toFixed(3)}mm (fires=${mirrorFired})`);
  }

  // ==== craft R3-SNK-2 RE-DERIVATION of the eleven W6/W7-era furniture
  // rows to the MAGNUM-ANCHORED construction (SPIKE-REPORT-CRAFT-R2.md
  // §R3-SNK-2; maintainer ruling 3: re-derive each row to what it is
  // FOR, measured on the new parts, with a red arm — never a red row left
  // for a later check). Red arm: `--web <git archive of ed88af2d web>
  // --expect-red` (the card-18 bytes: dome/brim boot, green cloth tube,
  // lathe sock + hem skirt + gather ring) — the rows marked [red: card 18]
  // fire there; rows whose red basis is an older tree keep it in their
  // own comment.
  //
  // C10 — the bag under the hem is a slack BASKET, not a slim tube. The
  // net is a knotted cord lattice now, so the envelope at a height is the
  // max first-hit radius over a 15-ray fan (netEnvAt). Under the hem
  // (−112) the R3-SNK-2 bag reads ≈ 45 mm (Magnum taper to the hem plane,
  // then the XW101 gathered bunch). [red basis named: be56a831 slim tube
  // 13–19 — EXECUTED R3-SNK-3 (git archive be56a831, --expect-red, log
  // /tmp/craftr3/gates3/construction-red-be56a831.log): reads 52.3 mm at
  // −112 → does NOT fire under this law (its slim tube was read at −130
  // by the old first-hit law). The executed red this round is the rev-12
  // tree 8b93c61e (the sha 6be50312's own commit message pins for the
  // rev-12 bytes): envelope 18.9 mm → fires (construction-red-rev12.log).
  // "W6" has no sha pin anywhere; the best candidate 18bd4e2a reads
  // byte-identically to rev-12 here (construction-red-w6.log).]
  bar('C10 net basket width at -112 mm >= 40 mm off the cup axis (489 '
    + 'BLOCKER-CURE B14: the slim W14 tube read ~1/9 of the boot; R3-SNK-2: '
    + 'cord-lattice envelope over a 15-ray fan)',
    m.netR13 !== null && m.netR13 >= 0.040,
    `net envelope at -112: r ${mm(m.netR13)} off the axis`);
  // C10b — RE-DERIVED: the pass-2 "knit emerges at hem width" law described
  // the hem-skirt fixture. Magnum: the bag at the hem plane sits at ≈ 0.43
  // of the skirt hem radius (r 47 vs hem 108); XW101 outside-rail montage:
  // the knit under the hem is well inside the boot. Law: envelope at −108
  // within [0.30, 0.60] × the hem R 114.5 = [34, 69] mm. [red: card 18 —
  // its hem skirt read ~116 mm]
  bar('C10b net just under the hem (-108.5 mm) is the slack bag well inside the '
    + 'skirt: envelope r within [34, 69] mm = [0.30, 0.60] x hem R 114.5 (MFR) '
    + '(R3-SNK-2 law: Magnum 0.43 x hem; the pass-2 hem-width skirt (116) fires)',
    m.netR108 !== null && m.netR108 >= 0.034 && m.netR108 <= 0.069,
    `net envelope at -108.5: r ${mm(m.netR108)} off the axis`);
  // C10c — RE-DERIVED: the studded gather ring was a sock fixture (no
  // second ring exists in the XW101 montage below the hem; the Magnum has
  // a bottom band at the bag's END). Law: the corner bag hangs to the E18
  // band and GATHERS CLOSED — its bottom 20 mm stays within r ≤ 14 mm (the
  // whipped tail knot). [red: card 18 — the lathe sock's open rim reads
  // r 16.3 at −262.5]
  // LAW-PURCHASED-BASELINE (r3_4): E18 −262 is MFR-class — the OEM
  // outside-rail montage shows the knit ≥ 160 mm below the hem (crop floor)
  // gathered to a tail; the Magnum's 118 mm bag + R 31 band is the
  // overridden MODEL form (a MODEL-band build inside this round was
  // retracted, §R3c.11.7). [red: card 18 — the lathe sock's open rim reads
  // r 16.3 at −262.5]
  // R3-SNK-BODY-1 (r3_13, PHOTO): the XW101 bag ends ON the slide ring — centre
  // 162 ±15 under the rail top (E18 −121.8, band [−136.8, −106.8]), OD 88 ±12
  // — so the bottom is not a gathered tail but the cord binding round the
  // ring: the lowest 6 mm's max radius sits at the ring's cord radius (44 −
  // tube 4 − cord 1.08 = 38.9, + the 2.5 binding tube = 41.4), band [33, 45]
  // from the PHOTO OD band. The r3_4 montage tail (−262, r ≤ 14) retires with
  // the six-chute read. [red: the a7e5e437 bag bottom −262 fires the band]
  bar('C10c bag bottom in the E18 band [-136.8, -106.8] mm and bound ON the slide ring: '
    + 'lowest 6 mm max r within [33, 45] mm (R3-SNK-BODY-1 r3_13 PHOTO ring OD 88 ±12; '
    + 'the a7e5e437 knit tail at -262 / r 9.5 fires both clauses)',
    m.netBottom !== null && m.netBottom >= -0.1368 && m.netBottom <= -0.1068
    && m.netBottomR !== null && m.netBottomR >= 0.033 && m.netBottomR <= 0.045,
    `net bottom ${mm(m.netBottom)}, lowest-6 mm max r ${mm(m.netBottomR)}`);
  // C5c — RETIRED (R3-SNK-3, ORDER-CRAFT-R3-SNK3.md item C: the letter is
  // the photo). The XW101 carries ONE stitch row per pocket, on the outer
  // skirt under the roll; the "second row" of the pass-2/R3 constructions
  // (the Magnum's flap-face net-seam row) was the model's, not the
  // table's, and is no longer built. Its subject moved into C5a (the one
  // row, where the photo puts it) and C5b (nothing on the flap face or
  // the plate top). No executable leg remains.
  // C4a — RE-DERIVED: the cloth-dressed fall face exists on the TABLE-SIDE
  // half (Magnum: the slate cut sits between the cushion bases; the
  // outward half below the flap is the cavity). Law: inward ray at
  // −20/−30 → obPocketFallWall; outward ray at −20/−30 → the cavity read
  // (obPocketLining | obPocketNet), never a cloth tube or bare stone.
  // [red: card 18 — its outward wall read obPocketFallWall (the tube)]
  bar('C4a throat: cloth fall face on the TABLE side at -20/-30 mm, cavity '
    + '(cords | the leather inside | the shelf) on the OUTWARD side (R3-SNK-9 kernel fall; the green tube fires)',
    m.tin20?.n === 'obPocketFallWall' && m.tin30?.n === 'obPocketFallWall'
    // R3-SNK-9: the outward cavity under the kernel disc is AIR + the net —
    // the ray ends on a cord or runs to the leather's own inside / the shelf;
    // never a cloth tube (card 18) or bare stone (W6)
    && ['obPocketNet', 'obPocketCap', 'obPocketValance', 'obPocketLining', 'obPocketShade'].includes(m.th20?.n)
    && ['obPocketNet', 'obPocketCap', 'obPocketValance', 'obPocketLining', 'obPocketShade'].includes(m.th30?.n),
    `inward -20: ${m.tin20?.n ?? 'none'}, -30: ${m.tin30?.n ?? 'none'}; `
    + `outward -20: ${m.th20?.n ?? 'none'}, -30: ${m.th30?.n ?? 'none'}`);
  // C4b — RE-DERIVED: the −40 read on the outward half is the cord lattice
  // over the leather-back lining — knit PRESENT (≥ 2 of 7 rays fanned ±15°
  // first-hit obPocketNet), first hit never stone/ring/shade. [red basis:
  // rev-12 ring iron / W6 bare bore — EXECUTED R3-SNK-3 on git archives:
  // rev-12 8b93c61e FIRES exactly as named (ring iron on all 7 rays, 0/7
  // knit; /tmp/craftr3/gates3/construction-red-rev12.log). "W6" has no
  // sha pin; the best candidate 18bd4e2a (construction-red-w6.log) fires
  // via the same ring-iron class — NO tree reproduces a bare-slate-bore
  // read this round; the 'W6 bare bore' class stays a comment, not an
  // executed red.]
  bar('C4b corner net at -40 mm on the outward half (>= 2/7 fan rays meet '
    + 'obPocketNet; first hits lining | cords only) (W7 knit law, R3-SNK-2 '
    + 'cord-lattice re-derivation; rev-12 read the ring iron, W6 bare bore)',
    m.knit40 >= 2 && Array.isArray(m.out40)
    // R3-SNK-9: no lining under the kernel disc — a fan ray may end on the
    // cords, the leather's inside, the shelf, or nothing; never stone
    && m.out40.every((n) => ['obPocketNet', 'obPocketCap', 'obPocketValance', 'obPocketLining', 'obPocketShade', 'none'].includes(n)),
    `-40 fan: ${JSON.stringify(m.out40)} (${m.knit40}/7 knit)`);
  // C8 — RE-DERIVED: the drilled slate bore may never read. Outward first
  // NON-knit hit at −35/−45 = the leather-back lining (0.2 mm inside the
  // bore); inward −35/−45 = the cloth face / its sleeve. [red basis: rev-21
  // bare obSnkSlab; a gate that lets the stone read fires here]
  // R3-SNK-9 (RULING R-S8-2): under the kernel fall disc there is no
  // drilled bore and no lining outward of the plate centre — the outward
  // ray's first NON-knit surface is the leather's inside (cap / valance),
  // the shelf, or nothing; stone (obSnkSlab) or a bore lining may never
  // read. [red: 9c0437a3 — obPocketLining at 45.9 → fires; rev-21 slab]
  bar('C8 corner: no stone under the kernel fall — outward non-knit at -35/-45 '
    + 'is the leather back (obPocketLining = the sheet\'s flesh side) / the leather / the shelf / nothing '
    + '(never obSnkSlab); inward -35/-45 = obPocketFallWall (R3-SNK-9; W16/E38 law)',
    ['obPocketCap', 'obPocketValance', 'obPocketLining', 'obPocketShade', undefined].includes(m.bore35?.n)
    && ['obPocketCap', 'obPocketValance', 'obPocketLining', 'obPocketShade', undefined].includes(m.bore45?.n)
    && m.tin35?.n === 'obPocketFallWall' && m.tin45?.n === 'obPocketFallWall',
    `outward -35: ${m.bore35?.n ?? 'none'}@${m.bore35?.d ?? '—'}, -45: `
    + `${m.bore45?.n ?? 'none'}@${m.bore45?.d ?? '—'}; inward -35: `
    + `${m.tin35?.n ?? 'none'}, -45: ${m.tin45?.n ?? 'none'}`);
  // C5a — RE-DERIVED (R3-SNK-3): the ONE row is on the outer skirt
  // directly under the roll (photo: Masters arena closeup 7–8 px below
  // the rail-top plane at ~4 m ≈ 10–15 mm; Welsh Open video g005; the
  // loose piece's roll → skirt seam). Built: dash centre 12 mm under the
  // plate top → dash tops within [top − 15, top − 8]; radially on the
  // skirt (rMin ≥ the outer round's foot ceR ≈ 77.5 → ≥ lip + 34). [red:
  // a395267f (R3-SNK-2) — its obPocketStitch row was the flap-face seam at
  // +18.5 / rMin lip + 6.2; card 18 — the meet-seam row at 10.6 / 87.5]
  // C5a — RE-DERIVED (R3-SNK-9, RULING R-S8-1: the purchased Magnum is the
  // construction baseline; the R3-SNK-3 "photo decides" law retired): the
  // OUTER row's dash centres sit 24.61 mm under the plate top (MODEL M1:
  // z 15.56 under 40.17; ± 0.7 = the read spread + the dash's 0.1 mm seat)
  // on the skirt (rMin ≥ lip + 34). [red: 9c0437a3 — its outer row at
  // 12 under (the photo) fires]
  bar('C5a the OUTER stitch row sits on the skirt 24.61 +- 0.7 mm under the '
    + 'plate top (R3-SNK-9 MODEL M1 z 15.56; rMin >= lip + 34; the R3-SNK-3 '
    + 'photo row at 12 under and the card-18 meet-seam row fire)',
    m.stitch !== null && m.crest !== null
    && Math.abs((m.crest - m.stitch.yMean) - 0.02461) <= 0.0007
    && m.stitch.rMin >= (m.holeDia / 2) + 0.034,
    `outer row centre ${mm(m.crest - (m.stitch?.yMean ?? 0))} under the top, `
    + `n ${m.stitch?.n ?? 0}, rMin ${mm(m.stitch?.rMin)} (lip ${mm(m.holeDia / 2)})`);
  // C5b — RE-DERIVED (R3-SNK-3; the rev-11 crown-ring law kept executable):
  // no dash on the plate top or the flap face — every dash top ≥ 6 mm
  // under the leather top (below the outer round's foot) and no dash
  // within lip + 20 mm (the mouth face); no second row exists
  // (obPocketStitch2 absent). [red: card 18 — its row 2 sat 7.4 mm under
  // the crest at r 87 → passes the top leg but its obPocketStitch2 exists
  // → fires; a395267f — flap row at lip + 6.2 → fires]
  // C5b — RE-DERIVED (R3-SNK-9, RULING R-S8-1): the flap-face NET-SEAM row
  // exists — dash centres 23.37 ± 0.7 under the plate top (MODEL M1 z 16.80)
  // ON the leaning flap face: the row's mean radius sits within [0.1, 1.4]
  // mm outside the face's radius at that height (0.1 seat + the 1.2 mm
  // section, 0.5 proud — the #625 thread-lie law), ≥ 13 dashes (MODEL 15
  // over ± 91.7° at pitch 11.24; the wood planes may take one each side);
  // nothing on the plate top (no dash top within 6 mm of the crest).
  // [red: 9c0437a3 — no flap-face row → fires; rev-11 crown ring fires]
  bar('C5b the flap-face NET-SEAM row: dash centres 23.37 +- 0.7 mm under the '
    + 'plate top on the leaning flap face (centroid face − [0.3, 1.3] mm toward the mouth), >= 13 '
    + 'dashes, nothing within 6 mm of the crest (R3-SNK-9 MODEL M1; the '
    + 'rev-11 crown ring and a plain face fire)',
    m.stitchSeam !== null && m.crest !== null && m.stitch !== null
    && Math.abs((m.crest - m.stitchSeam.yMean) - 0.02337) <= 0.0007
    && m.stitchSeam.n >= 13
    // proud of the flap face = TOWARD the mouth axis (smaller radius): the
    // bowed tube's centroid sits face − (endAxis + 2/3·sag) ≈ 0.8 inside
    && (m.flapAtSeam - m.stitchSeam.rMean) >= 0.0003 && (m.flapAtSeam - m.stitchSeam.rMean) <= 0.0013
    && (m.crest - m.stitchSeam.yMax) >= 0.006 && (m.crest - m.stitch.yMax) >= 0.006,
    `seam row centre ${mm(m.crest - (m.stitchSeam?.yMean ?? 0))} under the top, n `
    + `${m.stitchSeam?.n ?? 0}, r mean ${mm(m.stitchSeam?.rMean)} vs face ${mm(m.flapAtSeam)}; `
    + `tops ${mm(m.crest - (m.stitchSeam?.yMax ?? 0))} / ${mm(m.crest - (m.stitch?.yMax ?? 0))} under`);
  // ==== craft R3-SNK-5 net-form and contour rows (Magnum-measured; the
  // reads and their bands cite /tmp/craftr3/net5 and /tmp/craftr3/plate5,
  // report §R3c.10). Red arm: --web <git archive of 3f469029> --expect-red
  // (the R3-SNK-3 torus knots / straight cords / R4 plate) — rows marked
  // [red: 3f469029] fire there; N5 (row-1 depth) is admitted by the
  // Magnum's own spread and fires on nothing, said here.
  bar('N1 cord diameter 1.8-2.5 mm (Magnum body cords median 2.16, p10 1.80 / '
    + 'p90 2.48; n1_sections.py) — read from the cords mesh tube ring',
    m.cordDia !== null && m.cordDia >= 0.0018 && m.cordDia <= 0.0025,
    `cord Ø ${mm(m.cordDia)}`);
  bar('N2 knot body across its axis 3.4-5.2 mm (a 1-1.5 turn coil of radius '
    + '0.97 about the crossing cord, tube = the cord: 2(rho + t) = 4.3, p10/p90 '
    + '3.7-4.6; n4c_coil.py) [red: 3f469029 torus 6.5]',
    m.knotAcross !== null && m.knotAcross >= 0.0034 && m.knotAcross <= 0.0052,
    `median knot extent across its axis ${mm(m.knotAcross)}`);
  bar('N3 knots per course 20-23 round the cup (SAME-COURSE count: 360 / the '
    + 'median azimuth step between neighbouring knots of one level (0.5 mm) in the window '
    + '-81..-52 mm; Magnum 21 at 17.0 deg, plan diagonal 13.4 [12.9, 14.0] at our '
    + 'r_mid; n3_mesh.py, R3-SNK-5B S3) [red: d69b7d33 10-11 (column-phase lattice)]',
    m.knotsPerCourse !== null && m.knotsPerCourse >= 20 && m.knotsPerCourse <= 23,
    `${m.knotsPerCourse} knots in the course band`);
  // ---- R3-SNK-12 N4 re-derivation (v2). Replaces the R3-SNK-11 block twice
  // over. The A2 audit (/tmp/craftr3/snk12/a2-n4/REPORT.md) found three
  // AUTHORED numbers in the sealed row - the +2.5 upper margin, the "law
  // median 40.05" and the red label 46.5 - and the v2 instrument (below) then
  // found that the sealed row did not measure the quantity its own text
  // described. Both findings are tabled in the report; the band is NOT patched
  // to fit a read.
  //
  // WHAT THE SEALED ROW ACTUALLY MEASURED. v1 fired 12 rays at 30 deg and took
  // netR100 = rs[Math.floor(rs.length / 2)] of the HITS, calling it "rs[6], the
  // 7th smallest of 12". rs.length is the HIT count. On this tree six of the
  // twelve rays MISS (a zero-width ray at one fixed height threads a
  // MODEL(Magnum n3_mesh) 11.9 mm lattice cell against a MODEL 2.16 mm cord),
  // so the statistic was rs[3] of 6 - and one further "hit" (az 270) landed on
  // ANOTHER pocket's obPocketNet at 1797.3 mm, because the v1 filter matched
  // the mesh NAME only. The sealed 43.1 mm read is reproducible and is exactly
  // that rs[3] of 6; it is not the 7th smallest of 12 of anything. The v1
  // statistic is retired to an INFO row (N-legacy) so the seal record's
  // 42.3 -> 43.1 walk stays checkable, and the judged quantity moves to the
  // two cord FAMILIES, each with its own band.
  //
  // WHY NOT JUST WIDEN THE FAN. It was tried before the mesh read was written:
  // 72 rays at 5 deg with a nearest-cup filter give 29 accepted hits, 43
  // misses and 1 cross-cup rejection - 6 outward and 8 table, still too few
  // for a family median. A zero-width ray at one fixed height cannot cover an
  // open lattice; the coverage floor set for that instrument FAILED, and the
  // answer to a failed coverage floor is a better instrument, not a lower
  // floor.
  //
  // INSTRUMENT (v2, the mesh read). Every obPocketNet vertex within ONE MODEL
  // cord radius (1.08 mm, from the MODEL(Magnum, n1_sections) cord diameter
  // 2.16 mm) of the y = -100 mm datum, within 160 mm of this cup and nearer to
  // THIS cup than to any other (exact, threshold-free), enters the sample with
  // its radius about the cup axis and its |alpha| about the outward diagonal
  // (the instrumented corner is +x+z, so that diagonal is world 45 deg).
  // |alpha| <= 45 is the OUTWARD family, |alpha| >= 135 the TABLE family, the
  // rest the BLEND (never judged, see N-blend). A cord crossing the band
  // contributes a full tube ring, so each family's MEDIAN is a CENTRELINE
  // radius: the 0 .. -1.08 mm near-surface bias the ray read had to disclose
  // is removed by construction rather than declared.
  //
  // THE TWO FAMILY RADII at -100 mm on OUR datums (rRow1 51.4 / rRing 47.0 /
  // flap foot +3.0 / yRing -62.5), depth below the flap foot d = 103.0 mm:
  //   outward  DERIVED from MODEL(Magnum) M2 outward fit (rms 0.97):
  //            rOutM(103) = 51.85 - 0.512*28.5 + 0.065*(103 - 28.5) = 42.101
  //            rOut(-100) = 51.4 + (42.101 - 50.92)                 = 42.581 mm
  //   table    DERIVED from MODEL(Magnum) M2 table fit (rms 1.49):
  //            rTabM(103)  = 80.7 - 0.539*73.1 - 0.214*(103 - 73.1) = 34.901
  //            rTabM(65.5) = 80.7 - 0.539*65.5                      = 45.396
  //              (d_ring 65.5 < the fit knee 73.1, so the FIRST segment applies
  //               here; the second segment would give a wrong 42.93 / 38.98)
  //            rTab(-100) = 47.0 + (34.901 - 45.396)                = 36.505 mm
  //
  // THE BELLY. MODEL(Magnum), n8_sag.py over n = 273 cord cells: the radial
  // component of each cell's maximum sag (+ = outward) has median +0.598,
  // p10 -1.601, p90 +1.918 mm (/tmp/craftr3/net5/n8_sag.json).
  //
  // THE TWO BANDS - ONE convention (ABSOLUTE percentile) at BOTH ends of BOTH:
  //   outward  42.581 + [-1.601, +1.918] = [40.98, 44.50] mm
  //   table    36.505 + [-1.601, +1.918] = [34.90, 38.42] mm
  // The sealed upper used +2.5. There is no 2.5 in any source: it is
  // median(0.598) + p90(1.918) = 2.516, the belly median counted a SECOND time
  // at the top while the bottom counts it once. AUTHORED; withdrawn here.
  // CONSERVATISM, stated: these are SINGLE-CELL belly percentiles applied to a
  // MEDIAN over hundreds of vertices. A median's spread shrinks by roughly
  // sqrt(n), so each band is far wider than the statistic it gates. Widening
  // in the safe direction is disclosed, not exploited: what the row must
  // discriminate is checked below, and the family MINIMA and MAXIMA ride in
  // the report so a band that is too generous cannot hide a shape change.
  //
  // EXCLUSION. The retired R3-SNK-5 "slack cylinder" law (cord radius at -100
  // within 0.95-1.08 x the ring inner radius), on ring inner 47.0 mm (DERIVED
  // from MFR XW101 ring iron), spans 44.65 .. 50.76 mm. The outward band's
  // upper 44.50 excludes it by 0.15 mm - thin on a single sample, but this row
  // gates a MEDIAN over hundreds, and the TABLE band excludes the whole class
  // by 6.2 mm. The sealed upper 45.10 ADMITTED the class by 0.45 mm.
  //
  // RED ARM. The EXECUTED arm on ef3f1bd3 (R3-SNK-8) read 48.8 mm on the v1
  // statistic - /tmp/craftr3/red8/construction-red.log:28. The v2 arm is
  // re-executed on the same tree for this seal and its per-family medians are
  // pasted into the report. The sealed label "46.5" was the M2 table-family
  // radius at -57 mm copied out of a report into a read's place; withdrawn.
  const netRayLine = (c2) => (c2 && c2.n
    ? `n=${c2.n} med ${mm(c2.med)} p10 ${mm(c2.p10)} p90 ${mm(c2.p90)} [${(c2.min * 1000).toFixed(2)} .. ${(c2.max * 1000).toFixed(2)}]`
    : 'n=0');
  // R3-SNK-BODY-2 (ORDER-CRAFT-R3-BODY2 R5): BODY-1 had moved the OUTWARD floor to
  // 37.30 (PHOTO ring cord radius + belly p10) because the bag now ends on the
  // XW101 slide ring. The ruling: the net band stays a MAGNUM mesh read unless
  // the y = −100 datum itself moved — and it did not: the two family radii are
  // derived on rRow1 51.4 / rRing 47.0 (the MOUTH ring iron at −62.5) / flap
  // foot +3.0, none of which BODY-1 touched (d = 103.0 below the flap foot is
  // the same depth). The floor is therefore REVERTED to the SNK-12 read
  // [40.98, 44.50]. What had pulled our outward family to 40.3 on the ring bag
  // was a retired-tail literal that survived BODY-1: snkKnottedNet's gather
  // 22 mm above the bottom (the montage tail's gather, ledger item 6) drew the
  // cords to the ring radius already at −99.8; with o.ring the cords now run
  // from the hem row to the ring binding (gather = the binding height), and the
  // −100 read is a bag section again, judged on the Magnum's own fit.
  bar('N4 two-family bag: at -100 mm the OUTWARD family median within [40.98, 44.50] mm AND '
    + 'the TABLE family median within [34.90, 38.42] mm, read off the MESH - every net vertex '
    + 'within one MODEL cord radius 1.08 mm of the datum that belongs to THIS cup by the '
    + 'nearest-cup test (DERIVED: MODEL(Magnum) M2 outward fit rms 0.97 -> 42.581 and '
    + 'table fit rms 1.49 -> 36.505, both re-applied on our row-1 / ring datums; +- the '
    + 'MODEL(Magnum) n8_sag ABSOLUTE belly percentiles p10 -1.601 / p90 +1.918, n = 273, ONE '
    + 'convention at all four ends; the near-surface bias the ray read carried is gone - a '
    + 'cord crossing the band gives a full tube ring, so a family median is a CENTRELINE '
    + 'radius). Replaces the sealed single order statistic, which was rs[3] of 6 ray hits, '
    + 'straddled both families, and admitted a cross-pocket hit '
    + '[red: ef3f1bd3 - v1 read 48.8, /tmp/craftr3/red8/construction-red.log:28; v2 arm '
    + 're-executed this round]',
    m.netCls !== null && m.netCls !== undefined
      && m.netCls.outward.med !== null && m.netCls.table.med !== null
      && m.netCls.outward.med >= 0.04098 && m.netCls.outward.med <= 0.04450
      && m.netCls.table.med >= 0.03490 && m.netCls.table.med <= 0.03842,
    `outward ${netRayLine(m.netCls && m.netCls.outward)} | table ${netRayLine(m.netCls && m.netCls.table)}`);
  bar('N5 first visible knot row centres within [-1.4, +3.7] mm above the bed '
    + '(Magnum row 1 at +1.0, p10 -1.4 / p90 +3.7; n6_topcourse.py — the band '
    + 'admits the R3-SNK-3 +2.6 too, no red arm)',
    m.row1Y !== null && m.row1Y >= -0.0014 && m.row1Y <= 0.0037,
    `highest outward knot centroid y ${mm(m.row1Y)}`);
  // ---- R3-SNK-12 instrument upgrade, second half. N4 above judges the two
  // family MEDIANS; N6 judges that there IS a family to take a median of, and
  // reports what the nearest-cup test threw away. N7/N8 (the R3-SNK-12 draft's
  // per-ray extreme rows) are RETIRED into N4: extremes of a banded mesh
  // sample are the belly tails, and gating tails against percentile bands
  // built from those same tails is circular. The family minima and maxima are
  // reported in the N4 line instead.
  bar('N6 family sample: each judged family carries at least THREE cord rings of vertices '
    + `(3 x the build's own cord tube side count, here ${m.netCordSides || '?'} -> `
    + `${3 * (m.netCordSides || 0)} vertices), and every vertex belongs to THIS cup. The `
    + 'three-ring floor is INSTRUMENT, fixed before the read: a median over fewer than three '
    + 'cords is a median of one cord, which is how the sealed row became rs[3] of 6 ray hits. '
    + 'Vertices nearer another cup are rejected by the nearest-cup test and counted, because '
    + 'on the sealed tree one such hit entered the ray sample at 1797.3 mm. For the record the '
    + '72-ray fan that preceded this mesh read returned 29 accepted / 43 miss / 1 cross-cup, '
    + 'i.e. 6 outward and 8 table - below any honest floor, which is why the instrument moved '
    + 'to the mesh [red: NEW row - the arm is an emptied band, see the report]',
    m.netCls !== null && m.netCls !== undefined && m.netCordSides > 0
      && m.netCls.outward.n >= 3 * m.netCordSides && m.netCls.table.n >= 3 * m.netCordSides,
    `outward n ${m.netCls ? m.netCls.outward.n : '?'}, table n ${m.netCls ? m.netCls.table.n : '?'}, `
      + `blend n ${m.netCls ? m.netCls.blend.n : '?'}; ${m.netRsN} vertices in the +-1.08 mm band, `
      + `${m.netForeign} rejected as another cup's net`);
  info('N-legacy the RETIRED v1 statistic, reproduced verbatim for continuity with the seal '
    + 'record: 12 rays at 30 deg, mesh filter by NAME only, rs[Math.floor(rs.length / 2)]. Its '
    + 'text called this "the 7th smallest of 12"; rs.length is the HIT count, so with six '
    + 'misses it is rs[3] of 6 - a different order statistic, straddling both cord families, '
    + 'and with no cross-pocket rejection. This is the row that read 42.3 at e7ffa1c9 and 43.1 '
    + 'at 48fa8826 on a byte-identical radius law. INFO, never judged',
    (() => {
      const L = m.netLegacy;
      if (!L) return 'n/a';
      return `rs[${L.index}] of ${L.n} hits (${L.miss} miss) = ${mm(L.value)}; sorted [`
        + `${L.r.join(' / ')}]`;
    })());
  info('N-blend blend-class rays (45 < |alpha| < 135 deg) - MEASURED, NEVER JUDGED. '
    + 'Predicted 75 deg class 41.631 mm and 105 deg class 37.454 mm (DERIVED from the two '
    + 'family radii above through w = 1 - sstep((|alpha| - 60)/60), the rD blend in '
    + 'snkKnottedNet(), web/scene/table.js - cited by SYMBOL because this round moves table.js '
    + 'by hundreds of lines). NOT gated because that weight has a MODEL 60-120 deg window (M2 '
    + 'reads the outward panel to |phi| 87 deg and the table side from |phi| >= 90 deg) but an '
    + 'AUTHORED(render) smoothstep SHAPE - gating a number whose curve we invented would '
    + 'launder authorship into a law row',
    `blend ${netRayLine(m.netCls && m.netCls.blend)}`);
  // R3-SNK-12 P1 (R3c.22.12): the six snooker planks' top lids carry no inverted
  // triangle of a pixel's area. ExtrudeGeometry reuses the base contour's earcut
  // for the bevel-inset lid, and a sliver across three near-collinear contour
  // points (the two face inner corners and the KIN taper, 1724 mm apart) came
  // out inverted and 159.26 mm2 per long plank (48fa8826: 110.95), 70-72 mm2 per
  // end-plank corner (48fa8826: 46-47) — 100 % double-covered, culled in the
  // app, black in the clay rig. dropCoveredInvertedLids() (table.js) sheds the
  // covered ones and keeps any that is not. Judged at >= 1/64 mm2 (DERIVED: one
  // 8 px/mm sheet pixel). Fails CLOSED on 0 named planks (older trees).
  // [red: --arm plank-lids inverts the facing test; --web <8c4021a5> carries the un-shed slivers (159/70/72 mm2)]
  // CEREMONY MERGE (ORDER-CRAFT-R3-CEREMONY-MERGE §1.4) — S-SHIELD: the sink-shield-to-
  // chute-entry clearance per pocket, RECORDED as a cross-owner residual with its
  // owners named (no number authored here, no tolerance on the clearance). The
  // ballreturn lane's seal-10 verification (their §14.3 row 8) found that on this
  // table a ball game.js still owns — visible in the sink until its TOP passes
  // SINK_SHIELD_Y (game.js / sinkpivot.js, −0.055: the sink-rest lane's
  // Predator-derived cull line, GH-626 / #633) — and a module ball queued at a
  // chute entry (our export docs/geometry/tracks/wpbsa_snooker_12ft-xw101-
  // slides.json: the landing station 30 mm down the chute from the ring, PHOTO
  // ring 162 under the rail top, the ball's centre h = sqrt((r + r_w)² − (g/2)²)
  // above the lower wire pair, its TOP at exit_below_y −77.2) can stand 48–50 mm
  // apart for a few ms on p0 / p2 / p3 / p5 — inside one ball diameter (52.5).
  // Two bars. S-SHIELD-CLEAR reads the STATIC worst case of that pair on the
  // RENDERED table: the module ball at the entry station 30 mm down the chute
  // from the rendered slide ring's centre (obSnkSlideRing, one merged mesh,
  // bucketed per pocket; its centre height from the same mesh; the lower wire
  // pair found by a vertical ray onto obPocketTrack at ± g/2 across the chute
  // axis at that station), against a game.js ball dropping through that ring
  // with its top on the shield line — clearance = |centres| − 2r; the law is
  // ≥ 0 on every pocket, and a negative value is the residual (the time-resolved
  // minimum is the ballreturn solve's, 48–50 mm, which this bounds from below).
  // S-SHIELD-BIND binds the export to the mesh: the export's chute origin (30 mm
  // back along its runway from the first vertex) must be the rendered ring's
  // centre (≤ 2 mm), the ring 162 under the page's own rail top (≤ 1.5), the
  // rendered wire line at the station within 1.5 mm of the export's, and the
  // export's exit_below_y the derived top ± 0.3 — a failure here is a finding
  // against the export, and the clearance is still read from the mesh. Owner of
  // the shield line: game.js (the sink-rest lane); owner of the chute entry and
  // of the export: this lane. The shield constants are parsed from the served
  // app/game.js AND app/sinkpivot.js (both must exist and agree; else closed).
  {
    const fsS = await import('node:fs'); // this scope's own handle (the file-level `fs` below is declared later)
    const rx = /const SINK_SHIELD_Y = (-?[0-9.]+);/;
    const readShield = (f) => { try { const m = fsS.readFileSync(path.join(webDir, f), 'utf8').match(rx); return m ? parseFloat(m[1]) : NaN; } catch (e) { return NaN; } };
    const shieldGame = readShield('app/game.js'), shieldPivot = readShield('app/sinkpivot.js');
    let X = null;
    try { X = JSON.parse(fsS.readFileSync(path.join(webDir, '..', 'docs/geometry/tracks/wpbsa_snooker_12ft-xw101-slides.json'), 'utf8')); } catch (e) { X = null; }
    const shieldOk = Number.isFinite(shieldGame) && Number.isFinite(shieldPivot) && Math.abs(shieldGame - shieldPivot) < 1e-9;
    const shield = (shieldOk ? shieldGame : NaN) - (armShieldSlip ? 0.100 : 0);
    let rows = [], sc = null;
    if (X && shieldOk) {
      const r = X.ball.reference_diameter_mm / 2, rw = X.support.rail_diameter_mm / 2, g = X.support.gauge_mm;
      const h = Math.sqrt((r + rw) ** 2 - (g / 2) ** 2);
      const entries = X.pockets.map((pk) => { const rwy = X.runways.find((q) => q.id === pk.entry_runway); return { i: pk.index, e: rwy.points_mm[0], e2: rwy.points_mm[1], top: pk.exit_below_y_mm }; });
      sc = JSON.parse(await chrome.eval(`(async () => {
        const THREE = await import('three');
        const T = await import('./scene/table.js');
        const G = T.makeGeom('wpbsa_snooker_12ft');
        const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
        const P = G.pockets.map((p) => [p.x, p.z]);
        const E = ${JSON.stringify(entries.map((q) => [q.e[0] / 1000, q.e[1] / 1000, q.e[2] / 1000]))};
        const E2 = ${JSON.stringify(entries.map((q) => [q.e2[0] / 1000, q.e2[1] / 1000, q.e2[2] / 1000]))};
        const HALF_G = ${g / 2000}; // the lower wire pair sits ± g/2 across the chute axis (export support.gauge_mm)
        const STATION = 0.030;      // the export's landing station: 30 mm down the chute from the ring centre (DERIVED, schema 1.1 V5)
        const v = new THREE.Vector3();
        const near = (x, z, C, tol) => { let b = -1, bd = tol; C.forEach((c, k) => { const d = Math.hypot(x - c[0], z - c[1]); if (d < bd) { bd = d; b = k; } }); return b; };
        const ring = P.map(() => ({ n: 0, sx: 0, sy: 0, sz: 0 })), tracks = [];
        scene.traverse((o) => {
          if (!o.isMesh || !o.geometry?.attributes?.position) return;
          if (o.name === 'obPocketTrack') { tracks.push(o); return; }
          if (o.name !== 'obSnkSlideRing') return;
          const pa = o.geometry.attributes.position;
          for (let i = 0; i < pa.count; i++) {
            v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
            const k = near(v.x, v.z, P, 0.12); if (k < 0) continue; const a = ring[k]; a.n++; a.sx += v.x; a.sy += v.y; a.sz += v.z;
          }
        });
        const rc = new THREE.Raycaster();
        const out = E.map((e, k) => {
          const rg = ring[k].n ? [ring[k].sx / ring[k].n, ring[k].sy / ring[k].n, ring[k].sz / ring[k].n] : null;
          const dx = E2[k][0] - e[0], dz = E2[k][2] - e[2], L = Math.hypot(dx, dz) || 1; const ux = dx / L, uz = dz / L; // the export's chute axis
          const ax = -uz, az = ux; // across-axis unit vector in XZ
          const originExport = [e[0] - STATION * ux, e[2] - STATION * uz];
          const stationRender = rg ? [rg[0] + STATION * ux, rg[2] + STATION * uz] : null;
          const wireTops = [];
          if (stationRender) for (const sgn of [-1, 1]) {
            rc.set(new THREE.Vector3(stationRender[0] + sgn * HALF_G * ax, rg[1] + 0.06, stationRender[1] + sgn * HALF_G * az), new THREE.Vector3(0, -1, 0));
            const hits = rc.intersectObjects(tracks, false); if (hits.length) wireTops.push(hits[0].point.y);
          }
          return { ringN: ring[k].n, ring: rg, originExport, stationRender, wireHits: wireTops.length, wireTop: wireTops.length ? wireTops.reduce((a2, b2) => a2 + b2, 0) / wireTops.length : null };
        });
        return JSON.stringify({ P, out, tracks: tracks.length, railTop: G.render?.frameTop ?? null });
      })()`));
      const RING_UNDER_RAIL = 0.162; // PHOTO (E10): the slide ring centre 162 under the rail top; the rail top is the page's own frameTop
      rows = entries.map((q, k) => {
        const o = sc.out[k]; const ey = q.e[1] / 1000;
        // (a) the export's own pair: module ball at the export's station, game ball dropping through the export's ring origin
        const cmE = [q.e[0] / 1000, ey + h / 1000, q.e[2] / 1000];
        const cgE = [o.originExport[0], shield - r / 1000, o.originExport[1]];
        const dE = Math.hypot(cmE[0] - cgE[0], cmE[1] - cgE[1], cmE[2] - cgE[2]) * 1000;
        // (b) the RENDERED pair: module ball on the rendered wires at the rendered station, game ball dropping through the rendered ring
        const wireLine = o.wireHits ? o.wireTop - rw / 1000 : NaN;
        const cmR = o.stationRender && Number.isFinite(wireLine) ? [o.stationRender[0], wireLine + h / 1000, o.stationRender[1]] : null;
        const cgR = o.ring ? [o.ring[0], shield - r / 1000, o.ring[2]] : null;
        const dR = cmR && cgR ? Math.hypot(cmR[0] - cgR[0], cmR[1] - cgR[1], cmR[2] - cgR[2]) * 1000 : NaN;
        const gapR = cmR && cgR ? Math.abs(cmR[1] - cgR[1]) * 1000 : NaN;
        const originDxz = o.ring ? Math.hypot(o.ring[0] - o.originExport[0], o.ring[2] - o.originExport[1]) * 1000 : NaN;
        const ringDy = o.ring && Number.isFinite(sc.railTop) ? (o.ring[1] - (sc.railTop - RING_UNDER_RAIL)) * 1000 : NaN;
        const wireDy = Number.isFinite(wireLine) ? (wireLine - ey) * 1000 : NaN;
        const topR = cmR ? cmR[1] * 1000 + r : NaN;
        return { p: q.i, topExport: q.top, topRender: +topR.toFixed(1), gapR: +gapR.toFixed(1), dR: +dR.toFixed(1), clearR: +(dR - 2 * r).toFixed(1), clearE: +(dE - 2 * r).toFixed(1),
          ringN: o.ringN, originDxz: +originDxz.toFixed(1), ringDy: +ringDy.toFixed(1), wireHits: o.wireHits, wireDy: +wireDy.toFixed(1),
          ringXZ: o.ring ? [+(o.ring[0] * 1000).toFixed(1), +(o.ring[2] * 1000).toFixed(1)] : null, originExportXZ: [+(o.originExport[0] * 1000).toFixed(1), +(o.originExport[1] * 1000).toFixed(1)] };
      });
    }
    const readOk = shieldOk && !!X && rows.length === 6 && rows.every((w) => w.ringN > 0 && w.wireHits === 2 && Number.isFinite(w.clearR));
    const minClearR = readOk ? Math.min(...rows.map((w) => w.clearR)) : NaN;
    const bindOf = (w) => ({ origin: Math.abs(w.originDxz) <= 2.0, ringY: Math.abs(w.ringDy) <= 1.5, wire: w.wireHits === 2 && Math.abs(w.wireDy) <= 1.5, top: Math.abs(w.topRender - w.topExport) <= 0.3 });
    const bindOk = readOk && rows.every((w) => Object.values(bindOf(w)).every(Boolean));
    const owners = 'owners: the shield line is game.js / sinkpivot.js (the sink-rest lane, Predator-derived, GH-626 / #633); the chute entry and the export are this lane\'s (PHOTO ring 162 under the rail top, DERIVED station 30 mm down the chute); the ballreturn solve\'s time-resolved minimum reads 48–50 mm on p0 / p2 / p3 / p5 (their §14.3 row 8) and this static read bounds it from below; nothing authored, no tolerance on the clearance';
    bar(`S-SHIELD-CLEAR sink-shield-to-chute-entry clearance ≥ 0 on every pocket, read on the RENDERED ring + wires (game.js SINK_SHIELD_Y ${Number.isFinite(shieldGame) ? (shieldGame * 1000).toFixed(1) : 'UNREAD'} mm = sinkpivot.js ${Number.isFinite(shieldPivot) ? (shieldPivot * 1000).toFixed(1) : 'UNREAD'}${armShieldSlip ? ' [ARM shield-slip: the line lowered 100 mm for this row — it must FLIP to PASS]' : ''})`,
      readOk && minClearR >= 0,
      readOk ? `per pocket [p: module top (render) / vertical gap / centre distance / clearance]: ${rows.map((w) => `p${w.p}: ${w.topRender} / ${w.gapR} / ${w.dR} / ${w.clearR}`).join('; ')}; min clearance ${minClearR} mm — ${minClearR >= 0 ? 'no residual' : 'RESIDUAL (the two balls can overlap by ' + (-minClearR).toFixed(1) + ' mm at the static worst case)'}; ${owners}`
        : `READ FAILED: ${X ? 'export read' : 'EXPORT MISSING'}; ${shieldOk ? 'shield read' : 'SHIELD UNREAD or game.js ≠ sinkpivot.js'}; ${rows.length === 6 ? 'rendered ring / wire pair: ' + rows.map((w) => `p${w.p} ring ${w.ringN} v, wire hits ${w.wireHits}`).join(', ') : 'no scene read'}; ${owners}`);
    bar(`S-SHIELD-BIND the export's chute geometry bound to the rendered mesh per pocket (export chute origin = rendered ring centre ≤ 2.0 mm; ring 162 under the page's rail top ≤ 1.5; rendered wire line at the station = export ± 1.5; exit_below_y = derived top ± 0.3)`,
      bindOk,
      rows.length === 6 ? `per pocket [p: origin |dxz| (export origin → rendered ring), ring dy, wire hits / dy, top export / render]: ${rows.map((w) => { const b = bindOf(w); return `p${w.p}: ${w.originDxz}${b.origin ? '' : '✗'} (${w.originExportXZ.join(',')} → ${w.ringXZ ? w.ringXZ.join(',') : 'n/a'}), ${w.ringDy}${b.ringY ? '' : '✗'}, ${w.wireHits}/${w.wireDy}${b.wire ? '' : '✗'}, ${w.topExport}/${w.topRender}${b.top ? '' : '✗'}`; }).join('; ')}; rail top ${sc?.railTop}; track meshes ${sc?.tracks}${bindOk ? '' : ' — FINDING against the export where ✗: the export places the chute origin at the kernel capture point while the render hangs the ring under the leather-plate datum (fcx.cups), 27.9 mm inboard on the corner diagonal; the clearance bar above reads the mesh, not the export'}` : 'no rows');
    if (rows.length === 6) info('S-SHIELD-EXPORT', `the export's own static pair (module ball at the export station, game ball through the export origin) clearance per pocket: ${rows.map((w) => `p${w.p} ${w.clearE}`).join('; ')} mm — the numbers the ballreturn lane's inputs imply; superseded by the rendered read above where the binding fails`);
  }
  // SNK-R30 — S-BOARD (§R3c.32 / ruling §R3c.32.7): a ball on the CORNER chutes (p0/p2/p3/p5 of the committed
  // export) against every TABLE-BODY mesh, in V16's own convention (ball centre = support point + h along the
  // support's up-normal, stations every 5 mm from s = 0 to the stop face wall_s; true point-to-triangle distance
  // minus r). Table body = every visible mesh except the track's own hardware and the pocket assembly (the
  // §R3c.33 declaration lists), the balls and the debug / aim overlays. The corner jamb board (obPocketBoard,
  // untagged) was the one table-body member entered at the clamp end (this convention, §R3c.33.3: −16.2 mm at
  // s 263 on p0/p5, −26.1 mm at s 272 on p2/p3; the vertical-seat census of §R3c.32 read −11.7 / −21.8); the CORNER
  // board is retired this round (the middle boards stay: never entered, outside the ruling) — `--arm board-inject`
  // re-injects it and this bar must FAIL naming it. The MIDDLE chutes stay an INFO
  // row: their entry stands inside the rail soffit slab's end edge (obSnkSoffit, −14.6 mm) — a defect of the
  // export's entry height (the ballreturn lane's re-derivation, SNK-R25/R27), not of the table body.
  {
    const fsB = await import('node:fs');
    let XB = null;
    try { XB = JSON.parse(fsB.readFileSync(path.join(webDir, '..', 'docs/geometry/tracks/wpbsa_snooker_12ft-xw101-slides.json'), 'utf8')); } catch (e) { XB = null; }
    if (!XB) info('S-BOARD', 'no export at docs/geometry/tracks/wpbsa_snooker_12ft-xw101-slides.json — the row is not evaluated');
    else {
      const HW = ['obPocketTrack', 'obSnkSlideRing', 'obPocketStrap', 'obPocketStrapIron', 'obPocketStrapPlate'];
      const PA = ['obPocketNet', 'obPocketRing', 'obPocketRingGather', 'obPocketFallWall', 'obPocketFallRoll', 'obPocketCap', 'obPocketLining', 'obPocketPlate', 'obPocketStitch', 'obPocketEmboss', 'obPocketValance', 'obPocketShade', 'obPocketMouthShade'];
      const rB = XB.ball.reference_diameter_mm / 2000, rwB = XB.support.rail_diameter_mm / 2000, gB = XB.support.gauge_mm / 1000;
      const hB = Math.sqrt((rB + rwB) ** 2 - (gB / 2) ** 2);
      const cornerIdx = new Set([0, 2, 3, 5]);
      const runs = XB.runways.map((q) => { const pk = XB.pockets.find((p) => p.entry_runway === q.id); return { id: q.id, pts: q.points_mm.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000]), wallS: q.stop && Number.isFinite(q.stop.wall_s_mm) ? q.stop.wall_s_mm / 1000 : null, corner: !!(pk && cornerIdx.has(pk.index)) }; });
      const res = JSON.parse(await chrome.eval(`(async () => {
        const THREE = await import('three');
        const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
        const HW = new Set(${JSON.stringify(HW)}), PA = new Set(${JSON.stringify(PA)});
        const runs = ${JSON.stringify(runs)}; const r = ${rB}, h = ${hB}, STEP = 0.005;
        const stations = runs.map((R) => {
          const out = []; const P = R.pts; const segs = []; let acc = 0;
          for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); segs.push({ a, b, L, s0: acc }); acc += L; }
          const total = R.wallS !== null ? Math.min(R.wallS, acc) : acc;
          for (let s = 0; s <= total + 1e-9; s += STEP) {
            const sg = segs.find((q) => s <= q.s0 + q.L + 1e-9) || segs[segs.length - 1];
            const t = Math.min(1, Math.max(0, (s - sg.s0) / sg.L));
            const px = sg.a[0] + t * (sg.b[0] - sg.a[0]), py = sg.a[1] + t * (sg.b[1] - sg.a[1]), pz = sg.a[2] + t * (sg.b[2] - sg.a[2]);
            const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], dz = sg.b[2] - sg.a[2];
            const hl = Math.hypot(dx, dz) || 1e-12, Lt = Math.hypot(dx, dy, dz) || 1e-12;
            // the up-normal of the support in the run's vertical plane: ŷ minus its component along the tangent, normalised
            const nx = -(dy / Lt) * (dx / hl), ny = hl / Lt, nz = -(dy / Lt) * (dz / hl);
            out.push({ s, x: px + h * nx, y: py + h * ny, z: pz + h * nz });
          }
          return out;
        });
        const body = [];
        scene.traverse((o) => {
          if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
          for (let p = o; p; p = p.parent) { if (!p.visible) return; if (/^(obBallReturnDebug|obAim|obCueStick|obBall)/.test(p.name || '')) return; }
          const nm = o.name || '';
          if (HW.has(nm) || PA.has(nm)) return;
          if (o.geometry.type === 'SphereGeometry' && !nm.startsWith('obSnk') && !nm.startsWith('obPocket')) return; // balls
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          body.push(o);
        });
        const P = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Triangle(), box = new THREE.Box3(), v = new THREE.Vector3();
        const cache = new Map();
        const trisOf = (o) => { if (cache.has(o)) return cache.get(o); const pa = o.geometry.attributes.position, ia = o.geometry.index; const n = ia ? ia.count : pa.count; const arr = new Float64Array(n * 3); for (let i = 0; i < n; i++) { const k = ia ? ia.getX(i) : i; v.fromBufferAttribute(pa, k).applyMatrix4(o.matrixWorld); arr[3 * i] = v.x; arr[3 * i + 1] = v.y; arr[3 * i + 2] = v.z; } cache.set(o, arr); return arr; };
        const out = runs.map((R, ri) => {
          const per = {};
          for (const st of stations[ri]) {
            P.set(st.x, st.y, st.z);
            for (const o of body) {
              box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).expandByScalar(r + 0.002);
              if (!box.containsPoint(P)) continue;
              const arr = trisOf(o); let best = Infinity;
              for (let i = 0; i < arr.length; i += 9) { T.a.set(arr[i], arr[i + 1], arr[i + 2]); T.b.set(arr[i + 3], arr[i + 4], arr[i + 5]); T.c.set(arr[i + 6], arr[i + 7], arr[i + 8]); T.closestPointToPoint(P, Q); const d = Q.distanceTo(P); if (d < best) best = d; }
              const cl = best - r; const nm = o.name || ((o.parent && o.parent.name) || 'scene') + '/' + o.geometry.type;
              if (!(nm in per) || cl < per[nm].min) per[nm] = { min: cl, s: st.s };
            }
          }
          return { id: R.id, corner: R.corner, stations: stations[ri].length, per };
        });
        return JSON.stringify(out);
      })()`));
      const mmB = (x) => (x * 1000).toFixed(1);
      const worst = (row) => Object.entries(row.per).sort((a, b) => a[1].min - b[1].min)[0] || null;
      const cornersB = res.filter((q) => q.corner), midsB = res.filter((q) => !q.corner);
      const cornerBad = cornersB.map((q) => [q.id, worst(q)]).filter(([, w]) => w && w[1].min < 0);
      const fmtRow = (q) => { const w = worst(q); return `${q.id} (${q.stations} st) ${w ? `${w[0]} ${mmB(w[1].min)} mm @ s ${mmB(w[1].s)}` : 'no body mesh within reach'}`; };
      bar(`S-BOARD-CLEAR a ball on every CORNER chute of the export (p0/p2/p3/p5; V16 seat h ${mmB(hB)} mm along the support normal; 5 mm stations to the stop face) clears every table-body mesh (hardware + pocket assembly per §R3c.33 excluded) — worst per chute: ${cornersB.map(fmtRow).join(' · ')}`,
        cornersB.length === 4 && cornerBad.length === 0,
        cornersB.length !== 4 ? `expected 4 corner chutes, found ${cornersB.length}` : cornerBad.length ? `entered: ${cornerBad.map(([id, w]) => `${id} ${w[0]} ${mmB(w[1].min)} mm @ s ${mmB(w[1].s)}`).join(', ')}` : 'clear');
      info('S-SOFFIT-MID', `the MIDDLE chutes (p1/p4) in the same sweep — owner: the ballreturn lane's entry height (SNK-R25/R27; the soffit stays): ${midsB.map(fmtRow).join(' · ')}`);
    }
  }
  // SNK-R31 (review r5 P2 a) — WIND-NORMAL: every triangle of every generated snooker / pocket mesh winds TOWARD its
  // vertex normals ((b−a)×(c−a) · (n_a+n_b+n_c) > 0), judged on triangles with area ≥ 1/64 mm² (the finest battery
  // render's pixel — check-loft-bands' own floor) by the ALL-CORNERS sign rule: agree = winds with all three of its
  // corner normals, disagree = against all three (a real inversion), a fold STRADDLE (corners disagree among
  // themselves — the hem's turned edge, a crease) is reported apart. Plus, for the net tubes (obPocketNet cords / knots; ring
  // strides from userData), the normal attribute against each ring's OUTWARD radial — the read that exposed the
  // defect when the merge had recomputed the normals from an inside-out winding (0 of 65 568 cord rings outward on
  // 7517e839; a winding-vs-normal read alone is vacuous on such a mesh). PASS iff no judged triangle disagrees on any
  // mesh AND every cord / knot ring normal points outward. Arm `flip-net-winding` restores the cords' pre-fix order.
  // NET-BRIDGES (review r5 P2 b): the phase-slip bridges each bag EXPECTED == EMITTED (userData.obNetBridges on the
  // cords mesh; the old copy-lookup emitted 0). Arm `bridge-prefix` restores it.
  {
    const resW = JSON.parse(await chrome.eval(`(async () => {
      const THREE = await import('three');
      const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
      const FLOOR = (1 / 64) * 1e-6; // m²
      const out = []; let bridges = null;
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N0 = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), F = new THREE.Vector3(), T1 = new THREE.Vector3(), T2 = new THREE.Vector3();
      const cen = new THREE.Vector3(), V = new THREE.Vector3(), R = new THREE.Vector3();
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        const nm = o.name || '';
        if (!/^(obPocket|obSnk)/.test(nm)) return;
        const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, ia = g.index;
        if (o.userData && o.userData.obNetBridges) bridges = o.userData.obNetBridges;
        const n = ia ? ia.count : pa.count;
        if (!na) { out.push({ name: nm, noNormals: true, tris: n / 3 }); return; }
        const det = o.matrixWorld.determinant();
        let agree = 0, dis = 0, degen = 0, crease = 0, two = 0; // two = straddles against TWO of three corners (refuter 2: printed, so a partial inversion is never silent)
        for (let t = 0; t < n; t += 3) {
          const i0 = ia ? ia.getX(t) : t, i1 = ia ? ia.getX(t + 1) : t + 1, i2 = ia ? ia.getX(t + 2) : t + 2;
          A.fromBufferAttribute(pa, i0); B.fromBufferAttribute(pa, i1); C.fromBufferAttribute(pa, i2);
          T1.subVectors(B, A); T2.subVectors(C, A); F.crossVectors(T1, T2);
          if (F.length() / 2 < FLOOR) { degen++; continue; }
          N0.fromBufferAttribute(na, i0); N1.fromBufferAttribute(na, i1); N2.fromBufferAttribute(na, i2);
          const sg = det < 0 ? -1 : 1;
          const d0 = sg * F.dot(N0), d1 = sg * F.dot(N1), d2 = sg * F.dot(N2);
          // the ALL-CORNERS rule (a sign rule, no angle tolerance): a triangle AGREES when it winds with every one of
          // its own corner normals, DISAGREES when it winds against all three (a real inversion), and is a fold
          // STRADDLE when its corners disagree among themselves (a thin triangle across the hem's turned edge or a
          // crease has no single normal) — reported apart, never judged
          if (d0 > 0 && d1 > 0 && d2 > 0) agree++; else if (d0 < 0 && d1 < 0 && d2 < 0) dis++; else { crease++; if ((d0 < 0) + (d1 < 0) + (d2 < 0) === 2) two++; }
        }
        const row = { name: nm, tris: n / 3, agree, dis, degen, crease, two, det: Math.sign(det) };
        const stride = (o.userData && o.userData.obCordSides) ? o.userData.obCordSides : ((o.userData && o.userData.obKnotSides) ? o.userData.obKnotSides : 0);
        if (nm === 'obPocketNet' && stride && pa.count % stride === 0) {
          let outward = 0, inward = 0;
          for (let r0 = 0; r0 < pa.count; r0 += stride) {
            cen.set(0, 0, 0); for (let s = 0; s < stride; s++) { V.fromBufferAttribute(pa, r0 + s); cen.add(V); } cen.multiplyScalar(1 / stride);
            let acc = 0; for (let s = 0; s < stride; s++) { V.fromBufferAttribute(pa, r0 + s); R.subVectors(V, cen); N0.fromBufferAttribute(na, r0 + s); acc += R.dot(N0); }
            if (acc > 0) outward++; else inward++;
          }
          row.ringOutward = outward; row.ringInward = inward; row.ringStride = stride; row.ringKind = o.userData.obCordSides ? 'cords' : 'knots';
        }
        out.push(row);
      });
      return JSON.stringify({ meshes: out, bridges });
    })()`));
    const rowsW = resW.meshes.filter((m) => !m.noNormals);
    const offenders = rowsW.filter((m) => m.dis > 0).sort((a, b) => b.dis - a.dis);
    const netRings = rowsW.filter((m) => m.ringStride);
    const ringBad = netRings.filter((m) => m.ringInward > 0);
    const totW = rowsW.reduce((a, m) => ({ agree: a.agree + m.agree, dis: a.dis + m.dis, degen: a.degen + m.degen, crease: a.crease + m.crease, two: a.two + (m.two || 0) }), { agree: 0, dis: 0, degen: 0, crease: 0, two: 0 });
    bar(`WIND-NORMAL every generated snooker / pocket mesh winds toward its vertex normals — ${rowsW.length} meshes; judged triangles (area ≥ 1/64 mm², all-corners sign rule): agree ${totW.agree} / disagree ${totW.dis} (sub-floor ${totW.degen}, fold straddles ${totW.crease} reported apart, ${totW.two} of them against two of three corners); net tube rings normal·outward-radial: ${netRings.length ? netRings.map((m) => `${m.ringKind} ${m.ringOutward} outward / ${m.ringInward} inward`).join(', ') : 'not read'}`,
      totW.dis === 0 && netRings.length >= 2 && ringBad.length === 0,
      offenders.length ? `disagreeing: ${offenders.slice(0, 6).map((m) => `${m.name} ${m.dis} of ${m.agree + m.dis} (straddles ${m.crease}, sub-floor ${m.degen})`).join(' · ')}` : netRings.length < 2 ? 'the cord / knot ring strides were not found on obPocketNet' : ringBad.length ? `net rings inward: ${ringBad.map((m) => `${m.ringKind} ${m.ringInward}`).join(', ')}` : 'all agree, all rings outward');
    info('WIND-NORMAL-CENSUS', 'per mesh agree/disagree/sub-floor/straddle(two-against): ' + rowsW.map((m) => `${m.name}${m.ringKind ? `(${m.ringKind})` : ''} ${m.agree}/${m.dis}/${m.degen}/${m.crease}(${m.two || 0})`).join(' · ') + (resW.meshes.some((m) => m.noNormals) ? ` | no normal attribute: ${resW.meshes.filter((m) => m.noNormals).map((m) => m.name).join(', ')}` : ''));
    const brW = Array.isArray(resW.bridges) ? resW.bridges : null;
    const badB = brW ? brW.filter((b) => !(b.expected > 0 && b.emitted === b.expected)) : [];
    const perKind = (k) => brW ? brW.filter((b) => b.kind === k).map((b) => `${b.emitted}/${b.expected}`).join(' ') : '—';
    bar(`NET-BRIDGES phase-slip bridges emitted == expected in every bag (expected > 0), read from the cords mesh — corner bags (emitted/expected) ${perKind('corner')}; middle bags ${perKind('middle')}`,
      !!brW && brW.length === 6 && brW.filter((b) => b.kind === 'corner').length === 4 && brW.filter((b) => b.kind === 'middle').length === 2 && badB.length === 0,
      !brW ? 'no obNetBridges on the cords mesh' : brW.length !== 6 ? `expected 6 bags, found ${brW.length}` : (brW.filter((b) => b.kind === 'corner').length !== 4 || brW.filter((b) => b.kind === 'middle').length !== 2) ? `bag kinds: ${brW.map((b) => b.kind).join(' ')} (expected 4 corner + 2 middle)` : badB.length ? `short: ${badB.map((b) => `${b.kind} ${b.emitted}/${b.expected}`).join(', ')}` : 'all six bags complete');
  }
  // OCCL-COVER (SNK-R32, review r6 P2 b — every lit vertex has a baked occlusion): every merged leather geometry
  // (obPocketCap, obPocketValance) bookkeeps its bake coverage (userData.obOcclCoverage: total / strips / flats /
  // uncovered). The planar end caps (800 vertices on this table, 812 on 9558b2e6) rode the strip-interpolation branch because `off`
  // counted them and stayed at aOccl (0, 0). PASS iff both meshes carry the record and uncovered === 0; the exact-
  // (0, 0) aOccl count per mesh is printed after the drain is flushed through the window.__snkOccl seam (a baked
  // fully-lit vertex may legitimately read (0, 0), so the bookkeeping is the judged instrument, the count the
  // witness). Arm `occl-flats-off` restores the pre-fix merge.
  {
    const resO = JSON.parse(await chrome.eval(`(async () => {
      if (window.__snkOccl && window.__snkOccl.flush) { try { window.__snkOccl.flush(); } catch (e) {} }
      const scene = window.__dbg.scene; const rows = [];
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (o.name !== 'obPocketCap' && o.name !== 'obPocketValance') return;
        const cov = o.userData && o.userData.obOcclCoverage ? o.userData.obOcclCoverage : null;
        const a = o.geometry.getAttribute('aOccl'); let zero = 0, n = 0;
        if (a) { n = a.count; for (let i = 0; i < a.count; i++) if (a.getX(i) === 0 && a.getY(i) === 0) zero++; }
        rows.push({ name: o.name, verts: o.geometry.getAttribute('position').count, cov, aOccl: !!a, zero, n });
      });
      return JSON.stringify(rows);
    })()`));
    // OCCL-DETERMINISM (SNK-R32, the ballreturn lane's finding): after flush + settle, two reads of every aOccl
    // attribute in this load are byte-identical (digests printed; the battery reads them against two clay dumps
    // = three loads); under `occl-early-read` the earliest read must have been refused (pending > 0) or differ.
    // a sampler exception mid-drain would leave settled() pending forever (refuter 1): the wait is raced against a named 60 s timeout
    let settleErr = null;
    try {
      await chrome.eval(`(async () => { const s = window.__snkOccl; if (s) { try { s.flush(); } catch (e) {} if (s.settled) await Promise.race([s.settled(), new Promise((_, rej) => setTimeout(() => rej(new Error('occlusion settle timeout (60 s): jobs pending ' + (s.pending ? s.pending() : '?'))), 60000))]); } return 'settled'; })()`);
    } catch (e) { settleErr = String(e && e.message || e); }
    if (settleErr) bar(`OCCL-SETTLE the occlusion bake settles before any census read — ${settleErr.slice(0, 200)}`, false, 'the settle seam did not resolve (refuter 2: a named row, not an abort)');
    // after a settle failure the digests are not read (refuter 3): DETERMINISM fails by name below
    const empty = { pending: -1, meshes: 0, digest: 'unread', rows: [] };
    const d1 = settleErr ? empty : JSON.parse(await chrome.eval(OCCL_DIGEST_JS));
    const d2 = settleErr ? empty : JSON.parse(await chrome.eval(OCCL_DIGEST_JS));
    const same = d1.digest === d2.digest && d1.meshes === d2.meshes;
    const earlyOk = !armOcclEarlyRead || (occlEarly && occlEarly.meshes > 0 && ((occlEarly.pending ?? 0) > 0 || occlEarly.digest !== d1.digest));
    occlReport = { settled: { pending: d1.pending, meshes: d1.meshes, digest: d1.digest, rows: d1.rows }, second: { digest: d2.digest }, early: occlEarly };
    bar(`OCCL-DETERMINISM after the settle seam two reads of every aOccl attribute agree — ${d1.meshes} meshes carry aOccl; read 1 ${d1.digest.slice(0, 16)} / read 2 ${d2.digest.slice(0, 16)}, pending after settle ${d1.pending}${
      armOcclEarlyRead ? `; early read (${occlEarly ? occlEarly.meshes : '?'} meshes): pending ${occlEarly ? occlEarly.pending : '?'} digest ${occlEarly ? occlEarly.digest.slice(0, 16) : '?'} → ${earlyOk ? 'refused or different (ARMED)' : (occlEarly && occlEarly.meshes === 0 ? 'read before any aOccl existed (NOT ARMED)' : 'SAME as settled (NOT ARMED)')}` : ''}`,
      same && d1.pending === 0 && d1.meshes > 0 && earlyOk,
      settleErr ? 'not read: the settle seam failed (OCCL-SETTLE)' : !same ? 'the two settled reads DIFFER — the bake is not deterministic or not settled' : d1.pending !== 0 ? `jobs still pending after settle: ${d1.pending}` : !earlyOk ? 'early read equals the settled read (arm not demonstrated)' : 'settled reads agree');
    const bad = resO.filter((r) => !r.cov || r.cov.uncovered !== 0 || !r.aOccl);
    const txt = resO.map((r) => `${r.name}: ${r.cov ? `total ${r.cov.total} = strips ${r.cov.strips} + flats ${r.cov.flats} (${r.cov.members} members), uncovered ${r.cov.uncovered}` : 'NO coverage record'}; aOccl ${r.aOccl ? `present, exact (0,0) ${r.zero} of ${r.n}` : 'MISSING'}`).join(' · ');
    bar(`OCCL-COVER every merged leather geometry has a baked or interpolated aOccl on every vertex (strips interpolated, planar end caps baked) — ${txt}`,
      resO.length >= 2 && bad.length === 0,
      resO.length < 2 ? `expected obPocketCap + obPocketValance, found ${resO.map((r) => r.name).join(', ') || 'none'}` : bad.length ? `uncovered: ${bad.map((r) => `${r.name} ${r.cov ? r.cov.uncovered : 'no record'}`).join(', ')}` : 'all covered');
  }
  // S-WIRE-CLEAR (SNK-R33, review r7 P2 A — the upper wires intersected a supported ball): the ball-clearance census
  // over every chute's REACHABLE domain, rebuilt here from the chute record the builder publishes on obPocketTrack
  // (userData.obChutes: per pocket each wire's BREAKPOINTS P0/P1/P2/P3/pIn/pOut and z, the ball and wire radii, and the
  // builder's own census for comparison). The ball rides the LOWER pair — seated hSeat = √((R + r_w)² − (g/2)²) off a
  // straight leg along its upward normal, g the built gauge (the lower wires' z apart) — so its centre's domain is,
  // in the chute's plane: the ENTRY pivot over the wire ends P0 (from the vertical to the lead's normal — the ball
  // arrives from the ring above), the lead's offset segment, the arc about the convex P1 corner, the slope's offset
  // segment down to the REST, and the rest itself — the two-leg tangent circle if its ramp contact lies within the
  // up-turned stop's length, else (every chute today: the stop is 19.2 long, the tangent point 20–27 from P2) the
  // point of the slope's offset line hSeat from the wire TIPS P3. A 26 mm ball cannot follow the 3 r_w bend, so the
  // bend's own offset curve is an unreachable pose and is not judged. Clearance of a pose to an upper wire =
  // √(dxy² + (that wire's z off the pair's mid-z)²) − (R + r_w), dxy the in-plane distance to the upper pair's path
  // (straight legs exact, the bend sampled at 2001 points). PASS iff over all six chutes and both upper wires the
  // least clearance of every piece is ≥ 0 (raw metres, floor 1 nm — the derived placement touches exactly at the
  // limiting piece; a non-finite read fails), the rest clears the bend (its slope contact beyond the bend, its
  // centre ≥ hSeat from the bend curve), P1 is convex, the two wires of a pair share one in-plane path, and the
  // gate's dxyMin, rest kind and rest point agree with the builder's published census (1 µm). The pre-fix tree carries no record (FAIL
  // by name); `--arm wires-prefix` restores the pre-fix offset with the record → the number, chute and piece
  // (entry −8.62 mm, lead −8.55).
  {
    const resC = JSON.parse(await chrome.eval(`(() => {
      const scene = window.__dbg.scene; let rec = null;
      scene.traverse((o) => { if (o.isMesh && o.name === 'obPocketTrack' && o.userData && o.userData.obChutes) rec = o.userData.obChutes; });
      if (!rec) return JSON.stringify({ record: false });
      const K = ['P0', 'P1', 'P2', 'P3', 'pIn', 'pOut'];
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
      const unit = (v) => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
      const upN = (a, b) => { const d = unit(sub(b, a)); const n = [-d[1], d[0]]; return n[1] >= 0 ? n : [-n[0], -n[1]]; };
      const segD = (C, p, q) => { const ex = q[0] - p[0], ey = q[1] - p[1]; const el2 = ex * ex + ey * ey || 1e-30; let s = ((C[0] - p[0]) * ex + (C[1] - p[1]) * ey) / el2; s = Math.max(0, Math.min(1, s)); return Math.hypot(C[0] - p[0] - s * ex, C[1] - p[1] - s * ey); };
      const polyD = (A, B) => { let best = Infinity; for (let i = 0; i < A.length; i++) for (let j = 0; j + 1 < B.length; j++) { const d = segD(A[i], B[j], B[j + 1]); if (d < best) best = d; } return best; };
      const bez = (A, B, C) => { const o = [A]; for (let k = 1; k < 2000; k++) { const t = k / 2000, s = 1 - t; o.push([s * s * A[0] + 2 * s * t * B[0] + t * t * C[0], s * s * A[1] + 2 * s * t * B[1] + t * t * C[1]]); } o.push(C); return o; };
      const out = [];
      for (const ch of rec) {
        const R = ch.ballR + ch.wireR;
        const lo = ch.wires.filter((w) => w.lvl === 0), up = ch.wires.filter((w) => w.lvl === 1);
        if (lo.length !== 2 || up.length !== 2 || !lo[0].breakpoints || !up[0].breakpoints) { out.push({ index: ch.index, error: 'wire count ' + ch.wires.length + (lo[0] && lo[0].breakpoints ? '' : ' / no breakpoints') }); continue; }
        const xy = (v) => [v[0], v[1]];
        const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
        let onePath = true; for (const k of K) if (!same(lo[0].breakpoints[k], lo[1].breakpoints[k]) || !same(up[0].breakpoints[k], up[1].breakpoints[k])) onePath = false;
        const M = Object.fromEntries(K.map((k) => [k, xy(lo[0].breakpoints[k])])), U = Object.fromEntries(K.map((k) => [k, xy(up[0].breakpoints[k])]));
        const midZ = (lo[0].z + lo[1].z) / 2, g = Math.abs(lo[0].z - lo[1].z), hSeat = Math.sqrt(Math.max(0, R * R - (g / 2) * (g / 2)));
        const bendD = Math.hypot(M.P2[0] - M.pIn[0], M.P2[1] - M.pIn[1]);
        const dirx = Math.sign(M.P1[0] - M.P0[0]);
        const P = [M.P0, M.P1, M.P2, M.P3];
        const off = (Q, n) => [Q[0] + hSeat * n[0], Q[1] + hSeat * n[1]];
        const nLead = upN(P[0], P[1]), nSlope = upN(P[1], P[2]), dS = unit(sub(P[2], P[1]));
        const u1 = unit(sub(P[1], P[2])), u2 = unit(sub(P[3], P[2])); const bis = unit([u1[0] + u2[0], u1[1] + u2[1]]);
        const cosHalf = dot(u1, bis), sinHalf = Math.sqrt(Math.max(1e-12, 1 - cosHalf * cosHalf));
        const restTangent = hSeat * cosHalf / sinHalf, rampLen = Math.hypot(P[3][0] - P[2][0], P[3][1] - P[2][1]);
        let rest = [P[2][0] + bis[0] * hSeat / sinHalf, P[2][1] + bis[1] * hSeat / sinHalf], stop = 'legs';
        if (restTangent > rampLen) { const base = off(P[1], nSlope), v = sub(P[3], base); const along = dot(v, dS), perp = dot(v, nSlope); const sT = along - Math.sqrt(Math.max(0, hSeat * hSeat - perp * perp)); rest = [base[0] + sT * dS[0], base[1] + sT * dS[1]]; stop = 'tip'; }
        const slopeTangent = Math.abs(dot(sub(rest, P[2]), u1));
        const arcAbout = (Q, a0, a1) => { const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 1800))); const pts = []; for (let k = 0; k <= steps; k++) { const a = a0 + (a1 - a0) * k / steps; pts.push([Q[0] + hSeat * Math.cos(a), Q[1] + hSeat * Math.sin(a)]); } return pts; };
        const aV = Math.PI / 2, aL = Math.atan2(nLead[1], nLead[0]), aS = Math.atan2(nSlope[1], nSlope[0]);
        const pieces = { entry: arcAbout(P[0], aV, aL), lead: [off(P[0], nLead), off(P[1], nLead)], arc: arcAbout(P[1], aL, aS), slope: [off(P[1], nSlope), rest], rest: [rest] };
        const upper = [U.P0, U.P1, ...bez(U.pIn, U.P2, U.pOut), U.P3];
        const pieceDxy = {}; for (const k of Object.keys(pieces)) { const A = pieces[k]; pieceDxy[k] = Math.min(polyD(A, upper), A.length > 1 ? polyD(upper, A) : Infinity); }
        let limit = 'entry'; for (const k of Object.keys(pieceDxy)) if (pieceDxy[k] < pieceDxy[limit]) limit = k;
        const restToBend = polyD([rest], bez(M.pIn, M.P2, M.pOut));
        // clearance per piece and per upper wire at the BUILT lateral offsets
        const clear = {}; let worst = Infinity, worstAt = null;
        for (const w of up) { const zOff = Math.abs(w.z - midZ); for (const k of Object.keys(pieceDxy)) { const cl = Math.hypot(pieceDxy[k], zOff) - R; const key = k + (w.side > 0 ? '+z' : '-z'); clear[key] = cl; if (Number.isNaN(cl) || cl < worst) { worst = cl; worstAt = key; } } }
        const pub = ch.census || null; const dxyAgree = pub && Number.isFinite(pub.dxyMin) ? Math.abs(pub.dxyMin - pieceDxy[limit]) : null;
        const restAgree = pub && Array.isArray(pub.rest) ? Math.hypot(pub.rest[0] - rest[0], pub.rest[1] - rest[1]) : null;
        out.push({ index: ch.index, corner: ch.corner, minMm: +(worst * 1000).toFixed(3), minRaw: worst, at: worstAt, limit, stop, onePath, convexP1: (nSlope[0] - nLead[0]) * dirx > 0,
          restClearsBend: slopeTangent >= bendD && restToBend >= hSeat - 1e-9, restTangentMm: +(restTangent * 1000).toFixed(2), rampLenMm: +(rampLen * 1000).toFixed(2), slopeTangentMm: +(slopeTangent * 1000).toFixed(2), restToBendMm: +(restToBend * 1000).toFixed(2), bendDmm: +(bendD * 1000).toFixed(2),
          dxyAgreeUm: dxyAgree === null ? null : +(dxyAgree * 1e6).toFixed(3), restAgreeUm: restAgree === null ? null : +(restAgree * 1e6).toFixed(3), pubLimit: pub ? pub.limit : null, pubStop: pub ? pub.stop : null,
          pieceDxyMm: Object.fromEntries(Object.keys(pieceDxy).map((k) => [k, +(pieceDxy[k] * 1000).toFixed(3)])), clearMm: Object.fromEntries(Object.keys(clear).map((k) => [k, +(clear[k] * 1000).toFixed(3)])),
          upperHalfMm: +(((Math.abs(up[0].z - midZ) + Math.abs(up[1].z - midZ)) / 2) * 1000).toFixed(3), hSeatMm: +(hSeat * 1000).toFixed(3), gaugeMm: +(g * 1000).toFixed(3) });
      }
      return JSON.stringify({ record: true, chutes: out });
    })()`));
    const bad = resC.record ? resC.chutes.filter((c) => c.error || !Number.isFinite(c.minRaw) || !(c.minRaw >= -1e-9) || !c.onePath || !c.convexP1 || !c.restClearsBend || !(c.dxyAgreeUm !== null && c.dxyAgreeUm <= 1) || c.pubStop !== c.stop || !(c.restAgreeUm !== null && c.restAgreeUm <= 1)) : [];
    bar(`S-WIRE-CLEAR a ball riding the lower pair clears both upper wires over its whole reachable domain (entry pivot · lead · P1 arc · slope · rest) in every chute (R + r_w from the record; min clearance ≥ 0) — ${resC.record ? resC.chutes.map((c) => c.error ? `p${c.index} ERROR ${c.error}` : `p${c.index}${c.corner ? 'c' : 'm'} min ${c.minMm} mm (${c.at}) [dxy entry ${c.pieceDxyMm.entry} lead ${c.pieceDxyMm.lead} arc ${c.pieceDxyMm.arc} slope ${c.pieceDxyMm.slope} rest ${c.pieceDxyMm.rest}; limit ${c.limit}${c.pubLimit === c.limit ? '' : ' ≠ published ' + c.pubLimit}; dxyMin agrees ${c.dxyAgreeUm} µm; rest = ${c.stop} stop${c.pubStop === c.stop ? '' : ' ≠ PUBLISHED ' + c.pubStop}, agrees ${c.restAgreeUm} µm (two-leg tangent ${c.restTangentMm} vs ramp ${c.rampLenMm}; slope contact ${c.slopeTangentMm} ≥ bend ${c.bendDmm}, centre ${c.restToBendMm} ≥ seat ${c.hSeatMm} from the bend curve: ${c.restClearsBend ? 'clears the bend' : 'ON THE BEND'}); P1 ${c.convexP1 ? 'convex' : 'NOT convex'}; ${c.onePath ? 'one path per pair' : 'PAIR PATHS DIFFER'}]`).join(' · ') + `; upper half-spacing ${resC.chutes[0]?.upperHalfMm} mm, seat ${resC.chutes[0]?.hSeatMm} mm over gauge ${resC.chutes[0]?.gaugeMm}` : 'obPocketTrack carries NO chute record (userData.obChutes): the built wires cannot be censused'}`,
      resC.record && resC.chutes.length === 6 && bad.length === 0,
      !resC.record ? 'no record — a pre-SNK-R33 tree' : resC.chutes.length !== 6 ? `expected 6 chutes, found ${resC.chutes.length}` : bad.length ? `${bad.map((c) => `p${c.index} ${c.error ? c.error : `${c.minMm} mm (${c.at})${Number.isFinite(c.minRaw) ? '' : ' NON-FINITE'}${c.onePath ? '' : ' pair paths differ'}${c.convexP1 ? '' : ' P1 not convex'}${c.restClearsBend ? '' : ' rest on the bend'}${c.dxyAgreeUm !== null && c.dxyAgreeUm <= 1 ? '' : ` census disagrees ${c.dxyAgreeUm} µm`}${c.pubStop === c.stop ? '' : ` rest kind ${c.stop} ≠ published ${c.pubStop}`}${c.restAgreeUm !== null && c.restAgreeUm <= 1 ? '' : ` rest point disagrees ${c.restAgreeUm} µm`}`}`).join(' · ')}` : '');
  }
  // S-RINGWIRE-CLEAR (SNK-R34, open row 5 of §R3c.39 — the upper wires passed 1.63 mm through the slide ring's tube):
  // every wire's axis stays ≥ ringTube + r_w from the slide ring's torus centre circle. The record carries the ring
  // (`ring`: cup axis x/z, plane y, centre-circle radius R, tube) and each wire's breakpoints + z; the gate rebuilds every
  // wire's path (straight legs at 0.1 mm, the quadratic bend at 2001 samples) and takes the least axis-to-circle distance
  // minus the need, per wire; PASS iff ≥ 0 (raw metres, floor 1 nm — the derived upper start touches exactly) on all four
  // wires of all six chutes, the upper start lies on the lead (`ringClear.onLead`), the fixed point converged (residual
  // ≤ 1 nm), AND the ring record is BOUND to the rendered obSnkSlideRing: every vertex of the merged mesh within 1.5 R of the
  // cup axis lies on the record's tube surface (| hypot(radial − R, y − plane) − tube | ≤ 1 µm — a torus's vertices
  // are exactly on it, whatever the tessellation) and their bbox centre is the cup axis / the plane (≤ 1 µm). The pre-fix tree carries no
  // ring record (FAIL by name); `--arm wires-ringstart` keeps the pre-fix start → FAIL with the number.
  {
    const resR = JSON.parse(await chrome.eval(`(async () => {
      const THREE = await import('./vendor/three.module.min.js');
      const scene = window.__dbg.scene; let rec = null, ringMesh = null;
      scene.traverse((o) => { if (o.isMesh && o.name === 'obPocketTrack' && o.userData && o.userData.obChutes) rec = o.userData.obChutes; if (o.isMesh && o.name === 'obSnkSlideRing') ringMesh = o; });
      if (!rec) return JSON.stringify({ record: false, why: 'no chute record' });
      if (!rec[0] || !rec[0].ring) return JSON.stringify({ record: false, why: 'chute record carries no ring (pre-SNK-R34)' });
      const bez = (A, B, C) => { const o = [A]; for (let k = 1; k < 2000; k++) { const t = k / 2000, s = 1 - t; o.push([s * s * A[0] + 2 * s * t * B[0] + t * t * C[0], s * s * A[1] + 2 * s * t * B[1] + t * t * C[1]]); } o.push(C); return o; };
      const dense = (P, Q) => { const o = []; const n = Math.max(2, Math.ceil(Math.hypot(Q[0] - P[0], Q[1] - P[1]) / 0.0001)); for (let k = 0; k <= n; k++) { const t = k / n; o.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } return o; };
      let pos = null, vcount = 0; if (ringMesh) { ringMesh.updateMatrixWorld(true); pos = ringMesh.geometry.getAttribute('position'); vcount = pos ? pos.count : 0; }
      const out = [];
      for (const ch of rec) {
        const rg = ch.ring, need = rg.need != null ? rg.need : rg.tube + ch.wireR; const wires = [];
        for (const w of ch.wires) {
          const B = w.breakpoints; const xy = (v) => [v[0], v[1]];
          const path = [...dense(xy(B.P0), xy(B.P1)), ...dense(xy(B.P1), xy(B.pIn)), ...bez(xy(B.pIn), xy(B.P2), xy(B.pOut)), ...dense(xy(B.pOut), xy(B.P3))];
          let worst = Infinity, at = null;
          for (const [x, y] of path) { const d = Math.hypot(Math.hypot(x - rg.x, w.z - rg.z) - rg.R, y - rg.y) - need; if (!(d >= worst)) { worst = d; at = [x, y]; } }
          wires.push({ lvl: w.lvl, side: w.side, clearMm: +(worst * 1000).toFixed(3), clearRaw: worst, atXmm: at ? +(at[0] * 1000).toFixed(1) : null, alongFromP0mm: at ? +(Math.hypot(at[0] - B.P0[0], at[1] - B.P0[1]) * 1000).toFixed(1) : null });
        }
        // the ring record bound to the rendered slide ring: the merged mesh's vertices near this cup axis
        let bind = null;
        if (pos) { let n = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, miny = Infinity, maxy = -Infinity; const v = new THREE.Vector3();
          // tessellation-free bind (refuter 1 of §R3c.40): every vertex of a torus lies ON its tube surface, so the
          // record's (axis, plane, R, tube) is bound iff | hypot(radial − R, y − yRing) − tube | ≤ 1 µm for every
          // vertex near this cup (float32 positions at ~2 m carry ≈ 0.2 µm); the bbox centre reads the axis
          let tubeDev = 0;
          for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(ringMesh.matrixWorld); if (Math.hypot(v.x - rg.x, v.z - rg.z) > 1.5 * rg.R) continue; n++; minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); minz = Math.min(minz, v.z); maxz = Math.max(maxz, v.z); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y); tubeDev = Math.max(tubeDev, Math.abs(Math.hypot(Math.hypot(v.x - rg.x, v.z - rg.z) - rg.R, v.y - rg.y) - rg.tube)); }
          bind = n ? { verts: n, cxErr: +(((minx + maxx) / 2 - rg.x) * 1000).toFixed(3), czErr: +(((minz + maxz) / 2 - rg.z) * 1000).toFixed(3), yErr: +(((miny + maxy) / 2 - rg.y) * 1000).toFixed(3), tubeDevUm: +(tubeDev * 1e6).toFixed(3), odSpanMm: +(Math.max(maxx - minx, maxz - minz) * 1000).toFixed(2) } : { verts: 0 }; }
        const bound = !!bind && bind.verts > 0 && Math.abs(bind.cxErr) <= 0.001 && Math.abs(bind.czErr) <= 0.001 && Math.abs(bind.yErr) <= 0.001 && bind.tubeDevUm <= 1;
        const rc = ch.ringClear || {};
        out.push({ index: ch.index, corner: ch.corner, wires, minMm: Math.min(...wires.map((w) => w.clearMm)), ok: wires.every((w) => Number.isFinite(w.clearRaw) && w.clearRaw >= -1e-9), onLead: rc.onLead === true, converged: Number.isFinite(rc.residual) && rc.residual <= 1e-9, iterations: rc.iterations, upperStartAlongMm: rc.upperStartAlong != null ? +(rc.upperStartAlong * 1000).toFixed(2) : null, pubUpperMm: rc.upper != null ? +(rc.upper * 1000).toFixed(3) : null, pubLowerMm: rc.lower != null ? +(rc.lower * 1000).toFixed(3) : null, bind, bound, ringMesh: !!ringMesh, ringVerts: vcount });
      }
      return JSON.stringify({ record: true, chutes: out });
    })()`, true));
    const badR = resR.record ? resR.chutes.filter((c) => !c.ok || !c.onLead || !c.converged || !c.bound) : [];
    bar(`S-RINGWIRE-CLEAR every wire's axis clears the slide ring's tube (≥ ringTube + r_w from the torus centre circle, all four wires × six chutes; the upper pair starts where it first clears, on the lead; the ring record bound to obSnkSlideRing) — ${resR.record ? resR.chutes.map((c) => `p${c.index}${c.corner ? 'c' : 'm'} min ${c.minMm} mm [${c.wires.map((w) => `${w.lvl ? 'up' : 'lo'}${w.side > 0 ? '+' : '-'} ${w.clearMm}${w.lvl ? ` @ ${w.alongFromP0mm} mm from its start` : ''}`).join(', ')}; upper start ${c.upperStartAlongMm} mm along the lead${c.onLead ? '' : ' (NOT on the lead)'}, ${c.iterations} rounds${c.converged ? '' : ' NOT converged'}; published upper/lower ${c.pubUpperMm} / ${c.pubLowerMm}; ring ${c.bound ? 'bound' : 'NOT BOUND'}${c.bind ? ` (verts ${c.bind.verts}, axis err ${c.bind.cxErr} / ${c.bind.czErr} mm, plane err ${c.bind.yErr} mm, every vertex on the tube surface within ${c.bind.tubeDevUm} µm, OD span ${c.bind.odSpanMm})` : ' (no obSnkSlideRing mesh)'}]`).join(' · ') : `NO ring record — ${resR.why}`}`,
      resR.record && resR.chutes.length === 6 && badR.length === 0,
      !resR.record ? resR.why : resR.chutes.length !== 6 ? `expected 6 chutes, found ${resR.chutes.length}` : badR.length ? badR.map((c) => `p${c.index} min ${c.minMm} mm${c.onLead ? '' : ' start off the lead'}${c.converged ? '' : ' not converged'}${c.bound ? '' : ' ring not bound'}`).join(' · ') : '');
  }
  bar(`P1 plank lids: the six anonymous rail-wood ExtrudeGeometry planks' top lids carry 0 inverted triangles >= 1/64 mm2 `
    + `(R3-SNK-12 dropCoveredInvertedLids; ExtrudeGeometry earcut/bevel sliver class; `
    + `fails closed on 0 planks)${armPlankLids ? ' [ARM plank-lids: facing test INVERTED]' : ''}${armPlankDense ? ' [ARM plank-dense: bevel-safe contour pass skipped]' : ''}${armLidInject ? ' [ARM lid-inject: one covered inverted duplicate injected per lid; the law must shed it — P1 must read 0]' : ''}${armLidCover ? ' [ARM lid-cover: every cover triangle of the largest inverted sliver withheld, per lid]' : ''}`,
    !!m.plankLids && m.plankLids.planks === 6 && m.plankLids.down === 0,
    m.plankLids
      ? `${m.plankLids.planks} planks, lid tris up ${m.plankLids.up} / inverted ${m.plankLids.down} `
        + `(${m.plankLids.downArea.toFixed(2)} mm2); per plank ${JSON.stringify(m.plankLids.per)}`
      : 'no plankLids measurement');
  bar('K1 mouth-run jog: flap face just under the chamfer top (top − 23.5) minus the rim '
    + 'wall (top − 15) = 2.15 ± 0.5 mm (R3-SNK-8 MODEL: M1 chamfer jog 2.15, spread 1.88–2.29 '
    + 'over the core azimuths; the flap leans 6.5° so the read is taken at the chamfer, not at '
    + 'z 10; was 1.5–3.0 on the plate5 ledge read) [red: 3f469029 no ledge (0)]',
    m.padStep !== null && m.padStep >= 0.00165 && m.padStep <= 0.00265,
    `flap r ${mm(m.rFlapRead)} - pad face r ${mm(m.rPadRead)} = ${mm(m.padStep)}`);
  bar('K2 skirt hangs from UNDER the pad: pad outer face minus skirt radius just '
    + 'under it 1.5-4.0 mm (Magnum root 2.6-2.8 inside the pad face) '
    + '[red: 3f469029 cone widens downward (-1.3)]',
    m.padOverhang !== null && m.padOverhang >= 0.0015 && m.padOverhang <= 0.0040,
    `pad outer r ${mm(m.rOutFace)} - skirt r under it ${mm(m.rUnderPad)} = ${mm(m.padOverhang)}`);
  bar('K3 top plateau within 0.7 mm of the top along the diagonal 43.1-49.6 mm '
    + '(R3-SNK-7 on the MODEL plate datum, junction law unchanged: top edge = rail '
    + 'face 113.2 − 15.6 (MODEL) + 0.31 = 97.9 → rFlat1 96.65 (MODEL offsets: face '
    + '+5.5, lean/round back −6.8), rFlat0 = pad face 45.9 + arc centre 8.1 = 54.0: '
    + 'flat 42.6 + shoulders 3.7 = 46.3 ± 3.25; the Magnum\'s own flat 38 is now the '
    + 'same class) [red: 1c4f0d06 69.8; d69b7d33 28.8 (hem-radius positioning)]',
    m.flatWidth !== null && m.flatWidth >= 0.0431 && m.flatWidth <= 0.0496,
    `plateau within 0.7 mm of the top: ${mm(m.flatWidth)}`);
  // ---- R3-SNK-6 JUNCTION rows (§R3c.15.2): both real tables run the leather
  // a little inside the rail's outer line at the cut and bring the skirt down
  // onto the rail's outer face plane; red on d69b7d33 (top edge −54.5, hem
  // 18 inside the apron)
  const jTop = m.jTopEdge !== null && m.jTopEdge !== undefined ? m.jTopEdge - m.railFaceLat : null;
  bar('J1 junction: leather top edge (plan outline at z top−1, the M1 R3 station) at the '
    + 'long-rail end plane sits 14.4-16.8 mm INSIDE the rail\'s outer face (MODEL 15.6, RULING-SNK-DATUM.md item 5: '
    + 'the Magnum read at z top−1, M4 cross-read 15.1 at z 40 ± 1; the XW101 photo 13.0 no longer governs; '
    + 'rail face = W/2 + CW + frameWidth − |cup z| = 113.2) [red: 1c4f0d06 −13.0; d69b7d33 −54.5]',
    jTop !== null && jTop >= -0.0168 && jTop <= -0.0144,
    `top edge ${mm(m.jTopEdge)} − rail face ${mm(m.railFaceLat)} = ${jTop === null ? '-' : mm(jTop)}`);
  const jHem = m.jHemLeg !== null && m.jHemLeg !== undefined ? m.jHemLeg - m.apronLat : null;
  bar('J2 junction: the hem\'s leg lands on the APRON plane within ±1.5 mm (MODEL: '
    + 'the Magnum hem meets its rail\'s outer face plane to 0.01 mm; apron = rail '
    + 'face − SNK_APRON_INSET; 0 since BODY-2 R4 = the flush plane, 113.2 at the rt cup) [red: d69b7d33 −18]',
    jHem !== null && Math.abs(jHem) <= 0.0015,
    `hem leg ${mm(m.jHemLeg)} − apron ${mm(m.apronLat)} = ${jHem === null ? '-' : mm(jHem)}`);
  // ---- LAW-PURCHASED-BASELINE rows (R3-SNK-5 §R3c.11): MODEL reads on the
  // Magnum II, red on the R3-SNK-3 tree 3f469029 (hem -105.5, no legs, 8 mm
  // teeth)
  bar('L1 hem tips at the PHOTO drop: lowest leather within [-106.8, -76.8] mm '
    + '(E5 -91.8 = rail top 40.18 (MODEL) − 132 (PHOTO, R3-SNK-BODY-1 r3_13: the official '
    + 'side elevation at 3.68 mm/px reads the hem 132 ±15 under the rail top at both ends, '
    + 'agreed by two independent reads; the retired MFR 148 was the same frame read on an '
    + 'unscaled montage); the Magnum\'s 107.3 is the overridden MODEL value) [red: 1c4f0d06 '
    + '-105.5 (now inside the wider band — the row\'s red arm is the r3_13 band\'s own '
    + 'edges); 3f469029 hem fold knots -> the row fires on the tooth depth via L5]',
    m.hemTipY !== null && m.hemTipY >= -0.1068 && m.hemTipY <= -0.0768,
    `lowest corner leather y ${mm(m.hemTipY)}`);
  // R3-SNK-6: the leg stand-off is the LEG LAW's own amount at the built
  // radius — rail-parallel line at ⟂ distance r0 − 0.31 read at 60 deg:
  // r0·(1/cos 15° − 1) − 0.31 (the Magnum's 3.1 at r 91; ours ≈ 4.0 at 123)
  const legLaw60 = (m.topR0 !== null && m.topR0 !== undefined) ? m.topR0 * (1 / Math.cos(Math.PI / 12) - 1) - 0.00031 : null;
  bar('L2 plan legs: the top plateau\'s outer edge at |phi| 60 deg stands off its '
    + 'phi-0 radius by the leg law\'s amount ± 1.6 mm (rail-parallel line at '
    + 'r0 − 0.31: r0·(1/cos15° − 1) − 0.31; Magnum legs.json 94.1/94.3 vs 91.0 at '
    + 'z 39.5 = 3.1 at r 91; R3-SNK-6 ours ≈ 4.0 at r 123) [red: 3f469029 body of '
    + 'revolution, 0]',
    m.legDelta60 !== null && legLaw60 !== null && Math.abs(m.legDelta60 - legLaw60) <= 0.0016,
    `outer top-edge r(60 deg) - r(0) = ${mm(m.legDelta60)} (law ${legLaw60 === null ? '-' : mm(legLaw60)} at r0 ${mm(m.topR0)})`);
  bar('L5 hem tooth pitch 8.5-10.0 mm (Magnum hem.json cusp pitch 5 deg = 9.24 mm '
    + 'at the hem radius; the form stays pinked per the official S101 page) '
    + '[red: 3f469029 8.0]',
    m.toothPitchRead !== null && m.toothPitchRead >= 0.0085 && m.toothPitchRead <= 0.0100,
    `tooth pitch read ${mm(m.toothPitchRead)} over |phi| <= 60 deg`);
  bar('C6 boot leather warm pale TAN (owner ruling c5260294606 CREAM family; '
    + 'R3-SNK-2 tan read 0xd39b83 — warm, R > 0xa0, R > B + 0x20)',
    m.bootHex !== null && ((m.bootHex >> 16) & 0xff) > 0xa0
    && ((m.bootHex >> 16) & 0xff) > ((m.bootHex) & 0xff) + 0x20,
    `boot albedo 0x${(m.bootHex ?? 0).toString(16)}`);
  // R3-SNK-10 (RULING (b)): the middle fall is the kernel's CEBP disc (R
  // 53.19 at 51.59, read live from pocketFallDiscs); the Ø 94–101 label band
  // (the 3.906 in opening chord misread as a hole) retires — red arm: the
  // e18e0122 bytes read Ø 99.2 and fire
  bar(`M1 middle fall WALL on the KERNEL disc: R ${mm(m.mFallR)} ± 1.0 (G.pockets; three table-side rays at y −15; spread ≤ 1.0) — red arm: the e18e0122 wall reads 49.6`,
    m.mRv !== null && Math.abs(m.mRv - m.mFallR) <= 0.001 && m.mRvSpread <= 0.001,
    `wall R ${mm(m.mRv)} (spread ${mm(m.mRvSpread)}); render export ${mm(m.mFallRender)}; from-above aperture ${mm(m.mHole)} (z/x mean — the slot clips x, record only)`);
  // R3-SNK-10 (RULING (a)): the wood end faces stand on the purchased Star
  // model's ± 41.92 planes (pocketFaceStations().uFaceM, MODEL; ± 1.0 = two
  // scan steps); the ± 54 ± 4 photo band retires — red arm: the e18e0122
  // bytes read 54.0 and fire
  // MODEL (Star): the purchased XingPai model's middle rail end planes, exact
  // cut planes ± 41.92 from the pocket axis (star-compare §R3c.19.1; INTAKE
  // §3a slot 83.84) — the gate's own constant, so the bar reds on a tree
  // whose export still says 54 (the first cut compared the tree to itself)
  const M2_SLOT_HALF = 0.04192;
  bar(`M2 middle wood end faces at ± ${mm(M2_SLOT_HALF)} mm (MODEL Star slot planes, ± 1.0; the tree's uFaceM ${mm(m.mSlotHalf)}) — red arm: the e18e0122 faces read 54.0`,
    m.mf1 !== null && m.mf2 !== null
    && Math.abs(m.mf1 - M2_SLOT_HALF) <= 0.001 && Math.abs(m.mf2 - M2_SLOT_HALF) <= 0.001
    && Math.abs(m.mSlotHalf - M2_SLOT_HALF) <= 0.0005,
    `faces at ${mm(m.mf1)} / ${mm(m.mf2)}`);
  // M3 — RE-DERIVED (R3-SNK-2): the middle's cloth fall face is the
  // table-side semicircle (Magnum: the slate back edge sits on the fall
  // centre line); the outward half below the tab is the cavity (lining |
  // cords). [red: card 18 — the outward tube read obPocketFallWall]
  bar('M3 middle throat at -45 mm: cloth fall face on the TABLE side, cavity '
    + '(lining | cords) on the OUTWARD side (R3-SNK-2; the tube fires)',
    m.mWallIn45 === 'obPocketFallWall'
    && ['obPocketLining', 'obPocketNet'].includes(m.mWall45),
    `inward -45: ${m.mWallIn45 ?? 'none'}; outward -45: ${m.mWall45 ?? 'none'}`);
  bar('B1 nothing above bed level inboard of the nose lines (r10 blocker 1)',
    Array.isArray(m.bedBad) && m.bedBad.length === 0,
    m.bedBad?.length
      ? `${m.bedBad.length} proud hits, first: ${JSON.stringify(m.bedBad[0])}`
      + ' (rev-12: obSnkPost at +20.5 mm on the playing bed)'
      : 'all inboard rays land at/below bed level');
  // W13 RE-DERIVATION (gate r16 P1-1 iii): the hem now OVERLAPS the
  // ring line BY MANDATE — the rev-4 ring-only fan count is retired
  // with its subject (the rev-18 14/64 threaded the OLD hem's tooth
  // gaps, which the r16 hem drop closes by design). The law's spirit
  // (the assembly must read from outside — never the W6 walled box)
  // splits into: the under-hem hardware SLIVER + BELL dominance over
  // box mass. The W6-box red basis fires on both (cap 0/64, box 64/64,
  // sliver 0/64).
  // W14 RE-DERIVATION (GH489-EXT-R1.2 letters E10/E18/E20): the brass
  // ring is INSIDE the leather by mandate (lace-sewn, −62.5) — the W13
  // ring-line sliver retired WITH ITS SUBJECT. The law's spirit (the
  // hanging assembly must read from outside, never a walled box) moves
  // below the hem where the sheet puts the visible hardware: wires,
  // free-hanging knit, ball-track.
  bar('B2a under-hem hardware ≥ 2/64 through the E9/E18 gap (grazing '
    + 'eye — A6/r2_7: the XW101-size skirt seals the S2b-height read '
    + 'by mandate; wires/knit/track below the −105.5 hem)',
    m.underHemSeen >= 2,
    `${m.underHemSeen}/64 under-hem sightlines reach wire/knit/track `
    + `(hist ${JSON.stringify(m.underHist)}; ring-line fan reads `
    + `${m.ringSeen}/64 hardware — leather by design)`);
  bar('B2b S2b bell dominance: obPocketCap ≥ 30/64 AND box classes '
    + '≤ 20/64 (the corner reads LEATHER, never a walled gold box)',
    m.bellSeen >= 30 && m.boxSeen <= 20,
    `bell ${m.bellSeen}/64, box ${m.boxSeen}/64 `
    + `(hist ${JSON.stringify(m.hangHist)}; corner ring band `
    + `[${m.ringBand?.join(', ')}])`);
  bar('B2c S2b boot face + under-hem sock band are first hits (W14: '
    + 'emboss = leather dressing E19; sock staked through the under-hem '
    + 'gap E18)',
    (m.bootHit === 'obPocketCap' || m.bootHit === 'obPocketEmboss'
      || m.bootHit === 'obPocketStitch')
    && /^obPocketNet/.test(m.sockHit ?? ''),
    `boot ray: ${m.bootHit ?? 'none'}, sock fan: ${m.sockHit ?? 'none'} `
    + `(fan ${JSON.stringify(m.sockFan)}; rev-12: both died on the post box; `
    + 'R3-SNK-5: 3 x 3 fan on the knotted lattice)');
  // B3 — RE-DERIVED (R3-SNK-2): the net's mouth is a SADDLE — on the
  // outward half the first course hangs from the leather flap (row-1
  // knots right under the flap edge: first knit on the outward 0.9 rv ray
  // within [−12, +4] mm), on the table side it is laced to the ring iron
  // (first knit within [−95, −70]). [red: card 18 — its collar top read
  // −54.5 on both sides]
  bar('B3 middle net mouth: row-1 knots under the flap edge (outward fan at +1.5 mm '
    + 'meets obPocketNet at r = rv + [6.8, 11.8] mm: row 1 3.2 mm outside the flap, '
    + 'R3-SNK-5) and the cords laced to the ring (inward fan at -75 meets '
    + 'obPocketNet at r = rv + [-5.5, 5.5] mm (R3-SNK-8 band; rv = the measured fall wall since R3-SNK-10), the course on the iron\'s inner side '
    + '+ coil + belly) (card 18: cap/ring first, no knots there)',

    // R3-SNK-5: row-1 knot centres sit 3.2 mm outside the flap face
    // (rFlap = rv + 6.1 → rv + 9.3; Magnum n6_topcourse) — the fan meets
    // the coil (radius 2.05) within rv + [6.8, 11.8]
    m.mMouthOut?.rs?.some((r) => r >= m.mRv + 0.0068
      && r <= m.mRv + 0.0118)
    // inward: the course hangs from the ring iron's INNER side (rRingIron
    // rv + 6 − tube 4 − cord 1.1 = rv + 0.9); the coil (2.05) and the
    // measured cord belly (p90 +2.3) put the first hit within rv + [−3.5, 5.5].
    // R3-SNK-8 (M2 two-family drape): at the ring plane the LEATHER-side
    // family of the middle stands at rv − 2.9 (55.90 − 0.237·64.5 +
    // 0.079·13.1 = 41.6 on the model → 46.75 on our row-1 datum vs rv
    // 49.61), the ring side at rv + 0.9 — the fan's first hits span both
    // families minus the coil: rv + [−5.5, 5.5]
    && m.mMouthIn?.rs?.some((r) => r >= m.mRv - 0.0055
      && r <= m.mRv + 0.0055),
    `outward +1.5 net r ${JSON.stringify(m.mMouthOut?.rs)} (others `
    + `${JSON.stringify(m.mMouthOut?.others)}); inward -75 net r `
    + `${JSON.stringify(m.mMouthIn?.rs)} (others ${JSON.stringify(m.mMouthIn?.others)}); `
    + `rv ${mm(m.mRv)} (the measured fall wall, R3-SNK-10)`);
  // ---- C7 casting gold MATERIAL FINGERPRINT (W13-FINISH review r1 P1) ----
  // The W9 cast band/sheen pixel pair demoted to records at W13 (the
  // bell shadows the shoulders at the S4 register — the plan-field
  // subject retired), so the shoulders' MATERIAL is gated here instead,
  // executably: the live obSnkCasting material's authored constants +
  // the procedural map/bump canvas CONTENT digests are pinned to the
  // W12-passed values (the r13 "casting CLOSED, do not touch gold" law).
  // A flat-decal / laminate / sheen regression must either change these
  // bytes (fires here) or change geometry (the C/F gates catch it); the
  // colour family stays gated by the mask-scoped posegate cast_hue bar.
  // review W13-FINISH r2 P1: the digest covers EVERY byte (a strided
  // sample left ~99.9% of the texels unpinned), and the pins extend to
  // the texture TRANSFORM/WRAP/COLORSPACE (a repeat change re-scales
  // the active sheen/relief with identical content bytes), the
  // emissive pair, material.side, and the casting GEOMETRY's baked
  // vertex-color + uv attribute contents (bakeGoldForm form shading —
  // pixel-active, previously unpinned).
  const fp = await chrome.eval(`(() => {
    // review W13-FINISH r3 P1: ALL casting meshes (8 shoulders), stable
    // sort by bounding-box centre, geometry digests over color + uv +
    // NORMAL per mesh chained into one running FNV each — a single
    // shoulder's baked-shading or normal drift can never hide behind
    // the first-found mesh
    // W14: obSnkCasting retired with the box (GH489-EXT-R1.2 vs-rev-19
    // delete table) — the snkGold authorship law re-targets the LEG-HEAD
    // blocks (obSnkPost, same material instance; E9)
    const casts = [];
    window.__dbg.scene.traverse((o) => {
      if (o.name === 'obSnkPost' && o.material
        && o.material.vertexColors === true) casts.push(o);
    });
    if (!casts.length) return JSON.stringify(null);
    for (const c of casts) c.geometry.computeBoundingBox();
    casts.sort((p, q) => {
      const a2 = p.geometry.boundingBox.getCenter(new (Object.getPrototypeOf(p.position).constructor)());
      const b2 = q.geometry.boundingBox.getCenter(new (Object.getPrototypeOf(q.position).constructor)());
      return (a2.x - b2.x) || (a2.z - b2.z);
    });
    const mat = casts[0].material;
    const fnv = (arr) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < arr.length; i++) {
        h ^= arr[i];
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h >>> 0;
    };
    const dig = (tex) => {
      const img = tex && tex.image;
      if (!img || !img.getContext) return null;
      const d = img.getContext('2d')
        .getImageData(0, 0, img.width, img.height).data;
      return [img.width, img.height, fnv(d),
        tex.repeat.x, tex.repeat.y, tex.offset.x, tex.offset.y,
        tex.rotation, tex.wrapS, tex.wrapT, tex.colorSpace];
    };
    const attrDig = (name) => {
      let count = 0, item = null, h = 0x811c9dc5;
      for (const c of casts) {
        const a = c.geometry.attributes && c.geometry.attributes[name];
        if (!a) return null;
        count += a.count; item = a.itemSize;
        const f = new Float32Array(a.array.buffer, a.array.byteOffset,
          a.array.length);
        const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
        for (let i = 0; i < u.length; i++) {
          h ^= u[i];
          h = Math.imul(h, 0x01000193) >>> 0;
        }
      }
      return [count, item, h >>> 0];
    };
    const matUuids = new Set(casts.map((c) => c.material.uuid));
    return JSON.stringify({
      color: mat.color.getHex(), rough: mat.roughness,
      metal: mat.metalness, bumpScale: mat.bumpScale,
      env: mat.envMapIntensity, vc: mat.vertexColors === true,
      emissive: mat.emissive ? mat.emissive.getHex() : null,
      emissiveI: mat.emissiveIntensity, side: mat.side,
      map: dig(mat.map), roughMap: dig(mat.roughnessMap),
      bump: dig(mat.bumpMap),
      // review W15 r2 P2: the shade-articulation floor rides
      // emissiveMap — a dropped/replaced emissive canvas must fire
      emissiveMapDig: dig(mat.emissiveMap),
      meshes: casts.length, oneMat: matUuids.size === 1,
      geoColor: attrDig('color'), geoUv: attrDig('uv'),
      geoNormal: attrDig('normal'),
    });
  })()`).then(JSON.parse);
  const FP_PIN = {
    // measured live at the W13-FINISH head (the W12-passed gold rides
    // unchanged: git-diff 52a2dc62..HEAD touches no snkGold bytes);
    // review r2 P1 hardening: FULL-content FNV digests + texture
    // repeat/offset/rotation/wrap/colorSpace + emissive pair + side +
    // the baked geometry color/uv attribute digests
    // W15 re-pin (gate r18 P1-1): base 0xc98a32 + the hue-locked gold
    // emissive floor 0xc98a32 @ 0.24 (the W12 0xc9761c/no-emissive gold
    // retired with the green-env compensation — warm-room content
    // correction, posegate w15 colour bars own the rendered windows);
    // map/bump/rough digests and the geometry digests ride unchanged.
    // W16 re-pin (gate r19 P2-1): the emissive floor trims to
    // 0xc9964f @ 0.16 — SAME locked hue 35, sat 0.75 → 0.61 (the shade
    // fill models the broad-spectrum room ambient a real casting
    // reflects) so the masked dark registers (S2b rib / S5 near legs)
    // land inside the ADOPTED over-warm guard (posegate w16 bars own
    // the rendered windows); base colour + every digest ride unchanged.
    color: 0xc98a32, rough: 0.85, metal: 0.16, bumpScale: 3.4,
    env: 0.35, vc: true, emissive: 0xc9964f, emissiveI: 0.16, side: 0,
    map: [256, 256, 2762072912, 6.25, 6.25, 0, 0, 0, 1000, 1000, 'srgb'],
    roughMap: [64, 64, 4093571129, 9.090909090909092, 9.090909090909092,
      0, 0, 0, 1000, 1000, ''],
    bump: [256, 256, 4098990785, 6.25, 6.25, 0, 0, 0, 1000, 1000, ''],
    // W15: emissiveMap === goldMap (the satin field carries the shade
    // fill — the emissive floor may never flatten to a wash)
    emissiveMapDig: [256, 256, 2762072912, 6.25, 6.25, 0, 0, 0, 1000,
      1000, 'srgb'],
    // W14 re-pin: 4 leg-head blocks (one per corner; the 8 casting
    // shoulders retired) — material constants + texture digests are
    // byte-identical to the W12-passed gold (snkGold untouched); only
    // the subject geometry digests move with the E9 rebuild
    // 489 ENV ROUND re-stamp (the pre-existing C7 drift, mechanism
    // NAMED): W15 moved the corner-leg centre (SNK.legInEnd 0.230 →
    // 0.285 — the net-clearance correction) and the leg-head blocks
    // translated with it. ExtrudeGeometry UVs are ABSOLUTE plan
    // coordinates (a translation re-bytes them) and recomputed normals
    // differ at the last ulp under translated float cancellation, while
    // bakeGoldForm's colors are bbox-RELATIVE and cancelled the shift —
    // exactly the observed drift set {geoUv, geoNormal} with geoColor
    // (and count 192 / every material byte) holding. The W15 round
    // re-pinned the material and forgot the geometry stamps. Subject
    // verified unchanged (same topology, same baked shading law, same
    // gold authorship); digests re-stamped at the live tree — any
    // FUTURE drift fires exactly as before.
    // 489 BLOCKER-CURE re-pin (B11 "floating legs"): the four
    // INTERMEDIATE legs gain the same E9 head-block construction the
    // corners carry (dossier §2.3: the gold head + flute panel is a
    // structural member rising from EVERY leg; press-4K + bare-frame
    // photos dress all eight stations) — meshes 4 → 8 and the merged
    // geometry digests move with the four new BoxGeometry blocks; every
    // material byte and texture digest rides unchanged (snkGold
    // authorship untouched).
    // LAW-PURCHASED-BASELINE (R3-SNK-5 r3_4): the leg-head top is now
    // DERIVED (SNK.hemPlane − 36 = −141.5, no literal) — the same number,
    // so the head blocks' geometry digests hold byte-for-byte (a MODEL-hem
    // build inside this round moved the head to −96.3 and drifted geoUv
    // to 3169084917 — the named W15 mechanism — and was retracted).
    // R3-SNK-7 (RULING-SNK-DATUM.md item 3): the rail top is MODEL 40.18
    // and every frame depth is rail-top-relative, so the hem plane and
    // the E9 head-block top translate −6.82 mm in y with it (−141.5 →
    // −148.3 class). The same named W15 mechanism re-bytes geoUv (the
    // extrude UVs carry the translated coordinate) while count 336,
    // geoNormal and the bbox-relative geoColor hold and every material /
    // texture digest rides unchanged — re-stamped at the live tree.
    // R3-SNK-BODY-1 (r3_13): the head block's top is the recess step (PHOTO 129
    // under the rail top; was hemPlane − 36) and its foot the pilaster collar
    // (PHOTO WST 428; unchanged pin, moved with the rows) — the extrude DEPTH
    // changed, so geoUv (absolute plan UVs over a re-lofted side) and geoNormal
    // re-byte while count 336, the bbox-relative geoColor and every material /
    // texture digest hold — the named W15 mechanism, re-stamped at the live tree.
    meshes: 8, oneMat: true,
    // R3-SNK-BODY-2: the apron inset went 3 → 0 (MODEL Magnum + PHOTO, R4), so the
    // plank/apron datum AX/AZ moved 3 mm outward and the head blocks translated
    // with it — the named W15 mechanism again (geoUv / geoNormal re-byte,
    // count 336, geoColor and every material digest hold); re-stamped.
    geoColor: [336, 3, 1381076189], geoUv: [336, 2, 2202930765],
    geoNormal: [336, 3, 2892497669],
  };
  const fpBad = fp === null ? ['no obSnkCasting material']
    : Object.keys(FP_PIN).filter((k) =>
      JSON.stringify(fp[k]) !== JSON.stringify(FP_PIN[k]));
  bar('C7 gold material fingerprint (W14 re-target: the casting retired '
    + 'with the box — the LEG-HEAD carries the W12-passed snkGold '
    + 'authorship; constants + map/bump content digests pinned)',
    fpBad.length === 0,
    fp === null ? 'no obSnkPost gold material in the scene'
      : `live ${JSON.stringify(fp)}${fpBad.length
        ? ' — drifted keys ' + JSON.stringify(fpBad) : ' == pinned'}`);
  // ---- craft R2 (#625): STITCH LIE — the thread lies WHERE THE LEATHER IS.
  // The dash rows were seated on IDEAL sections (12.5° skirt cone, unmelted
  // dome tail, a fixed crest − 2.8 mm at the middles) and stood 1.35–1.55 mm
  // proud of the built leather (rope, not stitch); at the middle centre band
  // the crown row hovered ≈ 5 mm in the air (the legacy section folds back
  // over the 15 mm band). No bar read the gap, and the middle rows were not
  // judged at all. These two rows read the LIVE gap between a dash's outer
  // face and the leather behind it by raycast, at both families:
  //   C5d corner: radial ray (outside → cup axis) through each meet-row dash
  //       centre and a vertical ray through each crown-row dash centre —
  //       first hit obPocketStitch/obPocketStitch2, next hit obPocketCap;
  //       gap ≤ 0.9 mm (0.35 mm pressed-thread law + the box's own cross
  //       section on a 12.5°/40° surface), every dash;
  //   M5  middle (+z): the same two rays (crown row vertical, meet row
  //       radial through the wrap-down face); gap ≤ 0.9 mm, every dash.
  // A dash the ray misses (buried under the leather) is counted MISSING and
  // fails the row: the thread must read. Red-armed on 031a0f68 (--web on a
  // git-archive of that tree, --expect-red): C5d reads 1.3–1.6 mm, M5 reads
  // up to ≈ 5 mm.
  // craft R3-SNK (model-anchored rebuild): the rows moved with the
  // construction — row 1 (obPocketStitch) is the NET SEAM on the FLAP's
  // mouth face (proud TOWARD the mouth: the gap ray now runs from the cup
  // axis OUTWARD), row 2 (obPocketStitch2) the skirt row on the outer
  // face (proud outward: radial ray from outside inward, both families).
  // The dash is the Magnum's 10.36 × 3.47 mm oval (a flattened capsule,
  // 0.5 mm proud, the rest pressed in) — the per-dash vertex stride is
  // read from the mesh's userData.obDash hint (fallback: the old 24-vertex
  // box) and the dash filter selects the 9–11.5 mm class ≥ 2.8 mm tall.
  // The 0.9 / −0.6 mm gap law is unchanged.
  {
    const st = await chrome.eval(`(async () => {
      const THREE = await import('./vendor/three.module.min.js');
      const T = await import('./scene/table.js');
      const G = T.makeGeom('wpbsa_snooker_12ft');
      const scene = window.__dbg.scene;
      const rc = new THREE.Raycaster();
      const CAST = [scene.getObjectByName('obTable')]; // FIX4 (2): the table group is the instrument basis here too (main's hardening, applied at the #637 main merge)
      const cups = (T.pocketPlateDatums ?? T.pocketVisualFalls) ? (T.pocketPlateDatums ?? T.pocketVisualFalls)('wpbsa_snooker_12ft') : null;
      const cupRT = cups ? cups.reduce((a, c) => (c.x + c.z > a.x + a.z ? c : a)) : null;
      const cupM = cups ? cups.reduce((a, c) => (Math.abs(c.x) < Math.abs(a.x) && c.z > 0 ? c : a), cups[0]) : null;
      const meshes = {};
      scene.traverse((o) => {
        if (o.isMesh && (o.name === 'obPocketStitch' || o.name === 'obPocketStitch2')) meshes[o.name] = o;
      });
      const boxes = (o, sel) => {
        const pos = o.geometry.attributes.position; const out = [];
        const V = o.userData?.obDash?.verts > 0 ? o.userData.obDash.verts : 24;
        for (let i = 0; i + V <= pos.count; i += V) {
          let sx = 0, sy = 0, sz = 0, mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
          let mny = 1e9, mxy = -1e9;
          for (let k = 0; k < V; k++) {
            const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
            sx += x; sy += y; sz += z; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x);
            mnz = Math.min(mnz, z); mxz = Math.max(mxz, z);
            mny = Math.min(mny, y); mxy = Math.max(mxy, y);
          }
          const c = { x: sx / V, y: sy / V, z: sz / V };
          // DASHES only (R3: the 10.36 × 3.47 mm Magnum oval, ≥ 2.8 mm
          // tall on its face). Anything else riding the mesh would find
          // the far leather sheet as its "next cap" and fail the row for
          // the wrong reason (the first cut of this instrument did that).
          // R3-SNK-9 (MODEL M5): the dash is a round Ø 1.67 tube bowed
          // outward — plan footprint 10.26 chord + Ø ≈ 11.9, height 1.67
          // (+ 0.19 sag) — so the filter takes ext [9, 12.5] and height ≥ 1.4
          const ext = Math.hypot(mxx - mnx, mxz - mnz);
          if (ext < 0.009 || ext > 0.0125 || (mxy - mny) < 0.0014 || !sel(c)) continue;
          out.push(c);
        }
        return out;
      };
      const gapRay = (origin, dir, rowName) => {
        rc.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
        const hits = rc.intersectObjects(CAST, true)
          .filter((h) => h.object.visible !== false && h.object.isMesh);
        const iS = hits.findIndex((h) => h.object.name === rowName);
        if (iS < 0) return null;
        // SIGNED gap to the NEAREST leather hit on this ray, either side of
        // the dash's first face: + = the dash face stands off the leather,
        // − = the leather is crossed before the dash (dash inset). A dash
        // that straddles the surface reads its true proud height.
        const dS = hits[iS].distance;
        let best = null;
        for (const h of hits) {
          if (h.object.name !== 'obPocketCap') continue;
          const g = h.distance - dS;
          if (best === null || Math.abs(g) < Math.abs(best)) best = g;
        }
        return best;
      };
      const judge = (cup, fam) => {
        const near = (c) => Math.hypot(c.x - cup.x, c.z - cup.z) < 0.16
          && (fam === 'corner' ? (c.x > 0 && c.z > 0) : Math.abs(c.x) < 0.2 && c.z > 0);
        const res = {};
        // R3-SNK-9 (RULING R-S8-1): TWO rows share obPocketStitch — the
        // flap-face seam row (r < 70 mm about the cup, proud toward the
        // mouth → judged INWARD) and the outer row (proud outward); the
        // mode is chosen per dash by its radius
        for (const [rowName, modeAll] of [['obPocketStitch', 'byRadius']]) {
          const o = meshes[rowName]; if (!o) { res[rowName] = { n: 0, missing: 0, max: null, min: null }; continue; }
          const bs = boxes(o, near); let mx = -1, mn = 1, missing = 0; const gaps = [];
          for (const c of bs) {
            let g;
            const dx = c.x - cup.x, dz = c.z - cup.z, r = Math.hypot(dx, dz) || 1;
            const mode = modeAll === 'byRadius' ? (r < 0.070 ? 'inward' : 'outward') : modeAll;
            if (mode === 'inward') {
              // flap seam: proud toward the mouth — ray from the cup side
              g = gapRay({ x: c.x - (dx / r) * 0.02, y: c.y, z: c.z - (dz / r) * 0.02 }, { x: dx / r, y: 0, z: dz / r }, rowName);
            } else {
              g = gapRay({ x: c.x + (dx / r) * 0.02, y: c.y, z: c.z + (dz / r) * 0.02 }, { x: -dx / r, y: 0, z: -dz / r }, rowName);
            }
            if (g === null) { missing++; continue; }
            gaps.push(g); mx = Math.max(mx, g); mn = Math.min(mn, g);
          }
          gaps.sort((a, b) => a - b);
          res[rowName] = { n: bs.length, missing, max: gaps.length ? mx : null,
            min: gaps.length ? mn : null,
            med: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null };
        }
        return res;
      };
      return JSON.stringify({ corner: cupRT ? judge(cupRT, 'corner') : null,
        middle: cupM ? judge(cupM, 'middle') : null });
    })()`, true).then(JSON.parse);
    const mmv = (v) => (v === null || v === undefined ? 'n/a' : (v * 1000).toFixed(2) + 'mm');
    // R3-SNK-9 (MODEL M5): the thread is a round tube bowed OUTWARD — its
    // middle stands 2.21 (seam) / 2.17 (outer) proud of the leather with
    // the tube ends at the skin; the radial ray through a dash's centroid
    // meets the tube's mid outer surface, so the gap reads the relief:
    // band [1.3, 2.9] (the reads ± the tube's radius 0.84); no dash may be
    // missing (a dash whose ray finds no leather behind it floats). The
    // #625 flattened-capsule law (≤ 0.9) retires with the photo row.
    const rowOk = (r) => r && r.n >= 6 && r.missing === 0 && r.max !== null
      && r.max <= 0.0029 && r.min >= 0.0013;
    const fmt = (r) => r ? `n ${r.n}, missing ${r.missing}, gap max ${mmv(r.max)} min ${mmv(r.min)} med ${mmv(r.med)}` : 'no cups';
    bar('C5d corner stitch LIE — the bowed round thread stands 1.3–2.9 mm proud '
      + 'at mid-dash on BOTH rows (R3-SNK-9 MODEL M5: 2.21 seam / 2.17 outer; '
      + 'the #625 0.9 capsule law retires), no dash without leather behind it',
      !!st.corner && rowOk(st.corner.obPocketStitch),
      `skirt ${fmt(st.corner?.obPocketStitch)}`);
    bar('M5 middle stitch LIE — same law at the +z middle (R3-SNK-3: the one '
      + 'tongue row; the old crown row hovered ≈ 5 mm on 031a0f68)',
      !!st.middle && rowOk(st.middle.obPocketStitch),
      `skirt ${fmt(st.middle?.obPocketStitch)}`);
  }
  // FIX4 (4): the signature after the last instrument must equal the one the instruments started on
  if (__PERTURB === 'pocket-write-during') await chrome.eval(`(() => { const m = window.__dbg.scene.getObjectByName('obPocketCap'); m.geometry.getAttribute('position').needsUpdate = true; return true; })()`);
  if (__PERTURB === 'preview-write-during') await chrome.eval(`(() => { let n = 0; window.__dbg.scene.getObjectByName('obAimPreview').traverse((o) => { if (o.isMesh) { for (const a of Object.values(o.geometry.attributes)) { const src = a.isInterleavedBufferAttribute ? a.data : a; src.needsUpdate = true; } n++; } }); if (!n) throw new Error('no aim-preview mesh to write'); return n; })()`);
  const __sigAfter = String(await chrome.eval(__SIG_TABLE));
  if (__PERTURB === 'early-sample') {
    const st2 = await __awaitSettle(__evalSig, { tag: 'check-pocket-construction' });
    const settled = String(await chrome.eval(__SIG_TABLE));
    const movedDuring = __sigAfter !== __sigBefore, movedAfter = settled !== __sigAfter;
    if (movedDuring || movedAfter) {
      throw __refusal('check-pocket-construction', 'early-sample: the instruments read a scene still being written — the geometry signature '
        + (movedDuring ? 'moved while the instruments ran' : '') + (movedDuring && movedAfter ? ' and ' : '')
        + (movedAfter ? `moved again after them (${st2.changes} change(s) until +${st2.lastChangeMs} ms)` : '')
        + `; the settle law held ${st2.ms} ms after the last instrument; no bar is printed`);
    }
    console.log('[check-pocket-construction] perturb early-sample: the geometry signature did NOT move after the sample — the plant did not fire on this scene');
  } else if (__sigAfter !== __sigBefore) {
    throw __refusal('check-pocket-construction', 'the geometry signature changed while the instruments ran — the scene was still being written; no bar is printed');
  }
  for (const line of __lines) console.log(line); // FIX4 (6): every bar and INFO row, only now
} catch (e) {
  if (e && e.refused) { console.error(e.message); __refused = 3; } else throw e;
} finally {
  chrome.close();
  await stopStaticServer(server);
}
if (__refused) process.exit(__refused);

if (outPath) {
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  let tree = null;
  let dirty = null;
  let webTree = null;
  try {
    tree = execSync('git rev-parse HEAD', {
      cwd: path.dirname(webDir), encoding: 'utf8' }).trim();
    // review W11 r12 P2: the web/ TREE OBJECT hash — the checker can
    // bind the report to the exact reviewed web bytes (a commit sha
    // alone lets an older green report survive later web regressions)
    webTree = execSync('git rev-parse HEAD:web', {
      cwd: path.dirname(webDir), encoding: 'utf8' }).trim();
    // review W11 r11 P2 (same law as check-corner-form): record whether
    // the served web/ carries uncommitted bytes
    dirty = execSync('git status --porcelain -- web/', {
      cwd: path.dirname(webDir), encoding: 'utf8' }).trim() !== '';
  } catch { /* non-git web dir: tree stays null, web path is the basis */ }
  const crypto = await import('node:crypto');
  const toolSha = crypto.createHash('sha256').update(
    fs.readFileSync(new URL(import.meta.url).pathname)).digest('hex')
    .slice(0, 12);
  // review CURE-R10 land r1 P2: the C14 verdict depends on the imported
  // helper's bytes, so the report must bind them too — an unchanged
  // tool_sha12 + web_tree alone would let an old report survive a helper
  // change. Reported as a separate field (not folded into tool_sha12) so
  // existing consumers that recompute the gate file's own sha still match.
  const c14Sha = crypto.createHash('sha256').update(
    fs.readFileSync(new URL('./c14-disjoint.mjs', import.meta.url).pathname))
    .digest('hex').slice(0, 12);
  // GH-568: the M4 verdicts depend on the concordance helper's bytes —
  // bound for the same reason as c14_sha12
  const mjSha = crypto.createHash('sha256').update(
    fs.readFileSync(new URL('./midjaw-concord.mjs', import.meta.url).pathname))
    .digest('hex').slice(0, 12);
  fs.writeFileSync(outPath, JSON.stringify({
    tool: 'tools/render/check-pocket-construction.mjs',
    occl: occlReport, // SNK-R32: the settled aOccl digests (OCCL-DETERMINISM) for the battery's three-load read
    tool_sha12: toolSha,
    c14_helper: 'tools/render/c14-disjoint.mjs', c14_sha12: c14Sha,
    mj_helper: 'tools/render/midjaw-concord.mjs', mj_sha12: mjSha,
    src_dirty: dirty,
    web: webDir, tree, web_tree: webTree, expect_red: expectRed,
    bars: bars.map(([name, ok, detail]) => ({ bar: name, ok, detail })),
    // MEASURED-only rows: real numbers, no verdict. They never touch
    // fail_count, and a reader can tell them from bars by the key alone.
    infos: infos.map(([name, detail]) => ({ info: name, detail })),
    // R3-SNK-12: the raw N4 / N6 / N7 / N8 evidence - all 12 rays with
    // distance, hit object name, hit azimuth and |alpha| class, plus
    // rs.length, the miss count and the per-class {n, min, med, max, r[]}.
    // Dumped so those verdicts can be re-derived from the report alone.
    net_rays: netDump,
    fail_count: bars.filter(([, ok]) => !ok).length,
  }, null, 1));
  console.log(`report -> ${outPath}`);
}
if (expectRed) {
  const reds = bars.filter(([, ok]) => !ok).map(([n]) => n);
  if (reds.length === 0) {
    console.error('\nEXPECT-RED: every construction bar PASSED on the '
      + 'pre-fix tree — the gate cannot red; FAIL');
    process.exit(1);
  }
  console.log(`\nEXPECT-RED OK: ${reds.length}/${bars.length} bars red on `
    + `the pre-fix tree:\n  ${reds.join('\n  ')}`);
  process.exit(0);
}
if (failures) {
  console.error(`\ncheck-pocket-construction: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\ncheck-pocket-construction: all bars OK');
